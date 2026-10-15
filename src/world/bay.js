// The bay in three dimensions, built from the chart (src/game/chart.js), which stays the truth: one
// chart unit is 4 m. The headlands are one heightfield whose shore is wherever the sea stands; the sea
// rises and falls with the night's tide, so the reefs stand proud, lie awash or sit under the water just
// as the logbook's tide says. Ships come in three sizes and sail the inked line (Fleet decides where
// they are; this only draws them). The lamp's beam, the moon, Mag Mell and the tall figure in the haar
// live here too.
import * as THREE from 'three';
import { LAND, STACKS, REEFS, PIERS, pointInPoly } from '../game/chart.js';
import { villageSites } from '../render/scenes/bay-paint.js';
import { UNIT, TOWER, CLIFF_TOP, ROOM_YAW } from './geo.js';
import { laneDist } from './lane.js';
import { wash, glowMaterial, beamMaterial } from './materials.js';
import { Builder } from './build.js';
import { LAMP_HEIGHT } from './tower.js';
import { rng, noise1, fbm1, fbm2, makeCanvas, smooth } from '../render/paint.js';

// sea level for each tide (m), and the height of each kind of reef's top
export const TIDE = { high: 1.0, mid: 0, low: -1.0 };
const REEF_TOP = { always: 1.7, mid: 0.5, low: -0.5 };
// where the lamp is: in the lantern at the top of the tower
export const LAMP = new THREE.Vector3(TOWER.x, TOWER.y + LAMP_HEIGHT, TOWER.z);
// The beam dips a little from up there, so it still crosses the bay where the boats are, meeting the
// line it took when the lamp sat just over the watch room (4.6 m up, dipping 0.012) half a kilometre out.
const BEAM_DIP = 0.012 + (LAMP_HEIGHT - 4.6) / 500;

const C = (x, y) => [x * UNIT, y * UNIT];       // chart → world x, z
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------- the land ----------------
function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-9)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
// The shore: only the coast edges of the two land polygons count (not the seam where they meet at the
// head of the bay, nor their far edges off the chart), so the land runs on unbroken round the bay.
const coastEdges = (poly) => {
  const out = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if (a[0] >= 101.4 && b[0] >= 101.4) continue;
    if ((a[1] === b[1] && Math.abs(a[1]) >= 40) || (a[0] === b[0] && Math.abs(a[0]) >= 100)) continue;
    out.push([a[0], a[1], b[0], b[1]]);
  }
  return out;
};
const COAST = [...coastEdges(LAND.north), ...coastEdges(LAND.south)];
function shoreDist(x, y) {
  let d = Infinity;
  for (const e of COAST) d = Math.min(d, segD(x, y, e[0], e[1], e[2], e[3]));
  return d;
}

// Nora's shop in Port na Rón (places/shop.js) is cut into the slope: the ground under it is levelled
// down to the street at its door, as the tower's is, so its floor is at the street and the hill rises
// behind it.
const SHOP_PAD = { x: 72.5, y: 1.4, r0: 1.6, r1: 2.6, at: [72.5, 0.45], h: null };

// height of the ground (m above mid-tide) at a chart point
export function landHeight(x, y) {
  const h = rawHeight(x, y), P = SHOP_PAD;
  const d = Math.hypot(x - P.x, y - P.y);
  if (d > P.r1) return h;
  P.h ??= rawHeight(...P.at) + 0.2;
  return lerp(Math.min(h, P.h), h, smooth(P.r0, P.r1, d));
}

function rawHeight(x, y) {
  const inN = pointInPoly(x, y, LAND.north), inS = pointInPoly(x, y, LAND.south);
  const d = inN || inS ? shoreDist(x, y) : -shoreDist(x, y);
  if (d < 0) return Math.max(-7, -1.4 + d * 2.2);
  // the north shore's low ground and the south headland's high ground, run together at the head of the bay
  const topN = (1.6 + 1.4 * fbm1(x * 0.08, 4) + (x < 16 ? (16 - x) * 0.18 : 0) - 1.2 * smooth(76, 80, x) * smooth(99, 95, x)) * UNIT
    + Math.max(0, -y - 3) * 0.9;                       // the land rises inland, to the hills
  const topS = (x < 24 ? CLIFF_TOP : lerp(CLIFF_TOP, 11 + 7 * fbm1(x * 0.07, 9), smooth(24, 40, x))) + Math.max(0, y - 62) * 0.9;
  const wN = x > 96 ? smooth(30, 14, y) : inN ? 1 : 0;
  const top = lerp(topS, topN, wN);
  const cliff = Math.pow(smooth(0, 0.9, d), 0.6);
  let h = -1.4 + (top + 1.4) * cliff;
  // rolling ground inland
  h += (fbm2(x * 0.07, y * 0.07, 3) - 0.5) * 9 * smooth(1.2, 6, d);
  // the village's ground sits low by the water, but never down to the tide
  h = Math.max(h, -1.4 + 4.2 * cliff);
  // the tower stands on level ground
  const dt = Math.hypot(x - TOWER.x / UNIT, y - TOWER.z / UNIT);
  h = lerp(Math.min(h, CLIFF_TOP - 0.05), h, smooth(2.6, 5, dt));
  return h;
}

const GRID = { x0: -34, x1: 142, y0: -52, y1: 104, step: 0.6 };
function terrain() {
  const { x0, x1, y0, y1, step } = GRID;
  const nx = Math.round((x1 - x0) / step) + 1, ny = Math.round((y1 - y0) / step) + 1;
  const pos = new Float32Array(nx * ny * 3), tint = new Float32Array(nx * ny * 4), uv = new Float32Array(nx * ny * 2);
  const hs = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, y = y0 + j * step, k = j * nx + i;
      const h = landHeight(x, y);
      hs[k] = h;
      pos[k * 3] = x * UNIT; pos[k * 3 + 1] = h; pos[k * 3 + 2] = y * UNIT;
      uv[k * 2] = x * 0.25; uv[k * 2 + 1] = y * 0.25;
    }
  }
  const idx = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      // skip cells wholly under the sea floor's flat (never seen)
      if (hs[a] < -6.5 && hs[b] < -6.5 && hs[c] < -6.5 && hs[d] < -6.5) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // pigment: grass on the tops, bare rock where it falls steeply, shingle along the shore
  const n = g.attributes.normal;
  const grass = new THREE.Color('#7E9157'), grass2 = new THREE.Color('#687C47'), heath = new THREE.Color('#8C8458');
  const rock = new THREE.Color('#9A8572'), rock2 = new THREE.Color('#7E6E62'), shingle = new THREE.Color('#BCAA8C'), bed = new THREE.Color('#5E6E6C'), lane = new THREE.Color('#B59E7C');
  const c = new THREE.Color(), c2 = new THREE.Color();
  for (let k = 0; k < nx * ny; k++) {
    const x = pos[k * 3] / UNIT, y = pos[k * 3 + 2] / UNIT, h = hs[k];
    const ny_ = n.getY(k);
    const v = fbm2(x * 0.15, y * 0.15, 5);
    c.copy(grass).lerp(grass2, smooth(0.35, 0.7, v)).lerp(heath, smooth(0.6, 0.85, fbm2(x * 0.05, y * 0.05, 8)) * 0.7);
    c2.copy(rock).lerp(rock2, smooth(0.3, 0.75, fbm2(x * 0.4, y * 0.9, 6)));
    c.lerp(c2, smooth(0.86, 0.62, ny_));
    c.lerp(shingle, smooth(2.6, 1.2, h) * smooth(-1.6, -0.6, h) * 0.9);
    // the lane, worn into the grass
    if (h > 1) c.lerp(lane, smooth(0.8, 0.25, laneDist(x, y)) * 0.7);
    c.lerp(bed, smooth(-1.2, -2.4, h));
    tint[k * 4] = c.r; tint[k * 4 + 1] = c.g; tint[k * 4 + 2] = c.b; tint[k * 4 + 3] = 0;
  }
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 4));
  const mat = wash({ color: '#ffffff', color2: '#F3EFE6', tint: true, world: true, noiseScale: 0.05, line: 0.9, crease: 0.3, gran: 0.95 });
  const m = new THREE.Mesh(g, mat);
  m.matrixAutoUpdate = false;
  m.userData.grid = { ...GRID, nx, ny, hs };
  return m;
}

// A loft: rings of a chart polygon, each scaled about its centre and set at a height, capped on top.
function loft(poly, rings, { jitter = 0.3, seed = 1, cap = true } = {}) {
  let cx = 0, cy = 0;
  for (const [x, y] of poly) { cx += x; cy += y; }
  cx /= poly.length; cy /= poly.length;
  const r = rng(seed);
  const N = poly.length, pos = [], idx = [];
  rings.forEach(([s, h], ri) => {
    for (let i = 0; i < N; i++) {
      const [x, y] = poly[i];
      const jj = ri === 0 ? 0 : (r() - 0.5) * jitter;
      const k = s * (1 + (ri > 0 ? (r() - 0.5) * 0.12 : 0));
      pos.push((cx + (x - cx) * k) * UNIT, h + jj * 2, (cy + (y - cy) * k) * UNIT);
    }
  });
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let i = 0; i < N; i++) {
      const a = ri * N + i, b = ri * N + (i + 1) % N, c = a + N, d = b + N;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (cap) {
    const top = rings[rings.length - 1];
    const ci = pos.length / 3;
    pos.push(cx * UNIT, top[1] + 0.25, cy * UNIT);
    const base = (rings.length - 1) * N;
    for (let i = 0; i < N; i++) idx.push(base + i, base + (i + 1) % N, ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // the chart's polygons wind either way; make the faces look outward
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const p = ng.attributes.position, nn = ng.attributes.normal;
  for (let t = 0; t < p.count; t += 3) {
    const mx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3 - cx * UNIT;
    const mz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3 - cy * UNIT;
    const out = nn.getX(t) * mx + nn.getZ(t) * mz + nn.getY(t) * 0.5;
    if (out < 0) {
      for (const ax of ['X', 'Y', 'Z']) { const v = p['get' + ax](t + 1); p['set' + ax](t + 1, p['get' + ax](t + 2)); p['set' + ax](t + 2, v); }
    }
  }
  ng.computeVertexNormals();
  return ng;
}

// flat ring/disc of a polygon at scale s0..s1 (s0 = 0 for a disc), lying at y
function flatPoly(poly, s0, s1, y) {
  let cx = 0, cy = 0;
  for (const [x, yy] of poly) { cx += x; cy += yy; }
  cx /= poly.length; cy /= poly.length;
  const N = poly.length, pos = [], idx = [];
  for (const s of [s0, s1]) for (const [x, yy] of poly) pos.push((cx + (x - cx) * s) * UNIT, y, (cy + (yy - cy) * s) * UNIT);
  for (let i = 0; i < N; i++) { const a = i, b = (i + 1) % N; idx.push(a, b, a + N, b, b + N, a + N); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  // all faces up
  const p = ng.attributes.position;
  for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t + 1) - p.getX(t), az = p.getZ(t + 1) - p.getZ(t), bx = p.getX(t + 2) - p.getX(t), bz = p.getZ(t + 2) - p.getZ(t);
    if (az * bx - ax * bz < 0) { const x = p.getX(t + 1), z = p.getZ(t + 1); p.setXYZ(t + 1, p.getX(t + 2), y, p.getZ(t + 2)); p.setXYZ(t + 2, x, y, z); }
  }
  ng.computeVertexNormals();
  return ng;
}

// ---------------- painted textures for light ----------------
const texCache = {};
function canvasTexture(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return (texCache[key] = t);
}
// a soft round glow
export function radialTex() {
  return canvasTexture('radial', 64, 64, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fff'); g.addColorStop(0.18, 'rgb(150,150,150)'); g.addColorStop(0.5, 'rgb(40,40,40)'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}
// a broken column of light on the swell (v = 0 at the light, 1 toward the viewer)
function streakTex() {
  return canvasTexture('streak', 64, 256, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let i = 0; i < 70; i++) {
      const v = Math.pow(r(), 1.3), y = v * h;
      const len = (0.25 + r() * 0.6) * w * (1 - v * 0.5);
      const a = (1 - v) * (0.5 + r() * 0.5);
      x.fillStyle = `rgba(255,255,255,${a})`;
      x.fillRect(w / 2 - len / 2 + (r() - 0.5) * w * 0.2, y, len, 1.5 + r() * 3);
    }
  });
}
// the glitter where the beam lies on the water (u across, v along)
function glintTex() {
  return canvasTexture('glint', 128, 256, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 260; i++) {
      const u = r(), v = r();
      const across = Math.exp(-Math.pow((u - 0.5) * 3.2, 2));
      x.fillStyle = `rgba(255,255,255,${across * (0.3 + r() * 0.7)})`;
      x.fillRect(u * w, v * h, 3 + r() * 10, 1 + r() * 1.5);
    }
  });
}

function billboard(size, color, amt, map = radialTex()) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), glowMaterial({ emit: color, amt, map }));
  m.userData.billboard = true;
  m.renderOrder = 5;
  return m;
}
// a glow lying flat on the water, its long axis turned toward the viewer each frame
function waterStreak(w, len, color, amt) {
  const g = new THREE.PlaneGeometry(w, len);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, len / 2);       // from the light toward +z (turned to face the viewer)
  const m = new THREE.Mesh(g, glowMaterial({ emit: color, amt, map: streakTex() }));
  m.renderOrder = 4;
  return m;
}

// ---------------- ships ----------------
const SHIP = {
  small: { L: 9, B: 2.8, D: 1.5, free: 0.8, mast: 6.5 },
  medium: { L: 13, B: 3.8, D: 1.9, free: 1.0, mast: 8.5 },
  large: { L: 19, B: 5.2, D: 2.5, free: 1.4, mast: 11 },
};
const HULLS = ['#8A4E33', '#5D6B7A', '#7A5A3E', '#2F4A5E'];

function makeShip(sh, idx) {
  const S = SHIP[sh.size] || SHIP.medium;
  const hullCol = sh.size === 'large' ? '#3E3A44' : HULLS[sh.name.length % 4];
  const M = {
    hull: wash({ color: hullCol, line: 1, crease: 0.6, gran: 0.6, noiseScale: 0.6 }),
    deck: wash({ color: '#B49A78', color2: '#A88C6A', line: 0.9, crease: 0.5, gran: 0.5, noiseScale: 0.8 }),
    ww: wash({ color: '#EAE0CC', color2: '#DCD0B8', line: 1, crease: 0.6, gran: 0.4, noiseScale: 0.8 }),
    sail: wash({ color: '#E9DCC2', color2: '#D9C6A6', line: 0.9, crease: 0.4, gran: 0.4, side: THREE.DoubleSide, noiseScale: 0.5 }),
    dark: wash({ color: '#2B2622', line: 1, crease: 0.4, gran: 0.3 }),
  };
  const b = new Builder(100 + idx);
  // hull: the lower half of an egg, pinched to a bow at -z
  const hg = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const p = hg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z < 0) x *= 1 - 0.62 * z * z;
    p.setXYZ(i, x * S.B / 2, y * S.D, z * S.L / 2);
  }
  hg.computeVertexNormals();
  b.add(hg, M.hull, { pos: [0, S.free, 0], wonk: 0 });
  // deck
  const dg = new THREE.CircleGeometry(1, 18);
  dg.rotateX(-Math.PI / 2);
  const dp = dg.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    let x = dp.getX(i), z = dp.getZ(i);
    if (z < 0) x *= 1 - 0.62 * z * z;
    dp.setXYZ(i, x * S.B / 2 * 0.96, 0, z * S.L / 2 * 0.97);
  }
  b.add(dg, M.deck, { pos: [0, S.free - 0.06, 0], wonk: 0 });
  // a pale gunwale stripe
  b.add(new THREE.TorusGeometry(1, 0.035, 4, 24), M.ww, { pos: [0, S.free - 0.02, 0], rot: [Math.PI / 2, 0, 0], scale: [S.B / 2 * 0.98, S.L / 2 * 0.98, 1], wonk: 0 });
  if (sh.size !== 'small') b.box(M.ww, S.B * 0.62, 1.7, S.L * 0.24, [0, S.free + 0.85, S.L * 0.18]);
  if (sh.size === 'large') {
    b.box(M.ww, S.B * 0.5, 1.4, S.L * 0.16, [0, S.free + 2.4, S.L * 0.2]);
    b.cyl(M.dark, 0.45, 0.5, 2.4, [0, S.free + 2.4, S.L * 0.34], { seg: 10 });
  }
  const mz = -S.L * 0.12;
  b.cyl(M.dark, 0.07, 0.1, S.mast, [0, S.free + S.mast / 2, mz], { seg: 6 });
  // a small steadying sail, set aft of the mast
  const sg = new THREE.BufferGeometry();
  const top = S.free + S.mast * 0.95, foot = S.free + 1.0;
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, foot, mz + 0.1, 0, top, mz + 0.1, 0, foot + 0.3, mz + S.L * 0.36], 3));
  sg.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
  b.add(sg, M.sail, { wonk: 0 });
  // rigging: forestay and backstay, thin dark lines
  const stay = (a, c) => {
    const d = new THREE.Vector3(...c).sub(new THREE.Vector3(...a)), L = d.length();
    const g = new THREE.CylinderGeometry(0.025, 0.025, L, 4);
    g.translate(0, L / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.applyQuaternion(q);
    b.add(g, M.dark, { pos: a, wonk: 0 });
  };
  stay([0, S.free + S.mast * 0.97, mz], [0, S.free, -S.L * 0.48]);
  stay([0, S.free + S.mast * 0.97, mz], [0, S.free + 0.2, S.L * 0.45]);
  const group = new THREE.Group();
  const body = b.finish('ship-' + sh.name);
  body.matrixAutoUpdate = true;
  group.add(body);
  // the lantern at the masthead, and its halo
  const lanternAt = new THREE.Vector3(0, S.free + S.mast * 0.72, mz + 0.25);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), glowMaterial({ emit: 0xffd890, amt: 2.2 }));
  lantern.position.copy(lanternAt);
  const halo = billboard(14, 0xe6a94a, 0.55);
  halo.position.copy(lanternAt);
  group.add(lantern, halo);
  return { group, body, lantern, halo, M, S, lanternAt, hullCol };
}

// ---------------- the bay ----------------
export class Bay {
  constructor() {
    const group = this.group = new THREE.Group();
    group.name = 'bay';
    this.land = terrain();
    group.add(this.land);

    // the sea: rings about the tower, finer near, coloured from the palette near → far
    this.sea = this.makeSea();
    group.add(this.sea);

    // stacks
    const rockM = wash({ color: '#9C8B7A', color2: '#837466', line: 1, crease: 0.6, gran: 1, world: true, noiseScale: 0.12 });
    const sb = new Builder(5);
    for (const s of STACKS) {
      const H = s.h * 10;
      sb.add(loft(s.poly, [[1.2, -4], [1.0, 0.5], [0.95, H * 0.45], [0.86, H * 0.85], [0.66, H]], { jitter: 0.8, seed: s.id.length * 7 }), rockM, { wonk: 0 });
    }
    group.add(sb.finish('stacks'));

    // reefs: a mound and a scatter of rocks, a ring of broken water while they stand above it, and a
    // paler patch over them while they're covered
    this.reefs = {};
    const reefM = wash({ color: '#6A5F58', color2: '#4F5A44', line: 1, crease: 0.6, gran: 1, world: true, noiseScale: 0.2 });
    this.foamM = wash({ color: '#EEF0EC', color2: '#DDE3E2', water: 1, line: 0, crease: 0, gran: 0.4, lit: 0.45, world: true, noiseScale: 0.3 });
    this.shallowM = wash({ color: '#6F86A2', color2: '#7C92A8', water: 1, line: 0.05, crease: 0, gran: 0.5, lit: 0.3, world: true, noiseScale: 0.05 });
    for (const [id, R] of Object.entries(REEFS)) {
      const top = REEF_TOP[R.tide];
      const g = new THREE.Group();
      g.name = 'reef-' + id;
      const b = new Builder(id.length * 13 + 3);
      b.add(loft(R.poly, [[1.38, -4], [1.0, top - 0.45], [0.7, top - 0.12], [0.38, top]], { jitter: R.tide === 'always' ? 0.35 : 0.12, seed: id.length * 3 + 1 }), reefM, { wonk: 0 });
      // rocks: jagged, tallest where the reef is "always"
      const r = rng(id.length * 31 + 7);
      const [bx0, by0, bx1, by1] = R.poly.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [1e9, 1e9, -1e9, -1e9]);
      const area = (bx1 - bx0) * (by1 - by0);
      const n = Math.min(40, Math.round(area * 0.9));
      for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
        const x = lerp(bx0, bx1, r()), y = lerp(by0, by1, r());
        if (!pointInPoly(x, y, R.poly)) continue;
        i++;
        const size = (0.5 + r() * 0.9) * UNIT * 0.45;
        const lift = R.tide === 'always' ? r() * 1.4 : r() * 0.25;
        b.add(new THREE.IcosahedronGeometry(1, 0), reefM, { pos: [x * UNIT, top - 0.3 + lift - size * 0.3, y * UNIT], rot: [r() * 3, r() * 6, r() * 3], scale: [size, size * (0.5 + r() * 0.5), size * (0.8 + r() * 0.4)], wonk: 0 });
      }
      const rocks = b.finish('reef');
      rocks.matrixAutoUpdate = true;
      const foam = new THREE.Mesh(flatPoly(R.poly, 0.9, 1.32, 0), this.foamM);
      const shallow = new THREE.Mesh(flatPoly(R.poly, 0, 1.3, 0), this.shallowM);
      g.add(rocks, foam, shallow);
      group.add(g);
      this.reefs[id] = { group: g, rocks, foam, shallow, top, tide: R.tide };
    }

    this.buildVillage();
    this.buildPiers();
    this.buildBeam();
    this.buildSky();
    this.buildMagMell();
    this.buildManannan();

    this.ships = [];
    this.billboards = [];
    group.traverse((o) => { if (o.userData.billboard) this.billboards.push(o); });
    this.tide = 0;
    this.camPos = new THREE.Vector3();
  }

  // the height of the ground mesh itself (not the function it was sampled from) at world x, z
  groundAt(wx, wz) {
    const G = this.land.userData.grid;
    const fx = (wx / UNIT - G.x0) / G.step, fz = (wz / UNIT - G.y0) / G.step;
    const i = Math.max(0, Math.min(G.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(G.ny - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const hs = G.hs, a = hs[j * G.nx + i], b = hs[j * G.nx + i + 1], c = hs[(j + 1) * G.nx + i], d = hs[(j + 1) * G.nx + i + 1];
    // the cell is split along b–c, as the mesh is
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  makeSea() {
    const NR = 34, NT = 96, RMAX = 2800;
    const cx = TOWER.x, cz = TOWER.z;
    const pos = [], tint = [], idx = [], rad = [];
    for (let i = 0; i <= NR; i++) {
      const r = i === 0 ? 0 : 6 + (RMAX - 6) * Math.pow((i - 1) / (NR - 1), 2.4);
      for (let j = 0; j < NT; j++) {
        const a = (j / NT) * Math.PI * 2;
        pos.push(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
        tint.push(1, 1, 1, 0);
        rad.push(r);
      }
    }
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * NT + j, b = (i + 1) * NT + j, c = i * NT + (j + 1) % NT, d = (i + 1) * NT + (j + 1) % NT;
        idx.push(a, c, b, c, d, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 4));
    g.setIndex(idx);
    this.seaRad = rad;
    const m = new THREE.Mesh(g, wash({ color: '#ffffff', color2: '#F2F4F6', tint: true, water: 1, line: 0.15, crease: 0, gran: 0.55, turb: 0.7, lit: 0.3, world: true, noiseScale: 0.03 }));
    m.frustumCulled = false;
    return m;
  }

  // the sea's colours from a bay palette (bay-paint.js): dark under the cliff, paler toward the horizon
  setPalette(P) {
    const t = this.sea.geometry.attributes.tint;
    const near = new THREE.Color(P.seaNear), mid = new THREE.Color(P.seaMid), far = new THREE.Color(P.seaFar), c = new THREE.Color();
    for (let k = 0; k < t.count; k++) {
      const r = this.seaRad[k];
      const f = smooth(60, 380, r), f2 = smooth(380, 1500, r);
      c.copy(near).lerp(mid, f).lerp(far, f2);
      t.setXYZ(k, c.r, c.g, c.b);
    }
    t.needsUpdate = true;
    this.shallowM.uniforms.uColor.value.copy(mid).lerp(far, 0.45);
    this.shallowM.uniforms.uColor2.value.copy(mid).lerp(far, 0.3);
    this.palette = P;
  }

  buildVillage() {
    const sites = villageSites().sort((a, b) => a[1] - b[1]);
    const order = sites.map((_, i) => i).sort((a, b) => noise1(a * 7.3, 2) - noise1(b * 7.3, 2));
    this.windowOrder = order;
    const M = {
      ww: wash({ color: '#F1E6D2', color2: '#E4D6BE', line: 1, crease: 0.6, gran: 0.5, noiseScale: 0.4 }),
      roof: wash({ color: '#4A4458', color2: '#5A5266', line: 1, crease: 0.6, gran: 0.7, noiseScale: 0.4 }),
      pane: wash({ color: '#2C2E3A', line: 0.6, crease: 0.2, gran: 0.2 }),
      door: wash({ color: '#7A3E30', line: 0.8, crease: 0.3, gran: 0.4 }),
    };
    const b = new Builder(77);
    this.windows = [];
    const r = rng(78);
    // what you can't walk through, as circles in world x, z
    this.solids = [];
    sites.forEach(([x, y], i) => {
      // the lane and the slip down to the harbour run between the houses
      if (laneDist(x, y) < 2.0) { this.windows.push(null); return; }
      const big = i === 5 || i === 11 || i === 2;
      const w = (6 + noise1(i, 3) * 3) * (big ? 1.4 : 1), d = 5 + r() * 1.2, h = 3.4 + noise1(i, 4) * 1.4;
      const [wx, wz] = C(x, y);
      let g = Infinity;
      for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) g = Math.min(g, landHeight((wx + ox) / UNIT, (wz + oz) / UNIT));
      g = Math.max(g, 1.2);
      const rot = [0, (r() - 0.5) * 0.25, 0];
      b.box(M.ww, w, h + 1, d, [wx, g + (h - 1) / 2, wz], { rot });
      for (const k of [-0.25, 0.25]) this.solids.push([wx + k * w, wz, d / 2 + 0.4]);
      const pitch = 2.2 + r() * 0.8;
      b.add(new THREE.CylinderGeometry(1, 1, 1, 3), M.roof, { pos: [wx, g + h + pitch / 3 - 0.02, wz], rot: [-Math.PI / 2, Math.PI / 2 + rot[1], 0], scale: [(d / 2 + 0.35) / 0.866, w + 0.5, pitch / 1.5] });
      b.box(M.roof, 0.7, 1.6, 0.7, [wx + w * 0.36, g + h + pitch * 0.55, wz], { rot });
      // the window toward the bay, and the door
      const s = Math.sin(rot[1]), c = Math.cos(rot[1]);
      const fx = wx + s * (d / 2 + 0.03), fz = wz + c * (d / 2 + 0.03);
      const wx2 = fx - c * w * 0.2, wz2 = fz + s * w * 0.2;
      b.box(M.pane, 1.0, 1.1, 0.06, [wx2, g + h * 0.55, wz2], { rot });
      b.box(M.door, 0.9, 1.9, 0.06, [fx + c * w * 0.22, g + 0.95, fz - s * w * 0.22], { rot });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.1), glowMaterial({ emit: 0xffc870, amt: 1.6 }));
      glow.position.set(wx2 + s * 0.06, g + h * 0.55, wz2 + c * 0.06);
      glow.rotation.y = rot[1];
      const halo = billboard(9, 0xe7a846, 0.35);
      halo.position.copy(glow.position);
      // its reflection, where the shore meets the water below
      let sy = y;
      while (sy < y + 12 && landHeight(x, sy) > -0.3) sy += 0.25;
      const refl = waterStreak(3, 40, 0xe7a846, 0.22);
      refl.position.set(wx, 0.35, sy * UNIT);
      this.group.add(glow, halo, refl);
      this.windows.push({ glow, halo, refl });
    });
    const v = b.finish('village');
    this.group.add(v);
  }

  // which windows are lit tonight (by day, none: lit is false)
  setLights(night, lit_ = true) {
    const total = this.windows.length;
    const lit = !lit_ ? 0 : night.lightsCount ? night.lights : Math.round((night.lights ?? 1) * total);
    const on = new Set(this.windowOrder.slice(0, lit));
    this.windows.forEach((w, i) => { if (w) w.glow.visible = w.halo.visible = w.refl.visible = on.has(i); });
  }

  buildPiers() {
    const M = wash({ color: '#6E5A48', color2: '#5E4C3E', line: 1, crease: 0.6, gran: 0.8, noiseScale: 0.6 });
    const b = new Builder(91);
    for (const q of PIERS) {
      const shape = new THREE.Shape(q.map(([x, y]) => new THREE.Vector2(x * UNIT, -y * UNIT)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      b.add(g, M, { pos: [0, 1.6, 0], wonk: 0 });
      // posts down into the water along the long sides
      for (const [a, c] of [[q[0], q[3]], [q[1], q[2]]]) {
        for (let t = 0; t <= 1.001; t += 0.25) {
          const x = lerp(a[0], c[0], t) * UNIT, z = lerp(a[1], c[1], t) * UNIT;
          b.cyl(M, 0.18, 0.2, 5, [x, -0.9, z], { seg: 6 });
        }
      }
    }
    this.group.add(b.finish('piers'));
  }

  buildBeam() {
    const len = 900;
    const cone = new THREE.ConeGeometry(len * Math.tan(2.6 * Math.PI / 180), len, 28, 1, true);
    cone.translate(0, -len / 2, 0);
    cone.rotateX(Math.PI / 2);
    this.beam = new THREE.Group();
    this.beam.position.copy(LAMP);
    this.beam.rotation.order = 'YXZ';
    this.beamCones = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(cone, beamMaterial({ len, amt: i === 0 ? 1 : 0 }));
      m.renderOrder = 6;
      m.frustumCulled = false;
      m.rotation.order = 'YXZ';
      this.beam.add(m);
      this.beamCones.push(m);
    }
    // the light lying on the water along the beam: a long glitter fan
    const fan = new THREE.BufferGeometry();
    const w0 = Math.tan(3.5 * Math.PI / 180);
    const n0 = 40, n1 = 700;
    fan.setAttribute('position', new THREE.Float32BufferAttribute([-n0 * w0, 0, -n0, n0 * w0, 0, -n0, -n1 * w0, 0, -n1, n1 * w0, 0, -n1], 3));
    fan.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    fan.setIndex([0, 2, 1, 1, 2, 3]);
    this.glint = new THREE.Mesh(fan, glowMaterial({ emit: 0xffe2a8, amt: 0.2, map: glintTex() }));
    this.glint.renderOrder = 4;
    this.glint.frustumCulled = false;
    // the lamp itself, burning in the lantern (seen from outside, across the bay)
    this.lampHalo = billboard(9, 0xffe2a8, 0.6);
    this.beam.add(this.lampHalo);
    this.group.add(this.beam, this.glint);
  }

  buildSky() {
    // the moon: a pale disc of paper, a halo, and its road across the water
    this.moon = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(26, 32), wash({ color: '#EFE8D2', color2: '#E2D9BE', lit: 0, line: 0.5, crease: 0, gran: 0.5, fog: 0.5, noiseScale: 0.05 }));
    const glow = billboard(240, 0xb8c0d8, 0.3);
    const core = new THREE.Mesh(new THREE.CircleGeometry(24, 24), glowMaterial({ emit: 0xd8dce8, amt: 0.35 }));
    core.position.z = 0.5;
    this.moon.add(disc, core, glow);
    this.moonDisc = disc;
    this.moonRoad = waterStreak(40, 900, 0xaeb8d4, 0.12);
    this.group.add(this.moon, this.moonRoad);
    this.moon.visible = this.moonRoad.visible = false;
  }

  buildMagMell() {
    // an island in impossible colour, far out on the horizon to the west, for a moment
    const g = this.magMell = new THREE.Group();
    const b = new Builder(55);
    const green = wash({ color: '#7FB35A', color2: '#5E9A48', line: 0.8, crease: 0.4, gran: 0.6, fog: 0.2, lit: 0.4, noiseScale: 0.02 });
    const gold = wash({ color: '#E9C24A', color2: '#F3D46A', line: 0.6, crease: 0.3, gran: 0.4, fog: 0.2, lit: 0.3, noiseScale: 0.03 });
    const pink = wash({ color: '#E8789A', line: 0.3, gran: 0.2, fog: 0.2, lit: 0.2 });
    const hemi = (s) => new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    b.add(hemi(), green, { pos: [0, -2, 0], scale: [170, 46, 70], wonk: 0 });
    b.add(hemi(), gold, { pos: [40, 8, -12], scale: [70, 30, 30], wonk: 0 });
    b.add(hemi(), green, { pos: [-50, 14, -4], scale: [60, 38, 34], wonk: 0 });
    const r = rng(56);
    for (let i = 0; i < 16; i++) b.add(new THREE.SphereGeometry(1, 8, 6), i % 3 ? gold : pink, { pos: [(r() - 0.5) * 220, 30 + r() * 10, 30 + r() * 10], scale: [7, 7, 7], wonk: 0 });
    g.add(b.finish('magmell'));
    const halo = billboard(900, 0xf2c063, 0.5);
    halo.position.set(0, 40, 0);
    g.add(halo);
    this.magHalo = halo;
    // far out on the open horizon, a little right of the window's middle (the north land hides the
    // west, where the chart puts it)
    const yaw = ROOM_YAW - 0.2, D = 1000;
    g.position.set(TOWER.x - Math.sin(yaw) * D, 0, TOWER.z - Math.cos(yaw) * D);
    g.rotation.y = yaw;
    g.visible = false;
    this.group.add(g);
  }

  buildManannan() {
    // a tall shape standing on the water, wrapped in mist; never clear
    const g = this.manannan = new THREE.Group();
    const robe = wash({ color: '#41485A', color2: '#555C6E', line: 0.5, crease: 0.3, gran: 0.6, fogFloor: 0.5, noiseScale: 0.05 });
    const pale = wash({ color: '#B5BBC6', line: 0.2, crease: 0, gran: 0.4, fogFloor: 0.5 });
    this.manM = [robe, pale];
    const prof = [[10, -1], [9, 3], [7.4, 14], [5.6, 26], [4.4, 36], [4.8, 42], [3.6, 45], [1.6, 47], [0.2, 47.2]].map(([r, y]) => new THREE.Vector2(r, y));
    const b = new Builder(66);
    b.add(new THREE.LatheGeometry(prof, 20), robe, { wonk: 0 });
    g.add(b.finish('manannan'));
    const head = this.manHead = new THREE.Group();
    const hb = new Builder(67);
    hb.add(new THREE.SphereGeometry(3.1, 14, 10), robe, { pos: [0, 0, 0.4], scale: [1, 1.25, 1.1], wonk: 0 });
    hb.add(new THREE.SphereGeometry(1.4, 10, 8), pale, { pos: [0, -0.4, -2.2], scale: [1, 1.5, 0.6], wonk: 0 });
    const hm = hb.finish('head'); hm.matrixAutoUpdate = true;
    head.add(hm);
    head.position.set(0, 49, 0);
    g.add(head);
    this.manRefl = new THREE.Mesh(new THREE.CircleGeometry(1, 16), wash({ color: '#2E3446', water: 1, line: 0, crease: 0, lit: 0.3, gran: 0.3 }));
    this.manRefl.rotation.x = -Math.PI / 2;
    this.group.add(this.manRefl);
    const [x, z] = C(33, 25);
    g.position.set(x, 0, z);
    g.visible = this.manRefl.visible = false;
    this.group.add(g);
  }

  // ---------------- per night ----------------
  setNight(night) {
    this.night = night;
    this.tide = TIDE[night.tide] ?? 0;
    this.sea.position.y = this.tide;
    const on = new Set(night.reefs || []);
    for (const [id, R] of Object.entries(this.reefs)) {
      R.group.visible = on.has(id) && id !== 'newrock';
      R.rocks.position.y = 0;
      this.placeReefWater(R);
    }
    this.setLights(night);
    this.clearShips();
    this.magMell.visible = false;
    this.manannan.visible = this.manRefl.visible = false;
    this.phantom?.removeFromParent();
    this.phantom = null;
  }

  placeReefWater(R) {
    const above = R.top + R.rocks.position.y > this.tide + 0.15;
    R.foam.visible = above;
    R.shallow.visible = !above && R.top + R.rocks.position.y > this.tide - 2.2;
    R.foam.position.y = this.tide + 0.3;
    R.shallow.position.y = this.tide + 0.25;
  }

  // a reef rising where there was none (k 0 → 1)
  raiseReef(id, k) {
    const R = this.reefs[id];
    if (!R) return;
    R.group.visible = k > 0;
    R.rocks.position.y = lerp(-3.2, 0, k);
    this.placeReefWater(R);
  }

  clearShips() {
    for (const s of this.ships) { s.group.removeFromParent(); s.refl.removeFromParent(); s.shadow.removeFromParent(); s.wake.removeFromParent(); }
    this.ships = [];
    this.billboards = this.billboards.filter((b) => b.parent && !b.userData.ship);
  }

  // one set of meshes per ship in a fleet (or moored at dawn)
  setShips(list) {
    this.clearShips();
    list.forEach((sh, i) => {
      const s = makeShip(sh, i);
      s.halo.userData.ship = true;
      this.billboards.push(s.halo);
      s.refl = waterStreak(2.6, 26, 0xe9a548, 0.3);
      s.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 14), wash({ color: '#26304A', water: 1, line: 0, crease: 0, lit: 0.3, gran: 0.4 }));
      s.shadow.rotation.x = -Math.PI / 2;
      // the wake: a pale ribbon of light that fades behind
      const N = 32;
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      wg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2 * 2), 2));
      const idx = [];
      for (let k = 0; k < N - 1; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
      wg.setIndex(idx);
      s.wake = new THREE.Mesh(wg, glowMaterial({ emit: 0xa8b4d0, amt: 0.32, vcolor: true }));
      s.wake.frustumCulled = false;
      s.wakeN = N;
      s.wakePts = [];
      this.group.add(s.group, s.refl, s.shadow, s.wake);
      this.ships.push(s);
    });
  }

  // ---------------- per frame ----------------
  // st: { ships: [{ pos, dir, fade, lantern, state, size, refl: [x, y] | null }], fleetT, t,
  //   beam: { angle, amt, reach, haar, blur, spread, hits }, moon: { dir, amt } | null, magMell,
  //   manannan: { a, turn, tt } | null, phantom: { pos, a } | null }
  update(dt, camera, st) {
    const camPos = camera.getWorldPosition(this.camPos);
    const q = camera.getWorldQuaternion(new THREE.Quaternion());
    for (const b of this.billboards) {
      if (!b.parent) continue;
      b.parent.updateWorldMatrix(true, false);
      const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      b.quaternion.copy(pq.multiply(q));
    }
    const towardCam = (x, z) => Math.atan2(camPos.x - x, camPos.z - z);
    const t = st.t || 0;
    // ships
    this.ships.forEach((s, i) => {
      const d = st.ships[i];
      if (!d) return;
      const show = d.state !== 'waiting' && d.fade > 0.01;
      s.group.visible = s.shadow.visible = show;
      s.refl.visible = show && d.lantern > 0.05;
      s.wake.visible = show && d.wake !== false;
      if (!show) return;
      const [wx, wz] = C(d.pos[0], d.pos[1]);
      const bob = Math.sin(t * 1.3 + i * 2.1) * 0.12;
      s.group.position.set(wx, this.tide + bob - (1 - d.fade) * 3, wz);
      const yaw = Math.atan2(-d.dir[0], -d.dir[1]);
      let dy = yaw - s.group.rotation.y; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      s.group.rotation.y += dy * Math.min(1, dt * 3 + (s.placed ? 0 : 1));
      s.placed = true;
      s.group.rotation.z = Math.sin(t * 0.9 + i) * 0.03 + (d.state === 'struck' ? 0.12 : 0);
      s.group.rotation.x = Math.sin(t * 1.1 + i * 1.7) * 0.02 + (d.state === 'struck' ? 0.06 : 0);
      // caught in the beam, the sails and hull light up for a moment
      const hit = (st.beam.hits && st.beam.hits[i]) || 0;
      s.M.sail.uniforms.uEmit.value.setRGB(0.5, 0.42, 0.28).multiplyScalar(hit * 0.6);
      s.M.hull.uniforms.uEmit.value.setRGB(0.4, 0.33, 0.22).multiplyScalar(hit * 0.35);
      s.lantern.material.uniforms.uAmt.value = 2.2 * d.lantern * d.fade;
      s.halo.material.uniforms.uAmt.value = (0.55 * d.lantern + hit * 0.5) * d.fade;
      // its reflection (from where it was a moment ago, on some nights)
      const rp = d.refl || d.pos;
      const [rx, rz] = C(rp[0], rp[1]);
      s.refl.position.set(rx, this.tide + 0.4, rz);
      s.refl.rotation.y = towardCam(rx, rz);
      s.refl.material.uniforms.uAmt.value = 0.3 * d.lantern * d.fade;
      s.shadow.position.set(rx, this.tide + 0.35, rz);
      s.shadow.scale.set(s.S.B * 0.7, s.S.L * 0.7, 1);
      s.shadow.rotation.z = -yaw;
      this.updateWake(s, d, st.fleetT);
    });
    // beam
    const B = st.beam;
    const yaw = B.angle - Math.PI / 2;     // the chart's angle (0 east, anticlockwise) as a turn about y
    this.beam.visible = B.amt > 0.001;
    this.beam.rotation.y = yaw;
    this.beam.rotation.x = -BEAM_DIP;
    this.lampHalo.material.uniforms.uAmt.value = 0.6 * B.amt;
    const blur = B.blur || 0;
    this.beamCones.forEach((c, k) => {
      const u = c.material.uniforms;
      if (k === 0) { u.uAmt.value = B.amt * (1 - blur * 0.35); c.rotation.y = 0; }
      else {
        const f = k / (this.beamCones.length - 1);
        c.rotation.y = -f * B.spread;     // the blur trails behind the turning beam
        u.uAmt.value = B.amt * blur * 0.45 * (1 - f);
      }
      u.uReach.value = B.reach;
    });
    this.glint.visible = this.beam.visible;
    this.glint.position.set(LAMP.x, this.tide + 0.45, LAMP.z);
    this.glint.rotation.y = yaw;
    this.glint.material.uniforms.uAmt.value = B.amt * 0.22 * (1 - B.haar * 0.6);
    // moon
    const M = st.moon;
    this.moon.visible = this.moonRoad.visible = !!M && M.amt > 0.01;
    if (this.moon.visible) {
      this.moon.position.copy(camPos).addScaledVector(M.dir, 1900);
      this.moon.lookAt(camPos);
      this.moonRoad.position.set(this.moon.position.x, this.tide + 0.4, this.moon.position.z);
      // its road comes from under the moon straight to the viewer
      const toward = new THREE.Vector3(camPos.x - this.moon.position.x, 0, camPos.z - this.moon.position.z);
      const dist = toward.length();
      this.moonRoad.position.set(camPos.x - toward.x / dist * Math.min(dist, 1000), this.tide + 0.4, camPos.z - toward.z / dist * Math.min(dist, 1000));
      this.moonRoad.rotation.y = towardCam(this.moonRoad.position.x, this.moonRoad.position.z);
      this.moonRoad.material.uniforms.uAmt.value = 0.14 * M.amt * (1 - (this.night?.haar || 0) * 0.8);
    }
    // Mag Mell
    const mm = st.magMell || 0;
    this.magMell.visible = mm > 0.01;
    if (mm > 0.01) {
      this.magMell.scale.set(1, Math.max(0.05, mm), 1);
      this.magHalo.material.uniforms.uAmt.value = 0.55 * mm;
    }
    // Manannán
    const mn = st.manannan;
    const showM = !!mn && mn.a > 0.01;
    this.manannan.visible = this.manRefl.visible = showM;
    if (showM) {
      for (const m of this.manM) {
        m.uniforms.uFogFloor.value = 1 - mn.a * 0.55;
        m.uniforms.uLine.value = (m === this.manM[0] ? 0.55 : 0.2) * mn.a;
      }
      this.manannan.rotation.y = towardCam(this.manannan.position.x, this.manannan.position.z);
      this.manHead.rotation.y = mn.turn * 0.9;
      const p = this.manannan.position;
      this.manRefl.position.set(p.x, this.tide + 0.35, p.z);
      this.manRefl.rotation.z = -towardCam(p.x, p.z);
      this.manRefl.scale.set(9 * mn.a, 46 * mn.a, 1);
    }
    // a reflection with no boat above it
    if (st.phantom && !this.phantom) {
      this.phantom = waterStreak(2.6, 26, 0xe9a548, 0.3);
      this.group.add(this.phantom);
    }
    if (this.phantom) {
      const ph = st.phantom;
      this.phantom.visible = !!ph && ph.a > 0.01;
      if (ph) {
        const [x, z] = C(ph.pos[0], ph.pos[1]);
        this.phantom.position.set(x, this.tide + 0.4, z);
        this.phantom.rotation.y = towardCam(x, z);
        this.phantom.material.uniforms.uAmt.value = 0.3 * ph.a;
      }
    }
  }

  updateWake(s, d, ft) {
    const pts = s.wakePts;
    const last = pts[pts.length - 1];
    if (d.state === 'sailing' || d.state === 'gliding') {
      if (!last || Math.hypot(d.pos[0] - last[0], d.pos[1] - last[1]) > 0.5) {
        pts.push([d.pos[0], d.pos[1], ft]);
        if (pts.length > s.wakeN) pts.shift();
      }
    }
    const P = s.wake.geometry.attributes.position, Cl = s.wake.geometry.attributes.color;
    const N = s.wakeN;
    const life = 30;
    for (let k = 0; k < N; k++) {
      const p = pts[Math.max(0, pts.length - 1 - k)] || [d.pos[0], d.pos[1], ft];
      const q = pts[Math.max(0, pts.length - 2 - k)] || p;
      const age = k === 0 ? 0 : ft - p[2];
      const w = (1.0 + age * 0.35) * (d.size === 'large' ? 1.5 : 1);
      let dx = p[0] - q[0], dy = p[1] - q[1];
      const L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;
      const [x, z] = k === 0 ? C(d.pos[0], d.pos[1]) : C(p[0], p[1]);
      const nx = -dy * w, nz = dx * w;
      P.setXYZ(k * 2, x + nx, this.tide + 0.45, z + nz);
      P.setXYZ(k * 2 + 1, x - nx, this.tide + 0.45, z - nz);
      const a = k >= pts.length ? 0 : Math.max(0, 1 - age / life) * d.fade * (k === 0 ? 0.3 : 1);
      Cl.setXYZ(k * 2, a, a, a); Cl.setXYZ(k * 2 + 1, a, a, a);
    }
    P.needsUpdate = true; Cl.needsUpdate = true;
  }
}
