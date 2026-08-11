// Stage 6 — DUNIA CHAPTER 2 "FINISH" (kantor markas Bandung).
//
// Denah = transliterasi beku dari `stages(Stage6-Finish).csv` milik user (50x50).
// Legenda user, ditransliterasi ke satu karakter per sel:
//   `#` dinding, `.` lantai, `A` (CSV `SA`) safe area — tidak ada robot yang
//   SPAWN di sini saat permainan dimulai, `S` (CSV `SF`) start SEKALIGUS finish,
//   `@` pintu RUSAK yang tak pernah bisa terbuka (player harus cari jalan lain),
//   `-` pintu yang bisa dilalui (kecuali sepasang di start/finish yang tersegel),
//   `W` weapon cache (banyak medkit + ammo), `C` server komputer tempat program
//   diupload, `H` titik pemicu upload, `R` (CSV `RR`) toilet, `G` (CSV `WH`)
//   gudang, `M` (CSV `RM`) mesin pembuat robot, `1`/`2`/`3` (CSV `E1`/`E2`/`E3`)
//   pemicu event yang memberi tahu bahwa pintu di sebelahnya rusak, `+` pintu
//   terkunci yang baru terbuka sesudah komputer `X` berhasil di-hack, `Y`
//   safe area yang tidak boleh menjadi titik spawn robot.
//
// Ini KANTOR: perabotannya memakai rig `futuristic*` yang sama dengan Stage 1-3
// (meja + kursi, meja rapat, lemari, konsol, peti, planter, sofa, bangku) plus
// bilik/wastafel untuk toilet dan rak untuk gudang.

import { registerStageLight } from '../../../../world/lighting.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { resolveBlockers, blockersGroundHeight } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { rand } from '../../../../utils/math.js';
import {
    buildSplitDoor, buildDoorSideLights, DOOR_LOCKED_COLOR,
    doorBlocksShot as sharedDoorBlocksShot, doorClampShot as sharedDoorClampShot,
    doorsWalkable as sharedDoorsWalkable,
    doorProximityTarget, resolveDoors as resolveCampaignDoors,
    setDoorSideLightState, splitDoorDebug, updateDoorMotion,
} from '../../utility/doors.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, updateSpawnMachine, spawnMachineDebug,
    wreckSpawnMachine, spawnMachineHp,
} from '../../../../entities/spawnMachine.js';
import { buildFuturisticDeskMesh } from '../../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../../entities/futuristicChair.js';
import { buildFuturisticMeetingTableMesh } from '../../../../entities/futuristicMeetingTable.js';
import { buildFuturisticCupboardMesh } from '../../../../entities/futuristicCupboard.js';
import { buildFuturisticConsoleMesh } from '../../../../entities/futuristicConsole.js';
import { buildFuturisticCrateMesh } from '../../../../entities/futuristicCrate.js';
import { buildFuturisticPlanterMesh } from '../../../../entities/futuristicPlanter.js';
import { buildFuturisticSofaMesh } from '../../../../entities/futuristicSofa.js';
import { buildFuturisticBenchMesh } from '../../../../entities/futuristicBench.js';
import { buildFuturisticStallMesh } from '../../../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../../../entities/futuristicSink.js';
import { buildCampaignCityscape } from '../../utility/cityscape.js';
import { buildDetailedWallCell } from '../../utility/wallDetail.js';

export const HQ_OX = 216000, HQ_OZ = 0;
export const HQ_COLS = 50, HQ_ROWS = 50, CELL = 14, WALL_H = 25;
export const HQ_X0 = HQ_OX - HQ_COLS * CELL / 2;
export const HQ_Z0 = HQ_OZ - HQ_ROWS * CELL / 2;
export const hqCellPos = (c, r) => ({ x: HQ_X0 + (c + 0.5) * CELL, z: HQ_Z0 + (r + 0.5) * CELL });

// LATAR = KOTA, SEPERTI STAGE 5 (2026-08-10, permintaan user). Berbeda dengan
// terminal chapter 1 yang di permukaan tanah, ini "ADMINISTRATION FLOOR" sebuah
// markas — satu lantai di ATAS jalan, persis kantor Stage 1-3, jadi jalan kota
// memakai ketinggian -70 dan podium cincin kota menutup kolong lantainya.
export const CITY_GROUND_Y = -70;

export const HQ_MAP = Object.freeze([
    '##################################################',
    '#........#GGGGGGGGGGGGGGGGGGG-.................CC#',
    '#........#GGGGGGGGGGGGGGGGGGG-.................CC#',
    '#........#GGGGGGGGGGGGGGGGGGG#.................CC#',
    '#........#GGGGGGGGGGGGGGGGGGG#................CCC#',
    '#........##--#################................CCC#',
    '#............................#...............HCCC#',
    '#............................#...............HCCC#',
    '#............................#................CCC#',
    '#............................#................CCC#',
    '#.....................#......#.................CC#',
    '#.....................#......#.....2222........CC#',
    '#.....................#......#.....2222........CC#',
    '#.....................###++#########@@############',
    '#.....................#............2222.....#RRRR#',
    '#.....................#............2222.....-RRRR#',
    '#.....................#.....................-RRRR#',
    '#.....................#.....................#RRRR#',
    '#.....................#....##############...#RRRR#',
    '#.....................#....#YYYYYYYYYYYY#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYX#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYX#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYY#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYY#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYY#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYY#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYY#...#RRRR#',
    '#.....................#....#YYYYYYYYYYYY#...#RRRR#',
    '#######################....##########--##...######',
    '#......................................3@3.......#',
    '#.............MMM...............MMM....3@3.......#',
    '#.............MMM...............MMM....3@3.......#',
    '#.............MMM......1111.....MMM....3@3.......#',
    '#......................1111............3@3.......#',
    '#.........###..########@@@@##############........#',
    '#.........#......#AAAAA1111AAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAA1111AAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......=AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......=AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAAAAAAAAAA#WWWWWWWWWWWWWWWWW#',
    '#.........#......#AAAAASSSSAAAA#WWWWWWWWWWWWWWWWW#',
    '#######################----#######################',
]);

export const HQ_LEGEND = Object.freeze({
    '#': 'wall', '.': 'floor', A: 'safe-area', S: 'start-finish',
    '@': 'broken-door', '-': 'door', W: 'weapon-cache', C: 'server',
    H: 'upload-point', R: 'restroom', G: 'warehouse', M: 'spawn-machine',
    '+': 'keyed-door', X: 'hack-terminal', Y: 'safe-area',
    1: 'event-1', 2: 'event-2', 3: 'event-3',
});

export const HQ_START = Object.freeze(hqCellPos(24.5, 48));
// Titik BERDIRI di sel `H` bawah; konsolnya sendiri menempati sel `H` atas,
// jadi player tak pernah berdiri di dalam blocker-nya.
export const HQ_UPLOAD = Object.freeze(hqCellPos(45, 7));
const UPLOAD_CONSOLE = Object.freeze(hqCellPos(45, 6));
export const HQ_SERVERS = Object.freeze(hqCellPos(47.5, 6));

// RUANG SERVER = seluruh ruangan timur-atas yang memuat bank `C` dan titik
// upload; satu-satunya pintunya adalah `server-access`. TIDAK ADA ROBOT YANG
// BOLEH SPAWN DI SINI, sebelum maupun sesudah upload (permintaan user
// 2026-08-09) — robot yang mengejar player ke dalam tetap boleh masuk.
export const HQ_SERVER_ROOM = Object.freeze({ c0: 30, c1: 48, r0: 1, r1: 12 });
export const hqInServerRoomCell = (c, r) => c >= HQ_SERVER_ROOM.c0 && c <= HQ_SERVER_ROOM.c1
    && r >= HQ_SERVER_ROOM.r0 && r <= HQ_SERVER_ROOM.r1;
export function hqInServerRoom(x, z) {
    const m = mapCellAt(x, z);
    return hqInServerRoomCell(m.c, m.r);
}

// Terminal HACK di ruang rapat tengah: satu-satunya yang melepas kunci pintu
// ruang server (permintaan user 2026-08-09). Titik BERDIRI di sebelah konsol.
export const HQ_HACK = Object.freeze(hqCellPos(38, 20));
const HACK_CONSOLE = Object.freeze(hqCellPos(39, 20));

// Dua mesin pembuat robot (blok `M` 3x3). `hatch` = sel di depan corong tempat
// robot keluar; grup diputar supaya corongnya menghadap ke sana. Rangkanya
// BARU DITURUNKAN saat lockdown — sebelum upload selesai mereka tidak ada.
export const MACHINE_POINTS = Object.freeze([
    Object.freeze({ id: 0, ...hqCellPos(15, 31), hatch: Object.freeze(hqCellPos(18, 31)) }),
    Object.freeze({ id: 1, ...hqCellPos(33, 31), hatch: Object.freeze(hqCellPos(36, 31)) }),
]);

// Tiga pemicu event: masing-masing mengapit satu pintu rusak dan memberi tahu
// player bahwa jalur itu mati.
export const EVENT_POINTS = Object.freeze([
    Object.freeze({ id: 1, key: 'blockedRouteSafe', ...hqCellPos(24.5, 34), hx: 2 * CELL, hz: 2.5 * CELL }),
    Object.freeze({ id: 2, key: 'blockedRouteVault', ...hqCellPos(36.5, 13), hx: 2 * CELL, hz: 2.5 * CELL }),
    Object.freeze({ id: 3, key: 'blockedRouteHall', ...hqCellPos(40, 31), hx: 1.5 * CELL, hz: 2.5 * CELL }),
]);

const DOOR_LAYOUT = Object.freeze([
    // Pintu `+` baru bisa dibuka sesudah terminal `X` di-hack.
    Object.freeze({ kind: 'server-access', ...hqCellPos(25.5, 13), sx: CELL * 2, sz: 4.5, locked: true }),
    Object.freeze({ kind: 'upper-server-door', ...hqCellPos(29, 1.5), sx: 4.5, sz: CELL * 2 }),
    Object.freeze({ kind: 'warehouse-south', ...hqCellPos(11.5, 5), sx: CELL * 2, sz: 4.5 }),
    Object.freeze({ kind: 'restroom', ...hqCellPos(44, 15.5), sx: 4.5, sz: CELL * 2 }),
    Object.freeze({ kind: 'office-room', ...hqCellPos(37.5, 28), sx: CELL * 2, sz: 4.5 }),
    Object.freeze({ kind: 'safe-exit', ...hqCellPos(17, 41.5), sx: 4.5, sz: CELL * 2 }),
    // Pintu masuk di bawah SF: player datang lewat sini dan ia tersegel di
    // belakangnya — legenda user: `-` bisa dilalui KECUALI di start dan finish.
    Object.freeze({ kind: 'entry-seal', ...hqCellPos(24.5, 49), sx: CELL * 4, sz: 4.5, sealed: true }),
]);

// Pintu RUSAK: daun mati yang tak pernah bergerak. Selnya `@` sudah solid, jadi
// ini murni prop supaya player mengerti kenapa jalurnya tertutup.
const BROKEN_DOORS = Object.freeze([
    Object.freeze({ ...hqCellPos(36.5, 13), sx: CELL * 2, sz: 5 }),
    Object.freeze({ ...hqCellPos(40, 31), sx: 5, sz: CELL * 5 }),
    Object.freeze({ ...hqCellPos(24.5, 34), sx: CELL * 4, sz: 5 }),
]);

// Weapon cache `W`: "di sini banyak medkit dan ammo".
export const HQ_SUPPLY_POINTS = Object.freeze([
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...hqCellPos(33, 37) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...hqCellPos(36, 37) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...hqCellPos(39, 37) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...hqCellPos(42, 37) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...hqCellPos(45, 37) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...hqCellPos(33, 43) }),
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...hqCellPos(37, 43) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...hqCellPos(41, 43) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...hqCellPos(45, 43) }),
    Object.freeze({ type: 'medkit', ...hqCellPos(34, 40) }),
    Object.freeze({ type: 'medkit', ...hqCellPos(38, 40) }),
    Object.freeze({ type: 'medkit', ...hqCellPos(42, 40) }),
    Object.freeze({ type: 'medkit', ...hqCellPos(46, 40) }),
    Object.freeze({ type: 'medkit', ...hqCellPos(37, 46) }),
    Object.freeze({ type: 'medkit', ...hqCellPos(43, 46) }),
]);
export const HQ_CRATE_POINTS = Object.freeze([
    Object.freeze({ area: 'office', ...hqCellPos(7, 9) }),
    Object.freeze({ area: 'office', ...hqCellPos(19, 21) }),
    Object.freeze({ area: 'hall', ...hqCellPos(10, 31) }),
    Object.freeze({ area: 'corridor', ...hqCellPos(42, 22) }),
    Object.freeze({ area: 'server', ...hqCellPos(33, 8) }),
]);

// TIDAK SATU PUN titik berada di dalam `HQ_SERVER_ROOM` (permintaan user
// 2026-08-09): ruang server tetap sunyi sebelum dan sesudah upload.
export const HQ_ENCOUNTER_POINTS = Object.freeze({
    office: Object.freeze([[4, 2], [12, 2], [20, 2], [27, 4], [2, 7], [24, 10],
        [12, 10], [17, 12], [3, 14], [9, 18], [16, 18], [42, 20], [42, 24],
        [11, 25], [19, 25], [36, 30], [6, 31], [26, 31], [17, 32], [42, 32],
        [47, 35], [33, 36], [8, 39], [3, 42], [46, 44], [42, 47]]),
    purge: Object.freeze([[15, 2], [24, 4], [26, 11], [18, 10], [2, 12], [24, 16],
        [41, 20], [42, 19], [42, 27], [19, 37], [29, 37], [26, 38], [28, 40],
        [45, 41], [5, 42], [38, 44], [21, 46], [8, 47], [24, 47], [43, 47]]),
    // Squad yang turun kalau SIGNAL TRACE ruang rapat gagal.
    alarm: Object.freeze([[28, 16], [36, 16], [24, 21], [41, 22], [35, 31], [43, 20]]),
});

// Perabot kantor: [pembuat, kolom, baris, sx, sy, sz]. `desk` menambahkan kursi
// dekoratif (tanpa blocker) seperti Stage 1-3.
const FURNITURE = Object.freeze([
    // --- Gudang `G` (rak + peti) -------------------------------------------
    ['cupboard', 13, 1, 70, 15, 10], ['cupboard', 22, 1, 70, 15, 10],
    ['cupboard', 13, 3, 70, 15, 10], ['cupboard', 22, 3, 70, 15, 10],
    ['crate', 18, 2, 16, 12, 16], ['crate', 26, 2, 16, 12, 16],
    ['crate', 10, 4, 14, 11, 14],
    // --- Kantor terbuka barat-atas ------------------------------------------
    ['desk', 4, 1, 24, 7, 12], ['desk', 4, 4, 24, 7, 12],
    ['cupboard', 1, 2, 8, 15, 40],
    ['desk', 6, 7, 24, 7, 12], ['desk', 15, 7, 24, 7, 12], ['desk', 24, 7, 24, 7, 12],
    ['desk', 6, 11, 24, 7, 12], ['desk', 15, 11, 24, 7, 12],
    ['planter', 10, 8, 8, 11, 8], ['planter', 20, 12, 8, 11, 8],
    ['cupboard', 2, 10, 8, 15, 44],
    // --- Kantor terbuka barat-tengah ----------------------------------------
    ['desk', 5, 16, 24, 7, 12], ['desk', 13, 16, 24, 7, 12],
    ['desk', 5, 21, 24, 7, 12], ['desk', 13, 21, 24, 7, 12],
    ['desk', 8, 26, 24, 7, 12], ['desk', 17, 26, 24, 7, 12],
    ['cupboard', 21, 20, 8, 15, 40], ['sofa', 19, 15, 18, 6, 14],
    ['planter', 2, 19, 8, 11, 8], ['planter', 20, 27, 8, 11, 8],
    // --- Ruang rapat tertutup (rows 19-27, cols 28-39) ----------------------
    // Sel (39,20) sengaja KOSONG di sini: itu tempat konsol HACK ruang rapat,
    // yang dibangun terpisah karena layarnya berubah warna saat dibobol.
    ['meeting', 33, 21, 90, 7, 26], ['meeting', 33, 25, 70, 7, 24],
    ['cupboard', 28, 23, 8, 15, 44],
    ['planter', 29, 20, 8, 11, 8], ['planter', 38, 26, 8, 11, 8],
    // --- Lantai server timur-atas -------------------------------------------
    ['desk', 32, 2, 24, 7, 12], ['desk', 40, 2, 24, 7, 12],
    ['desk', 32, 11, 24, 7, 12], ['desk', 40, 11, 24, 7, 12],
    ['console', 44, 2, 8, 12, 16], ['console', 44, 11, 8, 12, 16],
    ['bench', 36, 6, 18, 6, 7], ['planter', 31, 8, 8, 11, 8],
    // --- Koridor + lobi ------------------------------------------------------
    ['bench', 24, 18, 7, 6, 18], ['bench', 24, 24, 7, 6, 18],
    ['planter', 25, 21, 8, 11, 8],
    ['bench', 42, 17, 7, 6, 18], ['planter', 42, 25, 8, 11, 8],
    ['sofa', 37, 30, 18, 6, 14], ['sofa', 22, 32, 18, 6, 14],
    ['planter', 45, 30, 8, 11, 8], ['planter', 8, 33, 8, 11, 8],
    // --- Ruang barat bawah ---------------------------------------------------
    ['desk', 5, 37, 24, 7, 12], ['desk', 5, 41, 24, 7, 12],
    ['cupboard', 8, 44, 8, 15, 40],
    ['desk', 13, 37, 22, 7, 12], ['desk', 13, 44, 22, 7, 12],
    ['planter', 15, 40, 8, 11, 8],
    // --- Safe area (ruang tunggu) -------------------------------------------
    ['sofa', 20, 37, 18, 6, 14], ['sofa', 28, 37, 18, 6, 14],
    ['planter', 19, 44, 8, 11, 8], ['planter', 29, 44, 8, 11, 8],
    ['bench', 21, 41, 7, 6, 18], ['bench', 27, 41, 7, 6, 18],
    // --- Toilet `R` (bilik + wastafel) --------------------------------------
    ['stall', 47.5, 15, 26, 20, 26], ['stall', 47.5, 18, 26, 20, 26],
    ['stall', 47.5, 21, 26, 20, 26], ['stall', 47.5, 24, 26, 20, 26],
    ['sink', 45, 19, 10, 11, 34], ['sink', 45, 23, 10, 11, 34],
    ['sink', 45, 26.5, 10, 11, 26],
    // --- Weapon cache `W` (loker senjata + peti) ----------------------------
    ['cupboard', 35, 35, 70, 15, 10], ['cupboard', 43, 35, 70, 15, 10],
    ['cupboard', 48, 39, 8, 15, 44], ['cupboard', 48, 46, 8, 15, 30],
    ['cupboard', 33, 47, 40, 15, 10], ['cupboard', 40, 47, 40, 15, 10],
    ['crate', 35, 41, 16, 12, 16], ['crate', 44, 41, 16, 12, 16],
    ['crate', 39, 45, 16, 12, 16],
]);

let built = false, worldRoot = null, navGrid = null, staticBatch = [];
let wallDetailCount = 0, furnitureDetailCount = 0, serverDetailCount = 0;
const blockers = [], doors = [], propRecords = [], stageLights = [];
const sparkPool = [], machines = [];
let uploadConsole = null, uploadMarker = null, finishMarker = null, cityscape = null;
let hackScreen = null, hackMarker = null;
const serverPanels = [];
let sparkT = 0;

export const hqWorldGroup = () => worldRoot;
export const hqNav = () => navGrid;
export const hqLights = () => stageLights;
export const hqMachines = () => machines;

function mapCellAt(x, z) {
    const c = Math.floor((x - HQ_X0) / CELL), r = Math.floor((z - HQ_Z0) / CELL);
    if (c < 0 || c >= HQ_COLS || r < 0 || r >= HQ_ROWS) return { c, r, token: '#' };
    return { c, r, token: HQ_MAP[r][c] };
}
export { mapCellAt as hqCellAt };

// Dinding, pintu RUSAK, bank server dan mesin robot memblok semua entitas.
// Mesin ikut di sini karena nav DI-BAKE dengan rangkanya terpasang — nav tak
// pernah perlu di-bake ulang, berapa kali pun mesin muncul/hancur.
const SOLID_TOKENS = '#@CM';
// Petak `M` yang rangkanya TIDAK ADA DI LAYAR. Aturannya: yang terlihat itulah
// yang menghalangi. Sejak 2026-08-09 mesin hanya tak terlihat SEBELUM lockdown
// (permintaan user: mesin baru muncul setelah upload); bangkainya sesudah
// hancur tetap terlihat, jadi tetap pejal. Nav TIDAK di-bake ulang — itu
// invarian proyek; robot memutar, player tak pernah menabrak dinding tak
// terlihat.
const openMachineCells = new Set();
const cellKey = (c, r) => c + ',' + r;
const openToken = (token, c, r) => !SOLID_TOKENS.includes(token)
    || (token === 'M' && openMachineCells.has(cellKey(c, r)));
const safeToken = token => token === 'A' || token === 'S' || token === 'Y';

function cornerCells(x, z, r) {
    const d = Math.max(0, r);
    return [mapCellAt(x - d, z - d), mapCellAt(x + d, z - d),
        mapCellAt(x - d, z + d), mapCellAt(x + d, z + d)];
}

export function hqTouchesSafeArea(x, z, radius = 0) {
    return safeToken(mapCellAt(x, z).token) || cornerCells(x, z, radius).some(m => safeToken(m.token));
}

export function hqWalk(x, z, radius = 0) {
    return cornerCells(x, z, radius).every(m => openToken(m.token, m.c, m.r));
}

function addBlocker(x, z, hx, hz, top = WALL_H, standable = false) {
    const b = { x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(hx, hz), top, standable };
    blockers.push(b); return b;
}

function blockedAt(x, z, radius = 3.5) {
    for (const b of blockers)
        if (Math.abs(x - b.x) <= b.hx + radius && Math.abs(z - b.z) <= b.hz + radius) return true;
    return false;
}

export function hqResolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
    resolveCampaignDoors(doors, pos, radius);
}

export function hqGroundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); }

export function hqSegHitsWall(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / (CELL * 0.3)));
    for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const cell = mapCellAt(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k);
        if (!openToken(cell.token, cell.c, cell.r)) return true;
    }
    return false;
}

export function hqDoorBlocksShot(x0, z0, x1, z1) {
    return sharedDoorBlocksShot(doors, x0, z0, x1, z1, 0);
}

export function hqDoorsWalkable(x, z, radius = 0) {
    return sharedDoorsWalkable(doors, x, z, radius);
}

export function hqDoorClampShot(b) {
    return sharedDoorClampShot(doors, b);
}

export const hqDoorOf = kind => doors.find(d => d.kind === kind);
export const hqDoors = () => doors;

// ---------------------------------------------------------------------------
// Geometri
// ---------------------------------------------------------------------------

function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m); return m;
}

function markerAt(p, color, ri = 6.5, ro = 8.5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42,
            side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.18, p.z); m.visible = false;
    worldRoot.add(m); return m;
}

function recordProp(kind, x, z, hx = 0, hz = 0, top = 0, solid = false) {
    propRecords.push({ kind, x, z, hx, hz, top, solid });
    return solid ? addBlocker(x, z, hx, hz, top, true) : null;
}

function addDoor(M, spec) {
    const rig = buildSplitDoor(worldRoot, M.body, spec.x, (WALL_H - 2) / 2, spec.z,
        spec.sx, WALL_H - 2, spec.sz);
    const lampMat = new THREE.MeshBasicMaterial({ color: DOOR_LOCKED_COLOR, toneMapped: false });
    const lamps = buildDoorSideLights(worldRoot, spec.x, spec.z,
        spec.sx, spec.sz, CELL, WALL_H, lampMat);
    const d = { kind: spec.kind, panel: rig.panel, rig, leaves: rig.leaves,
        lamps, open: 0, target: 0, cx: spec.x, cz: spec.z, ew: !rig.horizontal,
        hx: spec.sx / 2, hz: spec.sz / 2, cell: CELL, linger: 0,
        sealed: !!spec.sealed,
        locked: !!spec.locked, lockedInit: !!spec.locked,
        blocker: { x: spec.x, z: spec.z, hx: spec.sx / 2, hz: spec.sz / 2,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(spec.sx, spec.sz) / 2,
            top: WALL_H, standable: false } };
    doors.push(d); return d;
}

// Pintu RUSAK: daun macet setengah miring, lampu merah mati, rusuk terbuka.
function buildBrokenDoor(M, spec, staticProps) {
    const g = new THREE.Group(); g.position.set(spec.x, 0, spec.z);
    const horizontal = spec.sx > spec.sz;
    const leaf = box(g, M.body, spec.sx * 0.97, WALL_H - 4, spec.sz * 0.9, 0, (WALL_H - 4) / 2, 0);
    leaf.rotation[horizontal ? 'x' : 'z'] = 0.06;
    box(g, M.steel, horizontal ? spec.sx : 2.4, 2.4, horizontal ? 2.4 : spec.sz, 0, WALL_H - 3, 0);
    box(g, M.dead, horizontal ? 6 : 1.2, 1.2, horizontal ? 1.2 : 6, 0, WALL_H - 5.4, 0, false);
    for (const s of [-1, 1]) {
        const y = 6 + Math.random() * 8;
        box(g, M.steel, horizontal ? 3 : 1.4, 1.4, horizontal ? 1.4 : 3,
            horizontal ? s * spec.sx * 0.3 : 0, y, horizontal ? 0 : s * spec.sz * 0.3);
    }
    worldRoot.add(g);
    recordProp('broken-door', spec.x, spec.z, 0, 0, WALL_H, false);
    return g;
}

function buildFurniture(M, staticProps) {
    const detail = (sx, sy, sz, x, y, z, mat) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
        staticProps.push(mesh); furnitureDetailCount++; return mesh;
    };
    const put = (mesh, x, z, sx, sy, sz, kind, standable = true) => {
        mesh.position.set(x, 0, z);
        staticProps.push(mesh);
        recordProp(kind, x, z, sx / 2, sz / 2, sy, true);
        if (!standable) blockers[blockers.length - 1].standable = false;
    };
    for (const [kind, c, r, sx, sy, sz] of FURNITURE) {
        const p = hqCellPos(c, r);
        if (kind === 'desk') {
            put(buildFuturisticDeskMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'desk');
            detail(Math.min(12, sx * 0.3), 3.8, 0.75, p.x, sy + 1.9,
                p.z - sz * 0.18, M.screen);
            detail(Math.min(15, sx * 0.38), 0.8, 3, p.x, sy + 0.45,
                p.z - sz * 0.18, M.steel);
            detail(3.2, 1.6, 4.2, p.x + sx * 0.34, sy + 0.8,
                p.z + sz * 0.22, M.ink);
            const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
            chair.position.set(p.x, 0, p.z + sz * 0.5 + 2);
            chair.rotation.y = Math.PI;
            staticProps.push(chair);
        } else if (kind === 'meeting') {
            put(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'meeting-table');
            detail(sx * 0.55, 0.7, Math.min(5, sz * 0.25), p.x, sy + 0.45, p.z, M.screen);
            for (const x of [-sx * 0.32, sx * 0.32])
                detail(3.5, 0.9, 3.5, p.x + x, sy + 0.55, p.z, M.steel);
        } else if (kind === 'cupboard') {
            // Deret lemari sepanjang sisi terpanjang, satu blocker penuh.
            recordProp('cupboard', p.x, p.z, sx / 2, sz / 2, sy, true);
            const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
            const n = Math.max(1, Math.min(5, Math.round(longLen / shortLen)));
            const unit = longLen / n;
            for (let i = 0; i < n; i++) {
                const off = -longLen / 2 + unit * (i + 0.5);
                const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
                cab.position.set(along ? p.x + off : p.x, 0, along ? p.z : p.z + off);
                staticProps.push(cab);
            }
            detail(sx + 1, 1, sz + 1, p.x, sy + 0.5, p.z, M.steel);
            const marks = Math.max(2, Math.min(6, Math.round((sx + sz) / 18)));
            for (let i = 0; i < marks; i++) {
                const k = (i + 0.5) / marks - 0.5;
                detail(sx >= sz ? 5 : 0.7, 2.2, sx >= sz ? 0.7 : 5,
                    p.x + (sx >= sz ? k * sx * 0.8 : sx / 2 + 0.4), sy * 0.63,
                    p.z + (sx >= sz ? sz / 2 + 0.4 : k * sz * 0.8),
                    i === 0 ? M.hazard : M.panel);
            }
        } else if (kind === 'console') {
            put(buildFuturisticConsoleMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'console');
            detail(sx * 0.62, 0.7, 1, p.x, sy + 0.35, p.z + sz * 0.28, M.screen);
        } else if (kind === 'crate') {
            put(buildFuturisticCrateMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'crate');
            for (const x of [-sx * 0.32, sx * 0.32])
                detail(1, sy + 0.5, sz + 0.6, p.x + x, sy / 2, p.z, M.steel);
        } else if (kind === 'planter') {
            put(buildFuturisticPlanterMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'planter');
        } else if (kind === 'sofa') {
            put(buildFuturisticSofaMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'sofa');
            for (const x of [-sx / 2 + 1, sx / 2 - 1])
                detail(2, sy * 0.72, sz + 0.7, p.x + x, sy * 0.36, p.z, M.steel);
        } else if (kind === 'bench') {
            put(buildFuturisticBenchMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'bench');
            detail(sx - 2, 0.7, sz + 0.7, p.x, sy + 0.35, p.z, M.panel);
        } else if (kind === 'stall') {
            put(buildFuturisticStallMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'toilet-stall');
            detail(sx + 0.8, 1, 1, p.x, sy - 1.1, p.z - sz / 2, M.steel);
        } else if (kind === 'sink') {
            put(buildFuturisticSinkMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, 'washbasin');
            detail(sx * 0.74, sy * 0.8, 0.7, p.x, sy * 1.35,
                p.z - sz / 2 + 0.2, M.screen);
            detail(sx * 0.22, 1.4, 1.4, p.x, sy + 1.2, p.z, M.steel);
        }
    }
}

// Bank server `C`: rak berjajar dengan panel layar. Selnya sudah solid lewat
// SOLID_TOKENS, jadi di sini hanya bentuknya.
function buildServers(M, staticProps) {
    for (let r = 0; r < HQ_ROWS; r++) for (let c = 0; c < HQ_COLS; c++) {
        if (HQ_MAP[r][c] !== 'C') continue;
        const p = hqCellPos(c, r);
        const rack = new THREE.Mesh(new THREE.BoxGeometry(CELL - 2.5, 19, CELL - 2.5), M.ink);
        rack.position.set(p.x, 9.5, p.z); rack.castShadow = true; rack.receiveShadow = true;
        staticProps.push(rack);
        for (const y of [5, 10, 15]) {
            const led = new THREE.Mesh(new THREE.BoxGeometry(CELL - 6, 0.7, 0.8), M.amber);
            led.position.set(p.x, y, p.z - CELL / 2 + 1.4);
            staticProps.push(led); serverDetailCount++;
            for (const x of [-CELL * 0.27, CELL * 0.27]) {
                const latch = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.4, 0.9), M.steel);
                latch.position.set(p.x + x, y, p.z - CELL / 2 + 1.2);
                staticProps.push(latch); serverDetailCount++;
            }
        }
        for (const x of [-CELL / 2 + 1.3, CELL / 2 - 1.3]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 20.5, 1.1), M.steel);
            rail.position.set(p.x + x, 10.25, p.z - CELL / 2 + 1.2);
            staticProps.push(rail); serverDetailCount++;
        }
        const cap = new THREE.Mesh(new THREE.BoxGeometry(CELL - 1, 1.1, CELL - 1), M.body);
        cap.position.set(p.x, 19.7, p.z); staticProps.push(cap); serverDetailCount++;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(CELL - 6, 5, 0.8), M.screen);
        panel.position.set(p.x, 16, p.z - CELL / 2 + 1.1);
        worldRoot.add(panel); serverPanels.push(panel);
        addBlocker(p.x, p.z, CELL / 2, CELL / 2, 19);
    }
}

// Konsol upload di titik `H`, menghadap bank server.
function buildUploadConsole(M) {
    const g = new THREE.Group(); g.position.set(UPLOAD_CONSOLE.x, 0, UPLOAD_CONSOLE.z);
    box(g, M.ink, 9, 6, CELL - 3, 0, 3, 0);
    const top = box(g, M.body, 10, 2, CELL - 2, 0, 7, 0); top.rotation.z = -0.12;
    uploadConsole = box(g, M.screen, 0.9, 6, 9, 4.6, 9.6, 0, false); uploadConsole.rotation.z = -0.12;
    for (const z of [-3.5, 0, 3.5]) box(g, M.amber, 0.9, 1, 1.4, 4.9, 5.2, z, false);
    worldRoot.add(g);
    recordProp('upload-console', UPLOAD_CONSOLE.x, UPLOAD_CONSOLE.z, 5, CELL / 2 - 1, 10, true);
    uploadMarker = markerAt(HQ_UPLOAD, PAL.amber, 8, 10.5);
}

// Konsol HACK ruang rapat: kunci jaringan pintu ruang server. Dibangun terpisah
// dari FURNITURE karena layarnya berganti warna begitu jaringannya dibobol.
function buildHackConsole(M) {
    const g = new THREE.Group(); g.position.set(HACK_CONSOLE.x, 0, HACK_CONSOLE.z);
    box(g, M.ink, 8, 6, CELL - 2, 0, 3, 0);
    const top = box(g, M.body, 9, 2, CELL - 1, 0, 7, 0); top.rotation.z = 0.12;
    hackScreen = box(g, M.screen, 0.9, 6, 9, -4.4, 9.5, 0, false); hackScreen.rotation.z = 0.12;
    for (const z of [-3.5, 0, 3.5]) box(g, M.amber, 0.9, 1, 1.4, -4.7, 5.2, z, false);
    box(g, M.steel, 3, 13, 3, 3.2, 6.5, -CELL / 2 + 2);
    worldRoot.add(g);
    recordProp('hack-console', HACK_CONSOLE.x, HACK_CONSOLE.z, 4, CELL / 2 - 1, 10, true);
    hackMarker = markerAt(HQ_HACK, PAL.tech, 8, 10.5);
}

// Semua sel 'M' yang tersambung dengan pusat mesin (blok 3x3 pada denah user).
function machineCells(x, z) {
    const seed = mapCellAt(x, z);
    const out = new Set(), stack = [[seed.c, seed.r]];
    while (stack.length) {
        const [c, r] = stack.pop(), key = cellKey(c, r);
        if (out.has(key)) continue;
        if (c < 0 || c >= HQ_COLS || r < 0 || r >= HQ_ROWS) continue;
        if (HQ_MAP[r][c] !== 'M') continue;
        out.add(key);
        stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return [...out];
}

function buildMachines(M) {
    for (const spec of MACHINE_POINTS) {
        const rig = buildSpawnMachineMesh(CELL * 3 - 4, 19, CELL * 3 - 4);
        rig.group.position.set(spec.x, 0, spec.z);
        rig.group.rotation.y = Math.PI / 2;       // corong menghadap +x (ke ruangan)
        worldRoot.add(rig.group);
        const half = (CELL * 3 - 4) / 2;
        // Collider dipegang supaya bisa DICABUT selama rangkanya belum turun.
        const blocker = recordProp('spawn-machine', spec.x, spec.z, half, half, 19, true);
        machines.push({ id: spec.id, group: rig.group, rig, eyeMat: rig.eyeMat,
            coreMat: rig.coreMat, x: spec.x, z: spec.z,
            hatch: { x: spec.hatch.x, z: spec.hatch.z },
            // Tapak `M` + collider miliknya: dipakai membuka petaknya selagi
            // mesin belum diturunkan.
            cells: machineCells(spec.x, spec.z), blocker,
            hp: 0, alive: false, deployed: false, active: false, hitT: 0 });
    }
}

// Rangka mesin hanya memblok saat ia benar-benar terlihat.
function setMachineSolid(m, solid) {
    const i = m.blocker ? blockers.indexOf(m.blocker) : -1;
    if (solid && m.blocker && i === -1) blockers.push(m.blocker);
    if (!solid && i !== -1) blockers.splice(i, 1);
    for (const k of m.cells) { if (solid) openMachineCells.delete(k); else openMachineCells.add(k); }
}

function buildSparks(M) {
    for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 2.4), M.spark);
        m.visible = false; worldRoot.add(m); sparkPool.push(m);
    }
}

function buildWorld() {
    worldRoot = new THREE.Group(); worldRoot.name = 'stage6-hq';
    const M = {
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        floor: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        deck: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        tile: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        dead: new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }),
        amber: new THREE.MeshLambertMaterial({ color: PAL.amberDim, emissive: PAL.amber,
            emissiveIntensity: EMISSIVE_MAX * 0.48 }),
        screen: new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.techDim,
            emissiveIntensity: 0.28 }),
        spark: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    };
    const staticProps = [];
    const add = (sx, sy, sz, x, y, z, mat = M.concrete) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        staticProps.push(m); return m;
    };

    add(HQ_COLS * CELL, 1.5, HQ_ROWS * CELL, HQ_OX, -0.75, HQ_OZ, M.concrete);
    const addFloor = (c0, r0, c1, r1, mat) => {
        const a = hqCellPos(c0, r0), b = hqCellPos(c1, r1);
        add((c1 - c0 + 1) * CELL, 0.45, (r1 - r0 + 1) * CELL,
            (a.x + b.x) / 2, 0.05, (a.z + b.z) / 2, mat);
    };
    addFloor(1, 1, 48, 33, M.floor);        // seluruh lantai kantor
    addFloor(10, 1, 28, 4, M.deck);         // gudang
    addFloor(45, 14, 48, 27, M.tile);       // toilet
    addFloor(1, 34, 48, 48, M.floor);       // lantai bawah
    addFloor(18, 35, 30, 48, M.deck);       // safe area
    addFloor(32, 35, 48, 48, M.deck);       // weapon cache

    wallDetailCount = 0; furnitureDetailCount = 0; serverDetailCount = 0;
    const isWall = (c, r) => c < 0 || c >= HQ_COLS || r < 0 || r >= HQ_ROWS
        || HQ_MAP[r][c] === '#';
    for (let r = 0; r < HQ_ROWS; r++) for (let c = 0; c < HQ_COLS; c++) {
        if (HQ_MAP[r][c] !== '#') continue;
        const p = hqCellPos(c, r);
        wallDetailCount += buildDetailedWallCell(add, {
            c, r, x: p.x, z: p.z, cell: CELL, wallH: WALL_H, isWall,
            body: M.body, panel: M.panel, steel: M.steel, ink: M.ink,
            accent: M.hazard, accentEvery: 17,
        });
        addBlocker(p.x, p.z, CELL / 2, CELL / 2, WALL_H);
    }
    // Sel pintu rusak juga pejal permanen; propnya dibangun di bawah.
    for (let r = 0; r < HQ_ROWS; r++) for (let c = 0; c < HQ_COLS; c++) {
        if (HQ_MAP[r][c] !== '@') continue;
        const p = hqCellPos(c, r);
        addBlocker(p.x, p.z, CELL / 2, CELL / 2, WALL_H);
    }

    buildFurniture(M, staticProps);
    buildServers(M, staticProps);
    for (const spec of BROKEN_DOORS) buildBrokenDoor(M, spec, staticProps);

    staticBatch = addMergedStatic(worldRoot, staticProps);

    buildUploadConsole(M);
    buildHackConsole(M);
    buildMachines(M);
    for (const spec of DOOR_LAYOUT) addDoor(M, spec);
    finishMarker = markerAt(HQ_START, PAL.tech, 9, 12);
    buildSparks(M);

    // Cincin kota (lihat catatan di world.js chapter 1). Diinduk ke `worldRoot`
    // milik chapter HQ; jaraknya 6000 unit dari cincin chapter arrival sehingga
    // keduanya tak pernah bertumpuk maupun terlihat bersamaan (camera.far 4000).
    cityscape = buildCampaignCityscape(HQ_OX, HQ_OZ, HQ_COLS * CELL / 2, HQ_ROWS * CELL / 2,
        { parent: worldRoot, groundY: CITY_GROUND_Y });

    const lampCells = [[14, 3], [40, 3], [12, 9], [24, 9], [40, 9],
        [10, 20], [24, 21], [33, 23], [42, 21], [46, 20],
        [12, 31], [30, 31], [45, 31], [6, 42], [24, 42], [40, 42]];
    for (const [c, r] of lampCells) {
        const p = hqCellPos(c, r);
        const L = new THREE.PointLight(PAL.amber, 0.42, 150);
        L.position.set(p.x, 24, p.z); worldRoot.add(L);
        registerStageLight('campaign-6', L); stageLights.push(L);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6),
            new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }));
        bulb.position.copy(L.position); worldRoot.add(bulb);
    }

    navGrid = makeNavGrid(HQ_X0, HQ_Z0, CELL, HQ_COLS, HQ_ROWS,
        (x, z) => hqWalk(x, z, 4) && !blockedAt(x, z, 3.5));
}

export function ensureHqWorld(parent) {
    if (built) return worldRoot;
    built = true; buildWorld();
    if (parent) parent.add(worldRoot);
    return worldRoot;
}
export const hqWorldBuilt = () => built;
export const hqStaticBatchDbg = () => staticBatch;

// ---------------------------------------------------------------------------
// Animasi dunia
// ---------------------------------------------------------------------------

export function updateHqDoors(dt) {
    for (const d of doors) {
        updateDoorMotion(d, dt, d.target);
        setDoorSideLightState(d.lamps, !d.sealed && !d.locked);
    }
}

export function updateHqAutoDoors(px, pz, dt = 0) {
    for (const d of doors) {
        if (d.sealed || d.locked) {
            d.target = doorProximityTarget(d, dt, px, pz, CELL, false);
            continue;
        }
        d.target = doorProximityTarget(d, dt, px, pz, CELL);
    }
}

export function unlockHqDoor(kind) {
    const d = doors.find(x => x.kind === kind);
    if (d) d.locked = false;
    return !!d;
}

export function setHackScreenHacked(on) {
    if (!hackScreen) return;
    hackScreen.material = hackScreen.material.clone();
    hackScreen.material.emissive.setHex(on ? PAL.tech : PAL.techDim);
    hackScreen.material.emissiveIntensity = on ? 0.5 : 0.28;
}
export function setHackMarker(on) { if (hackMarker) hackMarker.visible = !!on; }

export function setMachineActive(id, on) {
    const m = machines.find(x => x.id === id);
    if (!m) return;
    m.active = !!on;
    m.coreMat.color.setHex(on ? PAL.tech : PAL.techDim);
    m.eyeMat.color.setHex(on ? 0xff2b1f : PAL.steel);
}

// MESIN BARU DITURUNKAN SETELAH UPLOAD (permintaan user 2026-08-09): sebelum ini
// rangkanya tidak ada di layar sama sekali, jadi petak + collider-nya juga
// terbuka. Begitu turun, ia langsung utuh, pejal dan menyala.
export function deployMachine(id) {
    const m = machines.find(x => x.id === id);
    if (!m || m.deployed) return;
    m.deployed = true; m.alive = true; m.hitT = 0;
    m.hp = spawnMachineHp();
    m.group.visible = true;
    setMachineSolid(m, true);
    resetSpawnMachine(m.rig, true);
    setMachineActive(id, true);
}

// Mesin hancur TIDAK hilang: ia menjadi bangkai hitam gosong dengan part yang
// terlepas, dan karena bangkainya terlihat ia TETAP pejal.
export function killMachineVisual(id) {
    const m = machines.find(x => x.id === id);
    if (!m || !m.alive) return;
    m.alive = false; m.active = false; m.hitT = 0;
    wreckSpawnMachine(m.rig);
}

export function setUploadMarker(on) { if (uploadMarker) uploadMarker.visible = !!on; }
export function setFinishMarker(on) { if (finishMarker) finishMarker.visible = !!on; }

export function pulseHqMarkers(dt, t) {
    for (const m of [uploadMarker, finishMarker, hackMarker]) {
        if (!m?.visible) continue;
        m.material.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t * 4));
        m.rotation.z += dt * 0.8;
    }
}

export function setUploadAlarm(on) {
    if (uploadConsole) {
        uploadConsole.material = uploadConsole.material.clone();
        uploadConsole.material.color.setHex(on ? PAL.hazard : PAL.screenBg);
        uploadConsole.material.emissive.setHex(on ? PAL.hazard : PAL.techDim);
        uploadConsole.material.emissiveIntensity = on ? EMISSIVE_MAX : 0.28;
    }
    for (const p of serverPanels) {
        p.material.emissive.setHex(on ? PAL.hazard : PAL.techDim);
        p.material.emissiveIntensity = on ? 0.6 : 0.28;
    }
}

export function setLockdownLights(on) {
    for (const L of stageLights) {
        L.color.setHex(on ? PAL.hazard : PAL.amber);
        L.intensity = on ? 0.5 : 0.42;
    }
}

export function hqSparks(center, sec = 2.5) {
    sparkT = Math.max(sparkT, sec);
    for (let i = 0; i < sparkPool.length; i++) {
        const s = sparkPool[i], a = i / sparkPool.length * Math.PI * 2;
        s.position.set(center.x + Math.sin(a) * rand(2, 11), rand(4, 19),
            center.z + Math.cos(a) * rand(2, 11));
        s.rotation.y = a; s.userData.vx = Math.sin(a) * rand(3, 10);
        s.userData.vy = rand(6, 15); s.userData.vz = Math.cos(a) * rand(3, 10);
        s.visible = true;
    }
}

export function updateHqFx(dt) {
    // Animasi mesin tidak bergantung pada pool percikan; rig tetap hidup saat alarm aktif.
    for (const m of machines) if (m.deployed && m.alive)
        updateSpawnMachine(m.rig, dt, m.active, m.hitT);
    if (sparkT <= 0) { for (const s of sparkPool) s.visible = false; return; }
    sparkT = Math.max(0, sparkT - dt);
    for (const s of sparkPool) {
        s.position.x += (s.userData.vx || 0) * dt;
        s.position.y += (s.userData.vy || 0) * dt;
        s.position.z += (s.userData.vz || 0) * dt;
        s.userData.vy = (s.userData.vy || 0) - dt * 30;
        s.rotation.x += dt * 8;
        if (s.position.y < 0.3) s.visible = false;
    }
}

export function resetHqVisuals() {
    for (const d of doors) {
        d.open = 0; d.target = 0; d.linger = 0; d.locked = !!d.lockedInit;
        updateDoorMotion(d, 0, 0);
        setDoorSideLightState(d.lamps, !d.sealed && !d.locked);
    }
    for (const m of machines) {
        // Chapter dimulai TANPA mesin di layar: rangkanya baru turun saat
        // lockdown, jadi petak + collider-nya juga dibuka lebih dulu.
        m.alive = false; m.deployed = false; m.active = false; m.hp = 0; m.hitT = 0;
        m.group.visible = false;
        setMachineSolid(m, false);
        resetSpawnMachine(m.rig, false);
    }
    for (const m of MACHINE_POINTS) setMachineActive(m.id, false);
    setUploadMarker(false); setFinishMarker(false);
    setHackMarker(false); setHackScreenHacked(false);
    setUploadAlarm(false); setLockdownLights(false);
    sparkT = 0; for (const s of sparkPool) s.visible = false;
}

export const hqWorldDebug = () => ({
    built,
    map: { rows: HQ_ROWS, cols: HQ_COLS, cell: CELL, x0: HQ_X0, z0: HQ_Z0,
        walls: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === '#').length, 0),
        safe: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'A' || t === 'Y').length, 0),
        startFinish: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'S').length, 0),
        broken: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === '@').length, 0),
        doors: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === '-').length, 0),
        keyedDoors: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === '=').length, 0),
        keyedPlus: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === '+').length, 0),
        cache: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'W').length, 0),
        servers: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'C').length, 0),
        upload: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'H').length, 0),
        restroom: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'R').length, 0),
        warehouse: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'G').length, 0),
        machines: HQ_MAP.reduce((n, row) => n + [...row].filter(t => t === 'M').length, 0),
        events: HQ_MAP.reduce((n, row) => n + [...row].filter(t => '123'.includes(t)).length, 0) },
    start: { ...HQ_START }, upload: { ...HQ_UPLOAD }, servers: { ...HQ_SERVERS },
    hack: { ...HQ_HACK }, serverRoom: { ...HQ_SERVER_ROOM },
    machinePoints: MACHINE_POINTS.map(m => ({ ...m, hatch: { ...m.hatch } })),
    events: EVENT_POINTS.map(e => ({ ...e })),
    machines: machines.map(m => ({ id: m.id, alive: m.alive, active: m.active,
        deployed: m.deployed, hp: m.hp, visible: !!m.group.visible, cells: m.cells.length,
        blocking: !!m.blocker && blockers.includes(m.blocker),
        rig: spawnMachineDebug(m.rig) })),
    blockers: blockers.length, props: propRecords.map(p => ({ ...p })),
    propKinds: [...new Set(propRecords.map(p => p.kind))],
    doors: doors.map(d => ({ kind: d.kind, open: d.open, target: d.target,
        sealed: !!d.sealed, locked: !!d.locked, canOpen: !d.sealed && !d.locked,
        x: d.blocker.x, z: d.blocker.z,
        lamps: d.lamps.map(l => ({ x: l.position.x, y: l.position.y, z: l.position.z,
            color: l.material.color.getHex() })),
        split: splitDoorDebug(d.rig) })),
    markers: { upload: !!uploadMarker?.visible, finish: !!finishMarker?.visible,
        hack: !!hackMarker?.visible },
    pools: { sparks: sparkPool.length },
    visiblePools: { sparks: sparkPool.filter(s => s.visible).length },
    lights: stageLights.length, nav: !!navGrid, staticBatches: staticBatch.length,
    architecture: { wallDetails: wallDetailCount },
    furnitureDetails: { furniture: furnitureDetailCount, servers: serverDetailCount },
    supplies: HQ_SUPPLY_POINTS.map(p => ({ ...p })), crates: HQ_CRATE_POINTS.map(p => ({ ...p })),
    city: cityscape && { groundY: cityscape.groundY, buildings: cityscape.buildings,
        trees: cityscape.trees, parented: cityscape.root === worldRoot },
});
