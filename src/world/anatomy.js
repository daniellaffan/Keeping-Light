// How far each joint of the keeper's arm and hand can move: one table, shared by the hands' contact
// solver and its tests, and the reading of every joint's angle off the posed skeleton.
//
// The numbers are the American Academy of Orthopaedic Surgeons' normal ranges of motion (AAOS, "Joint
// Motion: Method of Measuring and Recording", 1965; tabulated in Norkin & White, "Measurement of Joint
// Motion: A Guide to Goniometry", appendix A). Where this table differs, it says why:
// * the wrist itself does not twist: the hand's whole turn about the forearm is the forearm's
//   (pronation and supination). The skeleton shares that turn out down its bones so the skin twists
//   gradually (elbow, mid-forearm, wrist), so the turn is read off the hand, not any one bone; the
//   wrist bone's share is reported, not limited;
// * finger spread at the knuckles is not in the AAOS table; ±20° is the usual textbook figure;
// * the thumb's base (CMC) is a saddle joint measured as the angles between the first and second long
//   bones of the hand: palmar abduction (out of the palm's plane) is AAOS's 70°; the angle in the palm's
//   plane and the thumb's turn toward the fingers (opposition) are read and reported, not limited.
// Degrees. Signs: flexion +, extension (hyperextension) −; pronation +, supination −; at the wrist
// extension (back) + and radial deviation (toward the thumb) +.
import * as THREE from 'three';
import { FINGERS, FNAMES } from './handmesh.js';

export const ANATOMY = {
  elbow: { flex: [0, 150] },                       // a hinge: it bends, nothing else
  forearm: { turn: [-80, 80] },                    // supination 80, pronation 80, from thumb-up
  wrist: { ext: 70, flex: 80, radial: 20, ulnar: 30 },
  mcp: { flex: [-45, 90], spread: [-20, 20] },     // finger knuckles: bend, and a little spread
  pip: { flex: [0, 100] },                         // middle joints: bend only
  dip: { flex: [-10, 90] },                        // end joints: bend only
  thumb: { palmarAbd: [0, 70], mcp: [0, 50], ip: [-20, 80] },
  hinge: 1,                                        // how far (°) a bend-only joint may stray off its hinge
};

const R2D = 180 / Math.PI;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _c = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// Every joint angle of an arm as it is posed now (its bones' local rotations), in degrees, keyed by name.
export function jointAngles(arm) {
  const B = arm.B, side = arm.side, out = {};
  B.shoulder.updateWorldMatrix(true, true);
  // the elbow: the angle between the upper arm and the forearm, about the hinge (the upper arm's +Y)
  const ud = _a.set(0, 0, -1).transformDirection(B.shoulder.matrixWorld);
  const fd = _b.set(0, 0, -1).transformDirection(B.elbow.matrixWorld);
  out['elbow.flex'] = Math.acos(Math.max(-1, Math.min(1, ud.dot(fd)))) * R2D;
  const hinge = _y.set(0, 1, 0).transformDirection(B.shoulder.matrixWorld);
  out['elbow.offHinge'] = Math.abs(90 - Math.acos(Math.max(-1, Math.min(1, hinge.dot(fd)))) * R2D);
  // the wrist: the hand relative to the forearm's end, as swing (two bends) and twist (the wrist bone's
  // share of the forearm's turn)
  const w = decompose(B.wrist.quaternion, side);
  out['wrist.ext'] = w.ext; out['wrist.dev'] = w.dev; out['wrist.share'] = w.twist;
  // the forearm's turn: the twist bone's back, about the forearm's axis, from the hinge (thumb-up), and
  // the wrist bone's share on top; pronation turns the back of a right hand up from facing out
  const yT = _z.set(0, 1, 0).transformDirection(B.twist.matrixWorld);
  const zAx = _x.copy(fd).negate();
  const turn = Math.atan2(_c.crossVectors(hinge, yT).dot(zAx), hinge.dot(yT)) * R2D;
  out['forearm.turn'] = turn * side + w.twist;
  // inside the elliptical cone of the wrist's range: 1 on the edge
  out['wrist.cone'] = Math.hypot(w.ext / (w.ext >= 0 ? ANATOMY.wrist.ext : ANATOMY.wrist.flex), w.dev / (w.dev >= 0 ? ANATOMY.wrist.radial : ANATOMY.wrist.ulnar));
  for (const f of FNAMES) {
    _e.setFromQuaternion(B[f + '1'].quaternion, 'YXZ');
    out[f + '.mcp'] = -_e.x * R2D;
    out[f + '.spread'] = (_e.y * side - FINGERS[f].nat) * R2D;
    out[f + '.mcpOff'] = Math.abs(_e.z) * R2D;
    for (const [k, j] of [['pip', 2], ['dip', 3]]) {
      _e.setFromQuaternion(B[f + j].quaternion, 'YXZ');
      out[f + '.' + k] = -_e.x * R2D;
      out[f + '.' + k + 'Off'] = Math.hypot(_e.y, _e.z) * R2D;
    }
  }
  // the thumb's base: its long bone against the index finger's, in the hand's frame
  Object.assign(out, thumbBase(arm));
  for (const [k, j] of [['mcp', 2], ['ip', 3]]) {
    _e.setFromQuaternion(B['thumb' + j].quaternion, 'YXZ');
    out['thumb.' + k] = -_e.x * R2D;
    out['thumb.' + k + 'Off'] = Math.hypot(_e.y, _e.z) * R2D;
  }
  return out;
}

// swing (extension, deviation) and twist of the wrist, from its local rotation (as hands.js clamps it)
export function decompose(q, side) {
  const tw = new THREE.Quaternion(0, 0, q.z, q.w).normalize();
  if (tw.w < 0) tw.set(0, 0, -tw.z, -tw.w);
  const twist = 2 * Math.atan2(tw.z, tw.w);
  const sw = q.clone().multiply(tw.invert());
  if (sw.w < 0) sw.set(-sw.x, -sw.y, -sw.z, -sw.w);
  const sn = Math.hypot(sw.x, sw.y);
  const ang = 2 * Math.atan2(sn, sw.w);
  const ext = sn > 1e-9 ? ang * sw.x / sn : 0, dev = sn > 1e-9 ? ang * sw.y / sn * side : 0;
  return { ext: ext * R2D, dev: dev * R2D, twist: twist * R2D * side };
}

// The thumb's long bone (CMC): palmar abduction, the angle in the palm's plane and its turn, measured
// against the index finger's long bone (wrist base to knuckle) in the hand's frame.
const INDEX_MC = new THREE.Vector3(-0.026 + 0.013, 0, -0.084 + 0.024).normalize();     // (right hand)
export function thumbBase(arm) {
  const side = arm.side;
  // the thumb's long bone in the wrist's frame: its -Z, carried through its rest and its pose
  _q.copy(arm.B.thumb1.quaternion);
  const m = _a.set(0, 0, -1).applyQuaternion(_q);
  m.x *= side;
  const a2 = INDEX_MC;
  const rad = _y.set(0, 1, 0).cross(a2).normalize();        // across the palm, toward the thumb
  const pal = _z.set(0, -1, 0);                              // out of the palm
  const ma = m.dot(a2), mr = m.dot(rad), mp = m.dot(pal);
  // the thumb's nail: which way it faces about its own bone (its -Y is the pad)
  const nail = _x.set(0, 1, 0).applyQuaternion(_q); nail.x *= side;
  return {
    'thumb.palmarAbd': Math.atan2(mp, ma) * R2D,
    'thumb.radialAbd': Math.atan2(mr, ma) * R2D,
    'thumb.turn': Math.atan2(nail.dot(pal), nail.dot(rad)) * R2D,
  };
}

// Which angles are limited and how: name → [lo, hi] (null: read and reported, not limited)
export function limits() {
  const L = {
    'elbow.flex': ANATOMY.elbow.flex, 'elbow.offHinge': [0, ANATOMY.hinge],
    'forearm.turn': ANATOMY.forearm.turn,
    'wrist.ext': [-ANATOMY.wrist.flex, ANATOMY.wrist.ext], 'wrist.dev': [-ANATOMY.wrist.ulnar, ANATOMY.wrist.radial],
    'wrist.share': null, 'wrist.cone': [0, 1],
    'thumb.palmarAbd': ANATOMY.thumb.palmarAbd, 'thumb.radialAbd': null, 'thumb.turn': null,
    'thumb.mcp': ANATOMY.thumb.mcp, 'thumb.ip': ANATOMY.thumb.ip, 'thumb.mcpOff': [0, ANATOMY.hinge], 'thumb.ipOff': [0, ANATOMY.hinge],
  };
  for (const f of FNAMES) {
    L[f + '.mcp'] = ANATOMY.mcp.flex; L[f + '.spread'] = ANATOMY.mcp.spread; L[f + '.mcpOff'] = [0, ANATOMY.hinge];
    L[f + '.pip'] = ANATOMY.pip.flex; L[f + '.pipOff'] = [0, ANATOMY.hinge];
    L[f + '.dip'] = ANATOMY.dip.flex; L[f + '.dipOff'] = [0, ANATOMY.hinge];
  }
  return L;
}
