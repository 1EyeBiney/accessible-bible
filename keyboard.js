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
    bootOptions, bootPreference, cycleBootPreference
} from './app.js';
import { 
    memoryCache, db, bookmarksCache, loadToMemory 
} from './db.js';
import { 
    playNextTrack, cycleVolume, playTone, silenceBootAudio 
} from './audio.js';
import { helpMenuData, NOTES_STORE, COMMENTARY_STORE, THEMES, muteTutorialPrompt, setMuteTutorialPrompt } from './config.js';

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
export let isMenuMode = false;
export let isKeyboardExplorer = false;
export let isHelpMode = false;
export let searchResults = [];
export let currentSearchResultIndex = -1;
export let menuOptions = [];
export let currentMenuIndex = 0;

export function clearAllModes() {
    isBookSearchMode = false; isChapterMode = false; isVerseMode = false;
    isSearchMode = false; isNoteMode = false; isMenuMode = false;
    isHelpMode = false; isKeyboardExplorer = false;
    inputBuffer = ''; lastSearchLetter = '';
    lastBookSearchKey = '';
    currentBookSearchIndex = 0;
}

export function setSearchMode(value) { isSearchMode = value; }
export function setNoteMode(value) { isNoteMode = value; }
export function getSearchMode() { return isSearchMode; }
export function getNoteMode() { return isNoteMode; }
export function setSearchResults(val) { searchResults = val; }
export function setCurrentSearchResultIndex(val) { currentSearchResultIndex = val; }

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

    const keyUpper = key.toUpperCase();

    if (isKeyboardExplorer) {
        event.preventDefault();
        if (event.key === 'Escape' || event.key === 'F12') {
            isKeyboardExplorer = false;
            speak("Exiting Keyboard Explorer.");
        } else {
            speak(getKeyboardExplorerDescription(event));
        }
        return;
    }

    if (isHelpMode) {
        event.preventDefault();
        if (event.key === 'Escape') {
            isHelpMode = false;
            currentHelpIndex = 0;
            speak("Help menu closed.");
            return;
        }
        if (event.key === 'ArrowDown') {
            currentHelpIndex = (currentHelpIndex + 1) % helpMenuData.length;
            speak(helpMenuData[currentHelpIndex]);
            return;
        }
        if (event.key === 'ArrowUp') {
            currentHelpIndex = (currentHelpIndex - 1 + helpMenuData.length) % helpMenuData.length;
            speak(helpMenuData[currentHelpIndex]);
            return;
        }
        speak("Help menu active. Use up and down arrows to navigate. Escape closes help.");
        return;
    }

    if (isMenuMode) {
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
            speak(announcement);
            return;
        }

        if (key === 'ArrowUp') {
            currentMenuIndex = (currentMenuIndex - 1 + menuOptions.length) % menuOptions.length;
            let announcement = (currentMenuIndex + 1) + " of " + menuOptions.length + ": " + menuOptions[currentMenuIndex];
            if (menuOptions[currentMenuIndex].startsWith("Boot Location")) {
                announcement += ", use spacebar to change";
            }
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
                    isMenuMode = false; speak("Notes exported.");
                };
                return;
            }
            if (selected === 'Import Personal Notes') { importFileEl.click(); isMenuMode = false; return; }
            if (selected === 'Import Commentary') { importCommentaryEl.click(); isMenuMode = false; return; }
            if (selected === 'Clear Commentary') {
                db.transaction([COMMENTARY_STORE], "readwrite").objectStore(COMMENTARY_STORE).clear();
                isMenuMode = false; speak("Commentary cleared."); return;
            }

            // Omni-Jump Selection Link Handling
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
            updateVerseIndex(navigationHistory.pop());
            readCurrentVerse();
            playTone(600, 'sine', 0.1, 0.2);
            speak("Returned.");
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
        speak(
            "Match " + (currentSearchResultIndex + 1) + " of " + searchResults.length + ": " +
            memoryCache[currentVerseIndex].book_name + " " + memoryCache[currentVerseIndex].chapter + ":" +
            memoryCache[currentVerseIndex].verse + " - " + memoryCache[currentVerseIndex].text
        );
        return;
    }

    // --- Tab: 'Where Am I?' ---
    if (key === 'Tab') {
        event.preventDefault();
        readCurrentVerse(true);
        return;
    }

    // --- Vertical Readout (Teacher & Student) ---
    if (key === 'ArrowUp') {
        event.preventDefault();
        if (!isReady || !db) return;
        const curVerse = memoryCache[currentVerseIndex];

        if (event.shiftKey) {
            const curriculumId = (curVerse.book_number * 1000000) + (curVerse.chapter * 1000) + curVerse.verse;
            const tx = db.transaction([COMMENTARY_STORE], "readonly");
            const req = tx.objectStore(COMMENTARY_STORE).get(curriculumId);
            req.onsuccess = () => {
                if (req.result && req.result.content && req.result.content.trim() !== '') {
                    speak("Commentary: " + req.result.content);
                } else {
                    speak("No commentary available.");
                }
            };
        } else {
            const tx = db.transaction([NOTES_STORE], "readonly");
            const req = tx.objectStore(NOTES_STORE).get(curVerse.id);
            req.onsuccess = () => {
                if (req.result && req.result.content && req.result.content.trim() !== '') {
                    speak("Note: " + req.result.content);
                } else {
                    speak("No personal note.");
                }
            };
        }
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
            isMenuMode = true;
            menuOptions = ['Export Personal Notes', 'Import Personal Notes', 'Import Commentary', 'Clear Commentary', 'Boot Location: ' + bootPreference];
            currentMenuIndex = 0;
            speak("Options Menu. 1 of 5: Export Personal Notes. Up and down arrows to navigate, Enter to select, Escape to close.");
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
                const currentVerseId = memoryCache[currentVerseIndex].id;
                const tx = db.transaction([NOTES_STORE, COMMENTARY_STORE], "readonly");
                let combinedContent = "";
                let pending = 2;

                const processLinks = () => {
                    pending--;
                    if (pending > 0) return;
                    const links = [...new Set([...combinedContent.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[0]))];

                    if (links.length === 0) { speak("No links found."); return; }
                    if (links.length === 1) {
                        const target = parseLinkTarget(links[0]);
                        if (!target) { speak("Invalid link target."); return; }
                        navigationHistory.push(currentVerseIndex);
                        jumpTo(target.book, target.chapter, target.verse);
                        return;
                    }
                    clearAllModes();
                    isMenuMode = true;
                    menuOptions = links;
                    currentMenuIndex = 0;
                    speak("Omni-Jump. " + links.length + " links found. 1 of " + links.length + ": " + menuOptions[0] + ". Use arrows to select.");
                };

                const noteReq = tx.objectStore(NOTES_STORE).get(currentVerseId);
                noteReq.onsuccess = () => { combinedContent += (noteReq.result?.content || '') + " "; processLinks(); };
                const commReq = tx.objectStore(COMMENTARY_STORE).get(currentVerseId);
                commReq.onsuccess = () => { combinedContent += (commReq.result?.content || '') + " "; processLinks(); };
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
            if (event.shiftKey) {
                cycleVolume();
            } else {
                if (!isReady) break;
                clearAllModes();
                isVerseMode = true;
                speak("Verse search. Enter numbers.");
            }
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