import { memoryCache, currentVerseIndex, silentVisualUpdate } from './app.js';

export let isAutoPlaying = false;
let activeUtterances = [];
let audioCtx = null;

// Settings State
export const autoPlaySettings = {
    transition: 0, // 0: Chime, 1: Numbers, 2: Seamless
    voiceIndex: 0,
    rate: 1.0,
    postFocus: 0 // 0: Stay at stopped verse, 1: Return to start
};

let startingVerseIndex = 0;
export let curatedVoices = [];

// Curated Voice Whitelist
const targetVoices = ["Mark", "David", "Zira", "Aria", "Jenny", "Ava", "Andrew", "Guy"];

function getLiveRegion() {
    return document.getElementById('aria-announcer');
}

export function initVoices() {
    const systemVoices = window.speechSynthesis.getVoices();
    if (systemVoices.length === 0) return;

    curatedVoices = [];
    targetVoices.forEach(target => {
        const foundVoice = systemVoices.find(v => v.name.includes(target) && v.lang.startsWith('en'));
        if (foundVoice) curatedVoices.push({ name: foundVoice.name, obj: foundVoice, installed: true, display: target });
        else curatedVoices.push({ name: target, obj: null, installed: false, display: target + ' (Missing)' });
    });
}
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = initVoices;

function playChime() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
}

export function startAutoPlay() {
    if (isAutoPlaying) return;
    if (curatedVoices.length === 0) initVoices();

    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    activeUtterances = [];

    // Mute standard screen reader announcer during autoplay narration.
    const container = getLiveRegion();
    if (container) container.setAttribute('aria-live', 'off');

    startingVerseIndex = currentVerseIndex;
    isAutoPlaying = true;
    queueRemainingVerses(currentVerseIndex);
}

function queueRemainingVerses(startIndex) {
    const selectedVoice = curatedVoices[autoPlaySettings.voiceIndex];
    const targetVoice = selectedVoice && selectedVoice.installed ? selectedVoice.obj : null;

    for (let i = startIndex; i < memoryCache.length; i++) {
        const verseObj = memoryCache[i];
        let textToSpeak = verseObj.text;

        if (i === startIndex) {
            textToSpeak = `${verseObj.book_name} Chapter ${verseObj.chapter}. ${textToSpeak}`;
        } else if (autoPlaySettings.transition === 1) {
            textToSpeak = `Verse ${verseObj.verse}. ${textToSpeak}`;
        } else if (autoPlaySettings.transition === 0) {
            textToSpeak = '... ' + textToSpeak;
        }

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        if (targetVoice) utterance.voice = targetVoice;
        utterance.rate = autoPlaySettings.rate;

        utterance.onstart = function() {
            silentVisualUpdate(i);
        };

        utterance.onend = function() {
            if (autoPlaySettings.transition === 0 && i < memoryCache.length - 1 && isAutoPlaying) {
                playChime();
            }
            if (i === memoryCache.length - 1) {
                stopAutoPlay(true);
            }
        };

        activeUtterances.push(utterance);
        window.speechSynthesis.speak(utterance);
    }
}

export function pauseAutoPlay() {
    if (window.speechSynthesis.speaking) {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        else window.speechSynthesis.pause();
    }
}

export function stopAutoPlay(autoEnd = false) {
    if (!isAutoPlaying) return;
    isAutoPlaying = false;
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    activeUtterances = [];

    const container = getLiveRegion();
    if (container) container.setAttribute('aria-live', 'polite');

    if (!autoEnd && autoPlaySettings.postFocus === 1) {
        silentVisualUpdate(startingVerseIndex);
    }
}
