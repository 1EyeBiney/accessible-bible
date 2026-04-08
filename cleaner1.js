const fs = require('fs');

// 1. Define the input and output parameters
const inputFile = 'bsb.json';
const outputFile = 'bsb_clean.json';

console.log(`Loading ${inputFile}...`);

// 2. Read and parse the 7MB JSON file
let rawData;
try {
    rawData = fs.readFileSync(inputFile, 'utf8');
} catch (err) {
    console.error(`Error reading ${inputFile}:`, err.message);
    process.exit(1);
}

const bibleArray = JSON.parse(rawData);
let cleanCount = 0;

// 3. Process every verse in the array
bibleArray.forEach(verse => {
    if (verse.text) {
        const originalText = verse.text;
        
        verse.text = verse.text
            // Target 1: The "b" hallucination (Finds standalone 'bb', 'bbb', etc.)
            // We use {2,} to ensure we don't accidentally delete a valid single 'b' if it exists.
            .replace(/\b[bB]{2,}\b/g, '') 
            
            // Target 2: The Punctuation Allow-List
            // Removes EVERYTHING except letters, numbers, spaces, and standard punctuation.
            .replace(/[^\w\s.,;:?!'"()-]/g, '') 
            
            // Target 3: Cleanup
            // Collapses any double/triple spaces created by the removals into a single space
            .replace(/\s{2,}/g, ' ') 
            
            // Strips leading/trailing whitespace
            .trim(); 

        // If the text changed, increment our tracker
        if (originalText !== verse.text) {
            cleanCount++;
        }
    }
});

// 4. Save the cleaned data to the new file
console.log(`Cleaned ${cleanCount} verses.`);
console.log(`Writing to ${outputFile}...`);
fs.writeFileSync(outputFile, JSON.stringify(bibleArray, null, 2));

console.log("Cleanup complete! You can now swap the files.");