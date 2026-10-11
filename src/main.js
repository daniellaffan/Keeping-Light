// Boot, frame loop, scene manager and the phase state machine.
import { createGL } from './render/gl.js';
import { Watercolor } from './render/watercolor.js';
import { Layers } from './render/layers.js';
import { Input } from './ui/input.js';
import { clearMeasureCache } from './render/hand.js';
import { NIGHTS, nightById, LAST_NIGHT } from './game/nights.js';
import * as Store from './state.js';
import { BayScene } from './render/scenes/bay.js';
import { solve } from './game/chart.js';
import { Fleet } from './game/ships.js';
import { TitleScene } from './render/scenes/title.js';
import { LogbookScene } from './render/scenes/logbook.js';
import { HeadlandMapScene } from './render/scenes/headland-map.js';
import { VignetteScene } from './render/scenes/village.js';
import { FinaleScene } from './render/scenes/finale.js';
import { DebugPanel } from './ui/debug.js';
import { SoundControl } from './ui/settings.js';
import { createAudio } from './audio/audio.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const AUTOPLAY = DEBUG && params.get('autoplay') === '1';
// The first-person game is opt-in while it is being built; ?view=classic is the 2D game.
const FP = params.get('view') === 'fp';

const canvas = document.getElementById('stage');
const gl = createGL(canvas);
if (!gl) {
  document.getElementById('fallback').style.display = 'flex';
  document.getElementById('loading').style.display = 'none';
  throw new Error('WebGL2 unavailable');
}

const layers = new Layers();
const wc = new Watercolor(gl);
const input = new Input(canvas, layers);

const LOOK_DEFAULT = {
  warmth: 0.4, sat: 1, paperShow: 0.1, bleed: 0, fog: 0, wobble: 3, gran: 0.75, edge: 1, inkSpread: 0,
  fogColor: [0.86, 0.86, 0.84], lightGain: 1, cloakAmt: 0, clearAmt: 0, white: 0, inkOut: 0,
};

export const game = {
  gl, wc, layers, input, canvas,
  debug: DEBUG, autoplay: AUTOPLAY, fp: FP, world: null,
  settings: Store.loadSettings(),
  state: Store.freshProgress(),
  saved: Store.loadProgress(),
  night: NIGHTS[0],
  phase: 'title',
  scene: null, sceneName: '',
  scenes: {},
  time: 0, timeScale: 1,
  lastResults: null,
  audio: null,
  look: { ...LOOK_DEFAULT },
  transition: null,

  go(name, args = {}, opts = {}) {
    const sc = this.scenes[name];
    if (!sc) throw new Error('No scene ' + name);
    if (opts.transition !== 'none' && this.scene) {
      wc.snapshot();
      this.transition = { t: 0, dur: opts.duration || 1.8 };
      wc.u.trans = 0;
      wc.u.transCenter = opts.center || [0.5, 0.5];
    }
    if (this.scene && this.scene !== sc && this.scene.exit) this.scene.exit();
    this.scene = sc;
    this.sceneName = name;
    if (opts.snapLook) this.snapLook = true;
    sc.enter(args);
    if (this.audio) this.audio.setScene(name, this.night, args);
  },

  // ---------------- flow ----------------
  newGame() {
    Store.clearProgress();
    this.state = Store.freshProgress();
    this.saved = null;
    this.startNight(1);
  },
  continueGame() {
    const s = Store.loadProgress();
    if (!s) return this.newGame();
    this.state = s;
    this.startNight(s.night);
  },
  startNight(id, phase = 'day') {
    this.night = nightById(id);
    this.state.night = id;
    this.phase = phase;
    if (phase === 'dusk') return this.toDusk();
    if (phase === 'night') return this.inkPlan(this.state.history[id]?.waypoints || this.solveFor(this.night));
    if (phase === 'dawn') {
      // jumping straight to dawn (debug): sail the default plan so the record has something to say
      const h = (this.state.history[id] ||= {});
      if (!h.results) {
        h.waypoints ||= this.solveFor(this.night);
        const fleet = new Fleet(this.night, h.waypoints);
        for (let i = 0; i < 20000 && !fleet.done; i++) fleet.update(0.1);
        h.results = fleet.results();
      }
      return this.onNightOver(h.results, true);
    }
    if (this.night.day.arrival && this.scenes.vignette) this.go('vignette', { place: 'arrival' });
    else if (this.scenes.daymap) this.go('daymap', {});
    else this.toDusk();
  },
  visit(place) {
    this.state.visits[this.night.id] = place;
    this.go('vignette', { place });
  },
  toDusk() {
    this.phase = 'dusk';
    if (this.scenes.logbook) this.go('logbook', { mode: 'dusk' });
    else this.inkPlan(this.solveFor(this.night));
  },
  inkPlan(waypoints, meta = {}) {
    const h = (this.state.history[this.night.id] ||= {});
    h.waypoints = waypoints.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
    Object.assign(h, meta);
    this.phase = 'night';
    this.go('bay', { mode: 'night', night: this.night, waypoints }, { duration: 2.6, center: [0.12, 0.55] });
  },
  onNightOver(results, skipToDawn = false) {
    const h = (this.state.history[this.night.id] ||= {});
    if (results) h.results = results;
    this.lastResults = results;
    this.phase = 'dawn';
    this.go('bay', { mode: 'dawn', night: this.night }, { duration: 2.4, center: [0.85, 0.7] });
  },
  onDawnSeen() {
    if (this.scenes.logbook) this.go('logbook', { mode: 'dawn' }, { duration: 1.6 });
    else this.onDawnDone();
  },
  onDawnDone() {
    const id = this.night.id;
    this.state.nightsPlayed = Math.max(this.state.nightsPlayed, id);
    if (id >= LAST_NIGHT) {
      this.state.night = id; this.state.phase = 'ending';
      Store.saveProgress(this.state);
      if (this.scenes.finale) this.go('finale', { part: 'stairs' }, { duration: 2.2 });
      else this.toTitle();
      return;
    }
    this.state.night = id + 1; this.state.phase = 'day';
    Store.saveProgress(this.state);
    this.saved = this.state;
    this.startNight(id + 1);
  },
  finish() {
    Store.clearProgress();
    this.saved = null;
    this.state = Store.freshProgress();
    if (AUTOPLAY) { console.log('AUTOPLAY COMPLETE'); window.__autoplayDone = true; }
    this.toTitle();
  },
  toTitle() {
    this.saved = Store.loadProgress();
    this.phase = 'title';
    if (this.scenes.title) this.go('title', {}, { duration: 2.4 });
  },
  solveFor(n) { return solve(n) || []; },
  saveSettings() { Store.saveSettings(this.settings); },
};
window.__game = game;

game.scenes.bay = new BayScene(game);
game.scenes.title = new TitleScene(game);
game.scenes.logbook = new LogbookScene(game);
game.scenes.daymap = new HeadlandMapScene(game);
game.scenes.vignette = new VignetteScene(game);
game.scenes.finale = new FinaleScene(game);
if (DEBUG) game.debugPanel = new DebugPanel(game);
game.soundControl = new SoundControl(game);

// Audio starts on the first gesture (browsers require it) and never blocks the game if it fails.
game.startAudio = () => {
  try {
    if (!game.audio) game.audio = createAudio(game);
    game.audio?.start();
    if (document.hidden) game.audio?.suspend();
  } catch (err) { console.warn('audio unavailable', err); game.audio = null; }
};
const firstGesture = () => { game.startAudio(); window.removeEventListener('pointerdown', firstGesture, true); window.removeEventListener('keydown', firstGesture, true); };
window.addEventListener('pointerdown', firstGesture, true);
window.addEventListener('keydown', firstGesture, true);
if (AUTOPLAY) game.timeScale = parseFloat(params.get('speed') || '4');

// ---------------- sizing ----------------
function resize() {
  const cssW = Math.max(320, window.innerWidth), cssH = Math.max(240, window.innerHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
  const maxPx = 2.8e6;
  if (bw * bh > maxPx) { const s = Math.sqrt(maxPx / (bw * bh)); bw = Math.round(bw * s); bh = Math.round(bh * s); }
  canvas.width = bw; canvas.height = bh;
  wc.resize(bw, bh, cssW, cssH);
  layers.resize(cssW, cssH, dpr);
  game.world?.resize(layers);
  clearMeasureCache();
}
window.addEventListener('resize', resize);
resize();

// ---------------- look ----------------
function applyLook(dt) {
  const target = { ...LOOK_DEFAULT, ...(game.scene && game.scene.look ? game.scene.look() : {}) };
  const k = game.snapLook ? 1 : Math.min(1, dt * 1.6);
  game.snapLook = false;
  const u = wc.u;
  for (const key of Object.keys(target)) {
    const v = target[key];
    if (Array.isArray(v)) {
      if (key === 'cloak' || key === 'clear') { u[key] = v.slice(); continue; }
      u[key] = (u[key] || v).map((x, i) => x + (v[i] - x) * k);
    } else if (typeof v === 'number') {
      if (key === 'white' || key === 'cloakAmt' || key === 'clearAmt' || key === 'inkOut') u[key] = v;
      else u[key] = (u[key] ?? v) + (v - (u[key] ?? v)) * k;
    }
  }
}

// ---------------- loop ----------------
let last = performance.now();
let running = true;
function frame(now) {
  if (!running) return;
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!step(dt)) return;
  requestAnimationFrame(frame);
}

// One tick: update, paint the layers, composite. Exposed in debug mode so tests can drive time directly.
function step(dt) {
  dt *= game.timeScale;
  game.time += dt;
  try {
    input.frame();
    const sc = game.scene;
    const three = !!(sc && sc.three && game.world);
    let hud = null;
    if (sc) {
      sc.update(dt);
      if (three) {
        // the world paints itself; the canvases only carry lettering and panels laid over it
        if (game.overlay || (sc.hudActive && sc.hudActive())) {
          layers.begin(sc.safe || { w: 1600, h: 1000 }, { paper: null });
          sc.draw(layers);
          if (game.overlay) game.overlay.draw(layers, dt);
          hud = layers;
        } else layers.fit(sc.safe || { w: 1600, h: 1000 });
        wc.u.margin = layers.marginUv({ x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 });
      } else {
        layers.begin(sc.safe || { w: 1600, h: 1000 });
        sc.draw(layers);
        if (game.overlay) game.overlay.draw(layers, dt);
        wc.u.margin = layers.marginUv(sc.paintRect ? sc.paintRect(layers) : defaultPaintRect(layers));
      }
    }
    applyLook(dt);
    if (game.transition) {
      game.transition.t += dt / Math.max(1, game.timeScale > 1 ? game.timeScale * 0.5 : 1);
      wc.u.trans = Math.min(1, game.transition.t / game.transition.dur);
      if (wc.u.trans >= 1) game.transition = null;
    }
    if (three) {
      wc.u.surface = 1; wc.u.depthFog = 1;
      wc.u.fogOffset = game.world.fogOffset();
      const src = game.world.render(hud, game.time);
      wc.render(layers.cssW, layers.cssH, game.time, src);
    } else {
      wc.upload(layers);
      wc.render(layers.cssW, layers.cssH, game.time);
    }
    canvas.style.cursor = input.cursor() || (game.scene && game.scene.cursor ? game.scene.cursor() : 'default') || 'default';
    if (game.audio) game.audio.tick(dt);
    if (DEBUG && game.debugPanel) game.debugPanel.tick();
  } catch (err) {
    console.error(err);
    running = false;
    showCrash(err);
    return false;
  }
  return true;
}
if (DEBUG) game.step = (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) if (!step(dt)) return false; return game.sceneName + ' ' + game.phase; };

function defaultPaintRect(L) {
  const s = L.safe;
  return { x0: -s.w * 0.16, y0: -s.h * 0.12, x1: s.w * 1.16, y1: s.h * 1.12 };
}

function showCrash(err) {
  const fb = document.getElementById('fallback');
  fb.style.display = 'flex';
  fb.innerHTML = `<p>Something went wrong with the painting.<br><em>Reloading the page should pick up from the last dawn.</em><br><small style="font-size:13px;color:#7a6e60">${String(err && err.message || err).replace(/</g, '&lt;')}</small></p>`;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { game.audio?.suspend(); }
  else { last = performance.now(); game.audio?.resume(); }
});

// ---------------- boot ----------------
async function boot() {
  const fonts = ['500 30px Caveat', '20px "Homemade Apple"', '24px "La Belle Aurore"', '24px "Cedarville Cursive"', '30px "Mrs Saint Delafield"', '30px "Cormorant Garamond"', 'italic 30px "Cormorant Garamond"'];
  try {
    await Promise.race([
      Promise.all(fonts.map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch { /* fonts are optional */ }
  clearMeasureCache();
  if (FP) {
    const { World } = await import('./world/world.js');
    game.world = new World(game);
    game.world.resize(layers);
    const { TestRoomScene } = await import('./world/scenes/test-room.js');
    game.scenes.testroom = new TestRoomScene(game);
    // the phases built in first person so far take over their scene names
    const { Keeper } = await import('./world/keeper.js');
    game.keeper = new Keeper(game);
    Object.assign(game.scenes, game.keeper.wrappers);
    if (DEBUG) (await import('./world/review.js')).installReview(game);
  }
  const loading = document.getElementById('loading');
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 1400);

  const id = parseInt(params.get('night') || '0', 10);
  const phase = params.get('phase');
  if (FP && DEBUG && params.get('test') === 'room') {
    game.go('testroom', {}, { transition: 'none' });
  } else if (DEBUG && params.get('finale')) {
    game.night = nightById(LAST_NIGHT);
    game.go('finale', { part: params.get('finale') }, { transition: 'none' });
  } else if (DEBUG && id) {
    game.state = Store.freshProgress();
    game.startNight(id, phase || 'day');
  } else if (game.scenes.title) {
    game.go('title', {}, { transition: 'none' });
  } else {
    game.startNight(1, 'night');
  }
  requestAnimationFrame(frame);
}
boot();
