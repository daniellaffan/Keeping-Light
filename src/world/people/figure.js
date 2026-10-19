// People, drawn the way everything else is: sturdy shapes in flat washes, with ink at their edges.
// A figure is a handful of Builder-merged parts hung on a small skeleton of groups (the hips, the
// chest, the neck, and each arm at shoulder, elbow and wrist), so it can breathe, shift its weight,
// fold its hands and turn its head without a skinned mesh. Nora is the first (nora.js); Tadhg and
// Síle can be made the same way, each with their own clothes, poses and habits.
//
// A figure stands facing +z in its own frame, feet on y = 0. Every joint moves on a critically damped
// spring, so nothing ever snaps: a new pose or a new thing to look at is eased into.
import * as THREE from 'three';
import { Builder } from '../build.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const V2 = (x, y) => new THREE.Vector2(x, y);

// ---------------- shapes ----------------
// a turned shape round the y axis from (r, y) points, squashed front to back by `depth`; `gap` leaves
// the front open by that many radians (an open cardigan)
export function lathe(b, mat, pts, { depth = 0.78, gap = 0, seg = 18, pos = [0, 0, 0] } = {}) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg, gap / 2, Math.PI * 2 - gap);
  return b.add(g, mat, { pos, scale: [1, 1, depth], wonk: 0 });
}

// a rounded limb along -y from its joint: radius r, length len (joint to joint)
export function limb(b, mat, r, len, { y0 = 0, r2 = r, seg = 10, scale = [1, 1, 1] } = {}) {
  b.add(new THREE.CylinderGeometry(r, r2, len, seg), mat, { pos: [0, y0 - len / 2, 0], scale, wonk: 0 });
  b.add(new THREE.SphereGeometry(r2, seg, 6), mat, { pos: [0, y0 - len, 0], scale, wonk: 0 });
}

export function blob(b, mat, r, pos, scale = [1, 1, 1], rot = [0, 0, 0], seg = 12) {
  return b.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0)), mat, { pos, scale, rot, wonk: 0 });
}

// ---------------- the skeleton ----------------
// Joint positions for a grown woman about 1.6 m tall; `s` scales the whole of it.
export function skeleton({ s = 1, hip = 0.95, waist = 0.05, neck = 0.4, shoulder = [0.19, 0.335], upper = 0.27, fore = 0.24 } = {}) {
  const j = (name, parent, x, y, z, order = 'YXZ') => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x * s, y * s, z * s);
    g.rotation.order = order;
    parent?.add(g);
    return g;
  };
  const root = j('figure', null, 0, 0, 0);
  const hips = j('hips', root, 0, hip, 0);
  const chest = j('chest', hips, 0, waist, 0);
  const neckJ = j('neck', chest, 0, neck, -0.005);
  const arm = (side) => {
    const sh = j('shoulder', chest, side * shoulder[0], shoulder[1], -0.01, 'ZXY');
    const el = j('elbow', sh, 0, -upper, 0, 'ZXY');
    const wr = j('wrist', el, 0, -fore, 0, 'ZXY');
    return { sh, el, wr, rest: sh.position.clone() };
  };
  return { root, hips, chest, neck: neckJ, l: arm(1), r: arm(-1), s, breathe: [] };
}

// put a Builder's merged parts on a joint
export function attach(joint, b, name) {
  const g = b.finish(name);
  joint.add(g);
  return g;
}

// ---------------- poses ----------------
// An arm pose: the shoulder [twist, swing forward(-)/back(+), out(+ for the left arm)], the elbow's
// bend (negative brings the hand up and forward), the wrist [bend, twist, side]. Given for the left
// arm; the right is its mirror unless a pose gives it separately.
export function mirror(a) {
  return { sh: [-a.sh[0], a.sh[1], -a.sh[2]], el: a.el, wr: [a.wr[0], -a.wr[1], -a.wr[2]] };
}
export function pose(l, r = mirror(l)) { return { l, r }; }

const ARM_KEYS = 7;
const flat = (a) => [a.sh[0], a.sh[1], a.sh[2], a.el, a.wr[0], a.wr[1], a.wr[2]];

class Spring {
  constructor(x = 0) { this.x = x; this.v = 0; }
  // critically damped toward t at angular frequency w, never faster than vmax
  to(t, w, dt, vmax = 6) {
    const a = w * w * (t - this.x) - 2 * w * this.v;
    this.v = clamp(this.v + a * dt, -vmax, vmax);
    this.x += this.v * dt;
    return this.x;
  }
}

// ---------------- the figure in motion ----------------
// poses: { name: pose(...) }. Each frame: figure.update(dt), after setting
//   figure.want     the pose to ease into
//   figure.target   a world point to look at, or null to look ahead
//   figure.slow     1 = as quick as a person is; more is slower (an old or tired body)
//   figure.headDown radians the head hangs when it isn't looking at anything
export class Figure {
  constructor(sk, poses, { seed = 1 } = {}) {
    this.sk = sk;
    this.poses = poses;
    this.want = Object.keys(poses)[0];
    this.target = null;
    this.slow = 1;
    this.headDown = 0.05;
    this.t = seed * 3.7;
    this.arms = { l: flat(poses[this.want].l).map((x) => new Spring(x)), r: flat(poses[this.want].r).map((x) => new Spring(x)) };
    this.yawC = new Spring(); this.yawH = new Spring(); this.pitchH = new Spring(0.05);
    this.shift = new Spring(); this.shiftTo = 0; this.shiftT = 3;
    this.gestures = [];
    this.lean = new Spring();
    this.leanTo = 0;
    this._p = new THREE.Vector3();
    this.rnd = seed;
  }

  rand() { this.rnd = (this.rnd * 16807) % 2147483647; return this.rnd / 2147483647; }

  // a gesture laid over the pose for a moment: 'nod', or an arm pose name for one hand ('offer')
  gesture(name, { side = 'r', dur = 1.4, delay = 0 } = {}) { this.gestures.push({ name, side, dur, t: -delay }); }

  // where the target lies from the neck: yaw (left of her +) and pitch (down +), in her own frame
  aim(p) {
    const sk = this.sk, l = this._p.copy(p);
    sk.root.updateWorldMatrix(true, false);
    sk.root.worldToLocal(l);
    const nx = sk.hips.position.x, ny = sk.hips.position.y + sk.chest.position.y + sk.neck.position.y + 0.13 * sk.s;
    const dx = l.x - nx, dz = l.z, dy = l.y - ny;
    return { yaw: Math.atan2(dx, dz), pitch: -Math.atan2(dy, Math.hypot(dx, dz)), behind: dz < -0.3 };
  }

  update(dt) {
    // big steps (autoplay's time scale) are taken in pieces so the springs stay steady
    const n = Math.ceil(dt / 0.034);
    for (let i = 0; i < n; i++) this.step(dt / n);
  }

  step(dt) {
    const sk = this.sk, slow = this.slow;
    this.t += dt;
    const t = this.t;

    // ---- the arms: ease toward the pose, with any one-hand gesture laid over it ----
    const P = this.poses[this.want] || this.poses[Object.keys(this.poses)[0]];
    let nod = 0;
    const over = { l: null, r: null };
    for (const g of this.gestures) {
      g.t += dt;
      if (g.t < 0) continue;
      const k = Math.sin(Math.PI * clamp(g.t / g.dur, 0, 1));
      if (g.name === 'nod') nod += 0.2 * Math.sin(Math.PI * clamp(g.t / g.dur, 0, 1)) * (g.t < g.dur ? 1 : 0);
      else if (this.poses[g.name]) over[g.side] = { a: flat(this.poses[g.name][g.side]), k: k * k * (3 - 2 * k) };
    }
    this.gestures = this.gestures.filter((g) => g.t < g.dur);
    // wiping her hands on the apron: the hands work against each other
    const wipe = this.want === 'wipe' ? Math.sin(t * 6.5) * 0.14 : 0;
    for (const side of ['l', 'r']) {
      const want = flat(P[side]);
      if (over[side]) for (let i = 0; i < ARM_KEYS; i++) want[i] += (over[side].a[i] - want[i]) * over[side].k;
      if (wipe) { const sg = side === 'l' ? 1 : -1; want[0] += sg * wipe; want[3] += sg * wipe * 0.6; }
      const s = this.arms[side], w = (over[side] ? 6 : 3.2) / slow;
      const v = s.map((sp, i) => sp.to(want[i], w, dt));
      const A = sk[side];
      A.sh.rotation.set(v[1], v[0], v[2]);
      A.el.rotation.set(v[3], 0, 0);
      A.wr.rotation.set(v[4], v[5], v[6]);
    }

    // ---- breathing, slow, and the weight shifting from foot to foot every few seconds ----
    const br = Math.sin(t * Math.PI * 2 / (4.2 * slow));
    for (const g of sk.breathe) g.scale.set(1 + br * 0.008, 1 + br * 0.006, 1 + br * 0.014);
    sk.l.sh.position.y = sk.l.rest.y + br * 0.004 * sk.s;
    sk.r.sh.position.y = sk.r.rest.y + br * 0.004 * sk.s;
    this.shiftT -= dt;
    if (this.shiftT < 0) { this.shiftTo = this.shiftTo > 0 ? -0.6 - this.rand() * 0.4 : 0.6 + this.rand() * 0.4; this.shiftT = (5 + this.rand() * 4) * slow; }
    const sh = this.shift.to(this.shiftTo, 1.3 / slow, dt);
    sk.hips.position.x = sh * 0.018 * sk.s;
    sk.hips.rotation.z = sh * 0.03;

    // ---- the head, then the shoulders, round to what she's looking at; within what a neck can do ----
    let yaw = 0, pitch = this.headDown;
    if (this.target) {
      const a = this.aim(this.target);
      yaw = a.behind ? Math.sign(a.yaw) * 1.5 : a.yaw;
      pitch = clamp(a.pitch, -0.35, 0.5);
    }
    const yc = this.yawC.to(clamp(yaw * 0.4, -0.45, 0.45), 1.1 / slow, dt, 0.6);
    const yh = this.yawH.to(clamp(yaw - yc, -1.05, 1.05), 2.4 / slow, dt, 1.4);
    const ph = this.pitchH.to(pitch, 2.4 / slow, dt, 1.0);
    const ln = this.lean.to(this.leanTo, 1.5 / slow, dt);
    sk.chest.rotation.set(ln, yc, -sh * 0.045);
    sk.neck.rotation.set(ph + nod, yh, sh * 0.02);
  }
}

// a helper for dressing: a fresh Builder per joint
export function builder(seed) { return new Builder(seed); }
