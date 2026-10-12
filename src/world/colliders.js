// What the keeper's hands can touch, as solid shapes: for the hands' contact solver and its tests.
//
// Each collider is one thing in the room (the table, the logbook, the inkwell, the lamp lever, the
// door's ring, the stair rail...) and follows the object it belongs to as it moves. The shapes are made
// from the very pieces the room was drawn with (build.js keeps a record of each), so a six-sided post is
// six-sided here too and every plank keeps its hand-made tilt: unions of convex solids, each a list of
// face planes. The logbook's pages are their own height field and the walls are the round room itself.
// Thin things (a pencil, a rail, the turning leaf, a feather's vane) also carry probes: points along
// their middle that the tests check from the inside of the skin, since a thin thing can pass right
// through a finger with few of the finger's own points inside it.
// Distances are in metres, negative inside.
import * as THREE from 'three';
import { spreadHeight, BOOK } from './book.js';
import { ROOM } from './room.js';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------
// A convex solid: face planes (outward n, n·p − d is the distance past the face) and its triangles,
// for the exact distance from outside. Its points are in the followed object's space.
class Convex {
  constructor(pts, tris) {
    const n = pts.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += pts[i * 3]; cy += pts[i * 3 + 1]; cz += pts[i * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
    let r = 0;
    for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(pts[i * 3] - cx, pts[i * 3 + 1] - cy, pts[i * 3 + 2] - cz));
    this.c = [cx, cy, cz]; this.r = r;
    const planes = [], seen = new Set(), T = [];
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
      const ux = pts[b] - pts[a], uy = pts[b + 1] - pts[a + 1], uz = pts[b + 2] - pts[a + 2];
      const vx = pts[c] - pts[a], vy = pts[c + 1] - pts[a + 1], vz = pts[c + 2] - pts[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      nx /= l; ny /= l; nz /= l;
      let d = nx * pts[a] + ny * pts[a + 1] + nz * pts[a + 2];
      // facing out, away from the middle
      if (nx * cx + ny * cy + nz * cz - d > 0) { nx = -nx; ny = -ny; nz = -nz; d = -d; }
      T.push(pts[a], pts[a + 1], pts[a + 2], pts[b], pts[b + 1], pts[b + 2], pts[c], pts[c + 1], pts[c + 2]);
      const key = `${Math.round(nx * 2e4)},${Math.round(ny * 2e4)},${Math.round(nz * 2e4)},${Math.round(d * 2e5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      planes.push(nx, ny, nz, d);
    }
    this.planes = Float64Array.from(planes);
    this.tris = Float64Array.from(T);
    // how deep the middle is: the radius of the biggest ball about it that fits inside
    let inner = Infinity;
    for (let j = 0; j < this.planes.length; j += 4) inner = Math.min(inner, this.planes[j + 3] - (this.planes[j] * cx + this.planes[j + 1] * cy + this.planes[j + 2] * cz));
    this.inner = inner;
  }
  // the largest distance past any face: exact inside (the depth, negative), a lower bound outside
  sd(x, y, z) {
    const P = this.planes;
    let s = -Infinity;
    for (let j = 0; j < P.length; j += 4) { const v = P[j] * x + P[j + 1] * y + P[j + 2] * z - P[j + 3]; if (v > s) s = v; }
    return s;
  }
  // exact both sides
  sdExact(x, y, z) {
    const s = this.sd(x, y, z);
    if (s <= 0) return s;
    const T = this.tris;
    let best = Infinity;
    for (let t = 0; t < T.length; t += 9) { const d2 = triDist2(x, y, z, T, t); if (d2 < best) best = d2; }
    return Math.sqrt(best);
  }
}

// squared distance from p to triangle t of T (Ericson, Real-Time Collision Detection 5.1.5)
function triDist2(px, py, pz, T, t) {
  const ax = T[t], ay = T[t + 1], az = T[t + 2], bx = T[t + 3], by = T[t + 4], bz = T[t + 5], cx = T[t + 6], cy = T[t + 7], cz = T[t + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; } else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w; } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

// the solid between two rings of points (a slice of a cylinder, a tube, a ring, a turned profile)
function ringSolid(A, B) {
  const n = A.length, pts = [], tris = [];
  for (const p of A) pts.push(p.x, p.y, p.z);
  for (const p of B) pts.push(p.x, p.y, p.z);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    tris.push(k, k1, n + k, k1, n + k1, n + k);
    if (k > 0 && k1 > 0) tris.push(0, k, k1, n, n + k1, n + k);
  }
  return new Convex(pts, tris);
}

// ---------------------------------------------------------------------------------------------------
// A drawn geometry (already in the followed object's space) as convex solids, with probes for the thin
// parts: { parts: [Convex], probes: [x, y, z, r, ...] }
const ringOf = (pos, idxs) => idxs.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i));
function solidsOf(geo) {
  const pos = geo.attributes.position, P = geo.parameters || {};
  const out = { parts: [], probes: [] };
  const ringPairs = (rings, closedEnds = true) => {
    for (let i = 0; i < rings.length - 1; i++) {
      const s = ringSolid(rings[i], rings[i + 1]);
      out.parts.push(s);
      // thin: probes along the middle, a couple of millimetres apart, with the solid's depth there
      const ca = mid(rings[i]), cb = mid(rings[i + 1]);
      const ra = meanR(rings[i], ca), rb = meanR(rings[i + 1], cb);
      if (Math.max(ra, rb) < 0.03) {
        const steps = Math.max(1, Math.ceil(ca.distanceTo(cb) / 0.002));
        for (let j = 0; j < steps; j++) {
          const t = j / steps;
          out.probes.push(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t, ca.z + (cb.z - ca.z) * t, (ra + (rb - ra) * t) * Math.cos(Math.PI / rings[i].length));
        }
      }
    }
    if (closedEnds && rings.length) { const c = mid(rings[rings.length - 1]); out.probes.push(c.x, c.y, c.z, 0); }
  };
  switch (geo.type) {
    case 'BoxGeometry': {
      out.parts.push(new Convex(Float64Array.from(pos.array), Array.from(geo.index.array)));
      // thin boards and trays: a sheet of probes through the middle
      const v = (i) => new THREE.Vector3().fromBufferAttribute(pos, i);
      const pts = []; for (let i = 0; i < pos.count; i++) pts.push(v(i));
      boxProbes(pts, out.probes);
      break;
    }
    case 'SphereGeometry': {
      const s = new Convex(Float64Array.from(pos.array), Array.from(geo.index.array));
      out.parts.push(s);
      if (s.r < 0.04) out.probes.push(s.c[0], s.c[1], s.c[2], s.inner);
      break;
    }
    case 'CylinderGeometry': case 'ConeGeometry': {
      if ((P.thetaLength ?? Math.PI * 2) < Math.PI * 2 - 1e-6) break;     // the curved walls are the room's own
      const n = P.radialSegments, hs = P.heightSegments || 1;
      const ring = (row) => ringOf(pos, Array.from({ length: n }, (_, x) => row * (n + 1) + x));
      ringPairs([ring(0), ring(hs)]);
      break;
    }
    case 'TorusGeometry': {
      const rs = P.radialSegments, ts = P.tubularSegments;
      const rings = [];
      for (let i = 0; i <= ts; i++) rings.push(ringOf(pos, Array.from({ length: rs }, (_, j) => j * (ts + 1) + i)));
      ringPairs(rings, false);
      break;
    }
    case 'TubeGeometry': {
      const rs = P.radialSegments, ts = P.tubularSegments;
      const rings = [];
      for (let i = 0; i <= ts; i++) rings.push(ringOf(pos, Array.from({ length: rs }, (_, j) => i * (rs + 1) + j)));
      ringPairs(rings, false);
      break;
    }
    case 'LatheGeometry': {
      const np = P.points.length, seg = P.segments;
      // a turned solid: one slice per rising step of the profile (a lip turned back down inside is left open)
      for (let j = 0; j < np - 1; j++) {
        if (P.points[j + 1].y <= P.points[j].y + 1e-6) continue;
        const A = ringOf(pos, Array.from({ length: seg }, (_, i) => i * np + j)), B = ringOf(pos, Array.from({ length: seg }, (_, i) => i * np + j + 1));
        out.parts.push(ringSolid(A, B));
      }
      break;
    }
    default: break;
  }
  return out;
}
const mid = (ring) => ring.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
const meanR = (ring, c) => ring.reduce((s, p) => s + p.distanceTo(c), 0) / ring.length;

// probes through the middle of a box thinner than 2 cm, about every 4 mm (10 mm on big boards)
function boxProbes(pts, out) {
  // the box's corner and edges from its 24 vertices: its three axes are the spread of its points
  const lo = pts.reduce((a, p) => a.min(p), pts[0].clone()), hi = pts.reduce((a, p) => a.max(p), pts[0].clone());
  const c = lo.clone().add(hi).multiplyScalar(0.5);
  // principal edges: from one corner to its three nearest distinct corners
  const corners = [];
  for (const p of pts) if (!corners.some((q) => q.distanceTo(p) < 1e-7)) corners.push(p);
  if (corners.length !== 8) return;
  const o = corners[0];
  const others = corners.slice(1).map((p) => p.clone().sub(o)).sort((a, b) => a.length() - b.length());
  const e = [others[0], others[1]];
  for (const q of others.slice(2)) if (Math.abs(q.clone().normalize().dot(e[0].clone().normalize())) < 0.2 && Math.abs(q.clone().normalize().dot(e[1].clone().normalize())) < 0.2) { e.push(q); break; }
  if (e.length < 3) return;
  e.sort((a, b) => a.length() - b.length());
  const [thin, u, v] = e;
  if (thin.length() >= 0.02) return;
  const step = u.length() * v.length() > 0.05 ? 0.01 : 0.004;
  const nu = Math.max(1, Math.round(u.length() / step)), nv = Math.max(1, Math.round(v.length() / step));
  const base = c.clone().addScaledVector(u, -0.5).addScaledVector(v, -0.5);
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const p = base.clone().addScaledVector(u, i / nu).addScaledVector(v, j / nv);
    out.push(p.x, p.y, p.z, thin.length() / 2);
  }
}

// the geometry a recorded piece was made from, placed as it was
function pieceGeometry(pc) {
  const P = pc.params;
  let g = null;
  switch (pc.type) {
    case 'BoxGeometry': g = new THREE.BoxGeometry(P.width, P.height, P.depth); break;
    case 'CylinderGeometry': g = new THREE.CylinderGeometry(P.radiusTop, P.radiusBottom, P.height, P.radialSegments, P.heightSegments, P.openEnded, P.thetaStart, P.thetaLength); break;
    case 'SphereGeometry': g = new THREE.SphereGeometry(P.radius, P.widthSegments, P.heightSegments, P.phiStart, P.phiLength, P.thetaStart, P.thetaLength); break;
    case 'TorusGeometry': g = new THREE.TorusGeometry(P.radius, P.tube, P.radialSegments, P.tubularSegments, P.arc); break;
    case 'TubeGeometry': g = new THREE.TubeGeometry(P.path, P.tubularSegments, P.radius, P.radialSegments, P.closed); break;
    case 'LatheGeometry': g = new THREE.LatheGeometry(P.points, P.segments, P.phiStart, P.phiLength); break;
    default: return null;
  }
  g.applyMatrix4(pc.matrix);
  return g;
}

// ---------------------------------------------------------------------------------------------------
// One thing the hands can touch.
export class Collider {
  constructor(name, follow) {
    this.name = name;
    this.follow = follow;         // Object3D whose space the shapes are in (null: the world)
    this.parts = [];              // Convex
    this.fields = [];             // { f(x, y, z) → sd, c: [x, y, z], r, on: () => bool }
    this.probes = [];             // x, y, z, r in the followed object's space
    this.sheet = null;            // () → probes made fresh each frame (the bending leaf)
    this.m = new THREE.Matrix4();
    this.inv = new THREE.Matrix4();
    this.wc = new THREE.Vector3();
    this.wr = 0;
  }
  add(solids) { this.parts.push(...solids.parts); for (const v of solids.probes) this.probes.push(v); }
  active() {
    for (let o = this.follow; o; o = o.parent) if (!o.visible) return false;
    return this.parts.length + this.fields.length + this.probes.length > 0 || !!this.sheet;
  }
  update() {
    if (this.follow) { this.follow.updateWorldMatrix(true, false); this.m.copy(this.follow.matrixWorld); }
    this.inv.copy(this.m).invert();
    // a bound round everything, in the world
    const pts = [];
    for (const p of this.parts) pts.push([p.c, p.r]);
    for (const f of this.fields) if (!f.on || f.on()) pts.push([f.c, f.r]);
    if (!pts.length && this.probes.length) {
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < this.probes.length; i += 4) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], this.probes[i + a]); hi[a] = Math.max(hi[a], this.probes[i + a]); }
      pts.push([[(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 0.01]);
    }
    if (!pts.length) { this.wr = 0; return; }
    const c = new THREE.Vector3();
    for (const [pc] of pts) c.add(_v.set(pc[0], pc[1], pc[2]));
    c.multiplyScalar(1 / pts.length);
    let r = 0;
    for (const [pc, pr] of pts) r = Math.max(r, c.distanceTo(_v.set(pc[0], pc[1], pc[2])) + pr);
    this.wc.copy(c).applyMatrix4(this.m);
    this.wr = r;
  }
  // signed distance at a world point; `exact` also makes the outside distance exact
  sd(x, y, z, exact = false) {
    const e = this.inv.elements;
    const lx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13], lz = e[2] * x + e[6] * y + e[10] * z + e[14];
    return this.sdLocal(lx, ly, lz, exact);
  }
  sdLocal(x, y, z, exact = false, cull = Infinity) {
    let s = Infinity;
    for (const p of this.parts) {
      const dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
      const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r;
      if (far > Math.min(s, cull)) continue;
      const v = exact ? p.sdExact(x, y, z) : p.sd(x, y, z);
      // inside two pieces at once: as deep as the deeper
      if (v < s) s = v;
    }
    for (const f of this.fields) {
      if (f.on && !f.on()) continue;
      const v = f.f(x, y, z, cull <= 0);
      if (v < s) s = v;
    }
    return s;
  }
}
const _v = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------------
// Every collider in the watch room, the logbook and the desk. Names are what the tests report.
export function buildColliders(keeper) {
  const out = new Map();
  const get = (name, follow) => {
    const key = name + '|' + (follow ? follow.uuid : '');
    if (!out.has(key)) out.set(key, new Collider(name, follow));
    return out.get(key);
  };
  const NAME = { sillclock: 'sill', silllamp: 'sill', wall: 'walls', room: 'room', lamp: 'oil lamp' };
  // the room's recorded pieces, wherever they hang
  keeper.room.group.updateMatrixWorld(true);
  keeper.room.group.traverse((o) => {
    const pcs = o.userData.pieces;
    if (!pcs || o.name === 'tower-top') return;
    for (const pc of pcs) {
      const g = pieceGeometry(pc);
      if (!g) continue;
      const name = NAME[pc.tag || o.name] || pc.tag || o.name;
      get(name, o).add(solidsOf(g));
      g.dispose();
    }
  });
  // drawn meshes under an object (their own transforms relative to it)
  const meshes = (name, root, skip = () => false) => {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const c = get(name, root);
    root.traverse((m) => {
      if (!m.isMesh || skip(m)) return;
      const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (g.type === 'BufferGeometry') { const p = g.attributes.position; for (let i = 0; i < p.count; i++) c.probes.push(p.getX(i), p.getY(i), p.getZ(i), 0); }
      else c.add(solidsOf(g));
      g.dispose();
    });
    return c;
  };
  // the logbook: the board, the pages (a height field), the cover when it's lifted, the turning leaf
  const book = keeper.book, B = BOOK;
  const bk = get('book', book.group);
  bk.add(solidsOf(book.board.geometry.clone().translate(0, book.board.position.y, 0)));
  const x0 = (B.COVER.x - 800) * B.S, x1 = (B.COVER.x + B.COVER.w - 800) * B.S;
  const z0 = (B.COVER.y - 500) * B.S, z1 = (B.COVER.y + B.COVER.h - 500) * B.S;
  const H = (x, z) => spreadHeight(x / B.S + 800, z / B.S + 500);
  bk.fields.push({ f: (x, y, z, io) => block(x, y, z, x0, x1, z0, z1, H, io), c: [0, 0.015, (z0 + z1) / 2], r: Math.hypot(x1 - x0, z1 - z0) / 2 + 0.02, on: () => !book.single });
  const ss = book.singleScale, sx0 = -430 * ss, sx1 = 430 * ss, sz0 = (16 - 626) * ss, sz1 = (1236 - 626) * ss;
  const Hs = (x) => 0.034 + 0.003 * (1 - Math.pow(Math.min(1, Math.abs(x) / sx1), 2));
  bk.fields.push({ f: (x, y, z, io) => block(x, y, z, sx0, sx1, sz0, sz1, Hs, io), c: [0, 0.02, 0], r: Math.hypot(sx1 - sx0, sz1 - sz0) / 2 + 0.02, on: () => book.single });
  meshes('cover', book.coverLid);
  const leaf = get('leaf', book.leaf);
  leaf.sheet = () => {
    // the leaf bends as it turns: probes over its surface as it is now
    const p = book.leaf.geometry.attributes.position, n = p.count / 2, pr = [];
    for (let i = 0; i < n; i++) for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      pr.push(p.getX(i) + (p.getX(i + n) - p.getX(i)) * t, p.getY(i) + (p.getY(i + n) - p.getY(i)) * t, p.getZ(i) + (p.getZ(i + n) - p.getZ(i)) * t, 0);
    }
    return pr;
  };
  // the desk: the inkwell (the ink's surface is not a solid, and the quill standing in it is its own),
  // the pencil and the quill (its vanes as probes)
  const tools = [keeper.hands.pencil, keeper.hands.pen];
  const under = (m, o) => { for (let p = m; p; p = p.parent) if (p === o) return true; return false; };
  meshes('inkwell', keeper.well, (m) => m.geometry.type === 'CircleGeometry' || tools.some((t) => under(m, t)));
  meshes('pencil', keeper.hands.pencil);
  meshes('quill', keeper.hands.pen);
  // the round room: the wall (but not the window and the door), the floor and the ceiling
  const W = ROOM.window, D = ROOM.door, R = ROOM.R;
  const wa = Math.asin(W.half / R) / DEG, da = Math.asin(D.half / R) / DEG;
  const walls = get('walls', keeper.room.group);
  walls.fields.push({
    f: (x, y, z, inside) => {
      const r = Math.hypot(x, z);
      if (inside && r < R && y > 0 && y < ROOM.H) return 1;
      const a = ((Math.atan2(x, -z) / DEG) + 360) % 360;
      const off = (deg) => Math.abs(((a - deg + 540) % 360) - 180);
      // into the wall's thickness (the window and the door are holes through it)
      const t = r - R;
      let d = t < 0 ? -t : t > ROOM.wall ? t - ROOM.wall : -Math.min(t, ROOM.wall - t);
      if ((off(W.deg) < wa && y > W.sill && y < W.top) || (off(D.deg) < da && y < D.top)) d = Math.max(d, 0.001);
      if (r > R) return d;
      return Math.min(d, y, ROOM.H - y);
    },
    c: [0, ROOM.H / 2, 0], r: R + 0.1,
  });
  return [...out.values()].filter((c) => c.parts.length || c.fields.length || c.probes.length || c.sheet);
}

// a solid block under a height field: x0..x1, z0..z1, from the table up to h(x, z). `inside`: only
// the depth matters (anything outside may come back as just "outside")
function block(x, y, z, x0, x1, z0, z1, h, inside = false) {
  const dx = Math.max(x0 - x, x - x1), dz = Math.max(z0 - z, z - z1);
  if (inside && (dx > 0 || dz > 0 || y > 0.045 || y < 0)) return 1;
  const xc = Math.min(x1, Math.max(x0, x)), zc = Math.min(z1, Math.max(z0, z));
  const top = h(xc, zc), e = 0.001;
  const gx = (h(xc + e, zc) - h(xc - e, zc)) / (2 * e), gz = (h(xc, zc + e) - h(xc, zc - e)) / (2 * e);
  const dy = (y - top) / Math.sqrt(1 + gx * gx + gz * gz), db = -y;
  if (dx <= 0 && dz <= 0 && dy <= 0 && db <= 0) return Math.max(dx, dz, dy, db);
  const ox = Math.max(dx, 0), oz = Math.max(dz, 0), oy = Math.max(dy, db, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz);
}

// line segments along every edge of a collider's solids, in its followed object's space (debug overlay)
export function outline(c) {
  const v = [];
  for (const p of c.parts) {
    const T = p.tris;
    for (let t = 0; t < T.length; t += 9) for (let k = 0; k < 3; k++) {
      const a = t + k * 3, b = t + ((k + 1) % 3) * 3;
      v.push(T[a], T[a + 1], T[a + 2], T[b], T[b + 1], T[b + 2]);
    }
  }
  for (let i = 0; i < c.probes.length; i += 4) v.push(c.probes[i], c.probes[i + 1], c.probes[i + 2], c.probes[i], c.probes[i + 1] + 0.0006, c.probes[i + 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}
