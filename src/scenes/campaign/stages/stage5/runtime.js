// Stage 5 — RUNTIME BERSAMA ketiga sub-scene: fase, mesin dialog typewriter,
// manajer sub-scene + tirai fade, cine state, spawn robot, kereta musuh,
// dan hook collision yang identik di dalam kereta (journey + arrival).

import { CFG, CAMP_M } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, _v3, setCinematicActive } from '../../../../core/state.js';
import { camera, CAM_OFF_DEFAULT, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot } from '../../utility/common.js';
import { resolveCrateBlock } from '../../../../entities/crates.js';
import { explodeAt } from '../../../../entities/effects.js';
import { spawnGibs } from '../../../../entities/gore.js';
import { PAL } from '../../../../world/palette.js';
import { slideWalk } from '../../../../utils/collision.js';
import { updateTrainVisual, updateJourneyScenery } from '../../../../entities/train.js';
import {
    playSFX, playLoopSFX, stopLoopSFX, sfxTrain, sfxTankExplode, sfxExplode,
} from '../../../../utils/sfx.js';
import {
    TRAIN_BASE_X, TRAIN_X0, TRAIN_X1, TRAIN_Z0, TRAIN_Z1,
    ENEMY_TRACK_Z, JOURNEY_ENEMY_Z, ET_ENTER_X, ET_EXIT_X, ET_CARGO_CARS,
    ET_LEN, ET_STEP, ET_HALF, etCfg, enemyTrain, parkEnemyTrain,
    layoutEnemyTrain, enemyCarOffsetX, spinEnemyTrain,
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

export function spawnOne(cls, x, z, encounter, active = true) {
    spawnCampaignRobot(x, z, 5, cls, active);
    const r = robots[robots.length - 1];
    r.encounter = encounter;
    return r;
}

// --- SFX loop kereta -------------------------------------------------------
// Sejak 2026-08-07 memakai klip kereta sendiri (`train-sound.mp3`); dulu ini
// meminjam loop tank yang dipercepat 1.32x.
let trainLoop = null;
export function startTrainLoop() {
    if (trainLoop) return;
    trainLoop = playLoopSFX(sfxTrain, 0.42);
}
export function stopTrainLoop() {
    if (trainLoop) { stopLoopSFX(trainLoop); trainLoop = null; }
}
export const trainLoopDebug = () => ({ on: !!trainLoop, src: trainLoop?.src || null });

// --- Kereta musuh ----------------------------------------------------------
// DUA PERAN (rombak gameloop 2026-08-07, permintaan user):
//   1. STASIUN — satu lintasan atmosfer (`flyby`); tidak menurunkan siapa pun.
//   2. PERJALANAN — GELOMBANG SERANG: konsist menyusul di jalur sebelah, 1-3
//      gerbong berisi 3-6 robot kelas A/B (B selalu lebih banyak dari A) yang
//      MUNCUL DARI GERBONG lalu menembaki player lintas-rel. Robot tak pernah
//      turun/menyeberang: mereka `mounted` mengikuti transform konsist. Begitu
//      seluruh robotnya habis, konsist MELEDAK dan menghilang.
// Mesh + layout gerbong milik world.js; modul ini hanya menggerakkannya.
export let etrain = { mode: 'idle', t: 0, passes: 0, wave: 0, cars: 0, spawned: 0 };
export let etCleared = 0, etSent = 0;
const _mount = new THREE.Vector3();

export function resetEnemyTrain() {
    etrain = { mode: 'idle', t: 0, passes: 0, wave: 0, cars: 0, spawned: 0 };
    etCleared = 0; etSent = 0;
    parkEnemyTrain();
}

export function sendEnemyFlyby() {
    if (!enemyTrain || etrain.mode !== 'idle') return false;
    etrain.mode = 'flyby'; etrain.t = 0; etrain.passes++;
    layoutEnemyTrain(ET_CARGO_CARS);
    enemyTrain.group.visible = true;
    enemyTrain.group.position.set(ET_ENTER_X, 0, ENEMY_TRACK_Z);
    startTrainLoop(); addCamShake(1.4);
    return true;
}

// Komposisi satu gerbong: n robot, kelas A dan B saja, dengan B WAJIB lebih
// banyak daripada A. `Math.floor((n-1)/2)` adalah pagar keras yang menjamin
// b > a untuk n berapa pun; `classARatio` hanya boleh menurunkan porsi A.
export function enemyCarMix(n) {
    const ratio = Math.max(0, Math.min(0.5, etCfg().classARatio ?? 0.34));
    const a = Math.min(Math.floor((Math.max(1, n) - 1) / 2), Math.round(n * ratio));
    return { A: a, B: n - a };
}

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (Math.max(lo, hi) - lo + 1));

// Slot tembak di dek gerbong musuh (koordinat LOKAL konsist). Dua baris
// selang-seling di separuh dek yang menghadap player agar semuanya terbaca.
function slotLocal(cars, carIdx, k, n, out) {
    const C = etCfg();
    const spacing = C.slotSpacing ?? 13;
    out.x = enemyCarOffsetX(cars, carIdx) + (k - (n - 1) / 2) * spacing;
    out.z = k % 2 ? ET_HALF - 3.2 : ET_HALF - 7.4;
    return out;
}

export function sendEnemyWave(waveIndex) {
    if (!enemyTrain || etrain.mode !== 'idle') return 0;
    const C = etCfg();
    const cars = layoutEnemyTrain(randInt(C.carsMin, C.carsMax));
    // Konsist ditempatkan LEBIH DULU supaya robot lahir tepat di dalam gerbong,
    // bukan sesaat di titik asal dunia.
    enemyTrain.group.visible = true;
    enemyTrain.group.position.set(waveEnterX(), 0, JOURNEY_ENEMY_Z);
    const g = enemyTrain.group.position, slot = { x: 0, z: 0 };
    let spawned = 0;
    for (let ci = 0; ci < cars; ci++) {
        const n = randInt(C.perCarMin, C.perCarMax), mix = enemyCarMix(n);
        const door = { x: enemyCarOffsetX(cars, ci), z: -ET_HALF + 3 };
        let k = 0;
        for (const cls of ['B', 'A']) for (let i = 0; i < mix[cls]; i++, k++) {
            slotLocal(cars, ci, k, n, slot);
            const r = spawnOne(cls, g.x + door.x, g.z + door.z, `etrain-${waveIndex}`);
            r.mounted = true; r.state = 'mounted'; r.moving = false; r.aiming = true;
            r.etWave = waveIndex; r.etCar = ci;
            r.etSlot = { x: slot.x, z: slot.z };
            r.etDoor = { x: door.x, z: door.z };
            r.emergeT = 0;
            // Barisan tembak lintas-rel: jangkauan mereka dipatok config stage,
            // bukan radius kejar kelas biasa yang dirancang untuk pertempuran dekat.
            r.range = (C.fireRangeMeters ?? 13) * CAMP_M;
            r.mesh.visible = false;
            spawned++;
        }
    }
    etrain = { mode: 'approach', t: 0, passes: etrain.passes, wave: waveIndex, cars, spawned };
    etSent++;
    startTrainLoop(); addCamShake(1.6);
    return spawned;
}

// Konsist masuk dari BELAKANG (arah -X): ia menyusul kereta player, bukan
// berpapasan. Jarak masuk selalu di luar tapak pandang kamera.
function waveEnterX() {
    return TRAIN_BASE_X - (ET_CARGO_CARS * ET_STEP + ET_LEN + (etCfg().entryMargin ?? 220));
}

export function countEnemyWaveRobots() {
    let n = 0;
    for (const z of robots) if (z.stage === 5 && z.mounted && z.etWave === etrain.wave) n++;
    return n;
}

// Posisi dunia satu robot mounted; `k` 0..1 = progres keluar dari gerbong.
function mountedWorld(z, out) {
    const g = enemyTrain.group.position, k = Math.min(1, z.emergeT || 0);
    const s = k * k * (3 - 2 * k);
    out.set(g.x + z.etDoor.x + (z.etSlot.x - z.etDoor.x) * s, Math.sin(s * Math.PI) * 2.5,
        g.z + z.etDoor.z + (z.etSlot.z - z.etDoor.z) * s);
    return out;
}

export function snapMountedRobot(z) {
    if (!enemyTrain || !z.etSlot) return;
    mountedWorld(z, _mount);
    z.mesh.position.copy(_mount); z.groundY = _mount.y; z.baseY = _mount.y;
}

// AI robot kereta musuh: TIDAK PERNAH mengejar. Ia menempel pada slotnya,
// menghadap player, dan menembak lewat kontrak `chaseDist` milik updateRobots.
export function enemyTrainRobotAI(z, dt) {
    if (!enemyTrain || !z.etSlot || z.etWave !== etrain.wave
        || etrain.mode === 'idle' || etrain.mode === 'flyby') { z.mesh.visible = false; return { skip: true }; }
    if (etrain.mode === 'approach') { snapMountedRobot(z); z.mesh.visible = false; return { skip: true }; }
    z.mesh.visible = true;
    if (z.emergeT < 1) z.emergeT = Math.min(1, z.emergeT + dt / Math.max(0.05, etCfg().emergeSec ?? 0.8));
    snapMountedRobot(z);
    z.state = 'mounted'; z.moving = false; z.losOK = true;
    const dx = camera.position.x - z.mesh.position.x, dz = camera.position.z - z.mesh.position.z;
    z.mesh.rotation.y = Math.atan2(dx, dz);
    if (z.emergeT < 1) { z.aiming = false; return {}; }
    z.aiming = true;
    return { chaseDist: Math.hypot(dx, dz) };
}

function blowUpEnemyTrain() {
    etrain.mode = 'dying'; etrain.t = 0; etrain.boom = 0;
    addCamShake(4.2);
    playSFX(sfxTankExplode, 0.7);
}

export function updateEnemyTrain(dt) {
    if (!enemyTrain || etrain.mode === 'idle') return;
    const C = etCfg(), g = enemyTrain.group.position;
    etrain.t += dt;
    if (etrain.mode === 'flyby') {
        const k = Math.min(1, etrain.t / Math.max(0.01, C.flybySec));
        g.x = ET_ENTER_X + (ET_EXIT_X - ET_ENTER_X) * k;
        spinEnemyTrain(dt, 260);
        if (k >= 1) { etrain.mode = 'idle'; enemyTrain.group.visible = false; stopTrainLoop(); }
        return;
    }
    // Sepanjang gelombang, roda konsist ikut berputar seirama kereta player.
    spinEnemyTrain(dt, CFG.campaign.stage5.trainSpeed);
    if (etrain.mode === 'approach') {
        const k = Math.min(1, etrain.t / Math.max(0.01, C.approachSec));
        const s = k * k * (3 - 2 * k);
        g.x = waveEnterX() + (TRAIN_BASE_X - waveEnterX()) * s;
        if (k >= 1) { etrain.mode = 'engage'; etrain.t = 0; addCamShake(1.2); }
        return;
    }
    if (etrain.mode === 'engage') {
        // Kedua kereta melaju sama cepat: relatif diam, dengan ayunan halus.
        g.x = TRAIN_BASE_X + Math.sin(etrain.t * 0.7) * 3.5;
        if (countEnemyWaveRobots() === 0) blowUpEnemyTrain();
        return;
    }
    if (etrain.mode === 'dying') {
        // MELEDAK LALU MENGHILANG: rentetan ledakan menyusuri konsist sambil ia
        // tertinggal ke belakang, lalu mesh-nya disembunyikan seluruhnya.
        const dur = Math.max(0.2, C.deathSec ?? 1.8);
        g.x -= dt * (C.deathDriftSpeed ?? 90);
        const want = Math.min(etrain.cars + 1, Math.ceil(etrain.t / dur * (etrain.cars + 1)));
        while ((etrain.boom | 0) < want) {
            const ci = etrain.boom | 0;
            _mount.set(g.x + enemyCarOffsetX(etrain.cars, ci), 9, g.z);
            explodeAt(_mount, 0.1, 0, ci === 0 ? sfxTankExplode : sfxExplode);
            spawnGibs(_mount.x, 9, _mount.z, 7, -1, 0, 1.4, PAL.gunmetal, 0.6);
            addCamShake(2.4); etrain.boom++;
        }
        if (etrain.t >= dur) {
            enemyTrain.group.visible = false;
            etrain.mode = 'idle'; etCleared++;
            parkEnemyTrain();
        }
    }
}

export const enemyTrainDebug = () => ({
    mode: etrain.mode, passes: etrain.passes, wave: etrain.wave,
    cars: etrain.cars, spawned: etrain.spawned, alive: countEnemyWaveRobots(),
    sent: etSent, cleared: etCleared,
    x: enemyTrain?.group?.position?.x ?? 0,
    z: enemyTrain?.group?.position?.z ?? 0,
    visibleCars: enemyTrain?.cars?.filter(c => c.visible).length || 0,
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
    // SHOT KEBERANGKATAN: pool scenery perjalanan HARUS tetap tersembunyi.
    // Arena journey berada tepat di atas denah stasiun, jadi rel + lanskapnya
    // yang bergulir akan menembus lantai peron dan membuat STASIUN ikut
    // terlihat bergerak (laporan user 2026-08-07). Guncangan kamera juga
    // dimatikan supaya shot-nya benar-benar terkunci: hanya kereta yang maju.
    // Pool baru dinyalakan sesudah layar hitam di finishDeparture.
    if (phase === 'departure') {
        if (journey) journey.group.visible = false;
        return;
    }
    updateJourneyScenery(journey, dt, trainSpeed, phase === 'arrival' || complete ? 1 : k);
    if (trainSpeed > 18) addCamShake(0.16 + Math.min(0.08, trainSpeed / 1000));
}

// --- Hook collision bersama ------------------------------------------------
// STASIUN: dinding CSV + pintu tertutup memblok peluru.
export function bulletBlocked(b) {
    if (b.mesh.position.y >= WALL_H) return false;
    return stage5SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
        || stationDoorBlocks(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
}

export function blastBlocked(x0, z0, x1, z1, y = 0) {
    if (y >= WALL_H) return false;
    return stage5SegHitsWall(x0, z0, x1, z1) || stationDoorBlocks(x0, z0, x1, z1);
}

// Hook yang identik untuk kedua sub-scene DI ATAS KERETA. Player terkurung di
// DALAM gerbong; satu-satunya musuh adalah penembak di konsist jalur sebelah.
export const TRAIN_HOOKS = {
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(trainWalk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
        slideWalk(trainWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight(x, z, feetY) { return stage5GroundHeight(x, z, feetY); },
    // Di atas rel terbuka tidak ada dinding CSV yang relevan: denah stasiun
    // sudah jauh tertinggal, dan baku tembak lintas-rel harus selalu tembus.
    bulletBlocked: () => false,
    blastBlocked: () => false,
    grenadeCollide(g, oldX, oldZ) {
        if (!trainWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },
    robotAI(z, dt, step) {
        if (z.mounted) return enemyTrainRobotAI(z, dt);
        return campaignRobotAI(z, dt, step, { walkable: trainWalk, resolve, nav: navGrid });
    },
    clampRobot(z, oldX, oldZ) {
        if (z.mounted) { snapMountedRobot(z); return; }
        campaignClampRobot(z, oldX, oldZ, { walkable: trainWalk, resolve });
    },
    // Loot musuh jatuh di konsist seberang; ia DITARIK ke dalam gerbong supaya
    // player yang tak boleh keluar tetap bisa memungutnya.
    clampDropPos(x, z) {
        if (trainWalk(x, z, 2)) return [x, z];
        return [Math.max(TRAIN_X0 + 2, Math.min(TRAIN_X1 - 2, x)),
            Math.max(TRAIN_Z0 + 2, Math.min(TRAIN_Z1 - 2, z))];
    },
};

export { _v3 };
