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
let consoleCore = null;
let broadcastCore = null;
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
export function stage11RootGroundHeight() { return 0; }
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

    // Small access pedestal on the corridor side. Its stand marker opens the
    // shared Stage-1 hack minigame; it never doubles as the central computer.
    mesh(g, new THREE.BoxGeometry(20, 25, 18), material('doorTerminalBody', PAL.concrete),
        S11_DOOR_TERMINAL.x, 12.5, S11_DOOR_TERMINAL.z, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(9, 12, 19), material('doorTerminalScreen', PAL.tech,
        { emissive: PAL.techDim, emissiveIntensity: .52 }),
    S11_DOOR_TERMINAL.x - 10.5, 19, S11_DOOR_TERMINAL.z,
    0, 0, 0, false, false);
    doorHackMarker = buildStandMarker(root, S11_DOOR_STAND.x, S11_DOOR_STAND.z, PAL.amber);
    blocker(S11_DOOR_TERMINAL.x, S11_DOOR_TERMINAL.z, 10, 9, 25,
        0, 'door-hack-terminal');
    count('clear-approach-corridor'); count('large-hall-door'); count('door-hack-terminal');
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
            hatch: { x: x + Math.sin(yaw) * 18, z: z + Math.cos(yaw) * 18 } });
    }
    count('root-spawn-machine', approachMachines.length);
}

export function updateStage11RootMachines(dt, active) {
    for (const m of approachMachines) updateSpawnMachine(m.rig, dt, !!active, 0);
}
export const stage11RootMachineAnchors = () => approachMachines.map(m => ({
    index: m.index, x: m.x, z: m.z, yaw: m.yaw, hatch: { ...m.hatch },
}));

function buildTransmitter() {
    const g = new THREE.Group();
    // One unmistakable central computer replaces the old offset console,
    // transmitter tower, socket posts and cable clutter.
    mesh(g, new THREE.CylinderGeometry(58, 66, 8, 24), material('rootDais', PAL.gunmetal),
        S11_INSERT.x, 2, S11_INSERT.z, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(42, 18, 48), material('consolePedestal', PAL.concrete),
        S11_INSERT.x, 11, S11_INSERT.z, 0, 0, 0, true, true);
    broadcastCore = mesh(g, new THREE.CylinderGeometry(13, 17, 30, 12),
        material('broadcastCore', PAL.tech,
            { emissive: PAL.techDim, emissiveIntensity: .36 }),
        S11_INSERT.x - 8, 31, S11_INSERT.z, 0, 0, 0, false, false);
    mesh(g, new THREE.BoxGeometry(5, 27, 36), material('consolePanel', PAL.gunmetal),
        S11_INSERT.x + 23, 27, S11_INSERT.z, 0, 0, 0, false, false);
    consoleCore = mesh(g, new THREE.BoxGeometry(5.6, 19, 28),
        material('consoleScreen', PAL.tech, { emissive: PAL.techDim, emissiveIntensity: .56 }),
        S11_INSERT.x + 26, 28, S11_INSERT.z, 0, 0, 0, false, false);
    mesh(g, new THREE.BoxGeometry(22, 3, 34), material('consoleKeyboard', PAL.steel),
        S11_INSERT.x + 18, 15, S11_INSERT.z, 0, 0, -.28, false, false);
    mesh(g, new THREE.BoxGeometry(5, 8, 12), material('driveSlot', PAL.amberDim,
        { emissive: PAL.amberDim, emissiveIntensity: .5 }),
    S11_INSERT.x + 27, 15, S11_INSERT.z, 0, 0, 0, false, false);
    consoleMarker = buildStandMarker(root, S11_INSERT_STAND.x, S11_INSERT_STAND.z, PAL.amber);
    blocker(S11_INSERT.x, S11_INSERT.z, 23, 25, 43, 0, 'insert-console');
    count('central-root-computer'); count('physical-insert-console');
    weldOccluder(S11_ROOT_OCC, root, g,
        { x: S11_INSERT.x, z: S11_INSERT.z, hx: 31, hz: 31, top: 43 });
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
export function setStage11InsertMarker(on) { if (consoleMarker) consoleMarker.visible = !!on; }
export function updateStage11RootVisuals(dt, progress, jammed = false) {
    uploadVisual += dt;
    if (consoleMarker?.visible) {
        pulseStandMarker(consoleMarker, uploadVisual * 4);
    }
    if (consoleCore) consoleCore.material.emissiveIntensity = Math.min(EMISSIVE_MAX,
        .32 + Math.max(0, progress) * .46);
    if (broadcastCore) {
        broadcastCore.rotation.y += dt * (.3 + progress * .7);
        broadcastCore.material.emissiveIntensity = Math.min(EMISSIVE_MAX,
            jammed ? .22 + .08 * Math.sin(uploadVisual * 7) : .32 + progress * .5);
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
    for (const m of approachMachines) resetSpawnMachine(m.rig, false);
    resetStageOccluders(S11_ROOT_OCC);
    if (consoleCore) consoleCore.material.emissiveIntensity = .56;
    if (broadcastCore) broadcastCore.material.emissiveIntensity = .36;
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
        staticCapacitorBanks: semantic.get('capacitor-bank') || 0 },
    door: { large: true, hackedOpen: authorityDoorOpen, progress: authorityDoorT,
        leftZ: authorityDoor?.left.position.z ?? null,
        rightZ: authorityDoor?.right.position.z ?? null,
        terminal: { ...S11_DOOR_TERMINAL }, stand: { ...S11_DOOR_STAND },
        marker: !!doorHackMarker?.visible },
    machines: approachMachines.map(m => ({ index: m.index, x: m.x, z: m.z,
        yaw: m.yaw, ...spawnMachineDebug(m.rig) })),
    authorityOpen: authorityDoorT >= .92,
    occluders: occlusionDebug(S11_ROOT_OCC),
    insertMarker: !!consoleMarker?.visible,
    nav: nav && { cols: nav.cols, rows: nav.rows,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});
