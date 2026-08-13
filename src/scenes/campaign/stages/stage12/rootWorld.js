// Stage 12 root chapter — monumental national transmitter chamber.

import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStaticShadowAware } from '../../../../utils/meshBatch.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { buildStandMarker, pulseStandMarker } from '../../utility/common.js';

export const STAGE12_ROOT_LIGHTS_KEY = 'campaign-12-root';
export const S12_ROOT_ORIGIN = Object.freeze({ x: 400000, z: 0 });
export const S12_ROOT_START = Object.freeze({ x: 400530, z: 0 });
export const S12_AUTHORITY_GATE = Object.freeze({ x: 400345, z: 0 });
export const S12_INSERT = Object.freeze({ x: 400235, z: 0 });
export const S12_ARENA = Object.freeze({ x: 399950, z: 0, radius: 315 });
export const S12_WARDEN_HOME = Object.freeze({ x: 399910, z: 0 });

const BOUNDS = Object.freeze({ x0: 399540, x1: 400650, z0: -470, z1: 470 });
const ARENA_R = S12_ARENA.radius;
let built = false;
let root = null;
let nav = null;
let authorityDoor = null;
let consoleMarker = null;
let consoleCore = null;
let broadcastCore = null;
let uploadVisual = 0;
let rawMeshes = 0;
let weldedMeshes = 0;
const blockers = [];
const sockets = [];
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
function pointBlocked(x, z, r = 0) {
    return blockers.some(b => {
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

export function stage12RootWalk(x, z, r = 0) {
    const inArena = Math.hypot(x - S12_ARENA.x, z - S12_ARENA.z) <= ARENA_R - r;
    const inThreshold = x >= S12_ARENA.x && x <= 400610 - r && Math.abs(z) <= 104 - r;
    return inArena || inThreshold;
}
export function stage12RootResolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
}
export function stage12RootSegBlocked(x0, z0, x1, z1) {
    return blockers.some(b => segBox(x0, z0, x1, z1, b));
}
export function stage12RootGroundHeight() { return 0; }
export function stage12RootNav() { return nav; }

function buildShell() {
    const g = new THREE.Group();
    mesh(g, new THREE.CylinderGeometry(470, 490, 10, 36), material('foundation', PAL.ink),
        S12_ARENA.x, -5, 0, 0, 0, 0, false, true);
    mesh(g, new THREE.CylinderGeometry(330, 340, 5, 36), material('arenaFloor', 0x6f6c65),
        S12_ARENA.x, -1, 0, 0, 0, 0, false, true);
    for (const r of [92, 158, 232, 306]) {
        mesh(g, new THREE.TorusGeometry(r, 3.2, 7, 42), material('floorRing', PAL.amberDim,
            { emissive: PAL.amberDim, emissiveIntensity: .34 }),
        S12_ARENA.x, 1.5, 0, Math.PI / 2, 0, 0, false, false);
        count('concentric-authority-ring');
    }
    // Monumental outer buttresses frame the entire gameplay camera footprint.
    for (let i = 0; i < 20; i++) {
        const a = i * Math.PI * 2 / 20, x = S12_ARENA.x + Math.cos(a) * 378;
        const z = Math.sin(a) * 378;
        mesh(g, new THREE.BoxGeometry(30, 94, 52), material('outerButtress', PAL.concrete),
            x, 47, z, 0, -a, 0, true, true);
        mesh(g, new THREE.BoxGeometry(18, 72, 56), material('buttressInset', PAL.gunmetal),
            x - Math.cos(a) * 8, 53, z - Math.sin(a) * 8,
            0, -a, 0, false, false);
        mesh(g, new THREE.BoxGeometry(8, 58, 58), material('authorityStrip', PAL.amberDim,
            { emissive: PAL.amberDim, emissiveIntensity: .42 }),
        x - Math.cos(a) * 18, 55, z - Math.sin(a) * 18,
        0, -a, 0, false, false);
        blocker(x, z, 18, 30, 94, -a, 'root-buttress');
    }
    // Overhead radial trusses imply a huge chamber without a view-blocking roof.
    for (let i = 0; i < 12; i++) {
        const a = i * Math.PI * 2 / 12;
        mesh(g, new THREE.BoxGeometry(430, 9, 14), material('ceilingTruss', PAL.steel),
            S12_ARENA.x + Math.cos(a) * 190, 112, Math.sin(a) * 190,
            0, -a, Math.sin(a * 3) * .04, false, false);
    }
    count('outer-buttress', 20); count('radial-truss', 12);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildThreshold() {
    const g = new THREE.Group();
    mesh(g, new THREE.BoxGeometry(650, 5, 220), material('authorityBridge', PAL.panel),
        400280, 0, 0, 0, 0, 0, true, true);
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(650, 12, 16), material('bridgeRail', PAL.concrete),
            400280, 7, side * 102, 0, 0, 0, true, true);
        for (let i = 0; i < 10; i++) {
            const x = 400555 - i * 58;
            mesh(g, new THREE.BoxGeometry(8, 43, 24), material('thresholdColumn', PAL.panel),
                x, 23, side * 83, 0, 0, 0, true, true);
            mesh(g, new THREE.BoxGeometry(4, 28, 26), material('thresholdLamp', PAL.techDim,
                { emissive: PAL.techDim, emissiveIntensity: .48 }),
            x, 25, side * 78, 0, 0, 0, false, false);
            blocker(x, side * 83, 5, 12, 44, 0, 'threshold-column');
        }
    }
    // Decontamination arches form multiple readable thresholds.
    for (let a = 0; a < 4; a++) {
        const x = 400545 - a * 56;
        for (const side of [-1, 1])
            mesh(g, new THREE.BoxGeometry(10, 62, 16), material('deconFrame', PAL.gunmetal),
                x, 31, side * 66, 0, 0, 0, true, true);
        mesh(g, new THREE.BoxGeometry(12, 10, 142), material('deconFrame', PAL.gunmetal),
            x, 62, 0, 0, 0, 0, true, true);
    }
    authorityDoor = mesh(g, new THREE.BoxGeometry(8, 52, 124),
        material('authorityDoor', PAL.gunmetal), S12_AUTHORITY_GATE.x, 26, 0,
        0, 0, 0, true, true);
    for (let k = -5; k <= 5; k++)
        mesh(g, new THREE.BoxGeometry(2, 43, 5), material('doorRib', PAL.steel),
            S12_AUTHORITY_GATE.x + 4.6, 26, k * 10, 0, 0, 0, false, false);
    blocker(S12_AUTHORITY_GATE.x, 0, 4, 62, 52, 0, 'authority-door');
    count('authority-bridge'); count('decontamination-arch', 4);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildTransmitter() {
    const g = new THREE.Group();
    // The Warden surrounds this low root dais; all key shapes stay readable
    // beneath the boss rather than hiding behind an opaque central tower.
    mesh(g, new THREE.CylinderGeometry(72, 88, 14, 20), material('rootDais', PAL.gunmetal),
        S12_ARENA.x, 4, 0, 0, 0, 0, true, true);
    broadcastCore = mesh(g, new THREE.CylinderGeometry(29, 38, 30, 12),
        material('broadcastCore', PAL.tech, { emissive: PAL.techDim, emissiveIntensity: .36 }),
        S12_ARENA.x, 20, 0, 0, 0, 0, false, false);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI * 2 / 6;
        const x = S12_ARENA.x + Math.cos(a) * 77, z = Math.sin(a) * 77;
        mesh(g, new THREE.CylinderGeometry(9, 12, 20, 8), material('socket', PAL.steel),
            x, 8, z, 0, 0, 0, true, true);
        mesh(g, new THREE.BoxGeometry(34, 5, 9), material('rootCable', PAL.gunmetal),
            S12_ARENA.x + Math.cos(a) * 52, 4, Math.sin(a) * 52,
            0, -a, 0, false, true);
        sockets.push({ id: i, x, z, angle: a });
    }
    // Physical insertion console and drive receptacle.
    mesh(g, new THREE.BoxGeometry(38, 18, 42), material('consolePedestal', PAL.concrete),
        S12_INSERT.x, 9, 0, 0, 0, -.12, true, true);
    mesh(g, new THREE.BoxGeometry(24, 3, 31), material('consolePanel', PAL.gunmetal),
        S12_INSERT.x - 7, 20, 0, 0, 0, -.35, false, false);
    consoleCore = mesh(g, new THREE.BoxGeometry(10, 3, 17),
        material('consoleScreen', PAL.tech, { emissive: PAL.techDim, emissiveIntensity: .56 }),
        S12_INSERT.x - 9, 22, 0, 0, 0, -.35, false, false);
    mesh(g, new THREE.BoxGeometry(9, 7, 3), material('driveSlot', PAL.amberDim,
        { emissive: PAL.amberDim, emissiveIntensity: .5 }),
    S12_INSERT.x - 21, 16, 0, 0, 0, false, false);
    // Shared campaign action language: 12x12 amber stand box. It remains flat
    // and never rotates; the radar waypoint remains a separate destination cue.
    consoleMarker = buildStandMarker(root, S12_INSERT.x + 20, 0, PAL.amber);
    blocker(S12_INSERT.x, 0, 19, 21, 22, 0, 'insert-console');
    count('root-transmitter'); count('warden-socket', 6); count('physical-insert-console');
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildCapacitorBanks() {
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) {
        const a = i * Math.PI * 2 / 12, r = 270;
        const x = S12_ARENA.x + Math.cos(a) * r, z = Math.sin(a) * r;
        mesh(g, new THREE.BoxGeometry(24, 48, 35), material('bankBody', PAL.gunmetal),
            x, 24, z, 0, -a, 0, true, true);
        for (let k = -1; k <= 1; k++)
            mesh(g, new THREE.CylinderGeometry(5, 5, 35, 8), material('bankCoil', PAL.steel),
                x + Math.sin(a) * k * 9, 47, z - Math.cos(a) * k * 9,
                0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(4, 31, 27), material('bankStatus', PAL.amberDim,
            { emissive: PAL.amberDim, emissiveIntensity: .35 }),
        x - Math.cos(a) * 13, 25, z - Math.sin(a) * 13,
        0, -a, 0, false, false);
        blocker(x, z, 14, 20, 50, -a, 'capacitor-bank');
    }
    count('capacitor-bank', 12);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildLighting() {
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 2 / 8;
        const l = new THREE.PointLight(i % 2 ? PAL.amber : PAL.tech, .72, 165, 2);
        l.position.set(S12_ARENA.x + Math.cos(a) * 235, 45, Math.sin(a) * 235);
        root.add(l); lights.push(l); registerStageLight(STAGE12_ROOT_LIGHTS_KEY, l);
    }
}

export function setStage12AuthorityDoor(open) {
    if (!authorityDoor) return;
    authorityDoor.position.y = open ? 83 : 26;
    const b = blockers.find(q => q.kind === 'authority-door');
    if (b) b.top = open ? -1 : 52;
}
export function setStage12InsertMarker(on) { if (consoleMarker) consoleMarker.visible = !!on; }
export function updateStage12RootVisuals(dt, progress, jammed = false) {
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
export function resetStage12RootVisuals() {
    uploadVisual = 0; setStage12AuthorityDoor(false); setStage12InsertMarker(false);
    if (consoleCore) consoleCore.material.emissiveIntensity = .56;
    if (broadcastCore) broadcastCore.material.emissiveIntensity = .36;
}

export function ensureStage12RootWorld(parent = scene) {
    if (built) return root;
    built = true; root = new THREE.Group(); root.name = 'campaign-stage12-root-chamber';
    parent.add(root);
    buildShell(); buildThreshold(); buildTransmitter(); buildCapacitorBanks(); buildLighting();
    nav = makeNavGrid(BOUNDS.x0, BOUNDS.z0, 14,
        Math.ceil((BOUNDS.x1 - BOUNDS.x0) / 14), Math.ceil((BOUNDS.z1 - BOUNDS.z0) / 14),
        (x, z) => stage12RootWalk(x, z, 3.5) && !pointBlocked(x, z, 3.5));
    registerCampaignWorldRoot({ key: STAGE12_ROOT_LIGHTS_KEY, root,
        bounds: { ...BOUNDS }, lightsKey: STAGE12_ROOT_LIGHTS_KEY,
        warmupViews: [S12_ROOT_START, S12_AUTHORITY_GATE, S12_INSERT, S12_ARENA],
    });
    return root;
}

export const stage12RootWorldDebug = () => ({
    built, root: root?.name || null, origin: { ...S12_ROOT_ORIGIN }, bounds: { ...BOUNDS },
    start: { ...S12_ROOT_START }, gate: { ...S12_AUTHORITY_GATE },
    insert: { ...S12_INSERT }, arena: { ...S12_ARENA }, wardenHome: { ...S12_WARDEN_HOME },
    rawMeshes, weldedMeshes, blockers: blockers.length,
    sockets: sockets.map(s => ({ ...s })), socketCount: sockets.length,
    semantic: Object.fromEntries(semantic), lights: { key: STAGE12_ROOT_LIGHTS_KEY,
        total: lights.length },
    authorityOpen: !!authorityDoor && authorityDoor.position.y > 50,
    insertMarker: !!consoleMarker?.visible,
    nav: nav && { cols: nav.cols, rows: nav.rows,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});
