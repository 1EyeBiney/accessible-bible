/**
 * Accessible Study Bible - v0.11.0
 * State-Based Search Engine, Stealth Input Protocol, Result Carousel
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
let isSearchMode = false;
let searchResults = [];
let currentSearchResultIndex = -1;
let isReady = false;
let isInitialized = false;
let lastAnnouncedBook = '';
let lastAnnouncedChapter = -1;
let searchInputEl = null;

const hymnList = ['amazing_grace1.mp3', 'amazing_grace2.mp3', 'come_thou_fount_of_many_blessings1.mp3', 'come_thou_fount_of_many_blessings2.mp3', 'holy_holy_holy1.mp3', 'holy_holy_holy2.mp3', 'how_great_thou_art1.mp3', 'how_great_thou_art2.mp3', 'it_is_well_with_my_soul1.mp3', 'it_is_well_with_my_soul2.mp3'];
let grabBag = [];
let audioA = new Audio();
let audioB = new Audio();
let activeAudio = audioA;
const volumeStages = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4];
let currentVolumeIndex = 2;
let crossfadeTimer = null;
const onTrackEnded = () => playNextTrack();

const announcer = document.getElementById('aria-announcer');
const splashScreen = document.getElementById('splash-screen');
const focusTrap = document.getElementById('focus-trap');

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
        speak("Library ready. Use left and right arrows to read. Press M to edit note.");
    };
}

// --- Core Navigation Logic ---
function readCurrentVerse(forceFull = false) {
    if (!isReady || memoryCache.length === 0) return;

    const verseObj = memoryCache[currentVerseIndex];
    currentBookName = verseObj.book_name;

    let prefix;
    if (forceFull || verseObj.book_name !== lastAnnouncedBook) {
        prefix = `${verseObj.book_name} chapter ${verseObj.chapter}, verse ${verseObj.verse}: `;
    } else if (verseObj.chapter !== lastAnnouncedChapter) {
        prefix = `Chapter ${verseObj.chapter}, verse ${verseObj.verse}: `;
    } else {
        prefix = `${verseObj.verse}: `;
    }

    lastAnnouncedBook = verseObj.book_name;
    lastAnnouncedChapter = verseObj.chapter;

    speak(prefix + verseObj.text);
}

// --- Mode Safety: clear all search/input modes ---
function clearAllModes() {
    isBookSearchMode = false;
    lastSearchLetter = '';
    inputBuffer = '';
    isChapterMode = false;
    isVerseMode = false;
    isSearchMode = false;
    searchResults = [];
    currentSearchResultIndex = -1;
}

function getNextHymn() {
    if (grabBag.length === 0) {
        grabBag = [...hymnList];
        for (let i = grabBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [grabBag[i], grabBag[j]] = [grabBag[j], grabBag[i]];
        }
    }
    return grabBag.pop();
}

function playNextTrack() {
    const standbyAudio = activeAudio === audioA ? audioB : audioA;
    const previousAudio = activeAudio;
    const targetVolume = volumeStages[currentVolumeIndex];

    if (crossfadeTimer) {
        clearInterval(crossfadeTimer);
        crossfadeTimer = null;
    }

    previousAudio.removeEventListener('ended', onTrackEnded);
    standbyAudio.pause();
    standbyAudio.currentTime = 0;
    standbyAudio.src = `/audio/hymns/${getNextHymn()}`;
    standbyAudio.volume = 0;

    const playPromise = standbyAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
            console.warn('Ambient audio playback blocked or failed:', error);
        });
    }

    const durationMs = 2000;
    const stepMs = 100;
    const totalSteps = durationMs / stepMs;
    let step = 0;
    const startVolume = previousAudio.paused ? 0 : previousAudio.volume;

    crossfadeTimer = setInterval(() => {
        step += 1;
        const progress = Math.min(step / totalSteps, 1);

        previousAudio.volume = Math.max(0, startVolume * (1 - progress));
        standbyAudio.volume = Math.min(targetVolume, targetVolume * progress);

        if (progress >= 1) {
            clearInterval(crossfadeTimer);
            crossfadeTimer = null;

            previousAudio.pause();
            previousAudio.currentTime = 0;
            previousAudio.volume = targetVolume;

            activeAudio = standbyAudio;
            activeAudio.removeEventListener('ended', onTrackEnded);
            activeAudio.addEventListener('ended', onTrackEnded);
        }
    }, stepMs);
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
    if (!isInitialized) {
        if (event.key === 'Enter') {
            document.getElementById('init-button')?.click();
        }
        return;
    }
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

    const key = event.key;
    const keyUpper = key.toUpperCase();

    if (searchResults.length > 0 && (key === ']' || key === '[')) {
        event.preventDefault();

        if (key === ']') {
            currentSearchResultIndex += 1;
            if (currentSearchResultIndex >= searchResults.length) {
                currentSearchResultIndex = 0;
            }
        } else {
            currentSearchResultIndex -= 1;
            if (currentSearchResultIndex < 0) {
                currentSearchResultIndex = searchResults.length - 1;
            }
        }

        currentVerseIndex = memoryCache.findIndex(v => v === searchResults[currentSearchResultIndex]);
        speak(
            "Match " + (currentSearchResultIndex + 1) + " of " + searchResults.length + ": " +
            memoryCache[currentVerseIndex].book_name + " " + memoryCache[currentVerseIndex].chapter + ":" +
            memoryCache[currentVerseIndex].verse + " - " + memoryCache[currentVerseIndex].text
        );
        return;
    }

    if (key === 'V' && event.shiftKey) {
        event.preventDefault();
        currentVolumeIndex += 1;
        if (currentVolumeIndex >= volumeStages.length) {
            currentVolumeIndex = 0;
        }
        activeAudio.volume = volumeStages[currentVolumeIndex];
        speak("Ambient volume " + Math.round(volumeStages[currentVolumeIndex] * 100));
        return;
    }

    // --- Tab: 'Where Am I?' ---
    if (key === 'Tab') {
        event.preventDefault();
        readCurrentVerse(true);
        return;
    }

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
        case 'N':
            if (event.shiftKey) break;
            event.preventDefault();
            playNextTrack();
            speak("Crossfading to next track.");
            break;
        case 'M':
            event.preventDefault();
            speak("Press M to edit note.");
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
        case 'F':
            event.preventDefault();
            if (!isReady || !searchInputEl) break;
            clearAllModes();
            isSearchMode = true;
            searchInputEl.value = '';
            searchInputEl.focus();
            speak("Word search. Type query and press Enter.");
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
            if (event.shiftKey) break;
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
            let statusMessage = `${cur.book_name} ${cur.chapter}: ${verseCount} verses, approximately ${wordCount} words.`;
            if (searchResults.length > 0) {
                statusMessage += ` Search active: viewing match ${currentSearchResultIndex + 1} of ${searchResults.length}.`;
            }
            speak(statusMessage);
            break;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const initButton = document.getElementById('init-button');
    const appContainer = document.getElementById('app-container');
    const searchInput = document.getElementById('search-input');
    searchInputEl = searchInput;

    function activateEngine() {
        isInitialized = true;
        playNextTrack();
        splashScreen.style.display = 'none';
        appContainer.style.display = 'block';
        focusTrap.focus();
        console.log("Engine Active");
        speak("Study environment initialized. Use arrows to navigate. Press M to edit note.");
        setTimeout(() => initDatabase(), 100);
    }

    initButton.addEventListener('click', activateEngine);
    initButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateEngine();
        }
    });

    initButton.addEventListener('blur', () => {
        if (!isInitialized) {
            requestAnimationFrame(() => initButton.focus());
        }
    });

    setTimeout(() => speak("Press Enter to begin."), 1000);

    focusTrap.addEventListener('blur', () => {
        if (isInitialized && !isSearchMode) {
            requestAnimationFrame(() => focusTrap.focus());
        }
    });

    searchInput.addEventListener('keydown', (event) => {
        event.stopPropagation();

        if (event.key === 'Escape') {
            event.preventDefault();
            isSearchMode = false;
            searchInput.value = '';
            focusTrap.focus();
            speak("Search cancelled.");
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const query = searchInput.value.trim().toLowerCase();
            if (!query) return;

            searchResults = memoryCache.filter(v => v.text.toLowerCase().includes(query));

            if (searchResults.length === 0) {
                speak("No matches found for " + query);
                return;
            }

            currentSearchResultIndex = 0;
            isSearchMode = false;
            focusTrap.focus();

            currentVerseIndex = memoryCache.findIndex(v => v === searchResults[0]);
            speak(
                "Found " + searchResults.length + " matches. Match 1: " +
                searchResults[0].book_name + " chapter " + searchResults[0].chapter + ", verse " +
                searchResults[0].verse + ": " + searchResults[0].text
            );
        }
    });

    window.addEventListener('keydown', handleInput);
});