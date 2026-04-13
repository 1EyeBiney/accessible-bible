// audio.js - Synthesizer, Ambient Music, and Crossfader Logic
import { speak } from './ui.js';
import { hymnList, volumeStages, AUDIO_GAIN_BOOST, tutorialChapters } from './config.js';

// --- Local Audio State ---
export let audioCtx = null;
export let audioA = new Audio();
export let audioB = new Audio();
export let activeAudio = audioA;
export let currentVolumeIndex = 2;
export let crossfadeTimer = null;
let grabBag = [];

// --- Helper: On Track Ended ---
const onTrackEnded = () => playNextTrack();

export function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function playTone(freq, type, dur, vol) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const boostedVol = Math.min(1, vol * AUDIO_GAIN_BOOST);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(boostedVol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

export function playSequence(types, freqs, dur, vol) {
    if (!Array.isArray(freqs) || freqs.length === 0) return;
    for (let i = 0; i < freqs.length; i++) {
        setTimeout(() => {
            playTone(freqs[i], (types && types[i]) || 'sine', dur, vol);
        }, i * dur * 1000);
    }
}

export function playNoteIndicator() {
    playSequence(['sine', 'sine', 'sine', 'sine'], [1000, 1500, 2000, 2500], 0.05, 0.2);
}

export function playCommentaryCue() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const delay = audioCtx.createDelay();
    const feedback = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    delay.delayTime.value = 0.08;
    feedback.gain.value = 0.4;

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
}

function getNextHymn() {
    if (grabBag.length === 0) {
        grabBag = [...hymnList];
        for (let i = grabBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [grabBag[i], grabBag[j]] = [grabBag[j], grabBag[i]];
        }
    }
    return grabBag.pop();
}

function formatSongTitle(filename) {
    let base = filename.replace(/\.mp3$/i, '').replace(/\d+$/, '').replace(/_/g, ' ');
    return base.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function playNextTrack(suppressTTS = false) {
    const standbyAudio = activeAudio === audioA ? audioB : audioA;
    const previousAudio = activeAudio;
    const targetVolume = volumeStages[currentVolumeIndex];
    const nextTrack = getNextHymn();

    if (crossfadeTimer) {
        clearInterval(crossfadeTimer);
        crossfadeTimer = null;
    }

    previousAudio.removeEventListener('ended', onTrackEnded);
    standbyAudio.pause();
    standbyAudio.currentTime = 0;
    standbyAudio.src = `./audio/hymns/${nextTrack}`;
    standbyAudio.volume = 0;
    
    if (!suppressTTS) {
        speak("Now playing " + formatSongTitle(nextTrack));
    }

    const playPromise = standbyAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => console.warn('Ambient playback blocked:', error));
    }

    const durationMs = 2000;
    const stepMs = 100;
    const totalSteps = durationMs / stepMs;
    let step = 0;
    const startVolume = previousAudio.paused ? 0 : previousAudio.volume;

    crossfadeTimer = setInterval(() => {
        step += 1;
        const progress = Math.min(step / totalSteps, 1);
        previousAudio.volume = Math.max(0, startVolume * (1 - progress));
        standbyAudio.volume = Math.min(targetVolume, targetVolume * progress);

        if (progress >= 1) {
            clearInterval(crossfadeTimer);
            crossfadeTimer = null;
            previousAudio.pause();
            previousAudio.currentTime = 0;
            previousAudio.volume = targetVolume;
            activeAudio = standbyAudio;
            activeAudio.removeEventListener('ended', onTrackEnded);
            activeAudio.addEventListener('ended', onTrackEnded);
        }
    }, stepMs);
}

export function silenceBootAudio(welcomeAudioEl) {
    [audioA, audioB].forEach(audio => {
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
    });
    if (crossfadeTimer) { clearInterval(crossfadeTimer); crossfadeTimer = null; }
    if (welcomeAudioEl) {
        try { welcomeAudioEl.pause(); welcomeAudioEl.currentTime = 0; } catch (e) {}
    }
}

export function cycleVolume() {
    currentVolumeIndex = (currentVolumeIndex + 1) % volumeStages.length;
    activeAudio.volume = volumeStages[currentVolumeIndex];
    speak("Ambient volume " + Math.round(volumeStages[currentVolumeIndex] * 100));
}