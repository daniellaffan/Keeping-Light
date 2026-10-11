// Debug: a plain room with a window over the sea, for checking the 3D → watercolor pipeline.
// ?debug=1&test=room   the camera drifts round the table; drag to look, WASD to move.
import * as THREE from 'three';
import { wash } from '../materials.js';
import { woodTex, plasterTex, stoneTex } from '../textures.js';

export class TestRoomScene {
  constructor(game) {
    this.game = game;
    this.three = true;
    this.safe = { w: 1600, h: 1000 };
    this.group = null;
    this.t = 0;
    this.drive = true;
    this.yaw = 0; this.pitch = 0;
    const inp = game.input;
    inp.on('down', (x, y, e) => { if (this.active()) { this.drag = { x: e.clientX, y: e.clientY }; this.drive = false; } });
    inp.on('move', (x, y, e) => {
      if (!this.active() || !this.drag || !inp.down) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.004; this.pitch -= (e.clientY - this.drag.y) * 0.004;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
      this.drag = { x: e.clientX, y: e.clientY };
    });
    inp.on('up', () => { this.drag = null; });
  }

  active() { return this.game.scene === this; }

  build() {
    const g = new THREE.Group();
    const wood = wash({ color: '#A8865F', color2: '#94704E', map: woodTex(), line: 0.9, crease: 0.6, gran: 0.6 });
    const floor = wash({ color: '#C2A684', map: woodTex(4), line: 0.6, gran: 0.5 });
    const wall = wash({ color: '#E2D9C6', color2: '#D6CDB8', map: plasterTex(), line: 0.9, crease: 0.4, gran: 0.35 });
    const cloth = wash({ color: '#8C3B32', color2: '#6E2F2C', line: 1, gran: 0.9 });
    const brass = wash({ color: '#C8A04E', color2: '#A87F3A', line: 1, gran: 0.4 });
    const crock = wash({ color: '#DCD3BE', color2: '#C9BBA0', line: 1, gran: 0.3 });
    const stone = wash({ color: '#B8B0A2', map: stoneTex(), line: 0.9, gran: 1, world: true, noiseScale: 0.3 });
    const sea = wash({ color: '#4C6A86', color2: '#3A5470', water: 1, line: 0.2, gran: 0.6, world: true, noiseScale: 0.05 });
    const grass = wash({ color: '#7C8F55', color2: '#6B7F48', line: 0.7, gran: 0.8, world: true, noiseScale: 0.08 });
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };

    // room 6 × 3 × 6 with an opening in the north wall
    add(new THREE.BoxGeometry(6, 0.1, 6), floor, 0, -0.05, 0);
    add(new THREE.BoxGeometry(6, 0.1, 6), wall, 0, 3.05, 0);
    add(new THREE.BoxGeometry(0.2, 3, 6), wall, -3.1, 1.5, 0);
    add(new THREE.BoxGeometry(0.2, 3, 6), wall, 3.1, 1.5, 0);
    add(new THREE.BoxGeometry(6.4, 3, 0.2), wall, 0, 1.5, 3.1);
    // north wall with a window 1.6 × 1.2 at sill height 0.9
    add(new THREE.BoxGeometry(2.2, 3, 0.2), wall, -1.9, 1.5, -3.1);
    add(new THREE.BoxGeometry(2.2, 3, 0.2), wall, 1.9, 1.5, -3.1);
    add(new THREE.BoxGeometry(1.6, 0.9, 0.2), wall, 0, 0.45, -3.1);
    add(new THREE.BoxGeometry(1.6, 0.9, 0.2), wall, 0, 2.55, -3.1);
    add(new THREE.BoxGeometry(1.8, 0.08, 0.36), wood, 0, 0.92, -3.0);

    // table
    add(new THREE.BoxGeometry(1.6, 0.06, 0.9), wood, 0, 0.76, -0.4);
    for (const [x, z] of [[-0.72, -0.78], [0.72, -0.78], [-0.72, -0.02], [0.72, -0.02]]) add(new THREE.BoxGeometry(0.07, 0.73, 0.07), wood, x, 0.365, z);
    add(new THREE.BoxGeometry(0.42, 0.04, 0.3), cloth, -0.2, 0.81, -0.35, 0.15);
    add(new THREE.BoxGeometry(0.3, 0.06, 0.22), cloth, 0.3, 0.82, -0.6, -0.3);
    add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 20), crock, 0.45, 0.84, -0.2);
    add(new THREE.SphereGeometry(0.12, 24, 16), crock, -0.5, 0.9, -0.65);
    const lamp = add(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 16), brass, 0.6, 0.9, -0.7);
    this.lampObj = lamp;
    // stove and chair
    add(new THREE.BoxGeometry(0.7, 0.8, 0.6), wash({ color: '#3E3C3A', line: 1, gran: 1 }), 2.4, 0.4, 2.3);
    add(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 12), wash({ color: '#3E3C3A', line: 1 }), 2.4, 1.9, 2.4);
    add(new THREE.BoxGeometry(0.6, 0.45, 0.6), wood, -1.6, 0.225, -2.0, 0.4);
    add(new THREE.BoxGeometry(0.6, 0.6, 0.1), wood, -1.7, 0.75, -2.25, 0.4);

    // outside: sea, a headland, two stacks
    const seaM = add(new THREE.PlaneGeometry(4000, 4000), sea, 0, -12, 0);
    seaM.rotation.x = -Math.PI / 2;
    const land = add(new THREE.BoxGeometry(200, 14, 40), grass, -60, -6, -120, 0.3);
    land.geometry.computeVertexNormals();
    add(new THREE.CylinderGeometry(6, 9, 30, 9), stone, 30, -2, -160);
    add(new THREE.CylinderGeometry(4, 7, 22, 7), stone, 70, -6, -240);
    add(new THREE.BoxGeometry(14, 20, 14), stone, -12, -10.2, -6);  // the rock the room stands on
    for (const m of g.children) { m.updateMatrix(); m.matrixAutoUpdate = false; }
    return g;
  }

  enter() {
    const w = this.game.world;
    if (!this.group) this.group = this.build();
    w.scene.add(this.group);
    const S = w.shared;
    S.uSunDir.value.set(-0.5, 0.55, -0.65).normalize();
    S.uLampPos.value.set(0.6, 1.1, -0.7);
    S.uLampAmt.value = 0.6;
    S.uFogDensity.value = 0.004;
    this.t = 0;
  }

  exit() { this.game.world.scene.remove(this.group); }

  look() { return { fog: 0.45, warmth: 0.45, gran: 0.8, edge: 1 }; }

  update(dt) {
    this.t += dt;
    const cam = this.game.world.camera;
    if (this.drive) {
      const a = this.t * 0.18;
      cam.position.set(Math.sin(a) * 1.6, 1.55 + Math.sin(this.t * 0.4) * 0.12, 1.2 + Math.cos(a) * 1.0);
      this.yaw = Math.sin(a) * 0.9; this.pitch = -0.18 + Math.sin(this.t * 0.3) * 0.12;
    } else {
      const k = this.game.input.keys, sp = dt * 1.6;
      const f = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
      const r = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
      cam.position.x += (-Math.sin(this.yaw) * f + Math.cos(this.yaw) * r) * sp;
      cam.position.z += (-Math.cos(this.yaw) * f - Math.sin(this.yaw) * r) * sp;
    }
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  hudActive() { return false; }
  draw() {}
}
