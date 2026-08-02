// Campaign Stage 5 — THE LAST TRAIN TO BANDUNG.
// CSV depot -> hack C1 -> buka pintu peron -> repair generator C2 -> board -> fight through five cars
// while a fixed scenery pool scrolls past -> arrive at Bandung. No boss.

import { CFG } from '../../../core/config.js';
import { dialogueMap } from '../../../core/dialogue.js';
import {
    player, robots, keys, _v3, setCinematicActive,
} from '../../../core/state.js';
import {
    scene, camera, setCineFocus, CAM_OFF_DEFAULT, addCamShake,
} from '../../../core/renderer.js';
import {
    showStageMsg, showPickup, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../core/dom.js';
import { updateUI } from '../../../core/hud.js';
import { releaseInputs } from '../../../core/input.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { setAvatarRadioPose } from '../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../entities/robots.js';
import {
    spawnCampaignRobot, campaignAwardKill, campaignRobotAI, campaignClampRobot,
    countStageRobots, spawnAlarmHorde,
} from '../utility/common.js';
import { beginRepairMinigame, REPAIR_PARTS } from '../utility/repairMinigame.js';
import { beginHackMinigame } from '../utility/hackMinigame.js';
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { stage1Scene } from './stage1.js';
import { stage6Scene } from './stage6.js';
import { applyLightPreset, registerStageLight } from '../../../world/lighting.js';
import { exitCityEnv } from '../utility/cityscape.js';
import { PAL, EMISSIVE_MAX } from '../../../world/palette.js';
import { addMergedStatic } from '../../../utils/meshBatch.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { rand } from '../../../utils/math.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../entities/drops.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../entities/crates.js';
import {
    buildMilitaryTrainMesh, buildTrainJourneyScenery,
    TRAIN_CAR_LENGTH, TRAIN_CAR_STEP, TRAIN_CAR_COUNT, TRAIN_HALF_WIDTH,
    setTrainDoor, resetTrainVisual, updateTrainVisual,
    resetJourneyScenery, updateJourneyScenery, trainJourneyDebug as trainDebug,
} from '../../../entities/train.js';
import { playLoopSFX, stopLoopSFX, sfxTankMove, playSFX, sfxPurchase } from '../../../utils/sfx.js';

// Denah resmi user `stages(Stage5).csv`, 30 kolom × 50 baris.
// Token satu-karakter internal: A=SA, 1=C1, 2=C2, .=kosong.
// Jangan mengubah layout tanpa memperbarui CSV-contract smoke test.
export const S5_MAP = Object.freeze([
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    '#####.........................',
    '#2222.........................',
    '#..H..........................',
    '#.............................',
    '#.............................',
    '#.............................',
    '#.............................',
    '##########################--##',
    '#AAAAAAA.....................#',
    '#AAAAAAA.....................#',
    '#AAAAAAA.....................#',
    '#AAAAAAA.....................#',
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
    '#AAAA#.......................#',
    '#AAAA#.................#######',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................-....1#',
    '#AAAA#.................-...H1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#ASSA#.................#....1#',
    '##############################',
]);
export const S5_LEGEND = Object.freeze({ '#': 'wall', S: 'start', '-': 'door', 1: 'hack', 2: 'generator', T: 'train', A: 'safe' });

// Intro rooftop memakai x≈150000 dan dibuang setelah cutscene; Stage 5 tetap
// dipisah satu blok dunia penuh agar jalur Continue/cheat tidak pernah melihatnya.
const OX = 180000, OZ = 0;
const MAP_COLS = 30, MAP_ROWS = 50, CELL = 16.5, WALL_H = 25;
const MAP_X0 = OX - MAP_COLS * CELL / 2, MAP_Z0 = OZ - MAP_ROWS * CELL / 2;
const DEPOT = { x0: MAP_X0, x1: MAP_X0 + MAP_COLS * CELL, z0: MAP_Z0, z1: MAP_Z0 + MAP_ROWS * CELL };
const cellPos = (c, r) => ({ x: MAP_X0 + (c - 0.5) * CELL, z: MAP_Z0 + (r - 0.5) * CELL });
const TRAIN_CENTER_Z = cellPos(15.5, 4).z;
const TRAIN_BASE_X = OX - 2 * TRAIN_CAR_STEP;
const TRAIN_X0 = TRAIN_BASE_X - TRAIN_CAR_LENGTH / 2;
const TRAIN_X1 = TRAIN_BASE_X + (TRAIN_CAR_COUNT - 1) * TRAIN_CAR_STEP + TRAIN_CAR_LENGTH / 2;
const TRAIN_Z0 = TRAIN_CENTER_Z - TRAIN_HALF_WIDTH;
const TRAIN_Z1 = TRAIN_CENTER_Z + TRAIN_HALF_WIDTH;

const GENERATOR_OBJECT = cellPos(3.5, 9);
const TERMINAL_OBJECT = cellPos(29, 45.5);
const PLATFORM_DOOR_POS = cellPos(27.5, 15);
const CONTROL_DOOR_POS = cellPos(24, 45.5);
export const S5_START = Object.freeze(cellPos(3.5, 49));
export const S5_GENERATOR = Object.freeze(cellPos(4, 10));       // H dekat C2
export const S5_TERMINAL = Object.freeze(cellPos(28, 46));       // H dekat C1
export const S5_BOARD = Object.freeze({ x: TRAIN_BASE_X - 24, z: TRAIN_Z1 - 5 });
export const S5_ENGINE = Object.freeze({ x: TRAIN_BASE_X + 4 * TRAIN_CAR_STEP + 17, z: TRAIN_CENTER_Z });

const SUPPLY_POINTS = Object.freeze([
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...cellPos(3, 43) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...cellPos(10, 39) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...cellPos(20, 33) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...cellPos(13, 18) }),
    Object.freeze({ type: 'medkit', ...cellPos(4, 25) }),
    Object.freeze({ type: 'medkit', ...cellPos(21, 20) }),
]);
const CRATE_POINTS = Object.freeze([
    Object.freeze({ area: 'depot', ...cellPos(11, 45) }),
    Object.freeze({ area: 'depot', ...cellPos(18, 37) }),
    Object.freeze({ area: 'cargo', x: TRAIN_BASE_X + TRAIN_CAR_STEP, z: TRAIN_CENTER_Z + 12 }),
    Object.freeze({ area: 'security', x: TRAIN_BASE_X + 2 * TRAIN_CAR_STEP, z: TRAIN_CENTER_Z + 13 }),
    Object.freeze({ area: 'locomotive', x: TRAIN_BASE_X + 4 * TRAIN_CAR_STEP - 37, z: TRAIN_CENTER_Z + 14 }),
]);

// Dialog final disimpan sebagai data agar urutan + typewriter dapat dipatok smoke.
export const STAGE5_DIALOGUE = dialogueMap('campaign.stage5.lines');

let built = false, worldRoot = null, stationRoot = null, train = null, journey = null, navGrid = null;
let staticBatch = [], generatorScreen = null, terminalScreen = null;
let generatorRotor = null, terminalCore = null;
let landmarkVisual = { generatorMeshes: 0, terminalMeshes: 0, animatedParts: 0 };
let safeFloorOverlayCount = 0;
const depotFurniture = [], platformFurniture = [];
let repairMarker = null, terminalMarker = null, boardMarker = null;
const blockers = [], doorBlockers = [];
const stationDoors = [];

let phase = 'opening', rideT = 0, finalT = 0, trainSpeed = 0, trainLoop = null;
let repairInstalled = 0, repairArmed = true, hackArmed = true, hackCd = 0;
let complete = false, discovered = false, platformUnlocked = false, depotAwake = false, finalWaveIndex = 0;
let departureShift = 0;
let encounterSpawned = { cargo: false, security: false, roof: false };
let cine = null;
const cineCam = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };

let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function mapCellAt(x, z) {
    const c = Math.floor((x - MAP_X0) / CELL), r = Math.floor((z - MAP_Z0) / CELL);
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return { c, r, token: '#' };
    return { c, r, token: S5_MAP[r][c] };
}

const openToken = token => token !== '#';
const safeToken = token => token === 'A' || token === 'S';

function touchesSafeArea(x, z, r = 0) {
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

function trainWalk(x, z, r = 0) {
    return x >= TRAIN_X0 + r && x <= TRAIN_X1 - r && z >= TRAIN_Z0 + r && z <= TRAIN_Z1 - r;
}

function playerWalk(x, z, r = 0) {
    const moving = ['departure', 'cargo', 'security', 'roof', 'finalDefense', 'arrival', 'complete'].includes(phase);
    return moving ? trainWalk(x, z, r) : stage5Walk(x, z, r);
}

function stationCombatWalk(x, z, r = 0) {
    const d = Math.max(0, r);
    const cells = [mapCellAt(x - d, z - d), mapCellAt(x + d, z - d),
        mapCellAt(x - d, z + d), mapCellAt(x + d, z + d)];
    return cells.every(m => m.r >= 15 && !['#', 'A', 'S', 'T'].includes(m.token));
}

function robotWalk(x, z, r = 0) {
    const moving = ['departure', 'cargo', 'security', 'roof', 'finalDefense', 'arrival', 'complete'].includes(phase);
    return moving ? trainWalk(x, z, r) : stationCombatWalk(x, z, r);
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

function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m); return m;
}

function cylinder(parent, mat, rt, rb, h, segments, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = shadow; m.receiveShadow = shadow; parent.add(m); return m;
}

function torus(parent, mat, radius, tube, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 18), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function meshCount(root) {
    let n = 0, stack = [root];
    while (stack.length) {
        const o = stack.pop();
        if (o?.geometry) n++;
        if (o?.children) for (const c of o.children) stack.push(c);
    }
    return n;
}

function marker(x, z, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.RingGeometry(7, 9, 24), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.15, z); m.visible = false;
    scene.add(m); return m;
}

function buildGenerator(M) {
    const g = new THREE.Group(); g.position.set(GENERATOR_OBJECT.x, 0, GENERATOR_OBJECT.z);
    // C2 adalah turbogenerator modular 2045: drum terbuka, enam kumparan,
    // cincin servis, konverter daya dan cage proteksi. Siluetnya sengaja lebar
    // mengikuti empat sel C2 pada CSV agar terbaca sebagai landmark dari kamera.
    box(g, M.ink, CELL * 3.65, 2.4, CELL * 0.98, 0, 1.2, 0);
    box(g, M.body, CELL * 3.45, 2.2, CELL * 0.82, 0, 2.5, 0);
    for (const x of [-CELL * 1.55, CELL * 1.55]) {
        box(g, M.steel, 3.2, 12, CELL * 0.72, x, 7, 0);
        box(g, M.hazard, 3.7, 1.1, CELL * 0.78, x, 12.3, 0);
    }

    generatorRotor = new THREE.Group(); generatorRotor.position.y = 11; g.add(generatorRotor);
    cylinder(generatorRotor, M.tech, 5.4, 5.4, CELL * 2.65, 16, 0, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const coil = box(generatorRotor, i % 2 ? M.white : M.hazard,
            CELL * 2.72, 1.55, 2.15, 0, Math.cos(a) * 7.3, Math.sin(a) * 7.3);
        coil.rotation.x = a;
    }
    for (const x of [-CELL, 0, CELL])
        torus(g, M.steel, 9.3, 1.25, x, 11, 0, 0, Math.PI / 2, 0);
    cylinder(g, M.body, 9.1, 9.1, 5, 14, -CELL * 1.4, 11, 0, 0, 0, Math.PI / 2);
    cylinder(g, M.body, 9.1, 9.1, 5, 14, CELL * 1.4, 11, 0, 0, 0, Math.PI / 2);
    for (const x of [-CELL * 1.18, CELL * 1.18]) {
        box(g, M.ink, 12, 10, 10, x, 7.2, -9);
        box(g, M.panel, 9.5, 7.5, 8.5, x, 7.4, -9);
        for (const vx of [-3, 0, 3]) box(g, M.steel, 1.1, 5, 0.7, x + vx, 7.5, -13.4, false);
    }
    // Exhaust/heat exchanger kembar dan rangka servis di atas mesin.
    for (const x of [-CELL * 0.72, CELL * 0.72]) {
        cylinder(g, M.ink, 3.1, 3.6, 11, 10, x, 20, -5);
        cylinder(g, M.steel, 3.8, 3.8, 1.2, 10, x, 25.4, -5);
    }
    for (const x of [-CELL * 1.62, CELL * 1.62]) box(g, M.steel, 1.5, 24, 1.5, x, 12, 8);
    box(g, M.steel, CELL * 3.3, 1.5, 1.5, 0, 23.5, 8);
    for (const x of [-CELL, 0, CELL]) box(g, M.hazard, 1.4, 0.9, CELL * 0.75, x, 3.8, 0);

    // Console servis menghadap titik H di sel selatan.
    box(g, M.ink, 17, 7.5, 6.5, 5, 4.4, CELL * 0.48);
    const consoleTop = box(g, M.body, 18, 2.1, 8, 5, 8.2, CELL * 0.47);
    consoleTop.rotation.x = -0.13;
    const screenMat = new THREE.MeshLambertMaterial({
        color: PAL.screenBg, emissive: PAL.techDim, emissiveIntensity: 0.25,
    });
    generatorScreen = box(g, screenMat, 10, 4.8, 0.65, 5, 9.2, CELL * 0.72, false);
    generatorScreen.rotation.x = -0.13;
    for (const x of [-4, 0, 4]) box(g, M.amber, 1.1, 1.1, 0.7, x + 5, 6.2, CELL * 0.73, false);
    // Kabel daya berat masuk ke lantai; tidak menambah blocker terpisah.
    for (const x of [-12, 0, 12]) box(g, M.ink, 3.2, 0.8, CELL * 0.7, x, 0.7, CELL * 0.66);

    stationRoot.add(g);
    landmarkVisual.generatorMeshes = meshCount(g);
    landmarkVisual.animatedParts++;
    addBlocker(GENERATOR_OBJECT.x, GENERATOR_OBJECT.z, CELL * 1.78, CELL * 0.5, 26);
}

function buildTerminal(M) {
    const g = new THREE.Group(); g.position.set(TERMINAL_OBJECT.x, 0, TERMINAL_OBJECT.z);
    // C1 = access-core station 2045, bukan deretan PC kantor: tujuh server bay,
    // data spine, cooling fins, conduit atas dan console berbentuk command altar.
    box(g, M.ink, 10, 18, CELL * 7.7, 1.5, 9, 0);
    for (let i = -3; i <= 3; i++) {
        const z = i * CELL;
        box(g, M.ink, 14, 17, 14, 0, 8.5, z);
        box(g, M.body, 11.8, 14.5, 11.8, -0.4, 8.2, z);
        box(g, M.panel, 0.85, 11.5, 9.4, -6.35, 8.2, z);
        box(g, i === 0 ? M.amber : M.tech, 0.65, 7.8, 1.15, -6.85, 9, z, false);
        for (const vz of [-3.2, 0, 3.2]) box(g, M.ink, 0.7, 1.1, 2.1, -6.9, 4.8, z + vz, false);
        // Sirip heat-sink membuat setiap bay punya profil bergerigi futuristis.
        for (const fy of [4, 8, 12]) {
            const fin = box(g, M.steel, 3.8, 0.7, 11.5, 5.3, fy, z);
            fin.rotation.z = -0.08;
        }
        box(g, M.hazard, 1.1, 2.2, 12.5, 5.9, 15.6, z);
    }
    box(g, M.steel, 16, 2, CELL * 7.85, 0, 18.8, 0);
    for (const z of [-CELL * 3.65, CELL * 3.65]) {
        box(g, M.steel, 2, 25, 2, -8, 12.5, z);
        const brace = box(g, M.steel, 2, 2, 22, -8, 24, z > 0 ? z - 10 : z + 10);
        brace.rotation.x = z > 0 ? 0.22 : -0.22;
    }

    terminalCore = new THREE.Group(); terminalCore.position.set(-8.2, 12, CELL * 0.5); g.add(terminalCore);
    cylinder(terminalCore, M.tech, 3.3, 3.3, 13, 12, 0, 0, 0, 0, 0, 0, false);
    for (const y of [-5, 0, 5]) torus(terminalCore, M.amber, 4.6, 0.65, 0, y, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        box(terminalCore, M.steel, 1, 11, 1, Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5);
    }

    // Console utama menonjol ke H, dilindungi dua wing miring.
    box(g, M.ink, 14, 6.5, 15, -8.8, 3.5, CELL * 0.5);
    const leftWing = box(g, M.body, 8, 2.2, 15, -10.5, 7, CELL * 0.5 - 10);
    const rightWing = box(g, M.body, 8, 2.2, 15, -10.5, 7, CELL * 0.5 + 10);
    leftWing.rotation.x = 0.1; rightWing.rotation.x = -0.1;
    const screenMat = new THREE.MeshLambertMaterial({
        color: PAL.screenBg, emissive: PAL.techDim, emissiveIntensity: 0.25,
    });
    terminalScreen = box(g, screenMat, 0.75, 6.5, 11, -13, 8.2, CELL * 0.5, false);
    terminalScreen.rotation.z = 0.12;
    for (const z of [-5, 0, 5]) box(g, M.amber, 0.8, 0.9, 1.7, -13.45, 4.4, CELL * 0.5 + z, false);

    stationRoot.add(g);
    landmarkVisual.terminalMeshes = meshCount(g);
    landmarkVisual.animatedParts++;
    addBlocker(TERMINAL_OBJECT.x - 3.5, TERMINAL_OBJECT.z, 12, CELL * 3.9, 19);
}

function registerFurniture(list, kind, p, hx, hz, top) {
    addBlocker(p.x, p.z, hx, hz, top);
    list.push({ kind, x: p.x, z: p.z, hx, hz, top, solid: true });
}

function buildPalletRack(M, add, c, r, span = 4) {
    const p = cellPos(c, r), sx = span * CELL, sz = 13;
    for (const x of [-sx / 2 + 2, sx / 2 - 2]) for (const z of [-5, 5])
        add(2, 22, 2, p.x + x, 11, p.z + z, M.steel);
    for (const y of [4, 11, 18]) {
        add(sx, 1.5, 2, p.x, y, p.z - 5, M.hazard);
        add(sx, 1.5, 2, p.x, y, p.z + 5, M.hazard);
        add(sx - 3, 1.2, sz, p.x, y, p.z, M.steel);
    }
    const bays = Math.max(3, span + 1);
    for (let i = 0; i < bays; i++) {
        const x = p.x - sx * 0.4 + i * (sx * 0.8 / Math.max(1, bays - 1));
        const mat = i % 3 === 0 ? M.wood : (i % 3 === 1 ? M.body : M.panel);
        add(8, 5.5 + (i % 2) * 2, 8, x, 7.2, p.z, mat);
        if (i % 2 === 0) add(7.5, 5, 7.5, x, 14.1, p.z, M.wood);
    }
    registerFurniture(depotFurniture, 'pallet-rack', p, sx / 2, sz / 2, 22);
}

function buildCargoContainer(M, add, c, r, span = 3) {
    const p = cellPos(c, r), sx = span * CELL, sz = 18;
    add(sx, 14, sz, p.x, 7, p.z, M.body);
    add(sx - 3, 11.5, sz + 0.8, p.x, 7, p.z, M.panel);
    for (let x = -sx / 2 + 4; x <= sx / 2 - 3; x += 7)
        add(1.1, 11, sz + 1.2, p.x + x, 7, p.z, M.steel);
    for (const x of [-sx / 2 + 2, sx / 2 - 2]) {
        add(2.4, 14.8, 2.2, p.x + x, 7.4, p.z - sz / 2, M.hazard);
        add(2.4, 14.8, 2.2, p.x + x, 7.4, p.z + sz / 2, M.hazard);
    }
    add(sx - 5, 0.8, 2, p.x, 14.5, p.z, M.white);
    registerFurniture(depotFurniture, 'cargo-container', p, sx / 2, sz / 2, 15);
}

function buildWorkshop(M, add, c, r) {
    const p = cellPos(c, r), sx = 15, sz = CELL * 2.6;
    add(sx, 3, sz, p.x, 6.5, p.z, M.wood);
    for (const z of [-sz / 2 + 2, sz / 2 - 2]) for (const x of [-5, 5])
        add(2, 6, 2, p.x + x, 3, p.z + z, M.steel);
    add(2, 17, sz, p.x + 6.2, 14, p.z, M.body);
    for (const z of [-14, -5, 5, 14]) {
        add(1, 6, 7, p.x + 4.8, 14, p.z + z, M.hazard);
        add(5, 1, 1, p.x + 2, 15 + (z % 2), p.z + z, M.steel);
    }
    add(8, 5, 9, p.x - 1, 10.5, p.z - 10, M.ink);
    add(6, 0.7, 7, p.x - 1, 13.3, p.z - 10, M.tech);
    registerFurniture(depotFurniture, 'maintenance-workbench', p, sx / 2, sz / 2, 23);
}

function buildForklift(M, add, addGeo, c, r) {
    const p = cellPos(c, r);
    add(34, 5, 18, p.x, 3, p.z, M.hazard);
    add(17, 11, 16, p.x - 6, 9, p.z, M.body);
    for (const x of [-14, 2]) for (const z of [-7, 7])
        add(2, 17, 2, p.x + x, 15, p.z + z, M.steel);
    add(18, 2, 18, p.x - 6, 24, p.z, M.steel);
    add(3, 25, 18, p.x + 14, 13, p.z, M.ink);
    for (const z of [-5, 5]) add(22, 1.8, 2.2, p.x + 25, 1.2, p.z + z, M.steel);
    for (const x of [-11, 9]) for (const z of [-9, 9])
        addGeo(new THREE.CylinderGeometry(4, 4, 2.4, 10), p.x + x, 3.8, p.z + z,
            M.ink, Math.PI / 2, 0, 0);
    add(5, 2, 11, p.x - 14, 17, p.z, M.amber);
    registerFurniture(depotFurniture, 'autonomous-forklift', p, 18, 11, 25);
}

function buildDrumCluster(M, addGeo, c, r, list = depotFurniture) {
    const p = cellPos(c, r);
    const offsets = [[-6, -5], [6, -5], [-6, 6], [6, 6], [0, 0]];
    for (let i = 0; i < offsets.length; i++) {
        const [x, z] = offsets[i], mat = i % 2 ? M.body : M.hazard;
        addGeo(new THREE.CylinderGeometry(4.2, 4.2, 10, 12), p.x + x, 5, p.z + z, mat);
        addGeo(new THREE.TorusGeometry(4.25, 0.45, 6, 12), p.x + x, 8.5, p.z + z,
            M.steel, Math.PI / 2, 0, 0);
    }
    registerFurniture(list, 'sealed-drum-cluster', p, 12, 12, 11);
}

function buildFreightScale(M, add, c, r) {
    const p = cellPos(c, r);
    add(CELL * 2.5, 1.8, CELL * 1.15, p.x, 0.9, p.z, M.steel);
    add(CELL * 2.2, 0.5, CELL * 0.92, p.x, 2, p.z, M.ink);
    for (const x of [-CELL, CELL]) add(2, 9, 2, p.x + x, 5.5, p.z - 8, M.hazard);
    add(CELL * 2.1, 1.2, 1.2, p.x, 10, p.z - 8, M.hazard);
    add(8, 5, 1, p.x, 7, p.z - 8.8, M.tech);
    registerFurniture(depotFurniture, 'freight-scale', p, CELL * 1.25, CELL * 0.58, 10);
}

function buildLockerBank(M, add, c, r) {
    const p = cellPos(c, r);
    for (let i = -2; i <= 2; i++) {
        add(9, 18, 10, p.x, 9, p.z + i * 10, M.body);
        add(0.7, 13, 7.5, p.x - 4.85, 9, p.z + i * 10, M.panel);
        add(0.8, 1.2, 2.5, p.x - 5.3, 10, p.z + i * 10, i === 0 ? M.amber : M.steel);
    }
    registerFurniture(depotFurniture, 'tool-lockers', p, 5, 25, 18);
}

function buildPlatformCart(M, add, addGeo, c, r) {
    const p = cellPos(c, r);
    add(CELL * 1.9, 2.5, 12, p.x, 4, p.z, M.body);
    add(CELL * 1.75, 0.8, 10, p.x, 5.6, p.z, M.wood);
    for (const x of [-CELL * 0.78, CELL * 0.78]) for (const z of [-5, 5])
        add(1, 8, 1, p.x + x, 9, p.z + z, M.steel);
    add(CELL * 1.65, 1, 1, p.x, 13, p.z - 5, M.steel);
    add(CELL * 1.65, 1, 1, p.x, 13, p.z + 5, M.steel);
    for (const x of [-CELL * 0.65, CELL * 0.65]) for (const z of [-7, 7])
        addGeo(new THREE.CylinderGeometry(2.7, 2.7, 1.8, 9), p.x + x, 2.6, p.z + z,
            M.ink, Math.PI / 2, 0, 0);
    registerFurniture(platformFurniture, 'freight-cart', p, CELL * 0.95, 8, 13);
}

function buildPlatformPallets(M, add, c, r) {
    const p = cellPos(c, r);
    for (const y of [1, 4.2]) {
        add(24, 1.2, 15, p.x, y, p.z, M.wood);
        for (const z of [-5, 0, 5]) add(24, 1, 1.5, p.x, y + 0.8, p.z + z, M.ink);
    }
    for (const x of [-7, 7]) add(10, 9, 11, p.x + x, 9.5, p.z, x < 0 ? M.panel : M.body);
    add(22, 0.8, 2, p.x, 14.5, p.z, M.hazard);
    registerFurniture(platformFurniture, 'secured-pallets', p, 13, 9, 15);
}

function buildPlatformBench(M, add, c, r) {
    const p = cellPos(c, r);
    add(30, 2.2, 7, p.x, 7, p.z, M.wood);
    add(30, 9, 2, p.x, 11.5, p.z - 3, M.steel);
    for (const x of [-12, 0, 12]) add(2, 7, 6, p.x + x, 3.5, p.z, M.steel);
    add(12, 4, 5, p.x, 10.5, p.z + 3, M.ink);
    add(9, 0.6, 3.5, p.x, 12.7, p.z + 3, M.tech);
    registerFurniture(platformFurniture, 'dispatch-bench', p, 16, 5, 16);
}

function buildSignalCabinet(M, add, c, r) {
    const p = cellPos(c, r);
    add(13, 20, 11, p.x, 10, p.z, M.body);
    add(10.5, 16, 0.8, p.x, 10, p.z + 5.8, M.panel);
    for (const x of [-3, 0, 3]) add(1.2, 8, 0.9, p.x + x, 11, p.z + 6.3, M.ink);
    add(8, 3.5, 1, p.x, 16, p.z + 6.5, M.tech);
    add(11, 1, 1, p.x, 19, p.z + 5.9, M.hazard);
    registerFurniture(platformFurniture, 'signal-cabinet', p, 7, 6, 20);
}

function buildStationFurniture(M, add, addGeo) {
    buildPalletRack(M, add, 10, 24, 4);
    buildPalletRack(M, add, 18, 27, 4);
    buildPalletRack(M, add, 11, 34, 4);
    buildCargoContainer(M, add, 20, 34, 3);
    buildCargoContainer(M, add, 23, 22, 3);
    buildWorkshop(M, add, 27, 31);
    buildForklift(M, add, addGeo, 20, 43);
    buildDrumCluster(M, addGeo, 27, 39);
    buildFreightScale(M, add, 14, 41);
    buildLockerBank(M, add, 27, 26);

    buildPlatformCart(M, add, addGeo, 10, 10);
    buildPlatformCart(M, add, addGeo, 18, 10);
    buildPlatformPallets(M, add, 23, 10);
    buildPlatformBench(M, add, 9, 13);
    buildSignalCabinet(M, add, 28, 11);
    buildDrumCluster(M, addGeo, 20, 13, platformFurniture);
}

function buildStationDoor(M, kind, x, z, sx, sz) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H - 2, sz), M.body);
    panel.position.set(x, (WALL_H - 2) / 2, z); panel.castShadow = true; panel.receiveShadow = true;
    stationRoot.add(panel);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(kind === 'platform' ? 5 : 1, 1.2, kind === 'platform' ? 1 : 5),
        new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }));
    lamp.position.set(x, WALL_H - 3, z); stationRoot.add(lamp);
    const door = {
        kind, panel, lamp, open: 0, target: 0,
        blocker: { x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx, sz) / 2, top: WALL_H, standable: false },
    };
    stationDoors.push(door); return door;
}

function updateStationDoors(dt) {
    const control = stationDoors.find(d => d.kind === 'control');
    const platform = stationDoors.find(d => d.kind === 'platform');
    if (control) control.target = Math.hypot(camera.position.x - control.blocker.x,
        camera.position.z - control.blocker.z) < CELL * 2.25 ? 1 : 0;
    if (platform) platform.target = platformUnlocked ? 1 : 0;
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
        if (mapCellAt(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k).token === '#') return true;
    }
    return false;
}

function stationDoorBlocks(x0, z0, x1, z1) {
    return stationDoors.some(d => d.open < 0.74 && segHitsRect(x0, z0, x1, z1, d.blocker));
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

    // Lantai mengikuti footprint CSV: T di utara, peron baris 8-14,
    // bangunan/station hall baris 16-49. Dinding # dibangun per-sel lalu dibatch.
    addStatic(MAP_COLS * CELL, 2, MAP_ROWS * CELL, OX, -1, OZ, M.ground);
    addStatic(MAP_COLS * CELL, 1, 7 * CELL, OX, -0.1, TRAIN_CENTER_Z, M.asphalt);
    const stationFloorZ = (cellPos(15.5, 8).z + cellPos(15.5, 50).z) / 2;
    addStatic(MAP_COLS * CELL, 0.8, 43 * CELL, OX, 0, stationFloorZ, M.panel);
    // SA tetap token gameplay, tetapi lantainya SAMA dengan hall lainnya.
    // Jangan tambahkan overlay warna: safe area harus terbaca dari perilaku,
    // bukan seperti zona bercahaya yang berbeda material.
    safeFloorOverlayCount = 0;
    for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) {
        const token = S5_MAP[r][c], p = cellPos(c + 1, r + 1);
        if (token === '#') {
            addStatic(CELL, WALL_H, CELL, p.x, WALL_H / 2, p.z, M.body);
            addBlocker(p.x, p.z, CELL / 2, CELL / 2, WALL_H);
        }
    }
    // Rel stasiun tetap menjadi anak stationRoot, bukan journey scenery.
    for (const z of [TRAIN_CENTER_Z - 20, TRAIN_CENTER_Z + 20])
        addStatic(MAP_COLS * CELL, 1.2, 2.2, OX, 0.1, z, M.steel);
    for (let c = 1; c <= MAP_COLS; c += 2) {
        const p = cellPos(c, 4);
        addStatic(CELL * 1.7, 0.8, 53, p.x, -0.25, TRAIN_CENTER_Z, M.ink);
    }
    // Garis aman peron dan gantry tetap, tidak pernah masuk pool bergerak.
    addStatic(MAP_COLS * CELL, 0.35, 2, OX, 0.65, cellPos(15.5, 8).z - CELL / 2 + 2, M.hazard);
    for (const c of [6, 15, 24]) {
        const p = cellPos(c, 12);
        addStatic(3, 29, 3, p.x, 14.5, p.z, M.steel);
        addStatic(3, 3, CELL * 7, p.x, 29, p.z - CELL * 2.5, M.steel);
    }
    buildStationFurniture(M, addStatic, addStaticGeo);
    staticBatch = addMergedStatic(stationRoot, staticProps);

    buildGenerator(M); buildTerminal(M);
    buildStationDoor(M, 'platform', PLATFORM_DOOR_POS.x, PLATFORM_DOOR_POS.z, CELL * 1.92, 3.5);
    buildStationDoor(M, 'control', CONTROL_DOOR_POS.x, CONTROL_DOOR_POS.z, 3.5, CELL * 1.92);
    repairMarker = marker(S5_GENERATOR.x, S5_GENERATOR.z, PAL.amber);
    terminalMarker = marker(S5_TERMINAL.x, S5_TERMINAL.z, PAL.tech);
    boardMarker = marker(S5_BOARD.x, S5_BOARD.z, PAL.amber);

    train = buildMilitaryTrainMesh(TRAIN_BASE_X, TRAIN_CENTER_Z);
    scene.add(train.group);
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
    const lampCells = [[3, 18], [11, 18], [20, 18], [28, 18], [8, 32], [17, 32], [27, 32], [15, 12]];
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

export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;
export const stage5StaticBatchDbg = () => staticBatch;
export const stage5WorldDebug = () => ({
    built,
    depot: { ...DEPOT },
    map: {
        rows: MAP_ROWS, cols: MAP_COLS, cell: CELL,
        walls: S5_MAP.reduce((n, row) => n + [...row].filter(t => t === '#').length, 0),
        trainCells: S5_MAP.reduce((n, row) => n + [...row].filter(t => t === 'T').length, 0),
        safeCells: S5_MAP.reduce((n, row) => n + [...row].filter(t => t === 'A' || t === 'S').length, 0),
        safeFloorOverlays: safeFloorOverlayCount,
        platformDoor: { ...PLATFORM_DOOR_POS }, controlDoor: { ...CONTROL_DOOR_POS },
        terminalObject: { ...TERMINAL_OBJECT }, generatorObject: { ...GENERATOR_OBJECT },
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
    },
    blockers: blockers.length,
    doorBlockers: doorBlockers.length,
    nav: !!navGrid,
    carCenters: train?.cars?.map(c => ({ x: c.position.x, z: c.position.z })) || [],
    supplies: SUPPLY_POINTS.map(p => ({ ...p })),
    crates: CRATE_POINTS.map(p => ({ ...p })),
});

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}

function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null;
    dialogueT = 0; dialogueChars = 0; renderDialogue();
}

function queueDialogue(key, repeat = false) {
    const line = STAGE5_DIALOGUE[key];
    if (!line || (!repeat && dialogueSeen.has(key))) return false;
    if (!repeat) dialogueSeen.add(key);
    dialogueQueue.push({ key, ...line });
    if (!dialogueCurrent) nextDialogue();
    return true;
}

function updateDialogue(dt) {
    if (!dialogueCurrent) return;
    const D = CFG.campaign.dialogue;
    dialogueT += dt;
    while (dialogueCurrent) {
        const sec = dialogueCurrent.text.length / Math.max(1, D.cps) + Math.max(0, D.holdSec);
        if (dialogueT < sec) {
            dialogueChars = Math.floor(dialogueT * Math.max(1, D.cps)); renderDialogue(); return;
        }
        dialogueChars = dialogueCurrent.text.length; renderDialogue();
        dialogueT -= sec; nextDialogue();
    }
}

function resetDialogue() {
    dialogueCurrent = null; dialogueQueue = []; dialogueSeen = new Set();
    dialogueT = 0; dialogueChars = 0; hideStageRadioDialogue();
}

function countEncounter(name) {
    let n = 0; for (const z of robots) if (z.stage === 5 && z.encounter === name) n++; return n;
}

function spawnOne(cls, x, z, encounter, boarding = false, boardTarget = null, active = true) {
    spawnCampaignRobot(x, z, 5, cls, active);
    const r = robots[robots.length - 1];
    r.encounter = encounter;
    if (boarding) {
        const side = z >= TRAIN_CENTER_Z ? 1 : -1;
        const targetX = boardTarget?.x ?? x;
        const targetZ = boardTarget?.z ?? (TRAIN_CENTER_Z + side * rand(5, 16));
        r.state = 'boarding'; r.trainBoard = {
            t: 0, dur: 0.75 + Math.random() * 0.35,
            fromX: x, fromZ: z, targetX, targetZ,
        };
    }
    return r;
}

function spawnEncounter(name, counts, carIndex, boarding = false) {
    if (!counts) return;
    const cx = TRAIN_BASE_X + carIndex * TRAIN_CAR_STEP;
    let k = 0;
    for (const cls of ['C', 'B', 'A']) {
        const n = Math.max(0, counts[cls] | 0);
        for (let i = 0; i < n; i++, k++) {
            const side = k % 2 ? 1 : -1;
            const rearEntry = boarding && k % 3 === 0;
            const x = rearEntry ? cx - TRAIN_CAR_LENGTH / 2 - 8 : cx + rand(-32, 32);
            const z = boarding && !rearEntry ? TRAIN_CENTER_Z + side * (TRAIN_HALF_WIDTH + 11)
                : TRAIN_CENTER_Z + side * rand(4, 12);
            const target = rearEntry ? { x: cx - 31, z } : null;
            spawnOne(cls, x, z, name, boarding, target);
        }
    }
}

function spawnDepot() {
    const C = CFG.campaign.stage5.encounters.depot;
    // Semua spawn berada di aisle kosong, jauh dari furnitur dan SA/S/T.
    // `active=false`: safe-area hold baru dilepas setelah player meninggalkan SA.
    const spots = [[9, 46], [14, 46], [23, 46], [8, 39], [18, 39], [23, 37],
        [8, 30], [15, 30], [24, 29], [14, 20], [19, 18], [26, 18]];
    let k = 0;
    for (const cls of ['C', 'B', 'A']) for (let i = 0; i < (C[cls] | 0); i++, k++) {
        const p = spots[k % spots.length], w = cellPos(p[0], p[1]);
        spawnOne(cls, w.x + rand(-3, 3), w.z + rand(-3, 3), 'depot', false, null, false);
    }
}

function placeSupplies() {
    for (const p of SUPPLY_POINTS) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}

function placeCrates() {
    for (const p of CRATE_POINTS) spawnCrate(p.x, p.z, 0);
}

function stopTrainLoop() {
    if (trainLoop) { stopLoopSFX(trainLoop); trainLoop = null; }
}

function startTrainLoop() {
    if (trainLoop) return;
    trainLoop = playLoopSFX(sfxTankMove, 0.2);
    try { trainLoop.playbackRate = 1.32; } catch (e) { }
}

function cleanupCine(revealSec = 0) {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, revealSec); setCinematicActive(false); setAvatarRadioPose(false);
}

function finishOpening() {
    cleanupCine(CFG.campaign.stage5.fadeSec); phase = 'clearDepot';
    showStageMsg('SECURE THE STATION â€” FIND THE C1 ACCESS COMPUTER', 4200);
}

function startOpening() {
    releaseInputs(); setCinematicActive(true); setCineBars(true);
    // Stage 4/outro dan layar loading tidak boleh mewariskan tirai hitam ke
    // opening Stage 5. Dunia harus terlihat pada frame render pertama; dialog
    // baru dimulai setelah establishing beat singkat yang config-driven.
    setCineFade(0, 0); hideStageRadioDialogue();
    cine = { kind: 'opening', t: 0, fadeIn: true, fading: false, dialogueStarted: false };
    showCutsceneSkip(finishOpening);
    const hall = cellPos(15, 31);
    setCineFocus(hall.x, hall.z, true);
}

function finishDeparture() {
    // Reset arena train ketika layar hitam; stasiun awal tidak pernah bergeser.
    departureShift = 0; train.group.position.x = 0;
    stationRoot.visible = false;
    camera.position.set(TRAIN_BASE_X - 28, CFG.player.eyeHeight, TRAIN_CENTER_Z);
    hideCutsceneSkip(); setCineFocus(null); setCineBars(false); setCinematicActive(false);
    setCineFade(0, CFG.campaign.stage5.fadeSec);
    cine = null; phase = 'cargo'; setTrainDoor(train, 0, true);
    showStageMsg('FIGHT THROUGH THE TRAIN — REACH THE CONTROL CAR', 4800);
}

function startDeparture() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    phase = 'departure'; rideT = 0; trainSpeed = 0; boardMarker.visible = false;
    camera.position.set(TRAIN_BASE_X - 28, CFG.player.eyeHeight, TRAIN_CENTER_Z);
    setCinematicActive(true); setCineBars(true); setCineFade(1, 0);
    cine = { kind: 'departure', t: 0, fadeIn: false, fading: false };
    queueDialogue('commandDeparture'); queueDialogue('gibranDeparture');
    setCineFocus(TRAIN_BASE_X + TRAIN_CAR_STEP, TRAIN_CENTER_Z, true);
    showCutsceneSkip(finishDeparture); startTrainLoop(); playSFX(sfxPurchase, 0.45);
}

function finishArrival() {
    if (complete) return;
    complete = true; phase = 'complete'; stopTrainLoop();
    hideStageRadioDialogue(); hideCutsceneSkip(); setAvatarRadioPose(false);
    setCineFocus(null); setCineBars(false); setCinematicActive(false); setCineFade(0, 0);
    beginStageTransition(stage6Scene);
}

function startArrival() {
    if (phase === 'arrival' || complete) return;
    phase = 'arrival'; releaseInputs(); setCinematicActive(true); setCineBars(true);
    setCineFade(1, 0);
    cine = { kind: 'arrival', t: 0, fadeIn: false, fading: false };
    queueDialogue('arrivedCommand'); queueDialogue('arrivedGibran');
    setAvatarRadioPose(true, Math.PI / 2, 'gibranAccepts', 0.5);
    camera.position.set(S5_ENGINE.x, CFG.player.eyeHeight, TRAIN_CENTER_Z + 17);
    setCineFocus(S5_ENGINE.x, S5_ENGINE.z, true);
    setTrainDoor(train, 3, true);
    showCutsceneSkip(finishArrival);
    addCamShake(2.2);
}

function updateCine(dt) {
    if (!cine) return;
    cine.t += dt;
    const C = CFG.campaign.stage5;
    if (!cine.fadeIn) {
        cine.fadeIn = true;
        setCineFade(0, C.fadeSec);
    }
    if (cine.kind === 'opening') {
        cineCam.x = -150 + Math.min(1, cine.t / 5) * 45;
        cineCam.y = 145 - Math.min(1, cine.t / 5) * 18;
        cineCam.z = 155 - Math.min(1, cine.t / 5) * 30;
        if (!cine.dialogueStarted && cine.t >= Math.max(0, C.openingDialogueDelaySec || 0)) {
            cine.dialogueStarted = true;
            queueDialogue('opening');
        }
        if (!cine.fading && cine.dialogueStarted && cine.t >= C.openingMinSec
            && !dialogueCurrent && !dialogueQueue.length) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishOpening();
    } else if (cine.kind === 'departure') {
        const k = Math.min(1, cine.t / Math.max(0.01, C.departureMinSec));
        cineCam.x = -125 + k * 50; cineCam.y = 90 + k * 18; cineCam.z = 125 - k * 35;
        // Kereta benar-benar keluar ke timur selama shot; seluruh stationRoot
        // tetap di (0,0,0). Arena di-reset saat layar hitam di finishDeparture.
        departureShift = k * CELL * 15;
        train.group.position.x = departureShift;
        camera.position.x = TRAIN_BASE_X - 28 + departureShift;
        camera.position.z = TRAIN_CENTER_Z;
        setCineFocus(TRAIN_BASE_X + TRAIN_CAR_STEP + departureShift, TRAIN_CENTER_Z, true);
        if (!cine.fading && cine.t >= C.departureMinSec && !dialogueCurrent && !dialogueQueue.length) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishDeparture();
    } else if (cine.kind === 'arrival') {
        const k = Math.min(1, cine.t / Math.max(0.01, C.arrivalMinSec));
        cineCam.x = -82 + k * 24; cineCam.y = 88 - k * 22; cineCam.z = 92 - k * 20;
        setAvatarRadioPose(true, Math.PI / 2, 'gibranAccepts', k);
        if (!cine.fading && cine.t >= C.arrivalMinSec && !dialogueCurrent && !dialogueQueue.length) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading) {
            cine.fadeT += dt;
            if (cine.fadeT >= C.fadeSec) finishArrival();
        }
    }
}

function pulseMarkers() {
    const t = Date.now() * 0.004;
    for (const [m, p] of [[repairMarker, 0], [terminalMarker, 1.4], [boardMarker, 2.8]])
        if (m && m.visible) { m.material.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t + p)); m.rotation.z += 0.008; }
}

function updateLandmarks(dt) {
    if (generatorRotor) generatorRotor.rotation.x += dt
        * (repairInstalled >= REPAIR_PARTS.length ? 2.1 : 0.16);
    if (terminalCore) terminalCore.rotation.y += dt * (platformUnlocked ? 0.8 : 0.22);
}

function wakeDepotRobots() {
    if (depotAwake) return;
    depotAwake = true;
    for (const z of robots) if (z.stage === 5 && z.encounter === 'depot') {
        z.state = 'chasing'; z.moving = false; z.aiming = false;
    }
    showStageMsg('SAFE AREA CLEARED — HOSTILE UNITS ARE CLOSING IN', 3400);
}

function beginRepair() {
    phase = 'repairing'; repairMarker.visible = false;
    clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    beginRepairMinigame({
        head: 'AUXILIARY GENERATOR — FIELD REPAIR',
        startIndex: repairInstalled,
        onProgress: k => { repairInstalled = k; },
        onSuccess: () => {
            repairInstalled = REPAIR_PARTS.length; phase = 'board';
            generatorScreen.material.color.setHex(PAL.tech);
            generatorScreen.material.emissive.setHex(PAL.tech);
            generatorScreen.material.emissiveIntensity = EMISSIVE_MAX * 0.75;
            boardMarker.visible = true;
            queueDialogue('powerBack'); queueDialogue('routeReady'); queueDialogue('letsMove');
            playSFX(sfxPurchase, 0.55);
            showStageMsg('AUXILIARY POWER RESTORED — BOARD THE TRAIN', 4500);
        },
        onFail: () => {
            phase = 'repair'; repairMarker.visible = true;
            showStageMsg(`REPAIR ABORTED — ${repairInstalled}/${REPAIR_PARTS.length} COMPONENTS INSTALLED`, 3600);
        },
    });
}

function hackAlarm() {
    const H = CFG.campaign.hack;
    hackCd = H.alarmCooldownSec;
    spawnAlarmHorde(5, {
        count: H.alarmHordeCount, walkable: stationCombatWalk, resolve, scratch: _v3,
        minUnits: H.alarmSpawnMinUnits, maxUnits: H.alarmSpawnMaxUnits, cls: 'C',
        // Ruang C1 berada di sudut peta, sehingga cincin 24 arah kadang hanya
        // menemukan sembilan titik. Cadangan ini tetap jauh, di luar SA/T.
        fallbackSpots: [[10, 43], [15, 35], [21, 25]],
        cellFn: (c, r) => cellPos(c, r),
    });
    showStageMsg(`ALARM TRIGGERED — CLEAR THE HUNTER SQUAD; TERMINAL REBOOTS IN ${Math.round(hackCd)}s`, 5000);
}

function beginHack() {
    terminalMarker.visible = false;
    clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    beginHackMinigame({
        head: 'C1 PLATFORM ACCESS — ICE BREACH',
        sub: 'Override station security and unlock the platform door.',
        onSuccess: () => {
            phase = 'repair'; platformUnlocked = true; repairMarker.visible = true;
            terminalScreen.material.color.setHex(PAL.tech);
            terminalScreen.material.emissive.setHex(PAL.tech);
            terminalScreen.material.emissiveIntensity = EMISSIVE_MAX * 0.65;
            const door = stationDoors.find(d => d.kind === 'platform');
            if (door) door.target = 1;
            showStageMsg('PLATFORM ACCESS UNLOCKED — REPAIR GENERATOR C2', 4400);
            playSFX(sfxPurchase, 0.55);
        },
        onFail: reason => {
            phase = 'hack'; hackArmed = false;
            if (reason === 'fail') hackAlarm();
            else { terminalMarker.visible = true; showStageMsg('BREACH ABORTED — STEP AWAY, THEN TRY AGAIN', 3200); }
        },
    });
}

function updateRide(dt) {
    const C = CFG.campaign.stage5;
    rideT += dt;
    const routeK = Math.min(1, rideT / Math.max(1, C.rideMinSec));
    if (phase === 'departure') trainSpeed += (C.trainSpeed - trainSpeed) * Math.min(1, dt * 0.55);
    else if (phase === 'arrival') trainSpeed += (0 - trainSpeed) * Math.min(1, dt * 0.85);
    else trainSpeed += (C.trainSpeed - trainSpeed) * Math.min(1, dt * 2.5);
    updateTrainVisual(train, dt, trainSpeed);
    updateJourneyScenery(journey, dt, trainSpeed, phase === 'arrival' || complete ? 1 : routeK);
    if (trainSpeed > 18) addCamShake(0.16 + Math.min(0.08, trainSpeed / 1000));
}

function carAt(x) {
    return Math.max(0, Math.min(TRAIN_CAR_COUNT - 1, Math.round((x - TRAIN_BASE_X) / TRAIN_CAR_STEP)));
}

function updateEncounters(dt) {
    const C = CFG.campaign.stage5, car = carAt(camera.position.x);
    if (phase === 'cargo') {
        if (!encounterSpawned.cargo && rideT >= C.cargoGateSec && car >= 1) {
            encounterSpawned.cargo = true;
            spawnEncounter('cargo', C.encounters.cargo, 1, true);
            queueDialogue('breach'); queueDialogue('breachReply'); addCamShake(2.0);
        }
        if (encounterSpawned.cargo && countEncounter('cargo') === 0 && rideT >= C.securityGateSec) {
            setTrainDoor(train, 1, true); phase = 'security';
            showStageMsg('CARGO CAR SECURED — ADVANCE THROUGH THE TRAIN', 3200);
        }
    } else if (phase === 'security') {
        if (!encounterSpawned.security && car >= 2) {
            encounterSpawned.security = true; spawnEncounter('security', C.encounters.security, 2, false);
        }
        if (encounterSpawned.security && countEncounter('security') === 0 && rideT >= C.roofGateSec) {
            setTrainDoor(train, 2, true); phase = 'roof';
            showStageMsg('SECURITY CAR CLEARED — CROSS THE OPEN DECK', 3200);
        }
    } else if (phase === 'roof') {
        if (!encounterSpawned.roof && car >= 3) {
            encounterSpawned.roof = true; spawnEncounter('roof', C.encounters.roof, 3, true);
            queueDialogue('roofWarning'); queueDialogue('roofReply'); addCamShake(2.4);
        }
        if (encounterSpawned.roof && countEncounter('roof') === 0 && rideT >= C.finalGateSec) {
            setTrainDoor(train, 3, true);
            if (car >= 4) {
                phase = 'finalDefense'; finalT = 0; finalWaveIndex = 0;
                queueDialogue('finalApproach'); queueDialogue('finalReply');
                showStageMsg('FINAL APPROACH — HOLD THE CONTROL CAR', 4300);
            }
        }
    } else if (phase === 'finalDefense') {
        finalT += dt;
        const waves = C.encounters.finalWaves || [];
        while (finalWaveIndex < waves.length && finalT >= finalWaveIndex * C.finalWaveGapSec) {
            spawnEncounter('final', waves[finalWaveIndex], Math.max(1, 3 - finalWaveIndex), true);
            finalWaveIndex++; addCamShake(1.6);
        }
        if (finalWaveIndex >= waves.length && finalT >= C.finalDefenseSec
            && rideT >= C.rideMinSec && countStageRobots(5) === 0) startArrival();
    }
}

function resetStage() {
    phase = 'opening'; rideT = 0; finalT = 0; trainSpeed = 0; complete = false;
    repairInstalled = 0; repairArmed = true; hackArmed = true; hackCd = 0;
    discovered = false; platformUnlocked = false; depotAwake = false; finalWaveIndex = 0; departureShift = 0;
    encounterSpawned = { cargo: false, security: false, roof: false };
    stopTrainLoop(); cleanupCine(); resetDialogue();
    resetTrainVisual(train); resetJourneyScenery(journey);
    train.group.position.set(0, 0, 0); stationRoot.visible = true;
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

export const stage5DialogueDebug = () => ({
    key: dialogueCurrent?.key || null,
    speaker: dialogueCurrent?.speaker || '', text: dialogueCurrent?.text || '',
    chars: dialogueChars,
    shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
    typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
    queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen],
});

export const stage5Debug = () => {
    const C = CFG.campaign.stage5 || {};
    const routeK = Math.min(1, rideT / Math.max(1, C.rideMinSec || 1));
    const distance = phase === 'arrival' || phase === 'complete' ? 0
        : Math.max(1, Math.ceil((C.routeKm || 120) * (1 - routeK)));
    return {
        phase, objective: stage5Scene.hudStatus(), repairInstalled, repairTotal: REPAIR_PARTS.length,
        repairArmed, hackArmed, hackCd, platformUnlocked, depotAwake, departureShift,
        stationX: stationRoot?.position?.x || 0, stationZ: stationRoot?.position?.z || 0,
        rideT, routeK, distance, finalT, finalWaveIndex,
        robots: countStageRobots(5), complete, encountered: { ...encounterSpawned },
    };
};
export const trainJourneyDebug = () => ({
    ...trainDebug(train, journey),
    station: {
        visible: !!stationRoot?.visible,
        x: stationRoot?.position?.x || 0,
        z: stationRoot?.position?.z || 0,
    },
});

export const stage5Scene = {
    id: 'campaign-5',
    lightsKey: 'campaign-5',

    enter() {
        saveCampaignStage(5);
        ensureWorld();
        // Transisi normal membuang stage 4 lewat shop; guard juga membersihkan
        // robot stage lama pada jalur continue/cheat yang tidak biasa.
        for (let i = robots.length - 1; i >= 0; i--) {
            disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
        resetCrates(); resetStage(); spawnDepot(); placeSupplies(); placeCrates();
        applyLightPreset(scene, 'night'); exitCityEnv();
        camera.position.set(S5_START.x, CFG.player.eyeHeight, S5_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening(); updateUI();
    },

    exit() {
        hideStageRadioDialogue();
        if (cine) cleanupCine();
        if (['departure', 'cargo', 'security', 'roof', 'finalDefense', 'arrival'].includes(phase)) stopTrainLoop();
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,

    updateMode(dt) {
        updateDialogue(dt); updateCine(dt); updateStationDoors(dt); pulseMarkers(); updateLandmarks(dt);
        if (hackCd > 0) hackCd = Math.max(0, hackCd - dt);
        if (['departure', 'cargo', 'security', 'roof', 'finalDefense', 'arrival'].includes(phase)) updateRide(dt);

        if (phase === 'clearDepot') {
            if (!depotAwake && !touchesSafeArea(camera.position.x, camera.position.z, player.radius))
                wakeDepotRobots();
            if (!discovered && camera.position.z < cellPos(15, 25).z) {
                discovered = true; queueDialogue('discoverTrain'); queueDialogue('powerDead');
            }
            if (countEncounter('depot') === 0) {
                phase = 'hack'; terminalMarker.visible = true;
                queueDialogue('discoverTrain'); queueDialogue('powerDead');
                showStageMsg('STATION SECURED — HACK COMPUTER C1', 4200);
            }
        } else if (phase === 'hack') {
            const near = Math.hypot(camera.position.x - S5_TERMINAL.x,
                camera.position.z - S5_TERMINAL.z) < CFG.campaign.stage5.terminalRange;
            if (!near) hackArmed = true;
            else if (hackArmed && hackCd <= 0 && countStageRobots(5) === 0) {
                hackArmed = false; beginHack();
            }
            terminalMarker.visible = hackCd <= 0 && countStageRobots(5) === 0;
        } else if (phase === 'repair') {
            const near = Math.hypot(camera.position.x - S5_GENERATOR.x,
                camera.position.z - S5_GENERATOR.z) < CFG.campaign.stage5.repairRange;
            if (!near) repairArmed = true;
            else if (repairArmed) { repairArmed = false; beginRepair(); }
        } else if (phase === 'board') {
            if (Math.hypot(camera.position.x - S5_BOARD.x, camera.position.z - S5_BOARD.z)
                < CFG.campaign.stage5.boardRange) startDeparture();
        }
        if (['cargo', 'security', 'roof', 'finalDefense'].includes(phase)) updateEncounters(dt);
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(playerWalk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
        slideWalk(playerWalk, pos, oldX, oldZ, player.radius);
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        if (b.mesh.position.y >= WALL_H) return false;
        return stage5SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
            || stationDoorBlocks(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        if (y >= WALL_H) return false;
        return stage5SegHitsWall(x0, z0, x1, z1) || stationDoorBlocks(x0, z0, x1, z1);
    },
    grenadeCollide(g, oldX, oldZ) {
        if (!playerWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },

    robotAI(z, dt, step) {
        if (z.encounter === 'depot' && !depotAwake) {
            // Posisi/serangan dibekukan, tetapi biarkan loop robot menjalankan
            // idle rig (kepala/lengan) agar mereka tidak tampak seperti patung.
            // Tembakan dari SA juga tidak boleh membangunkan mereka lebih awal.
            z.state = 'idle'; z.moving = false; z.aiming = false;
            return {};
        }
        if (z.trainBoard) {
            const b = z.trainBoard; b.t += dt;
            const k = Math.min(1, b.t / b.dur), s = k * k * (3 - 2 * k);
            z.mesh.position.x = b.fromX + (b.targetX - b.fromX) * s;
            z.mesh.position.z = b.fromZ + (b.targetZ - b.fromZ) * s;
            z.mesh.position.y = Math.sin(k * Math.PI) * 8;
            if (k < 1) return { skip: true };
            delete z.trainBoard; z.state = 'chasing'; z.groundY = 0; z.baseY = 0; z.mesh.position.y = 0;
        }
        return campaignRobotAI(z, dt, step, { walkable: robotWalk, resolve, nav: navGrid });
    },
    clampRobot(z, oldX, oldZ) {
        if (z.trainBoard) return;
        campaignClampRobot(z, oldX, oldZ, { walkable: robotWalk, resolve });
    },

    clampDropPos(x, z) {
        if (stage5Walk(x, z, 2)) return [x, z];
        if (x >= TRAIN_X0 - 20) return [Math.max(TRAIN_X0 + 2, Math.min(TRAIN_X1 - 2, x)),
            Math.max(TRAIN_Z0 + 2, Math.min(TRAIN_Z1 - 2, z))];
        // Hindari menjepit drop ke dalam sel dinding CSV. Safe area start
        // selalu merupakan fallback walkable yang sah.
        return [S5_START.x, S5_START.z];
    },

    hudStatus() {
        const C = CFG.campaign.stage5 || {};
        if (phase === 'opening') return 'STAGE 5 — THE LAST TRAIN TO BANDUNG';
        if (phase === 'clearDepot' && !depotAwake) return 'SAFE AREA — MOVE OUT WHEN READY';
        if (phase === 'clearDepot') return `STATION SECURITY — Robots: ${countEncounter('depot')}`;
        if (phase === 'repair' || phase === 'repairing') return `GENERATOR C2 — ${repairInstalled}/${REPAIR_PARTS.length}`;
        if (phase === 'hack') {
            if (countStageRobots(5) > 0) return `C1 ACCESS COMPUTER — Clear alarm squad: ${countStageRobots(5)}`;
            if (hackCd > 0) return `C1 ACCESS COMPUTER REBOOT — ${Math.ceil(hackCd)}s`;
            return 'C1 ACCESS COMPUTER — ICE BREACH READY';
        }
        if (phase === 'board') return 'BANDUNG ROUTE AUTHORIZED — BOARD THE TRAIN';
        if (phase === 'arrival') return 'BANDUNG — ARRIVING';
        if (phase === 'complete') return 'BANDUNG — ARRIVED';
        const k = Math.min(1, rideT / Math.max(1, C.rideMinSec || 1));
        const km = Math.max(1, Math.ceil((C.routeKm || 120) * (1 - k)));
        if (phase === 'finalDefense') return `TO BANDUNG — ${km} KM | HOLD THE CONTROL CAR | Robots: ${countStageRobots(5)}`;
        return `TO BANDUNG — ${km} KM | CAR ${carAt(camera.position.x) + 1}/${TRAIN_CAR_COUNT} | Robots: ${countStageRobots(5)}`;
    },

    radarLandmarks(plot) {
        let p = null;
        if (phase === 'repair' || phase === 'repairing') p = S5_GENERATOR;
        else if (phase === 'hack') p = S5_TERMINAL;
        else if (phase === 'board') p = S5_BOARD;
        else if (['departure', 'cargo'].includes(phase)) p = { x: TRAIN_BASE_X + TRAIN_CAR_STEP, z: TRAIN_CENTER_Z };
        else if (phase === 'security') p = { x: TRAIN_BASE_X + 2 * TRAIN_CAR_STEP, z: TRAIN_CENTER_Z };
        else if (phase === 'roof') p = { x: TRAIN_BASE_X + 3 * TRAIN_CAR_STEP, z: TRAIN_CENTER_Z };
        else if (phase === 'finalDefense') p = S5_ENGINE;
        if (p) plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
