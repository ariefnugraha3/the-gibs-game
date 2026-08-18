// ============================================================
// N.U.S.A. VULTURE-B — PENGANGKUT BAREL (Stage 8, 2026-08-17)
// ============================================================
// Permintaan user: "tambahkan musuh baru. mobil pickup yang akan menurunkan
// barrel. mobil pickup ini akan menurunkan barrel di lajur mobil player berada.
// jadi player harus menghindarinya ke kiri atau ke kanan. mobil pickup ini akan
// selalu muncul dari depan. barel yang diturunkan ini memiliki HP 150. mobil
// pickupnya sendiri memiliki HP 230. munculkan 1 setiap setelah 5 mobil pickup
// robot yang muncul."
//
// Ini musuh yang BERBEDA JENIS dari Raven-K pengangkut robot: ia tidak membawa
// penembak, tidak mengejar, dan tidak ikut hitungan `groundPickupTarget`. Ia
// sebuah RINTANGAN — satu-satunya musuh Stage 8 yang menyerang lewat POSISI
// player, bukan lewat tembakan, sehingga A/D akhirnya punya tekanan sendiri.
//
// LIMA ATURAN YANG MENENTUKAN BENTUKNYA:
//
// 1. SELALU DARI DEPAN. Ia lahir di luar tapak pandang pada ujung DEPAN road
//    pool (`groundViewExtents` + margin, aturan yang sama dengan carrier), lalu
//    mundur pelan ke `leadOffset` di depan player dan MENAHAN posisi. Ia harus
//    di depan: barel yang dijatuhkan langsung diam di aspal, jadi ia menyapu
//    MUNDUR ke arah player tepat pada laju tanah.
//
// 2. TRUKNYA MENGEJAR LAJUR PLAYER, LALU MENJATUHKAN BAREL DARI POSISINYA
//    SENDIRI. Ini bukan detail kosmetik: kalau truk menahan lajur kelahirannya
//    sementara barelnya muncul di lajur player, barel itu terlihat lahir di
//    samping truk, dari udara kosong. Jadi `t.lane` mengikuti lajur player tiap
//    frame, z-nya meluncur ke sana, dan barel baru boleh lepas ketika truk
//    BENAR-BENAR sudah sejajar (`ALIGN_TOL`) — pergeseran truk ke lajur anda
//    itulah telegraph sesungguhnya, jauh sebelum pintu belakangnya membuka.
//    Titik jatuhnya tetap DISNAP ke pusat lajur, bukan ke z mentah player:
//    barel yang mendarat di antara dua lajur tidak dapat dihindari ke mana pun.
//    Waktu reaksi = `leadOffset / roadSpeed` (150 / 92 ≈ 1,6 dtk) melawan
//    `laneChangeSec` 0,32 dtk. Waktu reaksi itu MILIK TIAP BAREL dan sama sekali
//    tak bergantung pada `dropGapSec`, jadi menaikkan `dropCount` dan
//    memendekkan `dropGapSec` (2026-08-18, permintaan user "barrel yang
//    dijatuhkannya lebih banyak dengan interval waktu yang lebih singkat")
//    menambah KEPADATAN, bukan membuatnya mustahil dihindari — beberapa barel
//    kini melayang bersamaan di lajur yang berbeda-beda. Yang WAJIB ikut
//    mengecil hanya `dropTelegraphSec`: pintu belakangnya harus sempat MENUTUP
//    di antara dua barel, kalau tidak ia menganga terus dan berhenti terbaca
//    sebagai aba-aba.
//
// 2b. SATU SIKLUS PINTU PER BAREL (2026-08-18, permintaan user "buat agar pintu
//    belakang mobil itu terbuka kemudian barel menggelinding jatuh kemudian
//    pintu tertutup"): pintu MEMBUKA sebagai aba-aba, MENAHAN bukaannya selama
//    barel meluncur turun dari bibirnya ke aspal, baru MENUTUP. Barelnya lahir
//    tepat di `dropAnchor` — bibir pintu itu sendiri — setengah berdiri, lalu
//    merebah persis saat menyentuh jalan. Versi pertama menaruhnya langsung di
//    aspal sementara pintunya terbanting tertutup pada frame yang sama, jadi
//    tidak pernah ada barel yang terlihat KELUAR dari pintu itu. Konsekuensinya:
//    `dropTelegraphSec + dropFallSec + dropCloseSec` WAJIB muat di dalam
//    `dropGapSec`, kalau tidak siklusnya terpotong barel berikutnya.
//
// 3. BAREL YANG DIJATUHKAN ADALAH BAREL SUNGGUHAN. Ia masuk ke array `barrels`
//    bersama (entities/barrels.js), jadi ia mewarisi seluruh perilaku yang sudah
//    teruji: sweep peluru anti-tunnel `barrelBulletHits()`, ledakan lewat
//    `detonateBarrel` (antrean `queueBoom` = tak ada splice reentrant), rambatan
//    ke barel lain, damage player/robot, serpihan dan debu. Yang khusus Stage 8
//    hanya HP-nya (`barrelHp` 150, bukan `CFG.barrels.hp`) dan geraknya.
//    MESH-nya tetap dari POOL PREALOKASI — Stage 8 tak pernah melahirkan mesh
//    saat bermain.
//
// 4. MENABRAK HANYA KALAU LAJURNYA SAMA. Barel meledak saat melewati x player
//    DAN masih dalam setengah lebar lajur + radius barel. Kalau player sudah
//    pindah, barel LEWAT BEGITU SAJA tanpa meledak — kalau ia tetap meledak,
//    radius blast 6 m (42 unit) akan tetap menghantam lajur sebelah dan
//    manuver menghindarnya jadi sia-sia.
//
// 5. NOL POINTLIGHT, PAL-only, dan bangkainya ikut jalan (drift laju tanah)
//    seperti seluruh sisa tempur Stage 8 yang lain.

import { CFG } from '../../../../core/config.js';
import { scene } from '../../../../core/renderer.js';
import { bullets, stats } from '../../../../core/state.js';
import { segPointDist2, clamp } from '../../../../utils/math.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import {
    barrels, buildBarrelMesh, detonateBarrel, BARREL_RADIUS, BARREL_HEIGHT,
} from '../../../../entities/barrels.js';
import { explodeAt, spawnGroundPuff } from '../../../../entities/effects.js';
import { spawnGibs } from '../../../../entities/gore.js';
import { shatterVehicle, restoreVehicle, vehicleWreckDebug } from '../../../../entities/vehicleWreck.js';
import { sfxTankExplode } from '../../../../utils/sfx.js';

// Sedikit lebih panjang dan lebih tinggi dari Raven-K (bak barel bertingkat),
// tetapi tetap di dalam satu lajur 2,5 m seperti seluruh kendaraan Stage 8.
export const BARREL_DROPPER_DIMENSIONS = Object.freeze({
    length: 5.90, width: 2.35, height: 2.60,
});
const AUTHORED = Object.freeze({ length: 6.60, width: 2.72, height: 3.02 });
const RATIO = Object.freeze({
    x: BARREL_DROPPER_DIMENSIONS.length / AUTHORED.length,
    y: BARREL_DROPPER_DIMENSIONS.height / AUTHORED.height,
    z: BARREL_DROPPER_DIMENSIONS.width / AUTHORED.width,
});

function mk(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

// KAPASITAS BAK. Muatan yang tampak adalah sisa muatan sungguhan, jadi jumlah
// drumnya mengikuti `dropCount` — tetapi baknya benda fisik: hanya muat 3
// memanjang x 2 melintang. Menumpuknya ke atas bukan pilihan (gantry pengait ada
// di y 3,50), jadi ini plafon kerasnya, dan `dropCount` di atas angka ini tetap
// sah — truknya sekadar terlihat kosong lebih awal.
const CARGO_ROWS = 3;
export const BARREL_DROPPER_CARGO_MAX = CARGO_ROWS * 2;
function cargoCount() { return CFG.campaign.stage8.barrelDropper.dropCount || 3; }

// Truk bak barel: kabin lapis baja rendah, bak bertingkat berisi barel muatan,
// gantry pengait di atasnya, dan PINTU BELAKANG YANG BENAR-BENAR MEMBUKA — itulah
// telegraph-nya, bukan sekadar strip menyala.
export function buildBarrelDropperMesh(scale = 7) {
    const group = new THREE.Group(); group.name = 'NUSA-Vulture-B';
    const M = {
        armor: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        rubber: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        stripe: new THREE.MeshLambertMaterial({ color: PAL.white }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true,
            opacity: 0.78, emissive: PAL.techDim, emissiveIntensity: 0.08 }),
        warn: new THREE.MeshLambertMaterial({ color: PAL.amberDim, emissive: PAL.amber,
            emissiveIntensity: 0 }),
        drum: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        drumTop: new THREE.MeshLambertMaterial({ color: PAL.amberDim }),
    };

    // --- Sasis + kabin (menghadap +x, arah perjalanan, sama dgn Raven-K).
    mk(group, new THREE.BoxGeometry(6.60, 0.52, 2.30), M.dark, 0, 0.70, 0);
    mk(group, new THREE.BoxGeometry(6.10, 0.66, 2.12), M.armor, -0.10, 1.12, 0);
    mk(group, new THREE.BoxGeometry(1.70, 0.90, 2.06), M.armor, 2.28, 1.72, 0, 0, 0, -0.14);
    mk(group, new THREE.BoxGeometry(0.96, 0.07, 1.72), M.glass, 1.46, 2.22, 0, 0, 0, -0.66);
    mk(group, new THREE.BoxGeometry(1.86, 0.86, 2.00), M.armor, 0.92, 1.94, 0);
    mk(group, new THREE.BoxGeometry(0.30, 0.30, 2.20), M.hazard, 3.16, 1.30, 0);   // bemper
    for (const s of [-1, 1])
        mk(group, new THREE.BoxGeometry(0.22, 0.22, 0.22), M.stripe, 3.18, 1.72, s * 0.82);

    // --- Bak barel: lantai, dinding samping berusuk, dan gantry pengait.
    const bedX = -1.55;
    mk(group, new THREE.BoxGeometry(3.30, 0.16, 2.00), M.steel, bedX, 1.52, 0);
    for (const s of [-1, 1]) {
        mk(group, new THREE.BoxGeometry(3.30, 0.94, 0.12), M.armor, bedX, 2.00, s * 0.98);
        for (let k = 0; k < 4; k++)
            mk(group, new THREE.BoxGeometry(0.14, 0.94, 0.20), M.steel,
                bedX - 1.35 + k * 0.90, 2.00, s * 1.04);
    }
    mk(group, new THREE.BoxGeometry(0.16, 0.90, 2.06), M.armor, bedX + 1.68, 2.00, 0);
    for (const s of [-1, 1]) {
        mk(group, new THREE.BoxGeometry(0.14, 1.10, 0.14), M.steel, bedX + 1.45, 2.98, s * 0.90);
        mk(group, new THREE.BoxGeometry(0.14, 1.10, 0.14), M.steel, bedX - 1.45, 2.98, s * 0.90);
    }
    mk(group, new THREE.BoxGeometry(3.10, 0.14, 0.16), M.steel, bedX, 3.50, -0.90);
    mk(group, new THREE.BoxGeometry(3.10, 0.14, 0.16), M.steel, bedX, 3.50, 0.90);
    mk(group, new THREE.BoxGeometry(0.16, 0.14, 1.94), M.steel, bedX, 3.50, 0);

    // --- Muatan: drum yang IKUT HABIS saat dijatuhkan (visible di-toggle), jadi
    //     jumlah drum yang terlihat SELALU sama dengan sisa muatan — itulah
    //     alasan truknya layak ditembak lebih awal. Karena itu jumlahnya
    //     DITURUNKAN DARI `dropCount`, bukan dipatok tiga (2026-08-18,
    //     permintaan user "barrel yang dijatuhkannya lebih banyak"), dan
    //     dibatasi kapasitas fisik baknya: 3 memanjang x 2 melintang. Baknya
    //     3,30 x 2,00 dan drumnya berjari-jari 0,42, jadi dua lajur di z ±0,48
    //     masih bersih dari dinding dalam (0,92).
    const want = clamp(Math.round(cargoCount()), 1, BARREL_DROPPER_CARGO_MAX);
    const cols = want > CARGO_ROWS ? 2 : 1;
    const cargo = [];
    // Dibangun DEPAN -> BELAKANG supaya yang lenyap lebih dulu (indeks terakhir)
    // adalah drum yang paling dekat dengan pintu belakang.
    for (let k = 0; k < CARGO_ROWS && cargo.length < want; k++)
        for (let c = 0; c < cols && cargo.length < want; c++) {
            const drum = new THREE.Group();
            drum.position.set(bedX + 1.05 - k * 1.02, 1.60, cols === 1 ? 0 : (c ? 0.48 : -0.48));
            mk(drum, new THREE.CylinderGeometry(0.42, 0.42, 1.24, 10), M.drum, 0, 0.62, 0);
            mk(drum, new THREE.CylinderGeometry(0.45, 0.45, 0.10, 10), M.hazard, 0, 0.86, 0);
            mk(drum, new THREE.CylinderGeometry(0.45, 0.45, 0.10, 10), M.hazard, 0, 0.38, 0);
            mk(drum, new THREE.CylinderGeometry(0.38, 0.38, 0.07, 10), M.drumTop, 0, 1.27, 0);
            group.add(drum); cargo.push(drum);
        }

    // --- PINTU BELAKANG: berengsel di tepi bawah bak, dibuka sebagai telegraph.
    const gate = new THREE.Group();
    gate.position.set(bedX - 1.72, 1.52, 0);
    mk(gate, new THREE.BoxGeometry(0.16, 1.06, 2.06), M.armor, 0, 0.53, 0);
    for (let k = 0; k < 3; k++)
        mk(gate, new THREE.BoxGeometry(0.20, 0.26, 0.60), M.hazard, 0.02, 0.30 + k * 0.32,
            -0.62 + k * 0.62);
    group.add(gate);
    // Strip peringatan di kedua sisi bak; menyala hanya saat pintu membuka.
    const warn = [];
    for (const s of [-1, 1])
        warn.push(mk(group, new THREE.BoxGeometry(2.60, 0.20, 0.10), M.warn,
            bedX, 2.42, s * 1.06));

    // --- Roda. POROSNYA DIPUTAR DI LEVEL GEOMETRI (2026-08-17, laporan user
    //     "ban mobilnya berputar dengan posisi poros yang salah"): silinder
    //     three bersumbu +Y, jadi `rotateX(PI/2)` pada GEOMETRI-nya membuat
    //     poros roda berbaring di sumbu z — arah yang benar untuk kendaraan yang
    //     melaju di sumbu x. Karena rotasi objeknya lalu tinggal nol,
    //     `rotation.z` bebas dipakai sebagai PUTARAN GELINDING. Versi pertama
    //     memutar grup roda pada `rotation.x`, yaitu pada sumbu ARAH JALAN, jadi
    //     bannya berputar seperti koin yang diputar di tepinya. Ini pola yang
    //     sama persis dengan Raven-K dan GRD LTV-45.
    const wheels = [];
    const tyreGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.40, 12);
    tyreGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.44, 8);
    hubGeo.rotateX(Math.PI / 2);
    for (const wx of [2.10, -0.30, -2.05]) for (const s of [-1, 1]) {
        wheels.push(mk(group, tyreGeo, M.rubber, wx, 0.62, s * 1.06));
        mk(group, hubGeo, M.steel, wx, 0.62, s * 1.06);
    }

    const sx = RATIO.x * scale, sy = RATIO.y * scale;
    group.scale.set(sx, sy, RATIO.z * scale);
    return {
        group, cargo, gate, warn, wheels, mats: M,
        // BIBIR PINTU BELAKANG dalam satuan DUNIA, relatif terhadap titik truk.
        // Barel yang dijatuhkan lahir persis di sini (2026-08-18, permintaan user
        // "buat agar pintu belakang mobil itu terbuka kemudian barel menggelinding
        // jatuh"), bukan di titik kira-kira: kalau tempat lahirnya tidak menempel
        // pada engsel yang baru saja membuka, animasinya berhenti terbaca sebagai
        // barel yang keluar DARI pintu itu.
        dropAnchor: { x: (bedX - 1.72) * sx, y: 1.52 * sy },
        dimensionsMeters: { ...BARREL_DROPPER_DIMENSIONS },
        dimensionsWorld: {
            length: BARREL_DROPPER_DIMENSIONS.length * scale,
            width: BARREL_DROPPER_DIMENSIONS.width * scale,
            height: BARREL_DROPPER_DIMENSIONS.height * scale,
        },
    };
}

// ===== RIG ==============================================================
// Seluruh mesh — truk maupun barel yang akan dijatuhkan — dibuat SEKALI di
// `createBarrelDropperRig` (aturan pool tetap Stage 8). Barel memakai
// `buildBarrelMesh()` bersama, jadi geometri/materialnya pun dipakai ulang dari
// entities/barrels.js dan tidak ada program shader baru yang bisa lahir.
export function createBarrelDropperRig(parent, scale = 7, trucks = 2, barrelSlots = 8) {
    // Semuanya diparenting ke ROOT DUNIA STAGE, bukan `scene`: seluruh dunia
    // campaign hidup berdampingan, dan hanya root stage aktif yang terlihat.
    const host = parent || scene;
    const rig = { trucks: [], barrels: [], scale, host };
    for (let i = 0; i < trucks; i++) {
        const parts = buildBarrelDropperMesh(scale);
        parts.group.visible = false; host.add(parts.group);
        rig.trucks.push({
            parts, active: false, hp: 0, maxHp: 0, phase: 'idle', t: 0,
            x: 0, z: 0, lane: 0, entryX: 0, entryViewEdgeX: 0, targetX: 0,
            dropped: 0, dropT: 0, gate: 0, hitT: 0, wreck: false, wreckT: 0,
            wheelPhase: 0,
            // Sisa waktu pintu WAJIB tetap menganga (barel sedang keluar), lalu
            // sisa waktu penutupannya. Lihat `updateBarrelDroppers`.
            gateHold: 0, gateShut: 0,
        });
    }
    for (let i = 0; i < barrelSlots; i++) {
        // TONG BERBARING MELINTANG JALAN (2026-08-17, laporan user "barrel
        // menggelinding dengan posisi poros yang salah"). `buildBarrelMesh()`
        // berdiri tegak dengan alas di y=0 dan sumbunya +Y; versi pertama
        // memutarnya pada `rotation.z` sehingga tong TEGAK itu terguling ke
        // samping, bukan menggelinding. Sekarang tiap tong dibungkus PIVOT:
        //   * anaknya digeser -BH/2 supaya PUSAT tong tepat di titik pivot,
        //   * `pivot.rotation.x = PI/2` merebahkannya — sumbu tong (+Y lokal)
        //     jatuh ke sumbu z dunia, yaitu MELINTANG jalan,
        //   * `pivot.rotation.y` lalu menjadi putaran mengelilingi sumbu tong
        //     itu sendiri (Euler XYZ: sumbunya = Rx*(0,1,0) = +z dunia).
        // Itulah gelinding yang benar untuk benda yang bergerak di sumbu x.
        const barrel = buildBarrelMesh();
        barrel.position.y = -BARREL_HEIGHT / 2;
        const pivot = new THREE.Group();
        pivot.add(barrel);
        pivot.rotation.set(Math.PI / 2, 0, 0);
        pivot.visible = false;
        rig.barrels.push({
            mesh: pivot, entry: null, inScene: false, lane: 0,
            // Sisa waktu JATUH dari bibir pintu ke aspal; 0 = sudah mendarat.
            fall: 0, fallDur: 0, fromY: 0,
        });
    }
    return rig;
}

// Toleransi "sudah sejajar" untuk melepas barel: cukup longgar agar truk tetap
// bisa menjatuhkan muatannya saat player menggeser-geser lajur, cukup ketat agar
// barelnya selalu terlihat keluar dari bak truk itu sendiri.
const ALIGN_TOL = 0.6;
// Kemiringan tong saat baru lepas dari bibir pintu: ia menggelinding TURUN dari
// bak, jadi ia mulai setengah berdiri lalu MEREBAH tepat saat menyentuh aspal.
// Dikerjakan pada `rotation.x` (sumbu rebahnya sendiri), bukan `rotation.z`,
// supaya tong tak pernah terlihat terguling ke samping.
const DROP_TIP = 0.8;
// Satu pantulan kecil setelah mendarat, sebagai pecahan dari radius tong.
const DROP_BOUNCE = 0.3, BOUNCE_AT = 0.78;
function dropFallSec() { return CFG.campaign.stage8.barrelDropper.dropFallSec || 0.34; }
function dropCloseSec() { return CFG.campaign.stage8.barrelDropper.dropCloseSec || 0.3; }

function freeTruck(rig) { return rig.trucks.find(t => !t.active); }
function freeBarrel(rig) { return rig.barrels.find(b => !b.entry); }

function setGate(t, k) {
    t.gate = clamp(k, 0, 1);
    // Pintu berengsel di tepi bawah: membuka = jatuh ke belakang-bawah.
    t.parts.gate.rotation.z = -t.gate * 1.45;
    const lit = EMISSIVE_MAX * 0.8 * t.gate;
    for (const w of t.parts.warn) w.material.emissiveIntensity = lit;
}

// Satu siklus pintu belakang. `telegraph` = bukaan yang diminta fase truk
// (aba-aba menjelang barel berikutnya); tahap MENAHAN dan MENUTUP selalu
// mendahuluinya, supaya penutupan setelah sebuah barel tak pernah terpotong.
function runGate(t, dt, telegraph) {
    if (t.gateHold > 0) { t.gateHold = Math.max(0, t.gateHold - dt); setGate(t, 1); return; }
    if (t.gateShut > 0) {
        t.gateShut = Math.max(0, t.gateShut - dt);
        setGate(t, t.gateShut / Math.max(0.01, dropCloseSec())); return;
    }
    setGate(t, telegraph);
}

function showCargo(t) {
    const left = t.parts.cargo.length - t.dropped;
    for (let i = 0; i < t.parts.cargo.length; i++)
        t.parts.cargo[i].visible = !t.wreck && i < left;
}

export function resetBarrelDroppers(rig) {
    if (!rig) return;
    for (const t of rig.trucks) {
        t.active = false; t.phase = 'idle'; t.t = 0; t.hp = 0; t.dropped = 0;
        t.dropT = 0; t.hitT = 0; t.wreck = false; t.wreckT = 0;
        t.gateHold = 0; t.gateShut = 0;
        restoreVehicle(t.parts);
        t.parts.group.visible = false;
        for (const m of t.parts.cargo) m.visible = true;
        t.wheelPhase = 0;
        for (const w of t.parts.wheels) w.rotation.z = 0;
        t.parts.group.rotation.set(0, 0, 0);
        setGate(t, 0);
    }
    for (const b of rig.barrels) releaseBarrel(rig, b);
}

// Lepaskan slot barel: keluarkan entry dari array `barrels` bersama (kalau masih
// ada di sana) dan kembalikan mesh-nya ke pool tanpa di-dispose. Mesh dilepas
// dari INDUKNYA SENDIRI, bukan dari `scene` — `detonateBarrel` memanggil
// `scene.remove(mesh)` yang tidak berpengaruh pada mesh milik root stage, jadi
// pembersihannya harus dilakukan di sini.
function releaseBarrel(rig, slot) {
    if (slot.entry) {
        const i = barrels.indexOf(slot.entry);
        if (i >= 0) barrels.splice(i, 1);
    }
    slot.entry = null; slot.fall = 0; slot.fallDur = 0;
    if (slot.mesh.parent) slot.mesh.parent.remove(slot.mesh);
    slot.inScene = false; slot.mesh.visible = false;
}

export function activeBarrelDroppers(rig) {
    return rig ? rig.trucks.filter(t => t.active && !t.wreck).length : 0;
}
export function activeDroppedBarrels(rig) {
    return rig ? rig.barrels.filter(b => b.entry).length : 0;
}

// ===== SPAWN ============================================================
// SELALU dari ujung DEPAN dan selalu di luar tapak pandang: `viewMaxX` datang
// dari `groundViewExtents` milik stage, sama seperti carrier Raven-K.
export function spawnBarrelDropper(rig, ctx) {
    const C = CFG.campaign.stage8.barrelDropper;
    if (!rig || activeBarrelDroppers(rig) >= (C.maxActive || 1)) return null;
    const t = freeTruck(rig); if (!t) return null;
    t.active = true; t.wreck = false; t.wreckT = 0; t.phase = 'approach'; t.t = 0;
    t.hp = t.maxHp = C.hp; t.dropped = 0; t.dropT = C.armSec; t.hitT = 0;
    t.lane = ctx.laneIndex;
    t.entryViewEdgeX = ctx.playerX + ctx.viewMaxX;
    t.entryX = Math.max(ctx.playerX + ctx.roadEdge,
        t.entryViewEdgeX + (ctx.offscreenMargin || 0));
    t.targetX = ctx.playerX + C.leadOffset;
    t.x = t.entryX; t.z = ctx.laneZ(ctx.laneIndex);
    t.parts.group.position.set(t.x, 0, t.z);
    t.parts.group.rotation.set(0, 0, 0);
    t.parts.group.visible = true;
    setGate(t, 0); showCargo(t);
    return t;
}

// ===== BAREL ============================================================
// Barel yang dijatuhkan MASUK ke array `barrels` bersama, jadi seluruh sistem
// yang sudah ada (sweep peluru, ledakan, rambatan, damage) langsung berlaku.
function dropBarrel(rig, t, ctx) {
    const C = CFG.campaign.stage8.barrelDropper;
    const slot = freeBarrel(rig); if (!slot) return false;
    // LAHIR DI BIBIR PINTU BELAKANG yang barusan membuka, bukan di titik
    // kira-kira di belakang truk (2026-08-18, permintaan user).
    const bedX = t.x + t.parts.dropAnchor.x;
    const bedY = Math.max(BARREL_RADIUS, t.parts.dropAnchor.y);
    // Lajur TRUK — yang sudah mengejar lajur player dan sejajar dengannya
    // (aturan 2) — lalu disnap ke pusat lajur itu.
    const lane = t.lane, z = ctx.laneZ(lane);
    slot.lane = lane;
    // Masih SETENGAH BERDIRI di atas bibir pintu; ia merebah saat mendarat.
    slot.fallDur = Math.max(0.01, dropFallSec());
    slot.fall = slot.fallDur; slot.fromY = bedY;
    slot.mesh.position.set(bedX, bedY, z);
    slot.mesh.rotation.set(Math.PI / 2 - DROP_TIP, 0, 0);
    slot.mesh.visible = true;
    if (!slot.inScene) { rig.host.add(slot.mesh); slot.inScene = true; }
    // `y` = titik pusat ledakan; ia ikut turun bersama tongnya.
    slot.entry = { mesh: slot.mesh, x: bedX, z, y: bedY, groundY: 0, hp: C.barrelHp };
    barrels.push(slot.entry);
    spawnGroundPuff(bedX, z, 0x8a7a5a, 5, 1.2);
    t.dropped++; showCargo(t);
    return true;
}

// ===== UPDATE ===========================================================
// ctx: { dt, playerX, playerZ, laneIndex, laneZ, roadSpeed, viewMaxX, roadEdge,
//        offscreenMargin, dropping, canHit, onKill }
export function updateBarrelDroppers(rig, ctx) {
    if (!rig) return;
    const C = CFG.campaign.stage8.barrelDropper;
    const dt = ctx.dt, ground = ctx.roadSpeed * dt;

    // --- Barel: DIAM DI ASPAL, jadi ia menyapu mundur tepat pada laju tanah.
    for (const slot of rig.barrels) {
        const e = slot.entry; if (!e) continue;
        // `detonateBarrel` (ditembak player / rambatan) sudah mengeluarkannya
        // dari `barrels`; slotnya tinggal dibebaskan.
        if (barrels.indexOf(e) < 0) { releaseBarrel(rig, slot); continue; }
        const prevX = e.x;
        // JATUH DARI BIBIR PINTU (2026-08-18, permintaan user "barel
        // menggelinding jatuh"). Selama masih di udara ia belum ikut aspal
        // sepenuhnya: ia baru saja lepas dari truk yang menahan posisi, jadi
        // laju mundurnya MERAMBAT NAIK ke laju tanah — kalau ia langsung
        // disapu penuh, ia terlihat disentak ke belakang begitu muncul.
        if (slot.fall > 0) {
            slot.fall = Math.max(0, slot.fall - dt);
            const u = 1 - slot.fall / slot.fallDur;          // 0 -> 1
            e.x -= ground * (0.3 + 0.7 * u);
            if (u < BOUNCE_AT) {
                // Gravitasi: mulai pelan lalu makin cepat (kuadratik).
                const k = u / BOUNCE_AT;
                e.mesh.position.y = slot.fromY + (BARREL_RADIUS - slot.fromY) * k * k;
                // Merebah tepat saat menyentuh aspal.
                e.mesh.rotation.x = Math.PI / 2 - DROP_TIP * (1 - k);
            } else {
                // Satu pantulan kecil, lalu benar-benar diam di aspal.
                const b = (u - BOUNCE_AT) / (1 - BOUNCE_AT);
                e.mesh.position.y = BARREL_RADIUS
                    + BARREL_RADIUS * DROP_BOUNCE * 4 * b * (1 - b);
                e.mesh.rotation.x = Math.PI / 2;
            }
            if (slot.fall <= 0) { e.mesh.position.y = BARREL_RADIUS; e.mesh.rotation.x = Math.PI / 2; }
            e.y = e.mesh.position.y;
        } else e.x -= ground;
        e.mesh.position.x = e.x;
        // MENGGELINDING mengelilingi sumbu tong itu sendiri. Pivot sudah
        // direbahkan pada x (PI/2), jadi `rotation.y` berputar di sumbu z dunia
        // — poros yang benar untuk benda yang bergerak sepanjang x. Tandanya
        // positif karena tong bergerak ke -x: v = w*z_hat x R*y_hat = -w*R*x_hat.
        // Diambil dari PERPINDAHAN NYATA, bukan dari `ground`, supaya gelinding
        // tanpa slip tetap berlaku saat ia masih melambat di udara.
        e.mesh.rotation.y += (prevX - e.x) / Math.max(1, BARREL_RADIUS);
        // TABRAKAN: hanya kalau lajurnya benar-benar sama (aturan 4).
        const hitZ = CFG.campaign.stage8.laneWidth * 0.5 + BARREL_RADIUS;
        if (ctx.canHit && prevX >= ctx.playerX && e.x < ctx.playerX
            && Math.abs(e.z - ctx.playerZ) < hitZ) {
            detonateBarrel(e); releaseBarrel(rig, slot); continue;
        }
        if (e.x < ctx.playerX - 320) releaseBarrel(rig, slot);
    }

    // --- Truk.
    for (const t of rig.trucks) {
        if (!t.active) continue;
        if (t.hitT > 0) t.hitT = Math.max(0, t.hitT - dt * 3);
        if (t.wreck) {
            // Bangkai mengerem lalu DIAM di aspal, sama seperti carrier Raven-K.
            t.x -= ctx.roadSpeed * dt * Math.max(1, 1.35 - t.wreckT * 0.7);
            t.wreckT += dt;
            t.parts.group.position.x = t.x;
            t.parts.group.rotation.z = Math.min(0.34, t.parts.group.rotation.z + dt * 0.5);
            if (t.wreckT >= (C.wreckSec || 3.5) || t.x < ctx.playerX - 320) {
                t.active = false; t.parts.group.visible = false;
                // Rig ini dipakai ulang oleh pengangkut berikutnya: pulihkan
                // seluruh keping dan catnya PERSIS, bukan mendekati.
                restoreVehicle(t.parts);
                t.parts.group.rotation.set(0, 0, 0);
            }
            continue;
        }
        t.t += dt;
        if (t.phase === 'approach') {
            t.x += (t.targetX - t.x) * Math.min(1, dt * (C.approachRate || 1.1));
            if (Math.abs(t.x - t.targetX) < 6) t.phase = 'drop';
        } else if (t.phase === 'drop') {
            t.x += (t.targetX - t.x) * Math.min(1, dt * (C.approachRate || 1.1));
            const tele = C.dropTelegraphSec || 0.7;
            t.dropT -= ctx.dropping ? dt : 0;
            // SATU SIKLUS PINTU PER BAREL (2026-08-18, permintaan user "pintu
            // belakang mobil itu terbuka kemudian barel menggelinding jatuh
            // kemudian pintu tertutup"). Tiga tahap yang saling mendahului,
            // diprioritaskan dari yang paling akhir supaya penutupannya tidak
            // langsung ditimpa oleh telegraph barel berikutnya:
            //   1. gateHold — barel sedang menggelinding turun, pintu MENGANGA,
            //   2. gateShut — pintu menutup mulus setelah barel mendarat,
            //   3. telegraph — pintu membuka lagi menjelang barel berikutnya.
            // Dulu tahap 1-2 tidak ada: pintu terbanting tertutup pada frame yang
            // sama dengan lahirnya barel, jadi tak pernah ada barel yang terlihat
            // KELUAR dari pintu itu.
            runGate(t, dt, t.dropT < tele ? 1 - Math.max(0, t.dropT) / tele : 0);
            // Barel baru lepas ketika truk benar-benar SEJAJAR dengan lajur yang
            // sedang dikejarnya; kalau belum, hitungannya menggantung di <= 0 dan
            // barel jatuh tepat pada frame ia sampai (aturan 2).
            const aligned = Math.abs(t.z - ctx.laneZ(t.lane))
                < CFG.campaign.stage8.laneWidth * ALIGN_TOL;
            if (t.dropT <= 0 && aligned && t.gateHold <= 0 && t.gateShut <= 0) {
                dropBarrel(rig, t, ctx);
                t.dropT = C.dropGapSec;
                // Pintu menahan bukaannya selama barel masih meluncur turun,
                // baru kemudian menutup.
                t.gateHold = dropFallSec(); t.gateShut = dropCloseSec();
                setGate(t, 1);
                if (t.dropped >= (C.dropCount || 3)) { t.phase = 'depart'; }
            }
        } else if (t.phase === 'depart') {
            // Muatan terakhir tetap mendapat siklus pintunya sampai selesai —
            // ia tidak boleh terputus hanya karena truknya mulai memacu.
            runGate(t, dt, 0);
            // Habis muatan: memacu ke depan dan keluar layar. Ia bukan bagian
            // dari gerbang `groundPickupTarget`, jadi tak wajib dihancurkan.
            t.x += (C.departSpeed || 130) * dt;
            if (t.x > ctx.playerX + ctx.viewMaxX + 120) {
                t.active = false; t.parts.group.visible = false;
            }
        }
        // Selama masih bermuatan ia MENGEJAR lajur player; sesudah muatannya
        // habis ia tinggal melaju lurus keluar layar.
        if (t.phase !== 'depart') t.lane = ctx.laneIndex;
        t.z += (ctx.laneZ(t.lane) - t.z) * Math.min(1, dt * 3.2);
        t.parts.group.position.set(t.x, 0, t.z);
        // Truk menahan posisi terhadap player, tetapi FISIKNYA melaju selaju
        // jalan — itulah laju yang harus terbaca di bannya.
        t.wheelPhase += dt * ctx.roadSpeed * 0.13;
        for (const w of t.parts.wheels) w.rotation.z = -t.wheelPhase;
    }
}

// ===== PELURU PLAYER -> TRUK ============================================
// Sweep segmen prev->kini seperti bos gunship: sebutir peluru rifle menempuh
// puluhan unit per frame, jadi tes titik per-frame akan menembusnya.
// Barelnya TIDAK diperiksa di sini — ia sudah ikut `barrelBulletHits()` bersama.
export function barrelDropperBulletHits(rig, onKill) {
    if (!rig) return;
    const C = CFG.campaign.stage8.barrelDropper;
    const live = rig.trucks.filter(t => t.active && !t.wreck);
    if (!live.length) return;
    const r2 = (C.hitRadius || 16) ** 2;
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi], bx = b.mesh.position.x, bz = b.mesh.position.z;
        for (const t of live) {
            if (t.wreck) continue;
            if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, t.x, 0, t.z) >= r2) continue;
            const dmg = b.damage != null ? b.damage : CFG.weapons.bulletDamage;
            stats.hits++; damageBarrelDropper(rig, t, dmg, onKill);
            if (b.explosive)
                explodeAt(new THREE.Vector3(bx, b.mesh.position.y, bz), b.explodeR, 1, b.boomSfx);
            scene.remove(b.mesh); bullets.splice(bi, 1);
            break;
        }
    }
}

export function damageBarrelDropper(rig, t, dmg, onKill) {
    if (!t || !t.active || t.wreck) return false;
    t.hp -= Math.max(1, dmg); t.hitT = 1;
    if (t.hp <= 0) killBarrelDropper(rig, t, onKill);
    return true;
}

function killBarrelDropper(rig, t, onKill) {
    t.hp = 0; t.wreck = true; t.wreckT = 0; t.phase = 'wreck';
    setGate(t, 0); showCargo(t);
    // Muatan yang tersisa ikut meledak — itulah alasan truknya layak ditembak
    // lebih awal daripada dibiarkan menjatuhkan seluruh barelnya.
    explodeAt(new THREE.Vector3(t.x, 8, t.z), 0.1, 0, sfxTankExplode);
    // Nada genangan HITAM, bukan default hijau: hanya robot yang punya coolant
    // hijau (aturan user 2026-07-18), dan ini truk.
    spawnGibs(t.x, 8, t.z, 14, -1, 0, 2.0, PAL.gunmetal, 0.4, 0x141210);
    spawnGibs(t.x, 5, t.z, 8, 1, 0.4, 1.5, PAL.steel, 0.4, 0x141210);
    // HANCUR BERKEPING-KEPING (2026-08-18, permintaan user "mobil yang dikendarai
    // musuh juga hancur berkeping-keping") — sistem bangkai bersama, sama dengan
    // GRD LTV-45 dan carrier Raven-K. Yang khas truk ini: pintu belakang, muatan
    // drum yang tersisa dan rodanya benar-benar terlepas. Kemiringan sasis
    // diserahkan ke `updateBarrelDroppers`, yang sudah memiringkannya frame demi
    // frame sepanjang bangkainya mengerem.
    shatterVehicle(t.parts, {
        materials: t.parts.mats,
        loose: [t.parts.gate, ...t.parts.cargo, ...t.parts.wheels],
        tilt: { x: t.parts.group.rotation.x, z: t.parts.group.rotation.z }, sink: 0,
    });
    if (onKill) onKill(t);
}

export function clearBarrelDroppers(rig) {
    if (!rig) return;
    for (const t of rig.trucks) {
        t.active = false; t.wreck = false; t.parts.group.visible = false;
        // Truk yang dibersihkan SELAGI jadi bangkai (mis. intro gunship dimulai)
        // memakai rig yang sama untuk pengangkut berikutnya — tanpa ini ia lahir
        // kembali dalam keadaan gosong dan berkeping-keping.
        restoreVehicle(t.parts);
        t.parts.group.rotation.set(0, 0, 0);
        t.dropped = 0; showCargo(t); setGate(t, 0);
    }
    for (const b of rig.barrels) releaseBarrel(rig, b);
}

export function barrelDropperDebug(rig) {
    if (!rig) return null;
    const C = CFG.campaign.stage8.barrelDropper;
    return {
        pools: { trucks: rig.trucks.length, barrels: rig.barrels.length },
        active: activeBarrelDroppers(rig), barrelsOut: activeDroppedBarrels(rig),
        hp: C.hp, barrelHp: C.barrelHp, everyPickups: C.everyPickups,
        dropCount: C.dropCount, dropGapSec: C.dropGapSec,
        cargoMax: BARREL_DROPPER_CARGO_MAX,
        trucks: rig.trucks.map(t => ({
            active: t.active, phase: t.phase, hp: t.hp, maxHp: t.maxHp,
            x: t.x, z: t.z, lane: t.lane, entryX: t.entryX,
            entryViewEdgeX: t.entryViewEdgeX, targetX: t.targetX,
            dropped: t.dropped, dropT: t.dropT, gate: t.gate, wreck: t.wreck,
            gateHold: t.gateHold, gateShut: t.gateShut,
            shattered: !!t.parts.shattered,
            shards: vehicleWreckDebug(t.parts).shards,
            poseSum: vehicleWreckDebug(t.parts).poseSum,
            partCount: vehicleWreckDebug(t.parts).parts,
            bodyHex: t.parts.mats.armor.color.getHex(),
            cargoVisible: t.parts.cargo.filter(m => m.visible).length,
            cargoSlots: t.parts.cargo.length,
            yaw: t.parts.group.rotation.y, wheelPhase: t.wheelPhase,
            wheelSpin: t.parts.wheels.length
                ? { x: t.parts.wheels[0].rotation.x, y: t.parts.wheels[0].rotation.y,
                    z: t.parts.wheels[0].rotation.z }
                : null,
            dimensionsMeters: { ...t.parts.dimensionsMeters },
        })),
        dropAnchor: rig.trucks[0]
            ? { ...rig.trucks[0].parts.dropAnchor } : null,
        dropped: rig.barrels.filter(b => b.entry).map(b => ({
            x: b.entry.x, z: b.entry.z, hp: b.entry.hp, lane: b.lane,
            y: b.mesh.position.y, airborne: b.fall > 0, fall: b.fall,
            spin: { x: b.mesh.rotation.x, y: b.mesh.rotation.y, z: b.mesh.rotation.z },
        })),
    };
}
