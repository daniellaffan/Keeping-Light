// The bay as data: land, sea stacks, reefs, tide, projection, routes, collision, path-finding.
// Pure module (no DOM) so tools/check-nights.mjs can run it under node.

export const WORLD = { w: 100, h: 60 };
export const HARBOUR = [90, 12.5];      // harbour mouth (the target on ordinary nights)
export const HARBOUR_IN = [90, 7.2];    // where ships glide to after arriving
export const MAGMELL = [-1, 9];         // the little island at the chart's west edge
export const LIGHTHOUSE = [12.5, 53.6];

export const SIZES = {
  small: { r: 0.9, label: 'small', scale: 0.8 },
  medium: { r: 1.35, label: 'middling', scale: 1.0 },
  large: { r: 2.0, label: 'large', scale: 1.35 },
};

function ell(cx, cy, rx, ry, n = 14, rot = 0, jag = 0.12, seed = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(a * 3 + seed) * jag + Math.cos(a * 5 + seed * 2) * jag * 0.6;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}
function chain(x0, y0, x1, y1, w, n = 5, seed = 1) {
  // a ragged band of rock between two points
  const pts = [];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  for (let i = 0; i <= n; i++) {
    const t = i / n, k = w * (0.7 + 0.5 * Math.abs(Math.sin(i * 1.7 + seed)));
    pts.push([x0 + dx * t + nx * k, y0 + dy * t + ny * k]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n, k = w * (0.7 + 0.5 * Math.abs(Math.cos(i * 2.3 + seed)));
    pts.push([x0 + dx * t - nx * k, y0 + dy * t - ny * k]);
  }
  return pts;
}

export const LAND = {
  north: [
    [-2, -40], [-1.5, -6], [-1, 0], [0.5, 4], [2, 8], [4.5, 11.5], [7.5, 13.8], [10.5, 13.2], [13, 10.6],
    [16, 8.9], [20, 8], [26, 6.6], [33, 6.1], [40, 5.2], [48, 4.6], [56, 5.1], [63, 4.2], [70, 3.6],
    [76, 4.4], [80, 5.8], [84, 6.6], [86.5, 6.2], [88, 4.4], [92, 4.0], [94.5, 5.5], [96, 8], [98, 11.5],
    [100, 16], [101.5, 22], [130, 22], [130, -40],
  ],
  south: [
    [-14, 64], [-6, 61.5], [-2, 60.2], [2, 58.6], [5, 56.2], [8, 53.6], [11, 51.6], [14.5, 50.6], [18.5, 51],
    [22.5, 53], [27, 55.4], [32, 56.8], [38, 58.2], [44, 57.8], [52, 58.8], [60, 57.8], [68, 58.4],
    [76, 56.9], [85, 57.3], [92, 55.8], [97.5, 53.6], [100.5, 48], [101.8, 40], [101.6, 30], [101.5, 22],
    [130, 22], [130, 90], [-14, 90],
  ],
};

// little piers at the harbour — drawn, not collided
export const PIERS = [
  [[85.6, 7.0], [86.8, 6.6], [88.2, 11.6], [87.2, 12.1]],
  [[95.0, 7.2], [96.2, 7.8], [93.6, 12.3], [92.6, 12.0]],
];

export const STACKS = [
  { id: 'stack1', poly: ell(3.4, 19.2, 1.6, 1.4, 12, 0.3, 0.15, 2), h: 1.2 },
  { id: 'stack2', poly: ell(6.6, 23.6, 1.0, 0.9, 10, 0.1, 0.15, 5), h: 0.9 },
  { id: 'stack3', poly: ell(-4.5, 34.5, 1.4, 1.2, 12, 0.5, 0.15, 7), h: 1.3 },
  { id: 'stack4', poly: ell(21.2, 46.6, 1.1, 0.9, 10, 0.2, 0.15, 3), h: 0.8 },
];

// tide: 'always' reefs bite at every tide; 'mid' at mid and low water; 'low' only at low water
export const REEFS = {
  black: { name: 'An Charraig Dhubh', tide: 'always', poly: ell(46, 24, 5.6, 3.4, 16, -0.25, 0.14, 1) },
  sisterA: { name: 'the Sisters', tide: 'always', poly: ell(32.6, 33.6, 2.3, 1.9, 12, 0.2, 0.16, 4) },
  sisterB: { name: '', tide: 'always', poly: ell(37.6, 29.4, 1.9, 1.6, 12, 0.6, 0.16, 6) },
  tooth: { name: 'the Tooth', tide: 'always', poly: ell(23.5, 38.5, 1.8, 1.5, 12, 0.1, 0.16, 8) },
  gull: { name: 'Gull Ledge', tide: 'always', poly: ell(71, 21.5, 4.2, 2.3, 14, 0.15, 0.14, 2) },
  lip: { name: 'the Lip', tide: 'always', poly: ell(81.5, 18.8, 1.7, 1.3, 12, 0.4, 0.16, 9) },
  comb: { name: 'the Comb', tide: 'mid', poly: chain(55, 37, 66.5, 30.5, 1.3, 6, 3) },
  pan: { name: 'the Pan', tide: 'low', poly: ell(40, 43, 3.6, 2.0, 14, -0.1, 0.12, 5) },
  bar: { name: 'the Bar', tide: 'low', poly: chain(60.5, 15.0, 78, 15.5, 1.6, 7, 5) },
  flats: { name: 'the Flats', tide: 'low', poly: ell(56, 51.5, 9, 2.4, 16, 0.05, 0.1, 7) },
  newrock: { name: '', tide: 'always', poly: ell(52, 43.5, 2.4, 1.8, 12, 0.3, 0.18, 11) },
  narrows: { name: 'the Knuckles', tide: 'mid', poly: chain(28, 22, 30, 15, 1.4, 4, 2) },
  spit: { name: 'the Spit', tide: 'always', poly: chain(84, 26, 92, 23, 1.4, 4, 8) },
  rakes: { name: 'the Rakes', tide: 'always', poly: chain(45.4, 3.5, 46.6, 19.8, 0.95, 6, 4) },
};

export function reefActive(reef, tide) {
  if (reef.tide === 'always') return true;
  if (reef.tide === 'mid') return tide === 'mid' || tide === 'low';
  return tide === 'low';
}

// ---------- projection to the night view (mild perspective, looking north over the bay) ----------
export const VIEW = { farY: 352, nearY: 900, farS: 10.6, nearS: 17.8, cx: 800, xc: 44 };
export function project(x, y) {
  const t = y / WORLD.h;
  const p = Math.sign(t) * Math.pow(Math.abs(t), 1.15);
  const sy = VIEW.farY + p * (VIEW.nearY - VIEW.farY);
  const s = VIEW.farS + (VIEW.nearS - VIEW.farS) * t;
  return [VIEW.cx + (x - VIEW.xc) * s, sy, s / VIEW.nearS];
}
export function unproject(sx, sy) {
  // invert y first (monotonic), then x
  let lo = -2, hi = 3;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (project(0, m * WORLD.h)[1] < sy) lo = m; else hi = m;
  }
  const y = ((lo + hi) / 2) * WORLD.h;
  const s = VIEW.farS + (VIEW.nearS - VIEW.farS) * (y / WORLD.h);
  return [(sx - VIEW.cx) / s + VIEW.xc, y];
}

// ---------- geometry ----------
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
export function polyDist(x, y, poly) {
  if (pointInPoly(x, y, poly)) return -1;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  return d;
}
function bbox(poly) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of poly) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}

// Obstacles for a night: land + stacks + active reefs (each with a bbox for quick rejects).
export function obstacles(night) {
  const list = [];
  const add = (id, poly, kind) => list.push({ id, poly, kind, bb: bbox(poly) });
  add('north', LAND.north, 'land');
  add('south', LAND.south, 'land');
  for (const s of STACKS) add(s.id, s.poly, 'stack');
  for (const id of night.reefs || []) {
    const r = REEFS[id];
    if (r && reefActive(r, night.tide)) add(id, r.poly, 'reef');
  }
  return list;
}

export function clearance(x, y, obs) {
  let best = Infinity, hit = null;
  for (const o of obs) {
    const [a, b, c, d] = o.bb;
    if (x < a - 6 || x > c + 6 || y < b - 6 || y > d + 6) continue;
    const dd = polyDist(x, y, o.poly);
    if (dd < best) { best = dd; hit = o; }
  }
  return { d: best, obstacle: hit };
}

// ---------- routes ----------
// Polyline with rounded corners (quadratic fillet at each interior point), densely sampled.
export function routePath(points, step = 0.5) {
  const P = points;
  if (P.length < 2) return P.slice();
  const out = [P[0]];
  const pushLine = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let i = 1; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)]);
  };
  let cur = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.min(4.5, l1 * 0.45, l2 * 0.45);
    const A = [b[0] + ((a[0] - b[0]) / (l1 || 1)) * r, b[1] + ((a[1] - b[1]) / (l1 || 1)) * r];
    const B = [b[0] + ((c[0] - b[0]) / (l2 || 1)) * r, b[1] + ((c[1] - b[1]) / (l2 || 1)) * r];
    pushLine(cur, A);
    const n = Math.max(2, Math.ceil((r * 2) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * A[0] + 2 * u * t * b[0] + t * t * B[0], u * u * A[1] + 2 * u * t * b[1] + t * t * B[1]]);
    }
    cur = B;
  }
  pushLine(cur, P[P.length - 1]);
  return out;
}

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

export function routeFor(night, waypoints, entry) {
  return [entry, ...waypoints, night.target];
}

// Ink used: the route from the first entry through every waypoint to the target.
export function inkUsed(night, waypoints) {
  return polyLength(routeFor(night, waypoints, night.entries[0]));
}

// Simulate a ship along its route. Returns the sampled path actually sailed and whether it struck.
export function simulate(night, waypoints, entry, size, opts = {}) {
  const obs = opts.obs || obstacles(night);
  const r = SIZES[size].r;
  const base = routePath(routeFor(night, waypoints, entry), 0.35);
  const cur = night.current;
  const path = [];
  let ox = 0, oy = 0;
  let struck = null;
  let dist = 0;
  for (let i = 0; i < base.length; i++) {
    if (i > 0) {
      const ds = Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]);
      dist += ds;
      if (cur) {
        const d = Math.hypot(base[i][0] - cur.x, base[i][1] - cur.y);
        const k = Math.max(0, 1 - d / cur.r);
        ox += cur.dx * ds * k * k * 0.14 * cur.strength;
        oy += cur.dy * ds * k * k * 0.14 * cur.strength;
        if (k === 0) { const f = Math.exp(-ds / 7); ox *= f; oy *= f; }
      }
    }
    const p = [base[i][0] + ox, base[i][1] + oy];
    path.push(p);
    // don't test the first stretch off-chart before the ship is properly in the bay
    if (dist < 0.6) continue;
    // the last little bit into the harbour mouth is always safe
    const tgt = night.target;
    if (Math.hypot(p[0] - tgt[0], p[1] - tgt[1]) < 3.2) continue;
    const c = clearance(p[0], p[1], obs);
    if (c.d < r) { struck = { index: i, at: p, obstacle: c.obstacle ? c.obstacle.id : null }; break; }
  }
  return { path, struck, length: polyLength(path) };
}

// Where along the planned line would the biggest ship tonight scrape? (for the pencil "?" hints)
export function hazards(night, waypoints) {
  const sizes = night.ships.map((s) => s.size);
  const big = sizes.includes('large') ? 'large' : sizes.includes('medium') ? 'medium' : 'small';
  const obs = obstacles(night);
  const marks = [];
  for (const e of night.entries) {
    const sim = simulate(night, waypoints, e, big, { obs });
    if (sim.struck) marks.push(sim.struck.at);
  }
  return marks;
}

// ---------- path-finding (for auto-plan and the old keeper's neat plans) ----------
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
export function autoPlan(night, { margin = 0.9, res = 0.5 } = {}) {
  const sizes = night.ships.map((s) => s.size);
  const big = sizes.includes('large') ? 'large' : sizes.includes('medium') ? 'medium' : 'small';
  const obs = obstacles(night);
  const R = SIZES[big].r + margin;
  const x0 = -10, x1 = 104, y0 = -4, y1 = 62;
  const W = Math.ceil((x1 - x0) / res), H = Math.ceil((y1 - y0) / res);
  const free = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i * res, y = y0 + j * res;
    free[j * W + i] = clearance(x, y, obs).d > R ? 1 : 0;
  }
  const toCell = (p) => [Math.round((p[0] - x0) / res), Math.round((p[1] - y0) / res)];
  const fromCell = (i, j) => [x0 + i * res, y0 + j * res];
  const entry = night.entries[0];
  const [si, sj] = toCell(entry), [ti, tj] = toCell(night.target);
  // allow the start/target cells even if near land
  const ok = (i, j) => i >= 0 && j >= 0 && i < W && j < H && (free[j * W + i] || (Math.abs(i - ti) < 7 && Math.abs(j - tj) < 7) || (Math.abs(i - si) < 3 && Math.abs(j - sj) < 3));
  const g = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const heap = new MinHeap();
  heap.push(0, sj * W + si);
  g[sj * W + si] = 0;
  const hfn = (i, j) => Math.hypot(i - ti, j - tj);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false;
  while (heap.size) {
    const c = heap.pop();
    if (closed[c]) continue;
    closed[c] = 1;
    const ci = c % W, cj = (c / W) | 0;
    if (ci === ti && cj === tj) { found = true; break; }
    for (const [di, dj] of dirs) {
      const ni = ci + di, nj = cj + dj;
      if (!ok(ni, nj)) continue;
      const ng = g[c] + Math.hypot(di, dj);
      const nc = nj * W + ni;
      if (ng < g[nc]) {
        g[nc] = ng; came[nc] = c;
        heap.push(ng + hfn(ni, nj), nc);
      }
    }
  }
  if (!found) return null;
  const cells = [];
  let c = tj * W + ti;
  while (c !== -1) { cells.push(fromCell(c % W, Math.floor(c / W))); c = came[c]; }
  cells.reverse();
  // string-pull: keep a point only when the straight line to the next kept point isn't clear
  const clearLine = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(L / 0.4);
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      if (Math.hypot(x - night.target[0], y - night.target[1]) < 3.2) continue;
      if (Math.hypot(x - entry[0], y - entry[1]) < 0.6) continue;
      if (clearance(x, y, obs).d <= R) return false;
    }
    return true;
  };
  const pts = [entry];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !clearLine(cells[i], cells[j])) j--;
    pts.push(cells[j]);
    i = j;
  }
  const wps = pts.slice(1, -1).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  return wps;
}

// Check a plan against every ship tonight.
export function checkPlan(night, waypoints) {
  const obs = obstacles(night);
  const res = night.ships.map((s, k) => {
    const e = night.entries[k % night.entries.length];
    return simulate(night, waypoints, e, s.size, { obs });
  });
  return { ok: res.every((r) => !r.struck), res };
}

// A neat plan that works for every ship: try path-finding with growing margins.
export function solve(night) {
  for (const m of [0.9, 1.3, 0.6, 1.8, 0.4, 2.4]) {
    const wps = autoPlan(night, { margin: m });
    if (wps && wps.length <= night.maxPoints && checkPlan(night, wps).ok && inkUsed(night, wps) <= night.inkBudget) return wps;
  }
  for (const m of [0.9, 1.3, 0.6, 1.8]) {
    const wps = autoPlan(night, { margin: m });
    if (wps && checkPlan(night, wps).ok) return wps;
  }
  return null;
}
