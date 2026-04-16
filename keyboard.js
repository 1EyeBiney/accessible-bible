import { speak } from './ui.js';
import {
    currentVerseIndex, currentBookName, isReady, isInitialized,
    updateVerseIndex, updateBookName, setIsReady, toggleWelcomeMode, toggleTutorialMode,
    currentThemeIndex, currentFontSize, anchoredVerseIndex, navigationHistory,
    setCurrentThemeIndex, setCurrentFontSize, setAnchoredVerseIndex,
    searchInputEl, noteEditorEl, importFileEl, importCommentaryEl, tutorialAudioEl,
    currentTutorialIndex, setCurrentTutorialIndex,
    readCurrentVerse, jumpTo, openNoteEditorForCurrentVerse,
    startWelcomeSequence, endWelcomeSequence, startTutorialSequence, endTutorialSequence,
    updateTutorialChapter, playTutorialChapter, getKeyboardExplorerDescription, navigateBookmarks,
    toggleCurrentBookmark, parseLinkTarget, isWelcomeMode, isTutorialMode, setWelcomeMode, setTutorialMode,
    bootOptions, bootPreference, cycleBootPreference, copyToClipboard, resetBookmarkJumps
} from './app.js';
import { 
    memoryCache, db, bookmarksCache, loadToMemory 
} from './db.js';
import { 
    playNextTrack, cycleVolume, playTone, silenceBootAudio 
} from './audio.js';
import { startAutoPlay, pauseAutoPlay, stopAutoPlay, isAutoPlaying, autoPlaySettings, curatedVoices, playAutoPlayUI, saveAutoPlaySettings } from './autoplay.js';
import { helpMenuData, NOTES_STORE, COMMENTARY_STORE, THEMES, muteTutorialPrompt, setMuteTutorialPrompt } from './config.js';

const visualBuffer = document.getElementById('visual-buffer');

export function updateVisualBuffer(modeText, valueText) {
    if (!visualBuffer) return;
    if (!modeText) {
        visualBuffer.style.display = 'none';
    } else {
        visualBuffer.style.display = 'block';
        visualBuffer.textContent = modeText + (valueText ? ": " + valueText : "...");
    }
}

    export function updateSearchVisualBuffer(searchText = '') {
        if (searchText) {
            updateVisualBuffer("SEARCH DATABASE", searchText + " | [ENTER] to Search");
        } else {
            updateVisualBuffer("SEARCH DATABASE", "Type to find...");
        }
    }

    export function clearVisualBuffer() {
        updateVisualBuffer(null);
    }

// --- Mode State ---
export let isBookSearchMode = false;
export let lastSearchLetter = '';
export let lastBookSearchKey = '';
export let currentBookSearchIndex = 0;
export let inputBuffer = '';
export let isChapterMode = false;
export let isVerseMode = false;
export let isSearchMode = false;
export let isNoteMode = false;
export let isOptionsMenuMode = false;
export let isAutoPlayMenuMode = false;
export let currentMenuTitle = "";
export let isKeyboardExplorer = false;
export let isHelpMode = false;
export let isHelpMenuMode = false;
export let searchResults = [];
export let currentSearchResultIndex = -1;
export let consecutiveSearchJumps = 0;
export let menuOptions = [];
export let currentMenuIndex = 0;

export function clearAllModes() {
    isBookSearchMode = false; isChapterMode = false; isVerseMode = false;
    isSearchMode = false; isNoteMode = false; isOptionsMenuMode = false; isAutoPlayMenuMode = false;
    isHelpMode = false; isHelpMenuMode = false; isKeyboardExplorer = false;
    currentMenuTitle = "";
    inputBuffer = ''; lastSearchLetter = '';
    lastBookSearchKey = '';
    currentBookSearchIndex = 0;
    updateVisualBuffer(null);
    const searchBadge = document.getElementById('alert-search');
    if (searchBadge) searchBadge.style.display = 'none';
    const bookmarkBadge = document.getElementById('alert-bookmark');
    if (bookmarkBadge) bookmarkBadge.style.display = 'none';
}

export function setSearchMode(value) { isSearchMode = value; }
export function setNoteMode(value) { isNoteMode = value; }
export function getSearchMode() { return isSearchMode; }
export function getNoteMode() { return isNoteMode; }
export function setSearchResults(val) { searchResults = val; }
export function setCurrentSearchResultIndex(val) { currentSearchResultIndex = val; }

function getAutoPlayMenuString(index) {
    const transitions = ["Chime", "Numbers", "Seamless"];
    const postFocus = ["Stay at stopped verse", "Return to start"];
    const units = ["Verses", "Chapters", "Books"];
    const amountVals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50];
    const amountLabels = ["End of Current", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "15", "20", "25", "50"];
    const voiceName = curatedVoices[autoPlaySettings.voiceIndex]?.display || "Loading...";
    const rateVal = autoPlaySettings.rate.toFixed(1) + "x";

    const options = [
        `Voice: ${voiceName} (${autoPlaySettings.voiceIndex + 1} of ${curatedVoices.length} available)`,
        `Rate: ${rateVal}`,
        `Transition: ${transitions[autoPlaySettings.transition]}`,
        `Post-Focus: ${postFocus[autoPlaySettings.postFocus]}`,
        `Unit: ${units[autoPlaySettings.unit]}`,
        `Amount: ${amountLabels[autoPlaySettings.amount]}`
    ];
    return options[index];
}

export function handleInput(event) {
    if (!isInitialized) {
        if (event.key === 'Enter') {
            document.getElementById('init-button')?.click();
        }
        return;
    }
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

    const key = event.key;

    if (isWelcomeMode) {
        event.preventDefault(); // Kill all default browser actions

        if (key === 'Escape' || key === 'ArrowRight') {
            endWelcomeSequence();
            return;
        }

        if (key.toUpperCase() === 'X') {
            localStorage.setItem('skipWelcome', 'true');
            speak("Preference saved. Skipping orientation.");
            endWelcomeSequence();
            return;
        }

        return; // Swallow all other keys completely
    }

    if (isTutorialMode) {
        event.preventDefault();

        if (key === 'Escape') {
            endTutorialSequence();
            return;
        }

        if (!tutorialAudioEl) {
            speak('Tutorial player unavailable. Press Escape to continue.');
            return;
        }

        if (key === ' ') {
            if (tutorialAudioEl.paused) {
                tutorialAudioEl.play().catch((error) => {
                    console.warn('Tutorial audio play failed:', error);
                    speak('Playback unavailable.');
                });
                speak('Play.');
            } else {
                tutorialAudioEl.pause();
                speak('Pause.');
            }
            return;
        }

        if (key === 'ArrowLeft') {
            tutorialAudioEl.currentTime = Math.max(0, tutorialAudioEl.currentTime - 10);
            speak('Rewind 10 seconds.');
            return;
        }

        if (key === 'ArrowRight') {
            const duration = Number.isFinite(tutorialAudioEl.duration) ? tutorialAudioEl.duration : 0;
            const maxTime = duration > 0 ? duration : tutorialAudioEl.currentTime + 10;
            tutorialAudioEl.currentTime = Math.min(maxTime, tutorialAudioEl.currentTime + 10);
            speak('Fast forward 10 seconds.');
            return;
        }

        if (key === 'ArrowUp') {
            updateTutorialChapter(currentTutorialIndex - 1, true);
            return;
        }

        if (key === 'ArrowDown') {
            updateTutorialChapter(currentTutorialIndex + 1, true);
            return;
        }

        return;
    }

    if (key !== 'Shift' && key !== 'Control' && key !== 'Alt') {
        const isSearchNav = !event.shiftKey && (key === '[' || key === ']');
        const isBookmarkNav = event.shiftKey && (key === '{' || key === '}' || key === '[' || key === ']');
        if (!isSearchNav) consecutiveSearchJumps = 0;
        if (!isBookmarkNav) resetBookmarkJumps();
    }

    const keyUpper = key.toUpperCase();
    const isShift = event.shiftKey;

    if (isAutoPlaying && !['A', 'P', 'S', 'SHIFT', 'CONTROL', 'ALT'].includes(keyUpper) && !isAutoPlayMenuMode) {
        playAutoPlayUI('stop');
        stopAutoPlay();
    }

    // 1. Keyboard Explorer Mode (Highest Priority)
    if (typeof isKeyboardExplorer !== 'undefined' && isKeyboardExplorer) {
        if (key === 'F12' || key === 'Escape') {
            isKeyboardExplorer = false;
            speak("Keyboard Explorer disabled.");
            clearVisualBuffer();
            return;
        }
        event.preventDefault();
        speak(getKeyboardExplorerDescription(event));
        return;
    }

    // 2. Mode Toggles (F12 and ?)
    if (key === 'F12') {
        isKeyboardExplorer = true;
        speak("Keyboard Explorer enabled. Press F12 or Escape to exit.");
        updateVisualBuffer("KEYBOARD EXPLORER", "Press any key to hear its function.");
        event.preventDefault();
        return;
    }

    if (key === '?') {
        isHelpMenuMode = true;
        currentMenuIndex = 0;
        updateVisualBuffer("HELP MENU", helpMenuData[currentMenuIndex]);
        speak(helpMenuData[currentMenuIndex]);
        event.preventDefault();
        return;
    }

    // 3. Scoped Scroll Lock (Only triggers if NO menus are active)
    const buffer = document.getElementById('visual-buffer');
    const isBufferOpen = buffer && (buffer.style.display === 'flex' || buffer.style.display === 'block');
    const isMenuMode = (typeof isHelpMenuMode !== 'undefined' && isHelpMenuMode) ||
                       (typeof isAutoPlayMenuMode !== 'undefined' && isAutoPlayMenuMode) ||
                       (typeof isOptionsMenuMode !== 'undefined' && isOptionsMenuMode);

    if (isBufferOpen && !isMenuMode && (key === 'ArrowUp' || key === 'ArrowDown')) {
        if (key === 'ArrowUp') buffer.scrollTop -= 60;
        if (key === 'ArrowDown') buffer.scrollTop += 60;
        event.preventDefault();
        return;
    }

    if (isHelpMenuMode) {
        event.preventDefault();
        if (key === 'Escape') {
            isHelpMenuMode = false;
            currentMenuIndex = 0;
            speak("Help menu closed.");
            clearVisualBuffer();
            return;
        }
        if (key === 'ArrowDown') {
            currentMenuIndex = (currentMenuIndex + 1) % helpMenuData.length;
            updateVisualBuffer("HELP MENU", helpMenuData[currentMenuIndex]);
            speak(helpMenuData[currentMenuIndex]);
            return;
        }
        if (key === 'ArrowUp') {
            currentMenuIndex = (currentMenuIndex - 1 + helpMenuData.length) % helpMenuData.length;
            updateVisualBuffer("HELP MENU", helpMenuData[currentMenuIndex]);
            speak(helpMenuData[currentMenuIndex]);
            return;
        }
        speak("Help menu active. Use up and down arrows to navigate. Escape closes help.");
        return;
    }

    // ... standard navigation logic continues below ...

    if (isAutoPlayMenuMode) {
        event.preventDefault();

        if (key === 'Escape') {
            playAutoPlayUI('close');
            clearAllModes();
            speak('Auto Play menu closed');
            return;
        }

        if (key === 'Enter') {
            if (currentMenuIndex === 0 && curatedVoices[autoPlaySettings.voiceIndex]?.isHelp) {
                playAutoPlayUI('open');
                const docText = "For the highest quality, human-like Auto Play voices, Accessible Bible is best experienced in Microsoft Edge.";
                updateVisualBuffer("VOICE DOCUMENTATION", docText);
                speak(docText + " Press Escape to close the menu.");
            }
            return;
        }

        if (key === 'ArrowDown') {
            currentMenuIndex = (currentMenuIndex + 1) % 6;
            playAutoPlayUI('nav');
            const displayString = getAutoPlayMenuString(currentMenuIndex);
            updateVisualBuffer("AUTO PLAY MENU", getAutoPlayMenuString(currentMenuIndex));
            speak(displayString);
            return;
        }

        if (key === 'ArrowUp') {
            currentMenuIndex = (currentMenuIndex - 1 + 6) % 6;
            playAutoPlayUI('nav');
            const displayString = getAutoPlayMenuString(currentMenuIndex);
            updateVisualBuffer("AUTO PLAY MENU", getAutoPlayMenuString(currentMenuIndex));
            speak(displayString);
            return;
        }

        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const delta = key === 'ArrowRight' ? 1 : -1;

            if (currentMenuIndex === 0) {
                if (curatedVoices.length > 0) {
                    autoPlaySettings.voiceIndex = (autoPlaySettings.voiceIndex + delta + curatedVoices.length) % curatedVoices.length;
                }
            } else if (currentMenuIndex === 1) {
                const nextRate = autoPlaySettings.rate + (delta * 0.1);
                autoPlaySettings.rate = Math.max(0.5, Math.min(2.5, Number(nextRate.toFixed(1))));
            } else if (currentMenuIndex === 2) {
                autoPlaySettings.transition = (autoPlaySettings.transition + delta + 3) % 3;
            } else if (currentMenuIndex === 3) {
                autoPlaySettings.postFocus = (autoPlaySettings.postFocus + delta + 2) % 2;
            } else if (currentMenuIndex === 4) {
                autoPlaySettings.unit = (autoPlaySettings.unit + delta + 3) % 3;
            } else if (currentMenuIndex === 5) {
                autoPlaySettings.amount = (autoPlaySettings.amount + delta + 15) % 15;
            }

            saveAutoPlaySettings();
            playAutoPlayUI('change');
            const displayString = getAutoPlayMenuString(currentMenuIndex);
            updateVisualBuffer("AUTO PLAY MENU", getAutoPlayMenuString(currentMenuIndex));
            speak(displayString);
            return;
        }

        return;
    }

    if (isOptionsMenuMode) {
        event.preventDefault();

        if (key === 'Escape') {
            clearAllModes();
            speak("Menu closed");
            return;
        }

        if (key === 'ArrowDown') {
            currentMenuIndex = (currentMenuIndex + 1) % menuOptions.length;
            let announcement = (currentMenuIndex + 1) + " of " + menuOptions.length + ": " + menuOptions[currentMenuIndex];
            if (menuOptions[currentMenuIndex].startsWith("Boot Location")) {
                announcement += ", use spacebar to change";
            }
            updateVisualBuffer(currentMenuTitle, menuOptions[currentMenuIndex]);
            speak(announcement);
            return;
        }

        if (key === 'ArrowUp') {
            currentMenuIndex = (currentMenuIndex - 1 + menuOptions.length) % menuOptions.length;
            let announcement = (currentMenuIndex + 1) + " of " + menuOptions.length + ": " + menuOptions[currentMenuIndex];
            if (menuOptions[currentMenuIndex].startsWith("Boot Location")) {
                announcement += ", use spacebar to change";
            }
            updateVisualBuffer(currentMenuTitle, menuOptions[currentMenuIndex]);
            speak(announcement);
            return;
        }

        if (key === ' ') {
            if (menuOptions[currentMenuIndex].startsWith('Boot Location')) {
                cycleBootPreference();
                menuOptions[currentMenuIndex] = 'Boot Location: ' + bootPreference;
                return;
            }
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
                isOptionsMenuMode = false;
                speak("Note deleted.");
                return;
            }

            if (selected === 'Copy Verse') {
                const v = memoryCache[currentVerseIndex];
                const fullText = v.book_name + " " + v.chapter + ":" + v.verse + " - " + v.text;
                isOptionsMenuMode = false;
                copyToClipboard(fullText);
                return;
            }

            // Options Menu Logic
            if (selected === 'Export Personal Notes') {
                const exportTx = db.transaction([NOTES_STORE], "readonly");
                const exportRequest = exportTx.objectStore(NOTES_STORE).getAll();
                exportRequest.onsuccess = () => {
                    const blob = new Blob([JSON.stringify(exportRequest.result)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url; anchor.download = 'bible_notes_backup.json';
                    document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor); URL.revokeObjectURL(url);
                    isOptionsMenuMode = false; speak("Notes exported.");
                };
                return;
            }
            if (selected === 'Import Personal Notes') { importFileEl.click(); isOptionsMenuMode = false; return; }
            if (selected === 'Import Commentary') { importCommentaryEl.click(); isOptionsMenuMode = false; return; }
            if (selected === 'Clear Commentary') {
                db.transaction([COMMENTARY_STORE], "readwrite").objectStore(COMMENTARY_STORE).clear();
                isOptionsMenuMode = false; speak("Commentary cleared."); return;
            }

            // Omni-Jump Selection Link Handling
            if (/^\[\[.*\]\]$/.test(selected)) {
                const target = parseLinkTarget(selected);
                if (!target) {
                    speak("Invalid link target.");
                    return;
                }
                navigationHistory.push(currentVerseIndex);
                isOptionsMenuMode = false;
                jumpTo(target.book, target.chapter, target.verse);
                return;
            }
        }

        return;
    }

    if (key === 'Escape') {
        if (isAutoPlayMenuMode) { playAutoPlayUI('close'); }
        clearAllModes();
        event.preventDefault();
        speak("Search and modes cleared.");
        return;
    }

    if (key === 'Backspace') {
        event.preventDefault();
        if (navigationHistory.length > 0) {
            updateVerseIndex(navigationHistory.pop());
            const v = memoryCache[currentVerseIndex];
            playTone(600, 'sine', 0.1, 0.2);
            readCurrentVerse(false, "Returned to " + v.book_name + " chapter " + v.chapter + ", verse " + v.verse + ". ");
        } else {
            speak("No history.");
        }
        return;
    }

    if (event.shiftKey && (key === '{' || key === '}' || key === '[' || key === ']')) {
        event.preventDefault();
        navigateBookmarks((key === '}' || key === ']') ? 1 : -1);
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

        updateVerseIndex(memoryCache.findIndex(v => v === searchResults[currentSearchResultIndex]));
        const searchBadge = document.getElementById('alert-search');
        if (searchBadge) {
            searchBadge.style.display = 'inline-block';
            searchBadge.textContent = `SEARCH [${currentSearchResultIndex + 1} of ${searchResults.length}]`;
        }
        const v = memoryCache[currentVerseIndex];
        let prefix = "";
        if (consecutiveSearchJumps === 0) {
            prefix = `Match ${currentSearchResultIndex + 1} of ${searchResults.length}: ${v.book_name} chapter ${v.chapter}, verse ${v.verse} - `;
        } else {
            prefix = `${currentSearchResultIndex + 1}: ${v.book_name} chapter ${v.chapter}, verse ${v.verse} - `;
        }
        consecutiveSearchJumps++;
        speak(prefix + v.text);
        return;
    }

    // --- Tab: 'Where Am I?' ---
    if (key === 'Tab') {
        event.preventDefault();
        readCurrentVerse(true);
        return;
    }

    // --- Vertical Readout (Personal Note) ---
    if (key === 'ArrowUp') {
        event.preventDefault();
        if (!isReady || !db) return;
        const curVerse = memoryCache[currentVerseIndex];

        const tx = db.transaction([NOTES_STORE], "readonly");
        const req = tx.objectStore(NOTES_STORE).get(curVerse.id);
        req.onsuccess = () => {
            if (req.result && req.result.content && req.result.content.trim() !== '') {
                const rawText = req.result.content;
                speak(rawText);
                updateVisualBuffer("PERSONAL NOTE", rawText);
            } else {
                speak("No personal note.");
                updateVisualBuffer("PERSONAL NOTE", "No personal note.");
            }
        };
        return;
    }

    if (key === 'ArrowDown') {
        event.preventDefault();
        clearAllModes();
        isOptionsMenuMode = true;
        menuOptions = ['Edit Note', 'Delete Note', 'Copy Verse'];
        currentMenuIndex = 0;
        currentMenuTitle = "VERSE MENU";
        updateVisualBuffer(currentMenuTitle, menuOptions[0]);
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
            updateVisualBuffer(isChapterMode ? "Chapter Jump" : "Verse Jump", inputBuffer);
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
            lastBookSearchKey = '';
            currentBookSearchIndex = 0;
            speak("Search closed.");
            return;
        }
        event.preventDefault();
        const searchKey = key.toLowerCase();
        const matchingBooks = [...new Set(memoryCache.map(v => v.book_name))].filter(name => {
            const cleanName = name.replace(/^[1-3\s]+/, "").toLowerCase();
            return cleanName.startsWith(searchKey);
        });
        if (matchingBooks.length === 0) {
            speak("No book found for that letter.");
            return;
        }
        if (searchKey === lastBookSearchKey) {
            currentBookSearchIndex = (currentBookSearchIndex + 1) % matchingBooks.length;
        } else {
            currentBookSearchIndex = 0;
        }

        const targetBook = matchingBooks[currentBookSearchIndex];
        updateVisualBuffer("Book", targetBook);
        const firstVerseIdx = memoryCache.findIndex(v => v.book_name === targetBook);
        if (firstVerseIdx !== -1) {
            updateVerseIndex(firstVerseIdx);
            readCurrentVerse(true);
        }
        lastBookSearchKey = searchKey;
        lastSearchLetter = searchKey;
        return;
    }

    // --- Standard Key Routing ---
    switch(keyUpper) {
        case 'ARROWRIGHT':
            if (currentVerseIndex < memoryCache.length - 1) {
                updateVerseIndex(currentVerseIndex + 1);
                readCurrentVerse();
            } else {
                speak("End of library.");
            }
            break;
        case 'ARROWLEFT':
            if (currentVerseIndex > 0) {
                updateVerseIndex(currentVerseIndex - 1);
                readCurrentVerse();
            } else {
                speak("Beginning of library.");
            }
            break;
        case 'N':
            if (event.shiftKey) break;
            event.preventDefault();
            playNextTrack();
            break;
        case 'Y':
            event.preventDefault();
            if (!isReady || !db) break;
            {
                const curVerse = memoryCache[currentVerseIndex];
                const curriculumId = (curVerse.book_number * 1000000) + (curVerse.chapter * 1000) + curVerse.verse;
                const tx = db.transaction([COMMENTARY_STORE], "readonly");
                const req = tx.objectStore(COMMENTARY_STORE).get(curriculumId);
                req.onsuccess = () => {
                    if (req.result && req.result.content && req.result.content.trim() !== '') {
                        const rawText = req.result.content;
                        speak(rawText);
                        updateVisualBuffer("EXPERT COMMENTARY", rawText);
                    } else {
                        speak("No commentary available.");
                        updateVisualBuffer("EXPERT COMMENTARY", "No commentary available.");
                    }
                };
            }
            break;
        case 'K':
            if (event.shiftKey) break;
            event.preventDefault();
            toggleCurrentBookmark();
            break;
        case 'M':
            event.preventDefault();
            openNoteEditorForCurrentVerse();
            break;
        case 'H':
            event.preventDefault();
            if (event.shiftKey) {
                setMuteTutorialPrompt(!muteTutorialPrompt);
                localStorage.setItem('muteTutorialPrompt', muteTutorialPrompt.toString());
                speak(muteTutorialPrompt ? "Tutorial prompt muted." : "Tutorial prompt enabled.");
            } else {
                if (!isReady) break;
                clearAllModes();
                setTutorialMode(true);
                document.getElementById('app-container').style.display = 'none';
                const tutScreen = document.getElementById('tutorial-screen');
                tutScreen.style.display = 'flex';
                tutScreen.focus();
                playTutorialChapter(0);
            }
            break;
        case 'E':
            const testament = isReady ? memoryCache[currentVerseIndex].testament : 'unknown';
            speak(`Echo Chamber active. Index ${currentVerseIndex}. Testament: ${testament}. Ready state: ${isReady}`);
            break;
        case 'O':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isOptionsMenuMode = true;
            menuOptions = ['Export Personal Notes', 'Import Personal Notes', 'Import Commentary', 'Clear Commentary', 'Boot Location: ' + bootPreference];
            currentMenuIndex = 0;
            currentMenuTitle = "OPTIONS MENU";
            updateVisualBuffer(currentMenuTitle, menuOptions[0]);
            speak("Options Menu. 1 of 5: Export Personal Notes. Up and down arrows to navigate, Enter to select, Escape to close.");
            break;
        case 'A':
            event.preventDefault();
            clearAllModes();
            isAutoPlayMenuMode = true;
            currentMenuTitle = 'AUTO PLAY MENU';
            currentMenuIndex = 0;
            playAutoPlayUI('open');
            const introText = "Auto Play Menu. Use up and down arrows to navigate the menu. Use left and right arrows to cycle selections. Use Escape to save selections and exit. " + getAutoPlayMenuString(0);
            updateVisualBuffer(currentMenuTitle, introText);
            speak(introText);
            break;
        case 'P':
            event.preventDefault();
            if (isAutoPlaying) { playAutoPlayUI('stop'); pauseAutoPlay(); }
            else { playAutoPlayUI('play'); startAutoPlay(); }
            break;
        case 'B':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isBookSearchMode = true;
            updateVisualBuffer("Book Search", "Type a letter");
            speak("Book Search. Press a letter.");
            break;
        case 'R': {
            event.preventDefault();
            if (event.shiftKey) {
                localStorage.clear();
                location.reload();
                return;
            }
            if (!isReady) break;
            setAnchoredVerseIndex(currentVerseIndex);
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
                const curVerse = memoryCache[currentVerseIndex];
                const currentVerseId = curVerse.id;
                const curriculumId = (curVerse.book_number * 1000000) + (curVerse.chapter * 1000) + curVerse.verse;
                const tx = db.transaction([NOTES_STORE, COMMENTARY_STORE], "readonly");
                let noteLinks = [];
                let commLinks = [];
                let pending = 2;

                const processLinks = () => {
                    pending--;
                    if (pending > 0) return;
                    const allLinks = [...new Set([...noteLinks, ...commLinks])];

                    if (allLinks.length === 0) { speak("No links found."); return; }
                    if (allLinks.length === 1) {
                        const target = parseLinkTarget(allLinks[0]);
                        if (!target) { speak("Invalid link target."); return; }
                        navigationHistory.push(currentVerseIndex);
                        jumpTo(target.book, target.chapter, target.verse);
                        return;
                    }
                    clearAllModes();
                    isOptionsMenuMode = true;
                    menuOptions = allLinks;
                    currentMenuIndex = 0;
                    currentMenuTitle = "OMNI-JUMP MENU";
                    updateVisualBuffer(currentMenuTitle, menuOptions[0]);
                    speak("Omni-Jump. " + allLinks.length + " links found. 1 of " + allLinks.length + ": " + menuOptions[0] + ". Use arrows to select.");
                };

                const noteReq = tx.objectStore(NOTES_STORE).get(currentVerseId);
                noteReq.onsuccess = () => {
                    const content = noteReq.result?.content || '';
                    noteLinks = [...new Set([...content.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[0]))];
                    processLinks();
                };
                const commReq = tx.objectStore(COMMENTARY_STORE).get(curriculumId);
                commReq.onsuccess = () => {
                    const content = commReq.result?.content || '';
                    commLinks = [...new Set([...content.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[0]))];
                    processLinks();
                };
            }
            break;
        case 'F':
            event.preventDefault();
            if (!isReady || !searchInputEl) break;
            clearAllModes();
            isSearchMode = true;
            searchInputEl.value = '';
            updateSearchVisualBuffer('');
            searchInputEl.focus();
            speak("Word search. Type query and press Enter.");
            break;
        case 'C':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isChapterMode = true;
            updateVisualBuffer("Chapter Jump", "Type a number");
            speak("Chapter search. Enter numbers.");
            break;
        case 'V':
            event.preventDefault();
            if (event.shiftKey) {
                cycleVolume();
            } else {
                if (!isReady) break;
                clearAllModes();
                isVerseMode = true;
                updateVisualBuffer("Verse Jump", "Type a number");
                speak("Verse search. Enter numbers.");
            }
            break;
        case 'S': {
            event.preventDefault();
            if (isAutoPlaying) {
                playAutoPlayUI('stop');
                stopAutoPlay();
                break;
            }
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
        case '-':
            event.preventDefault();
            setCurrentFontSize(Math.max(12, currentFontSize - 2));
            document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
            speak("Text size " + currentFontSize);
            break;
        case '=':
        case '+':
            event.preventDefault();
            setCurrentFontSize(Math.min(72, currentFontSize + 2));
            document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
            speak("Text size " + currentFontSize);
            break;
        case 'T': {
            event.preventDefault();
            setCurrentThemeIndex((currentThemeIndex + 1) % THEMES.length);
            const newTheme = THEMES[currentThemeIndex];
            if (newTheme === 'default') {
                document.body.removeAttribute('data-theme');
            } else {
                document.body.setAttribute('data-theme', newTheme);
            }
            speak("Theme: " + newTheme);
            break;
        }
    }
}