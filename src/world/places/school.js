// TODO: placeholder. The schoolhouse and the church wall beside it, as greyboxes, until the real ones
// are built. The schoolhouse door is where the afternoon there starts.
import { greybox, sign } from './kit.js';
import { PLACES } from '../../data/story-village.js';

export const id = 'school';
export const trigger = { at: [92.4, -9], r: 4 };
export const approach = { lane: 21, spur: null };

export function build(scene) {
  const door = scene.at(...trigger.at);
  greybox(scene, { at: [92.5, -11], w: 9, d: 6, h: 4, face: door });
  // the church wall: a long low wall, no roof, running north from the road
  greybox(scene, { at: [97, -9], w: 0.7, d: 14, h: 1.4, roof: false, yaw: 0.1 });
  sign(scene, { at: [90.6, -7.8], title: PLACES[id].label, sub: PLACES[id].sub, face: scene.at(90, -6) });
}

export function onEnter(game) { game.visit(id); }
