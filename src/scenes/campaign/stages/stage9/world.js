// Campaign Stage 9 — Kertajati rural airport perimeter.
// Everything is generated from fixed coordinates: no runtime/random skyline and
// deliberately no city buildings around the airfield.

import { CAMP_M } from '../../../../core/config.js';
import { scene } from '../../../../core/renderer.js';
import { FuturisticSedan } from '../../../../entities/futuristicSedan.js';
import { FuturisticSUV } from '../../../../entities/futuristicSUV.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { buildStandMarker, pulseStandMarker } from '../../utility/common.js';
import {
    buildFourEngineTransport, resetTransport,
    updateTransport, transportDebug,
} from './aircraft.js';
import { STAGE7_ROAD_VEHICLE_SPECS } from '../stage7/roadVehicles.js';

export const S9_ORIGIN = Object.freeze({ x: 300000, z: 0 });
export const S9_FRONT_ORIGIN = Object.freeze({ x: 306000, z: 0 });
export const S9_INTERIOR_ORIGIN = Object.freeze({ x: 312000, z: 0 });
export const S9_START = Object.freeze({ x: 304930, z: 160 });
export const S9_FRONT_CHECKPOINT = Object.freeze({ x: 305650, z: 160 });
export const S9_BUILDING_ENTRY = Object.freeze({ x: 306500, z: 160 });
export const S9_BUILDING_START = Object.freeze({ x: 312000, z: 520 });
export const S9_INTERIOR_CHECKPOINT = Object.freeze({ x: 312000, z: 80 });
export const S9_BUILDING_EXIT = Object.freeze({ x: 312000, z: -520 });
export const S9_RUNWAY_START = Object.freeze({ x: 299220, z: 250 });
export const S9_RUNWAY_CHECKPOINT = Object.freeze({ x: 299760, z: 105 });
export const S9_PUMP = Object.freeze({ x: 300145, z: 78 });
export const S9_BOARD = Object.freeze({ x: 300228, z: -44 });
const S9_CONTROL_TOWER = Object.freeze({ x: 299665, z: 176 });
const S9_CARGO_HANGAR = Object.freeze({ x: 300115, z: -145 });
export const S9_BOUNDS = Object.freeze({ x0: 299100, x1: 300930, z0: -610, z1: 610 });
export const S9_FRONT_BOUNDS = Object.freeze({ x0: 304800, x1: 306650, z0: -360, z1: 520 });
export const S9_INTERIOR_BOUNDS = Object.freeze({ x0: 311650, x1: 312350, z0: -560, z1: 560 });

export const S9_OCC = 'campaign-9-runway';
export const S9_FRONT_KEY = 'campaign-9';
export const S9_INTERIOR_KEY = 'campaign-9-interior';
export const S9_RUNWAY_KEY = 'campaign-9-runway';
let built = false;
let stageRoot = null;
let worldRoot = null;
let frontRoot = null;
let interiorRoot = null;
let transport = null;
let navGrid = null;
let frontNavGrid = null;
let interiorNavGrid = null;
let activeChapter = 'front';
let staticBatch = [];
const blockers = [];
const frontBlockers = [];
const interiorBlockers = [];
const stageLights = [];
const markers = {};
const semantic = Object.create(null);
const frontParkingRecords = [];
const frontPlanterRecords = [];
const frontBoundaryRuns = [];
let fuelPump = null;

const crateCandidates = [
    [-545, 122], [-448, -174], [-350, 248], [-255, 66], [-138, -236],
    [-28, 172], [78, -220], [164, 178], [286, 132], [390, -178],
];
const barrelCandidates = [
    [-570, 96], [-494, 206], [-392, -154], [-306, 90], [-234, -206],
    [-118, 220], [-42, -232], [38, 128], [112, -224], [174, 126],
    [264, -164], [348, 92], [424, -96], [506, 176],
];

function count(kind, amount = 1) {
    semantic[kind] = (semantic[kind] || 0) + amount;
}

function material(color, roughness = 0.76, metalness = 0.08, extra = null) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...(extra || {}) });
}

function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function cylinder(parent, mat, radius, height, x, y, z, radial = 10, axis = 'y') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, radial), mat);
    m.position.set(x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI * 0.5;
    if (axis === 'z') m.rotation.x = Math.PI * 0.5;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function addBlocker(x, z, hx, hz, top, yaw = 0, kind = 'solid', bullet = true) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const b = {
        x, z, hx, hz, top, kind, bullet, active: true,
        axx: c, axz: s, azx: -s, azz: c,
        rad: Math.hypot(hx, hz), standable: false,
    };
    blockers.push(b);
    return b;
}

function addChapterBlocker(list, x, z, hx, hz, top, yaw = 0, kind = 'solid', bullet = true) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const b = {
        x, z, hx, hz, top, kind, bullet, active: true,
        axx: c, axz: s, azx: -s, azz: c,
        rad: Math.hypot(hx, hz), standable: false,
    };
    list.push(b);
    return b;
}

function pointInBlocker(x, z, r, b) {
    if (!b.active) return false;
    const dx = x - b.x, dz = z - b.z;
    if (dx * dx + dz * dz > (b.rad + r + 1) ** 2) return false;
    const lx = dx * b.axx + dz * b.axz;
    const lz = dx * b.azx + dz * b.azz;
    return Math.abs(lx) <= b.hx + r && Math.abs(lz) <= b.hz + r;
}

function segmentHitsBlocker(x0, z0, x1, z1, b) {
    const tx0 = (x0 - b.x) * b.axx + (z0 - b.z) * b.axz;
    const tz0 = (x0 - b.x) * b.azx + (z0 - b.z) * b.azz;
    const tx1 = (x1 - b.x) * b.axx + (z1 - b.z) * b.axz;
    const tz1 = (x1 - b.x) * b.azx + (z1 - b.z) * b.azz;
    const dx = tx1 - tx0, dz = tz1 - tz0;
    let enter = 0, leave = 1;
    const clip = (p, q) => {
        if (Math.abs(p) < 1e-9) return q >= 0;
        const t = q / p;
        if (p < 0) { if (t > leave) return false; if (t > enter) enter = t; }
        else { if (t < enter) return false; if (t < leave) leave = t; }
        return true;
    };
    return clip(-dx, tx0 + b.hx) && clip(dx, b.hx - tx0)
        && clip(-dz, tz0 + b.hz) && clip(dz, b.hz - tz0);
}

function buildField(parent, M, x, z, sx, sz, crop) {
    box(parent, crop ? M.fieldGreen : M.fieldSoil, sx, 0.45, sz, x, -0.32, z, false);
    const rows = Math.max(3, Math.floor(sz / 14));
    for (let i = 0; i < rows; i++) {
        const rz = z - sz * 0.5 + (i + 0.5) * sz / rows;
        box(parent, crop ? M.crop : M.earthRidge, sx - 8, 0.22, 1.35, x, 0.05, rz, false);
    }
    count(crop ? 'cropField' : 'fallowField');
}

function buildTree(parent, M, x, z, scale = 1) {
    cylinder(parent, M.wood, 1.2 * scale, 9 * scale, x, 4.5 * scale, z, 8);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(5.5 * scale, 8, 6), M.leaf);
    crown.position.set(x, 11 * scale, z);
    crown.castShadow = true;
    parent.add(crown);
    count('windbreakTree');
}

function buildFence(parent, M, x0, x1, z) {
    box(parent, M.fence, x1 - x0, 0.35, 0.35, (x0 + x1) * 0.5, 6.1, z);
    box(parent, M.fence, x1 - x0, 0.35, 0.35, (x0 + x1) * 0.5, 3.2, z);
    for (let x = x0; x <= x1; x += 22) box(parent, M.fence, 0.5, 12, 0.5, x, 6, z);
    count('airportFenceRun');
}

function buildTower(parent, M) {
    const x = S9_CONTROL_TOWER.x, z = S9_CONTROL_TOWER.z;
    box(parent, M.concrete, 54, 12, 42, x, 6, z);
    box(parent, M.panel, 34, 45, 26, x, 28.5, z);
    box(parent, M.glass, 48, 10, 40, x, 55, z);
    box(parent, M.roof, 54, 2.2, 46, x, 61, z);
    for (const side of [-1, 1]) {
        box(parent, M.frame, 2, 9, 42, x + side * 18, 54.5, z);
        for (let i = -2; i <= 2; i++) box(parent, M.frame, 1.1, 8, 1, x + i * 9, 55, z + side * 20);
    }
    cylinder(parent, M.frame, 0.7, 17, x, 70, z, 10);
    const radar = box(parent, M.white, 9, 1.4, 2.2, x, 79, z);
    radar.rotation.y = 0.45;
    addBlocker(x, z, 27, 21, 62, 0, 'control-tower');
    count('controlTower');
}

function buildHangar(parent, M) {
    const x = S9_CARGO_HANGAR.x + 105, z = S9_CARGO_HANGAR.z;
    // Open apron-facing mouth; three structural walls and visible roof trusses.
    box(parent, M.panel, 4, 43, 104, x - 66, 21.5, z);
    box(parent, M.panel, 4, 43, 104, x + 66, 21.5, z);
    box(parent, M.panel, 132, 43, 4, x, 21.5, z - 50);
    box(parent, M.roof, 136, 3, 108, x, 45, z);
    for (let rz = z - 42; rz <= z + 42; rz += 14) {
        box(parent, M.frame, 136, 1.2, 1.2, x, 42.5, rz);
        for (const sx of [-1, 1]) box(parent, M.frame, 1.2, 42, 1.2, x + sx * 61, 21, rz);
    }
    for (let i = -3; i <= 3; i++) box(parent, M.hazard, 10, 0.18, 2, x + i * 18, 0.16, z + 53);
    addBlocker(x - 66, z, 2, 52, 43, 0, 'hangar-wall');
    addBlocker(x + 66, z, 2, 52, 43, 0, 'hangar-wall');
    addBlocker(x, z - 50, 66, 2, 43, 0, 'hangar-wall');
    count('maintenanceHangar');
}

function wheels(parent, M, points, yaw = 0) {
    for (const p of points) {
        const w = cylinder(parent, M.rubber, 1.75, 1.1, p[0], p[1], p[2], 10, 'z');
        w.rotation.y = yaw;
    }
}

function buildTug(parent, M, x, z) {
    const g = new THREE.Group(); parent.add(g);
    box(g, M.hazard, 12, 3.3, 7, x, 2.4, z);
    box(g, M.white, 5.2, 5.4, 6.4, x - 2.8, 5.5, z);
    box(g, M.glass, 0.5, 2, 4.8, x - 5.5, 6.1, z);
    box(g, M.frame, 10, 0.7, 2.4, x + 10, 1.9, z);
    cylinder(g, M.hazard, 0.65, 1.1, x - 2.8, 9, z, 8);
    wheels(g, M, [[x - 3.5, 1.6, z - 3.6], [x - 3.5, 1.6, z + 3.6], [x + 3.5, 1.6, z - 3.6], [x + 3.5, 1.6, z + 3.6]]);
    addBlocker(x, z, 7, 4.2, 9, 0, 'pushback-tug');
    count('pushbackTug');
}

function buildBaggageTrain(parent, M, x, z) {
    box(parent, M.frame, 11, 1.3, 1, x - 7, 2.1, z);
    for (let i = 0; i < 3; i++) {
        const cx = x + i * 14;
        box(parent, M.frame, 11, 1, 7, cx, 2, z);
        box(parent, i % 2 ? M.panel : M.hazard, 9.5, 4.6, 6.2, cx, 4.8, z);
        box(parent, M.frame, 12.5, 0.45, 0.45, cx, 7.3, z - 3.2);
        box(parent, M.frame, 12.5, 0.45, 0.45, cx, 7.3, z + 3.2);
        wheels(parent, M, [[cx - 3.5, 1.2, z - 3.5], [cx - 3.5, 1.2, z + 3.5], [cx + 3.5, 1.2, z - 3.5], [cx + 3.5, 1.2, z + 3.5]]);
        addBlocker(cx, z, 6, 4, 8, 0, 'baggage-cart');
    }
    count('baggageCart', 3);
}

function buildFuelTruck(parent, M, x, z) {
    box(parent, M.frame, 29, 2, 9, x, 2.2, z);
    box(parent, M.white, 9, 9, 8.6, x + 9, 7.4, z);
    box(parent, M.glass, 0.5, 3.4, 6.4, x + 13.7, 8.7, z);
    cylinder(parent, M.panel, 4.2, 17, x - 4.5, 8, z, 14, 'x');
    for (const pz of [-1, 1]) box(parent, M.hazard, 17, 0.7, 0.25, x - 4.5, 8, z + pz * 4.05);
    cylinder(parent, M.rubber, 1.5, 0.7, x - 4.5, 11, z - 4.6, 10, 'z');
    wheels(parent, M, [[x - 8, 1.7, z - 5], [x - 8, 1.7, z + 5], [x + 8, 1.7, z - 5], [x + 8, 1.7, z + 5]]);
    addBlocker(x, z, 15, 5.5, 13, 0, 'aviation-fuel-truck');
    count('fuelTruck');
}

function buildMobileStairs(parent, M, x, z) {
    box(parent, M.frame, 24, 1.1, 8, x, 1.5, z);
    for (let i = 0; i < 10; i++) {
        box(parent, M.white, 2.2, 0.6, 7, x - 10 + i * 2.1, 2.3 + i * 0.8, z);
    }
    for (const side of [-1, 1]) {
        box(parent, M.hazard, 24, 0.45, 0.45, x, 10.7, z + side * 3.7);
        for (let i = -10; i <= 10; i += 4) box(parent, M.frame, 0.35, 9, 0.35, x + i, 6.2 + i * 0.34, z + side * 3.7);
    }
    wheels(parent, M, [[x - 8, 1.2, z - 4], [x - 8, 1.2, z + 4], [x + 8, 1.2, z - 4], [x + 8, 1.2, z + 4]]);
    addBlocker(x, z, 13, 5, 12, 0, 'mobile-stairs');
    count('mobileStairs');
}

function buildCargoLoader(parent, M, x, z) {
    box(parent, M.frame, 22, 1.2, 9, x, 1.2, z);
    box(parent, M.hazard, 16, 0.8, 10, x, 9.3, z);
    for (const side of [-1, 1]) {
        const a = box(parent, M.frame, 1, 10, 1, x - 4, 5, z + side * 3.2); a.rotation.z = 0.62;
        const b = box(parent, M.frame, 1, 10, 1, x + 4, 5, z + side * 3.2); b.rotation.z = -0.62;
    }
    for (let rx = -6; rx <= 6; rx += 3) cylinder(parent, M.steel, 0.45, 8.4, x + rx, 10, z, 8, 'z');
    wheels(parent, M, [[x - 8, 1.1, z - 5], [x - 8, 1.1, z + 5], [x + 8, 1.1, z - 5], [x + 8, 1.1, z + 5]]);
    addBlocker(x, z, 12, 5.5, 11, 0, 'cargo-loader');
    count('cargoLoader');
}

function buildBaggageTractor(parent, M, x, z) {
    box(parent, M.hazard, 13, 3.1, 7, x, 2.6, z);
    box(parent, M.frame, 5, 6.3, 6.4, x - 3, 6.2, z);
    box(parent, M.glass, 0.45, 2.8, 4.8, x - 5.7, 7.1, z);
    box(parent, M.frame, 7, 0.7, 5.8, x - 1.6, 10, z);
    box(parent, M.steel, 7, 0.9, 1.8, x + 9, 1.5, z);
    cylinder(parent, M.hazard, 0.6, 0.9, x - 1, 11, z, 8);
    wheels(parent, M, [[x - 4, 1.6, z - 3.8], [x - 4, 1.6, z + 3.8],
        [x + 4, 1.6, z - 3.8], [x + 4, 1.6, z + 3.8]]);
    addBlocker(x, z, 7, 4.2, 11, 0, 'baggage-tractor');
    count('baggageTractor');
}

function buildBeltLoader(parent, M, x, z) {
    box(parent, M.frame, 23, 1.2, 8, x, 1.4, z);
    const belt = box(parent, M.rubber, 26, 1, 6.4, x + 1, 7.2, z);
    belt.rotation.z = -0.28;
    for (let i = -10; i <= 10; i += 2.5) {
        const slat = box(parent, M.steel, 0.5, 1.1, 6.7, x + i, 7.2 - i * 0.28, z);
        slat.rotation.z = -0.28;
    }
    for (const side of [-1, 1]) {
        const strut = box(parent, M.frame, 1, 10, 1, x + 6, 5, z + side * 3);
        strut.rotation.z = -0.42;
    }
    box(parent, M.hazard, 4, 4, 7, x - 9, 4, z);
    wheels(parent, M, [[x - 8, 1.2, z - 4], [x - 8, 1.2, z + 4],
        [x + 8, 1.2, z - 4], [x + 8, 1.2, z + 4]]);
    addBlocker(x, z, 14, 5, 13, 0, 'belt-loader');
    count('beltLoader');
}

function buildGroundPowerUnit(parent, M, x, z) {
    box(parent, M.frame, 13, 1.1, 8, x, 1.1, z);
    box(parent, M.hazard, 11, 6.5, 7, x, 4.8, z);
    for (let rx = -4; rx <= 4; rx += 2)
        box(parent, M.ink, 0.4, 4.2, 0.35, x + rx, 5, z - 3.65, false);
    box(parent, M.tech, 3.2, 2.2, 0.3, x + 3, 5.2, z - 3.85, false);
    cylinder(parent, M.frame, 0.55, 13, x + 10, 1.2, z, 8, 'x');
    cylinder(parent, M.rubber, 1.2, 1, x + 16, 1.2, z, 10, 'z');
    wheels(parent, M, [[x - 4, 1, z - 4.3], [x - 4, 1, z + 4.3],
        [x + 4, 1, z - 4.3], [x + 4, 1, z + 4.3]]);
    addBlocker(x, z, 7, 4.5, 9, 0, 'ground-power-unit');
    count('groundPowerUnit');
}

function buildSafetyEquipment(parent, M, x, z) {
    for (let i = 0; i < 8; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.6, 8), M.hazard);
        cone.position.set(x + i * 4, 1.3, z + (i % 2) * 2.5);
        parent.add(cone);
        box(parent, M.white, 1.25, 0.35, 1.25, cone.position.x, 0.35, cone.position.z, false);
    }
    for (let i = 0; i < 6; i++) {
        const cx = x + 3 + i * 5, cz = z + 8;
        const left = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 4), M.hazard);
        left.rotation.z = Math.PI * 0.5; left.position.set(cx, 1.1, cz); parent.add(left);
        const right = left.clone(); right.rotation.z = -Math.PI * 0.5; right.position.x += 2.1; parent.add(right);
        box(parent, M.frame, 4.2, 0.35, 0.7, cx + 1.05, 0.25, cz, false);
    }
    count('safetyCone', 8); count('wheelChockPair', 6);
}

function buildAirportBus(parent, M, x, z) {
    box(parent, M.white, 34, 9, 10, x, 6.2, z);
    box(parent, M.hazard, 34, 1.2, 10.2, x, 5.4, z);
    for (let ix = -13; ix <= 11; ix += 6) {
        box(parent, M.glass, 4.3, 3.2, 0.35, x + ix, 8, z - 5.1);
        box(parent, M.glass, 4.3, 3.2, 0.35, x + ix, 8, z + 5.1);
    }
    wheels(parent, M, [[x - 11, 2, z - 5.3], [x - 11, 2, z + 5.3], [x + 11, 2, z - 5.3], [x + 11, 2, z + 5.3]]);
    addBlocker(x, z, 18, 6, 11, 0, 'apron-bus');
    count('apronBus');
}

function buildAirportBuilding(parent, M) {
    const x = 299480, z = 238;
    // Gedung dibuat sebagai cutaway agar interior tetap terbaca dari kamera
    // top-down. Dinding selatan memiliki satu pintu masuk, dinding timur satu
    // pintu keluar menuju apron/runway.
    box(parent, M.floor, 82, 0.35, 30, x, -0.45, z, false);
    box(parent, M.panel, 2.2, 18, 30, x - 42, 9, z);
    box(parent, M.panel, 2.2, 18, 30, x + 42, 9, z - 9);
    box(parent, M.panel, 2.2, 18, 10, x + 42, 9, z + 10);
    box(parent, M.panel, 82, 18, 2.2, x, 9, z - 15);
    box(parent, M.roof, 86, 1.4, 3, x, 19, z - 14);
    box(parent, M.roof, 3, 1.4, 30, x - 40, 19, z);
    box(parent, M.roof, 3, 1.4, 30, x + 40, 19, z);
    for (let px = x - 30; px <= x + 30; px += 15) {
        box(parent, M.frame, 0.7, 16, 0.7, px, 8, z - 13.6, false);
        box(parent, M.glass, 10, 4, 0.25, px, 12, z - 14.2, false);
    }
    // Interior dressing: desks, lockers and a central security island. None
    // of these is an interactive computer objective.
    for (let i = -2; i <= 2; i++) {
        box(parent, M.panel, 8, 3, 3, x - 25 + i * 12, 1.5, z - 3, false);
        box(parent, M.frame, 8.6, 0.35, 3.5, x - 25 + i * 12, 3.2, z - 3, false);
    }
    box(parent, M.concrete, 18, 2.5, 5, x + 4, 1.25, z + 6, false);
    box(parent, M.hazard, 18, 0.25, 0.35, x + 4, 2.6, z + 3.6, false);
    addBlocker(x - 42, z, 1.1, 15, 18, 0, 'airport-building-wall');
    addBlocker(x + 42, z - 9, 1.1, 6, 18, 0, 'airport-building-wall');
    addBlocker(x + 42, z + 10, 1.1, 5, 18, 0, 'airport-building-wall');
    addBlocker(x, z - 15, 41, 1.1, 18, 0, 'airport-building-wall');
    count('airportBuilding');
}

function buildFuelPump(parent, M) {
    const x = S9_PUMP.x, z = S9_PUMP.z;
    const g = new THREE.Group();
    box(g, M.frame, 10, 0.8, 7, x, 0.4, z, false);
    box(g, M.panel, 6, 7, 4.5, x, 4.2, z, false);
    box(g, M.hazard, 6.4, 0.35, 4.8, x, 6.8, z, false);
    box(g, M.tech, 2.3, 1.5, 0.25, x, 5.1, z - 2.3, false);
    const indicator = box(g, M.hazard, 0.65, 0.65, 0.25, x, 7.25, z - 2.3, false);
    indicator.userData.fuelIndicator = true;
    const hose = cylinder(g, M.rubber, 0.22, 5.5, x - 3.3, 3.3, z + 2.4, 8, 'z');
    hose.rotation.x = 0.22;
    parent.add(g);
    fuelPump = { group: g, indicator };
    addBlocker(x, z, 5.5, 4.2, 8, 0, 'fuel-pump');
    count('fuelPump');
}

function buildRunwayAndApron(parent, M) {
    box(parent, M.grass, 1800, 1, 900, S9_ORIGIN.x, -0.75, 0, false);
    box(parent, M.asphalt, 1660, 0.45, 94, S9_ORIGIN.x + 10, -0.05, 0, false);
    box(parent, M.apron, 750, 0.42, 330, S9_ORIGIN.x + 110, -0.04, -75, false);
    box(parent, M.asphalt, 420, 0.4, 42, S9_ORIGIN.x - 475, -0.02, 155, false);
    box(parent, M.asphalt, 60, 0.4, 170, S9_ORIGIN.x - 335, -0.01, 100, false);
    for (let x = S9_ORIGIN.x - 760; x <= S9_ORIGIN.x + 760; x += 62) {
        box(parent, M.white, 30, 0.08, 1.4, x, 0.23, 0, false);
        for (const z of [-43, 43]) box(parent, M.runwayLight, 3.2, 0.35, 1, x, 0.35, z, false);
    }
    for (let x = S9_ORIGIN.x - 250; x <= S9_ORIGIN.x + 420; x += 48)
        box(parent, M.hazard, 24, 0.08, 0.7, x, 0.22, -118, false);
    for (let i = 0; i < 8; i++) {
        const x = S9_ORIGIN.x - 790 + i * 16;
        box(parent, i % 2 ? M.white : M.hazard, 13, 0.1, 7, x, 0.24, -31, false);
        box(parent, i % 2 ? M.white : M.hazard, 13, 0.1, 7, x, 0.24, 31, false);
    }
    count('runway'); count('apron'); count('taxiway', 2);
}

function createMarker(parent, M, name, x, z, color = PAL.amber) {
    const marker = buildStandMarker(parent, x, z, color);
    markers[name] = marker;
    void M;
    return marker;
}

function addChapterLight(key, color, intensity, distance, x, y, z) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, y, z);
    scene.add(light); // Lampu tetap di scene; root hanya mengendalikan geometri.
    registerStageLight(key, light);
    stageLights.push(light);
    return light;
}

function buildFrontCar(parent, M, x, z, yaw = 0, variant = 0, kind = 'parked-car') {
    // PERSIS model mobil Stage 7: FuturisticSedan/FuturisticSUV pada skala
    // CAMP_M, panjang lokal +X dan muka kendaraan juga +X.
    const colors = [PAL.gunmetal, PAL.concrete, PAL.panel, PAL.hazard, PAL.steel];
    const type = variant % 3 === 0 ? 'suv' : 'sedan';
    const g = type === 'suv'
        ? new FuturisticSUV({ bodyColor: colors[variant % colors.length],
            scale: CAMP_M, enableLights: variant % 4 !== 0 }).group
        : new FuturisticSedan(colors[variant % colors.length]).group;
    if (type === 'sedan') g.scale.setScalar(CAMP_M);
    g.position.set(x, 0, z); g.rotation.y = yaw;
    g.userData.stage7VehicleType = type;
    const spec = STAGE7_ROAD_VEHICLE_SPECS[type];
    const hx = spec.length * CAMP_M * .5;
    const hz = spec.width * CAMP_M * .5;
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    weldOccluder(S9_FRONT_KEY, parent, g, {
        x, z, hx: c * hx + s * hz, hz: s * hx + c * hz,
        top: spec.height * CAMP_M,
    });
    addChapterBlocker(frontBlockers, x, z, hx, hz,
        spec.height * CAMP_M, yaw, kind);
    count(type === 'suv' ? 'frontStage7SUV' : 'frontStage7Sedan');
    count(kind === 'parked-car' ? 'frontParkedCar' : 'frontAbandonedVehicle');
}

function buildFrontBus(parent, M, x, z, yaw = 0, variant = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    const bodyMat = variant & 1 ? M.panel : M.white;
    box(g, bodyMat, 56, 11, 15, 0, 7.5, 0);
    box(g, M.hazard, 56, 1.5, 15.4, 0, 6.4, 0);
    for (let px = -21; px <= 18; px += 8)
        for (const side of [-1, 1]) box(g, M.glass, 6, 3.2, .35,
            px, 9.3, side * 7.6, false);
    for (const px of [-19, 19]) for (const pz of [-7.8, 7.8])
        cylinder(g, M.rubber, 2.5, 1.2, px, 2.5, pz, 10, 'z');
    weldOccluder(S9_FRONT_KEY, parent, g, { x, z, hx: 30, hz: 9, top: 13 });
    addChapterBlocker(frontBlockers, x, z, 29, 8.5, 13, yaw, 'airport-front-bus');
    count('frontBus');
}

function buildFrontVan(parent, M, x, z, yaw = 0, variant = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    const bodyMat = variant & 1 ? M.white : M.panel;
    box(g, bodyMat, 34, 7.5, 13, 0, 5, 0);
    box(g, bodyMat, 12, 4, 13, -10, 10.2, 0);
    box(g, M.glass, 6, 2.8, 13.2, -13, 10.3, 0, false);
    box(g, M.hazard, 8, 1.2, 13.4, 11, 5.6, 0, false);
    for (const px of [-11, 11]) for (const pz of [-6.8, 6.8])
        cylinder(g, M.rubber, 2.2, 1.1, px, 2.2, pz, 10, 'z');
    weldOccluder(S9_FRONT_KEY, parent, g, { x, z, hx: 18, hz: 8, top: 13 });
    addChapterBlocker(frontBlockers, x, z, 17, 7.5, 13, yaw, 'airport-service-van');
    count('frontServiceVan');
}

function buildParkingCanopy(parent, M, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    box(g, M.roof, 196, 1.5, 82, 0, 15, 0);
    // Panel surya lebar memberi massa visual tanpa menambah PointLight.
    for (const px of [-68, -23, 23, 68])
        box(g, M.glass, 38, .7, 72, px, 16.1, 0, false);
    for (const px of [-88, -29, 29, 88]) {
        box(g, M.frame, 2, 15, 2, px, 7.5, 0);
        addChapterBlocker(frontBlockers, x + px, z, 1.5, 1.5, 15,
            0, 'parking-canopy-column');
    }
    weldOccluder(S9_FRONT_KEY, parent, g, { x, z, hx: 98, hz: 41, top: 17 });
    count('frontParkingCanopy');
}

function buildFrontUtilityCabinet(parent, M, x, z, yaw = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    box(g, M.concrete, 11, 1, 8, 0, .5, 0);
    box(g, M.frame, 9, 10, 6, 0, 5.5, 0);
    box(g, M.panel, 7, 7.5, .35, 0, 5.5, -3.15, false);
    for (let i = -2; i <= 2; i++)
        box(g, M.hazard, 1, .35, .2, i * 1.3, 3.2, -3.4, false);
    weldOccluder(S9_FRONT_KEY, parent, g, { x, z, hx: 6, hz: 4.5, top: 11 });
    addChapterBlocker(frontBlockers, x, z, 5.5, 4, 11, yaw, 'front-utility-cabinet');
    count('frontUtilityCabinet');
}

function buildFrontFenceSegment(parent, M, x, z, yaw = 0, length = 94) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    const postCount = Math.max(2, Math.ceil(length / 46));
    for (let i = 0; i <= postCount; i++)
        box(g, M.frame, 1.2, 9, 1.2,
            -length * .5 + length * i / postCount, 4.5, 0);
    for (const y of [2.2, 5.2, 8.2]) box(g, M.fence, length, .7, .7, 0, y, 0);
    const hx = length * .5, hz = 1;
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    weldOccluder(S9_FRONT_KEY, parent, g,
        { x, z, hx: c * hx + s * hz, hz: s * hx + c * hz, top: 9 });
    addChapterBlocker(frontBlockers, x, z, hx, .6, 9, yaw,
        'front-boundary-fence');
    count('frontFenceSegment');
}

function buildFrontBoundaryFenceRun(parent, M, x0, z0, x1, z1, insideX, insideZ) {
    const dx = x1 - x0, dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    const pieces = Math.max(1, Math.ceil(length / 90));
    const yaw = Math.atan2(-dz, dx); // local +X -> arah ruas di bidang dunia
    for (let i = 0; i < pieces; i++) {
        const t = (i + .5) / pieces;
        buildFrontFenceSegment(parent, M, x0 + dx * t, z0 + dz * t,
            yaw, length / pieces);
    }
    const mx = (x0 + x1) * .5, mz = (z0 + z1) * .5;
    frontBoundaryRuns.push({
        x0, z0, x1, z1,
        inside: { x: mx + insideX * 6, z: mz + insideZ * 6 },
        outside: { x: mx - insideX * 6, z: mz - insideZ * 6 },
        midpoint: { x: mx, z: mz },
        segments: pieces,
    });
}

function buildFrontBooth(parent, M, x, z, yaw = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    box(g, M.concrete, 22, 1, 16, 0, .5, 0);
    box(g, M.panel, 18, 10, 13, 0, 5.5, 0);
    for (const side of [-1, 1]) box(g, M.glass, 10, 3.5, .3,
        0, 7, side * 6.65, false);
    box(g, M.roof, 24, 1.5, 18, 0, 11.2, 0);
    weldOccluder(S9_FRONT_KEY, parent, g, { x, z, hx: 12, hz: 9, top: 12 });
    addChapterBlocker(frontBlockers, x, z, 11, 8, 12, yaw, 'security-booth');
    count('frontSecurityBooth');
}

function buildFrontMast(parent, M, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    box(g, M.frame, 1.2, 30, 1.2, 0, 15, 0);
    box(g, M.white, 10, 1, 2.4, 0, 30, 0);
    box(g, M.runwayLight, 7, .35, .5, 0, 29.6, -1.25, false);
    weldOccluder(S9_FRONT_KEY, parent, g, { x, z, hx: 5, hz: 2, top: 31 });
    addChapterBlocker(frontBlockers, x, z, 1.2, 1.2, 30, 0, 'parking-light-mast');
    count('frontLightMast');
}

function buildTrolleyBay(parent, M, x, z, yaw = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    box(g, M.frame, 30, 1.3, 14, 0, .7, 0);
    box(g, M.roof, 34, 1, 18, 0, 10, 0);
    for (const px of [-14, 14]) for (const pz of [-7, 7])
        box(g, M.frame, 1, 10, 1, px, 5, pz);
    for (let i = -3; i <= 3; i++) {
        box(g, M.steel, 5, .6, 3, i * 4, 2, 0);
        cylinder(g, M.rubber, .65, .5, i * 4 - 1.5, 1, 1.5, 8, 'z');
    }
    weldOccluder(S9_FRONT_KEY, parent, g, { x, z, hx: 18, hz: 10, top: 11 });
    addChapterBlocker(frontBlockers, x, z, 17, 9, 11, yaw, 'trolley-bay');
    count('frontTrolleyBay');
}

function buildFrontChapter(parent, M) {
    const statics = new THREE.Group();
    // Ruas tol lama, simpang akses, boulevard frontage, dua kantong parkir dan
    // forecourt terminal membentuk perjalanan hampir 1,6 km unit-game.
    box(statics, M.grass, 1820, 0.8, 850, 305720, -0.7, 80, false);
    box(statics, M.asphalt, 900, 0.45, 126, 305280, -0.06, 160, false);
    box(statics, M.asphalt, 930, 0.45, 168, 306020, -0.05, 160, false);
    box(statics, M.apron, 310, 0.42, 650, 306390, -0.04, 110, false);
    box(statics, M.asphalt, 650, 0.35, 180, 306000, -0.03, -205, false);
    box(statics, M.asphalt, 650, 0.35, 180, 306000, -0.03, 425, false);
    for (let x = 304850; x <= 306500; x += 52) {
        box(statics, M.white, 28, 0.08, 1, x, 0.22, 160, false);
        if (x >= 305560) {
            box(statics, M.hazard, 18, 0.08, 1, x, 0.23, 92, false);
            box(statics, M.hazard, 18, 0.08, 1, x, 0.23, 228, false);
        }
    }
    for (const z of [88, 232])
        box(statics, M.concrete, 1680, 0.8, 8, 305650, 0.15, z, false);
    for (let x = 305720; x <= 306310; x += 46) for (const z of [-205, 425])
        box(statics, M.white, 1, 0.08, 155, x, 0.2, z, false);

    // Gerbang tol empat lajur: dua pulau panjang, pos, kanopi dan portal servis.
    for (const z of [110, 210]) {
        const booth = new THREE.Group();
        box(booth, M.concrete, 74, 1.2, 13, 305160, 0.6, z);
        box(booth, M.panel, 18, 10, 11, 305160, 5.2, z);
        box(booth, M.glass, 8, 3, 0.4, 305151, 6.2, z, false);
        weldOccluder(S9_FRONT_KEY, parent, booth,
            { x: 305160, z, hx: 37, hz: 6.5, top: 11 });
        addChapterBlocker(frontBlockers, 305160, z, 37, 6.5, 11, 0, 'toll-island');
    }
    {
        const canopy = new THREE.Group();
        box(canopy, M.roof, 120, 2, 152, 305160, 15, 160);
        for (const z of [96, 224]) box(canopy, M.frame, 2, 15, 2, 305115, 7.5, z);
        weldOccluder(S9_FRONT_KEY, parent, canopy,
            { x: 305160, z: 160, hx: 60, hz: 76, top: 16 });
    }
    {
        const portal = new THREE.Group();
        box(portal, M.frame, 5, 24, 5, 305430, 12, 52);
        box(portal, M.frame, 5, 24, 5, 305430, 12, 268);
        box(portal, M.frame, 6, 4, 216, 305430, 22, 160);
        weldOccluder(S9_FRONT_KEY, parent, portal,
            { x: 305430, z: 160, hx: 3, hz: 108, top: 24 });
    }

    // Pedestrian bridge dan halte bus membedakan boulevard dari area tol.
    const bridge = new THREE.Group();
    box(bridge, M.frame, 12, 24, 12, 305710, 12, 58);
    box(bridge, M.frame, 12, 24, 12, 305710, 12, 262);
    box(bridge, M.glass, 18, 10, 205, 305710, 20, 160, false);
    weldOccluder(S9_FRONT_KEY, parent, bridge,
        { x: 305710, z: 160, hx: 9, hz: 103, top: 25 });
    addChapterBlocker(frontBlockers, 305710, 58, 6, 6, 24, 0, 'bridge-stair');
    addChapterBlocker(frontBlockers, 305710, 262, 6, 6, 24, 0, 'bridge-stair');
    for (const z of [-110, 330]) {
        const shelter = new THREE.Group();
        box(shelter, M.roof, 86, 2, 22, 305820, 12, z);
        box(shelter, M.glass, 74, 8, .5, 305820, 7, z + 10, false);
        for (const dx of [-35, 35]) box(shelter, M.frame, 2, 12, 2, 305820 + dx, 6, z);
        weldOccluder(S9_FRONT_KEY, parent, shelter,
            { x: 305820, z, hx: 43, hz: 11, top: 13 });
    }

    // Fasad terminal selebar forecourt. Bukaan masuk z=160 tetap 64 unit.
    const facade = new THREE.Group();
    box(facade, M.panel, 14, 36, 410, 306585, 18, -70);
    box(facade, M.panel, 14, 36, 410, 306585, 18, 390);
    for (const z of [-230, -120, 0, 320, 440])
        box(facade, M.glass, 2, 24, 72, 306576, 14, z, false);
    box(facade, M.roof, 110, 3, 820, 306535, 38, 160);
    for (const z of [-260, -140, -20, 340, 460])
        box(facade, M.frame, 3, 36, 3, 306505, 18, z);
    weldOccluder(S9_FRONT_KEY, parent, facade,
        { x: 306550, z: 160, hx: 55, hz: 440, top: 40 });
    addChapterBlocker(frontBlockers, 306585, -70, 7, 205, 36, 0, 'terminal-facade');
    addChapterBlocker(frontBlockers, 306585, 390, 7, 205, 36, 0, 'terminal-facade');

    // Kendaraan mati, bus, pos keamanan, planter dan concrete teeth memecah
    // arena menjadi banyak cover lane tanpa menutup sumbu utama z=160.
    const wrecks = [
        [305360, 48, .08], [305520, 275, -.12], [305880, 38, .05],
        [305940, 280, -.06], [306120, -190, .02], [306250, 430, -.04],
        [306330, 52, .1], [306385, 270, -.08], [306450, -145, .04],
    ];
    wrecks.forEach(([x, z, yaw], i) => buildFrontCar(parent, M, x, z,
        yaw, i + 1, 'abandoned-vehicle'));

    // Parkir depan terminal sengaja padat tetapi teratur: empat baris mobil
    // menyisakan boulevard utama dan sumbu masuk z=160 tetap lapang.
    const parkingRows = [-255, -165, 385, 475];
    let parked = 0;
    for (const z of parkingRows) for (let x = 305760; x <= 306320; x += 70) {
        const dividerZ = z < 0 ? -210 : 430;
        // Model Stage 7 menghadap +X lokal. ±90° membuat panjangnya mengikuti
        // petak z dan bagian DEPAN selalu menunjuk wheel-stop/pembatas tengah.
        const yaw = dividerZ > z ? -Math.PI * .5 : Math.PI * .5;
        buildFrontCar(parent, M, x, z, yaw, parked);
        frontParkingRecords.push({ x, z, yaw, dividerZ });
        parked++;
    }
    // Kanopi surya membuat dua lapangan parkir terbaca sebagai massa arsitektur,
    // bukan hamparan aspal. Kolom berada di sela dua baris mobil.
    for (const x of [305850, 306070, 306290]) {
        buildParkingCanopy(parent, M, x, -210);
        buildParkingCanopy(parent, M, x, 430);
    }
    // Kendaraan servis mengisi tepi terluar lot tanpa menyempitkan rute tempur.
    let van = 0;
    for (const z of [-310, 510]) for (let x = 305650; x <= 306400; x += 150) {
        buildFrontVan(parent, M, x, z, z > 0 ? Math.PI : 0, van++);
    }
    for (const [x, z, yaw] of [[305820, -110, 0], [305820, 330, Math.PI],
        [306395, -285, Math.PI * .5], [306395, 505, Math.PI * .5]])
        buildFrontBus(parent, M, x, z, yaw, z > 0 ? 1 : 0);
    for (const [x, z] of [[305585, 25], [305585, 295], [306360, 15], [306360, 305]])
        buildFrontBooth(parent, M, x, z, z > 160 ? Math.PI : 0);
    for (const [x, z] of [[306490, -270], [306490, -85], [306490, 315], [306490, 485]])
        buildTrolleyBay(parent, M, x, z, Math.PI * .5);
    for (const x of [305650, 305850, 306050, 306250, 306450]) {
        buildFrontMast(parent, M, x, -320);
        buildFrontMast(parent, M, x, 515);
    }
    // Pagar mengikuti PERSIS tepi union walkable. Dulu pagar lot berada 18â€“28
    // unit DI LUAR batas collision, sehingga player lebih dulu menabrak dinding
    // tak terlihat. Tiap run menyimpan sisi dalam/luarnya untuk smoke parity.
    for (const run of [
        [304840, 90, 305480, 90, 0, 1],       // sisi bawah jalan tol
        [304840, 230, 305480, 230, 0, -1],    // sisi atas jalan tol
        [304840, 90, 304840, 230, 1, 0],      // ujung belakang area awal
        [305480, 65, 305520, 65, 0, 1],       // bahu boulevard bawah
        [305480, 255, 305520, 255, 0, -1],    // bahu boulevard atas
        [305480, 65, 305480, 90, 1, 0],       // step pelebaran bawah
        [305480, 230, 305480, 255, 1, 0],     // step pelebaran atas
        [305520, -330, 306570, -330, 0, 1],   // batas luar parkir selatan
        [305520, 490, 306570, 490, 0, -1],    // batas luar parkir utara
        [305520, -330, 305520, 65, 1, 0],     // sisi barat lot selatan
        [305520, 255, 305520, 490, 1, 0],     // sisi barat lot utara
    ]) buildFrontBoundaryFenceRun(parent, M, ...run);
    for (const z of [-275, -195, -115, -35, 335, 405]) {
        buildFrontUtilityCabinet(parent, M, 305555, z, 0);
        buildFrontUtilityCabinet(parent, M, 306515, z, Math.PI);
    }

    for (const [x, z, sx, sz] of [[305980, -35, 90, 18], [306150, 350, 110, 18],
        [306335, -25, 74, 18], [306425, 350, 84, 18]]) {
        const planter = new THREE.Group();
        planter.position.set(x, 0, z);
        box(planter, M.concrete, sx, 3, sz, 0, 1.5, 0);
        const trees = [];
        for (let i = -2; i <= 2; i++) {
            const tx = i * sx * .17, scale = .38 + (i & 1) * .05;
            buildTree(planter, M, tx, 0, scale);
            trees.push({ x: x + tx, z, radius: 5.5 * scale });
        }
        frontPlanterRecords.push({ x, z, hx: sx * .5, hz: sz * .5, trees });
        weldOccluder(S9_FRONT_KEY, parent, planter,
            { x, z, hx: sx * .5, hz: sz * .5, top: 8 });
        addChapterBlocker(frontBlockers, x, z, sx * .5, sz * .5, 8, 0, 'dropoff-planter');
    }
    for (const z of [112, 208]) for (const x of [305520, 305600, 306040, 306120]) {
        box(statics, M.concrete, 22, 2.5, 5, x, 1.25, z);
        addChapterBlocker(frontBlockers, x, z, 11, 2.5, 3, 0, 'security-barrier');
    }

    // Street furniture berbiaya render rendah: seluruhnya digabung ke batch
    // karena tingginya di bawah ambang setengah badan dan tidak bisa menutupi.
    for (const z of [72, 248]) for (let x = 305560; x <= 306500; x += 42) {
        cylinder(statics, M.steel, .8, 4.5, x, 2.25, z, 8);
        count('frontBollard');
    }
    for (let i = 0; i < 36; i++) {
        const x = 305500 + (i % 12) * 78;
        const z = i < 18 ? 103 + (i % 2) * 17 : 200 + (i % 2) * 17;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 3.2, 8), M.hazard);
        cone.position.set(x, 1.6, z); statics.add(cone); count('frontSafetyCone');
    }
    for (const z of [-120, 320]) for (let x = 305650; x <= 306350; x += 100) {
        box(statics, M.frame, 28, 1.2, 8, x, 2.3, z);
        box(statics, M.panel, 28, 3, 1, x, 3.7, z + 3.5);
        count('frontBench');
    }
    for (let i = 0; i < 16; i++) {
        const x = 305620 + (i % 8) * 112, z = i < 8 ? -75 : 285;
        box(statics, M.frame, 5, 5, 5, x, 2.5, z);
        count('frontWasteBin');
    }
    for (let i = 0; i < 24; i++) {
        const x = 305690 + (i % 8) * 82, z = i < 8 ? -290 : i < 16 ? 355 : 505;
        const h = 4 + (i % 2);
        box(statics, i % 3 ? M.panel : M.hazard, 7, h, 5, x, h * .5, z);
        count('frontLuggage');
    }
    // Motor, wheel stop, delineator dan drain grate menambah lapisan skala
    // manusia. Semuanya rendah, dibatch, dan diletakkan di luar sumbu z=160.
    for (const z of [-105, 325]) for (let x = 305930; x <= 306435; x += 22) {
        cylinder(statics, M.rubber, 1.25, .7, x - 2.8, 1.5, z, 8, 'z');
        cylinder(statics, M.rubber, 1.25, .7, x + 2.8, 1.5, z, 8, 'z');
        box(statics, M.frame, 5.8, 1.1, 1.2, x, 2.2, z);
        box(statics, M.panel, 2.8, 1.5, 2.2, x, 3, z);
        box(statics, M.hazard, 1, 2, .7, x - 1.8, 3.8, z, false);
        count('frontMotorcycle');
    }
    for (const z of parkingRows) for (let x = 305745; x <= 306375; x += 35) {
        const dividerZ = z < 0 ? -210 : 430;
        box(statics, M.concrete, 10, .8, 2.2, x, .4,
            z + Math.sign(dividerZ - z) * 18, false);
        count('frontWheelStop');
    }
    for (const z of [78, 242]) for (let x = 305500; x <= 306500; x += 42) {
        box(statics, M.hazard, 2, 2.8, 2, x, 1.4, z, false);
        box(statics, M.white, 1.3, .5, 2.1, x, 2.2, z, false);
        count('frontLaneDelineator');
    }
    for (const z of [-295, -145, 365, 485]) for (let x = 305700; x <= 306400; x += 70) {
        box(statics, M.frame, 24, .18, 4, x, .1, z, false);
        count('frontDrainGrate');
    }
    staticBatch.push(...addMergedStatic(parent, [statics]));
    createMarker(parent, M, 'frontCheckpoint', S9_FRONT_CHECKPOINT.x, S9_FRONT_CHECKPOINT.z);
    createMarker(parent, M, 'building', S9_BUILDING_ENTRY.x, S9_BUILDING_ENTRY.z);
    for (const x of [305050, 305430, 305820, 306180, 306470])
        addChapterLight(S9_FRONT_KEY, PAL.amber, 1.05, 125, x, 26, 160);
    count('frontAccessRoad'); count('frontParkingCourt', 2);
}

function buildInteriorChapter(parent, M) {
    const statics = new THREE.Group();
    const x = S9_INTERIOR_ORIGIN.x;
    box(statics, M.floor, 660, 0.5, 1080, x, -0.35, 0, false);
    // Cutaway terminal shell. Entrance and apron exit are centered openings.
    const wall = (sx, sz, px, pz) => {
        const g = new THREE.Group();
        box(g, M.panel, sx, 22, sz, px, 11, pz);
        weldOccluder(S9_INTERIOR_KEY, parent, g,
            { x: px, z: pz, hx: sx * .5, hz: sz * .5, top: 22 });
    };
    wall(4, 1080, x - 330, 0);
    wall(4, 1080, x + 330, 0);
    for (const z of [-1, 1]) {
        wall(290, 4, x - 185, z * 540);
        wall(290, 4, x + 185, z * 540);
    }
    addChapterBlocker(interiorBlockers, x - 330, 0, 2, 540, 22, 0, 'terminal-wall');
    addChapterBlocker(interiorBlockers, x + 330, 0, 2, 540, 22, 0, 'terminal-wall');
    for (const z of [-540, 540]) {
        addChapterBlocker(interiorBlockers, x - 185, z, 145, 2, 22, 0, 'terminal-wall');
        addChapterBlocker(interiorBlockers, x + 185, z, 145, 2, 22, 0, 'terminal-wall');
    }

    // Check-in hall: long counter islands and queuing rails, with three routes.
    for (const side of [-1, 1]) for (const z of [430, 350]) {
        const px = x + side * 205;
        box(statics, M.panel, 150, 3.5, 14, px, 1.75, z);
        box(statics, M.tech, 9, 2.2, 0.3, px, 4.4, z - 6.1, false);
        addChapterBlocker(interiorBlockers, px, z, 75, 7, 5, 0, 'checkin-island');
        for (let i = -3; i <= 3; i++) {
            box(statics, M.frame, 1, 3, 1, px + i * 20, 1.5, z - 34);
            box(statics, M.frame, 1, 3, 1, px + i * 20, 1.5, z - 62);
        }
    }

    // Security hall at z≈180: six scanner lanes, broken alternate cover.
    for (const px of [x - 250, x - 150, x - 50, x + 50, x + 150, x + 250]) {
        box(statics, M.frame, 28, 11, 18, px, 5.5, 190);
        box(statics, M.hazard, 28, 0.5, 2, px, 11, 190);
        addChapterBlocker(interiorBlockers, px, 190, 14, 9, 12, 0, 'security-scanner');
        box(statics, M.panel, 36, 3, 12, px, 1.5, 145);
        addChapterBlocker(interiorBlockers, px, 145, 18, 6, 4, 0, 'security-table');
    }

    // Concourse: storefront shells at the flanks, central information island,
    // seating banks and service partitions. No location/destination signage.
    for (const side of [-1, 1]) for (const z of [45, -75, -195]) {
        const px = x + side * 270;
        const shop = new THREE.Group();
        box(shop, M.panel, 92, 20, 72, px, 10, z);
        box(shop, M.glass, 76, 12, 1, px, 7, z + 36, false);
        weldOccluder(S9_INTERIOR_KEY, parent, shop,
            { x: px, z, hx: 46, hz: 36, top: 20 });
        addChapterBlocker(interiorBlockers, px, z, 46, 36, 20, 0, 'concourse-shell');
    }
    box(statics, M.concrete, 90, 5, 48, x, 2.5, -40);
    addChapterBlocker(interiorBlockers, x, -40, 45, 24, 6, 0, 'information-island');
    for (const side of [-1, 1]) for (const z of [20, -100, -220]) {
        const px = x + side * 125;
        box(statics, M.frame, 115, 1.4, 18, px, 1.2, z);
        for (let i = -4; i <= 4; i++) box(statics, M.panel, 9, 3, 14, px + i * 12, 2.8, z);
        addChapterBlocker(interiorBlockers, px, z, 58, 9, 5, 0, 'terminal-seating');
    }

    // Baggage reclaim hall and apron-side service cages.
    for (const side of [-1, 1]) for (const z of [-350, -445]) {
        const px = x + side * 185;
        box(statics, M.rubber, 190, 2, 28, px, 1.3, z);
        box(statics, M.frame, 198, 0.7, 34, px, 0.5, z);
        addChapterBlocker(interiorBlockers, px, z, 99, 17, 4, 0, 'baggage-belt');
    }
    for (const side of [-1, 1]) {
        box(statics, M.fence, 120, 15, 3, x + side * 245, 7.5, -500);
        addChapterBlocker(interiorBlockers, x + side * 245, -500,
            60, 2, 15, 0, 'service-cage');
    }

    for (const z of [490, 390, 290, 210, 90, -30, -150, -270, -390, -490]) {
        for (const side of [-1, 1]) {
            const px = x + side * 315;
            const column = new THREE.Group();
            box(column, M.frame, 2, 20, 2, px, 10, z);
            weldOccluder(S9_INTERIOR_KEY, parent, column,
                { x: px, z, hx: 1, hz: 1, top: 20 });
            addChapterBlocker(interiorBlockers, px, z, 1.5, 1.5, 20, 0, 'terminal-column');
        }
    }
    staticBatch.push(...addMergedStatic(parent, [statics]));
    createMarker(parent, M, 'interiorCheckpoint', S9_INTERIOR_CHECKPOINT.x,
        S9_INTERIOR_CHECKPOINT.z);
    createMarker(parent, M, 'buildingExit', S9_BUILDING_EXIT.x, S9_BUILDING_EXIT.z);
    for (const z of [480, 360, 240, 120, 0, -120, -240, -360, -480])
        addChapterLight(S9_INTERIOR_KEY, PAL.white, 1.2, 145, x, 20, z);
    count('playableTerminalInterior');
    count('terminalZone', 4);
}

function buildRunwayServiceApproach(parent, M) {
    // Chapter 3 begins at the apron-side terminal exit, then crosses a service
    // yard, fire lane, taxiway and aircraft stand before reaching the pump.
    box(parent, M.apron, 620, 0.4, 420, 299430, -0.02, 105, false);
    box(parent, M.asphalt, 920, 0.42, 58, 299650, 0, 105, false);
    for (let x = 299180; x <= 300020; x += 46) {
        box(parent, M.white, 24, 0.08, 1, x, 0.23, 105, false);
        box(parent, M.hazard, 20, 0.08, 1, x, 0.23, 76, false);
    }
    // Apron-side terminal fingers flank the exit but leave a broad mouth.
    box(parent, M.panel, 42, 24, 150, 299150, 12, 115);
    box(parent, M.panel, 42, 24, 92, 299150, 12, 273);
    box(parent, M.glass, 120, 14, 18, 299225, 14, 58, false);
    addBlocker(299150, 115, 21, 75, 24, 0, 'apron-terminal-finger');
    addBlocker(299150, 273, 21, 46, 24, 0, 'apron-terminal-finger');

    // Crash-fire station, equipment cages and blast-fence teeth form cover.
    box(parent, M.concrete, 120, 18, 70, 299390, 9, -190);
    for (let i = -2; i <= 2; i++)
        box(parent, M.hazard, 18, 12, 2, 299390 + i * 22, 6, -154);
    addBlocker(299390, -190, 60, 35, 18, 0, 'airport-fire-station');
    for (const z of [205, -45]) {
        box(parent, M.fence, 150, 16, 3, 299610, 8, z);
        addBlocker(299610, z, 75, 2, 16, 0, 'equipment-cage');
    }
    for (let i = 0; i < 9; i++) {
        const x = 299805 + i * 18, z = 225 - (i % 2) * 8;
        box(parent, M.concrete, 12, 8, 4, x, 4, z);
        addBlocker(x, z, 6, 2, 8, 0, 'blast-fence-tooth');
    }
    // Painted aircraft stand arcs approximated with segmented bars.
    for (let i = 0; i < 12; i++) {
        const a = -1.2 + i * .22;
        const x = 299940 + Math.cos(a) * 185;
        const z = 20 + Math.sin(a) * 145;
        const stripe = box(parent, M.hazard, 26, .08, 1.2, x, .24, z, false);
        stripe.rotation.y = -a;
    }
    count('runwayServiceZone'); count('blastFenceTooth', 9);
}

function buildWorld() {
    stageRoot = new THREE.Group();
    stageRoot.name = 'campaign-stage9-three-chapter-container';
    scene.add(stageRoot);
    frontRoot = new THREE.Group();
    frontRoot.name = 'campaign-stage9-front-road';
    interiorRoot = new THREE.Group();
    interiorRoot.name = 'campaign-stage9-terminal-interior';
    worldRoot = new THREE.Group();
    worldRoot.name = 'campaign-stage9-kertajati-rural-airport';
    stageRoot.add(frontRoot, interiorRoot, worldRoot);
    const staticRoot = new THREE.Group();
    const M = {
        grass: material(0x607146, 0.94), fieldGreen: material(0x53683e, 0.96),
        fieldSoil: material(0x795c3c, 0.98), crop: material(0x78904e, 1),
        earthRidge: material(0x5c422c, 1), water: material(0x496c72, 0.48, 0.08),
        asphalt: material(0x363a3b, 0.96), apron: material(0x68655f, 0.94),
        floor: material(PAL.concrete, 0.96), tech: material(PAL.tech, 0.42, 0.05,
            { emissive: PAL.techDim, emissiveIntensity: 0.35 }),
        concrete: material(PAL.concrete), panel: material(PAL.panel), roof: material(PAL.gunmetal, 0.62, 0.38),
        frame: material(PAL.gunmetal, 0.52, 0.52), steel: material(PAL.steel, 0.48, 0.6),
        fence: material(PAL.steel, 0.65, 0.45), rubber: material(PAL.rubber, 0.96),
        wood: material(PAL.wood, 0.96), leaf: material(PAL.leaf, 0.98),
        white: material(PAL.white), hazard: material(PAL.hazard),
        glass: material(0x244750, 0.28, 0.22),
        runwayLight: material(PAL.tech, 0.42, 0.05, { emissive: PAL.techDim, emissiveIntensity: EMISSIVE_MAX }),
    };

    buildFrontChapter(frontRoot, M);
    buildInteriorChapter(interiorRoot, M);

    buildRunwayAndApron(staticRoot, M);
    buildRunwayServiceApproach(staticRoot, M);

    // Complete rural surround: rice/maize/fallow plots, irrigation, windbreaks.
    buildField(staticRoot, M, 299380, -390, 520, 230, true);
    buildField(staticRoot, M, 299980, -430, 540, 190, false);
    buildField(staticRoot, M, 300580, -390, 520, 230, true);
    buildField(staticRoot, M, 299320, 425, 430, 220, false);
    buildField(staticRoot, M, 299840, 445, 500, 190, true);
    buildField(staticRoot, M, 300430, 420, 580, 230, false);
    for (const z of [-300, 315]) box(staticRoot, M.water, 1650, 0.18, 8, 300000, -0.04, z, false);
    count('irrigationCanal', 2);
    for (let x = 299140; x <= 300860; x += 48) {
        buildTree(staticRoot, M, x, -540 + ((x / 48) % 3) * 8, 0.78 + ((x / 48) % 4) * 0.05);
        buildTree(staticRoot, M, x, 550 - ((x / 48) % 3) * 7, 0.74 + ((x / 48) % 5) * 0.04);
    }

    buildFence(staticRoot, M, 299120, 300880, -286);
    buildFence(staticRoot, M, 299120, 300880, 305);
    addBlocker(300000, -286, 880, 0.3, 12, 0, 'perimeter-fence');
    addBlocker(300000, 305, 880, 0.3, 12, 0, 'perimeter-fence');

    // PROP TINGGI = OCCLUDER (2026-08-13): menara, hangar, gedung operasi dan
    // seluruh kendaraan pendukung darat dibangun ke grup sendiri lalu dilas ke
    // dalam dirinya, supaya masing-masing bisa memudar saat menutupi player atau
    // robot — bukan dilebur ke satu batch apron raksasa.
    const occProp = (fn, x, z, radius, top, ...rest) => {
        const g = new THREE.Group();
        fn(g, M, x, z, ...rest);
        weldOccluder(S9_OCC, worldRoot, g, { x, z, radius, top });
    };
    occProp((p) => buildTower(p, M), S9_CONTROL_TOWER.x, S9_CONTROL_TOWER.z, 27, 80);
    occProp((p) => buildHangar(p, M), S9_CARGO_HANGAR.x + 105, S9_CARGO_HANGAR.z, 68, 47);
    // Airport operations building: a playable cutaway interior, not a solid
    // facade. The chapter transition happens at its south/east thresholds.
    {
        const g = new THREE.Group();
        buildAirportBuilding(g, M);
        weldOccluder(S9_OCC, worldRoot, g, { x: 299480, z: 238, radius: 45, top: 20 });
        count('airportOperationsBuilding');
    }

    occProp(buildTug, 300025, -96, 8, 9);
    occProp(buildBaggageTrain, 299930, -190, 22, 8);
    occProp(buildFuelTruck, 300060, 128, 15, 13);
    occProp(buildMobileStairs, 300345, -196, 13, 12);
    occProp(buildCargoLoader, 299865, 102, 12, 11);
    occProp(buildAirportBus, 299755, -174, 18, 11);
    occProp(buildBaggageTractor, 299610, -122, 8, 11);
    occProp(buildBaggageTractor, 300390, 118, 8, 11);
    occProp(buildBeltLoader, 299825, -78, 14, 13);
    occProp(buildBeltLoader, 300365, 62, 14, 13);
    occProp(buildGroundPowerUnit, 300120, 92, 8, 9);
    occProp(buildGroundPowerUnit, 300338, -142, 8, 9);
    buildSafetyEquipment(staticRoot, M, 300005, -42);

    // Pallet/cargo staging with readable straps, labels and forklift lanes.
    for (let i = 0; i < 12; i++) {
        const x = 299815 + (i % 4) * 17, z = 166 + Math.floor(i / 4) * 16;
        const g = new THREE.Group();
        box(g, M.wood, 12, 1, 10, x, 0.7, z);
        box(g, i % 3 ? M.panel : M.hazard, 10, 4 + (i % 2) * 2, 8, x, 3.2, z);
        box(g, M.frame, 0.45, 6, 10.5, x, 3.5, z);
        weldOccluder(S9_OCC, worldRoot, g, { x, z, radius: 7, top: 7 });
        addBlocker(x, z, 6, 5, 7, 0, 'air-cargo-pallet');
    }
    count('airCargoPallet', 12);

    // Apron mast fixtures; actual dynamic lights are deliberately bounded.
    const lampSpecs = [
        [299520, -210], [299690, -215], [299860, -245],
        [300050, 235], [300245, 230], [300420, 180],
    ];
    for (const [x, z] of lampSpecs) {
        const mast = new THREE.Group();
        box(mast, M.frame, 1.1, 28, 1.1, x, 14, z);
        box(mast, M.white, 8, 1, 2.2, x, 28, z);
        weldOccluder(S9_OCC, worldRoot, mast, { x, z, radius: 5, top: 29 });
        const light = new THREE.PointLight(PAL.amber, 1.15, 72);
        light.position.set(x, 26, z);
        scene.add(light);
        registerStageLight(S9_RUNWAY_KEY, light);
        stageLights.push(light);
    }
    count('apronLightMast', lampSpecs.length);

    transport = buildFourEngineTransport();
    worldRoot.add(transport);
    resetTransport(transport, 300272, -47, 0);
    buildFuelPump(worldRoot, M);

    createMarker(worldRoot, M, 'runwayCheckpoint', S9_RUNWAY_CHECKPOINT.x,
        S9_RUNWAY_CHECKPOINT.z);
    createMarker(worldRoot, M, 'pump', S9_PUMP.x, S9_PUMP.z);
    createMarker(worldRoot, M, 'board', S9_BOARD.x, S9_BOARD.z);

    // Static merge is safe because only hero aircraft and markers animate.
    staticBatch.push(...addMergedStatic(worldRoot, [staticRoot]));

    const cell = 14;
    const cols = Math.ceil((S9_BOUNDS.x1 - S9_BOUNDS.x0) / cell);
    const rows = Math.ceil((S9_BOUNDS.z1 - S9_BOUNDS.z0) / cell);
    navGrid = makeNavGrid(S9_BOUNDS.x0, S9_BOUNDS.z0, cell, cols, rows,
        (x, z) => stage9Walkable(x, z, 4) && !stage9BlockedAt(x, z, 3.5));

    const frontCols = Math.ceil((S9_FRONT_BOUNDS.x1 - S9_FRONT_BOUNDS.x0) / cell);
    const frontRows = Math.ceil((S9_FRONT_BOUNDS.z1 - S9_FRONT_BOUNDS.z0) / cell);
    frontNavGrid = makeNavGrid(S9_FRONT_BOUNDS.x0, S9_FRONT_BOUNDS.z0,
        cell, frontCols, frontRows,
        (x, z) => stage9FrontWalkable(x, z, 4) && !stage9BlockedAt(x, z, 3.5));
    const interiorCols = Math.ceil((S9_INTERIOR_BOUNDS.x1 - S9_INTERIOR_BOUNDS.x0) / cell);
    const interiorRows = Math.ceil((S9_INTERIOR_BOUNDS.z1 - S9_INTERIOR_BOUNDS.z0) / cell);
    interiorNavGrid = makeNavGrid(S9_INTERIOR_BOUNDS.x0, S9_INTERIOR_BOUNDS.z0,
        cell, interiorCols, interiorRows,
        (x, z) => stage9InteriorWalkable(x, z, 4) && !stage9BlockedAt(x, z, 3.5));

    registerCampaignWorldRoot({
        key: S9_FRONT_KEY, root: frontRoot, lightsKey: S9_FRONT_KEY, bounds: S9_FRONT_BOUNDS,
        warmupViews: [{ x: S9_START.x, y: 0, z: S9_START.z },
            { x: S9_FRONT_CHECKPOINT.x, y: 0, z: S9_FRONT_CHECKPOINT.z },
            { x: S9_BUILDING_ENTRY.x, y: 0, z: S9_BUILDING_ENTRY.z }],
    });
    registerCampaignWorldRoot({
        key: S9_INTERIOR_KEY, root: interiorRoot,
        lightsKey: S9_INTERIOR_KEY, bounds: S9_INTERIOR_BOUNDS,
        warmupViews: [{ x: S9_BUILDING_START.x, y: 0, z: S9_BUILDING_START.z },
            { x: S9_INTERIOR_CHECKPOINT.x, y: 0, z: S9_INTERIOR_CHECKPOINT.z },
            { x: S9_BUILDING_EXIT.x, y: 0, z: S9_BUILDING_EXIT.z }],
    });
    registerCampaignWorldRoot({
        key: S9_RUNWAY_KEY, root: worldRoot, lightsKey: S9_RUNWAY_KEY, bounds: S9_BOUNDS,
        warmupViews: [
            { x: S9_RUNWAY_START.x, y: 0, z: S9_RUNWAY_START.z },
            { x: S9_RUNWAY_CHECKPOINT.x, y: 0, z: S9_RUNWAY_CHECKPOINT.z },
            { x: S9_PUMP.x, y: 0, z: S9_PUMP.z },
            { x: 300300, y: 0, z: 0 },
        ],
    });
}

export function ensureStage9World() {
    if (!built) { built = true; buildWorld(); }
    return stageRoot;
}

export function stage9FrontWalkable(x, z, radius = 0) {
    const tollRoad = x >= 304840 + radius && x <= 305600 - radius
        && z >= 90 + radius && z <= 230 - radius;
    const boulevard = x >= 305480 + radius && x <= 306545 - radius
        && z >= 65 + radius && z <= 255 - radius;
    const forecourt = x >= 305520 + radius && x <= 306570 - radius
        && z >= -330 + radius && z <= 490 - radius;
    return tollRoad || boulevard || forecourt;
}

export function stage9InteriorWalkable(x, z, radius = 0) {
    return x >= S9_INTERIOR_ORIGIN.x - 318 + radius
        && x <= S9_INTERIOR_ORIGIN.x + 318 - radius
        && z >= -535 + radius && z <= 535 - radius;
}

export function stage9RunwayWalkable(x, z, radius = 0) {
    const runway = x >= 299150 + radius && x <= 300870 - radius
        && z >= -276 + radius && z <= 295 - radius;
    const access = x >= 299300 + radius && x <= 299720 - radius
        && z >= 115 + radius && z <= 286 - radius;
    const hangarApron = x >= 299850 + radius && x <= 300500 - radius
        && z >= -270 + radius && z <= 220 - radius;
    return runway || access || hangarApron;
}

export function stage9Walkable(x, z, radius = 0) {
    return stage9FrontWalkable(x, z, radius)
        || stage9InteriorWalkable(x, z, radius)
        || stage9RunwayWalkable(x, z, radius);
}

export function stage9BlockedAt(x, z, radius = 0) {
    return frontBlockers.some((b) => pointInBlocker(x, z, radius, b))
        || interiorBlockers.some((b) => pointInBlocker(x, z, radius, b))
        || blockers.some((b) => pointInBlocker(x, z, radius, b));
}

export function stage9Resolve(pos, radius, feetY = 0) {
    const list = activeChapter === 'front' ? frontBlockers
        : activeChapter === 'interior' ? interiorBlockers : blockers;
    resolveBlockers(pos, radius, feetY, list);
}

export function stage9SegHitsWall(x0, z0, x1, z1, y = 0) {
    const list = activeChapter === 'front' ? frontBlockers
        : activeChapter === 'interior' ? interiorBlockers : blockers;
    return list.some((b) => b.active && b.bullet && y < b.top
        && segmentHitsBlocker(x0, z0, x1, z1, b));
}

export function stage9GroundHeight() { return 0; }
export function stage9NavGrid(chapter = activeChapter) {
    ensureStage9World();
    if (chapter === 'front') return frontNavGrid;
    if (chapter === 'interior') return interiorNavGrid;
    return navGrid;
}
export function stage9Transport() { ensureStage9World(); return transport; }

export function setStage9WorldChapter(next) {
    activeChapter = next === 'interior' ? 'interior' : next === 'runway' ? 'runway' : 'front';
    return activeChapter;
}

export function stage9SetMarkers(names) {
    ensureStage9World();
    const wanted = new Set(names || []);
    for (const [name, marker] of Object.entries(markers)) marker.visible = wanted.has(name);
}

export function stage9SetFuelPumpOn(on) {
    ensureStage9World();
    if (!fuelPump) return;
    const mat = fuelPump.indicator.material;
    mat.color.setHex(on ? PAL.tech : PAL.hazard);
    mat.emissive.setHex(on ? PAL.techDim : PAL.hazard);
}

export function stage9UpdateWorld(dt, elapsed, fuel, pumpOn, takeoff) {
    if (!built) return;
    updateTransport(transport, dt, fuel, takeoff);
    if (fuelPump) {
        const blink = pumpOn && Math.sin(elapsed * 8) > -0.35;
        fuelPump.indicator.material.emissiveIntensity = blink ? 0.9 : 0.18;
    }
    for (const marker of Object.values(markers)) if (marker.visible) {
        pulseStandMarker(marker, elapsed * 4);
    }
    const occKey = activeChapter === 'front' ? S9_FRONT_KEY
        : activeChapter === 'interior' ? S9_INTERIOR_KEY : S9_OCC;
    updateStageOccluders(occKey, dt);
}

// Dipanggil dari `enter()` stage: seluruh prop kembali opak.
export function resetStage9Occluders() {
    resetStageOccluders(S9_FRONT_KEY);
    resetStageOccluders(S9_INTERIOR_KEY);
    resetStageOccluders(S9_OCC);
}

export function stage9SupplyPlacements() {
    return {
        crates: [
            { x: 305835, z: 165 }, { x: 306105, z: 132 },
            { x: 311925, z: 148 }, { x: 312000, z: 115 },
            ...crateCandidates.map(([x, z]) => ({ x: S9_ORIGIN.x + x, z })),
        ],
        barrels: [
            { x: 305835, z: 135 }, { x: 306090, z: 182 },
            { x: 311980, z: 70 }, { x: 312070, z: -42 },
            ...barrelCandidates.map(([x, z]) => ({ x: S9_ORIGIN.x + x, z })),
        ],
        drops: [
            { x: 305970, z: 178, type: 'ammo', weapon: 'pistol' },
            { x: 312070, z: 145, type: 'medkit' },
            { x: 299970, z: 84, type: 'ammo', weapon: 'rifle' },
            { x: 300370, z: 86, type: 'medkit' },
        ],
    };
}

export function stage9EncounterPoints(name) {
    const sets = {
        frontToll: [[304990, 125], [305000, 205], [305115, 160], [305270, 110],
            [305310, 215], [305440, 145], [305520, 75], [305545, 245]],
        frontForecourt: [[305760, 85], [305780, 245], [305900, -90], [305960, 315],
            [306080, 70], [306160, 250], [306290, 145], [306400, 235], [306470, 75]],
        interiorCheckin: [[311760, 480], [312000, 470], [312240, 480], [311820, 300],
            [312000, 285], [312180, 300], [311720, 235], [312280, 235], [312000, 110]],
        interiorConcourse: [[311760, 85], [312000, 90], [312240, 85], [311810, -35],
            [312190, -35], [311800, -160], [312000, -165], [312200, -160],
            [311850, -285], [312150, -285], [312000, -495]],
        runwayApron: [[299250, 215], [299300, 105], [299380, 35], [299440, 115],
            [299520, 270], [299650, 115], [299720, 35], [299750, 175]],
        runwayAircraft: [[299850, 105], [299920, 15], [300020, 124], [300060, 15],
            [300080, -208], [300170, -235], [300330, -218], [300410, -95],
            [300420, 85], [300320, 162]],
    };
    return (sets[name] || sets.frontToll).map(([x, z]) => ({ x, z }));
}

export function stage9RadarLandmarks() {
    return [
        { x: S9_BUILDING_ENTRY.x, z: S9_BUILDING_ENTRY.z, type: 'objective' },
        { x: S9_PUMP.x, z: S9_PUMP.z, type: 'objective' },
        { x: 300272, z: -47, type: 'vehicle' },
    ];
}

export function stage9WorldDebug() {
    ensureStage9World();
    const occ = [S9_FRONT_KEY, S9_INTERIOR_KEY, S9_OCC].map(occlusionDebug);
    const blockerTotal = frontBlockers.length + interiorBlockers.length + blockers.length;
    const frontPropertyCount = ['frontParkedCar', 'frontAbandonedVehicle', 'frontBus',
        'frontServiceVan', 'frontParkingCanopy', 'frontUtilityCabinet', 'frontFenceSegment',
        'frontSecurityBooth', 'frontLightMast', 'frontTrolleyBay', 'frontBollard',
        'frontSafetyCone', 'frontBench', 'frontWasteBin', 'frontLuggage',
        'frontMotorcycle', 'frontWheelStop', 'frontLaneDelineator', 'frontDrainGrate']
        .reduce((n, key) => n + (semantic[key] || 0), 0);
    const parkingFacingDivider = frontParkingRecords.every((p) => {
        const frontZ = -Math.sin(p.yaw); // muka model Stage 7 = +X lokal
        return Math.abs(Math.cos(p.yaw)) < 1e-6
            && frontZ * (p.dividerZ - p.z) > 0;
    });
    const planterTreesInside = frontPlanterRecords.every((p) => p.trees.every((t) =>
        Math.abs(t.x - p.x) + t.radius <= p.hx + 1e-6
        && Math.abs(t.z - p.z) + t.radius <= p.hz + 1e-6));
    return {
        built, origin: { ...S9_ORIGIN }, bounds: { ...S9_BOUNDS }, deterministic: true,
        theme: 'rural-kertajati-airport-perimeter',
        occluders: { count: occ.reduce((n, x) => n + (x?.count || 0), 0), chapters: {
            front: occ[0], interior: occ[1], runway: occ[2],
        } },
        cityBuildingCount: 0,
        rural: {
            cropFields: semantic.cropField || 0,
            fallowFields: semantic.fallowField || 0,
            irrigationCanals: semantic.irrigationCanal || 0,
            windbreakTrees: semantic.windbreakTree || 0,
        },
        airport: {
            runway: semantic.runway || 0, apron: semantic.apron || 0,
            controlTowers: semantic.controlTower || 0,
            hangars: semantic.maintenanceHangar || 0,
            operationsBuildings: semantic.airportOperationsBuilding || 0,
            playableBuildings: semantic.playableTerminalInterior || 0,
            serviceEquipment: {
                pushbackTugs: semantic.pushbackTug || 0,
                baggageCarts: semantic.baggageCart || 0,
                fuelTrucks: semantic.fuelTruck || 0,
                mobileStairs: semantic.mobileStairs || 0,
                cargoLoaders: semantic.cargoLoader || 0,
                apronBuses: semantic.apronBus || 0,
                baggageTractors: semantic.baggageTractor || 0,
                beltLoaders: semantic.beltLoader || 0,
                groundPowerUnits: semantic.groundPowerUnit || 0,
                safetyCones: semantic.safetyCone || 0,
                wheelChockPairs: semantic.wheelChockPair || 0,
                cargoPallets: semantic.airCargoPallet || 0,
                fuelPumps: semantic.fuelPump || 0,
            },
        },
        aircraft: transportDebug(transport),
        blockers: { total: blockerTotal, bullet: [...frontBlockers, ...interiorBlockers, ...blockers]
            .filter((b) => b.bullet).length },
        nav: navGrid ? { cols: navGrid.cols, rows: navGrid.rows, cell: navGrid.cell } : null,
        chapters: {
            active: activeChapter,
            front: { key: S9_FRONT_KEY, bounds: { ...S9_FRONT_BOUNDS },
                blockers: frontBlockers.length, nav: !!frontNavGrid },
            interior: { key: S9_INTERIOR_KEY, bounds: { ...S9_INTERIOR_BOUNDS },
                blockers: interiorBlockers.length, nav: !!interiorNavGrid },
            runway: { key: S9_RUNWAY_KEY, bounds: { ...S9_BOUNDS },
                blockers: blockers.length, nav: !!navGrid },
        },
        complexity: {
            front: {
                width: S9_FRONT_BOUNDS.x1 - S9_FRONT_BOUNDS.x0,
                depth: S9_FRONT_BOUNDS.z1 - S9_FRONT_BOUNDS.z0,
                zones: 3,
                parkingCourts: semantic.frontParkingCourt || 0,
                abandonedVehicles: semantic.frontAbandonedVehicle || 0,
                parkedCars: semantic.frontParkedCar || 0,
                stage7CarModels: {
                    sedans: semantic.frontStage7Sedan || 0,
                    suvs: semantic.frontStage7SUV || 0,
                },
                parkingFacingDivider,
                planters: {
                    count: frontPlanterRecords.length,
                    treesInside: planterTreesInside,
                },
                buses: semantic.frontBus || 0,
                serviceVans: semantic.frontServiceVan || 0,
                parkingCanopies: semantic.frontParkingCanopy || 0,
                utilityCabinets: semantic.frontUtilityCabinet || 0,
                fenceSegments: semantic.frontFenceSegment || 0,
                boundaryFences: {
                    runs: frontBoundaryRuns.map((r) => ({
                        x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1,
                        inside: { ...r.inside }, outside: { ...r.outside },
                        midpoint: { ...r.midpoint }, segments: r.segments,
                    })),
                },
                securityBooths: semantic.frontSecurityBooth || 0,
                lightMasts: semantic.frontLightMast || 0,
                trolleyBays: semantic.frontTrolleyBay || 0,
                bollards: semantic.frontBollard || 0,
                safetyCones: semantic.frontSafetyCone || 0,
                benches: semantic.frontBench || 0,
                wasteBins: semantic.frontWasteBin || 0,
                luggage: semantic.frontLuggage || 0,
                motorcycles: semantic.frontMotorcycle || 0,
                wheelStops: semantic.frontWheelStop || 0,
                laneDelineators: semantic.frontLaneDelineator || 0,
                drainGrates: semantic.frontDrainGrate || 0,
                propertyCount: frontPropertyCount,
                occluders: occ[0]?.count || 0,
            },
            interior: {
                width: S9_INTERIOR_BOUNDS.x1 - S9_INTERIOR_BOUNDS.x0,
                depth: S9_INTERIOR_BOUNDS.z1 - S9_INTERIOR_BOUNDS.z0,
                zones: semantic.terminalZone || 0,
            },
            runway: {
                travelDistance: Math.hypot(S9_BOARD.x - S9_RUNWAY_START.x,
                    S9_BOARD.z - S9_RUNWAY_START.z),
                serviceZones: semantic.runwayServiceZone || 0,
                blastFenceTeeth: semantic.blastFenceTooth || 0,
            },
        },
        staticBatches: staticBatch.length,
        pointLights: stageLights.length,
        markers: Object.keys(markers),
        supplies: { crateCandidates: crateCandidates.length, barrelCandidates: barrelCandidates.length },
    };
}
