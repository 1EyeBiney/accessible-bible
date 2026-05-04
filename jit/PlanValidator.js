/**
 * PlanValidator.js
 * Validates AI-generated study plans against the local Bible manifest.
 * Enforces domain logic and fuzzy text matching.
 */

import { ValidationError, SchemaError } from './errors.js';

export class PlanValidator {
    /**
     * @param {Array} memoryCache - The locally loaded Bible JSON array from db.js
     */
    constructor(memoryCache) {
        if (!memoryCache || !Array.isArray(memoryCache)) {
            throw new Error("PlanValidator requires a populated memoryCache array.");
        }
        this.cache = memoryCache;
    }

    /**
     * Normalizes text for fuzzy matching by removing punctuation and lowercasing.
     * @private
     */
    _normalizeText(text) {
        if (!text) return "";
        return text.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Validates the generated plan against the local cache.
     * @param {Object} planData - The JSON parsed object from the AI (v3 shape).
     * @param {Object} [opts] - Optional caller context.
     * @param {number} [opts.requestedCount] - The verse count the user asked for.
     *   If supplied, the AI's pre-filter array length MUST match it.
     * @param {string} [opts.requestedFilter] - The flavor filter the user asked for.
     * @returns {Object} - A sanitized study plan
     *   { topic, summary, requested_verse_count, actual_verse_count, flavor, verses }.
     */
    validate(planData, opts = {}) {
        if (!planData || !planData.verses || !Array.isArray(planData.verses)) {
            throw new SchemaError("Invalid plan format", {
                userMessage: "The study engine returned a malformed plan. Please try again.",
                recoverable: true
            });
        }

        // Dynamic-count assertion (replaces the hardcoded 5-verse contract).
        // Only fires on FIRST validation (when the orchestrator supplies
        // opts.requestedCount). Cache re-validation passes no opts, and the
        // stored verses array is already post-filter, so we must not
        // compare against requested_verse_count there.
        const echoedCount = Number.isFinite(planData.requested_verse_count)
            ? planData.requested_verse_count
            : null;
        const expectedCount = Number.isFinite(opts.requestedCount)
            ? opts.requestedCount
            : echoedCount;

        if (Number.isFinite(opts.requestedCount)
            && planData.verses.length !== opts.requestedCount) {
            throw new SchemaError(
                `Verse count mismatch: expected ${opts.requestedCount}, got ${planData.verses.length}`,
                {
                    userMessage: "The study engine returned a different number of verses than requested. Please try again.",
                    recoverable: true
                }
            );
        }

        const validVerses = [];

        for (const node of planData.verses) {
            // 1. Structural integrity check for the specific node
            if (!node.book_name || !node.chapter || !node.verse || !node.expected_text_snippet) {
                console.warn(`[Validator] Dropping verse due to missing structural fields:`, node);
                continue;
            }

            // 2. Exact Coordinate Search in local cache
            const matchedVerse = this.cache.find(v => 
                v.book_name.toLowerCase() === node.book_name.toLowerCase() &&
                v.chapter === node.chapter &&
                v.verse === node.verse
            );

            if (!matchedVerse) {
                console.warn(`[Validator] Hallucination dropped. Verse not found: ${node.book_name} ${node.chapter}:${node.verse}`);
                continue;
            }

            // 3. The Hybrid Fuzzy Match
            const expectedSnippet = this._normalizeText(node.expected_text_snippet);
            const actualText = this._normalizeText(matchedVerse.text);

            // Path A: Direct normalized substring match
            if (!actualText.includes(expectedSnippet)) {
                
                // Path B: Word intersection ratio (requires 60% match)
                const expectedWords = expectedSnippet.split(' ');
                const actualWords = new Set(actualText.split(' '));
                let matchCount = 0;
                
                for (const word of expectedWords) {
                    if (actualWords.has(word)) matchCount++;
                }

                const matchRatio = matchCount / Math.max(1, expectedWords.length);
                
                if (matchRatio < 0.6) {
                    console.warn(`[Validator] Fuzzy match failed for ${node.book_name} ${node.chapter}:${node.verse}. Dropping verse.`);
                    continue; 
                }
            }

            // Verse survived all checks; append.
            validVerses.push(node);
        }

        // 4. Final Assessment
        if (validVerses.length === 0) {
            throw new ValidationError("All generated verses failed local validation.", {
                userMessage: "The study engine generated references that do not align with your current Bible translation. Please try a different topic.",
                recoverable: true
            });
        }

        // Return the sanitized plan for the orchestrator (v3 shape).
        const flavor = (typeof planData.flavor === 'string' && planData.flavor.trim())
            ? planData.flavor.trim()
            : (opts.requestedFilter || null);

        return {
            topic: planData.topic || "Study Plan",
            summary: planData.summary || "",
            requested_verse_count: expectedCount != null ? expectedCount : validVerses.length,
            actual_verse_count: validVerses.length,
            flavor,
            verses: validVerses
        };
    }
}