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

Everything lives in [index.html](index.html) — inline CSS, DOM overlay, and the full game in one `<script>`. There are no modules; all functions and state are top-level globals.

- **Entry point:** `init()` builds the scene then `animate()` starts the render loop. Both are called immediately after global state declarations (~line 243).
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
- **Coordinates are large-scale** (arena limit ±450, monas ~25 wide, camera height 10). Sizes/distances assume this scale; keep new geometry proportional.
- **Fire rate / reload use real time:** `Date.now() - player.lastShot > 130` ms between shots; reload is a 3s `setTimeout`. Auto-reload triggers when `ammo` hits 0 with mags left. Recoil and muzzle flash are visual-only (`gunRecoil` / `muzzleFlash.intensity` decay by `dt`) and deliberately kept off the camera quaternion so they never corrupt mouse-look.
- **Spawning:** `dt` accumulator in `update()` fires `spawnZombie` every `wave.spawnInterval`s; capped at `wave.maxZombies`, spawned 100–180 units from the player at a random angle.
- **SFX:** always play via `playSFX(sfx)` which clones the `Audio` node so overlapping sounds work.
- **`resetGame()`** must clear every entity array and `scene.remove` its meshes — keep it in sync when adding entity types.

## Editing guidance (from AGENTS.md)

- Keep changes compatible with a single static page. Do not introduce build tools, frameworks, or package dependencies unless the user explicitly asks to modernize the project structure.
- Only split inline script/CSS into separate files if the user requests it.
- Preserve existing controls (WASD move, Shift sprint, mouse look, left-click fire AK47, right-click grenade, R reload, Space to restart) and core mechanics unless the user asks for gameplay changes.
