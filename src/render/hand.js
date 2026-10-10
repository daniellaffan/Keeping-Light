// Handwriting on canvas: per-glyph (or per-word for joined hands) jitter, baseline drift, tremor,
// ink density, and a write-on reveal. Multi-line blocks are cached as small canvases.
import { rng, noise1, makeCanvas, PAL } from './paint.js';

export const HANDS = {
  keeper: { family: '"Caveat", "Segoe Print", "Bradley Hand", cursive', k: 1.0, color: '#23293A', perGlyph: true, track: 0.0, lineK: 1.22 },
  old: { family: '"Homemade Apple", "Brush Script MT", cursive', k: 0.62, color: '#4A3426', perGlyph: false, track: 0.02, lineK: 1.75 },
  otherA: { family: '"La Belle Aurore", "Brush Script MT", cursive', k: 0.86, color: '#33364A', perGlyph: false, track: 0.0, lineK: 1.45 },
  otherB: { family: '"Cedarville Cursive", "Brush Script MT", cursive', k: 0.78, color: '#5A3E2E', perGlyph: false, track: 0.0, lineK: 1.55 },
  otherC: { family: '"Mrs Saint Delafield", "Snell Roundhand", cursive', k: 1.35, color: '#6A4A36', perGlyph: false, track: 0.01, lineK: 1.15 },
  serif: { family: '"Cormorant Garamond", Georgia, "Times New Roman", serif', k: 1.0, color: PAL.ink, perGlyph: false, track: 0.0, lineK: 1.3 },
  serifItalic: { family: '"Cormorant Garamond", Georgia, serif', k: 1.0, color: PAL.ink, perGlyph: false, track: 0.0, lineK: 1.3, italic: true },
  pencil: { family: '"Caveat", "Segoe Print", cursive', k: 1.0, color: '#56565E', perGlyph: true, track: 0.0, lineK: 1.2 },
};

export function fontFor(hand, size) {
  const H = HANDS[hand] || HANDS.keeper;
  return `${H.italic ? 'italic ' : ''}${hand === 'keeper' || hand === 'pencil' ? '500 ' : ''}${Math.round(size * H.k * 10) / 10}px ${H.family}`;
}

const wcache = new Map();
function cw(ctx, font, s) {
  const key = font + '|' + s;
  let w = wcache.get(key);
  if (w == null) { ctx.font = font; w = ctx.measureText(s).width; wcache.set(key, w); if (wcache.size > 6000) wcache.clear(); }
  return w;
}
export function clearMeasureCache() { wcache.clear(); blockCache.clear(); }

export function measure(ctx, text, hand = 'keeper', size = 30) {
  const f = fontFor(hand, size);
  ctx.save(); ctx.font = f; const w = ctx.measureText(text).width; ctx.restore();
  return w;
}

// Draw one run of text (no wrapping) with jitter. Returns end x.
function drawRun(ctx, text, x, y, o, seedBase) {
  const H = HANDS[o.hand] || HANDS.keeper;
  const size = o.size;
  const f = fontFor(o.hand, size);
  ctx.font = f;
  const drift = o.drift || 0, shake = o.shake || 0;
  const r = rng(seedBase);
  const track = (H.track + drift * 0.06) * size;
  let cx = x;
  if (H.perGlyph) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const w = cw(ctx, f, ch);
      if (ch !== ' ') {
        const rot = (r() - 0.5) * (0.05 + drift * 0.22);
        const by = (noise1(cx * 0.012, seedBase) - 0.5) * size * (0.04 + drift * 0.5) + (r() - 0.5) * size * drift * 0.12;
        const sc = 1 + (r() - 0.5) * (0.05 + drift * 0.25);
        ctx.save();
        ctx.translate(cx + w / 2, y + by);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        ctx.globalAlpha = o.alpha * (0.78 + 0.22 * r());
        ctx.fillText(ch, -w / 2, 0);
        if (shake > 0) { ctx.globalAlpha *= 0.3; ctx.fillText(ch, -w / 2 + (r() - 0.5) * shake * 2.4, (r() - 0.5) * shake * 2.4); }
        ctx.restore();
      }
      cx += w + track + (r() - 0.5) * size * 0.02;
    }
  } else {
    const words = text.split(' ');
    const sp = cw(ctx, f, ' ');
    for (let i = 0; i < words.length; i++) {
      const wd = words[i];
      const w = cw(ctx, f, wd);
      if (wd) {
        const rot = (r() - 0.5) * (0.025 + drift * 0.15 + shake * 0.04);
        const by = (r() - 0.5) * size * (0.05 + drift * 0.3) + (noise1(cx * 0.01, seedBase) - 0.5) * size * shake * 0.25;
        ctx.save();
        ctx.translate(cx, y + by);
        ctx.rotate(rot);
        ctx.globalAlpha = o.alpha * (0.8 + 0.2 * r());
        ctx.fillText(wd, 0, 0);
        if (shake > 0) {
          ctx.globalAlpha *= 0.35;
          ctx.fillText(wd, (r() - 0.5) * shake * 2.2, (r() - 0.5) * shake * 2.2);
        }
        ctx.restore();
      }
      cx += w + sp + track * wd.length;
    }
  }
  return cx;
}

// Single line, drawn directly (labels, buttons, short notes). align: left|center|right
export function letter(ctx, text, x, y, o = {}) {
  const opts = { hand: 'keeper', size: 30, alpha: 1, color: null, drift: 0, shake: 0, align: 'left', seed: 0, ...o };
  if (opts.alpha <= 0.002) return 0;
  const H = HANDS[opts.hand] || HANDS.keeper;
  ctx.save();
  ctx.fillStyle = opts.color || H.color;
  ctx.textBaseline = 'alphabetic';
  const w = measure(ctx, text, opts.hand, opts.size) * (1 + (opts.drift || 0) * 0.06);
  const x0 = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  drawRun(ctx, text, x0, y, opts, hashStr(text) + opts.seed);
  ctx.restore();
  return w;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

// Lay out text into lines that fit `width`.
export function layout(ctx, text, o) {
  const f = fontFor(o.hand, o.size);
  ctx.save(); ctx.font = f;
  const sp = ctx.measureText(' ').width;
  const H = HANDS[o.hand] || HANDS.keeper;
  const trackK = 1 + (o.drift || 0) * 0.08 + H.track;
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (para.trim() === '') { lines.push(''); continue; }
    let cur = '', cwid = 0;
    for (const word of para.split(' ')) {
      const w = ctx.measureText(word).width * trackK;
      if (cur && cwid + sp + w > o.width) { lines.push(cur); cur = word; cwid = w; }
      else { cur = cur ? cur + ' ' + word : word; cwid = cur === word ? w : cwid + sp + w; }
    }
    lines.push(cur);
  }
  ctx.restore();
  return lines;
}

const blockCache = new Map();

// A wrapped block of handwriting. Cached as a canvas at the context's current pixel scale.
// reveal: 0..1 fraction of characters written so far. Returns { h, lines, lineH }.
export function block(ctx, text, x, y, o = {}) {
  const opts = { hand: 'keeper', size: 28, width: 500, alpha: 1, color: null, drift: 0, shake: 0, seed: 0, reveal: 1, lineH: null, ...o };
  const H = HANDS[opts.hand] || HANDS.keeper;
  const lineH = opts.lineH || opts.size * H.lineK;
  const tr = ctx.getTransform();
  const scale = Math.hypot(tr.a, tr.b) || 1;
  const key = [text, opts.hand, opts.size, opts.width, opts.color, opts.drift.toFixed(3), opts.shake, opts.seed, lineH, scale.toFixed(3)].join('|');
  let entry = blockCache.get(key);
  if (!entry) {
    const lines = layout(ctx, text, opts);
    const pad = opts.size * 0.8;
    const W = opts.width + pad * 2 + opts.drift * opts.size * 3;
    const Ht = lines.length * lineH + pad * 2 + opts.drift * opts.size * 2;
    const cv = makeCanvas(W * scale, Ht * scale);
    const c = cv.getContext('2d');
    c.scale(scale, scale);
    c.fillStyle = opts.color || H.color;
    c.textBaseline = 'alphabetic';
    const lens = [];
    lines.forEach((ln, i) => {
      // lines wander off the ruled lines as the hand loosens
      const tilt = (noise1(i * 1.7, opts.seed + 3) - 0.5) * opts.drift * 0.09;
      const lx = pad + (noise1(i * 2.3, opts.seed + 5) - 0.5) * opts.drift * opts.size * 1.4;
      const ly = pad + opts.size * 0.95 + i * lineH + (noise1(i * 0.9, opts.seed + 7) - 0.5) * opts.drift * opts.size * 0.9;
      c.save();
      c.translate(lx, ly); c.rotate(tilt);
      const end = drawRun(c, ln, 0, 0, { ...opts, alpha: 1 }, opts.seed * 131 + i * 977 + 7);
      c.restore();
      lens.push({ x0: lx, x1: lx + end + opts.size * 0.3, chars: ln.length, top: ly - opts.size * 1.1 - opts.drift * opts.size * 0.6, bot: ly + opts.size * 0.55 + opts.drift * opts.size * 0.6 });
    });
    entry = { cv, W, Ht, pad, lines, lens, total: lens.reduce((a, l) => a + Math.max(1, l.chars), 0) };
    blockCache.set(key, entry);
    if (blockCache.size > 220) blockCache.delete(blockCache.keys().next().value);
  }
  const { cv, W, Ht, pad, lens, total } = entry;
  const ox = x - pad, oy = y - pad;
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  if (opts.reveal >= 1) {
    ctx.drawImage(cv, ox, oy, W, Ht);
  } else if (opts.reveal > 0) {
    let budget = opts.reveal * total;
    const sx = cv.width / W;
    for (const l of lens) {
      const n = Math.max(1, l.chars);
      const f = Math.min(1, budget / n);
      if (f <= 0) break;
      const top = Math.max(0, l.top), bot = Math.min(Ht, l.bot);
      const x1 = f >= 1 ? W : l.x0 + (l.x1 - l.x0) * f;
      if (x1 > 0 && bot > top) ctx.drawImage(cv, 0, top * sx, x1 * sx, (bot - top) * sx, ox, oy + top, x1, bot - top);
      budget -= n;
    }
  }
  ctx.restore();
  return { h: entry.lines.length * lineH, lines: entry.lines, lineH };
}

export function blockHeight(ctx, text, o) {
  const H = HANDS[o.hand] || HANDS.keeper;
  return layout(ctx, text, { drift: 0, ...o }).length * (o.lineH || o.size * H.lineK);
}
