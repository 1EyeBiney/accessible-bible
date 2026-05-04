/**
 * GeminiProvider.js
 * Handles the wire protocol, schema coercion, and semantic safety checks.
 */

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { classifySensitivity, buildPromptHardener, loadCuratedFallback } from "./sensitivity.js";
import { SafetyError, NetworkError, AuthError, QuotaError, ParsingError } from "./errors.js";
import { GEMINI_MODEL } from "../config.js";

// v2 Strict JSON Schema — Third Track contract.
// Plan = { topic, summary, verses: [exactly 5] }
const studyPlanSchema = {
    type: SchemaType.OBJECT,
    properties: {
        topic:   { type: SchemaType.STRING, description: "User's study topic, restated concisely." },
        summary: { type: SchemaType.STRING, description: "2 to 3 sentence overview of the study arc." },
        verses: {
            type: SchemaType.ARRAY,
            minItems: 5,
            maxItems: 5,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    step: { type: SchemaType.INTEGER },
                    book_name: { type: SchemaType.STRING },
                    chapter: { type: SchemaType.INTEGER },
                    verse: { type: SchemaType.INTEGER },
                    expected_text_snippet: { type: SchemaType.STRING },
                    commentary_text: { type: SchemaType.STRING }
                },
                required: ["step", "book_name", "chapter", "verse", "expected_text_snippet", "commentary_text"]
            }
        }
    },
    required: ["topic", "summary", "verses"]
};

export class GeminiProvider {
    constructor(apiKey) {
        if (!apiKey) {
            throw new AuthError("Missing API Key", {
                userMessage: "Please provide a valid API key in the Options menu to generate study plans.",
                recoverable: true
            });
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: studyPlanSchema,
                temperature: 0.7,
            }
        });
    }

    async fetchPlan(topic, filter, { signal } = {}) {
        // 1. The Semantic Safety Catch
        const sensitivity = classifySensitivity(topic);
        
        if (sensitivity.level === 'critical') {
            console.warn(`[Safety Intercept] Critical topic detected: ${sensitivity.matched}`);
            return loadCuratedFallback(sensitivity.level); // Return the safe, hardcoded JSON
        }

        const hardener = buildPromptHardener(sensitivity.level);

        // 2. Build the Prompt
        const prompt = `You are a biblical study guide generator.
        The user needs a Bible study plan about: ${topic}.
        Filter the theological tone through the lens of: ${filter}.
        Return EXACTLY 5 verses, ordered as a coherent study arc, with each verse's expected_text_snippet drawn from a literal English translation.
        The 'topic' field should restate the user's topic concisely. The 'summary' field should be 2 to 3 sentences describing the study arc.
        Ensure verse references are accurate and commentary is deeply encouraging but concise.
        ${hardener}`;

        // 3. Pre-flight abort check
        if (signal?.aborted) {
            throw new DOMException('Aborted before request', 'AbortError');
        }

        // 4. Execute the API Call (race against abort signal)
        try {
            const apiCall = this.model.generateContent(prompt);
            const result = signal
                ? await Promise.race([
                    apiCall,
                    new Promise((_, reject) => {
                        const onAbort = () => reject(new DOMException(signal.reason?.message || 'Aborted', 'AbortError'));
                        if (signal.aborted) onAbort();
                        else signal.addEventListener('abort', onAbort, { once: true });
                    })
                  ])
                : await apiCall;
            const responseText = result.response.text();
            
            // 4. Parse the output (The Garbage Collector)
            try {
                const jsonOutput = JSON.parse(responseText);
                return jsonOutput;
            } catch (parseErr) {
                throw new ParsingError("AI returned invalid JSON", {
                    userMessage: "The study engine had trouble formatting this plan. Please try a slightly different topic.",
                    recoverable: true,
                    cause: responseText
                });
            }

        } catch (apiError) {
            // 5. Map Google Errors to our Flat Hierarchy
            const errStr = apiError.toString().toLowerCase();
            
            if (errStr.includes("safety") || errStr.includes("blocked")) {
                throw new SafetyError("Prompt blocked by Google Safety API", {
                    userMessage: "This specific topic is outside the allowed safety parameters of the AI model. Please try a different subject.",
                    recoverable: true,
                    cause: apiError
                });
            }
            if (errStr.includes("429") || errStr.includes("quota")) {
                throw new QuotaError("API Quota Reached", {
                    userMessage: "You have reached the data limit for your API key. Please check your Google account.",
                    recoverable: false,
                    cause: apiError
                });
            }
            if (errStr.includes("401") || errStr.includes("403") || errStr.includes("key")) {
                throw new AuthError("Invalid API Key", {
                    userMessage: "Your API key was rejected. Please update it in the Options menu.",
                    recoverable: true,
                    cause: apiError
                });
            }
            
            // Default to Network Error for 503s, offline, and timeouts
            throw new NetworkError("Network or Server Failure", {
                userMessage: "Could not connect to the study engine. Please check your internet connection and try again.",
                recoverable: true,
                cause: apiError
            });
        }
    }
}