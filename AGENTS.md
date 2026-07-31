# AGENTS

## Repository overview

This repository is a browser game titled "Gibran vs Robot 3D" — a **top-down shooter** (Alien Shooter-style; pivoted from FPS on 2026-07-11).

- `index.html` — DOM overlay + CDN `<script>` tags (Three.js r128 global) + module entry.
- `src/` — the whole game as ES modules (core/, utils/, world/, entities/, scenes/). **The module catalog and interface contracts are documented in `MODULES.md` — read it first.**
- `css/style.css` — all styling.
- `config/gameplay.json` — every tunable gameplay constant (max ammo/hp, speeds, stamina, wave difficulty, ...). Loaded at boot into `CFG`.
- `assets/sounds/*.mp3` — sound effects + the three music tracks; `assets/fonts/` — Courier Prime, 4 faces, OFL (**the font of ALL game text since 2026-07-31** — declared via `@font-face` in style.css; Arial is gone, no CDN webfont). There are **no 3D model assets** — every robot, prop and building is procedural geometry built in code.
- `tools/smoke.mjs` — the headless test suite (see below).
- `package.json` — metadata only (`"type": "module"` for Node tooling). No dependencies, no build system.

## What agents should know

- There is **no package manager, bundler, or framework** — plain static ES modules. Keep it that way.
- The game **must be served over HTTP** (`python -m http.server 8000`); ES modules + config fetch do not work from `file://`.
- `THREE` is a global from CDN scripts (r128) — modules never import it.
- All user-facing UI text must be **English** (permanent user rule); code comments are Indonesian.
- Architecture rules (scene hooks, CFG usage, live-binding state ownership, update order) are at the top of `MODULES.md` and in `CLAUDE.md`.
- `CLAUDE.md` holds only the rules that apply to every session; the per-system detail lives in `docs/` — `campaign.md`, `survival.md`, `combat.md`, `presentation.md`. Read the one matching your task instead of all of them.

## Editing guidance

- Keep changes compatible with a static, buildless page.
- New mode/stage behavior goes through the scene interface (see MODULES.md), not if-else in shared systems.
- New tuning numbers go into `config/gameplay.json`, not hardcoded constants.
- Preserve the game controls and core mechanics unless the user asks for gameplay changes.
- Update `MODULES.md` when adding/renaming modules, exports, scene hooks, or config keys.

## Running the project

- Serve the repository folder with a static HTTP server and open `index.html` via `http://localhost:...`.
- Test: `node tools/smoke.mjs` — headless suite (zero deps, stubbed THREE/DOM driving the real `src/` modules). Must print `0 fail`. The `[postfx] … CDN tidak termuat` line is expected in Node, not a failure. No per-test filter; run the whole file.
- Syntax check: `node --check src/<file>.js` — per touched file.
- Every gameplay change: add/adjust smoke asserts (keep them **config-driven** — read `CFG`, never hardcode tuned numbers) → smoke green → `node --check` → update `MODULES.md`.
