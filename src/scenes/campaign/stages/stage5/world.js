// Stage 5 — DUNIA: denah CSV, geometri stasiun, landmark C1/C2, perabot,
// pintu, kereta player/musuh, collision + nav. Modul ini TIDAK menyimpan state
// alur cerita; ketiga sub-scene (station/journey/arrival) memakainya lewat
// binding hidup ESM.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { scene, camera } from '../../../../core/renderer.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { resolveBlockers, blockersGroundHeight } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { buildCampaignCityscape } from '../../utility/cityscape.js';
import {
    buildSplitDoor, doorMotionSFX, setDoorSideLightState, setSplitDoorOpen, splitDoorDebug,
} from '../../utility/doors.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, spawnMachineDebug, updateSpawnMachine,
    wreckSpawnMachine,
} from '../../../../entities/spawnMachine.js';
import {
    buildMilitaryTrainMesh, buildTrainJourneyScenery, buildJourneyHighway,
    TRAIN_CAR_LENGTH, TRAIN_CAR_STEP, TRAIN_HALF_WIDTH, TRAIN_PLAYER_CAR, TRAIN_LOCO_CAR,
    TRAIN_DOOR_X, TRAIN_DOOR_HALF, TRAIN_DOOR_LEAF_Z, TRAIN_DOOR_T, TRAIN_SIDE_WALL_H,
    TRAIN_INNER_HALF, TRAIN_INNER_HALF_LEN, TRAIN_GAUGE_HALF, JOURNEY_TRACK_DZ,
    resetTrainVisual, resetJourneyScenery, resetJourneyHighway,
    HIGHWAY_HALF_W, HIGHWAY_LANES, HIGHWAY_LANE_W, highwayLaneOffset,
} from '../../../../entities/train.js';
import { buildEnemyPickupMesh, resetEnemyPickupVisual } from '../../../../entities/enemyPickup.js';
import {
    meshCount, buildMarker, buildGenerator, buildTerminal, buildTrackBed,
    buildStationFurniture, buildStationDoor, buildEnemyTrain,
    ET_RAMP_OPEN, ET_CAR_SILL, ET_CAR_HEIGHT,
} from './props.js';

// Denah resmi user `stages(Stage5-Start).csv`, 30 kolom × 50 baris.
// Token satu-karakter internal untuk legenda CSV:
//   '=' TT rel, ',' SPACE antar-rel, 'T' TC gerbong, 'I' TCI pintu naik,
//   'L' TL lokomotif, '@' dinding berjendela, 'A' SA, 'S' start, '-' pintu,
//   'H' titik aksi, '1' C1, '2' C2, '.' lantai kosong.
// Baris 1-4 adalah TRACK MUSUH; baris 6-9 track kereta player. Jangan
// mengubah layout tanpa memperbarui CSV-contract smoke test.
export const S5_MAP = Object.freeze([
    '==============================',
    '==============================',
    '==============================',
    '==============================',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    '=====TTTTTTTLLLLLLL===========',
    '=====TTTTTTTLLLLLLL===========',
    '=====TTTTTTTLLLLLLL===========',
    '=====TITTTTTLLLLLLL===========',
    '#####.........................',
    '#2222.........................',
    '#.HH..........................',
    '#.............................',
    '#.............................',
    '#.............................',
    '#.............................',
    '##@@###@@##@@##@@##@@##@@#--##',
    '#AAAA#.......................#',
    '#AAAA-.......................#',
    '#AAAA-.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.................#######',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................-...H1#',
    '#AAAA#.................-...H1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#ASSA#.................#....1#',
    '##############################',
]);
export const S5_LEGEND = Object.freeze({
    '#': 'wall', '@': 'window-wall', S: 'start', '-': 'door', H: 'action',
    1: 'hack', 2: 'generator', A: 'safe',
    '=': 'track', ',': 'track-gap', T: 'train-car', I: 'train-entry', L: 'locomotive',
});
export { BANDUNG_MAP as S5_FINISH_MAP } from '../../../../entities/train.js';

// Intro rooftop memakai x≈150000 dan dibuang setelah cutscene; Stage 5 tetap
// dipisah satu blok dunia penuh agar jalur Continue/cheat tidak pernah melihatnya.
export const OX = 180000, OZ = 0;
export const MAP_COLS = 30, MAP_ROWS = 50, CELL = 16.5, WALL_H = 25;
export const MAP_X0 = OX - MAP_COLS * CELL / 2, MAP_Z0 = OZ - MAP_ROWS * CELL / 2;
const DEPOT = { x0: MAP_X0, x1: MAP_X0 + MAP_COLS * CELL, z0: MAP_Z0, z1: MAP_Z0 + MAP_ROWS * CELL };
export const cellPos = (c, r) => ({ x: MAP_X0 + (c - 0.5) * CELL, z: MAP_Z0 + (r - 0.5) * CELL });
// Dua jalur: baris 1-4 = track musuh, baris 6-9 = track kereta player.
export const TRAIN_CENTER_Z = cellPos(1, 7.5).z;
export const ENEMY_TRACK_Z = cellPos(1, 2.5).z;
// Konsist player = gerbong 0 (arena) + lokomotif 1. DI STASIUN konsist digeser
// ke barat sehingga gerbong 0 jatuh persis pada sel TC dan lokomotif pada TL.
export const STATION_CAR_INDEX = 0;
export const TRAIN_BASE_X = OX - 2 * TRAIN_CAR_STEP;
// ARENA PLAYER = bagian DALAM gerbong 0 saja (permintaan user 2026-08-07:
// player tidak bisa keluar gerbong dan tidak bisa masuk lokomotif).
export const TRAIN_X0 = TRAIN_BASE_X - TRAIN_INNER_HALF_LEN;
export const TRAIN_X1 = TRAIN_BASE_X + TRAIN_INNER_HALF_LEN;
export const TRAIN_Z0 = TRAIN_CENTER_Z - TRAIN_INNER_HALF;
export const TRAIN_Z1 = TRAIN_CENTER_Z + TRAIN_INNER_HALF;
// Sel TC menempati kolom 0-based 5..11 (pusat 8), yaitu cellPos(9); sel TL
// 12..18 (pusat 15) = cellPos(16). Selisih keduanya 7 sel = TRAIN_CAR_STEP,
// jadi gerbong + lokomotif jatuh PERSIS pada dua blok token itu.
export const STATION_TC_X = cellPos(9, 1).x;
export const STATION_TRAIN_DX = STATION_TC_X - (TRAIN_BASE_X + STATION_CAR_INDEX * TRAIN_CAR_STEP);
// Sumbu jalur musuh SELAMA PERJALANAN (double track mainline, jauh lebih rapat
// dari dua jalur stasiun yang dipisah peron).
export const JOURNEY_ENEMY_Z = TRAIN_CENTER_Z + JOURNEY_TRACK_DZ;

const GENERATOR_OBJECT = cellPos(3.5, 11);
const TERMINAL_OBJECT = cellPos(29, 45.5);
const PLATFORM_DOOR_POS = cellPos(27.5, 17);
const CONTROL_DOOR_POS = cellPos(24, 45.5);
const SAFE_DOOR_POS = cellPos(6, 19.5);
export const S5_START = Object.freeze(cellPos(3.5, 49));
export const S5_GENERATOR = Object.freeze(cellPos(3.5, 12));     // H dekat C2
export const S5_TERMINAL = Object.freeze(cellPos(28, 45.5));     // H dekat C1
export const S5_BOARD = Object.freeze(cellPos(7, 10));           // peron di depan TCI
export const S5_TCI = Object.freeze(cellPos(7, 9));
export const S5_SPAWN_MACHINE = Object.freeze(cellPos(16, 22));
export const S5_MACHINE_SPAWNS = Object.freeze([-1, 0, 1].map(i => Object.freeze({
    x: S5_SPAWN_MACHINE.x - 25, z: S5_SPAWN_MACHINE.z + i * 8,
})));
export const SUPPLY_POINTS = Object.freeze([
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...cellPos(3, 43) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...cellPos(10, 39) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...cellPos(20, 33) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...cellPos(13, 18) }),
    Object.freeze({ type: 'medkit', ...cellPos(4, 25) }),
    Object.freeze({ type: 'medkit', ...cellPos(21, 20) }),
]);
// Peti persediaan HANYA di gudang. Lorong gerbong (4 m) masih lebih sempit
// daripada radius blok peti, jadi satu peti di dalam kereta akan menyumbat
// jalur player sepenuhnya — persediaan perjalanan memakai drop (tidak pejal).
export const CRATE_POINTS = Object.freeze([
    Object.freeze({ area: 'depot', ...cellPos(11, 45) }),
    Object.freeze({ area: 'depot', ...cellPos(18, 37) }),
    Object.freeze({ area: 'depot', ...cellPos(24, 28) }),
]);
// Barel gameplay tidak masuk nav: robot boleh melewatinya, player didorong oleh
// resolveBarrelBlock. Semua titik berada di hall dan di luar SA/S/C1/C2.
export const BARREL_POINTS = Object.freeze([
    [8, 22], [13, 29], [22, 30], [9, 38],
    [16, 42], [23, 39], [18, 48], [27, 34],
].map(([c, r]) => Object.freeze(cellPos(c, r))));
// Bekal di dalam gerbong: player terkurung di sana sepanjang perjalanan.
export const CAR_SUPPLY_POINTS = Object.freeze([
    Object.freeze({ type: 'ammo', weapon: 'rifle', x: TRAIN_X0 + 16, z: TRAIN_CENTER_Z - 5 }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', x: TRAIN_X1 - 16, z: TRAIN_CENTER_Z - 5 }),
    Object.freeze({ type: 'medkit', x: TRAIN_BASE_X, z: TRAIN_CENTER_Z + 5 }),
]);

let built = false, worldRoot = null;
export let stationRoot = null, train = null, journey = null, navGrid = null;
let staticBatch = [];
export let generatorScreen = null, terminalScreen = null, stationSpawnMachine = null;
// Collider mesin pembuat robot: dipegang supaya bisa DICABUT saat mesin hancur.
let machineBlocker = null;
let generatorRotor = null, terminalCore = null;
let landmarkVisual = { generatorMeshes: 0, terminalMeshes: 0, animatedParts: 0 };
let safeFloorOverlayCount = 0, runoutX1 = 0, leadX0 = 0, fenceDbg = null;
const depotFurniture = [], platformFurniture = [];
export let repairMarker = null, terminalMarker = null, boardMarker = null;
const blockers = [];
const stationDoors = [];
const windowPanes = [];
export let enemyTrain = null;
// Pintu naik gerbong player: satu-satunya pintu kereta yang bergerak.
export let boardDoor = null;
// Cincin kota di sekeliling depot (2026-08-09). Ketinggian jalannya nyaris rata
// dengan lantai depot, dan koridor rel dikosongkan sejauh CITY_TRACK_CLEAR dari
// kedua sumbu jalur supaya tidak ada gedung yang berdiri di atas rel.
export const CITY_GROUND_Y = -6, CITY_TRACK_CLEAR = 90;
// JALUR MASUK BARAT (2026-08-11, permintaan user): dinyatakan dalam METER
// kampanye supaya angka "100 m" tetap terbaca; geometrinya ada di props.js.
export const WEST_LEAD_METERS = 100;
export let cityscape = null;
// Pool jalan raya pendamping + pengangkut jalan raya (permintaan user
// 2026-08-08). Keduanya PREALOKASI seperti pool lain di stage ini.
export let highway = null;
export const highwayPickups = [];
export { HIGHWAY_HALF_W, HIGHWAY_LANES, HIGHWAY_LANE_W, highwayLaneOffset };

function mapCellAt(x, z) {
    const c = Math.floor((x - MAP_X0) / CELL), r = Math.floor((z - MAP_Z0) / CELL);
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return { c, r, token: '#' };
    return { c, r, token: S5_MAP[r][c] };
}

// Dinding, dinding-jendela dan badan kereta stasiun solid untuk semua entitas.
const SOLID_TOKENS = '#@TIL';
const HALL_ROW0 = 17;                                 // baris pertama di bawah dinding peron
const openToken = token => !SOLID_TOKENS.includes(token);
const wallToken = token => token === '#' || token === '@';
const safeToken = token => token === 'A' || token === 'S';

export function touchesSafeArea(x, z, r = 0) {
    const d = Math.max(0, r);
    return safeToken(mapCellAt(x, z).token)
        || safeToken(mapCellAt(x - d, z - d).token)
        || safeToken(mapCellAt(x + d, z - d).token)
        || safeToken(mapCellAt(x - d, z + d).token)
        || safeToken(mapCellAt(x + d, z + d).token);
}

export function stage5Walk(x, z, r = 0) {
    const d = Math.max(0, r);
    return openToken(mapCellAt(x - d, z - d).token)
        && openToken(mapCellAt(x + d, z - d).token)
        && openToken(mapCellAt(x - d, z + d).token)
        && openToken(mapCellAt(x + d, z + d).token);
}

export function trainWalk(x, z, r = 0) {
    return x >= TRAIN_X0 + r && x <= TRAIN_X1 - r && z >= TRAIN_Z0 + r && z <= TRAIN_Z1 - r;
}
// Deck kereta hanya walkable selama perjalanan; di stasiun badan kereta solid.
export const stage5TrainWalk = trainWalk;

function cornerCells(x, z, r) {
    const d = Math.max(0, r);
    return [mapCellAt(x - d, z - d), mapCellAt(x + d, z - d),
        mapCellAt(x - d, z + d), mapCellAt(x + d, z + d)];
}

// Player tidak boleh melangkah ke track musuh maupun celah antar-rel: itu
// jalur kereta yang bergerak. Robot gelombang justru memakainya.
const PLAYER_ROW0 = 5;
export function playerStationWalk(x, z, r = 0) {
    return cornerCells(x, z, r).every(m => m.r >= PLAYER_ROW0 && openToken(m.token));
}

// SA/S hanya melarang TITIK SPAWN. Robot yang sudah hidup boleh mengejar player
// masuk ke safe area; dinding dan daun pintu fisik tetap menentukan jalurnya.
export function robotStationWalk(x, z, r = 0) {
    return cornerCells(x, z, r).every(m => openToken(m.token));
}

// Spawn horde alarm tetap dikurung di hall, di bawah dinding berjendela.
export function hallSpawnWalk(x, z, r = 0) {
    return cornerCells(x, z, r).every(m => m.r >= HALL_ROW0
        && openToken(m.token) && !safeToken(m.token));
}

function addBlocker(x, z, hx, hz, top = 16, standable = false) {
    const b = { x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(hx, hz), top, standable };
    blockers.push(b); return b;
}

function blockedAt(x, z, rad = 3.5) {
    for (const b of blockers)
        if (Math.abs(x - b.x) <= b.hx + rad && Math.abs(z - b.z) <= b.hz + rad) return true;
    return false;
}

function resolveStationDoors(pos, radius) {
    for (const d of stationDoors) {
        if (d.open >= 0.74) continue;
        resolveBlockers(pos, radius, 0, [d.blocker]);
    }
}

export function resolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
    resolveStationDoors(pos, radius);
}

export function stage5GroundHeight(x, z, feetY) {
    return blockersGroundHeight(x, z, feetY, blockers);
}

export const platformDoor = () => stationDoors.find(d => d.kind === 'platform');
export const safeDoor = () => stationDoors.find(d => d.kind === 'safe');

export function updateStationSpawnMachine(dt, active, hit = 0) {
    if (stationSpawnMachine?.group?.visible)
        updateSpawnMachine(stationSpawnMachine, dt, active, hit);
}

// MESIN HANCUR MENYISAKAN BANGKAI GOSONG (2026-08-09, permintaan user): rangkanya
// TETAP di layar dengan part yang terlepas, jadi collider-nya juga tetap terpasang
// — aturannya "yang terlihat itulah yang menghalangi", jadi tidak ada lagi
// blocking tak terlihat maupun bangkai yang bisa ditembus. Nav TIDAK di-bake ulang
// (invarian proyek); petaknya memang tak pernah bisa dilalui sejak awal.
export function killStationSpawnMachine() {
    if (stationSpawnMachine) wreckSpawnMachine(stationSpawnMachine);
}

export const stationMachineBlocked = () =>
    !!machineBlocker && blockers.includes(machineBlocker);

// `platformOpen` datang dari sub-scene stasiun: pintu peron adalah satu-satunya
// pintu yang tidak otomatis — ia terkunci sampai C1 berhasil di-hack.
export function updateStationDoors(dt, platformOpen, safeOpen = false) {
    const platform = platformDoor();
    for (const d of stationDoors) {
        if (d === platform) continue;
        d.target = d.kind === 'safe' && safeOpen ? 1
            : (Math.hypot(camera.position.x - d.blocker.x,
                camera.position.z - d.blocker.z) < CELL * 2.25 ? 1 : 0);
    }
    if (platform) {
        platform.target = platformOpen ? 1 : 0;
        platform.canOpen = !!platformOpen;
    }
    for (const d of stationDoors) {
        // MENDARAT PERSIS di target. Bentuk lama (`dir` yang tak pernah nol)
        // membuat pintu yang sudah terbuka penuh bergetar 0.965<->1 tiap frame:
        // panelnya bergidik dan `open` tak pernah menetap.
        const prev = d.open, step = dt / 0.48;
        d.open = d.open < d.target ? Math.min(d.target, d.open + step)
            : Math.max(d.target, d.open - step);
        doorMotionSFX(d, prev, d.blocker.x, d.blocker.z);
        const e = d.open * d.open * (3 - 2 * d.open);
        setSplitDoorOpen(d.rig, e);
        setDoorSideLightState(d.lamps, d.canOpen);
    }
}

function segHitsRect(x0, z0, x1, z1, b) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / 5));
    for (let i = 0; i <= steps; i++) {
        const k = i / steps, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        if (Math.abs(x - b.x) <= b.hx && Math.abs(z - b.z) <= b.hz) return true;
    }
    return false;
}

export function stage5SegHitsWall(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / (CELL * 0.3)));
    for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        // Dinding berjendela tetap menghentikan peluru: kacanya hanya visual.
        if (wallToken(mapCellAt(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k).token)) return true;
    }
    return false;
}

export function stationDoorBlocks(x0, z0, x1, z1) {
    return stationDoors.some(d => d.open < 0.74 && segHitsRect(x0, z0, x1, z1, d.blocker));
}

// --- Kereta musuh di jalur sebelah ----------------------------------------
// SATU konsist penyerbu statis-prealokasi: SEPULUH peti baja tertutup + satu
// lokomotif perisai (bentuknya di props.js). Dua peran: (1) satu lintasan
// atmosfer di stasiun, (2) SELURUH perlawanan perjalanan — ia menyusul lalu
// MENDAHULUI kereta player sampai gerbong 0 (paling belakang) sejajar dengan
// gerbong player, membuka ramp SATU PER SATU, dan tiap gerbong yang robotnya
// habis MELEDAK + TERLEPAS + TERTINGGAL sementara sisanya mundur satu gerbong.
export const ET_CARGO_CARS = 10;                // permintaan user 2026-08-08
export const ET_CARS = ET_CARGO_CARS + 1;       // + satu lokomotif perisai
export const ET_LEN = 84, ET_STEP = 88, ET_HALF = TRAIN_HALF_WIDTH;
const ET_SPAN = ET_CARGO_CARS * ET_STEP + ET_LEN;
export const ET_ENTER_X = MAP_X0 - ET_SPAN - ET_LEN;
export const ET_EXIT_X = MAP_X0 + MAP_COLS * CELL + ET_SPAN;
export const etCfg = () => CFG.campaign.stage5.enemyTrain;
export { ET_RAMP_OPEN, ET_CAR_SILL, ET_CAR_HEIGHT };

// Ofset gerbong ke-i dari titik acuan konsist. Gerbong 0 = paling BELAKANG
// (yang pertama dilawan), lokomotif di indeks ET_CARGO_CARS paling depan.
export const enemyCarOffsetX = i => i * ET_STEP;

// Seluruh gerbong kembali utuh: terpasang di ofsetnya, ramp tertutup, lampu mati.
export function resetEnemyCars() {
    if (!enemyTrain) return;
    for (let i = 0; i < enemyTrain.cars.length; i++) {
        enemyTrain.cars[i].visible = true;
        enemyTrain.cars[i].position.x = enemyCarOffsetX(i);
    }
    for (const r of enemyTrain.ramps) r.rotation.x = 0;
    for (const s of enemyTrain.strobes) s.visible = false;
}

// `k` 0..1 = progres ramp gerbong ke-i; 1 = terbuka penuh (ET_RAMP_OPEN rad).
export function setEnemyRamp(i, k) {
    const r = enemyTrain?.ramps?.[i];
    if (r) r.rotation.x = Math.max(0, Math.min(1, k)) * ET_RAMP_OPEN;
}

export function setEnemyStrobe(i, on) {
    const s = enemyTrain?.strobes?.[i];
    if (s) s.visible = !!on;
}

// Bangkai gerbong yang sudah terlepas: digeser ke belakang relatif konsist.
export function setEnemyCarDrift(i, dx) {
    const c = enemyTrain?.cars?.[i];
    if (c) c.position.x = enemyCarOffsetX(i) + dx;
}

export function setEnemyCarVisible(i, on) {
    const c = enemyTrain?.cars?.[i];
    if (c) c.visible = !!on;
}

export function parkEnemyTrain() {
    if (!enemyTrain) return;
    enemyTrain.group.visible = false;
    enemyTrain.group.position.set(ET_ENTER_X, 0, ENEMY_TRACK_Z);
    enemyTrain.wheelPhase = 0;
    for (const w of enemyTrain.wheels) w.rotation.y = 0;
    resetEnemyCars();
}

// --- Pintu naik gerbong player --------------------------------------------
// Koordinat DUNIA diturunkan dari transform hidup grup kereta + grup gerbong,
// jadi cutscene keberangkatan tidak pernah menghitung ulang posisi kereta.
export const carCenterX = () =>
    (train ? train.group.position.x + train.cars[TRAIN_PLAYER_CAR].position.x : 0);
export const locoCenterX = () =>
    (train ? train.group.position.x + train.cars[TRAIN_LOCO_CAR].position.x : 0);
export const boardDoorPos = () => ({
    x: carCenterX() + TRAIN_DOOR_X, z: TRAIN_CENTER_Z + TRAIN_DOOR_LEAF_Z,
});
export const setBoardDoorTarget = v => { if (boardDoor) boardDoor.target = v ? 1 : 0; };

// Integrator pintu: MENDARAT PERSIS di target (syarat pemicu SFX ambang) dan
// membunyikan klip pintu bersama lewat doorMotionSFX — sama seperti pintu
// stasiun, jadi tidak ada klip pintu yang dimainkan di luar doors.js.
export function updateBoardDoor(dt) {
    if (!boardDoor) return;
    const sec = Math.max(0.05, CFG.campaign.stage5.departure.doorMoveSec);
    const prev = boardDoor.open, step = dt / sec;
    boardDoor.open = boardDoor.open < boardDoor.target
        ? Math.min(boardDoor.target, boardDoor.open + step)
        : Math.max(boardDoor.target, boardDoor.open - step);
    const p = boardDoorPos();
    doorMotionSFX(boardDoor, prev, p.x, p.z);
    const e = boardDoor.open * boardDoor.open * (3 - 2 * boardDoor.open);
    setSplitDoorOpen(boardDoor.rig, e);
}

// Jepret tertutup TANPA SFX: dipakai reset stage dan tombol SKIP cutscene
// (layarnya sudah hitam, jadi klip pintu justru terdengar salah).
export function resetBoardDoor() {
    if (!boardDoor) return;
    boardDoor.open = 0; boardDoor.target = 0; setSplitDoorOpen(boardDoor.rig, 0);
}

export const boardDoorDebug = () => (boardDoor ? {
    open: boardDoor.open, target: boardDoor.target,
    ...boardDoorPos(), split: splitDoorDebug(boardDoor.rig),
} : null);

export function spinEnemyTrain(dt, speed) {
    if (!enemyTrain) return;
    enemyTrain.wheelPhase += dt * Math.max(0, speed) * 0.11;
    for (const w of enemyTrain.wheels) w.rotation.y = enemyTrain.wheelPhase;
}

// Konsist player kini HANYA gerbong + lokomotif, jadi keduanya selalu terlihat;
// yang berbeda di stasiun hanyalah pergeseran ke sel TC/TL denah CSV.
export function setStationTrainView(atStation) {
    if (!train) return;
    for (const c of train.group.children) c.visible = true;
    train.group.position.x = atStation ? STATION_TRAIN_DX : 0;
}

function buildWorld() {
    worldRoot = new THREE.Group(); scene.add(worldRoot);
    stationRoot = new THREE.Group(); worldRoot.add(stationRoot);
    const M = {
        ground: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        asphalt: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        tech: new THREE.MeshLambertMaterial({
            color: PAL.techDim, emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * 0.58,
        }),
        amber: new THREE.MeshLambertMaterial({
            color: PAL.amberDim, emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * 0.48,
        }),
        lamp: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
        glass: new THREE.MeshLambertMaterial({
            color: PAL.screenBg, transparent: true, opacity: 0.22,
        }),
    };
    const staticProps = [];
    const addStatic = (sx, sy, sz, x, y, z, mat = M.ground) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; staticProps.push(m); return m;
    };
    const addStaticGeo = (geo, x, y, z, mat, rx = 0, ry = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
        m.castShadow = true; m.receiveShadow = true; staticProps.push(m); return m;
    };

    // Lantai mengikuti footprint CSV: dua track di baris 1-9, peron baris
    // 10-16, hall baris 18-49. Dinding # / @ dibangun per-sel lalu dibatch.
    addStatic(MAP_COLS * CELL, 2, MAP_ROWS * CELL, OX, -1, OZ, M.ground);
    addStatic(MAP_COLS * CELL, 1, 9 * CELL, OX, -0.1, cellPos(1, 5).z, M.asphalt);
    addStatic(MAP_COLS * CELL, 0.8, 41 * CELL, OX, 0, cellPos(1, 30).z, M.panel);
    // SA tetap token gameplay, tetapi lantainya SAMA dengan hall lainnya.
    // Jangan tambahkan overlay warna: safe area harus terbaca dari perilaku,
    // bukan seperti zona bercahaya yang berbeda material.
    safeFloorOverlayCount = 0;
    for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) {
        const token = S5_MAP[r][c], p = cellPos(c + 1, r + 1);
        if (token === '#') {
            addStatic(CELL, WALL_H, CELL, p.x, WALL_H / 2, p.z, M.body);
            addBlocker(p.x, p.z, CELL / 2, CELL / 2, WALL_H);
        } else if (token === '@') {
            // Dinding berjendela: ambang + header solid, kaca sebagai mesh
            // transparan berdiri sendiri (meshBatch sengaja tidak mengelasnya).
            addStatic(CELL, 6, CELL, p.x, 3, p.z, M.body);
            addStatic(CELL, 5, CELL, p.x, WALL_H - 2.5, p.z, M.body);
            addStatic(2.2, 14, CELL, p.x - CELL / 2 + 1.1, 13, p.z, M.steel);
            addStatic(2.2, 14, CELL, p.x + CELL / 2 - 1.1, 13, p.z, M.steel);
            const glass = new THREE.Mesh(new THREE.BoxGeometry(CELL, 14, 1.4), M.glass);
            glass.position.set(p.x, 13, p.z); stationRoot.add(glass);
            windowPanes.push(glass);
            addBlocker(p.x, p.z, CELL / 2, CELL / 2, WALL_H);
        }
    }
    // Badan jalur = anak stationRoot (bukan journey scenery), gauge SAMA dengan
    // bogie kereta, menjorok ke DUA arah: APRON RUN-OUT timur, karena shot
    // keberangkatan mengunci kamera dan hanya keretanya yang maju sampai
    // `departureShiftUnits` (tanpa itu lokomotif terbang di atas kekosongan
    // persis saat ditonton); dan JALUR MASUK 100 M BARAT (2026-08-11, permintaan
    // user), karena rel yang cuma ada di timur membuat stasiun terbaca sebagai
    // ujung dunia. Tak ada buffer stop di barat — konsist musuh masuk dari sana.
    const RUNOUT = (CFG.campaign.stage5.departureShiftUnits || 330) + 120;
    const MAP_X1 = MAP_X0 + MAP_COLS * CELL;
    runoutX1 = MAP_X1 + RUNOUT; leadX0 = MAP_X0 - WEST_LEAD_METERS * CAMP_M;
    fenceDbg = buildTrackBed(M, addStatic, {
        leadX0, runoutX1, mapX0: MAP_X0, mapX1: MAP_X1, northEdgeZ: MAP_Z0,
        bandZ: cellPos(1, 5).z, bandD: 9 * CELL, gaugeHalf: TRAIN_GAUGE_HALF,
        tracks: [TRAIN_CENTER_Z, ENEMY_TRACK_Z] });
    // Garis aman peron dan gantry tetap, tidak pernah masuk pool bergerak.
    addStatic(MAP_COLS * CELL, 0.35, 2, OX, 0.65, cellPos(1, 10).z - CELL / 2 + 2, M.hazard);
    for (const c of [6, 15, 24]) {
        const p = cellPos(c, 15);
        addStatic(3, 29, 3, p.x, 14.5, p.z, M.steel);
        addStatic(3, 3, CELL * 7, p.x, 29, p.z - CELL * 2.5, M.steel);
    }
    const regFurniture = (which, kind, p, hx, hz, top) => {
        addBlocker(p.x, p.z, hx, hz, top);
        (which === 'platform' ? platformFurniture : depotFurniture)
            .push({ kind, x: p.x, z: p.z, hx, hz, top, solid: true });
    };
    buildStationFurniture(M, addStatic, addStaticGeo, regFurniture);
    staticBatch = addMergedStatic(stationRoot, staticProps);

    const gen = buildGenerator(M, stationRoot, GENERATOR_OBJECT, addBlocker);
    generatorScreen = gen.screen; generatorRotor = gen.rotor;
    landmarkVisual.generatorMeshes = gen.meshes; landmarkVisual.animatedParts++;
    const term = buildTerminal(M, stationRoot, TERMINAL_OBJECT, addBlocker);
    terminalScreen = term.screen; terminalCore = term.core;
    landmarkVisual.terminalMeshes = term.meshes; landmarkVisual.animatedParts++;
    stationSpawnMachine = buildSpawnMachineMesh(30, 20, 30);
    stationSpawnMachine.group.position.set(S5_SPAWN_MACHINE.x, 0, S5_SPAWN_MACHINE.z);
    // Hatch lokal +z diputar menghadap -x, ke arah pintu safe-area.
    stationSpawnMachine.group.rotation.y = -Math.PI / 2;
    stationRoot.add(stationSpawnMachine.group);
    machineBlocker = addBlocker(S5_SPAWN_MACHINE.x, S5_SPAWN_MACHINE.z, 16, 16, 25);
    for (const [kind, p, sx, sz] of [
        ['platform', PLATFORM_DOOR_POS, CELL * 1.92, 3.5],
        ['control', CONTROL_DOOR_POS, 3.5, CELL * 1.92],
        ['safe', SAFE_DOOR_POS, 3.5, CELL * 1.92],
    ]) stationDoors.push(buildStationDoor(M, stationRoot, kind, p.x, p.z, sx, sz));
    repairMarker = buildMarker(scene, S5_GENERATOR.x, S5_GENERATOR.z, PAL.amber);
    terminalMarker = buildMarker(scene, S5_TERMINAL.x, S5_TERMINAL.z, PAL.amber);
    boardMarker = buildMarker(scene, S5_BOARD.x, S5_BOARD.z, PAL.amber);

    train = buildMilitaryTrainMesh(TRAIN_BASE_X, TRAIN_CENTER_Z);
    scene.add(train.group);
    // PINTU NAIK GERBONG (2026-08-08): rig DUA DAUN 50:50 yang sama dengan
    // seluruh pintu campaign, ditempel pada grup gerbong player sehingga ia ikut
    // bergerak bersama badan kereta tanpa satu pun perhitungan posisi tambahan.
    // Ia sengaja BUKAN anggota `train.doors` — array itu tetap kosong (kontrak
    // "sekat kabin tidak pernah terbuka").
    boardDoor = {
        kind: 'board', open: 0, target: 0,
        // `headRail`: palang di atas bukaan ikut DAUNNYA (2026-08-09) — dinding
        // gerbong setinggi dada, jadi palang diam akan menembus kepala Gibran.
        rig: buildSplitDoor(train.cars[TRAIN_PLAYER_CAR], M.panel,
            TRAIN_DOOR_X, TRAIN_SIDE_WALL_H / 2, TRAIN_DOOR_LEAF_Z,
            TRAIN_DOOR_HALF * 2, TRAIN_SIDE_WALL_H, TRAIN_DOOR_T,
            { headRail: { mat: M.steel, h: 1.2, t: TRAIN_DOOR_T + 1.1, overhang: 2 } }),
    };
    // Konsist musuh menempel di worldRoot, BUKAN stationRoot: ia harus tetap
    // terlihat saat stasiun disembunyikan sepanjang perjalanan.
    enemyTrain = buildEnemyTrain(M, worldRoot, ET_CARGO_CARS, ET_LEN, ET_STEP, ET_HALF,
        ET_ENTER_X, ENEMY_TRACK_Z);
    journey = buildTrainJourneyScenery(TRAIN_BASE_X, TRAIN_CENTER_Z, JOURNEY_TRACK_DZ);
    scene.add(journey.group);
    // Jalan raya berjalan di sisi KANAN kereta player (+z); ia hidup mulai
    // gerbong ke-5 dan MERAPAT perlahan (kurva penyatuan ada di highway.js).
    highway = buildJourneyHighway(TRAIN_BASE_X, TRAIN_CENTER_Z);
    scene.add(highway.group);
    for (let i = 0; i < Math.max(2, ((CFG.campaign.stage5.highway || {}).maxActivePickups | 0) + 1); i++) {
        const p = buildEnemyPickupMesh(CAMP_M);
        scene.add(p.group); resetEnemyPickupVisual(p); highwayPickups.push(p);
    }
    // Semua scenery sengaja terlihat saat precompile awal; enter() akan reset/hide.

    // DEPOT BERDIRI DI TENGAH KOTA (2026-08-09, permintaan user): cincin kota
    // Stage 1-3, dengan dua penyesuaian WAJIB — induknya `stationRoot` (arena
    // perjalanan memakai koordinat yang sama, jadi kota yang menempel di scene
    // akan tetap berdiri di tengah rel sepanjang perjalanan) dan koridor rel
    // dikosongkan di SEMUA x (tanpa itu gedung tumbuh di atas jalur + apron
    // run-out di timur, persis tempat kereta berangkat). Jalannya nyaris rata
    // dengan lantai depot: depot ini di permukaan tanah, bukan Lantai 2.
    cityscape = buildCampaignCityscape(OX, OZ, MAP_COLS * CELL / 2, MAP_ROWS * CELL / 2, {
        parent: stationRoot, groundY: CITY_GROUND_Y,
        corridor: { z0: ENEMY_TRACK_Z - CITY_TRACK_CLEAR, z1: TRAIN_CENTER_Z + CITY_TRACK_CLEAR },
    });

    // Delapan lampu tetap untuk stage 5; tidak ada lampu runtime.
    const lampCells = [[3, 20], [11, 20], [20, 20], [28, 20], [8, 32], [17, 32], [27, 32], [15, 13]];
    for (const [c, r] of lampCells) {
        const { x, z } = cellPos(c, r);
        const L = new THREE.PointLight(PAL.amber, 0.48, 145);
        // Lampu tetap berada langsung di scene agar jumlah PointLight tidak berubah
        // ketika mesh stasiun disembunyikan sesudah kereta meninggalkan peron.
        L.position.set(x, 25, z); scene.add(L); registerStageLight('campaign-5', L);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), M.lamp);
        bulb.position.copy(L.position); stationRoot.add(bulb);
    }

    navGrid = makeNavGrid(MAP_X0, MAP_Z0, CELL, MAP_COLS, MAP_ROWS,
        (x, z) => stage5Walk(x, z, 4) && !blockedAt(x, z, 3.5));
}

const countToken = t => S5_MAP.reduce((n, row) => n + [...row].filter(c => c === t).length, 0);

export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;
export const stage5StaticBatchDbg = () => staticBatch;

// Marker rute berkedip pelan; hanya yang `visible` yang dihitung.
export function pulseMarkers() {
    const t = Date.now() * 0.004;
    for (const [m, p] of [[repairMarker, 0], [terminalMarker, 1.4], [boardMarker, 2.8]])
        if (m && m.visible) m.material.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t + p));
}

export function updateLandmarks(dt, repairDone, unlocked) {
    if (generatorRotor) generatorRotor.rotation.x += dt * (repairDone ? 2.1 : 0.16);
    if (terminalCore) terminalCore.rotation.y += dt * (unlocked ? 0.8 : 0.22);
}

export function litScreen(mesh, intensity) {
    mesh.material.color.setHex(PAL.tech);
    mesh.material.emissive.setHex(PAL.tech);
    mesh.material.emissiveIntensity = intensity;
}

// Seluruh visual stasiun/kereta kembali ke kondisi awal stage (dipanggil dari
// enter() facade sebelum sub-scene pertama masuk).
export function resetWorldVisual() {
    // Mesin hidup lagi di setiap entry stage. Collider-nya tak pernah dicabut
    // sejak bangkainya tetap terlihat, tapi penjaga ini dipertahankan supaya
    // entry ulang selalu berakhir pada satu keadaan yang sama.
    if (machineBlocker && !blockers.includes(machineBlocker)) blockers.push(machineBlocker);
    resetTrainVisual(train); resetJourneyScenery(journey); parkEnemyTrain();
    resetJourneyHighway(highway);
    for (const p of highwayPickups) resetEnemyPickupVisual(p);
    train.group.position.set(0, 0, 0); stationRoot.visible = true;
    setStationTrainView(true); resetBoardDoor();
    for (const d of stationDoors) {
        d.open = 0; d.target = 0; setSplitDoorOpen(d.rig, 0);
        d.canOpen = d.kind !== 'platform';
        setDoorSideLightState(d.lamps, d.canOpen);
    }
    repairMarker.visible = terminalMarker.visible = boardMarker.visible = false;
    generatorScreen.material.color.setHex(PAL.screenBg);
    generatorScreen.material.emissive.setHex(PAL.techDim); generatorScreen.material.emissiveIntensity = 0.25;
    terminalScreen.material.color.setHex(PAL.screenBg);
    terminalScreen.material.emissive.setHex(PAL.techDim); terminalScreen.material.emissiveIntensity = 0.25;
    if (generatorRotor) generatorRotor.rotation.x = 0;
    if (terminalCore) terminalCore.rotation.y = 0;
    if (stationSpawnMachine) {
        stationSpawnMachine.group.visible = true;
        resetSpawnMachine(stationSpawnMachine, false);
        stationSpawnMachine.hatchFrame.scale.setScalar(1);
    }
}

export const stage5WorldDebug = () => ({
    built,
    depot: { ...DEPOT },
    map: {
        rows: MAP_ROWS, cols: MAP_COLS, cell: CELL,
        walls: countToken('#'), windowCells: countToken('@'),
        trainCells: countToken('T') + countToken('I') + countToken('L'),
        trackCells: countToken('='), gapCells: countToken(','),
        entryCells: countToken('I'), locoCells: countToken('L'),
        safeCells: countToken('A') + countToken('S'),
        safeFloorOverlays: safeFloorOverlayCount, windowPanes: windowPanes.length,
        platformDoor: { ...PLATFORM_DOOR_POS }, controlDoor: { ...CONTROL_DOOR_POS },
        safeDoor: { ...SAFE_DOOR_POS },
        terminalObject: { ...TERMINAL_OBJECT }, generatorObject: { ...GENERATOR_OBJECT },
        tci: { ...S5_TCI }, playerTrackZ: TRAIN_CENTER_Z, enemyTrackZ: ENEMY_TRACK_Z,
        journeyEnemyZ: JOURNEY_ENEMY_Z, journeyTrackDz: JOURNEY_TRACK_DZ,
    },
    landmarks: { ...landmarkVisual },
    spawnMachine: stationSpawnMachine ? {
        x: S5_SPAWN_MACHINE.x, z: S5_SPAWN_MACHINE.z,
        spawns: S5_MACHINE_SPAWNS.map(p => ({ ...p })),
        visible: stationSpawnMachine.group.visible,
        blocking: stationMachineBlocked(),
        ...spawnMachineDebug(stationSpawnMachine),
    } : null,
    markers: {
        c1: terminalMarker ? { x: terminalMarker.position.x, z: terminalMarker.position.z,
            color: terminalMarker.material.color.getHex(), visible: terminalMarker.visible } : null,
        c2: repairMarker ? { x: repairMarker.position.x, z: repairMarker.position.z,
            color: repairMarker.material.color.getHex(), visible: repairMarker.visible } : null,
        board: boardMarker ? { x: boardMarker.position.x, z: boardMarker.position.z,
            color: boardMarker.material.color.getHex(), visible: boardMarker.visible } : null,
    },
    furniture: {
        depot: depotFurniture.map(p => ({ ...p })),
        platform: platformFurniture.map(p => ({ ...p })),
    },
    station: {
        visible: !!stationRoot?.visible,
        x: stationRoot?.position?.x || 0, z: stationRoot?.position?.z || 0,
        doors: stationDoors.map(d => ({ kind: d.kind, open: d.open, target: d.target,
            canOpen: d.canOpen, x: d.blocker.x, z: d.blocker.z,
            lamps: d.lamps.map(l => ({ x: l.position.x, y: l.position.y, z: l.position.z, color: l.material.color.getHex() })),
            split: splitDoorDebug(d.rig) })),
    },
    train: {
        x0: TRAIN_X0, x1: TRAIN_X1, z0: TRAIN_Z0, z1: TRAIN_Z1,
        widthMeters: TRAIN_HALF_WIDTH * 2 / CAMP_M,
        lengthMeters: TRAIN_CAR_LENGTH / CAMP_M,
        stationTcX: STATION_TC_X,
        // Geseran badan kereta saat ini (0 = koordinat arena perjalanan,
        // STATION_TRAIN_DX = terdok di peron, + geseran shot keberangkatan).
        groupX: train?.group?.position?.x || 0,
        cars: train?.cars?.length || 0, doors: train?.doors?.length || 0,
        stationVisibleCars: train?.cars?.filter(c => c.visible).length || 0,
        stationCarIndex: STATION_CAR_INDEX,
        // Bukaan naik + daun pintunya: dipakai smoke memastikan dinding sisi
        // peron benar-benar berlubang dan daunnya menutupi lubang itu.
        doorX: TRAIN_DOOR_X, doorHalf: TRAIN_DOOR_HALF, doorLeafZ: TRAIN_DOOR_LEAF_Z,
        boardDoor: boardDoorDebug(),
    },
    enemyTrain: {
        cars: enemyTrain?.cars?.length || 0,
        cargoCars: ET_CARGO_CARS,
        ramps: enemyTrain?.ramps?.length || 0,
        strobes: enemyTrain?.strobes?.length || 0,
        rampOpenRad: ET_RAMP_OPEN,
        // Ramp adalah SATU-SATUNYA yang menyembunyikan isi gerbong dari kamera
        // oblique; dinding dekat yang TETAP harus tetap serendah dada.
        sill: ET_CAR_SILL, height: ET_CAR_HEIGHT,
        widthMeters: ET_HALF * 2 / CAMP_M,
        meshes: enemyTrain ? meshCount(enemyTrain.group) : 0,
        step: ET_STEP, len: ET_LEN,
        enterX: ET_ENTER_X, exitX: ET_EXIT_X,
        z: enemyTrain?.group?.position?.z ?? 0,
    },
    runoutX1, leadX0, westLeadMeters: WEST_LEAD_METERS,
    // `blockersAtZ` dihitung DI SINI: pagar lahir sebelum perabot/pintu/mesin.
    fence: fenceDbg ? { ...fenceDbg,
        blockersAtZ: blockers.filter(b => Math.abs(b.z - fenceDbg.z) <= b.hz + 2).length } : null,
    city: cityscape ? {
        parented: cityscape.root === stationRoot, groundY: cityscape.groundY,
        buildings: cityscape.buildings, trees: cityscape.trees,
        corridorHits: cityscape.corridorHits, corridor: { ...cityscape.corridor },
    } : null,
    blockers: blockers.length,
    nav: !!navGrid,
    carCenters: train?.cars?.map(c => ({ x: c.position.x, z: c.position.z })) || [],
    supplies: SUPPLY_POINTS.map(p => ({ ...p })),
    crates: CRATE_POINTS.map(p => ({ ...p })),
    barrels: BARREL_POINTS.map(p => ({ ...p })),
});
