// Day vignettes: a painted picture of the place, loose at its edges like a sketchbook study, and a few
// lines of dialogue or found text underneath. Click / tap / space to read on; then dusk.
import {
  rng, rgba, wash, wobble, glazes, waveMarks, blob, inkLine, glow, mixHex, smooth, clamp, noise1, trace, hatch,
  vgrad, ellipsePts, withBlur,
} from '../paint.js';
import { letter, block } from '../hand.js';
import { ARRIVAL, VIGNETTES, QUIET, PLACES } from '../../data/story-village.js';

const SAFE = { w: 1600, h: 1000 };
const ART = { x0: 260, y0: 46, x1: 1340, y1: 560 };

export class VignetteScene {
  constructor(game) {
    this.game = game;
    this.safe = SAFE;
    game.input.on('down', () => { if (game.scene === this) this.advance(); });
    game.input.on('key', (e) => {
      if (game.scene !== this) return false;
      if (e.key === ' ' || e.key === 'Enter') { this.advance(); return true; }
      return false;
    });
  }

  enter({ place }) {
    const g = this.game, n = g.night;
    this.n = n;
    this.place = place;
    this.t = 0;
    this.leaving = false;
    let v;
    if (place === 'arrival') v = ARRIVAL;
    else v = VIGNETTES[n.id]?.[place];
    if (!v) {
      const act = Math.min(3, Math.max(1, n.act));
      const pool = QUIET[place] || QUIET.lighthouse;
      const lines = pool[act] || pool[3] || pool[1] || ['It is quiet.'];
      v = { title: PLACES[place]?.label || place, lines };
    }
    this.v = v;
    this.kind = place === 'arrival' ? 'arrival'
      : /shed/i.test(v.title) ? 'shed'
      : /pub/i.test(v.title) ? 'pub'
      : place === 'village' ? 'shop'
      : place === 'lighthouse' ? (/gallery/i.test(v.title) ? 'gallery' : 'lamp')
      : place;
    this.lines = v.lines.map((l) => (typeof l === 'string' ? { who: null, text: l } : { who: l[0], text: l[1] }));
    this.shown = 1;
    this.lineT = 0;
  }

  look() {
    const n = this.n;
    const haar = n.weather === 'haar' && this.kind !== 'lamp' && this.kind !== 'shop' && this.kind !== 'pub' && this.kind !== 'cottages' && this.kind !== 'school' && this.kind !== 'shed';
    return { ...n.look, fog: haar ? 0.55 : 0, fogColor: [0.88, 0.88, 0.86], wobble: 3, warmth: (n.look.warmth ?? 0.5) + (this.kind === 'arrival' ? 0.1 : 0) };
  }

  paintRect() { return { x0: 60, y0: 10, x1: 1540, y1: 990 }; }

  lineDur(l) { return 0.4 + l.text.length / 38; }

  advance() {
    if (this.leaving) return;
    const cur = this.lines[this.shown - 1];
    if (this.lineT < this.lineDur(cur)) { this.lineT = this.lineDur(cur); return; }
    if (this.shown < this.lines.length) { this.shown++; this.lineT = 0; this.game.audio?.soft(); return; }
    this.leave();
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio?.page();
    this.game.toDusk();
  }

  update(dt) {
    this.t += dt;
    this.lineT += dt;
    if (this.game.autoplay && this.t > 0.4) {
      this.autoT = (this.autoT || 0) + dt;
      if (this.autoT > 0.25) { this.autoT = 0; this.lineT = 99; this.advance(); }
    }
  }

  draw(L) {
    const n = this.n;
    const cache = L.cache(`vig|${this.kind}|${n.id}|${this.place}`, (C) => paintArt(C, this.kind, n));
    L.blit(cache);
    const ink = L.ink, t = this.t;
    // live light
    lightFor(L, this.kind, n, t);
    // title
    letter(ink, this.v.title, 800, 618, { hand: 'serifItalic', size: 38, align: 'center', alpha: 0.8 * smooth(0.2, 1.2, t) });
    // lines: the last few, older ones fading
    const first = Math.max(0, this.shown - 4);
    let y = 668;
    const x = 330, w = 940;
    for (let i = first; i < this.shown; i++) {
      const l = this.lines[i];
      const cur = i === this.shown - 1;
      const reveal = cur ? clamp(this.lineT / this.lineDur(l), 0, 1) : 1;
      const age = this.shown - 1 - i;
      const a = cur ? 1 : Math.max(0.35, 0.8 - age * 0.15);
      let h;
      if (l.who === 'keeper') {
        h = block(ink, l.text, x + 40, y - 30, { hand: 'keeper', size: 34, width: w - 40, drift: n.drift, seed: i + n.id, reveal, alpha: a }).h;
      } else if (l.who) {
        letter(ink, l.who, x - 20, y, { hand: 'serifItalic', size: 25, align: 'right', alpha: 0.6 * a });
        h = block(ink, '“' + l.text + '”', x, y - 30, { hand: 'serif', size: 31, width: w, seed: i, reveal, alpha: a }).h;
      } else {
        h = block(ink, l.text, x, y - 30, { hand: 'serifItalic', size: 31, width: w, seed: i, reveal, alpha: a * 0.92 }).h;
      }
      y += h + 14;
    }
    // continue / to dusk
    const cur = this.lines[this.shown - 1];
    const ready = this.lineT >= this.lineDur(cur);
    if (ready) {
      const last = this.shown >= this.lines.length;
      const label = last ? 'to dusk ›' : '…';
      const a = 0.45 + 0.25 * Math.sin(t * 2.4);
      if (last) {
        const hov = this.game.input.button({ id: 'vig-next', x: 1200, y: 920, w: 200, h: 60, onClick: () => this.leave() });
        letter(ink, label, 1380, 962, { hand: 'keeper', size: 38, align: 'right', alpha: hov ? 0.95 : 0.7 });
      } else {
        letter(ink, label, 1300, 962, { hand: 'serif', size: 34, align: 'right', alpha: a });
      }
    }
  }
}

// ---------------------------------------------------------------- painting
function C_(n) { const cool = n.look.cool || 0; return (h) => mixHex(h, '#8C9098', cool * 0.42); }

function vignetteClip(c, seed) {
  const { x0, y0, x1, y1 } = ART;
  const pts = wobble([[x0 + 10, y0 + 40], [x0 + 70, y0 + 6], [x0 + 400, y0 + 14], [x1 - 60, y0], [x1 - 6, y0 + 60], [x1, y1 - 120], [x1 - 30, y1 - 10], [x0 + 600, y1 + 4], [x0 + 60, y1 - 14], [x0, y1 - 160]], { amp: 26, freq: 0.016, seed, step: 9 });
  trace(c, pts);
  return pts;
}

function paintArt(C, kind, n) {
  const { paint: c, ink, mask } = C;
  const col = C_(n);
  c.save(); const shape = vignetteClip(c, 7 + kind.length); c.clip();
  ink.save(); trace(ink, shape); ink.clip();
  mask.save(); trace(mask, shape); mask.clip();
  const fn = { arrival, lamp, gallery: cliff, shed, cliff, shop, pub, harbour, cottages, school }[kind] || lamp;
  fn(C, col, n);
  if (n.weather === 'rain') rain(C, col);
  // light and shadow glazes over everything: warm from the upper left, cool shadow to the lower right
  const { x0, y0, x1, y1 } = ART;
  const lg = c.createLinearGradient(x0, y0, x1, y1);
  lg.addColorStop(0, 'rgba(250,226,180,0.16)'); lg.addColorStop(0.55, 'rgba(250,226,180,0)'); lg.addColorStop(1, 'rgba(70,72,110,0.22)');
  c.fillStyle = lg; c.fillRect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
  glazes(c, x0, x1, y0, y1, [col('#6E6A8A'), col('#C9A87A'), col('#8EA0B8')], { count: 22, alpha: [0.04, 0.1], w: [120, 420], h: [30, 120], seed: 91, round: 0.95 });
  mask.fillStyle = 'rgba(0,0,140,0.35)'; mask.fillRect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
  mask.restore(); ink.restore();
  // dry, broken edges: paper left showing where the brush skipped
  const rr = rng(13 + kind.length);
  for (let i = 0; i < shape.length; i += 1) {
    if (rr() < 0.45) continue;
    const p = shape[i];
    blob(c, p[0] + (rr() - 0.5) * 10, p[1] + (rr() - 0.5) * 10, 6 + rr() * 16, 4 + rr() * 9, '#F2EAD9', 0.9, i);
  }
  c.restore();
  // a soft wash bleeding out past the clip edge here and there, so it reads as painted, not cut
  const r = rng(11);
  for (let i = 0; i < 9; i++) {
    const p = shape[Math.floor(r() * shape.length)];
    blob(c, p[0], p[1], 14 + r() * 24, 8 + r() * 14, col(['#9DB3C8', '#C9B58E', '#A9B98C'][i % 3]), 0.18, i);
  }
}

function sky(c, col, y1, stops) {
  const { x0, y0, x1 } = ART;
  vgrad(c, x0 - 20, y0 - 20, x1 + 20, y1, stops.map(([t, h]) => [t, col(h)]));
  glazes(c, x0, x1, y0, y1, [col('#F6E8D2'), col('#C9C2D6')], { count: 14, alpha: [0.06, 0.18], w: [120, 380], h: [8, 22], seed: 3 });
}
function sea(C, col, yTop, y1, opts = {}) {
  const { paint: c, ink, mask } = C;
  const { x0, x1 } = ART;
  vgrad(c, x0 - 20, yTop, x1 + 20, y1, [[0, col(opts.far || '#9DB3C8')], [1, col(opts.near || '#3B5B8C')]]);
  glazes(c, x0, x1, yTop, y1, [col('#2F4E80'), col('#6F8FB3')], { count: 30, alpha: [0.08, 0.2], w: [60, 260], h: [3, 9], seed: 4 });
  waveMarks(ink, x0, x1, yTop + 10, y1, { count: 34, color: col('#22385E'), alpha: 0.35, seed: 5, size: [6, 14] });
  mask.fillStyle = 'rgb(255,200,0)'; mask.fillRect(x0 - 20, yTop, x1 - x0 + 40, y1 - yTop);
}

function arrival(C, col, n) {
  const { paint: c, ink, light, mask } = C;
  const { x0, y0, x1, y1 } = ART;
  sky(c, col, 360, [[0, '#8FA6C8'], [0.6, '#E8C9A8'], [1, '#F4DDB0']]);
  sea(C, col, 330, y1, { far: '#D7B9A0', near: '#4A6A98' });
  // the stacks
  for (const [sx, sw, sh] of [[360, 26, 60], [430, 16, 34]]) wash(c, [[sx - sw, 380], [sx - sw * 0.6, 380 - sh], [sx + sw * 0.5, 380 - sh * 0.9], [sx + sw, 380]], col('#7A6060'), { alpha: 0.85, passes: 2, amp: 2, seed: sx });
  // the hill rising to the right, the lighthouse on top
  const hill = [[x0 - 20, y1 + 20], [520, 480], [760, 380], [980, 300], [1150, 270], [x1 + 30, 280], [x1 + 30, y1 + 20]];
  wash(c, wobble(hill, { amp: 5, freq: 0.02, seed: 4, step: 10 }), col('#6E8E4C'), { alpha: 0.96, passes: 3, amp: 4, seed: 5 });
  glazes(c, 500, x1, 270, y1, [col('#5A7A3E'), col('#8FA65E'), col('#A38A5A')], { count: 40, alpha: [0.1, 0.25], w: [40, 180], h: [8, 26], seed: 6, round: 0.9 });
  mask.fillStyle = 'rgb(0,0,80)'; trace(mask, hill); mask.fill();
  // path
  const path = [[640, y1 + 10], [760, 470], [900, 400], [990, 350], [1080, 300]];
  c.save(); c.strokeStyle = rgba(col('#D4C29A'), 0.85); c.lineWidth = 16; c.lineCap = 'round'; trace(c, path, false); c.stroke(); c.restore();
  inkLine(ink, path.map(([x, y]) => [x + 9, y + 2]), { width: 1, alpha: 0.4, seed: 7 });
  // wall
  inkLine(ink, [[x0, 520], [600, 470], [800, 400], [1000, 330]], { width: 1.6, alpha: 0.5, seed: 8, breaks: 0.08 });
  // the tower
  tower(C, 1140, 272, 1.25, col);
  // heather and gorse
  const r = rng(9);
  for (let i = 0; i < 90; i++) blob(c, 520 + r() * 820, 300 + r() * 260, 3 + r() * 6, 2 + r() * 4, i % 2 ? col('#D4AE3A') : col('#9A6E92'), 0.4, i);
  for (let i = 0; i < 7; i++) blob(c, 600 + r() * 600, 440 + r() * 100, 9, 6, '#F4F0E6', 0.95, i + 50);
}

function tower(C, x, base, k, col) {
  const { paint: c, ink, light } = C;
  const h = 210 * k, wb = 34 * k, wt = 26 * k;
  const body = [[x - wb / 2, base], [x - wt / 2, base - h], [x + wt / 2, base - h], [x + wb / 2, base]];
  wash(c, body, col('#F4EFE6'), { alpha: 1, passes: 2, amp: 0.8, seed: 21 });
  vgrad(c, x + wt * 0.1, base - h, x + wb / 2, base, [[0, 'rgba(150,140,170,0.25)'], [1, 'rgba(150,140,170,0.35)']]);
  inkLine(ink, [...body, body[0]], { width: 1.4, alpha: 0.85, seed: 22 });
  // lantern room
  const ly = base - h;
  c.fillStyle = col('#2E2A30'); c.fillRect(x - wt * 0.62, ly - 6 * k, wt * 1.24, 6 * k);
  c.fillStyle = '#F2CF86'; c.fillRect(x - wt * 0.4, ly - 30 * k, wt * 0.8, 24 * k);
  inkLine(ink, [[x - wt * 0.42, ly - 30 * k], [x - wt * 0.42, ly - 6 * k]], { width: 1, alpha: 0.8, seed: 23 });
  inkLine(ink, [[x + wt * 0.42, ly - 30 * k], [x + wt * 0.42, ly - 6 * k]], { width: 1, alpha: 0.8, seed: 24 });
  c.fillStyle = col('#2E2A30');
  c.beginPath(); c.moveTo(x - wt * 0.5, ly - 30 * k); c.lineTo(x, ly - 44 * k); c.lineTo(x + wt * 0.5, ly - 30 * k); c.fill();
  // the keeper's house at the foot
  const hx = x - 60 * k;
  wash(c, [[hx - 34 * k, base + 4], [hx - 34 * k, base - 24 * k], [hx + 18 * k, base - 24 * k], [hx + 18 * k, base + 4]], col('#F2EBDD'), { alpha: 1, passes: 1, amp: 0.6, seed: 25 });
  wash(c, [[hx - 38 * k, base - 24 * k], [hx - 30 * k, base - 38 * k], [hx + 14 * k, base - 38 * k], [hx + 22 * k, base - 24 * k]], col('#4A4458'), { alpha: 0.95, passes: 1, amp: 0.6, seed: 26 });
  inkLine(ink, [[hx - 34 * k, base + 4], [hx - 34 * k, base - 24 * k], [hx + 18 * k, base - 24 * k], [hx + 18 * k, base + 4]], { width: 1, alpha: 0.7, seed: 27 });
}

function cliff(C, col, n) {
  const { paint: c, ink } = C;
  const { x0, y0, x1, y1 } = ART;
  sky(c, col, 300, [[0, '#86A3C6'], [1, '#E3E2D8']]);
  sea(C, col, 250, y1, { far: '#B7C6CF', near: '#33568A' });
  // the far headland across
  wash(c, wobble([[x0 - 20, 260], [500, 236], [700, 244], [820, 262], [820, 270], [x0 - 20, 270]], { amp: 4, freq: 0.03, seed: 3, step: 10 }), col('#8E96A8'), { alpha: 0.6, passes: 2, amp: 3, seed: 4 });
  // near cliff top, a steep drop on the left
  const top = [[x1 + 30, y1 + 30], [x1 + 30, 330], [1150, 340], [960, 380], [820, 430], [700, 500], [640, y1 + 30]];
  wash(c, wobble(top, { amp: 6, freq: 0.03, seed: 5, step: 10 }), col('#6B8E4E'), { alpha: 0.97, passes: 3, amp: 4, seed: 6 });
  // the cliff face falling away
  const face = [[640, y1 + 30], [700, 500], [820, 430], [800, 470], [740, 530], [690, y1 + 30]];
  wash(c, face, col('#A85F3A'), { alpha: 0.85, passes: 2, amp: 4, seed: 7 });
  glazes(c, 640, 820, 430, y1, [col('#7A4A38'), col('#C07A52')], { count: 14, alpha: [0.1, 0.3], w: [10, 40], h: [30, 80], seed: 8, tilt: 1.2 });
  glazes(c, 820, x1, 330, y1, [col('#5A7A3E'), col('#8FA65E'), col('#B9A06A')], { count: 40, alpha: [0.1, 0.25], w: [40, 160], h: [8, 24], seed: 9, round: 0.9 });
  // the wall running away along the top
  inkLine(ink, [[x1, 400], [1100, 410], [950, 440], [840, 470]], { width: 2.2, alpha: 0.55, seed: 10, breaks: 0.12 });
  const r = rng(11);
  for (let i = 0; i < 30; i++) blob(c, 1100 + r() * -260 + r() * 300, 410 + r() * 12 - (i % 3) * 3, 6, 4, col('#8C8478'), 0.5, i);
  // sheep, one of them watching
  for (const [sx, sy] of [[1030, 470], [1120, 455], [1210, 500], [980, 520]]) {
    blob(c, sx, sy, 16, 11, '#F4F0E6', 0.97, sx);
    blob(c, sx - 16, sy - 4, 6, 5, col('#2E2A30'), 0.9, sy);
  }
  // fulmars hanging at eye level
  for (let i = 0; i < 6; i++) {
    const fx = 420 + r() * 340, fy = 150 + r() * 120, s = 10 + r() * 6;
    inkLine(ink, [[fx - s, fy + 2], [fx - s * 0.4, fy - 3], [fx, fy], [fx + s * 0.4, fy - 3], [fx + s, fy + 2]], { width: 1.5, alpha: 0.75, seed: i });
  }
  // gorse
  for (let i = 0; i < 60; i++) blob(c, 820 + r() * 520, 360 + r() * 200, 3 + r() * 5, 2 + r() * 4, col('#D4AE3A'), 0.45, i + 3);
}

function lamp(C, col, n) {
  const { paint: c, ink, light } = C;
  const { x0, y0, x1, y1 } = ART;
  // the glazing: a band of windows round the lamp room, sea and sky beyond
  vgrad(c, x0 - 20, y0 - 20, x1 + 20, y1 + 20, [[0, col('#E9E2D2')], [1, col('#D4CBB8')]]);
  const wy0 = 110, wy1 = 420;
  vgrad(c, x0, wy0, x1, 300, [[0, col(n.weather === 'haar' ? '#D8DCDC' : '#9DB6D2')], [1, col('#E6E2D4')]]);
  vgrad(c, x0, 300, x1, wy1, [[0, col(n.weather === 'haar' ? '#C9CED0' : '#7E9AC0')], [1, col('#3B5B8C')]]);
  if (n.weather !== 'haar') waveMarks(ink, x0, x1, 310, wy1, { count: 24, color: col('#22385E'), alpha: 0.3, seed: 3, size: [6, 12] });
  // window bars
  for (let x = x0 + 40; x < x1; x += 120) inkLine(ink, [[x, wy0], [x + 2, wy1]], { width: 4, color: '#2B2622', alpha: 0.85, seed: x });
  inkLine(ink, [[x0, wy0], [x1, wy0]], { width: 5, alpha: 0.85, seed: 3 });
  inkLine(ink, [[x0, wy1], [x1, wy1]], { width: 6, alpha: 0.85, seed: 4 });
  inkLine(ink, [[x0, 265], [x1, 265]], { width: 2, alpha: 0.6, seed: 5 });
  // floor & brass rail
  wash(c, [[x0 - 20, wy1], [x1 + 20, wy1], [x1 + 20, y1 + 20], [x0 - 20, y1 + 20]], col('#8E6E52'), { alpha: 0.85, passes: 2, amp: 2, seed: 6 });
  // the lens: a tall barrel of glass prisms on a brass pedestal
  const cx = 800, top = 150, bot = 470, w = 150;
  const lens = [[cx - w, top + 20], [cx - w * 0.85, top], [cx + w * 0.85, top], [cx + w, top + 20], [cx + w, bot - 20], [cx + w * 0.85, bot], [cx - w * 0.85, bot], [cx - w, bot - 20]];
  wash(c, lens, col('#C9DAD6'), { alpha: 0.55, passes: 2, amp: 1.5, seed: 7 });
  for (let y = top + 18; y < bot - 10; y += 16) {
    const k = Math.abs(y - (top + bot) / 2) / ((bot - top) / 2);
    inkLine(ink, [[cx - w * (1 - k * 0.1), y], [cx + w * (1 - k * 0.1), y]], { width: 1.1, color: '#4E5A5C', alpha: 0.45, seed: y });
  }
  inkLine(ink, [...lens, lens[0]], { width: 1.6, alpha: 0.8, seed: 8 });
  // the burner inside
  c.fillStyle = '#F2C778'; c.beginPath(); c.ellipse(cx, (top + bot) / 2, 26, 40, 0, 0, Math.PI * 2); c.fill();
  // pedestal
  wash(c, [[cx - 70, bot], [cx + 70, bot], [cx + 90, y1 + 20], [cx - 90, y1 + 20]], col('#B08A3E'), { alpha: 0.95, passes: 2, amp: 1, seed: 9 });
  inkLine(ink, [[cx - 70, bot], [cx - 90, y1 + 20]], { width: 1.4, alpha: 0.8, seed: 10 });
  inkLine(ink, [[cx + 70, bot], [cx + 90, y1 + 20]], { width: 1.4, alpha: 0.8, seed: 11 });
  // the logbook on its desk, at the side
  wash(c, [[1060, 470], [1260, 470], [1270, 520], [1050, 520]], col('#6A4E36'), { alpha: 0.95, passes: 1, amp: 1, seed: 12 });
  wash(c, [[1090, 448], [1230, 448], [1236, 470], [1084, 470]], col('#F2EAD9'), { alpha: 1, passes: 1, amp: 0.5, seed: 13 });
  inkLine(ink, [[1160, 448], [1160, 470]], { width: 1, alpha: 0.6, seed: 14 });
}

function shed(C, col, n) {
  const { paint: c, ink } = C;
  const { x0, y0, x1, y1 } = ART;
  vgrad(c, x0 - 20, y0 - 20, x1 + 20, y1 + 20, [[0, col('#7A5E46')], [1, col('#4E3C2E')]]);
  glazes(c, x0, x1, y0, y1, [col('#8E6E52'), col('#5A4436')], { count: 30, alpha: [0.1, 0.25], w: [10, 30], h: [200, 500], seed: 3, tilt: 1.55 });
  // the door, open, with light and pencil numbers
  wash(c, [[1120, 90], [1300, 80], [1300, 520], [1120, 530]], col('#F0E4C8'), { alpha: 0.95, passes: 2, amp: 2, seed: 4 });
  for (let i = 0; i < 14; i++) letter(ink, String(12 - (i % 4)), 1140 + (i % 2) * 70, 140 + i * 24, { hand: 'pencil', size: 20, alpha: 0.45, color: '#4E4E58', seed: i });
  letter(ink, n.id >= 8 ? '12' : '12', 1150, 490, { hand: 'keeper', size: 30, alpha: 0.85, seed: 2 });
  // drums
  const count = n.id >= 8 ? 9 : 12;
  for (let i = 0; i < count; i++) {
    const row = i < 6 ? 0 : 1, k = i % 6;
    const x = 360 + k * 110 + row * 50, y = 470 - row * 120;
    const d = [[x - 42, y], [x - 42, y - 110], [x + 42, y - 110], [x + 42, y]];
    wash(c, d, col(i % 3 ? '#4E6458' : '#5E6E5C'), { alpha: 0.95, passes: 2, amp: 1, seed: i });
    c.fillStyle = rgba('#C9C2B0', 0.3); c.fillRect(x - 30, y - 104, 16, 96);
    inkLine(ink, [...d, d[0]], { width: 1.2, alpha: 0.8, seed: i + 30 });
    inkLine(ink, [[x - 42, y - 40], [x + 42, y - 40]], { width: 1, alpha: 0.5, seed: i + 40 });
    inkLine(ink, [[x - 42, y - 75], [x + 42, y - 75]], { width: 1, alpha: 0.5, seed: i + 50 });
  }
  // the empty spaces, three clean rings on the floor
  if (n.id >= 8) for (let k = 0; k < 3; k++) { ink.strokeStyle = rgba('#2B2622', 0.4); ink.lineWidth = 1.2; ink.beginPath(); ink.ellipse(690 + k * 110, 486, 40, 9, 0, 0, Math.PI * 2); ink.stroke(); }
}

function shop(C, col, n) {
  const { paint: c, ink } = C;
  const { x0, y0, x1, y1 } = ART;
  const empty = n.id >= 15;
  vgrad(c, x0 - 20, y0 - 20, x1 + 20, y1 + 20, [[0, col('#E6DCC6')], [1, col('#C9B898')]]);
  glazes(c, x0, x1, y0, y1, [col('#D8C8A8'), col('#B8A07E'), col('#E8DCC0')], { count: 30, alpha: [0.08, 0.2], w: [60, 260], h: [40, 160], seed: 2, round: 0.9 });
  // window with the street and sea beyond
  wash(c, [[340, 100], [600, 100], [600, 360], [340, 360]], col('#BFD0DC'), { alpha: 0.9, passes: 2, amp: 1.5, seed: 3 });
  wash(c, [[340, 280], [600, 280], [600, 360], [340, 360]], col('#5B7DAA'), { alpha: 0.6, passes: 1, amp: 1, seed: 4 });
  inkLine(ink, [[470, 100], [470, 360]], { width: 3, alpha: 0.8, seed: 5 });
  inkLine(ink, [[340, 230], [600, 230]], { width: 3, alpha: 0.8, seed: 6 });
  inkLine(ink, [[340, 100], [600, 100], [600, 360], [340, 360], [340, 100]], { width: 2, alpha: 0.85, seed: 7 });
  // shelves
  const r = rng(8);
  for (let s = 0; s < 4; s++) {
    const y = 140 + s * 80;
    inkLine(ink, [[700, y], [1300, y + 2]], { width: 2.4, alpha: 0.8, seed: s });
    wash(c, [[700, y], [1300, y], [1300, y + 8], [700, y + 8]], col('#8A6A4A'), { alpha: 0.9, passes: 1, amp: 0.5, seed: s + 10 });
    if (empty) continue;
    for (let x = 712; x < 1290; x += 26 + r() * 22) {
      const h = 24 + r() * 30, w = 16 + r() * 12;
      if (r() < 0.25) continue;
      const tint = mixHex(['#B8483A', '#3E6A8A', '#D8B04A', '#5E7E4A', '#E8E0CE', '#8A5A7A'][Math.floor(r() * 6)], '#B8A88A', 0.35);
      wash(c, [[x, y], [x, y - h], [x + w, y - h], [x + w, y]], col(tint), { alpha: 0.6 + r() * 0.25, passes: 2, amp: 1.2, seed: x });
      if (r() < 0.6) inkLine(ink, [[x, y - h], [x + w, y - h + (r() - 0.5) * 3], [x + w, y]], { width: 0.8, alpha: 0.4, seed: x + 1, breaks: 0.2 });
    }
  }
  // counter
  wash(c, [[x0 - 20, 430], [x1 + 20, 420], [x1 + 20, y1 + 20], [x0 - 20, y1 + 20]], col('#6E4E36'), { alpha: 0.95, passes: 2, amp: 2, seed: 20 });
  inkLine(ink, [[x0, 430], [x1, 420]], { width: 2, alpha: 0.8, seed: 21 });
  if (!empty) {
    // the bread, the paper bags
    blob(c, 900, 412, 50, 18, col('#C98E4E'), 0.95, 22);
    wash(c, [[1000, 420], [1010, 360], [1070, 360], [1080, 420]], col('#D9C29A'), { alpha: 0.95, passes: 1, amp: 1, seed: 23 });
  }
  // the bell over the door
  inkLine(ink, [[300, 60], [300, 80]], { width: 1, alpha: 0.8, seed: 24 });
  c.fillStyle = col('#B08A3E'); c.beginPath(); c.moveTo(288, 100); c.quadraticCurveTo(300, 70, 312, 100); c.fill();
}

function pub(C, col, n) {
  const { paint: c, ink, light } = C;
  const { x0, y0, x1, y1 } = ART;
  vgrad(c, x0 - 20, y0 - 20, x1 + 20, y1 + 20, [[0, col('#5A4436')], [1, col('#3A2C24')]]);
  glazes(c, x0, x1, y0, y1, [col('#7A5A42'), col('#2E241E')], { count: 24, alpha: [0.1, 0.3], w: [100, 300], h: [20, 60], seed: 3 });
  // the hearth and a turf fire
  wash(c, [[480, 220], [760, 220], [760, 520], [480, 520]], col('#8E8478'), { alpha: 0.95, passes: 2, amp: 2, seed: 4 });
  wash(c, [[520, 300], [720, 300], [720, 520], [520, 520]], col('#1E1814'), { alpha: 0.95, passes: 2, amp: 2, seed: 5 });
  blob(c, 620, 488, 70, 24, '#E08A3A', 0.9, 6);
  blob(c, 620, 470, 40, 30, '#F2C060', 0.8, 7);
  inkLine(ink, [[470, 220], [770, 220]], { width: 3, alpha: 0.8, seed: 8 });
  // bar and stools
  wash(c, [[860, 330], [x1 + 20, 320], [x1 + 20, y1 + 20], [860, y1 + 20]], col('#4A3020'), { alpha: 0.95, passes: 2, amp: 2, seed: 9 });
  for (const sx of [900, 1020, 1140]) {
    blob(c, sx, 430, 34, 9, col('#6E4E36'), 0.95, sx);
    inkLine(ink, [[sx - 20, 432], [sx - 26, 540]], { width: 2, alpha: 0.7, seed: sx });
    inkLine(ink, [[sx + 20, 432], [sx + 26, 540]], { width: 2, alpha: 0.7, seed: sx + 1 });
  }
  // a glass on the bar, an empty chair by the fire
  wash(c, [[1200, 320], [1204, 286], [1226, 286], [1230, 320]], col('#C9A86A'), { alpha: 0.7, passes: 1, amp: 0.4, seed: 11 });
}

function harbour(C, col, n) {
  const { paint: c, ink, mask } = C;
  const { x0, y0, x1, y1 } = ART;
  sky(c, col, 240, [[0, n.weather === 'haar' ? '#D6D8D6' : '#8EA8C8'], [1, '#E2E0D6']]);
  sea(C, col, 220, y1, { far: '#B8C4CA', near: '#46648E' });
  // village along the far shore
  const r = rng(3);
  for (let i = 0; i < 9; i++) {
    const x = 380 + i * 70 + r() * 20, y = 222;
    wash(c, [[x, y], [x, y - 20], [x + 40, y - 20], [x + 40, y]], col(n.act >= 3 && i % 2 ? '#CFC9BC' : '#F2EBDD'), { alpha: 1, passes: 1, amp: 0.5, seed: i });
    wash(c, [[x - 4, y - 20], [x + 4, y - 32], [x + 36, y - 32], [x + 44, y - 20]], col('#4E4A5A'), { alpha: 0.95, passes: 1, amp: 0.5, seed: i + 20 });
  }
  // the harbour wall sweeping out across the foreground
  const wall = [[x0 - 20, 330], [700, 320], [1100, 360], [x1 + 20, 380], [x1 + 20, 470], [1100, 440], [700, 400], [x0 - 20, 410]];
  wash(c, wall, col('#9A9284'), { alpha: 0.97, passes: 3, amp: 3, seed: 30 });
  glazes(c, x0, x1, 320, 470, [col('#7A7266'), col('#B4AC9C')], { count: 30, alpha: [0.1, 0.25], w: [20, 60], h: [10, 20], seed: 31 });
  inkLine(ink, [[x0, 330], [700, 320], [1100, 360], [x1, 380]], { width: 1.6, alpha: 0.8, seed: 32 });
  for (let i = 0; i < 40; i++) { const x = x0 + r() * (x1 - x0), y = 340 + r() * 90; inkLine(ink, [[x, y], [x + 20 + r() * 20, y + 2]], { width: 0.8, alpha: 0.3, seed: i }); }
  mask.fillStyle = 'rgb(0,60,40)'; trace(mask, wall); mask.fill();
  // Síle's chalk on the wall (Act 1 only)
  if (n.id === 4) {
    const ch = (pts) => inkLine(ink, pts, { width: 1.6, color: '#F6F2E8', alpha: 0.85, seed: pts.length });
    ch([[760, 400], [764, 350], [776, 350], [780, 400]]);
    ch([[770, 350], [900, 330], [900, 362], [770, 352]]);
    for (const bx of [940, 990, 1030]) ch([[bx - 12, 380], [bx, 386], [bx + 12, 380]]);
  }
  // the slip and a boat pulled up on it
  wash(c, [[220, y1 + 20], [560, 440], [680, 450], [420, y1 + 20]], col('#7E7466'), { alpha: 0.95, passes: 2, amp: 2, seed: 40 });
  const boat = [[420, 500], [450, 470], [600, 466], [640, 486], [610, 506], [450, 510]];
  wash(c, boat, col('#2E2A30'), { alpha: 0.95, passes: 2, amp: 1, seed: 41 });
  inkLine(ink, [...boat, boat[0]], { width: 1.2, alpha: 0.85, seed: 42 });
  if (n.id === 13) for (let i = 0; i < 20; i++) inkLine(ink, [[440 + i * 9, 500], [442 + i * 9 + r() * 4, 484 - r() * 14]], { width: 1, color: '#6E8A4A', alpha: 0.85, seed: i });
  // a bench, and a net folded on the wall
  if (n.id < 16) {
    blob(c, 1180, 372, 60, 10, col('#6B7A5A'), 0.8, 43);
    inkLine(ink, [[1100, 470], [1260, 480]], { width: 3, alpha: 0.8, seed: 44 });
  }
}

function cottages(C, col, n) {
  const { paint: c, ink, light } = C;
  const { x0, y0, x1, y1 } = ART;
  vgrad(c, x0 - 20, y0 - 20, x1 + 20, y1 + 20, [[0, col('#DCD4C2')], [1, col('#B7AA92')]]);
  // small deep window with grey light
  wash(c, [[900, 120], [1060, 120], [1060, 300], [900, 300]], col('#C9D0D4'), { alpha: 0.95, passes: 2, amp: 2, seed: 3 });
  inkLine(ink, [[980, 120], [980, 300]], { width: 2.4, alpha: 0.8, seed: 4 });
  inkLine(ink, [[900, 210], [1060, 210]], { width: 2.4, alpha: 0.8, seed: 5 });
  // the hearth, swept and cold
  wash(c, [[360, 200], [640, 200], [640, 520], [360, 520]], col('#8E8478'), { alpha: 0.95, passes: 2, amp: 2, seed: 6 });
  wash(c, [[400, 300], [600, 300], [600, 520], [400, 520]], col('#3A3430'), { alpha: 0.9, passes: 2, amp: 2, seed: 7 });
  inkLine(ink, [[350, 200], [650, 200]], { width: 3, alpha: 0.8, seed: 8 });
  // the clock on the mantel, stopped
  c.fillStyle = col('#6E4E36'); c.fillRect(470, 150, 60, 50);
  c.fillStyle = col('#F2EAD9'); c.beginPath(); c.arc(500, 172, 16, 0, Math.PI * 2); c.fill();
  inkLine(ink, [[500, 172], [500, 160]], { width: 1.4, alpha: 0.9, seed: 9 });
  inkLine(ink, [[500, 172], [509, 175]], { width: 1.4, alpha: 0.9, seed: 10 });
  // dust sheets over the furniture: soft white humps
  for (const [x, w, h] of [[760, 160, 120], [1000, 220, 90], [1220, 120, 150]]) {
    const pts = [[x - w / 2 - 10, 540], [x - w / 2, 540 - h * 0.6], [x - w * 0.2, 540 - h], [x + w * 0.25, 540 - h * 0.95], [x + w / 2, 540 - h * 0.55], [x + w / 2 + 12, 540]];
    wash(c, wobble(pts, { amp: 5, freq: 0.04, seed: x, step: 10 }), '#F1EEE6', { alpha: 0.97, passes: 2, amp: 3, seed: x });
    vgrad(c, x, 540 - h, x + w / 2, 540, [[0, 'rgba(160,160,180,0.0)'], [1, 'rgba(140,140,160,0.18)']]);
    inkLine(ink, wobble(pts, { amp: 3, freq: 0.05, seed: x + 1, closed: false, step: 10 }), { width: 1.1, alpha: 0.5, seed: x + 2, breaks: 0.08 });
  }
  // Síle's drawing pinned to the dresser
  if (n.id === 13) {
    wash(c, [[1180, 250], [1290, 246], [1292, 330], [1182, 334]], '#F6F0E2', { alpha: 1, passes: 1, amp: 1, seed: 20 });
    inkLine(ink, [[1220, 320], [1222, 270], [1230, 270], [1232, 320]], { width: 1.2, color: '#3A4A6A', alpha: 0.9, seed: 21 });
    inkLine(ink, [[1230, 274], [1286, 262]], { width: 1, color: '#D8A040', alpha: 0.9, seed: 22 });
    blob(c, 1262, 300, 8, 22, '#A8AEB8', 0.6, 23);
  }
  // floorboards
  wash(c, [[x0 - 20, 520], [x1 + 20, 520], [x1 + 20, y1 + 20], [x0 - 20, y1 + 20]], col('#8A7258'), { alpha: 0.9, passes: 2, amp: 2, seed: 30 });
}

function school(C, col, n) {
  const { paint: c, ink } = C;
  const { x0, y0, x1, y1 } = ART;
  vgrad(c, x0 - 20, y0 - 20, x1 + 20, y1 + 20, [[0, col('#E0D8C4')], [1, col('#C2B496')]]);
  // the blackboard
  wash(c, [[420, 80], [1180, 80], [1180, 300], [420, 300]], col('#2E3432'), { alpha: 0.95, passes: 2, amp: 2, seed: 3 });
  glazes(c, 430, 1170, 90, 290, ['#4A5250', '#262A28'], { count: 14, alpha: [0.1, 0.25], w: [80, 240], h: [10, 30], seed: 4 });
  inkLine(ink, [[412, 74], [1188, 74], [1188, 306], [412, 306], [412, 74]], { width: 4, color: '#6E4E36', alpha: 0.9, seed: 5 });
  const chalk = '#EDEBE2';
  if (n.id !== 15) {
    letter(ink, 'Friday 13th September 1957', 800, 150, { hand: 'serifItalic', size: 40, align: 'center', color: chalk, alpha: 0.85, seed: 1 });
    inkLine(ink, [[700, 250], [704, 196], [716, 196], [720, 250]], { width: 1.8, color: chalk, alpha: 0.8, seed: 6 });
    inkLine(ink, [[716, 200], [860, 186]], { width: 1.2, color: chalk, alpha: 0.6, seed: 7 });
    for (const bx of [880, 920, 960, 1000]) inkLine(ink, [[bx - 8, 236], [bx, 241], [bx + 8, 236]], { width: 1.5, color: chalk, alpha: 0.75, seed: bx });
  }
  // desks in rows
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 4; k++) {
      const w = 150 - row * 8, x = 400 + k * 210 - row * 40 + row * 28, y = 380 + row * 68;
      const top = [[x - w / 2, y], [x + w / 2, y], [x + w / 2 + 12, y + 18], [x - w / 2 - 12, y + 18]];
      wash(c, top, col('#8A6A4A'), { alpha: 0.95, passes: 1, amp: 1, seed: row * 10 + k });
      inkLine(ink, [...top, top[0]], { width: 1, alpha: 0.7, seed: row * 10 + k + 50 });
      inkLine(ink, [[x - w / 2, y + 18], [x - w / 2, y + 60]], { width: 2, alpha: 0.6, seed: k });
      inkLine(ink, [[x + w / 2, y + 18], [x + w / 2, y + 60]], { width: 2, alpha: 0.6, seed: k + 1 });
      // dry inkwell
      c.fillStyle = col('#E8E2D2'); c.beginPath(); c.arc(x + w / 2 - 18, y + 8, 4, 0, Math.PI * 2); c.fill();
    }
  }
}

function rain(C, col) {
  const { ink } = C;
  const r = rng(77);
  for (let i = 0; i < 160; i++) {
    const x = ART.x0 + r() * (ART.x1 - ART.x0), y = ART.y0 + r() * (ART.y1 - ART.y0);
    inkLine(ink, [[x, y], [x - 4, y + 16 + r() * 10]], { width: 0.7, color: '#6E7E9A', alpha: 0.3, seed: i, breaks: 0 });
  }
}

function lightFor(L, kind, n, t) {
  const light = L.light;
  if (kind === 'lamp') glow(light, 800, 310, 240, '#F2B860', 0.45 + 0.04 * Math.sin(t * 1.3));
  else if (kind === 'pub') glow(light, 620, 470, 220, '#F09040', 0.5 + 0.08 * Math.sin(t * 5) * Math.sin(t * 1.7));
  else if (kind === 'arrival') { glow(light, 1140, 220, 60, '#F6CF7A', 0.5); glow(light, 360, 300, 300, '#F6C88A', 0.2); }
  else if (kind === 'shop') glow(light, 470, 230, 260, '#F4E2B8', 0.18);
  else if (kind === 'cottages') glow(light, 980, 210, 220, '#D8DEE6', 0.12);
  else if (kind === 'school') glow(light, 1300, 200, 300, '#E8E4D8', 0.1);
}
