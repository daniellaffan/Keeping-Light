// The things the keeper inks the plan with: a squat glass inkwell, and a goose quill that stands in it.
// The quill is held like the pencil (its writing point at the origin, the shaft up +Y); the inkwell
// stands on its base (origin at the middle of the base).
import * as THREE from 'three';
import { wash } from './materials.js';
import { letteringTex } from './textures.js';

// where the quill stands in its well (in the well's own frame): the point down in the ink, leaning
// back toward the keeper and a little to the right, the way it will be held
export const QUILL_IN_WELL = { pos: new THREE.Vector3(0.0, 0.012, 0.0), rot: new THREE.Euler(0.62, -0.42, 0.08, 'YXZ') };

export function inkwell() {
  const g = new THREE.Group();
  g.name = 'inkwell';
  const glass = wash({ color: '#3A4A44', color2: '#2E3C38', line: 1, crease: 0.4, gran: 0.3, turb: 0.5, noiseScale: 60 });
  const inkMat = wash({ color: '#151A24', color2: '#10141C', line: 0.6, gran: 0.1, lit: 0.6, noiseScale: 60 });
  const brass = wash({ color: '#B08A4A', color2: '#9C7840', line: 1, gran: 0.4, noiseScale: 80 });
  // a squat glass body, a sloping shoulder, a short neck and a thick lip
  const prof = [[0, 0], [0.033, 0], [0.036, 0.004], [0.036, 0.03], [0.031, 0.04], [0.016, 0.047], [0.0135, 0.05], [0.0135, 0.056], [0.0165, 0.057], [0.0165, 0.061], [0.011, 0.061], [0.011, 0.048]];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20), glass);
  // the ink, a little way down the neck
  const ink = new THREE.Mesh(new THREE.CircleGeometry(0.0112, 14).rotateX(-Math.PI / 2).translate(0, 0.05, 0), inkMat);
  // a brass collar round the neck
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.004, 14).translate(0, 0.052, 0), brass);
  g.add(body, ink, collar);
  return g;
}

// the barbs of a feather, drawn in fine ink across the vane (u along the quill, v out from the shaft)
function barbsTex() {
  return letteringTex('quill-barbs', 512, 128, (c, w, h) => {
    c.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const x = (i / 150) * w;
      c.strokeStyle = `rgba(70,62,54,${0.18 + (i % 3 === 0 ? 0.12 : 0)})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, h);
      // barbs leave the shaft and curve up toward the tip of the feather
      c.quadraticCurveTo(x + 10, h * 0.45, x + 26 + (i % 5), 2);
      c.stroke();
    }
    // a split or two, where the barbs have parted
    c.strokeStyle = 'rgba(60,52,46,0.5)';
    c.lineWidth = 1.4;
    for (const s of [0.34, 0.61, 0.83]) { c.beginPath(); c.moveTo(s * w, h * 0.55); c.lineTo(s * w + 20, 0); c.stroke(); }
  });
}

export function quill() {
  const g = new THREE.Group();
  g.name = 'quill';
  const L = 0.29;
  // the shaft bends a little along its length
  const bend = (y) => new THREE.Vector3(0.014 * Math.pow(y / L, 2), y, -0.006 * Math.pow(y / L, 2));
  // shaft: the cut nib, the clear barrel, then the rachis tapering to nothing
  const rad = (y) => (y < 0.014 ? 0.0004 + (0.0023 - 0.0004) * Math.pow(y / 0.014, 0.7) : y < 0.075 ? 0.0023 - (y - 0.014) * 0.002 : Math.max(0.0005, 0.0022 * (1 - (y - 0.075) / (L - 0.075)) + 0.0004));
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => bend((i / 23) * L)));
  const shaftGeo = new THREE.TubeGeometry(path, 60, 1, 6, false);
  // scale the tube's rings to the radius profile
  {
    const p = shaftGeo.attributes.position, n = 61;
    for (let i = 0; i < n; i++) {
      const c = path.getPointAt(i / (n - 1)), r = rad((i / (n - 1)) * L);
      for (let k = 0; k <= 6; k++) {
        const j = i * 7 + k, v = new THREE.Vector3().fromBufferAttribute(p, j).sub(c).multiplyScalar(r);
        p.setXYZ(j, c.x + v.x, c.y + v.y, c.z + v.z);
      }
    }
    shaftGeo.computeVertexNormals();
  }
  const shaftMat = wash({ color: '#E2D8C2', color2: '#D6CAB0', line: 1, crease: 0.3, gran: 0.3, noiseScale: 200 });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  // the nib, dark with years of ink
  const nib = new THREE.Mesh(new THREE.ConeGeometry(0.0021, 0.016, 6).rotateX(Math.PI).translate(0, 0.008, 0), wash({ color: '#2A2C34', color2: '#22242C', line: 1, gran: 0.2 }));
  // vanes: a narrow one on the leading edge, a broad one behind, cupped, the barbs swept up
  const vaneMat = wash({ color: '#EFE9DC', color2: '#DCD3C2', line: 1, crease: 0.25, gran: 0.35, turb: 0.4, noiseScale: 120, inkMap: barbsTex(), inkAmt: 1, side: THREE.DoubleSide });
  const vane = (side, width) => {
    const nu = 40, nv = 5, y0 = 0.09;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, y = y0 + (L - y0) * u;
      // full a third of the way up, rounding off to the tip, ragged where the barbs have split
      let w = width * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.75) * 1.02)), 0.6);
      if (Math.abs(u - (side > 0 ? 0.41 : 0.63)) < 0.025) w *= 0.55;
      const c = bend(y);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        pos.push(c.x + side * w * v, c.y + w * v * 0.42, c.z + Math.pow(w * v, 2) * 6 * (side > 0 ? 1 : 0.6));
        uv.push(u, v);
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, vaneMat);
  };
  g.add(shaft, nib, vane(1, 0.011), vane(-1, 0.024));
  g.userData.tip = new THREE.Vector3(0, 0, 0);
  return g;
}
