// Nora, who keeps the shop in Port na Rón. A countrywoman in her fifties: grey hair pinned up, a broad
// weathered face, a moss-green cardigan with the sleeves pushed up over a cream blouse, a wraparound
// pinafore in a faded print over a dark wool skirt, thick stockings and black lace-ups, a tea towel
// over her shoulder. Her face is left soft, as a painter would leave it at this distance: the wind in
// her cheeks and the shade of her brows, no features drawn in ink.
//
// She stands just inside the shop door. She breathes, shifts her weight, folds her hands or wipes them
// on her apron; she turns to you when you come near, and faces you while you read her. Across the
// story she fades: slower to notice you, looking past you out to sea; on night 12 she is behind the
// counter and doesn't look up; from night 13 the doorway is empty.
import * as THREE from 'three';
import { wash } from '../materials.js';
import { canvasTex, knitTex } from '../textures.js';
import { rng } from '../../render/paint.js';
import { toWorld } from '../geo.js';
import { Figure, skeleton, attach, builder, lathe, limb, blob, pose } from './figure.js';

// ---------------- what she's made of ----------------
function faceTex() {
  return canvasTex('nora-face', 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const soft = (x, y, rx, ry, col, a) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.save(); ctx.translate(x * w, y * h); ctx.scale(rx * w, ry * h);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    // the front of the head is at u = 0.25; the equator (her eyes) at v = 0.5
    for (const s of [-1, 1]) {
      soft(0.25 + s * 0.066, 0.6, 0.06, 0.14, '210,110,100', 0.45);   // cheeks, reddened by wind
      soft(0.25 + s * 0.04, 0.5, 0.028, 0.06, '120,90,90', 0.38);   // the shade of the eyes
      soft(0.25 + s * 0.042, 0.435, 0.036, 0.028, '100,90,88', 0.4);   // brows
    }
    soft(0.25, 0.71, 0.03, 0.03, '180,95,90', 0.35);                // the mouth, only a warmth
    soft(0.25, 0.36, 0.08, 0.06, '215,150,130', 0.25);              // weather on the forehead
  });
}

function printTex() {
  return canvasTex('nora-print', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const r = rng(57);
    // small sprigs, washed many times: faded blue and rose
    for (let i = 0; i < 220; i++) {
      const x = r() * w, y = r() * h, c = r() < 0.5 ? '150,165,195' : '200,150,150';
      ctx.fillStyle = `rgba(${c},${0.35 + r() * 0.2})`;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 2.1) * 3, y + Math.sin(k * 2.1) * 3, 2.6, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(140,160,120,0.3)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 8); ctx.stroke();
    }
  });
}

function towelTex() {
  return canvasTex('nora-towel', 64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(180,70,60,0.6)';
    for (const y of [0.12, 0.2, 0.8, 0.88]) ctx.fillRect(0, y * h, w, 0.035 * h);
  });
}

function mats() {
  const skinO = { color: '#D8AC92', color2: '#CB9A80', line: 0.9, crease: 0.5, gran: 0.25, noiseScale: 6, band: 0.45, bare: 0.3 };
  return {
    skin: wash(skinO),
    face: wash({ ...skinO, map: faceTex() }),
    hair: wash({ color: '#A39D95', color2: '#8A847C', line: 0.9, crease: 0.6, gran: 0.7, noiseScale: 12 }),
    cardigan: wash({ color: '#6F7748', color2: '#5E683E', line: 1, crease: 0.6, gran: 0.9, noiseScale: 7, map: knitTex(23), mapAmt: 0.6 }),
    pinafore: wash({ color: '#DDD7C6', color2: '#D0C9B5', line: 1, crease: 0.5, gran: 0.4, noiseScale: 5, map: printTex(), bare: 0.6 }),
    blouse: wash({ color: '#EEE8D8', line: 0.9, crease: 0.4, gran: 0.3, noiseScale: 5 }),
    skirt: wash({ color: '#3E3C46', color2: '#35333C', line: 1, crease: 0.6, gran: 0.8, noiseScale: 6 }),
    stocking: wash({ color: '#5E5044', color2: '#54473C', line: 1, crease: 0.5, gran: 0.6, noiseScale: 8 }),
    shoe: wash({ color: '#28241F', color2: '#221E1A', line: 1, crease: 0.6, gran: 0.3, noiseScale: 8 }),
    towel: wash({ color: '#EAE6DC', line: 0.9, crease: 0.4, gran: 0.4, noiseScale: 5, map: towelTex() }),
  };
}

// ---------------- dressing the skeleton ----------------
function dress() {
  const M = mats(), sk = skeleton();
  // legs and shoes, standing
  const legs = builder(61);
  for (const s of [-1, 1]) {
    legs.cyl(M.stocking, 0.058, 0.044, 0.46, [s * 0.095, 0.3, 0], { seg: 10, wonk: 0 });
    legs.add(new THREE.CapsuleGeometry(0.046, 0.13, 4, 10), M.shoe, { pos: [s * 0.097, 0.045, 0.035], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.75], wonk: 0 });
    legs.box(M.shoe, 0.1, 0.022, 0.25, [s * 0.097, 0.011, 0.035], { wonk: 0 });
  }
  attach(sk.root, legs, 'nora-legs');
  // the skirt, and the pinafore wrapped over it, a hand's width shorter
  const skirt = [[0.272, -0.53], [0.258, -0.38], [0.238, -0.2], [0.215, -0.08], [0.19, 0.02], [0.17, 0.07]];
  const hips = builder(62);
  lathe(hips, M.skirt, skirt);
  lathe(hips, M.pinafore, skirt.map(([r, y], i) => [r + 0.012, i === 0 ? -0.47 : y]));
  attach(sk.hips, hips, 'nora-skirt');
  // the body: the pinafore's bib, the blouse at the collar, the cardigan open over both
  const body = builder(63);
  lathe(body, M.pinafore, [[0.18, -0.16], [0.182, -0.02], [0.19, 0.1], [0.2, 0.18], [0.195, 0.25], [0.18, 0.31], [0.145, 0.36], [0.08, 0.395], [0.045, 0.405]], { depth: 0.74 });
  blob(body, M.pinafore, 0.12, [0, 0.19, 0.045], [1.3, 0.72, 0.8]);
  lathe(body, M.cardigan, [[0.272, -0.2], [0.248, -0.1], [0.22, 0.0], [0.217, 0.1], [0.22, 0.18], [0.212, 0.25], [0.196, 0.31], [0.162, 0.355], [0.1, 0.392], [0.068, 0.402]], { gap: 0.8 });
  body.add(new THREE.TorusGeometry(0.058, 0.017, 6, 16), M.blouse, { pos: [0, 0.39, 0.005], rot: [Math.PI / 2 - 0.2, 0, 0], scale: [1, 0.85, 1], wonk: 0 });
  // the tea towel over her left shoulder
  body.box(M.towel, 0.11, 0.012, 0.28, [0.125, 0.385, 0], { rot: [0, 0, -0.3], wonk: 0 });
  body.box(M.towel, 0.11, 0.2, 0.012, [0.13, 0.29, 0.15], { rot: [0.2, 0, 0], wonk: 0 });
  body.box(M.towel, 0.11, 0.2, 0.012, [0.13, 0.29, -0.15], { rot: [-0.2, 0, 0], wonk: 0 });
  sk.breathe.push(attach(sk.chest, body, 'nora-body'));
  // the head: a broad face, the hair gone grey and pinned up in a bun
  const head = builder(64);
  head.cyl(M.skin, 0.043, 0.047, 0.13, [0, 0.03, 0], { seg: 10, wonk: 0 });
  blob(head, M.face, 0.105, [0, 0.142, 0.01], [1.0, 1.12, 1.0], [0, 0, 0], 20);
  // a broad jaw and chin, so the head isn't a ball
  blob(head, M.skin, 0.07, [0, 0.078, 0.022], [1.2, 0.7, 0.9]);
  // the nose, small and set into the face
  blob(head, M.skin, 0.015, [0, 0.128, 0.108], [0.9, 1.7, 0.85]);
  for (const s of [-1, 1]) blob(head, M.skin, 0.022, [s * 0.1, 0.135, 0.0], [0.5, 1.15, 0.8]);
  // the hair: drawn back over the top and the sides to the ears, a soft roll at the front, the bun
  head.add(new THREE.SphereGeometry(0.113, 20, 12, 0, Math.PI * 2, 0, 1.55), M.hair, { pos: [0, 0.148, -0.004], rot: [-0.62, 0, 0], scale: [1.0, 1.1, 1.04], wonk: 0 });
  blob(head, M.hair, 0.06, [0, 0.235, 0.035], [1.55, 0.55, 0.9]);
  for (const s of [-1, 1]) blob(head, M.hair, 0.05, [s * 0.082, 0.19, 0.01], [0.6, 0.9, 1.2]);
  blob(head, M.hair, 0.056, [0, 0.2, -0.105], [1.15, 0.85, 0.8]);
  attach(sk.neck, head, 'nora-head');
  // the arms: the cardigan's sleeves pushed up to the elbow, bare forearms, hands like mittens
  for (const side of ['l', 'r']) {
    const A = sk[side], s = side === 'l' ? 1 : -1;
    const up = builder(65);
    blob(up, M.cardigan, 0.062, [-0.01, -0.03, 0], [1, 0.95, 0.95]);
    limb(up, M.cardigan, 0.057, 0.22, { y0: -0.02, r2: 0.052 });
    attach(A.sh, up, 'nora-arm');
    const fore = builder(66);
    fore.cyl(M.cardigan, 0.066, 0.06, 0.1, [0, -0.02, 0], { seg: 10, wonk: 0 });
    limb(fore, M.skin, 0.038, 0.2, { y0: -0.04, r2: 0.03 });
    attach(A.el, fore, 'nora-forearm');
    const hand = builder(67);
    hand.add(new THREE.CapsuleGeometry(0.033, 0.06, 4, 8), M.skin, { pos: [0, -0.06, 0.004], scale: [0.48, 1, 1.25], wonk: 0 });
    hand.add(new THREE.CapsuleGeometry(0.014, 0.035, 4, 6), M.skin, { pos: [-s * 0.004, -0.03, 0.034], rot: [0.5, 0, 0], wonk: 0 });
    attach(A.wr, hand, 'nora-hand');
  }
  return sk;
}

// ---------------- her poses ----------------
const POSES = {
  // hands folded at the waist, over the apron
  fold: pose({ sh: [-0.95, -0.1, 0.2], el: -1.3, wr: [0.1, 0, -0.25] }),
  // the hands lower, working against each other on the apron
  wipe: pose({ sh: [-0.75, -0.06, 0.16], el: -1.0, wr: [0.2, 0, -0.2] }),
  // arms down, easy
  hang: pose({ sh: [-0.1, 0.0, 0.1], el: -0.25, wr: [0, 0, 0] }),
  // leaning on the counter, both hands flat on it
  counter: pose({ sh: [-0.35, -0.55, 0.14], el: -0.75, wr: [0.6, 0, 0] }),
  // one hand out, palm up: here you are
  offer: pose({ sh: [-0.75, -0.1, 0.2], el: -1.3, wr: [0.1, 0, -0.25] }, { sh: [0.35, -0.45, -0.08], el: -1.2, wr: [0, -1.3, 0] }),
};

// how she is, night by night: warm; fading (nights 8–11); behind the counter (12); gone (13 on).
// On night 11 she is in the pub with Tadhg ("Don't mind him"), so the shop door is empty that day.
export function stage(n) {
  if (!n || !(n.day?.places || []).includes('village') || n.id >= 13 || n.id === 11) return 'gone';
  if (n.id === 12) return 'counter';
  if (n.id >= 8) return 'fading';
  return 'warm';
}

// out past the head of the bay, toward the open sea: where she looks when she looks past you
const SEA = toWorld(10, 26, 6);
const NOTICE = 10;

export class Nora {
  constructor(scene, shop) {
    this.shop = shop;
    this.sk = dress();
    this.root = this.sk.root;
    this.fig = new Figure(this.sk, POSES, { seed: 7 });
    shop.root.add(this.root);
    this.place('door');
    const [dx, dz] = shop.spots.door;
    scene.solid(shop.world(dx, 0, dz), 0.35);
    this.me = new THREE.Vector3();
    this.stage = null;
    this.nightId = null;
    this.noticed = 0;
    this.away = 0;
    this.seaIn = 8;
    this.seaFor = 0;
    this.idleIn = 6;
    this.wipeFor = 0;
    this.readRef = null;
    this.shown = 0;
  }

  place(spot) {
    const [x, z] = this.shop.spots[spot];
    this.root.position.set(x, this.shop.floor, z);
    this.root.rotation.y = 0;
    this.root.updateMatrix();
  }

  setNight(n) {
    this.nightId = n.id;
    this.stage = stage(n);
    this.root.visible = this.stage !== 'gone';
    this.place(this.stage === 'counter' ? 'counter' : 'door');
    // a slower body as she fades
    this.fig.slow = this.stage === 'warm' ? 1 : this.stage === 'fading' ? 1.4 : 1.8;
    this.fig.headDown = this.stage === 'counter' ? 0.45 : 0.06;
    this.fig.leanTo = this.stage === 'counter' ? 0.14 : 0;
    this.fig.want = this.stage === 'counter' ? 'counter' : 'fold';
    this.fig.target = null;
    this.noticed = 0;
  }

  // ctx: { night, eye (the camera, world), reading (the keeper's, or null) }
  update(dt, ctx) {
    const n = ctx.night;
    if (!n) return;
    if (n.id !== this.nightId) this.setNight(n);
    if (!this.root.visible) return;
    const F = this.fig, eye = ctx.eye;
    const R = ctx.reading?.place === 'village' ? ctx.reading : null;
    if (R !== this.readRef) { this.readRef = R; this.shown = 0; }
    const me = this.root.getWorldPosition(this.me);
    const near = Math.hypot(eye.x - me.x, eye.z - me.z) < NOTICE;

    if (this.stage === 'counter') {
      // she doesn't look up
      F.target = null;
    } else {
      // noticing you: a beat later as she fades, and a while before she lets you go
      this.noticed = near || R ? this.noticed + dt : Math.max(0, Math.min(this.noticed, 2) - dt);
      const delay = this.stage === 'fading' ? 1.8 : 0.5;
      let look = this.noticed > delay ? eye : null;
      // fading: now and then she looks past you, out to sea, though not while she's speaking
      if (this.stage === 'fading') {
        const speaking = R && R.lines[R.shown - 1]?.who === 'Nora';
        if (this.seaFor > 0) { this.seaFor -= dt; if (speaking) this.seaFor = 0; else look = SEA; }
        else if ((this.seaIn -= dt) < 0) { this.seaFor = 3 + F.rand() * 1.5; this.seaIn = 7 + F.rand() * 5; }
      }
      F.target = look;
      // idle: mostly hands folded; now and then she wipes them on her apron
      if (this.wipeFor > 0) { this.wipeFor -= dt; F.want = this.wipeFor > 0 ? 'wipe' : 'fold'; }
      else if ((this.idleIn -= dt) < 0) { this.wipeFor = 2.4; this.idleIn = 9 + F.rand() * 7; }
    }

    // a new line on the panel: a nod for hers, a hand held out with the change (twice, on night 8)
    if (R && R.shown !== this.shown) {
      this.shown = R.shown;
      const l = R.lines[R.shown - 1];
      if (this.stage !== 'counter' && l) {
        if (/change/.test(l.text)) { F.gesture('offer', { dur: 1.3 }); F.gesture('offer', { dur: 1.3, delay: 1.5 }); }
        else if (l.who === 'Nora') F.gesture(this.shown % 3 === 2 ? 'offer' : 'nod', { dur: this.shown % 3 === 2 ? 1.5 : 0.9 });
      }
    }
    F.update(dt);
  }
}
