# Handoff: first-person build, milestone 5 in progress

The brief is `docs/prompts/first-person-threejs.md`. Read it with README.md, DESIGN.md and REPORT.md
before you change anything. First person is opt-in for now with `?view=fp`, and `?view=classic` must
keep working. Run the game with `python3 tools/serve.py 8001`.

## Done and committed

| Milestone | Commit | What it covers |
|---|---|---|
| M1 | ea661bd | Three.js renders the four watercolor layers |
| M2 | 4a13472 | The watch room, and leaning over the logbook |
| M3 | 8d81651 | The keeper's hands, posed and solved |
| M4 | cac9fbf | The night from the chair: Fleet, time-lapse, beats, the sill note, eyelids |

REPORT.md has a section for each milestone, including what is still rough.

## M5: dawn, the headland walk, the places, the stairs (in progress, not committed)

### Already written, uncommitted, and not yet run in the browser

- **`src/world/bay.js`**
  - `landHeight` now measures distance only to the coast edges. This removed the trench where the
    north and south land polygons meet at the head of the bay (x > 101.4, y = 22). It also blends
    the north and south ground heights there.
  - The step at x = 78 and x = 97 is smoothed. Village ground never drops below the tide.
  - The terrain stores its grid, and `bay.groundAt(wx, wz)` returns the mesh's own height (the cells
    are split along b–c).
  - The lane is tinted into the grass. Terrain `crease` is lowered from 0.55 to 0.3 to soften the
    grid creases.
  - Village houses within 2 chart units of the lane are skipped (`windows` holds `null` for them).
  - `bay.solids` holds collision circles `[x, z, r]` in world units.
- **`src/world/lane.js`** (new)
  - `LANE` is a polyline from the tower door, east along the south headland, round the head of the
    bay, and back west behind the village to the cottages.
  - `SPURS` are shed (index 1), cliff (4) and harbour (22).
  - Helpers: `laneDist`, `nearestOnLane`, `routeTo` (for autoplay).
  - Every point was checked in the browser: ground ≥ 2 m and slope < 0.45.
- **`src/world/room.js`**
  - The door is now a hinged group: `room.door = { pivot, swing, ring }`. It swings inward with
    `swing.rotation.y` going negative, and `ring` is an Object3D at the iron ring.
  - There is a stone step outside.
  - `buildTop()` adds the gallery, rail, lantern bars, dome and brass lens. The lens sits at LAMP
    height and there is no glass, so the beam shows through.
- **`src/world/places/kit.js`** (new)
  - `greybox(scene, {at, w, d, h, face, roof, solid})` and `sign(scene, {at, title, sub, face})`.
  - The sign lettering uses `letteringTex` as an inkMap.
  - `scene` is `{ group, at(x, y, up), solid(worldPoint, r) }`.

### Still to do for M5

1. **One file per place** in `src/world/places/`: `lighthouse.js` (the shed), `cliff.js`,
   `village.js` (the shop and the pub), `harbour.js`, `cottages.js` and `school.js`.
   - Each starts with a `// TODO: placeholder` header.
   - Each exports `id`, `trigger = { at: [chart x, y], r: metres }`, `approach` (lane index and
     spur, for autoplay), `build(scene)` and `onEnter(game)` (which calls `game.visit(id)`).
   - Planned spots, in chart units:

     | Place | Building(s) | Trigger | Sign |
     |---|---|---|---|
     | Shed | (18.8, 57.2) | (17.6, 56.5), r 2.5 m | (17, 56) |
     | Cliff | bench and cairn | (40, 59.9), r 5 m | — |
     | Village | shop (72.5, 1.4), pub (70.5, −6.5) | (72.6, 0.3), r 4 m | — |
     | Harbour | bollards and crates | spur end (90, 2.4), r 6 m | — |
     | Cottages | (60.5, −8.5) and (64.5, −8.8) | (62, −5.8), r 7 m | — |
     | School | schoolhouse (92.5, −11), church wall (97, −9) | (92.4, −9), r 4 m | — |

   - Sign text comes from `PLACES` in `src/data/story-village.js`.
   - Most triggers sit off the lane so you don't visit by accident (cottages sit at the lane's end).
2. **`src/world/headland.js`** (new): builds the places and handles walking outdoors.
   - Ground comes from `bay.groundAt`. You can't walk below tide + 0.3 m or up a slope steeper than
     about 0.9; slide on x or z instead.
   - Collisions: `bay.solids`, the place solids, and the tower cylinder (R + wall = 4.0 m), except
     through the doorway.
   - Triggers.
   - The afternoon clock runs from 14:00 to 19:00 at about 0.6 game minutes per second.
   - The sun moves from SW at 40° elevation down to DUSK_SUN. The light mixes `'day'` to `'dusk'`
     from 17:30; recompute it only when the hour changes.
   - A time-lapse pace speeds things up outdoors when you are far from the tower and the places. It
     goes up to ×5, with the speed capped at about 14 m/s. The walker needs a new `speedScale`, and
     the clock speeds up with the pace.
3. **`keeper.js`**
   - Add wrappers for `daymap`, `vignette` and `finale`; `main.js` already merges
     `keeper.wrappers`. Make `vignette` seamless when you arrive from the walk.
   - New mode `'day'` with these states:
     - **door**: the 'door' hand pose takes the ring and the door swings open. The door frame now
       comes from `room.door.ring`.
     - **read**: the place's vignette text as lettering over a soft paper panel, as in
       `village.js` (ARRIVAL, VIGNETTES, QUIET). Click, tap, Space or E advances it.
     - **fail**: the hour runs to 19:00, then `game.toDusk()`, whose crossfade is the bloom.
   - Unavailable places show "nobody about today".
   - Using the table during the day means waiting for dusk.
   - Night 1 (the arrival) starts on the lane about 50 m east, facing the tower.
   - `collideRoom` must let you through the doorway when the door is open.
   - Reset the door at dusk.
4. **Finale stairs in first person.** The keeper handles `part: 'stairs'`: 14 treads, one per click,
   tap, Space or ↑, using the 'rail' hand pose (`railStep`), with lines from STAIRS in
   `story-end.js`. Near the top, call `game.go('finale', {part: 'sunset'})`, which uses the 2D
   FinaleScene. The composite wrapper needs a `three` getter that depends on the part.
5. **Audio.**
   - Footsteps (`walker.onStep`; wood indoors, grass or stone outdoors).
   - Room tone: a quiet filtered noise bed.
   - Interior and exterior reverb switched when you cross the door (in `src/audio/`).
6. **Autoplay** walks the route to `night.day.focus` (`routeTo`) and opens the door itself.
   `debug.js nextPhase` already calls `g.toDusk()` and `sc.leave()`, so the wrappers must provide
   `leave()`.
7. **Check it.**
   - Nights 1, 2, 4 and 12 by day: walk to each place.
   - Run `?debug=1&autoplay=1&view=fp&speed=4` from the title to the end card with no errors.
   - Make sure check-nights still passes.
   - Make sure the classic view is unchanged.
   - Check the view from the chair: the landHeight change shows at the bay head.
   - Add a REPORT section and screenshots, then commit, ending the message with
     `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

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

When `?view=fp` is set:
- `boot()` creates `game.world` and `game.keeper = new Keeper(game)`, then
  `Object.assign(game.scenes, game.keeper.wrappers)`.
- Any scene name the keeper doesn't wrap (today: daymap, vignette, finale) falls back to the old 2D
  scene.
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
  - The `'door'` frame is still computed from fixed numbers (around line 790). Switch it to
    `room.door.ring.getWorldPosition()` and the swing angle so the hand follows the door as it
    opens.
  - `'rail'` uses `this.railStep`.
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
- `onStep(speed)` fires every 0.72 m.
- There is no `speedScale` yet: add it for the outdoor pace and the time-lapse.

### hands.js

- `POSES`: walk, door, lean, write, pen, turn, lamp, chair, mug, close, rail, and others; see
  `POSE_NAMES`.
- `setPose(name, dur)`. The keeper owns the frames.

### Audio (src/audio/)

- `audio.js` has `setScene(name, night, args)`, which picks the music and the ambience, and an
  `INDOOR` set.
- `ambience.js` has surf, wind, rain, gulls and hum.
- `sfx.js` has pencil, page, soft, chime, thud, stairStep and others.
- The reverb is one convolver from `voices.js impulse()`.
- Add a footstep sound, a room tone bed, and a second (outdoor) reverb, crossfaded by a new
  `audio.setSpace('in' | 'out')`.

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

- The `landHeight` change alters the land at the head of the bay and the village ground. Compare the
  view from the chair against `docs/screenshots/17-night6-chair.jpg` and the other M4 shots.
- `Bay.windows` now holds `null` entries for skipped houses. `setLights` guards for them; anything
  new that iterates `windows` must too.
- Nothing from this M5 work has been loaded in a browser yet. Watch for syntax or import errors in
  `room.js` (`buildTop`, the door Builder) and `bay.js`.

## Conventions

- **Comments** match the surrounding style: a short plain-English header per file and a few lines
  per section, no JSDoc.
- **Every texture is drawn in code** (`textures.js`, `letteringTex`, the canvas helpers in
  `render/paint.js`). Nothing is downloaded.
- **Commit after each milestone and add a REPORT.md section for it.** The section says what was
  built, how it was checked, the screenshots taken, and what is still rough.
- **Screenshots** are numbered in `docs/screenshots/`. The last one is
  `22-night10-dawn-chair.jpg`, so carry on from 23.
- **check-nights**: `node tools/check-nights.mjs`.
- **Dev server**: `.claude/launch.json` has `keeping-light-dev`, which runs
  `python3 tools/serve.py 8001`.
- If the cloud environment has no browser, at least serve the game, load the modules, and run
  autoplay headless if possible. Otherwise say plainly which visual checks were skipped.

## M6 (after M5)

- Autoplay end to end and check-nights.
- Update README and DESIGN, and add screenshots.
- Make first person the default and keep `?view=classic`.

## Testing notes

- In a hidden browser tab, requestAnimationFrame is throttled, so drive time with
  `__game.step(n, dt)`, at most about 1500 steps per call.
- Useful handles: `__game.scene.keeper`, `__game.debugPanel.nextPhase()`.
- Screenshots: POST to `/__shot?name=X.jpg`; they land in `docs/screenshots/`.
- Debug keys: C free-fly, T time scale, H hand poses, N next phase.
- Chart to world: X = x·4, Z = y·4. TOWER is at chart (12.5, 53.6), y = 18 m. The room yaw faces
  chart (50, 30).
