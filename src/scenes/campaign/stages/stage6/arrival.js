// Stage 6 — CHAPTER 1 "ARRIVAL" (stasiun Bandung).
//
// Alur mengikuti denah CSV user:
//   opening  -> cutscene pembuka di SAFE AREA
//   stockUp  -> lewati pintu `-`, isi ulang di gudang `W`
//   clearHall-> pintu `-` kedua membuka hall; garnisun bangun begitu player
//               benar-benar keluar dari SA + gudang
//   findKey  -> tiga rak `K` bisa digeledah; SATU menyimpan kunci (acak tiap
//               run). Terminal `I` menunjukkan rak yang benar.
//   powerGrid-> kunci membuka pintu `=`; tiga generator `G` dipulihkan dari
//               titik `H`
//   exfil    -> pintu `@` terbuka; capai titik `F` untuk menutup chapter
//
// Semua jarak/durasi/jumlah robot dari `CFG.campaign.stage6`.

import { CFG } from '../../../../core/config.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import { camera, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageMsg, showDownloadBar, setDownloadProgress, hideDownloadBar,
    setCineBars, setCineFade, showCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import { campaignRobotAI, campaignClampRobot } from '../../utility/common.js';
import { beginSignalTraceMinigame } from '../../utility/signalTraceMinigame.js';
import { beginRepairMinigame, ADVANCED_REPAIR_PARTS } from '../../utility/repairMinigame.js';
import { slideWalk } from '../../../../utils/collision.js';
import {
    phase, setPhase, cine, setCine, cineCam, cleanupCine, enterSub,
    queueDialogue, dialogueIdle, countEncounter, spawnEncounter,
} from './runtime.js';
import {
    CELL, WALL_H, cellPos, mapCellAt, touchesSafeArea,
    S6_START, S6_INFO, S6_FINISH, RACK_POINTS, GENERATOR_POINTS,
    SUPPLY_POINTS, CRATE_POINTS, ENCOUNTER_POINTS,
    stage6Walk, robotWalk, resolve, groundHeight, stage6SegHitsWall, doorBlocksShot,
    doorOf, stage6Nav, updateDoors, updateAutoDoors, updateMachinery, updateSparks,
    activateSparks, pulseMarkers, setMarkers, setRackSearched, setInfoRead,
    setGeneratorOnline, resetWorldVisuals,
} from './world.js';
import { hqScene } from './hq.js';

const C6 = () => CFG.campaign.stage6;

let keyRack = 0, hasKey = false, infoRead = false;
let rackSearched = [false, false, false], rackProgress = [0, 0, 0];
let generatorOnline = [false, false, false], generatorStep = [0, 0, 0];
let generatorArmed = [true, true, true], infoArmed = true, infoHackCd = 0;
let interactionKind = '';
let hallAwake = false, hallSpawned = false, gridSpawned = false, exfilSpawned = false;
let enteredSupply = false, enteredHall = false, chapterDone = false, elapsed = 0;

export function resetArrival() {
    keyRack = 0; hasKey = false; infoRead = false;
    rackSearched = [false, false, false]; rackProgress = [0, 0, 0];
    generatorOnline = [false, false, false]; generatorStep = [0, 0, 0];
    generatorArmed = [true, true, true]; infoArmed = true; infoHackCd = 0;
    interactionKind = '';
    hallAwake = false; hallSpawned = false; gridSpawned = false; exfilSpawned = false;
    enteredSupply = false; enteredHall = false; chapterDone = false; elapsed = 0;
}

const onlineCount = () => generatorOnline.reduce((n, v) => n + (v ? 1 : 0), 0);
const encounterPoints = name => ENCOUNTER_POINTS[name].map(([c, r]) => cellPos(c, r));

function hideInteraction() { interactionKind = ''; hideDownloadBar(); }

function near(p, range) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < range;
}

// Penanda lantai: sebelum terminal `I` dibaca ketiga rak ditandai (player harus
// menggeledah sendiri); sesudahnya HANYA rak yang benar yang tetap menyala.
function syncMarkers() {
    const racks = RACK_POINTS.map((_, i) => {
        if (hasKey || rackSearched[i]) return false;
        if (phase !== 'findKey') return false;
        return infoRead ? i === keyRack : true;
    });
    const repairs = GENERATOR_POINTS.map((_, i) => phase === 'powerGrid' && !generatorOnline[i]);
    setMarkers({ racks, repairs, info: phase === 'findKey' && !infoRead, finish: phase === 'exfil' });
}

function placeSupplies() {
    for (const p of SUPPLY_POINTS) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}
function placeCrates() { for (const p of CRATE_POINTS) spawnCrate(p.x, p.z, 0); }

// --- Cutscene pembuka ------------------------------------------------------
function finishOpening() {
    cleanupCine(C6().fadeSec); setPhase('stockUp');
    showStageMsg('GEAR UP IN THE SUPPLY ROOM', 4200);
    syncMarkers();
}

function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true);
    setCine({ kind: 'opening', t: 0, dialogueStarted: false, fading: false, fadeT: 0 });
    cineCam.x = -104; cineCam.y = 92; cineCam.z = 112;
    setCineFocus(S6_START.x - CELL * 2, S6_START.z - CELL, true);
    showCutsceneSkip(finishOpening);
}

function updateOpeningCine(dt) {
    if (!cine) return;
    const C = C6();
    cine.t += dt;
    const k = Math.min(1, cine.t / Math.max(1, C.openingMinSec));
    cineCam.x = -104 + 27 * k; cineCam.y = 92 + 18 * k; cineCam.z = 112 - 25 * k;
    setCineFocus(S6_START.x - CELL * (2 + k * 3), S6_START.z - CELL * (1 + k * 2), true);
    if (!cine.dialogueStarted && cine.t >= C.openingDialogueDelaySec) {
        cine.dialogueStarted = true;
        queueDialogue('arrivalSystem'); queueDialogue('arrivalCommand'); queueDialogue('arrivalGibran');
    }
    if (!cine.fading && cine.dialogueStarted && cine.t >= C.openingMinSec && dialogueIdle()) {
        cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
    }
    if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishOpening();
}

// --- Rak kunci + terminal informasi ---------------------------------------
function updateRacks(dt) {
    const C = C6();
    let active = -1;
    for (let i = 0; i < RACK_POINTS.length; i++)
        if (!rackSearched[i] && near(RACK_POINTS[i].stand, C.rackRange)) { active = i; break; }
    for (let i = 0; i < rackProgress.length; i++) if (i !== active) rackProgress[i] = 0;
    if (active < 0) {
        if (interactionKind.startsWith('rack')) hideInteraction();
        return;
    }
    const ik = `rack-${active}`;
    if (interactionKind !== ik) { interactionKind = ik; showDownloadBar('SEARCHING SUPPLY RACK'); }
    rackProgress[active] = Math.min(C.rackSearchSec, rackProgress[active] + dt);
    setDownloadProgress(rackProgress[active] / Math.max(0.01, C.rackSearchSec));
    if (rackProgress[active] < C.rackSearchSec) return;
    rackSearched[active] = true; hideInteraction();
    if (active !== keyRack) {
        setRackSearched(active, false);
        showStageMsg('RACK EMPTY', 2200);
        syncMarkers();
        return;
    }
    hasKey = true; setRackSearched(active, true);
    activateSparks(RACK_POINTS[active], 1.4);
    queueDialogue('keyFound');
    openGridDoor();
}

function finishInfoHack() {
    infoRead = true; hideInteraction(); setInfoRead(true);
    queueDialogue('infoRead');
    showStageMsg(`MAINTENANCE LOG - KEY LOGGED TO RACK ${keyRack + 1} OF 3`, 4200);
    syncMarkers();
}

function infoHackFailed(reason) {
    infoArmed = false;
    if (reason !== 'fail') {
        showStageMsg('SIGNAL TRACE ABORTED - STEP AWAY, THEN TRY AGAIN', 3200);
        return;
    }
    const C = C6();
    infoHackCd = C.signalCooldownSec;
    spawnEncounter(encounterPoints('grid'), 'signalAlarm', C.encounters.signalAlarm, true);
    showStageMsg(`TRACE ALARM - TERMINAL REBOOTS IN ${Math.round(infoHackCd)}s`, 4200);
}

function updateInfoTerminal(dt) {
    const C = C6();
    infoHackCd = Math.max(0, infoHackCd - dt);
    if (infoRead) return;
    if (!near(S6_INFO, C.infoRange)) {
        infoArmed = true;
        return;
    }
    if (!infoArmed || infoHackCd > 0) return;
    infoArmed = false;
    beginSignalTraceMinigame({
        head: 'MAINTENANCE LOG TERMINAL',
        sub: 'Capture the encrypted maintenance carriers to reveal the service-key record.',
        onSuccess: finishInfoHack,
        onFail: infoHackFailed,
    });
}

function openGridDoor() {
    const grid = doorOf('grid');
    if (grid) { grid.target = 1; grid.locked = false; }
    setPhase('powerGrid');
    if (!gridSpawned) {
        gridSpawned = true;
        spawnEncounter(encounterPoints('grid'), 'grid', C6().encounters.grid, true);
    }
    queueDialogue('gridOpen');
    showStageMsg('RESTORE ALL THREE GENERATORS — 0/3', 4300);
    syncMarkers();
}

// --- Generator -------------------------------------------------------------
function generatorRestored(i) {
    generatorStep[i] = ADVANCED_REPAIR_PARTS.length;
    generatorOnline[i] = true;
    setGeneratorOnline(i, true); activateSparks(GENERATOR_POINTS[i], 2.2);
    if (onlineCount() === 1) queueDialogue('generatorFirst');
    if (onlineCount() < GENERATOR_POINTS.length) {
        showStageMsg(`GENERATOR ONLINE - ${onlineCount()}/${GENERATOR_POINTS.length}`, 2600);
        syncMarkers(); return;
    }
    beginExfil();
}

function beginGeneratorRepair(i) {
    generatorArmed[i] = false;
    beginRepairMinigame({
        head: `GENERATOR ${i + 1} - FIELD RESTART`,
        parts: ADVANCED_REPAIR_PARTS,
        startIndex: generatorStep[i],
        onProgress: k => { generatorStep[i] = k; },
        onSuccess: () => generatorRestored(i),
        onFail: () => showStageMsg(
            `REPAIR ABORTED - ${generatorStep[i]}/${ADVANCED_REPAIR_PARTS.length} STEPS COMPLETE`, 3400),
    });
}

function updateGenerators() {
    const C = C6();
    let active = -1;
    for (let i = 0; i < GENERATOR_POINTS.length; i++)
        if (!generatorOnline[i] && near(GENERATOR_POINTS[i].stand, C.repairRange)) { active = i; break; }
    for (let i = 0; i < generatorArmed.length; i++) if (i !== active) generatorArmed[i] = true;
    if (active >= 0 && generatorArmed[active]) beginGeneratorRepair(active);
}

function beginExfil() {
    setPhase('exfil');
    const chapter = doorOf('chapter');
    if (chapter) { chapter.target = 1; chapter.locked = false; }
    if (!exfilSpawned) {
        exfilSpawned = true;
        spawnEncounter(encounterPoints('exfil'), 'exfil', C6().encounters.exfil, true);
    }
    queueDialogue('powerRestored'); queueDialogue('exfilCall');
    showStageMsg('POWER RESTORED — THE ACCESS DOOR IS OPEN', 4300);
    addCamShake(1.6); syncMarkers();
}

// --- Penutup chapter -------------------------------------------------------
function finishChapter() {
    if (chapterDone) return;
    chapterDone = true; setPhase('complete'); hideInteraction();
    setMarkers({}); cleanupCine(0);
    enterSub(hqScene);
}

function updateChapterEnd(dt) {
    if (!cine) {
        if (!near(S6_FINISH, C6().finishRange)) return;
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setCinematicActive(true); setCineBars(true);
        setCine({ kind: 'handoff', t: 0, fading: false, fadeT: 0 });
        cineCam.x = -70; cineCam.y = 74; cineCam.z = 78;
        setCineFocus(S6_FINISH.x, S6_FINISH.z, true);
        queueDialogue('chapterEnd');
        showCutsceneSkip(finishChapter);
        return;
    }
    cine.t += dt;
    if (!cine.fading && dialogueIdle() && cine.t >= C6().chapterHoldSec) {
        cine.fading = true; cine.fadeT = 0; setCineFade(1, C6().fadeSec);
    }
    if (cine.fading && (cine.fadeT += dt) >= C6().fadeSec) finishChapter();
}

// --- Bangun garnisun hall --------------------------------------------------
function wakeHall() {
    if (hallAwake) return;
    hallAwake = true; queueDialogue('hallContact');
    for (const z of robots) if (z.stage === 6 && z.encounter === 'hall') {
        z.state = 'chasing'; z.moving = false; z.aiming = false;
    }
}

export const arrivalDebug = () => ({
    keyRack, hasKey, infoRead,
    rackSearched: [...rackSearched], rackProgress: [...rackProgress],
    generatorOnline: [...generatorOnline], generatorStep: [...generatorStep],
    generatorArmed: [...generatorArmed], generatorsOnline: onlineCount(),
    infoArmed, infoHackCd, interaction: interactionKind,
    hallAwake, hallSpawned, gridSpawned, exfilSpawned,
    enteredSupply, enteredHall, chapterDone, elapsed,
});

export const arrivalScene = {
    id: 'campaign-6-arrival',

    enter() {
        resetArrival(); resetWorldVisuals();
        // Rak mana yang menyimpan kunci DIACAK tiap kali chapter dimasuki.
        keyRack = Math.floor(Math.random() * RACK_POINTS.length) % RACK_POINTS.length;
        hallSpawned = true;
        spawnEncounter(encounterPoints('hall'), 'hall', C6().encounters.hall, false);
        placeSupplies(); placeCrates();
        camera.position.set(S6_START.x, CFG.player.eyeHeight, S6_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening();
    },

    exit() { hideInteraction(); setMarkers({}); },

    updateMode(dt) {
        elapsed += dt;
        updateAutoDoors(); updateDoors(dt); updateSparks(dt);
        updateMachinery(dt, generatorOnline); pulseMarkers(dt, elapsed);
        if (phase === 'opening') { updateOpeningCine(dt); return; }
        if (phase === 'complete') return;
        if (phase === 'exfil') { updateChapterEnd(dt); return; }

        const cell = mapCellAt(camera.position.x, camera.position.z);
        if (!enteredSupply && cell.token === 'W') {
            enteredSupply = true; queueDialogue('supplyRoom');
        }
        if (!enteredHall && cell.r < 35 && !touchesSafeArea(camera.position.x, camera.position.z, player.radius)) {
            enteredHall = true;
            if (phase === 'stockUp') {
                setPhase('clearHall');
                showStageMsg('SECURE THE TERMINAL HALL', 4200);
            }
            wakeHall();
        }

        if (phase === 'clearHall') {
            if (hallSpawned && hallAwake && countEncounter('hall') === 0) {
                setPhase('findKey');
                queueDialogue('keyHunt');
                showStageMsg('THE SERVICE DOOR IS KEYED — SEARCH THE SUPPLY RACKS', 4600);
                syncMarkers();
            }
            return;
        }
        if (phase === 'findKey') { updateInfoTerminal(dt); updateRacks(dt); return; }
        if (phase === 'powerGrid') { updateGenerators(); return; }
    },

    // --- Hook scene ---------------------------------------------------------
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage6Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
        slideWalk(stage6Walk, pos, oldX, oldZ, player.radius);
    },
    groundHeight(x, z, feetY) { return groundHeight(x, z, feetY); },
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        if (b.mesh.position.y >= WALL_H) return false;
        return stage6SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
            || doorBlocksShot(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        if (y >= WALL_H) return false;
        return stage6SegHitsWall(x0, z0, x1, z1) || doorBlocksShot(x0, z0, x1, z1);
    },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage6Walk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },
    robotAI(z, dt, step) {
        if (z.encounter === 'hall' && !hallAwake) {
            z.state = 'idle'; z.moving = false; z.aiming = false; return {};
        }
        return campaignRobotAI(z, dt, step, { walkable: robotWalk, resolve, nav: stage6Nav() });
    },
    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: robotWalk, resolve });
    },
    clampDropPos(x, z) {
        if (stage6Walk(x, z, 2)) return [x, z];
        return [S6_START.x, S6_START.z];
    },

    hudStatus() {
        if (phase === 'opening') return 'STAGE 6 — FALSE HOMECOMING';
        if (phase === 'stockUp') return 'SUPPLY ROOM — RESTOCK BEFORE YOU MOVE OUT';
        if (phase === 'clearHall') return `SECURE THE TERMINAL HALL — Robots: ${countEncounter('hall')}`;
        if (phase === 'findKey') {
            const left = rackSearched.filter(v => !v).length;
            return infoRead
                ? `RECOVER THE SERVICE KEY — RACK ${keyRack + 1} OF ${RACK_POINTS.length}`
                : `RECOVER THE SERVICE KEY — ${left} RACKS UNSEARCHED`;
        }
        if (phase === 'powerGrid') return `RESTORE THE GENERATORS — ${onlineCount()}/${GENERATOR_POINTS.length}`;
        if (phase === 'exfil') return 'POWER RESTORED — REACH THE ACCESS DOOR';
        return 'HEADQUARTERS ACCESS OPEN';
    },

    radarLandmarks(plot) {
        const marks = [];
        if (phase === 'stockUp') marks.push(cellPos(3.5, 35));
        else if (phase === 'findKey') {
            if (!infoRead) marks.push(S6_INFO);
            for (let i = 0; i < RACK_POINTS.length; i++) {
                if (rackSearched[i]) continue;
                if (infoRead && i !== keyRack) continue;
                marks.push(RACK_POINTS[i].stand);
            }
        } else if (phase === 'powerGrid') {
            for (let i = 0; i < GENERATOR_POINTS.length; i++)
                if (!generatorOnline[i]) marks.push(GENERATOR_POINTS[i].stand);
        } else if (phase === 'exfil') marks.push(S6_FINISH);
        for (const p of marks)
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
