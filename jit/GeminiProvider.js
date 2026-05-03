/**
 * GeminiProvider.js
 * Handles the wire protocol, schema coercion, and semantic safety checks.
 */

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { classifySensitivity, buildPromptHardener, loadCuratedFallback } from "./sensitivity.js";
import { SafetyError, NetworkError, AuthError, QuotaError, ParsingError } from "./errors.js";

// Define the Strict JSON Schema (Now featuring closing_reflection)
const studyPlanSchema = {
    type: SchemaType.OBJECT,
    properties: {
        plan_title: { type: SchemaType.STRING },
        plan_description: { type: SchemaType.STRING },
        nodes: {
            type: SchemaType.ARRAY,
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
        },
        closing_reflection: { 
            type: SchemaType.STRING,
            description: "A concluding pastoral thought. If the topic is sensitive, this must include a gentle, non-prescriptive nudge toward human community or counseling."
        }
    },
    required: ["plan_title", "plan_description", "nodes", "closing_reflection"]
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
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: studyPlanSchema,
                temperature: 0.7,
            }
        });
    }

    async fetchPlan(topic, filter) {
        // 1. The Semantic Safety Catch
        const sensitivity = classifySensitivity(topic);
        
        if (sensitivity.level === 'critical') {
            console.warn(`[Safety Intercept] Critical topic detected: ${sensitivity.matched}`);
            return loadCuratedFallback(sensitivity.level); // Return the safe, hardcoded JSON
        }

        const hardener = buildPromptHardener(sensitivity.level);

        // 2. Build the Prompt
        const prompt = `You are a biblical study guide generator. 
        The user needs a 3-step Bible study plan about: ${topic}. 
        Filter the theological tone through the lens of: ${filter}. 
        Ensure your verse references are accurate and your commentary is deeply encouraging but concise.
        ${hardener}`; // The hardener dynamically injects rules for elevated topics

        // 3. Execute the API Call
        try {
            const result = await this.model.generateContent(prompt);
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