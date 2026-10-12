// The keeper's hands against the room: the contact solver's pieces. Poses (hands.js) say where a hand
// wants to be; each frame, after the arm is solved, the hand is kept out of things and laid onto what
// it rests on or holds, deterministically, in a fixed number of steps.
//
// Its picture of the hand is the skin itself: points sampled over it (a few millimetres apart, closer
// on the pads), skinned on the CPU exactly as the GPU skins the mesh, so a contact found here is a
// contact on screen. The world is the colliders (colliders.js).
import * as THREE from 'three';
import { BONES, FINGERS, FNAMES, THUMB } from './handmesh.js';
import { ANATOMY, thumbBase } from './anatomy.js';

const MAXB = BONES.length;

// ---------------------------------------------------------------------------------------------------
// The parts of the skin: which bone owns each vertex most (its label), and named sets of vertices: the
// pads of each phalanx, the fingertips' pads, the palm, the heel of the hand, its little-finger edge,
// the underside of the forearm, the ball of the thumb. Picked once on the right hand at rest; the left is
// its mirror, vertex for vertex. Indices past the skin's own are the sleeve's. Skin of the palm that the
// thumb carries a part of (the ball of the thumb) is the thumb's, not the heel's.
const THENAR = 0.1;            // the thumb's share of a palm vertex past which the thumb carries it
export const LABELS = ['forearm', 'palm', ...FNAMES.flatMap((f) => [f + '1', f + '2', f + '3']), 'thumb1', 'thumb2', 'thumb3', 'sleeve'];
export function classifySkin(arm) {
  const g = arm.mesh.geometry, sg = arm.sleeve.geometry;
  const n = g.attributes.position.count, N = n + sg.attributes.position.count;
  const P = g.attributes.position.array, NR = g.attributes.normal.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array;
  const inv = arm.skeleton.boneInverses, side = arm.side;
  const label = new Uint8Array(N);
  const sets = {};
  const put = (name, v) => (sets[name] ||= []).push(v);
  const iW = BONES.indexOf('wrist');
  const v3 = new THREE.Vector3(), n3 = new THREE.Vector3(), w3 = new THREE.Vector3(), m3 = new THREE.Matrix3();
  for (let v = 0; v < N; v++) {
    if (v >= n) { label[v] = LABELS.indexOf('sleeve'); put('sleeve', v); continue; }
    let bi = 0, bw = -1, tw = 0;
    for (let q = 0; q < 4; q++) {
      if (SW[v * 4 + q] > bw) { bw = SW[v * 4 + q]; bi = SI[v * 4 + q]; }
      if (BONES[SI[v * 4 + q]].startsWith('thumb')) tw += SW[v * 4 + q];
    }
    const bone = BONES[bi];
    const lab = bone === 'shoulder' || bone === 'elbow' || bone === 'twist' ? 'forearm' : bone === 'wrist' ? 'palm' : bone;
    label[v] = LABELS.indexOf(lab);
    // where the vertex is in its bone's frame and in the wrist's, at rest; its normal in its bone's frame
    // (x is made the right hand's: + toward the little finger)
    v3.fromArray(P, v * 3);
    w3.copy(v3).applyMatrix4(inv[iW]); w3.x *= side;
    const loc = v3.clone().applyMatrix4(inv[bi]); loc.x *= side;
    n3.fromArray(NR, v * 3).applyMatrix3(m3.setFromMatrix4(inv[bi])).normalize(); n3.x *= side;
    if (lab === 'forearm') {
      put('forearm', v);
      if (n3.y < -0.5 && w3.z > 0.02 && w3.z < 0.16) put('forearm.volar', v);
      continue;
    }
    put('hand', v);
    if (lab === 'palm') {
      put('palm.all', v);
      if (tw > THENAR) put('thenar', v);
      if (n3.y < -0.6 && w3.z < -0.02 && w3.z > -0.075 && Math.abs(w3.x) < 0.028) put('palm', v);
      if (n3.y < -0.5 && w3.z < 0 && w3.z > -0.045 && tw <= THENAR) put('heel', v);
    }
    if ((lab === 'palm' || lab === 'little1') && n3.x > 0.6 && w3.z < 0) put('ulnar', v);
    const m = /^(index|middle|ring|little|thumb)([123])$/.exec(lab);
    if (m) {
      const f = m[1], k = +m[2];
      const len = f === 'thumb' ? THUMB.len[k - 1] : FINGERS[f].len[k - 1];
      put('finger.' + f, v);
      if (n3.y < -0.5) put(`pad.${f}.${k}`, v);
      if (k === 3 && loc.z < -0.4 * len && (n3.y < -0.25 || n3.z < -0.6)) put('tip.' + f, v);
      if (f === 'middle' && k >= 2 && n3.x < -0.5) put('side.middle', v);
    }
  }
  for (const key of Object.keys(sets)) sets[key] = Int32Array.from(sets[key]);
  return { label, sets, n, N };
}

// a sample of a set of vertices, at least `spacing` apart at rest (the first found in index order wins,
// so it is the same every time)
export function sample(arm, set, spacing) {
  const g = arm.mesh.geometry, sg = arm.sleeve.geometry, n = g.attributes.position.count;
  const P = g.attributes.position.array, SP = sg.attributes.position.array;
  const cell = spacing, grid = new Map(), out = [];
  const key = (i, j, k) => (i + 4096) * 67108864 + (j + 4096) * 8192 + (k + 4096);
  for (const v of set) {
    const A = v < n ? P : SP, o = (v < n ? v : v - n) * 3;
    const x = A[o], y = A[o + 1], z = A[o + 2];
    const i = Math.floor(x / cell), j = Math.floor(y / cell), k = Math.floor(z / cell);
    let near = false;
    for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++) for (let c = -1; c <= 1 && !near; c++) {
      const L = grid.get(key(i + a, j + b, k + c));
      if (L) for (const [px, py, pz] of L) if ((px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 < spacing * spacing) { near = true; break; }
    }
    if (near) continue;
    out.push(v);
    const kk = key(i, j, k);
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push([x, y, z]);
  }
  return Int32Array.from(out);
}

// ---------------------------------------------------------------------------------------------------
// Points of the skin (vertex indices), skinned with given bone matrices (bone world × bind inverse).
export class SkinPoints {
  constructor(arm, idx) {
    const g = arm.mesh.geometry, sg = arm.sleeve.geometry, n = g.attributes.position.count;
    this.idx = idx;
    const k = idx.length;
    this.rest = new Float64Array(k * 3); this.si = new Uint16Array(k * 4); this.sw = new Float64Array(k * 4);
    for (let t = 0; t < k; t++) {
      const v = idx[t], s = v < n, G = s ? g : sg, o = s ? v : v - n;
      for (let a = 0; a < 3; a++) this.rest[t * 3 + a] = G.attributes.position.array[o * 3 + a];
      for (let a = 0; a < 4; a++) { this.si[t * 4 + a] = G.attributes.skinIndex.array[o * 4 + a]; this.sw[t * 4 + a] = G.attributes.skinWeight.array[o * 4 + a]; }
    }
    this.pos = new Float64Array(k * 3);
    this.count = k;
  }
  update(M, from = 0, to = this.count) {
    const R = this.rest, SI = this.si, SW = this.sw, P = this.pos;
    for (let t = from; t < to; t++) {
      let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0;
      for (let q = 0; q < 4; q++) {
        const w = SW[t * 4 + q];
        if (w === 0) continue;
        const o = SI[t * 4 + q] * 16;
        a += w * M[o]; b += w * M[o + 1]; c += w * M[o + 2]; d += w * M[o + 4]; e += w * M[o + 5]; f += w * M[o + 6];
        g += w * M[o + 8]; h += w * M[o + 9]; i += w * M[o + 10]; j += w * M[o + 12]; k += w * M[o + 13]; l += w * M[o + 14];
      }
      const x = R[t * 3], y = R[t * 3 + 1], z = R[t * 3 + 2];
      P[t * 3] = a * x + d * y + g * z + j; P[t * 3 + 1] = b * x + e * y + h * z + k; P[t * 3 + 2] = c * x + f * y + i * z + l;
    }
  }
}

// the bone matrices (world × bind inverse) of an arm as it is posed, into M (16 per bone); `only`: just
// these bones (their world matrices must be current)
export function boneMatrices(arm, M, only = null) {
  const bones = arm.skeleton.bones, inv = arm.skeleton.boneInverses;
  const list = only || bones.map((_, i) => i);
  for (const i of list) {
    const A = bones[i].matrixWorld.elements, B = inv[i].elements, o = i * 16;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) M[o + c * 4 + r] = A[r] * B[c * 4] + A[4 + r] * B[c * 4 + 1] + A[8 + r] * B[c * 4 + 2] + A[12 + r] * B[c * 4 + 3];
  }
  return M;
}
export const boneArray = () => new Float64Array(MAXB * 16);

// ---------------------------------------------------------------------------------------------------
// The world near a hand: the colliders' parts within reach (of a ball, or of a segment and a margin
// round it), and signed distances to them. Each part's bound is kept in world space, so a point far
// from it is turned away before it is carried into the collider's own space.
export class Obstacles {
  constructor(colliders) {
    this.all = colliders;
    this.n = new THREE.Vector3();
    this.hit = null;
    this.parts = [];     // { p, L } per kept part, with its world bound in this.wb (x, y, z, r)
    this.wb = new Float64Array(0);
    this.fields = [];    // { f, L }
    this.cols = [];      // per kept collider: { c, iv, m }
  }
  // once a frame: where every collider is
  update() { for (const c of this.all) c.update(); }
  // the parts that come within r of the segment a–b (a point, if b is null)
  gather(ax, ay, az, r, names = null, skip = null, bx = null, by = null, bz = null) {
    const seg = bx != null;
    const ux = seg ? bx - ax : 0, uy = seg ? by - ay : 0, uz = seg ? bz - az : 0, ul = ux * ux + uy * uy + uz * uz || 1;
    const dist = (x, y, z) => {
      let t = seg ? ((x - ax) * ux + (y - ay) * uy + (z - az) * uz) / ul : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(x - ax - ux * t, y - ay - uy * t, z - az - uz * t);
    };
    const parts = [], wb = [], fields = [], cols = [];
    for (const c of this.all) {
      if (names && !names.includes(c.name)) continue;
      if (skip && skip.includes(c.name)) continue;
      if (!c.active() || (!c.parts.length && !c.fields.length)) continue;
      if (dist(c.wc.x, c.wc.y, c.wc.z) > c.wr + r) continue;
      const e = c.m.elements, L = { c, iv: c.inv.elements, m: e, k: cols.length };
      let used = false;
      for (const p of c.parts) {
        const x = e[0] * p.c[0] + e[4] * p.c[1] + e[8] * p.c[2] + e[12], y = e[1] * p.c[0] + e[5] * p.c[1] + e[9] * p.c[2] + e[13], z = e[2] * p.c[0] + e[6] * p.c[1] + e[10] * p.c[2] + e[14];
        if (dist(x, y, z) > p.r + r) continue;
        parts.push({ p, L }); wb.push(x, y, z, p.r); used = true;
      }
      for (const f of c.fields) if (!f.on || f.on()) { fields.push({ f, L }); used = true; }
      if (used) cols.push(L);
    }
    this.parts = parts; this.wb = Float64Array.from(wb); this.fields = fields; this.cols = cols;
    this.local = new Float64Array(cols.length * 4);
    this.stamp = 0;
    return this;
  }
  get list() { return this.cols; }
  // The least signed distance of a set of points (x, y, z flat), and which point (this.at): the whole
  // set's bounding ball turns away the parts and fields it can't reach, then each part that's left takes
  // all the points in one go. Distances past `cut` come back as just `cut`.
  minGap(P, count, cut = Infinity) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < count; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
    cx /= count; cy /= count; cz /= count;
    let r2 = 0;
    for (let i = 0; i < count; i++) { const dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy, dz = P[i * 3 + 2] - cz, d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
    const rad = Math.sqrt(r2);
    let best = cut, at = -1;
    const W = this.wb, PS = this.parts;
    let L0 = null, X = this.scratch;
    if (!X || X.length < count * 3) X = this.scratch = new Float64Array(count * 3 + 300);
    const toLocal = (L) => {
      if (L0 === L) return;
      L0 = L;
      const iv = L.iv;
      for (let i = 0; i < count; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        X[i * 3] = iv[0] * x + iv[4] * y + iv[8] * z + iv[12]; X[i * 3 + 1] = iv[1] * x + iv[5] * y + iv[9] * z + iv[13]; X[i * 3 + 2] = iv[2] * x + iv[6] * y + iv[10] * z + iv[14];
      }
    };
    for (let q = 0; q < PS.length; q++) {
      const dx = cx - W[q * 4], dy = cy - W[q * 4 + 1], dz = cz - W[q * 4 + 2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - W[q * 4 + 3] - rad > best) continue;
      const E = PS[q], pl = E.p.planes, np = pl.length;
      toLocal(E.L);
      for (let i = 0; i < count; i++) {
        const x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2];
        let v = -Infinity;
        for (let j = 0; j < np; j += 4) { const u = pl[j] * x + pl[j + 1] * y + pl[j + 2] * z - pl[j + 3]; if (u > v) { v = u; if (v >= best) break; } }
        if (v < best) { best = v; at = i; }
      }
    }
    for (let q = 0; q < this.fields.length; q++) {
      const F = this.fields[q], f = F.f;
      // (a field's own bound, in its collider's space, against the set's ball)
      const iv = F.L.iv;
      const lx = iv[0] * cx + iv[4] * cy + iv[8] * cz + iv[12], ly = iv[1] * cx + iv[5] * cy + iv[9] * cz + iv[13], lz = iv[2] * cx + iv[6] * cy + iv[10] * cz + iv[14];
      const v0 = f.f(lx, ly, lz, best + rad);
      if (v0 - rad > best) continue;
      toLocal(F.L);
      for (let i = 0; i < count; i++) { const v = f.f(X[i * 3], X[i * 3 + 1], X[i * 3 + 2], best); if (v < best) { best = v; at = i; } }
    }
    this.at = at;
    return best;
  }
  localOf(L, x, y, z, stamp) {
    const LC = this.local, o = L.k * 4;
    if (LC[o + 3] !== stamp) {
      const iv = L.iv;
      LC[o] = iv[0] * x + iv[4] * y + iv[8] * z + iv[12]; LC[o + 1] = iv[1] * x + iv[5] * y + iv[9] * z + iv[13]; LC[o + 2] = iv[2] * x + iv[6] * y + iv[10] * z + iv[14]; LC[o + 3] = stamp;
    }
    return o;
  }
  // signed distance from the point to the gathered parts (exact inside; outside, a lower bound unless
  // `exact`); with `normal`, the outward direction there in this.n and the collider in this.hit.
  // (`cut`: distances beyond it don't matter, and may come back as just "that far or more")
  sd(x, y, z, exact = false, normal = true, cut = Infinity) {
    let best = cut, bp = null, bL = null;
    const W = this.wb, PS = this.parts, LC = this.local;
    // each collider's space, worked out for this point only when a part of it is near
    const stamp = ++this.stamp;
    for (let q = 0; q < PS.length; q++) {
      const dx = x - W[q * 4], dy = y - W[q * 4 + 1], dz = z - W[q * 4 + 2], rr = best + W[q * 4 + 3];
      if (rr > 0 && dx * dx + dy * dy + dz * dz > rr * rr) continue;
      const E = PS[q], o = this.localOf(E.L, x, y, z, stamp);
      const v = exact ? E.p.sdExact(LC[o], LC[o + 1], LC[o + 2]) : E.p.sd(LC[o], LC[o + 1], LC[o + 2]);
      if (v < best) { best = v; bp = E.p; bL = E.L; }
    }
    for (let q = 0; q < this.fields.length; q++) {
      const F = this.fields[q], o = this.localOf(F.L, x, y, z, stamp);
      const v = F.f.f(LC[o], LC[o + 1], LC[o + 2], best);
      if (v < best) { best = v; bp = F.f; bL = F.L; }
    }
    if (!normal) return best;
    this.hit = bL ? bL.c : null;
    if (!bp) { this.n.set(0, 1, 0); return best; }
    const o = this.localOf(bL, x, y, z, stamp), lx = LC[o], ly = LC[o + 1], lz = LC[o + 2];
    // the way out: the face pushing hardest (a solid), or the field's slope
    let nx, ny, nz;
    if (bp.planes) {
      const P = bp.planes;
      let s = -Infinity, j0 = 0;
      for (let j = 0; j < P.length; j += 4) { const v = P[j] * lx + P[j + 1] * ly + P[j + 2] * lz - P[j + 3]; if (v > s) { s = v; j0 = j; } }
      nx = P[j0]; ny = P[j0 + 1]; nz = P[j0 + 2];
    } else {
      const h = 0.0005, f = bp.f;
      nx = f(lx + h, ly, lz) - f(lx - h, ly, lz);
      ny = f(lx, ly + h, lz) - f(lx, ly - h, lz);
      nz = f(lx, ly, lz + h) - f(lx, ly, lz - h);
    }
    const m = bL.m;
    this.n.set(m[0] * nx + m[4] * ny + m[8] * nz, m[1] * nx + m[5] * ny + m[9] * nz, m[2] * nx + m[6] * ny + m[10] * nz).normalize();
    return best;
  }
}

// ---------------------------------------------------------------------------------------------------
// The solver. Each frame, for each hand, after the arm is solved for the pose's wrist:
// 1. the wrist: laid onto what the pose rests it on (its anchor: the heel of the hand on the table), and
//    pushed out of anything the hand is in, the deepest overlap first, re-solving the arm each time;
// 2. each finger and the thumb: curled toward the palm until it touches something (`touch`: a hand
//    resting, or gripping), or straightened only as far as it must be to come out of something (`free`),
//    by bisection, always the same number of steps.
// The pose's grip (contacts.js GRIPS) says which.
const MARGIN = 0.0005;        // what the skin keeps off a surface (m)
const FORE_REACH = 0.34;      // how far off the shoulder-to-hand line the arm's bulk can be (m)
const STEPS = 8;              // bisection steps for a finger (a turn of about 0.4°)
const CUT = 0.004;            // further off than this, a surface doesn't matter to a hand settling
// how a curl moves the joints: [knuckle, middle, end] for a finger; [flex across, swing out, roll,
// knuckle, end] for the thumb (toward the palm: it hangs below a hand flat on a table)
const CURL = [1, 1.1, 0.7];
export const THUMB_CURL = [0.5, 1.0, 0, 0.3, 0.3];
const RANGE = { lo: -0.8, hi: 1.2 };
const CURL_RATE = 4;          // how fast a finger curls or opens (a curl of 1 a second is a knuckle turning about 60°)

// The arm's bulk, as balls along its two bones, each as big as the skin or the sleeve round it there
// (the furthest vertex from the bone's line, within 2.5 cm along it): [bone (0 upper arm, 1 forearm),
// distance along it (m), radius (m)]
const UPPER_L = 0.30;
function bulkOf(arm) {
  const g = arm.mesh.geometry, sg = arm.sleeve.geometry;
  const W0 = -0.30 - 0.26;
  const out = [];
  const each = (fn) => { for (const G of [g, sg]) { const P = G.attributes.position.array; for (let i = 0; i < P.length; i += 3) fn(P[i], P[i + 1], P[i + 2]); } };
  for (let t = 0.03; t < 0.30; t += 0.05) {            // the upper arm: z from 0 (shoulder) down to -0.30
    let r = 0;
    each((x, y, z) => { if (Math.abs(-z - t) < 0.025) r = Math.max(r, Math.hypot(x, y)); });
    if (r) out.push([0, t, r]);
  }
  for (let t = 0.03; t < 0.25; t += 0.05) {            // the forearm: from the elbow (-0.30) to the wrist (W0)
    let r = 0;
    each((x, y, z) => { if (Math.abs(-(z + 0.30) - t) < 0.025 && z > W0) r = Math.max(r, Math.hypot(x, y)); });
    if (r) out.push([1, t, r]);
  }
  return out;
}
const union = (...sets) => Int32Array.from([...new Set(sets.filter(Boolean).flatMap((s) => [...s]))].sort((a, b) => a - b));
const _w = new THREE.Vector3(), _n = new THREE.Vector3(), _T = new THREE.Vector3();
const _u = new THREE.Vector3(), _f = new THREE.Vector3(), _mid = new THREE.Vector3(), _pt = new THREE.Vector3(), _zero = new THREE.Vector3(), _Zax = new THREE.Vector3(0, 0, 1);
const _qs = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qz = new THREE.Quaternion(), _mm = new THREE.Matrix4();

export class ContactSolver {
  constructor(hands, colliders) {
    this.hands = hands;
    this.ob = new Obstacles(colliders);
    this.fob = new Obstacles(colliders);
    const R = hands.R, cls = this.cls = classifySkin(R), S = cls.sets;
    const pick = (set, sp) => sample(R, set, sp);
    const label = (name) => { const i = LABELS.indexOf(name), out = []; for (let v = 0; v < cls.n; v++) if (cls.label[v] === i) out.push(v); return Int32Array.from(out); };
    this.idx = {
      body: pick(S['palm.all'], 0.008),
      heel: pick(S.heel, 0.004),
      arm: pick(union(S.forearm, S.sleeve), 0.03),
      fingers: {},
    };
    for (const f of FNAMES) this.idx.fingers[f] = pick(S['finger.' + f], 0.005);
    // (the thumb's long bone moves with the thumb, so it's the thumb's; the ball of the thumb is the hand's
    // and the thumb's both: the hand rests on it, and the thumb mustn't press it in)
    this.idx.fingers.thumb = pick(union(S.thenar, label('thumb1'), label('thumb2'), label('thumb3')), 0.005);
    const make = (arm) => {
      const o = { body: new SkinPoints(arm, this.idx.body), heel: new SkinPoints(arm, this.idx.heel), fingers: {} };
      for (const f of [...FNAMES, 'thumb']) o.fingers[f] = new SkinPoints(arm, this.idx.fingers[f]);
      return o;
    };
    this.pts = { R: make(hands.R), L: make(hands.L) };
    this.M = { R: boneArray(), L: boneArray() };
    this.chain = {};
    for (const f of [...FNAMES, 'thumb']) this.chain[f] = [1, 2, 3].map((k) => BONES.indexOf(f + k));
    this.stats = { R: {}, L: {} };
  }

  // once a frame, before the hands: where everything is
  frame() { this.ob.update(); }

  // ctx: { spec (GRIPS entry or null), t (the hand's resolved pose), T (wrist target), resolve(T): the
  // arm solved for a wrist moved there (its elbow and turn kept), skip: names the hand's body ignores,
  // tip: the wrist is placed by a tool's point (it is left where it is) }
  apply(s, arm, ctx) {
    const spec = ctx.spec || FREE, ob = this.ob, P = this.pts[s], M = this.M[s], st = this.stats[s];
    const W = ctx.weight ?? 1;
    arm.root.updateWorldMatrix(true, true);
    const w = arm.B.wrist.getWorldPosition(_w);
    ob.gather(w.x, w.y, w.z, 0.2, null, ctx.skip);
    st.moved = 0; st.its = 0; st.log = null;
    const roleOf = (f) => (spec.fingers && (spec.fingers[f] ?? spec.fingers.all)) || 'free';
    // a thumb that is to touch starts as little curled as it can be: the ball of the thumb follows it
    // down, and the hand isn't to be laid on that
    const thumbR = roleOf('thumb') === 'fixed' ? null : this.thumbRange(arm, ctx.t);
    if (thumbR && roleOf('thumb') === 'touch') this.hands.finger(arm, ctx.t, 'thumb', thumbR[0]);
    if (!ctx.tip) {
      const T = _T.copy(ctx.T);
      let q = ctx.wq.clone();
      // (the wrist moved, the arm solved again; the hand is then turned as the wrist could turn it, which
      // is where any further turn starts from)
      const move = (mx, my, mz) => {
        T.x += mx; T.y += my; T.z += mz; st.moved += Math.hypot(mx, my, mz); st.its++;
        ctx.resolve(T, q);
        arm.root.updateWorldMatrix(true, true);
        q.setFromRotationMatrix(arm.B.wrist.matrixWorld);
      };
      // out of anything: the deepest point of the hand's body pushed out along its way out, again
      const push = (n) => {
        for (let it = 0; it < n; it++) {
          boneMatrices(arm, M);
          P.body.update(M);
          const B = P.body.pos;
          const worst = MARGIN - ob.minGap(B, P.body.count, CUT), wi = ob.at;
          if (this.debug) (st.log ||= []).push(['push', +(worst * 1000).toFixed(2)]);
          if (worst <= 1e-6) return;
          ob.sd(B[wi * 3], B[wi * 3 + 1], B[wi * 3 + 2]);
          move(ob.n.x * worst, ob.n.y * worst, ob.n.z * worst);
        }
      };
      // the anchor (the heel) nearest to anything: its gap, exactly, which way is out, and where
      const heel = () => {
        boneMatrices(arm, M);
        P.heel.update(M);
        const H = P.heel.pos;
        ob.minGap(H, P.heel.count, 0.05);
        if (ob.at < 0) return null;
        const i = ob.at, g = ob.sd(H[i * 3], H[i * 3 + 1], H[i * 3 + 2], true, true, 0.05);
        return { g, n: ob.n.clone(), p: new THREE.Vector3(H[i * 3], H[i * 3 + 1], H[i * 3 + 2]) };
      };
      push(5);
      if (spec.anchor) {
        // down onto what's below the heel, by its gap; then whatever of the hand that puts into something
        // (the ball of the thumb, the knuckles) turns the hand up about the heel until it's out: a hand
        // laid flat rests on its heel and its front both
        const turn = (axis, ang, pivot) => {
          const r = _qt.setFromAxisAngle(axis, ang);
          q = r.clone().multiply(q);
          T.sub(pivot).applyQuaternion(r).add(pivot);
          move(0, 0, 0);
        };
        for (let pass = 0; pass < 2; pass++) {
          const h = heel();
          if (!h) break;
          if (this.debug) (st.log ||= []).push(['heel', +(h.g * 1000).toFixed(2), h.n.toArray().map((v) => +v.toFixed(2))]);
          if (Math.abs(h.g - MARGIN) > 0.0002) { const d = W * Math.max(-0.03, Math.min(0.03, h.g - MARGIN)); move(-h.n.x * d, -h.n.y * d, -h.n.z * d); }
          for (let it = 0; it < 4; it++) {
            boneMatrices(arm, M);
            P.body.update(M);
            const B = P.body.pos, worst = MARGIN - ob.minGap(B, P.body.count, CUT), i = ob.at;
            if (worst <= 1e-6) break;
            ob.sd(B[i * 3], B[i * 3 + 1], B[i * 3 + 2]);
            const n = _n.copy(ob.n), lever = _u.set(B[i * 3], B[i * 3 + 1], B[i * 3 + 2]).sub(h.p);
            lever.addScaledVector(n, -lever.dot(n));
            const L = lever.length();
            if (this.debug) (st.log ||= []).push(['turn', +(worst * 1000).toFixed(2), +(L * 1000).toFixed(1), ob.hit?.name]);
            // (in right by the heel itself: simply out)
            if (L < 0.015) { move(n.x * worst, n.y * worst, n.z * worst); continue; }
            turn(_f.crossVectors(lever, n).normalize(), W * Math.min(0.4, Math.atan2(worst, L)), h.p);
          }
        }
        push(2);
      }
      ctx.T.copy(T);
      ctx.wq = q;
    }
    // the fingers and the thumb, each on its own (the wrist is where it will be). Each goes where its role
    // puts it, as fast as a finger moves (CURL_RATE), but out of anything at once. A finger that can't
    // come out of something however straight it goes takes the hand out with it (once).
    const fob = this.fob, last = arm.curl || {};
    const fingers = () => {
      boneMatrices(arm, M);
      fob.gather(w.x, w.y, w.z, 0.16, null, ctx.fingerSkip);
      const curl = {};
      let stuck = null;
      for (const f of [...FNAMES, 'thumb']) {
        const role = roleOf(f);
        if (role === 'fixed') continue;
        const gap = (c) => this.fingerGap(s, arm, ctx.t, f, c, fob);
        // the thumb's base can't swing back behind the palm, nor out past 70° (anatomy.js)
        const [lo, hi] = f === 'thumb' ? thumbR : [RANGE.lo, RANGE.hi];
        const c0 = Math.max(lo, Math.min(hi, 0));
        // free: as posed, straightened only as far as it must be to come out of something
        let goal = c0;
        if (gap(c0) < MARGIN) {
          const gl = gap(lo);
          if (gl < MARGIN) { goal = lo; if (!stuck || gl < stuck.g) stuck = { g: gl, f, lo }; } else goal = bisect(gap, lo, c0);
        }
        // touch: curled until it touches (with nothing in its reach, as posed); half a grip, half way
        if (role === 'touch' && W > 0 && goal === c0) {
          const g = gap(hi) > MARGIN ? c0 : bisect(gap, c0, hi);
          goal = c0 + W * (g - c0);
        }
        let c = goal;
        const prev = last[f];
        if (prev != null && ctx.dt > 0 && Math.abs(goal - prev) > CURL_RATE * ctx.dt) {
          c = prev + Math.sign(goal - prev) * CURL_RATE * ctx.dt;
          if (gap(c) < MARGIN) c = goal;
        }
        curl[f] = c;
      }
      return { curl, stuck };
    };
    let { curl, stuck } = fingers();
    if (stuck && !ctx.tip) {
      // the stuck finger as straight as it goes; its deepest point out along its way out, the hand with it
      this.fingerGap(s, arm, ctx.t, stuck.f, stuck.lo, fob);
      const pts = P.fingers[stuck.f], i = fob.at, d = MARGIN - stuck.g;
      fob.sd(pts.pos[i * 3], pts.pos[i * 3 + 1], pts.pos[i * 3 + 2]);
      if (this.debug) (st.log ||= []).push(['stuck', stuck.f, +(d * 1000).toFixed(2), fob.hit?.name]);
      const T = _T.copy(ctx.T).addScaledVector(fob.n, d);
      st.moved += d; st.its++;
      ctx.resolve(T, ctx.wq);
      arm.root.updateWorldMatrix(true, true);
      ctx.T.copy(T);
      ({ curl } = fingers());
    }
    arm.curl = curl;
    return curl;
  }

  // The arm's bulk (forearm and sleeve, sampled every 2 cm) at a trial elbow, kept clear of the room
  // by 12 mm: what it costs. armBegin gathers what is near the whole arm, once a solve.
  armBegin(arm, S, T) {
    // (anything near the line from the shoulder to the hand: the elbow is never more than a forearm's
    // length off it)
    this.aob ||= new Obstacles(this.ob.all);
    this.aob.gather(S.x, S.y, S.z, FORE_REACH, null, ['pencil', 'quill'], T.x, T.y, T.z);
    if (!arm.bulk) arm.bulk = bulkOf(arm);
  }
  armCost(arm, S, E, T, n0) {
    const ob = this.aob, K = arm.bulk;
    if (!ob || (!ob.parts.length && !ob.fields.length) || !K) return 0;
    // the upper arm's balls along shoulder→elbow, the forearm's along elbow→wrist
    const ux = (E.x - S.x) / UPPER_L, uy = (E.y - S.y) / UPPER_L, uz = (E.z - S.z) / UPPER_L;
    const fl = Math.hypot(T.x - E.x, T.y - E.y, T.z - E.z) || 1, fx = (T.x - E.x) / fl, fy = (T.y - E.y) / fl, fz = (T.z - E.z) / fl;
    let c = 0;
    for (let i = 0; i < K.length; i++) {
      const [bone, t, r] = K[i];
      const x = bone ? E.x + fx * t : S.x + ux * t, y = bone ? E.y + fy * t : S.y + uy * t, z = bone ? E.z + fz * t : S.z + uz * t;
      const d = ob.sd(x, y, z, false, false, r + 0.012) - r;
      if (d < 0.012) c += (0.012 - d) * (0.012 - d) * 3000;
    }
    return c;
  }

  // the curls the thumb may take from its pose: its base's palmar abduction kept within its range
  thumbRange(arm, t) {
    const A = ANATOMY.thumb.palmarAbd, abd = (c) => { this.hands.finger(arm, t, 'thumb', c); return thumbBase(arm)['thumb.palmarAbd']; };
    let lo = RANGE.lo, hi = RANGE.hi;
    const find = (a, b, want) => { for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (abd(m) < want) a = m; else b = m; } return (a + b) / 2; };
    if (abd(lo) < A[0] + 0.5) lo = find(lo, hi, A[0] + 0.5);
    if (abd(hi) > A[1] - 0.5) hi = find(lo, hi, A[1] - 0.5);
    return [lo, hi];
  }

  // the least clearance (m) of a finger's skin from anything, curled by c from its pose
  fingerGap(s, arm, t, f, c, ob) {
    this.hands.finger(arm, t, f, c);
    const B = arm.B[f + '1'];
    B.updateMatrixWorld(true);
    const M = this.M[s];
    boneMatrices(arm, M, this.chain[f]);
    const pts = this.pts[s].fingers[f];
    pts.update(M);
    return ob.minGap(pts.pos, pts.count, CUT);
  }
}
const FREE = { fingers: { all: 'free' } };

// the curl in [lo, hi] at which the gap comes down to the margin (gap(lo) > margin ≥ gap(hi))
function bisect(gap, lo, hi) {
  for (let i = 0; i < STEPS; i++) {
    const m = (lo + hi) / 2;
    if (gap(m) > MARGIN) lo = m; else hi = m;
  }
  return lo;
}
export { CURL, MARGIN };
