// Title: the lighthouse on the headland at dusk, the beam turning slowly, the name lettered in the sky.
import { PAL, smooth, rgba, glow } from '../paint.js';
import { bayBackdrop, drawShip, fogColorFor } from './bay.js';
import { drawBeam, drawLamp } from './bay-paint.js';
import { letter } from '../hand.js';

export class TitleScene {
  constructor(game) { this.game = game; this.safe = { w: 1600, h: 1000 }; }

  enter() {
    this.t = 0;
    this.beam = 2.2;
    this.leaving = false;
    this.boat = { name: 'Solas Beag', size: 'small', index: 0, pos: [58, 36], dir: [1, -0.2], trail: [], lantern: 1, fade: 1, bob: 1 };
    if (this.game.autoplay) setTimeout(() => this.begin(false), 400);
  }

  look() {
    return { warmth: 0.55, sat: 1.06, paperShow: 0.1, bleed: 0, inkSpread: 0, fog: 0.05, fogColor: fogColorFor('dusk'), gran: 0.8, wobble: 3 };
  }

  update(dt) {
    this.t += dt;
    this.beam += dt * (Math.PI * 2) / 18;
    this.boat.pos = [58 + Math.sin(this.t * 0.03) * 6 + this.t * 0.05, 36 - this.t * 0.02];
    this.boat.trail.push([this.boat.pos[0], this.boat.pos[1], this.t]);
    if (this.boat.trail.length > 60) this.boat.trail.shift();
  }

  begin(cont) {
    if (this.leaving) return;
    this.leaving = true;
    const g = this.game;
    g.startAudio?.();
    g.audio?.soft();
    if (cont) g.continueGame(); else g.newGame();
  }

  draw(L) {
    const g = this.game, t = this.t;
    const { pal, cache } = bayBackdrop(L, g, { tod: 'title', night: null });
    L.blit(cache);
    drawShip(L, this.boat, pal, t, { dark: 0.25 });
    drawBeam(L.light, L.paint, this.beam, { intensity: 0.55 });
    drawLamp(L.light, 0.75);

    const a = smooth(0.4, 3.2, t);
    letter(L.ink, 'The Keeping Light', 1130, 172, { hand: 'serifItalic', size: 104, align: 'center', alpha: 0.88 * a, color: '#2A2430' });
    letter(L.ink, 'a lighthouse on Ceann Bán, in the west', 1130, 222, { hand: 'keeper', size: 30, align: 'center', alpha: 0.75 * smooth(1.6, 4, t), color: '#3A2E36' });

    const saved = g.saved && g.saved.night > 1 ? g.saved : null;
    const b = smooth(2.2, 4.5, t);
    let y = 600;
    if (saved) {
      const label = saved.night > 16 ? 'continue — after the last night' : `continue — night ${saved.night}`;
      const hov = g.input.button({ id: 'continue', x: 930, y: y - 40, w: 400, h: 56, onClick: () => this.begin(true) });
      letter(L.ink, label, 1130, y, { hand: 'keeper', size: 40, align: 'center', alpha: b * (hov ? 1 : 0.78), color: hov ? '#1B2440' : '#2B2622' });
      if (hov) underline(L, 1130, y + 8, 260, b);
      y += 62;
    }
    const lab = saved ? 'begin again' : 'begin';
    const hov2 = g.input.button({ id: 'begin', x: 980, y: y - 40, w: 300, h: 56, onClick: () => this.begin(false) });
    letter(L.ink, lab, 1130, y, { hand: 'keeper', size: saved ? 34 : 46, align: 'center', alpha: b * (hov2 ? 1 : 0.78), color: hov2 ? '#1B2440' : '#2B2622' });
    if (hov2) underline(L, 1130, y + 8, saved ? 140 : 90, b);
    if (t > 6 && !saved) letter(L.ink, 'best with sound', 1130, y + 46, { hand: 'keeper', size: 22, align: 'center', alpha: 0.4 * smooth(6, 8, t), color: '#3A2E36' });
  }
}

function underline(L, x, y, w, a) {
  const c = L.ink;
  c.save();
  c.strokeStyle = rgba('#2B2622', 0.55 * a);
  c.lineWidth = 1.6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.quadraticCurveTo(x, y + 4, x + w / 2, y - 1);
  c.stroke();
  c.restore();
}
