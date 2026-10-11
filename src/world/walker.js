// Walking in first person: WASD / arrows and mouse look (pointer lock), or on a touch screen a stick
// under the left thumb and a drag on the right to look. No body: just a height, a pace and a bob.
import * as THREE from 'three';
import { inkLine, rgba } from '../render/paint.js';

export class Walker {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();    // feet
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.62;
    this.vel = new THREE.Vector2();
    this.bobT = 0; this.bob = 0;
    this.enabled = false;
    this.locked = false;
    this.walkSpeed = 1.45; this.runSpeed = 3.2;
    this.sens = 0.0022;
    this.stick = null;     // { id, ox, oy, x, y } css px
    this.lookTouch = null; // { id, x, y }
    this.drag = null;      // mouse drag-to-look when the pointer isn't locked
    this.moved = 0;        // metres walked (footsteps)
    this.onStep = null;
    const canvas = game.canvas, inp = game.input;

    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    inp.on('down', (x, y, e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') {
        const r = canvas.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        if (cx < r.width * 0.45 && !this.stick) this.stick = { id: e.pointerId, ox: cx, oy: cy, x: cx, y: cy };
        else if (!this.lookTouch) this.lookTouch = { id: e.pointerId, x: cx, y: cy, t: performance.now(), sx: cx, sy: cy };
        return;
      }
      if (!this.locked && this.wantLock) {
        const quiet = (p) => { if (p && p.catch) p.catch(() => {}); return p; };
        try {
          const p = canvas.requestPointerLock({ unadjustedMovement: true });
          if (p && p.catch) p.catch(() => { try { quiet(canvas.requestPointerLock()); } catch { /* none */ } });
        } catch { /* no lock: drag to look */ }
      }
      if (!this.locked) this.drag = { x: e.clientX, y: e.clientY };
    });
    inp.on('move', (x, y, e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') {
        const r = canvas.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        if (this.stick && e.pointerId === this.stick.id) { this.stick.x = cx; this.stick.y = cy; }
        else if (this.lookTouch && e.pointerId === this.lookTouch.id) {
          this.turn((cx - this.lookTouch.x) * 0.006, (cy - this.lookTouch.y) * 0.006);
          this.lookTouch.x = cx; this.lookTouch.y = cy;
        }
        return;
      }
      if (this.locked) this.turn((e.movementX || 0) * this.sens, (e.movementY || 0) * this.sens);
      else if (this.drag && inp.down) {
        this.turn((e.clientX - this.drag.x) * 0.005, (e.clientY - this.drag.y) * 0.005);
        this.drag = { x: e.clientX, y: e.clientY };
      }
    });
    inp.on('up', (x, y, e) => {
      if (this.stick && e.pointerId === this.stick.id) this.stick = null;
      if (this.lookTouch && e.pointerId === this.lookTouch.id) {
        const lt = this.lookTouch;
        this.lookTouch = null;
        // a short tap on the right side is "use"
        if (performance.now() - lt.t < 260 && Math.hypot(lt.x - lt.sx, lt.y - lt.sy) < 12 && this.onTap) this.onTap();
      }
      this.drag = null;
    });
  }

  turn(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.max(-1.35, Math.min(1.25, this.pitch - dy));
  }

  setEnabled(on, { lock = true } = {}) {
    this.enabled = on;
    this.wantLock = on && lock;
    if (!on) { this.stick = null; this.lookTouch = null; this.drag = null; this.unlock(); }
  }

  unlock() { if (document.pointerLockElement) { try { document.exitPointerLock(); } catch { /* fine */ } } this.locked = false; }

  place(x, y, z, yaw = this.yaw, pitch = 0) { this.pos.set(x, y, z); this.yaw = yaw; this.pitch = pitch; this.vel.set(0, 0); }

  // collide(nextPos) → corrected position (Vector3); ground(x, z) → height of the floor
  update(dt, { collide = null, ground = null } = {}) {
    let fx = 0, fz = 0;
    if (this.enabled) {
      const k = this.game.input.keys;
      const f = (k.has('w') || k.has('W') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('S') || k.has('ArrowDown') ? 1 : 0);
      const r = (k.has('d') || k.has('D') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('A') || k.has('ArrowLeft') ? 1 : 0);
      let mf = f, mr = r;
      if (this.stick) {
        const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
        const m = Math.min(1, Math.hypot(dx, dy) / 50);
        const a = Math.atan2(dy, dx);
        mr = Math.cos(a) * m; mf = -Math.sin(a) * m;
      }
      const run = this.game.input.keys.has('Shift') || (this.stick && Math.hypot(this.stick.x - this.stick.ox, this.stick.y - this.stick.oy) > 70);
      const sp = run ? this.runSpeed : this.walkSpeed;
      const len = Math.hypot(mf, mr);
      if (len > 1) { mf /= len; mr /= len; }
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      fx = (-sy * mf + cy * mr) * sp;
      fz = (-cy * mf - sy * mr) * sp;
    }
    // ease into and out of a pace
    const a = 1 - Math.exp(-dt * 9);
    this.vel.x += (fx - this.vel.x) * a;
    this.vel.y += (fz - this.vel.y) * a;
    const next = this.pos.clone();
    next.x += this.vel.x * dt; next.z += this.vel.y * dt;
    if (collide) collide(next);
    if (ground) next.y += (ground(next.x, next.z) - next.y) * Math.min(1, dt * 12);
    const moved = Math.hypot(next.x - this.pos.x, next.z - this.pos.z);
    this.pos.copy(next);
    const speed = moved / Math.max(dt, 1e-4);
    this.bobT += moved * 1.75;
    this.bob += ((speed > 0.2 ? 1 : 0) - this.bob) * Math.min(1, dt * 5);
    this.moved += moved;
    if (this.moved > 0.72) { this.moved = 0; this.onStep?.(speed); }
  }

  // eye pose: position and euler angles, with a small walking bob and sway
  eyePose(out = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0 }) {
    const b = this.bob;
    out.pos.set(this.pos.x, this.pos.y + this.eye + Math.abs(Math.sin(this.bobT * Math.PI)) * 0.035 * b - 0.017 * b, this.pos.z);
    out.yaw = this.yaw;
    out.pitch = this.pitch + Math.sin(this.bobT * Math.PI * 2) * 0.004 * b;
    out.roll = Math.sin(this.bobT * Math.PI) * 0.006 * b;
    return out;
  }

  // the touch stick, drawn as a pencil ring under the thumb
  drawTouch(L) {
    if (!this.stick) return;
    const [ox, oy] = L.toLogical(this.stick.ox, this.stick.oy);
    const [x, y] = L.toLogical(this.stick.x, this.stick.y);
    const ink = L.ink, r = 50 / L.k;
    const ring = [];
    for (let i = 0; i <= 24; i++) ring.push([ox + Math.cos(i / 24 * Math.PI * 2) * r, oy + Math.sin(i / 24 * Math.PI * 2) * r]);
    inkLine(ink, ring, { width: 1.4, alpha: 0.4, seed: 3 });
    ink.fillStyle = rgba('#2B2622', 0.35);
    const dx = x - ox, dy = y - oy, m = Math.min(1, Math.hypot(dx, dy) / r);
    const a = Math.atan2(dy, dx);
    ink.beginPath(); ink.arc(ox + Math.cos(a) * m * r, oy + Math.sin(a) * m * r, 14 / L.k, 0, Math.PI * 2); ink.fill();
  }
}
