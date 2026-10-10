// The bay seen from the headland: night (ships come home), dawn, and backdrops for dusk/title.
import { PAL, rng, noise1, mixHex, rgba, lerp, clamp, smooth, blob, glow, inkLine, wobble, trace, wash, glazes, radial } from '../paint.js';
import { palette, paintBayStatic, paintReefs, drawBeam, drawLamp, lampPos, pz, HORIZON, villageSites } from './bay-paint.js';
import { REEFS, unproject, project, VIEW, MAGMELL } from '../../game/chart.js';
import { Fleet } from '../../game/ships.js';
import { hasAnomaly } from '../../game/nights.js';
import { letter } from '../hand.js';

export const SAFE = { w: 1600, h: 1000 };

// Paint the bay for a given time of day into the live layers (cached).
export function bayBackdrop(L, game, { tod, night, extraReefs = [], key = '', village = true, lightsOverride = null }) {
  const n = night;
  const pal = palette(tod, n ? n.look.cool : 0, !!(n && n.goldenSunset && (tod === 'dusk' || tod === 'title')));
  const lights = lightsOverride != null ? lightsOverride : n ? n.lights : 1;
  const ck = `bay|${tod}|${n ? n.id : 0}|${lights}|${extraReefs.join(',')}|${key}`;
  const cache = L.cache(ck, (P) => {
    paintBayStatic(P, { pal, night: n, lights, lightsCount: n && n.lightsCount, rain: n && n.weather === 'rain', view: L.view, village });
    if (extraReefs.length && n) paintReefs(P, pal, { ...n, reefs: extraReefs });
  });
  return { pal, cache };
}

export function fogColorFor(tod) {
  if (tod === 'night') return [0.6, 0.62, 0.68];
  if (tod === 'dawn') return [0.9, 0.88, 0.85];
  if (tod === 'dusk' || tod === 'title') return [0.83, 0.78, 0.78];
  return [0.9, 0.9, 0.88];
}

// ---------------- ships ----------------
export function drawShip(L, s, pal, t, { lag = 0, fleet = null, dark = 0.7, alpha = 1, phantom = false } = {}) {
  const { paint: c, ink, light, mask } = L;
  const [wx, wy] = s.pos;
  const [sx, sy, sc] = pz(wx, wy, 0);
  const size = { small: 0.8, medium: 1.0, large: 1.35 }[s.size] || 1;
  const k = sc * size * 1.9;
  const face = s.dir[0] >= 0 ? 1 : -1;
  const bob = Math.sin(t * 1.3 + s.bob) * 0.8 * k;
  const y = sy + bob;
  const hullW = 26 * k, hullH = 7 * k;
  const hullCol = mixHex(s.size === 'large' ? '#3E3A44' : ['#8A4E33', '#5D6B7A', '#7A5A3E', '#2F4A5E'][s.name.length % 4], pal.seaNear, dark * 0.45);
  const sailCol = mixHex('#EFE3CC', pal.skyMid, 0.25 + dark * 0.35);
  const A = alpha * s.fade;

  // reflection (from where the ship was `lag` seconds ago)
  let rx = sx, ry = y;
  if (lag > 0 && fleet) { const p = fleet.past(s, lag); const q = pz(p[0], p[1], 0); rx = q[0]; ry = q[1] + bob; }
  if (A > 0.01) {
    c.save();
    c.globalAlpha = 0.35 * A;
    c.fillStyle = mixHex(hullCol, pal.seaNear, 0.5);
    for (let i = 0; i < 5; i++) {
      const yy = ry + 2 + i * 2.2 * k;
      const w = hullW * (0.9 - i * 0.12) + Math.sin(t * 2 + i) * 2;
      c.fillRect(rx - w / 2, yy, w, 1.6 * k);
    }
    // mast reflection
    c.fillStyle = mixHex(PAL.ink, pal.seaNear, 0.5);
    for (let i = 0; i < 6; i++) c.fillRect(rx - face * 3 * k + Math.sin(t * 2.4 + i) * 1.2, ry + 6 * k + i * 4 * k, 1.2 * k, 2.4 * k);
    c.restore();
    // lantern reflection: a broken gold column
    for (let i = 0; i < 7; i++) {
      const yy = ry + 6 * k + i * 5 * k;
      glow(light, rx - face * 3 * k + Math.sin(t * 2.2 + i * 1.3) * 2 * k, yy, (5 - i * 0.4) * k, '#E9A548', 0.22 * s.lantern * A * (1 - i / 8));
    }
  }
  if (phantom) return;

  c.save();
  c.globalAlpha = A;
  // wake: two pale lines fanning out behind, fading
  const tr = s.trail;
  if (tr.length > 3) {
    c.lineCap = 'round';
    for (const side of [-1, 1]) {
      let prev = null;
      for (let i = tr.length - 1; i >= 0; i -= 2) {
        const age = t - tr[i][2];
        if (age > 3.2) break;
        const [px, py, ps] = pz(tr[i][0], tr[i][1], 0);
        const spread = age * 5 * ps;
        const pt = [px, py + side * spread * 0.3 + 2];
        if (prev) {
          c.strokeStyle = rgba('#EEF0F2', 0.4 * (1 - age / 3.2) * (1 - dark * 0.4));
          c.lineWidth = 1.3 * k * (1 - age / 4);
          c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(pt[0], pt[1]); c.stroke();
        }
        prev = pt;
      }
    }
  }
  // hull: a sleepy round bowl
  c.fillStyle = hullCol;
  c.beginPath();
  c.moveTo(sx - hullW / 2, y - hullH * 0.5);
  c.quadraticCurveTo(sx - hullW * 0.45, y + hullH * 0.9, sx, y + hullH * 0.75);
  c.quadraticCurveTo(sx + hullW * 0.48, y + hullH * 0.7, sx + hullW / 2 + face * 3 * k, y - hullH * 0.7);
  c.closePath();
  c.fill();
  // gunwale stripe
  c.fillStyle = mixHex('#EDE2C8', hullCol, 0.5);
  c.fillRect(sx - hullW / 2, y - hullH * 0.55, hullW, 1.3 * k);
  // cabin on bigger boats
  if (s.size !== 'small') {
    c.fillStyle = mixHex('#EAE0CC', pal.wwSh, 0.3 + dark * 0.3);
    c.fillRect(sx - face * 9 * k - 4 * k, y - hullH * 0.55 - 6 * k, 8 * k, 6 * k);
  }
  if (s.size === 'large') {
    c.fillStyle = mixHex('#2B2622', pal.skyMid, 0.2);
    c.fillRect(sx + face * 2 * k - 2 * k, y - hullH * 0.55 - 12 * k, 4 * k, 7 * k);
  }
  // furled/small sail
  const mx = sx - face * 3 * k;
  c.fillStyle = sailCol;
  c.beginPath();
  c.moveTo(mx + face * 1 * k, y - hullH * 0.6 - 2 * k);
  c.lineTo(mx + face * 1 * k, y - 24 * k);
  c.quadraticCurveTo(mx + face * 9 * k, y - 14 * k, mx + face * 12 * k, y - hullH * 0.6 - 3 * k);
  c.closePath();
  c.fill();
  c.restore();
  // ink: hull line, mast, rigging
  const ia = 0.85 * A;
  inkLine(ink, [[sx - hullW / 2, y - hullH * 0.5], [sx - hullW * 0.3, y + hullH * 0.6], [sx + hullW * 0.3, y + hullH * 0.6], [sx + hullW / 2 + face * 3 * k, y - hullH * 0.7]], { width: 1.0 * k, alpha: ia, seed: s.index + 1, breaks: 0 });
  inkLine(ink, [[mx, y - hullH * 0.6], [mx, y - 27 * k]], { width: 1.0 * k, alpha: ia, seed: s.index + 2, breaks: 0 });
  inkLine(ink, [[mx, y - 27 * k], [sx + face * hullW * 0.5, y - hullH * 0.6]], { width: 0.5 * k, alpha: ia * 0.7, seed: s.index + 3, breaks: 0 });
  inkLine(ink, [[mx, y - 27 * k], [sx - face * hullW * 0.48, y - hullH * 0.5]], { width: 0.5 * k, alpha: ia * 0.7, seed: s.index + 4, breaks: 0 });
  // lantern: swings a little
  const swing = Math.sin(t * 1.7 + s.bob) * 1.5 * k;
  const lx = mx + swing, ly = y - 19 * k;
  blob(c, lx, ly, 2.2 * k, 2.6 * k, '#F6D27E', A, s.index + 9, 0.05);
  glow(light, lx, ly, 34 * k, '#E6A94A', 0.55 * s.lantern * A);
  glow(light, lx, ly, 8 * k, '#FFE2A0', 0.9 * s.lantern * A);
  mask.fillStyle = 'rgb(0,200,0)';
  mask.fillRect(sx - hullW / 2 - 2, y - 30 * k, hullW + 6, 30 * k + hullH);
  return [sx, y];
}

// ---------------- the scene ----------------
export class BayScene {
  constructor(game) {
    this.game = game; this.safe = SAFE;
    game.input.on('down', (x, y) => { if (game.scene === this) this.pointer(x, y); });
  }

  enter({ mode = 'night', night, waypoints = [], from = 'dusk' }) {
    this.mode = mode;
    this.night = night;
    this.t = 0;
    this.waypoints = waypoints;
    this.beamAngle = mode === 'night' ? 1.9 : 0.6;
    this.linger = null;
    this.fast = false;
    this.finishing = null;
    this.events = [];
    this.fleet = mode === 'night' ? new Fleet(night, waypoints, { gap: night.ships.length > 3 ? 6.5 : 7.5 }) : null;
    this.newReefT = null;
    this.phantom = null;
    this.magMell = 0;
    this.reflShift = 0;
    this.dawnShips = mode === 'dawn' ? (this.game.lastResults || []) : [];
    this.leaving = false;
    if (mode === 'night') this.game.audio?.lampSwell();
    this.manannan = hasAnomaly(night, 'manannan') ? { t0: null, a: 0 } : null;
  }

  look() {
    const n = this.night, lk = n.look;
    const tod = this.mode === 'dawn' ? 'dawn' : 'night';
    let fog = n.haar * (this.mode === 'dawn' ? 0.55 : 1);
    if (this.manannan && this.manannan.a > 0) fog *= 1 - this.manannan.a * 0.15;
    return {
      warmth: lk.warmth + (this.mode === 'dawn' ? 0.1 : -0.05), sat: lk.sat, paperShow: lk.paperShow + (this.mode === 'dawn' ? 0.05 : 0),
      bleed: lk.bleed, inkSpread: lk.inkSpread, gran: lk.gran, fog, fogColor: fogColorFor(tod),
      wobble: 3 + lk.bleed * 3, edge: 1.0, lightGain: 1.0,
      clear: [0.12, 0.62, 0.14, 0.09], clearAmt: this.magMell * 1.1,
      cloak: this.manannan ? this.manannan.uv || [0.5, 0.5, 0.03, 0.2] : [0.5, 0.5, 0.05, 0.2], cloakAmt: this.manannan ? this.manannan.a * 0.6 : 0,
    };
  }

  update(dt) {
    const g = this.game;
    const sp = this.fast ? 4 : 1;
    const d = dt * sp;
    this.t += d;
    if (this.mode === 'night') {
      const evs = this.fleet.update(d);
      for (const e of evs) {
        if (e.type === 'arrive') g.audio?.chime(e.ship.index);
        if (e.type === 'gone') g.audio?.chime(e.ship.index, true);
        if (e.type === 'strike') g.audio?.thud();
      }
      // beam turns; lingers on a ship if asked
      if (this.linger && this.linger.until > this.t) {
        const s = this.linger.ship;
        const ang = Math.atan2(-(s.pos[1] - 53.6), s.pos[0] - 12.5);
        let diff = ang - this.beamAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.beamAngle += diff * Math.min(1, d * 2.2);
      } else {
        this.beamAngle += d * (Math.PI * 2) / 15;
      }
      // anomalies
      if (hasAnomaly(this.night, 'newReef') && this.newReefT == null && this.t > 16) this.newReefT = this.t;
      if (hasAnomaly(this.night, 'phantomReflection') && !this.phantom && this.t > 26) {
        this.phantom = { s: 0, t0: this.t };
      }
      if (this.phantom) this.phantom.s += d * 2.4;
      if (hasAnomaly(this.night, 'magMell')) {
        const tt = this.t - 20;
        this.magMell = tt > 0 && tt < 12 ? Math.sin((tt / 12) * Math.PI) : 0;
        if (tt > 0 && tt < 0.1 && !this._mm) { this._mm = true; g.audio?.shimmer(); }
      }
      if (this.manannan) this.updateManannan(d);
      if (this.fleet.done && this.finishing == null) this.finishing = this.t;
      if (this.finishing != null && this.t - this.finishing > (this.manannan ? 6 : 3.5) && !this.leaving) {
        this.leaving = true;
        g.lastResults = this.fleet.results();
        g.onNightOver(this.fleet.results());
      }
    } else if (this.mode === 'dawn') {
      this.beamAngle += dt * 0.2;
      if (g.autoplay && this.t > 1.5 && !this.leaving) { this.leaving = true; g.onDawnSeen(); }
    }
  }

  updateManannan(d) {
    const m = this.manannan;
    // he rises once the last ship has passed the stacks
    const last = this.fleet.ships[this.fleet.ships.length - 1];
    if (m.t0 == null && last && last.state !== 'waiting' && last.pos[0] < 30) { m.t0 = this.t; this.game.audio?.hush(true); }
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

  pointer(x, y) {
    if (this.mode !== 'night') return;
    // click a ship: the beam lingers on it a moment
    let best = null, bd = 60;
    for (const s of this.fleet.ships) {
      if (s.state === 'waiting') continue;
      const [sx, sy] = pz(s.pos[0], s.pos[1], 0);
      const dd = Math.hypot(sx - x, sy - 10 - y);
      if (dd < bd) { bd = dd; best = s; }
    }
    if (best) { this.linger = { ship: best, until: this.t + 4 }; this.game.audio?.soft(); }
  }

  draw(L) {
    const g = this.game, n = this.night, t = this.t;
    if (this.mode === 'night') {
      const extra = this.newReefT != null ? [] : [];
      const night = bayBackdrop(L, g, { tod: 'night', night: n, extraReefs: extra });
      const dusk = bayBackdrop(L, g, { tod: 'dusk', night: n });
      // the sky darkens from dusk into night over the first seconds
      const k = smooth(0, 7, t);
      L.blit(dusk.cache);
      L.blit(night.cache, k);
      const pal = night.pal;
      const dark = lerp(0.25, 0.75, k);
      // a reef rising where there was none
      if (this.newReefT != null) {
        const a = smooth(0, 6, t - this.newReefT);
        L.paint.save(); L.paint.globalAlpha = a; L.ink.save(); L.ink.globalAlpha = a;
        paintReefs(L, pal, { ...n, reefs: ['newrock'], tide: 'low' });
        L.paint.restore(); L.ink.restore();
      }
      this.drawShimmer(L, pal, dark);
      if (this.magMell > 0) this.drawMagMell(L, this.magMell);
      // ships, far to near
      const lagA = hasAnomaly(n, 'lagReflection');
      const allLag = hasAnomaly(n, 'allLag');
      const ships = this.fleet.ships.filter((s) => s.state !== 'waiting').sort((a, b) => a.pos[1] - b.pos[1]);
      for (const s of ships) {
        let lag = allLag ? allLag.lag : 0;
        if (lagA && s.index === lagA.ship) lag = lagA.lag;
        drawShip(L, s, pal, t, { lag, fleet: this.fleet, dark });
      }
      if (this.phantom) this.drawPhantom(L, pal, t);
      if (this.manannan && this.manannan.a > 0) this.drawManannan(L, pal);
      // the beam + lamp
      const reach = 1 - n.haar * 0.55;
      const toward = drawBeam(L.light, L.paint, this.beamAngle, { reach, intensity: k * (1 - n.haar * 0.35), haar: n.haar });
      drawLamp(L.light, 0.4 + 0.6 * smooth(0, 3, t), Math.pow(toward, 6) * 0.8);
      this.drawWeather(L, pal, t);
      this.drawControls(L);
    } else {
      const { pal, cache } = bayBackdrop(L, g, { tod: 'dawn', night: n });
      L.blit(cache);
      this.drawShimmer(L, pal, 0.1);
      // boats at their moorings; any that struck wait on the rocks
      const res = this.dawnShips;
      res.forEach((r, i) => {
        if (r.fate === 'gone') return;
        const s = { name: r.name, size: r.size, index: i, pos: r.fate === 'home' ? [87.5 + i * 2.2, 8.2 + (i % 2) * 0.8] : (r.at || [50, 30]), dir: [1, 0], trail: [], lantern: r.fate === 'home' ? 0.15 : 0.25, fade: 1, bob: i };
        drawShip(L, s, pal, t, { dark: 0.1 });
      });
      drawLamp(L.light, 0.25);
      this.drawWeather(L, pal, t);
      // "open the logbook"
      const hov = g.input.button({ id: 'dawn-open', x: 1190, y: 900, w: 330, h: 70, onClick: () => { if (!this.leaving) { this.leaving = true; g.onDawnSeen(); } } });
      if (t > 1.2) letter(L.ink, 'open the logbook →', 1500, 945, { size: 34, align: 'right', alpha: smooth(1.2, 2.5, t) * (hov ? 1 : 0.8), hand: 'keeper', color: hov ? '#1E2A44' : PAL.ink });
    }
  }

  drawControls(L) {
    const g = this.game;
    const label = this.fast ? 'let the night be slow' : 'wait for dawn';
    const hov = g.input.button({ id: 'night-fast', x: 1230, y: 905, w: 300, h: 60, onClick: () => { this.fast = !this.fast; g.audio?.soft(); } });
    letter(L.ink, label, 1510, 948, { size: 32, align: 'right', alpha: smooth(2, 4, this.t) * (hov ? 0.95 : 0.6), hand: 'keeper', color: '#ECE4D2' });
    if (this.fleet && this.t < 14 && g.state.nightsPlayed < 2) {
      letter(L.ink, 'click a boat and the beam will rest on it a while', 800, 980, { size: 24, align: 'center', alpha: smooth(4, 6, this.t) * (1 - smooth(11, 14, this.t)) * 0.7, hand: 'keeper', color: '#E8E0CC' });
    }
  }

  drawShimmer(L, pal, dark) {
    const t = this.t, light = L.light;
    // village lights' reflections: broken gold columns that tremble
    const n = this.night;
    if (dark > 0.3) {
      const sites = villageSites();
      const total = sites.length;
      const lit = n.lightsCount ? n.lights : Math.round(n.lights * total);
      const order = sites.map((_, i) => i).sort((a, b) => noise1(a * 7.3, 2) - noise1(b * 7.3, 2));
      const sorted = sites.slice().sort((a, b) => a[1] - b[1]);
      for (const i of order.slice(0, lit)) {
        const [x, y] = sorted[i];
        const [sx, sy, sc] = pz(x, y + 5, 0);
        for (let j = 0; j < 5; j++) {
          const yy = sy + j * 6 * sc;
          glow(light, sx + Math.sin(t * 1.6 + j + i) * 2, yy, (6 - j) * sc * 1.4, '#E7A846', 0.12 * dark);
        }
      }
    }
    // sparkles: tiny catches of light on the swell
    const r = rng(Math.floor(t * 2.5));
    const cnt = dark > 0.5 ? 10 : 22;
    for (let i = 0; i < cnt; i++) {
      const x = lerp(-100, 1700, r()), y = lerp(HORIZON + 10, 880, Math.pow(r(), 0.8));
      const life = (t * 2.5) % 1;
      glow(light, x, y, 6, dark > 0.5 ? '#9AA6C8' : '#F2D9A8', 0.25 * Math.sin(life * Math.PI));
    }
  }

  drawPhantom(L, pal, t) {
    // a reflection of a boat, with no boat above it
    const p = this.phantom;
    const path = [[22, 44], [40, 40], [58, 34], [75, 26]];
    const tot = 60;
    const u = clamp(p.s / tot, 0, 1);
    if (u >= 1) return;
    const seg = Math.min(2, Math.floor(u * 3)), f = u * 3 - seg;
    const a = path[seg], b = path[seg + 1];
    const pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const s = { name: 'Lantern', size: 'small', index: 9, pos, dir: [1, -0.3], trail: [], lantern: 0.6, fade: 1, bob: 2 };
    drawShip(L, s, pal, t, { phantom: true, alpha: Math.sin(u * Math.PI) });
  }

  drawMagMell(L, a) {
    // an island in impossible colour, far out past the stacks, for a moment
    const { paint: c, light } = L;
    const x = 130, y = HORIZON + 4;
    c.save();
    c.translate(x, y); c.scale(1.4, 1.4); c.translate(-x, -y);
    c.globalAlpha = a;
    wash(c, [[x - 110, y + 2], [x - 70, y - 22], [x - 20, y - 34], [x + 30, y - 26], [x + 80, y - 14], [x + 120, y + 2]], '#7FB35A', { alpha: a, amp: 2, seed: 5 });
    wash(c, [[x - 60, y - 18], [x - 20, y - 32], [x + 20, y - 26], [x + 30, y - 12]], '#E9C24A', { alpha: 0.7 * a, amp: 2, seed: 6 });
    radial(c, x, y - 36, 230, [[0, rgba('#F4BC84', 0.5 * a)], [0.5, rgba('#F2B07A', 0.2 * a)], [1, rgba('#F2B07A', 0)]], 'source-over', 0.38);
    wash(c, [[x - 70, y - 14], [x - 46, y - 40], [x - 22, y - 46], [x + 4, y - 36], [x + 14, y - 20]], '#5E9A48', { alpha: 0.85 * a, amp: 2, seed: 15 });
    for (let i = 0; i < 9; i++) blob(c, x - 80 + i * 20, y - 12 - Math.sin(i * 1.3) * 9 - (i > 2 && i < 6 ? 16 : 0), 7, 6, i % 2 ? '#4E8A3E' : '#6AA850', 0.85 * a, 20 + i);
    for (let i = 0; i < 7; i++) blob(c, x - 70 + i * 22, y - 18 - Math.sin(i * 1.3) * 9 - (i > 1 && i < 5 ? 14 : 0), 2.4, 2.4, i % 3 ? '#F3D46A' : '#E8789A', 0.9 * a, 40 + i, 0.1);
    c.restore();
    glow(light, x, y - 26, 260, '#F2C063', 0.55 * a);
    glow(light, x, y - 26, 80, '#FFE6A8', 0.5 * a);
  }

  drawManannan(L, pal) {
    // a tall shape on the water, wrapped in mist; never clear
    const m = this.manannan;
    const { paint: c, ink, light } = L;
    const wx = 33, wy = 25;
    const [sx, sy, sc] = pz(wx, wy, 0);
    const H = 440 * sc, W = 128 * sc;
    const a = m.a;
    const body = [];
    const N = 28;
    const half = (u) => W * (u < 0.16 ? 0.13 + 0.12 * Math.sin((u - 0.08) / 0.08 * Math.PI / 2) : 0.25 + 0.42 * Math.pow((u - 0.16) / 0.84, 1.3));
    for (let i = 0; i <= N; i++) { const u = 0.08 + (i / N) * 0.92; body.push([sx - half(u) - noise1(u * 4 + m.tt * 0.3, 3) * 9 * sc, sy - H + u * H]); }
    for (let i = N; i >= 0; i--) { const u = 0.08 + (i / N) * 0.92; body.push([sx + half(u) * 1.1 + noise1(u * 4 + m.tt * 0.3, 5) * 12 * sc, sy - H + u * H]); }
    const fade = (ctx, col, top, bottom) => {
      const g = ctx.createLinearGradient(0, sy - H, 0, sy + 6);
      g.addColorStop(0, rgba(col, top)); g.addColorStop(0.55, rgba(col, top * 0.85)); g.addColorStop(1, rgba(col, bottom));
      return g;
    };
    c.save();
    // the cloak trailing off with the wind, as mist
    for (let i = 0; i < 16; i++) {
      const u = i / 15;
      const tx = sx + W * 0.35 + u * W * 2.8, ty = sy - H * (0.42 - u * 0.3) + Math.sin(u * 5 + m.tt * 0.4) * 10 * sc;
      blob(c, tx, ty, (26 + u * 30) * sc, (14 + u * 10) * sc, '#8C93A2', a * 0.16 * (1 - u * 0.7), 60 + i, 0.3);
    }
    wash(c, body, fade(c, '#41485A', 0.95, 0.15), { alpha: a, amp: 6, seed: 3, blur: 2 });
    // folds, a little lighter where the lamp reaches
    glazes(c, sx - W * 0.4, sx + W * 0.45, sy - H * 0.75, sy - H * 0.1, ['#6A7284', '#8C93A2'], { count: 7, alpha: [0.08 * a, 0.18 * a], w: [6 * sc, 14 * sc], h: [H * 0.3, H * 0.5], seed: 12, tilt: 0.04 });
    // the head, turning: a little lighter on the side that faces the light
    const hx = sx + m.turn * W * 0.08, hy = sy - H + 14 * sc;
    blob(c, hx, hy, W * 0.15, W * 0.2, '#3A4152', 0.95 * a, 4, 0.1);
    blob(c, hx - m.turn * W * 0.06, hy + 2, W * 0.07, W * 0.13, '#B5BBC6', 0.4 * a * (1 - Math.abs(m.turn) * 0.6), 5, 0.1);
    c.restore();
    // a faint inked presence, so the mist can't take him altogether
    ink.save();
    ink.globalAlpha = a * 0.34;
    ink.fillStyle = fade(ink, '#2C3242', 1, 0);
    trace(ink, wobble(body, { amp: 3, seed: 21 }));
    ink.fill();
    ink.globalAlpha = a * 0.4;
    for (let k = 0; k < 4; k++) {
      const fx = sx + (k - 1.5) * W * 0.17;
      inkLine(ink, [[fx, sy - H * 0.72], [fx + 2 * sc, sy - H * 0.4], [fx + (k - 1.5) * 6 * sc, sy - H * 0.05]], { width: 1.1, alpha: 0.24 * a, seed: 30 + k, breaks: 0.2 });
    }
    ink.restore();
    // every reflection, at once
    c.save();
    c.globalAlpha = a * 0.35;
    c.fillStyle = '#3E4556';
    for (let i = 0; i < 12; i++) c.fillRect(sx - W * 0.35 + Math.sin(m.tt + i) * 4, sy + 4 + i * 8 * sc, W * 0.75 * (1 - i / 13), 3.4 * sc);
    c.restore();
    glow(light, hx, hy - 10, 160 * sc, '#8E9AB0', 0.22 * a);
    // fog uniforms: the mist gathers about his feet and trails off
    const [cx, cy] = this.game.layers.toCss(sx + W * 0.6, sy - H * 0.2);
    const k = this.game.layers.k;
    this.manannan.uv = [cx / this.game.layers.cssW, 1 - cy / this.game.layers.cssH, (W * 2.4 * k) / this.game.layers.cssW, (H * 0.35 * k) / this.game.layers.cssH];
  }

  drawWeather(L, pal, t) {
    const n = this.night;
    if (n.weather === 'rain') {
      const ink = L.ink;
      ink.save();
      ink.strokeStyle = rgba('#C8CCD8', 0.28);
      ink.lineWidth = 1;
      const r = rng(Math.floor(t * 12));
      for (let i = 0; i < 90; i++) {
        const x = lerp(-100, 1700, r()), y = lerp(-50, 1000, r());
        ink.beginPath(); ink.moveTo(x, y); ink.lineTo(x - 6, y + 22); ink.stroke();
      }
      ink.restore();
    }
  }
}
