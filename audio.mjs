// Alle Klänge werden zur Laufzeit synthetisiert (Web Audio API), keine Audiodateien.
let ctx = null, master = null, muted = false;
const lastPlay = {};

export function unlock() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { return; } // Ton bleibt optional
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.35; }
export const isMuted = () => muted;

function env(g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone({ type = 'square', f0, f1 = f0, dur = 0.1, vol = 0.2, attack = 0.005, at = 0 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, attack, dur, vol);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + attack + dur + 0.02);
}

let noiseBuf = null;
function noise({ dur = 0.2, vol = 0.3, freq = 1200, q = 0.8, type = 'lowpass', at = 0 }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, 0.004, dur, vol);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

const SFX = {
  arrow: () => { noise({ dur: 0.05, vol: 0.12, freq: 3000, type: 'bandpass', q: 2 }); },
  cannon: () => { tone({ type: 'sine', f0: 140, f1: 40, dur: 0.25, vol: 0.5 }); noise({ dur: 0.3, vol: 0.35, freq: 600 }); },
  frost: () => { tone({ type: 'triangle', f0: 1800, f1: 2600, dur: 0.12, vol: 0.06 }); tone({ type: 'triangle', f0: 2400, f1: 3200, dur: 0.1, vol: 0.04, at: 0.04 }); },
  tesla: () => { tone({ type: 'sawtooth', f0: 900, f1: 120, dur: 0.14, vol: 0.12 }); noise({ dur: 0.08, vol: 0.12, freq: 5000, type: 'highpass' }); },
  kill: () => { tone({ type: 'square', f0: 520, f1: 260, dur: 0.06, vol: 0.06 }); },
  coin: () => { tone({ type: 'square', f0: 988, dur: 0.05, vol: 0.08 }); tone({ type: 'square', f0: 1319, dur: 0.12, vol: 0.08, at: 0.05 }); },
  leak: () => { tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.3, vol: 0.18 }); },
  build: () => { noise({ dur: 0.06, vol: 0.25, freq: 900 }); tone({ type: 'square', f0: 330, f1: 440, dur: 0.08, vol: 0.08, at: 0.03 }); },
  upgrade: () => { [523, 659, 784].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.07, vol: 0.08, at: i * 0.06 })); },
  sell: () => { tone({ type: 'square', f0: 784, f1: 392, dur: 0.15, vol: 0.08 }); },
  wave: () => { [392, 392, 523].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 2 ? 0.25 : 0.08, vol: 0.1, at: i * 0.12 })); },
  waveDone: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.12, vol: 0.12, at: i * 0.08 })); },
  perk: () => { [440, 554, 659, 880].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.25, vol: 0.12, at: i * 0.1 })); },
  error: () => { tone({ type: 'square', f0: 160, dur: 0.12, vol: 0.1 }); },
  over: () => { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'square', f0: f, f1: f * 0.97, dur: 0.3, vol: 0.12, at: i * 0.25 })); },
};

// Gleiche Klänge höchstens alle 45 ms, sonst wird es bei vielen Türmen matschig.
export function play(name) {
  if (!ctx || muted || !SFX[name]) return;
  const now = ctx.currentTime;
  if (now - (lastPlay[name] ?? -1) < 0.045) return;
  lastPlay[name] = now;
  SFX[name]();
}
