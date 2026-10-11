// Small synth voices and noise sources shared by the music, ambience and sound effects.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const bufCache = new WeakMap();
function cached(ctx, key, make) {
  let m = bufCache.get(ctx);
  if (!m) { m = new Map(); bufCache.set(ctx, m); }
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

// White noise, a few seconds, for looping.
export function whiteBuffer(ctx, secs = 3) {
  return cached(ctx, 'white' + secs, () => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  });
}

// Brown noise: the low roar of surf.
export function brownBuffer(ctx, secs = 6) {
  return cached(ctx, 'brown' + secs, () => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    // fade the loop seam
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[d.length - 1 - i] *= k; }
    return b;
  });
}

// Vinyl crackle: sparse clicks of random size over a faint hiss.
export function crackleBuffer(ctx, secs = 4) {
  return cached(ctx, 'crackle' + secs, () => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.012;
    const clicks = Math.floor(secs * 18);
    for (let c = 0; c < clicks; c++) {
      const at = Math.floor(Math.random() * (d.length - 200));
      const amp = Math.random() < 0.15 ? 0.6 : 0.12 + Math.random() * 0.2;
      const len = 4 + Math.floor(Math.random() * 30);
      for (let i = 0; i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / len);
    }
    return b;
  });
}

// A soft room for everything to sit in.
export function impulse(ctx, secs = 2.6, decay = 2.4) {
  return cached(ctx, 'ir' + secs + decay, () => {
    const n = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp = lp * 0.7 + (Math.random() * 2 - 1) * 0.3;
        d[i] = lp * Math.pow(1 - i / n, decay);
      }
    }
    return b;
  });
}

// Out of doors: almost dry, a couple of faint slaps back off the tower and the rocks, a short tail.
export function openAirImpulse(ctx) {
  return cached(ctx, 'ir-open', () => {
    const n = Math.floor(ctx.sampleRate * 0.9);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp = lp * 0.85 + (Math.random() * 2 - 1) * 0.15;
        d[i] = lp * Math.pow(1 - i / n, 7) * 0.5;
      }
      for (const [at, a] of [[0.07 + ch * 0.013, 0.5], [0.19 + ch * 0.021, 0.25], [0.33, 0.1]]) {
        const k = Math.floor(at * ctx.sampleRate);
        for (let i = 0; i < 90; i++) d[k + i] += (Math.random() * 2 - 1) * a * (1 - i / 90);
      }
    }
    return b;
  });
}

export function noiseSource(ctx, buffer, loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = buffer; s.loop = loop;
  if (loop) s.loopStart = 0;
  return s;
}

function env(g, t, { a = 0.01, peak = 1, d = 1.5, hold = 0 }) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold) g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.setTargetAtTime(0.0001, t + a + hold, d / 4);
}

function stopAll(nodes, t) { for (const n of nodes) { try { n.stop(t); } catch { /* ignore */ } } }

// Felt piano: a triangle and a quiet sine an octave up, through a closing low-pass.
export function piano(ctx, dest, midi, t, { vel = 0.5, dur = 2.4, detune = 0, wow = null, bright = 1 } = {}) {
  const f = mtof(midi);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
  o1.type = 'triangle'; o2.type = 'sine'; o3.type = 'sine';
  o1.frequency.value = f; o2.frequency.value = f * 2; o3.frequency.value = f;
  o1.detune.value = detune - 3; o2.detune.value = detune + 4; o3.detune.value = detune + 6;
  if (wow) { wow.connect(o1.detune); wow.connect(o2.detune); wow.connect(o3.detune); }
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.3;
  lp.frequency.setValueAtTime(Math.min(9000, f * 6 * bright + 400), t);
  lp.frequency.setTargetAtTime(f * 1.6 + 200, t + 0.02, 0.4);
  const g = ctx.createGain(), g2 = ctx.createGain();
  g2.gain.value = 0.18;
  env(g, t, { a: 0.006, peak: vel * 0.32, d: dur });
  o1.connect(lp); o3.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(dest);
  const nodes = [o1, o2, o3];
  for (const o of nodes) o.start(t);
  stopAll(nodes, t + dur + 1.2);
  return g;
}

// Electric piano: two-operator FM with a quickly falling index (a soft tine).
export function epiano(ctx, dest, midi, t, { vel = 0.5, dur = 2.2, detune = 0, wow = null } = {}) {
  const f = mtof(midi);
  const car = ctx.createOscillator(), mod = ctx.createOscillator();
  car.type = 'sine'; mod.type = 'sine';
  car.frequency.value = f; mod.frequency.value = f;
  car.detune.value = detune; mod.detune.value = detune;
  if (wow) { wow.connect(car.detune); wow.connect(mod.detune); }
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.4 * vel, t);
  mg.gain.setTargetAtTime(f * 0.15, t, 0.25);
  mod.connect(mg); mg.connect(car.frequency);
  const g = ctx.createGain();
  env(g, t, { a: 0.008, peak: vel * 0.22, d: dur });
  car.connect(g); g.connect(dest);
  car.start(t); mod.start(t);
  stopAll([car, mod], t + dur + 1.2);
  return g;
}

// Warm sub bass.
export function bass(ctx, dest, midi, t, { vel = 0.6, dur = 1.6, wow = null } = {}) {
  const f = mtof(midi);
  const o = ctx.createOscillator(), o2 = ctx.createOscillator();
  o.type = 'sine'; o2.type = 'triangle';
  o.frequency.value = f; o2.frequency.value = f;
  if (wow) { wow.connect(o.detune); wow.connect(o2.detune); }
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g = ctx.createGain(), g2 = ctx.createGain();
  g2.gain.value = 0.25;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.42, t + 0.03);
  g.gain.setTargetAtTime(vel * 0.28, t + 0.05, 0.3);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.15);
  o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(dest);
  o.start(t); o2.start(t);
  stopAll([o, o2], t + dur + 1);
}

// A small struck bell / glass tone (inharmonic partials).
export function bell(ctx, dest, midi, t, { vel = 0.4, dur = 3.5, hollow = false } = {}) {
  const f = mtof(midi);
  const partials = hollow ? [[1, 1], [2.32, 0.3], [4.1, 0.1]] : [[1, 1], [2.76, 0.35], [5.4, 0.12], [8.9, 0.05]];
  const g = ctx.createGain();
  env(g, t, { a: hollow ? 0.08 : 0.004, peak: vel * 0.2, d: dur });
  const nodes = [];
  for (const [r, a] of partials) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
    if (hollow) o.detune.value = -18;
    const pg = ctx.createGain(); pg.gain.value = a;
    o.connect(pg); pg.connect(g); o.start(t); nodes.push(o);
  }
  g.connect(dest);
  stopAll(nodes, t + dur + 1);
}

// A burst of filtered noise.
export function noiseHit(ctx, dest, t, { type = 'bandpass', freq = 2000, q = 1, vel = 0.3, a = 0.002, d = 0.1, sweepTo = null } = {}) {
  const s = noiseSource(ctx, whiteBuffer(ctx), false);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + a + d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 2);
  s.stop(t + a + d + 0.05);
}

// Soft kick: a falling sine.
export function kick(ctx, dest, t, vel = 0.5) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.55, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + 0.5);
}
