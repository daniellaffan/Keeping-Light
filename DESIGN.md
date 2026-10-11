# The Keeping Light — Design notes (V1)

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
tools/check-nights.mjs     node script: validates every night is solvable, autoplan works
tools/serve.py             no-cache static server for development
docs/screenshots/          one screenshot of every distinct scene
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
