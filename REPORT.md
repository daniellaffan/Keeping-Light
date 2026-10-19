# The Keeping Light — V1 report

## How to run

```bash
python3 -m http.server 8000
```

Open **http://localhost:8000**. No build step. For quick testing, start at
`http://localhost:8000/?debug=1` (keys and parameters are in [README.md](README.md)).

## What's in V1

Every item in the brief's hard requirements is in.

* **The whole story, start to finish:**
  * Title, then the arrival.
  * Nights 1–16 across four acts, each with its day, dusk, night and dawn.
  * Epilogue nights E1–E3.
  * The stairs, the last sunset, the fade to paper, the end card, and back to the title.
* **The watercolor pipeline** covers every scene: four Canvas2D layers (paint, ink, light, mask)
  composited by one WebGL2 shader. The shader handles:
  * paper grain and fibres, edge darkening, granulation and bleed
  * ink with dry-brush breaks, light glazes that scatter in fog
  * procedural haar, act grading, the ragged deckle margin
  * cauliflower-edged bloom transitions
* **The logbook mechanic** works with mouse and touch:
  * Place and drag waypoints; take back (with Ctrl/⌘+Z) and rub out.
  * An ink budget shown as an inkwell, plus tally marks for turns.
  * Pencil "?" hints near rock; ink animates on when you commit.
  * Turn back through older pages.
  * Tides decide which reefs matter, and ship size sets the clearance. There is one current (night
    10) and one new reef that appears (night 10).
  * Nights 1–4 offer the old keeper's own line ("follow my line"), and night 9 shows their plan
    as a ghost in pencil. Ships follow the inked line exactly. There is no fail state.
* **Story content** is all in `src/data/`:
  * The inside cover, about 25 of the old keeper's entries, and three other keepers' runs.
  * The Keeper's notes for every night, getting shorter and stranger.
  * Village scenes with Nora, Tadhg and Síle, including Tadhg's escalating Manannán jokes.
  * Act 3's found things: dust sheets, Síle's dated drawing, the schoolroom board.
  * Dawn records, including the special ones.
* **The scripted beats:**
  * a late reflection (night 3)
  * haar from night 6
  * the moved waypoint, the phantom reflection and the new reef (night 10)
  * Mag Mell (night 13)
  * every boat lagging in act 3
  * the wrong tide table (night 15)
  * Manannán (night 16)
  * the village lights going out one by one
* **The handwriting drifts** night by night. The old keeper's hand and the other keepers' hands
  are each distinct.
* **Procedural audio:**
  * Lo-fi music that thins act by act, plus ambience (surf, wind, rain, gulls, lamp hum).
  * Sound effects for pencil, ink, lamp, arrivals and stairs.
  * It starts on the first gesture; volume and mute are remembered (**M** mutes).
  * Haar muffles everything, and Manannán hushes it.
* **Saving:** autosave at each dawn, with Continue / begin again on the title. With storage blocked,
  the game still plays; it just can't save.
* **Debug mode:**
  * A panel with the night, phase, act and uniforms.
  * Keys N, Shift+N, 1–0, A, F, R; `?night=&phase=` and `?finale=`.
  * `?autoplay=1` plays the whole game unattended.
* **Robustness:**
  * Handles resize and high-DPI (DPR capped at 2).
  * Pauses with the tab hidden, and audio suspends too.
  * A painted-paper message when WebGL2 is missing.
  * On phones, the logbook shows one page at a time with tabs.

## What's simplified

* **Vignettes** are one painted panel with a few lines of text that you click through. The
  interiors (shop, pub, lamp room, shed, school, cottages) are simple compositions with no
  figures. The harbour and the pub are the plainest.
* **One bay composition.** Every night uses the same view from the south headland. Weather, tide,
  act palette, lit windows and fog change it, but the camera never moves.
* **Ships** are small painted hulls with lanterns, in three sizes. There are no distinct rigs per
  ship type.
* **Portrait phones.** The logbook adapts, but the bay, title and finale are composed for landscape.
  In portrait they sit inside the painted page, small, with paper above and below. Everything is
  still playable.
* **Settings** are sound only: volume and mute. There are no text-size or reduced-motion options.

## What's missing

* **Keyboard-only route planning.** Waypoints need a pointer (mouse, pen or touch). Everything
  else can be done from the keyboard.
* The brief suggested an `anomalies.js` module. Anomalies are data in `nights.js` and are handled in
  `bay.js`; I didn't split them out.
* **No human-paced playthrough was timed.** Autoplay runs the whole game in about 20 seconds of
  stepped simulation. I can't give a measured length for a real play.

## Decisions I made

The full list is in [DESIGN.md](DESIGN.md#decisions-i-made). The ones you'll notice:

* **Names.**
  * The headland is **Ceann Bán** and the village is **Port na Rón**.
  * Reefs: *An Charraig Dhubh*, the Sisters, the Comb, Gull Ledge, the Bar, the Lip, and **the
    Rakes**, which I added.
  * The Irish is limited to real words and phrases whose grammar I'm sure of. Ship names are plain
    English or real Irish.
* **The old keeper is "Fran—".** It could be Francis or Frances, so their gender stays open too. It
  is never completed.
* **Timeline.** 2–17 September 1957; the epilogue is undated. E1–E3 are nights 17–19 internally.
* **The Rakes.** A reef line across the north channel on nights 6, 8, 11 and 14, so the middle of
  the game isn't the same short cut every night. Every night is still checked solvable by
  `tools/check-nights.mjs`.
* **Night 15's wrong tide** is written so a careful reader can catch it. The Keeper's own note
  says the water looks low.
* **Manannán** is a tall cloaked silhouette on the water at the edge of the beam. He has no face,
  and mist moves against the wind at his feet. He is grey, not black, and kept still and distant
  so he reads as uncanny, not frightening. Please look at this one, because it's a judgement call
  (screenshot 10).
* **Dawn page.** The Keeper logs lamp-lit and lamp-out times (approximate west-coast sunset and
  sunrise) and the oil, then draws a little row of the boats that came in.
* **Sound control** is a small HTML speaker button. Everything else is painted on canvas.

## Known issues

* **Plain `python3 -m http.server` lets the browser cache modules.** After updating the code, a
  player may need a hard refresh. `tools/serve.py` avoids this during development.
* **Performance was only measured on this Mac.** The debug panel showed around 140 fps in the
  browser pane. The shader
  is one full-screen pass with several texture lookups and fBm, which could be heavy on a weak
  integrated GPU at DPR 2. Half-resolution fog would be the first fix.
* **The pencil "?" hint** only checks the biggest boat on the night. It's a hint, not a guarantee.
* **Debug jumps straight to `phase=dawn`** sail the solver's route to fill in the record, so the
  dawn page there isn't from your own plan.
* **Phone portrait bay scenes are small** (see "What's simplified").

## Top 5 for V2

1. **More bay viewpoints.** A gallery view at dawn, a harbour-wall view on arrival days, a high view
   on the final night. The art pipeline already supports it; each view needs its own painting.
2. **Fuller vignettes.** Nora behind her counter, Tadhg at the slip, Síle drawing, with small
   animation (steam, a page turning). These are where the village's warmth should land, and they
   are the thinnest part of V1.
3. **Accessibility.** Keyboard waypoint editing (arrow keys move a cursor on the chart, Enter
   places), text size, reduced motion (no wobble or bloom), and captions for sound cues.
4. **Portrait compositions** of the bay and the finale for phones, and an automatic quality tier
   (half-resolution fog, a lower layer cap) for weak GPUs.
5. **An after-the-end book.** Once finished, the title opens the logbook as a keepsake: every page,
   the found drawings, and the record of who came home. A small reward for the people who read
   everything.

## Look at these first

Screenshots are in [docs/screenshots](docs/screenshots):

1. `10-night16-manannan.jpg`: the final night, the figure in the haar.
2. `13-finale-last-sunset.jpg` and `14-finale-fade-to-paper.jpg`: the ending.
3. `01-title.jpg`: the title at sunset.
4. `06-night9-haar.jpg`, then `03-night1-bay.jpg`: haar against a clear act-1 night.
5. `02-night1-logbook-dusk.jpg` and `07-night11-logbook-dawn.jpg`: the logbook, dusk and dawn.

Live, with motion (`?debug=1`):

* `night=16&phase=night`, and wait about 40 seconds for Manannán.
* `finale=sunset`.
* `night=13&phase=night` for Mag Mell.
* `night=1&phase=dusk` to try the planning.

## How it was verified

* `?debug=1&autoplay=1` runs from the title through every night, the epilogue, the finale and back
  to the title. It completes with no console errors or warnings, with and without audio running.
* `node tools/check-nights.mjs` shows every night solvable within its ink and turn limits.
* **Planning** was checked with mouse and touch events:
  * placing, dragging, undo, rub out
  * the ink limit, and inking through to the night
  * the same on the mobile preset (375×812)
* **Saving:**
  * Save, reload and Continue works.
  * With every `localStorage` call throwing, the game plays on without saving and with no errors.
* **Audio:** an offline render was checked for levels with no NaN or clipping.
* **Screenshots:** every distinct scene was reviewed at 1280×800 and iterated on.

## First person: the hands (milestone 3)

The keeper is only ever two forearms and hands (`src/world/hands.js`). Each arm is one skinned mesh:
forearm and palm are a single loft, so there is no seam at the wrist, and the fingers and thumb are
tubes along their bone chains. A separate wool sleeve mesh is pushed up to just below the elbow.
The skin uses the same `wash` material as the room, through the four watercolor layers. It adds
a per-vertex tint:
* warm on the backs, cooler between the knuckles, pink at the nail beds;
* a graphite smudge on the right little finger;
* ink on the right index, middle and thumb that builds over the nights (`uStain`, 0.12 → 0.87 by
  night 15).

**Poses.** Eleven hand-authored poses blend into one another: walk, door, lean, write (tripod
pencil), pen (dip pen), turn, close, chair, mug, lamp and rail. Each pose places the wrist in a
frame: the body, the book, the turning leaf, the cover, the chair, the mug, the lamp lever, the door
ring or the stair rail. Two-bone IK then solves the shoulder to the wrist, and the roll is shared
between the forearm's twist bone and the wrist.
* **Writing.** The pencil's tip sits exactly under the cursor. The tip sets where the wrist goes, so
  there is no spring lag. The thumb, index and middle finger were fitted to the shaft by a small
  optimiser (`__review.fit('write')` under `?debug=1`).
* **Movement.** Every other target is on a spring with a little overshoot. The hands breathe, and a
  tremor grows with `drift`.
* **Debug.** `H` cycles the poses in play.

**Review.** `__review.hands()` (debug) holds each pose where it is naturally seen, under day, dusk
lamp, night and haar. It tiles the four into `docs/screenshots/hands-<pose>.jpg`. The first round
found several bad poses, which were fixed:

| Pose | Problem in the first round | Fix |
| --- | --- | --- |
| all | A seam at the wrist | Forearm and palm as one loft |
| write and pen | The tripod rolled over, and the fingers missed the pencil | Grip fitted to the shaft |
| lean, write | The left hand splayed and floated off the page | Flatter `FLAT` shape, hand lowered onto the page, hands moved to the book's corners |
| turn | The hand followed the leaf up into the camera and filled the frame | The fingers lift the near corner and the hand stays low |
| close | A fist pressed through the cover | Palm under the cover's edge, tilted away |
| chair | Claws seen from straight above | Chair moved to the window with longer arms; the keeper sits back, so the hands rest at the bottom of the view and the bay fills the window |
| mug | The palms met in a blob over the mug | Mug brought up into view; hands cup its sides |
| lamp, door | Arms floated from out of reach | Camera brought within arm's length; overhand grip on the lever |
| walk | Hands never in view | Carried a little forward; fingertips show when looking down |
| haar | Looked the same as dusk | `setLight` greys and flattens the light with the night's haar |

Sheets: [write](docs/screenshots/hands-write.jpg), [pen](docs/screenshots/hands-pen.jpg),
[lean](docs/screenshots/hands-lean.jpg), [turn](docs/screenshots/hands-turn.jpg),
[close](docs/screenshots/hands-close.jpg), [chair](docs/screenshots/hands-chair.jpg),
[mug](docs/screenshots/hands-mug.jpg), [lamp](docs/screenshots/hands-lamp.jpg),
[door](docs/screenshots/hands-door.jpg), [rail](docs/screenshots/hands-rail.jpg),
[walk](docs/screenshots/hands-walk.jpg).

**Still rough.**
* Reaching for the lamp and the door, the upper-arm sleeve is in view and the hand is small. That is
  how it really looks, but it isn't pretty.
* The turn and close poses are momentary, so they were checked only at a held frame.
* The view out of the window is still the placeholder sea and cliff. The bay comes in milestone 4.

## First person: the night from the chair (milestone 4)

The plan is inked, the keeper pulls the lamp lever and sits in the chair at the window. The camera
never cuts: dusk deepens into night around the chair over about nine seconds, and the night runs
until dawn.

**The bay** (`src/world/bay.js`) is built from the chart, at 4 m to a chart unit.
* **Land.** The terrain comes from the `LAND` polygons by signed distance. It is tinted by height and
  slope: grass, rock, shingle and seabed.
* **Water.** The sea is a disc of rings around the tower, its colour graded near to far from
  `night.palette`.
* **Features.** The stacks, the reefs (their tops at the tide's height, so they show and hide with
  it), the village with lit windows and their reflections, and the piers.
* **Ships.** Three sizes, each with a hull, sails, a lantern and a halo. Each also has a reflection,
  a shadow and a wake.
* **Light.** The beam is a cone on the lamp, with blur copies, and a moon with its road on the water.
* **The beats.** Mag Mell, out on the open horizon. Manannán, a robed figure in the haar.

**The night** (`src/world/night.js`) drives `Fleet` with the inked waypoints, so the boats sail
exactly the inked line.
* **Pace.** Boats move at a believable 4 m/s. The 2D game's story clock (reef at 16 s, Mag Mell at
  20 s) is kept by dividing.
* **Time-lapse.** The night runs at ×5. It eases to ×1 when:
  * a boat comes within reach of a hazard (looking 0, 3 and 6 units ahead);
  * a boat arrives or strikes (held for a few seconds);
  * a beat is happening: the reef rising, the phantom reflection, Mag Mell, or Manannán.
* **Beam.** The beam turns with the night's time, so a fast night blurs it into a fan of copies.
* **Length.** A typical night lasts about two and a half minutes in time-lapse.

**From the chair.**
* **The windowsill:**
  * A carriage clock keeps the night's hour (21:00 to about 05:40), as does the wall clock.
  * A paraffin lamp's oil goes down and the flame gutters near dawn.
  * The mug comes off the sill into the hands for a sip three times a night, and the tea goes down.
  * A folded note reads "let the night run on / let the night be slow". Clicking it, or Space,
    ticks the other line and switches the time-lapse. Debug `F` and `T` stack on top.
* **The sky.** The moon climbs across the window and the stars wheel about the pole.
* **The water.** Clicking the water holds the beam there for five seconds, on a boat if one is near.
  A ray is cast to the tide plane; land and the room's walls are ignored.
* **The HUD.** Rain streaks on the glass, clipped to the window, on rain nights. Near dawn the
  eyelids get heavy and blink.
* **Looking around.** The view turns a little by drag or the arrow keys; the body stays put.

**Dawn.** The night ends and the scene crossfades to dawn in the chair (time has jumped).
* The boats are moored, or wrecked where they struck.
* "E — over to the logbook": the keeper gets up and leans over the book with no cut. The dawn page
  writes itself, as before.

**Look.**
* Grading follows `night.look`, warming with dusk and cooling into night.
* The composite's depth fog takes the night's haar.
* `clear` is placed by projecting Mag Mell to the screen; `cloak` by projecting Manannán.
* The beam glows when seen from the side. Seen from under the lamp, along the beam, every surface
  is grazing, so the glow comes from looking down its length instead.

**Changes to earlier milestones.**
* **Window.** It is wider (0.78 m half-width) with a single transom above a seated eye, so the
  horizon is not hidden behind a glazing bar.
* **Aim.** The room now faces chart (50, 30), so the reefs fall inside the window.
* **Seat.** The chair pose sits back with the hands on the chair arms at the bottom of the view.
* **Camera.** The near plane is 0.06 m.

**Debug.**
* `C` free-fly: WASD, E/Q for up and down, drag to look, Shift for speed.
* `T` cycles the time scale: 1, 2, 4, ½, ¼.
* The debug panel's next-phase (`N`) still works through the night and dawn.

**Verified.**
* Nights 4 (rain), 6, 10 (new reef, phantom), 13 (Mag Mell) and 16 (Manannán) were each run to dawn
  under `?debug=1&view=fp&night=N&phase=night`.
* `?debug=1&autoplay=1&view=fp` runs from the title through all 19 nights and the finale back to the
  title with no console errors.
* `node tools/check-nights.mjs` passes.
* `?view=classic` (the default) is unchanged.
* The bay adds about 1.2 ms a frame at 1920×1458 on this Mac.

Screenshots:
* [night 6](docs/screenshots/17-night6-chair.jpg)
* [a sip of tea](docs/screenshots/18-night6-chair-tea.jpg)
* [Mag Mell](docs/screenshots/19-night13-mag-mell-chair.jpg)
* [Manannán](docs/screenshots/20-night16-manannan-chair.jpg)
* [rain](docs/screenshots/21-night4-rain-chair.jpg)
* [dawn](docs/screenshots/22-night10-dawn-chair.jpg)

**Still rough.**
* **The window is narrow for the chart.** Ships enter on the far west, about 90° left of it, so each
  boat appears some way into its route. The newest reefs sit at the right edge.
* **Small boats are small.** At 300 m a boat is a few pixels with a lantern. Its lantern and the
  beam's hit carry it.
* **Where the beam meets the land.** It leaves a soft round pool on the far hill.
* **The terrain from above.** Free-fly shows straight creases along the land's grid. They aren't
  visible from the chair, but the headland walk (milestone 5) will need them softened.
* **Audio.** Footsteps and room tone with reverb are not in yet; they come with the walk in
  milestone 5.

## First person: the day, the places and the stairs (milestone 5)

The afternoon is now spent out of doors. The keeper starts in the watch room at two o'clock with the
door shut, walks out round the headland to one place, reads its vignette there, and the light fails.
The finale's stairs are climbed in first person.

**The headland** (`src/world/headland.js`).
* **Walking.** You walk on the bay's own ground mesh (`bay.groundAt`). You can't go below the tide
  line or up a slope steeper than about 0.9; on either, you slide along x or z instead of stopping.
* **Collisions.** The village houses, the place pieces, and the tower wall, except through the
  doorway when the door is open. The doorway is a corridor through the wall; inside it you are held
  between the jambs.
* **The lane** is worn into the grass as a footpath about two metres wide (it was a broad track).
* **Underfoot** is tracked for the footsteps: boards in the tower, stone at the step and the slip,
  gravel on the lane, grass elsewhere.

**The afternoon.**
* **The clock** runs from 14:00 to 19:00 at 0.6 game minutes a second.
* **The light.** The sun moves from the south-west at 40° down to the dusk sun. From 17:30 the
  light mixes toward dusk, so sky, sea and grading warm as you walk. The light (and the sea's
  colour) is recomputed every five game minutes.
* **The time-lapse pace.** Far from the tower and the places (from 18 m, full by 48 m), the walk runs
  at up to ×5, capped at 14 m/s. The FOV opens a little, and footsteps keep a walking cadence.
* **A change to the plan:** the clock runs on at √pace, not ×pace. With the clock tied one-to-one
  to the stride, the lane to the cottages (about 750 m) took longer than the whole afternoon. Now a
  walk to the village arrives about 16:50, and to the cottages about 17:20.
* **The village by day:** no lit windows (`bay.setLights(night, false)`).

**The places** (`src/world/places/`).
* One file each: `lighthouse.js` (the oil shed), `cliff.js`, `village.js` (the shop and the pub),
  `harbour.js`, `cottages.js` and `school.js`.
* Each has a `// TODO: placeholder` header and exports `id`, `trigger`, `approach`, `build(scene)` and
  `onEnter(game)`.
* They are greyboxes at their real chart positions, plus the cliff's bench and cairn and the
  harbour's bollards and crates.
* Each has a painted sign with its name and line from `PLACES`. The plan only located the shed's
  sign; the others are placed by their triggers, because the brief asks for a sign at every place.
* **Walking into a trigger** starts the place, with no button. A place not on tonight's list shows
  "nobody about today". After one visit, the other triggers do nothing.
* **The places are hidden outside the day**, so the view from the chair is unchanged.

**The keeper's day** (`keeper.js`, new mode `'day'`).
* **Wrappers** for `daymap`, `vignette` and `finale` join `logbook` and `bay`. `vignette` is seamless
  when you walk into a place; `leave()` (debug N) goes straight to dusk.
* **The door.** "E — open the door" by the door. The 'door' hand takes the ring (the frame now
  follows `room.door.ring` as it swings) and pulls. The keeper then steps back on the latch side,
  clear of the swing, and the door swings in.
* **Reading.** The place's lines are lettered over a soft paper panel in the lower part of the view,
  laid out as `village.js` does: the title, the last four lines with older ones fading, speakers in
  italic, the keeper's thoughts in their own hand. Click, tap, Space or E advances.
* **The light fails.** After the last line, the hour runs on to 19:00 over seven seconds while you
  can still walk; then `game.toDusk()`, whose crossfade is the bloom. If you go nowhere, the same
  happens at seven. Leaning on the table by day ("E — wait here for dusk") starts it at once.
* **By day the logbook lies shut on the table**, as it was left at dawn.
* **The arrival (night 1)** starts on the lane about 50 m east, facing the tower, with the door open
  and the hour at 18:06. The arrival text is read there; the light fails as you step inside.
* **At dusk** the door is shut again, the places are put away and the pace is reset.

**The finale stairs.**
* The keeper climbs the spiral stair one tread per click, tap, Space or ↑, with the old 0.55 s pause
  between treads. The hand is on the rail one tread ahead, framed as in the hands review.
* `STAIRS.lines` are lettered in the keeper's loosened hand.
* The view is graded like the 2D climb (warm, not the epilogue's washed palette).
* Near the top, the view looks up into the hatch, where the lamp room's light shows (a warm glow,
  only in the finale). Then `game.go('finale', {part: 'sunset'})` blooms into the 2D last sunset.
  The finale wrapper hands the sunset and end card to `FinaleScene`, including its keys.
* **A change to the plan: 8 treads, not 14.** The watch room is a single storey and the lantern sits
  on its roof, so there is nothing above the ceiling but the underside of the gallery floor. By the
  ninth tread the eye would rise into that empty gap. The hatch in the ceiling now opens over the
  upper half of the flight (from tread 6), so the head clears it. The 2D climb was nine clicks.

**Audio.**
* **Footsteps** for each surface (`sfx.footstep`) and the door's latch and hinge (`sfx.door`).
* **Room tone:** a quiet bed of low, filtered brown noise.
* **Two spaces:** a short stone-room convolver indoors and an almost dry open-air one with two faint
  slaps outdoors. `audio.setSpace('in' | 'out')` crossfades them as you cross the door. Indoors by
  day, the walls also take the top off the sea outside.
* The 2D game never calls `setSpace`, so it sounds as before.

**Autoplay** walks the route to `night.day.focus` with `routeTo` (`walker.autoTo` steers), opens
the door itself, reads the place and lets the light fail. On the arrival it walks in at the door.

**Verified.** There was no GPU here. Every check ran in headless Chromium 141 with SwiftShader
(software WebGL2), driven by Playwright, with time stepped by `__game.step()`.
* **Load.** The M5 code from 8d84ca3 loaded with no errors.
* **Every place on a night it's available.** Under autoplay, nights 2 (village), 3 (cliff),
  4 (harbour), 12 and 13 (cottages), 14 (school) and 17 (shed) each walk from the room, through the
  door, to the place, read it, and come to dusk. Night 1's arrival runs too.
* **Full run.** `?debug=1&autoplay=1&view=fp&speed=4` runs from the title through all 19 nights
  (19 places read, 19 dawns closed), the stairs, the sunset and the end card, back to the title,
  with no console errors, and logs `AUTOPLAY COMPLETE`. This run was logic only (painting skipped;
  see the debug note below). Every scene in it was also rendered somewhere in these checks.
* **Classic.** `?debug=1&autoplay=1&speed=4` (classic) runs title to title with no errors, rendered.
* **check-nights.** `node tools/check-nights.mjs` passes.
* **Input.** With dispatched key events: the door prompt, E to open it, W to walk out through the
  doorway, the tower wall stopping you elsewhere.
* **Audio.** With audio started by a click: footsteps on wood, stone and gravel, the door, and the
  space switching in → out → in.
* **The chair.** Night 6 from the chair at 1280×980 matches `17-night6-chair.jpg`: the same land at
  the head of the bay, the village and the sill. Only the beam and the moon are elsewhere at that
  moment.
* **Lint.** ESLint shows no undefined names.
* **Debug addition:** `game.noRender = true` (debug only) skips painting, so long logic runs finish
  in minutes under software rendering.
* **A test-browser artefact, not a game change:** headless SwiftShader can drop a canvas clear right
  after the canvas has been uploaded to WebGL, leaving the last HUD panel behind. M4's real-browser
  shots show no such thing (the rain streaks don't pile up), so the test browser was given CPU
  canvases instead.

Screenshots (1280×800, software-rendered):
* [opening the door](docs/screenshots/23-night2-door.jpg)
* [out of the door](docs/screenshots/24-night2-out-of-the-door.jpg)
* [the lane](docs/screenshots/25-night2-lane.jpg)
* [the shed](docs/screenshots/26-night2-shed.jpg)
* [the village](docs/screenshots/27-night2-village.jpg)
* [the light failing](docs/screenshots/28-night2-light-fails.jpg)
* [the cliff](docs/screenshots/29-night3-cliff.jpg)
* [reading at the harbour](docs/screenshots/30-night4-harbour-reading.jpg)
* [the cottages](docs/screenshots/31-night12-cottages.jpg)
* [the school](docs/screenshots/32-night14-school.jpg)
* [the arrival](docs/screenshots/33-night1-arrival.jpg)
* [the stairs](docs/screenshots/34-finale-stairs.jpg)
* [up into the hatch](docs/screenshots/35-finale-stairs-hatch.jpg)

**Still rough.**
* ~~**The tower from outside is squat.**~~ Since fixed: `src/world/tower.js` raises a 28 m tower over
  the watch room. It is a limewashed granite shaft with a painted, weathered skin, granite corbels and
  gallery, and a red cupola over diamond glazing and a Fresnel lens. The lamp is now 23.9 m up, and
  the beam dips to cross the bay where it used to. See `docs/screenshots/tower-*.jpg`.
* **The ground close up is soft.** The terrain's pigment noise is large-scale, so the grass at your
  feet is a smooth wash. The ink also picks out long creases where ridges overlap.
* **Greyboxes are greyboxes.** Plain blocks with dark doors, by design (placeholders). The church
  wall shows as a pale wedge edge-on.
* **The time-lapse pace** has no sound or look of its own beyond the wider view and the clock.
* **Not checked on real hardware:** frame rate, the look under a real GPU, pointer lock and the touch
  stick on a phone. The door's step-back and the stairs' rail grip were checked only at held frames.

## First person by default (milestone 6)

**First person is now the game.**
* The plain URL plays first person; `?view=classic` is the original 2D game, kept whole. Every
  debug key and URL parameter works with either.
* If the 3D world can't be built on a device (its modules fail to load or construct), the error goes
  to the console and the 2D game plays instead. Checked by blocking `world.js` in the test browser:
  the 2D day map came up.

**Docs.**
* README describes playing in first person: the controls for mouse and keyboard and for touch, and
  each phase as you now play it.
* README's debug section gains `C`, `T`, `H`, `view=classic`, `test=room`, `__game.step` and
  `__game.noRender`.
* DESIGN has a "First person" section (how the 3D world renders through the same watercolor layers,
  the keeper's wrappers over the old phase machine, a day, the finale) and "Decisions made for first
  person". Its file list covers `src/world/`.

**Verified** (headless Chromium with SwiftShader, as in M5):
* `?debug=1&autoplay=1&speed=4` (now first person) runs from the title through all 19 nights
  (19 places walked to and read), the stairs, the sunset and the end card, back to the title. It
  logs `AUTOPLAY COMPLETE` with no console errors. Logic only, with painting skipped.
* `?debug=1&autoplay=1&view=classic&speed=4` does the same in 2D with no errors.
* `node tools/check-nights.mjs` passes.

Screenshots:
* [leaning over the logbook at dusk](docs/screenshots/36-night5-logbook-lean.jpg)
* [lighting the lamp](docs/screenshots/37-night5-lighting-the-lamp.jpg)
* [the dawn page](docs/screenshots/38-night5-dawn-page.jpg)
* [the logbook on a phone held upright, 375×812](docs/screenshots/39-phone-logbook-first-person.jpg)

**Not done here, and worth doing on real hardware:**
* Time a human playthrough.
* Measure the frame rate on an integrated-GPU laptop and on a phone (the brief's 60 fps target).
* Try pointer lock and the touch stick.
* Look at the watercolor under a real GPU against these software-rendered shots.

## The hands, remodelled (milestone 7)

**One continuous old skin** (`src/world/handmesh.js`). The old arm was a lofted forearm and palm with
separate tubes for the fingers, which looked like sausages pushed into a mitten. The new one is built
the way an anatomy drawing is: bony shapes smooth-unioned into one signed distance field.
* **The shapes:** the forearm, the palm slab, the long bones of the hand with their knuckle heads, the
  ball of the thumb, the heel of the hand, the pads under the knuckles, the webs between the fingers
  and the thumb, and phalanges with joints wider than the shafts between them.
* **Meshing.** The field is meshed once with surface nets (1.25 mm grid, each vertex pulled onto the
  surface, normals from the field). Sealed pockets between the shapes are dropped.
* **Weights.** Each vertex is weighted to the bones by which part of the hand owns it: the nearest
  part, softly. Along a finger, the joint blends are short.
* **Bind pose.** The skin is built with the fingers spread, so they can be told apart; every finger
  pose is now absolute.
* **An old man's hands** (the drawing references agree: less fat, so bone, tendon and vein show).
  * Big knuckles and knobby finger joints.
  * Extensor tendons, and wandering raised veins on the backs of the hands and up the forearms,
    painted blue-grey.
  * Age spots and mottling.
  * The skin shader (`skin: true` on `wash`) draws, in the ink layer, bunched wrinkles over the
    knuckles, a crêpe of fine crossing lines on the backs, and each nail's outline.
  * Skin takes softer light bands than the room (`band`, `bare`), so small forms don't turn into
    hard stripes.
* **The sleeves** now run up over the shoulder and close, so from above they no longer show as open
  tubes.
* **Building it.** About 64k vertices per arm, about 1.4 s to build in this container. It's done in a
  module worker started at boot, alongside the fonts, so the loading screen stays live. `prepareSkin`
  falls back to building in place.

**No more shaking.**
* The tremor (23–37 Hz wobble on every wrist target, growing with drift), the finger jitter, the
  breathing bob and the under-damped spring are gone.
* Wrists now follow their targets critically damped. Nothing overshoots.
* Held in any pose, a hand moves **0.000 mm a frame**. Before, it was 0.17–0.38 mm a frame, up to
  1.3 mm while writing.

**Natural wrists.**
* **The elbow.** The IK puts the elbow where the forearm meets the hand as a wrist likes it.
  Otherwise it leans on the body's pole, and it swings round at a limited rate.
* **The forearm's turn** is one continuous angle from its neutral (thumb-up) position, within ±100°,
  shared down the arm. It no longer wraps round from +180° to −180°.
* **The wrist** is held inside an elliptical cone of its real range: 55° back, 65° forward, 20°
  toward the thumb, 30° toward the little finger, and little twist of its own.
* **Hanging hands** follow their arms (`align`).
* **The arms ride with the body**, and at a cut they are simply placed where they belong.
* **Poses can place a point of the hand.** The fingertips go under the cover's edge, and the palm
  over the lever's ball (`at`). The cover and lever grips were fitted by a small search for the most
  comfortable wrist.
* **Checked** with a per-pose wrist report and a frame-by-frame trace of a whole autoplayed night.
  * Before: hanging hands bent 78–103°, the lamp grip 153°/305°, and transitions flipped the wrist up
    to 154° in one frame.
  * Now: every pose is within range (at most 39° back, 30° forward, 17° toward the thumb, 28° toward
    the little finger).
  * The worst transition is about 50° in a frame, and only under autoplay's compressed timing.

**Never over the journal.**
* Leaning over the book, both hands rest on the table beside it. The fingertips reach at most to the
  leather beyond the pages.
* The pencil comes onto the page only while you are drawing (and for a second after). Otherwise the
  page's own crosshair shows.
* The left hand never goes onto the pages.
* The cover is lifted at dawn with the fingertips and let fall.

**Inking with a quill** (`src/world/inkwell.js`, `Keeper.inkSteps`). After the pencil line, *Ink
the plan* now plays out:
1. The head turns to the right of the book.
2. The pencil is set down in the tray, point first, and falls flat.
3. The hand takes the inkwell and slides it in beside the book.
4. It draws the goose quill out of the well and dips it.
5. It inks the line: the nib follows the route exactly, sliding smoothly between its points.
6. The quill goes back in the well before the keeper straightens up.

How it fits together:
* The logbook's inking waits (`inking.hold`) until the nib is on the line. 2D play is unchanged.
* The quill and the inkwell (glass with a brass collar, ink inside, the barbs of the feather drawn in
  ink) are drawn in code, and the old dip pen is gone. The inkwell that was baked into the table
  mesh was removed, and the red book moved back a few centimetres to make room for the hand.
* The pencil grip was refitted to the new fingers.

**Verified** (headless Chromium, SwiftShader):
* `?debug=1&autoplay=1&speed=4` runs the whole game, all 19 nights with the inking each dusk, to
  `AUTOPLAY COMPLETE` with no console errors.
* `node tools/check-nights.mjs` passes.
* The debug studio camera (`__review.studio(pose, {hand, az, el, dist})`) and the `show` pose were
  used to look at the hands from every side.

Screenshots:
* [the skin from four sides](docs/screenshots/40-hands-old-skin.jpg)
* [holding things: pencil, lever, mug, cover](docs/screenshots/41-hands-holding.jpg)
* [inking the plan with the quill](docs/screenshots/42-inking-with-the-quill.jpg)
* [before and after](docs/screenshots/43-hands-before-after.jpg)
* [both hands beside the book, the pages clear](docs/screenshots/44-hands-beside-the-book.jpg)
* The `hands-<pose>.jpg` sheets were regenerated, and `hands-ready.jpg` was added.

**Still rough.**
* **Covering while writing.** While drawing, the pencil hand covers the page below and to the right
  of its point, and so does the quill hand while it inks. A hand can't write otherwise.
* **The right hand at rest** lies beside the book, outside the leaning view's frame (only the left
  one shows). That's how the camera is framed.
* **Momentary poses.** The cover-lift is mostly hidden behind the cover. In the mug pose, the
  fingertips stop just short of the mug.
* **Mesh defect.** Three sub-millimetre flipped triangles where a vein crosses a tendon on the back of
  the wrist.
* **Build time.** On a slow phone the skin may take a few seconds to build. It does so while the title
  shows.
* **Hardware.** Everything was seen only in software rendering, not yet under a real GPU.


## The hands against the room: the tests first (milestone 8, phase 0)

The brief is `docs/prompts/hands-contact-solver.md`: a contact solver on top of the authored poses,
so the hands stop clipping, grip what they hold and stop twisting oddly. Its phase 0 is the testing
method, built and run on the M7 hands **before any solver code**. This section is that baseline.
Nothing here changes what the player sees; the only edits to the game are that `Builder` records each
piece it places, the logbook's height function is exported, and debug mode installs the harness.

**Run it:** `node tools/check-hands.mjs` (about 7 minutes here; `--quick` for about 4). It starts its
own server and headless Chromium, prints a pass/fail table per test and per interaction, and writes
everything to `docs/hands-check/<label>.json` and `.md`. `--shots` renders the sheets below. The
thresholds are single constants in `src/world/contacts.js` (`THRESH`): penetration 2 mm, grip 1 mm,
resting 2 mm, nib 0.5 mm, 25° a frame at 30 fps, twist floor 70%.

### How it measures

* **The skin.** Every vertex of both arms, skinned on the CPU with the same sums the GPU does: 63,644
  skin and 1,475 sleeve vertices per arm, 130,238 points a frame. Checked against three.js's own
  skinning: within 0.015 mm (float rounding).
* **The colliders** (`src/world/colliders.js`) are built from the pieces the room was drawn with, so
  they match what is on screen, polygons and hand-made tilt included (the table top is 0.14 mm off
  level where the book lies). There are 29 of them: the table, tray, tin, almanac, oil lamp, the
  logbook (its board, and its pages as the same height field that shapes them), the cover, the
  turning leaf, the inkwell, the pencil, the quill, the mug, the lever and the lamp control, the door
  and its ring, the rail and stairs, the chair, the sill, the window, the shelves, the stove and the
  round walls. Spot checks: 1 cm above and below the table top read +10.1 and −9.9 mm; the lever
  ball's centre is as deep as its inner radius; a point 5 mm over the page reads 4.996 mm.
* **Penetration both ways.** Skin vertices inside any collider, and probes down the middle of thin
  things (pencil, quill, rail, ring, leaf, vanes) inside the skin, found from the nearest skin vertex
  and its normal. Reported per object, as the worst frame and the 99th percentile of frames.
* **Contacts** (`src/world/contacts.js`): parts of the hand are sets of skin vertices (each
  fingertip's pad, each phalanx's pad, the palm, the heel, the little-finger edge, the underside of
  the forearm). Each pose names what they should touch and when (settled; while a tool is held; at
  the moment a tool is taken or put down; for as long as the hand moves the lever, the ring, the cover
  or a page).
* **Joint angles** (`src/world/anatomy.js`): every joint against the AAOS normal ranges (elbow 0–150°,
  forearm turn ±80°, wrist 70° back, 80° forward, 20° toward the thumb, 30° toward the little finger,
  knuckles −45..90°, middle joints 0–100°, end joints −10..90°, thumb MCP 0–50°, IP −20..80°, thumb
  base palmar abduction 0–70°), how far each moves in a frame, and the forearm's roll for flips.
* **Scenarios:** every pose held; the whole dusk at the table as the game plays it (leaning in, a
  pencil stroke, a page turned back and forward, the inking, the lamp lever, the walk to the chair, a
  sip from the mug, dawn, getting up, closing the book) stepped at up to 150 frames a second so every
  moving thing takes 120–775 steps; the door; the stairs; a whole autoplayed night (10,657 frames at
  30 fps); the pencil and the quill pressed at 384 places over the page, in landscape and phone
  portrait; the inking replayed with the book and the inkwell nudged 3 cm (and the book turned 3°);
  the forearm turned from −120° to +120°.
* **Checked by eye:** the debug overlay's x-ray (key O) hides the props and reddens skin inside them;
  screenshot 45 shows the red exactly where the clipping is.

### Baseline (the M7 hands)

Tests: 1 penetration **fail**, 2 contact **fail**, 3 motion range **fail**, 4 joint angles **fail**,
5 skin twist **fail**, 6 fuzz **fail**, 7 stability pass, 8 speed pass, 9 visual pass. Every
interaction fails. All the numbers are in [docs/hands-check/baseline.md](docs/hands-check/baseline.md).

| interaction | worst penetration (mm) | contacts out of tolerance (worst gap) | joints |
| --- | --- | --- | --- |
| resting beside the book | table 34.8, tray 18, book 17 | heels and fingertips are *inside* the table | right thumb end joint −21°, middle end −11° |
| pencil, resting and writing | table 25, book 19, tray 13, pencil 5 | middle finger 8 mm off the shaft; nib off its line up to 237 mm (start of a stroke), off the page 113 mm (phone) | thumb end joint −34° (AAOS −20°), middle end −17° (−10°) |
| quill and inkwell | table 35, inkwell 21, book 19 | thumb, index and middle 37–76 mm off the quill; palm 36 mm and fingertips 54 mm off the inkwell; nib off its line 7 mm (inking), 118 mm (phone) | thumb end joint −34° |
| page turn | table 25, book 17, leaf 10 | fingertips never reach the corner (299 mm) while it lifts | thumb −34° |
| cover | table 25, book 13, cover 7 | thumb and fingertips 307 and 274 mm from the cover while it lifts | forearm turn 115° |
| lamp lever | lever 36, tin 29 | palm up to 72 mm and fingertips 116 mm off the lever during the pull | forearm turn −115° |
| door ring | walls 88 (103 under autoplay: the right sleeve in the wall), door 25, ring 22 | fingers 228 mm off the ring while it opens the door | left elbow 58° → 10° in one frame |
| mug | mug 39, chair 35 (sleeves) | fingertips 7–15 mm off the mug | |
| stair rail | rail 31, walls 14 | palm up to 47 mm, fingertips 33 mm off the rail | |
| chair arms | chair 40, tin 30 | forearms 15 mm above the arms | forearm turn −115° |
| walking arms | chair 40, table 33, lever 18 (only in the blends to and from walking) | | forearm turn −115° |

What that says:
* **Resting hands sink into the table.** The left thumb hangs 25 mm into it and the heels and
  fingertips are 10–12 mm in. Seen from the eye, the table hides it.
* **The lamp lever (the brief's example), confirmed by measurement.** At rest the thumb is 26 mm
  inside the ball. Through the pull the elbow straightens to 10° (the arm at full stretch, chasing
  the lever round its arc), the wrist reaches the edge of its range (0.99 of the limit) and the
  forearm turns to −115°, 35° past what a forearm can. The palm is up to 72 mm off the lever.
* **The hand reaches its grip after the thing has started moving**: the page lifts, the cover rises
  and the door opens before the hand gets there.
* **The tripod grips** bend the thumb's end joint back 34° (a thumb manages 20°) and leave the middle
  finger 8–10 mm under the shaft; the quill is held with the thumb 37 mm away.
* **Writing:** where the wrist can bend, the pencil's point is exactly on the cursor (0.000 mm). Near
  the bottom of the left page the wrist's limit swings it 20 mm off. A stroke starts drawing at the
  cursor before the pencil arrives. On a phone held upright the point misses everywhere (113 mm).
* **Stillness and repeatability hold**: a held hand moves 0.0000 mm a frame, and two runs give
  identical numbers. **Speed:** the whole hands update takes 0.04 ms a frame here; the skin builds in
  1.85 s (2.3 s in the worker).
* **Skin twist:** the forearm never collapses (at least 86% of its rest width even at ±115°). One or
  two sliver triangles (at most 0.003 mm²) turn over at half the angles, at 0° too: mesh noise.

Screenshots:
* [the contact sheet, x-ray](docs/screenshots/45-hands-contact-sheet-baseline.jpg): skin inside
  anything is red, the colliders outlined, 16 views with fixed cameras (kept in
  `docs/hands-check/cameras.json` so the same views can be taken after).
* [joint angles over each moving interaction](docs/screenshots/45-hands-joint-plots-baseline.png).

### Choices made where the brief was open (to confirm)

* **The forearm's turn** is read off the hand: the skeleton shares it out between the elbow,
  mid-forearm and wrist bones so the skin twists gradually, so no single bone's twist means anything
  anatomically. The wrist bone's share is reported, not limited.
* **Not in the AAOS table:** finger spread ±20°; the thumb base gated only on palmar abduction
  (0–70°), its other two angles reported.
* **Contacts:** a resting hand is its heel and three of four fingertips within 2 mm of the table; the
  writing hand also rests on its little-finger edge; the door ring is held by fingers hooked through
  it (their middle phalanges); "on its line" holds the nib within 0.5 mm of where the line is being
  drawn, writing and inking.
* **Speed budget (proposed):** the whole hands update, solver included, under 1 ms a frame here
  (JavaScript on a phone or integrated-GPU laptop is perhaps 3–4 times slower), and the skin's build
  no more than 10% slower than now.

### Not measured

* Fingers inside the palm or other fingers, and one hand inside the other, are measured but **not
  gated** (the self measure stops at its 8 mm search radius, so it says little).
* The skin is sampled at its vertices (about 1.25 mm apart); a sharp corner could poke between them.
  Thin things deeper than 12 mm inside the skin are found only where they go in.
* The leaf and the quill's vanes are sheets: only whether they pass through the skin is checked.
* The tray can't be nudged yet: it is part of the table's merged mesh.
* The shoulder has no range in the table, and the body is not modelled.
* Penetration in the autoplayed night is measured every fifth frame (every frame in the scripted dusk).
* How natural a pose looks, and frame time on a real GPU or phone.

## Nora (people, the first of three)

Nora Ó Sé now stands just inside the door of her shop in Port na Rón. She is drawn in code, in the
same wash as everything else, and the shop has a real front so there is a doorway for her to stand in.

**The shop** (`src/world/places/shop.js`).
* A whitewashed house with a slate roof and an oxblood shopfront: pilasters, a fascia with "N. Ó Sé,
  Grocer" signwritten in serif, a twelve-pane window, a door standing open inward, a stone step and a
  bench under the window (for Tadhg, later).
* Inside, just enough to be seen through the door and window: the counter, four shelves of goods, jars
  in the window, bread and paper bags on the counter, a dark doorway to the back room.
* A brass bell on a bracket over the door. It swings and rings (`sfx.shopBell`) when the shop's
  vignette starts, on nights before 13.
* **The ground is levelled under it.** The slope there put grass through the floor or left a 1.4 m
  plinth, so `bay.landHeight` now flattens a small pad (2.6 m radius, blended) under the shop. Nothing
  else on the map moves.
* From night 13 the shelves and window are bare.

**The figure** (`src/world/people/figure.js`), shared so Tadhg and Síle can follow.
* Shape helpers (`lathe`, `limb`, `blob`), a small skeleton (hips, chest, neck, two arms of shoulder,
  elbow and wrist), named arm poses mirrored left to right, and critically damped springs on every joint.
* Every frame: the arms ease toward the current pose plus any gesture laid over it (a nod, a hand
  offered); the chest breathes; the weight shifts from foot to foot every 5–9 s; and the look is shared
  out, the chest taking up to 25° and the head the rest within the neck's limits (±60° turn, -20° to
  +29° tilt). The head moves faster than the chest, so the head leads and the shoulders follow.
* A `slow` factor stretches all of it, for the later nights.

**Nora** (`src/world/people/nora.js`).
* Grey hair pinned up in a bun, a broad face with soft wind-reddened cheeks and only shading for eyes
  and brows (the "soft and simple" face), a moss cardigan with its sleeves pushed up over a blouse, a
  faded sprig-print wraparound pinafore over a dark skirt, thick stockings, black lace-ups and a striped
  tea towel over her shoulder. The face and print are small canvas textures.
* **Idle:** hands folded, breathing, weight shifting, and every 9–16 s she wipes her hands for a moment.
* **Noticing:** within 10 m she turns to you after half a second, head first, and lets you go a couple
  of seconds after you leave.
* **Reading:** she faces you throughout; on each of her lines she nods or offers a hand, and on lines
  about change she holds out her hand twice.
* **By night:** see the table. `stage(n)` holds it in one place.

| Nights | Nora |
|---|---|
| 2–7 | In the doorway, warm, quick to notice you |
| 8–10 | Slower (×1.4–1.8), takes almost two seconds to notice you, and every 7–12 s looks past you out to sea for a few seconds (not while she's speaking) |
| 11 | **Not shown.** That afternoon is the pub, and she speaks there, so the shop doorway is empty rather than having her in two places at once |
| 12 | Behind the counter, seen through the window, head down, leaning on it, not turning |
| 13 on | Gone; the shelves are bare. Night 15 is the empty doorway |

On nights when the village isn't one of the afternoon's places she isn't drawn at all.

**The hook.** A place file may now export `update(dt, ctx)`; `Headland.update` calls each one, with
`ctx = { night, eye, reading, audio }`. It is called from `Keeper.update()`, by day and only while the
headland is shown, not from `updateDay`, because `updateDay` doesn't run while a vignette is being read,
and that is when Nora most needs to move. `village.js` uses it for Nora and the bell.

**Screenshots.**
* [From the lane as you arrive](docs/screenshots/46-nora-from-the-lane.jpg) (night 2)
* [While reading](docs/screenshots/47-nora-while-reading.jpg) (night 2)
* [Close up, free-fly](docs/screenshots/48-nora-close.jpg)
* [Night 10](docs/screenshots/49-nora-night10.jpg), [night 12, behind the counter](docs/screenshots/50-nora-night12.jpg),
  [night 15, empty](docs/screenshots/51-nora-night15-empty.jpg)

**Still rough.**
* The face is plain, by choice, but close up it is near a doll's: a smooth ball with painted shading.
* Her hands are mittens with a thumb; at reading distance that's fine, close up it isn't.
* The cloth is rigid. The pinafore and skirt follow the hips but don't swing.
* On night 12 she is only visible through the window, not from the doorway itself.
* The pub across the lane is still a greybox.

**Checks.** `node tools/check-nights.mjs` passes. By day at the shop the frame rate is unchanged: 60 fps with Nora shown or hidden (median 16.7 ms a frame, 90th percentile 17.3 ms, in the desktop app's browser pane).
