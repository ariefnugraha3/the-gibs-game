// Stage 5 — DUNIA: denah CSV, geometri stasiun, landmark C1/C2, perabot,
// pintu, kereta player/musuh, collision + nav. Modul ini TIDAK menyimpan state
// alur cerita; ketiga sub-scene (station/journey/arrival) memakainya lewat
// binding hidup ESM.

import { CFG } from '../../../../core/config.js';
import { scene, camera } from '../../../../core/renderer.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { resolveBlockers, blockersGroundHeight } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import {
    buildMilitaryTrainMesh, buildTrainJourneyScenery,
    TRAIN_CAR_LENGTH, TRAIN_CAR_STEP, TRAIN_CAR_COUNT, TRAIN_HALF_WIDTH,
    setTrainDoor, resetTrainVisual, resetJourneyScenery,
} from '../../../../entities/train.js';
import {
    meshCount, buildMarker, buildGenerator, buildTerminal,
    buildStationFurniture, buildStationDoor, buildEnemyTrain,
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
// Arena journey tetap di tengah peta seperti sebelumnya. DI STASIUN konsist
// digeser ke barat sehingga gerbong 3 (TC) + lokomotif (TL) jatuh persis pada
// sel TC/TL denah CSV; gerbong 0-2 disembunyikan sampai layar hitam departure.
export const STATION_CAR_INDEX = 3;
export const TRAIN_BASE_X = OX - 2 * TRAIN_CAR_STEP;
export const TRAIN_X0 = TRAIN_BASE_X - TRAIN_CAR_LENGTH / 2;
export const TRAIN_X1 = TRAIN_BASE_X + (TRAIN_CAR_COUNT - 1) * TRAIN_CAR_STEP + TRAIN_CAR_LENGTH / 2;
export const TRAIN_Z0 = TRAIN_CENTER_Z - TRAIN_HALF_WIDTH;
export const TRAIN_Z1 = TRAIN_CENTER_Z + TRAIN_HALF_WIDTH;
export const STATION_TC_X = cellPos(9.47, 1).x;          // pusat sel TC pada CSV
export const STATION_TRAIN_DX = STATION_TC_X - (TRAIN_BASE_X + STATION_CAR_INDEX * TRAIN_CAR_STEP);

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
export const S5_ENGINE = Object.freeze({ x: TRAIN_BASE_X + 4 * TRAIN_CAR_STEP + 17, z: TRAIN_CENTER_Z });

export const SUPPLY_POINTS = Object.freeze([
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...cellPos(3, 43) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...cellPos(10, 39) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...cellPos(20, 33) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...cellPos(13, 18) }),
    Object.freeze({ type: 'medkit', ...cellPos(4, 25) }),
    Object.freeze({ type: 'medkit', ...cellPos(21, 20) }),
]);
export const CRATE_POINTS = Object.freeze([
    Object.freeze({ area: 'depot', ...cellPos(11, 45) }),
    Object.freeze({ area: 'depot', ...cellPos(18, 37) }),
    Object.freeze({ area: 'cargo', x: TRAIN_BASE_X + TRAIN_CAR_STEP, z: TRAIN_CENTER_Z + 12 }),
    Object.freeze({ area: 'security', x: TRAIN_BASE_X + 2 * TRAIN_CAR_STEP, z: TRAIN_CENTER_Z + 13 }),
    Object.freeze({ area: 'locomotive', x: TRAIN_BASE_X + 4 * TRAIN_CAR_STEP - 37, z: TRAIN_CENTER_Z + 14 }),
]);

let built = false, worldRoot = null;
export let stationRoot = null, train = null, journey = null, navGrid = null;
let staticBatch = [];
export let generatorScreen = null, terminalScreen = null;
let generatorRotor = null, terminalCore = null;
let landmarkVisual = { generatorMeshes: 0, terminalMeshes: 0, animatedParts: 0 };
let safeFloorOverlayCount = 0;
const depotFurniture = [], platformFurniture = [];
export let repairMarker = null, terminalMarker = null, boardMarker = null;
const blockers = [], doorBlockers = [];
const stationDoors = [];
const windowPanes = [];
export let enemyTrain = null;

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

// Robot boleh menempati seluruh stasiun KECUALI safe area — gelombang kereta
// musuh memang harus melintasi track, celah antar-rel, lalu peron.
export function robotStationWalk(x, z, r = 0) {
    return cornerCells(x, z, r).every(m => openToken(m.token) && !safeToken(m.token));
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

function resolveTrainDoors(pos, radius) {
    if (!train) return;
    for (let i = 0; i < doorBlockers.length; i++) {
        if (train.doors[i].open >= 0.74) continue;
        resolveBlockers(pos, radius, 0, [doorBlockers[i]]);
    }
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
    resolveTrainDoors(pos, radius);
}

export function stage5GroundHeight(x, z, feetY) {
    return blockersGroundHeight(x, z, feetY, blockers);
}

export const platformDoor = () => stationDoors.find(d => d.kind === 'platform');

// `platformOpen` datang dari sub-scene stasiun: pintu peron adalah satu-satunya
// pintu yang tidak otomatis — ia terkunci sampai C1 berhasil di-hack.
export function updateStationDoors(dt, platformOpen) {
    const platform = platformDoor();
    for (const d of stationDoors) {
        if (d === platform) continue;
        d.target = Math.hypot(camera.position.x - d.blocker.x,
            camera.position.z - d.blocker.z) < CELL * 2.25 ? 1 : 0;
    }
    if (platform) platform.target = platformOpen ? 1 : 0;
    for (const d of stationDoors) {
        const dir = d.target > d.open ? 1 : -1;
        d.open = Math.max(0, Math.min(1, d.open + dir * dt / 0.48));
        const e = d.open * d.open * (3 - 2 * d.open);
        d.panel.position.y = (WALL_H - 2) / 2 - e * (WALL_H + 2);
        d.lamp.material.color.setHex(d.target ? PAL.tech : PAL.hazard);
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

// --- Kereta musuh di track sebelah (baris CSV 1-4) -------------------------
// Konsist statis-prealokasi: tiga gerbong angkut + satu lokomotif. Sejak
// 2026-08-07 (permintaan user) ia HANYA MELINTAS — tidak pernah berhenti,
// membuka pintu, atau menurunkan robot; pintu gesernya kini geometri statis.
export const ET_CARS = 4, ET_LEN = 92, ET_STEP = 100, ET_HALF = 25;
const ET_SPAN = (ET_CARS - 1) * ET_STEP;
export const ET_ENTER_X = MAP_X0 - ET_SPAN - ET_LEN * 1.5;
export const ET_EXIT_X = MAP_X0 + MAP_COLS * CELL + ET_LEN;
export const etCfg = () => CFG.campaign.stage5.enemyTrain;

export function parkEnemyTrain() {
    if (!enemyTrain) return;
    enemyTrain.group.visible = false;
    enemyTrain.group.position.x = ET_ENTER_X;
}

// Denah CSV hanya memuat satu TC + satu TL di peron, sedangkan journey tetap
// memakai konsist 5 gerbong. Gerbong sisanya disembunyikan selama di stasiun
// dan dibuka saat layar sudah hitam di startDeparture.
export function setStationTrainView(atStation) {
    if (!train) return;
    // Ambang dipasang di coupler gerbong 2/3 agar bulkhead + coupler yang
    // tersisa berperan sebagai dinding belakang gerbong TC di peron.
    const cut = TRAIN_BASE_X + (STATION_CAR_INDEX - 0.5) * TRAIN_CAR_STEP;
    for (const c of train.group.children) c.visible = !atStation || c.position.x >= cut;
    if (atStation) train.group.position.x = STATION_TRAIN_DX;
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
    // Kedua rel stasiun tetap menjadi anak stationRoot, bukan journey scenery.
    for (const base of [TRAIN_CENTER_Z, ENEMY_TRACK_Z])
        for (const z of [base - 20, base + 20])
            addStatic(MAP_COLS * CELL, 1.2, 2.2, OX, 0.1, z, M.steel);
    for (let c = 1; c <= MAP_COLS; c += 2) {
        const p = cellPos(c, 1);
        for (const base of [TRAIN_CENTER_Z, ENEMY_TRACK_Z])
            addStatic(CELL * 1.7, 0.8, 53, p.x, -0.25, base, M.ink);
    }
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
    for (const [kind, p, sx, sz] of [
        ['platform', PLATFORM_DOOR_POS, CELL * 1.92, 3.5],
        ['control', CONTROL_DOOR_POS, 3.5, CELL * 1.92],
        ['safe', SAFE_DOOR_POS, 3.5, CELL * 1.92],
    ]) stationDoors.push(buildStationDoor(M, stationRoot, kind, p.x, p.z, sx, sz));
    repairMarker = buildMarker(scene, S5_GENERATOR.x, S5_GENERATOR.z, PAL.amber);
    terminalMarker = buildMarker(scene, S5_TERMINAL.x, S5_TERMINAL.z, PAL.tech);
    boardMarker = buildMarker(scene, S5_BOARD.x, S5_BOARD.z, PAL.amber);

    train = buildMilitaryTrainMesh(TRAIN_BASE_X, TRAIN_CENTER_Z);
    scene.add(train.group);
    enemyTrain = buildEnemyTrain(M, stationRoot, ET_CARS, ET_LEN, ET_STEP, ET_HALF,
        ET_ENTER_X, ENEMY_TRACK_Z);
    journey = buildTrainJourneyScenery(TRAIN_BASE_X + 2 * TRAIN_CAR_STEP, TRAIN_CENTER_Z);
    scene.add(journey.group);
    // Semua scenery sengaja terlihat saat precompile awal; enter() akan reset/hide.

    for (let i = 0; i < train.doors.length; i++) {
        const x = TRAIN_BASE_X + i * TRAIN_CAR_STEP + TRAIN_CAR_LENGTH / 2 + 4;
        doorBlockers.push({ x, z: TRAIN_CENTER_Z, hx: 2.5, hz: TRAIN_HALF_WIDTH - 4,
            axx: 1, axz: 0, azx: 0, azz: 1,
            rad: TRAIN_HALF_WIDTH, top: 14, standable: false });
    }

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
        if (m && m.visible) { m.material.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t + p)); m.rotation.z += 0.008; }
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
    resetTrainVisual(train); resetJourneyScenery(journey); parkEnemyTrain();
    train.group.position.set(0, 0, 0); stationRoot.visible = true;
    setStationTrainView(true);
    for (let i = 0; i < train.doors.length; i++) setTrainDoor(train, i, false);
    for (const d of stationDoors) {
        d.open = 0; d.target = 0; d.panel.position.y = (WALL_H - 2) / 2;
        d.lamp.material.color.setHex(PAL.hazard);
    }
    repairMarker.visible = terminalMarker.visible = boardMarker.visible = false;
    generatorScreen.material.color.setHex(PAL.screenBg);
    generatorScreen.material.emissive.setHex(PAL.techDim); generatorScreen.material.emissiveIntensity = 0.25;
    terminalScreen.material.color.setHex(PAL.screenBg);
    terminalScreen.material.emissive.setHex(PAL.techDim); terminalScreen.material.emissiveIntensity = 0.25;
    if (generatorRotor) generatorRotor.rotation.x = 0;
    if (terminalCore) terminalCore.rotation.y = 0;
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
    },
    landmarks: { ...landmarkVisual },
    furniture: {
        depot: depotFurniture.map(p => ({ ...p })),
        platform: platformFurniture.map(p => ({ ...p })),
    },
    station: {
        visible: !!stationRoot?.visible,
        x: stationRoot?.position?.x || 0, z: stationRoot?.position?.z || 0,
        doors: stationDoors.map(d => ({ kind: d.kind, open: d.open, target: d.target })),
    },
    train: {
        x0: TRAIN_X0, x1: TRAIN_X1, z0: TRAIN_Z0, z1: TRAIN_Z1,
        cars: train?.cars?.length || 0, doors: train?.doors?.length || 0,
        stationVisibleCars: train?.cars?.filter(c => c.visible).length || 0,
        stationCarIndex: STATION_CAR_INDEX,
    },
    enemyTrain: {
        cars: enemyTrain?.cars?.length || 0,
        doorPanels: enemyTrain?.doorPanels?.length || 0,
        meshes: enemyTrain ? meshCount(enemyTrain.group) : 0,
        enterX: ET_ENTER_X, exitX: ET_EXIT_X,
        z: enemyTrain?.group?.position?.z ?? 0,
    },
    blockers: blockers.length,
    doorBlockers: doorBlockers.length,
    nav: !!navGrid,
    carCenters: train?.cars?.map(c => ({ x: c.position.x, z: c.position.z })) || [],
    supplies: SUPPLY_POINTS.map(p => ({ ...p })),
    crates: CRATE_POINTS.map(p => ({ ...p })),
});
