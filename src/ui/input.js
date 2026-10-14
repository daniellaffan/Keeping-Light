// Pointer (mouse + touch via Pointer Events) and keyboard, plus immediate-mode hit regions.
// Scenes register buttons while drawing; clicks are matched against last frame's buttons.

// Held keys are stored under one name per physical key: 'W' (Shift held) and 'w' are the same key,
// otherwise pressing W, then Shift, then releasing W leaves 'w' stuck in the set.
export const keyName = (k) => (k.length === 1 ? k.toLowerCase() : k);

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

    if (!canvas) return;   // virtual: events are fed in by its owner (the logbook on the 3D table)
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      this.cssX = e.clientX - r.left; this.cssY = e.clientY - r.top;
      [this.x, this.y] = layers.toLogical(this.cssX, this.cssY);
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      pos(e);
      this.pointerDown(this.x, this.y, e);
    });
    canvas.addEventListener('pointermove', (e) => { pos(e); this.pointerMove(this.x, this.y, e); });
    canvas.addEventListener('pointerup', (e) => { pos(e); this.pointerUp(this.x, this.y, e); });
    canvas.addEventListener('pointercancel', (e) => this.pointerCancel(e));
    canvas.addEventListener('pointerleave', () => { if (!this.down) { this.x = -9999; this.y = -9999; } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Meta') this.keys.clear();   // macOS sends no keyup for keys released while Cmd is down
      else this.keys.delete(keyName(e.key));
    });
    // focus lost (alt-tab, devtools, tab switch, pointer lock released): keyups will never arrive
    const release = () => this.keys.clear();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) release(); });
  }

  // ---- events, in logical coordinates (called by the DOM listeners, or by hand for a virtual input) ----
  pointerDown(x, y, e) {
    this.type = e.pointerType || 'mouse';
    this.x = x; this.y = y; this.down = true; this.lastActivity = performance.now();
    const b = this.hit(x, y);
    this.captured = b ? b.id : null;
    if (b && b.onDown) b.onDown(x, y);
    if (!b || b.passThrough) for (const h of this.handlers.down) h(x, y, e);
  }
  pointerMove(x, y, e) {
    this.type = e.pointerType || 'mouse';
    this.x = x; this.y = y; this.lastActivity = performance.now();
    for (const h of this.handlers.move) h(x, y, e);
  }
  pointerUp(x, y, e) {
    this.x = x; this.y = y;
    const wasDown = this.down;
    this.down = false;
    const b = this.hit(x, y);
    if (wasDown && b && b.id === this.captured && b.onClick && !b.disabled) b.onClick(x, y);
    this.captured = null;
    for (const h of this.handlers.up) h(x, y, e);
    if (e.pointerType && e.pointerType !== 'mouse') { this.x = -9999; this.y = -9999; }
  }
  pointerCancel(e) { this.down = false; this.captured = null; for (const h of this.handlers.up) h(this.x, this.y, e); }
  keyDown(e) {
    this.lastActivity = performance.now();
    if (e.repeat && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd'].includes(keyName(e.key))) return;
    if (!(e.metaKey && e.key.length === 1)) this.keys.add(keyName(e.key));   // Cmd+letter is a shortcut, not a held key
    for (const h of this.handlers.key) if (h(e) === true) { e.preventDefault(); break; }
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
