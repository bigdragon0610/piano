'use strict';

// ===== Note definitions (C4 octave) =====
const NOTES = [
  { name: 'C',  label: 'ド',  freq: 261.63, type: 'white' },
  { name: 'C#', label: 'ド♯', freq: 277.18, type: 'black' },
  { name: 'D',  label: 'レ',  freq: 293.66, type: 'white' },
  { name: 'D#', label: 'レ♯', freq: 311.13, type: 'black' },
  { name: 'E',  label: 'ミ',  freq: 329.63, type: 'white' },
  { name: 'F',  label: 'ファ', freq: 349.23, type: 'white' },
  { name: 'F#', label: 'ファ♯', freq: 369.99, type: 'black' },
  { name: 'G',  label: 'ソ',  freq: 392.00, type: 'white' },
  { name: 'G#', label: 'ソ♯', freq: 415.30, type: 'black' },
  { name: 'A',  label: 'ラ',  freq: 440.00, type: 'white' },
  { name: 'A#', label: 'ラ♯', freq: 466.16, type: 'black' },
  { name: 'B',  label: 'シ',  freq: 493.88, type: 'white' },
  { name: 'C5', label: 'ド',  freq: 523.25, type: 'white' },
];

// ===== Audio =====
let audioCtx = null;

/**
 * Get (or create) the AudioContext, resuming it if suspended.
 * Must be called inside a user-gesture handler to satisfy browser autoplay policy.
 */
async function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Synthesize a piano-like tone: multiple harmonic oscillators + percussive ADSR.
 */
async function playNote(freq) {
  let ctx;
  try {
    ctx = await getAudioCtx();
  } catch (e) {
    console.warn('AudioContext error:', e);
    return;
  }

  const now = ctx.currentTime;
  const duration = 2.4;

  // Compressor to avoid clipping when many keys are pressed
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.3;
  compressor.connect(ctx.destination);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.5, now);
  masterGain.connect(compressor);

  // [frequency multiplier, initial amplitude, oscillator type]
  // Triangle for fundamental gives warmth; sines for upper harmonics
  const partials = [
    [1,  0.65, 'triangle'],
    [2,  0.22, 'sine'],
    [3,  0.10, 'sine'],
    [4,  0.05, 'sine'],
    [6,  0.02, 'sine'],
  ];

  partials.forEach(([mult, amp, type]) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq * mult;

    // Percussive ADSR: near-instant attack, exponential decay, no sustain
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amp,       now + 0.006); // attack  ~6 ms
    gain.gain.exponentialRampToValueAtTime(amp * 0.35, now + 0.08);  // early decay
    gain.gain.exponentialRampToValueAtTime(0.0001,     now + duration); // full decay

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  });
}

// ===== Note display =====
let fadeTimer = null;
const noteDisplay = document.getElementById('current-note');

function showNote(text) {
  if (fadeTimer) clearTimeout(fadeTimer);
  noteDisplay.textContent = text;
  noteDisplay.classList.remove('fade');
  noteDisplay.classList.add('visible');
}

function scheduleNoteFade() {
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    noteDisplay.classList.remove('visible');
    noteDisplay.classList.add('fade');
  }, 900);
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
      if (note.label) {
        const span = document.createElement('span');
        span.className = 'key-label';
        span.textContent = note.label;
        key.appendChild(span);
      }
      whiteKeysEl.appendChild(key);
    } else {
      blackKeysEl.appendChild(key);
    }
  });
}

// ===== Pointer / touch handling =====
// Map: pointerId → currently pressed key element (or null)
const activePointers = new Map();

/**
 * Find the topmost key at the given screen coordinates.
 * Black keys are checked first because they have higher z-index.
 */
function getKeyAtPoint(x, y) {
  const blacks = document.querySelectorAll('.key.black');
  for (const key of blacks) {
    const r = key.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
  }
  const whites = document.querySelectorAll('.key.white');
  for (const key of whites) {
    const r = key.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
  }
  return null;
}

function pressKey(key) {
  if (!key || key.dataset.pressed === 'true') return;
  key.dataset.pressed = 'true';
  key.classList.add('active');
  playNote(parseFloat(key.dataset.freq)); // async – fire and forget
  const note = NOTES.find(n => n.name === key.dataset.note);
  showNote(note?.label || key.dataset.note);
}

function releaseKey(key) {
  if (!key) return;
  key.dataset.pressed = 'false';
  key.classList.remove('active');
  scheduleNoteFade();
}

const pianoEl = document.getElementById('piano');

pianoEl.addEventListener('pointerdown', e => {
  e.preventDefault();
  // Capture so pointermove/pointerup always arrive here even outside the element
  try { pianoEl.setPointerCapture(e.pointerId); } catch (_) {}
  const key = getKeyAtPoint(e.clientX, e.clientY);
  activePointers.set(e.pointerId, key || null);
  pressKey(key);
}, { passive: false });

pianoEl.addEventListener('pointermove', e => {
  e.preventDefault();
  if (!activePointers.has(e.pointerId)) return;
  const newKey = getKeyAtPoint(e.clientX, e.clientY);
  const oldKey = activePointers.get(e.pointerId);
  if (newKey !== oldKey) {
    releaseKey(oldKey);
    pressKey(newKey);
    activePointers.set(e.pointerId, newKey || null);
  }
}, { passive: false });

pianoEl.addEventListener('pointerup', e => {
  releaseKey(activePointers.get(e.pointerId));
  activePointers.delete(e.pointerId);
});

pianoEl.addEventListener('pointercancel', e => {
  releaseKey(activePointers.get(e.pointerId));
  activePointers.delete(e.pointerId);
});

// ===== PC keyboard support =====
const KEY_MAP = {
  'a': 'C', 'w': 'C#', 's': 'D', 'e': 'D#', 'd': 'E',
  'f': 'F', 't': 'F#', 'g': 'G', 'y': 'G#', 'h': 'A',
  'u': 'A#', 'j': 'B', 'k': 'C5',
};

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  const noteName = KEY_MAP[e.key.toLowerCase()];
  if (!noteName) return;
  pressKey(document.querySelector(`.key[data-note="${noteName}"]`));
});

document.addEventListener('keyup', e => {
  const noteName = KEY_MAP[e.key.toLowerCase()];
  if (!noteName) return;
  releaseKey(document.querySelector(`.key[data-note="${noteName}"]`));
});

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.warn('SW registration failed:', err)
    );
  });
}

// ===== Init =====
renderPiano();
