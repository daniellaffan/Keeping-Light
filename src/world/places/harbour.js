// TODO: placeholder. The slip between the two piers: bollards and a few crates, until the real
// harbour is built. Walking down to the end of the slip spends the afternoon at the harbour.
import { sign } from './kit.js';
import { Builder } from '../build.js';
import { wash } from '../materials.js';
import { PLACES } from '../../data/story-village.js';

export const id = 'harbour';
export const trigger = { at: [90, 2.4], r: 6 };
export const approach = { lane: 22, spur: 'harbour' };

export function build(scene) {
  const iron = wash({ color: '#3E3C3A', color2: '#33312F', line: 1, crease: 0.7, gran: 0.8, noiseScale: 3 });
  const crate = wash({ color: '#9C8262', color2: '#8A7154', line: 1, crease: 0.6, gran: 0.6, noiseScale: 2 });
  const pieces = [
    ['bollard', 88.9, 1.4], ['bollard', 91.1, 1.6], ['bollard', 89.0, -0.4],
    ['crate', 91.0, -0.6, 0.3], ['crate', 91.3, -0.1, -0.2], ['crate', 91.1, -0.35, 0.5, 0.8],
  ];
  for (const [kind, x, y, rot = 0, up = 0] of pieces) {
    const p = scene.at(x, y);
    if (p.y < 0.6) continue;     // nothing left standing in the water
    const b = new Builder(Math.round(x * 7 + y * 3));
    if (kind === 'bollard') {
      b.cyl(iron, 0.16, 0.2, 0.6, [0, 0.3, 0], { seg: 10 });
      b.cyl(iron, 0.24, 0.24, 0.07, [0, 0.62, 0], { seg: 10 });
    } else b.box(crate, 0.8, 0.6, 0.6, [0, 0.3 + up * 0.75, 0], { rot: [0, rot, 0], wonk: 2 });
    const g = b.finish(kind);
    g.position.copy(p);
    g.matrixAutoUpdate = true;
    scene.group.add(g);
    scene.solid(p, kind === 'bollard' ? 0.35 : 0.6);
  }
  sign(scene, { at: [88.2, -3.9], title: PLACES[id].label, sub: PLACES[id].sub, face: scene.at(86, -5) });
}

export function onEnter(game) { game.visit(id); }
