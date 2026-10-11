// Building static scenery: pieces are collected per material and merged into one frozen mesh each,
// so a room is a handful of draw calls. Pieces get a slight hand-made irregularity (nothing is quite
// square), which the ink edges then pick up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../render/paint.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Builder {
  constructor(seed = 1) {
    this.parts = new Map();   // material → [geometry]
    this.r = rng(seed);
  }

  // Add a geometry with a transform. `wonk` tilts and scales it a touch at random.
  add(geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], wonk = 0.6 } = {}) {
    const r = this.r;
    const w = wonk * 0.012;
    // yaw last: pieces are rolled/pitched in their own frame, then turned into place
    _e.set(rot[0] + (r() - 0.5) * w, rot[1] + (r() - 0.5) * w * 1.5, rot[2] + (r() - 0.5) * w, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(scale[0] * (1 + (r() - 0.5) * w), scale[1] * (1 + (r() - 0.5) * w), scale[2] * (1 + (r() - 0.5) * w));
    _p.set(pos[0], pos[1], pos[2]);
    _m.compose(_p, _q, _s);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }

  box(mat, w, h, d, pos, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.uvScale) scaleBoxUv(g, w, h, d, o.uvScale);
    return this.add(g, mat, { pos, ...o });
  }

  cyl(mat, rt, rb, h, pos, o = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16, 1, !!o.open), mat, { pos, ...o });
  }

  // Merge everything into one mesh per material, frozen in place.
  finish(name = 'static') {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    group.matrixAutoUpdate = false;
    return group;
  }
}

// Box UVs in metres (so painted textures keep their scale on any size of plank).
function scaleBoxUv(g, w, h, d, k) {
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w, sy = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * sx * k, uv.getY(i) * sy * k);
  }
}

// Polar placement in a round room: angle in degrees clockwise from -Z (seen from above), radius r.
export function polar(deg, r) {
  const a = THREE.MathUtils.degToRad(deg);
  return [Math.sin(a) * r, -Math.cos(a) * r];
}
// rotation.y that turns a piece's -Z to face outward along `deg` (its +Z then faces the centre)
export function facing(deg) { return -THREE.MathUtils.degToRad(deg); }
