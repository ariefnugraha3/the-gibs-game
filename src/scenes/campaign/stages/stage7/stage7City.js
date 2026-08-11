// ============================================================
// PUSAT KOTA BANDUNG — latar Stage 7 (flyover Pasupati), 2026-08-10.
// ============================================================
// Permintaan user: "sesuaikan semua backgroundnya, beri banyak bangunan seperti
// gedung, rumah, toko, sekolah, taman, dan lainnya. INI ADALAH KOTA BANDUNG,
// PUSAT KOTA BANDUNG". Sebelum ini yang ada di bawah dek cuma 48 balok beton
// polos berjendela satu strip — kota generik, bukan Bandung.
//
// TIGA ATURAN YANG MENENTUKAN SELURUH BENTUK MODUL INI:
//
// 1. INI PERMAINAN TOP-DOWN, JADI LATARNYA ADALAH TANAH — BUKAN LANGIT.
//    Kamera Stage 7 duduk di (+70,7 / +116 / +70,7) dan memandang ke barat-daya
//    dengan sudut ~51 derajat ke bawah. Tepi ATAS layar bukan cakrawala,
//    melainkan TANAH YANG PALING JAUH; apa pun yang menjulang tinggi justru
//    keluar dari frame. Diukur dari proyeksi kamera yang sama dengan
//    `stage7RobotInView`, anggaran tinggi di sisi -z kira-kira:
//        z -160 -> y +24 | z -250 -> y -12 | z -350 -> y -48 | z -450 -> y -78
//    (tanah kota ada di y -84). Artinya: baris depan boleh 4-5 lantai penuh,
//    baris kedua hanya terbaca 2 lantai, dan di luar |z| ~700 TIDAK PERNAH ada
//    satu piksel pun yang tampil — persis kesalahan "pool far dibangun di luar
//    jangkauan kamera" pada lanskap Stage 5. Maka: TIDAK ADA cakrawala jauh,
//    TIDAK ADA barisan pegunungan; yang dipadatkan adalah ATAP, halaman, gang,
//    dan lantai dasar — bagian yang benar-benar terlihat dari atas.
//
// 2. SISI +z ADALAH SISI KAMERA. Ruas mata->player selalu berada di z 0..+70
//    dan y 11..127, sehingga apa pun di |z| > deckHalf yang puncaknya TETAP DI
//    BAWAH permukaan dek (y <= NEAR_TOP_Y) mustahil menghalangi player. Jadi
//    sisi +z hanya boleh diisi bangunan rendah (<= 3 lantai) dan hanya sampai
//    z ~290, karena di luar itu ia berada di belakang kamera.
//
// 3. DIBANGUN SAAT LOADING BERSAMA SELURUH DUNIA CAMPAIGN. Karena itu penataan
//    memakai HASH DETERMINISTIK dari indeks distrik, TIDAK PERNAH Math.random()
//    (RNG global dipakai penempatan acak stage lain — aturan sama dengan pool
//    lanskap Stage 5), dan seluruh isinya DILAS per-potongan 125 m lewat
//    `addMergedStatic` sehingga ~2.400 mesh mentah hanya berharga belasan draw
//    call yang masih bisa di-frustum-cull.
//
// Kota ini MURNI DEKOR: tanpa blocker, tanpa sel nav, tanpa PointLight (jumlah
// light per stage harus tetap — lihat invarian "no mid-game shader recompiles").

import { CAMP_M } from '../../../../core/config.js';
import { PAL } from '../../../../world/palette.js';
import { addMergedStatic, materialKey } from '../../../../utils/meshBatch.js';

const m = v => v * CAMP_M;                 // meter -> unit dunia

// --- Tata letak (unit dunia, |z| dari sumbu flyover) ---
const CHUNK_METERS = 125;                  // satu grup las = satu kotak frustum
const DISTRICT_METERS = 70;                // panjang satu blok kota
const FEEDER_EDGE = m(6);                  // lebar jalur feeder di samping dek
const SERVICE_W = m(3);                    // jalan layan di bawah dek
const ROW1_D = m(20), ROW2_D = m(18), ROW3_D = m(25);
const STREET_W = m(8), ALLEY_W = m(6);
// Puncak bangunan sisi kamera tidak boleh menembus permukaan dek (y = 0).
const NEAR_TOP_Y = -m(1.2);
// Sisi kamera hanya terbaca sampai z ~215 (diukur dengan proyeksi kamera yang
// sama seperti `stage7RobotInView`, player berdiri di lajur terluar +z), jadi
// barisnya sengaja DANGKAL — meneruskannya sampai 20 m hanya membangun rumah
// yang tak pernah muncul satu piksel pun.
const NEAR_ROW_D = m(9);
// Baris ketiga hanya terlihat saat kamera menarik mundur di pylon meter 700
// (LANDMARK_CAM), jadi ia HANYA dibangun di sekitar meter itu — dan hanya
// selebar jangkauan blend kamera itu (110 m di `gameplayCameraOffset`).
const ROW3_HALF_METERS = 75;

export const S7_CITY_ROWS = Object.freeze({
    service: FEEDER_EDGE + SERVICE_W,
    row1: [FEEDER_EDGE + SERVICE_W, FEEDER_EDGE + SERVICE_W + ROW1_D],
    row2: [FEEDER_EDGE + SERVICE_W + ROW1_D + STREET_W,
        FEEDER_EDGE + SERVICE_W + ROW1_D + STREET_W + ROW2_D],
    row3: [FEEDER_EDGE + SERVICE_W + ROW1_D + STREET_W + ROW2_D + ALLEY_W,
        FEEDER_EDGE + SERVICE_W + ROW1_D + STREET_W + ROW2_D + ALLEY_W + ROW3_D],
    near: [FEEDER_EDGE + SERVICE_W, FEEDER_EDGE + SERVICE_W + NEAR_ROW_D],
    nearTopY: NEAR_TOP_Y,
});

// --- Hash deterministik (tanpa Math.random — lihat aturan 3) ---
function hash1(n) {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}
const rnd = (seed, k) => hash1(seed * 9176 + k * 271 + 17);
const rr = (seed, k, a, b) => a + (b - a) * rnd(seed, k);
const ri = (seed, k, a, b) => a + Math.floor(rnd(seed, k) * (b - a + 1));
const pick = (seed, k, arr) => arr[Math.min(arr.length - 1,
    Math.floor(rnd(seed, k) * arr.length))];

// --- Material: SEDIKIT dan DIPAKAI ULANG. Satu material = satu draw call per
//     potongan, jadi menambah warna baru harganya nyata. Semua token PAL. ---
export function bandungMaterials() {
    const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
    return {
        soil: lam(PAL.wood),
        asphalt: lam(PAL.rubber),
        kerb: lam(PAL.concrete),
        grass: lam(PAL.leaf),
        // Indeks 3 (putih) DIPAKAI EKSPLISIT gedung sipil/kolonial (sekolah,
        // masjid, Braga, Gedung Sate) — jangan diurut ulang. Dua entri paling
        // gelap ada supaya deret rumah tidak seluruhnya berdinding pucat:
        // albedo terang tetap terbaca "disorot" walau lampunya redup.
        wall: [lam(PAL.panel), lam(PAL.concrete), lam(PAL.steel),
            lam(PAL.white), lam(PAL.gunmetal), lam(PAL.ink)],
        trim: lam(PAL.ink),
        genteng: lam(PAL.hazard),                 // atap tanah liat khas Indonesia
        // Atap dak = ABU GELAP, bukan hitam: di kamera top-down ATAP-lah yang
        // paling banyak mengisi layar, dan PAL.rubber membuat separuh latar
        // jadi bidang hitam mati.
        deck: lam(PAL.gunmetal),
        glass: lam(PAL.screenBg),
        lit: lam(PAL.screenBg, { emissive: PAL.amber, emissiveIntensity: 0.45 }),
        civic: lam(PAL.screenBg, { emissive: PAL.tech, emissiveIntensity: 0.26 }),
        sign: lam(PAL.amber, { emissive: PAL.amber, emissiveIntensity: 0.55 }),
        lamp: lam(PAL.amber, { emissive: PAL.amber, emissiveIntensity: 0.8 }),
        metal: lam(PAL.steel),
        dark: lam(PAL.gunmetal),
        white: lam(PAL.white),
        red: lam(PAL.hazard),
        trunk: lam(PAL.wood),
        leaf: lam(PAL.leaf),
    };
}

// --- Primitif. Dekor kota TIDAK ikut shadow map: pada malam sedalam ini
//     bayangannya tak terbaca, sementara biayanya nyata di setiap frame. ---
function bx(put, mat, sx, sy, sz, x, y, z, yaw = 0) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    o.position.set(x, y, z); if (yaw) o.rotation.y = yaw;
    o.castShadow = false; o.receiveShadow = false;
    put(o); return o;
}

function cyl(put, mat, rt, rb, h, seg, x, y, z) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    o.position.set(x, y, z);
    o.castShadow = false; o.receiveShadow = false;
    put(o); return o;
}

// Atap limasan/perisai: kerucut 4 sisi yang SUDAH diputar di level geometry,
// supaya penskalaan (w,1,d) menghasilkan alas persegi panjang sejajar sumbu —
// kalau diputar di level objek, alasnya jadi belah ketupat.
function hipRoof(put, mat, w, d, h, x, yBase, z, yaw = 0) {
    const g = new THREE.ConeGeometry(0.70711, h, 4).rotateY(Math.PI / 4);
    const o = new THREE.Mesh(g, mat);
    o.scale.set(w, 1, d);
    o.position.set(x, yBase + h / 2, z); if (yaw) o.rotation.y = yaw;
    o.castShadow = false; o.receiveShadow = false;
    put(o); return o;
}

function dome(put, mat, r, x, yBase, z) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(
        r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    o.position.set(x, yBase, z);
    o.castShadow = false; o.receiveShadow = false;
    put(o); return o;
}

function tree(put, M, x, gy, z, scale) {
    cyl(put, M.trunk, m(0.16) * scale, m(0.22) * scale, m(2.2) * scale, 5,
        x, gy + m(1.1) * scale, z);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(
        m(1.5) * scale, m(2.6) * scale, 7), M.leaf);
    c1.position.set(x, gy + m(3.4) * scale, z);
    c1.castShadow = false; c1.receiveShadow = false; put(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(
        m(1.1) * scale, m(2) * scale, 7), M.leaf);
    c2.position.set(x, gy + m(4.7) * scale, z);
    c2.castShadow = false; c2.receiveShadow = false; put(c2);
}

// Kendaraan parkir: satu balok badan + kabin + bayangan roda. Angkot hijau
// (PAL.leaf) sengaja ikut dalam palet — ia ikon jalanan Bandung.
function parkedCar(put, M, x, gy, z, yaw, seed, k) {
    const body = pick(seed, k, [M.dark, M.metal, M.white, M.red, M.leaf]);
    const van = rnd(seed, k + 1) < 0.3;
    const len = van ? m(4.6) : m(4.1), wid = m(1.75);
    bx(put, body, len, m(0.95), wid, x, gy + m(0.6), z, yaw);
    bx(put, van ? body : M.glass, len * 0.5, m(0.75), wid * 0.92,
        x + Math.cos(yaw) * len * 0.05, gy + m(1.42), z - Math.sin(yaw) * len * 0.05, yaw);
    bx(put, M.trim, len * 0.92, m(0.3), wid * 1.02, x, gy + m(0.2), z, yaw);
}

// Tiang lampu jalan kota (TANPA PointLight — lihat catatan kepala berkas).
function streetLamp(put, M, x, gy, z, arm) {
    cyl(put, M.metal, m(0.11), m(0.16), m(7), 6, x, gy + m(3.5), z);
    bx(put, M.metal, m(0.12), m(0.12), m(1.6), x, gy + m(6.9), z + arm * m(0.8));
    bx(put, M.lamp, m(0.5), m(0.14), m(0.28), x, gy + m(6.78), z + arm * m(1.55));
}

// ============================================================
//  DISTRIK
// ============================================================
// Semua builder distrik menerima `d`:
//   put   fungsi penambah mesh ke potongan las
//   M     material
//   cx    pusat distrik pada sumbu x dunia
//   span  panjang distrik (unit dunia, searah x)
//   side  -1 = sisi latar (jauh dari kamera), +1 = sisi kamera
//   near  |z| tepi depan baris
//   depth kedalaman baris
//   gy    permukaan tanah kota
//   seed  benih hash
//   maxTop  batas puncak (y dunia) — dipakai baris sisi kamera

// Bagi bentang distrik jadi kavling selebar minW..maxW meter.
function lots(d, minW, maxW) {
    const out = [];
    let x = d.cx + d.span / 2, i = 0;
    while (x > d.cx - d.span / 2 + m(2) && i < 12) {
        const w = m(rr(d.seed, 40 + i, minW, maxW));
        out.push({ x: x - w / 2, w, i });
        x -= w + m(0.6); i++;
    }
    return out;
}

const zAt = (d, off) => d.side * (d.near + off);
// `reserve` = tinggi perabot yang masih akan DITUMPUK di atas badan (atap,
// parapet, tandon, antena). Tanpa itu batas sisi kamera bocor: badan dipotong
// tepat di batas lalu atapnya menembus permukaan dek.
const capH = (d, base, h, reserve = 0) => d.maxTop != null
    ? Math.min(h, Math.max(m(2.5), d.maxTop - base - reserve)) : h;

// --- RUKO: rumah-toko 2-3 lantai. Bentuk paling khas jalan protokol Bandung:
//     etalase kaca, kanopi bergaris, fasad bersih, dan tandon air di dak. ---
function districtRuko(put, M, d) {
    const toward = -d.side;
    let buildings = 0, top = d.gy;
    for (const lot of lots(d, 6, 8.5)) {
        const floors = ri(d.seed, lot.i * 7, 2, 3);
        const h = capH(d, d.gy, m(3.5) * floors, m(1.7));
        const dep = Math.min(d.depth - m(0.8), m(rr(d.seed, lot.i * 7 + 1, 11, 15)));
        const zc = zAt(d, dep / 2);
        const wall = pick(d.seed, lot.i * 7 + 2, M.wall);
        bx(put, wall, lot.w, h, dep, lot.x, d.gy + h / 2, zc);
        const zFront = zAt(d, 0);
        // Etalase + rolling door bergantian (sebagian toko tutup)
        const shut = rnd(d.seed, lot.i * 7 + 3) < 0.4;
        bx(put, shut ? M.metal : M.lit, lot.w * 0.82, m(2.5), m(0.3),
            lot.x, d.gy + m(1.5), zFront + toward * m(0.16));
        bx(put, M.trim, lot.w, m(0.35), m(0.35),
            lot.x, d.gy + m(2.95), zFront + toward * m(0.16));
        // Kanopi miring; fasad sengaja tanpa papan nama.
        const awn = bx(put, rnd(d.seed, lot.i * 7 + 4) < 0.5 ? M.red : M.white,
            lot.w * 0.94, m(0.16), m(1.5), lot.x, d.gy + m(3.35),
            zFront + toward * m(0.75));
        awn.rotation.x = toward * 0.28;
        // Jendela lantai atas
        for (let f = 1; f < floors; f++)
            bx(put, rnd(d.seed, lot.i * 7 + 5 + f) < 0.55 ? M.lit : M.glass,
                lot.w * 0.66, m(1.4), m(0.22),
                lot.x, d.gy + m(3.5) * f + m(1.9), zFront + toward * m(0.14));
        // DAK + parapet + tandon air. Dak-nya wajib material sendiri: dari
        // kamera oblique atap ruko adalah bidang paling luas yang terlihat,
        // dan tanpa ini ia hanya jadi permukaan atas balok dinding.
        bx(put, M.deck, lot.w * 0.98, m(0.3), dep * 0.98,
            lot.x, d.gy + h + m(0.15), zc);
        bx(put, M.trim, lot.w, m(0.5), dep, lot.x, d.gy + h + m(0.25), zc);
        if (rnd(d.seed, lot.i * 7 + 6) < 0.62)
            bx(put, M.metal, m(1.1), m(1.2), m(1.1),
                lot.x + lot.w * 0.24, d.gy + h + m(1.1), zAt(d, dep * 0.7));
        if (rnd(d.seed, lot.i * 7 + 7) < 0.5)          // rumah tangga/bordes
            bx(put, pick(d.seed, lot.i * 7 + 8, M.wall), lot.w * 0.34, m(1),
                m(1.6), lot.x - lot.w * 0.26, d.gy + h + m(0.65),
                zAt(d, dep * 0.55));
        buildings++; top = Math.max(top, d.gy + h + m(1.7));
    }
    return { buildings, top };
}

// --- KAMPUNG KOTA: deret rumah beratap genteng rapat + gang sempit. ---
function districtKampung(put, M, d) {
    const toward = -d.side;
    let buildings = 0, top = d.gy;
    const rows = d.depth > m(16) ? 2 : 1;
    for (let r = 0; r < rows; r++) {
        const dep = m(6.5);
        const off = r * (dep + m(3.2)) + m(1.5);
        if (off + dep > d.depth) break;
        for (const lot of lots(d, 5, 7)) {
            const h = capH(d, d.gy, m(rr(d.seed, lot.i * 11 + r, 3, 4.2)), m(1.5));
            const zc = zAt(d, off + dep / 2);
            bx(put, pick(d.seed, lot.i * 11 + r + 1, M.wall),
                lot.w * 0.9, h, dep, lot.x, d.gy + h / 2, zc);
            hipRoof(put, M.genteng, lot.w * 1.02, dep * 1.14,
                Math.min(m(1.5), Math.max(m(0.6), (d.maxTop != null
                    ? d.maxTop - (d.gy + h) : m(1.5)))),
                lot.x, d.gy + h, zc);
            if (rnd(d.seed, lot.i * 11 + r + 2) < 0.5)
                bx(put, M.lit, lot.w * 0.3, m(0.9), m(0.2), lot.x,
                    d.gy + m(1.7), zAt(d, off) + toward * m(0.12));
            buildings++; top = Math.max(top, d.gy + h + m(1.5));
        }
        // Gang: jalur beton sempit di depan deret
        bx(put, M.kerb, d.span, m(0.2), m(2.4), d.cx, d.gy + m(0.14),
            zAt(d, off - m(1.4)));
    }
    // Pohon & motor parkir di ujung gang
    for (let i = 0; i < 3; i++)
        tree(put, M, d.cx - d.span / 2 + d.span * (i + 0.5) / 3, d.gy,
            zAt(d, m(0.9)), rr(d.seed, 60 + i, 0.7, 1));
    return { buildings, top };
}

// --- PASAR: deretan kanopi terpal merah-putih + los + tumpukan peti. ---
function districtPasar(put, M, d) {
    let buildings = 0;
    const dep = Math.min(d.depth - m(2), m(15));
    const zc = zAt(d, m(2) + dep / 2);
    const h = capH(d, d.gy, m(5.5), m(1.4));
    bx(put, M.wall[1], d.span * 0.9, h, dep, d.cx, d.gy + h / 2, zc);
    bx(put, M.deck, d.span * 0.94, m(0.5), dep * 1.05, d.cx, d.gy + h + m(0.25), zc);
    buildings++;
    // Kanopi los di halaman depan
    for (let i = 0; i < 6; i++) {
        const x = d.cx - d.span / 2 + d.span * (i + 0.5) / 6;
        const canopy = bx(put, i % 2 ? M.red : M.white, d.span / 7, m(0.14), m(3.4),
            x, d.gy + m(2.5), zAt(d, m(1.6)));
        canopy.rotation.x = -d.side * 0.1;
        for (const s of [-1, 1])
            cyl(put, M.metal, m(0.08), m(0.08), m(2.4), 5,
                x + s * d.span / 16, d.gy + m(1.2), zAt(d, m(1.6)));
        bx(put, M.trunk, d.span / 9, m(0.8), m(1.2), x, d.gy + m(0.4),
            zAt(d, m(1.6)));
    }
    return { buildings, top: d.gy + h + m(1.4) };
}

// --- SEKOLAH: blok kelas dua lantai berbaris jendela, selasar, lapangan,
//     tiang bendera merah-putih. ---
function districtSekolah(put, M, d) {
    const toward = -d.side;
    const h = capH(d, d.gy, m(7.6), m(2));
    const dep = m(9);
    const zBack = zAt(d, d.depth - dep / 2 - m(1));
    bx(put, M.wall[3], d.span * 0.86, h, dep, d.cx, d.gy + h / 2, zBack);
    hipRoof(put, M.genteng, d.span * 0.9, dep * 1.2,
        Math.min(m(2), Math.max(m(0.7), d.maxTop != null
            ? d.maxTop - (d.gy + h) : m(2))), d.cx, d.gy + h, zBack);
    // Baris jendela kelas dua lantai
    for (let f = 0; f < 2; f++)
        for (let i = 0; i < 6; i++)
            bx(put, rnd(d.seed, i * 3 + f) < 0.4 ? M.lit : M.glass,
                d.span * 0.1, m(1.3), m(0.22),
                d.cx - d.span * 0.36 + d.span * 0.144 * i,
                d.gy + m(1.9) + f * m(3.6),
                zBack + toward * (dep / 2 + m(0.12)));
    // Selasar beratap di depan kelas
    bx(put, M.deck, d.span * 0.86, m(0.22), m(2.6), d.cx, d.gy + m(3.3),
        zBack + toward * (dep / 2 + m(1.3)));
    for (let i = 0; i < 5; i++)
        cyl(put, M.kerb, m(0.14), m(0.14), m(3.2), 6,
            d.cx - d.span * 0.34 + d.span * 0.17 * i, d.gy + m(1.6),
            zBack + toward * (dep / 2 + m(2.3)));
    // Lapangan upacara + tiang bendera
    bx(put, M.kerb, d.span * 0.8, m(0.2), d.depth - dep - m(3), d.cx,
        d.gy + m(0.12), zAt(d, (d.depth - dep - m(3)) / 2 + m(0.5)));
    cyl(put, M.white, m(0.09), m(0.09), m(8), 6, d.cx, d.gy + m(4),
        zAt(d, m(3)));
    bx(put, M.red, m(1.4), m(0.5), m(0.06), d.cx + m(0.75), d.gy + m(7.6),
        zAt(d, m(3)));
    bx(put, M.white, m(1.4), m(0.5), m(0.06), d.cx + m(0.75), d.gy + m(7.1),
        zAt(d, m(3)));
    // Pagar sekolah tanpa papan nama.
    bx(put, M.metal, d.span * 0.9, m(0.14), m(0.14), d.cx, d.gy + m(1.6),
        zAt(d, m(0.4)));
    return { buildings: 1, top: d.gy + h + m(2) };
}

// --- TAMAN KOTA: rumput, jalur setapak, pohon, bangku, gazebo. Bandung kota
//     taman; blok hijau ini yang memecah deret beton. ---
function districtTaman(put, M, d) {
    const zc = zAt(d, d.depth / 2);
    bx(put, M.grass, d.span * 0.96, m(0.3), d.depth - m(1.5), d.cx,
        d.gy + m(0.16), zc);
    // Dua jalur menyilang
    bx(put, M.kerb, d.span * 0.96, m(0.2), m(2), d.cx, d.gy + m(0.34), zc);
    bx(put, M.kerb, m(2), m(0.2), d.depth - m(1.5), d.cx + d.span * 0.16,
        d.gy + m(0.34), zc);
    for (let i = 0; i < 7; i++) {
        const x = d.cx - d.span * 0.42 + d.span * 0.84 * (i / 6);
        tree(put, M, x, d.gy + m(0.3), zAt(d, m(3.5) + (i % 3) * m(4)),
            rr(d.seed, 70 + i, 0.85, 1.35));
    }
    for (let i = 0; i < 4; i++)
        bx(put, M.trunk, m(1.8), m(0.25), m(0.6),
            d.cx - d.span * 0.3 + d.span * 0.2 * i, d.gy + m(0.7),
            zAt(d, m(2.2)));
    for (let i = 0; i < 3; i++)
        streetLamp(put, M, d.cx - d.span * 0.3 + d.span * 0.3 * i, d.gy,
            zAt(d, m(2.2)), -d.side);
    // Gazebo/pendopo kecil
    const gz = zAt(d, d.depth - m(5));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        cyl(put, M.trunk, m(0.14), m(0.14), m(2.6), 5,
            d.cx + sx * m(1.7), d.gy + m(1.3), gz + sz * m(1.7));
    hipRoof(put, M.genteng, m(4.6), m(4.6), m(1.6), d.cx, d.gy + m(2.6), gz);
    return { buildings: 0, top: d.gy + m(6) };
}

// --- GEDUNG: menara kantor/apartemen. Sengaja jarang dan hanya di baris
//     yang dekat, karena di kamera ini menara jauh langsung keluar frame. ---
function districtGedung(put, M, d) {
    let top = d.gy, buildings = 0;
    const wide = rnd(d.seed, 1) < 0.45;
    const bw = d.span * (wide ? 0.62 : 0.44);
    const dep = Math.min(d.depth - m(3), m(rr(d.seed, 2, 14, 20)));
    // Jumlah lantai datang dari RENCANA BARIS, bukan angka bebas: di baris
    // depan menara >6 lantai memenuhi layar (tepi atas layar = tanah terjauh),
    // sedangkan di baris kedua apa pun di atas ~5 m memang sudah terpotong.
    const floors = ri(d.seed, 3, d.floors[0], d.floors[1]);
    const h = capH(d, d.gy, m(3.6) * floors, m(5.6));
    const zc = zAt(d, m(2) + dep / 2);
    const wall = pick(d.seed, 4, M.wall);
    bx(put, wall, bw, h, dep, d.cx, d.gy + h / 2, zc);
    // Pita jendela per lantai (satu balok per lantai, bukan per jendela)
    const toward = -d.side;
    for (let f = 0; f < floors; f++) {
        const y = d.gy + m(1.6) + f * m(3.6);
        if (y > d.gy + h - m(1)) break;
        bx(put, rnd(d.seed, 20 + f) < 0.45 ? M.lit : M.glass,
            bw * 0.86, m(1.7), m(0.25), d.cx, y, zc + toward * (dep / 2 + m(0.14)));
        bx(put, rnd(d.seed, 40 + f) < 0.3 ? M.lit : M.glass,
            m(0.25), m(1.7), dep * 0.8, d.cx + bw / 2, y, zc);
    }
    // Lobi lantai dasar: layar sipil teal — SATU-SATUNYA aksen non-amber kota,
    // jadi sengaja sempit; sebidang teal selebar gedung langsung mendominasi
    // frame di malam segelap ini.
    bx(put, M.civic, bw * 0.3, m(1.6), m(0.28), d.cx, d.gy + m(1.2),
        zc + toward * (dep / 2 + m(0.16)));
    // Mahkota: dak, ruang mesin, antena
    bx(put, M.trim, bw * 1.04, m(0.6), dep * 1.04, d.cx, d.gy + h + m(0.3), zc);
    bx(put, M.dark, bw * 0.34, m(2.2), dep * 0.34, d.cx - bw * 0.18,
        d.gy + h + m(1.7), zc);
    cyl(put, M.metal, m(0.08), m(0.12), m(5), 5, d.cx + bw * 0.26,
        d.gy + h + m(3.1), zc);
    buildings++; top = d.gy + h + m(5.6);
    // Blok pendamping rendah + parkir
    const sw = d.span * 0.24;
    const sh = capH(d, d.gy, m(rr(d.seed, 5, 5, 9)), m(0.6));
    bx(put, pick(d.seed, 6, M.wall), sw, sh, dep * 0.7,
        d.cx + (wide ? -1 : 1) * (bw / 2 + sw / 2 + m(1.5)), d.gy + sh / 2, zc);
    bx(put, M.asphalt, d.span * 0.9, m(0.2), m(6), d.cx, d.gy + m(0.12),
        zAt(d, m(3)));
    for (let i = 0; i < 4; i++)
        parkedCar(put, M, d.cx - d.span * 0.3 + d.span * 0.2 * i, d.gy,
            zAt(d, m(3)), Math.PI / 2, d.seed, 80 + i);
    buildings++;
    return { buildings, top };
}

// --- MASJID + ALUN-ALUN: kubah, dua menara, halaman rumput. Pusat kota
//     Bandung memang alun-alun + Masjid Raya. ---
function districtAlunAlun(put, M, d) {
    const hallW = d.span * 0.42, hallD = Math.min(d.depth * 0.55, m(11));
    const zc = zAt(d, d.depth - hallD / 2 - m(1));
    const h = capH(d, d.gy, m(9), m(6));
    bx(put, M.wall[3], hallW, h, hallD, d.cx, d.gy + h / 2, zc);
    bx(put, M.trim, hallW * 1.06, m(0.7), hallD * 1.06, d.cx,
        d.gy + h + m(0.35), zc);
    dome(put, M.metal, hallW * 0.3, d.cx, d.gy + h + m(0.7), zc);
    cyl(put, M.sign, m(0.1), m(0.1), m(2.2), 5, d.cx,
        d.gy + h + hallW * 0.3 + m(1.1), zc);
    // Serambi berarkade
    const toward = -d.side;
    for (let i = 0; i < 6; i++)
        cyl(put, M.white, m(0.3), m(0.34), m(4.4), 8,
            d.cx - hallW * 0.4 + hallW * 0.16 * i, d.gy + m(2.2),
            zc + toward * (hallD / 2 + m(1.6)));
    bx(put, M.deck, hallW * 0.96, m(0.4), m(3.6), d.cx, d.gy + m(4.6),
        zc + toward * (hallD / 2 + m(1.6)));
    // Dua menara
    for (const s of [-1, 1]) {
        const mx = d.cx + s * (hallW / 2 + m(4));
        // 14 m, bukan 20: anggaran tinggi di baris depan hanya ~15 m sebelum
        // puncaknya keluar dari tepi atas layar.
        const mh = capH(d, d.gy, m(14), m(1.2));
        cyl(put, M.white, m(0.9), m(1.1), mh, 8, mx, d.gy + mh / 2, zc);
        // Balkon azan + tiga cincin: tanpa ini menaranya cuma pipa abu-abu
        // polos — bentuk yang paling sering muncul persis di depan kamera.
        for (let i = 1; i <= 3; i++)
            cyl(put, M.trim, m(1.25), m(1.25), m(0.22), 8, mx,
                d.gy + mh * i / 4.2, zc);
        cyl(put, M.white, m(1.55), m(1.4), m(0.5), 8, mx, d.gy + mh - m(2.6), zc);
        bx(put, M.lit, m(2.1), m(0.7), m(2.1), mx, d.gy + mh - m(2), zc);
        cyl(put, M.trim, m(1.2), m(1.2), m(0.3), 8, mx, d.gy + mh - m(0.9), zc);
        dome(put, M.metal, m(1.1), mx, d.gy + mh, zc);
    }
    // Alun-alun: rumput + jalur + pohon
    const sqD = d.depth - hallD - m(3);
    bx(put, M.grass, d.span * 0.94, m(0.3), sqD, d.cx, d.gy + m(0.16),
        zAt(d, sqD / 2 + m(0.5)));
    bx(put, M.kerb, d.span * 0.94, m(0.2), m(2.4), d.cx, d.gy + m(0.34),
        zAt(d, sqD / 2 + m(0.5)));
    for (let i = 0; i < 5; i++)
        tree(put, M, d.cx - d.span * 0.38 + d.span * 0.19 * i, d.gy + m(0.3),
            zAt(d, m(2.4)), 1.1);
    return { buildings: 3, top: d.gy + m(22) };
}

// --- BRAGA: deret pertokoan art-deco kolonial — fasad krem, pilaster
//     vertikal, parapet bertingkat, arkade lantai dasar. ---
function districtBraga(put, M, d) {
    const toward = -d.side;
    const dep = Math.min(d.depth - m(4), m(14));
    const zc = zAt(d, m(2) + dep / 2), zFront = zAt(d, m(2));
    let buildings = 0, top = d.gy;
    for (const lot of lots(d, 8, 11)) {
        const h = capH(d, d.gy, m(rr(d.seed, lot.i * 5, 9, 12)), m(1.5));
        bx(put, M.wall[3], lot.w, h, dep, lot.x, d.gy + h / 2, zc);
        // Pilaster
        for (let i = 0; i < 4; i++)
            bx(put, M.white, m(0.5), h * 0.82, m(0.3),
                lot.x - lot.w * 0.36 + lot.w * 0.24 * i, d.gy + h * 0.41 + m(1),
                zFront + toward * m(0.16));
        // Arkade lantai dasar + etalase menyala
        bx(put, M.lit, lot.w * 0.8, m(2.6), m(0.24), lot.x, d.gy + m(1.6),
            zFront + toward * m(0.1));
        bx(put, M.white, lot.w, m(0.4), m(1.1), lot.x, d.gy + m(3.2),
            zFront + toward * m(0.55));
        // Parapet bertingkat khas art-deco
        bx(put, M.white, lot.w, m(0.6), dep * 1.02, lot.x, d.gy + h + m(0.3), zc);
        bx(put, M.white, lot.w * 0.4, m(0.9), m(0.9), lot.x, d.gy + h + m(1),
            zFront + toward * m(0.2));
        buildings++; top = Math.max(top, d.gy + h + m(1.5));
    }
    for (let i = 0; i < 4; i++)
        streetLamp(put, M, d.cx - d.span * 0.36 + d.span * 0.24 * i, d.gy,
            zAt(d, m(0.9)), -d.side);
    return { buildings, top };
}

// --- GEDUNG SATE: ikon Bandung. Fasad putih simetris, arkade lengkung,
//     menara bertingkat, dan tusuk sate berisi enam ornamen di puncaknya. ---
function landmarkGedungSate(put, M, d) {
    const dep = Math.min(d.depth - m(3), m(18));
    const zc = zAt(d, m(2.5) + dep / 2);
    // Tinggi total DIBATASI ~25 m: pada kamera tarik-mundur pylon (LANDMARK_CAM)
    // anggaran tinggi di baris depan berhenti sekitar y +100, jadi menara yang
    // lebih jangkung ujungnya justru terpotong tepi atas layar.
    const bodyH = capH(d, d.gy, m(9), m(16));
    const bodyW = d.span * 0.66;
    bx(put, M.wall[3], bodyW, bodyH, dep, d.cx, d.gy + bodyH / 2, zc);
    // Dua sayap lebih rendah
    for (const s of [-1, 1]) {
        const wh = capH(d, d.gy, m(8), m(1.6));
        bx(put, M.wall[3], d.span * 0.16, wh, dep * 0.8,
            d.cx + s * (bodyW / 2 + d.span * 0.08), d.gy + wh / 2, zc);
        hipRoof(put, M.genteng, d.span * 0.18, dep * 0.86, m(1.6),
            d.cx + s * (bodyW / 2 + d.span * 0.08), d.gy + wh, zc);
    }
    const toward = -d.side;
    // Arkade lengkung lantai dasar (kolom + balok)
    for (let i = 0; i < 9; i++)
        cyl(put, M.white, m(0.32), m(0.36), m(4.2), 8,
            d.cx - bodyW * 0.44 + bodyW * 0.11 * i, d.gy + m(2.1),
            zc + toward * (dep / 2 + m(1.4)));
    bx(put, M.white, bodyW * 0.96, m(0.6), m(3), d.cx, d.gy + m(4.5),
        zc + toward * (dep / 2 + m(1.4)));
    // Pita jendela dua lantai
    for (let f = 0; f < 2; f++)
        bx(put, f ? M.glass : M.lit, bodyW * 0.9, m(1.6), m(0.26), d.cx,
            d.gy + m(5.9) + f * m(3.4), zc + toward * (dep / 2 + m(0.14)));
    hipRoof(put, M.genteng, bodyW * 1.04, dep * 1.1, m(2), d.cx,
        d.gy + bodyH, zc);
    // Menara bertingkat
    let y = d.gy + bodyH + m(2), w = d.span * 0.2;
    for (let t = 0; t < 3; t++) {
        const th = capH(d, y, m(2.8 - t * 0.5), m(1.1));
        bx(put, M.wall[3], w, th, w, d.cx, y + th / 2, zc);
        bx(put, M.lit, w * 0.55, m(1), m(0.2), d.cx, y + th * 0.55,
            zc + toward * (w / 2 + m(0.12)));
        hipRoof(put, M.genteng, w * 1.16, w * 1.16, m(1.1), d.cx, y + th, zc);
        y += th + m(1.1); w *= 0.72;
    }
    // TUSUK SATE: enam ornamen bertumpuk pada satu tiang
    cyl(put, M.metal, m(0.16), m(0.16), m(3.8), 6, d.cx, y + m(1.9), zc);
    for (let i = 0; i < 6; i++)
        cyl(put, M.sign, m(0.52 - i * 0.05), m(0.52 - i * 0.05), m(0.3), 8,
            d.cx, y + m(0.5) + i * m(0.55), zc);
    // Halaman depan + pagar
    bx(put, M.grass, d.span * 0.92, m(0.3), m(2.4),
        d.cx, d.gy + m(0.16), zAt(d, m(1.2)));
    bx(put, M.metal, d.span * 0.92, m(0.14), m(0.14), d.cx, d.gy + m(1.5),
        zAt(d, m(0.2)));
    return { buildings: 3, top: y + m(3.8) };
}

const DISTRICTS = {
    ruko: districtRuko, kampung: districtKampung, pasar: districtPasar,
    sekolah: districtSekolah, taman: districtTaman, gedung: districtGedung,
    alunAlun: districtAlunAlun, braga: districtBraga,
    gedungSate: landmarkGedungSate,
};

// Distrik ikonik pada meter tertentu (sisi latar, baris depan). Gedung Sate
// duduk di meter 700 — persis tempat kamera menarik mundur untuk pylon, jadi
// ia benar-benar terlihat.
const LANDMARK_AT = [
    { meter: 150, type: 'pasar' },
    { meter: 290, type: 'sekolah' },
    { meter: 430, type: 'alunAlun' },
    { meter: 570, type: 'braga' },
    { meter: 700, type: 'gedungSate' },
    { meter: 840, type: 'taman' },
    { meter: 980, type: 'sekolah' },
    { meter: 1120, type: 'braga' },
    { meter: 1260, type: 'taman' },
];
// Braga = satu ruas jalan nyata, bukan tipe blok yang boleh berulang di mana
// saja; ia hanya muncul lewat LANDMARK_AT.
const ROW1_MIX = ['ruko', 'ruko', 'ruko', 'kampung', 'gedung', 'gedung',
    'taman', 'pasar'];
const ROW2_MIX = ['kampung', 'kampung', 'ruko', 'gedung', 'gedung', 'taman',
    'pasar', 'sekolah'];
const ROW3_MIX = ['kampung', 'kampung', 'ruko', 'taman'];
const NEAR_MIX = ['kampung', 'ruko', 'kampung', 'taman', 'pasar'];

// ============================================================
//  PEMBANGUN UTAMA
// ============================================================
export function buildBandungCity(ctx) {
    const { L, parent, record } = ctx;
    const M = bandungMaterials();
    const gy = L.lowerY;
    const R = S7_CITY_ROWS;
    // Kota ikut diteruskan `L.beyondMeters` di balik gerbang tol (2026-08-10):
    // tanah + jalan sampai ujung penuh supaya tak ada tepi dunia, sedangkan
    // DISTRIK berhenti di `districtEndMeter` — sedikit di luar jangkauan
    // pandang terjauh, karena blok yang tak pernah masuk frame tetap tak boleh
    // dibangun (aturan 1 di kepala berkas).
    const beyond = Math.max(0, L.beyondMeters || 0);
    const endMeter = L.lengthMeters + beyond;
    const districtEndMeter = L.lengthMeters + Math.min(beyond, 60);
    const chunkCount = Math.ceil(endMeter / CHUNK_METERS) + 1;
    const chunks = [];
    for (let i = 0; i < chunkCount; i++) chunks.push([]);
    const at = meter => chunks[Math.max(0, Math.min(chunkCount - 1,
        Math.floor(meter / CHUNK_METERS)))];
    const cityRoot = new THREE.Group();
    cityRoot.name = 'Stage7BandungCity';
    parent.add(cityRoot);
    const districts = [];

    // --- TANAH + JALAN, dibangun per potongan supaya tiap potongan punya
    //     bounding sphere sendiri (kalau satu slab 1,5 km, tak ada yang bisa
    //     di-cull dan potongan itu selalu tergambar). ---
    for (let c = 0; c < chunkCount; c++) {
        const m0 = c * CHUNK_METERS;
        const m1 = Math.min(endMeter, m0 + CHUNK_METERS);
        if (m1 <= m0) continue;
        const put = o => chunks[c].push(o);
        const spanX = (m1 - m0) * CAMP_M;
        const cx = L.xAtMeter((m0 + m1) / 2);
        const crossMeter = m0 + CHUNK_METERS / 2;
        const crossX = L.xAtMeter(crossMeter);
        for (const side of [-1, 1]) {
            const inner = L.deckHalf + FEEDER_EDGE;
            const outer = L.deckHalf + (side < 0 ? R.row3[1] + m(12) : R.near[1] + m(10));
            const depth = outer - inner;
            // Alas tanah (0,3 unit di atas slab kota bawah lama, jadi tak adu-z)
            bx(put, M.soil, spanX, m(1.2), depth, cx, gy - m(0.6),
                side * (inner + depth / 2));
            // Jalan layan menyusuri kaki flyover
            bx(put, M.asphalt, spanX, m(0.3), SERVICE_W, cx, gy + m(0.16),
                side * (inner + SERVICE_W / 2));
            // Kanstin tipis di garis depan kavling — sengaja SEMPIT: jalan
            // layannya cuma 3 m, trotoar 2 m akan menelan hampir seluruhnya.
            bx(put, M.kerb, spanX, m(0.36), m(0.8), cx, gy + m(0.2),
                side * (L.deckHalf + R.row1[0] - m(0.4)));
            if (side < 0) {
                bx(put, M.asphalt, spanX, m(0.3), STREET_W, cx, gy + m(0.16),
                    side * (L.deckHalf + R.row1[1] + STREET_W / 2));
                bx(put, M.kerb, spanX, m(0.36), m(1.6), cx, gy + m(0.2),
                    side * (L.deckHalf + R.row2[0] - m(0.8)));
                bx(put, M.asphalt, spanX, m(0.3), ALLEY_W, cx, gy + m(0.16),
                    side * (L.deckHalf + R.row2[1] + ALLEY_W / 2));
            }
            // Jalan lintas antar blok — DIPOTONG di kaki flyover: koridor di
            // bawah dek sudah beraspal milik `buildLowerRoads`.
            if (crossMeter < endMeter)
                bx(put, M.asphalt, m(9), m(0.24), depth, crossX, gy + m(0.13),
                    side * (inner + depth / 2));
        }
    }

    // --- DISTRIK ---
    // `floors` = anggaran lantai menara per baris; lihat aturan 1 di kepala
    // berkas. `n` masuk ke benih supaya baris tidak mewarisi urutan tipe yang
    // sama (semua kunci baris kebetulan sepanjang 4 huruf).
    const rowsPlan = [
        { key: 'row1', n: 1, side: -1, near: L.deckHalf + R.row1[0],
            depth: ROW1_D, mix: ROW1_MIX, floors: [4, 6] },
        { key: 'row2', n: 2, side: -1, near: L.deckHalf + R.row2[0],
            depth: ROW2_D, mix: ROW2_MIX, floors: [5, 12] },
        { key: 'row3', n: 3, side: -1, near: L.deckHalf + R.row3[0],
            depth: ROW3_D, mix: ROW3_MIX, floors: [3, 7] },
        { key: 'near', n: 4, side: 1, near: L.deckHalf + R.near[0],
            depth: NEAR_ROW_D, mix: NEAR_MIX, floors: [2, 3], maxTop: NEAR_TOP_Y },
    ];
    const count = Math.ceil((districtEndMeter + DISTRICT_METERS) / DISTRICT_METERS);
    for (const row of rowsPlan) {
        for (let i = 0; i < count; i++) {
            const meter = (i + 0.5) * DISTRICT_METERS - 20;
            if (row.key === 'row3'
                && Math.abs(meter - L.F.landmarkMeter) > ROW3_HALF_METERS) continue;
            // Distrik yang seluruh bentangnya berada di barat batas pandang
            // tak pernah masuk frame: player berhenti di gerbang tol, dan hanya
            // kamera outro yang ikut kendaraan sedikit melewatinya.
            if (meter - DISTRICT_METERS / 2 > districtEndMeter) continue;
            const seed = row.n * 7919 + i * 131 + (row.side + 2) * 4517;
            let type = pick(seed, 1, row.mix);
            if (row.key === 'row1') {
                const mark = LANDMARK_AT.find(l =>
                    Math.abs(l.meter - meter) <= DISTRICT_METERS / 2);
                if (mark) type = mark.type;
            }
            const d = {
                cx: L.xAtMeter(meter), span: DISTRICT_METERS * CAMP_M - m(6),
                side: row.side, near: row.near, depth: row.depth, gy, seed,
                floors: row.floors,
                maxTop: row.maxTop != null ? row.maxTop : null,
            };
            const put = o => at(meter).push(o);
            const out = DISTRICTS[type](put, M, d);
            districts.push({ row: row.key, side: row.side, meter, type,
                x: d.cx, z: row.side * (row.near + row.depth / 2),
                buildings: out.buildings, top: out.top });
            record(type === 'taman' ? 'bandung-park'
                : (type === 'gedungSate' || type === 'alunAlun' || type === 'braga'
                    ? 'bandung-landmark' : 'lower-city-building'),
            d.cx, row.side * (row.near + row.depth / 2),
            d.span / 2, row.depth / 2, out.top,
            { district: type, row: row.key, side: row.side, meter,
                buildings: out.buildings, topY: out.top, groundY: gy });
        }
    }

    // --- PERABOT JALAN: lampu, tiang listrik berkabel, mobil parkir, pohon
    //     peneduh. Semua di sepanjang jalan layan kedua sisi. ---
    for (let meter = 12; meter < endMeter; meter += 24) {
        const put = o => at(meter).push(o);
        const x = L.xAtMeter(meter);
        const s = Math.round(meter);
        for (const side of [-1, 1]) {
            const zEdge = side * (L.deckHalf + FEEDER_EDGE + SERVICE_W * 0.5);
            streetLamp(put, M, x, gy, zEdge + side * m(1.4), -side);
            if ((s / 24 | 0) % 2 === 0)
                tree(put, M, x + m(6), gy, zEdge + side * m(1.2),
                    rr(s, 2, 0.8, 1.15));
            if (rnd(s, 3) < 0.55)
                parkedCar(put, M, x - m(4), gy, zEdge - side * m(0.4),
                    Math.PI / 2, s, 4);
        }
        // Tiang listrik + kabel melintang (siluet khas jalan Indonesia)
        if ((s / 24 | 0) % 3 === 0) {
            const zp = -(L.deckHalf + FEEDER_EDGE + SERVICE_W + m(0.6));
            cyl(put, M.kerb, m(0.12), m(0.18), m(9), 5, x, gy + m(4.5), zp);
            bx(put, M.trim, m(0.14), m(0.14), m(2.4), x, gy + m(8.4), zp);
            // Kabelnya membentang PENUH sampai tiang berikutnya (72 m), kalau
            // tidak yang tampak cuma potongan menggantung di udara.
            bx(put, M.trim, m(72), m(0.1), m(0.1), x - m(36), gy + m(8.2), zp);
        }
    }

    // --- LAS PER POTONGAN ---
    let raw = 0, welded = 0;
    for (const objs of chunks) {
        if (!objs.length) continue;
        raw += objs.length;
        const keys = new Set();
        for (const o of objs) if (o.material) keys.add(materialKey(o.material));
        welded += keys.size;
        addMergedStatic(cityRoot, objs);
    }

    const stats = {
        root: cityRoot, groundY: gy, chunks: chunkCount,
        chunkMeters: CHUNK_METERS, districtMeters: DISTRICT_METERS,
        beyondMeters: beyond, endMeter, districtEndMeter,
        raw, welded, districts,
        types: [...new Set(districts.map(d => d.type))],
        rows: {
            row1: R.row1.slice(), row2: R.row2.slice(), row3: R.row3.slice(),
            near: R.near.slice(),
        },
        nearTopY: NEAR_TOP_Y,
        maxNearTop: districts.filter(d => d.side > 0)
            .reduce((v, d) => Math.max(v, d.top), -Infinity),
        pointLights: 0, blockers: 0,
    };
    return stats;
}
