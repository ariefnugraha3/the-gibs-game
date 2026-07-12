// Avatar player TOP-DOWN (pivot 2026-07-11; overhaul badan 2026-07-12; SISTEM
// LENGAN ANCHOR 2026-07-12). Pivot LOGIKA player tetap objek `camera` lama
// (core/renderer.js) — posisi = titik setinggi mata, yaw = arah bidik. Modul ini
// murni VISUAL: tentara stylized (helm, rompi taktis + kantong, ransel,
// pelindung lutut; pivot pinggul+lutut utk animasi jalan).
//
// SENJATA BENAR-BENAR DI TANGAN (2026-07-12): tiap prop senjata/medkit membawa
// TITIK GENGGAM (anchor) — tangan kanan di pelatuk/grip, tangan kiri menahan
// bagian depan (forend/pump/tabung). Telapak tangan DIPOSISIKAN TEPAT di anchor
// prop aktif tiap frame, lalu lengan digambar sebagai DUA SEGMEN TERTARIK
// (bahu→siku→telapak, siku = fake-IK titik tengah yang diturunkan sesuai
// kekenduran) — lengan selalu tersambung ke senjata, tak ada lagi senjata
// melayang di dada. `avatarGunTip` TETAP di ofset terkalibrasi (0,0.15,4.5) di
// dalam gunGrp = titik spawn peluru + induk kilat muzzle (weapons.js) — JANGAN
// digeser. Juga: penanda "move to point", SALTO dodge (flip 360° di pinggang +
// tuck), dan SABETAN PEDANG melee (pivot pedang di bahu kanan; tangan kanan
// mengikuti gagangnya).

import { CFG } from '../core/config.js';
import { camera } from '../core/renderer.js';
import { GEO } from '../core/state.js';
import { aimPoint } from '../core/input.js';
import { eyeHCur, dodgeActive, dodgeProgress, dodgeDirX, dodgeDirZ } from './player.js';
import { currentWeapon, medkitMode, meleeT, MELEE_TIME, gunRecoil } from './weapons.js';   // sirkular aman: dibaca di dalam fungsi

export let avatarGroup = null;
export let avatarGunTip = null;   // Object3D ujung laras (dibaca weapons.js)
let upperG = null, headG = null;  // badan ATAS (torso+kepala+lengan+senjata) & KEPALA — pemisahan atas/bawah 2026-07-12
let hipL = null, hipR = null, kneeL = null, kneeR = null;
let handL = null, handR = null;                    // telapak (diposisikan ke anchor tiap frame)
let armUpL = null, armLoL = null, armUpR = null, armLoR = null;   // segmen lengan tertarik
let phase = 0, lastX = 0, lastZ = 0;
// Rantai hadap manusiawi: kaki (root) -> puntiran pinggang (upperG) -> toleh kepala (headG)
let aimYaw = 0, legYaw = 0, twistCur = 0, headYawCur = 0;
let gaitSign = 1, backped = false, realign = false;   // arah siklus langkah + histeresis backpedal + turn-in-place
let deathT = -1, deathDirX = 0, deathDirZ = 1;        // animasi ROBOH kematian (>= 0 = berjalan); arah jatuh
let marker = null, markerT = 0;
let props = null, propKey = '';   // prop senjata/medkit aktif (show/hide per frame)
let swordPivot = null;            // pivot ayunan pedang (di bahu kanan; tampil saat melee)
let swooshGrp = null, swooshMat = null;   // kipas JEJAK tebasan (opacity ~ kecepatan ayunan)
const _qT = new THREE.Quaternion(), _tumbleAxis = new THREE.Vector3();   // salto dodge
const _segDir = new THREE.Vector3(), _yUnit = new THREE.Vector3(0, 1, 0);

// Bahu (ruang avatarGroup) — pangkal lengan tertarik.
const SHOULDER = { L: { x: -1.55, y: 9.1, z: 0.35 }, R: { x: 1.6, y: 9.1, z: 0.15 } };
const GUN_OFF = { x: 0.65, y: 7.5, z: 1.2 };   // posisi gunGrp (terkalibrasi — jangan geser)
// Titik genggam per prop (ruang LOKAL gunGrp): R = tangan pelatuk, L = tangan penahan depan.
const GRIPS = {
    rifle: { R: { x: 0, y: -0.62, z: -0.08 }, L: { x: 0, y: -0.3, z: 2.2 } },
    pistol: { R: { x: 0, y: -0.5, z: 1.4 }, L: { x: -0.08, y: -0.66, z: 1.22 } },
    shotgun: { R: { x: 0, y: -0.36, z: -0.35 }, L: { x: 0, y: -0.44, z: 2.3 } },
    launcher: { R: { x: 0, y: -0.62, z: 0.5 }, L: { x: 0, y: -0.52, z: 2.35 } },
    medkit: { R: { x: 0.15, y: -1.45, z: -0.2 }, L: { x: -1.45, y: -1.45, z: -0.2 } },
};
// Target tangan saat TUCK dodge & tangan kiri saat sabetan pedang (ruang upperG).
const TUCK = { L: { x: -0.95, y: 7.2, z: 0.95 }, R: { x: 0.95, y: 7.0, z: 0.95 } };
const GUARD_L = { x: -1.7, y: 7.9, z: 1.3 };

// ===== Pemisahan badan ATAS/BAWAH (2026-07-12) =====
const MAX_TWIST = 1.05;    // puntiran pinggang maks (~60°) — batas anatomi torso vs kaki
const HEAD_TWIST = 0.62;   // toleh EKSTRA kepala di atas puntiran torso (~35°)
const wrapPI = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const clampT = (a) => Math.max(-MAX_TWIST, Math.min(MAX_TWIST, a));
// Dekati sudut target lewat busur TERPENDEK, dibatasi maxStep per frame (anti-snap).
function approachAngle(cur, target, maxStep) {
    const d = wrapPI(target - cur);
    if (Math.abs(d) <= maxStep) return target;
    return wrapPI(cur + Math.sign(d) * maxStep);
}

export function initPlayerAvatar(sc) {
    // Phong warna polos = program shader sama dgn material dunia (tanpa compile baru)
    const mat = (c, sh = 10) => new THREE.MeshPhongMaterial({ color: c, shininess: sh, specular: 0x1c1a16 });
    const skin = mat(0xd09a66), fatig = mat(0x4d5640), vest = mat(0x262a30, 20),
        strap = mat(0x1b1e22), pants = mat(0x39404a), boots = mat(0x1d2024),
        helmet = mat(0x3c4433), gun = mat(0x171a1e, 30), wood = mat(0x5a4530),
        white = mat(0xe8e4dc, 24), cross = mat(0xc0392b), dark = mat(0x14171a);

    // Elipsoid (sphere di-skala) — bentuk membulat untuk kepala/bahu/telapak/bantalan.
    const ellip = (r, sx, sy, sz, ws = 10, hs = 8) => { const g = new THREE.SphereGeometry(r, ws, hs); g.scale(sx, sy, sz); return g; };

    avatarGroup = new THREE.Group();   // ROOT = badan BAWAH: yaw = arah hadap KAKI (menghadap +Z)
    // Badan ATAS di grup sendiri (2026-07-12): yaw LOKAL upperG = puntiran
    // pinggang (bidik − kaki, dijepit ±MAX_TWIST); headG = toleh ekstra kepala.
    // upperG/headG di origin root (hanya berotasi) — semua konstanta koordinat
    // lama (SHOULDER/GUN_OFF/GRIPS/TUCK) tetap berlaku apa adanya.
    upperG = new THREE.Group();
    avatarGroup.add(upperG);
    headG = new THREE.Group();
    upperG.add(headG);
    const mk = (geo, m, x, y, z, parent = avatarGroup, shadow = true) => {
        const b = new THREE.Mesh(geo, m);
        b.position.set(x, y, z);
        b.castShadow = shadow;
        parent.add(b);
        return b;
    };
    const box = (w, h, d, m, x, y, z, parent, shadow = false) =>
        mk(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent, shadow);
    const cyl = (r1, r2, len, m, x, y, z, parent, rotX = 0, shadow = false) => {
        const b = mk(new THREE.CylinderGeometry(r1, r2, len, 10), m, x, y, z, parent, shadow);
        if (rotX) b.rotation.x = rotX;
        return b;
    };

    // ----- Kaki: pivot pinggul -> paha; pivot lutut -> betis + pelindung + boot -----
    const mkLeg = (sx) => {
        const hip = new THREE.Group(); hip.position.set(sx, 6.0, 0); avatarGroup.add(hip);
        mk(new THREE.CylinderGeometry(0.74, 0.6, 2.6, 10), pants, 0, -1.3, 0, hip);
        const knee = new THREE.Group(); knee.position.set(0, -2.6, 0); hip.add(knee);
        mk(ellip(0.52, 1.0, 0.8, 1.0, 8, 6), strap, 0, 0.1, 0.3, knee, false);   // pelindung lutut
        mk(new THREE.CylinderGeometry(0.56, 0.44, 2.4, 10), pants, 0, -1.2, 0, knee, false);
        mk(ellip(0.62, 1.1, 0.62, 1.7, 8, 6), boots, 0, -2.35, 0.35, knee, false);   // boot
        return { hip, knee };
    };
    const lL = mkLeg(-0.95), lR = mkLeg(0.95);
    hipL = lL.hip; kneeL = lL.knee; hipR = lR.hip; kneeR = lR.knee;

    // ----- Badan ATAS (upperG): seragam + rompi taktis + kantong dada + ransel.
    // SABUK tetap di ROOT (garis pinggang milik badan bawah — puntiran torso
    // terlihat "patah" alami tepat di atas sabuk). -----
    const torsoG = new THREE.CylinderGeometry(1.5, 1.05, 3.9, 12, 1); torsoG.scale(1, 1, 0.7);
    mk(torsoG, fatig, 0, 7.85, 0, upperG);
    const vestG = new THREE.CylinderGeometry(1.62, 1.26, 2.9, 12, 1, true); vestG.scale(1, 1, 0.76);
    mk(vestG, vest, 0, 7.95, 0, upperG, false);
    box(0.62, 0.5, 0.3, strap, -0.5, 8.5, 1.02, upperG);    // kantong magasin dada
    box(0.62, 0.5, 0.3, strap, 0.5, 8.5, 1.02, upperG);
    box(0.5, 0.4, 0.26, strap, 0, 7.6, 1.06, upperG);       // kantong kecil tengah
    mk(ellip(0.95, 1.5, 0.32, 0.95, 10, 5), strap, 0, 5.95, 0, avatarGroup, false);   // sabuk (badan bawah)
    mk(ellip(1.0, 2.05, 0.7, 0.95, 12, 6), fatig, 0, 9.55, 0, upperG, false);    // yoke bahu
    box(1.7, 2.0, 0.85, strap, 0, 8.3, -1.28, upperG);      // ransel
    cyl(0.32, 0.32, 1.7, fatig, 0, 9.5, -1.25, upperG, 0).rotation.z = Math.PI / 2;   // gulungan matras
    // Bantalan bahu (statis — pangkal visual lengan tertarik)
    mk(ellip(0.55, 1.05, 0.8, 1.0, 8, 6), fatig, SHOULDER.L.x, SHOULDER.L.y + 0.15, SHOULDER.L.z, upperG, false);
    mk(ellip(0.55, 1.05, 0.8, 1.0, 8, 6), fatig, SHOULDER.R.x, SHOULDER.R.y + 0.15, SHOULDER.R.z, upperG, false);

    // ----- Kepala (headG, di dalam upperG): leher + wajah + HELM — menoleh
    // sendiri (rotation.y) di atas puntiran torso; mesh terpusat di sumbu badan
    // sehingga pivot toleh di origin grup sudah benar. -----
    mk(new THREE.CylinderGeometry(0.5, 0.62, 0.9, 8), skin, 0, 9.95, 0, headG, false);
    mk(ellip(1.05, 0.95, 1.08, 0.98, 12, 10), skin, 0, 10.62, 0, headG);
    const domeG = new THREE.SphereGeometry(1.22, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);
    domeG.scale(1.02, 0.92, 1.06);
    mk(domeG, helmet, 0, 10.78, -0.02, headG, false);
    mk(new THREE.CylinderGeometry(1.24, 1.3, 0.2, 12), helmet, 0, 10.72, 0, headG, false);   // pinggiran helm
    mk(ellip(0.13, 1, 1, 0.6, 6, 4), dark, -0.34, 10.62, 0.9, headG, false);   // mata
    mk(ellip(0.13, 1, 1, 0.6, 6, 4), dark, 0.34, 10.62, 0.9, headG, false);

    // ----- LENGAN TERTARIK (2026-07-12): 2 segmen silinder unit (di-scale
    // panjangnya per frame oleh placeSeg) + telapak yang menempel di anchor
    // genggaman prop aktif. Tidak ada lagi pivot bahu/siku FK. -----
    const upGeo = new THREE.CylinderGeometry(0.34, 0.3, 1, 8);
    const loGeo = new THREE.CylinderGeometry(0.29, 0.24, 1, 8);
    armUpL = mk(upGeo, fatig, 0, 0, 0, upperG, false);
    armLoL = mk(loGeo, fatig, 0, 0, 0, upperG, false);
    armUpR = mk(upGeo, fatig, 0, 0, 0, upperG, false);
    armLoR = mk(loGeo, fatig, 0, 0, 0, upperG, false);
    handL = mk(ellip(0.42, 1.0, 0.8, 1.0, 7, 5), skin, 0, 0, 0, upperG, false);
    handR = mk(ellip(0.42, 1.0, 0.8, 1.0, 7, 5), skin, 0, 0, 0, upperG, false);

    // ----- Grup senjata + prop per-slot. gunGrp & avatarGunTip DI POSISI LAMA
    // (terkalibrasi — titik spawn peluru & kilat muzzle tidak boleh bergeser). -----
    const gunGrp = new THREE.Group();
    gunGrp.position.set(GUN_OFF.x, GUN_OFF.y, GUN_OFF.z);
    upperG.add(gunGrp);   // senjata milik badan ATAS (ikut puntiran torso ke kursor)
    avatarGunTip = new THREE.Object3D();
    avatarGunTip.position.set(0, 0.15, 4.5);
    gunGrp.add(avatarGunTip);

    const prop = () => { const g = new THREE.Group(); gunGrp.add(g); return g; };
    // Assault Rifle: receiver + handguard + laras + pisir + magasin lengkung + popor + grip
    const pRifle = prop();
    box(0.5, 0.72, 2.6, gun, 0, 0, 0.6, pRifle, true);
    box(0.42, 0.52, 1.5, gun, 0, -0.02, 2.2, pRifle);
    cyl(0.12, 0.12, 1.6, gun, 0, 0.12, 3.6, pRifle, Math.PI / 2);
    box(0.08, 0.3, 0.12, gun, 0, 0.36, 3.3, pRifle);
    box(0.1, 0.24, 0.5, gun, 0, 0.42, 0.2, pRifle);
    box(0.26, 0.95, 0.55, gun, 0, -0.72, 1.0, pRifle).rotation.x = 0.18;
    box(0.38, 0.6, 1.3, gun, 0, -0.08, -1.15, pRifle);
    box(0.28, 0.7, 0.4, gun, 0, -0.6, -0.1, pRifle).rotation.x = 0.25;
    // Pistol: kecil, dipegang menjulur ke depan (dua tangan merapat)
    const pPistol = prop();
    box(0.32, 0.38, 1.35, gun, 0, 0.3, 1.9, pPistol, true);
    box(0.3, 0.3, 1.05, gun, 0, 0.02, 1.85, pPistol);
    box(0.28, 0.85, 0.42, gun, 0, -0.42, 1.45, pPistol).rotation.x = 0.2;
    box(0.07, 0.16, 0.1, gun, 0, 0.56, 2.4, pPistol);
    // Shotgun: laras tebal + tabung magasin + POMPA + popor kayu
    const pShotgun = prop();
    box(0.46, 0.6, 1.5, gun, 0, 0, 0.3, pShotgun, true);
    cyl(0.16, 0.16, 3.4, gun, 0, 0.14, 2.2, pShotgun, Math.PI / 2);
    cyl(0.11, 0.11, 2.6, gun, 0, -0.16, 2.0, pShotgun, Math.PI / 2);
    box(0.5, 0.44, 0.9, wood, 0, -0.18, 2.3, pShotgun);
    box(0.42, 0.62, 1.25, wood, 0, -0.1, -1.05, pShotgun);
    // Grenade Launcher: tabung 40mm GENDUT + moncong + breech + grip + pisir
    const pLauncher = prop();
    cyl(0.42, 0.42, 2.8, gun, 0, 0.05, 1.7, pLauncher, Math.PI / 2, true);
    cyl(0.5, 0.5, 0.4, dark, 0, 0.05, 3.15, pLauncher, Math.PI / 2);
    box(0.55, 0.7, 1.0, gun, 0, -0.05, 0.1, pLauncher);
    box(0.28, 0.65, 0.4, gun, 0, -0.58, 0.5, pLauncher).rotation.x = 0.25;
    box(0.1, 0.35, 0.3, gun, 0, 0.5, 0.6, pLauncher);
    // Medkit: kotak putih + palang merah, dipegang rendah dua tangan
    const pMedkit = prop();
    box(1.5, 1.05, 1.15, white, -0.65, -1.5, -0.2, pMedkit, true);
    box(0.9, 0.14, 0.3, cross, -0.65, -0.95, -0.2, pMedkit);
    box(0.3, 0.14, 0.9, cross, -0.65, -0.95, -0.2, pMedkit);
    props = { rifle: pRifle, pistol: pPistol, shotgun: pShotgun, launcher: pLauncher, medkit: pMedkit };
    for (const k in props) props[k].visible = false;
    pRifle.visible = true; propKey = 'rifle';

    // ----- PEDANG melee: PIVOT di bahu kanan — seluruh ayunan = rotasi pivot
    // ini; bilah memanjang +Z. Tangan kanan mengikuti titik gagang (dihitung
    // manual di updatePlayerAvatar). Tampil hanya selama sabetan (meleeT > 0). -----
    const steel = mat(0xc9d3dc, 60);
    swordPivot = new THREE.Group();
    swordPivot.position.set(SHOULDER.R.x, SHOULDER.R.y, SHOULDER.R.z);
    upperG.add(swordPivot);
    swordPivot.rotation.order = 'YXZ';   // yaw dulu baru pitch — cocok dgn hitung manual titik gagang
    box(0.16, 0.22, 0.6, dark, 0, -0.35, 0.85, swordPivot);      // gagang
    box(0.72, 0.14, 0.2, gun, 0, -0.35, 1.25, swordPivot);       // pelindung tangan
    box(0.11, 0.42, 3.6, steel, 0, -0.35, 3.1, swordPivot, true);   // bilah (pipih memanjang ke depan)
    swordPivot.visible = false;
    // Kipas JEJAK tebasan (swoosh): sektor cincin horizontal setinggi dada yang
    // MEMBUNTUTI bilah selama fase tebas — menjual kecepatan ayunan dari kamera
    // top-down. Dibuat sekali (hidden; warmup preload mengompilasi shadernya).
    swooshMat = new THREE.MeshBasicMaterial({
        color: 0xd8ecf4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false
    });
    const swooshMesh = new THREE.Mesh(new THREE.RingGeometry(1.4, 4.9, 20, 1, 0, 1.25), swooshMat);
    swooshMesh.rotation.x = -Math.PI / 2;
    swooshGrp = new THREE.Group();
    swooshGrp.position.set(SHOULDER.R.x, 7.7, SHOULDER.R.z);
    swooshGrp.add(swooshMesh);
    swooshGrp.visible = false;
    upperG.add(swooshGrp);

    sc.add(avatarGroup);

    // Penanda "move to point": cincin pipih berdenyut di titik klik kanan
    marker = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
        color: 0x6fd26a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
    }));
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    sc.add(marker);
}

export function showMoveMarker(x, y, z) {
    if (!marker) return;
    marker.position.set(x, y + 0.5, z);
    marker.visible = true;
    markerT = 0;
}

export function hideMoveMarker() {
    if (marker) marker.visible = false;
}

// Mulai animasi kematian "biasa" (dipanggil startPlayerDeath di game.js):
// tubuh ROBOH ke arah (dirx,dirz) = arah datangnya dorongan damage terakhir.
export function playAvatarDeath(dirx, dirz) {
    const d = Math.hypot(dirx, dirz);
    deathDirX = d > 1e-4 ? dirx / d : 0;
    deathDirZ = d > 1e-4 ? dirz / d : 1;
    deathT = 0;
}

// Dipanggil resetGame: batalkan pose mati + paksa evaluasi ulang prop senjata.
export function resetAvatarDeath() {
    deathT = -1;
    propKey = '';
    if (avatarGroup) avatarGroup.visible = true;
}

// Rentangkan satu segmen silinder-unit dari (ax,ay,az) ke (bx,by,bz)
// (ruang avatarGroup): posisi = titik tengah, orientasi = arah, scale.y = panjang.
function placeSeg(mesh, ax, ay, az, bx, by, bz) {
    _segDir.set(bx - ax, by - ay, bz - az);
    const len = _segDir.length() || 0.001;
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.quaternion.setFromUnitVectors(_yUnit, _segDir.multiplyScalar(1 / len));
    mesh.scale.set(1, len, 1);
}

// Lengan tertarik bahu→siku→telapak. Siku = fake-IK: titik tengah diturunkan +
// didorong keluar sesuai KEKENDURAN (makin dekat target, makin menekuk) —
// murah, selalu tersambung, terlihat menekuk alami.
function placeArm(side, hx, hy, hz) {
    const S = SHOULDER[side];
    const dx = hx - S.x, dy = hy - S.y, dz = hz - S.z;
    const d = Math.hypot(dx, dy, dz) || 0.001;
    const slack = Math.max(0, 3.45 - d);
    const out = (side === 'L' ? -1 : 1) * (0.12 + slack * 0.22);
    const ex = S.x + dx * 0.5 + out;
    const ey = S.y + dy * 0.5 - (0.3 + slack * 0.6);
    const ez = S.z + dz * 0.5 - 0.1;
    if (side === 'L') {
        placeSeg(armUpL, S.x, S.y, S.z, ex, ey, ez);
        placeSeg(armLoL, ex, ey, ez, hx, hy, hz);
        handL.position.set(hx, hy, hz);
    } else {
        placeSeg(armUpR, S.x, S.y, S.z, ex, ey, ez);
        placeSeg(armLoR, ex, ey, ez, hx, hy, hz);
        handR.position.set(hx, hy, hz);
    }
}

// Per frame dari animate() — SETELAH updateGame (pakai posisi pivot & aim
// terbaru); jalan juga saat pause (pose beku, konsisten dgn kontrak decor).
export function updatePlayerAvatar(dt) {
    if (!avatarGroup) return;
    const feetY = camera.position.y - eyeHCur;
    const px = camera.position.x, pz = camera.position.z;
    avatarGroup.position.set(px, feetY, pz);

    // ===== MATI "BIASA" (2026-07-12): tubuh ROBOH ke arah jatuh (pivot di
    // kaki, easeIn — makin cepat), senjata lenyap dari tangan, lengan & kaki
    // LEMAS — tanpa ledakan/gib. Berbaring diam sampai GAME OVER/reset. =====
    if (deathT >= 0) {
        deathT += dt;
        const k = Math.min(1, deathT / 0.6);
        const th = (Math.PI / 2) * (k * k);   // sudut roboh 0 -> 90° (easeIn)
        avatarGroup.rotation.set(0, legYaw, 0);
        _tumbleAxis.set(deathDirZ, 0, -deathDirX);   // sumbu ⟂ arah jatuh -> kepala rebah ke (dirX,dirZ)
        _qT.setFromAxisAngle(_tumbleAxis, th);
        avatarGroup.quaternion.premultiply(_qT);
        // pose lemas: puntiran/toleh mengendur, kaki setengah menekuk asimetris
        const rel = Math.min(1, dt * 6);
        upperG.rotation.y += (0 - upperG.rotation.y) * rel;
        headG.rotation.y += (0 - headG.rotation.y) * rel;
        upperG.position.y += (0 - upperG.position.y) * rel;
        hipL.rotation.x += (-0.28 - hipL.rotation.x) * rel;
        hipR.rotation.x += (0.18 - hipR.rotation.x) * rel;
        kneeL.rotation.x += (0.5 - kneeL.rotation.x) * rel;
        kneeR.rotation.x += (0.32 - kneeR.rotation.x) * rel;
        hipL.rotation.z *= 1 - rel; hipR.rotation.z *= 1 - rel;
        if (props && propKey !== '__dead') {   // senjata/pedang terlepas dari tangan
            for (const q in props) props[q].visible = false;
            if (swordPivot) swordPivot.visible = false;
            if (swooshGrp) swooshGrp.visible = false;
            propKey = '__dead';
        }
        // lengan terkulai di sisi badan (ruang upperG ikut rebah bersama tubuh)
        placeArm('R', 2.0, 5.4, 0.5);
        placeArm('L', -2.0, 5.5, 0.3);
        return;
    }

    // ===== RANTAI HADAP MANUSIAWI (2026-07-12 — menggantikan lookAt seluruh
    // badan): KAKI (root) menghadap ARAH GERAK, TORSO (upperG) memuntir ke
    // kursor dijepit ±MAX_TWIST (batas pinggang), KEPALA (headG) menoleh LEBIH
    // DULU + bisa menambah toleh di atas torso. Bergerak menjauhi bidikan
    // (>~110°) = BACKPEDAL (kaki tetap di sisi bidikan, siklus langkah diputar
    // MUNDUR). Diam: kaki bertahan; bila torso terlanjur memuntir jauh, kaki
    // MENYERET menyesuaikan (turn-in-place). Melee/dodge: seluruh badan cepat
    // lurus ke arah bidik (aksi satu tubuh). =====
    // Arah bidik. Guard: kursor tepat di atas player -> pertahankan yaw terakhir.
    if (aimPoint) {
        const adx = aimPoint.x - px, adz = aimPoint.z - pz;
        if (adx * adx + adz * adz > 0.25) aimYaw = Math.atan2(adx, adz);
    }
    // Kecepatan horizontal NYATA (WASD ataupun klik-kanan) + arah geraknya.
    const vx = dt > 0 ? (px - lastX) / dt : 0, vz = dt > 0 ? (pz - lastZ) / dt : 0;
    const sp = Math.hypot(vx, vz);
    lastX = px; lastZ = pz;
    const moving = sp > 1;
    const inMelee = meleeT > 0;
    let moveYawNow = legYaw;
    if (dodgeActive || inMelee) {
        legYaw = approachAngle(legYaw, aimYaw, dt * 20);
        gaitSign = 1; backped = false; realign = false;
    } else if (moving) {
        moveYawNow = Math.atan2(vx, vz);
        const rel = wrapPI(moveYawNow - aimYaw);
        // histeresis maju<->mundur supaya gait tak berkedip di sekitar ambang ~105°
        if (backped) { if (Math.abs(rel) < 1.75) backped = false; }
        else if (Math.abs(rel) > 1.92) backped = true;
        gaitSign = backped ? -1 : 1;
        // kaki menghadap arah gerak (kebalikannya saat backpedal), dijepit agar
        // puntiran pinggang tak melewati batas anatomi
        let legTarget = backped ? wrapPI(moveYawNow + Math.PI) : moveYawNow;
        legTarget = wrapPI(aimYaw - clampT(wrapPI(aimYaw - legTarget)));
        legYaw = approachAngle(legYaw, legTarget, dt * 12);
        realign = false;
    } else if (realign || Math.abs(wrapPI(aimYaw - legYaw)) > 0.92) {
        legYaw = approachAngle(legYaw, aimYaw, dt * 7.5);
        realign = Math.abs(wrapPI(aimYaw - legYaw)) > 0.12;
    }
    avatarGroup.rotation.set(0, legYaw, 0);
    // Puntiran pinggang + toleh kepala. Kepala lebih gesit (rate lebih tinggi)
    // = menoleh LEBIH DULU ke kursor, torso menyusul — urutan alami manusia.
    const twTarget = dodgeActive ? 0 : clampT(wrapPI(aimYaw - legYaw));
    twistCur = approachAngle(twistCur, twTarget, dt * 15);
    upperG.rotation.y = twistCur;
    const hdRes = wrapPI(aimYaw - legYaw - twistCur);
    const hdTarget = dodgeActive ? 0 : Math.max(-HEAD_TWIST, Math.min(HEAD_TWIST, hdRes));
    headYawCur = approachAngle(headYawCur, hdTarget, dt * 24);
    headG.rotation.y = headYawCur;

    // Prop terlihat = medkit saat medkitMode, selain itu senjata aktif.
    // Selama sabetan melee (meleeT > 0): senjata disembunyikan, PEDANG tampil.
    const key = medkitMode ? 'medkit' : currentWeapon;
    const showKey = inMelee ? '__melee' : key;
    if (props && showKey !== propKey) {
        for (const k in props) props[k].visible = !inMelee && k === key;
        if (swordPivot) swordPivot.visible = inMelee;
        propKey = showKey;
    }
    // RECOIL visual (2026-07-12): ujung senjata MENGHENTAK NAIK sesaat tiap
    // tembakan — prop di-pitch di PANGKALNYA (gunGrp & avatarGunTip TIDAK ikut
    // berputar: titik spawn peluru + kilat muzzle tetap terkalibrasi; bentuk
    // senjata tak berubah, hanya rotasi transien). Besarnya per senjata dari
    // CFG.weapons.<w>.cameraKick (shotgun/launcher menghentak lebih); gunRecoil
    // = 1 saat menembak lalu meluruh (weapons.updateWeaponState). cos/sin pitch
    // disimpan utk memutar TITIK GENGGAM di bawah — tangan ikut hentakan.
    let recC = 1, recS = 0;
    if (props && props[key]) {
        const wc = CFG.weapons[key];
        const a = -gunRecoil * ((wc && wc.cameraKick) || 0) * 6;
        props[key].rotation.x = a;
        recC = Math.cos(a); recS = Math.sin(a);
    }

    // ----- Target tangan (ruang avatarGroup) -> lengan tertarik. Titik genggam
    // DIPUTAR dgn pitch recoil yang sama (rotasi X di pangkal gunGrp) sehingga
    // telapak tetap MENEMPEL di grip/forend yang terangkat — tangan depan naik
    // paling terasa (dekat moncong), tangan pelatuk nyaris diam (dekat pangkal). -----
    const G = GRIPS[key] || GRIPS.rifle;
    let rTx = GUN_OFF.x + G.R.x,
        rTy = GUN_OFF.y + G.R.y * recC - G.R.z * recS,
        rTz = GUN_OFF.z + G.R.y * recS + G.R.z * recC;
    let lTx = GUN_OFF.x + G.L.x,
        lTy = GUN_OFF.y + G.L.y * recC - G.L.z * recS,
        lTz = GUN_OFF.z + G.L.y * recS + G.L.z * recC;
    let meleeDip = 0;   // merendah kuda-kuda saat menebas (dipakai blok kaki di bawah)
    if (dodgeActive) {
        // TUCK: kedua tangan merapat ke dada selama salto.
        rTx = TUCK.R.x; rTy = TUCK.R.y; rTz = TUCK.R.z;
        lTx = TUCK.L.x; lTy = TUCK.L.y; lTz = TUCK.L.z;
    } else if (inMelee) {
        // ===== Sabetan PEDANG LINCAH (overhaul 2026-07-12): 3 fase —
        // ANCANG (menyentak ke kanan-atas + badan memuntir kanan) -> TEBAS
        // (easeIn kubik = MELEDAK, busur lebar + menerjang maju + merendah +
        // pinggang memuntir kiri + jejak swoosh) -> RECOVERY (mengendur).
        // Seluruh ayunan = rotasi swordPivot; tangan kanan MENGIKUTI gagang. =====
        const k = 1 - Math.max(0, meleeT) / MELEE_TIME;      // 0..1 sepanjang ayunan
        const A0 = 0.18, A1 = 0.52;
        let yaw, pitch, roll, twist, lunge, swOp = 0;
        if (k < A0) {
            const t = k / A0, e = 1 - (1 - t) * (1 - t);     // easeOut: sentakan ancang
            yaw = 1.7 * e; pitch = -0.55 * e; roll = 0.35 * e;
            twist = 0.3 * e; lunge = -0.4 * e;               // condong mundur tipis
        } else if (k < A1) {
            const t = (k - A0) / (A1 - A0), e = t * t * t;   // easeIn kubik: akselerasi keras
            yaw = 1.7 - 4.3 * e;                             // 1.7 -> -2.6 (busur ~245°)
            pitch = -0.55 + 0.45 * e;                        // menukik melewati sasaran
            roll = 0.35 - 0.85 * e;
            twist = 0.3 - 0.75 * e;                          // pinggang ikut memuntir
            lunge = -0.4 + 2.8 * e;                          // MENERJANG maju
            meleeDip = 0.9 * e;
            swOp = t * t * 0.55;                             // jejak makin pekat = makin cepat
        } else {
            const t = (k - A1) / (1 - A1), e = t * t * (3 - 2 * t);   // smoothstep pulih
            yaw = -2.6 + 2.0 * e;
            pitch = -0.1 - 0.2 * (1 - e);
            roll = -0.5 * (1 - e);
            twist = -0.45 * (1 - e);
            lunge = 2.4 * (1 - e);
            meleeDip = 0.9 * (1 - e);
            swOp = Math.max(0, 0.55 * (1 - t / 0.3));        // jejak memudar cepat
        }
        swordPivot.rotation.set(pitch, yaw, roll);
        // Dinamika BADAN: puntiran pinggang + terjangan maju (sumbu hadap lokal)
        // + merendah — visual murni, posisi logika player tak tersentuh.
        avatarGroup.rotateY(twist);
        avatarGroup.translateZ(lunge);
        avatarGroup.position.y = feetY - meleeDip * 0.55;
        // Jejak swoosh membuntuti bilah (sektor mulai tepat di sudut bilah,
        // membentang ke sisi yang baru dilewati ayunan).
        swooshGrp.visible = swOp > 0.02;
        if (swooshGrp.visible) {
            swooshMat.opacity = swOp;
            swooshGrp.rotation.y = yaw - Math.PI / 2;
        }
        // Titik gagang lokal (0,-0.35,0.95) diputar pitch (X) lalu yaw (Y)
        // (order euler pivot 'YXZ' — cocok; roll diabaikan, offsetnya kecil):
        const gy0 = -0.35, gz0 = 0.95;
        const cy = Math.cos(pitch), sy = Math.sin(pitch);
        const y1 = gy0 * cy - gz0 * sy, z1 = gy0 * sy + gz0 * cy;
        const cyw = Math.cos(yaw), syw = Math.sin(yaw);
        rTx = SHOULDER.R.x + z1 * syw;
        rTy = SHOULDER.R.y + y1;
        rTz = SHOULDER.R.z + z1 * cyw;
        // Tangan kiri DINAMIS menyeimbangkan: mengayun berlawanan puntiran badan.
        lTx = GUARD_L.x - twist * 1.3;
        lTy = GUARD_L.y + meleeDip * 0.3;
        lTz = GUARD_L.z + Math.abs(twist) * 0.6;
    }
    if (!inMelee && swooshGrp && swooshGrp.visible) swooshGrp.visible = false;
    placeArm('R', rTx, rTy, rTz);
    placeArm('L', lTx, lTy, lTz);

    if (dodgeActive) {
        // ===== SALTO dodge: putaran 360° di sekitar PINGGANG (bukan kaki) +
        // busur lompatan + kaki TUCK. Sudut pakai smoothstep -> lepas landas &
        // mendarat kalem, berputar cepat di udara; 360° penuh = mulai & selesai
        // tegak menghadap kursor (tanpa 'pop'). =====
        const p = dodgeProgress;
        const e = p * p * (3 - 2 * p);              // smoothstep 0..1
        const th = e * Math.PI * 2;
        _tumbleAxis.set(dodgeDirZ, 0, -dodgeDirX);  // sumbu horizontal ⟂ arah gulingan
        const al = Math.hypot(_tumbleAxis.x, _tumbleAxis.z);
        if (al > 1e-4) {
            _tumbleAxis.multiplyScalar(1 / al);
            _qT.setFromAxisAngle(_tumbleAxis, th);
            avatarGroup.quaternion.premultiply(_qT);   // putaran ruang-dunia SETELAH hadap
            // Geser origin (kaki) mengelilingi pivot pinggang setinggi PIV ->
            // badan berputar pada pusat massanya, bukan terseret di lantai.
            const PIV = 5.2, s = Math.sin(th), c = Math.cos(th);
            avatarGroup.position.x -= PIV * s * dodgeDirX;
            avatarGroup.position.z -= PIV * s * dodgeDirZ;
            avatarGroup.position.y = feetY + PIV * (1 - c) + Math.sin(Math.PI * p) * 2.2;
        }
        // Tuck: paha terlipat + lutut menekuk saat di udara, terbuka lagi
        // menjelang mendarat (envelope sinus).
        const tuck = Math.sin(Math.PI * Math.min(1, p * 1.12));
        hipL.rotation.x = -1.7 * tuck; hipR.rotation.x = -1.7 * tuck;
        kneeL.rotation.x = 2.15 * tuck; kneeR.rotation.x = 2.15 * tuck;
        hipL.rotation.z = 0; hipR.rotation.z = 0;
    } else if (moving) {
        // ===== GAIT TERARAH (2026-07-12): siklus mengikuti arah gerak RELATIF
        // HADAP KAKI — komponen sejajar = ayunan pinggul maju/mundur (fase
        // DIPUTAR TERBALIK saat backpedal -> kaki benar-benar melangkah mundur),
        // komponen menyamping = kedua pinggul membuka-menutup bersama
        // (side-shuffle nyata, bukan "jalan maju menghadap lain"). =====
        phase += dt * gaitSign * Math.min(13, 4 + sp * 0.12);
        const relL = wrapPI(moveYawNow - legYaw);
        const fComp = Math.cos(relL), lComp = Math.sin(relL);
        const s = Math.sin(phase);
        const amp = Math.min(0.62, sp * 0.012);
        const ampF = amp * Math.max(0.3, Math.abs(fComp));   // ayunan sejajar hadap kaki
        const ampL = amp * 0.85 * lComp;                     // shuffle menyamping
        hipL.rotation.x = s * ampF;
        hipR.rotation.x = -s * ampF;
        kneeL.rotation.x = Math.max(0, -s) * ampF * 1.1;   // lutut menekuk saat kaki mengayun balik
        kneeR.rotation.x = Math.max(0, s) * ampF * 1.1;
        hipL.rotation.z = s * ampL;   // kedua kaki membuka/menutup BERSAMA ke sisi gerak
        hipR.rotation.z = s * ampL;
        upperG.position.y = Math.sin(phase * 2) * amp * 0.22;   // bob halus badan atas
    } else if (realign) {
        // Seret langkah kecil saat kaki menyesuaikan hadap (turn-in-place) —
        // kaki tak boleh berputar diam-diam tanpa melangkah.
        phase += dt * 9;
        const s = Math.sin(phase);
        hipL.rotation.x = s * 0.16; hipR.rotation.x = -s * 0.16;
        kneeL.rotation.x = Math.max(0, -s) * 0.2; kneeR.rotation.x = Math.max(0, s) * 0.2;
        hipL.rotation.z *= 0.85; hipR.rotation.z *= 0.85;
        upperG.position.y *= Math.max(0, 1 - dt * 8);
    } else {
        const damp = Math.max(0, 1 - dt * 10);
        hipL.rotation.x *= damp; hipR.rotation.x *= damp;
        kneeL.rotation.x *= damp; kneeR.rotation.x *= damp;
        hipL.rotation.z *= damp; hipR.rotation.z *= damp;
        upperG.position.y *= damp;
    }
    // Kuda-kuda MELEE (menimpa pose kaki): kaki kiri melangkah menekuk ke depan,
    // kaki kanan menolak di belakang — mengikuti envelope merendah sabetan.
    if (inMelee && !dodgeActive && meleeDip > 0.01) {
        hipL.rotation.x = -0.5 * meleeDip;
        kneeL.rotation.x = 0.7 * meleeDip;
        hipR.rotation.x = 0.35 * meleeDip;
        kneeR.rotation.x = 0.95 * meleeDip;
        hipL.rotation.z *= 0.8; hipR.rotation.z *= 0.8;
    }

    if (marker && marker.visible) {
        markerT += dt;
        const k = 1 + Math.sin(markerT * 6) * 0.18;
        marker.scale.setScalar(3.2 * k);
        marker.material.opacity = 0.55 + Math.sin(markerT * 6) * 0.25;
    }
}
