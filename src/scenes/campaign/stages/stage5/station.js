// Stage 5 — SUB-SCENE 1: STASIUN AWAL (opening -> clearDepot -> hack C1 ->
// repair C2 -> board). Begitu player mencapai pintu TCI, kendali diserahkan ke
// sub-scene journey.
//
// ROMBAK 2026-08-07 (permintaan user): SELURUH robot bagian 1 tinggal di
// gudang. Tidak ada lagi gelombang yang datang/turun dari kereta musuh — konsist
// di track sebelah cuma melintas satu kali sebagai beat atmosfer — dan begitu
// pintu peron terbuka, generator C2 LANGSUNG bisa dipakai tanpa gate apa pun.

import { CFG } from '../../../../core/config.js';
import { player, robots, keys, _v3, setCinematicActive } from '../../../../core/state.js';
import { camera, setCineFocus } from '../../../../core/renderer.js';
import {
    showStageMsg, setCineBars, setCineFade, showCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import { slideWalk } from '../../../../utils/collision.js';
import { rand } from '../../../../utils/math.js';
import { playSFX, sfxPurchase } from '../../../../utils/sfx.js';
import { EMISSIVE_MAX } from '../../../../world/palette.js';
import {
    campaignRobotAI, campaignClampRobot, countStageRobots, spawnAlarmHorde,
} from '../../utility/common.js';
import { beginRepairMinigame, REPAIR_PARTS } from '../../utility/repairMinigame.js';
import { beginHackMinigame } from '../../utility/hackMinigame.js';
import {
    cellPos, resolve, stage5GroundHeight, navGrid,
    playerStationWalk, robotStationWalk, hallSpawnWalk, touchesSafeArea,
    updateStationDoors, platformDoor, pulseMarkers, updateLandmarks, litScreen,
    repairMarker, terminalMarker, boardMarker, generatorScreen, terminalScreen,
    S5_START, S5_GENERATOR, S5_TERMINAL, S5_BOARD, SUPPLY_POINTS, CRATE_POINTS,
} from './world.js';
import {
    phase, setPhase, cine, setCine, cleanupCine, enterSub, queueDialogue, dialogueIdle,
    spawnOne, countEncounter, sendEnemyFlyby, updateEnemyTrain,
    bulletBlocked, blastBlocked, cineCam,
} from './runtime.js';
import { journeyScene } from './journey.js';

let repairInstalled = 0, repairArmed = true, hackArmed = true, hackCd = 0;
let discovered = false, platformUnlocked = false, depotAwake = false, flybySent = false;

export function resetStation() {
    repairInstalled = 0; repairArmed = true; hackArmed = true; hackCd = 0;
    discovered = false; platformUnlocked = false; depotAwake = false; flybySent = false;
}

// Satu titik per robot, disebar ke seluruh gudang + ruang C1. Semuanya berada
// di aisle kosong, jauh dari furnitur, supply, dan sel SA/S/T.
const DEPOT_SPOTS = Object.freeze([
    [9, 46], [14, 46], [23, 46], [8, 39], [18, 39], [23, 37],
    [8, 30], [15, 30], [24, 29], [14, 20], [19, 18], [26, 18],
    [12, 48], [18, 48], [22, 44], [9, 44], [17, 42], [21, 40],
    [26, 43], [26, 47], [8, 36], [16, 37], [24, 34], [22, 30],
    [12, 26], [10, 20],
]);

function spawnDepot() {
    const C = CFG.campaign.stage5.encounters.depot;
    // `active=false`: safe-area hold baru dilepas setelah player meninggalkan SA.
    let k = 0;
    for (const cls of ['C', 'B', 'A']) for (let i = 0; i < (C[cls] | 0); i++, k++) {
        const p = DEPOT_SPOTS[k % DEPOT_SPOTS.length], w = cellPos(p[0], p[1]);
        spawnOne(cls, w.x + rand(-3, 3), w.z + rand(-3, 3), 'depot', false);
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
    showStageMsg('SAFE AREA CLEARED — HOSTILE UNITS ARE CLOSING IN', 3400);
}

function beginRepair() {
    setPhase('repairing'); repairMarker.visible = false;
    clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    beginRepairMinigame({
        head: 'AUXILIARY GENERATOR — FIELD REPAIR',
        startIndex: repairInstalled,
        onProgress: k => { repairInstalled = k; },
        onSuccess: () => {
            repairInstalled = REPAIR_PARTS.length; setPhase('board');
            litScreen(generatorScreen, EMISSIVE_MAX * 0.75);
            boardMarker.visible = true;
            queueDialogue('powerBack'); queueDialogue('routeReady'); queueDialogue('letsMove');
            playSFX(sfxPurchase, 0.55);
            showStageMsg('AUXILIARY POWER RESTORED — BOARD THE TRAIN', 4500);
        },
        onFail: () => {
            setPhase('repair'); repairMarker.visible = true;
            showStageMsg(`REPAIR ABORTED — ${repairInstalled}/${REPAIR_PARTS.length} COMPONENTS INSTALLED`, 3600);
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
    beginHackMinigame({
        head: 'C1 PLATFORM ACCESS — ICE BREACH',
        sub: 'Override station security and unlock the platform door.',
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
    repairInstalled, repairTotal: REPAIR_PARTS.length, repairArmed, hackArmed, hackCd,
    platformUnlocked, depotAwake, flybySent,
});

export const stationScene = {
    id: 'campaign-5-station',

    enter() {
        spawnDepot(); placeSupplies(); placeCrates();
        startOpening();
    },

    updateMode(dt) {
        if (phase === 'opening') updateOpeningCine(dt);
        updateStationDoors(dt, platformUnlocked); updateEnemyTrain(dt);
        pulseMarkers();
        updateLandmarks(dt, repairInstalled >= REPAIR_PARTS.length, platformUnlocked);
        if (hackCd > 0) hackCd = Math.max(0, hackCd - dt);

        if (phase === 'clearDepot') {
            if (!depotAwake && !touchesSafeArea(camera.position.x, camera.position.z, player.radius))
                wakeDepotRobots();
            if (!discovered && camera.position.z < cellPos(15, 25).z) {
                discovered = true; queueDialogue('discoverTrain'); queueDialogue('powerDead');
            }
            if (countEncounter('depot') === 0) {
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
            if (Math.hypot(camera.position.x - S5_BOARD.x, camera.position.z - S5_BOARD.z)
                < CFG.campaign.stage5.boardRange) enterSub(journeyScene);
        }
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(playerStationWalk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
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
        if (phase === 'clearDepot') return `STATION SECURITY — Robots: ${countEncounter('depot')}`;
        if (phase === 'repair' || phase === 'repairing') return `GENERATOR C2 — ${repairInstalled}/${REPAIR_PARTS.length}`;
        if (phase === 'hack') {
            if (countStageRobots(5) > 0) return `C1 ACCESS COMPUTER — Clear alarm squad: ${countStageRobots(5)}`;
            if (hackCd > 0) return `C1 ACCESS COMPUTER REBOOT — ${Math.ceil(hackCd)}s`;
            return 'C1 ACCESS COMPUTER — ICE BREACH READY';
        }
        return 'BANDUNG ROUTE AUTHORIZED — BOARD THE TRAIN';
    },

    radarLandmarks(plot) {
        let p = null;
        if (phase === 'repair' || phase === 'repairing') p = S5_GENERATOR;
        else if (phase === 'hack') p = S5_TERMINAL;
        else if (phase === 'board') p = S5_BOARD;
        if (p) plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
