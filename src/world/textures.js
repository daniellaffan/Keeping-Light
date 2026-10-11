// Painted textures for the world, made once in code with paint.js on canvases (nothing downloaded).
// Each is a soft multiplier around white, so a material's own wash colour still decides the hue.
import * as THREE from 'three';
import { makeCanvas, rng, fbm2, noise2, streaks, glazes, inkLine, rgba } from '../render/paint.js';

const cache = new Map();

function canvasTex(key, w, h, draw, { repeat = true, mip = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

// Planks: long grain streaks, darker seams, the odd knot.
export function woodTex(seed = 3) {
  return canvasTex('wood' + seed, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const r = rng(seed);
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      const x0 = (p / planks) * w, pw = w / planks;
      ctx.fillStyle = rgba('#E8DCCB', 0.25 + r() * 0.35);
      ctx.fillRect(x0, 0, pw, h);
      streaks(ctx, x0 + 2, x0 + pw - 2, 0, h, '#9C8466', { count: 26, alpha: 0.12, thick: [1, 4], seed: seed * 10 + p, blur: 1, len: [0.4, 1.0] });
      // seam
      ctx.fillStyle = rgba('#5A4636', 0.35);
      ctx.fillRect(x0, 0, 2, h);
      if (r() < 0.7) {
        const ky = r() * h, kx = x0 + pw * (0.3 + r() * 0.4);
        ctx.strokeStyle = rgba('#6B5440', 0.35);
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(kx, ky, 3 + k * 3, 8 + k * 6, 0, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
    // grain runs along v (canvas y)
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm2(x * 0.08, y * 0.006, seed, 3);
      const k = (y * w + x) * 4, m = 0.88 + n * 0.16;
      d[k] *= m; d[k + 1] *= m; d[k + 2] *= m;
    }
    ctx.putImageData(img, 0, 0);
  });
}

// Limewash on plaster: blotchy, a little damp near the bottom.
export function plasterTex(seed = 5) {
  return canvasTex('plaster' + seed, 512, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm2(x * 0.012, y * 0.012, seed, 4), m = noise2(x * 0.08, y * 0.08, seed + 3);
      const v = 0.86 + n * 0.16 + (m - 0.5) * 0.04;
      const k = (y * w + x) * 4;
      d[k] = 255 * Math.min(1, v * 1.01); d[k + 1] = 255 * Math.min(1, v); d[k + 2] = 255 * Math.min(1, v * 0.97); d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    glazes(ctx, 0, w, 0, h, ['#C9B9A0', '#B8B4A8'], { count: 18, alpha: [0.04, 0.1], w: [60, 240], h: [20, 90], seed });
  });
}

// Rough stone blocks for the tower outside.
export function stoneTex(seed = 7) {
  return canvasTex('stone' + seed, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const r = rng(seed);
    const rows = 8;
    for (let row = 0; row < rows; row++) {
      const y0 = (row / rows) * h, rh = h / rows;
      let x = -r() * 60;
      while (x < w) {
        const bw = 50 + r() * 70;
        ctx.fillStyle = rgba('#D8D0C2', 0.2 + r() * 0.4);
        ctx.fillRect(x + 2, y0 + 2, bw - 4, rh - 4);
        inkLine(ctx, [[x, y0 + rh], [x, y0]], { width: 1, alpha: 0.25, seed: row * 50 + x });
        x += bw;
      }
      inkLine(ctx, [[0, y0], [w, y0]], { width: 1, alpha: 0.2, seed: row });
    }
  });
}

// Knitted wool: rows of small chevrons with a dry, granular tooth.
export function knitTex(seed = 11) {
  return canvasTex('knit' + seed, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const rows = 32, cols = 24;
    ctx.lineCap = 'round';
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * (w / cols), y = (j + 0.5) * (h / rows);
      const s = w / cols * 0.45;
      const v = noise2(i * 0.7, j * 0.7, seed);
      ctx.strokeStyle = rgba('#7A6A55', 0.18 + v * 0.18);
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.8); ctx.lineTo(x, y + s * 0.6); ctx.lineTo(x + s, y - s * 0.8); ctx.stroke();
    }
    // cable twists every eighth column
    for (let i = 0; i < cols; i += 8) {
      const x = (i + 4) * (w / cols);
      ctx.strokeStyle = rgba('#6A5A48', 0.22);
      ctx.lineWidth = 3;
      for (let y = 0; y < h; y += 22) { ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.bezierCurveTo(x + 8, y + 6, x + 8, y + 12, x - 6, y + 22); ctx.stroke(); }
    }
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const r = rng(seed);
    for (let k = 0; k < d.length; k += 4) { const m = 0.93 + r() * 0.1; d[k] *= m; d[k + 1] *= m; d[k + 2] *= m; }
    ctx.putImageData(img, 0, 0);
  });
}

// Grass and heather in patches, for the headland.
export function turfTex(seed = 13) {
  return canvasTex('turf' + seed, 512, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm2(x * 0.01, y * 0.01, seed, 4), m = fbm2(x * 0.05, y * 0.05, seed + 9, 2);
      const k = (y * w + x) * 4;
      const v = 0.82 + n * 0.22 + (m - 0.5) * 0.1;
      d[k] = 255 * Math.min(1, v * (1 + (n - 0.5) * 0.12)); d[k + 1] = 255 * Math.min(1, v); d[k + 2] = 255 * Math.min(1, v * (1 - (n - 0.5) * 0.1)); d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}

// A sheet of paper lettered in ink: returns a straight-alpha texture for the ink layer.
export function letteringTex(key, w, h, draw) {
  return canvasTex('ink:' + key, w, h, (ctx) => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); }, { repeat: false });
}

// A plain canvas texture that the caller redraws (e.g. the logbook pages).
export function liveTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}
