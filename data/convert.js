const fs = require('fs');
const readline = require('readline');

// BSB Book to Engine Book Number Mapping
const bookMap = {
    "Gen": 1, "Exod": 2, "Lev": 3, "Num": 4, "Deut": 5, "Josh": 6, "Judg": 7, "Ruth": 8, "1 Sam": 9, "2 Sam": 10,
    "1 Kgs": 11, "2 Kgs": 12, "1 Chr": 13, "2 Chr": 14, "Ezra": 15, "Neh": 16, "Esth": 17, "Job": 18, "Ps": 19, "Prov": 20,
    "Eccl": 21, "Song": 22, "Isa": 23, "Jer": 24, "Lam": 25, "Ezek": 26, "Dan": 27, "Hos": 28, "Joel": 29, "Amos": 30,
    "Obad": 31, "Jonah": 32, "Mic": 33, "Nah": 34, "Hab": 35, "Zeph": 36, "Hag": 37, "Zech": 38, "Mal": 39,
    "Matt": 40, "Mark": 41, "Luke": 42, "John": 43, "Acts": 44, "Rom": 45, "1 Cor": 46, "2 Cor": 47, "Gal": 48, "Eph": 49,
    "Phil": 50, "Col": 51, "1 Thess": 52, "2 Thess": 53, "1 Tim": 54, "2 Tim": 55, "Titus": 56, "Phlm": 57, "Heb": 58,
    "Jas": 59, "1 Pet": 60, "2 Pet": 61, "1 John": 62, "2 John": 63, "3 John": 64, "Jude": 65, "Rev": 66
};

async function processTSK() {
    const fileStream = fs.createReadStream('crossreferences_bsb.tsv');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let currentId = null;
    let currentContent = "";
    let isFirstLine = true;
    const output = [];

    for await (const line of rl) {
        if (isFirstLine) { isFirstLine = false; continue; } // Skip header

        const [book, chapter, verse, anchor, references] = line.split('\t');
        if (!bookMap[book]) continue;

        const id = (bookMap[book] * 1000000) + (parseInt(chapter) * 1000) + parseInt(verse);
        
        // Wrap each reference in our Omni-Jump [[link]] syntax
        const formattedRefs = references.split('|').map(ref => `[[${ref.trim()}]]`).join(', ');
        const entry = `${anchor.toUpperCase()}: ${formattedRefs}`;

        if (id !== currentId) {
            if (currentId !== null) output.push({ id: currentId, content: currentContent.trim() });
            currentId = id;
            currentContent = entry;
        } else {
            currentContent += `\n${entry}`;
        }
    }
    if (currentId !== null) output.push({ id: currentId, content: currentContent.trim() });

    fs.writeFileSync('tsk_commentary.json', JSON.stringify(output, null, 2));
    console.log(`Success! Created tsk_commentary.json with ${output.length} verses.`);
}

processTSK();