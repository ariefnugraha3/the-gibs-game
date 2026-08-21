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
export const S9_BUILDING_START = Object.freeze({ x: 312285, z: 245 });
export const S9_INTERIOR_CHECKPOINT = Object.freeze({ x: 312025, z: 55 });
export const S9_BUILDING_EXIT = Object.freeze({ x: 311700, z: -275 });
export const S9_RUNWAY_START = Object.freeze({ x: 299125, z: 180 });
export const S9_RUNWAY_CHECKPOINT = Object.freeze({ x: 300055, z: 55 });
export const S9_PUMP = Object.freeze({ x: 300800, z: 180 });
export const S9_AIRCRAFT = Object.freeze({ x: 300700, z: -220 });
export const S9_BOARD = Object.freeze({ x: 300662, z: -220 });
const S9_CONTROL_TOWER = Object.freeze({ x: 299995, z: 455 });
const S9_CARGO_HANGAR = Object.freeze({ x: 300650, z: 250 });
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
const interiorLayoutRecords = {
    zones: [], amenityRows: { north: [], south: [] },
    checkinCounters: 0, securityLanes: 0, seatBanks: 0,
    selfCheckKiosks: 0, baggageBelts: 0,
};
const runwayLayoutRecords = {
    zones: [], parkedAircraft: 0, jetBridges: 0,
    taxiwayConnectors: 0, fireStations: 0,
};
let fuelPump = null;

const crateCandidates = [
    [-730, 85], [-560, 40], [-390, 80], [-220, 40], [-70, 80],
    [90, 40], [240, 65], [380, 40], [520, 65], [680, 40],
];
const barrelCandidates = [
    [-700, 120], [-610, 45], [-470, 115], [-320, 45], [-170, 65],
    [-30, 45], [110, 80], [250, 45], [390, 75], [500, 45],
    [610, 70], [700, 45], [720, -95], [820, -220],
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
    const x = S9_CARGO_HANGAR.x, z = S9_CARGO_HANGAR.z;
    // Hanggar tiga bentang di sisi kanan-atas denah. Mulutnya terbuka ke
    // SELATAN (arah taxiway/runway), sedangkan dinding belakang berada di utara.
    box(parent, M.panel, 4, 43, 120, x - 125, 21.5, z);
    box(parent, M.panel, 4, 43, 120, x + 125, 21.5, z);
    box(parent, M.panel, 250, 43, 4, x, 21.5, z + 58);
    for (const bayX of [x - 83, x, x + 83]) {
        const roof = box(parent, M.roof, 82, 3, 124, bayX, 45, z);
        roof.rotation.z = (bayX === x ? -1 : 1) * .025;
    }
    for (let rz = z - 50; rz <= z + 50; rz += 16) {
        box(parent, M.frame, 250, 1.2, 1.2, x, 42.5, rz);
        for (const px of [x - 120, x - 42, x + 42, x + 120])
            box(parent, M.frame, 1.2, 42, 1.2, px, 21, rz);
    }
    for (let i = -5; i <= 5; i++)
        box(parent, M.hazard, 14, 0.18, 2, x + i * 21, 0.16, z - 63);
    addBlocker(x - 125, z, 2, 60, 43, 0, 'hangar-wall');
    addBlocker(x + 125, z, 2, 60, 43, 0, 'hangar-wall');
    addBlocker(x, z + 58, 125, 2, 43, 0, 'hangar-wall');
    count('maintenanceHangar');
}

function buildParkedAirliner(parent, M, x, z, variant = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = variant & 1 ? M.panel : M.white;
    cylinder(g, body, 4.2, 44, 0, 7, 0, 16, 'z');
    const nose = new THREE.Mesh(new THREE.SphereGeometry(4.15, 12, 8), body);
    nose.position.set(0, 7, 22); nose.scale.z = 1.35; g.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(4, 11, 12), body);
    tail.position.set(0, 7, -26); tail.rotation.x = -Math.PI * .5; g.add(tail);
    box(g, body, 42, 1.1, 9, 0, 9.2, 1);
    box(g, M.frame, 48, .35, 4, 0, 8.6, -1);
    box(g, body, 18, .8, 7, 0, 10.5, -19);
    const fin = box(g, variant % 3 ? M.hazard : M.tech,
        2.2, 10, 10, 0, 14, -20);
    fin.rotation.x = -.18;
    for (const side of [-1, 1]) for (let pz = -13; pz <= 15; pz += 4)
        box(g, M.glass, .35, .7, 1.8, side * 4.05, 8.2, pz, false);
    for (const px of [-17, 17])
        cylinder(g, M.frame, 2.4, 6.5, px, 6.4, 1, 12, 'z');
    weldOccluder(S9_OCC, parent, g, { x, z, hx: 25, hz: 31, top: 19 });
    addBlocker(x, z, 24, 29, 16, 0, 'parked-airliner');
    count('parkedAirliner');
    runwayLayoutRecords.parkedAircraft++;
}

function buildJetBridge(parent, M, x) {
    const z = 270;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    box(g, M.frame, 17, 3, 122, 0, 19, 0);
    box(g, M.panel, 14, 7, 118, 0, 21, 0);
    for (let pz = -50; pz <= 50; pz += 20)
        box(g, M.glass, 14.3, 3, 7, 0, 22, pz, false);
    box(g, M.frame, 25, 12, 22, 0, 16, -60);
    for (const pz of [-28, 28]) {
        box(g, M.frame, 2, 18, 2, -6, 9, pz);
        box(g, M.frame, 2, 18, 2, 6, 9, pz);
        addBlocker(x - 6, z + pz, 1.2, 1.2, 18, 0, 'jet-bridge-column');
        addBlocker(x + 6, z + pz, 1.2, 1.2, 18, 0, 'jet-bridge-column');
    }
    weldOccluder(S9_OCC, parent, g, { x, z, hx: 13, hz: 63, top: 25 });
    count('jetBridge');
    runwayLayoutRecords.jetBridges++;
}

function buildFireStation(parent, M, x, z) {
    box(parent, M.concrete, 94, 18, 62, x, 9, z);
    box(parent, M.roof, 100, 2, 68, x, 19, z);
    for (let i = -1; i <= 1; i++) {
        const px = x + i * 28;
        box(parent, M.hazard, 22, 12, 2, px, 6, z - 31.5);
        for (let y = 2; y <= 10; y += 2)
            box(parent, M.frame, 22, .35, .35, px, y, z - 32.6, false);
    }
    box(parent, M.panel, 28, 6, 8, x, 3, z + 35);
    addBlocker(x, z, 47, 31, 20, 0, 'airport-fire-station');
    count('airportFireStation');
    runwayLayoutRecords.fireStations++;
    runwayLayoutRecords.zones.push({
        kind: 'fire-station', x, z, hx: 47, hz: 31,
    });
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
    // Translasi denah user: utara/+z = apron dan fasilitas; taxiway melintang
    // di tengah; runway 14–32 melintang di selatan/-z.
    box(parent, M.grass, 1800, 1, 1120, S9_ORIGIN.x, -0.75, 30, false);
    box(parent, M.apron, 940, .42, 250, 299580, -.04, 180, false);
    box(parent, M.apron, 800, .42, 310, 300450, -.04, 175, false);
    box(parent, M.asphalt, 1760, .44, 70, 300000, -.04, 25, false);
    box(parent, M.asphalt, 1720, .46, 110, 300010, -.03, -220, false);
    runwayLayoutRecords.zones.push(
        { kind: 'apron', x: 299580, z: 180, hx: 470, hz: 125 },
        { kind: 'service-yard', x: 300450, z: 175, hx: 400, hz: 155 },
        { kind: 'taxiway-b', x: 300000, z: 25, hx: 880, hz: 35 },
        { kind: 'runway-14-32', x: 300010, z: -220, hx: 860, hz: 55 },
    );

    // Tiga konektor C3/C2/D1 dari taxiway ke runway.
    for (const x of [299860, 300250, 300700]) {
        box(parent, M.asphalt, 86, .43, 180, x, -.02, -87.5, false);
        box(parent, M.hazard, 2, .08, 160, x, .23, -87.5, false);
        for (const side of [-1, 1])
            box(parent, M.hazard, 1, .08, 145, x + side * 31, .23, -87.5, false);
        runwayLayoutRecords.taxiwayConnectors++;
    }

    // Garis tengah taxiway dan panduan lima stand apron.
    box(parent, M.hazard, 1710, .08, 1.5, 300000, .23, 25, false);
    for (const x of [299250, 299425, 299600, 299775, 299950]) {
        box(parent, M.hazard, 1.4, .08, 128, x, .23, 124, false);
        for (const side of [-1, 1]) {
            const branch = box(parent, M.hazard, 38, .08, 1.2,
                x + side * 15, .23, 72, false);
            branch.rotation.y = side * .48;
        }
    }

    // Markah runway: centreline, edge light dan threshold bar pada kedua ujung.
    for (let x = 299205; x <= 300815; x += 68) {
        box(parent, M.white, 32, .08, 2, x, .24, -220, false);
        for (const z of [-270, -170])
            box(parent, M.runwayLight, 3.2, .35, 1, x, .35, z, false);
    }
    for (const edgeX of [299175, 300845]) for (let i = -4; i <= 4; i++)
        box(parent, M.white, 5, .1, 8, edgeX + i * 8, .24, -220, false);
    for (let i = 0; i < 6; i++) {
        box(parent, M.hazard, 18, .08, 2, 299175 + i * 18, .23, -155, false);
        box(parent, M.hazard, 18, .08, 2, 300845 - i * 18, .23, -285, false);
    }
    count('runway'); count('apron'); count('taxiway', 4);
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

    // Kisi lantai krem mengikuti bahasa visual denah bandara: aula check-in
    // terang di kanan dan ruang tunggu berkarpet gelap di kiri tetap terbaca
    // sebagai dua massa besar meski dilihat dari kamera top-down.
    for (let px = x - 300; px <= x + 300; px += 40)
        box(statics, M.panel, .55, .08, 1040, px, -.02, 0, false);
    for (let pz = -500; pz <= 500; pz += 40)
        box(statics, M.panel, 620, .08, .55, x, -.01, pz, false);
    box(statics, M.asphalt, 270, .08, 700, x - 185, .03, -5, false);

    const recordZone = (kind, px, pz, hx, hz, extra = null) => {
        const zone = { kind, x: px, z: pz, hx, hz, ...(extra || {}) };
        interiorLayoutRecords.zones.push(zone);
        return zone;
    };
    const wall = (sx, sz, px, pz, kind = 'terminal-wall') => {
        const g = new THREE.Group();
        box(g, M.panel, sx, 22, sz, px, 11, pz);
        weldOccluder(S9_INTERIOR_KEY, parent, g,
            { x: px, z: pz, hx: sx * .5, hz: sz * .5, top: 22 });
        addChapterBlocker(interiorBlockers, px, pz, sx * .5, sz * .5,
            22, 0, kind);
    };

    // Selubung cutaway. Bukaan timur adalah pintu dari forecourt; bukaan barat
    // di ruang tunggu adalah jalur apron. Dinding utara/selatan tetap utuh.
    wall(4, 785, x - 330, 147.5);
    wall(4, 235, x - 330, -422.5);
    wall(4, 723, x + 330, -178.5);
    wall(4, 285, x + 330, 397.5);
    wall(660, 4, x, 540);
    wall(660, 4, x, -540);

    // Dua deret fasilitas pada denah: toko/restoran/kafe/toilet menempel pada
    // sisi utara dan selatan ruang tunggu. Bentuk dibedakan lewat isi, tanpa
    // papan nama atau wayfinding lokasi.
    const buildAmenity = (kind, cx, cz, width, depth, frontDir, row) => {
        const left = cx - width * .5, right = cx + width * .5;
        const backZ = cz - frontDir * depth * .5;
        box(statics, M.wood, width - 5, .14, depth - 5, cx, -.02, cz, false);
        // Tiga dinding didaftarkan sendiri-sendiri: toko berongga tidak boleh
        // memakai satu footprint occluder sebesar seluruh ruang kosongnya.
        wall(3, depth, left, cz, `${kind}-partition`);
        wall(3, depth, right, cz, `${kind}-partition`);
        wall(width, 3, cx, backZ, `${kind}-back-wall`);
        box(statics, M.frame, width, 2, 3,
            cx, 18, cz + frontDir * depth * .5);

        if (kind === 'souvenir') {
            for (let i = -1; i <= 1; i++) {
                const px = cx + i * width * .24;
                const shelf = new THREE.Group();
                box(shelf, M.wood, 13, 8, 7, px, 4, backZ + frontDir * 18);
                box(shelf, M.hazard, 8, 1, 4,
                    px, 8.5, backZ + frontDir * 18, false);
                weldOccluder(S9_INTERIOR_KEY, parent, shelf, {
                    x: px, z: backZ + frontDir * 18, hx: 6.5, hz: 3.5, top: 9,
                });
                addChapterBlocker(interiorBlockers, px, backZ + frontDir * 18,
                    6.5, 3.5, 9, 0, 'souvenir-shelf');
            }
        } else if (kind === 'restaurant') {
            for (const ox of [-.26, .26]) for (const oz of [-.20, .20]) {
                const px = cx + ox * width, pz = cz + oz * depth;
                box(statics, M.wood, 18, 2, 12, px, 3.6, pz);
                for (const dz of [-9, 9]) box(statics, M.panel, 12, 3, 5,
                    px, 1.7, pz + dz);
                addChapterBlocker(interiorBlockers, px, pz, 9, 6, 5,
                    0, 'restaurant-table');
            }
        } else if (kind === 'cafe') {
            const counterZ = backZ + frontDir * 20;
            box(statics, M.wood, width - 16, 5, 12, cx, 2.5, counterZ);
            for (let i = -2; i <= 2; i++) cylinder(statics, M.steel, 2.2, 3,
                cx + i * (width - 24) / 5, 1.5, counterZ + frontDir * 15, 8);
            addChapterBlocker(interiorBlockers, cx, counterZ,
                (width - 16) * .5, 6, 6, 0, 'cafe-counter');
        } else {
            const stallDepth = Math.max(28, depth * .42);
            for (let i = -1; i <= 1; i++) {
                const px = cx + i * (width - 18) / 3;
                const partition = new THREE.Group();
                box(partition, M.glass, 2, 12, stallDepth, px, 6,
                    backZ + frontDir * stallDepth * .5, false);
                weldOccluder(S9_INTERIOR_KEY, parent, partition, {
                    x: px, z: backZ + frontDir * stallDepth * .5,
                    hx: 1, hz: stallDepth * .5, top: 12,
                });
                cylinder(statics, M.white, 4, 3, px + 7, 1.5,
                    backZ + frontDir * 12, 10);
                addChapterBlocker(interiorBlockers, px + 7,
                    backZ + frontDir * 12, 4, 4, 4, 0, 'toilet-fixture');
            }
        }
        recordZone(kind, cx, cz, width * .5, depth * .5, { row });
        interiorLayoutRecords.amenityRows[row].push(kind);
    };
    buildAmenity('souvenir', x - 275, 450, 80, 170, -1, 'north');
    buildAmenity('restaurant', x - 165, 450, 130, 170, -1, 'north');
    buildAmenity('cafe', x - 48, 450, 95, 170, -1, 'north');
    buildAmenity('toilet', x + 43, 450, 75, 170, -1, 'north');
    buildAmenity('souvenir', x - 285, -450, 60, 170, 1, 'south');
    buildAmenity('restaurant', x - 190, -450, 125, 170, 1, 'south');
    buildAmenity('cafe', x - 70, -450, 105, 170, 1, 'south');
    buildAmenity('toilet', x + 35, -450, 95, 170, 1, 'south');

    // Aula check-in menempati bidang kanan yang lapang seperti referensi.
    // Dua pulau konter memanjang berada di bagian atas; jalur antre hanya
    // berupa rel rendah agar tiga koridor tempur tetap terbuka.
    recordZone('checkin-hall', x + 205, 70, 115, 445);
    for (const z of [455, 350]) {
        box(statics, M.frame, 212, 1.1, 22, x + 205, .7, z);
        for (let i = -4; i <= 4; i++) {
            const px = x + 205 + i * 22;
            box(statics, M.panel, 19, 5, 16, px, 2.6, z);
            box(statics, M.tech, 9, 2.2, .3, px, 5.1, z - 8.1, false);
        }
        addChapterBlocker(interiorBlockers, x + 205, z, 106, 11,
            6, 0, 'checkin-island');
        interiorLayoutRecords.checkinCounters++;
        for (let i = -4; i <= 4; i++) for (const dz of [-35, -65]) {
            const px = x + 205 + i * 22;
            cylinder(statics, M.frame, .7, 3, px, 1.5, z + dz, 8);
            if (i < 4) box(statics, M.frame, 21, .35, .35,
                px + 11, 2.7, z + dz, false);
        }
    }

    // Empat kiosk mandiri di tengah aula kanan.
    for (let i = 0; i < 4; i++) {
        const px = x + 135 + i * 48, pz = -35;
        box(statics, M.frame, 12, 3, 10, px, 1.5, pz);
        const screen = box(statics, M.tech, 8, 9, 2, px, 6, pz, false);
        screen.rotation.x = -.12;
        addChapterBlocker(interiorBlockers, px, pz, 6, 5, 11,
            0, 'self-check-kiosk');
        interiorLayoutRecords.selfCheckKiosks++;
    }

    // Ruang pemeriksaan keamanan berada tepat di antara aula kanan dan ruang
    // tunggu kiri. Dua bukaan samping sejajar dengan lane atas; lane bawah
    // memberi pilihan cover dan menggemakan dua stasiun pada denah.
    recordZone('security-screening', x + 25, 45, 70, 190);
    wall(140, 4, x + 25, 235, 'security-wall');
    wall(140, 4, x + 25, -145, 'security-wall');
    for (const px of [x - 45, x + 95]) {
        wall(4, 165, px, -62.5, 'security-wall');
        wall(4, 145, px, 162.5, 'security-wall');
    }
    box(statics, M.white, 132, .1, 370, x + 25, .06, 45, false);
    for (const laneZ of [55, -55]) {
        const gateX = x + 25;
        for (const dz of [-12, 12]) {
            box(statics, M.frame, 4, 13, 4, gateX, 6.5, laneZ + dz);
            addChapterBlocker(interiorBlockers, gateX, laneZ + dz,
                2, 2, 13, 0, 'security-scanner-post');
        }
        box(statics, M.hazard, 4, 2, 28, gateX, 13, laneZ);
        box(statics, M.panel, 36, 4, 10, x + 68, 2, laneZ + 21);
        addChapterBlocker(interiorBlockers, x + 68, laneZ + 21,
            18, 5, 5, 0, 'security-tray-table');
        interiorLayoutRecords.securityLanes++;
    }

    // Ruang tunggu keberangkatan besar di kiri. Bank kursi berulang mengikuti
    // kisi denah, tetapi menyisakan lorong keliling dan jalur lebar ke pintu
    // apron di barat-bawah.
    recordZone('departure-concourse', x - 185, -5, 130, 350);
    const seatXs = [x - 285, x - 225, x - 165, x - 105];
    const seatZs = [300, 235, 170, 105, 40, -25, -90, -155, -220, -285];
    for (const px of seatXs) for (const z of seatZs) {
        if (px === x - 285 && z <= -220) continue;
        box(statics, M.frame, 34, 1.2, 13, px, 1.2, z);
        for (let i = -1; i <= 2; i++) {
            box(statics, M.panel, 7, 3, 9, px + (i - .5) * 8, 2.8, z);
            box(statics, M.panel, 7, 5, 2, px + (i - .5) * 8, 4.2, z + 5);
        }
        addChapterBlocker(interiorBlockers, px, z, 17, 7,
            5, 0, 'departure-seating');
        interiorLayoutRecords.seatBanks++;
    }

    // Kafe kecil memisahkan security dari fasilitas bawah, sama seperti pulau
    // kafe di tengah denah. Sisi-sisinya terbuka untuk sirkulasi.
    recordZone('central-cafe', x + 28, -255, 55, 40);
    box(statics, M.wood, 100, 5, 20, x + 28, 2.5, -255);
    box(statics, M.frame, 90, 1, 30, x + 28, .5, -255);
    for (let i = -3; i <= 3; i++) cylinder(statics, M.steel, 2.2, 3,
        x - 8 + i * 12, 1.5, -235, 8);
    addChapterBlocker(interiorBlockers, x + 28, -255, 50, 10,
        6, 0, 'central-cafe-counter');

    // Baggage reclaim tunggal di kanan-bawah: torus direntangkan menjadi belt
    // persegi-bulat, dengan empat collider terpisah agar lubang tengah tetap
    // benar-benar kosong (bukan satu balok placeholder).
    const baggageX = x + 210, baggageZ = -380;
    recordZone('baggage-reclaim', baggageX, baggageZ, 72, 58);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(44, 9, 6, 28), M.rubber);
    belt.position.set(baggageX, 2.2, baggageZ);
    belt.rotation.x = Math.PI * .5;
    belt.scale.x = 1.45;
    belt.castShadow = true; belt.receiveShadow = true;
    statics.add(belt);
    box(statics, M.concrete, 90, .08, 54, baggageX, .05, baggageZ, false);
    addChapterBlocker(interiorBlockers, baggageX, baggageZ - 48,
        64, 9, 5, 0, 'baggage-belt');
    addChapterBlocker(interiorBlockers, baggageX, baggageZ + 48,
        64, 9, 5, 0, 'baggage-belt');
    addChapterBlocker(interiorBlockers, baggageX - 64, baggageZ,
        9, 39, 5, 0, 'baggage-belt');
    addChapterBlocker(interiorBlockers, baggageX + 64, baggageZ,
        9, 39, 5, 0, 'baggage-belt');
    interiorLayoutRecords.baggageBelts++;

    // Deret troli di tepi aula check-in dan dekat baggage reclaim.
    for (const [px, pz, length, yaw] of [
        [x + 305, -165, 90, Math.PI * .5], [x + 305, 75, 90, Math.PI * .5],
        [x + 112, -305, 75, Math.PI * .5], [x + 112, -470, 75, Math.PI * .5],
    ]) {
        const cart = new THREE.Group();
        cart.position.set(px, 0, pz); cart.rotation.y = yaw;
        box(cart, M.frame, length, .8, 8, 0, .6, 0);
        for (let i = -Math.floor(length / 18) / 2; i <= Math.floor(length / 18) / 2; i++) {
            box(cart, M.steel, 10, 3, 5, i * 14, 2.1, 0);
            cylinder(cart, M.rubber, .7, .5, i * 14 - 3, .7, 3, 8, 'z');
        }
        statics.add(cart);
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
    for (const z of [430, 220, 10, -200, -410]) for (const side of [-1, 1])
        addChapterLight(S9_INTERIOR_KEY, PAL.white, 1.05, 150,
            x + side * 195, 20, z);
    count('playableTerminalInterior');
    count('terminalZone', interiorLayoutRecords.zones.length);
}

function buildRunwayServiceApproach(parent, M) {
    // Garis merah batas apron dan hold-short bars mengikuti pembagian bidang
    // pada denah tanpa menambah dinding collision tak terlihat.
    box(parent, M.hazard, 930, .08, 1.2, 299580, .24, 304, false);
    box(parent, M.hazard, 1.2, .08, 248, 299112, .24, 180, false);
    box(parent, M.hazard, 1.2, .08, 248, 300048, .24, 180, false);
    for (const x of [299860, 300250, 300700]) for (const z of [-155, -145])
        for (let i = -2; i <= 2; i++)
            box(parent, M.white, 13, .08, 1.4, x + i * 15, .24, z, false);

    // Jalur kendaraan servis di belakang stand dan di depan hanggar.
    box(parent, M.white, 900, .08, 1, 299580, .24, 78, false);
    box(parent, M.white, 720, .08, 1, 300450, .24, 94, false);
    for (let x = 300090; x <= 300790; x += 46)
        box(parent, M.white, 22, .08, .8, x, .24, 94, false);
    count('runwayServiceZone', 4);
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

    // Lahan rural dipindah ke pita terluar agar bidang hijau di sekitar tower,
    // apron dan hanggar tetap sama bersihnya dengan denah referensi.
    buildField(staticRoot, M, 299360, 505, 400, 130, true);
    buildField(staticRoot, M, 300470, 505, 520, 130, false);
    buildField(staticRoot, M, 299390, -475, 470, 150, false);
    buildField(staticRoot, M, 300420, -475, 560, 150, true);
    for (const z of [-355, 370])
        box(staticRoot, M.water, 1650, 0.18, 8, 300000, -0.04, z, false);
    count('irrigationCanal', 2);
    for (let x = 299140; x <= 300860; x += 48) {
        buildTree(staticRoot, M, x, -540 + ((x / 48) % 3) * 8, 0.78 + ((x / 48) % 4) * 0.05);
        buildTree(staticRoot, M, x, 550 - ((x / 48) % 3) * 7, 0.74 + ((x / 48) % 5) * 0.04);
    }

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
    occProp((p) => buildHangar(p, M), S9_CARGO_HANGAR.x, S9_CARGO_HANGAR.z, 135, 47);
    occProp(buildFireStation, 300155, 210, 50, 20);

    const parkedX = [299250, 299425, 299600, 299775, 299950];
    parkedX.forEach((x, i) => {
        buildParkedAirliner(worldRoot, M, x, 180, i);
        buildJetBridge(worldRoot, M, x);
    });

    // Ground-support equipment follows the apron stands and the hanggar-side
    // service road instead of being scattered over the runway.
    occProp(buildTug, 299330, 105, 8, 9);
    occProp(buildBaggageTrain, 299470, 105, 22, 8);
    occProp(buildFuelTruck, 299665, 105, 15, 13);
    occProp(buildMobileStairs, 299830, 110, 13, 12);
    occProp(buildCargoLoader, 299965, 105, 12, 11);
    occProp(buildAirportBus, 299470, 265, 18, 11);
    occProp(buildBaggageTractor, 300310, 112, 8, 11);
    occProp(buildBaggageTractor, 300620, 108, 8, 11);
    occProp(buildBeltLoader, 300410, 116, 14, 13);
    occProp(buildBeltLoader, 300705, 105, 14, 13);
    occProp(buildGroundPowerUnit, 300520, 108, 8, 9);
    occProp(buildGroundPowerUnit, 300735, 82, 8, 9);
    buildSafetyEquipment(staticRoot, M, 300250, 72);

    // Pallet/cargo staging with readable straps, labels and forklift lanes.
    for (let i = 0; i < 12; i++) {
        const x = 300270 + (i % 4) * 17, z = 255 + Math.floor(i / 4) * 16;
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
        [299180, 300], [299520, 300], [299860, 300],
        [300180, 90], [300500, 90], [300820, 90],
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
    resetTransport(transport, S9_AIRCRAFT.x, S9_AIRCRAFT.z, 0);
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
            { x: S9_AIRCRAFT.x, y: 0, z: S9_AIRCRAFT.z },
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
    const apron = x >= 299112 + radius && x <= 300050 - radius
        && z >= 55 + radius && z <= 305 - radius;
    const serviceYard = x >= 300050 + radius && x <= 300850 - radius
        && z >= 20 + radius && z <= 330 - radius;
    const taxiway = x >= 299120 + radius && x <= 300880 - radius
        && z >= -10 + radius && z <= 60 - radius;
    const runway = x >= 299150 + radius && x <= 300870 - radius
        && z >= -275 + radius && z <= -165 - radius;
    const connector = [299860, 300250, 300700].some((cx) =>
        x >= cx - 43 + radius && x <= cx + 43 - radius
        && z >= -175 + radius && z <= 0 - radius);
    return apron || serviceYard || taxiway || runway || connector;
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
            { x: 312230, z: 115 }, { x: 311740, z: 340 },
            ...crateCandidates.map(([x, z]) => ({ x: S9_ORIGIN.x + x, z })),
        ],
        barrels: [
            { x: 305835, z: 135 }, { x: 306090, z: 182 },
            { x: 312260, z: -160 }, { x: 311715, z: -185 },
            ...barrelCandidates.map(([x, z]) => ({ x: S9_ORIGIN.x + x, z })),
        ],
        drops: [
            { x: 305970, z: 178, type: 'ammo', weapon: 'pistol' },
            { x: 312250, z: 120, type: 'medkit' },
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
        interiorCheckin: [[312270, 285], [312150, 280], [312260, 180], [312140, 170],
            [312280, 80], [312170, 75], [312120, -100], [312270, -105], [312115, 30]],
        interiorConcourse: [[311745, 270], [311805, 205], [311865, 140], [311925, 75],
            [311745, 75], [311805, 10], [311865, -60], [311925, -125],
            [311745, -125], [311805, -190], [311865, -255], [311720, -320]],
        runwayApron: [[299180, 90], [299180, 270], [299335, 60], [299400, 270],
            [299570, 60], [299650, 270], [299820, 60], [299930, 270]],
        runwayAircraft: [[300115, 70], [300115, 290], [300270, 60], [300390, 190],
            [300470, 55], [300500, 190], [300610, 55], [300700, 145],
            [300700, -80], [300820, -220]],
    };
    return (sets[name] || sets.frontToll).map(([x, z]) => ({ x, z }));
}

export function stage9RadarLandmarks() {
    return [
        { x: S9_BUILDING_ENTRY.x, z: S9_BUILDING_ENTRY.z, type: 'objective' },
        { x: S9_PUMP.x, z: S9_PUMP.z, type: 'objective' },
        { x: S9_AIRCRAFT.x, z: S9_AIRCRAFT.z, type: 'vehicle' },
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
            fireStations: semantic.airportFireStation || 0,
            parkedAircraft: semantic.parkedAirliner || 0,
            jetBridges: semantic.jetBridge || 0,
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
                layout: {
                    zones: interiorLayoutRecords.zones.map((z) => ({ ...z })),
                    amenityRows: {
                        north: [...interiorLayoutRecords.amenityRows.north],
                        south: [...interiorLayoutRecords.amenityRows.south],
                    },
                    checkinCounters: interiorLayoutRecords.checkinCounters,
                    securityLanes: interiorLayoutRecords.securityLanes,
                    seatBanks: interiorLayoutRecords.seatBanks,
                    selfCheckKiosks: interiorLayoutRecords.selfCheckKiosks,
                    baggageBelts: interiorLayoutRecords.baggageBelts,
                },
            },
            runway: {
                travelDistance: Math.hypot(S9_BOARD.x - S9_RUNWAY_START.x,
                    S9_BOARD.z - S9_RUNWAY_START.z),
                serviceZones: semantic.runwayServiceZone || 0,
                blastFenceTeeth: semantic.blastFenceTooth || 0,
                layout: {
                    zones: runwayLayoutRecords.zones.map((z) => ({ ...z })),
                    start: { ...S9_RUNWAY_START },
                    checkpoint: { ...S9_RUNWAY_CHECKPOINT },
                    pump: { ...S9_PUMP },
                    aircraft: { ...S9_AIRCRAFT },
                    board: { ...S9_BOARD },
                    tower: { ...S9_CONTROL_TOWER },
                    hangar: { ...S9_CARGO_HANGAR },
                    parkedAircraft: runwayLayoutRecords.parkedAircraft,
                    jetBridges: runwayLayoutRecords.jetBridges,
                    taxiwayConnectors: runwayLayoutRecords.taxiwayConnectors,
                    fireStations: runwayLayoutRecords.fireStations,
                },
            },
        },
        staticBatches: staticBatch.length,
        pointLights: stageLights.length,
        markers: Object.keys(markers),
        supplies: { crateCandidates: crateCandidates.length, barrelCandidates: barrelCandidates.length },
    };
}
