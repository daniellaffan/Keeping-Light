// The lo-fi bed: ~70 bpm, lightly swung, felt/electric piano chords, sub bass, soft drums, crackle
// and tape wow. It thins out act by act: full -> detuned, hats gone -> sparse -> no beat -> a few notes.
import { piano, epiano, bass, kick, noiseHit, noiseSource, crackleBuffer } from './voices.js';

const BPM = 70;
const BEAT = 60 / BPM;
const STEP = BEAT / 2;   // eighth notes
const SWING = 0.16;      // fraction of an eighth that offbeats are pushed late

// chords as [bass root, voicing...] in MIDI
const C = {
  Fmaj7: [41, 53, 57, 60, 64], Em7: [40, 52, 55, 59, 62], Dm7: [38, 53, 57, 60, 62], Cmaj7: [36, 52, 55, 59, 60],
  Am7: [33, 52, 55, 57, 60], Bbmaj7: [34, 50, 53, 57, 58], Gm7: [43, 53, 55, 58, 62], Fadd9: [41, 53, 55, 57, 60],
};
const PROG = {
  title: ['Fmaj7', 'Cmaj7', 'Dm7', 'Cmaj7'],
  act1: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
  act2: ['Fmaj7', 'Em7', 'Dm7', 'Am7'],
  act3: ['Dm7', 'Cmaj7', 'Bbmaj7', 'Am7'],
  final: ['Dm7', 'Dm7', 'Bbmaj7', 'Bbmaj7'],
  epilogue: ['Fadd9', 'Cmaj7', 'Fadd9', 'Am7'],
};
const PENTA = [65, 67, 69, 72, 74, 77, 79, 81];

// What each mode plays.
const MODES = {
  title:    { chords: 1, voices: 3, bass: 0.5, kick: 0, snare: 0, hats: 0, melody: 0.12, detune: 0, crackle: 0.5, gain: 0.8, ep: 0.0 },
  act1:     { chords: 1, voices: 4, bass: 1, kick: 1, snare: 1, hats: 1, melody: 0.22, detune: 0, crackle: 1, gain: 1, ep: 0.5 },
  act2:     { chords: 1, voices: 4, bass: 1, kick: 1, snare: 0.8, hats: 0, melody: 0.14, detune: 9, crackle: 1, gain: 0.95, ep: 0.4 },
  act3:     { chords: 0.65, voices: 3, bass: 0.5, kick: 0.5, snare: 0, hats: 0, melody: 0.07, detune: 14, crackle: 0.8, gain: 0.85, ep: 0.2 },
  final:    { chords: 0, voices: 0, bass: 0, kick: 0, snare: 0, hats: 0, melody: 0, detune: 0, crackle: 0.3, gain: 0.9, drone: 1 },
  epilogue: { chords: 0, voices: 0, bass: 0, kick: 0, snare: 0, hats: 0, melody: 0, detune: 6, crackle: 0.35, gain: 0.8, sparse: 0.55 },
  stairs:   { chords: 0, voices: 0, bass: 0, kick: 0, snare: 0, hats: 0, melody: 0, detune: 0, crackle: 0.2, gain: 0.7, sparse: 0.3 },
  sea:      { chords: 0, voices: 0, bass: 0, kick: 0, snare: 0, hats: 0, melody: 0, detune: 0, crackle: 0, gain: 0 },
};

export class Music {
  constructor(ctx, out, reverbSend) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.frequency.value = 3200; this.lp.Q.value = 0.4;
    this.level = ctx.createGain(); this.level.gain.value = 0;
    this.bus.connect(this.lp); this.lp.connect(this.level); this.level.connect(out);
    this.send = ctx.createGain(); this.send.gain.value = 0.35;
    this.bus.connect(this.send); this.send.connect(reverbSend);

    // tape wow: one slow LFO bent into every pitched voice
    this.wowOsc = ctx.createOscillator(); this.wowOsc.frequency.value = 0.33;
    this.wow = ctx.createGain(); this.wow.gain.value = 6;
    this.wowOsc.connect(this.wow); this.wowOsc.start();

    // crackle
    this.crackle = noiseSource(ctx, crackleBuffer(ctx));
    this.crackleHP = ctx.createBiquadFilter(); this.crackleHP.type = 'highpass'; this.crackleHP.frequency.value = 900;
    this.crackleG = ctx.createGain(); this.crackleG.gain.value = 0;
    this.crackle.connect(this.crackleHP); this.crackleHP.connect(this.crackleG); this.crackleG.connect(this.level);
    this.crackle.start();

    this.mode = 'sea';
    this.m = MODES.sea;
    this.next = ctx.currentTime + 0.1;
    this.step = 0;
    this.bar = 0;
    this.muffle = 0;
  }

  setMode(mode, { muffle = 0 } = {}) {
    const t = this.ctx.currentTime;
    this.muffle = muffle;
    this.lp.frequency.setTargetAtTime(muffle ? 1300 : 3200, t, 0.8);
    if (mode === this.mode) return;
    const wasSilent = this.m.gain === 0;
    this.mode = mode;
    this.m = MODES[mode] || MODES.act1;
    this.level.gain.setTargetAtTime(this.m.gain * 0.7, t, wasSilent ? 1.5 : 2.5);
    this.crackleG.gain.setTargetAtTime(this.m.crackle * 0.05, t, 1.5);
    this.wow.gain.setTargetAtTime(mode === 'act3' || mode === 'epilogue' ? 13 : mode === 'act2' ? 9 : 6, t, 2);
    if (wasSilent) { this.next = t + 0.3; this.step = 0; }
  }

  // Quietly lower everything for a while (Manannán), or bring it back.
  hush(on) {
    const t = this.ctx.currentTime;
    this.level.gain.setTargetAtTime(on ? 0.03 : this.m.gain * 0.7, t, on ? 0.8 : 2.5);
    this.hushed = on;
  }

  chordNow() {
    const prog = PROG[this.mode] || PROG.act1;
    return C[prog[this.bar % prog.length]];
  }

  tick() {
    const ctx = this.ctx;
    const ahead = ctx.currentTime + 0.25;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05; // after a suspend
    while (this.next < ahead) {
      const swung = this.step % 2 === 1 ? STEP * SWING : 0;
      if (!this.hushed) this.play(this.step % 8, this.next + swung);
      this.next += STEP;
      this.step++;
      if (this.step % 8 === 0) this.bar++;
    }
  }

  play(s, t) {
    const ctx = this.ctx, m = this.m, bus = this.bus, wow = this.wow;
    const ch = this.chordNow();
    const r = Math.random;
    // chords
    if (m.chords && s === 0 && r() < m.chords) {
      const notes = ch.slice(1, 1 + m.voices);
      notes.forEach((n, i) => {
        const tt = t + i * 0.018 + r() * 0.01;
        const det = (r() - 0.5) * m.detune * 2;
        if (r() < m.ep) epiano(ctx, bus, n, tt, { vel: 0.42 + r() * 0.1, dur: BEAT * 3.6, detune: det, wow });
        else piano(ctx, bus, n, tt, { vel: 0.4 + r() * 0.1, dur: BEAT * 3.6, detune: det, wow });
      });
    }
    if (m.chords && s === 5 && this.mode === 'act1' && r() < 0.35) {
      piano(ctx, bus, ch[3], t, { vel: 0.25, dur: BEAT * 1.5, wow });
    }
    // bass
    if (m.bass && (s === 0 || (s === 5 && m.bass >= 1 && r() < 0.6)) && r() < Math.max(0.5, m.bass)) {
      bass(ctx, bus, ch[0], t, { vel: s === 0 ? 0.65 : 0.45, dur: s === 0 ? BEAT * 2.2 : BEAT * 0.9, wow });
    }
    // drums
    if (m.kick && (s === 0 || (s === 5 && m.kick >= 1)) && r() < Math.max(0.6, m.kick)) kick(ctx, bus, t, s === 0 ? 0.55 : 0.4);
    if (m.snare && (s === 2 || s === 6) && r() < m.snare) {
      noiseHit(ctx, bus, t, { type: 'bandpass', freq: 1700, q: 0.8, vel: 0.07, d: 0.16 });
      noiseHit(ctx, bus, t, { type: 'lowpass', freq: 400, q: 0.5, vel: 0.05, d: 0.08 });
    }
    if (m.hats) noiseHit(ctx, bus, t, { type: 'highpass', freq: 7200, q: 0.5, vel: s % 2 ? 0.018 : 0.03, d: 0.035 });
    // a little melody
    if (m.melody && s % 2 === 0 && s !== 0 && r() < m.melody) {
      const n = PENTA[Math.floor(r() * PENTA.length)];
      piano(ctx, bus, n, t, { vel: 0.22 + r() * 0.1, dur: BEAT * 2, wow });
    }
    // final night: low held tones under the sea
    if (m.drone && s === 0 && this.bar % 2 === 0) {
      bass(ctx, bus, ch[0] - 12 + 12, t, { vel: 0.4, dur: BEAT * 7 });
      if (r() < 0.5) piano(ctx, bus, ch[1] - 12, t + BEAT * 2, { vel: 0.18, dur: BEAT * 6, bright: 0.4, wow });
    }
    // epilogue: a few piano notes and the sea
    if (m.sparse && (s === 0 || s === 4) && r() < m.sparse * (s === 0 ? 1 : 0.4)) {
      const pool = ch.slice(1).concat([ch[1] + 12, ch[2] + 12]);
      piano(ctx, bus, pool[Math.floor(r() * pool.length)], t, { vel: 0.26, dur: BEAT * 5, detune: (r() - 0.5) * m.detune, wow, bright: 0.7 });
    }
  }
}
