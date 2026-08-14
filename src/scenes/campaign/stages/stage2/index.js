// SCENE: Campaign STAGE 2 — "Gedung Terbengkalai (Lantai 2)", perkantoran indoor.
// DENAH DIROMBAK TOTAL 2026-07-21 mengikuti PLAN RESMI user (stage2-v3.csv):
// grid 50x50 (sel 2 m), SUDAH TERHUBUNG PENUH dari sumber (2118 sel, BFS-verified
// — tak perlu pintu tambahan lagi). Legenda plan: '#'=dinding, '-'=pintu geser,
// 'T'=TANGGA RUSAK (titik MASUK, kiri-atas), 'L'=LIFT (titik SELESAI, nook
// kiri-tengah), 'X'=GENERATOR power supply (jalur kanan-atas), 'W'=ruang SUPPLY
// (tengah-atas: 4 ammo + 2 medkit), 'R'=toilet (kanan-tengah), '@'=RAK GUDANG
// (bawah; player mengambil 3 komponen generator), '1'/'2'/'3'=area spawn robot
// gelombang-2 (kelas C / B / A).
//
// ALUR GAMEPLAY (state machine `s2Phase`):
//   1. 'clear1'    : spawn di TANGGA RUSAK → monolog kondisi tangga. Lift butuh
//                    daya: pertama kali mendekat → monolog lift mati. BUNUH 50
//                    robot KELAS C → generator bisa dipulihkan.
//   2. 'goGen'     : datangi GENERATOR (X, kanan-atas) → "collect 3 components
//                    from the warehouse" + monolog pemeriksaan generator + 20
//                    robot penjaga (berbagai kelas) spawn di gudang.
//   3. 'collect'   : ambil 3 komponen (acak di rak @; berdiri di TIMUR rak).
//                    Tiap komponen = satu benda BERNAMA (REPAIR_PARTS: POWER
//                    HARNESS / CONTROL BOARD / COOLANT PUMP).
//   4. 'restore'   : kembali ke generator, INJAK kotak bermarker.
//   5. 'installing': MINIGAME PERBAIKAN "FIELD REPAIR" (2026-07-29, MENGGANTIKAN
//                    bar progress 10 dtk — utility/repairMinigame.js): scene
//                    modal berisi TIGA papan berurutan, satu per komponen tadi
//                    (kabel / chip / katup), TANPA hitung mundur. Batal (ESC) =
//                    balik ke 'restore' dengan kemajuan TERSIMPAN (s2Installed)
//                    dan pemicu baru terisi lagi setelah player MENJAUH. Selesai
//                    → langsung 'done' + monolog generator pulih + 25 robot bala
//                    bantuan (10 C ruang1, 10 B ruang2, 5 B ruang3) spawn.
//   6. 'done'      : lift SUDAH BERDAYA — player TIDAK wajib membunuh bala bantuan
//                    (2026-07-21, permintaan user): tinggal capai LIFT → stage
//                    selesai (transisi ke stage 3). Boleh lari melewati robot.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, _v3, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera } from '../../../../core/renderer.js';
import { makeTexture, speckle } from '../../../../utils/textures.js';
import { rand } from '../../../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight, makeBlockerIndex } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { applyLightPreset, registerStageLight } from '../../../../world/lighting.js';
import { PAL } from '../../../../world/palette.js';
// showDownloadBar/setDownloadProgress TAK dipakai lagi sejak bar "RESTORING
// GENERATOR" diganti minigame (2026-07-29); hideDownloadBar tetap dipanggil di
// enter() sebagai pembersih.
import {
    showStageMsg, hideStageMsg, showPickup, hideDownloadBar,
    showStageRadioDialogue, hideStageRadioDialogue,
} from '../../../../core/dom.js';
import { beginRepairMinigame, REPAIR_PARTS } from '../../utility/repairMinigame.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { updateUI } from '../../../../core/hud.js';
import { NADE_R } from '../../../../entities/grenades.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../../../entities/futuristicCupboard.js';
import { buildFuturisticCrateMesh } from '../../../../entities/futuristicCrate.js';
import { buildFuturisticSofaMesh } from '../../../../entities/futuristicSofa.js';
import { buildFuturisticRubbleMesh } from '../../../../entities/futuristicRubble.js';
import { buildFuturisticConsoleMesh } from '../../../../entities/futuristicConsole.js';
import { buildFuturisticBenchMesh } from '../../../../entities/futuristicBench.js';
import { buildFuturisticMeetingTableMesh } from '../../../../entities/futuristicMeetingTable.js';
import { buildFuturisticStallMesh } from '../../../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../../../entities/futuristicSink.js';
import { buildFuturisticPlanterMesh } from '../../../../entities/futuristicPlanter.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, campaignAwardKill, propClearance } from '../../utility/common.js';
import { barricadeBlocker, buildFurniturePile, buildWallBreach, BARRICADE_TOP } from '../../utility/barricade.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, clearStageOccluders,
    occlusionDebug,
} from '../../utility/occlusion.js';
import { buildFadeableWalls } from '../../utility/wallFade.js';
import { spawnBarrel, resolveBarrelBlock, resetBarrels } from '../../../../entities/barrels.js';
import { spawnCrate, resolveCrateBlock, resetCrates } from '../../../../entities/crates.js';
import { buildInteriorWallMat, buildInteriorFloorMat } from '../../utility/interior.js';
import {
    buildStageDoors, updateStageDoors, resolveDoors, doorsWalkable,
    doorBlocksShot, doorClampShot,
} from '../../utility/doors.js';
import { buildStairwellUp, stairwellUpFootprint } from '../../utility/stairwell.js';
import { buildLiftBank } from '../../utility/lift.js';
import { buildCampaignCityscape, enterCityEnv } from '../../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../../utility/transition.js';
import { stage1Scene } from '../stage1/index.js';
import { stage3Scene } from '../stage3/index.js';

// Grid 50x50 (sel 2 m). Gedung ~60 km dari origin — hidup berdampingan dgn stage
// lain, dipisah jarak (camera.far + culling).
export const S2 = {
    G: 50, ROWS: 50, CELL: 2 * CAMP_M, H: 22,   // tinggi plafon ~3.1 m
    x0: 60000 - 25 * 2 * CAMP_M,                 // pojok barat-laut grid
    z0: -25 * 2 * CAMP_M
};
export let s2grid = null;                        // [row][col] 1=dinding, 0=lantai
export const s2Cell = (c, r) => ({ x: S2.x0 + (c + 0.5) * S2.CELL, z: S2.z0 + (r + 0.5) * S2.CELL });
export const S2_START = { c: 5, r: 2 };          // spawn di ruang TANGGA RUSAK (kiri-atas), timur blocker tangga
// LIFT (titik SELESAI): nook kiri-tengah (sel L c9-10 r15-19 + lorong c11).
export const S2_LIFT = { c0: 9, r0: 15, c1: 11, r1: 19 };
export const S2_GEN = { c: 44, r: 3 };           // sel BERDIRI generator (kotak pulih) — mesin 2 sel di utara (44,1)
// Naskah dialog milik user. Quote pembungkus tidak menjadi bagian body panel;
// kata dan tanda baca di dalamnya dipertahankan persis serta dipatok smoke.
export const S2_DIALOGUE = dialogueMap('campaign.stage2.lines');
// Gudang (@) = bawah; penjaga & komponen di sini. Rak = kolom @ (12 kolom, tiap 4 sel).
const S2_SHELF_COLS = [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45];
const S2_SHELF_R0 = 33, S2_SHELF_R1 = 44;        // baris rak gudang

// DENAH RESMI (stage2-v3.csv, 50x50). '#'=dinding, '.'=lantai (pintu = lantai +
// pintu geser S2_DOORS). JANGAN ubah tanpa update S2_DOORS/robot + tes ulang.
// REVISI USER 2026-07-29 (baris 6): dinding baru c40-42 & c45-48 memotong ruang
// kanan-atas jadi DUA — RUANG GENERATOR tertutup (c40-48 r1-5, berisi mesin +
// kotak pulih) dan ruang besar di bawahnya (r7-28) — dengan satu MULUT PINTU
// c43-44 tepat di depan generator (pintu geser di S2_DOORS). Semua yang
// mengikuti denah ikut disesuaikan: pintu, perabot yang tadinya di baris 6,
// titik spawn robot gelombang-1, lampu per-ruangan, dan peti.
const S2_MAP = [
    '##################################################',   // 0
    '#.......#........#.....................#.........#',   // 1
    '#.......#........#.....................#.........#',   // 2
    '#.......#........#.........#...........#.........#',   // 3
    '#.......#..................#...........#.........#',   // 4
    '#.......#..................#...........#.........#',   // 5
    '#.......#........#####################.####..#####',   // 6  (c38 = celah '/' ruang SUPPLY -> toilet)
    '#.............................#........#.........#',   // 7
    '#.............................#........#.........#',   // 8
    '######..#.....................#........#.........#',   // 9
    '#.......#.....................#........#.........#',   // 10
    '#......................................#.........#',   // 11  (c8 = pintu BARU koridor kiri <-> aula)
    '#......................................#.........#',   // 12
    '#.......#.....................#........#.........#',   // 13
    '#.......#.....................#........#.........#',   // 14
    '#.......#....#................#........#.........#',   // 15
    '#.......#....#................#........#.........#',   // 16
    '#.......#....#................#........#.........#',   // 17
    '#.......#....###########################.........#',   // 18
    '#.......#....#.........................#.........#',   // 19
    '#..###########.........................#.........#',   // 20
    '#............#.............#...........#.........#',   // 21
    '#............#.............#...........#.........#',   // 22
    '#..........................#...........#.........#',   // 23
    '#..........................#...........#.........#',   // 24
    '#............#.............#...........#.........#',   // 25
    '#............#.............#...........#.........#',   // 26
    '#............#.............#.....................#',   // 27
    '#............#.............#.....................#',   // 28
    '############################################..####',   // 29
    '#................................................#',   // 30
    '#................................................#',   // 31
    '#................................................#',   // 32
    '#................................................#',   // 33
    '#................................................#',   // 34
    '#................................................#',   // 35
    '#................................................#',   // 36
    '#................................................#',   // 37
    '#................................................#',   // 38
    '#................................................#',   // 39
    '#................................................#',   // 40
    '#................................................#',   // 41
    '#................................................#',   // 42
    '#................................................#',   // 43
    '#................................................#',   // 44
    '#................................................#',   // 45
    '#................................................#',   // 46
    '#................................................#',   // 47
    '#................................................#',   // 48
    '##################################################',   // 49
];

// PINTU di semua bukaan '-' dan '+' denah (9). dir 'ew'=celah dinding VERTIKAL /
// 'ns'=celah dinding HORIZONTAL. Semua jamb sudah diverifikasi dinding.
//   broken: true -> '+' pintu RUSAK, macet permanen (lampu jamb selalu MERAH,
//                   daun tak pernah bergerak) — pemain harus memutar.
const S2_DOORS = [
    { c0: 43, r0: 6, c1: 44, r1: 6, dir: 'ns' },     // ruang GENERATOR (r1-5) <-> ruang besar bawahnya (revisi denah user 2026-07-29)
    { c0: 17, r0: 4, c1: 17, r1: 5, dir: 'ew' },     // upper-center <-> cols9-16 area
    { c0: 6, r0: 9, c1: 7, r1: 9, dir: 'ns', broken: true },     // T-area -X- koridor kiri (RUSAK)
    { c0: 8, r0: 11, c1: 8, r1: 12, dir: 'ew' },     // koridor kiri <-> center hall (pengganti pintu rusak)
    { c0: 30, r0: 11, c1: 30, r1: 12, dir: 'ew' },   // center hall <-> R-toilet/center-right
    { c0: 27, r0: 19, c1: 27, r1: 20, dir: 'ew' },   // corridor split (center-lower <-> lower-center-right)
    { c0: 1, r0: 20, c1: 2, r1: 20, dir: 'ns' },     // left corridor <-> lower-left
    { c0: 13, r0: 23, c1: 13, r1: 24, dir: 'ew' },   // lower-left <-> center-lower
    { c0: 39, r0: 27, c1: 39, r1: 28, dir: 'ew' },   // lower-center-right <-> GENERATOR room
    { c0: 44, r0: 29, c1: 45, r1: 29, dir: 'ns' },   // lower region <-> WAREHOUSE (bawah)
];

// CELAH TEMBOK '/' (denah 2026-08-13): satu sel lantai berlubang di garis
// dinding — tembok yang JEBOL, bukan pintu. Sel-nya sudah lantai di S2_MAP;
// utility/barricade.js hanya menempelkan sisa tembok bergerigi di kedua kusen.
// Dengan pintu c6-7 r9 kini RUSAK dan baris 9 tertumpuk perabot, celah inilah
// SATU-SATUNYA jalan turun dari lantai atas: SUPPLY -> toilet -> aula.
//   [c, r, dir] — 'ns' = lubang di dinding HORIZONTAL, 'ew' = VERTIKAL.
const S2_BREACHES = [
    [38, 6, 'ns'],    // ruang SUPPLY (W) <-> toilet (R)
];

// TUMPUKAN PERABOT '*' (denah 2026-08-13): barikade sel-penuh yang TIDAK BISA
// dilewati player MAUPUN robot (utility/barricade.js). Sel tetap lantai di grid.
//   r9 c9-29    : menyegel aula utama dari koridor r7-8 di atasnya
//   c42-43 r13-28 : membelah ruang generator jadi lorong barat c40-41 (mulut
//                   pintu c39 r27-28) dan sisi timur c44-48 (pintu gudang
//                   c44-45 r29); keduanya bertemu lagi di baris 7-12.
const S2_BARRICADES = [];
for (let c = 9; c <= 29; c++) S2_BARRICADES.push([c, 9]);
for (let r = 13; r <= 28; r++) { S2_BARRICADES.push([42, r]); S2_BARRICADES.push([43, r]); }
export const s2BarricadesDbg = () => S2_BARRICADES;   // smoke test
export const s2BreachesDbg = () => S2_BREACHES;       // smoke test
let s2BarricadeMix = [];
export const s2BarricadeMixDbg = () => s2BarricadeMix;
// PERABOT TAMBAHAN per-ruangan (2026-07-26): [kind, c, r, sx, sy, sz]. Ditempel
// dinding/sudut supaya ruangan terasa dipakai TANPA menyumbat jalur — mulut
// pintu, lorong rak gudang, kotak generator & sel komponen dibiarkan bersih.
const S2_FURNITURE = [
    // ruang TANGGA rusak (start)
    ['cupboard', 1, 6, 6, 15, 16], ['planter', 6, 4, 8, 11, 8],
    // koridor kiri
    ['cupboard', 1, 13, 6, 15, 30], ['bench', 6, 12, 14, 6, 6],
    // center hall (aula utama)
    ['cupboard', 29, 7, 6, 15, 18], ['desk', 14, 12, 22, 7, 12],   // rak naik ke r7: baris 9 kini barikade '*'
    ['box', 20, 16, 14, 9, 14], ['planter', 11, 8, 8, 11, 8], ['bench', 23, 19, 18, 6, 7],
    // upper-center
    ['cupboard', 18, 1, 6, 15, 20], ['planter', 26, 5, 8, 11, 8],
    // ruang SUPPLY (W)
    ['cupboard', 38, 3, 6, 15, 26], ['box', 31, 4, 12, 9, 12],
    // toilet (R)
    ['stall', 36, 9, 2, 15, 10], ['sink', 31, 14, 10, 8, 4],
    // ruang GENERATOR
    ['cupboard', 48, 10, 6, 15, 40], ['box', 46, 17, 14, 9, 14],
    ['desk', 46, 25, 20, 7, 12], ['planter', 47, 17, 8, 11, 8],
    // lower-left (ruang 2)
    ['cupboard', 1, 25, 6, 15, 20], ['desk', 9, 22, 20, 7, 12], ['box', 4, 27, 12, 9, 12],
    // center-lower (ruang 1)
    ['cupboard', 14, 26, 6, 15, 20], ['meeting', 20, 27, 34, 7, 18], ['box', 25, 22, 12, 9, 12],
    // lower-center-right
    ['cupboard', 28, 22, 6, 15, 24], ['box', 37, 24, 12, 9, 12], ['bench', 31, 27, 18, 6, 7],
    // gudang barat & timur (di LUAR pita rak r33-44 supaya lorong rak tetap lapang)
    ['cupboard', 7, 31, 20, 15, 6], ['box', 3, 46, 14, 9, 14], ['box', 19, 46, 14, 9, 14],
    ['cupboard', 35, 31, 20, 15, 6], ['box', 27, 46, 14, 9, 14], ['box', 43, 46, 14, 9, 14],

    // === PEMADATAN LANJUTAN (2026-07-26 pass 2, permintaan user: ruangan masih
    // terasa kosong). Menempel dinding/sudut; mulut pintu, nook lift, kotak
    // generator, lorong rak gudang & sel komponen tetap bersih. ===
    ['rubble', 1, 8, 12, 9, 12], ['cupboard', 1, 4, 6, 15, 20],                    // ruang tangga rusak
    ['cupboard', 2, 10, 20, 15, 6], ['box', 1, 17, 14, 9, 14], ['planter', 7, 17, 8, 11, 8],   // koridor kiri
    ['desk', 30, 19, 22, 7, 12], ['cupboard', 28, 7, 20, 15, 6], ['box', 12, 13, 14, 9, 14],    // center hall
    ['planter', 29, 15, 8, 11, 8], ['sofa', 25, 7, 18, 6, 14], ['desk', 22, 7, 22, 7, 12],
    // Meja rapat (10,7) DIHAPUS 2026-08-13 (laporan user: jalan keluar dari titik
    // start tersumbat). Meja 34x18 itu berdiri persis di mulut SATU-SATUNYA jalan
    // keluar ruang tangga (baris 7-8 c8-11) sejak baris 9 jadi barikade '*' dan
    // pintu c6-7 r9 jadi RUSAK — kombinasinya mengurung player di ruang start.
    ['bench', 15, 19, 18, 6, 7], ['box', 27, 10, 14, 9, 14],
    ['cupboard', 26, 4, 6, 15, 20], ['planter', 19, 1, 8, 11, 8],                  // upper-center
    ['cupboard', 28, 1, 20, 15, 6], ['box', 28, 4, 14, 9, 14], ['bench', 37, 1, 18, 6, 7],     // ruang SUPPLY
    ['stall', 31, 7, 10, 15, 2], ['sink', 37, 10, 10, 8, 4], ['stall', 31, 17, 10, 15, 2],     // toilet (wastafel menyingkir dari mulut celah c38 r6)
    ['desk', 41, 3, 22, 7, 12], ['cupboard', 47, 3, 20, 15, 6], ['box', 47, 26, 14, 9, 14],    // ruang generator
    // planter(41,6) & bench(47,6) DIPINDAH ke dalam ruang generator: baris 6 kini
    // DINDING (revisi denah user 2026-07-29), jadi keduanya akan tertanam tembok.
    ['console', 47, 12, 12, 7, 8], ['planter', 42, 5, 8, 11, 8], ['bench', 46, 5, 18, 6, 7],
    ['box', 47, 19, 14, 9, 14],
    ['desk', 10, 21, 22, 7, 12], ['cupboard', 3, 28, 20, 15, 6], ['box', 5, 21, 14, 9, 14],    // lower-left (ruang 2)
    ['planter', 8, 28, 8, 11, 8],
    ['desk', 25, 27, 22, 7, 12], ['cupboard', 16, 21, 20, 15, 6], ['box', 25, 24, 14, 9, 14],  // center-lower (ruang 1)
    ['bench', 16, 24, 18, 6, 7],
    ['desk', 37, 21, 22, 7, 12], ['cupboard', 30, 21, 20, 15, 6], ['box', 36, 27, 14, 9, 14],  // lower-center-right
    ['planter', 34, 21, 8, 11, 8],
    ['box', 1, 30, 14, 9, 14], ['rubble', 1, 48, 12, 9, 12], ['cupboard', 24, 30, 20, 15, 6],  // gudang barat (pita luar rak)
    ['box', 6, 30, 14, 9, 14], ['bench', 17, 30, 18, 6, 7],
    ['box', 25, 32, 14, 9, 14], ['rubble', 25, 48, 12, 9, 12], ['cupboard', 48, 47, 6, 15, 20],// gudang timur
    ['box', 30, 30, 14, 9, 14], ['bench', 41, 48, 18, 6, 7],

    // --- pass 3: sisa sudut & pinggir ruangan besar yang masih melompong ---
    ['planter', 2, 8, 8, 11, 8],                                                   // ruang tangga rusak
    ['bench', 6, 19, 18, 6, 7], ['box', 1, 11, 14, 9, 14], ['cupboard', 7, 15, 6, 15, 20],     // koridor kiri (lemari turun: c8 r11-12 kini pintu)
    ['cupboard', 14, 20, 6, 15, 20], ['box', 20, 7, 14, 9, 14], ['desk', 21, 19, 22, 7, 12],   // center hall
    ['planter', 14, 16, 8, 11, 8], ['box', 30, 20, 14, 9, 14], ['bench', 17, 16, 18, 6, 7],
    ['sofa', 24, 14, 18, 6, 14], ['console', 28, 16, 16, 7, 8],
    ['box', 20, 1, 14, 9, 14], ['bench', 20, 5, 18, 6, 7],                         // upper-center
    ['planter', 29, 5, 8, 11, 8], ['box', 30, 1, 14, 9, 14],                       // ruang SUPPLY
    ['sink', 38, 17, 10, 8, 4], ['box', 32, 7, 14, 9, 14],                         // toilet
    ['cupboard', 48, 27, 6, 15, 20], ['box', 40, 4, 14, 9, 14], ['desk', 45, 27, 18, 7, 12],   // ruang generator
    ['planter', 47, 4, 8, 11, 8], ['sofa', 45, 20, 18, 6, 14], ['box', 47, 22, 14, 9, 14],
    ['sofa', 1, 27, 14, 6, 18], ['box', 1, 23, 14, 9, 14], ['bench', 11, 28, 18, 6, 7],        // lower-left (ruang 2)
    ['planter', 8, 21, 8, 11, 8],
    ['box', 25, 26, 14, 9, 14], ['planter', 16, 22, 8, 11, 8], ['cupboard', 19, 21, 20, 15, 6],// center-lower (ruang 1)
    ['desk', 22, 22, 22, 7, 12],
    ['box', 28, 27, 14, 9, 14], ['bench', 36, 28, 18, 6, 7], ['console', 28, 24, 8, 7, 16],    // lower-center-right
    ['box', 1, 47, 14, 9, 14], ['cupboard', 23, 48, 20, 15, 6], ['rubble', 1, 32, 12, 9, 12],  // gudang barat
    ['box', 22, 30, 14, 9, 14],
    ['box', 29, 30, 14, 9, 14], ['cupboard', 29, 48, 20, 15, 6], ['rubble', 48, 37, 12, 9, 12],// gudang timur
    ['box', 47, 47, 14, 9, 14],

    // --- pass 4: aula & ruang besar (bagian tengah) supaya tak terasa gudang kosong ---
    ['box', 17, 19, 14, 9, 14], ['cupboard', 23, 17, 20, 15, 6], ['planter', 14, 15, 8, 11, 8],// center hall
    ['desk', 11, 11, 22, 7, 12], ['box', 28, 15, 14, 9, 14], ['bench', 10, 13, 18, 6, 7],
    ['sofa', 26, 11, 18, 6, 14],
    ['stall', 37, 7, 10, 15, 2], ['box', 31, 8, 14, 9, 14],                        // toilet
    // planter(40,6) & bench(48,6) juga DIPINDAH turun ke ruang besar di bawah
    // dinding baru (baris 6 = tembok sejak revisi denah user 2026-07-29).
    ['box', 46, 23, 14, 9, 14], ['cupboard', 48, 24, 6, 15, 20], ['planter', 40, 8, 8, 11, 8], // ruang generator
    ['bench', 46, 8, 18, 6, 7],
    ['box', 7, 21, 14, 9, 14], ['cupboard', 6, 28, 20, 15, 6], ['desk', 3, 23, 22, 7, 12],     // lower-left (ruang 2)
    ['box', 16, 23, 14, 9, 14], ['sofa', 23, 27, 18, 6, 14],                       // center-lower (ruang 1)
    ['box', 28, 26, 14, 9, 14], ['planter', 31, 28, 8, 11, 8],                     // lower-center-right
];

export const s2FurnitureDbg = () => S2_FURNITURE;   // smoke test (kepadatan & tumpang tindih)
export const s2DoorsDbg = () => s2doors;            // smoke test (pintu terbangun sesuai denah)
// Semua sel yang DIPILIH TANGAN dari denah (spawn & barel). Diekspor supaya smoke
// bisa menjaga: tak satu pun jatuh di sel DINDING atau di MULUT PINTU — persis
// kelas bug yang muncul saat denah diubah (revisi baris 6, 2026-07-29).
export const s2SpawnDbg = () => ({
    wave1: S2_ROBOTS.map(([c, r]) => [c, r]),
    guards: S2_GUARDS.map(([, c, r]) => [c, r]),
    wave2: S2_WAVE2.map(([, c, r]) => [c, r]),
    barrels: S2_BARRELS.map(([c, r]) => [c, r]),
    crates: S2_CRATES.map(([c, r]) => [c, r]),
    doors: S2_DOORS,
});
let s2StaticBatch = [];                              // mesh perabot hasil penggabungan
export const s2StaticBatchDbg = () => s2StaticBatch; // smoke test (jumlah draw call perabot)

let s2doors = null;

// Lampu PER-RUANGAN — SELALU MENYALA (mekanisme "mati lampu" dihapus 2026-08-11).
// Rect ruangannya masih dipakai smoke test (sebaran peti per ruangan).
let s2Lamps = [];
export const s2LampsDbg = () => s2Lamps;
let s2HintT = 0, s2LiftT = 0;

// ===== STATE MACHINE ALUR STAGE 2 =====
let s2Phase = 'clear1';   // clear1 | goGen | collect | restore | installing | done
let s2GenPos = null;      // {x,z} dunia kotak berdiri generator
let s2LiftPos = null;     // {x,z} dunia pusat lift (peringatan)
let s2Marker = null, s2MarkerMat = null;   // marker kotak pulih generator
let s2Components = [];    // [{col,row,mx,mz,got,part,marker,mat}] — 3 komponen acak di rak
let s2CompGot = 0;
let s2Installed = 0;      // komponen yang SUDAH terpasang di minigame (tahan ABORT)
let s2GenArmed = true;    // pemicu kotak generator (harus MENJAUH dulu sesudah batal)
let s2DialogueCurrent = null;
let s2DialogueQueue = [];
let s2DialogueSeen = new Set();
let s2DialogueT = 0, s2DialogueChars = 0;
export const s2OcclusionDebug = () => occlusionDebug(S2_OCC);
export const s2Debug = () => ({
    occluders: occlusionDebug(S2_OCC),
    phase: s2Phase, comp: s2CompGot, installed: s2Installed, armed: s2GenArmed
});
export const s2ComponentsDbg = () => s2Components;   // smoke test (posisi komponen)
export const s2DialogueDebug = () => ({
    key: s2DialogueCurrent ? s2DialogueCurrent.key : null,
    speaker: s2DialogueCurrent ? s2DialogueCurrent.speaker : '',
    text: s2DialogueCurrent ? s2DialogueCurrent.text : '',
    chars: s2DialogueChars,
    shown: s2DialogueCurrent ? s2DialogueCurrent.text.slice(0, s2DialogueChars) : '',
    typing: !!s2DialogueCurrent && s2DialogueChars < s2DialogueCurrent.text.length,
    queued: s2DialogueQueue.map(line => line.key),
    seen: [...s2DialogueSeen],
});

// ROOT DUNIA STAGE 2 (2026-08-13, optimasi) — lihat catatan di stage 1: seluruh
// geometri stage berada di bawah satu Group yang didaftarkan ke
// campaignWorldRegistry, sementara PointLight tetap menempel di `scene` karena
// jumlah lampu terlihat menentukan varian shader.
export const S2_OCC = 'campaign-2';   // kunci set occluder (utility/occlusion.js)
let s2Walls = null;                   // dinding yang bisa memudar (wallFade.js)
export const s2WallsDbg = () => (s2Walls ? s2Walls.debug() : null);
let s2WorldRoot = null;
export const s2WorldRootDbg = () => s2WorldRoot;

const blockers = [];

function renderS2Dialogue() {
    if (!s2DialogueCurrent) { hideStageRadioDialogue(); return; }
    const line = s2DialogueCurrent;
    s2DialogueChars = Math.max(0, Math.min(line.text.length, s2DialogueChars | 0));
    showStageRadioDialogue(
        line.speaker,
        line.text.slice(0, s2DialogueChars),
        s2DialogueChars < line.text.length,
    );
}

function beginNextS2Dialogue() {
    s2DialogueCurrent = s2DialogueQueue.shift() || null;
    s2DialogueT = 0;
    s2DialogueChars = 0;
    renderS2Dialogue();
}

function queueS2Dialogue(key) {
    const line = S2_DIALOGUE[key];
    if (!line || s2DialogueSeen.has(key)) return false;
    s2DialogueSeen.add(key);
    s2DialogueQueue.push({ key, speaker: line.speaker, text: line.text });
    if (!s2DialogueCurrent) beginNextS2Dialogue();
    return true;
}

function resetS2Dialogue(clearSeen = false) {
    s2DialogueCurrent = null;
    s2DialogueQueue = [];
    s2DialogueT = 0;
    s2DialogueChars = 0;
    if (clearSeen) s2DialogueSeen = new Set();
    hideStageRadioDialogue();
}

function updateS2Dialogue(dt) {
    if (!s2DialogueCurrent) return;
    const dialogue = CFG.campaign.dialogue;
    const cps = Math.max(1, dialogue.cps);
    const holdSec = Math.max(0, dialogue.holdSec);
    s2DialogueT += dt;
    while (s2DialogueCurrent) {
        const typeSec = s2DialogueCurrent.text.length / cps;
        const lineSec = typeSec + holdSec;
        if (s2DialogueT < lineSec) {
            s2DialogueChars = Math.floor(s2DialogueT * cps);
            renderS2Dialogue();
            return;
        }
        s2DialogueChars = s2DialogueCurrent.text.length;
        renderS2Dialogue();
        s2DialogueT -= lineSec;
        beginNextS2Dialogue();
    }
}

function buildS2Grid() {
    s2grid = S2_MAP.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
}

export function s2Wall(c, r) {
    return c < 0 || r < 0 || c >= S2.G || r >= S2.ROWS || s2grid[r][c] === 1;
}

export function stage2Walk(x, z, r) {
    if (!s2grid) return false;
    const c0 = Math.floor((x - r - S2.x0) / S2.CELL), c1 = Math.floor((x + r - S2.x0) / S2.CELL);
    const r0 = Math.floor((z - r - S2.z0) / S2.CELL), r1 = Math.floor((z + r - S2.z0) / S2.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s2Wall(cc, rr)) return false;
    return true;
}

export function s2LOS(x1, z1, x2, z2) {
    if (!s2grid) return true;
    const dx = x2 - x1, dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (S2.CELL * 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + dx * t - S2.x0) / S2.CELL);
        const r = Math.floor((z1 + dz * t - S2.z0) / S2.CELL);
        if (s2Wall(c, r)) return false;
    }
    return true;
}

export function s2SegHitsWall(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 7));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + (x2 - x1) * t - S2.x0) / S2.CELL);
        const r = Math.floor((z1 + (z2 - z1) * t - S2.z0) / S2.CELL);
        if (s2Wall(c, r)) return true;
    }
    return false;
}

// Indeks spasial blocker (utils/collision.js) — alasan sama dengan Stage 1:
// resolve/groundHeight dipanggil player + tiap robot tiap frame.
const s2BlockerIdx = makeBlockerIndex(blockers, { cell: S2.CELL, x0: S2.x0, z0: S2.z0 });
export const s2BlockerIdxDbg = () => s2BlockerIdx.debug();   // smoke test
export const s2BlockersDbg = () => blockers;   // smoke test (indeks vs sapuan penuh)

export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, s2BlockerIdx.gather(pos.x, pos.z, radius));
}

export let s2Nav = null;

// MARKER "berdiri di sini" (amber menyala) — kotak pulih generator + 3 komponen.
function buildStandMarker(color = 0xffb03b) {
    const g = new THREE.Group();
    const fillMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fillMat);
    fill.rotation.x = -Math.PI / 2; fill.position.y = 0.14;
    g.add(fill);
    const barMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const [sx, sz, px, pz] of [[12, 1, 0, -6], [12, 1, 0, 6], [1, 12, -6, 0], [1, 12, 6, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), barMat);
        bar.position.set(px, 0.22, pz);
        g.add(bar);
    }
    return { group: g, fillMat };
}

// GENERATOR — instalasi POWER SUPPLY BESAR yang MEMENUHI sisi UTARA ruang
// kanan-atas (strip 'X' plan, c40-48): bank housing lebar (~116 u) + 3 unit
// turbin dengan INTI TEAL menyala menyembul di atas + pipa/konduit baja + kabinet
// kontrol + konsol aktivasi tengah + lampu bahaya. Origin group = kotak (44,1);
// -z = tembok utara, +z = ruangan (player). GIBS-2045: gunmetal/steel/panel/ink
// + aksen teal (PAL.tech) & amber/hazard secukupnya. Semua Lambert/Basic (warm,
// tanpa recompile); puncak tertinggi ~20 u (< plafon 22).
function buildGenerator() {
    const g = new THREE.Group();
    const WIDE = 116, HT = 15, DEPTH = 18, BACKZ = -6;
    const zc = BACKZ + DEPTH / 2;              // pusat z badan utama (~3)
    const frontZ = zc + (DEPTH - 4) / 2;       // muka SELATAN badan (~10)
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const panel = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const teal = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const amber = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const box = (mat, sx, sy, sz, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    const cyl = (mat, r, h, x, y, z, axis = 'y') => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat);
        m.position.set(x, y, z);
        if (axis === 'x') m.rotation.z = Math.PI / 2;         // rebah sepanjang sumbu-x
        else if (axis === 'z') m.rotation.x = Math.PI / 2;    // rebah sepanjang sumbu-z
        m.castShadow = true; g.add(m); return m;
    };

    // Fondasi + badan housing LEBAR + panel atap
    box(ink, WIDE, 2.6, DEPTH, 0, 1.3, zc);
    box(gun, WIDE, HT, DEPTH - 4, 0, 2.6 + HT / 2, zc);
    box(panel, WIDE + 2, 1.6, DEPTH - 1, 0, 2.6 + HT + 0.8, zc);
    // Rusuk vertikal di muka selatan (kesan padat & besar)
    for (let x = -WIDE / 2 + 10; x <= WIDE / 2 - 10; x += 18)
        box(ink, 1.8, HT - 4, 0.8, x, 2.6 + HT / 2, frontZ + 0.3);

    // 3 UNIT TURBIN (silinder) + INTI TEAL menyala menyembul di atas (tampak dari
    // kamera SW top-down) + cincin baja + strip teal di muka.
    for (const ux of [-40, 0, 40]) {
        cyl(steel, 9.5, HT + 1.5, ux, 2.6 + (HT + 1.5) / 2, zc - 0.5);      // rumah turbin
        cyl(gun, 10.4, 1.8, ux, 2.6 + HT + 1.5, zc - 0.5);                 // flens atas
        cyl(steel, 10.2, 1.3, ux, 2.6 + HT * 0.4, zc - 0.5);               // cincin tengah
        cyl(teal, 3.6, 5, ux, 2.6 + HT, zc - 0.5);                         // inti menyala (puncak ~20)
        box(teal, 2, HT - 5, 0.8, ux, 2.6 + HT / 2, frontZ - 0.2);         // strip teal muka
    }
    // Kabinet kontrol antar-unit (muka selatan) + layar teal + lampu bahaya
    for (const cx of [-20, 20]) {
        box(panel, 14, HT - 3, 3, cx, 2.6 + (HT - 3) / 2, frontZ - 1.5);
        box(teal, 9, 4, 0.8, cx, 2.6 + HT - 4.5, frontZ - 0.1);
        box(hazard, 3.2, 1.2, 0.8, cx, 4.6, frontZ - 0.1);
    }

    // Pipa baja horizontal (menyambung unit) di atas + di muka, + konduit tebal
    // ke tembok utara.
    cyl(steel, 1.6, WIDE - 8, 0, 2.6 + HT + 0.2, zc + 1, 'x');
    cyl(steel, 1.5, WIDE - 14, 0, 2.6 + HT * 0.5, frontZ + 0.1, 'x');
    for (const ux of [-30, 30]) cyl(steel, 2.2, DEPTH, ux, 2.6 + HT - 2, zc - DEPTH / 2, 'z');

    // KONSOL AKTIVASI tengah (menghadap player di selatan) + layar teal + strip
    // amber, lalu strip hazard memanjang di dasar muka (marka area mesin).
    box(gun, 18, 7.5, 4.5, 0, 2.6 + 3.75, frontZ + 2);
    box(teal, 12, 4, 0.7, 0, 8.5, frontZ + 4.2);
    box(amber, 13, 0.9, 0.7, 0, 5.4, frontZ + 4.2);
    box(hazard, WIDE - 8, 1, 0.9, 0, 1.4, frontZ + 3);
    return g;
}

export function buildWorld() {
    clearStageOccluders(S2_OCC);   // lihat catatan yang sama di stage 1
    buildS2Grid();
    const sizeX = S2.G * S2.CELL, sizeZ = S2.ROWS * S2.CELL;   // 700 x 700 unit
    const cx = S2.x0 + sizeX / 2, cz = S2.z0 + sizeZ / 2;
    s2WorldRoot = new THREE.Group();
    s2WorldRoot.name = 'campaign-stage2-floor2';
    scene.add(s2WorldRoot);

    // --- Lantai: satu bidang panel fasilitas TERANG (interior.js). LIFT = titik
    // selesai (bukan tangga turun berlubang), jadi lantai penuh tanpa lubang. ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        buildInteriorFloorMat(S2.G, S2.ROWS));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    s2WorldRoot.add(floor);

    buildCampaignCityscape(cx, cz, sizeX / 2, sizeZ / 2, { parent: s2WorldRoot });

    // --- Plafon (disembunyikan; top-down) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#282520'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#221f1a', '#2f2b25', '#1b1915'], 120, 1, 4);
    }, S2.G, S2.ROWS);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S2.H, cz);
    ceil.visible = false;
    s2WorldRoot.add(ceil);

    // --- Dinding: satu InstancedMesh (sel dinding bertetangga lantai saja) ---
    const wallCells = [];
    for (let r = 0; r < S2.ROWS; r++) {
        for (let c = 0; c < S2.G; c++) {
            if (s2grid[r][c] !== 1) continue;
            let nearFloor = false;
            for (let dr = -1; dr <= 1 && !nearFloor; dr++)
                for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                    if (!s2Wall(c + dc, r + dr)) nearFloor = true;
            if (nearFloor) wallCells.push([c, r]);
        }
    }
    // Dinding bisa memudar — lihat catatan yang sama di stage 1 (wallFade.js).
    {
        const _c = new THREE.Color();
        s2Walls = buildFadeableWalls({
            key: S2_OCC, parent: s2WorldRoot,
            cells: wallCells.map(([c, r]) => ({ c, r, ...s2Cell(c, r) })),
            cell: S2.CELL, wallH: S2.H, bodyMat: buildInteriorWallMat(),
            colorAt: () => _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04)),
        });
    }

    // --- Pintu geser ---
    s2doors = buildStageDoors(S2_DOORS, s2Cell, S2.CELL, S2.H, s2WorldRoot);

    // --- Furnitur KANTOR (dikumpulkan lalu DIGABUNG, lihat utils/meshBatch.js) ---
    const staticProps = [];
    const putModel = (mesh, x, z, sx, sy, sz, standable = true) => {
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        mesh.position.set(x, 0, z);
        staticProps.push(mesh);
    };
    const deskModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s2Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, true);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.5 + 2);
        chair.rotation.y = Math.PI;
        staticProps.push(chair);
    };
    const meetingModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s2Cell(c, r);
        putModel(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, true);
    };
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s2Cell(c, r), x = p.x + dx, z = p.z + dz;
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
        const n = Math.max(1, Math.min(6, Math.round(longLen / shortLen)));
        const unit = longLen / n;
        for (let i = 0; i < n; i++) {
            const off = -longLen / 2 + unit * (i + 0.5);
            const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
            cab.position.set(along ? x + off : x, 0, along ? z : z + off);
            staticProps.push(cab);
        }
    };
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s2Cell(c, r);
        putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };

    // Center hall (c9-29 r7-19): office + meja rapat + krat
    deskModel(22, 14, 20, 7, 10);
    // Meja rapat aula tengah DIHAPUS 2026-08-13 (permintaan user): setelah baris
    // 9 jadi barikade, meja ini berdiri sendirian di tengah jalur utama aula.
    propModel(buildFuturisticCrateMesh, 26, 15, 14, 9, 14);
    // Upper-center (c18-26 r1-5): meja rapat
    meetingModel(21, 3, 26, 7, 14);
    // W supply (c28-38 r1-5): rak + meja (supply diletakkan placeSupplies)
    cupboardModel(29, 3, 8, 15, 12);
    deskModel(36, 3, 16, 7, 10);
    // R toilet (c31-38 r7-17): bilik + wastafel
    propModel(buildFuturisticStallMesh, 33, 9, 2, 15, 10);
    propModel(buildFuturisticStallMesh, 33, 13, 2, 15, 10);
    propModel(buildFuturisticSinkMesh, 37, 16, 10, 8, 4);
    // Center-right kolom (dekat R): puing
    propModel(buildFuturisticRubbleMesh, 33, 8, 10, 9, 10);
    // Lower-left (room2, c1-12 r21-28): sofa
    propModel(buildFuturisticSofaMesh, 6, 22, 18, 6, 16);
    // Center-lower (room1, c14-26 r21-28): meja
    deskModel(22, 21, 18, 7, 10);
    // Lower-center-right (c28-38 r21-28): konsol + kabinet
    propModel(buildFuturisticConsoleMesh, 32, 22, 22, 7, 12);
    cupboardModel(35, 27, 8, 15, 10);
    // Left corridor (c1-7): kabinet
    cupboardModel(6, 16, 6, 15, 10);

    // Perabot TAMBAHAN (2026-07-26) — semua masuk `blockers` + ikut bake nav,
    // jadi pejal untuk player DAN robot.
    const FURN = {
        desk: deskModel, meeting: meetingModel, cupboard: cupboardModel,
        box: (c, r, sx, sy, sz) => propModel(buildFuturisticCrateMesh, c, r, sx, sy, sz),
        sofa: (c, r, sx, sy, sz) => propModel(buildFuturisticSofaMesh, c, r, sx, sy, sz),
        bench: (c, r, sx, sy, sz) => propModel(buildFuturisticBenchMesh, c, r, sx, sy, sz),
        planter: (c, r, sx, sy, sz) => propModel(buildFuturisticPlanterMesh, c, r, sx, sy, sz),
        console: (c, r, sx, sy, sz) => propModel(buildFuturisticConsoleMesh, c, r, sx, sy, sz),
        stall: (c, r, sx, sy, sz) => propModel(buildFuturisticStallMesh, c, r, sx, sy, sz),
        sink: (c, r, sx, sy, sz) => propModel(buildFuturisticSinkMesh, c, r, sx, sy, sz),
        rubble: (c, r, sx, sy, sz) => propModel(buildFuturisticRubbleMesh, c, r, sx, sy, sz),
    };
    for (const [kind, c, r, sx, sy, sz] of S2_FURNITURE) FURN[kind](c, r, sx, sy, sz);

    // === BARIKADE '*' + CELAH TEMBOK '/' (denah 2026-08-13) — keduanya dari
    // utility/barricade.js yang sama dengan Stage 1. Barikade = satu blocker
    // sel-penuh (ikut bake nav di akhir buildWorld, jadi robot memutar) berisi
    // tumpukan perabot berganti-ganti resep; celah = sisa tembok bergerigi TANPA
    // blocker (sel 14 unit, player radius 5 tak pernah menyentuh tepinya). ===
    s2BarricadeMix = [];
    for (let i = 0; i < S2_BARRICADES.length; i++) {
        const [c, r] = S2_BARRICADES[i];
        const p = s2Cell(c, r);
        blockers.push(barricadeBlocker(p.x, p.z, S2.CELL));
        s2BarricadeMix.push({ c, r, ...buildFurniturePile(staticProps, p.x, p.z, i,
            (g) => weldOccluder(S2_OCC, s2WorldRoot, g,
                { x: p.x, z: p.z, radius: S2.CELL / 2 + 2, top: BARRICADE_TOP })) });
    }
    for (const [c, r, dir] of S2_BREACHES) {
        const p = s2Cell(c, r);
        buildWallBreach(staticProps, p.x, p.z, dir, S2.CELL, S2.H);
    }

    // GENERATOR room (c40-48 r1-28): mesin generator (atas) + meja + bangku + konsol
    const genP = s2Cell(S2_GEN.c, S2_GEN.r);
    s2GenPos = { x: genP.x, z: genP.z };
    const genMachine = buildGenerator();
    const gm = s2Cell(S2_GEN.c, S2_GEN.r - 2);   // origin mesin 2 sel di UTARA kotak berdiri
    genMachine.position.set(gm.x, 0, gm.z);
    s2WorldRoot.add(genMachine);
    // Blocker LEBAR menutup instalasi (c40-48, sisi utara) — cocok dgn bentuk baru;
    // sisi selatan berhenti ~1 sel di UTARA kotak berdiri (44,3) supaya marker tetap
    // bisa dipijak. hx 56 tetap di dalam ruang (tembok c39/c49).
    blockers.push({
        x: gm.x, z: gm.z + 4, hx: 56, hz: 12, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(56, 12), top: 19, standable: false
    });
    // MARKER kotak pulih (amber) di kotak berdiri generator (tampil fase restore)
    const mk = buildStandMarker(0xffb03b);
    s2Marker = mk.group; s2MarkerMat = mk.fillMat;
    s2Marker.position.set(genP.x, 0, genP.z);
    s2Marker.visible = false;
    s2WorldRoot.add(s2Marker);
    // Lorong barat c40-41 (r13-28) SENGAJA dikosongkan: sejak barikade '*'
    // c42-43 memotong ruang ini, lorong itulah satu-satunya jalan dari pintu
    // c39 r27-28 menuju sisi timur, jadi perabotnya pindah semua ke c44-48.
    deskModel(45, 13, 18, 7, 10);
    propModel(buildFuturisticBenchMesh, 46, 15, 20, 6, 10);

    // === GUDANG (@) — 12 rak (kolom @) sebagai rak logam tinggi (blocker) ===
    for (const col of S2_SHELF_COLS) {
        const midR = (S2_SHELF_R0 + S2_SHELF_R1) / 2;
        const sz = (S2_SHELF_R1 - S2_SHELF_R0 + 1) * S2.CELL - 4;   // tinggi rak (z), sepanjang baris rak
        cupboardModel(col, midR, 8, 15, sz, 0, 0, false);
    }

    // --- Tangga RUSAK (entry): flight naik dari Lt.3 + PUING (jebol, tak bisa
    // dipakai keluar → player harus ke lift). Blocker solid spt biasa. ---
    const upF = stairwellUpFootprint(S2.x0 + S2.CELL, S2.z0 + S2.CELL);
    buildStairwellUp(S2.x0 + S2.CELL, S2.z0 + S2.CELL, S2.H);
    blockers.push({
        x: upF.x, z: upF.z, hx: upF.hx, hz: upF.hz,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(upF.hx, upF.hz), top: 10, standable: true
    });
    propModel(buildFuturisticRubbleMesh, 4, 4, 12, 9, 12);   // puing di kaki tangga (rusak)

    // === LIFT (titik selesai) di nook cols9-12 rows15-19 — SEPASANG lift (kiri-
    // kanan) MENGHADAP TIMUR, MENEMPEL tembok BARAT (col8) — PERSIS spt stage 1 & 3
    // (tetap di TITIK/nook yang sama, hanya orientasi diseragamkan). Terbuka
    // (player masuk & naik = selesai). Walkable (tanpa blocker). ===
    const liftWallX2 = S2.x0 + 9 * S2.CELL;          // muka timur tembok barat nook (col8)
    const liftZ2 = S2.z0 + 17.5 * S2.CELL;           // pusat z nook (rows 15-19)
    s2LiftPos = { x: liftWallX2 + 8, z: liftZ2 };    // titik peringatan (depan pintu) — spt stage 1
    const lift = buildLiftBank({ facing: 'east', H: S2.H, open: true, gap: 30 });
    lift.position.set(liftWallX2, 0, liftZ2);
    s2WorldRoot.add(lift);

    // --- Pencahayaan PER-RUANGAN: SELALU MENYALA (mekanisme "mati lampu" +
    // selubung hitam dihapus 2026-08-11, permintaan user) ---
    s2Lamps = [];
    const addLamp = (c, r, color, inten, dist, c0, r0, c1, r1) => {
        const p = s2Cell(c, r);
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(p.x, S2.H - 3, p.z);
        scene.add(L);
        registerStageLight('campaign-2', L);
        const lm = {
            L, base: inten,
            x0: S2.x0 + c0 * S2.CELL, x1: S2.x0 + (c1 + 1) * S2.CELL,
            z0: S2.z0 + r0 * S2.CELL, z1: S2.z0 + (r1 + 1) * S2.CELL
        };
        s2Lamps.push(lm);
        return lm;
    };
    addLamp(4, 4, 0xffd9a0, 0.9, 260, 1, 1, 7, 8);           // 0 T-area (start)
    addLamp(4, 14, 0xffc890, 0.85, 320, 1, 10, 7, 19);       // 1 left corridor
    addLamp(19, 12, 0xffe2b8, 0.9, 500, 8, 7, 30, 20);       // 2 center hall (+ nook lift)
    addLamp(22, 3, 0xffd9a0, 0.85, 300, 18, 1, 26, 5);       // 3 upper-center
    addLamp(33, 3, 0xbfe4ff, 0.9, 320, 28, 1, 38, 5);        // 4 W supply (dingin)
    addLamp(35, 12, 0xffe2b8, 0.85, 340, 31, 7, 38, 17);     // 5 R toilet
    // Ruang kanan-atas kini DUA ruangan (revisi denah user 2026-07-29): masing-
    // masing dapat lampunya sendiri seperti ruangan lain.
    addLamp(44, 3, 0xbfe4ff, 0.9, 320, 40, 1, 48, 5);        // 6 ruang GENERATOR (r1-5, dingin)
    addLamp(44, 14, 0xbfe4ff, 0.9, 560, 40, 7, 48, 28);      // 7 ruang besar bawah generator (dingin)
    addLamp(6, 24, 0xffc890, 0.85, 320, 1, 21, 12, 28);      // 8 lower-left (room2)
    addLamp(19, 24, 0xffe2b8, 0.85, 360, 14, 21, 26, 28);    // 9 center-lower (room1)
    addLamp(32, 24, 0xbfe4ff, 0.85, 360, 27, 21, 38, 28);    // 10 lower-center-right
    addLamp(14, 39, 0xffc07a, 0.9, 640, 1, 30, 24, 48);      // 11 warehouse W (gudang)
    addLamp(37, 39, 0xffc07a, 0.9, 640, 25, 30, 48, 48);     // 12 warehouse E

    // GABUNG perabot statis jadi belasan mesh (blockers/nav tak tersentuh).
    s2StaticBatch = addMergedStatic(s2WorldRoot, staticProps);
    s2BlockerIdx.rebuild();   // daftar blocker sudah final -> sebar ke kisi

    // Bake nav-grid TERAKHIR
    const half = S2.CELL / 2;
    s2Nav = makeNavGrid(S2.x0, S2.z0, half, S2.G * 2, S2.ROWS * 2, (x, z) => {
        if (!stage2Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });

    registerCampaignWorldRoot({
        key: 'campaign-2', root: s2WorldRoot, lightsKey: 'campaign-2',
        bounds: { x0: S2.x0 - sizeX, x1: S2.x0 + sizeX * 2, z0: S2.z0 - sizeZ, z1: S2.z0 + sizeZ * 2 },
        warmupViews: [{ x: cx, y: 0, z: cz }, s2Cell(S2_START.c, S2_START.r)],
    });
}

// ===== ROBOT GELOMBANG 1: 50 KELAS C tersebar di gedung kantor (bukan gudang) =====
// [44,6] dulu = tengah ruang kanan-atas; sel itu kini MULUT PINTU generator
// (revisi denah user 2026-07-29) -> digeser ke (44,4), DI DALAM ruang generator
// (di selatan mesin), supaya empat robot ini tidak spawn menumpuk di pintu.
const S2_ROBOTS = [
    [4, 12, 3], [12, 3, 3], [22, 3, 4], [33, 3, 3], [44, 4, 4], [44, 14, 3],
    [44, 24, 3], [20, 11, 5], [24, 15, 4], [35, 11, 3], [35, 15, 3],
    [20, 23, 5], [31, 23, 4], [6, 24, 3],
];
export const s2Wave1Count = S2_ROBOTS.reduce((a, s) => a + s[2], 0);   // 50
export function placeRobots() {
    for (const [c, r, n] of S2_ROBOTS) {
        const p = s2Cell(c, r);
        for (let k = 0; k < n; k++) {
            _v3.set(p.x + rand(-7, 7), 0, p.z + rand(-7, 7));
            resolve(_v3, 4, 0);
            if (!stage2Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            spawnCampaignRobot(_v3.x, _v3.z, 2);
        }
    }
    placeSupplies();
}

// ===== PENJAGA GUDANG: 20 (12 C / 8 B) — spawn saat generator didekati.
// KELAS A DIHAPUS 2026-07-26 (permintaan user): stage 2 hanya kelas C & B. =====
// Semua di gudang (rows 30-48); di lorong antar-rak / pita terbuka atas & bawah.
const S2_GUARDS = [
    ['C', 3, 31], ['C', 11, 31], ['C', 19, 31], ['C', 27, 31], ['C', 35, 31], ['C', 43, 31],
    ['C', 7, 47], ['C', 19, 47], ['C', 31, 47], ['C', 43, 47], ['C', 15, 39], ['C', 35, 39],
    ['B', 3, 39], ['B', 23, 39], ['B', 47, 39], ['B', 11, 46], ['B', 39, 46],
    ['B', 27, 39], ['B', 3, 46], ['B', 47, 31],
];
function spawnGuards() {
    for (const [cls, c, r] of S2_GUARDS) {
        const p = s2Cell(c, r);
        _v3.set(p.x + rand(-5, 5), 0, p.z + rand(-5, 5));
        resolve(_v3, 4, 0);
        if (!stage2Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
        spawnCampaignRobot(_v3.x, _v3.z, 2, cls);
    }
}

// ===== ROBOT GELOMBANG 2: 25 (10 C ruang1 / 10 B ruang2 / 5 B ruang3) —
// dulu ruang3 kelas A, diturunkan jadi B 2026-07-26 (permintaan user). =====
// ruang1 = center-lower (c14-26 r21-27), ruang2 = lower-left (c1-11 r21-28),
// ruang3 = mid-left corridor (c3-5 r12-17) — persis marka plan 1/2/3.
const S2_WAVE2 = [
    ['C', 18, 23], ['C', 18, 23], ['C', 22, 24], ['C', 22, 24], ['C', 16, 26],
    ['C', 16, 26], ['C', 24, 22], ['C', 24, 22], ['C', 20, 26], ['C', 20, 26],   // 10 C (ruang 1)
    ['B', 5, 24], ['B', 5, 24], ['B', 8, 25], ['B', 8, 25], ['B', 4, 25],
    ['B', 4, 25], ['B', 9, 24], ['B', 9, 24], ['B', 6, 26], ['B', 6, 26],         // 10 B (ruang 2)
    ['B', 4, 13], ['B', 4, 15], ['B', 4, 17], ['B', 4, 12], ['B', 4, 16],         // 5 B (ruang 3)
];
export function spawnWave2() {
    for (const [cls, c, r] of S2_WAVE2) {
        const p = s2Cell(c, r);
        _v3.set(p.x + rand(-6, 6), 0, p.z + rand(-6, 6));
        resolve(_v3, 4, 0);
        if (!stage2Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
        spawnCampaignRobot(_v3.x, _v3.z, 2, cls);
    }
}

// SUPPLY (ruang W plan, c28-38 r1-5): 4 paket amunisi + 2 medkit.
// Amunisi PER-SENJATA sejak 2026-07-26 — tiap paket menyebut senjatanya sendiri.
function placeSupplies() {
    const put = (w, c, r) => { const p = s2Cell(c, r); spawnAmmoDrop(p.x, p.z, w, 1e9); };
    const med = (c, r) => { const p = s2Cell(c, r); spawnMedkitDrop(p.x, p.z, 1e9); };
    put('pistol', 29, 2); put('rifle', 33, 2); put('shotgun', 37, 2); put('rifle', 31, 4);
    med(34, 4); med(30, 4);
}

// ===== BAREL PELEDAK (SECOND-IMPROVEMENT point 2): tong eksplosif di lorong
// gudang + ruang tempur bawah. Ditembak -> ledakan AoE + rambat antar barel.
// Pejal ke player saja (resolveBarrelBlock); di sel lantai terbuka (aisle). =====
const S2_BARRELS = [[15, 37], [23, 40], [31, 37], [20, 24], [33, 24]];
export function placeBarrels() {
    for (const [c, r] of S2_BARRELS) { const p = s2Cell(c, r); spawnBarrel(p.x, p.z, 0); }
}

// ===== PETI PERSEDIAAN (2026-07-26): ditembak/ditebas -> pecah, berpeluang
// berisi amunisi / uang / medkit. SETIAP RUANGAN kebagian minimal satu supaya
// player punya alasan masuk ke tiap ruangan. Pejal ke player saja (bukan nav).
// Di gudang ditaruh di LUAR pita rak (r33-44) supaya lorong rak tetap lapang. =====
// JUMLAH DIPERBANYAK 2026-07-26 (pass 2, permintaan user: "jangan cuma 1 per
// ruangan") — aula & gudang dapat 5-6 peti, ruangan kecil 2-3.
const S2_CRATES = [
    [6, 7], [3, 8],                // ruang tangga (start)
    [3, 13], [7, 18],              // koridor kiri
    [12, 8], [24, 12], [16, 17], [13, 14], [19, 19], [26, 8],   // center hall
    [25, 2], [25, 5],              // upper-center
    [34, 4], [37, 5],              // ruang SUPPLY
    [36, 11], [32, 17],            // toilet
    [42, 4], [46, 4],              // ruang GENERATOR tertutup (r1-5; revisi denah user 2026-07-29)
    [42, 8], [46, 20], [40, 7], [48, 8], [40, 21],              // ruang besar di bawah generator
    [10, 26], [12, 27], [2, 27],   // lower-left (ruang 2)
    [18, 26], [26, 23], [15, 28],  // center-lower (ruang 1)
    [30, 26], [38, 22], [29, 28],  // lower-center-right
    [3, 31], [19, 31], [11, 47], [2, 48], [21, 30], [21, 48],   // gudang barat
    [27, 31], [43, 31], [35, 47], [26, 48], [46, 48], [48, 33], // gudang timur
];
export const s2CrateCount = S2_CRATES.length;   // smoke test
export function placeCrates() {
    for (const [c, r] of S2_CRATES) { const p = s2Cell(c, r); spawnCrate(p.x, p.z, 0); }
}

// Pilih 3 rak memegang komponen. Tiap komponen di UJUNG PALING DALAM rak (baris
// TERBAWAH `S2_SHELF_R1` — paling jauh dari pintu masuk gudang di KANAN-ATAS),
// di sel TIMUR rak (tempat berdiri). 1 rak ACAK per ZONA kiri/tengah/kanan supaya
// komponen tersebar selebar gudang → player HARUS menyusuri seluruh gudang &
// berhadapan dengan semua robot penjaga dulu (2026-07-21, permintaan user).
function pickComponents() {
    // buang marker lama
    for (const c of s2Components) if (c.marker) c.marker.parent?.remove(c.marker);   // marker kini anak root dunia stage
    s2Components = []; s2CompGot = 0;
    const zones = [
        S2_SHELF_COLS.slice(0, 4),    // kiri  (c1,5,9,13) — terjauh dari pintu
        S2_SHELF_COLS.slice(4, 8),    // tengah (c17,21,25,29)
        S2_SHELF_COLS.slice(8, 12),   // kanan (c33,37,41,45) — sisi pintu masuk
    ];
    // Tiap zona memegang SATU benda bernama (REPAIR_PARTS) — benda inilah yang
    // nanti punya papan minigame-nya sendiri saat generator dipasang.
    zones.forEach((zone, zi) => {
        const col = zone[Math.floor(rand(0, zone.length))];
        const row = S2_SHELF_R1;   // ujung paling DALAM rak (baris terbawah)
        const mp = s2Cell(col + 1, row);   // sel TIMUR rak (tempat player berdiri)
        const mk = buildStandMarker(0x39d0ff);   // marker komponen (teal terang)
        mk.group.position.set(mp.x, 0, mp.z);
        s2WorldRoot.add(mk.group);
        s2Components.push({
            col, row, mx: mp.x, mz: mp.z, got: false,
            part: REPAIR_PARTS[zi % REPAIR_PARTS.length],
            marker: mk.group, mat: mk.fillMat
        });
    });
}

export const stage2Scene = {
    id: 'campaign-2',
    lightsKey: 'campaign-2',

    // Kamera KHUSUS stage 2 (2026-07-22, permintaan user): memandang dari TIMUR
    // LAUT (NE) ke BARAT DAYA (SW) — x dibalik dari default barat daya. Tinggi &
    // jarak horizontal sama (pitch/zoom tetap), hanya azimuth berputar. renderer
    // `applySceneCamOffset` menerapkannya + memutakhirkan basis layar (WASD/radar).
    camOffset: { x: 70.7, y: 116, z: -70.7 },

    enter() {
        saveCampaignStage(2);
        resetStageOccluders(S2_OCC);   // barikade kembali opak
        // Buang robot stage 1 yang tersisa (silent)
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 1) { disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1); }
        }
        placeRobots();            // GELOMBANG 1 (50 kelas C) + supply
        resetBarrels(); placeBarrels();   // barel peledak (bersihkan barel stage lain dulu)
        resetCrates(); placeCrates();     // peti persediaan (isi loot) di tiap ruangan
        applyLightPreset(scene, 'indoor');
        enterCityEnv();
        // Reset ALUR
        s2Phase = 'clear1'; s2Installed = 0; s2GenArmed = true;
        setCinematicActive(false);
        resetS2Dialogue(true);
        hideDownloadBar();
        // marker generator + komponen bersih
        if (s2Marker) s2Marker.visible = false;
        for (const c of s2Components) if (c.marker) c.marker.parent?.remove(c.marker);   // marker kini anak root dunia stage
        s2Components = []; s2CompGot = 0;
        s2HintT = Date.now(); s2LiftT = 0;
        const sp = s2Cell(S2_START.c, S2_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);
        player.vy = 0; player.onGround = true;
        hideStageMsg();
        queueS2Dialogue('stageStart');
        updateUI();
    },

    // Modal repair memanggil exit() sebelum resumeScene mengembalikan stage ini.
    // Sembunyikan panel, tetapi pertahankan posisi ketik + antrean agar dialog
    // yang belum tuntas dapat lanjut setelah modal ditutup.
    exit() { hideStageRadioDialogue(); },

    // Mati di stage 2 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Ganjaran kill campaign: LOOT/uang (bukan skor langsung). Lihat common.js.
    awardKill: campaignAwardKill,

    updateMode(dt) {
        updateStageOccluders(S2_OCC, dt);
        updateStageDoors(s2doors, dt);
        updateS2Dialogue(dt);
        const s2 = CFG.campaign.stage2;
        const px = camera.position.x, pz = camera.position.z;
        const n = countStageRobots(2);

        if (s2Phase === 'clear1') {
            if (n === 0) {
                s2Phase = 'goGen';
                showStageMsg('All robots destroyed — the generator can be restored. Find it and get it running.', 4600);
            }
        } else if (s2Phase === 'goGen') {
            // Dekati generator → butuh 3 komponen + spawn penjaga gudang + pilih komponen
            if (s2GenPos && Math.hypot(px - s2GenPos.x, pz - s2GenPos.z) < s2.genApproachRange) {
                s2Phase = 'collect';
                spawnGuards();
                pickComponents();
                queueS2Dialogue('inspectGenerator');
            }
        } else if (s2Phase === 'collect') {
            // Ambil komponen: berdiri di TIMUR rak bermarker
            for (const cmp of s2Components) {
                if (cmp.got) continue;
                if (Math.hypot(px - cmp.mx, pz - cmp.mz) < s2.componentRange) {
                    cmp.got = true; s2CompGot++;
                    if (cmp.marker) cmp.marker.visible = false;
                    showPickup(`${cmp.part.label} recovered (${s2CompGot}/3)`, '#39d0ff');
                }
            }
            if (s2CompGot >= 3) {
                s2Phase = 'restore';
                if (s2Marker) s2Marker.visible = true;
                showStageMsg('All 3 components recovered — return to the generator and install them.', 5000);
            }
        } else if (s2Phase === 'restore') {
            // Injak kotak bermarker → MINIGAME PERBAIKAN (3 papan, satu per
            // komponen; 2026-07-29, MENGGANTIKAN bar progress restoreSec).
            // Pemicu harus "terisi" ulang dgn MENJAUH sekali (spt terminal stage
            // 1), supaya ABORT tak langsung membuka modal lagi di tempat.
            const near = s2GenPos && Math.hypot(px - s2GenPos.x, pz - s2GenPos.z) < s2.genRestoreRange;
            if (!near) s2GenArmed = true;
            else if (s2GenArmed) {
                s2GenArmed = false;
                s2Phase = 'installing';
                clearMoveTarget();
                keys.w = keys.a = keys.s = keys.d = false;
                if (s2Marker) s2Marker.visible = false;
                beginRepairMinigame({
                    head: 'GENERATOR — FIELD REPAIR',
                    startIndex: s2Installed,          // kemajuan bertahan setelah ABORT
                    onProgress: (k) => { s2Installed = k; },
                    onSuccess: () => {
                        // Selesai: lift BERDAYA. Bala bantuan datang tapi player TIDAK
                        // wajib membunuh semua (2026-07-21, permintaan user) — 'done'.
                        s2Phase = 'done';
                        s2Installed = REPAIR_PARTS.length;
                        spawnWave2();
                        queueS2Dialogue('generatorRestored');
                    },
                    onFail: () => {
                        s2Phase = 'restore';
                        if (s2Marker) s2Marker.visible = true;
                        showStageMsg(`Repair aborted — ${s2Installed}/3 installed. Step away, then back onto the marker to carry on.`, 3800);
                    },
                });
            }
        }

        // Denyut marker generator (fase restore)
        if (s2MarkerMat && s2Marker && s2Marker.visible)
            s2MarkerMat.opacity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(Date.now() * 0.004));
        // Denyut marker komponen (fase collect)
        for (const cmp of s2Components) if (cmp.marker && cmp.marker.visible)
            cmp.mat.opacity = 0.24 + 0.18 * (0.5 + 0.5 * Math.sin(Date.now() * 0.005 + cmp.col));

        // LIFT: peringatan "belum berdaya" (sebelum generator dipulihkan)
        if (s2LiftPos && Math.hypot(px - s2LiftPos.x, pz - s2LiftPos.z) < s2.liftRange
            && s2Phase !== 'done' && Date.now() - s2LiftT > 4200) {
            s2LiftT = Date.now();
            if (!s2DialogueSeen.has('liftDead')) queueS2Dialogue('liftDead');
            else showStageMsg('The elevator has no power — restore the generator first.', 2600);
        }
    },

    // Dinding + furnitur + trigger LIFT (fase 'done' → transisi stage 3).
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage2Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, propClearance(), feetY);      // perabot: radius lebih ramping (lihat propClearance)
        // Pintu TERKUNCI/RUSAK memblok PLAYER juga (bugfix 2026-08-13, laporan
        // user: pintu berlampu merah bisa ditembus). Stage 2 dulu tak punya pintu
        // terkunci sama sekali sehingga hook ini tak pernah dipasang — begitu
        // denah baru menambahkan pintu RUSAK c6-7 r9, robot & peluru terhalang
        // tapi player berjalan menembusnya. `lockedOnly` seperti Stage 1: pintu
        // biasa tak ikut memblok karena player selalu membukanya lebih dulu.
        resolveDoors(s2doors, pos, player.radius, true);
        resolveBarrelBlock(pos, player.radius);   // barel peledak pejal ke player
        resolveCrateBlock(pos, player.radius);    // peti persediaan pejal ke player
        slideWalk(stage2Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S2.x0 + S2_LIFT.c0 * S2.CELL
            && pos.x <= S2.x0 + (S2_LIFT.c1 + 1) * S2.CELL
            && pos.z >= S2.z0 + S2_LIFT.r0 * S2.CELL
            && pos.z <= S2.z0 + (S2_LIFT.r1 + 1) * S2.CELL
            && s2Phase === 'done') {
            beginStageTransition(stage3Scene);
        }
    },

    groundHeight(x, z, feetY) {
        return blockersGroundHeight(x, z, feetY, s2BlockerIdx.gather(x, z, 2, false));
    },

    bulletBlocked(b) {
        return (b.mesh.position.y < S2.H
            && s2SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z))
            || doorClampShot(s2doors, b);
    },

    blastBlocked(x0, z0, x1, z1, y) { return doorBlocksShot(s2doors, x0, z0, x1, z1, y); },

    grenadeCollide(g, oldGX, oldGZ) {
        if (!stage2Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        if (g.mesh.position.y > S2.H - NADE_R) {
            g.mesh.position.y = S2.H - NADE_R;
            if (g.vy > 0) g.vy = -g.vy * 0.3;
        }
    },

    robotAI(z, dt, step) {
        return campaignRobotAI(z, dt, step, {
            walkable: stage2Walk, resolve, nav: s2Nav,
            los: (x1, z1, x2, z2) => s2LOS(x1, z1, x2, z2)
                && !doorBlocksShot(s2doors, x1, z1, x2, z2, 8),
            pathWalkable: (x, z, r) => doorsWalkable(s2doors, x, z, r),
            doorBlock: (pos, r) => resolveDoors(s2doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, {
            walkable: stage2Walk, resolve, doorBlock: (pos, r) => resolveDoors(s2doors, pos, r)
        });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        const n = countStageRobots(2);
        switch (s2Phase) {
            case 'clear1': return `FLOOR 2 — Robots: ${n} | Destroy ALL robots to power the generator`;
            case 'goGen': return 'FLOOR 2 — Find the generator and begin repairs';
            case 'collect': return `FLOOR 2 — Recover generator components: ${s2CompGot}/3 (storage warehouse)`;
            case 'restore': return `FLOOR 2 — Step on the marker at the generator to fit the components (${s2Installed}/3 installed)`;
            case 'installing': return `FLOOR 2 — Fitting components... ${s2Installed}/3`;
            default: return 'FLOOR 2 — Generator restored! Board the elevator to escape';
        }
    },

    // Landmark radar: objektif saat ini (generator saat clear1/goGen/restore/
    // installing; komponen saat collect; lift saat done).
    radarLandmarks(plot) {
        let tx, tz, col;
        if (s2Phase === 'collect') {
            // arahkan ke komponen terdekat yang belum diambil
            let best = null, bd = 1e9;
            for (const cmp of s2Components) if (!cmp.got) {
                const d = Math.hypot(cmp.mx - camera.position.x, cmp.mz - camera.position.z);
                if (d < bd) { bd = d; best = cmp; }
            }
            if (best) { tx = best.mx; tz = best.mz; col = '#39d0ff'; }
        } else if (s2Phase === 'done') {
            tx = s2LiftPos.x; tz = s2LiftPos.z; col = '#2eff6a';
        } else {
            tx = s2GenPos.x; tz = s2GenPos.z; col = s2Phase === 'clear1' ? '#ff5040' : '#7fe3ff';
        }
        if (tx != null) plot(tx - camera.position.x, tz - camera.position.z, col, 5, true);
    },
};
