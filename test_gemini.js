require('dotenv').config();
const fs = require('fs'); // <--- Added for file writing
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

// 1. Initialize the Client
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY not found in .env file.");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// 2. Define the Strict JSON Schema
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
        }
    },
    required: ["plan_title", "plan_description", "nodes"]
};

// 3. Configure the Model
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
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
        const jsonOutput = JSON.parse(responseText);

        // SAVE SUCCESS TO FILE
        fs.writeFileSync('last_run.json', JSON.stringify(jsonOutput, null, 2));
        console.log("✅ Success! Output saved to 'last_run.json'.");

    } catch (error) {
        // SAVE ERROR TO FILE
        fs.writeFileSync('last_run_error.txt', JSON.stringify(error, null, 2));
        console.log("❌ Error occurred! Check 'last_run_error.txt'.");
    }
}

// 5. CURRENT PROBE: Ready for Probe 1.2
// Change this line to run your next test!
generatePlan("struggling with depression", "despairing tone");