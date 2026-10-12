# Hands check: focus

Thresholds: penetration 2 mm, grip 1 mm, rest 2 mm, nib 0.5 mm, 25° a frame at 30 fps, twist floor 70%, held 0.0005 mm.

## Tests

| test | result | detail |
| --- | --- | --- |
| 1 penetration | **FAIL** | 5 objects over 2 mm; worst table 25.1 mm (lean in, L.forearm @47 lean-in: lean) |
| 2 contact | **FAIL** | 9 contacts out of tolerance; e.g. R: off the pages 7.4 mm (write) |
| 4 joint angles | **FAIL** | 0 joints out of range; fastest 229.5°/frame (L little.mcp @32 lean-in: →lean (lean in)); 0 roll flips |
| 6 fuzz | **FAIL** | 2112 placements/frames; worst table 25.1 mm (sweep write landscape); 7 contacts failing; 0 joints out |

## Interactions

| interaction | result | frames | worst penetration, mm (p99 of frames) | contacts out of tolerance | joints out of range | fastest joint, °/frame | steps of travel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| resting beside the book | **FAIL** | 124 | table 25.1 (p99 25.1), tray 12.4 (p99 12.4), book 12.0 (p99 11.6), pencil 6.9 (p99 6.0) | 3 | 0 | 229.5 |  |
| pencil: resting and writing | **FAIL** | 2425 | table 25.1 (p99 0.9), book 19.2 (p99 17.3), tray 12.3 (p99 11.8), pencil 10.4 (p99 9.0) | 9 | 0 | 100.8 |  |

### resting beside the book

- contact: R: thumb on the shaft: 2.8 mm (10/10 frames)
- contact: R: index on the shaft: 49.2 mm (10/10 frames)
- contact: R: middle finger under the shaft: 25.2 mm (10/10 frames)
- fastest: L little.mcp @32 lean-in: →lean (lean in)

### pencil: resting and writing

- contact: R: thumb on the shaft: 2.8 mm (460/471 frames)
- contact: R: index on the shaft: 62.5 mm (468/471 frames)
- contact: R: middle finger under the shaft: 41.2 mm (471/471 frames)
- contact: R: little-finger edge on the table: 7.7 mm (56/56 frames)
- contact: R: off the pages: 7.4 mm (4/68 frames)
- contact: R: little-finger edge on the page: 83.8 mm (365/379 frames)
- contact: R: off the pages but below and right of the point: 178.8 mm (360/379 frames)
- contact: R: nib on the page: 18.4 mm (140/325 frames)
- contact: R: nib on its line: 236.3 mm (169/325 frames)
- fastest: R ring.pip @204 lean: →ready (write)
