// barricade.js — TUMPUKAN PERABOT '*' + CELAH TEMBOK '/' BERSAMA (2026-08-13).
// Lahir di Stage 1 (revisi denah CSV user 2026-08-12) lalu diangkat ke utility
// saat Stage 2 mendapat legenda yang sama — keduanya WAJIB memakai modul ini
// supaya barikade tak pernah bercabang jadi dua implementasi.
//
// '*' TUMPUKAN PERABOT: satu sel penuh yang TIDAK BISA dilewati player maupun
//     robot. Selnya tetap LANTAI di grid denah (jadi BFS denah + aturan tanpa-
//     dinding-ganda tak tersentuh); yang memblokir adalah satu blocker sel-penuh
//     `standable:false` yang ikut bake nav di akhir buildWorld, jadi robot
//     memutarinya. Isinya DELAPAN RESEP berbeda JENIS perabot (permintaan user
//     2026-08-12: "kalo cuma lemari gitu terlihat monoton") — bukan satu benda
//     yang diulang dengan warna lain.
//
// '/' CELAH TEMBOK: sel lantai berlubang di garis dinding — tembok JEBOL, bukan
//     pintu. Hanya sisa tembok bergerigi di kedua kusen, TANPA blocker: sel cuma
//     selebar `cell` dan player (radius penuh) tak pernah bisa berada lebih dekat
//     dari `cell/2 - player.radius` ke tepi sel, jadi tonjolan sependek ini
//     mustahil tersentuh kolisi.
//
// Aturan yang tidak boleh dilanggar pemakai:
//   - Resep/rotasi/goyangan diambil dari HASH INDEKS SEL, JANGAN Math.random():
//     buildWorld tiap stage berjalan saat loading bersama SELURUH dunia campaign,
//     jadi mengonsumsi RNG global di sini akan menggeser penempatan acak stage
//     lain.
//   - Tiap potong tetap di dalam selnya sendiri supaya tumpukan bertetangga tak
//     saling menembus (offset di tabel sudah diperhitungkan terhadap rotasinya).

import { PAL } from '../../../world/palette.js';
import { buildFuturisticCrateMesh } from '../../../entities/futuristicCrate.js';
import { buildFuturisticCupboardMesh } from '../../../entities/futuristicCupboard.js';
import { buildFuturisticDeskMesh } from '../../../entities/futuristicDesk.js';
import { buildFuturisticSofaMesh } from '../../../entities/futuristicSofa.js';
import { buildFuturisticBenchMesh } from '../../../entities/futuristicBench.js';
import { buildFuturisticPlanterMesh } from '../../../entities/futuristicPlanter.js';
import { buildFuturisticConsoleMesh } from '../../../entities/futuristicConsole.js';
import { buildFuturisticMeetingTableMesh } from '../../../entities/futuristicMeetingTable.js';
import { buildFuturisticStallMesh } from '../../../entities/futuristicStall.js';
import { buildFuturisticRubbleMesh } from '../../../entities/futuristicRubble.js';

export const BARRICADE_TOP = 14;   // ~2 m: jelas tak bisa dilewati/ditembus pandang

const BUILDERS = {
    crate: buildFuturisticCrateMesh, cupboard: buildFuturisticCupboardMesh,
    desk: buildFuturisticDeskMesh, sofa: buildFuturisticSofaMesh,
    bench: buildFuturisticBenchMesh, planter: buildFuturisticPlanterMesh,
    console: buildFuturisticConsoleMesh, meeting: buildFuturisticMeetingTableMesh,
    stall: buildFuturisticStallMesh, rubble: buildFuturisticRubbleMesh,
};

// Entri resep: [kind, sx, sy, sz, dx, dy, dz, ry] — dx/dz relatif pusat sel.
export const BARRICADE_PILES = [
    // 0 — menara peti gudang
    [['crate', 12, 8, 12, 0, 0, 0, 0], ['crate', 9, 6, 9, -1.5, 8, 1.5, 0.4],
    ['crate', 6, 4, 6, 1.5, 10, -1, 0.9], ['rubble', 6, 2, 5, 3, 0, -3, 0.6]],
    // 1 — lemari arsip tumbang di atas meja kerja
    [['desk', 13, 7, 10, 0, 0, -1, 0], ['cupboard', 12, 5, 6, 0, 7, 1.5, 0.12],
    ['cupboard', 10, 4, 5, -0.5, 10, -2, -0.22], ['crate', 5, 4, 5, 3.5, 0, 3.5, 0.5]],
    // 2 — sofa lounge disumpal peti
    [['sofa', 13, 6, 10, 0, 0, -1.5, 0], ['crate', 9, 6, 9, 0, 6, 1, 0.3],
    ['bench', 11, 5, 5, -0.5, 9, -2.5, 0.15], ['planter', 6, 8, 6, 3.5, 0, 3.5, 0]],
    // 3 — meja rapat dijungkirkan (papan meja jadi dinding)
    [['meeting', 13, 5, 11, 0, 0, 0, 0], ['crate', 8, 6, 8, -2, 5, 0, 0.25],
    ['desk', 10, 6, 7, 2, 5, 1.5, 1.3], ['crate', 5, 3, 5, 3.5, 11, -3, 0.7]],
    // 4 — sekat toilet/partisi kantor ditumpuk berdiri
    [['stall', 12, 14, 2.5, 0, 0, -4, 0.08], ['stall', 12, 13, 2.5, 0.5, 0, -0.5, -0.1],
    ['cupboard', 11, 12, 4, -0.5, 0, 4, 0.05], ['crate', 6, 4, 6, 3.5, 0, 0, 0.4]],
    // 5 — barisan lemari dengan puing
    [['cupboard', 6, 13, 12, -3.5, 0, 0, 0], ['cupboard', 5, 11, 11, 2, 0, 0.5, 0.1],
    ['crate', 6, 5, 6, 3.5, 9, -2, 0.6], ['rubble', 7, 2, 6, 0, 11, 2, 0.3]],
    // 6 — konsol kerja rusak + bangku
    [['console', 12, 9, 6, 0, 0, -3.5, 0], ['bench', 12, 6, 6, 0, 0, 3.5, 0],
    ['crate', 8, 5, 8, -1, 9, -1, 0.35], ['desk', 9, 5, 6, 2, 6, 1.5, 1.25]],
    // 7 — pot beton + peti sebagai pengganjal
    [['planter', 9, 11, 9, -2.5, 0, -2.5, 0], ['crate', 10, 7, 10, 2, 0, 2, 0.2],
    ['crate', 7, 5, 7, -3, 9, 2.5, 0.8], ['bench', 10, 5, 5, 3, 7, -3, 0.5]],
];

// Blocker sel-penuh untuk satu sel '*'. Push ke array `blockers` stage.
export function barricadeBlocker(x, z, cell) {
    return {
        x, z, hx: cell / 2, hz: cell / 2, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(cell / 2, cell / 2), top: BARRICADE_TOP, standable: false,
    };
}

// Bangun isi visual satu sel '*' ke `out` (daftar staticProps stage). `seed` =
// indeks sel; SEMUA variasi berasal darinya. Mengembalikan resep terpakai supaya
// smoke bisa membuktikan tumpukannya memang bervariasi.
//
// `onGroup` (opsional, 2026-08-13): kalau diberikan, potongan tumpukan TIDAK
// masuk `out` melainkan satu Group tersendiri yang diserahkan ke callback —
// dipakai stage 1/2 untuk mendaftarkannya sebagai OCCLUDER yang bisa memudar
// (utility/occlusion.js). Tumpukan setinggi BARRICADE_TOP adalah perabot
// tertinggi di kedua stage itu, jadi ia yang paling sering menelan player.
export function buildFurniturePile(out, x, z, seed, onGroup = null) {
    const h = (seed * 2654435761) >>> 0;
    const recipe = (h >>> 5) % BARRICADE_PILES.length;
    const pile = BARRICADE_PILES[recipe];
    const spin = ((h >>> 13) % 4) * (Math.PI / 2);          // orientasi tumpukan
    const jx = (((h >>> 17) % 5) - 2) * 0.5, jz = (((h >>> 21) % 5) - 2) * 0.5;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const group = onGroup ? new THREE.Group() : null;
    for (const [kind, sx, sy, sz, dx, dy, dz, ry] of pile) {
        const m = BUILDERS[kind](sx, sy, sz);
        m.position.set(x + jx + dx * cs - dz * sn, dy, z + jz + dx * sn + dz * cs);
        m.rotation.y = ry + spin;
        if (group) group.add(m); else out.push(m);
    }
    if (group) onGroup(group);
    return { recipe, kinds: pile.map(e => e[0]) };
}

// Sisa tembok bergerigi di kedua kusen sebuah celah '/'. `dir` mengikuti konvensi
// pintu: 'ew' = lubang di dinding VERTIKAL (kusen di utara & selatan, player
// lewat sumbu x), 'ns' = lubang di dinding HORIZONTAL (kusen di barat & timur).
let breachMat = null;
export function buildWallBreach(out, x, z, dir, cell, wallH) {
    breachMat ||= new THREE.MeshLambertMaterial({ color: PAL.concrete });
    const ew = dir === 'ew';
    for (const side of [-1, 1]) {
        for (const [t, hy] of [[0.55, 0.72], [0.30, 0.40], [0.80, 0.22]]) {
            const stub = new THREE.Mesh(new THREE.BoxGeometry(
                ew ? cell * 0.9 : 2.0 * t, wallH * hy, ew ? 2.0 * t : cell * 0.9), breachMat);
            stub.position.set(
                ew ? x : x + side * (cell / 2 - t),
                wallH * hy / 2,
                ew ? z + side * (cell / 2 - t) : z);
            out.push(stub);
        }
    }
}
