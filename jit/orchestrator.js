/**
 * orchestrator.js
 * The single entry point for generating JIT Study Plans.
 * Acts as the 'Inner Wall' of the double-wall try/catch architecture.
 */

import { GeminiProvider } from './GeminiProvider.js';
import { PlanValidator } from './PlanValidator.js';
import { classifySensitivity, loadCuratedFallback } from './sensitivity.js';
import { StudyPlanError } from './errors.js';

export async function generateStudyPlan(topic, filter, apiKey, memoryCache, { signal } = {}) {
    // 1. Synchronous Safety Check
    const sensitivity = classifySensitivity(topic);
    if (sensitivity.level === 'critical') {
        return loadCuratedFallback(sensitivity.matched);
    }

    // 2. Async Pipeline
    let plan;
    try {
        const provider = new GeminiProvider(apiKey);
        
        // Fetch raw JSON from Gemini 
        const rawPlan = await provider.fetchPlan(topic, filter); 
        
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

    // Caching (Task 2.6) will be triggered here safely outside the main try block
    return plan;
}