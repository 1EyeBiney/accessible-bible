/**
 * jit/planCache.js
 * Validated-study-plan cache backed by the studyPlans IndexedDB store.
 *
 * Contract (locked in .rules/jit-feature.md):
 *   buildCacheKey({ topic, filter, model, schemaVersion, manifestId }) -> string
 *   get(cacheKey)                       -> Promise<Object | null>   // re-validates on read
 *   put(cacheKey, plan, meta = {})      -> Promise<void>
 *   evictIfOverCap()                    -> Promise<number>          // returns # evicted
 *
 * INVARIANTS:
 *   - whenDbReady() awaited at the top of every tx.
 *   - PlanValidator re-runs on every get(); validation failure → record dropped + null returned.
 *   - evictIfOverCap fired async after successful get and put; never blocks the caller.
 *   - Soft cap = PLAN_CACHE_SOFT_CAP. Eviction is lazy LRU via lastAccessed index.
 *   - Headless: zero TTS / UI calls. Caller announces.
 *   - Cache key composition lives entirely inside buildCacheKey; callers never hand-craft.
 */

import { db, whenDbReady, memoryCache } from '../db.js';
import { STUDYPLANS_STORE, PLAN_CACHE_SOFT_CAP, SCHEMA_VERSION } from '../config.js';
import { PlanValidator } from './PlanValidator.js';

// --- Key composition --------------------------------------------------------

function slugify(part) {
    if (part == null) return '';
    return String(part)
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Composite cache key. Order locked: topic|filter|count|model|schemaVersion|manifestId.
 * Bumping SCHEMA_VERSION cleanly invalidates the entire cache.
 */
export function buildCacheKey({ topic, filter, count, model, schemaVersion, manifestId }) {
    if (!topic || typeof topic !== 'string') {
        throw new Error('planCache: topic required for cache key.');
    }
    const safeCount = Number.isFinite(Number(count)) ? String(Number(count)) : '5';
    return [
        slugify(topic),
        slugify(filter || 'none'),
        safeCount,
        slugify(model || 'unknown'),
        slugify(schemaVersion || SCHEMA_VERSION),
        slugify(manifestId || 'default'),
    ].join('|');
}

// --- Internal tx helpers ----------------------------------------------------

function readRecord(cacheKey) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STUDYPLANS_STORE], 'readonly');
        const req = tx.objectStore(STUDYPLANS_STORE).get(cacheKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(new Error('planCache read failed.'));
    });
}

function writeRecord(record) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STUDYPLANS_STORE], 'readwrite');
        tx.objectStore(STUDYPLANS_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('planCache write failed.'));
    });
}

function deleteRecord(cacheKey) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STUDYPLANS_STORE], 'readwrite');
        tx.objectStore(STUDYPLANS_STORE).delete(cacheKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('planCache delete failed.'));
    });
}

function countRecords() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STUDYPLANS_STORE], 'readonly');
        const req = tx.objectStore(STUDYPLANS_STORE).count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => reject(new Error('planCache count failed.'));
    });
}

// --- Public API -------------------------------------------------------------

/**
 * Reads, re-validates, and bumps lastAccessed. Returns null on miss or
 * validation failure (the offending record is also evicted).
 */
export async function get(cacheKey) {
    if (!cacheKey) return null;
    await whenDbReady();
    const record = await readRecord(cacheKey);
    if (!record || !record.plan) return null;

    // Re-validate against the active memoryCache. Hallucinations or
    // stale plans referencing missing verses MUST be dropped.
    try {
        const validator = new PlanValidator(memoryCache);
        const sanitized = validator.validate(record.plan);
        // Bump lastAccessed for LRU. Fire-and-forget; do not gate the return.
        writeRecord({ ...record, plan: sanitized, lastAccessed: Date.now() })
            .catch(() => { /* swallow; cache write is non-critical */ });
        // Async eviction sweep, never blocks.
        evictIfOverCap().catch(() => { /* non-critical */ });
        return sanitized;
    } catch (err) {
        // Validation failed: drop the poisoned record so the next call refetches.
        console.warn(`[planCache] Poisoned record evicted for key "${cacheKey}":`, err?.message || err);
        deleteRecord(cacheKey).catch(() => { /* non-critical */ });
        return null;
    }
}

export async function put(cacheKey, plan, meta = {}) {
    if (!cacheKey) throw new Error('planCache: cacheKey required.');
    if (!plan || typeof plan !== 'object') throw new Error('planCache: plan required.');
    await whenDbReady();
    const record = {
        cacheKey,                 // keyPath
        plan,
        meta,
        savedAt: Date.now(),
        lastAccessed: Date.now(),
    };
    await writeRecord(record);
    // Enforce soft cap even when the user only writes new plans without re-reading.
    evictIfOverCap().catch(() => { /* non-critical */ });
}

/**
 * Lazy LRU sweep. Walks the lastAccessed index in ascending order and
 * deletes the oldest records until count <= PLAN_CACHE_SOFT_CAP.
 * Resolves with the number of records evicted.
 */
export async function evictIfOverCap() {
    await whenDbReady();
    const total = await countRecords();
    if (total <= PLAN_CACHE_SOFT_CAP) return 0;
    const targetEvict = total - PLAN_CACHE_SOFT_CAP;
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STUDYPLANS_STORE], 'readwrite');
        const idx = tx.objectStore(STUDYPLANS_STORE).index('lastAccessed');
        const cursorReq = idx.openCursor();
        let evicted = 0;
        cursorReq.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor || evicted >= targetEvict) return;
            cursor.delete();
            evicted += 1;
            cursor.continue();
        };
        tx.oncomplete = () => resolve(evicted);
        tx.onerror = () => reject(new Error('planCache eviction failed.'));
    });
}

/**
 * Library listing helper (v69.0). Returns every cached record sorted by
 * lastAccessed DESC. Headless: NO validation here — the Library UI will
 * lazily re-validate when a plan is actually selected. This keeps the
 * listing fast even when the cache holds dozens of plans.
 *
 * Each entry shape: { cacheKey, plan, meta, savedAt, lastAccessed }
 */
export async function getAllSorted() {
    await whenDbReady();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STUDYPLANS_STORE], 'readonly');
        const idx = tx.objectStore(STUDYPLANS_STORE).index('lastAccessed');
        // Cursor in 'prev' direction = lastAccessed DESC (newest first).
        const cursorReq = idx.openCursor(null, 'prev');
        const out = [];
        cursorReq.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;
            if (cursor.value && cursor.value.plan) out.push(cursor.value);
            cursor.continue();
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(new Error('planCache list failed.'));
    });
}

/**
 * Library deletion (v69.1). Removes a single record from the
 * STUDYPLANS_STORE by cacheKey. Headless: caller (keyboard.js) owns the
 * TTS announcement and any UI refresh. Resolves silently when the key
 * does not exist (idempotent).
 */
export async function remove(cacheKey) {
    if (!cacheKey || typeof cacheKey !== 'string') {
        throw new Error('planCache.remove: cacheKey required.');
    }
    await whenDbReady();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STUDYPLANS_STORE], 'readwrite');
        const store = tx.objectStore(STUDYPLANS_STORE);
        store.delete(cacheKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('planCache delete failed.'));
    });
}
