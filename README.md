# The Keeping Light

A short narrative game in watercolor. You are the new keeper of a lighthouse on Ceann Bán, a
headland in the west of Ireland, in September 1957. Each dusk you pencil the boats' route into the
logbook, ink it, light the lamp, and watch them come home. The book was kept by someone before you.
It is played in first person, and still looks like a watercolor painting.

## Run it

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000**. There is no build step. It needs a browser with WebGL2 (any
current Chrome, Edge, Firefox or Safari). Fonts come from Google Fonts and have system fallbacks;
three.js is vendored in `src/vendor/three/`, so nothing else is fetched.
Sound starts on your first click or key press.

To work on the code, use the no-cache server instead. Plain `http.server` lets the browser cache
the ES modules, so edits may not show up:

```bash
python3 tools/serve.py 8001
```

## How to play

You are the keeper, in first person: all you ever see of yourself is your forearms and hands.

| | mouse and keyboard | phone or tablet |
|---|---|---|
| walk | WASD or the arrow keys (Shift to stride out) | a stick under your left thumb |
| look | the mouse (click once to capture it) | drag on the right side |
| use | E, Space or click | tap on the right side |
| stand up from the logbook | Esc or Q | — |

* **Title.** *begin* starts a new game. With a save, *continue — night N* picks up from the last
  dawn you saw, and *begin again* starts over. The game saves itself at every dawn.
* **Day.** You start in the watch room at two in the afternoon. Open the door and walk out along the
  lane round the headland to one place: the oil shed by the tower, the end of the cliff path, the
  shop in the village, the harbour slip, the cottages up the back road, or the schoolhouse. Walk up
  to a place and its afternoon begins; click, tap, Space or E reads on. Places with nobody about
  today say so. Far from anything the walk and the afternoon run on faster. When the visit is done,
  or at seven if you go nowhere, the light fails and you are back at the table at dusk. (Leaning on
  the table by day waits there for dusk.)
* **Dusk: the logbook.** Walk to the table and press E, and you lean over the open book. Your right
  hand holds the pencil; it follows the pointer. The left page has the night's tide, weather, the
  boats expected (and their size), and your notes. The right page has the chart.
  * Click or tap on the water to mark a turn. Drag a mark to move it.
  * *take back* (or Ctrl/⌘+Z) removes the last mark. *rub out* clears the plan.
  * The inkwell and the tally marks show how much ink and how many turns you have left.
  * Bigger boats need more room. Reefs drawn faint and dashed only matter at low water, so read the
    tide. A "?" in pencil means the line runs close to rock for the biggest boat tonight.
  * When it looks right, **Ink the plan**: the hand takes the dip pen and inks it.
  * ← / → or *earlier* turns back through the book. Older pages are worth reading.
* **Night.** You pull the lamp lever and sit in the chair at the window. The boats follow exactly the
  line you inked, and the night runs on while nothing is happening, slowing for every boat near rock
  and every strange thing. Click the water to hold the beam there for a moment. The folded note on
  the sill (click it, or Space) lets the night run on or be slow. There is no failing. A boat that
  touches rock stops and waits.
* **Dawn.** Press E to go over to the logbook. The book records who came home. *Close the book*
  moves on to the next day.
* **The end.** After the last night you climb the stairs one step at a time (click, tap, Space or
  ↑).

Sound: the speaker in the top-right corner has volume and mute. **M** toggles mute. Your settings
are remembered.

On a phone held upright, the logbook is seen nearly flat-on, one page at a time, with *notes* /
*chart* tabs.

**The original 2D game** is still here, whole: add `?view=classic` to the URL. If a device can't
build the 3D world, the game falls back to it by itself.

## Debug mode

Add `?debug=1` to the URL for a panel showing the night, phase, act and the watercolor uniforms.

| key | does |
|---|---|
| `N` | next phase (title → day → dusk → night → dawn → next day; in the finale, the next part) |
| `Shift+N` | next night |
| `1`–`9`, `0` | jump to night 1–9, or 10 (the panel's dropdown reaches every night, E1–E3 and the finale) |
| `A` | auto-plan a valid route (dusk logbook) |
| `F` | fast-forward ×8 (press again for ×1) |
| `R` | restart the current night from its day |
| `C` | free-fly camera (WASD, E/Q up and down, drag to look, Shift fast) |
| `T` | cycle the time scale (1, 2, 4, ½, ¼) and show it |
| `H` | cycle the hand poses |

URL parameters (with `debug=1`):

* `night=13&phase=dusk`: start anywhere. Phases are `day`, `dusk`, `night` and `dawn`. Nights 17–19
  are the epilogue nights E1–E3.
* `finale=stairs|sunset|end`: start in the finale.
* `autoplay=1`: plays the whole game unattended from the title, through night 1 and every night
  and epilogue, the stairs and the end card, back to the title. It logs `AUTOPLAY COMPLETE` and sets
  `window.__autoplayDone`. `speed=4` sets the time scale.
* `view=classic`: the 2D game (works with every parameter above).
* `test=room`: the plain test room for the 3D → watercolor pipeline.

In the console, `__game.step(n, dt)` runs n frames, and `__game.noRender = true` skips painting them
(for long headless runs).

`node tools/check-nights.mjs` checks that every night's chart can be solved within its ink and turn
limits.

## Files

See [DESIGN.md](DESIGN.md) for the architecture and the decisions made while building, and
[REPORT.md](REPORT.md) for what's in V1, known issues and ideas for V2. Screenshots of every
distinct scene are in [docs/screenshots](docs/screenshots).

All art, sound and writing are generated in code or written for this game.
