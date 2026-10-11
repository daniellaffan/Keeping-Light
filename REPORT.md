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
