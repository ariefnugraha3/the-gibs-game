# AGENTS

Onboarding guide for AI agents (and humans) working on this repository. It condenses the
rules in [CLAUDE.md](CLAUDE.md) — on any conflict, **CLAUDE.md wins**; keep the two in sync.

## Repository overview

"Adversarial Intelligence" — a browser **top-down shooter** (Alien Shooter-style; pivoted from
FPS on 2026-07-11). Three.js r128, plain ES modules, **no build step, no npm dependencies,
no framework**. Two modes:

- **Survival** — round-based waves defending the Monas monument; a Field Shop opens
  between waves; score = shop currency. Detail: [docs/survival.md](docs/survival.md).
- **Campaign** — 8 linear stages (text prologue → helicopter intro cutscene → three
  indoor office floors → an outdoor tank battle → a depot/train journey to Bandung → a failed kill-switch upload inside Bandung Headquarters → branching Bandung streets → an autonomous-vehicle firefight and combat-gunship duel on Cisumdawu), an inter-stage shop, loot
  as currency, hacking/repair minigames, a stage checkpoint save.
  Detail: [docs/campaign.md](docs/campaign.md).

**Controls:** WASD = screen-axis movement · mouse = virtual aim cursor · LMB = shoot ·
RMB = move-to-point · 1/2/3 = weapon slots · Q = cycle weapons · 4 = use medkit instantly ·
F = melee (dual knives) · Shift = dodge roll (brief invincibility). Crouch, jump, ADS,
sprint, reload and the thrown grenade **do not exist** — their code is dormant on purpose;
never re-wire it.

## File layout

- `index.html` — DOM overlays + CDN `<script>` tags (Three.js r128 as the **global**
  `THREE` — modules never import it) + the module entry.
- `src/main.js` — boot → menu → `startGame(mode)` → the `animate()` frame loop.
- `src/core/` — engine/orchestration: config, state, renderer, input, HUD, scene manager,
  preload/warm-up, save, pause menu, cheat console, death director, time scale.
- `src/entities/` — shared gameplay systems: player, avatar, weapons, bullets, robots,
  tank/gunship bosses, gore, effects, drops/ammo/crates/barrels, helicopter, procedural train/scenery, enemy pickup and props.
- `src/scenes/` — one file per scene: `campaign/{stages,cutscenes,utility}/`,
  `survival/{,cutscenes/}`, `menu.js`. Adding a stage = one new file + wiring
  (recipe in docs/MODULES.md).
- `src/utils/` — pure helpers usable anywhere: `pathfind.js` (nav grid + A* + LOS),
  `collision.js` (hug-and-slide primitives), `meshBatch.js` (static decor welding),
  `textures.js` (procedural canvas textures), `sfx.js` (all audio + music), `math.js`.
- `src/world/` — shared world pieces: lighting sets, sky, decor registry, building
  facades, and **`palette.js` — the art-style single source of truth (PAL tokens)**.
- `css/style.css` — all styling; `@font-face` Courier Prime (`assets/fonts/`, OFL) is the
  ONLY UI font — no CDN webfonts.
- `config/gameplay.json` — **every tunable gameplay number**, loaded into `CFG` at boot.
- `assets/sounds/` — SFX + three music tracks. There are **no 3D model assets** — every
  robot, prop and building is procedural geometry built in code.
- `tools/smoke.mjs` — the headless test suite (see below).
- `package.json` — metadata only (`"type": "module"`). No dependencies.

## Documentation map — read on demand

| Working on… | Read |
| --- | --- |
| Any module, export, scene hook, config key, adding a stage | [MODULES.md](docs/MODULES.md) — the authoritative catalog |
| Campaign stages, cutscenes (incl. the text prologue), doors/lifts, minigames, shop, save | [docs/campaign.md](docs/campaign.md) |
| Waves, field shop, Monas objective, wave events, scoring | [docs/survival.md](docs/survival.md) |
| Robots, weapons, gore, loot/barrels/crates, armor, movement/dodge/stamina, collision | [docs/combat.md](docs/combat.md) |
| Camera rig, avatar, death sequence, HUD, menus, input/pause/cheats, SFX & music | [docs/presentation.md](docs/presentation.md) |
| New gameplay feature backlog | [SECOND-IMPROVEMENT-PLAN.md](docs/SECOND-IMPROVEMENT-PLAN.md), then [IMPROVEMENT-PLAN.md](docs/IMPROVEMENT-PLAN.md) — update their status tables when finishing an item |
| Windows `.exe` / Steam port | [STEAM-DESKTOP-PLAN.md](docs/STEAM-DESKTOP-PLAN.md) |

## Running & testing

```bash
python -m http.server 8000     # serve — MANDATORY (ES modules + config fetch fail on file://)
                               # open http://localhost:8000 (internet needed: Three.js CDN)
node tools/smoke.mjs           # headless smoke suite — must end "<N> pass, 0 fail"
node --check src/<file>.js     # syntax check every touched file
```

- If `node` is not on PATH (common in non-login shells), a working binary ships with the
  VS Code server: `~/.vscode-server/bin/<hash>/node`.
- The smoke suite has **zero dependencies** — stubbed THREE/DOM/Audio drive the REAL
  `src/` modules. The `[postfx] … CDN tidak termuat` line it prints is expected in Node,
  not a failure. The `localStorage` stub is a real in-memory Map (save/checkpoint testable).
- It is a **flat sequential script**: no per-test filter — run the whole file, or comment
  out a section (`// --- 12b. NAME ---` blocks) to isolate one. The assert count grows
  every session — **never assert on the total**.

## Mandatory workflow for every gameplay change

1. Add/adjust smoke asserts for the new mechanic — **config-driven** (read `CFG`, never
   hardcode tuned numbers; the user hand-tunes `gameplay.json` between sessions, and a
   test failing right after a pure config retune almost always means the test hardcoded
   a number).
2. `node tools/smoke.mjs` until green.
3. `node --check` every touched file.
4. Sync `CLAUDE.md` + `docs/MODULES.md` (+ the matching `docs/` file and this file if rules
   changed).

A missing stub method (fakeEl/THREE) is a **harness gap, not a game bug** — extend the
stub in `tools/smoke.mjs` instead of working around it in game code.

## Architecture rules (digest — full text in CLAUDE.md + docs/MODULES.md)

- **Scene hooks, never mode if-else.** All mode/stage-specific behavior goes through the
  `activeScene.*` interface (contract table in docs/MODULES.md). Shared systems must not know
  which mode is running.
- **All tuning numbers live in `config/gameplay.json`** → `CFG`. Read `CFG.x.y` **inside
  functions only** (config is not loaded when modules evaluate). Visual-only values
  (animation amplitudes, colors, FOV) intentionally stay in code.
- **Cross-module state = live ESM bindings**: the owning module exports `let` + setters;
  circular imports are fine **as long as bindings are only used inside functions**.
- **`updateGame()` block order in core/game.js is a contract** — bullets must move before
  the robot sweep hit-test. Don't reorder.
- **One global time scale**: `globalTimeScale()` (core/timeScale.js). A new slowdown
  source becomes a factor inside it — never a second multiplier in the render loop.
- **The `camera` object is the player LOGIC PIVOT, not the render camera** — rendering
  uses `viewCam`. Never hardcode screen directions: use `SCREEN_UP`/`SCREEN_LEFT`.
- **Frame-rate independence**: multiply motion by `step` (= dt·60), decrement timers by
  `dt`; fire rates use real `Date.now()` time.

## Invariants — deliberate decisions, do not "clean up"

The full annotated list lives in [CLAUDE.md](CLAUDE.md#invariants--deliberate-choices-do-not-clean-up); highlights:

- **No mid-game shader recompiles**: fixed FX pools, constant PointLight counts, every
  lazily-revealed mesh added to `core/preload.js` warm-up.
- **Art style "GIBS 2045"** (`src/world/palette.js`): PAL tokens only, no neon
  cyan/magenta, environment emissive ≤ 0.9 — enforced by smoke material sweeps.
- **All user-facing UI text is ENGLISH** (permanent user rule); code comments are
  Indonesian.
- **Every spoken-dialogue box uses a character-by-character typewriter reveal**;
  speaker labels may appear immediately, while speed and full-text hold are config-driven.
  Narration captions and short HUD/status messages are not dialogue boxes.
- **Dialogue source contract:** spoken/cinematic text lives in `config/gameplay.json`
  under `dialogue`; scenes read it through `src/core/dialogue.js`. Keep objective/HUD
  status strings separate from the dialogue data.
- Collision resolves are **per-axis hug-and-slide, never a full revert**; robots pushed
  by separation must be re-clamped via `activeScene.clampRobot`.
- Robots show **no damage feedback**; the radar has **no sweep/gradient**;
  `#crosshair` stays hidden with its JS writes intact.
- Barrels/crates are solid to the player only and stay **out of the nav grid**;
  furniture is the opposite (in `blockers` AND nav).
- Green Campaign finish screens show per-stage total time and destroyed loot boxes.
  Reset these stats only on an actual `campaign-N` entry/restart; modal minigames and
  Field Shop transitions preserve them, and red GAME OVER hides the summary.
- Every Campaign stage must end on its green `STAGE N COMPLETE` screen before any
  Field Shop transition. CONTINUE/Space preserves the whole campaign loadout/checkpoint
  and opens the shop; only Start Next Stage enters the following stage.
- The campaign prologue is **DOM-only on a pitch-black screen** — typed text on the left,
  a per-era cinematic ASCII tableau on the right (`prologueArt.js`; SVG is only the
  container and every visible mark is a monospace `<text>` glyph). Its phase-driven
  layers reveal silhouette → subject → detail; the script remains the user's
  **word for word** (exact-string smoke assert).
  Left-click during body first reveals all remaining typed text; only a later click
  advances the era. Chapter changes are silent, and menu music continues through the
  prologue before stopping on the heli intro's first live frame.
- Stage 5 lives in `stages/stage5/` (2026-08-07 split of a 1631-line file): `index.js`
  facade + `world.js`/`props.js`/`runtime.js`, and THREE sub-scenes — `station.js` (starting
  station), `journey.js` (train departs), `arrival.js` (Bandung, stage ends). Sub-scenes use
  the normal scene-hook contract but never call `setScene`: `activeScene` stays `stage5Scene`
  so checkpoint/stageStats/modal-resume are unchanged. `enterSub()` is the only switch path —
  cut to black, fade in over `CFG.campaign.stage5.subSceneFadeSec` (0.5 s) next frame; stage
  entry passes `{fade:false}`. The dialogue queue is shared and never reset between sub-scenes.
- Stage 5 keeps its five-car train arena static in world coordinates. Travel is the
  illusion of fixed pooled scenery moving and wrapping; never move player/robot physics,
  allocate scenery per frame, add a boss, or bypass the config-driven minimum ride/final
  defense gates. Its depot is the frozen 30×50 CSV map: clear combat → hack C1 → open the
  platform door → repair generator C2 → board; station robot spawning, AI and clamps all
  reject `SA`/`S`, so those cells never contain robots.
- Stage 5 station has TWO tracks (2026-08-06 user CSV). Tokens `=`/`,`/`T`/`I`/`L`/`@` join
  the old legend; `S5_FINISH_MAP` is the 30×19 Bandung terminal. The player may never step
  onto the enemy track or the inter-track gap, robots may, and `@` window walls stop bullets
  while their glass stays an unwelded transparent mesh. REWORK 2026-08-07: every part-1 robot
  lives in the freight hall (`encounters.depot`, one spawn spot each). The enemy consist never
  stops, opens doors, or unloads — `enemyTrain` config is only `{flybySec}` and drives one
  atmospheric pass when the hall is cleared. Opening the platform door arms C2 immediately;
  there is no wave gate and no contested boarding. The five-car
  consist keeps its journey arena and is merely shifted while docked so TC/TL match the CSV.
  SA shares the normal hall floor material. Depot robots remain hard-frozen until the
  player's full footprint leaves SA, then chase together. C1/C2 are detailed animated
  2045 landmarks, and depot/platform freight furniture is solid and nav-baked.
  Stage 5 entry clears `cineFade` synchronously so the station renders before its delayed
  opening dialogue; do not make fade cleanup depend on an unpaused gameplay update.
  The train may move visually in the departure shot, but the station root and destination
  terminal must never move or join a wrapping scenery pool. Arrival opens the Field Shop
  and transitions to Stage 6.
- Stage 6 is one continuous 76×52 Bandung Terminal→HQ world. Its arrival platform is a
  safe area that hard-freezes terminal robots until the player's full footprint leaves;
  Station Operations and both any-order substations then gate the service tunnel and HQ.
  The command floor must be completely clear before the uplink activates. Upload always
  stops at the config-driven 92%, reveals IKN as the only valid broadcast site, starts
  lockdown, and opens the Field Shop before Stage 7. It has exactly 52 config-driven
  C/B/A robots and no boss/miniboss/tank/boss HUD/score/music.
- Stage 7 is one static 118×72 road network at x≈240000. It commits one of three city
  routes and then flyover/underpass; prebuilt bollards close unchosen routes, whose robots
  are never spawned or counted. Each run has 50–54 ordinary robots, then three finite toll
  waves at 0/16/32 seconds with a 55-second minimum. GRD LTV-45 is a procedural hero
  vehicle with fixed animation state. No boss/miniboss/tank/boss HUD/score/music or
  infinite respawn; its green complete screen opens the Field Shop before Stage 8.
- Stage 8 is the coordinate-stable GRD LTV-45 gunner arena at x≈270000. Seven lateral
  corridors span both three-lane carriageways and the traversable median; `A/D` are
  edge-triggered lane snaps while walking/RMB/dodge/melee are scene-gated off. The
  opening announces 100 km, but there is no runtime distance counter. Timed pickup
  carriers each mount exactly three ordinary A/B robots and keep spawning until the
  config-driven target of 20 carriers is destroyed. Only then does the standalone
  `combatGunship.js` boss (HP live-linked to tank HP) arrive and cycle telegraphed
  MG/cannon/three homing missiles. Road scenery wraps from fixed pools, Kertajati is a
  separate static set, and the final green screen preserves checkpoint 8. The live lane
  spacing reads `CFG.campaign.stage8.laneWidth` (default 17.5 = 2.5 m); its gameplay camera scales
  the original offset uniformly by 1.20. Entry must leave `cineFade` transparent while
  the post-shop pointer-lock blocker is paused, otherwise the opening appears frozen.
  GRD LTV-45's normalized final dimensions are 5.20×2.20×2.15 m; pickup carriers are also
  normalized below lane width, and mounted anchors use the resulting axis scales.
  GRD LTV-45 starts in lane slot 1 on Indonesia's left-hand carriageway. Pickup entry alternates
  rear/front at the two ends of the 20-module fixed road pool, but every carrier uses
  lanes 0–2 and faces +X; front entries are slower same-direction traffic. Never spawn one
  inside the camera footprint or at its combat target; extend X past the road endpoint
  when `groundViewExtents()+pickupOffscreenMargin` requires it.
- Dormant-but-kept systems (reload, ADS, crouch, jump, sprint, thrown grenade, medkit
  channel) must stay unreachable — don't re-wire, don't delete.

## Editing guidance

- Keep the project a **static, buildless site** — no bundlers, frameworks, or npm deps.
- New tuning numbers → `config/gameplay.json`; new mode/stage behavior → scene hooks.
- Preserve the controls and core mechanics unless the user explicitly asks for changes.
- If you edit an indoor room layout, re-verify grid connectivity (BFS over floor cells)
  and door clearance; the smoke suite has stage-connectivity asserts.
- Update `docs/MODULES.md` whenever modules/exports/scene hooks/config keys change, and put
  new mechanic prose in the matching `docs/` file (CLAUDE.md stays lean).
