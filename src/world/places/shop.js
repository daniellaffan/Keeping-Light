// Nora's shop in Port na Rón: a whitewashed house with a painted shopfront, its door standing open.
// The front is real (the window, the door, the bell over it, the fascia board lettered "N. Ó Sé,
// Grocer"); inside there is just enough to be seen through them: the counter, the shelves on the back
// wall, and the dark doorway to the back room. The shelves are stocked until the village is gone.
//
// Built facing +z in its own frame (the door side), then turned to face the lane. The interior is
// painted flat and dark (lit 0), since nothing in the world casts shadows: it reads as shade, and
// whoever stands in the doorway stands out against it.
import * as THREE from 'three';
import { Builder } from '../build.js';
import { wash } from '../materials.js';
import { letteringTex } from '../textures.js';
import { letter } from '../../render/hand.js';
import { rng } from '../../render/paint.js';
import { UNIT } from '../geo.js';

// the house in its own frame: x across the front, z out of the door, y up from the shop floor
const W = 7, D = 5, H = 3.4, T = 0.25;
const FRONT = D / 2;
const DOOR = { x0: 0.8, x1: 1.9, top: 2.15 };
const WIN = { x0: -2.9, x1: -0.3, sill: 0.85, top: 2.15 };
const FLOOR = 0.12;

function mats() {
  return {
    ww: wash({ color: '#F1E6D2', color2: '#E4D6BE', line: 1, crease: 0.6, gran: 0.5, noiseScale: 0.6 }),
    roof: wash({ color: '#4A4458', color2: '#5A5266', line: 1, crease: 0.6, gran: 0.7, noiseScale: 0.6 }),
    paint: wash({ color: '#6E2E28', color2: '#7E3A30', line: 1, crease: 0.6, gran: 0.5, noiseScale: 2.5 }),
    step: wash({ color: '#A49C8E', color2: '#948C80', line: 1, crease: 0.7, gran: 0.9, noiseScale: 2 }),
    wood: wash({ color: '#8A7058', color2: '#7A624C', line: 1, crease: 0.6, gran: 0.6, noiseScale: 3 }),
    brass: wash({ color: '#B08A3E', color2: '#9A7632', line: 0.9, crease: 0.5, gran: 0.3, noiseScale: 8, band: 0.4 }),
    // inside: flat and in shade
    wall: wash({ color: '#6E6254', color2: '#62574A', line: 0.8, crease: 0.5, gran: 0.5, noiseScale: 1.5, lit: 0.25, bare: 0 }),
    dark: wash({ color: '#3A322C', color2: '#332B26', line: 0.8, crease: 0.4, gran: 0.5, noiseScale: 1.5, lit: 0.15, bare: 0 }),
    counter: wash({ color: '#5E4434', color2: '#523A2C', line: 1, crease: 0.6, gran: 0.6, noiseScale: 3, lit: 0.45, bare: 0 }),
    shelf: wash({ color: '#5A4636', color2: '#4E3C2E', line: 1, crease: 0.6, gran: 0.6, noiseScale: 3, lit: 0.35, bare: 0 }),
  };
}

// the fascia board: the name in a signwriter's serif, dark on cream
function fascia() {
  const tex = letteringTex('sign:shop-o-se', 2048, 256, (ctx, w, h) => {
    letter(ctx, 'N. Ó Sé, Grocer', w / 2, 168, { hand: 'serif', size: 150, align: 'center', color: '#4A1E1A' });
  });
  return wash({ color: '#E6DCC4', color2: '#D8CCB0', line: 1, crease: 0.4, gran: 0.4, inkMap: tex, noiseScale: 4 });
}

// goods on the shelves: tins, jars, packets, in the 2D shop's colours, gone a little grey
const GOODS = ['#B8483A', '#3E6A8A', '#D8B04A', '#5E7E4A', '#E8E0CE', '#8A5A7A'].map((c) =>
  wash({ color: new THREE.Color(c).lerp(new THREE.Color('#8A7E6E'), 0.45), line: 0.7, crease: 0.4, gran: 0.4, noiseScale: 6, lit: 0.45, bare: 0 }));

export function buildShop(scene, { at, face }) {
  const m = mats();
  const p = scene.at(at[0], at[1]);
  const yaw = Math.atan2(face.x - p.x, face.z - p.z);
  // the floor sits on the highest ground under the house (the street slopes); the walls go down into
  // it, and the step down to the lane is as deep as it needs to be
  const ground = (x, z) => { const v = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(p); return scene.at(v.x / UNIT, v.z / UNIT).y; };
  let top = -Infinity;
  for (const x of [-W / 2, 0, W / 2]) for (const z of [-D / 2, 0, D / 2]) top = Math.max(top, ground(x, z));
  const sink = top - Math.min(ground((DOOR.x0 + DOOR.x1) / 2, FRONT + 0.5), ground(-W / 2, D / 2), ground(W / 2, D / 2));
  p.y = top + 0.02;
  const root = new THREE.Group();
  root.name = 'shop';
  root.position.copy(p);
  root.rotation.y = yaw;
  scene.group.add(root);

  // ---- the walls: whitewash outside, a dark lining in, the front open at the window and the door ----
  const b = new Builder(731);
  const B = -1 - sink;
  const wall = (x0, x1, y0, y1, z, mat = m.ww) => b.box(mat, x1 - x0, y1 - y0, T, [(x0 + x1) / 2, (y0 + y1) / 2, z], { wonk: 0.3 });
  const zf = FRONT - T / 2;
  wall(-W / 2, WIN.x0, B, H, zf);
  wall(WIN.x1, DOOR.x0, B, H, zf);
  wall(DOOR.x1, W / 2, B, H, zf);
  wall(WIN.x0, WIN.x1, B, WIN.sill, zf);
  wall(WIN.x0, DOOR.x1, WIN.top, H, zf);
  b.box(m.ww, W, H - B, T, [0, (H + B) / 2, -FRONT + T / 2], { wonk: 0.3 });
  for (const s of [-1, 1]) b.box(m.ww, T, H - B, D - 2 * T, [s * (W / 2 - T / 2), (H + B) / 2, 0], { wonk: 0.3 });
  // the roof, slate, and a chimney at the gable away from the door
  b.add(new THREE.CylinderGeometry(1, 1, 1, 3), m.roof, { pos: [0, H + 0.55, 0], rot: [-Math.PI / 2, Math.PI / 2, 0], scale: [(D / 2 + 0.3) / 0.866, W + 0.4, 1.1] });
  b.box(m.roof, 0.7, 1.5, 0.7, [-W / 2 + 0.7, H + 0.9, 0]);
  // a stone step at the door
  const stepH = FLOOR + sink + 0.3;
  b.box(m.step, DOOR.x1 - DOOR.x0 + 0.3, stepH, 0.45, [(DOOR.x0 + DOOR.x1) / 2, FLOOR - stepH / 2, FRONT + 0.2], { wonk: 2 });
  // inside: the lining, the floor and the ceiling
  const IW = W - 2 * T, ID = D - 2 * T;
  b.box(m.wall, IW, H, 0.02, [0, H / 2, -FRONT + T + 0.01]);
  for (const s of [-1, 1]) b.box(m.wall, 0.02, H, ID, [s * (IW / 2 - 0.01), H / 2, 0]);
  b.box(m.dark, IW, 0.1, ID, [0, FLOOR - 0.05, 0]);
  b.box(m.dark, IW, 0.06, ID, [0, H - 0.03, 0]);
  // the back room: a doorway in the back wall, dark beyond
  b.box(m.dark, 0.95, 2.0, 0.02, [2.3, FLOOR + 1.0, -FRONT + T + 0.025]);
  root.add(b.finish('shop'));

  // ---- the shopfront: painted pilasters, the window's frame and bars, the fascia board ----
  const f = new Builder(733);
  const zp = FRONT + 0.04;
  for (const x of [WIN.x0 - 0.12, (WIN.x1 + DOOR.x0) / 2, DOOR.x1 + 0.12]) f.box(m.paint, 0.2, 2.3, 0.1, [x, 1.15, zp]);
  f.box(m.paint, 5.4, 0.12, 0.16, [(WIN.x0 + DOOR.x1) / 2, 2.25, zp + 0.02]);
  f.box(m.paint, 5.4, 0.1, 0.16, [(WIN.x0 + DOOR.x1) / 2, 2.98, zp + 0.02]);
  // the window: a sill, the frame, two bars across and three up
  f.box(m.paint, WIN.x1 - WIN.x0 + 0.1, 0.08, 0.28, [(WIN.x0 + WIN.x1) / 2, WIN.sill, FRONT - 0.04]);
  f.box(m.paint, WIN.x1 - WIN.x0, 0.06, 0.06, [(WIN.x0 + WIN.x1) / 2, WIN.top - 0.03, FRONT - 0.12]);
  for (const x of [WIN.x0 + 0.03, WIN.x1 - 0.03]) f.box(m.paint, 0.06, WIN.top - WIN.sill, 0.06, [x, (WIN.sill + WIN.top) / 2, FRONT - 0.12]);
  for (let i = 1; i < 4; i++) f.box(m.paint, 0.035, WIN.top - WIN.sill, 0.035, [WIN.x0 + (WIN.x1 - WIN.x0) * i / 4, (WIN.sill + WIN.top) / 2, FRONT - 0.12]);
  f.box(m.paint, WIN.x1 - WIN.x0, 0.035, 0.035, [(WIN.x0 + WIN.x1) / 2, 1.72, FRONT - 0.12]);
  // the door frame
  for (const x of [DOOR.x0 - 0.04, DOOR.x1 + 0.04]) f.box(m.paint, 0.08, DOOR.top, 0.3, [x, DOOR.top / 2, FRONT - T / 2]);
  f.box(m.paint, DOOR.x1 - DOOR.x0 + 0.16, 0.08, 0.3, [(DOOR.x0 + DOOR.x1) / 2, DOOR.top, FRONT - T / 2]);
  // the door itself, open into the shop against the wall on its hinge side
  const dw = DOOR.x1 - DOOR.x0 - 0.04, hinge = [DOOR.x1 - 0.03, FRONT - T - 0.03], open = 1.75;
  const dc = [hinge[0] - Math.cos(open) * dw / 2, hinge[1] - Math.sin(open) * dw / 2];
  f.box(m.paint, dw, DOOR.top - FLOOR - 0.04, 0.05, [dc[0], (DOOR.top + FLOOR) / 2, dc[1]], { rot: [0, -open, 0] });
  // the bench under the window, where Tadhg sits mending
  f.box(m.wood, 1.7, 0.06, 0.38, [(WIN.x0 + WIN.x1) / 2, 0.45, FRONT + 0.35]);
  for (const x of [-0.7, 0.7]) f.box(m.wood, 0.08, 0.45, 0.32, [(WIN.x0 + WIN.x1) / 2 + x, 0.22, FRONT + 0.35]);
  root.add(f.finish('shopfront'));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 0.62), fascia());
  board.position.set((WIN.x0 + DOOR.x1) / 2, 2.615, zp + 0.075);
  root.add(board);

  // ---- inside: the counter, the shelves, and what's on them ----
  const c = new Builder(735);
  c.box(m.counter, 3.6, 0.92, 0.5, [-1.45, FLOOR + 0.46, 0.05]);
  c.box(m.counter, 3.75, 0.05, 0.62, [-1.45, FLOOR + 0.945, 0.05]);
  const SHELF = { x0: -3.15, x1: 1.5, z: -FRONT + T + 0.17 };
  for (const y of [0.95, 1.4, 1.85, 2.3]) c.box(m.shelf, SHELF.x1 - SHELF.x0, 0.04, 0.32, [(SHELF.x0 + SHELF.x1) / 2, y, SHELF.z]);
  for (const x of [SHELF.x0, -0.85, SHELF.x1]) c.box(m.shelf, 0.05, 1.9, 0.32, [x, 1.5, SHELF.z]);
  // in the window: a few jars on a low shelf
  c.box(m.shelf, WIN.x1 - WIN.x0 - 0.2, 0.04, 0.3, [(WIN.x0 + WIN.x1) / 2, WIN.sill + 0.02, FRONT - T - 0.2]);
  root.add(c.finish('shop-inside'));
  const goods = new Builder(737), r = rng(738);
  for (const y of [0.97, 1.42, 1.87, 2.32]) {
    for (let x = SHELF.x0 + 0.12; x < SHELF.x1 - 0.1; x += 0.13 + r() * 0.12) {
      if (Math.abs(x + 0.85) < 0.08 || r() < 0.22) continue;
      const h = 0.12 + r() * 0.16, w = 0.08 + r() * 0.07, mat = GOODS[Math.floor(r() * GOODS.length)];
      if (r() < 0.4) goods.cyl(mat, w / 2, w / 2, h, [x, y + h / 2, SHELF.z + (r() - 0.5) * 0.1], { seg: 8 });
      else goods.box(mat, w, h, 0.1 + r() * 0.08, [x, y + h / 2, SHELF.z + (r() - 0.5) * 0.08], { wonk: 3 });
    }
  }
  for (let x = WIN.x0 + 0.3; x < WIN.x1 - 0.2; x += 0.42) {
    goods.cyl(GOODS[Math.floor(r() * GOODS.length)], 0.07, 0.07, 0.24, [x, WIN.sill + 0.16, FRONT - T - 0.2], { seg: 8 });
  }
  // the bread and the paper bags on the counter
  goods.add(new THREE.SphereGeometry(0.13, 10, 6), GOODS[2], { pos: [-0.6, FLOOR + 1.02, 0.1], scale: [1.3, 0.55, 0.9], wonk: 3 });
  goods.box(GOODS[4], 0.18, 0.26, 0.12, [-1.1, FLOOR + 1.1, 0.0], { wonk: 4 });
  const stock = goods.finish('shop-goods');
  root.add(stock);

  // ---- the bell over the door, on a curl of iron: it swings when someone comes to the door ----
  const bellAt = new THREE.Vector3((DOOR.x0 + DOOR.x1) / 2, DOOR.top - 0.06, FRONT - T - 0.12);
  const bb = new Builder(739);
  bb.box(m.dark, 0.03, 0.03, 0.16, [bellAt.x, bellAt.y + 0.04, bellAt.z + 0.07]);
  bb.box(m.dark, 0.012, 0.05, 0.012, [bellAt.x, bellAt.y + 0.015, bellAt.z]);
  root.add(bb.finish('bell-bracket'));
  const bell = new THREE.Group();
  bell.position.copy(bellAt);
  const bl = new Builder(740);
  bl.add(new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.03, -0.01), new THREE.Vector2(0.045, -0.06), new THREE.Vector2(0.06, -0.1), new THREE.Vector2(0.055, -0.105)], 12), m.brass, { wonk: 0 });
  bell.add(bl.finish('bell'));
  root.add(bell);

  // what you can't walk through: the house, the bench, the step
  const at3 = (x, z) => new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(p);
  for (const x of [-2.25, 0, 2.25]) scene.solid(at3(x, 0), D / 2 + 0.35);
  scene.solid(at3((WIN.x0 + WIN.x1) / 2, FRONT + 0.35), 0.75);

  const swing = { a: 0, v: 0 };
  return {
    root, stock, bell,
    floor: FLOOR,
    yaw,
    // a point in the shop's frame (x across, z out of the door, y up from the floor) in world space
    world: (x, y, z) => new THREE.Vector3(x, y + FLOOR, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(p),
    spots: {
      door: [(DOOR.x0 + DOOR.x1) / 2, FRONT - T - 0.2],     // just inside, framed by the doorway
      counter: [-1.0, -0.62],                            // behind the counter, seen through the window
    },
    ring() { swing.v = 7; },
    // the shelves are bare once the village has gone
    setNight(n) { stock.visible = n.id < 13; },
    update(dt) {
      // a damped pendulum, a few quick swings and still
      swing.v += (-90 * swing.a - 1.6 * swing.v) * dt;
      swing.a += swing.v * dt;
      bell.rotation.x = swing.a * 0.5;
    },
  };
}
