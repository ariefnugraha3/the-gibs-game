// ============================================================
// LANSKAP STAGE 8 — KOTA BANDUNG -> PERSAWAHAN JAWA BARAT (2026-08-17)
// ============================================================
// Permintaan user: "perbaiki background di Stage 8. buat agar backgroundnya di
// perkotaan kota Bandung. kemudian ketika hampir melawan boss, transisikan
// backgroundnya menjadi di persawahan khas Jawa Barat. dan ketika melawan boss,
// backgroundnya tetap di persawahan khas Jawa Barat."
//
// Sebelum ini seluruh latar Stage 8 adalah TIGA baris prop generik yang diulang
// lewat `index % 3` di dalam modul jalan — dua pohon, dua gudang beton, dua
// kerucut abu-abu — plus dua petak sawah di indeks 8/11. Di luar bahu jalan
// (|z| > 73) memang TIDAK ADA PERMUKAAN TANAH sama sekali, jadi yang tampil di
// bawahnya adalah `scene.background` (haze kota) — persis kegagalan "lanskap
// dibangun di luar jangkauan kamera" pada Stage 5.
//
// ENAM ATURAN YANG MENENTUKAN SELURUH BENTUK BERKAS INI:
//
// 1. DUA BABAK, TAPI PREALOKASI PENUH. Tiap modul membawa KEDUA lanskap (kota
//    dan sawah) sebagai anak grup yang tinggal di-toggle `visible`. Tidak ada
//    mesh, material atau PointLight yang lahir saat babaknya berganti, jadi
//    invarian "tanpa rekompilasi shader saat main" tetap terpegang.
//
// 2. BABAK BERGANTI SAMBIL BERJALAN, TIDAK PERNAH DI DEPAN MATA. Sebuah modul
//    hanya boleh mengambil babak baru saat ia BERADA DI LUAR LAYAR — lewat wrap
//    (lahir kembali jauh di depan) atau lewat `relayoutAhead()` sekali saat
//    ambangnya terlewat. Pita peralihan modul terdekat di-DITHER supaya kota
//    terbaca MENIPIS jadi sawah, bukan satu garis lurus tempat kota berhenti.
//    Cakrawala jauh sengaja TIDAK di-dither: siluetnya harus berpindah sebagai
//    satu garis horizon, bukan gigi gergaji.
//
// 3. INI TOP-DOWN, JADI TINGGI ITU MAHAL DAN KEDALAMAN ITU TERBATAS. Kamera
//    gameplay Stage 8 duduk di (-134,4 / +127,2 / +122,4). Diukur dari proyeksi
//    kamera itu, anggaran tinggi yang benar-benar tampil kira-kira:
//        z -120 -> 95 | z -200 -> 80 | z -300 -> 65 | z -420 -> 45 | z -600 -> 15
//    dan sisi KAMERA (+z) habis di z ~155. Karena itu: gedung TERTINGGI justru
//    ada di baris DEPAN (z -110..-175), baris tengah menengah, dan cakrawala
//    jauh sengaja terpotong tepi atas layar — potongan itulah yang MENGISI tepi
//    frame. Tidak ada apa pun yang dibangun di luar tapak pandang (smoke
//    menegakkannya dari `groundViewExtents`, bukan angka mati).
//
// 4. SISI +z ADALAH SISI KAMERA. Ruas mata->player berada di y ~106 saat ia
//    melintasi z +88, jadi prop setinggi <= 40 di pita depan mustahil menutupi
//    player, gunship (y 40-55 di depan) maupun carrier. Pita itu dipakai untuk
//    MEMBINGKAI tepi bawah layar dan menjual kecepatan.
//
// 5. TIGA POOL, TIGA PARALLAX. Semuanya berbentang 1680 unit supaya wrap-nya
//    sederhana: near 1.0 (menempel tanah), mid 0.62, far 0.34. Tanpa parallax
//    seluruh latar menggeser serempak dan langsung terbaca sebagai satu pelat.
//
// 6. DETERMINISTIK DAN DILAS. Penataan memakai HASH INDEKS, tidak pernah
//    `Math.random()` — pool ini dibangun saat loading bersama seluruh dunia
//    campaign, dan memakai RNG global akan menggeser penempatan acak stage lain.
//    Tiap varian babak DILAS sendiri (`mergeObjectInPlace`) sehingga ribuan mesh
//    mentah hanya berharga belasan draw call per modul yang masih frustum-cull.
//
// Lanskap ini MURNI DEKOR: tanpa blocker, tanpa sel nav, tanpa PointLight.
// Tanpa papan nama tempat/toko/arah — aturan "Stage 5-13 tanpa location sign".

import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { mergeObjectInPlace, materialKey } from '../../../../utils/meshBatch.js';

// ===== BENTANG & PITA ===================================================
// Ketiga pool sengaja berbentang sama (1680) supaya satu konstanta wrap saja.
const SPAN = 1680;
const NEAR_N = 12, NEAR_STEP = SPAN / NEAR_N;      // 140
const MID_N = 10, MID_STEP = SPAN / MID_N;         // 168
const FAR_N = 7, FAR_STEP = SPAN / FAR_N;          // 240
// Bias ke DEPAN: makin banyak modul yang menunggu di luar layar depan, makin
// banyak yang bisa ditata ulang seketika saat babak berganti (aturan 2). Batas
// bawahnya keras — tepi KIRI pool harus tetap menutupi tapak pandang SESAAT
// SESUDAH modul terkiri wrap, yaitu `left + step/2 <= minX` (-159 pada kamera
// gameplay 16:9). Dengan step near 140 itu berarti left <= -229; 0,16 x 1680 =
// -269 menyisakan margin 40 unit, dan tepi kanannya (+1411) masih menutupi
// kamera cutscene pembuka yang jauh lebih lebar (maxX ~1171).
const POOL_BIAS = 0.16;

// Tepi luar guardrail jalan tol ada di |z| ~74; pita tanah menyelinap DI BAWAH
// bahu jalan supaya tidak pernah ada celah di antara keduanya.
const VERGE = 74;
const GROUND_IN = 66;              // tepi dalam slab tanah (di bawah bahu jalan)
const BACK0 = -86;                 // tepi dalam pita perabot sisi backdrop
const BACK_NEAR_END = -205;        // batas tanah pool near
const MID_Z0 = -190, MID_Z1 = -345;
const FAR_Z0 = -335, FAR_Z1 = -520;
// TANAH HARUS MELEWATI TEPI FRAME, BUKAN BERHENTI PERSIS DI SITU (2026-08-17,
// laporan user "di sisi kanan jalan masih terlihat area biru yang kosong").
// Tapak pandang kamera gameplay pada bidang tanah lanskap (y -0,9) mencapai
// z +160 / -718 pada 16:9 dan +187 / -838 pada 21:9 — versi pertama berhenti di
// +155 dan -520, jadi haze `scene.background` menganga di tepi bawah-kanan
// (justru tempat skala dunia paling besar) dan di kaki cakrawala. Kedua batas
// di bawah sengaja MELEWATI tapak 21:9; harganya satu balok per modul.
const FG_END = 205;                // ujung luar tanah sisi kamera
const FAR_END = -860;              // ujung luar tanah sisi backdrop
// Pita depan sisi kamera (aturan 4) tempat prop berdiri; tanahnya terus sampai
// FG_END, tetapi isinya berhenti di sini karena di luar itu nyaris tak terlihat.
const FG0 = 86, FG1 = 158;
// Baris siluet PALING JAUH: hanya terbaca ~20 unit tingginya sebelum terpotong
// tepi atas layar, jadi isinya sengaja rendah dan jarang — tugasnya sekadar
// membuat kaki cakrawala tidak terbaca sebagai pelat datar kosong.
const HAZE_Z = -560;

// Ambang "aman di luar layar ke depan": tepi tapak pandang kamera gameplay
// (maxX ~711) ditambah setengah lebar modul TERBESAR (far, 240) plus cadangan
// untuk layar yang lebih lebar. Smoke menegakkannya dari renderer, bukan angka
// mati, jadi ia tidak bisa diam-diam meleset kalau kameranya diubah.
export const S8_SCENERY_AHEAD = 900;

// Pola dither pita peralihan (aturan 2): 0 = modul ini masih memakai babak lama.
const BLEND_PATTERN = Object.freeze([0, 1, 0, 1, 1, 0, 1, 1]);
const otherAct = act => (act === 'city' ? 'rice' : 'city');

export const S8_SCENERY_ROWS = Object.freeze({
    verge: VERGE, groundIn: GROUND_IN, back: [BACK0, BACK_NEAR_END],
    mid: [MID_Z0, MID_Z1], far: [FAR_Z0, FAR_Z1], foreground: [FG0, FG1],
    // Rentang TANAH (bukan prop): inilah yang harus menutupi tapak pandang.
    ground: [FAR_END, FG_END], haze: HAZE_Z,
    span: SPAN, near: NEAR_N, midCount: MID_N, farCount: FAR_N,
});

// ===== HASH DETERMINISTIK (aturan 6) ====================================
function hash1(n) {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}
const rnd = (seed, k) => hash1(seed * 7919 + k * 337 + 11);
const rr = (seed, k, a, b) => a + (b - a) * rnd(seed, k);
const ri = (seed, k, a, b) => a + Math.floor(rnd(seed, k) * (b - a + 1));
const pick = (seed, k, arr) => arr[Math.min(arr.length - 1,
    Math.floor(rnd(seed, k) * arr.length))];

// Nada turunan token PAL (bukan warna baru) — aturan palet GIBS 2045.
function shade(hex, f) {
    const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
    const b = Math.min(255, Math.round((hex & 255) * f));
    return (r << 16) | (g << 8) | b;
}

// ===== MATERIAL =========================================================
// SEDIKIT dan DIPAKAI ULANG: satu material = satu draw call per grup las, jadi
// menambah satu nada baru harganya nyata dikali jumlah modul. Semua token PAL.
export function stage8SceneryMaterials() {
    const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
    return {
        // tanah
        earth: lam(PAL.wood),                       // tanah/pematang/batang pohon
        earthDark: lam(shade(PAL.wood, 0.62)),      // slab dasar & parit
        grass: lam(shade(PAL.leaf, 0.72)),          // rumput tua (kanopi tetap terbaca di atasnya)
        leaf: lam(PAL.leaf),                        // daun & padi muda
        water: lam(PAL.techDim),                    // air sawah/saluran irigasi
        // kota
        asphalt: lam(PAL.rubber),
        concrete: lam(PAL.concrete),
        panel: lam(PAL.panel),
        wallTan: lam(shade(PAL.wood, 1.26)),
        genteng: lam(PAL.hazard),                   // atap tanah liat khas Indonesia
        deck: lam(PAL.gunmetal),                    // atap dak / rangka
        metal: lam(PAL.steel),
        lit: lam(PAL.screenBg, { emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * 0.58 }),
        lamp: lam(PAL.amber, { emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * 0.86 }),
    };
}

// ===== PRIMITIF =========================================================
// Dekor latar TIDAK ikut shadow map: pada malam sedalam ini bayangannya tak
// terbaca, sementara biayanya nyata tiap frame (aturan yang sama dengan kota
// Stage 7).
function bx(put, mat, sx, sy, sz, x, y, z, yaw = 0) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    o.position.set(x, y, z); if (yaw) o.rotation.y = yaw;
    o.castShadow = false; o.receiveShadow = false; put(o); return o;
}
function cyl(put, mat, rt, rb, h, seg, x, y, z) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    o.position.set(x, y, z);
    o.castShadow = false; o.receiveShadow = false; put(o); return o;
}
function cone(put, mat, r, h, seg, x, y, z) {
    const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
    o.position.set(x, y, z);
    o.castShadow = false; o.receiveShadow = false; put(o); return o;
}
// Bilah miring: balok yang MEMANJANG ke arah `yaw` lalu ditundukkan `droop`.
// Urutan Euler default 'XYZ' memutar Z lebih dulu baru Y, jadi `rz` benar-benar
// menundukkan ujung +x lokal sebelum balok itu diputar ke arah `yaw`.
function blade(put, mat, len, thick, wide, x, y, z, yaw, droop) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(len, thick, wide), mat);
    o.position.set(x, y, z); o.rotation.set(0, yaw, droop);
    o.castShadow = false; o.receiveShadow = false; put(o); return o;
}
// Atap limasan/perisai: kerucut 4 sisi yang SUDAH diputar di level geometry agar
// penskalaan (w,1,d) menghasilkan alas persegi panjang sejajar sumbu — kalau
// diputar di level objek, alasnya berubah jadi belah ketupat.
function hipRoof(put, mat, w, d, h, x, yBase, z) {
    const g = new THREE.ConeGeometry(0.70711, h, 4).rotateY(Math.PI / 4);
    const o = new THREE.Mesh(g, mat);
    o.scale.set(w, 1, d); o.position.set(x, yBase + h / 2, z);
    o.castShadow = false; o.receiveShadow = false; put(o); return o;
}

// ===== KOSAKATA PROP ====================================================
// --- vegetasi ---
// KELAPA. Mahkotanya dulu sebuah KERUCUT TERBALIK (2026-08-17, laporan user
// "sepertinya ada pohon yang bentuk daunnya terbalik") — dari kamera oblique itu
// terbaca persis sebagai segitiga menunjuk ke bawah, bukan pelepah. Sekarang
// mahkotanya enam PELEPAH sungguhan: bilah pipih yang memanjang keluar dari
// pucuk batang lalu menunduk, plus tandan buah. Tidak ada satu pun bentuk yang
// diputar terbalik di seluruh berkas ini.
function palm(put, M, x, gy, z, h) {
    cyl(put, M.earth, h * 0.045, h * 0.085, h, 5, x, gy + h / 2, z);
    const cy = gy + h, len = h * 0.46, droop = 0.44;
    const half = len / 2, reach = half * Math.cos(droop), drop = half * Math.sin(droop);
    for (let k = 0; k < 6; k++) {
        // Fase dari tinggi pohon: dua kelapa bersebelahan tak pernah sepadan.
        const a = k * (Math.PI / 3) + (h % 7) * 0.21;
        blade(put, M.leaf, len, h * 0.045, h * 0.15,
            x + Math.cos(a) * reach, cy - drop + h * 0.04, z + Math.sin(a) * reach,
            -a, -droop);
    }
    cyl(put, M.earth, h * 0.07, h * 0.06, h * 0.09, 5, x, cy - h * 0.03, z);
}
function tree(put, M, x, gy, z, h) {
    cyl(put, M.earth, h * 0.06, h * 0.10, h * 0.42, 5, x, gy + h * 0.21, z);
    cone(put, M.leaf, h * 0.40, h * 0.52, 7, x, gy + h * 0.60, z);
    cone(put, M.leaf, h * 0.28, h * 0.34, 7, x, gy + h * 0.86, z);
}
// PISANG. Daunnya dulu DIGESER ke arah (cos a, sin a) tetapi DIPUTAR `a` —
// yaw memetakan +x lokal ke (cos a, -sin a), jadi tiap daun menjulur ke satu
// arah sementara badannya menghadap arah lain. Sekarang keduanya memakai -a
// dan daunnya ikut menunduk seperti daun pisang sungguhan.
function banana(put, M, x, gy, z, h) {
    cyl(put, M.earth, h * 0.07, h * 0.10, h * 0.55, 5, x, gy + h * 0.28, z);
    const len = h * 0.62, droop = 0.30;
    const half = len / 2, reach = half * Math.cos(droop), drop = half * Math.sin(droop);
    for (let k = 0; k < 5; k++) {
        const a = k * 1.257 + 0.4;
        blade(put, M.leaf, len, h * 0.05, h * 0.22,
            x + Math.cos(a) * reach, gy + h * 0.62 - drop, z + Math.sin(a) * reach,
            -a, -droop);
    }
}
function bamboo(put, M, x, gy, z, h) {
    for (let k = 0; k < 3; k++)
        cone(put, M.leaf, h * 0.16, h - k * h * 0.16, 5,
            x + (k - 1) * h * 0.13, gy + (h - k * h * 0.16) / 2, z + (k % 2) * h * 0.10);
}
function bush(put, M, x, gy, z, r) {
    cone(put, M.leaf, r, r * 1.35, 6, x, gy + r * 0.65, z);
}

// --- bangunan ---
// Deret jendela menyala menghadap jalan (+z). Satu-satunya emissive lingkungan
// di lanskap ini selain kepala lampu jalan.
function litBand(put, M, x, y, z, w) {
    bx(put, M.lit, w, 2.2, 1.1, x, y, z + 0.7);
}
// Rumah kampung / saung: badan + atap limasan. Bedanya cuma material.
function house(put, M, x, gy, z, w, d, h, wall, roof) {
    bx(put, wall, w, h, d, x, gy + h / 2, z);
    hipRoof(put, roof, w * 1.16, d * 1.20, h * 0.60, x, gy + h, z);
}
// Ruko: tiga unit sempit, kanopi menerus, etalase menyala — TANPA papan nama.
function ruko(put, M, x, gy, z, w, d, h, seed, k) {
    const uw = w / 3;
    for (let u = 0; u < 3; u++) {
        const uh = h * (0.82 + 0.18 * ((u + k) % 2));
        bx(put, pick(seed, k + u * 3, [M.panel, M.wallTan, M.concrete]),
            uw - 2, uh, d, x - w / 2 + uw * (u + 0.5), gy + uh / 2, z);
        litBand(put, M, x - w / 2 + uw * (u + 0.5), gy + uh * 0.62, z + d / 2, uw * 0.62);
    }
    bx(put, M.deck, w + 3, 1.6, 5, x, gy + h * 0.30, z + d / 2 + 2);   // kanopi
    bx(put, M.lit, w * 0.86, 2.6, 1, x, gy + h * 0.16, z + d / 2 + 0.6);  // etalase
}
// Blok kantor/apartemen: badan + setback + tangki air + antena.
function block(put, M, x, gy, z, w, d, h, seed, k) {
    const wall = pick(seed, k, [M.panel, M.concrete, M.wallTan]);
    bx(put, wall, w, h, d, x, gy + h / 2, z);
    bx(put, wall, w * 0.62, h * 0.22, d * 0.66, x, gy + h + h * 0.11, z);
    for (let f = 1; f <= 3; f++) litBand(put, M, x, gy + h * (0.22 * f + 0.10), z + d / 2, w * 0.74);
    bx(put, M.metal, w * 0.26, 4, d * 0.26, x + w * 0.22, gy + h + h * 0.22 + 2, z);
    cyl(put, M.metal, 0.6, 0.6, h * 0.16, 4, x - w * 0.22, gy + h + h * 0.22 + h * 0.08, z);
}
// Gudang/bengkel: badan rendah lebar, atap pelana genteng, pintu rol.
function warehouse(put, M, x, gy, z, w, d, h) {
    bx(put, M.concrete, w, h, d, x, gy + h / 2, z);
    hipRoof(put, M.genteng, w * 1.08, d * 1.14, h * 0.46, x, gy + h, z);
    bx(put, M.deck, w * 0.34, h * 0.72, 1.2, x, gy + h * 0.36, z + d / 2 + 0.6);
}
// Pasar/terminal beratap: kolom + dak lebar + deret kios di bawahnya.
function marketShed(put, M, x, gy, z, w, d, h) {
    for (let k = 0; k < 4; k++)
        cyl(put, M.metal, 1.2, 1.2, h, 6, x - w / 2 + (k + 0.5) * (w / 4), gy + h / 2, z);
    bx(put, M.deck, w + 4, 2.4, d + 4, x, gy + h + 1.2, z);
    for (let k = 0; k < 3; k++)
        bx(put, pick(k, 2, [M.panel, M.wallTan, M.concrete]), w / 4, h * 0.52, d * 0.5,
            x - w / 2 + (k + 0.8) * (w / 4), gy + h * 0.26, z);
    bx(put, M.lit, w * 0.8, 1.4, 1, x, gy + h * 0.78, z + d / 2 + 1);
}
// Masjid kampung: badan + kubah + menara. Arsitektur, bukan papan nama.
function mosque(put, M, x, gy, z, s) {
    bx(put, M.panel, s * 2.2, s * 0.9, s * 1.8, x, gy + s * 0.45, z);
    const dm = new THREE.Mesh(new THREE.SphereGeometry(s * 0.68, 10, 6, 0,
        Math.PI * 2, 0, Math.PI / 2), M.deck);
    dm.position.set(x, gy + s * 0.9, z);
    dm.castShadow = false; dm.receiveShadow = false; put(dm);
    cyl(put, M.panel, s * 0.22, s * 0.26, s * 2.4, 6, x + s * 1.4, gy + s * 1.2, z);
    cone(put, M.deck, s * 0.32, s * 0.5, 6, x + s * 1.4, gy + s * 2.6, z);
}
// Kendaraan parkir. Angkot hijau ikut palet — ia ikon jalanan Bandung.
function parkedCar(put, M, x, gy, z, seed, k) {
    const body = pick(seed, k, [M.deck, M.metal, M.panel, M.leaf, M.genteng]);
    const van = rnd(seed, k + 1) < 0.34;
    const len = van ? 22 : 18;
    bx(put, body, len, 5, 8, x, gy + 3, z);
    bx(put, van ? body : M.lit, len * 0.48, 4, 7.4, x + 1, gy + 7.4, z);
    bx(put, M.asphalt, len * 0.94, 1.6, 8.6, x, gy + 1, z);
}
// Tiang lampu jalan (TANPA PointLight — jumlah light per stage harus tetap).
function streetLamp(put, M, x, gy, z, arm) {
    cyl(put, M.metal, 0.7, 1.0, 34, 6, x, gy + 17, z);
    bx(put, M.metal, 0.8, 0.8, 9, x, gy + 33, z + arm * 4.5);
    bx(put, M.lamp, 3.4, 1.0, 2.0, x, gy + 32.4, z + arm * 8.6);
}
// Tiang listrik + kawat memanjang. Kawatnya PERSIS selebar modul supaya modul
// tetangga bersambung, bukan tumpang tindih (bidang koplanar = z-fighting).
function powerLine(put, M, x, gy, z, L) {
    cyl(put, M.earth, 1.0, 1.4, 40, 6, x, gy + 20, z);
    bx(put, M.earth, 1.0, 1.0, 16, x, gy + 37, z);
    for (const dz of [-6, 6]) bx(put, M.metal, L, 0.5, 0.5, 0, gy + 37.6, z + dz);
}

// ===== BABAK KOTA — POOL NEAR ===========================================
// Baris depan Bandung: jalan layan, deret ruko/rumah/gudang, lampu jalan,
// kendaraan parkir. Gedung TERTINGGI ada di sini (aturan 3).
function cityNear(put, M, seed, L) {
    // Permukaan: jalan layan beraspal + trotoar + petak halaman.
    bx(put, M.asphalt, L, 1.2, 22, 0, -0.4, -100);
    bx(put, M.concrete, L, 1.8, 4, 0, 0.1, -87);
    bx(put, M.concrete, L, 1.8, 4, 0, 0.1, -113);
    bx(put, M.concrete, L, 1.0, 62, 0, -0.5, -146);
    bx(put, M.leaf, L, 1.0, 22, 0, -0.5, -188);

    // Empat lot di baris depan; tipe & tinggi dari hash indeks modul.
    const lots = 4, lw = L / lots;
    for (let k = 0; k < lots; k++) {
        const cx = -L / 2 + (k + 0.5) * lw;
        const t = ri(seed, k, 0, 4);
        if (t === 0) ruko(put, M, cx, 0, -128, lw - 6, 26, rr(seed, k + 9, 42, 58), seed, k);
        else if (t === 1) {
            house(put, M, cx - lw * 0.22, 0, -124, lw * 0.42, 20, 18, M.wallTan, M.genteng);
            house(put, M, cx + lw * 0.24, 0, -136, lw * 0.40, 18, 16, M.panel, M.genteng);
            bx(put, M.concrete, lw - 8, 6, 1.4, cx, 3, -114);          // pagar halaman
        } else if (t === 2) {
            block(put, M, cx, 0, -140, lw - 8, 30, rr(seed, k + 13, 58, 84), seed, k + 3);
        } else if (t === 3) {
            warehouse(put, M, cx, 0, -132, lw - 5, 30, rr(seed, k + 17, 24, 32));
        } else {
            marketShed(put, M, cx, 0, -134, lw - 8, 28, 24);
        }
    }
    // Baris kedua yang lebih dalam: siluet menengah pengisi celah antar lot.
    for (let k = 0; k < 2; k++)
        block(put, M, -L * 0.26 + k * L * 0.52, 0, -172 - rnd(seed, k + 21) * 8,
            34, 26, rr(seed, k + 25, 48, 76), seed, k + 7);

    // Perabot jalan.
    for (let k = 0; k < 2; k++) streetLamp(put, M, -L * 0.28 + k * L * 0.56, 0, -88, -1);
    for (let k = 0; k < 3; k++)
        parkedCar(put, M, -L * 0.34 + k * L * 0.34 + rr(seed, k + 29, -6, 6), 0, -96, seed, k + 31);
    tree(put, M, -L * 0.4, 0, -108, 26);
    tree(put, M, L * 0.36, 0, -110, 22);
    powerLine(put, M, L * 0.18, 0, -92, L);
    if (seed % 3 === 0) bx(put, M.deck, 16, 9, 8, -L * 0.12, 4.5, -92);   // halte
    if (seed % 4 === 1) {
        // Menara tandon air berdiri di CELAH antara dua blok baris kedua (x 0):
        // lot mereka mulai di |x| 19, jadi di sinilah satu-satunya tapak kosong.
        cyl(put, M.metal, 8, 8, 10, 8, 0, 46, -176);
        for (let k = 0; k < 4; k++)
            bx(put, M.metal, 1.2, 40, 1.2, (k < 2 ? -6 : 6), 20, -176 + (k % 2 ? -6 : 6));
    }

    // --- PITA DEPAN SISI KAMERA (aturan 4): deret toko satu lantai, membingkai
    //     tepi bawah layar. Sengaja BERCELAH supaya tidak jadi terowongan.
    bx(put, M.concrete, L, 1.4, 8, 0, -0.3, FG0 + 4);
    bx(put, M.asphalt, L, 1.0, 16, 0, -0.5, FG0 + 16);
    for (let k = 0; k < 3; k++) {
        if (rnd(seed, k + 41) < 0.28) continue;                            // celah
        const cx = -L / 2 + (k + 0.5) * (L / 3);
        house(put, M, cx, 0, FG0 + 34, L / 3 - 10, 22, rr(seed, k + 45, 18, 26),
            pick(seed, k + 49, [M.panel, M.wallTan, M.concrete]), M.genteng);
    }
    parkedCar(put, M, L * 0.2, 0, FG0 + 14, seed, 53);
    bush(put, M, -L * 0.34, 0, FG0 + 10, 5);
    bush(put, M, L * 0.4, 0, FG0 + 12, 4);
    // Halaman belakang deret toko: petak rumput + pagar + pohon, mengisi pita
    // sampai tepi bawah frame alih-alih berhenti tepat di belakang rumahnya.
    bx(put, M.leaf, L, 1.0, FG1 - FG0 - 44, 0, -0.5, (FG0 + 44 + FG1) / 2);
    bx(put, M.concrete, L, 5, 1.4, 0, 2.5, FG0 + 46);
    tree(put, M, -L * 0.22, 0, FG1 - 10, 22);
    tree(put, M, L * 0.26, 0, FG1 - 14, 18);
}

// ===== BABAK SAWAH — POOL NEAR ==========================================
// Persawahan khas Jawa Barat: petak berpematang, saluran irigasi, saung, kelapa,
// pisang, bambu, dan rumah kampung beratap genteng.
function riceNear(put, M, seed, L) {
    // Saluran irigasi menyusuri kaki jalan: tanggul tanah + air.
    bx(put, M.earth, L, 2.0, 10, 0, -0.6, BACK0 - 2);
    bx(put, M.water, L, 0.9, 6, 0, 0.3, BACK0 - 8);
    bx(put, M.earth, L, 2.0, 6, 0, -0.6, BACK0 - 14);

    // TIGA BARIS PETAK yang naik menjauh — inilah yang membuat sawah terbaca
    // bertingkat, bukan satu bidang hijau datar. Tiap petak: badan tanah,
    // permukaan (air ATAU padi muda) dan pematang pemisah.
    const rows = [
        { z: -118, d: 26, y: 0 },
        { z: -150, d: 28, y: 2.2 },
        { z: -182, d: 26, y: 4.4 },
    ];
    for (let r = 0; r < rows.length; r++) {
        const R = rows[r];
        bx(put, M.earth, L, 3.0 + R.y, R.d + 4, 0, (R.y - 1.5) / 2, R.z);
        const plots = 3, pw = L / plots;
        for (let k = 0; k < plots; k++) {
            const cx = -L / 2 + (k + 0.5) * pw;
            const wet = rnd(seed, r * 8 + k) < 0.45;
            bx(put, wet ? M.water : M.leaf, pw - 4, 1.0, R.d - 3, cx, R.y + 0.6, R.z);
            if (!wet) for (let s = 0; s < 3; s++)               // rumpun padi
                bx(put, M.leaf, pw - 8, 2.4, 2.0, cx, R.y + 1.8, R.z - R.d / 3 + s * (R.d / 3));
            bx(put, M.earth, 2.2, 1.6, R.d, cx + pw / 2 - 1, R.y + 0.9, R.z);   // pematang
        }
        bx(put, M.earth, L, 1.6, 2.4, 0, R.y + 0.9, R.z + R.d / 2);             // pematang melintang
    }
    bx(put, M.grass, L, 1.0, 14, 0, 5.3, -196);   // tepi rumput di puncak teras terakhir

    // Bangunan & pohon: jarang, terkelompok, jangan meratakan bidang sawah.
    if (seed % 2 === 0) {
        // Saung berpanggung di tengah petak — penanda paling khas sawah.
        for (const dx of [-5, 5]) for (const dz of [-5, 5])
            cyl(put, M.earth, 0.9, 0.9, 8, 5, -L * 0.18 + dx, 4, -134 + dz);
        bx(put, M.earth, 16, 1.6, 16, -L * 0.18, 8.8, -134);
        hipRoof(put, M.earth, 22, 22, 11, -L * 0.18, 10, -134);
    }
    if (seed % 3 === 1) {
        house(put, M, L * 0.3, 2.2, -156, 24, 20, 18, M.panel, M.genteng);
        house(put, M, L * 0.42, 2.2, -176, 18, 16, 15, M.wallTan, M.genteng);
        bx(put, M.earth, 30, 1.2, 12, L * 0.34, 2.6, -142);                     // pelataran
    }
    palm(put, M, -L * 0.42, 0, -104, 40);
    palm(put, M, -L * 0.36, 0, -110, 34);
    palm(put, M, L * 0.16, 0, -106, 37);
    banana(put, M, L * 0.44, 0, -112, 20);
    banana(put, M, -L * 0.06, 2.2, -164, 18);
    bamboo(put, M, L * 0.06, 4.4, -190, 30);
    bamboo(put, M, -L * 0.3, 4.4, -192, 26);
    tree(put, M, L * 0.38, 4.4, -188, 30);
    if (seed % 4 === 2) {
        cone(put, M.earth, 7, 12, 6, -L * 0.1, 6, -122);                        // tumpukan jerami
        cone(put, M.earth, 5, 9, 6, -L * 0.02, 4.5, -126);
    }
    if (seed % 5 === 3) bx(put, M.earth, L, 1.2, 8, 0, 1.2, -138);              // jalan setapak

    // --- PITA DEPAN SISI KAMERA: dua petak dangkal + pematang + kelapa.
    bx(put, M.earth, L, 2.4, 12, 0, -0.6, FG0 + 4);
    for (let k = 0; k < 2; k++) {
        const z = FG0 + 20 + k * 26;
        bx(put, M.earth, L, 2.4, 24, 0, -0.4, z);
        const wet = rnd(seed, k + 61) < 0.5;
        bx(put, wet ? M.water : M.leaf, L - 6, 1.0, 20, 0, 0.9, z);
        bx(put, M.earth, L, 1.4, 2.4, 0, 1.2, z + 12);
    }
    palm(put, M, -L * 0.3, 0, FG0 + 12, 34);
    banana(put, M, L * 0.28, 0, FG0 + 10, 18);
    // Petak ketiga + tanggul: sawah diteruskan sampai tepi bawah frame.
    bx(put, M.earth, L, 2.4, FG1 - FG0 - 46, 0, -0.4, (FG0 + 46 + FG1) / 2);
    bx(put, M.leaf, L - 6, 1.0, FG1 - FG0 - 54, 0, 0.9, (FG0 + 46 + FG1) / 2);
    bx(put, M.earth, L, 1.4, 2.4, 0, 1.2, FG1 - 4);
    palm(put, M, L * 0.06, 0, FG1 - 12, 30);
}

// ===== BABAK KOTA — POOL MID ============================================
// Panggung tengah: blok menengah rapat + pabrik/pergudangan, semuanya di sisi
// backdrop. Tingginya sengaja lebih rendah dari baris depan (aturan 3).
function cityMid(put, M, seed, L) {
    bx(put, M.concrete, L, 1.2, MID_Z0 - MID_Z1, 0, -0.9, (MID_Z0 + MID_Z1) / 2);
    bx(put, M.deck, L, 1.0, 14, 0, -0.3, MID_Z0 - 18);
    for (let k = 0; k < 3; k++) {
        const cx = -L / 2 + (k + 0.5) * (L / 3);
        block(put, M, cx, 0, MID_Z0 - 30 - rnd(seed, k) * 14, L / 3 - 12, 30,
            rr(seed, k + 5, 44, 72), seed, k);
    }
    for (let k = 0; k < 3; k++) {
        const cx = -L / 2 + (k + 0.7) * (L / 3);
        const h = rr(seed, k + 11, 34, 58);
        bx(put, pick(seed, k + 15, [M.panel, M.concrete, M.wallTan]),
            L / 3 - 16, h, 26, cx, h / 2, MID_Z0 - 84 - rnd(seed, k + 19) * 16);
        litBand(put, M, cx, h * 0.6, MID_Z0 - 71 - rnd(seed, k + 19) * 16, L / 4);
    }
    if (seed % 2 === 0) {
        // Pabrik: bangsal panjang beratap gergaji + dua cerobong.
        bx(put, M.deck, L * 0.6, 26, 34, -L * 0.1, 13, MID_Z1 + 44);
        for (let k = 0; k < 4; k++)
            bx(put, M.metal, L * 0.6, 4, 6, -L * 0.1, 27, MID_Z1 + 32 + k * 8);
        for (const dx of [-14, 12]) cyl(put, M.concrete, 3.5, 4.5, 54, 6, -L * 0.1 + dx, 27, MID_Z1 + 60);
    } else {
        marketShed(put, M, L * 0.12, 0, MID_Z1 + 46, L * 0.44, 34, 22);
    }
    for (let k = 0; k < 3; k++)
        tree(put, M, -L * 0.36 + k * L * 0.36, 0, MID_Z0 - 12, 24);
    bx(put, M.leaf, L, 1.0, 24, 0, -0.4, MID_Z1 + 12);
}

// ===== BABAK SAWAH — POOL MID ===========================================
// Terasering menanjak menjauh + kampung kecil + rumpun bambu: koridor Priangan.
function riceMid(put, M, seed, L) {
    bx(put, M.grass, L, 1.2, MID_Z0 - MID_Z1, 0, -0.9, (MID_Z0 + MID_Z1) / 2);
    // Empat undakan terasering; makin jauh makin tinggi dan makin sempit.
    for (let k = 0; k < 4; k++) {
        const y = 6 + k * 7, d = 34 - k * 4, z = MID_Z0 - 22 - k * 32;
        bx(put, M.earth, L, y + 4, d + 5, (rnd(seed, k) - 0.5) * 10, (y + 4) / 2 - 2, z);
        bx(put, M.leaf, L - 6, 1.6, d, (rnd(seed, k) - 0.5) * 10, y + 2.6, z);
        if (k % 2 === 0)
            bx(put, M.water, L - 20, 1.0, d * 0.5, (rnd(seed, k) - 0.5) * 10, y + 3.0, z);
    }
    for (let k = 0; k < 4; k++)
        tree(put, M, -L * 0.4 + k * L * 0.28 + rr(seed, k + 7, -8, 8), 8 + k * 3,
            MID_Z0 - 40 - rnd(seed, k + 11) * 70, rr(seed, k + 13, 26, 38));
    bamboo(put, M, -L * 0.22, 10, MID_Z0 - 52, 34);
    bamboo(put, M, L * 0.3, 17, MID_Z0 - 92, 30);
    if (seed % 2 === 0) {
        // Kampung kecil di punggungan: tiga rumah genteng + masjid.
        house(put, M, -L * 0.28, 20, MID_Z1 + 78, 24, 20, 17, M.panel, M.genteng);
        house(put, M, -L * 0.1, 20, MID_Z1 + 70, 20, 18, 15, M.wallTan, M.genteng);
        house(put, M, L * 0.06, 20, MID_Z1 + 82, 22, 18, 16, M.panel, M.genteng);
        mosque(put, M, L * 0.3, 20, MID_Z1 + 74, 13);
    } else {
        for (let k = 0; k < 3; k++)
            house(put, M, -L * 0.2 + k * L * 0.22, 20, MID_Z1 + 66 + (k % 2) * 12,
                20, 18, 15, k % 2 ? M.wallTan : M.panel, M.genteng);
    }
    // Bukit penutup di ujung pita: kaki pegunungan sebelum cakrawala.
    cone(put, M.leaf, 62, 54, 6, (rnd(seed, 23) - 0.5) * L * 0.5, 22, MID_Z1 + 22);
    cone(put, M.leaf, 44, 40, 6, (rnd(seed, 27) - 0.5) * L * 0.6, 16, MID_Z1 + 6);
}

// ===== POOL FAR — CAKRAWALA =============================================
function cityFar(put, M, seed, L) {
    bx(put, M.earthDark, L, 1.2, FAR_Z0 - FAR_END, 0, -1.2, (FAR_Z0 + FAR_END) / 2);
    for (let k = 0; k < 5; k++) {
        const h = rr(seed, k, 58, 150);
        const cx = -L / 2 + (k + 0.5) * (L / 5) + rr(seed, k + 5, -14, 14);
        const cz = FAR_Z0 - 26 - rnd(seed, k + 9) * 90;
        bx(put, pick(seed, k + 13, [M.concrete, M.panel, M.wallTan]), L / 6, h, 40, cx, h / 2, cz);
        if (rnd(seed, k + 17) > 0.45)
            bx(put, M.deck, L / 9, h * 0.18, 26, cx, h + h * 0.09, cz);
        else cyl(put, M.deck, 1.0, 1.0, h * 0.2, 4, cx, h + h * 0.1, cz);
        if (k % 2) litBand(put, M, cx, h * 0.7, cz + 20, L / 8);
    }
    for (let k = 0; k < 2; k++)
        bx(put, M.concrete, L / 3, rr(seed, k + 21, 30, 46), 34,
            -L * 0.24 + k * L * 0.48, rr(seed, k + 21, 30, 46) / 2, FAR_Z1 + 34);
    // Kaki cakrawala: blok rendah yang hanya terbaca ~20 unit sebelum terpotong
    // tepi atas layar, supaya tanah terjauh tidak jadi pelat kosong.
    for (let k = 0; k < 4; k++) {
        const h = rr(seed, k + 25, 26, 44);
        bx(put, M.concrete, L / 4 - 8, h, 40, -L * 0.36 + k * L * 0.24, h / 2,
            HAZE_Z - rnd(seed, k + 29) * 60);
    }
}
function riceFar(put, M, seed, L) {
    bx(put, M.earthDark, L, 1.2, FAR_Z0 - FAR_END, 0, -1.2, (FAR_Z0 + FAR_END) / 2);
    // Punggungan Priangan: kerucut besar yang puncaknya memang terpotong tepi
    // atas layar — potongan itulah yang mengisi frame (aturan 3).
    for (let k = 0; k < 3; k++) {
        const r = rr(seed, k, 78, 130), h = rr(seed, k + 5, 76, 132);
        cone(put, M.leaf, r, h, 7, -L * 0.34 + k * L * 0.34 + rr(seed, k + 9, -20, 20),
            h / 2 - 6, FAR_Z0 - 60 - rnd(seed, k + 13) * 80);
    }
    if (seed % 2 === 0) {                                     // puncak kembar
        cone(put, M.leaf, 96, 118, 7, L * 0.1, 53, FAR_Z1 + 46);
        cone(put, M.leaf, 70, 92, 7, L * 0.1 + 92, 40, FAR_Z1 + 58);
    }
    // Garis pohon kaki bukit supaya pertemuan gunung dan tanah tidak polos.
    for (let k = 0; k < 5; k++)
        cone(put, M.leaf, 16, 22, 6, -L / 2 + (k + 0.5) * (L / 5), 9, FAR_Z0 - 14);
    bx(put, M.earth, L, 3, 18, 0, 0.5, FAR_Z0 - 2);
    // Rimbun terjauh di balik punggungan: rendah, hanya untuk mengisi kaki
    // cakrawala (lihat catatan HAZE_Z).
    for (let k = 0; k < 5; k++)
        cone(put, M.leaf, 26 + rnd(seed, k + 33) * 14, 30, 6,
            -L * 0.4 + k * L * 0.2, 12, HAZE_Z - rnd(seed, k + 37) * 70);
}

// ===== PEMBANGUNAN POOL =================================================
function buildPool(parent, n, step, baseX, baseZ, z, cityFn, riceFn, M) {
    const arr = [];
    const left = baseX - SPAN * POOL_BIAS;
    for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        let cityG = new THREE.Group(), riceG = new THREE.Group();
        cityFn(o => cityG.add(o), M, i + 1, step);
        riceFn(o => riceG.add(o), M, i + 1, step);
        cityG = mergeObjectInPlace(cityG); riceG = mergeObjectInPlace(riceG);
        g.add(cityG); g.add(riceG);
        g.userData.cityG = cityG; g.userData.riceG = riceG; g.userData.act = 'city';
        g.position.set(left + i * step, 0, baseZ + z);
        parent.add(g); arr.push(g);
    }
    return arr;
}

// Pita netral babak pool near: tanah dasar, kerb, tiang, patok. Ia TIDAK PERNAH
// ikut berganti babak, jadi tidak mungkin ada lubang di tanah selama peralihan.
function buildNearBase(parent, baseX, baseZ, M) {
    const arr = [];
    const left = baseX - SPAN * POOL_BIAS, L = NEAR_STEP;
    for (let i = 0; i < NEAR_N; i++) {
        const g = new THREE.Group();
        let baseG = new THREE.Group();
        const put = o => baseG.add(o);
        // Slab dasar: lebarnya PERSIS L supaya modul tetangga bersambung, dan
        // tepi dalamnya MENYELINAP DI BAWAH bahu jalan (GROUND_IN < tepi bahu)
        // sehingga tidak pernah ada garis haze di antara aspal dan tanah.
        // Sisi kamera diteruskan sampai FG_END, jauh melewati tepi bawah frame.
        bx(put, M.earthDark, L, 3, BACK_NEAR_END * -1 - GROUND_IN, 0, -2.4,
            (-GROUND_IN + BACK_NEAR_END) / 2);
        bx(put, M.earthDark, L, 3, FG_END - GROUND_IN, 0, -2.4, (GROUND_IN + FG_END) / 2);
        for (const s of [-1, 1]) {
            bx(put, M.concrete, L, 2.2, 12, 0, -0.4, s * (VERGE + 6));    // bahu beton
            bx(put, M.earthDark, L, 1.2, 4, 0, -1.4, s * (VERGE + 14));   // parit
            bx(put, M.grass, L, 1.4, 6, 0, -0.8, s * (VERGE + 19));
        }
        // Patok delineator berirama: penjual kecepatan yang paling murah.
        for (let k = 0; k < 5; k++) for (const s of [-1, 1])
            bx(put, M.metal, 0.8, 5, 0.8, -L / 2 + (k + 0.5) * (L / 5), 2.5, s * (VERGE + 1.5));
        baseG = mergeObjectInPlace(baseG);
        g.add(baseG); g.userData.baseG = baseG;
        g.position.set(left + i * NEAR_STEP, 0, baseZ);
        parent.add(g); arr.push(g);
    }
    return arr;
}

export function buildStage8Scenery(parent, baseX, baseZ = 0) {
    const M = stage8SceneryMaterials();
    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    parent.add(group);
    const base = buildNearBase(group, baseX, baseZ, M);
    const near = buildPool(group, NEAR_N, NEAR_STEP, baseX, baseZ, 0, cityNear, riceNear, M);
    const mid = buildPool(group, MID_N, MID_STEP, baseX, baseZ, 0, cityMid, riceMid, M);
    const far = buildPool(group, FAR_N, FAR_STEP, baseX, baseZ, 0, cityFar, riceFar, M);
    const pool = {
        group, mats: M, base, near, mid, far, baseX, baseZ,
        act: 'city', target: 'city', blend: 0, wraps: 0, relayouts: 0,
    };
    setAllActs(pool, 'city');
    return pool;
}

// ===== BABAK ============================================================
function applyAct(g) {
    const city = g.userData.act === 'city';
    if (g.userData.cityG) g.userData.cityG.visible = city;
    if (g.userData.riceG) g.userData.riceG.visible = !city;
}
// Dipanggil TEPAT saat modul wrap: ia lahir kembali di ujung depan pool, jauh di
// luar layar, jadi babak barunya tidak pernah terlihat berganti.
function adoptAct(pool, g) { g.userData.act = pool.act; applyAct(g); }

function setAllActs(pool, act) {
    pool.act = act; pool.target = act; pool.blend = 0;
    for (const arr of [pool.near, pool.mid, pool.far])
        for (const g of arr) { g.userData.act = act; applyAct(g); }
}

// SATU KALI saat babak berganti: seluruh modul yang sedang MENUNGGU DI LUAR
// LAYAR DI DEPAN player ditata ulang — mengubahnya di sana tak terlihat sama
// sekali. Tanpa ini babak baru hanya masuk lewat wrap, dan satu putaran pool far
// makan ~54 detik. Modul yang sedang DI LAYAR atau sudah lewat tidak disentuh.
function relayoutAhead(pool) {
    const set = (g, act) => { g.userData.act = act; applyAct(g); };
    const old = otherAct(pool.act);
    pool.blend = 0; pool.relayouts++;
    for (const arr of [pool.near, pool.mid]) {
        const ahead = arr
            .filter(g => g.position.x - pool.baseX > S8_SCENERY_AHEAD)
            .sort((a, b) => a.position.x - b.position.x);
        for (let k = 0; k < ahead.length; k++) {
            // Modul terdekat memakai pola DITHER supaya perbatasannya terbaca
            // MENIPIS, bukan sebagai satu garis lurus tempat kota berhenti.
            const keepOld = k < BLEND_PATTERN.length && !BLEND_PATTERN[k];
            if (keepOld) pool.blend++;
            set(ahead[k], keepOld ? old : pool.act);
        }
    }
    // Cakrawala jauh TIDAK di-dither (aturan 2).
    for (const g of pool.far)
        if (g.position.x - pool.baseX > S8_SCENERY_AHEAD) set(g, pool.act);
}

// Stage hanya menetapkan BABAK TUJUAN; modul yang terlanjur berdiri di depan
// player tetap memakai babak lamanya sampai ia bergulir keluar.
export function setStage8SceneryAct(pool, act) {
    if (!pool || (act !== 'city' && act !== 'rice')) return false;
    pool.target = act;
    if (pool.act === act) return false;
    pool.act = act; relayoutAhead(pool); return true;
}

export function resetStage8Scenery(pool) {
    if (!pool) return;
    pool.wraps = 0; pool.relayouts = 0;
    const left = pool.baseX - SPAN * POOL_BIAS;
    const home = (arr, step) => arr.forEach((g, i) => { g.position.x = left + i * step; });
    home(pool.base, NEAR_STEP); home(pool.near, NEAR_STEP);
    home(pool.mid, MID_STEP); home(pool.far, FAR_STEP);
    // Perjalanan SELALU dibuka di kota (Cisumdawu berangkat dari pinggiran
    // Bandung); dither dimulai dari nol lagi supaya restart tidak mewarisi pita
    // peralihan run sebelumnya.
    setAllActs(pool, 'city');
}

function wrap(pool, items, step, dx, mul, onWrap) {
    const left = pool.baseX - SPAN * POOL_BIAS, right = left + SPAN;
    for (const g of items) {
        g.position.x -= dx * mul;
        let wrapped = false;
        while (g.position.x < left) { g.position.x += SPAN; pool.wraps++; wrapped = true; }
        while (g.position.x > right) g.position.x -= SPAN;
        if (wrapped && onWrap) onWrap(g);
    }
}

export function updateStage8Scenery(pool, dt, speed) {
    if (!pool || !(speed > 0) || !(dt > 0)) return;
    const dx = speed * dt;
    wrap(pool, pool.base, NEAR_STEP, dx, 1);
    wrap(pool, pool.near, NEAR_STEP, dx, 1, g => adoptAct(pool, g));
    wrap(pool, pool.mid, MID_STEP, dx, 0.62, g => adoptAct(pool, g));
    wrap(pool, pool.far, FAR_STEP, dx, 0.34, g => adoptAct(pool, g));
}

// ===== DEBUG / SMOKE ====================================================
// Potret RINGAN: hanya babak + posisi per modul, tanpa menyusuri ribuan mesh.
// Audit smoke memanggilnya SETIAP tick untuk membuktikan tak ada modul yang
// berganti lanskap selagi di layar — versi lengkapnya terlalu mahal untuk itu.
export function stage8SceneryActs(pool) {
    if (!pool) return null;
    const snap = arr => arr.map(g => ({ x: g.position.x, act: g.userData.act }));
    return {
        act: pool.act, target: pool.target, blend: pool.blend,
        wraps: pool.wraps, relayouts: pool.relayouts, baseX: pool.baseX,
        ahead: S8_SCENERY_AHEAD,
        near: snap(pool.near), mid: snap(pool.mid), far: snap(pool.far),
    };
}

export function stage8SceneryDebug(pool) {
    if (!pool) return null;
    const raw = g => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; };
    const keys = g => {
        const s = new Set();
        g.traverse(o => { if (o.isMesh && o.material) s.add(materialKey(o.material)); });
        return s.size;
    };
    // Tiap varian babak dilas TERPISAH, jadi biaya draw call satu modul =
    // jumlah material berbeda pada masing-masing varian + pita netralnya.
    const weld = g => [g.userData.baseG, g.userData.cityG, g.userData.riceG]
        .filter(Boolean).reduce((n, x) => n + keys(x), 0);
    // Yang benar-benar DIGAMBAR tiap frame: pita netral + SATU babak saja.
    const weldActive = g => [g.userData.baseG, g.userData.cityG, g.userData.riceG]
        .filter(x => x && x.visible !== false).reduce((n, x) => n + keys(x), 0);
    const sum = (arr, f) => arr.reduce((n, g) => n + f(g), 0);
    const all = [pool.base, pool.near, pool.mid, pool.far];
    return {
        act: pool.act, target: pool.target, blend: pool.blend,
        wraps: pool.wraps, relayouts: pool.relayouts,
        counts: { base: pool.base.length, near: pool.near.length,
            mid: pool.mid.length, far: pool.far.length },
        steps: { near: NEAR_STEP, mid: MID_STEP, far: FAR_STEP, span: SPAN },
        raw: all.reduce((n, arr) => n + sum(arr, raw), 0),
        welded: all.reduce((n, arr) => n + sum(arr, weld), 0),
        weldedActive: all.reduce((n, arr) => n + sum(arr, weldActive), 0),
        cityVisible: pool.near.filter(g => g.userData.cityG.visible).length,
        riceVisible: pool.near.filter(g => g.userData.riceG.visible).length,
        midCity: pool.mid.filter(g => g.userData.cityG.visible).length,
        farCity: pool.far.filter(g => g.userData.cityG.visible).length,
        positions: {
            near: pool.near.map(g => g.position.x),
            mid: pool.mid.map(g => g.position.x),
            far: pool.far.map(g => g.position.x),
        },
        // Babak PER MODUL: audit smoke memakainya untuk membuktikan tak ada satu
        // pun modul yang berganti kota<->sawah selagi berada di layar.
        acts: {
            near: pool.near.map(g => g.userData.act),
            mid: pool.mid.map(g => g.userData.act),
            far: pool.far.map(g => g.userData.act),
        },
    };
}
