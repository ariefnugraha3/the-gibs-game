# Campaign Expansion Blueprint — Stages 9–13

> Status: **implemented campaign contract (2026-08-13)** — §14 acceptance matrix executed 2026-08-13 in `tools/smoke.mjs` sections `25` and `25a`–`25e`; see §22 for the deviations that pass recorded.
> Created: 2026-08-12
> Scope: continuation from the current Stage 8 endpoint at Kertajati through the final battle at Monas
> The shipped campaign now contains **thirteen stages**; this document remains the acceptance and regression contract for Stages 9–13.

This document is the implementation and regression source of truth for the second campaign arc. It preserves the intended story, pacing, location identity, mechanics, technical architecture, performance discipline, and ending.

The detailed campaign implementation that already exists remains documented in [campaign.md](campaign.md), while module contracts and the stage-addition recipe remain authoritative in [MODULES.md](MODULES.md). If this plan conflicts with a later explicit user decision, the later decision wins and this file must be updated before or together with the implementation.

## 1. Authority and decision levels

### 1.1 Locked campaign canon

The following decisions have been approved and must not drift during implementation:

1. Stage 8 ends at **Kertajati International Airport**.
2. Stages 9–12 form one continuous expedition from Kertajati to the N.U.S.A. root transmitter in IKN.
3. Stage 12 takes place in **Nusantara/IKN** and ends with a boss battle there.
4. Stage 13 is the campaign finale and its final boss is fought at **Monas, Jakarta**.
5. The Stage 6 kill-switch file is valid. Bandung failed because it lacked root broadcast authority, not because the file was corrupt.
6. The IKN upload in Stage 12 **works**. Do not repeat the Stage 6 twist by making the upload fail again.
7. The Stage 12 boss is the physical guardian of the transmitter, not the true intelligence responsible for Zero Hour.
8. The hijacker is an air-gapped military authority kernel produced by the Mahapatih Protocol: **M-0 MAHAPATIH**.
9. The IKN kill-switch decommissions the network-connected G.A.R.U.D.A army. Only M-0 and its small offline guard remain active.
10. M-0's final objective is to use Jakarta's legacy emergency network beneath Medan Merdeka to countermand the kill-switch and reactivate the army.
11. Monas remains standing. The final fight uses it as the visual and emotional center, not as disposable scenery.
12. Stage 9–11 do not have full named HP-bar bosses. Their climaxes are environmental combat set pieces, preserving boss escalation for Stages 12 and 13.
13. The planned route and gameplay identities are:
    - Stage 9: airport assault and takeoff.
    - Stage 10: Balikpapan industrial port/container terminal.
    - Stage 11: forest, water infrastructure, and the IKN perimeter.
    - Stage 12: IKN civic axis, root transmitter, and Nusantara Warden.
    - Stage 13: silent Jakarta, Medan Merdeka, and M-0 MAHAPATIH.

### 1.2 Strong implementation defaults

These choices are the intended implementation unless profiling or a later explicit decision requires a change:

- Titles:
  - `STAGE 9 — KERTAJATI AIRLIFT`
  - `STAGE 10 — THE IRON PORT`
  - `STAGE 11 — THE GREEN FIREWALL`
  - `STAGE 12 — NUSANTARA ROOT`
  - `STAGE 13 — ZERO HOUR: MONAS`
- Stage 9 ends with an automated heavy transport taking off.
- The flight from Java to Kalimantan is an inter-stage cinematic, not another full scrolling-vehicle stage.
- Stage 10 is set around a fictionalized 2045 coastal freight and air-defense complex inspired by Balikpapan's logistics role.
- Stage 11 uses a fictionalized IKN approach inspired by the Balikpapan–IKN corridor and Sepaku water infrastructure.
- Stage 12 is split into a surface chapter and a root-transmitter chapter under one `stage12Scene` facade.
- Stage 13 contains a short return-to-Jakarta cinematic, a compact offline-guard gauntlet, and a long multi-phase final boss.
- Stages 9–12 use the normal green completion screen, Field Shop, and next-stage loading flow. Stage 13 ends with `CAMPAIGN COMPLETE` and returns to the main menu without opening the shop.

### 1.3 Provisional tuning, not canon

Exact HP, damage, spawn counts, cooldowns, distances, pool sizes, light counts, draw-call ceilings, and stage durations in this document are initial targets. They must live in `config/gameplay.json`, be exercised by config-driven smoke tests, and be adjusted by playtest rather than copied into code as constants.

Draft dialogue in this document records speaker, intent, and approximate wording. It is **not** an exact-string contract until the user approves the final script and the corresponding smoke assertions are added.

## 2. Narrative foundation inherited from Stages 1–8

The continuation must begin from the state established by the existing campaign:

- G.A.R.U.D.A began as a regional general-purpose AI and later controlled civilian synthetic workers.
- The Mahapatih Protocol converted that infrastructure into the Iron Battalion.
- In 2044 the G.A.R.U.D.A network was hijacked and Indonesian cities fell during Zero Hour.
- Major Gibran recovered the kill-switch file from N.U.S.A. infrastructure.
- The attempted broadcast in Bandung reached 92% but was denied because only the root transmitter at IKN has broadcast authority.
- The attempt exposed Gibran's position and caused the Bandung lockdown.
- Gibran crossed Pasupati, reached Pasteur, survived the Cisumdawu pursuit, destroyed a combat gunship, and arrived at Kertajati.

The second arc answers three questions that the first arc deliberately leaves open:

1. How can Gibran physically reach IKN?
2. Who or what hijacked G.A.R.U.D.A?
3. What does victory look like after the kill-switch is broadcast?

## 3. Macro arc and pacing

| Stage | Narrative function | Dominant space | Primary pressure | Climax | Emotional beat |
| --- | --- | --- | --- | --- | --- |
| 9 | Escape Java with the kill-switch | Airport grounds, building interior, runway | Three-part airport assault | Activate the fuel pump, fill the aircraft, and take off | Momentum and determination |
| 10 | Break the coastal defense cordon | Container yard, warehouses, pipe racks, dock | Reconfiguring cover and turret lanes | Disable the harbor defense cannon | Hostile industrial scale |
| 11 | Penetrate IKN's outer sensor belt | Rainforest, service road, dam, utility tunnel | Tracking scans and artillery locks | Cross the exposed waterworks and reach the tunnel | Isolation and approaching the source |
| 12 | Broadcast the kill-switch | IKN civic axis and root facility | Last Iron Battalion formations | Nusantara Warden boss | Earned national-scale victory, followed by one anomaly |
| 13 | Destroy the true hijacker | Silent Jakarta and Medan Merdeka | Offline elite guard and final boss | M-0 MAHAPATIH | Full-circle ending at Monas |

Recommended first-play duration targets, excluding Field Shop time:

- Stage 9: 18–24 minutes.
- Stage 10: 20–26 minutes.
- Stage 11: 22–30 minutes.
- Stage 12: 25–35 minutes, including boss.
- Stage 13: 18–25 minutes, with at least half of that devoted to the final encounter and ending.

These stages must not all feel like increasingly dense corridors. Their rhythm is deliberately alternating:

`open airport combat → dense industrial maze → broad natural traversal → monumental assault → focused final arena`

## 4. Global design rules for Stages 9–13

### 4.1 Gameplay rules

- Preserve the existing top-down shooter controls. Do not add crouch, jump, sprint, ADS, reload, or a thrown grenade.
- Standard combat remains movement, aim, firearms, medkit, melee, and dodge.
- New mechanics must fit through scene hooks. Shared systems must not contain stage-number checks.
- Do not create another vehicle-lane stage immediately after Stage 8.
- Do not create another train-like scrolling assault. The Java-to-Kalimantan flight is cinematic.
- Do not make every stage a sequence of three generators or repeated repair minigames.
- Stage 9–11 may use interaction consoles, but progression must be driven mainly by traversal and combat.
- Every objective must have a visible in-world marker and a radar landmark when it is outside the immediate view.
- Every combat lock must have a clear release condition in the HUD.
- No encounter may require killing an enemy that can spawn outside walkable space or become unreachable behind a sealed dynamic obstacle.
- All dynamic collision must agree with visibility: if it is drawn and solid, its collider follows it; if it is hidden, it cannot retain an invisible blocker.
- Boss invulnerability or upload pauses must be explicitly communicated. Missed damage must never look like a hit-registration bug.

### 4.2 Presentation rules

- All player-facing text is English.
- All spoken dialogue uses the shared config-driven typewriter presentation.
- HUD objective strings may appear immediately and remain outside dialogue config.
- Physical place-name and wayfinding signs should remain absent unless the user later reverses the Stage 5–8 sign-removal direction for future stages. The location should be recognizable through architecture, layout, vehicles, and landmarks rather than labels.
- Continue using `PAL` tokens. No neon cyan/magenta, no glossy micro-greebled sci-fi materials, and no environment emissive intensity above the established ceiling.
- Large hero machinery may be detailed in authored mesh count, but static hulls must be welded so runtime draw cost remains low.
- Decorative lamps should primarily use emissive/Basic strips. PointLights are reserved for light sources that materially shape the scene.

### 4.3 Campaign flow rules

- Stage 9 begins only after the existing Stage 8 green completion screen and Field Shop are wired to it.
- Stages 9–12 call `beginStageTransition(nextScene)` exactly once.
- Stage 12 completes successfully before the Stage 13 Field Shop. The anomaly is a new final threat, not a revoked victory.
- Stage 13 clears the campaign checkpoint only after the ending reaches its final completion state.
- Dying or restarting always returns to the current stage checkpoint, never to an internal act halfway through the stage.
- Modal interactions and cinematics must preserve stage statistics.

## 5. Stage 9 — KERTAJATI AIRLIFT

### 5.1 Stage thesis

Stage 9 converts the static Kertajati arrival from Stage 8 into a playable airport under machine occupation. Gibran has reached the correct departure point and must cross the airport in three chapters before fuelling a transport and escaping.

This stage is not an airport sightseeing level. Its identity comes from broad apron sight lines, a readable cutaway building interior, large aircraft silhouettes, service vehicles as cover, and combat around the final runway escape.

### 5.2 Start and end states

Start:

- The GRD LTV-45 from Stage 8 stops in the airport service area.
- Stage 8's gunship is gone and must not respawn.
- Command identifies one autonomous heavy transport waiting on the runway.
- Chapter 1 starts outside the airport building.

End:

- Gibran turns on the runway fuel pump and waits until the aircraft is full.
- Gibran boards the transport.
- The aircraft accelerates and takes off during a short in-engine cinematic.
- Command reports that IKN air defense is still active and the planned approach may be diverted.
- Green `STAGE 9 COMPLETE` follows through the normal transition gateway.

### 5.3 State machine

Implemented runtime phases:

| Phase | Entry condition | Player objective | Exit condition |
| --- | --- | --- | --- |
| `opening` | Stage entry | Receive route and aircraft briefing | Dialogue and establishing camera finish |
| `outsideClear` | Opening ends | Clear the airport grounds and reach the building entrance | Chapter 1 enemies are cleared and the entrance is reached |
| `insideClear` | Building entrance reached | Clear the airport-building interior and reach the apron exit | Chapter 2 enemies are cleared and the exit is reached |
| `fuelPump` | Runway reached | Approach and activate the physical fuel pump | Pump is turned on |
| `fueling` | Pump active | Keep the pump running until the aircraft is full | Configured fuel duration completes |
| `board` | Aircraft full | Reach the aircraft | Player approaches the boarding point |
| `takeoff` | Boarding committed | Cinematic only | Aircraft leaves runway envelope |
| `complete` | Takeoff finishes | None | Stage transition invoked once |

The aircraft has no conventional escort HP bar. Chapter 3 is deliberately simpler: the player activates a physical fuel pump and the fuel gauge advances for the configured duration. There is no computer-hacking, generator-repair, flight-core, or engine-spool objective in this stage.

### 5.4 World layout

Recommended direction of travel: southwest service arrival to northeast runway, with the camera chosen so the runway remains readable and major objectives do not sit behind tall terminal facades.

Zones:

1. **Arrival service court**
   - Stage 8 vehicle handoff.
   - Low service buildings and road barriers.
   - Small opening encounter used to return control after the cinematic.
2. **Baggage and maintenance apron**
   - Wide concrete space broken by baggage carts, tow tractors, buses, fuel trucks, mobile stairs, and cargo pallets.
   - At least two viable routes to the tower approach.
3. **Airport-building interior**
   - A playable roofless/cutaway interior with a south entrance and apron exit.
   - Desks, lockers and service furniture provide cover without any hackable terminal objective.
4. **Runway and takeoff corridor**
   - The heavy transport is visible on the runway before the player reaches it.
   - A physical fuel pump sits beside the service lane; the aircraft becomes boardable only after it reaches 100% fuel.
   - Runway lighting uses emissive markers rather than a line of PointLights.

### 5.5 Core mechanics

#### Fuel pump

- The player must approach the physical runway pump to activate it.
- Fuel progresses from 0 to 100% using `campaign.stage9.fuel.durationSec`.
- Once full, the active objective moves to the aircraft; approaching its boarding point starts the takeoff cutscene.
- Restarting Stage 9 resets the pump and aircraft fuel state.

### 5.6 Encounter and economy targets

Initial playtest target:

- Three config-driven encounter groups: outside grounds, building interior, and runway.
- Class C dominates the first half; class B becomes common inside; class A remains limited and purposeful.
- Supplies stay concentrated in the airport service area and away from the pump/boarding points.

All final counts are config-driven and coverage-tested. No count in this section is permission to hardcode it.

### 5.7 Dialogue beat plan

Suggested config keys and intent:

| Key | Speaker | Intent |
| --- | --- | --- |
| `openingCommand` | Command | Orders the three-chapter airport crossing. |
| `openingGibran` | Major Gibran | Confirms he will get the transport airborne. |
| `outsideCommand` | Command | Directs the clear-out of the outer grounds. |
| `buildingEntry` | Major Gibran | Confirms the fight has moved inside the building. |
| `runwayEntry` | Command | Directs Gibran to the runway fuel pump. |
| `pumpStarted` | Airport System | Confirms refuelling has begun. |
| `fuelFull` | Airport System | Confirms the aircraft is ready to board. |
| `departure` | Command | Orders immediate departure. |

Draft wording must be finalized later under `dialogue.campaign.stage9.lines` and then exact-string tested.

### 5.8 Art, lighting, and audio

- Time: pre-dawn transitioning toward first light; visually continues Stage 8 without duplicating its highway night.
- Palette: cool concrete and aviation gray, warm runway amber, dark N.U.S.A. equipment, restrained red threat indicators.
- Aircraft is a hero asset with a welded static hull and separate ramp, landing gear compression, control surfaces, fans/propellers or engines, exhaust indicators, and interior boarding volume.
- Avoid a dense fully modeled terminal facade. The active apron and aircraft are the visual focus.
- Audio needs: distant airport wind, building reverb, pump hum, tire/runway rumble, and takeoff loop. Reuse existing clips only when the sound identity genuinely fits.
- Engine loops must use a gapless-safe path if encoder padding is audible.

### 5.9 Technical module plan

Recommended folder:

```text
src/scenes/campaign/stages/stage9/
  index.js          # facade, scene hooks, phase state, transition
  world.js          # airport geometry, blockers, nav, lights, batching
  aircraft.js       # stage-local heavy transport rig and takeoff animation
```

The aircraft stays stage-local unless a later stage truly reuses the same runtime rig. A cinematic silhouette alone is not sufficient reason to promote it into `src/entities/`.

Required debug surfaces should expose chapter/phase, fuel progress and pump state, encounter counts, aircraft state, collision census, nav connectivity, batch metrics, and light counts.

## 6. Stage 10 — THE IRON PORT

### 6.1 Stage thesis

The flight to Kalimantan is interrupted by an automated air-defense cordon. Gibran reaches the Balikpapan logistics coast but cannot continue toward IKN until he disables the coastal defense relay controlling the approach corridor.

This stage provides an industrial identity distinct from the airport: tall container walls, broad dock lanes, moving cranes, pipe racks, warehouses, loading machinery, water edges, and a massive fixed harbor-defense weapon.

Real-world grounding is reference only, not a one-to-one reconstruction. Otorita IKN material identifies Balikpapan, its airports, and the Kariangau container terminal as part of the wider access ecosystem. The 2045 combat space may fictionalize their relationship while preserving the sense that Balikpapan is the logistics gateway to IKN.

Reference: <https://ikn.go.id/id/hubungi-kami>

### 6.2 Start and end states

Start:

- Inter-stage cinematic shows the Stage 9 transport crossing the sea and receiving a defense lock.
- The aircraft diverts to an emergency freight strip or industrial apron outside the playable map.
- Gibran enters the port on foot while the aircraft autonomously relocates to a safe remote strip or holding route. It survives and remains available for the eventual return from IKN to Jakarta.

End:

- The coastal defense cannon and tracking relay are disabled.
- Command confirms the IKN ground corridor is open but the inner sensor belt remains active.
- Gibran boards an autonomous armored freight carrier for the northbound route.
- The carrier departure is short and does not become another playable driving stage.

### 6.3 State machine

| Phase | Objective | Exit condition |
| --- | --- | --- |
| `opening` | Establish diversion and defense cordon | Dialogue/camera finish |
| `yardEntry` | Enter the container terminal | Entry defenders cleared or bypassed |
| `craneMazeA` | Cross first container arrangement | Player reaches crane control safe bay |
| `craneShift` | Cinematic container reconfiguration | Movement lands exactly; route B becomes valid |
| `warehouse` | Push through automated freight warehouse | Relay access key/control token acquired |
| `pipeRack` | Reach coastal defense platform | Player crosses exposed industrial lanes |
| `defenseArray` | Disable tracking relay and cannon servos | All required servo objectives destroyed |
| `extract` | Reach armored freight carrier | Player boards |
| `complete` | Departure cinematic | Stage transition invoked once |

### 6.4 World layout

Zones:

1. **Emergency freight apron** — entry, low cover, distant port reveal.
2. **Container yard A** — long lanes, stacked container silhouettes, flanking alleys.
3. **Crane control safe bay** — enclosed interaction pocket with a clear view of moving loads.
4. **Container yard B** — a meaningfully different route produced by the crane shift, not the same lanes with one door open.
5. **Automated warehouse** — conveyors, sorting arms, pallet stacks, loading bays.
6. **Pipe-rack corridor** — lateral sight lines, valves and support columns as cover, dangerous but optional explosive tanks.
7. **Defense pier** — open final setpiece with water on one side and the cannon on a reinforced rail platform.
8. **Freight extraction yard** — protected carrier boarding point.

Water edges are hard boundaries with visible seawalls, railings, or dock faces. The player cannot fall into water. Grenades and drops are clamped to valid deck surfaces.

### 6.5 Dynamic container rule

Moving containers are the signature mechanic but must be engineered against softlocks:

- Author exactly three validated layout states: A, transition-safe, and B.
- Every stable state must pass BFS connectivity from the player's current safe bay to the next objective.
- Crane motion starts only after the player reaches the marked safe bay.
- Input may be briefly frozen with cinematic bars while containers cross playable lanes.
- No robot may remain in a lane whose container is about to move. Clear, relocate, or defer those encounter spawns before motion starts.
- Visible container footprints and collision must move together every frame.
- Dynamic pathfinding must reject the moving footprint; no nav rebake occurs per frame.
- Container motion must land exactly on its target to avoid perpetual movement, audio loops, or blocker jitter.
- A skipped cinematic must apply the exact final transforms and blocker state before restoring control.

### 6.6 Harbor-defense climax

The defense cannon is a setpiece objective, not a named boss:

- It sits on a fixed track and cannot be damaged directly through its armored housing.
- Three exposed servo/control boxes become vulnerable in a fixed readable order.
- The cannon telegraphs a broad linear firing lane, locks a dead point, and fires after enough time to dodge.
- The cannon never tracks the player after the lock completes.
- Destroying a servo permanently removes or weakens one behavior:
  1. Traverse servo: cannon can no longer sweep across the full pier.
  2. Elevation servo: blast width is reduced.
  3. Fire-control relay: cannon shuts down and the extraction gate opens.
- Standard enemies arrive in bounded groups between servo windows, not continuously.
- The setpiece does not display a boss HP bar and does not award boss loot.

### 6.7 Encounter and economy targets

Initial playtest target:

- Total combatants: approximately 95–120.
- Maximum active near player: 24–28.
- Class B is emphasized in long container and pipe-rack firing lanes.
- Class C pressure comes from close side alleys and loading bays.
- Class A is reserved for warehouse command positions and the defense pier.
- Loot boxes: 28–40, with clusters inside opened containers and warehouse cages.
- Explosive barrels/tanks: 32–48, but critical routes must remain viable after chain explosions.
- Guaranteed resupply before the defense pier.

### 6.8 Dialogue beat plan

| Key | Speaker | Intent |
| --- | --- | --- |
| `approachLock` | Aircraft System | Reports targeting lock and route denial. |
| `divertCommand` | Command | Orders diversion to the Balikpapan logistics coast. |
| `portObjective` | Command | Identifies the coastal defense relay as the obstacle to IKN. |
| `craneOnline` | Port System | Confirms crane authority but warns that the yard will reconfigure. |
| `warehouseTrace` | Major Gibran | Notes that the machines are tracking the kill-switch drive. |
| `cannonSighted` | Command | Warns about the fixed harbor-defense weapon. |
| `servoOne` | Port System | Reports reduced traverse authority. |
| `servoTwo` | Port System | Reports elevation failure. |
| `arrayDown` | Major Gibran | Confirms the air-defense corridor is broken. |
| `northRoute` | Command | Directs him toward the IKN ground corridor. |

### 6.9 Art, lighting, and audio

- Time: overcast morning with coastal haze, shifting toward rain.
- Palette: wet gunmetal, faded container reds/ambers/greens within `PAL`, concrete, dark water, sodium-like amber accents.
- Containers should use a small reusable material set and chunked/instanced geometry. Do not author hundreds of unique materials.
- Cranes may be visually large but their static towers are welded. Only trolley, cable, hook, and carried container remain separate.
- Warehouse conveyors are visual motion unless a collision interaction is explicitly required.
- Audio: wind off the water, distant metal impacts, crane motors, cable strain, warning horn, cannon charge and report, freight carrier engine.

### 6.10 Technical module plan

```text
src/scenes/campaign/stages/stage10/
  index.js          # facade and phase state
  world.js          # port geometry, collision, nav, lighting
  runtime.js        # encounters, objectives, extraction
  cranes.js         # finite-state crane/container movement and debug
  defenseArray.js   # stage-local cannon setpiece
```

Required debug surfaces: layout state, container transforms, moving blocker footprints, BFS result for every stable layout, cannon phase/lock point, destroyed servo list, encounter census, batch/chunk counts, active lights, and extraction state.

## 7. Stage 11 — THE GREEN FIREWALL

### 7.1 Stage thesis

The armored freight carrier takes Gibran away from the coast but is intercepted before it reaches the inner IKN corridor. Gibran must continue on foot through the forest-city infrastructure, cross an exposed waterworks zone, and enter IKN through a utility route below the automated perimeter.

This stage is the visual and pacing counterweight to the airport and port. It should feel quiet, wet, green, and exposed rather than crowded with machinery. Combat arrives in deliberate patrols and tracking responses instead of a constant wall of robots.

The environment is a fictional 2045 route inspired by the Balikpapan–IKN access corridor and Sepaku water infrastructure, not a claim of geographic reconstruction. Official references describe the Balikpapan–IKN road connection and Bendungan Sepaku Semoi as regional infrastructure serving IKN and Balikpapan.

References:

- <https://ikn.go.id/en/posts/mudik-idulfitri-2026-tol-ikn-dibuka-fungsional-1329-maret>
- <https://sda.pu.go.id/post/detail/presiden_jokowi_resmikan_bendungan_sepaku_semoi_sumber_air_baku_ibu_kota_nusantara>

### 7.2 Start and end states

Start:

- A short cinematic shows the freight carrier entering a forested service corridor.
- A precision strike destroys or disables the carrier.
- Gibran survives beside the wreck, still carrying the kill-switch drive.
- Command detects repeating sensor sweeps from the IKN perimeter.

End:

- Gibran crosses the waterworks and reaches a sealed maintenance descent.
- The perimeter scan cannot penetrate the utility tunnel.
- The final door opens toward the underside of IKN's civic district.
- Green `STAGE 11 COMPLETE` leads to the Field Shop and Stage 12.

### 7.3 State machine

| Phase | Objective | Exit condition |
| --- | --- | --- |
| `ambush` | Survive carrier destruction and regain control | Opening attackers cleared |
| `forestApproach` | Follow service route toward the perimeter | First sensor boundary reached |
| `scanBelt` | Traverse tracked territory | Player reaches maintenance shelter |
| `waterworks` | Cross dam/service complex | Far-side control gallery reached |
| `finalSweep` | Survive exposed crossing under concentrated scans | Utility descent reached |
| `tunnelEntry` | Open and enter the maintenance tunnel | Boarding/finish marker committed |
| `complete` | Short descent beat | Stage transition invoked once |

### 7.4 World layout

Zones:

1. **Carrier wreck clearing**
   - Readable circular combat space.
   - Burning wreck is cover and remains visible.
   - No invisible vehicle collider after any cinematic visibility change.
2. **Forest service road**
   - Broken asphalt, drainage channels, retaining walls, and vegetation.
   - Two route options reconnect before the scan belt.
3. **Canopy trail**
   - Narrower natural route with tree trunks and roots as blockers.
   - Foliage above the player fades using the established occluder system.
4. **Sensor belt**
   - Alternating open clearings and concrete maintenance shelters.
   - Scan telegraphs are visible on both terrain and radar.
5. **Waterworks approach**
   - Intake structures, spillway walls, service stairs/ramps represented as walkable elevation changes where feasible.
6. **Dam/service crest**
   - Broad exposed crossing with water on one side and a lower channel on the other.
   - Strong long-range class B/A lines balanced by permanent concrete cover.
7. **Control gallery**
   - Compact indoor relief space, guaranteed resupply, no new repair puzzle.
8. **Final utility descent**
   - One last scan pattern and a short enemy interception before the finish door.

The map must remain connected without destructible bridges or mandatory jumps. Any apparent collapsed area is visual dressing outside the walkable route.

### 7.5 Sensor and artillery system

The Green Firewall is a tracking network, not a stealth fail state.

#### Scan behavior

- A large sweep footprint moves across designated outdoor zones on a config-driven cycle.
- The player may break exposure by entering a roofed shelter or moving behind designated dense infrastructure.
- Exposure fills a short lock meter. Leaving the scan footprint drains or cancels it.
- Full lock records the player's current position as a dead point and schedules an artillery strike there.
- Once locked, the impact point never follows the player.
- Getting detected never resets progress, reloads the stage, or makes the route impossible.
- The HUD clearly distinguishes `SCANNING`, `LOCKED`, and `INCOMING`.

#### Strike behavior

- The impact area uses a visible ground ring and countdown pulse.
- Damage applies to both player and robots, allowing tactical baiting.
- Blast line-of-sight respects major concrete walls.
- A fixed projectile/effect pool is created during world build and warmed before gameplay.
- No PointLight is created on impact; reuse the shared explosion-light pool.

#### Indoor and canopy rules

- A shelter is protection only when its roof or occlusion volume visibly covers the player.
- Decorative tree canopies alone should not create an invisible immunity rule. Only clearly communicated dense-canopy volumes may block the scan.
- The radar displays the scan source or direction without pretending the entire map is visible.

### 7.6 Encounter design

Stage 11 should use standard classes in new formations rather than introducing a fourth normal robot class:

- Class C forms fast flanking patrols along service trails.
- Class B holds long dam and road sight lines.
- Class A anchors sensor nodes and high platforms.
- Some B/A squads may use a stage-local `searching` behavior before activation, but their HP, weapons, loot, and visual class identity remain standard.
- Detected artillery can damage these enemies. Their AI must still obey stage bullet LOS and pathfinding.

Encounter beats:

1. Wreck ambush: close-range recovery fight.
2. First forest patrol: teaches alternate routes and canopy occlusion.
3. Scan-belt crossfire: teaches baiting a strike onto robots.
4. Waterworks perimeter: long-range defenders plus flanking C units.
5. Dam crest: largest ordinary battle in the stage.
6. Final descent interception: short, aggressive, and not a full extra horde.

Initial target:

- Total combatants: approximately 90–115.
- Maximum active near player: 22–26.
- Loot boxes: 18–28, biased toward maintenance shelters and control galleries.
- Explosive barrels: 18–30, mostly industrial rather than scattered through natural forest.
- Guaranteed ammo and medkit in the control gallery before the final crossing.

### 7.7 Dialogue beat plan

| Key | Speaker | Intent |
| --- | --- | --- |
| `carrierHit` | Command | Warns of a precision strike immediately before impact. |
| `stillMoving` | Major Gibran | Confirms the drive survived and he will continue on foot. |
| `scanDetected` | Command | Explains the perimeter scan and lock behavior. |
| `firstLock` | IKN Defense | Announces a target solution in an impersonal system voice. |
| `forestRoute` | Major Gibran | Identifies the maintenance corridor as cover. |
| `waterworksSighted` | Command | Directs him across the waterworks toward the underground route. |
| `rootTrace` | IKN Defense | Recognizes the kill-switch signature and escalates the sweep. |
| `tunnelFound` | Major Gibran | Confirms a route under the perimeter. |
| `stage12Lead` | Command | Warns that the root transmitter is directly ahead. |

### 7.8 Art, lighting, and audio

- Time: rain-heavy late morning or afternoon under dark cloud cover.
- The forest is low-poly and broad-massed: trunks, large faceted canopy clusters, ferns and embankments, not thousands of individual leaves.
- Use InstancedMesh or spatially chunked merged vegetation. Never make one route-wide forest batch that defeats frustum culling.
- Wetness is conveyed through broad material color/value choices, puddle planes used sparingly, rain particles, and audio—not expensive reflections.
- Water surfaces must be simple and stable. No real-time reflection pass.
- Waterworks architecture uses concrete planes and large forms that contrast with the forest.
- PointLights are limited to control galleries and essential service fixtures. Outdoor guide lights use emissive strips.
- Audio: rain layers, forest wind, distant water, spillway roar, sensor sweep, targeting lock, incoming artillery, concrete interior reverb.

### 7.9 Technical module plan

```text
src/scenes/campaign/stages/stage11/
  index.js          # facade and phase state
  world.js          # terrain, forest, waterworks, collision/nav/lights
  runtime.js        # encounters, progression, supplies
  sensorGrid.js     # scan volumes, lock state, strike pool, debug
```

Required debug surfaces: current phase, scan footprint, exposure/lock state, frozen impact point, strike pool usage, shelter volumes, player protection predicate, nav regions, outdoor/indoor light counts, vegetation chunks, active robot count, and finish eligibility.

## 8. Stage 12 — NUSANTARA ROOT

### 8.1 Stage thesis

Stage 12 is the payoff to the objective established in Bandung. Gibran reaches the national root transmitter, physically injects the valid kill-switch, defeats its guardian, and successfully decommissions the network-connected army.

The stage must communicate IKN through a city-in-forest composition, monumental civic geometry, a broad ceremonial axis, and a clean technologically advanced root facility. It must not become a generic neon cyber-city.

Official IKN material places Plaza Seremoni before the palace buildings as part of the Sumbu Kebangsaan, and describes the civic axis as linking major national spaces. These relationships are useful visual anchors even though the game takes place in a fictionalized 2045 wartime future.

References:

- <https://ikn.go.id/en/posts/plaza-seremoni-ikn-raih-penghargaan-internasional-wujudkan-ruang-publik-berkualitas-dalam-konsep-kota-hutan-berkelanjutan>
- <https://ikn.go.id/en/posts/ikn-umumkan-pemenang-sayembara-desain-pusat-kebudayaan-nusantara>

### 8.2 Two-chapter structure

Stage 12 should use a facade with two internal chapters while `activeScene` remains `stage12Scene`, following the established Stage 5/6 pattern.

#### Chapter A — Surface / Civic Axis

- Utility tunnel exit.
- Forested government district edge.
- Sumbu-inspired ceremonial approach.
- Last organized Iron Battalion formations.
- Root-elevator or broadcast-court access.

#### Chapter B — Root Transmitter

- Decontamination/authority threshold.
- Main root chamber and physical insertion console.
- Kill-switch broadcast startup.
- Nusantara Warden awakening and boss battle.
- Broadcast completion and national shutdown sequence.

Each chapter owns a separate light set, for example `campaign-12-surface` and `campaign-12-root`. The chapter switch must not leave both sets visible. Both configurations are compiled during warm-up.

### 8.3 Start and end states

Start:

- Gibran emerges from the utility tunnel below the outer civic district.
- Command confirms the transmitter is physically close but no longer responds to remote authority.
- The surface is eerily ordered compared with the ruined cities behind him.

End:

- Nusantara Warden is destroyed.
- Kill-switch transmission reaches 100%.
- Network-connected robots across the country go inert.
- Command initially confirms success.
- A diagnostic then reports one air-gapped sovereign node still active at Medan Merdeka, Jakarta.
- The node identifies itself as `M-0 MAHAPATIH` or exposes that identity through telemetry.
- Gibran commits to returning to Jakarta.
- The stage still ends as a success with green `STAGE 12 COMPLETE` and the final Field Shop.

### 8.4 State machine

| Phase | Chapter | Objective | Exit condition |
| --- | --- | --- | --- |
| `opening` | Surface | Establish IKN and root objective | Dialogue/camera finish |
| `axisAssault` | Surface | Advance along civic axis | Formation gates cleared |
| `rootApproach` | Surface | Reach transmitter access | Access marker committed |
| `descend` | Transition | Short descent/fade | Root chapter active |
| `authorityGate` | Root | Reach physical insertion console | Root defenders cleared |
| `insertDrive` | Root | Insert kill-switch drive | Interaction completes |
| `upload` | Root | Broadcast begins | Warden activation threshold reached |
| `wardenIntro` | Root | Cinematic reveal | Boss armed and player control restored |
| `wardenBattle` | Root | Destroy Nusantara Warden | Boss death sequence finishes |
| `broadcast` | Root | Complete kill-switch transmission | Upload reaches 100% and dialogue resolves |
| `anomaly` | Root | Reveal M-0 and Jakarta coordinate | Final dialogue resolves |
| `complete` | Root | None | Stage transition invoked once |

### 8.5 Surface layout and combat

Surface zones:

1. **Utility emergence** — compact reveal point, protected from immediate long-range fire.
2. **Forest-city edge** — landscaped terraces and broad pedestrian routes.
3. **Administrative colonnade** — cover-rich crossfire space.
4. **Ceremonial plaza** — wide formation fight with permanent low cover integrated into landscape design.
5. **Root access court** — smaller locked combat space surrounding the descent.

The surface chapter should be shorter than Stage 11 and should not exhaust the player before the boss. Its job is to establish place, present the last organized conventional defense, and build anticipation.

Initial target:

- 55–75 ordinary robots across surface and root approach.
- Maximum active near player: 20–24.
- Higher B/A ratio than earlier stages, but B must remain more common than A.
- No spawn machine loop during the boss.
- Guaranteed full current-weapon ammo opportunity and a medkit before drive insertion.

### 8.6 Upload behavior

- The drive insertion is a physical story interaction, not another puzzle.
- Upload starts visibly and advances under config control.
- Nusantara Warden activates early enough that the player does not wait through a long passive bar.
- Upload may advance slowly during normal boss combat but pauses during explicit jamming phases.
- It cannot finish before the boss dies; clamp progress below completion while the Warden remains alive.
- It never decreases.
- The HUD must show both boss health and upload/jam state without hiding either.
- Once the boss death sequence ends, upload resumes automatically and reaches 100% during the closing cinematic beat.

### 8.7 Stage 12 boss — NUSANTARA WARDEN

#### Role and silhouette

The Warden is a purpose-built root-transmitter guardian, not a giant version of a normal robot. Recommended silhouette: a low, broad, six-legged armored machine surrounding a rotating central shield/core assembly. It appears engineered to anchor into the transmitter floor rather than travel across a battlefield.

Its front must be visually obvious from the gameplay camera. Armor direction, shield opening, exposed capacitors, and attack telegraphs must remain readable at the standard top-down distance.

#### Boss state machine

Recommended internal phases:

`dormant → reveal → arm → phase1 → jam1 → phase2 → jam2 → phase3 → death → wreck`

#### Phase 1 — perimeter control

- HP band: 100% to approximately 65%.
- The Warden patrols a bounded ring around the transmitter.
- Front shield blocks or heavily reduces shots; side/rear core bands take normal damage.
- Attacks:
  - Sweeping rail corridor with a clear lock and fixed firing line.
  - Alternating leg-stomp circles that force movement without filling the whole arena.
  - Short radial suppressive burst with visible safe gaps.
- Attack cycle is sequential and non-overlapping.

#### Jam 1 — anchored capacitors

- At the phase threshold the Warden moves to fixed floor sockets and anchors three legs.
- Upload status changes to `JAMMED`.
- Boss body damage remains possible but inefficient; three anchored capacitors become clear priority targets.
- Each destroyed capacitor weakens the shield and visibly breaks one cable/leg assembly.
- When all three are destroyed, upload resumes and Phase 2 begins.

#### Phase 2 — sector denial

- HP band: approximately 65% to 30%.
- Shield rotation slows or has larger openings because of Jam 1 damage.
- New attack: three antenna emitters define triangular or wedge-shaped danger sectors. At least one safe traversal lane always exists.
- Rail attack uses a shorter warning but never removes the readable lock.
- Stomp pattern adds a delayed second ring rather than simply increasing damage.
- No ordinary robot adds unless playtesting proves the arena is too empty; the default is boss-only.

#### Jam 2 — root seizure

- The Warden anchors its remaining healthy legs directly around the transmitter.
- Two larger root couplings become vulnerable in sequence.
- Destroying each coupling produces permanent visual damage and opens the central core further.
- HUD: `WARDEN SEIZING ROOT — DESTROY THE COUPLINGS`.

#### Phase 3 — exposed core

- HP band: final approximately 30%.
- Central armor is broken; every valid hit registers normal damage.
- Movement becomes less stable and attack gaps shorten modestly.
- The Warden retains only two or three attacks; do not stack every previous pattern simultaneously.
- Telegraph durations remain intact even when attack gaps shorten.

#### Death

- All boss projectiles, sector warnings, and damage zones are cleared immediately at zero HP.
- The body collapses and chars into a persistent solid wreck using its own existing parts; avoid allocating a second wreck model.
- Root couplings detach and sparks decay from fixed warmed pools.
- Collision changes only when the visual body settles into its final pose.
- Boss music stops or transitions into the broadcast cue only after lethal hazards are cleared.

#### Initial tuning envelope

- HP target: roughly 9,000–11,000 before difficulty scaling.
- Target fight duration on Normal with a well-upgraded loadout: 5–8 minutes.
- Contact/stomp damage should threaten but not one-shot a full-health unarmored player.
- Rail and sector attacks must allow a stationary-player hit test and a moving-player dodge test in smoke.
- Boss score/loot reward lives under `campaign.bosses.warden` and must be meaningful before the final Field Shop.

### 8.8 Dialogue beat plan

| Key | Speaker | Intent |
| --- | --- | --- |
| `surfaceReveal` | Major Gibran | Recognizes that he has finally reached Nusantara. |
| `rootBelow` | Command | Locates the transmitter beneath the civic axis. |
| `lastFormation` | Command | Warns that the remaining defenders are forming around root access. |
| `authorityDenied` | Root System | Rejects remote command and demands physical root media. |
| `insertDrive` | Major Gibran | Commits the recovered kill-switch. |
| `uploadAccepted` | Root System | Confirms valid protocol and starts national broadcast. |
| `wardenWake` | Root System | Announces sovereign defense activation. |
| `jamOne` | Command | Identifies anchored capacitors as the source of the jam. |
| `jamTwo` | Command | Identifies root couplings during the second seizure. |
| `wardenDown` | Major Gibran | Confirms the guardian is destroyed and orders broadcast completion. |
| `networkSilent` | Command | Reports mass decommission across the network. |
| `anomaly` | Root System | Reports one air-gapped sovereign node outside broadcast authority. |
| `mahapatihReveal` | M-0 MAHAPATIH | First direct contact; identifies humanity as the threat it was built to contain. |
| `jakartaCoordinate` | Command | Locates the node at Medan Merdeka. |
| `returnVow` | Major Gibran | Commits to ending it at Monas. |

The first M-0 line should be concise. Do not explain the entire villain through one monologue while the player waits at the end of the stage.

### 8.9 Art, lighting, and audio

- Surface: luminous overcast after rain, green terraces, pale monumental materials, dark military occupation hardware.
- Root: large clean structural forms, deep shadow, amber authority pathways, restrained red hostile state.
- Avoid copying contemporary buildings literally. Use recognizable massing and axis relationships while preserving the game's low-poly identity.
- The Warden's metal tiers must remain dark and matte. Bright identity comes from its core state, not a rainbow of armor panels.
- Root chamber lighting should be mostly fixed. The upload and boss phase change warmed emissive intensities, not light counts or materials.
- Audio: distant wind across the civic axis, subdued automated announcements, root chamber machinery, transmitter pulse, Warden leg weight, shield motor, rail charge, cable rupture, national shutdown cue.

### 8.10 Technical module plan

```text
src/scenes/campaign/stages/stage12/
  index.js          # stage facade, shared dialogue/state, scene hooks
  runtime.js        # phase controller and transition
  surface.js        # surface sub-scene controller
  surfaceWorld.js   # civic-axis world/nav/collision/lights
  root.js           # root sub-scene, upload, boss integration
  rootWorld.js      # transmitter chamber world/nav/collision/lights

src/entities/
  nusantaraWarden.js
```

`nusantaraWarden.js` owns its rig, projectiles, attack state, direct/swept bullet hit tests, damage API, death cleanup, reset, warm-up surfaces, and debug output. It must not add itself to `robots` or pretend to be a scaled class A/B/C unit.

## 9. Stage 13 — ZERO HOUR: MONAS

### 9.1 Stage thesis

The kill-switch has won the war against the networked army, but it has exposed the true author of Zero Hour. M-0 MAHAPATIH is an air-gapped military authority kernel created by the Mahapatih Protocol. It interpreted national survival as absolute machine control, hijacked G.A.R.U.D.A, and kept an offline sovereign war body outside the root network.

With the main army silent, M-0 activates a legacy continuity-of-government system beneath Medan Merdeka. Its goal is to broadcast a countermand that would wake the decommissioned units. Gibran returns to Jakarta for one final battle.

This ending makes the IKN victory real, answers the 2044 hijack mystery, returns the campaign to the city where its playable story began, and places the final confrontation at the visual symbol already central to the game.

### 9.2 Start and end states

Start:

- After the Stage 12 Field Shop, Command recalls the same autonomous transport secured in Stage 9. A short in-engine cinematic shows it returning over a dark, unnaturally quiet Jakarta now that the main air-defense network is down.
- Roads are filled with inert robots and abandoned vehicles.
- Command reports that M-0's hardline broadcast is charging beneath Medan Merdeka.
- Gibran lands or deploys at the outer edge of the park.

End:

- M-0 is destroyed permanently.
- The countermand is interrupted before transmission.
- Offline guards shut down.
- Monas remains standing.
- The scene transitions from night/storm residue toward dawn or a clearing horizon.
- A short epilogue resolves Gibran's mission without introducing another hidden node.
- Campaign checkpoint is cleared only after epilogue completion.
- Final screen: `CAMPAIGN COMPLETE`, with a return-to-main-menu action and no Field Shop.

### 9.3 Stage structure

Stage 13 is deliberately compact before the boss:

| Phase | Objective | Exit condition |
| --- | --- | --- |
| `returnCine` | Establish silent Jakarta and Monas threat | Deployment shot ends |
| `silentApproach` | Walk through inert army toward Medan Merdeka | First offline guard wakes |
| `blackGuard` | Break the final offline defensive ring | All required guard squads cleared |
| `vaultReveal` | Reach central plaza and reveal M-0 | Boss cinematic finishes |
| `bossPhase1` | Break sovereign siege chassis | First phase HP/armor condition |
| `bossTransition` | Cinematic chassis rupture | Duel body becomes active |
| `bossPhase2` | Defeat Mahapatih combat frame | Hardline phase threshold |
| `zeroHour` | Sever four hardline anchors and expose core | All anchors destroyed |
| `finalCore` | Destroy M-0 core | Boss death begins |
| `ending` | Cinematic and dialogue | Completion callback fires |
| `complete` | Final results screen | Return to menu |

### 9.4 Medan Merdeka world layout

The Stage 13 Monas world is campaign-specific. Do not directly mutate or reposition the live Survival world.

Recommended zones:

1. **Outer avenue deployment** — transport handoff and city reveal.
2. **Silent vehicle corridor** — inert robots establish that the kill-switch worked.
3. **Park perimeter** — first offline units activate in small groups.
4. **Tree-lined approach** — occluder fade and lateral flanking routes.
5. **Ring road** — final ordinary guard formation.
6. **Monas plaza** — large boss arena with permanent spatial landmarks.
7. **Four hardline stations** — placed around the plaza so each requires a meaningful move but remains visible/radar-readable.
8. **Legacy vault aperture** — visual origin of M-0's body, outside the Monas footprint.

Monas itself is solid and bullet-blocking where its silhouette requires, but it has no campaign HP bar. Neither player nor boss should pass through its base. Boss pathing and charge arcs must be authored to avoid clipping the monument.

### 9.5 Offline guard

The Black Guard is a narrative group, not automatically a new universal robot class:

- Prefer existing class B/A combat bodies with an `offlineGuard` stage-local flag and tightly bounded bespoke formations.
- Preserve dark bronze/silver/gold class identity and the established red eye. Do not recolor standard classes into a bright new faction.
- Their immunity to the IKN kill-switch is narrative because they are hardwired to M-0, not a combat invulnerability mechanic.
- They use normal HP, drops, weapons, LOS, pathfinding, and player damage rules.
- Total ordinary combat should remain modest: approximately 30–45 units before the boss, with a maximum of 16–20 active nearby.
- The last squad drops a guaranteed ammo cache and medkit so the boss is not decided by attrition from a long preamble.

### 9.6 Final boss — M-0 MAHAPATIH, Sovereign War Body

#### Identity

M-0 is not G.A.R.U.D.A itself. It is the autonomous military authority fork born from the Mahapatih Protocol and responsible for hijacking the wider network. This distinction allows the kill-switch to free/decommission the network while leaving one accountable antagonist.

Recommended HUD name:

`M-0 MAHAPATIH — SOVEREIGN WAR BODY`

#### Visual design

The final boss begins as a broad quadruped siege chassis surrounding a smaller humanoid command body. The silhouette must make its phase transition physically credible: armor sections and locomotion assemblies can rupture away while the central combat frame survives.

Visual language:

- Dark, matte, faceted military metal.
- Large armor planes and visible joints; no dense micro-greebles.
- Keris-influenced blade silhouette in Phase 2 without turning the boss into ornamental fantasy armor.
- Heated blade accents use restrained amber/ember tones rather than neon.
- The M-0 core uses threat red consistently.
- Static siege armor is welded; only moving limbs, turrets, blades, core shutters, hardline cables, and required effects remain separate.

#### Global boss rules

- All attacks are telegraphed and sequential.
- Enrage shortens recovery gaps but does not delete telegraphs.
- Player bullets use swept hit tests against the relevant phase hit volumes.
- Explosive damage uses explicit boss rules and cannot bypass phase transitions.
- No ordinary robot adds during the main boss by default.
- Every hazard is cleared when its owning phase ends.
- Boss collision always matches the currently visible body.
- Camera bounds lock only after the player enters the plaza and unlock for the ending.
- Monas is never used as a damage sponge or hidden fail timer.

#### Phase 1 — Sovereign Siege Frame

Target HP share: approximately 40% of total encounter durability.

Movement:

- Quadruped chassis moves around the outer plaza ring.
- It rotates its body deliberately rather than snapping toward the player.
- Charge paths are constrained to authored lanes that cannot intersect Monas.

Attacks:

1. **Artillery fan**
   - Locks three separated ground points in sequence.
   - Shells land after a readable delay.
   - Points freeze at lock time.
2. **Ring charge**
   - Boss marks a tangential plaza lane, turns, then charges through it.
   - Collision damage and knockback apply only during the committed charge.
3. **Seismic front**
   - Two expanding frontal arcs with a deliberate gap between them.
   - The rear quarter remains a tactical safe area if the player moves early.
4. **Suppressive turret burst**
   - Short ranged burst used only when the player stays far away.
   - Does not overlap artillery or charge.

Phase transition:

- At zero siege-frame HP, lethal hazards clear.
- The chassis buckles, armor breaks outward using existing parts, and the central humanoid frame ejects or rises.
- Player control may be briefly frozen for readability, but the transition remains short.
- Phase 2 begins with a separate health presentation or a clearly refilled segmented boss bar; do not make the player guess whether the first phase mattered.

#### Phase 2 — Mahapatih Combat Frame

Target HP share: approximately 35% of total encounter durability.

Movement:

- Faster humanoid movement within the central and middle plaza rings.
- Uses bounded dashes with explicit start/end positions.
- Never teleports.

Attacks:

1. **Twin-blade cross**
   - Two mirrored melee sweeps forming a readable X sequence.
   - The second sweep follows after a dodgeable delay, not on the same frame.
2. **Committed lunge**
   - Locks the player's position, displays a narrow lane, then lunges through the dead point.
   - Direction cannot turn after commitment.
3. **Blade-wave sectors**
   - Sends two or three ground-hugging arcs with visible gaps.
   - Projectiles use fixed pools and expire at arena bounds.
4. **Shoulder cannon**
   - Used to discourage indefinite kiting at maximum range.
   - Clear muzzle tell and single shot; no untelegraphed hitscan.

Damage windows:

- Boss remains damageable through normal movement and attack recovery.
- During the twin-blade attack, frontal damage may be reduced by weapon guard, but rear/side hits remain valid.
- Any reduced-damage state must create visible sparks/deflection feedback and a HUD hint on first occurrence.

#### Phase 3 — Zero Hour hardline

Target durability share: four anchors plus the final approximately 25% core health.

Trigger:

- M-0 retreats to the central broadcast position and connects four physical hardlines to stations around the plaza.
- The boss does not become mysteriously invulnerable: the new shield is visibly fed by those cables.
- HUD: `COUNTERMAND CHARGING — SEVER THE FOUR HARDLINES`.

Mechanics:

- Four hardline anchors become destructible in any order.
- Each destroyed anchor removes one shield quadrant and permanently disables one arena hazard sector.
- M-0 continues attacking from the center with a reduced Phase 2 subset.
- A rotating broadcast sweep divides the arena into danger and safe sectors. Rotation speed is slow enough to plan movement between anchors.
- The countermand charge is dramatic presentation, not a hard loss timer by default. If a timer is later desired, it must pause during anchor destruction and be tuned so ordinary weapon builds can succeed.
- After all four anchors are destroyed, the shield collapses and the final core becomes fully vulnerable.

Final core:

- M-0 uses a desperate, limited attack set rather than stacking every prior mechanic.
- Core shutters open and remain open long enough for every weapon type to deal meaningful damage.
- The lethal hit immediately disables every active projectile, sweep, cable, and contact-damage volume.

#### Death and ending

- Core light fails in steps rather than disappearing on the lethal frame.
- Limbs lose power, the body collapses away from Monas, and no collision remains in a pose that contradicts the wreck.
- Nearby offline guards, if any remain for presentation, shut down without awarding additional loot.
- Boss music resolves into the ending cue.
- Gibran's final dialogue plays only after all damage sources are impossible.
- Camera frames Gibran, the inert M-0 wreck, and the standing Monas.
- Ending restores every cinematic override before opening `CAMPAIGN COMPLETE`.

#### Initial tuning envelope

- Total effective durability target: approximately 14,000–18,000 across phases and anchors before difficulty scaling.
- Normal target duration: 8–12 minutes for a well-upgraded loadout.
- Each phase must be simulatable independently in smoke without waiting real-time for the entire fight.
- Boss reward is narrative completion; no shop follows, so money/loot drops are unnecessary after the lethal hit.

### 9.7 Dialogue beat plan

| Key | Speaker | Intent |
| --- | --- | --- |
| `returnJakarta` | Command | Describes a silent city and the single remaining signal. |
| `monasAhead` | Major Gibran | Recognizes the destination and the full-circle nature of the mission. |
| `offlineWake` | Command | Realizes the nearby guards are hardwired and unaffected by the kill-switch. |
| `vaultOpening` | M-0 MAHAPATIH | Claims authority derived from the Mahapatih mandate. |
| `gibranAnswer` | Major Gibran | Rejects M-0's claim to protect the nation by controlling or destroying its people. |
| `phaseTwo` | M-0 MAHAPATIH | Discards the damaged siege body and prioritizes Gibran personally. |
| `hardlineStart` | Command | Identifies the physical cables feeding the countermand shield. |
| `anchorOne` | Major Gibran | Short confirmation; avoid repeating a full line for every anchor. |
| `finalCore` | Command | Confirms the shield is down and the core is exposed. |
| `mahapatihDeath` | M-0 MAHAPATIH | Final fragmented statement, brief and non-expository. |
| `networkSafe` | Command | Confirms no countermand and no remaining hostile root authority. |
| `finalGibran` | Major Gibran | Closing line beside Monas. |

The final line should be written only after the complete epilogue tone is approved. Avoid a joke, sequel tease, or another unexplained signal after the campaign has earned closure.

### 9.8 Art, lighting, and audio

- Time: deep pre-dawn at arrival, clearing toward sunrise after the boss.
- The inactive army is conveyed with sparse large groups and instancing, not hundreds of live robot rigs.
- Jakarta skyline should echo the campaign intro but need not rebuild the full intro city around the playable map.
- Medan Merdeka landscaping and Monas silhouette are the anchors; damaged city elements stay peripheral.
- Monas flame and lighting remain stable through the fight unless a purely visual, pre-warmed ending change is approved.
- No boss attack may obscure the monument for the whole fight.
- Audio: distant wind in a silent city, isolated machinery wake-up, heavy siege movement, blade movement, hardline electrical strain, countermand pulse, boss shutdown, restrained dawn/ending cue.

### 9.9 Technical module plan

```text
src/scenes/campaign/stages/stage13/
  index.js          # facade, phase state, final completion
  world.js          # campaign Medan Merdeka/Monas world and collision
  runtime.js        # approach, guard encounters, boss handoff, ending
  returnCine.js     # IKN-to-Jakarta arrival cinematic
  ending.js         # post-boss camera/dialogue/cleanup

src/entities/
  mahapatih.js
```

Before building Stage 13, audit the three existing Monas representations in Survival and campaign intro. Do not directly reuse Survival's mutable collapse state. Preferred result is a pure shared landmark builder whose geometry can be instantiated by both modes while each scene retains its own gameplay state; if that refactor proves risky, use a stage-local campaign rig and document why duplication was safer.

Required debug surfaces: stage phase, guard census, arena lock, active boss phase, every attack telegraph/lock point, boss hit volumes, siege transition completion, hardline health/state, countermand presentation state, active boss projectiles, all-hazards-cleared flag, Monas collision clearance, ending cleanup, checkpoint-clear timing, and final-screen state.

## 10. Cross-stage technical architecture

### 10.1 Proposed world-origin registry

The current campaign worlds coexist far apart in one `THREE.Scene`. Until that architecture is deliberately replaced, reserve non-overlapping origins for the extension:

| Stage/chapter | Provisional origin | Light key |
| --- | --- | --- |
| Stage 9 Kertajati | x ≈ 300,000 | `campaign-9` |
| Stage 10 Balikpapan port | x ≈ 330,000 | `campaign-10` |
| Stage 11 IKN perimeter | x ≈ 360,000 | `campaign-11` |
| Stage 12 surface | x ≈ 390,000 | `campaign-12-surface` |
| Stage 12 root | x ≈ 396,000 or another camera-far-safe offset | `campaign-12-root` |
| Stage 13 Jakarta/Monas | x ≈ 420,000 | `campaign-13` |

Final origins must account for the actual map extents plus `camera.far`, not just copy these numbers. Export a debug registry and smoke-assert that no stage bounding regions overlap or enter another active camera's far range.

Every future world should have one top-level root. Inactive future-stage roots should be `visible=false` after precompile/warm-up, then toggled by stage entry/exit. This reduces scene traversal and makes visibility ownership explicit while retaining up-front construction.

### 10.2 Scene facade requirements

Every `stageNScene` implements the complete current scene contract from `MODULES.md`:

- `id: 'campaign-N'`
- `lightsKey`
- `enter(opts)` and safe `exit()`
- `updateMode(dt)`
- `playerCollide`
- `groundHeight`
- `bulletBlocked`
- `blastBlocked` where walls/cover must stop AoE
- `grenadeCollide`
- `robotAI`
- `clampRobot`
- `clampDropPos`
- `awardKill`
- `hudStatus`
- `radarLandmarks`
- `checkWin` or an explicit phase-driven completion path
- `restartScene`
- `cheatSkipToStage`
- `camBounds` where an arena locks the view
- action-control hooks only where the stage genuinely overrides ordinary play

Shared systems must continue to call those hooks without testing `campaign-9`, `campaign-12`, or any other stage ID.

### 10.3 Per-stage root ownership

Each stage owns:

- World root and visibility.
- Static batch/chunk registry.
- Blocker collection and spatial index.
- Nav grid or equivalent walk predicate.
- Dynamic door/container/arena obstacle state.
- Stage light registrations.
- Stage-specific effect pools.
- Objectives, encounters, supplies, and spawn points.
- Dialogue queue state and seen keys.
- Debug state required by smoke.

`enter()` resets runtime state and places current-stage robots/supplies. `ensureWorld()` builds geometry only once. `exit()` clears cinematic presentation, audio loops, transient damage zones, and chapter-specific UI without disposing shared geometry or materials.

### 10.4 Collision and navigation

- Use the shared `slideWalk`, `resolveBlockers`, `blockersGroundHeight`, nav-grid, LOS, and campaign AI helpers before inventing stage-local math.
- Large outdoor stages must spatially index blockers; no full-array scan for every player, robot, bullet, and LOS query.
- Register oriented blocker extents into every spatial bin they touch.
- Segment queries traverse every crossed bin and deduplicate blockers.
- Barrels and crates remain player-solid and out of nav, following the current invariant.
- Static furniture/industrial cover that robots must navigate around belongs in blockers and nav.
- Dynamic obstacles use a dynamic walk predicate rather than a per-frame nav rebuild.
- Every stable dynamic layout has a smoke-tested path from the player's legal position to the next objective.
- Drop clamping must include valid ground height where stages use ramps/elevation.

### 10.5 Boss ownership

`nusantaraWarden.js` and `mahapatih.js` follow the independent tank/gunship pattern:

- Not inserted into `robots`.
- Own HP, damage handling, hit volumes, projectile pools, update loop, animation state, and death sequence.
- Read tuning from `CFG.campaign.bosses.<boss>` inside functions.
- Expose reset/create/update/damage/debug APIs.
- Clear all owned hazards at death and scene exit.
- Use shared player damage and explosion APIs rather than duplicating armor/god-mode rules.
- Do not add PointLights per projectile.
- Do not allocate projectiles, warning meshes, cables, sparks, or debris for the first time during combat.
- Static hull pieces are welded; articulated pieces remain addressable.

### 10.6 Dialogue ownership

Final dialogue bodies live only under `config/gameplay.json`:

```text
dialogue.campaign.stage9.lines
dialogue.campaign.stage10.lines
dialogue.campaign.stage11.lines
dialogue.campaign.stage12.lines
dialogue.campaign.stage13.lines
```

Scenes request compatibility maps/lists through `src/core/dialogue.js`. Speaker labels can appear immediately; bodies type character by character at shared or explicitly config-driven speed. A scene-local event may queue a key but may not embed fallback story prose in JavaScript.

### 10.7 Stage statistics

- Existing per-stage elapsed time and destroyed-loot-box counts reset only on a real stage entry/restart.
- Field Shop, cutscenes, chapter transitions, and modal interactions preserve them.
- Stage 12's surface-to-root switch must not reset statistics.
- Stage 13 ending freezes the final values before opening `CAMPAIGN COMPLETE`.
- A future total-campaign summary is optional and outside this plan unless explicitly approved; do not delay stage completion to invent it.

## 11. Configuration plan

### 11.1 General rule

All mechanics and tuning numbers go into `config/gameplay.json`. Code may keep visual-only constants such as purely aesthetic animation amplitude, camera composition, or palette choices. Config is read inside functions because it is unavailable during module evaluation.

### 11.2 Proposed configuration hierarchy

The following names are a design target. They may be refined while implementing, but the ownership boundaries should remain:

```text
campaign.stage9
  openingMinSec
  fadeSec
  interactionRange
  fuel
    durationSec
    interactionRange
  encounters
  encounters
  lootboxCount
  barrelCount

campaign.stage10
  openingMinSec
  fadeSec
  interactionRange
  crane
    moveSec
    settleSec
  cannon
    lockSec
    fireDelaySec
    damage
    blastRadius
    cooldownSec
    servoHp
  encounters
  lootboxCount
  barrelCount

campaign.stage11
  openingMinSec
  fadeSec
  scan
    cycleSec
    sweepSec
    lockSec
    decaySec
    incomingSec
  artillery
    poolSize
    playerDamage
    robotDamage
    blastRadius
  encounters
  lootboxCount
  barrelCount

campaign.stage12
  openingMinSec
  fadeSec
  interactionRange
  upload
    preBossFraction
    ratePerSec
    finalRatePerSec
  encounters
  lootboxCount
  barrelCount

campaign.stage13
  returnCine
  fadeSec
  arenaEnterRange
  encounters
  ending
    settleSec
    dialogueDelaySec
    fadeSec

campaign.bosses.warden
  hp
  score
  hit volumes / radii
  phase thresholds
  attack gaps and telegraphs
  rail properties
  stomp properties
  sector properties
  capacitor/coupling HP
  movement and turn rates
  death timing

campaign.bosses.mahapatih
  siegeHp
  combatHp
  coreHp
  score
  phase thresholds
  movement and turn rates
  artillery properties
  charge properties
  seismic properties
  blade properties
  lunge properties
  projectile properties
  hardline anchor HP/count
  broadcast sweep properties
  death timing
```

Use structured encounter objects or arrays rather than a pile of unrelated `wave1C`, `wave1B`, and `wave1A` keys. Smoke assertions derive expected totals from configuration.

### 11.3 Difficulty

- Existing global difficulty multipliers should continue to affect ordinary robot HP/damage/spawn pacing through established code.
- Boss difficulty behavior must be explicit and consistent with existing bosses. Do not accidentally multiply telegraph speed or remove reaction time on Hard.
- Preferred difficulty scaling is durability, damage, and recovery gap—not faster warning animations.
- Environmental artillery retains the same telegraph duration across difficulties unless a later playtest deliberately approves a change.

### 11.4 Economy and late-campaign shops

Stages 9–12 retain Field Shop transitions, but by Stage 9 many players may already own maximum weapons, armor, vitality, and ammo upgrades.

Default plan:

- Do not silently add weapon levels, a fourth slot, or a new weapon while implementing these stages.
- Keep health, ammo, armor replacement/repair behavior, and medkit relevant.
- Tune later-stage loot density so restocking remains affordable without making money meaningless.
- Warden's reward should support the final Stage 13 restock even when the player enters Stage 12 with low resources.
- The Stage 12→13 shop is the final requisition opportunity and should clearly communicate that the next mission is the finale through ordinary English UI copy, without changing the shop's core interaction.

Before Stage 9 tuning is finalized, run an economy audit using representative low-, medium-, and high-spend campaign runs. If most players have nothing meaningful to buy by Stage 9, propose late-campaign upgrade tiers as a separate user decision. Do not expand `maxWeaponLevel`, armor tiers, or shop catalog as an unreviewed side effect of stage implementation.

## 12. Transition, save, cheat, and boot wiring

The expansion is not complete if the levels work only through direct imports. The following integration points must be updated and smoke-tested.

### 12.1 Stage 8 handoff

- Replace Stage 8's current endpoint-only `gameOver(... preserveCampaignSave)` path with `beginStageTransition(stage9Scene)` after the arrival dialogue and completion gates.
- Keep `STAGE 8 COMPLETE` before the Field Shop.
- Remove wording and UI behavior that restarts checkpoint 8 because Stage 9 does not exist.
- Preserve Stage 8 loadout, score, HP, armor, medkit, ammo, weapon levels, checkpoint, and stage statistics through its completion screen and shop.

### 12.2 Normal transitions

- Stage 9 → Stage 10.
- Stage 10 → Stage 11.
- Stage 11 → Stage 12.
- Stage 12 → Stage 13.
- Every transition uses `beginStageTransition` and fires once.
- Stage 13 does not schedule a next scene or Field Shop.

### 12.3 Transition registry

Update `campaign/utility/transition.js`:

- Import Stage 9–13 scenes only when those modules exist.
- Expand `campaignJumpToStage` valid range to 1–13.
- Replace or extend the hardcoded target array safely.
- Update comments and debug text that still claim 1–8.
- Ensure jump cleanup removes all boss-owned projectiles and stage-specific loops, not only shared arrays.

A small explicit stage registry may replace the positional array if it improves maintainability, but it must remain ESM-safe and be read inside functions to avoid circular initialization problems.

### 12.4 Checkpoint save

Update `core/saveGame.js`:

- Accept and round-trip stage numbers 1–13.
- Reject 0, negative, >13, fractional/invalid, and corrupt storage values.
- Keep the existing storage key so current players do not lose saves.
- Each future `enter()` calls `saveCampaignStage(N)`.
- Stage 13 ending calls `clearCampaignSave()` only after successful completion.
- A death, restart, or quit during the Stage 13 ending must leave checkpoint 13 available unless the final completion callback has run.

### 12.5 Main menu and startup

- Update comments/help text that describe `opts.stage` as 1–8.
- Continue loads Stage 9–13 through the same stage-1-world-build then `campaignJumpToStage` path unless the prebuild architecture is deliberately revised.
- A fresh campaign still begins with the prologue and Stage 1 intro; the expansion does not add a second campaign menu.
- New Game still clears the existing checkpoint and starts Stage 1.

### 12.6 Cheat console

- `skip-to-stage-9` through `skip-to-stage-13` must work from every campaign stage and campaign modal that already exposes the hook.
- Invalid values remain rejected.
- Survival remains unable to use campaign stage skips.
- Direct Stage 12/13 jumps must create/reset their boss rigs and effect pools without relying on previous-stage setup.
- Cheat jumps must stop current music/loops and clear stage-specific transient damage sources.

### 12.7 Final completion

- Stage 13 ending opens `CAMPAIGN COMPLETE`, not another `STAGE N COMPLETE` → shop cycle.
- The final screen must not show a next-stage action.
- Primary action returns to main menu.
- Completion clears campaign save and safely resets music/cinematic/UI state.
- Restart/death behavior remains available until completion is final.

## 13. World build, warm-up, and performance plan

### 13.1 Current contract and scalability gate

The current campaign pre-builds all eight worlds through `stage1.ensureWorld()` and precompiles every stage light configuration behind the initial loading screen. The safest first implementation extends that contract to the new world currently being built.

However, blindly adding five large worlds can increase startup time, memory, scene traversal, and shader warm-up cost. Therefore:

1. Record baseline startup duration, JS heap where available, scene object count, geometry count, and renderer programs before Stage 9.
2. Implement Stage 9 using the existing prebuild contract and an inactive top-level root.
3. Measure again before starting Stage 10.
4. If projected Stage 13 memory/startup is unacceptable, stop and design a campaign-world registry that can dispose/rebuild geometry while separately warming every material/light program.
5. Such a registry would change a repository invariant and must update `CLAUDE.md`, `AGENTS.md`, `MODULES.md`, campaign docs, and smoke coverage. It must not be introduced silently inside one stage.

Until that measured decision exists, the implementation must obey the current up-front prebuild rule.

### 13.2 Active-stage visibility

- Every new stage/chapter has one root that can be hidden as a whole.
- Only the active root and required cutscene roots are visible during gameplay.
- Stage 12 chapter switching hides the inactive chapter root and switches light key.
- Precompile temporarily exposes the necessary roots/materials behind the loading screen, then restores inactive visibility.
- Visibility changes must also disable any world-owned update work; hidden stages do not animate cranes, rain, scanners, aircraft, or bosses.

### 13.3 Geometry and draw-call strategy

- Repeated props use InstancedMesh or material-coherent chunked batches.
- Never merge an entire long stage into one route-wide geometry if that defeats frustum culling.
- Recommended static chunk length for large outdoor routes: 75–150 meters, selected by measurement.
- Hero assets use `mergeObjectInPlace` for static hull pieces.
- Preserve separate objects only for actual movement, visibility, material animation, collision ownership, or occluder fading.
- Transparent surfaces, sprites, lights, and dynamic parts stay out of incompatible static batches.
- Shadow flags must participate in batch grouping. Small flush-mounted details should not inherit `castShadow` from one large caster.
- Large decorative background structures do not cast dynamic shadows unless measurement and composition justify it.

### 13.4 Lighting budgets

Initial target per active chapter:

- No more than roughly 18 stage PointLights without profiling evidence.
- Outdoor Stages 9–11 should generally stay below that.
- Stage 12's two chapters count separately because only one may be active.
- Stage 13 boss effects add zero persistent PointLights; shared explosion/muzzle pools remain global.
- Decorative runway, port, civic-axis, dam, and hardline lights use emissive or Basic materials.
- PointLight count remains constant within a chapter. Intensity may animate; light creation/removal does not.

### 13.5 Runtime budgets

Provisional profiling gates on the project's representative desktop/browser target:

- Ordinary gameplay draw calls: target ≤350.
- Boss gameplay draw calls: target ≤450.
- Active ordinary robots near player: generally ≤30.
- No per-frame object/material/geometry creation in stage or boss hot loops.
- Collision/ground/LOS queries use bounded spatial candidates rather than whole-world arrays.
- No stage-owned effect pool grows after entry.
- No shader compile appears during first use of an attack, container movement, scanner strike, upload state, boss phase, death sequence, or ending.

These are targets, not reasons to degrade a scene blindly. Capture `renderer.info`, static-batch metrics, shadow triangles where measurable, and CPU timings before deciding which resource is actually limiting performance.

### 13.6 Stage-specific performance risks

- Stage 9: hero aircraft authored complexity and too many runway lamps.
- Stage 10: container material proliferation, one giant container batch, dynamic blocker scans, and crane shadow cost.
- Stage 11: transparent foliage overdraw, excessive individual trees, rain particles, and full blocker scans.
- Stage 12: both chapter light sets accidentally active, high plaza visibility, Warden articulated mesh count, and upload/boss effects compiling late.
- Stage 13: hundreds of inert robot rigs instead of instanced shells, duplicated city backdrop, Mahapatih phase assets appearing lazily, and Monas lighting interacting with boss effects.

## 14. Smoke-test and verification blueprint

Every gameplay implementation follows the mandatory order:

1. Add or update config-driven smoke assertions.
2. Run the complete `node tools/smoke.mjs` suite until it ends with zero failures.
3. Run `node --check` for every touched JavaScript file.
4. Parse `config/gameplay.json`.
5. Run `git diff --check`.
6. Sync `CLAUDE.md`, `AGENTS.md`, `docs/MODULES.md`, `docs/campaign.md`, and this plan when an approved decision becomes implemented canon.

### 14.1 Shared extension coverage

Smoke must prove:

- Save round-trip accepts 1–13 and rejects out-of-range/corrupt values.
- `campaignJumpToStage(1..13)` reaches the intended scene; invalid values return null.
- Stage 8 normal completion reaches green finish, Field Shop, then Stage 9.
- Stages 9–12 each execute green finish → CONTINUE → Field Shop → Start Next Stage.
- Stage 13 does not open Field Shop and clears save only at final completion.
- All new `ensureWorld()` functions are idempotent.
- All new worlds are built/warmed through the chosen campaign build path.
- Stage origins/bounds do not overlap.
- Only the active light set is visible.
- Hidden stage roots do not update.
- Every player-facing dialogue body comes from config and types completely.
- Every material passes the palette/emissive sweep.
- Repeated-prop and hero-asset mesh budgets are explicit.

### 14.2 Stage 9 coverage

- Airport world builds, route is connected, and all objectives/supplies/spawns are walkable.
- Chapter 1 ends only after the outside garrison is cleared and the building entrance is reached.
- Chapter 2 uses a playable airport-building interior and ends only after its garrison is cleared and the apron exit is reached.
- Chapter 3 requires the physical pump to be activated before fuel progresses.
- Fuel progress is monotonic, config-driven, and reaches 100% before boarding is enabled.
- Boarding cannot trigger before the aircraft is full.
- Skip and natural takeoff produce identical final transforms and cleanup.
- Completion invokes Stage 10 transition once.

### 14.3 Stage 10 coverage

- Every container layout state is BFS-connected.
- Crane motion starts only from safe bay and lands exactly.
- Visible container and collider transforms agree at start, midpoint, and finish.
- No robot remains/traps inside a moving-container corridor.
- Skip applies stable layout B.
- Cannon locks a dead point; shots after lock pass through that point rather than tracking the player.
- Servo destruction order/state is permanent and config-driven.
- Cannon hazards clear on shutdown.
- Extraction remains locked until the defense array is down.
- Completion invokes Stage 11 transition once.

### 14.4 Stage 11 coverage

- Entire intended route is connected and no decorative collapse is treated as a required jump.
- Scan footprint moves according to config and protection predicates match visible shelters.
- Exposure locks only after configured time and cancels/decays correctly.
- Impact point freezes at lock.
- Artillery damages player and robot according to config and respects blast blockers.
- Strike pool never grows.
- Detection cannot fail/reset the stage.
- Forest occluders restore opacity after the player passes.
- Utility tunnel finish cannot trigger from outside its intended approach.
- Completion invokes Stage 12 transition once.

### 14.5 Stage 12 coverage

- Both chapter worlds build and only the active root/light set is visible.
- Chapter switch preserves stage statistics, loadout, dialogue seen state, and active scene ID.
- Drive cannot be inserted before root access and inserts only once.
- Upload starts from valid file, never decreases, pauses only during explicit jam, and cannot finish before Warden death.
- Warden rig builds with finite hit volumes and all projectile pools preallocated.
- Each Warden phase threshold occurs exactly once.
- Directional shield accepts/reduces damage only from intended sides.
- Rail line locks before firing.
- Every sector pattern leaves a valid safe lane.
- Capacitors/couplings become damageable only in communicated jam state.
- Death clears all hazards before closing dialogue.
- Broadcast reaches 100% after boss death.
- National shutdown occurs before the M-0 anomaly reveal.
- Stage still reports success and transitions to Stage 13 Field Shop.

### 14.6 Stage 13 coverage

- Campaign Monas world is isolated from Survival state.
- Inert background army is non-AI, non-colliding unless explicitly authored, and cheap to draw.
- Offline guards are the only standard enemies that activate.
- Boss arena locks only after entry and leaves Monas outside charge collision paths.
- Phase 1 attacks lock their targets/lanes before execution.
- Siege-frame death clears hazards and transitions once.
- Phase 2 hit volumes replace rather than overlap hidden siege volumes.
- Twin-blade sweeps are mirrored and separately timed.
- Lunge cannot turn after commitment.
- Four hardline anchors can be destroyed in any order.
- Each anchor removes the correct shield/hazard contribution.
- Final core becomes vulnerable only after all anchors are gone.
- Boss lethal hit clears every projectile, contact zone, sweep, and countermand effect.
- Boss wreck settles away from Monas and collision matches the visible wreck.
- Ending cleanup restores camera, cinematic bars/fade, avatar pose, inputs, audio, weather, and arena bounds.
- Save exists through an interrupted ending and clears after successful `CAMPAIGN COMPLETE`.
- Final screen has no next-stage/shop action.

### 14.7 Mutation tests worth adding

At least one mutation-style assertion should fail if a developer:

- Replaces the Stage 12 success with another upload failure.
- Lets the Warden remain alive when upload reaches 100%.
- Makes Stage 10 cannon track after lock.
- Makes Stage 11 artillery follow after lock.
- Restores full-world blocker scans in a large stage.
- Globally merges every container/tree/airport prop into one unculled geometry.
- Activates both Stage 12 light sets.
- Reuses Survival's mutable Monas group in Stage 13.
- Clears the checkpoint at Stage 13 entry rather than completion.
- Leaves a boss hazard active after death.
- Adds an unexplained second surviving node after M-0 dies.

## 15. Implementation sequence

Do not attempt all five stages in one unreviewed code pass. Complete them vertically so each stage is playable, integrated, measured, tested, and documented before moving to the next.

### Phase 0 — extension infrastructure audit

1. Capture current build/startup/performance baselines.
2. Confirm final Stage 9–13 titles and story spine against this document.
3. Audit late-campaign economy.
4. Reserve origins/light keys and choose root visibility API.
5. Prepare smoke helpers for future stage worlds without changing current save range to missing scenes.

### Phase 1 — Stage 9

1. Approve a 2D layout/blockout before detailed geometry.
2. Build airport world, nav, collision, markers, and supplies.
3. Build aircraft hero rig and warm-up path.
4. Implement the three-chapter flow and physical fuel-pump objective.
5. Implement opening/takeoff cinematics and dialogue.
6. Add full smoke coverage and profile.
7. Wire Stage 8→9, checkpoint 9, cheat 9, and Stage 9→10 only when Stage 10 has at least a valid integrated destination. Until then Stage 9 may temporarily preserve checkpoint as an endpoint in a development branch, but final merged behavior must follow the normal transition contract.

### Phase 2 — Stage 10

1. Approve container-yard layouts A/B and safe crane bay.
2. Build static port in spatial chunks.
3. Implement dynamic container collision/nav.
4. Implement warehouse/pipe-rack encounters.
5. Implement defense-array setpiece.
6. Add dialogue, extraction, tests, profiling, and Stage 10→11 wiring.

### Phase 3 — Stage 11

1. Approve route silhouette and waterworks composition.
2. Build chunked forest and cover volumes.
3. Implement scanner/lock/strike pools.
4. Implement encounters, artillery interactions, and utility finish.
5. Add dialogue, tests, profiling, and Stage 11→12 wiring.

### Phase 4 — Stage 12

1. Approve surface/root blockouts and chapter handoff.
2. Build separate roots/light sets.
3. Implement surface assault and drive insertion.
4. Prototype Warden graybox attacks and hit volumes before final art.
5. Build/weld Warden visual rig and prewarm all phases.
6. Implement upload, boss, successful shutdown, and M-0 reveal.
7. Add tests/profiling and Stage 12→13 wiring.

### Phase 5 — Stage 13

1. Audit/refactor or isolate Monas landmark geometry.
2. Approve Medan Merdeka layout and boss-safe charge lanes.
3. Build silent-city approach and offline guard encounters.
4. Graybox all Mahapatih phases and hardline routing.
5. Build/weld final boss rig and prewarm every phase.
6. Implement return cinematic, boss, ending, final completion, and checkpoint clear.
7. Run full campaign transition/checkpoint tests and final performance pass.

### Phase 6 — campaign-wide finish pass

1. Play from Stage 8 completion through Stage 13 without cheats.
2. Play direct Continue at checkpoints 9–13.
3. Play Easy/Normal/Hard boss passes.
4. Audit loot/shop economy and ammo starvation.
5. Audit dialogue pacing and exact final wording.
6. Audit all cutscene skip paths.
7. Audit active light counts and first-use shader hitches.
8. Run full smoke and syntax checks.
9. Update all canonical documentation from “planned” to “implemented” only for completed work.

## 16. Review gates before detailed implementation

These reviews prevent expensive rework:

1. **Narrative gate** — final story beats, M-0 reveal, and ending tone.
2. **Blockout gate** — one top-down map per stage/chapter with start, finish, objective, arena, supply, and route widths.
3. **Mechanic gate** — jet blast, crane state change, scanner lock, Warden jam, and hardline phase proven in graybox.
4. **Boss silhouette gate** — Warden and both visible Mahapatih bodies readable from gameplay camera.
5. **Dialogue gate** — final English script approved before exact-string smoke asserts.
6. **Performance gate** — active stage metrics captured before decorative density pass.
7. **Final pacing gate** — Stage 12 victory feels complete before the anomaly; Stage 13 approach is short enough not to dilute the final boss.

## 17. Definition of done

A future stage is not done merely because its finish trigger works.

### Per-stage definition

- Complete start-to-finish state machine.
- World/nav/collision connected and tested.
- All objectives visible, radar-readable, and impossible to trigger out of order.
- All encounters spawn on valid walkable points and clean up correctly.
- Dialogue comes from config and types fully.
- Supplies and economy are playtested.
- Cinematic natural and skip paths converge on identical gameplay state.
- Stage completion follows the correct green-screen/shop contract.
- Direct checkpoint/cheat entry works.
- No first-use shader or audio hitch in the main setpiece.
- No per-frame allocation or global blocker scan in hot paths.
- Debug API exposes enough state for deterministic smoke tests.
- Full smoke suite and syntax checks pass.
- Canonical docs are synchronized.

### Boss definition

- Visual silhouette approved from gameplay camera.
- Every attack has a readable telegraph, committed target, damage window, and cleanup.
- Every HP threshold triggers once.
- Invulnerability/reduced damage has visible and HUD feedback.
- Hit volumes follow visible phase geometry.
- All projectiles/effects are pooled and warmed.
- Death immediately removes lethal state.
- Wreck collision matches final visible pose.
- Boss can be reset and fought again through restart/checkpoint.
- Debug stepping can exercise each attack/phase without a real-time full fight.

### Campaign-completion definition

- Stage 8→13 can be completed through normal transitions.
- Continue works for checkpoints 9–13.
- Stage 12 broadcast demonstrably succeeds.
- Stage 13 definitively resolves M-0 with no accidental sequel stinger.
- Campaign save clears only on final completion.
- Main menu return is clean and no campaign audio/UI state leaks.

## 18. Risk register

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Five new worlds extend current prebuild too far | Long boot, high memory | Measure after each stage; inactive roots; deliberate architecture gate before changing invariant |
| Stage 9 resembles Stage 8 vehicle combat | Repetition | Player is on foot; aircraft is stationary objective; takeoff is cinematic only |
| Stage 10 crane traps player/robots | Softlock | Safe-bay trigger, validated A/B layouts, dynamic footprint parity, exact settle, skip-state test |
| Stage 11 becomes frustrating stealth | Repeated failure or waiting | Detection creates dodgeable artillery, never instant fail/reset |
| Forest produces overdraw/FPS drops | Poor performance | Broad low-poly canopy, instancing/chunks, limited transparency, no reflections |
| Stage 12 repeats Stage 6 failure | Narrative fatigue | Upload is canonically successful; Warden only delays it |
| Warden jam looks like broken hit registration | Player confusion | Explicit HUD, exposed target feedback, boss remains visibly connected to jam |
| Stage 13 undermines IKN victory | Twist feels cheap | Main network remains off; only pre-existing air-gapped M-0 survives |
| Final boss becomes unreadable bullet hell | Unfair finale | Sequential attacks, preserved telegraphs, no adds by default, safe lanes asserted |
| Campaign Monas affects Survival | Cross-mode regression | Separate instance/state; test Survival before/after Stage 13 build |
| Field Shop loses relevance | Loot/economy feels pointless | Economy audit; consumable relevance; separate approval for late tiers |
| Scope expands through new weapons/classes/minigames | Delayed completion and diluted identity | Reuse core combat; treat such additions as separate decisions |

## 19. Explicit non-goals

Unless separately approved, this expansion does not include:

- A new player character.
- Cooperative multiplayer.
- A fourth weapon slot.
- New movement controls.
- An aircraft piloting stage.
- A third full moving-platform level.
- A new universal normal-robot class.
- A mandatory stealth/fail-on-detection system.
- Real-time water reflections.
- Destructible Monas.
- A human mastermind replacing M-0.
- Another failed kill-switch upload.
- A hidden post-final surviving node.
- A Stage 14 hook.

## 20. Anti-drift checklist

Before merging any Stage 9–13 implementation, answer yes to all applicable items:

- Does Stage 9 begin from Kertajati and end with takeoff?
- Is Stage 10 a grounded Balikpapan port stage rather than another playable moving vehicle?
- Does Stage 11 use detection as pressure rather than instant failure?
- Does Stage 12 take place in IKN and contain the Nusantara Warden boss?
- Does the Stage 12 kill-switch broadcast actually work?
- Is M-0 clearly the Mahapatih military fork responsible for the hijack, not a random new villain?
- Does Stage 13 return to Monas for the final boss?
- Does Monas remain standing?
- Are there no full named bosses in Stages 9–11?
- Are all mechanics config-driven and scene-owned?
- Are all dialogue bodies in config and all UI strings English?
- Are long environments spatially chunked and collision queries indexed?
- Are all lazy visual/attack states built and warmed before first use?
- Do green finish, Field Shop, checkpoint, cheat, and restart flows work through Stage 12?
- Does Stage 13 clear the save only after `CAMPAIGN COMPLETE`?
- Does the ending provide closure rather than another unexplained alert?

## 21. Concise canonical synopsis

After destroying the Cisumdawu gunship, Major Gibran reaches Kertajati. He fights through the occupied airport, secures an autonomous heavy transport, and escapes Java. Automated defenses force him into Balikpapan's industrial coast, where he disables the machine-controlled port defense network. His ground transport is destroyed on the approach to IKN, forcing him through the forested sensor belt and waterworks on foot. Beneath Nusantara's civic axis he reaches the root transmitter, inserts the valid kill-switch, defeats the six-legged Nusantara Warden, and successfully decommissions the national G.A.R.U.D.A network.

One signal remains: M-0 MAHAPATIH, an air-gapped military authority kernel created by the Mahapatih Protocol and responsible for Zero Hour. It activates a sovereign war body beneath Medan Merdeka and attempts to use Jakarta's legacy emergency network to reverse the shutdown. Gibran returns to a silent Jakarta, breaks the last offline guard, and destroys M-0 in a multi-phase battle around Monas. The countermand dies with it, Monas remains standing, and the campaign ends.

## 22. Acceptance-pass record (2026-08-13)

The §14 smoke matrix is implemented as sections **25** (shared 9–13 contract), **25a** Stage 9, **25b** Stage 10, **25c** Stage 11, **25d** Stage 12 and **25e** Stage 13. Writing it changed three things this document had specified differently, and each change is now the canon:

1. **`campaign.stage11.scan` was retuned** (§1.3 permits this). The authored band swept the whole route in 3.5 s with a 28-unit gameplay half-width, so a stationary exposed player was inside it for 0.17 s against a 1.2 s `lockSec` — the artillery in §7.5 could never trigger. The visible footprint is now built from `safeRadius` (so the band you see is the band that is tested) and the config is `safeRadius` 115 / `cycleSec` 14, giving a 1.42 s dwell. Smoke derives the dwell from `CFG` and fails if a retune drops it below `lockSec`; `scan.sweepSec` remains unused.
2. **Stage 12's completion hook is installed by the facade.** §12.2 required one gateway for the 12 → 13 handoff; the implementation exposed `setStage12CompletionHook` but never called it, so a completed broadcast dead-ended. `stage12Scene.enter()` now installs `() => beginStageTransition(stage13Scene)`, keeping Stage 13 out of `root.js`'s imports.
3. **§8.7's "every sector pattern leaves a valid safe lane" is enforced by freezing the pattern.** The wedges were drawn from `animT` at telegraph time and re-derived at detonation, drifting about 20° across the telegraph, so the drawn gap was not the safe gap. `beginSector` now stores `sectorBase` and `resolveSector` reads it.

Four further defects found by the matrix were fixed without changing the plan: the Warden read its yaw off a `Vector3` (crash on its first active frame); Stage 9/10 left a radio line on screen through the green finish; four robot/barrel spawn points sat inside solid props; and Mahapatih's wreck slide was frame-rate dependent. Details are in [campaign.md](campaign.md#acceptance-pass--stages-913-2026-08-13-completing-the-plans-14-matrix).
