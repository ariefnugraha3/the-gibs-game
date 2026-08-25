// Stage 9 shared runtime. The three chapters are internal sub-scenes; this
// module owns state that must survive every hand-off (dialogue, timer, fuel,
// encounter identity and the single Stage 9 completion gateway).

import { CAMP_M, CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { robots, setCinematicActive } from '../../../../core/state.js';
import {
    scene, camera, viewCam, setCineFocus, camFocusPos, camOffsetActive, CAM_LOOK_DROP,
} from '../../../../core/renderer.js';
import {
    showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnCampaignRobot } from '../../utility/common.js';
import {
    stage9Walkable, stage9BlockedAt, stage9EncounterPoints,
} from './world.js';

export const STAGE9_DIALOGUE = dialogueMap('campaign.stage9.lines');

export let sub = null;
export let chapter = 1;
export let phase = 'opening';
export let complete = false;
export let stageElapsed = 0;
export let fuelT = 0;
export let fuelPumpOn = false;
export let takeoffT = 0;
export let transitionSent = false;
export let cine = null;
const spawnedEncounters = Object.create(null);
// Bukti penempatan spawn, DIREKAM saat lahir: sesudahnya kamera sudah bergerak
// sehingga "apakah robot ini muncul di layar" tidak bisa dihitung ulang.
const spawnPlacements = Object.create(null);
let completionHook = null;
let subFadePending = false;

export const setStage9CompletionHook = fn => {
    completionHook = typeof fn === 'function' ? fn : null;
};
export const setStage9Phase = next => { phase = next; };
export const setStage9Cine = next => { cine = next; };
export const setStage9FuelPumpOn = on => { fuelPumpOn = !!on; };
export const setStage9TakeoffTime = value => { takeoffT = Math.max(0, value); };
export const addStage9Time = dt => { stageElapsed += dt; };
export const addStage9Fuel = dt => {
    fuelT = Math.min(CFG.campaign.stage9.fuel.durationSec, fuelT + Math.max(0, dt));
    return fuelT;
};

export function enterStage9Sub(next, opts = {}) {
    sub?.exit?.();
    sub = next;
    chapter = next?.chapter || chapter;
    if (opts.fade === false) subFadePending = false;
    else { setCineFade(1, 0); subFadePending = true; }
    next?.enter?.(opts);
}

export function updateStage9SubFade() {
    if (!subFadePending) return;
    subFadePending = false;
    setCineFade(0, CFG.campaign.stage9.fadeSec);
}

export function cleanupStage9Cine(revealSec = 0) {
    cine = null;
    hideCutsceneSkip();
    setCineFocus(null);
    setCineBars(false);
    setCineFade(0, revealSec);
    setCinematicActive(false);
}

let dialogueCurrent = null;
let dialogueQueue = [];
let dialogueSeen = new Set();
let dialogueT = 0;
let dialogueChars = 0;

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars),
        dialogueChars < dialogueCurrent.text.length);
}

function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null;
    dialogueT = 0;
    dialogueChars = 0;
    setAvatarRadioPose(!!dialogueCurrent);
    renderDialogue();
}

export function queueStage9Dialogue(key, repeat = false) {
    const line = STAGE9_DIALOGUE[key];
    if (!line || (!repeat && dialogueSeen.has(key))) return false;
    if (!repeat) dialogueSeen.add(key);
    dialogueQueue.push({ key, ...line });
    if (!dialogueCurrent) nextDialogue();
    return true;
}

export function updateStage9Dialogue(dt) {
    if (!dialogueCurrent) return;
    const D = CFG.campaign.dialogue;
    dialogueT += dt;
    while (dialogueCurrent) {
        const seconds = dialogueCurrent.text.length / Math.max(1, D.cps)
            + Math.max(0, D.holdSec);
        if (dialogueT < seconds) {
            dialogueChars = Math.floor(dialogueT * Math.max(1, D.cps));
            renderDialogue();
            return;
        }
        dialogueChars = dialogueCurrent.text.length;
        renderDialogue();
        dialogueT -= seconds;
        nextDialogue();
    }
}

export function resetStage9Dialogue() {
    dialogueCurrent = null;
    dialogueQueue = [];
    dialogueSeen = new Set();
    dialogueT = 0;
    dialogueChars = 0;
    setAvatarRadioPose(false);
    hideStageRadioDialogue();
}

export const stage9DialogueIdle = () => !dialogueCurrent && !dialogueQueue.length;

// Chapter 2 saja memakai aktivasi frustum. Kedua wave Chapter 1 spawn aktif
// dan langsung memburu player setelah establishing cutscene selesai.
// `margin` melebarkan frustum uji (0,15 = 15% di luar tepi layar): dipakai
// penempatan spawn agar robot tidak lahir tepat di garis tepi lalu "muncul"
// begitu kamera bergeser satu langkah.
export function stage9RobotInView(robotOrX, zArg = 0, yArg = 0, margin = 0) {
    let x = robotOrX, z = zArg, y = yArg;
    if (robotOrX && typeof robotOrX === 'object') {
        const p = robotOrX.mesh?.position || robotOrX.position || robotOrX;
        x = p.x; z = p.z;
        y = p.y + (robotOrX.scl || 1) * 6.5;
    }
    const off = camOffsetActive();
    let focus = camFocusPos();
    // Teleport antarchapter terjadi sebelum followViewCam sempat snap.
    if (Math.hypot(focus.x - camera.position.x, focus.z - camera.position.z) > 400)
        focus = camera.position;
    const ex = focus.x + off.x, ey = focus.y + off.y, ez = focus.z + off.z;
    let fx = -off.x, fy = -off.y - CAM_LOOK_DROP, fz = -off.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const rh = Math.hypot(fx, fz) || 1;
    const rx = -fz / rh, rz = fx / rh;
    const ux = -fy * rz, uy = fx * rz - fz * rx, uz = fy * rx;
    const dx = x - ex, dy = y - ey, dz = z - ez;
    const depth = dx * fx + dy * fy + dz * fz;
    if (depth <= 1) return false;
    const tanY = Math.tan(((viewCam?.fov || 50) * Math.PI / 180) / 2);
    const tanX = tanY * (viewCam?.aspect || 1);
    const screenX = (dx * rx + dz * rz) / (depth * tanX);
    const screenY = (dx * ux + dy * uy + dz * uz) / (depth * tanY);
    const edge = 1 + Math.max(0, margin);
    return Math.abs(screenX) <= edge && Math.abs(screenY) <= edge;
}

export const stage9DialogueDebug = () => ({
    key: dialogueCurrent?.key || null,
    queued: dialogueQueue.map(x => x.key),
    seen: [...dialogueSeen],
    chars: dialogueChars,
});

export function clearStage9Robots() {
    for (let i = robots.length - 1; i >= 0; i--) {
        if (robots[i].stage !== 9) continue;
        disposeRobot(robots[i]);
        scene.remove(robots[i].mesh);
        robots.splice(i, 1);
    }
}

// Gelembung bebas robot di sekitar player saat sebuah encounter dilahirkan.
export const stage9SpawnClearRadius = () =>
    Math.max(0, CFG.campaign.stage9.spawnClearMeters || 0) * CAMP_M;
const SPAWN_VIEW_MARGIN = 0.14;
const SPAWN_RING_STEP = 34;
const SPAWN_RINGS = 20;
const SPAWN_ARC = 16;
// Tinggi dada robot: yang diuji terhadap frustum adalah badannya, bukan kaki.
const SPAWN_PROBE_Y = 9;

const spawnSpotFree = (x, z) =>
    stage9Walkable(x, z, 4) && !stage9BlockedAt(x, z, 4);

function spawnSpotOk(x, z, clearR, checkView) {
    if (!spawnSpotFree(x, z)) return false;
    if (Math.hypot(x - camera.position.x, z - camera.position.z) < clearR) return false;
    return !checkView || !stage9RobotInView(x, z, SPAWN_PROBE_Y, SPAWN_VIEW_MARGIN);
}

// Titik lahir sebuah robot. Aturannya dua, dan keduanya permintaan user:
// (1) tak seorang pun lahir di dalam gelembung `spawnClearMeters` sekitar player,
// (2) tak seorang pun lahir DI DALAM frustum kamera — robot harus datang dari
// luar layar lalu mengejar. Pencarian menyapu keluar dari arah MENJAUHI kamera
// lebih dulu supaya robot tetap sedekat mungkin dengan titik encounter aslinya.
function clearSpawnPoint(p, seed) {
    const clearR = stage9SpawnClearRadius();
    const radius = Math.floor(seed / 7) * 9;
    const angle = seed * 2.399963;
    const base = { x: p.x + Math.cos(angle) * radius, z: p.z + Math.sin(angle) * radius };
    if (spawnSpotOk(base.x, base.z, clearR, true)) return base;
    const away = Math.atan2(base.z - camera.position.z, base.x - camera.position.x);
    // Beberapa robot dari satu titik encounter sering direlokasi bersamaan.
    // Offset sub-langkah + jitter radius per-seed mencegah mereka menumpuk
    // persis di petak valid pertama yang sama.
    const spin = (seed % SPAWN_ARC) * (Math.PI * 2 / (SPAWN_ARC * SPAWN_ARC));
    const push = (seed % 5) * 11;
    for (const checkView of [true, false]) {
        for (let ring = 1; ring <= SPAWN_RINGS; ring++) {
            for (let i = 0; i < SPAWN_ARC; i++) {
                const half = (i + 1) >> 1;
                const dir = i % 2 ? -1 : 1;
                const a = away + spin + dir * half * (Math.PI * 2 / SPAWN_ARC);
                const r = ring * SPAWN_RING_STEP + push;
                const x = base.x + Math.cos(a) * r;
                const z = base.z + Math.sin(a) * r;
                if (spawnSpotOk(x, z, clearR, checkView)) return { x, z };
            }
        }
    }
    if (spawnSpotFree(base.x, base.z)) return base;
    return { x: p.x, z: p.z };
}

export function spawnStage9Encounter(name, counts, active = false) {
    if (!counts || spawnedEncounters[name]) return 0;
    spawnedEncounters[name] = true;
    const points = stage9EncounterPoints(name);
    const record = spawnPlacements[name] = [];
    let cursor = 0;
    for (const cls of ['C', 'B', 'A']) {
        const amount = Math.max(0, counts[cls] | 0);
        for (let i = 0; i < amount; i++, cursor++) {
            const point = clearSpawnPoint(points[cursor % points.length], cursor);
            spawnCampaignRobot(point.x, point.z, 9, cls, active);
            robots[robots.length - 1].encounter = name;
            record.push({
                x: point.x, z: point.z,
                inView: stage9RobotInView(point.x, point.z, SPAWN_PROBE_Y),
                playerDist: Math.hypot(point.x - camera.position.x,
                    point.z - camera.position.z),
            });
        }
    }
    return cursor;
}

export function stage9EncounterCount(name) {
    let count = 0;
    for (const robot of robots)
        if (robot.stage === 9 && robot.encounter === name) count++;
    return count;
}

export function finishStage9() {
    if (complete) return false;
    complete = true;
    phase = 'complete';
    resetStage9Dialogue();
    cleanupStage9Cine(0);
    if (!transitionSent && completionHook) {
        transitionSent = true;
        completionHook();
    }
    return true;
}

export function resetStage9Runtime() {
    sub = null;
    chapter = 1;
    phase = 'opening';
    complete = false;
    stageElapsed = 0;
    fuelT = 0;
    fuelPumpOn = false;
    takeoffT = 0;
    transitionSent = false;
    cine = null;
    subFadePending = false;
    for (const name of Object.keys(spawnedEncounters)) delete spawnedEncounters[name];
    for (const name of Object.keys(spawnPlacements)) delete spawnPlacements[name];
    resetStage9Dialogue();
}

export function stage9RuntimeDebug() {
    const C = CFG.campaign.stage9;
    return {
        chapter, phase, complete, stageElapsed,
        sub: sub?.id || null,
        activeSceneStable: 'campaign-9',
        fuel: {
            seconds: fuelT,
            duration: C.fuel.durationSec,
            progress: C.fuel.durationSec > 0 ? fuelT / C.fuel.durationSec : 1,
            pumpOn: fuelPumpOn,
        },
        encounters: Object.fromEntries(Object.keys(spawnedEncounters)
            .map(name => [name, stage9EncounterCount(name)])),
        spawnPlacement: {
            clearRadius: stage9SpawnClearRadius(),
            viewMargin: SPAWN_VIEW_MARGIN,
            encounters: Object.fromEntries(Object.entries(spawnPlacements)
                .map(([name, list]) => [name, {
                    total: list.length,
                    inView: list.filter(p => p.inView).length,
                    minPlayerDist: list.reduce((m, p) =>
                        Math.min(m, p.playerDist), Infinity),
                }])),
        },
        takeoff: { seconds: takeoffT, duration: C.takeoffSec },
        cinematic: cine?.kind || null,
        transitionSent,
        dialogue: stage9DialogueDebug(),
        fadePending: subFadePending,
    };
}
