// The Keeper: the first-person game. One continuous world (watch room, tower, headland, bay) and one
// camera; the game's phase machine (main.js) still decides what happens when, and reaches this through
// thin per-phase wrappers registered under the old scene names (logbook, bay, daymap, vignette, finale).
import * as THREE from 'three';
import { buildRoom, ROOM } from './room.js';
import { Book } from './book.js';
import { Walker } from './walker.js';
import { wash } from './materials.js';
import { TOWER, ROOM_YAW, CLIFF_TOP, skyFromPalette } from './geo.js';
import { palette } from '../render/scenes/bay-paint.js';
import { letter, measure } from '../render/hand.js';
import { blob, rgba, smooth, clamp } from '../render/paint.js';

const DEG = Math.PI / 180;
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrapA = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

export class Keeper {
  constructor(game) {
    this.game = game;
    const W = this.world = game.world;
    this.room = buildRoom();
    const rg = this.room.group;
    rg.position.copy(TOWER);
    rg.rotation.y = ROOM_YAW;
    rg.updateMatrixWorld(true);
    W.scene.add(rg);
    this.roomInv = new THREE.Matrix4().copy(rg.matrixWorld).invert();

    // until the bay and the headland are built: a sea and a cliff top so the window looks onto something
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), wash({ color: '#4E6C90', color2: '#3D5878', water: 1, line: 0.2, gran: 0.6, world: true, noiseScale: 0.02 }));
    sea.rotation.x = -Math.PI / 2;
    this.sea = sea;
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(40, 46, CLIFF_TOP, 24), wash({ color: '#7C8F55', color2: '#6E8049', line: 0.8, gran: 0.8, world: true, noiseScale: 0.1 }));
    cliff.position.set(TOWER.x, CLIFF_TOP / 2 - 0.02, TOWER.z);
    this.cliff = cliff;
    W.scene.add(sea, cliff);

    // the logbook, open on the table
    this.book = new Book(game);
    const T = ROOM.table;
    this.book.group.position.set(0.02, T.h, 0.07);
    this.book.group.rotation.y = 0.04;
    this.room.table.add(this.book.group);
    this.book.group.updateMatrixWorld(true);
    this.book.intercept.inkPlan = (w, meta) => this.onInked(w, meta);
    this.book.intercept.onDawnDone = () => this.onBookClosed();

    this.walker = new Walker(game);
    this.walker.onTap = () => this.use();
    this.cam = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, fov: 62 };
    this.state = 'idle';
    this.t = 0; this.st = 0;
    this.blendT = null;
    this.prompt = null;
    this.mode = 'dusk';
    this.hud = { flash: null };
    this.lit = 0;

    const inp = game.input;
    inp.on('down', (x, y, e) => this.pointer('down', e));
    inp.on('move', (x, y, e) => this.pointer('move', e));
    inp.on('up', (x, y, e) => this.pointer('up', e));
    inp.on('key', (e) => this.key(e));

    // wrappers: what main.js and the debug panel see
    this.wrappers = {};
    for (const name of ['logbook']) this.wrappers[name] = this.wrap(name);
  }

  wrap(name) {
    const k = this;
    return {
      three: true, keeper: k, name,
      safe: { w: 1600, h: 1000 },
      enter(args) { k.enter(name, args); },
      exit() { k.walker.setEnabled(false); k.book.open = false; },
      update(dt) { k.update(dt); },
      draw(L) { k.drawHud(L); },
      hudActive() { return k.hudActive(); },
      look() { return k.look(); },
      cursor() { return k.cursor(); },
      get mode() { return k.mode; },
      autoPlan() { if (k.state === 'lean' && k.mode === 'dusk') k.book.scene.autoPlan(); },
      closeBook() { k.book.scene.closeBook(); },
    };
  }

  active() { return this.game.scene && this.game.scene.keeper === this; }

  // ---------------- entering a phase ----------------
  enter(name, args = {}) {
    const g = this.game;
    this.night = g.night;
    this.t = 0;
    if (name === 'logbook') {
      this.mode = args.mode || 'dusk';
      this.book.enter(this.mode);
      this.setLight(this.mode === 'dusk' ? 'dusk' : 'dawn');
      if (this.mode === 'dusk') {
        // the light has failed outside: you're back inside, a few steps from the table
        const p = this.roomPoint(200, 1.2);
        this.walker.place(p.x, TOWER.y, p.z);
        this.faceToward(this.bookCentre(), this.walker);
        this.walker.pitch = -0.25;
        this.setState('walk');
      } else {
        // dawn: back at the table; the book is already open at tonight's page
        this.applyPose(this.standPose());
        this.setState('lean-in');
      }
    }
  }

  setState(s) {
    this.state = s;
    this.st = 0;
    const walking = s === 'walk';
    this.walker.setEnabled(walking, { lock: !this.game.autoplay });
    this.book.open = s === 'lean';
    if (s === 'lean-in') this.blendTo(this.leanPose(), 1.25, () => this.setState('lean'));
    if (s === 'lean-out') this.blendTo(this.standPose(), 0.9, () => {
      const p = this.standPose();
      this.walker.place(p.pos.x, TOWER.y, p.pos.z, p.yaw, p.pitch);
      this.setState(this.after || 'walk');
      this.after = null;
    });
  }

  // ---------------- lighting by time of day ----------------
  setLight(tod) {
    const S = this.world.shared;
    const P = palette(tod === 'night' ? 'night' : tod === 'dawn' ? 'dawn' : tod === 'day' ? 'afternoon' : 'dusk', this.night.act >= 3 ? 0.4 : 0);
    const sunDir = new THREE.Vector3(-0.8, 0.22, 0.35).normalize();
    skyFromPalette(this.world.sky, P, { stars: tod === 'night' ? 1 : 0, sun: sunDir.clone().multiplyScalar(1) });
    S.uSunDir.value.copy(sunDir);
    const lamp = new THREE.Vector3();
    this.room.flame.getWorldPosition(lamp);
    S.uLampPos.value.copy(lamp);
    if (tod === 'dusk') {
      S.uSunAmt.value = 0.55; S.uAmbient.value = 0.3; S.uLampAmt.value = 1.1; S.uLampFall.value = 0.9; S.uRimAmt.value = 1;
      S.uLightTint.value.setRGB(1.0, 0.94, 0.86); S.uShadeTint.value.setRGB(0.6, 0.6, 0.78);
    } else if (tod === 'dawn') {
      S.uSunAmt.value = 0.6; S.uAmbient.value = 0.38; S.uLampAmt.value = 0.35; S.uLampFall.value = 1.2; S.uRimAmt.value = 0.3;
      S.uLightTint.value.setRGB(0.97, 0.97, 1.0); S.uShadeTint.value.setRGB(0.62, 0.66, 0.82);
    } else if (tod === 'night') {
      S.uSunAmt.value = 0.15; S.uAmbient.value = 0.16; S.uLampAmt.value = 1.2; S.uLampFall.value = 0.8; S.uRimAmt.value = 1.2;
      S.uLightTint.value.setRGB(0.8, 0.84, 1.0); S.uShadeTint.value.setRGB(0.45, 0.5, 0.75);
    } else {
      S.uSunAmt.value = 0.9; S.uAmbient.value = 0.42; S.uLampAmt.value = 0; S.uRimAmt.value = 0;
      S.uLightTint.value.setRGB(1, 0.98, 0.94); S.uShadeTint.value.setRGB(0.62, 0.66, 0.82);
    }
    S.uFogDensity.value = 0.0015 + (this.night.haar || 0) * 0.02;
    this.room.flame.visible = this.room.halo.visible = tod !== 'day';
    this.palette = P;
  }

  // ---------------- poses ----------------
  // a point in the room at polar angle (deg) and radius, in world space
  roomPoint(deg, r, y = 0) {
    return new THREE.Vector3(Math.sin(deg * DEG) * r, y, -Math.cos(deg * DEG) * r).applyMatrix4(this.room.group.matrixWorld);
  }

  bookCentre() { return this.book.single ? this.book.worldAt(430, 640) : this.book.worldAt(800, 480); }
  bookAxes() {
    const m = this.book.group.matrixWorld;
    const toward = new THREE.Vector3(0, 0, 1).transformDirection(m);   // toward the reader
    const right = new THREE.Vector3(1, 0, 0).transformDirection(m);
    return { toward, right };
  }

  faceToward(target, obj) {
    const eye = obj.pos ? obj.pos.clone() : new THREE.Vector3();
    eye.y += obj.eye || 0;
    const d = target.clone().sub(eye);
    obj.yaw = Math.atan2(-d.x, -d.z);
    obj.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }

  poseLooking(pos, target, fov = 62, roll = 0) {
    const d = target.clone().sub(pos);
    return { pos: pos.clone(), yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)), roll, fov };
  }

  standPose() {
    const C = this.bookCentre();
    const { toward } = this.bookAxes();
    const p = C.clone().addScaledVector(toward, 0.62);
    p.y = TOWER.y + 1.62;
    return this.poseLooking(p, C.clone().addScaledVector(toward, -0.1), 62);
  }

  // leaning over the book: it fills most of the screen, a little off-axis, the far edge of the table
  // and the lamp still in view. On a phone held upright the page is seen nearly flat-on.
  leanPose() {
    const C = this.bookCentre();
    const { toward, right } = this.bookAxes();
    const L = this.game.layers;
    const aspect = L.cssW / L.cssH;
    const portrait = aspect < 0.95;
    const fov = portrait ? 56 : 50;
    const elev = (portrait ? 80 : 56) * DEG;
    const tv = Math.tan(fov * DEG / 2), th = tv * aspect;
    const ex = this.book.extent();
    // the book takes about four fifths of the width (all of it on a phone); the near edge stays in view
    const dist = Math.max(ex.w * 0.5 / (th * (portrait ? 0.97 : 0.8)), ex.h * Math.sin(elev) * 0.5 / (tv * (portrait ? 0.9 : 0.7)));
    // off-axis: from a little right of the spine, turned a touch left so the lamp stands at the edge of view
    const pos = C.clone().addScaledVector(toward, Math.cos(elev) * dist).addScaledVector(right, portrait ? 0 : 0.05);
    pos.y += Math.sin(elev) * dist;
    const target = C.clone().addScaledVector(toward, portrait ? 0 : -0.06).addScaledVector(right, portrait ? 0 : -0.03);
    return this.poseLooking(pos, target, fov, portrait ? 0 : -0.03);
  }

  applyPose(p) {
    this.cam.pos.copy(p.pos); this.cam.yaw = p.yaw; this.cam.pitch = p.pitch; this.cam.roll = p.roll || 0; this.cam.fov = p.fov || 62;
  }

  // ease the camera from where it is to a pose; the path dips a little, as a body leans
  blendTo(to, dur, done, { dip = 0.06 } = {}) {
    this.blendT = { from: { pos: this.cam.pos.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch, roll: this.cam.roll, fov: this.cam.fov }, to, t: 0, dur, done, dip };
  }

  stepBlend(dt) {
    const b = this.blendT;
    if (!b) return;
    b.t = Math.min(1, b.t + dt / b.dur);
    const e = ease(b.t);
    const f = b.from, to = typeof b.to === 'function' ? b.to() : b.to;
    this.cam.pos.lerpVectors(f.pos, to.pos, e);
    this.cam.pos.y -= Math.sin(b.t * Math.PI) * b.dip;
    this.cam.yaw = f.yaw + wrapA(to.yaw - f.yaw) * e;
    this.cam.pitch = f.pitch + (to.pitch - f.pitch) * e;
    this.cam.roll = f.roll + ((to.roll || 0) - f.roll) * e;
    this.cam.fov = f.fov + ((to.fov || 62) - f.fov) * e;
    if (b.t >= 1) { this.blendT = null; b.done?.(); }
  }

  // ---------------- walking in the room ----------------
  collideRoom(p) {
    const l = p.clone().applyMatrix4(this.roomInv);
    const O = this.room.obstacles;
    for (const [cx, cz, r] of O.circles) {
      const dx = l.x - cx, dz = l.z - cz, d = Math.hypot(dx, dz);
      if (d < r + 0.25) { l.x = cx + dx / d * (r + 0.25); l.z = cz + dz / d * (r + 0.25); }
    }
    for (const b of O.boxes) {
      // into the box's frame
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const dx = l.x - b.x, dz = l.z - b.z;
      let u = dx * c - dz * s, v = dx * s + dz * c;
      const pu = b.hw + 0.22 - Math.abs(u), pv = b.hd + 0.22 - Math.abs(v);
      if (pu > 0 && pv > 0) {
        if (pu < pv) u = Math.sign(u) * (b.hw + 0.22); else v = Math.sign(v) * (b.hd + 0.22);
        l.x = b.x + u * c + v * s; l.z = b.z - u * s + v * c;
      }
    }
    let r = Math.hypot(l.x, l.z);
    const a = ((Math.atan2(l.x, -l.z) / DEG) + 360) % 360;
    const st = O.stairs;
    if (a > st.from && a < st.to && r > st.r0) { l.x *= st.r0 / r; l.z *= st.r0 / r; r = st.r0; }
    if (r > O.radius) { l.x *= O.radius / r; l.z *= O.radius / r; }
    p.copy(l.applyMatrix4(this.room.group.matrixWorld));
  }

  // what the keeper is looking at, close enough to use
  focus() {
    const C = this.bookCentre();
    const eye = this.cam.pos;
    const d = C.clone().sub(eye);
    const dist = d.length();
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.cam.pitch, this.cam.yaw, 0, 'YXZ'));
    const ang = Math.acos(clamp(d.normalize().dot(fwd), -1, 1));
    if (this.mode && dist < 1.9 && ang < 0.55) return 'book';
    return null;
  }

  use() {
    if (this.state !== 'walk') return;
    if (this.focus() === 'book') { this.walker.unlock(); this.setState('lean-in'); }
  }

  // ---------------- input ----------------
  ndc(e) {
    const r = this.game.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
  }

  pointer(kind, e) {
    if (!this.active()) return;
    if (this.state === 'walk' && kind === 'down' && e.pointerType !== 'touch' && this.walker.locked) { this.use(); return; }
    if (this.state === 'walk' && kind === 'down' && e.pointerType !== 'touch' && this.focus() === 'book' && !this.walker.wantLock) { this.use(); return; }
    if (this.state !== 'lean') return;
    const [nx, ny] = this.ndc(e);
    const hit = this.book.pick(nx, ny, this.world.camera);
    const bi = this.book.input;
    this.pointerNdc = [nx, ny];
    if (!hit) { if (kind === 'up') bi.pointerUp(-9999, -9999, e); return; }
    const [lx, ly] = hit;
    if (kind === 'down') bi.pointerDown(lx, ly, e);
    else if (kind === 'move') bi.pointerMove(lx, ly, e);
    else bi.pointerUp(lx, ly, e);
  }

  key(e) {
    if (!this.active()) return false;
    const k = e.key;
    if (this.state === 'walk' && (k === 'e' || k === 'E' || k === 'Enter' || k === ' ')) { this.use(); return true; }
    if (this.state === 'lean') {
      if (k === 'Escape' || k === 'q' || k === 'Q') { this.standUp(); return true; }
      // the logbook's own keys: arrows turn pages, ctrl-z takes back
      if (['ArrowLeft', 'ArrowRight'].includes(k) || ((k === 'z' || k === 'Z') && (e.metaKey || e.ctrlKey))) { this.book.input.keyDown(e); this.book.input.keys.delete(k); return true; }
    }
    return false;
  }

  standUp() {
    if (this.state !== 'lean' || this.book.scene.inking || this.mode !== 'dusk') return;
    this.setState('lean-out');
  }

  // ---------------- the plan is inked: sit up, light the lamp, go to the chair ----------------
  onInked(waypoints, meta) {
    this.pending = { waypoints, meta };
    this.after = 'light';
    this.setState('lean-out');
  }

  onBookClosed() {
    if (this.state === 'closing') return;
    this.setState('closing');
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game;
    this.t += dt; this.st += dt;
    this.book.update(dt, { redraw: this.state === 'lean' || this.state === 'lean-in' || this.state === 'closing' || this.state === 'lean-out' });
    this.book.setSingle(g.layers.cssW / g.layers.cssH < 0.95);

    switch (this.state) {
      case 'walk': {
        this.walker.update(dt, { collide: (p) => this.collideRoom(p) });
        const ep = this.walker.eyePose();
        this.cam.pos.copy(ep.pos); this.cam.yaw = ep.yaw; this.cam.pitch = ep.pitch; this.cam.roll = ep.roll;
        this.cam.fov += (62 - this.cam.fov) * Math.min(1, dt * 4);
        if (g.autoplay && this.st > 0.8) this.setState('lean-in');
        break;
      }
      case 'lean':
        // a breath: the view rises and settles
        if (!this.blendT) {
          const p = this.leanPose();
          this.applyPose(p);
          this.cam.pos.y += Math.sin(this.t * 1.3) * 0.0025;
          this.cam.pitch += Math.sin(this.t * 1.3 + 0.6) * 0.0016;
        }
        break;
      case 'light': {
        // turn to the lamp control at the wall, reach, pull it down; the light starts turning
        if (this.st < dt * 1.5) {
          const C = this.roomPoint(ROOM.control.deg, ROOM.R - 0.15, ROOM.control.h);
          const from = this.cam.pos.clone();
          const p = this.roomPoint(ROOM.control.deg + 4, ROOM.R - 1.0, 1.62);
          this.blendTo(this.poseLooking(p, C, 60), 1.1, null, { dip: 0.02 });
          this.lightFrom = from;
        }
        const k = smooth(1.3, 2.1, this.st);
        this.room.lever.rotation.x = 0.5 - k * 1.15;
        if (this.st > 1.7 && !this.lampLit) { this.lampLit = true; this.lit = 1; g.audio?.lampSwell?.(); }
        if (this.st > 3.0) this.setState('to-chair');
        break;
      }
      case 'to-chair': {
        if (this.st < dt * 1.5) {
          const seat = this.chairPose();
          this.blendTo(seat, 2.4, () => this.sitDown(), { dip: -0.04 });
        }
        break;
      }
      case 'closing': {
        const k = smooth(0.15, 1.1, this.st);
        this.book.setClosed(k);
        if (this.st > 0.2 && !this.closeSound) { this.closeSound = true; g.audio?.page?.(); }
        if (this.st > 1.5) {
          this.closeSound = false;
          this.setState('done');
          g.onDawnDone();
        }
        break;
      }
      default: break;
    }
    this.stepBlend(dt);
    this.lit = Math.max(0, this.lit - dt * 0.4);
    this.applyCamera();
    this.updateClock();
    this.updatePrompt(dt);
  }

  chairPose() {
    const c = this.room.chair;
    const seat = new THREE.Vector3(0, 1.14, 0.08).applyMatrix4(c.matrixWorld);
    const out = this.roomPoint(ROOM.window.deg, ROOM.R + 6, 0.6);
    return this.poseLooking(seat, out, 58);
  }

  sitDown() {
    const p = this.pending;
    this.pending = null;
    this.setState('chair');
    this.game.inkPlan(p.waypoints, p.meta);
  }

  applyCamera() {
    const c = this.world.camera, k = this.cam;
    c.position.copy(k.pos);
    c.rotation.set(k.pitch, k.yaw, k.roll, 'YXZ');
    if (Math.abs(c.fov - k.fov) > 0.01) { c.fov = k.fov; c.updateProjectionMatrix(); }
    c.updateMatrixWorld(true);
  }

  updateClock() {
    // the clock keeps the game's time of day (dusk ≈ 7, through the night to 6)
    const h = this.mode === 'dusk' ? 19.2 + this.t / 600 : 5.8 + this.t / 600;
    const r = this.room;
    r.hourHand.rotation.z = -((h % 12) / 12) * Math.PI * 2;
    r.minHand.rotation.z = -((h % 1)) * Math.PI * 2;
  }

  updatePrompt() {
    this.prompt = null;
    if (this.state === 'walk' && this.focus() === 'book') this.prompt = this.game.input.type === 'mouse' ? 'E — lean over the logbook' : 'tap — lean over the logbook';
    else if (this.state === 'walk' && this.st < 6 && this.mode === 'dusk') this.prompt = 'the logbook is open on the table';
    else if (this.state === 'lean' && this.mode === 'dusk' && !this.book.scene.inking) this.prompt = this.game.input.type === 'mouse' ? 'Esc — stand up' : null;
  }

  // ---------------- look + HUD ----------------
  look() {
    const n = this.night;
    const base = { ...n.look };
    base.fog = (n.look.fog || 0) * 0.85;
    if (this.mode === 'dusk' || this.mode === 'dawn') base.warmth = (n.look.warmth ?? 0.5) + (this.mode === 'dusk' ? 0.12 : -0.05);
    base.lightGain = 1;
    base.wobble = 2.2;
    return base;
  }

  cursor() {
    if (this.state === 'lean') return this.book.input.cursor() || this.book.scene.cursor() || 'default';
    return this.walker.locked ? 'none' : 'default';
  }

  hudActive() { return !!this.prompt || !!this.walker.stick; }

  drawHud(L) {
    this.walker.drawTouch(L);
    if (!this.prompt) return;
    const v = L.view;
    const x = (v.x0 + v.x1) / 2, y = v.y1 - 70;
    const w = measure(L.ink, this.prompt, 'keeper', 34);
    const a = this.state === 'walk' && this.focus() !== 'book' ? 0.6 * (1 - smooth(4, 6, this.st)) : 0.85;
    blob(L.paint, x, y - 12, w * 0.62 + 30, 30, '#F2EAD9', 0.75 * a, 3, 0.12);
    letter(L.ink, this.prompt, x, y, { hand: 'keeper', size: 34, align: 'center', alpha: a, color: '#2B2622' });
    // a small mark at the centre of the view while walking
    if (this.state === 'walk' && this.walker.locked) {
      L.ink.fillStyle = rgba('#2B2622', 0.4);
      L.ink.beginPath(); L.ink.arc((v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, 2.5, 0, Math.PI * 2); L.ink.fill();
    }
  }
}
