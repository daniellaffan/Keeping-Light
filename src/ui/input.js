// Pointer (mouse + touch via Pointer Events) and keyboard, plus immediate-mode hit regions.
// Scenes register buttons while drawing; clicks are matched against last frame's buttons.

export class Input {
  constructor(canvas, layers) {
    this.canvas = canvas;
    this.layers = layers;
    this.x = -9999; this.y = -9999; // logical
    this.cssX = -9999; this.cssY = -9999;
    this.down = false;
    this.type = 'mouse';
    this.buttons = [];     // being built this frame
    this.live = [];        // from last frame (used for hit tests)
    this.handlers = { down: [], move: [], up: [], key: [] };
    this.keys = new Set();
    this.lastActivity = performance.now();
    this.captured = null;  // button id that got pointerdown

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      this.cssX = e.clientX - r.left; this.cssY = e.clientY - r.top;
      [this.x, this.y] = layers.toLogical(this.cssX, this.cssY);
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.type = e.pointerType || 'mouse';
      pos(e); this.down = true; this.lastActivity = performance.now();
      const b = this.hit(this.x, this.y);
      this.captured = b ? b.id : null;
      if (b && b.onDown) b.onDown(this.x, this.y);
      if (!b || b.passThrough) for (const h of this.handlers.down) h(this.x, this.y, e);
    });
    canvas.addEventListener('pointermove', (e) => {
      this.type = e.pointerType || 'mouse';
      pos(e); this.lastActivity = performance.now();
      for (const h of this.handlers.move) h(this.x, this.y, e);
    });
    const up = (e) => {
      pos(e);
      const wasDown = this.down;
      this.down = false;
      const b = this.hit(this.x, this.y);
      if (wasDown && b && b.id === this.captured && b.onClick && !b.disabled) b.onClick(this.x, this.y);
      this.captured = null;
      for (const h of this.handlers.up) h(this.x, this.y, e);
      if (e.pointerType !== 'mouse') { this.x = -9999; this.y = -9999; }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => { this.down = false; this.captured = null; for (const h of this.handlers.up) h(this.x, this.y, e); });
    canvas.addEventListener('pointerleave', () => { if (!this.down) { this.x = -9999; this.y = -9999; } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      this.lastActivity = performance.now();
      if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      this.keys.add(e.key);
      for (const h of this.handlers.key) if (h(e) === true) { e.preventDefault(); break; }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
  }

  on(kind, fn) { this.handlers[kind].push(fn); return () => { const a = this.handlers[kind]; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; }

  frame() { this.live = this.buttons; this.buttons = []; }

  // Register a clickable region. shape: {x,y,w,h} or {cx,cy,r}
  button(b) { this.buttons.push(b); return this.isHover(b.id); }

  hit(x, y) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      if (b.disabled && !b.onDown) continue;
      if (b.r != null ? Math.hypot(x - b.cx, y - b.cy) <= b.r : x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) return b;
    }
    return null;
  }

  isHover(id) {
    if (this.type !== 'mouse' && !this.down) return false;
    const b = this.hit(this.x, this.y);
    return !!b && b.id === id;
  }

  cursor() {
    const b = this.hit(this.x, this.y);
    return b && !b.disabled ? (b.cursor || 'pointer') : null;
  }
}
