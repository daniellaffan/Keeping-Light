// Builds the keeper's skin off the main thread while the game boots (see prepareSkin in hands.js).
import { buildSkinData } from './handmesh.js';

self.onmessage = () => {
  const d = buildSkinData();
  postMessage(d, [d.pos.buffer, d.nor.buffer, d.idx.buffer, d.si.buffer, d.sw.buffer, d.tint.buffer, d.tintL.buffer, d.skin.buffer]);
};
