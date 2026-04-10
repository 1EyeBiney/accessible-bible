const fs = require('fs');

const SINGLE_LIMIT = 2000;
const DUAL_LIMIT = 1500;
const TARGET_AUTHORS = ["Augustine of Hippo", "Theodoret of Cyrus"];

console.log(`Building Balanced Narrative for: ${TARGET_AUTHORS.join(', ')}`);

const bookMap = {
    "genesis": 1, "exodus": 2, "leviticus": 3, "numbers": 4, "deuteronomy": 5, "joshua": 6, "judges": 7, "ruth": 8, "1samuel": 9, "2samuel": 10,
    "1kings": 11, "2kings": 12, "1chronicles": 13, "2chronicles": 14, "ezra": 15, "nehemiah": 16, "esther": 17, "job": 18, "psalms": 19, "proverbs": 20,
    "ecclesiastes": 21, "songofsolomon": 22, "isaiah": 23, "jeremiah": 24, "lamentations": 25, "ezekiel": 26, "daniel": 27, "hosea": 28, "joel": 29, "amos": 30,
    "obadiah": 31, "jonah": 32, "micah": 33, "nahum": 34, "habakkuk": 35, "zephaniah": 36, "haggai": 37, "zechariah": 38, "malachi": 39,
    "matthew": 40, "mark": 41, "luke": 42, "john": 43, "acts": 44, "romans": 45, "1corinthians": 46, "2corinthians": 47, "galatians": 48, "ephesians": 49,
    "philippians": 50, "colossians": 51, "1thessalonians": 52, "2thessalonians": 53, "1timothy": 54, "2timothy": 55, "titus": 56, "philemon": 57, "hebrews": 58,
    "james": 59, "1peter": 60, "2peter": 61, "1john": 62, "2john": 63, "3john": 64, "jude": 65, "revelation": 66
};

const rawData = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const commentaryMap = {};
let verseCount = 0;

rawData.forEach(entry => {
    if (!TARGET_AUTHORS.includes(entry.father_name)) return;
    if (!entry.book || !entry.location_start || !entry.txt) return;

    const normalizedBook = entry.book.toLowerCase().replace(/\s/g, '');
    const bookNumber = bookMap[normalizedBook];
    if (!bookNumber) return; 

    const chapter = Math.floor(entry.location_start / 1000000);
    const verse = entry.location_start % 1000000;
    const id = (bookNumber * 1000000) + (chapter * 1000) + verse;

    if (!commentaryMap[id]) {
        // First author for this verse: Use 2000 limit
        let content = entry.txt.trim();
        if (content.length > SINGLE_LIMIT) content = content.substring(0, SINGLE_LIMIT) + "... [Truncated]";
        
        commentaryMap[id] = {
            authors: [entry.father_name],
            textParts: [`${entry.father_name}: ${content}`]
        };
        verseCount++;
    } else {
        // Overlap detected: Re-trim the first author to 1500 and trim new author to 1500
        const data = commentaryMap[id];
        
        // Trim existing parts to the tighter dual limit
        data.textParts = data.textParts.map(p => p.length > DUAL_LIMIT ? p.substring(0, DUAL_LIMIT) + "... [Truncated]" : p);
        
        // Add the new author
        let newContent = entry.txt.trim();
        if (newContent.length > DUAL_LIMIT) newContent = newContent.substring(0, DUAL_LIMIT) + "... [Truncated]";
        
        data.textParts.push(`${entry.father_name}: ${newContent}`);
        data.authors.push(entry.father_name);
    }
});

// Final Assembly
const finalOutput = Object.keys(commentaryMap).map(id => ({
    id: parseInt(id),
    content: commentaryMap[id].textParts.join('\n\n')
}));

fs.writeFileSync('balanced_commentary.json', JSON.stringify(finalOutput, null, 2));
console.log(`Success! Created balanced commentary for ${verseCount} verses.`);