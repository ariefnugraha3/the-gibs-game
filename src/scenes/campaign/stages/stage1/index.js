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
//   1. 'access'  : spawn di TANGGA dengan 50 robot KELAS C tersebar. TAK ADA
//                  syarat "bunuh semua dulu" (dihapus 2026-08-12, permintaan
//                  user): bank komputer '@' hidup sejak awal, tinggal berdiri di
//                  petak '$' (TANPA minigame) → pintu NAC ruang super komputer
//                  TERKUNCI (merah) TERBUKA (hijau). Robot boleh dilewati.
//   2. 'download': datangi SUPER KOMPUTER (kanan-bawah), MENEMPEL → mulai unduh.
//   3. 'downloading': MINIGAME HACK "ICE BREACH" (2026-07-28 — MENGGANTIKAN bar
//                  progress 10 dtk yang lama): scene modal berisi puzzle sirkuit
//                  (utility/hackMinigame.js); game DI-PAUSE selama puzzle.
//                  BERHASIL → transmisi radio Pilot lalu Maj. Gibran; kontrol
//                  dibekukan dan wave-2 belum muncul selama percakapan.
//                  Setelah transmisi: 20 robot tambahan (SEMUA kelas C sejak
//                  2026-07-26) + HORDE spawn di ruang bertanda X. GAGAL/BATAL → kembali ke
//                  fase 'download'; player harus MENJAUH dulu sebelum bisa
//                  memicunya lagi (s1CompArmed).
//   4. 'radio'   : tampilkan percakapan Pilot → Maj. Gibran secara berurutan.
//   5. 'clear2'  : BUNUH SEMUA robot gelombang-2 lalu KEMBALI ke TANGGA → selesai
//                  (transisi ke stage 2). LIFT rusak: peringatan saat didekati.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { dialogueList } from '../../../../core/dialogue.js';
import { player, _v3, setCinematicActive } from '../../../../core/state.js';
import { scene, camera } from '../../../../core/renderer.js';
import { makeTexture, speckle } from '../../../../utils/textures.js';
import { rand } from '../../../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight, makeBlockerIndex } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { applyLightPreset, registerStageLight, precompileStageLightSets } from '../../../../world/lighting.js';
import {
    hideStageMsg, showStageMsg, setCineBars,
    showStageRadioDialogue, hideStageRadioDialogue,
} from '../../../../core/dom.js';
import { beginHackMinigame, isHackOpen } from '../../utility/hackMinigame.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { NADE_R } from '../../../../entities/grenades.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { buildFuturisticBenchMesh } from '../../../../entities/futuristicBench.js';
import { buildFuturisticPlanterMesh } from '../../../../entities/futuristicPlanter.js';
import { buildFuturisticDeskMesh } from '../../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../../../entities/futuristicCupboard.js';
import { buildFuturisticMeetingTableMesh } from '../../../../entities/futuristicMeetingTable.js';
import { buildFuturisticCrateMesh } from '../../../../entities/futuristicCrate.js';
import { buildFuturisticSofaMesh } from '../../../../entities/futuristicSofa.js';
import { buildFuturisticStallMesh } from '../../../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../../../entities/futuristicSink.js';
import { buildFuturisticConsoleMesh } from '../../../../entities/futuristicConsole.js';
import { barricadeBlocker, buildFurniturePile, buildWallBreach, BARRICADE_TOP } from '../../utility/barricade.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, clearStageOccluders,
    occlusionDebug,
} from '../../utility/occlusion.js';
import { buildFadeableWalls } from '../../utility/wallFade.js';
import {
    spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, campaignAwardKill,
    spawnSwarm, spawnAlarmHorde, propClearance, buildStandMarker, pulseStandMarker,
    scaleSpawnCounts, scaleRobotCount,
} from '../../utility/common.js';
import { PAL } from '../../../../world/palette.js';
import { spawnBarrel, resolveBarrelBlock, resetBarrels } from '../../../../entities/barrels.js';
import { spawnCrate, resolveCrateBlock, resetCrates } from '../../../../entities/crates.js';
import { buildInteriorWallMat, buildInteriorFloorMat } from '../../utility/interior.js';
import {
    buildStageDoors, updateStageDoors, resolveDoors, doorsWalkable,
    doorBlocksShot, doorClampShot, setDoorLocked, overrideDoorLocks, resetDoorLocks,
} from '../../utility/doors.js';
import { buildStairwellUp, stairwellUpFootprint } from '../../utility/stairwell.js';
import { buildLiftBank, liftBankFootprint } from '../../utility/lift.js';
import { buildCampaignCityscape, enterCityEnv } from '../../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../../utility/transition.js';
import { stage2Scene, buildWorld as buildStage2World } from '../stage2/index.js';   // robotnya kini ditempatkan stage2.enter sendiri
import { ensureWorld as ensureStage3World } from '../stage3/index.js';   // (circular aman: dipanggil DI DALAM enter)
import { ensureWorld as ensureStage4World } from '../stage4/index.js';
import { ensureWorld as ensureStage5World } from '../stage5/world.js';
import { ensureWorld as ensureStage6World } from '../stage6/index.js';
import { ensureWorld as ensureStage7World } from '../stage7/index.js';
import { ensureWorld as ensureStage8World } from '../stage8/index.js';
import { ensureStage9World } from '../stage9/index.js';
import { ensureStage10World } from '../stage10/index.js';
import { ensureStage11World } from '../stage11/index.js';
import { ensureStage12World } from '../stage12/index.js';
import { ensureStage13World } from '../stage13/index.js';
import { prewarmCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';

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
// BANK KOMPUTER '@' (denah 2026-08-12): deret konsol sepanjang dinding TIMUR
// ruang akses (c48, r30-38). `S1_ACCESS` = petak pijak '$' di depannya — berdiri
// di situ MEMBUKA pintu NAC ruang super komputer. Sengaja TANPA minigame
// (permintaan user): mencapai petaknya sudah menuntaskan event-nya.
export const S1_TERMINAL_BANK = { c: 48, r0: 30, r1: 38 };
export const S1_ACCESS = { c: 47, r: 34 };

// Naskah milik user: dipisah dari state/timer supaya urutan dan teks lengkapnya
// dapat dipatok smoke test tanpa menyalin string dari DOM.
export const S1_RADIO_DIALOGUE = dialogueList('campaign.stage1.radio');

// DENAH RESMI (stages(Stage1).csv, revisi user 2026-08-12). 50x50. '#'=dinding,
// '.'=lantai. Token denah yang BUKAN dinding tetap lantai di grid ini dan
// diwujudkan oleh tabel di bawahnya:
//   '-' pintu geser        -> S1_DOORS
//   '+' pintu RUSAK        -> S1_DOORS { broken: true } (macet permanen)
//   '/' celah tembok       -> S1_BREACHES (lubang bobol; lantai, bisa dilewati)
//   '*' tumpukan perabot   -> S1_BARRICADES (pejal ke player DAN robot)
//   '@' bank komputer      -> S1_TERMINAL_BANK (pejal, dinding timur ruang akses)
//   '$' petak pijak hack   -> S1_ACCESS
// JANGAN ubah tanpa update tabel-tabel itu + robot/furnitur + tes ulang (smoke).
const S1_MAP = [
    '##################################################',   // 0
    '#.......#....................#.........#.........#',   // 1
    '#.......#....................#.........#.........#',   // 2
    '#...................#........#...................#',   // 3  (c39 = celah '/' ke east-1)
    '#...................#........#.........#.........#',   // 4
    '#.......#...........#........#.........#.........#',   // 5
    '#.......#...........#........#.........#.........#',   // 6
    '###..########...############.#.........#.........#',   // 7  (c3-4 & c13-15 = pintu RUSAK '+', c28 = celah '/')
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
    '#..............#.................................#',   // 24  (c8 = pintu baru office SW <-> small room 1)
    '#..............#.....#.......#...................#',   // 25
    '#.......#......#.....#.......#...................#',   // 26
    '#.......#......#.....#.......#...................#',   // 27
    '#.......#......#.....#.......#...................#',   // 28
    '#################################..###############',   // 29
    '#......................................#.........#',   // 30  (nub c39 = sudut tembok ruang akses; pintunya 2 sel di r31-32)
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

// PINTU di SEMUA bukaan '-' dan '+' denah resmi (18 pintu). dir 'ew'=dinding
// VERTIKAL (panel sumbu-z) / 'ns'=HORIZONTAL.
//   broken: true  -> '+' pintu RUSAK, macet permanen (lampu jamb selalu MERAH,
//                    daun tak pernah bergerak) — pemain harus memutar.
//   locked: true  -> pintu NAC ruang super komputer: TERKUNCI sampai bank
//                    komputer '@' di-hack (lihat S1_ACCESS), bukan lagi sampai
//                    semua robot tumbang.
const S1_DOORS = [
    { c0: 20, r0: 1, c1: 20, r1: 2, dir: 'ew' },     // conference W <-> conference E
    { c0: 8, r0: 3, c1: 8, r1: 4, dir: 'ew' },       // start (A) <-> conference W
    { c0: 3, r0: 7, c1: 4, r1: 7, dir: 'ns', broken: true },     // start (A) -X- office W (RUSAK)
    { c0: 13, r0: 7, c1: 15, r1: 7, dir: 'ns', broken: true },   // conference W -X- central hall (RUSAK)
    { c0: 8, r0: 11, c1: 8, r1: 12, dir: 'ew' },     // office W <-> central hall
    { c0: 21, r0: 11, c1: 21, r1: 12, dir: 'ew' },   // central hall <-> toilet approach
    { c0: 3, r0: 17, c1: 4, r1: 17, dir: 'ns' },     // office W <-> office SW
    { c0: 36, r0: 17, c1: 37, r1: 17, dir: 'ns' },   // supply annex <-> east-mid
    { c0: 41, r0: 17, c1: 42, r1: 17, dir: 'ns' },   // east-1 <-> east-mid
    { c0: 13, r0: 20, c1: 14, r1: 20, dir: 'ns' },   // central <-> small room 1
    { c0: 16, r0: 20, c1: 17, r1: 20, dir: 'ns' },   // central <-> small room 2
    { c0: 21, r0: 23, c1: 21, r1: 24, dir: 'ew' },   // office SE-mid <-> corridor
    { c0: 29, r0: 23, c1: 29, r1: 24, dir: 'ew' },   // corridor <-> east-mid
    { c0: 8, r0: 24, c1: 8, r1: 25, dir: 'ew' },     // office SW <-> small room 1 (baru)
    { c0: 33, r0: 29, c1: 34, r1: 29, dir: 'ns' },   // upper block <-> lower hall
    { c0: 39, r0: 31, c1: 39, r1: 32, dir: 'ew' },   // lower hall <-> ruang akses '@' (2 sel: r31-32)
    { c0: 3, r0: 39, c1: 4, r1: 39, dir: 'ns' },     // lower hall <-> X hall
    { c0: 39, r0: 43, c1: 39, r1: 45, dir: 'ew', locked: true },   // === PINTU NAC RUANG KOMPUTER ===
];

// CELAH TEMBOK '/' (2026-08-12): satu sel lantai berlubang di garis dinding —
// tembok yang JEBOL, bukan pintu. Sel-nya sudah lantai di S1_MAP; entri ini
// hanya menempelkan sisa tembok bergerigi di kedua kusen supaya lubangnya
// terbaca. MURNI DEKOR: player (radius 5) tak pernah bisa berada dalam 2 unit
// dari tepi sel, jadi tonjolan <= 2 unit tak pernah tersentuh kolisi.
//   [c, r, dir] — dir 'ns' = lubang di dinding HORIZONTAL, 'ew' = VERTIKAL.
const S1_BREACHES = [
    [39, 3, 'ew'],    // supply room W <-> east-1
    [28, 7, 'ns'],    // conference E <-> ruang toilet
];

// TUMPUKAN PERABOT '*' (2026-08-12): barikade sel-penuh yang TIDAK BISA dilewati
// player MAUPUN robot. Sel-nya tetap lantai di grid (jadi BFS denah tak berubah),
// yang memblokir adalah satu blocker per sel — ikut bake nav di akhir buildWorld,
// jadi robot memutarinya alih-alih menembus. Tiga garis:
//   r13 c9-20   : membelah aula tengah jadi sisi utara & selatan
//   c39 r18-24  : menutup ruang timur-tengah bagian utara
//   r25 c30-39  : sisi selatan ruang yang sama (bentuk L bersama garis di atas)
const S1_BARRICADES = [];
for (let c = 9; c <= 20; c++) S1_BARRICADES.push([c, 13]);
for (let r = 18; r <= 24; r++) S1_BARRICADES.push([39, r]);
for (let c = 30; c <= 39; c++) S1_BARRICADES.push([c, 25]);
export const s1BarricadesDbg = () => S1_BARRICADES;   // smoke test
export const s1BreachesDbg = () => S1_BREACHES;       // smoke test
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
    // east-1 (open office) — rak dinding barat turun ke r8: c40 r2-4 kini mulut celah '/'
    ['cupboard', 40, 8, 6, 15, 30], ['meeting', 45, 14, 34, 7, 20], ['planter', 41, 8, 8, 11, 8],
    // office W
    ['cupboard', 1, 12, 6, 15, 30], ['sofa', 6, 15, 18, 6, 14], ['planter', 1, 9, 8, 11, 8],
    // central hall (meja c11 digeser ke r15: baris r13 kini barikade '*')
    ['cupboard', 20, 16, 6, 15, 30], ['desk', 12, 15, 22, 7, 12],
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
    ['cupboard', 9, 27, 6, 15, 20], ['box', 13, 22, 12, 9, 12],   // lemari turun: c8 r24-25 kini pintu
    ['cupboard', 16, 26, 6, 15, 20], ['desk', 17, 22, 18, 7, 10],
    // big lower hall
    ['cupboard', 1, 33, 6, 15, 40], ['meeting', 26, 36, 40, 7, 20],
    ['box', 12, 31, 14, 9, 14], ['box', 34, 36, 14, 9, 14],
    ['planter', 36, 31, 8, 11, 8], ['sofa', 2, 35, 18, 6, 14],
    // east lower (dinding timur c48 kini bank komputer '@' — rak lamanya dihapus)
    ['box', 41, 36, 14, 9, 14],
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
    ['planter', 21, 6, 8, 11, 8], ['bench', 26, 6, 18, 6, 7],   // bangku menyingkir dari mulut celah c28 r7
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
    ['stall', 22, 8, 10, 15, 2], ['sink', 26, 8, 10, 8, 4], ['stall', 22, 16, 10, 15, 2],   // wastafel menyingkir dari mulut celah c28 r7
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
    // east lower (meja digeser ke c45: c48 dipakai bank komputer '@')
    ['desk', 45, 30, 22, 7, 12], ['cupboard', 40, 37, 6, 15, 20], ['box', 42, 30, 14, 9, 14],
    // X hall (arena gelombang-2 — tetap lapang di tengah, hanya pinggirnya)
    ['box', 1, 47, 14, 9, 14], ['cupboard', 37, 40, 20, 15, 6], ['planter', 37, 48, 8, 11, 8],
    ['box', 34, 40, 14, 9, 14], ['bench', 34, 48, 18, 6, 7], ['box', 7, 40, 14, 9, 14],
    // ruang super komputer
    ['console', 48, 41, 8, 7, 16], ['box', 43, 40, 14, 9, 14],

    // --- pass 3: sisa sudut & pinggir ruangan besar yang masih melompong ---
    ['planter', 2, 4, 8, 11, 8],                                                   // ruang tangga
    ['cupboard', 31, 16, 20, 15, 6], ['box', 30, 7, 14, 9, 14],                    // supply room W
    ['desk', 36, 3, 22, 7, 12], ['box', 37, 14, 14, 9, 14],                        // meja menyingkir dari mulut celah c39 r3
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
    ['planter', 46, 38, 8, 11, 8], ['box', 43, 30, 14, 9, 14], ['bench', 40, 35, 7, 6, 18],   // east lower
    ['box', 35, 40, 14, 9, 14], ['planter', 35, 48, 8, 11, 8], ['box', 8, 40, 14, 9, 14],     // X hall (pinggir)
    ['bench', 31, 40, 18, 6, 7], ['box', 27, 40, 14, 9, 14], ['cupboard', 27, 48, 20, 15, 6],
    ['planter', 48, 47, 8, 11, 8],                                                 // ruang super komputer
    // X hall lagi: KRAT PENUTUP di pinggir arena (tengah tetap lapang untuk horde)
    ['box', 29, 40, 14, 9, 14], ['cupboard', 29, 48, 20, 15, 6], ['planter', 25, 40, 8, 11, 8],
    ['box', 18, 40, 14, 9, 14], ['bench', 21, 48, 18, 6, 7], ['sofa', 2, 46, 18, 6, 14],
    ['box', 36, 47, 14, 9, 14],
];

export const s1FurnitureDbg = () => S1_FURNITURE;   // smoke test (kepadatan & tumpang tindih)
let s1BankParts = [];        // mesh bank komputer '@' (smoke: bentuk & batas sel)
let s1BarricadeMix = [];     // resep tumpukan terpakai per sel '*' (smoke: variasi)
export const s1BankDbg = () => s1BankParts;
export const s1BarricadeMixDbg = () => s1BarricadeMix;
let s1StaticBatch = [];                              // mesh perabot hasil penggabungan
export const s1StaticBatchDbg = () => s1StaticBatch; // smoke test (jumlah draw call perabot)

let s1doors = null;
// ROOT DUNIA STAGE 1 (2026-08-13, optimasi): SELURUH geometri stage hidup di
// bawah satu Group yang didaftarkan ke campaignWorldRegistry, jadi renderer
// melewatinya sama sekali (projectObject berhenti di root tak-terlihat) ketika
// stage lain yang dimainkan. LAMPU sengaja TETAP menempel di `scene`: jumlah
// PointLight yang terlihat menentukan varian shader, dan itu sudah diurus
// setActiveStageLights/precompileStageLightSets — jangan pindahkan ke root.
export const S1_OCC = 'campaign-1';   // kunci set occluder (utility/occlusion.js)
let s1Walls = null;                   // dinding yang bisa memudar (wallFade.js)
export const s1WallsDbg = () => (s1Walls ? s1Walls.debug() : null);
export const s1WallsRigDbg = () => s1Walls;   // smoke: matriks instans dinding
let s1WorldRoot = null;
export const s1WorldRootDbg = () => s1WorldRoot;
let s1compDoor = null;   // ref pintu NAC ruang komputer (dibuka lewat bank komputer '@')
export const s1CompDoorDbg = () => s1compDoor;   // smoke test (status locked)
export const s1DoorsDbg = () => s1doors || [];   // smoke test (pintu rusak '+')

// Lampu PER-RUANGAN — SELALU MENYALA (mekanisme "mati lampu" dihapus 2026-08-11).
// Rect ruangannya masih dipakai smoke test (sebaran peti per ruangan).
let s1Lamps = [];
export const s1LampsDbg = () => s1Lamps;   // smoke test
// Papan EXIT (dekat TANGGA): MERAH selagi objektif belum tuntas, HIJAU saat 'done'.
let s1ExitSign = null, s1ExitLight = null, s1ExitOpen = false;
let s1HintT = 0;                            // rate-limit pesan "belum boleh keluar"
let s1LiftT = 0;                            // rate-limit peringatan lift rusak

// ===== STATE MACHINE ALUR STAGE 1 =====
let s1Phase = 'access';   // access | download | downloading | radio | clear2 | done
let s1CompPos = null;     // {x,z} dunia sel BERDIRI (selatan komputer) — trigger unduh
let s1CompArmed = true;   // pemicu hack "terisi": jadi false setelah dipakai, terisi lagi saat player MENJAUH
let s1HackCd = 0;         // COOLDOWN alarm (dtk): terminal terkunci setelah hack GAGAL
let s1RadioIndex = -1;    // 0=Pilot, 1=Maj. Gibran; -1 saat tidak aktif
let s1RadioT = 0;         // waktu mengetik + hold baris aktif (detik)
let s1RadioChars = 0;     // jumlah karakter yang sudah terlihat
let s1LiftPos = null;     // {x,z} dunia lift
let s1AccessPos = null;   // {x,z} dunia petak '$' (bank komputer) — pemicu buka NAC
let s1NacDoor = null;     // ref pintu NAC (alias s1compDoor)
let s1DoorsFreed = 0;     // jumlah pintu terkunci/rusak yang dilepas override kill-switch
export const s1OcclusionDebug = () => occlusionDebug(S1_OCC);
export const s1Debug = () => ({
    occluders: occlusionDebug(S1_OCC),
    phase: s1Phase, hacking: isHackOpen(), armed: s1CompArmed, hackCd: s1HackCd,
    radioIndex: s1RadioIndex, radioT: s1RadioT, radioChars: s1RadioChars,
    nacLocked: !!s1NacDoor?.locked,
    doorsFreed: s1DoorsFreed,
    lockedDoors: (s1doors || []).filter(d => d.locked || d.broken).length,
});   // smoke test

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

// Indeks spasial blocker (utils/collision.js): resolve/groundHeight dipanggil
// player + tiap robot (AI, clamp, separasi) tiap frame, jadi menyapu 200+ balok
// statis penuh-penuh itu murni pemborosan. Di-rebuild di akhir buildWorld.
const s1BlockerIdx = makeBlockerIndex(blockers, { cell: S1.CELL, x0: S1.x0, z0: S1.z0 });
export const s1BlockerIdxDbg = () => s1BlockerIdx.debug();   // smoke test
export const s1BlockersDbg = () => blockers;   // smoke test (indeks vs sapuan penuh)

// Penghalang pejal stage 1 = furnitur + undakan + lift + rak (balok axis-aligned)
export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, s1BlockerIdx.gather(pos.x, pos.z, radius));
}

// Nav-grid pathfinder (resolusi setengah sel; di-bake di AKHIR buildWorld)
export let s1Nav = null;

// MARKER "berdiri di sini": kotak pijak amber 12x12 BERSAMA campaign
// (buildStandMarker/pulseStandMarker di utility/common.js — standar 2026-08-12).
// Stage 1 punya DUA titik aksi, dan sama seperti Stage 6 HANYA SATU yang menyala
// pada satu waktu, selalu sama dengan yang ditunjuk radar:
//   s1AccessMarker — petak '$' di depan bank komputer '@' (membuka pintu NAC)
//   s1CompMarker   — petak di selatan super komputer (memicu ICE BREACH)
let s1AccessMarker = null, s1CompMarker = null;
export const s1MarkersDbg = () => ({
    access: !!s1AccessMarker?.visible, comp: !!s1CompMarker?.visible,
});   // smoke test

// Bangun SEMUA dunia campaign (stage 1..13) SEKALI (guard
// `built`). Dipakai stage1.enter() DAN cutscene intro (intro.js).
export function ensureWorld() {
    if (built) return;
    built = true;
    buildStage2World();   // STAGE 2 (denah, jauh)
    buildWorld();         // STAGE 1
    ensureStage3World();  // pre-build stage 3, 4, dan 5 (warmup compile up-front)
    ensureStage4World();
    ensureStage5World();
    ensureStage6World();
    ensureStage7World();
    ensureStage8World();
    ensureStage9World();
    ensureStage10World();
    ensureStage11World();
    ensureStage12World();
    ensureStage13World();
    // Root Stage 9–13 biasanya tersembunyi. Reveal sementara dari sudut wakil
    // agar material chapter/boss/hazard benar-benar masuk jalur render sekarang.
    prewarmCampaignWorldRoots();
    // Lampu stage non-aktif dimatikan (world/lighting.js) supaya shader tak
    // melooping 57 point light per fragmen; jumlah light jadi berbeda per stage,
    // maka program tiap konfigurasi DIKOMPILASI SEKARANG (masih di layar loading)
    // agar transisi stage tetap tanpa hitch.
    precompileStageLightSets(scene);
}

export function buildWorld() {
    // `buildWorld` diekspor dan harness memanggilnya langsung: kosongkan dulu
    // set occluder supaya membangun ulang dunia tidak menumpuk pendaftaran.
    clearStageOccluders(S1_OCC);
    buildS1Grid();
    const size = S1.G * S1.CELL;                      // 700 unit = 100 m
    const cx = S1.x0 + size / 2, cz = S1.z0 + size / 2;
    s1WorldRoot = new THREE.Group();
    s1WorldRoot.name = 'campaign-stage1-floor2';
    scene.add(s1WorldRoot);

    // --- Lantai: satu bidang panel fasilitas TERANG futuristik (interior.js;
    // 1 ubin/sel). TANGGA di stage 1 = TANGGA NAIK (titik masuk = titik selesai),
    // jadi TANPA lubang lantai. ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        buildInteriorFloorMat(S1.G, S1.G));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    s1WorldRoot.add(floor);

    // Latar KOTA JAKARTA mengelilingi gedung (dekor, tanpa blocker)
    buildCampaignCityscape(cx, cz, size / 2, size / 2, { parent: s1WorldRoot });

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
    s1WorldRoot.add(ceil);

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
    // DINDING BISA MEMUDAR (2026-08-14, permintaan user "tembok/dinding juga
    // transparant jika menutupi character"): InstancedMesh-nya tetap satu draw
    // call; sel yang menutupi player/robot disembunyikan dari instansnya dan
    // digantikan proxy tembus pandang dari kolam kecil. Lihat utility/wallFade.js.
    {
        const _c = new THREE.Color();
        s1Walls = buildFadeableWalls({
            key: S1_OCC, parent: s1WorldRoot,
            cells: wallCells.map(([c, r]) => ({ c, r, ...s1Cell(c, r) })),
            cell: S1.CELL, wallH: S1.H, bodyMat: buildInteriorWallMat(),
            // jitter kusam per panel — urutan rand() dipertahankan apa adanya
            colorAt: () => _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04)),
        });
    }

    // --- Pintu geser otomatis (ruang tertutup; pintu KOMPUTER dibuat terkunci) ---
    s1doors = buildStageDoors(S1_DOORS, s1Cell, S1.CELL, S1.H, s1WorldRoot);
    s1compDoor = s1doors.find(d => d.locked && !d.broken) || null;   // pintu NAC (pintu rusak juga "locked")
    s1NacDoor = s1compDoor;

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
    // Central hall (c9-20 r8-19): open office cubicle + kabinet. Meja kedua ada
    // di SISI SELATAN barikade r13 (dulu tepat di atasnya).
    deskModel(13, 10, 24, 7, 12);
    deskModel(17, 15, 24, 7, 12);
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
    // Big east-mid (c30-48 r18-28): open office + meja rapat. Barikade '*'
    // (r25 c30-39 + c39 r18-24) memotongnya jadi ruang rapat tertutup c30-38
    // r18-24 dan lorong r26-28. Meja rapat pindah KE DALAM ruang tertutup itu:
    // lorong r26-28 kini SATU-SATUNYA jalan ke seluruh lantai bawah, jadi tak
    // boleh ada perabot besar di sana.
    deskModel(33, 20, 24, 7, 12);
    deskModel(44, 20, 24, 7, 12);
    meetingModel(35, 23, 42, 7, 26);
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

    // === BARIKADE '*' (denah 2026-08-12): TUMPUKAN PERABOT setinggi dada yang
    // menutup satu sel penuh. Satu blocker per sel (14x14, `standable:false`
    // supaya tak bisa dipanjat) + tiga potong perabot bekas kantor yang ditumpuk
    // acak-deterministik di dalamnya. Nav ikut ter-bake dari blocker ini di akhir
    // buildWorld, jadi robot memutar — tak perlu menyentuh grid denah. ===
    s1BarricadeMix = [];
    for (let i = 0; i < S1_BARRICADES.length; i++) {
        const [c, r] = S1_BARRICADES[i];
        const p = s1Cell(c, r);
        blockers.push(barricadeBlocker(p.x, p.z, S1.CELL));
        s1BarricadeMix.push({ c, r, ...buildFurniturePile(staticProps, p.x, p.z, i,
            (g) => weldOccluder(S1_OCC, s1WorldRoot, g,
                { x: p.x, z: p.z, radius: S1.CELL / 2 + 2, top: BARRICADE_TOP })) });
    }

    // === CELAH TEMBOK '/' (denah 2026-08-12): sisa tembok bergerigi di kedua
    // kusen lubang bobol supaya terbaca sebagai DINDING JEBOL, bukan pintu.
    // TANPA blocker: sel-nya cuma 14 unit, dan player (radius 5) tak pernah bisa
    // berada < 2 unit dari tepi sel — tonjolan 2 unit ini tak tersentuh kolisi. ===
    for (const [c, r, dir] of S1_BREACHES) {
        const p = s1Cell(c, r);
        buildWallBreach(staticProps, p.x, p.z, dir, S1.CELL, S1.H);
    }

    // === BANK KOMPUTER '@' + PETAK PIJAK '$' (denah 2026-08-12): deret MAINFRAME
    // sepanjang dinding TIMUR ruang akses (c48, r30-38). Meng-hack-nya TIDAK
    // memakai minigame (permintaan user) — cukup berdiri di petak '$'.
    //
    // DIBANGUN SENDIRI, bukan lemari yang di-rename (2026-08-12, permintaan user
    // "terlihat polos seperti placeholder"): tiap sel = kabinet ber-plinth dengan
    // MUKA TERBUKA menghadap ruangan yang berisi rak modul, kisi ventilasi, deret
    // LED status, dan LAYAR menyala; di atasnya ada mahkota + talang kabel yang
    // menyambung sepanjang bank. Sel '$' mendapat STASIUN OPERATOR: layar besar
    // miring + papan ketik di rak tarik. Semua geometri WAJIB berada di dalam sel
    // 48 (footprint blocker), warna dari token PAL, emissive <= EMISSIVE_MAX, dan
    // TANPA PointLight — semuanya ikut addMergedStatic. ===
    {
        const b0 = s1Cell(S1_TERMINAL_BANK.c, S1_TERMINAL_BANK.r0);
        const b1 = s1Cell(S1_TERMINAL_BANK.c, S1_TERMINAL_BANK.r1);
        const bankZ = (b0.z + b1.z) / 2, bankLen = (S1_TERMINAL_BANK.r1 - S1_TERMINAL_BANK.r0 + 1) * S1.CELL;
        // Kabinet DIDORONG ke dinding (bx) supaya sisi depan sel masih menyisakan
        // ~3.4 unit untuk detail muka (layar/papan ketik) TANPA satu pun geometri
        // keluar dari sel 48 = footprint blocker. fx = bidang muka.
        const BANK_H = 16, BODY_DX = 1.7, BODY_D = 9.6, FACE = BODY_DX - BODY_D / 2;
        blockers.push({
            x: b0.x, z: bankZ, hx: S1.CELL / 2, hz: bankLen / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(S1.CELL / 2, bankLen / 2), top: BANK_H, standable: false,
        });
        const caseMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const trimMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const steelMat = new THREE.MeshLambertMaterial({ color: PAL.steel });
        const bayMat = new THREE.MeshLambertMaterial({ color: PAL.panel });
        const glassMat = new THREE.MeshLambertMaterial({ color: PAL.screenBg });
        const litMat = new THREE.MeshLambertMaterial({
            color: PAL.tech, emissive: PAL.tech, emissiveIntensity: 0.75,
        });
        const ledMat = new THREE.MeshLambertMaterial({
            color: PAL.amber, emissive: PAL.amber, emissiveIntensity: 0.7,
        });
        const idleMat = new THREE.MeshLambertMaterial({ color: PAL.techDim });
        s1BankParts = [];
        const box = (mat, sx, sy, sz, x, y, z) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
            m.position.set(x, y, z);
            staticProps.push(m);
            s1BankParts.push(m);
            return m;
        };
        for (let r = S1_TERMINAL_BANK.r0; r <= S1_TERMINAL_BANK.r1; r++) {
            const q = s1Cell(S1_TERMINAL_BANK.c, r), operator = r === S1_ACCESS.r;
            const bx = q.x + BODY_DX, fx = q.x + FACE, hsh = (r * 2246822519) >>> 0;
            box(caseMat, BODY_D, BANK_H - 1.6, 13.2, bx, 0.8 + (BANK_H - 1.6) / 2, q.z);   // badan kabinet
            box(trimMat, BODY_D + 0.6, 1.2, 13.6, bx, 0.6, q.z);                            // plinth
            box(steelMat, BODY_D + 0.6, 0.9, 13.6, bx, BANK_H - 0.45, q.z);                 // mahkota
            box(trimMat, 4, 1.6, 13.6, bx + 2.5, BANK_H + 1.2, q.z);                        // talang kabel atas
            box(bayMat, 1.2, BANK_H - 4.4, 11.4, fx + 0.6, 2.6 + (BANK_H - 4.4) / 2, q.z);  // bay muka
            // Rak modul: empat baris blade tipis, kedalaman berselang-seling +
            // lampu aktivitas kecil di ujungnya.
            for (let k = 0; k < 4; k++) {
                const deep = ((hsh >> k) & 1) ? 0.5 : 0;
                box(trimMat, 1.1 + deep, 1.7, 10.2, fx - deep / 2, 4.4 + k * 2.3, q.z);
                box((hsh >> (k + 4)) & 1 ? litMat : idleMat, 0.5, 0.5, 0.6,
                    fx - 0.6 - deep, 4.4 + k * 2.3, q.z - 4.4);
            }
            // Kisi ventilasi bawah + deret LED status di puncak muka.
            for (let k = 0; k < 3; k++)
                box(trimMat, 0.9, 0.45, 9.6, fx - 0.2, 1.9 + k * 0.9, q.z);
            for (let k = 0; k < 4; k++)
                box(k === 1 ? ledMat : litMat, 0.5, 0.55, 0.55, fx - 0.5, 13.4, q.z - 3 + k * 2);
            // Layar: bingkai gelap + kaca. Sel operator '$' dapat layar BESAR yang
            // dimiringkan ke bawah plus rak papan ketik yang menjorok ke ruangan.
            if (operator) {
                const bez = box(trimMat, 1.1, 7.4, 10.4, fx - 1.2, 10.4, q.z);
                bez.rotation.z = -0.16;
                const gl = box(litMat, 0.5, 6.2, 9.2, fx - 1.9, 10.4, q.z);
                gl.rotation.z = -0.16;
                box(steelMat, 3, 0.6, 9.6, fx - 1.2, 6.2, q.z);            // rak papan ketik
                box(trimMat, 2.2, 0.5, 7.6, fx - 1.3, 6.6, q.z);           // papan ketik
                box(glassMat, 0.5, 1.6, 3.2, fx - 0.2, 3.4, q.z + 4);      // panel akses tertutup
            } else {
                box(trimMat, 1.1, 4.6, 8.4, fx - 1.0, 11.4, q.z);
                box((hsh >> 9) & 1 ? litMat : glassMat, 0.5, 3.6, 7.2, fx - 1.6, 11.4, q.z);
            }
        }
        const accP = s1Cell(S1_ACCESS.c, S1_ACCESS.r);
        s1AccessPos = { x: accP.x, z: accP.z };
        s1AccessMarker = buildStandMarker(scene, accP.x, accP.z, PAL.amber);
    }

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
    s1CompMarker = buildStandMarker(scene, standP.x, standP.z, PAL.amber);
    s1SetMarker('access');   // objektif pertama ('@') sudah aktif sejak dunia berdiri

    // === LIFT rusak (nook c9-10 r15-19): SEPASANG lift (kiri-kanan) MENGHADAP
    // TIMUR, MENEMPEL tembok BARAT (col8) — entity lift.js (RUSAK = pintu tertutup,
    // solid). Badan lift di col9; player berdiri di col10 (timur). ===
    const liftWallX = S1.x0 + 9 * S1.CELL;           // muka timur tembok barat alcove
    const liftZ = S1.z0 + 17.5 * S1.CELL;            // pusat z alcove (rows15-19)
    const LIFT_GAP1 = 36;
    s1LiftPos = { x: liftWallX + 8, z: liftZ };      // titik peringatan (di depan pintu)
    const lift = buildLiftBank({ facing: 'east', H: S1.H, open: false, gap: LIFT_GAP1 });
    lift.position.set(liftWallX, 0, liftZ);
    s1WorldRoot.add(lift);
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
    s1WorldRoot.add(s1ExitSign);
    s1ExitLight = new THREE.PointLight(0xff5040, 0.85, 200, 2);
    s1ExitLight.position.set(fp.x, S1.H - 8, fp.z);
    scene.add(s1ExitLight);
    registerStageLight('campaign-1', s1ExitLight);

    // --- Pencahayaan PER-RUANGAN: titik lampu TETAP (dibuat saat build → shader
    // compile sekali). MEKANISME "MATI LAMPU" DIHAPUS 2026-08-11 (permintaan
    // user): lampu langsung menyala penuh, tanpa selubung hitam & tanpa kedip. ---
    s1Lamps = [];
    const addLamp = (c, r, color, inten, dist, c0, r0, c1, r1) => {
        const p = s1Cell(c, r);
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(p.x, S1.H - 3, p.z);
        scene.add(L);
        registerStageLight('campaign-1', L);
        const lm = {
            L, base: inten,
            x0: S1.x0 + c0 * S1.CELL, x1: S1.x0 + (c1 + 1) * S1.CELL,
            z0: S1.z0 + r0 * S1.CELL, z1: S1.z0 + (r1 + 1) * S1.CELL
        };
        s1Lamps.push(lm);
        return lm;
    };
    addLamp(3, 4, 0xffd9a0, 0.9, 240, 1, 1, 7, 6);       // 0 start (A)
    addLamp(14, 3, 0xffe2b8, 0.95, 300, 9, 1, 19, 6);    // 1 conference W
    addLamp(24, 3, 0xffd9a0, 0.85, 260, 21, 1, 28, 6);   // 2 conference E
    addLamp(34, 8, 0xffe2b8, 0.9, 360, 30, 1, 38, 16);   // 3 supply room W
    addLamp(44, 8, 0xbfe4ff, 0.85, 360, 40, 1, 48, 16);  // 4 east-1 (dingin)
    addLamp(4, 12, 0xffd9a0, 0.85, 240, 1, 8, 7, 16);    // 5 office W
    addLamp(14, 12, 0xffe2b8, 0.9, 360, 9, 8, 20, 19);   // 6 central+lift
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
    // GABUNG semua perabot statis jadi belasan mesh (draw call + update matriks
    // turun drastis; blockers/nav TIDAK tersentuh karena berasal dari tabel).
    s1StaticBatch = addMergedStatic(s1WorldRoot, staticProps);
    s1BlockerIdx.rebuild();   // daftar blocker sudah final -> sebar ke kisi

    // Bake nav-grid TERAKHIR (semua blockers terisi): dinding dari grid, furnitur
    // dari resolve. Radius sampel 3 (< badan 3.5) agar celah sempit tetap lewat-able.
    const half = S1.CELL / 2;
    s1Nav = makeNavGrid(S1.x0, S1.z0, half, S1.G * 2, S1.G * 2, (x, z) => {
        if (!stage1Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });

    registerCampaignWorldRoot({
        key: 'campaign-1', root: s1WorldRoot, lightsKey: 'campaign-1',
        bounds: { x0: S1.x0 - size, x1: S1.x0 + size * 2, z0: S1.z0 - size, z1: S1.z0 + size * 2 },
        warmupViews: [{ x: cx, y: 0, z: cz }, s1Cell(S1_START.c, S1_START.r)],
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
// Jumlah dasar tabel (50) dan jumlah NYATA setelah `robotCountMul` stage 1
// (2026-08-16, permintaan user: robot stage 1 50% lebih banyak). Keduanya
// fungsi/const terpisah supaya smoke bisa menguji ATURANnya, bukan angkanya.
export const s1Wave1Base = S1_ROBOTS.reduce((a, s) => a + s[2], 0);   // 50
export const s1Wave1Count = () =>
    scaleSpawnCounts(S1_ROBOTS.map(s => s[2]), 1).reduce((a, n) => a + n, 0);
export function placeRobots() {
    const counts = scaleSpawnCounts(S1_ROBOTS.map(s => s[2]), 1);
    for (let si = 0; si < S1_ROBOTS.length; si++) {
        const [c, r] = S1_ROBOTS[si], n = counts[si];
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
    // Satu entri = satu robot; `robotCountMul` menambah salinan di jangkar yang
    // sama (kelas entri ikut tersalin, jadi komposisi kelasnya tak berubah).
    const counts = scaleSpawnCounts(S1_WAVE2.map(() => 1), 1);
    for (let i = 0; i < S1_WAVE2.length; i++) {
        const [cls, c, r] = S1_WAVE2[i];
        const p = s1Cell(c, r);
        for (let k = 0; k < counts[i]; k++) {
            _v3.set(p.x + rand(-6, 6), 0, p.z + rand(-6, 6));
            resolve(_v3, 4, 0);
            if (!stage1Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            spawnCampaignRobot(_v3.x, _v3.z, 1, cls);
        }
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
    [46, 36], [44, 37],            // east lower (c48 kini bank komputer '@')
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
    const n = scaleRobotCount(CFG.campaign.stage1.hordeCount || 0, 1);
    if (n <= 0) return;
    const per = Math.floor(n / S1_HORDE_ANCHORS.length), rem = n % S1_HORDE_ANCHORS.length;
    const spots = S1_HORDE_ANCHORS.map((a, i) => [a[0], a[1], per + (i < rem ? 1 : 0)]);
    spawnSwarm(spots, 1, s1Cell, stage1Walk, resolve, _v3, 'C');
}

// ===== ALARM HACK GAGAL (2026-07-28, permintaan user) =====
// ICE TRACE minigame habis → alarm gedung menyala: `alarmHordeCount` robot
// kelas C muncul DI LUAR PANDANGAN KAMERA lalu langsung memburu player, dan
// terminalnya TERKUNCI `alarmCooldownSec` detik supaya player punya waktu
// membereskan mereka dulu. Jangkar horde ruang X = cadangan bila titik luar-layar
// yang sah kurang (mis. player terpojok di ruangan kecil).
function s1AlarmHorde() {
    const H = CFG.campaign.hack;
    s1HackCd = H.alarmCooldownSec || 0;
    s1CompArmed = false;
    spawnAlarmHorde(1, {
        count: H.alarmHordeCount || 0, walkable: stage1Walk, resolve, scratch: _v3,
        minUnits: H.alarmSpawnMinUnits, maxUnits: H.alarmSpawnMaxUnits,
        cellFn: s1Cell, fallbackSpots: S1_HORDE_ANCHORS,
    });
    showStageMsg('ALARM TRIGGERED — the vault locked you out and a hunter squad is closing in! '
        + `Clear them out; the terminal reboots in ${Math.round(s1HackCd)}s.`, 5000);
}

// SATU petak pijak menyala pada satu waktu (standar marker aksi campaign), dan
// selalu sama dengan yang ditunjuk radar: 'access' saat objektifnya bank
// komputer '@', 'comp' saat objektifnya super komputer, null saat tak ada.
function s1SetMarker(which) {
    if (s1AccessMarker) s1AccessMarker.visible = which === 'access';
    if (s1CompMarker) s1CompMarker.visible = which === 'comp';
}

function showS1RadioLine(index, chars) {
    const line = S1_RADIO_DIALOGUE[index];
    if (!line) return;
    s1RadioChars = Math.max(0, Math.min(line.text.length, chars | 0));
    showStageRadioDialogue(
        line.speaker,
        line.text.slice(0, s1RadioChars),
        s1RadioChars < line.text.length,
    );
}

// Sesudah data diamankan, beri ruang untuk percakapan sebelum musuh menyerbu.
// Dunia tetap hidup, tetapi wave-2 sengaja belum dibuat dan kontrol player beku.
function beginS1Radio() {
    s1Phase = 'radio';
    s1RadioIndex = 0;
    s1RadioT = 0;
    s1RadioChars = 0;
    setCinematicActive(true);
    setCineBars(true);
    hideStageMsg();
    showS1RadioLine(0, 0);
}

function finishS1Radio() {
    hideStageRadioDialogue();
    setCineBars(false);
    setCinematicActive(false);
    s1RadioIndex = -1;
    s1RadioT = 0;
    s1RadioChars = 0;
    s1Phase = 'clear2';
    spawnWave2();                // 20 robot tambahan di ruang X
    spawnStage1Horde();          // + HORDE kelas C langsung menyerbu
    showStageMsg('Data secured — door control is yours, every sealed door opens now. '
        + 'A HORDE of robots swarms in — fight your way back to the stairs!', 5200);
}

function updateS1Radio(dt) {
    const dialogue = CFG.campaign.dialogue;
    const cps = Math.max(1, dialogue.cps);
    const holdSec = Math.max(0, dialogue.holdSec);
    s1RadioT += dt;
    // Satu frame/debug tick panjang tetap boleh melintasi lebih dari satu baris
    // tanpa merusak urutan atau menampilkan teks penuh secara mendadak.
    while (s1Phase === 'radio') {
        const line = S1_RADIO_DIALOGUE[s1RadioIndex];
        const typeSec = line.text.length / cps;
        const lineSec = typeSec + holdSec;
        if (s1RadioT < lineSec) {
            showS1RadioLine(s1RadioIndex, Math.floor(s1RadioT * cps));
            return;
        }
        showS1RadioLine(s1RadioIndex, line.text.length);
        s1RadioT -= lineSec;
        s1RadioIndex++;
        if (s1RadioIndex >= S1_RADIO_DIALOGUE.length) {
            finishS1Radio();
            return;
        }
        s1RadioChars = 0;
        showS1RadioLine(s1RadioIndex, 0);
    }
}

export const stage1Scene = {
    id: 'campaign-1',
    lightsKey: 'campaign-1',   // set lampu yang menyala (world/lighting.js)

    // Masuk stage 1 = mulai campaign (start pertama ATAU restart setelah mati).
    enter() {
        saveCampaignStage(1);
        ensureWorld();            // bangun SEMUA dunia campaign sekali (guard `built`)
        resetStageOccluders(S1_OCC);   // barikade kembali opak
        placeRobots();            // robot GELOMBANG 1 stage 1 (50 kelas C; stage 2 robotnya sendiri di stage2.enter)
        placeSupplies();          // supply room: 4 ammo + 2 medkit
        resetBarrels(); placeBarrels();   // barel peledak (bersihkan barel stage lain dulu)
        resetCrates(); placeCrates();     // peti persediaan (isi loot) di tiap ruangan
        applyLightPreset(scene, 'indoor');
        enterCityEnv();
        // Reset ALUR ke awal: fase access, unduh 0, pintu NAC TERKUNCI lagi.
        s1Phase = 'access'; s1CompArmed = true; s1HackCd = 0;
        s1RadioIndex = -1; s1RadioT = 0; s1RadioChars = 0;
        setCinematicActive(false);
        setCineBars(false);
        hideStageRadioDialogue();
        // Pintu kembali ke keadaan denah: NAC terkunci lagi, kedua pintu '+'
        // rusak lagi, semuanya tertutup — override kill-switch run sebelumnya
        // tidak boleh terbawa (mati/restart selalu mengulang stage ini).
        resetDoorLocks(s1doors); s1DoorsFreed = 0;
        s1ExitOpen = false;
        if (s1ExitSign) {
            s1ExitSign.material.color.setHex(0xff4a3c);
            s1ExitLight.color.setHex(0xff5040);
        }
        s1HintT = Date.now(); s1LiftT = 0;   // jangan langsung pop hint saat spawn
        s1SetMarker('access');               // objektif pertama = bank komputer '@'
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

    // Pintu geser + STATE MACHINE alur stage.
    updateMode(dt) {
        updateStageOccluders(S1_OCC, dt);
        updateStageDoors(s1doors, dt);
        const n = countStageRobots(1);
        const px = camera.position.x, pz = camera.position.z;
        const s1 = CFG.campaign.stage1;

        if (s1Phase === 'access') {
            // BERDIRI di petak '$' di depan bank komputer = hack selesai (tanpa
            // minigame, permintaan user 2026-08-12) → pintu NAC terbuka.
            if (s1AccessPos && Math.hypot(px - s1AccessPos.x, pz - s1AccessPos.z) < s1.computerRange) {
                s1Phase = 'download';
                if (s1NacDoor) setDoorLocked(s1NacDoor, false);
                s1SetMarker('comp');
                showStageMsg('Security bank breached — the server-room door is unlocked. Download the data.', 4600);
            }
        } else if (s1Phase === 'download') {
            // Player MENEMPEL terminal komputer → buka MINIGAME HACK (scene modal;
            // game di-pause selama puzzle). Pemicu harus "terisi" ulang dengan
            // MENJAUH sekali, supaya batal/gagal tidak langsung membuka puzzle lagi.
            if (s1HackCd > 0) s1HackCd = Math.max(0, s1HackCd - dt);   // cooldown alarm berjalan
            const near = s1CompPos && Math.hypot(px - s1CompPos.x, pz - s1CompPos.z) < s1.computerRange;
            if (!near) s1CompArmed = true;
            else if (s1CompArmed && s1HackCd <= 0) {
                s1CompArmed = false;
                s1Phase = 'downloading';
                beginHackMinigame({
                    head: 'MAINFRAME — DATA VAULT',
                    sub: 'The vault firewall is a live circuit. Rotate the chips so the ingress '
                        + 'port links to the data core, then the download runs itself.',
                    onSuccess: () => {
                        s1SetMarker(null);   // tak ada titik aksi lagi
                        // FILE KILL-SWITCH DIDAPAT = KENDALI PINTU GEDUNG JATUH
                        // KE PLAYER (2026-08-16, permintaan user): setiap pintu
                        // yang masih terkunci — termasuk kedua pintu RUSAK '+' —
                        // berubah jadi pintu otomatis biasa, jadi jalan pulang
                        // ke tangga terbuka lebar saat horde menyerbu.
                        s1DoorsFreed = overrideDoorLocks(s1doors);
                        beginS1Radio();
                    },
                    onFail: (why) => {
                        s1Phase = 'download';
                        if (why === 'abort') {
                            showStageMsg('Breach aborted — step away from the terminal and try again.', 3600);
                        } else {
                            s1AlarmHorde();   // ICE TRACE habis → alarm + horde + cooldown
                        }
                    },
                });
            }
        } else if (s1Phase === 'radio') {
            updateS1Radio(dt);
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
        const mt = Date.now() * 0.004;
        pulseStandMarker(s1AccessMarker, mt);
        pulseStandMarker(s1CompMarker, mt);

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
        resolve(pos, propClearance(), feetY);              // perabot: radius lebih ramping (lihat propClearance)
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
                showStageMsg(s1Phase === 'access'
                    ? 'Breach the security console to unlock the server room first.'
                    : (s1Phase === 'clear2'
                        ? 'Eliminate every hostile before you can descend.'
                        : 'Download the data from the server room first.'), 2400);
            }
        }
    },

    groundHeight(x, z, feetY) {
        return blockersGroundHeight(x, z, feetY, s1BlockerIdx.gather(x, z, 2, false));
    },

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
            pathWalkable: (x, z, r) => doorsWalkable(s1doors, x, z, r),
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
            case 'access': return `FLOOR 2 — Robots: ${n} | Reach the marked security console to unlock the server room`;
            case 'download': return s1HackCd > 0
                ? `FLOOR 2 — ALARM! Terminal rebooting: ${Math.ceil(s1HackCd)}s | Hostiles: ${n}`
                : 'FLOOR 2 — Server room unlocked — reach the terminal and download the data';
            case 'downloading': return 'FLOOR 2 — Breaching the vault firewall…';
            case 'radio': return 'FLOOR 2 — Data secured | Incoming transmission…';
            case 'clear2': return `FLOOR 2 — Hostiles inbound! Robots: ${n} | Fight back to the stairs`;
            default: return 'FLOOR 2 — Area secured — return to the stairs to descend';
        }
    },

    // Landmark radar: objektif saat ini — bank komputer '@' saat access, super
    // komputer saat download..radio, tangga NW saat clear2/done. Warna = merah
    // bila belum siap / hijau-teal bila siap. Selalu SAMA dengan petak pijak
    // yang menyala.
    radarLandmarks(plot) {
        if (s1Phase === 'access') {
            if (s1AccessPos) plot(s1AccessPos.x - camera.position.x, s1AccessPos.z - camera.position.z,
                '#7fe3ff', 5, true);
        } else if (s1Phase === 'download' || s1Phase === 'downloading' || s1Phase === 'radio') {
            if (s1CompPos) plot(s1CompPos.x - camera.position.x, s1CompPos.z - camera.position.z,
                '#7fe3ff', 5, true);
        } else {
            const fx = S1.x0 + (S1_FINISH.c0 + S1_FINISH.c1 + 1) / 2 * S1.CELL;
            const fz = S1.z0 + (S1_FINISH.r0 + S1_FINISH.r1 + 1) / 2 * S1.CELL;
            plot(fx - camera.position.x, fz - camera.position.z,
                s1Phase === 'done' ? '#2eff6a' : '#ff5040', 5, true);
        }
    },
};
