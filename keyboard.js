import { speak } from './ui.js';
import { fetchAndLoadCommentary, fetchAndLoadBible } from './app.js';
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
    bootOptions, bootPreference, cycleBootPreference, copyToClipboard, resetBookmarkJumps,
    activeMenu, activeReadMode, libraryOptions, setActiveMenu, setActiveReadMode, closeMenus
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

export function renderMenuVisuals(title, items, currentIndex) {
    const visualBuffer = document.getElementById('visual-buffer');
    if (!visualBuffer) return;
    visualBuffer.style.display = 'block';

    let html = `<div style="text-transform: uppercase; letter-spacing: 2px;">${title}</div>`;
    html += `<hr style="border-color: var(--accent-color); margin: 15px 0;">`;
    html += `<ul style="list-style: none; padding: 0; text-align: left; font-size: 1.8rem; line-height: 1.4;">`;

    items.forEach((item, index) => {
        if (index === currentIndex) {
            html += `<li style="color: var(--bg-color); background-color: var(--accent-color); padding: 10px; border-radius: 6px; margin-bottom: 5px;">▶ ${item}</li>`;
        } else {
            html += `<li style="padding: 10px; margin-bottom: 5px;">&nbsp;&nbsp;${item}</li>`;
        }
    });

    html += `</ul>`;
    visualBuffer.innerHTML = html;
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
export let isLibraryMode = false;
export let libraryManifest = [];
export let currentLibraryIndex = 0;
export let isVersionMode = false;
export let versionManifest = [];
export let currentVersionIndex = 0;
export let booksManifest = [];
export let currentBooksIndex = 0;
export let currentMenuTitle = "";
export let isKeyboardExplorer = false;
export let isHelpMode = false;
export let isHelpMenuMode = false;
export let searchResults = [];
export let currentSearchResultIndex = -1;
export let consecutiveSearchJumps = 0;
export let menuOptions = [];
export let currentMenuIndex = 0;
export const jumpAmounts = ['10s', '30s', '1m', '5m', '15m', '1%', '5%', '10%'];
export let currentJumpAmountIndex = 1;
export let hasHeardJumpInstructions = false;

export function clearAllModes() {
    isBookSearchMode = false; isChapterMode = false; isVerseMode = false;
    isSearchMode = false; isNoteMode = false; isOptionsMenuMode = false; isAutoPlayMenuMode = false;
    isLibraryMode = false;
    isVersionMode = false;
    isHelpMode = false; isHelpMenuMode = false; isKeyboardExplorer = false;
    currentMenuTitle = "";
    inputBuffer = ''; lastSearchLetter = '';
    lastBookSearchKey = '';
    currentBookSearchIndex = 0;
    setActiveMenu(null);
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
    const units = ["Verses", "Chapters", "Books", "Minutes"];
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
    const isMenuMode = (typeof isHelpMenuMode !== 'undefined' && isHelpMenuMode) ||
                       (typeof isAutoPlayMenuMode !== 'undefined' && isAutoPlayMenuMode) ||
                       (typeof isOptionsMenuMode !== 'undefined' && isOptionsMenuMode) ||
                       (typeof isLibraryMode !== 'undefined' && isLibraryMode);

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
            const autoPlayItems = [0, 1, 2, 3, 4, 5].map(i => getAutoPlayMenuString(i));
            renderMenuVisuals("AUTO PLAY MENU", autoPlayItems, currentMenuIndex);
            speak(displayString);
            return;
        }

        if (key === 'ArrowUp') {
            currentMenuIndex = (currentMenuIndex - 1 + 6) % 6;
            playAutoPlayUI('nav');
            const displayString = getAutoPlayMenuString(currentMenuIndex);
            const autoPlayItems = [0, 1, 2, 3, 4, 5].map(i => getAutoPlayMenuString(i));
            renderMenuVisuals("AUTO PLAY MENU", autoPlayItems, currentMenuIndex);
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
                autoPlaySettings.unit = (autoPlaySettings.unit + delta + 4) % 4;
            } else if (currentMenuIndex === 5) {
                autoPlaySettings.amount = (autoPlaySettings.amount + delta + 15) % 15;
            }

            saveAutoPlaySettings();
            playAutoPlayUI('change');
            const displayString = getAutoPlayMenuString(currentMenuIndex);
            const autoPlayItems = [0, 1, 2, 3, 4, 5].map(i => getAutoPlayMenuString(i));
            renderMenuVisuals("AUTO PLAY MENU", autoPlayItems, currentMenuIndex);
            speak(displayString);
            return;
        }

        return;
    }

    if (activeMenu === 'library') {
        event.preventDefault();

        if (key === 'Escape') {
            closeMenus();
            clearVisualBuffer();
            return;
        }

        if (key === 'ArrowDown') {
            currentLibraryIndex = (currentLibraryIndex + 1) % libraryOptions.length;
            renderMenuVisuals("LIBRARY", libraryOptions, currentLibraryIndex);
            speak(libraryOptions[currentLibraryIndex]);
            return;
        }

        if (key === 'ArrowUp') {
            currentLibraryIndex = (currentLibraryIndex - 1 + libraryOptions.length) % libraryOptions.length;
            renderMenuVisuals("LIBRARY", libraryOptions, currentLibraryIndex);
            speak(libraryOptions[currentLibraryIndex]);
            return;
        }

        if (key === 'Enter') {
            const selected = libraryOptions[currentLibraryIndex];
            if (selected === 'Commentaries') {
                fetch('./commentaries/manifest.json', { cache: 'no-store' })
                    .then(res => { if (!res.ok) throw new Error('Network error'); return res.json(); })
                    .then(data => {
                        libraryManifest = data;
                        currentLibraryIndex = 0;
                        setActiveMenu('commentaries');
                        const displayItems = libraryManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
                        renderMenuVisuals("COMMENTARY LIBRARY", displayItems, 0);
                        speak(`Commentaries. 1 of ${libraryManifest.length}. ${libraryManifest[0].title}. ${libraryManifest[0].description}`);
                    }).catch(() => speak("Could not reach commentary library."));
                return;
            }
            if (selected === 'Bibles') {
                fetch('./translations/manifest_bibles.json', { cache: 'no-store' })
                    .then(res => res.json())
                    .then(data => {
                        versionManifest = data;
                        currentVersionIndex = 0;
                        setActiveMenu('bibles');
                        const displayItems = versionManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
                        renderMenuVisuals("BIBLE VERSIONS", displayItems, currentVersionIndex);
                        speak(`Bibles. 1 of ${versionManifest.length}. ${versionManifest[0].title}.`);
                    }).catch(() => speak("Failed to load bible manifest."));
                return;
            }
            if (selected === 'Books') {
                fetch('./translations/manifest_books.json', { cache: 'no-store' })
                    .then(res => {
                        if (!res.ok) throw new Error('Fetch failed');
                        return res.json();
                    })
                    .then(data => {
                        setActiveReadMode("book");
                        booksManifest = data;
                        currentBooksIndex = 0;
                        setActiveMenu('books');
                        // Use standard mapping for Bible-formatted manifests
                        const displayItems = booksManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
                        renderMenuVisuals("BOOKS", displayItems, 0);
                        speak(`Books. 1 of ${booksManifest.length}. ${booksManifest[0].title}.`);
                    }).catch(err => {
                        console.error(err);
                        speak("Failed to load books manifest from the translations path.");
                    });
                return;
            }
        }

        return;
    }

    if (activeMenu === 'bibles') {
        event.preventDefault();

        if (key === 'Escape') {
            closeMenus();
            clearVisualBuffer();
            return;
        }

        if (key === 'ArrowDown') {
            currentVersionIndex = (currentVersionIndex + 1) % versionManifest.length;
            const item = versionManifest[currentVersionIndex];
            const displayItems = versionManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
            renderMenuVisuals("BIBLE VERSIONS", displayItems, currentVersionIndex);
            speak(`${currentVersionIndex + 1} of ${versionManifest.length}: ${item.title}.`);
            return;
        }

        if (key === 'ArrowUp') {
            currentVersionIndex = (currentVersionIndex - 1 + versionManifest.length) % versionManifest.length;
            const item = versionManifest[currentVersionIndex];
            const displayItems = versionManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
            renderMenuVisuals("BIBLE VERSIONS", displayItems, currentVersionIndex);
            speak(`${currentVersionIndex + 1} of ${versionManifest.length}: ${item.title}.`);
            return;
        }

        if (key === 'Enter') {
            const selectedFile = versionManifest[currentVersionIndex].filename;
            closeMenus();
            clearVisualBuffer();
            fetchAndLoadBible(selectedFile);
            return;
        }

        return;
    }

    if (activeMenu === 'books') {
        event.preventDefault();

        if (key === 'Escape') {
            closeMenus();
            clearVisualBuffer();
            return;
        }

        if (key === 'ArrowDown') {
            currentBooksIndex = (currentBooksIndex + 1) % booksManifest.length;
            const item = booksManifest[currentBooksIndex];
            const displayItems = booksManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
            renderMenuVisuals("BOOKS", displayItems, currentBooksIndex);
            speak(`${currentBooksIndex + 1} of ${booksManifest.length}: ${item.title}.`);
            return;
        }

        if (key === 'ArrowUp') {
            currentBooksIndex = (currentBooksIndex - 1 + booksManifest.length) % booksManifest.length;
            const item = booksManifest[currentBooksIndex];
            const displayItems = booksManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
            renderMenuVisuals("BOOKS", displayItems, currentBooksIndex);
            speak(`${currentBooksIndex + 1} of ${booksManifest.length}: ${item.title}.`);
            return;
        }

        if (key === 'Enter') {
            const selectedFile = booksManifest[currentBooksIndex].filename;
            closeMenus();
            clearVisualBuffer();
            fetchAndLoadBible(selectedFile, 'book');
            return;
        }

        return;
    }

    if (activeMenu === 'commentaries') {
        event.preventDefault();

        if (key === 'Escape') {
            closeMenus();
            clearVisualBuffer();
            return;
        }

        if (key === 'ArrowDown') {
            currentLibraryIndex = (currentLibraryIndex + 1) % libraryManifest.length;
            const item = libraryManifest[currentLibraryIndex];
            const displayItems = libraryManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
            renderMenuVisuals("COMMENTARY LIBRARY", displayItems, currentLibraryIndex);
            speak(`${currentLibraryIndex + 1} of ${libraryManifest.length}: ${item.title}. ${item.description}`);
            return;
        }

        if (key === 'ArrowUp') {
            currentLibraryIndex = (currentLibraryIndex - 1 + libraryManifest.length) % libraryManifest.length;
            const item = libraryManifest[currentLibraryIndex];
            const displayItems = libraryManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
            renderMenuVisuals("COMMENTARY LIBRARY", displayItems, currentLibraryIndex);
            speak(`${currentLibraryIndex + 1} of ${libraryManifest.length}: ${item.title}. ${item.description}`);
            return;
        }

        if (key === 'Enter') {
            fetchAndLoadCommentary(libraryManifest[currentLibraryIndex].filename);
            closeMenus();
            clearVisualBuffer();
            return;
        }

        return;
    }

    if (isLibraryMode) {
        event.preventDefault();

        if (key === 'Escape') {
            clearAllModes();
            speak("Library closed.");
            return;
        }

        if (key === 'ArrowDown') {
            currentLibraryIndex = (currentLibraryIndex + 1) % libraryManifest.length;
            const item = libraryManifest[currentLibraryIndex];
            const announcement = (currentLibraryIndex + 1) + " of " + libraryManifest.length + ": " + item.title + ". " + item.description;
            const displayItems = libraryManifest.map(item => `<strong>${item.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${item.description}</span>`);
            renderMenuVisuals("COMMENTARY LIBRARY", displayItems, currentLibraryIndex);
            speak(announcement);
            return;
        }

        if (key === 'ArrowUp') {
            currentLibraryIndex = (currentLibraryIndex - 1 + libraryManifest.length) % libraryManifest.length;
            const item = libraryManifest[currentLibraryIndex];
            const announcement = (currentLibraryIndex + 1) + " of " + libraryManifest.length + ": " + item.title + ". " + item.description;
            const displayItems = libraryManifest.map(item => `<strong>${item.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${item.description}</span>`);
            renderMenuVisuals("COMMENTARY LIBRARY", displayItems, currentLibraryIndex);
            speak(announcement);
            return;
        }

        if (key === 'Enter') {
            fetchAndLoadCommentary(libraryManifest[currentLibraryIndex].filename);
            clearAllModes();
            return;
        }

        return;
    }

    if (isVersionMode) {
        event.preventDefault();

        if (key === 'Escape') {
            clearAllModes();
            clearVisualBuffer();
            speak("Exited Version Library.");
            return;
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            if (key === 'ArrowDown') currentVersionIndex = (currentVersionIndex + 1) % versionManifest.length;
            if (key === 'ArrowUp') currentVersionIndex = (currentVersionIndex - 1 + versionManifest.length) % versionManifest.length;
            const item = versionManifest[currentVersionIndex];
            const displayItems = versionManifest.map(i => `<strong>${i.title}</strong><br><span style="font-size: 1.2rem; opacity: 0.9;">${i.description}</span>`);
            renderMenuVisuals("VERSION LIBRARY", displayItems, currentVersionIndex);
            speak(`${currentVersionIndex + 1} of ${versionManifest.length}: ${item.title}.`);
            return;
        }
        if (key === 'Enter') {
            const selectedFile = versionManifest[currentVersionIndex].filename;
            clearAllModes();
            clearVisualBuffer();
            fetchAndLoadBible(selectedFile);
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
            renderMenuVisuals(currentMenuTitle, menuOptions, currentMenuIndex);
            speak(announcement);
            return;
        }

        if (key === 'ArrowUp') {
            currentMenuIndex = (currentMenuIndex - 1 + menuOptions.length) % menuOptions.length;
            let announcement = (currentMenuIndex + 1) + " of " + menuOptions.length + ": " + menuOptions[currentMenuIndex];
            if (menuOptions[currentMenuIndex].startsWith("Boot Location")) {
                announcement += ", use spacebar to change";
            }
            renderMenuVisuals(currentMenuTitle, menuOptions, currentMenuIndex);
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

        if (activeReadMode === 'book') {
            const pct = Math.round(((currentVerseIndex + 1) / memoryCache.length) * 100);
            if (consecutiveSearchJumps === 0) {
                prefix = `Match ${currentSearchResultIndex + 1} of ${searchResults.length}. Chapter ${v.chapter}, ${pct} percent completed. `;
            } else {
                prefix = `${currentSearchResultIndex + 1}. Chapter ${v.chapter}, ${pct} percent. `;
            }
        } else {
            if (consecutiveSearchJumps === 0) {
                prefix = `Match ${currentSearchResultIndex + 1} of ${searchResults.length}: ${v.book_name} chapter ${v.chapter}, verse ${v.verse} - `;
            } else {
                prefix = `${currentSearchResultIndex + 1}: ${v.book_name} chapter ${v.chapter}, verse ${v.verse} - `;
            }
        }

        consecutiveSearchJumps++;
        speak(prefix + v.text);
        return;
    }

    // --- Tab: 'Where Am I?' ---
    if (key === 'Tab') {
        event.preventDefault();
        if (activeReadMode === 'book' && memoryCache.length > 0) {
            const pct = Math.round(((currentVerseIndex + 1) / memoryCache.length) * 100);
            const currentChap = memoryCache[currentVerseIndex].chapter;
            speak(`Chapter ${currentChap}. ${pct} percent completed.`);
        } else {
            readCurrentVerse(true);
        }
        return;
    }

    // --- Vertical Readout (Personal Note) ---
    if (key === 'ArrowUp' && !event.shiftKey) {
        event.preventDefault();
        if (!isReady || !db) return;
        if (activeReadMode === 'book') {
            speak("Notes are disabled in Book mode.");
            updateVisualBuffer("PERSONAL NOTE", "Notes are disabled in Book mode.");
            return;
        }
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

    // --- Page Navigation ---
    if (key === 'PageDown' || key === 'PageUp') {
        event.preventDefault();
        if (!isReady) return;
        clearVisualBuffer();
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

    // --- Chronos Auto Jump Engine ---
    if (event.shiftKey && ["ARROWUP", "ARROWDOWN", "ARROWLEFT", "ARROWRIGHT"].includes(keyUpper)) {
        event.preventDefault();
        if (!isReady || memoryCache.length === 0) return;

        // Cycle Jump Amounts
        if (keyUpper === "ARROWUP" || keyUpper === "ARROWDOWN") {
            const dir = keyUpper === "ARROWUP" ? 1 : -1;
            currentJumpAmountIndex = (currentJumpAmountIndex + dir + jumpAmounts.length) % jumpAmounts.length;
            const val = jumpAmounts[currentJumpAmountIndex];
            
            let timeLabel = val;
            if (val === '10s') timeLabel = "10 seconds";
            if (val === '30s') timeLabel = "30 seconds";
            if (val === '1m') timeLabel = "1 minute";
            if (val === '5m') timeLabel = "5 minutes";
            if (val === '15m') timeLabel = "15 minutes";
            if (val.includes('%')) timeLabel = val.replace('%', ' percent');

            let instruction = "";
            if (!hasHeardJumpInstructions) {
                instruction = ". Press Shift plus Right Arrow to jump forward, and Shift plus Left Arrow to jump backward.";
                hasHeardJumpInstructions = true;
            }
            speak(`Jump amount ${timeLabel}${instruction}`);
            return;
        }

        // Execute Time Jump
        if (keyUpper === "ARROWLEFT" || keyUpper === "ARROWRIGHT") {
            const isForward = keyUpper === "ARROWRIGHT";
            const val = jumpAmounts[currentJumpAmountIndex];
            let newIndex = currentVerseIndex;

            if (val.includes('%')) {
                // Absolute Percentage Math
                const pct = parseInt(val.replace('%', ''), 10);
                const jumpCount = Math.max(1, Math.round(memoryCache.length * (pct / 100)));
                if (isForward) {
                    newIndex = Math.min(memoryCache.length - 1, currentVerseIndex + jumpCount);
                } else {
                    newIndex = Math.max(0, currentVerseIndex - jumpCount);
                }
            } else {
                // Estimated Time Math (Anti-Freeze Optimization)
                let seconds = 0;
                if (val.endsWith('s')) seconds = parseInt(val.replace('s', ''), 10);
                if (val.endsWith('m')) seconds = parseInt(val.replace('m', ''), 10) * 60;

                const wpm = 150 * autoPlaySettings.rate;
                const targetWords = Math.round((wpm / 60) * seconds);
                let wordsCounted = 0;

                while (wordsCounted < targetWords) {
                    if (isForward) {
                        if (newIndex >= memoryCache.length - 1) break;
                        newIndex++;
                    } else {
                        if (newIndex <= 0) break;
                        newIndex--;
                    }
                    const charLength = memoryCache[newIndex].text.trim().length;
                    wordsCounted += Math.max(1, Math.round(charLength / 6));
                }
            }

            const wasPlaying = isAutoPlaying;
            if (wasPlaying) pauseAutoPlay();

            updateVerseIndex(newIndex);
            clearVisualBuffer();

            let timeLabel = val;
            if (val === '10s') timeLabel = "10 seconds";
            if (val === '30s') timeLabel = "30 seconds";
            if (val === '1m') timeLabel = "1 minute";
            if (val === '5m') timeLabel = "5 minutes";
            if (val === '15m') timeLabel = "15 minutes";
            if (val.includes('%')) timeLabel = val.replace('%', ' percent');

            const prefix = isForward ? `Fast forwarded ${timeLabel}. ` : `Rewound ${timeLabel}. `;
            readCurrentVerse(false, prefix);

            if (wasPlaying) setTimeout(startAutoPlay, 500);
            return;
        }
    }

    // --- Standard Key Routing ---
    switch(keyUpper) {
        case 'ARROWRIGHT':
            if (currentVerseIndex < memoryCache.length - 1) {
                updateVerseIndex(currentVerseIndex + 1);
                clearVisualBuffer();
                readCurrentVerse();
            } else {
                speak("End of library.");
            }
            break;
        case 'ARROWLEFT':
            if (currentVerseIndex > 0) {
                updateVerseIndex(currentVerseIndex - 1);
                clearVisualBuffer();
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
            if (activeReadMode === 'book') {
                speak("Commentary is disabled in Book mode.");
                break;
            }
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
            if (activeReadMode === 'book') {
                speak("Notes are disabled in Book mode.");
                break;
            }
            openNoteEditorForCurrentVerse();
            break;
        case 'U':
            event.preventDefault();
            if (activeReadMode === 'book') {
                const v = memoryCache[currentVerseIndex];
                const fullText = v.book_name + " Chapter " + v.chapter + " Paragraph " + v.verse + " - " + v.text;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(fullText).then(() => speak("Paragraph copied to clipboard."));
                } else {
                    speak("Clipboard error.");
                }
                break;
            }
            clearAllModes();
            isOptionsMenuMode = true;
            menuOptions = ['Edit Note', 'Delete Note', 'Copy Verse'];
            currentMenuIndex = 0;
            currentMenuTitle = "VERSE MENU";
            renderMenuVisuals(currentMenuTitle, menuOptions, currentMenuIndex);
            speak("Verse Menu. 1 of 3: Edit Note. Up and down to navigate, Enter to select, Escape to cancel.");
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
            break;
        case 'O':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            isOptionsMenuMode = true;
            menuOptions = ['Export Personal Notes', 'Import Personal Notes', 'Boot Location: ' + bootPreference];
            currentMenuIndex = 0;
            currentMenuTitle = "OPTIONS MENU";
            renderMenuVisuals(currentMenuTitle, menuOptions, currentMenuIndex);
            speak("Options Menu. 1 of 3: Export Personal Notes. Up and down arrows to navigate, Enter to select, Escape to close.");
            break;
        case 'A':
            event.preventDefault();
            clearAllModes();
            isAutoPlayMenuMode = true;
            currentMenuTitle = 'AUTO PLAY MENU';
            currentMenuIndex = 0;
            playAutoPlayUI('open');
            const introText = "Auto Play Menu. Use up and down arrows to navigate the menu. Use left and right arrows to cycle selections. Use Escape to save selections and exit. " + getAutoPlayMenuString(0);
            const autoPlayItems = [0, 1, 2, 3, 4, 5].map(i => getAutoPlayMenuString(i));
            renderMenuVisuals('AUTO PLAY MENU', autoPlayItems, 0);
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
            if (activeReadMode === 'book') {
                // In book mode, jump to the next section (where book_number increases)
                const curBookNum = memoryCache[currentVerseIndex].book_number;
                const nextPartIdx = memoryCache.findIndex((v, i) => i > currentVerseIndex && v.book_number > curBookNum);
                if (nextPartIdx !== -1) {
                    updateVerseIndex(nextPartIdx);
                    readCurrentVerse(false, 'Next Part. ');
                } else {
                    speak("End of book.");
                }
                break;
            }
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
            event.preventDefault();
            if (!event.altKey) {
                // Bare L: Open Master Library Menu
                clearAllModes();
                setActiveMenu('library');
                currentLibraryIndex = 0;
                renderMenuVisuals("LIBRARY", libraryOptions, 0);
                speak("Library. Use up and down arrows to navigate. Press enter to select. Commentaries.");
                break;
            }
            // Alt + L: Drop relational link
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
                if (activeReadMode === 'book') {
                    speak("Verse jumping disabled. Use arrows to navigate paragraphs.");
                    break;
                }
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