// The wild ground of the headland, as the west coast has it in September: western gorse in flower and
// heather in bloom in drifts across the tops, bracken going rust inland, yarrow and devil's-bit scabious
// in the short turf along the cliff edge and the verges, grey boulders blotched with lichen, rocks dark
// with wrack at the cliff foot, a lace of surf round the shore and the water going green over the
// shallows. The lane is a boreen, two wheel ruts with grass down the middle; the spurs are footpaths
// worn to bare earth.
//
// The ground's own pigment and flowers come from groundPaint (bay.js paints the terrain with it); the
// flowers themselves are dabs the wash shader lays where a 'flora' attribute says they grow.
import * as THREE from 'three';
import { UNIT, TOWER } from './geo.js';
import { LANE, SPURS, laneDist } from './lane.js';
import { wash } from './materials.js';
import { landHeight, shoreDist, COAST_CHAINS } from './bay.js';   // used only inside functions (bay.js imports this file)
import { LAND, pointInPoly } from '../game/chart.js';
import { rng, noise1, noise2, fbm2, smooth } from '../render/paint.js';

const col = (h) => new THREE.Color(h);
const PIG = {
  turf: col('#8DAA59'), meadow: col('#6F9147'), rank: col('#5B7B3B'),
  gorse: col('#4E6331'), heath: col('#655C4C'), bracken: col('#8F7038'),
  rock: col('#928D85'), rock2: col('#6F6B66'), strata: col('#5A5652'),
  shingle: col('#BCAA8C'), bed: col('#5E6E6C'),
  rut: col('#9E825C'), rutEdge: col('#7F6649'), crown: col('#728F48'),
};
// the four flowers: gorse (and hawkbit, and lichen on the rock), heather, yarrow, devil's-bit scabious
export const FLORA = { cols: ['#EBC437', '#9C55A6', '#F4F1E4', '#7D82D3'], freq: [12, 11, 11, 10], size: [0.46, 0.46, 0.42, 0.42] };
// on stone: orange lichen, moss, pale crust lichen, nothing
const LICHEN = { cols: ['#D98F37', '#7E8C52', '#DCDFCC', '#000000'], freq: [4.5, 3, 5, 1], size: [0.46, 0.48, 0.44, 0] };

const TX = () => TOWER.x / UNIT, TZ = () => TOWER.z / UNIT;
// the village, the cottages and the school along the north shore: kept, not wild
const tame = (x, y) => smooth(5, 1, Math.max(66 - x, x - 100, -12 - y, y - 6, 0));

// where the gorse, the heather and the bracken grow (0..1 each), d chart units in from the shore
export function heathFields(x, y, d) {
  const g = smooth(0.5, 0.64, fbm2(x * 0.12 + 11, y * 0.12 - 4, 21)) * smooth(0.5, 2.2, d);
  const h = smooth(0.46, 0.6, fbm2(x * 0.1 - 7, y * 0.1 + 2, 33)) * (1 - g * 0.8) * smooth(0.3, 1.5, d);
  const b = smooth(0.52, 0.66, fbm2(x * 0.06 + 2, y * 0.06 + 9, 44)) * smooth(4, 10, d) * (1 - g) * (1 - h);
  return { g, h, b };
}

// how wild the ground is let grow: not on the lane, not round the tower's door, not in the village
function wildness(x, y, L) {
  const dt = Math.hypot(x - TX(), y - TZ());
  return smooth(2.5, 6, dt) * (1 - 0.8 * tame(x, y)) * smooth(0.6, 1.8, L);
}

// The ground's pigment (into out.c) and its flowers (out.f, four weights) at a chart point: h its height
// (m), up the y of its normal, d chart units in from the shore (negative out to sea), L from the lane.
export function groundPaint(x, y, h, up, d, L, out) {
  const c = out.c, f = out.f;
  const wild = wildness(x, y, L);
  const { g, h: hh, b } = heathFields(x, y, d);
  // turf: short and bright by the cliff edge, ranker inland
  c.copy(PIG.turf).lerp(PIG.meadow, smooth(1.5, 6, d)).lerp(PIG.rank, smooth(0.4, 0.75, fbm2(x * 0.15, y * 0.15, 5)) * 0.6);
  c.lerp(PIG.gorse, g * wild * 0.9).lerp(PIG.heath, hh * wild * 0.85).lerp(PIG.bracken, b * wild * 0.75);
  // rock where the ground falls steeply, laid in beds
  const steep = smooth(0.84, 0.6, up);
  _c.copy(PIG.rock).lerp(PIG.rock2, smooth(0.3, 0.75, fbm2(x * 0.4, y * 0.9, 6)))
    .lerp(PIG.strata, smooth(0.55, 0.8, noise1(h * 0.8 + fbm2(x * 0.2, y * 0.2, 7) * 3, 3)) * 0.7);
  c.lerp(_c, steep);
  // shingle along the tide line, and the sea bed under it
  c.lerp(PIG.shingle, smooth(2.6, 1.2, h) * smooth(-1.6, -0.6, h) * 0.9);
  c.lerp(PIG.bed, smooth(-1.2, -2.4, h));
  // the flowers
  const dry = smooth(1.4, 2.6, h) * (1 - steep);
  const edge = smooth(0.3, 0.9, d) * smooth(4.5, 1.5, d);       // the short turf along the cliff top
  const verge = smooth(0.45, 0.9, L) * smooth(2.6, 1.2, L);
  const keep = 0.3 + 0.7 * smooth(2.5, 6, Math.hypot(x - TX(), y - TZ()));
  f[0] = dry * keep * (g * wild * 0.15 + 0.012 + verge * 0.06) + steep * smooth(-1, 3, h) * 0.04;
  f[1] = dry * keep * hh * wild * 0.6;
  f[2] = dry * keep * (0.015 + edge * 0.1 + verge * 0.1);
  f[3] = dry * keep * (0.01 + edge * 0.045 + verge * 0.07);
  return out;
}
const _c = new THREE.Color();

// the ground's normal's y from the height function, by finite differences
function upAt(x, y) {
  const e = 0.25, k = e * UNIT * 2;
  const dx = landHeight(x + e, y) - landHeight(x - e, y), dy = landHeight(x, y + e) - landHeight(x, y - e);
  return k / Math.hypot(dx, dy, k);
}

// the material the ground and everything growing on it is painted with
export function groundMaterial({ line = 0.9, crease = 0.3, offset = false } = {}) {
  const m = wash({ color: '#ffffff', color2: '#F3EFE6', tint: true, flora: FLORA, world: true, noiseScale: 0.05, line, crease, gran: 0.95 });
  if (offset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
  return m;
}

// ---------------- geometry helpers ----------------
// a growing set of triangles with tint and flora, made into one mesh at the end
class Bundle {
  constructor() { this.pos = []; this.nrm = []; this.tint = []; this.flora = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  mesh(mat, name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(this.count * 2), 2));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tint, 4));
    g.setAttribute('flora', new THREE.Float32BufferAttribute(this.flora, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    return m;
  }
}

// A lump: a dome (or, with full, a whole ball) roughened by noise, scaled, turned and set at p. paint(ux,
// uy, uz, out) colours each vertex from its direction out of the lump's middle.
const DOME = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
const LOW = new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
const BALL = new THREE.IcosahedronGeometry(1, 1);
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function lump(B, { p, sx, sy, sz, yaw = 0, tilt = [0, 0], rough = 0.25, seed = 0, full = false, low = false, paint }) {
  const g = full ? BALL : low ? LOW : DOME;
  const P = g.attributes.position, base = B.count;
  _e.set(tilt[0], yaw, tilt[1], 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(p, _q, _s.set(sx, sy, sz));
  const out = { c: new THREE.Color(), f: [0, 0, 0, 0] };
  const local = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    // the same roughening for the same point, so the seam of the dome stays closed
    const k = 1 + rough * (noise2(x * 1.9 + seed * 3.1 + z * 0.7, y * 1.9 + z * 1.3, 61) - 0.5) * 2
      + rough * 0.5 * (noise2(x * 4.1 - z * 2.3 + seed, y * 4.3 + z * 1.1, 62) - 0.5);
    local.push([x * k, Math.max(y * k, full ? -2 : 0), z * k]);
  }
  for (let i = 0; i < P.count; i++) {
    const [x, y, z] = local[i];
    _v.set(x, y, z).applyMatrix4(_m);
    B.pos.push(_v.x, _v.y, _v.z);
    paint(P.getX(i), P.getY(i), P.getZ(i), _v, out);
    B.tint.push(out.c.r, out.c.g, out.c.b, 0);
    B.flora.push(out.f[0], out.f[1], out.f[2], out.f[3]);
  }
  const ix = g.index;
  if (ix) for (let i = 0; i < ix.count; i++) B.idx.push(base + ix.getX(i));
  else for (let i = 0; i < P.count; i++) B.idx.push(base + i);
  // normals from the lump's own faces (smooth across the dome)
  const n = new Float32Array(P.count * 3);
  const tri = ix ? ix.count / 3 : P.count / 3;
  for (let t = 0; t < tri; t++) {
    const a = ix ? ix.getX(t * 3) : t * 3, b = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, c = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
    const pa = (base + a) * 3, pb = (base + b) * 3, pc = (base + c) * 3, Q = B.pos;
    const ux = Q[pb] - Q[pa], uy = Q[pb + 1] - Q[pa + 1], uz = Q[pb + 2] - Q[pa + 2];
    const vx = Q[pc] - Q[pa], vy = Q[pc + 1] - Q[pa + 1], vz = Q[pc + 2] - Q[pa + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k * 3] += nx; n[k * 3 + 1] += ny; n[k * 3 + 2] += nz; }
  }
  // the dome's seam: its first and last columns are the same points, so share their normals
  for (let i = 0; i < P.count; i++) {
    _n.set(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
    if (_n.lengthSq() < 1e-12) _n.set(0, 1, 0);
    _n.normalize();
    B.nrm.push(_n.x, _n.y, _n.z);
  }
  if (!full) {
    // weld the seam's normals (SphereGeometry repeats the first column at the end), and the top's
    const W = g.parameters.widthSegments + 1, N = B.nrm;
    _n.set(0, 0, 0);
    for (let i = 0; i < W; i++) _n.x += N[(base + i) * 3], _n.y += N[(base + i) * 3 + 1], _n.z += N[(base + i) * 3 + 2];
    _n.normalize();
    for (let i = 0; i < W; i++) { N[(base + i) * 3] = _n.x; N[(base + i) * 3 + 1] = _n.y; N[(base + i) * 3 + 2] = _n.z; }
    for (let r = 0; r < P.count / W; r++) {
      const a = (base + r * W) * 3, b = (base + r * W + W - 1) * 3;
      _n.set(N[a] + N[b], N[a + 1] + N[b + 1], N[a + 2] + N[b + 2]).normalize();
      N[a] = N[b] = _n.x; N[a + 1] = N[b + 1] = _n.y; N[a + 2] = N[b + 2] = _n.z;
    }
  }
}

// ---------------- gorse, heather and boulders ----------------
// clear: circles [x, z, r] (world) where nothing grows: houses, the places, their doors
export function buildFlora(bay, clear = []) {
  const group = new THREE.Group();
  group.name = 'flora';
  const r = rng(4242);
  const CH = 24;                                      // chunk size, chart units, so far chunks cull
  const chunks = new Map();
  const chunk = (x, y, kind) => {
    const key = kind + ':' + Math.floor(x / CH) + ',' + Math.floor(y / CH);
    if (!chunks.has(key)) chunks.set(key, { kind, B: new Bundle() });
    return chunks.get(key).B;
  };
  const free = (wx, wz, rad) => {
    for (const [cx, cz, cr] of clear) if (Math.hypot(wx - cx, wz - cz) < cr + rad + 1.2) return false;
    return Math.hypot(wx - TOWER.x, wz - TOWER.z) > 14 + rad;
  };
  const gorseCol = col('#4B5F2E'), gorseDark = col('#34452A'), heathCol = col('#5E5A42'), heathDark = col('#3E3F33');
  const stone = col('#B3AFA6'), stone2 = col('#8E8A84');

  for (let y = -50; y < 100; y += 1) {
    for (let x = -32; x < 140; x += 1) {
      const cx = x + r(), cy = y + r();
      const wx = cx * UNIT, wz = cy * UNIT, h = bay.groundAt(wx, wz);
      if (h < 2.2 || !insideLand(cx, cy)) continue;
      const L = laneDist(cx, cy);
      if (L < 1.05) continue;
      const wild = wildness(cx, cy, L);
      if (wild < 0.05) continue;
      if (upAt(cx, cy) < 0.8) continue;
      const d = shoreDist(cx, cy);
      // thickest where it's seen: along the lane and the cliff tops
      const seen = Math.max(smooth(26, 6, L), smooth(6, 1.5, d) * 0.7, 0.03);
      const { g, h: hh } = heathFields(cx, cy, d);
      // gorse: rounded bushes, two or three run together
      if (r() < g * wild * seen * 0.7) {
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const px = wx + (r() - 0.5) * 3.2, pz = wz + (r() - 0.5) * 3.2;
          const s = 0.6 + r() * 0.9, ht = s * (0.65 + r() * 0.35);
          if (!free(px, pz, s)) continue;
          const gy = Math.min(bay.groundAt(px - s, pz), bay.groundAt(px + s, pz), bay.groundAt(px, pz - s), bay.groundAt(px, pz + s));
          const shade = 0.85 + r() * 0.3, seed = r() * 50;
          lump(chunk(cx, cy, 'g'), {
            p: _p.set(px, gy - 0.12 * ht, pz), sx: s * (1 + r() * 0.4), sy: ht, sz: s * (1 + r() * 0.4), yaw: r() * 6.3, rough: 0.22, seed,
            paint: (ux, uy, uz, w, o) => {
              o.c.copy(gorseDark).lerp(gorseCol, smooth(0, 0.5, uy)).multiplyScalar(shade);
              o.f[0] = 0.85 * smooth(-0.45, 0.35, uy); o.f[1] = 0; o.f[2] = 0; o.f[3] = 0;
            },
          });
        }
      }
      // heather: low cushions in drifts
      if (r() < hh * wild * seen * 0.5) {
        const n = 5 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
          const px = wx + (r() - 0.5) * 3.8, pz = wz + (r() - 0.5) * 3.8;
          const s = 0.3 + r() * 0.45;
          if (!free(px, pz, s)) continue;
          const gy = Math.min(bay.groundAt(px - s, pz), bay.groundAt(px + s, pz), bay.groundAt(px, pz - s), bay.groundAt(px, pz + s));
          const shade = 0.85 + r() * 0.3, seed = r() * 50;
          lump(chunk(cx, cy, 'g'), {
            p: _p.set(px, gy - 0.1, pz), sx: s * (1 + r() * 0.4), sy: s * (0.45 + r() * 0.3), sz: s, yaw: r() * 6.3, rough: 0.38, seed, low: true,
            paint: (ux, uy, uz, w, o) => {
              o.c.copy(heathDark).lerp(heathCol, smooth(0, 0.6, uy)).multiplyScalar(shade);
              o.f[0] = 0; o.f[1] = smooth(-0.2, 0.4, uy); o.f[2] = 0; o.f[3] = 0;
            },
          });
        }
      }
      // boulders: grey, blotched with lichen, in scatters along the tops
      const bf = smooth(0.66, 0.78, fbm2(cx * 0.18 + 40, cy * 0.18, 55)) * Math.max(smooth(9, 2, d), 0.25);
      if (r() < bf * seen * 0.6) {
        const n = 1 + Math.floor(r() * 2.5);
        for (let i = 0; i < n; i++) {
          const px = wx + (r() - 0.5) * 3, pz = wz + (r() - 0.5) * 3;
          const s = 0.4 + Math.pow(r(), 2.5) * 1.3;
          if (!free(px, pz, s)) continue;
          const gy = bay.groundAt(px, pz);
          const sh = 0.88 + r() * 0.2, seed = r() * 50;
          lump(chunk(cx, cy, 's'), {
            p: _p.set(px, gy - s * 0.25, pz), sx: s * (1 + r() * 0.5), sy: s * (0.45 + r() * 0.35), sz: s, yaw: r() * 6.3,
            tilt: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3], rough: 0.3, seed, full: true,
            paint: (ux, uy, uz, w, o) => {
              o.c.copy(stone2).lerp(stone, smooth(-0.3, 0.6, uy)).multiplyScalar(sh);
              o.f[0] = 0.5 * smooth(-0.1, 0.6, uy); o.f[1] = 0.45 * smooth(0.1, -0.5, uy); o.f[2] = 0.75 * smooth(-0.4, 0.4, uy); o.f[3] = 0;
            },
          });
        }
      }
    }
  }
  // rocks along the cliff foot, dark with wrack below the tide's reach
  const wrack = col('#4A4634'), wet = col('#5E5A55'), dry = col('#8C877F');
  for (const chain of COAST_CHAINS) {
    for (let i = 0; i < chain.length - 1; i++) {
      const [ax, ay] = chain[i], [bx, by] = chain[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      for (let t = 0; t < len; t += 1.3) {
        if (r() > 0.55) continue;
        const u = t / len, x0 = ax + (bx - ax) * u, y0 = ay + (by - ay) * u;
        // out from the land, a little way into the sea
        const nx = (by - ay) / len, ny = -(bx - ax) / len;
        const sgn = insideLand(x0 + nx * 0.5, y0 + ny * 0.5) ? -1 : 1;
        const off = -0.15 + r() * 1.1;
        const px = (x0 + nx * sgn * off) * UNIT, pz = (y0 + ny * sgn * off) * UNIT;
        const s = 0.7 + Math.pow(r(), 1.5) * 2.4;
        const top = -0.4 + r() * 2.6;
        const seed = r() * 50;
        lump(chunk(x0, y0, 's'), {
          p: _p.set(px, top - s * 0.7, pz), sx: s * (1 + r() * 0.6), sy: s * 0.9, sz: s, yaw: r() * 6.3,
          tilt: [(r() - 0.5) * 0.5, (r() - 0.5) * 0.5], rough: 0.35, seed, full: true,
          paint: (ux, uy, uz, w, o) => {
            o.c.copy(wrack).lerp(wet, smooth(0.6, 1.4, w.y)).lerp(dry, smooth(1.6, 2.6, w.y));
            o.f[0] = 0.4 * smooth(1.8, 2.8, w.y); o.f[1] = 0; o.f[2] = 0.3 * smooth(1.4, 2.4, w.y); o.f[3] = 0;
          },
        });
      }
    }
  }
  const plants = groundMaterial({ line: 0.35, crease: 0.3 });
  const rock = wash({ color: '#ffffff', color2: '#F0EEEA', tint: true, flora: LICHEN, world: true, noiseScale: 0.2, line: 0.8, crease: 0.5, gran: 1 });
  for (const [key, { kind, B }] of chunks) if (B.count) group.add(B.mesh(kind === 's' ? rock : plants, 'flora-' + key));
  group.matrixAutoUpdate = false;
  return group;
}
const _p = new THREE.Vector3();

function insideLand(x, y) { return pointInPoly(x, y, LAND.north) || pointInPoly(x, y, LAND.south); }

// ---------------- the boreen and the footpaths ----------------
// a ribbon laid on the ground along a smoothed line: across[] are offsets (m) and wear[] how worn each
// strip is (0 the verge's own ground, 1 bare earth); crown marks the grass strip down the middle
function ribbon(bay, B, pts, across, wear, crown, seed) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x * UNIT, 0, y * UNIT)), false, 'centripetal');
  const n = Math.max(2, Math.round(curve.getLength() / 1.1));
  const P = curve.getSpacedPoints(n);
  const out = { c: new THREE.Color(), f: [0, 0, 0, 0] };
  const W = across.length;
  for (let i = 0; i <= n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const along = i * 1.1;
    const wide = 0.88 + 0.28 * noise1(along * 0.05, seed);
    for (let j = 0; j < W; j++) {
      const o = across[j] * wide + (j === 0 || j === W - 1 ? (noise1(along * 0.4 + j * 9, seed + 1) - 0.5) * 0.5 : 0);
      const wx = P[i].x - tz * o, wz = P[i].z + tx * o;
      const x = wx / UNIT, y = wz / UNIT;
      const h = bay.groundAt(wx, wz);
      B.pos.push(wx, h + 0.04, wz);
      B.nrm.push(0, 1, 0);
      groundPaint(x, y, h, upAt(x, y), shoreDist(x, y), laneDist(x, y), out);
      // ruts: worn earth, paler where it's driest; a few stones show
      const w = wear[j] * (0.85 + 0.3 * noise1(along * 0.3 + j * 3, seed + 2));
      const earth = _c.copy(PIG.rutEdge).lerp(PIG.rut, smooth(0.6, 1, w) * (0.6 + 0.4 * noise1(along * 0.13, seed + 3)));
      if (crown[j]) out.c.lerp(PIG.crown, 0.7);
      out.c.lerp(earth, Math.min(1, w));
      const keep = 1 - Math.min(1, w);
      B.tint.push(out.c.r, out.c.g, out.c.b, 0);
      B.flora.push(out.f[0] * keep, out.f[1] * keep * 0.3, (out.f[2] + crown[j] * 0.12) * keep, out.f[3] * keep);
    }
  }
  const base = B.count - (n + 1) * W;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < W - 1; j++) {
      const a = base + i * W + j, b = a + 1, c = a + W, d = c + 1;
      B.idx.push(a, b, c, b, d, c);
    }
  }
}

export function buildPaths(bay) {
  const B = new Bundle();
  // the boreen: grass verge, a rut, the grass crown, a rut, the verge
  ribbon(bay, B, LANE, [-1.55, -1.1, -0.8, -0.4, -0.18, 0.18, 0.4, 0.8, 1.1, 1.55], [0, 0.55, 1, 0.85, 0.1, 0.1, 0.85, 1, 0.55, 0], [0, 0, 0, 0, 1, 1, 0, 0, 0, 0], 3);
  // the footpaths to the places off the lane
  for (const s of Object.values(SPURS)) ribbon(bay, B, s.pts, [-0.85, -0.42, 0, 0.42, 0.85], [0, 0.7, 1, 0.7, 0], [0, 0, 0, 0, 0], 7);
  const g = B.mesh(groundMaterial({ line: 0, crease: 0.15, offset: true }), 'paths');
  g.geometry.computeVertexNormals();
  return g;
}

// ---------------- the shore: surf and shallows ----------------
// A band round every coast, lying on the sea: surf against the rock, then the shallows going over into
// the open sea's own colour. Its colours are set with the sea's (Bay.setPalette); the vertices carry how
// much surf and shallow they are and how far they lie from the tower, as the sea's do.
export function buildShore() {
  const across = [-0.35, 0.02, 0, 0.3, 1.2, 2.6, 4.4];
  const foam = [1, 1, 1, 0, 0, 0, 0], shoal = [1, 1, 1, 1, 0.75, 0.3, 0];
  const pos = [], idx = [], meta = [];
  const r = rng(808);
  for (const chain of COAST_CHAINS) {
    // resample the coast at about a chart unit, so the surf can be ragged
    const pts = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const [ax, ay] = chain[i], [bx, by] = chain[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.9));
      for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
    }
    pts.push(chain[chain.length - 1]);
    if (pts.length < 2) continue;
    // which side is the sea
    const [ax, ay] = pts[0], [bx, by] = pts[1], L0 = Math.hypot(bx - ax, by - ay) || 1;
    const sgn = insideLand(ax + (by - ay) / L0 * 0.6, ay - (bx - ax) / L0 * 0.6) ? -1 : 1;
    const base = pos.length / 3;
    pts.forEach(([x, y], i) => {
      const [px, py] = pts[Math.max(0, i - 1)], [qx, qy] = pts[Math.min(pts.length - 1, i + 1)];
      let tx = qx - px, ty = qy - py;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = ty * sgn, ny = -tx * sgn;
      const surf = 0.25 + 0.95 * Math.pow(noise1(i * 0.35, 5) * 0.7 + r() * 0.3, 1.4);
      across.forEach((o, j) => {
        const oo = j === 2 ? surf : j === 3 ? surf + 0.25 + r() * 0.2 : o;
        const X = (x + nx * oo) * UNIT, Z = (y + ny * oo) * UNIT;
        // each band a hair above the one outside it, so where the band folds on itself the surf wins
        pos.push(X, 0.03 + (across.length - j) * 0.012, Z);
        meta.push(foam[j], shoal[j], Math.hypot(X - TOWER.x, Z - TOWER.z));
      });
    });
    const W = across.length;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < W - 1; j++) {
        const a = base + i * W + j, b = a + 1, c = a + W, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setAttribute('tint', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 4).fill(1), 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, wash({ color: '#ffffff', color2: '#F2F4F6', tint: true, water: 1, line: 0, crease: 0, gran: 0.55, turb: 0.7, lit: 0.3, world: true, noiseScale: 0.03, side: THREE.DoubleSide }));
  m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; m.material.polygonOffsetUnits = -2;
  m.name = 'shore';
  m.userData.meta = meta;
  return m;
}
