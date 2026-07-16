// Sistem senjata: rifle ("Assault Rifle", model Pindad SS2-V2) & pistol.
// Meliputi: model + rig tangan CS-style, ganti senjata, reload (mekanik timer
// nyata + animasi keyframe), melee, dan blok MENEMBAK (spread/recoil/heat).
// Peluru identik utk kedua senjata; hit test-nya di robots.js.

import { CFG } from '../core/config.js';
import {
    player, keys, mouse, bullets, robots, isPaused, isGameOver, stats,
    GEO, MAT, _dir, _tip, _v3, _sRight, _sUp, _kickEuler
} from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { aimPoint } from '../core/input.js';   // batas jarak peluru = titik kursor (2026-07-16)
import { avatarGunTip } from './playerAvatar.js';
import { makeTexture, speckle } from '../utils/textures.js';
import { rand, clamp, smooth01 } from '../utils/math.js';
import { playSFX, sfxShoot, sfxShotgun, sfxPistol, sfxReload, sfxMelee, sfxSwitch, sfxEmpty, sfxPickup } from '../utils/sfx.js';
import { crosshair, showPickup, medkitBar, medkitBarFill } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { stamina, staExhausted, drainStamina, dodgeActive } from './player.js';
import { killRobot } from './robots.js';
import { spawnBloodBurst } from './effects.js';   // muncratan coolant robot yang selamat dari sabetan
import { spawnDrop, MEDKIT_MAT } from './drops.js';
import { buildGrenadeMesh } from './grenades.js';   // dipakai ulang utk peluru Grenade Launcher

// ----- Status senjata (live export; reassign hanya di modul ini) -----
export let currentWeapon = 'rifle';                 // 'rifle' | 'pistol' | 'shotgun' | 'launcher'
export let isAiming = false;                        // ADS (klik kanan = toggle)
export let switchAnim = -1;                         // -1 = tidak sedang ganti
export let meleeT = 0;
// grenadeMode: DORMAN sejak 2026-07-11 (granat lempar diganti weapon "Grenade
// Launcher" di slot senjata). Tetap diekspor & selalu false supaya guard lama
// `if (grenadeMode || medkitMode)` di modul ini + hud/input tetap benar tanpa edit.
export let grenadeMode = false;
// Mode medkit (tombol 4): medkit DIPEGANG di tangan; TAHAN klik kiri
// medkitUseSec detik (channel) untuk memakainya (sembuh 70%). Lepas klik = batal.
export let medkitMode = false;

let aimT = 0;   // aimT 0..1 (transisi ADS dihaluskan)
const BASE_FOV = 70, AIM_ZOOM = 1.2;   // zoom 20% saat membidik
let switchTarget = null;
const SWITCH_TIME = 0.5;
// Melee (F): pukul dgn popor senjata aktif; 1x pukul membunuh robot
let meleeCd = 0, meleeS = 0, meleeHitDone = false;
export const MELEE_TIME = 0.45;   // durasi ayunan (animasi; cooldown & range dari CFG.melee) — diekspor: playerAvatar membaca utk animasi sabetan pedang
// Arah tebasan melee (2026-07-16): AUTO ke robot terjangkau TERDEKAT saat F
// ditekan (character otomatis MENGHADAP robot itu), atau ke arah kursor bila tak
// ada robot dekat. Dipakai doMeleeHit (kerucut hit) + playerAvatar (hadap badan).
export let meleeDirX = 0, meleeDirZ = -1;
export let gunRecoil = 0;   // kickback senjata (visual; 1 saat menembak -> meluruh dt·6; dibaca playerAvatar utk hentakan laras naik)
let gunHeat = 0;        // "panas laras" 0..1: naik tiap tembakan, dingin saat jeda —
                        // memperbesar spread saat menembak beruntun (bloom recoil)
let gunBobT = 0;        // fase goyangan senjata saat berjalan (visual)
let gunRotX = 0, gunRotZ = 0;                // rotasi dasar senjata (rig reload)
let reloadStartTime = 0;          // waktu nyata -> sinkron dgn setTimeout reload
export let reloadSfxNode = null;  // node audio reload yang sedang diputar (utk dihentikan bila reload dibatalkan)
let emptyReady = true;            // boleh bunyi klik kosong (di-arm ulang saat pelatuk dilepas)
let medkitChannel = 0;   // detik menahan klik kiri saat mode medkit (0 = belum/lepas)

// Rig & bagian yang dianimasikan
let fpsHolder = null;   // induk SEMUA rig viewmodel FPS — permanen tersembunyi (top-down)
export let gunMesh = null, pistolMesh = null, shotgunMesh = null, launcherMesh = null;
let medkitHandMesh = null;                            // tangan+medkit (tombol 4)
let mkLid = null, mkWorkHand = null;                  // tutup berengsel + tangan kanan penekan (animasi channel)
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
    launcher: {
        name: 'Grenade Launcher', hipX: 3, hipY: -2.5, adsY: -0.6, baseZ: -6,
        kick: 3.4, muzzle: [0, 0.15, -6.6], muzzleScale: 1.3, kfBase: 2.6,
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
    // ===== TOP-DOWN (pivot 2026-07-11): seluruh rig viewmodel FPS (senjata +
    // tangan) tetap DIBANGUN — semua timer/logika reload/switch/lempar/medkit
    // membaca transformnya — tapi dimasukkan ke `fpsHolder` yang PERMANEN
    // tersembunyi (visible=false pada INDUK kebal terhadap tulisan
    // mesh.visible=true milik startSwitch/applyStartLoadout pada anak-anaknya).
    // Visual senjata yang terlihat kini milik avatar (playerAvatar.js);
    // kilat muzzle & sprite-nya di-parent ke avatarGunTip di bawah. =====
    fpsHolder = new THREE.Group();
    fpsHolder.visible = false;
    camera.add(fpsHolder);

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
    // --- Receiver dua tingkat (siluet SS2 lebih ramping: upper ber-dust-cover
    // di atas lower yang tipis, bukan satu balok gemuk) ---
    mkPart(new THREE.BoxGeometry(0.66, 0.46, 3.4), steel, 0, 0.26, -0.3);                         // upper receiver
    mkPart(new THREE.BoxGeometry(0.7, 0.44, 2.9), steel, 0, -0.17, -0.15);                        // lower receiver
    mkPart(new THREE.BoxGeometry(0.05, 0.28, 1.0), steelDark, 0.34, 0.26, 0.25);                  // garis port ejeksi (kanan)
    mkPart(new THREE.BoxGeometry(0.06, 0.06, 1.4), steelDark, 0.34, 0.15, 0.75);                  // alur tuas kokang
    mkPart(new THREE.BoxGeometry(0.1, 0.12, 0.5), steelDark, -0.36, -0.04, 0.55);                 // tuas selektor (kiri)
    // Magwell menyatu ke lower + bibir bawah
    mkPart(new THREE.BoxGeometry(0.66, 0.5, 1.0), steel, 0, -0.55, -1.1);
    mkPart(new THREE.BoxGeometry(0.72, 0.14, 1.06), steelDark, 0, -0.76, -1.1);
    // Carry handle khas SS2 (ala M16): dua dinding samping + palang atas —
    // kanal di antaranya = jalur pandang ADS, dgn takik peep di belakang
    for (const sx of [-0.18, 0.18]) {
        mkPart(new THREE.BoxGeometry(0.09, 0.44, 0.55), steelDark, sx, 0.66, 0.5);
        mkPart(new THREE.BoxGeometry(0.09, 0.44, 0.55), steelDark, sx, 0.66, -1.3);
    }
    mkPart(new THREE.BoxGeometry(0.44, 0.16, 2.6), steelDark, 0, 0.95, -0.4);                     // palang atas handle
    mkPart(new THREE.BoxGeometry(0.28, 0.07, 2.6), steel, 0, 1.06, -0.4);                         // rel tipis di punggung handle
    mkPart(new THREE.BoxGeometry(0.07, 0.2, 0.24), steelDark, -0.11, 0.72, 0.42);                 // peep belakang (garis ADS — jangan geser)
    mkPart(new THREE.BoxGeometry(0.07, 0.2, 0.24), steelDark, 0.11, 0.72, 0.42);
    // Handguard polymer ramping: rusuk lebih tipis-rapat + cincin depan mengecil
    mkPart(new THREE.BoxGeometry(0.66, 0.72, 2.5), polymer, 0, -0.02, -3.15);
    for (let i = 0; i < 7; i++)
        mkPart(new THREE.BoxGeometry(0.72, 0.78, 0.09), polymer, 0, -0.02, -2.2 - i * 0.36);
    mkPart(new THREE.BoxGeometry(0.54, 0.6, 0.45), polymer, 0, -0.02, -4.55);                     // moncong handguard mengecil
    mkPart(new THREE.CylinderGeometry(0.12, 0.13, 2.9, 10), steelDark, 0, 0.1, -5.5, Math.PI / 2);// laras terbuka
    mkPart(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8), steelDark, 0, 0.34, -4.9, Math.PI / 2);// tabung gas
    mkPart(new THREE.CylinderGeometry(0.19, 0.22, 0.95, 10), steelDark, 0, 0.1, -7.0, Math.PI / 2);// flash hider birdcage
    mkPart(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 10), steelDark, 0, 0.1, -6.5, Math.PI / 2);// cincin pangkalnya
    // Pisir depan bersayap dekat muzzle + swivel sling kecil di bawahnya
    // (tinggi blade y 0.5 = garis ADS lama — jangan geser)
    mkPart(new THREE.BoxGeometry(0.1, 0.55, 0.1), steelDark, 0, 0.5, -6.25);
    mkPart(new THREE.BoxGeometry(0.08, 0.5, 0.3), steelDark, -0.17, 0.5, -6.25);
    mkPart(new THREE.BoxGeometry(0.08, 0.5, 0.3), steelDark, 0.17, 0.5, -6.25);
    mkPart(new THREE.BoxGeometry(0.06, 0.2, 0.12), steelDark, 0, -0.12, -6.25);
    // Magazen KURVA (banana mag — 3 segmen miring progresif, bukan balok lurus).
    // Group dianimasikan reload; puncak segmen atas rata dgn bibir magwell.
    gunMagMesh = new THREE.Group();
    for (const [my, mz, mrx] of [[0.15, 0, 0.12], [-0.45, -0.17, 0.28], [-1.0, -0.42, 0.44]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.84), steel);
        seg.position.set(0, my, mz);
        seg.rotation.x = mrx;
        gunMagMesh.add(seg);
    }
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.16, 0.95), steelDark);
    magBase.position.set(0, -1.42, -0.58);
    magBase.rotation.x = 0.48;
    gunMagMesh.add(magBase);
    gunMagMesh.position.set(MAG_REST.x, MAG_REST.y, MAG_REST.z);
    gunMagMesh.rotation.x = MAG_REST.rx;
    gunMesh.add(gunMagMesh);
    // Grip bersudut + punggung atas + pelindung pelatuk + bilah pelatuk
    mkPart(new THREE.BoxGeometry(0.46, 1.0, 0.55), polymer, 0, -0.95, 0.7, 0.30);
    mkPart(new THREE.BoxGeometry(0.5, 0.2, 0.62), polymer, 0, -0.48, 0.64, 0.3);
    mkPart(new THREE.BoxGeometry(0.14, 0.42, 1.02), steelDark, 0, -0.62, 1.3);
    mkPart(new THREE.BoxGeometry(0.07, 0.28, 0.09), steelDark, 0, -0.5, 1.12, 0.25);
    // Popor lipat rangka (skeleton stock): tabung atas + pelat popor + strut
    // diagonal -> jendela segitiga khas SS2-V2; + bantalan karet & cheek riser
    mkPart(new THREE.BoxGeometry(0.26, 0.26, 2.2), polymer, 0, 0.1, 2.5);
    mkPart(new THREE.BoxGeometry(0.3, 1.45, 0.3), polymer, 0, -0.42, 3.5);
    mkPart(new THREE.BoxGeometry(0.34, 1.55, 0.16), steelDark, 0, -0.42, 3.68);                   // bantalan popor karet
    mkPart(new THREE.BoxGeometry(0.24, 0.22, 1.1), polymer, 0, 0.29, 2.8);                        // cheek riser
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1), polymer);
    placeLimb(strut, 0, -0.5, 1.4, 0, -1.05, 3.42);
    gunMesh.add(strut);
    boltHandle = mkPart(new THREE.BoxGeometry(0.44, 0.16, 0.46), steel, 0.45, 0.15, 0.4);         // tuas kokang (ditarik saat reload)

    // ----- Tangan & lengan karakter (gaya CS: lengan penuh dari sudut layar ke senjata,
    // sarung tangan taktis + jari mencengkeram; ikut bob/ADS/recoil via gunMesh) -----
    const glove = new THREE.MeshPhongMaterial({ color: 0x3a3d42, shininess: 16, specular: 0x22242a });
    const sleeve = new THREE.MeshPhongMaterial({ color: 0x4a4d3c, shininess: 8, specular: 0x181a14 });
    // Kulit (sarung tangan TANPA JARI ala referensi CS: ruas ujung jari &
    // pergelangan telanjang). Phong polos = program shader sama dgn glove.
    const skin = new THREE.MeshPhongMaterial({ color: 0xd09a66, shininess: 10, specular: 0x241a12 });

    // Jari yang MELINGKAR (overhaul 2026-07-10): rangkaian ruas kotak kecil
    // tangensial pada busur — jari benar-benar membungkus handguard/pump/grip,
    // bukan balok lurus menempel. wrapZ=true: busur di bidang X-Y (benda
    // horizontal spt handguard); false: busur di bidang X-Z (grip vertikal).
    // tipMat (opsional): material 2 ruas TERAKHIR (ujung jari kulit).
    const wrapFinger = (parent, mat, cx, cy, cz, r, a0, a1, seg, thick, wrapZ, tipMat) => {
        const L = Math.abs(a1 - a0) * r / (seg - 1) * 1.3;   // ruas menutup celah busur
        for (let k = 0; k < seg; k++) {
            const a = a0 + (a1 - a0) * (k / (seg - 1));
            const m = tipMat && k >= seg - 2 ? tipMat : mat;
            const b = new THREE.Mesh(
                wrapZ ? new THREE.BoxGeometry(thick, L, thick) : new THREE.BoxGeometry(L, thick, thick),
                m);
            if (wrapZ) {
                b.position.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz);
                b.rotation.z = a;
            } else {
                b.position.set(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
                b.rotation.y = a + Math.PI / 2;
            }
            parent.add(b);
        }
    };

    // --- Tangan kanan: menggenggam pistol grip (statis; tetap pegang saat reload)
    rightArm = new THREE.Group();
    const gripHand = new THREE.Group();               // mengikuti kemiringan grip
    gripHand.position.set(0, -0.95, 0.72);
    gripHand.rotation.z = 0.25;
    const palmR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.85, 0.6), glove);
    palmR.position.set(0.3, -0.05, 0);                // telapak di sisi kanan grip
    gripHand.add(palmR);
    // Tiga jari membungkus depan grip (busur X-Z), bertingkat ke bawah; ujung kulit
    for (let i = 0; i < 3; i++)
        wrapFinger(gripHand, glove, 0, 0.24 - i * 0.24, 0.02, 0.34, -0.15, -2.85, 4, 0.16, false, skin);
    const trigF = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), glove);
    trigF.position.set(0.08, 0.55, -0.32);            // telunjuk lurus ke pelatuk (trigger discipline)
    trigF.rotation.x = 0.35;
    gripHand.add(trigF);
    const thumbR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.2), glove);
    thumbR.position.set(0.24, 0.4, 0.1);              // ibu jari mengait sisi atas
    thumbR.rotation.x = -0.2;
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

    // --- Tangan kiri OVERHAND (revisi 2026-07-10, mengikuti referensi user ala
    // viewmodel CS): PUNGGUNG TANGAN menghadap kamera di sisi dekat handguard,
    // empat jari MENYAMPIR DI ATAS handguard dari sisi dekat ke sisi jauh
    // (2 ruas ujung berkulit = sarung tangan tanpa jari), ibu jari menyelip di
    // sisi dekat-bawah mengarah muzzle, pergelangan kulit + manset turun ke
    // kiri-bawah. Group ini yang dianimasikan penuh saat reload. Pusat busur =
    // penampang handguard (leftHand-lokal (0, 0.33, ·), radius 0.5).
    leftHand = new THREE.Group();
    const backL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 1.05), glove);
    backL.position.set(-0.44, 0.22, -0.05);           // punggung tangan (sisi kamera)
    backL.rotation.z = 0.3;
    leftHand.add(backL);
    const knuckL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 1.05), glove);
    knuckL.position.set(-0.3, 0.6, -0.05);            // gugusan buku jari di tepi atas
    knuckL.rotation.z = 0.62;
    leftHand.add(knuckL);
    for (let i = 0; i < 4; i++)                       // jari menyampir dekat -> atas -> jauh
        wrapFinger(leftHand, glove, 0, 0.33, -0.44 + i * 0.26, 0.5, 2.5, 0.15, 4, 0.16, true, skin);
    const thumbL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.62), glove);
    thumbL.position.set(-0.48, -0.1, -0.5);           // ibu jari menyelip ke arah muzzle
    thumbL.rotation.set(-0.25, 0, 0.35);
    leftHand.add(thumbL);
    const thumbTipL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.3), skin);
    thumbTipL.position.set(-0.44, -0.2, -0.9);        // ujung ibu jari berkulit
    thumbTipL.rotation.set(-0.35, 0, 0.3);
    leftHand.add(thumbTipL);
    const palmHeel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.95), glove);
    palmHeel.position.set(-0.42, -0.28, 0.05);        // pangkal telapak menutup bawah-dekat
    palmHeel.rotation.z = 0.15;
    leftHand.add(palmHeel);
    const wristL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.5), skin);
    wristL.position.set(-0.42, -0.55, 0.42);          // pergelangan telanjang (ala referensi)
    wristL.rotation.z = 0.2;
    leftHand.add(wristL);
    const cuffL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.5), sleeve);
    cuffL.position.set(-0.45, -0.8, 0.72);            // manset lengan di bawah pergelangan
    cuffL.rotation.z = 0.25;
    leftHand.add(cuffL);
    leftHand.position.copy(LEFT_HAND_REST);
    gunMesh.add(leftHand);
    // Lengan bawah kiri DINAMIS: direntangkan siku->pergelangan tiap frame
    // (updateWeaponVisuals), jadi lengan tetap tersambung saat tangan reload.
    leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1), sleeve);
    gunMesh.add(leftForearm);

    // ----- Pistol (secondary; parented ke kamera, tersembunyi sampai dipilih).
    // Overhaul 2026-07-10: slide jadi GROUP komposit (serrasi, port ejeksi,
    // PISIR ikut slide — realistis saat ditarik; rig hanya menulis .position.z
    // jadi kontrak animasi tak berubah), rangka ber-rail, pelindung pelatuk
    // berbentuk lingkar utuh + bilah pelatuk, hammer, panel grip. -----
    pistolMesh = new THREE.Group();
    pistolSlide = new THREE.Group();                  // ditarik saat reload, kick saat nembak
    const pSlidePart = (geo, mat, x, y, z, rx = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = rx;
        pistolSlide.add(m);
        return m;
    };
    pSlidePart(new THREE.BoxGeometry(0.46, 0.4, 2.55), steel, 0, 0, 0);                    // badan slide
    pSlidePart(new THREE.BoxGeometry(0.3, 0.09, 2.5), steelDark, 0, 0.23, 0);              // punggung chamfer
    for (let k = 0; k < 5; k++)                                                            // serrasi belakang
        pSlidePart(new THREE.BoxGeometry(0.48, 0.3, 0.045), steelDark, 0, 0, 0.85 + k * 0.09);
    pSlidePart(new THREE.BoxGeometry(0.05, 0.22, 0.7), steelDark, 0.23, 0.06, -0.45);      // port ejeksi (kanan)
    pSlidePart(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), steelDark, 0, 0, -1.3, Math.PI / 2); // moncong laras
    // Pisir DI ATAS SLIDE (posisi absolut sama dgn kalibrasi ADS lama)
    pSlidePart(new THREE.BoxGeometry(0.08, 0.16, 0.1), steelDark, 0, 0.28, -1.1);          // bilah depan
    pSlidePart(new THREE.BoxGeometry(0.07, 0.14, 0.12), steelDark, -0.1, 0.28, 1.15);      // takik belakang
    pSlidePart(new THREE.BoxGeometry(0.07, 0.14, 0.12), steelDark, 0.1, 0.28, 1.15);
    pistolSlide.position.set(0, 0.42, -1.2);
    pistolMesh.add(pistolSlide);
    const pPart = (geo, mat, x, y, z, rx = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = rx;
        pistolMesh.add(m);
        return m;
    };
    pPart(new THREE.BoxGeometry(0.42, 0.32, 2.15), steelDark, 0, 0.06, -1.0);              // rangka
    pPart(new THREE.BoxGeometry(0.44, 0.07, 0.28), steelDark, 0, -0.06, -1.7);             // rusuk rail depan
    pPart(new THREE.BoxGeometry(0.44, 0.07, 0.28), steelDark, 0, -0.06, -1.35);
    pPart(new THREE.BoxGeometry(0.36, 0.12, 0.42), steelDark, 0, 0.1, 0.18);               // beavertail
    pPart(new THREE.BoxGeometry(0.1, 0.16, 0.14), steelDark, 0, 0.4, 0.12, 0.4);           // hammer
    // Pelindung pelatuk = lingkar utuh (palang bawah + riser depan) + bilah pelatuk
    pPart(new THREE.BoxGeometry(0.1, 0.09, 0.66), steelDark, 0, -0.4, -0.7);
    pPart(new THREE.BoxGeometry(0.1, 0.32, 0.09), steelDark, 0, -0.26, -1.0);
    pPart(new THREE.BoxGeometry(0.07, 0.26, 0.07), steel, 0, -0.22, -0.58, 0.2);           // pelatuk
    // Grip: badan + panel polymer dua sisi + alur jari depan + flare magwell
    pPart(new THREE.BoxGeometry(0.42, 1.12, 0.56), steelDark, 0, -0.5, -0.18, 0.12);
    pPart(new THREE.BoxGeometry(0.05, 0.85, 0.46), polymer, -0.22, -0.48, -0.2, 0.12);
    pPart(new THREE.BoxGeometry(0.05, 0.85, 0.46), polymer, 0.22, -0.48, -0.2, 0.12);
    pPart(new THREE.BoxGeometry(0.38, 0.07, 0.07), steelDark, 0, -0.35, -0.47, 0.12);
    pPart(new THREE.BoxGeometry(0.38, 0.07, 0.07), steelDark, 0, -0.58, -0.5, 0.12);
    pPart(new THREE.BoxGeometry(0.48, 0.15, 0.62), steelDark, 0, -1.03, -0.25, 0.12);
    // Magazen pistol (GROUP: badan + pelat alas; keluar-masuk grip saat reload)
    pistolMagMesh = new THREE.Group();
    const pMagBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.92, 0.4), steel);
    pistolMagMesh.add(pMagBody);
    const pMagBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.52), steelDark);
    pMagBase.position.set(0, -0.51, -0.03);
    pistolMagMesh.add(pMagBase);
    pistolMagMesh.position.set(0, -0.72, -0.26);
    pistolMagMesh.rotation.x = 0.12;
    pistolMesh.add(pistolMagMesh);
    pistolMuzzle = new THREE.Object3D();
    pistolMuzzle.position.set(0, 0.42, -2.7);
    pistolMesh.add(pistolMuzzle);

    // Tangan kanan pistol: jari membungkus depan grip (busur), telunjuk lurus
    // di luar pelindung pelatuk, ibu jari mengait sisi atas.
    const pGripHand = new THREE.Group();
    pGripHand.position.set(0, -0.5, -0.2);
    pGripHand.rotation.x = 0.12;
    const pPalm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.5), glove);
    pPalm.position.set(0.27, -0.05, 0.02);
    pGripHand.add(pPalm);
    for (let i = 0; i < 3; i++)
        wrapFinger(pGripHand, glove, 0, 0.2 - i * 0.22, -0.02, 0.3, -0.2, -2.8, 4, 0.15, false, skin);
    const pThumb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.18), glove);
    pThumb.position.set(0.22, 0.3, 0.12);
    pThumb.rotation.x = -0.15;
    pGripHand.add(pThumb);
    const pTrig = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.42), glove);
    pTrig.position.set(0.08, 0.42, -0.5);
    pTrig.rotation.x = 0.25;
    pGripHand.add(pTrig);
    pistolMesh.add(pGripHand);
    const pCuffR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.45), sleeve);
    pCuffR.position.set(0.32, -1.28, 0.5);
    pistolMesh.add(pCuffR);
    const pForeR = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1), sleeve);
    placeLimb(pForeR, 0.32, -1.3, 0.55, 1.6, -3.7, 2.8);
    pistolMesh.add(pForeR);
    // Tangan kiri pendukung (stance dua tangan, PALING terlihat dari kamera):
    // telapak menangkup sisi kiri grip, jari membungkus jari kanan dari depan,
    // IBU JARI LURUS KE DEPAN menyusuri rangka (thumbs-forward, khas stance nyata).
    pLeftHand = new THREE.Group();
    const pPalmL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.6), glove);
    pPalmL.position.set(-0.12, 0.0, 0.02);
    pLeftHand.add(pPalmL);
    for (let i = 0; i < 3; i++)
        wrapFinger(pLeftHand, glove, 0.1, 0.24 - i * 0.22, -0.08, 0.36, -0.35, -2.9, 4, 0.15, false, skin);
    const pThumbL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.55), glove);
    pThumbL.position.set(-0.28, 0.55, -0.55);         // ruas pangkal menyusuri rangka
    pLeftHand.add(pThumbL);
    const pThumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.32), glove);
    pThumbTip.position.set(-0.26, 0.57, -0.95);       // ujung ibu jari menunjuk muzzle
    pLeftHand.add(pThumbTip);
    const pCuffL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.4), sleeve);
    pCuffL.position.set(-0.2, -0.35, 0.4);
    pLeftHand.add(pCuffL);
    pLeftHand.position.copy(P_LEFT_REST);
    pistolMesh.add(pLeftHand);
    pLeftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1), sleeve);
    pistolMesh.add(pLeftForearm);

    pistolMesh.position.set(2.6, -2.3, -5);
    pistolMesh.visible = false;
    fpsHolder.add(pistolMesh);

    // ----- Shotgun (pump-action ber-magazen kotak). Overhaul 2026-07-10:
    // receiver ber-port ejeksi + tutup atas mengecil, rib bidik di atas laras,
    // klem laras-tabung, PUMP jadi GROUP berrusuk (rig menulis .position.z —
    // kontrak sama), popor berkomb + bantalan karet, pelatuk + lingkar utuh. -----
    shotgunMesh = new THREE.Group();
    const sgPart = (geo, mat, x, y, z, rx = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = rx; m.rotation.z = rz;
        shotgunMesh.add(m);
        return m;
    };
    sgPart(new THREE.BoxGeometry(0.68, 0.82, 2.7), steel, 0, -0.04, 0.1);                          // receiver
    sgPart(new THREE.BoxGeometry(0.52, 0.24, 2.7), steel, 0, 0.44, 0.1);                           // tutup atas mengecil
    sgPart(new THREE.BoxGeometry(0.05, 0.3, 1.05), steelDark, 0.35, 0.0, -0.15);                   // port ejeksi (kanan)
    sgPart(new THREE.CylinderGeometry(0.13, 0.13, 5.4, 10), steelDark, 0, 0.15, -4.0, Math.PI / 2); // laras
    sgPart(new THREE.BoxGeometry(0.14, 0.05, 4.9), steelDark, 0, 0.34, -3.95);                      // rib bidik di atas laras
    sgPart(new THREE.CylinderGeometry(0.1, 0.1, 4.6, 8), steelDark, 0, -0.22, -3.5, Math.PI / 2);   // tabung magasin bawah
    sgPart(new THREE.BoxGeometry(0.32, 0.62, 0.16), steelDark, 0, -0.03, -5.75);                    // klem laras-tabung
    sgPart(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 10), steel, 0, 0.15, -6.6, Math.PI / 2);    // crown muzzle
    // Pump GROUP berrusuk (ditarik saat reload; rig menulis .position.z)
    sgPump = new THREE.Group();
    const sgPumpBody = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.6, 1.45), polymer);
    sgPump.add(sgPumpBody);
    for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.68, 0.08), polymer);
        rib.position.z = -0.48 + i * 0.32;
        sgPump.add(rib);
    }
    const sgPumpNose = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.24), polymer);
    sgPumpNose.position.z = -0.82;                     // moncong pump mengecil
    sgPump.add(sgPumpNose);
    sgPump.position.set(0, -0.05, SG_PUMP_Z);
    shotgunMesh.add(sgPump);
    // Pisir: bead depan + takik belakang (posisi = garis ADS lama — jangan geser)
    sgPart(new THREE.BoxGeometry(0.1, 0.16, 0.14), steelDark, 0, 0.52, -6.45);
    sgPart(new THREE.BoxGeometry(0.16, 0.14, 0.35), steelDark, 0, 0.5, 0.9);
    // Magazen kotak (GROUP: badan + pelat alas)
    sgMagMesh = new THREE.Group();
    const sgMagBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.15, 0.72), steel);
    sgMagMesh.add(sgMagBody);
    const sgMagBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.8), steelDark);
    sgMagBase.position.y = -0.62;
    sgMagMesh.add(sgMagBase);
    sgMagMesh.position.set(SG_MAG_REST.x, SG_MAG_REST.y, SG_MAG_REST.z);
    sgMagMesh.rotation.x = SG_MAG_REST.rx;
    shotgunMesh.add(sgMagMesh);
    // Grip + popor berkomb + bantalan karet + pelatuk
    sgPart(new THREE.BoxGeometry(0.46, 0.92, 0.62), polymer, 0, -0.85, 0.95, 0.3);                 // grip
    sgPart(new THREE.BoxGeometry(0.46, 0.5, 2.0), polymer, 0, 0.08, 2.4, 0.05);                    // komb atas popor
    sgPart(new THREE.BoxGeometry(0.5, 0.88, 1.75), polymer, 0, -0.42, 2.6, 0.16);                  // badan popor menurun
    sgPart(new THREE.BoxGeometry(0.54, 1.05, 0.18), steelDark, 0, -0.32, 3.56, 0.1);               // bantalan karet
    sgPart(new THREE.BoxGeometry(0.12, 0.09, 0.6), steelDark, 0, -0.76, 0.32);                     // lingkar pelatuk bawah
    sgPart(new THREE.BoxGeometry(0.12, 0.34, 0.09), steelDark, 0, -0.62, 0.04);                    // riser depan lingkar
    sgPart(new THREE.BoxGeometry(0.07, 0.26, 0.07), steel, 0, -0.58, 0.28, 0.2);                   // pelatuk
    shotgunMuzzle = new THREE.Object3D();
    shotgunMuzzle.position.set(0, 0.15, -6.9);
    shotgunMesh.add(shotgunMuzzle);
    // Tangan kanan: jari membungkus depan grip (busur) + ibu jari + lengan
    const sgGripHand = new THREE.Group();
    sgGripHand.position.set(0, -0.85, 0.97);
    sgGripHand.rotation.z = 0.25;
    const sgPalm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.58), glove);
    sgPalm.position.set(0.29, -0.05, 0);
    sgGripHand.add(sgPalm);
    for (let i = 0; i < 3; i++)
        wrapFinger(sgGripHand, glove, 0, 0.24 - i * 0.23, 0.0, 0.33, -0.15, -2.85, 4, 0.16, false, skin);
    const sgThumbR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.2), glove);
    sgThumbR.position.set(0.23, 0.38, 0.1);
    sgThumbR.rotation.x = -0.2;
    sgGripHand.add(sgThumbR);
    shotgunMesh.add(sgGripHand);
    const sgCuffR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.5), sleeve);
    sgCuffR.position.set(0.45, -1.3, 1.25);
    shotgunMesh.add(sgCuffR);
    const sgForeR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1), sleeve);
    placeLimb(sgForeR, 0.45, -1.38, 1.3, 1.7, -3.8, 3.3);
    shotgunMesh.add(sgForeR);
    // Tangan kiri di pump: OVERHAND sama dgn rifle (punggung tangan sisi kamera,
    // jari menyampir di atas pump, ujung berkulit; dianimasikan reload + rack).
    // Pusat busur = penampang pump (sgLeftHand-lokal (0, 0.45, ·), radius 0.52).
    sgLeftHand = new THREE.Group();
    const sgBackL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.88, 1.0), glove);
    sgBackL.position.set(-0.46, 0.34, -0.02);
    sgBackL.rotation.z = 0.3;
    sgLeftHand.add(sgBackL);
    const sgKnuckL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 1.0), glove);
    sgKnuckL.position.set(-0.31, 0.72, -0.02);
    sgKnuckL.rotation.z = 0.62;
    sgLeftHand.add(sgKnuckL);
    for (let i = 0; i < 4; i++)
        wrapFinger(sgLeftHand, glove, 0, 0.45, -0.4 + i * 0.24, 0.52, 2.5, 0.15, 4, 0.16, true, skin);
    const sgThumbL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.6), glove);
    sgThumbL.position.set(-0.5, 0.02, -0.45);
    sgThumbL.rotation.set(-0.25, 0, 0.35);
    sgLeftHand.add(sgThumbL);
    const sgThumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.3), skin);
    sgThumbTip.position.set(-0.46, -0.08, -0.82);
    sgThumbTip.rotation.set(-0.35, 0, 0.3);
    sgLeftHand.add(sgThumbTip);
    const sgPalmHeel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.9), glove);
    sgPalmHeel.position.set(-0.44, -0.16, 0.08);
    sgPalmHeel.rotation.z = 0.15;
    sgLeftHand.add(sgPalmHeel);
    const sgWristL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.5), skin);
    sgWristL.position.set(-0.44, -0.45, 0.44);
    sgWristL.rotation.z = 0.2;
    sgLeftHand.add(sgWristL);
    const sgCuffL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.5), sleeve);
    sgCuffL.position.set(-0.47, -0.7, 0.74);
    sgCuffL.rotation.z = 0.25;
    sgLeftHand.add(sgCuffL);
    sgLeftHand.position.copy(SG_LEFT_REST);
    shotgunMesh.add(sgLeftHand);
    sgLeftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 1), sleeve);
    shotgunMesh.add(sgLeftForearm);

    shotgunMesh.position.set(3, -2.5, -6);
    shotgunMesh.visible = false;
    fpsHolder.add(shotgunMesh);

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

    // Muzzle flash: PointLight + sprite radial aditif — DI UJUNG SENAPAN AVATAR
    // (top-down; rig FPS tersembunyi). Lampu menerangi dunia sekitar player.
    muzzleFlash = new THREE.PointLight(0xffaa33, 0, 60, 2);
    muzzleFlash.position.set(0, 0, 0.3);
    avatarGunTip.add(muzzleFlash);

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
    // Sprite kilat REBAH (menghadap ke atas) supaya terlihat dari kamera top-down
    muzzleSprite.position.set(0, 0.55, 0.6);
    muzzleSprite.rotation.x = -Math.PI / 2;
    muzzleSprite.renderOrder = 9;
    avatarGunTip.add(muzzleSprite);

    gunMesh.position.set(3, -2.5, -6);
    fpsHolder.add(gunMesh);
    scene.add(camera);   // pivot player tetap anggota scene (transform dunia valid)

    // ----- Grenade Launcher (senjata slot; peluru MELEDAK saat kena). Model
    // sederhana (rig FPS tersembunyi di top-down): laras gemuk 40mm + receiver +
    // pistol grip + popor; muzzlePoint di ujung laras. -----
    launcherMesh = new THREE.Group();
    const launBody = new THREE.MeshPhongMaterial({ color: 0x2c2f26, shininess: 20, specular: 0x14160f });
    const launMetal = new THREE.MeshPhongMaterial({ color: 0x1a1c18, shininess: 40, specular: 0x20242a });
    const lMk = (geo, mat, x, y, z, rx = 0) => {
        const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx;
        launcherMesh.add(m); return m;
    };
    lMk(new THREE.CylinderGeometry(0.62, 0.66, 6.4, 12), launMetal, 0, 0.15, -3.4, Math.PI / 2);   // laras gemuk 40mm
    lMk(new THREE.CylinderGeometry(0.74, 0.74, 0.5, 12), launMetal, 0, 0.15, -6.5, Math.PI / 2);   // bibir muzzle
    lMk(new THREE.BoxGeometry(1.15, 1.25, 2.8), launBody, 0, 0, -0.4);                             // receiver
    lMk(new THREE.BoxGeometry(0.72, 1.5, 0.8), launBody, 0, -1.1, 0.5);                            // pistol grip
    lMk(new THREE.BoxGeometry(0.5, 0.6, 2.3), launBody, 0, -0.2, 2.0);                             // popor
    const launcherMuzzle = new THREE.Object3D();
    launcherMuzzle.position.set(0, 0.15, -6.6);
    launcherMesh.add(launcherMuzzle);
    launcherMesh.position.set(3, -2.5, -6);
    launcherMesh.visible = false;
    fpsHolder.add(launcherMesh);
    WEAPON_DEF.launcher.mesh = launcherMesh;
    WEAPON_DEF.launcher.muzzlePoint = launcherMuzzle;

    // ----- Tangan medkit (tombol 4), overhaul 2026-07-10: kotak = BAKI +
    // TUTUP BERENGSEL (mkLid, terbuka saat channel memperlihatkan isi: gulungan
    // perban + vial merah) + TANGAN KANAN PENEKAN (mkWorkHand — datang dan
    // memompa isi kotak selama channel; lihat updateWeaponVisuals). Telapak kiri
    // menopang dari bawah. Tersembunyi sampai medkitMode. Material dipakai
    // ulang (MEDKIT_MAT/glove/sleeve) — tak ada program shader baru.
    medkitHandMesh = new THREE.Group();
    const mkBody = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 2.3), MEDKIT_MAT.box);
    mkBody.position.y = -0.08;
    medkitHandMesh.add(mkBody);
    // Isi baki (terlihat saat tutup terbuka): gulungan perban + vial merah
    const mkRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.2, 10), MEDKIT_MAT.box);
    mkRoll.rotation.z = Math.PI / 2;
    mkRoll.position.set(-0.4, 0.3, 0.25);   // puncak gulungan di bawah pelat tutup (tak menembus saat tertutup)
    medkitHandMesh.add(mkRoll);
    const mkVial = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.38), MEDKIT_MAT.cross);
    mkVial.position.set(0.5, 0.4, -0.35);
    medkitHandMesh.add(mkVial);
    // Tutup berengsel di tepi belakang: pelat + rok penutup celah + palang merah
    mkLid = new THREE.Group();
    mkLid.position.set(0, 0.62, 1.15);                 // engsel di tepi belakang-atas
    const mkLidPlate = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 2.3), MEDKIT_MAT.box);
    mkLidPlate.position.set(0, 0, -1.15);
    mkLid.add(mkLidPlate);
    const mkSkirtF = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.3, 0.1), MEDKIT_MAT.box);
    mkSkirtF.position.set(0, -0.18, -2.25);            // rok depan menutup celah baki-tutup
    mkLid.add(mkSkirtF);
    for (const sx of [-1.14, 1.14]) {
        const sk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 2.3), MEDKIT_MAT.box);
        sk.position.set(sx, -0.18, -1.15);
        mkLid.add(sk);
    }
    const mkC1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), MEDKIT_MAT.cross);
    mkC1.position.set(0, 0.12, -1.15);
    mkLid.add(mkC1);
    const mkC2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.6), MEDKIT_MAT.cross);
    mkC2.position.set(0, 0.12, -1.15);
    mkLid.add(mkC2);
    medkitHandMesh.add(mkLid);
    // Telapak kiri menopang dasar + ibu jari sisi dekat + jari sisi jauh
    const mkPalm = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.32, 1.55), glove);
    mkPalm.position.set(0, -0.6, 0.05);
    medkitHandMesh.add(mkPalm);
    for (let i = 0; i < 4; i++) {                      // jari mencengkeram dinding jauh (+x)
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.24), glove);
        f.position.set(1.2, -0.28, -0.5 + i * 0.34);
        medkitHandMesh.add(f);
    }
    const mkThumb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26), glove);
    mkThumb.position.set(-1.2, -0.22, 0.15);           // ibu jari dinding dekat (terlihat kamera)
    medkitHandMesh.add(mkThumb);
    const mkCuff = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.5), sleeve);
    mkCuff.position.set(0.2, -0.98, 0.72);
    medkitHandMesh.add(mkCuff);
    const mkFore = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1), sleeve);
    placeLimb(mkFore, 0.22, -1.05, 0.78, 1.7, -3.6, 3.0);
    medkitHandMesh.add(mkFore);
    // Tangan kanan penekan: telapak + jari menekuk ke bawah + manset — muncul
    // di atas kotak selama channel dan memompa mengikuti irama.
    mkWorkHand = new THREE.Group();
    const wPalm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.95), glove);
    mkWorkHand.add(wPalm);
    for (let i = 0; i < 4; i++) {
        const wf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.2), glove);
        wf.position.set(-0.26 + i * 0.17, -0.16, -0.52);
        wf.rotation.x = -0.55;
        mkWorkHand.add(wf);
    }
    const wThumb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.2), glove);
    wThumb.position.set(0.42, -0.08, -0.05);
    wThumb.rotation.z = -0.4;
    mkWorkHand.add(wThumb);
    const wCuff = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.45), sleeve);
    wCuff.position.set(0.12, 0.12, 0.55);
    mkWorkHand.add(wCuff);
    mkWorkHand.position.set(1.15, 1.5, 0.2);
    mkWorkHand.visible = false;
    medkitHandMesh.add(mkWorkHand);
    medkitHandMesh.position.set(2.6, -2.9, -4.8);
    medkitHandMesh.visible = false;
    fpsHolder.add(medkitHandMesh);

    // Senjata aktif awal sesuai kepemilikan (Survival: pistol; lainnya: rifle).
    // Dijalankan setelah semua mesh + WEAPON_DEF terisi.
    applyStartLoadout();
}

// Top-down: SEMUA senjata menembak dari ujung senapan avatar — muzzlePoint
// selalu avatarGunTip (flash & sprite sudah permanen di sana); hanya skala
// sprite kilat yang mengikuti karakter senjata (WEAPON_DEF.muzzleScale).
export function attachMuzzle(wpn) {
    muzzlePoint = avatarGunTip;
    muzzleSprite.scale.setScalar(WEAPON_DEF[wpn].muzzleScale);
}

// Mulai animasi ganti senjata; model ditukar di tengah animasi (updateWeaponTimers).
export function startSwitch(target) {
    switchTarget = target;
    switchAnim = 0;
    cancelReload();   // ganti senjata membatalkan reload + SUARANYA (ala CS)
    playSFX(sfxSwitch);                 // suara handling saat mulai berganti senjata
    updateUI();
}

// Senjata awal run = slot pertama (player.weapons[0]; Survival pistol, Campaign
// rifle). Dipakai initWeapons (boot) & resetWeapons (restart) supaya jalur boot
// dan restart konsisten.
function pickStartWeapon() {
    const W = player.weapons || [];
    return W[0] || 'pistol';
}

// Terapkan senjata aktif awal: set currentWeapon (slot 0) + visibilitas mesh +
// muzzle; lastWeapon = slot lain (bookkeeping Q).
function applyStartLoadout() {
    medkitMode = false; medkitChannel = 0;
    if (medkitHandMesh) medkitHandMesh.visible = false;
    currentWeapon = pickStartWeapon();
    lastWeapon = (player.weapons && player.weapons[1]) || currentWeapon;   // slot lain (fallback Q)
    for (const k in WEAPON_DEF) WEAPON_DEF[k].mesh.visible = (k === currentWeapon);
    attachMuzzle(currentWeapon);
}

// Tombol senjata: 1/2/3 = slot senjata 0/1/2 (player.weapons, maks 3), Q = putar
// ke slot terisi berikutnya. Slot kosong diabaikan. Tombol 4 (Medkit) ditangani
// terpisah (equipMedkit). (Granat lempar dihapus 2026-07-11.)
export function trySwitchKey(key) {
    if (switchAnim >= 0 || meleeT > 0) return;
    const W = player.weapons || [];
    let target;
    if (key === '1') target = W[0];
    else if (key === '2') target = W[1];
    else if (key === '3') target = W[2];
    else {   // Q = putar ke senjata terisi berikutnya
        const idx = W.indexOf(currentWeapon);
        for (let n = 1; n <= W.length; n++) { const t = W[(idx + n) % W.length]; if (t) { target = t; break; } }
    }
    if (!target) return;                          // slot kosong
    if (medkitMode) {
        // Dari medkit -> pilih senjata: sembunyikan tangan medkit lalu SELALU
        // mainkan animasi angkat senjata (startSwitch) — termasuk saat target =
        // senjata yang sedang di-holster.
        medkitMode = false; medkitChannel = 0;
        if (medkitHandMesh) medkitHandMesh.visible = false;
        startSwitch(target);
        return;
    }
    if (target !== currentWeapon) startSwitch(target);
}

// Setelah beli/ganti senjata di shop: pastikan senjata aktif & lastWeapon masih
// dimiliki (bila senjata aktif barusan diganti, pindah ke slot 0).
export function refreshOwnedWeapon() {
    const W = player.weapons || [];
    if (!player.owned[currentWeapon]) {
        currentWeapon = W[0] || 'pistol';
        if (!grenadeMode) for (const k in WEAPON_DEF) WEAPON_DEF[k].mesh.visible = (k === currentWeapon);
        attachMuzzle(currentWeapon);
    }
    if (!player.owned[lastWeapon]) lastWeapon = W.find(w => w !== currentWeapon) || currentWeapon;
    updateUI();
}

// ----- Mode medkit (tombol 4): pegang medkit, TAHAN klik kiri medkitUseSec detik
// untuk memakainya (sembuh 70%). Tekan 4 lagi = holster (toggle). -----
export function equipMedkit() {
    if (medkitMode) { holsterMedkit(); return; }          // toggle off
    if (switchAnim >= 0 || meleeT > 0) return;
    if (player.medkits <= 0) { showPickup('No medkit', '#b8b8b8'); return; }
    if (player.hp >= player.maxHp) { showPickup('Health already full', '#b8b8b8'); return; }
    medkitMode = true;
    medkitChannel = 0;
    isAiming = false;
    cancelReload();   // batalkan reload + suaranya
    WEAPON_DEF[currentWeapon].mesh.visible = false;
    medkitHandMesh.visible = true;
    if (mkLid) mkLid.rotation.x = 0;              // tutup tertutup saat baru dipegang
    if (mkWorkHand) mkWorkHand.visible = false;   // tangan penekan belum datang
    playSFX(sfxSwitch);
    updateUI();
}

// Simpan kembali medkit -> ANGKAT senjata dgn animasi (dipakai toggle tombol 4 &
// finishMedkit). Beda dari dulu (memunculkan senjata seketika): startSwitch memberi
// jeda + memblok tembak sampai animasi angkat beres (bug fix).
function holsterMedkit() {
    medkitMode = false;
    medkitChannel = 0;
    if (medkitHandMesh) medkitHandMesh.visible = false;
    if (medkitBar) medkitBar.style.display = 'none';
    startSwitch(currentWeapon);
}

// Channel selesai: pakai 1 medkit, sembuh, lalu holster.
function finishMedkit() {
    player.medkits--;
    player.hp = Math.min(player.maxHp,
        player.hp + Math.round(player.maxHp * CFG.player.medkitHealPct));
    playSFX(sfxPickup);
    showPickup('Medkit used', '#ff6b81');
    holsterMedkit();
}

// Batalkan reload yang sedang berjalan: hentikan timer, status, DAN suaranya.
// (Bug fix: dulu suara reload terus berjalan sampai habis saat pindah senjata/
// item — clearTimeout hanya membatalkan callback setTimeout, bukan Audio yang
// SUDAH diputar. Kini node reload disimpan lalu di-pause di sini.)
function cancelReload() {
    clearTimeout(player.reloadTimer);
    player.isReloading = false;
    if (reloadSfxNode) {
        try { reloadSfxNode.pause(); reloadSfxNode.currentTime = 0; } catch (e) { }
        reloadSfxNode = null;
    }
    updateUI();   // segarkan HUD: teks amunisi kembali dari 'Reloading...' ke sisa peluru/magazen
}

// SISTEM MAGAZEN DIHAPUS (2026-07-11): tiap senjata = SATU kolam peluru
// (CFG.weapons.<w>.maxAmmo — rifle 500 / pistol 150 / shotgun 300), TANPA
// reload. Fungsi ini dipertahankan sebagai no-op (call site lama & test bisa
// tetap memanggilnya dgn aman); rig animasi reload di updateWeaponVisuals
// dorman karena player.isReloading tak pernah true lagi.
export function startReload() { }

// Pilih ARAH tebasan saat F ditekan: ke robot terjangkau TERDEKAT (character
// otomatis menghadapnya, mis. robot di selatan walau kursor di utara), atau ke
// arah kursor bila tak ada robot menempel. Mengisi meleeDirX/meleeDirZ.
function pickMeleeDir() {
    let bx = 0, bz = 0, bd = Infinity;
    for (const z of robots) {
        const dx = z.mesh.position.x - camera.position.x;
        const dz = z.mesh.position.z - camera.position.z;
        const d = Math.hypot(dx, dz);
        if (d > CFG.melee.range + CFG.robot.bodyHitRadius * (z.scl || 1)) continue;   // hanya yang terjangkau
        if (d < bd) { bd = d; bx = dx; bz = dz; }
    }
    if (bd < Infinity && bd > 1e-3) {                 // ada robot menempel -> hadap dia
        meleeDirX = bx / bd; meleeDirZ = bz / bd;
    } else {                                          // tak ada -> ikut kursor (arah hadap pivot)
        camera.getWorldDirection(_dir); _dir.y = 0; _dir.normalize();
        meleeDirX = _dir.x; meleeDirZ = _dir.z;
    }
}

// F = melee. Butuh stamina >= biaya melee; tiap ayunan menguras stamina.
export function tryMelee() {
    if (grenadeMode || medkitMode || dodgeActive) return;   // memegang granat/medkit / sedang dodge: tak bisa melee
    if (meleeCd > 0 || switchAnim >= 0) return;
    if (stamina < CFG.stamina.meleeCost) return;
    if (player.isReloading) cancelReload();       // F membatalkan reload (+ suaranya) lalu memukul
    drainStamina(CFG.stamina.meleeCost);
    pickMeleeDir();   // auto-hadap robot terdekat (atau kursor) — arah tebasan
    meleeT = MELEE_TIME; meleeCd = CFG.melee.cooldownSec; meleeHitDone = false;
    playSFX(sfxMelee);   // suara ayunan — berbunyi meski tidak kena robot
}

// ADS butuh stamina: saat exhausted, toggle ON diabaikan (OFF selalu boleh)
export function toggleAim() {
    if (grenadeMode || medkitMode) return;       // memegang granat/medkit: tak ada ADS
    isAiming = isAiming ? false : !staExhausted;
}
export function setAiming(v) { isAiming = v; }

// Sabetan melee: SAPUAN BUSUR di KERUCUT DEPAN (~±70°) sepanjang jangkauan
// CFG.melee.range + radius badan robot. Arahnya = `meleeDir` yang dipilih saat F
// ditekan (AUTO ke robot terjangkau terdekat — character menghadapnya — atau ke
// kursor bila tak ada; 2026-07-16). Damage CFG.melee.damage (150) per robot:
// kelas biasa (C 60 / B 90 / A 120) tumbang SEKALI tebas — mati oleh pedang =
// bangkai TERBELAH DUA (cause 'melee' -> bisectCorpse); boss (1800) hanya
// tergerus + muncrat coolant. Gore/darah searah tebasan (meleeDir).
export function doMeleeHit() {
    const dmg = CFG.melee.damage != null ? CFG.melee.damage : 9999;
    const dirx = meleeDirX, dirz = meleeDirZ;
    let hit = false;
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        const dx = z.mesh.position.x - camera.position.x;
        const dz = z.mesh.position.z - camera.position.z;
        const d = Math.hypot(dx, dz);
        const scl = z.scl || 1;
        if (d > CFG.melee.range + CFG.robot.bodyHitRadius * scl) continue;   // tepi badan ikut (badan besar tetap kena)
        if ((dx * dirx + dz * dirz) / (d || 1) < 0.35) continue;   // ~±70° di depan (arah tebasan)
        hit = true;
        z.hp -= Math.max(1, dmg - (z.armor || 0));
        if (z.hp <= 0) {
            spawnDrop(z.mesh.position);
            killRobot(i, { cause: 'melee', dirx, dirz });   // GORE: terbelah dua searah tebasan
        } else {
            // Selamat (boss): coolant muncrat di titik sabet + terbangun bila dorman
            spawnBloodBurst(z.mesh.position.x, z.mesh.position.y + 7 * scl, z.mesh.position.z,
                dirx, dirz, 5, 0.9);
            if (z.state === 'idle') { z.state = 'chasing'; z.groundY = 0; }
        }
    }
    if (hit) {
        crosshair.classList.add('hit');
        setTimeout(() => crosshair.classList.remove('hit'), 80);
        updateUI();
    }
}

// --- Timer senjata per frame: animasi ganti (tukar model di tengah) & melee ---
export function updateWeaponTimers(dt) {
    if (switchAnim >= 0) {
        const prev = switchAnim;
        switchAnim += dt;
        if (prev < SWITCH_TIME / 2 && switchAnim >= SWITCH_TIME / 2 && switchTarget) {
            // Q kembali ke senjata ini — TAPI bila ini cuma "angkat" senjata yang
            // sama (mis. keluar dari medkit ke senjata yang di-holster), jangan
            // timpa lastWeapon (target Q tetap slot lain).
            if (switchTarget !== currentWeapon) lastWeapon = currentWeapon;
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

    // Channel medkit (tombol 4): TAHAN klik kiri medkitUseSec detik -> pakai
    // (sembuh + holster). Lepas klik = batal (channel reset).
    if (medkitMode) {
        if (mouse.isDown && player.medkits > 0 && player.hp < player.maxHp) {
            medkitChannel += dt;
            if (medkitChannel >= CFG.player.medkitUseSec) finishMedkit();
        } else medkitChannel = 0;
    }
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

// Damage efektif sebuah senjata = base CFG × level upgrade shop Survival
// (player.weaponLvl, 1..maxWeaponLevel; tiap level +upgradeDamagePct dari base
// — Lv2 = 125%, Lv3 = 150%). Dipakai saat stempel b.damage (peluru biasa DAN
// peluru ledak launcher — boom-nya meneruskan b.damage lewat queueBoom).
export function weaponDamage(w) {
    const wc = CFG.weapons[w];
    const base = wc && wc.damage != null ? wc.damage : CFG.weapons.bulletDamage;
    const lvl = (player.weaponLvl && player.weaponLvl[w]) || 1;
    return base * (1 + (CFG.weapons.upgradeDamagePct || 0.25) * (lvl - 1));
}

// --- Tembak (kiri klik), fire-rate berbasis waktu nyata, per senjata ---
// Peluru & damage identik utk kedua senjata; pistol semi-cepat.
export function updateShooting() {
    if (grenadeMode || medkitMode || dodgeActive) return;   // memegang medkit / sedang dodge: tak menembak
    const wpn = player[currentWeapon];
    const wcfg = CFG.weapons[currentWeapon];
    const isLauncher = currentWeapon === 'launcher';   // peluru MELEDAK saat kena (AoE)
    if (mouse.isDown && !player.isReloading && switchAnim < 0 && meleeT <= 0
        && Date.now() - player.lastShot > wcfg.fireDelayMs && wpn.ammo > 0) {
        muzzlePoint.getWorldPosition(_tip);   // muzzle senjata aktif

        camera.getWorldDirection(_v3);
        // Arah dasar DIBEKUKAN sebelum kick kamera — semua pelet shotgun satu
        // tarikan pelatuk memakai arah bidik yang sama.
        const bdx = _v3.x, bdy = _v3.y, bdz = _v3.z;
        // Sebar peluru: kerucut acak di ruang kamera (bukan sumbu dunia).
        // Radius = dasar + bloom panas laras; ADS mempersempitnya.
        const acc = isAiming ? CFG.weapons.adsAccuracy : 1;
        // Penalti bergerak (hanya spread, bukan tendangan kamera): bergerak ->
        // walkSpreadPenalty, diam -> 1. (Sprint dihapus 2026-07-11.)
        const movePen = (keys.w || keys.a || keys.s || keys.d) ? CFG.movement.walkSpreadPenalty : 1;
        // Launcher = 1 peluru presisi; senjata lain pakai spread bloom biasa.
        const spread = isLauncher ? 0.006
            : (CFG.weapons.spreadBase + gunHeat * CFG.weapons.spreadBloom) * acc * movePen;
        _sRight.setFromMatrixColumn(camera.matrixWorld, 0);
        _sUp.setFromMatrixColumn(camera.matrixWorld, 1);

        // Batas jarak peluru (2026-07-16): peluru berhenti TEPAT di titik kursor
        // saat tembakan dilepas — jarak horizontal mata/pivot -> aimPoint, diukur
        // dari posisi tembak (sx/sz). Lewat batas = peluru lenyap (bullets.js);
        // pelet PERTAMA membawa titik kursor (fxX/fxZ) utk efek tembakan di lantai.
        const aimMax = Math.hypot(aimPoint.x - camera.position.x, aimPoint.z - camera.position.z);

        // Satu tarikan pelatuk = `pellets` peluru (shotgun 10; launcher/lainnya
        // tanpa kunci pellets = 1). Tiap pelet dapat sebar tambahan pelletSpread.
        const pellets = wcfg.pellets || 1;
        for (let pi = 0; pi < pellets; pi++) {
            // Launcher: peluru MELEDAK saat kena = granat Mk2 (buildGrenadeMesh),
            // lebih lambat, TIDAK diregangkan seperti tracer. Lainnya = tracer bola.
            const bMesh = isLauncher ? buildGrenadeMesh(0.7) : new THREE.Mesh(GEO.bullet, MAT.bullet);
            bMesh.position.copy(_tip);
            const sAng = Math.random() * Math.PI * 2;
            const sRad = Math.random() * (spread + (wcfg.pelletSpread || 0));   // bias ke pusat
            // Top-down: sebar HORIZONTAL saja (komponen vertikal dihapus) —
            // peluru terbang datar setinggi laras, kipas pelet shotgun melebar
            // menyamping ala Alien Shooter, tidak lewat di atas kepala robot.
            _v3.set(bdx, bdy, bdz)
                .addScaledVector(_sRight, Math.cos(sAng) * sRad).normalize();

            if (isLauncher) bMesh.scale.setScalar(0.7);
            else {
                // Tracer: bola diregangkan searah laju (visual; hit test titik pusat).
                bMesh.lookAt(_tip.x + _v3.x, _tip.y + _v3.y, _tip.z + _v3.z);
                bMesh.scale.set(1, 1, 8.5);
            }
            scene.add(bMesh);
            // px/py/pz = titik awal segmen sweep hit test. Frame pertama mulai dari
            // MATA player (bug fix point-blank: peluru lahir di ujung laras ~13 unit
            // di depan mata, jadi robot dalam jarak cakar lahirnya SUDAH terlewati
            // dan mustahil tertembak tanpa segmen mata->laras ini).
            bullets.push({
                mesh: bMesh, dir: _v3.clone(),
                speed: isLauncher ? CFG.weapons.launcher.roundSpeed : CFG.weapons.bulletSpeed,
                life: CFG.weapons.bulletLife, first: true,
                // Damage dibawa PELURU (senjata bisa berganti sebelum peluru
                // mengenai) — sudah termasuk bonus level upgrade shop.
                damage: weaponDamage(currentWeapon),
                // Peluru Grenade Launcher: meledak saat kena (bullets.js/robots.js),
                // radius = granat lama (killRadius+3.5), damage AoE dari CFG.grenade (100).
                explosive: isLauncher || undefined,
                explodeR: isLauncher ? CFG.grenade.killRadius + 3.5 : undefined,
                // Batas kursor: maxDist dari titik tembak sx/sz; pelet pertama
                // membawa titik kursor utk efek lantai (launcher meledak di sana).
                maxDist: aimMax, sx: camera.position.x, sz: camera.position.z,
                fxX: pi === 0 ? aimPoint.x : undefined,
                fxZ: pi === 0 ? aimPoint.z : undefined,
                px: camera.position.x, py: camera.position.y, pz: camera.position.z
            });
            stats.shots++;   // akurasi dihitung per PELURU (shotgun adil)
        }
        gunHeat = Math.min(1, gunHeat + CFG.weapons.heatPerShot);

        // (Tendangan kamera FPS dihapus — top-down: yaw pivot di-set ulang dari
        // kursor tiap frame; recoil terasa lewat spread/heat, bukan kamera.)

        playSFX(currentWeapon === 'pistol' ? sfxPistol
            : (currentWeapon === 'shotgun' || isLauncher) ? sfxShotgun : sfxShoot);

        wpn.ammo--;
        player.lastShot = Date.now();
        gunRecoil = 1;
        muzzleFlash.intensity = 4;
        muzzleSprite.rotation.z = Math.random() * 6.28;   // roll acak tiap tembakan
        updateUI();
    } else if (mouse.isDown && emptyReady && switchAnim < 0
        && meleeT <= 0 && wpn.ammo === 0) {
        // Tanpa magazen: pelatuk ditarik saat kolam peluru senjata ini habis ->
        // bunyi "cekrek" kosong SEKALI per tarikan (di-arm ulang saat dilepas).
        playSFX(sfxEmpty, 0.6);
        emptyReady = false;
    }
    if (!mouse.isDown) emptyReady = true;
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
    gunBobT += dt * (moving ? 7.5 : 2.2);   // (sprint dihapus 2026-07-11)
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

    // Lengan bawah kiri: rentangkan siku (anchor) -> pergelangan (per senjata).
    // Rifle/shotgun: pergelangan grip overhand ada di sisi dekat-bawah tangan
    // (revisi 2026-07-10) — ujung lengan mengikuti ofset itu.
    placeLimb(leftForearm, -1.8, -3.4, -0.5,
        leftHand.position.x - 0.45, leftHand.position.y - 0.75, leftHand.position.z + 0.8);
    placeLimb(pLeftForearm, -1.7, -3.5, 0.3,
        pLeftHand.position.x - 0.15, pLeftHand.position.y - 0.3, pLeftHand.position.z + 0.35);
    placeLimb(sgLeftForearm, -1.8, -3.4, -0.4,
        sgLeftHand.position.x - 0.45, sgLeftHand.position.y - 0.65, sgLeftHand.position.z + 0.8);

    // --- Tangan medkit (tombol 4), animasi channel overhaul 2026-07-10:
    // idle memegang rendah (tutup tertutup) -> channel: kotak CEPAT naik ke
    // depan dada & dimiringkan ke wajah, TUTUP terbuka memperlihatkan isi,
    // TANGAN KANAN datang lalu MEMOMPA isi kotak berirama (kotak ikut mengayun
    // turun kecil tiap tekanan) + bar HUD. Lepas klik = semua mulus kembali. ---
    if (medkitHandMesh) {
        if (medkitMode) {
            const p = Math.min(1, medkitChannel / (CFG.player.medkitUseSec || 2));
            let mx = 2.6, my = -2.9, mz = -4.8, mrx = 0, mry = 0, mrz = 0;
            if (medkitChannel > 0) {
                const lift = smooth01(Math.min(1, p * 2.4));   // naik cepat di awal channel
                mx -= 1.9 * lift; my += 2.05 * lift; mz += 0.9 * lift;
                mrx -= 0.3 * lift; mry -= 0.35 * lift;         // dimiringkan agar isi terlihat
                // Irama memompa: tangan kanan menekan, kotak mengayun turun kecil
                const pump = 0.5 - 0.5 * Math.cos(medkitChannel * 10);   // 0..1 halus
                my -= 0.12 * pump * lift;
                mrx += 0.07 * pump * lift;
                mrz = 0.04 * Math.sin(medkitChannel * 5) * lift;         // goyang kecil
                if (mkLid) mkLid.rotation.x = 1.25 * lift;               // tutup terbuka
                if (mkWorkHand) {
                    mkWorkHand.visible = lift > 0.55;                    // datang setelah kotak siap
                    mkWorkHand.position.set(1.15 - 0.12 * pump, 1.5 - 0.85 * pump, 0.2);
                    mkWorkHand.rotation.set(-0.35 - 0.3 * pump, -0.15, 0.15);
                }
            } else {
                // idle memegang: bob langkah halus, tutup menutup mulus, tangan kanan pergi
                mx += Math.sin(gunBobT) * 0.06;
                my += Math.abs(Math.cos(gunBobT)) * 0.05;
                if (mkLid) mkLid.rotation.x += (0 - mkLid.rotation.x) * Math.min(1, dt * 10);
                if (mkWorkHand) mkWorkHand.visible = false;
            }
            medkitHandMesh.position.set(mx, my, mz);
            medkitHandMesh.rotation.set(mrx, mry, mrz);
            if (medkitBar) {
                medkitBar.style.display = 'flex';
                if (medkitBarFill) medkitBarFill.style.width = (p * 100) + '%';
            }
        } else if (medkitBar) {
            medkitBar.style.display = 'none';
        }
    }
}

// Bagian senjata dari resetGame: senjata awal sesuai kepemilikan (configurePlayer
// sudah menyetel player.owned untuk mode aktif), batalkan animasi & reload.
export function resetWeapons() {
    cancelReload();   // bug fix: reload lama jangan selesai di game baru + hentikan suaranya
    switchAnim = -1; switchTarget = null;
    meleeT = 0; meleeCd = 0; meleeS = 0; meleeDirX = 0; meleeDirZ = -1;
    for (const k in WEAPON_DEF) WEAPON_DEF[k].mesh.rotation.set(0, 0, 0);
    applyStartLoadout();   // currentWeapon + visibilitas + muzzle sesuai owned
    gunRotX = 0; gunRotZ = 0;
    gunHeat = 0;
    emptyReady = true;
}
