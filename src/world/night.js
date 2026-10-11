// The night from the chair: the fleet sails exactly the inked line (Fleet), while time runs on: ×5 when
// nothing is happening, easing to ×1 when a boat comes near a hazard, when one arrives or strikes, and
// for every beat (a reef rising, a reflection with no boat, Mag Mell, the figure in the haar). The beam
// turns with the night's time, so a fast night blurs it; a click on the water holds it there.
//
// Boats here sail at a believable pace (one chart unit, 4 m, a second); the old 2D bay ran its fleet
// 3.5× faster, and its story clock (when the reef rises, when Mag Mell shows) is kept by dividing.
import { Fleet } from '../game/ships.js';
import { obstacles, clearance, LIGHTHOUSE, SIZES } from '../game/chart.js';
import { hasAnomaly } from '../game/nights.js';
import { smooth, lerp, clamp } from '../render/paint.js';

export const SLOW = 3.5;
export const FAST = 5;
const TAU = Math.PI * 2;

// the bearing of a chart point from the lighthouse, as the beam's angle
const bearing = (p) => Math.atan2(-(p[1] - LIGHTHOUSE[1]), p[0] - LIGHTHOUSE[0]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function along(s, d) {
  // a ship's position d further along its path
  const want = Math.min(s.L, s.s + d), cum = s.cum;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= want) lo = m; else hi = m; }
  return s.path[hi];
}

export class NightWatch {
  constructor(game, night, waypoints) {
    this.game = game;
    this.night = night;
    const gap = night.ships.length > 3 ? 6.5 : 7.5;
    this.fleet = new Fleet(night, waypoints, { speed: 3.5 / SLOW, gap: gap * SLOW, start: 3 * SLOW });
    this.obs = obstacles(night);
    this.t = 0;              // real seconds (with the debug speed-up)
    this.rate = 1;           // fleet seconds per real second
    this.lapse = true;       // the note on the sill: let the night run on
    this.hold = 0;           // real seconds still owed at ×1 (an arrival, a strike)
    this.beam = 1.9;         // the beam's chart angle
    this.beamSpeed = 0;
    this.linger = null;      // { ship } | { point }, until (real t)
    this.finishing = null;
    this.leaving = false;
    this.newReef = null;     // real t when the reef began to rise
    this.phantom = null;
    this.magMell = 0; this.mm = null;
    this.manannan = hasAnomaly(night, 'manannan') ? { t0: null, a: 0, turn: -0.6, tt: 0 } : null;
    this.lagA = hasAnomaly(night, 'lagReflection');
    this.allLag = hasAnomaly(night, 'allLag');
    this.hits = night.ships.map(() => 0);
    this.beats = 0;
    // how long the night will run, in fleet seconds (for the clocks)
    this.est = Math.max(...this.fleet.ships.map((s) => s.depart + s.L / this.fleet.speed * 1.25)) + 6;
    this.events = [];
  }

  get nt() { return this.fleet.t / SLOW; }
  get done() { return this.fleet.done; }

  // how far through the night (0 at nine o'clock, 1 at first light)
  progress() {
    const p = clamp(this.fleet.t / this.est, 0, 1) * 0.94;
    if (this.finishing == null) return p;
    return lerp(p, 1, smooth(0, this.finishWait(), this.t - this.finishing));
  }
  hour() { return 21 + this.progress() * 8.6; }
  finishWait() { return this.manannan ? 6 : 3.5; }

  setLapse(on) { this.lapse = on; }

  // hold the beam on the water here (a chart point), or on a boat near it
  lingerAt(p) {
    let best = null, bd = Infinity;
    for (const s of this.fleet.ships) {
      if (s.state === 'waiting' || s.fade < 0.1) continue;
      const d = Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1]);
      if (d < bd) { bd = d; best = s; }
    }
    if (best && bd < 1.6 + SIZES[best.size].r) this.linger = { ship: best, until: this.t + 5 };
    else this.linger = { point: p, until: this.t + 5 };
  }

  update(dt) {
    const g = this.game, n = this.night;
    this.t += dt;
    // ---- how fast the night runs ----
    let target = this.lapse ? FAST : 1;
    if (this.t < 3) target = 1;
    if (this.hold > 0) { this.hold -= dt; target = 1; }
    let near = false;
    for (const s of this.fleet.ships) {
      if (s.state !== 'sailing' || s.s < s.routeEnd - s.sim.length) continue;
      if (Math.hypot(s.pos[0] - n.target[0], s.pos[1] - n.target[1]) < 7) continue;
      const r = SIZES[s.size].r;
      for (const d of [0, 3, 6]) {
        const p = d ? along(s, d) : s.pos;
        if (clearance(p[0], p[1], this.obs).d < r + 2.2) { near = true; break; }
      }
      if (near) break;
    }
    if (near) target = 1;
    const beat = this.beatActive();
    if (beat) target = 1;
    this.near = near;
    this.rate += (target - this.rate) * Math.min(1, dt * (target < this.rate ? 3.5 : 0.7));
    const fdt = dt * this.rate;

    // ---- the fleet ----
    const evs = this.fleet.update(fdt);
    for (const e of evs) {
      if (e.type === 'arrive') { g.audio?.chime(e.ship.index); this.hold = Math.max(this.hold, 3.5); }
      if (e.type === 'gone') { g.audio?.chime(e.ship.index, true); this.hold = Math.max(this.hold, 3.5); }
      if (e.type === 'strike') { g.audio?.thud(); this.hold = Math.max(this.hold, 4.5); }
    }
    this.events = evs;

    // ---- the beam ----
    const before = this.beam;
    if (this.linger && this.linger.until > this.t) {
      const p = this.linger.ship ? this.linger.ship.pos : this.linger.point;
      this.beam += wrap(bearing(p) - this.beam) * Math.min(1, dt * 2.2);
    } else {
      this.linger = null;
      this.beam += fdt * TAU / 12;
    }
    this.beamSpeed += (Math.abs(wrap(this.beam - before)) / Math.max(dt, 1e-4) - this.beamSpeed) * Math.min(1, dt * 6);
    this.fleet.ships.forEach((s, i) => {
      const d = Math.abs(wrap(bearing(s.pos) - this.beam));
      this.hits[i] = s.state === 'waiting' ? 0 : smooth(0.1, 0.0, d);
    });

    // ---- beats ----
    const nt = this.nt;
    if (hasAnomaly(n, 'newReef') && this.newReef == null && nt > 16) { this.newReef = this.t; this.beats++; }
    if (hasAnomaly(n, 'phantomReflection') && !this.phantom && nt > 26) { this.phantom = { s: 0, t0: this.t }; this.beats++; }
    if (this.phantom) this.phantom.s += (fdt / SLOW) * 2.4;
    if (hasAnomaly(n, 'magMell')) {
      if (this.mm == null && nt > 20) { this.mm = this.t; this.beats++; g.audio?.shimmer(); }
      const tt = this.mm == null ? -1 : this.t - this.mm;
      this.magMell = tt > 0 && tt < 12 ? Math.sin((tt / 12) * Math.PI) : 0;
    }
    if (this.manannan) this.updateManannan();

    // ---- the end of the night ----
    if (this.fleet.done && this.finishing == null) this.finishing = this.t;
    if (this.finishing != null && this.t - this.finishing > this.finishWait() && !this.leaving) {
      this.leaving = true;
      g.lastResults = this.fleet.results();
      g.onNightOver(this.fleet.results());
    }
  }

  // a beat holds the night at ×1 while it happens
  beatActive() {
    if (this.newReef != null && this.t - this.newReef < 7) return 'reef';
    if (this.phantom && this.t - this.phantom.t0 < 9) return 'phantom';
    if (this.mm != null && this.t - this.mm < 12) return 'magMell';
    if (this.manannan && this.manannan.t0 != null && this.t - this.manannan.t0 < 26) return 'manannan';
    return null;
  }

  updateManannan() {
    const m = this.manannan;
    // he rises once the last ship has passed the stacks
    const last = this.fleet.ships[this.fleet.ships.length - 1];
    if (m.t0 == null && last && last.state !== 'waiting' && last.pos[0] < 30) { m.t0 = this.t; this.beats++; this.game.audio?.hush(true); }
    if (m.t0 == null) return;
    const tt = this.t - m.t0;
    // fade in 0-5, look at the lamp 5-10, at us 10-15, turn back 15-19, fade 19-25
    m.a = smooth(0, 5, tt) * (1 - smooth(19, 25, tt));
    m.turn = tt < 5 ? -0.6 : tt < 10 ? lerp(-0.6, -1, smooth(5, 7, tt)) : tt < 15 ? lerp(-1, 0, smooth(10, 12, tt)) : lerp(0, 1, smooth(15, 18, tt));
    m.tt = tt;
    if (tt > 26 && !m.done) { m.done = true; this.game.audio?.hush(false); }
    // hold the night open until he has gone
    if (tt < 26 && this.fleet.done) this.finishing = this.t;
  }

  // what the bay needs to draw this moment
  view() {
    const f = this.fleet;
    const ships = f.ships.map((s) => {
      let lag = this.allLag ? this.allLag.lag : 0;
      if (this.lagA && s.index === this.lagA.ship) lag = this.lagA.lag;
      return { pos: s.pos, dir: s.dir, fade: s.fade, lantern: s.lantern, state: s.state, size: s.size, refl: lag ? f.past(s, lag * SLOW) : null };
    });
    let phantom = null;
    if (this.phantom) {
      const path = [[22, 44], [40, 40], [58, 34], [75, 26]];
      const u = clamp(this.phantom.s / 60, 0, 1);
      if (u < 1) {
        const seg = Math.min(2, Math.floor(u * 3)), k = u * 3 - seg;
        const a = path[seg], b = path[seg + 1];
        phantom = { pos: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], a: Math.sin(u * Math.PI) };
      }
    }
    const blur = smooth(1.6, 4.5, this.rate);
    return {
      ships, fleetT: f.t, t: this.t, phantom,
      magMell: this.magMell,
      manannan: this.manannan && this.manannan.t0 != null ? this.manannan : null,
      beam: { angle: this.beam, hits: this.hits, blur, spread: Math.min(0.9, this.beamSpeed * 0.14) },
      reefRise: this.newReef == null ? 0 : smooth(0, 6, this.t - this.newReef),
    };
  }
}
