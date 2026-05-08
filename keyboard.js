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
    activeMenu, activeReadMode, libraryOptions, setActiveMenu, setActiveReadMode, closeMenus,
    updateStudySummaryBanner, hideStudySummaryBanner
} from './app.js';
import { 
    memoryCache, db, bookmarksCache, loadToMemory 
} from './db.js';
import { 
    playNextTrack, cycleVolume, playTone, playEcho, silenceBootAudio 
} from './audio.js';
import { startAutoPlay, pauseAutoPlay, stopAutoPlay, isAutoPlaying, autoPlaySettings, curatedVoices, playAutoPlayUI, saveAutoPlaySettings } from './autoplay.js';
import { helpMenuData, NOTES_STORE, COMMENTARY_STORE, THEMES, muteTutorialPrompt, setMuteTutorialPrompt, DB_NAME } from './config.js';
import { generateStudyPlan } from './jit/orchestrator.js';
import { getAllSorted as getAllCachedPlans, remove as removeCachedPlan, setFavorite as setCachedFavorite, getFavoriteCount as getCachedFavoriteCount, FAVORITE_HARD_CAP } from './jit/planCache.js';
import { getKey, setKey, clearKey, hasKey, redactedDisplay } from './jit/vault.js';
import {
    getActivePlan, setActivePlan, clearActivePlan,
    findStepForVerse, advanceStep, getCurrentStepVerse
} from './jit/activePlan.js';

// Active BYOK provider. Single-source-of-truth for R-3 wiring; R-7 will
// promote this to a runtime selector across multiple providers.
const ACTIVE_PROVIDER = 'gemini';

const visualBuffer = document.getElementById('visual-buffer');

export function updateVisualBuffer(modeText, valueText) {
    if (!visualBuffer) return;
    const menuBackdrop = document.getElementById('menu-backdrop');
    if (!modeText) {
        visualBuffer.style.display = 'none';
        if (menuBackdrop) menuBackdrop.style.display = 'none';
    } else {
        visualBuffer.style.display = 'block';
        if (menuBackdrop) menuBackdrop.style.display = 'block';
        visualBuffer.textContent = modeText + (valueText ? ": " + valueText : "...");
    }
}

export function renderMenuVisuals(title, items, currentIndex, subtitle = '') {
    const visualBuffer = document.getElementById('visual-buffer');
    if (!visualBuffer) return;
    visualBuffer.style.display = 'block';
    const menuBackdrop = document.getElementById('menu-backdrop');
    if (menuBackdrop) menuBackdrop.style.display = 'block';

    let html = `<div style="text-transform: uppercase; letter-spacing: 2px;">${title}</div>`;
    html += `<hr style="border-color: var(--accent-color); margin: 15px 0;">`;
    if (subtitle) {
        html += `<div aria-hidden="true" style="font-size: 1.2rem; opacity: 0.9; font-style: italic; border-left: 3px solid var(--accent-color); padding-left: 10px; margin-bottom: 15px;">${subtitle}</div>`;
    }
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
export let isVaultInputMode = false;
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

// --- JIT Study Plan State ---
export let isJitLoading = false;
export let isJitInputMode = false;
export let isStudyLibraryMode = false;
let studyLibraryEntries = [];   // master list, raw lastAccessed-DESC order
let studyLibrarySortedView = []; // current rendered projection
let currentSortMode = 'recent';  // 'recent' | 'alpha' | 'favorites'
const STUDY_SORT_MODES = ['recent', 'alpha', 'favorites'];
const STUDY_SORT_STORAGE_KEY = 'studyLibrarySortMode';
let jitAbortController = null;
let heartbeatInterval = null;
let jitTimeoutId = null;

// --- Idempotent input-listener tracker (B1 pattern) ---
// Only one keydown handler may be bound to searchInputEl at a time.
// All modes that attach a handler must route through this slot so
// clearAllModes() can detach it cleanly before any new mode binds.
let activeInputHandler = null;

export function clearAllModes() {
    // Detach any active searchInputEl listener before flipping flags,
    // so a previous mode's Enter/Escape branch cannot fire after a
    // new mode has taken over.
    if (activeInputHandler && searchInputEl) {
        searchInputEl.removeEventListener('keydown', activeInputHandler);
        activeInputHandler = null;
    }
    isBookSearchMode = false; isChapterMode = false; isVerseMode = false;
    isSearchMode = false; isNoteMode = false; isOptionsMenuMode = false; isAutoPlayMenuMode = false;
    isVaultInputMode = false;
    isLibraryMode = false;
    isVersionMode = false;
    isHelpMode = false; isHelpMenuMode = false; isKeyboardExplorer = false;
    isJitInputMode = false;
    isStudyLibraryMode = false;
    studyLibraryEntries = [];
    studyLibrarySortedView = [];
    // Defensive: if the JIT modal is open when another mode forces a
    // mode-clear (e.g. mid-prompt translation switch), tear it down.
    const jitModal = document.getElementById('jit-modal');
    if (jitModal && jitModal.style.display !== 'none') {
        try { closeJitModal(false); } catch (_) { jitModal.style.display = 'none'; }
    }
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

// =====================================================================
// JIT Study Plan — Outer Wall, State Management, Heartbeat, Cancellation
// =====================================================================

function startHeartbeatPulse() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(() => {
        // Sound 24: Lifeboat Event (800Hz sine with 0.3s echo delay)
        playEcho('sine', 800, null, 0.1, 0.4, 0.3);
    }, 2500);
}

function stopHeartbeatPulse() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function enterJitLoadingState() {
    isJitLoading = true;
    jitAbortController = new AbortController();
    startHeartbeatPulse();
    updateVisualBuffer("GENERATING STUDY PLAN", "Working... Press Escape to cancel.");
    speak("Generating study plan. This may take a few seconds. Press Escape to cancel.");
}

function exitJitLoadingState() {
    isJitLoading = false;
    jitAbortController = null;
    stopHeartbeatPulse();
    if (jitTimeoutId) {
        clearTimeout(jitTimeoutId);
        jitTimeoutId = null;
    }
    clearVisualBuffer();
}

function isStudyPlanError(err) {
    // Duck-type detection: anything our orchestrator throws will carry userMessage.
    return !!(err && typeof err === 'object' && typeof err.userMessage === 'string');
}

export async function triggerJitStudyPlan(topic, filter = '', verseCount = 5) {
    if (isJitLoading) return;            // Re-entry guard.
    if (!topic || !topic.trim()) {
        speak("No topic provided.");
        return;
    }

    // Sanity check: there must be an active verse to anchor the back-stack
    // before we push history and jump to step 0.
    if (memoryCache[currentVerseIndex]?.id == null) {
        speak("Cannot start study plan: no active verse.");
        return;
    }

    enterJitLoadingState();

    // Hard 30-second timeout — separate from user cancellation.
    jitTimeoutId = setTimeout(() => {
        if (jitAbortController) {
            try {
                jitAbortController.abort(new DOMException('timeout', 'TimeoutError'));
            } catch (_) {
                jitAbortController.abort();
            }
        }
    }, 30000);

    try {
        const manifestId = (typeof localStorage !== 'undefined' && localStorage.getItem('currentBibleFile')) || 'default';
        const { plan, cacheKey } = await generateStudyPlan(topic, filter, verseCount, manifestId, {
            signal: jitAbortController.signal
        });

        // Distinct completion tone — slightly higher than heartbeat, brief.
        playTone(880, 'sine', 0.15, 0.25);

        // Third Track: install plan as RAM-resident overlay. No DB writes.
        setActivePlan(plan, { cacheKey, manifestId });
        updateStudySummaryBanner(plan, 0);

        // Push current location to history so Backspace reverses out of
        // the plan, then jump to step 0 and announce summary.
        navigationHistory.push(currentVerseIndex);
        const firstStep = getCurrentStepVerse();
        speak(`Study plan ready. ${plan.summary || ''} Jumping to step 1 of ${plan.verses.length}. Press I for insight, Alt plus J for next step, Escape to exit.`);
        if (firstStep) {
            jumpTo(firstStep.book_name, firstStep.chapter, firstStep.verse);
        }
    } catch (err) {
        let safe;
        if (isStudyPlanError(err)) {
            safe = err;
        } else if (err && err.name === 'AbortError') {
            safe = {
                userMessage: 'Plan generation was cancelled.',
                recoverable: true
            };
        } else {
            // Unforeseen native error — coerce into the announcement contract.
            safe = {
                userMessage: 'Something went wrong. Please try again.',
                recoverable: true
            };
        }

        const suffix = safe.recoverable
            ? ' Press G to try again.'
            : ' Press Escape to return to study mode.';
        speak(safe.userMessage + suffix);
    } finally {
        exitJitLoadingState();
    }
}

/**
 * External hook for app.js: abort any in-flight JIT generation and
 * clear the active plan overlay (e.g. on translation switch).
 */
export function abortActiveJit(reason) {
    if (jitAbortController) {
        try { jitAbortController.abort(new DOMException(reason || 'translation-change', 'AbortError')); }
        catch (_) { try { jitAbortController.abort(); } catch (_) {} }
    }
    clearActivePlan(reason || 'external');
    hideStudySummaryBanner();
}

// =====================================================================
// JIT Study Plan — Search Modal (v68.0 / v68.1)
// =====================================================================

const JIT_VERSE_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10, 15];
const JIT_DEFAULT_COUNT = 5;

/**
 * Library entry label (v69.0, extended v69.2).
 *
 * @param {Object} entry  — { cacheKey, plan, meta, isFavorite, ... }
 * @param {Object} [opts]
 * @param {boolean} [opts.visual=false]  — true → use ★ glyph; false → "Pinned. " word prefix for TTS
 */
function formatLibraryEntry(entry, opts = {}) {
    if (!entry || !entry.plan) return 'Empty entry';
    const plan = entry.plan;
    const topic = plan.topic || (entry.meta && entry.meta.topic) || 'Untitled';
    const filter = plan.flavor || (entry.meta && entry.meta.filter) || '';
    const count = Number.isFinite(plan.actual_verse_count)
        ? plan.actual_verse_count
        : (Array.isArray(plan.verses) ? plan.verses.length : 0);
    const filterPart = filter ? `, filter ${filter}` : '';
    const body = `${topic} (${count} verses${filterPart})`;
    if (entry.isFavorite === true) {
        return opts.visual ? `★ ${body}` : `Pinned. ${body}`;
    }
    return body;
}

/**
 * Pure sort/filter projection for the Study Library. Returns a new
 * array; never mutates input. Source of truth for the rendered list.
 */
function deriveStudyLibraryView(entries, mode) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    if (mode === 'alpha') {
        return entries.slice().sort((a, b) => {
            const ta = (a.plan?.topic || '').toLowerCase();
            const tb = (b.plan?.topic || '').toLowerCase();
            return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
        });
    }
    if (mode === 'favorites') {
        // Already lastAccessed DESC from getAllSorted(); just filter.
        return entries.filter(e => e.isFavorite === true);
    }
    // 'recent' is identity — getAllSorted returned lastAccessed DESC.
    return entries.slice();
}

function loadPersistedSortMode() {
    try {
        const v = localStorage.getItem(STUDY_SORT_STORAGE_KEY);
        return STUDY_SORT_MODES.includes(v) ? v : 'recent';
    } catch (_) {
        return 'recent';
    }
}

function persistSortMode(mode) {
    try { localStorage.setItem(STUDY_SORT_STORAGE_KEY, mode); }
    catch (_) { /* private mode, ignore */ }
}

function describeSortMode(mode, viewLen, totalLen) {
    if (mode === 'alpha')     return `View: Alphabetical. ${viewLen} plan${viewLen === 1 ? '' : 's'}.`;
    if (mode === 'favorites') return `View: Favorites. ${viewLen} of ${totalLen} pinned.`;
    return `View: Recent. ${viewLen} plan${viewLen === 1 ? '' : 's'}.`;
}

function renderStudyLibrary() {
    const labels = studyLibrarySortedView.map(e => formatLibraryEntry(e, { visual: true }));
    // Pass the focused entry's summary as a subtitle — visible only to sighted
    // users via the visual buffer (aria-hidden). Screen readers receive the
    // summary via speak() at plan-load time and via Tab, not this DOM path.
    const summary = studyLibrarySortedView[currentMenuIndex]?.plan?.summary || '';
    renderMenuVisuals(currentMenuTitle, labels, currentMenuIndex, summary);
}

let jitModalEl = null;
let jitModalFormEl = null;
let jitTopicInputEl = null;
let jitFilterInputEl = null;
let jitCountInputEl = null;
let jitCountIndex = JIT_VERSE_COUNTS.indexOf(JIT_DEFAULT_COUNT);
let jitModalSubmitHandler = null;
let jitModalKeydownHandler = null;
let jitCountKeydownHandler = null;

function ensureJitModalRefs() {
    if (jitModalEl) return true;
    jitModalEl = document.getElementById('jit-modal');
    jitModalFormEl = document.getElementById('jit-modal-form');
    jitTopicInputEl = document.getElementById('jit-topic-input');
    jitFilterInputEl = document.getElementById('jit-filter-input');
    jitCountInputEl = document.getElementById('jit-count-input');
    return !!(jitModalEl && jitModalFormEl && jitTopicInputEl && jitFilterInputEl && jitCountInputEl);
}

function setJitCount(idx) {
    if (!jitCountInputEl) return;
    const len = JIT_VERSE_COUNTS.length;
    jitCountIndex = ((idx % len) + len) % len;
    const next = JIT_VERSE_COUNTS[jitCountIndex];
    // Sync BOTH the live property and the rendered attribute so the
    // value the user sees (and submit reads) is the value we just set.
    jitCountInputEl.value = String(next);
    jitCountInputEl.setAttribute('value', String(next));
}

function setJitCountByValue(n) {
    const idx = JIT_VERSE_COUNTS.indexOf(parseInt(n, 10));
    setJitCount(idx >= 0 ? idx : JIT_VERSE_COUNTS.indexOf(JIT_DEFAULT_COUNT));
}

function submitJitModal() {
    if (!jitModalFormEl) return;
    // Use requestSubmit so the registered 'submit' handler fires;
    // .submit() bypasses listeners and would skip our pipeline.
    if (typeof jitModalFormEl.requestSubmit === 'function') {
        jitModalFormEl.requestSubmit();
    } else {
        jitModalFormEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
}

export function closeJitModal(announce = false) {
    if (!ensureJitModalRefs()) return;
    if (jitModalSubmitHandler) {
        jitModalFormEl.removeEventListener('submit', jitModalSubmitHandler);
        jitModalSubmitHandler = null;
    }
    if (jitModalKeydownHandler) {
        jitModalEl.removeEventListener('keydown', jitModalKeydownHandler, true);
        jitModalKeydownHandler = null;
    }
    if (jitCountKeydownHandler && jitCountInputEl) {
        jitCountInputEl.removeEventListener('keydown', jitCountKeydownHandler);
        jitCountKeydownHandler = null;
    }
    jitModalEl.style.display = 'none';
    jitTopicInputEl.value = '';
    jitFilterInputEl.value = '';
    setJitCount(JIT_VERSE_COUNTS.indexOf(JIT_DEFAULT_COUNT));
    isJitInputMode = false;
    document.getElementById('focus-trap')?.focus();
    if (announce) speak("Study plan cancelled.");
}

function openJitModal() {
    if (!ensureJitModalRefs()) {
        speak("Study plan modal is unavailable.");
        return;
    }
    isJitInputMode = true;
    jitTopicInputEl.value = '';
    jitFilterInputEl.value = '';
    setJitCount(JIT_VERSE_COUNTS.indexOf(JIT_DEFAULT_COUNT));
    jitModalEl.style.display = 'flex';

    // Capture-phase keydown on the modal root.
    //   - Escape: tear down (must beat anything else).
    //   - Enter on non-count fields: force form submit.
    //   - Everything else: PASS THROUGH untouched. We must NOT call
    //     stopPropagation() in capture phase, or events never reach
    //     the inner listeners (e.g. the count input's Arrow handler).
    //     The global window keydown router already short-circuits on
    //     isJitInputMode, so leakage is impossible.
    jitModalKeydownHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeJitModal(true);
            return;
        }
        if (e.key === 'Enter') {
            // The readonly count input has its own Enter handler that
            // also calls submitJitModal(); guard against double-fire by
            // letting the count handler win when it's the target.
            if (e.target === jitCountInputEl) return;
            e.preventDefault();
            e.stopPropagation();
            submitJitModal();
            return;
        }
        // Tab, Arrows, character keys: do nothing. Native focus
        // traversal and inner listeners take over.
    };
    jitModalEl.addEventListener('keydown', jitModalKeydownHandler, true);

    // Verse-count cycler: ArrowUp/Down moves through JIT_VERSE_COUNTS.
    // Enter submits. Everything else is swallowed so screen readers do
    // not announce typing into a readonly box.
    jitCountKeydownHandler = (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            setJitCount(jitCountIndex + 1);
            speak(`${JIT_VERSE_COUNTS[jitCountIndex]} verses.`);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            setJitCount(jitCountIndex - 1);
            speak(`${JIT_VERSE_COUNTS[jitCountIndex]} verses.`);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            submitJitModal();
        } else if (e.key === 'Tab' || e.key === 'Escape') {
            // Let the modal-level handler (Escape) or native focus
            // traversal (Tab) take over.
            return;
        } else {
            // Block character keys from being typed into the readonly
            // input. No need to stopPropagation — global router is gated
            // on isJitInputMode.
            e.preventDefault();
        }
    };
    jitCountInputEl.addEventListener('keydown', jitCountKeydownHandler);

    jitModalSubmitHandler = (e) => {
        e.preventDefault();
        const topic = (jitTopicInputEl.value || '').trim();
        const filter = (jitFilterInputEl.value || '').trim();
        // Source of truth: read directly from the DOM input. Never trust
        // the internal jitCountIndex — the user sees and submits whatever
        // is actually rendered. Fall back to default only if the DOM
        // value is unparseable or outside the allowed set.
        const rawCount = parseInt((jitCountInputEl.value || '').trim(), 10);
        const verseCount = JIT_VERSE_COUNTS.includes(rawCount) ? rawCount : JIT_DEFAULT_COUNT;

        if (!topic) {
            speak("Topic is required.");
            jitTopicInputEl.focus();
            return;
        }

        // Tear down modal state BEFORE dispatching, so isJitLoading takes over
        // the focus-trap exclusion cleanly.
        if (jitModalSubmitHandler) {
            jitModalFormEl.removeEventListener('submit', jitModalSubmitHandler);
            jitModalSubmitHandler = null;
        }
        if (jitModalKeydownHandler) {
            jitModalEl.removeEventListener('keydown', jitModalKeydownHandler, true);
            jitModalKeydownHandler = null;
        }
        if (jitCountKeydownHandler && jitCountInputEl) {
            jitCountInputEl.removeEventListener('keydown', jitCountKeydownHandler);
            jitCountKeydownHandler = null;
        }
        jitModalEl.style.display = 'none';
        isJitInputMode = false;
        document.getElementById('focus-trap')?.focus();

        triggerJitStudyPlan(topic, filter, verseCount);
    };
    jitModalFormEl.addEventListener('submit', jitModalSubmitHandler);

    // Defer focus by one tick so any synchronous blur reclaim from
    // clearAllModes() settles before the topic input takes focus.
    setTimeout(() => jitTopicInputEl.focus(), 10);
}

// =====================================================================

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
    // Modal escape hatch: while the JIT Search Modal is open, the modal's
    // own listeners own every key. The global router must NOT preventDefault
    // or branch on Tab / Enter / Arrows here — otherwise native focus
    // traversal between Topic → Filter → Count breaks, and Enter never
    // reaches submitJitModal().
    if (isJitInputMode) return;
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

    // -----------------------------------------------------------------
    // JIT Loading Intercept — swallows all keys except Escape (abort).
    // Must sit above all navigation logic so no stray input reaches
    // the engine while the orchestrator is in flight.
    // -----------------------------------------------------------------
    if (isJitLoading) {
        event.preventDefault();
        if (key === 'Escape') {
            if (jitAbortController) {
                try { jitAbortController.abort(); } catch (_) { /* no-op */ }
            }
            return;
        }
        // Soft wait tone — non-intrusive, signals "busy, please wait".
        playTone(180, 'sine', 0.04, 0.05);
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
                       (typeof isVaultInputMode !== 'undefined' && isVaultInputMode) ||
                       (typeof isLibraryMode !== 'undefined' && isLibraryMode) ||
                       (typeof isStudyLibraryMode !== 'undefined' && isStudyLibraryMode);

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

            // --- BYOK Vault entries -------------------------------------------------
            if (selected === 'Save Gemini Key' || selected.startsWith('Replace Gemini Key')) {
                clearAllModes();
                isVaultInputMode = true;
                if (!searchInputEl) { speak("Input unavailable."); return; }
                searchInputEl.value = '';
                searchInputEl.placeholder = 'Paste Gemini API key, then Enter';
                searchInputEl.type = 'password';
                updateVisualBuffer("SAVE GEMINI API KEY", "Paste key, then press Enter. Esc to cancel");
                speak("Enter Gemini API key. Paste then press Enter, or Escape to cancel.");
                setTimeout(() => searchInputEl.focus(), 10);

                // Mirrors typed/pasted length as bullet characters so sighted users
                // see live progress without revealing the key. Uses 'input' (not 'keydown')
                // so paste, backspace, and Ctrl+A+Delete are all handled correctly.
                const vaultMaskHandler = () => {
                    const len = searchInputEl.value.length;
                    updateVisualBuffer("SAVE GEMINI API KEY", len ? '\u2022'.repeat(len) : "Paste key, then press Enter. Esc to cancel");
                };
                searchInputEl.addEventListener('input', vaultMaskHandler);

                const vaultInputHandler = async (e) => {
                    if (e.key !== 'Enter' && e.key !== 'Escape') return;
                    e.preventDefault();
                    const raw = searchInputEl.value || '';
                    searchInputEl.value = '';
                    searchInputEl.placeholder = '';
                    searchInputEl.type = 'text';
                    searchInputEl.removeEventListener('input', vaultMaskHandler);
                    searchInputEl.removeEventListener('keydown', vaultInputHandler);
                    activeInputHandler = null;
                    isVaultInputMode = false;
                    if (e.key === 'Escape') { speak("Key entry cancelled."); return; }
                    try {
                        const redacted = await setKey(ACTIVE_PROVIDER, raw);
                        const last4 = redacted.replace(/^•+\s*/, '');
                        speak(`Gemini key saved, ending in ${last4}.`);
                    } catch (err) {
                        speak("Empty key rejected. Please try again from the Options Menu.");
                    }
                };
                activeInputHandler = vaultInputHandler;
                searchInputEl.addEventListener('keydown', vaultInputHandler);
                return;
            }

            if (selected === 'Clear Gemini Key') {
                isOptionsMenuMode = false;
                clearKey(ACTIVE_PROVIDER)
                    .then(() => speak("Gemini key cleared."))
                    .catch(() => speak("Could not clear key."));
                return;
            }
            // --- end BYOK Vault entries ---------------------------------------------

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

    if (isStudyLibraryMode) {
        event.preventDefault();

        if (key === 'Escape') {
            isStudyLibraryMode = false;
            studyLibraryEntries = [];
            studyLibrarySortedView = [];
            currentMenuIndex = 0;
            currentMenuTitle = "";
            clearVisualBuffer();
            speak("Study library closed.");
            return;
        }

        // Empty-view guard: only Escape and view-switching are valid.
        if (studyLibrarySortedView.length === 0) {
            if (key === 'ArrowLeft' || key === 'ArrowRight') {
                // Allow user to escape an empty Favorites view.
                const dir = key === 'ArrowRight' ? 1 : -1;
                const cur = STUDY_SORT_MODES.indexOf(currentSortMode);
                const next = STUDY_SORT_MODES[(cur + dir + STUDY_SORT_MODES.length) % STUDY_SORT_MODES.length];
                currentSortMode = next;
                persistSortMode(next);
                studyLibrarySortedView = deriveStudyLibraryView(studyLibraryEntries, currentSortMode);
                currentMenuIndex = 0;
                renderStudyLibrary();
                const viewLine = describeSortMode(currentSortMode, studyLibrarySortedView.length, studyLibraryEntries.length);
                if (studyLibrarySortedView.length === 0) {
                    speak(`${viewLine} No plans match. Left or right to switch view.`);
                } else {
                    speak(`${viewLine} 1 of ${studyLibrarySortedView.length}: ${formatLibraryEntry(studyLibrarySortedView[0])}.`);
                }
            } else {
                speak("No plans in this view. Left or right to switch view, Escape to close.");
            }
            return;
        }

        if (key === 'ArrowDown' || key === 'ArrowUp') {
            const len = studyLibrarySortedView.length;
            currentMenuIndex = key === 'ArrowDown'
                ? (currentMenuIndex + 1) % len
                : (currentMenuIndex - 1 + len) % len;
            const entry = studyLibrarySortedView[currentMenuIndex];
            renderStudyLibrary();
            speak(`${currentMenuIndex + 1} of ${len}: ${formatLibraryEntry(entry)}`);
            return;
        }

        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const dir = key === 'ArrowRight' ? 1 : -1;
            const cur = STUDY_SORT_MODES.indexOf(currentSortMode);
            const next = STUDY_SORT_MODES[(cur + dir + STUDY_SORT_MODES.length) % STUDY_SORT_MODES.length];
            currentSortMode = next;
            persistSortMode(next);
            studyLibrarySortedView = deriveStudyLibraryView(studyLibraryEntries, currentSortMode);
            currentMenuIndex = 0;
            renderStudyLibrary();
            const viewLine = describeSortMode(currentSortMode, studyLibrarySortedView.length, studyLibraryEntries.length);
            if (studyLibrarySortedView.length === 0) {
                speak(`${viewLine} No plans match.`);
            } else {
                speak(`${viewLine} 1 of ${studyLibrarySortedView.length}: ${formatLibraryEntry(studyLibrarySortedView[0])}.`);
            }
            return;
        }

        if (key === 'k' || key === 'K') {
            const target = studyLibrarySortedView[currentMenuIndex];
            if (!target || !target.cacheKey) {
                speak("Cannot pin this entry.");
                return;
            }
            const willPin = target.isFavorite !== true;

            if (willPin) {
                // Enforce hard cap from the local view (avoid extra DB roundtrip).
                const currentPinned = studyLibraryEntries.filter(e => e.isFavorite === true).length;
                if (currentPinned >= FAVORITE_HARD_CAP) {
                    speak(`Favorite limit reached. ${FAVORITE_HARD_CAP} plans pinned. Unpin one to continue.`);
                    return;
                }
            }

            // Optimistic mutation on the master list. The view shares
            // object identity with the master so this is reflected
            // automatically — except in Favorites view, where unpinning
            // must remove the entry from the visible list.
            target.isFavorite = willPin;
            setCachedFavorite(target.cacheKey, willPin).catch(err => {
                console.warn('[StudyLibrary] setFavorite failed:', err?.message || err);
            });

            // Tone first, then word — keep utterance tight.
            if (willPin) {
                playTone(880, 'sine', 0.10, 0.20);
            } else {
                playTone(440, 'sine', 0.10, 0.20);
            }

            if (currentSortMode === 'favorites' && !willPin) {
                // Re-derive: the entry just left the visible set.
                studyLibrarySortedView = deriveStudyLibraryView(studyLibraryEntries, 'favorites');
                if (studyLibrarySortedView.length === 0) {
                    renderStudyLibrary();
                    speak("Unpinned. Favorites view is now empty.");
                    return;
                }
                if (currentMenuIndex >= studyLibrarySortedView.length) {
                    currentMenuIndex = studyLibrarySortedView.length - 1;
                }
                renderStudyLibrary();
                const next = studyLibrarySortedView[currentMenuIndex];
                speak(`Unpinned. ${currentMenuIndex + 1} of ${studyLibrarySortedView.length}: ${formatLibraryEntry(next)}.`);
                return;
            }

            renderStudyLibrary();
            speak(willPin ? "Pinned." : "Unpinned.");
            return;
        }

        if (key === 'Delete') {
            const victim = studyLibrarySortedView[currentMenuIndex];
            if (!victim || !victim.cacheKey) {
                speak("Cannot delete this entry.");
                return;
            }
            const victimLabel = formatLibraryEntry(victim);
            // Optimistic UI: drop locally, then fire-and-forget the DB delete.
            const masterIdx = studyLibraryEntries.indexOf(victim);
            if (masterIdx !== -1) studyLibraryEntries.splice(masterIdx, 1);
            studyLibrarySortedView.splice(currentMenuIndex, 1);
            removeCachedPlan(victim.cacheKey).catch(err => {
                console.warn('[StudyLibrary] delete failed:', err?.message || err);
            });

            if (studyLibrarySortedView.length === 0) {
                speak(`${victimLabel} deleted. ${currentSortMode === 'favorites' ? 'Favorites view' : 'Study library'} is now empty.`);
                if (studyLibraryEntries.length === 0) {
                    clearAllModes();
                    return;
                }
                renderStudyLibrary();
                return;
            }

            if (currentMenuIndex >= studyLibrarySortedView.length) {
                currentMenuIndex = studyLibrarySortedView.length - 1;
            }
            renderStudyLibrary();
            const next = studyLibrarySortedView[currentMenuIndex];
            speak(`Plan deleted. ${currentMenuIndex + 1} of ${studyLibrarySortedView.length}: ${formatLibraryEntry(next)}`);
            return;
        }

        // First-letter navigation — Alphabetical view only.
        if (currentSortMode === 'alpha' && key.length === 1 && /^[a-z]$/i.test(key)) {
            const target = key.toLowerCase();
            const len = studyLibrarySortedView.length;
            // Search forward from currentMenuIndex+1, wrapping.
            let foundIdx = -1;
            for (let step = 1; step <= len; step++) {
                const probe = (currentMenuIndex + step) % len;
                const topic = studyLibrarySortedView[probe].plan?.topic || '';
                if (topic.charAt(0).toLowerCase() === target) {
                    foundIdx = probe;
                    break;
                }
            }
            if (foundIdx === -1) {
                speak(`No plans starting with ${target.toUpperCase()}.`);
                return;
            }
            currentMenuIndex = foundIdx;
            renderStudyLibrary();
            const entry = studyLibrarySortedView[currentMenuIndex];
            speak(`${currentMenuIndex + 1} of ${len}: ${formatLibraryEntry(entry)}`);
            return;
        }

        if (key === 'Enter') {
            const entry = studyLibrarySortedView[currentMenuIndex];
            if (!entry || !entry.plan || !Array.isArray(entry.plan.verses) || entry.plan.verses.length === 0) {
                speak("This plan is empty or invalid.");
                return;
            }
            // Sanity: there must be an active verse to anchor the back-stack.
            if (memoryCache[currentVerseIndex]?.id == null) {
                speak("Cannot load study plan: no active verse.");
                return;
            }

            const plan = entry.plan;
            const manifestId = (entry.meta && entry.meta.manifestId)
                || localStorage.getItem('currentBibleFile')
                || 'default';

            // Tear down the menu BEFORE setting the plan, so the
            // readCurrentVerse triggered by jumpTo() sees a clean state.
            isStudyLibraryMode = false;
            studyLibraryEntries = [];
            studyLibrarySortedView = [];
            currentMenuIndex = 0;
            currentMenuTitle = "";
            clearVisualBuffer();

            setActivePlan(plan, { cacheKey: entry.cacheKey, manifestId });
            updateStudySummaryBanner(plan, 0);

            navigationHistory.push(currentVerseIndex);
            const firstStep = getCurrentStepVerse();

            // Blind-first announcement: summary, then first-step coordinates.
            const total = plan.verses.length;
            const summaryLine = plan.summary || `Study plan on ${plan.topic || 'untitled'}.`;
            const coordLine = firstStep
                ? `Jumping to step 1 of ${total}: ${firstStep.book_name} ${firstStep.chapter}, verse ${firstStep.verse}.`
                : `Plan loaded with ${total} verses.`;
            speak(`${summaryLine} ${coordLine}`);

            if (firstStep) {
                jumpTo(firstStep.book_name, firstStep.chapter, firstStep.verse);
            }
            return;
        }

        return;
    }

    if (key === 'Escape') {
        // Third Track exit gesture: if no input/menu mode is active and
        // a study plan overlay is live, Escape exits the plan. Input
        // modes take precedence (their Escape semantics are owned by
        // clearAllModes).
        const anyInputMode =
            isJitInputMode || isJitLoading || isVaultInputMode ||
            isSearchMode || isNoteMode || isOptionsMenuMode ||
            isAutoPlayMenuMode || isLibraryMode || isVersionMode ||
            isHelpMode || isHelpMenuMode || isKeyboardExplorer ||
            isBookSearchMode || isChapterMode || isVerseMode;

        if (!anyInputMode && getActivePlan()) {
            event.preventDefault();
            clearActivePlan('user-exit');
            hideStudySummaryBanner();
            speak("Exiting study plan.");
            return;
        }

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
        // Active study plan takes precedence: announce the plan summary
        // and current step progress before falling through to the
        // standard verse coordinates.
        const _activePlan = getActivePlan();
        if (_activePlan && Array.isArray(_activePlan.verses) && memoryCache[currentVerseIndex]) {
            const cur = memoryCache[currentVerseIndex];
            const bn = (cur.book_name || '').toLowerCase();
            const idx = _activePlan.verses.findIndex(v =>
                (v.book_name || '').toLowerCase() === bn &&
                v.chapter === cur.chapter &&
                v.verse === cur.verse
            );
            const total = _activePlan.verses.length;
            const topic = _activePlan.topic || 'untitled';
            const summary = _activePlan.summary || '';
            const progress = idx >= 0
                ? `Currently on step ${idx + 1} of ${total}.`
                : `Plan paused; you have stepped off-curriculum. ${total} steps total.`;
            const coords = `${cur.book_name} chapter ${cur.chapter}, verse ${cur.verse}.`;
            speak(`Study plan: ${topic}. ${summary} ${progress} ${coords}`);
            return;
        }
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
        case 'I': {
            event.preventDefault();
            const plan = getActivePlan();
            if (!plan) {
                speak("No study plan active.");
                break;
            }
            const curVerse = memoryCache[currentVerseIndex];
            const step = findStepForVerse(curVerse);
            if (!step) {
                speak("This verse is not part of the active study plan.");
                break;
            }
            speak(step.commentary_text || "No insight text for this step.");
            updateVisualBuffer("AI INSIGHT", step.commentary_text || "");
            break;
        }
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
        case 'G': {
            event.preventDefault();
            if (!isReady) break;

            // Shift+G — Study Library: recall a previously-cached plan.
            if (event.shiftKey) {
                clearAllModes();
                speak("Loading study library.");
                (async () => {
                    let entries = [];
                    try {
                        entries = await getAllCachedPlans();
                    } catch (err) {
                        console.warn('[StudyLibrary] list failed:', err?.message || err);
                        speak("Could not open the study library.");
                        return;
                    }
                    if (!entries || entries.length === 0) {
                        speak("Study library is empty. Press G to generate a new plan.");
                        return;
                    }
                    studyLibraryEntries = entries;
                    currentSortMode = loadPersistedSortMode();
                    studyLibrarySortedView = deriveStudyLibraryView(studyLibraryEntries, currentSortMode);
                    if (currentSortMode === 'favorites' && studyLibrarySortedView.length === 0) {
                        // Don't strand the user in an empty Favorites view.
                        currentSortMode = 'recent';
                        studyLibrarySortedView = deriveStudyLibraryView(studyLibraryEntries, 'recent');
                        persistSortMode('recent');
                    }
                    isStudyLibraryMode = true;
                    currentMenuIndex = 0;
                    currentMenuTitle = "STUDY LIBRARY";
                    renderStudyLibrary();
                    const viewLine = describeSortMode(currentSortMode, studyLibrarySortedView.length, studyLibraryEntries.length);
                    const first = studyLibrarySortedView[0];
                    speak(`Study Library. ${viewLine} ` +
                          `1 of ${studyLibrarySortedView.length}: ${formatLibraryEntry(first)}. ` +
                          `Up and down to navigate. Left and right to switch view. K to pin. Delete to remove. Enter to load. Escape to close.`);
                })();
                break;
            }

            // Plain G — open the generation modal.
            clearAllModes();
            speak("Study plan. Topic, filter, and verse count. Tab between fields. Press Enter to generate. Escape to cancel.");
            openJitModal();
            break;
        }
        case 'O':
            event.preventDefault();
            if (!isReady) break;
            clearAllModes();
            (async () => {
                const keyPresent = await hasKey(ACTIVE_PROVIDER);
                const baseOpts = ['Export Personal Notes', 'Import Personal Notes', 'Boot Location: ' + bootPreference];
                if (keyPresent) {
                    const redacted = await redactedDisplay(ACTIVE_PROVIDER);
                    baseOpts.push(`Replace Gemini Key (${redacted})`);
                    baseOpts.push('Clear Gemini Key');
                } else {
                    baseOpts.push('Save Gemini Key');
                }
                isOptionsMenuMode = true;
                menuOptions = baseOpts;
                currentMenuIndex = 0;
                currentMenuTitle = "OPTIONS MENU";
                renderMenuVisuals(currentMenuTitle, menuOptions, currentMenuIndex);
                speak(`Options Menu. 1 of ${menuOptions.length}: Export Personal Notes. Up and down arrows to navigate, Enter to select, Escape to close.`);
            })();
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
            // Third Track override: if a study plan is active, Alt+J
            // advances through its 5-verse curriculum. End-of-plan is
            // idempotent; the plan is NOT auto-cleared so I and Backspace
            // remain useful on prior steps.
            if (getActivePlan()) {
                const next = advanceStep();
                if (!next) {
                    speak("End of study plan. Press Escape to exit, or use arrows to continue reading.");
                    break;
                }
                navigationHistory.push(currentVerseIndex);
                jumpTo(next.book_name, next.chapter, next.verse);
                break;
            }
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
        case 'X':
            if (event.shiftKey) {
                event.preventDefault();
                speak("Wiping database and reloading. Please wait.");
                // Short delay to allow speech to start before the page reloads
                setTimeout(() => {
                    indexedDB.deleteDatabase(DB_NAME);
                    location.reload();
                }, 1500);
            }
            break;
    }
}