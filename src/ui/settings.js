// Sound control: a small inked speaker in the corner; tap to open a volume slider and mute.
// Settings are remembered (localStorage, wrapped). M toggles mute.

const ICON_ON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M15.2 9.2c1 .8 1.5 1.8 1.5 2.9s-.5 2.1-1.5 2.9M17.6 6.9c1.6 1.4 2.5 3.2 2.5 5.2s-.9 3.8-2.5 5.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

export class SoundControl {
  constructor(game) {
    this.game = game;
    const el = document.createElement('div');
    el.id = 'sound';
    el.innerHTML = `
      <button class="toggle" aria-label="Sound settings" title="Sound (M to mute)"></button>
      <div class="panel" role="group" aria-label="Sound">
        <label class="row"><span>volume</span><input type="range" min="0" max="1" step="0.01" class="vol" aria-label="Volume"></label>
        <label class="row"><input type="checkbox" class="mute"> <span>mute</span></label>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.btn = el.querySelector('.toggle');
    this.vol = el.querySelector('.vol');
    this.mute = el.querySelector('.mute');
    this.sync();
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); game.startAudio?.(); });
    this.btn.addEventListener('click', () => el.classList.toggle('open'));
    this.vol.addEventListener('input', () => {
      game.settings.volume = parseFloat(this.vol.value);
      if (game.settings.volume > 0 && game.settings.muted) game.settings.muted = false;
      this.changed();
    });
    this.mute.addEventListener('change', () => { game.settings.muted = this.mute.checked; this.changed(); });
    document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target)) el.classList.remove('open'); });
    game.input.on('key', (e) => {
      if (e.key === 'm' || e.key === 'M') { game.settings.muted = !game.settings.muted; this.changed(); return true; }
      return false;
    });
  }

  changed() {
    this.game.saveSettings();
    this.game.audio?.applyVolume();
    this.sync();
  }

  sync() {
    const s = this.game.settings;
    this.vol.value = String(s.volume);
    this.mute.checked = !!s.muted;
    this.btn.innerHTML = s.muted || s.volume <= 0 ? ICON_OFF : ICON_ON;
    this.el.classList.toggle('muted', !!s.muted);
  }
}
