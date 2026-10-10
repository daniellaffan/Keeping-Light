// node tools/check-nights.mjs — validates that every night is solvable and that the naive
// straight line is (usually) not, so the puzzle has something in it.
import { NIGHTS } from '../src/game/nights.js';
import { solve, checkPlan, inkUsed } from '../src/game/chart.js';

let bad = 0;
for (const n of NIGHTS) {
  const t0 = Date.now();
  const wps = solve(n);
  const straight = checkPlan(n, []);
  const ok = !!wps && checkPlan(n, wps).ok;
  const ink = wps ? inkUsed(n, wps).toFixed(0) : '-';
  const within = wps ? wps.length <= n.maxPoints && inkUsed(n, wps) <= n.inkBudget : false;
  if (!ok || !within) bad++;
  console.log(
    `night ${String(n.id).padStart(2)} ${n.tide.padEnd(4)} ships=${n.ships.length} ` +
    `solved=${ok ? 'yes' : 'NO '} pts=${wps ? wps.length : '-'}/${n.maxPoints} ink=${ink}/${n.inkBudget} ` +
    `straight=${straight.ok ? 'CLEAR (easy)' : 'blocked'} ${within ? '' : ' <-- over limits'} (${Date.now() - t0}ms)` +
    (wps ? '  ' + JSON.stringify(wps) : '')
  );
}
console.log(bad ? `\n${bad} night(s) need attention` : '\nall nights solvable within limits');
process.exit(bad ? 1 : 0);
