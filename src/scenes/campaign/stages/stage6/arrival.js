// Stage 6 — CHAPTER 1 "ARRIVAL" (stasiun Bandung).
//
// Alur mengikuti denah CSV user:
//   opening  -> cutscene pembuka di SAFE AREA
//   stockUp  -> lewati pintu `-`, isi ulang di gudang `W`
//   clearHall-> pintu `-` kedua membuka hall; garnisun bangun begitu player
//               benar-benar keluar dari SA + gudang
//   findKey  -> tiga rak `K` bisa digeledah; SATU menyimpan kunci (acak tiap
//               run). TIDAK ADA petunjuk lain: menggeledah rak itu SATU-SATUNYA
//               cara membuka ruang generator (permintaan user 2026-08-12 —
//               terminal `I` yang dulu bisa di-hack di depan pintu `=` DIHAPUS).
//   powerGrid-> kunci MELEPAS GEMBOK pintu `=` (daunnya tetap tertutup dan baru
//               bergeser saat player mendekat); tiga generator `G` dipulihkan
//               dari titik `H`
//   exfil    -> pintu `@` terbuka; capai titik `F` untuk menutup chapter
//
// DUA MESIN PEMBUAT ROBOT (permintaan user 2026-08-09) berdiri di ujung utara
// gudang, tepat sebelum lorong layanan menuju `F`. Mereka menyala bersama
// garnisun hall, mencetak robot ber-encounter `factory` (jadi tak pernah menahan
// gate `clearHall`), dan KEDUANYA WAJIB HANCUR sebelum titik `F` mau menutup
// chapter — mendekat lebih awal hanya membuat Gibran menolak.
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
import { campaignRobotAI, campaignClampRobot, countStageRobots } from '../../utility/common.js';
import { beginRepairMinigame, ADVANCED_REPAIR_PARTS } from '../../utility/repairMinigame.js';
import { slideWalk } from '../../../../utils/collision.js';
import { setActiveStageLights } from '../../../../world/lighting.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import {
    phase, setPhase, cine, setCine, cineCam, cleanupCine, enterSub,
    queueDialogue, dialogueIdle, clearDialogueQueue, countEncounter, spawnEncounter,
    machineBulletHits, machineWreckFx,
} from './runtime.js';
import {
    CELL, WALL_H, cellPos, mapCellAt, touchesSafeArea,
    S6_START, S6_FINISH, RACK_POINTS, GENERATOR_POINTS, MACHINE_POINTS,
    SUPPLY_POINTS, CRATE_POINTS, ENCOUNTER_POINTS,
    stage6Walk, robotWalk, resolve, groundHeight, stage6SegHitsWall,
    doorBlocksShot, doorsWalkable, doorClampShot,
    doorOf, stage6Nav, updateDoors, updateAutoDoors, updateMachinery, updateSparks,
    activateSparks, pulseMarkers, setMarkers, setRackSearched,
    setGeneratorOnline, resetWorldVisuals,
    stage6Machines, armMachines, killMachine, updateMachineVisual,
} from './world.js';
import { hqScene } from './hq.js';

const C6 = () => CFG.campaign.stage6;

let keyRack = 0, hasKey = false;
let rackSearched = [false, false, false], rackProgress = [0, 0, 0];
let generatorOnline = [false, false, false], generatorStep = [0, 0, 0];
let generatorArmed = [true, true, true];
let interactionKind = '';
let hallAwake = false, hallSpawned = false, gridSpawned = false, exfilSpawned = false;
let enteredSupply = false, enteredHall = false, chapterDone = false, elapsed = 0;
let machineT = 0, exitWarnArmed = true;

export function resetArrival() {
    keyRack = 0; hasKey = false;
    rackSearched = [false, false, false]; rackProgress = [0, 0, 0];
    generatorOnline = [false, false, false]; generatorStep = [0, 0, 0];
    generatorArmed = [true, true, true];
    interactionKind = '';
    hallAwake = false; hallSpawned = false; gridSpawned = false; exfilSpawned = false;
    enteredSupply = false; enteredHall = false; chapterDone = false; elapsed = 0;
    machineT = 0; exitWarnArmed = true;
}

const onlineCount = () => generatorOnline.reduce((n, v) => n + (v ? 1 : 0), 0);
const machinesAlive = () => stage6Machines().reduce((n, m) => n + (m.alive ? 1 : 0), 0);
const encounterPoints = name => ENCOUNTER_POINTS[name].map(([c, r]) => cellPos(c, r));

function hideInteraction() { interactionKind = ''; hideDownloadBar(); }

function near(p, range) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < range;
}

// Penanda lantai: SETIAP rak yang belum digeledah tetap ditandai sampai kuncinya
// ketemu — tak ada lagi petunjuk yang mempersempitnya ke satu rak, jadi player
// memang harus menggeledah sendiri (permintaan user 2026-08-12).
function syncMarkers() {
    const racks = RACK_POINTS.map((_, i) =>
        phase === 'findKey' && !hasKey && !rackSearched[i]);
    const repairs = GENERATOR_POINTS.map((_, i) => phase === 'powerGrid' && !generatorOnline[i]);
    // Titik `F` baru ditandai kalau kedua mesin sudah hancur — selama masih ada
    // yang berdiri, objektifnya adalah mesin itu.
    setMarkers({ racks, repairs,
        finish: phase === 'exfil' && machinesAlive() === 0 });
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

// --- Rak kunci --------------------------------------------------------------
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
    unlockGridDoor();
}

// Kunci hanya MELEPAS GEMBOK pintu `=` — daunnya tetap tertutup sampai player
// benar-benar berdiri di depannya (permintaan user 2026-08-12). Karena itu di
// sini tak ada `target = 1`: `updateAutoDoors` yang mengurusnya begitu gemboknya
// lepas, sama seperti pintu otomatis lain di stage ini.
function unlockGridDoor() {
    const grid = doorOf('grid');
    if (grid) grid.locked = false;
    setPhase('powerGrid');
    if (!gridSpawned) {
        gridSpawned = true;
        spawnEncounter(encounterPoints('grid'), 'grid', C6().encounters.grid, true);
    }
    queueDialogue('gridOpen');
    showStageMsg('SERVICE DOOR UNLOCKED — RESTORE ALL THREE GENERATORS', 4300);
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

// --- Mesin pembuat robot gudang --------------------------------------------
function destroyMachine(m) {
    killMachine(m.id);
    machineWreckFx(m.x, m.z);
    showStageMsg(`ROBOT FABRICATOR DESTROYED — ${machinesAlive()}/${MACHINE_POINTS.length} LEFT`, 3000);
    if (machinesAlive() === 0) queueDialogue('fabricatorsClear');
    syncMarkers();
}

function updateMachines(dt) {
    const C = C6();
    const list = stage6Machines();
    machineBulletHits(list, C.machineHitRadius);
    for (const m of list) if (m.alive && m.hp <= 0) destroyMachine(m);
    for (const m of list) if (m.hitT > 0) m.hitT = Math.max(0, m.hitT - dt * 4);
    if (!hallAwake || machinesAlive() === 0) return;
    machineT -= dt;
    if (machineT > 0) return;
    machineT = Math.max(1, C.machineWaveSec || 9);
    // Pagar `machineMaxAlive` menghitung SELURUH robot stage: garnisun hall yang
    // masih utuh sudah menahan produksinya sendiri.
    if (countStageRobots(6) >= (C.machineMaxAlive || 16)) return;
    const n = Math.max(1, (C.machineWaveCount | 0) || 2);
    for (const m of list) {
        if (!m.alive || !m.active) continue;
        for (let k = 0; k < n; k++) spawnEncounter([m.hatch], 'factory', { C: 1 }, true);
    }
}

// --- Penutup chapter -------------------------------------------------------
function finishChapter() {
    if (chapterDone) return;
    chapterDone = true; setPhase('complete'); hideInteraction();
    setMarkers({}); clearDialogueQueue(); cleanupCine(0);
    enterSub(hqScene, { fade: false });
}

function updateChapterEnd() {
    if (!cine) {
        if (!near(S6_FINISH, C6().finishRange)) { exitWarnArmed = true; return; }
        // Pintu keluar tidak melayani siapa pun selama mesinnya masih mencetak.
        if (machinesAlive() > 0) {
            if (!exitWarnArmed) return;
            exitWarnArmed = false;
            queueDialogue('machinesFirst', true);
            showStageMsg(`DESTROY BOTH FABRICATORS FIRST — ${machinesAlive()} LEFT`, 3200);
            return;
        }
        // Tidak ada dialog, letterbox, pembekuan input, atau fade. Chapter HQ
        // langsung masuk pada frame pemicu yang sama.
        finishChapter();
        return;
    }
}

// --- Bangun garnisun hall --------------------------------------------------
function wakeHall() {
    if (hallAwake) return;
    hallAwake = true;
    queueDialogue('hallContact'); queueDialogue('hallFabricators');
    // Mesin gudang ikut menyala bersama garnisunnya.
    armMachines(true);
    machineT = Math.max(1, C6().machineFirstWaveSec || 5);
    for (const z of robots) if (z.stage === 6 && z.encounter === 'hall') {
        z.state = 'chasing'; z.moving = false; z.aiming = false;
    }
}

export const arrivalDebug = () => ({
    keyRack, hasKey,
    rackSearched: [...rackSearched], rackProgress: [...rackProgress],
    generatorOnline: [...generatorOnline], generatorStep: [...generatorStep],
    generatorArmed: [...generatorArmed], generatorsOnline: onlineCount(),
    interaction: interactionKind,
    hallAwake, hallSpawned, gridSpawned, exfilSpawned,
    machinesAlive: machinesAlive(), machineT, exitWarnArmed,
    enteredSupply, enteredHall, chapterDone, elapsed,
});

export const arrivalScene = {
    id: 'campaign-6-arrival',

    enter() {
        // Chapter 1 memakai set lampu stage (`campaign-6`); chapter 2 punya
        // sendiri, jadi masuk/ulang ke sini harus mengembalikannya.
        // Chapter memilih root dunianya sendiri (2026-08-13, optimasi): chapter
        // yang tak aktif tak boleh ikut ditelusuri renderer.
        setActiveCampaignWorldRoots('campaign-6');
        setActiveStageLights('campaign-6');
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
        updateAutoDoors(dt); updateDoors(dt); updateSparks(dt);
        updateMachinery(dt, generatorOnline); updateMachineVisual(dt);
        pulseMarkers(dt, elapsed);
        if (phase === 'opening') { updateOpeningCine(dt); return; }
        if (phase === 'complete') return;
        // Mesin gudang menembak balik di SETIAP fase sesudah hall bangun.
        if (!cine) updateMachines(dt);
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
        if (phase === 'findKey') { updateRacks(dt); return; }
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
            || doorClampShot(b);
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
        return campaignRobotAI(z, dt, step, {
            walkable: robotWalk, resolve, nav: stage6Nav(),
            los: (x0, z0, x1, z1) => !stage6SegHitsWall(x0, z0, x1, z1)
                && !doorBlocksShot(x0, z0, x1, z1),
            pathWalkable: doorsWalkable,
        });
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
            return `RECOVER THE SERVICE KEY — ${left} RACKS UNSEARCHED`;
        }
        if (phase === 'powerGrid') return `RESTORE THE GENERATORS — ${onlineCount()}/${GENERATOR_POINTS.length}`;
        if (phase === 'exfil') {
            return machinesAlive() > 0
                ? `DESTROY BOTH FABRICATORS — ${machinesAlive()}/${MACHINE_POINTS.length} LEFT`
                : 'POWER RESTORED — REACH THE ACCESS DOOR';
        }
        return 'HEADQUARTERS ACCESS OPEN';
    },

    radarLandmarks(plot) {
        const marks = [];
        if (phase === 'stockUp') marks.push(cellPos(3.5, 35));
        else if (phase === 'exfil' && machinesAlive() > 0) {
            for (const m of stage6Machines()) if (m.alive) marks.push(m);
        } else if (phase === 'findKey') {
            for (let i = 0; i < RACK_POINTS.length; i++)
                if (!rackSearched[i]) marks.push(RACK_POINTS[i].stand);
        } else if (phase === 'powerGrid') {
            for (let i = 0; i < GENERATOR_POINTS.length; i++)
                if (!generatorOnline[i]) marks.push(GENERATOR_POINTS[i].stand);
        } else if (phase === 'exfil') marks.push(S6_FINISH);
        for (const p of marks)
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
