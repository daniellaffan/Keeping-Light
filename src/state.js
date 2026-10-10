// Save/load and settings. Every storage access is wrapped: the game works with storage blocked.

const SAVE_KEY = 'keeping-light.save.v1';
const SETTINGS_KEY = 'keeping-light.settings.v1';

function read(key) {
  try { const s = window.localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function write(key, v) {
  try { window.localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}
function remove(key) { try { window.localStorage.removeItem(key); } catch { /* ignore */ } }

export function freshProgress() {
  return { v: 1, night: 1, phase: 'day', history: {}, visits: {}, nightsPlayed: 0, finished: false, started: Date.now() };
}

export function loadProgress() {
  const p = read(SAVE_KEY);
  if (!p || p.v !== 1 || typeof p.night !== 'number') return null;
  return { ...freshProgress(), ...p };
}
export function saveProgress(p) { return write(SAVE_KEY, p); }
export function clearProgress() { remove(SAVE_KEY); }

export function loadSettings() {
  return { volume: 0.7, muted: false, ...(read(SETTINGS_KEY) || {}) };
}
export function saveSettings(s) { write(SETTINGS_KEY, s); }
