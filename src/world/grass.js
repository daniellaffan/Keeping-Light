// The grass in blades, and what grows in it, round wherever the eye is: tufts of bent and fescue
// (grazed short along the cliff edge and round the tower, rank along the verges, gone to straw at the
// tips in September), heather in sprigs purple at the top, bracken fronds turning rust, yarrow,
// devil's-bit scabious and hawkbit on their stems, and stones in the ruts and along the tide line.
//
// The headland is laid out in square tiles, built as the eye comes near and let go as it leaves. Each
// tile draws one instanced mesh per kind; the shader (materials.js, USE_GRASS) thins them with distance
// in the order of a rank each carries, and sinks what is left into the ground at the far edge, where
// the painted ground (groundPaint, and the flowers' dabs) has stood for them all along.
import * as THREE from 'three';
import { UNIT } from './geo.js';
import { laneDist } from './lane.js';
import { wash, SHARED } from './materials.js';
import { shoreDist } from './bay.js';               // used only inside functions (bay.js imports this file)
import { groundPaint, pathWear, insideLand } from './flora.js';
import { rng, noise2, smooth } from '../render/paint.js';

const T = 12;                 // tile size, m
const S = 1;                  // the fields are sampled every S m across a tile and smoothed between

// ---------------- the tufts ----------------
// Geometry is a plant a metre tall; uv.y is how far up its blades a point is (it bends in the wind as
// the square of it), uv.x is 1 on a flower's head (or a stone), which takes the tip's colour.
function geo(build) {
  const pos = [], nrm = [], uv = [], idx = [];
  build({
    v(x, y, z, nx, nz, up, head = 0) { pos.push(x, y, z); nrm.push(nx, 0, nz); uv.push(head, up); return pos.length / 3 - 1; },
    tri(a, b, c) { idx.push(a, b, c); },
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// a blade from (bx, bz) leaning out along angle a: tapering strips, a point at the top
function blade(G, r, { a, r0, h, lean, w, segs, curl = 1.7 }) {
  const dx = Math.cos(a), dz = Math.sin(a);
  const tw = a + Math.PI / 2 + (r() - 0.5) * 1.1;          // the blade's face, turned a little off square
  const sx = Math.cos(tw), sz = Math.sin(tw);
  const bx = dx * r0, bz = dz * r0;
  const rows = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs, out = lean * Math.pow(t, curl);
    const cx = bx + dx * out, cz = bz + dz * out, cy = h * t * (1 - 0.25 * lean * t);
    const up = cy;
    if (s === segs) { rows.push([G.v(cx, cy, cz, dx, dz, up)]); break; }
    const ww = w * Math.pow(1 - t, 0.8) * 0.5;
    rows.push([G.v(cx - sx * ww, cy, cz - sz * ww, dx, dz, up), G.v(cx + sx * ww, cy, cz + sz * ww, dx, dz, up)]);
  }
  for (let s = 0; s < segs; s++) {
    const [l0, r0_] = rows[s], nx = rows[s + 1];
    if (nx.length === 1) G.tri(l0, r0_, nx[0]);
    else { G.tri(l0, r0_, nx[0]); G.tri(r0_, nx[1], nx[0]); }
  }
  return { x: bx + dx * lean, y: h * (1 - 0.25 * lean), z: bz + dz * lean };
}

const TUFTS = {
  // bent and fescue: fine blades fanning out
  grass: geo((G) => {
    const r = rng(11);
    for (let b = 0; b < 7; b++) {
      blade(G, r, { a: (b / 7) * Math.PI * 2 + r() * 0.9, r0: 0.05 + r() * 0.12, h: 0.55 + r() * 0.45, lean: 0.12 + r() * 0.38, w: 0.07 + r() * 0.04, segs: 3 });
    }
  }),
  // heather: stiff upright sprigs, close together, little bells crowded along their upper half
  heath: geo((G) => {
    const r = rng(12);
    for (let b = 0; b < 6; b++) {
      const top = blade(G, r, { a: r() * Math.PI * 2, r0: r() * 0.32, h: 0.6 + r() * 0.4, lean: 0.05 + r() * 0.2, w: 0.06, segs: 2, curl: 1 });
      const bx = top.x - (top.x * 0.4), bz = top.z - (top.z * 0.4);
      for (let i = 0; i < 4; i++) {
        const k = 0.55 + i * 0.13;
        bud(0.07)(G, bx + (top.x - bx) * k + (r() - 0.5) * 0.05, top.y * k, bz + (top.z - bz) * k + (r() - 0.5) * 0.05, top.y * k, 0.8 + r() * 0.4, r);
      }
    }
  }),
  // gorse: a spray of spiny green shoots, flowers clustered on them toward the ends
  gorse: geo((G) => {
    const r = rng(14);
    for (let b = 0; b < 13; b++) {
      const top = blade(G, r, { a: r() * Math.PI * 2, r0: r() * 0.15, h: 0.45 + r() * 0.55, lean: 0.15 + r() * 0.35, w: 0.032, segs: 2, curl: 1.2 });
      for (const k of b % 2 ? [0.97, 0.84, 0.72] : [0.95, 0.8]) bud(0.04)(G, top.x * k, top.y * k, top.z * k, top.y * k, 0.8 + r() * 0.5, r);
    }
  }),
  // bracken: a few broad fronds arching out from the middle
  bracken: geo((G) => {
    const r = rng(13);
    for (let b = 0; b < 4; b++) {
      blade(G, r, { a: (b / 4) * Math.PI * 2 + r(), r0: 0.03, h: 0.75 + r() * 0.25, lean: 0.45 + r() * 0.25, w: 0.42 + r() * 0.12, segs: 3, curl: 2.2 });
    }
  }),
};

// a flower: two or three stems, each with a head made by head(G, x, y, z, up, size)
function flower(seed, stems, head) {
  return geo((G) => {
    const r = rng(seed);
    for (let b = 0; b < stems; b++) {
      const h = 0.65 + r() * 0.35;
      const top = blade(G, r, { a: r() * Math.PI * 2, r0: 0.04 + r() * 0.1, h, lean: 0.04 + r() * 0.12, w: 0.025, segs: 2, curl: 1.3 });
      head(G, top.x, top.y, top.z, top.y, 0.8 + r() * 0.4, r);
    }
  });
}
// a flat umbel (yarrow) or a disc (hawkbit): a fan facing up
function disc(rad, rows = 7, dome = 0.3) {
  return (G, x, y, z, up, k) => {
    const c = G.v(x, y + rad * dome * k, z, 0, 0, up, 1), ring = [];
    for (let i = 0; i < rows; i++) {
      const a = (i / rows) * Math.PI * 2;
      ring.push(G.v(x + Math.cos(a) * rad * k, y, z + Math.sin(a) * rad * k, Math.cos(a), Math.sin(a), up, 1));
    }
    for (let i = 0; i < rows; i++) G.tri(c, ring[(i + 1) % rows], ring[i]);
  };
}
// a bud (gorse's pea flowers): a little diamond, turned and tipped at random
function bud(rad) {
  return (G, x, y, z, up, k, r) => {
    const a = r() * Math.PI * 2, tilt = 0.3 + r() * 0.9, R = rad * k;
    const ux = Math.cos(a), uz = Math.sin(a);                         // across the flower
    const vx = -uz * Math.cos(tilt), vy = Math.sin(tilt), vz = ux * Math.cos(tilt);   // up it
    const p = [
      G.v(x - ux * R * 0.6, y, z - uz * R * 0.6, 0, 0, up, 1), G.v(x + vx * R * 1.2, y + vy * R * 1.2, z + vz * R * 1.2, 0, 0, up, 1),
      G.v(x + ux * R * 0.6, y, z + uz * R * 0.6, 0, 0, up, 1), G.v(x - vx * R * 0.5, y - vy * R * 0.5, z - vz * R * 0.5, 0, 0, up, 1),
    ];
    G.tri(p[0], p[1], p[2]); G.tri(p[0], p[2], p[3]);
  };
}
// a ball (scabious): an octahedron, a little flattened
function ball(rad) {
  return (G, x, y, z, up, k) => {
    const R = rad * k, ys = 0.8;
    const t = G.v(x, y + R * ys * 2, z, 0, 0, up, 1), b = G.v(x, y, z, 0, 0, up, 1), ring = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      ring.push(G.v(x + Math.cos(a) * R, y + R * ys, z + Math.sin(a) * R, Math.cos(a), Math.sin(a), up, 1));
    }
    for (let i = 0; i < 4; i++) { G.tri(t, ring[(i + 1) % 4], ring[i]); G.tri(b, ring[i], ring[(i + 1) % 4]); }
  };
}
// yarrow's flat head is many little florets, crowded in a plate
function umbel(rad, n) {
  const one = disc(rad * 0.45, 3, 0.4);
  return (G, x, y, z, up, k, r) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r(), d = i === 0 ? 0 : rad * k * (0.45 + 0.4 * r());
      one(G, x + Math.cos(a) * d, y + (r() - 0.6) * rad * 0.25 * k, z + Math.sin(a) * d, up, k * (0.8 + 0.4 * r()));
    }
  };
}
const FLOWERS = {
  yarrow: flower(21, 3, umbel(0.085, 6)),
  scabious: flower(22, 3, ball(0.055)),
  hawkbit: flower(23, 2, disc(0.05, 6, 0.15)),
};
// a stone: a squashed octahedron, sitting half sunk
const STONE = geo((G) => {
  const t = G.v(0, 0.5, 0, 0, 0, 0, 1), b = G.v(0, -0.5, 0, 0, 0, 0, 1), ring = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, k = 0.8 + 0.4 * ((i * 7) % 3) / 2;
    ring.push(G.v(Math.cos(a) * k, (i % 2) * 0.12, Math.sin(a) * k * 0.8, Math.cos(a), Math.sin(a), 0, 1));
  }
  for (let i = 0; i < 5; i++) { G.tri(t, ring[(i + 1) % 5], ring[i]); G.tri(b, ring[i], ring[(i + 1) % 5]); }
});
const GEOS = { ...TUFTS, ...FLOWERS, stone: STONE };

const col = (h) => new THREE.Color(h);
const C = {
  straw: col('#CDBB7E'), dead: col('#857A4A'), seed: col('#A88E5E'),
  gorse: col('#EDC431'), gorsePale: col('#F3DA6A'), gorseGreen: col('#4E6430'),
  heathStem: col('#4C4A36'), heathFlower: col('#A05AA8'), heathOver: col('#7E5A66'),
  brackenStem: col('#617030'), bracken: col('#A9692F'), brackenGreen: col('#7A8A36'),
  stem: col('#56723A'), yarrow: col('#F3F0E3'), yarrowPink: col('#EBD3D6'), scabious: col('#7F80D6'), hawkbit: col('#ECC333'),
  stone: col('#9A958C'), stone2: col('#7C766D'), stoneWarm: col('#A08E76'),
};
const _a = new THREE.Color(), _b = new THREE.Color();

// ---------------- the meadow ----------------
export class Meadow {
  // clear: circles [x, z, r] (world) where nothing grows: the tower and its apron, the houses, the places
  constructor(bay, clear = []) {
    this.bay = bay;
    this.clear = clear;
    this.group = new THREE.Group();
    this.group.name = 'meadow';
    this.material = wash({ color: '#ffffff', color2: '#F4F0E6', grass: true, world: true, noiseScale: 0.05, line: 0, crease: 0, gran: 0.6, turb: 0.6, side: THREE.DoubleSide });
    this.tiles = new Map();
    this.frame = 0;
    // the gorse and the heather bushes (flora.js), by the tile their middle is in
    this.bushes = new Map();
    for (const b of (bay.flora && bay.flora.userData.bushes) || []) {
      const key = Math.floor(b.x / T) + ',' + Math.floor(b.z / T);
      if (!this.bushes.has(key)) this.bushes.set(key, []);
      this.bushes.get(key).push(b);
    }
  }

  // the fields across a tile, sampled every S m: what grows there, how long, its colours
  fields(x0, z0) {
    const n = T / S + 1, bay = this.bay;
    const F = { n, grass: new Float32Array(n * n), heath: new Float32Array(n * n), bracken: new Float32Array(n * n), tall: new Float32Array(n * n), f: new Float32Array(n * n * 4), turf: new Float32Array(n * n * 3), any: false };
    const out = { c: new THREE.Color(), f: [0, 0, 0, 0], turf: new THREE.Color() };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const wx = x0 + i * S, wz = z0 + j * S, x = wx / UNIT, y = wz / UNIT, k = j * n + i;
        const h = bay.groundAt(wx, wz);
        if (h < 1) continue;
        const e = 0.6, hx = bay.groundAt(wx + e, wz) - bay.groundAt(wx - e, wz), hz = bay.groundAt(wx, wz + e) - bay.groundAt(wx, wz - e);
        const up = 2 * e / Math.hypot(hx, hz, 2 * e);
        const d = insideLand(x, y) ? shoreDist(x, y) : -shoreDist(x, y);
        groundPaint(x, y, h, up, d, laneDist(x, y), out);
        F.grass[k] = out.grass; F.heath[k] = out.heath; F.bracken[k] = out.bracken; F.tall[k] = out.tall;
        F.f.set(out.f, k * 4);
        F.turf[k * 3] = out.turf.r; F.turf[k * 3 + 1] = out.turf.g; F.turf[k * 3 + 2] = out.turf.b;
        if (out.grass + out.heath + out.bracken > 0.01) F.any = true;
      }
    }
    return F;
  }

  build(ti, tj) {
    const x0 = ti * T, z0 = tj * T, bay = this.bay;
    const F = this.fields(x0, z0);
    const tile = { meshes: [], seen: this.frame };
    const bushes = this.bushes.get(ti + ',' + tj) || [];
    if (!F.any && !bushes.length) return tile;
    const n = F.n;
    // the fields at a point in the tile, smoothed between the samples
    const at = (arr, px, pz, stride = 1, o = 0) => {
      const fx = (px - x0) / S, fz = (pz - z0) / S;
      const i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fz)), u = fx - i, v = fz - j;
      const a = arr[(j * n + i) * stride + o], b = arr[(j * n + i + 1) * stride + o], c = arr[((j + 1) * n + i) * stride + o], d = arr[((j + 1) * n + i + 1) * stride + o];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
    const free = (wx, wz) => {
      for (const [cx, cz, cr] of this.clear) if ((wx - cx) ** 2 + (wz - cz) ** 2 < cr * cr) return false;
      return true;
    };
    const lists = {};
    const put = (kind, wx, wy, wz, yaw, h, b, tipFrom, base, tip, r) => {
      (lists[kind] ||= []).push([r(), wx, wy, wz, yaw, h, b, tipFrom, base.r, base.g, base.b, tip.r, tip.g, tip.b]);
    };
    const r = rng(ti * 7919 + tj * 104729 + 17);
    const wear = {};

    // the grass, the heather and the bracken, on a jittered lattice
    const sp = 0.25;
    for (let pz = z0 + sp * 0.5; pz < z0 + T; pz += sp) {
      for (let px = x0 + sp * 0.5; px < x0 + T; px += sp) {
        const wx = px + (r() - 0.5) * sp * 0.9, wz = pz + (r() - 0.5) * sp * 0.9;
        const gr = at(F.grass, wx, wz), he = at(F.heath, wx, wz), br = at(F.bracken, wx, wz);
        if (gr + he + br < 0.02 || !free(wx, wz)) { r(); r(); r(); continue; }
        pathWear(wx, wz, wear);
        const bare = wear.crown ? 0.1 : wear.wear;
        const clump = noise2(wx * 0.45, wz * 0.45, 71);
        const roll = r(), yaw = r() * Math.PI * 2, v = r();
        const wy = bay.groundAt(wx, wz) + (wear.wear > 0.02 ? 0.03 : -0.02);
        const tall = at(F.tall, wx, wz) * (wear.crown ? 0.3 : 1);
        if (roll < br * 0.3 * (1 - bare)) {
          // bracken: a plant every so often, the drift of it made of many
          const h = 0.45 + 0.5 * v * clump + 0.2 * tall;
          _a.copy(C.brackenStem).multiplyScalar(0.85 + 0.3 * r());
          _b.copy(C.bracken).lerp(C.brackenGreen, smooth(0.6, 0.2, clump) * 0.7).multiplyScalar(0.85 + 0.3 * v);
          put('bracken', wx, wy, wz, yaw, h, h * (0.9 + 0.4 * r()), 0.15 + 0.2 * r(), _a, _b, r);
        } else if (roll < he * 0.95 * (1 - bare)) {
          if (r() < 0.45) continue;                                   // bushier, so fewer
          const h = 0.16 + 0.22 * v + 0.12 * clump;
          _a.copy(C.heathStem).multiplyScalar(0.8 + 0.4 * r());
          _b.copy(C.heathFlower).lerp(C.heathOver, smooth(0.35, 0.15, clump) * 0.8).multiplyScalar(0.8 + 0.35 * r());
          put('heath', wx, wy, wz, yaw, h, Math.max(0.38, h * 1.5) * (0.85 + 0.3 * r()), 0.45 + 0.15 * r(), _a, _b, r);
        } else if (roll < Math.sqrt(Math.min(1, gr + he * 0.4 + br * 0.5)) * (1 - bare) * (0.75 + 0.5 * clump)) {
          // the grass: the turf's colour, a blade's length from how grazed, and going to straw at the tip
          const h = (0.08 + 0.42 * tall) * (0.65 + 0.7 * v) * (0.75 + 0.5 * clump);
          _a.set(at(F.turf, wx, wz, 3, 0), at(F.turf, wx, wz, 3, 1), at(F.turf, wx, wz, 3, 2));
          _a.offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06);
          const straw = 0.2 + 0.5 * smooth(0.45, 0.8, noise2(wx * 0.2, wz * 0.2, 72)) * (0.4 + 0.6 * tall);
          if (r() < 0.08 + 0.12 * tall) _a.lerp(C.dead, 0.75);
          _b.copy(_a).multiplyScalar(1.12).lerp(tall > 0.6 && r() < 0.4 ? C.seed : C.straw, straw);
          put('grass', wx, wy, wz, yaw, h, Math.max(0.24, h * 0.95) * (0.85 + 0.3 * r()), 0.5 + 0.35 * r(), _a, _b, r);
        }
        // stones in the ruts and the worn paths
        if (wear.wear > 0.45 && r() < 0.07 * wear.wear) {
          const s = 0.03 + 0.1 * r() ** 2;
          _b.copy(C.stone).lerp(C.stoneWarm, r()).lerp(C.stone2, r() * 0.6);
          put('stone', wx, wy - 0.05 + s * 0.15, wz, yaw, s * 0.6, s, 0, _b, _b, r);
        }
      }
    }

    // the gorse and the heather bushes, grown over with their own shoots: the dome is the mass inside
    for (const B of bushes) {
      const gorse = B.kind === 'gorse', R = (B.sx + B.sz) / 2;
      const area = 2 * Math.PI * R * (R + B.sy) / 2;
      const N = Math.min(gorse ? 600 : 160, Math.round(area * (gorse ? 15 : 16)));
      const cy = Math.cos(B.yaw), sy = Math.sin(B.yaw);
      for (let k = 0; k < N; k++) {
        // even over the dome: on a sphere, area is even in height
        const e = 0.03 + 0.97 * r(), a = r() * Math.PI * 2, c = Math.sqrt(1 - e * e);
        const lx = Math.cos(a) * c * B.sx, lz = Math.sin(a) * c * B.sz;
        const v = r(), yaw = r() * Math.PI * 2;
        if (gorse) {
          const h = 0.32 + 0.3 * v;
          const wy = B.y + e * B.sy - h * 0.45;
          _a.set('#34452A').lerp(C.gorseGreen, e).multiplyScalar(B.shade * (0.85 + 0.3 * r()));
          _b.copy(C.gorse).lerp(C.gorsePale, r() * 0.4).multiplyScalar(0.85 + 0.25 * r());
          put('gorse', B.x + lx * cy + lz * sy, wy, B.z - lx * sy + lz * cy, yaw, h, h * (1.1 + 0.4 * r()), 0.72 + 0.15 * r(), _a, _b, r);
        } else {
          const h = 0.14 + 0.14 * v;
          const wy = B.y + e * B.sy - h * 0.35;
          _a.copy(C.heathStem).multiplyScalar(B.shade * (0.8 + 0.4 * r()));
          _b.copy(C.heathFlower).lerp(C.heathOver, r() < 0.2 ? 0.7 : 0).multiplyScalar(0.8 + 0.35 * r());
          put('heath', B.x + lx * cy + lz * sy, wy, B.z - lx * sy + lz * cy, yaw, h, 0.3 * (0.85 + 0.3 * r()), 0.35 + 0.15 * r(), _a, _b, r);
        }
      }
    }

    // the flowers, sparser, in clumps, as the dabs are on the painted ground
    const fs = 0.45;
    for (let pz = z0 + fs * 0.5; pz < z0 + T; pz += fs) {
      for (let px = x0 + fs * 0.5; px < x0 + T; px += fs) {
        const wx = px + (r() - 0.5) * fs * 0.9, wz = pz + (r() - 0.5) * fs * 0.9;
        const roll = r(), yaw = r() * Math.PI * 2, v = r();
        const f0 = at(F.f, wx, wz, 4, 0), f2 = at(F.f, wx, wz, 4, 2), f3 = at(F.f, wx, wz, 4, 3);
        if (f0 + f2 + f3 < 0.003 || !free(wx, wz)) continue;
        pathWear(wx, wz, wear);
        if (wear.wear > 0.3 && !wear.crown) continue;
        const cl = (k) => 0.25 + 1.35 * smooth(0.3, 0.7, noise2(wx * 0.5 + k * 3, wz * 0.5 - k, 80 + k));
        const p2 = f2 * 2.2 * cl(2), p3 = f3 * 2.2 * cl(3), p0 = f0 * 1.6 * cl(0);
        const tall = at(F.tall, wx, wz);
        const h = (0.16 + 0.3 * tall) * (0.75 + 0.5 * v);
        const wy = bay.groundAt(wx, wz) - 0.02;
        let kind = null, tip = null;
        if (roll < p2) { kind = 'yarrow'; tip = _b.copy(C.yarrow).lerp(C.yarrowPink, r() < 0.15 ? 0.7 : 0); }
        else if (roll < p2 + p3) { kind = 'scabious'; tip = _b.copy(C.scabious).multiplyScalar(0.85 + 0.3 * r()); }
        else if (roll < p2 + p3 + p0) { kind = 'hawkbit'; tip = _b.copy(C.hawkbit).multiplyScalar(0.9 + 0.2 * r()); }
        if (!kind) continue;
        _a.copy(C.stem).multiplyScalar(0.85 + 0.3 * r());
        put(kind, wx, wy, wz, yaw, kind === 'scabious' ? h * 1.25 : h, h * (0.9 + 0.3 * r()), 0.99, _a, tip, r);
      }
    }

    // a mesh for each kind, its instances in rank order (the shader thins them in that order)
    let ymin = Infinity, ymax = -Infinity;
    for (const [kind, L] of Object.entries(lists)) {
      L.sort((a, b) => a[0] - b[0]);
      const N = L.length;
      const iPos = new Float32Array(N * 4), iShape = new Float32Array(N * 4), iCol = new Float32Array(N * 3), iTip = new Float32Array(N * 3);
      L.forEach((e, k) => {
        iPos.set([e[1], e[2], e[3], e[4]], k * 4);
        iShape.set([e[5], e[6], e[7], (k + 0.5) / N], k * 4);
        iCol.set([e[8], e[9], e[10]], k * 3);
        iTip.set([e[11], e[12], e[13]], k * 3);
        ymin = Math.min(ymin, e[2]); ymax = Math.max(ymax, e[2] + e[5]);
      });
      const g = new THREE.InstancedBufferGeometry().copy(GEOS[kind]);
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 4));
      g.setAttribute('iShape', new THREE.InstancedBufferAttribute(iShape, 4));
      g.setAttribute('iCol', new THREE.InstancedBufferAttribute(iCol, 3));
      g.setAttribute('iTip', new THREE.InstancedBufferAttribute(iTip, 3));
      g.instanceCount = N;
      tile.meshes.push({ mesh: new THREE.Mesh(g, this.material), N });
    }
    const ctr = new THREE.Vector3(x0 + T / 2, (ymin + ymax) / 2, z0 + T / 2);
    const rad = Math.hypot(T / 2 + 1.5, T / 2 + 1.5, (ymax - ymin) / 2 + 1);
    tile.y = ctr.y;
    for (const { mesh } of tile.meshes) {
      mesh.geometry.boundingSphere = new THREE.Sphere(ctr, rad);
      mesh.matrixAutoUpdate = false;
      mesh.name = 'meadow';
      this.group.add(mesh);
    }
    return tile;
  }

  // each frame: the tiles near enough the eye shown, the nearest missing ones built, the rest let go
  update(cam) {
    this.frame++;
    const [near, far] = SHARED.uGrassLod.value.toArray();
    const want = [];
    const i0 = Math.floor((cam.x - far) / T), i1 = Math.floor((cam.x + far) / T);
    const j0 = Math.floor((cam.z - far) / T), j1 = Math.floor((cam.z + far) / T);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = Math.max(i * T - cam.x, 0, cam.x - (i + 1) * T), dz = Math.max(j * T - cam.z, 0, cam.z - (j + 1) * T);
        const key = i + ',' + j, tile = this.tiles.get(key);
        const dy = tile ? Math.max(0, Math.abs(cam.y - tile.y) - 1.5) : 0;
        const dn = Math.hypot(dx, dz, dy);
        if (dn > far * 1.08) continue;
        if (!tile) { want.push([dn, i, j, key]); continue; }
        tile.seen = this.frame;
        const keep = 1 - 0.9 * smooth(near, far, dn);
        for (const m of tile.meshes) {
          m.mesh.visible = true;
          m.mesh.geometry.instanceCount = Math.min(m.N, Math.ceil(m.N * Math.min(1, keep + 0.1)));
        }
      }
    }
    // build the nearest first: all of those close by at once, a few more each frame
    want.sort((a, b) => a[0] - b[0]);
    const t0 = performance.now();
    for (const [dn, i, j, key] of want) {
      if (dn > near && performance.now() - t0 > 4) break;
      const tile = this.build(i, j);
      this.tiles.set(key, tile);
    }
    for (const [key, tile] of this.tiles) {
      if (tile.seen === this.frame) continue;
      for (const m of tile.meshes) m.mesh.visible = false;
      // long out of sight and out of reach: let it go
      if (this.frame - tile.seen > 600) {
        for (const m of tile.meshes) { m.mesh.removeFromParent(); m.mesh.geometry.dispose(); }
        this.tiles.delete(key);
      }
    }
  }
}
