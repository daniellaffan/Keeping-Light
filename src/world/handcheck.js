// Debug: measuring the keeper's hands against the room. This is the test harness for the hands'
// contact solver: tools/check-hands.mjs drives it from headless Chromium (window.__handcheck), and with
// ?debug=1 the key O turns on an overlay that draws the colliders and reddens skin that is inside
// something.
//
// Every frame it can measure:
// * penetration: every skin and sleeve vertex of both arms, skinned on the CPU exactly as the GPU does,
//   against every collider's signed distance; and the other way, the probes down the middle of thin
//   things (a pencil, a rail, the leaf) against the skin (nearest skin vertex and its normal);
// * contact gaps: the parts of the hand each pose says should touch something (contacts.js);
// * every joint angle (anatomy.js), and how far each moved since the last frame;
// * the pencil's or quill's point against the page and against where it should be.
// Scenarios hold poses, play the game's own movements (the dusk at the table, the lamp, the chair, the
// mug, the dawn, the door, the stairs) finely stepped, sweep the writing point over the page, nudge the
// props, twist the forearm, and time things.
import * as THREE from 'three';
import { buildColliders, outline } from './colliders.js';
import { classifySkin, LABELS, MOVES } from './contact.js';
import { jointAngles, limits, ANATOMY } from './anatomy.js';
import { CONTACTS, STEADY, THRESH } from './contacts.js';
import { POSES, POSE_NAMES } from './hands.js';
import { BONES, FINGERS, FNAMES, THUMB, UPPER, FORE } from './handmesh.js';
import { glowMaterial } from './materials.js';
import { solve } from '../game/chart.js';
import { BOOK } from './book.js';

const MM = 1000;
const LIM = limits();
const ANGLE_KEYS = Object.keys(LIM);

// ---------------------------------------------------------------------------------------------------
// The skin and sleeve of one arm, skinned on the CPU: world positions and normals of every vertex.
class Skin {
  constructor(arm) {
    this.arm = arm;
    const g = arm.mesh.geometry, s = arm.sleeve.geometry;
    for (const m of [arm.mesh, arm.sleeve]) {
      const id = new THREE.Matrix4();
      if (!m.bindMatrix.equals(id)) throw new Error('handcheck: expected an identity bind matrix');
    }
    this.n = g.attributes.position.count; this.ns = s.attributes.position.count;
    const N = this.N = this.n + this.ns;
    this.rest = new Float32Array(N * 3); this.restN = new Float32Array(N * 3);
    this.si = new Uint16Array(N * 4); this.sw = new Float32Array(N * 4);
    this.rest.set(g.attributes.position.array, 0); this.rest.set(s.attributes.position.array, this.n * 3);
    this.restN.set(g.attributes.normal.array, 0); this.restN.set(s.attributes.normal.array, this.n * 3);
    this.si.set(g.attributes.skinIndex.array, 0); this.si.set(s.attributes.skinIndex.array, this.n * 4);
    this.sw.set(g.attributes.skinWeight.array, 0); this.sw.set(s.attributes.skinWeight.array, this.n * 4);
    this.idx = g.index.array;
    this.pos = new Float32Array(N * 3); this.nor = new Float32Array(N * 3);
    this.lo = [0, 0, 0]; this.hi = [0, 0, 0];
    // runs of CHUNK vertices lie close together (the mesher made them block by block): a box round each
    this.nc = Math.ceil(N / CHUNK);
    this.box = new Float32Array(this.nc * 6);
  }
  update() {
    const arm = this.arm;
    arm.root.updateWorldMatrix(true, true);
    arm.skeleton.update();
    const M = arm.skeleton.boneMatrices, mw = arm.mesh.matrixWorld.elements;
    const W = mw[0] === 1 && mw[5] === 1 && mw[10] === 1 && mw[12] === 0 && mw[13] === 0 && mw[14] === 0;
    if (!W) throw new Error('handcheck: expected the arm mesh at the origin');
    const R = this.rest, RN = this.restN, SI = this.si, SW = this.sw, P = this.pos, NN = this.nor;
    let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity;
    for (let v = 0, N = this.N; v < N; v++) {
      const i4 = v * 4;
      let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0;
      for (let q = 0; q < 4; q++) {
        const w = SW[i4 + q];
        if (w === 0) continue;
        const o = SI[i4 + q] * 16;
        a += w * M[o]; b += w * M[o + 1]; c += w * M[o + 2];
        d += w * M[o + 4]; e += w * M[o + 5]; f += w * M[o + 6];
        g += w * M[o + 8]; h += w * M[o + 9]; i += w * M[o + 10];
        j += w * M[o + 12]; k += w * M[o + 13]; l += w * M[o + 14];
      }
      const i3 = v * 3, x = R[i3], y = R[i3 + 1], z = R[i3 + 2];
      const px = a * x + d * y + g * z + j, py = b * x + e * y + h * z + k, pz = c * x + f * y + i * z + l;
      P[i3] = px; P[i3 + 1] = py; P[i3 + 2] = pz;
      if (px < lx) lx = px; if (py < ly) ly = py; if (pz < lz) lz = pz;
      if (px > hx) hx = px; if (py > hy) hy = py; if (pz > hz) hz = pz;
      const cb = Math.floor(v / CHUNK) * 6, Bx = this.box;
      if (v % CHUNK === 0) { Bx[cb] = Bx[cb + 3] = px; Bx[cb + 1] = Bx[cb + 4] = py; Bx[cb + 2] = Bx[cb + 5] = pz; } else {
        if (px < Bx[cb]) Bx[cb] = px; if (py < Bx[cb + 1]) Bx[cb + 1] = py; if (pz < Bx[cb + 2]) Bx[cb + 2] = pz;
        if (px > Bx[cb + 3]) Bx[cb + 3] = px; if (py > Bx[cb + 4]) Bx[cb + 4] = py; if (pz > Bx[cb + 5]) Bx[cb + 5] = pz;
      }
      const nx = RN[i3], ny = RN[i3 + 1], nz = RN[i3 + 2];
      let mx = a * nx + d * ny + g * nz, my = b * nx + e * ny + h * nz, mz = c * nx + f * ny + i * nz;
      const nl = Math.hypot(mx, my, mz) || 1;
      NN[i3] = mx / nl; NN[i3 + 1] = my / nl; NN[i3 + 2] = mz / nl;
    }
    this.lo = [lx, ly, lz]; this.hi = [hx, hy, hz];
  }
}

// A spatial hash of points (counting sort into buckets), for nearest-vertex lookups.
class Grid {
  constructor(cell, bits = 17) {
    this.cell = cell; this.size = 1 << bits; this.mask = this.size - 1;
    this.start = new Int32Array(this.size + 1);
  }
  key(ix, iy, iz) { return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & this.mask; }
  build(pos, list) {
    const n = list.length, c = this.cell, S = this.start;
    S.fill(0);
    const keys = this.keys = new Int32Array(n);
    for (let t = 0; t < n; t++) {
      const v = list[t] * 3;
      const k = this.key(Math.floor(pos[v] / c), Math.floor(pos[v + 1] / c), Math.floor(pos[v + 2] / c));
      keys[t] = k; S[k + 1]++;
    }
    for (let k = 0; k < this.size; k++) S[k + 1] += S[k];
    const fill = S.slice(0, this.size), items = this.items = new Int32Array(n);
    for (let t = 0; t < n; t++) items[fill[keys[t]]++] = list[t];
    this.pos = pos;
  }
  // the nearest point within r of q that `ok` accepts: [index, distance] or [-1, Infinity]
  nearest(qx, qy, qz, r, ok = null) {
    const c = this.cell, P = this.pos, S = this.start, I = this.items;
    const x0 = Math.floor((qx - r) / c), x1 = Math.floor((qx + r) / c);
    const y0 = Math.floor((qy - r) / c), y1 = Math.floor((qy + r) / c);
    const z0 = Math.floor((qz - r) / c), z1 = Math.floor((qz + r) / c);
    let best = -1, bd = r * r;
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.key(ix, iy, iz);
      for (let t = S[k], e = S[k + 1]; t < e; t++) {
        const v = I[t], o = v * 3;
        const dx = P[o] - qx, dy = P[o + 1] - qy, dz = P[o + 2] - qz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd && (!ok || ok(v))) { bd = d2; best = v; }
      }
    }
    return best < 0 ? NONE : [best, Math.sqrt(bd)];
  }
  // is anything in q's cell or the cells next to it?
  occupied(qx, qy, qz) {
    const c = this.cell, S = this.start;
    const ix = Math.floor(qx / c), iy = Math.floor(qy / c), iz = Math.floor(qz / c);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      const k = this.key(ix + a, iy + b, iz + d);
      if (S[k + 1] > S[k]) return true;
    }
    return false;
  }
}
const NONE = [-1, Infinity], FAR = [Infinity, -1];
const CHUNK = 256;

// ---------------------------------------------------------------------------------------------------
export function installHandCheck(game) {
  const k = game.keeper, hands = k.hands;
  let colliders = null, skins = null, parts = null;
  const grids = { R: new Grid(0.006), L: new Grid(0.006) }, coarse = { R: new Grid(0.016, 14), L: new Grid(0.016, 14) };
  const depth = { R: null, L: null };
  const overlay = { on: false, lines: [] };

  function boot() {
    if (colliders) return;
    // the same colliders the hands' solver uses
    colliders = hands.contact ? hands.contact.ob.all : buildColliders(k);
    skins = { R: new Skin(hands.R), L: new Skin(hands.L) };
    parts = classifySkin(hands.R);
    for (const s of ['R', 'L']) {
      depth[s] = new Float32Array(skins[s].N);
      skins[s].all = Int32Array.from({ length: skins[s].N }, (_, i) => i);
    }
  }
  const byName = (names) => colliders.filter((c) => names.includes(c.name));

  // ---- one frame's measurements ------------------------------------------------------------------
  // opts: { contacts: bool, ctx: {pressed, lift, lid, lever, ring}, info: bool (other hand, self) }
  function measure(opts = {}) {
    boot();
    const T = [performance.now()];
    for (const c of colliders) c.update();
    for (const s of ['R', 'L']) skins[s].update();
    T.push(performance.now());
    for (const s of ['R', 'L']) {
      const sk = skins[s];
      grids[s].build(sk.pos, sk.all);
      coarse[s].build(sk.pos, sk.all);
    }
    T.push(performance.now());
    const pen = {}, at = {};
    const note = (name, d, where) => { if (d > (pen[name] ?? 0)) { pen[name] = d; at[name] = where; } };
    for (const s of ['R', 'L']) forward(s, note);
    T.push(performance.now());
    for (const s of ['R', 'L']) reverse(s, note);
    T.push(performance.now());
    const rec = { pen, at };
    if (opts.prof) rec.prof = T.slice(1).map((t, i) => +(t - T[i]).toFixed(1));
    if (opts.info) rec.info = info();
    // contacts and the writing point
    const pose = hands.pose, P = CONTACTS[pose];
    if (opts.contacts && P) rec.c = contacts(pose, P, opts.ctx || {});
    // joint angles
    rec.a = { R: jointAngles(hands.R), L: jointAngles(hands.L) };
    rec.roll = { R: hands.R.roll, L: hands.L.roll };
    return rec;
  }

  // skin vertices inside colliders
  function forward(s, note) {
    const sk = skins[s], P = sk.pos, D = depth[s];
    D.fill(0);
    const lo = sk.lo, hi = sk.hi;
    for (const c of colliders) {
      if (!c.active() || (!c.parts.length && !c.fields.length)) continue;
      if (aabbDist(c.wc, lo, hi) > c.wr) continue;
      // the parts that can reach the arm
      const e = c.m.elements;
      const cand = c.parts.filter((p) => {
        const x = e[0] * p.c[0] + e[4] * p.c[1] + e[8] * p.c[2] + e[12], y = e[1] * p.c[0] + e[5] * p.c[1] + e[9] * p.c[2] + e[13], z = e[2] * p.c[0] + e[6] * p.c[1] + e[10] * p.c[2] + e[14];
        return aabbDist([x, y, z], lo, hi) <= p.r;
      });
      const fields = c.fields.filter((f) => (!f.on || f.on()));
      if (!cand.length && !fields.length) continue;
      const iv = c.inv.elements;
      // each part's (and field's) bound in the world, to check against each run of vertices
      const wb = [...cand, ...fields].map((p) => [e[0] * p.c[0] + e[4] * p.c[1] + e[8] * p.c[2] + e[12], e[1] * p.c[0] + e[5] * p.c[1] + e[9] * p.c[2] + e[13], e[2] * p.c[0] + e[6] * p.c[1] + e[10] * p.c[2] + e[14], p.r]);
      const nc = cand.length, Bx = sk.box;
      let best = 0, bv = -1;
      const pl = [], fl = [];
      for (let ch = 0; ch < sk.nc; ch++) {
        const b0 = ch * 6;
        pl.length = 0; fl.length = 0;
        // the run's middle in the collider's space, and how far its corners reach from it
        const cx = (Bx[b0] + Bx[b0 + 3]) / 2, cy = (Bx[b0 + 1] + Bx[b0 + 4]) / 2, cz = (Bx[b0 + 2] + Bx[b0 + 5]) / 2;
        const hd = Math.hypot(Bx[b0 + 3] - Bx[b0], Bx[b0 + 4] - Bx[b0 + 1], Bx[b0 + 5] - Bx[b0 + 2]) / 2;
        const mx = iv[0] * cx + iv[4] * cy + iv[8] * cz + iv[12], my = iv[1] * cx + iv[5] * cy + iv[9] * cz + iv[13], mz = iv[2] * cx + iv[6] * cy + iv[10] * cz + iv[14];
        for (let q = 0; q < wb.length; q++) {
          const [x, y, z, r] = wb[q];
          const dx = Math.max(Bx[b0] - x, 0, x - Bx[b0 + 3]), dy = Math.max(Bx[b0 + 1] - y, 0, y - Bx[b0 + 4]), dz = Math.max(Bx[b0 + 2] - z, 0, z - Bx[b0 + 5]);
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          // the distance past a face never changes faster than the point moves: if the run's middle is
          // further outside than the run is wide, all of it is outside
          if (q < nc) { if (cand[q].sd(mx, my, mz) > hd) continue; pl.push(cand[q]); } else { const f = fields[q - nc]; if (f.f(mx, my, mz, hd) > hd) continue; fl.push(f); }
        }
        if (!pl.length && !fl.length) continue;
        for (let v = ch * CHUNK, ve = Math.min(sk.N, v + CHUNK); v < ve; v++) {
          const o = v * 3, x = P[o], y = P[o + 1], z = P[o + 2];
          const lx = iv[0] * x + iv[4] * y + iv[8] * z + iv[12], ly = iv[1] * x + iv[5] * y + iv[9] * z + iv[13], lz = iv[2] * x + iv[6] * y + iv[10] * z + iv[14];
          let d = Infinity;
          for (let q = 0; q < pl.length; q++) {
            const p = pl[q], dx = lx - p.c[0], dy = ly - p.c[1], dz = lz - p.c[2];
            if (dx * dx + dy * dy + dz * dz > p.r * p.r) continue;
            const v2 = p.sd(lx, ly, lz);
            if (v2 < d) d = v2;
          }
          for (let q = 0; q < fl.length; q++) { const v2 = fl[q].f(lx, ly, lz, 0); if (v2 < d) d = v2; }
          if (d < 0) {
            const dm = -d * MM;
            if (dm > D[v]) D[v] = dm;
            if (dm > best) { best = dm; bv = v; }
          }
        }
      }
      if (bv >= 0) note(c.name, best, s + '.' + LABELS[parts.label[bv]]);
    }
  }

  // signed distance from a world point to an arm's skin: by its nearest vertex and that vertex's normal
  // Nothing of the arm within 12 mm counts as outside: a thin thing deeper inside than that (only the
  // forearm is that thick) is still found where it goes in, and by the skin inside it.
  function skinSd(s, x, y, z) {
    const sk = skins[s];
    if (!coarse[s].occupied(x, y, z)) return FAR;
    let [v, d] = grids[s].nearest(x, y, z, 0.005);
    if (v < 0) [v, d] = grids[s].nearest(x, y, z, 0.012);
    if (v < 0) return FAR;
    const o = v * 3, N = sk.nor, P = sk.pos;
    const side = (x - P[o]) * N[o] + (y - P[o + 1]) * N[o + 1] + (z - P[o + 2]) * N[o + 2];
    return [side < 0 ? -d : d, v];
  }

  // probes down the middle of thin things, against the skin
  function reverse(s, note) {
    const sk = skins[s], lo = sk.lo, hi = sk.hi;
    for (const c of colliders) {
      if (!c.active()) continue;
      const pr = c.sheet ? c.sheet() : c.probes;
      if (!pr.length) continue;
      if (aabbDist(c.wc, lo, hi) > c.wr + 0.05) continue;
      const e = c.m.elements;
      let best = 0, bv = -1;
      for (let i = 0; i < pr.length; i += 4) {
        const px = pr[i], py = pr[i + 1], pz = pr[i + 2], r = pr[i + 3];
        const x = e[0] * px + e[4] * py + e[8] * pz + e[12], y = e[1] * px + e[5] * py + e[9] * pz + e[13], z = e[2] * px + e[6] * py + e[10] * pz + e[14];
        if (x < lo[0] - r - 0.01 || y < lo[1] - r - 0.01 || z < lo[2] - r - 0.01 || x > hi[0] + r + 0.01 || y > hi[1] + r + 0.01 || z > hi[2] + r + 0.01) continue;
        const [d, v] = skinSd(s, x, y, z);
        const p = (r - d) * MM;
        if (p > best && v >= 0) { best = p; bv = v; }
      }
      if (bv >= 0) {
        note(c.name, best, s + '.' + LABELS[parts.label[bv]]);
        if (best > depth[s][bv]) depth[s][bv] = best;
      }
    }
  }

  // not gated, reported: one hand inside the other, and each hand's fingers inside its own palm or
  // other fingers (skin that was more than 15 mm away at rest)
  function info() {
    const out = { hands: 0, selfR: 0, selfL: 0 };
    const hs = parts.sets.hand;
    for (let t = 0; t < hs.length; t += 3) {
      const v = hs[t], o = v * 3, P = skins.R.pos;
      const [d] = skinSd('L', P[o], P[o + 1], P[o + 2]);
      if (d < 0) out.hands = Math.max(out.hands, -d * MM);
    }
    for (const s of ['R', 'L']) {
      const sk = skins[s], P = sk.pos, RP = sk.rest, N = sk.nor;
      for (let t = 0; t < hs.length; t += 3) {
        const v = hs[t], o = v * 3;
        const ok = (u) => { const a = u * 3, dx = RP[a] - RP[o], dy = RP[a + 1] - RP[o + 1], dz = RP[a + 2] - RP[o + 2]; return dx * dx + dy * dy + dz * dz > 0.015 * 0.015 && parts.label[u] !== LABELS.indexOf('sleeve'); };
        const [u, d] = grids[s].nearest(P[o], P[o + 1], P[o + 2], 0.008, ok);
        if (u < 0) continue;
        const a = u * 3, side = (P[o] - P[a]) * N[a] + (P[o + 1] - P[a + 1]) * N[a + 1] + (P[o + 2] - P[a + 2]) * N[a + 2];
        if (side < 0) out['self' + s] = Math.max(out['self' + s], d * MM);
      }
    }
    return out;
  }

  // the gap (mm) of each contact the pose asks for: per hand part, the closest of its vertices to the
  // target; a contact with `need` n holds when its n best parts are within tolerance
  function contacts(pose, P, ctx) {
    const out = [];
    for (const s of ['R', 'L']) {
      for (const C of P[s] || []) {
        if (C.when && !ctx[C.when]) continue;
        const id = s + ': ' + C.id;
        if (C.clear) {
          const g = intrusion(s, C.drawing) * MM;
          out.push([id, g, C.tol, g <= C.tol]);
          continue;
        }
        if (C.nib || C.route) {
          const tool = heldTool();
          if (!tool) { out.push([id, null, C.tol, false]); continue; }
          const tip = tool.obj.localToWorld(new THREE.Vector3());
          let g;
          if (C.nib) g = Math.abs(byName(C.target)[0].sd(tip.x, tip.y, tip.z, true)) * MM;
          else g = tip.distanceTo(k.tip) * MM;
          out.push([id, g, C.tol, g <= C.tol]);
          continue;
        }
        const names = C.target.map((t) => (t === 'tool' ? heldTool()?.name : t)).filter(Boolean);
        const targets = byName(names).filter((c) => c.active());
        if (!targets.length) { out.push([id, null, C.tol, false]); continue; }
        const gaps = C.parts.map((pn) => partGap(s, parts.sets[pn], targets)).sort((a, b) => a - b);
        const g = gaps[(C.need || C.parts.length) - 1] * MM;
        out.push([id, g, C.tol, g <= C.tol]);
      }
    }
    return out;
  }
  // How far (m) this arm's skin comes in over the logbook's pages, within 15 cm above them: the
  // distance of the deepest vertex inside the pages' edge. Drawing, the hand may be over the page below
  // and to the right of its point (as it is seen, leaning over the book), and only there.
  const _bk = new THREE.Matrix4();
  function intrusion(s, drawing) {
    const b = k.book, B = BOOK;
    const [x0, x1, z0, z1] = b.single ? [-430 * b.singleScale, 430 * b.singleScale, (16 - 626) * b.singleScale, (1236 - 626) * b.singleScale]
      : [(B.PAGE_L.x - 800) * B.S, (B.PAGE_L.x + 2 * B.PAGE_L.w - 800) * B.S, (B.PAGE_L.y - 500) * B.S, (B.PAGE_L.y + B.PAGE_L.h - 500) * B.S];
    b.group.updateWorldMatrix(true, false);
    const e = _bk.copy(b.group.matrixWorld).invert().elements;
    let tx = Infinity, tz = Infinity;
    if (drawing) {
      const t = k.tip, lx = e[0] * t.x + e[4] * t.y + e[8] * t.z + e[12], lz = e[2] * t.x + e[6] * t.y + e[10] * t.z + e[14];
      tx = lx - 0.01; tz = lz - 0.01;
    }
    const P = skins[s].pos, N = skins[s].N;
    let worst = 0;
    for (let v = 0; v < N; v += 2) {
      const o = v * 3, x = P[o], y = P[o + 1], z = P[o + 2];
      const lx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13], lz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (ly > 0.15 || lx <= x0 || lx >= x1 || lz <= z0 || lz >= z1) continue;
      if (lx >= tx && lz >= tz) continue;
      const d = Math.min(lx - x0, x1 - lx, lz - z0, z1 - lz);
      if (d > worst) worst = d;
    }
    return worst;
  }
  function heldTool() {
    const p = POSES[hands.pose]?.R;
    if (!p?.hold) return null;
    const obj = hands.tools[p.hold];
    if (!(hands.inHand(p.hold) || p.grasp) || !obj.visible) return null;
    return { name: p.hold === 'pen' ? 'quill' : 'pencil', obj };
  }
  function partGap(s, set, targets) {
    if (!set) return Infinity;
    const P = skins[s].pos;
    let best = Infinity;
    for (const c of targets) {
      const iv = c.inv.elements;
      const sheet = c.sheet ? c.sheet() : null;
      for (let t = 0; t < set.length; t++) {
        const o = set[t] * 3, x = P[o], y = P[o + 1], z = P[o + 2];
        const lx = iv[0] * x + iv[4] * y + iv[8] * z + iv[12], ly = iv[1] * x + iv[5] * y + iv[9] * z + iv[13], lz = iv[2] * x + iv[6] * y + iv[10] * z + iv[14];
        let d;
        if (sheet) {
          d = Infinity;
          for (let i = 0; i < sheet.length; i += 4) { const dx = lx - sheet[i], dy = ly - sheet[i + 1], dz = lz - sheet[i + 2]; d = Math.min(d, dx * dx + dy * dy + dz * dz); }
          d = Math.sqrt(d);
        } else d = c.sdLocal(lx, ly, lz, true, best);
        if (d < best) best = d;
      }
    }
    return best;
  }

  // ---- recording a scenario ----------------------------------------------------------------------
  // Aggregates frames: per object the worst penetration (and the 99th percentile of the frames' worst),
  // per contact the worst gap, per joint its range and fastest move (scaled to 30 fps), the forearm's
  // roll flips; optionally a time series for plots.
  class Recorder {
    constructor(name, { series = null } = {}) {
      this.name = name;
      this.frames = 0;
      this.pen = {}; this.penAt = {}; this.penFrames = {};
      this.info = { hands: 0, selfR: 0, selfL: 0 };
      this.con = {};
      this.ang = { R: {}, L: {} };
      this.flips = [];
      this.out = [];
      this.series = series ? { keys: series, t: [], v: [] } : null;
      this.prev = null;
      this.segs = {};
    }
    add(rec, { t = 0, dt = 1 / 30, cut = false, seg = null, prop = null } = {}) {
      const f = this.frames++;
      // how many steps the moving thing took (frames in which it moved)
      if (prop != null) { if (this.lastProp != null && prop !== this.lastProp) this.increments = (this.increments || 0) + 1; this.lastProp = prop; }
      for (const [o, d] of Object.entries(rec.pen)) {
        if (d > (this.pen[o] ?? 0)) { this.pen[o] = d; this.penAt[o] = `${rec.at[o]} @${f} ${seg || ''}`.trim(); }
        (this.penFrames[o] ||= []).push(d);
      }
      if (rec.info) for (const key of Object.keys(this.info)) this.info[key] = Math.max(this.info[key], rec.info[key]);
      for (const [id, g, tol, ok] of rec.c || []) {
        const C = (this.con[id] ||= { worst: -Infinity, tol, n: 0, fail: 0, first: null });
        C.n++;
        const gg = g == null ? Infinity : g;
        if (gg > C.worst) C.worst = gg;
        if (!ok) { C.fail++; if (C.first == null) C.first = `@${f} ${seg || ''}`.trim(); }
      }
      for (const s of ['R', 'L']) {
        const A = rec.a[s], prev = this.prev?.a[s];
        for (const key of ANGLE_KEYS) {
          const v = A[key];
          const st = (this.ang[s][key] ||= { min: Infinity, max: -Infinity, step: 0, stepAt: null, out: 0, outAt: null });
          if (v < st.min) st.min = v;
          if (v > st.max) st.max = v;
          const L = LIM[key];
          if (L && (v < L[0] - 1e-6 || v > L[1] + 1e-6)) { st.out++; if (!st.outAt) st.outAt = `${v.toFixed(1)}° @${f} ${seg || ''}`.trim(); }
          if (prev && !cut) {
            const dv = Math.abs(v - prev[key]) * (1 / 30) / dt;
            if (dv > st.step) { st.step = dv; st.stepAt = `@${f} ${seg || ''}`.trim(); }
          }
        }
        // the forearm's roll: never wrapping round, never jumping across zero
        const r = rec.roll[s], pr = this.prev?.roll[s];
        if (pr != null && r != null && !cut) {
          const jump = Math.abs(r - pr) * 180 / Math.PI;
          if (jump > 90 || (Math.sign(r) !== Math.sign(pr) && Math.abs(r) > Math.PI / 4 && Math.abs(pr) > Math.PI / 4)) this.flips.push(`${s} ${(pr * 57.3).toFixed(0)}°→${(r * 57.3).toFixed(0)}° @${f} ${seg || ''}`);
        }
      }
      if (seg) {
        const S = (this.segs[seg] ||= { frames: 0, pen: {}, step: 0, stepAt: null, conFail: 0 });
        S.frames++;
        for (const [o, d] of Object.entries(rec.pen)) S.pen[o] = Math.max(S.pen[o] ?? 0, d);
        for (const c of rec.c || []) if (!c[3]) S.conFail++;
        if (this.prev && !cut) for (const s of ['R', 'L']) for (const key of ANGLE_KEYS) {
          const dv = Math.abs(rec.a[s][key] - this.prev.a[s][key]) * (1 / 30) / dt;
          if (dv > S.step) { S.step = dv; S.stepAt = `${s} ${key}`; }
        }
      }
      if (this.series) {
        this.series.t.push(+t.toFixed(4));
        this.series.v.push(this.series.keys.map(([s, key]) => {
          if (key === 'pen') return +Math.max(0, ...Object.values(rec.pen)).toFixed(3);
          if (key === 'gap') { const g = (rec.c || []).filter((c) => c[0].startsWith(s)).map((c) => c[1] ?? 99); return g.length ? +Math.max(...g).toFixed(3) : null; }
          if (key === 'prop') return prop;
          return +rec.a[s][key].toFixed(2);
        }));
      }
      this.prev = rec;
    }
    result() {
      const p99 = {};
      for (const [o, list] of Object.entries(this.penFrames)) {
        const s = list.slice().sort((a, b) => a - b);
        // over all frames (frames with nothing inside count as 0)
        const all = this.frames, zeros = all - s.length, idx = Math.ceil(0.99 * all) - 1;
        p99[o] = idx < zeros ? 0 : s[idx - zeros];
      }
      const r3 = (x) => (x == null ? null : +(+x).toFixed(3));
      const ang = { R: {}, L: {} };
      for (const s of ['R', 'L']) for (const [key, st] of Object.entries(this.ang[s])) ang[s][key] = { min: r3(st.min), max: r3(st.max), step: r3(st.step), stepAt: st.stepAt, out: st.out, outAt: st.outAt };
      const pen = {};
      for (const o of Object.keys(this.pen)) pen[o] = { max: r3(this.pen[o]), p99: r3(p99[o]), at: this.penAt[o] };
      const con = {};
      for (const [id, C] of Object.entries(this.con)) con[id] = { worst: C.worst === Infinity ? null : r3(C.worst), tol: C.tol, n: C.n, fail: C.fail, first: C.first };
      const segs = {};
      for (const [n, S] of Object.entries(this.segs)) segs[n] = { frames: S.frames, pen: Object.fromEntries(Object.entries(S.pen).map(([o, d]) => [o, r3(d)])), step: r3(S.step), stepAt: S.stepAt, conFail: S.conFail };
      return { name: this.name, frames: this.frames, pen, info: Object.fromEntries(Object.entries(this.info).map(([a, b]) => [a, r3(b)])), con, ang, flips: this.flips.slice(0, 20), nFlips: this.flips.length, segs, series: this.series, ...this.extra };
    }
  }

  // ---- driving the game ---------------------------------------------------------------------------
  // one step of the game (logic only), the hands' update timed
  let timing = null;
  const hu = hands.update.bind(hands);
  hands.update = function (...a) {
    const t0 = performance.now();
    hu(...a);
    if (timing) timing.push(performance.now() - t0);
  };
  let lastBody = null, blendAge = 0, lastDt = 1 / 30;
  function step(dt) {
    game.noRender = true;
    game.step(1, dt);
    blendAge = hands.blend >= 1 ? blendAge + dt : 0;
    lastDt = dt;
    // a cut: the hands are simply placed where they belong (hands.js does the same test)
    const b = k.frames.body;
    const cut = !!lastBody && (b.pos.distanceTo(lastBody.pos) > 0.5 || b.quat.angleTo(lastBody.quat) > 1.0);
    lastBody = { pos: b.pos.clone(), quat: b.quat.clone() };
    return cut;
  }
  function ctxNow() {
    const sc = k.book.scene, fa = sc.flipAnim;
    const review = k.state === 'review';
    const S = k.ink ? k.inkSteps()[k.ink.step] : null;
    return {
      steady: review || ((STEADY[hands.pose] || []).includes(k.state) && blendAge >= 0.2),
      posed: review || hands.blend >= 1,
      // the frame in which an inking step takes or puts down a tool (its callback runs at its end)
      grasp: review || (!!S && !!S[2] && k.ink.t + lastDt * 1.5 >= S[1]),
      carry: review || (!!S && S[3] === 'carry'),
      pressed: !!(k.pointerOnPage && k.book.input.down) || !!(k.ink && k.inkSteps()[k.ink.step][3] === 'draw'),
      lift: !!fa && fa.t <= 0.2,
      // from when the cover starts to lift until the hand lets it fall
      lid: review || (k.state === 'closing' && k.book.closed > 0 && k.book.closed <= 0.42),
      // from when the lever starts down until the keeper turns away
      lever: review || (k.state === 'light' && k.st >= 1.3),
      // from when the door starts to open until the hand lets go of the ring
      ring: review || (k.state === 'door' && k.st >= 0.85 && k.st < 1.6),
      book: review || ['lean', 'lean-in', 'lean-out', 'closing'].includes(k.state),
    };
  }
  // run frames, measuring each: until(t) → true to stop
  function run(R, { dt = 1 / 30, until, max = 20000, seg = () => null, contacts = true, info = true, onFrame = null, prop = null }) {
    let t = 0;
    for (let i = 0; i < max; i++) {
      onFrame?.(t, i);
      const cut = step(dt);
      t += dt;
      const rec = measure({ contacts, ctx: ctxNow(), info: info && i % 10 === 0 });
      R.add(rec, { t, dt, cut, seg: seg(t), prop: prop ? prop() : null });
      if (until(t, i)) break;
    }
    return t;
  }
  const segName = () => {
    const h = hands;
    const pose = h.pose;
    return h.blend < 1 && h.from ? `${k.state}: →${pose}` : `${k.state}: ${pose}`;
  };

  // hold a pose (debug review), settle, then measure: penetration, contacts, angles, and stillness
  function hold(pose, { light = 1, frames = 12, settle = 40 } = {}) {
    boot();
    game.transition = null;
    const L = [['day', {}], ['dusk', {}], ['night', {}], ['dusk', { haar: 1 }]][light];
    k.review(pose, L[0], L[1]);
    // the tools where this pose has them: in the hand, or the quill standing in its well
    const inHand = { ready: 'pencil', write: 'pencil', 'ink-tray': 'pencil', pen: 'pen', 'ink-lift': 'pen' }[pose];
    if (inHand && !hands.inHand(inHand)) hands.take(inHand);
    if ((pose === 'ink-take' || pose === 'ink-well') && hands.inHand('pen')) hands.put('pen', k.well, k.quillWell.pos, new THREE.Euler().setFromQuaternion(k.quillWell.quat, 'YXZ'));
    lastBody = null;
    for (let i = 0; i < settle; i++) step(1 / 30);
    const R = new Recorder('hold ' + pose);
    let still = 0, prevPos = null, moves = 0;
    for (let i = 0; i < frames; i++) {
      const cut = step(1 / 30);
      for (const s of ['R', 'L']) moves = Math.max(moves, hands.contact?.stats[s].its ?? 0);
      const rec = measure({ contacts: true, ctx: ctxNow(), info: i === 0 });
      R.add(rec, { cut });
      // a held hand: how far its skin moved since the last frame
      const cur = { R: skins.R.pos.slice(), L: skins.L.pos.slice() };
      if (prevPos) for (const s of ['R', 'L']) still = Math.max(still, maxMove(prevPos[s], cur[s], parts.sets.hand));
      prevPos = cur;
    }
    const out = R.result();
    out.stillMm = +(still * MM).toFixed(4);
    out.moves = moves; out.moveLimit = MOVES;
    return out;
  }

  // ---- scenarios ----------------------------------------------------------------------------------
  // Each phase of a movement is recorded on its own (and carries the last frame over, so a joint's
  // move across the join is still checked). `prop` is how far the moving thing has gone, logged with
  // the angles so the increments over its travel can be counted.
  const PROPS = {
    lever: () => +k.room.lever.rotation.x.toFixed(5),
    door: () => +(-k.room.door.swing.rotation.y).toFixed(5),
    cover: () => +k.book.closed.toFixed(5),
    leaf: () => +(k.book.scene.flipAnim?.t ?? -1).toFixed(5),
    ink: () => +(k.book.scene.inking?.t ?? -1).toFixed(5) + (k.ink ? k.ink.step : 0),
    // how far the mug has come off the sill into the hands (as the keeper carries it)
    mug: () => +(hands.pose === 'mug' ? hands.blend : hands.from && k.lastHandPose === 'mug' ? 1 - hands.blend : 0).toFixed(5),
    rail: () => +((k.stair ?? 0) + (k.blendT ? k.blendT.t : 0)).toFixed(5),
    pencil: () => +(k.book.input.x + k.book.input.y / 1e4).toFixed(4),
    none: () => 0,
  };
  function phases() {
    let prev = null;
    const out = [];
    return {
      out,
      start(name, prop = 'none') { const R = new Recorder(name, { series: SERIES }); R.prev = prev; R.propKey = prop; this.cur = R; return R; },
      end() { const R = this.cur; prev = R.prev; const res = R.result(); res.prop = R.propKey; res.increments = R.increments; out.push(res); return res; },
    };
  }

  const scenarios = {
    // The dusk at the table, start to end, as the game plays it: lean in; draw a stroke with the pencil;
    // turn a page back and forward again; ink the plan (pencil down, inkwell in, quill out, dip, draw,
    // quill back); stand and pull the lamp lever through its whole travel; go to the chair; a sip from
    // the mug; then dawn: up out of the chair to the book, and close it.
    dusk({ upTo = null, only = null } = {}) {
      boot();
      const sc = k.book.scene, b = k.book, P = phases();
      lastBody = null;
      for (let i = 0; i < 20; i++) step(1 / 30);
      const last = only ? only[only.length - 1] : upTo;
      const phase = (name, prop, dt, opts) => {
        if (only && !only.includes(name)) {
          // played through as the game would, unmeasured
          let t = 0;
          for (let i = 0; i < (opts.max || 20000); i++) { opts.onFrame?.(t, i); step(dt); t += dt; if (opts.until(t, i)) break; }
          return false;
        }
        const R = P.start(name, prop);
        run(R, { dt, seg: segName, prop: PROPS[prop], ...opts });
        P.end();
        return last === name;
      };
      // (held still once leant in, and in the chair after the sip: breathing only)
      let still = null, stillChair = null;
      const done = () => ({ phases: P.out, still: { lean: still, chair: stillChair } });
      k.setState('lean-in');
      const leanLast = phase('lean in', 'none', 1 / 60, { until: () => k.state === 'lean' && hands.blend >= 1 && k.st > 0.6 });
      still = stillness(60, 1 / 30);
      if (leanLast) return done();
      // a stroke across the chart, then the pencil lifted
      const path = [[1000, 300], [1250, 420], [1380, 640], [1150, 780], [950, 600]];
      k.pointerOnPage = true; b.input.down = true;
      if (phase('write', 'pencil', 1 / 60, {
        until: (t) => t > 4.6,
        onFrame: (t) => {
          if (t < 2.2) { const [x, y] = along(path, t / 2.2); b.input.x = x; b.input.y = y; } else if (b.input.down) { b.input.down = false; k.pointerOnPage = false; }
        },
      })) return done();
      sc.flip(-1);
      if (phase('turn back', 'leaf', 0.55 / 150, { until: (t) => !sc.flipAnim && t > 0.9 })) return done();
      sc.flip(1);
      if (phase('turn forward', 'leaf', 0.55 / 150, { until: (t) => !sc.flipAnim && t > 0.9 })) return done();
      sc.autoPlan(); sc.inkThePlan();
      if (phase('ink', 'ink', 1 / 150, { until: () => k.state !== 'lean' && !k.ink, max: 40000 })) return done();
      if (phase('lamp', 'lever', 1 / 150, { until: () => k.state === 'to-chair', max: 40000 })) return done();
      if (phase('to the chair', 'none', 1 / 60, { until: () => k.state === 'chair' && k.blendT == null && k.st > 0.5, max: 40000 })) return done();
      k.sip = { t: 0, level: k.room.mug.userData.tea.position.y };
      const mugLast = phase('mug', 'mug', 1 / 200, { until: (t) => !k.sip && t > 5.2, max: 40000 });
      stillChair = stillness(60, 1 / 30);
      if (mugLast) return done();
      game.onNightOver();
      if (phase('dawn', 'none', 1 / 30, { until: () => k.state === 'dawn-chair' && k.st > 0.5, max: 2000 })) return done();
      k.toLogbook();
      if (phase('rise', 'none', 1 / 60, { until: () => k.state === 'lean' && hands.blend >= 1 && k.st > 0.6, max: 40000 })) return done();
      sc.closeBook();
      phase('close', 'cover', 1 / 150, { until: () => k.state !== 'closing', max: 40000 });
      return done();
    },
    // the day: the hand takes the door's ring and pulls it open
    door() {
      boot();
      const P = phases();
      lastBody = null;
      for (let i = 0; i < 30; i++) step(1 / 30);
      k.setState('door');
      const R = P.start('door', 'door');
      run(R, { dt: 1 / 150, seg: segName, prop: PROPS.door, until: () => k.state !== 'door', max: 40000 });
      P.end();
      return P.out;
    },
    // the finale: up the stairs, the right hand sliding up the rail
    stairs() {
      boot();
      const P = phases();
      lastBody = null;
      for (let i = 0; i < 30; i++) step(1 / 30);
      let climbs = 0;
      const R = P.start('stairs', 'rail');
      run(R, { dt: 1 / 150, seg: segName, prop: PROPS.rail, max: 40000, until: () => climbs >= 8 && k.st - k.climbT > 1.5, onFrame: () => { if (k.st - k.climbT > 1.0 && k.st > 1.0 && climbs < 8) { k.climb(); climbs++; } } });
      P.end();
      return P.out;
    },
    // a whole night played by autoplay, at 30 frames a second: every joint angle every frame
    // (penetration every fifth frame)
    night({ dt = 1 / 30, maxFrames = 80000 } = {}) {
      boot();
      const R = new Recorder('autoplayed night');
      // and each pose's frames on their own (a pose's recorder forgets the last frame when another
      // pose came between, so its moves are only measured frame to frame)
      const byPose = {};
      lastBody = null;
      const start = game.night.id;
      const timed = [];
      timing = timed;
      let t = 0, frames = 0;
      for (; frames < maxFrames; frames++) {
        const cut = step(dt);
        t += dt;
        const rec = frames % 5 === 0 ? measure({ contacts: false }) : { pen: {}, at: {}, a: { R: jointAngles(hands.R), L: jointAngles(hands.L) }, roll: { R: hands.R.roll, L: hands.L.roll } };
        const seg = `${game.sceneName} ${k.state}: ${hands.pose}`;
        R.add(rec, { t, dt, cut, seg });
        const PR = (byPose[hands.pose] ||= new Recorder('night: ' + hands.pose));
        if (PR.lastFrame !== frames - 1) PR.prev = null;
        PR.lastFrame = frames;
        PR.add(rec, { t, dt, cut, seg });
        if (game.night.id !== start && game.sceneName === 'daymap') break;
      }
      timing = null;
      const out = R.result();
      out.gameSeconds = +t.toFixed(1);
      out.timing = summary(timed);
      out.series = null;
      out.byPose = Object.fromEntries(Object.entries(byPose).map(([p, r]) => { const o = r.result(); delete o.segs; o.series = null; return [p, o]; }));
      return out;
    },
  };

  // hands held still for n frames: the most any hand vertex moved in a frame (mm)
  function stillness(n, dt) {
    let still = 0, prev = null;
    for (let i = 0; i < n; i++) {
      step(dt);
      for (const s of ['R', 'L']) skins[s].update();
      const cur = { R: skins.R.pos.slice(), L: skins.L.pos.slice() };
      if (prev) for (const s of ['R', 'L']) still = Math.max(still, maxMove(prev[s], cur[s], parts.sets.hand));
      prev = cur;
    }
    return +(still * MM).toFixed(4);
  }

  // ---- the writing point swept over the page ----------------------------------------------------
  // pose 'write' (pencil) or 'pen' (quill): the point pressed on the page at each place of a grid,
  // visited in rows; each place settled, then measured
  function sweep(pose, { nx = 24, ny = 16, settle = 10 } = {}) {
    boot();
    game.transition = null;
    k.review(pose, 'dusk', {});
    if (!hands.inHand(POSES[pose].R.hold)) hands.take(POSES[pose].R.hold);
    lastBody = null;
    // (a step first: the logbook lays itself out for the screen, one page or two, as it updates)
    step(1 / 30);
    const b = k.book, single = b.single;
    const box = single ? [40, 120, 820, 1200] : [80, 72, 1520, 928];
    const R = new Recorder(`sweep ${pose} ${single ? 'portrait' : 'landscape'}`);
    k.pointerOnPage = true; b.input.down = true;
    // start settled at the first place (getting there from the hold is not part of the sweep)
    b.input.x = box[0]; b.input.y = box[1];
    for (let s = 0; s < 30; s++) step(1 / 30);
    for (let j = 0; j < ny; j++) for (let i0 = 0; i0 < nx; i0++) {
      const i = j % 2 ? nx - 1 - i0 : i0;
      b.input.x = box[0] + (box[2] - box[0]) * i / (nx - 1);
      b.input.y = box[1] + (box[3] - box[1]) * j / (ny - 1);
      const seg = `${Math.round(b.input.x)},${Math.round(b.input.y)}`;
      // on the way there, every frame's joints (how fast they move); there, everything
      for (let s = 0; s < settle; s++) { const cut = step(1 / 30); R.add({ pen: {}, at: {}, a: { R: jointAngles(hands.R), L: jointAngles(hands.L) }, roll: { R: hands.R.roll, L: hands.L.roll } }, { cut, seg }); }
      const cut = step(1 / 30);
      R.add(measure({ contacts: true, ctx: { pressed: true, posed: true, steady: true } }), { cut, seg });
    }
    k.pointerOnPage = false; b.input.down = false;
    const out = R.result();
    // the worst places, for the report
    out.places = Object.entries(out.segs).map(([p, S]) => [p, Math.max(0, ...Object.values(S.pen)), S.conFail]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    out.placesFailing = Object.entries(out.segs).filter(([, S]) => S.conFail).map(([p]) => p);
    out.placed = nx * ny;
    delete out.segs;
    return out;
  }

  // ---- the props nudged a few centimetres: the inking played out with them where they now are ----
  function nudged({ book = [0, 0, 0], well = [0, 0], dt = 1 / 60 } = {}) {
    boot();
    const bg = k.book.group;
    bg.position.x += book[0]; bg.position.z += book[1]; bg.rotation.y += book[2];
    bg.updateMatrixWorld(true);
    k.wellHome.x += well[0]; k.wellHome.z += well[1]; k.wellNear.x += well[0]; k.wellNear.z += well[1];
    k.well.position.copy(k.wellHome);
    const R = new Recorder(`nudged book ${book.map((v) => v.toFixed(2))} well ${well.map((v) => v.toFixed(2))}`);
    lastBody = null;
    for (let i = 0; i < 20; i++) step(1 / 30);
    k.setState('lean-in');
    run(R, { dt, seg: segName, until: () => k.state === 'lean' && k.hands.blend >= 1 && k.st > 0.6 });
    const sc = k.book.scene;
    sc.autoPlan(); sc.inkThePlan();
    run(R, { dt, seg: segName, until: () => k.state !== 'lean' && !k.ink, max: 20000 });
    return R.result();
  }

  // ---- the forearm twisted through its range --------------------------------------------------------
  // The right arm held out in front, the hand straight on the forearm, turned about the forearm from
  // full supination to full pronation by the hand's own target; the IK shares the turn down the arm as
  // it does in play. At each angle, the narrowest width of the skin's cross-section at stations along
  // the forearm and wrist, against the same at rest, and any triangle turned inside out.
  function twist({ from = -120, to = 120, stepDeg = 4 } = {}) {
    boot();
    game.transition = null;
    k.review('show', 'dusk', {});
    for (let i = 0; i < 5; i++) step(1 / 30);
    const arm = hands.R, B = arm.B, sk = skins.R;
    const S = B.shoulder.getWorldPosition(new THREE.Vector3());
    const body = k.frames.body;
    const T = new THREE.Vector3(0.12, -0.32, -0.45).applyQuaternion(body.quat).add(body.pos);
    const pole = new THREE.Vector3(0.6, -1, 0.25).applyQuaternion(body.quat);
    // stations: distance from the wrist toward the elbow (m), and into the hand (negative)
    const stations = [];
    for (let s = 0.15; s > -0.0301; s -= 0.01) stations.push(+s.toFixed(3));
    const restW = sections(sk.rest, sk.n, null, stations, true);
    const restFlip = flips(sk.rest, sk.restN, sk);
    // the triangles of the forearm and wrist the stations cover (the twist's business; the fingers'
    // curl is not)
    const band = new Uint8Array(sk.idx.length / 3), W0 = -UPPER - FORE;
    for (let t = 0; t < band.length; t++) {
      let ok = 1;
      for (let j = 0; j < 3; j++) { const v = sk.idx[t * 3 + j], z = sk.rest[v * 3 + 2] - W0, lab = LABELS[parts.label[v]]; if (z > 0.155 || z < -0.031 || !(lab === 'forearm' || lab === 'palm')) ok = 0; }
      band[t] = ok;
    }
    const rows = [];
    let ref = null;
    for (const a of [0, ...Array.from({ length: Math.round((to - from) / stepDeg) + 1 }, (_, i) => from + i * stepDeg)]) {
      // the hand's back turned by `a` from the elbow's hinge (thumb up), about the line shoulder→target
      let wq = null;
      for (let it = 0; it < 4; it++) {
        B.shoulder.updateWorldMatrix(true, true);
        const E = B.elbow.getWorldPosition(new THREE.Vector3());
        const fd = T.clone().sub(E).normalize();
        const hinge = new THREE.Vector3(0, 1, 0).transformDirection(B.shoulder.matrixWorld);
        const back = hinge.clone().addScaledVector(fd, -hinge.dot(fd)).normalize().applyAxisAngle(fd.clone().negate(), a * Math.PI / 180);
        wq = basis(fd, back);
        for (let j = 0; j < 40; j++) hands.solve(arm, S, T, wq, pole, 1 / 30, 1);
      }
      hands.fingers(arm, { fingers: POSES.show.R.fingers, thumb: POSES.show.R.thumb });
      sk.update();
      B.wrist.updateWorldMatrix(true, false);
      const w = sections(sk.pos, sk.n, arm, stations, false);
      const ratio = w.map((x, i) => x / restW[i]);
      const fl = flips(sk.pos, sk.nor, sk);
      // the untwisted arm (the first pass) is what a twist is compared with
      if (!ref) { ref = fl; continue; }
      // and the largest of them (mm², at rest): a sliver turning over is not the skin folding
      let newFlips = 0, flipArea = 0;
      for (let t = 0; t < fl.length; t++) if (band[t] && fl[t] && !ref[t]) { newFlips++; flipArea = Math.max(flipArea, triArea(sk.rest, sk.idx, t) * 1e6); }
      const A = jointAngles(arm);
      rows.push({ a, turn: +A['forearm.turn'].toFixed(1), wristShare: +A['wrist.share'].toFixed(1), minRatio: +Math.min(...ratio).toFixed(3), at: stations[ratio.indexOf(Math.min(...ratio))], newFlips, flipArea: +flipArea.toFixed(3) });
    }
    let restFlips = 0, neutralFlips = 0;
    for (let t = 0; t < restFlip.length; t++) { if (restFlip[t]) restFlips++; if (ref[t] && band[t]) neutralFlips++; }
    return { stations, restWidthMm: restW.map((x) => +(x * MM).toFixed(1)), restFlips, neutralFlipsInBand: neutralFlips, range: ANATOMY.forearm.turn, rows };
  }
  // the narrowest width (m) of the skin's cross-section at each station: vertices within 0.8 mm of the
  // station's plane, across the forearm (posed: in the forearm's and wrist's own frames)
  function sections(pos, n, arm, stations, rest) {
    const out = [];
    const inv = new THREE.Matrix4(), invW = new THREE.Matrix4();
    if (!rest) { inv.copy(arm.B.twist.matrixWorld).invert(); invW.copy(arm.B.wrist.matrixWorld).invert(); }
    const W0 = -UPPER - FORE;
    const v = new THREE.Vector3();
    const pts = stations.map(() => []);
    for (let i = 0; i < n; i++) {
      v.fromArray(pos, i * 3);
      let ax, x, y;
      if (rest) { ax = v.z - W0; x = v.x; y = v.y; }
      else {
        // above the wrist, in the twist bone's frame (its origin half a forearm up); below, the wrist's
        const tw = v.clone().applyMatrix4(inv), ww = v.clone().applyMatrix4(invW);
        if (ww.z >= 0) { ax = tw.z + FORE / 2; x = tw.x; y = tw.y; } else { ax = ww.z; x = ww.x; y = ww.y; }
      }
      for (let s = 0; s < stations.length; s++) if (Math.abs(ax - stations[s]) < 0.0008) pts[s].push(x, y);
    }
    for (const P of pts) {
      let best = Infinity;
      for (let a = 0; a < 180; a += 3) {
        const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < P.length; i += 2) { const p = P[i] * c + P[i + 1] * s; if (p < lo) lo = p; if (p > hi) hi = p; }
        best = Math.min(best, hi - lo);
      }
      out.push(best);
    }
    return out;
  }
  // triangles whose face points against their corners' normals
  function flips(pos, nor, sk) {
    const I = sk.idx, out = new Uint8Array(I.length / 3);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const nx = nor[a] + nor[b] + nor[c], ny = nor[a + 1] + nor[b + 1] + nor[c + 1], nz = nor[a + 2] + nor[b + 2] + nor[c + 2];
      if (fx * nx + fy * ny + fz * nz < 0) out[t / 3] = 1;
    }
    return out;
  }

  // ---- speed ----------------------------------------------------------------------------------------
  function speed({ frames = 600 } = {}) {
    boot();
    const out = {};
    for (const pose of ['write', 'lamp', 'mug', 'lean']) {
      k.review(pose, 'dusk', {});
      for (let i = 0; i < 20; i++) step(1 / 30);
      const ts = [];
      for (let i = 0; i < frames; i++) {
        const t0 = performance.now();
        k.updateHands(1 / 30);
        ts.push(performance.now() - t0);
      }
      out[pose] = summary(ts);
    }
    // a frame's measurement itself (not part of the game)
    const ms = [];
    for (let i = 0; i < 20; i++) { const t0 = performance.now(); measure({ contacts: true, ctx: {} }); ms.push(performance.now() - t0); }
    out.measure = summary(ms);
    return out;
  }
  async function skinBuild() {
    const { SKIN_STATS } = await import('./hands.js');
    const { buildSkinData } = await import('./handmesh.js');
    const t0 = performance.now();
    const d = buildSkinData();
    return { worker: { ...SKIN_STATS }, mainThreadMs: Math.round(performance.now() - t0), verts: d.stats.verts, tris: d.stats.tris };
  }

  // ---- the overlay: colliders drawn, skin reddened where it is inside something --------------------
  const tints = { R: null, L: null };
  // xray: the colliders' own meshes hidden (their outlines stay), so skin inside them shows
  function setOverlay(on, { xray = false } = {}) {
    boot();
    overlay.on = on;
    for (const l of overlay.lines) l.parent?.remove(l);
    overlay.lines = [];
    for (const m of overlay.hidden || []) m.visible = true;
    overlay.hidden = [];
    if (on && xray) for (const c of colliders) {
      if (!c.follow || c.name === 'walls') continue;
      c.follow.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh && m.visible) { m.visible = false; overlay.hidden.push(m); } });
    }
    if (on) {
      const mat = glowMaterial({ emit: 0x40c0ff, amt: 0.9 });
      for (const c of colliders) {
        const g = outline(c);
        if (!g.attributes.position.count) continue;
        const l = new THREE.LineSegments(g, mat);
        l.frustumCulled = false;
        l.userData.collider = c;
        (c.follow || k.world.scene).add(l);
        overlay.lines.push(l);
      }
    }
    for (const s of ['R', 'L']) {
      const attr = hands[s].mesh.geometry.attributes.tint;
      if (on && !tints[s]) tints[s] = attr.array.slice();
      if (!on && tints[s]) { attr.array.set(tints[s]); attr.needsUpdate = true; tints[s] = null; }
    }
    if (on) paint();
  }
  function paint() {
    measure({});
    for (const s of ['R', 'L']) {
      const attr = hands[s].mesh.geometry.attributes.tint, T0 = tints[s], A = attr.array, D = depth[s];
      for (let v = 0; v < skins[s].n; v++) {
        const d = D[v], o = v * 4;
        if (d > 0.05) { const kk = Math.min(1, 0.35 + d / 4); A[o] = 1.0 + kk * 0.6; A[o + 1] = 0.25; A[o + 2] = 0.2; } else { A[o] = T0[o]; A[o + 1] = T0[o + 1]; A[o + 2] = T0[o + 2]; }
      }
      attr.needsUpdate = true;
    }
    for (const l of overlay.lines) l.visible = l.userData.collider.active();
  }
  const uh = k.updateHands.bind(k);
  k.updateHands = (dt) => { uh(dt); if (overlay.on) paint(); };
  game.input.on('key', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'o' || e.key === 'O') { setOverlay(!overlay.on); k.flash = { text: 'hands overlay ' + (overlay.on ? 'on' : 'off'), t: 0 }; return true; }
    return false;
  });

  // One picture for a contact sheet: a pose held (a prop part-way through its travel if `setup` says),
  // the overlay's x-ray on, from a camera given in the world (`cam`, to repeat an earlier picture
  // exactly) or set up as __review.studio does, round the wrist. Returns the picture, the camera and
  // the penetration in that frame.
  function shot({ pose, hand = 'R', az = 0, el = 0.6, dist = 0.32, fov = 32, at = [0, 0, -0.07], setup = null, cam = null, w = 480, h = 360 }) {
    hold(pose, { frames: 1 });
    if (setup === 'lever') k.room.lever.rotation.x = 0.5 - 1.15 * 0.5;
    if (setup === 'lever-down') k.room.lever.rotation.x = 0.5 - 1.15;
    if (setup === 'door') k.setDoor(0.45);
    for (let i = 0; i < 30; i++) step(1 / 30);
    setOverlay(true, { xray: true });
    if (!cam) {
      const wr = hands[hand].B.wrist;
      wr.updateWorldMatrix(true, false);
      const target = new THREE.Vector3(...at).applyMatrix4(wr.matrixWorld);
      const q = new THREE.Quaternion().setFromRotationMatrix(wr.matrixWorld);
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).applyQuaternion(q);
      cam = { pos: target.clone().addScaledVector(dir, dist).toArray(), target: target.toArray(), fov };
    }
    k.camOverride = { pos: new THREE.Vector3(...cam.pos), target: new THREE.Vector3(...cam.target), fov: cam.fov };
    game.snapLook = true;
    game.noRender = false; game.step(1, 1 / 30); game.noRender = true;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    // the middle of the frame, cut to the tile's shape
    const src = game.canvas, sw = Math.min(src.width, src.height * w / h), sh = sw * h / w;
    c.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
    const m = measure({});
    k.camOverride = null;
    setOverlay(false);
    if (setup === 'lever' || setup === 'lever-down') k.room.lever.rotation.x = 0.5;
    if (setup === 'door') k.setDoor(0);
    return { url: c.toDataURL('image/jpeg', 0.88), cam, pen: Object.fromEntries(Object.entries(m.pen).map(([o, d]) => [o, +d.toFixed(1)])) };
  }

  // The harness checking itself: the CPU skinning against three.js's own (the same sums the GPU does),
  // and the colliders' distances at points whose answer is known.
  function selfTest() {
    boot();
    measure({});
    const out = { skinMaxErrMm: 0, checks: [] };
    const v = new THREE.Vector3();
    for (const s of ['R', 'L']) {
      const m = hands[s].mesh, sk = skins[s];
      for (let i = 0; i < sk.n; i += 97) {
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld);
        const o = i * 3;
        out.skinMaxErrMm = Math.max(out.skinMaxErrMm, Math.hypot(v.x - sk.pos[o], v.y - sk.pos[o + 1], v.z - sk.pos[o + 2]) * MM);
      }
    }
    // the table's top: 1 cm above it, on it, 1 cm into it, at the book frame's origin (the table's top)
    const top = byName(['table'])[0], bf = k.frames.book.pos;
    for (const dy of [0.01, 0, -0.01]) out.checks.push(['table top ' + dy * 100 + ' cm', +(top.sd(bf.x, bf.y + dy, bf.z, true) * MM).toFixed(3), +(dy * MM).toFixed(3)]);
    // the lever's ball: its centre is as deep as the ball's (polygonal) inner radius
    const lever = byName(['lever'])[0];
    const ball = lever.parts.find((p) => Math.abs(p.r - 0.035) < 0.005);
    if (ball) { const c = new THREE.Vector3(...ball.c).applyMatrix4(lever.m); out.checks.push(['lever ball centre', +(lever.sd(c.x, c.y, c.z, true) * MM).toFixed(3), +(-ball.inner * MM).toFixed(3)]); }
    // the logbook's page: on the spread at its middle, and 5 mm above it
    const book = byName(['book'])[0], p0 = k.book.worldAt(1150, 500, new THREE.Vector3());
    out.checks.push(['page surface', +(book.sd(p0.x, p0.y, p0.z, true) * MM).toFixed(3), 0]);
    out.checks.push(['5 mm over the page', +(book.sd(p0.x, p0.y + 0.005, p0.z, true) * MM).toFixed(3), 5]);
    return out;
  }

  window.__handcheck = {
    selfTest,
    THRESH, ANATOMY, limits: LIM, boot,
    measure: (o) => measure(o),
    hold, sweep, nudged, twist, speed, skinBuild, shot,
    scenario: (name, o) => scenarios[name](o),
    overlay: setOverlay,
    overlayOn: () => overlay.on,
    colliders: () => { boot(); return colliders.map((c) => ({ name: c.name, parts: c.parts.length, fields: c.fields.length, probes: c.probes.length / 4, sheet: !!c.sheet, active: c.active() })); },
    parts: () => { boot(); return Object.fromEntries(Object.entries(parts.sets).map(([n, s]) => [n, s.length])); },
    poses: () => POSE_NAMES.slice(),
    solvePlan: () => solve(game.night),
  };
}

// what the plots show: per arm, the joints that move most (and the worst penetration, the widest gap)
const SERIES = [['R', 'elbow.flex'], ['R', 'forearm.turn'], ['R', 'wrist.ext'], ['R', 'wrist.dev'], ['R', 'wrist.share'], ['R', 'index.mcp'], ['R', 'thumb.ip'], ['L', 'elbow.flex'], ['L', 'forearm.turn'], ['L', 'wrist.ext'], ['L', 'wrist.dev'], ['L', 'wrist.share'], ['R', 'pen'], ['R', 'gap'], ['L', 'gap'], ['', 'prop']];

function aabbDist(c, lo, hi) {
  const dx = Math.max(lo[0] - c[0], 0, c[0] - hi[0]), dy = Math.max(lo[1] - c[1], 0, c[1] - hi[1]), dz = Math.max(lo[2] - c[2], 0, c[2] - hi[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function triArea(P, I, t) {
  const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}
function maxMove(a, b, set) {
  let m = 0;
  for (let t = 0; t < set.length; t++) {
    const o = set[t] * 3, dx = a[o] - b[o], dy = a[o + 1] - b[o + 1], dz = a[o + 2] - b[o + 2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d > m) m = d;
  }
  return Math.sqrt(m);
}
function summary(ts) {
  if (!ts.length) return null;
  const s = ts.slice().sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean: +mean.toFixed(4), p95: +s[Math.floor(s.length * 0.95)].toFixed(4), max: +s[s.length - 1].toFixed(4) };
}
function along(path, u) {
  const segs = path.length - 1, f = Math.min(segs - 1e-9, u * segs), i = Math.floor(f), t = f - i;
  return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
}
// quaternion whose -Z points along fwd and whose +Y is `up` (made perpendicular)
function basis(fwd, up) {
  const z = fwd.clone().negate().normalize();
  const x = up.clone().cross(z).normalize();
  const y = z.clone().cross(x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
