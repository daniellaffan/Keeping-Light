# Prompt: make the keeper's hands touch things properly (contact solver, tests first)

You are working in the repo `Keeping-Light` (a first-person Three.js game; see `README.md`, `DESIGN.md`,
`REPORT.md` and `docs/HANDOFF.md` first, especially REPORT's "The hands, remodelled (milestone 7)").
Branch from `main`. Commit in small steps and push to a branch, then open a draft PR.

## The problem

The keeper's hands (forearms and hands are the only visible part of the body) were remodelled in M7, but they
still do not interact properly with the world:

1. **Clipping.** Skin, fingers and forearms pass through the table, the logbook, the pencil and quill, the
   inkwell, the mug, the lamp lever, the door and its ring, the stair rail and the chair arms.
2. **Awkward interaction.** Grips are fixed offsets from a prop. Fingers do not wrap what they hold, hands
   float off what they rest on, and nothing adapts if a prop moves.
3. **Weird wrist and forearm twisting.** Example: pulling the lamp lever. The lever swings through about 65°
   (`room.lever.rotation.x` goes from 0.5 to about −0.65) while the shoulder stays fixed, so the arm chases it
   around the arc, the wrist limit engages part-way, and the forearm twists oddly. The `lamp` grip was only ever
   tuned with the lever at rest. A thumb or fingertip was also seen poking out the far side of the lever.
   Hypothesis, to be confirmed by measurement before you change anything.

The previous work measured only wrist bend and shake, and judged everything else from a few screenshots. Do
not repeat that. **Measurement comes first.**

## What exists (read these)

- `src/world/hands.js`: `Arm` (skeleton, skinned mesh, sleeve), `POSES` (hand-authored: walk, door, lean,
  ready, write, pen, turn, close, chair, mug, lamp, rail, ink-tray, ink-well, ink-take, ink-lift, show),
  `Hands.resolve()` (pose → wrist target; options `pos`/`rot`, `at`, `align`, `grasp`, `tip`), `Hands.solve()`
  (two-bone IK, elbow choice, forearm roll as one unwrapped angle, `clampWrist`), `follow()` (critically damped
  wrist), `fingers()` (joint angles), `take()`/`put()` for tools. Wrist limits now: 55° back, 65° forward,
  20° toward the thumb, 30° toward the little finger; forearm roll ±100°; wrist twist ±40°.
- `src/world/handmesh.js`: the skin as an SDF meshed once (`buildSkinData`, runs in a worker via
  `prepareSkin`); skeleton proportions (`UPPER`, `FORE`, `FINGERS`, `THUMB`, `BONES`).
- `src/world/keeper.js`: `updateFrames()` (the world frames poses attach to: body, book, leaf, lid, lever,
  door, rail, chair, mug, inkwell, quillWell, quillUp, trayPencil), `handPose()`, `updateHands()`, `buildDesk()`,
  `inkSteps()`/`updateInk()`/`nibAt()` (the quill inking sequence), the review hooks.
- `src/world/room.js` (table, tray, lever pivot, door and `ringAt`, stairs and rail, chair, mug),
  `src/world/book.js` (the logbook; pages are a height field `spreadHeight`, cover lid and leaf pivots).
- `src/world/review.js`: `__review.hands()`, `__review.one(pose, light)`, `__review.studio(pose,
  {hand, az, el, dist})`, `__review.fit()`.
- Debug hooks (`?debug=1`): `__game.step(n, dt)`, `__game.noRender`, `__game.keeper`, `__game.snapLook`.
  `?debug=1&autoplay=1&speed=4` plays the whole game.

## Constraints that must keep holding

- No shaking: a held hand moves 0.000 mm per frame. No tremor, bounce or overshoot.
- Hands never lie over the logbook's pages except while drawing, and then only the pencil or quill hand,
  trailing below and to the right of the tip.
- The quill inking sequence (pencil into the tray, inkwell in, quill out, dip, draw, quill back) must keep
  working, with the nib still following the route exactly.
- `node tools/check-nights.mjs` passes; autoplay of all 19 nights finishes with `AUTOPLAY COMPLETE` and no
  console errors; the classic 2D view (`?view=classic`) is untouched.
- Everything is drawn in code; nothing is downloaded. Match the surrounding code style (short plain-English
  header comments, no JSDoc).
- Skin build time and frame time must not regress meaningfully (see the budget below).

## The approach: a contact solver on top of the authored poses

Not a physics engine. Poses say where the hand wants to be; a deterministic per-frame solver then keeps the
hand out of things and wraps it onto what it holds. (Light physics on props, such as the inkwell sliding or the
mug tilting, is out of scope unless it is needed to pass the tests.)

Components:

1. **World collision shapes** for the table, the logbook (height field matching `spreadHeight`, plus the cover
   and the turning leaf), the tray, the inkwell, the mug, the lever (arm and ball, following its pivot), the door
   and ring, the rail, the chair arms and the walls. Static or kinematic; they follow the objects they belong to.
2. **Hand collision shapes**: a capsule per phalanx, the palm, the thumb pad, and the forearm (two or three
   capsules). They must match the skinned mesh closely enough that the penetration metric (below) is
   meaningful; say how you validated that.
3. **Grip definitions per object**: which surface the fingers wrap and where the palm lands (pencil and quill
   shaft, lever ball, ring, mug body, rail, cover edge, inkwell body). Held tools need rules too: the tip rests
   on the page at the right height and the shaft cannot pass through the fingers.
4. **A per-frame solve** after the IK places the wrist:
   - push the wrist out of overlaps (positional correction, limited per frame so nothing snaps);
   - lift the forearm clear of table and book edges;
   - curl each finger until its capsule touches the grip surface (never past it), within joint limits;
   - choose the elbow and shoulder lean so moving props (lever, door, cover) can be followed through their
     whole travel without the wrist leaving its range (the body may lean or step a little, as a person would);
   - keep everything smooth: no jitter, no flips, continuous in time.
5. **Anatomy rules**, written as one table that the solver and the tests share: elbow (hinge only), forearm
   turn (about its own axis, with range), wrist (two movements, each limited), finger knuckles (bend and a small
   spread), finger middle and end joints (bend only), thumb base (its own range). Take the numbers from a stated
   reference (a clinical or ergonomics range-of-motion table); name the source in the code comment and in
   REPORT, and note anything you chose differently and why. Forearm twist must be distributed along the arm so
   the skin does not collapse (see the skin twist test).

## PHASE 0, BEFORE ANY SOLVER CODE: the testing method

Build the test harness first, commit it, run it on the current `main` code, and **report the baseline numbers
to me** (a table per interaction). Only then start on the solver. The tests must fail on today's code where the
bugs exist; if a test cannot fail, it is not testing anything.

Put the tests in `tools/` (for example `tools/check-hands.mjs` driving headless Chromium, plus any in-page
helpers under `src/world/`). One command runs them all and prints a pass/fail table.

The tests:

1. **Penetration test.** Sample points on the skinned hand and forearm (use skin vertices after skinning, and
   say how many) against each collision shape's signed distance. For every pose and for **every frame of every
   blend between poses**, record max and 99th-percentile penetration depth in mm, per object. Default pass:
   max ≤ 2 mm. (I may change this threshold; make it a single constant.)
2. **Contact test.** Intended contacts must actually touch: fingertips and palm within 1 mm of the grip
   surface when gripping; resting hands within 2 mm of the table; the nib on the page within 0.5 mm when
   drawing. A hand that floats away must fail even when penetration is zero.
3. **Motion-range test.** For every interaction with something that moves (lamp lever through its full
   travel, door opening, book cover lifting, page turn, quill dipping and drawing, mug lifting to the lap and
   back, stair climb), step through the whole motion in at least 100 increments and log joint angles,
   penetration and contact gaps at every step. Never test only the resting position of a moving prop.
4. **Joint-angle test.** Dump every joint angle on every frame of every pose, transition and a full
   autoplayed night. Fail if an angle leaves the range in the anatomy table, if any joint's angle changes by
   more than a set amount in one frame (default 25° at 30 fps; a single constant), or if the forearm roll flips
   sign or wraps.
5. **Skin twist test.** Twist the forearm through its full range and check that the cross-section never
   collapses below a set fraction (default 70%) of its rest width anywhere along the forearm and wrist, and
   that no triangle flips.
6. **Fuzz test.** Sweep the pencil and quill tip over hundreds of positions across the whole page, in
   landscape and in phone portrait (`singleGeometry`); nudge the book, inkwell and tray by a few centimetres;
   all penetration, contact and joint tests must still pass.
7. **Stability test.** A held hand still moves 0.000 mm per frame; the solver converges in a fixed number of
   iterations; two runs of the same scenario give identical numbers.
8. **Speed test.** Solver time per frame under a stated budget (propose one and measure it; assume integrated
   GPU laptops and phones matter), with no regression in skin build time.
9. **Visual aids.** A debug overlay that draws the colliders and colours skin vertices red where they penetrate
   (a switch in `?debug=1`), and fixed-camera contact sheets for every interaction (with `__review.studio`),
   saved to `docs/screenshots/` with new numbers, for human before/after comparison. Also a joint-angle versus
   time plot for each moving interaction (an image, saved the same way).

How to run things in this environment: serve with `python3 tools/serve.py 8001`; Playwright is at
`/opt/node-tools/node_modules/playwright` (launch Chromium with `--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`); force 2D canvases to `willReadFrequently`; `page.screenshot` times out under
software GL, so step the game (`__game.step`) with `__game.noRender = true` for logic and render one frame and
read `__game.canvas.toDataURL()` for pictures. Logic tests can run with `noRender = true` and are fast.

## Rules of work (stick to these)

1. Tests first; baseline reported before solver code; the tests stay and run before every commit.
2. A change is "done" only with the numbers. Never claim an interaction works from screenshots alone.
3. Fix one interaction at a time, each with its own passing tests: pencil resting and writing, quill and
   inkwell, page turn, cover lift, lever, door ring, mug, rail, chair arms, walking arms. Commit each.
4. Do not weaken a threshold to make a test pass. If a threshold is wrong, say so and ask me.
5. Every PR description lists what is **not** measured and what is still rough. No overclaiming.
6. If something in this prompt is ambiguous or you need information, ask me before guessing.

## Deliverables

- The test harness and the baseline report (before any solver code).
- The contact solver, collision shapes, grip definitions and the anatomy table.
- All tests passing, with before and after numbers in a new REPORT section.
- Screenshots 45 onward in `docs/screenshots/` (overlay, contact sheets, joint plots).
- `docs/HANDOFF.md`, `README.md` (only if behaviour the player sees changes) and `DESIGN.md` updated.
- A draft PR with a plain description, including the list of what is not measured.

## Open questions (my defaults are above; tell me if you want different)

- Penetration threshold (default 2 mm), contact tolerance (default 1 mm), per-frame joint-change limit
  (default 25°), skin twist floor (default 70%), solver time budget (to be proposed).
- Whether props should react to the hands (not required).
- Whether the cover lift and page turn are in scope (the default is yes).
