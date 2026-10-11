// What the placeholder places are made of: greybox blocks in a pale wash, and a painted sign on a post
// giving the place's name. Each place file (village.js, harbour.js, ...) builds itself from these.
//
// A place file's build(scene) gets:
//   scene.group          add meshes here
//   scene.at(x, y, up)   a chart point as a world Vector3, standing on the ground (+ up metres)
//   scene.solid(at, r)   something you can't walk through: a circle of r metres about a world point
import * as THREE from 'three';
import { Builder } from '../build.js';
import { wash } from '../materials.js';
import { letteringTex } from '../textures.js';
import { letter } from '../../render/hand.js';

let M = null;
function mats() {
  if (M) return M;
  M = {
    grey: wash({ color: '#C9C6BE', color2: '#BDB9B0', line: 1, crease: 0.7, gran: 0.4, noiseScale: 0.5 }),
    roof: wash({ color: '#8E8C88', color2: '#7F7D7A', line: 1, crease: 0.7, gran: 0.5, noiseScale: 0.5 }),
    post: wash({ color: '#7A6450', color2: '#6A5644', line: 1, crease: 0.6, gran: 0.6, noiseScale: 3 }),
  };
  return M;
}

// a block with a pitched roof, its door side toward `face` (a world point), standing on the ground
export function greybox(scene, { at, w = 6, d = 5, h = 3, face = null, yaw = 0, roof = true, door = roof, solid = true }) {
  const m = mats();
  const p = scene.at(at[0], at[1]);
  if (face) yaw = Math.atan2(face.x - p.x, face.z - p.z);
  const b = new Builder(Math.round(at[0] * 13 + at[1] * 7));
  // sunk a little, so it sits on a slope
  b.box(m.grey, w, h + 1, d, [0, (h - 1) / 2, 0]);
  if (roof) b.add(new THREE.CylinderGeometry(1, 1, 1, 3), m.roof, { pos: [0, h + 0.55, 0], rot: [-Math.PI / 2, Math.PI / 2, 0], scale: [(d / 2 + 0.3) / 0.866, w + 0.4, 1.1] });
  // a dark doorway on the face
  if (door) b.box(m.roof, 1.0, 2.0, 0.06, [w * 0.18, 1.0, d / 2 + 0.02]);
  const g = b.finish('greybox');
  g.position.copy(p);
  g.rotation.y = yaw;
  g.matrixAutoUpdate = true;
  scene.group.add(g);
  if (solid) {
    const r = Math.min(w, d) / 2 + 0.35;
    const n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d)));
    const along = new THREE.Vector3(w >= d ? 1 : 0, 0, w >= d ? 0 : 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const len = Math.max(w, d) - Math.min(w, d);
    for (let i = 0; i < n; i++) scene.solid(p.clone().addScaledVector(along, n > 1 ? (i / (n - 1) - 0.5) * len : 0), r);
  }
  return g;
}

// a sign on a post: the place's name in the keeper's hand, and what's there in pencil underneath
export function sign(scene, { at, title, sub = '', face = null, yaw = 0 }) {
  const m = mats();
  const p = scene.at(at[0], at[1]);
  if (face) yaw = Math.atan2(face.x - p.x, face.z - p.z);
  const tex = letteringTex('sign:' + title, 512, 256, (ctx, w, h) => {
    letter(ctx, title, w / 2, 118, { hand: 'keeper', size: 76, align: 'center', color: '#1E1A16' });
    if (sub) letter(ctx, sub, w / 2, 196, { hand: 'pencil', size: 44, align: 'center', color: '#2E2A26', alpha: 0.85 });
  });
  const board = wash({ color: '#E6DCC4', color2: '#D8CCB0', line: 1, crease: 0.4, gran: 0.4, inkMap: tex, noiseScale: 4 });
  const g = new THREE.Group();
  const b = new Builder(title.length * 17);
  b.box(m.post, 0.1, 1.9, 0.1, [-0.62, 0.95, -0.04]);
  b.box(m.post, 0.1, 1.9, 0.1, [0.62, 0.95, -0.04]);
  g.add(b.finish('sign-posts'));
  const face_ = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), board);
  face_.position.set(0, 1.45, 0.02);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.8, 0.04), m.post);
  back.position.set(0, 1.45, -0.01);
  g.add(back, face_);
  g.position.copy(p);
  g.rotation.y = yaw;
  scene.group.add(g);
  scene.solid(p, 0.5);
  return g;
}
