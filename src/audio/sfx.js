// Sounds tied to what the player does and sees. All quiet; nothing sudden.
import { piano, bell, noiseHit, bass, mtof } from './voices.js';

const CHIME = [72, 74, 77, 79, 81, 84]; // F major pentatonic, high

export class Sfx {
  constructor(ctx, out, reverbSend) {
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
    this.bus.connect(out);
    this.send = ctx.createGain(); this.send.gain.value = 0.5;
    this.bus.connect(this.send); this.send.connect(reverbSend);
    this.lastPencil = 0;
  }

  get now() { return this.ctx.currentTime + 0.01; }

  // soft pencil scratch: a few grains of high, narrow noise
  pencil(v = 1) {
    const t = this.now;
    if (t - this.lastPencil < 0.05) return;
    this.lastPencil = t;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      noiseHit(this.ctx, this.bus, t + i * 0.035 + Math.random() * 0.02, { type: 'bandpass', freq: 3200 + Math.random() * 2400, q: 2.5, vel: 0.05 * v, d: 0.03 + Math.random() * 0.03 });
    }
  }

  rubOut() {
    const t = this.now;
    for (let i = 0; i < 5; i++) noiseHit(this.ctx, this.bus, t + i * 0.09, { type: 'bandpass', freq: 1400 + (i % 2) * 500, q: 1.2, vel: 0.045, d: 0.08 });
  }

  // a page turning: a swept band of noise and a soft settle
  page() {
    const t = this.now;
    noiseHit(this.ctx, this.bus, t, { type: 'bandpass', freq: 2600, q: 0.7, vel: 0.06, a: 0.08, d: 0.3, sweepTo: 600 });
    noiseHit(this.ctx, this.bus, t + 0.32, { type: 'lowpass', freq: 500, q: 0.5, vel: 0.04, d: 0.12 });
  }

  // the gentlest acknowledgement: one quiet note
  soft() {
    piano(this.ctx, this.bus, [77, 81, 84][Math.floor(Math.random() * 3)], this.now, { vel: 0.12, dur: 1.4, bright: 0.6 });
  }

  // inking the plan: a short rising phrase
  inkPhrase() {
    const t = this.now;
    [65, 69, 72, 76].forEach((n, i) => piano(this.ctx, this.bus, n, t + i * 0.22, { vel: 0.26 - i * 0.02, dur: 2.2 }));
    noiseHit(this.ctx, this.bus, t, { type: 'bandpass', freq: 2200, q: 1, vel: 0.03, a: 0.2, d: 1.0 });
  }

  // the lamp: a warm swell
  lampSwell() {
    const ctx = this.ctx, t = this.now;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 1.6);
    g.gain.setTargetAtTime(0.0001, t + 2.2, 1.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1800, t + 1.6); lp.frequency.setTargetAtTime(500, t + 2.2, 1.2);
    lp.connect(g); g.connect(this.bus);
    for (const [m, det] of [[41, 0], [48, 4], [57, -5], [60, 3], [64, -2]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = 0.18;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + 9);
    }
  }

  // a ship home: a soft chime in key. Gone: a hollow, lower one.
  chime(index = 0, gone = false) {
    const n = CHIME[index % CHIME.length] - (gone ? 12 : 0);
    bell(this.ctx, this.bus, n, this.now, { vel: gone ? 0.3 : 0.38, dur: gone ? 5 : 3.2, hollow: gone });
  }

  // a ship on the rocks: low and muffled, not loud
  thud() {
    const t = this.now;
    bass(this.ctx, this.bus, 31, t, { vel: 0.55, dur: 0.5 });
    noiseHit(this.ctx, this.bus, t, { type: 'lowpass', freq: 260, q: 0.7, vel: 0.12, d: 0.6 });
  }

  // Mag Mell: a high glassy shimmer
  shimmer() {
    const t = this.now;
    [84, 88, 91, 96, 89].forEach((n, i) => bell(this.ctx, this.bus, n, t + i * 0.4, { vel: 0.12, dur: 6, hollow: true }));
  }

  // a stone step in the tower
  stairStep(i = 0) {
    const t = this.now;
    noiseHit(this.ctx, this.bus, t, { type: 'lowpass', freq: 380 + i * 12, q: 0.8, vel: 0.12, d: 0.18 });
    noiseHit(this.ctx, this.bus, t + 0.02, { type: 'bandpass', freq: 1200, q: 1, vel: 0.025, d: 0.08 });
  }

  // one held note as the paint goes back into the paper
  heldNote() {
    const ctx = this.ctx, t = this.now;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 3);
    g.gain.setValueAtTime(0.12, t + 9);
    g.gain.linearRampToValueAtTime(0.0001, t + 15);
    g.connect(this.bus);
    for (const [r, a, type] of [[1, 1, 'sine'], [2, 0.25, 'sine'], [1, 0.3, 'triangle']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(69) * r; o.detune.value = type === 'triangle' ? 4 : 0;
      const og = ctx.createGain(); og.gain.value = a * 0.5;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 15.5);
    }
  }
}
