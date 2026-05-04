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

export async function generateStudyPlan(topic, filter, manifestId, { signal } = {}) {
    // 1. Synchronous Safety Check
    const sensitivity = classifySensitivity(topic);
    if (sensitivity.level === 'critical') {
        return loadCuratedFallback(sensitivity.matched);
    }

    // 2. Cache lookup (re-validates internally; miss or poison → null).
    //    Runs BEFORE the vault check so a key-less user can still replay
    //    previously-generated plans offline.
    const cacheKey = buildCacheKey({
        topic,
        filter,
        model: GEMINI_MODEL,
        schemaVersion: SCHEMA_VERSION,
        manifestId: manifestId || 'default',
    });
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

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
        const rawPlan = await provider.fetchPlan(topic, filter, { signal }); 
        
        const validator = new PlanValidator(memoryCache);
        plan = validator.validate(rawPlan);
        
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
    cachePut(cacheKey, plan, { topic, filter, model: GEMINI_MODEL })
        .catch((err) => console.warn('[orchestrator] planCache.put failed:', err?.message || err));

    return plan;
}