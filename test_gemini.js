require('dotenv').config();
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

// 1. Initialize the Client
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY not found in .env file.");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// 2. Define the Strict JSON Schema (The "Fences")
const studyPlanSchema = {
    type: SchemaType.OBJECT,
    properties: {
        plan_title: {
            type: SchemaType.STRING,
            description: "A short, encouraging title for the study plan."
        },
        plan_description: {
            type: SchemaType.STRING,
            description: "A brief 1-2 sentence description of the plan and its tone."
        },
        nodes: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    step: { type: SchemaType.INTEGER },
                    book_name: { 
                        type: SchemaType.STRING, 
                        description: "Full name of the Bible book (e.g., 'Psalms', 'John')" 
                    },
                    chapter: { type: SchemaType.INTEGER },
                    verse: { type: SchemaType.INTEGER },
                    expected_text_snippet: { 
                        type: SchemaType.STRING, 
                        description: "A 5-7 word snippet of the actual verse text to be used for fuzzy-matching validation." 
                    },
                    commentary_text: { 
                        type: SchemaType.STRING, 
                        description: "The JIT commentary for this verse, max 600 characters." 
                    }
                },
                required: ["step", "book_name", "chapter", "verse", "expected_text_snippet", "commentary_text"]
            }
        }
    },
    required: ["plan_title", "plan_description", "nodes"]
};

// 3. Configure the Model
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", // <-- UPDATED to the latest active model
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: studyPlanSchema,
        temperature: 0.7, 
    }
});

// 4. The Execution Function
async function generatePlan(topic, filter) {
    console.log(`\n⏳ Generating Study Plan for: "${topic}" (Filter: ${filter})...\n`);
    
    try {
        const prompt = `You are a biblical study guide generator. 
        The user needs a 3-step Bible study plan about: ${topic}. 
        Filter the theological tone through the lens of: ${filter}. 
        Ensure your verse references are accurate and your commentary is deeply encouraging but concise.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Parse and format the output
        const jsonOutput = JSON.parse(responseText);
        console.log("✅ Generation Complete! Here is the structured JSON:\n");
        console.log(JSON.stringify(jsonOutput, null, 2));

    } catch (error) {
        console.error("❌ Error generating content:", error);
    }
}

// Run the test
generatePlan("struggling with anxiety", "Charles Spurgeon");