# Hands check: focus

Thresholds: penetration 2 mm, grip 1 mm, rest 2 mm, nib 0.5 mm, 25° a frame at 30 fps, twist floor 70%, held 0.0005 mm.

## Tests

| test | result | detail |
| --- | --- | --- |
| 1 penetration | pass | max 0.69 mm |
| 2 contact | pass | all within tolerance |
| 4 joint angles | pass | 0 joints out of range; fastest 20.3°/frame (R wrist.ext @44 lean-in: →lean (lean in)); 0 roll flips |
| 7 stability | pass | held hands move 0.0000 mm/frame at most; repeat runs not run; the solver moves a held hand at most 9 times a frame (never more than 26) |

## Interactions

| interaction | result | frames | worst penetration, mm (p99 of frames) | contacts out of tolerance | joints out of range | fastest joint, °/frame | steps of travel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| resting beside the book | pass | 124 | book 0.7 (p99 0.0), table 0.7 (p99 0.6), tin 0.5 (p99 0.0), pencil 0.0 (p99 0.0) | 0 | 0 | 20.3 |  |

2 console errors; first: night=5&phase=dusk: Failed to load resource: the server responded with a status of 404 (File not found)
