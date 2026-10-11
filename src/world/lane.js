// The lane round the bay, in chart units: from the tower door east along the south headland, round the
// head of the bay, and back west behind the village to the cottages. Short spurs lead off it to the
// places that aren't on it. It's worn into the grass (bay.js tints the terrain along it), and autoplay
// walks it.
export const LANE = [
  [13.2, 54.8], [16, 57.2], [22, 60], [30, 61.8], [38, 61.4], [46, 62.2], [56, 62.6], [66, 62.4], [76, 61.8],
  [86, 61.4], [94, 59.6], [100, 56], [105, 50], [107, 41], [107, 32], [106, 24], [104.5, 17], [102, 10],
  [100, 4], [98, -1], [95, -4.5], [92, -6.5], [86, -5], [80, -4], [74, -2], [68, -3.5], [62, -5.5],
];

// spurs: { from: index on the lane, pts }
export const SPURS = {
  shed: { from: 1, pts: [[16, 57.2], [17.4, 56.4]] },
  cliff: { from: 4, pts: [[38, 61.4], [40, 59.9]] },
  harbour: { from: 22, pts: [[86, -5], [89, -4.4], [89.5, -0.5], [90, 2.2]] },
};

// distance from a chart point to the nearest piece of a polyline
export function polyDist(x, y, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-9)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return d;
}

export function laneDist(x, y) {
  let d = polyDist(x, y, LANE);
  for (const s of Object.values(SPURS)) d = Math.min(d, polyDist(x, y, s.pts));
  return d;
}

// the nearest vertex index on the lane
export function nearestOnLane(x, y) {
  let best = 0, bd = Infinity;
  LANE.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
  return best;
}

// a walk along the lane from near (x, y) to a place's approach (a lane index, then its spur if it has one)
export function routeTo(x, y, toIndex, spur = null) {
  const i0 = nearestOnLane(x, y);
  const out = [];
  const step = toIndex >= i0 ? 1 : -1;
  for (let i = i0; i !== toIndex + step; i += step) out.push(LANE[i]);
  if (spur) out.push(...SPURS[spur].pts.slice(1));
  return out;
}
