// db.js - IndexedDB Pipeline and Data Management
import { speak } from './ui.js';
import {
    DB_NAME, DB_VERSION, TEXT_STORE, NOTES_STORE,
    BOOKMARKS_STORE, COMMENTARY_STORE, API_KEYS_STORE, STUDYPLANS_STORE,
    muteTutorialPrompt
} from './config.js';

export let db = null;
export let memoryCache = [];
export let bookmarksCache = [];

export function setMemoryCache(data) { memoryCache = data; }

export function initDatabase(callback) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.errorCode);
        speak("Database error.");
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        checkAndLoadData(callback);
    };

    request.onupgradeneeded = (event) => {
        const upgradeDb = event.target.result;

        // Bulldoze TEXT_STORE on every upgrade so corrected scripture data
        // is force-refreshed from the network. User-owned stores below are
        // strictly preserved across upgrades.
        if (upgradeDb.objectStoreNames.contains(TEXT_STORE)) {
            upgradeDb.deleteObjectStore(TEXT_STORE);
        }
        upgradeDb.createObjectStore(TEXT_STORE, { keyPath: "id" });

        // Annotation stores (notes, bookmarks, commentary) — preserved.
        [NOTES_STORE, BOOKMARKS_STORE, COMMENTARY_STORE].forEach(store => {
            if (!upgradeDb.objectStoreNames.contains(store)) {
                upgradeDb.createObjectStore(store, { keyPath: store === NOTES_STORE ? "note_id" : "id" });
            }
        });

        // --- v8: JIT feature stores. Preserved across all future upgrades. ---
        // API_KEYS_STORE: single record per provider. keyPath = 'provider'.
        if (!upgradeDb.objectStoreNames.contains(API_KEYS_STORE)) {
            upgradeDb.createObjectStore(API_KEYS_STORE, { keyPath: "provider" });
        }

        // STUDYPLANS_STORE: composite-keyed cache of validated study plans.
        // keyPath = 'cacheKey' (slugified hash of topic|filter|model|schemaVersion|manifestId).
        // Index 'lastAccessed' supports LRU eviction sweeps.
        if (!upgradeDb.objectStoreNames.contains(STUDYPLANS_STORE)) {
            const planStore = upgradeDb.createObjectStore(STUDYPLANS_STORE, { keyPath: "cacheKey" });
            planStore.createIndex("lastAccessed", "lastAccessed", { unique: false });
        }
    };
}

function checkAndLoadData(callback) {
    const transaction = db.transaction([TEXT_STORE], "readonly");
    const store = transaction.objectStore(TEXT_STORE);
    const countRequest = store.count();

    countRequest.onsuccess = () => {
        if (countRequest.result === 0) {
            speak("Downloading study library. Please wait.");
            fetchBibleJSON(callback);
        } else {
            loadToMemory(callback);
        }
    };
}

function fetchBibleJSON(callback) {
    const savedTranslation = localStorage.getItem('currentBibleFile') || 'bsb2.json';
    const dbUrl = `./translations/${savedTranslation}`;
    fetch(dbUrl)
        .then(response => response.json())
        .then(data => {
            const transaction = db.transaction([TEXT_STORE], "readwrite");
            const store = transaction.objectStore(TEXT_STORE);
            data.forEach(verse => store.put(verse));
            transaction.oncomplete = () => loadToMemory(callback);
        })
        .catch(() => speak("Error loading Bible data file."));
}

export function loadToMemory(callback) {
    const transaction = db.transaction([TEXT_STORE], "readonly");
    const store = transaction.objectStore(TEXT_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
        memoryCache = request.result;
        memoryCache.sort((a, b) => (a.book_number - b.book_number) || (a.chapter - b.chapter) || (a.verse - b.verse));
        
        loadBookmarks(() => {
            const helperText = muteTutorialPrompt ? "" : " Press H for audio tutorial, or Shift plus H to mute this prompt.";
            speak("Library ready. Use left and right arrows to read. Press M to edit note." + helperText);
            if (callback) callback();
        });
    };
}

export function loadBookmarks(callback) {
    if (!db) return;
    const tx = db.transaction([BOOKMARKS_STORE], "readonly");
    const store = tx.objectStore(BOOKMARKS_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
        // Create a fast lookup Set of all valid IDs in the currently loaded text
        const currentValidIds = new Set(memoryCache.map(v => v.id));
        
        // Only load bookmarks that actually exist in this document
        bookmarksCache = req.result
            .map(b => b.id)
            .filter(id => currentValidIds.has(id))
            .sort((a, b) => a - b);
            
        if (callback) callback();
    };
}