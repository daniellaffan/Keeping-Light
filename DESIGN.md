# The Keeping Light — Design notes

Practical notes on how the game is put together. The story, tone and mechanics come
from the build brief; this file records structure and the decisions made while building.

## Running

```
python3 -m http.server 8000
# open http://localhost:8000
```

No build step. ES modules are loaded straight from `src/`. Fonts come from Google Fonts with
system fallbacks; nothing else is fetched from the network.

## File structure

```
index.html                 canvas, font links, boot
src/main.js                boot, frame loop, scene manager, phase state machine
src/state.js               save/load (try/catch), settings, progress helpers
src/render/gl.js           WebGL2 helpers: program, textures, framebuffers
src/render/watercolor.js   the watercolor composite shader + uniforms
src/render/paint.js        Canvas2D painting helpers: noise, wobbly shapes, washes, ink, glows
src/render/hand.js         handwriting renderer (per-glyph jitter, drift, write-on reveal, caching)
src/render/layers.js       the four layer canvases every scene paints into + view transform
src/render/scenes/*.js     title, bay (dusk/night/dawn/haar), logbook, headland map, village
                           vignettes, finale (stairs, last sunset, end card)
src/game/nights.js         night definitions (mechanics) — the table from the brief, as data
src/game/chart.js          bay geometry: land, sea stacks, reefs, tide, projection, routes, A*
src/game/ships.js          route following, clearance, collision, arrival
src/audio/*.js             procedural music, ambience, sfx (Web Audio); audio.js routes them
src/ui/input.js            pointer/touch/keyboard, immediate-mode hit regions
src/ui/settings.js         sound control (HTML speaker button, volume, mute)
src/ui/debug.js            ?debug=1 panel, keys and jumps
src/data/*.js              all writing: logbook entries, village scenes, ship names, records
src/world/world.js         first person: the three.js scene, camera and sky, rendered by the pipeline
src/world/pipeline.js      three.js → the four watercolor layers in one MRT pass, depth ink, HUD overlay
src/world/materials.js     the one wash shader (MRT), glows, the beam, the sky; shared light uniforms
src/world/textures.js      painted textures made in code (wood, plaster, wool, lettering)
src/world/build.js         merges static pieces per material, with a hand-made wobble
src/world/geo.js           chart ↔ world (4 m to a chart unit), the tower, the room's facing
src/world/keeper.js        the first-person game: phases, camera, states, prompts, HUD, autoplay
src/world/room.js          the watch room, its door, stairs and sill, and the tower top seen from outside
src/world/book.js          the logbook on the table: LogbookScene's layers as page textures, raycast input
src/world/hands.js         the forearms and hands: poses, two-bone IK with a wrist's limits, the grips
src/world/handmesh.js      the old hands' skin as one distance field, meshed (in a worker) and weighted
src/world/inkwell.js       the inkwell and the goose quill the plan is inked with
src/world/walker.js        walking: keys and mouse look, touch stick, the pace, autoplay steering
src/world/bay.js           the bay from the chart: land, sea, reefs, village, piers, ships, beam, beats
src/world/night.js         the night from the chair: Fleet, the time-lapse and its slowdowns
src/world/lane.js          the lane round the bay, its spurs, and routes along it
src/world/headland.js      by day: walking out of doors, the places, triggers, the afternoon clock
src/world/places/*.js      one placeholder per place (shed, cliff, village, harbour, cottages, school)
src/world/review.js        debug: contact sheets of the hand poses
src/vendor/three/          three.js (pinned) and the one addon used, loaded through the import map
tools/check-nights.mjs     node script: validates every night is solvable, autoplan works
tools/serve.py             no-cache static server for development
docs/screenshots/          one screenshot of every distinct scene
docs/HANDOFF.md            where the first-person build stands and how it fits together
```

## Rendering architecture

Every scene paints four **layers** (Canvas2D, offscreen, same logical coordinates):

| layer  | contents                                                          | blend in shader |
|--------|-------------------------------------------------------------------|-----------------|
| paint  | opaque washes: sky, sea, land, buildings, ships, book pages       | base pigment    |
| ink    | linework + handwriting (transparent bg)                           | darkening glaze |
| light  | lamp, beam, lanterns, windows, sun (transparent bg)               | warm screen glaze, scattered by fog |
| mask   | R = water (ripple + reflections shimmer), G = haar weight, B = granulation boost | control |

A single WebGL2 full-screen pass (`watercolor.js`) turns these into the painting:
paper fBm + fibres → UV wobble (animated only on water/fog) → pigment from the mip-mapped paint
texture (mip levels = cheap blur) → **edge darkening** (difference between paint and its blur,
applied with the Bousseau density formula) → low-frequency pigment turbulence → granulation in
paper valleys → **bleed** (washes soften and creep past ink lines, rises in Act 2+) → ink glaze
with dry-brush breaks → light glaze + scattering → procedural **haar** (scrolling fBm, denser over
water, eats light) → act grading (`warmth`, `saturation`, `paperShow`) → ragged unpainted paper
margin → **bloom transitions** (cauliflower-edged reveal of the new frame over a snapshot of the
old, with a pigment rim) → vignette + grain.

Layers are drawn at a capped resolution (≤ ~2.3 MP); the GL canvas is at device resolution
(DPR ≤ 2). Static scene parts are cached in offscreen canvases; only moving things are redrawn.
Layers are only re-uploaded when a scene marks them dirty.

**Logical coordinates:** scenes draw in a 1600×1000 "safe area" (the logbook uses 800×1100 in
portrait). The view transform fits the safe area to the screen and scenes fill whatever extra
viewport there is (`L.view` gives the visible logical rect), so nothing letterboxes; the painting
ends in a ragged deckle edge like a sketchbook page.

## First person

The game is played in first person by default; `?view=classic` is the 2D game, untouched, and the
game falls back to it if the 3D world can't be built.

**Rendering.** three.js shares the game's WebGL2 context. It renders the world in one pass into
four render targets: the same four layers as the 2D game (paint, ink, light, mask). Every surface is a
flat wash, with pigment turbulence and granulation computed in object or world space, so they stay on
the surfaces as the view turns. A compose pass turns depth into ink lines (silhouettes heavier than
creases, wobbled and broken), pools a little pigment at depth edges, and lays the 2D canvases on top
as a HUD (prompts, the reading panel, rain on the glass). Its outputs go straight into
`Watercolor.render` as GPU textures, so the paper, bleed, granulation, haar, act grading, bloom
transitions and deckle margin are the same code as before.

**One keeper, the same phase machine.** `main.js` still decides what happens when. The keeper
registers thin wrappers under the old scene names (logbook, bay, daymap, vignette, finale), so
`main.js`, the debug panel, saving and autoplay work as they always have. Moving between keeper
phases is seamless, with no crossfade, unless time has jumped (afternoon to dusk, night to dawn,
dawn to the next afternoon). Then the bloom transition plays over the first-person view.

**A day.**
* The keeper starts in the watch room at two, opens the door (the hand takes the ring) and walks
  the lane to one place.
* The places are greyboxes at their real chart positions (`headland-map.js` sites). The village is
  already visible across the bay from the window, so it can't be anywhere else.
* The lane is long (about 600 m to the village, 750 m to the cottages). So, as at night, the
  afternoon runs on when nothing is near: up to ×5 pace, the clock at √pace.
* Walking into a place's trigger reads its vignette over a paper panel. Then the light fails over
  a few seconds and the bloom brings you to the table at dusk.

**Dusk, night and dawn.**
* At dusk you lean over the logbook. `LogbookScene` draws into its own layers, which become the
  page textures; the pointer is raycast onto the page and handed to the logbook's own input.
* The hand pulls the lamp lever and the keeper sits in the chair at the window.
* `Fleet` sails the inked line through a time-lapse night that slows for every hazard, arrival and
  beat.
* At dawn the keeper gets up and leans over the dawn page.

**The finale.** The keeper climbs the stairs in first person, then the 2D last sunset and end card
take over through a bloom.

## Decisions made for first person

* **Hands only.** No body, no shadow; two skinned forearms with authored poses and two-bone IK held
  inside a wrist's real range (REPORT, milestones 3 and 7). An old man's hands: one continuous skin,
  bony knuckles, veins and wrinkles. They never shake, and they never lie over the pages.
* **The bay is built from the chart** at 4 m to a unit, so the line in the book is the line from the
  window.
* **The window faces the middle of the bay** (chart 50, 30), so the reefs fall inside it.
* **The day's places are placeholders** at their real positions, each in its own file with the same
  interface, to be replaced one at a time. Triggers sit just off the lane (in front of each door),
  so you don't visit by passing.
* **The afternoon clock runs at √pace.** Tied to the stride, the far places couldn't be reached
  before dusk.
* **The climb is eight treads.** The watch room is a single storey with the lantern on its roof. The
  hatch opens over the upper half of the flight, and the bloom to the last sunset starts as you look
  up through it into the lamp room's light.
* **The tower from outside is the watch room and the lantern**, about 7 m. A taller tower would
  move the lamp and the beam the night is built around. It's left for a later pass.
* **Sound has a space.** Footsteps and the door go through a stone-room reverb indoors and an
  almost dry open-air one outdoors, crossfaded at the door. Indoors there is a low room tone, and
  by day the walls muffle the sea.

## The bay and the chart share one world

World units: x 0→100 west→east, y 0→60 north→south (chart is north-up). Ships enter on the
west edge and make for the harbour at the north-east. The night view looks north over the bay from
the south headland: `chart.project(x, y)` is a mild perspective (rows compress and converge with
distance). The same route polyline (with rounded corners) is used for the pencil line, the ink,
collision and the ships, so ships follow exactly what was drawn.

## Game state machine

```
title → [arrival | day map → vignette] → dusk (logbook) → lighting → night → dawn (record) → save → next
          final night 16 → dawn → epilogue E1..E3 → stairs → last sunset → end card → title
```

Each phase is a scene object `{ enter(args), update(dt), draw(L), safe }`. The scene manager
does bloom transitions between them. Save happens at the end of each dawn.

## Data formats

* `src/game/nights.js` — `NIGHTS[]`: `{ id, act, tide, tideShown, weather, haar, ships[], entries[],
  target, reefs[], current, maxPoints, inkBudget, offerOldPlan, ghostPlan, anomalies[], day[],
  lights, drift, palette }`.
* `src/data/story-*.js` — text keyed by night id; logbook entries `{ hand, date, text, shake }`.
  Hands: `keeper`, `old`, `otherA`, `otherB`, `otherC`.

## Decisions I made

* **Names.** Headland: **Ceann Bán** ("white head"). Village: **Port na Rón** ("harbour of the
  seals"). Reefs on the chart: *An Charraig Dhubh* (the black rock), *the Sisters*, *the Comb*,
  *Gull Ledge*, *the Bar*, *the Lip*. Irish kept to phrases whose grammar I'm sure of.
* **The old keeper's name** begins "Fran—" (Francis/Frances, so even their gender stays open). It
  is never completed; their signature is smudged.
* **Camera.** The night view looks north-east from behind the lighthouse, with the tower in the
  near-left foreground so the lamp is in frame and is the brightest thing on screen.
* **Routes.** Entry → player waypoints → harbour, corners rounded (quadratic fillets) rather than
  a Catmull-Rom spline, so the line never bulges into a reef you can't see coming. Multi-entry
  nights show a faint leg from each entry to the first waypoint.
* **Gentle hints.** While planning, the pencil leaves a small "?" where the line passes too close
  to a reef for the biggest ship tonight. It keeps the puzzle gentle without solving it for you.
* **Ink.** The inkwell is a length budget; small tally marks show waypoints left.
* **Final night and epilogue** routes run the other way: from the (faded) harbour out past the
  stacks to the little hand-drawn island at the chart's west edge.
* **Night 15's odd tide:** the table in the old keeper's hand says high water; the sea is actually
  low. The Keeper's own note says so, so a careful reader isn't punished.
* **Dates.** The Keeper's notes have day and month only. Old dates (1957, 1931, 1902, 1874) appear
  in the overdue record, the old keeper's oldest pages, the other keepers' runs, Síle's drawing
  and the schoolroom board.
* **One visit per day.** Days are seasoning; you pick one place on the headland map, then dusk.
* **Canvas UI.** All game UI, including the logbook, the headland map and the title, is painted and
  lettered on canvas, so it goes through the same watercolor pass. Two things are plain HTML on
  purpose: the debug panel, and the small speaker button for sound. The speaker needs a real
  slider and checkbox for accessibility, and it has to work before the first gesture starts audio.
* **When.** Nights 1–16 run from 2 to 17 September 1957. The epilogue nights have no dates; the
  Keeper stops writing them. Internally E1–E3 are nights 17–19 (act 5), so the debug tools, saving
  and autoplay treat them like any other night.
* **The Rakes.** I added one reef that the brief doesn't name: a long line of rocks across the
  north channel, on nights 6, 8, 11 and 14. The middle nights were too alike without it, because the
  same short cut always worked. Night 6's note mentions it so it's fair. `tools/check-nights.mjs`
  checks every night stays solvable within its limits.
* **Dawn page.** Under the "as sailed" chart the Keeper writes the watch: lamp lit, lamp out, then
  the oil. The times are approximate sunset and sunrise for the west coast in September, summer
  time. The oil line gets shorter each act and is gone by the final night. Below it is a row of
  little boats, one for each that came in; a struck boat gets a small cross.
* **Phones.** When the window is taller than it is wide (aspect below 0.95), the logbook shows one page at a time with *notes* / *chart*
  tabs. The bay scenes are composed for landscape, so in portrait they sit inside the painted page
  with paper above and below. That's playable, but they're small.
* **Ink outside the painting.** Text is lettered into the margin outside the ragged painted area
  in a few places: the stairs, the end card, and the logbook tabs. The shader has an opt-in
  `uInkOut` uniform for those scenes. It is off elsewhere so stray bay linework doesn't show at the
  edges.
* **Haar** is drawn in the shader, not painted: wide, low fBm banks stretched horizontally, with
  thinner places between them. It is denser over water (mask G), and the lamp's light scatters into
  it. On night scenes the mist is a pale moonlit grey rather than a dark blue, so it reads as mist
  and not as more sea.
* **Manannán** is a tall cloaked shape standing on the water at the edge of the beam: no face, no
  detail. It fades in and out of the mist that gathers at his feet. The shader's "cloak" uniform
  makes that mist drift against the wind, as the brief describes. While he is there the music and
  ambience drop almost to nothing.
* **Mag Mell** is a small glowing island at the far western edge of the bay on night 13. It has
  soft hills, trees and a few gold and rose points, and is gone before you can look at it properly.
* **The ending.** The stairs are a helix of stone treads seen from below, one tread per click or
  tap, with a short pause so you can't rush them. The last sunset reuses the bay at golden hour. The
  lamp lights itself, the Keeper (a small ink figure) sits beside it, and one boat sails out past
  the stacks. Then the paper bleeds outward from the lamp until the frame is white. The end card is
  title, one line and a gold dot, then back to the title.
* **Sound.**
  * Music: one swung 70 bpm lo-fi engine with modes per act. Act 1 is full and warm. Act 2 is
    detuned, and the hats drop out. Act 3 is thin and sparse. The final night has no beat. The
    epilogue is a few piano notes. The stairs have a few sparser notes still, and the sunset has only
    the sea and one held note.
  * Ambience: surf from brown noise with slow swells, wind gusts by weather, rain, gulls by day in
    acts 1–3, and the lamp hum indoors. Haar lowers the low-pass cutoff outdoors.
  * Effects: pencil grains for waypoints, a rising phrase on inking, a warm swell when the lamp
    lights, a chime in F pentatonic for each boat home, a hollow chime for one that is gone, and a
    soft low thud on rock.
* **Ship names** are plain English or real Irish words: *Réalt na Mara* (star of the sea),
  *An Faoileán* (the gull), *Bríd Óg*, *Mo Stór*, *Neasa*. Nothing is invented.
