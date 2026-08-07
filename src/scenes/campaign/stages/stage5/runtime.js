// Stage 5 — RUNTIME BERSAMA ketiga sub-scene: fase, mesin dialog typewriter,
// manajer sub-scene + tirai fade, cine state, spawn robot, kereta musuh,
// dan hook collision yang identik di dalam kereta (journey + arrival).

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, _v3, setCinematicActive } from '../../../../core/state.js';
import { CAM_OFF_DEFAULT, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot } from '../../utility/common.js';
import { resolveCrateBlock } from '../../../../entities/crates.js';
import { slideWalk } from '../../../../utils/collision.js';
import { rand } from '../../../../utils/math.js';
import { updateTrainVisual, updateJourneyScenery } from '../../../../entities/train.js';
import { playLoopSFX, stopLoopSFX, sfxTankMove } from '../../../../utils/sfx.js';
import {
    TRAIN_CENTER_Z, TRAIN_X0, TRAIN_X1, TRAIN_Z0, TRAIN_Z1,
    ET_ENTER_X, ET_EXIT_X, etCfg, enemyTrain, parkEnemyTrain,
    train, journey, navGrid, trainWalk, resolve, stage5GroundHeight,
    stage5SegHitsWall, stationDoorBlocks, WALL_H,
} from './world.js';

// Dialog final disimpan sebagai data agar urutan + typewriter dapat dipatok smoke.
export const STAGE5_DIALOGUE = dialogueMap('campaign.stage5.lines');

// --- Fase (nama fase TETAP sama seperti sebelum pemecahan file) -------------
export let phase = 'opening';
export const setPhase = p => { phase = p; };
export let complete = false;
export const setComplete = v => { complete = v; };

// --- Cine bersama ----------------------------------------------------------
export let cine = null;
export const setCine = c => { cine = c; };
export const cineCam = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };

export function cleanupCine(revealSec = 0) {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, revealSec); setCinematicActive(false); setAvatarRadioPose(false);
}

// --- Manajer SUB-SCENE -----------------------------------------------------
// Stage 5 dipecah menjadi tiga sub-scene (station -> journey -> arrival) yang
// memakai kontrak hook yang sama dengan scene biasa, tetapi TIDAK melewati
// core/sceneManager: `activeScene` harus tetap `stage5Scene` supaya checkpoint,
// stageStats, restart dan resume modal hack/repair tak berubah perilaku.
// Pergantian antar sub-scene = potong ke hitam lalu FADE-IN `subSceneFadeSec`
// (0.5 dtk); tirai baru dijalankan pada frame berikutnya karena transisi CSS
// butuh melihat nilai 1 lebih dulu.
export let sub = null;
let subFadePending = false;

const subFadeSec = () => {
    const v = CFG.campaign.stage5?.subSceneFadeSec;
    return typeof v === 'number' ? v : 0.5;
};

export function enterSub(next, opts = {}) {
    if (sub && sub.exit) sub.exit();
    sub = next;
    if (opts.fade === false) subFadePending = false;
    else { setCineFade(1, 0); subFadePending = true; }
    if (next && next.enter) next.enter(opts);
}

export function updateSubFade() {
    if (!subFadePending) return;
    subFadePending = false;
    setCineFade(0, subFadeSec());
}

export function resetSub() { sub = null; subFadePending = false; }
export const subFadeDebug = () => ({ pending: subFadePending, sec: subFadeSec() });

// --- Mesin dialog (SATU antrean untuk seluruh stage; tidak pernah di-reset
// antar sub-scene supaya urutan 16 beat tetap utuh) -------------------------
let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}

function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null;
    dialogueT = 0; dialogueChars = 0; renderDialogue();
}

export function queueDialogue(key, repeat = false) {
    const line = STAGE5_DIALOGUE[key];
    if (!line || (!repeat && dialogueSeen.has(key))) return false;
    if (!repeat) dialogueSeen.add(key);
    dialogueQueue.push({ key, ...line });
    if (!dialogueCurrent) nextDialogue();
    return true;
}

export function updateDialogue(dt) {
    if (!dialogueCurrent) return;
    const D = CFG.campaign.dialogue;
    dialogueT += dt;
    while (dialogueCurrent) {
        const sec = dialogueCurrent.text.length / Math.max(1, D.cps) + Math.max(0, D.holdSec);
        if (dialogueT < sec) {
            dialogueChars = Math.floor(dialogueT * Math.max(1, D.cps)); renderDialogue(); return;
        }
        dialogueChars = dialogueCurrent.text.length; renderDialogue();
        dialogueT -= sec; nextDialogue();
    }
}

export function resetDialogue() {
    dialogueCurrent = null; dialogueQueue = []; dialogueSeen = new Set();
    dialogueT = 0; dialogueChars = 0; hideStageRadioDialogue();
}

export const dialogueIdle = () => !dialogueCurrent && !dialogueQueue.length;

export const stage5DialogueDebug = () => ({
    key: dialogueCurrent?.key || null,
    speaker: dialogueCurrent?.speaker || '', text: dialogueCurrent?.text || '',
    chars: dialogueChars,
    shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
    typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
    queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen],
});

// --- Spawn robot -----------------------------------------------------------
export function countEncounter(name) {
    let n = 0; for (const z of robots) if (z.stage === 5 && z.encounter === name) n++; return n;
}

export function spawnOne(cls, x, z, encounter, boarding = false, boardTarget = null, active = true) {
    spawnCampaignRobot(x, z, 5, cls, active);
    const r = robots[robots.length - 1];
    r.encounter = encounter;
    if (boarding) {
        const side = z >= TRAIN_CENTER_Z ? 1 : -1;
        const targetX = boardTarget?.x ?? x;
        const targetZ = boardTarget?.z ?? (TRAIN_CENTER_Z + side * rand(5, 16));
        r.state = 'boarding'; r.trainBoard = {
            t: 0, dur: 0.75 + Math.random() * 0.35,
            fromX: x, fromZ: z, targetX, targetZ,
        };
    }
    return r;
}

// Lompatan turun dari kereta (musuh di stasiun maupun boarding di perjalanan).
export function advanceBoardHop(z, dt) {
    const b = z.trainBoard; b.t += dt;
    const k = Math.min(1, b.t / b.dur), s = k * k * (3 - 2 * k);
    z.mesh.position.x = b.fromX + (b.targetX - b.fromX) * s;
    z.mesh.position.z = b.fromZ + (b.targetZ - b.fromZ) * s;
    z.mesh.position.y = Math.sin(k * Math.PI) * 8;
    if (k < 1) return false;
    delete z.trainBoard; z.state = 'chasing'; z.groundY = 0; z.baseY = 0; z.mesh.position.y = 0;
    return true;
}

// --- SFX loop kereta -------------------------------------------------------
let trainLoop = null;
export function startTrainLoop() {
    if (trainLoop) return;
    trainLoop = playLoopSFX(sfxTankMove, 0.2);
    try { trainLoop.playbackRate = 1.32; } catch (e) { }
}
export function stopTrainLoop() {
    if (trainLoop) { stopLoopSFX(trainLoop); trainLoop = null; }
}

// --- Kereta musuh: HANYA LINTASAN (2026-08-07, permintaan user) -------------
// Konsist di track sebelah tidak lagi berhenti/menurunkan pasukan. Ia cuma
// melintas satu kali sebagai beat atmosfer; seluruh robot bagian 1 tinggal di
// gudang. Mesh-nya milik world.js.
export let etrain = { mode: 'idle', t: 0, passes: 0 };

export function resetEnemyTrain() {
    etrain = { mode: 'idle', t: 0, passes: 0 };
    parkEnemyTrain();
}

export function sendEnemyFlyby() {
    if (!enemyTrain || etrain.mode !== 'idle') return false;
    etrain.mode = 'flyby'; etrain.t = 0; etrain.passes++;
    enemyTrain.group.visible = true;
    enemyTrain.group.position.x = ET_ENTER_X;
    startTrainLoop(); addCamShake(1.4);
    return true;
}

export function updateEnemyTrain(dt) {
    if (!enemyTrain || etrain.mode !== 'flyby') return;
    etrain.t += dt;
    const k = Math.min(1, etrain.t / Math.max(0.01, etCfg().flybySec));
    enemyTrain.group.position.x = ET_ENTER_X + (ET_EXIT_X - ET_ENTER_X) * k;
    if (k >= 1) { etrain.mode = 'idle'; enemyTrain.group.visible = false; stopTrainLoop(); }
}

export const enemyTrainDebug = () => ({
    mode: etrain.mode, passes: etrain.passes,
    x: enemyTrain?.group?.position?.x ?? 0,
    z: enemyTrain?.group?.position?.z ?? 0,
    visible: !!enemyTrain?.group?.visible,
});

// --- Perjalanan (dipakai journey + arrival) --------------------------------
export let rideT = 0, trainSpeed = 0;
export const resetRide = () => { rideT = 0; trainSpeed = 0; };
export const routeK = () => Math.min(1, rideT / Math.max(1, CFG.campaign.stage5.rideMinSec));

export function updateRide(dt) {
    const C = CFG.campaign.stage5;
    rideT += dt;
    const k = routeK();
    if (phase === 'departure') trainSpeed += (C.trainSpeed - trainSpeed) * Math.min(1, dt * 0.55);
    else if (phase === 'arrival') trainSpeed += (0 - trainSpeed) * Math.min(1, dt * 0.85);
    else trainSpeed += (C.trainSpeed - trainSpeed) * Math.min(1, dt * 2.5);
    updateTrainVisual(train, dt, trainSpeed);
    updateJourneyScenery(journey, dt, trainSpeed, phase === 'arrival' || complete ? 1 : k);
    if (trainSpeed > 18) addCamShake(0.16 + Math.min(0.08, trainSpeed / 1000));
}

// --- Hook collision bersama ------------------------------------------------
export function bulletBlocked(b) {
    if (b.mesh.position.y >= WALL_H) return false;
    return stage5SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
        || stationDoorBlocks(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
}

export function blastBlocked(x0, z0, x1, z1, y = 0) {
    if (y >= WALL_H) return false;
    return stage5SegHitsWall(x0, z0, x1, z1) || stationDoorBlocks(x0, z0, x1, z1);
}

// Hook yang identik untuk kedua sub-scene DI ATAS KERETA.
export const TRAIN_HOOKS = {
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(trainWalk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
        slideWalk(trainWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight(x, z, feetY) { return stage5GroundHeight(x, z, feetY); },
    bulletBlocked, blastBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!trainWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },
    robotAI(z, dt, step) {
        if (z.trainBoard && !advanceBoardHop(z, dt)) return { skip: true };
        return campaignRobotAI(z, dt, step, { walkable: trainWalk, resolve, nav: navGrid });
    },
    clampRobot(z, oldX, oldZ) {
        if (z.trainBoard) return;
        campaignClampRobot(z, oldX, oldZ, { walkable: trainWalk, resolve });
    },
    clampDropPos(x, z) {
        if (trainWalk(x, z, 2)) return [x, z];
        return [Math.max(TRAIN_X0 + 2, Math.min(TRAIN_X1 - 2, x)),
            Math.max(TRAIN_Z0 + 2, Math.min(TRAIN_Z1 - 2, z))];
    },
};

export { _v3 };
