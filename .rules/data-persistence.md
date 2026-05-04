---
spoke: data-persistence
version: 1.0
activates_when:
  files_touched: ["db.js", "config.js"]
  keywords: [indexeddb, schema, migration, store, upgrade, db_version, onupgradeneeded, whendbready, vault, plancache, persistence]
load_priority: high
supersedes: []
---

## INVARIANTS
- `TEXT_STORE` is the only store that may be deleted on upgrade. All others MUST be preserved. NEVER bulldoze user data stores under any circumstance.
- Preserved stores: `NOTES_STORE`, `BOOKMARKS_STORE`, `COMMENTARY_STORE`, `apiKeys`, `studyPlans`.
- Every new store creation in `onupgradeneeded` MUST be wrapped in `if (!upgradeDb.objectStoreNames.contains(NAME))`.
- New-store creation logic MUST be gated by `if (oldVersion < N)` to prevent re-execution on future upgrades.
- `DB_VERSION` is monotonically increasing. NEVER rollback (throws `VersionError`, locks the app).
- `isReady` flips to `true` only after `memoryCache` is populated and `loadBookmarks()` has resolved.
- Any module that may import before `initDatabase()` completes MUST `await whenDbReady()` before any tx.
- Bibles + Books literature manifests live in `./translations/`. Commentary manifest lives in `./commentaries/`.
- Manifests are fetched with `cache: 'no-store'` to bypass aggressive browser caching.
- All store-name strings are imported from `config.js`; never hardcoded in tx calls.

## DECISIONS
- DB schema: `BibleStudyDB` v7 with `oldVersion < 7` gate for JIT stores (D-009).
- `whenDbReady()` exported promise gate (D-010).
- Conditional-create with `if (!contains)` for all annotation stores (D-017).
- Dual-store transactions for read-time sync (notes + commentary in single tx) (D-018).
- Bookmarks contextually filtered against active `memoryCache` → 10-bookmark quota per loaded document (D-019).
- Curriculum integer ID for cross-dataset commentary lookup: `(book*1e6)+(chapter*1e3)+verse` (D-015).
- Educator pipeline preserves string IDs on notes-as-commentary export (D-016).
- `apiKeys` keyPath: `'provider'` (one record per provider).
- `studyPlans` keyPath: `'cacheKey'` + `lastAccessed` index for LRU eviction.
- `PLAN_CACHE_SOFT_CAP = 100`. Eviction is lazy + async (see `jit-feature.md`).
- `SCHEMA_VERSION = 'v1'` participates in cache-key composition; bump invalidates cache cleanly.

## HAZARDS
- DB version downgrade locks the app with `VersionError` (H-003).
- IndexedDB async trap: idle transactions auto-close during network latency. Resolve `fetch` fully before opening tx (H-007).
- Race condition in `readCurrentVerse` if memoryCache empty during hot-swap. Guard with cache-populated check (H-008).
- Hot-swap to smaller dataset can leave `currentVerseIndex` out of bounds. Validate against cache; fall back to `memoryCache[0].id`.
- Manifest browser cache served stale data. Always `cache: 'no-store'` (H-011).
- Variable shadowing of `db` / `isReady` across modules causes ReferenceError on boot (H-005).
- `loadBookmarks` without contextual filter → cross-document bookmark contamination (H-013).
- Forgetting to add a new store-name constant to `config.js` exports → silent ReferenceError in tx code.
- Adding store creation outside the `oldVersion < N` gate causes the block to re-fire on every future bump.

## WORKED EXAMPLES

### Adding a new store (template for all future schema bumps)
```js
// 1. config.js — add the constant + bump DB_VERSION
export const DB_VERSION = 8;
export const NEW_STORE = "newFeatureStore";

// 2. db.js — extend import
import { /* ... */ NEW_STORE } from './config.js';

// 3. db.js — append a new gated block, never edit existing ones
request.onupgradeneeded = (event) => {
  const upgradeDb = event.target.result;
  const oldVersion = event.oldVersion || 0;

  // ... existing v7 block stays untouched ...

  if (oldVersion < 8) {
    if (!upgradeDb.objectStoreNames.contains(NEW_STORE)) {
      const store = upgradeDb.createObjectStore(NEW_STORE, { keyPath: "id" });
      // store.createIndex(...) here, not later — indexes can only be created during upgrade.
    }
  }
};
```

### Safe `whenDbReady()` consumer
```js
import { whenDbReady, db } from '../db.js';
import { API_KEYS_STORE } from '../config.js';

export async function getKey(provider) {
  await whenDbReady();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([API_KEYS_STORE], "readonly");
    const req = tx.objectStore(API_KEYS_STORE).get(provider);
    req.onsuccess = () => resolve(req.result?.rawKey ?? null);
    req.onerror = () => reject(req.error);  // never include rawKey in error path
  });
}
```

### Dual-store transaction (read sync)
```js
const tx = db.transaction([NOTES_STORE, COMMENTARY_STORE], "readonly");
const noteReq = tx.objectStore(NOTES_STORE).get(verseId);
const commReq = tx.objectStore(COMMENTARY_STORE).get(curriculumId);
tx.oncomplete = () => {
  // both reads available; render together
};
```

### Manifest fetch (always cache-busted)
```js
const res = await fetch('./translations/manifest_bibles.json', { cache: 'no-store' });
if (!res.ok) {
  speak("Failed to load library manifest.");
  console.error(res.status);
  return;
}
const manifest = await res.json();
```

### Bookmark contextual filter (preserves per-document quota)
```js
const validIds = new Set(memoryCache.map(v => v.id));
bookmarksCache = req.result
  .map(b => b.id)
  .filter(id => validIds.has(id))
  .sort((a, b) => a - b);
```

### Hot-swap index validation (Bible + Literature safe)
```js
const inBounds = memoryCache.some(v => v.id === currentVerseId);
if (!inBounds && memoryCache.length > 0) {
  currentVerseId = memoryCache[0].id;  // first record of whichever dataset is active
}
```

## CROSS-REFS
- Vault + plan-cache contracts that consume this contract → `jit-feature.md`
- Library/manifest UX flow → `library-curriculum.md`
- Surgical-edit discipline for `db.js` upgrades → `module-discipline.md`
