// Campaign Stage 6 — FALSE HOMECOMING.
// Bandung Logistics Terminal -> service tunnel -> Bandung Headquarters ->
// kill-switch upload fails because only N.U.S.A.'s IKN transmitter has root authority.

import { CFG } from '../../../core/config.js';
import {
    player, robots, keys, _v3, setCinematicActive,
} from '../../../core/state.js';
import {
    scene, camera, setCineFocus, CAM_OFF_DEFAULT, addCamShake,
} from '../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    showDownloadBar, setDownloadProgress, hideDownloadBar,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../core/dom.js';
import { updateUI } from '../../../core/hud.js';
import { releaseInputs } from '../../../core/input.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { setAvatarRadioPose } from '../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../entities/robots.js';
import {
    spawnCampaignRobot, campaignAwardKill, campaignRobotAI, campaignClampRobot,
    countStageRobots,
} from '../utility/common.js';
import { campaignJumpToStage } from '../utility/transition.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { gameOver } from '../../../core/game.js';
import { stage1Scene } from './stage1.js';
import { applyLightPreset, registerStageLight } from '../../../world/lighting.js';
import { exitCityEnv } from '../utility/cityscape.js';
import { PAL, EMISSIVE_MAX } from '../../../world/palette.js';
import { addMergedStatic } from '../../../utils/meshBatch.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { makeTexture } from '../../../utils/textures.js';
import { rand } from '../../../utils/math.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../entities/drops.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../entities/crates.js';
import { buildFuturisticSUVMesh } from '../../../entities/futuristicSUV.js';

const OX = 210000, OZ = 0;
const MAP_COLS = 76, MAP_ROWS = 52, CELL = 14, WALL_H = 25;
const MAP_X0 = OX - MAP_COLS * CELL / 2;
const MAP_Z0 = OZ - MAP_ROWS * CELL / 2;
const cellPos = (c, r) => ({ x: MAP_X0 + (c + 0.5) * CELL, z: MAP_Z0 + (r + 0.5) * CELL });

function makeMap() {
    const a = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill('#'));
    const carve = (c0, r0, c1, r1, token = '.') => {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) a[r][c] = token;
    };
    // Arrival platform / safe area.
    carve(1, 20, 9, 33, 'A');
    a[27][4] = 'S';
    carve(10, 25, 10, 28, '-');
    // Freight terminal and station operations.
    carve(11, 8, 26, 44);
    carve(17, 2, 24, 6);
    carve(20, 7, 21, 7, '-');
    a[5][21] = 'O';
    // Military service tunnel and two emergency substations.
    carve(27, 26, 27, 28, '-');
    carve(28, 24, 48, 30);
    carve(37, 12, 46, 21);
    carve(40, 22, 41, 23, '-');
    carve(37, 33, 46, 42);
    carve(40, 31, 41, 32, '-');
    a[18][42] = '1';
    a[40][42] = '2';
    // Powered bulkhead, HQ motor pool, command floor, and data vault.
    carve(49, 26, 49, 28, '-');
    carve(50, 11, 60, 42);
    carve(61, 26, 61, 28, '-');
    carve(62, 19, 73, 43);
    carve(66, 5, 73, 17);
    carve(69, 18, 70, 18, '-');
    a[10][69] = 'U';
    return Object.freeze(a.map(row => row.join('')));
}

export const S6_MAP = makeMap();
export const S6_LEGEND = Object.freeze({
    '#': 'wall', '.': 'floor', A: 'safe', S: 'start', '-': 'door',
    O: 'station-control', 1: 'substation-a', 2: 'substation-b', U: 'uplink',
});

export const S6_START = Object.freeze(cellPos(4, 27));
export const S6_STATION_CONTROL = Object.freeze(cellPos(21, 5));
export const S6_SUBSTATION_A = Object.freeze(cellPos(42, 18));
export const S6_SUBSTATION_B = Object.freeze(cellPos(42, 40));
export const S6_HQ_ENTRANCE = Object.freeze(cellPos(51, 27));
export const S6_UPLINK = Object.freeze(cellPos(69, 10));

const STATION_CONTROL_OBJECT = Object.freeze(cellPos(21, 3));
const SUBSTATION_OBJECTS = Object.freeze({
    A: Object.freeze(cellPos(42, 16)),
    B: Object.freeze(cellPos(42, 38)),
});
const UPLINK_OBJECT = Object.freeze(cellPos(71, 10));

const DOOR_LAYOUT = Object.freeze([
    Object.freeze({ kind: 'operations', ...cellPos(20.5, 7), sx: CELL * 2, sz: 3.5 }),
    Object.freeze({ kind: 'tunnel', ...cellPos(27, 27), sx: 3.5, sz: CELL * 3 }),
    Object.freeze({ kind: 'bulkhead', ...cellPos(49, 27), sx: 4.5, sz: CELL * 3 }),
    Object.freeze({ kind: 'command', ...cellPos(61, 27), sx: 4.5, sz: CELL * 3 }),
    Object.freeze({ kind: 'vault', ...cellPos(69.5, 18), sx: CELL * 2, sz: 4.5 }),
]);

const SUPPLY_POINTS = Object.freeze([
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...cellPos(13, 40) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...cellPos(24, 12) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...cellPos(31, 27) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...cellPos(59, 23) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...cellPos(65, 40) }),
    Object.freeze({ type: 'medkit', ...cellPos(18, 37) }),
    Object.freeze({ type: 'medkit', ...cellPos(64, 22) }),
]);
const CRATE_POINTS = Object.freeze([
    Object.freeze({ area: 'terminal', ...cellPos(15, 14) }),
    Object.freeze({ area: 'terminal', ...cellPos(23, 35) }),
    Object.freeze({ area: 'tunnel', ...cellPos(34, 28) }),
    Object.freeze({ area: 'motor-pool', ...cellPos(57, 14) }),
    Object.freeze({ area: 'command', ...cellPos(66, 38) }),
]);

// Naskah final dipatok sebagai data agar smoke bisa memeriksa teks dan urutan.
export const STAGE6_DIALOGUE = Object.freeze({
    arrivalSystem: Object.freeze({ speaker: 'Train System', text: 'Bandung Logistics Terminal. Route complete.' }),
    arrivalCommand: Object.freeze({ speaker: 'Command', text: 'Major, Headquarters is still holding, but the surface approaches are overrun. Use the military service corridor beneath this terminal and bring the file to the central uplink.' }),
    arrivalGibran: Object.freeze({ speaker: 'Major Gibran', text: "Copy. I've come too far to let this file die here." }),
    leaveSafe: Object.freeze({ speaker: 'Major Gibran', text: 'So much for a quiet homecoming. I need to clear this terminal and reach station operations.' }),
    corridorUnlocked: Object.freeze({ speaker: 'Station System', text: 'Military service corridor unlocked.' }),
    bulkheadCommand: Object.freeze({ speaker: 'Command', text: 'The blast bulkhead ahead has lost power. Bring both emergency substations online.' }),
    bulkheadGibran: Object.freeze({ speaker: 'Major Gibran', text: "Understood. I'll restore the grid." }),
    gridRestored: Object.freeze({ speaker: 'Major Gibran', text: 'Both substations are live. Opening the route.' }),
    hqCommand: Object.freeze({ speaker: 'Command', text: "You're beneath the west wing. Hostiles have breached the motor pool and command floor." }),
    hqGibran: Object.freeze({ speaker: 'Major Gibran', text: "Keep the uplink ready. I'll handle the rest." }),
    insertCommand: Object.freeze({ speaker: 'Command', text: "Insert the drive. We'll push the kill-switch through every occupied network we can reach." }),
    uploadSystem: Object.freeze({ speaker: 'HQ Uplink', text: 'Data package verified. Uploading kill-switch protocol.' }),
    uploadFailed: Object.freeze({ speaker: 'HQ Uplink', text: 'UPLOAD FAILED. BROADCAST AUTHORITY DENIED. ROOT TRANSMISSION NODE REQUIRED.' }),
    gibranFailure: Object.freeze({ speaker: 'Major Gibran', text: "What?! The file is valid. Why isn't it uploading?" }),
    commandIKN: Object.freeze({ speaker: 'Command', text: "The protocol can only be injected from N.U.S.A.'s central robot transmitter. The network manifest places it in Nusantara—IKN, East Kalimantan." }),
    gibranIKN: Object.freeze({ speaker: 'Major Gibran', text: "Kalimantan?! You're telling me the only transmitter that can end this war is on another island?" }),
    commandKertajati: Object.freeze({ speaker: 'Command', text: 'Bandung can decrypt the file, but it cannot broadcast it. Your nearest viable air route is Kertajati.' }),
    lockdownWarning: Object.freeze({ speaker: 'HQ System', text: 'WARNING. Unauthorized kill-switch handshake detected. Enemy trace confirmed. Headquarters lockdown initiated.' }),
    commandEscape: Object.freeze({ speaker: 'Command', text: 'They traced the attempt. Major, get out of Headquarters now!' }),
    gibranResolve: Object.freeze({ speaker: 'Major Gibran', text: 'Copy. First I survive Bandung. Then I find a way to IKN.' }),
});

const ENCOUNTER_POINTS = Object.freeze({
    terminal: Object.freeze([[13, 12], [18, 13], [23, 12], [14, 22], [21, 21], [24, 29], [14, 34], [20, 37], [24, 41], [12, 42], [22, 17]]),
    tunnel: Object.freeze([[30, 26], [33, 29], [36, 25], [39, 29], [43, 25], [46, 29], [32, 25], [37, 27], [42, 29], [47, 26]]),
    substationA: Object.freeze([[38, 14], [40, 19], [44, 13], [45, 19], [38, 18]]),
    substationB: Object.freeze([[38, 35], [40, 40], [44, 35], [45, 40], [38, 39]]),
    hqPerimeter: Object.freeze([[52, 14], [56, 14], [59, 18], [52, 23], [57, 25], [53, 32], [59, 33], [52, 39], [56, 40], [59, 38]]),
    commandFloor: Object.freeze([[63, 22], [67, 22], [71, 22], [64, 28], [69, 29], [72, 34], [64, 40]]),
    commandReinforcement: Object.freeze([[63, 24], [72, 25], [63, 34], [70, 41], [72, 38]]),
});

let built = false, worldRoot = null, navGrid = null, staticBatch = [];
let stationScreen = null, uplinkScreen = null, uplinkRings = null;
const substationRotors = { A: null, B: null };
const blockers = [], doors = [], propRecords = [], stageLights = [];
const rainDrops = [], sparkPool = [];
let stationMarker = null, subMarkerA = null, subMarkerB = null, uplinkMarker = null;

let phase = 'opening', terminalAwake = false, stationAccessT = 0, stationAccessed = false;
let tunnelSpawned = false, hqSpawned = false, commandSpawned = false, reinforcementSpawned = false;
let substation = { A: false, B: false }, subProgress = { A: 0, B: 0 }, subSpawned = { A: false, B: false };
let uploadProgress = 0, uploadFailed = false, lockdown = false, complete = false;
let interactionKind = '', sparkT = 0, stageElapsed = 0;
let cine = null;
const cineCam = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };

let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function mapCellAt(x, z) {
    const c = Math.floor((x - MAP_X0) / CELL), r = Math.floor((z - MAP_Z0) / CELL);
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return { c, r, token: '#' };
    return { c, r, token: S6_MAP[r][c] };
}

const openToken = token => token !== '#';
const safeToken = token => token === 'A' || token === 'S';

function touchesSafeArea(x, z, radius = 0) {
    const d = Math.max(0, radius);
    return safeToken(mapCellAt(x, z).token)
        || safeToken(mapCellAt(x - d, z - d).token)
        || safeToken(mapCellAt(x + d, z - d).token)
        || safeToken(mapCellAt(x - d, z + d).token)
        || safeToken(mapCellAt(x + d, z + d).token);
}

export function stage6Walk(x, z, radius = 0) {
    const d = Math.max(0, radius);
    return openToken(mapCellAt(x - d, z - d).token)
        && openToken(mapCellAt(x + d, z - d).token)
        && openToken(mapCellAt(x - d, z + d).token)
        && openToken(mapCellAt(x + d, z + d).token);
}

function robotWalk(x, z, radius = 0) {
    const d = Math.max(0, radius);
    const cells = [mapCellAt(x - d, z - d), mapCellAt(x + d, z - d),
        mapCellAt(x - d, z + d), mapCellAt(x + d, z + d)];
    return cells.every(m => openToken(m.token) && !safeToken(m.token));
}

function addBlocker(x, z, hx, hz, top = WALL_H, standable = false) {
    const b = { x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(hx, hz), top, standable };
    blockers.push(b); return b;
}

function blockedAt(x, z, radius = 3.5) {
    for (const b of blockers) {
        if (Math.abs(x - b.x) <= b.hx + radius && Math.abs(z - b.z) <= b.hz + radius) return true;
    }
    return false;
}

function resolveDoors(pos, radius) {
    for (const d of doors) if (d.open < 0.74) resolveBlockers(pos, radius, 0, [d.blocker]);
}

export function resolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
    resolveDoors(pos, radius);
}

function segHitsRect(x0, z0, x1, z1, b) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / 5));
    for (let i = 0; i <= steps; i++) {
        const k = i / steps, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        if (Math.abs(x - b.x) <= b.hx && Math.abs(z - b.z) <= b.hz) return true;
    }
    return false;
}

export function stage6SegHitsWall(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / (CELL * 0.3)));
    for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        if (mapCellAt(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k).token === '#') return true;
    }
    return false;
}

function doorBlocksShot(x0, z0, x1, z1) {
    return doors.some(d => d.open < 0.74 && segHitsRect(x0, z0, x1, z1, d.blocker));
}

function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m); return m;
}

function cylinder(parent, mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function torus(parent, mat, radius, tube, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 18), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function markerAt(p, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(6.5, 8.5, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42,
            side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.18, p.z); m.visible = false;
    worldRoot.add(m); return m;
}

function signTexture(text, sub = '') {
    return makeTexture(512, 128, (g, w, h) => {
        g.fillStyle = '#171611'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#bd8b42'; g.lineWidth = 7; g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = '#f0dfbc'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 35px monospace'; g.fillText(text, w / 2, sub ? 49 : h / 2);
        if (sub) { g.fillStyle = '#b88b48'; g.font = '20px monospace'; g.fillText(sub, w / 2, 91); }
    });
}

function addDoor(M, spec) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(spec.sx, WALL_H - 2, spec.sz), M.body);
    panel.position.set(spec.x, (WALL_H - 2) / 2, spec.z);
    panel.castShadow = true; panel.receiveShadow = true; worldRoot.add(panel);
    const horizontal = spec.sx > spec.sz;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 6 : 1.2, 1.2, horizontal ? 1.2 : 6),
        new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }));
    lamp.position.set(spec.x, WALL_H - 2.8, spec.z); worldRoot.add(lamp);
    const d = { kind: spec.kind, panel, lamp, open: 0, target: 0,
        blocker: { x: spec.x, z: spec.z, hx: spec.sx / 2, hz: spec.sz / 2,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(spec.sx, spec.sz) / 2,
            top: WALL_H, standable: false } };
    doors.push(d); return d;
}

function door(kind) { return doors.find(d => d.kind === kind); }

function updateDoors(dt) {
    for (const d of doors) {
        const dir = d.target > d.open ? 1 : -1;
        d.open = Math.max(0, Math.min(1, d.open + dir * dt / 0.5));
        const e = d.open * d.open * (3 - 2 * d.open);
        d.panel.position.y = (WALL_H - 2) / 2 - e * (WALL_H + 2);
        d.lamp.material.color.setHex(d.target ? PAL.tech : PAL.hazard);
    }
}

function recordProp(kind, p, hx = 0, hz = 0, top = 0, solid = false) {
    propRecords.push({ kind, x: p.x, z: p.z, hx, hz, top, solid });
    if (solid) addBlocker(p.x, p.z, hx, hz, top);
}

function buildParkedTrain(M, add) {
    const x = MAP_X0 - 18, z = cellPos(4, 26.5).z;
    for (const dz of [-82, 0, 82]) {
        add(25, 11, 74, x, 5.5, z + dz, M.body);
        add(21, 7, 67, x + 1, 11.5, z + dz, M.panel);
        add(2, 1.2, 61, x + 13.2, 8, z + dz, M.hazard);
        for (const wz of [-24, 24]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 2.2, 10), M.ink);
            w.rotation.z = Math.PI / 2; w.position.set(x + 10, 0, z + dz + wz); w.castShadow = true;
            worldRoot.add(w);
        }
    }
    recordProp('arrival-train', { x, z }, 13, 120, 18, false);
}

function buildTerminalProps(M, add) {
    // Freight scanners and conveyors leave a clear central route.
    for (const [c, r] of [[13, 11], [24, 18], [13, 31]]) {
        const p = cellPos(c, r);
        add(12, 3, 29, p.x, 2, p.z, M.ink);
        add(2, 15, 31, p.x - 6, 8, p.z, M.steel);
        add(2, 15, 31, p.x + 6, 8, p.z, M.steel);
        add(14, 2, 31, p.x, 15, p.z, M.hazard);
        recordProp('freight-scanner', p, 7, 15.5, 16, true);
    }
    for (const [c, r, span] of [[17, 15, 5], [20, 33, 5], [24, 40, 3]]) {
        const p = cellPos(c, r), sx = span * CELL;
        add(sx, 2.5, 12, p.x, 3, p.z, M.body);
        for (let x = -sx / 2 + 4; x < sx / 2; x += 8) add(1.1, 1, 10, p.x + x, 4.6, p.z, M.steel);
        recordProp('cargo-conveyor', p, sx / 2, 6, 5, true);
    }
    for (const [c, r] of [[13, 42], [24, 27]]) {
        const p = cellPos(c, r);
        for (const dx of [-14, 14]) for (const dz of [-5, 5]) add(2, 22, 2, p.x + dx, 11, p.z + dz, M.steel);
        for (const y of [5, 12, 19]) add(31, 1.5, 12, p.x, y, p.z, M.hazard);
        recordProp('pallet-rack', p, 16, 7, 22, true);
    }
    // Dispatch booth around the station control, without blocking its approach.
    const cp = cellPos(18, 4);
    add(18, 9, 18, cp.x, 4.5, cp.z, M.body);
    add(15, 6.5, 15, cp.x, 8.8, cp.z, M.glass);
    recordProp('dispatch-booth', cp, 9, 9, 13, true);
}

function buildControlConsole(M) {
    const g = new THREE.Group(); g.position.set(STATION_CONTROL_OBJECT.x, 0, STATION_CONTROL_OBJECT.z);
    box(g, M.ink, 17, 5, 10, 0, 2.5, 0);
    const top = box(g, M.body, 18, 2, 11, 0, 6, 0); top.rotation.x = -0.12;
    stationScreen = box(g, M.screen, 13, 5, 0.8, 0, 7.6, 5.2, false); stationScreen.rotation.x = -0.12;
    for (const x of [-6, -2, 2, 6]) box(g, M.amber, 1, 1, 1, x, 4.5, 5.5, false);
    worldRoot.add(g); recordProp('station-control', STATION_CONTROL_OBJECT, 9, 5, 9, true);
}

function buildTunnelProps(M, add) {
    for (const c of [30, 34, 38, 44, 47]) {
        const p = cellPos(c, 24);
        add(CELL * 1.4, 2, 2, p.x, 20, p.z + 2, M.steel);
        add(CELL * 1.4, 1.1, 1.1, p.x, 17, p.z + 3.5, M.hazard);
    }
    for (const r of [25, 29]) {
        const p0 = cellPos(38, r);
        add(CELL * 18, 1.5, 1.5, p0.x, 18, p0.z, M.ink);
        add(CELL * 18, 0.8, 0.8, p0.x, 15.5, p0.z, M.tech);
    }
    for (const [c, r] of [[32, 29], [45, 25]]) {
        const p = cellPos(c, r);
        add(18, 4, 9, p.x, 2, p.z, M.body);
        add(14, 2, 7, p.x, 5, p.z, M.panel);
        recordProp('maintenance-cart', p, 9, 4.5, 6, true);
    }
}

function buildSubstation(M, key, p) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    box(g, M.ink, 26, 3, 20, 0, 1.5, 0);
    box(g, M.body, 23, 7, 17, 0, 5, 0);
    const rotor = new THREE.Group(); rotor.position.set(0, 12, -1); g.add(rotor);
    cylinder(rotor, M.tech, 5, 5, 18, 14, 0, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const coil = box(rotor, i % 2 ? M.white : M.hazard, 20, 1.4, 2,
            0, Math.cos(a) * 7, Math.sin(a) * 7);
        coil.rotation.x = a;
    }
    for (const x of [-11, 11]) {
        box(g, M.steel, 2, 23, 2, x, 11.5, 7);
        box(g, M.hazard, 3, 1, 20, x, 22.5, -2);
    }
    box(g, M.ink, 12, 6, 7, 0, 3.5, 13);
    box(g, M.screen, 8, 4, 0.7, 0, 7, 16.3, false);
    worldRoot.add(g); substationRotors[key] = rotor;
    recordProp(`substation-${key.toLowerCase()}`, p, 13, 10, 24, true);
}

function buildMotorPoolProps(M, add) {
    for (const [c, r, yaw] of [[53, 16, 0.2], [58, 35, -0.35]]) {
        const p = cellPos(c, r);
        const suv = buildFuturisticSUVMesh(7, PAL.gunmetal);
        suv.position.set(p.x, 0, p.z); suv.rotation.y = yaw; worldRoot.add(suv);
        recordProp('armored-vehicle', p, 12, 20, 13, true);
    }
    for (const [c, r, yaw] of [[52, 25, 0], [59, 28, 0], [55, 40, Math.PI / 2]]) {
        const p = cellPos(c, r);
        const b = add(yaw ? 5 : 30, 7, yaw ? 30 : 5, p.x, 3.5, p.z, M.concrete);
        b.rotation.y = 0;
        add(yaw ? 6 : 31, 1.2, yaw ? 31 : 6, p.x, 7.6, p.z, M.hazard);
        recordProp('blast-barricade', p, yaw ? 3 : 15.5, yaw ? 15.5 : 3, 8, true);
    }
    for (const [c, r] of [[59, 13], [52, 37]]) {
        const p = cellPos(c, r);
        add(23, 13, 14, p.x, 6.5, p.z, M.body);
        for (const x of [-8, 0, 8]) add(1, 11, 15, p.x + x, 6.5, p.z, M.steel);
        recordProp('military-container', p, 11.5, 7, 14, true);
    }
}

function buildCommandProps(M, add) {
    for (const [c, r] of [[64, 24], [70, 27], [65, 35], [71, 39]]) {
        const p = cellPos(c, r);
        add(22, 3, 12, p.x, 3.5, p.z, M.body);
        add(18, 1, 9, p.x, 5.5, p.z, M.tech);
        for (const x of [-8, 8]) add(2, 4, 2, p.x + x, 1.8, p.z, M.steel);
        recordProp('operations-table', p, 11, 6, 6, true);
    }
    for (const [c, r] of [[63, 20], [73, 21], [63, 42], [73, 42], [67, 6], [72, 6]]) {
        const p = cellPos(c, r);
        add(10, 20, 8, p.x, 10, p.z, M.ink);
        add(8, 17, 0.7, p.x, 10, p.z + 4.3, M.screen);
        for (const y of [4, 9, 14]) add(6, 0.6, 0.8, p.x, y, p.z + 4.8, M.amber);
        recordProp('server-rack', p, 5, 4, 20, true);
    }
}

function buildUplink(M) {
    const g = new THREE.Group(); g.position.set(UPLINK_OBJECT.x, 0, UPLINK_OBJECT.z);
    cylinder(g, M.ink, 18, 18, 3, 24, 0, 1.5, 0);
    cylinder(g, M.body, 13, 16, 6, 20, 0, 5, 0);
    uplinkRings = new THREE.Group(); uplinkRings.position.y = 15; g.add(uplinkRings);
    torus(uplinkRings, M.steel, 10, 1.2, 0, 0, 0, Math.PI / 2);
    torus(uplinkRings, M.hazard, 7, 0.8, 0, 0, 0, 0, Math.PI / 2);
    torus(uplinkRings, M.tech, 4, 0.7, 0, 0, 0, Math.PI / 3, Math.PI / 4);
    cylinder(g, M.tech, 2.5, 2.5, 18, 12, 0, 14, 0);
    box(g, M.ink, 16, 7, 7, -18, 4, 0);
    const top = box(g, M.body, 17, 2, 8, -18, 8, 0); top.rotation.z = -0.12;
    uplinkScreen = box(g, M.screen, 0.8, 6, 12, -26.2, 10, 0, false); uplinkScreen.rotation.z = -0.12;
    for (const z of [-4, 0, 4]) box(g, M.amber, 0.9, 1, 1.3, -26.7, 5, z, false);
    worldRoot.add(g); recordProp('central-uplink', UPLINK_OBJECT, 18, 18, 23, true);
}

function buildRain(M) {
    const zones = [
        { x0: cellPos(1, 20).x, x1: cellPos(9, 20).x, z0: cellPos(1, 20).z, z1: cellPos(1, 33).z },
        { x0: cellPos(50, 11).x, x1: cellPos(60, 11).x, z0: cellPos(50, 11).z, z1: cellPos(50, 42).z },
    ];
    for (let i = 0; i < 64; i++) {
        const zone = zones[i % zones.length];
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 9, 0.16), M.rain);
        m.userData.rainZone = zone;
        m.position.set(rand(zone.x0, zone.x1), rand(5, 55), rand(zone.z0, zone.z1));
        m.visible = true; worldRoot.add(m); rainDrops.push(m);
    }
    for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 2.4), M.spark);
        m.visible = true; worldRoot.add(m); sparkPool.push(m);
    }
}

function buildWorld() {
    worldRoot = new THREE.Group(); scene.add(worldRoot);
    const M = {
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        floor: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        wet: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        tech: new THREE.MeshLambertMaterial({ color: PAL.techDim, emissive: PAL.tech,
            emissiveIntensity: EMISSIVE_MAX * 0.55 }),
        amber: new THREE.MeshLambertMaterial({ color: PAL.amberDim, emissive: PAL.amber,
            emissiveIntensity: EMISSIVE_MAX * 0.48 }),
        screen: new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.techDim,
            emissiveIntensity: 0.28 }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true, opacity: 0.68 }),
        rain: new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true, opacity: 0.34,
            toneMapped: false, depthWrite: false }),
        spark: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    };
    const staticProps = [];
    const add = (sx, sy, sz, x, y, z, mat = M.concrete) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        staticProps.push(m); return m;
    };

    add(MAP_COLS * CELL, 1.5, MAP_ROWS * CELL, OX, -0.75, OZ, M.concrete);
    // Matte floor blocks distinguish architecture, not gameplay/safe status.
    const addFloor = (c0, r0, c1, r1, mat) => {
        const a = cellPos(c0, r0), b = cellPos(c1, r1);
        add((c1 - c0 + 1) * CELL, 0.45, (r1 - r0 + 1) * CELL,
            (a.x + b.x) / 2, 0.05, (a.z + b.z) / 2, mat);
    };
    addFloor(1, 20, 9, 33, M.wet);
    addFloor(11, 8, 26, 44, M.floor);
    addFloor(28, 24, 48, 30, M.wet);
    addFloor(37, 12, 46, 21, M.floor);
    addFloor(37, 33, 46, 42, M.floor);
    addFloor(50, 11, 60, 42, M.wet);
    addFloor(62, 19, 73, 43, M.floor);
    addFloor(66, 5, 73, 17, M.ink);

    for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) {
        if (S6_MAP[r][c] !== '#') continue;
        const p = cellPos(c, r);
        // Platform edge is visually open toward the parked train; collision remains.
        if (!(c === 0 && r >= 18 && r <= 35)) add(CELL, WALL_H, CELL, p.x, WALL_H / 2, p.z, M.body);
        addBlocker(p.x, p.z, CELL / 2, CELL / 2, WALL_H);
    }

    buildParkedTrain(M, add);
    buildTerminalProps(M, add);
    buildTunnelProps(M, add);
    buildMotorPoolProps(M, add);
    buildCommandProps(M, add);

    // Mountain silhouettes beyond the north edge make the Bandung setting readable.
    for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(80 + (i % 3) * 25, 120 + (i % 2) * 45, 5),
            i % 2 ? M.ink : M.body);
        m.position.set(MAP_X0 + 90 + i * 135, 45, MAP_Z0 - 135 - (i % 3) * 30);
        m.rotation.y = i * 0.37; m.receiveShadow = true; staticProps.push(m);
    }

    // Signage uses procedural canvas textures; no external assets.
    const terminalSign = new THREE.Mesh(new THREE.BoxGeometry(76, 16, 1.2),
        new THREE.MeshBasicMaterial({ color: PAL.white,
            map: signTexture('BANDUNG LOGISTICS TERMINAL', 'MILITARY FREIGHT LINE'), toneMapped: false }));
    const tsp = cellPos(12, 20); terminalSign.position.set(tsp.x, 22, tsp.z); staticProps.push(terminalSign);
    const hqSign = new THREE.Mesh(new THREE.BoxGeometry(58, 16, 1.2),
        new THREE.MeshBasicMaterial({ color: PAL.white,
            map: signTexture('BANDUNG HEADQUARTERS', 'WEST WING — CENTRAL UPLINK'), toneMapped: false }));
    const hsp = cellPos(61, 24); hqSign.position.set(hsp.x + 3, 22, hsp.z); hqSign.rotation.y = Math.PI / 2;
    staticProps.push(hqSign);

    staticBatch = addMergedStatic(worldRoot, staticProps);
    buildControlConsole(M);
    buildSubstation(M, 'A', SUBSTATION_OBJECTS.A);
    buildSubstation(M, 'B', SUBSTATION_OBJECTS.B);
    buildUplink(M);
    for (const spec of DOOR_LAYOUT) addDoor(M, spec);

    stationMarker = markerAt(S6_STATION_CONTROL, PAL.tech);
    subMarkerA = markerAt(S6_SUBSTATION_A, PAL.amber);
    subMarkerB = markerAt(S6_SUBSTATION_B, PAL.amber);
    uplinkMarker = markerAt(S6_UPLINK, PAL.amber);
    buildRain(M);

    const lampCells = [[4, 27], [14, 14], [22, 35], [31, 27], [42, 27],
        [42, 16], [42, 38], [55, 18], [56, 36], [66, 27], [70, 11]];
    for (const [c, r] of lampCells) {
        const p = cellPos(c, r), L = new THREE.PointLight(r < 20 ? PAL.tech : PAL.amber, 0.46, 135);
        L.position.set(p.x, 24, p.z); scene.add(L); registerStageLight('campaign-6', L); stageLights.push(L);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6),
            new THREE.MeshBasicMaterial({ color: r < 20 ? PAL.tech : PAL.amber, toneMapped: false }));
        bulb.position.copy(L.position); worldRoot.add(bulb);
    }

    navGrid = makeNavGrid(MAP_X0, MAP_Z0, CELL, MAP_COLS, MAP_ROWS,
        (x, z) => robotWalk(x, z, 4) && !blockedAt(x, z, 3.5));
}

export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;
export const stage6StaticBatchDbg = () => staticBatch;

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}

function beginLockdown() {
    if (lockdown) return;
    lockdown = true; phase = 'lockdown'; hideDownloadBar(); interactionKind = '';
    for (const d of doors) d.target = 0;
    for (const L of stageLights) { L.color.setHex(PAL.hazard); L.intensity = 0.54; }
    if (uplinkScreen) {
        uplinkScreen.material.color.setHex(PAL.hazard);
        uplinkScreen.material.emissive.setHex(PAL.hazard);
        uplinkScreen.material.emissiveIntensity = EMISSIVE_MAX;
    }
    activateSparks(UPLINK_OBJECT, 5);
    addCamShake(3.2);
}

function onDialogueStart(key) {
    if (key === 'lockdownWarning') beginLockdown();
}

function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null;
    dialogueT = 0; dialogueChars = 0;
    if (dialogueCurrent) onDialogueStart(dialogueCurrent.key);
    else setAvatarRadioPose(false);
    renderDialogue();
}

function queueDialogue(key, repeat = false) {
    const line = STAGE6_DIALOGUE[key];
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
    let n = 0;
    for (const z of robots) if (z.stage === 6 && z.encounter === name) n++;
    return n;
}

function spawnOne(cls, p, encounter, active = true) {
    spawnCampaignRobot(p.x + rand(-2.5, 2.5), p.z + rand(-2.5, 2.5), 6, cls, active);
    const z = robots[robots.length - 1]; z.encounter = encounter;
    return z;
}

function spawnEncounter(name, counts, active = true) {
    const spots = ENCOUNTER_POINTS[name];
    if (!spots || !counts) return 0;
    let k = 0;
    for (const cls of ['C', 'B', 'A']) {
        for (let i = 0; i < Math.max(0, counts[cls] | 0); i++, k++) {
            const s = spots[k % spots.length];
            spawnOne(cls, cellPos(s[0], s[1]), name, active);
        }
    }
    return k;
}

function wakeTerminal() {
    if (terminalAwake) return;
    terminalAwake = true; queueDialogue('leaveSafe');
    for (const z of robots) if (z.stage === 6 && z.encounter === 'terminal') {
        z.state = 'chasing'; z.moving = false; z.aiming = false;
    }
}

function placeSupplies() {
    for (const p of SUPPLY_POINTS) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}

function placeCrates() { for (const p of CRATE_POINTS) spawnCrate(p.x, p.z, 0); }

function activateSparks(center, sec = 2.5) {
    sparkT = Math.max(sparkT, sec);
    for (let i = 0; i < sparkPool.length; i++) {
        const s = sparkPool[i], a = i / sparkPool.length * Math.PI * 2;
        s.position.set(center.x + Math.sin(a) * rand(2, 11), rand(4, 19), center.z + Math.cos(a) * rand(2, 11));
        s.rotation.y = a; s.userData.vx = Math.sin(a) * rand(3, 10);
        s.userData.vy = rand(6, 15); s.userData.vz = Math.cos(a) * rand(3, 10); s.visible = true;
    }
}

function updateFx(dt) {
    for (const d of rainDrops) {
        d.position.y -= dt * 75;
        if (d.position.y < 0) {
            const z = d.userData.rainZone;
            d.position.set(rand(z.x0, z.x1), rand(42, 62), rand(z.z0, z.z1));
        }
    }
    if (sparkT > 0) {
        sparkT = Math.max(0, sparkT - dt);
        for (const s of sparkPool) {
            s.position.x += (s.userData.vx || 0) * dt;
            s.position.y += (s.userData.vy || 0) * dt;
            s.position.z += (s.userData.vz || 0) * dt;
            s.userData.vy = (s.userData.vy || 0) - dt * 30;
            s.rotation.x += dt * 8;
            if (s.position.y < 0.3) s.visible = false;
        }
    } else for (const s of sparkPool) s.visible = false;
}

function pulseMarkers(dt) {
    const t = Date.now() * 0.004;
    const list = [stationMarker, subMarkerA, subMarkerB, uplinkMarker];
    for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m?.visible) { m.material.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t + i)); m.rotation.z += dt * 0.8; }
    }
}

function updateMachinery(dt) {
    if (substationRotors.A) substationRotors.A.rotation.x += dt * (substation.A ? 2.2 : 0.12);
    if (substationRotors.B) substationRotors.B.rotation.x += dt * (substation.B ? 2.2 : 0.12);
    if (uplinkRings) {
        uplinkRings.rotation.y += dt * (uploadFailed ? 0.25 : (phase === 'upload' ? 1.8 : 0.35));
        uplinkRings.rotation.z += dt * (uploadFailed ? -0.18 : 0.22);
    }
    if (stationScreen && stationAccessed) stationScreen.material.emissiveIntensity = 0.42 + Math.sin(stageElapsed * 2) * 0.08;
}

function hideInteraction() { interactionKind = ''; hideDownloadBar(); }

function updateStationControl(dt) {
    const C = CFG.campaign.stage6;
    const near = Math.hypot(camera.position.x - S6_STATION_CONTROL.x,
        camera.position.z - S6_STATION_CONTROL.z) < C.stationControlRange;
    if (!near) {
        if (interactionKind === 'station') hideInteraction();
        stationAccessT = 0; return;
    }
    if (interactionKind !== 'station') { interactionKind = 'station'; showDownloadBar('AUTHORIZING MILITARY CORRIDOR'); }
    stationAccessT = Math.min(C.stationAccessSec, stationAccessT + dt);
    setDownloadProgress(stationAccessT / Math.max(0.01, C.stationAccessSec));
    if (stationAccessT < C.stationAccessSec) return;
    stationAccessed = true; phase = 'tunnel'; hideInteraction(); stationMarker.visible = false;
    door('tunnel').target = 1;
    queueDialogue('corridorUnlocked');
    spawnEncounter('tunnel', C.encounters.tunnel, true); tunnelSpawned = true;
    showStageMsg('MILITARY CORRIDOR OPEN — PUSH THROUGH THE SERVICE TUNNEL', 4300);
    activateSparks(S6_STATION_CONTROL, 1.8);
}

function nodeForPlayer() {
    const C = CFG.campaign.stage6;
    for (const key of ['A', 'B']) {
        const p = key === 'A' ? S6_SUBSTATION_A : S6_SUBSTATION_B;
        if (Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < C.substationRange) return key;
    }
    return null;
}

function updateSubstations(dt) {
    const C = CFG.campaign.stage6;
    const px = camera.position.x, pz = camera.position.z;
    if (!subSpawned.A && mapCellAt(px, pz).r >= 12 && mapCellAt(px, pz).r <= 21) {
        subSpawned.A = true; spawnEncounter('substationA', C.encounters.substationA, true);
    }
    if (!subSpawned.B && mapCellAt(px, pz).r >= 33 && mapCellAt(px, pz).r <= 42) {
        subSpawned.B = true; spawnEncounter('substationB', C.encounters.substationB, true);
    }
    const key = nodeForPlayer();
    for (const k of ['A', 'B']) if (k !== key && !substation[k]) subProgress[k] = 0;
    if (!key || substation[key]) { if (interactionKind.startsWith('substation')) hideInteraction(); return; }
    const encounter = key === 'A' ? 'substationA' : 'substationB';
    if (countEncounter(encounter) > 0) return;
    const ik = `substation-${key}`;
    if (interactionKind !== ik) { interactionKind = ik; showDownloadBar(`SYNCHRONIZING EMERGENCY SUBSTATION ${key}`); }
    subProgress[key] = Math.min(C.substationSyncSec, subProgress[key] + dt);
    setDownloadProgress(subProgress[key] / Math.max(0.01, C.substationSyncSec));
    if (subProgress[key] < C.substationSyncSec) return;
    substation[key] = true; hideInteraction(); activateSparks(key === 'A' ? S6_SUBSTATION_A : S6_SUBSTATION_B, 2.5);
    if (key === 'A') subMarkerA.visible = false; else subMarkerB.visible = false;
    showStageMsg(`EMERGENCY SUBSTATION ${key} ONLINE`, 2800);
    if (substation.A && substation.B
        && countEncounter('substationA') === 0 && countEncounter('substationB') === 0) {
        queueDialogue('gridRestored'); door('bulkhead').target = 1;
        phase = 'hqPerimeter';
        spawnEncounter('hqPerimeter', C.encounters.hqPerimeter, true); hqSpawned = true;
        showStageMsg('GRID RESTORED — BREACH BANDUNG HEADQUARTERS', 4300);
    }
}

function cleanupCine(revealSec = 0) {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, revealSec); setCinematicActive(false); setAvatarRadioPose(false);
}

function finishOpening(skipped = false) {
    if (skipped) resetDialogue();
    cleanupCine(CFG.campaign.stage6.fadeSec); phase = 'clearTerminal';
    showStageMsg('SECURE BANDUNG LOGISTICS TERMINAL', 4200);
}

function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0); hideStageRadioDialogue();
    cine = { kind: 'opening', t: 0, dialogueStarted: false, fading: false, fadeT: 0 };
    cineCam.x = -104; cineCam.y = 92; cineCam.z = 112;
    setCineFocus(S6_START.x + CELL * 2, S6_START.z, true);
    showCutsceneSkip(() => finishOpening(true));
}

function failUpload() {
    if (uploadFailed) return;
    const C = CFG.campaign.stage6;
    uploadFailed = true; uploadProgress = C.uploadFailFraction;
    showDownloadBar('UPLOAD FAILED — AUTHORITY DENIED'); setDownloadProgress(uploadProgress);
    if (uplinkScreen) {
        uplinkScreen.material.color.setHex(PAL.hazard);
        uplinkScreen.material.emissive.setHex(PAL.hazard);
        uplinkScreen.material.emissiveIntensity = EMISSIVE_MAX;
    }
    activateSparks(UPLINK_OBJECT, 3.5); addCamShake(2.8);
    for (const key of ['uploadFailed', 'gibranFailure', 'commandIKN', 'gibranIKN',
        'commandKertajati', 'lockdownWarning', 'commandEscape', 'gibranResolve']) queueDialogue(key);
    cine.stage = 'failure'; cine.stageT = 0;
}

function finishStage() {
    if (complete) return;
    complete = true; phase = 'complete'; uploadProgress = CFG.campaign.stage6.uploadFailFraction;
    uploadFailed = true; lockdown = true;
    resetDialogue(); hideInteraction(); cleanupCine(0);
    gameOver(true, 'TO BE CONTINUED', { preserveCampaignSave: true });
}

function startUpload() {
    if (cine || phase !== 'uploadReady') return;
    phase = 'upload'; releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'upload', stage: 'brief', t: 0, stageT: 0, fading: false, fadeT: 0 };
    cineCam.x = -48; cineCam.y = 58; cineCam.z = 62;
    setCineFocus(UPLINK_OBJECT.x - 5, UPLINK_OBJECT.z, true);
    uplinkMarker.visible = false; uploadProgress = 0; uploadFailed = false;
    queueDialogue('insertCommand'); queueDialogue('uploadSystem');
    showCutsceneSkip(finishStage);
}

function syncUploadPose() {
    if (!uploadFailed || !dialogueCurrent) { setAvatarRadioPose(false); return; }
    const p = dialogueCurrent.text.length ? dialogueChars / dialogueCurrent.text.length : 1;
    let gesture = 'commandNoExfil';
    if (dialogueCurrent.key === 'gibranFailure' || dialogueCurrent.key === 'gibranIKN') gesture = 'gibranShock';
    else if (dialogueCurrent.key === 'gibranResolve') gesture = 'gibranAccepts';
    setAvatarRadioPose(true, -Math.PI / 2, gesture, p);
}

function updateCine(dt) {
    if (!cine) return;
    cine.t += dt; cine.stageT = (cine.stageT || 0) + dt;
    const C = CFG.campaign.stage6;
    if (cine.kind === 'opening') {
        const k = Math.min(1, cine.t / Math.max(1, C.openingMinSec));
        cineCam.x = -104 + 27 * k; cineCam.y = 92 + 18 * k; cineCam.z = 112 - 25 * k;
        setCineFocus(S6_START.x + CELL * (2 + k * 2), S6_START.z - CELL * k, true);
        if (!cine.dialogueStarted && cine.t >= C.openingDialogueDelaySec) {
            cine.dialogueStarted = true;
            queueDialogue('arrivalSystem'); queueDialogue('arrivalCommand'); queueDialogue('arrivalGibran');
        }
        if (!cine.fading && cine.dialogueStarted && cine.t >= C.openingMinSec
            && !dialogueCurrent && !dialogueQueue.length) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishOpening(false);
        return;
    }
    if (cine.kind !== 'upload') return;
    syncUploadPose();
    if (cine.stage === 'brief') {
        cineCam.x = -48 + Math.sin(cine.t * 0.35) * 3;
        if (!dialogueCurrent && !dialogueQueue.length) {
            cine.stage = 'transfer'; cine.stageT = 0;
            showDownloadBar('UPLOADING KILL-SWITCH'); setDownloadProgress(0);
        }
    } else if (cine.stage === 'transfer') {
        const k = Math.min(1, cine.stageT / Math.max(0.01, C.uploadSec));
        uploadProgress = C.uploadFailFraction * k; setDownloadProgress(uploadProgress);
        cineCam.x = -48 - k * 14; cineCam.y = 58 + k * 16; cineCam.z = 62 - k * 10;
        if (k >= 1) failUpload();
    } else if (cine.stage === 'failure') {
        const k = Math.min(1, cine.stageT / 10);
        cineCam.x = -62 - k * 15; cineCam.y = 74 + k * 14; cineCam.z = 52 + k * 26;
        if (lockdown) setCineFocus(camera.position.x, camera.position.z, true);
        if (!cine.fading && lockdown && !dialogueCurrent && !dialogueQueue.length
            && cine.stageT >= C.lockdownTailSec) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishStage();
    }
}

function resetStage() {
    phase = 'opening'; terminalAwake = false; stationAccessT = 0; stationAccessed = false;
    tunnelSpawned = false; hqSpawned = false; commandSpawned = false; reinforcementSpawned = false;
    substation = { A: false, B: false }; subProgress = { A: 0, B: 0 }; subSpawned = { A: false, B: false };
    uploadProgress = 0; uploadFailed = false; lockdown = false; complete = false;
    interactionKind = ''; sparkT = 0; stageElapsed = 0;
    resetDialogue(); hideDownloadBar();
    if (cine) cleanupCine(0);
    for (const d of doors) { d.open = 0; d.target = 0; d.panel.position.y = (WALL_H - 2) / 2; d.lamp.material.color.setHex(PAL.hazard); }
    const arrival = door('operations'); if (arrival) arrival.target = 0;
    stationMarker.visible = subMarkerA.visible = subMarkerB.visible = uplinkMarker.visible = false;
    if (stationScreen) { stationScreen.material.color.setHex(PAL.screenBg); stationScreen.material.emissive.setHex(PAL.techDim); stationScreen.material.emissiveIntensity = 0.28; }
    if (uplinkScreen) { uplinkScreen.material.color.setHex(PAL.screenBg); uplinkScreen.material.emissive.setHex(PAL.techDim); uplinkScreen.material.emissiveIntensity = 0.28; }
    for (const L of stageLights) { L.color.setHex(PAL.amber); L.intensity = 0.46; }
    for (const s of sparkPool) s.visible = false;
}

export const stage6DialogueDebug = () => ({
    key: dialogueCurrent?.key || null,
    speaker: dialogueCurrent?.speaker || '', text: dialogueCurrent?.text || '',
    chars: dialogueChars,
    shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
    typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
    queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen],
});

export const stage6Debug = () => ({
    phase, objective: stage6Scene.hudStatus(), stageElapsed,
    terminalAwake, stationAccessT, stationAccessed, tunnelSpawned,
    substation: { ...substation }, subProgress: { ...subProgress }, subSpawned: { ...subSpawned },
    bulkheadOpen: door('bulkhead')?.open || 0,
    hqSpawned, commandSpawned, reinforcementSpawned,
    uploadProgress, uploadFailed, lockdown, complete,
    interaction: interactionKind, robots: countStageRobots(6),
    encounters: Object.fromEntries(Object.keys(ENCOUNTER_POINTS).map(k => [k, countEncounter(k)])),
});

export const stage6WorldDebug = () => ({
    built,
    map: { rows: MAP_ROWS, cols: MAP_COLS, cell: CELL,
        walls: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === '#').length, 0),
        safe: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'A' || t === 'S').length, 0) },
    start: { ...S6_START }, stationControl: { ...S6_STATION_CONTROL },
    substations: { A: { ...S6_SUBSTATION_A }, B: { ...S6_SUBSTATION_B } },
    hqEntrance: { ...S6_HQ_ENTRANCE }, uplink: { ...S6_UPLINK },
    blockers: blockers.length, props: propRecords.map(p => ({ ...p })),
    propKinds: [...new Set(propRecords.map(p => p.kind))],
    doors: doors.map(d => ({ kind: d.kind, open: d.open, target: d.target,
        x: d.blocker.x, z: d.blocker.z })),
    pools: { rain: rainDrops.length, sparks: sparkPool.length },
    visiblePools: { rain: rainDrops.filter(x => x.visible).length, sparks: sparkPool.filter(x => x.visible).length },
    lights: stageLights.length, nav: !!navGrid, staticBatches: staticBatch.length,
    supplies: SUPPLY_POINTS.map(p => ({ ...p })), crates: CRATE_POINTS.map(p => ({ ...p })),
});

export const stage6Scene = {
    id: 'campaign-6',
    lightsKey: 'campaign-6',

    enter() {
        saveCampaignStage(6); ensureWorld();
        for (let i = robots.length - 1; i >= 0; i--) {
            disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
        resetCrates(); resetStage();
        spawnEncounter('terminal', CFG.campaign.stage6.encounters.terminal, false);
        placeSupplies(); placeCrates();
        applyLightPreset(scene, 'night'); exitCityEnv();
        camera.position.set(S6_START.x, CFG.player.eyeHeight, S6_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening(); updateUI();
    },

    exit() {
        resetDialogue(); hideInteraction();
        if (cine) cleanupCine(0);
        setAvatarRadioPose(false);
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,

    updateMode(dt) {
        stageElapsed += dt;
        updateDialogue(dt); updateCine(dt); updateDoors(dt); updateFx(dt); pulseMarkers(dt); updateMachinery(dt);
        if (cine || complete) { updateUI(); return; }

        if (phase === 'clearTerminal') {
            if (!terminalAwake && !touchesSafeArea(camera.position.x, camera.position.z, player.radius)) wakeTerminal();
            if (terminalAwake && countEncounter('terminal') === 0) {
                phase = 'stationControl'; stationMarker.visible = true; door('operations').target = 1;
                showStageMsg('TERMINAL SECURED — ACCESS STATION OPERATIONS', 4200);
            }
        } else if (phase === 'stationControl') {
            updateStationControl(dt);
        } else if (phase === 'tunnel') {
            if (tunnelSpawned && countEncounter('tunnel') === 0
                && camera.position.x >= cellPos(38, 27).x) {
                phase = 'restoreGrid'; subMarkerA.visible = subMarkerB.visible = true;
                queueDialogue('bulkheadCommand'); queueDialogue('bulkheadGibran');
                showStageMsg('RESTORE BOTH EMERGENCY SUBSTATIONS — 0/2', 4300);
            }
        } else if (phase === 'restoreGrid') {
            updateSubstations(dt);
        } else if (phase === 'hqPerimeter') {
            if (!dialogueSeen.has('hqCommand') && camera.position.x >= S6_HQ_ENTRANCE.x - CELL) {
                queueDialogue('hqCommand'); queueDialogue('hqGibran');
            }
            if (hqSpawned && countEncounter('hqPerimeter') === 0) {
                phase = 'commandFloor'; door('command').target = 1;
                spawnEncounter('commandFloor', CFG.campaign.stage6.encounters.commandFloor, true);
                commandSpawned = true;
                showStageMsg('MOTOR POOL SECURED — REACH THE COMMAND FLOOR', 4200);
            }
        } else if (phase === 'commandFloor') {
            if (commandSpawned && !reinforcementSpawned && countEncounter('commandFloor') === 0) {
                reinforcementSpawned = true;
                spawnEncounter('commandReinforcement', CFG.campaign.stage6.encounters.commandReinforcement, true);
                showStageMsg('HOSTILE REINFORCEMENTS — PROTECT THE DATA VAULT', 3600);
            } else if (reinforcementSpawned && countEncounter('commandReinforcement') === 0) {
                phase = 'uploadReady'; door('vault').target = 1; uplinkMarker.visible = true;
                showStageMsg('COMMAND FLOOR SECURED — UPLOAD THE KILL-SWITCH', 4400);
            }
        } else if (phase === 'uploadReady') {
            if (Math.hypot(camera.position.x - S6_UPLINK.x, camera.position.z - S6_UPLINK.z)
                < CFG.campaign.stage6.uplinkRange) startUpload();
        }
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage6Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius);
        slideWalk(stage6Walk, pos, oldX, oldZ, player.radius);
    },
    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        if (b.mesh.position.y >= WALL_H) return false;
        return stage6SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
            || doorBlocksShot(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        if (y >= WALL_H) return false;
        return stage6SegHitsWall(x0, z0, x1, z1) || doorBlocksShot(x0, z0, x1, z1);
    },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage6Walk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },
    robotAI(z, dt, step) {
        if (z.encounter === 'terminal' && !terminalAwake) {
            z.state = 'idle'; z.moving = false; z.aiming = false; return {};
        }
        return campaignRobotAI(z, dt, step, { walkable: robotWalk, resolve, nav: navGrid });
    },
    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: robotWalk, resolve });
    },
    clampDropPos(x, z) {
        if (stage6Walk(x, z, 2)) return [x, z];
        return [S6_START.x, S6_START.z];
    },
    hudStatus() {
        if (phase === 'opening') return 'STAGE 6 — FALSE HOMECOMING';
        if (phase === 'clearTerminal' && !terminalAwake) return 'ARRIVAL PLATFORM — MOVE OUT WHEN READY';
        if (phase === 'clearTerminal') return `SECURE BANDUNG TERMINAL — Robots: ${countEncounter('terminal')}`;
        if (phase === 'stationControl') return `ACCESS STATION OPERATIONS — ${Math.round(stationAccessT / Math.max(0.01, CFG.campaign.stage6.stationAccessSec) * 100)}%`;
        if (phase === 'tunnel') return `PUSH THROUGH THE SERVICE TUNNEL — Robots: ${countEncounter('tunnel')}`;
        if (phase === 'restoreGrid') return `EMERGENCY GRID — ${Number(substation.A) + Number(substation.B)}/2 SUBSTATIONS`;
        if (phase === 'hqPerimeter') return `BREACH BANDUNG HEADQUARTERS — Robots: ${countEncounter('hqPerimeter')}`;
        if (phase === 'commandFloor') return `SECURE THE COMMAND FLOOR — Robots: ${countStageRobots(6)}`;
        if (phase === 'uploadReady') return 'CENTRAL UPLINK — UPLOAD THE KILL-SWITCH';
        if (phase === 'upload') return `KILL-SWITCH UPLOAD — ${Math.round(uploadProgress * 100)}%`;
        if (phase === 'lockdown') return 'HEADQUARTERS LOCKDOWN — ENEMY TRACE CONFIRMED';
        return 'UPLOAD FAILED — ROUTE TO IKN REQUIRED';
    },
    radarLandmarks(plot) {
        let p = null;
        if (phase === 'stationControl') p = S6_STATION_CONTROL;
        else if (phase === 'tunnel') p = cellPos(48, 27);
        else if (phase === 'restoreGrid') p = !substation.A ? S6_SUBSTATION_A : (!substation.B ? S6_SUBSTATION_B : cellPos(49, 27));
        else if (phase === 'hqPerimeter') p = S6_HQ_ENTRANCE;
        else if (phase === 'commandFloor') p = cellPos(69, 19);
        else if (phase === 'uploadReady') p = S6_UPLINK;
        if (p) plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
