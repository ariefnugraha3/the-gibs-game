// SCENE: Campaign STAGE 1 — "Gedung Terbengkalai (Lantai 2)", perkantoran indoor.
// DENAH DIROMBAK TOTAL 2026-07-20 mengikuti PLAN RESMI user (stage1-v2.csv):
// grid 50x50 (sel 2 m). Legenda plan: '#'=dinding, '-'=pintu geser, 'T'=TANGGA
// (titik MASUK = titik SELESAI, kiri-atas), 'W'=RUANG SUPPLY (4 ammo + 2 medkit,
// kanan-atas), 'R'=TOILET/KAMAR MANDI, 'L'=LIFT (rusak), 'C'=SUPER KOMPUTER
// (kanan-bawah, ruang TERKUNCI), 'X'=titik spawn GELOMBANG-2 (kiri-bawah).
// buildS1Grid mem-parse string denah `S1_MAP` langsung (dinding/pintu PERSIS
// sesuai plan). Konektivitas (2044 sel lantai, 1 region) diverifikasi BFS.
//
// ALUR GAMEPLAY (state machine `s1Phase`):
//   1. 'clear1'  : spawn di TANGGA. 50 robot KELAS C tersebar — BUNUH SEMUA →
//                  pintu ruang komputer TERKUNCI (merah) TERBUKA (hijau).
//   2. 'download': datangi SUPER KOMPUTER (kanan-bawah), MENEMPEL → mulai unduh.
//   3. 'downloading': UNDUH 10 dtk (bar progress; gerak DIBEKUKAN via
//                  cinematicActive). Selesai → 20 robot tambahan (SEMUA kelas C
//                  sejak 2026-07-26) + HORDE spawn di ruang bertanda X.
//   4. 'clear2'  : BUNUH SEMUA robot gelombang-2 lalu KEMBALI ke TANGGA → selesai
//                  (transisi ke stage 2). LIFT rusak: peringatan saat didekati.

import { CFG, CAMP_M } from '../../../core/config.js';
import { player, _v3, keys, setCinematicActive } from '../../../core/state.js';
import { scene, camera } from '../../../core/renderer.js';
import { makeTexture, speckle } from '../../../utils/textures.js';
import { rand } from '../../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { addMergedStatic } from '../../../utils/meshBatch.js';
import { setS1FlickerLight } from '../../../world/decor.js';
import { applyLightPreset, registerStageLight, precompileStageLightSets } from '../../../world/lighting.js';
import { hideStageMsg, showStageMsg, showDownloadBar, setDownloadProgress, hideDownloadBar } from '../../../core/dom.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { NADE_R } from '../../../entities/grenades.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../entities/drops.js';
import { buildFuturisticBenchMesh } from '../../../entities/futuristicBench.js';
import { buildFuturisticPlanterMesh } from '../../../entities/futuristicPlanter.js';
import { buildFuturisticDeskMesh } from '../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../../entities/futuristicCupboard.js';
import { buildFuturisticMeetingTableMesh } from '../../../entities/futuristicMeetingTable.js';
import { buildFuturisticCrateMesh } from '../../../entities/futuristicCrate.js';
import { buildFuturisticSofaMesh } from '../../../entities/futuristicSofa.js';
import { buildFuturisticStallMesh } from '../../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../../entities/futuristicSink.js';
import { buildFuturisticConsoleMesh } from '../../../entities/futuristicConsole.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, updateRoomLamps, resetRoomLamps, campaignAwardKill, spawnSwarm } from '../utility/common.js';
import { spawnBarrel, resolveBarrelBlock, resetBarrels } from '../../../entities/barrels.js';
import { spawnCrate, resolveCrateBlock, resetCrates } from '../../../entities/crates.js';
import { buildInteriorWallMat, buildInteriorFloorMat } from '../utility/interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors, doorBlocksShot, doorClampShot, setDoorLocked } from '../utility/doors.js';
import { buildStairwellUp, stairwellUpFootprint } from '../utility/stairwell.js';
import { buildLiftBank, liftBankFootprint } from '../utility/lift.js';
import { buildCampaignCityscape, enterCityEnv } from '../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
import { stage2Scene, buildWorld as buildStage2World } from './stage2.js';   // robotnya kini ditempatkan stage2.enter sendiri
import { ensureWorld as ensureStage3World } from './stage3.js';   // (circular aman: dipanggil DI DALAM enter)
import { ensureWorld as ensureStage4World } from './stage4.js';

// Grid 50 kolom x 50 baris (sel 2 m; PERSEGI 50x50 sesuai plan resmi user).
// Gedung ~26 km dari jalan raya (stage 2) — kedua dunia hidup berdampingan di
// satu scene, dipisah jarak. x0/z0 = pojok barat-laut grid (memusatkan di x≈30000).
export const S1 = {
    G: 50, CELL: 2 * CAMP_M, H: 22,       // tinggi plafon ~3.1 m
    x0: 30000 - 25 * 2 * CAMP_M,          // pojok barat-laut grid (kiri-atas denah)
    z0: -25 * 2 * CAMP_M
};
export let s1grid = null;                 // [row][col] 1=dinding, 0=lantai
export const s1Cell = (c, r) => ({ x: S1.x0 + (c + 0.5) * S1.CELL, z: S1.z0 + (r + 0.5) * S1.CELL });
export const S1_START = { c: 4, r: 5 };   // spawn di ruang TANGGA (hijau, kiri-atas)
// Trigger SELESAI = ruang TANGGA (T, sel c1-5 r1-3). Titik masuk & selesai SAMA;
// trigger hanya aktif di fase 'done' (semua objektif tuntas) → transisi stage 2.
export const S1_FINISH = { c0: 1, r0: 1, c1: 5, r1: 3 };
// SUPER KOMPUTER: `S1_COMP` = sel BERDIRI (tepat di SELATAN komputer) tempat
// player harus MENEMPEL untuk memicu unduh; komputernya sendiri 1 sel di UTARA.
export const S1_COMP = { c: 44, r: 43 };  // sel berdiri (selatan komputer) — trigger + marker
export const S1_LIFT = { c: 9, r: 18 };   // LIFT rusak (nook kiri-tengah)

// DENAH RESMI (stage1-v2.csv). 50x50. '#'=dinding, '.'=lantai (pintu '-'=lantai).
// JANGAN ubah tanpa update S1_DOORS + robot/furnitur + tes ulang (smoke test).
const S1_MAP = [
    '##################################################',   // 0
    '#.......#....................#.........#.........#',   // 1
    '#.......#....................#.........#.........#',   // 2
    '#...................#........#.........#.........#',   // 3
    '#...................#........#.........#.........#',   // 4
    '#.......#...........#........#.........#.........#',   // 5
    '#.......#...........#........#.........#.........#',   // 6
    '###..########...##############.........#.........#',   // 7
    '#.......#............#.......#.........#.........#',   // 8
    '#.......#............#.......#.........#.........#',   // 9
    '#.......#............#.......#.........#.........#',   // 10
    '#............................#.........#.........#',   // 11
    '#............................#.........#.........#',   // 12
    '#.......#............#.......#.........#.........#',   // 13
    '#.......#............#.......#.........#.........#',   // 14
    '#.......#............#.......#.........#.........#',   // 15
    '#.......#............#.......#.........#.........#',   // 16
    '###..####......#.....###############..###..#######',   // 17
    '#.......#......#.....#.......#...................#',   // 18
    '#.......#......#.....#.......#...................#',   // 19
    '#.......#####..#..####.......#...................#',   // 20
    '#.......#......#.....#.......#...................#',   // 21
    '#.......#......#.....#.......#...................#',   // 22
    '#.......#......#.................................#',   // 23
    '#.......#......#.................................#',   // 24
    '#.......#......#.....#.......#...................#',   // 25
    '#.......#......#.....#.......#...................#',   // 26
    '#.......#......#.....#.......#...................#',   // 27
    '#.......#......#.....#.......#...................#',   // 28
    '#################################..###############',   // 29
    '#................................................#',   // 30  (nub c39 dibuka: pintu jadi 3 sel, cegah dinding-ganda)
    '#................................................#',   // 31
    '#................................................#',   // 32
    '#......................................#.........#',   // 33
    '#......................................#.........#',   // 34
    '#......................................#.........#',   // 35
    '#......................................#.........#',   // 36
    '#......................................#.........#',   // 37
    '#......................................#.........#',   // 38
    '###..#############################################',   // 39
    '#......................................#.........#',   // 40
    '#......................................#.........#',   // 41
    '#......................................#.........#',   // 42
    '#................................................#',   // 43
    '#................................................#',   // 44
    '#................................................#',   // 45
    '#......................................#.........#',   // 46
    '#......................................#.........#',   // 47
    '#......................................#.........#',   // 48
    '##################################################',   // 49
];

// PINTU geser otomatis di SEMUA bukaan '-' plan resmi (17 pintu; grouping dari
// scratchpad parse). dir 'ew'=dinding VERTIKAL (panel sumbu-z) / 'ns'=HORIZONTAL.
// Pintu TERAKHIR (ruang komputer) TERKUNCI (merah) sampai semua robot tumbang.
const S1_DOORS = [
    { c0: 20, r0: 1, c1: 20, r1: 2, dir: 'ew' },     // conference W <-> conference E
    { c0: 8, r0: 3, c1: 8, r1: 4, dir: 'ew' },       // start (A) <-> conference W
    { c0: 3, r0: 7, c1: 4, r1: 7, dir: 'ns' },       // start (A) <-> office W
    { c0: 13, r0: 7, c1: 15, r1: 7, dir: 'ns' },     // conference W <-> central hall
    { c0: 8, r0: 11, c1: 8, r1: 12, dir: 'ew' },     // office W <-> central hall
    { c0: 21, r0: 11, c1: 21, r1: 12, dir: 'ew' },   // central hall <-> toilet approach
    { c0: 3, r0: 17, c1: 4, r1: 17, dir: 'ns' },     // office W <-> office SW
    { c0: 36, r0: 17, c1: 37, r1: 17, dir: 'ns' },   // supply annex <-> east-mid
    { c0: 41, r0: 17, c1: 42, r1: 17, dir: 'ns' },   // east-1 <-> east-mid
    { c0: 13, r0: 20, c1: 14, r1: 20, dir: 'ns' },   // central <-> small room 1
    { c0: 16, r0: 20, c1: 17, r1: 20, dir: 'ns' },   // central <-> small room 2
    { c0: 21, r0: 23, c1: 21, r1: 24, dir: 'ew' },   // office SE-mid <-> corridor
    { c0: 29, r0: 23, c1: 29, r1: 24, dir: 'ew' },   // corridor <-> east-mid
    { c0: 33, r0: 29, c1: 34, r1: 29, dir: 'ns' },   // upper block <-> lower hall
    { c0: 39, r0: 30, c1: 39, r1: 32, dir: 'ew' },   // lower hall <-> east lower (3 sel: r30-32)
    { c0: 3, r0: 39, c1: 4, r1: 39, dir: 'ns' },     // lower hall <-> X hall
    { c0: 39, r0: 43, c1: 39, r1: 45, dir: 'ew', locked: true },   // === RUANG KOMPUTER (TERKUNCI) ===
];
// PERABOT TAMBAHAN per-ruangan (2026-07-26): [kind, c, r, sx, sy, sz].
// Ditempel dinding/sudut supaya ruangan terasa dipakai TANPA menyumbat jalur —
// smoke test memverifikasi mulut pintu tetap lapang & nav tetap terhubung.
const S1_FURNITURE = [
    // ruang TANGGA (start)
    ['cupboard', 7, 5, 6, 15, 20], ['bench', 5, 6, 16, 6, 6],
    // conference W
    ['cupboard', 17, 1, 34, 15, 8], ['planter', 10, 1, 8, 11, 8], ['console', 19, 5, 10, 7, 12],
    // conference E
    ['cupboard', 28, 3, 6, 15, 26], ['planter', 22, 5, 8, 11, 8], ['bench', 24, 6, 20, 6, 7],
    // supply room W
    ['cupboard', 30, 5, 6, 15, 30], ['desk', 35, 9, 22, 7, 12], ['box', 33, 15, 14, 9, 14],
    // east-1 (open office)
    ['cupboard', 40, 3, 6, 15, 30], ['meeting', 45, 14, 34, 7, 20], ['planter', 41, 8, 8, 11, 8],
    // office W
    ['cupboard', 1, 12, 6, 15, 30], ['sofa', 6, 15, 18, 6, 14], ['planter', 1, 9, 8, 11, 8],
    // central hall
    ['cupboard', 20, 16, 6, 15, 30], ['desk', 11, 13, 22, 7, 12],
    ['box', 15, 9, 14, 9, 14], ['bench', 12, 18, 18, 6, 7],
    // toilet
    ['stall', 26, 14, 2, 15, 20], ['sink', 22, 13, 10, 8, 4],
    // office SW
    ['cupboard', 1, 23, 6, 15, 26], ['desk', 6, 22, 20, 7, 12], ['planter', 2, 27, 8, 11, 8],
    // office SE-mid
    ['cupboard', 22, 21, 6, 15, 26], ['meeting', 25, 27, 34, 7, 18], ['box', 28, 19, 12, 9, 12],
    // big east-mid
    ['cupboard', 30, 21, 6, 15, 34], ['desk', 41, 22, 22, 7, 12],
    ['box', 35, 19, 14, 9, 14], ['planter', 47, 19, 8, 11, 8], ['sofa', 46, 24, 18, 6, 14],
    // small rooms
    ['cupboard', 9, 26, 6, 15, 20], ['box', 13, 22, 12, 9, 12],
    ['cupboard', 16, 26, 6, 15, 20], ['desk', 17, 22, 18, 7, 10],
    // big lower hall
    ['cupboard', 1, 33, 6, 15, 40], ['meeting', 26, 36, 40, 7, 20],
    ['box', 12, 31, 14, 9, 14], ['box', 34, 36, 14, 9, 14],
    ['planter', 36, 31, 8, 11, 8], ['sofa', 2, 35, 18, 6, 14],
    // east lower
    ['cupboard', 48, 33, 6, 15, 30], ['box', 41, 36, 14, 9, 14],
    // X hall (arena gelombang-2 — tetap lapang, hanya pinggirnya diisi)
    ['cupboard', 1, 44, 6, 15, 36], ['box', 24, 41, 14, 9, 14],
    ['box', 31, 47, 14, 9, 14], ['bench', 20, 45, 20, 6, 7],
    // ruang super komputer
    ['cupboard', 41, 45, 6, 15, 24], ['box', 46, 47, 12, 9, 12],

    // === PEMADATAN LANJUTAN (2026-07-26 pass 2, permintaan user: ruangan masih
    // terasa kosong). Sama aturannya: menempel dinding/sudut, menjauhi mulut
    // pintu, titik spawn, marker objektif & jalur objektif. ===
    // ruang TANGGA (start)
    ['bench', 1, 4, 7, 6, 18],
    // conference W
    ['console', 18, 6, 16, 7, 8], ['planter', 12, 1, 8, 11, 8], ['bench', 16, 2, 18, 6, 7],
    // conference E
    ['planter', 21, 6, 8, 11, 8], ['bench', 28, 5, 7, 6, 18],
    // supply room W
    ['box', 30, 1, 14, 9, 14], ['cupboard', 37, 1, 20, 15, 6], ['box', 30, 15, 14, 9, 14],
    ['bench', 33, 1, 18, 6, 7], ['planter', 33, 16, 8, 11, 8],
    // east-1 (open office)
    ['desk', 41, 1, 22, 7, 12], ['cupboard', 47, 16, 20, 15, 6], ['planter', 48, 2, 8, 11, 8],
    ['console', 44, 1, 16, 7, 8], ['box', 40, 14, 14, 9, 14],
    // office W
    ['desk', 2, 14, 22, 7, 12], ['cupboard', 5, 13, 20, 15, 6],
    // central hall
    ['desk', 10, 8, 22, 7, 12], ['cupboard', 16, 17, 6, 15, 20], ['box', 17, 10, 14, 9, 14],
    ['planter', 11, 11, 8, 11, 8], ['bench', 13, 17, 18, 6, 7],
    // toilet
    ['stall', 22, 8, 10, 15, 2], ['sink', 28, 8, 10, 8, 4], ['stall', 22, 16, 10, 15, 2],
    // office SW
    ['desk', 6, 20, 22, 7, 12], ['cupboard', 2, 26, 20, 15, 6], ['box', 2, 21, 14, 9, 14],
    ['planter', 6, 25, 8, 11, 8],
    // office SE-mid
    ['desk', 23, 18, 22, 7, 12], ['cupboard', 27, 18, 20, 15, 6], ['planter', 27, 28, 8, 11, 8],
    // big east-mid
    ['desk', 31, 18, 22, 7, 12], ['cupboard', 47, 18, 20, 15, 6], ['box', 47, 21, 14, 9, 14],
    ['sofa', 47, 25, 18, 6, 14], ['planter', 32, 26, 8, 11, 8], ['desk', 32, 22, 22, 7, 12],
    ['bench', 44, 27, 18, 6, 7],
    // small rooms
    ['desk', 13, 27, 22, 7, 12], ['cupboard', 13, 23, 20, 15, 6],
    ['cupboard', 17, 28, 20, 15, 6], ['desk', 17, 23, 22, 7, 12],
    // big lower hall
    ['desk', 5, 30, 22, 7, 12], ['cupboard', 34, 38, 20, 15, 6], ['box', 8, 30, 14, 9, 14],
    ['sofa', 30, 30, 18, 6, 14], ['planter', 9, 38, 8, 11, 8], ['meeting', 37, 35, 34, 7, 18],
    ['bench', 36, 32, 18, 6, 7], ['desk', 3, 36, 22, 7, 12], ['box', 3, 33, 14, 9, 14],
    // east lower
    ['desk', 47, 30, 22, 7, 12], ['cupboard', 40, 37, 6, 15, 20], ['box', 42, 30, 14, 9, 14],
    // X hall (arena gelombang-2 — tetap lapang di tengah, hanya pinggirnya)
    ['box', 1, 47, 14, 9, 14], ['cupboard', 37, 40, 20, 15, 6], ['planter', 37, 48, 8, 11, 8],
    ['box', 34, 40, 14, 9, 14], ['bench', 34, 48, 18, 6, 7], ['box', 7, 40, 14, 9, 14],
    // ruang super komputer
    ['console', 48, 41, 8, 7, 16], ['box', 43, 40, 14, 9, 14],

    // --- pass 3: sisa sudut & pinggir ruangan besar yang masih melompong ---
    ['planter', 2, 4, 8, 11, 8],                                                   // ruang tangga
    ['cupboard', 31, 16, 20, 15, 6], ['box', 30, 7, 14, 9, 14],                    // supply room W
    ['desk', 37, 3, 22, 7, 12], ['box', 37, 14, 14, 9, 14],
    ['cupboard', 48, 15, 6, 15, 20], ['box', 40, 5, 14, 9, 14],                    // east-1
    ['bench', 48, 5, 7, 6, 18], ['desk', 42, 2, 22, 7, 12],
    ['box', 2, 11, 14, 9, 14],                                                     // office W
    ['cupboard', 14, 17, 6, 15, 20], ['sofa', 18, 17, 18, 6, 14],                  // central hall
    ['box', 18, 11, 14, 9, 14], ['desk', 15, 10, 22, 7, 12],
    ['stall', 28, 16, 10, 15, 2], ['sink', 23, 8, 10, 8, 4],                       // toilet
    ['sofa', 2, 24, 18, 6, 14], ['box', 6, 23, 14, 9, 14],                         // office SW
    ['box', 22, 19, 14, 9, 14], ['bench', 28, 27, 7, 6, 18],                       // office SE-mid
    ['cupboard', 48, 19, 6, 15, 20], ['box', 30, 27, 14, 9, 14],                   // big east-mid
    ['desk', 33, 18, 22, 7, 12], ['planter', 45, 18, 8, 11, 8], ['box', 47, 22, 14, 9, 14],
    ['box', 11, 28, 14, 9, 14], ['planter', 9, 21, 8, 11, 8],                      // small room 1
    ['box', 16, 24, 14, 9, 14],                                                    // small room 2
    ['cupboard', 38, 37, 6, 15, 20], ['box', 1, 36, 14, 9, 14],                    // big lower hall
    ['desk', 10, 30, 22, 7, 12], ['planter', 29, 30, 8, 11, 8], ['box', 14, 30, 14, 9, 14],
    ['bench', 14, 38, 18, 6, 7], ['sofa', 24, 30, 18, 6, 14], ['box', 20, 30, 14, 9, 14],
    ['planter', 48, 38, 8, 11, 8], ['box', 43, 30, 14, 9, 14], ['bench', 40, 35, 7, 6, 18],   // east lower
    ['box', 35, 40, 14, 9, 14], ['planter', 35, 48, 8, 11, 8], ['box', 8, 40, 14, 9, 14],     // X hall (pinggir)
    ['bench', 31, 40, 18, 6, 7], ['box', 27, 40, 14, 9, 14], ['cupboard', 27, 48, 20, 15, 6],
    ['planter', 48, 47, 8, 11, 8],                                                 // ruang super komputer
    // X hall lagi: KRAT PENUTUP di pinggir arena (tengah tetap lapang untuk horde)
    ['box', 29, 40, 14, 9, 14], ['cupboard', 29, 48, 20, 15, 6], ['planter', 25, 40, 8, 11, 8],
    ['box', 18, 40, 14, 9, 14], ['bench', 21, 48, 18, 6, 7], ['sofa', 2, 46, 18, 6, 14],
    ['box', 36, 47, 14, 9, 14],
];

export const s1FurnitureDbg = () => S1_FURNITURE;   // smoke test (kepadatan & tumpang tindih)
let s1StaticBatch = [];                              // mesh perabot hasil penggabungan
export const s1StaticBatchDbg = () => s1StaticBatch; // smoke test (jumlah draw call perabot)

let s1doors = null;
let s1compDoor = null;   // ref pintu ruang komputer (dibuka saat semua robot tumbang)
export const s1CompDoorDbg = () => s1compDoor;   // smoke test (status locked)

// Lampu PER-RUANGAN (mati saat mulai, menyala saat pintunya dibuka / dimasuki).
let s1Lamps = [];
export const s1LampsDbg = () => s1Lamps;   // smoke test
let s1HallLamp = null;                      // lampu central hall — berkedip SETELAH menyala
// Papan EXIT (dekat TANGGA): MERAH selagi objektif belum tuntas, HIJAU saat 'done'.
let s1ExitSign = null, s1ExitLight = null, s1ExitOpen = false;
let s1HintT = 0;                            // rate-limit pesan "belum boleh keluar"
let s1LiftT = 0;                            // rate-limit peringatan lift rusak

// ===== STATE MACHINE ALUR STAGE 1 =====
let s1Phase = 'clear1';   // clear1 | download | downloading | clear2 | done
let s1DlT = 0;            // timer unduh (dtk)
let s1CompPos = null;     // {x,z} dunia sel BERDIRI (selatan komputer) — trigger unduh
let s1LiftPos = null;     // {x,z} dunia lift
let s1Marker = null, s1MarkerMat = null;   // marker lantai "berdiri di sini" + material (denyut)
export const s1Debug = () => ({ phase: s1Phase, dlT: s1DlT });   // smoke test

const blockers = [];   // furnitur/undakan/lift/rak pejal {x,z,hx,hz,ax*,az*,top,standable}
let built = false;

function buildS1Grid() {
    s1grid = S1_MAP.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
}

// Sel dinding? (di luar grid = dinding)
export function s1Wall(c, r) {
    return c < 0 || r < 0 || c >= S1.G || r >= S1.G || s1grid[r][c] === 1;
}

// Lingkaran (x,z,r) sepenuhnya di lantai gedung? (walkable stage 1)
export function stage1Walk(x, z, r) {
    if (!s1grid) return false;
    const c0 = Math.floor((x - r - S1.x0) / S1.CELL), c1 = Math.floor((x + r - S1.x0) / S1.CELL);
    const r0 = Math.floor((z - r - S1.z0) / S1.CELL), r1 = Math.floor((z + r - S1.z0) / S1.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s1Wall(cc, rr)) return false;
    return true;
}

// Garis pandang bebas dinding? (sampling grid tiap ~setengah sel) — aktivasi
// robot stage 1: bangun hanya bila MELIHAT player.
export function s1LOS(x1, z1, x2, z2) {
    if (!s1grid) return true;
    const dx = x2 - x1, dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (S1.CELL * 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + dx * t - S1.x0) / S1.CELL);
        const r = Math.floor((z1 + dz * t - S1.z0) / S1.CELL);
        if (s1Wall(c, r)) return false;
    }
    return true;
}

// Ruas peluru menabrak dinding? (sampling tiap ~7 unit; peluru cepat = 2 sel/frame)
export function s1SegHitsWall(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 7));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + (x2 - x1) * t - S1.x0) / S1.CELL);
        const r = Math.floor((z1 + (z2 - z1) * t - S1.z0) / S1.CELL);
        if (s1Wall(c, r)) return true;
    }
    return false;
}

// Penghalang pejal stage 1 = furnitur + undakan + lift + rak (balok axis-aligned)
export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

// Nav-grid pathfinder (resolusi setengah sel; di-bake di AKHIR buildWorld)
export let s1Nav = null;

// MARKER "berdiri di sini" (2026-07-20): kotak lantai amber menyala (aksen
// human/player) — ditaruh di sel tepat SELATAN super komputer supaya player tahu
// harus ke situ untuk memicu unduh. Material fill di-return utk animasi denyut.
function buildStandMarker() {
    const g = new THREE.Group();
    const AMBER = 0xffb03b;
    const fillMat = new THREE.MeshBasicMaterial({
        color: AMBER, transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.14;
    g.add(fill);
    const barMat = new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false });
    for (const [sx, sz, px, pz] of [[12, 1, 0, -6], [12, 1, 0, 6], [1, 12, -6, 0], [1, 12, 6, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), barMat);
        bar.position.set(px, 0.22, pz);
        g.add(bar);
    }
    return { group: g, fillMat };
}

// Bangun SEMUA dunia campaign (stage 1 sendiri + stage 2/3/4) SEKALI (guard
// `built`). Dipakai stage1.enter() DAN cutscene intro (intro.js).
export function ensureWorld() {
    if (built) return;
    built = true;
    buildStage2World();   // STAGE 2 (denah, jauh)
    buildWorld();         // STAGE 1
    ensureStage3World();  // pre-build stage 3 & 4 juga (warmup compile up-front)
    ensureStage4World();
    // Lampu stage non-aktif dimatikan (world/lighting.js) supaya shader tak
    // melooping 57 point light per fragmen; jumlah light jadi berbeda per stage,
    // maka program tiap konfigurasi DIKOMPILASI SEKARANG (masih di layar loading)
    // agar transisi stage tetap tanpa hitch.
    precompileStageLightSets(scene);
}

export function buildWorld() {
    buildS1Grid();
    const size = S1.G * S1.CELL;                      // 700 unit = 100 m
    const cx = S1.x0 + size / 2, cz = S1.z0 + size / 2;

    // --- Lantai: satu bidang panel fasilitas TERANG futuristik (interior.js;
    // 1 ubin/sel). TANGGA di stage 1 = TANGGA NAIK (titik masuk = titik selesai),
    // jadi TANPA lubang lantai. ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        buildInteriorFloorMat(S1.G, S1.G));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // Latar KOTA JAKARTA mengelilingi gedung (dekor, tanpa blocker)
    buildCampaignCityscape(cx, cz, size / 2, size / 2);

    // --- Plafon: panel akustik gelap (DISEMBUNYIKAN — kamera top-down di atas;
    // dinding tetap berdiri jadi interior terlihat. Fisika granat memantul tak berubah). ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#2a2723'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#24211c', '#312d27', '#1d1b17'], 120, 1, 4);
        g.strokeStyle = 'rgba(12,11,9,0.7)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.moveTo(0, 0); g.lineTo(0, h); g.stroke();
    }, S1.G, S1.G);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S1.H, cz);
    ceil.visible = false;
    scene.add(ceil);

    // --- Dinding: satu InstancedMesh (hanya sel dinding yang bertetangga lantai) ---
    const wallCells = [];
    for (let r = 0; r < S1.G; r++) {
        for (let c = 0; c < S1.G; c++) {
            if (s1grid[r][c] !== 1) continue;
            let nearFloor = false;                     // dinding terkubur di-skip (hemat)
            for (let dr = -1; dr <= 1 && !nearFloor; dr++)
                for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                    if (!s1Wall(c + dc, r + dr)) nearFloor = true;
            if (nearFloor) wallCells.push([c, r]);
        }
    }
    const wallMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(S1.CELL, S1.H, S1.CELL),
        buildInteriorWallMat(),
        wallCells.length);
    {
        const _m = new THREE.Matrix4(), _c = new THREE.Color();
        wallCells.forEach(([c, r], i) => {
            const p = s1Cell(c, r);
            _m.setPosition(p.x, S1.H / 2, p.z);
            wallMesh.setMatrixAt(i, _m);
            _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04));   // jitter kusam per panel
            wallMesh.setColorAt(i, _c);
        });
        if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    }
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;
    scene.add(wallMesh);

    // --- Pintu geser otomatis (ruang tertutup; pintu KOMPUTER dibuat terkunci) ---
    s1doors = buildStageDoors(S1_DOORS, s1Cell, S1.CELL, S1.H);
    s1compDoor = s1doors.find(d => d.locked) || null;

    // --- Furnitur KANTOR: model (entities/futuristic*.js) + blocker footprint ---
    // PERABOT TIDAK LANGSUNG masuk scene: dikumpulkan lalu DIGABUNG jadi belasan
    // mesh oleh addMergedStatic (2026-07-26 — lihat utils/meshBatch.js). Piksel
    // sama persis; yang hilang cuma ribuan draw call + update matriks per frame.
    const staticProps = [];
    const putModel = (mesh, x, z, sx, sy, sz, standable = true) => {
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        mesh.position.set(x, 0, z);
        staticProps.push(mesh);
    };
    // MEJA kerja: model desk + satu KURSI (dekorasi, TANPA blocker) di sisi depan.
    const deskModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s1Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, true);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.5 + 2);   // majukan KELUAR dari meja
        chair.rotation.y = Math.PI;                     // jok menghadap meja
        staticProps.push(chair);
    };
    // MEJA RAPAT (ruang konferensi/meeting)
    const meetingModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s1Cell(c, r);
        putModel(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, true);
    };
    // RAK/LEMARI: deret lemari sepanjang sisi terpanjang (1 blocker footprint penuh)
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r), x = p.x + dx, z = p.z + dz;
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
        const n = Math.max(1, Math.min(5, Math.round(longLen / shortLen)));
        const unit = longLen / n;
        for (let i = 0; i < n; i++) {
            const off = -longLen / 2 + unit * (i + 0.5);
            const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
            cab.position.set(along ? x + off : x, 0, along ? z : z + off);
            staticProps.push(cab);
        }
    };
    // PROP MODEL generik (crate/sofa/stall/sink) dari cell + blocker footprint.
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r);
        putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };
    // MONITOR di ATAS meja (dekorasi, TANPA blocker) di y=top.
    const monitorModel = (c, r, sx, sy, sz, dx, dz, top) => {
        const p = s1Cell(c, r);
        const m = buildFuturisticConsoleMesh(sx, sy, sz);
        m.position.set(p.x + dx, top, p.z + dz);
        staticProps.push(m);
    };

    // Conference W (c9-19 r1-6): meja rapat panjang
    meetingModel(13, 3, 70, 7, 26);
    // Conference E annex (c21-28 r1-6): meja rapat kecil
    meetingModel(24, 3, 56, 7, 26);
    // Supply room W (c30-38 r1-16): rak logam (drops ditaruh placeSupplies)
    cupboardModel(34, 2, 60, 15, 8);       // rak dinding utara
    cupboardModel(31, 12, 8, 15, 44);      // rak dinding barat
    cupboardModel(37, 12, 8, 15, 44);      // rak dinding timur
    // East-1 (c40-48 r1-16): open office
    deskModel(43, 4, 26, 7, 12);
    deskModel(45, 11, 26, 7, 12);
    cupboardModel(47, 7, 8, 16, 28);
    monitorModel(43, 4, 6, 4, 1.5, 0, -3, 7);
    // Office W (c1-7 r8-16): dua meja + terminal
    deskModel(3, 10, 24, 7, 12);
    deskModel(4, 14, 22, 7, 12);
    monitorModel(3, 10, 6, 4, 1.5, 0, -3, 7);
    // Central hall (c9-20 r8-19): open office cubicle + kabinet
    deskModel(13, 10, 24, 7, 12);
    deskModel(17, 13, 24, 7, 12);
    cupboardModel(18, 9, 8, 15, 20);
    // Toilet R (c22-28 r8-16): bilik (sekat) + wastafel
    propModel(buildFuturisticStallMesh, 24, 11, 2, 15, 56);
    propModel(buildFuturisticSinkMesh, 27, 10, 10, 8, 4);
    // Office SW (c1-7 r18-28): sofa + meja (break/office)
    propModel(buildFuturisticSofaMesh, 3, 20, 20, 6, 18);
    deskModel(4, 25, 16, 7, 12);
    // Office SE-mid (c22-28 r18-28): meja + kabinet
    deskModel(25, 20, 24, 7, 12);
    cupboardModel(27, 25, 8, 16, 28);
    // Big east-mid (c30-48 r18-28): open office + meja rapat
    deskModel(33, 20, 24, 7, 12);
    deskModel(44, 20, 24, 7, 12);
    meetingModel(38, 25, 56, 7, 26);
    // Small rooms (c9-14 & c16-20 r21-28)
    deskModel(11, 24, 22, 7, 12);
    cupboardModel(18, 24, 8, 15, 20);
    // Big lower hall (c1-38 r30-38): deret meja + meja rapat
    deskModel(6, 33, 24, 7, 12);
    deskModel(14, 33, 24, 7, 12);
    deskModel(22, 33, 24, 7, 12);
    deskModel(30, 33, 24, 7, 12);
    meetingModel(10, 36, 56, 7, 26);
    // East lower (c40-48 r30-38)
    deskModel(44, 33, 24, 7, 12);
    // X hall (c1-38 r40-48): arena gelombang-2 — sebagian besar TERBUKA (2 krat cover)
    propModel(buildFuturisticCrateMesh, 8, 42, 16, 9, 16);
    propModel(buildFuturisticCrateMesh, 14, 46, 16, 9, 16);

    // === PERABOT TAMBAHAN (2026-07-26, permintaan user: ruangan terasa kosong) ===
    // Dipadatkan lewat tabel S1_FURNITURE, tapi SEMUA ditempel ke dinding/sudut:
    // koridor, mulut pintu, titik spawn robot & marker objektif dibiarkan bersih.
    // Semua masuk `blockers` (pejal ke player DAN robot) dan ikut bake nav di
    // akhir buildWorld, jadi robot memutarinya alih-alih menembusnya.
    const FURN = {
        desk: deskModel, meeting: meetingModel, cupboard: cupboardModel,
        box: (c, r, sx, sy, sz) => propModel(buildFuturisticCrateMesh, c, r, sx, sy, sz),
        sofa: (c, r, sx, sy, sz) => propModel(buildFuturisticSofaMesh, c, r, sx, sy, sz),
        bench: (c, r, sx, sy, sz) => propModel(buildFuturisticBenchMesh, c, r, sx, sy, sz),
        planter: (c, r, sx, sy, sz) => propModel(buildFuturisticPlanterMesh, c, r, sx, sy, sz),
        console: (c, r, sx, sy, sz) => propModel(buildFuturisticConsoleMesh, c, r, sx, sy, sz),
        stall: (c, r, sx, sy, sz) => propModel(buildFuturisticStallMesh, c, r, sx, sy, sz),
        sink: (c, r, sx, sy, sz) => propModel(buildFuturisticSinkMesh, c, r, sx, sy, sz),
    };
    for (const [kind, c, r, sx, sy, sz] of S1_FURNITURE) FURN[kind](c, r, sx, sy, sz);

    // === SUPER KOMPUTER (ruang C, c40-48 r40-48): rak server + terminal unduh.
    // Player HARUS MENEMPEL di sel SELATAN komputer (`S1_COMP`, ber-marker) —
    // komputernya 1 sel di UTARA supaya player mendekat & menghadap ke utara. ===
    cupboardModel(47, 43, 8, 16, 84, 0, 0, false);   // rak server dinding timur
    cupboardModel(44, 48, 84, 16, 8, 0, 0, false);   // rak server dinding selatan
    const standP = s1Cell(S1_COMP.c, S1_COMP.r);     // sel BERDIRI (selatan) = trigger unduh
    s1CompPos = { x: standP.x, z: standP.z };
    const termP = s1Cell(S1_COMP.c, S1_COMP.r - 1);  // KOMPUTER 1 sel di utara
    putModel(buildFuturisticConsoleMesh(16, 11, 10), termP.x, termP.z, 16, 11, 10, false);
    monitorModel(S1_COMP.c, S1_COMP.r - 1, 8, 5, 2, 0, 0, 11);   // monitor besar di atas komputer
    // MARKER "berdiri di sini" tepat di sel selatan komputer
    const mk = buildStandMarker();
    s1Marker = mk.group; s1MarkerMat = mk.fillMat;
    s1Marker.position.set(standP.x, 0, standP.z);
    scene.add(s1Marker);

    // === LIFT rusak (nook c9-10 r15-19): SEPASANG lift (kiri-kanan) MENGHADAP
    // TIMUR, MENEMPEL tembok BARAT (col8) — entity lift.js (RUSAK = pintu tertutup,
    // solid). Badan lift di col9; player berdiri di col10 (timur). ===
    const liftWallX = S1.x0 + 9 * S1.CELL;           // muka timur tembok barat alcove
    const liftZ = S1.z0 + 17.5 * S1.CELL;            // pusat z alcove (rows15-19)
    const LIFT_GAP1 = 36;
    s1LiftPos = { x: liftWallX + 8, z: liftZ };      // titik peringatan (di depan pintu)
    const lift = buildLiftBank({ facing: 'east', H: S1.H, open: false, gap: LIFT_GAP1 });
    lift.position.set(liftWallX, 0, liftZ);
    scene.add(lift);
    const lf1 = liftBankFootprint('east', LIFT_GAP1);
    blockers.push({
        x: liftWallX + lf1.cx, z: liftZ + lf1.cz, hx: lf1.hx, hz: lf1.hz,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(lf1.hx, lf1.hz), top: S1.H, standable: false
    });

    // --- Tangga BORDES NAIK (dari Lt.3) di ruang TANGGA (kiri-atas). Titik masuk
    // = titik selesai; blocker footprint solid (nav/kolisi/BFS tak berubah). ---
    const upF = stairwellUpFootprint(S1.x0 + S1.CELL, S1.z0 + S1.CELL);
    buildStairwellUp(S1.x0 + S1.CELL, S1.z0 + S1.CELL, S1.H);
    blockers.push({
        x: upF.x, z: upF.z, hx: upF.hx, hz: upF.hz,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(upF.hx, upF.hz), top: 10, standable: true
    });

    // Papan EXIT melayang di atas landing TANGGA. MERAH = belum boleh keluar,
    // HIJAU saat fase 'done' (semua objektif tuntas) → tangga aktif.
    const fp = s1Cell(4, 2);
    s1ExitOpen = false;
    s1ExitSign = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xff4a3c, toneMapped: false }));
    s1ExitSign.position.set(fp.x, S1.H - 6, fp.z - 3);
    scene.add(s1ExitSign);
    s1ExitLight = new THREE.PointLight(0xff5040, 0.85, 200, 2);
    s1ExitLight.position.set(fp.x, S1.H - 8, fp.z);
    scene.add(s1ExitLight);
    registerStageLight('campaign-1', s1ExitLight);

    // --- Pencahayaan PER-RUANGAN: titik lampu TETAP (dibuat saat build → shader
    // compile sekali; hanya intensity yang dianimasikan). Mulai MATI, menyala saat
    // pintunya dibuka / rect dimasuki (updateRoomLamps). SELUBUNG hitam per rect. ---
    s1Lamps = [];
    const addLamp = (c, r, color, inten, dist, c0, r0, c1, r1) => {
        const p = s1Cell(c, r);
        const L = new THREE.PointLight(color, 0, dist, 2);
        L.position.set(p.x, S1.H - 3, p.z);
        scene.add(L);
        registerStageLight('campaign-1', L);
        const lm = {
            L, base: inten, on: false, k: 0,
            x0: S1.x0 + c0 * S1.CELL, x1: S1.x0 + (c1 + 1) * S1.CELL,
            z0: S1.z0 + r0 * S1.CELL, z1: S1.z0 + (r1 + 1) * S1.CELL
        };
        if (!s1Lamps.some(o => o.shroud && o.x0 === lm.x0 && o.z0 === lm.z0 && o.x1 === lm.x1 && o.z1 === lm.z1)) {
            const sh = new THREE.Mesh(
                new THREE.BoxGeometry(lm.x1 - lm.x0 - 1, S1.H - 0.6, lm.z1 - lm.z0 - 1),
                new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 1 }));
            sh.position.set((lm.x0 + lm.x1) / 2, (S1.H - 0.6) / 2 + 0.2, (lm.z0 + lm.z1) / 2);
            scene.add(sh);
            lm.shroud = sh;
        }
        s1Lamps.push(lm);
        return lm;
    };
    addLamp(3, 4, 0xffd9a0, 0.9, 240, 1, 1, 7, 6);       // 0 start (A)
    addLamp(14, 3, 0xffe2b8, 0.95, 300, 9, 1, 19, 6);    // 1 conference W
    addLamp(24, 3, 0xffd9a0, 0.85, 260, 21, 1, 28, 6);   // 2 conference E
    addLamp(34, 8, 0xffe2b8, 0.9, 360, 30, 1, 38, 16);   // 3 supply room W
    addLamp(44, 8, 0xbfe4ff, 0.85, 360, 40, 1, 48, 16);  // 4 east-1 (dingin)
    addLamp(4, 12, 0xffd9a0, 0.85, 240, 1, 8, 7, 16);    // 5 office W
    s1HallLamp = addLamp(14, 12, 0xffe2b8, 0.9, 360, 9, 8, 20, 19);   // 6 central+lift (FLICKER)
    addLamp(25, 12, 0xbfe4ff, 0.8, 260, 22, 8, 28, 16);  // 7 toilet (dingin)
    addLamp(4, 23, 0xffd9a0, 0.8, 280, 1, 18, 7, 28);    // 8 office SW
    addLamp(25, 23, 0xffc890, 0.85, 320, 22, 18, 28, 28);// 9 office SE-mid
    addLamp(39, 23, 0xffe2b8, 0.9, 420, 30, 18, 48, 28); // 10 big east-mid
    addLamp(11, 25, 0xffc890, 0.75, 240, 9, 21, 14, 28); // 11 small room 1
    addLamp(18, 25, 0xffc890, 0.75, 240, 16, 21, 20, 28);// 12 small room 2
    addLamp(19, 34, 0xffe2b8, 0.95, 620, 1, 30, 38, 38); // 13 big lower hall
    addLamp(44, 34, 0xffd9a0, 0.85, 320, 40, 30, 48, 38);// 14 east lower
    addLamp(19, 44, 0xffc07a, 0.95, 620, 1, 40, 38, 48); // 15 X hall (gelombang-2)
    addLamp(44, 44, 0xbfe4ff, 0.85, 320, 40, 40, 48, 48);// 16 super komputer (dingin)
    // Tautkan PINTU -> lampu ruangan (menyala saat pintunya mulai terbuka)
    for (const lm of s1Lamps) lm.doors = s1doors.filter(d =>
        d.cx >= lm.x0 - 1.5 * S1.CELL && d.cx <= lm.x1 + 1.5 * S1.CELL &&
        d.cz >= lm.z0 - 1.5 * S1.CELL && d.cz <= lm.z1 + 1.5 * S1.CELL);

    // GABUNG semua perabot statis jadi belasan mesh (draw call + update matriks
    // turun drastis; blockers/nav TIDAK tersentuh karena berasal dari tabel).
    s1StaticBatch = addMergedStatic(scene, staticProps);

    // Bake nav-grid TERAKHIR (semua blockers terisi): dinding dari grid, furnitur
    // dari resolve. Radius sampel 3 (< badan 3.5) agar celah sempit tetap lewat-able.
    const half = S1.CELL / 2;
    s1Nav = makeNavGrid(S1.x0, S1.z0, half, S1.G * 2, S1.G * 2, (x, z) => {
        if (!stage1Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });
}

// ===== ROBOT GELOMBANG 1: 50 robot KELAS C tersebar (21 spot, tag stage 1) =====
const S1_ROBOTS = [
    [11, 4, 3], [23, 4, 3], [34, 12, 3], [44, 5, 2], [44, 12, 2],   // conference/supply/east-1
    [4, 11, 3], [13, 11, 3], [16, 14, 2], [25, 11, 2],              // office W / central / toilet
    [4, 20, 2], [4, 25, 2], [25, 20, 2], [25, 25, 2],               // office SW / SE-mid
    [34, 22, 3], [44, 24, 2], [11, 26, 3], [18, 26, 3],             // east-mid / small rooms
    [10, 34, 2], [20, 34, 2], [30, 34, 2], [44, 34, 2],             // lower halls
];
export const s1Wave1Count = S1_ROBOTS.reduce((a, s) => a + s[2], 0);   // 50 (smoke test)
export function placeRobots() {
    for (const [c, r, n] of S1_ROBOTS) {
        const p = s1Cell(c, r);
        for (let k = 0; k < n; k++) {
            _v3.set(p.x + rand(-7, 7), 0, p.z + rand(-7, 7));
            resolve(_v3, 4, 0);
            if (!stage1Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            spawnCampaignRobot(_v3.x, _v3.z, 1);
        }
    }
}

// ===== ROBOT GELOMBANG 2: 20 tambahan di ruang X (kiri-bawah). Dipicu SETELAH
// unduh data selesai (updateMode → spawnWave2). SEMUA KELAS C (2026-07-26,
// permintaan user: stage 1 hanya berisi robot kelas C — penembak B/A baru
// muncul mulai stage 2). =====
const S1_WAVE2 = [
    ['C', 4, 41], ['C', 4, 45], ['C', 8, 46], ['C', 12, 41], ['C', 12, 45],
    ['C', 16, 42], ['C', 16, 46], ['C', 6, 43], ['C', 14, 43], ['C', 10, 41],
    ['C', 3, 43], ['C', 10, 47], ['C', 17, 44], ['C', 13, 47], ['C', 5, 47],
    ['C', 9, 44], ['C', 15, 41], ['C', 17, 47], ['C', 11, 43], ['C', 8, 42],
];
export function spawnWave2() {
    for (const [cls, c, r] of S1_WAVE2) {
        const p = s1Cell(c, r);
        _v3.set(p.x + rand(-6, 6), 0, p.z + rand(-6, 6));
        resolve(_v3, 4, 0);
        if (!stage1Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
        spawnCampaignRobot(_v3.x, _v3.z, 1, cls);
    }
}

// ===== SUPPLY ROOM (W, kanan-atas): 4 paket amunisi + 2 medkit (tak kedaluwarsa).
// Amunisi kini PER-SENJATA (2026-07-26): tiap paket menyebut senjatanya sendiri.
// Stage 1 = awal campaign (player baru punya pistol), jadi condong ke pistol
// tapi tetap menyediakan jenis lain untuk yang sudah belanja di shop. =====
export function placeSupplies() {
    const put = (w, c, r) => { const p = s1Cell(c, r); spawnAmmoDrop(p.x, p.z, w, 1e9); };
    const med = (c, r) => { const p = s1Cell(c, r); spawnMedkitDrop(p.x, p.z, 1e9); };
    put('pistol', 31, 3); put('pistol', 35, 3);
    put('rifle', 33, 4); put('shotgun', 37, 5);
    med(32, 6); med(36, 7);
}

// ===== BAREL PELEDAK (SECOND-IMPROVEMENT point 2): tong eksplosif di ruang
// tempur terbuka. Ditembak -> ledakan AoE membunuh robot di sekitar (rambat antar
// barel). BUKAN penghalang nav (robot boleh lewat = berkerumun di dekatnya),
// hanya PEJAL ke player (resolveBarrelBlock di playerCollide). Ditaruh di sel
// lantai terbuka jauh dari pintu/furnitur. =====
const S1_BARRELS = [[18, 31], [26, 31], [24, 44], [31, 45], [40, 22]];
export function placeBarrels() {
    for (const [c, r] of S1_BARRELS) { const p = s1Cell(c, r); spawnBarrel(p.x, p.z, 0); }
}

// ===== PETI PERSEDIAAN (2026-07-26, permintaan user): ditembak/ditebas sampai
// pecah, berpeluang berisi amunisi / uang / medkit (entities/crates.js). SETIAP
// RUANGAN kebagian minimal satu supaya player punya alasan MASUK ke tiap ruangan,
// bukan cuma melintasi koridor menuju objektif. Pejal ke player saja (bukan nav),
// jadi menghancurkannya tak pernah perlu bake-ulang nav-grid. =====
// JUMLAH DIPERBANYAK 2026-07-26 (pass 2, permintaan user: "jangan cuma 1 per
// ruangan") — ruangan besar dapat 3-6 peti, ruangan kecil 2-3.
const S1_CRATES = [
    [6, 5],                        // ruang tangga (start)
    [10, 5], [18, 2], [14, 1],     // conference W
    [26, 5], [27, 1],              // conference E
    [34, 9], [34, 14], [31, 1], [30, 14],       // supply room W
    [42, 14], [46, 2], [48, 3], [40, 13],       // east-1
    [6, 9], [7, 16],               // office W
    [11, 17], [19, 9], [20, 19], [11, 10],      // central hall
    [26, 15], [27, 8],             // toilet
    [6, 27], [7, 18], [1, 28],     // office SW
    [23, 27], [28, 20],            // office SE-mid
    [31, 20], [46, 27], [48, 28], [48, 22], [43, 28],   // big east-mid
    [10, 22], [10, 28],            // small room 1
    [19, 22], [20, 28],            // small room 2
    [3, 31], [36, 37], [1, 30], [7, 38], [32, 38], [28, 30],   // big lower hall
    [46, 36], [48, 37],            // east lower
    [30, 42], [5, 47], [1, 42], [2, 48], [33, 40],      // X hall
    [41, 41], [46, 40],            // ruang super komputer
];
export const s1CrateCount = S1_CRATES.length;   // smoke test
export function placeCrates() {
    for (const [c, r] of S1_CRATES) { const p = s1Cell(c, r); spawnCrate(p.x, p.z, 0); }
}

// ===== HORDE (SECOND-IMPROVEMENT point 3): gerombolan kelas C yang LANGSUNG
// MENYERBU dari ruang X saat data selesai diunduh — bersama bala bantuan wave-2,
// momen "hostiles inbound" jadi BANJIR robot. Jumlah CFG.campaign.stage1.hordeCount
// (config-driven), disebar ke sudut ruang X via spawnSwarm (active = 'chasing'). =====
const S1_HORDE_ANCHORS = [[4, 41], [16, 41], [4, 47], [16, 47], [10, 44]];
export function spawnStage1Horde() {
    const n = CFG.campaign.stage1.hordeCount || 0;
    if (n <= 0) return;
    const per = Math.floor(n / S1_HORDE_ANCHORS.length), rem = n % S1_HORDE_ANCHORS.length;
    const spots = S1_HORDE_ANCHORS.map((a, i) => [a[0], a[1], per + (i < rem ? 1 : 0)]);
    spawnSwarm(spots, 1, s1Cell, stage1Walk, resolve, _v3, 'C');
}

export const stage1Scene = {
    id: 'campaign-1',
    lightsKey: 'campaign-1',   // set lampu yang menyala (world/lighting.js)

    // Masuk stage 1 = mulai campaign (start pertama ATAU restart setelah mati).
    enter() {
        saveCampaignStage(1);
        ensureWorld();            // bangun SEMUA dunia campaign sekali (guard `built`)
        placeRobots();            // robot GELOMBANG 1 stage 1 (50 kelas C; stage 2 robotnya sendiri di stage2.enter)
        placeSupplies();          // supply room: 4 ammo + 2 medkit
        resetBarrels(); placeBarrels();   // barel peledak (bersihkan barel stage lain dulu)
        resetCrates(); placeCrates();     // peti persediaan (isi loot) di tiap ruangan
        applyLightPreset(scene, 'indoor');
        enterCityEnv();
        // Reset ALUR ke awal: fase clear1, unduh 0, pintu komputer TERKUNCI lagi.
        s1Phase = 'clear1'; s1DlT = 0;
        setCinematicActive(false);
        hideDownloadBar();
        if (s1compDoor) setDoorLocked(s1compDoor, true);
        // Lampu ruangan MATI (menyala saat dimasuki); start room pra-nyala.
        resetRoomLamps(s1Lamps);
        setS1FlickerLight(null);
        if (s1HallLamp) s1HallLamp.flicker = false;
        if (s1Lamps[0]) {   // ruang TANGGA (spawn) langsung terang
            const st = s1Lamps[0];
            st.on = true; st.k = 1; st.L.intensity = st.base;
            if (st.shroud) { st.shroud.visible = false; st.shroud.material.opacity = 0; }
        }
        s1ExitOpen = false;
        if (s1ExitSign) {
            s1ExitSign.material.color.setHex(0xff4a3c);
            s1ExitLight.color.setHex(0xff5040);
        }
        s1HintT = Date.now(); s1LiftT = 0;   // jangan langsung pop hint saat spawn
        if (s1Marker) s1Marker.visible = true;   // marker "berdiri di sini" tampil lagi
        const sp = s1Cell(S1_START.c, S1_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // hadap selatan (ke dalam gedung)
        hideStageMsg();
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Ganjaran kill campaign: TAK ada skor langsung — jatuhkan LOOT/uang (dipungut
    // player, magnet) jadi uang belanja shop. Lihat campaignAwardKill (common.js).
    awardKill: campaignAwardKill,

    // Pintu geser + lampu per-ruangan + STATE MACHINE alur stage.
    updateMode(dt) {
        updateStageDoors(s1doors, dt);
        updateRoomLamps(s1Lamps, dt);
        if (s1HallLamp && s1HallLamp.on && s1HallLamp.k >= 1 && !s1HallLamp.flicker) {
            s1HallLamp.flicker = true;
            setS1FlickerLight(s1HallLamp.L);
        }
        const n = countStageRobots(1);
        const px = camera.position.x, pz = camera.position.z;
        const s1 = CFG.campaign.stage1;

        if (s1Phase === 'clear1') {
            // Semua robot gelombang-1 tumbang → BUKA pintu ruang komputer.
            if (n === 0) {
                s1Phase = 'download';
                if (s1compDoor) setDoorLocked(s1compDoor, false);
                showStageMsg('All robots destroyed — the server room is unlocked. Download the data.', 4600);
            }
        } else if (s1Phase === 'download') {
            // Player MENEMPEL terminal komputer → mulai unduh (bekukan gerak).
            if (s1CompPos && Math.hypot(px - s1CompPos.x, pz - s1CompPos.z) < s1.computerRange) {
                s1Phase = 'downloading'; s1DlT = 0;
                clearMoveTarget();
                keys.w = keys.a = keys.s = keys.d = false;   // lepas tombol tahan (tak drift saat unfreeze)
                setCinematicActive(true);   // bekukan SEMUA kendali player (dunia tetap jalan)
                showDownloadBar();
                showStageMsg('Downloading data — hold position.', 2400);
            }
        } else if (s1Phase === 'downloading') {
            s1DlT += dt;
            const k = Math.min(1, s1DlT / s1.downloadSec);
            setDownloadProgress(k);
            if (k >= 1) {
                s1Phase = 'clear2';
                setCinematicActive(false);   // kembalikan kendali
                hideDownloadBar();
                if (s1Marker) s1Marker.visible = false;   // marker tak perlu lagi
                spawnWave2();                // 20 robot tambahan di ruang X (10C/5B/5A)
                spawnStage1Horde();          // + HORDE kelas C langsung menyerbu (SECOND-IMPROVEMENT #3)
                showStageMsg('Data secured! A HORDE of robots swarms in — fight your way back to the stairs!', 5200);
            }
        } else if (s1Phase === 'clear2') {
            if (n === 0) {
                s1Phase = 'done';
                showStageMsg('Area secured — return to the stairs to descend.', 4600);
            }
        }

        // LIFT rusak: peringatan saat player mendekat (rate-limited).
        if (s1LiftPos
            && Math.hypot(px - s1LiftPos.x, pz - s1LiftPos.z) < s1.liftWarnRange
            && Date.now() - s1LiftT > 4200) {
            s1LiftT = Date.now();
            showStageMsg('The elevator seems broken — use the stairs instead.', 2600);
        }

        // Denyut marker "berdiri di sini" (amber) selagi tampil.
        if (s1MarkerMat && s1Marker && s1Marker.visible)
            s1MarkerMat.opacity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(Date.now() * 0.004));

        // Papan EXIT: MERAH sampai 'done', lalu HIJAU.
        const open = s1Phase === 'done';
        if (open !== s1ExitOpen && s1ExitSign) {
            s1ExitOpen = open;
            s1ExitSign.material.color.setHex(open ? 0x2eff6a : 0xff4a3c);
            s1ExitLight.color.setHex(open ? 0x39ff7a : 0xff5040);
        }
    },

    // Dinding grid + furnitur + pintu KOMPUTER terkunci (blok player) + trigger
    // SELESAI di ruang TANGGA (hanya fase 'done' → transisi stage 2).
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        resolveDoors(s1doors, pos, player.radius, true);   // pintu TERKUNCI memblok player
        resolveBarrelBlock(pos, player.radius);            // barel peledak pejal ke player
        resolveCrateBlock(pos, player.radius);             // peti persediaan pejal ke player
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        // Trigger SELESAI = ruang TANGGA (T). Aktif hanya bila semua objektif tuntas.
        if (pos.x >= S1.x0 + S1_FINISH.c0 * S1.CELL
            && pos.x <= S1.x0 + (S1_FINISH.c1 + 1) * S1.CELL
            && pos.z >= S1.z0 + S1_FINISH.r0 * S1.CELL
            && pos.z <= S1.z0 + (S1_FINISH.r1 + 1) * S1.CELL) {
            if (s1Phase === 'done') {
                beginStageTransition(stage2Scene);
            } else if (Date.now() - s1HintT > 2600) {
                s1HintT = Date.now();
                showStageMsg(s1Phase === 'clear1'
                    ? 'Destroy every robot to unlock the server room first.'
                    : (s1Phase === 'clear2'
                        ? 'Eliminate every hostile before you can descend.'
                        : 'Download the data from the server room first.'), 2400);
            }
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Peluru MATI di dinding + PINTU tertutup (player & robot) — cegah tembus tembok.
    bulletBlocked(b) {
        return (b.mesh.position.y < S1.H
            && s1SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z))
            || doorClampShot(s1doors, b);
    },

    // AoE ledakan (launcher) TIDAK menembus pintu tertutup (per robot di explodeAt).
    blastBlocked(x0, z0, x1, z1, y) { return doorBlocksShot(s1doors, x0, z0, x1, z1, y); },

    grenadeCollide(g, oldGX, oldGZ) {
        if (!stage1Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        if (g.mesh.position.y > S1.H - NADE_R) {
            g.mesh.position.y = S1.H - NADE_R;
            if (g.vy > 0) g.vy = -g.vy * 0.3;
        }
    },

    robotAI(z, dt, step) {
        // Indoor: aktivasi HANYA bila robot MELIHAT player (LOS grid + pintu tertutup).
        return campaignRobotAI(z, dt, step, {
            walkable: stage1Walk, resolve, nav: s1Nav,
            los: (x1, z1, x2, z2) => s1LOS(x1, z1, x2, z2)
                && !doorBlocksShot(s1doors, x1, z1, x2, z2, 8),
            doorBlock: (pos, r) => resolveDoors(s1doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, {
            walkable: stage1Walk, resolve, doorBlock: (pos, r) => resolveDoors(s1doors, pos, r)
        });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        const n = countStageRobots(1);
        switch (s1Phase) {
            case 'clear1': return `FLOOR 2 — Robots: ${n} | Destroy ALL robots to unlock the server room`;
            case 'download': return 'FLOOR 2 — Server room unlocked — reach the terminal and download the data';
            case 'downloading': return `FLOOR 2 — Downloading data... ${Math.round(Math.min(1, s1DlT / CFG.campaign.stage1.downloadSec) * 100)}%`;
            case 'clear2': return `FLOOR 2 — Hostiles inbound! Robots: ${n} | Fight back to the stairs`;
            default: return 'FLOOR 2 — Area secured — return to the stairs to descend';
        }
    },

    // Landmark radar: objektif saat ini (komputer SE saat clear1/download, tangga
    // NW saat clear2/done). Warna = merah bila belum siap / hijau-teal bila siap.
    radarLandmarks(plot) {
        if (s1Phase === 'clear1' || s1Phase === 'download' || s1Phase === 'downloading') {
            if (s1CompPos) plot(s1CompPos.x - camera.position.x, s1CompPos.z - camera.position.z,
                s1Phase === 'clear1' ? '#ff5040' : '#7fe3ff', 5, true);
        } else {
            const fx = S1.x0 + (S1_FINISH.c0 + S1_FINISH.c1 + 1) / 2 * S1.CELL;
            const fz = S1.z0 + (S1_FINISH.r0 + S1_FINISH.r1 + 1) / 2 * S1.CELL;
            plot(fx - camera.position.x, fz - camera.position.z,
                s1Phase === 'done' ? '#2eff6a' : '#ff5040', 5, true);
        }
    },
};
