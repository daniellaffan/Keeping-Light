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

// the same points put in an order that keeps near ones together (split in two across their longest
// side, again and again), so each run of CHUNK in it is a small patch of skin (Obstacles.minGap)
function compact(arm, idx) {
  const g = arm.mesh.geometry, sg = arm.sleeve.geometry, n = g.attributes.position.count;
  const at = (v) => { const A = v < n ? g.attributes.position.array : sg.attributes.position.array, o = (v < n ? v : v - n) * 3; return [A[o], A[o + 1], A[o + 2]]; };
  const split = (list) => {
    if (list.length <= CHUNK) return list;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [, p] of list) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
    const ax = [0, 1, 2].reduce((b, a) => (hi[a] - lo[a] > hi[b] - lo[b] ? a : b), 0);
    list.sort((u, w) => u[1][ax] - w[1][ax] || u[0] - w[0]);
    // (cut at a whole number of runs, so no run straddles the cut)
    const m = Math.max(CHUNK, Math.round(list.length / 2 / CHUNK) * CHUNK);
    return [...split(list.slice(0, m)), ...split(list.slice(m))];
  };
  return Int32Array.from(split([...idx].map((v) => [v, at(v)])).map(([v]) => v));
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

// how far a collider's space can stretch a distance in the world: 1 for one only moved and turned,
// else a bound (its 3×3 part's size); and how many points go in a run (Obstacles.minGap)
function stretch(iv) {
  const c = (i) => Math.hypot(iv[i], iv[i + 1], iv[i + 2]), d = (i, j) => iv[i] * iv[j] + iv[i + 1] * iv[j + 1] + iv[i + 2] * iv[j + 2];
  const rigid = [0, 4, 8].every((i) => Math.abs(c(i) - 1) < 1e-9) && Math.abs(d(0, 4)) < 1e-9 && Math.abs(d(0, 8)) < 1e-9 && Math.abs(d(4, 8)) < 1e-9;
  return rigid ? 1 : Math.hypot(c(0), c(4), c(8));
}
const CHUNK = 16;

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
      const e = c.m.elements, iv = c.inv.elements, L = { c, iv, m: e, k: cols.length, s: stretch(iv) };
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
  // the points in runs of CHUNK, each run's own ball turning it away from a part when it can't come
  // nearer than what's been found (a part's distance past its faces changes no faster than the point
  // moves, so a run whose middle is further than its ball's size can't do better: what comes back is
  // the same as taking every point). Distances past `cut` come back as just `cut`.
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
    // (each run's middle and size, in the world; its middle in the part's space)
    const nc = Math.ceil(count / CHUNK);
    let C = this.runs;
    if (!C || C.length < nc * 7) C = this.runs = new Float64Array(nc * 7 + 70);
    for (let k = 0; k < nc; k++) {
      const a = k * CHUNK, b = Math.min(count, a + CHUNK);
      let x = 0, y = 0, z = 0;
      for (let i = a; i < b; i++) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
      x /= b - a; y /= b - a; z /= b - a;
      let m2 = 0;
      for (let i = a; i < b; i++) { const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d > m2) m2 = d; }
      C[k * 7] = x; C[k * 7 + 1] = y; C[k * 7 + 2] = z; C[k * 7 + 3] = Math.sqrt(m2);
    }
    const toLocal = (L) => {
      if (L0 === L) return;
      L0 = L;
      const iv = L.iv;
      for (let i = 0; i < count; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        X[i * 3] = iv[0] * x + iv[4] * y + iv[8] * z + iv[12]; X[i * 3 + 1] = iv[1] * x + iv[5] * y + iv[9] * z + iv[13]; X[i * 3 + 2] = iv[2] * x + iv[6] * y + iv[10] * z + iv[14];
      }
      for (let k = 0; k < nc; k++) {
        const x = C[k * 7], y = C[k * 7 + 1], z = C[k * 7 + 2];
        C[k * 7 + 4] = iv[0] * x + iv[4] * y + iv[8] * z + iv[12]; C[k * 7 + 5] = iv[1] * x + iv[5] * y + iv[9] * z + iv[13]; C[k * 7 + 6] = iv[2] * x + iv[6] * y + iv[10] * z + iv[14];
      }
    };
    for (let q = 0; q < PS.length; q++) {
      const dx = cx - W[q * 4], dy = cy - W[q * 4 + 1], dz = cz - W[q * 4 + 2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - W[q * 4 + 3] - rad > best) continue;
      const E = PS[q], pl = E.p.planes, np = pl.length, sc = E.L.s;
      toLocal(E.L);
      for (let k = 0; k < nc; k++) {
        const mx = C[k * 7 + 4], my = C[k * 7 + 5], mz = C[k * 7 + 6];
        let v = -Infinity;
        for (let j = 0; j < np; j += 4) { const u = pl[j] * mx + pl[j + 1] * my + pl[j + 2] * mz - pl[j + 3]; if (u > v) v = u; }
        if (v - C[k * 7 + 3] * sc > best + 1e-9) continue;
        const b = Math.min(count, (k + 1) * CHUNK);
        for (let i = k * CHUNK; i < b; i++) {
          const x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2];
          let v = -Infinity;
          for (let j = 0; j < np; j += 4) { const u = pl[j] * x + pl[j + 1] * y + pl[j + 2] * z - pl[j + 3]; if (u > v) { v = u; if (v >= best) break; } }
          if (v < best) { best = v; at = i; }
        }
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
  // `exact`); with `normal`, the outward direction there in this.n, how far in along it in this.out and
  // the collider in this.hit. With `from` (a point outside, that the point came from), the way out of a
  // solid is by one of the faces `from` is in front of: deep in a slab, back out of its top, not its
  // bottom. (`cut`: distances beyond it don't matter, and may come back as just "that far or more")
  sd(x, y, z, exact = false, normal = true, cut = Infinity, from = null) {
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
    this.out = best;
    if (!bp) { this.n.set(0, 1, 0); return best; }
    const o = this.localOf(bL, x, y, z, stamp), lx = LC[o], ly = LC[o + 1], lz = LC[o + 2];
    // the way out: the face pushing hardest (a solid), or the field's slope
    let nx, ny, nz;
    if (bp.planes) {
      const P = bp.planes;
      let fx = 0, fy = 0, fz = 0;
      if (from) {
        const iv = bL.iv;
        fx = iv[0] * from.x + iv[4] * from.y + iv[8] * from.z + iv[12]; fy = iv[1] * from.x + iv[5] * from.y + iv[9] * from.z + iv[13]; fz = iv[2] * from.x + iv[6] * from.y + iv[10] * from.z + iv[14];
      }
      let s = -Infinity, j0 = -1;
      for (let pass = from ? 0 : 1; pass < 2 && j0 < 0; pass++) {
        for (let j = 0; j < P.length; j += 4) {
          if (!pass && P[j] * fx + P[j + 1] * fy + P[j + 2] * fz - P[j + 3] <= 0) continue;
          const v = P[j] * lx + P[j + 1] * ly + P[j + 2] * lz - P[j + 3];
          if (v > s) { s = v; j0 = j; }
        }
      }
      if (best < 0) this.out = s;
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
const DOWN = 0.05;            // how far below its anchor a hand looks for something to be laid on (m)
const LAY_RATE = 0.25;        // how fast how far it's laid down may change (m/s): coming in over the
                              // table's edge, it's lowered onto it, not dropped
// how a curl moves the joints: [knuckle, middle, end] for a finger; [flex across, swing out, roll,
// knuckle, end] for the thumb (toward the palm: it hangs below a hand flat on a table)
const CURL = [1, 1.1, 0.7];
export const THUMB_CURL = [0.5, 1.0, 0, 0.3, 0.3];
const RANGE = { lo: -0.8, hi: 1.2 };
const CURL_RATE = 4;          // how fast a finger curls or opens (a curl of 1 a second is a knuckle turning about 60°)
const STUCK = 3;              // times the hand is moved out with a finger that can't get out on its own
const LIFT_STEPS = 3;         // bisection steps for how far a hand taken out is let down again in a frame
// the most times the hand is moved in a frame: pushed out 5 times, laid down and turned (twice: a move
// and 4 turns), pushed out twice more, let down from where a stuck finger took it (tried, bisected, put
// at what was found, and back where it was laid if that has it in something), and moved with a stuck
// finger (a fixed number: it never runs on)
export const MOVES = 5 + 2 * (1 + 4) + 2 + (3 + LIFT_STEPS) + STUCK;

// The arm's bulk, as balls along its two bones, each as big as the skin or the sleeve round it there
// (the furthest vertex from the bone's line, within 2.5 cm along it): [bone (0 upper arm, 1 forearm),
// distance along it (m), radius (m)]
const UPPER_L = 0.30;
const WRIST_Z = -0.30 - 0.26;   // the wrist on the arm at rest
function bulkOf(arm) {
  const g = arm.mesh.geometry, sg = arm.sleeve.geometry;
  const W0 = WRIST_Z;
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
    // (the hand's body: the palm, and the forearm's last 5 cm before the wrist, which a hand laid flat
    // brings down to the table)
    const P0 = R.mesh.geometry.attributes.position.array;
    const wristEnd = S.forearm.filter((v) => P0[v * 3 + 2] < WRIST_Z + 0.05);
    this.idx = {
      body: union(pick(S['palm.all'], 0.008), pick(wristEnd, 0.008)),
      heel: pick(S.heel, 0.004),
      ulnar: pick(S.ulnar, 0.004),
      arm: pick(union(S.forearm, S.sleeve), 0.03),
      fingers: {},
    };
    for (const f of FNAMES) this.idx.fingers[f] = compact(R, pick(S['finger.' + f], 0.005));
    // (the thumb's long bone moves with the thumb, so it's the thumb's; the ball of the thumb is the hand's
    // and the thumb's both: the hand rests on it, and the thumb mustn't press it in)
    this.idx.fingers.thumb = compact(R, pick(union(S.thenar, label('thumb1'), label('thumb2'), label('thumb3')), 0.005));
    this.idx.body = compact(R, this.idx.body);
    const make = (arm) => {
      const o = { body: new SkinPoints(arm, this.idx.body), heel: new SkinPoints(arm, this.idx.heel), ulnar: new SkinPoints(arm, this.idx.ulnar), fingers: {} };
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
  // arm solved for a wrist moved there (its elbow and turn kept), skip: names the hand ignores (the tool
  // it holds), tip: the wrist is placed by a tool's point (it is left where it is) }
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
      // the anchor (the heel, or the little-finger edge) and what's below it: from each of its points
      // straight down to the first thing there (stepped by the distance to the nearest thing, so never
      // past it), the nearest; a point already on or in something, how deep, and its way out. (Not simply
      // the nearest thing: by the tin, that's its side, and the hand would be laid sideways into it.)
      const heel = () => {
        const A = P[spec.anchor];
        boneMatrices(arm, M);
        A.update(M);
        const H = A.pos;
        let best = DOWN, bi = -1;
        for (let i = 0; i < A.count; i++) {
          const x = H[i * 3], y = H[i * 3 + 1], z = H[i * 3 + 2];
          let t = ob.sd(x, y, z, false, false, best + 0.01);
          if (t > MARGIN) {
            for (let k = 0; k < 10 && t < best; k++) {
              const d = ob.sd(x, y - t, z, false, false, best - t + 0.01);
              if (d < 0.0002) break;
              t += d;
            }
          }
          if (t < best) { best = t; bi = i; }
        }
        if (bi < 0) return null;
        const p = new THREE.Vector3(H[bi * 3], H[bi * 3 + 1], H[bi * 3 + 2]);
        if (best > MARGIN) return { g: best, n: new THREE.Vector3(0, 1, 0), p };
        ob.sd(p.x, p.y, p.z, true, true, 0.05);
        return { g: best, n: ob.n.clone(), p };
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
        const l0 = arm.lay, r = LAY_RATE * ctx.dt;
        let laid = 0;
        for (let pass = 0; pass < 2; pass++) {
          const h = heel();
          if (!h) break;
          if (this.debug) (st.log ||= []).push(['heel', +(h.g * 1000).toFixed(2), h.n.toArray().map((v) => +v.toFixed(2))]);
          if (Math.abs(h.g - MARGIN) > 0.0002) {
            let d = W * Math.max(-0.03, Math.min(0.03, h.g - MARGIN));
            if (l0 != null && ctx.dt > 0) d = Math.max(l0 - r - laid, Math.min(l0 + r - laid, d));
            move(-h.n.x * d, -h.n.y * d, -h.n.z * d);
            h.p.addScaledVector(h.n, -d);
            laid += d;
          }
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
        arm.lay = laid;
      } else arm.lay = 0;
      ctx.T.copy(T);
      ctx.wq = q;
    } else arm.lay = 0;
    // the fingers and the thumb, each on its own (the wrist is where it will be). Each goes where its role
    // puts it, as fast as a finger moves (CURL_RATE), and out of anything at once if there's a way out
    // within this frame's turn of it. A finger in something on its way (or in however it's curled) takes
    // the hand out with it, the deepest first; it keeps going its way, so it is never held back there.
    const fob = this.fob, last = arm.curl || {};
    const fingers = () => {
      boneMatrices(arm, M);
      fob.gather(w.x, w.y, w.z, 0.16, null, ctx.skip);
      const curl = {};
      let stuck = null;
      for (const f of [...FNAMES, 'thumb']) {
        const role = roleOf(f);
        if (role === 'fixed') continue;
        const gap = (c) => this.fingerGap(s, arm, ctx.t, f, c, fob);
        // the thumb's base can't swing back behind the palm, nor out past 70° (anatomy.js)
        const [lo, hi] = f === 'thumb' ? thumbR : [RANGE.lo, RANGE.hi];
        const c0 = Math.max(lo, Math.min(hi, 0));
        // free: as posed, or the nearest curl either way that is out of everything (straightening first,
        // or the way it has gone already); in something however it's curled, the curl that is least in
        let goal = c0, g = null;
        const prev = last[f];
        if (gap(c0) < MARGIN) {
          const out = nearestFree(gap, lo, hi, c0, prev);
          goal = out.c;
          if (out.stuck) g = out.g;
        }
        // touch: curled until it touches (with nothing in its reach, as posed); half a grip, half way
        if (role === 'touch' && W > 0 && goal === c0) {
          const b = gap(hi) > MARGIN ? c0 : bisect(gap, c0, hi);
          goal = c0 + W * (b - c0);
        }
        let c = goal;
        const r = CURL_RATE * ctx.dt;
        if (prev != null && ctx.dt > 0 && Math.abs(goal - prev) > r) {
          c = prev + Math.sign(goal - prev) * r;
          g = gap(c);
          if (g < MARGIN) {
            const o = nearestFree(gap, Math.max(lo, prev - r), Math.min(hi, prev + r), c, prev);
            if (!o.stuck) { c = o.c; g = null; }
          }
        }
        curl[f] = c;
        if (g != null && g < MARGIN && (!stuck || g < stuck.g)) stuck = { g, f, lo: c };
      }
      return { curl, stuck };
    };
    // The hand starts as far out as a stuck finger took it last frame, let down (by up to LAY_RATE) to
    // the lowest it can be with its fingers out of things, found by bisection: held still, it comes to
    // rest where it came out (taken out afresh each frame, it would go out and back in by turns, the
    // fingers a frame behind it).
    const T0 = ctx.tip ? null : ctx.T.clone();
    const at = (v) => {
      _T.copy(T0).add(v); st.its++;
      ctx.resolve(_T, ctx.wq);
      arm.root.updateWorldMatrix(true, true);
      ctx.T.copy(_T);
      return fingers();
    };
    // (how far the hand's body is in anything)
    const bodyIn = () => { boneMatrices(arm, M); P.body.update(M); return MARGIN - ob.minGap(P.body.pos, P.body.count, CUT); };
    // (only a hand whose body is out of things where it's laid: one caught in something isn't taken out
    // by its fingers at all, as it's not they that keep it there)
    const free = T0 && bodyIn() <= MARGIN;
    let out = null;
    if (free && arm.lift && ctx.dt > 0) {
      const L = arm.lift.length(), lifted = (x) => at(_mid.copy(arm.lift).multiplyScalar(x / L));
      // (a way out that has the hand's body in something, taken out through the table or under it, is
      // no way out)
      const caught = (o) => o.stuck || bodyIn() > MARGIN;
      let lo = Math.max(0, L - LAY_RATE * ctx.dt), hi = L;
      out = lifted(lo);
      if (out.stuck) {
        for (let i = 0; i < LIFT_STEPS; i++) {
          const m = (lo + hi) / 2;
          if (caught(lifted(m))) lo = m; else hi = m;
        }
        out = lifted(hi);
        // (no height that has it out: it is let down as far as it may be this frame, and comes down
        // over the next frames, never all at once)
        if (bodyIn() > MARGIN) out = lifted(Math.max(0, L - LAY_RATE * ctx.dt));
      }
      if (this.debug) (st.log ||= []).push(['lift', +(L * 1000).toFixed(2), +(ctx.T.distanceTo(T0) * 1000).toFixed(2)]);
    }
    out ||= fingers();
    // (again, up to STUCK times: by an edge, the way out of the deepest point may not be the way out of
    // the next)
    for (let it = 0; it < STUCK && out.stuck && free; it++) {
      // the stuck finger's deepest point out along its way out, the hand with it
      const stuck = out.stuck;
      this.fingerGap(s, arm, ctx.t, stuck.f, stuck.lo, fob);
      // (out the way the hand came in: the side of it the wrist is on)
      const pts = P.fingers[stuck.f], i = fob.at;
      arm.B.wrist.getWorldPosition(_u);
      fob.sd(pts.pos[i * 3], pts.pos[i * 3 + 1], pts.pos[i * 3 + 2], false, true, Infinity, _u);
      // (no face of it on the wrist's side: its nearest way out)
      if (!Number.isFinite(fob.out)) fob.sd(pts.pos[i * 3], pts.pos[i * 3 + 1], pts.pos[i * 3 + 2], false, true, Infinity);
      const d = MARGIN - Math.min(stuck.g, fob.out);
      if (this.debug) (st.log ||= []).push(['stuck', stuck.f, +(d * 1000).toFixed(2), fob.hit?.name, fob.n.toArray().map((v) => +v.toFixed(2))]);
      const T = _T.copy(ctx.T).addScaledVector(fob.n, d);
      st.moved += d; st.its++;
      ctx.resolve(T, ctx.wq);
      arm.root.updateWorldMatrix(true, true);
      ctx.T.copy(T);
      out = fingers();
    }
    const { curl } = out;
    arm.curl = curl;
    arm.lift = free && ctx.T.distanceToSquared(T0) > 1e-12 ? ctx.T.clone().sub(T0) : null;
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
// From c0 (in something), the nearest curl that is out: the range stepped through outward from c0 in
// SCAN steps, straightening before curling at each distance, then the edge found by bisection. A finger
// already straightened (or curled) out of the way looks that way first, and the other only if that has
// no way out: it doesn't flip across. None out: the curl least in (stuck).
const SCAN = 8;
function nearestFree(gap, lo, hi, c0, prev) {
  const d = (hi - lo) / SCAN;
  let best = c0, bg = -Infinity;
  const side = prev == null || Math.abs(prev - c0) < 0.01 ? 0 : Math.sign(prev - c0);
  const order = side ? [[side], [-side]] : [[-1, 1]];
  for (const sides of order) for (let k = 1; k <= SCAN; k++) {
    for (const s of sides) {
      const c = c0 + s * k * d;
      if (c < lo - 1e-9 || c > hi + 1e-9) continue;
      const g = gap(c);
      if (g >= MARGIN) {
        const inside = c0 + s * (k - 1) * d;
        // (bisect wants the free end first)
        let a = c, b = inside;
        for (let i = 0; i < STEPS; i++) { const m = (a + b) / 2; if (gap(m) >= MARGIN) a = m; else b = m; }
        return { c: a, g: MARGIN, stuck: false };
      }
      if (g > bg) { bg = g; best = c; }
    }
  }
  return { c: best, g: bg, stuck: true };
}
export { CURL, MARGIN };
