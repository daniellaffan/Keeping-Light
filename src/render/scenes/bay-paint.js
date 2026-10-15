// Painting the bay: sky, sea, the far shore and village, sea stacks, reefs, the near headland and the
// lighthouse. Static parts are painted once into a cache; ships, the beam and lights are drawn live.
import {
  PAL, rng, noise1, fbm1, mixHex, shade, rgba, lerp, clamp, wobble, trace, wash, gradWash, blob, streaks,
  inkLine, inkOutline, hatch, glow, radial, vgrad, ellipsePts, withBlur, glazes, waveMarks,
} from '../paint.js';
import { project, LAND, STACKS, REEFS, PIERS, LIGHTHOUSE, reefActive, VIEW } from '../../game/chart.js';

export const HORIZON = 296;

// ---------------- palette by time of day + act ----------------
export function palette(tod, cool = 0, golden = false) {
  const P = {};
  if (tod === 'dusk' || tod === 'title') {
    Object.assign(P, {
      skyTop: '#55618F', skyMid: '#A98197', skyLow: '#E3A58E', skyHor: '#F4CF8C',
      cloud: '#8E6F8E', cloudLit: '#F0B486', seaFar: '#C99A98', seaMid: '#6C7AA6', seaNear: '#3B5B8C', seaShallow: '#5E7E9A',
      grassFar: '#8C8D6C', grassNear: '#617E46', rock: '#9A5E43', rockSh: '#5E4A55', ridge1: '#A790A6', ridge2: '#8C7D92',
      ww: '#F3E2CC', wwSh: '#A89AB4', roof: '#4A4458', dark: 0.22, sun: { x: 196, y: HORIZON - 34, r: 24, c: '#FCE6AE' },
      glitter: '#F7D49A', wave: '#2F4878',
    });
    if (golden) Object.assign(P, { skyMid: '#C9839A', skyLow: '#EFA58A', skyHor: '#F8D488', cloudLit: '#F6BE80', seaFar: '#DDA593', glitter: '#FADA9C', sun: { x: 196, y: HORIZON - 22, r: 27, c: '#FDE8A8' } });
  } else if (tod === 'night') {
    Object.assign(P, {
      skyTop: '#222A4C', skyMid: '#303A64', skyLow: '#4A5480', skyHor: '#6E7294',
      cloud: '#3A4268', cloudLit: '#6A7096', seaFar: '#56608A', seaMid: '#334070', seaNear: '#232E52', seaShallow: '#2E4466',
      grassFar: '#2F3A3C', grassNear: '#25322B', rock: '#453A40', rockSh: '#232230', ridge1: '#454B70', ridge2: '#363C5E',
      ww: '#A3A6B8', wwSh: '#5C607A', roof: '#1E1F2C', dark: 0.7, sun: null, glitter: '#7C83A8', wave: '#161D33',
    });
  } else if (tod === 'dawn') {
    Object.assign(P, {
      skyTop: '#7E95B8', skyMid: '#C5B9C2', skyLow: '#EED3B6', skyHor: '#F6E3B8',
      cloud: '#B69CA8', cloudLit: '#F5D3A6', seaFar: '#D3C3BC', seaMid: '#8D9DB8', seaNear: '#4F6A96', seaShallow: '#6E98A6',
      grassFar: '#97A08A', grassNear: '#6E8A55', rock: '#A0745C', rockSh: '#6E6070', ridge1: '#B4AFC0', ridge2: '#9F9BAE',
      ww: '#F4ECDD', wwSh: '#B0AEC0', roof: '#5A5866', dark: 0.12, sun: { x: 1480, y: HORIZON - 40, r: 20, c: '#FBEBC0' },
      glitter: '#F6E2B4', wave: '#3D5482',
    });
  } else if (tod === 'lastsunset') {
    Object.assign(P, {
      skyTop: '#6E7896', skyMid: '#9C93A3', skyLow: '#F0B356', skyHor: '#F7CB6A',
      cloud: '#5D5F78', cloudLit: '#E7A24E', seaFar: '#C9A06A', seaMid: '#6E7590', seaNear: '#3E4A6C', seaShallow: '#56707E',
      grassFar: '#7D7C68', grassNear: '#5A6A48', rock: '#8E6248', rockSh: '#4D4552', ridge1: '#8C8496', ridge2: '#787287',
      ww: '#F2E0C4', wwSh: '#9890A8', roof: '#3F3C4E', dark: 0.25, sun: { x: 230, y: HORIZON - 14, r: 26, c: '#FFE6A0' },
      glitter: '#FBD47E', wave: '#2E3A5E',
    });
  } else { // afternoon
    Object.assign(P, {
      skyTop: '#7598C2', skyMid: '#A9C2D6', skyLow: '#DCE3DE', skyHor: '#EFEADA',
      cloud: '#C8CDD6', cloudLit: '#F8F4EA', seaFar: '#AFC3CF', seaMid: '#6F8FB3', seaNear: '#3B5B8C', seaShallow: '#4E95A0',
      grassFar: '#97A47A', grassNear: '#6B8E4E', rock: '#A8714E', rockSh: '#7A6870', ridge1: '#AEB8C8', ridge2: '#97A3B2',
      ww: '#F6F0E4', wwSh: '#B9B6C4', roof: '#56596A', dark: 0.0, sun: null, glitter: '#F4F0E2', wave: '#36558A',
    });
  }
  if (cool > 0) {
    const g = '#8C9098';
    for (const k of Object.keys(P)) {
      if (typeof P[k] === 'string') P[k] = mixHex(P[k], g, cool * (k.startsWith('sky') || k.startsWith('sea') ? 0.42 : 0.32));
    }
    if (P.sun) P.sun = { ...P.sun, c: mixHex(P.sun.c, '#E8E4DA', cool * 0.6) };
  }
  P.tod = tod; P.cool = cool;
  return P;
}

// project with height above the sea (world units)
export function pz(x, y, h = 0) {
  const [sx, sy, s] = project(x, y);
  return [sx, sy - h * s * VIEW.nearS, s];
}

// height of the land's top above the sea along a shore (world units)
function northCliff(x) { return 1.6 + 1.4 * fbm1(x * 0.08, 4) + (x < 16 ? (16 - x) * 0.18 : 0) - (x > 78 && x < 97 ? 1.2 : 0); }
function southCliff(x) { return 1.2 + 0.9 * fbm1(x * 0.1, 9) + (x < 24 ? 1.6 : 0); }

function ridgeY(sx, seed, base, amp) {
  return base - amp * fbm1(sx * 0.0032, seed, 4) - amp * 0.35 * fbm1(sx * 0.012, seed + 5, 3);
}

// ---------------- the static painting ----------------
export function paintBayStatic(P, opts) {
  const { pal, night = null, lights = 1, lightsCount = null, rain = false, haar = 0, view, village = true, seed = 7 } = opts;
  const { paint: c, ink, light, mask } = P;
  const X0 = view.x0 - 40, X1 = view.x1 + 40, Y0 = view.y0 - 40, Y1 = view.y1 + 40;
  const r = rng(seed);

  // ---- sky ----
  vgrad(c, X0, Y0, X1, HORIZON + 6, [[0, pal.skyTop], [0.45, pal.skyMid], [0.82, pal.skyLow], [1, pal.skyHor]]);
  if (pal.tod === 'night') {
    // salt-speck stars: lifted pigment
    const sr = rng(41);
    for (let i = 0; i < 160; i++) {
      const x = lerp(X0, X1, sr()), y = lerp(Y0, HORIZON - 30, Math.pow(sr(), 1.4));
      blob(c, x, y, 0.8 + sr() * 1.6, 0.8 + sr() * 1.4, '#C9CCE0', 0.25 + sr() * 0.35, i);
    }
    // a thin moon, high and to the right
    blob(c, 1240, 120, 15, 15, '#E9E3CF', 0.8, 3, 0.05);
    blob(c, 1247, 116, 14, 14, pal.skyTop, 0.92, 4, 0.05);
    glow(light, 1238, 122, 70, '#9FA8C8', 0.35);
  }
  // clouds: long wet-in-wet streaks
  const cloudBand = (y0, y1, col, n, a, s) => streaks(c, X0, X1, y0, y1, col, { count: n, alpha: a, thick: [5, 16], seed: s, blur: 3, len: [0.18, 0.5] });
  if (pal.tod === 'lastsunset') {
    // two bands of cloud with a gold gap between
    cloudBand(40, 150, pal.cloud, 22, 0.45, 11);
    cloudBand(150, 215, mixHex(pal.cloud, pal.cloudLit, 0.4), 12, 0.25, 12);
    cloudBand(HORIZON - 30, HORIZON - 4, pal.cloud, 10, 0.5, 13);
  } else {
    cloudBand(Y0 + 40, 140, pal.cloud, 14, 0.22, seed + 1);
    cloudBand(150, 250, pal.cloud, 12, 0.24, seed + 2);
    cloudBand(170, HORIZON - 18, pal.cloudLit, 10, 0.3, seed + 3);
  }
  glazes(c, X0, X1, Y0 + 20, HORIZON - 20, [pal.cloud, mixHex(pal.cloud, pal.skyTop, 0.5), pal.cloudLit], { count: 22, alpha: [0.05, 0.14], w: [120, 420], h: [6, 18], seed: seed + 9, tilt: 0.01, yBias: 0.8 });
  if (pal.tod === 'night') radial(c, 1240, 140, 420, [[0, rgba('#8C93B8', 0.35)], [1, rgba('#8C93B8', 0)]], 'source-over', 0.55);
  // sun
  if (pal.sun) {
    const s = pal.sun;
    radial(c, s.x, s.y, s.r * 6, [[0, rgba(pal.skyHor, 0.9)], [0.5, rgba(pal.skyHor, 0.35)], [1, rgba(pal.skyHor, 0)]], 'source-over', 0.6);
    blob(c, s.x, s.y, s.r, s.r, s.c, 0.95, 5, 0.04);
    glow(light, s.x, s.y, s.r * 7, pal.tod === 'dawn' ? '#F6D9A0' : '#F3B866', 0.55);
    glow(light, s.x, s.y, s.r * 2.2, '#FFE9B8', 0.5);
  }
  // distant island on the western horizon
  {
    const pts = [[-140, HORIZON + 2], [-100, HORIZON - 12], [-40, HORIZON - 19], [30, HORIZON - 9], [70, HORIZON + 2]];
    wash(c, pts, mixHex(pal.ridge1, pal.skyHor, 0.45), { alpha: 0.75, amp: 2, seed: 33 });
  }
  // far ridges behind the north shore
  const ridge = (base, amp, col, s, a = 0.95) => {
    const pts = [];
    for (let x = 300; x <= X1 + 20; x += 14) pts.push([x, ridgeY(x, s, base, amp)]);
    pts.push([X1 + 20, 420], [300, 420]);
    wash(c, pts, col, { alpha: a, amp: 2, seed: s, passes: 2 });
  };
  ridge(262, 60, mixHex(pal.ridge1, pal.skyLow, 0.25), 3, 0.8);
  ridge(282, 44, pal.ridge2, 8);

  // ---- sea ----
  vgrad(c, X0, HORIZON - 2, X1, Y1, [[0, pal.seaFar], [0.18, mixHex(pal.seaFar, pal.seaMid, 0.6)], [0.42, pal.seaMid], [1, pal.seaNear]]);
  // horizon glint line
  streaks(c, X0, 420, HORIZON - 2, HORIZON + 6, pal.skyHor, { count: 6, alpha: 0.5, thick: [1, 3], seed: 21, blur: 1, len: [0.3, 0.9] });
  // reflected sky streaks near, wave strokes further in
  streaks(c, X0, X1, HORIZON + 4, 420, pal.skyLow, { count: 16, alpha: 0.28, thick: [2, 6], seed: 22, blur: 2, len: [0.1, 0.35] });
  glazes(c, X0, X1, HORIZON + 8, 470, [pal.skyLow, pal.seaFar, pal.seaMid, pal.skyMid], { count: 46, alpha: [0.08, 0.22], w: [60, 300], h: [1.5, 5], seed: 22, tilt: 0 });
  glazes(c, X0, X1, 440, Y1, [pal.seaMid, pal.wave, pal.seaNear, mixHex(pal.seaMid, pal.skyLow, 0.5)], { count: 80, alpha: [0.08, 0.24], w: [80, 420], h: [4, 13], seed: 23, tilt: 0.01 });
  glazes(c, X0, X1, 480, Y1, [mixHex(pal.skyLow, '#ffffff', 0.2)], { count: 18, alpha: [0.08, 0.16], w: [40, 160], h: [1.5, 4], seed: 25, tilt: 0 });
  waveMarks(ink, X0, X1, 470, 860, { count: 70, color: mixHex(pal.wave, '#000000', 0.2), alpha: 0.34, seed: 26, size: [5, 12], perspective: (y) => 0.5 + (y - 400) / 700 });
  waveMarks(ink, X0, X1, 470, 860, { count: 30, color: mixHex(pal.skyLow, '#ffffff', 0.4), alpha: 0.35, seed: 27, size: [4, 10], perspective: (y) => 0.5 + (y - 400) / 700 });
  // glitter path under the sun
  if (pal.sun && pal.tod !== 'dawn') {
    const sr = rng(51);
    for (let i = 0; i < 70; i++) {
      const t = Math.pow(sr(), 0.8);
      const y = lerp(HORIZON + 3, 820, t);
      const w = lerp(6, 120, t) * (0.4 + sr());
      const x = pal.sun.x + (sr() - 0.5) * lerp(20, 260, t);
      blob(c, x, y, w, lerp(0.8, 3.2, t), pal.glitter, 0.35 + sr() * 0.35, i + 7, 0.3);
    }
  }
  if (pal.tod === 'dawn') {
    const sr = rng(52);
    for (let i = 0; i < 40; i++) {
      const t = Math.pow(sr(), 0.9);
      const y = lerp(HORIZON + 3, 600, t);
      blob(c, pal.sun.x + (sr() - 0.5) * lerp(20, 300, t), y, lerp(8, 70, t), lerp(0.8, 2.4, t), pal.glitter, 0.3 + sr() * 0.3, i + 70, 0.3);
    }
  }
  // water mask
  mask.fillStyle = 'rgb(255,255,0)';
  mask.fillRect(X0, HORIZON, X1 - X0, Y1 - HORIZON);
  mask.fillStyle = 'rgb(0,90,0)';
  mask.fillRect(X0, Y0, X1 - X0, HORIZON - Y0);

  // ---- north shore ----
  const shoreN = LAND.north.filter(([x, y]) => y >= -1.5 && x <= 101.6);
  const shoreDense = wobble(shoreN, { amp: 0.25, freq: 0.5, seed: 5, closed: false, step: 1.2 });
  const shoreS = shoreDense.map(([x, y]) => pz(x, y, 0));
  const topS = shoreDense.map(([x, y]) => pz(x, y - 0.6, northCliff(x)));
  // land mass from the cliff top up to the ridge line
  {
    const pts = [...topS];
    const xr = Math.max(X1 + 30, topS[topS.length - 1][0] + 20);
    pts.push([xr, topS[topS.length - 1][1]], [xr, 200]);
    for (let x = xr; x >= topS[0][0]; x -= 16) pts.push([x, ridgeY(x, 15, 312, 34)]);
    pts.push([topS[0][0] - 2, topS[0][1] - 18]);
    gradWash(c, pts, 0, 250, 0, 400, [[0, mixHex(pal.grassFar, pal.ridge2, 0.35)], [1, pal.grassFar]], { alpha: 1, amp: 2, seed: 16 });
    glazes(c, 300, X1, 250, 360, [pal.grassNear, PAL.ochre, mixHex(pal.grassFar, pal.ridge2, 0.5), PAL.heather, pal.grassFar], { count: 50, alpha: [0.1, 0.3], w: [40, 180], h: [3, 10], seed: 160, clip: pts, tilt: 0.04 });
    glazes(c, 300, X1, 300, 345, [mixHex(pal.rockSh, pal.grassFar, 0.5)], { count: 16, alpha: [0.12, 0.25], w: [60, 220], h: [3, 7], seed: 161, clip: pts });
    mask.fillStyle = 'rgb(0,150,140)'; trace(mask, pts); mask.fill();
    // field patches + walls
    const fr = rng(17);
    for (let i = 0; i < 26; i++) {
      const x = lerp(340, X1, fr()), y = lerp(ridgeY(x, 15, 312, 34) + 6, 352, fr());
      const w = 30 + fr() * 70, h = 5 + fr() * 9;
      const col = [pal.grassNear, PAL.ochre, pal.grassFar, PAL.heather][i % 4];
      wash(c, [[x, y], [x + w, y - 2], [x + w + 6, y + h], [x - 4, y + h + 1]], mixHex(col, pal.grassFar, 0.55), { alpha: 0.4, amp: 1.5, seed: 100 + i, passes: 2 });
      inkLine(ink, wobble([[x - 4, y + h + 1], [x + w + 6, y + h]], { amp: 0.6, closed: false, seed: 200 + i, step: 6 }), { width: 0.7, alpha: 0.35 * (1 - pal.dark * 0.5), color: PAL.sepia, seed: i });
    }
  }
  // cliff faces
  {
    const cliffPoly = [...topS, ...shoreS.slice().reverse()];
    gradWash(c, cliffPoly, 0, 330, 0, 400, [[0, mixHex(pal.rock, pal.cloudLit, 0.15)], [0.5, pal.rock], [1, pal.rockSh]], { alpha: 1, amp: 0.4, seed: 170, passes: 1, step: 4 });
    {
      // tall narrow glazes down the cliff face
      const gr = rng(171);
      c.save(); trace(c, cliffPoly); c.clip();
      for (let i = 0; i < 90; i++) {
        const j = Math.floor(gr() * (topS.length - 1));
        const [x, y0] = topS[j], [, y1] = shoreS[j];
        const w = 2 + gr() * 18;
        c.globalAlpha = 0.06 + gr() * 0.16;
        c.fillStyle = [pal.rockSh, PAL.sienna, PAL.violet, pal.rock, PAL.umber][i % 5];
        trace(c, wobble([[x, y0 - 2], [x + w, y0 - 2], [x + w * 0.7, y1 + 2], [x + w * 0.1, y1 + 2]], { amp: 1, seed: i, step: 4 }));
        c.fill();
      }
      c.restore();
    }
    // light on the cliff tops
    const lit = [...topS, ...topS.slice().reverse().map(([x, y]) => [x, y + 3])];
    wash(c, lit, mixHex(pal.rock, pal.cloudLit, 0.5), { alpha: 0.5, amp: 1, seed: 18, passes: 1 });
    // vertical strata strokes
    const hr = rng(19);
    for (let i = 0; i < shoreS.length - 1; i += 2) {
      const [x0, y0] = topS[i], [x1, y1] = shoreS[i];
      if (y1 - y0 < 3) continue;
      inkLine(ink, [[x0 + hr() * 2, y0 + 2], [x1 + (hr() - 0.5) * 3, y1 - 1]], { width: 0.6, alpha: 0.32, color: PAL.sepia, seed: i, breaks: 0.1 });
    }
    inkLine(ink, topS, { width: 1.0, alpha: 0.55, color: PAL.ink, seed: 4, breaks: 0.05 });
    inkLine(ink, shoreS, { width: 0.8, alpha: 0.4, color: PAL.ink, seed: 6, breaks: 0.12 });
    // a sliver of bare paper left along the waterline
    for (let i = 0; i < shoreS.length - 1; i++) {
      if (noise1(i * 0.4, 12) < 0.35) continue;
      const [x0, y0] = shoreS[i], [x1, y1] = shoreS[i + 1];
      c.save(); c.globalAlpha = 0.7 * (1 - pal.dark * 0.5); c.strokeStyle = '#F4EFE4'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x0, y0 + 1.5); c.lineTo(x1, y1 + 1.5); c.stroke(); c.restore();
    }
    // foam at the cliff foot
    for (let i = 0; i < shoreS.length; i += 2) {
      const [x, y] = shoreS[i];
      blob(c, x, y + 1.5, 4 + r() * 6, 1.2, '#F4EEE2', 0.35 * (1 - pal.dark * 0.6), i);
    }
    // reflections of the cliffs
    for (let i = 0; i < shoreS.length - 1; i++) {
      const [x0, y0] = shoreS[i], [, yt] = topS[i];
      const h = (y0 - yt) * 0.9;
      c.fillStyle = rgba(pal.rockSh, 0.22);
      c.fillRect(x0, y0 + 1, (shoreS[i + 1][0] - x0) + 0.5, h);
    }
  }
  // the harbour piers
  for (const pier of PIERS) {
    const pts = pier.map(([x, y]) => pz(x, y, 0.5));
    wash(c, pts, mixHex('#9A948C', pal.rockSh, 0.3), { alpha: 0.95, amp: 0.6, seed: 61, passes: 2 });
    inkOutline(ink, pts, { width: 0.8, alpha: 0.6, seed: 62, amp: 0.4 });
  }
  // village
  if (village) paintVillage(P, pal, { lights, lightsCount, night, seed });

  // ---- reefs, stacks ----
  if (night) paintReefs(P, pal, night);
  const stacks = STACKS.slice().sort((a, b) => cy(a.poly) - cy(b.poly));
  for (const s of stacks) paintStack(P, pal, s);

  // ---- near land (south shore + the lighthouse headland) ----
  {
    const shore = LAND.south.filter(([x, y]) => y < 70 && x < 101.7);
    const dense = wobble(shore, { amp: 0.3, freq: 0.4, seed: 8, closed: false, step: 1.2 });
    const topN = dense.map(([x, y]) => pz(x, y + 0.6, southCliff(x)));
    const pts = [...topN, [X1 + 40, topN[topN.length - 1][1]], [X1 + 40, Y1 + 40], [X0 - 40, Y1 + 40], [X0 - 40, topN[0][1]]];
    gradWash(c, pts, 0, 760, 0, 1000, [[0, mixHex(pal.grassNear, pal.grassFar, 0.25)], [1, shade(pal.grassNear, -0.12)]], { alpha: 1, amp: 2.5, seed: 9 });
    mask.fillStyle = 'rgb(0,140,150)'; trace(mask, pts); mask.fill();
    // grass: layered glazes, then a few ink ticks
    glazes(c, X0, X1, 780, Y1, [shade(pal.grassNear, -0.2), mixHex(pal.grassNear, PAL.ochre, 0.45), mixHex(pal.grassNear, PAL.sap, 0.5), mixHex(pal.grassNear, PAL.umber, 0.4)], { count: 70, alpha: [0.12, 0.3], w: [60, 320], h: [5, 18], seed: 91, clip: pts, tilt: 0.05 });
    glazes(c, X0, X1, 900, Y1, [shade(pal.grassNear, -0.35)], { count: 14, alpha: [0.15, 0.3], w: [120, 400], h: [10, 30], seed: 92, clip: pts });
    {
      const tr = rng(96);
      for (let i = 0; i < 160; i++) {
        const x = lerp(X0, X1, tr()), y = lerp(800, Y1, tr());
        if (!(y > 0)) continue;
        inkLine(ink, [[x, y], [x + (tr() - 0.5) * 3, y - 4 - tr() * 6]], { width: 0.6, alpha: 0.25, color: shade(pal.grassNear, -0.5), seed: i, breaks: 0 });
      }
    }
    // heather and gorse dabs along the cliff edge
    const dr = rng(93);
    for (let i = 0; i < 140; i++) {
      const j = Math.floor(dr() * (topN.length - 1));
      const [x, y] = topN[j];
      const dy = 4 + Math.pow(dr(), 1.5) * 120;
      const col = dr() < 0.5 ? PAL.heather : PAL.gorse;
      blob(c, x + (dr() - 0.5) * 30, y + dy, 2 + dr() * 6, 1.2 + dr() * 2.5, mixHex(col, pal.grassNear, 0.25 + pal.dark * 0.6), 0.6, i + 300);
    }
    // rocks breaking the edge
    inkLine(ink, topN, { width: 1.2, alpha: 0.6, seed: 10, breaks: 0.06 });
    // dry-stone walls running back from the edge
    const wr = rng(94);
    for (let i = 0; i < 6; i++) {
      const x0 = lerp(420, X1, wr());
      const y0 = lerp(870, 900, wr());
      const pts2 = [];
      for (let k = 0; k < 10; k++) pts2.push([x0 + k * 40 + wr() * 8, y0 + k * (6 + wr() * 4) + Math.sin(k) * 3]);
      inkLine(ink, pts2, { width: 1.1, alpha: 0.55, seed: 400 + i, breaks: 0.15, vary: 0.8 });
      for (const [x, y] of pts2) blob(c, x, y - 1, 6, 2.2, mixHex('#8F8A80', pal.rockSh, 0.3), 0.7, i * 10 + x);
    }
    // sheep
    if (pal.tod !== 'night') {
      const sh = rng(95);
      for (let i = 0; i < 7; i++) {
        const x = lerp(500, 1500, sh()), y = lerp(890, 990, sh());
        blob(c, x, y, 9, 6, mixHex('#F4EFE4', pal.skyLow, 0.15), 0.95, i + 500, 0.12);
        blob(c, x + 9, y - 2, 3, 2.4, PAL.ink, 0.8, i + 520, 0.1);
        inkLine(ink, [[x - 4, y + 5], [x - 4, y + 9]], { width: 0.9, alpha: 0.7, seed: i });
        inkLine(ink, [[x + 4, y + 5], [x + 4, y + 9]], { width: 0.9, alpha: 0.7, seed: i + 1 });
      }
    }
  }

  // ---- the lighthouse ----
  paintLighthouse(P, pal);

  // haar weight: denser on the water than over land and sky (already set in mask fills above)
  if (rain) {
    streaks(c, X0, X1, Y0, HORIZON, pal.cloud, { count: 10, alpha: 0.25, thick: [10, 26], seed: 81, blur: 6, len: [0.3, 0.7] });
  }
  return { lampAt: lampPos() };
}

function cy(poly) { return poly.reduce((a, p) => a + p[1], 0) / poly.length; }

// ---------------- pieces ----------------
export function villageSites() {
  // [x, y, kind] in world units along the north-east shore
  const sites = [];
  const r = rng(77);
  const rows = [[74, 97, 2.8, 2.2], [76, 96, 0.4, 2.8], [79, 93, -2.2, 3.4]];
  for (const [a, b, y, dx] of rows) for (let x = a; x <= b; x += dx * (0.8 + r() * 0.5)) sites.push([x + r() * 0.8, y + r() * 0.6]);
  return sites;
}

function paintVillage(P, pal, { lights, lightsCount }) {
  const { paint: c, ink, light } = P;
  const sites = villageSites();
  sites.sort((a, b) => a[1] - b[1]);
  const total = sites.length;
  const lit = lightsCount != null ? lights : Math.round(lights * total);
  // deterministic order in which windows go dark
  const order = sites.map((_, i) => i).sort((a, b) => noise1(a * 7.3, 2) - noise1(b * 7.3, 2));
  const litSet = new Set(order.slice(0, lit));
  sites.forEach(([x, y], i) => {
    const [sx, sy, s] = pz(x, y, northCliff(x) + 0.3);
    const k = s * 1.15;
    const w = (15 + noise1(i, 3) * 8) * k, h = (9 + noise1(i, 4) * 3) * k, rh = 7 * k;
    const big = i === 5 || i === 11 || i === 2;
    const W = big ? w * 1.4 : w;
    // house body
    const body = [[sx - W / 2, sy], [sx + W / 2, sy], [sx + W / 2, sy - h], [sx - W / 2, sy - h]];
    wash(c, body, pal.ww, { alpha: 1, amp: 0.4, seed: i + 700, passes: 1, step: 3 });
    // shadow side
    wash(c, [[sx + W * 0.15, sy], [sx + W / 2, sy], [sx + W / 2, sy - h], [sx + W * 0.15, sy - h]], pal.wwSh, { alpha: 0.5, amp: 0.3, seed: i + 750, passes: 1, step: 3 });
    // roof
    const thatch = noise1(i, 9) > 0.6;
    const roof = [[sx - W / 2 - 1.5, sy - h], [sx + W / 2 + 1.5, sy - h], [sx + W / 2 - 2, sy - h - rh], [sx - W / 2 + 2, sy - h - rh]];
    wash(c, roof, thatch ? mixHex('#9C7A4A', pal.roof, 0.35) : pal.roof, { alpha: 0.95, amp: 0.4, seed: i + 800, passes: 1, step: 3 });
    // chimney
    c.fillStyle = mixHex(pal.ww, pal.wwSh, 0.4);
    c.fillRect(sx + W / 2 - 4 * k, sy - h - rh - 3 * k, 2.4 * k, 4 * k);
    inkOutline(ink, body, { width: 0.6, alpha: 0.55, seed: i + 900, amp: 0.3 });
    inkLine(ink, [roof[0], roof[3], roof[2], roof[1]], { width: 0.6, alpha: 0.6, seed: i + 950 });
    // window + door
    const wx = sx - W * 0.2, wy = sy - h * 0.55;
    const on = litSet.has(i);
    c.fillStyle = on ? mixHex('#E9B65A', pal.ww, pal.dark > 0.5 ? 0 : 0.5) : mixHex('#3A3A48', pal.ww, 0.35);
    c.fillRect(wx - 1.6 * k, wy - 1.6 * k, 3.2 * k, 3.2 * k);
    c.fillStyle = mixHex('#4A3A34', pal.ww, 0.2);
    c.fillRect(sx + W * 0.12, sy - h * 0.62, 2.6 * k, h * 0.62);
    if (on && pal.dark > 0.15) {
      glow(light, wx, wy, 16 * k, '#F0B24E', 0.55 * pal.dark + 0.1);
      glow(light, wx, wy, 4 * k, '#FFD98A', 0.7 * pal.dark);
    }
  });
}

export function lampPos() { const [x, y] = pz(LIGHTHOUSE[0], LIGHTHOUSE[1], 2.2); return [x, y - TOWER.h + 18]; }
export const TOWER = { h: 350, wb: 60, wt: 44 };

function paintLighthouse(P, pal) {
  const { paint: c, ink, light, mask } = P;
  const [bx, by0] = pz(LIGHTHOUSE[0], LIGHTHOUSE[1], 2.2);
  const by = by0;
  const { h, wb, wt } = TOWER;
  const top = by - h;
  // keeper's cottage and wall (behind and to the right)
  const cx = bx + 46, cyy = by + 4;
  const cot = [[cx - 30, cyy], [cx + 52, cyy], [cx + 52, cyy - 26], [cx - 30, cyy - 26]];
  wash(c, cot, pal.ww, { alpha: 1, amp: 0.6, seed: 31, passes: 1, step: 4 });
  wash(c, [[cx + 22, cyy], [cx + 52, cyy], [cx + 52, cyy - 26], [cx + 22, cyy - 26]], pal.wwSh, { alpha: 0.55, amp: 0.5, seed: 32, passes: 1, step: 4 });
  const roof = [[cx - 34, cyy - 26], [cx + 56, cyy - 26], [cx + 48, cyy - 44], [cx - 26, cyy - 44]];
  wash(c, roof, pal.roof, { alpha: 0.95, amp: 0.6, seed: 33, passes: 1, step: 4 });
  c.fillStyle = mixHex(pal.ww, pal.wwSh, 0.3);
  c.fillRect(cx + 38, cyy - 52, 6, 10);
  inkOutline(ink, cot, { width: 0.9, alpha: 0.6, seed: 34, amp: 0.4 });
  inkLine(ink, [roof[0], roof[3], roof[2], roof[1]], { width: 1, alpha: 0.7, seed: 35 });
  // cottage windows
  for (const wx of [cx - 14, cx + 30]) {
    c.fillStyle = pal.dark > 0.5 ? '#E8B45A' : mixHex('#3B3C4C', pal.ww, 0.3);
    c.fillRect(wx, cyy - 18, 7, 8);
    inkOutline(ink, [[wx, cyy - 18], [wx + 7, cyy - 18], [wx + 7, cyy - 10], [wx, cyy - 10]], { width: 0.6, alpha: 0.6, seed: wx, amp: 0.2 });
    if (pal.dark > 0.5) glow(light, wx + 3.5, cyy - 14, 24, '#EFA94A', 0.45);
  }
  // boundary wall
  const wall = [];
  for (let a = 0; a <= 1; a += 0.05) wall.push([bx - 70 + a * 200, by + 18 + Math.sin(a * Math.PI) * 10 + noise1(a * 8, 3) * 2]);
  inkLine(ink, wall, { width: 1.2, alpha: 0.5, seed: 36, breaks: 0.04 });
  for (let i = 0; i < wall.length; i += 1) blob(c, wall[i][0], wall[i][1] - 2, 6, 3, pal.ww, 0.75, i + 40);

  // tower body: tapered, lit from the west at dusk, from the east at dawn
  const body = [];
  const N = 24;
  for (let i = 0; i <= N; i++) { const t = i / N; body.push([bx - lerp(wb, wt, t) / 2 - Math.sin(t * Math.PI) * 1.5, by - t * h]); }
  for (let i = N; i >= 0; i--) { const t = i / N; body.push([bx + lerp(wb, wt, t) / 2 + Math.sin(t * Math.PI) * 1.5, by - t * h]); }
  wash(c, body, pal.ww, { alpha: 1, amp: 0.5, seed: 37, passes: 1, step: 4 });
  // shaded side
  const shadeLeft = pal.tod === 'dawn' || pal.tod === 'afternoon';
  const sh = [];
  for (let i = 0; i <= N; i++) { const t = i / N; sh.push([bx + (shadeLeft ? -1 : 1) * lerp(wb, wt, t) / 2, by - t * h]); }
  for (let i = N; i >= 0; i--) { const t = i / N; sh.push([bx + (shadeLeft ? -1 : 1) * lerp(wb, wt, t) * 0.08, by - t * h]); }
  wash(c, sh, pal.wwSh, { alpha: 0.6, amp: 1.2, seed: 38, passes: 2, step: 6 });
  // warm light on the lit flank
  if (pal.tod === 'dusk' || pal.tod === 'title' || pal.tod === 'lastsunset') {
    const lit = [];
    for (let i = 0; i <= N; i++) { const t = i / N; lit.push([bx - lerp(wb, wt, t) / 2 + 1, by - t * h]); }
    for (let i = N; i >= 0; i--) { const t = i / N; lit.push([bx - lerp(wb, wt, t) * 0.22, by - t * h]); }
    wash(c, lit, pal.cloudLit, { alpha: 0.35, amp: 1, seed: 39, passes: 2, step: 6 });
  }
  inkLine(ink, body.slice(0, N + 1), { width: 1.4, alpha: 0.75, seed: 40, breaks: 0.03 });
  inkLine(ink, body.slice(N + 1), { width: 1.4, alpha: 0.75, seed: 41, breaks: 0.03 });
  mask.fillStyle = 'rgb(0,60,40)'; trace(mask, body); mask.fill();
  // door and windows
  c.fillStyle = mixHex('#3E3440', pal.ww, 0.15);
  c.fillRect(bx - 7, by - 22, 14, 22);
  inkOutline(ink, [[bx - 7, by], [bx - 7, by - 22], [bx + 7, by - 22], [bx + 7, by]], { width: 0.8, alpha: 0.7, seed: 42, amp: 0.3 });
  for (const t of [0.35, 0.62]) {
    const y = by - t * h;
    c.fillStyle = mixHex('#3E3A4C', pal.ww, 0.2);
    c.fillRect(bx - 3, y - 7, 6, 10);
    inkOutline(ink, [[bx - 3, y - 7], [bx + 3, y - 7], [bx + 3, y + 3], [bx - 3, y + 3]], { width: 0.6, alpha: 0.6, seed: 43 + t * 10, amp: 0.2 });
  }
  // gallery ledge
  const gy = top + 2;
  const ledge = [[bx - wt / 2 - 8, gy], [bx + wt / 2 + 8, gy], [bx + wt / 2 + 6, gy + 6], [bx - wt / 2 - 6, gy + 6]];
  wash(c, ledge, '#2E2A30', { alpha: 0.95, amp: 0.3, seed: 44, passes: 1, step: 3 });
  // lamp room glass
  const lw = 30, lh = 30;
  const glass = [[bx - lw / 2, gy], [bx + lw / 2, gy], [bx + lw / 2, gy - lh], [bx - lw / 2, gy - lh]];
  const lampOn = pal.dark > 0.15 || pal.tod === 'title' || pal.tod === 'dusk' || pal.tod === 'lastsunset';
  wash(c, glass, lampOn ? '#F2C66A' : mixHex(pal.skyLow, '#8A97AA', 0.4), { alpha: 1, amp: 0.3, seed: 45, passes: 1, step: 3 });
  mask.fillStyle = 'rgb(0,0,0)'; trace(mask, glass); mask.fill();
  // dome
  const dome = [];
  for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; dome.push([bx + Math.cos(a) * (lw / 2 + 3), gy - lh + Math.sin(a) * 14]); }
  wash(c, dome, '#2C2832', { alpha: 1, amp: 0.3, seed: 46, passes: 1, step: 3 });
  inkLine(ink, [[bx, gy - lh - 14], [bx, gy - lh - 26]], { width: 1.2, alpha: 0.85, seed: 47 });
  blob(c, bx, gy - lh - 16, 3, 3, '#2C2832', 1, 48, 0.05);
  // railings + glazing bars
  for (let i = 0; i <= 8; i++) {
    const x = bx - wt / 2 - 7 + (i / 8) * (wt + 14);
    inkLine(ink, [[x, gy], [x, gy - 12]], { width: 0.9, alpha: 0.85, seed: 50 + i, breaks: 0 });
  }
  inkLine(ink, [[bx - wt / 2 - 8, gy - 12], [bx + wt / 2 + 8, gy - 12]], { width: 1.1, alpha: 0.9, seed: 59 });
  for (let i = 0; i <= 3; i++) {
    const x = bx - lw / 2 + (i / 3) * lw;
    inkLine(ink, [[x, gy], [x, gy - lh]], { width: 0.9, alpha: 0.8, seed: 60 + i });
  }
  inkLine(ink, [[bx - lw / 2, gy - lh / 2], [bx + lw / 2, gy - lh / 2]], { width: 0.6, alpha: 0.6, seed: 64 });
}

function paintStack(P, pal, s) {
  const { paint: c, ink, mask } = P;
  const base = s.poly.map(([x, y]) => pz(x, y, 0));
  const xs = base.map((p) => p[0]), ys = base.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const scale = base[0][2];
  const H = s.h * 34 * scale + 18 * scale;
  const W = maxX - minX;
  const pts = [
    [minX - 1, maxY], [minX + W * 0.08, maxY - H * 0.55], [minX + W * 0.2, maxY - H * 0.92], [minX + W * 0.5, maxY - H],
    [minX + W * 0.78, maxY - H * 0.86], [minX + W * 0.92, maxY - H * 0.4], [maxX + 1, maxY],
  ];
  // reflection
  const refl = pts.map(([x, y]) => [x, maxY + (maxY - y) * 0.8]);
  wash(c, refl, mixHex(pal.rockSh, pal.seaMid, 0.45), { alpha: 0.35, amp: 2, seed: 70, passes: 1 });
  gradWash(c, pts, minX, 0, maxX, 0, [[0, mixHex(pal.rock, pal.cloudLit, 0.25)], [0.45, pal.rock], [1, pal.rockSh]], { alpha: 1, amp: 1.2 * scale, seed: 71 + s.h * 10, passes: 2, step: 4 });
  // grass cap
  const cap = [[minX + W * 0.2, maxY - H * 0.92], [minX + W * 0.5, maxY - H - 1], [minX + W * 0.78, maxY - H * 0.86], [minX + W * 0.6, maxY - H * 0.8], [minX + W * 0.3, maxY - H * 0.84]];
  wash(c, cap, pal.grassFar, { alpha: 0.8, amp: 0.6, seed: 72, passes: 1, step: 3 });
  hatch(ink, pts, { spacing: 4.5 * scale + 1.5, angle: 1.3, width: 0.6, alpha: 0.35, seed: 73 + s.h * 7 });
  inkOutline(ink, pts, { width: 1.1, alpha: 0.7, seed: 74, amp: 0.5 });
  // seabirds on the ledges
  const r = rng(75 + s.h * 13);
  for (let i = 0; i < 6; i++) blob(c, lerp(minX + W * 0.2, maxX - W * 0.2, r()), lerp(maxY - H * 0.8, maxY - H * 0.2, r()), 1.1, 0.8, '#F6F2EA', 0.8, i);
  // foam around the foot
  for (let i = 0; i < 5; i++) blob(c, lerp(minX - 4, maxX + 4, i / 4), maxY + 1, 5, 1.4, '#F2EDE2', 0.45 * (1 - pal.dark * 0.5), i + 9);
  mask.fillStyle = 'rgb(0,80,180)'; trace(mask, pts); mask.fill();
}

export function paintReefs(P, pal, night, extra = []) {
  const { paint: c, ink } = P;
  const ids = [...(night.reefs || []), ...extra];
  for (const id of ids) {
    const reef = REEFS[id];
    if (!reef) continue;
    const on = reefActive(reef, night.tide);
    const pts = reef.poly.map(([x, y]) => pz(x, y, 0));
    if (on) {
      // dark rocks just breaking the surface, ringed with foam
      const r = rng(id.length * 31);
      for (const [x, y] of pts) if (r() < 0.55) blob(c, x + (r() - 0.5) * 3, y, 2 + r() * 3, 1 + r() * 1.4, mixHex(pal.rockSh, '#1E1C22', 0.4), 0.85, x);
      const ctr = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      for (let i = 0; i < 4; i++) blob(c, ctr[0] + (r() - 0.5) * 12, ctr[1] + (r() - 0.5) * 3, 2 + r() * 4, 1 + r(), mixHex(pal.rockSh, '#1E1C22', 0.4), 0.85, i + 7);
      const ring = wobble(pts, { amp: 1.4, freq: 0.15, seed: 9, closed: true, step: 3 });
      ring.push(ring[0]);
      const cx0 = ring.reduce((a, p) => a + p[0], 0) / ring.length;
      for (let i = 0; i < ring.length - 1; i += 3) {
        const [x, y] = ring[i];
        if (x > cx0 + 4 || r() < 0.45) continue;
        blob(c, x - 2, y + 1, 3 + r() * 5, 0.7 + r() * 0.6, '#EEF0F0', (0.25 + r() * 0.25) * (1 - pal.dark * 0.35), i + 40);
      }
    } else {
      // submerged: a faint lighter patch under the water
      wash(c, pts, mixHex(pal.seaMid, '#8FA08A', 0.35), { alpha: 0.13, amp: 2, seed: id.length + 3, passes: 2, blur: 4 });
    }
  }
}

// ---------------- live pieces ----------------

// The lamp's beam: a turning glaze from the lamp out over the water.
export function drawBeam(light, paintCtx, angle, { reach = 1, intensity = 1, haar = 0 } = {}) {
  const [lx, ly] = lampPos();
  const R = 70 * reach;
  const spread = 0.085;
  const dirx = Math.cos(angle), diry = -Math.sin(angle);
  const toward = Math.max(0, diry); // pointing south, toward us
  const k = intensity * (1 - toward * 0.75);
  const far = (a) => {
    const wx = LIGHTHOUSE[0] + Math.cos(a) * R, wy = LIGHTHOUSE[1] - Math.sin(a) * R;
    const [sx, sy, s] = pz(wx, wy, 0);
    return [sx, sy - 18 * s * 9];
  };
  light.save();
  light.globalCompositeOperation = 'lighter';
  for (const [sp, a] of [[spread * 1.9, 0.35], [spread * 1.2, 0.45], [spread * 0.6, 0.5]]) {
    const A = far(angle - sp), B = far(angle + sp);
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const g = light.createLinearGradient(lx, ly, mid[0], mid[1]);
    g.addColorStop(0, `rgba(246,196,110,${0.5 * k * a})`);
    g.addColorStop(0.25, `rgba(238,178,92,${0.3 * k * a})`);
    g.addColorStop(0.7, `rgba(225,160,80,${0.1 * k * a * (1 - haar * 0.8)})`);
    g.addColorStop(1, 'rgba(220,150,70,0)');
    light.fillStyle = g;
    light.beginPath(); light.moveTo(lx, ly - 5); light.lineTo(A[0], A[1]); light.lineTo(B[0], B[1]); light.lineTo(lx, ly + 5); light.closePath(); light.fill();
  }
  // the glaze it lays on the water
  const wa = (a, rr) => pz(LIGHTHOUSE[0] + Math.cos(a) * rr, LIGHTHOUSE[1] - Math.sin(a) * rr, 0);
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(wa(angle - spread * 1.6 + (i / 8) * spread * 3.2, R * 0.75));
  const p0 = wa(angle, 6);
  const g2 = light.createLinearGradient(p0[0], p0[1], pts[4][0], pts[4][1]);
  g2.addColorStop(0, `rgba(240,180,100,${0.16 * k})`);
  g2.addColorStop(0.5, `rgba(230,170,90,${0.08 * k * (1 - haar * 0.8)})`);
  g2.addColorStop(1, 'rgba(230,170,90,0)');
  light.fillStyle = g2;
  light.beginPath(); light.moveTo(p0[0], p0[1]);
  for (const p of pts) light.lineTo(p[0], p[1]);
  light.closePath(); light.fill();
  light.restore();
  return toward;
}

export function drawLamp(light, intensity = 1, flare = 0) {
  const [lx, ly] = lampPos();
  glow(light, lx, ly, 150, '#E6A94A', 0.55 * intensity);
  glow(light, lx, ly, 46, '#F8CE7A', 0.85 * intensity);
  glow(light, lx, ly, 14, '#FFF0C8', 1.0 * intensity);
  if (flare > 0) {
    glow(light, lx, ly, 360, '#E9A64C', 0.5 * flare * intensity);
    radial(light, lx, ly, 420, [[0, `rgba(255,220,150,${0.35 * flare})`], [1, 'rgba(255,200,120,0)']], 'lighter', 0.12);
  }
}
