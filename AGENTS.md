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
  indoor office floors → an outdoor tank battle → a depot/train journey to Bandung → a failed kill-switch upload inside Bandung Headquarters → a 1.5 km night crossing of the Prof. Dr. Mochtar Kusumaatmadja/Pasupati flyover to Pasteur → an autonomous-vehicle firefight and combat-gunship duel on Cisumdawu), an inter-stage shop, loot
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
- **Weapon cadence is PER LEVEL (2026-08-09, user request):** `weaponFireDelay(w, lvl)` is the ONLY reader of fire rate — a weapon carrying `CFG.weapons.<w>.fireDelayByLevel` uses its level's entry, and that table may RAISE or LOWER the delay independently of damage (the shotgun's is the one tuned per level), so never read `fireDelayMs` directly anywhere else. The Field Shop upgrade card must quote the before→after rate (`cadenceNote`) — selling damage while quietly cutting cadence is a trap. → docs/combat.md
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
- **Stage 5-6 minigames are a separate interaction set** (2026-08-09): Stage 5 C1
  and the Stage 6 `I` terminal use `signalTraceMinigame.js` (SIGNAL TRACE), never
  ICE BREACH/progress bars. Stage 5 C2 and all three Stage 6 generators run exactly
  `ADVANCED_REPAIR_PARTS`: FUSE LOADOUT then ROTOR KICKSTART, preserving the completed-board
  index after abort. Welding heat only rolls back the active seam; a mistimed ignition
  only costs rotor RPM. The Stage 6 HQ upload remains a story cutscene.
- **Dialogue source contract:** spoken/cinematic text lives in `config/gameplay.json`
  under `dialogue`; scenes read it through `src/core/dialogue.js`. Keep objective/HUD
  status strings separate from the dialogue data.
- Collision resolves are **per-axis hug-and-slide, never a full revert**; robots pushed
  by separation must be re-clamped via `activeScene.clampRobot`.
- Robots show **no damage feedback**; the radar has **no sweep/gradient**;
  `#crosshair` stays hidden with its JS writes intact.
- The menu front-end is the "field terminal" design (2026-08-09 user request, the old one
  "looked AI generated"): layered Jakarta 2045 skyline backdrop from `src/scenes/menuArt.js`
  (three parallax layers, Monas the anchor, deterministic hash instead of `Math.random`),
  a LEFT-aligned main menu, image-led mode cards with vector schematics, a segmented Settings
  console, and film-card Credits. NEVER re-add the red radial gradient, rounded pill buttons,
  emoji mode icons, or the centred stack. `difficultyNote()` quotes `CFG.difficulty`, and the
  old DOM contract (button ids, `.qbtn[data-q]`, `.dbtn[data-d]`, `.modeCard[data-mode]`,
  `#creditsBody`, `#continuePrompt`) is unchanged.
- THINNED OUT 2026-08-10 (same complaint, second pass). The thing that reads as machine-made
  is DENSITY, not the design language: the first pass carried nine pieces of fake telemetry,
  a hint line under EVERY menu entry ("Exit Game — stand down and close the terminal"), six
  registers of text per mode card, CRT scanlines, hazard stripes and eleven near-identical
  micro-label styles. Also banned now: status/telemetry rails, per-entry hint lines, entry
  numbers, mission-dossier card chrome (op code, spec table, DEPLOY footer, stripe), CRT
  scanlines, corner captions inside the schematics, and any new one-off micro-label size.
  A menu entry is ONE WORD; a mode card is a picture and three lines; every small label uses
  the one shared 10.5px/0.28em rule. Smoke pins all of these absences.
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
  facade + `world.js`/`props.js`/`runtime.js`, and FOUR sub-scenes — `station.js` (starting
  station), `departure.js` (train-departure cutscene, split out of journey.js on 2026-08-08 at
  the user's request), `journey.js` (the ride), `arrival.js` (Bandung, stage ends). Sub-scenes use
  the normal scene-hook contract but never call `setScene`: `activeScene` stays `stage5Scene`
  so checkpoint/stageStats/modal-resume are unchanged. `enterSub()` is the only switch path —
  cut to black, fade in over `CFG.campaign.stage5.subSceneFadeSec` (0.5 s) next frame; stage
  entry passes `{fade:false}`. The dialogue queue is shared and never reset between sub-scenes.
- Stage 5 keeps its train arena static in world coordinates. Travel is the
  illusion of fixed pooled scenery moving and wrapping; never move player/robot physics,
  allocate scenery per frame, add a boss, or bypass the config-driven minimum ride gate.
  Its depot is the frozen 30×50 CSV map: open the safe door → destroy the central robot
  factory + clear combat → hack C1 → open the platform door → repair generator C2 → board.
  `SA`/`S` reject spawn points only; robot walk/nav/clamp allow living robots to chase the
  player inside after the safe door begins opening; that door stays latched open for depot combat.
- Every campaign door is the one shared two-leaf rig in `campaign/utility/doors.js`
  (`buildSplitDoor` / `setSplitDoorOpen` / `splitDoorLeafOffset`) — stage 1-3 doors, stage 3's
  blast and exit doors, stage 5 station doors, both stage 6 chapters. No stage computes its own
  leaf offset. Leaf travel is `leafSpan × (1 − DOOR_OPEN_REVEAL)` with `DOOR_OPEN_REVEAL` = 0.1
  (2026-08-08 user request), so a fully open door keeps 10% of each leaf visible instead of
  vanishing into the wall; the effective gap is 10% narrower on purpose. The same offset helper
  feeds the stage 1-3 bullet slab test, so the visible sliver actually stops edge shots.
- Every door in every stage shares one pair of clips (2026-08-07 user request):
  `door-open.mp3` when the leaf starts opening, `door-closed.mp3` when it lands shut,
  triggered ONLY through `playDoorSFX`/`doorMotionSFX` in `campaign/utility/doors.js`
  (distance-gated; gated on the closed<->open THRESHOLD CROSSING, not per-frame direction, so one
  open/close = exactly one sound). Door integrators must LAND EXACTLY on their target — a `dir`
  that is never zero makes a fully-open door jitter every frame and floods the audio. Wired into stage 1-3 sliding doors,
  stage 3's blast door, stage 5 station doors and stage 6 doors. A new stage door must call
  that helper — never play a door clip directly; smoke sweeps `src/` and rejects
  `sfxDoorOpen`/`sfxDoorClose` outside sfx.js + doors.js. A running train uses
  `train-sound.mp3` (`startTrainLoop`), not the borrowed tank loop, and loops through the
  Web Audio gapless path (`GAPLESS_LOOPS`/`primeGaplessLoops` in sfx.js): `<audio loop>`
  replays the MP3's encoder padding as ~47 ms of silence every cycle. Don't try to fix that
  by re-encoding — the padding is inherent to MP3. Falls back to `<audio>` if Web Audio is
  unavailable.
- Every active campaign door uses a 50:50 split-leaf rig (2026-08-08 user request):
  `buildSplitDoor`/`setSplitDoorOpen` in `campaign/utility/doors.js` move both leaves
  symmetrically left/right along the wall. Never make an active door sink into the floor or
  rise into the ceiling. This covers Stage 1-3 automatic doors, Stage 3 blast + exit doors,
  Stage 5 station doors, and both Stage 6 chapters; Stage 1-3 bullet sweeps follow the two
  moving leaf footprints. Broken/jammed doors and road bollards remain static barriers.
- Stage 5 ROLLING STOCK + JOURNEY GAMELOOP (2026-08-07 user rework). The train body is
  EXACTLY 4 m wide (`TRAIN_CAR_WIDTH = 4×CAMP_M`); length/height derive from that width with
  real proportions (16.5 m × 3.9 m), and 16.5 m is 7 CSV cells so car/locomotive land on
  TC/TL with `TRAIN_CAR_GAP = 0`. The player's consist is ONE car + ONE locomotive
  (`TRAIN_CAR_COUNT = 2`) with an EMPTY `doors` array — no bulkhead ever opens. The player's
  car is an OPEN-TOP GONDOLA (reshaped 2026-08-08 user request): underframe, chest-high solid
  sides, outward-only top sill, external stiffener ribs, four corner posts, outside-hung
  boarding door. It has NO roof structure and NO ceiling lights — the old roofless rib cage
  with amber strips hanging from it read as floating in mid-air. Nothing may hang over the
  open bay unless it touches the blind bulkhead against the locomotive (the one tall plane,
  and it faces up-screen so it never occludes the avatar); sides stay chest-high so the
  oblique camera sees the player inside a 4 m body, and interior detail stays flat against a
  wall so the corridor is clear. Both rules are smoke-asserted from the built mesh.
  `TRAIN_X0/X1/Z0/Z1` are the car INTERIOR, so the player can never leave the car nor enter
  the locomotive; the corridor is narrower than a crate's block radius, so no crates go
  inside the train (journey supplies are drops). Every departure shot is LOCKED-OFF: cine
  focus never follows `departureShift` (that made the station sweep past instead), but
  the player pivot DOES ride with the car during the departing shot (2026-08-08 — pinning it
  left Gibran behind on the rails; framing is unaffected because followViewCam ignores the
  pivot while cineFocus is set),
  camera shake is off, and `updateRide` keeps the journey scenery pool hidden for the whole
  `departure` phase — it would otherwise scroll through the station floor. A run-out apron
  of ground+rails east of the platform keeps the departing train on visible track. TWO tracks run through the whole stage —
  the station's from the CSV, the journey's from the scrolling `near` pool (one ballast bed
  + four rails; 18 modules × 5 meshes keeps the pool mesh count unchanged).
  Both in-train sub-scenes return `false` from `bulletBlocked`/`blastBlocked`.
- Stage 5 enemy LOCOMOTIVE is a MINI BOSS (2026-08-09 user request). Destroying the tenth car no
  longer starts the finale: the consist advances once more until the LOCOMOTIVE is level with the
  player's car, then `stages/stage5/loco.js` runs it — HP 1000, plus the two weapons that have
  been on its roof since it appeared (barrels stowed forward, along the direction of travel).
  Three rules that are deliberately NOT tank.js's:
  (1) A 3 s INVULNERABLE ARM WINDOW (`armSec`): turrets swing to combat, the warning strip lights,
  player bullets do nothing. The HUD says so explicitly — otherwise "my shots don't register"
  reads as a bug.
  (2) The MG FIRES AT A DEAD POINT. It locks one spot, gives the player `mgLockSec` (0.5 s) to
  leave it, then puts all `mgShots` (10) rounds down that same line at `mgDamage` 5. tank.js's
  coax re-aims every round; this one must not. (The muzzle sways with the consist, so the
  direction vectors differ slightly — what is pinned is that every ray passes through the LOCKED
  POINT.)
  (3) The GRENADE LAUNCHER FOLLOWS, never overlaps: `mgToGlSec` (2 s) after the LAST MG round it
  lobs `glShots` (3), each locking its impact point on firing and detonating `glFlightSec` (0.5 s)
  later for `glDamage` 25, at EXACTLY the tank mortar's radius — read from
  `bosses.tank.mortarBlastRatio`, never copied, so a retune keeps them equal. **Both directions of the weapon changeover have a gap** (2026-08-09, user request): `mgToGlSec` 2 s for MG -> GL and `cycleGapSec` **1 s** for GL -> MG, so `cycleGapSec` is a hand-over beat, not idle rest.
  Player bullets hit via a SWEPT SEGMENT vs the loco's box: a rifle round covers tens of units per
  frame and a per-frame point test tunnels through a 24-wide body. During the fight the highway
  keeps sending cars but with `highway.bossLoad` = exactly two class-B riders and `bossMaxActive`
  1, so at most two of them exist at once. The weapon rigs live OUTSIDE the welded hull (they
  rotate), and the warning strip outside it too (it toggles `visible`).
- Stage 5 journey combat is ONE TEN-CAR ASSAULT CONSIST (2026-08-08 user request; replaces
  the old enemy-train waves). After `consistDelaySec` of `ride` a single consist of
  `ET_CARGO_CARS` = 10 sealed armoured boxcars + a shielded locomotive appears on the
  parallel track entirely BEHIND the player, OVERTAKES over `overtakeSec`, and settles with
  car 0 — the REARMOST — level with the player's car. Cars then open ONE AT A TIME:
  `open` (only that car's ramp falls; its crew — loaded at launch with every other car's — is already in its firing slots, revealed at `revealAtRamp` but holding fire and `invuln` until the ramp LANDS) →
  `engage` (3–6 robots, class A/B ONLY with B always outnumbering A — `enemyCarMix` floors A
  at `floor((n-1)/2)` whatever `classARatio` says — spawn `mounted`, emerge from the hold,
  shoot across the tracks, and NEVER chase or cross over) → `detach` (that car EXPLODES,
  DECOUPLES and FALLS BEHIND) → `advance` (the rest of the consist DROPS BACK exactly one
  `ET_STEP` so the next car comes level). After the tenth, the locomotive burns in `finale`.
  Arrival needs the whole consist destroyed plus `rideMinSec`.
  The consist is deliberately menacing and its shape is forced by the oblique sight line
  (projected height grows about 1.16 units per unit of depth; the enemy track is 42 units FARTHER):
  the FIXED near wall stays chest-high (`ET_CAR_SILL` 8) so the deck reads, the part that
  seals to `ET_CAR_HEIGHT` 26 is the RAMP (so a sealed car really hides its robots), the roof
  covers only the FAR 58% of the deck (a full-width roof clips robot heads), and the ramp
  stops at `ET_RAMP_OPEN` 0.85 rad so its tip never reaches the player's car. Each car's
  static hull and ramp are welded with `mergeObjectInPlace`; only the ramp, the warning strip
  and four near-side wheels stay separate. The car count is the geometry constant
  `ET_CARGO_CARS`, NOT config — the meshes are preallocated, exactly like `TRAIN_CAR_COUNT`.
- A destroyed spawn machine is a CHARRED WRECK that stays on screen (2026-08-09 user request
  "hitam gosong dengan part yang terlepas"). `wreckSpawnMachine(rig)` chars every body material
  (PAL.rubber/PAL.ink, hazard trim down to the PAL.amberDim ember) and throws ~18 of the rig's
  OWN parts out of pose — no new mesh, material or PointLight, so an exploding machine still
  cannot force a shader recompile; `updateSpawnMachine` returns early on a dead rig, and
  `resetSpawnMachine` restores it for the next entry.
- VISIBILITY DECIDES COLLISION, in both directions (2026-08-08 report; revised 2026-08-09).
  A drawn rig blocks; a rig that is not drawn drops its collider. Because the wreck is now
  drawn, Stages 3, 5, 6 and 7 all KEEP the collider (and Stage 6's `M` cells) after death.
  The only hidden case left is Stage 6 HQ before lockdown deploys its machines: there
  `setMachineSolid(m,false)` splices the blocker and opens the `M` cells (`openMachineCells`)
  until `deployMachine` puts them back. Nav is NEVER rebaked in any case.
- Stage 5 boarding WAITS for the station script, THEN holds (2026-08-08 user request). Touching
  the boarding marker no longer hands over on the spot — that cut the departure cutscene
  over `powerBack`/`routeReady`/`letsMove` mid-type. It now only COMMITS the departure
  (`boardCommitted`): input frozen, cine bars up so the pause reads as a scene starting, marker
  hidden. The station sub-scene ends only on boarding point + `dialogueIdle()` + a further
  `departureDelaySec` (3 s) beat, and only then does `enterSub(departureScene)` run the cutscene;
  when THAT finishes, `journeyScene.enter()` starts the ride behind the black curtain.
- Stage 5 JOURNEY SCENERY IS DENSE AND WELDED (2026-08-09 user report "background perjalanan
  terlalu kosong"). The old pool was largely BUILT OUTSIDE THE CAMERA'S REACH: `far` sat 370 units
  behind the rails where the height budget is negative, so the whole horizon layer never rendered
  a pixel, and the half of `mid` that alternated to +z fell below the bottom edge. Layout now
  derives from `groundViewExtents`: the visible ground trapezoid is z in [-267, +118] relative to
  the player, its far edge is diagonal (x - z ~ 226), and the top edge clips height by ~0.35 per
  unit of depth (~54 tall at z=-70, ~23 at z=-160, 0 at z=-226). All backdrop content lives in
  z -76..-200, the horizon band sits at ~-196 (tall silhouettes there are clipped by the frame
  edge, which is what FILLS it), and the +z side — visible only to z ~ x + 96, and able to occlude
  the player's own car below z ~ 71 — gets a thin FOREGROUND BAND at 84..96. A smoke assert built
  from `groundViewExtents` now fails if any scenery prop is placed outside the trapezoid. `near` (parallax 1.0) carries sleepers on
  both tracks, shoulders/drains, cable trough, lineside fences, poles, km posts, relay boxes,
  block signals and that foreground band (~45 meshes/module); `mid` carries a full block of
  scenery per module for BOTH acts; `far` is 12 modules ALL on -z, moved from -370 to ~-196 with
  parallax raised 0.22 -> 0.40 (it now sits just behind `mid`) and spacing equal to its wrap
  span. Every module and act variant is welded with `mergeObjectInPlace` at build time: ~1690 raw
  meshes draw as ~305. `MESH_CAP.TrainSceneryPool` is loose (2000 — the harness cannot weld); the
  real guard is the smoke test 'S5 LANSKAP: biaya draw call'. Do not move close-to-rail props into
  `mid` (0.62 parallax slides slower than the ground under them), keep long boundary props exactly
  `NEAR_STEP` wide so neighbours abut instead of z-fighting, and vary modules with a deterministic
  hash of the index — never `Math.random()`, which would shift other stages' random placement.
- Stage 5 BACKGROUND = CITY then WEST JAVA MOUNTAINS (2026-08-09 user request). The depot
  stands in the middle of a city: the same `buildCampaignCityscape` ring as Stages 1-3, but
  parented to `stationRoot` (the journey arena uses the same coordinates, so a city welded to
  `scene` would sit in the middle of the rails all ride), at a near-ground `groundY` instead of
  the Floor-2 -70, and with a RAIL CORRIDOR kept clear at every x (the normal ring only clears a
  box around the building, so without it towers grow on the track and on the run-out apron the
  train departs across). Stage 5 therefore calls `enterCityEnv()`, not `exitCityEnv()`; since
  2026-08-10 Stage 6 does the same, leaving Stage 4 as the only stage that wants the apocalyptic
  dome. The journey runs two acts: it OPENS IN THE CITY and switches to
  the WEST JAVA MOUNTAINS the moment the `CFG.campaign.stage5.scenery.mountainAfterCars`-th (3rd)
  enemy car is destroyed — a CAR COUNT converted to `routeK` by `sceneryMountainK()`, so the cut
  lands exactly on that kill. Fixed preallocation is an invariant, so every mid/far scenery module
  carries BOTH landscapes as child groups (`cityG`/`hillG`, `skyG`/`ridgeG`) and the act only
  toggles `visible` — nothing is allocated mid-journey and only one act is drawn at a time. The
  tunnel is now a beat inside the mountain act; the closing `bandung` act returns to city
  silhouettes. `MESH_CAP.TrainSceneryPool` is loose for that reason.
- Stage 5 journey HAS A GROUND SURFACE — grass + soil, never the background (2026-08-09 user
  request "warna tanahnya jangan biru muda ... pakai kombinasi warna hijau rumput dan coklat
  tanah"). The pale blue was NOT a material: outside the ballast bed the journey had no ground at
  all, so what showed under the scenery was `scene.background`, the cool haze `enterCityEnv()`
  installs. The near pool (parallax 1.0 — ground must move at ground speed) now carries TWO bands
  either side of the track corridor, never one slab across it: the rails sit in a shallow CUTTING
  (formation at y ~-5, every lineside prop at y 0), so the terrain surface is y = 0 and the
  corridor between `CUT_FAR`/`CUT_NEAR` stays open or the drains and ballast shoulders get buried.
  Each band is a brown `PAL.wood` body (-6.6..-1.2) capped by a thin darker-`PAL.leaf` grass layer
  (-1.2..0) so the cut face toward the rails reads as EARTH, plus deterministic soil plots 0.3
  above the cap; boxes abut instead of overlapping because coplanar faces z-fight. Bands span the
  full camera trapezoid (z -232..+118) and are exactly `NEAR_STEP` wide. Props that used to stand
  inside the corridor moved out to the `LS_FAR`/`LS_NEAR` rows — invisible floating over ballast
  before, obvious now. Smoke: 'S5 TANAH: ... permukaan tanah sungguhan' derives coverage from
  `groundViewExtents`, 'S5 TANAH: hanya hijau rumput + coklat tanah' rejects any other hue.
- Stage 5 act changes TRAVEL DOWN THE LINE; nothing ever changes act in view (2026-08-09 user
  request "bikin transisi yang mulus ... sekarang terlihat aneh karena tiba-tiba berubah"). The
  first pass toggled `visible` on all 18 mid + 12 far modules in ONE frame, so the whole horizon
  flipped in front of the player. Now the phase only sets a TARGET act and a module may adopt it
  only while off screen, two ways: (1) `wrap()` takes an `onWrap` callback and `adoptAct` runs
  there, so a module reborn at the head of the pool arrives already dressed for the new act;
  (2) at the threshold, `relayoutAhead()` re-dresses every module already parked beyond
  `SCENERY_OFFSCREEN_AHEAD` (420 — outside `groundViewExtents` maxX 267 plus a module half-width),
  because wrap alone leaves the change hanging (one `far` rotation is ~47 s). On-screen and
  already-passed modules are never touched. The nearest relaid modules take a DITHER pattern
  ([0,1,0,1,1,0,1,1]) so the boundary reads as the old landscape thinning out; the far horizon is
  deliberately NOT dithered — a silhouette must move as one line. Measured: old act clear of the
  screen in ~13 s, both acts coexisting ~25 s. Four smoke tests pin it, including '0 kejadian' of
  any module changing act inside the view.
- Stage 5 polish pass (2026-08-09 user reports) — five fixes, each a rule:
  (1) NOTHING STATIC MAY SPAN THE BOARDING OPENING ("kepala major gibran menembus besi yang
  melintang di atas pintu", then "masih ada besi melintang yang tidak ikut terbuka"). The car
  wall is chest-high, so any bar crossing the opening sits at head/shoulder height for whoever
  stands there. TWO offenders: the frame lintel (moved onto the leaves — `buildSplitDoor` gained
  an opt-in `opts.headRail`, half a bar per leaf, so it opens with them) and the PLATFORM-SIDE
  TOP SILL, which ran the full car length at y 9.0-10.2. The sill is now emitted in two segments
  around the opening, exactly like the wall, and the head rail is sized to the same band so it
  still reads continuous when shut. Its CENTRE was at x 0, far from the door — a centre-based
  test never saw it, so smoke now measures mesh X-SPAN OVERLAP with the opening. Stage 1-3/6
  doors are unaffected (their openings are wall-height).
  (2) A PIVOT CARRIED BY A VEHICLE IS NOT A WALK CYCLE ("ketika kereta berjalan, major gibran
  malah terlihat sedang berlari"). The avatar's gait reads pivot displacement per frame, and the
  departing shot rides the pivot along with the car — `setAvatarCarried(true)` tells the rig that
  displacement is not self-locomotion; cleared in `finishDeparture`.
  (3) THE CAMERA-SIDE FOREGROUND BAND IS EXTINGUISHED WHEN THE HIGHWAY ARMS ("ketika transisi
  jalan raya masuk, masih banyak rumah pohon dan objek lainnya yang ada di tengah jalan"). The
  road sweeps from z 200 to 62, so it passes THROUGH the band at 84..96 while merging. The band
  is now its own welded child group `fgG` per near module, toggled by `setJourneyForeground()`
  from `startHighway`/`stopHighway`, cleared wrap-by-wrap plus a one-shot for everything already
  beyond `SCENERY_OFFSCREEN_AHEAD` — nothing ever vanishes on screen.
  (4) BACKGROUND BUILDINGS ARE FIVE SILHOUETTE TYPES OVER A FIVE-TONE WALL PALETTE (`buildingAt`
  + `wallTan`/`wallBrick`/`wallPale`, all `shade()`d from PAL tokens, warm only), not one box
  with a light strip; the far skyline varies material and crown too.
  (5) COMBAT LEFTOVERS RIDE THE WORLD, NOT THE TRAIN ("serpihan robot masih berada di tempat dan
  mengikuti pergerakan kereta player"). `driftGore(dx, keep)` walks gibs, decals, corpses and
  bisected halves back at ground speed every frame of the ride; `keep` excludes the car interior,
  since anything that lands on the deck really does travel with the train.
  The welded draw-call guard moved 400 -> 540 and `MESH_CAP.TrainSceneryPool` 2000 -> 2600 to pay
  for (3) and (4): splitting a weld duplicates any material both halves use.
- Stage 5 FINISH cutscene = FOUR SHOTS, CUT ONLY, in its OWN FILE `stage5/finish.js`
  (2026-08-09 user requests "bikin cutscene terpisah dong buat finishnya" + "lebih baik cutscene
  itu dijadikan file terpisah"). The file was `arrival.js`, which held nothing but this cutscene;
  the scene id is now `campaign-5-finish` and the debug field `stage5Debug().finish`, but the
  PHASE is still `arrival` — that names the world state `updateRide`/`RIDE_PHASES` branch on.
  All hostiles dead -> `arrivalDelaySec` 3 s with the gameplay camera and player control still
  live -> `finishScene`, the mirror of the departure cutscene: (1) extreme close-up IN FRONT OF THE LOCOMOTIVE — the train brakes to a dead stop at
  the platform and `stopTrainLoop()` kills the train sound; (2) close-up of the CAR DOOR OPENING;
  (3) close-up of GIBRAN GETTING OFF; (4) extreme close-up IN FRONT OF GIBRAN with the two radio
  lines, then an `endHoldSec` 3 s hold before the stage closes. Every transition is a hard CUT —
  no camera movement and no fade anywhere inside, including the ending (`finishArrival` calls
  `beginStageTransition` directly). Shot 1 focuses the loco NOSE
  (`locoCenterX() + TRAIN_CAR_LENGTH/2`), never its centre: half a car is 57.75 units, so a
  camera 40 in front of the centre sits inside the body. Shot 1 is also LEVEL with the train, not
  looking down at it: `followViewCam` always aims at `camFocus.y - CAM_LOOK_DROP`, so the shot
  uses `y: -CAM_LOOK_DROP` (exported from renderer.js — copying the number would let a change
  there silently tilt the shot) and the sight line is exactly horizontal.
  THE DESTINATION STATION ARRIVES, IT DOES NOT RIDE ALONG (user "pastikan stasiun tujuan tidak
  ikut bergeser mengikuti kereta"): during the journey illusion the TRAIN is what stands still in
  world space, so a terminal pinned at `baseX` stands still relative to it and reads as glued to
  the locomotive while the world sweeps past. `dockArrivalTerminal()` seeds `journey.arrivalDx`
  with the braking distance (`v0 * stopSec / 2`, the integral of the smoothstep brake curve) and
  `updateJourneyScenery` walks it back at the `near` pool's parallax 1.0, so it decelerates with
  the train and lands exactly on `baseX`. It still never joins the wrap.
  THE CAMERA-SIDE LINESIDE ROW IS EMPTY (user "jauhkan pagar pembatas yang ada di kanan kereta
  karena Major Gibran berjalan menembusnya"): the boundary fence sat at z 30, exactly where
  Gibran now stands after alighting. That strip is claimed by the arrival apron (18..72), the
  merging highway (asphalt 44..80, lamps ~32) and the camera's sight line to the player's car
  (anything below z ~71 can occlude it), so every RAILWAY prop — km posts and relay cabinets
  included — moved to the backdrop row, and the only thing left on the camera side is the
  foreground band's own fence at `FG0 - 2`. Smoke fails if a near-pool prop stands over the
  apron band or on the road. The cutscene OWNS the train speed —
  `updateRide` no longer decays it in the `arrival` phase (its exponential never reached 0) and
  skips `addCamShake`, so all four shots stay locked off. `buildBandungTerminal` gained a
  camera-side apron (`B_APRON_Z0`..`B_APRON_Z1` = 18..72: deck, hazard line, low benches) because
  the CSV platform is on -z (the backdrop, behind the train from the oblique camera) while the
  car's one door faces +z; it is deliberately FLAT — a canopy there stands in the sight line of
  shots 3-4. `arrivalMinSec` is deleted in favour of the `arrival` config block
  (`stopSec`/`frontSec`/`doorOpenSec`/`alightSec`/`radioMinSec`/`endHoldSec`), exactly as the
  departure rework deleted `departureMinSec`, and `S5_ENGINE` is deleted with its last consumer.
- Stage 5 departure SHOT 3 is LEVEL with the car (2026-08-09 user request "arah sorot kamera
  scene ketika pintu gerbong menutup sejajar dengan gerbong, tidak dari atas gerbong"). Same rule
  as the arrival's loco shot: `followViewCam` always aims at `camFocus.y - CAM_LOOK_DROP`, so a
  camera at that height gives an exactly horizontal sight line. The shot uses
  `y: -CAM_LOOK_DROP` (imported from renderer.js — copying the number would let a change there
  silently tilt it) and its distance drops 50 -> 30, because a level view loses the headroom a
  downward one gets for free. Shots 1/2/4/5 keep their angles.
- Stage 5 departure cutscene = FIVE SHOTS, CUT ONLY (2026-08-08 user rework of the single
  locked-off departing shot). In order: (1) close-up of the car door OPENING, (2) close-up of
  Major Gibran BOARDING, (3) close-up of the door CLOSING, (4) close-up of Gibran CONTACTING
  HQ, (5) close-up from the train's FRONT-RIGHT as it departs. Every transition is a hard CUT —
  `cineCam` and `setCineFocus(..., snap)` are written ONCE per shot in `cutTo()` and never
  touched again, so there is no connecting camera move and no fade anywhere inside the cutscene
  (smoke asserts angle+focus are frame-constant within a shot, both change on the cut, and the
  curtain stays transparent throughout). Durations live in `CFG.campaign.stage5.departure`
  (`doorMoveSec`/`doorOpenSec`/`boardSec`/`doorCloseSec`/`radioMinSec`/`departSec`); the old
  `departureMinSec` is gone. Shot 4 owns the `commandDeparture`/`gibranDeparture` radio lines
  and ends on `dialogueIdle()`, so the train stays docked until the call is over; only shot 5
  advances `departureShift`, starts the train loop and spins the wheels. Gibran waits one step
  deeper on the platform than the boarding marker — standing in front of the door puts his back
  between the close-up and the door.
- Stage 5's boarding door is a REAL HOLE in the car's platform-side wall (2026-08-08). The wall
  is built as two segments around `TRAIN_DOOR_X ± TRAIN_DOOR_HALF` and the leaf is the shared
  two-leaf 50:50 rig from `campaign/utility/doors.js`, mounted by `stage5/world.js` on the car
  group so it rides with the train. It is deliberately NOT a member of `train.doors` (that array
  stays empty — the cabin bulkhead never opens), and its sound goes through `doorMotionSFX` like
  every other campaign door.
- Stage 5 has NO distance countdown (2026-08-08 user request). `routeKm`/`rideMinSec` are deleted
  and `stage5Debug().distance` is gone; `routeK()` is `etCarsKilled / ET_CARGO_CARS`, so the
  landscape phases and the destination-terminal reveal follow kills. Arrival needs the whole
  consist destroyed PLUS the road convoy clear PLUS no robots, THEN a `arrivalDelaySec` (5 s)
  hold with the gameplay camera and player control still live — cutting to the arrival sub-scene
  on the frame the last enemy dies reads as a jump (same pattern as Stage 4
  `tankOutro.preCutsceneDelaySec` and Stage 8 `gunshipDeathDelaySec`).
- Stage 5 grows a PARALLEL HIGHWAY from the 5th enemy car (`highway.fromCarIndex`), on the
  train's RIGHT (+z, opposite the enemy track). It sends armed pickups — the same
  `entities/enemyPickup.js` carrier as Stage 8, three class A/B riders, `mounted`, never chasing
  or crossing, loot pulled into the car — and they must be destroyed too. THE ROAD MUST NEVER POP
  IN: do NOT animate one global lateral offset (that reads as a slab of asphalt sliding sideways).
  `roadOffsetAt(worldX)` in `stage5/highway.js` derives each module's lateral distance from its own
  TRAVEL COORDINATE, so modules ahead of the player are already nearer than those behind and the
  road really angles in and merges. `mergeDistance = approachSec × trainSpeed` keeps the curve's
  shape under retune, and `farZ` is outside the camera's +z edge (~118) so it arrives from
  off-screen. THE ROAD MUST ALSO READ AS ONE SMOOTH CURVE: moving only `position.z` left every
  84-unit bar axis-aligned while the road axis drifted ~9 units between neighbours — a jagged
  staircase ("jalannya patah-patah"). Each module is also rotated onto the tangent
  (`rotation.y = -atan(m)`) and stretched along the ARC (`scale.x = sqrt(1+m*m)`), closing the
  joins to 0.17 units; the asphalt is exactly `L` (overlap z-fights coplanar tops) and the lower,
  longer shoulder hides any hairline seam. Guardrails/lamp posts stay on the road's rail-facing (camera-far) edge so nothing
  occludes the vehicles. Pickups spawn only after `roadMerged()`; the spawner stops when the
  consist dies but survivors still have to be killed; `arrivalScene.enter()` calls `stopHighway()`
  behind the already-black sub-scene curtain.
- Stage 5 station has TWO tracks (2026-08-06 user CSV). Tokens `=`/`,`/`T`/`I`/`L`/`@` join
  the old legend; `S5_FINISH_MAP` is the 30×19 Bandung terminal. The player may never step
  onto the enemy track or the inter-track gap, robots may, and `@` window walls stop bullets
  while their glass stays an unwelded transparent mesh. REWORK 2026-08-07: every part-1 robot
  lives in the freight hall (`encounters.depot`, one spawn spot each). The enemy consist never
  stops, opens doors, or unloads — `enemyTrain` config is only `{flybySec}` and drives one
  atmospheric pass when the hall is cleared. Opening the platform door arms C2 immediately;
  there is no wave gate and no contested boarding. The
  consist keeps its journey arena and is merely shifted while docked so TC/TL match the CSV.
  SA shares the normal hall floor material. Depot robots remain hard-frozen until the safe
  door starts opening, then chase together and may enter SA/S. One central shared hero-rig
  spawn machine must also be destroyed; while alive it performs a charge/materialize/eject/
  landing sequence and releases `CFG.campaign.stage5.spawnMachine.batchCount` robots every
  `batchSec`. Spawn selection still rejects SA/S. C1/C2 are detailed animated 2045 landmarks
  with the same 12×12 amber stand-box markers as Stages 1–2 at their H points; expanded depot/platform freight furniture is
  solid and nav-baked. Stage 5 also places explosive barrels in the depot, player-solid only.
  Stage 5 entry clears `cineFade` synchronously so the station renders before its delayed
  opening dialogue; do not make fade cleanup depend on an unpaused gameplay update.
  The train may move visually in the departure shot, but the station root and destination
  terminal must never move or join a wrapping scenery pool. Arrival opens the Field Shop
  and transitions to Stage 6.
- Stage 6 is a FOLDER of TWO CHAPTERS (2026-08-08): stage6/ = index.js facade + runtime.js,
  then arrival.js (Bandung station) -> hq.js (Bandung Headquarters), each with its own world
  module at a separate origin (x~210000 / x~216000, farther apart than camera.far). Chapters
  are sub-scenes on the normal hook contract but never touch core/sceneManager; enterSub() is
  the only switch path: cut to black, then fade in over chapterFadeSec on the next frame.
  Both worlds register lamps under the single lightsKey 'campaign-6' and stay lit together,
  because toggling per chapter would change the point-light count mid-stage.
- Stage 6 BACKGROUND = CITY, like Stage 5 (2026-08-10 user request; it used to show the global
  burning-vortex dome). enter() calls enterCityEnv(), not exitCityEnv(). Hiding the dome alone
  would only swap a strange sky for an empty one, so EACH chapter builds its own
  buildCampaignCityscape ring PARENTED TO THAT CHAPTER'S worldRoot — never to scene, since the
  chapters are 6000 units apart and a scene-welded ring would stand in the other chapter's
  coordinates. Ground heights are exported and deliberate: S6_CITY_GROUND_Y -6 (the terminal is
  on the ground, like the Stage 5 depot) and HQ_CITY_GROUND_Y -70 (the HQ chapter is an
  administration floor one storey up, like the Stage 1-3 offices, so the podium fills the space
  under the slab). The rings are pure decor — zero blockers, zero nav cells, zero PointLights —
  and are reported through the `city` field of stage6WorldDebug()/hqWorldDebug().
- Stage 6 chapter 1 is the user's stages(Stage6-Start).csv, a frozen 50x50 transliteration:
  # wall, A (CSV SA) safe area, S start, W supply room, - auto door, = keyed door,
  @ chapter door, K key rack, I info terminal, G generator, H repair point, F finish.
  SOLID_TOKENS is #KG so racks/generators are furniture (solid to everyone, nav-baked,
  bullet-stopping); robotWalk also rejects A/S, so no robot spawns in or walks into the safe
  area. Phases: opening -> stockUp -> clearHall -> findKey -> powerGrid -> exfil -> complete.
  The hall garrison is frozen until the player leaves the safe area and supply room; ONE of
  three K racks holds the key, chosen at random per entry, and the I terminal narrows the
  markers/radar/HUD to the correct one; the key opens =, all three G generators are repaired
  from their H points, which releases @ and the exfil wave, and standing on F hands to
  chapter 2. TWO robot fabricators (2026-08-09 user request) stand in the hall's north strip,
  just west of the service corridor that leads to F, so the player passes them going in and
  coming out. The CSV is frozen, so they are PROPS (recordProp collider, nav-baked), not map
  tokens; they wake with the hall garrison, print `factory`-tagged robots (never `hall`, so the
  clearHall gate is untouched), and BOTH must be destroyed before F responds — approaching it
  early only gets Gibran's `machinesFirst` refusal.
- Stage 6 chapter 2 is the user's stages(Stage6-Finish).csv, a frozen 50x50 OFFICE at
  x~216000: # wall, A (CSV SA) safe area with no spawns at the start, S (CSV SF) start AND
  finish, @ BROKEN door that never opens, - door (the start/finish pair is sealed), W weapon
  cache, C server bank, H upload point, R restroom, G warehouse, M robot spawn machine,
  1/2/3 event triggers announcing a dead door. SOLID_TOKENS is #@CM, so broken doors,
  servers and machine chassis are permanently solid, and every remaining cell is still
  reachable from S. Dressing uses the same futuristic* office rig as Stages 1-3.
  Phases: office -> upload -> purge -> escape -> complete. The garrison is frozen until the
  player leaves the safe area; standing on H runs the upload that always stops at the
  config-driven 92% and reveals IKN; that cutscene HANDS CONTROL BACK, lockdown drops a wave
  across the whole floor INCLUDING the safe area; the finish opens only once both machines
  are destroyed AND the floor is clear, and stepping back on SF ends the stage through the
  shared transition. Four 2026-08-09 user-requested rules: (1) the two M fabricators DO NOT
  EXIST before the upload — no chassis, no collider, no HP; beginLockdown calls deployMachine
  and only then are they solid and printing; (2) NO robot ever spawns in the server room
  (HQ_SERVER_ROOM, cols 30-48 rows 1-12), before or after — the encounter tables are clean and
  points() filters the room again at spawn time, though chasing robots may follow the player
  in; (3) the one door into that room (server-access) starts LOCKED and is released only by
  the SIGNAL TRACE terminal in the middle meeting room (HQ_HACK, hackRange), with a re-arming
  warning line at the locked door and an alarm squad on a failed trace; (4) after the upload
  the main door refuses until both fabricators are wrecked, answering with `machinesFirst`
  once per approach. No boss/miniboss/tank/boss HUD/score/music anywhere in Stage 6.
- Spawn machines are shared animated hero props, never generic boxes (2026-08-08):
  `entities/spawnMachine.js` owns the chamber/iris/turbine/gantry rig used by Stages 3, 5, 6
  (both chapters) and 7. Animate it only through `resetSpawnMachine`/`updateSpawnMachine`;
  keep the hatch facing local +Z, parent transform/collider fixed, PAL-only materials and zero
  PointLights. Their HP is ONE shared config number, `campaign.spawnMachine.hp`, read only
  through `spawnMachineHp()` (2026-08-09 user request) — the per-stage machineHp /
  spawnMachine(s).hp keys are deleted, so never reintroduce one.
- Both Stage 6 chapters carry a traversability assert that BFS-walks the map at the player's
  clearance through solid props. Any furniture edit that seals a doorway fails it.
- Stage 7 is one static, straight 1.5 km Prof. Dr. Mochtar Kusumaatmadja/Pasupati flyover at
  x≈240000, traversed east to west. `CFG.campaign.stage7.flyover` defines four 3 m lanes on each
  carriageway, a 1 m median and a 1 m shoulder outside each carriageway, making the deck exactly
  27 m wide. Each shoulder has a solid edge line before the outer barrier. The median surface has no
  longitudinal collider: player and robots can cross anywhere, while lamp and pylon bases retain
  only local blockers. The deck top stays at y=0 through meter 1200, then descends 12 m over
  200 m and runs the final 100 m at lower-road level; Pasteur's toll plaza, factories and finish
  vehicle are therefore physically below the elevated Pasupati span. Player, robots, vehicles,
  drops, mortar markers, lamps and blockers all read the same road-height profile. The city/cross
  roads remain 12 m below the upper deck, with piers that shorten along the descent and stop at
  ground level. Both sides gain a two-lane (2×3 m) feeder every 300 m; all eight ramps travel
  parallel to the flyover, rise from the lower side road over 180 m, then taper for 80 m as a fifth
  lane merging into the outermost carriageway lane. They are never perpendicular/T-shaped.
  Concrete hazard barricades outside the deck and main-deck-only walkability keep both character
  types off them while every deck-side merge approach remains reachable.
- Stage 7 is permanently night. Dual-arm street lamps branch over both carriageways from the
  median every 50 m, with exactly 14 fixed registered PointLights and emissive-only heads on the
  remaining poles. At meter 700, the 26 m tapered/split concrete-red pylon carries a compact official
  name plaque and exactly 10 large cylindrical white stays, split five ahead and five behind; every
  deck anchor remains on the median centerline, never at a carriageway edge. Its base is solid but
  both sides remain traversable. The camera eases
  up/out within 110 m without changing aim, movement, collision or the logic pivot.
  Deterministic defaults place sixteen seven-car gate bands plus 48 scattered cars (160 total), 12
  jagged broken-asphalt holes, and 250 initial robots. Cars are oriented solid/nav/bullet blockers;
  holes are real cuts with depressed floors, exposed aggregate lips, surface rubble and cracks, reject
  player/robot clearance, and remain bullet-transparent. The road skin is split at crater midpoints
  so each welded ShapeGeometry carries at most one reliable cut, and no car may overlap a crater.
  Clearance smoke proves a median-crossing
  detour reaches Pasteur and the landmark cannot seal the level.
- Stage 7 runs `opening→flyover→tollApproach→factorySiege→vehicleReveal→outro→complete`.
  Five encounter groups distribute robots along the crossing. An idle Stage 7 robot activates on the
  first frame its body enters the gameplay-camera frustum through `campaignRobotAI`'s optional
  `activate(z,d)` hook; it does not use the global proximity radius. Only from meter 500 through
  meter 1300, a fixed two-shell mortar pool fires every 6 s, tracks until the final 0.5 s, then locks
  its impact marker; each blast uses tank-mortar radius and deals 30 player / 150 enemy-robot damage,
  ignoring local cover for robot AoE. Each finish factory prints exactly three robots every five
  seconds, with its first batch obeying the same five-second cadence. The
  Pasteur toll entrance keeps
  exactly three solid shared spawn-machine rigs as the mandatory finish combat; the last destroyed
  chassis collapses the network and reveals the GRD LTV-45 on the left/south side of the road, never
  in the median. Defaults place eight supplies, 30
  crates and 60 barrels; Stage 7's three-value `clampDropPos` result carries road elevation so
  supplies, crate contents and robot loot remain above the slope/lower plaza. Fixed
  96/24/20/12 rain/ripple/spark/exhaust pools remain allocation-stable.
  There is no boss/miniboss/tank/boss HUD/score/music, and the green complete screen opens Field
  Shop before Stage 8.
- Stage 8 is the coordinate-stable GRD LTV-45 gunner arena at x≈270000. Seven lateral
  corridors span both three-lane carriageways and the traversable median; `A/D` are
  edge-triggered lane snaps while walking/RMB/dodge/melee are scene-gated off. The
  opening announces 100 km, but there is no runtime distance counter. Timed pickup
  carriers each mount exactly three ordinary A/B robots and keep spawning until the
  config-driven target of 20 carriers is destroyed. Only then does the standalone
  `combatGunship.js` boss (tuning in `CFG.campaign.bosses.gunship` since 2026-08-09 — a boss belongs beside `giant`/`tank`, and it has its own `hp`/`score` there instead of live-reading tank HP; only its scene pacing stays in `stage8`) arrive and cycle telegraphed
  MG/cannon/three homing missiles. Its shape was totally reworked 2026-08-08 (user request):
  faceted hull, gimballed chin turret with a four-barrel gatling, anhedral stub wings with
  missile pods, twin nacelles, a SHROUDED five-blade rotor and a twin-boom tail with a
  fenestron; the nose faces -X so the boss looks at the player. The static hull is welded
  with `mergeObjectInPlace`, so the richer rig costs FEWER draw calls than the old one —
  `MESH_CAP.CombatGunship` is 95 for the same reason Helicopter is 70 (single hero asset).
  Every added animation (banking, turret/sensor tracking, gatling spin-up, exhaust breathing,
  warn strips igniting past `enrageHpFrac`) is visual only; no gameplay number changed, and
  the boss still adds zero PointLights. Road scenery wraps from fixed pools, Kertajati is a
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
