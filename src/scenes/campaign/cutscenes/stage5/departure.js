// Stage 5 — SUB-SCENE 2: CUTSCENE KERETA BERANGKAT.
//
// DIPISAH DARI journey.js PADA 2026-08-08 (permintaan user): dulu shot
// keberangkatan adalah fase pertama sub-scene journey, jadi "kereta berangkat"
// dan "perjalanan" berbagi satu enter(). Sekarang ia berdiri sendiri di antara
// stasiun dan perjalanan:
//
//   station (player di titik naik + naskah stasiun tuntas + jeda 3 dtk)
//     -> departure (SHOT INI)
//     -> journey (chapter perjalanan baru benar-benar dimulai)
//
// ROMBAK TOTAL 2026-08-08 (permintaan user): bukan lagi SATU shot panjang
// kereta meninggalkan peron, melainkan LIMA SHOT berurutan —
//   1. close-up pintu gerbong TERBUKA,
//   2. close-up Major Gibran MENAIKI gerbong,
//   3. close-up pintu gerbong TERTUTUP,
//   4. close-up Gibran MENGHUBUNGI MARKAS,
//   5. close-up dari DEPAN KANAN kereta ketika kereta BERANGKAT.
//
// DUA ATURAN KERAS UNTUK KELIMANYA (permintaan user, jangan "dirapikan"):
//   * PERPINDAHAN ANTAR SHOT = POTONGAN (cut). Sudut + titik fokus berganti
//     dalam frame yang sama lewat `setCineFocus(..., snap=true)`; TIDAK ADA
//     fade-in/fade-out dan tidak ada gerak kamera penghubung.
//   * SETIAP SHOT LOCKED-OFF. `cineCam` dan titik fokus di-set SEKALI saat
//     potongan lalu tidak disentuh lagi sampai shot berikutnya — yang bergerak
//     hanya isinya (daun pintu, Gibran, kereta). Titik fokus shot 5 pun diambil
//     sekali dari posisi lokomotif saat itu, jadi kereta melaju keluar frame
//     alih-alih stasiun yang menyapu lewat (regresi 2026-08-07).

import { CFG } from '../../../../core/config.js';
import { robots, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus, CAM_LOOK_DROP } from '../../../../core/renderer.js';
import { setCineBars, showCutsceneSkip } from '../../../../core/dom.js';
import { releaseInputs, aimPoint } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { setAvatarRadioPose, setAvatarCarried } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import {
    train, setBoardDoorTarget, updateBoardDoor, resetBoardDoor, boardDoorPos, locoCenterX,
    updateLandmarks, boardMarker,
    TRAIN_CENTER_Z, STATION_TC_X, STATION_TRAIN_DX, CELL, S5_BOARD,
} from '../../stages/stage5/world.js';
import {
    setPhase, cine, setCine, cineCam, cleanupCine, enterSub,
    queueDialogue, dialogueIdle, dialogueCurrentLine, dialogueCharCount,
    updateRide, resetRide, resetEnemyTrain, startTrainLoop, TRAIN_HOOKS,
} from '../../stages/stage5/runtime.js';
import { resetHighway } from '../../stages/stage5/highway.js';
import { journeyScene } from '../../stages/stage5/journey.js';

// Tempat berdiri Gibran DI DALAM gerbong sesudah naik, diukur ke BARAT dari
// pusat gerbong: tepat di belakang bukaan naik, jauh di dalam separuh panjang
// dalam gerbong (55.35) sehingga ia tak pernah menembus sekat ujung.
export const CAR_STAND_DX = 28;
export const CAR_STAND_DZ = 4;
// Gibran menunggu SATU LANGKAH LEBIH DALAM di peron daripada titik naik selama
// shot 1. Bukan gaya-gayaan: berdiri persis di depan pintu membuat avatarnya
// jatuh tepat di antara kamera close-up dan daun pintu, jadi shot "pintu
// terbuka" akan tertutup punggungnya sendiri. Dari sini ia keluar frame shot 1
// lalu BERJALAN MASUK di shot 2.
export const BOARD_WAIT_DZ = 16;

// Ofset kamera tiap shot. KONSTAN — tidak ada animasi kamera di shot mana pun.
// Shot 1-4 memandang dari sisi peron (+z) supaya dinding gerbong yang setinggi
// dada tidak pernah menutupi bukaan/avatar; shot 5 memandang dari DEPAN KANAN
// kereta (+x = arah maju, +z = sisi kanan badan kereta).
const SHOT_CAM = Object.freeze({
    doorOpen: Object.freeze({ x: 24, y: 30, z: 42 }),
    board: Object.freeze({ x: 16, y: 40, z: 54 }),
    // SHOT 3 SEJAJAR GERBONG (2026-08-09, permintaan user "arah sorot kamera
    // scene ketika pintu gerbong menutup sejajar dengan gerbong, tidak dari atas
    // gerbong seperti sekarang"). Renderer selalu memandang ke
    // `camFocus.y - CAM_LOOK_DROP`, jadi kamera pada ketinggian yang SAMA
    // membuat sumbu pandangnya benar-benar horizontal — nol derajat, bukan
    // sekadar rendah. Angkanya diturunkan dari konstanta renderer, bukan
    // disalin: mengubahnya di sana harus ikut memiringkan/meratakan shot ini.
    // Jaraknya dirapatkan (50 -> 30 unit) karena pandangan sejajar kehilangan
    // "kelonggaran" yang dulu didapat dari memandang ke bawah.
    doorClose: Object.freeze({ x: -18, y: -CAM_LOOK_DROP, z: 24 }),
    // y=38: sinar kamera harus lewat DI ATAS dinding samping setinggi dada,
    // kalau tidak kakinya tertelan dinding di close-up sedekat ini.
    radio: Object.freeze({ x: 13, y: 38, z: 34 }),
    depart: Object.freeze({ x: 104, y: 56, z: 82 }),
});
const SHOTS = Object.freeze(['doorOpen', 'board', 'doorClose', 'radio', 'depart']);

// Bahasa tubuh radio per baris: Gibran melapor, Command yang didengarkan.
const RADIO_GESTURE = Object.freeze({
    commandDeparture: 'commandNoExfil',
    gibranDeparture: 'gibranCall',
});

const depCfg = () => CFG.campaign.stage5.departure;
const smooth = k => k * k * (3 - 2 * k);

let departureShift = 0, shotIdx = -1;

export function resetDeparture() { departureShift = 0; shotIdx = -1; }

export const departureDebug = () => ({
    shift: departureShift,
    shot: shotIdx, shotKey: SHOTS[shotIdx] || null, shots: SHOTS.length,
    t: cine && cine.kind === 'departure' ? cine.t : 0,
});

// Titik berdiri Gibran di dalam gerbong (koordinat dunia, kereta masih terdok)
// dan tempatnya menunggu di peron sebelum pintu terbuka.
const carStand = () => ({ x: STATION_TC_X - CAR_STAND_DX, z: TRAIN_CENTER_Z + CAR_STAND_DZ });
const boardWait = () => ({ x: S5_BOARD.x, z: S5_BOARD.z + BOARD_WAIT_DZ });

// Avatar menghadap sebuah titik: playerAvatar membaca `aimPoint` untuk yaw, dan
// input sudah beku (`cinematicActive`), jadi override ini tak melawan kursor.
function faceTo(x, z) {
    if (aimPoint) aimPoint.set(x, camera.position.y - CFG.player.eyeHeight, z);
}

// Akhir shot (atau tombol SKIP): sub-scene perjalanan yang menyiapkan arenanya
// sendiri di balik tirai hitam `enterSub`.
// SKIP di tengah shot 1/2 bisa meninggalkan pintu setengah terbuka, jadi
// pintunya dijepret tertutup (tanpa SFX — layarnya sudah hitam).
function finishDeparture() {
    resetDeparture(); resetBoardDoor(); setAvatarRadioPose(false); setAvatarCarried(false);
    cleanupCine();
    enterSub(journeyScene);
}

// POTONGAN: sudut + fokus berpindah dalam frame yang sama, tanpa gerak antara.
function cutTo(idx) {
    shotIdx = idx;
    const key = SHOTS[idx], cam = SHOT_CAM[key], stand = carStand();
    cine.t = 0;
    cineCam.x = cam.x; cineCam.y = cam.y; cineCam.z = cam.z;
    if (key === 'doorOpen' || key === 'doorClose') {
        const d = boardDoorPos();
        setCineFocus(d.x, d.z, true);
        setBoardDoorTarget(key === 'doorOpen');
        // Sama-sama MENGHADAP PINTU: di shot 1 Gibran masih di peron (pintu ada
        // di -z darinya), di shot 3 ia sudah di dalam gerbong (pintu di +z).
        faceTo(d.x, d.z);
    } else if (key === 'board') {
        const w = boardWait();
        setCineFocus((w.x + stand.x) / 2, (w.z + stand.z) / 2, true);
        faceTo(stand.x, stand.z - 40);
    } else if (key === 'radio') {
        setCineFocus(stand.x, stand.z, true);
        // Menghadap kamera close-up supaya pose radio benar-benar terbaca.
        setAvatarRadioPose(true, Math.atan2(cam.x, cam.z), 'gibranCall', 0);
        queueDialogue('commandDeparture'); queueDialogue('gibranDeparture');
    } else {
        // SHOT 5. Titik fokus diambil SEKALI dari posisi lokomotif saat ini lalu
        // dikunci; kereta yang melaju melewatinya.
        setAvatarRadioPose(false);
        // Pivotnya IKUT gerbong pada shot ini, jadi rig avatar harus diberi tahu
        // bahwa itu bukan langkah kakinya (laporan user 2026-08-09: "ketika
        // kereta berjalan, major gibran malah terlihat sedang berlari").
        setAvatarCarried(true);
        setCineFocus(locoCenterX(), TRAIN_CENTER_Z, true);
        startTrainLoop();
    }
}

function nextShot() {
    if (shotIdx + 1 >= SHOTS.length) { finishDeparture(); return; }
    cutTo(shotIdx + 1);
}

// SHOT 2: Gibran berjalan dari titik naik di peron, lewat bukaan pintu, ke
// tempat berdirinya di dalam gerbong. Pivot player yang digerakkan, jadi rig
// avatar memainkan siklus langkah aslinya (ia membaca perpindahan pivot).
function updateBoarding(k) {
    const stand = carStand(), w = boardWait(), e = smooth(Math.min(1, k));
    camera.position.x = w.x + (stand.x - w.x) * e;
    camera.position.z = w.z + (stand.z - w.z) * e;
}

// SHOT 4: pose radio mengikuti siapa yang sedang bicara + progres ketikannya.
function updateRadioPose() {
    const line = dialogueCurrentLine();
    if (!line) return;
    const p = line.text.length ? dialogueCharCount() / line.text.length : 1;
    setAvatarRadioPose(true, Math.atan2(SHOT_CAM.radio.x, SHOT_CAM.radio.z),
        RADIO_GESTURE[line.key] || 'gibranCall', Math.min(1, p));
}

// SHOT 5: hanya BADAN KERETA yang maju (kurva k² = menarik pelan lalu melaju,
// berakhir tepat di kecepatan jelajah). Player IKUT gerbong — memakukan pivot
// di peron dulu membuat avatarnya berdiri sendirian di rel (laporan user
// 2026-08-08); framing tidak terpengaruh karena selama `cineFocus` aktif
// viewCam mengikuti titik fokus, bukan pivot.
function updateDeparting(k) {
    const C = CFG.campaign.stage5;
    departureShift = k * k * (C.departureShiftUnits || CELL * 28);
    train.group.position.x = STATION_TRAIN_DX + departureShift;
    const stand = carStand();
    camera.position.x = stand.x + departureShift;
    camera.position.z = stand.z;
    // Menghadap arah laju; titiknya ikut bergeser supaya pivot tak pernah
    // menyusulnya dan membuat avatar berbalik badan di tengah shot.
    faceTo(camera.position.x + 200, camera.position.z);
}

function updateDepartureCine(dt) {
    if (!cine) return;
    cine.t += dt;
    const D = depCfg(), key = SHOTS[shotIdx];
    if (key === 'doorOpen') {
        if (cine.t >= D.doorOpenSec) nextShot();
    } else if (key === 'board') {
        updateBoarding(cine.t / Math.max(0.01, D.boardSec * 0.78));
        if (cine.t >= D.boardSec) nextShot();
    } else if (key === 'doorClose') {
        if (cine.t >= D.doorCloseSec) nextShot();
    } else if (key === 'radio') {
        updateRadioPose();
        if (cine.t >= D.radioMinSec && dialogueIdle()) nextShot();
    } else {
        updateDeparting(Math.min(1, cine.t / Math.max(0.01, D.departSec)));
        updateRide(dt);
        if (cine.t >= D.departSec) finishDeparture();
    }
}

export const departureScene = {
    id: 'campaign-5-departure',

    enter() {
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setPhase('departure'); resetRide(); resetDeparture(); boardMarker.visible = false;
        resetEnemyTrain(); resetHighway();
        // Apa pun yang masih hidup di stasiun ditinggal di sana; kereta harus
        // berangkat dengan deck bersih sebelum konsist musuh dijadwalkan.
        for (let i = robots.length - 1; i >= 0; i--) {
            const z = robots[i];
            if (z.stage !== 5) continue;
            disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
        }
        // Gibran masih DI PERON: shot 1 memperlihatkan pintu terbuka untuknya.
        const w = boardWait();
        camera.position.set(w.x, CFG.player.eyeHeight, w.z);
        setCinematicActive(true); setCineBars(true);
        // Tanpa fade sama sekali di dalam cutscene: tirai sub-scene sudah
        // menanganinya, dan tiap perpindahan shot memang harus berupa potongan.
        setCine({ kind: 'departure', t: 0 });
        showCutsceneSkip(finishDeparture);
        cutTo(0);
    },

    updateMode(dt) {
        // Stasiun masih terlihat selama cutscene: rotor C1/C2 harus tetap
        // berputar, bukan membeku.
        updateLandmarks(dt, true, true);
        updateBoardDoor(dt);
        updateDepartureCine(dt);
    },

    // Kendali dibekukan sepanjang cutscene, tetapi hook-nya SENGAJA tetap hook
    // kereta yang sama seperti waktu `departure` masih fase pertama journey —
    // memisahkan file tidak boleh mengubah ground height/collision satu frame pun.
    ...TRAIN_HOOKS,

    hudStatus: () => 'DEPARTING — BANDUNG LOGISTICS TERMINAL',
    radarLandmarks() { },
};
