# Hands check: baseline

Thresholds: penetration 2 mm, grip 1 mm, rest 2 mm, nib 0.5 mm, 25° a frame at 30 fps, twist floor 70%, held 0.0005 mm.

## Tests

| test | result | detail |
| --- | --- | --- |
| 1 penetration | **FAIL** | 18 objects over 2 mm; worst walls 103.2 mm (autoplayed night, R.sleeve @85 daymap door: door) |
| 2 contact | **FAIL** | 26 contacts out of tolerance; e.g. R: fingers hooked on the ring 227.8 mm (door) |
| 3 motion range | **FAIL** | turn back: pen 25.1 mm, 1 contacts, 2 joints out, step 5°; turn forward: pen 25.1 mm, 1 contacts, 2 joints out, step 5°; close: pen 25.1 mm, 5 contacts, 1 joints out, step 16° (+5) |
| 4 joint angles | **FAIL** | 27 joints out of range (e.g. R thumb.ip -33.8° @0 (hold ready)); fastest 242.3°/frame (L elbow.flex @32 door: →door (door)); 0 roll flips |
| 5 skin twist | **FAIL** | narrowest 92% of rest width (turn -76.2°, -10 mm from the wrist); triangles turned over at 20 of 40 angles, at most 2 at once, the largest 0.003 mm²; forearm turn reached -115.3..115.3° |
| 6 fuzz | **FAIL** | 23876 placements/frames; worst table 35.0 mm (nudged book 0.00,0.03,0.00 well 0.00,0.00); 12 contacts failing; 29 joints out |
| 7 stability | **FAIL** | held hands move 0.3845 mm/frame at most (lean (breathing) 0.3845, chair (breathing) 0.1153); repeat runs identical; solver iterations: no solver yet |
| 8 speed | pass | hands update 0.041 ms/frame worst mean (budget 1 ms, proposed); skin build 1965 ms here, 2208 ms in the worker (baseline 1965 ms) |
| 9 visual | pass | overlay key O works; sheets and plots not rendered (--shots) |

## Interactions

| interaction | result | frames | worst penetration, mm (p99 of frames) | contacts out of tolerance | joints out of range | fastest joint, °/frame | steps of travel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| resting beside the book | **FAIL** | 124 | table 34.8 (p99 29.5), tray 18.0 (p99 18.0), book 17.3 (p99 15.5), walls 15.4 (p99 2.8) | 2 | 2 | 41.8 |  |
| pencil: resting and writing | **FAIL** | 8761 | table 25.1 (p99 25.1), book 19.1 (p99 15.8), tray 12.5 (p99 12.4), pencil 5.1 (p99 5.1) | 7 | 13 | 8 |  |
| quill and inkwell | **FAIL** | 16936 | table 35.0 (p99 25.1), inkwell 20.8 (p99 15.3), book 19.3 (p99 17.4), walls 18.6 (p99 0.0) | 10 | 29 | 41.8 | ink 775 |
| page turn | **FAIL** | 504 | table 25.1 (p99 25.1), book 16.7 (p99 16.6), tray 12.9 (p99 12.8), leaf 10.3 (p99 8.3) | 1 | 4 | 4.8 | turn back 149, turn forward 149 |
| cover | **FAIL** | 238 | table 25.1 (p99 25.1), book 12.6 (p99 12.5), tray 8.0 (p99 8.0), cover 7.3 (p99 7.3) | 5 | 1 | 15.7 | close 143 |
| lamp lever | **FAIL** | 597 | lever 36.2 (p99 34.8), tin 28.8 (p99 23.6), table 25.1 (p99 25.1), book 18.7 (p99 18.2) | 3 | 1 | 39 | lamp 120 |
| door ring | **FAIL** | 335 | walls 88.5 (p99 88.5), room 35.5 (p99 27.6), door 25.0 (p99 25.0), ring 22.3 (p99 21.8) | 1 | 1 | 242.3 | door 163 |
| mug | **FAIL** | 1053 | mug 39.4 (p99 38.8), chair 34.8 (p99 34.8) | 4 | 0 | 24.2 | mug 240 |
| stair rail | **FAIL** | 1290 | rail 31.1 (p99 31.0), walls 13.8 (p99 6.5) | 2 | 0 | 35.2 | stairs 664 |
| chair arms | **FAIL** | 430 | chair 39.9 (p99 39.9), table 34.7 (p99 31.7), tin 30.0 (p99 30.0), book 19.2 (p99 18.9) | 3 | 1 | 27.1 |  |
| walking arms | **FAIL** | 6836 | chair 39.9 (p99 0.0), table 33.3 (p99 0.0), book 18.5 (p99 0.0), lever 17.9 (p99 0.0) | 0 | 1 | 17.9 |  |

### resting beside the book

- contact: R: off the pages: 3.0 mm (12/12 frames)
- contact: R: middle finger under the shaft: 8.4 mm (10/10 frames)
- joint: R thumb.ip -20.7° @91 lean: →ready (lean in)
- joint: R middle.dip -10.8° @92 lean: →ready (lean in)
- fastest: R elbow.flex @72 lean-in: lean (lean in)

### pencil: resting and writing

- contact: R: middle finger under the shaft: 8.4 mm (1047/1047 frames)
- contact: R: off the pages: 25.1 mm (27/68 frames)
- contact: L: fingertips on the table: 37.0 mm (384/1023 frames)
- contact: R: little-finger edge on the page: 48.5 mm (435/955 frames)
- contact: R: off the pages but below and right of the point: 134.2 mm (103/955 frames)
- contact: R: nib on the page: 113.1 mm (522/901 frames)
- contact: R: nib on its line: 237.2 mm (613/901 frames)
- joint: R thumb.ip -33.8° @0 (hold ready)
- joint: R middle.dip -16.6° @0 (hold ready)
- joint: R thumb.ip -33.8° @0 (hold write)
- fastest: R elbow.flex @2102 80,471 (sweep write landscape)

### quill and inkwell

- contact: R: thumb on the shaft: 36.8 mm (3440/3551 frames)
- contact: R: index on the shaft: 61.5 mm (23/3551 frames)
- contact: R: middle finger under the shaft: 76.1 mm (3551/3551 frames)
- contact: L: fingertips on the table: 31.7 mm (384/3697 frames)
- contact: R: palm on the inkwell: 35.8 mm (612/612 frames)
- contact: R: fingertips on the inkwell: 54.3 mm (602/612 frames)
- contact: R: thumb on the inkwell: 38.2 mm (530/612 frames)
- contact: R: off the pages: 8.3 mm (108/496 frames)
- contact: R: nib on the page: 77.8 mm (478/3329 frames)
- contact: R: nib on its line: 117.7 mm (2994/3329 frames)
- joint: R thumb.ip -34.4° @0 (hold pen)
- joint: R thumb.ip -34.4° @0 (hold ink-take)
- joint: R thumb.ip -34.4° @0 (hold ink-lift)
- fastest: R elbow.flex @72 lean-in: lean (nudged book 0.00,0.00,0.00 well 0.03,0.00)

### page turn

- contact: R: fingertips under the corner: 299.3 mm (60/60 frames)
- joint: R thumb.ip -33.8° @0 lean: →turn (turn back)
- joint: R middle.dip -16.6° @0 lean: →turn (turn back)
- joint: R thumb.ip -29.6° @0 lean: →turn (turn forward)
- fastest: R ring.pip @210 lean: →ready (turn back)

### cover

- contact: R: off the pages: 3.0 mm (35/35 frames)
- contact: L: thumb on the cover: 307.1 mm (72/72 frames)
- contact: L: fingertips under the cover: 274.1 mm (72/72 frames)
- contact: L: heel on the table: 5.8 mm (5/23 frames)
- contact: L: fingertips on the table: 12.3 mm (14/23 frames)
- joint: L forearm.turn 81.3° @57 closing: →close (close)
- fastest: L forearm.turn @99 closing: →lean (close)

### lamp lever

- contact: R: palm on the lever: 72.0 mm (124/266 frames)
- contact: R: fingertips on the lever: 115.5 mm (266/266 frames)
- contact: R: thumb on the lever: 73.6 mm (233/266 frames)
- joint: R forearm.turn -80.2° @382 light: lamp (lamp)
- fastest: R elbow.flex @80 lean-out: lean (lamp)

### door ring

- contact: R: fingers hooked on the ring: 227.8 mm (82/125 frames)
- joint: L forearm.turn -80.9° @52 door: →door (door)
- fastest: L elbow.flex @32 door: →door (door)

### mug

- contact: R: fingertips on the mug: 15.4 mm (614/614 frames)
- contact: L: fingertips on the mug: 7.0 mm (614/614 frames)
- contact: R: forearm on the chair arm: 22.2 mm (82/82 frames)
- contact: L: forearm on the chair arm: 21.6 mm (82/82 frames)
- fastest: R elbow.flex @123 chair: →mug (mug)

### stair rail

- contact: R: palm on the rail: 47.1 mm (191/1290 frames)
- contact: R: fingertips on the rail: 32.7 mm (1160/1290 frames)
- fastest: R wrist.dev @902 stairs: rail (stairs)

### chair arms

- contact: R: forearm on the chair arm: 14.9 mm (28/28 frames)
- contact: L: forearm on the chair arm: 14.4 mm (28/28 frames)
- contact: R: off the pages: 3.2 mm (37/37 frames)
- joint: R forearm.turn -115.3° @0 to-chair: →walk (to the chair)
- fastest: R elbow.flex @167 lean-in: lean (rise)

### walking arms

- joint: R forearm.turn -115.3° @6694 logbook to-chair: walk (night: walk)
- fastest: R wrist.share @75 daymap door: walk (night: walk)
