// The hand-inked chart of the bay on the logbook's right page. Same world coordinates as the night view.
import {
  wash, inkLine, hatch, rng, noise1, rgba, wobble, trace, glow, PAL, smooth,
} from '../paint.js';
import { letter } from '../hand.js';
import {
  LAND, PIERS, STACKS, REEFS, reefActive, HARBOUR, MAGMELL, LIGHTHOUSE, routePath, routeFor, clearance, obstacles,
} from '../../game/chart.js';

export const WORLD_RECT = { x0: -5, x1: 103, y0: 1.5, y1: 60.5 };

export function chartFrame(x, y, w) {
  const s = w / (WORLD_RECT.x1 - WORLD_RECT.x0);
  const h = (WORLD_RECT.y1 - WORLD_RECT.y0) * s;
  const f = {
    x0: x, y0: y, x1: x + w, y1: y + h, w, h, s,
    toPage: (wx, wy) => [x + (wx - WORLD_RECT.x0) * s, y + (wy - WORLD_RECT.y0) * s],
    toWorld: (px, py) => [WORLD_RECT.x0 + (px - x) / s, WORLD_RECT.y0 + (py - y) / s],
    inside: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h,
  };
  return f;
}

const mapPts = (f, pts) => pts.map(([a, b]) => f.toPage(a, b));

function clipFrame(c, f, pad = 0) {
  c.beginPath();
  c.rect(f.x0 - pad, f.y0 - pad, f.w + pad * 2, f.h + pad * 2);
  c.clip();
}

// Static chart: paint washes + ink linework. Drawn once per night into a cache.
export function paintChart(P, f, night, { faded = 0, magmell = false, seed = 3, drift = 0, oldInk = '#4A3426' } = {}) {
  const paint = P.paint, ink = P.ink;
  const tide = night.tide;
  const r = rng(seed);

  // ---- sea wash, paler toward the coasts ----
  paint.save();
  clipFrame(paint, f, 2);
  const sea = wobble([[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]], { amp: 2.5, freq: 0.05, seed: seed + 1, step: 14 });
  wash(paint, sea, '#9DB3C8', { alpha: 0.32, passes: 2, amp: 3, seed: seed + 2 });
  // a deeper glaze out in the open water, west
  const g = paint.createLinearGradient(f.x0, 0, f.x1, 0);
  g.addColorStop(0, rgba('#5F7EA6', 0.28)); g.addColorStop(0.45, rgba('#7E98B6', 0.1)); g.addColorStop(1, rgba('#9DB3C8', 0));
  paint.fillStyle = g; paint.fillRect(f.x0, f.y0, f.w, f.h);
  paint.restore();

  // ---- land ----
  paint.save();
  clipFrame(paint, f, 1);
  for (const key of ['north', 'south']) {
    const pts = mapPts(f, LAND[key]);
    wash(paint, wobble(pts, { amp: 2.2, freq: 0.06, seed: seed + 5, step: 6 }), '#D8C59C', { alpha: 0.75, passes: 2, amp: 2, seed: seed + 6 });
    // a little green on the tops
    paint.save();
    trace(paint, pts); paint.clip();
    for (let i = 0; i < 26; i++) {
      const px = f.x0 + r() * f.w, py = key === 'north' ? f.y0 + r() * f.h * 0.22 : f.y0 + f.h * (0.78 + r() * 0.22);
      paint.fillStyle = rgba(i % 3 ? '#9AAE78' : '#B9A26E', 0.18);
      paint.beginPath(); paint.ellipse(px, py, 20 + r() * 50, 6 + r() * 10, (r() - 0.5) * 0.3, 0, Math.PI * 2); paint.fill();
    }
    paint.restore();
  }
  paint.restore();

  ink.save();
  clipFrame(ink, f, 0);
  // coastlines with inland hatching ticks
  for (const key of ['north', 'south']) {
    const poly = LAND[key];
    const pts = mapPts(f, poly);
    inkLine(ink, wobble(pts, { amp: 0.9, freq: 0.08, seed: seed + 9, step: 4, closed: true }), { width: 1.5, alpha: 0.82, seed: seed + 10, breaks: 0.015 });
    // ticks
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L > 30) continue;
      const n = Math.ceil(L / 0.8);
      for (let k = 0; k < n; k++) {
        const t = (k + r() * 0.5) / n;
        const wx = a[0] + (b[0] - a[0]) * t, wy = a[1] + (b[1] - a[1]) * t;
        let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        // point inland
        const probe = [wx + nx * 0.6, wy + ny * 0.6];
        if (!inside(probe, poly)) { nx = -nx; ny = -ny; }
        const [px, py] = f.toPage(wx, wy);
        const len = (3 + r() * 5);
        ink.strokeStyle = rgba(PAL.ink, 0.35 + r() * 0.25);
        ink.lineWidth = 0.8;
        ink.beginPath(); ink.moveTo(px + nx * 1.5, py + ny * 1.5); ink.lineTo(px + nx * (1.5 + len), py + ny * (1.5 + len)); ink.stroke();
      }
    }
  }

  // piers & harbour
  const harbourA = magmell ? 0.25 : 1;
  for (const pier of PIERS) {
    const pts = mapPts(f, pier);
    paint.save(); paint.globalAlpha = harbourA;
    wash(paint, pts, '#B7A88E', { alpha: 0.9, passes: 1, amp: 0.5, seed: seed + 12 });
    paint.restore();
    inkLine(ink, [...pts, pts[0]], { width: 1.1, alpha: 0.75 * harbourA, seed: seed + 13 });
  }

  // sea stacks
  for (const s of STACKS) {
    const pts = mapPts(f, s.poly);
    paint.save(); wash(paint, pts, '#6E6258', { alpha: 0.8, passes: 2, amp: 0.8, seed: seed + 15 }); paint.restore();
    inkLine(ink, [...pts, pts[0]], { width: 1.2, alpha: 0.85, seed: seed + 16 });
  }

  // reefs
  const reefIds = new Set(night.reefs || []);
  for (const id of Object.keys(REEFS)) {
    if (!reefIds.has(id)) continue;
    const reef = REEFS[id];
    const on = reefActive(reef, tide);
    const pts = mapPts(f, reef.poly);
    const rs = rng(seed + id.length * 13 + id.charCodeAt(0));
    if (reef.tide === 'always') {
      wash(paint, pts, '#8E8170', { alpha: 0.5, passes: 2, amp: 1, seed: seed + 20 });
      hatch(ink, pts, { spacing: 3.4, angle: -0.8, width: 0.7, alpha: 0.55, seed: seed + 21 });
      inkLine(ink, [...pts, pts[0]], { width: 1.1, alpha: 0.8, seed: seed + 22, breaks: 0.05 });
    } else {
      // tidal ground: dotted (dries at low water) or dashed (covers at high water)
      const strong = on ? 1 : 0.4;
      wash(paint, pts, reef.tide === 'low' ? '#C7B48E' : '#A89A84', { alpha: 0.38 * strong, passes: 2, amp: 1, seed: seed + 23 });
      if (on) hatch(ink, pts, { spacing: 5, angle: 0.7, width: 0.6, alpha: 0.35, seed: seed + 24 });
      dashed(ink, [...pts, pts[0]], reef.tide === 'low' ? [1.2, 3.6] : [5, 4], 1.0, 0.75 * strong);
    }
    // rock marks
    const cnt = Math.max(2, Math.round(pts.length / 4));
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    const mk = reef.tide === 'always' || on;
    if (mk) for (let i = 0; i < cnt; i++) {
      const a = rs() * Math.PI * 2, d = rs() * 6;
      cross(ink, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, 3.2, 0.75);
    }
    if (reef.name) {
      const right = cx > f.x1 - 90;
      letter(ink, reef.name, right ? cx - 14 : cx + 12, cy + (id === 'pan' || id === 'flats' ? 22 : -12), { hand: 'serifItalic', size: 13, alpha: 0.7 * (mk ? 1 : 0.6), align: right ? 'right' : 'left', seed: 2 });
    }
  }

  // soundings
  const obs = obstacles(night);
  const rs = rng(seed + 77);
  let placed = 0;
  for (let i = 0; i < 400 && placed < 46; i++) {
    const wx = WORLD_RECT.x0 + 3 + rs() * (WORLD_RECT.x1 - WORLD_RECT.x0 - 6);
    const wy = WORLD_RECT.y0 + 2 + rs() * (WORLD_RECT.y1 - WORLD_RECT.y0 - 4);
    const c = clearance(wx, wy, obs);
    if (c.d < 2.2) continue;
    const depth = Math.round(2 + c.d * 1.4 + noise1(wx * 0.3 + wy, 4) * 4 + (40 - Math.abs(wy - 30)) * 0.05);
    const [px, py] = f.toPage(wx, wy);
    letter(ink, String(depth), px, py, { hand: 'serifItalic', size: 11, alpha: 0.42, align: 'center', seed: i });
    placed++;
  }

  // lighthouse mark
  {
    const [px, py] = f.toPage(LIGHTHOUSE[0], LIGHTHOUSE[1]);
    ink.strokeStyle = rgba(PAL.ink, 0.85); ink.lineWidth = 1.2;
    ink.beginPath(); ink.arc(px, py, 4, 0, Math.PI * 2); ink.stroke();
    ink.fillStyle = rgba(PAL.ink, 0.9); ink.beginPath(); ink.arc(px, py, 1.6, 0, Math.PI * 2); ink.fill();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ink.beginPath(); ink.moveTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6); ink.lineTo(px + Math.cos(a) * 10, py + Math.sin(a) * 10); ink.stroke();
    }
    paint.save(); paint.fillStyle = rgba('#E6A94A', 0.35); paint.beginPath(); paint.arc(px, py, 9, 0, Math.PI * 2); paint.fill(); paint.restore();
    letter(ink, 'Ceann Bán Light', px + 14, py + 6, { hand: 'serifItalic', size: 13, alpha: 0.75 });
  }

  // place names
  {
    let [px, py] = f.toPage(80, 2.6);
    letter(ink, 'Port na Rón', px, py, { hand: 'serif', size: 15, alpha: 0.75 * (magmell ? 0.35 : 1), align: 'center' });
    [px, py] = f.toPage(46, 58.5);
    letter(ink, 'CEANN  BÁN', px, py, { hand: 'serif', size: 13, alpha: 0.6, align: 'center' });
    [px, py] = f.toPage(-3.6, 30);
    ink.save(); ink.translate(px, py); ink.rotate(-Math.PI / 2);
    letter(ink, 'the open sea', 0, 0, { hand: 'serifItalic', size: 13, alpha: 0.55, align: 'center' });
    ink.restore();
  }

  // harbour mouth
  {
    const [px, py] = f.toPage(HARBOUR[0], HARBOUR[1]);
    ink.save(); ink.globalAlpha = magmell ? 0.22 : 1;
    ink.strokeStyle = rgba('#7A2E22', 0.7); ink.lineWidth = 1.2;
    ink.beginPath(); ink.arc(px, py, 7, 0, Math.PI * 2); ink.stroke();
    ink.restore();
    if (!magmell) letter(ink, 'harbour', px, py + 22, { hand: 'serifItalic', size: 13, alpha: 0.7, align: 'center' });
  }

  // Mag Mell — a small hand-drawn island at the chart's west edge, in the old keeper's ink
  if (magmell) {
    const [px, py] = f.toPage(MAGMELL[0] + 0.6, MAGMELL[1]);
    const isl = wobble([[px - 16, py + 2], [px - 9, py - 7], [px + 2, py - 9], [px + 12, py - 4], [px + 15, py + 4], [px + 2, py + 7], [px - 10, py + 6]], { amp: 1.5, freq: 0.2, seed: 41, step: 3 });
    paint.save(); wash(paint, isl, '#E6B85A', { alpha: 0.75, passes: 2, amp: 1, seed: 42 }); paint.restore();
    inkLine(ink, [...isl, isl[0]], { width: 1.2, color: oldInk, alpha: 0.85, seed: 43, breaks: 0.04 });
  }

  // compass rose
  compass(ink, paint, f.x1 - 52, f.y1 - 58, 30);

  // frame: a double ruled border
  ink.restore();
  ink.save();
  inkLine(ink, wobble([[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]], { amp: 0.6, freq: 0.02, seed: 50, step: 20 }).concat([[f.x0, f.y0 + 0.5]]), { width: 1.6, alpha: 0.85, seed: 51, breaks: 0.005 });
  inkLine(ink, [[f.x0 - 5, f.y0 - 5], [f.x1 + 5, f.y0 - 5], [f.x1 + 5, f.y1 + 5], [f.x0 - 5, f.y1 + 5], [f.x0 - 5, f.y0 - 5]], { width: 0.7, alpha: 0.6, seed: 52, breaks: 0.01 });
  ink.restore();

  // the current
  if (night.current) {
    const c = night.current;
    for (let k = -1; k <= 1; k++) {
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const wy = c.y - c.r * 0.6 + t * c.r * 1.2;
        pts.push(f.toPage(c.x + k * 3.2 + Math.sin(t * 9 + k) * 0.5, wy));
      }
      inkLine(ink, pts, { width: 1, color: '#2D4F7A', alpha: 0.7, seed: 60 + k });
      const [ex, ey] = pts[pts.length - 1];
      ink.strokeStyle = rgba('#2D4F7A', 0.7); ink.lineWidth = 1;
      ink.beginPath(); ink.moveTo(ex - 4, ey - 6 * Math.sign(c.dy)); ink.lineTo(ex, ey); ink.lineTo(ex + 4, ey - 6 * Math.sign(c.dy)); ink.stroke();
    }
    const [lx, ly] = f.toPage(c.x + 5, c.y);
    letter(ink, 'set', lx, ly, { hand: 'serifItalic', size: 12, alpha: 0.6, color: '#2D4F7A' });
  }

  // faded all over (late nights): a thin paper glaze over the paint
  if (faded > 0) {
    paint.save(); paint.fillStyle = rgba('#F2EAD9', faded); paint.fillRect(f.x0 - 8, f.y0 - 8, f.w + 16, f.h + 16); paint.restore();
  }
}

function inside(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

export function cross(c, x, y, s, a = 0.8, color = PAL.ink) {
  c.strokeStyle = rgba(color, a); c.lineWidth = 1; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke();
}

export function dashed(c, pts, pattern, width, alpha, color = PAL.ink) {
  c.save();
  c.setLineDash(pattern);
  c.strokeStyle = rgba(color, alpha); c.lineWidth = width; c.lineCap = 'round';
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
  c.restore();
}

function compass(ink, paint, x, y, R) {
  paint.save();
  paint.fillStyle = rgba('#E8D9B5', 0.6);
  paint.beginPath(); paint.arc(x, y, R * 1.05, 0, Math.PI * 2); paint.fill();
  paint.restore();
  ink.save();
  ink.strokeStyle = rgba(PAL.ink, 0.7); ink.lineWidth = 0.8;
  ink.beginPath(); ink.arc(x, y, R, 0, Math.PI * 2); ink.stroke();
  ink.beginPath(); ink.arc(x, y, R * 0.82, 0, Math.PI * 2); ink.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const L = k % 2 ? R * 0.55 : R * 0.98, w = k % 2 ? R * 0.1 : R * 0.15;
    const tip = [x + Math.cos(a) * L, y + Math.sin(a) * L];
    const l = [x + Math.cos(a - Math.PI / 2) * w, y + Math.sin(a - Math.PI / 2) * w];
    const rr = [x + Math.cos(a + Math.PI / 2) * w, y + Math.sin(a + Math.PI / 2) * w];
    ink.fillStyle = rgba(k === 0 ? '#7A2E22' : PAL.ink, k % 2 ? 0.45 : 0.75);
    ink.beginPath(); ink.moveTo(tip[0], tip[1]); ink.lineTo(l[0], l[1]); ink.lineTo(x, y); ink.closePath(); ink.fill();
    ink.beginPath(); ink.moveTo(tip[0], tip[1]); ink.lineTo(rr[0], rr[1]); ink.lineTo(x, y); ink.closePath(); ink.stroke();
  }
  ink.restore();
  letter(ink, 'N', x, y - R - 6, { hand: 'serif', size: 15, align: 'center', alpha: 0.8 });
}

// Page-space polyline for a route (rounded corners), optionally from a particular entry.
export function routePage(f, night, wps, entry) {
  return routePath(routeFor(night, wps, entry), 0.6).map(([x, y]) => f.toPage(x, y));
}

// Pencil: grey graphite, two faint passes. Ink: inkLine with a reveal fraction.
export function drawRoute(c, pts, { style = 'pencil', progress = 1, alpha = 1, seed = 1, color = null, budgetAt = Infinity } = {}) {
  if (pts.length < 2) return;
  const n = Math.max(2, Math.floor(pts.length * Math.min(1, progress)));
  const cut = Math.min(n, budgetAt);
  const main = pts.slice(0, cut);
  if (style === 'pencil') {
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = rgba(color || '#4E4E58', (pass ? 0.35 : 0.55) * alpha);
      c.lineWidth = pass ? 2.4 : 1.3;
      c.beginPath();
      main.forEach(([x, y], i) => {
        const jx = (noise1(i * 0.31, seed + pass * 7) - 0.5) * 1.6, jy = (noise1(i * 0.27, seed + 3 + pass * 7) - 0.5) * 1.6;
        if (i === 0) c.moveTo(x + jx, y + jy); else c.lineTo(x + jx, y + jy);
      });
      c.stroke();
    }
    if (cut < n) {
      // beyond the ink budget: a faint dotted line
      c.setLineDash([2, 6]);
      c.strokeStyle = rgba('#7A2E22', 0.5 * alpha); c.lineWidth = 1.4;
      c.beginPath();
      pts.slice(cut - 1, n).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    }
    c.restore();
  } else {
    inkLine(c, main, { width: style === 'old' ? 1.9 : 2.3, color: color || (style === 'old' ? '#4A3426' : '#1E2638'), alpha: 0.92 * alpha, seed, breaks: style === 'ghost' ? 0.08 : 0.02, vary: 0.6, jitter: style === 'ghost' ? 1.4 : 0.5 });
    // a few arrowheads along the line
    const step = 40;
    for (let i = step; i < main.length - 5; i += step) {
      const [x0, y0] = main[i - 2], [x1, y1] = main[i];
      const a = Math.atan2(y1 - y0, x1 - x0);
      c.strokeStyle = rgba(color || (style === 'old' ? '#4A3426' : '#1E2638'), 0.8 * alpha);
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(x1 + Math.cos(a + 2.6) * 7, y1 + Math.sin(a + 2.6) * 7);
      c.lineTo(x1, y1);
      c.lineTo(x1 + Math.cos(a - 2.6) * 7, y1 + Math.sin(a - 2.6) * 7);
      c.stroke();
    }
  }
}

// A small boat glyph for the ship list / size key.
export function boatGlyph(c, x, y, size, alpha = 0.85, color = PAL.ink) {
  const k = size === 'large' ? 1.35 : size === 'medium' ? 1.0 : 0.72;
  c.save();
  c.translate(x, y); c.scale(k, k);
  c.strokeStyle = rgba(color, alpha); c.fillStyle = rgba(color, alpha * 0.18);
  c.lineWidth = 1.3 / k; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-14, -2); c.quadraticCurveTo(0, 9, 14, -2); c.lineTo(9, -2); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(0, -2); c.lineTo(0, -20); c.stroke();
  c.beginPath(); c.moveTo(1, -19); c.quadraticCurveTo(9, -10, 1, -4); c.stroke();
  c.restore();
}

export function glowAt(light, x, y, r, color, k) { glow(light, x, y, r, color, k); }
export { smooth };
