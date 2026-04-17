// db.js - IndexedDB Pipeline and Data Management
import { speak } from './ui.js';
import { 
    DB_NAME, DB_VERSION, TEXT_STORE, NOTES_STORE, 
    BOOKMARKS_STORE, COMMENTARY_STORE, muteTutorialPrompt 
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
        if (upgradeDb.objectStoreNames.contains(TEXT_STORE)) {
            upgradeDb.deleteObjectStore(TEXT_STORE);
        }
        upgradeDb.createObjectStore(TEXT_STORE, { keyPath: "id" });
        [NOTES_STORE, BOOKMARKS_STORE, COMMENTARY_STORE].forEach(store => {
            if (!upgradeDb.objectStoreNames.contains(store)) {
                upgradeDb.createObjectStore(store, { keyPath: store === NOTES_STORE ? "note_id" : "id" });
            }
        });
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
        bookmarksCache = req.result.map(b => b.id).sort((a, b) => a - b);
        if (callback) callback();
    };
}