# WINGS OF FREEDOM

A fan-made Attack on Titan game for the browser: Omni-Directional Mobility gear, Wall Rose, Trost District,
the Forest of Giant Trees, titans that want to eat you, and the Colossal Titan. Everything is generated in code
(geometry, textures, sound and music). No assets are downloaded.

**Play:** open [`dist/wings-of-freedom.html`](dist/wings-of-freedom.html) in Chrome, Edge or Firefox. It is a
single file, so double-clicking it works. For development, serve the repo root
(`npx http-server . -p 8080 -c-1`) and open `http://localhost:8080/aot/`.

## Controls

| | |
|---|---|
| Mouse | look (click the game to capture the mouse) |
| **Q** / **E** (hold) | fire the left / right anchor at the crosshair; let go to release |
| **Right mouse** (hold) | fire both anchors (they splay either side of the aim point) |
| **Space** (hold) | gas: boosts the reel and thrusts where you look. On the ground it jumps. Clinging to a trunk, it kicks you off |
| **W A S D** | run on the ground; in the air, steer; on a wire, pump the swing |
| **Shift** | gas dash (dodge a hand) |
| **Left mouse** | slash. Hold it while flying fast for Levi's spinning slash |
| **R** | swap to a fresh pair of blades (4 spare pairs) |
| **Esc** / **P** | pause · **M** mute |

Supply depots (crates under a Survey Corps flag) refill gas, blades and health. There is one on the wall top
either side of the gate, one on the Garrison HQ roof and one on a platform in the forest.

## How the ODM gear works (the physics)

`src/player/odm.js` and `src/player/player.js`, stepped at a fixed 120 Hz with render interpolation:

* **Anchors** are projectiles (300 m/s, 115 m range) that ray-march the collision world. They stick to stone,
  bark, roofs, branches and titan flesh. On a titan, the anchor rides that limb.
* **The wire is a one-sided distance constraint.** It can go slack but never stretch. When it is taut, only the
  outward velocity is removed, so the tangential speed survives. A free swing conserves energy (the bench
  measures under 1 % drift over 12 s).
* **The reel** is a gas-driven winch with a torque curve. It pulls hard from rest and fades as the inward speed
  nears its limit (36 m/s, or 64 m/s with the gas trigger held), and it instantly winds in any slack. A wire
  that shortens while you circle spins you up (angular momentum), which gives the anime's slingshot around a
  trunk.
* **Gas** thrusts where you look, boosts the reel, powers the dash, and is finite. Air drag is quadratic
  (free-fall terminal speed about 75 m/s), and gravity is 14.5 m/s² for snappier, heavier arcs.
* **Landing assist:** when you are about to hit a surface head-on while flying on a wire, the front vents bleed
  off the closing speed so you land on the trunk instead of hitting it. Sideways passes keep all their speed.
  Held against a wall by a wire, you run up it.
* **Collision** is a swept sphere (sub-steps of 0.3 m or less, up to 12 per tick) against analytic shapes:
  oriented boxes, vertical cylinders, capsules, spheres and a height-field. Nothing tunnels at 100 m/s.
* **Damage:** a slash deals `(40 + relative speed × 12.5) × blade sharpness`. Small titans need about 25 m/s at
  the nape, 15 m titans about 45 m/s, and the Colossal takes several fast cuts.

`node aot/tools/physics-bench.mjs` runs the real player code headless through a free swing, zips, an orbit, a
fall, a run and a wall climb, and checks the numbers.
`node aot/tools/play-bench.mjs "play=free"` drives the real game in headless Chromium and screenshots a flight.
`node aot/tools/forest-bench.mjs 60` flies AI soldiers through the real forest for a minute and reports altitude,
speed, canopy passes and tunnelling (none). URL flags for testing: `?play=free|expedition`, `?notitans`, `?noallies`,
`?allies=N`, `?noaudio`, `?norender`, `?testworld`, `?sens=1.5`, `?invert`.

Your **comrades**: a few AI Survey Corps soldiers fly on exactly the same ODM physics as you. They hop from tree to
tree and harass titans, which you can watch behind the title screen too.

## Layout

```
src/main.js            renderer, fixed-step loop, module loading, title flyover
src/game.js            modes, waves, the Colossal, score and combos
src/config.js          every tunable of the gear
src/core/collision.js  collision world (broadphase grid, raycasts, sphere contacts, dynamic shapes)
src/player/            ODM gear, player physics and camera, the Survey Corps soldier model with a cloth cape
src/titans/            procedural titans, their AI, grabs, nape hitboxes, the Colossal Titan
src/world/             Wall Rose, Trost District, the field, the Forest of Giant Trees, sky
src/fx/                particles (gas, steam, blood, sparks, leaves, lightning), slash arcs, anime speed lines
src/audio/             Web Audio synthesis: gear, blades, titans, wind, a procedural battle score
src/ui/                HUD, menus
ARCHITECTURE.md        the module contract
```

This is a fan project, not affiliated with the creators or publishers of Attack on Titan.
