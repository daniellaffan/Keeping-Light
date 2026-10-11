# The Keeping Light

A short narrative game in watercolor. You are the new keeper of a lighthouse on Ceann Bán, a
headland in the west of Ireland, in September 1957. Each dusk you pencil the boats' route into the
logbook, ink it, light the lamp, and watch them come home. The book was kept by someone before you.

## Run it

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000**. There is no build step. It needs a browser with WebGL2 (any
current Chrome, Edge, Firefox or Safari). Fonts come from Google Fonts and have system fallbacks.
Sound starts on your first click or key press.

To work on the code, use the no-cache server instead. Plain `http.server` lets the browser cache
the ES modules, so edits may not show up:

```bash
python3 tools/serve.py 8001
```

## How to play

* **Title.** *begin* starts a new game. With a save, *continue — night N* picks up from the last
  dawn you saw, and *begin again* starts over. The game saves itself at every dawn.
* **Day.** On the headland map, pick one place to spend the afternoon. Click or tap, or press
  Space/Enter, to read on. Then comes dusk.
* **Dusk: the logbook.** The left page has the night's tide, weather, the boats expected (and their
  size), and your notes. The right page has the chart.
  * Click or tap on the water to mark a turn. Drag a mark to move it.
  * *take back* (or Ctrl/⌘+Z) removes the last mark. *rub out* clears the plan.
  * The inkwell and the tally marks show how much ink and how many turns you have left.
  * Bigger boats need more room. Reefs drawn faint and dashed only matter at low water, so read the
    tide. A "?" in pencil means the line runs close to rock for the biggest boat tonight.
  * When it looks right, **Ink the plan**.
  * ← / → or *earlier* turns back through the book. Older pages are worth reading.
* **Night.** The lamp lights and the boats follow exactly the line you inked. Click the water to
  hold the beam there for a moment. There is no failing. A boat that touches rock stops and waits.
* **Dawn.** The book records who came home. *Close the book* moves on to the next day.
* **The end.** After the last night you climb the stairs one step at a time (click, tap, Space or
  ↑).

Sound: the speaker in the top-right corner has volume and mute. **M** toggles mute. Your settings
are remembered.

On a phone, the logbook shows one page at a time, with *notes* / *chart* tabs.

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

URL parameters (with `debug=1`):

* `night=13&phase=dusk`: start anywhere. Phases are `day`, `dusk`, `night` and `dawn`. Nights 17–19
  are the epilogue nights E1–E3.
* `finale=stairs|sunset|end`: start in the finale.
* `autoplay=1`: plays the whole game unattended from the title, through night 1 and every night
  and epilogue, the stairs and the end card, back to the title. It logs `AUTOPLAY COMPLETE` and sets
  `window.__autoplayDone`. `speed=4` sets the time scale.

`node tools/check-nights.mjs` checks that every night's chart can be solved within its ink and turn
limits.

## Files

See [DESIGN.md](DESIGN.md) for the architecture and the decisions made while building, and
[REPORT.md](REPORT.md) for what's in V1, known issues and ideas for V2. Screenshots of every
distinct scene are in [docs/screenshots](docs/screenshots).

All art, sound and writing are generated in code or written for this game.
