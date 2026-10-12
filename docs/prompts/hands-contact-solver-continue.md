# Continuing the hands contact solver (paste this into a new chat)

Repo: daniellaffan/Keeping-Light, branch `claude/wizardly-mendel-pt26zu` (work in progress is pushed there as a WIP commit; open or reuse the draft PR for it).

## Prompt for the new chat

Continue the hands contact-solver task from `docs/prompts/hands-contact-solver.md`. Read that brief first, then this file. Check out branch `claude/wizardly-mendel-pt26zu` (it has a WIP commit on top of main 0e4cfe0: the solver, not yet passing).

My rules still hold:
1. Numbers only. Never claim something works from screenshots alone; every PR lists what is not measured.
2. Never loosen a threshold to pass a test. If one looks wrong, ask me.
3. Fix one interaction at a time (resting beside the book, pencil, quill and inkwell, page turn, cover, lever, door, mug, rail, chair arms, walking), each with passing tests, and commit each.
4. If anything is ambiguous, ask me before guessing. If you are unsure of an answer, say so.
5. Keep: no shaking (held hand 0.000 mm/frame), hands never over the pages except the writing hand below-right of the tip, quill inking works, `node tools/check-nights.mjs` passes, 19-night autoplay ends `AUTOPLAY COMPLETE` with no console errors, `?view=classic` untouched, everything drawn in code, house code style (short plain-English header comments, no JSDoc).

Defaults I approved ("Okay continue"): forearm turn limited to ±80°, wrist share reported not gated; finger spread ±20°, thumb base gated only on palmar abduction 0–70°; remove sliver triangles in the mesher; contacts as defined in `src/world/contacts.js`; speed budget whole hands update < 1 ms/frame, skin build ≤ 10% slower; cover and page turn in scope, props don't react, tray split into its own object so it can be nudged.

## Where it stands

Done and merged earlier: Phase 0 harness (PR #4): `tools/check-hands.mjs`, `src/world/handcheck.js`, `colliders.js`, `anatomy.js`, `contacts.js`, baseline in `docs/hands-check/`.

Work in progress (uncommitted before the WIP commit), all around the "resting beside the book" interaction:
- `src/world/contact.js` (new): skin sample sets (heel, thenar, palm, fingers, thumb), `Obstacles`, `ContactSolver` (wrist push-out, heel anchor and turn about the heel, finger/thumb curl by bisection with rate limit `CURL_RATE`, stuck-finger fix-up, arm-bulk elbow cost).
- `src/world/hands.js`: solver wired in; follower now blends the carrying frame between the old and new pose; hand lifts over the table edge when going onto or off the book frame (`LIFT`); grip weight blends between poses; right resting hand moved to `[0.43, 0.024, 0.23]`.
- `src/world/colliders.js`: distance cutoffs for speed; thin-box and cylinder probes inset so they don't stand out past edges.
- `src/world/anatomy.js`: hinge joints now measured by swing-twist (`hingeOf`), fixing a false 254° "pipOff".
- `tools/check-hands.mjs`: `--focus NAME` runs one interaction; baseline files re-measured.

Last measurements (hold of `lean`): penetration max 0.73 mm; heels 0.35/0.23 mm and fingertips 0.28/0.20 mm from the table; off the pages 0; joints in range; still 0. Last lean-in trace: remaining over-2 mm cases are the left forearm crossing the table's front edge (about 3 mm) and a few transient frames; I was reading `elbowCost`/`armCost` in `hands.js` and `contact.js` to see why the elbow choice doesn't keep the forearm clear there.

Not yet done:
1. Re-run `node tools/check-hands.mjs --focus resting --label focus` until the resting row passes (including breathing stillness), then commit that step on its own.
2. Speed: `updateHands` about 2–3 ms median (budget 1 ms); walking frames are slower. Do not change the budget; if 1 ms is not honestly reachable, tell me.
3. Remove debug logging (`this.debug`, `st.log`) from `contact.js` before the final commit.
4. Remaining interactions in order, each with tests and its own commit. Known: lever twist (elbow 10°, forearm −115° at baseline), door ring, mug grip, rail, chair arms, page turn and cover choreography, ink grasp timing.
5. Finish: skin slivers, full run, check-nights, 19-night autoplay, classic view check, REPORT before/after, HANDOFF/DESIGN updates, screenshots 46+, PR text listing what is not measured.

Dev tips: dev server `nohup python3 tools/serve.py 8001`; harness runs headless Chromium via Playwright at `/opt/node-tools/node_modules/playwright`.

---
# Full detail (nothing left out that I know of)

## Process and conventions
- Original brief: `docs/prompts/hands-contact-solver.md` (in repo; read it in full). Also read README.md, DESIGN.md, REPORT.md, docs/HANDOFF.md.
- Game: first-person Three.js (r170, vendored, import map), watercolor look, everything drawn in code. Classic 2D view (`?view=classic`) must stay untouched.
- Commit messages end with the attribution lines the session gives; never put a model name in commits, PRs or code comments. Push with `git push -u origin <branch>`. After pushing, open a DRAFT PR if none is open for the branch (check for a PR template first), then subscribe to its activity. PR bodies end with the Claude Code footer the session gives. GitHub comments end with `_Generated by [Claude Code](https://claude.ai/code)_`. Do not push to other branches. If the PR for the branch is already merged, restart the branch from latest main (same name) instead of stacking on merged history.
- I said "If you are confident, commit and merge." Phase 0 was merged by me saying "merge". Ask before merging the solver PR unless every test passes and the not-measured list is written.
- My preferences: say so when unsure; ask me when information is missing.
- Status I last reported: phase 0 baseline confirmed the bugs (lever: elbow 10°, wrist 0.99 of limit, forearm -115°, thumb 26 mm into the ball; resting hands sunk into the table; grips late; tripod thumb IP -34°; breathing moved hands 0.38 mm/frame; hands over the pages). Re-measured baseline with newer checks: stability FAIL (lean 0.3845 mm/frame, chair 0.1153), 26 contacts failing incl. pages-clear.
- The six defaults I approved are listed above; "Okay continue" meant go with them.

## Test harness
- Runner: `node tools/check-hands.mjs` with `--focus NAME` (substring of an interaction name, e.g. `resting`, runs only that), `--label`, `--only`, `--quick`, `--shots`, `--shot-prefix`, `--jobs`, `--report`. Writes `docs/hands-check/<label>.json` and `.md`. Tests 1 penetration, 2 contact, 3 motion range, 4 joint angles, 5 skin twist, 6 fuzz, 7 stability, 8 speed, 9 visual overlay. Interactions list `INTERACTIONS` in that file.
- In-page module: `src/world/handcheck.js` (installed via `?debug=1`, `window.__handcheck`): `hold(pose,{frames,settle})`, `scenario('dusk'|'door'|'stairs'|'night',...)`, `sweep`, `nudged`, `twist`, `speed`, `skinBuild`, `shot`, `measure`, `selfTest`; overlay key O.
- Thresholds in `src/world/contacts.js` `THRESH`: penetration 2 mm, grip 1 mm, rest 2 mm, nib 0.5 mm, joint step 25°/frame, twist floor 0.7, hold 0.0005 mm/frame, pages 0 mm. Never loosen. Contacts and which poses/states each applies to are in `CONTACTS`, `STEADY`; solver grips are `GRIPS` (currently only resting hands).
- Running it myself: dev server `nohup python3 tools/serve.py 8001 &`; Playwright from `/opt/node-tools/node_modules/playwright`, launch args `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; stub `requestAnimationFrame`, seed `Math.random`, use `waitForFunction(..., {polling: 250})` (rAF is stubbed so default polling hangs); `__game.step(n, dt)` with `noRender=true`. Handy URL: `?debug=1&night=5&phase=dusk`. My throwaway scripts (smoke/leanin/hshot etc.) were in the old container's scratchpad and are gone; rewrite as needed.
- Quick resting check (what my smoke test did): `H.hold('lean')` then read `pen` (penetration), `con` (contact worst gaps), `stillMm`, `ang` out-of-range joints; time `k.updateHands(1/30)` 60 times.

## Design of the solver (what exists)
- Skin is an SDF-meshed surface (63,644 verts per arm + 1,475 sleeve); left mirrors right vertex for vertex. CPU skinning in `contact.js` (`SkinPoints`, `boneMatrices` = bone.matrixWorld × boneInverse) matches the GPU.
- Colliders (`colliders.js`, 29): unions of convex solids from Builder-recorded pieces (`build.js` records `pieces`, `tag`), book as a height field (`spreadHeight`, `BOOK` exported from `book.js`), round walls as a field, probes for thin things. Fields take a `cut` distance for early-outs.
- `classifySkin`: sets forearm, forearm.volar, hand, palm.all, palm, heel, thenar (palm vertices with thumb weight > THENAR=0.1), ulnar, finger.X, pad.X.k, tip.X, side.middle, sleeve. Solver sample sets: body = palm.all (spacing 8 mm; includes the thenar on purpose: the hand rests on it and the thumb mustn't press it in), heel (4 mm, excludes thenar), arm (3 cm), fingers (5 mm each), thumb = thenar + thumb1..3.
- `ContactSolver.apply(s, arm, ctx)` per hand per frame after the arm is solved: thumb pre-set to least curl when it is to touch; wrist push-out along the deepest point's normal (`push`); if the grip has an anchor: heel pulled onto what is below it, then any body contact turns the hand about the heel (axis = lever × normal, capped 0.4 rad, scaled by blend weight `W`); then fingers: role touch/free/fixed, bisection (STEPS=8, MARGIN 0.5 mm), `CURL_RATE=4`/s rate limit except out of things at once, stuck-finger fix-up moves the hand out once; thumb range from `thumbRange` keeps palmar abduction in 0.5–69.5°. `armBegin/armCost`: arm-bulk balls vs room, 12 mm clearance, weight 3000, added to `elbowCost` in `hands.js`.
- `hands.js` changes: `attach(colliders)` (called from `keeper.js` after `buildDesk()`); `setPose` records `fromPose`; `update()` carries the spring follower with the frame of the pose it is going to and the one it left (blended by the ease), `onTable`/`LIFT` raises the hand over the table edge when changing between book-frame and other poses; grip weight blending in/out over the second/first half of a blend; elbow ring of 24 candidates, only searched when `dt>0 || !arm.pp`; forearm turn clamped ±80° (`TURN`), roll shared elbow 0.4 / twist 0.35 / wrist 0.25; tip poses tracked exactly (speed limit 1.5 m/s) with re-placement after wrist clamp; shoulder lean when reach > 0.95.
- `anatomy.js`: `ANATOMY` limits (elbow flex 0–150, forearm turn ±80, wrist ext 70/flex 80/radial 20/ulnar 30, mcp flex -45..90 spread ±20, pip 0..100, dip -10..90, thumb palmarAbd 0..70, mcp 0..50, ip -20..80, hinge off-axis tolerance), `jointAngles`, `decompose`, `thumbBase`, `limits`; `hingeOf` (new) reads hinge bend/off-hinge by swing-twist (the old Euler read gave a false 254° at high flexion).
- Recent findings that shaped the code: the heel floated 12 mm when thumb vertices were in the body set (fixed); a hand turned by the solver but re-clamped by the wrist must re-read its real orientation (`q.setFromRotationMatrix(wrist)` in `move`); the book field and thin-probe balls reported false 11 mm penetrations at edges (fixed by insetting probes); the follower was dragged through the table during lean-in because it rode the body frame while the hand was going to the book frame (fixed by blending carry frames).

## Open issues I know of
1. Left forearm crosses the table's front edge ~3 mm during lean-in (and brief transient frames); also right-hand R.thumb/ring touched the table (~1–2 mm) at the start of the descent. Look at `armCost` weighting/forearm samples vs the table edge, and the order of lift vs lean.
2. `ready` pose (pencil in hand): after the lean-in, trace showed R.little3/ring3 into tray (up to 12 mm) and palm into the pencil (5 mm) during the blend from `lean` to `ready` (hand moves to `[0.41,0.038,0.13]` rot `[0,0.42,-0.62]`); `ready`/`write`/`pen` need their own solver grips (right hand has none yet; left uses RESTING). Tray is part of the 'tray' collider; plan is to split it into its own object so it can be nudged by tests.
3. Speed: ~2–3 ms median / 4–5 ms p95 for `updateHands`; budget 1 ms. Ideas: cache static frames, fewer samples, but measure moving frames honestly. Walk frames ~8 ms total per game frame.
4. Remove `this.debug` / `st.log` before finishing; check `contacts.js` comments still describe the code; update `docs/hands-check/baseline.*` by re-measuring on unchanged main hands in a git worktree with the final harness (the checked-in baseline was re-run on the WIP code path with solver absent only partially: verify).
5. Hands must not be over the pages except the writing hand below-right of the tip: `CLEAR`/`DRAWING` rules in `contacts.js`; planned refinement: for the drawing arm test only hand vertices (not forearm/sleeve).
6. Remove skin sliver triangles in the mesher (`handmesh.js` / skin build) rather than ignoring them in the twist test.
7. Per-interaction choreography still to design: page turn (leaf waits for the hand; left hand turns it back), cover (waits for the hand), lever (closer lampPose/lean to fix the twist), door (arrival, wall avoidance, left elbow snap), mug grip, continuous rail frame, chair arms, ink grasp timing, walking arms.
8. Screenshots numbered 46+ (contact sheet with the same cameras as `docs/hands-check/cameras.json` and joint plots) for the final PR; existing 45-hands-contact-sheet-baseline.jpg and 45-hands-joint-plots-baseline.png are the baseline.

## Not covered anywhere
The earlier chat transcript is not in the repo. If anything here seems to conflict with the brief in `docs/prompts/hands-contact-solver.md`, the brief and my latest message win; ask me.
