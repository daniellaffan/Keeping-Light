// Night definitions — the brief's table as data. Story text lives in src/data/; this file is mechanics,
// atmosphere and which story beats fire when.
import { ship } from '../data/ships.js';
import { HARBOUR, MAGMELL } from './chart.js';

const base = ['sisterA', 'sisterB', 'black', 'gull', 'lip'];

// look: shader grading + scene palette. cool: 0 warm → 1 cold.
function look(o) {
  return { warmth: 0.5, sat: 1.06, paperShow: 0.08, bleed: 0, inkSpread: 0, cool: 0, gran: 0.75, ...o };
}

const RAW = [
  {
    id: 1, act: 1, date: '2 September', tide: 'mid', weather: 'clear', haar: 0,
    ships: ['Patience'], entries: [[0, 40]], reefs: base,
    maxPoints: 4, inkBudget: 150, offerOldPlan: true, tutorial: true,
    day: { arrival: true }, lights: 1, drift: 0.0,
    look: look({ warmth: 0.55 }), music: 1,
  },
  {
    id: 2, act: 1, date: '3 September', tide: 'mid', weather: 'clear', haar: 0,
    ships: ['An Faoileán', 'Kittiwake'], entries: [[0, 36]], reefs: [...base, 'tooth'],
    maxPoints: 4, inkBudget: 135, offerOldPlan: true, teachUndo: true,
    day: { places: ['village', 'lighthouse'], focus: 'village' }, lights: 1, drift: 0.02,
    look: look({ warmth: 0.55 }), music: 1,
  },
  {
    id: 3, act: 1, date: '4 September', tide: 'high', weather: 'clear', haar: 0,
    ships: ['Grá Mo Chroí', 'Mary Ellen'], entries: [[0, 31]], reefs: [...base, 'tooth', 'comb', 'narrows'],
    maxPoints: 4, inkBudget: 130, offerOldPlan: true, teachTide: true,
    day: { places: ['cliff', 'village', 'lighthouse'], focus: 'cliff' }, lights: 1, drift: 0.03,
    anomalies: [{ type: 'lagReflection', ship: 1, lag: 0.55 }],
    look: look({ warmth: 0.6 }), music: 1,
  },
  {
    id: 4, act: 1, date: '5 September', tide: 'low', weather: 'rain', haar: 0,
    ships: ['Nóinín', 'Honest Annie', 'An Rón Beag'], entries: [[0, 42]], reefs: [...base, 'tooth', 'pan', 'bar', 'flats'],
    maxPoints: 5, inkBudget: 140, offerOldPlan: true, teachLow: true,
    day: { places: ['harbour', 'village', 'lighthouse'], focus: 'harbour' }, lights: 1, drift: 0.04,
    look: look({ warmth: 0.45, sat: 1.0 }), music: 1,
  },
  {
    id: 5, act: 1, date: '6 September', tide: 'mid', weather: 'clear', haar: 0,
    ships: ['Réalt na Mara', 'Heather Bell', 'Two Sisters'], entries: [[0, 28], [0, 34]], reefs: [...base, 'tooth', 'comb'],
    maxPoints: 5, inkBudget: 140, offerOldPlan: false,
    day: { places: ['village', 'cliff', 'lighthouse'], focus: 'village' }, lights: 1, drift: 0.05,
    goldenSunset: true,
    look: look({ warmth: 0.8, sat: 1.12 }), music: 1,
  },
  // ---------------- Act Two ----------------
  {
    id: 6, act: 2, date: '7 September', tide: 'mid', weather: 'haar', haar: 0.45,
    ships: ['The Curlew', 'Fáinne Óir', 'Morning Lark'], entries: [[0, 38]], reefs: [...base, 'tooth', 'comb', 'rakes'],
    maxPoints: 5, inkBudget: 140,
    day: { places: ['harbour', 'cliff', 'lighthouse'], focus: 'harbour' }, lights: 1, drift: 0.1,
    look: look({ warmth: 0.32, sat: 0.97, paperShow: 0.11, bleed: 0.08, inkSpread: 0.12, cool: 0.18 }), music: 2,
  },
  {
    id: 7, act: 2, date: '8 September', tide: 'low', weather: 'clear', haar: 0,
    ships: ['Sea Swallow', 'Constant Star', 'Brídín'], entries: [[0, 33]], reefs: [...base, 'tooth', 'pan', 'bar', 'flats'],
    maxPoints: 5, inkBudget: 140, teachSize: true,
    day: { places: ['village', 'cliff', 'lighthouse'], focus: 'village' }, lights: 1, drift: 0.12,
    look: look({ warmth: 0.25, sat: 0.94, paperShow: 0.12, bleed: 0.12, inkSpread: 0.18, cool: 0.24 }), music: 2,
  },
  {
    id: 8, act: 2, date: '9 September', tide: 'high', weather: 'rain', haar: 0,
    ships: ['Faithful', 'Caoimhe', 'Shearwater'], entries: [[0, 44]], reefs: [...base, 'tooth', 'comb', 'narrows', 'spit', 'rakes'],
    maxPoints: 5, inkBudget: 140,
    day: { places: ['lighthouse', 'village'], focus: 'lighthouse' }, lights: 1, drift: 0.15,
    look: look({ warmth: 0.15, sat: 0.9, paperShow: 0.14, bleed: 0.16, inkSpread: 0.25, cool: 0.32 }), music: 2,
  },
  {
    id: 9, act: 2, date: '10 September', tide: 'mid', weather: 'haar', haar: 0.6,
    ships: ['Áine', 'Little Grace', 'Willing Hand', 'Éan Mara'], entries: [[0, 30]], reefs: [...base, 'tooth', 'comb', 'narrows', 'spit'],
    maxPoints: 5, inkBudget: 140, ghostPlan: true,
    day: { places: ['village', 'harbour', 'lighthouse'], focus: 'village' }, lights: 0.9, drift: 0.17,
    look: look({ warmth: 0.08, sat: 0.86, paperShow: 0.16, bleed: 0.2, inkSpread: 0.3, cool: 0.4 }), music: 2,
  },
  {
    id: 10, act: 2, date: '11 September', tide: 'low', weather: 'clear', haar: 0,
    ships: ['Fair Weather', 'Tonn Ghorm', 'Muirín', 'Second Wind'], entries: [[0, 36], [0, 42]],
    reefs: [...base, 'tooth', 'pan', 'bar', 'comb'],
    current: { x: 57, y: 27, r: 9, dx: 0, dy: 1, strength: 1 },
    maxPoints: 6, inkBudget: 145, teachCurrent: true,
    day: { places: ['cliff', 'village', 'lighthouse'], focus: 'cliff' }, lights: 0.85, drift: 0.2,
    anomalies: [{ type: 'newReef', reef: 'newrock' }, { type: 'phantomReflection' }, { type: 'movedWaypoint', night: 9 }],
    look: look({ warmth: 0.0, sat: 0.84, paperShow: 0.18, bleed: 0.24, inkSpread: 0.35, cool: 0.46 }), music: 2,
  },
  {
    id: 11, act: 2, date: '12 September', tide: 'mid', weather: 'haar', haar: 0.65,
    ships: ['The Gannet', 'Homeward', 'Neasa', 'Mo Stór'], entries: [[0, 38]],
    reefs: [...base, 'tooth', 'comb', 'newrock', 'rakes'],
    maxPoints: 7, inkBudget: 145,
    day: { places: ['village', 'harbour', 'lighthouse'], focus: 'village' }, lights: 0.55, drift: 0.24,
    look: look({ warmth: -0.08, sat: 0.8, paperShow: 0.2, bleed: 0.3, inkSpread: 0.42, cool: 0.55 }), music: 2,
  },
  // ---------------- Act Three ----------------
  {
    id: 12, act: 3, date: '13 September', tide: 'low', weather: 'grey', haar: 0.15,
    ships: ['Bláth Bán', 'An Bradán', 'Margaret Anne'], entries: [[0, 32]],
    reefs: [...base, 'tooth', 'pan', 'bar', 'flats', 'newrock'],
    maxPoints: 6, inkBudget: 145,
    day: { places: ['cottages', 'village', 'lighthouse'], focus: 'cottages' }, lights: 0.4, drift: 0.3,
    look: look({ warmth: -0.15, sat: 0.72, paperShow: 0.28, bleed: 0.36, inkSpread: 0.5, cool: 0.68, gran: 0.9 }), music: 3,
  },
  {
    id: 13, act: 3, date: '14 September', tide: 'mid', weather: 'haar', haar: 0.7,
    ships: ['Glór na Farraige', 'Lantern', 'Whin Blossom'], entries: [[0, 38]],
    reefs: [...base, 'tooth', 'comb', 'newrock', 'narrows'],
    maxPoints: 6, inkBudget: 145,
    day: { places: ['cottages', 'harbour', 'lighthouse'], focus: 'cottages' }, lights: 0.3, drift: 0.34,
    anomalies: [{ type: 'magMell' }],
    look: look({ warmth: -0.2, sat: 0.68, paperShow: 0.32, bleed: 0.4, inkSpread: 0.55, cool: 0.75, gran: 0.95 }), music: 3,
  },
  {
    id: 14, act: 3, date: '15 September', tide: 'high', weather: 'grey', haar: 0.2,
    ships: ['Brightwater', 'Bríd Óg', 'Patience'], entries: [[0, 42]],
    reefs: [...base, 'tooth', 'spit', 'newrock', 'comb', 'rakes'],
    maxPoints: 7, inkBudget: 145,
    day: { places: ['school', 'cottages', 'lighthouse'], focus: 'school' }, lights: 0.2, drift: 0.38,
    revealPages: 'others',
    anomalies: [{ type: 'allLag', lag: 0.35 }],
    look: look({ warmth: -0.26, sat: 0.62, paperShow: 0.36, bleed: 0.44, inkSpread: 0.6, cool: 0.82, gran: 1.0 }), music: 3,
  },
  {
    id: 15, act: 3, date: '16 September', tide: 'low', tideShown: 'high', weather: 'grey', haar: 0.25,
    ships: ['Sea Swallow', 'An Faoileán'], entries: [[0, 34]],
    reefs: [...base, 'tooth', 'pan', 'bar', 'comb', 'newrock'],
    maxPoints: 6, inkBudget: 145,
    day: { places: ['village', 'school', 'lighthouse'], focus: 'village' }, lights: 0.12, drift: 0.43,
    revealPages: 'bargain',
    anomalies: [{ type: 'allLag', lag: 0.5 }, { type: 'stillTide' }],
    look: look({ warmth: -0.3, sat: 0.56, paperShow: 0.4, bleed: 0.48, inkSpread: 0.65, cool: 0.9, gran: 1.05 }), music: 3,
  },
  // ---------------- The final night ----------------
  {
    id: 16, act: 4, date: '17 September', tide: 'mid', weather: 'haar', haar: 0.92, final: true,
    ships: ['Patience', 'Réalt na Mara', 'Sea Swallow'], entries: [HARBOUR], target: MAGMELL,
    reefs: ['black', 'sisterA', 'sisterB', 'gull', 'lip'],
    maxPoints: 6, inkBudget: 170,
    day: { places: ['harbour', 'lighthouse'], focus: 'harbour' }, lights: 0.06, drift: 0.5,
    anomalies: [{ type: 'manannan' }, { type: 'allLag', lag: 0.6 }],
    look: look({ warmth: -0.28, sat: 0.5, paperShow: 0.38, bleed: 0.5, inkSpread: 0.66, cool: 0.95, gran: 1.05 }), music: 4,
  },
  // ---------------- Epilogue ----------------
  {
    id: 17, act: 5, epilogue: 1, date: '', tide: 'mid', weather: 'still', haar: 0.35,
    ships: ['Kittiwake'], entries: [HARBOUR], target: MAGMELL, reefs: ['black', 'gull'],
    maxPoints: 5, inkBudget: 170,
    day: { places: ['lighthouse'], focus: 'lighthouse' }, lights: 2, lightsCount: true, drift: 0.66,
    anomalies: [{ type: 'allLag', lag: 0.7 }],
    look: look({ warmth: -0.32, sat: 0.4, paperShow: 0.46, bleed: 0.55, inkSpread: 0.7, cool: 1.0, gran: 1.1 }), music: 5,
  },
  {
    id: 18, act: 5, epilogue: 2, date: '', tide: 'mid', weather: 'still', haar: 0.3,
    ships: ['Nóinín'], entries: [HARBOUR], target: MAGMELL, reefs: ['black'],
    maxPoints: 5, inkBudget: 170,
    day: { places: ['lighthouse'], focus: 'lighthouse' }, lights: 1, lightsCount: true, drift: 0.8,
    anomalies: [{ type: 'allLag', lag: 0.8 }],
    look: look({ warmth: -0.35, sat: 0.34, paperShow: 0.52, bleed: 0.6, inkSpread: 0.75, cool: 1.0, gran: 1.1 }), music: 5,
  },
  {
    id: 19, act: 5, epilogue: 3, date: '', tide: 'mid', weather: 'still', haar: 0.25,
    ships: ['Grá Mo Chroí'], entries: [HARBOUR], target: MAGMELL, reefs: [],
    maxPoints: 5, inkBudget: 170,
    day: { places: ['lighthouse'], focus: 'lighthouse' }, lights: 0, lightsCount: true, drift: 0.95,
    anomalies: [{ type: 'allLag', lag: 0.9 }],
    look: look({ warmth: -0.38, sat: 0.28, paperShow: 0.58, bleed: 0.66, inkSpread: 0.8, cool: 1.0, gran: 1.15 }), music: 5,
  },
];

export const NIGHTS = RAW.map((n) => ({
  target: HARBOUR,
  anomalies: [],
  current: null,
  tideShown: n.tide,
  ...n,
  ships: n.ships.map(ship),
}));

export const LAST_NIGHT = NIGHTS.length; // 19
export const FINAL_NIGHT = 16;

export function nightById(id) { return NIGHTS[Math.max(1, Math.min(NIGHTS.length, id)) - 1]; }
export function hasAnomaly(n, type) { return (n.anomalies || []).find((a) => a.type === type); }
