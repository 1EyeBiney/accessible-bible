/**
 * Accessible Study Bible - v0.15.0
 * Relational Linking, Vertical Verse Actions, Local Note Backups
 */

// --- Global State ---
let db;
const DB_NAME = "BibleStudyDB";
const DB_VERSION = 4;
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
let isNoteMode = false;
let searchResults = [];
let currentSearchResultIndex = -1;
let anchoredVerseIndex = -1;
let navigationHistory = [];
let isMenuMode = false;
let menuOptions = [];
let currentMenuIndex = 0;
let isReady = false;
let isInitialized = false;
let lastAnnouncedBook = '';
let lastAnnouncedChapter = -1;
let searchInputEl = null;
let noteEditorEl = null;
let importFileEl = null;
let audioCtx = null;
const AUDIO_GAIN_BOOST = 1.45;

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

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, dur, vol) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const boostedVol = Math.min(1, vol * AUDIO_GAIN_BOOST);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(boostedVol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

function playSequence(types, freqs, dur, vol) {
    if (!Array.isArray(freqs) || freqs.length === 0) return;
    for (let i = 0; i < freqs.length; i++) {
        setTimeout(() => {
            playTone(freqs[i], (types && types[i]) || 'sine', dur, vol);
        }, i * dur * 1000);
    }
}

function playNoteIndicator() {
    playSequence(['sine', 'sine', 'sine', 'sine'], [1000, 1500, 2000, 2500], 0.05, 0.2);
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
        if (upgradeDb.objectStoreNames.contains(TEXT_STORE)) {
            upgradeDb.deleteObjectStore(TEXT_STORE);
        }
        upgradeDb.createObjectStore(TEXT_STORE, { keyPath: "id" });
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
    fetch('bsb1.json')
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

    if (!db) return;
    const noteTx = db.transaction([NOTES_STORE], "readonly");
    const noteStore = noteTx.objectStore(NOTES_STORE);
    const noteRequest = noteStore.get(verseObj.id);
    noteRequest.onsuccess = () => {
        if (noteRequest.result && noteRequest.result.content.trim() !== '') {
            playNoteIndicator();
        }
    };
}

function openNoteEditorForCurrentVerse() {
    if (!isReady || !db || !noteEditorEl) return;
    clearAllModes();
    isNoteMode = true;

    const activeVerse = memoryCache[currentVerseIndex];
    const notesTx = db.transaction([NOTES_STORE], "readonly");
    const notesStore = notesTx.objectStore(NOTES_STORE);
    const noteRequest = notesStore.get(activeVerse.id);

    noteRequest.onsuccess = () => {
        if (noteRequest.result) {
            noteEditorEl.value = noteRequest.result.content;
            speak("Edit note: " + noteRequest.result.content);
        } else {
            noteEditorEl.value = '';
            speak(
                "New note for " + activeVerse.book_name + " " + activeVerse.chapter +
                " verse " + activeVerse.verse + ". Type and press Escape to save."
            );
        }
    };

    noteEditorEl.focus();
}

function parseLinkTarget(linkText) {
    const clean = String(linkText).replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    const match = clean.match(/^(.*)\s+(\d+):(\d+)$/);
    if (!match) return null;
    return {
        book: match[1],
        chapter: parseInt(match[2], 10),
        verse: parseInt(match[3], 10)
    };
}

// --- Mode Safety: clear all search/input modes ---
function clearAllModes() {
    isBookSearchMode = false;
    lastSearchLetter = '';
    inputBuffer = '';
    isChapterMode = false;
    isVerseMode = false;
    isSearchMode = false;
    isNoteMode = false;
    isMenuMode = false;
    searchResults = [];
    currentSearchResultIndex = -1;
    menuOptions = [];
    currentMenuIndex = 0;
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

    if (isMenuMode) {
        event.preventDefault();

        if (key === 'Escape') {
            clearAllModes();
            speak("Menu closed");
            return;
        }

        if (key === 'ArrowDown') {
            currentMenuIndex = (currentMenuIndex + 1) % menuOptions.length;
            speak((currentMenuIndex + 1) + " of " + menuOptions.length + ": " + menuOptions[currentMenuIndex]);
            return;
        }

        if (key === 'ArrowUp') {
            currentMenuIndex = (currentMenuIndex - 1 + menuOptions.length) % menuOptions.length;
            speak((currentMenuIndex + 1) + " of " + menuOptions.length + ": " + menuOptions[currentMenuIndex]);
            return;
        }

        if (key === 'Enter') {
            const selected = menuOptions[currentMenuIndex];

            if (selected === 'Edit Note') {
                openNoteEditorForCurrentVerse();
                return;
            }

            if (selected === 'Delete Note') {
                const deleteTx = db.transaction([NOTES_STORE], "readwrite");
                const deleteStore = deleteTx.objectStore(NOTES_STORE);
                deleteStore.delete(memoryCache[currentVerseIndex].id);
                isMenuMode = false;
                speak("Note deleted.");
                return;
            }

            if (selected === 'Copy Verse') {
                navigator.clipboard.writeText(memoryCache[currentVerseIndex].text)
                    .then(() => {
                        isMenuMode = false;
                        speak("Verse copied to clipboard.");
                    })
                    .catch(() => {
                        isMenuMode = false;
                        speak("Clipboard unavailable.");
                    });
                return;
            }

            if (/^\[\[.*\]\]$/.test(selected)) {
                const target = parseLinkTarget(selected);
                if (!target) {
                    speak("Invalid link target.");
                    return;
                }
                navigationHistory.push(currentVerseIndex);
                isMenuMode = false;
                jumpTo(target.book, target.chapter, target.verse);
                return;
            }
        }

        return;
    }

    if (key === 'Escape') {
        clearAllModes();
        event.preventDefault();
        speak("Search and modes cleared.");
        return;
    }

    if (key === 'Backspace') {
        event.preventDefault();
        if (navigationHistory.length > 0) {
            currentVerseIndex = navigationHistory.pop();
            readCurrentVerse();
            playTone(600, 'sine', 0.1, 0.2);
            speak("Returned.");
        } else {
            speak("No history.");
        }
        return;
    }

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

    if (key === 'ArrowUp') {
        event.preventDefault();
        if (!isReady || !db) return;
        const noteTx = db.transaction([NOTES_STORE], "readonly");
        const noteStore = noteTx.objectStore(NOTES_STORE);
        const noteRequest = noteStore.get(memoryCache[currentVerseIndex].id);
        noteRequest.onsuccess = () => {
            if (noteRequest.result) {
                speak("Note: " + noteRequest.result.content);
            } else {
                speak("No note.");
            }
        };
        return;
    }

    if (key === 'ArrowDown') {
        event.preventDefault();
        clearAllModes();
        isMenuMode = true;
        menuOptions = ['Edit Note', 'Delete Note', 'Copy Verse'];
        currentMenuIndex = 0;
        speak("Verse Menu. 1 of 3: Edit Note. Up and down to navigate, Enter to select, Escape to cancel.");
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
            openNoteEditorForCurrentVerse();
            break;
        case 'E': {
            if (event.shiftKey) {
                event.preventDefault();
                if (!db) {
                    speak("Database not ready.");
                    break;
                }
                const exportTx = db.transaction([NOTES_STORE], "readonly");
                const exportStore = exportTx.objectStore(NOTES_STORE);
                const exportRequest = exportStore.getAll();
                exportRequest.onsuccess = () => {
                    const blob = new Blob([JSON.stringify(exportRequest.result)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = 'bible_notes_backup.json';
                    document.body.appendChild(anchor);
                    anchor.click();
                    document.body.removeChild(anchor);
                    URL.revokeObjectURL(url);
                    speak("Notes exported.");
                };
                break;
            }
            const testament = isReady ? memoryCache[currentVerseIndex].testament : 'unknown';
            speak(`Echo Chamber active. Index ${currentVerseIndex}. Testament: ${testament}. Ready state: ${isReady}`);
            break;
        }
        case 'I':
            if (event.shiftKey) {
                event.preventDefault();
                if (importFileEl) {
                    importFileEl.click();
                }
            }
            break;
        case 'B':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isBookSearchMode = true;
            speak("Book Search. Press a letter.");
            break;
        case 'R': {
            event.preventDefault();
            if (!isReady) break;
            anchoredVerseIndex = currentVerseIndex;
            const v = memoryCache[currentVerseIndex];
            speak("Anchored " + v.book_name + " " + v.chapter + " verse " + v.verse);
            playTone(800, 'sine', 0.1, 0.2);
            break;
        }
        case 'L':
            if (!event.altKey) break;
            event.preventDefault();
            if (!db || !isReady) break;
            if (anchoredVerseIndex < 0) {
                speak("No anchor set.");
                break;
            }
            {
                const currentVerse = memoryCache[currentVerseIndex];
                const anchorVerse = memoryCache[anchoredVerseIndex];
                const linkString = `[[${anchorVerse.book_name} ${anchorVerse.chapter}:${anchorVerse.verse}]]`;
                const linkTx = db.transaction([NOTES_STORE], "readwrite");
                const linkStore = linkTx.objectStore(NOTES_STORE);
                const linkRequest = linkStore.get(currentVerse.id);
                linkRequest.onsuccess = () => {
                    if (linkRequest.result) {
                        const existing = linkRequest.result.content || '';
                        linkStore.put({ note_id: currentVerse.id, content: existing + "\n" + linkString });
                    } else {
                        linkStore.put({ note_id: currentVerse.id, content: linkString });
                    }
                    speak("Link appended.");
                };
            }
            break;
        case 'J':
            if (!event.altKey) break;
            event.preventDefault();
            if (!db || !isReady) break;
            {
                const currentVerse = memoryCache[currentVerseIndex];
                const linkTx = db.transaction([NOTES_STORE], "readonly");
                const linkStore = linkTx.objectStore(NOTES_STORE);
                const linkRequest = linkStore.get(currentVerse.id);
                linkRequest.onsuccess = () => {
                    const content = linkRequest.result?.content || '';
                    const links = [...content.matchAll(/\[\[(.*?)\]\]/g)].map(match => match[0]);

                    if (links.length === 0) {
                        speak("No links.");
                        return;
                    }

                    if (links.length === 1) {
                        const target = parseLinkTarget(links[0]);
                        if (!target) {
                            speak("Invalid link target.");
                            return;
                        }
                        navigationHistory.push(currentVerseIndex);
                        jumpTo(target.book, target.chapter, target.verse);
                        return;
                    }

                    clearAllModes();
                    isMenuMode = true;
                    menuOptions = links;
                    currentMenuIndex = 0;
                    speak("Link Menu. 1 of " + menuOptions.length + ": " + menuOptions[0] + ". Up and down to navigate, Enter to select, Escape to cancel.");
                };
            }
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
    const noteEditor = document.getElementById('note-editor');
    const importFile = document.getElementById('import-file');
    searchInputEl = searchInput;
    noteEditorEl = noteEditor;
    importFileEl = importFile;

    function activateEngine() {
        isInitialized = true;
        initAudio();
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
        if (isInitialized && !isSearchMode && !isNoteMode) {
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

    noteEditor.addEventListener('keydown', (event) => {
        event.stopPropagation();

        if (event.altKey && event.key.toUpperCase() === 'L') {
            event.preventDefault();
            if (anchoredVerseIndex < 0) {
                speak("No anchor set.");
                return;
            }
            const anchorVerse = memoryCache[anchoredVerseIndex];
            const linkString = `[[${anchorVerse.book_name} ${anchorVerse.chapter}:${anchorVerse.verse}]]`;
            const start = noteEditor.selectionStart ?? noteEditor.value.length;
            const end = noteEditor.selectionEnd ?? start;
            noteEditor.value = noteEditor.value.slice(0, start) + linkString + noteEditor.value.slice(end);
            const nextPos = start + linkString.length;
            noteEditor.selectionStart = nextPos;
            noteEditor.selectionEnd = nextPos;
            speak("Link inserted.");
            return;
        }

        if (event.altKey && event.key.toUpperCase() === 'J') {
            event.preventDefault();
            const cursorPos = noteEditor.selectionStart ?? 0;
            const fullText = noteEditor.value;
            const lineStart = fullText.lastIndexOf('\n', Math.max(0, cursorPos - 1)) + 1;
            const lineEndIndex = fullText.indexOf('\n', cursorPos);
            const lineEnd = lineEndIndex === -1 ? fullText.length : lineEndIndex;
            const currentLine = fullText.slice(lineStart, lineEnd);
            const linkMatch = currentLine.match(/\[\[(.*?)\]\]/);
            if (!linkMatch) {
                speak("No links.");
                return;
            }

            const target = parseLinkTarget(linkMatch[0]);
            if (!target) {
                speak("Invalid link target.");
                return;
            }

            const saveTx = db.transaction([NOTES_STORE], "readwrite");
            const saveStore = saveTx.objectStore(NOTES_STORE);
            saveStore.put({
                note_id: memoryCache[currentVerseIndex].id,
                content: noteEditor.value.trim()
            });
            saveTx.oncomplete = () => {
                isNoteMode = false;
                focusTrap.focus();
                navigationHistory.push(currentVerseIndex);
                jumpTo(target.book, target.chapter, target.verse);
                speak("Teleporting.");
            };
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            const saveTx = db.transaction([NOTES_STORE], "readwrite");
            const saveStore = saveTx.objectStore(NOTES_STORE);
            saveStore.put({
                note_id: memoryCache[currentVerseIndex].id,
                content: noteEditor.value.trim()
            });

            isNoteMode = false;
            focusTrap.focus();
            speak("Note saved.");
        }
    });

    importFile.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file || !db) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!Array.isArray(parsed)) {
                    speak("Invalid backup format.");
                    return;
                }
                const tx = db.transaction([NOTES_STORE], "readwrite");
                const store = tx.objectStore(NOTES_STORE);
                parsed.forEach(note => store.put(note));
                tx.oncomplete = () => speak("Backup imported.");
            } catch (error) {
                console.error("Import parse error:", error);
                speak("Invalid backup file.");
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    });

    window.addEventListener('keydown', handleInput);
});