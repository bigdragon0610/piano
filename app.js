'use strict';

// ===== Note definitions (C4 octave) =====
const NOTES = [
  { name: 'C',  label: 'ド', freq: 261.63, type: 'white' },
  { name: 'C#', label: '',   freq: 277.18, type: 'black' },
  { name: 'D',  label: 'レ', freq: 293.66, type: 'white' },
  { name: 'D#', label: '',   freq: 311.13, type: 'black' },
  { name: 'E',  label: 'ミ', freq: 329.63, type: 'white' },
  { name: 'F',  label: 'ファ', freq: 349.23, type: 'white' },
  { name: 'F#', label: '',   freq: 369.99, type: 'black' },
  { name: 'G',  label: 'ソ', freq: 392.00, type: 'white' },
  { name: 'G#', label: '',   freq: 415.30, type: 'black' },
  { name: 'A',  label: 'ラ', freq: 440.00, type: 'white' },
  { name: 'A#', label: '',   freq: 466.16, type: 'black' },
  { name: 'B',  label: 'シ', freq: 493.88, type: 'white' },
  { name: 'C5', label: 'ド', freq: 523.25, type: 'white' },
];

// ===== Audio =====
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Synthesize a piano-like tone using multiple harmonic oscillators
 * with a percussive ADSR envelope.
 */
function playNote(freq) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const duration = 2.2;

  // Compressor to prevent clipping
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.25;
  compressor.connect(ctx.destination);

  // Master gain
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.45, now);
  masterGain.connect(compressor);

  // Harmonic partials: [frequency multiplier, initial gain, wave type]
  const partials = [
    [1,    0.7,  'triangle'], // fundamental (warm, not too bright)
    [2,    0.25, 'sine'],     // 2nd harmonic
    [3,    0.12, 'sine'],     // 3rd harmonic
    [4,    0.06, 'sine'],     // 4th harmonic
    [6,    0.02, 'sine'],     // 6th harmonic
  ];

  partials.forEach(([mult, gainVal, waveType]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = waveType;
    osc.frequency.value = freq * mult;

    // ADSR: very fast attack (percussive), exponential decay, no sustain
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.006);  // attack ~6ms
    gain.gain.exponentialRampToValueAtTime(gainVal * 0.3, now + 0.08); // initial decay
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);    // long decay

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  });
}

// ===== Note display =====
let fadeTimer = null;
const noteDisplay = document.getElementById('current-note');

function showNote(noteName) {
  if (fadeTimer) clearTimeout(fadeTimer);
  noteDisplay.textContent = noteName;
  noteDisplay.classList.remove('fade');
  noteDisplay.classList.add('visible');
}

function scheduleNoteFade() {
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    noteDisplay.classList.remove('visible');
    noteDisplay.classList.add('fade');
  }, 800);
}

// ===== Render piano keys =====
function renderPiano() {
  const whiteKeysEl = document.querySelector('.white-keys');
  const blackKeysEl = document.querySelector('.black-keys');

  NOTES.forEach(note => {
    const key = document.createElement('div');
    key.className = `key ${note.type}`;
    key.dataset.note = note.name;
    key.dataset.freq = note.freq;

    if (note.type === 'white') {
      const label = document.createElement('span');
      label.className = 'key-label';
      label.textContent = note.label;
      key.appendChild(label);
      whiteKeysEl.appendChild(key);
    } else {
      blackKeysEl.appendChild(key);
    }
  });
}

// ===== Touch & pointer event handling =====
// Map: pointerId → element currently being pressed
const activePointers = new Map();

function getKeyAtPoint(x, y) {
  // Check black keys first (they're on top)
  const blackKeys = document.querySelectorAll('.key.black');
  for (const key of blackKeys) {
    const rect = key.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return key;
    }
  }
  // Then white keys
  const whiteKeys = document.querySelectorAll('.key.white');
  for (const key of whiteKeys) {
    const rect = key.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return key;
    }
  }
  return null;
}

function pressKey(key) {
  if (!key || key.dataset.pressed === 'true') return;
  key.dataset.pressed = 'true';
  key.classList.add('active');
  playNote(parseFloat(key.dataset.freq));
  const label = key.dataset.note === 'C5' ? 'ド' :
    NOTES.find(n => n.name === key.dataset.note)?.label || key.dataset.note;
  showNote(label || key.dataset.note);
}

function releaseKey(key) {
  if (!key) return;
  key.dataset.pressed = 'false';
  key.classList.remove('active');
  scheduleNoteFade();
}

// ===== Pointer events (works for both touch and mouse) =====
const pianoEl = document.getElementById('piano');

pianoEl.addEventListener('pointerdown', e => {
  e.preventDefault();
  pianoEl.setPointerCapture(e.pointerId);
  const key = getKeyAtPoint(e.clientX, e.clientY);
  if (key) {
    pressKey(key);
    activePointers.set(e.pointerId, key);
  }
}, { passive: false });

pianoEl.addEventListener('pointermove', e => {
  e.preventDefault();
  if (!activePointers.has(e.pointerId)) return;

  const newKey = getKeyAtPoint(e.clientX, e.clientY);
  const oldKey = activePointers.get(e.pointerId);

  if (newKey !== oldKey) {
    releaseKey(oldKey);
    if (newKey) {
      pressKey(newKey);
    }
    activePointers.set(e.pointerId, newKey || null);
  }
}, { passive: false });

pianoEl.addEventListener('pointerup', e => {
  e.preventDefault();
  const key = activePointers.get(e.pointerId);
  releaseKey(key);
  activePointers.delete(e.pointerId);
}, { passive: false });

pianoEl.addEventListener('pointercancel', e => {
  const key = activePointers.get(e.pointerId);
  releaseKey(key);
  activePointers.delete(e.pointerId);
});

// ===== Keyboard support (desktop) =====
const KEY_MAP = {
  'a': 'C', 'w': 'C#', 's': 'D', 'e': 'D#', 'd': 'E',
  'f': 'F', 't': 'F#', 'g': 'G', 'y': 'G#', 'h': 'A',
  'u': 'A#', 'j': 'B', 'k': 'C5',
};

const pressedKeys = new Set();

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  const noteName = KEY_MAP[e.key.toLowerCase()];
  if (!noteName) return;
  pressedKeys.add(e.key.toLowerCase());
  const key = document.querySelector(`.key[data-note="${noteName}"]`);
  pressKey(key);
});

document.addEventListener('keyup', e => {
  const noteName = KEY_MAP[e.key.toLowerCase()];
  if (!noteName) return;
  pressedKeys.delete(e.key.toLowerCase());
  const key = document.querySelector(`.key[data-note="${noteName}"]`);
  releaseKey(key);
});

// ===== Service Worker registration =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service Worker registration failed:', err);
    });
  });
}

// ===== Init =====
renderPiano();
