// Port na Rón: Nora's shop (shop.js), with Nora in its doorway (people/nora.js), and the pub across the
// lane, still a greybox until the real street is built. The shop's door is where the afternoon in the
// village starts (the shop and pub vignettes). The bell over the door goes when you come to it, while
// there is still someone to hear it.
import { greybox, sign } from './kit.js';
import { buildShop } from './shop.js';
import { Nora } from '../people/nora.js';
import { PLACES } from '../../data/story-village.js';

export const id = 'village';
export const trigger = { at: [72.6, 0.3], r: 4 };
export const approach = { lane: 24, spur: null };

let shop = null, nora = null, nightId = null, readRef = null;

export function build(scene) {
  const door = scene.at(...trigger.at);
  shop = buildShop(scene, { at: [72.5, 1.4], face: door });
  nora = new Nora(scene, shop);
  greybox(scene, { at: [70.5, -6.5], w: 8, d: 5.5, h: 3.6, face: scene.at(70, -3.2) });
  sign(scene, { at: [73.4, -1.0], title: PLACES[id].label, sub: PLACES[id].sub, face: scene.at(74, -2) });
}

export function onEnter(game) { game.visit(id); }

// every frame by day: ctx { night, eye, reading, audio }
export function update(dt, ctx) {
  if (!shop || !ctx.night) return;
  if (ctx.night.id !== nightId) { nightId = ctx.night.id; shop.setNight(ctx.night); }
  const R = ctx.reading?.place === id ? ctx.reading : null;
  if (R && R !== readRef && R.title === 'The shop' && ctx.night.id < 13) { shop.ring(); ctx.audio?.shopBell?.(); }
  readRef = R;
  shop.update(dt);
  nora.update(dt, ctx);
}
