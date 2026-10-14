// TODO: placeholder. The oil shed by the tower: a greybox and a sign, until the real shed is built.
// Walking up to its door spends the afternoon at the lighthouse (lamp room and shed vignettes).
import { greybox, sign } from './kit.js';
import { PLACES } from '../../data/story-village.js';

export const id = 'lighthouse';
export const trigger = { at: [17.6, 56.5], r: 2.5 };
export const approach = { lane: 1, spur: 'shed' };

export function build(scene) {
  const door = scene.at(...trigger.at);
  greybox(scene, { at: [18.8, 57.2], w: 4, d: 3, h: 2.6, face: door });
  sign(scene, { at: [17, 56], title: PLACES[id].label, sub: PLACES[id].sub, face: scene.at(16, 57.2) });
}

export function onEnter(game) { game.visit(id); }
