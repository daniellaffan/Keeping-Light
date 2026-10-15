// The keeper's forearms and hands: the only part of them ever seen.
//
// Each arm is one skinned mesh: forearm, wrist, palm, three phalanges to each finger, and a thumb with
// its CMC, MCP and IP joints, all one continuous skin (built as a distance field in handmesh.js: an old
// man's hands, bony at the knuckles, the tendons and veins standing up on the back). The jumper sleeve,
// pushed up to mid-forearm, is a second skinned mesh on the same skeleton. Rest pose (arm space,
// metres): shoulder at the origin, the arm straight along -Z, palm down, thumb toward -X (the right
// hand; the left is built mirrored). At rest the fingers are spread, so the skin between them could be
// told apart when it was built; poses set every joint absolutely.
//
// Placing an arm: the wrist gets a target (position + orientation) from the current pose; a two-bone IK
// from a shoulder fixed to the body finds the elbow, and the forearm's roll is shared between the elbow,
// a twist bone at mid-forearm and the wrist so pronation never wrings the skin.
import * as THREE from 'three';
import { wash } from './materials.js';
import { quill } from './inkwell.js';
import { knitTex } from './textures.js';

import { UPPER, FORE, FINGERS, FNAMES, THUMB, buildSkinData } from './handmesh.js';
import { ANATOMY } from './anatomy.js';
import { ContactSolver, THUMB_CURL, CURL } from './contact.js';
import { GRIPS } from './contacts.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (x) => x * x * (3 - 2 * x);
const onTable = (p) => p?.frame === 'book';
const LIFT = 0.06;     // how high a hand rises over the table's edge, on its way onto it or off it (m)
const LEAN_RATE = 0.6; // how fast the writer leans along the book after the point (m/s)

// The skin is built once, for the right hand at rest, and shared (mirrored) by both arms. Building it
// takes a second or so, so the game starts it in a worker as it boots (prepareSkin) and waits for it
// only when the keeper is made; anything that comes first without it builds it here instead.
let SKIN = null, pending = null;
export function prepareSkin() {
  if (SKIN) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise((resolve) => {
    let w;
    const here = () => { if (!SKIN) SKIN = buildSkinData(); resolve(); };
    try { w = new Worker(new URL('./handmesh-worker.js', import.meta.url), { type: 'module' }); } catch { here(); return; }
    w.onmessage = (e) => { SKIN ||= e.data; w.terminate(); resolve(); };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); here(); };
    w.postMessage(0);
  });
  return pending;
}
export const SKIN_STATS = {};

// ---------------------------------------------------------------------------------------------------
// Geometry: rings of points along a bone chain, stitched into tubes, with bone weights and a tint.
class Loft {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.si = []; this.sw = []; this.tint = []; }
  get count() { return this.pos.length / 3; }
  vert(p, weights, tint, uv = [0, 0]) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(uv[0], uv[1]);
    // the four strongest influences, normalised
    const w = weights.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = w.reduce((s, e) => s + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) { this.si.push(w[i] ? w[i][0] : 0); this.sw.push(w[i] ? w[i][1] / sum : 0); }
    this.tint.push(tint[0], tint[1], tint[2], tint[3] ?? 0);
    return this.count - 1;
  }
  // rings: [{ pts: [Vector3], w: weights | (k) => weights, tint: (k) => rgba, uv: (k) => [u,v] }]
  tube(rings, { capStart = false, capEnd = false, endPoint = null, startPoint = null } = {}) {
    const n = rings[0].pts.length;
    const base = [];
    for (const r of rings) {
      const row = [];
      for (let k = 0; k < n; k++) {
        const w = typeof r.w === 'function' ? r.w(k) : r.w;
        row.push(this.vert(r.pts[k], w, r.tint(k), r.uv ? r.uv(k) : [k / n, 0]));
      }
      base.push(row);
    }
    for (let j = 0; j < base.length - 1; j++) {
      for (let k = 0; k < n; k++) {
        const a = base[j][k], b = base[j][(k + 1) % n], c = base[j + 1][k], d = base[j + 1][(k + 1) % n];
        this.idx.push(a, c, b, b, c, d);
      }
    }
    const cap = (row, ring, pt, flip) => {
      const c = pt || ring.pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
      const ci = this.vert(c, typeof ring.w === 'function' ? ring.w(0) : ring.w, ring.tint(0));
      for (let k = 0; k < n; k++) {
        const a = row[k], b = row[(k + 1) % n];
        if (flip) this.idx.push(ci, b, a); else this.idx.push(ci, a, b);
      }
    };
    if (capStart) cap(base[0], rings[0], startPoint, true);
    if (capEnd) cap(base[base.length - 1], rings[rings.length - 1], endPoint, false);
  }
  geometry(mirror) {
    const g = new THREE.BufferGeometry();
    const pos = Float32Array.from(this.pos);
    const idx = this.idx.slice();
    if (mirror) {
      for (let i = 0; i < pos.length; i += 3) pos[i] = -pos[i];
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tint, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

// a superellipse cross-section in the plane spanned by X, Y around centre c
function section(c, X, Y, rx, ry, n, e = 2.2, shape = null) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    let x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * rx;
    let y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e) * ry;
    if (shape) [x, y] = shape(x, y, a);
    pts.push(c.clone().addScaledVector(X, x).addScaledVector(Y, y));
  }
  return pts;
}

export class Arm {
  constructor(side, mats) {
    this.side = side;            // 1 right, -1 left
    this.mirror = side < 0;
    this.mats = mats;
    const bones = this.bones = [];
    const B = this.B = {};
    const mk = (name, parent, pos, rest = null) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(pos[0] * side, pos[1], pos[2]);
      b.rotation.order = 'YXZ';
      if (rest) b.rotation.set(rest[0], rest[1] * side, rest[2] * side);
      b.userData.rest = b.quaternion.clone();
      if (parent) parent.add(b);
      B[name] = b;
      b.userData.i = bones.length;
      bones.push(b);
      return b;
    };
    mk('shoulder', null, [0, 0, 0]);
    mk('elbow', B.shoulder, [0, 0, -UPPER]);
    mk('twist', B.elbow, [0, 0, -FORE / 2]);
    mk('wrist', B.twist, [0, 0, -FORE / 2]);
    for (const f of FNAMES) {
      const F = FINGERS[f];
      mk(f + '1', B.wrist, F.base, [0, F.fan, 0]);
      mk(f + '2', B[f + '1'], [0, 0, -F.len[0]]);
      mk(f + '3', B[f + '2'], [0, 0, -F.len[1]]);
    }
    mk('thumb1', B.wrist, THUMB.base, THUMB.rest);
    mk('thumb2', B.thumb1, [0, 0, -THUMB.len[0]]);
    mk('thumb3', B.thumb2, [0, 0, -THUMB.len[1]]);

    this.root = new THREE.Group();
    this.root.name = side > 0 ? 'right arm' : 'left arm';
    B.shoulder.updateMatrixWorld(true);
    const skelArm = new THREE.Skeleton(bones);
    const skin = this.buildSkin();
    const sleeve = this.buildSleeve();
    this.mesh = new THREE.SkinnedMesh(skin, mats.flesh);
    this.sleeve = new THREE.SkinnedMesh(sleeve, mats.wool);
    this.mesh.add(B.shoulder);
    this.mesh.bind(skelArm);
    this.sleeve.bind(skelArm);
    for (const m of [this.mesh, this.sleeve]) { m.frustumCulled = false; m.matrixAutoUpdate = false; }
    this.root.add(this.mesh, this.sleeve);
    this.skeleton = skelArm;

    // what the hand holds, parented to the wrist
    this.held = {};
  }

  i(name) { return this.B[name].userData.i; }

  // rest-pose world transform of a bone (arm space) — used to place lofted rings
  restMatrix(name) { this.B[name].updateMatrixWorld(true); return this.B[name].matrixWorld.clone(); }

  // The skin: one surface for forearm, hand, fingers and thumb (handmesh.js), meshed once for the right
  // hand and mirrored for the left.
  buildSkin() {
    if (!SKIN) SKIN = buildSkinData();
    Object.assign(SKIN_STATS, SKIN.stats);
    const g = new THREE.BufferGeometry();
    const pos = SKIN.pos.slice(), nor = SKIN.nor.slice(), idx = SKIN.idx.slice();
    if (this.mirror) {
      for (let i = 0; i < pos.length; i += 3) { pos[i] = -pos[i]; nor[i] = -nor[i]; }
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SKIN.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SKIN.sw, 4));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.mirror ? SKIN.tintL : SKIN.tint, 4));
    g.setAttribute('skin', new THREE.Float32BufferAttribute(SKIN.skin, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  // the sleeve of a wool jumper pushed up the forearm: bunched in soft folds, a rolled edge
  buildSleeve() {
    const L = new Loft();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const N = 22;
    const iS = this.i('shoulder'), iE = this.i('elbow'), iT = this.i('twist');
    const end = -0.105;                // how far down the forearm it reaches
    const seed = this.side > 0 ? 0.3 : 1.7;
    const rings = [];
    const zs = [];
    // all the way up to the shoulder (seen from above, standing at the table), rounded off over it
    for (let k = 0; k < 6; k++) zs.push({ z: UPPER + 0.036 * Math.cos((k / 6) * Math.PI / 2) * (k ? 1 : 0.98), inner: 0 });
    for (let z = UPPER; z > end + 0.012; z -= 0.008) zs.push({ z, inner: 0 });
    // the rolled cuff: out over the edge and back inside
    for (let k = 0; k <= 6; k++) zs.push({ z: end + 0.012 - Math.sin((k / 6) * Math.PI / 2) * 0.012, roll: k / 6 });
    for (let k = 1; k <= 4; k++) zs.push({ z: end + (k / 4) * 0.03, inner: k / 4 });
    for (const s of zs) {
      const z = s.z;
      const u = Math.max(0, -z / FORE);
      // the forearm's own size here, plus the wool's thickness and the slack of the bunching
      const bulge = Math.exp(-Math.pow((u - 0.22) / 0.25, 2));
      const arx = lerp(0.039, 0.0295, sstep(0.1, 1, u)) + bulge * 0.004;
      const ary = lerp(0.035, 0.0185, sstep(0.05, 1, u)) + bulge * 0.004;
      const bunch = sstep(0.12, end - 0.02, z);   // 0 up the arm → 1 at the cuff
      let grow = 0.009 + bunch * 0.009;
      if (s.roll != null) grow += 0.004 + Math.sin(s.roll * Math.PI) * 0.005 - s.roll * 0.006;
      if (s.inner) grow = 0.006 - s.inner * 0.004;
      const c = V(0, 0.002, -UPPER + z);
      // the shoulder: fuller, and domed over the top
      const sh = sstep(0.16, UPPER, z) * 0.012;
      const dome = z > UPPER ? Math.sqrt(Math.max(0.004, 1 - Math.pow((z - UPPER) / 0.036, 2))) : 1;
      const pts = section(c, V(1, 0, 0), V(0, 1, 0), (arx + grow + sh) * dome, (ary + grow + sh) * dome, N, 2.0, (x, y, a) => {
        if (s.inner) return [x, y];
        // folds: rings of slack that wander round the arm
        const f = Math.sin(z * 210 + Math.sin(a * 2 + seed) * 1.6 + seed) * 0.5 + 0.5;
        const ridge = Math.pow(f, 3) * 0.004 * (0.3 + bunch);
        const crease = Math.sin(a * 3 + z * 40 + seed * 2) * 0.0012;
        const k = 1 + (ridge + crease) / Math.hypot(x, y);
        return [x * k, y * k - (y < 0 ? 0.002 * bunch : 0)];
      });
      const w = [[iS, sstep(0.0, 0.08, z)], [iE, 1 - sstep(0.0, 0.08, z)], [iT, u * 0.8]];
      rings.push({ pts, w, tint: () => [1, 1, 1, 0], uv: (k) => [k / N * 3, z * 9] });
    }
    L.tube(rings, { capStart: true, startPoint: V(0, 0.002, 0.036) });
    return L.geometry(this.mirror);
  }

  // attach an object to the hand (pencil, pen, match): it's posed in wrist space
  hold(name, obj) {
    if (this.held[name]) return;
    this.held[name] = obj;
    obj.visible = false;
    this.B.wrist.add(obj);
  }
}

// ---------------------------------------------------------------------------------------------------
// Things held: a pencil, and the quill (inkwell.js). Each has its working point at its origin.
function pencil(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.13, 6).translate(0, 0.065 + 0.018, 0), mats.pencil);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0009, 0.016, 6).translate(0, 0.01, 0), mats.wood);
  const lead = new THREE.Mesh(new THREE.ConeGeometry(0.0009, 0.003, 6).rotateX(Math.PI).translate(0, 0.0015, 0), mats.graphite);
  cone.position.y = 0.002;
  g.add(body, cone, lead);
  // the shaft runs along +Y from the tip at the origin
  g.userData.tip = new THREE.Vector3(0, 0, 0);
  return g;
}


// ---------------------------------------------------------------------------------------------------
// Poses. A pose sets, for each hand, where the wrist goes (in some frame: the body, the book, the
// chair, a world object), how it's turned, how the fingers and thumb are bent, and what it holds.
// Fingers: [spread, mcp, pip, dip] (radians; spread > 0 fans out from the middle finger).
// Thumb: [flex across the palm, swing away from the palm, roll, mcp, ip].
const RELAX = { fingers: { index: [0.02, 0.25, 0.35, 0.2], middle: [0, 0.3, 0.42, 0.22], ring: [0.02, 0.36, 0.48, 0.25], little: [0.06, 0.42, 0.52, 0.28] }, thumb: [0.1, 0.05, 0, 0.15, 0.2] };
const FLAT = { fingers: { index: [0.05, 0.16, 0.2, 0.1], middle: [0.0, 0.18, 0.22, 0.1], ring: [0.04, 0.2, 0.24, 0.12], little: [0.1, 0.22, 0.26, 0.14] }, thumb: [-0.05, 0.2, 0.05, 0.1, 0.15] };
const GRIP = { fingers: { index: [0, 1.05, 1.2, 0.7], middle: [0, 1.15, 1.3, 0.75], ring: [0, 1.2, 1.35, 0.75], little: [0.05, 1.25, 1.35, 0.7] }, thumb: [0.55, 0.1, 0.4, 0.5, 0.5] };
// tripod: the pencil pinched between the pads of thumb and index, lying on the side of the middle
// finger; ring and little curled under, the hand resting on its little-finger edge
const TRIPOD = { fingers: { index: [0.0, 0.62, 0.62, 0.15], middle: [-0.05, 0.72, 0.95, 0.4], ring: [0, 1.1, 1.25, 0.6], little: [0.05, 1.2, 1.3, 0.6] }, thumb: [0.55, 0.2, 0.5, 0.25, 0.15] };
const PINCH = { fingers: { index: [0.02, 0.35, 0.55, 0.3], middle: [0, 0.55, 0.75, 0.4], ring: [0.02, 0.75, 0.9, 0.5], little: [0.06, 0.85, 0.95, 0.5] }, thumb: [0.5, 0.25, 0.35, 0.2, 0.1] };
const CUP = { fingers: { index: [0.0, 0.55, 0.6, 0.3], middle: [0, 0.55, 0.62, 0.32], ring: [0, 0.6, 0.66, 0.34], little: [0.05, 0.66, 0.7, 0.36] }, thumb: [0.15, 0.35, 0.2, 0.25, 0.3] };
const DRAPE = { fingers: { index: [0.04, 0.35, 0.5, 0.3], middle: [0, 0.42, 0.58, 0.32], ring: [0.04, 0.5, 0.62, 0.34], little: [0.1, 0.58, 0.66, 0.36] }, thumb: [0.05, 0.2, 0.1, 0.2, 0.25] };
const hand = (base, extra) => ({ ...base, ...extra, fingers: { ...base.fingers, ...(extra?.fingers || {}) } });

// frames available to poses: 'body' (eye, turned with the body), 'book' (the open logbook, x across,
// y up, z toward the reader), 'chair', 'world', 'lever', 'rail', 'door' — supplied by the keeper.
export const POSES = {
  // walking: hands low at the sides, barely in view; they swing with the pace
  walk: {
    R: hand(RELAX, { frame: 'body', pos: [0.24, -0.66, -0.3], align: [1, 0.1, 0.3], swing: 1 }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.66, -0.3], align: [-1, 0.1, 0.3], swing: -1 }),
  },
  // reaching for the door's iron ring
  door: {
    R: hand(GRIP, { frame: 'door', pos: [0, -0.01, 0.05], rot: [0.0, 0.0, -1.45], thumb: [0.7, 0.0, 0.5, 0.5, 0.4] }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.72, -0.12], align: [-1, 0.1, 0.3] }),
  },
  // leaning over the book: both hands flat on the table either side of it, never on the pages; the
  // finger tips at most on the leather beyond them. (Tipped toward the fingers, the wrist up off the
  // table: where the forearm coming down from the shoulder lets them lie.)
  lean: {
    R: hand(FLAT, { frame: 'book', pos: [0.43, 0.024, 0.23], rot: [0.0, 0.32, 0.03] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // ready to write: the same, the pencil lying in the right hand, which rests on its little-finger side
  ready: {
    R: hand(TRIPOD, { frame: 'book', pos: [0.41, 0.05, 0.2], rot: [0.0, 0.42, -0.62], hold: 'pencil',
      fingers: { index: [0.01, 0.542, 0.449, -0.084], middle: [0.883, 0.636, 0.487, -0.243], ring: [0, 1.31, 1.48, 0.75], little: [0.05, 1.57, 1.74, 0.88] },
      thumb: [0.561, -0.398, 0.324, -0.023, -0.489] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // writing: the pencil tip is placed by IK under the cursor, the hand trailing behind it to the lower
  // right; the left hand stays where it was, beside the book
  write: {
    R: hand(TRIPOD, { frame: 'book', tip: true, hold: 'pencil', rot: [-0.0985, 0.5169, -0.5099], home: [0.144, 0], follow: [0.6009, -0.1093, 0.1041], lean: 0.8,
      fingers: { index: [0.01, 0.542, 0.449, -0.084], middle: [0.883, 0.636, 0.487, -0.243], ring: [0, 1.31, 1.48, 0.75], little: [0.3, 1.57, 1.74, 0.88] }, thumb: [0.561, -0.398, 0.324, -0.023, -0.489] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // the dip pen: held a little more upright, the same left hand
  pen: {
    R: hand(TRIPOD, { frame: 'book', tip: true, hold: 'pen', rot: [0.02, 0.38, -0.5],
      fingers: { index: [0, 0.48, 0.52, 0.06], middle: [-0.05, 0.5, 0.76, -0.14] }, thumb: [0.46, -0.42, 0.8, 0.05, -0.6] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // turning a page: the right hand's fingers slip under the near corner and lift it; the leaf goes over
  // on its own while the hand stays low, ready for the next
  turn: {
    R: hand(PINCH, { frame: 'book', pos: [0.31, 0.06, 0.2], rot: [0.25, 0.85, -0.25],
      fingers: { index: [0.02, 0.2, 0.25, 0.15], middle: [0, 0.3, 0.35, 0.2], ring: [0.02, 0.45, 0.5, 0.3], little: [0.06, 0.55, 0.6, 0.35] }, thumb: [0.45, 0.35, 0.3, 0.1, 0.05] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // closing the book at dawn: the left hand pinches the cover's edge (thumb on top) and lifts it until
  // it stands up; then lets it fall shut and goes back beside the book (the keeper decides when)
  close: {
    R: hand(FLAT, { frame: 'book', pos: [0.43, 0.024, 0.23], rot: [0.0, 0.32, 0.03] }),
    L: hand(FLAT, { frame: 'lid', pos: [-0.031, -0.006, 0.0], at: [0.004, -0.012, -0.165], rot: [-0.1, -0.22, -0.7],
      fingers: { index: [0.04, 0.3, 0.35, 0.2], middle: [0, 0.32, 0.38, 0.22], ring: [0.04, 0.36, 0.4, 0.24], little: [0.1, 0.4, 0.44, 0.26] }, thumb: [0.1, 0.15, 0.1, 0.15, 0.2] }),
  },
  // in the chair: forearms along the arms, hands loose over the ends
  chair: {
    R: hand(DRAPE, { frame: 'chair', pos: [0.36, 0.705, -0.31], rot: [0.0, 0.06, 0.0] }),
    L: hand(DRAPE, { frame: 'chair', pos: [-0.36, 0.705, -0.31], rot: [0.0, -0.06, 0.0] }),
  },
  // tea: a mug held in both hands in the lap, palms round it
  mug: {
    R: hand(CUP, { frame: 'mug', pos: [0.07, -0.005, 0.05], rot: [-0.1, 0.75, -1.3] }),
    L: hand(CUP, { frame: 'mug', pos: [-0.07, -0.005, 0.05], rot: [-0.1, -0.75, 1.3] }),
  },
  // pulling the lamp control's lever down
  lamp: {
    R: hand(CUP, { frame: 'lever', pos: [0.0, 0.036, -0.06], at: [0.0, -0.018, -0.058], rot: [-0.05, 3.99, 1.05],
      fingers: { index: [0.06, 0.7, 0.75, 0.45], middle: [0, 0.72, 0.8, 0.45], ring: [0.04, 0.75, 0.82, 0.45], little: [0.1, 0.8, 0.85, 0.45] }, thumb: [0.35, 0.3, 0.3, 0.3, 0.35] }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.7, -0.14], align: [-1, 0.1, 0.3] }),
  },
  // climbing: the right hand slides up the rail, the left steadies against the wall
  rail: {
    R: hand(GRIP, { frame: 'rail', pos: [0.0, 0.02, 0.0], rot: [0.1, 0.0, -0.2], fingers: { index: [0, 0.9, 1.0, 0.55], middle: [0, 1.0, 1.1, 0.6] } }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.7, -0.1], align: [-1, 0.1, 0.3] }),
  },
  // inking the plan, step by step (the keeper runs them in turn; the left hand stays beside the book):
  // the pencil set down in the tray, point first
  'ink-tray': {
    R: hand(TRIPOD, { frame: 'trayPencil', grasp: 'pencil', hold: 'pencil',
      fingers: { index: [0.01, 0.542, 0.449, -0.084], middle: [0.883, 0.636, 0.487, -0.243] }, thumb: [0.561, -0.398, 0.324, -0.023, -0.489] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // the hand round the inkwell, thumb over the top, to slide it in beside the book
  'ink-well': {
    R: hand(CUP, { frame: 'inkwell', pos: [0.036, 0.028, 0.004], at: [0.0, -0.018, -0.05], rot: [0.0, 0.35, -Math.PI / 2],
      fingers: { index: [0.05, 0.7, 0.7, 0.35], middle: [0, 0.78, 0.75, 0.38], ring: [0.03, 0.82, 0.8, 0.4], little: [0.08, 0.86, 0.82, 0.4] }, thumb: [0.3, 0.2, 0.2, 0.25, 0.3] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // fingers on the quill where it stands in the well; and the quill drawn up out of it
  'ink-take': {
    R: hand(TRIPOD, { frame: 'quillWell', grasp: 'pen', hold: 'pen',
      fingers: { index: [0, 0.48, 0.52, 0.06], middle: [-0.05, 0.5, 0.76, -0.14] }, thumb: [0.46, -0.42, 0.8, 0.05, -0.6] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  'ink-lift': {
    R: hand(TRIPOD, { frame: 'quillUp', grasp: 'pen', hold: 'pen',
      fingers: { index: [0, 0.48, 0.52, 0.06], middle: [-0.05, 0.5, 0.76, -0.14] }, thumb: [0.46, -0.42, 0.8, 0.05, -0.6] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.412, 0.019, 0.127], rot: [0.37, 0.17, -0.03] }),
  },
  // debug only (the hands review's studio): held up before the face, fingers at ease
  show: {
    R: hand(RELAX, { frame: 'body', pos: [0.1, -0.12, -0.36], rot: [0.5, 0.25, 0.1] }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.7, -0.14], align: [-1, 0.1, 0.3] }),
  },
};
export const POSE_NAMES = Object.keys(POSES);

// ---------------------------------------------------------------------------------------------------
// Both arms, posed, blended and solved each frame.
export class Hands {
  constructor() {
    this.mats = {
      flesh: wash({ color: '#D6A48A', color2: '#C48F80', tint: true, skin: true, band: 0.38, bare: 0.45, line: 1, crease: 0.22, gran: 0.35, turb: 0.6, noiseScale: 45, stain: 0.2 }),
      wool: wash({ color: '#3C4A62', color2: '#323E55', map: knitTex(), mapAmt: 0.9, line: 1, crease: 0.55, gran: 1.0, turb: 0.9, noiseScale: 40 }),
      pencil: wash({ color: '#3F5E3B', color2: '#36523A', line: 1, crease: 0.4, gran: 0.4, noiseScale: 60 }),
      wood: wash({ color: '#D9BC8E', line: 1, crease: 0.3, gran: 0.6, noiseScale: 80 }),
      graphite: wash({ color: '#3B3B40', line: 1, gran: 0.2 }),
      penwood: wash({ color: '#4A362A', color2: '#3E2D24', line: 1, crease: 0.4, gran: 0.5, noiseScale: 60 }),
      steel: wash({ color: '#8A8E94', line: 1, gran: 0.3 }),
      nib: wash({ color: '#6E7278', line: 1, gran: 0.2, side: THREE.DoubleSide }),
    };
    this.R = new Arm(1, this.mats);
    this.L = new Arm(-1, this.mats);
    this.group = new THREE.Group();
    this.group.name = 'hands';
    this.group.add(this.R.root, this.L.root);
    this.pencil = pencil(this.mats);
    this.pen = quill();
    this.R.hold('pencil', this.pencil);
    this.R.hold('pen', this.pen);
    this.tools = { pencil: this.pencil, pen: this.pen };
    // where each tool sits in the right wrist's frame for the tripod grip: shaft back over the
    // web of the thumb, tip out past the index pad, the pencil about 48° up from the page as it writes
    this.gripPencil = { pos: new THREE.Vector3(-0.0222, -0.0752, -0.1489), rot: new THREE.Euler(0.6912, -0.1553, 0.1239, 'YXZ') };
    // the quill a touch more upright, its feather back over the hand
    this.gripPen = { pos: new THREE.Vector3(-0.024, -0.066, -0.15), rot: new THREE.Euler(0.68, -0.15, 0, 'YXZ') };
    for (const [t, gp] of [[this.pencil, this.gripPencil], [this.pen, this.gripPen]]) { t.position.copy(gp.pos); t.rotation.copy(gp.rot); }
    this.grips = { pencil: this.gripPencil, pen: this.gripPen };

    this.pose = 'walk';
    this.from = null; this.blend = 1; this.blendDur = 0.5;
    this.t = 0;
    this.visible = true;
    // per-hand springs on the wrist target: a little overshoot when they move
    this.spring = { R: null, L: null };
    this.contact = null;
    this.frames = {};
    this.tip = null;          // world point for the writing tip
    this.lift = 0;            // tip lifted off the page (0 pressed .. 1 hovering)
  }

  setPose(name, dur = 0.55) {
    if (!POSES[name] || name === this.pose) return;
    this.from = this.snapshot || null;
    this.fromPose = this.pose;
    this.pose = name;
    this.blend = 0; this.blendDur = dur;
  }

  setStain(k) { this.mats.flesh.uniforms.uStain.value = k; }

  // a tool into the right hand (as it's gripped) or out of it, laid somewhere (parent, local transform)
  take(name) {
    const t = this.tools[name], gp = this.grips[name];
    this.R.B.wrist.add(t);
    t.position.copy(gp.pos); t.rotation.copy(gp.rot);
  }
  put(name, parent, pos, rot) {
    const t = this.tools[name];
    parent.add(t);
    t.position.copy(pos); t.rotation.copy(rot);
    t.visible = true;
  }
  inHand(name) { return this.tools[name].parent === this.R.B.wrist; }

  // resolve a hand's pose into a world wrist target and finger values
  resolve(p, side, frames, S = null, pole = null) {
    const F = frames[p.frame] || frames.body;
    let wq;
    if (p.align && S) {
      // a hand that hangs: it carries on from the forearm (a little curled toward the palm), its back
      // turned the way `align` says
      const T = new THREE.Vector3(...p.pos).applyQuaternion(F.quat).add(F.pos);
      const E = elbowAt(S, T, pole);
      const fd = T.clone().sub(E).normalize();
      const back = new THREE.Vector3(...p.align).applyQuaternion(F.quat);
      back.addScaledVector(fd, -back.dot(fd)).normalize();
      wq = basisQuat(fd.addScaledVector(back, -0.2).normalize(), back);
    } else if (p.rot) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot[0], p.rot[1], p.rot[2], 'YXZ'));
      wq = F.quat.clone().multiply(q);
      // a hand placed by its point turns with the arm: as it is set at `home` (a place in its frame,
      // x and z), and elsewhere turned about the frame's up by `follow` [part, least, most] of as much as
      // the line from the shoulder to the point has turned from the line to home
      if (p.tip && p.follow && this.tip && S) {
        const inv = F.quat.clone().invert(), s = S.clone().sub(F.pos).applyQuaternion(inv), t = this.tip.clone().sub(F.pos).applyQuaternion(inv);
        const [part, lo, hi] = p.follow;
        const yaw = Math.max(lo, Math.min(hi, part * wrapPi(Math.atan2(t.x - s.x, t.z - s.z) - Math.atan2(p.home[0] - s.x, p.home[1] - s.z))));
        wq = F.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(_Y, yaw)).multiply(q);
      }
    } else wq = F.quat.clone();
    let pos;
    if (p.grasp && F.tool) {
      // the hand where it would be holding this tool, the tool lying as the frame says (on the desk, in
      // the well, at the start of the line): the grip run backwards
      const gp = this.grips[p.grasp];
      wq = F.quat.clone().multiply(new THREE.Quaternion().setFromEuler(gp.rot).invert());
      pos = F.pos.clone().sub(gp.pos.clone().applyQuaternion(wq));
    } else if (p.tip && this.tip) {
      // the tool's working tip goes to the target; the wrist sits wherever that puts it
      const gp = this.grips[p.hold];
      pos = this.tip.clone().sub(gp.pos.clone().applyQuaternion(wq));
    } else {
      pos = new THREE.Vector3(...p.pos).applyQuaternion(F.quat).add(F.pos);
      // `at`: a point of the hand (wrist space) that goes to `pos`, rather than the wrist itself
      if (p.at) pos.sub(new THREE.Vector3(...p.at).applyQuaternion(wq));
    }
    // a hanging hand follows its arm; any other leads it (the elbow goes where suits the hand)
    return { pos, quat: wq, fingers: p.fingers, thumb: p.thumb, hold: p.hold, swing: p.swing || 0, lead: p.align ? 0 : 1 };
  }

  // the contact solver (contact.js), given the room's colliders by the keeper
  attach(colliders) { this.contact = new ContactSolver(this, colliders); }

  // frames: { body: {pos, quat}, book: {...}, ... }; shoulders: { R: Vector3, L: Vector3 } world; pole dirs
  update(dt, frames, { shoulders, poles, bob = 0 }) {
    this.t += dt;
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.blendDur);
    const e = this.blend * this.blend * (3 - 2 * this.blend);
    // the writer leans the way the point goes across the book: the writing arm's shoulder follows the
    // point's way along the book from `home` by the pose's `lean`, at a steady pace, and comes back after
    // (the arms are solved from there; the hands are turned as the body's shoulders have them)
    const body0 = shoulders;
    shoulders = { ...shoulders };
    for (const s of ['R', 'L']) {
      const P = POSES[this.pose][s], B = frames.book, arm = this[s];
      let goal = 0;
      if (P.lean && this.tip && B) goal = P.lean * (this.tip.clone().sub(B.pos).applyQuaternion(B.quat.clone().invert()).x - P.home[0]);
      const r = LEAN_RATE * dt, now = arm.lean ?? 0;
      arm.lean = now + Math.max(-r, Math.min(r, goal - now));
      if (arm.lean && B) shoulders[s] = shoulders[s].clone().add(new THREE.Vector3(arm.lean, 0, 0).applyQuaternion(B.quat));
    }
    const cur = {};
    for (const s of ['R', 'L']) {
      const now = this.resolve(POSES[this.pose][s], s, frames, body0[s], poles[s]);
      let t = now;
      if (this.from && e < 1) {
        const a = this.from[s];
        t = {
          pos: a.pos.clone().lerp(now.pos, e),
          quat: a.quat.clone().slerp(now.quat, e),
          fingers: mixFingers(a.fingers, now.fingers, e),
          thumb: a.thumb.map((v, i) => lerp(v, now.thumb[i], e)),
          hold: e > 0.5 ? now.hold : a.hold,
          swing: lerp(a.swing, now.swing, e),
          lead: lerp(a.lead ?? 1, now.lead, e),
        };
        // onto the table or off it, the hand rises first and comes down last, so it goes over the
        // table's edge, not through it
        if (onTable(POSES[this.pose][s]) !== onTable(POSES[this.fromPose]?.[s])) {
          const ev = now.pos.y > a.pos.y ? 1 - (1 - e) ** 4 : e ** 4;
          t.pos.y = lerp(a.pos.y, now.pos.y, ev) + Math.sin(Math.PI * e) * LIFT;
        }
      }
      cur[s] = t;
    }
    this.snapshot = cur;
    const body = frames.body;
    // a cut (the camera carried somewhere else at once): the hands are simply where they belong
    if (this.lastBody && (body.pos.distanceTo(this.lastBody.pos) > 0.5 || body.quat.angleTo(this.lastBody.quat) > 1.0)) {
      this.lastBody = null; this.from = null; this.blend = 1;
      this.spring = { R: null, L: null };
      for (const a of [this.R, this.L]) { a.pp = null; a.roll = null; a.curl = null; a.lay = null; a.lift = null; a.lean = null; }
      for (const s of ['R', 'L']) cur[s] = this.resolve(POSES[this.pose][s], s, frames, body0[s], poles[s]);
    }
    // What carries each hand's follower. A hand settled in a pose rides with that pose's frame (the
    // book, the lever, the door's ring, the inkwell...), so it stays on what it holds as that moves and
    // is still while it doesn't, whatever the body does. A hand posed on the body rides with the body:
    // whatever it did since last frame (stepped, turned, stood up), the hand is carried along, and only
    // its movement relative to it is eased. Between poses it rides with both ends' frames, the one it's
    // leaving at first and the one it's going to by the end (a hand coming down onto the book isn't
    // dragged into the table by the body leaning in over it).
    const carry = (name, sp, w, out) => {
      const F = name === 'body' ? body : frames[name], last = this.lastFrames?.[name];
      if (!F || !last) return out.add(_v.copy(sp.pos).multiplyScalar(w));
      const d = _q1.copy(F.quat).multiply(_q2.copy(last.quat).invert());
      return out.add(_v.copy(sp.pos).sub(last.pos).applyQuaternion(d).add(F.pos).multiplyScalar(w));
    };
    for (const s of ['R', 'L']) {
      const sp = this.spring[s];
      if (!sp || !this.lastFrames) continue;
      const to = POSES[this.pose][s].frame || 'body', from = (this.from && this.blend < 1 && POSES[this.fromPose]?.[s]?.frame) || 'body';
      const w = this.from && this.blend < 1 ? e : 1;
      const p = new THREE.Vector3();
      carry(to, sp, w, p);
      if (w < 1) carry(from, sp, 1 - w, p);
      // (its pace and its elbow turned as the frame that carries it most turned)
      const main = w >= 0.5 ? to : from, F = main === 'body' ? body : frames[main], last = this.lastFrames[main];
      if (F && last) {
        const d = _q1.copy(F.quat).multiply(_q2.copy(last.quat).invert());
        sp.vel.applyQuaternion(d);
        this[s].pp?.applyQuaternion(d);
      }
      sp.pos.copy(p);
    }
    this.lastFrames = { body: { pos: body.pos.clone(), quat: body.quat.clone() } };
    for (const [name, F] of Object.entries(frames)) if (F && F.pos && F.quat && name !== 'body') this.lastFrames[name] = { pos: F.pos.clone(), quat: F.quat.clone() };
    this.lastBody = { pos: body.pos.clone(), quat: body.quat.clone() };

    this.contact?.frame();
    for (const s of ['R', 'L']) {
      const arm = this[s], t = cur[s], P = POSES[this.pose][s];
      // the writing hand turned about its point as the contact solver lays it there (contact.js)
      if (P.tip && this.tip && this.blend >= 1 && this.contact && GRIPS[this.pose]?.[s]?.anchor) {
        const g = this.grips[P.hold].pos, at = t.pos.clone().add(g.clone().applyQuaternion(t.quat));
        t.quat = this.contact.layPoint(s, arm, t.quat, at, g, [P.hold === 'pen' ? 'quill' : 'pencil']);
        t.pos = at.sub(g.clone().applyQuaternion(t.quat));
      }
      // the hands move like a careful old man's: steady, no tremor, no bounce. Each wrist follows its
      // target critically damped (it arrives without overshooting). The writing hand, once it is in its
      // pose, puts the point exactly where it's drawing, only never faster than a hand moves (a tap
      // across the page is a quick reach, not a jump). Walking, the arms swing with the pace.
      const tgt = t.pos.clone();
      if (t.swing) tgt.addScaledVector(frames.body.fwd, Math.sin(bob * Math.PI) * 0.05 * t.swing);
      let sp = this.spring[s];
      if (!sp || sp.pos.distanceTo(tgt) > 0.6) sp = this.spring[s] = { pos: tgt.clone(), vel: new THREE.Vector3() };
      const tip = P.tip && this.tip && this.blend >= 1;
      if (tip) {
        const d = tgt.clone().sub(sp.pos), l = d.length(), max = 1.5 * dt;
        sp.pos.addScaledVector(d, l > max ? max / l : 1);
        sp.vel.set(0, 0, 0);
      } else if (this.blend >= 1 && sp.tgt && sp.tgt.distanceToSquared(tgt) < 1e-14 && (sp.rest || calm(sp, tgt))) settle(sp, tgt, dt);
      else { sp.rest = null; follow(sp, tgt, P.tip ? 34 : 11, dt); }
      (sp.tgt ||= new THREE.Vector3()).copy(tgt);
      const T = sp.pos.clone();
      this.solve(arm, shoulders[s], T, t.quat, poles[s], dt, t.lead ?? 1);
      // a tool's point exactly where it's asked: if the wrist couldn't turn as far as the pose wanted
      // (held in its range), the point would be carried off, so the hand is moved to put it back
      if (tip) {
        const gp = this.grips[P.hold], at = sp.pos.clone().add(gp.pos.clone().applyQuaternion(t.quat));
        for (let i = 0; i < 2; i++) {
          arm.B.wrist.updateWorldMatrix(true, false);
          const q = _q1.setFromRotationMatrix(arm.B.wrist.matrixWorld);
          T.copy(at).sub(gp.pos.clone().applyQuaternion(q));
          this.solve(arm, shoulders[s], T, t.quat, poles[s], 0, t.lead ?? 1);
        }
      }
      this.fingers(arm, t);
      if (this.contact) {
        // a tool in the hand (or being taken up) is the hand's: its fingers are posed round it, and keep
        // out of the rest
        const hold = P.hold && this.inHand(P.hold) ? (P.hold === 'pen' ? 'quill' : 'pencil') : null;
        const skip = [hold, P.grasp === 'pen' ? 'quill' : P.grasp].filter(Boolean);
        // the grip of the pose the hand is going to comes in over the second half of the way there (the
        // last one's goes over the first half); the same grip at both ends holds all the way
        const gIn = GRIPS[this.pose]?.[s], gOut = this.from ? GRIPS[this.fromPose]?.[s] : gIn;
        let spec = gIn, weight = 1;
        if (this.from && this.blend < 1 && gIn !== gOut) {
          if (this.blend >= 0.5) weight = smooth01((this.blend - 0.5) / 0.5);
          else { spec = gOut; weight = smooth01(1 - this.blend / 0.5); }
        }
        const ctx = {
          spec, weight, dt, t, T, tip, wq: t.quat,
          skip,
          resolve: (T2, q2) => this.solve(arm, shoulders[s], T2, q2 || t.quat, poles[s], 0, t.lead ?? 1),
        };
        let curl = this.contact.apply(s, arm, ctx);
        // a hand at rest stays where it was laid, as a hand on a table does: while its target holds still
        // and the body moves no more than a breath, it's kept as it was unless the solver's answer has
        // moved on by more than a hair (so it doesn't creep as the body breathes). The arm is kept too: the
        // shoulder, the elbow and the forearm's turn as they were, the forearm planted with the hand, not
        // swayed by the breath.
        const W = arm.B.wrist, L = arm.rest, still = sp.rest && sp.rest.t >= SETTLE;
        W.updateWorldMatrix(true, false);
        const wq = _q3.setFromRotationMatrix(W.matrixWorld);
        if (L && L.pose === this.pose && !tip && still && L.S.distanceTo(shoulders[s]) < BREATH && L.p.distanceTo(T) < SLIP && L.q.angleTo(wq) < SLIP_TURN && near(L.curl, curl)) {
          arm.pp.copy(L.pp); arm.roll = L.roll;
          this.solve(arm, L.S, L.p, L.q, poles[s], 0, t.lead ?? 1);
          curl = arm.curl = L.curl;
        } else arm.rest = still ? { pose: this.pose, S: shoulders[s].clone(), pp: arm.pp.clone(), roll: arm.roll, p: T.clone(), q: wq.clone(), curl: { ...curl } } : null;
        this.fingers(arm, t, curl);
      }
      for (const [name, obj] of Object.entries(arm.held)) if (obj.parent === arm.B.wrist) obj.visible = t.hold === name && this.visible;
    }
    this.R.root.visible = this.L.root.visible = this.visible;
  }

  // Two-bone IK: shoulder S, wrist target T. The elbow can be anywhere on a circle round the line from
  // the shoulder to the hand; of a ring of places on it, it goes to the cheapest (contact.js has none of
  // this): where the wrist bends least from its ease (cocked back a touch), the forearm turns least past
  // 60° (it can't go past 80°), the elbow hangs most as the body's pole has it, and the upper arm and
  // forearm keep clear of the room. It swings there at an old man's pace. The forearm's turn is shared
  // out down its length; the wrist's bend is held inside what a wrist can do.
  solve(arm, S, T, wq, pole, dt = 1 / 60, lead = 1) {
    const B = arm.B;
    let ST = T.clone().sub(S);
    let d = ST.length();
    const reach = UPPER + FORE - 0.002, easy = 0.95 * reach;
    // nearly out of reach: the body leans in (the shoulder comes forward), so the elbow keeps a bend
    if (d > easy) { S = S.clone().addScaledVector(ST.normalize(), Math.min(0.3, d - easy)); ST = T.clone().sub(S); d = ST.length(); }
    if (d > reach) { S = S.clone().addScaledVector(ST.clone().normalize(), d - reach); d = reach; }
    d = Math.max(d, Math.abs(UPPER - FORE) + 0.01);
    const dir = T.clone().sub(S).normalize();
    const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    const bp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const bq = dir.clone().cross(bp);
    let pp;
    if (dt > 0 || !arm.pp) {
      this.contact?.armBegin(arm, S, T);
      // the ring of places, then the best one refined between its neighbours
      const N = 24, cost = (phi) => this.elbowCost(arm, S, T, dir, a, h, _pp.copy(bp).multiplyScalar(Math.cos(phi)).addScaledVector(bq, Math.sin(phi)), wq, lead, bp);
      let bi = 0, bc = Infinity;
      const cs = [];
      for (let k = 0; k < N; k++) { const c = cost(k / N * Math.PI * 2); cs.push(c); if (c < bc) { bc = c; bi = k; } }
      const c0 = cs[(bi + N - 1) % N], c2 = cs[(bi + 1) % N], den = c0 - 2 * bc + c2;
      const phi = (bi + (den > 1e-12 ? Math.max(-0.5, Math.min(0.5, 0.5 * (c0 - c2) / den)) : 0)) / N * Math.PI * 2;
      pp = bp.clone().multiplyScalar(Math.cos(phi)).addScaledVector(bq, Math.sin(phi));
    } else pp = arm.pp.clone();      // the same frame again (the wrist moved a little): the same elbow
    // the elbow swings round to where it's going at an old man's pace, never jumping across
    if (arm.pp) {
      const prev = arm.pp.clone().addScaledVector(dir, -arm.pp.dot(dir));
      if (prev.lengthSq() > 1e-8) {
        prev.normalize();
        const ang = Math.atan2(prev.clone().cross(pp).dot(dir), prev.dot(pp));
        const step = Math.max(-dt * 5, Math.min(dt * 5, ang));
        pp.copy(prev.applyAxisAngle(dir, step));
      }
    }
    arm.pp = pp.clone();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pp, h);
    const fd = T.clone().sub(E).normalize();

    // the forearm at its neutral turn (thumb up) has the back of the hand along the elbow's hinge,
    // facing out; the hand's turn from there (pronation one way, supination the other) is one angle,
    // carried on from last frame's (no wrapping round from +180° to −180°), turned at a steady pace,
    // held within what a forearm can turn, and shared out down its length: the elbow's end, the middle,
    // the wrist's end
    const n0 = pp.clone().cross(fd).multiplyScalar(arm.side);
    if (n0.lengthSq() < 1e-6) n0.set(arm.side, 0, 0);
    n0.normalize();
    let roll = arm.roll ?? 0;
    const r = turnOf(n0, fd, wq);
    if (r != null) roll = arm.roll == null ? r : arm.roll + Math.max(-dt * 7, Math.min(dt * 7, wrapPi(r - arm.roll)));
    roll = Math.max(-TURN, Math.min(TURN, roll));
    arm.roll = roll;

    // upper arm: -Z along S→E, its back roughly up
    const ud = E.clone().sub(S).normalize();
    const shoulderQ = basisQuat(ud, n0);
    B.shoulder.position.copy(S);
    B.shoulder.quaternion.copy(shoulderQ);
    const elbowQ = basisQuat(fd, n0).multiply(_t.setFromAxisAngle(_Z, roll * 0.4));
    B.elbow.quaternion.copy(shoulderQ.clone().invert().multiply(elbowQ));
    const twistL = new THREE.Quaternion().setFromAxisAngle(_Z, roll * 0.35);
    B.twist.quaternion.copy(twistL);
    const twistW = elbowQ.clone().multiply(twistL);
    const rel = twistW.invert().multiply(wq);
    B.wrist.quaternion.copy(clampWrist(rel, arm.side, roll * 0.25));
    arm.report = { roll, rel, elbow: E };
    return rel;
  }

  // what an elbow at pp (a unit direction off the shoulder-to-hand line) costs: see solve()
  elbowCost(arm, S, T, dir, a, h, pp, wq, lead, bp) {
    const E = _E.copy(S).addScaledVector(dir, a).addScaledVector(pp, h);
    const fd = _fd.copy(T).sub(E).normalize();
    const n0 = _n0.copy(pp).cross(fd).multiplyScalar(arm.side);
    if (n0.lengthSq() < 1e-8) return 1e9;
    n0.normalize();
    let c = 0.6 * (1 - pp.dot(bp));
    // never with the elbow up above the shoulder's line, or swung in across the chest
    if (pp.dot(bp) < -0.2) c += 50 * (-0.2 - pp.dot(bp)) ** 2;
    const r0 = turnOf(n0, fd, wq);
    if (r0 != null) {
      const r = arm.roll == null ? r0 : arm.roll + wrapPi(r0 - arm.roll);
      const over = Math.max(0, Math.abs(r) - EASY_TURN);
      c += (over / 0.35) ** 2;
      if (lead > 0) {
        // the wrist's bend left over, against its range, measured from its ease
        const rc = Math.max(-TURN, Math.min(TURN, r));
        _q1.setFromRotationMatrix(_m.lookAt(_o, fd, n0)).multiply(_t.setFromAxisAngle(_Z, rc));
        const rel = _q1.invert().multiply(wq);
        const k = cone(rel, arm.side, 0.17);
        c += lead * (k * k + 20 * Math.max(0, k - 1) ** 2);
      }
    }
    if (this.contact) c += this.contact.armCost(arm, S, E, T, n0);
    return c;
  }

  // set every finger and the thumb as the pose has them, curled by `curl` (contact solver), within each
  // joint's range (anatomy.js)
  fingers(arm, t, curl = null) {
    for (const f of FNAMES) this.finger(arm, t, f, curl?.[f] || 0);
    this.finger(arm, t, 'thumb', curl?.thumb || 0);
  }
  finger(arm, t, f, c) {
    const B = arm.B, side = arm.side;
    if (f === 'thumb') {
      const th = t.thumb;
      const q = _q2.setFromEuler(_e.set(-(th[0] + c * THUMB_CURL[0]), (th[1] + c * THUMB_CURL[1]) * side, th[2] * side, 'YXZ'));
      B.thumb1.quaternion.copy(B.thumb1.userData.rest).multiply(q);
      B.thumb2.rotation.set(-clampD(th[3] + c * THUMB_CURL[3], A.thumb.mcp), 0, 0);
      B.thumb3.rotation.set(-clampD(th[4] + c * THUMB_CURL[4], A.thumb.ip), 0, 0);
      return;
    }
    const v = t.fingers[f], F = FINGERS[f];
    const spread = Math.max(A.mcp.spread[0] * D2R, Math.min(A.mcp.spread[1] * D2R, v[0] * F.out));
    B[f + '1'].rotation.set(-clampD(v[1] + c * CURL[0], A.mcp.flex), (F.nat + spread) * side, 0);
    B[f + '2'].rotation.set(-clampD(v[2] + c * CURL[1], A.pip.flex), 0, 0);
    B[f + '3'].rotation.set(-clampD(v[3] + c * CURL[2], A.dip.flex), 0, 0);
  }

  // the writing tip's world position right now (for checking the IK)
  tipWorld(out = new THREE.Vector3()) {
    const tool = this.pose === 'pen' ? this.pen : this.pencil;
    tool.updateWorldMatrix(true, false);
    return out.set(0, 0, 0).applyMatrix4(tool.matrixWorld);
  }
}

// A wrist bends back about 55°, forward about 65°, and side to side about 20° toward the thumb and
// 30° toward the little finger; its own twist is the forearm's business. Anything past that is pulled
// back inside (q: the hand relative to the end of the forearm).
const _w = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1), _Y = new THREE.Vector3(0, 1, 0), _t = new THREE.Quaternion();
const _pp = new THREE.Vector3(), _E = new THREE.Vector3(), _fd = new THREE.Vector3(), _n0 = new THREE.Vector3(), _o = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const D2R = Math.PI / 180, A = ANATOMY;
const clampD = (x, r) => Math.max(r[0] * D2R, Math.min(r[1] * D2R, x));
const wrapPi = (x) => Math.atan2(Math.sin(x), Math.cos(x));
// the forearm's turn: no further than the anatomy allows; past 60° it is avoided
const TURN = ANATOMY.forearm.turn[1] * D2R, EASY_TURN = 60 * D2R;
// the hand's turn about the forearm (fd) from the hinge-neutral back (n0), for a hand turned wq: the
// twist about the forearm of the hand on its neutral end, as clampWrist splits it from the bend (so the
// forearm carries all of it, and the wrist's share is never cut short)
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion();
function turnOf(n0, fd, wq) {
  _bz.copy(fd).negate();
  _bx.crossVectors(n0, _bz);
  if (_bx.lengthSq() < 1e-8) return null;
  _bx.normalize();
  _by.crossVectors(_bz, _bx);
  const q = _bq.setFromRotationMatrix(_bm.makeBasis(_bx, _by, _bz)).invert().multiply(wq);
  if (Math.hypot(q.z, q.w) < 1e-3) return null;
  return wrapPi(2 * Math.atan2(q.z, q.w));
}
const WRIST = { ext: 55 * Math.PI / 180, flex: 65 * Math.PI / 180, radial: 20 * Math.PI / 180, ulnar: 30 * Math.PI / 180 };
// how far a wrist's bend (q: the hand on the forearm's end) is toward the edge of its range: 0 at its
// ease (cocked back by `ease` radians), 1 on the edge
function cone(q, side, ease = 0) {
  const tw = _q2.set(0, 0, q.z, q.w).normalize();
  const sw = q.clone().multiply(tw.invert());
  if (sw.w < 0) sw.set(-sw.x, -sw.y, -sw.z, -sw.w);
  const sn = Math.sqrt(sw.x * sw.x + sw.y * sw.y);
  if (sn < 1e-9) return Math.abs(ease) / WRIST.ext;
  const ang = 2 * Math.atan2(sn, sw.w), e = ang * sw.x / sn - ease, r = ang * sw.y / sn * side;
  return Math.hypot(e / (e >= 0 ? WRIST.ext : WRIST.flex), r / (r >= 0 ? WRIST.radial : WRIST.ulnar));
}
// The wrist's bend held inside its range; its twist is the forearm's last share (`share`): a wrist
// doesn't turn on its own.
function clampWrist(q, side, share = null) {
  // q = swing · twist, the twist about the forearm's axis (local Z)
  const twist = new THREE.Quaternion(0, 0, q.z, q.w).normalize();
  if (twist.w < 0) twist.set(0, 0, -twist.z, -twist.w);
  const swing = q.clone().multiply(twist.clone().invert());
  if (share != null) twist.setFromAxisAngle(_Z, share);
  // the swing's bend, measured as (back, toward the thumb), held inside an elliptical cone of the
  // wrist's limits: continuous, so a reach past them slides along the edge instead of flipping
  if (swing.w < 0) swing.set(-swing.x, -swing.y, -swing.z, -swing.w);
  const sn = Math.sqrt(swing.x * swing.x + swing.y * swing.y);
  if (sn > 1e-6) {
    const ang = 2 * Math.atan2(sn, swing.w);
    const e = ang * swing.x / sn, r = ang * swing.y / sn * side;
    const k = Math.hypot(e / (e >= 0 ? WRIST.ext : WRIST.flex), r / (r >= 0 ? WRIST.radial : WRIST.ulnar));
    if (k > 1) {
      const e2 = e / k, r2 = r / k, a2 = Math.hypot(e2, r2);
      swing.setFromAxisAngle(_w.set(e2 / a2, r2 * side / a2, 0), a2);
    }
  }
  return swing.multiply(twist);
}

// critically damped follow at angular frequency w (exact for a target held still over dt)
const _d = new THREE.Vector3(), _v = new THREE.Vector3(), _q3 = new THREE.Quaternion();
// how far a resting hand's solved place may move on before it is moved (m, rad, curl)
const SLIP = 0.0005, SLIP_TURN = 0.009, SLIP_CURL = 0.02;
const BREATH = 0.006;  // how far the shoulders rise and fall with a breath, and a little more (m)
const near = (a, b) => Object.keys(b).every((f) => Math.abs((a[f] ?? 0) - b[f]) < SLIP_CURL);
function follow(sp, target, w, dt) {
  const x0 = _d.copy(sp.pos).sub(target);
  const ex = Math.exp(-w * dt);
  const j = _v.copy(sp.vel).addScaledVector(x0, w);          // v0 + w·x0
  sp.vel.addScaledVector(j, -w * dt).multiplyScalar(ex);       // (v0 − w·j·t)·e^(−wt)
  sp.pos.copy(target).add(x0.addScaledVector(j, dt).multiplyScalar(ex));
}

// A follower whose target has stopped (a pose settled) comes the rest of the way in SETTLE seconds and is
// then exactly there, still: what was left of its way and its speed eased out together (a cubic that
// ends at the target, at rest). The spring alone would only ever get nearer.
const SETTLE = 0.15;
// (only once it's slowing into the target, slowly enough that the cubic can't carry it past)
const calm = (sp, target) => sp.vel.length() * SETTLE <= 2 * sp.pos.distanceTo(target) && sp.vel.dot(_d.copy(sp.pos).sub(target)) <= 0;
function settle(sp, target, dt) {
  const r = sp.rest ||= { x: sp.pos.clone().sub(target), v: sp.vel.clone(), t: 0 };
  r.t = Math.min(SETTLE, r.t + dt);
  const s = r.t / SETTLE, a = 2 * s ** 3 - 3 * s * s + 1, b = (s ** 3 - 2 * s * s + s) * SETTLE;
  const da = (6 * s * s - 6 * s) / SETTLE, db = 3 * s * s - 4 * s + 1;
  sp.pos.copy(target).addScaledVector(r.x, a).addScaledVector(r.v, b);
  sp.vel.copy(r.x).multiplyScalar(da).addScaledVector(r.v, db);
}

function mixFingers(a, b, e) {
  const o = {};
  for (const f of FNAMES) o[f] = a[f].map((v, i) => lerp(v, b[f][i], e));
  return o;
}

// the elbow for a shoulder S and wrist T, bent toward the pole
function elbowAt(S, T, pole) {
  const ST = T.clone().sub(S);
  const d = Math.min(Math.max(ST.length(), Math.abs(UPPER - FORE) + 0.01), UPPER + FORE - 0.002);
  const dir = ST.normalize();
  const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d), h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return S.clone().addScaledVector(dir, a).addScaledVector(pp, h);
}

// quaternion whose -Z points along `fwd` and whose +Y is as near `up` as it can be
const _m = new THREE.Matrix4();
function basisQuat(fwd, up) {
  const z = fwd.clone().negate().normalize();
  let x = up.clone().cross(z);
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3(1, 0, 0).cross(z);
  x.normalize();
  const y = z.clone().cross(x).normalize();
  _m.makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}
