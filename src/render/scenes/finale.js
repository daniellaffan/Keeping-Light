// The end: the stairs (one step per click), the last sunset from the gallery, the paint bleeding
// back into the paper, and a small end card. Parts: 'stairs' -> 'sunset' -> 'end'.
import { rng, mixHex, rgba, smooth, clamp, wash, blob, glow, radial, inkLine, glazes, lerp } from '../paint.js';
import { bayBackdrop, drawShip, fogColorFor } from './bay.js';
import { drawLamp, lampPos } from './bay-paint.js';
import { letter } from '../hand.js';
import { STAIRS, LAST_SUNSET, END_CARD } from '../../data/story-end.js';

const TREAD = 46;        // vertical rise per stair on screen
const PER_CLICK = 4;     // stairs climbed per click
const R = 270;           // radius of the stairwell on screen

export class FinaleScene {
  constructor(game) {
    this.game = game;
    this.safe = { w: 1600, h: 1000 };
    game.input.on('key', (e) => {
      if (game.scene !== this) return false;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') { this.tap(); return true; }
      return false;
    });
  }

  enter({ part = 'stairs' } = {}) {
    this.part = part;
    this.t = 0;
    this.step = 0;          // clicks taken
    this.climb = 0;         // eased stairs climbed
    this.lastTap = -9;
    this.stepTime = {};
    this.leaving = false;
    this.held = false;
    this.ship = { name: 'Réalta', size: 'small', index: 3, pos: [22, 47], dir: [1, -0.5], trail: [], lantern: 1, fade: 1, bob: 1.4 };
    if (part === 'sunset') this.game.audio?.lampSwell?.();
  }

  look() {
    if (this.part === 'stairs') {
      return { inkOut: 1, warmth: 0.55, sat: 0.9, paperShow: 0.22, fog: 0, gran: 0.9, wobble: 3.2, edge: 1.1, inkSpread: 0.1 };
    }
    if (this.part === 'sunset') {
      const w = smooth(31, 40, this.t);
      return {
        warmth: 0.62, sat: 1.04, paperShow: 0.3 + 0.25 * smooth(20, 34, this.t), fog: 0.06, fogColor: fogColorFor('dusk'),
        gran: 0.95, wobble: 3.4, bleed: 0.25 * smooth(26, 36, this.t), white: w, whiteCenter: this.whiteCenter || [0.2, 0.6],
      };
    }
    return { inkOut: 1, warmth: 0.5, sat: 0.9, paperShow: 0.35, fog: 0, gran: 0.8, white: 0 };
  }

  paintRect() {
    if (this.part === 'stairs') return { x0: 440, y0: 20, x1: 1160, y1: 980 };
    if (this.part === 'end') return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return { x0: -400, y0: -200, x1: 2000, y1: 1200 };
  }

  tap() {
    const g = this.game;
    if (this.part === 'stairs') {
      if (this.t - this.lastTap < 0.55 || this.step >= STAIRS.steps) return;
      this.lastTap = this.t;
      this.step++;
      this.stepTime[this.step] = this.t;
      g.audio?.stairStep?.(this.step);
    } else if (this.part === 'end' && this.t > 3) this.leave();
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.finish();
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    if (this.part === 'stairs') {
      this.climb += (this.step * PER_CLICK - this.climb) * Math.min(1, dt * 1.4);
      if (g.autoplay && this.t - this.lastTap > 0.9 && this.t > 1.5) this.tap();
      if (this.step >= STAIRS.steps && this.t - this.lastTap > 2 && !this.leaving) { this.leaving = true; g.go('finale', { part: 'sunset' }, { duration: 3.2, center: [0.5, 0.15] }); }
    } else if (this.part === 'sunset') {
      // the last boat: past the lighthouse, out toward the dark
      const u = clamp((this.t - 8) / 24, 0, 1);
      const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
      const p0 = [22, 47], p1 = [64, 22], p2 = [104, 2];
      const a = lerp(p0[0], p1[0], e), b = lerp(p0[1], p1[1], e);
      const c = lerp(p1[0], p2[0], e), d = lerp(p1[1], p2[1], e);
      const prev = this.ship.pos;
      this.ship.pos = [lerp(a, c, e), lerp(b, d, e)];
      this.ship.trail.push([this.ship.pos[0], this.ship.pos[1], this.t]);
      if (this.ship.trail.length > 60) this.ship.trail.shift();
      this.ship.dir = [this.ship.pos[0] - prev[0] || 1, this.ship.pos[1] - prev[1]];
      this.ship.fade = 1 - smooth(25, 31, this.t);
      this.ship.lantern = 1 - smooth(27, 31, this.t) * 0.8;
      if (this.t > 31 && !this.held) { this.held = true; g.audio?.heldNote?.(); }
      if (this.t > 41 && !this.leaving) { this.leaving = true; g.go('finale', { part: 'end' }, { duration: 2.4 }); }
    } else if (this.part === 'end') {
      if ((g.autoplay && this.t > 4) || this.t > 30) this.leave();
    }
  }

  draw(L) {
    if (this.part === 'stairs') return this.drawStairs(L);
    if (this.part === 'sunset') return this.drawSunset(L);
    return this.drawEnd(L);
  }

  // ---------------- the stairs ----------------
  drawStairs(L) {
    const g = this.game, t = this.t;
    const { paint: c, ink, light, mask } = L;
    const up = this.climb;                 // stairs climbed so far
    const prog = up / (STAIRS.steps * PER_CLICK);
    const scroll = (up % 6) * TREAD;      // the view rises with you; the pattern repeats every 6 stairs
    const phase = up * 0.42;

    // the inside of the tower: whitewash, cold below, warming toward the lamp room
    const top = mixHex('#D9C7A6', '#F2D49A', prog);
    const gr = c.createLinearGradient(0, 0, 0, 1000);
    gr.addColorStop(0, top);
    gr.addColorStop(0.45, mixHex('#B9B2B4', top, 0.35 + prog * 0.3));
    gr.addColorStop(1, mixHex('#6F6E80', '#8D8590', prog * 0.6));
    c.fillStyle = gr;
    c.fillRect(380, -20, 840, 1040);
    // the curve of the wall: darker toward both edges
    for (const [x0, x1, s] of [[380, 600, 1], [1000, 1220, -1]]) {
      const g2 = c.createLinearGradient(x0, 0, x1, 0);
      const dk = 'rgba(52,50,72,';
      g2.addColorStop(s > 0 ? 0 : 1, dk + '0.55)');
      g2.addColorStop(s > 0 ? 1 : 0, dk + '0)');
      c.fillStyle = g2;
      c.fillRect(x0, -20, x1 - x0, 1040);
    }
    // damp patches and old whitewash, scrolling with the wall
    const r = rng(31 + Math.floor(up / 6));
    for (let i = 0; i < 14; i++) {
      const x = 460 + r() * 680, y = ((r() * 1300 + scroll * 1.0) % 1300) - 150;
      blob(c, x, y, 40 + r() * 120, 12 + r() * 40, i % 3 ? '#9C97A2' : '#C8B08A', 0.08 + r() * 0.08, 50 + i, 0.3);
    }

    // a slit window on the far wall, the sunset in it
    const wy = 420 + ((scroll + 200) % (6 * TREAD * 2)) - 140;
    const wx = 800 + Math.sin(phase * 0.5 + 1.1) * 120;
    if (wy > -120 && wy < 1100) {
      wash(c, [[wx - 26, wy + 90], [wx + 26, wy + 90], [wx + 26, wy - 40], [wx, wy - 70], [wx - 26, wy - 40]], '#3F3A50', { alpha: 0.6, amp: 3, seed: 7 });
      const sg = c.createLinearGradient(0, wy - 60, 0, wy + 80);
      sg.addColorStop(0, '#8C8AA4'); sg.addColorStop(0.55, '#F2B860'); sg.addColorStop(1, '#C9805A');
      wash(c, [[wx - 16, wy + 80], [wx + 16, wy + 80], [wx + 16, wy - 34], [wx, wy - 58], [wx - 16, wy - 34]], sg, { alpha: 0.95, amp: 2, seed: 8 });
      glow(light, wx, wy + 10, 140, '#F0A850', 0.32);
      // its light on the steps below
      radial(light, wx + 60, wy + 220, 260, [[0, 'rgba(240,170,90,0.16)'], [1, 'rgba(240,170,90,0)']], 'lighter', 0.4);
    }

    // the stairs: a helix of stone treads around the wall. Far ones first.
    const stairs = [];
    for (let i = -4; i < 30; i++) {
      const th = i * 0.42 - (phase % (Math.PI * 2)) + 0.6;
      const y = 930 - i * TREAD + scroll;
      if (y < -80 || y > 1120) continue;
      stairs.push({ i, th, y, d: Math.cos(th), s: Math.sin(th) });
    }
    stairs.sort((a, b) => a.d - b.d);
    ink.save();
    ink.beginPath(); ink.rect(470, 50, 660, 900); ink.clip();
    for (const st of stairs) {
      const near = (st.d + 1) / 2;              // 0 far wall .. 1 near us
      const x = 800 + st.s * R * (0.75 + near * 0.35);
      const w = 60 + Math.abs(st.d) * 150 * (0.7 + near * 0.5);
      const h = 20 + near * 18;
      const lit = clamp(1 - st.y / 1000, 0, 1) * 0.5 + prog * 0.3;
      const stone = mixHex(mixHex('#6E6670', '#B9A88E', lit), '#3C3A50', (1 - near) * 0.35);
      const seed = 100 + ((st.i + Math.floor(up)) % 40 + 40) % 40;
      c.save();
      c.translate(x, st.y);
      // tread (top), lit from above
      wash(c, [[-w / 2, 0], [w / 2, 0], [w / 2 + 14 * st.s, -h * 0.7], [-w / 2 + 14 * st.s, -h * 0.7]], mixHex(stone, '#F2E2C2', 0.35), { alpha: 0.95, amp: 2.2, freq: 0.05, seed, step: 10 });
      // riser
      wash(c, [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]], stone, { alpha: 0.95, amp: 2.4, freq: 0.05, seed: seed + 7, step: 10 });
      // shadow beneath
      wash(c, [[-w / 2 + 6, h], [w / 2 - 4, h], [w / 2 - 20, h + 26], [-w / 2 + 20, h + 22]], '#2E2C40', { alpha: 0.18 + near * 0.12, amp: 5, seed: seed + 3, blur: 3 });
      c.restore();
      ink.save();
      ink.translate(x, st.y);
      inkLine(ink, [[-w / 2, h], [w / 2, h]], { width: 1 + near * 0.8, alpha: 0.35 + near * 0.3, seed, breaks: 0.15 });
      ink.restore();
      mask.fillStyle = 'rgba(0,0,200,0.35)';
      mask.fillRect(x - w / 2, st.y - h, w, h * 2);
    }
    ink.restore();
    // the lamp room above: light coming down the stairwell as you climb
    radial(light, 800, -120, 700, [[0, `rgba(250,206,130,${0.25 + prog * 0.45})`], [0.6, `rgba(240,180,100,${0.06 + prog * 0.12})`], [1, 'rgba(0,0,0,0)']], 'lighter', 0.8);
    if (prog > 0.6) glazes(c, 400, 1200, -20, 260, ['#F6D08A', '#F0C27E'], { count: 6, alpha: [0.05, 0.1 * prog], w: [300, 700], h: [30, 90], seed: 77 });

    // the Keeper's words, a few, loosening
    const lines = Object.entries(STAIRS.lines).filter(([k]) => this.step >= +k);
    lines.forEach(([k, text], j) => {
      const age = smooth(0, 1.6, this.t - (this.stepTime?.[k] ?? this.t - 3));
      letter(ink, text, 120 + j * 40, 300 + j * 150, { hand: 'keeper', size: 44, alpha: 0.82 * age, drift: 1.2 + j * 0.6, shake: 0.6, seed: j, color: '#2A2838' });
    });
    if (this.step < STAIRS.steps) {
      const a = (0.45 + 0.25 * Math.sin(t * 1.8)) * smooth(1, 2.5, t) * (this.t - this.lastTap > 1.2 ? 1 : 0.3);
      letter(ink, STAIRS.prompt, 1270, 860, { hand: 'keeper', size: 44, align: 'center', alpha: a, color: '#2A2838' });
    }
    g.input.button({ id: 'stair', x: 0, y: 0, w: 1600, h: 1000, onClick: () => this.tap(), cursor: 'pointer' });
  }

  // ---------------- the last sunset ----------------
  drawSunset(L) {
    const g = this.game, t = this.t;
    const { pal, cache } = bayBackdrop(L, g, { tod: 'lastsunset', night: null, key: 'last', lightsOverride: 0 });
    L.blit(cache);
    const c = L.paint;
    // the dark coming in from the east
    const dk = smooth(4, 34, t);
    radial(c, 1650, 120, 1100, [[0, rgba('#2C3050', 0.42 * dk)], [0.6, rgba('#3A3E60', 0.18 * dk)], [1, rgba('#3A3E60', 0)]], 'source-over', 0.7);

    drawShip(L, this.ship, pal, t, { dark: 0.35 + dk * 0.3 });

    // the lamp lights itself
    const [lx, ly] = lampPos();
    const lit = smooth(2.4, 4.6, t);
    const flare = smooth(2.4, 3.4, t) * (1 - smooth(3.6, 6.5, t));
    if (lit > 0) drawLamp(L.light, lit * (1 - smooth(32, 38, t) * 0.4), flare);
    // and someone sits beside it
    const fa = smooth(5, 8, t);
    if (fa > 0) {
      const ink = L.ink;
      ink.save();
      ink.globalAlpha = 0.8 * fa;
      ink.fillStyle = '#2A2636';
      ink.beginPath(); ink.arc(lx + 19, ly + 2, 3.4, 0, Math.PI * 2); ink.fill();
      ink.beginPath();
      ink.moveTo(lx + 15, ly + 19); ink.quadraticCurveTo(lx + 14, ly + 7, lx + 19, ly + 6);
      ink.quadraticCurveTo(lx + 24, ly + 7, lx + 24, ly + 19); ink.closePath(); ink.fill();
      ink.restore();
      glow(L.light, lx + 19, ly + 8, 18, '#F2B060', 0.25 * fa * lit);
    }
    this.whiteCenter = uvOf(L, lx, ly);

    const ta = smooth(6, 8.5, t) * (1 - smooth(28, 32, t));
    letter(L.ink, LAST_SUNSET.sit, 960, 112, { align: 'center', hand: 'keeper', size: 42, alpha: 0.85 * ta, drift: 1.2, seed: 3, color: '#231F30' });
    const tb = smooth(13, 15.5, t) * (1 - smooth(28, 32, t));
    letter(L.ink, LAST_SUNSET.ship, 980, 168, { align: 'center', hand: 'keeper', size: 42, alpha: 0.85 * tb, drift: 1.6, seed: 4, color: '#231F30' });
  }

  // ---------------- end card ----------------
  drawEnd(L) {
    const t = this.t;
    const ink = L.ink;
    const a = smooth(0.8, 3, t);
    letter(ink, END_CARD.title, 800, 452, { hand: 'serifItalic', size: 46, align: 'center', alpha: 0.8 * a, color: '#2A2430' });
    letter(ink, END_CARD.line, 800, 520, { hand: 'keeper', size: 34, align: 'center', alpha: 0.7 * smooth(2, 4.5, t), color: '#2E2A36' });
    // a single small gold mark: the light
    blob(ink, 800, 586, 6, 6, '#E0A04A', 0.85 * smooth(3, 6, t), 5, 0.2);
    letter(ink, END_CARD.small, 800, 930, { hand: 'serif', size: 17, align: 'center', alpha: 0.45 * smooth(5, 8, t), color: '#4A4250' });
    this.game.input.button({ id: 'endcard', x: 0, y: 0, w: 1600, h: 1000, disabled: t < 3, onClick: () => this.tap() });
  }
}

function uvOf(L, x, y) {
  const [cx, cy] = L.toCss(x, y);
  return [cx / L.cssW, 1 - cy / L.cssH];
}
