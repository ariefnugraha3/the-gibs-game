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
// tuck), dan TEBASAN DUA PISAU BELATI melee (overhaul 2026-07-29 — satu pivot
// pisau per bahu, kedua tangan mengikuti gagangnya; menggantikan sabetan pedang
// tunggal: "tentara zaman modern tidak mengibaskan pedang").

import { CFG } from '../core/config.js';
import { camera, viewCam } from '../core/renderer.js';
import { GEO, player, robots, isPaused } from '../core/state.js';
import { aimPoint } from '../core/input.js';
import { eyeHCur, dodgeActive, dodgeProgress, dodgeDirX, dodgeDirZ } from './player.js';
import { currentWeapon, medkitMode, meleeT, MELEE_TIME, gunRecoil, switchAnim, meleeDirX, meleeDirZ, meleeSide, shotT, shotDur, shotKick, shotSide, recoilStack } from './weapons.js';   // sirkular aman: dibaca di dalam fungsi

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
// ===== KEMATIAN DRAMATIS 4 FASE (2026-07-26) — lihat poseDeath() di bawah =====
let deathT = -1, deathDirX = 0, deathDirZ = 1;        // jam animasi (>= 0 = berjalan); arah jatuh
let deathPhase = 'none';                              // 'impact'|'buckle'|'fall'|'settle'|'still'
let deathSpin = 1;                                    // sisi puntiran badan saat dihentak (acak per kematian)
let deathHand0 = null;                                // posisi telapak saat ajal (agar fase hentak tak "teleport")
let gunFly = null;                                    // senjata TERLEPAS: balistik + tumbling di ruang scene
let dbgFall = 0, dbgRoll = 0, dbgSink = 0;            // nilai kurva terakhir (utk avatarDeathDebug)
// ===== GULINGAN TEMPUR (dodge) =====
let dodgeSide = 1;        // +1/-1 bahu tumpuan gulingan (dipilih saat dodge mulai)
let dodgeSideAlt = 1;     // penggilir sisi utk guling maju/mundur murni
let dodgePrev = false;    // dodgeActive frame lalu (deteksi mulai/selesai)
let landT = 0;            // sisa detik fase RECOVER pendaratan (setelah dodge)
let marker = null, markerT = 0;
let fireHeadCur = 0;   // anggukan kepala hentakan tembakan frame lalu (agar kembali TEPAT ke 0)
// ===== IDLE AFK bertahap (2026-07-14) =====
let afkT = 0, afkMode = 'none', afkPoseT = 0;        // detik menganggur; mode aktif; waktu dalam mode
let lastAimX = 0, lastAimZ = 0;                       // deteksi gerak kursor (aim)
let gunGrpRef = null;                                 // grup senjata (utk digeletakkan saat rebahan)
// Pose sinematik radio Stage 4 outro: tangan kiri menekan earpiece, tangan
// kanan tetap menggenggam senjata dengan laras diturunkan. State-nya dimiliki
// avatar supaya cutscene tidak perlu menyentuh node rig internal satu per satu.
let radioPoseActive = false, radioPoseYaw = 0, radioPoseGesture = 'gibranCall';
let radioPoseProgress = 0, radioPoseT = 0;
let radioPoseDbg = {
    active: false, yaw: 0, gesture: '', progress: 0, t: 0,
    leftY: 0, rightY: 0, gunPitch: 0, torsoPitch: 0, headYaw: 0, bodyY: 0,
};
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
// ARMOR DIROMBAK 2026-07-30: material pelat (kilat saat dipasang) + SATU material
// sel daya exo tier III (emissiveIntensity didenyutkan) + jam kedua animasinya.
let armorPlateMats = null, armorGlowMat = null;
let armorEquipT = 0, armorPulse = 0;
const ARMOR_EQUIP_SEC = 0.5;    // lama animasi "pelat MENGUNCI ke badan"
const ARMOR_FAIL_FRAC = 0.3;    // durability di bawah ini = sel daya BERKEDIP sekarat
const ARMOR_EMIS_MAX = 0.9;     // batas emissive (palette EMISSIVE_MAX)
// DUA PISAU BELATI (overhaul 2026-07-29, menggantikan pedang tunggal): satu
// pivot tebasan per bahu + satu kipas jejak per pisau (opacity ~ kecepatan).
let knifeR = null, knifeL = null;
let swooshR = null, swooshL = null, swooshMatR = null, swooshMatL = null;
let bladeMat = null, bladeFlash = 0;   // material BILAH (di-share dua pisau) + sisa kilat benturan (2026-07-27)
const _qT = new THREE.Quaternion(), _tumbleAxis = new THREE.Vector3();   // salto dodge
const _qR = new THREE.Quaternion(), _rollAxis = new THREE.Vector3();     // guling ke bahu (kematian)
const _wp = new THREE.Vector3();                                         // titik dunia (lepas senjata)
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
// Target tangan saat TUCK dodge & tangan kiri saat jaga (ruang upperG).
const TUCK = { L: { x: -0.95, y: 7.2, z: 0.95 }, R: { x: 0.95, y: 7.0, z: 0.95 } };
const GUARD_L = { x: -1.7, y: 7.9, z: 1.3 };
// TITIK GENGGAM pisau belati di ruang LOKAL pivot bahu (2026-07-29): telapak
// tangan ditempatkan persis di sini tiap frame (dihitung manual — lihat
// knifeHandTarget), dan mesh pisaunya di-parent ke sub-grup di titik ini.
const KNIFE_GRIP = { y: -0.55, z: 1.15 };

// ===== GULINGAN TEMPUR (dodge, dirombak 2026-07-27) =====================
// Versi lama: badan KAKU diputar 360° ber-smoothstep + kaki menekuk — dari atas
// hanya terbaca "berputar 360 derajat" (keluhan user). Sekarang gulingan punya
// ANTISIPASI, LEDAKAN, TUBUH MELENGKUNG, MIRING LEWAT SATU BAHU, dan MENDARAT
// yang diredam — semuanya turunan dari `dodgeProgress` (0..1) sehingga otomatis
// ikut `CFG.dodge.durationSec` tanpa konstanta waktu tambahan.
//   coil   p<0.14  : merendah mengumpulkan tenaga, badan melengkung ke BELAKANG,
//                    tangan turun ke belakang — belum berputar sama sekali.
//   launch ~0.14-0.30: kaki MELECUT, badan terangkat, putaran mulai menggigit.
//   air    ~0.30-0.68: TUCK terketat (lutut ke dada + torso melipat), putaran di
//                    laju PUNCAK — mayoritas 360° terjadi di sini.
//   extend ~0.68-0.88: membuka, kaki menjulur mencari lantai, tangan depan
//                    MENJANGKAU tanah, putaran menuntaskan 360°.
//   plant  p>0.88  : kaki mendarat, lutut MEREDAM (badan merendah), torso
//                    tertunduk ke depan lalu ditegakkan oleh fase RECOVER
//                    (timer sendiri, berjalan SETELAH dodge & i-frame usai).
// Sudut putar TETAP 360° penuh — itu yang menjamin badan mulai & selesai TEGAK
// menghadap kursor tanpa 'pop'; yang berubah adalah DISTRIBUSI waktunya.
const smootherstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
const bump = (t, a, b) => { const u = (t - a) / (b - a); return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u); };
const clamp01 = (t) => t < 0 ? 0 : t > 1 ? 1 : t;

// ===== KURVA HENTAKAN TEMBAKAN (2026-07-28, permintaan user: animasi menembak
// dibuat SINEMATIK) =====
// Bentuknya OSILATOR TEREDAM, bukan peluruhan linier:
//   u < ATTACK  -> SNAP naik (smoothstep, ~2 frame) = letusan yang menghentak
//   u >= ATTACK -> exp(-decay) × cos(...) = badan MEMANTUL melewati garis bidik
//                  ke KEDUA arah lalu reda (moncong sempat MENUKIK di bawah
//                  garis sebelum diam — inilah "settle" khas senjata film).
// Nilai baliknya BERTANDA (-1..1) dan dipakai SATU sumber untuk semua kanal:
// laras, torso, bahu, kepala, lutut, dan geser badan — jadi seluruh tubuh
// bergerak dalam satu ritme, bukan tiap bagian punya timer sendiri.
const FIRE_ATTACK = 0.15;
function fireCurve(u) {
    if (u <= 0 || u >= 1) return 0;
    if (u < FIRE_ATTACK) { const t = u / FIRE_ATTACK; return t * t * (3 - 2 * t); }
    const v = (u - FIRE_ATTACK) / (1 - FIRE_ATTACK);
    return Math.exp(-4.4 * v) * Math.cos(v * Math.PI * 2.3);
}
// Debug/uji: nilai kurva + kanal hentakan frame terakhir (dibaca smoke test).
const fireDbg = { k: 0, pitch: 0, push: 0, torso: 0, twist: 0, dip: 0, shove: 0, climb: 0 };
export const avatarFireDebug = () => ({ ...fireDbg });
export const fireCurveAt = (u) => fireCurve(u);
const DODGE_ROT_A = 0.10, DODGE_ROT_B = 0.88;   // jendela putaran di dalam p
const DODGE_BANK = 0.62;    // miring maks lewat bahu (rad) — inti kesan "guling", bukan "salto"
const DODGE_AIR = 3.4;      // tinggi busur melayang (unit)
const DODGE_PIV = 5.2;      // tinggi pivot pinggang (dipertahankan dari versi lama)
const LAND_DUR = 0.22;      // detik fase RECOVER setelah dodge selesai
// Semua kurva fase dalam SATU tempat: dipakai blok lengan, rotasi, dan kaki.
function dodgeCurves(p) {
    const rot = smootherstep((p - DODGE_ROT_A) / (DODGE_ROT_B - DODGE_ROT_A));   // 0..1, ledakan di tengah
    return {
        rot,
        coil: bump(p, 0, 0.16),                       // antisipasi merendah
        tuck: Math.sin(Math.PI * clamp01((p - 0.06) / 0.78)),   // melengkung di udara
        // MENDARAT: NAIK monoton ke 1 di p=1 (bukan bump yang balik ke 0) —
        // ia harus menyambung MULUS ke fase RECOVER yang mulai dari bobot penuh.
        // tuck tepat mencapai 0 di p=0.84, persis saat plant mulai: tak ada
        // jendela kosong dan tak ada dua kurva yang bertabrakan.
        plant: smoothstep((p - 0.84) / 0.16),
        open: clamp01((p - 0.68) / 0.32),             // membuka menjelang mendarat
    };
}
// Pose telapak per fase (ruang upperG; jarak dari bahu dijaga <= ~3.6 unit).
const DA_COIL = { lx: -1.9, ly: 6.6, lz: -0.5, rx: 1.9, ry: 6.4, rz: -0.4 };      // menarik ke belakang-bawah
const DA_TUCK = { lx: TUCK.L.x, ly: TUCK.L.y, lz: TUCK.L.z, rx: TUCK.R.x, ry: TUCK.R.y, rz: TUCK.R.z };
const DA_REACH = { lx: -1.5, ly: 6.8, lz: 1.0, rx: 2.4, ry: 6.0, rz: 1.5 };       // tangan depan meraih lantai
const DA_BALANCE = { lx: -2.9, ly: 7.4, lz: 0.2, rx: 2.9, ry: 7.2, rz: 0.6 };     // mengembang menjaga imbang
// Campur 4 pose sesuai bobot fase (coil → tuck → reach → balance).
function mixHands3(coilP, tuckP, reachP, balP, C) {
    const a = mixHands(coilP, tuckP, C.tuck);        // coil -> tuck (naik bersama envelope tuck)
    const b = mixHands(a, reachP, C.open * (1 - C.plant));
    return mixHands(b, balP, C.plant);
}

// ===== SIKLUS LARI MANUSIAWI (dirombak 2026-07-27, permintaan user: gait lama
// "masih terlihat sangat kaku") ==========================================
// Versi lama: pinggul = sinus murni, lutut = setengah sinus (hanya menekuk di
// separuh siklus), bob kecil di torso — dari atas terbaca sebagai BONEKA YANG
// DIGESER: kaki tumpu selalu lurus (tak ada peredaman benturan), badan tak
// punya berat, dan senapan diam mati di depan dada.
//
// Kurva baru meniru siklus lari nyata. Sudut fase `th` dipilih sehingga
// `sin(th)` = "seberapa MAJU" kaki itu:
//   th = +π/2  kaki paling DEPAN    -> tapak mendarat (heel strike), lutut lurus
//   th ≈ +2.80 mid-stance           -> lutut MEREDAM, badan paling rendah
//   th = −π/2  kaki paling BELAKANG -> tolakan (toe-off), lutut nyaris lurus
//   th ≈ −0.65 tengah AYUNAN        -> tumit menendang ke pantat (tekukan puncak)
// Puncak peredaman SENGAJA disetel di th≈2.80 supaya jatuh tepat bersamaan
// dengan titik terendah bob badan (bob berfrekuensi 2× fase langkah) — lutut
// menekuk PERSIS saat berat badan turun, bukan di waktu acak.
// Dua "bump" gaussian melingkar dijumlahkan jadi kurva lutut; bump ayunan
// SENGAJA asimetris (sempit di sisi tolakan, lebar di sisi jangkauan) supaya
// lutut lurus saat menolak lalu menekuk dalam saat kaki melayang — itu yang
// membedakan lari dari "kaki diayun-ayun".
const TAU = Math.PI * 2;
const angBump = (a, c, wLo, wHi) => {
    const dd = wrapPI(a - c);
    const d = dd / (dd < 0 ? wLo : wHi);
    return Math.exp(-d * d);
};
// Satu kaki: [sudut pinggul, sudut lutut]. Konvensi rig: rotation.x pinggul
// POSITIF = kaki ke BELAKANG, rotation.x lutut POSITIF = tumit terangkat.
function legCycle(th, ah, ak) {
    const hip = -ah * (Math.sin(th) + 0.14);        // +0.14 = bias condong khas lari
    const knee = ak * (angBump(th, -0.65, 0.55, 1.05)          // tekukan BESAR di ayunan
        + 0.44 * angBump(th, 2.80, 0.60, 0.90));               // peredaman saat menapak
    return [hip, knee];
}

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

    // ----- DUA PISAU BELATI melee (OVERHAUL 2026-07-29, permintaan user:
    // "mengibaskan pedang aneh untuk tentara zaman modern") — menggantikan
    // pedang tunggal di bahu kanan. SATU PIVOT PER BAHU; seluruh tebasan =
    // rotasi pivot itu. Pisaunya sendiri di-parent lewat sub-grup `kg` yang
    // DUDUK DI TITIK GENGGAM (KNIFE_GRIP), sehingga (a) telapak tangan tetap
    // bisa dihitung manual seperti dulu, dan (b) pisau tangan belakang bisa
    // dibalik jadi GENGGAMAN TERBALIK (icepick — pegangan pisau tempur) TANPA
    // menggeser titik genggamnya. Tampil hanya selama sabetan (meleeT > 0).
    // MEKANIK SERANGAN TIDAK DISENTUH: damage/range/durasi/stamina/kerucut
    // semuanya tetap milik weapons.js — modul ini murni visual. -----
    const steel = mat(0xc9d3dc, 60);
    bladeMat = steel;   // kilat benturan (flashMeleeBlades) — material INI hanya milik bilah
    const buildKnife = (sh, reverse) => {
        const piv = new THREE.Group();
        piv.position.set(sh.x, sh.y, sh.z);
        piv.rotation.order = 'YXZ';   // yaw dulu baru pitch — cocok dgn hitung manual titik genggam
        upperG.add(piv);
        const kg = new THREE.Group();                  // sub-grup DI TITIK GENGGAM
        kg.position.set(0, KNIFE_GRIP.y, KNIFE_GRIP.z);
        if (reverse) kg.rotation.x = Math.PI;          // genggaman TERBALIK (icepick)
        piv.add(kg);
        // Belati militer: pommel + gagang berlilit + guard kecil + bilah pipih
        // ber-alur darah + ujung clip-point. Semua relatif TITIK GENGGAM.
        box(0.17, 0.2, 0.16, dark, 0, 0, -0.36, kg);         // pommel
        box(0.18, 0.23, 0.62, dark, 0, 0, 0, kg);            // gagang
        box(0.2, 0.25, 0.1, rubber, 0, 0, -0.14, kg);        // lilitan karet
        box(0.2, 0.25, 0.1, rubber, 0, 0, 0.14, kg);
        box(0.46, 0.14, 0.14, gun, 0, 0, 0.4, kg);           // guard menyilang
        box(0.09, 0.32, 1.5, steel, 0, 0, 1.22, kg, true);   // bilah pipih
        box(0.11, 0.08, 1.0, dark, 0, 0.02, 1.15, kg);       // alur darah (fuller)
        const tipGeo = new THREE.ConeGeometry(0.22, 0.6, 4);
        tipGeo.rotateX(Math.PI / 2); tipGeo.scale(0.4, 1, 1);   // kerucut dipipihkan = ujung clip-point
        mk(tipGeo, steel, 0, 0, 2.24, kg, false);
        piv.visible = false;
        return piv;
    };
    knifeR = buildKnife(SHOULDER.R, false);   // tangan kanan: genggaman normal
    knifeL = buildKnife(SHOULDER.L, true);    // tangan kiri: genggaman TERBALIK
    // Kipas JEJAK tebasan (swoosh) — SATU PER PISAU (dulu satu untuk pedang):
    // sektor cincin horizontal setinggi dada yang MEMBUNTUTI bilahnya masing-
    // masing, jadi silangan X-nya terbaca dari kamera top-down. Lebih pendek &
    // lebih sempit dari kipas pedang (jangkauan pisau memang lebih dekat).
    // Dibuat sekali (hidden; warmup preload mengompilasi shadernya).
    const mkSwoosh = (sh) => {
        const m = new THREE.MeshBasicMaterial({
            color: 0xd8ecf4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false
        });
        const mesh = new THREE.Mesh(new THREE.RingGeometry(1.0, 3.3, 16, 1, 0, 1.0), m);
        mesh.rotation.x = -Math.PI / 2;
        const grp = new THREE.Group();
        grp.position.set(sh.x, 7.7, sh.z);
        grp.add(mesh);
        grp.visible = false;
        upperG.add(grp);
        return { grp, m };
    };
    const swR = mkSwoosh(SHOULDER.R), swL = mkSwoosh(SHOULDER.L);
    swooshR = swR.grp; swooshMatR = swR.m;
    swooshL = swL.grp; swooshMatL = swL.m;

    // ===== OVERLAY ARMOR — DIROMBAK 2026-07-30 (permintaan user: versi lama
    // "flat, membosankan, antar tier tidak kelihatan beda"). Tetap TIGA SET
    // KUMULATIF mengikuti player.armorLvl (shop Survival / cheat give-armor-N)
    // dan tetap TENTARA MANUSIA berpelat baja — BUKAN robot — tapi kini tiap
    // tier punya SILUET & LIVERY sendiri yang terbaca dari kamera TOP-DOWN
    // (yang tampak dari atas: bahu, punggung, pinggul, kepala):
    //   I   PLATE CARRIER — pelat dada BERTINGKAT (lip atas menyorong + pelat
    //       perut miring + yoke tulang selangka) & tutup bahu bersirap tipis;
    //       siluet masih sesempit badan polos, hanya jelas "berpelat".
    //   II  ASSAULT RIG — pauldron BERSIRAP TIGA yang mengembang keluar (bahu
    //       jauh lebih LEBAR dari atas), ridge ransel + dua kanister punggung,
    //       TASSET (rok pelat) yang melebarkan pinggul, greave, sayap pelipis
    //       helm, dan livery MERAH-PUTIH (marka nasional, hemat — palette #3).
    //   III EXO FRAME — pelat luar lebih GELAP, gorget leher + sayap kerah,
    //       UNIT DAYA TULANG BELAKANG dgn empat SEL DAYA AMBER MENYALA di
    //       punggung, mahkota pauldron ber-trim amber + titik daya, inti dada
    //       amber, VISOR amber, jambul tegak: SATU-SATUNYA tier yang bercahaya.
    // Dua lapis animasi di `updateArmorFx`: (a) PEMASANGAN — saat tier NAIK
    // seluruh pelat MENGUNCI ke badan (skala 1.18 → 1) dgn kilat amber;
    // (b) SEL DAYA tier III berdenyut lambat dan BERKEDIP SEKARAT saat
    // durability < ARMOR_FAIL_FRAC (isyarat armor hampir pecah).
    // Semua material dibuat SEKALI di sini (Phong = program shader yang sama,
    // warmup preload mengompilasinya) dan animasinya hanya menulis UNIFORM
    // (emissive/emissiveIntensity) → tanpa recompile di tengah permainan.
    // Pelat kaki di-parent ke pivot pinggul/lutut (ikut melangkah). Saat armor
    // pecah (durability 0) semua lapisan lenyap + pecahan pelat via gib
    // (robots.js). =====
    const aPlate = mat(0x6a7178, 32),   // pelat baja terang (tier I & II)
        aTrim = mat(0x373d44, 22),      // trim/bayangan
        aDark = mat(0x4a5057, 30),      // pelat luar tier III (nada lebih gelap)
        aRed = mat(0x8e2f23, 26),       // marka merah
        aWhite = mat(0xd8d2c4, 24),     // marka putih (merah-putih, hemat)
        aAmber = mat(0xc8862c, 18);     // trim amber (tidak menyala)
    // Sel daya / visor exo: SATU material menyala, di-share semua bagian
    // bercahaya tier III — denyutnya = satu penulisan uniform per frame.
    const aGlow = new THREE.MeshPhongMaterial({
        color: 0x3a2c14, emissive: 0xffb03b, emissiveIntensity: 0.5,
        shininess: 40, specular: 0x1c1a16,
    });
    armorPlateMats = [aPlate, aTrim, aDark, aRed, aWhite, aAmber];
    armorGlowMat = aGlow;
    armorNodes = [[], [], []];
    const reg = (lv, node) => { node.visible = false; armorNodes[lv].push(node); return node; };
    // Pelat BERSUDUT: box + rotasi opsional (siluet bersirap, bukan slab datar).
    const plate = (lv, w, h, d, m, x, y, z, parent, rx, ry, rz) => {
        const b = box(w, h, d, m, x, y, z, parent);
        if (rx) b.rotation.x = rx; if (ry) b.rotation.y = ry; if (rz) b.rotation.z = rz;
        return reg(lv, b);
    };
    const SH = [{ s: -1, p: SHOULDER.L }, { s: 1, p: SHOULDER.R }];
    // --- SET 1 (Armor I) — PLATE CARRIER: dada bertingkat + sirap bahu + paha ---
    plate(0, 1.9, 1.4, 0.34, aPlate, 0, 8.35, 1.22, upperG);                    // pelat dada utama
    plate(0, 1.9, 0.42, 0.3, aTrim, 0, 9.08, 1.12, upperG, -0.55);              // lip atas menyorong keluar
    plate(0, 1.62, 0.5, 0.3, aPlate, 0, 7.5, 1.16, upperG, 0.38);               // pelat perut miring
    plate(0, 0.72, 0.5, 0.28, aTrim, -0.78, 9.3, 0.95, upperG, 0, 0, 0.55);     // yoke selangka kiri
    plate(0, 0.72, 0.5, 0.28, aTrim, 0.78, 9.3, 0.95, upperG, 0, 0, -0.55);     // yoke selangka kanan
    for (const { s, p } of SH) {
        plate(0, 1.2, 0.3, 1.3, aPlate, p.x + s * 0.16, p.y + 0.5, p.z, upperG, 0, 0, -s * 0.26);   // sirap bahu bawah
        plate(0, 0.98, 0.28, 1.1, aTrim, p.x + s * 0.1, p.y + 0.8, p.z, upperG, 0, 0, -s * 0.2);    // sirap bahu atas
    }
    plate(0, 0.62, 1.5, 0.34, aPlate, -0.06, -1.3, 0.5, hipL);                  // pelindung paha
    plate(0, 0.62, 1.5, 0.34, aPlate, 0.06, -1.3, 0.5, hipR);
    plate(0, 0.5, 0.2, 0.12, aAmber, 0.52, 8.85, 1.45, upperG);                 // tab identitas amber
    // --- SET 2 (Armor II, + di atas Set 1) — ASSAULT RIG ---
    for (const { s, p } of SH) {   // PAULDRON bersirap TIGA, mengembang keluar
        plate(1, 1.55, 0.34, 1.45, aPlate, p.x + s * 0.42, p.y + 0.62, p.z, upperG, 0, 0, -s * 0.34);
        plate(1, 1.38, 0.32, 1.3, aTrim, p.x + s * 0.32, p.y + 0.98, p.z, upperG, 0, 0, -s * 0.28);
        plate(1, 1.12, 0.3, 1.1, aPlate, p.x + s * 0.2, p.y + 1.28, p.z, upperG, 0, 0, -s * 0.22);
    }
    plate(1, 1.85, 2.0, 0.25, aPlate, 0, 8.3, -1.78, upperG);                   // pelat punggung menutup ransel
    plate(1, 0.68, 2.3, 0.5, aTrim, 0, 8.5, -2.02, upperG);                     // ridge tengah ransel
    reg(1, cyl(0.3, 0.3, 1.5, aPlate, -0.95, 8.2, -2.05, upperG, 0));           // kanister kiri
    reg(1, cyl(0.3, 0.3, 1.5, aPlate, 0.95, 8.2, -2.05, upperG, 0));            // kanister kanan
    plate(1, 1.45, 0.75, 0.4, aPlate, 0, 5.95, 0.85, avatarGroup);              // TASSET tengah
    plate(1, 0.8, 0.9, 0.36, aTrim, -1.0, 5.8, 0.7, avatarGroup, 0, 0, 0.3);    // tasset sisi (pinggul melebar)
    plate(1, 0.8, 0.9, 0.36, aTrim, 1.0, 5.8, 0.7, avatarGroup, 0, 0, -0.3);
    plate(1, 0.56, 1.3, 0.3, aPlate, 0, -1.35, 0.5, kneeL);                     // greave
    plate(1, 0.56, 1.3, 0.3, aPlate, 0, -1.35, 0.5, kneeR);
    plate(1, 1.6, 0.4, 0.35, aTrim, 0, 11.02, 0.88, headG);                     // alis helm
    plate(1, 0.3, 0.5, 0.75, aPlate, -1.02, 10.85, 0.15, headG, 0, 0.3, 0);     // sayap pelipis
    plate(1, 0.3, 0.5, 0.75, aPlate, 1.02, 10.85, 0.15, headG, 0, -0.3, 0);
    plate(1, 0.44, 1.25, 0.12, aRed, -0.42, 8.35, 1.44, upperG);                // livery MERAH-PUTIH
    plate(1, 0.44, 1.25, 0.12, aWhite, 0.02, 8.35, 1.44, upperG);
    // --- SET 3 (Armor III, + di atas Set 1+2) — EXO FRAME (bercahaya) ---
    reg(2, cyl(1.02, 1.24, 0.62, aDark, 0, 9.62, 0, upperG, 0));                // gorget leher
    plate(2, 0.9, 0.7, 0.3, aDark, -0.92, 9.95, 0.15, upperG, 0, 0, 0.6);       // sayap kerah
    plate(2, 0.9, 0.7, 0.3, aDark, 0.92, 9.95, 0.15, upperG, 0, 0, -0.6);
    plate(2, 0.62, 2.7, 0.62, aDark, 0, 8.6, -2.25, upperG);                    // UNIT DAYA tulang belakang
    for (let i = 0; i < 4; i++)                                                 // empat SEL DAYA menyala
        plate(2, 0.34, 0.34, 0.34, aGlow, 0, 7.5 + i * 0.72, -2.6, upperG);
    for (const { s, p } of SH) {
        plate(2, 0.36, 0.55, 1.35, aDark, p.x + s * 0.24, p.y + 1.58, p.z, upperG, 0, 0, -s * 0.18);   // mahkota pauldron
        plate(2, 1.05, 0.16, 1.2, aAmber, p.x + s * 0.44, p.y + 1.4, p.z, upperG, 0, 0, -s * 0.28);    // trim amber tepi
        plate(2, 0.5, 0.12, 0.5, aGlow, p.x + s * 0.72, p.y + 1.3, p.z + 0.5, upperG);                 // titik daya
    }
    plate(2, 0.5, 0.5, 0.16, aGlow, 0, 8.62, 1.58, upperG);                     // inti dada amber (di atas livery II)
    plate(2, 0.16, 1.5, 0.12, aAmber, -0.74, 8.3, 1.54, upperG);                // rel trim dada
    plate(2, 0.16, 1.5, 0.12, aAmber, 0.74, 8.3, 1.54, upperG);
    plate(2, 0.34, 0.66, 0.9, aDark, -1.14, 10.55, 0.08, headG);                // pelat pipi helm
    plate(2, 0.34, 0.66, 0.9, aDark, 1.14, 10.55, 0.08, headG);
    plate(2, 1.15, 0.2, 0.12, aGlow, 0, 10.62, 1.12, headG);                    // VISOR amber (di depan lensa goggle)
    plate(2, 0.18, 0.5, 1.7, aDark, 0, 11.5, -0.15, headG, 0.15);               // jambul tegak
    plate(2, 0.1, 0.2, 1.5, aAmber, 0, 11.78, -0.12, headG, 0.15);

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

// ===== ANIMASI OVERLAY ARMOR (2026-07-30) — dua lapis, keduanya hanya menulis
// UNIFORM material (emissive/emissiveIntensity) + skala node, jadi tak ada
// material/shader baru di tengah permainan:
//   (a) PEMASANGAN: begitu tier NAIK, seluruh pelat yang aktif MENGUNCI ke badan
//       (skala 1.18 → 1, easeOut) sambil seluruh cat pelat berkilat AMBER.
//   (b) SEL DAYA exo (tier III): berdenyut lambat; begitu durability tinggal
//       < ARMOR_FAIL_FRAC ia BERKEDIP tak beraturan = armor hampir pecah.
// Nilai akhir keduanya dikembalikan TEPAT ke nilai istirahat (kilat → 0) —
// aturan yang sama dengan kilat bilah & mata robot: apa pun yang tidak ditulis
// pose normal harus dipulangkan sendiri, kalau tidak sisanya menempel selamanya.
function clearArmorFlash() {
    if (armorPlateMats) for (const m of armorPlateMats) m.emissive.setRGB(0, 0, 0);
}
function updateArmorFx(dt, lvl) {
    if (armorEquipT > 0) {
        armorEquipT = Math.max(0, armorEquipT - dt / ARMOR_EQUIP_SEC);
        const k = armorEquipT;                 // 1 → 0
        const s = 1 + 0.18 * k * k;            // menghentak masuk lalu duduk rapat
        for (let i = 0; i < armorNodes.length; i++)
            if (i < lvl) for (const n of armorNodes[i]) n.scale.setScalar(s);
        for (const m of armorPlateMats) m.emissive.setRGB(k * 0.55, k * 0.34, k * 0.1);
        if (armorEquipT === 0) {
            for (let i = 0; i < armorNodes.length; i++)
                for (const n of armorNodes[i]) n.scale.setScalar(1);
            clearArmorFlash();
        }
    }
    if (!armorGlowMat) return;
    if (lvl < 3) { armorGlowMat.emissiveIntensity = 0.5; return; }   // tier <3: bagian bercahaya tersembunyi
    armorPulse += dt;
    let k = 0.5 + 0.22 * Math.sin(armorPulse * 2.2);                 // denyut daya
    const dur = player.armorMax > 0 ? player.armor / player.armorMax : 0;
    if (dur < ARMOR_FAIL_FRAC) {
        // Kedip sekarat: dua sinus berbeda laju -> padam-nyala tak beraturan.
        const f = Math.sin(armorPulse * 17) * Math.sin(armorPulse * 6.3);
        k *= 0.3 + 0.7 * Math.max(0, f);
    }
    armorGlowMat.emissiveIntensity = Math.min(ARMOR_EMIS_MAX, k);
}
// Lebar siluet overlay armor (jarak-x terjauh pelat yang TAMPAK dari sumbu
// badan, ruang avatarGroup) — dipakai smoke utk membuktikan tiap tier benar-benar
// MELEBARKAN siluet dari kamera top-down, bukan cuma menambah detail kecil.
function armorSpanX() {
    let m = 0;
    if (!armorNodes) return 0;
    for (const set of armorNodes) for (const n of set) {
        if (!n.visible) continue;
        let x = 0, p = n;
        while (p && p !== avatarGroup) { x += p.position.x; p = p.parent; }
        m = Math.max(m, Math.abs(x));
    }
    return m;
}
export const armorFxDebug = () => ({
    lvl: armorKey, equip: armorEquipT,
    glow: armorGlowMat ? armorGlowMat.emissiveIntensity : 0,
    flash: armorPlateMats ? armorPlateMats[0].emissive.getHex() : 0,
    scale: armorNodes && armorNodes[0][0] ? armorNodes[0][0].scale.x : 1,
    plates: armorNodes ? armorNodes.map(a => a.length) : [],
    worn: armorNodes ? armorNodes.reduce((n, set) => n + set.filter(o => o.visible).length, 0) : 0,
    span: armorSpanX(),
});

// Tampilkan/sembunyikan PERLENGKAPAN MELEE (dua pisau + dua kipas jejak).
// Dipakai cabang melee, rappel, dan kematian — satu titik supaya tak ada pisau
// yang tertinggal menempel di tangan mayat/pemanjat tali.
function showMeleeGear(on) {
    if (knifeR) knifeR.visible = on;
    if (knifeL) knifeL.visible = on;
    if (!on) { if (swooshR) swooshR.visible = false; if (swooshL) swooshL.visible = false; }
}

// ===== KOREOGRAFI SATU TEBASAN PISAU (2026-07-29) =====
// `u` = kemajuan tebasan pisau ITU (bukan kemajuan animasi melee): u < 0 = masih
// ANCANG (ditarik ke sisi tangannya), 0..1 = TEBASAN, u > 1 = IKUT-TERUS.
// `s` = arah sapuan (+1 = dari sisi kanan menyapu ke kiri, -1 = kebalikannya) —
// dicerminkan oleh `meleeSide` sehingga dua serangan berturut-turut tak identik.
// `down` = tebasan MENURUN (pisau depan) / MENAIK (pisau belakang); pasangan
// menurun+menaik dari dua tangan itulah yang membentuk SILANGAN X.
// Kurva tebasan = easeIn KUADRAT: pelan mengancang lalu MELEDAK, sehingga bilah
// menyapu titik tengah sekitar 70% tebasan = tepat di momen hit (45% ayunan).
function knifeArc(u, s, down) {
    const p0 = down ? -0.60 : 0.46, p1 = down ? 0.40 : -0.34;   // pitch awal -> akhir
    const Y0 = 1.42, Y1 = -1.48, R0 = 0.5, R1 = -0.58;          // yaw & roll awal -> akhir
    if (u <= 0) {   // ANCANG: menyentak ke sisi tangannya sendiri (siap meledak)
        const a = clamp01(1 + u * 2.2);
        return { yaw: Y0 * s * a, pitch: p0 * a, roll: R0 * s * a, sw: 0 };
    }
    if (u >= 1) {   // IKUT-TERUS: melewati batas lalu memantul balik teredam
        const t = u - 1, d = Math.exp(-5.5 * t);
        const ov = 0.26 * d * Math.cos(t * 14);
        return {
            yaw: (Y1 - 0.2 * d + ov) * s,
            pitch: p1 * (1 - 0.25 * (1 - d)),
            roll: R1 * s * (1 - 0.2 * (1 - d)),
            sw: Math.max(0, 0.5 * (1 - t / 0.5)),
        };
    }
    const e = u * u;
    return {
        yaw: (Y0 + (Y1 - Y0) * e) * s,
        pitch: p0 + (p1 - p0) * e,
        roll: (R0 + (R1 - R0) * e) * s,
        sw: e * 0.5,
    };
}

// Titik genggam pisau (KNIFE_GRIP di ruang pivot) diputar pitch (X) lalu yaw (Y)
// — urutan euler pivot 'YXZ', roll diabaikan (ofsetnya kecil) — lalu digeser ke
// bahu: inilah target telapak tangan supaya tangan MENEMPEL di gagang.
function knifeHandTarget(sh, pitch, yaw) {
    const gy0 = KNIFE_GRIP.y, gz0 = KNIFE_GRIP.z;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y1 = gy0 * cp - gz0 * sp, z1 = gy0 * sp + gz0 * cp;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    return { x: sh.x + z1 * sy, y: sh.y + y1, z: sh.z + z1 * cy };
}

// KILAT BILAH (2026-07-27; sejak 2026-07-29 = KEDUA bilah pisau, material `steel`
// di-share): dipanggil weapons.doMeleeHit saat sabetan MENGENAI. Hanya menaikkan
// sisa kilat; peluruhannya (emissive → hitam lagi) dilakukan per frame di
// updatePlayerAvatar. Material ini EKSKLUSIF milik bilah (tak dipakai bagian
// avatar lain), dan emissive = uniform → tanpa recompile.
export function flashMeleeBlades() { bladeFlash = 1; }
export const bladeFlashDebug = () => bladeFlash;

// Mulai animasi kematian (dipanggil startPlayerDeath di game.js): tubuh roboh
// ke arah (dirx,dirz) = arah datangnya dorongan damage terakhir. Posisi telapak
// SAAT INI dibekukan sebagai titik awal fase hentakan (tanpa itu tangan
// "teleport" dari grip senjata ke pose terlempar di frame pertama).
export function playAvatarDeath(dirx, dirz) {
    const d = Math.hypot(dirx, dirz);
    deathDirX = d > 1e-4 ? dirx / d : 0;
    deathDirZ = d > 1e-4 ? dirz / d : 1;
    deathT = 0;
    deathPhase = 'impact';
    deathSpin = Math.random() < 0.5 ? -1 : 1;
    deathHand0 = handL && handR
        ? { lx: handL.position.x, ly: handL.position.y, lz: handL.position.z,
            rx: handR.position.x, ry: handR.position.y, rz: handR.position.z }
        : null;
}
// Fase animasi kematian — dibaca sutradara core/deathCine.js untuk memicu
// isyarat (debu/darah/guncangan/bunyi) TEPAT saat badan menghantam lantai.
export const avatarDeathPhase = () => deathPhase;
// Debug/uji: sudut roboh & guling tak terbaca dari quaternion di harness stub,
// jadi nilai terakhir yang dihitung poseDeath diekspos di sini.
export const avatarDeathDebug = () => ({
    t: deathT, phase: deathPhase, fall: dbgFall, roll: dbgRoll, sink: dbgSink,
    gunFlying: !!gunFly, gunLanded: !!(gunFly && gunFly.landed),
});
// Debug/uji GULINGAN: pose rig tak terbaca dari quaternion di harness stub, dan
// pivot kaki bukan ekspor publik — jadi nilai pose diambil dari sini.
// Nilai kurva SIKLUS LARI frame terakhir (smoke test 2026-07-27): fase langkah,
// intensitas lari, bob badan, puntiran-balik bahu, dan denyut senjata.
let gaitDbg = { phase: 0, runK: 0, bob: 0, counter: 0, gunY: 0, gunX: 0, lean: 0 };
export const avatarGaitDebug = () => ({
    ...gaitDbg,
    headY: headG ? headG.position.y : 0,
    handRY: handR ? handR.position.y : 0,
});

export const avatarDodgeDebug = () => ({
    side: dodgeSide, land: landT,
    torso: upperG ? upperG.rotation.x : 0,
    hipL: hipL ? hipL.rotation.x : 0, hipR: hipR ? hipR.rotation.x : 0,
    kneeL: kneeL ? kneeL.rotation.x : 0, kneeR: kneeR ? kneeR.rotation.x : 0,
    y: avatarGroup ? avatarGroup.position.y : 0,
});
// Durasi tiap fase (konstanta visual) — dipakai uji supaya tak menebak stempel waktu.
export const avatarDeathTiming = () => ({
    impact: D_IMPACT, buckle: D_BUCKLE, fall: D_FALL, settle: D_SETTLE, total: D_TOTAL, lieY: LIE_Y,
});

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
    // Sembunyikan prop senjata + pisau melee (kedua tangan di tali)
    if (props && propKey !== '__rappel') {
        for (const q in props) props[q].visible = false;
        showMeleeGear(false);
        propKey = '__rappel';
    }
}

// ===== KEMATIAN DRAMATIS (2026-07-26; menggantikan roboh-90°-lalu-diam) =====
// EMPAT FASE, dijalankan dari jam `deathT` (detik animasi = dt ber-slow-motion,
// jadi seluruh keruntuhan ikut melambat bersama dunia):
//   impact (D_IMPACT) — badan DIHENTAK: punggung melengkung ke BELAKANG melawan
//     arah jatuh, kepala tersentak, kedua lengan terlempar ke atas, jinjit
//     terangkat sedikit, badan terputar; SENJATA TERLEPAS terbang (releaseGun).
//   buckle (D_BUCKLE) — lutut MENYERAH: pinggul turun ~2 unit, kaki menekuk
//     asimetris (satu lutut jatuh lebih dulu), torso melipat ke depan, kepala
//     tertunduk, satu tangan MENGGAPAI lantai mencoba menahan.
//   fall (D_FALL)   — GRAVITASI: sudut roboh dipercepat (easeIn) sampai 90° +
//     overshoot, badan diangkat ke ketinggian berbaring (LIE_Y) supaya jasad
//     REBAH DI ATAS lantai (bukan separuh tenggelam seperti versi lama), mulai
//     terguling ke satu bahu. Akhir fase = HANTAMAN (isyarat FX di deathCine).
//   settle (D_SETTLE) — PANTULAN teredam: sudut/tinggi/lutut/lengan bergetar
//     dgn amplitudo meluruh (e^-5.5u), kepala terkulai ke samping, satu embusan
//     napas terakhir di dada; lalu 'still' = pose akhir persis, diam total.
// Semua amplitudo = konstanta VISUAL (bukan CFG) sesuai aturan proyek.
const D_IMPACT = 0.13, D_BUCKLE = 0.34, D_FALL = 0.26, D_SETTLE = 0.52;
const D_TOTAL = D_IMPACT + D_BUCKLE + D_FALL + D_SETTLE;
const LIE_Y = 1.25;          // tinggi garis-tengah badan saat berbaring rata
// Root avatar ADA DI KAKI (pivot lama), jadi "pinggul ambruk" hanya bisa
// dinyatakan dgn menurunkan root — dan itu ikut menenggelamkan sepatu. BUCKLE_Y
// dijaga sedangkal pose jongkok AFK (-1.7) supaya kaki tidak terbenam di lantai;
// kesan lutut menyerah datang dari tekukan lutut + torso melipat, bukan dari
// dalamnya penurunan.
const BUCKLE_Y = -2.0;
const HALF_PI = Math.PI / 2;
const lerp = (a, b, t) => a + (b - a) * t;
// Target telapak (ruang upperG) per tahap — dijaga <= ~3.7 unit dari bahu supaya
// segmen lengan tidak melar (placeArm merenggangkan silinder bila di luar jangkauan).
const DH_THROWN = { lx: -3.5, ly: 11.4, lz: -1.1, rx: 3.4, ry: 11.2, rz: -0.9 };   // terlempar ke atas
const DH_BRACE = { lx: -2.9, ly: 7.2, lz: -0.4, rx: 2.6, ry: 6.4, rz: 1.9 };       // menggapai lantai
const DH_LIMP = { lx: -2.3, ly: 5.5, lz: 0.2, rx: 2.4, ry: 5.6, rz: 0.7 };         // terkulai di sisi badan
const mixHands = (a, b, t) => ({
    lx: lerp(a.lx, b.lx, t), ly: lerp(a.ly, b.ly, t), lz: lerp(a.lz, b.lz, t),
    rx: lerp(a.rx, b.rx, t), ry: lerp(a.ry, b.ry, t), rz: lerp(a.rz, b.rz, t),
});

// Lepaskan senjata dari tangan: gunGrp DIPINDAH ke scene (mesh & material yang
// SAMA — tanpa alokasi/material baru, jadi tak ada recompile shader) lalu jatuh
// balistik + tumbling. resetAvatarDeath mengembalikannya ke upperG.
function releaseGun(feetY) {
    if (gunFly || !gunGrpRef || !avatarGroup) return;
    const sc = avatarGroup.parent;
    if (!sc) return;
    gunGrpRef.getWorldPosition(_wp);
    sc.add(gunGrpRef);                      // add memindah induk (lepas dari upperG)
    gunGrpRef.position.copy(_wp);
    gunGrpRef.rotation.set(0, legYaw, 0);
    const sx = deathDirZ, sz = -deathDirX;  // vektor samping arah jatuh
    const side = (Math.random() - 0.5) * 2;
    gunFly = {
        vx: deathDirX * 15 + sx * side * 11, vy: 29, vz: deathDirZ * 15 + sz * side * 11,
        wx: 6 + Math.random() * 4, wy: 3 + Math.random() * 3, wz: 5 + Math.random() * 4,
        restY: feetY + 0.45, bounced: false, landed: false,
    };
}

function updateGunFly(dt) {
    if (!gunFly || gunFly.landed || !gunGrpRef) return;
    const g = (CFG.player && CFG.player.gravity) || 70;
    gunFly.vy -= g * dt;
    gunGrpRef.position.x += gunFly.vx * dt;
    gunGrpRef.position.y += gunFly.vy * dt;
    gunGrpRef.position.z += gunFly.vz * dt;
    gunGrpRef.rotation.x += gunFly.wx * dt;
    gunGrpRef.rotation.y += gunFly.wy * dt;
    gunGrpRef.rotation.z += gunFly.wz * dt;
    if (gunGrpRef.position.y > gunFly.restY) return;
    gunGrpRef.position.y = gunFly.restY;
    if (!gunFly.bounced) {                  // memantul sekali lemah lalu terhenti
        gunFly.bounced = true;
        gunFly.vy = -gunFly.vy * 0.3;
        gunFly.vx *= 0.42; gunFly.vz *= 0.42;
        gunFly.wx *= 0.4; gunFly.wy *= 0.55; gunFly.wz *= 0.4;
        return;
    }
    gunFly.landed = true;
    // Terhenti MIRING di lantai (laras horizontal, badan senjata rebah ke sisi).
    gunGrpRef.rotation.set(0.05, gunGrpRef.rotation.y, 1.35 * (deathSpin > 0 ? 1 : -1));
}

function poseDeath(dt, feetY) {
    deathT += dt;
    const t = deathT;
    // --- Fase + progres lokal
    let ph, u;
    if (t < D_IMPACT) { ph = 'impact'; u = t / D_IMPACT; }
    else if (t < D_IMPACT + D_BUCKLE) { ph = 'buckle'; u = (t - D_IMPACT) / D_BUCKLE; }
    else if (t < D_IMPACT + D_BUCKLE + D_FALL) { ph = 'fall'; u = (t - D_IMPACT - D_BUCKLE) / D_FALL; }
    else if (t < D_TOTAL) { ph = 'settle'; u = (t - D_IMPACT - D_BUCKLE - D_FALL) / D_SETTLE; }
    else { ph = 'still'; u = 1; }
    deathPhase = ph;

    // --- Kurva pose per fase
    let fall, sink, spin, roll, torsoX, headP, headY, hipLx, hipRx, kneeLx, kneeRx;
    let hand = DH_LIMP, handMix = 1, jig = 0;
    if (ph === 'impact') {
        // s = 0 -> 1 (ease-out) dan BERTAHAN di puncak sampai akhir fase: nilai
        // akhirnya PERSIS sama dgn nilai awal fase buckle, jadi lengkungan
        // punggung "menahan" sekejap alih-alih meletik balik ke pose netral.
        const s = Math.sin(u * HALF_PI);
        fall = -0.30 * s;                           // MELENGKUNG ke belakang, melawan arah jatuh
        sink = 0.4 * s;                             // terangkat jinjit
        spin = 0.42 * s * deathSpin;
        roll = 0;
        torsoX = -0.62 * s; headP = -0.62 * s; headY = 0;
        hipLx = -0.14 * s; hipRx = 0.10 * s; kneeLx = 0.10; kneeRx = 0.06;
        hand = DH_THROWN; handMix = smoothstep(u * 1.6);   // dari pose grip (deathHand0)
    } else if (ph === 'buckle') {
        const e = smoothstep(u);
        // Dari lengkungan ke belakang (-0.30, akhir fase hentak) MELEWATI tegak
        // lalu tersungkur ke depan — e² = tahan dulu, baru menukik (jatuh berlutut).
        fall = lerp(-0.30, 0.42, e * e);
        sink = lerp(0.4, BUCKLE_Y, e);              // pinggul AMBRUK
        spin = deathSpin * lerp(0.42, 0.18, e);
        roll = 0;
        torsoX = lerp(-0.62, 0.52, e); headP = lerp(-0.62, 0.55, e); headY = 0.22 * e * deathSpin;
        hipLx = -0.14 - 0.55 * e; hipRx = 0.10 + 0.42 * e;
        kneeLx = 0.10 + 1.55 * e; kneeRx = 0.06 + 1.02 * e;   // satu lutut menyerah lebih dulu
        hand = mixHands(DH_THROWN, DH_BRACE, e); handMix = 1;
    } else if (ph === 'fall') {
        const a = u * u;                            // easeIn: makin cepat (gravitasi)
        fall = lerp(0.42, HALF_PI + 0.14, a);
        sink = lerp(BUCKLE_Y, LIE_Y, a);            // naik ke ketinggian berbaring
        spin = deathSpin * 0.18;
        roll = 0.30 * a;
        torsoX = lerp(0.52, 0.14, a); headP = lerp(0.55, 0.10, a); headY = deathSpin * lerp(0.22, 0.52, a);
        hipLx = -0.69 + 0.35 * a; hipRx = 0.52 - 0.28 * a;
        kneeLx = 1.65 - 0.85 * a; kneeRx = 1.08 - 0.62 * a;
        hand = mixHands(DH_BRACE, DH_LIMP, a); handMix = 1;
    } else {
        const d = ph === 'still' ? 0 : Math.exp(-5.5 * u);   // amplitudo pantulan meluruh
        fall = HALF_PI + 0.14 * d * Math.cos(u * 17);
        sink = LIE_Y + 0.32 * d * Math.max(0, Math.sin(u * 13));
        spin = deathSpin * 0.18;
        roll = 0.30 + 0.12 * (1 - d);               // merebah lebih dalam ke bahu
        torsoX = 0.06 + 0.08 * d + 0.10 * d * Math.sin(u * 11);   // embusan napas terakhir
        headP = lerp(0.26, 0.10, d); headY = deathSpin * (0.52 + 0.10 * (1 - d));
        hipLx = -0.34; hipRx = 0.24;
        jig = 0.16 * d * Math.sin(u * 21);          // getaran anggota badan
        kneeLx = 0.80 - 0.18 * (1 - d) + jig; kneeRx = 0.46 - 0.16 * (1 - d) - jig;
    }

    // --- Root: yaw kaki + puntiran hentakan, lalu ROBOH (sumbu ⟂ arah jatuh),
    //     lalu GULING ke bahu (sumbu = arah jatuh). Pivot di kaki seperti dulu.
    dbgFall = fall; dbgRoll = roll; dbgSink = sink;
    avatarGroup.position.set(camera.position.x, feetY + sink, camera.position.z);
    avatarGroup.rotation.set(0, legYaw + spin, 0);
    _tumbleAxis.set(deathDirZ, 0, -deathDirX);
    _qT.setFromAxisAngle(_tumbleAxis, fall);
    avatarGroup.quaternion.premultiply(_qT);
    if (roll) {
        _rollAxis.set(deathDirX, 0, deathDirZ);
        _qR.setFromAxisAngle(_rollAxis, roll * deathSpin);
        avatarGroup.quaternion.premultiply(_qR);
    }

    // --- Badan atas / kepala / kaki (langsung, bukan lerp: kurva di atas sudah
    //     mulus). Puntiran pinggang & toleh kepala SISA dari pose hidup di-whip
    //     ke nol selama hentakan (kalau di-nol-kan seketika, torso "meletik").
    const twDecay = Math.max(0, 1 - t / (D_IMPACT + D_BUCKLE * 0.6));
    upperG.rotation.set(torsoX, twistCur * twDecay, 0);
    upperG.position.y = 0;
    headG.rotation.y = headY + headYawCur * twDecay;
    lerpHeadPitch(headP, 1);
    hipL.rotation.x = hipLx; hipR.rotation.x = hipRx;
    kneeL.rotation.x = kneeLx; kneeR.rotation.x = kneeRx;
    hipL.rotation.z = 0; hipR.rotation.z = 0;

    // --- Prop: senjata yang dipegang DILEPAS terbang, sisanya + pisau disembunyikan
    if (props && propKey !== '__dead') {
        const held = props[propKey] ? propKey : '';
        for (const q in props) props[q].visible = q === held;
        showMeleeGear(false);
        propKey = '__dead';
        if (held) releaseGun(feetY);
        else if (gunGrpRef) gunGrpRef.visible = false;   // mati saat menebas: tak ada yang jatuh
    }
    updateGunFly(dt);

    // --- Telapak -> lengan tertarik (fase hentak berangkat dari pose grip asli)
    let lx = hand.lx, ly = hand.ly, lz = hand.lz, rx = hand.rx, ry = hand.ry, rz = hand.rz;
    if (handMix < 1 && deathHand0) {
        lx = lerp(deathHand0.lx, lx, handMix); ly = lerp(deathHand0.ly, ly, handMix); lz = lerp(deathHand0.lz, lz, handMix);
        rx = lerp(deathHand0.rx, rx, handMix); ry = lerp(deathHand0.ry, ry, handMix); rz = lerp(deathHand0.rz, rz, handMix);
    }
    placeArm('R', rx, ry + jig, rz);
    placeArm('L', lx, ly - jig, lz);
}

// Dipanggil resetGame: batalkan pose mati + paksa evaluasi ulang prop senjata.
export function resetAvatarDeath() {
    rappelActive = false;   // batalkan pose rappel intro juga
    radioPoseActive = false;
    radioPoseGesture = 'gibranCall'; radioPoseProgress = 0; radioPoseT = 0;
    radioPoseDbg = {
        active: false, yaw: 0, gesture: '', progress: 0, t: 0,
        leftY: 0, rightY: 0, gunPitch: 0, torsoPitch: 0, headYaw: 0, bodyY: 0,
    };
    deathT = -1;
    deathPhase = 'none';
    deathHand0 = null;
    dbgFall = 0; dbgRoll = 0; dbgSink = 0;
    landT = 0; dodgePrev = false;   // batalkan sisa fase pendaratan gulingan
    // Pitch/roll torso HARUS di-nol-kan di sini: jalur hidup hanya menulis
    // upperG.rotation.y, jadi sisa lipatan pose runtuh (atau pose rappel) akan
    // menempel selamanya di badan yang sudah bangkit.
    if (upperG) { upperG.rotation.x = 0; upperG.rotation.z = 0; upperG.position.y = 0; }
    // Senjata yang tergeletak di lantai dikembalikan KE TANGAN (induk upperG).
    if (gunFly && gunGrpRef && upperG) upperG.add(gunGrpRef);
    gunFly = null;
    if (gunGrpRef) gunGrpRef.visible = true;
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

// Cutscene penutup Stage 4 mengaktifkan pose ini selama shot komunikasi radio.
// `gesture` = key dialog aktif; `progress` = progres huruf 0..1. Keduanya membuat
// tubuh benar-benar berakting mengikuti isi percakapan, bukan mematung dalam
// satu pose radio sepanjang Scene 2.
export function setAvatarRadioPose(on, yaw = 0, gesture = 'gibranCall', progress = 0) {
    const active = !!on;
    if (!active || gesture !== radioPoseGesture) radioPoseT = 0;
    radioPoseActive = active;
    radioPoseYaw = yaw;
    radioPoseGesture = gesture;
    radioPoseProgress = Math.max(0, Math.min(1, progress));
    radioPoseDbg.active = radioPoseActive;
    radioPoseDbg.yaw = yaw;
    radioPoseDbg.gesture = active ? gesture : '';
    radioPoseDbg.progress = radioPoseProgress;
}
export const avatarRadioDebug = () => ({ ...radioPoseDbg });

function poseRadio(dt) {
    radioPoseT += dt;
    const base = currentWeapon;
    const key = props && props[base + '3']
        && ((player.weaponLvl && player.weaponLvl[base]) || 1) >= 3 ? base + '3' : base;
    const G = GRIPS[key] || GRIPS.rifle;
    const t = radioPoseT, p = radioPoseProgress;
    const breathe = Math.sin(t * 2.15), slow = Math.sin(t * 1.15);
    let torsoPitch = 0.04, torsoYaw = 0, torsoRoll = 0;
    let headYaw = -0.08, headPitch = 0.08, bodyY = 0;
    let gunLower = 0, gunLift = 0, stance = 0.04;

    // Lima bahasa tubuh yang berbeda, mengikuti siapa yang sedang berbicara.
    // Gerak kecil berbasis waktu menjaga napas/berat tubuh tetap hidup; progres
    // body memberi kurva emosi yang sinkron dengan kalimat yang sedang diketik.
    if (radioPoseGesture === 'gibranCall') {
        // Laporan darurat: condong ke radio, pandangan menyapu area jatuh heli.
        torsoPitch = 0.075 + breathe * 0.018;
        torsoYaw = slow * 0.045;
        headYaw = -0.1 + Math.sin(t * 1.45) * 0.11;
        headPitch = 0.015 + breathe * 0.025;
        bodyY = -0.025 + breathe * 0.025;
        gunLift = 0.05 + Math.sin(t * 2.8) * 0.025;
        stance = 0.08;
    } else if (radioPoseGesture === 'commandNoExfil') {
        // Mendengarkan kabar buruk: berat pindah kaki, kepala pelan menoleh.
        torsoPitch = 0.015 + breathe * 0.012;
        torsoYaw = -0.055 + slow * 0.028;
        torsoRoll = slow * 0.022;
        headYaw = -0.18 + Math.sin(t * 0.82) * 0.055;
        headPitch = 0.065 + breathe * 0.016;
        bodyY = -0.07 + breathe * 0.018;
        gunLower = 0.08;
        stance = -0.045;
    } else if (radioPoseGesture === 'gibranShock') {
        // Terkejut lalu marah: badan tersentak mundur, maju menantang, kepala
        // menggeleng cepat; senjata ikut terangkat tetapi laras tetap ke bawah.
        const confront = smoothstep((p - 0.12) / 0.38);
        torsoPitch = -0.09 + confront * 0.21 + breathe * 0.022;
        torsoYaw = Math.sin(t * 3.7) * 0.065;
        torsoRoll = Math.sin(t * 4.4) * 0.028;
        headYaw = Math.sin(t * 5.6) * (0.15 - p * 0.035);
        headPitch = -0.055 + confront * 0.045 + breathe * 0.02;
        bodyY = -0.025 - Math.sin(Math.min(1, p * 2) * Math.PI) * 0.07;
        gunLift = 0.16 + Math.sin(t * 3.4) * 0.035;
        stance = 0.12;
    } else if (radioPoseGesture === 'commandFinal') {
        // Perintah final: bahu turun, dagu jatuh, tubuh menyerap kenyataan.
        torsoPitch = 0.025 + breathe * 0.01;
        torsoYaw = -0.035 + slow * 0.018;
        torsoRoll = -0.035 + slow * 0.012;
        headYaw = -0.11 + Math.sin(t * 0.7) * 0.028;
        headPitch = 0.15 + p * 0.055 + breathe * 0.012;
        bodyY = -0.14 - p * 0.06 + breathe * 0.012;
        gunLower = 0.15 + p * 0.08;
        stance = -0.025;
    } else if (radioPoseGesture === 'gibranAccepts') {
        // Menerima keadaan: napas berat, tunduk, lalu satu anggukan tegas.
        const nod = Math.sin(Math.min(1, p * 1.45) * Math.PI);
        torsoPitch = 0.055 + p * 0.035 + breathe * 0.012;
        torsoYaw = slow * 0.018;
        torsoRoll = slow * 0.012;
        headYaw = -0.035 + slow * 0.018;
        headPitch = 0.22 + nod * 0.11 + breathe * 0.012;
        bodyY = -0.2 + breathe * 0.012;
        gunLower = 0.25 + p * 0.1;
        stance = 0.03;
    }

    const gunPitch = 0.9 + gunLower * 0.18;   // selalu positif: laras tetap ke tanah
    const gx = 1.35, gy = 6.9 - gunLower + gunLift, gz = 0.45;

    avatarGroup.rotation.set(0, radioPoseYaw, 0);
    avatarGroup.position.y += bodyY;
    upperG.rotation.set(torsoPitch, torsoYaw, torsoRoll);
    upperG.position.y = bodyY * 0.18;
    headG.rotation.y = headYaw;
    lerpHeadPitch(headPitch, Math.min(1, dt * 12));

    // Berdiri tenang: sisa gait/dodge dari frame duel diluruhkan seketika agar
    // close-up tidak menangkap kaki atau torso dalam pose tempur yang membeku.
    hipL.rotation.set(stance, 0, 0.045 + slow * 0.018);
    hipR.rotation.set(-stance * 0.55, 0, -0.045 - slow * 0.018);
    kneeL.rotation.set(Math.max(0, stance) * 0.8 + 0.06, 0, 0);
    kneeR.rotation.set(Math.max(0, -stance) * 0.65 + 0.08, 0, 0);

    if (props) {
        for (const k in props) props[k].visible = k === key;
        showMeleeGear(false);
        propKey = '__radio';
    }
    if (gunGrpRef) {
        gunGrpRef.visible = true;
        gunGrpRef.position.set(gx, gy, gz);
        gunGrpRef.rotation.set(0, 0, 0);
    }
    if (props && props[key]) {
        props[key].position.set(0, 0, 0);
        props[key].rotation.set(gunPitch, 0, 0);
    }

    // Telapak kiri tepat di telinga kiri; telapak kanan tetap pada grip senjata
    // yang kini menggantung rendah. Anchor kanan mengikuti pitch prop sehingga
    // tangan tidak tampak terlepas dari senjata di close-up.
    const lx = -0.92 + torsoYaw * 0.2, ly = 10.72 + bodyY * 0.12, lz = 0.02 + headYaw * 0.08;
    const c = Math.cos(gunPitch), s = Math.sin(gunPitch);
    const rx = gx + G.R.x;
    const ry = gy + G.R.y * c - G.R.z * s;
    const rz = gz + G.R.y * s + G.R.z * c;
    placeArm('L', lx, ly, lz);
    placeArm('R', rx, ry, rz);
    radioPoseDbg = {
        active: true, yaw: radioPoseYaw, gesture: radioPoseGesture,
        progress: radioPoseProgress, t: radioPoseT,
        leftY: ly, rightY: ry, gunPitch, torsoPitch, headYaw, bodyY,
    };
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
            for (const n of armorNodes[s]) { n.visible = s < aLvl; n.scale.setScalar(1); }
        // TIER NAIK = animasi PEMASANGAN (2026-07-30). Tier TURUN/PECAH tidak:
        // pecahnya sudah punya FX sendiri (gib pelat + bunyi, robots.js).
        armorEquipT = (armorKey >= 0 && aLvl > armorKey) ? 1 : 0;
        if (armorEquipT === 0) clearArmorFlash();
        armorKey = aLvl;
    }
    if (armorNodes) updateArmorFx(dt, aLvl);

    // ===== FAST-ROPE intro (2026-07-17): pose meluncur turun dari tali —
    // early-return sebelum rantai-hadap/aim (seperti cabang mati). =====
    if (rappelActive) { poseRappel(dt); return; }

    // ===== MATI (dramatisasi 2026-07-26): keruntuhan 4 fase + senjata terlepas
    // terbang — early-return sebelum rantai-hadap/aim (avatar TETAP tampil,
    // tanpa ledakan/gib). Detail kurva ada di poseDeath. =====
    if (deathT >= 0) { poseDeath(dt, feetY); return; }

    // ===== RADIO CUTSCENE Stage 4: pose komunikasi mengambil alih aim/gait/AFK
    // selama dialog penutup, tetapi posisi root + armor tetap diperbarui di atas.
    if (radioPoseActive) { poseRadio(dt); return; }

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

    // ===== SIKLUS LARI: hitung SEMUA kurvanya DI SINI (sebelum blok prop &
    // target tangan) karena senjata + telapak ikut berdenyut bersama badan.
    // Semuanya murni visual — arah tembak tetap dari `camera`, posisi logika
    // player tak tersentuh. Rincian kurva kaki ada di legCycle() di atas.
    // Yang ditambahkan dibanding gait lama:
    //   1. LUTUT dua-puncak (ayunan + peredaman menapak) — kaki tumpu tak lagi
    //      lurus kaku sepanjang langkah.
    //   2. BOB BADAN 2× frekuensi langkah, TERDALAM tepat di mid-stance = berat
    //      badan yang dulu hilang; kepala DISTABILKAN ~setengahnya (refleks
    //      manusia menjaga pandangan tetap datar).
    //   3. CONDONG seluruh badan ke arah lari (poros di kaki) + miring ke dalam
    //      saat menyamping; torso menambah condong sendiri.
    //   4. BAHU MELAWAN PINGGUL — karena KEDUA tangan memegang senjata, puntiran
    //      balik torso inilah pengganti ayunan lengan (dan ia mengayunkan
    //      senapan kiri-kanan seperti orang berlari sungguhan).
    //   5. SENJATA BERDENYUT karena INERSIA: tertinggal naik saat badan turun +
    //      moncong mengangguk; ANCHOR GENGGAM digeser dgn ofset yang sama
    //      sehingga telapak tetap menempel di grip/forend.
    //   6. LARI SAMBIL MENEMBAK: begitu senjata meletus (`gunRecoil`), denyut
    //      senjata & puntiran bahu DIPADAMKAN ~70% — kaki tetap berlari tapi
    //      senapan DITAHAN stabil di garis bidik. =====
    const FIRE = clamp01(gunRecoil * 2.2);   // 1 = baru saja melepas tembakan
    let runK = 0, bodyBob = 0, leanF = 0, leanS = 0, torsoPitch = 0, torsoCounter = 0;
    let gunDX = 0, gunDY = 0, gunPitch = 0;
    let hipXL = 0, hipXR = 0, kneeXL = 0, kneeXR = 0, hipZ = 0;
    if (moving && !dodgeActive) {
        const relL = wrapPI(moveYawNow - legYaw);
        const fComp = Math.cos(relL), lComp = Math.sin(relL);
        runK = clamp01((sp - 8) / 62);                       // 0 = merayap, 1 = lari penuh
        // KADENS: naik mengikuti kecepatan, tapi PUNCAKNYA DIPATOK 13 rad/dtk
        // (= 2,07 siklus/dtk) — angka yang sama dengan kurva lama. Perombakan
        // 2026-07-27 sempat menaikkannya ke 15,5 dan user langsung menangkapnya:
        // "movement speed-nya terasa lebih cepat" padahal CFG.player.speed tak
        // pernah disentuh. Kaki yang berputar lebih cepat dari laju sebenarnya =
        // FOOT SLIDING (telapak menggeser tiap langkah) DAN membuat laju terbaca
        // lebih tinggi dari yang sesungguhnya. Bob + condong badan (di bawah)
        // sengaja DIPERTAHANKAN: keduanya menghidupkan gait tanpa berbohong soal
        // kecepatan. Player berlari 90 unit/dtk -> runK = 1 -> tepat 13.
        phase += dt * gaitSign * (6.0 + 7.0 * runK);
        phase = ((phase % TAU) + TAU) % TAU;                 // jaga presisi sin() jangka panjang
        const dirAmp = Math.max(0.32, Math.abs(fComp));      // menyamping = langkah lebih pendek
        const legL = legCycle(phase, (0.30 + 0.50 * runK) * dirAmp, (0.50 + 1.05 * runK) * dirAmp);
        const legR = legCycle(phase + Math.PI, (0.30 + 0.50 * runK) * dirAmp, (0.50 + 1.05 * runK) * dirAmp);
        hipXL = legL[0]; kneeXL = legL[1];
        hipXR = legR[0]; kneeXR = legR[1];
        const sw = Math.sin(phase);
        // Bidang FRONTAL: shuffle menyamping (kedua kaki membuka ke sisi gerak,
        // perilaku lama) + sedikit CROSSOVER (kaki mengayun mendekat ke garis
        // tengah badan) supaya langkahnya tidak terlihat seperti rel sejajar.
        hipZ = sw * ((0.24 + 0.30 * runK) * lComp + 0.07 * dirAmp);
        bodyBob = -(0.28 + 0.62 * runK) * dirAmp * (0.5 + 0.5 * Math.cos(2 * phase));
        leanF = (0.03 + 0.07 * runK) * fComp;                // condong ke arah lari (dikurangi 2026-07-28)
        leanS = -(0.04 + 0.09 * runK) * lComp;               // miring ke dalam saat menyamping
        // CONDONG DIKURANGI ~45% (2026-07-28, permintaan user: "terlalu over
        // condongnya"). Dulu badan+torso menumpuk ~18° di lari penuh sehingga
        // avatar terlihat menyeruduk ke depan; kini ~10° total: masih terbaca
        // sebagai berlari (bukan berjalan tegak seperti sebelum gait dirombak),
        // tapi kepala tak lagi mendahului kaki. Torso 0.11 -> 0.05, badan 0.13 -> 0.07.
        torsoPitch = (0.02 + 0.05 * runK) * Math.max(0, fComp) * (1 - 0.55 * FIRE);
        torsoCounter = -(0.05 + 0.11 * runK) * sw * (1 - 0.7 * FIRE);
        const steady = 1 - 0.7 * FIRE;                       // menembak = senjata ditahan
        gunDY = -bodyBob * 0.42 * steady;                    // inersia: senapan tertinggal naik
        gunDX = (0.07 + 0.13 * runK) * sw * steady;
        gunPitch = -(0.02 + 0.07 * runK) * Math.cos(2 * phase) * steady;
    }
    gaitDbg.phase = phase; gaitDbg.runK = runK; gaitDbg.bob = bodyBob;
    gaitDbg.counter = torsoCounter; gaitDbg.gunY = gunDY; gaitDbg.gunX = gunDX; gaitDbg.lean = leanF;

    // Prop terlihat = medkit saat medkitMode, selain itu senjata aktif — dengan
    // VARIAN LEVEL 3 (2026-07-12): senjata yang di-upgrade sampai Lv3 di shop
    // memakai bentuk 'X3' (Desert Eagle / combat shotgun / Gatling / roket bahu).
    // Selama sabetan melee (meleeT > 0): senjata disembunyikan, DUA PISAU tampil.
    const base = medkitMode ? 'medkit' : currentWeapon;
    const key = !medkitMode && props && props[base + '3']
        && ((player.weaponLvl && player.weaponLvl[base]) || 1) >= 3 ? base + '3' : base;
    const showKey = inMelee ? '__melee' : key;
    if (props && showKey !== propKey) {
        for (const k in props) props[k].visible = !inMelee && k === key;
        showMeleeGear(inMelee);   // dua pisau belati keluar HANYA selama sabetan
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
    // DENYUT LARI ikut lewat kanal yang SAMA (prop, bukan gunGrp): pitch
    // ditambahkan ke sudut recoil sehingga anchor genggam di bawah otomatis
    // ikut berputar, dan geseran (gunDX/gunDY) ditulis ke posisi prop lalu
    // dijumlahkan ke target tangan. gunGrp & avatarGunTip TIDAK bergerak —
    // titik spawn peluru + kilat muzzle tetap terkalibrasi (invarian).
    // ===== HENTAKAN TEMBAKAN (ROMBAK 2026-07-28) =====
    // Dulu: `props.rotation.x = -gunRecoil × cameraKick × 6` — moncong naik lalu
    // turun linier, selesai. Sekarang SATU kurva teredam `fireCurve` (bertanda)
    // memberi makan SEMUA kanal di bawah, dan sebuah AKUMULATOR `recoilStack`
    // menaikkan laras makin tinggi selama rentetan (muzzle climb) lalu reda.
    // Kanal: (1) laras MENGHENTAK NAIK + memantul turun, (2) senjata MUNDUR di
    // sumbu laras, (3) moncong terlempar ke samping ±acak per tembakan,
    // (4) torso ditolak KE BELAKANG, (5) bahu terpuntir, (6) kepala mengangguk,
    // (7) badan MEREDAM turun + lutut menekuk, (8) senjata BERAT MENDORONG
    // seluruh badan mundur selangkah. Semua amplitudo = CFG.weapons.recoil.*
    // × `cameraKick` senjata → pistol mencuit, shotgun/launcher menghentak.
    const RC = CFG.weapons.recoil || {};
    const fireK = shotT >= 0 && shotDur > 0 ? fireCurve(shotT / shotDur) : 0;
    const fireAmp = fireK * (shotKick || 0);
    const climb = (recoilStack || 0) * (shotKick || 0);
    const canFireAnim = !dodgeActive && !inMelee && deathT < 0;
    const fA = canFireAnim ? fireAmp : 0, fC = canFireAnim ? climb : 0;
    const gunPush = -fA * (RC.gunPush || 26);                 // mundur di sumbu laras
    fireDbg.k = fireK; fireDbg.climb = fC;
    fireDbg.pitch = -(fA * (RC.gunPitch || 6.5) + fC * (RC.climbPitch || 4));
    fireDbg.push = gunPush;
    fireDbg.torso = -fA * (RC.torso || 3.2);
    fireDbg.twist = fA * (RC.twist || 2.4) * (shotSide || 1);
    fireDbg.dip = -fA * (RC.bodyDip || 12);
    // DORONGAN MUNDUR (dinaikkan 2026-07-28, permintaan user: hentakan badan ke
    // BELAKANG kurang terasa sementara gerak lain berlebihan): senjata berat
    // memakai kekuatan penuh, senjata ringan `shoveLightMul` — keduanya config.
    fireDbg.shove = fA * (RC.shove || 40)
        * (shotKick >= (RC.heavyKick || 0.02) ? 1 : (RC.shoveLightMul || 0.45));

    let recC = 1, recS = 0;
    if (props && props[key]) {
        const a = fireDbg.pitch + gunPitch;
        props[key].rotation.x = a;
        props[key].rotation.y = fA * (RC.gunYaw || 2.4) * (shotSide || 1);   // moncong terlempar ke samping
        props[key].position.set(gunDX, gunDY, gunPush);
        recC = Math.cos(a); recS = Math.sin(a);
    }

    // ----- GULINGAN: pilih SISI BAHU tumpuan sekali di awal + jam fase RECOVER.
    // Guling tempur menyerong lewat satu bahu; sisinya = sisi arah gulingan
    // relatif arah bidik (menyamping = bahu terdepan), dan untuk guling
    // maju/mundur murni sisinya BERGANTIAN tiap dodge supaya dua gulingan
    // berturut-turut tak terlihat identik. Tanda ± murni estetis. -----
    if (dodgeActive && !dodgePrev) {
        const cr = Math.sin(aimYaw) * dodgeDirZ - Math.cos(aimYaw) * dodgeDirX;
        dodgeSide = Math.abs(cr) > 0.25 ? -Math.sign(cr) : (dodgeSideAlt = -dodgeSideAlt);
        landT = 0;
    } else if (!dodgeActive && dodgePrev) {
        landT = LAND_DUR;   // dodge selesai -> mulai fase pendaratan/bangkit
    }
    dodgePrev = dodgeActive;

    // ----- Target tangan (ruang avatarGroup) -> lengan tertarik. Titik genggam
    // DIPUTAR dgn pitch recoil yang sama (rotasi X di pangkal gunGrp) sehingga
    // telapak tetap MENEMPEL di grip/forend yang terangkat — tangan depan naik
    // paling terasa (dekat moncong), tangan pelatuk nyaris diam (dekat pangkal). -----
    const G = GRIPS[key] || GRIPS.rifle;
    let rTx = GUN_OFF.x + gunDX + G.R.x,
        rTy = GUN_OFF.y + gunDY + G.R.y * recC - G.R.z * recS,
        rTz = GUN_OFF.z + gunPush + G.R.y * recS + G.R.z * recC;
    let lTx = GUN_OFF.x + gunDX + G.L.x,
        lTy = GUN_OFF.y + gunDY + G.L.y * recC - G.L.z * recS,
        lTz = GUN_OFF.z + gunPush + G.L.y * recS + G.L.z * recC;
    let meleeDip = 0;   // merendah kuda-kuda saat menebas (dipakai blok kaki di bawah)
    if (dodgeActive) {
        // LENGAN GULINGAN (2026-07-27): bukan lagi TUCK datar sepanjang animasi —
        // MENGAYUN mengikuti fase: mengumpulkan tenaga di bawah-belakang (coil) →
        // MERAPAT ke dada (udara) → tangan depan MENJANGKAU LANTAI (extend) →
        // MENGEMBANG menjaga keseimbangan (plant). Kurva fase dihitung di
        // dodgeCurves() supaya blok kaki/rotasi di bawah memakai angka yang sama.
        const C = dodgeCurves(dodgeProgress);
        const arm = mixHands3(DA_COIL, DA_TUCK, DA_REACH, DA_BALANCE, C);
        rTx = arm.rx; rTy = arm.ry; rTz = arm.rz;
        lTx = arm.lx; lTy = arm.ly; lTz = arm.lz;
    } else if (inMelee) {
        // ===== TEBASAN DUA PISAU BELATI — OVERHAUL 2026-07-29 (permintaan user:
        // "mengibaskan pedang itu aneh untuk tentara zaman modern"). Menggantikan
        // sabetan pedang tunggal (2026-07-12, dipertajam 2026-07-27). =====
        // MEKANIK SERANGAN TIDAK BERUBAH SAMA SEKALI — damage, jangkauan, durasi
        // (MELEE_TIME), biaya stamina, dan kerucut area semuanya milik weapons.js
        // dan tidak disentuh; yang diganti HANYA koreografinya. Ambang fase
        // (A0/A1/A2) pun DIPERTAHANKAN supaya momen hit (45% ayunan) tetap jatuh
        // tepat saat bilah menyapu sasaran.
        //   * SILANG X: pisau tangan DEPAN menebas MENURUN keluar→dalam, pisau
        //     tangan satunya MENYUSUL (offset KNIFE_LAG) menebas MENAIK ke arah
        //     berlawanan — dari kamera top-down terbaca huruf X, bukan satu
        //     busur pedang.
        //   * `meleeSide` mencerminkan SELURUH koreografi (arah sapuan + tangan
        //     mana yang memimpin), jadi dua serangan berturut-turut tetap tak
        //     identik — kontrak lama 2026-07-27 dipertahankan.
        //   * Badan tetap MENERJANG + merendah + pinggang memuntir dgn kurva yang
        //     sama seperti dulu (bobot serangannya tidak dikurangi).
        const M = meleeSide || 1;                            // cermin koreografi
        const k = 1 - Math.max(0, meleeT) / MELEE_TIME;      // 0..1 sepanjang ayunan
        const A0 = 0.18, A1 = 0.52, A2 = 0.74;
        const KNIFE_LAG = 0.12;                              // jeda pisau kedua (pembentuk X)
        // --- Dinamika BADAN (kurva lama, tak diubah) ---
        let twist, lunge;
        if (k < A0) {
            const t = k / A0, e = 1 - (1 - t) * (1 - t);     // easeOut: sentakan ancang
            twist = 0.3 * e; lunge = -0.4 * e;               // condong mundur tipis
        } else if (k < A1) {
            const t = (k - A0) / (A1 - A0), e = t * t * t;   // easeIn kubik: akselerasi keras
            twist = 0.3 - 0.75 * e;                          // pinggang ikut memuntir
            lunge = -0.4 + 2.8 * e;                          // MENERJANG maju
            meleeDip = 0.9 * e;
        } else if (k < A2) {
            const t = (k - A1) / (A2 - A1), d = Math.exp(-4.2 * t);
            twist = -0.45 + 0.08 * d;
            lunge = 2.4 - 0.35 * (1 - d);
            meleeDip = 0.9 - 0.12 * (1 - d);
        } else {
            const t = (k - A2) / (1 - A2), e = t * t * (3 - 2 * t);   // smoothstep pulih
            twist = -0.37 * (1 - e);
            lunge = 2.05 * (1 - e);
            meleeDip = 0.78 * (1 - e);
        }
        twist *= M;
        // --- Dua tebasan pisau. Tangan PEMIMPIN = kanan saat M=+1, kiri saat
        // M=-1; ia menebas MENURUN mulai A0, pasangannya MENAIK mulai A0+lag.
        // `s` (arah sapuan) berlawanan antar tangan DAN ikut bercermin dgn M.
        const dur = A1 - A0;
        const leadR = M > 0;
        const uR = ((k - A0) - (leadR ? 0 : KNIFE_LAG)) / dur;
        const uL = ((k - A0) - (leadR ? KNIFE_LAG : 0)) / dur;
        const aR = knifeArc(uR, M, leadR);      // s = +M
        const aL = knifeArc(uL, -M, !leadR);    // s = -M (menyapu berlawanan)
        knifeR.rotation.set(aR.pitch, aR.yaw, aR.roll);
        knifeL.rotation.set(aL.pitch, aL.yaw, aL.roll);
        // Dinamika BADAN: puntiran pinggang + terjangan maju (sumbu hadap lokal)
        // + merendah — visual murni, posisi logika player tak tersentuh.
        avatarGroup.rotateY(twist);
        avatarGroup.translateZ(lunge);
        avatarGroup.position.y = feetY - meleeDip * 0.55;
        // Jejak swoosh: satu per pisau, membuntuti bilahnya masing-masing
        // (sektor mulai di sudut bilah, membentang ke sisi yang baru dilewati).
        const lay = (grp, m, arc, s) => {
            grp.visible = arc.sw > 0.02;
            if (!grp.visible) return;
            m.opacity = arc.sw;
            grp.rotation.y = arc.yaw - s * Math.PI / 2;
        };
        lay(swooshR, swooshMatR, aR, M);
        lay(swooshL, swooshMatL, aL, -M);
        // Telapak MENEMPEL di gagang masing-masing pisau.
        const hR = knifeHandTarget(SHOULDER.R, aR.pitch, aR.yaw);
        const hL = knifeHandTarget(SHOULDER.L, aL.pitch, aL.yaw);
        rTx = hR.x; rTy = hR.y; rTz = hR.z;
        lTx = hL.x; lTy = hL.y; lTz = hL.z;
    }
    if (!inMelee) {
        if (swooshR && swooshR.visible) swooshR.visible = false;
        if (swooshL && swooshL.visible) swooshL.visible = false;
    }
    // Kilat bilah benturan meluruh TANPA SYARAT (bukan di dalam cabang melee):
    // ayunan bisa habis sementara kilatnya belum padam — kalau peluruhannya ikut
    // cabang, bilah tertinggal menyala sampai tebasan berikutnya.
    if (bladeFlash > 0) {
        bladeFlash = Math.max(0, bladeFlash - dt * 7);
        if (bladeMat) bladeMat.emissive.setRGB(bladeFlash, bladeFlash * 0.85, bladeFlash * 0.55);
    }
    placeArm('R', rTx, rTy, rTz);
    placeArm('L', lTx, lTy, lTz);

    if (dodgeActive) {
        // ===== GULINGAN TEMPUR (dirombak 2026-07-27 — lihat blok konstanta
        // "GULINGAN TEMPUR" di atas): putaran 360° di sekitar PINGGANG, tapi
        // waktunya DIPADATKAN ke tengah (smootherstep di jendela 0.10-0.88) dan
        // badan tidak lagi kaku — ia MELENGKUNG (torso melipat), MIRING lewat
        // satu bahu (bank), kakinya asimetris, dan mendaratnya diredam. =====
        const p = dodgeProgress;
        const C = dodgeCurves(p);
        const th = C.rot * Math.PI * 2;
        _tumbleAxis.set(dodgeDirZ, 0, -dodgeDirX);  // sumbu horizontal ⟂ arah gulingan
        const al = Math.hypot(_tumbleAxis.x, _tumbleAxis.z);
        if (al > 1e-4) {
            _tumbleAxis.multiplyScalar(1 / al);
            _qT.setFromAxisAngle(_tumbleAxis, th);
            avatarGroup.quaternion.premultiply(_qT);   // putaran ruang-dunia SETELAH hadap
            // MIRING LEWAT BAHU: guling tempur nyata tidak lurus melewati kepala,
            // ia menyerong di atas SATU bahu. Sumbu = arah gulingan itu sendiri,
            // amplitudo 0 di awal & akhir (mendarat tetap rata).
            const bank = DODGE_BANK * Math.sin(Math.PI * C.rot) * dodgeSide;
            if (bank) {
                _rollAxis.set(dodgeDirX, 0, dodgeDirZ);
                _qR.setFromAxisAngle(_rollAxis, bank);
                avatarGroup.quaternion.premultiply(_qR);
            }
            // Geser origin (kaki) mengelilingi pivot pinggang setinggi PIV ->
            // badan berputar pada pusat massanya, bukan terseret di lantai.
            const s = Math.sin(th), c = Math.cos(th);
            avatarGroup.position.x -= DODGE_PIV * s * dodgeDirX;
            avatarGroup.position.z -= DODGE_PIV * s * dodgeDirZ;
            // Tinggi: busur melayang + MERENDAH saat mengumpulkan tenaga (coil)
            // dan saat lutut MEREDAM hentakan mendarat (plant).
            avatarGroup.position.y = feetY + DODGE_PIV * (1 - c)
                + DODGE_AIR * Math.sin(Math.PI * clamp01((p - 0.10) / 0.80))
                - 0.95 * C.coil - 1.15 * C.plant;
        }
        // TORSO: melengkung ke belakang saat memuat, MELIPAT ke lutut di udara,
        // tertunduk ke depan saat mendarat. Inilah yang membedakan "tubuh
        // menggulung" dari "patung berputar".
        upperG.rotation.x = -0.32 * C.coil + 1.00 * C.tuck + 0.45 * C.plant;
        upperG.position.y = -0.35 * C.tuck;
        // KEPALA: dagu merapat ke dada sepanjang gulingan (melindungi leher),
        // lalu mendongak kembali ke garis bidik saat mendarat.
        lerpHeadPitch(0.62 * C.tuck - 0.22 * C.plant, 1);
        // KAKI asimetris: kaki dalam (sisi bahu tumpuan) menekuk lebih rapat dan
        // menjulur lebih dulu; kaki luar menyusul -> tidak lagi seperti boneka.
        const inn = dodgeSide > 0 ? 1 : 0;   // 1 = kaki kiri jadi kaki dalam
        const tIn = C.tuck, tOut = Math.sin(Math.PI * clamp01((p - 0.02) / 0.80));
        const hipIn = -1.95 * tIn - 0.55 * C.coil + 0.65 * C.plant;
        const hipOut = -1.45 * tOut - 0.35 * C.coil - 0.50 * C.plant;
        const kneeIn = 2.35 * tIn + 0.85 * C.coil + 0.95 * C.plant;
        const kneeOut = 1.85 * tOut + 0.60 * C.coil + 1.25 * C.plant;
        hipL.rotation.x = inn ? hipIn : hipOut;
        hipR.rotation.x = inn ? hipOut : hipIn;
        kneeL.rotation.x = inn ? kneeIn : kneeOut;
        kneeR.rotation.x = inn ? kneeOut : kneeIn;
        hipL.rotation.z = 0.16 * C.tuck * dodgeSide; hipR.rotation.z = 0.16 * C.tuck * dodgeSide;
        // SENJATA DIDEKAP: selama menggulung, senapan ditarik menyilang di dada
        // (kalau dibiarkan di GUN_OFF ia menancap ke lantai saat badan terbalik).
        if (gunGrpRef) {
            gunGrpRef.position.set(
                GUN_OFF.x + (0.15 - GUN_OFF.x) * C.tuck,
                GUN_OFF.y + (6.9 - GUN_OFF.y) * C.tuck,
                GUN_OFF.z + (0.85 - GUN_OFF.z) * C.tuck);
            gunGrpRef.rotation.set(-0.35 * C.tuck, 0.6 * C.tuck, 0);
        }
    } else if (moving) {
        // ===== GAIT TERARAH (2026-07-12; KURVA DIROMBAK 2026-07-27): siklus
        // mengikuti arah gerak RELATIF HADAP KAKI — komponen sejajar = ayunan
        // pinggul maju/mundur (fase DIPUTAR TERBALIK saat backpedal -> kaki
        // benar-benar melangkah mundur), komponen menyamping = kedua pinggul
        // membuka-menutup bersama (side-shuffle nyata). Nilainya dihitung di
        // blok "SIKLUS LARI" di atas (senjata & tangan memakai angka yang sama).
        hipL.rotation.x = hipXL; hipR.rotation.x = hipXR;
        kneeL.rotation.x = kneeXL; kneeR.rotation.x = kneeXR;
        hipL.rotation.z = hipZ; hipR.rotation.z = hipZ;
        upperG.position.y = bodyBob * 0.22;          // torso ikut tertekan di titik terberat
        upperG.rotation.x = torsoPitch;              // condong ke depan saat lari
        upperG.rotation.y = twistCur + torsoCounter; // BAHU melawan ayunan pinggul
        avatarGroup.position.y += bodyBob;           // bob badan (poros kaki)
        if (leanF) avatarGroup.rotateX(leanF);       // condong ke arah lari
        if (leanS) avatarGroup.rotateZ(leanS);       // miring ke dalam saat menyamping
        headG.position.y -= bodyBob * 0.55;          // KEPALA distabilkan (pandangan tetap datar)
    } else if (realign) {
        // Seret langkah kecil saat kaki menyesuaikan hadap (turn-in-place) —
        // kaki tak boleh berputar diam-diam tanpa melangkah.
        phase += dt * 9;
        const s = Math.sin(phase);
        hipL.rotation.x = s * 0.16; hipR.rotation.x = -s * 0.16;
        kneeL.rotation.x = Math.max(0, -s) * 0.2; kneeR.rotation.x = Math.max(0, s) * 0.2;
        hipL.rotation.z *= 0.85; hipR.rotation.z *= 0.85;
        upperG.position.y *= Math.max(0, 1 - dt * 8);
        upperG.rotation.x *= Math.max(0, 1 - dt * 8);   // luruhkan condong lari
    } else {
        const damp = Math.max(0, 1 - dt * 10);
        hipL.rotation.x *= damp; hipR.rotation.x *= damp;
        kneeL.rotation.x *= damp; kneeR.rotation.x *= damp;
        hipL.rotation.z *= damp; hipR.rotation.z *= damp;
        upperG.position.y *= damp;
        upperG.rotation.x *= damp;                      // luruhkan condong lari
    }
    // ===== RECOVER pendaratan gulingan (2026-07-27): LAND_DUR detik SETELAH
    // dodge selesai — i-frame sudah mati, jadi pemulihan memang rentan (itu
    // memang harganya). Bukan overlay aditif melainkan CROSSFADE ke pose normal:
    // di w=1 pose = mendarat berlutut (sambung mulus dgn frame terakhir dodge),
    // lalu larut ke gait/idle biasa — kaki tetap bisa langsung melangkah. =====
    if (landT > 0) {
        landT -= dt;
        const w = Math.max(0, landT) / LAND_DUR;
        const we = smoothstep(w);
        const inn = dodgeSide > 0 ? 1 : 0;
        const hIn = 0.65, hOut = -0.50, kIn = 0.95, kOut = 1.25;   // = pose 'plant' penuh
        const bl = (cur, tgt) => cur * (1 - we) + tgt * we;
        hipL.rotation.x = bl(hipL.rotation.x, inn ? hIn : hOut);
        hipR.rotation.x = bl(hipR.rotation.x, inn ? hOut : hIn);
        kneeL.rotation.x = bl(kneeL.rotation.x, inn ? kIn : kOut);
        kneeR.rotation.x = bl(kneeR.rotation.x, inn ? kOut : kIn);
        // Torso & tinggi badan DITULIS (bukan di-blend) supaya sisa tunduk pose
        // guling pasti luruh ke 0 — landT berjalan SETELAH blok gait, jadi ia
        // menang atas condong lari selama 0,22 dtk pemulihan itu (disengaja:
        // baru mendarat memang belum tegak berlari).
        upperG.rotation.x = 0.45 * we;
        avatarGroup.position.y = feetY - 1.15 * we;   // = kedalaman redam akhir fase plant
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

    // ===== OVERLAY HENTAKAN SELURUH BADAN (2026-07-28) =====
    // Ditulis PALING AKHIR & bersifat ADITIF supaya menumpang pose apa pun yang
    // sudah dihitung (idle / gait / pemulihan gulingan) tanpa merusaknya. Ini
    // bagian yang membuat tembakan terasa "berat": bukan cuma senjata yang
    // bergerak — torso ditolak ke belakang, bahu terpuntir, kepala mengangguk,
    // lutut meredam, dan senjata BERAT benar-benar MENDORONG badan mundur
    // selangkah. Semua kanal memakai SATU kurva (`fireDbg`, dihitung di atas),
    // jadi tak ada bagian tubuh yang bergerak di ritme sendiri.
    // `fireHeadCur` menjaga anggukan kepala kembali TEPAT ke nol saat hentakan
    // habis (lerpHeadPitch itu stateful — ia juga mengoreksi posisi leher).
    if (fireDbg.k !== 0 || fireHeadCur !== 0) {
        upperG.rotation.x += fireDbg.torso;     // torso tertolak ke BELAKANG
        upperG.rotation.y += fireDbg.twist;     // bahu terpuntir ke sisi hentakan
        avatarGroup.position.y += fireDbg.dip;  // badan MEREDAM (lutut memendek)
        if (fireDbg.shove) {                    // senjata berat mendorong badan mundur
            avatarGroup.position.x -= Math.sin(aimYaw) * fireDbg.shove;
            avatarGroup.position.z -= Math.cos(aimYaw) * fireDbg.shove;
        }
        const flex = fireDbg.dip * (RC.kneeFlex || 0.9);   // dip negatif -> lutut menekuk
        hipL.rotation.x += flex * 0.35; hipR.rotation.x += flex * 0.35;
        kneeL.rotation.x -= flex * 0.8; kneeR.rotation.x -= flex * 0.8;
        const nod = fireDbg.k * (shotKick || 0) * (RC.headNod || 1.8);
        fireHeadCur = nod;
        lerpHeadPitch(nod, 1);
    }

    if (marker && marker.visible) {
        markerT += dt;
        const k = 1 + Math.sin(markerT * 6) * 0.18;
        marker.scale.setScalar(3.2 * k);
        marker.material.opacity = 0.55 + Math.sin(markerT * 6) * 0.25;
    }
}
