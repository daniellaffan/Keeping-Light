// Debug: contact sheets of the hands. Each pose is held where it's naturally seen, under day, dusk
// lamp, night and haar, tiled 2×2 and saved by the dev server to docs/screenshots/hands-<pose>.jpg.
//   __review.hands()            every pose
//   __review.hands(['write'])   just these
import * as THREE from 'three';
import { POSE_NAMES, POSES } from './hands.js';

const LIGHTS = [['day', {}], ['dusk', {}], ['night', {}], ['dusk', { haar: 1 }]];
const LABELS = ['day', 'dusk lamp', 'night', 'haar'];

export function installReview(game) {
  const k = game.keeper;
  const grab = (tw, th) => {
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    c.getContext('2d').drawImage(game.canvas, 0, 0, tw, th);
    return c;
  };
  async function shoot(pose, { save = true, w = 1280 } = {}) {
    const cw = game.canvas.width, ch = game.canvas.height;
    const tw = Math.round(w / 2), th = Math.round(tw * ch / cw);
    const sheet = document.createElement('canvas');
    sheet.width = tw * 2; sheet.height = th * 2;
    const sx = sheet.getContext('2d');
    for (let i = 0; i < LIGHTS.length; i++) {
      k.review(pose, LIGHTS[i][0], LIGHTS[i][1]);
      game.snapLook = true;
      // let the springs and the look settle (unpainted), then take the frame in the same task it's drawn
      const nr = game.noRender;
      game.noRender = true;
      game.step(40, 1 / 30);
      game.noRender = false;
      game.step(1, 1 / 30);
      game.noRender = nr;
      sx.drawImage(grab(tw, th), (i % 2) * tw, Math.floor(i / 2) * th);
      sx.font = 'italic 20px "Cormorant Garamond", serif';
      sx.fillStyle = 'rgba(30,26,22,0.8)';
      sx.fillText(`${pose} · ${LABELS[i]}`, (i % 2) * tw + 14, Math.floor(i / 2) * th + th - 14);
      await new Promise((r) => setTimeout(r, 30));
    }
    const url = sheet.toDataURL('image/jpeg', 0.86);
    if (save) await fetch(`/__shot?name=hands-${pose}.jpg`, { method: 'POST', body: url });
    return url.length;
  }
  // Fit a grip: bend the right hand's thumb, index and middle so their pads rest on the held tool's
  // shaft (thumb and index pinching it a couple of centimetres from the tip, the middle finger's side
  // under it). Coordinate descent on the pose's own numbers; returns them to paste into POSES.
  function fit(poseName = 'write', iters = 60) {
    const h = k.hands, arm = h.R, B = arm.B;
    const P = POSES[poseName].R;
    const tool = h.tools[P.hold];
    const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    const R = 0.0036;
    const pad = (bone, x, y, z) => B[bone].localToWorld(v.set(x, y, z)).clone();
    const shaft = () => {
      tool.updateWorldMatrix(true, false);
      a.set(0, 0.014, 0).applyMatrix4(tool.matrixWorld);
      b.set(0, 0.06, 0).applyMatrix4(tool.matrixWorld);
      return [a.clone(), b.clone()];
    };
    const segDist = (p, s0, s1) => { const d = s1.clone().sub(s0); const t = Math.max(0, Math.min(1, p.clone().sub(s0).dot(d) / d.lengthSq())); return [p.distanceTo(s0.clone().addScaledVector(d, t)), t]; };
    const cost = () => {
      h.fingers(arm, { fingers: P.fingers, thumb: P.thumb }, 'R');
      B.wrist.updateMatrixWorld(true);
      const [s0, s1] = shaft();
      const tp = pad('thumb3', 0, -0.008, -0.012);
      const ip = pad('index3', 0, -0.0068, -0.009);
      const mp = pad('middle3', -0.007, -0.002, -0.009);
      let c = 0;
      for (const [p, want, tw] of [[tp, 0.15, 1], [ip, 0.2, 1], [mp, 0.05, 0.6]]) {
        const [d, t] = segDist(p, s0, s1);
        c += tw * Math.pow((d - R) * 100, 2) + Math.pow((t - want) * 2, 2);
      }
      // keep the finger tips out of the shaft and off each other
      const ti = pad('thumb3', 0, 0, -0.024), ii = pad('index3', 0, 0, -0.018);
      if (ti.distanceTo(ii) < 0.014) c += Math.pow((0.014 - ti.distanceTo(ii)) * 300, 2);
      return c;
    };
    // fingers belong to this pose alone from here on
    P.fingers = JSON.parse(JSON.stringify(P.fingers)); P.thumb = P.thumb.slice();
    const params = [];
    for (const f of ['index', 'middle']) for (let i = 1; i < 4; i++) params.push([P.fingers[f], i]);
    for (let i = 0; i < 5; i++) params.push([P.thumb, i]);
    let best = cost(), step = 0.15;
    for (let it = 0; it < iters; it++) {
      let improved = false;
      for (const [arr, i] of params) {
        for (const dir of [1, -1]) {
          const old = arr[i];
          arr[i] = Math.max(-0.6, Math.min(1.6, old + dir * step));
          const c = cost();
          if (c < best) { best = c; improved = true; } else arr[i] = old;
        }
      }
      if (!improved) step *= 0.6;
      if (step < 0.002) break;
    }
    cost();
    const r3 = (x) => Math.round(x * 100) / 100;
    return { cost: best, index: P.fingers.index.map(r3), middle: P.fingers.middle.map(r3), thumb: P.thumb.map(r3) };
  }

  // one pose under one light, left on screen for a look
  function one(pose, i = 1) {
    game.transition = null;
    k.review(pose, LIGHTS[i][0], LIGHTS[i][1]);
    game.snapLook = true;
    game.step(40, 1 / 30);
  }

  // a close look at one hand: the camera `dist` m from the wrist's middle, from a direction given in the
  // hand's own frame (az round it, el above it), the body left where the pose put it
  function studio(pose, { hand = 'R', az = 0, el = 0.6, dist = 0.32, fov = 30, light = 0, at = [0, 0, -0.07] } = {}) {
    game.transition = null;
    k.review(pose, LIGHTS[light][0], LIGHTS[light][1]);
    k.camOverride = null;
    game.snapLook = true;
    game.step(30, 1 / 30);
    const w = k.hands[hand].B.wrist;
    w.updateWorldMatrix(true, false);
    const target = new THREE.Vector3(...at).applyMatrix4(w.matrixWorld);
    const q = new THREE.Quaternion().setFromRotationMatrix(w.matrixWorld);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).applyQuaternion(q);
    k.camOverride = { pos: target.clone().addScaledVector(dir, dist), target, fov };
    game.step(2, 1 / 30);
  }

  window.__review = {
    fit,
    one,
    studio,
    off() { k.camOverride = null; },
    async hands(list = POSE_NAMES, opts) {
      game.transition = null;
      const out = {};
      for (const p of list) out[p] = await shoot(p, opts);
      k.lookOverride = null;
      return out;
    },
    shoot,
  };
}
