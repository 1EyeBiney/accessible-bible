/**
 * jit/activePlan.js
 * Third Track Paradigm — RAM-resident overlay state for the current
 * JIT study plan. Pollutes neither NOTES_STORE nor COMMENTARY_STORE.
 *
 * Plan shape (post-v2 PlanValidator):
 *   { topic, summary, verses: [{ step, book_name, chapter, verse,
 *                                 expected_text_snippet, commentary_text }] }
 *
 * Lifecycle clears:
 *   - new plan generation       (replace via setActivePlan)
 *   - translation file switch   (fetchAndLoadBible → clearActivePlan)
 *   - explicit user exit        (Escape gesture in reading mode)
 *
 * A localStorage hint (`jit_active_plan_id`) survives reloads to power
 * the boot-time resume announcement. The plan itself is reloaded from
 * the IDB studyPlans cache on demand.
 */

const RESUME_HINT_KEY = 'jit_active_plan_id';

let activePlan = null;          // { topic, summary, verses, _cacheKey, _manifestId }
let currentStepIndex = 0;       // index into activePlan.verses

export function getActivePlan() {
    return activePlan;
}

export function getCurrentStepIndex() {
    return currentStepIndex;
}

export function setActivePlan(plan, { cacheKey, manifestId } = {}) {
    if (!plan || !Array.isArray(plan.verses) || plan.verses.length === 0) {
        return;
    }
    activePlan = { ...plan, _cacheKey: cacheKey || null, _manifestId: manifestId || null };
    currentStepIndex = 0;
    if (cacheKey) {
        try { localStorage.setItem(RESUME_HINT_KEY, cacheKey); } catch (_) {}
    }
}

export function clearActivePlan(/* reason */) {
    activePlan = null;
    currentStepIndex = 0;
    try { localStorage.removeItem(RESUME_HINT_KEY); } catch (_) {}
}

export function getResumeHint() {
    try { return localStorage.getItem(RESUME_HINT_KEY) || null; } catch (_) { return null; }
}

/**
 * Match a verse object (from memoryCache) against the active plan's verses.
 * @returns {Object|null} the matched plan verse, or null if no plan / no match.
 */
export function findStepForVerse(verse) {
    if (!activePlan || !verse) return null;
    const bn = (verse.book_name || '').toLowerCase();
    return activePlan.verses.find(v =>
        (v.book_name || '').toLowerCase() === bn &&
        v.chapter === verse.chapter &&
        v.verse === verse.verse
    ) || null;
}

/**
 * Advance the step pointer. Returns the next verse to jump to, or null
 * if the plan is exhausted (idempotent end-of-plan).
 */
export function advanceStep() {
    if (!activePlan) return null;
    if (currentStepIndex >= activePlan.verses.length - 1) return null;
    currentStepIndex += 1;
    return activePlan.verses[currentStepIndex];
}

/**
 * Get the verse at the current step (used when first loading a plan to
 * jump to step 0).
 */
export function getCurrentStepVerse() {
    if (!activePlan) return null;
    return activePlan.verses[currentStepIndex] || null;
}

export function setCurrentStepIndex(i) {
    if (!activePlan) return;
    if (i < 0 || i >= activePlan.verses.length) return;
    currentStepIndex = i;
}
