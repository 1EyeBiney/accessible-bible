/**
 * errors.js
 * Base error architecture for the JIT Study Plan feature.
 * Enforces accessibility constraints for TTS integration.
 */

// Base Class — never thrown directly, just for instanceof checks
export class StudyPlanError extends Error {
    constructor(message, { userMessage, recoverable, cause } = {}) {
        super(message);
        this.name = this.constructor.name;
        
        // Ensure every error has a TTS-ready message for ui.js's speak() function
        if (!userMessage) {
            console.warn(`[A11y Warning] ${this.name} thrown without a userMessage.`);
            this.userMessage = "An unexpected error occurred with the study plan.";
        } else {
            this.userMessage = userMessage; 
        }

        // Drives the announcement suffix in the UI: 
        // true -> "Press Enter to retry."
        // false -> "Press Escape to return to study mode."
        this.recoverable = recoverable === true;

        // The original error/payload (scrubbed of PII before logging)
        this.cause = cause;
    }
}

// --- Level 2: The Flat Hierarchy ---

// Blocked by Gemini safety filters (prompt or mid-stream)
export class SafetyError extends StudyPlanError {}

// 5xx, timeout, fetch failures, or offline state
export class NetworkError extends StudyPlanError {}

// 401/403 or missing/bad API key
export class AuthError extends StudyPlanError {}

// 429 Rate limit reached
export class QuotaError extends StudyPlanError {}

// JSON.parse failed or AI hallucinated raw text
export class ParsingError extends StudyPlanError {}

// Passed parse, but failed local manifest / fuzzy-match coverage
export class ValidationError extends StudyPlanError {}

// JSON shape is wrong (missing fields, wrong types)
export class SchemaError extends StudyPlanError {}