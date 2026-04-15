import { memoryCache, currentVerseIndex, silentVisualUpdate } from './app.js';

export let isAutoPlaying = false;
let activeUtterances = [];
let audioCtx = null;

// Settings State
export const autoPlaySettings = {
    transition: 0, // 0: Chime, 1: Numbers, 2: Seamless
    voiceIndex: 0,
    rate: 1.0,
    postFocus: 0, // 0: Stay at stopped verse, 1: Return to start
    range: 0 // 0: End of Chapter, 1: 5 Verses, 2: 10 Verses
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

export function playAutoPlayUI(type) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch(type) {
        case 'open':
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
            gain.gain.setValueAtTime(0.2, now); // Increased volume
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
            break;
        case 'close':
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
            gain.gain.setValueAtTime(0.2, now); // Increased volume
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
            break;
        case 'nav':
            osc.type = 'square'; // Swapped from triangle to square for more bite
            osc.frequency.setValueAtTime(300, now);
            gain.gain.setValueAtTime(0.2, now); // Increased volume
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now); osc.stop(now + 0.08);
            break;
        case 'change': // Tiny bright click (Left/Right)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now); osc.stop(now + 0.05);
            break;
        case 'play': // Warm ascending chord
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(554, now + 0.2); // A4 to C#5
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
            break;
        case 'stop': // Dull descending thud
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
            break;
        case 'finish': // Bright success double-chime
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            gain.gain.linearRampToValueAtTime(0.3, now + 0.17);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
            break;
    }
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

    let endIndex = memoryCache.length;
    if (autoPlaySettings.range === 1) endIndex = Math.min(startIndex + 5, memoryCache.length);
    else if (autoPlaySettings.range === 2) endIndex = Math.min(startIndex + 10, memoryCache.length);

    for (let i = startIndex; i < endIndex; i++) {
        const verseObj = memoryCache[i];
        let textToSpeak = verseObj.text;

        if (i === startIndex) {
            textToSpeak = `${verseObj.book_name} Chapter ${verseObj.chapter}. ${textToSpeak}`;
        } else if (autoPlaySettings.transition === 1) {
            textToSpeak = `${verseObj.verse}. ${textToSpeak}`;
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
            if (autoPlaySettings.transition === 0 && i < endIndex - 1 && isAutoPlaying) {
                playChime();
            }
            if (i === endIndex - 1) {
                if (isAutoPlaying) playAutoPlayUI('finish');
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
