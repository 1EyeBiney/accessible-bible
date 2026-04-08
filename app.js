/**
 * Accessible Study Bible - v0.6.0
 * Status Mission, Mode Safety
 */

// --- Global State ---
let db;
const DB_NAME = "BibleStudyDB";
const DB_VERSION = 1;
const TEXT_STORE = "bibleText";
const NOTES_STORE = "userNotes";

let memoryCache = []; 
let currentVerseIndex = 0; 
let currentBookName = '';
let isBookSearchMode = false;
let lastSearchLetter = '';
let inputBuffer = '';
let isChapterMode = false;
let isVerseMode = false;
let isReady = false;

const announcer = document.getElementById('aria-announcer');

// --- Utility: ARIA Announcer ---
function speak(message) {
    announcer.textContent = '';
    setTimeout(() => {
        announcer.textContent = message;
    }, 50); 
}

// --- Data Pipeline ---
function initDatabase() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.errorCode);
        speak("Database error.");
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        checkAndLoadData();
    };

    request.onupgradeneeded = (event) => {
        const upgradeDb = event.target.result;
        if (!upgradeDb.objectStoreNames.contains(TEXT_STORE)) {
            upgradeDb.createObjectStore(TEXT_STORE, { keyPath: "id" });
        }
        if (!upgradeDb.objectStoreNames.contains(NOTES_STORE)) {
            upgradeDb.createObjectStore(NOTES_STORE, { keyPath: "note_id" });
        }
    };
}

function checkAndLoadData() {
    const transaction = db.transaction([TEXT_STORE], "readonly");
    const store = transaction.objectStore(TEXT_STORE);
    const countRequest = store.count();

    countRequest.onsuccess = () => {
        if (countRequest.result === 0) {
            speak("Downloading study library. Please wait.");
            fetchBibleJSON();
        } else {
            loadToMemory();
        }
    };
}

function fetchBibleJSON() {
    fetch('bsb.json')
        .then(response => response.json())
        .then(data => {
            const transaction = db.transaction([TEXT_STORE], "readwrite");
            const store = transaction.objectStore(TEXT_STORE);
            
            data.forEach(verse => store.put(verse));
            
            transaction.oncomplete = () => {
                loadToMemory();
            };
        })
        .catch(error => {
            console.error("Fetch error:", error);
            speak("Error loading Bible data file.");
        });
}

function loadToMemory() {
    const transaction = db.transaction([TEXT_STORE], "readonly");
    const store = transaction.objectStore(TEXT_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
        const rawData = request.result;
        rawData.sort((a, b) => (a.book_number - b.book_number) || (a.chapter - b.chapter) || (a.verse - b.verse));
        memoryCache = rawData;
        currentBookName = memoryCache[0].book_name;
        isReady = true;
        speak("Library ready. Use left and right arrows to read.");
    };
}

// --- Core Navigation Logic ---
function readCurrentVerse() {
    if (!isReady || memoryCache.length === 0) return;
    
    const verseObj = memoryCache[currentVerseIndex];
    currentBookName = verseObj.book_name;
    const readString = `${verseObj.book_name} ${verseObj.chapter} ${verseObj.verse}: ${verseObj.text}`;
    speak(readString);
}

// --- Mode Safety: clear all search/input modes ---
function clearAllModes() {
    isBookSearchMode = false;
    lastSearchLetter = '';
    inputBuffer = '';
    isChapterMode = false;
    isVerseMode = false;
}

// --- Coordinate-Based Navigation ---
function jumpTo(book, chapter, verse) {
    const index = memoryCache.findIndex(v =>
        v.book_name.toLowerCase() === book.toLowerCase() &&
        v.chapter === chapter &&
        v.verse === verse
    );
    if (index === -1) {
        speak("Invalid location.");
        return;
    }
    currentVerseIndex = index;
    readCurrentVerse();
}

// --- Keyboard Input Routing ---
function handleInput(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

    const key = event.key;
    const keyUpper = key.toUpperCase();

    // --- Page Navigation ---
    if (key === 'PageDown' || key === 'PageUp') {
        event.preventDefault();
        if (!isReady) return;
        const cur = memoryCache[currentVerseIndex];
        if (event.shiftKey) {
            // Shift+Page: book-level jump
            if (key === 'PageDown') {
                const nextBook = memoryCache.find(v => v.book_number === cur.book_number + 1 && v.chapter === 1 && v.verse === 1);
                if (nextBook) jumpTo(nextBook.book_name, 1, 1);
                else speak("End of library.");
            } else {
                if (cur.book_number > 1) {
                    const prevBook = memoryCache.find(v => v.book_number === cur.book_number - 1 && v.chapter === 1 && v.verse === 1);
                    if (prevBook) jumpTo(prevBook.book_name, 1, 1);
                } else {
                    speak("Beginning of library.");
                }
            }
        } else {
            // Page: chapter-level jump
            if (key === 'PageDown') {
                const nextChapter = memoryCache.find(v => v.book_name === cur.book_name && v.chapter === cur.chapter + 1 && v.verse === 1);
                if (nextChapter) {
                    jumpTo(nextChapter.book_name, nextChapter.chapter, 1);
                } else {
                    const nextBook = memoryCache.find(v => v.book_number === cur.book_number + 1 && v.chapter === 1 && v.verse === 1);
                    if (nextBook) jumpTo(nextBook.book_name, 1, 1);
                    else speak("End of library.");
                }
            } else {
                if (cur.chapter > 1) {
                    jumpTo(cur.book_name, cur.chapter - 1, 1);
                } else if (cur.book_number > 1) {
                    const prevBook = memoryCache.find(v => v.book_number === cur.book_number - 1 && v.chapter === 1 && v.verse === 1);
                    if (prevBook) jumpTo(prevBook.book_name, 1, 1);
                } else {
                    speak("Beginning of library.");
                }
            }
        }
        return;
    }

    // --- Arrow Key Scroll Prevention ---
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
        event.preventDefault();
    }

    // --- Chapter / Verse Digit Input Mode ---
    if (isChapterMode || isVerseMode) {
        if (/^[0-9]$/.test(key)) {
            event.preventDefault();
            inputBuffer += key;
            speak(key);
            return;
        }
        if (key === 'Enter') {
            event.preventDefault();
            const num = parseInt(inputBuffer, 10);
            const currentChapter = memoryCache[currentVerseIndex].chapter;
            inputBuffer = '';
            if (isChapterMode) {
                isChapterMode = false;
                jumpTo(currentBookName, num, 1);
            } else {
                isVerseMode = false;
                jumpTo(currentBookName, currentChapter, num);
            }
            return;
        }
        if (key === 'Escape') {
            event.preventDefault();
            inputBuffer = '';
            isChapterMode = false;
            isVerseMode = false;
            speak("Cancelled.");
            return;
        }
    }

    // --- Book Search Mode ---
    if (isBookSearchMode) {
        if (keyUpper === 'ENTER' || keyUpper === 'ESCAPE' || !/^[A-Z]$/.test(keyUpper)) {
            isBookSearchMode = false;
            lastSearchLetter = '';
            speak("Search closed.");
            return;
        }
        event.preventDefault();
        const letter = keyUpper;
        const uniqueBooks = [];
        const seen = new Set();
        for (const v of memoryCache) {
            if (!seen.has(v.book_name)) {
                seen.add(v.book_name);
                uniqueBooks.push(v.book_name);
            }
        }
        const matches = uniqueBooks.filter(b => b[0].toUpperCase() === letter);
        if (matches.length === 0) {
            speak("No book found for that letter.");
            return;
        }
        let targetBook;
        if (lastSearchLetter !== letter) {
            targetBook = matches[0];
        } else {
            const curIdx = matches.indexOf(currentBookName);
            targetBook = (curIdx === -1 || curIdx === matches.length - 1) ? matches[0] : matches[curIdx + 1];
        }
        lastSearchLetter = letter;
        jumpTo(targetBook, 1, 1);
        return;
    }

    // --- Standard Key Routing ---
    switch(keyUpper) {
        case 'ARROWRIGHT':
            if (currentVerseIndex < memoryCache.length - 1) {
                currentVerseIndex++;
                readCurrentVerse();
            } else {
                speak("End of library.");
            }
            break;
        case 'ARROWLEFT':
            if (currentVerseIndex > 0) {
                currentVerseIndex--;
                readCurrentVerse();
            } else {
                speak("Beginning of library.");
            }
            break;
        case 'E': {
            const testament = isReady ? memoryCache[currentVerseIndex].testament : 'unknown';
            speak(`Echo Chamber active. Index ${currentVerseIndex}. Testament: ${testament}. Ready state: ${isReady}`);
            break;
        }
        case 'B':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isBookSearchMode = true;
            speak("Book Search. Press a letter.");
            break;
        case 'C':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isChapterMode = true;
            speak("Chapter search. Enter numbers.");
            break;
        case 'V':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isVerseMode = true;
            speak("Verse search. Enter numbers.");
            break;
        case 'S': {
            event.preventDefault();
            if (!isReady) break;
            const cur = memoryCache[currentVerseIndex];
            const chapterVerses = memoryCache.filter(v => v.book_name === cur.book_name && v.chapter === cur.chapter);
            const verseCount = chapterVerses.length;
            const wordCount = chapterVerses.reduce((sum, v) => sum + v.text.trim().split(/\s+/).length, 0);
            speak(`${cur.book_name} ${cur.chapter}: ${verseCount} verses, approximately ${wordCount} words.`);
            break;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    window.addEventListener('keydown', handleInput);
});