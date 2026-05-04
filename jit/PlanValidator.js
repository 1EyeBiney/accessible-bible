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
     * @param {Object} planData - The JSON parsed object from the AI (v2 shape).
     * @returns {Object} - A sanitized study plan { topic, summary, verses }.
     */
    validate(planData) {
        if (!planData || !planData.verses || !Array.isArray(planData.verses)) {
            throw new SchemaError("Invalid plan format", {
                userMessage: "The study engine returned a malformed plan. Please try again.",
                recoverable: true
            });
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

        // Return the sanitized plan for the orchestrator (v2 shape).
        return {
            topic: planData.topic || "Study Plan",
            summary: planData.summary || "",
            verses: validVerses
        };
    }
}