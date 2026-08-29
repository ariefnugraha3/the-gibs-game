# AGENTS

**Stage 11 Chapter-1 asphalt/forest boundary pass (2026-08-29, user request):** the outer-IKN route is a wide ASPHALT corridor, not dirt. Every straight segment has a merged shoulder/asphalt/centre-marking stack and every route node has matching circular shoulder/asphalt caps, so bends have no exposed wedge or disconnected rectangle; `roadProfile` publishes those real joints. The stream crossing is aligned to route segment 2 and is a concrete/steel service bridge with a full-width asphalt cap, two abutments, paired girders/rails, fourteen rail posts and three piers; the rail blockers sit at the drawn edges. The forest is denser through 900 copies in the SAME four shadowless `InstancedMesh` batches, biased to both road flanks, never one mesh/draw call per tree. A fifth and only fifth repeated-vegetation draw node batches every boundary shrub; rows cover both sides of all six route segments and rounded corner clusters fill bends, with shrub centres deliberately outside `stage11ForestWalk` so they visibly explain the already-enforced player/robot boundary. Forest waves pass their deterministic jitter through `stage11ForestSpawnPoint` before `spawnCampaignRobot`; it projects onto the DRAWN asphalt, insets the floating-point edge and searches along the route away from cover. Debug and smoke `25d` require every recorded forest robot spawn to be both asphalt-contained and walkable.
**Stage 11 is one three-chapter mission (2026-08-29, user request):** `stage11Scene` now starts in Chapter 1 under `campaign-11-forest`: Major Gibran descends continuously from the configured `campaign.stage11.parachute.startHeight`, drifts to `S11_FOREST_LANDING`, sheds one prebuilt canopy/8-line parachute rig, clears the two configured `encounters.forestApproach` patrols, then follows the authored forest route to `S11_FOREST_GATE`. Dense forest repetitions stay in four `InstancedMesh` batches; the route-side hero trees remain ordinary registered occluders. Reaching the gate calls `enterStage11Sub(surfaceScene)` directly, and the existing city chapter then hands off to the existing computer/Warden root chapter the same way. Never call `setScene`, a stage transition, or a shop between these chapters: checkpoint 11, loadout, money, stage statistics and the facade identity must remain continuous. Dialogue `seen` belongs to the entire facade; a cutscene skip may clear the live queue but must not reset that history. The facade/root default and `sceneManager` mapping are `campaign-11-forest`; only one of the forest/surface/root worlds may be active, while inactive roots also skip their matrix walk. Smoke `25d` pins the live descent, prebuilt forest/parachute census, collision-reachable handoffs, dialogue continuity and the complete forest -> city -> root route.

**Stage 10 rice-field/plantation roof orientation fix (2026-08-29, user report roofs looked upside-down):** the shared old pitched-roof rule used `rotation.z = side * 0.39`, which raised both outer eaves and lowered the centre seam into a valley roof. Every detailed/batched house now consumes `pitchedRoofLayout(w,h,raised)`: the left plane has positive Z roll, the right plane negative Z roll, both climb from low eaves to one high centre ridge, and panel length is derived from the true half-run/rise. Rise is capped by width, wall height, 4.5 units and the shared surface-flight clearance, so the 50-unit plantation sorting sheds use a believable shallow pitch instead of driving their eaves below ground; rice huts retain the steeper domestic pitch. Ridge beams follow the derived height, while a rooftop tank is omitted when it cannot clear the same ceiling safely. This shared correction also fixes housing/stilt-house variants without adding meshes or draw calls. Landscape debug publishes `roofProfile`; smoke `25c2` pins sign, ridge-over-eave ordering, panel length, the shallower capped plantation roof and the global landscape ceiling.

**Stage 10 bomb HUD placement (2026-08-29, user request):** bomb stock belongs in the lower-right aircraft ordnance module beside/below MONEY, not inside the top mission-status line. `stage10Scene.aircraftOrdnanceStatus()` publishes the live count and `SPACE / RMB` hint; shared `hud.js` owns the DOM update. The module uses a stable inline bomb silhouette, amber count and steel/chamfer housing, appears only for the `aircraft` HUD profile, updates immediately after use/pickup, and hides again for every operator scene. `hudStatus()` now reports only timer/boss/victory state and must not duplicate `BOMB`. Smoke `25c2` pins initial count, placement/profile visibility, input hint, no top-line duplication and decrement after a real bomb use.

**Stage 10 aircraft-specific HUD (2026-08-29, user request):** `stage10Scene.hudProfile` is `aircraft`, and shared `hud.js` applies that profile without hardcoding the stage ID. The lower-right HUD keeps MONEY/`scoreBox` but hides both the human weapon inventory and ammo module. The lower-left HUD hides Major Gibran's STAMINA and worn ARMOR, leaving one aircraft health instrument. Its label is `AIRFRAME INTEGRITY` and deliberately has NO numeric readout—only the visual fill bar. Its Stage-10-only CSS is a slightly larger 350 px metal/chamfer housing with a sturdy 20 px segmented bar, structural side rails and fastener details. Other scenes restore the `operator` profile (`HEALTH` with its number, inventory, ammo, stamina and eligible armor) on their next `updateUI`; never make these Stage 10 removals global. Smoke `25c2` pins profile ownership, MONEY visibility, all human-only elements hidden, aircraft wording/no-number rule and the larger frame dimensions.

**Stage 10 enemy-bullet range lives in its stage config (2026-08-29, user request):** ordinary enemy plasma orbs take their maximum travel distance exclusively from `flight.enemyBulletRange` in `config/stage10.json`; do not restore a hardcoded/configured lifetime as the tuning knob. Each spawned orb receives `rangeLeft`, runtime subtracts its actual per-frame travel, and its backstop lifetime is derived as `enemyBulletRange / enemyBulletSpeed`, so changing speed never silently changes range. Homing missiles are separate and use `flight.enemyFire.missileLifeSec`; they must not borrow the bullet range/lifetime. The screen-edge cull remains the earlier performance/readability limit and may remove a shot before its configured maximum. Debug and smoke `25c2` pin the config ownership, the derived lifetime, and a real spawned orb carrying the configured range.

**Stage 10 typed player-impact reactions (2026-08-29, user request):** ordinary enemy rounds, homing missiles and aircraft rams must never share one generic blink. Every damage call carries its source kind and world position into `beginPlayerImpact`. A bullet gives a short directional recoil/bank with a local flash, ring and seven sparks; a missile gives a longer/harder throw, altitude loss, engine sputter, twelve sparks plus attached fire/smoke; a collision gives the longest response, a three-axis roll/pitch/yaw throw, altitude loss, fire/smoke and eight ejecting debris pieces. Stronger impacts may override weaker ones, while bullet spam cannot cut off missile/collision recovery. The flight rig and outer aircraft apply temporary offsets/rotations on top of normal steering, then return exactly to the neutral flight pose; lethal damage cancels the reaction and hands ownership to the existing player-destruction sequence. `flightWorld.js` prebuilds one shared impact pool (1 flash, 1 ring, 12 sparks, 6 smoke, 3 fire, 8 debris), runtime creates zero mesh/material/light, and every child is hidden again at recovery. Smoke `25c2` pins the real ram path, all three typed poses/FX budgets, strength/duration ordering, full recovery and zero PointLights.

**Stage 10 coast-aware surface-target routing (2026-08-29, user report tanks/buildings at sea and ships on Kalimantan):** surface type is derived from the candidate target's exact WORLD `z` through `biomeAtZ`, never from the player's current `biome`; the top of the camera crosses each fixed coastline several seconds before the player, so player-biome routing is inherently wrong. `spawnScheduledSurface` chooses one offscreen point first, then creates a ship only for `ocean` or a ground installation only for Java/Kalimantan. Every surface slot tracks `surfaceEntered`: until its silhouette first touches the real camera frame, `reconcilePendingSurfaceTargets` may cancel a now-wrong ground/ship slot and immediately respawn the corresponding ship/ground type at the same point; after first visibility its identity is locked so nothing morphs in view. Ships spawned in ocean are clamped inside the Java sea edge and cannot motor across the fixed shoreline. `spawnGroundTarget` rejects explicit ocean positions and chooses the Kalimantan table without `depot`. Debug publishes `surfaceRouting` targets/mismatches/reconciliation. Smoke `25c2` tests ahead-of-player routing on both coasts plus forced offscreen ground→ship and ship→ground replacements with zero mismatches.

**Stage 10 potato-PC landscape optimization (2026-08-29, user report "berat banget"):** the cinematic landscape keeps its authored silhouettes/details but pays for repeated structure through batching, never per-house/per-tree draw calls. Urban tower layers/rooftops/traffic, Java houses, rice paddies/bunds/crops, plantation compounds, Kalimantan stilt houses, palm service compounds and each meandering river layer are prebuilt `InstancedMesh` batches. A district is capped at 48 render nodes in the real built-world census. All static terrain/coast/ocean scenery has `castShadow:false` because the 900-unit top-down camera gains negligible information from rendering the whole background into the global real-time shadow map; aircraft, ships, ground targets and projectiles are outside this optimization and keep their gameplay rendering. Clouds are 12 clusters with two batches per cluster (lit/shade), not 18×4 independent meshes. Do not trade this back for individual meshes. `terrainPerformance` publishes draw nodes, batches, instances and shadow casters; smoke `25c2` requires zero static scenery shadow casters, <=48 nodes per district, 1000+ instanced repeated objects and the 12×2 cloud contract.

**Stage 10 landscape brightness reduction (2026-08-29, user report "terlalu terang"; optimized later that day):** Stage 10 uses the shared four-light base rig with the dedicated `flight` preset, whose ambient, hemisphere, directional and rim intensities are exactly 75% of `outdoor` (0.225/0.3/0.525/0.165). It owns zero additional directional or point lights; the former three-light Stage 10 rig was removed because extra forward-rendered lights looped over every fragment and made the stage unnecessarily heavy. Do not compensate through material colours/emissive values. Debug and smoke `25c2` pin the multiplier, shared rig and zero extra shader lights.

**Stage 10 landscape cinematic-detail pass (2026-08-29, user follow-up: still simple/basic/placeholder):** the seven Java/Kalimantan districts are miniature real places seen from altitude, not census-compliant rows of boxes/discs. Java urban blocks use layered podium/setback towers, rooftop plant/tanks, glass bands, sidewalks, road markings and visible traffic; housing uses true two-plane pitched roofs/ridges, terraces, doors, lot walls, gardens, street trees and open drains; rice fields mix raised irregular paddies, crop rows, water glints, branching irrigation and a raised field hut; plantation rows have ground strips, two-level crowns, service roads and processing/drying compounds. Kalimantan rainforest has tree height/species variation expressed through trunks, buttress roots, three canopy layers, dense understory, fallen logs, clear river gaps, sand deposits and a nine-segment meandering river; oil palm uses staggered rows, an individual crown plus eight radial fronds per palm, shadows, paired-bank drainage and service buildings; river housing has detailed pitched-roof stilt houses, boardwalk spines, one jetty per house, boats, multi-layer trees and the same meandering river language. Coast and ocean use full-width batched surface texture, multiple surf lines, nearshore rocks/sandbars, larger inhabited islands and working boats. Repeated scenery remains prebuilt/instanced. Cinematic depth comes from the shared base-light rig and authored material contrast, never extra Stage 10 lights. Stable tile identity, offscreen-only dressing, geographic ordering and all older landscape zone names remain unchanged. Smoke `25c2` pins the architectural layers, human-scale infrastructure, crop/water detail, vegetation strata, radial palm fronds, river segments, boats/jetties, batching and cinematic lighting—not merely the old coarse object counts.

**Stage 10 Java/Kalimantan landscape districts (2026-08-29, user request to improve the land background):** interior land tiles are authored districts, not generic green slabs with scattered circles. The six reusable Java variants cycle through exactly four readable zones: `urban` (five-road grid, 30+ multi-height blocks, glass roofs and rooftop machinery), `housing` (street grid, 28+ small houses with alternating roofs and gardens), `rice-fields` (28 rectangular wet/young/mature paddies, raised bund grid, irrigation and a field hut), and `plantation` (100+ evenly rowed trees plus service tracks). Kalimantan cycles through exactly three different zones: `tropical-rainforest` (80+ irregular tall trunks with two canopy layers and a winding river), `oil-palm-plantation` (90+ palms in unmistakable staggered rows with crossed fronds and drainage channels), and river `housing` (20+ raised/stilt houses, boardwalks, river and surrounding trees). Dense plantation/rainforest/palm components must remain prebuilt `InstancedMesh` batches, never hundreds of per-frame allocations or draw calls. `tile.landscapes` and the flight debug read-out publish the zone and census; landscape selection is tied to stable tile identity and can only become visible through the existing offscreen wrap/dress rule, so scenery never morphs in view. The two geographic coast variants and Javaâ†’seaâ†’Kalimantan ordering remain unchanged. Smoke `25c2` pins all seven zone names, their structural counts, batching, visible Java coverage, visible Kalimantan coverage after landfall, and the existing no-in-view-change contract.

**Stage 10 surface/ground staged destruction (2026-08-29, user request explosion animations for tank, AA turret, ships and buildings):** `shipA`/`shipB` and all four ground families (`turret`, `tank`, `bunker`, `depot`) die through a reserved NON-COMBAT pooled wreck state, matching the aircraft contract: HP zero immediately clears `active` and awards/drop-counts once, but sets `destroying:true`, keeps the model visible, and prevents slot reuse until `flight.targetDeath` expires. Every slot owns prebuilt fire/smoke/spark FX; runtime creates no mesh/material/light. Ships roll and sink while turret/mast/CIWS/launcher assemblies tear away; AA loses its traverse and stabilizer arms, tanks throw turret and road wheels, bunkers shed roof/slit/vents, and depots eject grouped fuel tanks plus roof. Initial, secondary and final blasts are staged before final pool release. Ground spawning requires `!active && !destroying` and placement also avoids visible wrecks. Shared reset paths restore every detached transform, model pose, wake, flash and FX state before reuse. Smoke `25c2` pins prebuilt FX/detail census, visible post-kill non-combat wrecks, all four ground breakaway families, ship sinking, staged blasts, smoke and delayed release.

**Stage 10 enemy-aircraft cinematic turnaround (2026-08-28, user report 180-degree reversal looked like an instant flip):** positional HOLD weave must never directly own aircraft yawâ€”the sinusoid reverses velocity at its extrema and used to snap the model toward the opposite heading. HOLD now keeps a forward-biased heading with angle damping; after dwell it enters an explicit `turn` state for `waves.turnSec`, follows a speed-integrated 180-degree arc using smoothstep heading, climbs and pitches through the maneuver, banks up to `turnBankDeg`, boosts its prebuilt exhausts and reveals exactly two prebuilt wingtip vapor trails, then settles into `exit`. Members of one wave break toward the same side. Enemy weapons pause during the turn because their projectiles must not fire sideways from an aim-independent body. Side-entry aircraft are born at their real cross-screen heading, and every other movement-driven yaw is shortest-angle damped. No runtime visual allocation. Smoke `25c2` measures the actual turn frame-by-frame: near-PI total heading, bounded per-frame yaw, peak bank/pitch/climb, vapor count and eventual exit.

**Stage 10 surface-warship visual/action pass (2026-08-28, user report "bentuk kapal laut terlalu basic"):** the two ocean enemies are distinct prebuilt combat vessels, never one box hull in two loadouts. `shipB` is an armed patrol corvette with a layered keel/armor/deck, panoramic bridge, sensor mast and rotating radar, single forward gun, aft CIWS, side torpedo canisters, life-raft pods and twin wake. `shipA` is a guided-missile destroyer with the same readable naval construction at a heavier silhouette, dual main guns, aft CIWS, two missile-launcher pods and exactly eight visible VLS cells. Both publish `userData.shipRig`; main turret/CIWS track the player in ship-local space, radar and wake animate, gunfire recoils and flashes, and projectiles originate at real prebuilt gun/launcher muzzle anchors. Runtime may change transforms/visibility onlyâ€”no mesh/material/light creation. The existing `baseRadius * ground.visualScale` hit-circle derivation and local `+Z` bow convention remain unchanged. Smoke `25c2` pins the two silhouettes, mesh/detail census, weapon loadouts, animation, prebuilt firing anchors and wake.

**Stage 10 player bank-direction fix (2026-08-28, user report left/right aircraft lean was reversed):** the Stage 9 hero rig is authored longitudinally along local `+X`, with its right wing at local `+Z`; Stage 10 rotates the outer carrier by `+PI/2` to point the nose toward screen-top/world `-Z`. Therefore lateral velocity must drive `flightRig.rotation.x` with the SAME sign: moving right gives positive local-X roll and puts the rendered right-wing muzzle below the left; moving left gives negative roll and puts the rendered left-wing muzzle below the right. Never restore `-moveVX`. Smoke `25c2` projects both real outer wing-muzzle coordinates through the rig's X-rotation in both directions, not merely the Euler sign (the headless Object3D stub does not apply rotation in `getWorldPosition`).

**Stage 10 remaining +Z nose convention (2026-08-28, user report boss, enemy homing missile and player bomb-item noses were reversed):** the boss bomber, live enemy homing-missile mesh, and flying player bomb pickup all author their front at local `+Z`. Their only cone nose therefore uses `rotation.x = +PI/2`, has a stable semantic name (`stage10-boss-bow`, `stage10-enemy-homing-missile-nose`, `stage10-player-bomb-item-nose`), and sits at positive local Z. The boss enters from the screen top while moving world `+Z`, so its root yaw is `0`, not the obsolete `PI` compensation. Do not fix a reversed child cone by rotating its entire carrier. Smoke `25c2` pins all three noses and the boss entry yaw.

**Stage 10 ship bow orientation fix (2026-08-28, user report "moncong kapal laut terbalik"):** both `shipB` and `shipA` travel with local `+Z` as forward, so their `ConeGeometry` bow must use `rotation.x = +PI/2`, matching the aircraft nose convention. `-PI/2` points the cone tip toward the stern and must never return. Each bow owns a stable `stage10-${type}-bow` name and smoke `25c2` checks positive-Z placement plus positive sine rotation for both ship classes.

**Stage 10 ground weapon visual/action pass (2026-08-28, user report tank and anti-air cannon "terlalu basic"):** the land `turret` is a stabilized twin-AA emplacement, not a cylinder plus box: four outriggers/feet, traverse ring, armored cheeks, paired elevation cradle/barrels/muzzle anchors, ammunition housings, tracking optic and independently rotating radar must remain visible. The `tank` is a tracked main-battle tank, not three boxes: layered lower/upper hull, sloped glacis, side skirts, two track belts with exactly ten road wheels, rear engine grilles/exhausts, rotating armored turret, mantlet, elevating cannon/muzzle brake, cupola, optic and antenna. Both publish `userData.groundRig`; their traverse compensates for parent hull rotation, elevation follows the aircraft, and shots originate at the real prebuilt muzzle. AA radar, tank road wheels, recoil and per-barrel muzzle flashes animate in runtime without creating meshes/materials/lights. `baseRadius * ground.visualScale` remains the sole source of each hit circle. Smoke `25c2` pins silhouette/detail census, two AA barrels/four stabilizers/radar, one tank cannon/ten wheels, tracking/elevation, moving tracks, recoil and muzzle flash.

**Stage 10 enemy aircraft visual/destruction pass (2026-08-28, user report "placeholder, terlalu sederhana" and instant disappearance):** all three flight classes are distinct cinematic airframes, not a shared box-plane with different colors. `flightWorld.js` prebuilds their faceted layered fuselages, cranked-swept two-piece wings, twin tails, intakes, duct/fan/exhaust rigs, class-specific guns or missile hardpoints, animated elevons and navigation details. Their normalized outer span remains `enemyAircraftScaleRatio` of the player. Aircraft death is a NON-COMBAT pooled state: HP zero immediately releases `active` so formation/cap/gameplay logic stays correct, but reserves the slot with `destroying:true` and keeps the model visible for `flight.aircraftDeath.durationSec`. During that time it drifts, falls and spins, engine fire and a seven-puff smoke trail remain attached, ten sparks eject, four prebuilt wing/tail assemblies tear away, and secondary/final explosions fire before the slot is hidden. Spawning must require both `!active && !destroying`; never reuse a still-visible wreck. No runtime mesh/material/light creation. Ships retain their separate immediate blast path. Smoke `25c2` pins unique silhouettes/detail census, prebuilt FX, visible post-kill wreck, breakaway motion, staged blasts and final pool release.

**An inactive campaign world root must STOP BEING TRAVERSED, not merely be hidden (2026-08-29, user report "stage lain frameratenya turun sejak kita membuat stage 10"):** the 2026-08-13 rule that only the active root is `visible` stops `projectObject` — frustum tests and draw calls. But `WebGLRenderer.render()` first calls `scene.updateMatrixWorld()`, and in three.js r128 `Object3D.updateMatrixWorld` **recurses into every child without checking `visible`** — so every hidden stage world still paid a full matrix walk on every frame of every other stage. Measured: **117,050 objects in the scene, of which 20,554 belong to Stage 10's flight root alone** (the largest in the game — its enemy pool is 13,052 because 52 slots each carry all five silhouettes plus damage FX), against 12,217 for Stage 7's Bandung city. `setActiveCampaignWorldRoots` now installs an empty `updateMatrixWorld` on every root it deactivates and `delete`s it on activation, refreshing that root once with `updateMatrixWorld(true)` so no stale transform survives the hidden period. It is safe because nothing renders from a hidden root and because `getWorldPosition`/`updateWorldMatrix` climb UP through parents rather than through this method. `registerCampaignWorldRoot` and `prewarmCampaignWorldRoots` route through the same helper so an override is never left behind on a root being compiled. `campaignWorldRegistryDebug().worlds[].matrixWalkSkipped` reports it and smoke section 31 pins all three states.

**Stage 10's Kalimantan river is ONE river, and the forest got denser for FREE (2026-08-29, user: "sungai-sungai itu tidak tersambung, terlihat sangat aneh" + "perlebat pohon-pohon yang ada tanpa membuat gamenya jadi berat"):** the river broke for TWO independent reasons and both had to go. (1) Each Kalimantan district placed its river at `index % 2 ? 320 : -320`, so neighbouring tiles moved it 640 units sideways; all three districts now share one `KAL_RIVER_X`, and the palm plantation gained the trunk river it lacked (without it the chain still broke on every second tile, since the rotation is rainforest/palm/housing). (2) The meander used `sin(2*PI*t + seed)` — a PHASE shift per tile, which moves the value at the ends, measured as endpoints missing each other by up to **870 units**. The offset now uses only `(1 - cos(2*PI*k*t))` terms, whose value AND derivative are both zero at t=0 and t=1, so every tile enters and leaves at exactly `centerX` running parallel to z; per-tile variety comes from SIGNED AMPLITUDES, which cannot move the join. A third fix was needed because a polyline is not its analytic curve: tangency holds only exactly AT the endpoint, so the first segment still left at ~23 degrees and the seam read as a sharp corner. A `sin^2(PI*t)` WINDOW keeps the channel hugging `centerX` near both ends, dropping the end slope **0.43 -> 0.025** (worst seam corner ~6 degrees, which is just a river bend). Segment count is now derived from the path array — the old code hardcoded 13/12 in three lookups, so raising the resolution would have silently broken them. **The density work is the more useful lesson: the cheapest way to thicken a canopy is NOT more trees, it is WIDER CROWNS** — a bigger crown is the same instance and the same geometry, so it costs no draw call and no triangle, only overdraw. Crowns went 7-14 -> 13-24 radius, the grid tightened moderately, the THIRD crown layer became conditional (`u > 0.42`) because a much wider bottom crown already closes the gaps, and trunks dropped to 4-sided cylinders (1-2 px wide from 900 units). Net: **trees 486 -> 689 (+42%), canopy coverage ~18% -> 59%, triangles 48,492 -> 46,004 (LOWER), objects and batches unchanged at 11/9.** Smoke pins river join (all districts share one x, spread < 1e-6, and end slopes are measured RELATIVE to each path's own sharpest bend rather than against an absolute number that a retune would make stale) and canopy closure (average crown diameter must exceed the tree grid spacing — the structural definition of a closed canopy).

**The Stage 10 player hitbox is an ELLIPSE derived from the drawn silhouette, not a circle (2026-08-29, user: "sedikit besarkan area collision pesawat player ... saat ini peluru musuh harus benar-benar mengenai bagian tengah ... jika terkena ekor atau 50% sayap kiri maupun kanan, pesawat akan terkena damage juga"):** a circle cannot represent an aircraft. Measured, the player plane is **78.5 units nose-to-tail and 75.7 across the wings**, while `playerRadius` 22 covered only **56% of the fuselage and 58% of the half-span** — so the TAIL could never be hit at all, exactly as reported. `world.playerHit` now publishes `halfSpan` / `halfLength` as `playerHitSpanFraction` (0.62) and `playerHitLengthFraction` (0.92) of the DRAWN span/length, giving **62% wing and 92% nose-to-tail** coverage. Four things hold it together. (1) **The axes are not guessable — they were derived**: the rig is built with `rotation.y = PI/2`, which maps the authored fuselage (local +X, the Stage 9 transport convention) to world **-Z**, so the nose points up-screen and `halfLength` belongs to Z while `halfSpan` belongs to X; `playerImpact.yaw` is only a transient hit-recoil wobble, so a world-axis-aligned ellipse stays correct. (2) **Both semi-axes are fractions of what is DRAWN, floored at `playerRadius`** — so rescaling `playerVisualScale` moves the hitbox with it, the area can never shrink below the old circle, and a fraction < 1 means it can never exceed the aircraft (the same "what is drawn is what hits" rule as the gunship missile and the ground installations). (3) **`pad` thickens both semi-axes by the same amount** (the projectile's own radius) rather than scaling the ellipse, or a fat round would become easier to land on the long axis than the short one. (4) **RAMMING is deliberately NOT changed** — it keeps its own forgiving `playerRadius * 0.6` circle, because the user asked about enemy FIRE and widening the ram test would silently make collisions far deadlier. Smoke pins the geometry (covers tail and >50% wing, never exceeds the silhouette, never smaller than the old circle, and is genuinely longer than it is wide) AND queries the real predicate through the pure probe `stage10FlightPlayerHitTest` — tail, nose and both wing midpoints hit, a point past the wingtip still misses. **That probe is pure on purpose**: the first version of this test fired real rounds and ticked the scene, which corrupted 14 later tests, because `tools/smoke.mjs` is one sequential script and a state-mutating test leaks into its neighbours.

**Stage 10 landscape, second pass — Java is FARMLAND, nothing stands on the asphalt, and paddies are RECTANGULAR (2026-08-29, user corrections "untuk pulau jawa, perbanyak porsi sawah dan perkebunan" / "masih ada bangunan di perumahan dan perkotaan yang berada di atas jalan aspal" / "bentuk sawah juga jangan berantakan seperti itu, harus terkotak-kotak"):** three fixes. (1) **The Java rotation is now exactly `TILE_COUNT` long** — `[rice, plantation, urban, rice, plantation, housing]` — so the split is a real 4 farmland : 2 built-up instead of the 4-entry list's accidental 2:4 over six tiles; the length matching `TILE_COUNT` is what makes the proportion exact rather than a remainder artefact. (2) **Roads register a corridor and every structure is tested against it.** `addRoadCorridor` records each polyline plus its half-width, and `clearOfRoadsBox` measures the building's REAL footprint against it — for a segment against a convex box the minimum distance is always attained at a segment endpoint or a box corner, so checking both is exact. **A circumscribed circle is not good enough and cost two regressions**: it treats a 68x60 tower as 90 wide, which rejected 29 of 30 tower parcels and left the city with ONE tower, and it deleted paddies up to 58 units from a road, leaving wide empty bands. Two related traps: building type is chosen per DISTANCE BAND from the nearest road (ruko hugging the street, towers set back, kampung filling the block interior) rather than from a single density scalar whose peak kept landing inside the rejection radius; and the city dropped to TWO cross roads because 113-unit blocks cannot hold a tower once the corridors are cut. (3) **Paddies are axis-aligned rectangles that tile their block**, never rotated and jittered — the previous pass rotated each plot to the contour angle and overlapped them, which is what "berantakan" meant. Irregularity now comes from SIZE: block column widths vary, each block picks its own row/column count, terrace height is one value per BLOCK from the contour field, and bunds are the GAPS between plots over a single soil underlay. Batches carry a `role` (`road`/`building`/`vehicle`) because material alone cannot separate them — `cityAccent` is shared by tower bases and car bodies, `javaDry` by pavement and fallow plots, and vehicles are SUPPOSED to be on the asphalt. Smoke measures all three from the built mesh: zero buildings inside any road rectangle, farmland tiles at least double the built-up tiles, and paddies unrotated and non-overlapping.

**Stage 10's landscape is GENERATED, not laid out on a lattice — and it must reach the screen edge (2026-08-29, user request "terlalu rapi, jelek, gak kayak dunia nyata ... jangan terlalu terkotak-kotak" + "penuhi layar dari ujung kiri ke ujung kanan" + "TIDAK BOLEH JADI MEMPERBERAT GAME"):** every district was a `for row / for col` over fixed `xs`/`zs` arrays — 32 identical towers on an 8x4 grid, 28 identical paddies on a 7x4 grid — which is why it read as wallpaper; and its content stopped at x +-380 while the camera reaches **+-979** at 21:9, leaving over half the screen width as bare slab. Five rules. (1) **No fixed position arrays.** `jitterGrid(seed, halfX, sx, sz, fn)` walks a lattice whose row spacing DIVIDES `TILE_LENGTH` and jitters within the cell — the divisor is load-bearing, because tiles scroll and are re-dressed on wrap, so only a spacing that divides evenly stays seamless across the tile seam, and jitter under half a cell keeps row order intact. Content now spans `CONTENT_HALF_X` (1060), inside the 1100 slab edge. (2) **Form follows contour.** `contourAt(x,z,seed)` is a pseudo-elevation field whose z terms all pass through `sin` of the full tile angle, so it is EXACTLY periodic in `TILE_LENGTH`; `contourAngle` returns the contour line direction. Paddies terrace and rotate along it, plantation rows curve along it, land shade grades with it. From an exactly overhead camera real elevation reads ONLY as terracing, curved rows and shading — a height mesh would be invisible and pure cost. (3) **One trunk road ties the districts together**: `trunkRoadX(z)` is periodic in `TILE_LENGTH`, so the highway connects across a tile seam even when the district on the far side changes. Roads are POLYLINES (`queuePath`), each segment carrying its own yaw, so they bend instead of stepping. (4) **The rework had to be CHEAPER, and is**: roads, ground patches and boats that were solo meshes are now instanced (one InstancedMesh = one draw call at any count), and detail that cannot resolve from 900 units — eight fronds per oil palm, buttress roots per rainforest tree — was traded for MORE TREES, which can. Measured: terrain objects **486 -> 341**, root **10,857 -> 10,712**, `maxDistrictDrawNodes` **40 -> 26** (budget 48), while covering 2.8x the area. (5) **Terrace steps are 0.15, and that is depth precision, not taste** — at the 900-unit camera distance a 24-bit depth buffer resolves ~0.048, so the original 0.06 step sat on the flicker threshold. Neighbouring paddies on the SAME terrace stay exactly coplanar, which is stable (equal depth means a deterministic winner); only near-equal differences flicker. So: exactly equal, or clearly apart. Smoke measures coverage against a camera-DERIVED half-width (`flightCameraHalfX`, fed by the shared `S10_CAM_HEIGHT`), pins that placement never returns to a lattice (distinct yaw and x counts per district — the old grid had 8 x-values and 3 yaws), and fails if terrain draw nodes ever climb back.

**No Stage 10 LANDSCAPE may reach the flight path either, and an InstancedMesh hides its height from a naive probe (2026-08-29, user report "masih terjadi tumpukan yang salah ... buat agar pesawat player dan pesawat musuh tidak tertimpa object di bawahnya"):** the same-day surface-prop clamp covered ground installations and ships but NOT the terrain, and the terrain is where the real overlap was — city district towers measured **55.8** and the rainforest canopy **24.1** against `altitude` **28**, so aircraft genuinely flew through them. **The first probe reported the Java city as 8.7 and "nothing in the way" — that measurement was WRONG**: both districts are built with `instanceBatch`, and an InstancedMesh keeps every copy's transform in `instanceMatrix`, so a walk over `position`/`scale` reads an entire instanced city as the unit box it was built from. `instanceBatch` now RECORDS `userData.localTop` from the raw transform data (AABB-of-OBB, so a laid-down cylinder is not counted as tall as it is long) and `propTopHeight` prefers it — the number is therefore identical in the engine and in the headless harness. Three rules. (1) **Terrain shares the surface props' ONE ceiling**, `flightSurfaceCeiling()` = `altitude * ground.maxHeightFraction` (16.8), so raising `altitude` loosens installations, ships and landscape together. (2) **`compressAbove(groups, baseY, ceiling)` squashes only the mass ABOVE the ground contact — never the tile group.** Scaling a whole tile would shrink the sub-unit separations that keep coplanar surfaces apart: a road marking sits just **0.10** above its asphalt while the depth buffer resolves only ~**0.05** at the camera's 900-unit distance, so a blanket 0.28x scale would start z-fighting the road markings. Roads, kerbs, markings, podiums, cars, tree buttresses, shrubs and fallen logs are therefore untouched; only tower masses (above the podium, y 2) and trunks/canopies (above the trunk base, y 0.7) compress. (3) **The clamp is SELECTIVE and MEASURED** — a zone already under the ceiling keeps its authored height exactly (plantation 15.93, housing 15.21, coast 15.05 are unchanged), and only the two offenders land on 16.8. Gameplay is untouched: nothing reads terrain geometry. `stage10FlightWorldDebug().terrainHeight` reports per-zone tops; smoke pins that no zone reaches `altitude`, that terrain and surface props share one derived ceiling, that legal zones were not squashed, and that road markings kept their exact height.

**Opaque Stage 10 surfaces must not be flagged transparent (2026-08-29, user report that aircraft were being covered by BACKGROUND buildings):** this fixed a real render-order defect but was NOT the cause of the user's report — the height measurement quoted here originally was wrong, see the landscape rule above. The flag was leftover `transparent: true` on 15 fully opaque terrain/building materials (`java`, `wall`, `roof`, `pier`, `ocean`, `forest`, `slab`, …), a remnant of the biome CROSS-FADE that was deleted when biome transitions became real geography. With that flag and `opacity` 1 they still get pushed into the TRANSPARENT render pass, which runs after the opaque pass and is sorted per object back-to-front — which is exactly how a background building ends up drawn over an aircraft. The flag now belongs only to materials that actually declare `opacity < 1` (glass, surf, cloud, FX). Smoke fails on any opaque material still carrying it. This is also a small win: those meshes return to the cheaper opaque pass.

**No Stage 10 surface prop may reach the flight path (2026-08-29, user report "ada gedung yang terlalu tinggi sehingga pesawat musuh dan player jadi tertimpa dan menembus gedungnya"):** the readability pass scaled ground installations and surface ships by `ground.visualScale` (2.6) UNIFORMLY, which pushed their masts and towers to **30.2 (AA turret), 36.8 (tank), 28.7/30.8 (ships)** while every aircraft — player, enemy and boss — flies at `altitude` 28, so aircraft flew straight through them. The fix exploits the fact that Stage 10's camera is EXACTLY overhead: height barely reads while FOOTPRINT reads strongly, so `fitSurfaceProp` scales x/z by the full `visualScale` and clamps ONLY scale.y so the measured top stays under `altitude * ground.maxHeightFraction` (0.6 -> 16.8, i.e. 11.2 units of clearance). **Gameplay is untouched**: hit radii still derive from the footprint (`baseRadius * visualScale`), not from height. The top is MEASURED from the built mesh via `propTopHeight`, which uses the Y row of the Euler-XYZ rotation matrix (AABB-of-OBB) — a laid-down cylinder must not count as tall as it is long — so any future prop is clamped automatically instead of needing a typed height. Smoke measures every ground kind and both ship classes against the real `altitude` and checks the footprint survived.

**Stage 10 pools carry only the silhouette a slot can actually show (2026-08-29, follow-up optimisation after Stage 10's root measured as the largest in the game):** its world went **20,554 -> 10,825 objects (-47%)** with no visual or gameplay change, by removing three copies of the same mistake. (1) **Enemy slots are split by FAMILY** — an aircraft slot builds only `AIR_TYPES`, a ship slot only `SHIP_TYPES`; every slot used to carry all five plus the damage rig (251 objects x 52 slots = 13,052) although a slot shows one silhouette and a plane never becomes a ship. Now 6,247. (2) **A ground slot is ONE kind**, assigned round-robin from `GROUND_KINDS`, with the spawner falling back to another kind that still has a free slot rather than failing (2,948 -> 1,134). (3) **The coastline is ONE shared rig per direction, not one per tile** — the two biome boundaries sit 6,240 units apart while the six-tile window spans 2,040, so two coasts can never be in view at once; the rig is moved onto whichever tile currently holds a boundary and released when that tile wraps away (1,818 -> 486). **Pool capacity is DERIVED, never typed**: `airPoolSize` is `maxAircraftOnScreen * 2 + 4` because a slot stays occupied through its death animation, and `shipPoolSize` scales with `maxEnemies` — so raising a cap in config can never silently starve a wave. Smoke section 30b pins the specialisation, the derived capacities, the single coast rig pair and a ceiling on the total.

**Per-stage config files (2026-08-28, user request "pisahkan data di gameplay.json khusus untuk stage ini biar saya bisa edit sesuka hati"):** a stage may own its tuning file, listed in **`CONFIG_PARTS` in `core/config.js`** as `{ path, file }` — currently only `{ path: ['campaign','stage10'], file: 'config/stage10.json' }`. Five rules. (1) **`CONFIG_PARTS` is the ONLY mapping** — `loadConfig()` fetches each listed file and `mergeConfigParts()` grafts it at its `path`, and the smoke harness loads the same table, so runtime and tests cannot drift. (2) **The merge happens BEFORE `CFG_BASE` is frozen**, so `applyDifficulty` (which always recomputes CFG from `CFG_BASE`) keeps the split data — dropping it there would delete the whole stage on any difficulty change. (3) **No consumer knows about the split**: the data still lands at `CFG.campaign.stage10.*`, so every `CFG.<section>.<key>` reader is untouched and the config-driven-tests rule is unchanged. (4) **A missing part is a hard error**, not a silent default, in both the fetch and the post-merge presence check. (5) **Dialogue is NOT split** — spoken/cinematic script stays centralised in `gameplay.json` under `dialogue`, per the existing dialogue-source rule. Headless callers pass `globalThis.__GIBS_CONFIG_PARTS__` beside `__GIBS_CONFIG__`. Smoke section `0b` pins the separation, the exact graft, that editing only `config/stage10.json` changes what the stage reads, and that `applyDifficulty` preserves it.

**Stage 10's tuning file is FULLY INDEPENDENT of `gameplay.json` (2026-08-28, user request "bebaskan semua ketergantungan dari gameplay.json, buat agar stage10.json ini independent"):** no module under `stages/stage10/` may read any config path outside `campaign.stage10`. The last borrowed value was the machine gun's cadence (`weapons.rifle.fireDelayMs`), now `flight.machineGunDelaySec`; damage became `flight.machineGunDamage` earlier the same day, and removing the nose cannon dropped the reads of `weapons.launcher` and `grenade.killRadius`. Consequences worth knowing: retuning Major Gibran's on-foot weapons can no longer move Stage 10, and Stage 10 is likewise untouched by `applyDifficulty` (which scales robot classes and the other bosses, none of which this stage uses) — its difficulty is edited in its own file. Smoke guards it TWO ways: a SOURCE sweep that rejects any `CFG.<path>` in `flight.js`/`flightWorld.js` not beginning `campaign.stage10.`, and a MUTATION test that multiplies every value Stage 10 used to borrow (rifle damage/rate, launcher damage, upgrade percentage, max weapon level, grenade kill radius, player max HP) and requires the stage's per-round damage, round count, volley damage, fire delay and aircraft HP to be bit-identical afterwards.

**Stage 10 biomes are GEOGRAPHY, not a cross-fade (2026-08-28, user request "transisi antar biome jangan fade in fade out, buat agar benar-benar berpindah dari darat kemudian laut kemudian darat, terlihat pantai dan ujung daratan"; it replaced the same-day opacity cross-fade):** the biome of a terrain tile is a property of its WORLD POSITION, not of the clock. `biomeBoundaryZ()` converts the unchanged `biomes.javaEndSec`/`oceanEndSec` into two fixed route coordinates (`distance = seconds x scrollSpeed`), and `biomeAtZ(z)` answers for any point; `biomes.transitionSec` is deleted along with `setBiomeLayerOpacity`, `applyBiomeWeights` and the whole `biomeTransition` state. Four rules. (1) **A tile that CONTAINS a boundary is dressed as a real COASTLINE** — `buildCoastTile` prebuilds two variants per tile, `coastOut` (leaving Java for the sea, land on +z) and `coastIn` (making landfall in Kalimantan, land on -z), each carrying sea, shallows, surf, wet and dry sand, an inland decor row and a jetty. (2) **The waterline sits EXACTLY on the boundary coordinate**: `setCoastShoreline(group, shoreLocal)` slides the sand/surf/jetty and stretches the land slab to the tile edge, so the boundary can fall anywhere inside a tile without a single mesh being created at runtime; inland decor is anchored by distance from the waterline and hidden when the land is too short to hold it. (3) **A tile may only change its appearance when it WRAPS** — `dressTerrainTile` runs from `resetWorldPositions` and from the wrap branch of `updateTerrain` only, never per frame, so terrain never transforms in view (the Stage 5 journey rule). Smoke simulates 400 ticks across a boundary and requires zero on-screen changes. (4) **The coast tile's sea slab is deliberately lower and barely oversized**, so where it overlaps a neighbouring ocean tile the neighbour wins and no two coplanar surfaces z-fight. `biome` survives only as a read-out of the player's own position, feeding the spawn tables and the status line.

**Stage 10 follows AIR STRIKE 1944 (2026-08-28, user request with three reference screenshots; supersedes the earlier same-day five-aircraft/side-ingress rule and EVERY older Stage 10 port/forest/deployment rule below):** `stage10Scene` is one vertical shooter of `flight.durationSec` (360 s / 6 min since 2026-08-29, down from 480) under the single root/light key `campaign-10-flight`; both difficulty ramps normalise by `elapsed / durationSec` so they rescale themselves, the biome boundaries scaled by the same factor, and `(oceanEndSec - javaEndSec) * scrollSpeed` must stay above one tile cycle or the single shared coast rig per direction breaks (smoke-guarded via `stage10Debug().coastSeparation`); port/crane/fabricator/Green Firewall modules are dormant and must not be imported. Nine rules. (1) **The main gun is AUTO-FIRE and always straight forward** (`flight.autoFire`), never aimed at the cursor — the player steers, they do not aim. (2) **The gun is FLAT — there is NO weapon-level system** (2026-08-28, user: "tidak usah ada weapon levels, bikin damagenya tetap saja; terlalu berlebihan untuk dipakai hanya di 1 stage"; it replaced a five-step `weaponLevels` ladder built earlier the same day). The aircraft carries a MACHINE GUN AND NOTHING ELSE (2026-08-28, user: "buang meriam pesawat player, pesawat player hanya punya machine gun saja sekarang") — the nose cannons are hidden on the Stage 10 instance exactly like the landing gear and cargo ramp, their pool, material, config keys (`cannonSpeed`/`cannonLifeSec`/`cannonEvery`) and fire path are deleted, and with them Stage 10's reads of `CFG.weapons.launcher`/`CFG.grenade`; the cadence followed, so the stage now reads nothing outside its own file. Its voice is the shared tank burst clip `boss-tank/tank-machine-gun.mp3` (2026-08-29, user request), retriggered no faster than `MG_SFX_MIN_GAP` so a faster cadence stays a tight rattle instead of stacking copies of a 0.24 s clip. Damage per round is **`flight.machineGunDamage`, the aircraft gun's OWN number**, deliberately NOT derived from Assault Rifle level 3 because a shared derivation meant retuning Major Gibran's ground rifle silently retuned Stage 10; the pattern is fixed by `machineGunPairs` / `machineGunAngledPairs`. Nothing in the stage can raise it: the `power` drop type, `grantPower`, the star mesh and the `PWR` HUD readout are all deleted, and smoke mutation-tests BOTH halves — moving `weapons.rifle.damage` must not shift the aircraft gun at all, while moving `machineGunDamage` must. (3) **BOMB is the secondary (Space/RMB), not a second gun** — limited stock from `bomb.start`, capped at `bomb.max`, one press damages every enemy on screen AND erases every enemy bullet and missile. (4) **The player flies ALONE — there are no escort aircraft** (2026-08-28, user: "tidak usah ada pesawat escort yang join, player hanya boleh sendirian saja"; a two-slot wingman system built earlier the same day was removed entirely — config block, rigs, pickup type, drop mesh and materials all deleted, so nothing but the player's own aircraft ever fires a friendly round). (5) **Enemies arrive as FORMATIONS, not singly** — `FORMATIONS` (vee/echelon/line/column/arrow, shapes in code) spawns a whole wave at once from the top or a side; members fly in, HOLD and weave inside the real camera frame for `waves.dwellSec`, then withdraw. Only the wave LEADER may carry an upgrade (`waves.upgradeDropChance`), and it degrades bomb -> double money so it is never a dead pickup. (6) **Ground installations scroll up at the player** — pooled turret/tank/bunker/depot, land biomes only (the ocean leg uses surface ships instead), turret barrels track the aircraft as their telegraph. (7) **Enemy fire is a big round ORB with a halo**, matching the reference's readability, but keeps the project's sacred enemy-plasma BLUE — do not recolour it pink. (8) **Ramming any enemy aircraft hurts** and destroys the rammer. (9) **The mission ends on a BOSS, not on a timer** — at `durationSec` waves stop and a prebuilt four-engine bomber enters over `boss.entrySec`, sweeps, fires a turret spread plus missile bursts, enrages under `boss.enrageHpFrac`, and only after its full death animation does the 5 s clear hold open the normal Stage 11 gateway. `maxAircraftOnScreen` is 12 because a formation of up to seven must fit; ships still do not consume that quota. Player HP 1000, WASD movement, swept segment-circle hits and the derived screen-edge projectile lifetime are unchanged. `flight.js` owns runtime, `flightWorld.js` prebuilds every mesh/pool (terrain with villages, airstrips, islands and logging camps; formation aircraft; ground installations; the boss; two wingmen; orb bullets; power/bomb/wingman pickups; the bomb flash), and smoke `25c2` pins all of it.

**Stage 10: off-screen is UNTOUCHABLE, and projectiles die at the frame edge (2026-08-28, user report "pesawat musuh yang belum masuk ke layar sudah bisa ditembak jatuh ... buat agar tembakan player dan musuh akan terdestroy ketika keluar dari layar, agar tidak berat juga"):** the machine gun was never the cause — measured, its rounds die 18 units past the top edge while a wave spawns 30 units beyond it. The two real reaches were **area damage**: the cannon blast (`grenade.killRadius + 3.5` = 43.5) detonating at the edge reached 61 units off-screen, and the **bomb radius (900) is more than twice the screen half-depth (407)**, so it deleted waves that had not appeared. Three rules. (1) **`onFlightScreen(x, z, margin)` derived from the live camera frame is the single screen predicate** — never a hand-written bound. (2) **`areaDamage` requires the TARGET to be on screen**, so cannon splash and the bomb clear what the player can see and nothing queued beyond it; the bomb's config radius stays as its falloff, the frame is the hard limit. (3) **Every projectile pool — player rounds, cannon rounds, enemy orbs and missiles — is culled the moment it leaves the frame** (`flight.projectileCullMargin`, 8), which replaced a top-edge-only test that let sideways enemy fire live out its full 4 s lifetime off screen. Culling waits for `entered` (the projectile having been inside once) because ground turrets and descending aircraft legitimately fire from just outside the frame; `life` remains the backstop. Fixed along the way: `initEnemySlot` did not reset `armed`, so a pooled slot that had once been an unarmed formation member stayed silent forever and enemy fire quietly decayed over a long mission — a reused slot now always resets `armed` and `carriesUpgrade`. Smoke proves an enemy parked just past the top edge survives a bomb, that the same enemy inside the frame does not, and that stray projectiles vanish well before their configured lifetime.

**Stage 10 enemy-fire pressure is CAPPED, not just retuned (2026-08-28, user report "tembakan musuh terlalu banyak dan sangat sulit dihindari"):** lowering per-class cadence alone cannot bound a screen holding a dozen planes plus ground turrets, so five rules bound it directly, all under `flight.enemyFire` / `flight.waves`. (1) **`maxActiveRounds` (14) and `maxActiveMissiles` (4) are hard ceilings on LIVE projectiles** — a shot that would exceed them is refused, never queued. (2) **`minGapSec` (0.34) is a GLOBAL gap between any two enemy shots**, so twelve shooters produce one readable rhythm instead of a simultaneous wall; a boss volley passes `bypassGap` because its spread is ONE telegraphed attack, and it re-arms the gap afterwards. (3) **`waves.shooterFraction` (0.5) arms only every Nth formation member** — the rest fly as pure obstacles, which is what keeps a seven-plane wave from meaning seven gun barrels. (4) **Homing missiles steer only for `missileHomeSec` (1.4 s), then fly straight**, so they are dodged by moving rather than out-guessed, and they are now SHOOTABLE (`missileHp`, `missileHitRadius`) — they join `sweepTargets` and the cannon/bomb area damage, giving the player an active answer. (5) **Every aimed shot carries `aimJitterDeg` (4°)**; `enemyBulletSpeed` is Stage-10 config tuning and smoke must compare against the live config rather than pinning an obsolete speed. Measured over 70 s of live combat: pressure remains bounded by the live-round caps and global gap. Smoke `25c2` pins the ceilings on a live run (not on config alone), the armed fraction, the homing window and the missile shoot-down.

**Shared visuals are never resized for one stage — items AND enemy bullets (2026-08-29, two user reports: "item coin dan medkit di stage lain jadi ikut membesar" then "peluru dari robot juga ikut membesar di stage lain"):** `buildLootMesh`/`buildMedkitMesh` in `entities/drops.js` are used by EVERY campaign stage and Survival, whose cameras sit far closer than Stage 10's 900-unit overhead rig — so enlarging them to make Stage 10's pickups readable inflated the money chip and medkit in twelve other stages. Both are back to their authored sizes (chip r2.0 x 0.7, medkit 5 x 2.6 x 5 with a 3.6 x 0.5 x 1.2 cross) and pinned by smoke section 30. **Stage 10 owns a SEPARATE item entity** — `flightWorld.js`'s `buildDropSlot` builds its own geometry and materials and scales them with `flight.dropVisualScale`; smoke sweeps the two flight modules and fails if they ever import `entities/drops.js` or touch `LOOT_GEO`/`MEDKIT_MAT`. One improvement was kept from the oversized pass: `LOOT_HOVER` is now DERIVED as `LOOT_COIN_R + LOOT_BOB` instead of being typed, so a chip standing on its edge can never sink through the floor and any future radius change fixes its hover automatically. **The same mistake had been made to enemy fire**: `MAT.enemyBullet` / `GEO.bullet` back a robot bolt used by robots, turrets, the tank, Mahapatih and the gunship in every stage, and it had been inflated from a 1.05 uniform bolt to `3.2 x 7.0` plus a translucent glow child. `EB_BOLT` is back to `w/len 1.05` with the glow material and its `clearArray` exemption deleted; **Stage 10's enemy fire is its own `buildOrbSlot` pool**, and the source sweep now also rejects `makeEnemyBulletMesh`/`EB_BOLT`/`MAT.enemyBullet` inside the flight modules. Two things kept: the single `makeEnemyBulletMesh` factory (per-caller copies were how the size drifted apart in the first place), and the gunship's deliberately elongated MG tracer, whose `tracerW`/`tracerLen` now live in `EB_BOLT` so its documented >3:1 ratio and its length relative to the robot bolt are structural rather than typed.

**Stage 10 readable-size pass (2026-08-28, user report: item terlihat sangat kecil karena tergeletak di tanah, meriam darat dan rudal terlalu kecil untuk ditembak):** the camera sits 900 units up, so anything left at surface level reads far smaller than whatever is fighting at `flight.altitude`. Four rules. (1) **Every pickup FLIES** — `spawnDrop` ignores its caller's y and always uses `altitude`, so money/health/bomb dropped by a ground installation (y 0) or a ship (y ~1) sit at the same height as the aircraft; they are also drawn at `dropVisualScale` (2.2) with `dropPickupRadius` raised to 30 to match the larger silhouette. (2) **Ground installations and surface SHIPS share one `ground.visualScale` (2.6)**, because a ship is the ocean leg's version of the same surface target and had the identical defect. (3) **Their hit circles are DERIVED from the drawn model** — `baseRadius * visualScale`, published as `groundVisual.hitRadius` / `surfaceVisual.hitRadius` — and the per-type `radius` keys were DELETED from config so a resize can never leave the hitbox behind; the resulting radii (20.8–31.2 ground, 25.1/29.5 ships) now sit in the same family as the 26 of an enemy aircraft. Enlarged installations also get a placement retry so they never intersect. (4) **The homing missile is drawn at `MISSILE_LENGTH` (30) and its hit circle is DERIVED as `length * MISSILE_HIT_FRACTION` (0.4 → 12)**, replacing a config number that described an 18-unit circle around a 7-unit body — the Stage 8 rule again: the hitbox covers the drawn body and never exceeds it. It carries red hazard bands, marking it as the projectile that can be shot down. Fixed along the way: a full drop pool used to swallow new items silently, so a power star could fail to appear during heavy fighting; `spawnDrop` now recycles the oldest uncollected slot, following `spawnExplosion`. Smoke `25c2` measures every one of these against the real enemy-aircraft span, never against a typed number.

**Stage 10 flight spatial/transition rules (2026-08-28):** the outer player-aircraft scale is `flight.playerVisualScale` (0.55), independent of the preserved Stage 9 model, and all enemy-aircraft variants are normalized to `enemyAircraftScaleRatio` (0.82) of its visual span. Horizontal player limits derive each update from the render-camera FOV/aspect, expanded terrain bounds, aircraft half-span and `screenEdgePadding`, so the whole aircraft can reach both visible edges on resize; never restore the old fixed ±190 clamp. Smoke `25c2` pins scale ordering and both visible edges.

**Stage 9 Chapter 3 armed hero-aircraft redesign (2026-08-27, user request; size follow-up same day):** the player-boarded aircraft is an armed futuristic gunship, not the former round transport/rectangular-wing silhouette. `stage9/aircraft.js` preserves its world origin, ramp, gear, four shared turbofans and existing takeoff animation, while the inner rig uses a faceted armored fuselage, pointed nose/chin, panoramic canopy, cranked swept wings and twin canted tail fins. The COMPLETE inner rig is uniformly 25% smaller than its first armed revision (`TRANSPORT_SCALE` 3.4 → 2.55), including hull, wings, engines, weapons, ramp and gear; debug reports `scaleReduction:0.25`. It has exactly FOUR wing machine guns (two left + two right) and TWO larger forward nose cannons. In Stage 9 these are deliberately visual (`firingEnabled:false`); every weapon owns a stable named muzzle anchor under `userData.transport.weapons`, and Stage 10 now consumes those six anchors for flight combat. Smoke `25a` pins the scale, silhouette, per-side distribution, exact totals and six anchors.

**Field Shop cinematic manifest redesign (2026-08-27, user request):** the shared Survival/Campaign shop keeps its catalog, purchase, undo, replacement and confirmation behavior, but presentation is a restrained quartermaster manifest rather than a rounded-card dashboard. `shop.js` builds one purposeful hierarchy: `shopHeader` (`shopIdentity` + available-funds balance), a split `shopWorkspace` with `shopCatalog` on the left and persistent `shopDesc` decision rail on the right, then one footer action. Item rows have numeric indices, sharp edges and keyboard activation; selected/affordable/unavailable states use structure and a single amber action color instead of indiscriminate glow. `style.css` owns the opaque/blurred cinematic field, asymmetric cut panel, subtle entrance motion, compact-height and phone layouts, and `prefers-reduced-motion`. Do not add fake telemetry, decorative scanlines, pill controls, gradients on every item, or restore the old centered two-column card grid with its description underneath. Smoke pins the split landmarks, balance/header, detail rail, sharp silhouettes and reduced-motion path.

**Stage 10 destructible deployment + Chapter 2 safe-road pass (2026-08-27, user request):** both pooled fabricators are independently destructible after landing through `stage10SpawnDeploymentBulletHit`; their HP remains the one shared `spawnMachineHp()` value, and only player bullets (`damage`, never enemy `dmg`) may hurt them. Destroying a machine chars/detaches its prebuilt rig, cancels every not-yet-launched robot assigned to that hatch, but does not erase robots already scanning/ejecting or already alive; the other fabricator continues its own alternating allocation. The wreck energy-lifts away when the deployment settles. Chapter 2 begins on a newly extended service-road approach: `S10_FOREST_START_FORWARD` projects true forward progress, and `forest-0` is not even queued until the player advances `safeStartMeters` (20 m)—sideways/backward motion cannot trigger it and the segment contains no robot. Every forest target and both machine landing points go through a deterministic road-clear sweep after jitter/keep-out, requiring `stage10ForestWalk(..., 7)` and no blocker/trunk, so nothing can appear beyond the boundary fence. Background vegetation is denser and every trunk/crown candidate is rejected if it touches any walkable road sample. Smoke `25b`/`25c` pin destruction/cancellation, both bullet hooks, empty 20 m opening, forward-only trigger, in-fence spawns, and road-free trees.

**Stage 10 animated robot deployment (2026-08-26; visual overhaul 2026-08-27, user request):** every robot-producing event in both chapters must go through `stage10/spawnDeployment.js`; direct encounter-time calls to `spawnCampaignRobot` are forbidden. Each event deploys exactly **two** prebuilt/pool-owned fabricators through `beacon → drop → land → unfold → charge`: pulsing ground reticles and energy columns announce them, compact machines descend from `machineDropHeight` with spin/tilt, impact with dust/shake, and mechanically expand their frame/chamber/gantry/hatch/crown/turbines before printing. They must never simply rise through the floor. Robots alternate between both hatches and pass through visible `scan → assemble → eject` poses: holographic portal rings, a thin rotating scan silhouette, layered squash/stretch assembly, then a curved launch to the unchanged authored blocker-clear target. `machineBirth:true` holds Stage 10 AI and clamp inert until eject settles. Objective gates count deployments as pending, concurrent events queue, and machines energy-lift back out only after all births finish. All duration/height tuning comes from `CFG.campaign.stage10.spawnDeployment`; each chapter root prebuilds both rigs and all 16 FX meshes per machine, so runtime creates no machine/FX mesh, material, or light. Smoke `25b`/`25c` pin the two machines, beacon/drop/unfold phases, machine-before-robot ordering, three robot birth poses, exact totals and both chapters.

**Stage 9 Chapter 2 follows the user's edited CSV denah (2026-08-26, `stages(Stage9-Chapter2).csv`):** the map is a 33x54 grid of 20-unit cells over the terminal shell (`S9_INTERIOR_CELL`/`S9_INTERIOR_GRID`/`s9InteriorCellPos`, col 0 = west, row 0 = north), and three tokens now drive the world. (1) **`@` = obstacle** — 28 cells in four runs (`S9_INTERIOR_OBSTACLE_RUNS`) built through the SHARED barricade token (`barricadeBlocker` + `buildFurniturePile`, all eight recipes, deterministic hash), each cell a full-cell `standable:false` blocker welded as its own occluder. They seal the cafe/toilet shopfronts, run down to the security room's north wall, plug its east doorway, and split concourse from check-in across the lower half. **A run's end cell is EXTENDED to the wall face it abuts** (`sealEnd`, up to one cell): the 20-unit grid rounds a doorway's true span, and the security east door was left with exactly a player-width sliver the CSV did not show — smoke sweeps both barrier lines per unit at `player.radius`. (2) **`=` = breached wall** — three columns of two cells cut five amenity partitions (neighbouring shops have back-to-back walls, so one breach column splits two), each a 40-unit gap with the shared `/` jamb stubs and no blocker; `buildWallBreach` gained an optional `thickness` because Stage 9's partitions are 3 units, not a full cell. Toilet stall dividers are clipped out of a breach lane. **These breaches are the ONLY link between the check-in hall and the concourse** — smoke proves it by re-running the route BFS with them sealed and requiring the apron exit to become unreachable. (3) **`P` moved to cell (21,3)** — `S9_INTERIOR_CHECKPOINT` is now (312100, 475) at the north end of the check-in hall, still the `interiorCheckin` -> `interiorConcourse` gate that spawns the second wave. Reaching it forced one geometry fix: the check-in counter islands were 212 units long and ended 2 units from the terminal colonnade, so the hall's north strip was walled off; they are now 196 units (`islandHalf` 98), leaving an 18-unit circulation aisle. Chapter 2 also carries loot for the first time: `CFG.campaign.stage9.interiorLootBoxes` puts 15 crates in the baggage hall and 5 in each of the `V`/`R`/`C`/`W` amenity types (split between that type's north and south rooms), raising `lootboxCount` to 62. **Chapter 2 loot must be REACHABLE, not merely unblocked (2026-08-27, user report):** the first pass put the 15 baggage crates in the hollow centre of the reclaim carousel — free floor, but enclosed by the belt's four colliders, so the player could only look at them. Two layers fix it. (1) The baggage area is now FOUR bands derived from the belt zone itself (north/south/west/east of it) taken round-robin, so crates ring the carousel instead of filling one edge — never a single rect that swallows the hole. (2) `interiorReachable()` flood-fills the interior once from `S9_BUILDING_START` at `player.radius` and every interior crate candidate must land in that set, so any future enclosed pocket is rejected automatically. Smoke re-runs the flood and fails on a stranded crate, on any crate inside the belt ring, or if the four bands are not all used. **60 robots in the waiting hall + a real restroom (2026-08-27, user request):** `interiorConcourse` is now 38C/17B/5A = 60, and its spawn table is DERIVED from the seat grid rather than authored — `S9_SEAT_XS`/`S9_SEAT_ZS` are exported and `S9_SEAT_AISLE_XS`/`S9_SEAT_AISLE_ZS` are the midpoints between (and just outside) the seat banks, giving 45 points, so the whole wave stands among the seating instead of along the hall edge. The toilet rooms replaced three glass slabs and three white cylinders with a real restroom: a back row of partitioned cubicles carrying a pedestal/seat/cistern and an ajar stall door, a mirrored washbasin counter on one side wall, a divided urinal row on the other, plus bin and dryer. Everything hugs a wall so the centre lane and the `=` breach lane stay clear. It also gained the FRONT WALL and DOORWAY the room never had: two wall stubs and a header, with the shared two-leaf rig (`buildSplitDoor` + `setSplitDoorOpen(door, 1)`) mounted PERMANENTLY OPEN and never ticked — the door is visible but can never block. Two widths are derived, not typed: the opening is at least `player.radius * 4`, and it is capped at `usable / (2 * (0.5 + (1 - DOOR_OPEN_REVEAL) / 2))` so a fully open leaf stops inside the front wall instead of poking past the room's side partition. Smoke sweeps each doorway at the player radius and fails if it is ever blocked. **Every Chapter 2 venue is furnished, not blocked out (2026-08-27, user request):** souvenir shops, cafes, restaurants, the check-in islands, the security checkpoint, the self-check kiosks, the scanner posts and the baggage reclaim belt were all one or two boxes; each is now a real fixture set — wall shelving plus two-sided gondolas, a checkout desk and card carousels; a back bar with cup shelves, a glazed pastry case, an espresso machine and bar stools; a servery with warmer bays and a plate stack, pedestal tables with four chairs and a tray-return; per counter position an agent monitor, keyboard shelf and tag printer plus a bag-drop belt with rollers, a weigh plate and suitcases; a full-height detector arch with header and light bar, an X-RAY machine with roller beds and lead flaps, an operator console, an officer podium and tray stacks; kiosks with a passport scanner, boarding-pass and bag-tag slots and a card reader; and a belt with skirting, a feed hood, riding suitcases and a status pillar. **Six rules hold it together.** (1) **`stage9InteriorOverlaps()` is Chapter 2's version of the Chapter 1 parked-car rule** — every fixture collider is swept (SAT, 0.5-unit tolerance) against every other interior blocker, so no prop may ever stand inside a wall, a partition or another prop. (2) **A collider CENSUS (`layout.blockerKinds`) pins one blocker per drawn fixture family**, because counting meshes alone lets a prop keep its body and silently lose its collider. (3) **Shop aisle spacing is DERIVED, never typed** — the two gondolas are placed so the centre aisle and both side aisles come out equal, and a shop too narrow for that falls back to ONE gondola rather than sealing its own back wall; `layout.shopAisles` records the width and smoke fails below a player diameter. (4) **The `=` breach lane through the NORTH amenity row is still the only check-in -> concourse link**, so every optional fixture passes `clearsLane()` before it is built at all — a rejected fixture drops its count and the completeness assert catches it. (5) **Fixtures that hug an already-solid wall** (back shelving, servery, back bar, the chute inside the west belt collider) add silhouette without adding one unit of forbidden area, and the X-ray keeps the old tray table's EXACT footprint so the security side-wall opening is unchanged. (6) Seating — chairs, stools, benches — stays decor without colliders, the convention the old benches already used; placement uses a deterministic `ihash`, never `Math.random()`; zero new PointLights, PAL tokens only, and the menu/status screens are controls, not location signage.

**Stage 9 Chapter 1 parking-clearance and off-camera spawn pass (2026-08-25, user report):** three rules, all mutation-tested by smoke `25a`. (1) **No Chapter 1 vehicle may intersect anything it is parked beside.** Every `parked-car`/`abandoned-vehicle`/`airport-front-bus`/`airport-service-van` OBB is swept against every other Chapter 1 blocker (SAT) and against the undersides of the solar canopy slabs; `vehicleOverlaps` in `stage9WorldDebug()` must stay empty at a 0.5-unit tolerance. That found five real bugs: the north parking rows stuck through the perimeter fence at z=490, SUV roofs (2.2 m = 15.4 units) cut through canopy slabs whose underside sat at 14.25, one wreck straddled the west lot fence, another sat on a canopy column, and the outer service vans drove through a corner bus and two light masts. **Parking geometry is now DERIVED, not authored** — `S9_PARK_CAR_HALF_LEN` comes from `STAGE7_ROAD_VEHICLE_SPECS`, rows are `court.divider ± S9_PARK_ROW_OFFSET`, wheel stops are `± S9_PARK_WHEEL_STOP_OFFSET`, and `S9_PARK_CANOPY_CLEAR` (21 = 3 m) is the canopy's headroom, so moving a court can never silently push a bumper through a fence again. (2) **`CFG.campaign.stage9.spawnClearMeters` (15 m = 105 units) is a robot-free bubble around the player at the moment an encounter is born** — the opening used to place hostiles ~70 units in front of a player who had just gained control. (3) **No Stage 9 robot spawns inside the camera frustum.** `clearSpawnPoint` tests each candidate with `stage9RobotInView(..., SPAWN_VIEW_MARGIN)` (0.14, i.e. 14% outside the screen edge so a one-step camera drift cannot reveal a birth) and, when the authored point fails, sweeps rings outward **starting from the direction AWAY from the camera** so the robot stays as close to its encounter as the rule allows; a per-seed sub-step angle and radius jitter stop robots relocated from the same point from stacking. Both fallback tiers (relax the view test, then relax everything) exist so a spawn can never be lost. `stage9RuntimeDebug().spawnPlacement` records `inView`/`minPlayerDist` **at birth**, because the camera has moved by the time anything reads it back.

**Stage 9 Chapter 1 pursuit, parking loot and rural backdrop (2026-08-25, user request; supersedes older Chapter 1 frustum-activation wording):** both `frontToll` and `frontForecourt` spawn every robot with `active:true`; the opening cutscene freezes movement without resetting `state`, so all 72 Chapter 1 robots pursue immediately when play begins and the player never hunts offscreen stragglers. Only Chapter 2 retains idle spawn plus `stage9RobotInView`. `CFG.campaign.stage9.parkingLootBoxes` is exactly `{left:15,right:12}`, sums to `lootboxCount:27`, and deterministically places all crates inside `S9_FRONT_PARKING_LOTS` with clearance from static blockers. Chapter 1's background is real batched geometry—an ultrawide grass field, six meadow patches, and 100+ perimeter trees—blended into green `S9_EXTERIOR_ENV` haze, never the former plain blue.

**Stage 10 consolidation + final-stage renumber (2026-08-23, user request):** `stage10Scene` is the single `campaign-10` facade. Chapter 1 is the iron port (`stage10/port.js` + `portWorld.js`) and Chapter 2 is the Green Firewall (`forestRuntime.js`, `forestWorld.js`, `sensorGrid.js`). Chapter 1 finishes through `setStage10CompletionHook(enterStage10Chapter2)`, never `beginStageTransition` or `setScene`; the handoff preserves checkpoint 10, stage stats, loadout and active facade while switching the isolated root/light key from `campaign-10-port` to `campaign-10-forest`. Stage 9 transitions to Stage 10; only Chapter 2 finishes Stage 10 through the normal gateway to Stage 11. All port/forest robots are tagged `stage === 10`. The former Warden Stage 12 is now Stage 11 under `stages/stage11/`; the former Mahapatih/Monas Stage 13 is the final Stage 12 under `stages/stage12/`; `stages/stage13/` no longer exists. Versioned checkpoints accept 1–12; unversioned legacy values migrate 11→10, 12→11 and 13→12. Smoke `25`, `25b`, `25c`, `25d`, and `25e` pin the facade, handoff, roots/lights, checkpoint migration and final gateway. Never restore a finish screen or Field Shop between Stage 10's chapters.

**Stage 10 Chapter 1→2 handoff, forest terrain, opening safe area and boundary fence (2026-08-26, user report/request):** five rules, pinned by smoke `25b`/`25c`. (1) The port→forest handoff is **async behind the shared loading screen** — `enterStage10Chapter2()` returns a promise (`stage10ChapterHandoff()`, `null` when idle), pauses, and splits the disposal/enter/compile/warm work across `await loadingStep(...)` boundaries with a 900 ms minimum hold; pointer lock is never released, so no pause menu appears and play resumes without a click. Never move it back to a synchronous mid-frame swap — that was the reported lag/freeze. (2) `stage10ForestWalk`'s edge is marked by a **visible fence** built by marching-squares over the walkable predicate — purely a marker with **zero blockers/trunks**, and panels intersecting an existing blocker or trunk are skipped. (3) The service road, its shoulder and both drainage channels are **one mitered ribbon each with per-vertex widths**; per-segment boxes using `min(a.w,b.w)` are what produced the width steps and outer-bend notches. (4) Leaf directions go through `frondAngles(A, T)` → euler `(0, ry, rz)`, never `rotation.set(PI/2, a, …)` — with the XYZ order that made the azimuth an inner rotation, so every palm/tree-fern frond pointed at world +Z through its own trunk. All five species were rebuilt on the corrected mapping. (5) `CFG.campaign.stage10.chapter2.safeStartMeters` (20 m) is a **robot-free bubble at the Chapter 2 entry**: no spawn lands inside it (`spawnStage10ForestWave`'s `opts.keepOut` pushes each point out after jitter) and the opening `forest-0` wave spawns dormant until the player advances that distance.

**Stage 10 Chapter 1 defense-array/extraction fix (2026-08-25, user report):** cannon recoil is local displacement around `system.x`; never assign the turret's world `position.x` to zero, which makes the whole cannon disappear from the port. The three ordered servos have distinct traverse/elevation/relay silhouettes, and exactly the currently vulnerable one carries the pulsing halo/pointer. Hit shake/flash and collapse-to-wreck animations use prebuilt meshes; `updateDefenseArrayVisuals` must keep running after the final hit changes the phase to extraction. `S10_EXTRACT` is the blocker-clear boarding marker beside the carrier, not the carrier's solid center. Entering it starts departure immediately—there is no extraction hold/progress state or Stage 10 departure-minimum timer; the already-running cinematic ends after its radio line. Smoke `25b` pins all of these contracts.

**Stage 10 Chapter 1 container-opening expansion (2026-08-25, user request):** `S10_CONTAINER_APPROACH` makes START→safe bay exactly 1520 units, twice the former 760, by extending only the west container approach; warehouse/crane/pier authored transforms stay fixed. The added section carries 40+ container stacks and the opening cinematic begins over the new west start. `entry` + `yard` are a scoped exception to the older whole-stage density convention: their config mixes total 77 versus the previous 43 (~80% more), while Chapter 2 remains unchanged. Dormant port robots use `stage10RobotInView` as `campaignRobotAI.activate`, so the first frame their body enters the gameplay viewport permanently changes them to `chasing`; cinematics may freeze them but must not replace this with range activation. Chapter 1 has exactly 30 config-counted loot boxes across six or more tagged zones, all blocker-clear. Smoke `25b` pins length, connectivity, runtime populations, viewport activation, loot count/spread, and placement.

**Stage 10 Chapter 1 crane gate + supported lift (2026-08-25, user request; visual follow-up same day):** the crane safe bay is a real progression gate. Static container flanks cross the full playable width at x=329915 and leave one central player-width opening; moving container #3 occupies that opening in layout A, so a one-unit cross-section has zero valid player samples and BFS cannot reach the relay. Layout B pulls it straight west under its gantry, yielding a >player-diameter corridor and full safe-bay→extraction connectivity. Never restore the older contract that required layout A to reach forward objectives. The three RTGs occupy non-overlapping footprints and each container travels only 50 units on a local rail under its own gantry; no trolley may leave its frame. `syncLiftRig` keeps each trolley horizontally centered, its spreader one unit above the container top, and both cables extended through lift/travel/lower. Never share a trolley or pin trolley Z away from its load. Each static RTG and the QCC is an independent `weldOccluder`, while every moving trolley is a dynamic registered occluder, so any crane part covering at least half the player/robot fades through the shared configured opacity. Smoke `25b` checks A closed, B open, separated footprints, in-frame support at A/midpoint/B, and actual gantry fade.

**Every aircraft is a JET, through one shared ducted turbofan (2026-08-27, user request):** `campaign/utility/turbofan.js` `buildTurbofan()` serves Stage 9's parked airliners, Stage 9's hero transport and Stage 10's cargo aircraft. A jet differs from a propeller in one measurable way — the fan is caged inside the cowl — so `fanRadius` is derived from `cowlRadius` (`FAN_DUCT_RATIO`) inside the shared module and cannot be passed in. Nacelles face local +z; an x-axis fuselage wraps them in a `rotation.y = PI/2` group, and the fan spins on `rotation.z`. Stage 9's airliner also carries a swept wing/fin and mounts its pods ON TOP of the wing so the space under the wing (where the player walks between stands) stays clear. → [docs/campaign.md](docs/campaign.md)

**Stage 9 Chapter 3 airside is sized in METRES (2026-08-27, user request):** every Kertajati airside property goes through `am(meters)` (= `meters * CAMP_M`) — the old unit numbers made the apron bus 1.29 m tall (shorter than Major Gibran), the "airliners" 6.3 m long, the control tower 11 m and the fire-station bay doors 1.7 m. The size census is DERIVED from the colliders (`complexity.runway.propMeters`, plus `drawnMeters` for silhouettes that tower over their collider), so the scale test and "what is drawn is what blocks" are one test. `S9_STAND_XS` (five stands, 190-unit pitch) is the only source of parked-aircraft/jet-bridge/gate/lead-in geometry, so a stand can never be narrower than the 25 m wingspan drawn; the airliner is high-wing and its collider is only the fuselage, so the player walks under the wings. Jet bridges dock to the port forward door (`S9_BRIDGE_OFFSET`) on a real terminal pier instead of ending in mid-air. `stage9RunwayOverlaps()` forbids any airside prop intersecting another; all GSE parks on one lane per surface and the x≈300800 corridor to the fuel pump stays empty. Pavement markings are counted by `paint()` and fell from ~130 bars to 37 (one centreline per surface, one lead-in per stand, one hold-short per connector, one threshold per runway end), in amber `M.taxiLine`. The armed hero aircraft is a scaled inner rig (`TRANSPORT_SCALE` 2.55 after its requested 25% reduction), leaving every existing animation untouched. → [docs/campaign.md](docs/campaign.md), smoke `25a`.

**Stage 9 airside collision + interior backdrop fix (2026-08-25, user report):** Chapter 3's adjoining apron/service-yard/taxiway/connector/runway rectangles must overlap by more than the player's diameter after radius contraction. The apron/service-yard shared edge is represented by `apronServiceCore`; Taxiway B and all three connector surfaces use their widened visible geometry in `stage9RunwayWalkable`. Never return to edge-only seams: point/BFS tests can hop across them while real `slideWalk` stops at an invisible wall. Smoke `25a` samples the complete objective route at one-unit spacing. Chapter 2 always applies `S9_INTERIOR_ENV` (black background and black fog); Chapter 3 restores `S9_EXTERIOR_ENV` on entry.

**Stage 9 is THREE large, multi-zone sub-scenes (2026-08-20/21):** `stage9Scene` remains the single facade while `frontScene → interiorScene → runwayScene` switch through `enterStage9Sub`, preserving checkpoint, stats, loadout and dialogue. Each chapter owns a far-plane-isolated registered root/collider/nav/light set. Keep the authored scale and two encounter gates per chapter: ~1850×880 toll/frontage/parking/forecourt (`frontToll → frontForecourt`), ~700×1120 check-in/security/concourse/baggage terminal (`interiorCheckin → interiorConcourse`), and a >1000-unit apron/service-yard/taxiway route (`runwayApron → runwayAircraft`). Never collapse them, merge their six config encounter tables, or call `setScene` between chapters. **Chapter 1's frontage stays intentionally dense (500+ semantic props / 160+ occluders): large parking canopies, service vans, lot fences and utility cabinets supply silhouette; motorcycles, wheel stops, delineators and grates supply low detail. Every tall sight-line blocker uses `weldOccluder(S9_FRONT_KEY, ...)`; low merged props stay below the half-body fade threshold. Its 45 passenger cars reuse Stage 7's exact `FuturisticSedan`/`FuturisticSUV` models at `CAMP_M`; parked models run along the bay axis with local +X/front facing the central wheel-stop divider. Planter geometry and all five trees use planter-local coordinates, and every crown stays inside the box. **The entire non-enterable Chapter 1 perimeter is visible:** eleven authored boundary runs are split into ≤90-unit fence panels exactly on the walkable edge, and each panel's blocker/occluder shares its transform; do not move fence dressing beyond the collision boundary.** Chapters 1–2 carry 72 and 57 config-driven robots respectively; they spawn idle and `stage9RobotInView` is their activation predicate, so the first frame a body enters the camera frustum permanently changes it to `chasing`. Chapter 3 retains the physical fuel pump and takeoff; `index.js` owns the Stage 10 completion hook. → [docs/campaign.md](docs/campaign.md), smoke `25a`.

**Stage 1 & 2 performance pass (2026-08-13, user report "terasa agak berat"):** two measured fixes, both now rules for every stage. (1) **Every campaign stage world lives under ONE registered root and only the active stage's root is visible** — `registerCampaignWorldRoot` was extended from the late-campaign worlds to Stages 1-8 (and both Stage 6 chapters), and `setScene` derives the key from the scene id (`worldKeyFor`). All campaign worlds share one `THREE.Scene`, so without this the renderer walked and frustum-tested **~12,000 objects belonging to stages nobody was playing, every frame** (dominated by Stage 7's Bandung city, Stage 6's two floors and Stage 5's depot); an invisible root makes `projectObject` stop at the root, in both the main and the shadow pass. Two sub-rules: **room PointLights stay attached to `scene`, never to the root** (the visible light count picks the shader variant — that contract belongs to `setActiveStageLights`/`precompileStageLightSets`), and **a scene with no world of its own (Field Shop, hack/repair modal, menu) must LEAVE the roots alone** — `resumeScene` does not re-show anything, so hiding there would return the player to an invisible world. (2) **`makeBlockerIndex` (utils/collision.js) is the one shared blocker index**: `resolve`/`groundHeight` are called by the player *and* every robot (AI, clamp, separation) each frame, so sweeping 200+ static boxes was pure waste. Stage 1/2 adopted it and Stage 6 HQ's private copy was replaced by it — **measured 0.13/0.17 ms → 0.004 ms per 40-entity frame**. It is exact, not approximate: results are re-sorted into original list order and the query box carries a margin of the largest half-edge, because `resolveBlockers` moves the point as it goes. **Never tighten that margin to `min(hx,hz)`** — it was tried, and 3 of 20,000 probe points diverged. → [docs/campaign.md](docs/campaign.md#stage-1--2-performance-pass-2026-08-13)

**Late-campaign acceptance pass (2026-08-13; Stage 10 replacement 2026-08-28):** smoke sections `25`, `25a`, `25c2`, `25d`, and `25e` cover current Stages 9–12; the older `25b`/`25c` bodies are disabled historical port/forest coverage. Stage 11 ends through its facade: `stage11Scene.enter()` installs `setStage11CompletionHook(() => beginStageTransition(stage12Scene))`; the root chapter must never import Stage 12. Boss yaw stays on its group; telegraphed attacks freeze their pattern at telegraph time; every finish closes the radio panel; and every spawn/supply table is swept against its blockers. → [docs/campaign.md](docs/campaign.md#acceptance-pass--stages-913-2026-08-13-completing-the-plans-14-matrix)

**Enemy bullet door fix (2026-08-11):** `entities/robots.js` preflights every A/B robot shot through `activeScene.bulletBlocked()` at the muzzle and along body→muzzle before adding it to `enemyBullets`. This closes the spawn-frame gap that let robots pressed against closed Stage 5/6 doors fire from the far side of the door. Keep the normal per-frame sweep too.

**Robot no-path/line-of-fire update (2026-08-11):** campaign A/B robots use the stage bullet LOS predicate, path around walls or closed doors to obtain a clear shot, and never fall back to walking straight into an unreachable target. `navAim()` returns `reachable:false` when A* has no route; `campaignRobotAI()` then sets `navIdle` so the robot stays exactly in place while `animateRobotIdle()` continues. Closed leaves are dynamic A* obstacles through `doorsWalkable()`; repath continues and chase/aim resumes automatically when LOS or a route returns. The same no-path idle rule applies to melee campaign robots.

**Stage 5-12 location-sign removal (2026-08-11; extended 2026-08-13):** these stages contain no place-name, destination, wayfinding, gantry, terminal-name, airport-name, billboard, shop-name, or landmark-plaque boards. Keep gameplay floor markers, terminal screens, traffic signals, and door-status jamb lights; those are controls/status, not location signage. Locations are communicated through authored architecture and environment.

**Stage 6 HQ map revision (2026-08-11):** `hqWorld.js` uses the exact 50×50 HQ layout supplied by the user. `+` is the locked server-access door released by hacking `X`; `Y` is a no-robot-spawn safe area; and both 3×3 `M` machine blocks are in their new middle-floor positions. Keep the map, `HQ_LEGEND`, machine points, safe-area checks, and Stage 6 smoke census synchronized.

**Stage 6 HQ machine-hit ordering fix (2026-08-12):** deployed and wrecked `M` cells remain bullet-solid, but `hqScene.bulletBlocked()` must call shared `machineBulletHit()` before `hqSegHitsWall()`. Otherwise a fast shot crossing the narrow hit-radius margin and the 3×3 solid footprint in one frame is deleted as a wall hit without damaging the live machine. Keep the normal batch sweep for Arrival/previous-frame segments; launcher impact must still queue exactly one blast.

**Cutscene layout update (2026-08-10):** campaign-wide `prologue.js`, `prologueArt.js`, and `intro.js` remain in `src/scenes/campaign/cutscenes/`; Stage 4 controllers are in `cutscenes/stage4/`, and Stage 5 controllers are in `cutscenes/stage5/`. Stage facades own the imports from those canonical paths.

**Cutscene rate update (2026-08-10):** while `cinematicActive` is true, `core/cutsceneRate.js` caps cutscene simulation ticks and rendering at 24 FPS; ordinary gameplay remains uncapped.

**Door indicator update (2026-08-11):** Stage 5 station doors and both Stage 6 chapter door sets use `buildDoorSideLights()` from `campaign/utility/doors.js`, matching Stage 1's left/right jamb indicators; an accessible door is always green, while a locked/sealed door is always red; the old overhead door lamp is not used.

**Campaign door standard update (2026-08-11):** Stage 1 is the behavior standard for every active split door. `doorProximityTarget()` supplies the 2.5-cell front zone and `CFG.campaign.doors.closeDelaySec` linger; `updateDoorMotion()` supplies the 0.45 s exact-settle quadratic easing; `resolveDoors()` keeps the shared `open < 0.5` solid threshold; and every bullet hook must use `doorBlocksShot()`/`doorClampShot()` against the moving leaf footprints. Never restore a fixed whole-doorway shot blocker or a per-stage timing/threshold copy: robot A/B muzzle preflight plus the normal bullet sweep must both remain intact.

**Stage 1 layout revision (2026-08-12, user CSV `stages(Stage1).csv`):** `S1_MAP` still holds ONLY walls; every other legend token gets its own table so the grid BFS and no-double-wall invariants are untouched. `+` = broken door (`S1_DOORS { broken: true }` → pinned at `DOOR_BROKEN_AJAR` 0.14 at build, skipped by `updateStageDoors` so leaves never move and no SFX plays, and `setDoorLocked` refuses to unlock it; still solid to player, robots and bullets). `/` = wall breach (`S1_BREACHES`, plain floor + jagged jamb stubs, deliberately blocker-free). `*` = furniture pile (`S1_BARRICADES`, 29 cells, one full-cell non-standable blocker each, nav-baked, deterministic-hash dressing). `@`/`$` = `S1_TERMINAL_BANK` + `S1_ACCESS`. Stage 1 uses the shared stand-marker helpers with TWO markers, exactly one lit at a time, always matching the radar. The r26-28 lane past the barricade is the ONLY route to the whole lower floor — keep it free of large furniture.

**Stage 1 second pass (2026-08-12):** (1) the "destroy every robot first" gate is removed — `s1Phase` starts at `access`, `clear1` no longer exists, and the wave-1 garrison can be walked past; only `clear2` still requires a clear floor before the stairs accept you. (2) The `@` bank is hand-built geometry, not a renamed cupboard: per cell a plinthed cabinet pushed back to the wall with an open face (blade rows, vent louvres, status-LED column, lit screen), crown + cable trunk, and a dedicated operator station at the `$` row (tilted screen + keyboard shelf). Every part must stay inside cell 48 — the cell west of it is where the player stands — PAL tokens only, emissive ≤ `EMISSIVE_MAX`, zero PointLights, batched. (3) Barricade piles use eight recipes across different furniture types (crates, cupboards, desks, sofas, benches, planters, consoles, meeting tables, partitions, rubble), picked and rotated by a deterministic hash of the cell index.

**A locked/broken door must block the PLAYER too (2026-08-13, user report):** robots and bullets are stopped by `resolveDoors`/`doorsWalkable`/`doorClampShot`, but the player only if the scene's `playerCollide` calls `resolveDoors(doors, pos, player.radius, true)` (lockedOnly, so ordinary doors still never block). Stage 2 had no locked door until the CSV revision added a broken one, so its red door was walk-through. Any stage gaining its first `locked`/`broken` door must add that call; smoke drives `playerCollide` at every broken door in Stages 1-2.

**Robot density is ONE number per stage (2026-08-16, user request):** `CFG.campaign.stageN.robotCountMul` multiplies a stage's whole placed population — garrison, reinforcement waves, horde — without touching any spawn-point table: 1.5 (S1), 1.6 (S2), 1.3 (S3), 2 (S4), 1.5 (S5 station chapter), 2 (S6, both chapters); a stage without the key stays 1x. Read it only through `stageRobotMul`/`scaleRobotCount`/`scaleSpawnCounts` in `campaign/utility/common.js`. `scaleSpawnCounts` rounds CUMULATIVELY so the total is exactly `round(total x mul)` and each entry stays proportional — rounding entries individually inflates the total and rewrites an encounter's C/B/A mix. Spawn machines (a rate fenced by `machineMaxAlive`) and Stage 5's enemy consist (`ET_CARGO_CARS` is geometry) are deliberately excluded. Stage 6 needs it in exactly one place: `spawnEncounter` in `stage6/runtime.js`. Stage 4 cycles its class pattern with `k % n` so doubling does not dilute the A/B shooters.

**Stage 1's kill-switch opens every locked door (2026-08-16, user request):** a successful mainframe hack calls `overrideDoorLocks(doors)` (`campaign/utility/doors.js`), which clears `locked` AND `broken` on every still-shut door — including the two `+` doors `setDoorLocked` refuses to touch, which is the point: the jammed shortcuts open as the horde spawns. Clearing `broken` is enough because a broken door's `open` (`DOOR_BROKEN_AJAR`) already is its leaf pose. `buildStageDoors` records `baseLocked`/`baseBroken` and `stage1Scene.enter()` calls `resetDoorLocks(doors)`, so the override never survives into the next run.

**Every bullet has a 1 m area of damage (2026-08-16, user request):** a normal pistol/rifle/shotgun round that hits a robot also damages other robots within `CFG.weapons.splashRadiusMeters` (1 m = 7 units) of the impact point, read only through `bulletSplashRadius()` in `robots.js`; flat damage equal to the round's own `b.damage`. It is queued (`pendingSplash` -> `processPendingSplash`, drained beside `pendingBooms` after the robot loop) because killing a robot mid-loop splices the array being iterated. The direct victim is skipped, `z.invuln` and `blastBlocked` are honoured, launcher rounds keep their single explosion, and splash produces no mesh/light/SFX/coolant at all.

**Barricade/breach tokens are SHARED (2026-08-13):** `campaign/utility/barricade.js` owns `'*'` and `'/'` for every stage using the CSV legend — `barricadeBlocker()` (full-cell `standable:false` blocker, nav-baked), `buildFurniturePile()` (eight recipes, deterministic hash of the cell index) and `buildWallBreach()` (jagged jamb stubs, no blocker). Stages 1 and 2 both use it; never re-implement per stage.

**Stage 2 layout revision (2026-08-13, user CSV `stages(Stage2).csv`):** same legend as Stage 1; `S2_MAP` still holds only walls. `+` = the c6-7 r9 door is now broken; `/` = a breach at c38 r6 (supply → toilet); `*` = 53 cells (r9 c9-29, c42-43 r13-28); plus a new door at c8 r11-12. Routing: the c38 r6 breach is the ONLY way down from the upper floor, and the c40-41 lane is the ONLY path from the c39 r27-28 door — both must stay clear of furniture, as must the now 2-cell-tall r7-8 corridor — its c8-11 stretch is the ONLY exit from the start room, so the `meeting` table at c10 r7 was deleted (it sealed the player in). The Stage 1/2 clearance BFS in smoke now blocks `broken` doors (never plain `locked` ones), which is what missed that softlock.

**Promotional-art standard update (2026-08-11):** `assets/images/low-poly/decommission-day-cover-logo-distressed-gameplay-lowpoly.png` is the current landscape visual/style master; approved low-poly portrait, banner, and transparent-logo masters live beside it under `assets/images/low-poly/`. Future promotional raster art must use gameplay-matched low-detail procedural geometry, visibly low-segment round forms, large facets, matte Lambert-like broad-color materials, sparse large clutter, and no micro-greebles, dense textures, or glossy PBR detail. Root-level images are preserved sources/layout references only; read `docs/PROMOTIONAL-ART.md` before generation or editing.

Onboarding guide for AI agents (and humans) working on this repository. It condenses the
rules in [CLAUDE.md](CLAUDE.md) — on any conflict, **CLAUDE.md wins**; keep the two in sync.

## Repository overview

"Decommission Day" — a browser **top-down shooter** (Alien Shooter-style; pivoted from
FPS on 2026-07-11). Three.js r128, plain ES modules, **no build step, no npm dependencies,
no framework**. Two modes:

- **Survival** — round-based waves defending the Monas monument; a Field Shop opens
  between waves; score = shop currency. Detail: [docs/survival.md](docs/survival.md).
- **Campaign** — 12 linear stages (Jakarta offices → outdoor tank battle → depot/train journey and Bandung HQ → Pasupati/Cisumdawu → Kertajati airport → Stage 10 Java-Sea-Kalimantan air battle → IKN root transmitter/Warden → Monas/Mahapatih finale), an inter-stage shop through Stage 11, loot
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
  tank/gunship/Warden/Mahapatih bosses, gore, effects, drops/ammo/crates/barrels, helicopter, procedural train/scenery, enemy pickup and props.
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
- Every Campaign Stage 1-12 lives in `src/scenes/campaign/stages/stageN/index.js`; companion modules stay inside that stage folder.

## Documentation map — read on demand

| Working on… | Read |
| --- | --- |
| Any module, export, scene hook, config key, adding a stage | [MODULES.md](docs/MODULES.md) — the authoritative catalog |
| Campaign stages, cutscenes (incl. the text prologue), doors/lifts, minigames, shop, save | [docs/campaign.md](docs/campaign.md) |
| Campaign Stages 9–13, IKN boss, and final boss at Monas | [CAMPAIGN-STAGES-9-13-PLAN.md](docs/CAMPAIGN-STAGES-9-13-PLAN.md) — implemented blueprint and acceptance contract |
| Waves, field shop, Monas objective, wave events, scoring | [docs/survival.md](docs/survival.md) |
| Robots, weapons, gore, loot/barrels/crates, armor, movement/dodge/stamina, collision | [docs/combat.md](docs/combat.md) |
| Camera rig, avatar, death sequence, HUD, menus, input/pause/cheats, SFX & music | [docs/presentation.md](docs/presentation.md) |
| Generated covers, banners, store capsules, promotional image identity and QA | [docs/PROMOTIONAL-ART.md](docs/PROMOTIONAL-ART.md) — read before generating promotional raster art |
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

- **Occlusion fade is ONE shared system at 20%, on a HALF-BODY threshold, walls included**
  (2026-08-13/14, user requests): `campaign/utility/occlusion.js` owns every occluder in
  Stages 1-12 and `CFG.campaign.occlusion.opacity` (0.2) is the only fade value. A prop fades
  only when it hides ≥ `coverFraction` (0.5) of the character — the entity→camera ray is
  intersected with the prop footprint (slab test, never distance-to-centre) and both the player
  pivot **and** nearby robots are swept. `registerOccluder` clones the prop's materials (a shared
  `M.*` instance would fade the whole batch); a prop that must fade uses `weldOccluder` instead of
  `addMergedStatic`. WALLS fade through `campaign/utility/wallFade.js`, which swaps a `#` cell out
  of its InstancedMesh for a pooled proxy; the show/hide matrix must be `identity()`-ed before
  reuse or the cell never returns. Stage 8 registers none because only its +z band can
  occlude and its tops stay below the eye-to-player sight line. → [docs/campaign.md](docs/campaign.md)
- **No mid-game shader recompiles**: fixed FX pools, constant PointLight counts, every
  lazily-revealed mesh added to `core/preload.js` warm-up.
- **Art style "GIBS 2045"** (`src/world/palette.js`): PAL tokens only, no neon
  cyan/magenta, environment emissive ≤ 0.9 — enforced by smoke material sweeps.
- **The player has TWO collision radii** (2026-08-11, user request): `CFG.player.propRadius` 3.5
  (`propClearance()`) is used only for indoor FURNITURE in Stages 1-3; walls, doors, crates and
  barrels keep `player.radius` 5. Never merge them — `player.radius` is also the robot-reach
  reference (`reachForScale` = exactly 1.0 at radius 5) and is shared with Survival.
- **Robots are DARK machines in a TIERED METAL palette** (2026-08-11, two user requests —
  the old colors "looked like a clown", then green/yellow/red became metal tiers):
  `CLASS_LOOK` (exported from `robots.js`) is **C dark BRONZE / B dark SILVER / A dark GOLD**;
  the frame is `PAL.gunmetal` instead of the bright `PAL.steel`; the emissive core is a vivid
  version of the same metal because it carries class identity once the plates are dark;
  `EYE_RED` and the boss plate are untouched. Silver has no hue — its identity is being
  LIGHTER than both the other plates and the frame, so never darken B "to match". No robot
  surface may exceed HSL lightness 0.35.
- **All user-facing UI text is ENGLISH** (permanent user rule); code comments are
  Indonesian.
- **Stage 1–3 room lights are ALWAYS ON** (2026-08-11, user request): the "lights-out"
  mechanic is gone — every room PointLight is built at full intensity and never animated,
  with no `on`/`k` state, no `lm.doors` link, no black room `shroud`, and no central-hall
  flicker (`updateRoomLamps`/`resetRoomLamps` and `setS1FlickerLight` are deleted). The
  `sNLamps` lists survive only as room-rect data; the light count is unchanged.
- **Every spoken-dialogue box uses a character-by-character typewriter reveal**;
  speaker labels may appear immediately, while speed and full-text hold are config-driven.
  Narration captions and short HUD/status messages are not dialogue boxes.
- **Stage 5-6 minigames are a separate interaction set** (2026-08-09): Stage 5 C1
  and the Stage 6 `I` terminal use `signalTraceMinigame.js` (SIGNAL TRACE), never
  ICE BREACH/progress bars. Stage 5 C2 and all three Stage 6 generators run exactly
  `ADVANCED_REPAIR_PARTS`: PHASE SYNC then ROTOR KICKSTART, preserving the completed-board
  index after abort. PHASE SYNC (2026-08-19 user request, replaced FAULT ISOLATION as "terlalu
  rumit") is an oscilloscope: slide each phase trim until its wave lies on the bus reference and
  the scope collapses to one line. Its ONLY difficulty is COUPLING — moving one slider drags the
  others a fraction of the same distance. No hidden information and nothing to read; every
  readout and lamp derives from one quantity (`syncError`) so the panel cannot lie, and
  `syncCoupling` is CLAMPED below the diagonal-dominance bound `(n-1)*c < 1` so no config retune
  can make a board unsolvable. A mistimed ignition only costs rotor RPM. The Stage 6 HQ upload
  remains a story cutscene.
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
  a LEFT-aligned main menu, a mode-select screen built from the SAME left column, a segmented Settings
  console, which Credits now mirrors (one `role -> name` row per credit; licence attributions
  folded into the name line must stay). NEVER re-add the red radial gradient, rounded pill buttons,
  emoji mode icons, or the centred stack. `difficultyNote()` quotes `CFG.difficulty`, and the
  old DOM contract (button ids, `.qbtn[data-q]`, `.dbtn[data-d]`, `.modeCard[data-mode]`,
  `#creditsBody`, `#continuePrompt`) is unchanged. The Main Menu's visible title uses
  `assets/images/low-poly/decommission-day-logo-distressed-transparent.png`; equivalent H1 text stays
  visually hidden for semantics.
- THINNED OUT 2026-08-10 (same complaint, second pass). The thing that reads as machine-made
  is DENSITY, not the design language: the first pass carried nine pieces of fake telemetry,
  a hint line under EVERY menu entry ("Exit Game — stand down and close the terminal"), six
  registers of text per mode card, CRT scanlines, hazard stripes and eleven near-identical
  micro-label styles. Also banned now: status/telemetry rails, per-entry hint lines, entry
  numbers, mission-dossier card chrome (op code, spec table, DEPLOY footer, stripe), CRT
  scanlines, and any new one-off micro-label size.
  A menu entry is ONE WORD; every small label uses the one shared 10.5px/0.28em rule.
  Smoke pins all of these absences.
- MODE SELECT = MAIN MENU 2026-08-21 (user: "minimalis seperti main menu dengan teks yang
  seperlunya saja"). One left-aligned column over the same blurred skyline: small `.msMark`
  logotype (no longer absolutely positioned in the corner), difficulty row, two mode NAMES
  shaped like `.navRow`, Back. Deleted: the bordered card + hover lift, `.mcSub`, the
  per-mode sentence, the "Select an operation" subtitle and `.subtitle` from the shared
  micro-label rule. The difficulty row STAYS (it is a control, and `#diffNote` quotes CFG).
  Same-day follow-up (user: "berikan sedikit, hanya sedikit saja deskripsi setiap mode,
  taruh di bawah tombolnya"): each entry gets ONE short dim line under its name
  (`.mcNote`, inside the same clickable row, smoke-capped at 10 words) — one line, not a
  return of `.mcSub` + paragraph. Markup/CSS only — every JS contract is untouched.
- BOOT: the Three.js CDN scripts are `defer` (as plain classic scripts they BLOCK rendering)
  and `#bootScreen` is visible straight from CSS — never gate the first-paint splash behind
  JS, since waiting for JS is exactly the delay it hides. `boot()` reveals the menu only
  after config + `initMenu` + `fontsReady()` + one real paint frame. → docs/presentation.md
- The main menu backdrop is the BLURRED city parallax and NOTHING ELSE (2026-08-10 user
  request): `filter: blur()` 3/4.5/6 px near→far, layers hung 14 px below the viewport so
  the blur's soft edge falls off-screen. A foreground scene of Major Gibran on the GRD
  LTV-45 was built twice that day — once as hand-drawn SVG, once as a live WebGL stage —
  and BOTH were rejected; `menuStage.js` plus the menu-only rig helpers are deleted and
  smoke asserts they stay gone. The boot screen contains no game title and shares its
  progress-bar styling with the in-game loading screen. → docs/presentation.md
- THIRD PASS, same day, same complaint. Also gone, and not to be restored: the
  `NUSANTARA 2045` tagline on BOTH title lockups (`.titleTag`/`.titleRule` deleted), the
  mode-card schematics (`modeArtSvg` and every `.ma*` class DELETED from menuArt.js/CSS —
  cards are text only), the amber left rib on menu entries, the `.panelHead` underline and
  the `DISPLAY`/`AUDIO` filler hairlines. The build stamp reads `BUILD DEV.01`.
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
- Stage 5 station TRACK BED + PERIMETER FENCE (2026-08-11 user request). `buildTrackBed` in
  `stage5/props.js` lays ground/asphalt/rails/sleepers for both tracks past BOTH ends of the CSV
  map: the east run-out apron (`departureShiftUnits + 120`) and a 100 m west lead
  (`WEST_LEAD_METERS × CAMP_M`), because rails only to the east made the west side read as the
  edge of the world. No buffer stop at the west end — the enemy consist enters from there. The
  same function raises an iron perimeter fence along the NORTH edge of the track band, spanning
  the full west-lead-to-east-apron run. It is PURE DECOR: zero blockers, zero nav cells, zero
  PointLights (track cells are already rejected by the walk tests), and it stands inside the
  cityscape's clear corridor so the fence, not a building, separates the rails from the skyline.
- Every campaign door is the one shared two-leaf rig in `campaign/utility/doors.js`
  (`buildSplitDoor` / `setSplitDoorOpen` / `splitDoorLeafOffset`) — stage 1-3 doors, stage 3's
  blast and exit doors, stage 5 station doors, both stage 6 chapters. No stage computes its own
  leaf offset. Leaf travel is `leafSpan × (1 − DOOR_OPEN_REVEAL)` with `DOOR_OPEN_REVEAL` = 0.1
  (2026-08-08 user request), so a fully open door keeps 10% of each leaf visible instead of
  vanishing into the wall; the effective gap is 10% narrower on purpose. Stage 1 is the behavior
  standard: every active door uses `doorProximityTarget()` (2.5-cell front zone + configured close
  linger), `updateDoorMotion()` (0.45 s exact-settle quadratic easing), `resolveDoors()` (`open <
  0.5` solid threshold), and the same moving-leaf shot sweep/clamp. The visible leaf footprint
  and bullet blocker therefore stay synchronized in Stage 1, Stage 5, and both Stage 6 chapters.
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
  Stage 5 station doors, and both Stage 6 chapters; every active door's bullet sweep follows the
  two moving leaf footprints. Broken/jammed doors and road bollards remain static barriers.
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
- VISIBILITY DECIDES COLLISION, in both directions (2026-08-08 report; revised 2026-08-09,
  and again 2026-08-13). A drawn rig blocks; a rig that is not drawn drops its collider.
  Because the wreck is now drawn, Stages 3, 5, 6 and 7 all KEEP the collider (and Stage 6's
  `M` cells) after death. Two pre-deploy hidden cases exist: Stage 6 HQ before lockdown, where
  `setMachineSolid(m,false)` splices the blocker and opens the `M` cells (`openMachineCells`)
  until `deployMachine` puts them back; and Stage 3 before the blast door opens, where the
  machine is not hidden but SUNK below the opaque floor (`MACHINE_SINK`) with its blocker
  spliced until the `rise` act. Nav is NEVER rebaked in any case.
- "ITEM LOOTING" — ONE term, ONE radius, ONE flight animation (2026-08-13 user request).
  Money chips, ammo packs and medkits are all called item looting; there is exactly one
  pickup radius, `CFG.drops.lootPickupMeters` (3 m), read only through `lootPickupRadius()`
  in drops.js. It replaced the money-only `lootPickupRadius` (9 raw units) and the hardcoded
  `player.radius + 2` used by ammo/medkit — NEVER split it back per item type. On claim the
  mesh goes to `beginLootFlight` instead of `scene.remove`: it arcs up then whips into the
  player's chest, spinning and shrinking, over `LOOT_FLY_SEC` (0.26 s, exported); the target
  is re-read each frame so it chases a moving player, and `resetGame` calls
  `resetLootFlights()`. This is NOT the magnet removed on 2026-07-27 — do not conflate them
  and do not delete the animation because "the magnet was removed". The magnet pulled items
  in BEFORE they were claimed (a gameplay change); here the claim and all its effects still
  fire exactly when the player enters the radius, an item outside it stays perfectly still,
  and only a gameplay-meaningless mesh flies. The flight borrows the drop's existing mesh, so
  looting allocates nothing and cannot force a shader recompile.
- STAGE 3, 2026-08-13 (user request): only `CFG.campaign.stage3.hackRequired` (3) of the five
  physical terminals must be hacked — `enter()` shuffles all five then SLICES to that count, so
  which terminals are wanted and their order both change per run and the two left out stay red;
  every message/HUD/board title reads `s3HackOrder.length`, and the last hack opens the blast
  door on that same frame. Four machines became TWO, and they are not in the factory hall until
  the door opens: `stages/stage3/machineDeploy.js` runs a five-act reveal (`warn` → `hatch` →
  `rise` → `lock` → `online`, second machine lagging `staggerSec`, durations in
  `CFG.campaign.stage3.machineDeploy`). Nothing is ever `visible=false` — the machine, hatch
  leaves and clamps are SUNK below the opaque floor, so materials are drawn from frame one and
  no shader recompiles at reveal; zero meshes/materials/PointLights are created while it runs
  (one bay PointLight per machine exists from world build at intensity 0, registered to
  `campaign-3`); and because the machine collider is a SQUARE ±14 that the player may stand
  against, anything outside ±14 stays curb height and the clamps stand on the diagonals. The
  camera is deliberately NOT taken over (the player is usually mid-fight elsewhere) — drama is
  distance-scaled shake/SFX. A deploying machine cannot be shot and cannot produce; `hudStatus`
  announces the arm window.
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
  the only switch path. Arrival -> HQ switches on the trigger frame with no handoff dialogue,
  cutscene, input freeze, or fade; queued Arrival dialogue is flushed before HQ enters.
  Both worlds register lamps under the single lightsKey 'campaign-6' and stay lit together,
  because toggling per chapter would change the point-light count mid-stage.
- Stage 5/6 wall shells use `campaign/utility/wallDetail.js`: exposed faces receive batched inset panels, plinths, seams, ribs and deterministic service accents. Stage 5 freight furniture and both Stage 6 chapters keep their added structural dressing; these meshes are visual/static-batched and must not change map/nav footprints.
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
  @ chapter door, K key rack, I plain floor (its hackable terminal was removed
  2026-08-12 — the generator room opens only with the rack key), G generator,
  H repair point, F finish.
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
- Stage 7 is permanently night, using the `midnight` light preset plus a deep night haze
  (2026-08-10, user: "still too bright"). The haze colour, not the lamp intensity, is what decides
  how bright an outdoor stage looks, so `enterCityEnv` takes background/fog overrides and light
  presets carry colours that default to the base values so other presets restore them. Dual-arm
  street lamps branch over both carriageways from the median every 50 m, with exactly 14 fixed
  registered PointLights — 30 m range, so each pole is a pool of light that covers the deck but
  stops before the city — and emissive-only heads on the remaining poles.
- Destroying the third Stage 7 spawn machine kills every Stage 7 robot on the same frame: on-screen
  ones through the normal explosion death (gore + loot), off-screen ones removed outright, both counted
  as kills. Setting `hp = 0` does not kill a robot — `hp <= 0` is only evaluated in the bullet-hit path.
- Every FX that sits on the ground offsets by `effects.sceneGroundY(x, z, feetY)` (the one door onto
  `activeScene.groundHeight`) instead of a hardcoded y: explosion shockwave/flash, settling coolant
  spray, coolant decals. Floors are not always y=0 — Stage 7's deck descends 12 m. Resolve the height
  once per burst, and pass it in when the caller already knows the surface (corpse/gib `restY`).
- The Stage 7 world continues `flyover.beyondTollMeters` (150 m) past the Pasteur gate — road, markings,
  rails, exit islands, a bare gantry frame, decor lamps, stalled cars and city ground — so no world edge is ever
  visible; the outro cutscene's camera follows the vehicle through the gate, so it is genuinely seen. The
  player lock is unchanged: `stage7Walk` still ends at meter 1500 and the continuation adds zero blockers,
  with its lamps kept out of `lampSpecs` so the 14 PointLights stay on the played route.
- Stage 7's ground backdrop is central Bandung (`stage7/stage7City.js`): ruko, kampung houses, markets,
  schools, parks, mid-rise blocks, an alun-alun with a domed mosque and minarets, Braga art-deco
  rows and Gedung Sate at meter 700. It is pure decor (no blockers, nav cells or PointLights). It
  is a top-down game, so the backdrop is GROUND, not sky: the top of the screen is the farthest
  ground and the height budget shrinks with depth, so nothing is built beyond |z| ~700, there is no
  distant skyline or mountain ridge, and the camera-side (+z) row is shallow with tops kept below
  the deck surface so it can never occlude the player. Layout is a deterministic hash (never
  `Math.random()`, since it is built during loading with the other campaign worlds) and is welded
  per 125 m chunk, so the guarded number is the draw-group count, not the raw mesh count. At meter 700, the 26 m tapered/split concrete-red pylon carries a compact official
  name plaque and exactly 10 large cylindrical white stays, split five ahead and five behind; every
  deck anchor remains on the median centerline, never at a carriageway edge. Its base is solid but
  both sides remain traversable. The camera eases
  up/out within 110 m without changing aim, movement, collision or the logic pivot.
  Deterministic defaults place sixteen nine-car gate bands plus 96 scattered vehicles (240 total) and
  250 initial robots. **Stage 7 has no road holes or craters**: the former pothole config, layout export,
  collision rejection, cut-asphalt geometry and crater props were deleted because the dense traffic
  already provides the maze. Gate bands use sedan/SUV; scattered traffic
  also includes container trucks, dump trucks, buses, tanker trucks and open-bed pickups in both route
  halves. `stage7/roadVehicles.js` owns their low-poly rigs and matching real-scale oriented footprints;
  placement keeps every vehicle clear of every other vehicle. All vehicles are solid/nav/bullet blockers.
  The road surface is exactly three continuous profile slabs: upper deck, descent and lower plaza.
  For runtime performance, abandoned-vehicle geometry is welded per 125 m chunk so offscreen traffic
  frustum-culls, while the static blocker list is indexed in 50 m X bins for player/robot collision,
  bullet sweeps and LOS; never restore one route-wide vehicle batch or full-list blocker scans.
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
  in the median. Defaults place eight supplies, 90
  crates and 180 barrels; cars, crates and barrels must span every longitudinal route-coverage bin,
  and Stage 7's three-value `clampDropPos` result carries road elevation so
  supplies, crate contents and robot loot remain above the slope/lower plaza. Fixed
  96/24/20/12 rain/ripple/spark/exhaust pools remain allocation-stable.
  There is no boss/miniboss/tank/boss HUD/score/music, and the green complete screen opens Field
  Shop before Stage 8.
- Stage 8's background is a two-act landscape pool (`stage8/scenery.js`, 2026-08-17 user request):
  KOTA BANDUNG at the start, PERSAWAHAN JAWA BARAT from `CFG.campaign.stage8.scenery.riceAfterFraction`
  (0.65 of `pickupsDestroyed / groundPickupTarget`) onward, and unconditionally rice from `bossApproach`
  through the gunship duel and arrival. Every module carries BOTH landscapes and only toggles `visible`
  (no mid-game allocation); a module may change act only while off screen (wrap or `relayoutAhead`
  beyond `S8_SCENERY_AHEAD`), dithered on near/mid and never on the far horizon. Four pools at
  parallax 1.0/1.0/0.62/0.34, deterministic hash layout, welded, pure decor — zero blockers, nav cells
  and PointLights. It also supplied the ground that used to be missing outside the shoulder.
- Stage 8 has a SECOND enemy type, the N.U.S.A. VULTURE-B barrel hauler (`stage8/barrelDropper.js`,
  2026-08-17 user request): one per `barrelDropper.everyPickups` (5) robot carriers that SPAWN, always
  entering from the FRONT outside `groundViewExtents`, holding `leadOffset` ahead, chasing the player's
  lane and releasing a barrel only once aligned, snapped to the lane centre. Dropped barrels join the
  shared `barrels` array (inheriting the swept bullet test, `detonateBarrel`, chains and damage) with
  their own `barrelHp` 150 and pooled meshes; they detonate ONLY if the lane still matches, so a dodged
  barrel rolls past inertly. Truck HP 230 with its own swept bullet test; cleared when the gunship
  intro starts; zero PointLights.
- The hauler's arrival announces itself and nothing else does (2026-08-19 user request): the two radio
  lines and the tutorial banner that fired on the first hauler are deleted, script entries included. The
  truck already telegraphs itself three times (front entry, slide into your lane, tailgate opening).
  Smoke fails if a hauler spawn queues dialogue or a hauler-themed `showStageMsg` returns.
- Hauler tailgate = ONE FULL CYCLE PER BAREL (2026-08-18 user request): open -> HOLD while the drum rolls
  down off the lip -> close. The barrel is born at the mesh `dropAnchor` (the lip itself), airborne and
  half-upright, and lies flat exactly as it lands (`dropFallSec`). So
  `dropTelegraphSec + dropFallSec + dropCloseSec` MUST fit inside `dropGapSec` (smoke-asserted).
- The GRD LTV-45's FRONT AXLE steers (2026-08-19 user request). Wheels bake the axle into the geometry, so
  `rotation.z` rolls and `rotation.y` steers (Euler XYZ composes Ry*Rz = spin-then-yaw, exactly a steered
  wheel). The angle is derived: `atan2(lateralVel, roadSpeed)` is the true heading, and the body yaw is
  SUBTRACTED because the wheels are children of an already-yawed group. Hubs steer with their tyres.
  `STEER_MAX` and the steering lag belong to the vehicle module, the kinematics to the scene.
- A pivot carried by a vehicle is never a walk cycle, and a swerve THROWS the rider (2026-08-19 user
  request): Stage 8 calls `setAvatarCarried(true)` for the whole ride (avatar gait comes from pivot
  displacement, and free steering moves the pivot sideways), plus
  `setAvatarVehicleLean(normalisedLateralAccel)` which rolls/shifts the avatar OPPOSITE the vehicle's
  acceleration on a lightly overshooting spring. It is fed ACCELERATION, never velocity — a steady
  sideways speed lets him settle upright; starting and stopping the swerve is what throws him. Applied
  last in the frame on `avatarGroup.rotation.x`. Manning a vehicle also blocks the AFK idle poses.
  Amplitude is CAGED by the hatch: `setAvatarVehicleLeanCage(vehicle.hatchHalfZ)` clamps the shift to a
  fraction of the roof opening's own half-width, so retuning the feel constants can never throw the
  gunner out of the hole (2026-08-19 follow-up; peak 0.79 units against a 3.29-unit half-opening).
- A hauler ARMS WHILE IT FLIES IN (2026-08-19 user report): `armSec` and the tailgate telegraph run during
  the `approach` phase, so the first barrel drops the moment it parks (1.3s -> 0.1s of dead time). It still
  drops nothing during approach. The "arrived" threshold is also now a fraction of the truck's own length
  instead of 6 units, because the approach eases exponentially and it looked parked long before the code
  agreed. Any exponential approach needs its arrival threshold scaled to the object, not a small constant.
- Boss duel second half spawns an ESCORT PAIR (2026-08-19 user request): past
  `gunship.hp <= maxHp * bossEscort.hpFrac` (0.5), exactly ONE barrel hauler (`{endless:true}` — it holds
  station and keeps unloading until destroyed, so an obstacle becomes a target) plus ONE robot carrier with
  three riders. The pair is tracked BY REFERENCE, not by a repeating timer: while either is alive no
  countdown runs at all, and `respawnDelaySec` (3s) starts only when BOTH are destroyed — leaving one alive
  holds the next wave back. Pair size is a scene constant (`BOSS_ESCORT_TRUCKS`/`BOSS_ESCORT_CARRIERS`), not
  config, because it sizes preallocated pools; the barrel pool stays DERIVED (`barrelSlotsNeeded`) because
  endless dropping starves a fixed pool silently. When the gunship dies, `detonateBossEscort()` blows up any
  survivor through its NORMAL death path (damage the truck, `killRobot({cause:'explosion'})` the riders, then
  `destroyPickup`) — never a silent removal — and the wrecks are recycled in `swapToAirport` behind black.
- A gunship missile's hitbox must cover the body that is DRAWN (2026-08-18 user report): `missileHitRadius`
  stayed at 5 while the missile's drawn body grew to ~31 units, so rounds passing visibly through it did
  nothing. Now 12 (most of the drawn length, never more than it) and `missileHp` 80 -> 40, one rifle round.
  Whenever a projectile mesh is resized, its hit radius is part of that change.
- Gunship projectiles ALL spawn at real muzzles (2026-08-18 user request): `mgMuzzle`/`cannonMuzzle` on the
  FRONT chin turret, `missileRails` on the left/right wings, read via `getWorldPosition` (the tank.js
  pattern). The old code used invented offsets at road level in the target lane, so shots appeared out of
  thin air. MG fire converges on the target lane at the PLAYER's x, so the corridor still holds; the cannon
  shell's velocity is scaled to keep its X component exactly `cannonSpeed` so timing is unchanged; the
  missile dives from wing height to `MISSILE_CRUISE_Y` since homing steers in XZ only.
- Gunship projectiles (2026-08-18 user report): a tracer's long axis MUST follow its flight direction.
  `GEO.bullet` is a sphere, so `scale` alone stretches it — the MG stretched it on z while firing along -x,
  so tracers lay across the road. Yaw now derives from the fire direction (`atan2(dir.x, dir.z)`). Missile
  and cannon shell were also ~1/10 the length of what they target; both are now at least one lane long,
  at least a quarter-lane wide, and still narrower than a lane (so dodging still means something), with
  hazard bands and a pulsing exhaust flare. The two must READ AS DIFFERENT WEAPONS, and the difference
  follows gameplay: the missile is destructible (`missileHp`), the shell is not. Missile = slender,
  finned, red hazard bands, banks toward you; shell = stubby, FINLESS, amber-glowing, spins on its own
  axis. Aspect ratio holds them apart (missile >= 3.5, shell <= 3.0, missile >= 1.4x shell).
- ALL THREE vehicles shatter through ONE shared system, `entities/vehicleWreck.js` (2026-08-18 user
  requests): `shatterVehicle(rig, {loose, skip, tilt, sink})` / `restoreVehicle(rig)`, used by the
  GRD LTV-45, the Raven-K carrier and the VULTURE-B hauler; each module only names which children come
  OFF and which are untouchable. No per-vehicle copies (smoke sweeps the sources). No mesh/material/
  PointLight is created; loose parts fly while body plates only twist; yaw is preserved; the scatter is
  a deterministic hash; and restoration is EXACT because every one of these rigs is reused — including
  on paths that clear a vehicle while it is still a wreck.
- Player death destroys the GRD LTV-45 (2026-08-18 user request). ONE new shared hook,
  `activeScene.onPlayerDeath(dx, dz)`, called once from `startPlayerDeath` — `updateMode` is NOT called
  while dying, so continuing motion rides gibs + explodeAt, which still tick. The chassis is a one-shot
  pose from `wreckTacticalVehicle` (entities/tacticalVehicle.js): no mesh/material/PointLight created,
  every shard is one of the rig's own children, `gunnerMount` skipped (avatar pose anchor), and
  `resetTacticalVehicleVisual` restores pose + paint EXACTLY because dying replays the stage.
- Hauler payload density (2026-08-18 user request, `dropCount` 3->6 and `dropGapSec` 2.2->1.1): each
  barrel keeps its own `leadOffset / roadSpeed` reaction window, so a shorter gap only raises density.
  `dropTelegraphSec` must stay BELOW `dropGapSec` (else the tailgate never closes and stops reading as
  a warning); the bed's drum count is DERIVED from `dropCount` up to the physical 3x2
  `BARREL_DROPPER_CARGO_MAX`, since the visible drums ARE the remaining payload; and the barrel pool is
  sized `maxActive * dropCount`, because one barrel outlives the whole drop sequence.
- ROLLING AXES (2026-08-17 user report): a three.js cylinder's axis is +Y, so an upright barrel spun on
  `rotation.z` topples instead of rolling — dropped barrels are wrapped in a pivot (`rotation.x = PI/2`)
  that lays them across the road, and `rotation.y` is then the roll about their own axis. Wheels bake the
  axle into the GEOMETRY (`geo.rotateX(PI/2)`) and roll on `rotation.z`, the convention `enemyPickup.js`
  and `tacticalVehicle.js` already use; any new wheeled prop must follow it.
- Stage 8 combat leftovers ride the ROAD, not the vehicle (2026-08-17 user request): the arena is
  coordinate-stable, so `updateRoad` calls `driftGore(dx)` at ground speed and gibs/corpses/coolant are
  left behind on the asphalt. No `keep` exclusion (nothing rides the LTV, unlike Stage 5's car floor);
  drops stay pinned by `clampDropPos` so loot remains collectable; carrier wrecks brake 1.35x -> 1.0x
  ground speed and settle on the road.
- Stage 8 is the coordinate-stable GRD LTV-45 gunner arena at x≈270000. Seven lateral
  corridors span both three-lane carriageways and the traversable median; `A/D` are
  FREE lateral steering (2026-08-19; edge-triggered lane snaps until then) and `W/S` are FREE
  longitudinal drive inside `advanceRange` of the arena centre (2026-08-20), while walking/RMB/dodge/melee
  are scene-gated off. `currentZ`/`currentX` are the source of truth and `laneIndex` is just the
  nearest-lane read-out, so telegraphs and the hauler's lane chase are untouched; peak steer speed is
  derived from `laneWidth / laneChangeSec`, the median still slows you by the `laneChangeSec :
  medianChangeSec` ratio, and peak drive speed is CLAMPED below `roadSpeed` so braking never becomes
  reversing (wheels roll at `roadSpeed + advanceVel`). `PLAYER_X` is now the arena CENTRE, not the
  player: things that CHASE the player read live `currentX`, things that are part of the WORLD (road
  pool ends, `stage8Walk` bounds, `S8_START`) stay anchored to the centre — mixing those up spawns
  carriers past the end of the asphalt. Never reintroduce a snap-to-centre pull on release. The
  opening announces 100 km, but there is no runtime distance counter. Timed pickup
  carriers each mount exactly three ordinary A/B robots and keep spawning until the
  config-driven target of 20 carriers is destroyed. Only then does the standalone
  `combatGunship.js` boss (tuning in `CFG.campaign.bosses.gunship` since 2026-08-09 — a boss belongs beside `giant`/`tank`, and it has its own `hp`/`score` there instead of live-reading tank HP; only its scene pacing stays in `stage8`) arrive and cycle telegraphed
  MG/cannon/three homing missiles. **The order is a SHUFFLE BAG, not a fixed rotation, and the
  cannon LEADS the player's lateral movement while the MG locks its lane at telegraph start
  (2026-08-19, user request "lebih menantang tapi tidak terlalu susah")** — each type appears
  exactly once per three attacks, never twice in a row, the opener stays MG, and no damage/HP/
  speed number changed. Its shape was totally reworked 2026-08-08 (user request):
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
**Stage 11 root-console interaction fix (2026-08-29, user report boss never appeared):** the physical drive used to test proximity against `S11_INSERT`, the centre of the console's solid blocker. The blocker half-width (19) plus the player's radius (5) made the closest legal position 24 units away, beyond `campaign.stage11.interactionRange` (18), so normal play could never activate the Warden; smoke only passed because it teleported the camera inside the prop. `S11_INSERT_STAND` now owns both the visible amber marker and the proximity/radar target, while `S11_INSERT` remains the model centre. Smoke `25d` must approach through the real `playerCollide` path and prove the centre is unreachable but the stand target activates the boss.
