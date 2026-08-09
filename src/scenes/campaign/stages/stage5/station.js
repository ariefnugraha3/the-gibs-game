// Stage 5 — SUB-SCENE 1: STASIUN AWAL (opening -> clearDepot -> hack C1 ->
// repair C2 -> board). Begitu player mencapai pintu TCI, kendali diserahkan ke
// sub-scene journey.
//
// ROMBAK 2026-08-07 (permintaan user): SELURUH robot bagian 1 tinggal di
// gudang. Tidak ada lagi gelombang yang datang/turun dari kereta musuh — konsist
// di track sebelah cuma melintas satu kali sebagai beat atmosfer — dan begitu
// pintu peron terbuka, generator C2 LANGSUNG bisa dipakai tanpa gate apa pun.

import { CFG } from '../../../../core/config.js';
import { player, robots, bullets, stats, keys, _v3, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageMsg, setCineBars, setCineFade, showCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import {
    spawnBarrel, resolveBarrelBlock, resetBarrels,
} from '../../../../entities/barrels.js';
import { queueBoom } from '../../../../entities/robots.js';
import { explodeAt, spawnBloodBurst, spawnGroundPuff } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import { slideWalk } from '../../../../utils/collision.js';
import { rand, segPointDist2 } from '../../../../utils/math.js';
import { playSFX, sfxPurchase, sfxRobotSpawn } from '../../../../utils/sfx.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import {
    campaignRobotAI, campaignClampRobot, countStageRobots, spawnAlarmHorde,
} from '../../utility/common.js';
import { beginRepairMinigame, ADVANCED_REPAIR_PARTS } from '../../utility/repairMinigame.js';
import { beginSignalTraceMinigame } from '../../utility/signalTraceMinigame.js';
import {
    cellPos, resolve, stage5GroundHeight, navGrid,
    playerStationWalk, robotStationWalk, hallSpawnWalk,
    updateStationDoors, platformDoor, safeDoor, pulseMarkers, updateLandmarks, litScreen,
    updateStationSpawnMachine, killStationSpawnMachine, stationSpawnMachine, stage5Walk,
    repairMarker, terminalMarker, boardMarker, generatorScreen, terminalScreen,
    S5_START, S5_GENERATOR, S5_TERMINAL, S5_BOARD, S5_SPAWN_MACHINE,
    S5_MACHINE_SPAWNS, SUPPLY_POINTS, CRATE_POINTS, BARREL_POINTS,
} from './world.js';
import {
    phase, setPhase, cine, setCine, cleanupCine, enterSub, queueDialogue, dialogueIdle,
    spawnOne, sendEnemyFlyby, updateEnemyTrain,
    bulletBlocked, blastBlocked, cineCam,
} from './runtime.js';
import { departureScene } from './departure.js';

let repairInstalled = 0, repairArmed = true, hackArmed = true, hackCd = 0;
let discovered = false, platformUnlocked = false, depotAwake = false, flybySent = false;
// Keberangkatan sudah dikunci player tetapi masih menunggu dialog stasiun,
// lalu menahan `departureDelaySec` lagi sebelum cutscene dimulai.
let boardCommitted = false, boardHoldT = 0;
let machineHp = 0, machineAlive = true, machineHitT = 0;
let machineClock = 0, machineNextAt = 0, machineCycle = null;
let machineBatches = 0, machineSpawned = 0, machineChargePulse = 0;
let machineBirths = [];

export function resetStation() {
    repairInstalled = 0; repairArmed = true; hackArmed = true; hackCd = 0;
    discovered = false; platformUnlocked = false; depotAwake = false; flybySent = false;
    boardCommitted = false; boardHoldT = 0;
    const M = CFG.campaign.stage5.spawnMachine;
    machineHp = M.hp; machineAlive = true; machineHitT = 0;
    machineClock = 0; machineNextAt = M.batchSec; machineCycle = null;
    machineBatches = 0; machineSpawned = 0; machineChargePulse = 0; machineBirths = [];
}

// Satu titik per robot, disebar ke seluruh gudang + ruang C1. Semuanya berada
// di aisle kosong, jauh dari furnitur, supply, dan sel SA/S/T.
const DEPOT_SPOTS = Object.freeze([
    [8, 47], [12, 47], [17, 48], [23, 48], [27, 47], [9, 43],
    [12, 43], [18, 44], [26, 43], [10, 40], [18, 40], [23, 41],
    [27, 40], [11, 37], [16, 37], [21, 36], [27, 35], [9, 33],
    [17, 33], [23, 32], [11, 29], [18, 29], [27, 29], [13, 25],
    [26, 24], [15, 20],
]);

// Titik ini aman dipakai sebagai TITIK LAHIR? Persis uji yang dipakai smoke:
// bukan sel dinding, dan `resolve` tidak mendorongnya keluar dari perabot.
function spawnClear(x, z, r = 2) {
    if (!stage5Walk(x, z, r)) return false;
    _v3.set(x, 0, z); resolve(_v3, r, 0);
    return Math.hypot(_v3.x - x, _v3.z - z) < 0.01;
}

function spawnDepot() {
    const C = CFG.campaign.stage5.encounters.depot;
    // `active=false`: safe-area hold baru dilepas setelah player meninggalkan SA.
    let k = 0;
    for (const cls of ['C', 'B', 'A']) for (let i = 0; i < (C[cls] | 0); i++, k++) {
        const p = DEPOT_SPOTS[k % DEPOT_SPOTS.length], w = cellPos(p[0], p[1]);
        // Guncangan acak tidak boleh menjatuhkan robot ke dalam perabot: kalau
        // enam undian gagal, pakai pusat petaknya yang memang sudah bersih.
        let x = w.x, z = w.z;
        for (let t = 0; t < 6; t++) {
            const jx = w.x + rand(-3, 3), jz = w.z + rand(-3, 3);
            if (spawnClear(jx, jz)) { x = jx; z = jz; break; }
        }
        spawnOne(cls, x, z, 'depot', false);
    }
}

function placeSupplies() {
    for (const p of SUPPLY_POINTS) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}

function placeCrates() {
    for (const p of CRATE_POINTS) spawnCrate(p.x, p.z, 0);
}

function placeBarrels() {
    for (const p of BARREL_POINTS) spawnBarrel(p.x, p.z, 0);
}

function finishOpening() {
    cleanupCine(CFG.campaign.stage5.fadeSec); setPhase('clearDepot');
    showStageMsg('SECURE THE STATION — FIND THE C1 ACCESS COMPUTER', 4200);
}

function startOpening() {
    releaseInputs(); setCinematicActive(true); setCineBars(true);
    // Stage 4/outro dan layar loading tidak boleh mewariskan tirai hitam ke
    // opening Stage 5. Dunia harus terlihat pada frame render pertama; dialog
    // baru dimulai setelah establishing beat singkat yang config-driven.
    setCineFade(0, 0);
    setCine({ kind: 'opening', t: 0, fading: false, dialogueStarted: false });
    showCutsceneSkip(finishOpening);
    const hall = cellPos(15, 31);
    setCineFocus(hall.x, hall.z, true);
}

function updateOpeningCine(dt) {
    if (!cine) return;
    cine.t += dt;
    const C = CFG.campaign.stage5;
    cineCam.x = -150 + Math.min(1, cine.t / 5) * 45;
    cineCam.y = 145 - Math.min(1, cine.t / 5) * 18;
    cineCam.z = 155 - Math.min(1, cine.t / 5) * 30;
    if (!cine.dialogueStarted && cine.t >= Math.max(0, C.openingDialogueDelaySec || 0)) {
        cine.dialogueStarted = true;
        queueDialogue('opening');
    }
    if (!cine.fading && cine.dialogueStarted && cine.t >= C.openingMinSec && dialogueIdle()) {
        cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
    }
    if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishOpening();
}

function wakeDepotRobots() {
    if (depotAwake) return;
    depotAwake = true;
    for (const z of robots) if (z.stage === 5 && z.encounter === 'depot') {
        z.state = 'chasing'; z.moving = false; z.aiming = false;
    }
    showStageMsg('SAFE DOOR OPEN — HOSTILE UNITS ARE ENTERING THE SAFE AREA', 3400);
}

function randomMachineClass() {
    const mix = CFG.campaign.stage5.spawnMachine.classMix;
    const c = Math.max(0, mix.C || 0), b = Math.max(0, mix.B || 0), a = Math.max(0, mix.A || 0);
    const total = c + b + a;
    if (!(total > 0)) return 'C';
    const roll = Math.random() * total;
    return roll < c ? 'C' : (roll < c + b ? 'B' : 'A');
}

function machineBulletHits() {
    if (!machineAlive || !depotAwake) return;
    const M = CFG.campaign.stage5.spawnMachine, r2 = M.hitRadius * M.hitRadius;
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j], bx = b.mesh.position.x, bz = b.mesh.position.z;
        if (segPointDist2(b.px, 0, b.pz, bx, 0, bz,
            S5_SPAWN_MACHINE.x, 0, S5_SPAWN_MACHINE.z) >= r2) continue;
        if (b.explosive) {
            queueBoom(bx, b.mesh.position.y, bz, b.explodeR, false, 0, b.damage, b.boomSfx);
            machineHp -= b.damage != null ? b.damage : CFG.grenade.damage;
        } else {
            machineHp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
            stats.hits++;
            spawnBloodBurst(bx, 12 + Math.random() * 6, bz, b.dir.x, b.dir.z,
                3, 0.65, 1.6, 0xffb24a);
        }
        machineHitT = 1;
        scene.remove(b.mesh); bullets.splice(j, 1);
    }
}

function destroySpawnMachine() {
    if (!machineAlive) return;
    machineAlive = false; machineHp = 0; machineCycle = null;
    killStationSpawnMachine();
    explodeAt(new THREE.Vector3(S5_SPAWN_MACHINE.x, 13, S5_SPAWN_MACHINE.z), 32, 1);
    spawnGibs(S5_SPAWN_MACHINE.x, 15, S5_SPAWN_MACHINE.z,
        16, -1, 0, 2.5, PAL.gunmetal, 0.4, PAL.ink);
    spawnBloodDecal(S5_SPAWN_MACHINE.x, S5_SPAWN_MACHINE.z, 8, PAL.ink);
    addCamShake(10);
    showStageMsg('ROBOT FACTORY DESTROYED — ELIMINATE THE REMAINING UNITS', 4200);
}

function spawnMachineBirth(slot) {
    const target = S5_MACHINE_SPAWNS[slot % S5_MACHINE_SPAWNS.length];
    const start = { x: S5_SPAWN_MACHINE.x - 12, z: target.z };
    const z = spawnOne(randomMachineClass(), start.x, start.z, 'factory', false);
    const base = z.scl || 1;
    z.state = 'idle'; z.machineBirth = true; z.moving = false; z.aiming = false;
    z.mesh.scale.set(base * 0.05, base * 0.025, base * 0.05);
    z.mesh.rotation.y = -Math.PI / 2;
    machineBirths.push({ z, t: 0, base, start, target });
    machineSpawned++;
    spawnGroundPuff(start.x, start.z, PAL.tech, 12, 1.2);
    spawnBloodBurst(start.x, 9, start.z, -1, 0, 12, 1.1, 2.7, PAL.tech);
    playSFX(sfxRobotSpawn, 0.72);
    addCamShake(2.8);
}

function startMachineCycle() {
    const M = CFG.campaign.stage5.spawnMachine;
    machineCycle = { t: 0, launched: 0 };
    machineBatches++;
    machineChargePulse = 0;
    machineNextAt += M.batchSec;
    showStageMsg(`FACTORY CHARGING — ${M.batchCount} HOSTILES IN FABRICATION`, 2600);
    addCamShake(1.2);
}

function updateMachineBirths(dt) {
    const sec = CFG.campaign.stage5.spawnMachine.birthSec;
    for (let i = machineBirths.length - 1; i >= 0; i--) {
        const b = machineBirths[i];
        if (robots.indexOf(b.z) < 0 || b.z.hp <= 0) {
            b.z.mesh.scale.setScalar(b.base); b.z.machineBirth = false;
            machineBirths.splice(i, 1); continue;
        }
        b.t += dt;
        const k = Math.min(1, b.t / sec);
        const printK = Math.min(1, k / 0.62);
        const printEase = printK * printK * (3 - 2 * printK);
        const ejectK = Math.max(0, Math.min(1, (k - 0.36) / 0.64));
        const ejectEase = 1 - (1 - ejectK) * (1 - ejectK);
        b.z.mesh.position.x = b.start.x + (b.target.x - b.start.x) * ejectEase;
        b.z.mesh.position.z = b.start.z + (b.target.z - b.start.z) * ejectEase;
        b.z.mesh.position.y = Math.sin(ejectK * Math.PI) * 4.2;
        b.z.mesh.scale.set(b.base * (0.05 + printEase * 0.95),
            b.base * (0.025 + printEase * 0.975), b.base * (0.05 + printEase * 0.95));
        b.z.mesh.rotation.y = -Math.PI / 2 + (1 - ejectEase) * Math.sin(b.t * 9) * 0.18;
        if (k >= 1) {
            b.z.mesh.position.set(b.target.x, 0, b.target.z);
            b.z.mesh.scale.setScalar(b.base); b.z.machineBirth = false;
            b.z.state = 'chasing'; b.z.moving = false; b.z.aiming = false;
            spawnGroundPuff(b.target.x, b.target.z, PAL.techDim, 8, 0.7);
            machineBirths.splice(i, 1);
        }
    }
}

function updateSpawnMachineCombat(dt) {
    const M = CFG.campaign.stage5.spawnMachine;
    if (machineHitT > 0) machineHitT = Math.max(0, machineHitT - dt * 5);
    machineBulletHits();
    if (machineAlive && machineHp <= 0) destroySpawnMachine();
    if (depotAwake && machineAlive) {
        machineClock += dt;
        if (!machineCycle && machineClock >= machineNextAt - M.chargeSec) startMachineCycle();
        if (machineCycle) {
            machineCycle.t += dt;
            machineChargePulse -= dt;
            if (machineChargePulse <= 0 && machineCycle.t < M.chargeSec) {
                machineChargePulse = 0.28;
                const p = S5_MACHINE_SPAWNS[1];
                spawnGroundPuff(p.x + 10, p.z, PAL.amber, 5 + machineCycle.t * 2.5, 5);
            }
            while (machineCycle.launched < M.batchCount
                && machineCycle.t >= M.chargeSec + machineCycle.launched * M.birthGapSec) {
                spawnMachineBirth(machineCycle.launched++);
            }
            if (machineCycle.launched >= M.batchCount
                && machineCycle.t >= M.chargeSec + (M.batchCount - 1) * M.birthGapSec + 0.15)
                machineCycle = null;
        }
    }
    updateMachineBirths(dt);
    updateStationSpawnMachine(dt, depotAwake && machineAlive, machineHitT);
    if (stationSpawnMachine?.hatchFrame) {
        const surge = machineCycle && machineCycle.t < M.chargeSec
            ? Math.sin(Math.min(1, machineCycle.t / M.chargeSec) * Math.PI / 2) : 0;
        stationSpawnMachine.hatchFrame.scale.setScalar(1 + surge * 0.13);
    }
}

function beginRepair() {
    setPhase('repairing'); repairMarker.visible = false;
    clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    beginRepairMinigame({
        head: 'AUXILIARY GENERATOR - FIELD RESTART',
        parts: ADVANCED_REPAIR_PARTS,
        startIndex: repairInstalled,
        onProgress: k => { repairInstalled = k; },
        onSuccess: () => {
            repairInstalled = ADVANCED_REPAIR_PARTS.length; setPhase('board');
            litScreen(generatorScreen, EMISSIVE_MAX * 0.75);
            boardMarker.visible = true;
            queueDialogue('powerBack'); queueDialogue('routeReady'); queueDialogue('letsMove');
            playSFX(sfxPurchase, 0.55);
            showStageMsg('AUXILIARY POWER RESTORED — BOARD THE TRAIN', 4500);
        },
        onFail: () => {
            setPhase('repair'); repairMarker.visible = true;
            showStageMsg(`REPAIR ABORTED - ${repairInstalled}/${ADVANCED_REPAIR_PARTS.length} STEPS COMPLETE`, 3600);
        },
    });
}

function hackAlarm() {
    const H = CFG.campaign.hack;
    hackCd = H.alarmCooldownSec;
    spawnAlarmHorde(5, {
        count: H.alarmHordeCount, walkable: hallSpawnWalk, resolve, scratch: _v3,
        minUnits: H.alarmSpawnMinUnits, maxUnits: H.alarmSpawnMaxUnits, cls: 'C',
        // Ruang C1 berada di sudut peta, sehingga cincin 24 arah kadang hanya
        // menemukan sembilan titik. Cadangan ini tetap jauh, di luar SA/T.
        fallbackSpots: [[10, 43], [15, 35], [21, 25]],
        cellFn: (c, r) => cellPos(c, r),
    });
    showStageMsg(`ALARM TRIGGERED — CLEAR THE HUNTER SQUAD; TERMINAL REBOOTS IN ${Math.round(hackCd)}s`, 5000);
}

function beginHack() {
    terminalMarker.visible = false;
    clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    beginSignalTraceMinigame({
        head: 'C1 PLATFORM ACCESS',
        sub: 'Capture every encrypted carrier to override station security.',
        onSuccess: () => {
            setPhase('repair'); platformUnlocked = true; repairMarker.visible = true;
            litScreen(terminalScreen, EMISSIVE_MAX * 0.65);
            const door = platformDoor();
            if (door) door.target = 1;
            showStageMsg('PLATFORM ACCESS UNLOCKED — REPAIR GENERATOR C2', 4400);
            playSFX(sfxPurchase, 0.55);
        },
        onFail: reason => {
            setPhase('hack'); hackArmed = false;
            if (reason === 'fail') hackAlarm();
            else { terminalMarker.visible = true; showStageMsg('BREACH ABORTED — STEP AWAY, THEN TRY AGAIN', 3200); }
        },
    });
}

export const stationDebug = () => ({
    repairInstalled, repairTotal: ADVANCED_REPAIR_PARTS.length, repairArmed, hackArmed, hackCd,
    platformUnlocked, depotAwake, flybySent, boardCommitted, boardHoldT,
    machine: {
        hp: machineHp, maxHp: CFG.campaign.stage5.spawnMachine.hp, alive: machineAlive,
        clock: machineClock, nextBatchIn: Math.max(0, machineNextAt - machineClock),
        batches: machineBatches, spawned: machineSpawned,
        charging: !!machineCycle && machineCycle.t < CFG.campaign.stage5.spawnMachine.chargeSec,
        launched: machineCycle?.launched || 0, births: machineBirths.length,
    },
});

export const stationScene = {
    id: 'campaign-5-station',

    enter() {
        spawnDepot(); placeSupplies(); placeCrates(); placeBarrels();
        startOpening();
    },

    exit() { resetBarrels(); },

    updateMode(dt) {
        if (phase === 'opening') updateOpeningCine(dt);
        updateStationDoors(dt, platformUnlocked, depotAwake); updateEnemyTrain(dt);
        pulseMarkers();
        updateLandmarks(dt, repairInstalled >= ADVANCED_REPAIR_PARTS.length, platformUnlocked);
        if (hackCd > 0) hackCd = Math.max(0, hackCd - dt);

        if (phase === 'clearDepot') {
            const exitDoor = safeDoor();
            if (!depotAwake && exitDoor && (exitDoor.target > 0 || exitDoor.open > 0)) wakeDepotRobots();
            updateSpawnMachineCombat(dt);
            if (!discovered && camera.position.z < cellPos(15, 25).z) {
                discovered = true; queueDialogue('discoverTrain'); queueDialogue('powerDead');
            }
            if (!machineAlive && countStageRobots(5) === 0) {
                setPhase('hack'); terminalMarker.visible = true;
                queueDialogue('discoverTrain'); queueDialogue('powerDead');
                // Kereta musuh lewat tanpa berhenti: terlihat dari hall melalui
                // dinding berjendela. Murni atmosfer — ia tidak menurunkan apa pun.
                if (!flybySent && sendEnemyFlyby()) {
                    flybySent = true; queueDialogue('enemyTrainFlyby');
                }
                showStageMsg('STATION SECURED — HACK COMPUTER C1', 4200);
            }
        } else if (phase === 'hack') {
            const near = Math.hypot(camera.position.x - S5_TERMINAL.x,
                camera.position.z - S5_TERMINAL.z) < CFG.campaign.stage5.terminalRange;
            if (!near) hackArmed = true;
            else if (hackArmed && hackCd <= 0 && countStageRobots(5) === 0) {
                hackArmed = false; beginHack();
            }
            terminalMarker.visible = hackCd <= 0 && countStageRobots(5) === 0;
        } else if (phase === 'repair') {
            // Pintu peron terbuka = C2 siap. Tidak ada gate gelombang lagi.
            repairMarker.visible = true;
            const near = Math.hypot(camera.position.x - S5_GENERATOR.x,
                camera.position.z - S5_GENERATOR.z) < CFG.campaign.stage5.repairRange;
            if (!near) repairArmed = true;
            else if (repairArmed) { repairArmed = false; beginRepair(); }
        } else if (phase === 'board') {
            // NAIK KERETA DITAHAN SAMPAI NASKAH STASIUN TUNTAS (2026-08-08,
            // permintaan user). Dulu menyentuh titik naik LANGSUNG menyerahkan
            // ke cutscene keberangkatan, jadi cutscene itu memotong
            // powerBack/routeReady/letsMove yang masih diketik. Sekarang
            // menyentuh titik naik hanya MENGUNCI keberangkatan — kendali
            // dibekukan dan letterbox dipasang supaya jeda ini terbaca sebagai
            // awal adegan, bukan hang.
            if (!boardCommitted
                && Math.hypot(camera.position.x - S5_BOARD.x, camera.position.z - S5_BOARD.z)
                    < CFG.campaign.stage5.boardRange) {
                boardCommitted = true; boardHoldT = 0;
                releaseInputs(); clearMoveTarget();
                keys.w = keys.a = keys.s = keys.d = false;
                setCinematicActive(true); setCineBars(true);
                boardMarker.visible = false;
            }
            // JEDA SEBELUM CUTSENE (2026-08-08, permintaan user "tunggu 3 detik
            // kemudian mulai cutscene"): sub-scene stasiun berakhir ketika player
            // berada di titik keberangkatan DAN seluruh dialog tersampaikan;
            // setelah itu masih ada napas `departureDelaySec` — panel radio sudah
            // tertutup dan yang tersisa hanya Gibran berdiri di peron — baru
            // sub-scene cutscene keberangkatan dimulai.
            if (boardCommitted) {
                if (!dialogueIdle()) boardHoldT = 0;
                else if ((boardHoldT += dt)
                    >= (CFG.campaign.stage5.departureDelaySec ?? 3)) enterSub(departureScene);
            }
        }
        if (phase !== 'clearDepot') updateSpawnMachineCombat(dt);
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(playerStationWalk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
        resolveBarrelBlock(pos, player.radius);
        slideWalk(playerStationWalk, pos, oldX, oldZ, player.radius);
    },

    groundHeight(x, z, feetY) { return stage5GroundHeight(x, z, feetY); },
    bulletBlocked, blastBlocked,

    grenadeCollide(g, oldX, oldZ) {
        if (!playerStationWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },

    robotAI(z, dt, step) {
        if (z.machineBirth) {
            z.state = 'idle'; z.moving = false; z.aiming = false;
            return {};
        }
        if (z.encounter === 'depot' && !depotAwake) {
            // Posisi/serangan dibekukan, tetapi biarkan loop robot menjalankan
            // idle rig (kepala/lengan) agar mereka tidak tampak seperti patung.
            // Tembakan dari SA juga tidak boleh membangunkan mereka lebih awal.
            z.state = 'idle'; z.moving = false; z.aiming = false;
            return {};
        }
        return campaignRobotAI(z, dt, step, { walkable: robotStationWalk, resolve, nav: navGrid });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: robotStationWalk, resolve });
    },

    clampDropPos(x, z) {
        if (playerStationWalk(x, z, 2)) return [x, z];
        // Loot dari robot yang mati di area track ditarik ke tepi peron; player
        // tidak pernah boleh berjalan ke sana untuk memungutnya.
        const edgeZ = cellPos(1, 10).z;
        if (z < edgeZ && playerStationWalk(x, edgeZ, 2)) return [x, edgeZ];
        // Hindari menjepit drop ke dalam sel dinding CSV. Safe area start
        // selalu merupakan fallback walkable yang sah.
        return [S5_START.x, S5_START.z];
    },

    hudStatus() {
        if (phase === 'opening') return 'STAGE 5 — THE LAST TRAIN TO BANDUNG';
        if (phase === 'clearDepot' && !depotAwake) return 'SAFE AREA — MOVE OUT WHEN READY';
        if (phase === 'clearDepot') return machineAlive
            ? `DESTROY ROBOT FACTORY — HP ${Math.ceil(machineHp)}/${CFG.campaign.stage5.spawnMachine.hp} | Hostiles: ${countStageRobots(5)}`
            : `STATION SECURITY — Remaining hostiles: ${countStageRobots(5)}`;
        if (phase === 'repair' || phase === 'repairing') return `GENERATOR C2 - ${repairInstalled}/${ADVANCED_REPAIR_PARTS.length}`;
        if (phase === 'hack') {
            if (countStageRobots(5) > 0) return `C1 ACCESS COMPUTER — Clear alarm squad: ${countStageRobots(5)}`;
            if (hackCd > 0) return `C1 ACCESS COMPUTER REBOOT — ${Math.ceil(hackCd)}s`;
            return 'C1 ACCESS COMPUTER - SIGNAL TRACE READY';
        }
        if (boardCommitted) return 'ALL ABOARD — DEPARTING';
        return 'BANDUNG ROUTE AUTHORIZED — BOARD THE TRAIN';
    },

    radarLandmarks(plot) {
        let p = null;
        if (phase === 'clearDepot' && machineAlive) p = S5_SPAWN_MACHINE;
        else if (phase === 'repair' || phase === 'repairing') p = S5_GENERATOR;
        else if (phase === 'hack') p = S5_TERMINAL;
        else if (phase === 'board') p = S5_BOARD;
        if (p) plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
