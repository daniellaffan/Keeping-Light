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
* **The tower from outside is squat:** the one-storey watch room with the lantern on its roof, about
  7 m in all. On the arrival it reads more like a round hut than a lighthouse. Making it taller would
  move the lamp, the beam and the chair view, so it's left for a later pass.
* **The ground close up is soft.** The terrain's pigment noise is large-scale, so the grass at your
  feet is a smooth wash. The ink also picks out long creases where ridges overlap.
* **Greyboxes are greyboxes.** Plain blocks with dark doors, by design (placeholders). The church
  wall shows as a pale wedge edge-on.
* **The time-lapse pace** has no sound or look of its own beyond the wider view and the clock.
* **Not checked on real hardware:** frame rate, the look under a real GPU, pointer lock and the touch
  stick on a phone. The door's step-back and the stairs' rail grip were checked only at held frames.
