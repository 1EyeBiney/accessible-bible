const fs = require('fs');

// 1. Define the input and output parameters
const inputFile = 'bsb_dirty_backup.json'; // Always run against the raw source
const outputFile = 'bsb_clean.json';

console.log(`Loading ${inputFile}...`);

// 2. Read and parse the JSON file
let rawData;
try {
    rawData = fs.readFileSync(inputFile, 'utf8');
} catch (err) {
    console.error(`Error reading ${inputFile}:`, err.message);
    console.error(`Please ensure your original file is named '${inputFile}' and is in the same directory.`);
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
            .replace(/\b[bB]{2,}\b/g, '') 
            
            // NEW Target: The "v" hallucination (Finds standalone 'vv', 'vvv', etc.)
            .replace(/\b[vV]{2,}\b/g, '') 
            
            // NEW Target: Strip leading hyphens at the very beginning of a verse
            .replace(/^\s*-\s*/g, '')
            
            // Target 2: Strip brackets but leave the word inside (e.g. "[it]" becomes "it")
            .replace(/\[|\]/g, '') 
            
            // Target 3: Remove spaced ellipses (e.g. ". . ." or "...")
            .replace(/\s*\.\s*\.\s*\.\s*/g, ' ') 
            
            // Target 4: Remove hyphens that have spaces around them (e.g. "God - made")
            .replace(/\s+-\s+/g, ' ') 
            
            // Target 5: Fix hyphens directly preceding punctuation (e.g. "above -.")
            .replace(/\s+-[.,;:?!]/g, match => match.slice(-1)) 
            
            // Target 6: The Punctuation Allow-List
            // Removes EVERYTHING except letters, numbers, spaces, and standard punctuation.
            .replace(/[^\w\s.,;:?!'"()-]/g, '') 
            
            // Target 7: Collapse multiple spaces into one
            .replace(/\s{2,}/g, ' ') 
            
            // Final Polish: Strip leading/trailing whitespace
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