// SCENE: Campaign STAGE 3 — "Gedung Terbengkalai" indoor, LANTAI PABRIK ROBOT.
// DIROMBAK TOTAL 2026-07-21 mengikuti PLAN RESMI user (stage3-v2.csv, 40x40).
// Legenda plan: '#'=dinding, '-'=pintu geser, '+'=PINTU BLAST yang DIBUKA setelah
// 5 TERMINAL di-hack (2026-07-28 — DULU dihancurkan dgn menembak; CFG.campaign.
// stage3.doorHp kini DORMAN), 'T'=TANGGA rusak (sumber spawn
// robot), 'L'=LIFT (titik MASUK/spawn player), 'W'=ruang SUPPLY (6 ammo + 3
// medkit), 'R'=toilet, 'S'=MESIN PEMBUAT ROBOT (4 buah 2x2, 2 kiri 2 kanan, HP
// machineHp — dihancurkan dgn menembak), 'X'=ruang PABRIK (arena akhir), 'o'=PINTU
// KELUAR gedung (finish → transisi stage 4). Grid sel 2 m (dinding/collision/LOS/
// hit-peluru dari grid yang sama; pola stage1/2). Konektivitas BFS-verified.
//
// ALUR (state machine `s3Phase`, `s3Debug()`):
//   1. 'door'     : spawn dari LIFT. **DIROMBAK 2026-07-28 (permintaan user):** PINTU
//                   BLAST TIDAK BISA DIHANCURKAN lagi. Ia terbuka setelah player
//                   MENG-HACK 5 KOMPUTER yang tersebar di 5 ruangan (S3_TERMINALS:
//                   ruang C, ruang D, ruang kiri-lift, ruang kanan-chamber, ruang
//                   SUPPLY W). Terminal harus di-hack BERURUTAN, dan urutannya
//                   DIACAK tiap masuk stage. Layar terminal = rambu status: MERAH
//                   belum giliran, HIJAU giliran sekarang, KUNING sudah selesai.
//                   Pintu blast punya lampu sendiri: MERAH terkunci, HIJAU terbuka.
//                   MENEMPEL terminal HIJAU membuka MINIGAME "ICE BREACH"
//                   (utility/hackMinigame.js — 2026-07-28, menggantikan bar
//                   progress hackSec): puzzle sirkuit di scene modal, game
//                   di-PAUSE selama dimainkan. Papan makin besar tiap dua
//                   terminal. Batal/kehabisan ICE TRACE = terminal tetap belum
//                   ter-hack; player harus MENJAUH dulu sebelum mencoba lagi.
//                   Tiap hack SELESAI melepas GELOMBANG robot (6 dari TANGGA + 6
//                   dari LIFT, gateWaveCount, kelas ACAK C50/B25/A25, LANGSUNG
//                   mengejar ke mana pun player berada). Gelombang itu TIDAK
//                   di-respawn — tak ada robot baru sampai hack BERIKUTNYA selesai.
//                   Hack ke-5 selesai → pintu MEMBUKA (naik ke plafon) → 'toX'.
//   2. 'toX'      : robot sisa tetap mengejar; masuk ruang X (lewati bekas pintu).
//   3. 'machines' : 4 MESIN aktif. JANGAN langsung spawn — TUNDA machineFirstWaveSec
//                   (3 dtk), lalu GELOMBANG machineWaveCount (4) robot PER MESIN
//                   hidup; sisa < reinforceThreshold → respawn respawnSec (8 dtk).
//                   Hancurkan ke-4 mesin dgn menembak. Drop ammo/medkit di X DIGANDAKAN.
//   4. 'done'     : SEMUA mesin hancur + SEMUA robot habis → PINTU KELUAR 'o'
//                   AKTIF (hijau). Capai 'o' → beginStageTransition(stage4).

import { CFG, CAMP_M } from '../../../core/config.js';
import { player, robots, _v3, bullets, stats, addScore, setCinematicActive } from '../../../core/state.js';
import { scene, camera, addCamShake } from '../../../core/renderer.js';
import { makeTexture, speckle } from '../../../utils/textures.js';
import { rand, segPointDist2 } from '../../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { addMergedStatic } from '../../../utils/meshBatch.js';
import { applyLightPreset, registerStageLight } from '../../../world/lighting.js';
import { PAL } from '../../../world/palette.js';
import { showStageMsg, showPickup } from '../../../core/dom.js';
import { beginHackMinigame, hackGridSize } from '../utility/hackMinigame.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { updateUI } from '../../../core/hud.js';
import { NADE_R } from '../../../entities/grenades.js';
import { disposeRobot, queueBoom } from '../../../entities/robots.js';
import { spawnBloodBurst, explodeAt, spawnGroundPuff } from '../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../entities/gore.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../../entities/futuristicCupboard.js';
import { buildFuturisticCrateMesh } from '../../../entities/futuristicCrate.js';
import { buildFuturisticMeetingTableMesh } from '../../../entities/futuristicMeetingTable.js';
import { buildFuturisticStallMesh } from '../../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../../entities/futuristicSink.js';
import { buildFuturisticBenchMesh } from '../../../entities/futuristicBench.js';
import { buildFuturisticPlanterMesh } from '../../../entities/futuristicPlanter.js';
import { buildFuturisticSofaMesh } from '../../../entities/futuristicSofa.js';
import { buildFuturisticConsoleMesh } from '../../../entities/futuristicConsole.js';
import { buildFuturisticRubbleMesh } from '../../../entities/futuristicRubble.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, updateRoomLamps, resetRoomLamps, campaignAwardKill, spawnAlarmHorde } from '../utility/common.js';
import { spawnBarrel, resolveBarrelBlock, resetBarrels } from '../../../entities/barrels.js';
import { spawnCrate, resolveCrateBlock, resetCrates } from '../../../entities/crates.js';
import { buildInteriorFloorMat, buildInteriorWallMat } from '../utility/interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors, doorBlocksShot, doorClampShot } from '../utility/doors.js';
import { buildStairwellUp, stairwellUpFootprint } from '../utility/stairwell.js';
import { buildLiftBank } from '../utility/lift.js';
import { buildCampaignCityscape, enterCityEnv } from '../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
import { stage1Scene } from './stage1.js';
import { stage4Scene } from './stage4.js';

// Grid 40x40 (sel 2 m). Gedung ~90 km dari origin.
export const S3 = {
    G: 40, ROWS: 40, CELL: 2 * CAMP_M, H: 22,
    x0: 90000 - 20 * 2 * CAMP_M,
    z0: -20 * 2 * CAMP_M
};
export let s3grid = null;
export const s3Cell = (c, r) => ({ x: S3.x0 + (c + 0.5) * S3.CELL, z: S3.z0 + (r + 0.5) * S3.CELL });
export const S3_START = { c: 10, r: 16 };        // spawn di LIFT (titik masuk)
const S3_STAIRS_SPAWN = { c: 4, r: 6 };          // sumber spawn robot: tangga rusak (kiri-atas)
const S3_LIFT_SPAWN = { c: 10, r: 19 };          // sumber spawn robot: lift (selatan nook)
export const S3_END = { c: 19, r: 38 };          // PINTU KELUAR 'o' (finish, selatan-tengah)
const S3_EXIT = { c0: 18, r0: 37, c1: 21, r1: 39 };  // rect trigger keluar gedung
// PINTU BLAST '+': bukaan c18-21 di dinding baris 29. **TIDAK LAGI DIHANCURKAN
// dgn tembak (2026-07-28)** — dibuka oleh 5 terminal hack di bawah.
const S3_PLUS = { c0: 18, c1: 21, r: 29 };
// ===== 5 TERMINAL HACK (2026-07-28, permintaan user) =====
// Tiap terminal 2x1 SEL, menempel dinding di UJUNG ruangannya, satu per ruangan:
//   `c`,`r` = sel KIRI dari pasangan 2 sel (pasangannya c+1); `face` = arah layar
//   menghadap (+1 = ke selatan/+z, -1 = ke utara/-z); `stand` = sel tempat player
//   berdiri (dipakai jarak pemicu hack, `CFG.campaign.stage3.hackRange`).
// Dua di antaranya sengaja ditaruh di DUA RUANGAN YANG SELAMA INI KOSONG (kiri
// lift & kanan chamber) — sebelumnya keduanya tanpa perabot & tanpa alasan
// dikunjungi. Titik-titiknya dipilih bebas dari perabot, peti, barel & supply.
const S3_TERMINALS = [
    { room: 'Ruang C', c: 24, r: 1, face: 1, sc: 24.5, sr: 2 },
    { room: 'Ruang D', c: 34, r: 1, face: 1, sc: 34.5, sr: 2 },
    { room: 'West Wing', c: 3, r: 12, face: 1, sc: 3.5, sr: 13 },
    { room: 'East Wing', c: 35, r: 12, face: 1, sc: 35.5, sr: 13 },
    { room: 'Supply Room', c: 2, r: 28, face: -1, sc: 2.5, sr: 27 },
];
// Warna layar terminal = rambu gameplay (bukan dekor): MERAH belum giliran,
// HIJAU giliran sekarang, KUNING sudah di-hack. Hijau/merah senada rambu EXIT.
const HACK_LOCKED = 0xff3b2e, HACK_READY = 0x2eff6a, HACK_DONE = 0xffd23b;
// 4 MESIN PEMBUAT ROBOT (2x2): 2 kiri (c2-3) + 2 kanan (c36-37). cc/cr = sel
// pojok kiri-atas 2x2; sc/sr = sel tempat robot MUNCUL (di aisle terdekat).
const S3_MACHINES_DEF = [
    { cc: 2, cr: 32, sc: 6, sr: 32, face: 1 },    // kiri-atas — hatch menghadap TIMUR (pusat X)
    { cc: 2, cr: 35, sc: 6, sr: 36, face: 1 },    // kiri-bawah
    { cc: 36, cr: 32, sc: 33, sr: 32, face: -1 }, // kanan-atas — hatch menghadap BARAT
    { cc: 36, cr: 35, sc: 33, sr: 36, face: -1 }, // kanan-bawah
];

// DENAH RESMI (stage3-v2.csv). 40x40. JANGAN ubah tanpa update S3_DOORS/S3_PLUS/
// S3_MACHINES/S3_EXIT + tes ulang.
const S3_MAP = [
    '########################################',   // 0
    '#......#...........#..........#........#',   // 1
    '#......#...........#..........#........#',   // 2
    '#......#...........#..........#........#',   // 3
    '#......#...........#..........#........#',   // 4
    '#......#...........#..........#........#',   // 5
    '#......#...........#..........#........#',   // 6
    '#......#...........#..........#........#',   // 7
    '#......#...........#####..#######......#',   // 8
    '#......................................#',   // 9
    '#......................................#',   // 10
    '#########.....#..............#..########',   // 11
    '#.............#..............#..#......#',   // 12
    '#.............#..............#..#......#',   // 13
    '#.......#.....#..............#..#......#',   // 14
    '#.......#..............................#',   // 15
    '#.......#..............................#',   // 16
    '#.......#.....#..............#..#......#',   // 17
    '#.......#.....#..............#..#......#',   // 18
    '#.......#.....#..............#..#......#',   // 19
    '############..#..............#..########',   // 20
    '#......................................#',   // 21
    '#......................................#',   // 22
    '#..........#....................#......#',   // 23
    '#..........#....................#......#',   // 24
    '#..........#....................#......#',   // 25
    '#..........#....................#......#',   // 26
    '#..........#....................#......#',   // 27
    '#..........#....................#......#',   // 28
    '##################....##################',   // 29
    '#......................................#',   // 30
    '#......................................#',   // 31
    '#......................................#',   // 32
    '#......................................#',   // 33
    '#......................................#',   // 34
    '#......................................#',   // 35
    '#......................................#',   // 36
    '#......................................#',   // 37
    '#......................................#',   // 38
    '##################....##################',   // 39
];

// PINTU geser otomatis di bukaan '-' plan (6 pintu).
const S3_DOORS = [
    { c0: 24, r0: 8, c1: 25, r1: 8, dir: 'ns' },     // ruang tengah-atas <-> koridor
    { c0: 32, r0: 9, c1: 32, r1: 10, dir: 'ew' },    // koridor: split kiri/kanan
    { c0: 8, r0: 12, c1: 8, r1: 13, dir: 'ew' },     // kiri-tengah <-> lift area
    { c0: 32, r0: 15, c1: 32, r1: 16, dir: 'ew' },   // tengah <-> kanan-tengah
    { c0: 11, r0: 21, c1: 11, r1: 22, dir: 'ew' },   // SUPPLY (W) <-> tengah-bawah
    { c0: 32, r0: 21, c1: 32, r1: 22, dir: 'ew' },   // tengah-bawah <-> toilet (R)
];
// PERABOT TAMBAHAN per-ruangan (2026-07-26): [kind, c, r, sx, sy, sz]. Ditempel
// dinding/sudut supaya ruangan terasa dipakai TANPA menyumbat jalur — mulut
// pintu, bukaan PINTU BLAST (c18-21), pintu keluar 'o', titik spawn robot dan
// area kerja 4 mesin dibiarkan bersih. Ruang PABRIK X sengaja tetap lapang
// (arena akhir) — hanya pinggirnya yang diisi.
const S3_FURNITURE = [
    // ruang TANGGA (kiri-atas)
    ['cupboard', 6, 3, 6, 15, 20], ['desk', 2, 7, 14, 7, 10],
    // ruang B
    ['cupboard', 8, 1, 6, 15, 20], ['planter', 18, 2, 8, 11, 8], ['box', 12, 7, 12, 9, 12],
    // ruang C
    ['cupboard', 29, 2, 6, 15, 24], ['planter', 20, 7, 8, 11, 8], ['box', 27, 3, 12, 9, 12],
    // ruang D
    ['cupboard', 31, 2, 6, 15, 24], ['box', 37, 2, 12, 9, 12], ['desk', 33, 7, 18, 7, 10],
    // area LIFT
    ['cupboard', 12, 15, 6, 15, 16],
    // chamber tengah
    ['cupboard', 28, 12, 6, 15, 24], ['desk', 20, 13, 20, 7, 12],
    ['box', 16, 19, 12, 9, 12], ['planter', 22, 19, 8, 11, 8],
    // tengah-bawah (jalur ke pintu blast)
    ['cupboard', 31, 24, 6, 15, 26], ['desk', 17, 27, 20, 7, 12],
    ['box', 24, 22, 12, 9, 12], ['bench', 13, 25, 16, 6, 7],
    // ruang SUPPLY (W)
    ['cupboard', 10, 26, 6, 15, 20], ['box', 5, 22, 12, 9, 12],
    // toilet (R)
    ['stall', 37, 22, 2, 15, 10], ['sink', 33, 27, 10, 8, 4],
    // PABRIK X — hanya pinggir (arena akhir tetap lapang)
    ['cupboard', 1, 31, 6, 15, 20], ['box', 10, 38, 14, 9, 14], ['planter', 17, 31, 8, 11, 8],
    ['cupboard', 38, 31, 6, 15, 20], ['box', 29, 38, 14, 9, 14], ['planter', 22, 31, 8, 11, 8],

    // === PEMADATAN LANJUTAN (2026-07-26 pass 2, permintaan user: ruangan masih
    // terasa kosong). Menempel dinding/sudut; bukaan PINTU BLAST, pintu keluar,
    // hatch mesin, titik spawn & jalur supply tetap bersih. ===
    ['cupboard', 5, 1, 20, 15, 6], ['rubble', 2, 10, 12, 9, 12],                   // ruang tangga
    ['desk', 10, 1, 22, 7, 12], ['cupboard', 16, 1, 20, 15, 6], ['box', 13, 1, 14, 9, 14],     // ruang B
    ['planter', 9, 8, 8, 11, 8], ['sofa', 17, 4, 18, 6, 14],
    ['cupboard', 28, 1, 20, 15, 6], ['box', 20, 6, 14, 9, 14], ['planter', 23, 1, 8, 11, 8],   // ruang C
    ['cupboard', 38, 8, 6, 15, 20], ['box', 37, 1, 14, 9, 14], ['bench', 32, 1, 18, 6, 7],     // ruang D
    ['box', 12, 11, 14, 9, 14], ['console', 12, 18, 16, 7, 8],                     // area LIFT
    ['desk', 14, 15, 22, 7, 12], ['cupboard', 15, 19, 6, 15, 20], ['box', 27, 11, 14, 9, 14],  // chamber tengah
    ['console', 27, 20, 16, 7, 8], ['planter', 28, 15, 8, 11, 8], ['sofa', 16, 11, 18, 6, 14],
    ['desk', 29, 21, 22, 7, 12], ['cupboard', 14, 28, 20, 15, 6], ['box', 30, 25, 14, 9, 14],  // tengah-bawah
    ['bench', 16, 21, 18, 6, 7], ['planter', 26, 27, 8, 11, 8], ['sofa', 25, 21, 18, 6, 14],
    ['cupboard', 1, 22, 6, 15, 20], ['box', 1, 25, 14, 9, 14],                     // ruang SUPPLY (W)
    ['stall', 38, 21, 10, 15, 2], ['sink', 38, 28, 10, 8, 4],                      // toilet (R)
    ['box', 1, 37, 14, 9, 14], ['cupboard', 1, 33, 6, 15, 20], ['rubble', 16, 30, 12, 9, 12],  // PABRIK X barat (pinggir)
    ['box', 12, 30, 14, 9, 14], ['planter', 8, 38, 8, 11, 8],
    ['box', 37, 30, 14, 9, 14], ['cupboard', 37, 38, 20, 15, 6], ['rubble', 23, 38, 12, 9, 12],// PABRIK X timur (pinggir)
    ['box', 26, 30, 14, 9, 14], ['planter', 32, 30, 8, 11, 8],

    // --- pass 3: chamber tengah, jalur bawah & pinggiran pabrik yang masih melompong ---
    ['bench', 8, 8, 7, 6, 18], ['box', 8, 3, 14, 9, 14],                           // ruang B
    ['box', 11, 11, 14, 9, 14],                                                    // area LIFT
    ['box', 15, 13, 14, 9, 14], ['cupboard', 15, 17, 6, 15, 20], ['bench', 28, 16, 18, 6, 7], // chamber tengah
    ['planter', 27, 12, 8, 11, 8], ['desk', 24, 20, 22, 7, 12],
    ['box', 12, 27, 14, 9, 14], ['cupboard', 31, 27, 6, 15, 20], ['console', 16, 28, 16, 7, 8],// tengah-bawah
    ['planter', 27, 28, 8, 11, 8], ['desk', 29, 22, 22, 7, 12],
    ['box', 5, 21, 14, 9, 14], ['bench', 6, 28, 18, 6, 7], ['planter', 3, 24, 8, 11, 8],       // ruang SUPPLY (W)
    ['box', 36, 21, 14, 9, 14],                                                    // toilet (R)
    ['box', 1, 35, 14, 9, 14], ['cupboard', 2, 30, 20, 15, 6], ['planter', 15, 30, 8, 11, 8],  // PABRIK X barat
    ['rubble', 5, 38, 12, 9, 12],
    ['box', 36, 30, 14, 9, 14], ['cupboard', 35, 38, 20, 15, 6], ['planter', 24, 38, 8, 11, 8],// PABRIK X timur
    ['rubble', 27, 30, 12, 9, 12],
];

export const s3FurnitureDbg = () => S3_FURNITURE;   // smoke test (kepadatan & tumpang tindih)
let s3StaticBatch = [];                              // mesh perabot hasil penggabungan
export const s3StaticBatchDbg = () => s3StaticBatch; // smoke test (jumlah draw call perabot)

let s3doors = null;

// Lampu per-ruangan.
let s3Lamps = [];
export const s3LampsDbg = () => s3Lamps;   // smoke test (rect ruangan)
let s3HintT = 0;

// ===== DESTRUCTIBLE: PINTU BLAST '+' + 4 MESIN + PINTU KELUAR =====
let s3Phase = 'door';   // door | toX | machines | done
let s3SpawnT = 0;        // timer GELOMBANG (respawn 8 dtk setelah gelombang bersih; HANYA fase machines)
let s3Door = null, s3DoorBlocker = null;   // mesh + blocker pintu blast
let s3DoorCX = 0, s3DoorCZ = 0;
// PINTU BLAST kini DIBUKA (naik ke plafon), bukan dihancurkan (2026-07-28).
let s3DoorOpen = false, s3DoorK = 0;
let s3DoorSign = null, s3DoorLight = null;   // rambu status pintu: MERAH terkunci / HIJAU terbuka
// ===== TERMINAL HACK (2026-07-28) =====
// `s3Terms` = [{def, group, cx, cz, sx, sz, screens[], blocker}]; `s3HackOrder` =
// urutan ACAK indeks terminal (diacak tiap enter); `s3HackIdx` = berapa yang sudah
// selesai (= indeks giliran berikutnya); `s3Hacking` = MINIGAME hack sedang
// terbuka; `s3HackArmed` = pemicu siap (terisi ulang saat player menjauh).
let s3Terms = [];
let s3HackOrder = [], s3HackIdx = 0, s3Hacking = false, s3HackArmed = true;
let s3HackCd = 0;   // COOLDOWN alarm (dtk): terminal terkunci setelah hack GAGAL
let s3Machines = [];    // [{group, cx, cz, spawn, hp, alive, spawnT, hitT, eyeMat, blocker}]
let s3ExitSign = null, s3ExitLight = null, s3ExitDoor = null, s3ExitOpen = false;
// ===== ANTREAN SPAWN + ANIMASI MUNCUL (2026-07-26, permintaan user) =====
// Robot TIDAK lagi muncul serentak: satu gelombang di-ANTRE lalu dilepas satu
// per satu tiap `spawnGapSec` (0.3 dtk) dari tangga / lift / hatch mesin. Tiap
// robot juga MUNCUL BERANIMASI — mesh-nya tumbuh dari nyaris nol ke skala penuh
// selama `spawnRiseSec` sambil memancarkan kilat teal + debu di titik keluarnya,
// jadi tidak "tiba-tiba ada". MURNI VISUAL: hit-test tetap memakai z.scl penuh
// (robot yang sedang muncul tetap adil ditembak) dan AI-nya jalan seperti biasa.
let s3Queue = [];    // [{cell, cls}] menunggu giliran spawn
let s3QueueT = 0;    // hitung mundur ke pelepasan berikutnya
let s3Rising = [];   // [{z, t, base}] robot yang sedang animasi tumbuh
export const s3SpawnDbg = () => ({ queued: s3Queue.length, rising: s3Rising.length });
export const s3Debug = () => ({
    phase: s3Phase, machinesAlive: s3MachinesAlive(), robots: countStageRobots(3), spawnT: s3SpawnT,
    hacked: s3HackIdx, hackTotal: S3_TERMINALS.length, hacking: s3Hacking, armed: s3HackArmed, hackCd: s3HackCd,
});
export const s3DoorDbg = () => ({
    open: s3DoorOpen, k: s3DoorK, visible: s3Door ? s3Door.visible : null,
    blocked: blockers.indexOf(s3DoorBlocker) !== -1,
    signHex: s3DoorSign ? s3DoorSign.material.color.getHex() : null,
});
// Debug/uji terminal hack: posisi, ruangan, urutan acak & warna layar tiap unit.
export const s3HackDbg = () => ({
    order: [...s3HackOrder], idx: s3HackIdx, hacking: s3Hacking,
    terms: s3Terms.map((t, i) => ({
        room: t.def.room, c: t.def.c, r: t.def.r, cx: t.cx, cz: t.cz,
        sx: t.sx, sz: t.sz, state: t.state,
        hex: t.screens.length ? t.screens[0].material.color.getHex() : null,
        blocked: blockers.indexOf(t.blocker) !== -1, i,
    })),
});
export const s3MachinesDbg = () => s3Machines;

const blockers = [];
let built = false;

export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;

function buildS3Grid() {
    s3grid = S3_MAP.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
}

export function s3Wall(c, r) {
    return c < 0 || r < 0 || c >= S3.G || r >= S3.ROWS || s3grid[r][c] === 1;
}

export function stage3Walk(x, z, r) {
    if (!s3grid) return false;
    const c0 = Math.floor((x - r - S3.x0) / S3.CELL), c1 = Math.floor((x + r - S3.x0) / S3.CELL);
    const r0 = Math.floor((z - r - S3.z0) / S3.CELL), r1 = Math.floor((z + r - S3.z0) / S3.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s3Wall(cc, rr)) return false;
    return true;
}

export function s3LOS(x1, z1, x2, z2) {
    if (!s3grid) return true;
    const dx = x2 - x1, dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (S3.CELL * 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + dx * t - S3.x0) / S3.CELL);
        const r = Math.floor((z1 + dz * t - S3.z0) / S3.CELL);
        if (s3Wall(c, r)) return false;
    }
    return true;
}

export function s3SegHitsWall(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 7));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + (x2 - x1) * t - S3.x0) / S3.CELL);
        const r = Math.floor((z1 + (z2 - z1) * t - S3.z0) / S3.CELL);
        if (s3Wall(c, r)) return true;
    }
    return false;
}

// Uji ruas 2D vs kotak AABB (sampel) — dipakai hit-peluru PINTU BLAST lebar.
function segHitsRect(x0, z0, x1, z1, cx, cz, hx, hz) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (Math.abs(x0 + (x1 - x0) * t - cx) <= hx && Math.abs(z0 + (z1 - z0) * t - cz) <= hz) return true;
    }
    return false;
}

export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

export let s3Nav = null;
const s3MachinesAlive = () => s3Machines.reduce((a, m) => a + (m.alive ? 1 : 0), 0);

// ===== MESIN PEMBUAT ROBOT (futuristik, footprint 2x2 ~28 u, tinggi ~17) =====
// Ruang fabrikasi inti teal + gantry + hatch emitter (muka DEPAN +z) tempat robot
// keluar + SENSOR MERAH (faksi robot). GIBS-2045 (gunmetal/steel/panel/ink + teal
// + hazard). Lambert/Basic (warm, tanpa recompile). Menghadap PUSAT ruang X.
function buildSpawnMachine() {
    const g = new THREE.Group();
    const W = 26, H = 17, D = 26, f = 1;   // hatch di muka +z lokal (grup diputar ke pusat X di buildWorld)
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const panel = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const teal = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2b1f, toneMapped: false });   // sensor merah faksi robot
    const box = (mat, sx, sy, sz, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    const cyl = (mat, r, h, x, y, z, ax = 'y') => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), mat);
        m.position.set(x, y, z);
        if (ax === 'x') m.rotation.z = Math.PI / 2; else if (ax === 'z') m.rotation.x = Math.PI / 2;
        m.castShadow = true; g.add(m); return m;
    };
    // Fondasi + 4 pilar sudut + rangka atas
    box(ink, W, 2.4, D, 0, 1.2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(steel, 2.6, H, 2.6, sx * (W / 2 - 2), 2.4 + H / 2, sz * (D / 2 - 2));
    box(gun, W, 2.2, D, 0, 2.4 + H, 0);
    // Dinding belakang (jauh dari pusat) + samping
    box(gun, W, H - 2, 2.4, 0, 2.4 + (H - 2) / 2, -f * (D / 2 - 1.4));
    box(panel, 2.4, H - 2, D - 6, -W / 2 + 1.4, 2.4 + (H - 2) / 2, 0);
    box(panel, 2.4, H - 2, D - 6, W / 2 - 1.4, 2.4 + (H - 2) / 2, 0);
    // Ruang fabrikasi: inti teal menyala + cincin baja
    cyl(teal, 4.5, H - 4, 0, 2.4 + (H - 4) / 2, 0);
    for (const yy of [5, 9, 13]) cyl(steel, 5.2, 0.9, 0, yy, 0);
    // Gantry + lengan robotik di atas inti
    box(steel, 3, 3, 16, 0, 2.4 + H - 1.5, 0);
    box(gun, 2.2, 6, 2.2, 6, 2.4 + H - 6, 0);
    // Hatch emitter di muka DEPAN (ke pusat X, f) tempat robot keluar
    box(gun, 14, 12, 1.6, 0, 8, f * (D / 2 - 0.8));
    box(teal, 10, 8, 0.8, 0, 8, f * (D / 2 - 0.2));
    const eye = box(eyeMat, 5, 1.7, 0.7, 0, 15, f * (D / 2 - 0.1));   // sensor merah (kilat tertembak)
    box(hazard, W - 6, 1, 0.8, 0, 3.2, f * (D / 2 - 0.2));
    // Pipa + antena
    for (const sx of [-1, 1]) cyl(steel, 1, D - 4, sx * (W / 2 - 4), 2.4 + H - 3, 0, 'z');
    cyl(steel, 0.5, 6, 0, 2.4 + H + 3, 0);
    return { group: g, eyeMat };
}

// PINTU BLAST '+' (dihancurkan dgn tembak): slab tebal + rusuk baja + strip
// hazard + panel kunci teal. w = lebar bukaan (4 sel).
function buildBlastDoor(w) {
    const g = new THREE.Group();
    const H = S3.H, D = 4.5;
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const teal = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const white = new THREE.MeshBasicMaterial({ color: PAL.white, toneMapped: false });
    const box = (mat, sx, sy, sz, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    box(gun, w, H - 1, D, 0, (H - 1) / 2, 0);
    for (let x = -w / 2 + 5; x <= w / 2 - 5; x += 10) box(steel, 2.4, H - 3, D + 0.6, x, (H - 1) / 2, 0);
    for (const yy of [H * 0.3, H * 0.68]) box(steel, w - 2, 2.2, D + 0.4, 0, yy, 0);
    for (const s of [-1, 1]) for (let i = -2; i <= 2; i++)
        box(i % 2 ? hazard : white, 5, 2.4, 0.5, i * 6, H * 0.5, s * (D / 2 + 0.2));
    box(ink, 10, 8, 0.9, 0, H * 0.5, D / 2 + 0.3);
    box(teal, 6, 4, 0.8, 0, H * 0.5, D / 2 + 0.6);
    return g;
}

// ===== TERMINAL HACK 2x1 sel (2026-07-28) =====
// Meja konsol menempel dinding + LAYAR MIRING besar yang menghadap ke dalam
// ruangan. Layar + strip status memakai MeshBasicMaterial SENDIRI per unit
// (toneMapped off) — warnanya diganti runtime (merah/hijau/kuning) hanya lewat
// `color.setHex`, jadi TANPA recompile shader. Dibangun sekali bersama dunia.
// `face` = +1 layar menghadap +z (selatan), -1 menghadap -z.
function buildHackTerminal(face) {
    const g = new THREE.Group();
    const W = S3.CELL * 2 - 3;          // 2 sel (dikurangi sedikit agar tak menempel dinding samping)
    const D = S3.CELL - 4;
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    // Material RAMBU (per-unit — warnanya berbeda antar terminal)
    const sig = new THREE.MeshBasicMaterial({ color: HACK_LOCKED, toneMapped: false });
    const box = (mat, sx, sy, sz, x, y, z, rx) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        return m;
    };
    const f = face >= 0 ? 1 : -1;
    box(gun, W, 9, D, 0, 4.5, 0);                                  // badan konsol
    box(steel, W + 1.5, 1.2, D + 1.5, 0, 9.4, 0, 0);               // bibir meja
    box(ink, W - 4, 0.8, D - 5, 0, 10.1, f * 1.5, 0);              // papan ketik gelap
    box(gun, 3, 11, 3, 0, 15, -f * (D / 2 - 1.5));                 // tiang penyangga layar
    const screen = box(ink, W - 6, 10, 1.2, 0, 17, -f * (D / 2 - 3), f * 0.32);   // bezel layar (miring)
    const glow = box(sig, W - 9, 7.4, 0.6, 0, 17.2, -f * (D / 2 - 3.9), f * 0.32); // LAYAR = rambu status
    const strip = box(sig, W - 4, 1.1, 0.6, 0, 10.9, f * (D / 2 + 0.1));           // strip status di bibir meja
    void screen;
    return { group: g, screens: [glow, strip] };
}

export function buildWorld() {
    buildS3Grid();
    const sizeX = S3.G * S3.CELL, sizeZ = S3.ROWS * S3.CELL;
    const cx = S3.x0 + sizeX / 2, cz = S3.z0 + sizeZ / 2;

    // --- Lantai (panel fasilitas terang) ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), buildInteriorFloorMat(S3.G, S3.ROWS));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    buildCampaignCityscape(cx, cz, sizeX / 2, sizeZ / 2);

    // --- Plafon (disembunyikan; top-down) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#26231e'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#201d18', '#2d2923', '#1a1813'], 120, 1, 4);
    }, S3.G, S3.ROWS);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S3.H, cz);
    ceil.visible = false;
    scene.add(ceil);

    // --- Dinding (InstancedMesh) ---
    const wallCells = [];
    for (let r = 0; r < S3.ROWS; r++) for (let c = 0; c < S3.G; c++) {
        if (s3grid[r][c] !== 1) continue;
        let nearFloor = false;
        for (let dr = -1; dr <= 1 && !nearFloor; dr++)
            for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                if (!s3Wall(c + dc, r + dr)) nearFloor = true;
        if (nearFloor) wallCells.push([c, r]);
    }
    const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(S3.CELL, S3.H, S3.CELL), buildInteriorWallMat(), wallCells.length);
    {
        const _m = new THREE.Matrix4(), _c = new THREE.Color();
        wallCells.forEach(([c, r], i) => {
            const p = s3Cell(c, r);
            _m.setPosition(p.x, S3.H / 2, p.z);
            wallMesh.setMatrixAt(i, _m);
            _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04));
            wallMesh.setColorAt(i, _c);
        });
        if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    }
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;
    scene.add(wallMesh);

    // --- Pintu geser otomatis ---
    s3doors = buildStageDoors(S3_DOORS, s3Cell, S3.CELL, S3.H);

    // --- Furnitur KANTOR (dikumpulkan lalu DIGABUNG, lihat utils/meshBatch.js) ---
    const staticProps = [];
    const putModel = (mesh, x, z, sx, sy, sz, standable = true) => {
        blockers.push({ x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(sx / 2, sz / 2), top: sy, standable });
        mesh.position.set(x, 0, z); staticProps.push(mesh);
    };
    const deskModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s3Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, true);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.5 + 2); chair.rotation.y = Math.PI; staticProps.push(chair);
    };
    const meetingModel = (c, r, sx, sy, sz) => { const p = s3Cell(c, r); putModel(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, true); };
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s3Cell(c, r), x = p.x + dx, z = p.z + dz;
        blockers.push({ x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(sx / 2, sz / 2), top: sy, standable: true });
        const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
        const n = Math.max(1, Math.min(4, Math.round(longLen / shortLen))), unit = longLen / n;
        for (let i = 0; i < n; i++) {
            const off = -longLen / 2 + unit * (i + 0.5);
            const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
            cab.position.set(along ? x + off : x, 0, along ? z : z + off); staticProps.push(cab);
        }
    };
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0) => { const p = s3Cell(c, r); putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, true); };
    // Ruang atas B/C/D (kantor)
    meetingModel(13, 5, 30, 7, 16); cupboardModel(16, 2, 8, 15, 18);
    deskModel(23, 3, 24, 7, 12); propModel(buildFuturisticCrateMesh, 26, 6, 14, 8, 12);
    deskModel(34, 3, 24, 7, 12); cupboardModel(37, 6, 8, 15, 18);
    deskModel(4, 7, 12, 7, 8);   // ruang tangga (kecil)
    // SUPPLY (W, c1-10 r21-28): rak (persediaan diletakkan placeSupplies)
    cupboardModel(2, 24, 8, 15, 22); cupboardModel(9, 22, 8, 15, 10);
    // Toilet (R, c33-38 r21-28): bilik + wastafel
    propModel(buildFuturisticStallMesh, 35, 23, 2, 15, 10); propModel(buildFuturisticStallMesh, 35, 27, 2, 15, 10);
    propModel(buildFuturisticSinkMesh, 37, 25, 10, 8, 4);
    // Tengah-bawah (jalur ke pintu blast): krat pinggir (jauh dari bukaan c18-21)
    propModel(buildFuturisticCrateMesh, 15, 24, 14, 9, 14); propModel(buildFuturisticCrateMesh, 28, 26, 14, 9, 14);

    // Perabot TAMBAHAN (2026-07-26) — masuk `blockers` + ikut bake nav (pejal
    // untuk player DAN robot).
    const FURN = {
        desk: deskModel, meeting: meetingModel, cupboard: cupboardModel,
        box: (c, r, sx, sy, sz) => propModel(buildFuturisticCrateMesh, c, r, sx, sy, sz),
        bench: (c, r, sx, sy, sz) => propModel(buildFuturisticBenchMesh, c, r, sx, sy, sz),
        planter: (c, r, sx, sy, sz) => propModel(buildFuturisticPlanterMesh, c, r, sx, sy, sz),
        stall: (c, r, sx, sy, sz) => propModel(buildFuturisticStallMesh, c, r, sx, sy, sz),
        sink: (c, r, sx, sy, sz) => propModel(buildFuturisticSinkMesh, c, r, sx, sy, sz),
        sofa: (c, r, sx, sy, sz) => propModel(buildFuturisticSofaMesh, c, r, sx, sy, sz),
        console: (c, r, sx, sy, sz) => propModel(buildFuturisticConsoleMesh, c, r, sx, sy, sz),
        rubble: (c, r, sx, sy, sz) => propModel(buildFuturisticRubbleMesh, c, r, sx, sy, sz),
    };
    for (const [kind, c, r, sx, sy, sz] of S3_FURNITURE) FURN[kind](c, r, sx, sy, sz);

    // --- TANGGA RUSAK (sumber spawn robot, kiri-atas) + puing ---
    const upF = stairwellUpFootprint(S3.x0 + S3.CELL, S3.z0 + S3.CELL);
    buildStairwellUp(S3.x0 + S3.CELL, S3.z0 + S3.CELL, S3.H);
    blockers.push({ x: upF.x, z: upF.z, hx: upF.hx, hz: upF.hz, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(upF.hx, upF.hz), top: 10, standable: true });
    propModel(buildFuturisticCrateMesh, 5, 4, 10, 9, 10);   // puing kaki tangga

    // --- LIFT (titik masuk) di nook c9-10 r15-19 — SEPASANG lift (kiri-kanan)
    // MENGHADAP TIMUR, MENEMPEL tembok BARAT (col8). Terbuka; player spawn di
    // depannya (c10) seolah baru keluar lift. Walkable (tanpa blocker). ---
    const liftWallX3 = S3.x0 + 9 * S3.CELL;          // muka timur tembok barat (col8)
    const liftZ3 = S3.z0 + 16.5 * S3.CELL;           // pusat pasangan (dekat spawn r16)
    const lift = buildLiftBank({ facing: 'east', H: S3.H, open: true, gap: 30 });
    lift.position.set(liftWallX3, 0, liftZ3);
    scene.add(lift);

    // === 4 MESIN PEMBUAT ROBOT (blocker DI-BAKE nav, robot memutar) ===
    s3Machines = [];
    for (const d of S3_MACHINES_DEF) {
        const p = s3Cell(d.cc + 0.5, d.cr + 0.5);    // pusat 2x2
        const mach = buildSpawnMachine();             // hatch di muka +z lokal
        mach.group.position.set(p.x, 0, p.z);
        mach.group.rotation.y = d.face * Math.PI / 2; // putar hatch ke PUSAT ruang (timur/barat)
        scene.add(mach.group);
        const blocker = { x: p.x, z: p.z, hx: 14, hz: 14, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(14, 14), top: 17, standable: false };
        blockers.push(blocker);
        const sp = s3Cell(d.sc, d.sr);
        s3Machines.push({ group: mach.group, cx: p.x, cz: p.z, spawn: { c: d.sc, r: d.sr }, hp: 0, alive: true, hitT: 0, eyeMat: mach.eyeMat, blocker });
    }

    // --- PINTU KELUAR 'o' (finish) di dinding selatan baris 39 (c18-21) ---
    const exW = (S3_PLUS.c1 - S3_PLUS.c0 + 1) * S3.CELL;
    const exP = s3Cell((S3_EXIT.c0 + S3_EXIT.c1) / 2, S3_EXIT.r1);   // pusat bukaan @ baris 39
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(exW + 8, 5, 6), new THREE.MeshLambertMaterial({ color: PAL.gunmetal }));
    lintel.position.set(exP.x, S3.H - 2.5, exP.z); scene.add(lintel);
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x1a2b28, shininess: 60, specular: 0x4a6a64, transparent: true, opacity: 0.55 });
    s3ExitDoor = new THREE.Group();
    for (const sgn of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(exW / 2 - 1, S3.H - 6, 1.2), glassMat);
        leaf.position.set(exP.x + sgn * (exW / 4), (S3.H - 6) / 2, exP.z - 1.5);
        s3ExitDoor.add(leaf);
    }
    scene.add(s3ExitDoor);
    s3ExitSign = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 1.2), new THREE.MeshBasicMaterial({ color: 0xff4a3c, toneMapped: false }));
    s3ExitSign.position.set(exP.x, S3.H - 6, exP.z + 3); scene.add(s3ExitSign);
    s3ExitLight = new THREE.PointLight(0xff5040, 0.9, 240, 2);
    s3ExitLight.position.set(exP.x, S3.H - 8, exP.z + 6); scene.add(s3ExitLight);
    registerStageLight('campaign-3', s3ExitLight);

    // --- Lampu per-ruangan (mati → nyala saat pintu dibuka / rect dimasuki) ---
    s3Lamps = [];
    const addLamp = (c, r, color, inten, dist, c0, r0, c1, r1) => {
        const p = s3Cell(c, r);
        const L = new THREE.PointLight(color, 0, dist, 2);
        L.position.set(p.x, S3.H - 3, p.z); scene.add(L);
        registerStageLight('campaign-3', L);
        const lm = { L, base: inten, on: false, k: 0, x0: S3.x0 + c0 * S3.CELL, x1: S3.x0 + (c1 + 1) * S3.CELL, z0: S3.z0 + r0 * S3.CELL, z1: S3.z0 + (r1 + 1) * S3.CELL };
        if (!s3Lamps.some(o => o.shroud && o.x0 === lm.x0 && o.z0 === lm.z0 && o.x1 === lm.x1 && o.z1 === lm.z1)) {
            const sh = new THREE.Mesh(new THREE.BoxGeometry(lm.x1 - lm.x0 - 1, S3.H - 0.6, lm.z1 - lm.z0 - 1), new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 1 }));
            sh.position.set((lm.x0 + lm.x1) / 2, (S3.H - 0.6) / 2 + 0.2, (lm.z0 + lm.z1) / 2); scene.add(sh); lm.shroud = sh;
        }
        s3Lamps.push(lm); return lm;
    };
    addLamp(3, 4, 0xffd9a0, 0.9, 220, 1, 1, 6, 10);         // 0 tangga (kiri-atas, pra-nyala)
    addLamp(13, 4, 0xffe2b8, 0.9, 320, 8, 1, 18, 8);        // 1 ruang B
    addLamp(24, 4, 0xffd9a0, 0.85, 300, 19, 1, 29, 8);      // 2 ruang C
    addLamp(34, 4, 0xffe2b8, 0.9, 320, 30, 1, 38, 8);       // 3 ruang D
    addLamp(10, 17, 0xbfe4ff, 0.85, 320, 9, 11, 12, 20);    // 4 lift area
    addLamp(21, 15, 0xffe2b8, 0.85, 460, 14, 11, 28, 20);   // 5 chamber tengah
    addLamp(20, 24, 0xffe2b8, 0.85, 460, 12, 21, 31, 28);   // 6 tengah-bawah (jalur pintu blast)
    addLamp(5, 24, 0xffc890, 0.85, 320, 1, 21, 10, 28);     // 7 SUPPLY (W)
    addLamp(35, 24, 0xbfe4ff, 0.85, 320, 33, 21, 38, 28);   // 8 toilet (R)
    addLamp(11, 34, 0xff9a5a, 0.95, 640, 1, 30, 19, 38);    // 9 PABRIK X (barat)
    addLamp(29, 34, 0xff9a5a, 0.95, 640, 20, 30, 38, 38);   // 10 PABRIK X (timur)
    for (const lm of s3Lamps) lm.doors = s3doors.filter(d =>
        d.cx >= lm.x0 - 1.5 * S3.CELL && d.cx <= lm.x1 + 1.5 * S3.CELL &&
        d.cz >= lm.z0 - 1.5 * S3.CELL && d.cz <= lm.z1 + 1.5 * S3.CELL);

    // === 5 TERMINAL HACK (2026-07-28) — SEBELUM bake nav supaya robot memutari
    // konsolnya (perabot pejal WAJIB ikut ter-bake, aturan CLAUDE.md). SENGAJA di
    // luar `staticProps`: warnanya berubah runtime, jadi tak boleh ikut dilas
    // addMergedStatic. ===
    s3Terms = S3_TERMINALS.map(def => {
        const p = s3Cell(def.c + 0.5, def.r);          // pusat pasangan 2 sel
        const t = buildHackTerminal(def.face);
        t.group.position.set(p.x, 0, p.z);
        scene.add(t.group);
        const sp = s3Cell(def.sc, def.sr);             // titik BERDIRI (pemicu hack)
        const blocker = {
            x: p.x, z: p.z, hx: S3.CELL, hz: S3.CELL / 2,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(S3.CELL, S3.CELL / 2),
            top: 11, standable: false,
        };
        blockers.push(blocker);
        return { def, group: t.group, screens: t.screens, cx: p.x, cz: p.z, sx: sp.x, sz: sp.z, blocker, state: 'locked' };
    });

    // === RAMBU PINTU BLAST (2026-07-28, permintaan user "beri lampu di pintu utama
    // itu seperti di pintu lain"): papan + PointLight, MERAH selama terkunci dan
    // HIJAU begitu terbuka. Sengaja BUKAN anak grup pintu — pintunya naik ke
    // plafon saat membuka, rambunya harus tetap di ambang. ===
    const sgP = s3Cell((S3_PLUS.c0 + S3_PLUS.c1) / 2, S3_PLUS.r);
    s3DoorSign = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 1.2),
        new THREE.MeshBasicMaterial({ color: HACK_LOCKED, toneMapped: false }));
    s3DoorSign.position.set(sgP.x, S3.H - 6, sgP.z - (S3.CELL / 2 + 2));
    scene.add(s3DoorSign);
    s3DoorLight = new THREE.PointLight(HACK_LOCKED, 0.9, 220, 2);
    s3DoorLight.position.set(sgP.x, S3.H - 8, sgP.z - (S3.CELL / 2 + 5));
    scene.add(s3DoorLight);
    registerStageLight('campaign-3', s3DoorLight);

    // GABUNG perabot statis jadi belasan mesh (blockers/nav tak tersentuh).
    s3StaticBatch = addMergedStatic(scene, staticProps);

    // Bake nav-grid (blocker mesin sudah masuk → robot memutar; pintu blast BELUM)
    const half = S3.CELL / 2;
    s3Nav = makeNavGrid(S3.x0, S3.z0, half, S3.G * 2, S3.ROWS * 2, (x, z) => {
        if (!stage3Walk(x, z, 3)) return false;
        _v3.set(x, 0, z); resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });

    // === PINTU BLAST '+' (SETELAH bake nav → sel bukaan tetap walkable di nav;
    // blocker per-frame memblok sampai hancur, lalu di-splice) ===
    const dp = s3Cell((S3_PLUS.c0 + S3_PLUS.c1) / 2, S3_PLUS.r);
    s3DoorCX = dp.x; s3DoorCZ = dp.z;
    const dw = (S3_PLUS.c1 - S3_PLUS.c0 + 1) * S3.CELL;
    s3Door = buildBlastDoor(dw);
    s3Door.position.set(dp.x, 0, dp.z);
    scene.add(s3Door);
    s3DoorBlocker = { x: dp.x, z: dp.z, hx: dw / 2, hz: S3.CELL / 2, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(dw / 2, S3.CELL / 2), top: S3.H, standable: false };
    blockers.push(s3DoorBlocker);
}

// ===== ROBOT SPAWN (langsung mengejar) + kelas ACAK BERBOBOT =====
// Campuran kelas = CFG.campaign.stage3.classMix (2026-07-30, permintaan user:
// C 70% / B 20% / A 10% — sebelumnya hardcode C50/B25/A25). Bobotnya
// dinormalkan, jadi user boleh menaruh angka apa pun di config (tak harus
// berjumlah 1) dan urutan undiannya tetap C -> B -> A.
function randClass3() {
    const M = (CFG.campaign.stage3 && CFG.campaign.stage3.classMix) || {};
    const wC = M.C != null ? M.C : 0.7, wB = M.B != null ? M.B : 0.2, wA = M.A != null ? M.A : 0.1;
    const total = wC + wB + wA;
    if (!(total > 0)) return 'C';
    const r = Math.random() * total;
    return r < wC ? 'C' : r < wC + wB ? 'B' : 'A';
}
function s3SpawnChaser(cell, cls) {
    const p = s3Cell(cell.c, cell.r);
    _v3.set(p.x + rand(-5, 5), 0, p.z + rand(-5, 5));
    resolve(_v3, 4, 0);
    if (!stage3Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
    spawnCampaignRobot(_v3.x, _v3.z, 3, cls);
    const z = robots[robots.length - 1];
    z.state = 'chasing'; z.groundY = 0;   // langsung kejar (bukan idle)
    // Animasi MUNCUL: mulai dari mesh nyaris nol lalu tumbuh (s3TickSpawns) +
    // kilat teal & debu di titik keluar. Skala logika (z.scl) tak diubah.
    const base = z.scl || 1;
    z.mesh.scale.setScalar(base * RISE_MIN);
    s3Rising.push({ z, t: 0, base });
    spawnGroundPuff(_v3.x, _v3.z, PAL.tech, 7, 0.6);
    spawnBloodBurst(_v3.x, 7, _v3.z, 0, 0, 5, 0.7, 6.283, PAL.tech);
}

const RISE_MIN = 0.12;   // skala awal saat robot mulai "tercetak"

// Lepas antrean spawn (satu robot tiap spawnGapSec) + majukan animasi tumbuh.
// Dipanggil tiap frame dari updateMode.
function s3TickSpawns(dt) {
    const S = CFG.campaign.stage3;
    if (s3Queue.length) {
        s3QueueT -= dt;
        while (s3QueueT < 0 && s3Queue.length) {
            const e = s3Queue.shift();
            s3SpawnChaser(e.cell, e.cls);
            s3QueueT += S.spawnGapSec;
        }
    }
    for (let i = s3Rising.length - 1; i >= 0; i--) {
        const r = s3Rising[i];
        // Robot keburu mati saat masih tumbuh: kembalikan skala penuh supaya
        // mayat/gib-nya tidak kerdil, lalu keluarkan dari daftar.
        if (r.z.hp <= 0 || robots.indexOf(r.z) < 0) {
            r.z.mesh.scale.setScalar(r.base);
            s3Rising.splice(i, 1);
            continue;
        }
        r.t += dt;
        const k = Math.min(1, r.t / S.spawnRiseSec);
        const e = 1 - (1 - k) * (1 - k);   // easeOut — cepat di awal, melunak di akhir
        r.z.mesh.scale.setScalar(r.base * (RISE_MIN + (1 - RISE_MIN) * e));
        if (k >= 1) { r.z.mesh.scale.setScalar(r.base); s3Rising.splice(i, 1); }
    }
}

// Antre satu robot (bukan spawn langsung) — dipakai kedua gelombang.
function queueSpawn(cell, cls) { s3Queue.push({ cell, cls }); }

// ===== HIT-PELURU DESTRUCTIBLE (pola tankBulletHits): peluru PLAYER (array
// `bullets`) merusak target lalu dihapus; explosive = damage langsung + boom. =====
function s3ApplyBulletDamage(b, bx, bz, apply) {
    if (b.explosive) {
        queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage, b.boomSfx);
        apply(b.damage != null ? b.damage : CFG.grenade.damage);
    } else {
        const dmg = (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
        stats.hits++;
        apply(dmg);
        spawnBloodBurst(bx, 12 + Math.random() * 6, bz, b.dir.x, b.dir.z, 2, 0.5, 1.4, 0xffb24a);
    }
}
// PINTU BLAST menghalangi peluru selagi TERTUTUP (2026-07-28). Dulu bukaan '+'
// bukan dinding di grid — peluru menembusnya begitu saja dan itu tak apa karena
// pintunya memang sedang DITEMBAK. Sekarang pintunya tak bisa dirusak, jadi ia
// harus berlaku seperti dinding pejal sampai terbuka.
function s3DoorBlocksSeg(x0, z0, x1, z1) {
    return !s3DoorOpen && segHitsRect(x0, z0, x1, z1, s3DoorCX, s3DoorCZ, 30, 9);
}
// GELOMBANG robot fase door: 6 dari TANGGA + 6 dari LIFT. DIANTRE (bukan
// serentak) — dilepas satu per satu oleh s3TickSpawns.
function spawnDoorWave() {
    const n = CFG.campaign.stage3.gateWaveCount;
    for (let k = 0; k < n; k++) { queueSpawn(S3_STAIRS_SPAWN, randClass3()); queueSpawn(S3_LIFT_SPAWN, randClass3()); }
}
// GELOMBANG robot fase machines: machineWaveCount robot PER MESIN yang masih
// hidup, keluar berurutan dari hatch tiap mesin (diantre juga).
function spawnMachineWave() {
    const n = CFG.campaign.stage3.machineWaveCount;
    for (let k = 0; k < n; k++) for (const m of s3Machines) if (m.alive) queueSpawn(m.spawn, randClass3());
}
function s3MachineBulletHits() {
    const R2 = CFG.campaign.stage3.machineHitRadius ** 2;
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j], bx = b.mesh.position.x, bz = b.mesh.position.z;
        let hit = null;
        for (const m of s3Machines) {
            if (!m.alive) continue;
            if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.cx, 0, m.cz) < R2) { hit = m; break; }
        }
        if (hit) {
            s3ApplyBulletDamage(b, bx, bz, (dmg) => { hit.hp -= dmg; hit.hitT = 1; });
            scene.remove(b.mesh); bullets.splice(j, 1);
        }
    }
}
// ===== TERMINAL HACK: rambu, pemicu, penyelesaian (2026-07-28) =====
// Warnai layar tiap terminal menurut urutan acak: KUNING sudah, HIJAU giliran
// sekarang, MERAH belum. Hanya `color.setHex` material Basic → tanpa recompile.
function s3PaintTerminals() {
    s3Terms.forEach(t => { t.state = 'locked'; });
    for (let k = 0; k < s3HackOrder.length; k++) {
        const t = s3Terms[s3HackOrder[k]];
        if (!t) continue;
        t.state = k < s3HackIdx ? 'done' : (k === s3HackIdx ? 'ready' : 'locked');
    }
    for (const t of s3Terms) {
        const hex = t.state === 'done' ? HACK_DONE : t.state === 'ready' ? HACK_READY : HACK_LOCKED;
        for (const m of t.screens) m.material.color.setHex(hex);
    }
}
// Terminal yang SEDANG jadi giliran (null bila kelimanya sudah selesai).
function s3ActiveTerm() {
    if (s3HackIdx >= s3HackOrder.length) return null;
    return s3Terms[s3HackOrder[s3HackIdx]] || null;
}
// Hack SELESAI: layar jadi kuning, lepas SATU gelombang robot (aturan lama:
// gateWaveCount dari tangga + gateWaveCount dari lift, langsung mengejar), lalu
// giliran pindah ke terminal berikutnya. TIDAK ada respawn otomatis — gelombang
// berikutnya baru ada setelah hack berikutnya SELESAI (permintaan user).
function s3FinishHack() {
    s3Hacking = false;
    s3HackArmed = true;   // giliran pindah ke terminal LAIN = pemicu baru (tak perlu menjauh)
    s3HackIdx++;
    s3PaintTerminals();
    spawnDoorWave();
    const left = S3_TERMINALS.length - s3HackIdx;
    if (left > 0) {
        showStageMsg(`TERMINAL BREACHED (${s3HackIdx}/${S3_TERMINALS.length}) — hostiles inbound! Find the next terminal.`, 4200);
    }
    updateUI();
}
// ===== ALARM HACK GAGAL (2026-07-28, permintaan user) =====
// ICE TRACE minigame habis → alarm lantai pabrik menyala: `alarmHordeCount`
// robot kelas C muncul DI LUAR PANDANGAN KAMERA lalu langsung memburu player,
// dan terminalnya TERKUNCI `alarmCooldownSec` detik — player harus membereskan
// mereka dulu. Sel TANGGA & LIFT jadi cadangan bila titik luar-layar kurang.
function s3AlarmHorde() {
    const H = CFG.campaign.hack;
    s3HackCd = H.alarmCooldownSec || 0;
    s3HackArmed = false;
    spawnAlarmHorde(3, {
        count: H.alarmHordeCount || 0, walkable: stage3Walk, resolve, scratch: _v3,
        cls: randClass3,   // skuad alarm ikut classMix stage 3 (dulu seragam kelas C)
        minUnits: H.alarmSpawnMinUnits, maxUnits: H.alarmSpawnMaxUnits,
        cellFn: s3Cell,
        fallbackSpots: [[S3_STAIRS_SPAWN.c, S3_STAIRS_SPAWN.r], [S3_LIFT_SPAWN.c, S3_LIFT_SPAWN.r]],
    });
    showStageMsg('ALARM TRIGGERED — the terminal locked you out and a hunter squad is inbound! '
        + `Clear them out; it reboots in ${Math.round(s3HackCd)}s.`, 5000);
}

// Kelima terminal beres → PINTU BLAST TERBUKA (naik ke plafon), rambu jadi HIJAU.
function s3OpenDoor() {
    s3DoorOpen = true;
    const i = blockers.indexOf(s3DoorBlocker);
    if (i !== -1) blockers.splice(i, 1);
    if (s3DoorSign) s3DoorSign.material.color.setHex(HACK_READY);
    if (s3DoorLight) s3DoorLight.color.setHex(HACK_READY);
    spawnGroundPuff(s3DoorCX, s3DoorCZ, PAL.tech, 12, 2);
    addCamShake(4);
}
function s3DestroyMachine(m) {
    m.alive = false;
    if (m.group) m.group.visible = false;
    // Mesin hancur = berhenti memproduksi: batalkan robot yang masih ANTRE keluar
    // dari hatch-nya (identitas cell = objek m.spawn yang sama saat di-queue).
    s3Queue = s3Queue.filter(e => e.cell !== m.spawn);
    const i = blockers.indexOf(m.blocker);
    if (i !== -1) blockers.splice(i, 1);
    addScore(CFG.robot.score.specialKill);
    explodeAt(new THREE.Vector3(m.cx, 12, m.cz), 26, 1, undefined);
    spawnGibs(m.cx, 14, m.cz, 12, 1, 0, 2.2, 0x3d444c, 0.4, 0x141210);
    spawnBloodDecal(m.cx, m.cz, 7, 0x141210);
    addCamShake(8);
    updateUI();
}

// SUPPLY: ruang W (6 ammo + 3 medkit) + ruang PABRIK X (DIGANDAKAN: 8 ammo + 4 medkit).
function placeSupplies() {
    const put = (w, c, r) => { const p = s3Cell(c, r); spawnAmmoDrop(p.x, p.z, w, 1e9); };
    const med = (c, r) => { const p = s3Cell(c, r); spawnMedkitDrop(p.x, p.z, 1e9); };
    // W supply (c1-10 r21-28): 6 paket amunisi (campur 4 jenis) + 3 medkit
    put('rifle', 3, 22); put('shotgun', 6, 23); put('pistol', 3, 26);
    put('launcher', 8, 27); put('rifle', 5, 25); put('shotgun', 7, 22);
    med(4, 28); med(9, 24); med(2, 27);
    // PABRIK X (rows 30-38) DIGANDAKAN: 8 paket amunisi + 4 medkit tersebar
    put('rifle', 10, 31); put('shotgun', 30, 31); put('rifle', 14, 37); put('pistol', 26, 37);
    put('launcher', 8, 34); put('rifle', 32, 34); put('shotgun', 6, 31); put('launcher', 34, 31);
    med(12, 33); med(28, 33); med(16, 36); med(24, 36);
}

// ===== BAREL PELEDAK (SECOND-IMPROVEMENT point 2): tong eksplosif di ruang pabrik
// X + ruang tengah sebelum pintu blast. Ditembak -> ledakan AoE + rambat antar
// barel. Pejal ke player saja (resolveBarrelBlock); di sel lantai terbuka. =====
const S3_BARRELS = [[12, 34], [27, 34], [19, 32], [19, 36], [19, 24]];
export function placeBarrels() {
    for (const [c, r] of S3_BARRELS) { const p = s3Cell(c, r); spawnBarrel(p.x, p.z, 0); }
}

// ===== PETI PERSEDIAAN (2026-07-26): ditembak/ditebas -> pecah, berpeluang
// berisi amunisi / uang / medkit. SETIAP RUANGAN kebagian minimal satu supaya
// player punya alasan masuk ke tiap ruangan. Pejal ke player saja (bukan nav). =====
// JUMLAH DIPERBANYAK 2026-07-26 (pass 2, permintaan user: "jangan cuma 1 per
// ruangan") — tiap ruangan 2-4 peti; ruang PABRIK X tetap di pinggir arena.
const S3_CRATES = [
    [5, 9], [3, 10],            // ruang tangga
    [10, 3], [17, 7], [18, 3],  // ruang B
    [21, 2], [28, 7], [29, 4],  // ruang C
    [38, 4], [34, 7], [38, 2],  // ruang D
    [12, 13], [12, 17],         // area lift
    [17, 13], [26, 18], [28, 19], [15, 12],     // chamber tengah
    [14, 22], [29, 27], [12, 26], [25, 28],     // tengah-bawah
    [7, 26], [5, 27],           // ruang SUPPLY (W)
    [34, 22], [34, 28],         // toilet (R)
    [8, 31], [15, 37], [2, 38], [4, 30],        // PABRIK X barat
    [24, 31], [31, 37], [38, 37], [28, 30],     // PABRIK X timur
];
export const s3CrateCount = S3_CRATES.length;   // smoke test
export function placeCrates() {
    for (const [c, r] of S3_CRATES) { const p = s3Cell(c, r); spawnCrate(p.x, p.z, 0); }
}

export const stage3Scene = {
    id: 'campaign-3',
    lightsKey: 'campaign-3',

    // Kamera KHUSUS stage 3 (2026-07-21, permintaan user): memandang dari BARAT
    // LAUT (NW) ke TENGGARA (SE) — z dibalik dari default barat daya. Tinggi &
    // jarak horizontal sama (pitch/zoom tetap), hanya azimuth berputar. renderer
    // `applySceneCamOffset` menerapkannya + memutakhirkan basis layar (WASD/radar).
    camOffset: { x: -70.7, y: 116, z: -70.7 },

    enter() {
        saveCampaignStage(3);
        ensureWorld();
        // Buang robot stage 2 yang tersisa + sisa robot stage 3 dari run sebelumnya
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 2 || robots[i].stage === 3) { disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1); }
        }
        placeSupplies();
        resetBarrels(); placeBarrels();   // barel peledak (bersihkan barel stage lain dulu)
        resetCrates(); placeCrates();     // peti persediaan (isi loot) di tiap ruangan
        applyLightPreset(scene, 'indoor');
        enterCityEnv();
        resetRoomLamps(s3Lamps);
        if (s3Lamps[0]) { const st = s3Lamps[0]; st.on = true; st.k = 1; st.L.intensity = st.base; if (st.shroud) { st.shroud.visible = false; st.shroud.material.opacity = 0; } }
        // RESET destructibles
        s3Phase = 'door';
        s3SpawnT = 0;
        s3Queue = []; s3QueueT = 0; s3Rising = [];   // antrean & animasi spawn bersih
        // PINTU BLAST: tertutup lagi, rambu MERAH (tak lagi punya HP — dibuka
        // oleh 5 terminal hack, bukan ditembak).
        s3DoorOpen = false; s3DoorK = 0;
        if (s3Door) { s3Door.visible = true; s3Door.position.y = 0; }
        if (s3DoorSign) s3DoorSign.material.color.setHex(HACK_LOCKED);
        if (s3DoorLight) s3DoorLight.color.setHex(HACK_LOCKED);
        if (blockers.indexOf(s3DoorBlocker) === -1) blockers.push(s3DoorBlocker);
        // TERMINAL HACK: proses dibatalkan, urutan DIACAK ULANG (Fisher-Yates),
        // semua layar dicat ulang menurut urutan baru.
        s3Hacking = false; s3HackArmed = true; s3HackCd = 0; s3HackIdx = 0;
        setCinematicActive(false);
        s3HackOrder = s3Terms.map((_, i) => i);
        for (let i = s3HackOrder.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [s3HackOrder[i], s3HackOrder[j]] = [s3HackOrder[j], s3HackOrder[i]];
        }
        s3PaintTerminals();
        for (const m of s3Machines) {
            m.hp = CFG.campaign.stage3.machineHp; m.alive = true; m.hitT = 0;
            if (m.group) m.group.visible = true;
            if (m.eyeMat) m.eyeMat.color.setHex(0xff2b1f);
            if (blockers.indexOf(m.blocker) === -1) blockers.push(m.blocker);
        }
        s3ExitOpen = false;
        if (s3ExitSign) { s3ExitSign.material.color.setHex(0xff4a3c); s3ExitLight.color.setHex(0xff5040); }
        s3HintT = 0;
        const sp = s3Cell(S3_START.c, S3_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);
        player.vy = 0; player.onGround = true;
        showStageMsg('Arrived by lift. The blast door is LOCKED — hack all 5 terminals to open it. Follow the GREEN screens.', 5600);
        updateUI();
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Ganjaran kill campaign: LOOT/uang (bukan skor langsung). Lihat common.js.
    awardKill: campaignAwardKill,

    updateMode(dt) {
        updateStageDoors(s3doors, dt);
        updateRoomLamps(s3Lamps, dt);
        const s3 = CFG.campaign.stage3;
        const pz = camera.position.z;
        s3TickSpawns(dt);   // lepas antrean spawn (0.3 dtk/robot) + animasi tumbuh

        if (s3Phase === 'door') {
            // === HACK 5 TERMINAL, BERURUTAN & URUTAN ACAK (2026-07-28) ===
            // TIDAK ADA gelombang otomatis di fase ini: robot HANYA muncul saat
            // sebuah hack SELESAI, dan tak ada yang menyusul sampai hack
            // berikutnya beres (permintaan user — menggantikan respawn anti-camp
            // yang dulu berjalan selama player menembaki pintu).
            // MINIGAME HACK (2026-07-28): menempel terminal HIJAU membuka scene
            // modal puzzle sirkuit (utility/hackMinigame.js) — game DI-PAUSE
            // selama puzzle, jadi tak ada yang perlu di-tick di sini. Pemicu
            // "terisi" ulang hanya setelah player MENJAUH sekali, supaya batal/
            // gagal tidak langsung membuka puzzle lagi di tempat.
            if (!s3Hacking) {
                if (s3HackCd > 0) s3HackCd = Math.max(0, s3HackCd - dt);   // cooldown alarm berjalan
                const act = s3ActiveTerm();
                const near = act && Math.hypot(camera.position.x - act.sx, pz - act.sz) < (s3.hackRange || 13);
                if (!near) s3HackArmed = true;
                else if (s3HackArmed && s3HackCd <= 0) {
                    s3HackArmed = false;
                    s3Hacking = true;
                    beginHackMinigame({
                        head: `TERMINAL ${s3HackIdx + 1} / ${S3_TERMINALS.length} — ${act.def.room}`,
                        sub: 'Reroute the door bus: rotate the chips until the ingress port '
                            + 'links to the data core. Every breach unlocks part of the blast door.',
                        size: hackGridSize(s3HackIdx),
                        onSuccess: s3FinishHack,
                        onFail: (why) => {
                            s3Hacking = false;
                            if (why === 'abort') showStageMsg('Breach aborted — step away from the terminal and try again.', 3600);
                            else s3AlarmHorde();   // ICE TRACE habis → alarm + horde + cooldown
                        },
                    });
                }
            }
            if (s3HackIdx >= S3_TERMINALS.length && !s3DoorOpen) {
                s3OpenDoor();
                s3Phase = 'toX';
                showStageMsg('ALL TERMINALS BREACHED — the blast door is open. Push into the factory hall!', 4600);
            }
        } else if (s3Phase === 'toX') {
            if (pz > S3.z0 + 30 * S3.CELL) {   // masuk ruang X (lewati baris pintu 29)
                s3Phase = 'machines';
                s3SpawnT = s3.machineFirstWaveSec;   // JANGAN langsung spawn — tunda 3 dtk dulu
                showStageMsg('ROBOT FACTORIES ONLINE — destroy all 4 machines!', 4600);
            }
        } else if (s3Phase === 'machines') {
            s3MachineBulletHits();
            for (const m of s3Machines) if (m.alive && m.hp <= 0) s3DestroyMachine(m);
            // GELOMBANG mesin: tunda `machineFirstWaveSec` (3 dtk) sebelum yang PERTAMA,
            // lalu 4 robot PER MESIN hidup. ANTI-CAMP (2026-07-22): gelombang berikut
            // menyala saat sisa robot TURUN DI BAWAH `reinforceThreshold` (bukan 0) —
            // menyisakan 1 robot tak lagi membekukan spawn saat menghancurkan mesin.
            if (s3MachinesAlive() > 0 && !s3Queue.length && countStageRobots(3) < s3.reinforceThreshold) {
                s3SpawnT -= dt;
                if (s3SpawnT <= 0) { spawnMachineWave(); s3SpawnT = s3.respawnSec; }
            }
            if (s3MachinesAlive() === 0 && !s3Queue.length && countStageRobots(3) === 0) {
                s3Phase = 'done';
                s3ExitOpen = true;
                if (s3ExitSign) { s3ExitSign.material.color.setHex(0x2eff6a); s3ExitLight.color.setHex(0x39ff7a); }
                showStageMsg('ALL FACTORIES DESTROYED — the EXIT is open. Get out!', 4800);
            }
        }
        // PINTU BLAST MEMBUKA: daun pintu naik ke plafon (bukan meledak).
        if (s3DoorOpen && s3DoorK < 1) {
            s3DoorK = Math.min(1, s3DoorK + dt / 1.3);
            const e = s3DoorK * s3DoorK * (3 - 2 * s3DoorK);   // smoothstep
            if (s3Door) s3Door.position.y = S3.H * e;
        }
        // Kilat sensor mesin tertembak (merah → putih, memudar)
        for (const m of s3Machines) if (m.alive && m.hitT > 0 && m.eyeMat) {
            m.hitT = Math.max(0, m.hitT - dt * 6);
            const t = m.hitT, r = 0xff, g = Math.round(0x2b + (0xff - 0x2b) * t), bl = Math.round(0x1f + (0xff - 0x1f) * t);
            m.eyeMat.color.setHex(r << 16 | g << 8 | bl);
        }
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        resolveBarrelBlock(pos, player.radius);   // barel peledak pejal ke player
        resolveCrateBlock(pos, player.radius);    // peti persediaan pejal ke player
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S3.x0 + S3_EXIT.c0 * S3.CELL && pos.x <= S3.x0 + (S3_EXIT.c1 + 1) * S3.CELL
            && pos.z >= S3.z0 + S3_EXIT.r0 * S3.CELL && pos.z <= S3.z0 + (S3_EXIT.r1 + 1) * S3.CELL) {
            if (s3Phase === 'done') beginStageTransition(stage4Scene);
            else if (Date.now() - s3HintT > 2500) { s3HintT = Date.now(); showStageMsg('THE EXIT IS SEALED — destroy the robot factories first!', 2200); }
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    bulletBlocked(b) {
        return (b.mesh.position.y < S3.H && s3SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z))
            || s3DoorBlocksSeg(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
            || doorClampShot(s3doors, b);
    },

    blastBlocked(x0, z0, x1, z1, y) {
        return doorBlocksShot(s3doors, x0, z0, x1, z1, y) || s3DoorBlocksSeg(x0, z0, x1, z1);
    },

    grenadeCollide(g, oldGX, oldGZ) {
        if (!stage3Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        if (g.mesh.position.y > S3.H - NADE_R) { g.mesh.position.y = S3.H - NADE_R; if (g.vy > 0) g.vy = -g.vy * 0.3; }
    },

    robotAI(z, dt, step) {
        return campaignRobotAI(z, dt, step, {
            walkable: stage3Walk, resolve, nav: s3Nav,
            los: (x1, z1, x2, z2) => s3LOS(x1, z1, x2, z2) && !doorBlocksShot(s3doors, x1, z1, x2, z2, 8),
            doorBlock: (pos, r) => resolveDoors(s3doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: stage3Walk, resolve, doorBlock: (pos, r) => resolveDoors(s3doors, pos, r) });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        switch (s3Phase) {
            case 'door': {
                if (s3Hacking) return 'FLOOR 3 — Breaching the terminal…';
                if (s3HackCd > 0) return `FLOOR 3 — ALARM! Terminal rebooting: ${Math.ceil(s3HackCd)}s | Hostiles: ${countStageRobots(3)}`;
                const act = s3ActiveTerm();
                return `FLOOR 3 — Hack the terminals: ${s3HackIdx}/${S3_TERMINALS.length}`
                    + (act ? ` | Next: ${act.def.room}` : '')
                    + ` | Hostiles: ${countStageRobots(3)}`;
            }
            case 'toX': return 'FLOOR 3 — Push on into the robot factory hall';
            case 'machines': return `FLOOR 3 — Destroy the robot factories: ${s3MachinesAlive()}/4 left | Hostiles: ${countStageRobots(3)}`;
            default: return 'FLOOR 3 — EXIT OPEN — escape the building!';
        }
    },

    radarLandmarks(plot) {
        let tx, tz, col;
        if (s3Phase === 'done') { const e = s3Cell((S3_EXIT.c0 + S3_EXIT.c1) / 2, S3_EXIT.r1); tx = e.x; tz = e.z; col = '#2eff6a'; }
        else if (s3Phase === 'machines') {
            let best = null, bd = 1e9;
            for (const m of s3Machines) if (m.alive) { const d = Math.hypot(m.cx - camera.position.x, m.cz - camera.position.z); if (d < bd) { bd = d; best = m; } }
            if (best) { tx = best.cx; tz = best.cz; col = '#ff5040'; }
        } else {
            // Fase door: tunjuk TERMINAL yang sedang jadi giliran (hijau) — kalau
            // kelimanya sudah beres, tunjuk pintu blast yang kini terbuka.
            const act = s3ActiveTerm();
            if (act) { tx = act.cx; tz = act.cz; col = '#2eff6a'; }
            else { tx = s3DoorCX; tz = s3DoorCZ; col = '#2eff6a'; }
        }
        if (tx != null) plot(tx - camera.position.x, tz - camera.position.z, col, 5, true);
    },
};
