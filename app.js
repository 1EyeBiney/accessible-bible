/**
 * Accessible Study Bible - v0.29.0
 * Audio Codex overlay, boot silencer, and media player logic
 */

import { DB_NAME, DB_VERSION, TEXT_STORE, NOTES_STORE, BOOKMARKS_STORE, COMMENTARY_STORE, helpMenuData, AUDIO_GAIN_BOOST, THEMES, tutorialChapters, hymnList, volumeStages } from './config.js';
import { speak, announcer } from './ui.js';
import {
    initAudio, playTone, playSequence, playNoteIndicator, playCommentaryCue,
    playNextTrack, silenceBootAudio, cycleVolume,
    audioCtx, audioA, audioB, activeAudio, currentVolumeIndex, crossfadeTimer
} from './audio.js';
import { db, memoryCache, bookmarksCache, initDatabase, loadBookmarks, loadToMemory, setMemoryCache } from './db.js';
import { handleInput, clearAllModes, setSearchMode, setNoteMode, getSearchMode, getNoteMode } from './keyboard.js';

// --- Global State ---
export let currentVerseIndex = 0; 
export let currentBookName = '';
let lastSearchLetter = '';
let inputBuffer = '';
let searchResults = [];
let currentSearchResultIndex = -1;
let currentBookmarkIndex = -1;
let anchoredVerseIndex = -1;
let navigationHistory = [];
let menuOptions = [];
let currentMenuIndex = 0;
let currentHelpIndex = 0;
export let isReady = false;
export let isInitialized = false;
let lastAnnouncedBook = '';
let lastAnnouncedChapter = -1;
let searchInputEl = null;
let noteEditorEl = null;
let importFileEl = null;
let importCommentaryEl = null;
let currentFontSize = 24;
let currentThemeIndex = 0;
export let isWelcomeMode = false;
let skipWelcome = localStorage.getItem('skipWelcome') === 'true';
let welcomeAudioEl = null;
export let isTutorialMode = false;
let tutorialScreenEl = null;
let tutorialTitleEl = null;
let tutorialAudioEl = null;
let currentTutorialIndex = 0;
let muteTutorialPrompt = localStorage.getItem('muteTutorialPrompt') === 'true';
const onTrackEnded = () => playNextTrack();

export function updateVerseIndex(val) { currentVerseIndex = val; }
export function updateBookName(val) { currentBookName = val; }
export function setIsReady(val) { isReady = val; }
export function toggleWelcomeMode(val) { isWelcomeMode = val; }
export function toggleTutorialMode(val) { isTutorialMode = val; }

const splashScreen = document.getElementById('splash-screen');
const focusTrap = document.getElementById('focus-trap');

export function toggleCurrentBookmark() {
    if (!db || !isReady) return;

    const verseId = memoryCache[currentVerseIndex].id;
    const existingIndex = bookmarksCache.indexOf(verseId);
    const tx = db.transaction([BOOKMARKS_STORE], "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);

    if (existingIndex !== -1) {
        store.delete(verseId);
        bookmarksCache.splice(existingIndex, 1);
        currentBookmarkIndex = bookmarksCache.length === 0
            ? -1
            : Math.min(currentBookmarkIndex, bookmarksCache.length - 1);
        speak("Bookmark removed.");
        return;
    }

    if (bookmarksCache.length >= 10) {
        speak("Bookmark limit reached. Maximum 10 bookmarks.");
        return;
    }

    store.put({ id: verseId });
    bookmarksCache.push(verseId);
    bookmarksCache.sort((a, b) => a - b);
    currentBookmarkIndex = bookmarksCache.indexOf(verseId);
    speak("Bookmark added.");
}

export function navigateBookmarks(direction) {
    if (!isReady) return;
    if (bookmarksCache.length === 0) {
        speak("No bookmarks saved.");
        return;
    }

    const currentVerseId = memoryCache[currentVerseIndex].id;
    const verseBookmarkIndex = bookmarksCache.indexOf(currentVerseId);
    if (verseBookmarkIndex !== -1) {
        currentBookmarkIndex = verseBookmarkIndex;
    }
    if (currentBookmarkIndex < 0 || currentBookmarkIndex >= bookmarksCache.length) {
        currentBookmarkIndex = 0;
    }

    currentBookmarkIndex = (currentBookmarkIndex + direction + bookmarksCache.length) % bookmarksCache.length;
    const targetId = bookmarksCache[currentBookmarkIndex];
    const targetVerseIndex = memoryCache.findIndex(v => v.id === targetId);

    if (targetVerseIndex === -1) {
        speak("Bookmark target not found.");
        return;
    }

    currentVerseIndex = targetVerseIndex;
    readCurrentVerse();
}

// --- Core Navigation Logic ---
export function readCurrentVerse(forceFull = false) {
    if (!isReady || memoryCache.length === 0) return;

    document.getElementById('alert-note').style.display = 'none';
    document.getElementById('alert-comm').style.display = 'none';

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

    // --- VISUAL INJECTION ---
    const visualReference = `${verseObj.book_name} ${verseObj.chapter}:${verseObj.verse}`;
    document.getElementById('content-display').innerHTML = `<strong>${visualReference}</strong><br><br>${verseObj.text}`;

    speak(prefix + verseObj.text);

    if (!db) return;
    const curriculumId = (verseObj.book_number * 1000000) + (verseObj.chapter * 1000) + verseObj.verse;
    const tx = db.transaction([NOTES_STORE, COMMENTARY_STORE], "readonly");

    const noteRequest = tx.objectStore(NOTES_STORE).get(verseObj.id);
    noteRequest.onsuccess = () => {
        if (noteRequest.result && noteRequest.result.content.trim() !== '') {
            playNoteIndicator();
            document.getElementById('alert-note').style.display = 'block';
        }
    };

    const commRequest = tx.objectStore(COMMENTARY_STORE).get(curriculumId);
    commRequest.onsuccess = () => {
        if (commRequest.result) {
            setTimeout(() => playCommentaryCue(), 150);
            document.getElementById('alert-comm').style.display = 'block';
        }
    };
}

export function openNoteEditorForCurrentVerse() {
    if (!isReady || !db || !noteEditorEl) return;
    clearAllModes();
    setNoteMode(true);

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

export function parseLinkTarget(linkText) {
    const clean = String(linkText).replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    const match = clean.match(/^(.*?)\s+(\d+):(\d+)/);
    if (!match) return null;
    
    const rawBook = match[1].trim().toLowerCase();
    
    const bookNameMap = {
        "gen": "Genesis", "exod": "Exodus", "lev": "Leviticus", "num": "Numbers", "deut": "Deuteronomy",
        "josh": "Joshua", "judg": "Judges", "ruth": "Ruth", "1 sam": "1 Samuel", "2 sam": "2 Samuel",
        "1 kgs": "1 Kings", "2 kgs": "2 Kings", "1 chr": "1 Chronicles", "2 chr": "2 Chronicles",
        "ezra": "Ezra", "neh": "Nehemiah", "esth": "Esther", "job": "Job", "ps": "Psalms", "prov": "Proverbs",
        "eccl": "Ecclesiastes", "song": "Song of Solomon", "isa": "Isaiah", "jer": "Jeremiah", "lam": "Lamentations",
        "ezek": "Ezekiel", "dan": "Daniel", "hos": "Hosea", "joel": "Joel", "amos": "Amos", "obad": "Obadiah",
        "jonah": "Jonah", "mic": "Micah", "nah": "Nahum", "hab": "Habakkuk", "zeph": "Zephaniah", "hag": "Haggai",
        "zech": "Zechariah", "mal": "Malachi", "matt": "Matthew", "mark": "Mark", "luke": "Luke", "john": "John",
        "acts": "Acts", "rom": "Romans", "1 cor": "1 Corinthians", "2 cor": "2 Corinthians", "gal": "Galatians",
        "eph": "Ephesians", "phil": "Philippians", "col": "Colossians", "1 thess": "1 Thessalonians",
        "2 thess": "2 Thessalonians", "1 tim": "1 Timothy", "2 tim": "2 Timothy", "titus": "Titus",
        "phlm": "Philemon", "heb": "Hebrews", "jas": "James", "1 pet": "1 Peter", "2 pet": "2 Peter",
        "1 john": "1 John", "2 john": "2 John", "3 john": "3 John", "jude": "Jude", "rev": "Revelation"
    };
    
    const finalBook = bookNameMap[rawBook] || match[1].trim();
    
    return { book: finalBook, chapter: parseInt(match[2], 10), verse: parseInt(match[3], 10) };
}

export function updateTutorialChapter(newIndex, autoPlay = true) {
    if (!tutorialAudioEl || !tutorialTitleEl || tutorialChapters.length === 0) return;

    currentTutorialIndex = (newIndex + tutorialChapters.length) % tutorialChapters.length;
    const chapter = tutorialChapters[currentTutorialIndex];
    tutorialTitleEl.textContent = chapter.title;
    const chapterSrc = `./audio/dialog/${chapter.file}`;

    const sourceChanged = tutorialAudioEl.getAttribute('src') !== chapterSrc;
    if (sourceChanged) {
        tutorialAudioEl.src = chapterSrc;
        tutorialAudioEl.load();
    }

    if (autoPlay) {
        const playPromise = tutorialAudioEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                console.warn('Tutorial chapter playback blocked or failed:', error);
                speak('Chapter loaded. Press Space to play.');
            });
        }
    }

    speak(chapter.title + '.');
}

function playTutorialChapter(index) {
    updateTutorialChapter(index, true);
}

function startTutorialSequence() {
    isTutorialMode = true;
    silenceBootAudio();

    if (tutorialScreenEl) {
        tutorialScreenEl.style.display = 'flex';
        tutorialScreenEl.focus();
    }

    speak('Audio Codex active. Space to play or pause. Left and right to seek. Up and down to change chapter. Escape to enter study environment.');
    updateTutorialChapter(currentTutorialIndex, true);
}

export function endTutorialSequence() {
    isTutorialMode = false;
    if (tutorialAudioEl) {
        tutorialAudioEl.pause();
        tutorialAudioEl.currentTime = 0;
    }
    if (tutorialScreenEl) {
        tutorialScreenEl.style.display = 'none';
    }

    document.getElementById('app-container').style.display = 'block';
    document.getElementById('focus-trap').focus();

    playNextTrack(true);
    speak('Exited Audio Codex. Back in study environment.');
}

// --- Coordinate-Based Navigation ---
export function jumpTo(book, chapter, verse) {
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

export function getKeyboardExplorerDescription(event) {
    const key = event.key;
    const keyUpper = key.toUpperCase();

    if (key === 'Escape') return 'Escape: Exit Keyboard Explorer.';
    if (key === 'F12') return 'F12: Exit Keyboard Explorer.';
    if (key === '?') return 'Question mark: Open Help Menu.';
    if (key === 'ArrowLeft') return 'Left Arrow: Move to previous verse.';
    if (key === 'ArrowRight') return 'Right Arrow: Move to next verse.';
    if (key === 'ArrowUp') return event.shiftKey ? 'Shift plus Up Arrow: Read expert commentary.' : 'Up Arrow: Read the current verse note.';
    if (key === 'ArrowDown') return 'Down Arrow: Open Verse Menu.';
    if (key === 'PageUp') return event.shiftKey ? 'Shift plus Page Up: Move to previous book.' : 'Page Up: Move to previous chapter.';
    if (key === 'PageDown') return event.shiftKey ? 'Shift plus Page Down: Move to next book.' : 'Page Down: Move to next chapter.';
    if (key === 'Tab') return 'Tab: Read full current location.';
    if (key === 'Backspace') return 'Backspace: Return to previous linked location.';
    if (key === '[') return event.shiftKey ? 'Shift plus Left Bracket: Previous Bookmark.' : 'Left bracket: Previous word search result.';
    if (key === ']') return event.shiftKey ? 'Shift plus Right Bracket: Next Bookmark.' : 'Right bracket: Next word search result.';

    if (event.altKey && keyUpper === 'L') return 'Alt plus L: Drop a link to the anchored verse.';
    if (event.altKey && keyUpper === 'J') return 'Alt plus J: Omni-Jump to relational link targets.';

    if (keyUpper === 'B') return 'B: Start Book search mode.';
    if (keyUpper === 'F') return 'F: Start Word search mode.';
    if (keyUpper === 'C') return 'C: Start Chapter jump mode.';
    if (keyUpper === 'V') return event.shiftKey ? 'Shift plus V: Cycle ambient volume.' : 'V: Start Verse jump mode.';
    if (keyUpper === 'M') return 'M: Open note editor for this verse.';
    if (keyUpper === 'H') return 'H: Open Audio Codex tutorial overlay.';
    if (keyUpper === 'R') return 'R: Anchor this verse for relational linking.';
    if (keyUpper === 'N') return 'N: Skip to next ambient track.';
    if (keyUpper === 'S') return 'S: Speak chapter status report.';
    if (keyUpper === 'K') return 'K: Toggle bookmark for current verse.';
    if (keyUpper === 'E') return 'E: Speak diagnostic engine state.';
    if (keyUpper === 'O') return 'O: Open Options menu to import/export data.';
    
    if (key === 'Enter') return 'Enter: Commit the current mode action.';

    const keyName = key === ' ' ? 'Space' : key;
    return keyName + ': No mapped engine command.';
}

function startWelcomeSequence() {
    isWelcomeMode = true;
    document.getElementById('splash-screen').style.display = 'none';
    
    const welcomeEl = document.getElementById('welcome-screen');
    welcomeEl.style.display = 'block';
    welcomeEl.focus(); // Pass the baton to keep NVDA in Focus Mode
    
    // Boot silencer: keep media muted while orientation is active.
    silenceBootAudio();
    
    // Stealth TTS Bypass for Screen Readers
    speak("Orientation active. Press Escape to skip to the study environment.");
    
    // Delay ElevenLabs audio slightly so TTS finishes the bypass instruction
    setTimeout(() => {
        if (!isWelcomeMode) return; // In case they skipped instantly
        welcomeAudioEl = document.getElementById('welcome-audio');
        if (welcomeAudioEl) welcomeAudioEl.play().catch(e => console.warn("Welcome audio blocked", e));
    }, 2000);
}

export function endWelcomeSequence() {
    isWelcomeMode = false;
    if (welcomeAudioEl) {
        welcomeAudioEl.pause();
        welcomeAudioEl.currentTime = 0;
    }
    document.getElementById('welcome-screen').style.display = 'none';

    document.getElementById('app-container').style.display = 'block';
    document.getElementById('focus-trap').focus();
    playNextTrack(true);
    const helperText = muteTutorialPrompt ? "" : " Press H for audio tutorial, or Shift plus H to mute this prompt.";
    speak("Study environment initialized. Use arrows to navigate. Press M to edit note." + helperText);
    setTimeout(() => initDatabase(), 100);
}

window.addEventListener('DOMContentLoaded', () => {
    const initButton = document.getElementById('init-button');
    const appContainer = document.getElementById('app-container');
    const searchInput = document.getElementById('search-input');
    const noteEditor = document.getElementById('note-editor');
    const importFile = document.getElementById('import-file');
    tutorialScreenEl = document.getElementById('tutorial-screen');
    tutorialTitleEl = document.getElementById('tutorial-title');
    tutorialAudioEl = document.getElementById('tutorial-audio');
    searchInputEl = searchInput;
    noteEditorEl = noteEditor;
    importFileEl = importFile;

    if (tutorialAudioEl) {
        tutorialAudioEl.addEventListener('ended', () => {
            updateTutorialChapter(currentTutorialIndex + 1, true);
        });
    }

    function activateEngine() {
        isInitialized = true;
        initAudio();
        console.log("Engine Active");

        if (skipWelcome) {
            document.getElementById('splash-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            focusTrap.focus();
            playNextTrack(true);
            const helperText = muteTutorialPrompt ? "" : " Press H for audio tutorial, or Shift plus H to mute this prompt.";
            speak("Study environment initialized. Use arrows to navigate. Press M to edit note." + helperText);
            setTimeout(() => initDatabase(), 100);
        } else {
            startWelcomeSequence();
        }
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
        if (isInitialized && !getSearchMode() && !getNoteMode() && !isWelcomeMode && !isTutorialMode) {
            requestAnimationFrame(() => focusTrap.focus());
        }
    });

    if (tutorialScreenEl) {
        tutorialScreenEl.addEventListener('blur', () => {
            if (isTutorialMode) {
                requestAnimationFrame(() => tutorialScreenEl.focus());
            }
        });
    }

    searchInput.addEventListener('keydown', (event) => {
        event.stopPropagation();

        if (event.key === 'Escape') {
            event.preventDefault();
            setSearchMode(false);
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
            setSearchMode(false);
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
                setNoteMode(false);
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

            setNoteMode(false);
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
    
    // Commentary file import listener
    importCommentaryEl = document.getElementById('import-commentary-file');
    if (importCommentaryEl) {
        importCommentaryEl.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file || !db) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result);
                    if (!Array.isArray(parsed)) { speak("Invalid commentary format."); return; }
                    const tx = db.transaction([COMMENTARY_STORE], "readwrite");
                    const store = tx.objectStore(COMMENTARY_STORE);
                    parsed.forEach(note => store.put(note));
                    tx.oncomplete = () => speak("Commentary module loaded.");
                } catch (error) {
                    console.error("Import error:", error);
                    speak("Invalid commentary file.");
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        });
    }

    window.addEventListener('keydown', handleInput);
});