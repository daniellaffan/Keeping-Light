// The logbook lying open on the table. LogbookScene draws exactly as it always has, into its own set
// of layer canvases; those canvases become the textures on the pages. Pointer rays are cast onto the
// pages, turned from UV back into the logbook's logical coordinates, and handed to a virtual Input,
// so every hit region (waypoints, take back, rub out, Ink the plan, the page corners) works unchanged.
import * as THREE from 'three';
import { Layers } from '../render/layers.js';
import { Input } from '../ui/input.js';
import { wash } from './materials.js';
import { liveTex } from './textures.js';
import { LogbookScene } from '../render/scenes/logbook.js';

const SPREAD = { w: 1600, h: 1000 };
const SINGLE = { w: 860, h: 1240 };
const COVER = { x: 44, y: 40, w: 1512, h: 920 };
const PAGE_L = { x: 72, y: 64, w: 728, h: 872 };
const S = 0.62 / COVER.w;            // metres per logical unit on the spread
const BOARD = 0.007;                  // board thickness

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Height of the top surface above the table at logical (lx, ly) on the spread.
function spreadHeight(lx, ly) {
  const inX = smoothstep(PAGE_L.x - 4, PAGE_L.x + 3, lx) * (1 - smoothstep(1528 - 3, 1528 + 4, lx));
  const inY = smoothstep(PAGE_L.y - 4, PAGE_L.y + 3, ly) * (1 - smoothstep(936 - 3, 936 + 4, ly));
  const ux = Math.min(1, Math.abs(lx - 800) / 728);
  let page = 0.012 + 0.017 * Math.pow(Math.sin((1 - ux) * Math.PI / 2), 0.6);
  if (ux < 0.05) page -= 0.016 * Math.pow(1 - ux / 0.05, 2);
  // the page edges curl up a hair at top and bottom
  const uy = Math.abs(ly - 500) / 436;
  page += 0.002 * smoothstep(0.85, 1, uy);
  return BOARD + 0.0015 + page * inX * inY;
}

export class Book {
  constructor(game, materialOpts = {}) {
    this.game = game;
    this.layers = new Layers();
    this.layers.resize(SPREAD.w, SPREAD.h, 1.25);
    this.input = new Input(null, this.layers);
    this.single = false;
    // the logbook sees a game whose layers and input are the book's own; everything else is the game
    const book = this;
    this.intercept = {};
    // the logbook's own autoplay waits until the keeper is leaning over it
    Object.defineProperty(this.intercept, 'autoplay', { get: () => game.autoplay && this.open, enumerable: true });
    this.proxy = new Proxy(game, {
      get(t, k) {
        if (k === 'layers') return book.layers;
        if (k === 'input') return book.input;
        if (k in book.intercept) return book.intercept[k];
        return Reflect.get(t, k);
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    this.scene = new LogbookScene(this.proxy);
    this.scene.inWorld = true;
    this.open = false;   // the keeper is leaning over it: input goes to it
    this.scene.active = () => this.open;

    this.tex = {
      paint: liveTex(this.layers.canvas.paint),
      ink: liveTex(this.layers.canvas.ink),
      light: liveTex(this.layers.canvas.light),
    };
    for (const t of Object.values(this.tex)) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
    this.pageMat = wash({
      color: '#EDEDED', color2: '#E8E6E0', map: this.tex.paint, mapAmt: 1, inkMap: this.tex.ink, inkAmt: 1,
      emitMap: this.tex.light, emitMapAmt: 1, line: 0.7, crease: 0.12, gran: 0.25, turb: 0.35, noiseScale: 6, ...materialOpts,
    });
    this.leather = wash({ color: '#2F4846', color2: '#273C3B', line: 1, crease: 0.6, gran: 0.9, noiseScale: 5 });
    this.leafMat = wash({ color: '#F3ECDC', color2: '#EDE3CE', lit: 0.4, line: 0.9, crease: 0.3, gran: 0.25, side: THREE.DoubleSide, noiseScale: 6 });

    this.group = new THREE.Group();
    this.group.name = 'book';
    this.spreadMesh = new THREE.Mesh(this.spreadGeometry(), this.pageMat);
    this.board = new THREE.Mesh(new THREE.BoxGeometry(COVER.w * S + 0.012, BOARD, COVER.h * S + 0.01), this.leather);
    this.board.position.y = BOARD / 2;
    this.singleMesh = new THREE.Mesh(this.singleGeometry(), this.pageMat);
    this.singleMesh.visible = false;
    // the leaf that turns over when a page is turned, and the cover that closes over at dawn
    this.leaf = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_L.w * S, PAGE_L.h * S, 24, 1), this.leafMat);
    this.leaf.geometry.translate(PAGE_L.w * S / 2, 0, 0);
    this.leaf.geometry.rotateX(-Math.PI / 2);
    this.leaf.visible = false;
    this.leafPivot = new THREE.Group();
    this.leafPivot.position.y = 0.032;
    this.leafPivot.add(this.leaf);
    this.coverLid = new THREE.Mesh(new THREE.BoxGeometry(COVER.w * S / 2 + 0.006, BOARD, COVER.h * S + 0.01).translate(-(COVER.w * S / 4 + 0.003), 0, 0), this.leather);
    this.lidPivot = new THREE.Group();
    this.lidPivot.position.y = 0.036;
    this.lidPivot.add(this.coverLid);
    this.lidPivot.visible = false;
    this.group.add(this.spreadMesh, this.board, this.singleMesh, this.leafPivot, this.lidPivot);
    this.closed = 0;
    this.raycaster = new THREE.Raycaster();
    this.redrawT = 0;
    this.leafBend = this.leaf.geometry.attributes.position.array.slice();
  }

  spreadGeometry() {
    const nx = 200, ny = 110;
    const g = new THREE.PlaneGeometry(1, 1, nx, ny);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const lx = COVER.x + u * COVER.w, ly = COVER.y + (1 - v) * COVER.h;
      p.setXYZ(i, (lx - 800) * S, spreadHeight(lx, ly), (ly - 500) * S);
      uv.setXY(i, lx / SPREAD.w, 1 - ly / SPREAD.h);
    }
    g.computeVertexNormals();
    return g;
  }

  // phones held upright: one page at a time, laid nearly flat, with the notes / chart tabs above it
  singleGeometry() {
    const x0 = 0, x1 = 860, y0 = 16, y1 = 1236;
    const s = 0.34 / (x1 - x0);
    const g = new THREE.PlaneGeometry(1, 1, 40, 60);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const lx = x0 + u * (x1 - x0), ly = y0 + (1 - v) * (y1 - y0);
      const ux = Math.abs(u - 0.5) * 2;
      p.setXYZ(i, (lx - 430) * s, 0.034 + 0.003 * (1 - ux * ux), (ly - 626) * s);
      uv.setXY(i, lx / SINGLE.w, 1 - ly / SINGLE.h);
    }
    g.computeVertexNormals();
    this.singleScale = s;
    return g;
  }

  // the screen went portrait or back: the logbook lays itself out for one page or two
  setSingle(single) {
    if (single === this.single) return;
    this.single = single;
    const sz = single ? SINGLE : SPREAD;
    this.layers.resize(sz.w, sz.h, 1.25);
    this.spreadMesh.visible = !single;
    this.singleMesh.visible = single;
    // same canvases, new size: let three reallocate them
    for (const t of Object.values(this.tex)) { t.dispose(); t.needsUpdate = true; }
  }

  enter(mode) {
    this.scene.enter({ mode });
    this.scene.autoT = 0;
    this.closed = 0;
    this.lidPivot.visible = false;
    this.dirty = true;
  }

  update(dt, { redraw = true } = {}) {
    const sc = this.scene;
    this.input.frame();
    sc.update(dt);
    // redraw the pages every frame while they're being looked at; now and then otherwise
    this.redrawT -= dt;
    if (redraw || this.redrawT <= 0 || this.dirty) {
      this.redrawT = 0.5;
      this.dirty = false;
      const L = this.layers;
      L.begin(sc.safe || SPREAD);
      sc.draw(L);
      this.tex.paint.needsUpdate = true;
      this.tex.ink.needsUpdate = true;
      this.tex.light.needsUpdate = true;
    }
    this.animateLeaf();
  }

  // the 3D page turning over, following the logbook's own flip timing
  animateLeaf() {
    const f = this.scene.flipAnim;
    if (!f || this.single) { this.leaf.visible = false; return; }
    this.leaf.visible = true;
    const e = f.t * f.t * (3 - 2 * f.t);
    const ang = (f.dir > 0 ? e : 1 - e) * Math.PI;    // 0: lying on the right, π: on the left
    this.leafPivot.rotation.z = ang;
    // bend the leaf: its free edge trails behind as it swings over
    const p = this.leaf.geometry.attributes.position, src = this.leafBend;
    const W = PAGE_L.w * S, sag = Math.sin(ang) * 0.2 * W * f.dir;
    for (let i = 0; i < p.count; i++) {
      const u = src[i * 3] / W;
      p.setY(i, src[i * 3 + 1] - sag * u * u);
    }
    p.needsUpdate = true;
    this.leaf.geometry.computeVertexNormals();
  }

  // Close the cover over at dawn: k 0..1
  setClosed(k) {
    this.closed = k;
    this.lidPivot.visible = k > 0;
    // the left board swings up about the spine and lays itself over the right
    this.lidPivot.rotation.z = -k * Math.PI;
  }

  // ---- pointer → logbook ----
  // css pointer → logical coordinates on the page, or null if the ray misses the book entirely
  pick(ndcX, ndcY, camera) {
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const mesh = this.single ? this.singleMesh : this.spreadMesh;
    const hit = this.raycaster.intersectObject(mesh, false)[0];
    const sz = this.single ? SINGLE : SPREAD;
    if (hit && hit.uv) return [hit.uv.x * sz.w, (1 - hit.uv.y) * sz.h, true];
    // off the pages: carry on across the plane of the book so drags can leave and come back
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const o = this.raycaster.ray.origin.clone().applyMatrix4(inv);
    const d = this.raycaster.ray.direction.clone().transformDirection(inv);
    const h = this.single ? 0.035 : 0.028;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (h - o.y) / d.y;
    if (t < 0) return null;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (this.single) return [x / this.singleScale + 430, z / this.singleScale + 626, false];
    return [x / S + 800, z / S + 500, false];
  }

  // World position of a logical point on the page (for the pencil tip, the camera aim).
  worldAt(lx, ly, out = new THREE.Vector3()) {
    if (this.single) out.set((lx - 430) * this.singleScale, 0.036, (ly - 626) * this.singleScale);
    else out.set((lx - 800) * S, spreadHeight(lx, ly), (ly - 500) * S);
    return out.applyMatrix4(this.group.matrixWorld);
  }

  // the extent of the visible sheet in book space, for framing the camera
  extent() {
    return this.single ? { w: 0.34, h: 0.34 / 860 * 1220 } : { w: COVER.w * S, h: COVER.h * S };
  }
}
