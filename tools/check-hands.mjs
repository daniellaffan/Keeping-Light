// node tools/check-hands.mjs — the keeper's hands against the room. Runs the game in headless Chromium
// (debug mode) and drives src/world/handcheck.js through every test of the hands' contact solver:
//   1 penetration   skin inside anything (every pose, every frame of every movement and blend)
//   2 contact       what each pose should be touching, within tolerance
//   3 motion range  every movement with a moving thing, through its whole travel, 100+ steps
//   4 joint angles  every joint within its anatomical range, no jumps, no forearm flips
//   5 skin twist    the forearm turned through its range: the skin never collapses
//   6 fuzz          the writing point all over the page (landscape and phone portrait); props nudged
//   7 stability     held hands don't move; the same run twice gives the same numbers
//   8 speed         the hands' update per frame; the skin's build time
//   9 visual        the debug overlay; contact sheets and joint plots (with --shots)
// Prints a pass/fail table per test and per interaction, and writes everything it measured to
// docs/hands-check/<label>.json. Thresholds are in src/world/contacts.js (THRESH).
//   --label NAME     the JSON's name (default: latest)
//   --only a,b       just these tests (by number or name)
//   --quick          coarser sweeps, fewer nudges, no autoplayed night
//   --shots          also render the contact sheets and joint plots into docs/screenshots
//   --shot-prefix N  their file names, e.g. "45-hands" (default: hands-check)
//   --jobs N         pages run at once (default 3)
//   --report NAME    measure nothing: judge docs/hands-check/NAME.json again, print and write its tables
//   --focus NAME     just one interaction (any part of its name: "lever", "pencil"...): its holds, its
//                    phases of the dusk (the rest played through unmeasured), its sweeps and two nudges
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { THRESH } from '../src/world/contacts.js';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
const REPORT = opt('report');
const LABEL = REPORT || opt('label', 'latest');
const QUICK = !!opt('quick', false);
const SHOTS = !!opt('shots', false);
const SHOT_PREFIX = opt('shot-prefix', 'hands-check');
const JOBS = +opt('jobs', 3);
const ONLY = opt('only') ? String(opt('only')).split(',') : null;
const FOCUS = opt('focus') ? String(opt('focus')) : null;
const TESTS = ['penetration', 'contact', 'motion', 'joints', 'twist', 'fuzz', 'stability', 'speed', 'visual'];
const want = (t) => !ONLY || ONLY.some((o) => o === t || o === String(TESTS.indexOf(t) + 1));

// the speed budget (proposed): the hands' whole update, both arms, per frame, in this container's
// Chromium; phones and integrated-GPU laptops run JavaScript perhaps 3-4 times slower
const BUDGET = { handsMs: 1.0, skinBuildGrowth: 1.1 };

// ---------------------------------------------------------------------------------------------------
async function playwright() {
  try { return await import('playwright'); } catch { /* not installed here */ }
  const req = createRequire(process.env.PLAYWRIGHT_DIR || '/opt/node-tools/node_modules/');
  return req('playwright');
}

async function serve() {
  const port = 8100 + Math.floor(Math.random() * 800);
  const proc = spawn('python3', [path.join(ROOT, 'tools/serve.py'), String(port)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://localhost:${port}/index.html`); if (r.ok) return { port, proc }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the dev server did not start');
}

let browser, base;
const errors = [];
async function page(query, viewport = { width: 1280, height: 800 }) {
  const p = await browser.newPage({ viewport });
  p.on('pageerror', (e) => errors.push(`${query}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${query}: ${m.text().slice(0, 300)}`); });
  await p.addInitScript(() => {
    // CPU-backed 2D canvases (SwiftShader drops canvas clears after a texture upload otherwise)
    const o = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, a) { if (t === '2d') a = { ...(a || {}), willReadFrequently: true }; return o.call(this, t, a); };
    // the tests drive time themselves (__game.step), and the boats' randomness is seeded, so a run
    // can be repeated exactly
    window.requestAnimationFrame = () => 0;
    let s = 12345;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  });
  await p.goto(`${base}/?debug=1&${query}`);
  await p.waitForFunction(() => window.__game?.keeper && window.__handcheck, null, { timeout: 180000, polling: 250 });
  return p;
}
const evalIn = (p, fn, arg) => p.evaluate(fn, arg);

// run async jobs, at most n at once
async function pool(jobs, n) {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
  }));
  return out;
}

// ---------------------------------------------------------------------------------------------------
// What is measured, page by page.
const DUSK = 'night=5&phase=dusk';
const NUDGES = QUICK
  ? [{ book: [0.03, 0, 0] }, { well: [0.03, 0.03] }]
  : [{ book: [0.03, 0, 0] }, { book: [-0.03, 0, 0] }, { book: [0, 0.03, 0] }, { book: [0, -0.03, 0] }, { book: [0, 0, 0.05] }, { book: [0, 0, -0.05] },
    { well: [0.03, 0] }, { well: [-0.03, 0] }, { well: [0, 0.03] }, { well: [0, -0.03] }];

// one interaction's scenarios only
async function measureFocus() {
  const D = { focus: FOCUS };
  const I = INTERACTIONS.filter(([n]) => n.includes(FOCUS)).map(([, i]) => i);
  if (!I.length) throw new Error(`no interaction matches "${FOCUS}"`);
  const holds = [...new Set(I.flatMap((i) => i.holds))], phases = [...new Set(I.flatMap((i) => i.phases))];
  const sweeps = [...new Set(I.flatMap((i) => i.sweeps || []))], nudges = I.some((i) => i.nudges), night = I.some((i) => i.night);
  const jobs = [];
  jobs.push(async () => { const p = await page(DUSK); D.holds = await evalIn(p, (hs) => { const H = window.__handcheck, o = {}; for (const pose of hs) o[pose] = H.hold(pose); return o; }, holds); await p.close(); });
  const duskPh = phases.filter((ph) => ph !== 'door' && ph !== 'stairs');
  if (duskPh.length) jobs.push(async () => { const p = await page(DUSK); D.dusk = await evalIn(p, (only) => window.__handcheck.scenario('dusk', { only }), duskPh); await p.close(); });
  if (phases.includes('door')) jobs.push(async () => { const p = await page('night=5&phase=day'); D.door = await evalIn(p, () => window.__handcheck.scenario('door')); await p.close(); });
  if (phases.includes('stairs')) jobs.push(async () => { const p = await page('finale=stairs'); D.stairs = await evalIn(p, () => window.__handcheck.scenario('stairs')); await p.close(); });
  if (night) jobs.push(async () => { const p = await page('autoplay=1&speed=1&night=5&phase=day'); D.night = await evalIn(p, () => window.__handcheck.scenario('night')); await p.close(); });
  const g = { nx: 12, ny: 8 };
  for (const sw of sweeps) jobs.push(async () => {
    const [pose, mode] = sw.split(' ');
    const p = await page(DUSK, mode === 'portrait' ? { width: 390, height: 844 } : undefined);
    (D.sweeps ||= {})[sw] = await evalIn(p, ([pose, g]) => window.__handcheck.sweep(pose, g), [pose, g]);
    await p.close();
  });
  if (nudges) { D.nudges = []; for (const n of NUDGES.slice(0, 2)) jobs.push(async () => { const p = await page(DUSK); D.nudges.push({ nudge: n, res: await evalIn(p, (n) => window.__handcheck.nudged(n), n) }); await p.close(); }); }
  await pool(jobs, JOBS);
  return D;
}

async function measureAll() {
  if (FOCUS) return measureFocus();
  const D = {};
  const jobs = [];
  const need = (...t) => t.some(want);
  if (need('penetration', 'contact', 'joints', 'stability', 'twist', 'speed', 'visual')) jobs.push(async () => {
    const p = await page(DUSK);
    D.selfTest = await evalIn(p, () => { const H = window.__handcheck; H.hold('lean', { frames: 1 }); return H.selfTest(); });
    D.colliders = await evalIn(p, () => window.__handcheck.colliders());
    D.parts = await evalIn(p, () => window.__handcheck.parts());
    D.holds = await evalIn(p, () => { const H = window.__handcheck, o = {}; for (const pose of H.poses()) if (pose !== 'show') o[pose] = H.hold(pose); return o; });
    if (want('twist')) D.twist = await evalIn(p, () => window.__handcheck.twist());
    if (want('speed')) { D.speed = await evalIn(p, () => window.__handcheck.speed()); D.skinBuild = await evalIn(p, () => window.__handcheck.skinBuild()); }
    if (want('visual')) {
      await p.keyboard.press('o');
      await evalIn(p, () => window.__game.step(1, 1 / 30));
      D.overlayKey = await evalIn(p, () => window.__handcheck.overlayOn());
      await p.keyboard.press('o');
    }
    await p.close();
  });
  if (need('penetration', 'contact', 'motion', 'joints', 'stability')) {
    jobs.push(async () => { const p = await page(DUSK); D.dusk = await evalIn(p, () => window.__handcheck.scenario('dusk')); D.duskStill = D.dusk.still; await p.close(); });
    jobs.push(async () => { const p = await page('night=5&phase=day'); D.door = await evalIn(p, () => window.__handcheck.scenario('door')); await p.close(); });
    jobs.push(async () => { const p = await page('finale=stairs'); D.stairs = await evalIn(p, () => window.__handcheck.scenario('stairs')); await p.close(); });
  }
  if (want('joints') && !QUICK) jobs.push(async () => { const p = await page('autoplay=1&speed=1&night=5&phase=day'); D.night = await evalIn(p, () => window.__handcheck.scenario('night')); await p.close(); });
  if (want('fuzz')) {
    const g = QUICK ? { nx: 12, ny: 8 } : { nx: 24, ny: 16 };
    jobs.push(async () => { const p = await page(DUSK); D.sweeps = D.sweeps || {}; for (const pose of ['write', 'pen']) D.sweeps[pose + ' landscape'] = await evalIn(p, ([pose, g]) => window.__handcheck.sweep(pose, g), [pose, g]); await p.close(); });
    jobs.push(async () => { const p = await page(DUSK, { width: 390, height: 844 }); D.sweeps = D.sweeps || {}; for (const pose of ['write', 'pen']) D.sweeps[pose + ' portrait'] = await evalIn(p, ([pose, g]) => window.__handcheck.sweep(pose, g), [pose, g]); await p.close(); });
    D.nudges = [];
    for (const n of NUDGES) jobs.push(async () => { const p = await page(DUSK); D.nudges.push({ nudge: n, res: await evalIn(p, (n) => window.__handcheck.nudged(n), n) }); await p.close(); });
  }
  if (want('stability')) {
    // the same scenario twice, each in a fresh page: the numbers must match exactly
    const once = async () => { const p = await page(DUSK); const r = await evalIn(p, () => window.__handcheck.scenario('dusk', { upTo: 'turn forward' })); await p.close(); return JSON.stringify(r); };
    jobs.push(async () => { D.repeat = [await once(), await once()]; });
  }
  await pool(jobs, JOBS);
  return D;
}

// ---------------------------------------------------------------------------------------------------
// Judging. Interactions gather the holds and phases they are made of.
const INTERACTIONS = [
  ['resting beside the book', { holds: ['lean'], phases: ['lean in'] }],
  ['pencil: resting and writing', { holds: ['ready', 'write', 'ink-tray'], phases: ['write'], sweeps: ['write landscape', 'write portrait'] }],
  ['quill and inkwell', { holds: ['pen', 'ink-well', 'ink-take', 'ink-lift'], phases: ['ink'], sweeps: ['pen landscape', 'pen portrait'], nudges: true }],
  ['page turn', { holds: ['turn'], phases: ['turn back', 'turn forward'] }],
  ['cover', { holds: ['close'], phases: ['close'] }],
  ['lamp lever', { holds: ['lamp'], phases: ['lamp'] }],
  ['door ring', { holds: ['door'], phases: ['door'] }],
  ['mug', { holds: ['mug'], phases: ['mug'] }],
  ['stair rail', { holds: ['rail'], phases: ['stairs'] }],
  ['chair arms', { holds: ['chair'], phases: ['to the chair', 'dawn', 'rise'] }],
  ['walking arms', { holds: ['walk'], phases: [], night: ['walk'] }],
];
const MOVING = { 'page turn': ['turn back', 'turn forward'], cover: ['close'], 'lamp lever': ['lamp'], 'door ring': ['door'], mug: ['mug'], 'stair rail': ['stairs'], 'quill and inkwell': ['ink'] };

const duskPhases = (d) => (Array.isArray(d) ? d : d?.phases || []);
function phasesOf(D) { const out = {}; for (const r of [...duskPhases(D.dusk), ...(D.door || []), ...(D.stairs || [])]) out[r.name] = r; return out; }

// the worst of a set of recorded results
function worst(results) {
  const pen = {}, con = {}, ang = { out: [], step: 0, stepAt: null }, flips = [];
  for (const r of results) {
    if (!r) continue;
    for (const [o, v] of Object.entries(r.pen || {})) if (!pen[o] || v.max > pen[o].max) pen[o] = { ...v, src: r.name };
    for (const [id, c] of Object.entries(r.con || {})) {
      const C = (con[id] ||= { worst: -Infinity, fail: 0, n: 0, tol: c.tol, src: null });
      C.n += c.n; C.fail += c.fail;
      const w = c.worst == null ? Infinity : c.worst;
      if (w > C.worst) { C.worst = w; C.src = r.name; }
    }
    for (const s of ['R', 'L']) for (const [key, a] of Object.entries(r.ang?.[s] || {})) {
      if (a.out) ang.out.push(`${s} ${key} ${a.outAt} (${r.name})`);
      if (a.step > ang.step) { ang.step = a.step; ang.stepAt = `${s} ${key} ${a.stepAt} (${r.name})`; }
    }
    for (const f of r.flips || []) flips.push(`${f} (${r.name})`);
  }
  return { pen, con, ang, flips };
}
const maxPen = (w) => Object.entries(w.pen).sort((a, b) => b[1].max - a[1].max);
const failedCon = (w) => Object.entries(w.con).filter(([, c]) => c.fail > 0);

function judge(D) {
  const P = phasesOf(D);
  const rows = [], inter = [];
  const holds = D.holds || {};
  const all = [...Object.values(holds), ...Object.values(P), ...(D.night ? [D.night] : [])];
  // per interaction (focused: just those)
  for (const [name, I] of INTERACTIONS) {
    if (D.focus && !name.includes(D.focus)) continue;
    const res = [...I.holds.map((h) => holds[h]), ...I.phases.map((ph) => P[ph]), ...(I.sweeps || []).map((s) => D.sweeps?.[s]), ...(I.nudges ? (D.nudges || []).map((n) => n.res) : []), ...(I.night || []).map((p) => D.night?.byPose?.[p])].filter(Boolean);
    const w = worst(res);
    const pens = maxPen(w), fails = failedCon(w);
    const pmax = pens[0]?.[1].max ?? 0;
    const pass = pmax <= THRESH.penetrationMm && !fails.length && !w.ang.out.length && w.ang.step <= THRESH.stepDeg && !w.flips.length;
    inter.push({
      name, pass, frames: res.reduce((a, r) => a + (r.frames || 0), 0),
      pen: pens.slice(0, 4).map(([o, v]) => `${o} ${v.max.toFixed(1)} (p99 ${v.p99.toFixed(1)})`).join(', ') || '0',
      penMax: pmax,
      contacts: fails.map(([id, c]) => `${id}: ${c.worst === Infinity ? 'none' : c.worst.toFixed(1)} mm (${c.fail}/${c.n} frames)`),
      joints: w.ang.out.length, jointFirst: w.ang.out.slice(0, 3), step: +w.ang.step.toFixed(1), stepAt: w.ang.stepAt, flips: w.flips.length,
      increments: MOVING[name] ? MOVING[name].map((ph) => `${ph} ${P[ph]?.increments ?? '-'}`).join(', ') : null,
    });
  }
  // per test
  const wAll = worst(all);
  if (want('penetration')) {
    const pens = maxPen(wAll);
    const bad = pens.filter(([, v]) => v.max > THRESH.penetrationMm);
    rows.push(['1 penetration', !bad.length, bad.length ? `${bad.length} objects over ${THRESH.penetrationMm} mm; worst ${bad[0][0]} ${bad[0][1].max.toFixed(1)} mm (${bad[0][1].src}, ${bad[0][1].at})` : `max ${pens[0]?.[1].max.toFixed(2) ?? 0} mm`]);
  }
  if (want('contact')) {
    const fails = failedCon(worst([...Object.values(holds), ...Object.values(P)]));
    rows.push(['2 contact', !fails.length, fails.length ? `${fails.length} contacts out of tolerance; e.g. ${fails[0][0]} ${fails[0][1].worst === Infinity ? 'none' : fails[0][1].worst.toFixed(1) + ' mm'} (${fails[0][1].src})` : 'all within tolerance']);
  }
  if (want('motion') && !D.focus) {
    const bad = [];
    for (const [name, phs] of Object.entries(MOVING)) for (const ph of phs) {
      const r = P[ph];
      if (!r) { bad.push(`${ph} not run`); continue; }
      const w = worst([r]);
      const pm = maxPen(w)[0]?.[1].max ?? 0, cf = failedCon(w).length;
      if ((r.increments ?? 0) < 100) bad.push(`${ph}: only ${r.increments} steps`);
      if (pm > THRESH.penetrationMm || cf || w.ang.out.length || w.ang.step > THRESH.stepDeg) bad.push(`${ph}: pen ${pm.toFixed(1)} mm, ${cf} contacts, ${w.ang.out.length} joints out, step ${w.ang.step.toFixed(0)}°`);
    }
    rows.push(['3 motion range', !bad.length, bad.length ? bad.slice(0, 3).join('; ') + (bad.length > 3 ? ` (+${bad.length - 3})` : '') : 'every movement clean through its travel']);
  }
  if (want('joints')) {
    const n = wAll.ang.out.length;
    rows.push(['4 joint angles', !n && wAll.ang.step <= THRESH.stepDeg && !wAll.flips.length, `${n} joints out of range${n ? ' (e.g. ' + wAll.ang.out[0] + ')' : ''}; fastest ${wAll.ang.step.toFixed(1)}°/frame (${wAll.ang.stepAt}); ${wAll.flips.length} roll flips`]);
  }
  if (want('twist') && D.twist) {
    const inRange = D.twist.rows.filter((r) => r.turn >= D.twist.range[0] - 1e-6 && r.turn <= D.twist.range[1] + 1e-6);
    const worstR = inRange.reduce((a, r) => (r.minRatio < a.minRatio ? r : a), { minRatio: Infinity });
    const nf = Math.max(0, ...inRange.map((r) => r.newFlips)), fa = Math.max(0, ...inRange.map((r) => r.flipArea || 0));
    const angles = inRange.filter((r) => r.newFlips).length;
    rows.push(['5 skin twist', worstR.minRatio >= THRESH.twistFloor && !nf, `narrowest ${(worstR.minRatio * 100).toFixed(0)}% of rest width (turn ${worstR.turn}°, ${Math.round(worstR.at * 1000)} mm from the wrist); triangles turned over at ${angles} of ${inRange.length} angles, at most ${nf} at once, the largest ${fa} mm²; forearm turn reached ${Math.min(...D.twist.rows.map((r) => r.turn))}..${Math.max(...D.twist.rows.map((r) => r.turn))}°`]);
  }
  if (want('fuzz') && D.sweeps) {
    const res = [...Object.values(D.sweeps), ...(D.nudges || []).map((n) => n.res)];
    const w = worst(res), pm = maxPen(w)[0], cf = failedCon(w);
    const ok = (!pm || pm[1].max <= THRESH.penetrationMm) && !cf.length && !w.ang.out.length;
    rows.push(['6 fuzz', ok, `${res.reduce((a, r) => a + r.frames, 0)} placements/frames; worst ${pm ? pm[0] + ' ' + pm[1].max.toFixed(1) + ' mm (' + pm[1].src + ')' : 'none'}; ${cf.length} contacts failing; ${w.ang.out.length} joints out`]);
  }
  if (want('stability') && !D.focus) {
    const still = Object.entries(holds).map(([p, h]) => [p, h.stillMm]).concat(D.duskStill ? [['lean (breathing)', D.duskStill.lean], ['chair (breathing)', D.duskStill.chair]] : []);
    const moving = still.filter(([, v]) => v > THRESH.holdMm);
    const same = D.repeat ? D.repeat[0] === D.repeat[1] : null;
    rows.push(['7 stability', !moving.length && same !== false, `held hands move ${Math.max(0, ...still.map(([, v]) => v)).toFixed(4)} mm/frame at most${moving.length ? ' (' + moving.map(([p, v]) => p + ' ' + v).join(', ') + ')' : ''}; repeat runs ${same == null ? 'not run' : same ? 'identical' : 'DIFFER'}; solver iterations: no solver yet`]);
  }
  if (want('speed') && D.speed) {
    const worstMean = Math.max(...['write', 'lamp', 'mug', 'lean'].map((p) => D.speed[p].mean));
    const base = readJson('baseline')?.skinBuild?.mainThreadMs;
    const grow = base ? D.skinBuild.mainThreadMs / base : 1;
    rows.push(['8 speed', worstMean <= BUDGET.handsMs && grow <= BUDGET.skinBuildGrowth, `hands update ${worstMean.toFixed(3)} ms/frame worst mean (budget ${BUDGET.handsMs} ms, proposed); skin build ${D.skinBuild.mainThreadMs} ms here, ${D.skinBuild.worker.mesh + D.skinBuild.worker.skin} ms in the worker${base ? ` (baseline ${base} ms)` : ''}`]);
  }
  if (want('visual') && !D.focus) rows.push(['9 visual', !!D.overlayKey, `overlay key O ${D.overlayKey ? 'works' : 'FAILED'}; ${D.shots ? `contact sheet ${D.shots.sheet}, joint plots ${D.shots.plot}` : 'sheets and plots not rendered (--shots)'}`]);
  return { rows, inter };
}

function readJson(label) {
  const f = path.join(ROOT, 'docs/hands-check', label + '.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

// the same tables as Markdown, for REPORT and pull requests (docs/hands-check/<label>.md)
function markdown(J, D) {
  const esc = (x) => String(x).replace(/\|/g, '/');
  const md = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
  const out = [`# Hands check: ${LABEL}`, '', `Thresholds: penetration ${THRESH.penetrationMm} mm, grip ${THRESH.gripMm} mm, rest ${THRESH.restMm} mm, nib ${THRESH.nibMm} mm, ${THRESH.stepDeg}° a frame at 30 fps, twist floor ${THRESH.twistFloor * 100}%, held ${THRESH.holdMm} mm.`, '', '## Tests', '',
    md(['test', 'result', 'detail'], J.rows.map(([n, p, d]) => [n, p ? 'pass' : '**FAIL**', d])), '', '## Interactions', '',
    md(['interaction', 'result', 'frames', 'worst penetration, mm (p99 of frames)', 'contacts out of tolerance', 'joints out of range', 'fastest joint, °/frame', 'steps of travel'],
      J.inter.map((r) => [r.name, r.pass ? 'pass' : '**FAIL**', r.frames, r.pen, r.contacts.length, r.joints, r.step, r.increments || ''])), ''];
  for (const r of J.inter) if (!r.pass) {
    out.push(`### ${r.name}`, '');
    for (const c of r.contacts) out.push(`- contact: ${c}`);
    for (const j of r.jointFirst) out.push(`- joint: ${j}`);
    if (r.stepAt) out.push(`- fastest: ${r.stepAt}`);
    out.push('');
  }
  if (D.errors?.length) out.push(`${D.errors.length} console errors; first: ${D.errors[0]}`, '');
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------
function table(head, rows) {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ');
  return [line(head), w.map((n) => '-'.repeat(n)).join('  '), ...rows.map(line)].join('\n');
}

async function main() {
  const t0 = Date.now();
  let D;
  if (REPORT) {
    D = readJson(REPORT);
    if (!D) throw new Error(`no docs/hands-check/${REPORT}.json`);
    errors.push(...(D.errors || []));
  } else {
    const srv = await serve();
    base = `http://localhost:${srv.port}`;
    const pw = await playwright();
    browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
      D = await measureAll();
      if (SHOTS) D.shots = await shots(D);
    } finally {
      await browser.close();
      srv.proc.kill();
    }
  }
  D.errors = errors;
  D.thresholds = THRESH;
  D.budget = BUDGET;
  const J = judge(D);
  D.summary = J;
  fs.mkdirSync(path.join(ROOT, 'docs/hands-check'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs/hands-check', LABEL + '.json'), JSON.stringify(D));
  fs.writeFileSync(path.join(ROOT, 'docs/hands-check', LABEL + '.md'), markdown(J, D));
  console.log('\nInteractions (penetration mm: object max (p99 of frames); contacts out of tolerance; joints out of range; fastest joint °/frame at 30 fps)\n');
  console.log(table(['interaction', 'pass', 'frames', 'penetration (mm)', 'contacts failing', 'joints out', 'fastest °', 'steps of travel'],
    J.inter.map((r) => [r.name, r.pass ? 'PASS' : 'FAIL', r.frames, r.pen, r.contacts.length, r.joints, r.step, r.increments || ''])));
  for (const r of J.inter) if (!r.pass) {
    console.log(`\n${r.name}:`);
    for (const c of r.contacts) console.log('  contact  ' + c);
    for (const j of r.jointFirst) console.log('  joint    ' + j);
    if (r.stepAt) console.log('  fastest  ' + r.stepAt);
  }
  console.log('\nTests\n');
  console.log(table(['test', 'pass', 'detail'], J.rows.map(([n, p, d]) => [n, p ? 'PASS' : 'FAIL', d])));
  if (errors.length) console.log(`\n${errors.length} console errors, first: ${errors[0]}`);
  console.log(`\nwritten docs/hands-check/${LABEL}.json in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(J.rows.every((r) => r[1]) && !errors.length ? 0 : 1);
}

// ---------------------------------------------------------------------------------------------------
// The visual aids: contact sheets from fixed studio cameras, with the overlay's x-ray on, and the
// joint-angle plots of each moving interaction. Saved into docs/screenshots.
// [interaction, pose, studio view round the wrist, prop part-way]
const VIEWS = [
  ['resting beside the book, left hand', 'lean', { hand: 'L', az: 1.57, el: 0.1, dist: 0.3 }],
  ['resting beside the book, right hand', 'lean', { hand: 'R', az: -1.57, el: 0.1, dist: 0.3 }],
  ['pencil: ready', 'ready', { hand: 'R', az: -1.3, el: 0.2, dist: 0.3 }],
  ['pencil: writing', 'write', { hand: 'R', az: 1.3, el: 0.4, dist: 0.3 }],
  ['quill: drawing', 'pen', { hand: 'R', az: 1.3, el: 0.4, dist: 0.3 }],
  ['inkwell carried in', 'ink-well', { hand: 'R', az: 1.57, el: 0.25, dist: 0.32 }],
  ['quill taken from the well', 'ink-take', { hand: 'R', az: -1.57, el: 0.25, dist: 0.32 }],
  ['page turn', 'turn', { hand: 'R', az: 1.57, el: 0.3, dist: 0.34 }],
  ['cover lifted', 'close', { hand: 'L', az: -1.57, el: 0.2, dist: 0.34 }],
  ['lamp lever, at rest', 'lamp', { hand: 'R', az: 1.57, el: 0.0, dist: 0.3 }],
  ['lamp lever, half pulled', 'lamp', { hand: 'R', az: 1.57, el: 0.0, dist: 0.3 }, 'lever'],
  ['lamp lever, pulled down', 'lamp', { hand: 'R', az: 1.57, el: 0.0, dist: 0.3 }, 'lever-down'],
  ['door ring', 'door', { hand: 'R', az: 1.57, el: 0.2, dist: 0.32 }],
  ['mug', 'mug', { hand: 'R', az: -0.6, el: 0.4, dist: 0.42 }],
  ['stair rail', 'rail', { hand: 'R', az: 1.57, el: 0.2, dist: 0.32 }],
  ['chair arms', 'chair', { hand: 'R', az: 1.57, el: 0.1, dist: 0.42 }],
];
const CAMS = path.join(ROOT, 'docs/hands-check/cameras.json');

async function shots(D) {
  const p = await page(DUSK);
  const cams = fs.existsSync(CAMS) ? JSON.parse(fs.readFileSync(CAMS, 'utf8')) : {};
  const tiles = [];
  for (const [label, pose, view, setup] of VIEWS) {
    const key = label + ' | ' + pose;
    const r = await evalIn(p, (o) => window.__handcheck.shot(o), { pose, ...view, setup, cam: cams[key] || null });
    cams[key] = r.cam;
    tiles.push({ label, url: r.url, pen: r.pen });
  }
  fs.writeFileSync(CAMS, JSON.stringify(cams, null, 1));
  await evalIn(p, COMPOSE);
  const sheet = await evalIn(p, ({ tiles, title }) => window.compose(tiles, title), { tiles, title: `The hands against the room (${LABEL}): skin inside anything is red, colliders outlined` });
  const sheetFile = `${SHOT_PREFIX}-contact-sheet-${LABEL}.jpg`;
  fs.writeFileSync(path.join(ROOT, 'docs/screenshots', sheetFile), Buffer.from(sheet.split(',')[1], 'base64'));
  // joint angles against time, one panel per moving interaction
  const P = phasesOf(D);
  const panels = [['turn back', 'R', 'page turned back'], ['turn forward', 'R', 'page turned forward'], ['ink', 'R', 'inking: pencil down, inkwell in, quill out, dip, draw, back'], ['lamp', 'R', 'the lamp lever pulled'], ['mug', 'R', 'the mug to the lap and back'], ['close', 'L', 'the cover lifted and let fall'], ['door', 'R', 'the door ring taken and pulled'], ['stairs', 'R', 'up the stairs, hand on the rail']]
    .filter(([ph]) => P[ph]?.series).map(([ph, side, title]) => ({ title, side, keys: P[ph].series.keys, t: P[ph].series.t, v: P[ph].series.v }));
  await evalIn(p, PLOT);
  const plot = await evalIn(p, ({ panels, title }) => window.plotPanels(panels, title), { panels, title: `Joint angles over each moving interaction (${LABEL})` });
  const plotFile = `${SHOT_PREFIX}-joint-plots-${LABEL}.png`;
  fs.writeFileSync(path.join(ROOT, 'docs/screenshots', plotFile), Buffer.from(plot.split(',')[1], 'base64'));
  await p.close();
  return { sheet: sheetFile, plot: plotFile, tiles: tiles.map((t) => ({ label: t.label, pen: t.pen })) };
}

// tiles in a grid, each labelled with its interaction and the worst penetration in that frame
const COMPOSE = () => {
  window.compose = async (tiles, title) => {
    const cols = 4, w = 480, h = 360, pad = 8, head = 44, foot = 40;
    const rows = Math.ceil(tiles.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (w + pad) + pad; c.height = head + rows * (h + foot + pad) + pad;
    const x = c.getContext('2d');
    x.fillStyle = '#fcfcfb'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#0b0b0b'; x.font = '600 20px sans-serif'; x.fillText(title, pad, 29);
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i], cx = pad + (i % cols) * (w + pad), cy = head + Math.floor(i / cols) * (h + foot + pad);
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = t.url; });
      x.drawImage(img, cx, cy, w, h);
      x.fillStyle = '#0b0b0b'; x.font = '600 15px sans-serif'; x.fillText(t.label, cx, cy + h + 17);
      const worst = Object.entries(t.pen).sort((a, b) => b[1] - a[1]).slice(0, 3);
      x.fillStyle = '#52514e'; x.font = '13px sans-serif';
      x.fillText(worst.length ? 'inside: ' + worst.map(([o, d]) => `${o} ${d} mm`).join(', ') : 'nothing inside anything', cx, cy + h + 34);
    }
    return c.toDataURL('image/jpeg', 0.86);
  };
};

// Small multiples: per panel the active hand's elbow, forearm turn and wrist bend over time (one axis,
// degrees), the span in which the prop moves shaded, the forearm's ±80° limit dashed, lines labelled at
// their ends. Colours: the reference categorical palette's first three slots (validated all-pairs).
const PLOT = () => {
  window.plotPanels = (panels, title) => {
    const S = [['elbow.flex', 'elbow bend', '#2a78d6'], ['forearm.turn', 'forearm turn', '#eb6834'], ['wrist.ext', 'wrist bend (back +)', '#1baf7a']];
    const cols = 2, pw = 760, ph = 300, pad = 24, head = 70;
    const rows = Math.ceil(panels.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (pw + pad) + pad; c.height = head + rows * (ph + pad) + pad;
    const x = c.getContext('2d');
    const ink = '#0b0b0b', ink2 = '#52514e', muted = '#8a8984', grid = '#e6e5e0';
    x.fillStyle = '#fcfcfb'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = ink; x.font = '600 20px sans-serif'; x.fillText(title, pad, 30);
    // legend
    let lx = pad;
    x.font = '14px sans-serif';
    for (const [, name, col] of S) { x.fillStyle = col; x.fillRect(lx, 46, 18, 3); x.fillStyle = ink2; x.fillText(name, lx + 24, 52); lx += 24 + x.measureText(name).width + 22; }
    x.fillStyle = 'rgba(82,81,78,0.12)'; x.fillRect(lx, 42, 18, 12); x.fillStyle = ink2; x.fillText('prop moving', lx + 24, 52);
    panels.forEach((P, i) => {
      const ox = pad + (i % cols) * (pw + pad), oy = head + Math.floor(i / cols) * (ph + pad);
      const L = 46, R = 96, T = 30, B = 34, W = pw - L - R, H = ph - T - B;
      const ki = (k) => P.keys.findIndex(([s, key]) => s === P.side && key === k);
      const pi = P.keys.findIndex(([, key]) => key === 'prop');
      const t0 = P.t[0], t1 = P.t[P.t.length - 1];
      let lo = -90, hi = 160;
      for (const [k] of S) for (const row of P.v) { const v = row[ki(k)]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
      lo = Math.floor(lo / 30) * 30; hi = Math.ceil(hi / 30) * 30;
      const X = (t) => ox + L + (t - t0) / Math.max(1e-6, t1 - t0) * W, Y = (v) => oy + T + (hi - v) / (hi - lo) * H;
      x.fillStyle = ink; x.font = '600 15px sans-serif'; x.fillText(P.title + (P.side === 'L' ? ' (left hand)' : ''), ox + L, oy + 18);
      // the prop's moving spans
      x.fillStyle = 'rgba(82,81,78,0.10)';
      for (let j = 1; j < P.v.length; j++) if (P.v[j][pi] !== P.v[j - 1][pi]) x.fillRect(X(P.t[j - 1]), oy + T, Math.max(1, X(P.t[j]) - X(P.t[j - 1])), H);
      // grid and axis
      x.strokeStyle = grid; x.lineWidth = 1; x.font = '12px sans-serif'; x.fillStyle = muted;
      for (let v = lo; v <= hi; v += 30) { x.beginPath(); x.moveTo(ox + L, Y(v)); x.lineTo(ox + L + W, Y(v)); x.stroke(); x.fillText(v + '°', ox + 6, Y(v) + 4); }
      for (let s = Math.ceil(t0 * 2) / 2; s <= t1; s += 0.5) x.fillText(s.toFixed(1) + ' s', X(s) - 12, oy + T + H + 18);
      // the forearm's anatomical limit
      x.strokeStyle = muted; x.setLineDash([4, 4]);
      for (const v of [-80, 80]) if (v >= lo && v <= hi) { x.beginPath(); x.moveTo(ox + L, Y(v)); x.lineTo(ox + L + W, Y(v)); x.stroke(); }
      x.setLineDash([]);
      x.fillStyle = muted; x.fillText('forearm limit ±80°', ox + L + 4, Y(Math.min(hi, 80)) - 4);
      // the lines, labelled at their ends
      const ends = [];
      for (const [k, name, col] of S) {
        const j = ki(k);
        x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
        P.v.forEach((row, n) => { const px = X(P.t[n]), py = Y(row[j]); if (n) x.lineTo(px, py); else x.moveTo(px, py); });
        x.stroke();
        ends.push([Y(P.v[P.v.length - 1][j]), name, col]);
      }
      ends.sort((a, b) => a[0] - b[0]);
      for (let n = 1; n < ends.length; n++) if (ends[n][0] - ends[n - 1][0] < 14) ends[n][0] = ends[n - 1][0] + 14;
      x.font = '12px sans-serif';
      for (const [y, name, col] of ends) { x.fillStyle = col; x.fillRect(ox + L + W + 6, y - 1, 8, 2); x.fillStyle = ink2; x.fillText(name.split(' (')[0], ox + L + W + 18, y + 4); }
    });
    return c.toDataURL('image/png');
  };
};

main().catch((e) => { console.error(e); process.exit(2); });
