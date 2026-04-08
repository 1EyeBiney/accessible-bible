'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Canonical book list ──────────────────────────────────────────────────────
// Index position (0-based) + 1 = book_number.
// Books 1-39  → Old Testament
// Books 40-66 → New Testament
const BOOK_LIST = [
  // OT (1–39)
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
  'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  // NT (40–66)
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy',
  '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
  'Jude', 'Revelation',
];

// Common spelling variants found in BSB source files
const ALIASES = {
  'Psalm':              'Psalms',
  'Song of Songs':      'Song of Solomon',
  'Song of Solomon':    'Song of Solomon',
  'Revelation of John': 'Revelation',
};

// Build lookup: canonical name → { bookNumber, testament }
const bookMeta = new Map();
BOOK_LIST.forEach((name, i) => {
  const bookNumber = i + 1;
  const testament  = bookNumber <= 39 ? 'OT' : 'NT';
  bookMeta.set(name, { bookNumber, testament });
});

function resolveBook(rawName) {
  const canonical = ALIASES[rawName] ?? rawName;
  return bookMeta.get(canonical) ?? null;
}

// ─── TSV column indices (0-based) ─────────────────────────────────────────────
// [12] VerseId  – "Genesis 1:1"  (only populated on the first word of each verse)
// [17] begQ     – opening quotation mark (if any)
// [18] BSB version – English word/phrase for this token
// [19] pnc      – punctuation following this token
// [20] endQ     – closing quotation mark (if any)
const COL_VERSE_ID = 12;
const COL_BEG_Q    = 17;
const COL_WORD     = 18;
const COL_PNC      = 19;
const COL_END_Q    = 20;

// ─── Parse a VerseId string into its components ───────────────────────────────
// Handles multi-word book names: "Song of Solomon 3:1", "1 Samuel 1:1", etc.
function parseVerseId(verseId) {
  const m = verseId.match(/^(.+)\s+(\d+):(\d+)$/);
  if (!m) return null;
  return {
    bookName: m[1].trim(),
    chapter:  parseInt(m[2], 10),
    verse:    parseInt(m[3], 10),
  };
}

// ─── Build verse text from collected word tokens ──────────────────────────────
// Each token: { begQ, word, pnc, endQ }
// Assembly:   begQ + word + pnc + endQ  per token, joined with a single space.
// The word text arrives pre-trimmed; punctuation attaches with no extra space.
function buildText(tokens) {
  return tokens
    .map(({ begQ, word, pnc, endQ }) => `${begQ}${word}${pnc}${endQ}`)
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const tsvPath  = path.join(__dirname, 'raw_bsb.tsv');
const outPath  = path.join(__dirname, 'bsb.json');

const raw   = fs.readFileSync(tsvPath, 'utf8');
const lines = raw.split('\n');

const verses = [];

let currentVerseId = null;
let tokens         = [];        // word tokens for the verse being assembled
let parsedVerse    = null;      // result of parseVerseId for currentVerseId

function flushVerse() {
  if (!currentVerseId || tokens.length === 0) return;

  const pv   = parsedVerse;
  const meta = resolveBook(pv.bookName);
  if (!meta) {
    process.stderr.write(`Warning: unrecognized book "${pv.bookName}" in "${currentVerseId}" – skipped\n`);
    tokens = [];
    return;
  }

  const idBase  = pv.bookName.toLowerCase().replace(/\s+/g, '');
  const id      = `${idBase}_${pv.chapter}_${pv.verse}`;
  const text    = buildText(tokens);

  verses.push({
    id,
    testament:   meta.testament,
    book_name:   pv.bookName,
    book_number: meta.bookNumber,
    chapter:     pv.chapter,
    verse:       pv.verse,
    text,
  });

  tokens = [];
}

// Skip line 0 (header row)
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;                // skip empty lines between verse blocks

  const cols     = line.split('\t');
  const verseId  = cols[COL_VERSE_ID] ? cols[COL_VERSE_ID].trim() : '';
  const rawWord  = cols[COL_WORD]     ? cols[COL_WORD].trim()     : '';
  const pnc      = cols[COL_PNC]      ? cols[COL_PNC].trim()      : '';
  const begQ     = cols[COL_BEG_Q]    ? cols[COL_BEG_Q].trim()   : '';
  const endQ     = cols[COL_END_Q]    ? cols[COL_END_Q].trim()    : '';

  // A non-empty VerseId signals the start of a new verse
  if (verseId && verseId !== currentVerseId) {
    flushVerse();
    currentVerseId = verseId;
    parsedVerse    = parseVerseId(verseId);
  }

  // Only collect rows that carry English text
  if (rawWord) {
    tokens.push({ begQ, word: rawWord, pnc, endQ });
  }
}

flushVerse(); // flush the final verse

fs.writeFileSync(outPath, JSON.stringify(verses), 'utf8');
console.log(`✓ Parsed ${verses.length} verses → bsb.json`);
