// The fleet for one night: precomputed routes (from chart.simulate), then calm movement along them.
import { simulate, obstacles, HARBOUR, HARBOUR_IN, MAGMELL } from './chart.js';

function cumulative(path) {
  const d = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return d;
}
function at(path, cum, s) {
  if (s <= 0) return { p: path[0], dir: dirOf(path, 0) };
  const L = cum[cum.length - 1];
  if (s >= L) return { p: path[path.length - 1], dir: dirOf(path, path.length - 2) };
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  const a = path[lo], b = path[hi];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [b[0] - a[0], b[1] - a[1]] };
}
function dirOf(path, i) {
  const a = path[Math.max(0, i)], b = path[Math.min(path.length - 1, i + 1)];
  return [b[0] - a[0], b[1] - a[1]];
}

export class Fleet {
  constructor(night, waypoints, { speed = 3.5, gap = 7.5, start = 3 } = {}) {
    this.night = night;
    this.toMagMell = night.target === MAGMELL;
    const obs = obstacles(night);
    this.ships = night.ships.map((sh, k) => {
      const entry = night.entries[k % night.entries.length];
      const sim = simulate(night, waypoints, entry, sh.size, { obs });
      // lead-in: sail in from beyond the chart edge (or out of the harbour basin)
      const lead = this.toMagMell ? [HARBOUR_IN, HARBOUR] : [[entry[0] - 12, entry[1] + 1.5], entry];
      const tail = sim.struck ? [] : this.toMagMell ? [[MAGMELL[0] - 9, MAGMELL[1] - 1.5]] : [HARBOUR_IN];
      const path = [lead[0], ...sim.path.slice(0, -1), sim.path[sim.path.length - 1], ...tail];
      const dense = [];
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
        for (let j = 0; j < n; j++) dense.push([a[0] + (b[0] - a[0]) * (j / n), a[1] + (b[1] - a[1]) * (j / n)]);
      }
      dense.push(path[path.length - 1]);
      const cum = cumulative(dense);
      const leadLen = Math.hypot(lead[1][0] - lead[0][0], lead[1][1] - lead[0][1]);
      const routeEnd = leadLen + sim.length;
      return {
        ...sh, index: k, entry, sim, path: dense, cum, L: cum[cum.length - 1], routeEnd,
        depart: start + k * gap, s: 0, v: 0, state: 'waiting', struck: !!sim.struck,
        pos: dense[0], dir: [1, 0], hist: [], trail: [], lantern: 1, arrivedAt: null, fade: 1,
        bob: Math.random() * 6,
      };
    });
    this.speed = speed;
    this.t = 0;
    this.doneAt = null;
  }

  update(dt) {
    this.t += dt;
    const events = [];
    for (const s of this.ships) {
      if (s.state === 'waiting') {
        if (this.t >= s.depart) { s.state = 'sailing'; events.push({ type: 'depart', ship: s }); }
        else continue;
      }
      if (s.state === 'sailing' || s.state === 'gliding') {
        const remaining = s.L - s.s;
        const startEase = Math.min(1, 0.25 + s.s / 5);
        const endEase = s.struck ? Math.min(1, 0.12 + remaining / 3) : Math.min(1, 0.2 + remaining / 6);
        const target = this.speed * startEase * endEase * (s.state === 'gliding' ? 0.6 : 1);
        s.v += (target - s.v) * Math.min(1, dt * 1.5);
        s.s = Math.min(s.L, s.s + s.v * dt);
        if (s.state === 'sailing' && !s.struck && s.s >= s.routeEnd) {
          s.state = 'gliding'; s.arrivedAt = this.t;
          events.push({ type: this.toMagMell ? 'gone' : 'arrive', ship: s });
        }
        if (s.s >= s.L - 0.02) {
          if (s.struck) { s.state = 'struck'; events.push({ type: 'strike', ship: s }); }
          else s.state = 'moored';
        }
      }
      if (s.state === 'struck') s.lantern += (0.3 - s.lantern) * Math.min(1, dt * 0.8);
      if (this.toMagMell && (s.state === 'gliding' || s.state === 'moored')) s.fade = Math.max(0, s.fade - dt * 0.12);
      const { p, dir } = at(s.path, s.cum, s.s);
      s.pos = p;
      if (Math.hypot(dir[0], dir[1]) > 1e-6) s.dir = dir;
      s.hist.push([this.t, p[0], p[1]]);
      if (s.hist.length > 240) s.hist.shift();
      if (s.state === 'sailing' || s.state === 'gliding') {
        s.trail.push([p[0], p[1], this.t]);
        if (s.trail.length > 90) s.trail.shift();
      }
    }
    if (this.doneAt == null && this.ships.every((s) => s.state === 'moored' || s.state === 'struck' || (this.toMagMell && s.fade <= 0.02))) {
      this.doneAt = this.t;
    }
    return events;
  }

  // position some seconds ago (for reflections that lag)
  past(s, lag) {
    const want = this.t - lag;
    const h = s.hist;
    if (!h.length) return s.pos;
    if (want <= h[0][0]) return [h[0][1], h[0][2]];
    for (let i = h.length - 1; i >= 0; i--) if (h[i][0] <= want) return [h[i][1], h[i][2]];
    return s.pos;
  }

  get done() { return this.doneAt != null; }
  results() {
    return this.ships.map((s) => ({ name: s.name, size: s.size, fate: s.struck ? 'struck' : this.toMagMell ? 'gone' : 'home', reef: s.sim.struck ? s.sim.struck.obstacle : null, at: s.sim.struck ? s.sim.struck.at.map((v) => Math.round(v * 10) / 10) : null }));
  }
}
