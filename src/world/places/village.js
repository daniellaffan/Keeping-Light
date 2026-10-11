// TODO: placeholder. The shop and the pub in Port na Rón, as greyboxes, until the real street is
// built. The shop's door is where the afternoon in the village starts (the shop and pub vignettes).
import { greybox, sign } from './kit.js';
import { PLACES } from '../../data/story-village.js';

export const id = 'village';
export const trigger = { at: [72.6, 0.3], r: 4 };
export const approach = { lane: 24, spur: null };

export function build(scene) {
  const door = scene.at(...trigger.at);
  greybox(scene, { at: [72.5, 1.4], w: 7, d: 5, h: 3.4, face: door });
  greybox(scene, { at: [70.5, -6.5], w: 8, d: 5.5, h: 3.6, face: scene.at(70, -3.2) });
  sign(scene, { at: [73.4, -1.0], title: PLACES[id].label, sub: PLACES[id].sub, face: scene.at(74, -2) });
}

export function onEnter(game) { game.visit(id); }
