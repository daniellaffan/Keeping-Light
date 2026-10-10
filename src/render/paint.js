// Canvas2D painting helpers: noise, wobbly shapes, washes, ink strokes, glows.
// Everything here is deterministic given a seed, so cached layers repaint identically.

export const PAL = {
  paper: '#F2EAD9', ink: '#2B2622', ultramarine: '#3B5B8C', payne: '#4A5563', indigo: '#2A3150',
  sap: '#6B8E4E', sienna: '#A85F3A', rose: '#D98C8C', gold: '#E6A94A', whitewash: '#ECE6DA',
  sepia: '#5A4636', umber: '#7A5A3E', ochre: '#C9A15A', cerulean: '#6E93B5', violet: '#7D6A8E',
  heather: '#9C7290', gorse: '#D8B23E', moss: '#5F7445', slate: '#6D7480', blueblack: '#23293A',
};

// ---------- random + noise ----------
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function h1(i, s) {
  let x = Math.imul((i | 0) ^ Math.imul(s | 0, 0x27d4eb2d), 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function h2(i, j, s) { return h1(i * 374761393 + j * 668265263, s); }
const sm = (t) => t * t * (3 - 2 * t);
export function noise1(x, s = 0) {
  const i = Math.floor(x), f = x - i;
  return h1(i, s) + (h1(i + 1, s) - h1(i, s)) * sm(f);
}
export function noise2(x, y, s = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
  const a = h2(i, j, s), b = h2(i + 1, j, s), c = h2(i, j + 1, s), d = h2(i + 1, j + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm1(x, s = 0, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { v += a * noise1(x * f, s + o * 17); f *= 2.1; a *= 0.5; }
  return v / (1 - Math.pow(0.5, oct));
}
export function fbm2(x, y, s = 0, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { v += a * noise2(x * f, y * f, s + o * 31); f *= 2.03; a *= 0.5; }
  return v / (1 - Math.pow(0.5, oct));
}

// ---------- colour ----------
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function shade(hex, k) { return k >= 0 ? mixHex(hex, '#ffffff', k) : mixHex(hex, '#000000', -k); }

// ---------- geometry ----------
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Subdivide a polyline/polygon and push its points along their normals with noise.
export function wobble(points, { amp = 3, freq = 0.04, seed = 1, closed = true, step = 8 } = {}) {
  const out = [];
  const n = points.length;
  const segs = closed ? n : n - 1;
  let dist = 0;
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.max(1, Math.ceil(len / step));
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const d = dist + len * t;
      const w = (fbm1(d * freq, seed, 3) - 0.5) * 2 * amp;
      out.push([x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w]);
    }
    dist += len;
  }
  if (!closed) {
    const [x, y] = points[n - 1];
    out.push([x, y]);
  }
  return out;
}

export function trace(ctx, pts, closed = true) {
  ctx.beginPath();
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}

export function ellipsePts(cx, cy, rx, ry, n = 28, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

// Smooth Catmull-Rom through points (open), returns dense polyline.
export function spline(pts, perSeg = 10) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------- soft filters (wet-in-wet) ----------
let FILTER_OK = null;
export function filterSupported(ctx) {
  if (FILTER_OK === null) {
    try { ctx.filter = 'blur(2px)'; FILTER_OK = ctx.filter === 'blur(2px)'; ctx.filter = 'none'; } catch { FILTER_OK = false; }
  }
  return FILTER_OK;
}
export function withBlur(ctx, px, fn) {
  if (px > 0 && filterSupported(ctx)) {
    const k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
    ctx.save(); ctx.filter = `blur(${(px * k).toFixed(1)}px)`; fn(); ctx.restore();
  } else fn();
}

// ---------- washes ----------
// A watercolour wash: several slightly different wobbly passes of the same shape.
export function wash(ctx, pts, color, { alpha = 0.9, passes = 3, amp = 4, freq = 0.03, seed = 1, blur = 0, step = 8 } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  withBlur(ctx, blur, () => {
    for (let p = 0; p < passes; p++) {
      const w = wobble(pts, { amp: amp * (1 + p * 0.35), freq, seed: seed + p * 101, closed: true, step });
      ctx.globalAlpha = p === 0 ? alpha : alpha * 0.22;
      trace(ctx, w, true);
      ctx.fill();
    }
  });
  ctx.restore();
}

// Gradient-filled wobbly shape. stops: [[t, color], ...] along (x0,y0)->(x1,y1)
export function gradWash(ctx, pts, x0, y0, x1, y1, stops, opts = {}) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  wash(ctx, pts, g, opts);
}

// Soft round blob (cloud puff, sheep, smoke)
export function blob(ctx, x, y, rx, ry, color, alpha = 1, seed = 1, amp = 0.18) {
  const pts = ellipsePts(x, y, rx, ry, 22);
  const w = wobble(pts, { amp: Math.min(rx, ry) * amp, freq: 0.12 / Math.max(1, Math.min(rx, ry) / 10), seed, step: Math.max(2, rx / 6) });
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; trace(ctx, w); ctx.fill(); ctx.restore();
}

// Horizontal streaky strokes, like a loaded brush dragged across wet paper.
export function streaks(ctx, x0, x1, y0, y1, color, { count = 12, alpha = 0.15, thick = [3, 10], seed = 1, blur = 2, len = [0.2, 0.6] } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.fillStyle = color;
  withBlur(ctx, blur, () => {
    for (let i = 0; i < count; i++) {
      const y = lerp(y0, y1, r());
      const L = (x1 - x0) * lerp(len[0], len[1], r());
      const x = lerp(x0 - L * 0.3, x1 - L * 0.7, r());
      const t = lerp(thick[0], thick[1], r());
      const pts = [];
      const n = 16;
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const th = Math.sin(u * Math.PI) * t * (0.6 + 0.4 * noise1(u * 4, seed + i));
        pts.push([x + u * L, y - th + (noise1(u * 3, seed + i * 7) - 0.5) * t]);
      }
      for (let k = n; k >= 0; k--) {
        const u = k / n;
        const th = Math.sin(u * Math.PI) * t * (0.6 + 0.4 * noise1(u * 4 + 9, seed + i));
        pts.push([x + u * L, y + th * 0.5 + (noise1(u * 3, seed + i * 7) - 0.5) * t]);
      }
      ctx.globalAlpha = alpha * (0.5 + r() * 0.8);
      trace(ctx, pts); ctx.fill();
    }
  });
  ctx.restore();
}

// Hard-edged translucent glazes: the overlapping strokes that make watercolour read as watercolour.
// Strokes are confined to `clip` (a polygon) if given, and spread over the rect [x0,x1]×[y0,y1].
export function glazes(ctx, x0, x1, y0, y1, colors, { count = 20, alpha = [0.08, 0.2], w = [40, 200], h = [4, 14], seed = 1, clip = null, tilt = 0.02, round = 0.5, yBias = 1 } = {}) {
  const r = rng(seed);
  ctx.save();
  if (clip) { trace(ctx, clip); ctx.clip(); }
  for (let i = 0; i < count; i++) {
    const cw = lerp(w[0], w[1], r()), ch = lerp(h[0], h[1], r());
    const cx = lerp(x0, x1, r()), cy = lerp(y0, y1, Math.pow(r(), yBias));
    const pts = [];
    const n = 14;
    const sd = seed * 100 + i;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const th = Math.pow(Math.sin(u * Math.PI), round) * ch * (0.6 + 0.5 * noise1(u * 3, sd));
      pts.push([cx - cw / 2 + u * cw, cy - th + (u - 0.5) * cw * tilt]);
    }
    for (let k = n; k >= 0; k--) {
      const u = k / n;
      const th = Math.pow(Math.sin(u * Math.PI), round) * ch * (0.5 + 0.5 * noise1(u * 3 + 7, sd));
      pts.push([cx - cw / 2 + u * cw, cy + th * 0.6 + (u - 0.5) * cw * tilt]);
    }
    ctx.globalAlpha = lerp(alpha[0], alpha[1], r());
    ctx.fillStyle = colors[i % colors.length];
    trace(ctx, wobble(pts, { amp: ch * 0.12, freq: 0.08, seed: sd, closed: true, step: Math.max(3, cw / 14) }));
    ctx.fill();
  }
  ctx.restore();
}

// Short curling wave marks, after the clean lines of woodblock prints.
export function waveMarks(ctx, x0, x1, y0, y1, { count = 20, color = '#22304E', alpha = 0.4, seed = 3, size = [6, 16], width = 0.8, perspective = null } = {}) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = lerp(x0, x1, r()), y = lerp(y0, y1, Math.pow(r(), 0.7));
    const k = perspective ? perspective(y) : 1;
    const s = lerp(size[0], size[1], r()) * k;
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      pts.push([x + u * s * 2, y - Math.sin(u * Math.PI) * s * 0.35 + (u > 0.75 ? (u - 0.75) * s * 0.9 : 0)]);
    }
    inkLine(ctx, pts, { width: width * Math.max(0.5, k), color, alpha: alpha * (0.6 + 0.4 * r()), seed: i + seed, breaks: 0, vary: 0.7 });
  }
}

// ---------- ink ----------
// A pen line with pressure variation and the odd break.
export function inkLine(ctx, pts, { width = 1.6, color = PAL.ink, alpha = 0.9, seed = 1, breaks = 0.04, vary = 0.5, jitter = 0.6 } = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let d = 0;
  const r = rng(seed);
  let broken = false;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (breaks > 0 && r() < breaks * Math.min(1, len / 10)) broken = !broken;
    if (broken && r() < 0.5) broken = false;
    d += len;
    if (broken) continue;
    const w = width * (1 - vary * 0.5 + vary * fbm1(d * 0.04, seed, 2));
    ctx.lineWidth = Math.max(0.3, w);
    ctx.globalAlpha = alpha * (0.75 + 0.25 * noise1(d * 0.05, seed + 3));
    const jx = (noise1(d * 0.2, seed + 5) - 0.5) * jitter, jy = (noise1(d * 0.2, seed + 9) - 0.5) * jitter;
    ctx.beginPath();
    ctx.moveTo(x0 + jx, y0 + jy);
    ctx.lineTo(x1 + jx, y1 + jy);
    ctx.stroke();
  }
  ctx.restore();
}

// Ink outline of a polygon (wobbled), optional
export function inkOutline(ctx, pts, opts = {}) {
  const w = wobble(pts, { amp: opts.amp ?? 1.2, freq: 0.08, seed: opts.seed ?? 3, closed: true, step: 5 });
  w.push(w[0]);
  inkLine(ctx, w, opts);
}

// Hatching clipped to a polygon.
export function hatch(ctx, poly, { spacing = 5, angle = -0.8, width = 0.8, color = PAL.ink, alpha = 0.6, seed = 7, wob = 1 } = {}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  ctx.save();
  trace(ctx, poly); ctx.clip();
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, R = Math.hypot(maxX - minX, maxY - minY) / 2 + 4;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const r = rng(seed);
  for (let s = -R; s <= R; s += spacing) {
    const o = s + (r() - 0.5) * spacing * 0.4;
    const a = [cx + ca * -R - sa * o, cy + sa * -R + ca * o];
    const b = [cx + ca * R - sa * o, cy + sa * R + ca * o];
    inkLine(ctx, wobble([a, b], { amp: wob, freq: 0.1, seed: seed + s, closed: false, step: 6 }), { width, color, alpha, seed: seed + s * 3, breaks: 0.05, vary: 0.6 });
  }
  ctx.restore();
}

// ---------- light (draw on the light layer, black background, additive) ----------
export function glow(ctx, x, y, r, color, intensity = 1) {
  const [R, G, B] = hexToRgb(color);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${R},${G},${B},${0.9 * intensity})`);
  g.addColorStop(0.18, `rgba(${R},${G},${B},${0.45 * intensity})`);
  g.addColorStop(0.5, `rgba(${R},${G},${B},${0.12 * intensity})`);
  g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export function radial(ctx, x, y, r, stops, op = 'source-over', sy = 1) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.translate(x, y); ctx.scale(1, sy);
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

export function vgrad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

// Make an offscreen canvas.
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
