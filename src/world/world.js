// The 3D world: one three.js scene and camera, rendered into the watercolor layers by the pipeline.
// First-person scenes drive the camera and add/remove their own groups; the world owns the sky and
// the shared lighting uniforms.
import * as THREE from 'three';
import { Pipeline } from './pipeline.js';
import { SHARED, skyMaterial } from './materials.js';

export class World {
  constructor(game) {
    this.game = game;
    this.pipeline = new Pipeline(game.gl, game.canvas);
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.camera = new THREE.PerspectiveCamera(62, 1.6, 0.03, 3000);
    this.camera.rotation.order = 'YXZ';
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial());
    this.sky.scale.setScalar(2500);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.shared = SHARED;
    this.cssH = 1;
  }

  resize(layers) {
    const w = layers.canvas.paint.width, h = layers.canvas.paint.height;
    this.pipeline.resize(w, h, layers.ls);
    this.camera.aspect = layers.cssW / layers.cssH;
    this.camera.updateProjectionMatrix();
    this.cssH = layers.cssH;
  }

  // css px by which screen-space haar banks shift so they hold their bearing as the view turns
  fogOffset() {
    const c = this.camera;
    const f = (this.cssH / 2) / Math.tan(THREE.MathUtils.degToRad(c.fov) / 2);
    const e = new THREE.Euler().setFromQuaternion(c.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    // unwrap the yaw so a full turn doesn't jump the banks
    if (this.lastYaw == null) { this.lastYaw = e.y; this.yaw = e.y; }
    let dy = e.y - this.lastYaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    this.yaw += dy; this.lastYaw = e.y;
    return [-this.yaw * f, e.x * f];
  }

  render(hud, time) {
    SHARED.uTime.value = time;
    this.sky.position.copy(this.camera.getWorldPosition(new THREE.Vector3()));
    return this.pipeline.render(this.scene, this.camera, hud);
  }
}
