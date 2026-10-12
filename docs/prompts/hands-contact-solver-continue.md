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
