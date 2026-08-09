// Stage 5 — SUB-SCENE 4: CUTSCENE FINISH DI BANDUNG (arrival -> complete).
//
// FILE SENDIRI SEJAK 2026-08-09 (permintaan user "lebih baik cutscene itu
// dijadikan file terpisah"): sebelumnya isi file ini menempel pada `arrival.js`,
// yang tidak memuat apa pun selain cutscene ini. Namanya sekarang menyebut apa
// yang benar-benar ada di dalamnya, sejajar dengan `departure.js`:
//
//   station -> departure (cutscene berangkat) -> journey -> finish (CUTSCENE INI)
//
// FASE gameplay-nya tetap `arrival` (itu keadaan dunia — kereta sedang tiba;
// `updateRide`, `RIDE_PHASES` dan mesin fase Stage 5 tidak berubah sedikit pun).
//
// EMPAT SHOT (rombak 2026-08-09, permintaan user):
//   1. extreme close-up dari DEPAN LOKOMOTIF, SEJAJAR kereta (bukan dari atas);
//      kereta mengerem sampai berhenti tepat di depan peron, lalu suara
//      keretanya dimatikan,
//   2. close-up PINTU GERBONG TERBUKA,
//   3. close-up Major Gibran TURUN dari gerbong,
//   4. extreme close-up dari DEPAN Gibran; dialog jalan, dan sesudah dialog
//      selesai ditahan `endHoldSec` (3 dtk) sebelum stage ditutup.
//
// ATURAN KERAS UNTUK KEEMPATNYA (sama seperti keberangkatan, jangan
// "dirapikan"):
//   * PERPINDAHAN ANTAR SHOT = POTONGAN. `cineCam` + `setCineFocus(..., snap)`
//     ditulis SEKALI saat potongan, tidak ada fade dan tidak ada gerak kamera
//     penghubung di dalam cutscene.
//   * SETIAP SHOT LOCKED-OFF. Yang bergerak hanya isinya (kereta yang mengerem,
//     daun pintu, Gibran). Guncangan kamera perjalanan dimatikan `updateRide`
//     selama fase ini, dan kecepatan kereta dikemudikan dari sini lewat
//     `setTrainSpeed` supaya shot 1 benar-benar berakhir pada diam.
//
// Cutscene ini baru dipanggil sesudah `journey.js` menahan `arrivalDelaySec`
// (3 dtk) dengan kamera gameplay masih hidup — musuh terakhir hancur, napas,
// baru cutscene.

import { CFG } from '../../../../core/config.js';
import { keys, setCinematicActive } from '../../../../core/state.js';
import { camera, setCineFocus, CAM_LOOK_DROP } from '../../../../core/renderer.js';
import { setCineBars, showCutsceneSkip, hideStageRadioDialogue } from '../../../../core/dom.js';
import { releaseInputs, aimPoint } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import {
    TRAIN_CAR_LENGTH, TRAIN_DOOR_X, dockArrivalTerminal,
} from '../../../../entities/train.js';
import { beginStageTransition } from '../../utility/transition.js';
import { stage6Scene } from '../stage6/index.js';
import {
    journey, carCenterX, locoCenterX, boardDoorPos,
    setBoardDoorTarget, updateBoardDoor, resetBoardDoor, TRAIN_CENTER_Z,
} from './world.js';
import {
    phase, setPhase, complete, setComplete, cine, setCine, cineCam, cleanupCine,
    queueDialogue, dialogueIdle, dialogueCurrentLine, dialogueCharCount,
    updateRide, trainSpeed, setTrainSpeed, stopTrainLoop, TRAIN_HOOKS,
} from './runtime.js';
import { stopHighway } from './highway.js';

// Titik berdiri DI DALAM gerbong tepat di belakang bukaan (shot 1-2: ia berada
// di sisi jauh pintu dari kamera, jadi punggungnya tidak menutupi daun pintu
// seperti yang sempat terjadi di cutscene keberangkatan), dan titik berdirinya
// DI PERON kedatangan sesudah turun.
export const CAR_EXIT_DZ = -4;
export const PLATFORM_STAND_DZ = 30;

// Ofset kamera tiap shot. KONSTAN — tidak ada animasi kamera di shot mana pun.
const SHOT_CAM = Object.freeze({
    // Lokomotif memimpin ke arah +x, jadi "depan" = +x. Fokusnya HIDUNG
    // lokomotif, bukan pusatnya: setengah panjang gerbong 57.75, kamera 40 unit
    // di depan pusat akan berada DI DALAM badan lokomotif.
    //
    // y = -CAM_LOOK_DROP PERSIS (2026-08-09, permintaan user "buat agar
    // kameranya menyorot SEJAJAR dengan kereta, bukan dari atas"): renderer
    // selalu memandang ke `camFocus.y - CAM_LOOK_DROP`, jadi menaruh kamera pada
    // ketinggian yang SAMA membuat sumbu pandangnya benar-benar HORIZONTAL —
    // nol derajat, bukan sekadar "agak rendah". Angkanya diturunkan dari
    // konstanta renderer, bukan disalin.
    engine: Object.freeze({ x: 40, y: -CAM_LOOK_DROP, z: 17 }),
    doorOpen: Object.freeze({ x: 24, y: 30, z: 42 }),
    alight: Object.freeze({ x: 16, y: 40, z: 54 }),
    // Extreme close-up: cukup dekat untuk membaca pose radio, tetap di atas
    // garis mata supaya wajahnya tidak tertutup bahu.
    face: Object.freeze({ x: 7, y: 19, z: 22 }),
});
const SHOTS = Object.freeze(['engine', 'doorOpen', 'alight', 'face']);

// Bahasa tubuh radio per baris: Command melapor, Gibran menerima.
const RADIO_GESTURE = Object.freeze({
    arrivedCommand: 'commandNoExfil',
    arrivedGibran: 'gibranAccepts',
});

const finCfg = () => CFG.campaign.stage5.arrival;
const smooth = k => k * k * (3 - 2 * k);

let shotIdx = -1, stopped = false;

export function resetFinish() { shotIdx = -1; stopped = false; }

export const finishDebug = () => ({
    shot: shotIdx, shotKey: SHOTS[shotIdx] || null, shots: SHOTS.length,
    stopped, speed: trainSpeed,
    t: cine && cine.kind === 'arrival' ? cine.t : 0,
});

const carStand = () => ({ x: carCenterX() + TRAIN_DOOR_X, z: TRAIN_CENTER_Z + CAR_EXIT_DZ });
const platformStand = () => ({
    x: carCenterX() + TRAIN_DOOR_X, z: TRAIN_CENTER_Z + PLATFORM_STAND_DZ,
});
const engineNose = () => locoCenterX() + TRAIN_CAR_LENGTH / 2;

// Jarak tempuh sisa kereta sampai berhenti: integral kurva pengereman
// v0*(1-smoothstep(k)) sepanjang `stopSec`. Luas smoothstep di [0,1] = 0.5,
// jadi hasilnya persis setengah "kalau kecepatannya tetap". Dipakai menaruh
// terminal tujuan sejauh itu di depan supaya ia mendarat TEPAT saat kereta diam.
const brakeDistance = v0 => v0 * Math.max(0.01, finCfg().stopSec) * 0.5;

// Avatar menghadap sebuah titik: playerAvatar membaca `aimPoint` untuk yaw, dan
// input sudah beku (`cinematicActive`), jadi override ini tak melawan kursor.
function faceTo(x, z) {
    if (aimPoint) aimPoint.set(x, camera.position.y - CFG.player.eyeHeight, z);
}

function finishStage() {
    if (complete) return;
    setComplete(true); setPhase('complete'); stopTrainLoop(); setTrainSpeed(0);
    hideStageRadioDialogue(); resetFinish(); resetBoardDoor();
    // `cleanupCine()` TANPA argumen = tirai dibuka seketika: tidak ada fade di
    // ujung cutscene, gerbang finish bersama yang mengambil alih layar. Ia juga
    // membuang `cine`, jadi frame-frame di balik layar hijau tidak lagi
    // menjalankan shot terakhir.
    cleanupCine();
    beginStageTransition(stage6Scene);
}

// POTONGAN: sudut + fokus berpindah dalam frame yang sama, tanpa gerak antara.
function cutTo(idx) {
    shotIdx = idx;
    const key = SHOTS[idx], cam = SHOT_CAM[key];
    cine.t = 0; cine.hold = -1;
    cineCam.x = cam.x; cineCam.y = cam.y; cineCam.z = cam.z;
    if (key === 'engine') {
        setCineFocus(engineNose(), TRAIN_CENTER_Z, true);
        // Stasiun tujuan mulai dari depan lalu MENDEKAT bersama tanah.
        dockArrivalTerminal(journey, brakeDistance(cine.v0 || 0));
    } else if (key === 'doorOpen') {
        const d = boardDoorPos();
        setCineFocus(d.x, d.z, true);
        setBoardDoorTarget(true);
        faceTo(d.x, d.z);
    } else if (key === 'alight') {
        const a = carStand(), p = platformStand();
        setCineFocus((a.x + p.x) / 2, (a.z + p.z) / 2, true);
        faceTo(p.x, p.z + 40);
    } else {
        const p = platformStand();
        setCineFocus(p.x, p.z, true);
        // Menghadap kamera close-up supaya pose radio benar-benar terbaca.
        setAvatarRadioPose(true, Math.atan2(cam.x, cam.z), 'gibranAccepts', 0);
        queueDialogue('arrivedCommand'); queueDialogue('arrivedGibran');
    }
}

function nextShot() {
    if (shotIdx + 1 >= SHOTS.length) { finishStage(); return; }
    cutTo(shotIdx + 1);
}

// SHOT 1: kereta mengerem sampai BENAR-BENAR berhenti pada `stopSec`, lalu
// suara keretanya dimatikan. Kameranya diam; yang melambat adalah tanah, pool
// lanskap, dan stasiun tujuan yang merapat bersamanya.
function updateBraking() {
    const A = finCfg();
    const k = Math.min(1, cine.t / Math.max(0.01, A.stopSec));
    setTrainSpeed((cine.v0 || 0) * (1 - smooth(k)));
    if (k >= 1 && !stopped) {
        stopped = true; setTrainSpeed(0); stopTrainLoop();
        dockArrivalTerminal(journey, 0);   // mendarat persis di rumahnya
    }
}

// SHOT 3: Gibran berjalan dari dalam gerbong, lewat bukaan pintu, ke peron
// kedatangan. Pivot player yang digerakkan, jadi rig avatar memainkan siklus
// langkah aslinya (ia membaca perpindahan pivot).
function updateAlighting(k) {
    const a = carStand(), p = platformStand(), e = smooth(Math.min(1, k));
    camera.position.x = a.x + (p.x - a.x) * e;
    camera.position.z = a.z + (p.z - a.z) * e;
}

// SHOT 4: pose radio mengikuti siapa yang sedang bicara + progres ketikannya.
function updateRadioPose() {
    const line = dialogueCurrentLine();
    if (!line) return;
    const p = line.text.length ? dialogueCharCount() / line.text.length : 1;
    setAvatarRadioPose(true, Math.atan2(SHOT_CAM.face.x, SHOT_CAM.face.z),
        RADIO_GESTURE[line.key] || 'gibranAccepts', Math.min(1, p));
}

function updateFinishCine(dt) {
    if (!cine) return;
    cine.t += dt;
    const A = finCfg(), key = SHOTS[shotIdx];
    if (key === 'engine') {
        updateBraking();
        if (cine.t >= A.frontSec) nextShot();
    } else if (key === 'doorOpen') {
        if (cine.t >= A.doorOpenSec) nextShot();
    } else if (key === 'alight') {
        updateAlighting(cine.t / Math.max(0.01, A.alightSec * 0.78));
        if (cine.t >= A.alightSec) nextShot();
    } else {
        updateRadioPose();
        // Dialog selesai -> TAHAN dulu, baru tutup stage (permintaan user).
        if (cine.hold < 0) {
            if (cine.t >= A.radioMinSec && dialogueIdle()) cine.hold = 0;
        } else if ((cine.hold += dt) >= A.endHoldSec) finishStage();
    }
}

export const finishScene = {
    id: 'campaign-5-finish',

    enter() {
        if (complete) return;
        setPhase('arrival'); releaseInputs(); clearMoveTarget();
        keys.w = keys.a = keys.s = keys.d = false;
        setCinematicActive(true); setCineBars(true);
        // Tirai sub-scene sudah hitam di sini, jadi menutup jalan raya tidak
        // pernah terlihat sebagai objek yang hilang mendadak.
        stopHighway();
        resetFinish(); resetBoardDoor();
        // Gibran menunggu DI DALAM gerbong: shot 2 memperlihatkan pintu terbuka
        // untuknya, shot 3 memperlihatkan ia turun.
        const a = carStand();
        camera.position.set(a.x, CFG.player.eyeHeight, a.z);
        setCine({ kind: 'arrival', t: 0, hold: -1, v0: Math.max(0, trainSpeed) });
        showCutsceneSkip(finishStage);
        cutTo(0);
    },

    updateMode(dt) {
        updateBoardDoor(dt);
        updateFinishCine(dt);
        if (phase === 'arrival') updateRide(dt);
    },

    ...TRAIN_HOOKS,

    hudStatus() { return phase === 'complete' ? 'BANDUNG — ARRIVED' : 'BANDUNG — ARRIVING'; },
    radarLandmarks() { },
};
