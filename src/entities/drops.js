// Item drop: amunisi PER-SENJATA / medkit / loot-uang. Drop acak dari robot mati
// + persediaan tetap (ditaruh manual oleh stage) + isi peti yang dipecah
// (crates.js). Pickup dgn aturan "full-item": item yang player-nya sudah penuh
// TIDAK dikonsumsi — ditinggal di lantai.
//
// AMUNISI PER-SENJATA (2026-07-26, permintaan user): dulu satu item 'mag'
// mengisi ammo SEMUA senjata sekaligus. Sekarang tiap drop amunisi membawa
// `d.weapon` ('pistol'|'shotgun'|'rifle'|'launcher') dan HANYA mengisi senjata
// itu; bentuk meshnya beda-beda per jenis (entities/ammoPickups.js).

import { CFG, CAMP_M } from '../core/config.js';
import { player, drops, maxAmmoFor, addScore } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { playSFX, sfxPickup } from '../utils/sfx.js';
import { showPickup } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { PAL } from '../world/palette.js';
import { buildAmmoMesh, AMMO_KINDS, AMMO_WEAPONS } from './ammoPickups.js';

// ----- Medkit (hanya ditaruh manual oleh stage, bukan drop robot) -----
// Material BERSAMA: Group tidak ditelusuri clearArray, jadi bahan bersama
// wajib dipakai agar tidak bocor saat reset. JANGAN dispose MEDKIT_MAT.
export const MEDKIT_MAT = {
    box: new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x2e2e2e }),
    // Palang merah DINYALAKAN 2026-08-28 (emissive 0x3d0f0f -> 0x8c1d1d): dari
    // kamera oblique palang yang gelap melebur dengan lantai; emissive membuatnya
    // terbaca (dan tertangkap bloom) tanpa lampu tambahan.
    cross: new THREE.MeshLambertMaterial({ color: 0xe24747, emissive: 0x8c1d1d })
};
// UKURAN MEDKIT LANTAI = UKURAN ASLINYA, DAN TIDAK BOLEH DIBESARKAN UNTUK SATU
// STAGE (2026-08-29, laporan user "item coin dan medkit di stage lain jadi ikut
// membesar, ini tidak normal"). Mesh ini DIPAKAI BERSAMA oleh seluruh stage dan
// Survival, jadi membesarkannya demi keterbacaan Stage 10 — yang kameranya 900
// unit di atas — ikut membesarkan item di dua belas stage lain yang kameranya
// jauh lebih dekat. Stage 10 memakai ENTITASNYA SENDIRI (`flightWorld.js`,
// `buildDropSlot` + `flight.dropVisualScale`); jangan pernah menyetel ukuran
// item satu stage dari sini. MEDKIT_MAT dipakai bersama prop medkit rig FPS
// (weapons.js) yang permanen tersembunyi.
export function buildMedkitMesh() {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 5), MEDKIT_MAT.box);
    base.position.y = 0;            // alas di y lokal -1,3 (0 - 2,6/2)
    grp.add(base);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 1.2), MEDKIT_MAT.cross);
    c1.position.y = 1.55;           // duduk di muka atas (1,3) + separuh tebal
    grp.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 3.6), MEDKIT_MAT.cross);
    c2.position.y = 1.55;
    grp.add(c2);
    return grp;
}

// ----- Amunisi PER-SENJATA: mesh & tabel jenis ada di entities/ammoPickups.js.
// Taruh satu paket amunisi senjata `w` di (x,z) (dipakai stage/peti/drop robot). -----
export function spawnAmmoDrop(x, z, w, lifetime) {
    const [px, pz, groundY = 0] = activeScene.clampDropPos(x, z);
    const mesh = buildAmmoMesh(w);
    mesh.position.set(px, groundY + 1, pz);
    scene.add(mesh);
    drops.push({
        mesh, type: 'ammo', weapon: w, groundY,
        timer: lifetime != null ? lifetime : CFG.drops.lifetimeSec
    });
}

// Taruh satu medkit di (x,z) (isi peti / persediaan stage).
export function spawnMedkitDrop(x, z, lifetime) {
    const [px, pz, groundY = 0] = activeScene.clampDropPos(x, z);
    const mesh = buildMedkitMesh();
    mesh.position.set(px, groundY + 1, pz);
    scene.add(mesh);
    drops.push({
        mesh, type: 'medkit', groundY,
        timer: lifetime != null ? lifetime : CFG.drops.lifetimeSec
    });
}

// ----- LOOT / uang (SECOND-IMPROVEMENT-PLAN point 1, 2026-07-22) -----
// Chip kredit amber yang JATUH dari robot mati (campaign), DIAM di tempat
// jatuhnya (magnet DIHAPUS 2026-07-27 atas permintaan user — player harus
// mendatangi uangnya sendiri), dan menambah SKOR = mata uang shop saat
// dilewati. Campaign kini TAK memberi skor
// saat kill (killRobot: hook activeScene.awardKill -> campaignAwardKill menaruh
// loot); player harus MELOOT untuk dapat uang belanja (ala Alien Shooter).
// Geo/material BERSAMA (JANGAN dispose). Amber = aksen manusia GIBS-2045.
// UKURAN CHIP UANG = UKURAN ASLINYA, dengan alasan yang sama seperti medkit di
// atas: mesh ini milik SEMUA stage (2026-08-29, laporan user). Chip BERDIRI
// tegak (rotation.x = PI/2 menaruh sumbu silinder pada +Z) dan berputar pada
// sumbu Y, jadi siluet vertikalnya = RADIUSNYA — karena itu tinggi melayangnya
// di bawah DITURUNKAN dari radius itu, bukan diketik terpisah.
const LOOT_COIN_R = 2.0;   // radius chip — ukuran asli, milik semua stage
const LOOT_GEO = {
    coin: new THREE.CylinderGeometry(LOOT_COIN_R, LOOT_COIN_R, 0.7, 8), // chip oktagonal
    core: new THREE.CylinderGeometry(1.15, 1.15, 0.9, 8),               // emboss tengah
};
const LOOT_MAT = {
    coin: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: PAL.amberDim, toneMapped: false }),
};
// Amplitudo bob chip, dipakai spawnLoot DAN updateDrops supaya tak lepas sinkron.
export const LOOT_BOB = 0.4;
// Tinggi melayangnya DITURUNKAN, bukan diketik: chip berdiri tegak sehingga
// siluet vertikalnya persis `LOOT_COIN_R`, jadi `radius + bob` adalah tinggi
// terendah yang membuat dasar chip tetap di atas lantai walau di titik terendah
// ayunannya. Mengubah radius chip otomatis membetulkan tinggi melayangnya.
export const LOOT_HOVER = LOOT_COIN_R + LOOT_BOB;

export function buildLootMesh() {
    const g = new THREE.Group();
    const coin = new THREE.Mesh(LOOT_GEO.coin, LOOT_MAT.coin);
    coin.rotation.x = Math.PI / 2;   // hadap kamera top-down (pipih di bidang xz)
    g.add(coin);
    const core = new THREE.Mesh(LOOT_GEO.core, LOOT_MAT.core);
    core.rotation.x = Math.PI / 2;
    g.add(core);
    return g;
}

// ===== "ITEM LOOTING" — SATU ISTILAH, SATU RADIUS (2026-08-13, permintaan user
// "jadikan 1 istilah item looting saja biar tidak membingungkan") =============
// Uang, amunisi DAN medkit semuanya adalah ITEM LOOTING. Dulu ada dua angka yang
// berbeda dan membingungkan (`lootPickupRadius` 9 unit utk uang, HARDCODE
// `player.radius + 2` = 7 unit utk amunisi/medkit) lalu sempat jadi dua kunci
// config; sekarang tinggal SATU kunci `CFG.drops.lootPickupMeters` yang berlaku
// untuk ketiganya. JANGAN memecahnya lagi per jenis item.
// Dinyatakan dalam METER seperti tunable berjarak lain (`playerAggroMeters`,
// `rangeMeters`, `blastRadiusMeters`) supaya angka di config langsung terbaca
// sebagai jarak dunia nyata.
export const lootPickupRadius = () => (CFG.drops.lootPickupMeters || 0) * CAMP_M;

// ===== ANIMASI TERBANG SAAT DILOOT (2026-08-13, permintaan user "berikan
// animasi item itu bergerak menuju player dan menghilang") ===================
// Begitu sebuah item DIKLAIM, mesh-nya tidak lagi lenyap seketika: ia melengkung
// naik sedikit lalu MENYENTAK masuk ke dada player sambil berputar makin cepat
// dan mengecil, baru menghilang.
//
// INI BUKAN MAGNET LAMA (dihapus 2026-07-27 atas permintaan user) — jangan
// pernah menyamakan keduanya, dan jangan menghapus animasi ini dengan alasan
// "magnetnya sudah dibuang". Magnet menyedot item dari radius BESAR SEBELUM
// diklaim sehingga player tak perlu mendatanginya: itu mengubah GAMEPLAY. Di
// sini klaim tetap terjadi PERSIS saat player masuk `lootPickupMeters`, seluruh
// efeknya (uang/amunisi/medkit, termasuk aturan full-item dan pesan feed)
// diterapkan pada frame itu juga, dan yang terbang cuma mesh yang sudah tidak
// punya arti gameplay. Item di luar radius tetap DIAM di tempat jatuhnya.
//
// NOL ALOKASI: yang dipinjam adalah mesh drop yang SUDAH ada di scene, jadi tak
// ada geometry/material baru = tak ada rekompilasi shader saat memungut.
export const LOOT_FLY_SEC = 0.26;    // amplitudo visual: di kode, tapi diekspor utk smoke
const LOOT_FLY_HOP = 6.5;            // lengkung naik di awal (bukan seret di tanah)
const LOOT_FLY_MIN = 0.12;           // skala saat lenyap ("masuk" ke badan player)
const LOOT_FLY_SPIN = 16;            // putaran tambahan sepanjang penerbangan
const lootFlights = [];              // [{mesh, t, x0, y0, z0, spin}]

function beginLootFlight(mesh) {
    lootFlights.push({ mesh, t: 0,
        x0: mesh.position.x, y0: mesh.position.y, z0: mesh.position.z,
        spin: mesh.rotation.y });
}

// Dipanggil dari `updateDrops` (tanpa call-site baru → urutan blok updateGame
// tak tersentuh). Sasarannya dibaca ULANG tiap frame supaya item benar-benar
// mengejar player yang sedang bergerak.
function updateLootFlights(dt) {
    for (let i = lootFlights.length - 1; i >= 0; i--) {
        const f = lootFlights[i];
        f.t += dt;
        const k = f.t / LOOT_FLY_SEC;
        if (k >= 1) { scene.remove(f.mesh); lootFlights.splice(i, 1); continue; }
        const e = k * k;                       // easeIn: pelan lalu MENYENTAK = terasa tersedot
        const tx = camera.position.x, tz = camera.position.z;
        const ty = camera.position.y * 0.55;   // setinggi dada, bukan mata
        f.mesh.position.set(
            f.x0 + (tx - f.x0) * e,
            f.y0 + (ty - f.y0) * e + Math.sin(k * Math.PI) * LOOT_FLY_HOP,
            f.z0 + (tz - f.z0) * e);
        f.mesh.rotation.y = f.spin + e * LOOT_FLY_SPIN;
        // Mengecil hanya di 45% terakhir: sepanjang perjalanan ia tetap terbaca.
        const shrink = Math.max(0, (k - 0.55) / 0.45);
        f.mesh.scale.setScalar(1 - (1 - LOOT_FLY_MIN) * shrink);
    }
}

// Dipanggil `resetGame` bersama pembersihan array entitas: tanpa ini sebuah mesh
// yang sedang terbang saat restart tertinggal selamanya di koordinat lama.
export function resetLootFlights() {
    for (const f of lootFlights) {
        f.mesh.scale.setScalar(1);
        scene.remove(f.mesh);
    }
    lootFlights.length = 0;
}

export const lootFlightDebug = () => ({
    count: lootFlights.length,
    items: lootFlights.map(f => ({
        t: +f.t.toFixed(4),
        x: +f.mesh.position.x.toFixed(3), y: +f.mesh.position.y.toFixed(3),
        z: +f.mesh.position.z.toFixed(3), scale: +f.mesh.scale.x.toFixed(3),
        inScene: scene.children.indexOf(f.mesh) !== -1,
    })),
});

// Taruh loot senilai `value` (dipecah `chips` keping) di (x,z) — dipakai
// campaignAwardKill (common.js). Keping tersebar sedikit di sekitar titik jatuh
// dan TETAP DI SANA sampai player melewatinya (lootPickupRadius()).
export function spawnLoot(x, z, value, chips = 1) {
    const [px, pz, groundY = 0] = activeScene.clampDropPos(x, z);
    const per = Math.max(1, Math.round(value / chips));
    for (let i = 0; i < chips; i++) {
        const mesh = buildLootMesh();
        const a = Math.random() * 6.283, r = chips > 1 ? 3 + Math.random() * 6 : 0;
        mesh.position.set(px + Math.cos(a) * r, groundY + LOOT_HOVER,
            pz + Math.sin(a) * r);
        scene.add(mesh);
        drops.push({ mesh, type: 'loot', value: per, groundY,
            timer: CFG.drops.lootLifetimeSec, spin: Math.random() * 6.283 });
    }
}

// Drop acak saat robot mati. Posisi dijepit oleh scene aktif (survival:
// ke dalam pagar; campaign: apa adanya) lewat hook clampDropPos.
// Jenis amunisinya diundi dari senjata yang DIMILIKI player saja — kalau tidak,
// drop untuk senjata yang belum dibeli jadi mubazir (2026-07-26).
export function spawnDrop(pos) {
    if (Math.random() >= CFG.drops.magChance) return;
    const owned = AMMO_WEAPONS.filter(w => player.owned[w]);
    const w = owned.length ? owned[Math.floor(Math.random() * owned.length)] : 'pistol';
    spawnAmmoDrop(pos.x, pos.z, w);
}

let fullInfoCd = 0;   // jeda pesan "already full" agar tidak spam tiap frame
let lootSndCd = 0;    // jeda suara ambil loot (banyak keping = jangan spam audio)

export function updateDrops(dt, T) {
    if (fullInfoCd > 0) fullInfoCd -= dt;
    if (lootSndCd > 0) lootSndCd -= dt;
    updateLootFlights(dt);   // item yang BARU diklaim sedang terbang ke player
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.timer -= dt;

        // LOOT (uang): berputar pipih DI TEMPAT -> ambil = +value ke SKOR (mata
        // uang shop campaign). Ditangani penuh di sini.
        // TANPA MAGNET (2026-07-27, permintaan user): dulu keping loot TERSEDOT
        // ke player begitu masuk radius lootMagnetMeters. Sekarang uang DIAM di
        // tempat jatuhnya — player harus mendatangi & MELEWATINYA sendiri
        // (lootMagnetMeters/lootMagnetSpeed dihapus dari config). Yang terbang
        // hanyalah mesh SESUDAH item diklaim (beginLootFlight) — murni visual.
        if (d.type === 'loot') {
            d.spin += 5 * dt; d.mesh.rotation.y = d.spin;
            const distL = Math.hypot(camera.position.x - d.mesh.position.x,
                camera.position.z - d.mesh.position.z);
            d.mesh.position.y = (d.groundY || 0) + LOOT_HOVER
                + Math.sin(T * 4 + i) * LOOT_BOB;
            if (distL < lootPickupRadius()) {
                addScore(d.value);
                if (lootSndCd <= 0) { lootSndCd = 0.12; playSFX(sfxPickup, 0.5); }
                // Uang memakai feed pickup yang sama dgn ammo/medkit agar
                // player langsung melihat nilai yang baru masuk ke MONEY.
                showPickup(`+${d.value} MONEY`, '#ffb03b');
                updateUI();
                beginLootFlight(d.mesh); drops.splice(i, 1);
                continue;
            }
            if (d.timer <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
            continue;
        }

        d.mesh.rotation.y += 3 * dt;
        d.mesh.position.y = (d.groundY || 0) + 1.2
            + Math.sin(T * 3 + i) * 0.3;   // bob (jalan di kedua mode)

        const dist = Math.hypot(d.mesh.position.x - camera.position.x, d.mesh.position.z - camera.position.z);
        if (dist < lootPickupRadius()) {
            // Item PENUH tidak diambil (ditinggal untuk nanti) — beri info
            // "already full" di feed, dgn jeda 1.2 dtk agar tidak spam saat
            // player berdiri di atas item. AMUNISI PER-SENJATA (2026-07-26):
            // drop 'ammo' membawa d.weapon dan HANYA mengisi senjata itu
            // (+CFG.weapons.<w>.ammoPickup, di-cap maxAmmoFor); amunisi untuk
            // senjata yang BELUM dimiliki ditinggal (tak terpakai).
            const kind = d.type === 'ammo' ? (AMMO_KINDS[d.weapon] || AMMO_KINDS.pistol) : null;
            const unowned = d.type === 'ammo' && !player.owned[d.weapon];
            const isFull =
                (d.type === 'ammo' && (unowned || player[d.weapon].ammo >= maxAmmoFor(d.weapon))) ||
                (d.type === 'medkit' && player.medkits >= CFG.player.maxMedkits);
            if (isFull) {
                if (fullInfoCd <= 0) {
                    fullInfoCd = 1.2;
                    showPickup(d.type !== 'ammo' ? 'Medkit already carried'
                        : (unowned ? `${kind.label} — you don't own that weapon`
                            : `${kind.label} already full`), '#b8b8b8');
                }
            } else {
                if (d.type === 'ammo') {         // paket peluru: HANYA senjata jenis ini
                    const w = d.weapon;
                    player[w].ammo = Math.min(maxAmmoFor(w), player[w].ammo + CFG.weapons[w].ammoPickup);
                    showPickup(`+${CFG.weapons[w].ammoPickup} ${kind.label}`, kind.color);
                } else if (d.type === 'medkit') {
                    // Medkit = item genggam (maks 1). Diambil ke inventori; PAKAI
                    // dgn tombol 4 untuk memulihkan HP (bukan sembuh saat diambil).
                    player.medkits = Math.min(CFG.player.maxMedkits, player.medkits + 1);
                    showPickup('+1 Medkit (press 4 to use)', '#ff6b81');
                }
                playSFX(sfxPickup);
                updateUI();
                beginLootFlight(d.mesh);   // amunisi & medkit ikut terbang ke player
                drops.splice(i, 1);
                continue;
            }
        }
        if (d.timer <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
    }
}
