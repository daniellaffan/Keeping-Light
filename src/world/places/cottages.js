// TODO: placeholder. Two cottages at the end of the back road, as greyboxes, until the real ones are
// built. The lane ends here, so arriving at its end spends the afternoon at the cottages.
import { greybox, sign } from './kit.js';
import { PLACES } from '../../data/story-village.js';

export const id = 'cottages';
export const trigger = { at: [62, -5.8], r: 7 };
export const approach = { lane: 26, spur: null };

export function build(scene) {
  const yard = scene.at(...trigger.at);
  greybox(scene, { at: [60.5, -8.5], w: 6.5, d: 4.5, h: 3, face: yard });
  greybox(scene, { at: [64.5, -8.8], w: 6, d: 4.5, h: 2.9, face: yard });
  sign(scene, { at: [64.2, -4.6], title: PLACES[id].label, sub: PLACES[id].sub, face: scene.at(68, -3.5) });
}

export function onEnter(game) { game.visit(id); }
