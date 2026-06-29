# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-page browser game: "Gibran vs Zombie 3D (DOOM FPS)". A first-person Three.js shooter where the player defends Monas (Jakarta's national monument) against waves of zombies. UI text is in Indonesian; code comments are in Indonesian.

## Running

No build system, package manager, or tests. Open `index.html` directly in a browser, or serve the folder with a static HTTP server (preferred — required for the `.mp3` SFX to load reliably and for PointerLock):

```
python -m http.server 8000      # then open http://localhost:8000
```

Three.js r128 is loaded from a CDN, so an internet connection is required.

## Architecture

Everything lives in [index.html](index.html) — inline CSS, DOM overlay, and the full game in one `<script>`. There are no modules; all functions and state are top-level globals. Assets live under `assets/`: SFX in `assets/sounds/` (`*.mp3`), and visible assets (3D models, textures, images) in `assets/visuals/` (e.g. `zombie.glb`). Reference them by relative path from the repo root.

- **Entry point:** `init()` builds the scene then `animate()` starts the render loop. Both are called immediately after global state declarations (~line 489).
- **Opening cutscene:** a self-invoking `initCutscene()` IIFE (bottom of the script) runs a pure-DOM/CSS 4-slide slideshow (`#cutscene` overlay) before play. It's independent of the Three.js loop — `finish()` just hides the overlay to reveal `#blocker`, whose click requests PointerLock. No game state is touched here.
- **Environment is decorative:** `createSky` (canvas-gradient sky dome + moon/halo), `createCity` (two building rings beyond the ±450 arena plus in-arena rubble), and `createEmbers` (a `THREE.Points` ash field) build the apocalyptic backdrop. Only `embers` animates (`updateEmbers` drifts particles upward and recenters them on the player each frame); none of it has collision.
- **Game loop:** `animate()` → `requestAnimationFrame` → `update(dt, step)` → `renderer.render`. `update()` early-returns when `isPaused` or `isGameOver`, so all gameplay (movement, shooting, AI, collisions) only advances while pointer-locked and alive.
- **Frame-rate independence:** `animate()` derives `dt` from a `THREE.Clock` (clamped to 0.05 to absorb tab-switch spikes) and `step = dt * 60`. Speed constants are calibrated at 60 fps and multiplied by `step`; per-frame timers (drops, explosions, waves) decrement by `dt` in seconds. When adding motion, multiply by `step`; when adding a countdown, subtract `dt`.
- **Entity model:** five arrays — `bullets`, `zombies`, `grenades`, `explosions`, `drops` — each holding `{ mesh, ...state }` objects. `update()` iterates them backwards (`for i = len-1; i >= 0; i--`) so entries can be `splice`d during iteration. Adding a new entity type means: a `THREE.Mesh` added to `scene`, a push into its array, a per-frame block in `update()`, and `scene.remove` + `splice` on death/expiry plus cleanup in `resetGame()` (via `clearArray`).
- **Shared resources:** `GEO` and `MAT` cache geometries/materials reused across entities to cut GC. Zombies clone their material per-instance (so damage-color changes don't bleed across instances) and must `material.dispose()` on death — see `killZombie` / `clearArray`. `clearArray` deliberately skips disposing shared `MAT.*` materials.
- **Difficulty:** `wave` object scales spawn interval, `maxZombies`, and per-zombie hp/speed as `wave.time` accumulates. Spawning is driven by a `dt` accumulator in `update()` (not `setInterval`) so it respects pause.
- **HUD extras:** `drawRadar()` paints a player-relative minimap to the `#radar` canvas (throttled to every other frame); high score persists via `localStorage` key `gibsHighScore`.
- **Player state:** the `player` object (hp/ammo/mags/grenades/isReloading/lastShot/speed/radius). The camera *is* the player — there is no separate player mesh; `camera.position` is the player position and `gunMesh` is parented to the camera.
- **State flags:** `isPaused` (toggled by `pointerlockchange`) and `isGameOver` gate input handlers and `update()`.

## Key mechanics and conventions

- **Collisions are distance checks, not physics.** Zombie-hit, bullet-hit, item pickup, and grenade blast all use `distanceTo` against hardcoded radii (e.g. player `radius` 5 + zombie 3.5). Monas collision is an axis-aligned bounding-box test (`Math.abs(x) < 24 && Math.abs(z) < 24`) that reverts to the pre-move position.
- **Arena = Monas park (`PARK` config).** The playfield is a rectangle `[-PARK.hx..PARK.hx] × [-PARK.hz..PARK.hz]` (currently 620×340 half-extents) built by `createGround`/`createParkRoads`/`createFence`/`createParkProps`: grass interior, central plaza + Monas, diagonal "Jalan Silang" roads, a perimeter **fence** (`FENCE_H`), then the "Jalan Medan Merdeka" ring road (`ROAD_W`), with `createCity` as the distant backdrop. The fence is the player's hard wall — movement is clamped to `PARK.h* - radius - 2`. Park props (fountain, pool, trees) are cosmetic (no collision). Bump fog/sky/camera-far together if you resize `PARK`.
- **Coordinates are large-scale** (park ~620×340 half-extents, monas ~25 wide, camera height 10). Sizes/distances assume this scale; keep new geometry proportional.
- **Fire rate / reload use real time:** `Date.now() - player.lastShot > 130` ms between shots; reload is a 3s `setTimeout`. Auto-reload triggers when `ammo` hits 0 with mags left. Recoil and muzzle flash are visual-only (`gunRecoil` / `muzzleFlash.intensity` decay by `dt`) and deliberately kept off the camera quaternion so they never corrupt mouse-look.
- **Spawning:** `dt` accumulator in `update()` fires `spawnZombie` every `wave.spawnInterval`s; capped at `wave.maxZombies`. Zombies spawn **outside the fence** (mostly on the side nearest the player) and enter via a two-phase state machine: `state:'jumping'` arcs them over the fence (sine parabola, lerping `s*→l*`), then `state:'chasing'` runs the normal ground AI. Jumping zombies are shootable but only deal contact damage once `chasing`. The bullet hit-test uses a chest point `mesh.y + (isModel ? 6 : 0)` so it works mid-air and on grounded models (feet at y=0).
- **SFX:** always play via `playSFX(sfx)` which clones the `Audio` node so overlapping sounds work. The five clips live in `assets/sounds/`: `gun-shoot`, `zombie-spawn`, `grenade-explode`, `reload`, and `jokowi-kaget` (played as the player-damage sound, `sfxHit`).
- **Zombie model:** if `assets/visuals/zombie.glb` loads (`GLTFLoader`), `spawnZombie` clones it per-instance via `SkeletonUtils.clone` (skeleton-safe) and nests it in orientation/scale groups; otherwise it falls back to the cylinder. Calibrated by `ZOMBIE_SCALE` and the `ZOMBIE_ROT_X/Y/Z` degree constants. Model materials are cloned per-instance (dispose on death via `disposeZombie`); geometry/skeleton are shared (never disposed).
- **Zombie animation = idle clip (posture) + procedural legs.** The GLB's only clip (`Take 01`) is an idle, but it's what stands the model upright (it rotates the `root`/`master` bones — the bind pose is laid flat) and sways the head, so it IS played per-zombie via `AnimationMixer`. The legs barely move in it (thighs ~10°), so `animateZombieRig` (called per frame *after* `mixer.update`) overrides only the thigh/shin/arm bones to make a real walk/jump. It swings them by rotating **about the body's lateral axis computed as `up × directionToPlayer`** (anatomically correct regardless of rig orientation/yaw), relative to a rest pose captured at spawn *after* `mixer.update(0)` (so legs swing around the standing pose, not the flat bind pose). Walk = alternating thigh/shin/arm swing + body bob; jump = a static tuck. Amplitudes are the `SW`/`KN`/`AR` constants (knee-bend sign is the likeliest thing to flip if it looks wrong). Bone matching is name-normalized (`collectBones`) since GLTFLoader strips dots; if it fails, `loadZombieModel` warns and the rig stays at rest. Cylinder fallback just gets a vertical bob.
- **`resetGame()`** must clear every entity array and `scene.remove` its meshes — keep it in sync when adding entity types.

## Editing guidance (from AGENTS.md)

- Keep changes compatible with a single static page. Do not introduce build tools, frameworks, or package dependencies unless the user explicitly asks to modernize the project structure.
- Only split inline script/CSS into separate files if the user requests it.
- Preserve existing controls (WASD move, Shift sprint, mouse look, left-click fire AK47, right-click grenade, R reload, Space to restart) and core mechanics unless the user asks for gameplay changes.
