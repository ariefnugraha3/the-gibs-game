// Sistem senjata: rifle ("Assault Rifle", model Pindad SS2-V2) & pistol.
// Meliputi: model + rig tangan CS-style, ganti senjata, reload (mekanik timer
// nyata + animasi keyframe), melee, dan blok MENEMBAK (spread/recoil/heat).
// Peluru identik utk kedua senjata; hit test-nya di zombies.js.

import { CFG } from '../core/config.js';
import {
    player, keys, mouse, bullets, zombies, isPaused, isGameOver, stats,
    GEO, MAT, _dir, _tip, _v3, _sRight, _sUp, _kickEuler
} from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { makeTexture, speckle } from '../utils/textures.js';
import { rand, clamp, smooth01 } from '../utils/math.js';
import { playSFX, sfxShoot, sfxPistol, sfxReload, sfxMelee } from '../utils/sfx.js';
import { crosshair } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { stamina, staExhausted, drainStamina, sprintingNow, crouchedNow } from './player.js';
import { killZombie } from './zombies.js';
import { spawnDrop } from './drops.js';

// ----- Status senjata (live export; reassign hanya di modul ini) -----
export let currentWeapon = 'rifle';                 // 'rifle' | 'pistol'
export let isAiming = false;                        // ADS (klik kanan = toggle)
export let switchAnim = -1;                         // -1 = tidak sedang ganti
export let meleeT = 0;

let aimT = 0;   // aimT 0..1 (transisi ADS dihaluskan)
const BASE_FOV = 70, AIM_ZOOM = 1.2;   // zoom 20% saat membidik
let switchTarget = null;
const SWITCH_TIME = 0.5;
// Melee (F): pukul dgn popor senjata aktif; 1x pukul membunuh zombie
let meleeCd = 0, meleeS = 0, meleeHitDone = false;
const MELEE_TIME = 0.45;   // durasi ayunan (animasi; cooldown & range dari CFG.melee)
let gunRecoil = 0;      // kickback senjata (visual, tak mengganggu mouse-look)
let gunHeat = 0;        // "panas laras" 0..1: naik tiap tembakan, dingin saat jeda —
                        // memperbesar spread saat menembak beruntun (bloom recoil)
let gunBobT = 0;        // fase goyangan senjata saat berjalan (visual)
let gunRotX = 0, gunRotZ = 0;                // rotasi dasar senjata (rig reload)
let reloadStartTime = 0;          // waktu nyata -> sinkron dgn setTimeout reload

// Rig & bagian yang dianimasikan
export let gunMesh = null, pistolMesh = null, shotgunMesh = null;
let muzzleFlash = null, muzzlePoint = null, muzzleSprite = null;
let leftHand, leftForearm, rightArm, gunMagMesh, boltHandle;
let pistolSlide, pistolMagMesh, pistolMuzzle, rifleMuzzle;
let pLeftHand, pLeftForearm;
let sgLeftHand, sgLeftForearm, sgPump, sgMagMesh, shotgunMuzzle;
let lastWeapon = 'pistol';   // utk Q = tukar cepat ke senjata SEBELUMNYA
const LEFT_HAND_REST = new THREE.Vector3(0, -0.35, -3.0);   // menopang handguard rifle
// Pose istirahat magazen rifle (satu sumber utk init + rig reload + idle)
const MAG_REST = { x: 0, y: -1.35, z: -1.15, rx: 0.16 };
const P_LEFT_REST = new THREE.Vector3(-0.12, -0.72, -0.5);  // tangan kiri menopang pistol
const SG_LEFT_REST = new THREE.Vector3(0, -0.5, -3.3);      // tangan kiri di pump shotgun
const SG_MAG_REST = { x: 0, y: -1.05, z: -0.6, rx: 0.1 };   // magazen kotak shotgun
const SG_PUMP_Z = -3.3;                                     // posisi dasar pump
const _axisZ = new THREE.Vector3(0, 0, 1);   // sumbu limb (placeLimb)

// ----- Tabel definisi senjata (IMPROVEMENT-PLAN #5) -----
// SEMUA konstanta visual per-senjata di satu tempat (nilai rifle/pistol =
// verbatim kalibrasi lama — jangan diubah tanpa alasan). mesh & muzzlePoint
// diisi initWeapons(). kfBase = durasi dasar keyframe reload (detik) — rig
// diskalakan ke durasi reload EFEKTIF (player.reloadDurMs, termasuk upgrade
// shop reloadMul). Menambah senjata baru = tambah baris di sini + model +
// cabang rig reload di updateWeaponVisuals + entri CFG.weapons.
export const WEAPON_DEF = {
    rifle: {
        name: 'Assault Rifle', hipX: 3, hipY: -2.5, adsY: -0.78, baseZ: -6,
        kick: 2.5, muzzle: [0, 0.1, -7.4], muzzleScale: 1, kfBase: 3.0,
        mesh: null, muzzlePoint: null
    },
    pistol: {
        name: 'Pistol', hipX: 2.6, hipY: -2.3, adsY: -0.7, baseZ: -5,
        kick: 1.6, muzzle: [0, 0.42, -2.7], muzzleScale: 0.75, kfBase: 2.2,
        mesh: null, muzzlePoint: null
    },
    shotgun: {
        name: 'Shotgun', hipX: 3, hipY: -2.5, adsY: -0.55, baseZ: -6,
        kick: 3.2, muzzle: [0, 0.15, -6.9], muzzleScale: 1.15, kfBase: 2.6,
        mesh: null, muzzlePoint: null
    },
};

// ----- Rig reload tangan kiri: keyframe posisi (gun-local), waktu nyata -----
// Urutan: lepas magazen -> buang/ambil baru di bawah -> pasang -> tarik kokang
// -> kembali. Skala waktu KF mengikuti reloadMs di CFG (default = 1:1).
const RELOAD_KF = [
    [0.00, 0.0, -0.35, -3.0],   // menopang handguard
    [0.35, 0.0, -1.35, -1.1],   // genggam magazen
    [0.80, 0.5, -3.6, -0.1],    // cabut & turun (magazen lama dibuang)
    [1.30, 0.5, -3.6, -0.1],    // ambil magazen baru (di bawah layar)
    [1.75, 0.0, -1.45, -1.1],   // bawa naik ke lubang magazen
    [2.05, 0.0, -1.15, -1.1],   // dorong masuk (klik)
    [2.30, 0.5, 0.12, 0.4],     // pindah ke tuas kokang
    [2.55, 0.5, 0.12, 1.15],    // tarik kokang ke belakang
    [2.68, 0.5, 0.12, 0.45],    // lepaskan (snap ke depan)
    [3.00, 0.0, -0.35, -3.0],   // kembali menopang handguard
];
// Reload shotgun (basis 2.6 dtk): magazen kotak keluar dari bawah receiver ->
// buang/ambil baru -> pasang -> RACK PUMP (bukan tuas kokang) -> kembali.
const SHOTGUN_KF = [
    [0.00, 0.0, -0.5, -3.3],    // menopang pump
    [0.30, 0.0, -1.3, -0.6],    // genggam magazen kotak
    [0.70, 0.5, -3.4, 0.0],     // cabut & buang ke bawah
    [1.10, 0.5, -3.4, 0.0],     // ambil magazen baru
    [1.50, 0.0, -1.4, -0.6],    // bawa naik ke lubangnya
    [1.75, 0.0, -1.05, -0.6],   // dorong masuk (klik)
    [2.00, 0.0, -0.5, -3.3],    // kembali menggenggam pump
    [2.25, 0.0, -0.5, -2.5],    // tarik pump ke belakang
    [2.38, 0.0, -0.5, -3.25],   // dorong balik (clack)
    [2.60, 0.0, -0.5, -3.3],    // istirahat
];

// Reload pistol (basis 2.2 dtk): mag keluar dari grip -> buang/ambil baru di
// bawah -> masukkan -> tarik slide -> kembali menopang.
const PISTOL_KF = [
    [0.00, -0.12, -0.72, -0.5], // menopang dua-tangan
    [0.25, 0.0, -1.0, -0.2],    // genggam magazen di pangkal grip
    [0.60, 0.35, -3.0, 0.3],    // cabut & buang ke bawah
    [0.95, 0.35, -3.0, 0.3],    // ambil magazen baru
    [1.30, 0.0, -1.15, -0.25],  // masukkan ke grip
    [1.55, 0.0, -0.9, -0.22],   // dorong klik
    [1.75, 0.0, 0.5, -0.7],     // pegang slide
    [1.95, 0.0, 0.5, 0.0],      // tarik slide ke belakang
    [2.05, 0.0, 0.5, -0.55],    // lepas (slide snap ke depan)
    [2.20, -0.12, -0.72, -0.5], // kembali menopang
];

// Rentangkan mesh "limb" (geometri panjang 1 di sumbu z) dari titik A ke B —
// posisi = titik tengah, scale.z = jarak, orientasi = arah A->B.
export function placeLimb(mesh, ax, ay, az, bx, by, bz) {
    _dir.set(bx - ax, by - ay, bz - az);
    const len = _dir.length();
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.scale.z = len;
    mesh.quaternion.setFromUnitVectors(_axisZ, _dir.normalize());
}

function reloadHandPos(KF, t, out) {
    if (t <= KF[0][0]) { const k = KF[0]; out.set(k[1], k[2], k[3]); return; }
    for (let i = 0; i < KF.length - 1; i++) {
        const a = KF[i], b = KF[i + 1];
        if (t <= b[0]) {
            const u = smooth01((t - a[0]) / (b[0] - a[0]));
            out.set(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
            return;
        }
    }
    const k = KF[KF.length - 1];
    out.set(k[1], k[2], k[3]);
}

// ----- Perakitan model senjata + tangan (parented ke kamera) -----
export function initWeapons() {
    // ----- Assault Rifle: Pindad SS2-V2, serba hitam (posisi, panjang laras,
    // titik muzzle, & seluruh mekanik dari kalibrasi lama — hanya visual) -----
    gunMesh = new THREE.Group();
    const gunSteelTex = makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#23262b'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#1b1e22', '#2b2f35', '#202329'], 90, 1, 3);
    });
    const polyTex = makeTexture(64, 64, (g, w, h) => {   // polymer hitam kasar
        g.fillStyle = '#15171a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#0e1013', '#1c1f24', '#111318'], 80, 1, 3);
    });
    const steel = new THREE.MeshPhongMaterial({ map: gunSteelTex, shininess: 60, specular: 0x555a66 });
    const steelDark = new THREE.MeshPhongMaterial({ color: 0x121417, shininess: 40, specular: 0x33363c });
    const polymer = new THREE.MeshPhongMaterial({ map: polyTex, shininess: 14, specular: 0x24262b });
    const mkPart = (geo, mat, x, y, z, rx = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = rx; m.rotation.z = rz;
        gunMesh.add(m);
        return m;
    };
    mkPart(new THREE.BoxGeometry(0.8, 0.95, 3.3), steel, 0, 0, -0.25);                            // receiver
    mkPart(new THREE.BoxGeometry(0.72, 0.55, 1.1), steel, 0, -0.6, -1.1);                         // magwell
    // Carry handle khas SS2 (ala M16): dua dinding samping + palang atas —
    // kanal di antaranya = jalur pandang ADS, dgn takik peep di belakang
    for (const sx of [-0.2, 0.2]) {
        mkPart(new THREE.BoxGeometry(0.1, 0.5, 0.5), steelDark, sx, 0.66, 0.5);
        mkPart(new THREE.BoxGeometry(0.1, 0.5, 0.5), steelDark, sx, 0.66, -1.3);
    }
    mkPart(new THREE.BoxGeometry(0.5, 0.2, 2.6), steelDark, 0, 0.98, -0.4);                       // palang atas handle
    mkPart(new THREE.BoxGeometry(0.07, 0.2, 0.24), steelDark, -0.11, 0.72, 0.42);                 // peep belakang
    mkPart(new THREE.BoxGeometry(0.07, 0.2, 0.24), steelDark, 0.11, 0.72, 0.42);
    // Handguard polymer dgn rusuk melintang (ciri SS2)
    mkPart(new THREE.BoxGeometry(0.78, 0.84, 2.4), polymer, 0, 0, -3.1);
    for (let i = 0; i < 6; i++)
        mkPart(new THREE.BoxGeometry(0.86, 0.92, 0.13), polymer, 0, 0, -2.15 - i * 0.4);
    mkPart(new THREE.CylinderGeometry(0.14, 0.14, 2.9, 8), steelDark, 0, 0.1, -5.5, Math.PI / 2); // laras terbuka
    mkPart(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), steelDark, 0, 0.34, -4.9, Math.PI / 2);// tabung gas
    mkPart(new THREE.CylinderGeometry(0.21, 0.23, 0.9, 8), steelDark, 0, 0.1, -7.0, Math.PI / 2); // flash hider birdcage
    mkPart(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 8), steelDark, 0, 0.1, -6.5, Math.PI / 2);// cincin pangkalnya
    // Pisir depan bersayap dekat muzzle + swivel sling kecil di bawahnya
    mkPart(new THREE.BoxGeometry(0.1, 0.55, 0.1), steelDark, 0, 0.5, -6.25);
    mkPart(new THREE.BoxGeometry(0.08, 0.5, 0.3), steelDark, -0.17, 0.5, -6.25);
    mkPart(new THREE.BoxGeometry(0.08, 0.5, 0.3), steelDark, 0.17, 0.5, -6.25);
    mkPart(new THREE.BoxGeometry(0.06, 0.2, 0.12), steelDark, 0, -0.12, -6.25);
    // Magazen STANAG (Group: badan + pelat alas; dianimasikan saat reload)
    gunMagMesh = new THREE.Group();
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.6, 0.88), steel);
    gunMagMesh.add(magBody);
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.98), steelDark);
    magBase.position.set(0, -0.85, 0.06);
    gunMagMesh.add(magBase);
    gunMagMesh.position.set(MAG_REST.x, MAG_REST.y, MAG_REST.z);
    gunMagMesh.rotation.x = MAG_REST.rx;
    gunMesh.add(gunMagMesh);
    mkPart(new THREE.BoxGeometry(0.5, 1.05, 0.6), polymer, 0, -0.95, 0.7, 0.28);                  // grip pistol polymer
    mkPart(new THREE.BoxGeometry(0.14, 0.45, 1.05), steelDark, 0, -0.62, 1.3);                    // pelindung pelatuk
    // Popor lipat rangka (skeleton stock): tabung atas + pelat popor +
    // strut diagonal -> jendela segitiga khas SS2-V2
    mkPart(new THREE.BoxGeometry(0.26, 0.26, 2.2), polymer, 0, 0.1, 2.5);
    mkPart(new THREE.BoxGeometry(0.34, 1.5, 0.34), polymer, 0, -0.42, 3.5);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1), polymer);
    placeLimb(strut, 0, -0.5, 1.4, 0, -1.05, 3.42);
    gunMesh.add(strut);
    boltHandle = mkPart(new THREE.BoxGeometry(0.5, 0.18, 0.5), steel, 0.45, 0.15, 0.4);           // tuas kokang (ditarik saat reload)

    // ----- Tangan & lengan karakter (gaya CS: lengan penuh dari sudut layar ke senjata,
    // sarung tangan taktis + jari mencengkeram; ikut bob/ADS/recoil via gunMesh) -----
    const glove = new THREE.MeshPhongMaterial({ color: 0x3a3d42, shininess: 16, specular: 0x22242a });
    const sleeve = new THREE.MeshPhongMaterial({ color: 0x4a4d3c, shininess: 8, specular: 0x181a14 });

    // --- Tangan kanan: menggenggam pistol grip (statis; tetap pegang saat reload)
    rightArm = new THREE.Group();
    const gripHand = new THREE.Group();               // mengikuti kemiringan grip
    gripHand.position.set(0, -0.95, 0.72);
    gripHand.rotation.z = 0.25;
    const palmR = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.85, 0.62), glove);
    palmR.position.set(0.32, -0.05, 0);               // telapak di sisi kanan grip
    gripHand.add(palmR);
    for (let i = 0; i < 3; i++) {                     // tiga jari melingkari grip
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.17, 0.5), glove);
        f.position.set(-0.02, 0.28 - i * 0.24, -0.04);
        gripHand.add(f);
    }
    const trigF = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.55), glove);
    trigF.position.set(0.1, 0.55, -0.3);              // telunjuk ke arah pelatuk
    trigF.rotation.x = 0.35;
    gripHand.add(trigF);
    const thumbR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.18), glove);
    thumbR.position.set(0.26, 0.42, 0.06);            // ibu jari di sisi atas
    gripHand.add(thumbR);
    rightArm.add(gripHand);
    // manset + lengan bawah kanan: pergelangan -> siku di sudut kanan-bawah layar
    const cuffR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.5), sleeve);
    cuffR.position.set(0.45, -1.32, 1.0);
    rightArm.add(cuffR);
    const foreR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1), sleeve);
    placeLimb(foreR, 0.45, -1.4, 1.05, 1.7, -3.8, 3.2);   // diagonal khas CS
    rightArm.add(foreR);
    gunMesh.add(rightArm);

    // --- Tangan kiri: telapak menopang handguard dari bawah, jari mencengkeram sisi,
    // ibu jari di sisi dalam. Group ini yang dianimasikan penuh saat reload.
    leftHand = new THREE.Group();
    const palmL = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 1.05), glove);
    palmL.position.set(0, -0.28, 0);
    leftHand.add(palmL);
    for (let i = 0; i < 4; i++) {                     // empat jari ke sisi kanan handguard
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.2), glove);
        f.position.set(0.37, -0.02, -0.36 + i * 0.24);
        leftHand.add(f);
    }
    const thumbL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.5), glove);
    thumbL.position.set(-0.36, -0.08, 0.12);
    leftHand.add(thumbL);
    const cuffL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.45), sleeve);
    cuffL.position.set(-0.05, -0.2, 0.6);             // manset bergerak bersama tangan
    leftHand.add(cuffL);
    leftHand.position.copy(LEFT_HAND_REST);
    gunMesh.add(leftHand);
    // Lengan bawah kiri DINAMIS: direntangkan siku->pergelangan tiap frame
    // (updateWeaponVisuals), jadi lengan tetap tersambung saat tangan reload.
    leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1), sleeve);
    gunMesh.add(leftForearm);

    // ----- Pistol (secondary; parented ke kamera, tersembunyi sampai dipilih) -----
    pistolMesh = new THREE.Group();
    pistolSlide = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 2.6), steel);   // slide (ditarik saat reload, kick saat nembak)
    pistolSlide.position.set(0, 0.42, -1.2);
    pistolMesh.add(pistolSlide);
    const pFrame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 2.2), steelDark);
    pFrame.position.set(0, 0.08, -1.0);
    pistolMesh.add(pFrame);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.15, 0.6), steelDark);
    pGrip.position.set(0, -0.5, -0.2);
    pGrip.rotation.x = 0.12;
    pistolMesh.add(pGrip);
    const pGuard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.6), steelDark);
    pGuard.position.set(0, -0.12, -0.85);   // pelindung pelatuk
    pistolMesh.add(pGuard);
    // pisir pistol: bilah depan + dua takik belakang (sight picture ADS)
    const pFront = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), steelDark);
    pFront.position.set(0, 0.7, -2.3);
    pistolMesh.add(pFront);
    for (const sx of [-0.1, 0.1]) {
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.12), steelDark);
        tab.position.set(sx, 0.7, -0.05);
        pistolMesh.add(tab);
    }
    // magazen pistol: keluar-masuk dari dalam grip saat reload
    pistolMagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.95, 0.42), steel);
    pistolMagMesh.position.set(0, -0.72, -0.26);
    pistolMagMesh.rotation.x = 0.12;
    pistolMesh.add(pistolMagMesh);
    pistolMuzzle = new THREE.Object3D();
    pistolMuzzle.position.set(0, 0.42, -2.7);
    pistolMesh.add(pistolMuzzle);

    // Tangan kanan pistol: menggenggam grip (statis) + lengan ke kanan-bawah
    const pGripHand = new THREE.Group();
    pGripHand.position.set(0, -0.5, -0.2);
    pGripHand.rotation.x = 0.12;
    const pPalm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.5), glove);
    pPalm.position.set(0.28, -0.05, 0.02);
    pGripHand.add(pPalm);
    for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.42), glove);
        f.position.set(-0.02, 0.2 - i * 0.2, -0.05);
        pGripHand.add(f);
    }
    const pThumb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.16), glove);
    pThumb.position.set(0.24, 0.32, 0.1);
    pGripHand.add(pThumb);
    const pTrig = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.45), glove);
    pTrig.position.set(0.09, 0.42, -0.5);
    pTrig.rotation.x = 0.25;
    pGripHand.add(pTrig);
    pistolMesh.add(pGripHand);
    const pCuffR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.45), sleeve);
    pCuffR.position.set(0.32, -1.28, 0.5);
    pistolMesh.add(pCuffR);
    const pForeR = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1), sleeve);
    placeLimb(pForeR, 0.32, -1.3, 0.55, 1.6, -3.7, 2.8);
    pistolMesh.add(pForeR);
    // Tangan kiri pendukung (stance dua tangan); dianimasikan saat reload pistol
    pLeftHand = new THREE.Group();
    const pPalmL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.6), glove);
    pPalmL.position.set(-0.08, 0.05, 0);
    pLeftHand.add(pPalmL);
    for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.4), glove);
        f.position.set(0.12, 0.24 - i * 0.2, -0.08);
        pLeftHand.add(f);
    }
    const pCuffL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.4), sleeve);
    pCuffL.position.set(-0.2, -0.35, 0.4);
    pLeftHand.add(pCuffL);
    pLeftHand.position.copy(P_LEFT_REST);
    pistolMesh.add(pLeftHand);
    pLeftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1), sleeve);
    pistolMesh.add(pLeftForearm);

    pistolMesh.position.set(2.6, -2.3, -5);
    pistolMesh.visible = false;
    camera.add(pistolMesh);

    // ----- Shotgun (senjata ke-3, tombol 3): pump-action hitam ber-magazen
    // kotak (reload gaya magazen — shell-by-shell di luar cakupan) -----
    shotgunMesh = new THREE.Group();
    const sgPart = (geo, mat, x, y, z, rx = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = rx; m.rotation.z = rz;
        shotgunMesh.add(m);
        return m;
    };
    sgPart(new THREE.BoxGeometry(0.72, 0.9, 2.7), steel, 0, 0, 0.1);                              // receiver
    sgPart(new THREE.CylinderGeometry(0.13, 0.13, 5.4, 8), steelDark, 0, 0.15, -4.0, Math.PI / 2); // laras
    sgPart(new THREE.CylinderGeometry(0.11, 0.11, 4.6, 8), steelDark, 0, -0.22, -3.5, Math.PI / 2);// tabung bawah laras
    sgPump = sgPart(new THREE.BoxGeometry(0.85, 0.7, 1.5), polymer, 0, -0.05, SG_PUMP_Z);          // pump (ditarik saat reload)
    sgPart(new THREE.BoxGeometry(0.1, 0.16, 0.14), steelDark, 0, 0.52, -6.45);                     // bead depan
    sgPart(new THREE.BoxGeometry(0.16, 0.14, 0.35), steelDark, 0, 0.5, 0.9);                       // takik belakang (garis ADS)
    sgMagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.8), steel);                      // magazen kotak
    sgMagMesh.position.set(SG_MAG_REST.x, SG_MAG_REST.y, SG_MAG_REST.z);
    sgMagMesh.rotation.x = SG_MAG_REST.rx;
    shotgunMesh.add(sgMagMesh);
    sgPart(new THREE.BoxGeometry(0.5, 0.95, 0.65), polymer, 0, -0.85, 0.95, 0.3);                  // grip
    sgPart(new THREE.BoxGeometry(0.6, 1.0, 2.1), polymer, 0, -0.35, 2.35, 0.07);                   // popor
    sgPart(new THREE.BoxGeometry(0.14, 0.4, 0.95), steelDark, 0, -0.6, 0.35);                      // pelindung pelatuk
    shotgunMuzzle = new THREE.Object3D();
    shotgunMuzzle.position.set(0, 0.15, -6.9);
    shotgunMesh.add(shotgunMuzzle);
    // Tangan kanan (genggam grip) + lengan — pola sama dgn rifle
    const sgGripHand = new THREE.Group();
    sgGripHand.position.set(0, -0.85, 0.97);
    sgGripHand.rotation.z = 0.25;
    const sgPalm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.8, 0.6), glove);
    sgPalm.position.set(0.3, -0.05, 0);
    sgGripHand.add(sgPalm);
    for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.48), glove);
        f.position.set(-0.02, 0.26 - i * 0.22, -0.04);
        sgGripHand.add(f);
    }
    shotgunMesh.add(sgGripHand);
    const sgCuffR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.5), sleeve);
    sgCuffR.position.set(0.45, -1.3, 1.25);
    shotgunMesh.add(sgCuffR);
    const sgForeR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1), sleeve);
    placeLimb(sgForeR, 0.45, -1.38, 1.3, 1.7, -3.8, 3.3);
    shotgunMesh.add(sgForeR);
    // Tangan kiri di pump (dianimasikan penuh saat reload + rack)
    sgLeftHand = new THREE.Group();
    const sgPalmL = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 1.0), glove);
    sgPalmL.position.set(0, -0.28, 0);
    sgLeftHand.add(sgPalmL);
    for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.2), glove);
        f.position.set(0.37, -0.04, -0.32 + i * 0.22);
        sgLeftHand.add(f);
    }
    const sgCuffL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.45), sleeve);
    sgCuffL.position.set(-0.05, -0.2, 0.6);
    sgLeftHand.add(sgCuffL);
    sgLeftHand.position.copy(SG_LEFT_REST);
    shotgunMesh.add(sgLeftHand);
    sgLeftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1), sleeve);
    shotgunMesh.add(sgLeftForearm);

    shotgunMesh.position.set(3, -2.5, -6);
    shotgunMesh.visible = false;
    camera.add(shotgunMesh);

    // Isi referensi runtime tabel senjata (dipakai attachMuzzle/switch/visual)
    WEAPON_DEF.rifle.mesh = gunMesh;
    WEAPON_DEF.pistol.mesh = pistolMesh;
    WEAPON_DEF.shotgun.mesh = shotgunMesh;
    WEAPON_DEF.pistol.muzzlePoint = pistolMuzzle;
    WEAPON_DEF.shotgun.muzzlePoint = shotgunMuzzle;

    // Titik ujung laras: referensi eksplisit utk spawn peluru (jangan andalkan indeks children)
    muzzlePoint = new THREE.Object3D();
    muzzlePoint.position.set(0, 0.1, -7.4);
    gunMesh.add(muzzlePoint);
    // PENTING: simpan referensi muzzle rifle SETELAH objeknya dibuat — attachMuzzle
    // memakai ini saat ganti senjata (bug lama: sebelumnya tercatat undefined).
    rifleMuzzle = muzzlePoint;
    WEAPON_DEF.rifle.muzzlePoint = rifleMuzzle;

    // Muzzle flash: PointLight + sprite radial aditif di ujung laras
    muzzleFlash = new THREE.PointLight(0xffaa33, 0, 60, 2);
    muzzleFlash.position.set(0, 0.1, -7.4);
    gunMesh.add(muzzleFlash);

    const flashTex = makeTexture(64, 64, (g) => {
        const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
        grad.addColorStop(0, 'rgba(255,240,180,1)');
        grad.addColorStop(0.35, 'rgba(255,170,60,0.85)');
        grad.addColorStop(1, 'rgba(255,120,20,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        // empat lidah api memanjang (bentuk bintang khas muzzle flash)
        g.translate(32, 32);
        g.fillStyle = 'rgba(255,210,120,0.9)';
        for (let i = 0; i < 4; i++) {
            g.rotate(Math.PI / 2);
            g.beginPath();
            g.moveTo(0, -2.5); g.lineTo(30, 0); g.lineTo(0, 2.5);
            g.closePath(); g.fill();
        }
    });
    muzzleSprite = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({
            map: flashTex, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false
        })
    );
    muzzleSprite.position.set(0, 0.1, -7.5);
    muzzleSprite.renderOrder = 9;
    gunMesh.add(muzzleSprite);

    gunMesh.position.set(3, -2.5, -6);
    camera.add(gunMesh);
    scene.add(camera);
}

// Pindahkan muzzle flash/sprite ke senjata aktif & arahkan muzzlePoint ke sana
// (posisi & skala dari WEAPON_DEF — satu sumber utk semua senjata).
export function attachMuzzle(wpn) {
    const def = WEAPON_DEF[wpn];
    def.mesh.add(muzzleFlash);
    muzzleFlash.position.set(def.muzzle[0], def.muzzle[1], def.muzzle[2]);
    def.mesh.add(muzzleSprite);
    muzzleSprite.position.set(def.muzzle[0], def.muzzle[1], def.muzzle[2] - 0.1);
    muzzleSprite.scale.setScalar(def.muzzleScale);
    muzzlePoint = def.muzzlePoint;
}

// Mulai animasi ganti senjata; model ditukar di tengah animasi (updateWeaponTimers).
export function startSwitch(target) {
    switchTarget = target;
    switchAnim = 0;
    clearTimeout(player.reloadTimer);   // ganti senjata membatalkan reload (ala CS)
    player.isReloading = false;
    updateUI();
}

// 1 = rifle, 2 = pistol, 3 = shotgun, Q = tukar cepat ke senjata SEBELUMNYA
// (dipanggil handler keyboard)
export function trySwitchKey(key) {
    if (switchAnim >= 0 || meleeT > 0) return;
    const target = key === '1' ? 'rifle'
        : key === '2' ? 'pistol'
            : key === '3' ? 'shotgun'
                : (lastWeapon !== currentWeapon ? lastWeapon
                    : (currentWeapon === 'rifle' ? 'pistol' : 'rifle'));
    if (target !== currentWeapon) startSwitch(target);
}

export function startReload() {
    const w = player[currentWeapon];
    if (player.isReloading || w.mags <= 0 || w.ammo === w.magSize) return;
    if (switchAnim >= 0 || meleeT > 0) return;   // jangan reload saat ganti senjata / memukul
    player.isReloading = true;
    reloadStartTime = Date.now();   // rig tangan reload (updateWeaponVisuals) sinkron dgn timer nyata ini
    playSFX(sfxReload);
    updateUI();
    // Simpan id timer: dibatalkan di resetGame & saat ganti senjata (startSwitch).
    // Durasi EFEKTIF = reloadMs x reloadMul (upgrade shop); rig keyframe membaca
    // player.reloadDurMs yang sama, jadi animasi selalu sinkron dgn timer.
    const dur = CFG.weapons[currentWeapon].reloadMs * (player.reloadMul || 1);
    player.reloadDurMs = dur;
    player.reloadTimer = setTimeout(() => {
        w.mags--;
        w.ammo = w.magSize;
        player.isReloading = false;
        updateUI();
    }, dur);
}

// F = melee. Butuh stamina >= biaya melee; tiap ayunan menguras stamina.
export function tryMelee() {
    if (meleeCd > 0 || switchAnim >= 0 || player.isReloading) return;
    if (stamina < CFG.stamina.meleeCost) return;
    drainStamina(CFG.stamina.meleeCost);
    meleeT = MELEE_TIME; meleeCd = CFG.melee.cooldownSec; meleeHitDone = false;
    playSFX(sfxMelee);   // suara ayunan — berbunyi meski tidak kena zombie
}

// ADS butuh stamina: saat exhausted, toggle ON diabaikan (OFF selalu boleh)
export function toggleAim() {
    isAiming = isAiming ? false : !staExhausted;
}
export function setAiming(v) { isAiming = v; }

// Pukulan melee: bunuh 1 zombie terdekat di kerucut depan (jangkauan pendek).
export function doMeleeHit() {
    camera.getWorldDirection(_dir);
    _dir.y = 0; _dir.normalize();
    let best = -1, bestD = 1e9;
    for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        const dx = z.mesh.position.x - camera.position.x;
        const dz = z.mesh.position.z - camera.position.z;
        const d = Math.hypot(dx, dz);
        if (d > CFG.melee.range) continue;
        if ((dx * _dir.x + dz * _dir.z) / (d || 1) < 0.35) continue;   // ~±70° di depan
        if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
        crosshair.classList.add('hit');
        setTimeout(() => crosshair.classList.remove('hit'), 80);
        spawnDrop(zombies[best].mesh.position);
        killZombie(best);
        updateUI();
    }
}

// --- Timer senjata per frame: animasi ganti (tukar model di tengah) & melee ---
export function updateWeaponTimers(dt) {
    if (switchAnim >= 0) {
        const prev = switchAnim;
        switchAnim += dt;
        if (prev < SWITCH_TIME / 2 && switchAnim >= SWITCH_TIME / 2 && switchTarget) {
            lastWeapon = currentWeapon;   // Q kembali ke senjata ini
            currentWeapon = switchTarget;
            switchTarget = null;
            for (const k in WEAPON_DEF) WEAPON_DEF[k].mesh.visible = k === currentWeapon;
            attachMuzzle(currentWeapon);
            updateUI();
        }
        if (switchAnim >= SWITCH_TIME) switchAnim = -1;
    }
    if (meleeCd > 0) meleeCd -= dt;
    if (meleeT > 0) {
        meleeT -= dt;
        const k = 1 - Math.max(0, meleeT) / MELEE_TIME;
        meleeS = Math.sin(Math.PI * Math.min(1, k));   // profil ayunan 0..1..0
        if (!meleeHitDone && k >= 0.45) { meleeHitDone = true; doMeleeHit(); }
    } else meleeS = 0;
}

// --- Recoil & muzzle flash decay + posisi z senjata (visual) ---
export function updateWeaponState(dt) {
    gunRecoil = Math.max(0, gunRecoil - dt * 6);
    gunHeat = Math.max(0, gunHeat - dt * CFG.weapons.heatCoolPerSec);   // laras mendingin saat jeda menembak
    const def = WEAPON_DEF[currentWeapon];
    // ADS sedikit lebih dekat; melee mendorong senjata ke depan (ayunan)
    def.mesh.position.z = def.baseZ + aimT * 0.8 + gunRecoil * def.kick - 1.9 * meleeS;
    if (muzzleFlash.intensity > 0) muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - dt * 30);
}

// --- Tembak (kiri klik), fire-rate berbasis waktu nyata, per senjata ---
// Peluru & damage identik utk kedua senjata; pistol semi-cepat.
export function updateShooting() {
    const wpn = player[currentWeapon];
    const wcfg = CFG.weapons[currentWeapon];
    if (mouse.isDown && !player.isReloading && switchAnim < 0 && meleeT <= 0
        && Date.now() - player.lastShot > wcfg.fireDelayMs && wpn.ammo > 0) {
        muzzlePoint.getWorldPosition(_tip);   // muzzle senjata aktif

        camera.getWorldDirection(_v3);
        // Arah dasar DIBEKUKAN sebelum kick kamera — semua pelet shotgun satu
        // tarikan pelatuk memakai arah bidik yang sama.
        const bdx = _v3.x, bdy = _v3.y, bdz = _v3.z;
        // Sebar peluru: kerucut acak di ruang kamera (bukan sumbu dunia).
        // Radius = dasar + bloom panas laras; ADS/jongkok mempersempitnya.
        const acc = (isAiming ? CFG.weapons.adsAccuracy : 1) * (crouchedNow ? CFG.weapons.crouchAccuracy : 1);
        // Penalti bergerak (hanya spread, bukan tendangan kamera):
        // jalan -> walkSpreadPenalty, lari EFEKTIF -> sprintSpreadPenalty
        // (stamina habis berarti tidak benar-benar berlari -> penalti jalan biasa)
        const movePen = (keys.w || keys.a || keys.s || keys.d)
            ? (sprintingNow ? CFG.movement.sprintSpreadPenalty : CFG.movement.walkSpreadPenalty) : 1;
        const spread = (CFG.weapons.spreadBase + gunHeat * CFG.weapons.spreadBloom) * acc * movePen;
        _sRight.setFromMatrixColumn(camera.matrixWorld, 0);
        _sUp.setFromMatrixColumn(camera.matrixWorld, 1);

        // Satu tarikan pelatuk = `pellets` peluru (shotgun 7; lainnya tanpa
        // kunci pellets = 1 — jalur lama byte-identik). Tiap pelet dapat sebar
        // tambahan pelletSpread; damage per pelet = bulletDamage biasa.
        const pellets = wcfg.pellets || 1;
        for (let pi = 0; pi < pellets; pi++) {
            const bMesh = new THREE.Mesh(GEO.bullet, MAT.bullet);
            bMesh.position.copy(_tip);
            const sAng = Math.random() * Math.PI * 2;
            const sRad = Math.random() * (spread + (wcfg.pelletSpread || 0));   // bias ke pusat
            _v3.set(bdx, bdy, bdz)
                .addScaledVector(_sRight, Math.cos(sAng) * sRad)
                .addScaledVector(_sUp, Math.sin(sAng) * sRad).normalize();

            // Tracer: bola diregangkan searah laju (visual; hit test tetap titik pusat).
            bMesh.lookAt(_tip.x + _v3.x, _tip.y + _v3.y, _tip.z + _v3.z);
            bMesh.scale.set(1, 1, 8.5);
            scene.add(bMesh);
            // px/py/pz = titik awal segmen sweep hit test. Frame pertama mulai dari
            // MATA player (bug fix point-blank: peluru lahir di ujung laras ~13 unit
            // di depan mata, jadi zombie dalam jarak cakar lahirnya SUDAH terlewati
            // dan mustahil tertembak tanpa segmen mata->laras ini).
            bullets.push({
                mesh: bMesh, dir: _v3.clone(), speed: CFG.weapons.bulletSpeed,
                life: CFG.weapons.bulletLife, first: true,
                px: camera.position.x, py: camera.position.y, pz: camera.position.z
            });
            stats.shots++;   // akurasi dihitung per PELURU (shotgun adil)
        }
        gunHeat = Math.min(1, gunHeat + CFG.weapons.heatPerShot);

        // Recoil menendang kamera: naik + geser acak (lewat euler YXZ yang sama
        // dgn mouse-look, jadi aman — player mengompensasi dgn menarik mouse turun).
        _kickEuler.setFromQuaternion(camera.quaternion);
        _kickEuler.x += wcfg.cameraKick * acc * (0.8 + Math.random() * 0.4);
        _kickEuler.y += (Math.random() - 0.5) * 0.008 * acc;
        _kickEuler.x = Math.min(Math.PI / 2 - 0.1, _kickEuler.x);
        camera.quaternion.setFromEuler(_kickEuler);

        playSFX(currentWeapon === 'pistol' ? sfxPistol : sfxShoot);

        wpn.ammo--;
        player.lastShot = Date.now();
        gunRecoil = 1;
        muzzleFlash.intensity = 4;
        muzzleSprite.rotation.z = Math.random() * 6.28;   // roll acak tiap tembakan
        updateUI();

        if (wpn.ammo === 0 && wpn.mags > 0) startReload();
    }
}

// ----- Visual senjata per frame: ADS, bob, ganti, melee, rig reload -----
// Arah tembak/granat tetap dari pusat kamera -> tidak mengubah mekanik.
// Berjalan tiap frame BAHKAN saat pause (kontrak lama updateDecor).
export function updateWeaponVisuals(dt) {
    if (muzzleSprite) muzzleSprite.material.opacity = Math.min(1, muzzleFlash.intensity / 3);

    aimT += ((isAiming ? 1 : 0) - aimT) * Math.min(1, dt * 12);
    const fov = BASE_FOV / (1 + (AIM_ZOOM - 1) * aimT);
    if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }
    crosshair.style.opacity = 1 - aimT * 0.85;   // crosshair memudar, ganti sight picture

    const D = WEAPON_DEF[currentWeapon];
    const grp = D.mesh;
    // Goyangan senjata halus (x/y; z milik recoil di updateWeaponState) — diredam saat membidik
    const moving = (keys.w || keys.a || keys.s || keys.d) && !isPaused && !isGameOver;
    gunBobT += dt * (moving ? (sprintingNow ? 11 : 7.5) : 2.2);
    const bobA = (moving ? 0.09 : 0.03) * (1 - aimT * 0.8);
    // Animasi ganti senjata: turun lalu naik (model ditukar di tengah, updateWeaponTimers)
    let swOff = 0, swRot = 0;
    if (switchAnim >= 0) {
        const h = SWITCH_TIME / 2;
        const p = switchAnim < h ? switchAnim / h : Math.max(0, 1 - (switchAnim - h) / h);
        swOff = -3.4 * p;
        swRot = 1.0 * p;
    }
    // hip/ADS per senjata dari WEAPON_DEF (adsY = garis pisir tepat pusat layar)
    grp.position.x = D.hipX * (1 - aimT) + Math.sin(gunBobT) * bobA;
    grp.position.y = D.hipY + (D.adsY - D.hipY) * aimT + Math.abs(Math.cos(gunBobT)) * bobA * 1.4 + swOff;

    // Rig reload per senjata -> gunRotX/gunRotZ + gerak tangan kiri/mag/bolt/
    // slide/pump. Waktu KF diskalakan ke durasi reload EFEKTIF terakhir
    // (player.reloadDurMs — sudah termasuk upgrade reloadMul shop).
    const reloadDur = player.reloadDurMs || CFG.weapons[currentWeapon].reloadMs;
    if (player.isReloading && currentWeapon === 'rifle') {
        const rt = (Date.now() - reloadStartTime) * WEAPON_DEF.rifle.kfBase / reloadDur;   // waktu nyata = sinkron setTimeout
        reloadHandPos(RELOAD_KF, rt, leftHand.position);
        // senjata dimiringkan sedikit agar area magazen terlihat (envelope naik-turun)
        const env = Math.min(1, rt / 0.25) * clamp((3 - rt) / 0.3, 0, 1);
        gunRotX = -0.30 * env;
        gunRotZ = 0.10 * env;
        if (rt >= 0.35 && rt < 2.05) {                      // magazen menempel di tangan kiri
            gunMagMesh.position.set(leftHand.position.x, leftHand.position.y - 0.35, leftHand.position.z);
            gunMagMesh.rotation.set(-0.25, 0, 0.35);
        } else {                                            // terpasang di magwell
            gunMagMesh.position.set(MAG_REST.x, MAG_REST.y, MAG_REST.z);
            gunMagMesh.rotation.set(MAG_REST.rx, 0, 0);
        }
        if (rt >= 2.30 && rt < 2.55) boltHandle.position.z = 0.4 + smooth01((rt - 2.30) / 0.25) * 0.72;
        else if (rt >= 2.55 && rt < 2.68) boltHandle.position.z = 1.12 - smooth01((rt - 2.55) / 0.13) * 0.72;
        else boltHandle.position.z = 0.4;
    } else if (player.isReloading && currentWeapon === 'shotgun') {
        const rt = (Date.now() - reloadStartTime) * WEAPON_DEF.shotgun.kfBase / reloadDur;
        reloadHandPos(SHOTGUN_KF, rt, sgLeftHand.position);
        const env = Math.min(1, rt / 0.25) * clamp((2.6 - rt) / 0.3, 0, 1);
        gunRotX = -0.28 * env;
        gunRotZ = 0.10 * env;
        if (rt >= 0.30 && rt < 1.75) {                      // magazen kotak di tangan kiri
            sgMagMesh.position.set(sgLeftHand.position.x, sgLeftHand.position.y - 0.35, sgLeftHand.position.z);
            sgMagMesh.rotation.set(-0.25, 0, 0.35);
        } else {                                            // terpasang di receiver
            sgMagMesh.position.set(SG_MAG_REST.x, SG_MAG_REST.y, SG_MAG_REST.z);
            sgMagMesh.rotation.set(SG_MAG_REST.rx, 0, 0);
        }
        // Rack pump: mundur lalu maju (mengikuti fase KF 2.25-2.38)
        if (rt >= 2.25 && rt < 2.38) sgPump.position.z = SG_PUMP_Z + smooth01((rt - 2.25) / 0.13) * 0.8;
        else if (rt >= 2.38 && rt < 2.5) sgPump.position.z = SG_PUMP_Z + 0.8 - smooth01((rt - 2.38) / 0.12) * 0.8;
        else sgPump.position.z = SG_PUMP_Z;
    } else if (player.isReloading && currentWeapon === 'pistol') {
        const rt = (Date.now() - reloadStartTime) * WEAPON_DEF.pistol.kfBase / reloadDur;
        reloadHandPos(PISTOL_KF, rt, pLeftHand.position);
        const env = Math.min(1, rt / 0.2) * clamp((2.2 - rt) / 0.25, 0, 1);
        gunRotX = -0.22 * env;
        gunRotZ = 0.14 * env;
        if (rt >= 0.28 && rt < 1.5) {                       // magazen pistol di tangan kiri
            pistolMagMesh.position.set(pLeftHand.position.x, pLeftHand.position.y - 0.45, pLeftHand.position.z);
            pistolMagMesh.rotation.set(0.12, 0, 0);
        } else {                                            // terpasang di grip
            pistolMagMesh.position.set(0, -0.72, -0.26);
            pistolMagMesh.rotation.set(0.12, 0, 0);
        }
        if (rt >= 1.75 && rt < 1.95) pistolSlide.position.z = -1.2 + smooth01((rt - 1.75) / 0.2) * 0.55;
        else if (rt >= 1.95 && rt < 2.05) pistolSlide.position.z = -0.65 - smooth01((rt - 1.95) / 0.1) * 0.55;
        else pistolSlide.position.z = -1.2;
    } else {
        // istirahat: SEMUA rig kembali menopang; slide pistol kick kecil saat menembak
        leftHand.position.lerp(LEFT_HAND_REST, Math.min(1, dt * 10));
        pLeftHand.position.lerp(P_LEFT_REST, Math.min(1, dt * 10));
        sgLeftHand.position.lerp(SG_LEFT_REST, Math.min(1, dt * 10));
        gunRotX += (0 - gunRotX) * Math.min(1, dt * 10);
        gunRotZ += (0 - gunRotZ) * Math.min(1, dt * 10);
        gunMagMesh.position.set(MAG_REST.x, MAG_REST.y, MAG_REST.z);
        gunMagMesh.rotation.set(MAG_REST.rx, 0, 0);
        boltHandle.position.z = 0.4;
        pistolMagMesh.position.set(0, -0.72, -0.26);
        pistolMagMesh.rotation.set(0.12, 0, 0);
        pistolSlide.position.z = -1.2 + (currentWeapon === 'pistol' ? Math.min(0.5, gunRecoil * 0.5) : 0);
        sgMagMesh.position.set(SG_MAG_REST.x, SG_MAG_REST.y, SG_MAG_REST.z);
        sgMagMesh.rotation.set(SG_MAG_REST.rx, 0, 0);
        // Pump ikut mundur sesaat mengikuti recoil tembakan (kesan rack)
        sgPump.position.z = SG_PUMP_Z + (currentWeapon === 'shotgun' ? Math.min(0.6, gunRecoil * 0.6) : 0);
    }

    // Melee: ayunan popor (rifle & shotgun, sabet menyamping) / pistol-whip (ke bawah)
    let mRotX = 0, mRotY = 0;
    if (meleeS > 0) {
        if (currentWeapon !== 'pistol') { mRotY = 1.15 * meleeS; mRotX = 0.35 * meleeS; }
        else mRotX = -1.2 * meleeS;
    }
    grp.rotation.x = gunRotX - swRot + mRotX;
    grp.rotation.y = mRotY;
    grp.rotation.z = gunRotZ;

    // Lengan bawah kiri: rentangkan siku (anchor) -> pergelangan (per senjata)
    placeLimb(leftForearm, -1.8, -3.4, -0.5,
        leftHand.position.x - 0.05, leftHand.position.y - 0.15, leftHand.position.z + 0.55);
    placeLimb(pLeftForearm, -1.7, -3.5, 0.3,
        pLeftHand.position.x - 0.15, pLeftHand.position.y - 0.3, pLeftHand.position.z + 0.35);
    placeLimb(sgLeftForearm, -1.8, -3.4, -0.4,
        sgLeftHand.position.x - 0.05, sgLeftHand.position.y - 0.15, sgLeftHand.position.z + 0.55);
}

// Bagian senjata dari resetGame: kembali ke rifle, batalkan animasi & reload
export function resetWeapons() {
    clearTimeout(player.reloadTimer);   // bug fix: reload lama jangan selesai di game baru
    player.isReloading = false;
    currentWeapon = 'rifle';
    lastWeapon = 'pistol';
    switchAnim = -1; switchTarget = null;
    meleeT = 0; meleeCd = 0; meleeS = 0;
    for (const k in WEAPON_DEF) {
        WEAPON_DEF[k].mesh.visible = k === 'rifle';
        WEAPON_DEF[k].mesh.rotation.set(0, 0, 0);
    }
    attachMuzzle('rifle');
    gunRotX = 0; gunRotZ = 0;
    gunHeat = 0;
}
