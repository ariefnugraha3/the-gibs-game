// Stage 6 — CHAPTER 2 "FINISH" (kantor markas Bandung).
//
// Alur mengikuti permintaan user:
//   office  -> masuk dari SF, cari jalan ke ruang server. Kantor sudah dikuasai
//              robot, jadi garnisunnya besar; tiga pintu RUSAK (`@`) memaksa
//              player memutar, dan pemicu `E1`/`E2`/`E3` memberi tahu kenapa.
//   upload  -> berdiri di titik `H` memulai upload kill-switch. Uploadnya SELALU
//              berhenti di `uploadFailFraction` — hanya transmitter pusat IKN
//              yang berwenang menyiarkannya.
//   purge   -> jejaknya terdeteksi: gelombang baru turun DI SELURUH kantor
//              termasuk safe area, dan DUA mesin pembuat robot menyala.
//   escape  -> semua robot habis + kedua mesin hancur, barulah kembali ke `SF`
//              menutup stage.

import { CFG } from '../../../../core/config.js';
import { player, robots, bullets, keys, stats, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageMsg, showDownloadBar, setDownloadProgress, hideDownloadBar,
    setCineBars, setCineFade, showCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import { queueBoom } from '../../../../entities/robots.js';
import { spawnBloodBurst, explodeAt } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import { campaignRobotAI, campaignClampRobot, countStageRobots } from '../../utility/common.js';
import { beginStageTransition } from '../../utility/transition.js';
import { slideWalk } from '../../../../utils/collision.js';
import { segPointDist2 } from '../../../../utils/math.js';
import { stage7Scene } from '../stage7.js';
import {
    phase, setPhase, complete, setComplete, cine, setCine, cineCam, cleanupCine,
    queueDialogue, dialogueIdle, dialogueCurrentLine, dialogueCharCount,
    spawnEncounter, clearStageRobots, resetDialogue, setDialogueHook,
} from './runtime.js';
import {
    WALL_H, hqCellPos, HQ_START, HQ_UPLOAD, HQ_SERVERS,
    HQ_SUPPLY_POINTS, HQ_CRATE_POINTS, HQ_ENCOUNTER_POINTS,
    MACHINE_POINTS, EVENT_POINTS,
    hqWalk, hqTouchesSafeArea, hqResolve, hqGroundHeight, hqSegHitsWall, hqDoorBlocksShot,
    hqNav, hqMachines, updateHqDoors, updateHqAutoDoors, updateHqFx,
    hqSparks, setUploadMarker, setFinishMarker, pulseHqMarkers, setUploadAlarm,
    setLockdownLights, setMachineActive, killMachineVisual, resetHqVisuals,
} from './hqWorld.js';

const C6 = () => CFG.campaign.stage6;

let officeAwake = false, officeSpawned = false, purgeSpawned = false;
let uploadProgress = 0, uploadFailed = false, lockdown = false;
let machineT = 0, eventSeen = [false, false, false];
let elapsed = 0;

export function resetHq() {
    officeAwake = false; officeSpawned = false; purgeSpawned = false;
    uploadProgress = 0; uploadFailed = false; lockdown = false;
    machineT = 0; eventSeen = [false, false, false]; elapsed = 0;
}

const points = name => HQ_ENCOUNTER_POINTS[name].map(([c, r]) => hqCellPos(c, r));
const machinesAlive = () => hqMachines().reduce((n, m) => n + (m.alive ? 1 : 0), 0);
const near = (p, range) => Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < range;

function placeSupplies() {
    for (const p of HQ_SUPPLY_POINTS) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}
function placeCrates() { for (const p of HQ_CRATE_POINTS) spawnCrate(p.x, p.z, 0); }

// --- Garnisun kantor -------------------------------------------------------
// Legenda user: SA adalah safe area SAAT PERMAINAN DIMULAI. Jadi tak ada spawn
// di sana pada awal, dan garnisunnya tetap diam sampai player benar-benar
// meninggalkan ruang itu. Setelah upload, SA tak lagi kebal (fase `purge`).
function wakeOffice() {
    if (officeAwake) return;
    officeAwake = true; queueDialogue('officeContact');
    for (const z of robots) if (z.stage === 6 && z.encounter === 'office') {
        z.state = 'chasing'; z.moving = false; z.aiming = false;
    }
}

// --- Pemicu event pintu rusak ---------------------------------------------
function updateEventTriggers() {
    for (let i = 0; i < EVENT_POINTS.length; i++) {
        if (eventSeen[i]) continue;
        const e = EVENT_POINTS[i];
        if (Math.abs(camera.position.x - e.x) > e.hx || Math.abs(camera.position.z - e.z) > e.hz) continue;
        eventSeen[i] = true;
        queueDialogue(e.key);
        showStageMsg('THIS DOOR IS DEAD — FIND ANOTHER WAY AROUND', 3200);
        hqSparks({ x: e.x, z: e.z }, 1.2);
    }
}

// --- Mesin pembuat robot ---------------------------------------------------
function machineBulletHits() {
    const R2 = (C6().machineHitRadius || 22) ** 2;
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j], bx = b.mesh.position.x, bz = b.mesh.position.z;
        let hit = null;
        for (const m of hqMachines()) {
            if (!m.alive) continue;
            if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.x, 0, m.z) < R2) { hit = m; break; }
        }
        if (!hit) continue;
        if (b.explosive) {
            queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z,
                b.explodeR, false, 0, b.damage, b.boomSfx);
            hit.hp -= (b.damage != null ? b.damage : CFG.grenade.damage);
        } else {
            hit.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
            stats.hits++;
            spawnBloodBurst(bx, 12 + Math.random() * 6, bz, b.dir.x, b.dir.z, 2, 0.5, 1.4, 0xffb24a);
        }
        hit.hitT = 1;
        scene.remove(b.mesh); bullets.splice(j, 1);
    }
}

function destroyMachine(m) {
    killMachineVisual(m.id);
    explodeAt(new THREE.Vector3(m.x, 12, m.z), 28, 1, undefined);
    spawnGibs(m.x, 14, m.z, 12, 1, 0, 2.2, 0x3d444c, 0.4, 0x141210);
    spawnBloodDecal(m.x, m.z, 7, 0x141210);
    addCamShake(8);
    showStageMsg(`ROBOT FACTORY DESTROYED — ${machinesAlive()}/${MACHINE_POINTS.length} LEFT`, 3000);
    if (machinesAlive() === 0) queueDialogue('machinesDown');
}

function updateMachines(dt) {
    const C = C6();
    machineBulletHits();
    // `hp` baru berarti setelah mesin menyala (beginLockdown mengisinya).
    for (const m of hqMachines()) if (m.alive && m.hp <= 0) destroyMachine(m);
    for (const m of hqMachines()) if (m.hitT > 0) {
        m.hitT = Math.max(0, m.hitT - dt * 4);
    }
    if (machinesAlive() === 0) return;
    machineT -= dt;
    if (machineT > 0) return;
    machineT = Math.max(1, C.machineWaveSec || 9);
    if (countStageRobots(6) >= (C.machineMaxAlive || 16)) return;
    const n = Math.max(1, (C.machineWaveCount | 0) || 2);
    for (const m of hqMachines()) {
        if (!m.alive || !m.active) continue;
        for (let k = 0; k < n; k++) spawnEncounter([m.hatch], 'purge', { C: 1 }, true);
    }
}

// --- Upload ----------------------------------------------------------------
function beginLockdown() {
    if (lockdown) return;
    lockdown = true; setPhase('purge'); hideDownloadBar();
    setLockdownLights(true); setUploadAlarm(true);
    // HP baru diisi SAAT mesin menyala: sebelum itu rangkanya cuma perabot mati
    // (lihat catatan aktivasi di hqWorld.js), jadi ia tak bisa "hancur" duluan.
    for (const m of hqMachines()) { m.hp = C6().machineHp || 900; m.alive = true; m.hitT = 0; }
    for (const m of MACHINE_POINTS) setMachineActive(m.id, true);
    machineT = Math.max(1, C6().machineFirstWaveSec || 5);
    if (!purgeSpawned) {
        purgeSpawned = true;
        spawnEncounter(points('purge'), 'purge', C6().encounters.purge, true);
    }
    hqSparks(HQ_SERVERS, 5);
    addCamShake(3.2);
}

function failUpload() {
    if (uploadFailed) return;
    const C = C6();
    uploadFailed = true; uploadProgress = C.uploadFailFraction;
    showDownloadBar('UPLOAD FAILED — AUTHORITY DENIED'); setDownloadProgress(uploadProgress);
    setUploadAlarm(true); hqSparks(HQ_SERVERS, 3.5); addCamShake(2.8);
    for (const key of ['uploadFailed', 'gibranFailure', 'commandIKN', 'gibranIKN',
        'commandKertajati', 'lockdownWarning', 'commandEscape', 'gibranResolve']) queueDialogue(key);
    if (cine) { cine.stage = 'failure'; cine.stageT = 0; }
}

function startUpload() {
    if (cine || phase !== 'office') return;
    setPhase('upload'); releaseInputs(); clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    setCine({ kind: 'upload', stage: 'brief', t: 0, stageT: 0 });
    cineCam.x = -48; cineCam.y = 58; cineCam.z = 62;
    setCineFocus(HQ_SERVERS.x - 14, HQ_SERVERS.z, true);
    setUploadMarker(false); uploadProgress = 0; uploadFailed = false;
    queueDialogue('insertCommand'); queueDialogue('uploadSystem');
    showCutsceneSkip(endUploadCine);
}

function syncUploadPose() {
    const line = dialogueCurrentLine();
    if (!uploadFailed || !line) { setAvatarRadioPose(false); return; }
    const p = line.text.length ? dialogueCharCount() / line.text.length : 1;
    let gesture = 'commandNoExfil';
    if (line.key === 'gibranFailure' || line.key === 'gibranIKN') gesture = 'gibranShock';
    else if (line.key === 'gibranResolve') gesture = 'gibranAccepts';
    setAvatarRadioPose(true, -Math.PI / 2, gesture, p);
}

// Cutscene upload berakhir dengan MENGEMBALIKAN kendali (bukan mengakhiri stage):
// pertempuran terberatnya justru sesudah ini.
function endUploadCine() {
    if (!cine) return;
    beginLockdown();
    cleanupCine(C6().fadeSec); hideDownloadBar();
    showStageMsg('DESTROY BOTH ROBOT FACTORIES AND CLEAR THE FLOOR', 4600);
}

function updateCine(dt) {
    if (!cine || cine.kind !== 'upload') return;
    const C = C6();
    cine.t += dt; cine.stageT = (cine.stageT || 0) + dt;
    syncUploadPose();
    if (cine.stage === 'brief') {
        cineCam.x = -48 + Math.sin(cine.t * 0.35) * 3;
        if (dialogueIdle()) {
            cine.stage = 'transfer'; cine.stageT = 0;
            showDownloadBar('UPLOADING KILL-SWITCH'); setDownloadProgress(0);
        }
    } else if (cine.stage === 'transfer') {
        const k = Math.min(1, cine.stageT / Math.max(0.01, C.uploadSec));
        uploadProgress = C.uploadFailFraction * k; setDownloadProgress(uploadProgress);
        cineCam.x = -48 - k * 14; cineCam.y = 58 + k * 16; cineCam.z = 62 - k * 10;
        if (k >= 1) failUpload();
    } else if (cine.stage === 'failure') {
        const k = Math.min(1, cine.stageT / 10);
        cineCam.x = -62 - k * 15; cineCam.y = 74 + k * 14; cineCam.z = 52 + k * 26;
        if (lockdown) setCineFocus(camera.position.x, camera.position.z, true);
        if (lockdown && dialogueIdle() && cine.stageT >= C.lockdownTailSec) endUploadCine();
    }
}

// --- Penutup ---------------------------------------------------------------
function finishStage() {
    if (complete) return;
    setComplete(true); setPhase('complete');
    resetDialogue(); hideDownloadBar(); setFinishMarker(false); cleanupCine(0);
    beginStageTransition(stage7Scene);
}

export const hqDebug = () => ({
    officeAwake, officeSpawned, purgeSpawned,
    uploadProgress, uploadFailed, lockdown, machineT,
    machinesAlive: machinesAlive(), eventSeen: [...eventSeen], elapsed,
});

export const hqScene = {
    id: 'campaign-6-hq',

    enter() {
        resetHq(); resetHqVisuals();
        // Satu-satunya kait dialog stage ini: baris peringatan lockdown MEMULAI
        // lockdown-nya, jadi visual dan naskah tak pernah saling mendahului.
        setDialogueHook(key => { if (key === 'lockdownWarning') beginLockdown(); });
        // Sisa robot chapter 1 tidak ikut ke kantor.
        clearStageRobots();
        setPhase('office'); officeSpawned = true;
        spawnEncounter(points('office'), 'office', C6().encounters.office, false);
        placeSupplies(); placeCrates();
        camera.position.set(HQ_START.x, CFG.player.eyeHeight, HQ_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setCinematicActive(false); setCineBars(false);
        setUploadMarker(true);
        queueDialogue('hqCommand'); queueDialogue('hqGibran');
        showStageMsg('REACH THE SERVER ROOM AND UPLOAD THE KILL-SWITCH', 4600);
    },

    exit() { hideDownloadBar(); setUploadMarker(false); setFinishMarker(false); },

    updateMode(dt) {
        elapsed += dt;
        updateHqAutoDoors(camera.position.x, camera.position.z);
        updateHqDoors(dt); updateHqFx(dt); pulseHqMarkers(dt, elapsed);
        updateCine(dt);
        if (cine || complete) return;

        if (!officeAwake && !hqTouchesSafeArea(camera.position.x, camera.position.z, player.radius))
            wakeOffice();
        updateEventTriggers();

        if (phase === 'office') {
            if (near(HQ_UPLOAD, C6().uplinkRange)) startUpload();
            return;
        }
        if (phase === 'purge') {
            updateMachines(dt);
            if (machinesAlive() === 0 && countStageRobots(6) === 0) {
                setPhase('escape'); setFinishMarker(true);
                queueDialogue('floorClear');
                showStageMsg('FLOOR CLEAR — RETURN TO THE ENTRY POINT', 4400);
            }
            return;
        }
        if (phase === 'escape' && near(HQ_START, C6().finishRange)) finishStage();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(hqWalk, pos, oldX, oldZ, player.radius);
        hqResolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
        slideWalk(hqWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight(x, z, feetY) { return hqGroundHeight(x, z, feetY); },
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        if (b.mesh.position.y >= WALL_H) return false;
        return hqSegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
            || hqDoorBlocksShot(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        if (y >= WALL_H) return false;
        return hqSegHitsWall(x0, z0, x1, z1) || hqDoorBlocksShot(x0, z0, x1, z1);
    },
    grenadeCollide(g, oldX, oldZ) {
        if (!hqWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        hqResolve(g.mesh.position, 2, 0);
    },
    robotAI(z, dt, step) {
        if (z.encounter === 'office' && !officeAwake) {
            z.state = 'idle'; z.moving = false; z.aiming = false; return {};
        }
        return campaignRobotAI(z, dt, step, { walkable: hqWalk, resolve: hqResolve, nav: hqNav() });
    },
    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: hqWalk, resolve: hqResolve });
    },
    clampDropPos(x, z) {
        if (hqWalk(x, z, 2)) return [x, z];
        return [HQ_START.x, HQ_START.z];
    },
    hudStatus() {
        if (phase === 'office') return `HEADQUARTERS OFFICE — REACH THE SERVER ROOM | Robots: ${countStageRobots(6)}`;
        if (phase === 'upload') return `KILL-SWITCH UPLOAD — ${Math.round(uploadProgress * 100)}%`;
        if (phase === 'purge') return `FACTORIES ${machinesAlive()}/${MACHINE_POINTS.length} — Robots: ${countStageRobots(6)}`;
        if (phase === 'escape') return 'FLOOR CLEAR — RETURN TO THE ENTRY POINT';
        return 'UPLOAD FAILED — ROUTE TO IKN REQUIRED';
    },
    radarLandmarks(plot) {
        const marks = [];
        if (phase === 'office' || phase === 'upload') marks.push(HQ_UPLOAD);
        else if (phase === 'purge') { for (const m of hqMachines()) if (m.alive) marks.push(m); }
        else if (phase === 'escape') marks.push(HQ_START);
        for (const p of marks)
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
