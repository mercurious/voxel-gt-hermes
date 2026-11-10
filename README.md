# VOXEL TURISMO

A browser voxel racing game inspired by Gran Turismo.
Three.js (CDN, no build step) — open it and drive.

## Run

    python3 -m http.server 8321 --directory .
    # then open http://localhost:8321/index.html

Any static server works; Three.js loads from the jsDelivr CDN.

## Cars (5 real legends, arcade-tuned stats)

| Car | Chassis | Engine | Drive |
|---|---|---|---|
| Mazda RX-7 Spirit R Type A | FD3S · 1999 | Rotary, 265 hp | RWD (pop-ups) |
| Nissan Skyline GT-R | BNR34 · 1999 | RB26, 276 hp | AWD ATTESA (wing, quad lights) |
| Toyota Supra RZ | A80 · 1997 | 2JZ-GTE, 320 hp | RWD (big wing, targa) |
| Honda NSX Type R | NA1 · 2002 | C3000 VTEC, 280 hp | RWD (pop-ups) |
| Porsche 911 Carrera | 996 · 2001 | 3.4 flat-6, 300 hp | RWD (duck tail, wide hips) |

Stats are arcade approximations of real specs; each voxel model carries
that car's signature details (wedge nose, pop-up headlight buckets, wing
on posts, quad round taillights, roof stripes, 911 rear hips).

## Tracks (3 real circuits, hand-digitized centerlines)

- **Tsukuba Circuit** — 2.045 km, 3 laps. Front straight → 30A/30B kinks →
  hairpin → S-curves → chicane.
- **Suzuka Circuit** — ~5.5 km, 2 laps. Figure-8 with a real elevated
  bridge crossover over the S-curve section, with piers and graded embankments.
- **WeatherTech Raceway Laguna Seca** — ~3.6 km, 2 laps. Rolling hills and
  the Corkscrew: downhill-then-climb off the hillcrest, terraced hillside.

Layouts are stylized approximations: corner-by-corner character and lap
lengths follow the real circuits; each track is dressed with curbs, barriers,
trees, runoff, start lights, grandstands and a pit building.

## Controls

    W/↑ throttle · S/↓ brake-reverse · A/D or ←/→ steer
    SPACE handbrake (drift) · R respawn on track · M mute · ESC menu
    ENTER start · ENTER back to results menu · L race again

## Features

- Arcade drift physics: heading/slip model with self-aligning torque,
  grip differences per drive type (RWD kicks out, AWD bites, 911 snaps)
- 3 AI opponents with rubber-band-free pace lines, overtake/rejoin logic
- Full race flow: countdown lights, lap timing, best lap, live position,
  3-2-1 standings, results table
- HUD: gear, speed, rpm-ish bar, lap counter, position, minimap with dots
- Drift smoke puffs, wheel spin/steer, soft shadows, day lighting

## Files

    index.html   shell + menu + HUD markup (three via importmap)
    style.css    GT-style dark menu, HUD, results
    js/cars.js     car data + voxel car builder
    js/tracks.js   track data + procedural track builder (ribbon, curbs, barriers,
                   piers, terraces, scenery, start lights, grandstands)
    js/physics.js  arcade Vehicle + AI driver
    js/main.js     game loop, race flow, HUD, minimap, debug handles
                   (window.__game, window.__dbg.cam/scene for testing)
