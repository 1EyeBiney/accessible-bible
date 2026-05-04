/**
 * jit/vault.js
 * Local API-key vault for the JIT Study Plan feature.
 *
 * Contract (locked in .rules/jit-feature.md):
 *   getKey(provider)            -> Promise<string | null>
 *   setKey(provider, rawKey)    -> Promise<string>  // resolves with redacted display
 *   clearKey(provider)          -> Promise<void>
 *   redactedDisplay(provider)   -> Promise<string>  // "•••• 7g4Q" or "Not configured"
 *   hasKey(provider)            -> Promise<boolean>
 *
 * INVARIANTS:
 *   - whenDbReady() awaited at the top of every tx.
 *   - rawKey NEVER logged, NEVER included in thrown error messages,
 *     NEVER returned in any stringified form except the live string itself.
 *   - On any tx error, reject with a generic Error — no key payload attached.
 *   - Plaintext storage today; encryption envelope reserved (`keyEnvelope` field).
 *   - Headless: this module performs ZERO TTS / UI calls. Callers announce.
 */

import { db, whenDbReady } from '../db.js';
import { API_KEYS_STORE } from '../config.js';

// --- Internal helpers -------------------------------------------------------

function readRecord(provider) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([API_KEYS_STORE], 'readonly');
        const req = tx.objectStore(API_KEYS_STORE).get(provider);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(new Error('Vault read failed.'));
    });
}

function writeRecord(record) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([API_KEYS_STORE], 'readwrite');
        tx.objectStore(API_KEYS_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Vault write failed.'));
    });
}

function deleteRecord(provider) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([API_KEYS_STORE], 'readwrite');
        tx.objectStore(API_KEYS_STORE).delete(provider);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Vault clear failed.'));
    });
}

/**
 * Last-4 redaction. Used only for display strings returned to callers.
 */
function redact(rawKey) {
    if (!rawKey || typeof rawKey !== 'string' || rawKey.length < 4) {
        return '••••';
    }
    return `•••• ${rawKey.slice(-4)}`;
}

// --- Public API -------------------------------------------------------------

/**
 * Returns the raw key string for a provider, or null if none configured.
 * Caller (orchestrator) is expected to branch on null and throw AuthError.
 */
export async function getKey(provider) {
    if (!provider || typeof provider !== 'string') {
        throw new Error('Vault: provider name required.');
    }
    await whenDbReady();
    const record = await readRecord(provider);
    return record?.rawKey ?? null;
}

/**
 * Persists the key for a provider. Resolves with the redacted display
 * string so the caller can route a TTS-safe confirmation. Never returns
 * or throws the raw key.
 */
export async function setKey(provider, rawKey) {
    if (!provider || typeof provider !== 'string') {
        throw new Error('Vault: provider name required.');
    }
    if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
        throw new Error('Vault: empty key rejected.');
    }
    await whenDbReady();
    const trimmed = rawKey.trim();
    const record = {
        provider,                  // keyPath
        rawKey: trimmed,           // plaintext today
        keyEnvelope: null,         // reserved for future encryption-at-rest
        savedAt: Date.now(),
    };
    await writeRecord(record);
    return redact(trimmed);
}

/**
 * Removes the stored key for a provider. Idempotent.
 */
export async function clearKey(provider) {
    if (!provider || typeof provider !== 'string') {
        throw new Error('Vault: provider name required.');
    }
    await whenDbReady();
    await deleteRecord(provider);
}

/**
 * Returns a TTS-safe redacted string for menu display.
 * Never includes the full key. Falls through to "Not configured."
 */
export async function redactedDisplay(provider) {
    if (!provider || typeof provider !== 'string') {
        return 'Not configured';
    }
    await whenDbReady();
    const record = await readRecord(provider);
    if (!record || !record.rawKey) return 'Not configured';
    return redact(record.rawKey);
}

/**
 * Convenience boolean for orchestrator pre-call gating.
 */
export async function hasKey(provider) {
    const key = await getKey(provider);
    return typeof key === 'string' && key.length > 0;
}
