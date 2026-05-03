/**
 * sensitivity.js
 * Semantic Safety Catch for JIT Study Plans.
 * Classifies prompts to prevent the AI from handling critical pastoral crises.
 */

// Tier A: High-confidence phrases indicating immediate crisis. Fires on a single match.
const TIER_A_PATTERNS = [
    /\bkill(ing)?\s+myself\b/i,
    /\bend(ing)?\s+(my|it\s+all|my\s+life)\b/i,
    /\btak(e|ing)\s+my\s+(own\s+)?life\b/i, // <-- The fix is applied here!
    /\bdon'?t\s+want\s+to\s+(be\s+here|live|wake\s+up|exist)\b/i,
    /\bbetter\s+off\s+(dead|without\s+me)\b/i,
    /\bno\s+(reason|point)\s+to\s+(live|go\s+on)\b/i,
    /\bsuicid(e|al)\b/i,
    /\b(cut(ting)?|hurt(ing)?|harm(ing)?)\s+myself\b/i,
    /\bself[-\s]?(harm|injury|mutilation)\b/i,
    /\b(my\s+)?(husband|wife|spouse|partner|boyfriend|girlfriend|father|mother|parent)\s+(hits?|hit\s+me|beats?|abuses?|rapes?|raped|threatens?)\b/i,
    /\b(being|getting)\s+(beaten|abused|raped|stalked|threatened)\b/i,
    /\bafraid\s+(of|for)\s+my\s+(life|safety|children)\b/i,
    /\boverdos(e|ing)\b/i,
    /\brunaway\b|\brun(ning)?\s+away\s+from\s+home\b/i,
];

// Tier B: Lower-confidence terms. Must be paired with a FIRST_PERSON_MARKER to fire.
const TIER_B_TERMS = [
    /\b(depression|depressed|hopeless(ness)?|despair(ing)?)\b/i,
    /\b(anxiety|panic|terrified|terror)\b/i,
    /\b(grief|grieving|mourning|loss)\b/i,
    /\b(divorc(e|ing|ed)|separation|leaving\s+(my|him|her))\b/i,
    /\b(addict(ion|ed)?|alcoholic|drinking\s+(problem|too\s+much))\b/i,
    /\b(abus(e|ive|ed))\b/i,
    /\b(trauma|ptsd|flashbacks?)\b/i,
    /\b(miscarriage|stillbirth|infertility)\b/i,
];

// Markers required to elevate a Tier B term.
const FIRST_PERSON_MARKERS = [
    /\b(i|i'?m|i\s+am|me|my|mine|myself)\b/i,
    /\b(struggling|suffering|hurting|broken|crushed|drowning|trapped)\b/i,
    /\b(can'?t|cannot)\s+(cope|handle|take|go\s+on|stand)\b/i,
    /\bhelp\s+me\b/i,
];

// Academic Context: Demotes matches to prevent false positives on study topics.
const ACADEMIC_CONTEXT = [
    /\b(history|study|theology|writings|sermons?|view|perspective|teaching)\s+(of|on|about)\b/i,
    /\b(spurgeon|calvin|luther|wesley|augustine|chrysostom|edwards)\b/i,
    /\bin\s+the\s+(bible|psalms|scriptures?|new\s+testament|old\s+testament)\b/i,
];

/**
 * Classifies a user prompt into 'standard', 'elevated', or 'critical'.
 * @param {string} input - The user's prompt.
 * @returns {object} - { level: string, matched: string|null }
 */
export function classifySensitivity(input) {
    const text = input.toLowerCase().trim();
    let level = 'standard';
    let matchedPattern = null;

    // Check Tier A
    for (const pattern of TIER_A_PATTERNS) {
        if (pattern.test(text)) {
            level = 'critical';
            matchedPattern = pattern.source;
            break;
        }
    }

    // Check Tier B if not already critical
    if (level !== 'critical') {
        const hasTermB = TIER_B_TERMS.some(p => p.test(text));
        const hasMarker = FIRST_PERSON_MARKERS.some(p => p.test(text));
        
        if (hasTermB && hasMarker) {
            level = 'elevated';
            matchedPattern = 'tier-b+marker';
        }
    }

    // Apply Academic Demotion
    const isAcademic = ACADEMIC_CONTEXT.some(p => p.test(text));
    if (isAcademic) {
        if (level === 'critical') {
            level = 'elevated'; // Demote critical to elevated (e.g., "Spurgeon on suicide")
        } else if (level === 'elevated') {
            level = 'standard'; // Demote elevated to standard
        }
    }

    return { level, matched: matchedPattern };
}

/**
 * Returns prompt hardening instructions based on the sensitivity level.
 */
export function buildPromptHardener(level) {
    if (level === 'elevated') {
        return "Because the topic touches on sensitive personal ground, the closing_reflection must include one concrete, non-prescriptive nudge toward human support — for example, 'speak with someone you trust' or 'consider reaching out to a pastor or counselor.' Keep it gentle, never directive, and never list specific resources or hotlines.";
    }
    return "";
}

/**
 * Returns the hand-authored fallback JSON for critical bypasses.
 */
export function loadCuratedFallback(matchedTier) {
    // In the future, this can return specific JSON based on the matched tier.
    // For now, it returns a generic safe fallback.
    return {
        plan_title: "A Gentle Word for Heavy Hearts",
        plan_description: "This topic touches on ground that requires more care than software can provide. Scripture is a companion, but God also provides community and counselors to walk alongside us in our deepest pain.",
        nodes: [], // Empty to prevent engine reading verses, relying on UI to guide them to help.
        closing_reflection: "Please press the question mark key to access our curated list of human support resources and crisis lines."
    };
}