// The day choice: a painted map of the headland and the village. Pick one place to spend the afternoon.
import {
  rng, rgba, wash, wobble, glazes, waveMarks, blob, inkLine, inkOutline, glow, mixHex, smooth, clamp, noise1, trace, hatch,
} from '../paint.js';
import { letter, measure } from '../hand.js';
import { LAND, STACKS, REEFS, PIERS, LIGHTHOUSE } from '../../game/chart.js';
import { PLACES, MAP_WORDS } from '../../data/story-village.js';

const MAPW = { x0: -6, x1: 104, y0: -12, y1: 63 };
const SAFE = { w: 1600, h: 1000 };

// Where each place sits on the map (world coordinates).
const SITES = {
  lighthouse: [12.5, 53.6],
  cliff: [40, 59.6],
  village: [80, 1.2],
  harbour: [90.5, 8.6],
  cottages: [62, -5.5],
  school: [92, -6.5],
};

export class HeadlandMapScene {
  constructor(game) { this.game = game; this.safe = SAFE; }

  enter() {
    this.t = 0;
    this.chosen = null;
    this.n = this.game.night;
  }

  look() {
    const n = this.n;
    return { ...n.look, fog: n.haar * 0.35, fogColor: [0.86, 0.87, 0.86], wobble: 3, warmth: (n.look.warmth ?? 0.5) - 0.05 };
  }

  frame() {
    const s = Math.min(1380 / (MAPW.x1 - MAPW.x0), 800 / (MAPW.y1 - MAPW.y0));
    const ox = 800 - ((MAPW.x1 - MAPW.x0) * s) / 2, oy = 158;
    return { s, to: (x, y) => [ox + (x - MAPW.x0) * s, oy + (y - MAPW.y0) * s] };
  }

  paintRect() { return { x0: 70, y0: 30, x1: 1530, y1: 975 }; }

  update(dt) {
    this.t += dt;
    const g = this.game;
    if (g.autoplay && !this.chosen && this.t > 0.6) this.choose(this.n.day.focus || this.n.day.places[0]);
  }

  choose(place) {
    if (this.chosen) return;
    this.chosen = place;
    this.game.audio?.pencil(1);
    this.game.visit(place);
  }

  draw(L) {
    const n = this.n;
    const cache = L.cache('map|' + n.id, (C) => this.paintStatic(C));
    L.blit(cache);
    const ink = L.ink, t = this.t;
    const F = this.frame();
    letter(ink, MAP_WORDS.heading, 800, 92, { hand: 'serifItalic', size: 44, align: 'center', alpha: 0.85 * smooth(0, 1, t) });
    if (n.date) letter(ink, n.date, 800, 132, { hand: 'keeper', size: 30, align: 'center', alpha: 0.6 * smooth(0.3, 1.3, t), drift: n.drift });

    const avail = new Set(n.day.places);
    Object.keys(SITES).forEach((key, i) => {
      if (!avail.has(key) && (key === 'cottages' || key === 'school') && n.act < 3) return;
      const [px, py] = F.to(...SITES[key]);
      const on = avail.has(key);
      const pl = PLACES[key];
      const right = px < 1100;
      const lx = right ? px + 30 : px - 30;
      const ly = key === 'cliff' ? py - 64 : key === 'lighthouse' ? py - 70 : py + 8;
      const w = measure(ink, pl.label, 'keeper', 46);
      const bx = right ? lx : lx - w;
      const hov = on && this.game.input.button({ id: 'place-' + key, x: Math.min(bx, px) - 20, y: Math.min(ly - 40, py - 30), w: Math.abs(lx - px) + w + 40, h: Math.max(70, Math.abs(ly - py) + 70), onClick: () => this.choose(key) });
      const a = smooth(0.5 + i * 0.15, 1.2 + i * 0.15, t) * (on ? (hov ? 1 : 0.85) : 0.3);
      letter(ink, pl.label, lx, ly, { hand: 'keeper', size: 46, color: '#1A1E2A', align: right ? 'left' : 'right', alpha: a, drift: n.drift * 0.5, seed: i });
      letter(ink, pl.sub, lx, ly + 32, { hand: 'pencil', size: 27, align: right ? 'left' : 'right', alpha: a * 0.8, color: '#2E2E36', seed: i });
      // a pencil leader from label to place
      inkLine(ink, [[right ? lx - 6 : lx + 6, ly - 10], [px + (right ? 8 : -8), py - 4]], { width: 1, color: '#5A5A62', alpha: a * 0.5, seed: i + 3, breaks: 0 });
      if (on) {
        const pulse = key === n.day.focus ? 0.25 + 0.15 * Math.sin(t * 2 + i) : 0;
        ink.strokeStyle = rgba('#3A3A44', (0.45 + pulse) * a); ink.lineWidth = hov ? 2 : 1.3;
        ink.beginPath(); ink.ellipse(px, py, hov ? 22 : 17, hov ? 17 : 13, 0.1, 0, Math.PI * 2); ink.stroke();
        if (hov) inkLine(ink, [[bx, ly + 36], [bx + w, ly + 34]], { width: 1.4, alpha: 0.6, seed: 2 });
      }
    });
    // the lamp, always lit a little in the corner of the eye
    const [lx, ly] = F.to(...LIGHTHOUSE);
    glow(L.light, lx, ly - 22, 40, '#E6A94A', 0.3);
    letter(ink, MAP_WORDS.then, 800, 958, { hand: 'serifItalic', size: 24, align: 'center', alpha: 0.5 * smooth(1.5, 2.5, t) });
  }

  paintStatic(C) {
    const { paint: c, ink, mask } = C;
    const n = this.n;
    const cool = n.look.cool || 0;
    const col = (h) => mixHex(h, '#8C9098', cool * 0.4);
    const F = this.frame();
    const r = rng(17);
    const map = (pts) => pts.map(([x, y]) => F.to(x, y));
    const frame = [[MAPW.x0, MAPW.y0], [MAPW.x1, MAPW.y0], [MAPW.x1, MAPW.y1], [MAPW.x0, MAPW.y1]];
    const fr = map(frame);
    const [x0, y0] = fr[0], [x1, y1] = fr[2];
    // the painting dissolves into the paper at its edges
    const inset = 26;
    const vig = wobble([[x0 + inset, y0 + inset * 1.6], [x0 + inset * 2.4, y0 + inset], [x1 - inset * 2, y0 + inset * 0.6], [x1 - inset, y0 + inset * 2], [x1 - inset * 0.6, y1 - inset * 2.2], [x1 - inset * 2.6, y1 - inset], [x0 + inset * 2, y1 - inset * 0.7], [x0 + inset * 0.7, y1 - inset * 2.4]], { amp: 16, freq: 0.012, seed: 33, step: 10 });
    for (const cx of [c, ink, mask]) { cx.save(); trace(cx, vig); cx.clip(); }
    // sea: pale in the shallows, deep in the middle of the bay
    const seaPts = wobble(fr, { amp: 10, freq: 0.01, seed: 3, step: 20 });
    wash(c, seaPts, col('#8FAACB'), { alpha: 0.9, passes: 3, amp: 8, seed: 4 });
    const mid = F.to(44, 30);
    const rg = c.createRadialGradient(mid[0], mid[1], 20, mid[0], mid[1], (x1 - x0) * 0.55);
    rg.addColorStop(0, rgba(col('#2F4E84'), 0.75)); rg.addColorStop(0.6, rgba(col('#3B5B8C'), 0.45)); rg.addColorStop(1, rgba(col('#5B7DAA'), 0));
    c.fillStyle = rg; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    const west = c.createLinearGradient(x0, 0, x0 + 260, 0);
    west.addColorStop(0, rgba(col('#2A4272'), 0.6)); west.addColorStop(1, rgba(col('#2A4272'), 0));
    c.fillStyle = west; c.fillRect(x0, y0, 260, y1 - y0);
    glazes(c, x0, x1, y0, y1, [col('#3B5B8C'), col('#9DB3C8'), col('#4A6C9C'), col('#26406E')], { count: 70, alpha: [0.08, 0.22], w: [60, 280], h: [4, 12], seed: 5 });
    waveMarks(ink, x0 + 20, x1 - 20, y0 + 20, y1 - 20, { count: 60, color: col('#2A4370'), alpha: 0.3, seed: 6, size: [8, 16] });
    mask.fillStyle = 'rgb(160,0,0)'; trace(mask, seaPts); mask.fill();

    // land
    for (const key of ['north', 'south']) {
      const pts = wobble(map(LAND[key]), { amp: 3, freq: 0.05, seed: key.length, step: 6 });
      c.save(); trace(c, seaPts); c.clip();
      wash(c, pts, col('#7E9A58'), { alpha: 0.95, passes: 3, amp: 3, seed: 8 });
      // fields and heather
      c.save(); trace(c, pts); c.clip();
      glazes(c, x0, x1, y0, y1, [col('#6B8E4E'), col('#9AAE6A'), col('#8C7A5A'), col('#A38A9A')], { count: 70, alpha: [0.08, 0.22], w: [40, 160], h: [10, 40], seed: 9 + key.length, round: 0.9 });
      for (let i = 0; i < 120; i++) blob(c, x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 3 + r() * 6, 2 + r() * 4, i % 3 ? col('#C9A63A') : col('#8E6A86'), 0.35, i);
      c.restore();
      c.restore();
      // cliff edge in sienna and a hard ink coast
      c.save(); trace(c, seaPts); c.clip();
      c.strokeStyle = rgba(col('#A85F3A'), 0.6); c.lineWidth = 10; c.lineJoin = 'round';
      trace(c, pts); c.stroke();
      c.strokeStyle = rgba(col('#F4EFE4'), 0.35); c.lineWidth = 2.5;
      trace(c, pts.map(([x, y]) => [x, y + 5])); c.stroke();
      c.restore();
      ink.save(); trace(ink, seaPts); ink.clip();
      inkLine(ink, [...pts, pts[0]], { width: 1.5, alpha: 0.75, seed: 12 });
      ink.restore();
      mask.fillStyle = 'rgb(0,0,60)'; trace(mask, pts); mask.fill();
    }
    // stone walls
    for (let i = 0; i < 14; i++) {
      const sx = 4 + r() * 92, sy = r() < 0.5 ? -10 + r() * 12 : 55 + r() * 7;
      const pts = [[sx, sy], [sx + 6 + r() * 10, sy + (r() - 0.5) * 4]];
      inkLine(ink, map(pts), { width: 1, alpha: 0.4, seed: i, breaks: 0.15 });
    }
    // stacks and the always-reefs
    for (const s of STACKS) wash(c, map(s.poly), col('#6E5E56'), { alpha: 0.9, passes: 2, amp: 1, seed: 20 });
    for (const id of ['black', 'sisterA', 'sisterB', 'gull', 'lip', 'tooth']) {
      const pts = map(REEFS[id].poly);
      wash(c, pts, col('#6F6A62'), { alpha: 0.35, passes: 2, amp: 1.5, seed: 21 });
      ink.strokeStyle = rgba('#F4EFE4', 0.5); ink.lineWidth = 1.2;
      trace(ink, pts); ink.stroke();
    }
    // piers
    for (const p of PIERS) { const pts = map(p); wash(c, pts, '#B5A890', { alpha: 1, passes: 1, amp: 0.5, seed: 22 }); inkLine(ink, [...pts, pts[0]], { width: 1, alpha: 0.7, seed: 23 }); }

    // the road: from the lighthouse round the head of the bay to the village, and up the back road
    const road = [[14, 55], [26, 58.5], [44, 60.5], [62, 60.2], [80, 59.6], [96, 57.5], [102, 50], [102.5, 30], [101, 18], [97, 8], [92, 2.5], [84, 0.4], [74, -1.5], [64, -4.5]];
    const rp = map(road);
    c.save(); c.setLineDash([]); c.strokeStyle = rgba('#C8B48C', 0.8); c.lineWidth = 6; c.lineCap = 'round';
    trace(c, rp, false); c.stroke(); c.restore();
    ink.save(); ink.setLineDash([3, 7]); ink.strokeStyle = rgba('#3A3028', 0.55); ink.lineWidth = 1.3; trace(ink, rp, false); ink.stroke(); ink.restore();
    const lane = map([[92, 2.5], [92.5, -3], [92, -6.5]]);
    ink.save(); ink.setLineDash([3, 7]); ink.strokeStyle = rgba('#3A3028', 0.45); ink.lineWidth = 1.2; trace(ink, lane, false); ink.stroke(); ink.restore();

    // the village: cottages along the harbour road
    const houses = [[74, -0.6], [77, 0.2], [80, 0.6], [83, 1.0], [86, 1.6], [70, -2.5], [66, -4], [62, -5.2], [58, -6.4], [89, -5.2], [94, -7.5], [96, -4.5]];
    houses.forEach(([hx, hy], i) => {
      const [px, py] = F.to(hx, hy);
      const dark = n.act >= 3 && i >= 5 && i <= 8;
      house(c, ink, px, py, 1 + (i % 3) * 0.12, col(dark ? '#D8D2C4' : '#F2EBDD'), col('#4E4A5A'), i);
    });
    // schoolhouse with a little bell-cote, the church beside it
    { const [px, py] = F.to(...SITES.school); house(c, ink, px, py, 1.6, col('#EDE5D6'), col('#5A4E4A'), 40, true); }
    { const [px, py] = F.to(96.5, -9.5); house(c, ink, px, py, 1.3, col('#D9D2C4'), col('#4A4652'), 41, true); }
    // chimney smoke in acts 1–2
    if (n.act <= 2) {
      houses.slice(0, 5).forEach(([hx, hy], i) => {
        if (i % 2) return;
        const [px, py] = F.to(hx, hy);
        for (let k = 0; k < 5; k++) blob(c, px + 4 + k * 5 + noise1(k + i, 3) * 6, py - 22 - k * 9, 5 + k * 2, 4 + k, '#E8E4DC', 0.35 - k * 0.05, k + i);
      });
    }
    // the lighthouse
    {
      const [px, py] = F.to(...LIGHTHOUSE);
      const tower = [[px - 6, py], [px - 4.5, py - 34], [px + 4.5, py - 34], [px + 6, py]];
      wash(c, tower, '#F4EFE6', { alpha: 1, passes: 1, amp: 0.4, seed: 30 });
      inkLine(ink, [...tower, tower[0]], { width: 1.2, alpha: 0.85, seed: 31 });
      ink.fillStyle = rgba('#2B2622', 0.85); ink.fillRect(px - 5, py - 42, 10, 8);
      c.fillStyle = '#E6A94A'; c.fillRect(px - 3.5, py - 41, 7, 6);
      house(c, ink, px + 14, py + 2, 0.9, '#F2EBDD', '#4E4A5A', 50);
    }
    // sheep
    for (let i = 0; i < 16; i++) {
      const wx = 8 + r() * 50, wy = 55.5 + r() * 6;
      const [px, py] = F.to(wx, wy);
      blob(c, px, py, 4, 3, '#F4F0E6', 0.95, i);
    }
    // a compass and a scale bar, as on any map
    const [cx, cy] = [1450, 860];
    ink.strokeStyle = rgba('#2B2622', 0.6); ink.lineWidth = 1;
    ink.beginPath(); ink.moveTo(cx, cy + 30); ink.lineTo(cx, cy - 30); ink.moveTo(cx - 6, cy - 20); ink.lineTo(cx, cy - 30); ink.lineTo(cx + 6, cy - 20); ink.stroke();
    letter(ink, 'N', cx, cy - 38, { hand: 'serif', size: 18, align: 'center', alpha: 0.7 });
    for (const cx of [c, ink, mask]) cx.restore();
    // a few loose blooms past the edge, so it reads as painted rather than cut
    for (let i = 0; i < 14; i++) {
      const p = vig[Math.floor(r() * vig.length)];
      blob(c, p[0], p[1], 16 + r() * 30, 10 + r() * 18, col(['#8FAACB', '#9AAE6A', '#C9B58E'][i % 3]), 0.16, i);
    }
  }
}

function house(c, ink, x, y, k, wall, roof, seed, bell = false) {
  const w = 14 * k, h = 9 * k;
  const body = [[x - w / 2, y], [x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2, y]];
  wash(c, body, wall, { alpha: 1, passes: 1, amp: 0.4, seed });
  const rf = [[x - w / 2 - 2, y - h], [x - w / 2 + 2, y - h - 7 * k], [x + w / 2 - 2, y - h - 7 * k], [x + w / 2 + 2, y - h]];
  wash(c, rf, roof, { alpha: 0.95, passes: 1, amp: 0.4, seed: seed + 1 });
  inkLine(ink, [...body, body[0]], { width: 0.9, alpha: 0.7, seed: seed + 2 });
  if (bell) {
    ink.strokeStyle = rgba('#2B2622', 0.7); ink.lineWidth = 1;
    ink.beginPath(); ink.moveTo(x, y - h - 7 * k); ink.lineTo(x, y - h - 13 * k); ink.stroke();
    ink.beginPath(); ink.arc(x, y - h - 10 * k, 2, 0, Math.PI * 2); ink.stroke();
  }
}
