/**
 * orchestrator.js
 * The single entry point for generating JIT Study Plans.
 * Acts as the 'Inner Wall' of the double-wall try/catch architecture.
 */

import { GeminiProvider } from './GeminiProvider.js';
import { PlanValidator } from './PlanValidator.js';
import { classifySensitivity, loadCuratedFallback } from './sensitivity.js';
import { StudyPlanError, AuthError } from './errors.js';
import { getKey } from './vault.js';
import { buildCacheKey, get as cacheGet, put as cachePut } from './planCache.js';
import { memoryCache } from '../db.js';
import { SCHEMA_VERSION, GEMINI_MODEL } from '../config.js';

const ACTIVE_PROVIDER = 'gemini';
const VERSE_COUNT_MIN = 3;
const VERSE_COUNT_MAX = 15;
const VERSE_COUNT_DEFAULT = 5;

function clampVerseCount(n) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v)) return VERSE_COUNT_DEFAULT;
    return Math.min(VERSE_COUNT_MAX, Math.max(VERSE_COUNT_MIN, v));
}

export async function generateStudyPlan(topic, filter, verseCount, manifestId, { signal } = {}) {
    const safeCount = clampVerseCount(verseCount);

    // 1. Synchronous Safety Check — run on BOTH topic and filter.
    //    Filter is a second prompt-injection vector; treat it identically.
    const sensitivityTopic = classifySensitivity(topic);
    if (sensitivityTopic.level === 'critical') {
        return loadCuratedFallback(sensitivityTopic.matched);
    }
    if (filter) {
        const sensitivityFilter = classifySensitivity(filter);
        if (sensitivityFilter.level === 'critical') {
            return loadCuratedFallback(sensitivityFilter.matched);
        }
    }

    // 2. Cache lookup (re-validates internally; miss or poison → null).
    //    Runs BEFORE the vault check so a key-less user can still replay
    //    previously-generated plans offline.
    const cacheKey = buildCacheKey({
        topic,
        filter,
        count: safeCount,
        model: GEMINI_MODEL,
        schemaVersion: SCHEMA_VERSION,
        manifestId: manifestId || 'default',
    });
    const cached = await cacheGet(cacheKey);
    if (cached) return { plan: cached, cacheKey };

    // 3. Vault key fetch — block before any provider call.
    const apiKey = await getKey(ACTIVE_PROVIDER);
    if (!apiKey) {
        throw new AuthError('No API key configured', {
            userMessage: 'No Gemini key is configured. Press O to open the Options Menu and save a key.',
            recoverable: false,
        });
    }

    // 4. Async Pipeline
    let plan;
    try {
        const provider = new GeminiProvider(apiKey);

        // Fetch raw JSON from Gemini
        const rawPlan = await provider.fetchPlan(topic, filter, safeCount, { signal });

        const validator = new PlanValidator(memoryCache);
        plan = validator.validate(rawPlan, { requestedCount: safeCount, requestedFilter: filter || null });
        
    } catch (err) {
        // Re-throw typed errors directly
        if (err instanceof StudyPlanError) {
            throw err;
        }
        
        // Map standard AbortError or Timeout to an accessible message
        if (err.name === 'AbortError' || (err.message && err.message.includes('timeout'))) {
            throw new StudyPlanError('Cancelled by user or timeout', {
                userMessage: err.message?.includes('timeout') 
                    ? 'The AI service took too long to respond. Please try again.' 
                    : 'Plan generation was cancelled.',
                recoverable: true
            });
        }

        // Scrub PII/Keys from unknown errors before logging/throwing
        const sanitize = (error) => {
            if (!error) return "Unknown error";
            const str = typeof error === 'string' ? error : (error.stack || error.message || error.toString());
            return str.replace(/AIza[0-9A-Za-z_-]{35}/gi, '[REDACTED_API_KEY]');
        };

        // Inner wall generic wrapper
        throw new StudyPlanError('Unexpected pipeline error', {
            userMessage: 'Something went wrong while generating the plan. Please try again.',
            recoverable: true,
            cause: sanitize(err)
        });
    }

    // 5. Persist to plan cache. Fire-and-forget; cache failure must not
    //    block returning a validated plan to the engine.
    cachePut(cacheKey, plan, { topic, filter, verseCount: safeCount, model: GEMINI_MODEL })
        .catch((err) => console.warn('[orchestrator] planCache.put failed:', err?.message || err));

    return { plan, cacheKey };
}

/**
 * Boot-time resume helper: fetch a previously-cached plan by its cacheKey.
 * Returns null if missing, poisoned, or evicted.
 */
export async function loadPlanFromCache(cacheKey) {
    if (!cacheKey) return null;
    try {
        const cached = await cacheGet(cacheKey);
        return cached || null;
    } catch (_) {
        return null;
    }
}