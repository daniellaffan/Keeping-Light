// Where things are in the 3D world. The chart (src/game/chart.js) is the truth: x 0→100 west→east,
// y 0→60 north→south. One chart unit is 4 m. World X = x·4, Z = y·4, Y up, sea level 0.
import * as THREE from 'three';
import { LIGHTHOUSE } from '../game/chart.js';

export const UNIT = 4;
export const toWorld = (x, y, h = 0) => new THREE.Vector3(x * UNIT, h, y * UNIT);
export const toChart = (v) => [v.x / UNIT, v.z / UNIT];

// The tower stands on the south headland; the watch room floor is the top of the cliff there.
export const CLIFF_TOP = 18;
export const TOWER = toWorld(LIGHTHOUSE[0], LIGHTHOUSE[1], CLIFF_TOP);
// The watch-room window looks out over the middle of the bay.
const BAY_AIM = toWorld(50, 30);
export const ROOM_YAW = Math.atan2(-(BAY_AIM.x - TOWER.x), -(BAY_AIM.z - TOWER.z));

// Sky colours for a palette from bay-paint.js
export function skyFromPalette(sky, P, { stars = 0, sun = null } = {}) {
  const u = sky.material.uniforms;
  u.uTop.value.set(P.skyTop); u.uMid.value.set(P.skyMid); u.uLow.value.set(P.skyLow); u.uHor.value.set(P.skyHor);
  u.uCloud.value.set(P.cloud);
  u.uStars.value = stars;
  if (sun) { u.uSunPos.value.copy(sun); u.uSunGlow.value = P.sun ? 0.8 : 0.0; u.uSunCol.value.set(P.sun ? P.sun.c : '#ffffff'); }
}
