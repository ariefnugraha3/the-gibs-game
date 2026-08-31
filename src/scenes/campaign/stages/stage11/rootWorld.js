// Stage 11 root chapter — monumental national transmitter chamber.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStaticShadowAware } from '../../../../utils/meshBatch.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { buildStandMarker, pulseStandMarker } from '../../utility/common.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, updateSpawnMachine, spawnMachineDebug,
} from '../../../../entities/spawnMachine.js';

export const STAGE11_ROOT_LIGHTS_KEY = 'campaign-11-root';
export const S11_ROOT_ORIGIN = Object.freeze({ x: 400000, z: 0 });
export const S11_ARENA = Object.freeze({ x: 399950, z: 0, radius: 315 });
export const S11_ROOT_CORRIDOR_METERS = 100;
export const S11_ROOT_ENCOUNTER_METER = 50;
// The hall door is exactly 100 metres down the clear approach from spawn.
// Progress runs toward world -X, matching the chapter's upper-left camera.
export const S11_AUTHORITY_GATE = Object.freeze({
    x: S11_ARENA.x + S11_ARENA.radius, z: 0,
});
export const S11_ROOT_START = Object.freeze({
    x: S11_AUTHORITY_GATE.x + S11_ROOT_CORRIDOR_METERS * CAMP_M, z: 0,
});
export const S11_ROOT_ENCOUNTER = Object.freeze({
    x: S11_ROOT_START.x - S11_ROOT_ENCOUNTER_METER * CAMP_M, z: 0,
});
export const S11_DOOR_TERMINAL = Object.freeze({
    x: S11_AUTHORITY_GATE.x + 34, z: -69,
});
export const S11_DOOR_STAND = Object.freeze({
    x: S11_AUTHORITY_GATE.x + 48, z: -69,
});
// The physical computer now occupies the exact centre of the circular hall.
// Its amber stand point is on the approach side, outside the solid pedestal.
export const S11_INSERT = Object.freeze({ x: S11_ARENA.x, z: S11_ARENA.z });
export const S11_INSERT_STAND = Object.freeze({ x: S11_INSERT.x + 31, z: S11_INSERT.z });
export const S11_WARDEN_HOME = Object.freeze({ x: S11_ARENA.x - 165, z: 0 });

// The computer dais reaches y=8.8. Keep the upload pad on its visible top;
// placing it at the chapter's nominal y=0 floor buries it inside the dais.
const INSERT_DAIS_TOP = 8.8;
const INSERT_DAIS_UPPER_RADIUS = 51;
const INSERT_DAIS_UPPER_BASE_RADIUS = 57;
const INSERT_DAIS_LOWER_TOP = 6;
const INSERT_DAIS_LOWER_TOP_RADIUS = 58;
// The lower tapered cylinder intersects the y=0 hall floor at radius 64;
// its authored bottom radius 66 continues below the visible floor.
const INSERT_DAIS_FLOOR_RADIUS = 64;
const INSERT_FLOOR_SIZE = 26;
const INSERT_FLOOR_HEIGHT = .8;
const INSERT_FLOOR_Y = INSERT_DAIS_TOP + INSERT_FLOOR_HEIGHT * .5 + .04;
const INSERT_STAND_MARKER_Y = INSERT_DAIS_TOP + INSERT_FLOOR_HEIGHT + .06;

const BOUNDS = Object.freeze({ x0: 399540, x1: S11_ROOT_START.x + 120,
    z0: -470, z1: 470 });
const ARENA_R = S11_ARENA.radius;
export const S11_ROOT_OCC = 'campaign-11-root';   // utility/occlusion.js
let built = false;
let root = null;
let nav = null;
let authorityDoor = null;
let authorityDoorOpen = false;
let authorityDoorT = 0;
let doorHackMarker = null;
let consoleMarker = null;
let consoleFloorMarker = null;
let broadcastCore = null;
let doorTerminalScreen = null;
let doorTerminalCore = null;
let driveSlotGlow = null;
let broadcastBeacon = null;
const doorTerminalGlyphs = [];
const consoleScreens = [];
const consoleDataBars = [];
const broadcastRings = [];
const broadcastOrbiters = [];
let uploadVisual = 0;
let rawMeshes = 0;
let weldedMeshes = 0;
const blockers = [];
const approachMachines = [];
const lights = [];
const semantic = new Map();
const mats = {};

function material(name, color, opts = {}) {
    if (!mats[name]) mats[name] = new THREE.MeshLambertMaterial({
        color, emissive: opts.emissive || 0,
        emissiveIntensity: Math.min(EMISSIVE_MAX, opts.emissiveIntensity || 0),
        transparent: !!opts.transparent, opacity: opts.opacity == null ? 1 : opts.opacity,
        depthWrite: opts.depthWrite == null ? true : !!opts.depthWrite,
        flatShading: opts.flatShading == null ? true : !!opts.flatShading,
    });
    return mats[name];
}
function basicMaterial(name, color, opts = {}) {
    if (!mats[name]) mats[name] = new THREE.MeshBasicMaterial({
        color, transparent: !!opts.transparent,
        opacity: opts.opacity == null ? 1 : opts.opacity,
        depthWrite: opts.depthWrite == null ? true : !!opts.depthWrite,
        toneMapped: false,
    });
    return mats[name];
}
function count(k, n = 1) { semantic.set(k, (semantic.get(k) || 0) + n); }
function mesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0,
    cast = false, receive = false) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz); m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m); rawMeshes++; return m;
}
function blocker(x, z, hx, hz, top, yaw = 0, kind = 'structure') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    blockers.push({ x, z, hx, hz, top, axx: c, axz: s, azx: -s, azz: c,
        rad: Math.hypot(hx, hz), standable: false, yaw, kind });
}
function navBlocked(x, z, r = 0) {
    return blockers.some(b => {
        if (b.kind === 'authority-door') return false;
        const dx = x - b.x, dz = z - b.z;
        return Math.abs(dx * b.axx + dz * b.axz) <= b.hx + r
            && Math.abs(dx * b.azx + dz * b.azz) <= b.hz + r;
    });
}
function segBox(x0, z0, x1, z1, b) {
    const dx = x1 - x0, dz = z1 - z0;
    const n = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 7));
    for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + dx * t, z = z0 + dz * t;
        const qx = x - b.x, qz = z - b.z;
        if (Math.abs(qx * b.axx + qz * b.axz) <= b.hx
            && Math.abs(qx * b.azx + qz * b.azz) <= b.hz) return true;
    }
    return false;
}

export function stage11RootWalk(x, z, r = 0) {
    const inArena = Math.hypot(x - S11_ARENA.x, z - S11_ARENA.z) <= ARENA_R - r;
    const inApproach = x >= S11_AUTHORITY_GATE.x - r
        && x <= S11_ROOT_START.x + 82 - r && Math.abs(z) <= 104 - r;
    return inArena || inApproach;
}
export function stage11RootResolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
}
export function stage11RootSegBlocked(x0, z0, x1, z1) {
    return blockers.some(b => b.top >= 0 && segBox(x0, z0, x1, z1, b));
}
export function stage11RootGroundHeight(x, z) {
    const r = Math.hypot(x - S11_INSERT.x, z - S11_INSERT.z);
    if (r <= INSERT_DAIS_UPPER_RADIUS) return INSERT_DAIS_TOP;
    // Follow the upper tier's real tapered side until it meets the lower cap.
    if (r <= INSERT_DAIS_UPPER_BASE_RADIUS)
        return Math.max(INSERT_DAIS_LOWER_TOP,
            INSERT_DAIS_TOP - (r - INSERT_DAIS_UPPER_RADIUS)
            * ((INSERT_DAIS_TOP - 5.8)
                / (INSERT_DAIS_UPPER_BASE_RADIUS - INSERT_DAIS_UPPER_RADIUS)));
    if (r <= INSERT_DAIS_LOWER_TOP_RADIUS) return INSERT_DAIS_LOWER_TOP;
    // The lower 58->66 taper rises eight units; only its portion above the hall
    // floor (58->64) is walkable. Leaving it makes the normal gravity path fall.
    if (r < INSERT_DAIS_FLOOR_RADIUS)
        return INSERT_DAIS_LOWER_TOP
            * (INSERT_DAIS_FLOOR_RADIUS - r)
            / (INSERT_DAIS_FLOOR_RADIUS - INSERT_DAIS_LOWER_TOP_RADIUS);
    return 0;
}
export function stage11RootNav() { return nav; }
export function stage11RootMeterAt(x) {
    return Math.max(0, Math.min(S11_ROOT_CORRIDOR_METERS,
        (S11_ROOT_START.x - x) / CAMP_M));
}
export function stage11RootPointAtMeter(meter, lateral = 0) {
    return { x: S11_ROOT_START.x - Math.max(0,
        Math.min(S11_ROOT_CORRIDOR_METERS, meter)) * CAMP_M,
        z: lateral };
}

function buildShell() {
    const g = new THREE.Group();
    mesh(g, new THREE.CylinderGeometry(470, 490, 10, 36), material('foundation', PAL.ink),
        S11_ARENA.x, -5, 0, 0, 0, 0, false, true);
    mesh(g, new THREE.CylinderGeometry(330, 340, 5, 36), material('arenaFloor', 0x6f6c65),
        S11_ARENA.x, -1, 0, 0, 0, 0, false, true);
    for (const r of [92, 158, 232, 306]) {
        mesh(g, new THREE.TorusGeometry(r, 3.2, 7, 42), material('floorRing', PAL.amberDim,
            { emissive: PAL.amberDim, emissiveIntensity: .34 }),
        S11_ARENA.x, 1.5, 0, Math.PI / 2, 0, 0, false, false);
        count('concentric-authority-ring');
    }
    // The circular hall is deliberately unobstructed. The former twenty
    // buttress pillars, radial trusses and perimeter wall-like capacitor banks
    // were visual clutter that interrupted the Warden fight and are omitted.
    count('open-circular-hall');
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildThreshold() {
    const g = new THREE.Group();
    const corridorMid = (S11_ROOT_START.x + S11_AUTHORITY_GATE.x) * .5;
    const corridorLength = S11_ROOT_START.x - S11_AUTHORITY_GATE.x + 170;
    // One clean 100-metre floor: no walls, rails, columns or arches. Recessed
    // strips describe its edges without becoming collision or cover.
    mesh(g, new THREE.BoxGeometry(corridorLength, 5, 210),
        material('authorityBridge', PAL.panel), corridorMid + 22, -1, 0,
        0, 0, 0, false, true);
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(corridorLength - 28, 1.2, 5),
            material('corridorEdge', PAL.techDim,
                { emissive: PAL.techDim, emissiveIntensity: .32 }),
        corridorMid + 22, 2, side * 96, 0, 0, 0, false, false);
        for (let m = 10; m < 100; m += 10) {
            const p = stage11RootPointAtMeter(m, side * 88);
            mesh(g, new THREE.BoxGeometry(3, .8, 12),
                material('corridorMeter', m === 50 ? PAL.amber : PAL.steel,
                    m === 50 ? { emissive: PAL.amberDim, emissiveIntensity: .4 } : {}),
            p.x, 2.1, p.z, 0, 0, 0, false, false);
        }
    }

    // Monumental double sliding door. Both leaves remain in the scene and move
    // apart along Z after the Stage-1 ICE BREACH succeeds.
    const doorGroup = new THREE.Group();
    doorGroup.name = 'stage11-root-large-hall-door';
    root.add(doorGroup);
    const doorMat = material('authorityDoor', PAL.gunmetal);
    const left = mesh(doorGroup, new THREE.BoxGeometry(12, 82, 88), doorMat,
        S11_AUTHORITY_GATE.x, 41, -44, 0, 0, 0, true, true);
    const right = mesh(doorGroup, new THREE.BoxGeometry(12, 82, 88), doorMat,
        S11_AUTHORITY_GATE.x, 41, 44, 0, 0, 0, true, true);
    left.name = 'stage11-root-hall-door-left';
    right.name = 'stage11-root-hall-door-right';
    for (const leaf of [left, right]) for (let k = -3; k <= 3; k++)
        mesh(leaf, new THREE.BoxGeometry(2, 63, 4), material('doorRib', PAL.steel),
            6.2, 0, k * 11, 0, 0, 0, false, false);
    mesh(g, new THREE.BoxGeometry(24, 14, 204), material('doorHeader', PAL.ink),
        S11_AUTHORITY_GATE.x, 89, 0, 0, 0, 0, true, true);
    authorityDoor = { left, right, closedLeftZ: -44, closedRightZ: 44,
        slide: 78 };
    blocker(S11_AUTHORITY_GATE.x, 0, 7, 89, 82, 0, 'authority-door');

    // Dedicated ICE BREACH command pedestal.  The player approaches from +X,
    // so every control surface faces +X (the old basic box put its screen on
    // the rear face).  The footprint remains the authored terminal blocker.
    const doorTerminalMeshStart = rawMeshes;
    const tx = S11_DOOR_TERMINAL.x, tz = S11_DOOR_TERMINAL.z;
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(30, 1.1, 2.2), material('doorTerminalConduit', PAL.ink),
            S11_AUTHORITY_GATE.x + 15, .7, tz + side * 6.2,
            0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(3.2, 1.4, 3.2), material('doorTerminalClamp', PAL.steel),
            tx - 7.2, 1.2, tz + side * 6.2, 0, 0, 0, false, false);
    }
    mesh(g, new THREE.BoxGeometry(20, 2.4, 18), material('doorTerminalPlinth', PAL.ink),
        tx, 1.2, tz, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(17, 7, 15), material('doorTerminalLower', PAL.gunmetal),
        tx - 1, 5.2, tz, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(14, 18, 14), material('doorTerminalBody', PAL.concrete),
        tx - 2.2, 16.5, tz, 0, 0, 0, true, true);
    // Armoured cheeks, crown and rear data spine give the small terminal a
    // recognisable silhouette without turning it into another wall.
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(8, 22, 3.2), material('doorTerminalCheek', PAL.gunmetal),
            tx - .5, 17, tz + side * 7.2, 0, 0, side * .08, true, true);
        mesh(g, new THREE.BoxGeometry(3, 13, 2.2), material('doorTerminalRail', PAL.steel),
            tx + 5.4, 20, tz + side * 7.1, 0, 0, side * .08, false, false);
        mesh(g, new THREE.BoxGeometry(1.2, 5, 2.4),
            material(side < 0 ? 'doorTerminalRed' : 'doorTerminalWhite',
                side < 0 ? PAL.hazard : PAL.white),
        tx - 9.1, 6, tz + side * 5.2, 0, 0, 0, false, false);
    }
    mesh(g, new THREE.BoxGeometry(19, 3, 17), material('doorTerminalCrown', PAL.ink),
        tx - 1, 28, tz, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(3.5, 26, 5), material('doorTerminalSpine', PAL.steel),
        tx - 8.2, 15.5, tz, 0, 0, 0, true, true);
    for (const y of [7, 11, 15, 19])
        mesh(g, new THREE.BoxGeometry(1.1, 1.2, 8.5), material('doorTerminalVent', PAL.ink),
            tx - 9.1, y, tz, 0, 0, 0, false, false);

    // Sloped operator altar, heavy bezel, touch deck and twin grab rails.
    mesh(g, new THREE.BoxGeometry(5.5, 16.5, 17),
        material('doorTerminalHood', PAL.gunmetal), tx + 5.3, 20.5, tz,
        0, 0, -.11, true, true);
    mesh(g, new THREE.BoxGeometry(2.3, 13.5, 16), material('doorTerminalBezel', PAL.ink),
        tx + 8.1, 20.8, tz, 0, 0, -.11, false, false);
    mesh(g, new THREE.BoxGeometry(10, 2.1, 17), material('doorTerminalDesk', PAL.steel),
        tx + 7.1, 11.7, tz, 0, 0, -.13, true, true);
    mesh(g, new THREE.BoxGeometry(7.5, .8, 13.5), material('doorTerminalTouchDeck', PAL.ink),
        tx + 9.1, 12.8, tz, 0, 0, -.13, false, false);
    for (const side of [-1, 1])
        mesh(g, new THREE.CylinderGeometry(.8, .8, 9, 8), material('doorTerminalHandle', PAL.steel),
            tx + 10.2, 16.4, tz + side * 8.2, 0, 0, 0, false, false);

    // Prebuilt self-lit UI stays out of the static weld so the access state can
    // breathe and change from amber/locked to teal/open without allocations.
    doorTerminalScreen = mesh(root, new THREE.BoxGeometry(.8, 10.8, 13.7),
        basicMaterial('doorTerminalScreenLive', PAL.screenBg),
        tx + 9.35, 21, tz, 0, 0, -.11, false, false);
    doorTerminalCore = mesh(root, new THREE.TorusGeometry(3.1, .55, 8, 18),
        basicMaterial('doorTerminalCoreLive', PAL.amber,
            { transparent: true, opacity: .88, depthWrite: false }),
        tx + 9.95, 21.2, tz, 0, Math.PI / 2, 0, false, false);
    for (let i = 0; i < 7; i++) {
        const line = mesh(root, new THREE.BoxGeometry(.36, .5, 2.2 + (i % 4) * 1.15),
            basicMaterial(i % 3 ? 'doorTerminalDataLive' : 'doorTerminalWarnLive',
                i % 3 ? PAL.tech : PAL.amber,
                { transparent: true, opacity: .82, depthWrite: false }),
            tx + 10.02, 17.4 + i * 1.15, tz - 4.4 + (i % 2) * 8.8,
            0, 0, -.11, false, false);
        line.userData.pulsePhase = i * .83; doorTerminalGlyphs.push(line);
    }
    for (const z of [-5.2, 0, 5.2]) {
        const key = mesh(root, new THREE.BoxGeometry(.45, .9, 1.8),
            basicMaterial('doorTerminalKeyLive', PAL.amber,
                { transparent: true, opacity: .9, depthWrite: false }),
            tx + 10.65, 13.25, tz + z, 0, 0, -.13, false, false);
        key.userData.pulsePhase = z; doorTerminalGlyphs.push(key);
    }
    const doorTerminalVisualMeshes = rawMeshes - doorTerminalMeshStart;
    doorHackMarker = buildStandMarker(root, S11_DOOR_STAND.x, S11_DOOR_STAND.z, PAL.amber);
    blocker(S11_DOOR_TERMINAL.x, S11_DOOR_TERMINAL.z, 10, 9, 25,
        0, 'door-hack-terminal');
    count('clear-approach-corridor'); count('large-hall-door'); count('door-hack-terminal');
    count('door-terminal-screen'); count('door-terminal-glyph', doorTerminalGlyphs.length);
    count('door-terminal-chassis-detail', doorTerminalVisualMeshes);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildApproachMachines() {
    const C = CFG.campaign.stage11.rootCorridor;
    const n = Math.max(1, C.machines | 0);
    for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const row = Math.floor(i / 2);
        const x = S11_ROOT_ENCOUNTER.x + row * 38;
        const z = side * (C.machineLateral + row * 10);
        const yaw = side < 0 ? 0 : Math.PI;
        const rig = buildSpawnMachineMesh(30, 20, 30);
        rig.group.name = `stage11-root-corridor-fabricator-${i + 1}`;
        rig.group.position.set(x, 0, z); rig.group.rotation.y = yaw;
        root.add(rig.group); resetSpawnMachine(rig, false);
        blocker(x, z, 16, 16, 26, yaw, 'root-spawn-machine');
        approachMachines.push({ index: i, rig, x, z, yaw,
            hatch: { x: x + Math.sin(yaw) * 18, z: z + Math.cos(yaw) * 18 },
            alive: false, active: false, hp: 0, hitT: 0,
            clock: 0, nextBatch: 0, pending: 0, birthCooldown: 0,
            batches: 0, spawned: 0 });
    }
    count('root-spawn-machine', approachMachines.length);
}

export function updateStage11RootMachines(dt) {
    for (const m of approachMachines) {
        if (m.hitT > 0) m.hitT = Math.max(0, m.hitT - dt * 4.5);
        updateSpawnMachine(m.rig, dt, m.active && m.alive, m.hitT);
    }
}
export const stage11RootMachines = () => approachMachines;
export const stage11RootMachineAnchors = () => approachMachines.map(m => ({
    index: m.index, x: m.x, z: m.z, yaw: m.yaw, hatch: { ...m.hatch },
}));

function buildTransmitter() {
    const g = new THREE.Group();
    const computerMeshStart = rawMeshes;
    const cx = S11_INSERT.x, cz = S11_INSERT.z;
    // Monumental broadcast altar: low concentric armour keeps the arena open,
    // while the tall transmitter and forward triptych read as one hero prop.
    mesh(g, new THREE.CylinderGeometry(58, 66, 8, 32), material('rootDais', PAL.gunmetal),
        cx, 2, cz, 0, 0, 0, true, true);
    mesh(g, new THREE.CylinderGeometry(51, 57, 3, 32), material('rootDaisUpper', PAL.ink),
        cx, 7.3, cz, 0, 0, 0, true, true);
    mesh(g, new THREE.TorusGeometry(55, 1.4, 7, 40), material('rootDaisTrim', PAL.steel),
        cx, 9, cz, Math.PI / 2, 0, 0, false, false);
    // Restrained red-white authority bands tie the national root computer to
    // the world palette without turning the hall into neon scenery.
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(34, .8, 3.2),
            material(side < 0 ? 'rootAuthorityRed' : 'rootAuthorityWhite',
                side < 0 ? PAL.hazard : PAL.white),
        cx + 5, 9.25, cz + side * 43, 0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(22, 1.2, 4), material('rootFloorConduit', PAL.ink),
            cx - 34, 8.9, cz + side * 19, 0, 0, 0, false, false);
    }

    // Rear transmitter tower: octagonal keel, four structural spines, cooling
    // fins and an elevated crown.  It remains attached to the one computer;
    // these are not the deleted perimeter capacitor-bank walls.
    const towerX = cx - 11;
    mesh(g, new THREE.CylinderGeometry(20, 25, 24, 12), material('broadcastKeel', PAL.ink),
        towerX, 20, cz, 0, 0, 0, true, true);
    mesh(g, new THREE.CylinderGeometry(15, 20, 13, 12), material('broadcastArmour', PAL.gunmetal),
        towerX, 37.5, cz, 0, 0, 0, true, true);
    for (let i = 0; i < 4; i++) {
        const a = Math.PI * .25 + i * Math.PI / 2;
        const px = towerX + Math.cos(a) * 17, pz = cz + Math.sin(a) * 17;
        mesh(g, new THREE.BoxGeometry(3.4, 48, 3.4), material('broadcastSpine', PAL.steel),
            px, 37, pz, 0, -a, 0, true, true);
        for (const y of [20, 31, 42, 53])
            mesh(g, new THREE.BoxGeometry(9, 1, 4.2), material('broadcastFin', PAL.gunmetal),
                towerX + Math.cos(a) * 20, y, cz + Math.sin(a) * 20,
                0, -a, 0, false, false);
    }
    for (const y of [14, 28, 56])
        mesh(g, new THREE.TorusGeometry(y === 56 ? 22 : 18, 2.1, 7, 28),
            material('broadcastCollar', y === 56 ? PAL.steel : PAL.gunmetal),
            towerX, y, cz, Math.PI / 2, 0, 0, true, true);
    mesh(g, new THREE.CylinderGeometry(3.1, 4.5, 20, 8), material('broadcastMast', PAL.steel),
        towerX, 71, cz, 0, 0, 0, true, true);
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(4, 3, 34),
            material('broadcastCrownBrace', PAL.gunmetal), towerX, 59, cz + side * 4,
            side * .14, 0, 0, true, true);
    }

    // Forward command altar.  A broad armoured body supports three inward-
    // canted displays, a physical touch deck and the kill-switch drive cradle.
    mesh(g, new THREE.BoxGeometry(39, 17, 46), material('consolePedestal', PAL.concrete),
        cx + 1, 16.5, cz, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(34, 5, 42), material('consoleShoulder', PAL.gunmetal),
        cx + 8, 26, cz, 0, 0, -.08, true, true);
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(25, 5, 14), material('consoleWing', PAL.gunmetal),
            cx + 14, 22, cz + side * 20, side * .08, side * -.15, -.12,
            true, true);
        mesh(g, new THREE.BoxGeometry(16, 2, 13), material('consoleWingDeck', PAL.steel),
            cx + 21, 24.5, cz + side * 19, side * .08, side * -.15, -.12,
            false, false);
        for (let k = -1; k <= 1; k++)
            mesh(g, new THREE.BoxGeometry(1.2, 1.1, 2.2), material('consoleHardKey', PAL.amberDim,
                { emissive: PAL.amberDim, emissiveIntensity: .42 }),
            cx + 26, 25.7, cz + side * (19 + k * 3.3), 0, 0, 0, false, false);
    }
    mesh(g, new THREE.BoxGeometry(19, 3.2, 36), material('consoleKeyboard', PAL.steel),
        cx + 19, 18.5, cz, 0, 0, -.2, true, true);
    mesh(g, new THREE.BoxGeometry(14, 1, 29), material('consoleTouchSurface', PAL.ink),
        cx + 23, 20.2, cz, 0, 0, -.2, false, false);
    for (const z of [-12, -6, 6, 12])
        mesh(g, new THREE.BoxGeometry(2.4, 1.3, 2.4), material('consoleToggle', PAL.steel),
            cx + 26, 21, cz + z, 0, 0, 0, false, false);

    const screenSpecs = [
        { x: cx + 21, y: 36, z: cz, yaw: 0, h: 22, w: 24 },
        { x: cx + 17, y: 33, z: cz - 21, yaw: .24, h: 18, w: 16 },
        { x: cx + 17, y: 33, z: cz + 21, yaw: -.24, h: 18, w: 16 },
    ];
    for (let si = 0; si < screenSpecs.length; si++) {
        const s = screenSpecs[si];
        mesh(g, new THREE.BoxGeometry(5, s.h + 3.5, s.w + 3.5),
            material('consoleScreenBezel', PAL.ink), s.x, s.y, s.z,
            0, s.yaw, 0, true, true);
        mesh(g, new THREE.BoxGeometry(3.2, s.h + 1.3, s.w + 1.3),
            material('consoleScreenFrame', PAL.steel),
            s.x + Math.cos(s.yaw) * 2.1, s.y, s.z - Math.sin(s.yaw) * 2.1,
            0, s.yaw, 0, false, false);
        const face = 2.55;
        const sx = s.x + Math.cos(s.yaw) * face;
        const sz = s.z - Math.sin(s.yaw) * face;
        const panel = mesh(root, new THREE.BoxGeometry(.55, s.h, s.w),
            basicMaterial(`consoleScreenLive${si}`, PAL.screenBg,
                { transparent: true, opacity: .96, depthWrite: true }),
            sx, s.y, sz, 0, s.yaw, 0, false, false);
        panel.userData.baseOpacity = .96; consoleScreens.push(panel);
        const rows = si === 0 ? 6 : 4;
        for (let k = 0; k < rows; k++) {
            const localZ = ((k % 2) * 2 - 1) * (s.w * .23);
            const front = face + .38;
            const bar = mesh(root,
                new THREE.BoxGeometry(.28, .65, 2.8 + (k % 3) * 1.8),
                basicMaterial((k + si) % 3 ? 'consoleDataLive' : 'consoleAlertLive',
                    (k + si) % 3 ? PAL.tech : PAL.amber,
                    { transparent: true, opacity: .88, depthWrite: false }),
                s.x + Math.cos(s.yaw) * front + Math.sin(s.yaw) * localZ,
                s.y - s.h * .32 + k * (s.h * .13),
                s.z - Math.sin(s.yaw) * front + Math.cos(s.yaw) * localZ,
                0, s.yaw, 0, false, false);
            bar.userData.pulsePhase = si * 1.7 + k * .71;
            bar.userData.baseScaleZ = 1; consoleDataBars.push(bar);
        }
    }
    mesh(g, new THREE.BoxGeometry(6, 9.5, 15), material('driveBayBezel', PAL.ink),
        cx + 24.2, 13.4, cz, 0, 0, 0, true, true);
    for (const side of [-1, 1])
        mesh(g, new THREE.BoxGeometry(6.8, 2.1, 3.2), material('driveBayJaw', PAL.steel),
            cx + 27, 13.4, cz + side * 6.2, 0, 0, 0, false, false);
    driveSlotGlow = mesh(root, new THREE.BoxGeometry(.75, 5.8, 9.2),
        basicMaterial('driveSlotLive', PAL.amber,
            { transparent: true, opacity: .9, depthWrite: false }),
        cx + 27.6, 13.5, cz, 0, 0, 0, false, false);

    // Live transmitter volume and gimbals.  Every mesh exists at build time;
    // updateStage11RootVisuals only changes transforms/material values.
    broadcastCore = mesh(root, new THREE.CylinderGeometry(8, 10, 42, 12),
        basicMaterial('broadcastCoreLive', PAL.tech,
            { transparent: true, opacity: .72, depthWrite: false }),
        towerX, 38, cz, 0, 0, 0, false, false);
    const ringSpecs = [
        { r: 12, y: 25, rx: Math.PI / 2, ry: 0, rz: 0, speed: .45 },
        { r: 15, y: 39, rx: 0, ry: 0, rz: .18, speed: -.34 },
        { r: 17, y: 43, rx: 0, ry: Math.PI / 2, rz: -.2, speed: .28 },
        { r: 13, y: 56, rx: Math.PI / 2, ry: 0, rz: 0, speed: -.52 },
    ];
    for (let i = 0; i < ringSpecs.length; i++) {
        const q = ringSpecs[i];
        const ring = mesh(root, new THREE.TorusGeometry(q.r, .85, 7, 26),
            basicMaterial(i % 2 ? 'broadcastRingAmberLive' : 'broadcastRingTechLive',
                i % 2 ? PAL.amber : PAL.tech,
                { transparent: true, opacity: .82, depthWrite: false }),
            towerX, q.y, cz, q.rx, q.ry, q.rz, false, false);
        ring.userData.baseRx = q.rx; ring.userData.baseRy = q.ry;
        ring.userData.baseRz = q.rz; ring.userData.spinSpeed = q.speed;
        ring.userData.pulsePhase = i * 1.4; broadcastRings.push(ring);
    }
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 2 / 8;
        const vane = mesh(root, new THREE.BoxGeometry(1.2, 4.2, 2.4),
            basicMaterial(i % 3 ? 'broadcastVaneTechLive' : 'broadcastVaneAmberLive',
                i % 3 ? PAL.tech : PAL.amber,
                { transparent: true, opacity: .86, depthWrite: false }),
            towerX + Math.cos(a) * 16, 30 + (i % 4) * 6,
            cz + Math.sin(a) * 16, 0, -a, 0, false, false);
        vane.userData.orbitPhase = a; vane.userData.orbitRadius = 16 + (i % 2) * 3;
        vane.userData.orbitY = 30 + (i % 4) * 6;
        vane.userData.orbitSpeed = (i % 2 ? -.34 : .4);
        broadcastOrbiters.push(vane);
    }
    broadcastBeacon = mesh(root, new THREE.OctahedronGeometry(4.2, 0),
        basicMaterial('broadcastBeaconLive', PAL.amber,
            { transparent: true, opacity: .88, depthWrite: false }),
        towerX, 82, cz, 0, 0, 0, false, false);
    const computerVisualMeshes = rawMeshes - computerMeshStart;

    consoleMarker = buildStandMarker(root, S11_INSERT_STAND.x, S11_INSERT_STAND.z, PAL.amber);
    consoleMarker.position.y = INSERT_STAND_MARKER_Y;
    // A literal yellow floor square marks the exact collision-reachable place
    // where the player inserts the drive and starts the central upload.  It is
    // MeshBasic so it reads as genuinely illuminated under the dark hall
    // preset, and sits above (not inside) the opaque y=6 computer dais.
    const insertFloorMat = new THREE.MeshBasicMaterial({
        color: PAL.amber, transparent: true, opacity: .82,
        toneMapped: false, depthWrite: true,
    });
    // Retain an explicit semantic tag for headless/debug inspection; in the
    // browser the material also carries three.js' isMeshBasicMaterial flag.
    insertFloorMat.userData = { ...(insertFloorMat.userData || {}), selfLit: true };
    consoleFloorMarker = mesh(root,
        new THREE.BoxGeometry(INSERT_FLOOR_SIZE, INSERT_FLOOR_HEIGHT, INSERT_FLOOR_SIZE),
        insertFloorMat, S11_INSERT_STAND.x, INSERT_FLOOR_Y, S11_INSERT_STAND.z,
        0, 0, 0, false, false);
    consoleFloorMarker.name = 'stage11-root-upload-floor-marker';
    blocker(S11_INSERT.x, S11_INSERT.z, 23, 25, 84, 0, 'insert-console');
    count('central-root-computer'); count('physical-insert-console');
    count('central-console-screen', consoleScreens.length);
    count('central-console-data-bar', consoleDataBars.length);
    count('central-transmitter-ring', broadcastRings.length);
    count('central-transmitter-orbiter', broadcastOrbiters.length);
    count('central-drive-bay'); count('central-computer-chassis-detail', computerVisualMeshes);
    weldOccluder(S11_ROOT_OCC, root, g,
        { x: S11_INSERT.x, z: S11_INSERT.z, hx: 38, hz: 44, top: 84 });
    weldedMeshes++;
}

function buildLighting() {
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 2 / 8;
        const l = new THREE.PointLight(i % 2 ? PAL.amber : PAL.tech, .72, 165, 2);
        l.position.set(S11_ARENA.x + Math.cos(a) * 235, 45, Math.sin(a) * 235);
        root.add(l); lights.push(l); registerStageLight(STAGE11_ROOT_LIGHTS_KEY, l);
    }
}

export function setStage11AuthorityDoor(open) {
    authorityDoorOpen = !!open;
}
export function updateStage11AuthorityDoor(dt) {
    if (!authorityDoor) return;
    const sec = Math.max(.05, CFG.campaign.stage11.rootCorridor.doorOpenSec);
    authorityDoorT = Math.max(0, Math.min(1,
        authorityDoorT + (authorityDoorOpen ? 1 : -1) * dt / sec));
    const k = authorityDoorT * authorityDoorT * (3 - 2 * authorityDoorT);
    authorityDoor.left.position.z = authorityDoor.closedLeftZ - authorityDoor.slide * k;
    authorityDoor.right.position.z = authorityDoor.closedRightZ + authorityDoor.slide * k;
    const b = blockers.find(q => q.kind === 'authority-door');
    if (b) b.top = k >= .92 ? -1 : 82;
}
export function setStage11DoorHackMarker(on) { if (doorHackMarker) doorHackMarker.visible = !!on; }
export function setStage11InsertMarker(on) {
    if (consoleMarker) consoleMarker.visible = !!on;
    if (consoleFloorMarker) consoleFloorMarker.visible = !!on;
}
export function updateStage11RootVisuals(dt, progress, jammed = false) {
    uploadVisual += dt;
    const activePulse = .5 + .5 * Math.sin(uploadVisual * 3.2);
    if (doorTerminalScreen) doorTerminalScreen.material.color.setHex(
        authorityDoorOpen ? PAL.techDim : PAL.screenBg);
    if (doorTerminalCore) {
        doorTerminalCore.material.color.setHex(authorityDoorOpen ? PAL.tech : PAL.amber);
        doorTerminalCore.material.opacity = .72 + .24 * activePulse;
        doorTerminalCore.rotation.x = uploadVisual * (authorityDoorOpen ? .35 : .8);
    }
    for (let i = 0; i < doorTerminalGlyphs.length; i++) {
        const q = doorTerminalGlyphs[i];
        q.scale.z = .72 + .28 * (.5 + .5 * Math.sin(
            uploadVisual * 4.1 + q.userData.pulsePhase));
    }
    if (consoleMarker?.visible) {
        pulseStandMarker(consoleMarker, uploadVisual * 4);
    }
    if (consoleFloorMarker?.visible) {
        // A slower solid-pad pulse remains legible beneath the faster standard
        // stand-marker outline and makes the destination obvious at a glance.
        consoleFloorMarker.material.opacity = .72
            + .24 * (.5 + .5 * Math.sin(uploadVisual * 3.2));
    }
    for (let i = 0; i < consoleScreens.length; i++) {
        const q = consoleScreens[i];
        q.material.color.setHex(jammed ? PAL.amberDim : PAL.screenBg);
        q.material.opacity = .88 + .1 * (.5 + .5 * Math.sin(
            uploadVisual * (jammed ? 8.5 : 2.1) + i * 1.7));
    }
    for (let i = 0; i < consoleDataBars.length; i++) {
        const q = consoleDataBars[i];
        q.scale.z = .55 + .45 * (.5 + .5 * Math.sin(
            uploadVisual * (2.7 + progress * 2.2) + q.userData.pulsePhase));
    }
    if (driveSlotGlow) {
        driveSlotGlow.material.color.setHex(progress > 0 ? PAL.tech : PAL.amber);
        driveSlotGlow.material.opacity = .72 + .25 * activePulse;
    }
    if (broadcastCore) {
        broadcastCore.rotation.y = uploadVisual * (.32 + progress * .8);
        broadcastCore.scale.y = 1 + .035 * Math.sin(uploadVisual * 2.4);
        broadcastCore.material.color.setHex(jammed ? PAL.amber : PAL.tech);
        broadcastCore.material.opacity = jammed
            ? .42 + .18 * (.5 + .5 * Math.sin(uploadVisual * 9))
            : .64 + .22 * activePulse;
    }
    for (let i = 0; i < broadcastRings.length; i++) {
        const q = broadcastRings[i], p = q.userData;
        q.rotation.x = p.baseRx + Math.sin(uploadVisual * .43 + p.pulsePhase) * .12;
        q.rotation.y = p.baseRy + uploadVisual * p.spinSpeed * (1 + progress);
        q.rotation.z = p.baseRz + Math.cos(uploadVisual * .37 + p.pulsePhase) * .1;
    }
    for (let i = 0; i < broadcastOrbiters.length; i++) {
        const q = broadcastOrbiters[i], p = q.userData;
        const a = p.orbitPhase + uploadVisual * p.orbitSpeed * (1 + progress * .8);
        q.position.x = S11_INSERT.x - 11 + Math.cos(a) * p.orbitRadius;
        q.position.y = p.orbitY + Math.sin(uploadVisual * 1.7 + p.orbitPhase) * 1.2;
        q.position.z = S11_INSERT.z + Math.sin(a) * p.orbitRadius;
        q.rotation.y = -a;
    }
    if (broadcastBeacon) {
        broadcastBeacon.rotation.x = uploadVisual * .52;
        broadcastBeacon.rotation.y = uploadVisual * .76;
        broadcastBeacon.scale.setScalar(.9 + .18 * activePulse);
        broadcastBeacon.material.color.setHex(jammed ? PAL.amber : PAL.tech);
        broadcastBeacon.material.opacity = .7 + .25 * activePulse;
    }
}
// The central computer is the open hall's only legitimate occluder. Update it
// every frame so no deleted pillar/wall has to return as an occlusion crutch.
export function updateStage11RootOccluders(dt) { updateStageOccluders(S11_ROOT_OCC, dt); }

export function resetStage11RootVisuals() {
    uploadVisual = 0; authorityDoorOpen = false; authorityDoorT = 0;
    if (authorityDoor) {
        authorityDoor.left.position.z = authorityDoor.closedLeftZ;
        authorityDoor.right.position.z = authorityDoor.closedRightZ;
    }
    const doorBlock = blockers.find(q => q.kind === 'authority-door');
    if (doorBlock) doorBlock.top = 82;
    setStage11DoorHackMarker(true); setStage11InsertMarker(false);
    for (const m of approachMachines) {
        m.alive = false; m.active = false; m.hp = 0; m.hitT = 0;
        m.clock = 0; m.nextBatch = 0; m.pending = 0; m.birthCooldown = 0;
        m.batches = 0; m.spawned = 0;
        resetSpawnMachine(m.rig, false);
    }
    resetStageOccluders(S11_ROOT_OCC);
    if (doorTerminalScreen) doorTerminalScreen.material.color.setHex(PAL.screenBg);
    if (doorTerminalCore) {
        doorTerminalCore.material.color.setHex(PAL.amber);
        doorTerminalCore.material.opacity = .88;
        doorTerminalCore.rotation.set(0, Math.PI / 2, 0);
    }
    for (const q of doorTerminalGlyphs) q.scale.set(1, 1, 1);
    for (const q of consoleScreens) {
        q.material.color.setHex(PAL.screenBg); q.material.opacity = q.userData.baseOpacity;
    }
    for (const q of consoleDataBars) q.scale.set(1, 1, 1);
    if (driveSlotGlow) {
        driveSlotGlow.material.color.setHex(PAL.amber); driveSlotGlow.material.opacity = .9;
    }
    if (broadcastCore) {
        broadcastCore.rotation.set(0, 0, 0); broadcastCore.scale.set(1, 1, 1);
        broadcastCore.material.color.setHex(PAL.tech); broadcastCore.material.opacity = .72;
    }
    for (const q of broadcastRings) {
        const p = q.userData;
        q.rotation.set(p.baseRx, p.baseRy, p.baseRz); q.scale.set(1, 1, 1);
    }
    for (const q of broadcastOrbiters) {
        const p = q.userData, a = p.orbitPhase;
        q.position.set(S11_INSERT.x - 11 + Math.cos(a) * p.orbitRadius,
            p.orbitY, S11_INSERT.z + Math.sin(a) * p.orbitRadius);
        q.rotation.set(0, -a, 0); q.scale.set(1, 1, 1);
    }
    if (broadcastBeacon) {
        broadcastBeacon.rotation.set(0, 0, 0); broadcastBeacon.scale.set(1, 1, 1);
        broadcastBeacon.material.color.setHex(PAL.amber); broadcastBeacon.material.opacity = .88;
    }
    if (consoleFloorMarker) consoleFloorMarker.material.opacity = .82;
}

export function ensureStage11RootWorld(parent = scene) {
    if (built) return root;
    const RC = CFG.campaign.stage11.rootCorridor;
    if (RC.meters !== S11_ROOT_CORRIDOR_METERS
        || RC.encounterMeter !== S11_ROOT_ENCOUNTER_METER)
        throw new Error('Stage 11 root corridor config must match its authored 100m/50m geometry');
    built = true; root = new THREE.Group(); root.name = 'campaign-stage11-root-chamber';
    parent.add(root);
    buildShell(); buildThreshold(); buildApproachMachines(); buildTransmitter(); buildLighting();
    nav = makeNavGrid(BOUNDS.x0, BOUNDS.z0, 14,
        Math.ceil((BOUNDS.x1 - BOUNDS.x0) / 14), Math.ceil((BOUNDS.z1 - BOUNDS.z0) / 14),
        // The dynamic door is excluded from the static nav raster. Its real
        // blocker still stops robots while shut and releases them after hack.
        (x, z) => stage11RootWalk(x, z, 3.5)
            && !navBlocked(x, z, 3.5));
    registerCampaignWorldRoot({ key: STAGE11_ROOT_LIGHTS_KEY, root,
        bounds: { ...BOUNDS }, lightsKey: STAGE11_ROOT_LIGHTS_KEY,
        warmupViews: [S11_ROOT_START, S11_AUTHORITY_GATE, S11_INSERT, S11_ARENA],
    });
    return root;
}

export const stage11RootWorldDebug = () => ({
    built, root: root?.name || null, origin: { ...S11_ROOT_ORIGIN }, bounds: { ...BOUNDS },
    start: { ...S11_ROOT_START }, gate: { ...S11_AUTHORITY_GATE },
    insert: { ...S11_INSERT }, insertStand: { ...S11_INSERT_STAND },
    arena: { ...S11_ARENA }, wardenHome: { ...S11_WARDEN_HOME },
    rawMeshes, weldedMeshes, blockers: blockers.length,
    semantic: Object.fromEntries(semantic), lights: { key: STAGE11_ROOT_LIGHTS_KEY,
        total: lights.length },
    corridor: { meters: S11_ROOT_CORRIDOR_METERS,
        units: S11_ROOT_START.x - S11_AUTHORITY_GATE.x,
        encounterMeter: S11_ROOT_ENCOUNTER_METER, encounter: { ...S11_ROOT_ENCOUNTER },
        columns: semantic.get('threshold-column') || 0,
        arches: semantic.get('decontamination-arch') || 0,
        walls: semantic.get('corridor-wall') || 0 },
    hall: { centre: { x: S11_ARENA.x, z: S11_ARENA.z },
        computerCentred: S11_INSERT.x === S11_ARENA.x && S11_INSERT.z === S11_ARENA.z,
        buttresses: semantic.get('outer-buttress') || 0,
        staticCapacitorBanks: semantic.get('capacitor-bank') || 0,
        dais: {
            top: INSERT_DAIS_TOP, upperRadius: INSERT_DAIS_UPPER_RADIUS,
            lowerTop: INSERT_DAIS_LOWER_TOP,
            lowerTopRadius: INSERT_DAIS_LOWER_TOP_RADIUS,
            floorRadius: INSERT_DAIS_FLOOR_RADIUS,
            standGround: stage11RootGroundHeight(S11_INSERT_STAND.x, S11_INSERT_STAND.z),
            outerGround: stage11RootGroundHeight(
                S11_INSERT.x + INSERT_DAIS_FLOOR_RADIUS + 1, S11_INSERT.z),
        } },
    door: { large: true, hackedOpen: authorityDoorOpen, progress: authorityDoorT,
        leftZ: authorityDoor?.left.position.z ?? null,
        rightZ: authorityDoor?.right.position.z ?? null,
        terminal: { ...S11_DOOR_TERMINAL }, stand: { ...S11_DOOR_STAND },
        marker: !!doorHackMarker?.visible },
    computers: {
        doorTerminal: {
            screens: doorTerminalScreen ? 1 : 0,
            glyphs: doorTerminalGlyphs.length,
            chassisDetails: semantic.get('door-terminal-chassis-detail') || 0,
            facesPlayer: !!doorTerminalScreen
                && doorTerminalScreen.position.x > S11_DOOR_TERMINAL.x,
            coreColor: doorTerminalCore?.material.color.getHex() ?? null,
            pointLights: 0,
        },
        killSwitch: {
            screens: consoleScreens.length, dataBars: consoleDataBars.length,
            rings: broadcastRings.length, orbiters: broadcastOrbiters.length,
            chassisDetails: semantic.get('central-computer-chassis-detail') || 0,
            driveBay: !!driveSlotGlow, beacon: !!broadcastBeacon,
            towerTop: broadcastBeacon?.position.y ?? null,
            ringMotion: broadcastRings[1]?.rotation.y ?? 0,
            orbiterMotion: broadcastOrbiters[0]?.position.z ?? 0,
            pointLights: 0,
        },
    },
    machines: approachMachines.map(m => ({ index: m.index, x: m.x, z: m.z,
        yaw: m.yaw, alive: m.alive, active: m.active, hp: m.hp,
        hitT: m.hitT, batches: m.batches, spawned: m.spawned,
        ...spawnMachineDebug(m.rig) })),
    authorityOpen: authorityDoorT >= .92,
    occluders: occlusionDebug(S11_ROOT_OCC),
    insertMarker: !!consoleMarker?.visible,
    insertFloorMarker: consoleFloorMarker && {
        visible: !!consoleFloorMarker.visible, shape: 'square',
        x: consoleFloorMarker.position.x, z: consoleFloorMarker.position.z,
        y: consoleFloorMarker.position.y,
        bottomY: consoleFloorMarker.position.y - INSERT_FLOOR_HEIGHT * .5,
        daisTop: INSERT_DAIS_TOP, width: INSERT_FLOOR_SIZE,
        color: consoleFloorMarker.material.color.getHex(),
        opacity: consoleFloorMarker.material.opacity,
        selfLit: !!consoleFloorMarker.material.userData?.selfLit,
    },
    nav: nav && { cols: nav.cols, rows: nav.rows,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});
