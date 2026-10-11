// The keeper's skin as one surface. The forearm, the palm, the knuckles, the webs between the fingers,
// the fingers and the thumb are written as a signed distance field: bony shapes smooth-unioned into
// each other, so the skin runs on from one to the next with no seams. The field is then meshed once
// (surface nets, each vertex pulled onto the surface) and every vertex is weighted to the bones.
//
// Everything here is in millimetres, in the wrist's frame at rest (the right hand): -Z toward the
// finger tips, +Y the back of the hand, -X the thumb side. The keeper is old, so the hand is bony:
// big knuckles, joints wider than the shafts between them, the tendons and the veins standing up on
// the back of the hand, hollows between the long bones.
// It has no other imports than three's maths (by path, so it can run in a worker too).
import * as THREE from '../vendor/three/three.module.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// polynomial smooth min / max: blend radius k (mm)
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

// a round cone from a (radius r1) to b (radius r2), points relative to a  (after Inigo Quilez)
function roundCone(px, py, pz, bx, by, bz, r1, r2) {
  const l2 = bx * bx + by * by + bz * bz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const y = px * bx + py * by + pz * bz, z = y - l2;
  const xx = px * l2 - bx * y, xy = py * l2 - by * y, xz = pz * l2 - bz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
// an ellipsoid at the origin (a close bound, after Inigo Quilez)
function ellipsoid(px, py, pz, rx, ry, rz) {
  const ax = px / rx, ay = py / ry, az = pz / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
function ellipse2(px, py, rx, ry) {
  const ax = px / rx, ay = py / ry, bx = ax / rx, by = ay / ry;
  const k0 = Math.sqrt(ax * ax + ay * ay), k1 = Math.sqrt(bx * bx + by * by);
  return k1 < 1e-9 ? -Math.min(rx, ry) : k0 * (k0 - 1) / k1;
}

// small value noise, for irregular wrinkles and age spots baked into the vertices
function hash3(x, y, z) { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let s = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    s += hash3(ix + dx, iy + dy, iz + dz) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return s;
}

// A local frame: origin o and axes (columns) x, y, z, all in wrist space.
class Frame {
  constructor(o, x, y, z) { this.o = o; this.x = x; this.y = y; this.z = z; }
  static fromMatrix(m) {
    const e = m.elements;
    return new Frame(new THREE.Vector3(e[12], e[13], e[14]), new THREE.Vector3(e[0], e[1], e[2]).normalize(),
      new THREE.Vector3(e[4], e[5], e[6]).normalize(), new THREE.Vector3(e[8], e[9], e[10]).normalize());
  }
  // point in wrist space from local coordinates
  at(x, y, z) { return this.o.clone().addScaledVector(this.x, x).addScaledVector(this.y, y).addScaledVector(this.z, z); }
}

// ---------------------------------------------------------------------------------------------------
// Primitives. Each is { f(x,y,z) → distance, c, R (bounding sphere), k (blend into what came before),
// op: 'add' | 'sub', part (who its skin belongs to, for the weights), detail (no say in the weights) }.
// a round cone in a frame along local -Z from z0 to z1, its cross-section squashed to `sy` in local Y
function coneIn(F, z0, z1, r1, r2, sy = 1, oy = 0) {
  const ox = F.o.x, oY = F.o.y, oz = F.o.z, X = F.x, Y = F.y, Z = F.z;
  const Xx = X.x, Xy = X.y, Xz = X.z, Yx = Y.x, Yy = Y.y, Yz = Y.z, Zx = Z.x, Zy = Z.y, Zz = Z.z;
  const len = -(z1 - z0), isy = 1 / sy, sc = Math.min(1, sy * 1.05);
  const f = (x, y, z) => {
    const dx = x - ox, dy = y - oY, dz = z - oz;
    return roundCone(dx * Xx + dy * Xy + dz * Xz, (dx * Yx + dy * Yy + dz * Yz - oy) * isy, dx * Zx + dy * Zy + dz * Zz + z0, 0, 0, len, r1, r2) * sc;
  };
  const c = F.at(0, oy, -(z0 + z1) / 2);
  return { f, c, R: (z1 - z0) / 2 + Math.max(r1, r2), lbk: Math.min(0.8, sy * 0.95) };
}
function ellIn(F, cx, cy, cz, rx, ry, rz) {
  const C = F.at(cx, cy, cz), X = F.x, Y = F.y, Z = F.z;
  const ox = C.x, oy = C.y, oz = C.z;
  const Xx = X.x, Xy = X.y, Xz = X.z, Yx = Y.x, Yy = Y.y, Yz = Y.z, Zx = Z.x, Zy = Z.y, Zz = Z.z;
  const f = (x, y, z) => {
    const dx = x - ox, dy = y - oy, dz = z - oz;
    return ellipsoid(dx * Xx + dy * Xy + dz * Xz, dx * Yx + dy * Yy + dz * Yz, dx * Zx + dy * Zy + dz * Zz, rx, ry, rz);
  };
  // the ellipsoid bound underestimates along its long axis: cull it only that cautiously
  return { f, c: C, R: Math.max(rx, ry, rz), lbk: 0.9 * Math.min(rx, ry, rz) / Math.max(rx, ry, rz) };
}
function capsule(a, b, r1, r2 = r1) {
  const ax = a.x, ay = a.y, az = a.z, bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z;
  const f = (x, y, z) => roundCone(x - ax, y - ay, z - az, bx, by, bz, r1, r2);
  return { f, c: a.clone().add(b).multiplyScalar(0.5), R: a.distanceTo(b) / 2 + Math.max(r1, r2) };
}
const ID = new Frame(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
// a frame at o whose -Z runs toward `to`, its Y as near `up` as it can be
function frameTo(o, to, up = new THREE.Vector3(0, 1, 0)) {
  const z = o.clone().sub(to).normalize();
  const x = up.clone().cross(z).normalize();
  const y = z.clone().cross(x).normalize();
  return new Frame(o.clone(), x, y, z);
}

class Field {
  constructor() { this.prims = []; }
  add(p, k, part, o = {}) { this.prims.push({ f: p.f, c: p.c, cx: p.c.x, cy: p.c.y, cz: p.c.z, R: p.R, lbk: p.lbk ?? 0.8, k, part, sub: o.op === 'sub', detail: !!o.detail }); return p; }
  // the distance at a point: prims [0, n), or only those in `list` (indices, ascending)
  eval(x, y, z, n = this.prims.length, list = null) {
    let d = 1e9;
    const P = this.prims, m = list ? list.length : n;
    for (let j = 0; j < m; j++) {
      const p = P[list ? list[j] : j];
      const cx = x - p.cx, cy = y - p.cy, cz = z - p.cz;
      const lb = (Math.sqrt(cx * cx + cy * cy + cz * cz) - p.R) * p.lbk;
      if (!p.sub) {
        if (lb > d + p.k) continue;
        d = smin(d, p.f(x, y, z), p.k);
      } else {
        if (lb > p.k - d) continue;
        d = smax(d, -p.f(x, y, z), p.k);
      }
    }
    return d;
  }
  // the prims that can matter anywhere within r of c, given the surface is within `near` of it
  near(c, r, near) {
    const out = [];
    const P = this.prims;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], dx = c.x - p.cx, dy = c.y - p.cy, dz = c.z - p.cz;
      if ((Math.sqrt(dx * dx + dy * dy + dz * dz) - p.R - r) * p.lbk <= near + p.k + 1) out.push(i);
    }
    return Int32Array.from(out);
  }
  grad(x, y, z, out, n, e = 0.25, list = null) {
    // four samples on a tetrahedron's corners
    const a = this.eval(x + e, y - e, z - e, n, list), b = this.eval(x - e, y - e, z + e, n, list);
    const c = this.eval(x - e, y + e, z - e, n, list), d = this.eval(x + e, y + e, z + e, n, list);
    out.set(a - b - c + d, -a - b + c + d, -a + b - c + d);
    const l = out.length();
    return l > 1e-9 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0);
  }
  // where a ray down from above meets the surface (the back of the hand, the top of the forearm)
  surfaceY(x, z, n, top = 45) {
    let y = top, d = this.eval(x, y, z, n);
    for (let i = 0; i < 200 && d > 0.05; i++) { y -= Math.max(0.25, d * 0.8); d = this.eval(x, y, z, n); if (y < -40) return null; }
    // settle onto the crossing
    for (let i = 0; i < 8; i++) { d = this.eval(x, y, z, n); if (Math.abs(d) < 0.01) break; y -= d; }
    return y;
  }
}

// a cord lying along the surface (a tendon, a vein): control points (x, z) on the back of the arm, laid
// on the surface as it is so far, sunk so it stands up `rise` mm
function cord(field, pts, { r = 1.6, rise = 1.0, wiggle = 0, seed = 0, step = 2.2, r2 = null } = {}) {
  // Catmull-Rom through the control points
  const P = pts.map(([x, z]) => new THREE.Vector2(x, z));
  const samples = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const len = p1.distanceTo(p2), n = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      samples.push(new THREE.Vector2(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y)));
    }
  }
  samples.push(P[P.length - 1].clone());
  // old veins wander: a slow sideways meander
  let acc = 0;
  const out = [];
  const n = field.prims.length, g = new THREE.Vector3();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (i) acc += s.distanceTo(samples[i - 1]);
    let x = s.x, z = s.y;
    if (wiggle) {
      const a = samples[Math.min(samples.length - 1, i + 1)].clone().sub(samples[Math.max(0, i - 1)]).normalize();
      const off = (Math.sin(acc * 0.21 + seed) * 0.6 + Math.sin(acc * 0.47 + seed * 2.3) * 0.4) * wiggle;
      x += -a.y * off; z += a.x * off;
    }
    const y = field.surfaceY(x, z, n);
    if (y == null) continue;
    field.grad(x, y, z, g, n);
    const rr = r2 == null ? r : lerp(r, r2, i / (samples.length - 1));
    out.push({ p: new THREE.Vector3(x, y, z).addScaledVector(g, -(rr - rise)), r: rr });
  }
  const segs = [];
  for (let i = 0; i < out.length - 1; i++) segs.push(capsule(out[i].p, out[i + 1].p, out[i].r, out[i + 1].r));
  return { segs, pts: out };
}

// ---------------------------------------------------------------------------------------------------
// The skeleton the skin is built on (hands.js builds the same bones).
export const UPPER = 0.30, FORE = 0.26;

// Finger knuckles (wrist space), phalanx lengths; `out` is which way a positive spread turns the finger.
// `fan` is the spread the skin was built at; `nat` the spread a hand at ease falls into.
export const FINGERS = {
  index: { base: [-0.026, 0.004, -0.084], len: [0.041, 0.025, 0.020], out: 1, fan: 0.17, nat: 0.04 },
  middle: { base: [-0.007, 0.006, -0.088], len: [0.045, 0.028, 0.021], out: 0.25, fan: 0.04, nat: 0.0 },
  ring: { base: [0.012, 0.004, -0.084], len: [0.042, 0.026, 0.020], out: -1, fan: -0.10, nat: -0.035 },
  little: { base: [0.028, -0.001, -0.074], len: [0.033, 0.021, 0.018], out: -1, fan: -0.24, nat: -0.09 },
};
export const FNAMES = ['index', 'middle', 'ring', 'little'];
// The thumb leaves the palm low on the radial side, angled forward, out and down; its nail turned out.
export const THUMB = { base: [-0.020, -0.011, -0.020], rest: [-0.32, 0.78, 0.85], len: [0.044, 0.032, 0.027] };

// the arm's bones, in the order the skeleton is built (skin indices refer to these)
export const BONES = ['shoulder', 'elbow', 'twist', 'wrist', ...FNAMES.flatMap((f) => [f + '1', f + '2', f + '3']), 'thumb1', 'thumb2', 'thumb3'];
const W0 = -UPPER - FORE;
function restFrames() {
  // the right hand's joints at rest, in the wrist's frame (millimetres)
  const M = {};
  const mm = (v) => v.map((x) => x * 1000);
  const at = (parent, pos, euler) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler, 'YXZ')), new THREE.Vector3(1, 1, 1));
    return parent ? parent.clone().multiply(m) : m;
  };
  for (const f of FNAMES) {
    const F = FINGERS[f];
    M[f + '1'] = at(null, mm(F.base), [0, F.fan, 0]);
    M[f + '2'] = at(M[f + '1'], [0, 0, -F.len[0] * 1000], [0, 0, 0]);
    M[f + '3'] = at(M[f + '2'], [0, 0, -F.len[1] * 1000], [0, 0, 0]);
  }
  M.thumb1 = at(null, mm(THUMB.base), THUMB.rest);
  M.thumb2 = at(M.thumb1, [0, 0, -THUMB.len[0] * 1000], [0, 0, 0]);
  M.thumb3 = at(M.thumb2, [0, 0, -THUMB.len[1] * 1000], [0, 0, 0]);
  return M;
}
// Everything the skinned geometry needs, for the right hand (arm space, metres), as transferable arrays.
export function buildSkinData(h = 1.25) {
  const boneIndex = (name) => BONES.indexOf(name);
  const t0 = performance.now();
  const M = restFrames();
  const frames = {};
  const skel = {
    frame: (name) => (frames[name] ||= frameOf(M[name])),
    len: { thumb: THUMB.len.map((x) => x * 1000) },
    bone: boneIndex,
  };
  for (const f of FNAMES) skel.len[f] = FINGERS[f].len.map((x) => x * 1000);
  const H = buildHandField(skel);
  // the box the skin lies in: the forearm up into the sleeve, out past the finger tips and the thumb
  const min = [-48, -38, -175], max = [48, 40, 192];
  for (const name of Object.keys(M)) {
    const p = new THREE.Vector3().setFromMatrixPosition(M[name]);
    const tip = new THREE.Vector3(0, 0, -32).applyMatrix4(M[name]);
    for (const v of [p, tip]) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v.getComponent(a) - 14); max[a] = Math.max(max[a], v.getComponent(a) + 14); }
  }
  const mesh = meshField(H.field, { min, max }, h);
  const { pos, nor, idx } = mesh;
  const t1 = performance.now();
  const sk = skinVertices(H, mesh, skel);
  for (let i = 0; i < pos.length; i += 3) { pos[i] /= 1000; pos[i + 1] /= 1000; pos[i + 2] = pos[i + 2] / 1000 + W0; }
  const t2 = performance.now();
  const stats = { verts: pos.length / 3, tris: idx.length / 3, mesh: Math.round(t1 - t0), skin: Math.round(t2 - t1) };
  return { pos, nor, idx: Uint32Array.from(idx), si: sk.si, sw: sk.sw, tint: sk.tint, tintL: sk.tintL, skin: sk.skin, stats };
}
function frameOf(m) {
  const e = m.elements;
  return {
    o: new THREE.Vector3(e[12], e[13], e[14]), x: new THREE.Vector3(e[0], e[1], e[2]).normalize(),
    y: new THREE.Vector3(e[4], e[5], e[6]).normalize(), z: new THREE.Vector3(e[8], e[9], e[10]).normalize(),
    at(x, y, z) { return this.o.clone().addScaledVector(this.x, x).addScaledVector(this.y, y).addScaledVector(this.z, z); },
  };
}

// ---------------------------------------------------------------------------------------------------
// Proportions. Finger widths (half, mm) at the knuckle joint, mid first phalanx, middle joint, mid
// second phalanx, last joint, mid last phalanx, tip.
const FR = {
  index: [8.4, 7.6, 8.0, 7.1, 7.0, 6.4, 5.6],
  middle: [8.8, 7.9, 8.3, 7.4, 7.2, 6.6, 5.8],
  ring: [8.3, 7.5, 7.8, 7.0, 6.8, 6.3, 5.5],
  little: [7.4, 6.6, 6.8, 6.1, 5.9, 5.5, 4.8],
};
const FSQ = 0.84;     // fingers are a little flatter than they are wide
// the metacarpal heads (the knuckles), radius
const HEAD = { index: 8.6, middle: 9.0, ring: 8.4, little: 7.6 };
// where each long bone of the palm starts, at the wrist
const MBASE = { index: [-13, 4, -24], middle: [-3, 5, -24], ring: [7, 4, -24], little: [16, 2, -26] };
export const FOREARM = {
  // half-width and half-depth of the forearm at u (0 elbow → 1 wrist), and its length (mm)
  len: 260,
  rx: (u) => lerp(36, 27.5, sstep(0.1, 1, u)) + Math.exp(-Math.pow((u - 0.22) / 0.25, 2)) * 3,
  ry: (u) => lerp(32, 17.0, sstep(0.05, 1, u)) + Math.exp(-Math.pow((u - 0.22) / 0.25, 2)) * 3,
};

// skel: { frame(name) → Frame (mm, wrist space, bind pose), len: { index: [l1,l2,l3], ..., thumb: [...] },
//         bone(name) → index }
export function buildHandField(skel) {
  const F = new Field();
  const parts = {};
  const fn = ['index', 'middle', 'ring', 'little'];
  const add = (p, k, part, o) => F.add(p, k, part, o);

  // ---- the forearm: an oval tube flattening toward the wrist, rounded off where the hand begins ----
  const FA = FOREARM, zTop = 185, zEnd = -2;
  const LUT = new Float32Array((zTop - zEnd + 1) * 2);
  for (let i = 0; i <= zTop - zEnd; i++) { const u = (FA.len - (zEnd + i)) / FA.len; LUT[i * 2] = FA.rx(u); LUT[i * 2 + 1] = FA.ry(u); }
  const forearm = {
    f: (x, y, z) => {
      const zz = clamp(z, zEnd, zTop), fi = zz - zEnd, i0 = Math.min(zTop - zEnd - 1, Math.floor(fi)), t = fi - i0;
      const rx = LUT[i0 * 2] + (LUT[i0 * 2 + 2] - LUT[i0 * 2]) * t, ry = LUT[i0 * 2 + 1] + (LUT[i0 * 2 + 3] - LUT[i0 * 2 + 1]) * t;
      const cy = -0.6 * (FA.len - zz) / FA.len;
      if (z < zEnd) return ellipsoid(x, y - cy, z - zEnd, rx, ry, 13);
      if (z > zTop) return Math.max(ellipse2(x, y - cy, rx, ry), z - zTop - 6);
      return ellipse2(x, y - cy, rx, ry);
    },
    c: new THREE.Vector3(0, 0, (zTop + zEnd) / 2), R: (zTop - zEnd) / 2 + 45, lbk: 0.6,
  };
  add(forearm, 1, 'forearm');
  // the head of the ulna on the little-finger side of the back of the wrist, and the radius's end
  add(ellIn(ID, 21, 6.5, 6, 6.5, 6.5, 7), 5, 'forearm');
  add(ellIn(ID, -22, 1, 4, 5.5, 6, 8), 6, 'forearm');

  // ---- the palm: a rounded slab out to just short of the knuckles ----
  const poly = [[-21.5, -8], [-27.5, -66], [28.5, -60], [23, -8]];
  const slabR = 7;
  const slab = {
    f: (x, y, z) => {
      // 2D distance to the convex outline (inset by the rounding), then extruded with a thickness that
      // thins toward the knuckles
      let d2 = -1e9;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % 4];
        const ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez);
        d2 = Math.max(d2, ((x - ax) * ez - (z - az) * ex) / l);
      }
      d2 += slabR;
      const v = clamp(-z / 70, 0, 1);
      const top = lerp(8.5, 6.8, v) + 1.2 * (1 - Math.pow(x / 30, 2));
      const bot = lerp(-10.5, -8.5, v);
      const yc = (top + bot) / 2, h = (top - bot) / 2 - slabR;
      const dy = Math.abs(y - yc) - h;
      const ox = Math.max(d2, 0), oy = Math.max(dy, 0);
      return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(d2, dy), 0) - slabR;
    },
    c: new THREE.Vector3(1, 0, -38), R: 52, lbk: 0.7,
  };
  add(slab, 14, 'palm');

  // the long bones of the hand under the skin, ending in the knuckles
  const K = {}, H = {};
  for (const f of fn) {
    const o = skel.frame(f + '1').o;
    K[f] = o;
    const b = new THREE.Vector3(...MBASE[f]);
    add(capsule(b, o.clone().add(new THREE.Vector3(0, -1.6, 2)), 4.0, 5.0), 7, 'palm');
    H[f] = o.clone().add(new THREE.Vector3(0, 0.6, 1.2));
    add(ellIn(ID, H[f].x, H[f].y, H[f].z, HEAD[f] * 0.96, HEAD[f], HEAD[f] * 1.02), 4, 'palm');
  }
  // the pads across the palm under the knuckles, and the heel of the hand on the little-finger side
  const padA = K.index.clone().add(new THREE.Vector3(0, -7.5, 8)), padB = K.little.clone().add(new THREE.Vector3(0, -5.5, 7));
  add(capsule(padA, padB, 5.6, 5.0), 12, 'palm');
  add(ellIn(frameTo(new THREE.Vector3(22, -6, -16), new THREE.Vector3(26, -6, -60)), 0, -1, -24, 9.5, 8.6, 27), 10, 'palm');

  // ---- the thumb: its long bone buried in the ball of the thumb, then two free phalanges ----
  const T1 = skel.frame('thumb1'), T2 = skel.frame('thumb2'), T3 = skel.frame('thumb3');
  const TL = skel.len.thumb;
  // the ball of the thumb, along the thumb's long bone, swelling toward the palm
  const thF = frameTo(T1.o, T2.o);
  add(ellIn(thF, 5, -3, -TL[0] * 0.42, 13.5, 11, 24), 11, 'thenar');
  add(coneIn(T1, -3, TL[0] - 2, 9.5, 9.8, 0.9), 6, 'thumb');
  // the web between thumb and index
  const webA = T2.at(1.5, 0, 1), webB = K.index.clone().add(new THREE.Vector3(1, -2.5, 30));
  add(capsule(webA, webB, 4.6, 5.8), 8, 'tweb');

  // ---- the fingers: phalanges with waists, knobby joints, pads underneath, round tips ----
  const chains = {};
  const finger = (name, frames, len, R, sq, part, thumb = false) => {
    const [Fa, Fb, Fc] = frames;
    const [l1, l2, l3] = len;
    const [rK, r1, rP, r2, rD, r3, rT] = R;
    // first phalanx: from the knuckle (or the thumb's MCP) to the middle joint
    add(coneIn(Fa, thumb ? -1 : 0, l1 * 0.5, rK * 0.94, r1, sq), 4.5, part);
    add(coneIn(Fa, l1 * 0.5, l1, r1, rP * 0.92, sq), 4.5, part);
    add(ellIn(Fb, 0, 0.2, 0, rP, rP * sq * 0.97, 6.5), 4.5, part);
    // second phalanx (the thumb has none: its last joint comes next)
    if (Fc) {
      add(coneIn(Fb, 0, l2 * 0.5, rP * 0.9, r2, sq), 4.0, part);
      add(coneIn(Fb, l2 * 0.5, l2, r2, rD * 0.92, sq), 4.0, part);
      add(ellIn(Fc, 0, 0.2, 0, rD, rD * sq * 0.97, 5.5), 4.0, part);
    }
    // last phalanx: the tip rounds off where the bone ends
    const L = Fc || Fb, ll = Fc ? l3 : l2;
    add(coneIn(L, 0, ll - rT, rD * 0.9, rT, sq * 0.95, 0.4), 3.4, part);
    // pads on the palm side of each phalanx, the last one fullest, running into the tip
    add(ellIn(Fa, 0, -r1 * 0.32, -l1 * 0.52, r1 * 0.86, r1 * 0.72, l1 * 0.36), 3.2, part);
    if (Fc) add(ellIn(Fb, 0, -r2 * 0.3, -l2 * 0.52, r2 * 0.86, r2 * 0.7, l2 * 0.34), 2.8, part);
    add(ellIn(L, 0, -r3 * 0.34, -ll * 0.6, r3 * 0.94, r3 * 0.78, ll * 0.44), 3.0, part);
    chains[part] = { frames, len, thumb };
  };
  for (const f of fn) finger(f, [skel.frame(f + '1'), skel.frame(f + '2'), skel.frame(f + '3')], skel.len[f], FR[f], FSQ, f);
  // the thumb: broad and flat, the knuckle at its base the biggest
  finger('thumb', [T2, T3, null], [TL[1], TL[2], 0], [10.0, 8.6, 9.2, 0, 9.2, 8.2, 7.4], 0.8, 'thumb', true);
  // the thumb chain also owns its long bone
  chains.thumb.base = T1;

  // webs between the fingers: thin skin from one first phalanx to the next, on the palm side
  for (let i = 0; i < 3; i++) {
    const a = fn[i], b = fn[i + 1];
    const A = skel.frame(a + '1').at(0, -2.6, -14), B = skel.frame(b + '1').at(0, -2.6, -14);
    add(capsule(A, B, 4.2), 6, 'web' + i);
    add(capsule(skel.frame(a + '1').at(0, -3, -5), skel.frame(b + '1').at(0, -3, -5), 5.2), 6, 'web' + i);
    parts['web' + i] = { a, b, A, B };
  }

  const nStruct = F.prims.length;

  // ---- details over the bones: tendons first, then the veins over them ----
  const tendons = [];
  for (const f of fn) {
    const k = K[f], w = { index: -9, middle: -2, ring: 5, little: 12 }[f];
    tendons.push(cord(F, [[w, -14], [lerp(w, k.x, 0.5), -40], [k.x, k.z + 22], [k.x, k.z + 13]], { r: 2.2, rise: 0.22, r2: 1.6 }));
  }
  // the thumb's long extensor, along the edge of the hollow at the base of the thumb
  {
    const a = T2.at(0, 0, 6), b = T1.at(0, 4, -TL[0] * 0.5);
    tendons.push(cord(F, [[-12, -2], [-15, -10], [b.x, b.z], [a.x, a.z]], { r: 2.0, rise: 0.4 }));
  }
  for (const t of tendons) for (const s of t.segs) add(s, 4.2, 'detail', { detail: true });
  // veins: the arch across the back of the hand fed from between the knuckles, draining up the
  // thumb side (cephalic) and the little-finger side (basilic); old veins rise and wander
  const veinDefs = [
    { pts: [[-31, -38], [-24, -55], [-10, -60], [4, -62], [16, -58], [27, -46]], r: 1.7, rise: 0.75, wiggle: 1.1, seed: 1 },
    { pts: [[2, -82], [3, -72], [4, -62]], r: 1.3, rise: 0.45, wiggle: 0.6, seed: 3 },
    { pts: [[-31, -38], [-27, -18], [-23, 4], [-21, 40], [-17, 90], [-12, 150], [-10, 185]], r: 2.0, rise: 0.7, wiggle: 1.2, seed: 5 },
    { pts: [[27, -46], [25, -26], [22, -2], [20, 40], [15, 100], [12, 185]], r: 1.9, rise: 0.55, wiggle: 1.1, seed: 6 },
    { pts: [[4, -62], [6, -44], [3, -30], [-6, -18], [-14, -10]], r: 1.5, rise: 0.5, wiggle: 1.0, seed: 7 },
  ];
  const veins = veinDefs.map((v) => cord(F, v.pts, v));
  for (const v of veins) for (const s of v.segs) add(s, 3.4, 'detail', { detail: true });

  return { field: F, nStruct, parts, chains, veins, tendons, K, H };
}

// ---------------------------------------------------------------------------------------------------
// Meshing: surface nets on a grid of `h` mm. The grid is taken in blocks; a block far from the surface
// is skipped whole, and each of the rest keeps a short list of the prims near it.
export function meshField(field, box, h) {
  const [x0, y0, z0] = box.min, nx = Math.ceil((box.max[0] - x0) / h) + 1, ny = Math.ceil((box.max[1] - y0) / h) + 1, nz = Math.ceil((box.max[2] - z0) / h) + 1;
  const N = nx * ny * nz;
  const val = new Float32Array(N);
  const B = 2;
  const bx = Math.ceil((nx - 1) / B), by = Math.ceil((ny - 1) / B), bz = Math.ceil((nz - 1) / B);
  const blockSign = new Float32Array(bx * by * bz);
  const blockList = new Array(bx * by * bz).fill(null);
  const rb = B * h * 0.87;
  const thresh = rb * 1.35 + 0.4;
  const c = new THREE.Vector3();
  // first, a coarse look: which blocks does the surface pass through? (each block's list is first
  // narrowed from its 2×2×2 super-block's, to keep this quick)
  const S = 4, sbx = Math.ceil(bx / S), sby = Math.ceil(by / S), sbz = Math.ceil(bz / S);
  for (let K = 0; K < sbz; K++) for (let J = 0; J < sby; J++) for (let I = 0; I < sbx; I++) {
    c.set(x0 + (I + 0.5) * S * B * h, y0 + (J + 0.5) * S * B * h, z0 + (K + 0.5) * S * B * h);
    const dS = field.eval(c.x, c.y, c.z);
    if (Math.abs(dS) > thresh * S + 1) {
      for (let k = K * S; k < Math.min(bz, K * S + S); k++) for (let j = J * S; j < Math.min(by, J * S + S); j++) for (let i = I * S; i < Math.min(bx, I * S + S); i++) blockSign[i + bx * (j + by * k)] = Math.sign(dS) * thresh;
      continue;
    }
    const sl = field.near(c, rb * S, thresh * S + 2 + rb * S);
    for (let k = K * S; k < Math.min(bz, K * S + S); k++) for (let j = J * S; j < Math.min(by, J * S + S); j++) for (let i = I * S; i < Math.min(bx, I * S + S); i++) {
      c.set(x0 + (i + 0.5) * B * h, y0 + (j + 0.5) * B * h, z0 + (k + 0.5) * B * h);
      const d = field.eval(c.x, c.y, c.z, undefined, sl);
      const bi = i + bx * (j + by * k);
      if (Math.abs(d) > thresh) { blockSign[bi] = Math.sign(d) * thresh; continue; }
      blockSign[bi] = 0;
      const cand = [];
      for (let q = 0; q < sl.length; q++) {
        const p = field.prims[sl[q]], dx = c.x - p.cx, dy = c.y - p.cy, dz = c.z - p.cz;
        if ((Math.sqrt(dx * dx + dy * dy + dz * dz) - p.R - rb) * p.lbk <= thresh + rb * 1.6 + p.k + 1) cand.push(sl[q]);
      }
      blockList[bi] = Int32Array.from(cand);
    }
  }
  const blockOf = (i, j, k) => Math.min(bx - 1, Math.floor(i / B)) + bx * (Math.min(by - 1, Math.floor(j / B)) + by * Math.min(bz - 1, Math.floor(k / B)));
  // the field at every grid point an active block touches
  const done = new Uint8Array(N);
  for (let bk = 0; bk < bz; bk++) for (let bj = 0; bj < by; bj++) for (let bi = 0; bi < bx; bi++) {
    const L = blockList[bi + bx * (bj + by * bk)];
    if (!L) continue;
    for (let k = bk * B; k <= Math.min(nz - 1, (bk + 1) * B); k++) for (let j = bj * B; j <= Math.min(ny - 1, (bj + 1) * B); j++) for (let i = bi * B; i <= Math.min(nx - 1, (bi + 1) * B); i++) {
      const n = i + nx * (j + ny * k);
      if (done[n]) continue;
      done[n] = 1;
      val[n] = field.eval(x0 + i * h, y0 + j * h, z0 + k * h, undefined, L);
    }
  }
  for (let n = 0; n < N; n++) if (!done[n]) {
    const i = n % nx, j = Math.floor(n / nx) % ny, k = Math.floor(n / (nx * ny));
    val[n] = blockSign[blockOf(i, j, k)] || thresh;
  }
  // a vertex in each cell the surface passes through, pulled onto the surface (only active blocks
  // can hold one: a skipped block's points all have one sign)
  const cx = nx - 1, cy = ny - 1;
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [], nor = [], lists = [];
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const OFF = [0, 1, nx, nx + 1, nx * ny, nx * ny + 1, nx * ny + nx, nx * ny + nx + 1];
  const cv = new Float32Array(8);
  const g = new THREE.Vector3();
  const active = [];
  for (let bk = 0; bk < bz; bk++) for (let bj = 0; bj < by; bj++) for (let bi = 0; bi < bx; bi++) if (blockList[bi + bx * (bj + by * bk)]) active.push(bi, bj, bk);
  for (let a = 0; a < active.length; a += 3) {
    const bi = active[a], bj = active[a + 1], bk = active[a + 2];
    const L = blockList[bi + bx * (bj + by * bk)];
    for (let k = bk * B; k < Math.min(nz - 1, (bk + 1) * B); k++) for (let j = bj * B; j < Math.min(ny - 1, (bj + 1) * B); j++) for (let i = bi * B; i < Math.min(nx - 1, (bi + 1) * B); i++) {
      const n0 = i + nx * (j + ny * k);
      let inside = 0;
      for (let q = 0; q < 8; q++) { const v = val[n0 + OFF[q]]; cv[q] = v; if (v < 0) inside++; }
      if (inside === 0 || inside === 8) continue;
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (let e = 0; e < 24; e += 2) {
        const ea = EDGES[e], eb = EDGES[e + 1], va = cv[ea], vb = cv[eb];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += (ea & 1) + ((eb & 1) - (ea & 1)) * t; sy += ((ea >> 1) & 1) + (((eb >> 1) & 1) - ((ea >> 1) & 1)) * t; sz += ((ea >> 2) & 1) + (((eb >> 2) & 1) - ((ea >> 2) & 1)) * t;
        m++;
      }
      let px = x0 + (i + sx / m) * h, py = y0 + (j + sy / m) * h, pz = z0 + (k + sz / m) * h;
      field.grad(px, py, pz, g, undefined, 0.25, L);
      for (let it = 0; it < 2; it++) {
        const d = field.eval(px, py, pz, undefined, L);
        if (Math.abs(d) < 0.004) break;
        const st = clamp(d, -h, h);
        px -= g.x * st; py -= g.y * st; pz -= g.z * st;
      }
      field.grad(px, py, pz, g, undefined, 0.25, L);
      cellV[i + cx * (j + cy * k)] = pos.length / 3;
      pos.push(px, py, pz);
      nor.push(g.x, g.y, g.z);
      lists.push(L);
    }
  }
  // a quad across every grid edge the surface crosses
  const idx = [];
  const dist2 = (u, v) => { const a = pos[u * 3] - pos[v * 3], b = pos[u * 3 + 1] - pos[v * 3 + 1], e = pos[u * 3 + 2] - pos[v * 3 + 2]; return a * a + b * b + e * e; };
  const quad = (a, b, c2, d, flip) => {
    if (a < 0 || b < 0 || c2 < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // split along the shorter diagonal
    if (dist2(a, c2) <= dist2(b, d)) idx.push(a, b, c2, a, c2, d); else idx.push(a, b, d, b, c2, d);
  };
  const CX = 1, CY = cx, CZ = cx * cy;
  for (let a = 0; a < active.length; a += 3) {
    const bi = active[a], bj = active[a + 1], bk = active[a + 2];
    for (let k = Math.max(1, bk * B); k < Math.min(nz - 1, (bk + 1) * B); k++) for (let j = Math.max(1, bj * B); j < Math.min(ny - 1, (bj + 1) * B); j++) for (let i = Math.max(1, bi * B); i < Math.min(nx - 1, (bi + 1) * B); i++) {
      const n0 = i + nx * (j + ny * k), v0 = val[n0], in0 = v0 < 0, flip = !in0;
      const c0 = i + cx * (j + cy * k);
      if (in0 !== (val[n0 + 1] < 0)) quad(cellV[c0 - CY - CZ], cellV[c0 - CZ], cellV[c0], cellV[c0 - CY], flip);
      if (in0 !== (val[n0 + nx] < 0)) quad(cellV[c0 - CX - CZ], cellV[c0 - CX], cellV[c0], cellV[c0 - CZ], flip);
      if (in0 !== (val[n0 + nx * ny] < 0)) quad(cellV[c0 - CX - CY], cellV[c0 - CY], cellV[c0], cellV[c0 - CX], flip);
    }
  }
  // keep only the skin itself: little sealed pockets left between the shapes inside are dropped
  return dropPockets({ pos: new Float32Array(pos), nor: new Float32Array(nor), idx, lists });
}

function dropPockets(m) {
  const n = m.pos.length / 3, parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = find(m.idx[t]), b = find(m.idx[t + 1]), c = find(m.idx[t + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const size = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
  let main = -1, best = 0;
  for (const [r, c] of size) if (c > best) { best = c; main = r; }
  if (best === n) return m;
  const remap = new Int32Array(n).fill(-1), pos = [], nor = [], lists = [];
  for (let i = 0; i < n; i++) if (find(i) === main) {
    remap[i] = pos.length / 3;
    pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); nor.push(m.nor[i * 3], m.nor[i * 3 + 1], m.nor[i * 3 + 2]); lists.push(m.lists[i]);
  }
  const idx = [];
  for (let t = 0; t < m.idx.length; t += 3) if (remap[m.idx[t]] >= 0) idx.push(remap[m.idx[t]], remap[m.idx[t + 1]], remap[m.idx[t + 2]]);
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx, lists };
}

// ---------------------------------------------------------------------------------------------------
// Weights and paint for each vertex. Returns the attributes of the skinned geometry (still in mm).
export function skinVertices(H, mesh, skel) {
  const { field, nStruct, parts, chains, veins } = H;
  const { pos, nor, lists } = mesh;
  const P = field.prims.slice(0, nStruct);
  const partNames = [...new Set(P.map((p) => p.part))];
  const NP = partNames.length;
  const partOf = P.map((p) => partNames.indexOf(p.part));
  const n = pos.length / 3;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), tint = new Float32Array(n * 4), tintL = new Float32Array(n * 4), skin = new Float32Array(n * 4);
  const b = (name) => skel.bone(name);
  const LAMBDA = 1.6;
  const pd = new Float64Array(NP);
  const BW = new Float32Array(32);
  // how each part spreads its skin over the bones: a function of the point, adding into BW
  const axisT = (A, Bp) => { const ax = Bp.x - A.x, ay = Bp.y - A.y, az = Bp.z - A.z, l2 = ax * ax + ay * ay + az * az; return (x, y, z) => clamp(((x - A.x) * ax + (y - A.y) * ay + (z - A.z) * az) / l2, 0, 1); };
  const iE = b('elbow'), iT = b('twist'), iW = b('wrist'), iT1 = b('thumb1');
  const flat = (ch) => ch.frames.filter(Boolean).map((F, s) => ({ ox: F.o.x, oy: F.o.y, oz: F.o.z, X: F.x, Y: F.y, Z: F.z, L: ch.len[s] }));
  const C = {};
  for (const name of Object.keys(chains)) C[name] = { ...chains[name], flat: flat(chains[name]), Lt: chains[name].len.reduce((a, c) => a + c, 0) };
  // the local coordinates of a point on a chain: which phalanx, how far along the chain, across and up
  const cc = { seg: 0, s: 0, lz: 0, lx: 0, ly: 0 };
  const onChain = (ch, x, y, z) => {
    let bd = 1e9, acc = 0;
    for (let s = 0; s < ch.flat.length; s++) {
      const F = ch.flat[s];
      const dx = x - F.ox, dy = y - F.oy, dz = z - F.oz;
      const lx = dx * F.X.x + dy * F.X.y + dz * F.X.z, ly = dx * F.Y.x + dy * F.Y.y + dz * F.Y.z, lz = -(dx * F.Z.x + dy * F.Z.y + dz * F.Z.z);
      const t = lz < 0 ? lz : lz > F.L ? lz - F.L : 0;
      const dist = lx * lx + ly * ly + t * t;
      if (dist < bd) { bd = dist; cc.seg = s; cc.s = acc + lz; cc.lz = lz; cc.lx = lx; cc.ly = ly; }
      acc += F.L;
    }
    return cc;
  };
  const spread = partNames.map((name) => {
    if (name === 'forearm') return (x, y, z, pw) => {
      const u = clamp((FOREARM.len - z) / FOREARM.len, 0, 1.05);
      const we = Math.max(0, 1 - u * 1.05), wt = u < 0.5 ? u * 1.8 : 1 - sstep(0.8, 1, u) * 0.5, ww = sstep(0.86, 1.0, u) * 0.5;
      const tot = we + wt + ww;
      BW[iE] += pw * we / tot; BW[iT] += pw * wt / tot; BW[iW] += pw * ww / tot;
    };
    if (name === 'palm') return (x, y, z, pw) => { BW[iW] += pw; };
    if (name === 'thenar') {
      const tf = axisT(chains.thumb.base.o, chains.thumb.frames[0].o);
      return (x, y, z, pw) => { const t = tf(x, y, z); BW[iT1] += pw * (0.1 + 0.6 * t); BW[iW] += pw * (0.9 - 0.6 * t); };
    }
    if (name === 'tweb') {
      const tf = axisT(chains.thumb.frames[0].o, H.K.index);
      return (x, y, z, pw) => { const t = tf(x, y, z); BW[iT1] += pw * (1 - t) * 0.75; BW[iW] += pw * (0.25 + 0.75 * t); };
    }
    if (name.startsWith('web')) {
      const W0 = parts[name], tf = axisT(W0.A, W0.B), ia = b(W0.a + '1'), ib = b(W0.b + '1');
      return (x, y, z, pw) => { const t = tf(x, y, z); BW[ia] += pw * (1 - t) * 0.7; BW[ib] += pw * t * 0.7; BW[iW] += pw * 0.3; };
    }
    const ch = C[name], L1 = ch.len[0], L2 = ch.len[1], bw = 2.6;
    if (ch.thumb) {
      const i2 = b('thumb2'), i3 = b('thumb3');
      return (x, y, z, pw) => {
        const c = onChain(ch, x, y, z);
        const b12 = sstep(L1 - bw, L1 + bw, c.s);
        // the thumb's first free phalanx turns about the MCP; behind it the skin goes with the long bone
        const back = 1 - sstep(-3, 3, c.s);
        BW[iT1] += pw * back; BW[i2] += pw * (1 - back) * (1 - b12); BW[i3] += pw * (1 - back) * b12;
      };
    }
    const i1 = b(name + '1'), i2 = b(name + '2'), i3 = b(name + '3');
    return (x, y, z, pw) => {
      const c = onChain(ch, x, y, z);
      const b12 = sstep(L1 - bw, L1 + bw, c.s), b23 = sstep(L1 + L2 - bw, L1 + L2 + bw, c.s);
      BW[i1] += pw * (1 - b12); BW[i2] += pw * b12 * (1 - b23); BW[i3] += pw * b23;
    };
  });
  // the vein centre lines, hashed into 6 mm cells, to paint them a little blue
  const VC = 6, vhash = new Map();
  const vkey = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  for (const v of veins) for (const { p } of v.pts) {
    const key = vkey(Math.floor(p.x / VC), Math.floor(p.y / VC), Math.floor(p.z / VC));
    if (!vhash.has(key)) vhash.set(key, []);
    vhash.get(key).push(p.x, p.y, p.z);
  }
  const veinDist2 = (x, y, z) => {
    let best = 1e9;
    const ci = Math.floor(x / VC), cj = Math.floor(y / VC), ck = Math.floor(z / VC);
    for (let a = -1; a <= 1; a++) for (let e = -1; e <= 1; e++) for (let f = -1; f <= 1; f++) {
      const L = vhash.get(vkey(ci + a, cj + e, ck + f));
      if (!L) continue;
      for (let i = 0; i < L.length; i += 3) { const dx = x - L[i], dy = y - L[i + 1], dz = z - L[i + 2], d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; }
    }
    return best;
  };
  const HK = ['index', 'middle', 'ring', 'little'].map((f) => H.H[f]);
  const fingerPart = partNames.map((name) => !!C[name]);
  const plainPart = partNames.map((name) => name === 'forearm' || name === 'palm');
  const foreIdx = partNames.indexOf('forearm');
  let r = 1, gg = 1, bb = 1;
  const mixc = (c0, c1, c2, t) => { r += (c0 - r) * t; gg += (c1 - gg) * t; bb += (c2 - bb) * t; };

  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const dorsal = nor[v * 3 + 1];       // the back of the hand faces +Y at rest
    // which parts own this skin: the nearest, softly
    pd.fill(1e9);
    const L = lists[v];
    for (let j = 0; j < L.length; j++) { const pi = L[j]; if (pi >= nStruct) break; const d = P[pi].f(x, y, z), k = partOf[pi]; if (d < pd[k]) pd[k] = d; }
    let dmin = 1e9, top = 0;
    for (let k = 0; k < NP; k++) if (pd[k] < dmin) { dmin = pd[k]; top = k; }
    BW.fill(0);
    for (let k = 0; k < NP; k++) {
      const pw = Math.exp(-(pd[k] - dmin) / LAMBDA);
      if (pw >= 0.01) spread[k](x, y, z, pw);
    }
    // the four strongest, normalised
    let tot = 0;
    for (let i = 0; i < 4; i++) {
      let bi = 0, bv = 0;
      for (let j = 0; j < BW.length; j++) if (BW[j] > bv) { bv = BW[j]; bi = j; }
      si[v * 4 + i] = bi; sw[v * 4 + i] = bv; tot += bv; BW[bi] = 0;
    }
    for (let i = 0; i < 4; i++) sw[v * 4 + i] /= tot || 1;

    // ---- paint: which part dominates decides the kind of skin ----
    r = 1; gg = 1; bb = 1;
    // base: paler and cooler on the back, warmer and pinker in the palm
    mixc(1.06, 1.0, 0.95, sstep(0.1, -0.6, dorsal));
    mixc(1.0, 0.97, 0.97, sstep(0.0, 0.7, dorsal) * 0.5);
    // mottling: an old hand isn't one colour
    const mot = vnoise(x * 0.11, y * 0.11, z * 0.11) - 0.5;
    mixc(1.04, 0.93, 0.92, clamp(mot * 1.6, 0, 1) * 0.5);
    mixc(0.98, 0.99, 1.02, clamp(-mot * 1.6, 0, 1) * 0.4);
    let wrinkS = -z, wrinkA = 0, crepe = 0, nail = 0, stain = 0, stainL = 0, graphite = 0;
    // red and dark round the knuckles
    for (const K of HK) {
      const dx = x - K.x, dy = y - K.y, dz = z - K.z;
      mixc(0.92, 0.79, 0.78, Math.exp(-(dx * dx + dy * dy + dz * dz) / 90) * sstep(-0.1, 0.5, dorsal) * 0.8);
    }
    if (plainPart[top]) crepe = sstep(-0.2, 0.5, dorsal) * (top === foreIdx ? 0.6 : 0.9) + sstep(0.2, -0.6, dorsal) * 0.2;
    if (fingerPart[top]) {
      const name = partNames[top], ch = C[name], c = onChain(ch, x, y, z);
      const L1 = ch.len[0], L2 = ch.len[1], Lt = ch.Lt;
      // across the finger: arcs round the joints on the back, lines across underneath
      const rr = ch.thumb ? [8.6, 8.2][c.seg] : FR[name][c.seg * 2 + 1];
      const up = c.ly / (rr * FSQ);
      wrinkS = c.s + 0.04 * c.lx * c.lx * Math.sign(up);
      const J = ch.thumb ? [0, 0.4, 3.5, L1, 0.9, 3.4] : [0, 0.3, 3.5, L1, 0.95, 3.6, L1 + L2, 0.7, 2.4];
      for (let j = 0; j < J.length; j += 3) {
        const js = J[j], gs = Math.exp(-Math.pow((c.s - js) / J[j + 2], 2));
        wrinkA = Math.max(wrinkA, gs * J[j + 1] * sstep(-0.35, 0.3, up));
        // the palm side: a crease or two right at the joint
        wrinkA = Math.max(wrinkA, Math.exp(-Math.pow((c.s - js - 0.5) / 1.6, 2)) * 0.9 * sstep(-0.1, -0.5, up));
        // darker, redder at the joints
        mixc(0.93, 0.83, 0.82, Math.exp(-Math.pow((c.s - js) / 5, 2)) * 0.6 * sstep(-0.4, 0.4, up));
      }
      crepe = sstep(-0.2, 0.4, up) * 0.5 * (1 - sstep(L1 + L2 * 0.5, L1 + L2, c.s));
      // the nail on the last phalanx: paler; the line round it is drawn by the shader
      if (c.seg === (ch.thumb ? 1 : 2)) {
        const s3 = c.lz, Ls = ch.len[c.seg];
        const wN = rr * (ch.thumb ? 0.8 : 0.74);
        const a1 = (s3 - Ls * 0.36 - 0.06 * c.lx * c.lx) / 1.0;
        const a2 = (wN - Math.abs(c.lx)) / 0.8;
        const a3 = (up - 0.2) / 0.2;
        nail = clamp(0.5 + 0.5 * Math.min(a1, a2, a3), 0, 1);
        mixc(1.07, 1.02, 0.97, sstep(0.45, 0.6, nail) * 0.75);
        // the free edge, paler still, at the very tip
        mixc(1.12, 1.08, 1.0, sstep(0.45, 0.6, nail) * sstep(Ls - 3.5, Ls - 1.5, s3) * 0.6);
      }
      // ink worked into the pads of the writing fingers (the right hand's; the left only steadies the
      // page); graphite on the side of the right little finger, where it drags across the page
      const ink = name === 'index' ? 1 : name === 'middle' ? 0.8 : name === 'thumb' ? 0.9 : 0;
      stain = ink * sstep(Lt * 0.55, Lt, c.s) * (0.4 + 0.6 * clamp(-up, 0, 1) + (name === 'thumb' ? 0.3 : clamp(-c.lx / rr, 0, 1) * 0.4));
      if (name === 'index') stainL = 0.25 * sstep(Lt * 0.55, Lt, c.s);
      if (name === 'little') graphite = clamp(c.lx / rr, 0, 1) * clamp(-up + 0.4, 0, 1) * 0.75;
    }
    // veins: blue-grey where they run, through thin skin
    mixc(0.86, 0.9, 1.03, Math.exp(-veinDist2(x, y, z) / 5.5) * 0.55 * sstep(-0.3, 0.4, dorsal));
    // age spots on the backs of the hands and the forearms, the sun's doing
    const sp = vnoise(x * 0.19 + 17, y * 0.19, z * 0.19 + 3) * 0.7 + vnoise(x * 0.5, y * 0.5 + 9, z * 0.5) * 0.3;
    const spot = sstep(0.72, 0.78, sp) * sstep(0.2, 0.7, dorsal) * (nail > 0.4 ? 0 : 1) * (plainPart[top] ? 1 : 0.3);
    mixc(0.9, 0.8, 0.7, spot * 0.6);
    tintL[v * 4] = r; tintL[v * 4 + 1] = gg; tintL[v * 4 + 2] = bb; tintL[v * 4 + 3] = stainL;
    mixc(0.72, 0.73, 0.78, graphite);
    tint[v * 4] = r; tint[v * 4 + 1] = gg; tint[v * 4 + 2] = bb; tint[v * 4 + 3] = stain;
    skin[v * 4] = wrinkS; skin[v * 4 + 1] = wrinkA; skin[v * 4 + 2] = crepe; skin[v * 4 + 3] = nail;
  }
  return { si, sw, tint, tintL, skin };
}
