// stairwell.js — TANGGA BORDES (dog-leg) gedung campaign stage 1-3 (2026-07-19,
// foto referensi user: tangga darurat gedung — dua flight sejajar + bordes +
// railing besi hitam). DUA VARIAN BERBEDA (permintaan user: titik MASUK dan
// KELUAR TIDAK boleh sama, karena END menerus ke lantai di bawahnya):
//   buildStairwellUp   = tangga START (player TURUN DARI Lt.3; REDESAIN
//                        2026-07-19, keluhan user: celah di belakang tangga +
//                        kotak gelap melayang): TANGGA SUDUT L ala gedung
//                        kantor yang MENEMPEL PENUH tembok BARAT+UTARA —
//                        flight 1 masuk dari timur menyusuri tembok utara,
//                        bordes sudut di pojok, flight 2 belok 90° menyusuri
//                        tembok barat dan LENYAP DI BALIK dinding stub poros
//                        (rapat tembok, bukan kotak melayang) — tanpa lubang.
//   buildStairwellDown = tangga END (turun ke lantai bawah = stage berikutnya):
//                        LUBANG NYATA di lantai (lantai stage dibangun 4 STRIP
//                        oleh buildFloorWithHole sehingga benar-benar bolong) +
//                        dua flight MENEMBUS TURUN ke poros gelap di bawah
//                        ruangan + pagar pengaman keliling lubang.
// MURNI VISUAL: blocker tangga (footprint lama, solid) tetap didaftarkan oleh
// stage — nav/kolisi/BFS tak berubah, dan lubang ⊂ blocker sehingga player/robot
// tak pernah bisa berdiri di atas lubang. Material Lambert/Basic (program sudah
// warm oleh preload) → tanpa recompile; TANPA PointLight (jumlah lampu tetap).

import { scene } from '../../../core/renderer.js';
import { PAL } from '../../../world/palette.js';
import { buildInteriorFloorMat } from './interior.js';

// Dimensi (unit dunia; 1 m ≈ 7 unit). Flight 11 lebar + celah 2 = total 24 —
// muat di dalam blocker tangga lama (26 x 40).
const W = 11;                       // lebar satu flight
const GAP = 2;                      // celah antar flight (jalur railing tengah)
const RISE = 1.55, RUN = 2.6;       // tinggi & tapak anak tangga
const N = 7;                        // anak tangga flight utama
const LAND_TOP = RISE * N;          // ~10.85 = tinggi bordes (≈ setengah plafon)
const FX = (W + GAP) / 2;           // offset-x lajur flight (±6.5)
const HOLE_HX = 11.5, HOLE_HZ = 14; // setengah lubang lantai varian END

// Warna: tread hijau lumut PUDAR (bukan hijau EXIT 0x2eff6a / coolant — warna
// sinyal gameplay sakral), badan beton, railing besi gelap PAL.ink.
let M = null;
function mats() {
    if (M) return M;
    M = {
        tread: new THREE.MeshLambertMaterial({ color: 0x4f7263 }),
        body: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        rail: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        dark: new THREE.MeshBasicMaterial({ color: 0x0b0a08 }),   // poros gelap (ilusi kedalaman, spt portal lama 0x020202)
        deep: new THREE.MeshBasicMaterial({ color: 0x050505 }),   // dasar poros
    };
    return M;
}

// Metrik untuk smoke test — DI-DEDUPE per koordinat build (buildWorld bisa
// terpanggil dua kali di harness: langsung + lewat ensureWorld stage1.enter).
const DBG = { ups: new Map(), downs: new Map(), floors: new Map() };
export function stairwellDebug() {
    return {
        ups: DBG.ups.size, downs: DBG.downs.size,
        holes: [...DBG.downs.values()],
        floorStrips: [...DBG.floors.values()],
    };
}

function box(g, mat, sx, sy, sz, x, y, z, rotX = 0, shadow = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    if (rotX) m.rotation.x = rotX;
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    g.add(m);
    return m;
}

// Rail miring dari (x1,y1,z1) ke (x2,y2,z2) — HARUS sejajar sumbu x ATAU z
// (urutkan x1<x2 / z1<z2); balok 0.6² memanjang, dimiringkan mengikuti tinggi.
function railRun(g, mat, x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const alongX = Math.abs(dx) > Math.abs(dz);
    const len = Math.hypot(alongX ? dx : dz, dy) + 0.6;
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? len : 0.6, 0.6, alongX ? 0.6 : len), mat);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    if (alongX) mesh.rotation.z = Math.atan(dy / dx);   // +θ menaikkan ujung +x
    else mesh.rotation.x = -Math.atan(dy / dz);         // -θ menaikkan ujung +z
    mesh.castShadow = true;
    g.add(mesh);
}

// Footprint blocker tangga START (dipakai stage utk push blocker + nav):
// menutup seluruh struktur L (x: tembok..+31, z: tembok..+33.4).
export function stairwellUpFootprint(wallX, wallZ) {
    return { x: wallX + 15.5, z: wallZ + 16.7, hx: 15.5, hz: 16.7 };
}

// ===== Tangga START (REDESAIN 2026-07-19): TANGGA SUDUT L ala gedung kantor,
// MENEMPEL PENUH ke tembok BARAT + UTARA (tanpa celah — keluhan user).
// (wallX, wallZ) = MUKA DALAM tembok barat & utara ruangan. Flight 1 masuk
// dari TIMUR (anak tangga terendah) naik ke barat menyusuri tembok utara →
// BORDES SUDUT di pojok barat-laut → flight 2 belok 90° naik ke selatan
// menyusuri tembok barat dan LENYAP DI BALIK DINDING STUB POROS setinggi
// plafon (kotak gelap melayang lama DIHAPUS — dari kamera SW stub menutupi
// anak tangga teratas = kesan menerus ke Lt.3 secara wajar). =====
export function buildStairwellUp(wallX, wallZ, H = 22) {
    const m = mats(), g = new THREE.Group();
    const M0 = 0.3, LW = 12;                       // celah anti z-fighting + sisi bordes
    const lx = wallX + M0, lz = wallZ + M0;        // pojok dalam (rapat tembok)
    // BORDES SUDUT (pojok barat-laut, rapat kedua tembok)
    box(g, m.body, LW, LAND_TOP, LW, lx + LW / 2, LAND_TOP / 2, lz + LW / 2, 0, true);
    box(g, m.tread, LW + 0.3, 0.35, LW + 0.3, lx + LW / 2, LAND_TOP + 0.17, lz + LW / 2);
    // FLIGHT 1: masuk dari TIMUR, naik ke barat menyusuri tembok utara
    const x1a = lx + LW, x1b = x1a + N * RUN;      // barat..timur lajur flight 1
    const zLane1 = lz + W / 2;
    for (let k = 1; k <= N; k++) {
        const top = RISE * k, xc = x1b - (k - 0.5) * RUN;   // k=1 = anak terendah di timur
        box(g, m.body, RUN, top, W, xc, top / 2, zLane1, 0, true);
        box(g, m.tread, RUN + 0.2, 0.35, W + 0.3, xc, top + 0.17, zLane1);
    }
    // FLIGHT 2: belok 90° dari bordes, naik ke selatan menyusuri tembok barat
    const RISE2 = 1.0, z2a = lz + LW, z2b = z2a + N * RUN;
    const xLane2 = lx + W / 2;
    for (let k = 1; k <= N; k++) {
        const top = LAND_TOP + RISE2 * k, zc = z2a + (k - 0.5) * RUN;
        box(g, m.body, W, top, RUN, xLane2, top / 2, zc, 0, true);
        box(g, m.tread, W + 0.3, 0.35, RUN + 0.2, xLane2, top + 0.17, zc);
    }
    // DINDING STUB POROS setinggi plafon di ujung selatan flight 2 (rapat tembok
    // barat): dari kamera SW ia MENUTUPI anak tangga teratas → tangga tampak
    // menerus naik di baliknya (pengganti kotak gelap melayang).
    box(g, m.body, W + 0.6, H, 2.6, xLane2, H / 2, z2b + 1.3, 0, true);
    // RAILING besi hitam di sisi TERBUKA kedua flight (rail miring + tiang)
    const zr = lz + W + 0.35, xr = lx + W + 0.35;
    railRun(g, m.rail, x1a - 0.6, LAND_TOP + 3, zr, x1b, RISE + 3, zr);
    railRun(g, m.rail, xr, LAND_TOP + 3, z2a - 0.6, xr, LAND_TOP + RISE2 * N + 3, z2b);
    for (const [px, py, pz] of [
        [x1b - 1.3, RISE + 1.5, zr], [(x1a + x1b) / 2, RISE * 3.5 + 1.5, zr], [x1a + 1.3, LAND_TOP + 1.5, zr],
        [xr, LAND_TOP + 1.5, z2a + 1.3], [xr, LAND_TOP + RISE2 * 3.5 + 1.5, (z2a + z2b) / 2], [xr, LAND_TOP + RISE2 * N + 1.5, z2b - 1.3],
    ]) box(g, m.rail, 0.5, 3, 0.5, px, py, pz, 0, true);
    scene.add(g);
    DBG.ups.set(`${Math.round(wallX)}|${Math.round(wallZ)}`, { x: wallX, z: wallZ });
    return g;
}

// Jarak pusat struktur END -> muka tembok saat DIPEPET (ekstensi terdalam
// sisi bordes ~14.9 + celah 0.3 anti z-fighting). Dipakai stage 1 & 2 untuk
// menaruh pusat tangga END rapat tembok TIMUR (2026-07-19, permintaan user).
export const DOWN_FLUSH_OFF = 15.2;

// Rect lubang lantai varian END (dipakai stage SEBELUM membangun lantai).
// rot90=true (2026-07-19): struktur diputar 90° (flight memanjang timur-barat)
// -> setengah-lebar lubang ikut tertukar (x lebar, z sempit).
export function stairwellHoleRect(x, z, rot90 = false) {
    const hx = rot90 ? HOLE_HZ : HOLE_HX, hz = rot90 ? HOLE_HX : HOLE_HZ;
    return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
}

// ===== Tangga END: MENEMBUS TURUN ke lantai bawah (lokal: masuk dari UTARA -z;
// flight 1 turun ke selatan menuju bordes bawah, flight 2 balik turun ke utara
// lenyap ke dasar poros). Lantai stage DILUBANGI oleh buildFloorWithHole di
// rect stairwellHoleRect yang sama. Grup berpusat (x, 0, z); `rot90`
// (2026-07-19, permintaan user) memutar seluruh struktur 90° — masuk dari
// BARAT, turun ke timur, bordes bawah RAPAT tembok timur (pepet via
// DOWN_FLUSH_OFF di stage). =====
export function buildStairwellDown(x, z, rot90 = false) {
    const m = mats(), g = new THREE.Group();
    // FLIGHT 1 (lajur barat) turun dari tepi utara lubang
    for (let i = 0; i < N; i++) {
        const top = -1.3 - RISE * i, zc = -12.4 + RUN * i;
        box(g, m.body, W, 1.6, RUN, -FX, top - 0.8, zc);
        box(g, m.tread, W + 0.3, 0.35, RUN + 0.2, -FX, top + 0.17, zc);
    }
    // stringer miring penopang flight 1 (dua sisi)
    const aD = Math.atan(RISE / RUN);
    const sLen = Math.hypot(RISE * (N - 1), RUN * (N - 1)) + 4;
    const sMidZ = -12.4 + RUN * (N - 1) / 2, sMidY = -1.3 - RISE * (N - 1) / 2 - 1.6;
    box(g, m.body, 0.8, 2.6, sLen, -FX - W / 2 + 0.4, sMidY, sMidZ, aD);
    box(g, m.body, 0.8, 2.6, sLen, -FX + W / 2 - 0.4, sMidY, sMidZ, aD);
    // BORDES bawah (selatan) + FLIGHT 2 (lajur timur) turun balik ke utara
    const landY = -1.3 - RISE * N;   // ~-12.15
    box(g, m.body, 2 * W + GAP, 2.2, 9, 0, landY - 1.1, 9.2);
    box(g, m.tread, 2 * W + GAP + 0.3, 0.35, 9.2, 0, landY + 0.17, 9.2);
    for (let i = 0; i < 6; i++) {
        const top = landY - 1.3 - RISE * i, zc = 3.6 - RUN * i;
        box(g, m.body, W, 1.6, RUN, FX, top - 0.8, zc);
        box(g, m.tread, W + 0.3, 0.35, RUN + 0.2, FX, top + 0.17, zc);
    }
    // PELAPIS POROS gelap (4 dinding dalam lubang, muka dalam rata tepi lubang) + dasar
    box(g, m.dark, 0.9, 26, 2 * HOLE_HZ + 1, -HOLE_HX - 0.45, -13, 0);
    box(g, m.dark, 0.9, 26, 2 * HOLE_HZ + 1, HOLE_HX + 0.45, -13, 0);
    box(g, m.dark, 2 * HOLE_HX + 1.8, 26, 0.9, 0, -13, -HOLE_HZ - 0.45);
    box(g, m.dark, 2 * HOLE_HX + 1.8, 26, 0.9, 0, -13, HOLE_HZ + 0.45);
    box(g, m.deep, 2 * HOLE_HX + 2, 0.5, 2 * HOLE_HZ + 2, 0, -25, 0);
    // PAGAR PENGAMAN keliling lubang di lantai (double rail + tiang) — bukaan
    // masuk di paruh BARAT tepi utara (awal flight 1), sisanya terpagari.
    const railAt = (sx, sy, sz, px, pz) => { box(g, m.rail, sx, 0.5, sz, px, sy, pz, 0, true); };
    for (const ry of [1.5, 3.1]) {
        railAt(0.5, ry, 2 * HOLE_HZ + 1, HOLE_HX + 0.5, 0);            // tepi timur
        railAt(0.5, ry, 2 * HOLE_HZ + 1, -HOLE_HX - 0.5, 0);           // tepi barat
        railAt(2 * HOLE_HX + 1.5, ry, 0.5, 0, HOLE_HZ + 0.5);          // tepi selatan
        railAt(HOLE_HX + 0.5, ry, 0.5, HOLE_HX / 2 + 0.3, -HOLE_HZ - 0.5);   // tepi utara (paruh timur saja)
    }
    for (const [px, pz] of [
        [HOLE_HX + 0.5, -HOLE_HZ - 0.5], [HOLE_HX + 0.5, 0], [HOLE_HX + 0.5, HOLE_HZ + 0.5],
        [-HOLE_HX - 0.5, -HOLE_HZ - 0.5], [-HOLE_HX - 0.5, 0], [-HOLE_HX - 0.5, HOLE_HZ + 0.5],
        [0, HOLE_HZ + 0.5], [0.6, -HOLE_HZ - 0.5],
    ]) box(g, m.rail, 0.6, 3.4, 0.6, px, 1.7, pz, 0, true);
    if (rot90) g.rotation.y = Math.PI / 2;   // lokal +z (arah turun) -> dunia +x (timur)
    g.position.set(x, 0, z);
    scene.add(g);
    DBG.downs.set(`${Math.round(x)}|${Math.round(z)}`, stairwellHoleRect(x, z, rot90));
    return g;
}

// ===== Lantai stage DENGAN LUBANG tangga END: 4 strip PlaneGeometry (utara /
// selatan / barat / timur lubang) memakai material interior yang sama — repeat
// fraksional per strip + offset fase supaya pola panel/nat teal MENYAMBUNG
// persis seperti lantai satu-plane lama (1 ubin per sel; peta emissive ikut
// transform `map` di r128). Lubangnya BENAR-BENAR bolong (bukan tekstur gelap)
// sehingga poros tangga di bawah lantai terlihat dari kamera top-down. =====
export function buildFloorWithHole(x0, z0, sizeX, sizeZ, cell, hole) {
    const z1 = z0 + sizeZ, x1 = x0 + sizeX;
    const rects = [
        { x: x0, z: z0, w: sizeX, d: hole.z0 - z0 },                      // strip utara
        { x: x0, z: hole.z1, w: sizeX, d: z1 - hole.z1 },                 // strip selatan
        { x: x0, z: hole.z0, w: hole.x0 - x0, d: hole.z1 - hole.z0 },     // strip barat
        { x: hole.x1, z: hole.z0, w: x1 - hole.x1, d: hole.z1 - hole.z0 },// strip timur
    ];
    const g = new THREE.Group();
    let n = 0;
    for (const rc of rects) {
        if (rc.w <= 0.01 || rc.d <= 0.01) continue;
        const mat = buildInteriorFloorMat(rc.w / cell, rc.d / cell);
        // fase pola: ubin dihitung dari pojok (x0, z1) lantai penuh — offset U/V
        // menyamakan grid nat antar-strip (U bertambah ke timur, V ke utara).
        mat.map.offset.set(((rc.x - x0) / cell) % 1, ((z1 - rc.z - rc.d) / cell) % 1);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rc.w, rc.d), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(rc.x + rc.w / 2, 0.01, rc.z + rc.d / 2);
        mesh.receiveShadow = true;
        g.add(mesh); n++;
    }
    scene.add(g);
    DBG.floors.set(`${Math.round(x0)}|${Math.round(z0)}`, n);
    return g;
}
