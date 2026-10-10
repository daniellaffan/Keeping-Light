// The four layer canvases every scene paints into, plus the logical view transform.
import { makeCanvas } from './paint.js';

const NAMES = ['paint', 'ink', 'light', 'mask'];
const MAX_PIXELS = 2.4e6;

export class Layers {
  constructor() {
    this.canvas = {};
    this.ctx = {};
    this.dirty = {};
    for (const n of NAMES) {
      this.canvas[n] = makeCanvas(4, 4);
      this.ctx[n] = this.canvas[n].getContext('2d');
      this.dirty[n] = true;
    }
    this.cssW = 4; this.cssH = 4; this.ls = 1; this.version = 0;
    this.k = 1; this.ox = 0; this.oy = 0;
    this.view = { x0: 0, y0: 0, x1: 1600, y1: 1000, w: 1600, h: 1000 };
    this.safe = { w: 1600, h: 1000 };
    this.caches = new Map();
  }

  resize(cssW, cssH, dpr) {
    let ls = Math.min(dpr, 1.5);
    if (cssW * cssH * ls * ls > MAX_PIXELS) ls = Math.sqrt(MAX_PIXELS / (cssW * cssH));
    this.cssW = cssW; this.cssH = cssH; this.ls = ls;
    const W = Math.round(cssW * ls), H = Math.round(cssH * ls);
    for (const n of NAMES) {
      const c = this.canvas[n];
      const s = n === 'mask' ? 0.5 : 1;
      c.width = Math.max(1, Math.round(W * s)); c.height = Math.max(1, Math.round(H * s));
    }
    this.version++;
    this.caches.clear();
  }

  // Fit a safe area to the screen. Returns the visible logical rect.
  fit(safe) {
    this.safe = safe;
    const k = Math.min(this.cssW / safe.w, this.cssH / safe.h);
    this.k = k;
    this.ox = (this.cssW - safe.w * k) / 2;
    this.oy = (this.cssH - safe.h * k) / 2;
    const x0 = -this.ox / k, y0 = -this.oy / k;
    const x1 = (this.cssW - this.ox) / k, y1 = (this.cssH - this.oy) / k;
    this.view = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    return this.view;
  }

  transformFor(name) {
    const s = this.ls * this.k * (name === 'mask' ? 0.5 : 1);
    const o = this.ls * (name === 'mask' ? 0.5 : 1);
    return [s, 0, 0, s, this.ox * o, this.oy * o];
  }

  // Prepare all layers for a new frame.
  begin(safe, { paper = '#F2EAD9' } = {}) {
    this.fit(safe);
    for (const n of NAMES) {
      const c = this.ctx[n];
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      if (n === 'paint') { c.fillStyle = paper; c.fillRect(0, 0, c.canvas.width, c.canvas.height); }
      else if (n === 'ink') c.clearRect(0, 0, c.canvas.width, c.canvas.height);
      else { c.fillStyle = '#000'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); }
      c.setTransform(...this.transformFor(n));
      this.dirty[n] = true;
    }
    return this;
  }

  get paint() { return this.ctx.paint; }
  get ink() { return this.ctx.ink; }
  get light() { return this.ctx.light; }
  get mask() { return this.ctx.mask; }

  toLogical(cssX, cssY) { return [(cssX - this.ox) / this.k, (cssY - this.oy) / this.k]; }
  toCss(x, y) { return [x * this.k + this.ox, y * this.k + this.oy]; }

  // Painted area of the page in shader uv (y up), with a ragged deckle margin.
  marginUv(rect) {
    const pad = 10;
    let [ax, ay] = this.toCss(rect.x0, rect.y0);
    let [bx, by] = this.toCss(rect.x1, rect.y1);
    ax = Math.max(pad, ax); ay = Math.max(pad, ay);
    bx = Math.min(this.cssW - pad, bx); by = Math.min(this.cssH - pad, by);
    return [ax / this.cssW, 1 - by / this.cssH, bx / this.cssW, 1 - ay / this.cssH];
  }

  // A cached set of four canvases for static scene parts. `key` must change when content should.
  cache(key, draw) {
    const full = key + '|' + this.version + '|' + this.safe.w + 'x' + this.safe.h;
    let c = this.caches.get(full);
    if (c) return c;
    if (this.caches.size > 24) this.caches.clear();
    c = { canvas: {}, ctx: {} };
    for (const n of NAMES) {
      const src = this.canvas[n];
      const cv = makeCanvas(src.width, src.height);
      const cx = cv.getContext('2d');
      if (n === 'paint') { cx.fillStyle = '#F2EAD9'; cx.fillRect(0, 0, cv.width, cv.height); }
      else if (n === 'light' || n === 'mask') { cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height); }
      cx.setTransform(...this.transformFor(n));
      c.canvas[n] = cv; c.ctx[n] = cx;
    }
    const proxy = {
      paint: c.ctx.paint, ink: c.ctx.ink, light: c.ctx.light, mask: c.ctx.mask,
      view: this.view, safe: this.safe, k: this.k,
    };
    draw(proxy);
    this.caches.set(full, c);
    return c;
  }

  // Draw a cache into the live layers (replacing what's there), optionally faded over.
  blit(c, alpha = 1, only = null) {
    for (const n of NAMES) {
      if (only && !only.includes(n)) continue;
      const ctx = this.ctx[n];
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(c.canvas[n], 0, 0);
      ctx.restore();
    }
  }
}
