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
import { explodeAt, spawnGroundPuff } from '../../../../entities/effects.js';
import { spawnGibs, driftGore } from '../../../../entities/gore.js';
import { PAL } from '../../../../world/palette.js';
import { slideWalk } from '../../../../utils/collision.js';
import { rand } from '../../../../utils/math.js';
import { updateTrainVisual, updateJourneyScenery } from '../../../../entities/train.js';
import {
    playSFX, playLoopSFX, stopLoopSFX, sfxTrain, sfxTankExplode, sfxExplode,
    sfxRobotSpawn,
} from '../../../../utils/sfx.js';
import {
    highwayRobotAI, snapHighwayRobot, startHighway, armHighwayRaiders,
} from './highway.js';
import {
    armLocoBoss, updateLocoBoss, resetLocoBoss, locoBossDead, locoBossActive,
    locoDeathBurst, locoBossDebug,
} from './loco.js';
import {
    TRAIN_BASE_X, TRAIN_CENTER_Z, TRAIN_X0, TRAIN_X1, TRAIN_Z0, TRAIN_Z1,
    ENEMY_TRACK_Z, JOURNEY_ENEMY_Z, ET_ENTER_X, ET_EXIT_X, ET_CARGO_CARS,
    ET_LEN, ET_STEP, ET_HALF, etCfg, enemyTrain, parkEnemyTrain,
    resetEnemyCars, enemyCarOffsetX, spinEnemyTrain,
    setEnemyRamp, setEnemyStrobe, setEnemyCarDrift, setEnemyCarVisible,
    train, journey, navGrid, trainWalk, resolve, stage5GroundHeight,
    stage5SegHitsWall, stationDoorBlocks, stationDoorClampShot, WALL_H,
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
// Baris + progres ketikan yang sedang berjalan: dipakai cutscene keberangkatan
// untuk memilih bahasa tubuh radio Gibran (pola sama dengan stage 6).
export const dialogueCurrentLine = () => dialogueCurrent;
export const dialogueCharCount = () => dialogueChars;

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
// DUA PERAN:
//   1. STASIUN — satu lintasan atmosfer (`flyby`); tidak menurunkan siapa pun.
//   2. PERJALANAN — SELURUH perlawanan, dari SATU konsist penyerbu
//      (rombak 2026-08-08, permintaan user: "daripada bikin beberapa kereta
//      musuh datang bergantian"). Beberapa saat setelah masuk sub-scene
//      journey, konsist itu muncul di jalur sebelah, MENDAHULUI kereta player,
//      lalu berhenti relatif tepat ketika gerbong PALING BELAKANG-nya sejajar
//      dengan gerbong player. Ramp gerbong itu terbuka SENDIRIAN, robotnya
//      menembak lintas-rel; begitu robotnya habis, gerbong itu MELEDAK,
//      TERLEPAS, dan TERTINGGAL, lalu sisa konsist MUNDUR satu gerbong supaya
//      gerbong berikutnya sejajar dan membuka ramp-nya. Begitu seterusnya
//      sampai dua belas gerbong habis dan lokomotifnya ikut hancur.
// Mesh + transform gerbong milik world.js; modul ini hanya menggerakkannya.
//
// Urutan mode perjalanan:
//   idle -> overtake -> [ open -> engage -> detach -> advance ]*12
//        -> boss (lokomotif mini-boss, lihat loco.js) -> finale
// Sejak 2026-08-09 gerbong terakhir TIDAK langsung menyalakan `finale`: konsist
// maju sekali lagi sampai LOKOMOTIFNYA sejajar dengan gerbong player, lalu
// lokomotif itu bertempur sebagai mini boss sampai HP-nya habis.
export let etrain = {
    mode: 'idle', t: 0, passes: 0, car: -1, spawned: 0, ramp: 0, boom: 0,
    boardersSpawned: false,
};
export let etCarsKilled = 0, etLaunched = false;
// Bangkai gerbong yang sudah terlepas: masih anak konsist, tetapi digeser terus
// ke belakang sampai jauh di luar layar lalu disembunyikan.
let etWrecks = [];
let boardingJumps = [];
const _mount = new THREE.Vector3();

export const etCarTotal = () => ET_CARGO_CARS;
export const etConsistDone = () => etCarsKilled >= ET_CARGO_CARS && etrain.mode === 'idle';

export function resetEnemyTrain() {
    etrain = {
        mode: 'idle', t: 0, passes: 0, car: -1, spawned: 0, ramp: 0, boom: 0,
        boardersSpawned: false,
    };
    etCarsKilled = 0; etLaunched = false; etWrecks = []; boardingJumps = [];
    resetLocoBoss();
    parkEnemyTrain();
}

export function sendEnemyFlyby() {
    if (!enemyTrain || etrain.mode !== 'idle') return false;
    etrain.mode = 'flyby'; etrain.t = 0; etrain.passes++;
    resetEnemyCars();
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
const smoothK = k => k * k * (3 - 2 * k);
const easeInOut = k => k < 0.5 ? 4 * k * k * k : 1 - ((-2 * k + 2) ** 3) / 2;

// Posisi konsist supaya gerbong ke-i sejajar dengan gerbong player. Gerbong 0
// paling belakang, jadi makin besar `i` konsist makin MUNDUR — persis seperti
// kereta yang mengerem sedikit agar gerbong berikutnya merapat.
const carAlignX = i => TRAIN_BASE_X - enemyCarOffsetX(i);
// Titik masuk: SELURUH konsist (termasuk lokomotif paling depan) masih di
// belakang kereta player, di luar tapak pandang kamera.
const consistEnterX = () =>
    carAlignX(0) - (ET_CARGO_CARS * ET_STEP + ET_LEN + (etCfg().entryMargin ?? 260));

// Slot tembak di dek gerbong musuh (koordinat LOKAL konsist). Dua baris
// selang-seling di separuh dek yang menghadap player agar semuanya terbaca.
function slotLocal(carIdx, k, n, out) {
    const spacing = etCfg().slotSpacing ?? 13;
    out.x = enemyCarOffsetX(carIdx) + (k - (n - 1) / 2) * spacing;
    out.z = k % 2 ? ET_HALF - 3.2 : ET_HALF - 7.4;
    return out;
}

// Boarder C juga sudah menjadi awak gerbong sejak konsist berangkat. Mereka
// menunggu beberapa langkah di balik ramp, sehingga saat pintu jatuh mereka
// benar-benar keluar dari interior gerbong, bukan muncul di bibirnya.
function boarderSlotLocal(carIdx, k, n, out) {
    const C = boarderCfg(), spacing = C.slotSpacing ?? 12;
    out.x = enemyCarOffsetX(carIdx) + (k - (n - 1) / 2) * spacing;
    out.z = ET_HALF - Math.max(2, C.stagingInset ?? 6);
    return out;
}

// AWAK SELURUH KONSIST SUDAH BERADA DI DALAMNYA SEJAK BERANGKAT (2026-08-09,
// permintaan user: "buat agar sudah ada spawn robot di awal. sehingga ketika
// pintu terbuka robot sudah siap menembak"). Robot gerbong ke-i lahir LANGSUNG
// di barisan tembaknya — bukan lagi di-spawn saat ramp jatuh lalu berjalan
// keluar dari peti — jadi begitu ramp turun mereka sudah berdiri siap. Selama
// gerbongnya belum terbuka penuh mereka `invuln` + tak terlihat; lihat
// enemyTrainRobotAI.
function spawnCarRobots(carIdx) {
    const C = etCfg(), g = enemyTrain.group.position, slot = { x: 0, z: 0 };
    const n = randInt(C.perCarMin, C.perCarMax), mix = enemyCarMix(n);
    let k = 0;
    for (const cls of ['B', 'A']) for (let i = 0; i < mix[cls]; i++, k++) {
        slotLocal(carIdx, k, n, slot);
        const r = spawnOne(cls, g.x + slot.x, g.z + slot.z, `etrain-${carIdx}`);
        r.mounted = true; r.state = 'mounted'; r.moving = false; r.aiming = false;
        r.etCar = carIdx;
        r.etSlot = { x: slot.x, z: slot.z };
        // Barisan tembak lintas-rel: jangkauan mereka dipatok config stage,
        // bukan radius kejar kelas biasa yang dirancang untuk pertempuran dekat.
        r.range = (C.fireRangeMeters ?? 13) * CAMP_M;
        r.invuln = true;               // tersegel sampai ramp gerbongnya terbuka PENUH
        r.mesh.visible = false;
    }
    return n;
}

function boarderCfg() { return etCfg().boarders || {}; }

function spawnStagedCarBoarders(carIdx) {
    const C = boarderCfg();
    if (C.enabled === false) return 0;
    const min = Math.max(0, C.perCarMin ?? 2);
    const max = Math.max(min, C.perCarMax ?? 3);
    const n = randInt(min, max);
    if (n <= 0) return 0;
    const g = enemyTrain.group.position, slot = { x: 0, z: 0 };
    const targetSpan = Math.max(6, (TRAIN_X1 - TRAIN_X0) - 22);
    for (let k = 0; k < n; k++) {
        const lane = k - (n - 1) / 2;
        boarderSlotLocal(carIdx, k, n, slot);
        const tx = Math.max(TRAIN_X0 + 8, Math.min(TRAIN_X1 - 8,
            TRAIN_BASE_X + lane * Math.min(14, targetSpan / Math.max(1, n)) + rand(-3, 3)));
        const tz = TRAIN_CENTER_Z + rand(-5.5, 5.5);
        const r = spawnOne('C', g.x + slot.x, g.z + slot.z, `boarding-${carIdx}`, false);
        r.mounted = true; r.state = 'mounted'; r.moving = false; r.aiming = false;
        r.etCar = carIdx; r.etSlot = { x: slot.x, z: slot.z };
        r.boardingCar = carIdx; r.boardingPending = true; r.boardingJump = false;
        r.boardingPhase = 'sealed'; r.boardingLaunchFx = false;
        r.boardingTarget = { x: tx, z: tz, side: (k % 2 ? -1 : 1) * (C.sideArc ?? 7) };
        r.invuln = true; r.mesh.visible = false;
    }
    return n;
}

// Dipanggil setelah ramp benar-benar datar. C yang sudah dimuat sebelumnya
// mendapat shot dari interior -> bibir ramp -> dek player, tanpa spawn baru.
function launchCarBoarders(carIdx) {
    const C = boarderCfg(), g = enemyTrain.group.position;
    let n = 0;
    for (const z of robots) {
        if (z.stage !== 5 || !z.mounted || z.etCar !== carIdx || !z.boardingPending) continue;
        const target = z.boardingTarget;
        if (!target) continue;
        const inside = {
            x: g.x + z.etSlot.x,
            y: 0,
            z: g.z + z.etSlot.z,
        };
        const door = {
            x: inside.x,
            y: 0,
            z: g.z + ET_HALF + (C.launchEdge ?? 4),
        };
        const base = z.scl || 1;
        z.mounted = false; z.etCar = null; z.etSlot = null;
        z.boardingPending = false; z.boardingJump = true; z.boardingPhase = 'delay';
        z.boardingLaunchFx = false; z.boardingSideOffset = 0;
        z.state = 'jumping'; z.moving = false; z.aiming = false; z.invuln = true;
        z.mesh.visible = true; z.mesh.scale.setScalar(base);
        z.mesh.rotation.set(0, Math.atan2(door.x - inside.x, door.z - inside.z), 0);
        boardingJumps.push({
            z, t: -(C.staggerSec ?? 0.28) * n, base, inside, door,
            target: { x: target.x, y: 0, z: target.z }, side: target.side,
            arc: C.arcHeight ?? 24,
            windup: Math.max(0.05, C.windupSec ?? 0.22),
            runup: Math.max(0.05, C.runupSec ?? 0.2),
            sec: Math.max(0.25, C.jumpSec ?? 1.15),
            pitch: C.bodyPitch ?? 0.42,
        });
        n++;
    }
    return n;
}

// Seluruh awak konsist sekaligus, dipanggil sekali saat konsist diluncurkan.
function spawnConsistRobots() {
    let n = 0;
    for (let i = 0; i < ET_CARGO_CARS; i++) {
        n += spawnCarRobots(i);
        n += spawnStagedCarBoarders(i);
    }
    return n;
}

// Mulai konsist penyerbu. Dipanggil SEKALI per perjalanan.
export function launchEnemyConsist() {
    if (!enemyTrain || etLaunched || etrain.mode !== 'idle') return false;
    resetEnemyCars(); etWrecks = [];
    enemyTrain.group.visible = true;
    enemyTrain.group.position.set(consistEnterX(), 0, JOURNEY_ENEMY_Z);
    etrain = {
        mode: 'overtake', t: 0, passes: etrain.passes, car: -1, spawned: 0, ramp: 0, boom: 0,
        boardersSpawned: false,
    };
    // Awak SEMUA gerbong dimuat sekarang, bukan satu gerbong per giliran.
    spawnConsistRobots();
    etLaunched = true;
    startTrainLoop(); addCamShake(1.8);
    return true;
}

// Gerbong ke-i mulai giliran: lampu peringatannya menyala dan ramp-nya mulai
// jatuh. Gerbong LAIN tidak ikut terbuka. Robotnya TIDAK di-spawn di sini —
// awak seluruh konsist sudah dimuat sejak `launchEnemyConsist`.
function armCar(i) {
    etrain.mode = 'open'; etrain.t = 0; etrain.car = i; etrain.ramp = 0; etrain.boom = 0;
    etrain.boardersSpawned = false;
    etrain.spawned = countEnemyCarRobots(i);
    setEnemyStrobe(i, true);
    addCamShake(1.1);
    // Begitu gerbong ke-N tiba, JALUR REL MULAI MENDEKATI JALAN RAYA di sisi
    // kanan (permintaan user 2026-08-08). Penyatuannya perlahan dan dimulai
    // jauh di luar layar; lihat highway.js.
    if (i >= ((CFG.campaign.stage5.highway || {}).fromCarIndex ?? 4)) startHighway();
    if (i >= ((CFG.campaign.stage5.highway || {}).pickupFromCarIndex
        ?? (CFG.campaign.stage5.highway || {}).fromCarIndex ?? 4)) armHighwayRaiders();
}

export function countEnemyCarRobots(i = etrain.car) {
    let n = 0;
    for (const z of robots) {
        if (z.stage === 5 && z.mounted && z.etCar === i && !z.boardingPending) n++;
    }
    return n;
}

// Musuh yang benar-benar bisa dilawan SEKARANG. Sejak awak seluruh konsist
// dimuat di muka (2026-08-09), `countStageRobots(5)` mencakup sembilan gerbong
// yang masih tersegel — angka itu tak boleh bocor ke HUD.
export function countLiveHostiles() {
    let n = 0;
    for (const z of robots) if (z.stage === 5 && !z.invuln) n++;
    return n;
}

// Posisi dunia satu robot mounted: slot tembaknya, dibawa ikut konsist.
function mountedWorld(z, out) {
    const g = enemyTrain.group.position;
    out.set(g.x + z.etSlot.x, 0, g.z + z.etSlot.z);
    return out;
}

export function snapMountedRobot(z) {
    if (!enemyTrain || !z.etSlot) return;
    mountedWorld(z, _mount);
    z.mesh.position.copy(_mount); z.groundY = _mount.y; z.baseY = _mount.y;
}

// AI robot kereta musuh: TIDAK PERNAH mengejar. Ia menempel pada slotnya,
// menghadap player, dan menembak lewat kontrak `chaseDist` milik updateRobots.
//
// TIGA GERBANG BERURUTAN (2026-08-09, permintaan user) — awak seluruh konsist
// sudah ada sejak berangkat, jadi yang mengatur semuanya adalah ramp gerbongnya
// SENDIRI, bukan lagi saat spawn:
//   1. bukan giliran gerbongnya -> tak terlihat, `invuln`, `skip` (tak dianimasi
//      & tak diuji peluru). Sembilan gerbong tersegel lain tidak membebani apa
//      pun dan tidak bocor ke radar.
//   2. giliran gerbongnya, ramp masih turun -> SUDAH BERDIRI SIAP di barisan
//      tembak dan terlihat begitu ramp melewati `revealAtRamp`, tetapi masih
//      `invuln` dan `aiming=false`: belum menembak, belum bisa dilukai.
//   3. ramp TERBUKA PENUH -> `invuln` lepas dan barisan itu membuka tembakan.
export function enemyTrainRobotAI(z, dt) {
    if (!enemyTrain || !z.etSlot) { z.mesh.visible = false; z.invuln = true; return { skip: true }; }
    // Awak SELALU ikut gerbongnya, terbuka atau tidak: kalau tidak, sembilan
    // kru yang belum giliran tertinggal di titik konsist itu berangkat.
    snapMountedRobot(z);
    const armed = etrain.mode === 'open' || etrain.mode === 'engage';
    if (z.etCar !== etrain.car || !armed) {
        z.mesh.visible = false; z.invuln = true; return { skip: true };
    }
    z.state = 'mounted'; z.moving = false; z.losOK = true;
    const dx = camera.position.x - z.mesh.position.x, dz = camera.position.z - z.mesh.position.z;
    z.mesh.rotation.y = Math.atan2(dx, dz);
    // Selama ramp masih menutup, isi peti benar-benar tak boleh terlihat.
    if (etrain.ramp < (etCfg().revealAtRamp ?? 0.45)) {
        z.mesh.visible = false; z.invuln = true; return { skip: true };
    }
    z.mesh.visible = true;
    // Tidak ada jalur transisi yang boleh membuat C yang masih di dalam
    // gerbong menjadi rentan atau mulai menembak. `launchCarBoarders()` adalah
    // satu-satunya titik yang mencabut flag ini, sesudah ramp terbuka penuh.
    if (z.boardingPending) { z.invuln = true; z.aiming = false; return {}; }
    // Ramp belum mendarat: sudah kelihatan berdiri siap, tapi menahan tembakan
    // DAN kebal — pintu setengah terbuka bukan sasaran yang sah.
    if (etrain.ramp < 1) { z.invuln = true; z.aiming = false; return {}; }
    z.invuln = false;
    z.aiming = true;
    return { chaseDist: Math.hypot(dx, dz) };
}

// Rentetan ledakan sepanjang satu gerbong (dipakai gerbong yang terlepas dan
// lokomotif di babak penutup).
function boomAlongCar(i, want, x0) {
    const g = enemyTrain.group.position;
    while ((etrain.boom | 0) < want) {
        const b = etrain.boom | 0;
        _mount.set(x0 + (b - 1) * (ET_LEN / 3), 9, g.z);
        explodeAt(_mount, 0.1, 0, b === 0 ? sfxTankExplode : sfxExplode);
        spawnGibs(_mount.x, 9, _mount.z, 7, -1, 0, 1.4, PAL.gunmetal, 0.6);
        addCamShake(2.4); etrain.boom++;
    }
}

// Gerbong aktif kehabisan robot: ia meledak, kopelnya lepas, dan mulai
// tertinggal. `etCarsKilled` naik SEKARANG supaya journey bisa langsung
// menjatuhkan bekal dan memajukan naskah.
function detachActiveCar() {
    etrain.mode = 'detach'; etrain.t = 0; etrain.boom = 0;
    etWrecks.push({ i: etrain.car, dx: 0 });
    setEnemyStrobe(etrain.car, false);
    etCarsKilled++;
    addCamShake(4.2); playSFX(sfxTankExplode, 0.7);
}

// Bangkai berjalan mundur relatif konsist di SETIAP mode, bukan hanya `detach`.
function updateWrecks(dt) {
    const C = etCfg();
    for (let w = etWrecks.length - 1; w >= 0; w--) {
        const wr = etWrecks[w];
        wr.dx -= dt * (C.wreckDriftSpeed ?? 150);
        setEnemyCarDrift(wr.i, wr.dx);
        setEnemyRamp(wr.i, 1);
        if (wr.dx <= -(C.wreckHideDist ?? 900)) {
            // Ramp ikut ditutup ulang: begitu bangkainya keluar dari daftar,
            // tidak boleh ada gerbong non-aktif yang tercatat masih terbuka.
            setEnemyCarVisible(wr.i, false); setEnemyRamp(wr.i, 0);
            etWrecks.splice(w, 1);
        }
    }
}

export function updateBoardingJumps(dt) {
    const C = boarderCfg();
    for (let i = boardingJumps.length - 1; i >= 0; i--) {
        const b = boardingJumps[i], z = b.z;
        if (!robots.includes(z)) { boardingJumps.splice(i, 1); continue; }
        b.t += dt;
        if (b.t < 0) {
            z.boardingPhase = 'delay'; z.boardingSideOffset = 0;
            z.mesh.position.set(b.inside.x, b.inside.y, b.inside.z);
            z.groundY = b.inside.y; z.baseY = b.inside.y;
            z.mesh.rotation.set(0, Math.atan2(b.door.x - b.inside.x, b.door.z - b.inside.z), 0);
            z.mesh.scale.setScalar(b.base);
            continue;
        }
        const dx = b.target.x - b.door.x, dz = b.target.z - b.door.z;
        const heading = Math.atan2(dx, dz);
        const runDx = b.door.x - b.inside.x, runDz = b.door.z - b.inside.z;
        const runLen = Math.max(0.001, Math.hypot(runDx, runDz));
        if (b.t < b.windup) {
            const k = b.t / b.windup, crouch = Math.sin(k * Math.PI * 0.5);
            z.boardingPhase = 'windup'; z.boardingSideOffset = 0;
            z.mesh.position.set(b.inside.x - runDx / runLen * crouch * 1.7, b.inside.y,
                b.inside.z - runDz / runLen * crouch * 1.7);
            z.groundY = b.inside.y; z.baseY = b.inside.y;
            z.mesh.rotation.set(-crouch * b.pitch * 0.38, heading, -b.side * crouch * 0.018);
            z.mesh.scale.set(b.base * (1 + crouch * 0.1), b.base * (1 - crouch * 0.2), b.base * (1 + crouch * 0.1));
            continue;
        }
        const runT = b.t - b.windup;
        if (runT < b.runup) {
            const k = smoothK(runT / b.runup), lift = Math.sin(k * Math.PI) * 0.65;
            z.boardingPhase = 'runup'; z.boardingSideOffset = 0;
            z.mesh.position.set(
                b.inside.x + runDx * k,
                b.inside.y + lift,
                b.inside.z + runDz * k,
            );
            z.groundY = b.inside.y; z.baseY = b.inside.y;
            z.mesh.rotation.set(-Math.sin(k * Math.PI) * b.pitch * 0.22, heading,
                -b.side * Math.sin(k * Math.PI) * 0.014);
            z.mesh.scale.set(b.base * 1.04, b.base * (1 - Math.sin(k * Math.PI) * 0.1), b.base * 1.04);
            continue;
        }
        if (!z.boardingLaunchFx) {
            z.boardingLaunchFx = true;
            spawnGroundPuff(b.door.x, b.door.z, PAL.amber, 9, 1.7);
            playSFX(sfxRobotSpawn, 0.42);
            addCamShake(C.launchShake ?? 0.8);
        }
        const k = Math.min(1, (runT - b.runup) / b.sec);
        const move = easeInOut(k), loft = Math.sin(k * Math.PI);
        const side = loft * b.side, perpX = Math.cos(heading), perpZ = -Math.sin(heading);
        z.boardingPhase = 'flight'; z.boardingSideOffset = side;
        z.mesh.position.x = b.door.x + dx * move + perpX * side;
        z.mesh.position.z = b.door.z + dz * move + perpZ * side;
        z.mesh.position.y = b.door.y + (b.target.y - b.door.y) * move + loft * b.arc;
        z.groundY = b.door.y + (b.target.y - b.door.y) * move;
        z.baseY = z.groundY;
        z.state = 'jumping'; z.moving = false; z.aiming = false; z.invuln = true;
        z.mesh.visible = true;
        z.mesh.rotation.set(-loft * b.pitch, heading + Math.sin(k * Math.PI * 2) * (C.yawSwing ?? 0.18),
            -Math.sin(k * Math.PI * 2) * b.side * 0.025);
        const squash = k > 0.82 ? 1 - (k - 0.82) / 0.18 * 0.12 : 1;
        z.mesh.scale.set(b.base * (1 + loft * 0.04),
            b.base * squash,
            b.base * (1 + loft * 0.04));
        if (k < 1) continue;
        z.mesh.position.set(b.target.x, b.target.y, b.target.z);
        z.groundY = b.target.y; z.baseY = b.target.y;
        z.mesh.rotation.set(0, heading, 0); z.mesh.scale.setScalar(b.base);
        z.boardingJump = false; z.invuln = false;
        z.boardingPhase = 'landed'; z.boardingSideOffset = 0;
        z.state = 'chasing'; z.moving = false; z.aiming = false; z.attackCd = 0.45;
        spawnGroundPuff(b.target.x, b.target.z, PAL.techDim, 9, b.target.y + 0.9);
        addCamShake(C.landShake ?? 1.1);
        boardingJumps.splice(i, 1);
    }
}

export function boardingRobotAI(z, dt, step) {
    if (z.boardingJump) {
        z.state = 'jumping'; z.moving = false; z.aiming = false; z.invuln = true;
        return {};
    }
    // Boarder sudah berada di gerbong player. Jangan gunakan navGrid stasiun:
    // grid itu tidak mencakup dek perjalanan dan dapat memilih waypoint kembali
    // ke jalur asal. Gerakkan langsung ke pivot player di dalam trainWalk.
    return campaignRobotAI(z, dt, step, { walkable: trainWalk, resolve });
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
    // Sepanjang perjalanan roda konsist ikut berputar seirama kereta player.
    spinEnemyTrain(dt, CFG.campaign.stage5.trainSpeed);
    updateWrecks(dt);

    if (etrain.mode === 'overtake') {
        // MENDAHULUI: seluruh konsist menyalip kereta player sampai gerbong
        // paling belakang berhenti tepat di samping gerbong player.
        const k = Math.min(1, etrain.t / Math.max(0.01, C.overtakeSec));
        const x0 = consistEnterX();
        g.x = x0 + (carAlignX(0) - x0) * smoothK(k);
        if (k >= 1) armCar(0);
        return;
    }
    if (etrain.mode === 'open') {
        // Ramp SATU gerbong jatuh keluar; sisanya tetap tersegel.
        const k = Math.min(1, etrain.t / Math.max(0.01, C.rampSec));
        etrain.ramp = smoothK(k);
        setEnemyRamp(etrain.car, etrain.ramp);
        g.x = carAlignX(etrain.car) + Math.sin(etrain.t * 0.7) * 3.5;
        if (k >= 1) {
            // Pintu/ramp harus sudah terbuka penuh sebelum ada robot C yang
            // bergerak keluar. Awak C sudah ada di dalam; transisi ini hanya
            // melepas koreografi lari dan lompatnya.
            if (!etrain.boardersSpawned) {
                launchCarBoarders(etrain.car);
                etrain.boardersSpawned = true;
            }
            etrain.mode = 'engage'; etrain.t = 0;
        }
        return;
    }
    if (etrain.mode === 'engage') {
        // Kedua kereta melaju sama cepat: relatif diam, dengan ayunan halus.
        g.x = carAlignX(etrain.car) + Math.sin(etrain.t * 0.7) * 3.5;
        if (countEnemyCarRobots() === 0) detachActiveCar();
        return;
    }
    if (etrain.mode === 'detach') {
        // MELEDAK -> TERLEPAS -> TERTINGGAL. Konsist sendiri masih sejajar;
        // yang bergerak hanya bangkainya (updateWrecks).
        const dur = Math.max(0.2, C.detachSec ?? 2.6);
        g.x = carAlignX(etrain.car) + Math.sin(etrain.t * 0.7) * 3.5;
        // Ledakan menyusul BANGKAINYA yang sudah mulai tertinggal, bukan tempat
        // gerbong itu berdiri sebelum kopelnya lepas.
        const wr = etWrecks[etWrecks.length - 1];
        boomAlongCar(etrain.car, Math.min(3, Math.ceil(etrain.t / (dur * 0.6) * 3)),
            g.x + enemyCarOffsetX(etrain.car) + (wr ? wr.dx : 0));
        // Gerbong terakhir pun berlanjut ke `advance`: yang disejajarkan
        // berikutnya adalah LOKOMOTIF, bukan langsung babak penutup.
        if (etrain.t >= dur) { etrain.mode = 'advance'; etrain.t = 0; }
        return;
    }
    if (etrain.mode === 'advance') {
        // Konsist MUNDUR tepat satu gerbong supaya gerbong berikutnya sejajar.
        const k = Math.min(1, etrain.t / Math.max(0.01, C.advanceSec));
        const a = carAlignX(etrain.car), b = carAlignX(etrain.car + 1);
        g.x = a + (b - a) * smoothK(k);
        if (k >= 1) {
            if (etrain.car + 1 < ET_CARGO_CARS) armCar(etrain.car + 1);
            else {
                // LOKOMOTIF SEJAJAR: mulai jendela kebal 3 detik (loco.js).
                etrain.mode = 'boss'; etrain.t = 0; etrain.car = ET_CARGO_CARS;
                armLocoBoss();
            }
        }
        return;
    }
    if (etrain.mode === 'boss') {
        // Kedua kereta melaju sama cepat; lokomotif tetap sejajar sambil
        // bertempur. Seluruh logika senjata + HP ada di loco.js.
        g.x = carAlignX(ET_CARGO_CARS) + Math.sin(etrain.t * 0.7) * 3.5;
        updateLocoBoss(dt);
        if (locoBossDead()) {
            etrain.mode = 'finale'; etrain.t = 0; etrain.boom = 0;
            locoDeathBurst();
        }
        return;
    }
    if (etrain.mode === 'finale') {
        // Gerbong habis: lokomotifnya sendiri terbakar dan tertinggal.
        const dur = Math.max(0.2, C.finaleSec ?? 3.0);
        g.x -= dt * (C.wreckDriftSpeed ?? 150);
        boomAlongCar(ET_CARGO_CARS, Math.min(4, Math.ceil(etrain.t / dur * 4)),
            g.x + enemyCarOffsetX(ET_CARGO_CARS));
        if (etrain.t >= dur) {
            enemyTrain.group.visible = false;
            etrain.mode = 'idle'; etrain.car = -1; etrain.ramp = 0;
            etWrecks = [];
            parkEnemyTrain();
        }
    }
}

export const enemyTrainDebug = () => ({
    mode: etrain.mode, passes: etrain.passes,
    car: etrain.car, cars: ET_CARGO_CARS, spawned: etrain.spawned,
    ramp: etrain.ramp, alive: countEnemyCarRobots(),
    launched: etLaunched, killed: etCarsKilled, done: etConsistDone(),
    wrecks: etWrecks.map(w => ({ i: w.i, dx: w.dx })),
    boarders: boardingJumps.length,
    boardersSpawned: !!etrain.boardersSpawned,
    boarderRobots: robots.filter(z => z.stage === 5 && z.boardingCar != null).length,
    boss: locoBossDebug(), bossActive: locoBossActive(),
    x: enemyTrain?.group?.position?.x ?? 0,
    z: enemyTrain?.group?.position?.z ?? 0,
    alignX: etrain.car >= 0 ? carAlignX(etrain.car) : 0,
    rampAngles: enemyTrain?.ramps?.map(r => r.rotation.x) || [],
    strobes: enemyTrain?.strobes?.map(s => !!s.visible) || [],
    visibleCars: enemyTrain?.cars?.filter(c => c.visible).length || 0,
    visible: !!enemyTrain?.group?.visible,
});

// --- Perjalanan (dipakai journey + arrival) --------------------------------
export let rideT = 0, trainSpeed = 0;
export const resetRide = () => { rideT = 0; trainSpeed = 0; };
// Cutscene kedatangan MENGEMUDIKAN kecepatannya sendiri: shot pertama harus
// berhenti PERSIS pada akhir `arrival.stopSec` (lalu suara kereta dimatikan),
// bukan meluruh asimtotik dan tak pernah benar-benar nol.
export const setTrainSpeed = v => { trainSpeed = Math.max(0, v); };
// KEMAJUAN RUTE = KEMAJUAN TEMPUR (2026-08-08, permintaan user "ubah mekanisme
// menempuh jarak menjadi harus menghancurkan semua gerbong musuh"). Tidak ada
// lagi hitung mundur jarak/waktu: lanskap Jakarta -> Bandung dan kemunculan
// terminal tujuan digerakkan oleh jumlah gerbong musuh yang sudah hancur.
export const routeK = () => Math.min(1, etCarsKilled / Math.max(1, ET_CARGO_CARS));
// Ambang pergantian lanskap kota -> pegunungan Jawa Barat, dinyatakan sebagai
// JUMLAH GERBONG MUSUH yang harus hancur (permintaan user 2026-08-09: "ketika
// gerbong ke-3 hancur"). Karena `routeK` = kill/total, ambangnya jatuh PERSIS
// pada gerbong ke-N — bukan angka pecahan yang ikut bergeser saat jumlah
// gerbong di-retune.
export const sceneryMountainK = () => {
    const n = (CFG.campaign.stage5.scenery || {}).mountainAfterCars;
    return Math.min(1, Math.max(0, (n | 0)) / Math.max(1, ET_CARGO_CARS));
};

// Kotak dalam gerbong player: dipakai `driftGore` untuk mengecualikan apa pun
// yang jatuh di dalam gerbong (darah player, serpihan yang terlempar masuk).
const insideCar = (x, z) =>
    x > TRAIN_X0 - 3 && x < TRAIN_X1 + 3 && z > TRAIN_Z0 - 3 && z < TRAIN_Z1 + 3;

export function updateRide(dt) {
    const C = CFG.campaign.stage5;
    rideT += dt;
    const k = routeK();
    if (phase === 'departure') trainSpeed += (C.trainSpeed - trainSpeed) * Math.min(1, dt * 0.55);
    // `arrival` sengaja TIDAK diatur di sini — lihat `setTrainSpeed`.
    else if (phase !== 'arrival') trainSpeed += (C.trainSpeed - trainSpeed) * Math.min(1, dt * 2.5);
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
    // Babak lanskap: kota dulu, lalu pegunungan Jawa Barat begitu gerbong musuh
    // ke-`mountainAfterCars` hancur. Ambangnya gameplay (jumlah gerbong), jadi
    // ia dihitung di sini dari config dan dikirim ke pool scenery.
    updateJourneyScenery(journey, dt, trainSpeed, phase === 'arrival' || complete ? 1 : k,
        sceneryMountainK());
    // SISA TEMPUR IKUT DUNIA, BUKAN KERETA (2026-08-09, laporan user "serpihan
    // robot mengikuti pergerakan kereta player"): kereta diam di koordinat
    // dunia, jadi serpihan/bangkai/genangan yang dibiarkan di tempatnya akan
    // terbawa selamanya. Isi DALAM gerbong dikecualikan — yang jatuh di lantai
    // gerbong memang ikut kereta.
    driftGore(trainSpeed * dt, insideCar);
    // Guncangan hanya selama perjalanan: keempat shot cutscene kedatangan
    // WAJIB terkunci, sama seperti kelima shot keberangkatan.
    if (trainSpeed > 18 && phase !== 'arrival') addCamShake(0.16 + Math.min(0.08, trainSpeed / 1000));
}

// --- Hook collision bersama ------------------------------------------------
// STASIUN: dinding CSV + pintu tertutup memblok peluru.
export function bulletBlocked(b) {
    if (b.mesh.position.y >= WALL_H) return false;
    return stage5SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
        || stationDoorClampShot(b);
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
		// Boarder C yang masih tersegel tetap mengikuti gerbong seperti awak
		// lain. Hanya sesudah ramp penuh ia berpindah ke AI boarder di dek player.
		if (z.boardingCar != null && !z.boardingPending) return boardingRobotAI(z, dt, step);
        if (z.pickup) return highwayRobotAI(z, dt);
        if (z.mounted) return enemyTrainRobotAI(z, dt);
        return campaignRobotAI(z, dt, step, { walkable: trainWalk, resolve, nav: navGrid });
    },
    clampRobot(z, oldX, oldZ) {
        if (z.boardingJump) return;
        if (z.pickup) { snapHighwayRobot(z); return; }
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
