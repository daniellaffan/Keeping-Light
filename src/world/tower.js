// The lighthouse tower, as it's seen from the headland and across the bay: the watch room's round wall
// rising into a tall whitewashed shaft, flared at the foot like the rock towers, on a granite plinth.
// Round-headed windows climb it with the stair inside; a ring of granite corbels carries the gallery
// and its iron rail; the lantern stands on a riveted pedestal, glazed with diagonal astragals round a
// Fresnel lens, under a red iron roof with a ladder, a ventilator ball and a weathervane. A copper
// conductor runs down the side. The whole shaft is one painted sheet (paintSkin), so what the weather
// has done is in the right places: rust under the sills and the corbels, damp and lichen at the foot,
// limewash worn through to the stone.
// Local space is the watch room's: origin at the floor centre, -Z out through the window.
import * as THREE from 'three';
import { Builder, polar, facing } from './build.js';
import { wash } from './materials.js';
import { canvasTex, graniteTex, ironPanelTex, sashTex, tileFbm, letteringTex } from './textures.js';
import { makeCanvas, rng, fbm1, noise1, inkLine, rgba, wobble, ellipsePts, trace, lerp } from '../render/paint.js';
import { letter } from '../render/hand.js';

const DEG = Math.PI / 180, TAU = Math.PI * 2;

// Heights are above the watch-room floor. The shaft's foot is the watch room's outside (ROOM.R + wall).
export const SHAFT = { y0: 3.9, top: 21.5, rBase: 4.0, rTop: 2.7, flare: 1.7 };
const DECK = SHAFT.top + 0.24;              // the gallery floor
const RAIL = 3.3, DECK_R = 3.42;            // the gallery rail and the deck's edge
const PED = 1.0, PED_R = 2.03;              // the lantern's iron pedestal
const G0 = DECK + PED, G1 = G0 + 2.3;       // the glazing
const GLAZE_R = 1.96;
// the lamp, in the middle of the glazing: bay.js hangs the beam here
export const LAMP_HEIGHT = G0 + 1.15;

// the shaft's radius at height y: straight-ish above, flaring out toward the foot
export function shaftR(y) {
  const t = Math.min(1, Math.max(0, (y - SHAFT.y0) / (SHAFT.top - SHAFT.y0)));
  return SHAFT.rTop + (SHAFT.rBase - SHAFT.rTop) * Math.pow(1 - t, SHAFT.flare);
}
// how far the wall leans in, metres per metre up
const lean = (y) => (shaftR(y - 0.05) - shaftR(y + 0.05)) / 0.1;

// The painted sheet: u once round from SEAM, v from the plinth to the gallery.
const SKIN = { y0: -0.45, y1: SHAFT.top, seam: 160, W: 2048, H: 2048 };
// windows up the shaft, following the stair round; corbels; the copper conductor
const WIN = { w: 0.6, hs: 0.82, m: 0.13 };
const WINDOWS = [{ deg: 100, y: 6.4 }, { deg: 205, y: 9.4 }, { deg: 330, y: 12.4 }, { deg: 85, y: 15.4 }, { deg: 200, y: 18.4 }];
const CORBELS = Array.from({ length: 24 }, (_, i) => 7.5 + i * 15);
const CONDUCTOR = 45;

export function buildTower(ROOM, Mroom) {
  const { R, H, wall, window: w, door: d } = ROOM;
  const RO = R + wall;
  const skin = paintSkin(ROOM);
  const gran = graniteTex(3);
  const ped = ironPanelTex('pedestal', { panels: 8, belts: [0.5], seed: 12, rust: 0.7 });
  const dome = ironPanelTex('dome', { panels: 16, belts: [0.45], seed: 14, rust: 1.2 });
  const sash = sashTex(WIN.hs / (WIN.hs + WIN.w / 2));
  const M = {
    render: wash({ color: '#EEE8DA', color2: '#E4DCC8', map: skin.map, inkMap: skin.ink, line: 1, crease: 0.45, gran: 0.55, noiseScale: 0.8 }),
    granite: wash({ color: '#CBC4B6', color2: '#BDB5A5', map: gran.map, inkMap: gran.ink, line: 1, crease: 0.7, gran: 0.9, noiseScale: 1.4 }),
    iron: wash({ color: '#2E3436', color2: '#3A4042', line: 1, crease: 0.6, gran: 0.5, noiseScale: 3 }),
    cream: wash({ color: '#E9E3D3', color2: '#DDD5C1', map: ped.map, inkMap: ped.ink, line: 1, crease: 0.6, gran: 0.5, noiseScale: 2 }),
    red: wash({ color: '#9C4232', color2: '#843629', map: dome.map, inkMap: dome.ink, line: 1, crease: 0.6, gran: 0.65, noiseScale: 1.6 }),
    lens: wash({ color: '#D3E5E0', color2: '#B9D2CE', line: 0.7, crease: 0.85, gran: 0.25, noiseScale: 5 }),
    glass: wash({ color: '#6E7A8A', color2: '#5E6A7A', map: sash.map, inkMap: sash.ink, line: 0.9, crease: 0.3, gran: 0.3, noiseScale: 4 }),
    copper: wash({ color: '#6E9480', color2: '#5F8571', line: 1, crease: 0.4, gran: 0.6, noiseScale: 4 }),
    dark: wash({ color: '#3A3634', color2: '#2E2A28', line: 0.8, crease: 0.3, gran: 0.6 }),
    brass: Mroom.brass,
    stone: Mroom.stone,
  };
  const b = new Builder(53);

  // ---- the watch room's outside, broken by its window and door ----
  const wo = Math.asin(w.half / RO) / DEG, dO = Math.asin(d.half / RO) / DEG, y0 = SHAFT.y0, yb = SKIN.y0;
  for (const [a0, a1, ya, yz] of [
    [w.deg + wo, d.deg - dO, yb, y0], [d.deg + dO, 360 + w.deg - wo, yb, y0],
    [w.deg - wo, w.deg + wo, yb, w.sill], [w.deg - wo, w.deg + wo, w.top, y0], [d.deg - dO, d.deg + dO, d.top, y0],
  ]) b.add(skinUv(arc(RO, RO, a0, a1, ya, yz)), M.render, { wonk: 0 });
  // what's seen looking up through the hatch: the floor of the room above
  b.add(new THREE.CircleGeometry(RO - 0.1, 48).rotateX(Math.PI / 2), M.stone, { pos: [0, H + 0.6, 0], wonk: 0 });

  // ---- the shaft ----
  const prof = [];
  for (let y = y0 - 0.05; y < SHAFT.top; y += 0.25) prof.push(new THREE.Vector2(shaftR(y), y));
  prof.push(new THREE.Vector2(shaftR(SHAFT.top), SHAFT.top));
  b.add(skinUv(new THREE.LatheGeometry(prof, 96)), M.render, { wonk: 0 });
  // a moulded string course where the watch room's wall becomes the shaft
  b.add(metreLathe([[3.98, 3.7], [4.13, 3.74], [4.17, 3.84], [4.17, 3.95], [4.1, 4.03], [4.04, 4.14], [shaftR(4.24) + 0.01, 4.24]]), M.granite, { wonk: 0 });

  // ---- the granite plinth, stepped back at the door for the step ----
  const ga = Math.asin(0.72 / 4.22) / DEG;
  b.add(metreUv(arc(4.2, 4.27, d.deg + ga, 360 + d.deg - ga, -0.45, 0.35)), M.granite, { wonk: 0 });
  b.add(metreUv(arc(4.02, 4.2, d.deg + ga, 360 + d.deg - ga, 0.35, 0.43)), M.granite, { wonk: 0 });
  for (const s of [-1, 1]) {
    const a = d.deg + s * ga;
    b.box(M.granite, 0.04, 0.88, 0.3, xz(a, 4.12, -0.01), { rot: [0, facing(a), 0], uvScale: 1, wonk: 0 });
  }

  // ---- the door and the window in granite surrounds; a plaque over the door ----
  surround(b, M.granite, RO, d.deg, d.half, 0, d.top, false);
  surround(b, M.granite, RO, w.deg, w.half, w.sill, w.top, true);
  const plaque = letteringTex('tower-plaque', 512, 220, (ctx, cw, ch) => {
    ctx.strokeStyle = 'rgba(43,38,34,0.75)'; ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, cw - 36, ch - 36);
    ctx.lineWidth = 1.2; ctx.strokeRect(28, 28, cw - 56, ch - 56);
    letter(ctx, 'CEANN BÁN', cw / 2, 102, { hand: 'serif', size: 56, align: 'center', alpha: 0.85, color: '#2B2622' });
    letter(ctx, 'MDCCCXXXVIII', cw / 2, 168, { hand: 'serif', size: 34, align: 'center', alpha: 0.75, color: '#2B2622' });
  });
  const pm = wash({ color: '#D3CCBE', color2: '#C6BEAE', map: gran.map, inkMap: plaque, line: 1, crease: 0.6, gran: 0.8, noiseScale: 3 });
  const py = d.top + 0.82;
  b.box(M.granite, 1.08, 0.5, 0.14, [...xz(d.deg, RO + 0.0, py)], { rot: [0, facing(d.deg), 0], uvScale: 1, wonk: 0 });
  b.add(new THREE.PlaneGeometry(0.96, 0.4).rotateY(Math.PI), pm, { pos: xz(d.deg, RO + 0.071, py), rot: [0, facing(d.deg), 0], wonk: 0 });

  // ---- the windows up the shaft ----
  const win = windowPieces(M);
  for (const o of WINDOWS) {
    const at = xz(o.deg, shaftR(o.y), o.y);
    for (const [g, mat] of win) b.add(g.clone(), mat, { pos: at, rot: [Math.atan(lean(o.y + 0.5)), facing(o.deg), 0], wonk: 0.3 });
  }

  // ---- the corbels, the frieze between them and the gallery deck ----
  const T = SHAFT.top, rT = shaftR(T);
  const cs = new THREE.Shape();
  cs.moveTo(-0.05, -0.95); cs.lineTo(0.06, -0.95);
  cs.bezierCurveTo(0.12, -0.58, 0.44, -0.34, 0.62, -0.17);
  cs.lineTo(0.64, -0.08); cs.lineTo(0.6, -0.02); cs.lineTo(0.6, 0); cs.lineTo(-0.05, 0); cs.closePath();
  const corbel = new THREE.ExtrudeGeometry(cs, { depth: 0.26, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.13).rotateY(Math.PI / 2);
  for (const a of CORBELS) b.add(corbel, M.granite, { pos: xz(a, rT, T), rot: [0, facing(a), 0], wonk: 0.8 });
  b.add(metreUv(arc(rT + 0.1, rT + 0.07, 0, 360, T - 0.2, T, 4)), M.granite, { wonk: 0 });
  b.add(metreUv(arc(DECK_R, DECK_R - 0.04, 0, 360, T, T + 0.24, 4)), M.granite, { wonk: 0 });
  b.add(flatUv(new THREE.RingGeometry(PED_R, DECK_R, 96, 1).rotateX(-Math.PI / 2)), M.granite, { pos: [0, DECK, 0], wonk: 0 });
  b.add(flatUv(new THREE.RingGeometry(rT - 0.05, DECK_R - 0.04, 96, 1).rotateX(Math.PI / 2)), M.granite, { pos: [0, T, 0], wonk: 0 });

  // ---- the gallery rail ----
  for (let i = 0; i < 40; i++) {
    const a = i * 9;
    b.cyl(M.iron, 0.02, 0.026, 1.05, xz(a, RAIL, DECK + 0.525), { seg: 6 });
    b.cyl(M.iron, 0.026, 0.045, 0.05, xz(a, RAIL, DECK + 0.025), { seg: 12, wonk: 0 });
    if (i % 5 === 0) b.add(new THREE.SphereGeometry(0.045, 8, 6), M.iron, { pos: xz(a, RAIL, DECK + 1.09) });
  }
  for (const [y, t] of [[1.05, 0.034], [0.62, 0.016], [0.16, 0.016]]) b.add(new THREE.TorusGeometry(RAIL, t, 6, 160), M.iron, { pos: [0, DECK + y, 0], rot: [Math.PI / 2, 0, 0], wonk: 0 });

  // ---- the lantern: pedestal, floor, glazing, lens ----
  b.add(new THREE.CylinderGeometry(PED_R, PED_R + 0.05, PED, 48, 1, true), M.cream, { pos: [0, DECK + PED / 2, 0], wonk: 0 });
  b.add(new THREE.CylinderGeometry(PED_R + 0.1, PED_R + 0.1, 0.09, 48), M.iron, { pos: [0, G0 - 0.045, 0], wonk: 0 });
  b.add(new THREE.CylinderGeometry(PED_R + 0.11, PED_R + 0.13, 0.07, 48), M.iron, { pos: [0, DECK + 0.035, 0], wonk: 0 });
  b.add(new THREE.CircleGeometry(PED_R, 40).rotateX(-Math.PI / 2), M.granite, { pos: [0, DECK + 0.01, 0], wonk: 0 });
  for (let i = 0; i < 8; i++) {
    const a = 22.5 + i * 45;
    b.add(new THREE.TorusGeometry(0.08, 0.016, 6, 16), M.brass, { pos: xz(a, PED_R + 0.055, DECK + PED * 0.62), rot: [0, facing(a), 0], wonk: 0 });
    b.add(new THREE.CircleGeometry(0.075, 14).rotateY(Math.PI), M.dark, { pos: xz(a, PED_R + 0.05, DECK + PED * 0.62), rot: [0, facing(a), 0], wonk: 0 });
  }
  // a little iron door out onto the gallery, on the landward side
  b.box(M.iron, 0.56, 0.84, 0.05, xz(150, PED_R + 0.02, DECK + 0.46), { rot: [0, facing(150), 0] });
  b.add(new THREE.TorusGeometry(0.035, 0.008, 6, 10), M.brass, { pos: xz(147, PED_R + 0.06, DECK + 0.5), rot: [0, facing(147), 0] });
  // the glazing: two families of helical astragals crossing in diamonds, Fastnet fashion; the glass
  // itself left clear, so the lens and the lamp's light show through
  for (const [y, t] of [[G0 + 0.03, 0.05], [G1 - 0.03, 0.05]]) b.add(new THREE.TorusGeometry(GLAZE_R, t, 5, 64), M.iron, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], wonk: 0 });
  for (const dir of [1, -1]) for (let i = 0; i < 16; i++) {
    const pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, a = i * 22.5 + dir * t * 52; pts.push(new THREE.Vector3(...xz(a, GLAZE_R, G0 + t * (G1 - G0)))); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.02, 4, false), M.iron, { wonk: 0 });
  }
  lens(b, M);

  // ---- the roof: a red iron cupola with ribs, a ladder, a hand rail, the ventilator and the vane ----
  b.add(new THREE.CylinderGeometry(2.17, 2.0, 0.22, 48), M.red, { pos: [0, G1 + 0.11, 0], wonk: 0 });
  const RB = G1 + 0.22;
  const RP = [[2.27, 0], [2.25, 0.06], [2.05, 0.2], [1.7, 0.5], [1.25, 0.86], [0.8, 1.14], [0.45, 1.32], [0.3, 1.4], [0.27, 1.5]];
  b.add(new THREE.LatheGeometry(RP.map(([r, y]) => new THREE.Vector2(r, RB + y)), 64), M.red, { wonk: 0 });
  b.add(new THREE.CircleGeometry(2.26, 48).rotateX(Math.PI / 2), M.dark, { pos: [0, RB + 0.002, 0], wonk: 0 });
  const roofAt = (t) => { const c = new THREE.SplineCurve(RP.slice(1, 8).map(([r, y]) => new THREE.Vector2(r, y))); return c.getPoint(t); };
  for (let i = 0; i < 16; i++) {
    const a = i * 22.5, pts = [];
    for (let k = 0; k <= 14; k++) { const p = roofAt(k / 14); pts.push(new THREE.Vector3(...xz(a, p.x + 0.022, RB + p.y + 0.012))); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.028, 4, false), M.red, { wonk: 0 });
  }
  // ladder up the roof to the ventilator
  const LA = 30, side = (a, r, off) => { const [x, z] = polar(a, r); const t = a * DEG; return [x + Math.cos(t) * off, z + Math.sin(t) * off]; };
  const rails = [-1, 1].map((s) => { const pts = []; for (let k = 0; k <= 12; k++) { const p = roofAt(0.1 + (k / 12) * 0.72); const [x, z] = side(LA, p.x + 0.09, s * 0.17); pts.push(new THREE.Vector3(x, RB + p.y + 0.07, z)); } return new THREE.CatmullRomCurve3(pts); });
  for (const c of rails) b.add(new THREE.TubeGeometry(c, 20, 0.016, 4, false), M.iron, { wonk: 0 });
  for (let k = 1; k < 8; k++) rod(b, M.iron, rails[0].getPoint(k / 8), rails[1].getPoint(k / 8), 0.011);
  // hand rail round the roof on short stanchions
  const hp = roofAt(0.52);
  for (let i = 0; i < 10; i++) b.cyl(M.iron, 0.012, 0.012, 0.26, xz(i * 36 + 12, hp.x + 0.03, RB + hp.y + 0.13), { seg: 5 });
  b.add(new THREE.TorusGeometry(hp.x + 0.03, 0.018, 5, 48), M.iron, { pos: [0, RB + hp.y + 0.26, 0], rot: [Math.PI / 2, 0, 0], wonk: 0 });
  // ventilator ball, its cowl, the lightning spike and the vane
  b.cyl(M.red, 0.19, 0.24, 0.3, [0, RB + 1.6, 0], { seg: 16, wonk: 0 });
  b.add(new THREE.SphereGeometry(0.38, 20, 14), M.red, { pos: [0, RB + 1.98, 0], wonk: 0 });
  for (let i = 0; i < 8; i++) b.add(new THREE.CircleGeometry(0.045, 10).rotateY(Math.PI), M.dark, { pos: xz(i * 45, 0.385, RB + 1.98), rot: [0, facing(i * 45), 0], wonk: 0 });
  b.cyl(M.iron, 0.1, 0.2, 0.14, [0, RB + 2.4, 0], { seg: 12 });
  b.cyl(M.copper, 0.016, 0.022, 1.25, [0, RB + 3.0, 0], { seg: 6 });
  for (const a of [0, 90]) b.box(M.iron, 0.78, 0.022, 0.022, [0, RB + 2.82, 0], { rot: [0, a * DEG, 0] });
  for (let i = 0; i < 4; i++) b.add(new THREE.SphereGeometry(0.035, 8, 6), M.iron, { pos: xz(i * 90, 0.39, RB + 2.82) });
  b.box(M.iron, 0.95, 0.025, 0.035, [0, RB + 3.18, 0], { rot: [0, 0.6, 0] });
  b.box(M.iron, 0.02, 0.2, 0.26, [Math.cos(0.6) * 0.46, RB + 3.18, -Math.sin(0.6) * 0.46], { rot: [0, 0.6, 0] });
  b.add(new THREE.ConeGeometry(0.06, 0.16, 6).rotateZ(Math.PI / 2), M.iron, { pos: [-Math.cos(0.6) * 0.5, RB + 3.18, Math.sin(0.6) * 0.5], rot: [0, 0.6, 0] });
  b.add(new THREE.SphereGeometry(0.03, 8, 6), M.copper, { pos: [0, RB + 3.64, 0] });

  // ---- the copper lightning conductor, down the side to the ground ----
  const outer = (y) => {
    let r = y > 3.7 ? shaftR(y) : RO;
    if (y > 3.68 && y < 4.24) r = Math.max(r, 4.17);
    if (y > T - 0.22) r = Math.max(r, rT + 0.1);
    if (y < 0.45) r = Math.max(r, 4.27);
    return r;
  };
  const cond = [new THREE.Vector3(...xz(CONDUCTOR, DECK_R + 0.04, DECK + 0.1)), new THREE.Vector3(...xz(CONDUCTOR, DECK_R + 0.04, T - 0.04))];
  for (let y = T - 0.12; y > -0.3; y -= 0.25) cond.push(new THREE.Vector3(...xz(CONDUCTOR, outer(y) + 0.045, y)));
  cond.push(new THREE.Vector3(...xz(CONDUCTOR, 4.33, -0.35)));
  for (let i = 0; i < cond.length - 1; i++) rod(b, M.copper, cond[i], cond[i + 1], 0.018);
  for (let y = 1.2; y < T - 0.5; y += 1.5) b.box(M.iron, 0.09, 0.05, 0.07, xz(CONDUCTOR, outer(y) + 0.03, y), { rot: [0, facing(CONDUCTOR), 0] });

  const group = b.finish('tower');
  return group;
}

// ---------------- pieces ----------------

// A Fresnel lens round the lamp: rings of prisms above and below a bullseye belt, in a brass frame,
// on a cast-iron pedestal with the clockwork case at its foot.
function lens(b, M) {
  const c = LAMP_HEIGHT, prof = [new THREE.Vector2(0.3, -0.98)];
  for (let k = 0; k < 7; k++) { const y = -0.92 + k * 0.088, r = 0.6 + k * 0.022; prof.push(new THREE.Vector2(r + 0.05, y), new THREE.Vector2(r, y + 0.07)); }
  prof.push(new THREE.Vector2(0.78, -0.3), new THREE.Vector2(0.8, 0), new THREE.Vector2(0.78, 0.3));
  for (let k = 0; k < 8; k++) { const y = 0.32 + k * 0.08, r = 0.74 - k * 0.04; prof.push(new THREE.Vector2(r, y), new THREE.Vector2(r - 0.05, y + 0.065)); }
  prof.push(new THREE.Vector2(0.2, 0.98));
  const n = prof.length - 1, belt = prof.findIndex((p) => p.y === -0.3);
  const face = (i) => (i >= belt && i < belt + 2 ? 2 : i % 2);
  const lm = canvasTex('lens', 8, 512, (ctx, w, h) => {
    for (let i = 0; i < n; i++) { ctx.fillStyle = ['#C9D2D2', '#FFFFFF', '#EEF3F2'][face(i)]; ctx.fillRect(0, (1 - (i + 1) / n) * h, w, h / n + 1); }
  }, { repeat: false });
  const li = canvasTex('lens-ink', 8, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(40,48,50,0.55)';
    for (let i = 1; i < n; i += 2) ctx.fillRect(0, (1 - i / n) * h - 1, w, 2);
  }, { repeat: false });
  M.lens.uniforms.uMap.value = lm; M.lens.uniforms.uMapAmt.value = 1;
  M.lens.uniforms.uInkMap.value = li; M.lens.uniforms.uInkAmt.value = 1;
  b.add(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x, p.y + c)), 32), M.lens, { wonk: 0 });
  for (const [y, r] of [[-0.96, 0.66], [-0.3, 0.8], [0.3, 0.8], [0.97, 0.42]]) b.add(new THREE.TorusGeometry(r, 0.022, 5, 32), M.brass, { pos: [0, c + y, 0], rot: [Math.PI / 2, 0, 0], wonk: 0 });
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    rod(b, M.brass, new THREE.Vector3(...xz(a, 0.7, c - 0.94)), new THREE.Vector3(...xz(a, 0.82, c)), 0.016);
    rod(b, M.brass, new THREE.Vector3(...xz(a, 0.82, c)), new THREE.Vector3(...xz(a, 0.44, c + 0.95)), 0.016);
  }
  b.add(new THREE.ConeGeometry(0.22, 0.26, 12), M.brass, { pos: [0, c + 1.1, 0], wonk: 0 });
  b.cyl(M.dark, 0.15, 0.24, c - 0.98 - DECK, [0, (c - 0.98 + DECK) / 2, 0], { seg: 12, wonk: 0 });
  b.box(M.dark, 0.5, 0.42, 0.5, [0, DECK + 0.21, 0], { wonk: 0 });
  b.box(M.brass, 0.52, 0.04, 0.52, [0, DECK + 0.44, 0], { wonk: 0 });
}

// Pieces of one round-headed window, outward along -Z from the wall at its foot.
function windowPieces(M) {
  const { w, hs, m } = WIN, h = w / 2;
  const arch = (half, y0) => { const s = new THREE.Shape(); s.moveTo(-half, y0); s.lineTo(half, y0); s.lineTo(half, hs); s.absarc(0, hs, half, 0, Math.PI, false); s.lineTo(-half, y0); return s; };
  const frame = arch(h + m, -0.02);
  frame.holes.push(arch(h, 0));
  const surround = new THREE.ExtrudeGeometry(frame, { depth: 0.17, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -0.12);
  const glass = new THREE.ShapeGeometry(arch(h, 0), 12);
  const uv = glass.attributes.uv, p = glass.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + h) / w, p.getY(i) / (hs + h));
  glass.rotateY(Math.PI).translate(0, 0, -0.035);
  const sill = new THREE.BoxGeometry(w + 2 * m + 0.16, 0.09, 0.3).translate(0, -0.06, -0.07);
  const key = new THREE.BoxGeometry(0.16, 0.25, 0.2).translate(0, hs + h + m - 0.07, -0.05);
  return [[surround, M.granite], [glass, M.glass], [sill, M.granite], [key, M.granite]];
}

// Granite jambs, a lintel with its keystone, a hood mould and (for a window) a projecting sill, round
// an opening in the watch room's outside wall. Each piece sits square to the curve where it is.
function surround(b, mat, RO, deg, half, y0, y1, isWindow) {
  // placement `off` along the wall from the opening's middle, `out` beyond the wall's face
  const at = (off, out, y) => { const a = deg + Math.asin(off / RO) / DEG; return { pos: xz(a, RO + out, y), rot: [0, facing(a), 0], uvScale: 1, wonk: 0.4 }; };
  const jb = isWindow ? y0 - 0.1 : 0;
  for (const s of [-1, 1]) b.box(mat, 0.2, y1 - jb + 0.05, 0.16, null, at(s * (half + 0.11), 0.04, (y1 + jb) / 2));
  b.box(mat, half * 2 + 0.62, 0.3, 0.28, null, at(0, 0, y1 + 0.2));
  b.box(mat, 0.24, 0.4, 0.34, null, at(0, 0.03, y1 + 0.18));
  b.box(mat, half * 2 + 0.82, 0.07, 0.36, null, at(0, 0.04, y1 + 0.385));
  if (isWindow) b.box(mat, half * 2 + 0.52, 0.1, 0.34, null, at(0, 0.06, y0 - 0.05));
}

// ---------------- geometry helpers ----------------

// [x, y, z] at angle deg (clockwise from -Z, seen from above), radius r, height y
function xz(deg, r, y) { const [x, z] = polar(deg, r); return [x, y, z]; }

// a band of wall from deg a0 to a1, y0..y1, its outside facing out (r1 at the bottom, r0 at the top)
function arc(r0, r1, a0, a1, y0, y1, step = 2) {
  const seg = Math.max(2, Math.ceil((a1 - a0) / step));
  const g = new THREE.CylinderGeometry(r0, r1, y1 - y0, seg, Math.max(1, Math.ceil((y1 - y0) / 0.6)), true, Math.PI - a1 * DEG, (a1 - a0) * DEG);
  return g.translate(0, (y0 + y1) / 2, 0);
}

// UVs onto the painted sheet: u by the angle round from the seam, v by height. A triangle across the
// seam takes u past 1 (the sheet repeats), so it doesn't smear the whole way round.
function skinUv(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, uv = g.attributes.uv;
  const us = [0, 0, 0];
  for (let i = 0; i < p.count; i += 3) {
    for (let j = 0; j < 3; j++) us[j] = ((((Math.atan2(p.getX(i + j), -p.getZ(i + j)) / DEG - SKIN.seam) / 360) % 1) + 1) % 1;
    const mx = Math.max(...us);
    for (let j = 0; j < 3; j++) uv.setXY(i + j, mx - us[j] > 0.5 ? us[j] + 1 : us[j], (p.getY(i + j) - SKIN.y0) / (SKIN.y1 - SKIN.y0));
  }
  return g;
}

// UVs in metres on a cylinder band (for the granite, whose tile is a metre)
function metreUv(g, sx, sy) {
  const P = g.parameters, uv = g.attributes.uv;
  sx = sx ?? (P.thetaLength * (P.radiusTop + P.radiusBottom) / 2);
  sy = sy ?? P.height;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

// UVs in metres from x and z, for something lying flat
function flatUv(g) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}

// a lathe of [r, y] pairs with UVs in metres
function metreLathe(pts) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 96);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return metreUv(g, TAU * pts[0][0], len);
}

// a round rod from a to b
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0), _dv = new THREE.Vector3();
function rod(b, mat, p, q, r) {
  _dv.subVectors(q, p);
  const len = _dv.length();
  _q.setFromUnitVectors(_up, _dv.normalize());
  _e.setFromQuaternion(_q, 'YXZ');
  b.add(new THREE.CylinderGeometry(r, r, len, 5, 1, true), mat, { pos: [(p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2], rot: [_e.x, _e.y, _e.z], wonk: 0 });
}

// ---------------- the painted skin ----------------
// Limewash over coursed granite, a multiplier around white (so the wash still decides the hue), and
// its linework in a separate ink sheet: the faint joints of the courses, the broken edges of the render
// where it has come away, cracks running off the window heads.
function paintSkin(ROOM) {
  const { W, H, y0, y1, seam } = SKIN;
  const RO = ROOM.R + ROOM.wall;
  const radius = (y) => (y > SHAFT.y0 ? shaftR(y) : RO);
  const X = (deg) => ((((deg - seam) / 360) % 1) + 1) % 1 * W;
  const Y = (y) => (1 - (y - y0) / (y1 - y0)) * H;
  const pxm = (y) => W / (TAU * radius(y));       // pixels per metre round the tower at height y
  const pym = H / (y1 - y0);                        // pixels per metre up it
  const wrap = (x, half, fn) => { fn(x); if (x - half < 0) fn(x + W); if (x + half > W) fn(x - W); };
  const r = rng(71);
  const INK = '#3A332C';
  const openings = [
    ...WINDOWS.map((o) => ({ deg: o.deg, ya: o.y - 0.1, yz: o.y + WIN.hs + WIN.w / 2 + WIN.m, half: WIN.w / 2 + WIN.m + 0.08 })),
    { deg: ROOM.window.deg, ya: ROOM.window.sill - 0.15, yz: ROOM.window.top + 0.45, half: ROOM.window.half + 0.32 },
    { deg: ROOM.door.deg, ya: 0, yz: ROOM.door.top + 1.1, half: ROOM.door.half + 0.55 },
  ];
  const nearOpening = (deg, y, pad = 0.3) => openings.some((o) => y > o.ya - pad && y < o.yz + pad && Math.abs(((deg - o.deg + 540) % 360) - 180) * DEG * radius(y) < o.half + pad);

  const map = canvasTex('tower-skin', W, H, (ctx) => {
    // the limewash: big soft blotches, warmer and cooler, that tile round the tower
    const lw = 256, lh = 256, low = makeCanvas(lw, lh), lc = low.getContext('2d'), img = lc.createImageData(lw, lh), dd = img.data;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const n = tileFbm(x / lw, y / lh, 9, 31, 4), m = tileFbm(x / lw, y / lh, 3, 37, 2);
      const v = 0.885 + n * 0.075, k = (y * lw + x) * 4;
      dd[k] = 255 * v * (1 + (m - 0.5) * 0.03); dd[k + 1] = 255 * v; dd[k + 2] = 255 * v * (0.985 - (m - 0.5) * 0.03); dd[k + 3] = 255;
    }
    lc.putImageData(img, 0, 0);
    ctx.drawImage(low, 0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    // grimier toward the foot, and in the shelter under the gallery
    let g = ctx.createLinearGradient(0, Y(5), 0, Y(0));
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(200,196,184,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, Y(5), W, Y(y0) - Y(5));
    g = ctx.createLinearGradient(0, Y(y1), 0, Y(y1 - 3));
    g.addColorStop(0, 'rgba(176,170,158,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, Y(y1), W, Y(y1 - 3) - Y(y1));

    // the courses of granite under the wash: each block a slightly different shade, the beds a little sunk
    for (const row of COURSES()) {
      for (const bk of row.blocks) {
        const t = bk.tone;
        ctx.fillStyle = t < 0.55 ? rgba('#8F8A80', 0.025 + t * 0.07) : rgba('#B5A386', (t - 0.55) * 0.12);
        wrap(bk.x, bk.w, (x) => ctx.fillRect(x + 1.5, row.top + 1.5, bk.w - 3, row.bot - row.top - 3));
      }
      ctx.fillStyle = rgba('#8A8478', 0.2);
      ctx.fillRect(0, row.bot - 1, W, 2.5);
    }

    // damp and green algae up from the foot, highest where the spray reaches
    for (let x = 0; x < W; x += 3) {
      const u = x / W, f = (uu) => fbm1(uu * 34, 77, 3);
      const h = 0.75 + 1.5 * (f(u) * (1 - u) + f(u - 1) * u);
      const ga = ctx.createLinearGradient(0, Y(h), 0, Y(0.35));
      ga.addColorStop(0, 'rgba(160,170,138,0)'); ga.addColorStop(0.55, 'rgba(146,158,122,0.45)'); ga.addColorStop(1, 'rgba(112,124,96,0.7)');
      ctx.fillStyle = ga; ctx.fillRect(x, Y(h), 3, Y(0.35) - Y(h));
    }
    // spray stains: soft green blooms, each a few overlapping washes with no hard edge
    for (let i = 0; i < 140; i++) {
      const x = r() * W, y = Y(0.4 + Math.pow(r(), 1.6) * 1.8), R = 6 + r() * 16, a = 0.05 + r() * 0.08;
      for (let j = 0; j < 3; j++) {
        const cx = x + (r() - 0.5) * R, cy = y + (r() - 0.5) * R * 0.5, rr = R * (0.5 + r() * 0.6);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, rgba('#7E8B68', a)); g.addColorStop(1, rgba('#7E8B68', 0));
        ctx.fillStyle = g;
        wrap(cx, rr, (xx) => ctx.fillRect(xx - rr, cy - rr, rr * 2, rr * 2));
      }
    }

    // streaks: water running off the corbels, rust from their cramps and from the rail above
    for (const a of CORBELS) {
      const y = y1 - 0.95, wpx = (0.18 + r() * 0.14) * pxm(y);
      drip(ctx, wrap, X(a), Y(y), (1.6 + r() * 4.8) * pym, wpx, '#7C766A', 0.18 + r() * 0.14, a);
      if (r() < 0.6) drip(ctx, wrap, X(a) + (r() - 0.5) * wpx, Y(y), (0.8 + r() * 3) * pym, 3 + r() * 3, '#9A5A34', 0.25 + r() * 0.2, a + 3);
    }
    for (let i = 0; i < 40; i++) drip(ctx, wrap, X(i * 9 + 4.5), Y(y1 - 0.15), (0.4 + r() * 1.6) * pym, 2 + r() * 3, '#9A5A34', 0.12 + r() * 0.15, i + 500);
    // the weather's long grey streaks down the whole height
    for (let i = 0; i < 70; i++) {
      const y = lerp(4, y1 - 1, r());
      drip(ctx, wrap, r() * W, Y(y), (2 + r() * 7) * pym, (0.05 + r() * 0.2) * pxm(y), '#8E887C', 0.06 + r() * 0.08, i + 900);
    }
    // under every window: a grimy fan from the sill, rust from the iron in the sill's ends, soot at the head
    for (const o of WINDOWS) {
      const x = X(o.deg), k = pxm(o.y), half = (WIN.w / 2 + WIN.m + 0.08) * k;
      drip(ctx, wrap, x, Y(o.y - 0.1), (1.6 + r() * 2.2) * pym, WIN.w * 0.8 * k, '#7E786C', 0.16, o.deg);
      for (const s of [-1, 1]) drip(ctx, wrap, x + s * half * 0.85, Y(o.y - 0.1), (1 + r() * 2.6) * pym, 4 + r() * 3, '#9C5530', 0.32, o.deg + s);
      drip(ctx, wrap, x + (r() - 0.5) * 10, Y(o.y + WIN.hs + WIN.w / 2 + WIN.m + 0.1), (0.4 + r() * 0.6) * pym, WIN.w * k, '#8A847A', 0.12, o.deg + 7);
    }
    // the watch-room window and the door: run-off under the sill, the threshold scuffed and dark
    {
      const ww = ROOM.window, x = X(ww.deg), k = pxm(1);
      drip(ctx, wrap, x, Y(ww.sill - 0.1), 0.8 * pym, ww.half * 2.2 * k, '#7E786C', 0.25, 3);
      for (const s of [-1, 1]) drip(ctx, wrap, x + s * (ww.half + 0.2) * k, Y(ww.sill - 0.1), 0.7 * pym, 4, '#9C5530', 0.3, 4 + s);
      const dx = X(ROOM.door.deg);
      const gd = ctx.createRadialGradient(dx, Y(0.2), 0, dx, Y(0.2), 1.6 * k);
      gd.addColorStop(0, 'rgba(120,112,98,0.45)'); gd.addColorStop(1, 'rgba(120,112,98,0)');
      ctx.fillStyle = gd; ctx.fillRect(dx - 1.6 * k, Y(1.8), 3.2 * k, Y(-0.4) - Y(1.8));
    }
    // copper washing down green from the conductor and its holdfasts
    {
      const x = X(CONDUCTOR);
      for (let y = y1 - 0.2; y > 0.4; y -= 0.35) {
        const k = pxm(y);
        ctx.fillStyle = rgba('#5E8C78', 0.05 + r() * 0.05);
        ctx.fillRect(x - 0.12 * k + (r() - 0.5) * 3, Y(y), 0.24 * k, 0.4 * pym);
      }
      for (let y = 1.2; y < y1 - 0.5; y += 1.5) drip(ctx, wrap, x + (r() - 0.5) * 6, Y(y), (0.4 + r() * 0.9) * pym, 6, '#4F8670', 0.35, y * 10);
    }

    // where the render has come away: the stone beneath, grey and speckled
    for (const p of PATCHES()) {
      wrap(p.x, p.rx, (x) => {
        const pts = p.shape(x);
        ctx.save(); trace(ctx, pts); ctx.clip();
        ctx.fillStyle = rgba('#B2ACA0', 0.6); ctx.fillRect(x - p.rx - 4, p.y - p.ry - 4, p.rx * 2 + 8, p.ry * 2 + 8);
        for (let i = 0; i < p.rx * p.ry * 0.07; i++) {
          ctx.fillStyle = r() < 0.6 ? rgba('#6A645C', 0.35) : rgba('#B88A70', 0.3);
          ctx.fillRect(x + (r() - 0.5) * p.rx * 2, p.y + (r() - 0.5) * p.ry * 2, 1 + r() * 1.5, 1 + r() * 1.5);
        }
        ctx.restore();
        // the lip of the render throws a little shadow on the stone
        ctx.save(); trace(ctx, pts); ctx.clip();
        ctx.strokeStyle = rgba('#6A645A', 0.4); ctx.lineWidth = 5;
        ctx.translate(2, 3); trace(ctx, pts); ctx.stroke();
        ctx.restore();
      });
    }

    // lichen in colonies: orange and sulphur-yellow, grey-green crusts; thickest low down and on
    // the weather side, a few strays up the shaft
    for (let i = 0; i < 110; i++) {
      const low = i < 80, y = low ? 0.4 + Math.pow(r(), 1.8) * 2.4 : 2.5 + r() * 12;
      const a = low || r() < 0.4 ? r() * 360 : 230 + r() * 110, k = pxm(y);
      const t = r(), col = t < 0.45 ? '#D88F3A' : t < 0.7 ? '#C9BC5A' : '#8F9C84';
      const R = (low ? 0.06 + r() * 0.22 : 0.03 + r() * 0.06) * k, n = Math.round(R * R * 0.25) + 6;
      const cx = X(a), cy = Y(y);
      // a faint stain of the colony's colour first, then the crust: thickest towards the rim where
      // it is growing, thin and dead-grey at the old centre
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, rgba('#9A968A', 0.1)); g.addColorStop(0.7, rgba(col, 0.14)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      wrap(cx, R, (x) => { ctx.save(); ctx.translate(x, cy); ctx.scale(1, 0.8); ctx.translate(-x, -cy); ctx.fillRect(x - R, cy - R, R * 2, R * 2); ctx.restore(); });
      for (let j = 0; j < n; j++) {
        const rr = R * Math.pow(r(), 0.6), th = r() * TAU, d = 0.4 + r() * 1.3;
        ctx.fillStyle = rgba(col, (0.1 + r() * 0.25) * (0.4 + rr / R));
        wrap(cx, R, (x) => ctx.fillRect(x + Math.cos(th) * rr - d / 2, cy + Math.sin(th) * rr * 0.8 - d / 2, d, d * (0.6 + r() * 0.8)));
      }
    }

    // patches of fresh limewash where the keepers have touched it up round the door
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {
      const a = ROOM.door.deg + (r() - 0.5) * 40, y = 0.6 + r() * 2.6;
      if (nearOpening(a, y, -0.1)) continue;
      const pts = wobble(ellipsePts(X(a), Y(y), (0.3 + r() * 0.5) * pxm(y), (0.2 + r() * 0.3) * pym, 22), { amp: 6, freq: 0.1, seed: i + 40, step: 5 });
      ctx.fillStyle = 'rgba(244,243,238,0.12)'; trace(ctx, pts); ctx.fill();
    }
  });

  const ink = canvasTex('tower-skin-ink', W, H, (ctx) => {
    ctx.clearRect(0, 0, W, H);
    // the joints of the courses, faint through the wash
    for (const row of COURSES()) {
      const pts = [];
      for (let x = -16; x <= W + 16; x += 24) pts.push([x, row.bot + (noise1(x * 0.02, row.i) - 0.5) * 1.6]);
      inkLine(ctx, pts, { width: 1.1, alpha: 0.13, seed: row.i, breaks: 0.12, color: INK });
      for (const bk of row.blocks) if (r() < 0.75) wrap(bk.x, 4, (x) => inkLine(ctx, [[x, row.top + 2], [x + (r() - 0.5) * 2, row.bot - 2]], { width: 1, alpha: 0.1, seed: bk.x, breaks: 0, color: INK }));
    }
    // the render's broken edge, and the joints showing plain in the stone beneath
    for (const p of PATCHES()) {
      wrap(p.x, p.rx, (x) => {
        const pts = p.shape(x);
        ctx.save(); trace(ctx, pts); ctx.clip();
        for (const row of COURSES()) {
          if (row.bot < p.y - p.ry - 50 || row.top > p.y + p.ry + 50) continue;
          inkLine(ctx, [[x - p.rx - 10, row.bot], [x + p.rx + 10, row.bot]], { width: 1.6, alpha: 0.5, seed: row.i + 3, breaks: 0.03, color: INK });
          for (const bk of row.blocks) for (const dx of [0, W, -W]) if (Math.abs(bk.x + dx - x) < p.rx + 10) inkLine(ctx, [[bk.x + dx, row.top], [bk.x + dx, row.bot]], { width: 1.5, alpha: 0.5, seed: bk.x, breaks: 0, color: INK });
        }
        ctx.restore();
        inkLine(ctx, [...pts, pts[0]], { width: 1.3, alpha: 0.55, seed: p.seed, breaks: 0.06, color: INK });
      });
    }
    // cracks: off the corners of the window heads, and a few hairlines in the render
    const crack = (x, y, ang, len, seed, depth = 0) => {
      const cr = rng(seed), pts = [[x, y]];
      let a = ang;
      for (let s = 0; s < len; s += 6) { a += (cr() - 0.5) * 0.7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); if (depth < 2 && cr() < 0.04) crack(x, y, a + (cr() < 0.5 ? 0.7 : -0.7), len * 0.4, seed + s, depth + 1); }
      wrap(pts[0][0], len, (xx) => inkLine(ctx, pts.map(([px, py]) => [px - pts[0][0] + xx, py]), { width: 1 - depth * 0.25, alpha: 0.45 - depth * 0.1, seed, breaks: 0.04, color: INK, vary: 0.8 }));
    };
    for (const o of WINDOWS) {
      const k = pxm(o.y), top = Y(o.y + WIN.hs + WIN.w / 2 + WIN.m), x = X(o.deg);
      for (const s of [-1, 1]) if (r() < 0.75) crack(x + s * (WIN.w / 2 + WIN.m) * k * 0.7, top, -Math.PI / 2 + s * (0.5 + r() * 0.5), (0.3 + r() * 0.8) * pym, o.deg * 10 + s);
      if (r() < 0.6) crack(x + (r() - 0.5) * WIN.w * k, Y(o.y - 0.12), Math.PI / 2 + (r() - 0.5) * 0.6, (0.3 + r() * 0.6) * pym, o.deg * 13);
    }
    for (let i = 0; i < 14; i++) {
      const y = 1 + r() * (y1 - 3), a = r() * 360;
      if (nearOpening(a, y)) continue;
      crack(X(a), Y(y), r() * TAU, (0.25 + r() * 0.7) * pym, 300 + i);
    }
  });
  return { map, ink };

  // the courses and their blocks (same every call): rows of granite about 0.46 m high, broken joint
  function COURSES() {
    if (COURSES.rows) return COURSES.rows;
    const cr = rng(17), rows = [];
    let i = 0;
    for (let y = y0 + 0.2; y < y1; y += 0.46, i++) {
      const top = Y(Math.min(y1, y + 0.46)), bot = Y(y);
      const n = Math.max(10, Math.round((TAU * radius(y + 0.23)) / (0.9 + cr() * 0.35)));
      const ws = Array.from({ length: n }, () => 0.7 + cr() * 0.6), sum = ws.reduce((a, c) => a + c, 0);
      let x = (i % 2 ? 0.5 : 0) * (W / n) + cr() * 10;
      rows.push({ i, top, bot, blocks: ws.map((wv) => { const bk = { x: x % W, w: (wv / sum) * W, tone: cr() }; x += bk.w; return bk; }) });
    }
    return (COURSES.rows = rows);
  }
  // where the render has come away (same every call): low on the tower and on the weather side, mostly
  function PATCHES() {
    if (PATCHES.list) return PATCHES.list;
    const pr = rng(29), list = [];
    for (let i = 0; list.length < 11 && i < 80; i++) {
      const y = lerp(0.6, y1 - 2, Math.pow(pr(), 2.2)), a = (pr() < 0.6 ? 230 + pr() * 110 : pr() * 360) % 360;
      if (nearOpening(a, y, 0.5)) continue;
      const rx = (0.3 + pr() * 0.7) * pxm(y), ry = (0.1 + pr() * 0.22) * pym, x = X(a), seed = 200 + i, py = Y(y);
      // a broad irregular outline, then a fine ragged one on top of it, so the edge reads as render
      // flaked off in pieces and not a cut-out
      const shape = (cx) => wobble(wobble(ellipsePts(cx, py, rx, ry, 36), { amp: ry * 0.38, freq: 0.012, seed, step: 6 }), { amp: 2.2, freq: 0.09, seed: seed + 1, step: 2.5 });
      list.push({ x, y: py, rx, ry, seed, shape });
    }
    return (PATCHES.list = list);
  }
}

// A run of water, grime or rust down the wall from (x, y), `len` long and `w` wide (pixels), fading out.
function drip(ctx, wrap, x, y, len, w, color, a, seed) {
  const L = [], R = [], n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n, yy = y + t * len;
    const ww = w * (1 - t * 0.6) * (0.75 + 0.35 * noise1(t * 5, seed));
    const xx = (noise1(t * 3, seed + 5) - 0.5) * Math.min(w * 0.3, 6);
    L.push([xx - ww / 2, yy]); R.push([xx + ww / 2, yy]);
  }
  const g = ctx.createLinearGradient(0, y, 0, y + len);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.3, rgba(color, a * 0.75)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  const pts = [...L, ...R.reverse()];
  wrap(x, w, (cx) => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + cx, py) : ctx.moveTo(px + cx, py))); ctx.fill(); });
}
