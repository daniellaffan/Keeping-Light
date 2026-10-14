// Painted textures for the world, made once in code with paint.js on canvases (nothing downloaded).
// Each is a soft multiplier around white, so a material's own wash colour still decides the hue.
import * as THREE from 'three';
import { makeCanvas, rng, fbm2, noise1, noise2, streaks, glazes, inkLine, rgba, lerp } from '../render/paint.js';

const cache = new Map();

export function canvasTex(key, w, h, draw, { repeat = true, mip = true } = {}) {
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

// fbm that tiles: u, v in 0..1 wrap round (blended across the edges), `s` blotches per tile
export function tileFbm(u, v, s, seed, oct = 3) {
  const f = (a, b) => fbm2(a * s, b * s, seed, oct);
  const a = f(u, v) * (1 - u) + f(u - 1, v) * u;
  const b = f(u, v - 1) * (1 - u) + f(u - 1, v - 1) * u;
  return a * (1 - v) + b * v;
}

// Dressed granite in courses half a metre high, one metre to the tile (box and extrude UVs are in
// metres): a grey speckle of mica and feldspar, each block its own shade, lichen here and there.
// The joints are pen lines in the ink layer.
export function graniteTex(seed = 3) {
  const S = 512, rows = 2, rh = S / rows;
  const r = rng(seed);
  const layout = [];
  for (let j = 0; j < rows; j++) {
    const n = 2 + Math.floor(r() * 2), ws = Array.from({ length: n }, () => 0.7 + r() * 0.6), sum = ws.reduce((a, b) => a + b, 0);
    let x = j * S * 0.31;
    layout.push(ws.map((w) => { const b = { x, w: (w / sum) * S, y: j * rh, tone: r() }; x += b.w; return b; }));
  }
  const map = canvasTex('granite' + seed, S, S, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data, rr = rng(seed + 1);
    const L = 64, low = new Float32Array(L * L);
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) low[y * L + x] = tileFbm(x / L, y / L, 6, seed, 3);
    const at = (x, y) => {
      const fx = (x / w) * L, fy = (y / h) * L, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      const g = (a, b) => low[((b + L) % L) * L + ((a + L) % L)];
      return lerp(lerp(g(i, j), g(i + 1, j), tx), lerp(g(i, j + 1), g(i + 1, j + 1), tx), ty);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = at(x, y);
      let v = 0.8 + n * 0.14, cr = 1, cb = 1;
      const s = rr();
      if (s < 0.05) v *= 0.55 + rr() * 0.2;                    // mica and hornblende
      else if (s < 0.09) { cr = 1.04; cb = 0.9; }               // pink feldspar
      else if (s < 0.12) v = Math.min(1, v * 1.12);              // quartz
      const k = (y * w + x) * 4;
      d[k] = 255 * Math.min(1, v * cr); d[k + 1] = 255 * Math.min(1, v * 0.99); d[k + 2] = 255 * Math.min(1, v * 0.97 * cb); d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // each block a shade of its own, the mortar a little sunk and darker
    for (const row of layout) for (const b of row) for (const dx of [0, -w]) {
      ctx.fillStyle = b.tone < 0.5 ? rgba('#6E6A64', 0.06 + b.tone * 0.12) : rgba('#B49A7E', (b.tone - 0.5) * 0.18);
      ctx.fillRect(b.x + dx + 3, b.y + 3, b.w - 6, rh - 6);
      ctx.fillStyle = rgba('#5C5850', 0.35);
      ctx.fillRect(b.x + dx - 2, b.y, 4, rh);
    }
    for (let j = 0; j < rows; j++) { ctx.fillStyle = rgba('#5C5850', 0.35); ctx.fillRect(0, j * rh - 2, w, 4); }
    // lichen: grey-green rosettes and the odd orange one
    for (let i = 0; i < 26; i++) {
      const cx = r() * w, cy = r() * h, col = r() < 0.3 ? '#C98B3E' : '#93A07E';
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = rgba(col, 0.25 + r() * 0.25);
        ctx.beginPath(); ctx.arc(cx + (r() - 0.5) * 22, cy + (r() - 0.5) * 22, 2 + r() * 7, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  const ink = canvasTex('granite-ink' + seed, S, S, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let j = 0; j < rows; j++) {
      const y = j * rh;
      const pts = [];
      for (let x = -8; x <= w + 8; x += 16) pts.push([x, y + (noise1(x * 0.05, seed + j) - 0.5) * 2]);
      for (const dy of [0, h]) inkLine(ctx, pts.map(([a, b]) => [a, b + dy]), { width: 1.5, alpha: 0.55, seed: seed + j, breaks: 0.05, color: '#3A332C' });
      for (const b of layout[j]) for (const dx of [0, -w]) inkLine(ctx, [[b.x + dx, y + 2], [b.x + dx + (r() - 0.5) * 3, y + rh - 2]], { width: 1.3, alpha: 0.5, seed: seed + b.x, breaks: 0.05, color: '#3A332C' });
    }
  });
  return { map, ink };
}

// Painted iron plates round a lantern: `panels` plates across the sheet (u goes once round), rows of
// rivets down every seam and along `belts` (fractions of the height), chalky old paint, rust weeping
// down from the rivets and the odd flake gone to bare metal. The rivets and seams are ink.
export function ironPanelTex(key, { panels = 16, belts = [], seed = 9, rust = 1 } = {}) {
  const W = 1024, H = 512;
  const r = rng(seed);
  const seams = Array.from({ length: panels }, (_, i) => (i / panels) * W);
  const rivets = [];
  for (const x of seams) for (let y = 10; y < H - 6; y += 15) for (const s of [-6, 6]) rivets.push([x + s, y]);
  for (const b of belts) for (let x = 4; x < W; x += 14) rivets.push([x, (1 - b) * H]);
  const map = canvasTex('iron:' + key, W, H, (ctx, w, h) => {
    const lw = 256, lh = 128, low = makeCanvas(lw, lh), lc = low.getContext('2d'), img = lc.createImageData(lw, lh), d = img.data;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const n = tileFbm(x / lw, y / lh, 7, seed, 4), m = tileFbm(x / lw, y / lh, 23, seed + 4, 2);
      const v = 0.86 + n * 0.1 + (m - 0.5) * 0.06, k = (y * lw + x) * 4;
      d[k] = 255 * v; d[k + 1] = 255 * v; d[k + 2] = 255 * v * 0.99; d[k + 3] = 255;
    }
    lc.putImageData(img, 0, 0);
    ctx.drawImage(low, 0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    // plates: each a shade of its own; the seams sunk
    seams.forEach((x, i) => {
      ctx.fillStyle = rgba('#8C8A86', 0.04 + r() * 0.08);
      ctx.fillRect(x + 3, 0, w / panels - 6, h);
      ctx.fillStyle = rgba('#5E5A56', 0.45);
      ctx.fillRect(x - 1.5, 0, 3, h);
    });
    for (const b of belts) { ctx.fillStyle = rgba('#5E5A56', 0.4); ctx.fillRect(0, (1 - b) * h - 1.5, w, 3); }
    // rust weeping down from the rivets
    for (const [x, y] of rivets) {
      if (r() > 0.16 * rust) continue;
      const len = 14 + r() * 70 * rust, wd = 2 + r() * 3;
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, rgba('#8A4426', 0.55)); g.addColorStop(1, rgba('#8A4426', 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - wd / 2, y); ctx.lineTo(x + wd / 2, y); ctx.lineTo(x + wd * 0.2 + (r() - 0.5) * 3, y + len); ctx.lineTo(x - wd * 0.2, y + len); ctx.fill();
    }
    // flakes gone to bare, rusty metal
    for (let i = 0; i < 18 * rust; i++) {
      const x = r() * w, y = r() * h, rx = 3 + r() * 10, ry = 2 + r() * 6;
      ctx.fillStyle = rgba('#6B4A38', 0.35 + r() * 0.3);
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  const ink = canvasTex('iron-ink:' + key, W, H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (const x of seams) inkLine(ctx, [[x, 0], [x + (r() - 0.5) * 2, h * 0.5], [x, h]], { width: 1.6, alpha: 0.6, seed: x + seed, breaks: 0.02, color: '#2A2420' });
    for (const b of belts) inkLine(ctx, [[0, (1 - b) * h], [w, (1 - b) * h]], { width: 1.4, alpha: 0.55, seed: b * 100 + seed, breaks: 0.02, color: '#2A2420' });
    ctx.fillStyle = '#2A2420';
    for (const [x, y] of rivets) { ctx.globalAlpha = 0.45 + r() * 0.3; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  });
  return { map, ink };
}

// The glass of a round-headed window in the tower (u across, v up the whole opening, the arch's
// springing at `spring` of the height): the sky caught pale in the top panes, dark below; the sash
// bars and the fanlight's spokes drawn in ink.
export function sashTex(spring = 0.74) {
  const W = 128, H = 256, sy = (1 - spring) * H, R = W / 2;
  const map = canvasTex('sash', W, H, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, '#E0E4EA'); g.addColorStop(0.5, '#A8B0BC'); g.addColorStop(1, '#8C94A0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // a pale stroke of reflected sky across two panes
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(w * 0.15, sy + 20); ctx.lineTo(w * 0.45, sy + 6); ctx.lineTo(w * 0.62, sy + 60); ctx.lineTo(w * 0.3, sy + 76); ctx.fill();
  }, { repeat: false });
  const ink = canvasTex('sash-ink', W, H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const o = { width: 3, alpha: 0.85, color: '#231E1A', breaks: 0, vary: 0.3 };
    inkLine(ctx, [[w / 2, sy - R], [w / 2, h]], { ...o, seed: 1 });
    for (const t of [0, 1 / 3, 2 / 3]) inkLine(ctx, [[0, lerp(sy, h, t)], [w, lerp(sy, h, t)]], { ...o, seed: 2 + t * 9 });
    for (const a of [Math.PI * 0.25, Math.PI * 0.75]) inkLine(ctx, [[w / 2, sy], [w / 2 + Math.cos(a) * R, sy - Math.sin(a) * R]], { ...o, width: 2.4, seed: 7 + a });
    ctx.strokeStyle = 'rgba(35,30,26,0.9)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(2, h); ctx.lineTo(2, sy); ctx.arc(w / 2, sy, R - 2, Math.PI, 0); ctx.lineTo(w - 2, h); ctx.closePath(); ctx.stroke();
  }, { repeat: false });
  return { map, ink };
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
