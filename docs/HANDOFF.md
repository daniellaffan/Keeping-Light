# Handoff: first-person build, milestones 1–6 done

The brief is `docs/prompts/first-person-threejs.md`. Read it with README.md, DESIGN.md and REPORT.md
before you change anything. Run the game with `python3 tools/serve.py 8001`.

## Done and committed

| Milestone | Commit | What it covers |
|---|---|---|
| M1 | ea661bd | Three.js renders the four watercolor layers |
| M2 | 4a13472 | The watch room, and leaning over the logbook |
| M3 | 8d81651 | The keeper's hands, posed and solved |
| M4 | cac9fbf | The night from the chair: Fleet, time-lapse, beats, the sill note, eyelids |
| M5 | 4a02fed | The day: the door, the headland walk, the six places, the light failing; the first-person stairs; footsteps, room tone and two reverbs |
| M6 | 1185ce4 | First person is the default (`?view=classic` for 2D, automatic fallback); README and DESIGN; screenshots 36–39 |
| M7 | 44859e8 | The hands remodelled: one continuous old skin, no shaking, natural wrists, never over the pages, inking with a quill; screenshots 40–44 |
| M8, phase 0 | (this branch) | The hands' test harness (`node tools/check-hands.mjs`) and the baseline it measured on the M7 hands; no solver yet. Brief: `docs/prompts/hands-contact-solver.md` |

REPORT.md has a section for each milestone, including what is still rough and what was decided
differently from the plan (M5: the clock runs at √pace; the climb is 8 treads, not 14).

## How the first-person code fits together

### main.js stays the phase machine

The flow is:
1. `startNight(id)` goes to `go('vignette', {place: 'arrival'})` (night 1) or `go('daymap')`.
2. `visit(place)` sets `state.visits[id]` and calls `go('vignette', {place})`. This is how one visit
   per day is kept.
3. `toDusk()` → `go('logbook', {mode: 'dusk'})`.
4. `inkPlan()` → `go('bay', {mode: 'night'})`.
5. `onNightOver()` → `go('bay', {mode: 'dawn'})`.
6. `onDawnSeen()` → `go('logbook', {mode: 'dawn'})`.
7. `onDawnDone()` saves, then either calls `startNight(id + 1)` or, after the last night, goes to
   `go('finale', {part: 'stairs'})`.

In first person (the default; not with `?view=classic`):
- `boot()` creates `game.world` and `game.keeper = new Keeper(game)`, then
  `Object.assign(game.scenes, game.keeper.wrappers)`.
- The keeper wraps logbook, bay, daymap and vignette. `finale` is a composite wrapper: the stairs
  are the keeper's (`three` is true only then), the sunset and end card are the 2D `FinaleScene`.
- `go()` skips the crossfade when both scenes are keeper scenes and `sc.seamless(args)` is true.
- A scene with `three: true` is drawn by the world. Its `draw(L)` only paints the HUD, and only when
  `hudActive()` returns true.

### keeper.js: one Keeper owns the camera, room, book, hands, walker and bay

- **`wrap(name)`** builds the per-scene object that main.js and debug.js see. It provides `enter`,
  `exit`, `update`, `draw`, `hudActive`, `look`, `cursor`, `mode`, `autoPlan`, `closeBook`,
  `seamless`, `fleet` and `leaving`.
- **`enter(name, args)`** sets things up per phase.
- **`setState(s)`** switches the state; **`update(dt)`** runs a `switch` over the states:
  - **walk**: the walker, with `collideRoom`.
  - **lean-in, lean, lean-out**: camera blends to and from `leanPose()`.
  - **light**: the lever and the lamp.
  - **to-chair, chair**: `updateNight` / NightWatch.
  - **dawn-chair, rise**: getting up at dawn.
  - **closing, done**: closing the book.
  - **review**: the debug hand review.
- **`blendTo(pose, dur, done)`** eases the camera. A pose is `{pos, yaw, pitch, roll, fov}`.
  `roomPoint(deg, r, y)` turns room polar coordinates into world space. Degrees run clockwise from
  the window seen from above; the door is at 100°.
- **`handPose()`** maps the state to a hand pose.
- **`updateFrames()`** sets the world frames the poses attach to.
  - The `'door'` frame follows `room.door.ring`, so the hand moves with the door.
  - `'rail'` uses `this.railStep` (the tread ahead of the climber).
- **The day** (mode `'day'`): `startDay`, `enterPlace`, `updateDay` (walk, pace, clock, triggers),
  `autoDay`, `updateDoor`, `startFail`, `endDay`. States `door`, `read` and `fail` join the others.
- **The stairs** (mode `'stairs'`): `enterStairs`, `stairPose(i)`, `climb()`, `updateStairs`.
- **Debug keys**: H, C and T are in `key()`. Prompts are in `updatePrompt()` and drawn by
  `drawHud()` with `letter()` / `blob()`.
- **`look()`** returns the watercolor grading for the composite.
- **`lightState(tod, haar, sunDir)`** with `tod` in `'day' | 'dusk' | 'night' | 'dawn'`,
  **`mixLight`** and **`applyLight`**. `applyLight` also repaints the sea through
  `bay.setPalette`, which loops over about 3,400 vertices, so throttle it.

### walker.js

- WASD or arrows plus mouse look, using pointer lock where allowed and drag-to-look otherwise.
- On phones: a left-thumb stick, and a right-side drag to look. A tap on the right side calls
  `onTap` (use).
- `update(dt, {collide, ground})`, where `collide(nextPos)` corrects the position in place.
- `onStep(speed)` fires every 0.72 m of stride (the stride, not the cadence, grows with the pace).
- `speedScale` (the outdoor pace) and `autoTo` (autoplay steering to a world point).

### hands.js, handmesh.js, inkwell.js

- `POSES`: walk, door, lean, ready, write, pen, turn, close, chair, mug, lamp, rail, the inking steps
  (`ink-tray`, `ink-well`, `ink-take`, `ink-lift`) and the debug `show`; see `POSE_NAMES`.
- A pose places the wrist in a frame (`pos`/`rot`), or a point of the hand there (`at`), or lets a
  hanging hand follow its arm (`align`), or holds a tool lying in a frame (`grasp`), or puts a tool's
  tip on `hands.tip` (`tip`).
- `setPose(name, dur)`. The keeper owns the frames. `take(tool)` / `put(tool, parent, pos, rot)` move
  the pencil and the quill between the hand and the desk.
- The skin is a distance field (handmesh.js) meshed at boot in a worker (`prepareSkin`, started from
  `boot()` in main.js; it falls back to building in place).
- The inking sequence is `Keeper.inkSteps()`; it holds the logbook's `inking` (`inking.hold`) until
  the nib is on the line, and `nibAt()` follows `scene.penPts`.

### Audio (src/audio/)

- `audio.js` has `setScene(name, night, args)`, which picks the music and the ambience, and an
  `INDOOR` set.
- `ambience.js` has surf, wind, rain, gulls and hum.
- `sfx.js` has pencil, page, soft, chime, thud, stairStep and others.
- Music and most sfx share one convolver from `voices.js impulse()`.
- Footsteps and the door go through a second send, `audio.setSpace('in' | 'out')`, which crossfades
  a stone-room and an open-air convolver, sets the room tone, and muffles the sea through the walls.

### The hands' tests (colliders.js, anatomy.js, contacts.js, handcheck.js, tools/check-hands.mjs)

- **`node tools/check-hands.mjs`** starts its own server and headless Chromium and runs the nine
  tests of the contact-solver brief. It prints a table per interaction and per test, and writes all
  it measured to `docs/hands-check/<label>.json` (`--label`, `--quick`, `--only`, `--shots`,
  `--jobs`). `--shots --shot-prefix NN-hands` renders the x-ray contact sheet and the joint plots
  into `docs/screenshots`; their world cameras are kept in `docs/hands-check/cameras.json`, so the
  same views can be shot after a change.
- **colliders.js** builds every collider from the pieces the room was drawn with: `Builder` records
  each piece's type, parameters and placement (`group.userData.pieces`), and `tag` in its options names
  the piece (`'rail'`, `'tray'`, `'ring'`...). Shapes are unions of convex solids (face planes) taken
  from the drawn polygons, so they match what is on screen. The logbook is a height field
  (`spreadHeight`, exported from book.js); the walls are the round room. Thin things carry probes.
- **anatomy.js** is the range-of-motion table the solver and tests share, and `jointAngles(arm)`.
- **contacts.js** says what each pose's hands should touch and when; `THRESH` holds every tolerance.
- **handcheck.js** (debug only, `window.__handcheck`) skins both arms on the CPU (the same sums as
  the GPU, checked against three.js's own to 0.015 mm), measures penetration both ways, contact
  gaps and joint angles, and plays the scenarios: holds, the whole dusk, the door, the stairs, an
  autoplayed night, sweeps of the writing point, nudged props, the forearm twisted.
- **The overlay** (key O with `?debug=1`, or `__handcheck.overlay(true, {xray})`) outlines the colliders
  and reddens skin inside anything. With `xray` the colliders' own meshes are hidden, since skin
  inside a thing can't otherwise be seen.
- The harness stubs `requestAnimationFrame` and seeds `Math.random` in the test page, so time moves
  only by `__game.step` and a run repeats exactly. Playwright's `waitForFunction` must then poll on a
  timer (`polling: 250`), not on animation frames.

## Why the day walk is designed this way

- **The places sit at their real chart positions**, the ones in `headland-map.js` SITES. The 3D
  village is already visible across the bay from the watch-room window, so a "village" built near
  the tower would contradict it.
- **The walk is long.** The lane is about 188 chart units, roughly 750 m, to the cottages and about
  600 m to the village. Hence the time-lapse pace: the afternoon "runs on" far from anything, just
  as the night does.
- **The shed is near the tower and the cliff is about 110 m away**, so those two are short walks.
- **Triggers sit off the lane** (in front of each door) so you don't visit by accident in passing.
  The brief says walking into a trigger starts the place, with no button.
- **The harbour place is the slip between the two piers** (chart (90, 2.2)). Houses near the lane
  were removed to open a way down to it.

## Risks to check first

- The `landHeight` change was checked against `17-night6-chair.jpg` in M5 and matches.
- `Bay.windows` now holds `null` entries for skipped houses. `setLights` guards for them; anything
  new that iterates `windows` must too.
- M5 was checked only in headless Chromium with SwiftShader (no GPU). Frame rate, pointer lock and
  touch on a phone still need a real device.

## Conventions

- **Comments** match the surrounding style: a short plain-English header per file and a few lines
  per section, no JSDoc.
- **Every texture is drawn in code** (`textures.js`, `letteringTex`, the canvas helpers in
  `render/paint.js`). Nothing is downloaded.
- **Commit after each milestone and add a REPORT.md section for it.** The section says what was
  built, how it was checked, the screenshots taken, and what is still rough.
- **Screenshots** are numbered in `docs/screenshots/`. The last ones are
  `45-hands-contact-sheet-baseline.jpg` and `45-hands-joint-plots-baseline.png` (the hands' baseline;
  the same views after a change take the next number).
- **check-nights**: `node tools/check-nights.mjs`.
- **Dev server**: `.claude/launch.json` has `keeping-light-dev`, which runs
  `python3 tools/serve.py 8001`.
- **Headless testing.** Playwright with Chromium works in the cloud environment (launch with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`). Software WebGL is slow
  (about 1 s a frame at 1280×800), so set `__game.noRender = true` (debug only) for long logic runs
  and render only the frames you want to look at. Force CPU-backed 2D canvases in the test browser
  (`willReadFrequently`): SwiftShader drops canvas clears after a texture upload, which leaves stale
  HUD panels in screenshots. That's an artefact of the test browser, not the game.

## What's next

- **Check on real hardware:** the frame rate on an integrated laptop GPU and a phone, pointer lock, the
  touch stick, and the look under a real GPU (everything so far was rendered in software).
- **Replace the placeholder places** one file at a time (`src/world/places/`); the interface stays.
- **Known rough edges are listed in REPORT** (M4 and M5): the soft ground
  close up, small far boats.

## Testing notes

- In a hidden browser tab, requestAnimationFrame is throttled, so drive time with
  `__game.step(n, dt)`, at most about 1500 steps per call.
- Useful handles: `__game.scene.keeper`, `__game.debugPanel.nextPhase()`.
- Screenshots: POST to `/__shot?name=X.jpg`; they land in `docs/screenshots/`.
- Debug keys: C free-fly, T time scale, H hand poses, N next phase.
- Chart to world: X = x·4, Z = y·4. TOWER is at chart (12.5, 53.6), y = 18 m. The room yaw faces
  chart (50, 30).
