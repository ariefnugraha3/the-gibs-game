# Audio Asset Reference

Audit date: 2026-09-09

This document maps every active audio file in `assets/sounds/` to its runtime meaning.
The code-facing source of truth is `src/utils/sfx.js`: one-shot clips should go through
`playSFX()`, looping clips through `playLoopSFX()`/`stopLoopSFX()`, and music through the
`start*Music()` helpers.

After the unused-audio cleanup, there are 38 audio files on disk and 38 `new Audio(...)`
references. No remaining audio file is unmapped. The deleted unused files were:
`assets/sounds/pick-up-key.mp3`, `assets/sounds/robot-melee-attack.mp3`, and
`assets/sounds/reload.mp3`.

## Music

| File | Symbol | What It Represents | When It Plays | Runtime References |
|---|---|---|---|---|
| `assets/sounds/bg-music-main-menu.mp3` | `bgMusicMenu` | Main-menu music. | Started by `startMenuMusic()` when the main menu initializes. For a fresh Campaign it can continue through loading/prologue until the campaign intro stops it on the first live helicopter-intro frame. | `src/utils/sfx.js`, `src/scenes/menu.js` |
| `assets/sounds/bg-music-in-game.mp3` | `bgMusic` | Battle music option 1. | `startBattleMusic()` randomly chooses this or `bgMusicAlt` when battle music is requested. Normal campaign combat starts it when the player first lands a bullet hit on a robot; Survival intro starts it when the arriving army reaches the horde beat; Stage 11 vehicle hits can also start battle music. | `src/utils/sfx.js`, `src/entities/robots.js`, `src/scenes/survival/cutscenes/monasIntro.js`, `src/scenes/campaign/stages/stage11/weaponVehicles.js` |
| `assets/sounds/bg-music-in-game-2.mp3` | `bgMusicAlt` | Battle music option 2. | Same trigger as `bgMusic`, selected randomly by `startBattleMusic()`. | `src/utils/sfx.js`, same `startBattleMusic()` callers as above |
| `assets/sounds/bg-music-boss-fight.mp3` | `bgMusicBoss` | Boss-fight music. | Started by `startBossMusic()` for boss combat: the Stage 4 tank duel after its intro, the Stage 8 combat gunship fight, and the Stage 12 Mahapatih reveal/fight. | `src/utils/sfx.js`, `src/scenes/campaign/cutscenes/stage4/tankBossIntro.js`, `src/scenes/campaign/stages/stage8/index.js`, `src/scenes/campaign/stages/stage12/index.js` |

## Player Weapons And Movement

| File | Symbol | What It Represents | When It Plays | Runtime References |
|---|---|---|---|---|
| `assets/sounds/gun-shoot.mp3` | `sfxShoot` | Standard rifle shot. | Fired by `updateShooting()` when the active weapon is the rifle/default non-pistol, non-shotgun, non-launcher firearm. | `src/entities/weapons.js` |
| `assets/sounds/pistol-shoot.mp3` | `sfxPistol` | Pistol shot. | Fired by `updateShooting()` when `currentWeapon === 'pistol'` and a round is successfully spawned. | `src/entities/weapons.js` |
| `assets/sounds/shotgun-shot.mp3` | `sfxShotgun` | Shotgun blast. | Fired by `updateShooting()` when `currentWeapon === 'shotgun'`; the same trigger may spawn multiple pellets. | `src/entities/weapons.js` |
| `assets/sounds/grenade-launcher-shot.mp3` | `sfxLauncherShot` | Grenade Launcher level 1-2 launch sound. | Fired by `updateShooting()` when the player shoots the launcher before it becomes the level-3 rocket variant. | `src/entities/weapons.js` |
| `assets/sounds/rocket-launcher-shot.mp3` | `sfxRocketShot` | Rocket or missile launch. | Used by the player launcher at level 3, the combat gunship missile launcher, Stage 10 enemy aircraft missiles, and Stage 11 hostile vehicle homing missiles. | `src/entities/weapons.js`, `src/entities/combatGunship.js`, `src/scenes/campaign/stages/stage10/flight.js`, `src/scenes/campaign/stages/stage11/weaponVehicles.js` |
| `assets/sounds/empty-gun.mp3` | `sfxEmpty` | Empty trigger click or rejected UI action. | Played once per trigger pull when the current weapon has no ammo. Also used by campaign utility minigames for rejected/missed actions. | `src/entities/weapons.js`, `src/scenes/campaign/utility/hackMinigame.js`, `src/scenes/campaign/utility/repairMinigame.js`, `src/scenes/campaign/utility/signalTraceMinigame.js` |
| `assets/sounds/switch-weapon.mp3` | `sfxSwitch` | Weapon handling, selection, or mode switch. | Played when weapon switching starts, when the old medkit-hold path equips/holsters, for minigame select/link/unlink feedback, and when the Survival intro readies the weapon. | `src/entities/weapons.js`, `src/scenes/campaign/utility/hackMinigame.js`, `src/scenes/campaign/utility/repairMinigame.js`, `src/scenes/campaign/utility/signalTraceMinigame.js`, `src/scenes/survival/cutscenes/monasIntro.js` |
| `assets/sounds/player-melee-attack.mp3` | `sfxMeleeSwing` | Player melee miss / air slash and fast movement whoosh. | Played at the melee strike moment when the sword hits nothing. Also used for the player's dodge push-off and Mahapatih blade swing releases. | `src/entities/weapons.js`, `src/entities/player.js`, `src/entities/mahapatih.js` |
| `assets/sounds/player-melee-attack-hit.mp3` | `sfxMeleeHit` | Player melee hit / blade impact. | Played at the melee strike moment when at least one robot or crate is hit. Also used for Mahapatih blade damage beats. | `src/entities/weapons.js`, `src/entities/mahapatih.js` |
| `assets/sounds/player-heal.mp3` | `sfxHeal` | Healing / medkit use. | Played when the player uses a medkit in normal gameplay, when the dormant hold-to-use medkit flow finishes, and when a Stage 10 flight health drop restores aircraft HP. | `src/entities/weapons.js`, `src/scenes/campaign/stages/stage10/flight.js` |
| `assets/sounds/player-footstep.mp3` | `sfxFootstep` | Player footsteps and landing thuds. | Played during normal player movement, when landing after being airborne, during the Campaign intro walk/landing beats, and during the Survival Monas intro. | `src/entities/player.js`, `src/scenes/campaign/cutscenes/intro.js`, `src/scenes/survival/cutscenes/monasIntro.js` |
| `assets/sounds/throwing-grenade.mp3` | `sfxThrow` | Old thrown-grenade release. | Wired to `spawnGrenade()` when a thrown grenade is spawned. The thrown-grenade input path is currently dormant; launcher rounds use separate weapon-shot audio. | `src/entities/grenades.js` |
| `assets/sounds/grenade-rolling.mp3` | `sfxNadeRoll` | Old thrown-grenade first floor contact / roll. | Wired to `updateGrenades()` for the first audible ground contact after a thrown grenade lands, distance-gated to nearby players. The thrown-grenade input path is currently dormant. | `src/entities/grenades.js` |

## Pickups, Shops, And Utility UI

| File | Symbol | What It Represents | When It Plays | Runtime References |
|---|---|---|---|---|
| `assets/sounds/pick-up-item.mp3` | `sfxPickup` | Item pickup or successful link-style feedback. | Played when campaign/survival money chips, ammo, medkits, Stage 10 money/health/bomb drops, or repair-minigame links are collected or confirmed. | `src/entities/drops.js`, `src/scenes/campaign/stages/stage10/flight.js`, `src/scenes/campaign/utility/repairMinigame.js` |
| `assets/sounds/success-purchase.mp3` | `sfxPurchase` | Purchase/success confirmation. | Played for Survival shop buys/upgrades, Stage 5 station interactions, and successful hack/repair/signal minigame outcomes. | `src/scenes/survival/shop.js`, `src/scenes/campaign/stages/stage5/station.js`, `src/scenes/campaign/utility/hackMinigame.js`, `src/scenes/campaign/utility/repairMinigame.js`, `src/scenes/campaign/utility/signalTraceMinigame.js` |
| `assets/sounds/door-open.mp3` | `sfxDoorOpen` | Shared door opening sound. | Played by the central door helper when any supported campaign door crosses from fully closed into opening. Distance-gated so far doors are silent. | `src/scenes/campaign/utility/doors.js` |
| `assets/sounds/door-closed.mp3` | `sfxDoorClose` | Shared door close/landing sound. | Played by the central door helper when any supported campaign door lands closed. Distance-gated like the opening sound. | `src/scenes/campaign/utility/doors.js` |

## Robots And Enemy Fire

| File | Symbol | What It Represents | When It Plays | Runtime References |
|---|---|---|---|---|
| `assets/sounds/robot-attack-melee.mp3` | `sfxRobotBite` | Robot melee claw strike. | Played after a melee robot's windup resolves into the actual claw strike, before damage is checked against the player, Monas, or a structure target. | `src/entities/robots.js` |
| `assets/sounds/robot-shot.mp3` | `sfxRobotShot` | Robot/aircraft small ranged shot. | Played when class A/B robots fire plasma bullets, when generic turret bullets spawn, and when Stage 10 enemy aircraft fire non-missile rounds. Robot/turret uses are distance-gated in normal combat. | `src/entities/robots.js`, `src/scenes/campaign/stages/stage10/flight.js` |
| `assets/sounds/robot-step.mp3` | `sfxRobotStep` | Robot footsteps or marching mass. | Played by the global nearest-moving-robot footstep timer during gameplay and by the Survival intro marching beat. | `src/entities/player.js`, `src/scenes/survival/cutscenes/monasIntro.js` |
| `assets/sounds/robot-spawn.mp3` | `sfxRobotSpawn` | Robot materialization, deployment, alarm, or heavy arrival cue. | Used when spawn machines print/eject robots, when Stage 3 deploys robots, when Stage 5/7/10/11 staged encounters release robots, when minigames trigger alarm-like releases, when the Warden reveal drops in, and in the Survival intro mass arrival. | `src/scenes/campaign/stages/stage3/index.js`, `src/scenes/campaign/stages/stage5/station.js`, `src/scenes/campaign/stages/stage7/index.js`, `src/scenes/campaign/stages/stage10/spawnDeployment.js`, `src/scenes/campaign/stages/stage11/cityBlockades.js`, `src/scenes/campaign/stages/stage11/forestCheckpoints.js`, `src/scenes/campaign/stages/stage11/root.js`, `src/scenes/campaign/cutscenes/stage11/wardenReveal.js`, `src/scenes/campaign/utility/hackMinigame.js`, `src/scenes/campaign/utility/signalTraceMinigame.js`, `src/scenes/survival/cutscenes/monasIntro.js` |
| `assets/sounds/jokowi-kaget.mp3` | `sfxHit` | Player hurt reaction. | Played when the player takes damage from electric attacks, explosions, enemy bullets, robot claws, tank shock, or Stage 10 flight bullet/collision damage. | `src/entities/robots.js`, `src/entities/tank.js`, `src/scenes/campaign/stages/stage10/flight.js` |

## Explosions, Heavy Vehicles, And Bosses

| File | Symbol | What It Represents | When It Plays | Runtime References |
|---|---|---|---|---|
| `assets/sounds/grenade-explode.mp3` | `sfxExplode` | Generic/default explosion and low-pitched death impact base. | Used by the shared explosion system when no override SFX is supplied. Also used for the player death cinematic whump/ground impact, helicopter destruction, smash-building destruction, tank cannon muzzle/impact moments, Stage 3 deploy FX, Stage 10 normal explosions, Stage 10 spawn-machine destruction, and some Stage 5 rail/vehicle destruction beats. | `src/entities/effects.js`, `src/core/deathCine.js`, `src/entities/helicopter.js`, `src/entities/smashBuilding.js`, `src/entities/tank.js`, `src/scenes/campaign/cutscenes/stage4/tankBossIntro.js`, `src/scenes/campaign/stages/stage3/index.js`, `src/scenes/campaign/stages/stage5/runtime.js`, `src/scenes/campaign/stages/stage10/flight.js`, `src/scenes/campaign/stages/stage10/spawnDeployment.js` |
| `assets/sounds/rocket-explode.mp3` | `sfxRocketExplode` | Rocket, missile, bomb, or large blast detonation. | Used by level-3 player launcher explosions, combat-gunship missile impacts, Stage 10 missile/player-hit/bomb/blast events, and Stage 11 vehicle missile explosions. | `src/entities/weapons.js`, `src/entities/combatGunship.js`, `src/scenes/campaign/stages/stage10/flight.js`, `src/scenes/campaign/stages/stage11/weaponVehicles.js` |
| `assets/sounds/smash-melee-attack.mp3` | `sfxMelee` | Metal/armor crack, crate break, or equipment impact. | Played when player armor breaks, when a supply crate is destroyed, when a player death body-impact layer needs a gear-crack sound, and when robot armor/attack impact feedback uses the shared melee crunch. | `src/entities/robots.js`, `src/entities/crates.js`, `src/core/deathCine.js` |
| `assets/sounds/helicopter-flying.mp3` | `sfxHeli` | Helicopter/gunship rotor loop or rotor-like sync cue. | Looping in the Campaign helicopter intro, looping in the Stage 4 tank-boss helicopter cutscene, looping as Stage 8 gunship rotor audio, and used as a one-shot sync cue in the repair minigame. | `src/scenes/campaign/cutscenes/intro.js`, `src/scenes/campaign/cutscenes/stage4/tankBossIntro.js`, `src/scenes/campaign/stages/stage8/index.js`, `src/scenes/campaign/utility/repairMinigame.js` |
| `assets/sounds/train-sound.mp3` | `sfxTrain` | Running train loop. | Played as the Stage 5 train movement loop. This clip is registered in `GAPLESS_LOOPS` so `playLoopSFX()` can use Web Audio trimming to avoid MP3 loop padding gaps. | `src/utils/sfx.js`, `src/scenes/campaign/stages/stage5/runtime.js` |
| `assets/sounds/boss-tank/tank-machine-gun.mp3` | `sfxTankMG` | Heavy machine-gun burst. | Used by the tank boss MG, combat gunship MG, Mahapatih turret/MG release, Stage 10 player aircraft machine guns, and Stage 11 armed vehicle MG bursts. | `src/entities/tank.js`, `src/entities/combatGunship.js`, `src/entities/mahapatih.js`, `src/scenes/campaign/stages/stage10/flight.js`, `src/scenes/campaign/stages/stage11/weaponVehicles.js` |
| `assets/sounds/boss-tank/tank-mortar-shot.mp3` | `sfxTankMortar` | Mortar/cannon launch thump. | Played when the tank boss launches mortars, when the combat gunship fires heavy ordnance, when Mahapatih launches siege/hardline artillery, and when Stage 7/11 mortar systems fire. | `src/entities/tank.js`, `src/entities/combatGunship.js`, `src/entities/mahapatih.js`, `src/scenes/campaign/stages/stage7/index.js`, `src/scenes/campaign/stages/stage11/forestMortar.js` |
| `assets/sounds/boss-tank/tank-incoming-mortar.mp3` | `sfxTankIncoming` | Incoming mortar whistle. | Played shortly before mortar/artillery impact and stored on the projectile so it can be stopped on impact, expiry, reset, or cleanup. Used by tank boss mortars, Mahapatih artillery, Stage 7 mortars, and Stage 11 forest mortars. | `src/entities/tank.js`, `src/entities/mahapatih.js`, `src/scenes/campaign/stages/stage7/index.js`, `src/scenes/campaign/stages/stage11/forestMortar.js` |
| `assets/sounds/boss-tank/tank-explosive-attack.mp3` | `sfxTankBlast` | Heavy shell, mortar, seismic, or metal-impact blast. | Used as the impact sound for tank shells/mortars, Mahapatih artillery/charge/seismic/lunge projectiles, combat-gunship cannon impacts, Warden/Mahapatih death blast beats, Stage 4 cutscene tank shell impact, Stage 5 locomotive grenade impacts, and Stage 7/11 mortar explosions. | `src/entities/tank.js`, `src/entities/combatGunship.js`, `src/entities/mahapatih.js`, `src/entities/mahapatihDeath.js`, `src/entities/nusantaraWardenDeath.js`, `src/scenes/campaign/cutscenes/stage4/tankBossIntro.js`, `src/scenes/campaign/stages/stage5/loco.js`, `src/scenes/campaign/stages/stage7/index.js`, `src/scenes/campaign/stages/stage11/forestMortar.js` |
| `assets/sounds/boss-tank/tank-explode.mp3` | `sfxTankExplode` | Heavy chassis/destruction explosion. | Used for tank death, gunship explosions, Mahapatih phase/death/destruction pulses, Warden death blast beats, Stage 5 highway/train/loco destruction, Stage 8 gunship/barrel explosions, and Stage 11 hostile vehicle wrecking. | `src/entities/tank.js`, `src/entities/combatGunship.js`, `src/entities/mahapatih.js`, `src/entities/mahapatihDeath.js`, `src/entities/nusantaraWardenDeath.js`, `src/scenes/campaign/stages/stage5/highway.js`, `src/scenes/campaign/stages/stage5/loco.js`, `src/scenes/campaign/stages/stage5/runtime.js`, `src/scenes/campaign/stages/stage8/barrelDropper.js`, `src/scenes/campaign/stages/stage8/index.js`, `src/scenes/campaign/stages/stage11/weaponVehicles.js` |
| `assets/sounds/boss-tank/tank-moving.mp3` | `sfxTankMove` | Heavy vehicle/tank movement loop. | Loops while the tank boss hull is moving. Also reused as the Stage 7 and Stage 8 vehicle movement loop. | `src/entities/tank.js`, `src/scenes/campaign/stages/stage7/index.js`, `src/scenes/campaign/stages/stage8/index.js` |
| `assets/sounds/boss-tank/tank-turret-rotate.mp3` | `sfxTankTurret` | Tank turret rotation loop. | Loops only while the tank boss turret yaw is actively changing. | `src/entities/tank.js` |

## Current Unused Audio

None. The current `assets/sounds/` inventory matches the active `new Audio(...)` references in
`src/utils/sfx.js`.

Notes:

- `throwing-grenade.mp3` and `grenade-rolling.mp3` are still wired to the old thrown-grenade
  subsystem, but that input path is dormant after the launcher weapon replaced thrown grenades.
- Music files are not usually referenced directly outside `src/utils/sfx.js`; their practical
  usage is through `startMenuMusic()`, `startBattleMusic()`, and `startBossMusic()`.
