// The Keeper: the first-person game. One continuous world (watch room, tower, headland, bay) and one
// camera; the game's phase machine (main.js) still decides what happens when, and reaches this through
// thin per-phase wrappers registered under the old scene names (logbook, bay, daymap, vignette, finale).
// By day you walk out of the door and round the headland to a place; its vignette is read where you
// stand, then the light fails and the bloom brings you to the table at dusk. The finale's stairs are
// climbed here too, before the 2D last sunset takes over.
import * as THREE from 'three';
import { buildRoom, ROOM } from './room.js';
import { TOP } from './tower.js';
import { Book } from './book.js';
import { Walker } from './walker.js';
import { Hands, POSES, POSE_NAMES } from './hands.js';
import { inkwell } from './inkwell.js';
import { buildColliders } from './colliders.js';
import { TOWER, ROOM_YAW, UNIT } from './geo.js';
import { Bay, landHeight } from './bay.js';
import { Headland, DAY } from './headland.js';
import { NightWatch } from './night.js';
import { palette } from '../render/scenes/bay-paint.js';
import { fogColorFor } from '../render/scenes/bay.js';
import { letter, measure, block } from '../render/hand.js';
import { ARRIVAL, VIGNETTES, QUIET, PLACES } from '../data/story-village.js';
import { STAIRS, LANTERN } from '../data/story-end.js';
import { blob, rgba, smooth, clamp, lerp, inkLine, rng } from '../render/paint.js';

const DEG = Math.PI / 180;
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrapA = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
const DUSK_SUN = new THREE.Vector3(-0.8, 0.22, 0.35).normalize();
const DAWN_SUN = new THREE.Vector3(0.85, 0.1, -0.4).normalize();
// the celestial pole (north, 55° up): the stars wheel about it through the night
const POLE = new THREE.Vector3(0, Math.sin(55 * DEG), -Math.cos(55 * DEG));
const TIME_SCALES = [1, 2, 4, 0.5, 0.25];
// the door swings in this far (radians) when it's opened
const DOOR_OPEN = 1.65;
// seconds for the light to fail, once the afternoon is spent
const FAIL_DUR = 7;
// treads climbed in the finale: by the eighth the head is in the hatch, the lamp room's light above
// (any higher and it would come up through the empty space under the gallery floor)
const CLIMB = 8;
// walking in the watch room, the treads you can go up before your head is at the ceiling
const WALK_TREADS = 7;
// the climb on up the tower to the lantern, through the paper: fade out, a breath, fade in
const HOP = { out: 0.7, hold: 0.7, in: 1.1 };
// the clockwork, once wound: how long the lens turns (s) and how fast (rad/s, a turn in twenty seconds)
const LENS_RUN = 90, LENS_RATE = Math.PI * 2 / 20;

const hasReef = (n) => (n.anomalies || []).some((a) => a.type === 'newReef');

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

    // the bay below the window, from the chart
    this.bay = new Bay();
    W.scene.add(this.bay.group);
    this.bay.setNight(game.night);
    // nothing comes nearer the eye than the hands, so the depth buffer can spend itself on the distance
    W.camera.near = 0.06;
    W.camera.updateProjectionMatrix();
    this.watch = null;
    this.ray = new THREE.Raycaster();
    this.drawNote(true);

    // the logbook, open on the table
    this.book = new Book(game);
    const T = ROOM.table;
    this.book.group.position.set(0.02, T.h, 0.07);
    this.book.group.rotation.y = 0.04;
    this.room.table.add(this.book.group);
    this.book.group.updateMatrixWorld(true);
    this.book.intercept.inkPlan = (w, meta) => this.onInked(w, meta);
    this.book.intercept.onDawnDone = () => this.onBookClosed();

    // the keeper's forearms and hands
    this.hands = new Hands();
    W.scene.add(this.hands.group);
    this.buildDesk();
    // what the hands can touch (colliders.js), for their contact solver
    this.hands.attach(buildColliders(this));
    this.poseOverride = null;     // debug H cycles through the poses
    this.frames = {};
    this.tip = new THREE.Vector3();

    this.walker = new Walker(game);
    this.walker.onTap = () => this.use();
    this.walker.onStep = (speed) => this.footstep(speed);

    // the headland by day: the places, walking out of doors, the afternoon clock
    this.headland = new Headland(this);
    W.scene.add(this.headland.group);
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
    for (const name of ['logbook', 'bay', 'daymap', 'vignette']) this.wrappers[name] = this.wrap(name);
    this.wrappers.finale = this.wrapFinale(game.scenes.finale);
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
      // keeper to keeper, the camera simply carries on (no cross-fade) unless time has jumped
      seamless(args = {}) {
        if (name === 'logbook') return args.mode === 'dawn';
        if (name === 'bay') return args.mode === 'night';
        // walked into a place's trigger: read it where you stand
        return name === 'vignette' && k.mode === 'day' && args.place !== 'arrival';
      },
      get fleet() { return k.watch?.fleet; },
      get leaving() { return name === 'bay' ? (k.watch ? k.watch.leaving : k.leaving) : false; },
      set leaving(v) { if (k.watch) k.watch.leaving = v; else k.leaving = v; },
      // the day's place is read out of doors (audio.js asks which interior it is: none)
      kind: null,
      // debug N, and anything else that wants the day over now
      leave() { if (k.mode === 'day') k.toDusk(); },
    };
  }

  // The finale: the stairs are climbed in first person; the last sunset and the end card stay the 2D
  // FinaleScene's, so this wrapper hands over to it by part.
  wrapFinale(f2d) {
    const k = this;
    const stairs = () => k.finalePart === 'stairs';
    const w = {
      name: 'finale',
      get three() { return stairs(); },
      get keeper() { return stairs() ? k : null; },
      get safe() { return stairs() ? { w: 1600, h: 1000 } : f2d.safe; },
      get part() { return stairs() ? 'stairs' : f2d.part; },
      get leaving() { return stairs() ? k.leaving : f2d.leaving; },
      enter(args = {}) {
        k.finalePart = args.part || 'stairs';
        if (stairs()) k.enter('finale', args);
        else { k.game.audio?.setSpace?.('out'); f2d.enter(args); }
      },
      exit() { k.walker.setEnabled(false); },
      update(dt) { if (stairs()) k.update(dt); else f2d.update(dt); },
      draw(L) { if (stairs()) k.drawHud(L); else f2d.draw(L); },
      hudActive() { return stairs() && k.hudActive(); },
      look() { return stairs() ? k.look() : f2d.look(); },
      cursor() { return stairs() ? 'pointer' : f2d.cursor?.(); },
      paintRect(L) { return f2d.paintRect(L); },
      seamless() { return false; },
      tap() { if (stairs()) k.climb(); else f2d.tap(); },
    };
    // the 2D scene listens for keys only while it is the current scene; behind this wrapper it isn't
    this.game.input.on('key', (e) => {
      if (this.game.scene !== w || stairs()) return false;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') { f2d.tap(); return true; }
      return false;
    });
    return w;
  }

  active() { return this.game.scene && this.game.scene.keeper === this; }

  // ---------------- entering a phase ----------------
  enter(name, args = {}) {
    const g = this.game;
    this.night = g.night;
    this.t = 0;
    // every phase begins on the ground
    this.up = false; this.hop = null; this.scope = null; this.wind = null; this.caption = null;
    this.walker.hold = false; this.hands.visible = true;
    if (name === 'daymap') { this.startDay(false); return; }
    if (name === 'vignette') { this.enterPlace(args.place); return; }
    if (name === 'finale') { this.enterStairs(); return; }
    // every phase from dusk on is spent in the watch room, with the door shut
    this.endDay();
    if (name === 'logbook') {
      this.mode = args.mode || 'dusk';
      this.book.enter(this.mode);
      this.bookNight = this.night.id;
      this.setLight(this.mode === 'dusk' ? 'dusk' : 'dawn');
      if (this.mode === 'dusk') {
        this.resetDesk();
        this.leaving = false;
        this.bay.setNight(this.night);
        this.dawnShips = null; this.watch = null; this.lampLit = false;
        this.room.lever.rotation.x = 0.5;
        // the light has failed outside: you're back inside, a few steps from the table
        const p = this.roomPoint(200, 1.2);
        this.walker.place(p.x, TOWER.y, p.z);
        this.faceToward(this.bookCentre(), this.walker);
        this.walker.pitch = -0.25;
        this.setState('walk');
      } else if (this.state === 'dawn-chair' || this.state === 'chair') {
        // dawn: up out of the chair and over to the table; the book is open at tonight's page
        this.setState('rise');
      } else {
        this.applyPose(this.standPose());
        this.setState('lean-in');
      }
    }
    if (name === 'bay') {
      this.mode = args.mode || 'night';
      this.bay.setNight(this.night);
      this.leaving = false;
      this.sip = null; this.sips = 0;
      // straight to the night (debug): the book on the table is still open at this evening's page
      if (this.bookNight !== this.night.id) { this.book.enter('dusk'); this.bookNight = this.night.id; }
      if (this.state !== 'chair' && this.state !== 'dawn-chair') {
        // arriving straight at the night (debug, or a saved game): already in the chair, the lamp lit
        this.applyPose(this.chairPose());
        this.lampLit = true;
        this.room.lever.rotation.x = 0.5 - 1.15;
      }
      if (this.mode === 'night') {
        this.watch = new NightWatch(g, this.night, args.waypoints || []);
        this.bay.setShips(this.watch.fleet.ships);
        this.watch.setLapse(this.lapse ?? true);
        this.drawNote(this.watch.lapse);
        this.room.mug.userData.tea.position.y = 0.08;
        this.setState('chair');
      } else {
        this.watch = null;
        this.dawnShips = (g.lastResults || []).map((r, i) => ({
          pos: r.fate === 'home' ? [87.5 + i * 2.2, 8.2 + (i % 2) * 0.8] : (r.at || [50, 30]), dir: [0.3, -1],
          fade: r.fate === 'gone' ? 0 : 1, lantern: r.fate === 'home' ? 0.15 : 0.3, state: r.fate === 'struck' ? 'struck' : 'moored', size: r.size, wake: false,
        }));
        this.bay.setShips((g.lastResults || []).map((r) => ({ name: r.name, size: r.size })));
        if (hasReef(this.night)) this.bay.raiseReef('newrock', 1);
        this.setLight('dawn');
        this.dawnBeam = 0.6;
        this.setState('dawn-chair');
      }
    }
  }

  setState(s) {
    this.state = s;
    this.st = 0;
    const walking = s === 'walk' || s === 'fail', seated = s === 'chair' || s === 'dawn-chair';
    this.walker.setEnabled(walking || seated, { lock: walking && !this.game.autoplay });
    if (seated) { this.walker.yaw = this.cam.yaw; this.walker.pitch = this.cam.pitch; }
    this.book.open = s === 'lean';
    if (s === 'lean-in') this.blendTo(this.leanPose(), 1.25, () => this.setState('lean'));
    if (s === 'door') { this.doorBack = false; this.walker.autoTo = null; this.blendTo(this.doorPose(), 0.6, null, { dip: 0.02 }); }
    if (s === 'rise') this.blendTo(() => this.standPose(), 1.9, () => this.setState('lean-in'), { dip: -0.06 });
    if (s === 'lean-out') this.blendTo(this.standPose(), 0.9, () => {
      const p = this.standPose();
      this.walker.place(p.pos.x, TOWER.y, p.pos.z, p.yaw, p.pitch);
      this.setState(this.after || 'walk');
      this.after = null;
    });
  }

  // ---------------- lighting by time of day ----------------
  // Everything the light depends on, as one state, so a dusk can deepen into a night by mixing two.
  lightState(tod, haar = this.night.haar || 0, sunDir = null) {
    const n = this.night;
    const P = palette(tod === 'night' ? 'night' : tod === 'dawn' ? 'dawn' : tod === 'day' ? 'afternoon' : 'dusk', n.look?.cool || 0, !!n.goldenSunset && tod === 'dusk');
    const col = (h) => new THREE.Color(h);
    const L = {
      P, tod,
      top: col(P.skyTop), mid: col(P.skyMid), low: col(P.skyLow), hor: col(P.skyHor), cloud: col(P.cloud),
      seaNear: col(P.seaNear), seaMid: col(P.seaMid), seaFar: col(P.seaFar),
      sunCol: col(P.sun ? P.sun.c : '#E8ECF4'), sunGlow: P.sun ? 0.8 : 0, stars: 0,
      sunDir: (sunDir || (tod === 'dawn' ? DAWN_SUN : DUSK_SUN)).clone(),
    };
    const set = (sunAmt, ambient, lampAmt, lampFall, rim, lt, st) => Object.assign(L, { sunAmt, ambient, lampAmt, lampFall, rim, lightTint: new THREE.Color(...lt), shadeTint: new THREE.Color(...st) });
    if (tod === 'dusk') set(0.55, 0.3, 1.1, 0.9, 1, [1.0, 0.94, 0.86], [0.6, 0.6, 0.78]);
    else if (tod === 'dawn') set(0.6, 0.38, 0.35, 1.2, 0.3, [0.97, 0.97, 1.0], [0.62, 0.66, 0.82]);
    else if (tod === 'night') {
      set(0.2, 0.12, 1.25, 0.8, 1.2, [0.52, 0.58, 0.82], [0.3, 0.34, 0.56]);
      L.stars = 1 - Math.min(1, haar) * 0.85;
      L.sunGlow = 0;
    } else set(0.9, 0.42, 0, 0.35, 0, [1, 0.98, 0.94], [0.62, 0.66, 0.82]);
    // haar: the light goes grey and flat, the sun's warmth taken out of it
    if (haar > 0) {
      const h = Math.min(1, haar);
      L.lightTint.lerp(new THREE.Color(0.86, 0.88, 0.9), h * 0.7);
      L.shadeTint.lerp(new THREE.Color(0.68, 0.71, 0.77), h * 0.6);
      L.sunAmt *= 1 - 0.65 * h;
      L.ambient += 0.12 * h;
      L.rim *= 1 - 0.3 * h;
    }
    L.fogDensity = 0.0015 + haar * 0.02;
    return L;
  }

  mixLight(a, b, k) {
    const out = { ...b };
    for (const key of Object.keys(a)) {
      const va = a[key], vb = b[key];
      if (va instanceof THREE.Color) out[key] = va.clone().lerp(vb, k);
      else if (va instanceof THREE.Vector3) out[key] = va.clone().lerp(vb, k).normalize();
      else if (typeof va === 'number') out[key] = va + (vb - va) * k;
    }
    out.tod = k < 0.5 ? a.tod : b.tod;
    return out;
  }

  applyLight(L) {
    const S = this.world.shared, u = this.world.sky.material.uniforms;
    u.uTop.value.copy(L.top); u.uMid.value.copy(L.mid); u.uLow.value.copy(L.low); u.uHor.value.copy(L.hor); u.uCloud.value.copy(L.cloud);
    u.uStars.value = L.stars;
    u.uSunPos.value.copy(L.sunDir); u.uSunGlow.value = L.sunGlow; u.uSunCol.value.copy(L.sunCol);
    S.uSunDir.value.copy(L.sunDir);
    this.room.flame.getWorldPosition(S.uLampPos.value);
    S.uSunAmt.value = L.sunAmt; S.uAmbient.value = L.ambient; S.uLampAmt.value = L.lampAmt; S.uLampFall.value = L.lampFall; S.uRimAmt.value = L.rim;
    S.uLightTint.value.copy(L.lightTint); S.uShadeTint.value.copy(L.shadeTint);
    S.uFogDensity.value = L.fogDensity;
    S.uFogNear.value = 8;
    this.room.flame.visible = this.room.halo.visible = L.tod !== 'day';
    this.bay.setPalette(L);
    this.palette = L.P;
    this.light = L;
  }

  setLight(tod, haar = this.night.haar || 0) { this.applyLight(this.lightState(tod, haar)); }

  // where the moon is, p through the night: low on the right of the window, climbing across it
  moonAt(p) {
    const yaw = ROOM_YAW - lerp(0.05, 0.62, p);
    const el = lerp(0.03, 0.24, smooth(0, 0.6, p)) - smooth(0.75, 1, p) * 0.06;
    return new THREE.Vector3(-Math.sin(yaw) * Math.cos(el), Math.sin(el), -Math.cos(yaw) * Math.cos(el));
  }

  // ---------------- poses ----------------
  // a point in the room at polar angle (deg) and radius, in world space
  roomPoint(deg, r, y = 0) {
    return new THREE.Vector3(Math.sin(deg * DEG) * r, y, -Math.cos(deg * DEG) * r).applyMatrix4(this.room.group.matrixWorld);
  }

  bookCentre(single = this.book.single) { return single ? this.book.worldAt(430, 640, undefined, true) : this.book.worldAt(800, 480, undefined, false); }
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
  // (landscape: as it is on a landscape screen, the logbook open at two pages, whatever the screen is)
  leanPose(landscape = false) {
    const single = landscape ? false : this.book.single;
    const C = this.bookCentre(single);
    const { toward, right } = this.bookAxes();
    const L = this.game.layers;
    const aspect = landscape ? 1.6 : L.cssW / L.cssH;
    const portrait = aspect < 0.95;
    const fov = portrait ? 56 : 50;
    const elev = (portrait ? 80 : 56) * DEG;
    const tv = Math.tan(fov * DEG / 2), th = tv * aspect;
    const ex = this.book.extent(single);
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
    if (this.up) {
      this.collideTop(l, p.y - TOWER.y);
      p.copy(l.applyMatrix4(this.room.group.matrixWorld));
      return;
    }
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
    let a = ((Math.atan2(l.x, -l.z) / DEG) + 360) % 360;
    const st = O.stairs, S = ROOM.stairs;
    if (a > st.from && a < st.to && r > st.r0) {
      // The stairs: stepped onto at the foot, by the bottom tread, and climbed between the rail and
      // the wall as far as the tread where the head would meet the ceiling, and on from there up the
      // tower to the lantern. Anywhere else the flight is a wall, as it is to someone on the floor
      // beneath it.
      const foot = S.from + S.step * 0.5, top = S.from + S.step * (WALK_TREADS - 1 + 0.4);
      const up = p.y > TOWER.y + 0.1;
      if (a >= foot && up) {
        // on past the last tread you can stand on: on up the tower to the lamp
        if (a > top) this.hopTo('top');
        const rr = Math.max(r, S.r0 + 0.25), aa = Math.min(a, top) * DEG;
        l.x = Math.sin(aa) * rr; l.z = -Math.cos(aa) * rr; r = rr;
      } else if (a >= foot) { l.x *= st.r0 / r; l.z *= st.r0 / r; r = st.r0; }
    }
    if (r > O.radius) { l.x *= O.radius / r; l.z *= O.radius / r; }
    p.copy(l.applyMatrix4(this.room.group.matrixWorld));
  }

  // the floor underfoot in the watch room (world y): the boards, or the tread you stand on
  roomFloor(x, z) {
    const l = new THREE.Vector3(x, 0, z).applyMatrix4(this.roomInv);
    if (this.up) return TOWER.y + this.topFloor(l);
    const st = this.room.obstacles.stairs, S = ROOM.stairs;
    const a = ((Math.atan2(l.x, -l.z) / DEG) + 360) % 360;
    if (a <= st.from || a >= st.to || Math.hypot(l.x, l.z) <= S.r0) return TOWER.y;
    const i = clamp(Math.round((a - S.from) / S.step), 0, S.count - 1);
    return TOWER.y + (i + 1) * S.rise + 0.03;
  }

  // ---------------- the top of the tower ----------------
  // Walking on up past the last tread you can stand on goes on up the tower in the dark (a fade
  // through the paper) and out through the hatch into the lantern; the hatch takes you back down onto
  // the same tread. Up there: the lens and the clockwork that turns it, the door in the glazing and its
  // steps down to the gallery, the gallery right round, and the telescope at the seaward rail.
  // `this.up` is true while you're up there. Positions are in room space (the tower's).

  // a point in room space in the door's frame: along = out from the middle, side = across
  doorFrame(l) {
    const a = TOP.door.deg * DEG;
    return { along: l.x * Math.sin(a) - l.z * Math.cos(a), side: l.x * Math.cos(a) + l.z * Math.sin(a) };
  }
  fromDoorFrame(l, along, side) {
    const a = TOP.door.deg * DEG;
    l.x = Math.sin(a) * along + Math.cos(a) * side;
    l.z = -Math.cos(a) * along + Math.sin(a) * side;
  }

  // the floor up there (room y): the lantern's, the gallery deck's, or on the steps between
  topFloor(l) {
    const T = TOP, D = T.door, { along, side } = this.doorFrame(l);
    if (Math.abs(side) < D.half && along > T.glaze - 0.1 && along < D.foot + 0.1) return lerp(T.floor, T.deck, clamp((along - T.glaze) / (D.foot - T.glaze), 0, 1));
    return Math.hypot(l.x, l.z) < T.glaze + 0.05 ? T.floor : T.deck;
  }

  // l: where the walker wants to be (room space, corrected in place); y: the height it stands at now
  collideTop(l, y) {
    const T = TOP, D = T.door, lane = D.half - 0.14, wide = D.half + 0.2;
    const { along, side } = this.doorFrame(l);
    const toR = (r0, r1) => { const r = Math.hypot(l.x, l.z), rr = clamp(r, r0, r1); l.x *= rr / r; l.z *= rr / r; };
    const inLane = Math.abs(side) <= lane && along > 0;
    if (y > T.floor - 0.12) {
      // in the lantern: round the lens, inside the glass, out through the door
      if (!(inLane && along > T.glaze - 0.4)) toR(T.lensR + 0.25, T.glaze - 0.25);
      // round the clockwork's case and its crank
      const ca = T.crank.deg * DEG, cx = Math.sin(ca) * 0.95, cz = -Math.cos(ca) * 0.95;
      const ex = l.x - cx, ez = l.z - cz, e = Math.hypot(ex, ez);
      if (e < 0.5) { l.x = cx + ex / e * 0.5; l.z = cz + ez / e * 0.5; }
      // the hatch: step into it and you're on the stair down
      const H = T.hatch, a = (Math.atan2(l.x, -l.z) / DEG - H.deg) * DEG, r = Math.hypot(l.x, l.z);
      if (Math.abs(Math.sin(a) * r) < H.w / 2 - 0.12 && Math.abs(Math.cos(a) * r - H.r) < H.d / 2 && Math.cos(a) > 0) this.hopTo('room');
      return;
    }
    if (y > T.deck + 0.12) {
      // on the steps, between their rails
      this.fromDoorFrame(l, clamp(along, T.glaze - 0.3, D.foot + 0.1), clamp(side, -lane, lane));
      return;
    }
    // on the deck: between the lantern's foot and the rail, round the telescope, and onto the steps
    // only from the front
    if (inLane && along < D.foot + 0.2) return;
    if (along > 0 && along < D.foot + 0.1 && Math.abs(side) < wide) this.fromDoorFrame(l, along, Math.sign(side) * (Math.abs(side) < (lane + wide) / 2 ? lane : wide));
    toR(T.ped + 0.25, T.rail - 0.25);
    const sa = T.scope.deg * DEG, sx = Math.sin(sa) * T.scope.r, sz = -Math.cos(sa) * T.scope.r;
    const dx = l.x - sx, dz = l.z - sz, d = Math.hypot(dx, dz);
    if (d < 0.42) { l.x = sx + dx / d * 0.42; l.z = sz + dz / d * 0.42; }
  }

  onGallery() { return this.up && this.walker.pos.y < TOWER.y + TOP.deck + 0.5; }
  onStairs() { return !this.up && this.walker.pos.y > TOWER.y + 0.1; }

  hopTo(to) {
    if (this.hop || this.leaving) return;
    this.hop = { to, t: 0, n: 0, swapped: false };
    this.walker.hold = true;
  }

  updateHop(dt) {
    const h = this.hop;
    if (!h) return;
    h.t += dt;
    // footfalls on the stair in the dark
    const at = [0.2, 0.5, 0.8, 1.1, 1.4];
    while (h.n < at.length && h.t > at[h.n]) { this.game.audio?.stairStep?.(h.to === 'top' ? 3 + h.n : 7 - h.n); h.n++; }
    if (!h.swapped && h.t > HOP.out) { h.swapped = true; this.arriveAt(h.to); }
    if (h.t > HOP.out + HOP.hold + HOP.in) { this.hop = null; this.walker.hold = !!(this.scope || this.wind); }
  }

  hopFade() {
    const h = this.hop;
    return h ? smooth(0, HOP.out, h.t) * (1 - smooth(HOP.out + HOP.hold, HOP.out + HOP.hold + HOP.in, h.t)) : 0;
  }

  // out of the hatch into the lantern, or back down onto the top tread you can stand on
  arriveAt(to) {
    const w = this.walker, T = TOP;
    this.scope = null; this.wind = null;
    if (to === 'top') {
      this.up = true;
      const H = T.hatch, p = this.roomPoint(H.deg + 24, 1.42, T.floor);
      w.place(p.x, p.y, p.z);
      this.faceToward(this.roomPoint(H.deg + 62, 1.7, T.floor + 1.45), w);
      if (this.upDay !== this.night?.id) { this.upDay = this.night?.id; this.galleryLine = false; this.caption = { text: LANTERN.arrive, t: 0 }; }
    } else {
      this.up = false;
      const S = ROOM.stairs, a = S.from + S.step * (WALK_TREADS - 1.15), p = this.roomPoint(a, 2.75);
      w.place(p.x, this.roomFloor(p.x, p.z), p.z);
      this.faceToward(this.roomPoint(a - 45, 2.6, 0.6), w);
      w.pitch = -0.3;
    }
    this.camFromWalker();
    this.checkSpace();
  }

  // indoors or out, for the sound: by day the tower's wall, up top the lantern's glass
  checkSpace() {
    const w = this.walker;
    const inside = this.up ? !this.onGallery() : this.mode !== 'day' || this.headland.insideTower(w.pos.x, w.pos.z);
    if (inside !== this.inside) { this.inside = inside; this.game.audio?.setSpace?.(inside ? 'in' : 'out', true); }
    this.game.audio?.aloft?.(this.up ? (inside ? 0.4 : 1) : 0);
    if (this.onGallery() && !this.galleryLine) { this.galleryLine = true; this.caption = { text: LANTERN.gallery, t: 0 }; }
  }

  // where the clockwork's crank handle is, and the telescope's eyepiece (world space)
  crankAt() {
    this.room.crank.updateMatrixWorld();
    return new THREE.Vector3(0, TOP.crank.arm, -0.17).applyMatrix4(this.room.crank.matrixWorld);
  }
  scopeEye() { const S = TOP.scope; return this.roomPoint(S.deg, S.r - 0.46, TOP.deck + S.h + 0.03); }

  // wind the clockwork: three turns of the crank, a click of the ratchet with each sixth, then the
  // lens turns until it runs down
  startWind() {
    this.wind = { t: 0, clicks: 0 };
    this.walker.hold = true;
    this.game.audio?.soft?.();
  }

  // the telescope: the view narrows to the glass and can be turned a little along the bay
  lookThrough() {
    const S = TOP.scope, eye = this.scopeEye(), out = this.roomPoint(S.deg, S.r + 6, TOP.deck + S.h - 0.4);
    const d = out.sub(eye);
    this.scope = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
    this.walker.yaw = this.scope.yaw; this.walker.pitch = this.scope.pitch;
    this.walker.hold = true;
    this.game.audio?.soft?.();
  }

  leaveScope() {
    if (!this.scope) return;
    this.scope = null;
    this.walker.hold = !!(this.hop || this.wind);
    this.game.audio?.soft?.();
  }

  updateTop(dt) {
    const R = this.room;
    if (this.caption) { this.caption.t += dt; if (this.caption.t > 4) this.caption = null; }
    const W = this.wind;
    if (W) {
      W.t += dt;
      const turns = smooth(0.25, 2.7, W.t) * 3;
      R.crank.rotation.z = -turns * Math.PI * 2;
      const clicks = Math.floor(turns * 6);
      while (W.clicks < clicks) { W.clicks++; this.game.audio?.ratchet?.(); }
      if (W.t > 3) {
        this.wind = null;
        this.walker.hold = !!(this.hop || this.scope);
        if (!(this.lensRun > 0)) this.caption = { text: LANTERN.turning, t: 0 };
        this.lensRun = LENS_RUN;
      }
    }
    // the lens: away slowly as the weight starts down, and slowing as it runs out
    if (this.lensRun > 0) {
      this.lensRun = Math.max(0, this.lensRun - dt);
      R.lens.rotation.y -= dt * LENS_RATE * smooth(0, 5, LENS_RUN - this.lensRun) * smooth(0, 12, this.lensRun);
    }
    if (this.scope) {
      const w = this.walker, S = this.scope;
      w.yaw = S.yaw + clamp(wrapA(w.yaw - S.yaw), -1.1, 1.1);
      w.pitch = clamp(w.pitch, S.pitch - 0.35, S.pitch + 0.25);
      // the view from past the telescope's own end, so the tube isn't in it
      const cp = Math.cos(w.pitch);
      this.cam.pos.copy(this.scopeEye()).add(new THREE.Vector3(-Math.sin(w.yaw) * cp, Math.sin(w.pitch), -Math.cos(w.yaw) * cp).multiplyScalar(1.1));
      this.cam.yaw = w.yaw; this.cam.pitch = w.pitch; this.cam.roll = 0;
      this.cam.fov += (9 - this.cam.fov) * Math.min(1, dt * 5);
    }
    this.hands.visible = !this.scope;
  }

  // the telescope's view: dark all round a round field, its edge a little soft
  drawScope(L) {
    const v = L.view, c = L.paint, cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    const r = Math.min(v.x1 - v.x0, v.y1 - v.y0) * 0.44;
    c.save();
    c.fillStyle = 'rgba(30,26,24,0.96)';
    c.beginPath(); c.rect(v.x0 - 400, v.y0 - 400, v.x1 - v.x0 + 800, v.y1 - v.y0 + 800); c.arc(cx, cy, r, 0, Math.PI * 2, true); c.fill('evenodd');
    const g = c.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
    g.addColorStop(0, 'rgba(30,26,24,0)'); g.addColorStop(1, 'rgba(30,26,24,0.85)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // the climb in the dark: the view goes back into the paper and comes out of it up top (or below)
  drawHop(L) {
    const k = this.hopFade();
    if (k <= 0) return;
    const v = L.view, c = L.paint;
    c.fillStyle = rgba('#EFE6D2', k);
    c.fillRect(v.x0 - 400, v.y0 - 400, v.x1 - v.x0 + 800, v.y1 - v.y0 + 800);
  }

  drawCaption(L) {
    const C = this.caption, v = L.view;
    const a = 0.75 * smooth(0.3, 1.1, C.t) * (1 - smooth(3, 4, C.t));
    letter(L.ink, C.text, (v.x0 + v.x1) / 2, v.y0 + 120, { hand: 'keeper', size: 40, align: 'center', alpha: a, color: '#2B2622', drift: this.night?.drift || 0, seed: 5 });
  }

  // ---------------- the day ----------------
  // The afternoon begins in the watch room with the door shut (time has jumped since dawn); the arrival
  // begins out on the lane, walking up to the tower with the door standing open.
  startDay(arrival) {
    const H = this.headland, n = this.night;
    this.mode = 'day';
    this.arrival = arrival;
    this.watch = null; this.dawnShips = null; this.lampLit = false; this.leaving = false;
    this.bay.setNight(n);
    this.bay.setLights(n, false);
    this.room.lever.rotation.x = 0.5;
    // the logbook lies shut on the table, as it was left at dawn
    if (this.bookNight !== n.id) { this.book.enter('dusk'); this.bookNight = n.id; }
    this.book.setClosed(1);
    H.group.visible = true;
    H.hour = arrival ? 18.1 : DAY.from;
    H.pace = 1;
    this.dayVisited = false;
    this.reading = null;
    this.note = null;
    this.auto = null;
    this.setDoor(arrival ? DOOR_OPEN : 0);
    if (arrival) {
      // on the lane, about fifty metres east, the tower ahead
      const p = new THREE.Vector3(24 * UNIT, 0, 60.45 * UNIT);
      this.walker.place(p.x, this.bay.groundAt(p.x, p.z), p.z);
      this.faceToward(TOWER.clone().setY(TOWER.y + 3), this.walker);
      this.walker.pitch = 0.02;
    } else {
      const p = this.roomPoint(250, 1.0);
      this.walker.place(p.x, TOWER.y, p.z);
      this.faceToward(this.roomPoint(ROOM.door.deg, ROOM.R, 1.4), this.walker);
      this.walker.pitch = -0.05;
    }
    this.walker.speedScale = 1;
    H.resetTriggers(this.walker.pos);
    this.inside = null;
    this.lightKey = null;
    this.dayLight();
    this.setState('walk');
    this.camFromWalker();
  }

  camFromWalker() {
    const ep = this.walker.eyePose();
    this.cam.pos.copy(ep.pos); this.cam.yaw = ep.yaw; this.cam.pitch = ep.pitch; this.cam.roll = ep.roll; this.cam.fov = 62;
    this.blendT = null;
    this.applyCamera();
  }

  // walked into a place (or the arrival): its lines over a soft paper panel, read where you stand
  enterPlace(place) {
    // the arrival always begins out on the lane; any other place is read where the walk brought you
    if (place === 'arrival') this.startDay(true);
    else if (this.mode !== 'day') this.startDay(false);
    const n = this.night;
    let v;
    if (place === 'arrival') v = ARRIVAL;
    else v = VIGNETTES[n.id]?.[place];
    if (!v) {
      const act = Math.min(3, Math.max(1, n.act));
      const pool = QUIET[place] || QUIET.lighthouse;
      v = { title: PLACES[place]?.label || place, lines: pool[act] || pool[3] || pool[1] || ['It is quiet.'] };
    }
    this.reading = {
      place, title: v.title, t: 0, shown: 1, lineT: 0,
      lines: v.lines.map((l) => (typeof l === 'string' ? { who: null, text: l } : { who: l[0], text: l[1] })),
    };
    this.walker.autoTo = null;
    this.auto = null;
    if (this.state === 'walk') this.camFromWalker();
    this.setState('read');
  }

  readDur(l) { return 0.4 + l.text.length / 38; }

  // click, tap, Space or E: finish the line being written, or the next line, or done
  advanceRead() {
    const R = this.reading;
    if (!R || this.state !== 'read' || R.t < 0.3) return;
    const cur = R.lines[R.shown - 1];
    if (R.lineT < this.readDur(cur)) { R.lineT = this.readDur(cur); return; }
    if (R.shown < R.lines.length) { R.shown++; R.lineT = 0; this.game.audio?.soft?.(); return; }
    this.game.audio?.page?.();
    this.reading = null;
    this.dayVisited = true;
    // the arrival: walk the rest of the way in; any other day, the afternoon is spent
    if (this.arrival) this.setState('walk'); else this.startFail();
  }

  // the light fails: the hour runs on to seven, then the bloom to the table at dusk
  startFail() {
    if (this.state === 'fail') return;
    this.failFrom = this.headland.hour;
    this.walker.autoTo = null;
    this.setState('fail');
  }

  toDusk() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.toDusk();
  }

  // leaving the day for the watch room: the door shut behind you, the places put away
  endDay() {
    if (this.mode === 'day' || this.headland.group.visible) {
      this.headland.group.visible = false;
      this.setDoor(0);
      this.walker.speedScale = 1;
      this.walker.autoTo = null;
      this.reading = null;
    }
    this.game.audio?.setSpace?.('in');
    this.inside = true;
    this.room.hatchGlow.visible = false;
  }

  setDoor(a) { this.room.door.swing.rotation.y = -a; this.room.door.swing.updateMatrixWorld(true); }
  doorOpen() { return -this.room.door.swing.rotation.y > 1.2; }

  // the sun and the light for the hour: afternoon, then from half five mixing toward dusk. The sea is
  // repainted with the light, so it is only recomputed every few game minutes.
  dayLight() {
    const h = this.headland.hour, key = Math.floor(h * 12);
    if (key === this.lightKey) return;
    this.lightKey = key;
    const haar = this.night.haar || 0, sun = this.headland.sunDir(h, DUSK_SUN);
    const k = smooth(DAY.dusk, DAY.to, h);
    const day = this.lightState('day', haar, sun);
    this.applyLight(k > 0 ? this.mixLight(day, this.lightState('dusk', haar, sun), k) : day);
  }

  // walking by day: indoors and out, the pace, the clock, the triggers
  updateDay(dt) {
    const g = this.game, H = this.headland, w = this.walker;
    w.speedScale = H.updatePace(w.pos, dt);
    if (g.autoplay) this.autoDay(dt);
    w.update(dt, { collide: (p) => H.collide(p, w.pos), ground: (x, z) => H.ground(x, z) });
    const ep = w.eyePose();
    this.cam.pos.copy(ep.pos); this.cam.yaw = ep.yaw; this.cam.pitch = ep.pitch; this.cam.roll = ep.roll;
    // at the time-lapse pace the view opens a little, as it does when you stride out
    this.cam.fov += (62 + (w.speedScale - 1) * 1.6 - this.cam.fov) * Math.min(1, dt * 4);
    // through the door: the room's sound, or the open air's
    const inside = H.insideTower(w.pos.x, w.pos.z);
    this.checkSpace();
    const hit = H.triggers(w.pos);
    if (this.state === 'fail') {
      // the light fails wherever you are, but the bloom to the table waits till you're back down
      if (this.up || this.onStairs()) this.st = Math.min(this.st, FAIL_DUR);
      this.headland.hour = lerp(this.failFrom, DAY.to, smooth(0, FAIL_DUR, this.st));
      if (this.st > FAIL_DUR + 0.3) this.toDusk();
    } else {
      // the clock runs on with the pace, though not as fast as the stride grows, so the far end of the
      // lane can still be reached before the light goes
      H.hour += dt * DAY.rate * Math.sqrt(w.speedScale);
      if (H.hour >= DAY.to) this.startFail();
      else if (this.arrival && this.dayVisited && inside) this.startFail();
      else if (hit && !this.arrival && !this.dayVisited) {
        if (!(this.night.day.places || []).includes(hit.id)) this.note = { text: 'nobody about today', t: 0 };
        else { this.dayVisited = true; w.autoTo = null; hit.P.onEnter(g); }
      }
    }
    this.dayLight();
  }

  // autoplay by day: out of the door and along the lane to the night's place (or, arriving, in at the door)
  autoDay(dt) {
    const H = this.headland, w = this.walker, R = ROOM;
    if (this.state !== 'walk') { w.autoTo = null; return; }
    if (!this.auto) {
      const inT = H.insideTower(w.pos.x, w.pos.z);
      const front = this.roomPoint(R.door.deg, R.R - 0.95), doorIn = this.roomPoint(R.door.deg, R.R - 0.3), doorOut = this.roomPoint(R.door.deg, R.R + R.wall + 1.2);
      if (this.arrival) {
        if (!this.dayVisited) return;
        this.auto = { pts: [doorOut, doorIn, this.roomPoint(250, 1.0)] };
      } else if (this.dayVisited) return;
      else if (inT && !this.doorOpen()) this.auto = { pts: [front], then: () => this.setState('door') };
      else if (inT) this.auto = { pts: [doorIn, doorOut] };
      else {
        const n = this.night, focus = n.day.focus || (n.day.places || [])[0] || 'lighthouse';
        this.auto = { pts: H.route(w.pos, focus) };
      }
      this.auto.stuck = 0;
    }
    const A = this.auto;
    const tgt = A.pts[0];
    if (!tgt) { w.autoTo = null; this.auto = null; A.then?.(); return; }
    const d = Math.hypot(tgt.x - w.pos.x, tgt.z - w.pos.z);
    const sp = Math.hypot(w.vel.x, w.vel.y);
    A.stuck = sp < 0.3 ? A.stuck + dt : 0;
    if (d < Math.max(0.35, sp * dt * 2.5) || A.stuck > 2.5) { A.pts.shift(); A.stuck = 0; }
    w.autoTo = A.pts[0] || null;
    if (!w.autoTo) { this.auto = null; A.then?.(); }
  }

  // the door: take the ring, pull it in, stand back as it swings past
  updateDoor() {
    // the hand takes the ring first, then pulls as the keeper steps back
    this.setDoor(DOOR_OPEN * ease(smooth(0.85, 2.05, this.st)));
    if (this.st > 0.85 && !this.doorBack) {
      this.doorBack = true;
      this.game.audio?.door?.();
      this.blendTo(this.doorBackPose(), 1.2, null, { dip: 0 });
    }
    if (this.st > 2.15 && !this.blendT) {
      this.doorBack = false;
      this.walker.place(this.cam.pos.x, TOWER.y, this.cam.pos.z, this.cam.yaw, this.cam.pitch);
      this.setState('walk');
    }
  }

  // standing back on the latch side, well clear of the door's swing, looking out through the doorway
  doorBackPose() {
    const piv = this.room.door.pivot, D = ROOM.door;
    piv.updateWorldMatrix(true, false);
    const hinge = new THREE.Vector3().setFromMatrixPosition(piv.matrixWorld);
    const along = new THREE.Vector3(1, 0, 0).transformDirection(piv.matrixWorld);     // hinge → latch
    const inward = new THREE.Vector3(0, 0, 1).transformDirection(piv.matrixWorld);    // into the room
    const eye = hinge.clone().addScaledVector(along, 0.72).addScaledVector(inward, 1.3);
    eye.y = TOWER.y + 1.62;
    const out = hinge.clone().addScaledVector(along, D.half).addScaledVector(inward, -3);
    out.y = TOWER.y + 1.4;
    return this.poseLooking(eye, out, 62);
  }

  // footsteps: wood indoors, stone at the door and the slip, gravel on the lane, grass elsewhere
  footstep(speed) {
    const a = this.game.audio;
    if (!a?.footstep) return;
    const surf = this.up ? 'stone' : this.mode === 'day' ? this.headland.surface(this.walker.pos) : 'wood';
    a.footstep(surf, Math.min(1, speed / 3));
  }

  // ---------------- the finale: the stairs ----------------
  enterStairs() {
    const n = this.night;
    this.endDay();
    this.mode = 'stairs';
    this.watch = null; this.dawnShips = null; this.leaving = false;
    this.bay.setNight(n);
    this.setLight('dusk');
    this.lampLit = true;
    // the logbook shut on the table, its last page written
    if (this.bookNight !== n.id) { this.book.enter('dawn'); this.bookNight = n.id; }
    this.book.setClosed(1);
    this.stair = -1;       // on the floor at the foot of the stairs
    this.climbT = -9;      // when the last tread was taken
    this.room.hatchGlow.visible = true;
    this.applyPose(this.stairPose(-1));
    this.blendT = null;
    this.setState('stairs');
    this.applyCamera();
  }

  // standing on tread i (-1 the floor), leaning into the climb over the next tread, the rail in hand a
  // tread further on (as the hands review holds it), looking on round the turn; near the top, up into
  // the hatch and the light
  stairPose(i) {
    const st = ROOM.stairs, rm = (st.r0 + ROOM.R) / 2;
    const a = st.from + (i + 1) * st.step;
    const eye = this.roomPoint(a, rm, (i + 1) * st.rise + 1.62);
    const ahead = this.roomPoint(a + 25, rm - 0.2, (i + 3) * st.rise + 1.3 + smooth(CLIMB - 3, CLIMB - 1, i) * 1.2);
    return this.poseLooking(eye, ahead, 62);
  }

  // one tread per click, tap, Space or ↑, with a pause between, as before
  climb() {
    if (this.state !== 'stairs' || this.stair >= CLIMB - 1) return;
    if (this.st - this.climbT < 0.55) return;
    this.climbT = this.st;
    this.stair++;
    this.game.audio?.stairStep?.(this.stair);
    this.blendTo(this.stairPose(this.stair), 0.55, null, { dip: -0.05 });
  }

  updateStairs() {
    const g = this.game;
    if (g.autoplay && this.st - this.climbT > 0.9 && this.st > 1.5) this.climb();
    this.railStep = this.stair + 2;
    if (this.stair >= CLIMB - 1 && this.st - this.climbT > 2 && !this.leaving) {
      this.leaving = true;
      g.go('finale', { part: 'sunset' }, { duration: 3.2, center: [0.5, 0.15] });
    }
  }

  // what the keeper is looking at, close enough to use
  focus() {
    const C = this.bookCentre();
    const eye = this.cam.pos;
    const d = C.clone().sub(eye);
    const dist = d.length();
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.cam.pitch, this.cam.yaw, 0, 'YXZ'));
    const ang = Math.acos(clamp(d.normalize().dot(fwd), -1, 1));
    if (this.up) {
      // up top: the clockwork's crank, and the telescope
      const near = (p, far, wide) => { const v = p.sub(eye), dd = v.length(); return dd < far && Math.acos(clamp(v.normalize().dot(fwd), -1, 1)) < wide; };
      if (!this.wind && !this.onGallery() && near(this.crankAt(), 2.0, 0.6)) return 'crank';
      if (this.onGallery() && near(this.scopeEye(), 1.5, 0.8)) return 'scope';
      return null;
    }
    if (this.mode && dist < 1.9 && ang < 0.55) return 'book';
    // by day, the door when it's shut and within reach
    if (this.mode === 'day' && !this.doorOpen()) {
      const ring = this.room.door.ring.getWorldPosition(new THREE.Vector3()).sub(eye);
      const rd = ring.length();
      if (rd < 1.8 && Math.acos(clamp(ring.normalize().dot(fwd), -1, 1)) < 0.7) return 'door';
    }
    return null;
  }

  use() {
    if (this.scope) { this.leaveScope(); return; }
    if (this.state !== 'walk' && !(this.state === 'fail' && this.up)) return;
    if (this.hop || this.wind) return;
    const f = this.focus();
    if (f === 'crank') { this.startWind(); return; }
    if (f === 'scope') { this.lookThrough(); return; }
    if (f === 'door') { this.setState('door'); return; }
    // by day, the table means waiting there for dusk
    if (f === 'book' && this.mode === 'day') { this.startFail(); return; }
    if (f === 'book') { this.walker.unlock(); this.setState('lean-in'); }
  }

  // ---------------- input ----------------
  ndc(e) {
    const r = this.game.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
  }

  pointer(kind, e) {
    if (!this.active()) return;
    if (this.fly) {
      if (kind === 'down') this.flyDrag = { x: e.clientX, y: e.clientY };
      else if (kind === 'move' && this.flyDrag) {
        this.fly.yaw -= (e.clientX - this.flyDrag.x) * 0.004;
        this.fly.pitch = clamp(this.fly.pitch - (e.clientY - this.flyDrag.y) * 0.004, -1.5, 1.5);
        this.flyDrag = { x: e.clientX, y: e.clientY };
      } else if (kind === 'up') this.flyDrag = null;
      return;
    }
    if (this.state === 'chair' || this.state === 'dawn-chair') {
      if (kind === 'down') this.press = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (kind === 'move' && e.pointerType === 'mouse' && this.watch) {
        const [nx, ny] = this.ndc(e);
        this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.world.camera);
        this.noteHover = this.ray.intersectObject(this.room.sill.note, true).length > 0;
      }
      if (kind === 'up' && this.press) {
        const p = this.press;
        this.press = null;
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 9 && performance.now() - p.t < 450) {
          if (this.state === 'dawn-chair') this.toLogbook();
          else this.clickChair(e);
        }
      }
      return;
    }
    if (this.state === 'read' && kind === 'down') { this.advanceRead(); return; }
    if (this.state === 'stairs' && kind === 'down') { this.climb(); return; }
    const walking = this.state === 'walk' || (this.state === 'fail' && this.up);
    if (walking && kind === 'down' && e.pointerType !== 'touch' && this.walker.locked) { this.use(); return; }
    if (walking && kind === 'down' && e.pointerType !== 'touch' && (this.focus() || this.scope) && !this.walker.wantLock) { this.use(); return; }
    if (this.state !== 'lean') return;
    const [nx, ny] = this.ndc(e);
    const hit = this.book.pick(nx, ny, this.world.camera);
    const bi = this.book.input;
    this.pointerNdc = [nx, ny];
    if (!hit) { this.pointerOnPage = false; if (kind === 'up') bi.pointerUp(-9999, -9999, e); return; }
    const [lx, ly, onPage] = hit;
    this.pointerOnPage = onPage && e.pointerType !== 'touch' || (onPage && this.book.input.down);
    if (kind === 'down') bi.pointerDown(lx, ly, e);
    else if (kind === 'move') bi.pointerMove(lx, ly, e);
    else bi.pointerUp(lx, ly, e);
  }

  key(e) {
    if (!this.active()) return false;
    const k = e.key;
    if (this.game.debug && (k === 'h' || k === 'H') && !e.metaKey && !e.ctrlKey) {
      const i = this.poseOverride ? POSE_NAMES.indexOf(this.poseOverride) + 1 : 0;
      this.poseOverride = i < POSE_NAMES.length ? POSE_NAMES[i] : null;
      this.flash = { text: this.poseOverride ? 'hands: ' + this.poseOverride : 'hands: by the moment', t: 0 };
      return true;
    }
    if (this.game.debug && !e.metaKey && !e.ctrlKey) {
      if (k === 'c' || k === 'C') { this.toggleFly(); return true; }
      if (k === 't' || k === 'T') {
        const g = this.game, i = TIME_SCALES.indexOf(g.timeScale);
        g.timeScale = TIME_SCALES[(i + 1) % TIME_SCALES.length];
        this.flash = { text: 'time ×' + g.timeScale, t: 0 };
        return true;
      }
      if (this.fly && 'wWaAsSdDeEqQ'.includes(k)) return true;
    }
    if (this.state === 'chair' && this.watch && (k === ' ' || k === 'l' || k === 'L')) { this.toggleLapse(); return true; }
    if (this.state === 'dawn-chair' && (k === 'e' || k === 'E' || k === 'Enter' || k === ' ')) { this.toLogbook(); return true; }
    if (this.scope && (k === 'Escape' || k === 'q' || k === 'Q')) { this.leaveScope(); return true; }
    if ((this.state === 'walk' || (this.state === 'fail' && this.up)) && (k === 'e' || k === 'E' || k === 'Enter' || k === ' ')) { this.use(); return true; }
    if (this.state === 'read' && (k === 'e' || k === 'E' || k === 'Enter' || k === ' ')) { this.advanceRead(); return true; }
    if (this.state === 'stairs' && (k === ' ' || k === 'Enter' || k === 'ArrowUp')) { this.climb(); return true; }
    if (this.state === 'lean') {
      if (k === 'Escape' || k === 'q' || k === 'Q') { this.standUp(); return true; }
      // the logbook's own keys: arrows turn pages, ctrl-z takes back
      if (['ArrowLeft', 'ArrowRight'].includes(k) || ((k === 'z' || k === 'Z') && (e.metaKey || e.ctrlKey))) { this.book.input.keyDown(e); this.book.input.keys.delete(k.length === 1 ? k.toLowerCase() : k); return true; }
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
    // the quill goes back in the well before the keeper straightens up
    if (this.ink) this.inkThen = true;
    else this.setState('lean-out');
  }

  onBookClosed() {
    if (this.state === 'closing') return;
    this.setState('closing');
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game;
    this.t += dt; this.st += dt;
    // a held page turn (the hands review) stays mid-air
    const fa = this.book.scene.flipAnim;
    if (this.state === 'review' && fa?.hold) fa.t = 0.42 - dt / 0.55;
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 2.2) this.flash = null; }
    if (this.note) { this.note.t += dt; if (this.note.t > 3) this.note = null; }
    this.book.update(dt, { redraw: this.state === 'lean' || this.state === 'lean-in' || this.state === 'closing' || this.state === 'lean-out' });
    this.book.setSingle(g.layers.cssW / g.layers.cssH < 0.95);

    this.updateHop(dt);
    switch (this.state) {
      case 'fail':
        this.updateDay(dt);
        break;
      case 'door':
        this.updateDoor();
        break;
      case 'read':
        this.reading.t += dt; this.reading.lineT += dt;
        if (g.autoplay && this.reading.t > 0.4) {
          this.autoT = (this.autoT || 0) + dt;
          if (this.autoT > 0.25) { this.autoT = 0; this.reading.lineT = 99; this.advanceRead(); }
        }
        break;
      case 'stairs':
        this.updateStairs();
        break;
      case 'walk': {
        if (this.mode === 'day') { this.updateDay(dt); break; }
        this.walker.update(dt, { collide: (p) => this.collideRoom(p), ground: (x, z) => this.roomFloor(x, z) });
        this.checkSpace();
        const ep = this.walker.eyePose();
        this.cam.pos.copy(ep.pos); this.cam.yaw = ep.yaw; this.cam.pitch = ep.pitch; this.cam.roll = ep.roll;
        this.cam.fov += (62 - this.cam.fov) * Math.min(1, dt * 4);
        if (g.autoplay && this.st > 0.8 && !this.up) this.setState('lean-in');
        break;
      }
      case 'lean':
        // a breath: the view rises and settles
        if (!this.blendT) {
          const p = this.leanPose();
          // fetching the ink, the head turns to the inkwell (and back to the line to draw it)
          const fetch = this.ink && this.ink.step < 7 ? 1 : 0;
          this.inkLook = (this.inkLook || 0) + (fetch - (this.inkLook || 0)) * Math.min(1, dt * 2.5);
          if (this.inkLook > 0.001) {
            const w = this.well.getWorldPosition(new THREE.Vector3()).sub(p.pos);
            const yaw = Math.atan2(-w.x, -w.z), pitch = Math.atan2(w.y, Math.hypot(w.x, w.z));
            const k = ease(this.inkLook) * 0.5;
            p.yaw += wrapA(yaw - p.yaw) * k;
            p.pitch += (pitch - p.pitch) * k;
          }
          this.applyPose(p);
          this.cam.pos.y += Math.sin(this.t * 1.3) * 0.0025;
          this.cam.pitch += Math.sin(this.t * 1.3 + 0.6) * 0.0016;
        }
        break;
      case 'light': {
        // turn to the lamp control at the wall, reach, pull it down; the light starts turning
        if (this.st < dt * 1.5) {
          const from = this.cam.pos.clone();
          this.blendTo(this.lampPose(), 1.1, null, { dip: 0.02 });
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
      case 'chair':
      case 'dawn-chair':
        this.chairLook(dt);
        if (this.state === 'chair' && this.watch) this.updateNight(dt);
        if (this.state === 'dawn-chair') {
          this.dawnBeam += dt * 0.2;
          if (g.autoplay && this.st > 1.5) this.toLogbook();
        }
        break;
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
    this.updateTop(dt);
    this.stepBlend(dt);
    this.lit = Math.max(0, this.lit - dt * 0.4);
    if (this.fly) this.flyCam(dt);
    this.applyCamera();
    // what moves in the places by day (Nora, the shop bell); they watch the keeper, not the free-fly camera
    if (this.mode === 'day' && this.headland.group.visible) {
      this.headland.update(dt, { night: this.night, eye: this.walker.eyePose().pos, reading: this.reading, audio: g.audio });
    }
    this.updateHands(dt);
    this.updateClock();
    this.bay.update(dt, this.world.camera, this.bayView());
    this.updatePrompt(dt);
  }

  // ---------------- the chair ----------------
  // sitting, the view can be turned a little (drag, or the arrow keys), but the body stays put
  chairLook(dt) {
    const base = this.chairPose(), w = this.walker, k = this.game.input.keys;
    if (!this.fly) {
      const ax = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
      const ay = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
      w.yaw += ax * dt * 0.9; w.pitch += ay * dt * 0.6;
    }
    w.yaw = base.yaw + clamp(wrapA(w.yaw - base.yaw), -0.8, 0.8);
    w.pitch = clamp(w.pitch, base.pitch - 0.3, base.pitch + 0.42);
    if (this.blendT) return;
    this.cam.pos.copy(base.pos);
    this.cam.pos.y += Math.sin(this.t * 1.1) * 0.003;
    this.cam.yaw = w.yaw; this.cam.pitch = w.pitch + Math.sin(this.t * 1.1 + 0.7) * 0.0012; this.cam.roll = 0;
    this.cam.fov = base.fov;
  }

  updateNight(dt) {
    const W = this.watch, n = this.night;
    W.update(dt);
    if (this.watch !== W) return;   // the night ended in that update: it's dawn now
    const p = this.nightP = W.progress();
    // the dusk deepens into night over the first moments in the chair
    const k = this.nightK = smooth(0, 9, W.t);
    this.moonDir = this.moonAt(p);
    this.applyLight(this.mixLight(this.lightState('dusk'), this.lightState('night', n.haar || 0, this.moonDir), k));
    // the stars wheel about the pole
    this.world.sky.material.uniforms.uStarRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationAxis(POLE, -p * 2.3));
    if (hasReef(n)) this.bay.raiseReef('newrock', W.view().reefRise);
    // the sill: the clock keeps the night, the oil and the tea go down; now and then a sip
    const S = this.room.sill;
    S.oil.scale.y = lerp(0.062, 0.02, p);
    const gutter = 1 - smooth(0.85, 1, p) * 0.35 * (0.6 + 0.4 * Math.sin(W.t * 13) * Math.sin(W.t * 7.3));
    S.flame.material.uniforms.uAmt.value = 1.6 * gutter;
    S.glow.material.uniforms.uAmt.value = 0.25 * gutter;
    const due = [0.24, 0.52, 0.78];
    if (!this.sip && this.sips < due.length && p > due[this.sips] && !W.beatActive() && !W.near) this.sip = { t: 0, level: this.room.mug.userData.tea.position.y };
    if (this.sip) {
      this.sip.t += dt;
      const tea = this.room.mug.userData.tea;
      tea.position.y = this.sip.level - smooth(1.6, 2.8, this.sip.t) * 0.014;
      if (this.sip.t > 4.6) { this.sip = null; this.sips++; }
    }
  }

  // what the bay should show this frame
  bayView() {
    const n = this.night, haar = n.haar || 0;
    if (this.watch && this.mode === 'night') {
      const W = this.watch, v = W.view();
      const lampOn = this.lampLit ? 1 : 0;
      v.beam.amt = lampOn * smooth(0, 3, W.t) * (0.5 + haar * 0.5);
      v.beam.reach = 1 - haar * 0.55;
      v.beam.haar = haar;
      const moonVis = n.weather === 'rain' ? 0 : n.weather === 'grey' ? 0.35 : 1 - haar * 0.6;
      v.moon = { dir: this.moonDir || this.moonAt(0), amt: (this.nightK ?? 1) * moonVis };
      return v;
    }
    if (this.mode === 'dawn' && this.dawnShips) {
      return { ships: this.dawnShips, fleetT: 0, t: this.t, beam: { angle: this.dawnBeam, amt: 0.08, reach: 0.6, haar, blur: 0, spread: 0, hits: [] }, moon: null };
    }
    // dusk: the beam not yet lit, no boats
    return { ships: [], fleetT: 0, t: this.t, beam: { angle: 0, amt: this.lampLit ? smooth(1.7, 3, this.st) * 0.4 : 0, reach: 1 - haar * 0.55, haar, blur: 0, spread: 0, hits: [] }, moon: null };
  }

  toggleLapse() {
    const W = this.watch;
    if (!W) return;
    W.setLapse(!W.lapse);
    this.lapse = W.lapse;
    this.drawNote(W.lapse);
    this.game.audio?.page?.();
    this.flash = { text: W.lapse ? 'the night runs on' : 'the night is slow', t: 0 };
  }

  // the note to oneself, with the way the night is going ticked
  drawNote(on) {
    const S = this.room.sill, c = S.noteCanvas, x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    const lines = [['let the night run on', true], ['let the night be slow', false]];
    lines.forEach(([text, isOn], i) => {
      const y = 62 + i * 58, active = isOn === on;
      letter(x, text, 46, y, { hand: 'keeper', size: 34, alpha: active ? 0.92 : 0.5, color: '#2B2622', seed: i });
      if (active) inkLine(x, [[30, y - 18], [36, y - 8], [44, y - 30]], { width: 3, alpha: 0.85, seed: 3 + i, breaks: 0 });
    });
    S.noteTex.needsUpdate = true;
  }

  toLogbook() {
    if (this.leaving || this.state !== 'dawn-chair') return;
    this.leaving = true;
    this.game.onDawnSeen();
  }

  // a click from the chair: the note, or a place on the water for the beam to rest
  clickChair(e) {
    const [nx, ny] = this.ndc(e);
    const rc = this.ray;
    rc.setFromCamera(new THREE.Vector2(nx, ny), this.world.camera);
    if (rc.intersectObject(this.room.sill.note, true).length) { this.toggleLapse(); return; }
    if (!this.watch || this.mode !== 'night') return;
    const o = rc.ray.origin, d = rc.ray.direction;
    if (d.y > -1e-4) return;
    // not through the wall
    const wall = rc.intersectObject(this.room.group, true)[0];
    if (wall && wall.distance < 4) return;
    const p = o.clone().addScaledVector(d, (this.bay.tide - o.y) / d.y);
    const c = [p.x / UNIT, p.z / UNIT];
    if (landHeight(c[0], c[1]) > this.bay.tide + 0.3) return;
    this.watch.lingerAt(c);
    this.game.audio?.soft?.();
  }

  // ---------------- debug: free-fly ----------------
  toggleFly() {
    if (this.fly) { this.fly = null; this.flash = { text: 'free-fly off', t: 0 }; return; }
    this.fly = { pos: this.cam.pos.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch, fov: this.cam.fov };
    this.flash = { text: 'free-fly: WASD, E/Q up/down, drag to look, shift fast', t: 0 };
  }

  flyCam(dt) {
    const f = this.fly, k = this.game.input.keys;
    const has = (...ks) => ks.some((x) => k.has(x));
    const sp = (has('Shift') ? 40 : 6) * dt;
    const fw = (has('w', 'W') ? 1 : 0) - (has('s', 'S') ? 1 : 0), rt = (has('d', 'D') ? 1 : 0) - (has('a', 'A') ? 1 : 0), up = (has('e', 'E') ? 1 : 0) - (has('q', 'Q') ? 1 : 0);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
    const right = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    f.pos.addScaledVector(dir, fw * sp).addScaledVector(right, rt * sp);
    f.pos.y += up * sp;
    this.cam.pos.copy(f.pos); this.cam.yaw = f.yaw; this.cam.pitch = f.pitch; this.cam.roll = 0; this.cam.fov = f.fov;
  }

  // standing at the lamp control, near enough to reach the lever; it sits right of centre
  lampPose() {
    const C = this.roomPoint(ROOM.control.deg, ROOM.R - 0.2, ROOM.control.h + 0.22);
    const eye = this.roomPoint(ROOM.control.deg + 5, ROOM.R - 0.62, 1.62);
    const p = this.poseLooking(eye, C, 62);
    p.yaw += 0.12;
    return p;
  }

  // at the door, close enough to take the ring, which sits right of centre
  doorPose() {
    this.updateFrames();
    const ring = this.frame('door').pos;
    const inward = new THREE.Vector3().subVectors(this.roomPoint(0, 0, ring.y - this.room.group.position.y), ring).setY(0).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(inward);
    const eye = ring.clone().addScaledVector(inward, 0.5).addScaledVector(side, 0.26).setY(this.roomPoint(0, 0, 1.62).y);
    return this.poseLooking(eye, ring.clone().addScaledVector(side, 0.12).add(new THREE.Vector3(0, 0.3, 0)), 62);
  }

  // sitting back in the chair: the whole window and the sill, and the forearms resting on the chair's
  // arms at the bottom of the view
  chairPose() {
    const c = this.room.chair;
    const seat = new THREE.Vector3(0, 1.2, 0.12).applyMatrix4(c.matrixWorld);
    const out = this.roomPoint(ROOM.window.deg, ROOM.R + 6, 0.6);
    const p = this.poseLooking(seat, out, 72);
    p.pitch = -0.26;
    return p;
  }

  sitDown() {
    const p = this.pending;
    this.pending = null;
    this.setState('chair');
    this.game.inkPlan(p.waypoints, p.meta);
  }

  // ---------------- the inkwell, the quill and the pencil tray ----------------
  // They sit on the table in the book's own frame (x across, y up, z toward the keeper). The quill
  // stands in the well leaning the way it's held to write, so the hand that takes it out is already in
  // its writing grip; the pencil goes into the tray point first, the same way, then falls flat.
  buildDesk() {
    const desk = this.desk = new THREE.Group();
    desk.position.copy(this.book.group.position);
    desk.quaternion.copy(this.book.group.quaternion);
    this.room.table.add(desk);
    this.well = inkwell();
    desk.add(this.well);
    const grip = (pose, tool) => {
      const P = POSES[pose].R, g = this.hands.grips[tool];
      return new THREE.Quaternion().setFromEuler(new THREE.Euler(...P.rot, 'YXZ')).multiply(new THREE.Quaternion().setFromEuler(g.rot));
    };
    // the quill as it's held to write, stood a little straighter so it goes down the neck of the well
    const q = grip('pen', 'pen'), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const lean = Math.acos(up.y), MAX = 0.5;
    if (lean > MAX) q.premultiply(new THREE.Quaternion().setFromAxisAngle(up.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), lean - MAX));
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // its point down in the ink, against the far side of the well, the shaft through the middle of the neck
    const tip = new THREE.Vector3(-dir.x, 0, -dir.z).multiplyScalar(0.047 / Math.max(dir.y, 0.5)).setY(0.008);
    this.quillWell = { pos: tip, quat: q };
    this.hands.put('pen', this.well, tip, new THREE.Euler().setFromQuaternion(q, 'YXZ'));
    // the pencil tray, beside the right hand's resting place; the pencil lies along it, point inward
    const tray = new THREE.Vector3(0.439, 0.012, 0.028), trayYaw = 0.08;
    const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, trayYaw, -Math.PI / 2, 'YXZ'));
    const tipFlat = tray.clone().add(new THREE.Vector3(-0.075, 0.0036, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), trayYaw));
    this.trayPencil = { pos: tipFlat, flat: flatQ, tilt: grip('write', 'pencil') };
    this.resetDesk();
  }

  // every dusk: the inkwell back in its place with the quill in it, the pencil in the hand
  resetDesk() {
    this.ink = null;
    // the inkwell stands out of the way to the right of the book, and is brought in beside it (the arm
    // never reaches across the pages for it)
    this.wellHome = new THREE.Vector3(0.45, 0, -0.15);
    this.wellNear = new THREE.Vector3(0.375, 0, -0.085);
    this.well.position.copy(this.wellHome);
    if (!this.hands.inHand('pencil')) this.hands.take('pencil');
    if (this.hands.inHand('pen')) this.hands.put('pen', this.well, this.quillWell.pos, new THREE.Euler().setFromQuaternion(this.quillWell.quat, 'YXZ'));
    this.pencilDrop = null;
  }

  // The inking, after the pencil line: put the pencil down, fetch the ink, take the quill out of the
  // well and dip it, draw the line with it, and put it back. The logbook's own inking waits (hold) until
  // the nib is on the start of the line.
  startInk() {
    const sc = this.book.scene;
    sc.inking.hold = true;
    sc.inking.dur = 3.4;
    this.ink = { step: 0, t: 0 };
    this.drawHold = 0;
  }

  // the steps: [hand pose, seconds, what happens at the end]
  inkSteps() {
    const h = this.hands, k = this;
    return [
      ['ink-tray', 0.8, () => { h.put('pencil', k.desk, k.trayPencil.pos, new THREE.Euler().setFromQuaternion(k.trayPencil.tilt, 'YXZ')); k.pencilDrop = 0; }],
      ['ink-well', 0.7],
      ['ink-well', 0.8, null, 'carry'],
      ['ink-take', 0.6, () => h.take('pen')],
      ['ink-lift', 0.45],
      ['ink-take', 0.3],
      ['ink-lift', 0.35],
      ['pen', 0.6, () => { k.book.scene.inking.hold = false; }, 'start'],
      ['pen', Infinity, null, 'draw'],
      ['ink-lift', 0.7],
      ['ink-take', 0.4, () => h.put('pen', k.well, k.quillWell.pos, new THREE.Euler().setFromQuaternion(k.quillWell.quat, 'YXZ'))],
      ['lean', 0.6],
    ];
  }

  updateInk(dt) {
    const sc = this.book.scene;
    // the pencil, let go in the tray, falls flat
    if (this.pencilDrop != null && this.pencilDrop < 1) {
      this.pencilDrop = Math.min(1, this.pencilDrop + dt / 0.22);
      const k = this.pencilDrop * this.pencilDrop;
      this.hands.pencil.quaternion.slerpQuaternions(this.trayPencil.tilt, this.trayPencil.flat, k);
    }
    if (!this.ink) {
      if (sc.inking && !sc.inking.seen) { sc.inking.seen = true; if (this.state === 'lean') { sc.inking.t = 0; this.startInk(); } }
      return;
    }
    // carried off mid-way (a jump in time): everything put where it would have ended up
    if (this.state !== 'lean') {
      if (this.hands.inHand('pen')) this.hands.put('pen', this.well, this.quillWell.pos, new THREE.Euler().setFromQuaternion(this.quillWell.quat, 'YXZ'));
      if (this.hands.inHand('pencil')) this.hands.put('pencil', this.desk, this.trayPencil.pos, new THREE.Euler().setFromQuaternion(this.trayPencil.flat, 'YXZ'));
      this.well.position.copy(this.wellNear);
      if (this.book.scene.inking) this.book.scene.inking.hold = false;
      this.ink = null; this.inkThen = false;
      return;
    }
    const steps = this.inkSteps(), I = this.ink;
    const [, dur, done, kind] = steps[I.step];
    I.t += dt;
    if (kind === 'carry') {
      // the inkwell comes in beside the book, lifted a little on the way
      const e = ease(Math.min(1, I.t / dur));
      this.well.position.lerpVectors(this.wellHome, this.wellNear, e);
      this.well.position.y = Math.sin(e * Math.PI) * 0.025;
    }
    const finished = kind === 'draw' ? !sc.inking || sc.inking.t >= 1 : I.t >= dur;
    if (finished) {
      done?.();
      I.step++; I.t = 0;
      if (I.step >= steps.length) {
        this.ink = null;
        if (this.inkThen) { this.inkThen = false; this.setState('lean-out'); }
      }
    }
  }

  inkPose() {
    if (!this.ink) return 'lean';
    return this.inkSteps()[this.ink.step][0];
  }

  // where the nib is: on the line as far as the ink has gone, sliding smoothly between its points
  nibAt(out) {
    const sc = this.book.scene, pts = sc.penPts;
    if (!pts || pts.length < 2) return false;
    const kind = this.ink ? this.inkSteps()[this.ink.step][3] : null;
    const p = kind === 'start' ? 0 : Math.min(1, Math.max(0, sc.inking?.t || 0));
    const f = Math.min(pts.length - 1.001, Math.max(0, pts.length * p - 1));
    const i = Math.floor(f), u = f - i;
    this.book.worldAt(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u, out);
    if (kind === 'start') out.y += 0.01 * (1 - smooth(0.2, 0.6, this.ink.t));
    return true;
  }

  // ---------------- hands ----------------
  // the pose for this moment: what the keeper is doing decides what the hands are doing
  handPose() {
    if (this.poseOverride) return this.poseOverride;
    const sc = this.book.scene;
    switch (this.state) {
      case 'walk': case 'fail': case 'read': return 'walk';
      case 'door': return this.st < 1.6 ? 'door' : 'walk';
      case 'stairs': return 'rail';
      case 'lean-in': return 'lean';
      case 'lean':
        if (sc.inking) return this.inkPose();
        if (sc.flipAnim && !this.book.single) return 'turn';
        // the pencil comes onto the page only while it's drawing (and a moment after); otherwise the
        // hands rest beside the book and leave every page clear
        if (this.mode === 'dusk' && this.hands.inHand('pencil')) return this.drawHold > 0 ? 'write' : 'ready';
        return 'lean';
      case 'lean-out': return this.ink ? this.inkPose() : this.mode === 'dusk' && this.hands.inHand('pencil') ? 'ready' : 'lean';
      case 'light': return 'lamp';
      case 'to-chair': return 'walk';
      case 'chair': return this.sip && this.sip.t > 0.2 && this.sip.t < 4.0 ? 'mug' : 'chair';
      case 'dawn-chair': return 'chair';
      case 'rise': return 'walk';
      // the cover is lifted until it stands, then let fall; the hand goes back beside the book
      case 'closing': return this.st < 0.55 ? 'close' : 'lean';
      case 'review': return this.reviewPose;
      default: return 'lean';
    }
  }

  frame(name) { return (this.frames[name] ||= { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fwd: new THREE.Vector3() }); }

  // where each pose's frame is in the world this frame
  updateFrames() {
    const c = this.cam, _s = new THREE.Vector3();
    const body = this.frame('body');
    body.pos.copy(c.pos);
    // on a phone held upright the camera rises over the book to show the whole page, but the body sits
    // where it would in landscape: the camera's rise is taken off it, as far as the camera has made it
    let pitch = c.pitch;
    if (this.book.single) {
      const up = this.leanPose(), sit = this.leanPose(true), rise = up.pos.distanceTo(sit.pos);
      const w = rise > 1e-6 ? Math.max(0, 1 - c.pos.distanceTo(up.pos) / rise) : 0;
      body.pos.addScaledVector(sit.pos.clone().sub(up.pos), w);
      pitch += w * (sit.pitch - up.pitch);
    }
    body.quat.setFromEuler(new THREE.Euler(pitch * 0.35, c.yaw, 0, 'YXZ'));
    body.fwd.set(0, 0, -1).applyQuaternion(body.quat);
    const fromObj = (name, obj, local = null, extra = null) => {
      const f = this.frame(name);
      obj.updateWorldMatrix(true, false);
      obj.matrixWorld.decompose(f.pos, f.quat, _s);
      if (local) f.pos.copy(local.clone().applyMatrix4(obj.matrixWorld));
      if (extra) f.quat.multiply(extra);
    };
    fromObj('book', this.book.group);
    // the mug, when it's in the hands: in the lap, a little out from the chest
    const mf = this.frame('mug');
    mf.pos.set(0, -0.3, -0.42).applyQuaternion(body.quat).add(body.pos);
    mf.quat.setFromEuler(new THREE.Euler(0, c.yaw, 0, 'YXZ'));
    fromObj('chair', this.room.chair);
    const b = this.book, Wl = 0.62 / 1512 * 728, Hl = 0.62 / 1512 * 872;
    fromObj('leaf', b.leaf, new THREE.Vector3(Wl * 0.94, 0, Hl / 2 * 0.86));
    fromObj('lid', b.coverLid, new THREE.Vector3(-0.62 / 2 * 0.92, 0, 0.62 / 1512 * 920 / 2 * 0.86));
    // the inkwell, the quill's place in it (and above it), the pencil's place in the tray
    fromObj('inkwell', this.well);
    const wf = this.frame('inkwell'), qw = this.frame('quillWell'), qu = this.frame('quillUp'), tp = this.frame('trayPencil');
    qw.pos.copy(this.quillWell.pos).applyQuaternion(wf.quat).add(wf.pos);
    qw.quat.copy(wf.quat).multiply(this.quillWell.quat);
    qu.pos.copy(qw.pos).add(new THREE.Vector3(0, 0.1, 0)); qu.quat.copy(qw.quat);
    qw.tool = qu.tool = tp.tool = true;
    const df = this.frame('desk');
    fromObj('desk', this.desk);
    tp.pos.copy(this.trayPencil.pos).applyQuaternion(df.quat).add(df.pos);
    tp.quat.copy(df.quat).multiply(this.trayPencil.tilt);
    // the lever's shaft, a hand's width from the ball
    fromObj('lever', this.room.lever, new THREE.Vector3(0, 0, -0.17));
    // the door's ring, which swings with the door
    fromObj('door', this.room.door.ring);
    // the stair rail, just ahead of whoever is climbing it
    const rail = this.frame('rail');
    const st = ROOM.stairs, i = this.railStep ?? 3;
    const ra = (st.from + i * st.step) * DEG, ra2 = (st.from + (i + 1) * st.step) * DEG, rr = st.r0 + 0.05;
    const p1 = new THREE.Vector3(Math.sin(ra) * rr, (i + 1) * st.rise + 0.9, -Math.cos(ra) * rr).applyMatrix4(this.room.group.matrixWorld);
    const p2 = new THREE.Vector3(Math.sin(ra2) * rr, (i + 2) * st.rise + 0.9, -Math.cos(ra2) * rr).applyMatrix4(this.room.group.matrixWorld);
    rail.pos.copy(p1);
    const dir = p2.clone().sub(p1).normalize();
    rail.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)));
    return body;
  }

  updateHands(dt) {
    const h = this.hands, b = this.book, sc = b.scene;
    const body = this.updateFrames();
    // drawing: the button held down on the page; the hand lingers a moment after it lets go
    if (this.state === 'lean' && this.pointerOnPage && b.input.down && this.mode === 'dusk' && !sc.inking) this.drawHold = 1.2;
    else this.drawHold = Math.max(0, (this.drawHold || 0) - dt);
    this.updateInk(dt);
    const pose = this.handPose();
    // each step of the inking takes the hand there in the step's own time
    const inkDur = this.ink ? Math.min(this.inkSteps()[this.ink.step][1], 0.9) : 0;
    // leaning in, the hands come down beside the book as the body comes over it, not before (they'd be
    // out of reach, dragged along behind the shoulders)
    const arrive = this.state === 'lean-in' && this.blendT ? (1 - this.blendT.t) * this.blendT.dur : 0;
    h.setPose(pose, this.ink ? inkDur : pose === 'write' || h.pose === 'write' ? 0.3 : this.state === 'lean' ? 0.45 : Math.max(0.6, arrive));
    // the writing tip: under the pointer on the page, lifted a hair unless pressing; inking, the nib
    if (this.state === 'lean' || this.state === 'review' || this.ink) {
      const bi = b.input;
      if (sc.inking && this.nibAt(this.tip)) { /* on the line */ }
      else if (sc.inking && sc.penAt) b.worldAt(sc.penAt[0], sc.penAt[1], this.tip);
      else if (this.pointerOnPage) {
        b.worldAt(bi.x, bi.y, this.tip);
        this.tip.y += bi.down ? 0 : 0.006;
      } else if (this.tip.lengthSq() === 0 || this.tipStale) { b.worldAt(b.single ? 430 : 1150, b.single ? 700 : 560, this.tip); this.tip.y += 0.006; this.tipStale = false; }
    }
    h.tip = this.tip;
    // the mug comes off the sill into the hands, and goes back, carried as the hands move
    const mug = this.room.mug, hb = this.hands.blend;
    const held = ease(this.hands.pose === 'mug' ? hb : (this.hands.from && this.lastHandPose === 'mug' ? 1 - hb : 0));
    if (this.hands.blend >= 1) this.lastHandPose = this.hands.pose;
    if ((held > 0) !== !!this.mugHeld) {
      this.mugHeld = held > 0;
      if (held > 0) this.world.scene.add(mug); else { this.room.group.add(mug); mug.position.copy(mug.userData.home); mug.quaternion.identity(); }
    }
    if (held > 0) {
      const mf = this.frames.mug, rg = this.room.group;
      const home = mug.userData.home.clone().applyMatrix4(rg.matrixWorld), homeQ = rg.quaternion.clone();
      const hand = mf.pos.clone().add(new THREE.Vector3(0, -0.045, 0));
      mug.position.lerpVectors(home, hand, held);
      mug.position.y += Math.sin(held * Math.PI) * 0.06;
      mug.quaternion.slerpQuaternions(homeQ, mf.quat, held);
    }
    const sh = (x) => new THREE.Vector3(x, -0.25, 0.1).applyQuaternion(body.quat).add(body.pos);
    const pole = (x) => new THREE.Vector3(x, -1, 0.25).applyQuaternion(body.quat);
    h.setStain(0.12 + 0.75 * Math.min(1, ((this.night?.id || 1) - 1) / 14));
    h.update(dt, this.frames, {
      shoulders: { R: sh(0.17), L: sh(-0.17) },
      poles: { R: pole(0.6), L: pole(-0.6) },
      bob: this.walker.bobT,
    });
  }

  // Debug: hold a pose where it's naturally seen, under a given light (for the hands review)
  review(pose, tod = 'dusk', { haar = 0 } = {}) {
    this.reviewPose = pose;
    this.poseOverride = null;
    this.walker.setEnabled(false);
    this.setLight(tod, haar);
    this.lookOverride = { fog: haar ? 0.55 : 0, haar };
    this.world.shared.uFogDensity.value = haar ? 0.35 : this.world.shared.uFogDensity.value;
    this.world.shared.uFogNear.value = haar ? 0.4 : 8;
    // (the logbook laid out for the screen first, one page or two, so the camera frames what is shown)
    this.book.setSingle(this.game.layers.cssW / this.game.layers.cssH < 0.95);
    const C = this.bookCentre();
    let p;
    if (['write', 'ready', 'pen', 'lean', 'turn', 'close'].includes(pose) || pose.startsWith('ink')) {
      this.book.open = true;
      p = this.leanPose();
      this.tipStale = true;
      this.pointerOnPage = false;
    } else if (pose === 'chair' || pose === 'mug') {
      p = this.chairPose();
    } else if (pose === 'lamp') {
      p = this.lampPose();
    } else if (pose === 'door') {
      p = this.doorPose();
    } else if (pose === 'rail') {
      this.railStep = 3;
      const st = ROOM.stairs, a = st.from + 2 * st.step;
      const eye = this.roomPoint(a, (st.r0 + ROOM.R) / 2, 2 * st.rise + 1.62);
      const ahead = this.roomPoint(a + 25, (st.r0 + ROOM.R) / 2 - 0.2, 4 * st.rise + 1.3);
      p = this.poseLooking(eye, ahead, 62);
    } else {
      const eye = this.roomPoint(200, 1.0, 1.62);
      p = this.poseLooking(eye, C, 62);
      p.pitch = -0.7;
    }
    if (pose === 'close') this.book.setClosed(0.42);
    else this.book.setClosed(0);
    if (pose === 'turn') this.book.scene.flipAnim = { t: 0.3, dir: 1, from: this.book.scene.idx, hold: true };
    else if (this.book.scene.flipAnim?.hold) this.book.scene.flipAnim = null;
    this.applyPose(p);
    this.blendT = null;
    this.state = 'review';
    this.hands.blend = 1;
    this.hands.pose = pose;
    this.hands.spring = { R: null, L: null };
    for (const a of [this.hands.R, this.hands.L]) { a.pp = null; a.roll = null; }
  }

  applyCamera() {
    const c = this.world.camera, k = this.cam;
    c.position.copy(k.pos);
    c.rotation.set(k.pitch, k.yaw, k.roll, 'YXZ');
    if (Math.abs(c.fov - k.fov) > 0.01) { c.fov = k.fov; c.updateProjectionMatrix(); }
    // debug: the hands review can look from somewhere else without moving the body the arms hang from
    if (this.camOverride) {
      const o = this.camOverride;
      c.position.copy(o.pos);
      c.lookAt(o.target);
      if (Math.abs(c.fov - o.fov) > 0.01) { c.fov = o.fov; c.updateProjectionMatrix(); }
    }
    c.updateMatrixWorld(true);
  }

  updateClock() {
    // the clocks keep the game's time of day (dusk ≈ 7, through the night, first light ≈ 6)
    const h = this.watch && this.mode === 'night' ? this.watch.hour() : this.mode === 'day' ? this.headland.hour
      : this.mode === 'dusk' || this.mode === 'stairs' ? 19.2 + this.t / 600 : 5.8 + this.t / 600;
    const r = this.room, S = r.sill;
    r.hourHand.rotation.z = S.hour.rotation.z = -((h % 12) / 12) * Math.PI * 2;
    r.minHand.rotation.z = S.min.rotation.z = -((h % 1)) * Math.PI * 2;
  }

  updatePrompt() {
    this.prompt = null;
    const mouse = this.game.input.type === 'mouse', use = mouse ? 'E — ' : 'tap — ';
    if (this.up) {
      if (this.hop) return;
      if (this.scope) { this.prompt = mouse ? 'E — step back from the glass' : 'tap — step back from the glass'; return; }
      const f = (this.state === 'walk' || this.state === 'fail') && !this.wind ? this.focus() : null;
      if (f === 'crank') this.prompt = use + 'wind the clockwork';
      else if (f === 'scope') this.prompt = use + 'look through the glass';
      else if (this.walker.pos.distanceTo(this.roomPoint(TOP.hatch.deg, TOP.hatch.r, TOP.floor)) < 0.8) this.prompt = 'the stairs down';
      return;
    }
    if (this.mode === 'day') {
      const f = this.state === 'walk' ? this.focus() : null;
      if (f === 'door') this.prompt = use + 'open the door';
      else if (f === 'book') this.prompt = use + 'wait here for dusk';
      else if (this.note) this.prompt = this.note.text;
      else if (this.state === 'walk' && this.st < 7 && this.t < 9 && this.game.state.nightsPlayed < 2) this.prompt = mouse ? 'WASD to walk, the mouse to look' : 'left thumb to walk, right to look';
      return;
    }
    if (this.state === 'stairs' && this.stair < 0 && this.st > 1.2) { this.prompt = (mouse ? 'click — ' : 'tap — ') + STAIRS.prompt; return; }
    if (this.state === 'walk' && this.focus() === 'book') this.prompt = this.game.input.type === 'mouse' ? 'E — lean over the logbook' : 'tap — lean over the logbook';
    else if (this.state === 'walk' && this.st < 6 && this.mode === 'dusk') this.prompt = 'the logbook is open on the table';
    else if (this.state === 'lean' && this.mode === 'dusk' && !this.book.scene.inking) this.prompt = this.game.input.type === 'mouse' ? 'Esc — stand up' : null;
    else if (this.state === 'dawn-chair' && this.st > 1.2) this.prompt = this.game.input.type === 'mouse' ? 'E — over to the logbook' : 'tap — over to the logbook';
    else if (this.state === 'chair' && this.watch) {
      const mouse = this.game.input.type === 'mouse', W = this.watch;
      if (this.noteHover) this.prompt = (mouse ? 'click' : 'tap') + (W.lapse ? ' — let the night be slow' : ' — let the night run on');
      else if (this.game.state.nightsPlayed < 2 && W.t > 4 && W.t < 15) this.prompt = (mouse ? 'click' : 'tap') + ' the water, and the beam will rest there';
    }
  }

  // ---------------- look + HUD ----------------
  look() {
    if (this.mode === 'night' || (this.mode === 'dawn' && this.dawnShips && this.game.sceneName === 'bay')) return this.lookBay();
    const n = this.night;
    const base = { ...n.look };
    base.fog = (n.haar || 0) * 0.8;
    // the stairs keep the 2D climb's warm grading, whatever the epilogue's palette
    if (this.mode === 'stairs') return { warmth: 0.55, sat: 0.9, paperShow: 0.22, fog: 0, gran: 0.9, wobble: 3.2, edge: 1.1, inkSpread: 0.1, lightGain: 1 };
    if (this.mode === 'day') {
      // the afternoon warms toward dusk as the light goes
      const k = smooth(DAY.dusk, DAY.to, this.headland.hour), fd = fogColorFor('day'), fk = fogColorFor('dusk');
      base.fogColor = fd.map((v, i) => v + (fk[i] - v) * k);
      base.warmth = (n.look.warmth ?? 0.5) - 0.04 + 0.16 * k;
      base.lightGain = 1;
      base.wobble = 2.2;
      if (this.lookOverride) Object.assign(base, this.lookOverride);
      return base;
    }
    base.fogColor = fogColorFor(this.mode === 'dawn' ? 'dawn' : 'dusk');
    if (this.mode === 'dusk' || this.mode === 'dawn') base.warmth = (n.look.warmth ?? 0.5) + (this.mode === 'dusk' ? 0.12 : -0.05);
    base.lightGain = 1;
    base.wobble = 2.2;
    if (this.lookOverride) Object.assign(base, this.lookOverride);
    return base;
  }

  // the bay from the chair: the night's grading, its haar, the parting for Mag Mell, the cloak
  lookBay() {
    const n = this.night, lk = n.look, dawn = this.mode === 'dawn';
    const k = dawn ? 1 : this.nightK ?? 1;
    const W = this.watch, m = W?.manannan;
    let fog = (n.haar || 0) * (dawn ? 0.55 : 1);
    if (m && m.a > 0) fog *= 1 - m.a * 0.15;
    const fd = fogColorFor('dusk'), fn = fogColorFor(dawn ? 'dawn' : 'night');
    const out = {
      warmth: lk.warmth + (dawn ? 0.1 : lerp(0.07, -0.05, k)), sat: lk.sat, paperShow: lk.paperShow + (dawn ? 0.05 : 0),
      bleed: lk.bleed, inkSpread: lk.inkSpread, gran: lk.gran, fog, fogColor: fd.map((v, i) => v + (fn[i] - v) * k),
      wobble: 2.2 + lk.bleed * 3, edge: 1, lightGain: 1, clearAmt: 0, cloakAmt: 0,
    };
    if (W && W.magMell > 0) {
      const uv = this.screenUv(this.bay.magMell.position.clone().setY(30));
      if (uv) { out.clear = [uv[0], uv[1], 0.16, 0.1]; out.clearAmt = W.magMell * 1.1; }
    }
    if (m && m.t0 != null && m.a > 0) {
      const cam = this.world.camera;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
      const sh = this.bay.manannan.position.clone().setY(22);
      const c = this.screenUv(sh.clone().addScaledVector(right, 8)), a = this.screenUv(sh.clone().addScaledVector(right, 37)), b = this.screenUv(sh.clone().setY(39));
      if (c && a && b) { out.cloak = [c[0], c[1], Math.abs(a[0] - c[0]) + 0.02, Math.abs(b[1] - c[1]) + 0.02]; out.cloakAmt = m.a * 0.6; }
    }
    if (this.lookOverride) Object.assign(out, this.lookOverride);
    return out;
  }

  // a world point on screen, as uv (0..1, y up), or null when behind
  screenUv(v) {
    const p = v.clone().project(this.world.camera);
    if (p.z > 1) return null;
    return [(p.x + 1) / 2, (p.y + 1) / 2];
  }

  // the night, from the chair: rain on the glass, and near dawn the eyelids getting heavy
  drawNightHud(L) {
    const v = L.view;
    if (this.night.weather === 'rain') {
      const poly = this.windowOnScreen(L);
      if (poly) {
        // pale streaks laid over the world (on the paint layer: pale ink wouldn't show over a dark night)
        const ink = L.paint;
        ink.save();
        ink.beginPath(); poly.forEach(([x, y], i) => (i ? ink.lineTo(x, y) : ink.moveTo(x, y))); ink.closePath(); ink.clip();
        ink.strokeStyle = rgba('#B8C0D0', 0.35);
        ink.lineWidth = 1.4;
        const r = rng(Math.floor(this.t * 12));
        for (let i = 0; i < 110; i++) {
          const x = lerp(v.x0, v.x1, r()), y = lerp(v.y0, v.y1, r());
          ink.beginPath(); ink.moveTo(x, y); ink.lineTo(x - 5, y + 20); ink.stroke();
        }
        ink.restore();
      }
    }
    const p = this.nightP || 0;
    if (p > 0.8) {
      // heavy lids, and every so often a long blink
      const bt = (this.watch.t % 6.5) / 6.5;
      const blink = p > 0.86 ? smooth(0.9, 0.95, bt) * (1 - smooth(0.96, 1, bt)) : 0;
      const lid = smooth(0.8, 1, p) * 0.2 + blink * 0.32;
      const H = v.y1 - v.y0, c = L.paint;
      for (const top of [true, false]) {
        const edge = top ? v.y0 + H * lid : v.y1 - H * lid * 0.8;
        const soft = H * 0.12;
        const g = c.createLinearGradient(0, top ? v.y0 : v.y1, 0, top ? edge + soft : edge - soft);
        g.addColorStop(0, 'rgba(34,28,26,0.94)');
        g.addColorStop(Math.max(0.01, 1 - soft / (Math.abs(edge - (top ? v.y0 : v.y1)) + soft)), 'rgba(34,28,26,0.85)');
        g.addColorStop(1, 'rgba(34,28,26,0)');
        c.fillStyle = g;
        c.fillRect(v.x0 - 10, top ? v.y0 - 10 : edge - soft, v.x1 - v.x0 + 20, top ? edge + soft - v.y0 + 10 : v.y1 - edge + soft + 10);
      }
    }
  }

  // a place's lines, lettered over a soft paper panel in the lower part of the view (as village.js
  // lays them out under its pictures)
  drawReading(L) {
    const R = this.reading, n = this.night, v = L.view, ink = L.ink, t = R.t;
    const fade = smooth(0, 0.6, t);
    const cx = (v.x0 + v.x1) / 2, y0 = Math.max(560, v.y1 - 450);
    // the paper: a few overlapping blots, so its edge is soft and uneven
    for (let i = 0; i < 4; i++) {
      blob(L.paint, cx + (i - 1.5) * 220, y0 + 200 + (i % 2) * 18, 380, 230, '#F2EAD9', 0.24 * fade, 7 + i, 0.18);
    }
    blob(L.paint, cx, y0 + 205, 640, 220, '#F4EDDF', 0.55 * fade, 3, 0.1);
    letter(ink, R.title, cx, y0 + 54, { hand: 'serifItalic', size: 38, align: 'center', alpha: 0.8 * smooth(0.2, 1.2, t) });
    const first = Math.max(0, R.shown - 4);
    let y = y0 + 104;
    const x = cx - 470, w = 940;
    for (let i = first; i < R.shown; i++) {
      const l = R.lines[i];
      const cur = i === R.shown - 1;
      const reveal = cur ? clamp(R.lineT / this.readDur(l), 0, 1) : 1;
      const a = (cur ? 1 : Math.max(0.35, 0.8 - (R.shown - 1 - i) * 0.15)) * fade;
      let h;
      if (l.who === 'keeper') {
        h = block(ink, l.text, x + 40, y - 30, { hand: 'keeper', size: 34, width: w - 40, drift: n.drift, seed: i + n.id, reveal, alpha: a }).h;
      } else if (l.who) {
        letter(ink, l.who, x - 20, y, { hand: 'serifItalic', size: 25, align: 'right', alpha: 0.6 * a });
        h = block(ink, '“' + l.text + '”', x, y - 30, { hand: 'serif', size: 31, width: w, seed: i, reveal, alpha: a }).h;
      } else {
        h = block(ink, l.text, x, y - 30, { hand: 'serifItalic', size: 31, width: w, seed: i, reveal, alpha: a * 0.92 }).h;
      }
      y += h + 14;
    }
    const cur = R.lines[R.shown - 1];
    if (R.lineT >= this.readDur(cur)) {
      const last = R.shown >= R.lines.length;
      const pulse = 0.45 + 0.25 * Math.sin(t * 2.4);
      letter(ink, last ? (this.arrival ? 'on to the tower ›' : 'and the light goes ›') : '…', cx + 500, v.y1 - 38, { hand: last ? 'keeper' : 'serif', size: last ? 34 : 34, align: 'right', alpha: last ? 0.7 : pulse });
    }
  }

  // the stairs: a short line every few treads in the Keeper's loosened hand, as in the 2D climb
  drawStairLines(L) {
    const line = STAIRS.lines[this.stair + 1];
    if (!line) return;
    const v = L.view, a = 0.75 * smooth(0.2, 0.9, this.st - this.climbT) * (1 - smooth(1.6, 2.4, this.st - this.climbT));
    letter(L.ink, line, (v.x0 + v.x1) / 2 + 160, (v.y0 + v.y1) / 2 - 60, { hand: 'keeper', size: 40, align: 'center', alpha: a, color: '#2B2622', drift: this.night?.drift || 0, seed: this.stair });
  }

  // the window opening on screen, in layout units
  windowOnScreen(L) {
    const w = ROOM.window, R = ROOM.R + 0.42, a = w.deg * DEG;
    const cam = this.world.camera, out = [];
    for (const [s, y] of [[-1, w.sill], [1, w.sill], [1, w.top], [-1, w.top]]) {
      const pl = new THREE.Vector3(Math.sin(a) * R + Math.cos(a) * s * w.half, y, -Math.cos(a) * R + Math.sin(a) * s * w.half).applyMatrix4(this.room.group.matrixWorld).project(cam);
      if (pl.z > 1) return null;
      out.push(L.toLogical((pl.x + 1) / 2 * L.cssW, (1 - pl.y) / 2 * L.cssH));
    }
    return out;
  }

  cursor() {
    if (this.state === 'read' || this.state === 'stairs') return 'pointer';
    if (this.state === 'lean') {
      const c = this.book.input.cursor() || this.book.scene.cursor();
      // the pencil's point is the cursor while it's on the page; otherwise the page's own cursor shows
      if (this.pointerOnPage && this.mode === 'dusk' && this.hands.pose === 'write' && this.game.input.type === 'mouse' && (!c || c === 'crosshair' || c === 'default')) return 'none';
      return c || 'default';
    }
    return this.walker.locked ? 'none' : 'default';
  }

  hudActive() {
    const night = this.state === 'chair' && this.watch;
    return !!this.prompt || !!this.walker.stick || !!this.flash || !!this.reading || this.state === 'stairs' || !!this.hop || !!this.scope || !!this.caption || (night && (this.night.weather === 'rain' || this.nightP > 0.8));
  }

  drawHud(L) {
    if (this.state === 'chair' && this.watch) this.drawNightHud(L);
    if (this.reading) this.drawReading(L);
    if (this.state === 'stairs') this.drawStairLines(L);
    if (this.scope) this.drawScope(L);
    if (this.caption) this.drawCaption(L);
    this.drawHop(L);
    this.walker.drawTouch(L);
    if (this.flash) {
      const v = L.view;
      letter(L.ink, this.flash.text, v.x0 + 40, v.y0 + 60, { hand: 'keeper', size: 30, alpha: 0.8 * (1 - smooth(1.6, 2.2, this.flash.t)), color: '#2B2622' });
    }
    if (!this.prompt) return;
    const v = L.view;
    const x = (v.x0 + v.x1) / 2, y = v.y1 - 70;
    const w = measure(L.ink, this.prompt, 'keeper', 34);
    let a = this.state === 'walk' && !this.focus() ? 0.6 * (1 - smooth(4, 6, this.st)) : 0.85;
    if (this.note && this.prompt === this.note.text) a = 0.8 * smooth(0, 0.3, this.note.t) * (1 - smooth(2.4, 3, this.note.t));
    else if (this.mode === 'day' && this.state === 'walk' && !this.focus()) a = 0.6 * smooth(0.5, 1.5, this.st) * (1 - smooth(5, 7, this.st));
    if (this.state === 'chair' && this.watch && !this.noteHover) a = 0.7 * smooth(4, 5.5, this.watch.t) * (1 - smooth(13, 15, this.watch.t));
    blob(L.paint, x, y - 12, w * 0.62 + 30, 30, '#F2EAD9', 0.75 * a, 3, 0.12);
    letter(L.ink, this.prompt, x, y, { hand: 'keeper', size: 34, align: 'center', alpha: a, color: '#2B2622' });
    // a small mark at the centre of the view while walking
    if (this.state === 'walk' && this.walker.locked) {
      L.ink.fillStyle = rgba('#2B2622', 0.4);
      L.ink.beginPath(); L.ink.arc((v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, 2.5, 0, Math.PI * 2); L.ink.fill();
    }
  }
}
