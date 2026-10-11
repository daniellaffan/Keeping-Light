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
import { knitTex } from './textures.js';

import { UPPER, FORE, FINGERS, FNAMES, THUMB, buildSkinData } from './handmesh.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

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
    for (let z = 0.16; z > end + 0.012; z -= 0.008) zs.push({ z, inner: 0 });
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
      const pts = section(c, V(1, 0, 0), V(0, 1, 0), arx + grow, ary + grow, N, 2.0, (x, y, a) => {
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
    L.tube(rings);
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
// Things held: a pencil, the dip pen. Each knows where its working tip is in wrist space.
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

function dipPen(mats) {
  const g = new THREE.Group();
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0034, 0.14, 8).translate(0, 0.07 + 0.026, 0), mats.penwood);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.003, 0.012, 8).translate(0, 0.02, 0), mats.steel);
  const nibShape = new THREE.Shape();
  nibShape.moveTo(-0.0026, 0.014); nibShape.lineTo(0.0026, 0.014); nibShape.lineTo(0.0004, 0.0); nibShape.lineTo(-0.0004, 0.0);
  const nib = new THREE.Mesh(new THREE.ShapeGeometry(nibShape), mats.nib);
  g.add(holder, ferrule, nib);
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
    R: hand(RELAX, { frame: 'body', pos: [0.24, -0.66, -0.3], rot: [0.75, 0.1, -1.35], swing: 1 }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.66, -0.3], rot: [0.75, -0.1, 1.35], swing: -1 }),
  },
  // reaching for the door's iron ring
  door: {
    R: hand(GRIP, { frame: 'door', pos: [0, -0.01, 0.05], rot: [0.0, 0.0, -1.45], thumb: [0.7, 0.0, 0.5, 0.5, 0.4] }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.72, -0.12], rot: [0.9, 0.0, 1.35] }),
  },
  // leaning over the book, hands on its lower corners keeping the pages down
  lean: {
    R: hand(FLAT, { frame: 'book', pos: [0.3, 0.05, 0.2], rot: [-0.04, 0.5, 0.04] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.3, 0.05, 0.2], rot: [-0.04, -0.5, -0.04] }),
  },
  // writing: the pencil tip is placed by IK under the cursor; the left hand holds the page flat
  write: {
    R: hand(TRIPOD, { frame: 'book', tip: true, hold: 'pencil', rot: [-0.08, 0.42, -0.55],
      fingers: { index: [0, 0.47, 0.52, 0.47], middle: [-0.05, 0.43, 0.86, 0.2] }, thumb: [0.46, -0.43, 0.52, 0.05, -0.6] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.2, 0.052, 0.16], rot: [-0.04, -0.25, -0.04] }),
  },
  // the dip pen: held a little more upright, the same left hand
  pen: {
    R: hand(TRIPOD, { frame: 'book', tip: true, hold: 'pen', rot: [0.02, 0.38, -0.5],
      fingers: { index: [0, 0.48, 0.52, 0.06], middle: [-0.05, 0.5, 0.76, -0.14] }, thumb: [0.46, -0.42, 0.8, 0.05, -0.6] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.2, 0.052, 0.16], rot: [-0.04, -0.25, -0.04] }),
  },
  // turning a page: the right hand's fingers slip under the near corner and lift it; the leaf goes over
  // on its own while the hand stays low, ready for the next
  turn: {
    R: hand(PINCH, { frame: 'book', pos: [0.31, 0.06, 0.2], rot: [0.25, 0.85, -0.25],
      fingers: { index: [0.02, 0.2, 0.25, 0.15], middle: [0, 0.3, 0.35, 0.2], ring: [0.02, 0.45, 0.5, 0.3], little: [0.06, 0.55, 0.6, 0.35] }, thumb: [0.45, 0.35, 0.3, 0.1, 0.05] }),
    L: hand(FLAT, { frame: 'book', pos: [-0.3, 0.05, 0.2], rot: [-0.04, -0.5, -0.04] }),
  },
  // closing the book at dawn: the left hand under the cover's edge, palm up, bringing it over
  close: {
    R: hand(FLAT, { frame: 'book', pos: [0.3, 0.05, 0.2], rot: [-0.04, 0.5, 0.04] }),
    L: hand(FLAT, { frame: 'lid', pos: [0.02, -0.045, -0.05], rot: [-0.3, -1.57, 3.14],
      fingers: { index: [0.03, 0.02, 0.05, 0.02], middle: [0, 0.02, 0.05, 0.02], ring: [0.03, 0.04, 0.06, 0.03], little: [0.08, 0.06, 0.08, 0.04] } }),
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
    R: hand(GRIP, { frame: 'lever', pos: [0.05, 0.035, 0.0], rot: [0.0, 1.57, 0.0] }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.7, -0.14], rot: [0.9, 0.0, 1.35] }),
  },
  // climbing: the right hand slides up the rail, the left steadies against the wall
  rail: {
    R: hand(GRIP, { frame: 'rail', pos: [0.0, 0.02, 0.0], rot: [0.1, 0.0, -0.2], fingers: { index: [0, 0.9, 1.0, 0.55], middle: [0, 1.0, 1.1, 0.6] } }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.7, -0.1], rot: [0.9, 0.0, 1.35] }),
  },
  // debug only (the hands review's studio): held up before the face, fingers at ease
  show: {
    R: hand(RELAX, { frame: 'body', pos: [0.1, -0.12, -0.36], rot: [0.5, 0.25, 0.1] }),
    L: hand(RELAX, { frame: 'body', pos: [-0.24, -0.7, -0.14], rot: [0.9, 0.0, 1.35] }),
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
    this.pen = dipPen(this.mats);
    this.R.hold('pencil', this.pencil);
    this.R.hold('pen', this.pen);
    this.tools = { pencil: this.pencil, pen: this.pen };
    // where each tool sits in the right wrist's frame for the tripod grip: shaft back over the
    // web of the thumb, tip out past the index pad
    this.gripPencil = { pos: new THREE.Vector3(-0.03, -0.058, -0.148), rot: new THREE.Euler(0.96, -0.05, 0, 'YXZ') };
    this.gripPen = { pos: new THREE.Vector3(-0.03, -0.062, -0.15), rot: new THREE.Euler(0.9, -0.05, 0, 'YXZ') };
    for (const [t, gp] of [[this.pencil, this.gripPencil], [this.pen, this.gripPen]]) { t.position.copy(gp.pos); t.rotation.copy(gp.rot); }

    this.pose = 'walk';
    this.from = null; this.blend = 1; this.blendDur = 0.5;
    this.t = 0;
    this.visible = true;
    // per-hand springs on the wrist target: a little overshoot when they move
    this.spring = { R: null, L: null };
    this.frames = {};
    this.tip = null;          // world point for the writing tip
    this.lift = 0;            // tip lifted off the page (0 pressed .. 1 hovering)
  }

  setPose(name, dur = 0.55) {
    if (!POSES[name] || name === this.pose) return;
    this.from = this.snapshot || null;
    this.pose = name;
    this.blend = 0; this.blendDur = dur;
  }

  setStain(k) { this.mats.flesh.uniforms.uStain.value = k; }

  // resolve a hand's pose into a world wrist target and finger values
  resolve(p, side, frames) {
    const F = frames[p.frame] || frames.body;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot[0], p.rot[1], p.rot[2], 'YXZ'));
    const wq = F.quat.clone().multiply(q);
    let pos;
    if (p.tip && this.tip) {
      // the tool's working tip goes to the target; the wrist sits wherever that puts it
      const tool = this.tools[p.hold];
      const gp = p.hold === 'pen' ? this.gripPen : this.gripPencil;
      const tipLocal = gp.pos.clone();   // the tool's tip is its origin
      pos = this.tip.clone().sub(tipLocal.applyQuaternion(wq));
      void tool;
    } else {
      pos = new THREE.Vector3(...p.pos).applyQuaternion(F.quat).add(F.pos);
    }
    return { pos, quat: wq, fingers: p.fingers, thumb: p.thumb, hold: p.hold, swing: p.swing || 0 };
  }

  // frames: { body: {pos, quat}, book: {...}, ... }; shoulders: { R: Vector3, L: Vector3 } world; pole dirs
  update(dt, frames, { shoulders, poles, bob = 0 }) {
    this.t += dt;
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.blendDur);
    const e = this.blend * this.blend * (3 - 2 * this.blend);
    const cur = {};
    for (const s of ['R', 'L']) {
      const now = this.resolve(POSES[this.pose][s], s, frames);
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
        };
      }
      cur[s] = t;
    }
    this.snapshot = cur;

    for (const s of ['R', 'L']) {
      const arm = this[s], t = cur[s];
      // the hands move like a careful old man's: steady, no tremor, no bounce. Each wrist follows its
      // target critically damped (it arrives without overshooting); the writing hand follows closely
      // enough that the point stays on the line being drawn. Walking, the arms swing with the pace.
      const tgt = t.pos.clone();
      if (t.swing) tgt.addScaledVector(frames.body.fwd, Math.sin(bob * Math.PI) * 0.05 * t.swing);
      let sp = this.spring[s];
      if (!sp || sp.pos.distanceTo(tgt) > 0.6) sp = this.spring[s] = { pos: tgt.clone(), vel: new THREE.Vector3() };
      follow(sp, tgt, POSES[this.pose][s].tip ? 34 : 11, dt);
      this.solve(arm, shoulders[s], sp.pos, t.quat, poles[s]);
      this.fingers(arm, t);
      for (const [name, obj] of Object.entries(arm.held)) obj.visible = t.hold === name && this.visible;
    }
    this.R.root.visible = this.L.root.visible = this.visible;
  }

  // two-bone IK: shoulder S, wrist target T, elbow toward the pole; the roll shared out down the forearm
  solve(arm, S, T, wq, pole) {
    const B = arm.B;
    const ST = T.clone().sub(S);
    let d = ST.length();
    const reach = UPPER + FORE - 0.002;
    // out of reach: the body leans in (the shoulder comes forward) rather than the hand falling short
    if (d > reach) { S = S.clone().addScaledVector(ST.normalize(), d - reach); d = reach; }
    d = Math.max(d, Math.abs(UPPER - FORE) + 0.01);
    const dir = T.clone().sub(S).normalize();
    const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pp, h);
    const fd = T.clone().sub(E).normalize();

    // the hand's back, and the forearm's natural back (away from the elbow's pole)
    const hd = new THREE.Vector3(0, 1, 0).applyQuaternion(wq);
    const hdp = hd.clone().addScaledVector(fd, -hd.dot(fd));
    const n0 = pp.clone().negate().addScaledVector(fd, -(-pp.dot(fd)));
    if (n0.lengthSq() < 1e-6) n0.set(0, 1, 0);
    n0.normalize();
    let up = n0.clone();
    if (hdp.lengthSq() > 1e-6) { hdp.normalize(); up = n0.clone().add(hdp); if (up.lengthSq() < 1e-4) up = n0.clone(); up.normalize(); }

    // upper arm: -Z along S→E, its back roughly up
    const ud = E.clone().sub(S).normalize();
    const shoulderQ = basisQuat(ud, n0);
    B.shoulder.position.copy(S);
    B.shoulder.quaternion.copy(shoulderQ);
    const elbowQ = basisQuat(fd, up);
    B.elbow.quaternion.copy(shoulderQ.clone().invert().multiply(elbowQ));
    // half the remaining roll in the twist bone, the rest at the wrist
    let roll = 0;
    if (hdp.lengthSq() > 1e-6) roll = Math.atan2(up.clone().cross(hdp).dot(fd.clone().negate()), up.dot(hdp));
    const twistL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll * 0.5);
    B.twist.quaternion.copy(twistL);
    const twistW = elbowQ.clone().multiply(twistL);
    B.wrist.quaternion.copy(twistW.invert().multiply(wq));
  }

  fingers(arm, t) {
    const B = arm.B, side = arm.side;
    for (const f of FNAMES) {
      const v = t.fingers[f], F = FINGERS[f];
      B[f + '1'].rotation.set(-v[1], (F.nat + v[0] * F.out) * side, 0);
      B[f + '2'].rotation.set(-v[2], 0, 0);
      B[f + '3'].rotation.set(-v[3], 0, 0);
    }
    const th = t.thumb;
    const r = B.thumb1.userData.rest;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-th[0], th[1] * side, th[2] * side, 'YXZ'));
    B.thumb1.quaternion.copy(r).multiply(q);
    B.thumb2.rotation.set(-th[3], 0, 0);
    B.thumb3.rotation.set(-th[4], 0, 0);
  }

  // the writing tip's world position right now (for checking the IK)
  tipWorld(out = new THREE.Vector3()) {
    const tool = this.pose === 'pen' ? this.pen : this.pencil;
    tool.updateWorldMatrix(true, false);
    return out.set(0, 0, 0).applyMatrix4(tool.matrixWorld);
  }
}

// critically damped follow at angular frequency w (exact for a target held still over dt)
const _d = new THREE.Vector3(), _v = new THREE.Vector3();
function follow(sp, target, w, dt) {
  const x0 = _d.copy(sp.pos).sub(target);
  const ex = Math.exp(-w * dt);
  const j = _v.copy(sp.vel).addScaledVector(x0, w);          // v0 + w·x0
  sp.vel.addScaledVector(j, -w * dt).multiplyScalar(ex);       // (v0 − w·j·t)·e^(−wt)
  sp.pos.copy(target).add(x0.addScaledVector(j, dt).multiplyScalar(ex));
}

function mixFingers(a, b, e) {
  const o = {};
  for (const f of FNAMES) o[f] = a[f].map((v, i) => lerp(v, b[f][i], e));
  return o;
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
