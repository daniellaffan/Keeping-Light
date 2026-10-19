# Prompt: Nora, the woman who keeps the shop in Port na Rón

You are working in the repo `Keeping-Light` (a first-person Three.js game; read `README.md`, `DESIGN.md`,
`REPORT.md` and `docs/HANDOFF.md` first). Branch from `main`. Commit in small steps and push to a branch,
then open a draft PR. Add a REPORT.md section when you are done, as every milestone has.

## Who she is

Nora keeps the shop in Port na Rón, the village across the bay from the lighthouse, in September 1957 on
the west coast of Ireland. Her lines are all in `src/data/story-village.js` (`VIGNETTES` and `QUIET.village`).
Read every one of them before you design her. In short:

- **She is warm and practical.** She welcomes the new keeper, sells bread, tea, matches and paraffin, and
  pushes an umbrella on them on a wet day. She says "grand" a lot. She is the village's mother hen.
- **She knew the last keeper ("Fran—")** and keeps nearly saying the name, then stopping (nights 5 and 8).
- **She fades as the story goes on.** Night 8: she gives the change twice and doesn't notice. Night 10:
  "She says it as though she'd said it before, to someone else." Night 12: she is behind the counter and
  doesn't look up when the bell goes. Night 15: the shop is empty and the shelves bare; only her voice
  comes from the back room, and there is nobody there. The quiet lines for act 3 say "Nobody comes."
- She appears on nights 2, 3, 4, 5, 8, 9, 10, 11 (in the pub) and 12, and in the act 1 and 2 quiet lines.

She is not a ghost story's monster. The whole village is quietly gone and has been for a long time; the
player should feel that she is real and kind first, and only later notice she is slipping away.

## What she should look like

A countrywoman in her fifties in 1957, dressed for a shop in a cold village:

- Hair going grey, pinned up at the back. A broad, kind, weathered face, cheeks reddened by wind.
- A wool cardigan (a muted colour: moss, rust or heather) with the sleeves pushed up, over a plain blouse.
- A wraparound pinafore apron (pale, small faded print) over a dark wool skirt to below the knee.
- Thick stockings and sturdy black lace-up shoes.
- Optional, if it reads well at a distance: a pencil behind her ear, a tea towel over her shoulder.

It must look like it belongs in this game: the same flat watercolor washes and ink edges as everything
else (`src/world/materials.js` `wash()`, `src/world/build.js` `Builder`). No PBR, no downloaded models or
textures; everything is drawn in code. Simple, sturdy shapes read better through the watercolor pass than
fine detail. The 2D painted vignette of the shop (`src/render/scenes/village.js`, `shop()`) shows the
palette of the place.

## Where she goes

- In first person, walking into the village's trigger (`src/world/places/village.js`, chart `[72.6, 0.3]`)
  shows her lines on a paper panel while you stand at the shop door (`Keeper.enterPlace()` in
  `src/world/keeper.js`). The shop and pub are still greyboxes (`kit.js greybox()`).
- Put Nora where the player sees her as they arrive and while they read: standing in or just outside the
  shop doorway. Make her solid (`scene.solid`) so you can't walk through her.
- The places are built once (`build(scene)` in each place file, called from `Headland`'s constructor in
  `src/world/headland.js`). Nothing updates them per frame yet, so add a small, optional per-place update
  hook (for example `update(dt, ctx)` called from `Keeper.updateDay`) rather than special-casing Nora in
  keeper.js.

## How she behaves

Keep it small and believable. No walking or path-finding.

- **Idle:** breathing, a slight weight shift, now and then wiping her hands on her apron or folding them.
- **Noticing you:** when you come within about 10 m her head, then her shoulders, turn to follow you.
  Smooth and slow, never snapping; limit the head turn to what a neck can do.
- **While you read her lines:** she faces you. Optionally a small nod or hand gesture when a new Nora line
  appears (the panel shows one line at a time; `this.reading.shown`).
- **Across the story,** driven by the night id (`keeper.night.id`):
  - nights 2–7: as above, warm.
  - nights 8–11: a beat slower to notice you; sometimes she looks past you, out to sea.
  - night 12: inside behind the counter, or in the doorway with her head down; she does not turn to you.
  - nights 13+: she is not there. On night 15 the doorway is empty.
  - On nights when the village vignette is the pub (11), decide whether she stands at the shop door or
    is not shown; say which in the REPORT.
- She is only seen by day (the headland group is hidden at night). The village by night already has lit
  windows; nothing more is needed there.

## Things to settle with the user before building (ask)

1. Does she stand outside the door (easy to see) or just inside it, framed by the doorway (more natural)?
2. Should her face have features (eyes, mouth drawn in ink) or stay soft and simple like a painting?
3. Should the shop greybox get a real front (window, door, the bell, a sign "N. Ó Sé, Grocer") as part
   of this, or only Nora for now?
4. Her surname, if a sign needs one.

## How to check it

- `python3 tools/serve.py 8001` (or the `keeping-light-dev` launch config). `?debug=1` gives
  `__game.step(n, dt)`, `__game.keeper`, the N key for next phase, C for free-fly.
- Take screenshots, numbered after the last ones in `docs/screenshots/`: Nora from the lane as you arrive,
  from the trigger while reading, close up from free-fly, and on nights 2, 10, 12 and 15 (empty).
- `node tools/check-nights.mjs` passes, and `?debug=1&autoplay=1&speed=4` plays all 19 nights to
  `AUTOPLAY COMPLETE` with no console errors. `?view=classic` is untouched.
- The frame rate by day doesn't drop noticeably.

## Conventions

Match the surrounding code: a short plain-English header comment per file, a few lines per section, no
JSDoc. A new file for her (for example `src/world/people/nora.js`, built so Tadhg and Síle could follow
the same way later) is better than growing `village.js` or `keeper.js`.
