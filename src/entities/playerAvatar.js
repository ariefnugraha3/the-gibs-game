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
import { camera, viewCam } from '../core/renderer.js';
import { GEO, player, robots, isPaused } from '../core/state.js';
import { aimPoint } from '../core/input.js';
import { eyeHCur, dodgeActive, dodgeProgress, dodgeDirX, dodgeDirZ } from './player.js';
import { currentWeapon, medkitMode, meleeT, MELEE_TIME, gunRecoil, switchAnim, meleeDirX, meleeDirZ } from './weapons.js';   // sirkular aman: dibaca di dalam fungsi

export let avatarGroup = null;
export let avatarGunTip = null;   // Object3D ujung laras (dibaca weapons.js)
let upperG = null, headG = null;  // badan ATAS (torso+kepala+lengan+senjata) & KEPALA — pemisahan atas/bawah 2026-07-12
let hipL = null, hipR = null, kneeL = null, kneeR = null;
let handL = null, handR = null;                    // telapak/sarung tangan (grup, diposisikan ke anchor tiap frame)
let armUpL = null, armLoL = null, armUpR = null, armLoR = null;   // segmen lengan tertarik
let elbowL = null, elbowR = null;                  // bantalan siku (ditempatkan ke titik siku fake-IK)
let phase = 0, lastX = 0, lastZ = 0;
// Rantai hadap manusiawi: kaki (root) -> puntiran pinggang (upperG) -> toleh kepala (headG)
let aimYaw = 0, legYaw = 0, twistCur = 0, headYawCur = 0;
let gaitSign = 1, backped = false, realign = false;   // arah siklus langkah + histeresis backpedal + turn-in-place
let deathT = -1, deathDirX = 0, deathDirZ = 1;        // animasi ROBOH kematian (>= 0 = berjalan); arah jatuh
let marker = null, markerT = 0;
// ===== IDLE AFK bertahap (2026-07-14) =====
let afkT = 0, afkMode = 'none', afkPoseT = 0;        // detik menganggur; mode aktif; waktu dalam mode
let lastAimX = 0, lastAimZ = 0;                       // deteksi gerak kursor (aim)
let gunGrpRef = null;                                 // grup senjata (utk digeletakkan saat rebahan)
const AFK_WAVE = 30, AFK_CROUCH = 60, AFK_LIE = 90, AFK_WAVE_DUR = 5;   // ambang tahap (detik)
const smoothstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// Titik genggam prop (ruang avatarGroup) dari GRIPS lokal + pitch senjata
// (rotasi X di pangkal gunGrp) — sama dgn transform anchor recoil.
function gripAnchor(g, pitch) {
    const c = Math.cos(pitch), s = Math.sin(pitch);
    return [GUN_OFF.x + g.x, GUN_OFF.y + g.y * c - g.z * s, GUN_OFF.z + g.y * s + g.z * c];
}
// TUNDUK/DONGAK kepala HARUS berporos di LEHER, bukan di origin grup (yang ada
// di kaki, y≈0) — kalau langsung set headG.rotation.x, kepala (mesh di y≈10.6)
// terlempar ~5 unit ke belakang. Kompensasi posisi headG agar titik setinggi
// leher tetap diam saat headG.rotation.x diputar (headG euler 'XYZ', rot.z=0,
// pivot di sumbu-Y => yaw tak mengganggu kompensasi). lerpHeadPitch = dekati
// sudut target lalu terapkan kompensasi.
const HEAD_PIVOT_Y = 9.9;
function lerpHeadPitch(target, k) {
    if (!headG) return;
    headG.rotation.x += (target - headG.rotation.x) * k;
    const c = Math.cos(headG.rotation.x), s = Math.sin(headG.rotation.x);
    headG.position.set(0, HEAD_PIVOT_Y * (1 - c), -HEAD_PIVOT_Y * s);
}
// State AFK utk smoke test (t detik, mode aktif).
export function afkDebug() { return { t: afkT, mode: afkMode }; }
let props = null, propKey = '';   // prop senjata/medkit aktif (show/hide per frame)
let armorNodes = null, armorKey = -1;   // overlay ARMOR kumulatif (ikuti player.armorLvl)
let swordPivot = null;            // pivot ayunan pedang (di bahu kanan; tampil saat melee)
let swooshGrp = null, swooshMat = null;   // kipas JEJAK tebasan (opacity ~ kecepatan ayunan)
const _qT = new THREE.Quaternion(), _tumbleAxis = new THREE.Vector3();   // salto dodge
const _segDir = new THREE.Vector3(), _yUnit = new THREE.Vector3(0, 1, 0);

// Bahu (ruang avatarGroup) — pangkal lengan tertarik.
const SHOULDER = { L: { x: -1.55, y: 9.1, z: 0.35 }, R: { x: 1.6, y: 9.1, z: 0.15 } };
const GUN_OFF = { x: 0.65, y: 7.5, z: 1.2 };   // posisi gunGrp (terkalibrasi — jangan geser)
// Titik genggam per prop (ruang LOKAL gunGrp): R = tangan pelatuk, L = tangan penahan depan.
// Kunci ber-suffix '3' = VARIAN VISUAL LEVEL 3 (upgrade shop; lihat blok prop Lv3 di init).
const GRIPS = {
    rifle: { R: { x: 0, y: -0.62, z: -0.08 }, L: { x: 0, y: -0.3, z: 2.2 } },
    pistol: { R: { x: 0, y: -0.5, z: 1.4 }, L: { x: -0.08, y: -0.66, z: 1.22 } },
    shotgun: { R: { x: 0, y: -0.36, z: -0.35 }, L: { x: 0, y: -0.44, z: 2.3 } },
    launcher: { R: { x: 0, y: -0.62, z: 0.5 }, L: { x: 0, y: -0.52, z: 2.35 } },
    medkit: { R: { x: 0.15, y: -1.45, z: -0.2 }, L: { x: -1.45, y: -1.45, z: -0.2 } },
    pistol3: { R: { x: 0, y: -0.55, z: 1.05 }, L: { x: -0.1, y: -0.72, z: 0.9 } },     // Desert Eagle: grip lebih ke belakang
    shotgun3: { R: { x: 0, y: -0.38, z: -0.4 }, L: { x: 0, y: -0.5, z: 2.6 } },        // pump lebih jauh ke depan
    rifle3: { R: { x: 0, y: -0.6, z: -1.15 }, L: { x: 0, y: -0.68, z: 1.5 } },         // Gatling: grip belakang + foregrip vertikal
    launcher3: { R: { x: 0.95, y: 1.55, z: 0.15 }, L: { x: 0.95, y: 1.6, z: 1.4 } },   // roket bahu: kedua tangan MENGGAPAI KE ATAS menahan tabung
};
// Ofset avatarGunTip per prop (default = kalibrasi lama 0/0.15/4.5 — JANGAN
// diubah). HANYA launcher3 yang memindah moncong ke ujung TABUNG BAHU supaya
// kilat tembakan & spawn peluru roket keluar dari tabungnya (hit test 2D/xz —
// beda tinggi tak mengubah gameplay; disengaja, permintaan user 2026-07-12).
const TIPS = {
    default: { x: 0, y: 0.15, z: 4.5 },
    launcher3: { x: 0.95, y: 2.45, z: 2.6 },
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
    // Material identitas KARAKTER (overhaul 2026-07-14): aksen AMBER khas (syal +
    // patch — senada aksen HUD), sarung tangan, karet, logam gesper/rel, lensa
    // goggle amber, kain hood. Phong warna polos = program shader sama (tanpa recompile).
    const accent = mat(0xc8862c, 16), glove = mat(0x25272b, 14), rubber = mat(0x141619, 6),
        metal = mat(0x9aa1a8, 70), glass = mat(0x86531c, 95), cloth = mat(0x394132, 8),
        accentDk = mat(0x8a5c1e, 12);

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
        const side = sx < 0 ? -1 : 1;
        const hip = new THREE.Group(); hip.position.set(sx, 6.0, 0); avatarGroup.add(hip);
        mk(new THREE.CylinderGeometry(0.78, 0.62, 2.6, 10), pants, 0, -1.3, 0, hip);   // paha (celana kargo)
        box(0.72, 0.85, 0.22, strap, side * 0.55, -1.35, 0.34, hip, false);            // kantong kargo paha
        box(0.74, 0.14, 0.24, dark, side * 0.55, -0.95, 0.36, hip, false);             // tutup kantong
        box(0.55, 0.32, 0.55, strap, 0, -1.95, 0, hip, false);                          // ikat paha bawah
        const knee = new THREE.Group(); knee.position.set(0, -2.6, 0); hip.add(knee);
        mk(ellip(0.56, 1.0, 0.85, 1.05, 10, 7), rubber, 0, 0.12, 0.34, knee, false);   // cangkang pelindung lutut
        mk(ellip(0.32, 1.0, 0.7, 0.85, 8, 6), strap, 0, 0.16, 0.52, knee, false);      // tempurung tengah
        mk(new THREE.CylinderGeometry(0.56, 0.44, 2.4, 10), pants, 0, -1.2, 0, knee, false);   // betis
        box(0.62, 0.32, 0.42, cloth, 0, -1.7, 0.12, knee, false);                       // gaiter/ikat betis
        mk(ellip(0.6, 1.05, 0.6, 1.4, 8, 6), boots, 0, -2.3, 0.3, knee, false);        // batang boot
        box(1.0, 0.28, 2.4, rubber, 0, -2.78, 0.55, knee, false);                       // sol
        mk(ellip(0.48, 1.0, 0.72, 0.85, 8, 6), boots, 0, -2.34, 1.1, knee, false);     // ujung kaki (toe)
        box(0.46, 0.5, 0.1, strap, 0, -2.05, 0.86, knee, false);                        // lidah/tali sepatu
        // Holster paha (kaki KANAN): pistol cadangan menyembul — khas & terbaca top-down
        if (side > 0) {
            box(0.64, 1.1, 0.46, strap, 0.8, -1.55, 0.18, hip, false);                  // sarung holster
            box(0.32, 0.66, 0.32, gun, 0.86, -1.08, 0.22, hip, false);                  // popor pistol menyembul
            box(0.5, 0.16, 0.5, dark, 0.8, -0.95, 0.18, hip, false);                     // tutup holster
        }
        return { hip, knee };
    };
    const lL = mkLeg(-0.95), lR = mkLeg(0.95);
    hipL = lL.hip; kneeL = lL.knee; hipR = lR.hip; kneeR = lR.knee;

    // ----- Badan ATAS (upperG): seragam + rompi taktis + kantong dada + ransel.
    // SABUK tetap di ROOT (garis pinggang milik badan bawah — puntiran torso
    // terlihat "patah" alami tepat di atas sabuk). -----
    const torsoG = new THREE.CylinderGeometry(1.5, 1.05, 3.9, 12, 1); torsoG.scale(1, 1, 0.72);
    mk(torsoG, fatig, 0, 7.85, 0, upperG);
    const vestG = new THREE.CylinderGeometry(1.66, 1.28, 2.95, 12, 1, true); vestG.scale(1, 1, 0.78);
    mk(vestG, vest, 0, 7.95, 0, upperG, false);
    box(0.12, 2.6, 0.16, dark, 0, 8.0, 1.16, upperG);       // plaket/retsleting depan
    // ----- CHEST RIG: baris 3 kantong magasin + tutup, kantong admin, pouch radio
    //       + ANTENA (elemen vertikal khas top-down), granat, name-tape amber. -----
    for (let i = -1; i <= 1; i++) {
        box(0.56, 0.84, 0.34, strap, i * 0.66, 8.32, 1.06, upperG);      // kantong magasin
        box(0.6, 0.16, 0.36, dark, i * 0.66, 8.7, 1.08, upperG);         // garis tutup (buckle)
    }
    box(0.82, 0.62, 0.32, strap, -0.02, 7.32, 1.1, upperG);             // kantong admin bawah
    box(0.5, 0.92, 0.42, strap, -1.02, 7.7, 0.6, upperG);              // pouch radio (kiri)
    cyl(0.06, 0.05, 2.4, dark, -1.12, 9.4, 0.5, upperG, 0);            // ANTENA radio (menjulur ke atas)
    box(0.34, 0.5, 0.3, dark, 0.98, 8.5, 0.72, upperG);               // granat asap (kanan)
    box(0.72, 0.3, 0.08, accent, 0, 8.98, 1.14, upperG);              // NAME-TAPE amber (patch dada)
    box(0.26, 2.5, 0.16, strap, -0.62, 8.2, 1.04, upperG).rotation.z = 0.16;   // tali harness diagonal
    box(0.26, 2.5, 0.16, strap, 0.62, 8.2, 1.04, upperG).rotation.z = -0.16;
    // ----- SYAL/SHEMAGH AMBER khas: melilit leher + terjuntai ke dada (identitas) -----
    mk(ellip(0.92, 1.2, 0.6, 1.15, 12, 7), accent, 0, 9.32, 0.12, upperG, false);   // lilitan leher
    box(0.68, 1.0, 0.24, accent, -0.16, 8.55, 1.22, upperG).rotation.z = 0.13;      // juntaian ke dada
    box(0.32, 0.66, 0.18, accentDk, -0.22, 7.95, 1.24, upperG).rotation.z = 0.22;
    // ----- Sabuk (badan bawah = root) + gesper + kantong utilitas + kantin -----
    mk(ellip(0.95, 1.5, 0.32, 0.95, 10, 5), strap, 0, 5.95, 0, avatarGroup, false);
    box(0.68, 0.5, 0.2, metal, 0, 5.95, 0.98, avatarGroup, false);                   // gesper
    box(0.64, 0.62, 0.4, strap, -1.2, 5.85, 0.35, avatarGroup, false);              // dump pouch kiri
    box(0.64, 0.62, 0.4, strap, 1.2, 5.85, 0.35, avatarGroup, false);               // pouch kanan
    mk(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10), fatig, 0.55, 5.9, -1.0, avatarGroup, false);   // kantin belakang
    mk(ellip(1.0, 2.05, 0.7, 0.95, 12, 6), fatig, 0, 9.55, 0, upperG, false);        // yoke bahu
    // ----- RANSEL ASSAULT: bodi + tutup atas + kantong sisi + tali kompresi
    //       + gulungan matras + antena panjang (silhouette top-down). -----
    box(1.7, 2.0, 0.85, strap, 0, 8.3, -1.28, upperG);                 // bodi ransel
    box(1.72, 0.85, 0.72, cloth, 0, 9.0, -1.4, upperG, false);         // tutup atas
    box(0.48, 1.5, 0.62, strap, -1.02, 8.1, -1.28, upperG, false);    // kantong sisi kiri
    box(0.48, 1.5, 0.62, strap, 1.02, 8.1, -1.28, upperG, false);     // kantong sisi kanan
    box(1.4, 0.14, 0.12, dark, 0, 8.62, -1.74, upperG, false);        // tali kompresi
    box(1.4, 0.14, 0.12, dark, 0, 7.9, -1.74, upperG, false);
    cyl(0.32, 0.32, 1.7, fatig, 0, 9.5, -1.25, upperG, 0).rotation.z = Math.PI / 2;   // gulungan matras
    cyl(0.05, 0.04, 2.6, dark, 0.72, 9.4, -1.6, upperG, 0).rotation.x = -0.18;        // antena panjang ransel
    // Bantalan bahu (statis — pangkal visual lengan tertarik) + patch/tab.
    mk(ellip(0.6, 1.1, 0.85, 1.05, 10, 7), fatig, SHOULDER.L.x, SHOULDER.L.y + 0.15, SHOULDER.L.z, upperG, false);
    mk(ellip(0.6, 1.1, 0.85, 1.05, 10, 7), fatig, SHOULDER.R.x, SHOULDER.R.y + 0.15, SHOULDER.R.z, upperG, false);
    box(0.5, 0.32, 0.5, accent, SHOULDER.L.x, SHOULDER.L.y + 0.5, SHOULDER.L.z + 0.18, upperG, false);   // patch bahu kiri amber
    mk(ellip(0.5, 1.0, 0.5, 1.0, 8, 6), strap, SHOULDER.R.x, SHOULDER.R.y + 0.42, SHOULDER.R.z + 0.1, upperG, false);   // tab bahu kanan

    // ----- Kepala (headG, di dalam upperG): leher + wajah + HELM — menoleh
    // sendiri (rotation.y) di atas puntiran torso; mesh terpusat di sumbu badan
    // sehingga pivot toleh di origin grup sudah benar. -----
    mk(new THREE.CylinderGeometry(0.5, 0.62, 0.9, 8), skin, 0, 9.95, 0, headG, false);   // leher
    mk(ellip(1.05, 0.95, 1.08, 0.98, 12, 10), skin, 0, 10.62, 0, headG);                  // kepala
    // Penutup wajah bawah (masker kain) — dari hidung ke dagu (misterius, berkarakter)
    mk(ellip(0.86, 1.0, 0.6, 0.95, 10, 7), cloth, 0, 10.2, 0.48, headG, false);
    box(0.86, 0.5, 0.18, cloth, 0, 10.12, 0.9, headG, false);
    // Helm + pinggiran
    const domeG = new THREE.SphereGeometry(1.22, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);
    domeG.scale(1.04, 0.94, 1.08);
    mk(domeG, helmet, 0, 10.78, -0.02, headG, false);
    mk(new THREE.CylinderGeometry(1.24, 1.32, 0.2, 12), helmet, 0, 10.7, 0, headG, false);   // pinggiran helm
    // Rel samping helm + dudukan NVG dahi + strap dagu (aksesori taktis)
    box(0.12, 0.4, 1.4, dark, -1.16, 10.95, 0, headG, false);
    box(0.12, 0.4, 1.4, dark, 1.16, 10.95, 0, headG, false);
    box(0.5, 0.42, 0.32, dark, 0, 11.2, 0.92, headG, false);         // mount NVG di dahi
    cyl(0.05, 0.05, 0.9, dark, 0, 11.34, 1.1, headG, Math.PI / 2);   // batang NVG kecil
    box(0.12, 0.85, 0.12, strap, 0.88, 10.16, 0.5, headG, false);    // strap dagu
    // GOGGLE: strap keliling + dua LENSA AMBER (menggantikan "mata" polos)
    mk(new THREE.CylinderGeometry(1.16, 1.16, 0.44, 14, 1, true), rubber, 0, 10.64, 0, headG, false);
    mk(ellip(0.32, 1.05, 0.82, 0.5, 8, 6), glass, -0.4, 10.66, 0.86, headG, false);   // lensa kiri
    mk(ellip(0.32, 1.05, 0.82, 0.5, 8, 6), glass, 0.4, 10.66, 0.86, headG, false);    // lensa kanan
    box(0.24, 0.22, 0.2, dark, 0, 10.62, 0.9, headG, false);                          // jembatan goggle
    // HEADSET: cangkir telinga kiri+kanan + BOOM MIC melengkung ke mulut (khas)
    mk(ellip(0.42, 0.7, 1.0, 1.0, 8, 6), dark, -1.14, 10.5, 0.05, headG, false);
    mk(ellip(0.42, 0.7, 1.0, 1.0, 8, 6), dark, 1.14, 10.5, 0.05, headG, false);
    cyl(0.045, 0.045, 1.5, dark, -1.12, 10.15, 0.7, headG, 0).rotation.x = -0.7;      // boom mic
    mk(ellip(0.12, 1, 1, 1, 6, 5), dark, -0.68, 10.02, 1.16, headG, false);           // kepala mic
    // Kerah kain terangkat di belakang leher (kontur silhouette)
    mk(ellip(0.7, 1.35, 0.5, 0.8, 10, 6), cloth, 0, 10.05, -0.7, headG, false);

    // ----- LENGAN TERTARIK (2026-07-12): 2 segmen silinder unit (di-scale
    // panjangnya per frame oleh placeSeg) + telapak yang menempel di anchor
    // genggaman prop aktif. Tidak ada lagi pivot bahu/siku FK. -----
    const upGeo = new THREE.CylinderGeometry(0.38, 0.32, 1, 8);   // lengan atas (seragam)
    const loGeo = new THREE.CylinderGeometry(0.31, 0.25, 1, 8);   // lengan bawah
    armUpL = mk(upGeo, fatig, 0, 0, 0, upperG, false);
    armLoL = mk(loGeo, fatig, 0, 0, 0, upperG, false);
    armUpR = mk(upGeo, fatig, 0, 0, 0, upperG, false);
    armLoR = mk(loGeo, fatig, 0, 0, 0, upperG, false);
    elbowL = mk(ellip(0.34, 1.0, 0.95, 1.0, 8, 6), rubber, 0, 0, 0, upperG, false);   // bantalan siku
    elbowR = mk(ellip(0.34, 1.0, 0.95, 1.0, 8, 6), rubber, 0, 0, 0, upperG, false);
    // Sarung tangan taktis: grup (telapak + punggung buku jari) — dipindah ke
    // anchor grip tiap frame (placeArm); detail buku jari halus di sisi punggung.
    const mkHand = () => {
        const g = new THREE.Group();
        mk(ellip(0.44, 1.0, 0.82, 1.05, 8, 6), glove, 0, 0, 0, g, false);   // telapak
        mk(ellip(0.3, 1.2, 0.5, 1.0, 7, 5), dark, 0, 0.24, 0.16, g, false); // pelat punggung tangan
        upperG.add(g);
        return g;
    };
    handL = mkHand(); handR = mkHand();

    // ----- Grup senjata + prop per-slot. gunGrp & avatarGunTip DI POSISI LAMA
    // (terkalibrasi — titik spawn peluru & kilat muzzle tidak boleh bergeser). -----
    const gunGrp = new THREE.Group();
    gunGrp.position.set(GUN_OFF.x, GUN_OFF.y, GUN_OFF.z);
    upperG.add(gunGrp);   // senjata milik badan ATAS (ikut puntiran torso ke kursor)
    gunGrpRef = gunGrp;   // dipakai animasi AFK rebahan (senjata digeletakkan di samping)
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

    // ===== VARIAN VISUAL LEVEL 3 (2026-07-12, permintaan user): mencapai Lv3
    // di shop MENGUBAH BENTUK senjata di tangan — pistol jadi DESERT EAGLE
    // perak besar, shotgun jadi combat shotgun panjang, rifle jadi GATLING
    // multi-laras, launcher jadi ROCKET LAUNCHER tabung di ATAS BAHU kanan.
    // Material Phong warna baru = program shader sama (tanpa recompile). =====
    const chrome = mat(0xc3c9cf, 45), olive = mat(0x4f5731),
        band = mat(0xc9a227), shellRed = mat(0x8e2f23);
    // --- Pistol Lv3: DESERT EAGLE — slide slab perak panjang, celah ventilasi
    // moncong khas, rel atas, grip karet hitam besar ---
    const pPistol3 = prop();
    box(0.5, 0.56, 2.6, chrome, 0, 0.26, 1.6, pPistol3, true);     // slide slab
    box(0.34, 0.2, 2.5, gun, 0, 0.62, 1.55, pPistol3);             // rel/rib atas
    box(0.4, 0.34, 1.5, chrome, 0, -0.05, 1.5, pPistol3);          // frame bawah
    box(0.52, 0.1, 0.12, dark, 0, 0.5, 2.62, pPistol3);            // celah ventilasi moncong
    box(0.52, 0.1, 0.12, dark, 0, 0.5, 2.4, pPistol3);
    box(0.3, 0.95, 0.5, dark, 0, -0.62, 1.05, pPistol3).rotation.x = 0.22;   // grip karet
    box(0.1, 0.34, 0.62, gun, 0, -0.28, 1.62, pPistol3);           // lingkar pelatuk
    box(0.12, 0.2, 0.16, gun, 0, 0.3, 0.42, pPistol3);             // hammer
    box(0.08, 0.18, 0.12, dark, 0, 0.66, 0.5, pPistol3);           // pisir belakang
    box(0.08, 0.2, 0.12, dark, 0, 0.68, 2.72, pPistol3);           // pisir depan
    // --- Shotgun Lv3: combat shotgun BESAR — laras & tabung magasin panjang,
    // pelindung panas berrusuk, rem moncong, sadel peluru cadangan merah ---
    const pShotgun3 = prop();
    box(0.52, 0.68, 1.7, gun, 0, 0, 0.2, pShotgun3, true);         // receiver besar
    cyl(0.18, 0.18, 4.2, gun, 0, 0.16, 2.5, pShotgun3, Math.PI / 2);   // laras panjang
    cyl(0.2, 0.2, 0.34, dark, 0, 0.16, 4.5, pShotgun3, Math.PI / 2);   // rem moncong
    cyl(0.13, 0.13, 3.6, gun, 0, -0.18, 2.3, pShotgun3, Math.PI / 2);  // tabung magasin penuh
    box(0.3, 0.08, 0.5, dark, 0, 0.42, 1.4, pShotgun3);            // rusuk pelindung panas
    box(0.3, 0.08, 0.5, dark, 0, 0.42, 2.1, pShotgun3);
    box(0.3, 0.08, 0.5, dark, 0, 0.42, 2.8, pShotgun3);
    box(0.56, 0.5, 1.05, dark, 0, -0.2, 2.6, pShotgun3);           // pump besar
    box(0.14, 0.3, 0.5, shellRed, 0.34, 0.14, -0.1, pShotgun3);    // sadel peluru cadangan
    box(0.46, 0.66, 1.4, wood, 0, -0.12, -1.2, pShotgun3);         // popor
    box(0.5, 0.72, 0.22, dark, 0, -0.12, -1.95, pShotgun3);        // bantalan recoil
    // --- Rifle Lv3: GATLING GUN — 6 laras tipis mengitari sumbu + ring
    // penahan, rumah rotor silinder, kotak amunisi bawah, gagang jinjing ---
    const pRifle3 = prop();
    box(0.72, 0.9, 2.2, gun, 0, -0.05, -0.5, pRifle3, true);       // receiver besar
    cyl(0.5, 0.55, 1.3, dark, 0, 0.05, 0.9, pRifle3, Math.PI / 2); // rumah rotor
    for (let i = 0; i < 6; i++) {                                  // cluster 6 laras
        const a = i * Math.PI / 3;
        cyl(0.09, 0.09, 3.4, gun, Math.cos(a) * 0.28, 0.05 + Math.sin(a) * 0.28, 3.0,
            pRifle3, Math.PI / 2);
    }
    cyl(0.4, 0.4, 0.22, dark, 0, 0.05, 4.0, pRifle3, Math.PI / 2); // ring penahan depan
    cyl(0.42, 0.42, 0.22, dark, 0, 0.05, 2.2, pRifle3, Math.PI / 2);   // ring tengah
    box(0.5, 0.9, 0.9, dark, 0, -0.95, -0.55, pRifle3);            // kotak amunisi
    box(0.24, 0.6, 0.34, gun, 0, -0.62, -1.2, pRifle3).rotation.x = 0.25;   // grip belakang
    box(0.2, 0.7, 0.3, gun, 0, -0.7, 1.5, pRifle3);                // foregrip vertikal
    box(0.16, 0.24, 1.2, gun, 0, 0.62, -0.5, pRifle3);             // gagang jinjing atas
    // --- Launcher Lv3: ROCKET LAUNCHER (gaya AT4) — tabung olive panjang
    // DI ATAS BAHU KANAN (menjulur melewati kepala ke depan & belakang),
    // bibir moncong + corong exhaust, pita kuning, unit bidik, dua grip bawah;
    // kedua tangan menggapai ke atas menahannya (GRIPS.launcher3). ---
    const pLauncher3 = prop();
    cyl(0.5, 0.5, 7.0, olive, 0.95, 2.45, -1.0, pLauncher3, Math.PI / 2, true);   // tabung utama
    cyl(0.62, 0.58, 0.55, dark, 0.95, 2.45, 2.35, pLauncher3, Math.PI / 2);       // bibir moncong
    cyl(0.58, 0.7, 0.6, dark, 0.95, 2.45, -4.35, pLauncher3, Math.PI / 2);        // corong exhaust belakang
    cyl(0.52, 0.52, 0.35, band, 0.95, 2.45, 1.5, pLauncher3, Math.PI / 2);        // pita kuning
    box(0.32, 0.42, 1.05, dark, 0.95, 3.15, 0.3, pLauncher3);      // unit bidik atas
    box(0.26, 0.62, 0.3, gun, 0.95, 1.75, 0.15, pLauncher3);       // grip pelatuk
    box(0.26, 0.56, 0.3, gun, 0.95, 1.8, 1.4, pLauncher3);         // grip dukung depan

    props = {
        rifle: pRifle, pistol: pPistol, shotgun: pShotgun, launcher: pLauncher,
        medkit: pMedkit,
        pistol3: pPistol3, shotgun3: pShotgun3, rifle3: pRifle3, launcher3: pLauncher3,
    };
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

    // ===== OVERLAY ARMOR (2026-07-13): tiga set KUMULATIF mengikuti
    // player.armorLvl (item shop Survival) — tiap tier menambah lapisan di atas
    // tier sebelumnya: makin tinggi makin sangar, tetap tentara manusia (pelat
    // baja + trim + aksen merah, BUKAN robot). Pelat kaki di-parent ke pivot
    // pinggul/lutut (ikut melangkah); dibuat sekali & disembunyikan (warmup
    // preload mengompilasi shader-nya; Phong = program sama). Saat armor pecah
    // (durability 0) semua lapisan lenyap + pecahan pelat via gib (robots.js). =====
    const aPlate = mat(0x6a7178, 32), aTrim = mat(0x373d44, 22), aRed = mat(0x8e2f23, 26);
    armorNodes = [[], [], []];
    const reg = (lv, node) => { node.visible = false; armorNodes[lv].push(node); return node; };
    // --- SET 1 (Armor I): pelat dada + tutup bahu + pelindung paha ---
    reg(0, box(1.9, 1.5, 0.34, aPlate, 0, 8.3, 1.22, upperG));
    reg(0, mk(ellip(0.68, 1.1, 0.72, 1.05, 8, 6), aPlate, SHOULDER.L.x - 0.12, SHOULDER.L.y + 0.42, SHOULDER.L.z, upperG, false));
    reg(0, mk(ellip(0.68, 1.1, 0.72, 1.05, 8, 6), aPlate, SHOULDER.R.x + 0.12, SHOULDER.R.y + 0.42, SHOULDER.R.z, upperG, false));
    reg(0, box(0.62, 1.5, 0.34, aPlate, -0.06, -1.3, 0.5, hipL));
    reg(0, box(0.62, 1.5, 0.34, aPlate, 0.06, -1.3, 0.5, hipR));
    // --- SET 2 (Armor II, + di atas Set 1): bibir pauldron besar, pelat
    // punggung menutup ransel, pelat sabuk, pelindung tulang kering, alis helm ---
    reg(1, mk(ellip(0.85, 1.18, 0.5, 1.12, 8, 6), aTrim, SHOULDER.L.x - 0.18, SHOULDER.L.y + 0.78, SHOULDER.L.z, upperG, false));
    reg(1, mk(ellip(0.85, 1.18, 0.5, 1.12, 8, 6), aTrim, SHOULDER.R.x + 0.18, SHOULDER.R.y + 0.78, SHOULDER.R.z, upperG, false));
    reg(1, box(1.85, 2.0, 0.25, aPlate, 0, 8.3, -1.78, upperG));
    reg(1, box(1.5, 0.55, 0.4, aPlate, 0, 5.95, 0.85, avatarGroup));
    reg(1, box(0.56, 1.3, 0.3, aPlate, 0, -1.35, 0.5, kneeL));
    reg(1, box(0.56, 1.3, 0.3, aPlate, 0, -1.35, 0.5, kneeR));
    reg(1, box(1.6, 0.4, 0.35, aTrim, 0, 11.02, 0.88, headG));
    // --- SET 3 (Armor III, + di atas Set 1+2): kerah pelindung leher, jalur
    // merah dada, trim pauldron merah, pelat pipi helm, JAMBUL crest merah ---
    reg(2, cyl(1.0, 1.2, 0.6, aTrim, 0, 9.6, 0, upperG, 0));
    reg(2, box(0.46, 1.44, 0.12, aRed, 0, 8.3, 1.42, upperG));
    reg(2, box(1.0, 0.22, 1.2, aRed, SHOULDER.L.x - 0.18, SHOULDER.L.y + 1.08, SHOULDER.L.z, upperG));
    reg(2, box(1.0, 0.22, 1.2, aRed, SHOULDER.R.x + 0.18, SHOULDER.R.y + 1.08, SHOULDER.R.z, upperG));
    reg(2, box(0.34, 0.66, 0.9, aPlate, -1.12, 10.55, 0.08, headG));
    reg(2, box(0.34, 0.66, 0.9, aPlate, 1.12, 10.55, 0.08, headG));
    reg(2, box(0.16, 0.34, 1.5, aRed, 0, 11.52, -0.05, headG));

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

// ===== FAST-ROPE / RAPPEL (2026-07-17, cutscene intro): pose meluncur turun
// dari tali heli — badan tegak MENGGANTUNG, KEDUA tangan meraih tali di ATAS
// kepala, kaki menjuntai rapat sedikit menekuk + ayunan lembut, kepala menunduk
// melihat pendaratan; mendekati dasar (rappelK→1) lutut MENEKUK meredam
// pendaratan. Dipakai intro.js: setAvatarRappel(true, k, yaw) tiap frame fase
// 'descend', lalu setAvatarRappel(false) saat menyentuh atap. Prop senjata
// disembunyikan (kedua tangan di tali; senapan "terslempang"). =====
let rappelActive = false, rappelK = 0, rappelYaw = 0, rappelClock = 0;
export function setAvatarRappel(on, k = 0, yaw = 0) {
    if (on && !rappelActive) rappelClock = 0;   // reset ayunan saat mulai
    rappelActive = !!on;
    rappelK = k;
    rappelYaw = yaw;
}
export function rappelDebug() { return { active: rappelActive, k: rappelK }; }

// Terapkan pose fast-rope (dipanggil updatePlayerAvatar saat rappelActive; early
// return seperti cabang kematian). Visual murni — posisi logika tak disentuh.
function poseRappel(dt) {
    rappelClock += dt;
    const s = Math.sin(rappelClock * 2.2);        // ayunan cepat (goyang badan)
    const s2 = Math.sin(rappelClock * 1.3);       // ayunan lambat (putaran halus)
    const land = rappelK > 0.82 ? (rappelK - 0.82) / 0.18 : 0;   // 0..1 redam pendaratan
    // Seluruh badan menghadap yaw + goyang halus (tergantung di tali)
    avatarGroup.rotation.set(0, rappelYaw + s2 * 0.12, s * 0.05);
    legYaw = rappelYaw;
    // Torso sedikit condong + goyang; kepala MENUNDUK melihat ke bawah
    upperG.rotation.set(-0.08, s2 * 0.18, s * 0.06);
    upperG.position.set(0, 0, 0);
    const lp = Math.min(1, dt * 6);
    lerpHeadPitch(0.34, lp);
    headG.rotation.y += (s2 * 0.18 - headG.rotation.y) * lp;
    // Kaki menjuntai rapat, sedikit menekuk + ayunan gunting; menekuk saat mendarat
    hipL.rotation.x = 0.30 + s * 0.12 + land * 0.30;
    hipR.rotation.x = 0.26 - s * 0.12 + land * 0.30;
    kneeL.rotation.x = 0.50 + land * 0.60;
    kneeR.rotation.x = 0.46 + land * 0.60;
    hipL.rotation.z = 0.05; hipR.rotation.z = -0.05;
    kneeL.rotation.z = 0; kneeR.rotation.z = 0;
    // KEDUA tangan meraih tali di ATAS kepala (dekat pusat badan = garis tali)
    placeArm('R', 0.7, 12.0 + s * 0.25, 1.3);
    placeArm('L', -0.7, 12.2 - s * 0.25, 1.1);
    // Sembunyikan prop senjata/pedang (kedua tangan di tali)
    if (props && propKey !== '__rappel') {
        for (const q in props) props[q].visible = false;
        if (swordPivot) swordPivot.visible = false;
        if (swooshGrp) swooshGrp.visible = false;
        propKey = '__rappel';
    }
}

// Dipanggil resetGame: batalkan pose mati + paksa evaluasi ulang prop senjata.
export function resetAvatarDeath() {
    rappelActive = false;   // batalkan pose rappel intro juga
    deathT = -1;
    propKey = '';
    afkT = 0; afkMode = 'none'; afkPoseT = 0;   // batalkan idle AFK
    if (gunGrpRef) { gunGrpRef.position.set(GUN_OFF.x, GUN_OFF.y, GUN_OFF.z); gunGrpRef.rotation.set(0, 0, 0); }
    if (headG) { headG.rotation.x = 0; headG.position.set(0, 0, 0); }   // kepala kembali ke leher
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
        elbowL.position.set(ex, ey, ez);
        handL.position.set(hx, hy, hz);
    } else {
        placeSeg(armUpR, S.x, S.y, S.z, ex, ey, ez);
        placeSeg(armLoR, ex, ey, ez, hx, hy, hz);
        elbowR.position.set(ex, ey, ez);
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

    // Overlay ARMOR mengikuti tier yang dikenakan (kumulatif; 0 = polos).
    // Diperiksa SEBELUM cabang mati supaya armor yang pecah pada pukulan
    // mematikan tetap lenyap dari jasad (pecahannya terlempar via gib).
    const aLvl = player.armorLvl || 0;
    if (armorNodes && aLvl !== armorKey) {
        for (let s = 0; s < armorNodes.length; s++)
            for (const n of armorNodes[s]) n.visible = s < aLvl;
        armorKey = aLvl;
    }

    // ===== FAST-ROPE intro (2026-07-17): pose meluncur turun dari tali —
    // early-return sebelum rantai-hadap/aim (seperti cabang mati). =====
    if (rappelActive) { poseRappel(dt); return; }

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
        if (headG.rotation.x !== 0 || headG.position.y !== 0) lerpHeadPitch(0, rel);   // luruhkan tunduk kepala sisa AFK
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
    // Saat MELEE (2026-07-16): hadapkan badan ke ARAH TEBASAN (meleeDir = robot
    // terjangkau terdekat, auto-pilih di tryMelee) — bukan kursor; jadi character
    // otomatis berputar menebas robot yang menempel walau kursor di arah lain.
    if (meleeT > 0 && (meleeDirX || meleeDirZ)) aimYaw = Math.atan2(meleeDirX, meleeDirZ);
    // Kecepatan horizontal NYATA (WASD ataupun klik-kanan) + arah geraknya.
    const vx = dt > 0 ? (px - lastX) / dt : 0, vz = dt > 0 ? (pz - lastZ) / dt : 0;
    const sp = Math.hypot(vx, vz);
    lastX = px; lastZ = pz;
    const moving = sp > 1;
    const inMelee = meleeT > 0;
    let moveYawNow = legYaw;
    // (RANTAI HADAP/AIM CHAIN — legYaw/twist/head — dipindah ke BAWAH blok AFK
    // 2026-07-14: saat AFK aktif, aim chain TIDAK boleh mengutak-atik legYaw
    // sehingga pose rebahan/jongkok tak "berkelahi" dengan bidikan kursor —
    // dulu itu bikin badan miring salah & kaki bergerak seperti gagal menata.)

    // ===== IDLE AFK BERTAHAP (2026-07-14) — player DIAM TOTAL & TAK ADA ANCAMAN:
    //  +30 dtk: berbalik ke KAMERA sambil MELAMBAI ("Heyy, kamu di sana?"), lalu
    //           kembali normal. +60 dtk: JONGKOK sambil sesekali MENGINTIP kamera
    //           (memastikan player kembali). +90 dtk: REBAHAN telentang, tangan di
    //           belakang kepala, senjata DIGELETAKKAN di samping. Gerak / tembak /
    //           ganti senjata / gerak kursor / musuh mengejar = reset seketika. =====
    const aimDX = aimPoint ? aimPoint.x - lastAimX : 0, aimDZ = aimPoint ? aimPoint.z - lastAimZ : 0;
    const aimMoved = (aimDX * aimDX + aimDZ * aimDZ) > 1;
    if (aimPoint) { lastAimX = aimPoint.x; lastAimZ = aimPoint.z; }
    let anyThreat = false;
    for (let i = 0; i < robots.length; i++) {
        const s = robots[i].state;
        if (s === 'chasing' || s === 'jumping') { anyThreat = true; break; }
    }
    const afkBlocked = !aimPoint || isPaused || moving || inMelee || dodgeActive || medkitMode
        || gunRecoil > 0.05 || switchAnim >= 0 || aimMoved || anyThreat;
    if (afkBlocked) afkT = 0; else afkT += dt;

    let mode = 'none';
    if (afkT >= AFK_LIE) mode = 'lie';
    else if (afkT >= AFK_CROUCH) mode = 'crouch';
    else if (afkT >= AFK_WAVE && afkT < AFK_WAVE + AFK_WAVE_DUR) mode = 'wave';
    if (mode !== afkMode) { afkMode = mode; afkPoseT = 0; }
    afkPoseT += dt;

    if (mode !== 'none') {
        if (props) propKey = '__afk';   // paksa evaluasi ulang prop saat keluar AFK
        const base = currentWeapon;     // medkitMode diblok -> selalu senjata
        const key = props && props[base + '3']
            && ((player.weaponLvl && player.weaponLvl[base]) || 1) >= 3 ? base + '3' : base;
        const G = GRIPS[key] || GRIPS.rifle;
        const camYaw = Math.atan2(viewCam.position.x - px, viewCam.position.z - pz);   // yaw menghadap kamera
        const lp = Math.min(1, dt * 6);

        if (mode === 'wave') {
            // -- MELAMBAI: berbalik menghadap kamera, tangan kanan terangkat & mengayun.
            const p = (afkT - AFK_WAVE) / AFK_WAVE_DUR;                 // 0..1
            const turn = smoothstep(p / 0.22);
            legYaw = approachAngle(legYaw, camYaw, dt * 5);
            avatarGroup.rotation.set(0, legYaw, 0);
            upperG.rotation.y += (0 - upperG.rotation.y) * lp;
            headYawCur += (Math.sin(afkPoseT * 3) * 0.1 - headYawCur) * lp;
            headG.rotation.y = headYawCur;
            lerpHeadPitch(-0.42 * turn, lp);         // mendongak menatap kamera (poros di leher)
            const dl = Math.min(1, dt * 8);                            // kaki berdiri santai
            hipL.rotation.x *= 1 - dl; hipR.rotation.x *= 1 - dl;
            kneeL.rotation.x *= 1 - dl; kneeR.rotation.x *= 1 - dl;
            hipL.rotation.z *= 1 - dl; hipR.rotation.z *= 1 - dl;
            upperG.position.y += (0 - upperG.position.y) * dl;
            const gp = 0.7 * turn;                                     // muzzle diturunkan sopan
            if (props[key]) props[key].rotation.x = gp;
            const la = gripAnchor(G.L, gp); placeArm('L', la[0], la[1], la[2]);   // tangan kiri di senjata
            const wamt = smoothstep((p - 0.18) / 0.14) * (1 - smoothstep((p - 0.82) / 0.18));
            const ra = gripAnchor(G.R, gp);
            const sway = Math.sin(afkPoseT * 9);
            const wX = 1.5 + sway * 0.95, wY = 10.0, wZ = 1.7;         // tangan kanan melambai tinggi
            placeArm('R', ra[0] + (wX - ra[0]) * wamt, ra[1] + (wY - ra[1]) * wamt, ra[2] + (wZ - ra[2]) * wamt);
            return;
        }

        if (mode === 'crouch') {
            // -- JONGKOK: badan merendah, lutut menekuk; sesekali MENGINTIP kamera.
            const ci = smoothstep(afkPoseT / 1.0);
            avatarGroup.rotation.set(0, legYaw, 0);
            const cyc = afkPoseT % 6.5;                                // siklus intip ~6.5 dtk
            const peek = cyc < 1.8 ? Math.sin((cyc / 1.8) * Math.PI) : 0;
            const rel = wrapPI(camYaw - legYaw);
            twistCur = approachAngle(twistCur, clampT(rel) * 0.55 * peek, dt * 6);
            upperG.rotation.y = twistCur;
            const hd = wrapPI(camYaw - legYaw - twistCur);
            headYawCur = approachAngle(headYawCur, Math.max(-HEAD_TWIST, Math.min(HEAD_TWIST, hd)) * peek, dt * 8);
            headG.rotation.y = headYawCur;
            lerpHeadPitch(-0.3 * peek, lp);          // mendongak mengintip kamera (poros di leher)
            hipL.rotation.x = -0.72 * ci; hipR.rotation.x = -0.72 * ci;   // merendah
            kneeL.rotation.x = 1.35 * ci; kneeR.rotation.x = 1.35 * ci;
            hipL.rotation.z = 0.1 * ci; hipR.rotation.z = -0.1 * ci;
            avatarGroup.position.y = feetY - 1.7 * ci;
            upperG.position.y += (0 - upperG.position.y) * lp;
            if (props[key]) props[key].rotation.x = 0;                 // senjata dipegang normal
            const ra = gripAnchor(G.R, 0), la = gripAnchor(G.L, 0);
            placeArm('R', ra[0], ra[1], ra[2]); placeArm('L', la[0], la[1], la[2]);
            return;
        }

        // -- REBAHAN: telentang (tumbang mundur di pivot kaki), tangan di belakang
        //    kepala, senjata DIGELETAKKAN rata di samping badan.
        const li = smoothstep(afkPoseT / 1.4);
        legYaw = approachAngle(legYaw, 0, dt * 4);                     // sejajar sumbu layar
        avatarGroup.rotation.set(-(Math.PI / 2) * li, legYaw, 0);      // TERLENTANG (tumbang ke belakang, wajah ke atas)
        avatarGroup.position.y = feetY + 1.5 * li;                     // punggung beristirahat di lantai
        upperG.rotation.y += (0 - upperG.rotation.y) * lp; twistCur = upperG.rotation.y;
        upperG.position.y += (0 - upperG.position.y) * lp;
        headYawCur += (0 - headYawCur) * lp; headG.rotation.y = headYawCur;
        lerpHeadPitch(0.14 * li, lp);                                 // dagu sedikit ke dada (bersandar di tangan)
        hipL.rotation.x = 0.0; kneeL.rotation.x = 0.12 + 0.04 * Math.sin(afkPoseT * 1.1);   // napas
        hipR.rotation.x = -0.12 * li; kneeR.rotation.x = 0.45 * li;   // satu lutut sedikit terangkat (santai)
        hipL.rotation.z = 0; hipR.rotation.z = 0;
        placeArm('L', -1.05, 10.95, -0.9);                            // TANGAN DI BELAKANG KEPALA (siku mengembang)
        placeArm('R', 1.05, 10.95, -0.9);
        if (props[key]) {                                             // SENJATA di samping, rata tanah
            props[key].rotation.x = 0;
            gunGrpRef.position.set(
                GUN_OFF.x + (2.5 - GUN_OFF.x) * li,
                GUN_OFF.y + (6.8 - GUN_OFF.y) * li,
                GUN_OFF.z + (-1.3 - GUN_OFF.z) * li);
            gunGrpRef.rotation.x = -(Math.PI / 2) * li;
        }
        return;
    }
    // Keluar AFK: kembalikan senjata ke tangan + luruhkan tunduk kepala sisa AFK.
    if (gunGrpRef && (gunGrpRef.rotation.x !== 0 || gunGrpRef.position.z !== GUN_OFF.z)) {
        gunGrpRef.position.set(GUN_OFF.x, GUN_OFF.y, GUN_OFF.z);
        gunGrpRef.rotation.set(0, 0, 0);
    }
    if (headG.rotation.x !== 0 || headG.position.y !== 0) lerpHeadPitch(0, Math.min(1, dt * 8));

    // ===== RANTAI HADAP (dipindah ke sini dari atas 2026-07-14 — HANYA jalan bila
    // AFK tak mengambil alih [blok di atas return duluan]): kaki menghadap arah
    // gerak, torso memuntir ke kursor, kepala menoleh lebih dulu. =====
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

    // Prop terlihat = medkit saat medkitMode, selain itu senjata aktif — dengan
    // VARIAN LEVEL 3 (2026-07-12): senjata yang di-upgrade sampai Lv3 di shop
    // memakai bentuk 'X3' (Desert Eagle / combat shotgun / Gatling / roket bahu).
    // Selama sabetan melee (meleeT > 0): senjata disembunyikan, PEDANG tampil.
    const base = medkitMode ? 'medkit' : currentWeapon;
    const key = !medkitMode && props && props[base + '3']
        && ((player.weaponLvl && player.weaponLvl[base]) || 1) >= 3 ? base + '3' : base;
    const showKey = inMelee ? '__melee' : key;
    if (props && showKey !== propKey) {
        for (const k in props) props[k].visible = !inMelee && k === key;
        if (swordPivot) swordPivot.visible = inMelee;
        // Moncong per prop: default = ofset kalibrasi lama (JANGAN geser);
        // launcher3 = ujung tabung roket di bahu (kilat & spawn roket pindah ke sana).
        const tp = TIPS[key] || TIPS.default;
        avatarGunTip.position.set(tp.x, tp.y, tp.z);
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
        const wc = CFG.weapons[base];   // config per senjata DASAR (varian Lv3 tak punya entri CFG)
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
