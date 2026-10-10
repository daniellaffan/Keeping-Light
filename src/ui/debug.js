// Debug mode (?debug=1): a small panel plus keys to move through the game quickly.
//   N next phase · Shift+N next night · 1–9 / 0 jump to night (0 = 10) · A auto-plan · F fast ×8 · R reload night
import { NIGHTS, LAST_NIGHT } from '../game/nights.js';

export class DebugPanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('debug');
    this.el.style.display = 'block';
    this.frames = 0; this.fpsT = performance.now(); this.fps = 0;
    this.el.innerHTML = `<div class="info"></div>
      <select class="night">${NIGHTS.map((n) => `<option value="${n.id}">${n.epilogue ? 'E' + n.epilogue : 'Night ' + n.id}</option>`).join('')}<option value="finale">finale</option></select>
      <select class="phase"><option>day</option><option>dusk</option><option>night</option><option>dawn</option></select>
      <button class="go">go</button><button class="next">N</button><button class="ff">F ×8</button><button class="auto">A</button>`;
    this.info = this.el.querySelector('.info');
    const nightSel = this.el.querySelector('.night'), phaseSel = this.el.querySelector('.phase');
    this.el.querySelector('.go').onclick = () => {
      if (nightSel.value === 'finale') this.finale();
      else this.jump(+nightSel.value, phaseSel.value);
    };
    this.el.querySelector('.next').onclick = () => this.nextPhase();
    this.el.querySelector('.ff').onclick = () => this.fast();
    this.el.querySelector('.auto').onclick = () => this.auto();
    // keep clicks on the panel from reaching the game
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());

    game.input.on('key', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.target && /^(SELECT|INPUT|BUTTON)$/.test(e.target.tagName)) return false;
      const k = e.key;
      if (k === 'n' || k === 'N') { if (e.shiftKey) this.nextNight(); else this.nextPhase(); return true; }
      if (k === 'f' || k === 'F') { this.fast(); return true; }
      if (k === 'a' || k === 'A') { this.auto(); return true; }
      if (k === 'r' || k === 'R') { this.jump(game.night.id, 'day'); return true; }
      if (/^[0-9]$/.test(k)) { this.jump(k === '0' ? 10 : +k, 'day'); return true; }
      return false;
    });
  }

  jump(id, phase = 'day') {
    const g = this.game;
    g.transition = null;
    g.startNight(Math.max(1, Math.min(LAST_NIGHT, id)), phase);
  }

  finale(part = 'stairs') {
    const g = this.game;
    g.night = NIGHTS[LAST_NIGHT - 1];
    g.go('finale', { part });
  }

  nextNight() {
    const id = this.game.night.id;
    if (id >= LAST_NIGHT) this.finale();
    else this.jump(id + 1, 'day');
  }

  fast() { this.game.timeScale = this.game.timeScale > 1 ? 1 : 8; }

  auto() {
    const sc = this.game.scene;
    if (sc && sc.autoPlan && sc.mode === 'dusk') sc.autoPlan();
  }

  nextPhase() {
    const g = this.game, sc = g.scene, name = g.sceneName;
    if (name === 'title') return g.newGame();
    if (name === 'daymap') return g.toDusk();
    if (name === 'vignette') return sc.leave();
    if (name === 'logbook') {
      if (sc.mode === 'dusk') return g.inkPlan(g.solveFor(g.night));
      return sc.closeBook();
    }
    if (name === 'bay') {
      if (sc.mode === 'night') {
        if (sc.leaving) return;
        sc.leaving = true;
        for (let i = 0; i < 20000 && !sc.fleet.done; i++) sc.fleet.update(0.1);
        g.lastResults = sc.fleet.results();
        return g.onNightOver(g.lastResults);
      }
      sc.leaving = true;
      return g.onDawnSeen();
    }
    if (name === 'finale') {
      if (sc.part === 'stairs') return g.go('finale', { part: 'sunset' });
      if (sc.part === 'sunset') return g.go('finale', { part: 'end' });
      return g.finish();
    }
  }

  tick() {
    this.frames++;
    const now = performance.now();
    if (now - this.fpsT > 500) { this.fps = Math.round(this.frames * 1000 / (now - this.fpsT)); this.frames = 0; this.fpsT = now; }
    if (this.frames % 6) return;
    const g = this.game, n = g.night, u = g.wc.u, sc = g.scene;
    const f = (v) => (typeof v === 'number' ? v.toFixed(2) : v);
    const sub = sc ? (sc.mode || sc.part || sc.kind || '') : '';
    this.info.textContent =
      `night ${n.id}${n.epilogue ? ' (E' + n.epilogue + ')' : ''} · ${n.date || '—'} · act ${n.act}\n` +
      `phase ${g.phase} · scene ${g.sceneName}${sub ? ' / ' + sub : ''} · ×${g.timeScale} · ${this.fps} fps\n` +
      `warmth ${f(u.warmth)} sat ${f(u.sat)} paper ${f(u.paperShow)} bleed ${f(u.bleed)}\n` +
      `fog ${f(u.fog)} ink ${f(u.inkSpread)} gran ${f(u.gran)} white ${f(u.white)} cloak ${f(u.cloakAmt)}\n` +
      `N phase · ⇧N night · 1–9,0 jump · A plan · F fast · R reload`;
  }
}
