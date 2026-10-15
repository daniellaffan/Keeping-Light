// The audio engine: one AudioContext, created on the first user gesture. Routes music, ambience and
// sound effects through a shared room and a master volume that the settings control.
import { Music } from './music.js';
import { Ambience } from './ambience.js';
import { Sfx } from './sfx.js';
import { impulse, openAirImpulse } from './voices.js';

const INDOOR = new Set(['shop', 'pub', 'school', 'cottages', 'shed', 'lamp']);

export function createAudio(game) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx;
  try { ctx = new AC(); } catch { return null; }
  return new AudioEngine(game, ctx);
}

class AudioEngine {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx);
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    this.reverb.connect(wet); wet.connect(this.master);

    // the space you're standing in, for footsteps and the door: a stone room, or the open air,
    // crossfaded as you go through the door (first person only; the 2D game never moves)
    this.spaceSend = ctx.createGain();
    this.spaceIn = ctx.createGain(); this.spaceIn.gain.value = 0;
    this.spaceOut = ctx.createGain(); this.spaceOut.gain.value = 0.5;
    const roomIr = ctx.createConvolver(); roomIr.buffer = impulse(ctx, 1.3, 3.4);
    const openIr = ctx.createConvolver(); openIr.buffer = openAirImpulse(ctx);
    this.spaceSend.connect(roomIr); roomIr.connect(this.spaceIn); this.spaceIn.connect(this.master);
    this.spaceSend.connect(openIr); openIr.connect(this.spaceOut); this.spaceOut.connect(this.master);
    this.space = null;

    this.music = new Music(ctx, this.master, this.reverb);
    this.amb = new Ambience(ctx, this.master);
    this.sfx = new Sfx(ctx, this.master, this.reverb, this.spaceSend);
    this.started = false;
    this.hidden = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.ctx.resume?.();
    this.applyVolume(true);
    this.amb.start();
    const g = this.game;
    this.setScene(g.sceneName, g.night, g.scene ? { mode: g.scene.mode, part: g.scene.part } : {});
    // first person may have moved indoors before the first gesture woke the sound
    const k = g.keeper;
    if (k && g.scene?.keeper === k) this.setSpace(k.inside === false ? 'out' : 'in', k.mode === 'day');
  }

  applyVolume(slow = false) {
    const s = this.game.settings;
    const v = s.muted ? 0 : Math.pow(Math.max(0, Math.min(1, s.volume)), 1.6) * 0.9;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, slow ? 0.8 : 0.08);
  }

  // Pick the music and ambience for where we are.
  setScene(name, night, args = {}) {
    if (!this.started) return;
    const n = night || {};
    const haar = n.weather === 'haar' || (n.haar || 0) > 0.5;
    const sc = this.game.scene || {};
    let mode;
    if (name === 'title') mode = 'title';
    else if (name === 'finale') mode = args.part === 'stairs' ? 'stairs' : 'sea';
    else if (n.act === 5) mode = 'epilogue';
    else if (n.act === 4) mode = 'final';
    else mode = 'act' + Math.max(1, Math.min(3, n.act || 1));
    const nightBay = name === 'bay' && args.mode === 'night';
    this.music.setMode(mode, { muffle: haar && (nightBay || name === 'bay') });

    const kind = name === 'vignette' ? sc.kind : null;
    const indoor = INDOOR.has(kind) || name === 'logbook' || (name === 'finale' && args.part === 'stairs');
    const day = name === 'daymap' || (name === 'vignette' && !indoor) || (name === 'bay' && args.mode === 'dawn');
    this.amb.set({
      surf: name === 'finale' && args.part === 'end' ? 0.15 : indoor ? 0.32 : nightBay ? 0.95 : 0.8,
      wind: indoor ? 0.15 : n.weather === 'grey' || n.weather === 'rain' ? 0.9 : n.weather === 'still' ? 0.12 : 0.45,
      rain: n.weather === 'rain' ? (indoor ? 0.5 : 1) : 0,
      gulls: day && (n.act || 1) < 4 ? 1 : 0,
      hum: kind === 'lamp' || (name === 'finale' && args.part === 'stairs') ? 1 : name === 'logbook' ? 0.35 : 0,
      muffle: haar && !indoor && name !== 'logbook',
    });
  }

  // first person: 'in' (the watch room: its tone and reverb; walls muffle the sea if you came in from
  // the headland) or 'out' (the open air)
  setSpace(space, walls = false) {
    this.space = space;
    this.walls = walls;
    if (!this.started) return;
    const t = this.ctx.currentTime, inside = space === 'in';
    this.spaceIn.gain.setTargetAtTime(inside ? 0.55 : 0, t, 0.25);
    this.spaceOut.gain.setTargetAtTime(inside ? 0 : 0.5, t, 0.25);
    this.amb.setRoom(inside ? 0.05 : 0, inside && walls);
  }

  tick() {
    if (!this.started || this.hidden) return;
    this.music.tick();
    this.amb.tick();
  }

  suspend() { this.hidden = true; if (this.started) this.ctx.suspend?.(); }
  resume() { this.hidden = false; if (this.started) this.ctx.resume?.(); }

  hush(on) { this.music.hush(on); this.amb.hush(on); }

  // sound effects
  pencil(v) { if (this.started) this.sfx.pencil(v); }
  rubOut() { if (this.started) this.sfx.rubOut(); }
  page() { if (this.started) this.sfx.page(); }
  soft() { if (this.started) this.sfx.soft(); }
  inkPhrase() { if (this.started) this.sfx.inkPhrase(); }
  lampSwell() { if (this.started) this.sfx.lampSwell(); }
  chime(i, gone) { if (this.started) this.sfx.chime(i, gone); }
  thud() { if (this.started) this.sfx.thud(); }
  shimmer() { if (this.started) this.sfx.shimmer(); }
  stairStep(i) { if (this.started) this.sfx.stairStep(i); }
  heldNote() { if (this.started) this.sfx.heldNote(); }
  footstep(surface, v) { if (this.started) this.sfx.footstep(surface, v); }
  door() { if (this.started) this.sfx.door(); }
  ratchet() { if (this.started) this.sfx.ratchet(); }
  // up the tower: 0 on the ground, more wind the higher and the more open (1 out on the gallery)
  aloft(k) { if (this.started) this.amb.aloft(k); }
}
