// The watch room: the round base of the tower. Window over the bay, the door out to the headland,
// spiral stairs up the wall to the lamp, the table with the logbook, a chair at the window, the stove,
// a wall clock, shelves of old logbooks and the brass lamp control.
// Local space: origin at the floor centre, -Z out through the window toward the bay.
import * as THREE from 'three';
import { Builder, polar, facing } from './build.js';
import { wash, glowMaterial } from './materials.js';
import { woodTex, plasterTex, knitTex, letteringTex } from './textures.js';
import { rng } from '../render/paint.js';
import { letter } from '../render/hand.js';

export const ROOM = {
  R: 3.4,              // inner radius
  H: 3.3,              // ceiling
  wall: 0.6,
  window: { deg: 0, half: 0.56, sill: 0.82, top: 2.15 },
  door: { deg: 100, half: 0.48, top: 2.05 },
  stairs: { from: 135, step: 12, rise: 0.22, count: 14, r0: 2.3 },
  table: { deg: 330, r: 2.9, w: 1.34, d: 0.76, h: 0.76 },
  chair: { deg: 0, r: 2.75 },
  stove: { deg: 52, r: 2.75 },
  control: { deg: 309, h: 1.22 },
  clock: { deg: 346, h: 2.25 },
};

const DEG = Math.PI / 180;

export function buildRoom() {
  const M = {
    plaster: wash({ color: '#E7DDC7', color2: '#DACDB2', map: plasterTex(), line: 0.9, crease: 0.35, gran: 0.35, noiseScale: 0.9 }),
    floor: wash({ color: '#B89670', color2: '#A8845E', map: woodTex(4), line: 0.6, crease: 0.4, gran: 0.55, noiseScale: 0.9 }),
    ceil: wash({ color: '#9C7C5A', color2: '#8A6B4C', map: woodTex(6), line: 0.8, crease: 0.5, gran: 0.6 }),
    oak: wash({ color: '#A58058', color2: '#946F4A', map: woodTex(3), line: 1, crease: 0.65, gran: 0.6, noiseScale: 1.5 }),
    pine: wash({ color: '#C0A27A', color2: '#B08F66', map: woodTex(8), line: 1, crease: 0.6, gran: 0.5, noiseScale: 1.5 }),
    iron: wash({ color: '#4A4744', color2: '#3A3836', line: 1, crease: 0.8, gran: 1, noiseScale: 3 }),
    brass: wash({ color: '#CDA75A', color2: '#B38A44', line: 1, crease: 0.7, gran: 0.35, noiseScale: 4 }),
    stone: wash({ color: '#CFC5B2', color2: '#C2B69F', map: plasterTex(9), line: 0.9, crease: 0.5, gran: 0.7 }),
    rug: wash({ color: '#9A4A3A', color2: '#7E3C34', map: knitTex(17), line: 0.7, crease: 0.3, gran: 1, noiseScale: 2 }),
    cushion: wash({ color: '#6E7A60', color2: '#5E6A55', map: knitTex(21), line: 1, crease: 0.5, gran: 0.9, noiseScale: 3 }),
    coat: wash({ color: '#C9A23E', color2: '#B48E36', line: 1, crease: 0.7, gran: 0.6, noiseScale: 2 }),
    glass: wash({ color: '#DCE3DE', color2: '#C8D2CF', line: 0.7, crease: 0.2, gran: 0.1, noiseScale: 6 }),
  };
  const b = new Builder(7);
  const { R, H } = ROOM;

  // ---- floor, rug, ceiling ----
  const floor = new THREE.CircleGeometry(R + 0.05, 64);
  planarUv(floor, 0.8);
  b.add(floor, M.floor, { rot: [-Math.PI / 2, 0, 0], wonk: 0 });
  const rug = new THREE.CylinderGeometry(1.0, 1.0, 0.012, 40);
  b.add(rug, M.rug, { pos: [0.4, 0.006, -0.6], scale: [1.25, 1, 0.85], wonk: 0 });

  const st = ROOM.stairs;
  const holeA0 = st.from + st.step * (st.count - 4), holeA1 = st.from + st.step * (st.count + 1.2);
  const ceil = new THREE.Shape();
  ceil.absarc(0, 0, R + 0.05, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  // the shape lies in xy and is turned flat so shape +y → room +z
  const hp = (deg, r) => polar(deg, r);
  hole.moveTo(...hp(holeA0, st.r0 - 0.05));
  for (let a = holeA0; a <= holeA1; a += 4) hole.lineTo(...hp(a, R + 0.02));
  for (let a = holeA1; a >= holeA0; a -= 4) hole.lineTo(...hp(a, st.r0 - 0.05));
  ceil.holes.push(hole);
  const cg = new THREE.ShapeGeometry(ceil, 48);
  planarUv(cg, 0.8, true);
  b.add(cg, M.ceil, { pos: [0, H, 0], rot: [Math.PI / 2, 0, 0], wonk: 0 });
  // beams
  for (const x of [-1.2, 1.25]) b.box(M.oak, 0.16, 0.2, 2 * Math.sqrt(R * R - x * x), [x, H - 0.1, 0], { uvScale: 1 });

  // ---- walls: curved plaster, broken by the window and the door ----
  const w = ROOM.window, d = ROOM.door;
  const wa = Math.asin(w.half / R) / DEG, da = Math.asin(d.half / R) / DEG;
  wallArc(b, M.plaster, w.deg + wa, d.deg - da, 0, H);
  wallArc(b, M.plaster, d.deg + da, 360 + w.deg - wa, 0, H);
  wallArc(b, M.plaster, w.deg - wa, w.deg + wa, 0, w.sill);
  wallArc(b, M.plaster, w.deg - wa, w.deg + wa, w.top, H);
  wallArc(b, M.plaster, d.deg - da, d.deg + da, d.top, H);
  // a dado of darker limewash round the bottom, where boots scuff it
  const dado = wash({ color: '#C9B996', color2: '#BBA986', map: plasterTex(3), line: 0.6, crease: 0.3, gran: 0.5 });
  wallArc(b, dado, w.deg + wa, d.deg - da, 0, 0.5, R - 0.008);
  wallArc(b, dado, d.deg + da, 360 + w.deg - wa, 0, 0.5, R - 0.008);
  // the outer face of the tower (seen through the window reveal and from outside)
  const RO = R + ROOM.wall;
  const wo = Math.asin(w.half / RO) / DEG, dO = Math.asin(d.half / RO) / DEG;
  wallArc(b, M.stone, w.deg + wo, d.deg - dO, -0.4, H + 0.6, RO, false);
  wallArc(b, M.stone, d.deg + dO, 360 + w.deg - wo, -0.4, H + 0.6, RO, false);
  wallArc(b, M.stone, w.deg - wo, w.deg + wo, -0.4, w.sill, RO, false);
  wallArc(b, M.stone, w.deg - wo, w.deg + wo, w.top, H + 0.6, RO, false);
  wallArc(b, M.stone, d.deg - dO, d.deg + dO, d.top, H + 0.6, RO, false);

  // window reveal, sill, frame and glazing bars
  reveal(b, M.stone, w.deg, w.half, w.sill, w.top);
  const [sx, sz] = polar(w.deg, R + 0.12);
  b.box(M.pine, w.half * 2 + 0.24, 0.05, 0.62, [sx, w.sill + 0.025, sz], { rot: [0, facing(w.deg), 0], uvScale: 1 });
  const [fx, fz] = polar(w.deg, R + 0.42);
  const frameRot = [0, facing(w.deg), 0];
  const fh = w.top - w.sill, fy = w.sill + fh / 2;
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.07, fh, 0.08), M.pine, { pos: offset(fx, fz, w.deg, s * (w.half - 0.035), fy), rot: frameRot });
  b.add(new THREE.BoxGeometry(w.half * 2, 0.07, 0.08), M.pine, { pos: [fx, w.top - 0.035, fz], rot: frameRot });
  b.add(new THREE.BoxGeometry(w.half * 2, 0.08, 0.1), M.pine, { pos: [fx, w.sill + 0.04, fz], rot: frameRot });
  b.add(new THREE.BoxGeometry(0.035, fh, 0.04), M.pine, { pos: [fx, fy, fz], rot: frameRot });
  for (const k of [1 / 3, 2 / 3]) b.add(new THREE.BoxGeometry(w.half * 2, 0.03, 0.04), M.pine, { pos: [fx, w.sill + fh * k, fz], rot: frameRot });

  // door reveal and the door itself, shut
  reveal(b, M.stone, d.deg, d.half, 0, d.top);
  const [dx, dz] = polar(d.deg, R + 0.36);
  const dRot = [0, facing(d.deg), 0];
  for (let i = 0; i < 5; i++) {
    const off = -d.half + 0.1 + i * (d.half * 2 - 0.2) / 4;
    b.add(new THREE.BoxGeometry((d.half * 2) / 5 + 0.004, d.top - 0.02, 0.05), M.oak, { pos: offset(dx, dz, d.deg, off, (d.top - 0.02) / 2), rot: dRot });
  }
  for (const y of [0.35, 1.7]) b.add(new THREE.BoxGeometry(d.half * 2 - 0.08, 0.06, 0.03), M.iron, { pos: offset(...polar(d.deg, R + 0.33), d.deg, 0, y), rot: dRot });
  const ring = new THREE.TorusGeometry(0.06, 0.012, 6, 16);
  b.add(ring, M.iron, { pos: offset(...polar(d.deg, R + 0.32), d.deg, d.half - 0.2, 1.0), rot: [0, facing(d.deg), 0] });
  // oilskin on a peg by the door
  const [px, pz] = polar(d.deg + 16, R - 0.12);
  b.cyl(M.oak, 0.02, 0.02, 0.12, [px, 1.75, pz], { rot: [Math.PI / 2, 0, 0], seg: 6 });
  b.add(new THREE.CylinderGeometry(0.12, 0.28, 1.0, 10, 1, false), M.coat, { pos: [px * 0.97, 1.25, pz * 0.97], wonk: 3 });

  // ---- spiral stairs up the wall ----
  const stairRail = [];
  for (let i = 0; i < st.count; i++) {
    const a = st.from + i * st.step;
    const y = (i + 1) * st.rise;
    const rm = (st.r0 + R) / 2;
    const [tx, tz] = polar(a, rm);
    b.add(new THREE.BoxGeometry(0.34, 0.06, R - st.r0 + 0.05), M.oak, { pos: [tx, y, tz], rot: [0, facing(a), 0], wonk: 1.4 });
    // riser below each tread, set back
    const [rx, rz] = polar(a - st.step * 0.42, rm);
    b.add(new THREE.BoxGeometry(0.03, st.rise - 0.06, R - st.r0), M.oak, { pos: [rx, y - st.rise / 2, rz], rot: [0, facing(a - st.step * 0.42) + Math.PI / 2, 0], scale: [1, 1, 1] });
    // baluster at the inner end
    const [bx, bz] = polar(a, st.r0 + 0.05);
    b.cyl(M.iron, 0.012, 0.012, 0.9, [bx, y + 0.45, bz], { seg: 6 });
    stairRail.push(new THREE.Vector3(bx, y + 0.9, bz));
  }
  const rail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stairRail), 64, 0.022, 6, false);
  b.add(rail, M.iron, { wonk: 0 });

  // ---- the table, under the top of the stairs ----
  const T = ROOM.table;
  const [tx, tz] = polar(T.deg, T.r);
  const tRot = facing(T.deg);
  const table = new THREE.Group();
  const tb = new Builder(11);
  tb.box(M.oak, T.w, 0.05, T.d, [0, T.h - 0.025, 0], { uvScale: 1.2 });
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tb.box(M.oak, 0.07, T.h - 0.05, 0.07, [lx * (T.w / 2 - 0.07), (T.h - 0.05) / 2, lz * (T.d / 2 - 0.07)], { wonk: 1.2 });
  tb.box(M.oak, T.w - 0.16, 0.09, 0.025, [0, T.h - 0.1, T.d / 2 - 0.08]);
  tb.box(M.oak, T.w - 0.16, 0.09, 0.025, [0, T.h - 0.1, -T.d / 2 + 0.08]);
  // a drawer front
  tb.box(M.pine, 0.42, 0.07, 0.02, [0.25, T.h - 0.1, T.d / 2 - 0.065]);
  tb.cyl(M.brass, 0.012, 0.012, 0.02, [0.25, T.h - 0.1, T.d / 2 - 0.05], { rot: [Math.PI / 2, 0, 0], seg: 8 });
  // inkwell and a pen tray
  tb.cyl(M.glass, 0.026, 0.034, 0.05, [0.47, T.h + 0.025, -0.06], { seg: 14 });
  tb.cyl(M.iron, 0.013, 0.013, 0.012, [0.47, T.h + 0.056, -0.06], { seg: 10 });
  tb.box(M.pine, 0.24, 0.012, 0.07, [0.46, T.h + 0.006, 0.08], { rot: [0, 0.12, 0] });
  // a tin box of spare wicks, the tide almanac
  tb.box(M.iron, 0.12, 0.06, 0.09, [-0.52, T.h + 0.03, 0.2], { rot: [0, 0.3, 0] });
  tb.box(wash({ color: '#7E3B33', color2: '#6A3029', line: 1, gran: 0.7 }), 0.16, 0.025, 0.23, [0.42, T.h + 0.0125, -0.24], { rot: [0, -0.2, 0] });
  table.add(tb.finish('table'));
  table.position.set(tx, 0, tz);
  table.rotation.y = tRot;
  table.updateMatrix(); table.matrixAutoUpdate = false;
  table.updateMatrixWorld(true);

  // the oil lamp at the back corner of the table: base, glass font, chimney, a flame in the light layer
  const lamp = new THREE.Group();
  const lb = new Builder(13);
  lb.cyl(M.brass, 0.05, 0.07, 0.03, [0, 0.015, 0], { seg: 20 });
  lb.cyl(M.brass, 0.018, 0.026, 0.12, [0, 0.09, 0], { seg: 12 });
  lb.add(new THREE.SphereGeometry(0.065, 18, 12), M.glass, { pos: [0, 0.19, 0], scale: [1, 0.75, 1] });
  lb.cyl(M.brass, 0.03, 0.035, 0.03, [0, 0.245, 0], { seg: 14 });
  lb.add(new THREE.LatheGeometry([0.028, 0.03, 0.042, 0.04, 0.026, 0.024, 0.026].map((r, i) => new THREE.Vector2(r, i * 0.035)), 16), M.glass, { pos: [0, 0.26, 0] });
  lamp.add(lb.finish('lamp'));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), glowMaterial({ emit: 0xffc070, amt: 1.6 }));
  flame.position.set(0, 0.3, 0); flame.scale.set(1, 1.9, 1);
  lamp.add(flame);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), glowMaterial({ emit: 0xd08a40, amt: 0.35 }));
  halo.position.set(0, 0.32, 0);
  lamp.add(halo);
  lamp.position.set(-0.45, T.h, -0.27);
  table.add(lamp);
  lamp.updateMatrixWorld(true);

  // shelves of old logbooks on the wall above the table
  const sb = new Builder(17);
  const r = rng(23);
  const spines = ['#3E4A50', '#2F4846', '#5A3A2E', '#4C3B2A', '#6B4A32', '#3B3F2E', '#2E3B4A', '#5E4636'].map((c) => wash({ color: c, color2: c, line: 1, crease: 0.6, gran: 0.8, noiseScale: 4 }));
  for (const [sh, n] of [[1.42, 13], [1.84, 11]]) {
    const [shx, shz] = polar(T.deg, R - 0.14);
    sb.box(M.pine, 1.2, 0.03, 0.26, [shx, sh, shz], { rot: [0, facing(T.deg), 0] });
    for (const s of [-1, 1]) sb.add(new THREE.BoxGeometry(0.03, 0.1, 0.2), M.pine, { pos: offset(...polar(T.deg, R - 0.12), T.deg, s * 0.5, sh - 0.065), rot: [0, facing(T.deg), 0] });
    let off = -0.56;
    for (let i = 0; i < n && off < 0.52; i++) {
      const bw = 0.035 + r() * 0.035, bh = 0.22 + r() * 0.08, lean = i === n - 1 ? 0.35 : (r() < 0.12 ? 0.12 : 0);
      sb.add(new THREE.BoxGeometry(bw, bh, 0.2), spines[Math.floor(r() * spines.length)], { pos: offset(...polar(T.deg, R - 0.15), T.deg, off + bw / 2, sh + 0.015 + bh / 2 - lean * 0.03), rot: [0, facing(T.deg), lean], wonk: 1 });
      off += bw + 0.004;
    }
  }

  // ---- the lamp control: a pipe up the wall, a brass lever and a pressure gauge ----
  const C = ROOM.control;
  const [cx, cz] = polar(C.deg, R - 0.06);
  sb.cyl(M.brass, 0.022, 0.022, H, [cx, H / 2, cz], { seg: 10 });
  sb.cyl(M.brass, 0.045, 0.045, 0.1, [cx, C.h, cz], { seg: 14 });
  const [gx, gz] = polar(C.deg + 3.2, R - 0.05);
  sb.cyl(M.brass, 0.06, 0.06, 0.03, [gx, C.h + 0.32, gz], { rot: [Math.PI / 2, facing(C.deg), 0], seg: 20 });
  const control = new THREE.Group();
  const leverB = new Builder(19);
  leverB.box(M.brass, 0.03, 0.03, 0.22, [0, 0, -0.11]);
  leverB.add(new THREE.SphereGeometry(0.035, 12, 8), M.iron, { pos: [0, 0, -0.23] });
  const lever = leverB.finish('lever');
  lever.matrixAutoUpdate = true;
  const pivot = new THREE.Group();
  pivot.add(lever);
  // lever sticks out of the pipe toward the room
  const [lx, lz] = polar(C.deg, R - 0.11);
  pivot.position.set(lx, C.h, lz);
  pivot.rotation.order = 'YXZ';
  pivot.rotation.y = facing(C.deg) + Math.PI;
  pivot.rotation.x = 0.5;   // up = off; pulled down = lit
  control.add(pivot);

  // ---- the wall clock ----
  const K = ROOM.clock;
  const clock = new THREE.Group();
  const [kx, kz] = polar(K.deg, R - 0.05);
  clock.position.set(kx, K.h, kz);
  clock.rotation.y = facing(K.deg);
  const kb = new Builder(29);
  kb.cyl(M.oak, 0.17, 0.17, 0.05, [0, 0, 0.0], { rot: [Math.PI / 2, 0, 0], seg: 32 });
  const face = wash({ color: '#F1E9D6', color2: '#E8DDC6', line: 0.6, crease: 0.2, gran: 0.25, inkMap: clockFaceTex(), noiseScale: 6 });
  const fg = new THREE.CircleGeometry(0.145, 32);
  kb.add(fg, face, { pos: [0, 0, 0.027], wonk: 0 });
  clock.add(kb.finish('clock'));
  const handMat = wash({ color: '#2B2622', line: 0.8, crease: 0, gran: 0 });
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.004).translate(0, 0.03, 0), handMat);
  const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.115, 0.004).translate(0, 0.05, 0), handMat);
  hourHand.position.z = 0.032; minHand.position.z = 0.036;
  clock.add(hourHand, minHand);
  // pendulum box below
  kb.box(M.oak, 0.1, 0.32, 0.05, [0, -0.33, -0.005]);

  // ---- the stove ----
  const S = ROOM.stove;
  const [vx, vz] = polar(S.deg, S.r);
  const stove = new THREE.Group();
  const vb = new Builder(31);
  vb.box(M.iron, 0.62, 0.55, 0.5, [0, 0.42, 0], { uvScale: 1 });
  vb.box(M.iron, 0.68, 0.04, 0.56, [0, 0.715, 0]);
  for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vb.cyl(M.iron, 0.025, 0.03, 0.15, [ax * 0.26, 0.075, az * 0.2], { seg: 8 });
  vb.box(M.iron, 0.3, 0.22, 0.02, [0, 0.42, 0.26]);
  vb.cyl(M.iron, 0.075, 0.075, H - 0.73, [0, 0.73 + (H - 0.73) / 2, -0.1], { seg: 14 });
  // kettle
  vb.add(new THREE.SphereGeometry(0.11, 16, 10), M.iron, { pos: [0.14, 0.81, 0.08], scale: [1, 0.7, 1] });
  vb.cyl(M.iron, 0.015, 0.02, 0.1, [0.25, 0.83, 0.08], { rot: [0, 0, -0.9], seg: 6 });
  stove.add(vb.finish('stove'));
  const stoveGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.04), glowMaterial({ emit: 0xff7a30, amt: 0.7 }));
  stoveGlow.position.set(0, 0.36, 0.272);
  stove.add(stoveGlow);
  stove.position.set(vx, 0, vz);
  stove.rotation.y = facing(S.deg);

  // ---- the chair at the window: deep arms for resting forearms on ----
  const Ch = ROOM.chair;
  const chair = new THREE.Group();
  const chb = new Builder(37);
  chb.box(M.oak, 0.62, 0.07, 0.56, [0, 0.4, 0]);
  chb.box(M.cushion, 0.56, 0.08, 0.5, [0, 0.47, 0.01], { wonk: 2 });
  chb.box(M.oak, 0.62, 0.62, 0.06, [0, 0.74, 0.27], { rot: [-0.22, 0, 0] });
  chb.box(M.cushion, 0.52, 0.5, 0.07, [0, 0.76, 0.2], { rot: [-0.22, 0, 0], wonk: 2 });
  for (const s of [-1, 1]) {
    chb.box(M.oak, 0.11, 0.04, 0.74, [s * 0.36, 0.66, -0.07]);
    chb.box(M.oak, 0.05, 0.22, 0.05, [s * 0.36, 0.53, -0.36]);
    for (const z of [-0.24, 0.24]) chb.box(M.oak, 0.06, 0.4, 0.06, [s * 0.28, 0.2, z]);
  }
  // a mug on the sill
  chair.add(chb.finish('chair'));
  const [cxx, czz] = polar(Ch.deg, Ch.r);
  chair.position.set(cxx, 0, czz);
  chair.rotation.y = facing(Ch.deg);
  const mug = new THREE.Group();
  const mb = new Builder(41);
  mb.add(new THREE.CylinderGeometry(0.042, 0.038, 0.095, 18, 1, true), wash({ color: '#D9CDB4', color2: '#CBBB9C', line: 1, gran: 0.3, side: THREE.DoubleSide }), { pos: [0, 0.0475, 0] });
  mb.cyl(wash({ color: '#5A3A22', line: 0.2, gran: 0.4 }), 0.038, 0.038, 0.004, [0, 0.08, 0], { seg: 16 });
  mb.add(new THREE.TorusGeometry(0.025, 0.008, 6, 12, Math.PI), wash({ color: '#D9CDB4', line: 1, gran: 0.3 }), { pos: [0.045, 0.05, 0], rot: [0, 0, -Math.PI / 2] });
  mug.add(mb.finish('mug'));
  const [mx, mz] = polar(w.deg - 6, R + 0.1);
  mug.position.set(mx, w.sill + 0.05, mz);
  mug.userData.home = mug.position.clone();

  const group = new THREE.Group();
  group.name = 'watchroom';
  group.add(b.finish('room'), sb.finish('shelves'), table, control, clock, stove, chair, mug);
  return {
    group, table, lamp, flame, halo, clock, hourHand, minHand, lever: pivot, stove, stoveGlow, chair, mug, M,
    // 2D obstacles for walking, in room space: circles [x, z, r] and the stair annulus
    obstacles: {
      circles: [[vx, vz, 0.55], [cxx, czz, 0.5]],
      boxes: [{ x: tx, z: tz, rot: tRot, hw: T.w / 2 + 0.12, hd: T.d / 2 + 0.12 }],
      stairs: { from: st.from - 6, to: st.from + st.step * st.count, r0: st.r0 - 0.25 },
      radius: R - 0.38,
    },
  };
}

// --- helpers ---
function planarUv(g, k, flip = false) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * k, (flip ? -1 : 1) * p.getY(i) * k);
}

// a curved wall section from deg a0 to a1 (clockwise from -Z), y0..y1, seen from inside
function wallArc(b, mat, a0, a1, y0, y1, r = ROOM.R, inside = true) {
  const len = (a1 - a0) * DEG;
  const seg = Math.max(2, Math.ceil((a1 - a0) / 4));
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 2, true, Math.PI - a1 * DEG, len);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * r * 0.5, uv.getY(i) * (y1 - y0) * 0.5);
  if (inside) {
    // turn the faces inward
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  b.add(g, mat, { pos: [0, (y0 + y1) / 2, 0], wonk: 0 });
}

// the deep stone sides of an opening through the wall
function reveal(b, mat, deg, half, y0, y1) {
  const t = ROOM.wall, R = ROOM.R;
  const rot = [0, facing(deg), 0];
  const [cx, cz] = polar(deg, R + t / 2);
  for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.04, y1 - y0, t + 0.04), mat, { pos: offset(cx, cz, deg, s * (half + 0.02), (y0 + y1) / 2), rot, wonk: 0 });
  b.add(new THREE.BoxGeometry(half * 2 + 0.08, 0.06, t + 0.04), mat, { pos: [cx, y1 + 0.03, cz], rot, wonk: 0 });
  if (y0 > 0) b.add(new THREE.BoxGeometry(half * 2 + 0.08, 0.04, t + 0.04), mat, { pos: [cx, y0 - 0.02, cz], rot, wonk: 0 });
}

// a point at (x, z) moved sideways (tangent to the wall at deg) by `off`, at height y
function offset(x, z, deg, off, y) {
  const a = deg * DEG;
  return [x + Math.cos(a) * off, y, z + Math.sin(a) * off];
}

function clockFaceTex() {
  return letteringTex('clockface', 256, 256, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 98;
      letter(ctx, nums[i], Math.sin(a) * r, -Math.cos(a) * r + 7, { hand: 'serif', size: i % 3 ? 16 : 20, align: 'center', alpha: 0.85, color: '#2B2622' });
    }
    ctx.strokeStyle = 'rgba(43,38,34,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 118, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, r0 = i % 5 ? 113 : 109;
      ctx.beginPath(); ctx.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); ctx.lineTo(Math.sin(a) * 118, -Math.cos(a) * 118); ctx.stroke();
    }
  });
}
