// TODO: placeholder. The end of the cliff path: a bench looking out over the bay and a cairn, until
// the real path is built. Sitting down here spends the afternoon on the cliff.
import * as THREE from 'three';
import { sign } from './kit.js';
import { Builder } from '../build.js';
import { wash } from '../materials.js';
import { PLACES } from '../../data/story-village.js';

export const id = 'cliff';
export const trigger = { at: [40, 59.9], r: 5 };
export const approach = { lane: 4, spur: 'cliff' };

export function build(scene) {
  const wood = wash({ color: '#8A7058', color2: '#7A624C', line: 1, crease: 0.6, gran: 0.6, noiseScale: 3 });
  const stone = wash({ color: '#B8B0A2', color2: '#A49C8E', line: 1, crease: 0.7, gran: 0.9, noiseScale: 1.5 });
  // the bench faces north, over the bay
  const at = scene.at(40.3, 59.2);
  const b = new Builder(40);
  b.box(wood, 1.6, 0.06, 0.4, [0, 0.45, 0]);
  b.box(wood, 1.6, 0.3, 0.05, [0, 0.72, 0.2], { rot: [-0.15, 0, 0] });
  for (const x of [-0.7, 0.7]) b.box(wood, 0.08, 0.5, 0.36, [x, 0.22, 0.02]);
  const bench = b.finish('bench');
  bench.position.copy(at);
  bench.matrixAutoUpdate = true;
  scene.group.add(bench);
  scene.solid(at, 0.9);
  // a cairn of stones, each laid by someone who came this far
  const c = scene.at(41.4, 60.3), cb = new Builder(41);
  [[0.55, 0.3], [0.45, 0.62], [0.36, 0.9], [0.26, 1.12], [0.16, 1.28]].forEach(([r, y], i) => {
    cb.add(new THREE.IcosahedronGeometry(r, 0), stone, { pos: [Math.sin(i * 2.1) * 0.06, y, Math.cos(i * 1.7) * 0.06], rot: [i, i * 1.3, 0], scale: [1, 0.6, 1], wonk: 3 });
  });
  const cairn = cb.finish('cairn');
  cairn.position.copy(c);
  cairn.matrixAutoUpdate = true;
  scene.group.add(cairn);
  scene.solid(c, 0.6);
  sign(scene, { at: [38.8, 60.5], title: PLACES[id].label, sub: PLACES[id].sub, face: scene.at(38, 61.4) });
}

export function onEnter(game) { game.visit(id); }
