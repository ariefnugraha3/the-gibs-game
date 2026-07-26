// AMUNISI PER-SENJATA (2026-07-26, permintaan user): dulu SATU item 'mag'
// mengisi ammo SEMUA senjata sekaligus. Sekarang tiap senjata punya item
// amunisinya SENDIRI — pistol / shotgun / rifle / grenade launcher — dan
// memungutnya hanya mengisi senjata itu saja.
//
// Tiap jenis dibuat BERBEDA BENTUK supaya langsung dikenali dari kamera
// top-down (bukan sekadar beda warna):
//   pistol   — kotak peluru kecil berisi deret selongsong 9 mm berdiri
//   shotgun  — baki berisi selongsong 12-gauge (hull merah-bata + kepala kuningan)
//   rifle    — SEPASANG magazen lengkung (banana mag) yang ditumpuk
//   launcher — deret granat 40 mm gemuk (badan olive + hidung ogive kuningan)
//
// Tiap item juga membawa PELAT LABEL kecil beremissive dgn warna khas jenisnya
// (putih / merah-bata / amber / teal) sebagai penanda cepat dari kejauhan.
//
// Geometri & material BERSAMA antar instance (pola MAG_GEO di drops.js — Group
// tidak ditelusuri clearArray) — JANGAN pernah di-dispose. Semua Lambert/Basic
// (sudah dihangatkan preload) sehingga memunculkannya tak memicu recompile.

import { PAL } from '../world/palette.js';

// --- Warna: kuningan/olive/hull = warna FUNGSIONAL amunisi (bukan dekor), sisanya token PAL ---
const BRASS = 0xc9a227;      // kuningan selongsong
const BRASS_EM = 0x5a4408;   // kilau kuningan lembut
const HULL = PAL.hazard;     // hull shotgun merah-bata
const OLIVE = 0x5c6238;      // badan granat 40 mm

const GEO = {
    // kotak/baki
    crate: new THREE.BoxGeometry(5.4, 1.7, 3.6),
    tray: new THREE.BoxGeometry(6.0, 1.2, 3.2),
    lid: new THREE.BoxGeometry(5.4, 0.5, 1.5),
    label: new THREE.BoxGeometry(2.4, 0.28, 0.9),
    // selongsong
    pistolRound: new THREE.CylinderGeometry(0.34, 0.34, 1.5, 8),
    pistolTip: new THREE.ConeGeometry(0.32, 0.6, 8),
    shell: new THREE.CylinderGeometry(0.52, 0.52, 2.2, 10),
    shellHead: new THREE.CylinderGeometry(0.56, 0.56, 0.8, 10),
    // magazen rifle (segmen ditumpuk miring = lengkung)
    magSeg: new THREE.BoxGeometry(1.05, 1.35, 1.85),
    magBase: new THREE.BoxGeometry(1.3, 0.45, 2.2),
    magLips: new THREE.BoxGeometry(1.12, 0.45, 1.7),
    // granat 40 mm
    nadeBody: new THREE.CylinderGeometry(1.15, 1.15, 2.6, 12),
    nadeCase: new THREE.CylinderGeometry(1.22, 1.22, 1.1, 12),
    nadeNose: new THREE.SphereGeometry(1.15, 12, 8),
    rack: new THREE.BoxGeometry(6.2, 0.9, 3.4),
};

const MAT = {
    brass: new THREE.MeshLambertMaterial({ color: BRASS, emissive: BRASS_EM }),
    polymer: new THREE.MeshLambertMaterial({ color: 0x4d5660, emissive: 0x171c20 }),
    trim: new THREE.MeshLambertMaterial({ color: PAL.ink }),
    steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
    crate: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
    hull: new THREE.MeshLambertMaterial({ color: HULL, emissive: 0x2a0d08 }),
    olive: new THREE.MeshLambertMaterial({ color: OLIVE, emissive: 0x141705 }),
    // pelat label per jenis (Basic toneMapped:false = ikut bloom, penanda jauh)
    tagPistol: new THREE.MeshBasicMaterial({ color: PAL.white, toneMapped: false }),
    tagShotgun: new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }),
    tagRifle: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    tagLauncher: new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false }),
};

const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
};
// Pelat label melayang tepat di atas item (penanda jenis dari kejauhan)
const tag = (mat, y) => mesh(GEO.label, mat, 0, y, -1.9);

// ----- PISTOL: kotak peluru kecil + 6 selongsong 9 mm berdiri -----
export function buildPistolAmmoMesh() {
    const g = new THREE.Group();
    g.add(mesh(GEO.crate, MAT.crate, 0, 0.85, 0));
    g.add(mesh(GEO.lid, MAT.trim, 0, 1.85, -1.0));              // tutup terbuka menengadah
    // dua baris selongsong pendek berdiri (kuningan) di dalam kotak
    for (let i = 0; i < 3; i++) {
        for (const zz of [0.45, -0.35]) {
            const x = -1.5 + i * 1.5;
            g.add(mesh(GEO.pistolRound, MAT.brass, x, 2.35, zz));
            g.add(mesh(GEO.pistolTip, MAT.brass, x, 3.35, zz));
        }
    }
    g.add(tag(MAT.tagPistol, 1.9));
    return g;
}

// ----- SHOTGUN: baki + 5 selongsong 12-gauge (hull merah-bata + kepala kuningan) -----
export function buildShotgunAmmoMesh() {
    const g = new THREE.Group();
    g.add(mesh(GEO.tray, MAT.crate, 0, 0.6, 0));
    // 4 shell BERDIRI berjajar + 1 REBAH di depan (siluet khas shotgun)
    for (let i = 0; i < 4; i++) {
        const x = -2.1 + i * 1.4;
        g.add(mesh(GEO.shell, MAT.hull, x, 2.3, -0.5));
        g.add(mesh(GEO.shellHead, MAT.brass, x, 1.4, -0.5));
    }
    g.add(mesh(GEO.shell, MAT.hull, 0.6, 1.75, 1.0, 0, 0, Math.PI / 2));
    g.add(mesh(GEO.shellHead, MAT.brass, -0.9, 1.75, 1.0, 0, 0, Math.PI / 2));
    g.add(tag(MAT.tagShotgun, 1.5));
    return g;
}

// ----- RIFLE: sepasang magazen lengkung (banana mag) ditumpuk -----
function addBananaMag(g, ox, oz, tilt) {
    // Badan: 3 segmen dgn ofset-z + tilt progresif = siluet magazen melengkung
    for (const [y, z, rx] of [[2.3, -0.34, 0.10], [1.15, -0.15, 0.26], [0.02, 0.24, 0.42]]) {
        const s = mesh(GEO.magSeg, MAT.polymer, ox, y, oz + z, rx);
        s.rotation.y = tilt;
        g.add(s);
    }
    g.add(mesh(GEO.magBase, MAT.trim, ox, -0.6, oz + 0.55, 0.42, tilt));
    g.add(mesh(GEO.magLips, MAT.trim, ox, 3.0, oz - 0.45, 0.10, tilt));
    // selongsong teratas mengintip dari bibir pengumpan
    g.add(mesh(GEO.pistolRound, MAT.brass, ox - 0.13, 3.4, oz - 0.5, Math.PI / 2, tilt));
    g.add(mesh(GEO.pistolTip, MAT.brass, ox - 0.13, 3.4, oz - 1.35, -Math.PI / 2, tilt));
}
export function buildRifleAmmoMesh() {
    const g = new THREE.Group();
    addBananaMag(g, -1.1, 0.3, 0.10);
    addBananaMag(g, 1.2, -0.4, -0.14);
    g.add(mesh(GEO.tray, MAT.steel, 0, 0.25, 0.2));   // pelat dasar (dua mag berdiri di atasnya)
    g.add(tag(MAT.tagRifle, 1.2));
    return g;
}

// ----- GRENADE LAUNCHER: 3 granat 40 mm gemuk di rak -----
export function buildLauncherAmmoMesh() {
    const g = new THREE.Group();
    g.add(mesh(GEO.rack, MAT.crate, 0, 0.45, 0));
    for (let i = 0; i < 3; i++) {
        const x = -1.9 + i * 1.9;
        g.add(mesh(GEO.nadeCase, MAT.brass, x, 1.45, 0));    // selongsong pendorong kuningan
        g.add(mesh(GEO.nadeBody, MAT.olive, x, 3.3, 0));     // badan HE olive
        g.add(mesh(GEO.nadeNose, MAT.olive, x, 4.6, 0));     // hidung ogive membulat
    }
    g.add(tag(MAT.tagLauncher, 1.1));
    return g;
}

// Tabel jenis amunisi: kunci = kunci senjata (player.owned / CFG.weapons).
// `build` dipakai drops.js + preload (warmup) + crates.js (isi peti).
export const AMMO_KINDS = {
    pistol: { build: buildPistolAmmoMesh, label: 'Pistol Ammo', color: '#d8d2c4' },
    shotgun: { build: buildShotgunAmmoMesh, label: 'Shotgun Shells', color: '#e06a52' },
    rifle: { build: buildRifleAmmoMesh, label: 'Rifle Ammo', color: '#ffb03b' },
    launcher: { build: buildLauncherAmmoMesh, label: 'Grenade Rounds', color: '#2fb8a6' },
};
export const AMMO_WEAPONS = Object.keys(AMMO_KINDS);

// Bangun mesh amunisi untuk senjata `w` (fallback pistol bila kunci tak dikenal).
export function buildAmmoMesh(w) {
    return (AMMO_KINDS[w] || AMMO_KINDS.pistol).build();
}
