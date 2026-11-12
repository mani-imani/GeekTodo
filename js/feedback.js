// Sound (synthesised with Web Audio — no audio files) and haptics.
import { settings } from './store.js';

let ctx = null;
let noiseBuf = null;

let primed = false;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  return ctx;
}

/** Wake the audio context. Must run inside a user gesture: iOS (and an installed PWA after it was in the
 *  background) keeps it 'suspended' or 'interrupted' otherwise. A one-sample silent buffer unlocks iOS. */
export function unlockAudio() {
  if (!settings().sound) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state !== 'running') ac.resume().catch(() => {});
  if (!primed) {
    primed = true;
    try {
      const b = ac.createBuffer(1, 1, 22050);
      const src = ac.createBufferSource();
      src.buffer = b; src.connect(ac.destination); src.start(0);
    } catch { primed = false; }
  }
}

/** Run a sound once the context is running (sounds scheduled on a stopped clock would pile up or be lost). */
function play(fn) {
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'running') { fn(ac); return; }
  ac.resume().then(() => fn(ac)).catch(() => {});
}

function noise(ac) {
  if (noiseBuf) return noiseBuf;
  const len = ac.sampleRate * 0.6;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function scratch(ac, dur) {
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(2400, t);
  bp.frequency.linearRampToValueAtTime(3600, t + dur);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const g = ac.createGain();
  // pen "grain": a few small bumps over the stroke
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
  const bumps = 5;
  for (let i = 1; i <= bumps; i++) {
    const at = t + (dur * i) / (bumps + 1);
    g.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.12, at);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  src.connect(bp).connect(hp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.1);
}

function tone(ac, freq, start, dur, type = 'sine', vol = 0.18, glideTo) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur * 0.6);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Played when a task gets struck through. */
export function playDone(durationMs = 380, type) {
  const s = settings();
  if (!s.sound) return;
  const kind = type || s.soundType;
  play((ac) => {
    const t = ac.currentTime;
    if (kind === 'scratch') {
      scratch(ac, Math.max(0.15, durationMs / 1000));
    } else if (kind === 'pop') {
      tone(ac, 420, t, 0.14, 'sine', 0.25, 900);
    } else if (kind === 'chime') {
      tone(ac, 880, t, 0.35, 'triangle', 0.12);
      tone(ac, 1318.5, t + 0.08, 0.45, 'triangle', 0.1);
    }
  });
}

/** Soft tick for small interactions (undo, reorder drop). */
export function playTick() {
  if (!settings().sound) return;
  play((ac) => tone(ac, 1200, ac.currentTime, 0.05, 'sine', 0.05));
}

export const canVibrate = () => typeof navigator.vibrate === 'function';

export function vibrate(pattern = 15) {
  if (settings().vibrate && canVibrate()) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}
