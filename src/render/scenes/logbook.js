// The logbook: dusk planning on the chart, the dawn record, and reading back through older pages.
import { PAL, rgba, wash, wobble, rng, smooth, clamp, glow, noise1, inkLine, blob } from '../paint.js';
import { letter, block, measure } from '../hand.js';
import { chartFrame, paintChart, routePage, drawRoute, boatGlyph, cross } from './logbook-chart.js';
import {
  hazards, inkUsed, solve, routeFor, polyLength, REEFS, MAGMELL, STACKS,
} from '../../game/chart.js';
import { nightById, NIGHTS } from '../../game/nights.js';
import { INSIDE_COVER, OLD_KEEPER, OTHER_KEEPERS, BARGAIN } from '../../data/story-logbook.js';
import { KEEPER_NOTES, TEACH, STRUCK_FOLLOWUP, RECORD, SPECIAL_RECORDS, PAGE_WORDS } from '../../data/story-nights.js';

const SPREAD = { w: 1600, h: 1000 };
const SINGLE = { w: 860, h: 1240 };
const OLD_INK = '#4A3426';
const PENCIL = '#5A5A62';

function reefName(id) {
  if (!id) return 'a rock';
  if (REEFS[id]) return REEFS[id].name || 'a rock with no name';
  if (STACKS.find((s) => s.id === id)) return 'a stack';
  return 'the shore';
}

export class LogbookScene {
  constructor(game) {
    this.game = game;
    this.safe = SPREAD;
    this.single = false;
    this.side = 'right';
    const inp = game.input;
    inp.on('down', (x, y) => this.active() && this.onDown(x, y));
    inp.on('move', (x, y) => this.active() && this.onMove(x, y));
    inp.on('up', () => this.active() && this.onUp());
    inp.on('key', (e) => {
      if (!this.active()) return false;
      if (e.key === 'ArrowLeft') { this.flip(-1); return true; }
      if (e.key === 'ArrowRight') { this.flip(1); return true; }
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { this.undo(); return true; }
      return false;
    });
  }

  active() { return this.game.scene === this; }

  enter({ mode = 'dusk' } = {}) {
    const g = this.game;
    this.mode = mode;
    this.night = g.night;
    this.t = 0;
    this.wps = [];
    this.history = [];
    this.drag = -1;
    this.style = 'pencil';
    this.inking = null;
    this.flash = null;
    this.flipAnim = null;
    this.hoverOld = false;
    this.done = false;
    this.side = 'right';
    const n = this.night;
    if (mode === 'dusk') {
      if (n.ghostPlan) { this.wps = (solve(n) || []).map((p) => p.slice()); this.style = 'ghost'; }
      this.side = 'left';
    } else {
      this.side = 'left';
      const h = g.state.history[n.id];
      this.wps = h?.waypoints ? h.waypoints.map((p) => p.slice()) : [];
      this.style = h?.style || 'pencil';
    }
    this.recalc();
    this.buildSpreads();
    this.idx = this.spreads.length - 1;
    if (g.autoplay) {
      this.autoT = 0;
    }
  }

  look() {
    const n = this.night || NIGHTS[0];
    return { ...n.look, fog: 0, wobble: 2.2, edge: 1, warmth: (n.look.warmth ?? 0.5) + (this.mode === 'dawn' ? -0.1 : 0.05), lightGain: 1 };
  }

  // ---------------- data ----------------
  buildSpreads() {
    const id = this.night.id;
    const S = [];
    S.push({ key: 'cover', left: { type: 'cover' }, right: { type: 'flower' } });
    if (id >= 14) {
      S.push({ key: 'othersCB', left: { type: 'entries', hand: OTHER_KEEPERS[0].hand, entries: OTHER_KEEPERS[0].entries, years: OTHER_KEEPERS[0].years }, right: { type: 'entries', hand: OTHER_KEEPERS[1].hand, entries: OTHER_KEEPERS[1].entries, years: OTHER_KEEPERS[1].years } });
      S.push({ key: 'othersA', left: { type: 'entries', hand: OTHER_KEEPERS[2].hand, entries: OTHER_KEEPERS[2].entries, years: OTHER_KEEPERS[2].years }, right: { type: 'stain' } });
    }
    if (id >= 15) {
      S.push({ key: 'bargain', left: { type: 'entries', hand: 'old', entries: BARGAIN.entries.slice(0, 2), firm: true }, right: { type: 'entries', hand: 'old', entries: BARGAIN.entries.slice(2), firm: true, signature: BARGAIN.signature } });
    }
    // the old keeper's run, about four entries a page
    const pages = [];
    let cur = [], size = 0;
    for (const e of OLD_KEEPER) {
      const w = 1 + e.text.length / 110;
      if (size + w > 5.2 && cur.length) { pages.push(cur); cur = []; size = 0; }
      cur.push(e); size += w;
    }
    if (cur.length) pages.push(cur);
    // the very last entry stands alone on the page facing the new keeper's first night
    const lastPage = pages[pages.length - 1];
    if (lastPage.length > 1) { const last = lastPage.pop(); pages.push([last]); }
    for (let i = 0; i < pages.length; i += 2) {
      S.push({ key: 'old' + i, left: { type: 'entries', hand: 'old', entries: pages[i] }, right: pages[i + 1] ? { type: 'entries', hand: 'old', entries: pages[i + 1] } : { type: 'blank' } });
    }
    for (let k = 1; k < id; k++) S.push({ key: 'night' + k, left: { type: 'record', id: k }, right: { type: 'chart', id: k } });
    S.push({ key: 'live', live: true, left: { type: this.mode === 'dusk' ? 'dusk' : 'dawn' }, right: { type: 'plan' } });
    this.spreads = S;
  }

  recalc() {
    const n = this.night;
    this.used = inkUsed(n, this.wps);
    this.haz = this.mode === 'dusk' ? hazards(n, this.wps) : [];
    this.over = this.used > n.inkBudget + 1e-6;
  }

  push() { this.history.push({ wps: this.wps.map((p) => p.slice()), style: this.style }); if (this.history.length > 60) this.history.shift(); }
  undo() {
    if (this.mode !== 'dusk' || this.inking || !this.history.length) return;
    const h = this.history.pop();
    this.wps = h.wps; this.style = h.style;
    this.recalc();
    this.game.audio?.pencil(0.5);
  }
  clear() {
    if (this.mode !== 'dusk' || this.inking || (!this.wps.length && this.style === 'pencil')) return;
    this.push();
    this.wps = []; this.style = 'pencil';
    this.recalc();
    this.game.audio?.rubOut();
  }
  followOld() {
    if (this.inking) return;
    const w = solve(this.night);
    if (!w) return;
    this.push();
    this.wps = w.map((p) => p.slice());
    this.style = 'old';
    this.recalc();
    this.game.audio?.pencil(1);
  }
  autoPlan() {
    if (this.mode !== 'dusk') return;
    this.idx = this.spreads.length - 1;
    const w = solve(this.night);
    if (w) { this.push(); this.wps = w.map((p) => p.slice()); this.style = 'pencil'; this.recalc(); }
  }

  inkThePlan() {
    if (this.mode !== 'dusk' || this.inking || this.over) return;
    this.idx = this.spreads.length - 1;
    if (this.single) this.side = 'right';
    this.inking = { t: 0 };
    this.game.audio?.inkPhrase();
  }

  closeBook() {
    if (this.done) return;
    this.done = true;
    this.game.audio?.page();
    this.game.onDawnDone();
  }

  flip(d) {
    const j = clamp(this.idx + d, 0, this.spreads.length - 1);
    if (j === this.idx || this.inking) return;
    this.flipAnim = { t: 0, dir: d, from: this.idx };
    this.idx = j;
    this.drag = -1;
    this.game.audio?.page();
  }

  // ---------------- layout ----------------
  pages() {
    if (this.single) {
      const r = { x: 40, y: 120, w: 780, h: 1080 };
      return { left: this.side === 'left' ? r : null, right: this.side === 'right' ? r : null, cover: { x: 18, y: 96, w: 824, h: 1126 } };
    }
    return {
      left: { x: 72, y: 64, w: 728, h: 872 },
      right: { x: 800, y: 64, w: 728, h: 872 },
      cover: { x: 44, y: 40, w: 1512, h: 920 },
    };
  }
  chartRectFor(R) { return chartFrame(R.x + 40, R.y + 96, R.w - 80); }
  paintRect() {
    const c = this.pages().cover;
    return { x0: c.x - 26, y0: c.y - 26, x1: c.x + c.w + 26, y1: c.y + c.h + 26 };
  }

  // ---------------- input ----------------
  liveChart() {
    if (this.mode !== 'dusk' || !this.spreads[this.idx].live || this.inking || this.flipAnim) return null;
    const p = this.pages();
    if (!p.right) return null;
    return this.chartRectFor(p.right);
  }
  handleAt(x, y, f) {
    const rad = this.game.input.type === 'mouse' ? 15 : 28;
    let best = -1, bd = rad;
    this.wps.forEach((w, i) => {
      const [px, py] = f.toPage(w[0], w[1]);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  onDown(x, y) {
    const f = this.liveChart();
    if (!f || !f.inside(x, y)) return;
    const h = this.handleAt(x, y, f);
    if (h >= 0) {
      this.push();
      this.drag = h;
      this.dragMoved = false;
      if (this.style !== 'pencil') this.style = 'pencil';
      return;
    }
    if (this.wps.length >= this.night.maxPoints) {
      this.flash = { text: 'no more turns tonight — move one, or take one back', t: 0 };
      return;
    }
    const w = f.toWorld(x, y);
    this.push();
    // insert where it lengthens the route least
    const entry = this.night.entries[0];
    let bestI = this.wps.length, bestL = Infinity;
    for (let i = 0; i <= this.wps.length; i++) {
      const c = this.wps.slice(); c.splice(i, 0, w);
      const L = polyLength(routeFor(this.night, c, entry));
      if (L < bestL - 1e-6) { bestL = L; bestI = i; }
    }
    this.wps.splice(bestI, 0, w);
    this.style = 'pencil';
    this.drag = bestI;
    this.dragMoved = true;
    this.recalc();
    this.game.audio?.pencil(1);
  }
  onMove(x, y) {
    if (this.drag < 0) return;
    const f = this.liveChart();
    if (!f) { this.drag = -1; return; }
    const cx = clamp(x, f.x0 + 4, f.x1 - 4), cy = clamp(y, f.y0 + 4, f.y1 - 4);
    const w = f.toWorld(cx, cy);
    const p = this.wps[this.drag];
    if (!p) return;
    if (Math.hypot(p[0] - w[0], p[1] - w[1]) > 0.05) { this.dragMoved = true; this.wps[this.drag] = w; this.recalc(); this.game.audio?.pencil(0.25); }
  }
  onUp() {
    if (this.drag >= 0 && !this.dragMoved) this.history.pop();
    this.drag = -1;
  }
  cursor() {
    const f = this.liveChart();
    const inp = this.game.input;
    if (!f || !f.inside(inp.x, inp.y)) return null;
    if (this.drag >= 0) return 'grabbing';
    return this.handleAt(inp.x, inp.y, f) >= 0 ? 'grab' : 'crosshair';
  }

  // ---------------- update ----------------
  update(dt) {
    const g = this.game;
    this.t += dt;
    const portrait = g.layers.cssW / g.layers.cssH < 0.95;
    if (portrait !== this.single) { this.single = portrait; this.safe = portrait ? SINGLE : SPREAD; }
    if (this.flipAnim) { this.flipAnim.t += dt / 0.55; if (this.flipAnim.t >= 1) this.flipAnim = null; }
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 3) this.flash = null; }
    if (this.inking) {
      this.inking.t += dt / 2.4;
      if (this.inking.t >= 1.3 && !this.inking.sent) {
        this.inking.sent = true;
        g.inkPlan(this.wps, { style: this.style });
      }
    }
    if (g.autoplay && !this.done) {
      this.autoT += dt;
      if (this.mode === 'dusk' && this.autoT > 0.8 && !this.inking) { this.autoPlan(); this.inkThePlan(); }
      if (this.mode === 'dawn' && this.autoT > 1.2) this.closeBook();
    }
  }

  // ---------------- drawing ----------------
  draw(L) {
    const P = this.pages();
    const sp = this.spreads[this.idx];
    const n = this.night;
    const key = `book|${this.single ? 'S' + this.side : 'D'}|${sp.key}|${n.id}|${this.mode}|${this.spreads.length}`;
    const cache = L.cache(key, (C) => this.paintStatic(C, P, sp));
    L.blit(cache);

    // warm lamp light at dusk; thin cool light at dawn
    const cv = P.cover;
    if (this.mode === 'dusk') {
      glow(L.light, cv.x + 60, cv.y + 30, 900, '#E6A94A', 0.16);
    } else {
      glow(L.light, cv.x + cv.w - 80, cv.y + 20, 900, '#C9D6E8', 0.08);
    }

    if (P.left) this.drawPage(L, P.left, sp.left, sp.live, 'left');
    if (P.right) this.drawPage(L, P.right, sp.right, sp.live, 'right');

    this.drawNav(L, P);
    if (this.single) this.drawTabs(L);
    if (this.flipAnim) this.drawFlip(L, P);
  }

  paintStatic(C, P, sp) {
    const paint = C.paint, ink = C.ink;
    const cv = P.cover;
    const act = this.night.act;
    // leather cover peeking around the pages
    const cover = wobble([[cv.x, cv.y], [cv.x + cv.w, cv.y], [cv.x + cv.w, cv.y + cv.h], [cv.x, cv.y + cv.h]], { amp: 3, freq: 0.02, seed: 4, step: 16 });
    wash(paint, cover, act >= 3 ? '#3E4A50' : '#2F4846', { alpha: 0.92, passes: 3, amp: 4, seed: 5 });
    wash(paint, cover, '#1F2E30', { alpha: 0.25, passes: 2, amp: 10, seed: 6 });
    // pages
    for (const side of ['left', 'right']) {
      const R = P[side];
      if (!R) continue;
      const pts = wobble([[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]], { amp: 1.2, freq: 0.03, seed: side === 'left' ? 8 : 9, step: 18 });
      // page-block thickness at the outer edge
      for (let k = 4; k >= 1; k--) {
        const dx = side === 'left' ? -k * 2.2 : k * 2.2;
        wash(paint, pts.map(([x, y]) => [x + dx, y + k * 1.6]), k % 2 ? '#E2D6BE' : '#D4C6AA', { alpha: 1, passes: 1, amp: 0.8, seed: 10 + k });
      }
      wash(paint, pts, '#F6F0E1', { alpha: 1, passes: 2, amp: 1, seed: 12 });
      // gutter shading
      const gx = side === 'left' ? R.x + R.w : R.x;
      const gr = paint.createLinearGradient(gx, 0, side === 'left' ? gx - 90 : gx + 90, 0);
      gr.addColorStop(0, 'rgba(120,96,70,0.28)'); gr.addColorStop(0.35, 'rgba(120,96,70,0.08)'); gr.addColorStop(1, 'rgba(120,96,70,0)');
      if (!this.single) { paint.fillStyle = gr; paint.fillRect(side === 'left' ? gx - 90 : gx, R.y, 90, R.h); }
      // age: foxing and, late on, a water stain
      const r = rng(sp.key.length * 31 + (side === 'left' ? 1 : 2));
      const fox = 3 + act * 3;
      for (let i = 0; i < fox; i++) blob(paint, R.x + r() * R.w, R.y + r() * R.h, 2 + r() * 6, 2 + r() * 5, '#C9A77A', 0.12 + r() * 0.1, i);
      const content = sp[side];
      if (content.type === 'stain' || (act >= 3 && side === 'right' && sp.live)) {
        const sx = R.x + R.w * (content.type === 'stain' ? 0.5 : 0.82), sy = R.y + R.h * (content.type === 'stain' ? 0.5 : 0.12);
        const ring = wobble(Array.from({ length: 24 }, (_, i) => [sx + Math.cos(i / 24 * 6.283) * 90, sy + Math.sin(i / 24 * 6.283) * 70]), { amp: 8, freq: 0.05, seed: 30, step: 8 });
        wash(paint, ring, '#C2A57C', { alpha: 0.16, passes: 2, amp: 6, seed: 31 });
        inkLine(paint, [...ring, ring[0]], { width: 2.2, color: '#A88660', alpha: 0.35, seed: 32, breaks: 0.08 });
      }
      // ruled lines and the margin rule on note pages
      if (['dusk', 'dawn', 'record', 'entries', 'cover'].includes(content.type)) {
        paint.save();
        paint.strokeStyle = 'rgba(110,140,175,0.22)'; paint.lineWidth = 1;
        for (let y = R.y + 128; y < R.y + R.h - 40; y += 38) {
          paint.beginPath(); paint.moveTo(R.x + 18, y + noise1(y, 3) * 1.2); paint.lineTo(R.x + R.w - 18, y + noise1(y, 5) * 1.2); paint.stroke();
        }
        paint.strokeStyle = 'rgba(190,90,80,0.3)';
        paint.beginPath(); paint.moveTo(R.x + 58, R.y + 14); paint.lineTo(R.x + 58, R.y + R.h - 14); paint.stroke();
        paint.restore();
      }
      if (content.type === 'plan' || content.type === 'chart') {
        const id = content.type === 'chart' ? content.id : this.night.id;
        const night = nightById(id);
        const f = this.chartRectFor(R);
        paintChart(C, f, night, { magmell: night.target === MAGMELL, seed: 3 + (id % 3), faded: night.act >= 3 ? 0.08 * (night.act - 2) : 0 });
      }
      if (content.type === 'flower') this.paintFlower(C, R);
      if (content.type === 'cover') {
        // a bookplate
        const bx = R.x + R.w / 2, by = R.y + 120;
        inkLine(ink, wobble([[bx - 220, by - 70], [bx + 220, by - 70], [bx + 220, by + 40], [bx - 220, by + 40]], { amp: 1, freq: 0.05, seed: 40, step: 10 }).concat([[bx - 220, by - 69]]), { width: 1.2, alpha: 0.6, seed: 41 });
      }
    }
    // spine
    if (!this.single) {
      const x = P.left.x + P.left.w;
      inkLine(ink, [[x, P.left.y + 4], [x, P.left.y + P.left.h - 4]], { width: 1, alpha: 0.35, seed: 44, breaks: 0 });
    }
  }

  paintFlower(C, R) {
    // a pressed sprig of thrift taped to the page
    const paint = C.paint, ink = C.ink;
    const x = R.x + R.w * 0.55, y = R.y + R.h * 0.42;
    inkLine(ink, [[x, y + 160], [x - 6, y + 90], [x + 2, y + 30], [x, y]], { width: 1.6, color: '#556B3A', alpha: 0.8, seed: 50 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      blob(paint, x + Math.cos(a) * 12, y + Math.sin(a) * 10, 9, 7, '#D58FA6', 0.7, k);
    }
    blob(paint, x, y, 10, 9, '#C26E8E', 0.6, 12);
    for (let k = 0; k < 6; k++) inkLine(ink, [[x - 4, y + 150 - k * 14], [x - 30 - k * 3, y + 130 - k * 16]], { width: 1, color: '#556B3A', alpha: 0.6, seed: 60 + k });
    // tape
    for (const [tx, ty, a] of [[x - 30, y + 120, -0.3], [x + 20, y + 40, 0.4]]) {
      paint.save(); paint.translate(tx, ty); paint.rotate(a);
      paint.fillStyle = 'rgba(232,220,190,0.75)'; paint.fillRect(-26, -9, 52, 18); paint.restore();
    }
    letter(ink, 'thrift, from the cliff path', x - 90, y + 210, { hand: 'old', size: 24, alpha: 0.75, seed: 3 });
  }

  // ---- page content ----
  drawPage(L, R, content, live, side) {
    switch (content.type) {
      case 'cover': return this.drawCover(L, R);
      case 'flower': case 'blank': case 'stain': return null;
      case 'entries': return this.drawEntries(L, R, content);
      case 'record': return this.drawRecordPage(L, R, content.id);
      case 'chart': return this.drawPastChart(L, R, content.id);
      case 'dusk': return this.drawDuskNotes(L, R);
      case 'dawn': return this.drawDawnNotes(L, R);
      case 'plan': return this.drawPlan(L, R);
      default: return null;
    }
  }

  drawCover(L, R) {
    const ink = L.ink;
    letter(ink, INSIDE_COVER.title, R.x + R.w / 2, R.y + 116, { hand: 'serifItalic', size: 30, align: 'center', alpha: 0.85 });
    let y = R.y + 240;
    for (const ln of INSIDE_COVER.lines) {
      letter(ink, ln, R.x + 84, y, { hand: 'old', size: 32, alpha: 0.9, seed: 5 });
      y += 76;
    }
  }

  drawEntries(L, R, c) {
    const ink = L.ink;
    let y = R.y + 70;
    if (c.years) letter(ink, c.years, R.x + R.w - 50, R.y + 60, { hand: 'serif', size: 20, align: 'right', alpha: 0.4 });
    const size = c.hand === 'old' ? 31 : c.hand === 'otherC' ? 30 : 30;
    for (const e of c.entries) {
      if (e.date) { letter(ink, e.date, R.x + 76, y + 30, { hand: c.hand, size: size * 0.9, alpha: 0.9, shake: (e.shake || 0) * 0.8, seed: 2 }); y += size * 1.4; }
      const b = block(ink, e.text, R.x + 76, y, { hand: c.hand, size, width: R.w - 140, shake: e.shake || 0, drift: (e.shake || 0) * 0.3, seed: (e.date || e.text).length });
      y += b.h + 34;
      if (e.stop || e.last) {
        // the pen stops; a small blot where it rested
        blob(ink, R.x + 76 + Math.min(R.w - 160, 40 + measure(ink, b.lines[b.lines.length - 1] || '', c.hand, size) * 1.04), y - 52, 3.2, 2.6, c.hand === 'old' ? OLD_INK : '#2B2622', 0.7, 3);
      }
    }
    if (c.signature) {
      const sx = R.x + R.w - 260, sy = y + 30;
      letter(ink, '— ' + c.signature, sx, sy, { hand: 'old', size: 34, alpha: 0.9, seed: 9 });
      // the rest of the name lost under a water smudge
      blob(L.paint, sx + 150, sy - 10, 70, 22, '#B9A07C', 0.3, 7, 0.3);
      blob(L.paint, sx + 160, sy - 6, 50, 14, '#8C7A62', 0.18, 8, 0.4);
      letter(ink, 'ci', sx + 136, sy, { hand: 'old', size: 34, alpha: 0.22, seed: 11 });
    }
  }

  header(L, R, night, { dawn = false } = {}) {
    const ink = L.ink;
    const drift = night.drift;
    const date = night.date || '';
    if (date) letter(ink, date, R.x + 76, R.y + 82, { hand: 'keeper', size: 42, drift, seed: night.id });
    if (night.id <= 16) letter(ink, `night ${night.id}`, R.x + R.w - 50, R.y + 80, { hand: 'serifItalic', size: 22, align: 'right', alpha: 0.5 });
    if (dawn) letter(ink, PAGE_WORDS.record, R.x + R.w - 50, R.y + 106, { hand: 'serifItalic', size: 19, align: 'right', alpha: 0.45 });
  }

  drawTideTable(L, x, y, night) {
    // the old keeper's little tide table in the margin: a curve with the hour marked
    const ink = L.ink;
    const shown = night.tideShown;
    letter(ink, 'tides', x, y, { hand: 'old', size: 20, alpha: 0.75, seed: 4 });
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push([x + i * 6, y + 34 - Math.cos((i / 24) * Math.PI * 2) * 14]);
    inkLine(ink, pts, { width: 1.1, color: OLD_INK, alpha: 0.7, seed: 7 });
    const ph = shown === 'high' ? 0 : shown === 'low' ? 12 : 6;
    const [dx, dy] = pts[ph];
    ink.fillStyle = rgba(OLD_INK, 0.85); ink.beginPath(); ink.arc(dx, dy, 3.5, 0, Math.PI * 2); ink.fill();
    letter(ink, shown === 'high' ? 'H.W.' : shown === 'low' ? 'L.W.' : 'half', dx + 8, dy - 6, { hand: 'old', size: 16, alpha: 0.8, seed: 6 });
  }

  shipList(L, x, y, night, results = null, { drift = 0, w = 560, fadeIn = 1 } = {}) {
    const ink = L.ink;
    night.ships.forEach((s, i) => {
      const a = smooth(i * 0.25, i * 0.25 + 0.6, fadeIn * 3);
      boatGlyph(ink, x + 18, y - 6, s.size, 0.8 * a);
      letter(ink, s.name, x + 52, y, { hand: 'keeper', size: 32, drift, alpha: a, seed: i + night.id * 7 });
      const word = PAGE_WORDS.sizes[s.size];
      letter(ink, word, x + w, y, { hand: 'pencil', size: 24, align: 'right', alpha: 0.75 * a, color: PENCIL, seed: i });
      y += 46;
    });
    return y;
  }

  drawDuskNotes(L, R) {
    const n = this.night, ink = L.ink, g = this.game;
    const t = this.t;
    this.header(L, R, n);
    let y = R.y + 140;
    const x = R.x + 76;
    const wText = R.w - 150;
    if (n.id === 1) {
      // the old keeper's last entry, above where the new keeper begins
      const last = OLD_KEEPER[OLD_KEEPER.length - 1];
      const b = block(ink, last.text, x, y - 30, { hand: 'old', size: 26, width: wText, shake: last.shake, drift: 0.2, seed: 77 });
      y += b.h - 4;
      inkLine(ink, [[x, y + 6], [x + 160, y + 4]], { width: 1, color: PENCIL, alpha: 0.5, seed: 3 });
      y += 44;
    }
    const drift = n.drift;
    const tideWord = PAGE_WORDS.tides[n.tide];
    if (!n.epilogue) {
      letter(ink, `${PAGE_WORDS.tide} — ${tideWord}`, x, y, { hand: 'keeper', size: 32, drift, seed: 1 });
      y += 46;
      letter(ink, `${PAGE_WORDS.weather} — ${PAGE_WORDS.weathers[n.weather] || n.weather}`, x, y, { hand: 'keeper', size: 32, drift, seed: 2 });
      if (n.act === 1 || n.id === 15) this.drawTideTable(L, R.x + R.w - 230, y - 56, n);
      y += 62;
      letter(ink, PAGE_WORDS.ships, x, y, { hand: 'serifItalic', size: 24, alpha: 0.65 });
      y += 46;
    }
    y = this.shipList(L, x, y, n, null, { drift, w: wText, fadeIn: t });
    y += 18;
    // yesterday's struck boats
    const prev = g.state.history[n.id - 1];
    const struck = (prev?.results || []).filter((r) => r.fate === 'struck');
    for (const s of struck) {
      const fn = n.act <= 1 ? STRUCK_FOLLOWUP.early : n.act === 2 ? STRUCK_FOLLOWUP.mid : STRUCK_FOLLOWUP.late;
      const b = block(ink, fn(s.name), x, y - 26, { hand: 'keeper', size: 28, width: wText, drift, seed: 5, reveal: smooth(0.5, 2, t) });
      y += b.h + 12;
    }
    const note = KEEPER_NOTES[n.id]?.dusk;
    if (note) {
      const b = block(ink, note, x, y - 26, { hand: 'keeper', size: 31, width: wText, drift, seed: n.id * 3, reveal: smooth(0.6, 0.6 + note.length / 26, t) });
      y += b.h + 20;
    }
    if (n.revealPages) {
      const msg = n.revealPages === 'others' ? 'the front pages — other hands' : 'the oldest pages';
      const a = 0.55 + 0.25 * Math.sin(t * 2);
      letter(ink, '← ' + msg, R.x + 70, R.y + R.h - 34, { hand: 'pencil', size: 26, color: PENCIL, alpha: a * smooth(2, 3, t) });
    }
  }

  recordLines(night, results) {
    const out = [];
    const sp = SPECIAL_RECORDS[night.id];
    night.ships.forEach((s, i) => {
      const r = results?.[i] || (results ? null : { fate: 'home' });
      let text, hand = 'keeper', mark = 'tick';
      if (sp && sp.ship === i && sp.kind === 'overdue') { text = RECORD.overdue(s); hand = 'old'; mark = null; }
      else if (!r) { text = `${s.name} — `; mark = null; }
      else if (r.fate === 'struck') { text = RECORD.struck(s, reefName(r.reef)); mark = 'cross'; }
      else if (r.fate === 'gone') { text = RECORD.gone(s); mark = null; }
      else text = RECORD.home(s, i);
      out.push({ text, hand, mark });
    });
    return out;
  }

  drawRecordBody(L, R, night, results, y, { reveal = 1, t = 99, dawnNote = true, duskNote = false } = {}) {
    const ink = L.ink;
    const x = R.x + 76, wText = R.w - 150, drift = night.drift;
    if (duskNote && KEEPER_NOTES[night.id]?.dusk) {
      const b = block(ink, KEEPER_NOTES[night.id].dusk, x, y - 26, { hand: 'keeper', size: 28, width: wText, drift, seed: night.id * 3 });
      y += b.h + 26;
    }
    const lines = this.recordLines(night, results);
    lines.forEach((ln, i) => {
      const a = smooth(0.3 + i * 0.5, 0.9 + i * 0.5, t);
      if (ln.mark === 'tick') {
        inkLine(ink, [[x - 30, y - 10], [x - 23, y - 2], [x - 10, y - 22]], { width: 2, alpha: 0.8 * a, seed: i });
      } else if (ln.mark === 'cross') {
        cross(ink, x - 20, y - 12, 7, 0.8 * a, '#7A2E22');
      }
      const b = block(ink, ln.text, x, y - 28, { hand: ln.hand, size: ln.hand === 'old' ? 27 : 30, width: wText, drift: ln.hand === 'old' ? 0.2 : drift, shake: ln.hand === 'old' ? 0.5 : 0, seed: i + 11, alpha: a });
      y += b.h + 14;
    });
    y += 16;
    const note = KEEPER_NOTES[night.id]?.dawn;
    if (dawnNote && note) {
      const t0 = 0.6 + lines.length * 0.5;
      const b = block(ink, note, x, y - 26, { hand: 'keeper', size: 31, width: wText, drift, seed: night.id * 5, reveal: Math.min(reveal, smooth(t0, t0 + note.length / 24, t)) });
      y += b.h;
    }
    return y;
  }

  drawDawnNotes(L, R) {
    const n = this.night;
    this.header(L, R, n, { dawn: true });
    const y = this.drawRecordBody(L, R, n, this.game.lastResults, R.y + 160, { t: this.t });
    // close the book
    const ready = this.t > 1.2;
    const bx = R.x + R.w - 60, by = Math.max(y + 90, R.y + R.h - 70);
    if (!this.single) this.wordButton(L, 'closeBook', 'close the book', bx, R.y + R.h - 64, { align: 'right', size: 36, onClick: () => this.closeBook(), alpha: smooth(1.2, 2.2, this.t), disabled: !ready });
    else this.wordButton(L, 'closeBook', 'close the book', bx, by, { align: 'right', size: 36, onClick: () => this.closeBook(), alpha: smooth(1.2, 2.2, this.t), disabled: !ready });
  }

  drawRecordPage(L, R, id) {
    const night = nightById(id);
    const h = this.game.state.history[id];
    this.header(L, R, night, { dawn: true });
    if (!h) {
      letter(L.ink, '(no record kept)', R.x + 76, R.y + 200, { hand: 'pencil', size: 28, color: PENCIL, alpha: 0.6 });
      return;
    }
    this.drawRecordBody(L, R, night, h.results, R.y + 160, { duskNote: true });
  }

  pastWaypoints(id) {
    const h = this.game.state.history[id];
    let w = h?.waypoints?.map((p) => p.slice());
    if (!w) return null;
    // night 10 onward: last night's turn isn't quite where it was drawn
    if (id === 9 && this.night.id >= 10 && w.length) w[0] = [w[0][0] + 1.5, w[0][1] + 3.5];
    return w;
  }

  drawPastChart(L, R, id) {
    const night = nightById(id);
    const f = this.chartRectFor(R);
    const w = this.pastWaypoints(id);
    letter(L.ink, `Plan — ${night.date || '…'}`, R.x + 60, R.y + 70, { hand: 'serifItalic', size: 24, alpha: 0.7 });
    if (!w) return;
    const h = this.game.state.history[id];
    const style = h?.style === 'old' || h?.style === 'ghost' ? 'old' : 'ink';
    for (const e of night.entries.slice(0, 1)) drawRoute(L.ink, routePage(f, night, w, e), { style, seed: id });
    (h.results || []).forEach((r) => {
      if (r.fate === 'struck' && r.at) { const [px, py] = f.toPage(r.at[0], r.at[1]); cross(L.ink, px, py, 6, 0.85, '#7A2E22'); }
    });
  }

  drawPlan(L, R) {
    const n = this.night, ink = L.ink, g = this.game, t = this.t;
    const f = this.chartRectFor(R);
    const dusk = this.mode === 'dusk';
    letter(ink, dusk ? `The bay — plan for the night` : `The bay — as sailed`, R.x + 60, R.y + 70, { hand: 'serifItalic', size: 25, alpha: 0.75 });
    const magmell = n.target === MAGMELL;

    // entry arrows
    n.entries.forEach((e, i) => {
      const [px, py] = f.toPage(e[0], e[1]);
      const dir = magmell ? -1 : 1;
      const x0 = magmell ? px + 26 : px - 4;
      inkLine(ink, [[x0, py], [x0 + 22 * dir, py]], { width: 1.6, color: '#7A2E22', alpha: 0.8, seed: i });
      ink.strokeStyle = rgba('#7A2E22', 0.8); ink.lineWidth = 1.6;
      ink.beginPath(); ink.moveTo(x0 + 22 * dir - 6 * dir, py - 5); ink.lineTo(x0 + 22 * dir, py); ink.lineTo(x0 + 22 * dir - 6 * dir, py + 5); ink.stroke();
    });

    // night 10: last night's line, faint, its turn not quite where it was drawn
    if (dusk && n.anomalies.find((a) => a.type === 'movedWaypoint')) {
      const w9 = this.pastWaypoints(9) || (() => { const s = solve(nightById(9)); if (s && s.length) s[0] = [s[0][0] + 1.5, s[0][1] + 3.5]; return s; })();
      if (w9) drawRoute(ink, routePage(f, nightById(9), w9, nightById(9).entries[0]), { style: 'pencil', alpha: 0.35, color: OLD_INK, seed: 9 });
    }

    // the old keeper's line, previewed while hovering the offer
    if (dusk && this.hoverOld && this.style !== 'old') {
      const w = solve(n);
      if (w) drawRoute(ink, routePage(f, n, w, n.entries[0]), { style: 'old', alpha: 0.35, seed: 4 });
    }

    // the route
    const inkP = this.inking ? clamp(this.inking.t, 0, 1) : (dusk ? 0 : 1);
    n.entries.forEach((e, i) => {
      const pts = routePage(f, n, this.wps, e);
      // budget cut: where along the main route the ink runs out
      let cut = Infinity;
      if (i === 0 && dusk && this.over) {
        let acc = 0;
        for (let k = 1; k < pts.length; k++) { acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) / f.s; if (acc > n.inkBudget) { cut = k; break; } }
      }
      const al = i === 0 ? 1 : 0.6;
      if (dusk && !this.inking) {
        if (this.style === 'old' || this.style === 'ghost') drawRoute(ink, pts, { style: this.style === 'ghost' ? 'ghost' : 'old', seed: 4 + i, alpha: al });
        else drawRoute(ink, pts, { style: 'pencil', seed: 7 + i, alpha: al, budgetAt: cut });
      } else {
        if (this.inking) drawRoute(ink, pts, { style: 'pencil', seed: 7 + i, alpha: al * (1 - inkP) });
        const st = this.style === 'old' || this.style === 'ghost' ? 'old' : 'ink';
        drawRoute(ink, pts, { style: st, progress: inkP, seed: 11 + i, alpha: al });
        if (this.inking && inkP < 1 && i === 0) {
          const k = Math.min(pts.length - 1, Math.floor(pts.length * inkP));
          glow(L.light, pts[k][0], pts[k][1], 26, '#E6C27A', 0.35);
        }
      }
    });

    // waypoint handles
    if (dusk && !this.inking) {
      const inp = g.input;
      const hov = this.liveChart() && f.inside(inp.x, inp.y) ? this.handleAt(inp.x, inp.y, f) : -1;
      this.wps.forEach((w, i) => {
        const [px, py] = f.toPage(w[0], w[1]);
        const big = i === this.drag || i === hov;
        const col = this.style === 'pencil' ? '#3A3A44' : OLD_INK;
        ink.strokeStyle = rgba(col, big ? 0.9 : 0.65); ink.lineWidth = big ? 2 : 1.4;
        ink.beginPath(); ink.arc(px + noise1(i, 2) * 0.8, py, big ? 10 : 7, 0, Math.PI * 2); ink.stroke();
        ink.fillStyle = rgba(col, 0.8); ink.beginPath(); ink.arc(px, py, 2, 0, Math.PI * 2); ink.fill();
      });
      // pencil "?" where the line runs too close for the biggest boat tonight
      this.haz.forEach(([wx, wy], i) => {
        const [px, py] = f.toPage(wx, wy);
        const a = 0.65 + 0.2 * Math.sin(t * 3 + i);
        letter(ink, '?', px + 10, py - 8, { hand: 'pencil', size: 34, color: '#7A2E22', alpha: a, seed: i });
        ink.strokeStyle = rgba('#7A2E22', 0.4); ink.lineWidth = 1;
        ink.beginPath(); ink.arc(px, py, 8, 0, Math.PI * 2); ink.stroke();
      });
    }

    // dawn: marks where boats touched
    if (!dusk) {
      (g.lastResults || []).forEach((r) => {
        if (r.fate === 'struck' && r.at) { const [px, py] = f.toPage(r.at[0], r.at[1]); cross(ink, px, py, 7, 0.85, '#7A2E22'); }
      });
    }

    // ---- below the chart ----
    const by = f.y1 + 40;
    if (dusk) {
      this.drawInkwell(L, R.x + 70, by + 44);
      this.drawTally(L, R.x + 130, by + 20);
      const canInk = !this.over && !this.inking;
      const safeLine = !this.haz.length;
      const pulse = canInk && safeLine && this.wps.length ? 0.15 * (0.5 + 0.5 * Math.sin(t * 2.6)) : 0;
      this.wordButton(L, 'undo', 'take back', R.x + 150, by + 100, { size: 30, onClick: () => this.undo(), disabled: !this.history.length || !!this.inking, alpha: this.history.length ? 0.85 : 0.35 });
      this.wordButton(L, 'clear', 'rub out', R.x + 310, by + 100, { size: 30, onClick: () => this.clear(), disabled: (!this.wps.length && this.style === 'pencil') || !!this.inking, alpha: this.wps.length ? 0.85 : 0.35 });
      this.wordButton(L, 'ink', 'Ink the plan', R.x + R.w - 56, by + 104, { size: 46, align: 'right', onClick: () => this.inkThePlan(), disabled: !canInk, alpha: canInk ? 0.9 + pulse : 0.35, color: '#1B2440', blot: true });
      if (this.over) letter(ink, 'not enough ink in the well for that line', R.x + R.w - 56, by + 146, { hand: 'pencil', size: 22, align: 'right', color: '#7A2E22', alpha: 0.75 });
      if (n.offerOldPlan) {
        const hov = this.wordButton(L, 'old', TEACH.oldPlan.replace('or ', ''), R.x + 76, by + 184, { hand: 'old', size: 29, onClick: () => this.followOld(), alpha: 0.85, color: OLD_INK });
        this.hoverOld = hov;
      } else this.hoverOld = false;
      this.drawTeach(L, R, f);
      if (this.flash) letter(ink, this.flash.text, f.x0 + f.w / 2, f.y0 - 14, { hand: 'pencil', size: 24, align: 'center', color: '#7A2E22', alpha: 0.85 * (1 - smooth(2.2, 3, this.flash.t)) });
    }
  }

  drawTeach(L, R, f) {
    const n = this.night, ink = L.ink;
    const notes = [];
    if (n.tutorial) notes.push(...TEACH.tutorial);
    if (n.teachUndo) notes.push(TEACH.teachUndo);
    if (n.teachTide) notes.push(TEACH.teachTide);
    if (n.teachLow) notes.push(TEACH.teachLow);
    if (n.teachSize) notes.push(TEACH.teachSize);
    if (n.teachCurrent) notes.push(TEACH.teachCurrent);
    if (n.ghostPlan && this.style === 'ghost') {
      const w = this.wps[0];
      if (w) { const [px, py] = f.toPage(w[0], w[1]); letter(ink, TEACH.ghostPlan, px + 16, py + 34, { hand: 'old', size: 22, color: OLD_INK, alpha: 0.8, shake: 0.6, seed: 9 }); }
    }
    if (n.final) notes.push(TEACH.finalNight);
    if (!notes.length) return;
    let y = f.y1 + 290;
    const a = smooth(0.8, 2.2, this.t);
    const text = notes.join(' ');
    block(ink, text, R.x + 70, y - 28, { hand: 'old', size: 27, width: R.w - 140, color: '#5B4A3E', alpha: 0.75 * a, seed: n.id });
  }

  drawInkwell(L, x, y) {
    const ink = L.ink, paint = L.paint;
    const lvl = clamp(1 - this.used / this.night.inkBudget, 0, 1);
    // glass pot
    const pot = wobble([[x - 24, y - 8], [x - 18, y - 30], [x + 18, y - 30], [x + 24, y - 8], [x + 22, y + 22], [x - 22, y + 22]], { amp: 0.8, freq: 0.1, seed: 3, step: 5 });
    wash(paint, pot, '#C9D3D6', { alpha: 0.5, passes: 1, amp: 0.5, seed: 4 });
    // ink inside
    const top = y + 20 - lvl * 44;
    paint.save(); paint.beginPath(); paint.moveTo(pot[0][0], pot[0][1]); pot.forEach((p) => paint.lineTo(p[0], p[1])); paint.closePath(); paint.clip();
    paint.fillStyle = rgba(this.over ? '#5A2A2A' : '#1E2638', 0.85);
    paint.fillRect(x - 30, top, 60, 60);
    paint.restore();
    inkLine(ink, [...pot, pot[0]], { width: 1.3, alpha: 0.85, seed: 6 });
    // neck
    inkLine(ink, [[x - 10, y - 30], [x - 10, y - 40], [x + 10, y - 40], [x + 10, y - 30]], { width: 1.2, alpha: 0.85, seed: 7 });
    letter(ink, 'ink', x, y + 50, { hand: 'serifItalic', size: 18, align: 'center', alpha: 0.6 });
  }

  drawTally(L, x, y) {
    // a tally of turns left
    const ink = L.ink;
    const left = this.night.maxPoints - this.wps.length;
    for (let i = 0; i < this.night.maxPoints; i++) {
      const used = i >= left;
      inkLine(ink, [[x + i * 13, y], [x + i * 13 + 3, y + 30]], { width: 1.8, alpha: used ? 0.2 : 0.75, seed: i + 3, breaks: 0 });
    }
    letter(ink, 'turns', x + this.night.maxPoints * 13 + 10, y + 26, { hand: 'serifItalic', size: 18, alpha: 0.6 });
  }

  wordButton(L, id, text, x, y, { size = 32, align = 'left', onClick, disabled = false, alpha = 0.85, hand = 'keeper', color = '#1F2430', blot = false } = {}) {
    const ink = L.ink;
    const w = measure(ink, text, hand, size);
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const hov = this.game.input.button({ id: 'lb-' + id, x: x0 - 14, y: y - size * 0.95, w: w + 28, h: size * 1.35, onClick, disabled });
    const a = clamp(alpha + (hov && !disabled ? 0.15 : 0), 0, 1);
    letter(ink, text, x0, y, { hand, size, alpha: a, color, seed: 3 });
    if (hov && !disabled) {
      inkLine(ink, [[x0, y + 8], [x0 + w * 0.5, y + 11], [x0 + w, y + 6]], { width: 1.4, alpha: 0.6, seed: 5 });
    }
    if (blot && !disabled) blob(L.paint, x0 + w + 16, y - size * 0.3, 6, 5, '#1E2638', 0.5, 4);
    return hov;
  }

  drawNav(L, P) {
    const ink = L.ink;
    const canBack = this.idx > 0, canFwd = this.idx < this.spreads.length - 1;
    const lp = P.left || P.right, rp = P.right || P.left;
    if (canBack && !this.inking) {
      const x = lp.x + 26, y = lp.y + lp.h - 22;
      const hov = this.game.input.button({ id: 'nav-back', x: x - 16, y: y - 34, w: 120, h: 48, onClick: () => this.flip(-1) });
      letter(ink, '‹ earlier', x, y, { hand: 'serifItalic', size: 22, alpha: hov ? 0.9 : 0.5 });
    }
    if (canFwd) {
      const x = rp.x + rp.w - 26, y = rp.y + rp.h - 22;
      const hov = this.game.input.button({ id: 'nav-fwd', x: x - 130, y: y - 34, w: 146, h: 48, onClick: () => this.flip(1) });
      letter(ink, this.idx === this.spreads.length - 2 ? 'tonight ›' : 'later ›', x, y, { hand: 'serifItalic', size: 22, align: 'right', alpha: hov ? 0.9 : 0.55 });
      // from far back, a quick way home
      if (this.idx < this.spreads.length - 3) {
        const hv2 = this.game.input.button({ id: 'nav-home', x: x - 130, y: y - 74, w: 146, h: 40, onClick: () => { this.flipAnim = { t: 0, dir: 1 }; this.idx = this.spreads.length - 1; this.game.audio?.page(); } });
        letter(ink, 'back to tonight »', x, y - 40, { hand: 'serifItalic', size: 18, align: 'right', alpha: hv2 ? 0.85 : 0.4 });
      }
    }
  }

  drawTabs(L) {
    const ink = L.ink;
    const tabs = [['left', 'notes'], ['right', 'chart']];
    tabs.forEach(([side, label], i) => {
      const x = 260 + i * 340, y = 76;
      const on = this.side === side;
      this.game.input.button({ id: 'tab-' + side, x: x - 110, y: y - 46, w: 220, h: 64, onClick: () => { this.side = side; this.drag = -1; } });
      letter(ink, label, x, y, { hand: 'keeper', size: 42, align: 'center', alpha: on ? 0.95 : 0.45 });
      if (on) inkLine(ink, [[x - 50, y + 10], [x + 50, y + 8]], { width: 2, alpha: 0.6, seed: i });
    });
  }

  drawFlip(L, P) {
    // a page turning over: a paper leaf sweeping across the spread, with a soft shadow
    const k = this.flipAnim.t, dir = this.flipAnim.dir;
    const lp = P.left || P.right, rp = P.right || P.left;
    const spine = this.single ? lp.x : lp.x + lp.w;
    const W = this.single ? lp.w : rp.w;
    const e = smooth(0, 1, k);
    // the leaf's far edge moves from one side to the other
    const ang = (dir > 0 ? e : 1 - e) * Math.PI; // 0: lying right, PI: lying left
    const edge = spine + Math.cos(ang) * W;
    const lift = Math.sin(ang) * 40;
    const y0 = lp.y, y1 = lp.y + lp.h;
    const pts = [[spine, y0], [edge, y0 - lift * 0.4], [edge + (edge > spine ? -1 : 1) * lift * 0.3, (y0 + y1) / 2], [edge, y1 + lift * 0.2], [spine, y1]];
    const paint = L.paint;
    paint.save();
    paint.fillStyle = 'rgba(80,60,40,0.12)';
    paint.beginPath(); pts.forEach(([x, y], i) => (i ? paint.lineTo(x + 10, y + 8) : paint.moveTo(x + 10, y + 8))); paint.closePath(); paint.fill();
    paint.fillStyle = '#EFE6D3';
    paint.beginPath(); pts.forEach(([x, y], i) => (i ? paint.lineTo(x, y) : paint.moveTo(x, y))); paint.closePath(); paint.fill();
    paint.restore();
    L.ink.clearRect && L.ink.save();
    inkLine(L.ink, pts.slice(1, 4), { width: 1, alpha: 0.35, seed: 3 });
    L.ink.restore();
  }
}
