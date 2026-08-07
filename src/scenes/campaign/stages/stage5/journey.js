// Stage 5 — SUB-SCENE 2: KERETA BERANGKAT (departure -> ride).
//
// ROMBAK GAMELOOP 2026-08-07 (permintaan user): tidak ada lagi rantai gerbong
// cargo -> security -> roof -> finalDefense. Player terkunci DI DALAM SATU
// GERBONG selebar 4 m sepanjang perjalanan, dan seluruh perlawanan datang dari
// KERETA MUSUH yang menyusul di jalur sebelah: konsist 1-3 gerbong, tiap
// gerbong berisi 3-6 robot kelas A/B (B selalu lebih banyak dari A) yang muncul
// dari gerbong lalu menembak lintas-rel. Habiskan seluruh robotnya -> konsist
// itu meledak dan menghilang, lalu gelombang berikutnya menyusul. Arena kereta
// tetap statis; hanya pool scenery yang bergulir.

import { CFG } from '../../../../core/config.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageMsg, setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { currentWeapon } from '../../../../entities/weapons.js';
import { countStageRobots } from '../../utility/common.js';
import { playSFX, sfxPurchase } from '../../../../utils/sfx.js';
import {
    stationRoot, train, setStationTrainView, boardMarker, updateLandmarks,
    TRAIN_BASE_X, TRAIN_CENTER_Z, TRAIN_X0, TRAIN_X1, STATION_TC_X,
    STATION_TRAIN_DX, JOURNEY_ENEMY_Z, CAR_SUPPLY_POINTS, CELL,
} from './world.js';
import {
    phase, setPhase, cine, setCine, cineCam, enterSub, queueDialogue, dialogueIdle,
    updateRide, rideT, routeK, resetRide, etrain, etCleared, etSent,
    resetEnemyTrain, sendEnemyWave, updateEnemyTrain, startTrainLoop, TRAIN_HOOKS,
} from './runtime.js';
import { arrivalScene } from './arrival.js';

// Ofset kamera shot keberangkatan — KONSTAN, bukan animasi. Shot ini harus
// benar-benar locked-off supaya stasiun terbaca diam.
const DEPART_CAM = Object.freeze({ x: -118, y: 96, z: 118 });
// Tempat berdiri Gibran di dalam gerbong selama shot keberangkatan, diukur ke
// BARAT dari pusat gerbong (separuh dalam gerbong = 55.35), bukan dari peron.
const CAR_STAND_DX = 46;

let departureShift = 0, gapT = 0, rewarded = 0;

export function resetJourney() { departureShift = 0; gapT = 0; rewarded = 0; }

const waveTotal = () => Math.max(1, CFG.campaign.stage5.enemyTrain.waveCount | 0);

function placeCarSupplies() {
    for (const p of CAR_SUPPLY_POINTS) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}

function finishDeparture() {
    // Reset arena train ketika layar hitam; stasiun awal tidak pernah bergeser.
    departureShift = 0; train.group.position.x = 0;
    stationRoot.visible = false;
    camera.position.set(TRAIN_X0 + 22, CFG.player.eyeHeight, TRAIN_CENTER_Z);
    hideCutsceneSkip(); setCineFocus(null); setCineBars(false); setCinematicActive(false);
    setCineFade(0, CFG.campaign.stage5.fadeSec);
    setCine(null); setPhase('ride'); gapT = 0;
    placeCarSupplies();
    showStageMsg('HOLD THE CAR — HOSTILE CONSISTS WILL RUN THE PARALLEL TRACK', 5000);
}

// KAMERA TERKUNCI (2026-08-07, laporan user "stasiun terlihat ikut bergerak"):
// dulu titik fokus + pivot kamera ikut digeser `departureShift`, sehingga kereta
// diam di layar dan justru STASIUN yang menyapu lewat. Sekarang framing dipatok
// mati di peron dan HANYA kereta yang melaju keluar frame — satu-satunya cara
// penonton bisa membaca kereta yang berangkat, bukan stasiun yang bergerak.
function updateDepartureCine(dt) {
    if (!cine) return;
    cine.t += dt;
    const C = CFG.campaign.stage5;
    const k = Math.min(1, cine.t / Math.max(0.01, C.departureMinSec));
    cineCam.x = DEPART_CAM.x; cineCam.y = DEPART_CAM.y; cineCam.z = DEPART_CAM.z;
    // Percepatan (k*k) = kereta menarik pelan lalu melaju; seluruh stationRoot
    // tetap di (0,0,0). Arena di-reset saat layar hitam di finishDeparture.
    departureShift = k * k * (C.departureShiftUnits || CELL * 28);
    train.group.position.x = STATION_TRAIN_DX + departureShift;
    // PLAYER IKUT GERBONG (2026-08-08, laporan user "Major Gibran tertinggal"):
    // pivot player dulu dipatok mati di peron sementara badan kereta melaju,
    // jadi avatarnya berdiri sendirian di rel sementara keretanya pergi. Ia ada
    // DI DALAM gerbong, jadi ofsetnya terhadap pusat gerbong harus tetap.
    // Framing tidak terpengaruh: selama `cineFocus` aktif, viewCam mengikuti
    // titik fokus itu, bukan pivot — shot-nya tetap terkunci di peron.
    camera.position.x = STATION_TC_X - CAR_STAND_DX + departureShift;
    camera.position.z = TRAIN_CENTER_Z;
    setCineFocus(STATION_TC_X, TRAIN_CENTER_Z, true);
    if (!cine.fading && cine.t >= C.departureMinSec && dialogueIdle()) {
        cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
    }
    if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishDeparture();
}

// Dialog gelombang: beat pertama, beat tengah, dan beat terakhir. `queueDialogue`
// membuang kunci yang sudah pernah tampil, jadi urutan naskah tetap utuh walau
// `waveCount` di-retune.
function waveDialogue(i) {
    const last = i >= waveTotal() - 1;
    if (i === 0) { queueDialogue('breach'); queueDialogue('breachReply'); }
    if (i === 1 || last) { queueDialogue('roofWarning'); queueDialogue('roofReply'); }
    if (last) { queueDialogue('finalApproach'); queueDialogue('finalReply'); }
}

// Setiap konsist yang hancur meninggalkan bekal: player tak bisa keluar gerbong
// untuk mencari amunisi, jadi persediaan harus datang kepadanya.
function dropWaveSupplies() {
    const w = player.owned && player.owned[currentWeapon] ? currentWeapon : 'rifle';
    spawnAmmoDrop(TRAIN_BASE_X, TRAIN_CENTER_Z - 4, w, 1e9);
    if (etCleared % Math.max(1, CFG.campaign.stage5.enemyTrain.medkitEveryTrains | 0) === 0)
        spawnMedkitDrop(TRAIN_BASE_X + 18, TRAIN_CENTER_Z + 4, 1e9);
}

function updateWaves(dt) {
    const C = CFG.campaign.stage5, E = C.enemyTrain;
    // Jeda antar-gelombang dihitung dari SAAT konsist sebelumnya hancur.
    if (etCleared > rewarded) { rewarded = etCleared; gapT = 0; dropWaveSupplies(); }
    if (etrain.mode !== 'idle') return;
    gapT += dt;
    if (etSent < waveTotal()) {
        if (gapT >= (etSent === 0 ? E.firstWaveSec : E.waveGapSec)) {
            waveDialogue(etSent);
            sendEnemyWave(etSent);
            gapT = 0;
        }
        return;
    }
    // Semua gelombang bersih: barulah kedatangan Bandung dibuka.
    if (etCleared >= waveTotal() && rideT >= C.rideMinSec && countStageRobots(5) === 0)
        enterSub(arrivalScene);
}

export const journeyDebug = () => ({
    departureShift, gapT, rewarded, wavesSent: etSent, wavesCleared: etCleared,
    waveTotal: waveTotal(),
});

export const journeyScene = {
    id: 'campaign-5-journey',

    enter() {
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setPhase('departure'); resetRide(); resetJourney(); boardMarker.visible = false;
        setStationTrainView(false); resetEnemyTrain();
        // Apa pun yang masih hidup di stasiun ditinggal di sana; kereta harus
        // berangkat dengan deck bersih sebelum gelombang pertama dijadwalkan.
        for (let i = robots.length - 1; i >= 0; i--) {
            const z = robots[i];
            if (z.stage !== 5) continue;
            disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
        }
        camera.position.set(STATION_TC_X - CAR_STAND_DX, CFG.player.eyeHeight, TRAIN_CENTER_Z);
        setCinematicActive(true); setCineBars(true);
        setCine({ kind: 'departure', t: 0, fading: false });
        queueDialogue('commandDeparture'); queueDialogue('gibranDeparture');
        setCineFocus(STATION_TC_X, TRAIN_CENTER_Z, true);
        showCutsceneSkip(finishDeparture); startTrainLoop(); playSFX(sfxPurchase, 0.45);
    },

    updateMode(dt) {
        if (phase === 'departure') {
            // Stasiun masih terlihat selama shot keberangkatan: rotor C1/C2
            // harus tetap berputar, bukan membeku.
            updateLandmarks(dt, true, true);
            updateDepartureCine(dt); updateRide(dt);
            return;
        }
        updateRide(dt); updateEnemyTrain(dt); updateWaves(dt);
    },

    ...TRAIN_HOOKS,

    hudStatus() {
        const C = CFG.campaign.stage5 || {};
        const km = Math.max(1, Math.ceil((C.routeKm || 120) * (1 - routeK())));
        const n = countStageRobots(5);
        if (etrain.mode === 'approach') return `TO BANDUNG — ${km} KM | HOSTILE CONSIST CLOSING`;
        if (n > 0) return `TO BANDUNG — ${km} KM | CONSIST ${etSent}/${waveTotal()} — Robots: ${n}`;
        return `TO BANDUNG — ${km} KM | CONSISTS DESTROYED ${etCleared}/${waveTotal()}`;
    },

    radarLandmarks(plot) {
        if (etrain.mode === 'idle' || etrain.mode === 'flyby') return;
        // Konsist musuh adalah satu-satunya landmark yang relevan di perjalanan.
        for (const x of [TRAIN_X0, TRAIN_BASE_X, TRAIN_X1])
            plot(x - camera.position.x, JOURNEY_ENEMY_Z - camera.position.z, '#ffb03b', 4, true);
    },
};
