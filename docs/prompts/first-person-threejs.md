# Prompt: The Keeping Light in first person (Three.js)

Paste everything below the line into a new Claude Code session opened at the repo root.

---

Turn **The Keeping Light** into a first-person game using **Three.js**, and keep its watercolor
look. Read `README.md`, `DESIGN.md` and `REPORT.md` first. They describe the four-layer watercolor
pipeline, the phase state machine and the chart geometry. This change builds on those systems. It
is not a rewrite.

## What the player experiences

You are the Keeper. The only part of your body you ever see is your **forearms and hands**. There is
no full body, no shadow of one, and no visible legs.

1. **Day.** You walk freely (WASD or arrow keys plus mouse look, and a touch stick on phones) out of
   the lighthouse and around the headland to the places on the current headland map: the shop, the
   pub, the harbour, the shed, the school and the cottages. **These places are placeholders for
   now** (see "Placeholder locations"). The rule of one visit per day still applies.
2. **Dusk.** You come back to the watch room. The **logbook lies open on the table**. Walk up to it
   and press E or click it, and the camera **leans over the table**: the view eases forward and down
   until the open book fills most of the screen, a little off-axis, with the far edge of the table
   and the lamp still visible. Your right hand holds the pencil and your left hand rests on the page
   to hold it flat. Everything the logbook does today still works on the page: placing and dragging
   waypoints, take back, rub out, the inkwell budget, tally marks, "?" hints, turning back through
   older pages, *follow my line*, the ghost plan and **Ink the plan**. **The pencil tip follows the
   pointer**, so the hand really draws the line. While inking, the hand swaps to the dip pen and
   traces the route. Turning a page is a hand gesture, not a cut.
3. **Lighting.** You sit back up, the lamp is lit (a short hand gesture: reach toward the lamp
   control, or strike a match), and the light starts to turn.
4. **Night: the lounge chair.** Once the lamp is lit, the camera moves to a **lounge chair by the
   window** that looks out over the bay. Your forearms rest on the chair's arms. A mug of tea is
   optional. From here you watch the boats sail **exactly the line you inked**, using the same
   `Fleet` and route code as now. **Time speeds up** while you sit (see "Time in the chair").
   Clicking the water still holds the beam there for a moment, by raycasting from the window view
   onto the sea.
5. **Dawn.** The chair view brightens to a grey dawn. You stand, go back to the table and lean over
   the book again, and the dawn page writes itself in your hand: the watch, the oil and the row of
   boats. *Close the book* closes it with your hands.
6. **Finale.** The stairs become a real first-person climb, one tread per click, tap, Space or ↑.
   Keep the pause between treads. The last sunset, the fade to paper and the end card stay as they
   are, but the fade starts from the first-person view.

The title screen stays the 2D painted title.

## Keep the watercolor look. This is the hard requirement.

The game must still look like a watercolor painting while you walk around. It must not look like a
3D render with a filter on top.

* **Keep `watercolor.js` as the final composite.** Three.js renders into the **same four
  layers** instead of Canvas2D:
  * **paint**: flat or lightly shaded pigment colors. No specular highlights or PBR shine.
  * **ink**: linework from depth and normal edge detection, with silhouette lines heavier than
    crease lines. Wobble the lines in screen space and give them dry-brush breaks.
  * **light**: emissive output only: the lamp, the beam, lanterns, windows, the sun and moon.
  * **mask**: R = water, G = haar weight, B = granulation boost.

  Use one multiple-render-target pass (`WebGLRenderTarget` with `count: 4`). Change `Watercolor` so
  it can take GPU textures directly instead of uploading canvases. Then the existing paper,
  edge-darkening, bleed, granulation, haar, bloom-transition, act-grading and deckle-margin code all
  work unchanged.
* **Share one WebGL2 context.** Create the renderer with
  `new THREE.WebGLRenderer({ canvas, context: gl })`, call `renderer.resetState()` around the
  watercolor pass, and keep the DPR and layer-resolution caps from `layers.js`.
* **Avoid the "shower door" effect.** The paper texture can stay in screen space, but pigment
  turbulence and granulation must stick to surfaces, not slide over the world as the camera turns.
  Drive them from world-space or object-space noise written into the mask or paint layer. Add a
  little edge darkening at depth discontinuities so objects separate like overlapping washes.
* **Palette and act grading** come from the existing `night.palette` / act values and `game.look`.
  Act 2 still bleeds more, act 3 still thins, and the haar still eats the light.
* **Painted textures** for walls, wood, stone, paper and wool are generated in code using
  `paint.js` (washes, wobbly shapes, noise) into canvases, then used as `CanvasTexture`s. Nothing is
  downloaded. All art is still made in code.

## The forearms and hands. Spend real effort here.

These are on screen almost all the time and close to the camera, so they have to look beautiful.

* **Who they are.** A Keeper in 1957: an undyed, slightly worn Aran or wool jumper with the sleeves
  pushed up to just below the elbow, or a rolled-up cotton shirt sleeve. Weathered, practical,
  adult hands. Visible knuckles and tendons on the backs of the hands, short clean nails, a faint
  graphite smudge on the side of the right hand's little finger, and over the nights a little ink
  on the fingertips. No gender markers. Keep them ambiguous, like the Keeper.
* **The geometry is built in code** as a skinned mesh: forearm, wrist, palm, and each finger with
  three phalanges, plus the thumb (CMC, MCP and IP joints). Build it by lofting smooth cross-sections
  along the bones and blending at the joints, or by meshing a signed distance field once at load.
  Use enough density for soft knuckles, the thenar pad and fingernails. Model the sleeve as its own
  mesh, with folds where it bunches.
* **Shading.** A warm flesh wash, cooler mid-tones, darker pigment pooling at the knuckles and in
  the creases, and a soft rim from the lamp at night. Ink silhouette lines should be strong on the
  outer edge and broken on the inner creases. Wool should get a granular, dry-brush texture.
* **The poses are hand-authored keyframes, blended:**
  * walking (hands mostly out of view; brief glimpses when you reach for doors)
  * reaching and opening doors
  * leaning on the table with the left hand flat on the page
  * the pencil grip (a real tripod grip), with the pencil drawn as its own object
  * the dip pen grip, and dipping the pen in the inkwell
  * turning a page with the thumb and index finger
  * resting on the chair arms, fingers loose
  * holding the tea mug in both hands
  * lighting the lamp
  * gripping the stair rail in the finale
* **Inverse kinematics.** A two-bone IK for each arm, plus finger adjustments, puts the pencil tip
  exactly on the page point under the cursor. The left hand finds its spot on the page and
  stays put while the right hand writes.
* **Life in the motion.** Small breathing sway, settling motion after each move, slight overshoot
  on reaches, and fingers that curl and relax at idle. **Tremor scales with the handwriting's
  `drift`**, so the hands grow less steady through the acts, matching the writing. The night 16 and
  epilogue hands should feel noticeably different.
* **Check them.** Take screenshots of every pose under day, dusk lamp light, night and haar, and
  include them in the report. If a pose looks wrong (stiff fingers, joints collapsing, the pencil
  floating), fix it before moving on.

## Time in the chair

* At night, game time flows faster than real time. Ease `game.timeScale` (which already exists) up
  to about ×4–×6 while nothing is happening. Ease it back to ×1 when a boat comes within a short
  distance of the harbour mouth or of a reef, when a boat arrives, and for every scripted beat:
  Manannán, Mag Mell, the late reflection, the phantom reflection, the village lights going out.
  Never speed past a story moment.
* Show that time is passing:
  * the moon and stars wheel across the sky
  * a clock on the wall
  * the lamp's oil going down
  * the tea going cold (steam stops)
  * the beam's sweep blurring slightly at speed
  * near dawn, the eyelids grow heavy, drawn as a slow vignette dip
* Keep the existing *wait for dawn* / *let the night be slow* toggle as a small lettered note on
  the windowsill. The debug ×8 fast-forward (`F`) still works on top of this.

## The world

* **The bay must match the chart.** Build the sea, the land, the sea stacks, the reefs and the
  harbour from `src/game/chart.js` world units (x 0→100, y 0→60), so the route you pencil in the
  book is the route you see from the window. Reefs show or hide with the tide as they do now.
  Ships are the same three sizes with lanterns, now in 3D, driven by `Fleet` positions.
* **The lighthouse interior** needs:
  * the watch room: the table with the logbook, the inkwell and pencil, the lounge chair at the
    window that faces the bay, a stove, the wall clock, and shelves of old logbooks
  * the spiral stairs up to the lamp
  * the door out to the headland

  Paint them warm and simple. Furniture should be blocky and hand-drawn in feel, not detailed.
* **Haar** is still the shader haar, now using real depth so it gets thicker with distance.
  Manannán is a tall cloaked shape standing on the water, using the existing `uCloak` uniforms
  projected from his world position.

## Placeholder locations

For each place on the headland map (`headland-map.js`, `village.js`, `src/data/story-village.js`):

* Build a greybox building or area in the right rough direction on the headland, with a painted
  sign giving its name.
* Walking into its trigger volume starts that place's **existing vignette text**, shown as
  lettering over a soft paper panel, and records the visit.
* Put each place in its own file under `src/world/places/<name>.js` with the same interface
  (`build(scene)`, `trigger`, `onEnter(game)`), so I can replace them one at a time later. Add a
  `TODO` header in each file saying it's a placeholder.
* After the visit, or if you go nowhere, the light fails and a short bloom transition brings you to
  the watch room at dusk.

## Engineering constraints

* **Still no build step.** Vendor Three.js as ES modules under `src/vendor/three/`, with an exact
  pinned version, plus only the addons you use. Load them through an import map in `index.html`.
  `python3 tools/serve.py 8001` must still run it.
* **Keep everything else working:**
  * story data, nights and the solver
  * `tools/check-nights.mjs`
  * save and load at dawn
  * audio, with footsteps and room tone added (interior and exterior reverb in Web Audio)
  * the sound control
  * the debug panel and all its keys and URL params (`night`, `phase`, `finale`, `autoplay`)
* **Add debug controls:** `C` toggles a free-fly camera, `T` shows the current time scale, and
  `H` cycles through the hand poses.
* **Autoplay** must still play the whole game unattended. Drive the first-person camera along
  scripted paths, and use `A` to auto-plan, which the hand then draws.
* **Keep the old 2D mode** reachable with `?view=classic` until the first-person version is
  complete, so nothing is lost while this is being built.
* **Logbook in 3D:** keep `LogbookScene` drawing into its layers, render those layers to a texture,
  and map that texture onto the book's pages. Raycast the pointer onto the page, turn the hit UV into
  logbook logical coordinates, and pass those to the existing `Input` hit regions. Don't
  reimplement the logbook.
* **Input:** pointer lock for mouse look while walking. Release it when you lean over the book,
  so the cursor drives the pencil. Phones get a left virtual stick and right-side drag to look. On
  a phone in portrait, the book view goes close to flat-on, with the existing notes and chart tabs.
* **Performance:** 60 fps on an integrated laptop GPU at the layer cap, and playable on a recent
  phone. Freeze static geometry, share materials, and keep the hands to one skinned mesh per arm.

## Milestones (finish and check each before starting the next)

1. Three.js renders into the four layers through the existing watercolor composite, with a test
   room and a moving camera. No shower-door effect.
2. The watch room, the table, the logbook texture on the book, and leaning over it with
   raycast input. The full dusk puzzle is playable.
3. The hands: the mesh, the shading, every pose, and the pencil IK following the cursor. Write the
   screenshot review.
4. The lounge chair night: the 3D bay built from the chart, the ships, the beam, the time-lapse
   with slowdowns, and the scripted beats.
5. Dawn, walking the headland, the placeholder locations, and the first-person stairs.
6. Autoplay passes from the title to the end card, and `check-nights` passes. Update `README.md`
   and `DESIGN.md`, and add new screenshots to `docs/screenshots/`.

Commit after each milestone with a clear message.
