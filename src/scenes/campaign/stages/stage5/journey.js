// Stage 5 — SUB-SCENE 3: PERJALANAN (ride). Cutscene keberangkatannya sendiri
// dipisah ke `departure.js` pada 2026-08-08 (permintaan user), jadi chapter ini
// dimulai TEPAT ketika shot itu selesai — arena kereta di-reset di enter()
// selagi tirai sub-scene masih hitam.
//
// ROMBAK GAMELOOP 2026-08-08 (permintaan user): tidak ada lagi BEBERAPA konsist
// musuh yang datang bergantian. Player terkunci DI DALAM SATU GERBONG selebar
// 4 m sepanjang perjalanan, dan seluruh perlawanan datang dari SATU kereta
// musuh sepuluh gerbong yang muncul di jalur sebelah beberapa saat setelah
// perjalanan dimulai, MENDAHULUI kereta player, lalu berhenti relatif tepat
// ketika gerbong PALING BELAKANG-nya sejajar dengan gerbong player. Ramp
// gerbong itu terbuka SENDIRIAN; robotnya menembak lintas-rel; kalau habis,
// gerbong itu meledak, terlepas, dan tertinggal, lalu sisa konsist mundur satu
// gerbong supaya gerbong berikutnya sejajar dan membuka ramp-nya. Begitu
// seterusnya sampai kesepuluh gerbong habis dan lokomotifnya ikut hancur.
// Arena kereta tetap statis; hanya pool scenery yang bergulir.

import { CFG } from '../../../../core/config.js';
import { player } from '../../../../core/state.js';
import { camera } from '../../../../core/renderer.js';
import { showStageMsg } from '../../../../core/dom.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { currentWeapon } from '../../../../entities/weapons.js';
import { countStageRobots } from '../../utility/common.js';
import {
    stationRoot, train, highwayPickups,
    TRAIN_BASE_X, TRAIN_CENTER_Z, TRAIN_X0, TRAIN_X1,
    JOURNEY_ENEMY_Z, CAR_SUPPLY_POINTS,
} from './world.js';
import {
    setPhase, enterSub, queueDialogue,
    updateRide, etrain, etCarsKilled, etLaunched,
    etCarTotal, etConsistDone, launchEnemyConsist, countLiveHostiles,
    updateEnemyTrain, TRAIN_HOOKS,
} from './runtime.js';
import {
    updateHighway, highwayActive, highwayClear, highwayCarsDestroyed, roadMerged,
} from './highway.js';
import { finishScene } from '../../cutscenes/stage5/finish.js';
import { locoBossDebug } from './loco.js';

let gapT = 0, rewarded = 0, clearT = 0, clearShown = false;

export function resetJourney() {
    gapT = 0; rewarded = 0; clearT = 0; clearShown = false;
}

function placeCarSupplies() {
    for (const p of CAR_SUPPLY_POINTS) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}

// Naskah perjalanan: konsist muncul, pertengahan pertempuran gerbong, dan
// gerbong terakhir. `queueDialogue` membuang kunci yang sudah pernah tampil,
// jadi urutannya tetap utuh berapa pun gerbong yang tersisa.
function carDialogue(i) {
    const total = etCarTotal();
    if (i === Math.floor(total / 2)) { queueDialogue('roofWarning'); queueDialogue('roofReply'); }
    if (i === total - 1) { queueDialogue('finalApproach'); queueDialogue('finalReply'); }
}

// Setiap gerbong yang hancur meninggalkan bekal: player tak bisa keluar gerbong
// untuk mencari amunisi, jadi persediaan harus datang kepadanya.
function dropCarSupplies() {
    const w = player.owned && player.owned[currentWeapon] ? currentWeapon : 'rifle';
    spawnAmmoDrop(TRAIN_BASE_X, TRAIN_CENTER_Z - 4, w, 1e9);
    if (etCarsKilled % Math.max(1, CFG.campaign.stage5.enemyTrain.medkitEveryCars | 0) === 0)
        spawnMedkitDrop(TRAIN_BASE_X + 18, TRAIN_CENTER_Z + 4, 1e9);
}

function updateConsist(dt) {
    const E = CFG.campaign.stage5.enemyTrain;
    // Bekal dijatuhkan tepat ketika satu gerbong lagi tercatat hancur.
    if (etCarsKilled > rewarded) { rewarded = etCarsKilled; dropCarSupplies(); }
    // Naskah mengikuti keadaan konsist, bukan timer terpisah: peringatan
    // kontak jatuh saat ia menyalip, sisanya mengikuti gerbong yang dibuka.
    if (etrain.mode === 'overtake') { queueDialogue('breach'); queueDialogue('breachReply'); }
    if (etrain.car >= 0) carDialogue(etrain.car);
    if (!etLaunched) {
        // Konsist musuh baru muncul BEBERAPA SAAT setelah perjalanan dimulai.
        gapT += dt;
        if (gapT >= (E.consistDelaySec ?? 12)) launchEnemyConsist();
        return;
    }
    // GERBANG KEDATANGAN = HABISKAN SEMUANYA (2026-08-08, permintaan user):
    // tidak ada lagi `rideMinSec`/hitung mundur jarak. Bandung terbuka begitu
    // seluruh gerbong musuh hancur, konvoi jalan raya bersih, dan tak ada robot
    // yang tersisa.
    if (!(etConsistDone() && highwayClear() && countStageRobots(5) === 0)) {
        clearT = 0; clearShown = false; return;
    }
    // JEDA PENUTUP (2026-08-08, laporan user "terasa aneh karena ketika musuh
    // terakhir hancur langsung masuk ke scene finish"): musuh terakhir hancur
    // -> beri napas dulu sebelum sub-scene kedatangan. Selama jeda ini kamera
    // gameplay dan kontrol player TETAP aktif — pola yang sama dengan
    // `tankOutro.preCutsceneDelaySec` Stage 4 dan `gunshipDeathDelaySec`
    // Stage 8, jadi ledakan terakhirnya sempat terbaca.
    if (!clearShown) {
        clearShown = true;
        showStageMsg('ALL HOSTILES DESTROYED — BANDUNG AHEAD', 4200);
    }
    clearT += dt;
    if (clearT >= (CFG.campaign.stage5.arrivalDelaySec ?? 3)) enterSub(finishScene);
}

export const journeyDebug = () => ({
    gapT, rewarded,
    carsKilled: etCarsKilled, carTotal: etCarTotal(), consistLaunched: etLaunched,
    highwayActive: highwayActive(), highwayMerged: roadMerged(),
    highwayDestroyed: highwayCarsDestroyed(),
    clearT, clearShown,
});

export const journeyScene = {
    id: 'campaign-5-journey',

    // Dipanggil dari `departure.js` SELAGI TIRAI SUB-SCENE MASIH HITAM, jadi
    // reset arena (kereta kembali ke koordinat statisnya, stasiun awal
    // disembunyikan, player ditempatkan di dalam gerbong) tidak pernah terlihat.
    enter() {
        train.group.position.x = 0;
        stationRoot.visible = false;
        camera.position.set(TRAIN_X0 + 22, CFG.player.eyeHeight, TRAIN_CENTER_Z);
        setPhase('ride'); resetJourney();
        placeCarSupplies();
        showStageMsg('HOLD THE CAR — DESTROY EVERY HOSTILE CAR TO REACH BANDUNG', 5000);
    },

    updateMode(dt) {
        updateRide(dt); updateEnemyTrain(dt);
        updateHighway(dt, etConsistDone()); updateConsist(dt);
    },

    ...TRAIN_HOOKS,

    // TANPA HITUNG MUNDUR JARAK (2026-08-08, permintaan user): satu-satunya
    // ukuran kemajuan adalah gerbong musuh yang sudah dihancurkan.
    hudStatus() {
        // Awak gerbong yang masih tersegel TIDAK dihitung: mereka ada di dunia
        // sejak konsist berangkat, tetapi belum jadi musuh yang bisa dilawan.
        const n = countLiveHostiles(), total = etCarTotal();
        const road = highwayActive()
            ? ` | ROAD CONVOY DESTROYED ${highwayCarsDestroyed()}` : '';
        if (!etLaunched) return 'TO BANDUNG — HOSTILE CONTACT ON THE PARALLEL TRACK';
        if (etrain.mode === 'overtake') return 'HOSTILE CONSIST OVERTAKING';
        // MINI BOS LOKOMOTIF (2026-08-09): HUD-nya menyebut jendela kebal
        // secara eksplisit, kalau tidak "peluru tidak mempan" terbaca sebagai bug.
        if (etrain.mode === 'boss') {
            const b = locoBossDebug();
            if (!b) return 'HOSTILE LOCOMOTIVE';
            if (!b.vulnerable) return 'HOSTILE LOCOMOTIVE POWERING UP — ARMOR STILL SEALED';
            return `HOSTILE LOCOMOTIVE — ${Math.max(0, Math.ceil(b.hp / b.maxHp * 100))}%${road}`;
        }
        if (etConsistDone()) return `ENEMY CARS DESTROYED ${etCarsKilled}/${total}${road}`;
        if (etrain.mode === 'open') return `ENEMY CAR ${etrain.car + 1}/${total} OPENING${road}`;
        return `ENEMY CAR ${etrain.car + 1}/${total} — Robots: ${n}${road}`;
    },

    radarLandmarks(plot) {
        if (etrain.mode !== 'idle' && etrain.mode !== 'flyby')
            for (const x of [TRAIN_X0, TRAIN_BASE_X, TRAIN_X1])
                plot(x - camera.position.x, JOURNEY_ENEMY_Z - camera.position.z, '#ffb03b', 4, true);
        // Jalan raya di sisi berlawanan: hanya pengangkut yang masih hidup.
        for (const p of highwayPickups) if (p.active && !p.wreck)
            plot(p.group.position.x - camera.position.x,
                p.group.position.z - camera.position.z, '#ffb03b', 4, true);
    },
};
