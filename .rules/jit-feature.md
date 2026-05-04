---
spoke: jit-feature
version: 1.0
activates_when:
  files_touched: ["jit/**", "keyboard.js"]
  keywords: [jit, gemini, byok, vault, cache, sensitivity, validator, orchestrator, study plan, api key]
load_priority: high
supersedes: []
---

## INVARIANTS
- Every JIT call passes through `generateStudyPlan()` orchestrator. No direct provider invocation from UI.
- Sensitivity classifier runs before any provider call; pastorally-harmful → fallback, not API.
- Plan must pass `PlanValidator` before announcement, caching, or autoplay handoff.
- API key never logged, displayed in full, transmitted off-device, or persisted outside `apiKeys` store.
- All JIT operations cancellable: `AbortController` + 30 s hard timeout.
- Outer Wall (`keyboard.js`) catches all `StudyPlanError` subclasses; raw exceptions never reach UI.
- Inner Wall (`orchestrator.js`) maps raw provider/validator/network exceptions → `StudyPlanError` instances.
- Heartbeat pulse runs for the full duration of any JIT call > immediate return.
- `isJitInputMode` and `isJitLoading` must be in every focus-trap blur exclusion list.

## DECISIONS
- Model: `gemini-2.5-flash` (D-012). `responseSchema` enforces JSON shape server-side.
- Error hierarchy: flat 7-class under `StudyPlanError` with mandatory `userMessage` + `recoverable` (D-002).
- Sensitivity: two-tier regex (Tier A phrases / Tier B word+marker) + academic-context demoter (D-003).
- `closing_reflection` schema field carries the reframed-response payload for Tier-A hits (D-004).
- Cache key: `slugify(topic|filter|model|schemaVersion|manifestId)` (D-005).
- Loading UX: 30 s timeout + 2.5 s heartbeat + completion tone (D-006).
- Bounded context: all JIT logic lives in `jit/`. Outer Wall is the only `keyboard.js` JIT touchpoint (D-007).
- B1 idempotent listener pattern on `searchInputEl`. Single `activeInputHandler` slot (D-008).
- Re-validate plans on cache read; do not trust cached output blindly.
- Cache eviction: lazy LRU triggered on successful read, async, soft cap 100.

## HAZARDS
- Schema-absurd LLM output crashes `JSON.parse` → wrap with `ParsingError` (H-014).
- Orphaned promises if AbortController missing on page unload (H-018).
- Focus hijack if new JIT modes added without updating `app.js` blur exclusion (H-001).
- Listener stacking on shared `searchInputEl` if mode binds without routing through `activeInputHandler` (H-002).
- `clearAllModes()` order: detach listener → flip flags. Reverse order wipes the new mode (H-016).
- Importmap silently fails if host serves wrong Content-Type for ES modules (H-017).
- Treating cache hit as authoritative skips re-validation; do not.
- Sending raw key in fetch headers in plaintext; never log the request object.

## WORKED EXAMPLES

### Error throw + UI announcement
```js
// Inside provider/validator
throw new SafetyError({
  userMessage: "That topic is sensitive. Here is a curated reflection instead.",
  recoverable: true,
  cause: rawProviderError,
});

// Outer Wall catches and routes:
catch (err) {
  if (isStudyPlanError(err)) {
    speak(err.userMessage);
    if (!err.recoverable) clearAllModes();
  } else {
    speak("An unexpected error occurred. Returning to navigation.");
    console.error(err);  // raw error never spoken
  }
}
```

### Orchestrator skeleton (Inner Wall)
```js
export async function generateStudyPlan(topic, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    if (classifySensitivity(topic) === 'block') {
      return curatedFallback(topic);
    }
    const cached = await planCache.get(buildCacheKey({ topic, ...opts }));
    if (cached && validatePlan(cached)) return cached;

    const raw = await provider.generate(topic, { signal: controller.signal });
    const validated = validatePlan(raw);
    await planCache.put(buildCacheKey({ topic, ...opts }), validated);
    return validated;
  } catch (err) {
    throw mapToStudyPlanError(err);
  } finally {
    clearTimeout(timeout);
  }
}
```

### Heartbeat pulse pattern
```js
let heartbeatInterval = null;
function startHeartbeatPulse() {
  heartbeatInterval = setInterval(() => playTone(220, 0.05, 0.08), 2500);
}
function stopHeartbeatPulse() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}
```

### Vault contract (R-1 target)
```js
// jit/vault.js — exports
export async function getKey(provider);              // returns string | null
export async function setKey(provider, rawKey);      // persists, announces last-4 redacted
export async function clearKey(provider);            // wipes record
export async function redactedDisplay(provider);     // "•••• 7g4Q" or "Not configured"
// MUST: await whenDbReady() at top of every call.
// MUST: never console.log raw key. Never include key in any thrown error message.
```

### Plan cache contract (R-2 target)
```js
// jit/planCache.js — exports
export function buildCacheKey({ topic, filter, model, schemaVersion, manifestId });
export async function get(cacheKey);                 // returns plan | null; bumps lastAccessed on hit
export async function put(cacheKey, plan, meta = {});// writes record + lastAccessed = Date.now()
export async function evictIfOverCap();              // async LRU sweep when count > PLAN_CACHE_SOFT_CAP
// MUST: re-run validatePlan() on every get(); drop and refetch on validation failure.
// MUST: evictIfOverCap fired async after successful get, not blocking.
```

## CROSS-REFS
- Schema preservation contract → `data-persistence.md`
- Focus-trap exclusion contract → `accessibility.md`
- AudioContext cue + heartbeat tone primitives → `audio.md`
- Surgical-edit + anti-truncation rules → `module-discipline.md`
