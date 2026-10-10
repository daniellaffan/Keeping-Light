// The place itself: Atlantic surf with slow swells, wind, rain, gulls by day, and the lamp's hum.
// Haar muffles everything.
import { brownBuffer, whiteBuffer, noiseSource } from './voices.js';

export class Ambience {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 9000;
    this.out.connect(this.lp); this.lp.connect(out);

    // surf: two brown-noise beds, a low roar and a hiss that rises with each swell
    this.surfG = ctx.createGain(); this.surfG.gain.value = 0.5;
    const roar = noiseSource(ctx, brownBuffer(ctx));
    const roarLP = ctx.createBiquadFilter(); roarLP.type = 'lowpass'; roarLP.frequency.value = 420;
    roar.connect(roarLP); roarLP.connect(this.surfG);
    const hiss = noiseSource(ctx, whiteBuffer(ctx));
    this.hissBP = ctx.createBiquadFilter(); this.hissBP.type = 'bandpass'; this.hissBP.frequency.value = 900; this.hissBP.Q.value = 0.4;
    this.hissG = ctx.createGain(); this.hissG.gain.value = 0.02;
    hiss.connect(this.hissBP); this.hissBP.connect(this.hissG); this.hissG.connect(this.surfG);
    this.surfLevel = ctx.createGain(); this.surfLevel.gain.value = 0.8;
    this.surfG.connect(this.surfLevel); this.surfLevel.connect(this.out);
    roar.start(); hiss.start(0, 1.3);

    // wind
    const wind = noiseSource(ctx, whiteBuffer(ctx));
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 500; this.windBP.Q.value = 2.2;
    this.windG = ctx.createGain(); this.windG.gain.value = 0.0;
    wind.connect(this.windBP); this.windBP.connect(this.windG); this.windG.connect(this.out);
    wind.start(0, 0.7);

    // rain
    const rain = noiseSource(ctx, whiteBuffer(ctx));
    const rainHP = ctx.createBiquadFilter(); rainHP.type = 'highpass'; rainHP.frequency.value = 2400;
    const rainLP = ctx.createBiquadFilter(); rainLP.type = 'lowpass'; rainLP.frequency.value = 7000;
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0;
    rain.connect(rainHP); rainHP.connect(rainLP); rainLP.connect(this.rainG); this.rainG.connect(this.out);
    rain.start(0, 2.1);

    // lamp hum (lamp room only)
    this.humG = ctx.createGain(); this.humG.gain.value = 0;
    for (const [f, a] of [[55, 1], [110, 0.5], [165, 0.18]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a * 0.05;
      o.connect(g); g.connect(this.humG); o.start();
    }
    this.humG.connect(this.out);

    this.cfg = { surf: 0.8, wind: 0.2, rain: 0, gulls: 0, hum: 0, muffle: 0 };
    this.nextSwell = ctx.currentTime + 1;
    this.nextGust = ctx.currentTime + 2;
    this.nextGull = ctx.currentTime + 4;
  }

  start() { this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 1.5); }

  set(cfg) {
    const t = this.ctx.currentTime;
    this.cfg = { ...this.cfg, ...cfg };
    const c = this.cfg;
    this.surfLevel.gain.setTargetAtTime(c.surf, t, 1.5);
    this.rainG.gain.setTargetAtTime(c.rain * 0.06, t, 1.5);
    this.humG.gain.setTargetAtTime(c.hum, t, 1.2);
    this.lp.frequency.setTargetAtTime(c.muffle ? 700 : 9000, t, 1.2);
  }

  hush(on) {
    this.out.gain.setTargetAtTime(on ? 0.25 : 1, this.ctx.currentTime, on ? 1 : 2.5);
  }

  tick() {
    const ctx = this.ctx, t = ctx.currentTime, c = this.cfg;
    // a swell builds and breaks every 6–11 s
    if (t > this.nextSwell) {
      const len = 6 + Math.random() * 5, peak = 0.75 + Math.random() * 0.5;
      const g = this.surfG.gain, h = this.hissG.gain;
      g.cancelScheduledValues(t); h.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t); h.setValueAtTime(h.value, t);
      g.linearRampToValueAtTime(peak, t + len * 0.45);
      g.linearRampToValueAtTime(0.45, t + len);
      h.linearRampToValueAtTime(0.09 * peak, t + len * 0.5);
      h.linearRampToValueAtTime(0.02, t + len);
      this.hissBP.frequency.setTargetAtTime(700 + Math.random() * 700, t, 2);
      this.nextSwell = t + len;
    }
    // wind gusts
    if (t > this.nextGust) {
      const len = 3 + Math.random() * 6;
      this.windG.gain.setTargetAtTime(c.wind * (0.02 + Math.random() * 0.05), t, len / 3);
      this.windBP.frequency.setTargetAtTime(350 + Math.random() * 600, t, len / 2);
      this.nextGust = t + len;
    }
    // gulls, far off
    if (c.gulls > 0 && t > this.nextGull) {
      this.gull(t + 0.05, c.gulls);
      this.nextGull = t + 5 + Math.random() * 12;
    }
  }

  gull(t, level) {
    const ctx = this.ctx;
    const n = 1 + Math.floor(Math.random() * 3);
    const base = 1100 + Math.random() * 500;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const dest = pan || this.out;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.out); }
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.32 + Math.random() * 0.1);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.25, tt);
      o.frequency.exponentialRampToValueAtTime(base * 0.75, tt + 0.22);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * 1.4; bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.012 * level, tt + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.26);
      o.connect(bp); bp.connect(g); g.connect(dest);
      o.start(tt); o.stop(tt + 0.3);
    }
  }
}
