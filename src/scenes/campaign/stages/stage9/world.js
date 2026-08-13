// Campaign Stage 9 — Kertajati rural airport perimeter.
// Everything is generated from fixed coordinates: no runtime/random skyline and
// deliberately no city buildings around the airfield.

import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { buildStandMarker, pulseStandMarker } from '../../utility/common.js';
import {
    buildFourEngineTransport, resetTransport, setTransportCoreInstalled,
    updateTransport, transportDebug,
} from './aircraft.js';

export const S9_ORIGIN = Object.freeze({ x: 300000, z: 0 });
export const S9_START = Object.freeze({ x: 299350, z: 156 });
export const S9_TOWER = Object.freeze({ x: 299665, z: 176 });
export const S9_CORE = Object.freeze({ x: 299690, z: 144 });
export const S9_HANGAR = Object.freeze({ x: 300115, z: -145 });
export const S9_INSTALL = Object.freeze({ x: 300205, z: -64 });
export const S9_BOARD = Object.freeze({ x: 300228, z: -44 });
export const S9_BOUNDS = Object.freeze({ x0: 299100, x1: 300930, z0: -610, z1: 610 });

let built = false;
let worldRoot = null;
let transport = null;
let navGrid = null;
let staticBatch = [];
const blockers = [];
const stageLights = [];
const markers = {};
const semantic = Object.create(null);

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
    const x = S9_TOWER.x, z = S9_TOWER.z;
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
    const x = S9_HANGAR.x + 105, z = S9_HANGAR.z;
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

function buildWorld() {
    worldRoot = new THREE.Group();
    worldRoot.name = 'campaign-stage9-kertajati-rural-airport';
    scene.add(worldRoot);
    const staticRoot = new THREE.Group();
    const M = {
        grass: material(0x607146, 0.94), fieldGreen: material(0x53683e, 0.96),
        fieldSoil: material(0x795c3c, 0.98), crop: material(0x78904e, 1),
        earthRidge: material(0x5c422c, 1), water: material(0x496c72, 0.48, 0.08),
        asphalt: material(0x363a3b, 0.96), apron: material(0x68655f, 0.94),
        concrete: material(PAL.concrete), panel: material(PAL.panel), roof: material(PAL.gunmetal, 0.62, 0.38),
        frame: material(PAL.gunmetal, 0.52, 0.52), steel: material(PAL.steel, 0.48, 0.6),
        fence: material(PAL.steel, 0.65, 0.45), rubber: material(PAL.rubber, 0.96),
        wood: material(PAL.wood, 0.96), leaf: material(PAL.leaf, 0.98),
        white: material(PAL.white), hazard: material(PAL.hazard),
        glass: material(0x244750, 0.28, 0.22),
        runwayLight: material(PAL.tech, 0.42, 0.05, { emissive: PAL.techDim, emissiveIntensity: EMISSIVE_MAX }),
    };

    buildRunwayAndApron(staticRoot, M);

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

    buildTower(staticRoot, M);
    buildHangar(staticRoot, M);
    // Airport operations sheds are isolated airfield facilities, not a city.
    box(staticRoot, M.panel, 86, 19, 34, 299480, 9.5, 238);
    box(staticRoot, M.roof, 90, 2, 38, 299480, 20, 238);
    box(staticRoot, M.glass, 45, 4, 0.5, 299480, 12, 220.8);
    addBlocker(299480, 238, 43, 17, 20, 0, 'airport-operations');
    count('airportOperationsBuilding');

    buildTug(staticRoot, M, 300025, -96);
    buildBaggageTrain(staticRoot, M, 299930, -190);
    buildFuelTruck(staticRoot, M, 300060, 128);
    buildMobileStairs(staticRoot, M, 300345, -196);
    buildCargoLoader(staticRoot, M, 299865, 102);
    buildAirportBus(staticRoot, M, 299755, -174);
    buildBaggageTractor(staticRoot, M, 299610, -122);
    buildBaggageTractor(staticRoot, M, 300390, 118);
    buildBeltLoader(staticRoot, M, 299825, -78);
    buildBeltLoader(staticRoot, M, 300365, 62);
    buildGroundPowerUnit(staticRoot, M, 300120, 92);
    buildGroundPowerUnit(staticRoot, M, 300338, -142);
    buildSafetyEquipment(staticRoot, M, 300005, -42);

    // Pallet/cargo staging with readable straps, labels and forklift lanes.
    for (let i = 0; i < 12; i++) {
        const x = 299815 + (i % 4) * 17, z = 166 + Math.floor(i / 4) * 16;
        box(staticRoot, M.wood, 12, 1, 10, x, 0.7, z);
        box(staticRoot, i % 3 ? M.panel : M.hazard, 10, 4 + (i % 2) * 2, 8, x, 3.2, z);
        box(staticRoot, M.frame, 0.45, 6, 10.5, x, 3.5, z);
        addBlocker(x, z, 6, 5, 7, 0, 'air-cargo-pallet');
    }
    count('airCargoPallet', 12);

    // Apron mast fixtures; actual dynamic lights are deliberately bounded.
    const lampSpecs = [
        [299520, -210], [299690, -215], [299860, -245],
        [300050, 235], [300245, 230], [300420, 180],
    ];
    for (const [x, z] of lampSpecs) {
        box(staticRoot, M.frame, 1.1, 28, 1.1, x, 14, z);
        box(staticRoot, M.white, 8, 1, 2.2, x, 28, z);
        const light = new THREE.PointLight(PAL.amber, 1.15, 72);
        light.position.set(x, 26, z);
        worldRoot.add(light);
        registerStageLight('campaign-9', light);
        stageLights.push(light);
    }
    count('apronLightMast', lampSpecs.length);

    transport = buildFourEngineTransport();
    worldRoot.add(transport);
    resetTransport(transport, 300272, -47, 0);

    createMarker(worldRoot, M, 'tower', S9_TOWER.x - 48, S9_TOWER.z - 5);
    createMarker(worldRoot, M, 'core', S9_CORE.x, S9_CORE.z);
    createMarker(worldRoot, M, 'install', S9_INSTALL.x, S9_INSTALL.z);
    createMarker(worldRoot, M, 'board', S9_BOARD.x, S9_BOARD.z);

    // Static merge is safe because only hero aircraft and markers animate.
    staticBatch = addMergedStatic(worldRoot, [staticRoot]);

    const cell = 14;
    const cols = Math.ceil((S9_BOUNDS.x1 - S9_BOUNDS.x0) / cell);
    const rows = Math.ceil((S9_BOUNDS.z1 - S9_BOUNDS.z0) / cell);
    navGrid = makeNavGrid(S9_BOUNDS.x0, S9_BOUNDS.z0, cell, cols, rows,
        (x, z) => stage9Walkable(x, z, 4) && !stage9BlockedAt(x, z, 3.5));

    registerCampaignWorldRoot({
        key: 'campaign-9', root: worldRoot, lightsKey: 'campaign-9', bounds: S9_BOUNDS,
        warmupViews: [
            { x: S9_TOWER.x, y: 0, z: S9_TOWER.z },
            { x: S9_HANGAR.x, y: 0, z: S9_HANGAR.z },
            { x: 300300, y: 0, z: 0 },
        ],
    });
}

export function ensureStage9World() {
    if (!built) { built = true; buildWorld(); }
    return worldRoot;
}

export function stage9Walkable(x, z, radius = 0) {
    const runway = x >= 299150 + radius && x <= 300870 - radius
        && z >= -276 + radius && z <= 295 - radius;
    const access = x >= 299300 + radius && x <= 299720 - radius
        && z >= 115 + radius && z <= 286 - radius;
    const hangarApron = x >= 299850 + radius && x <= 300500 - radius
        && z >= -270 + radius && z <= 220 - radius;
    return runway || access || hangarApron;
}

export function stage9BlockedAt(x, z, radius = 0) {
    return blockers.some((b) => pointInBlocker(x, z, radius, b));
}

export function stage9Resolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers.filter((b) => b.active));
}

export function stage9SegHitsWall(x0, z0, x1, z1, y = 0) {
    return blockers.some((b) => b.active && b.bullet && y < b.top
        && segmentHitsBlocker(x0, z0, x1, z1, b));
}

export function stage9GroundHeight() { return 0; }
export function stage9NavGrid() { ensureStage9World(); return navGrid; }
export function stage9Transport() { ensureStage9World(); return transport; }

export function stage9SetCoreInstalled(installed) {
    ensureStage9World();
    setTransportCoreInstalled(transport, installed);
}

export function stage9SetMarkers(names) {
    ensureStage9World();
    const wanted = new Set(names || []);
    for (const [name, marker] of Object.entries(markers)) marker.visible = wanted.has(name);
}

export function stage9UpdateWorld(dt, elapsed, spool, takeoff) {
    if (!built) return;
    updateTransport(transport, dt, spool, takeoff);
    for (const marker of Object.values(markers)) if (marker.visible) {
        pulseStandMarker(marker, elapsed * 4);
    }
}

export function stage9SupplyPlacements() {
    return {
        crates: crateCandidates.map(([x, z]) => ({ x: S9_ORIGIN.x + x, z })),
        barrels: barrelCandidates.map(([x, z]) => ({ x: S9_ORIGIN.x + x, z })),
        drops: [
            { x: 299515, z: 132, type: 'ammo', weapon: 'pistol' },
            { x: 299735, z: -118, type: 'medkit' },
            { x: 299970, z: 84, type: 'ammo', weapon: 'rifle' },
            { x: 300370, z: 86, type: 'medkit' },
        ],
    };
}

export function stage9EncounterPoints(name) {
    const sets = {
        apron: [[299420, 120], [299465, 58], [299520, -40], [299590, -126], [299685, -70], [299760, 35], [299825, 118]],
        tower: [[299590, 210], [299620, 118], [299682, 92], [299730, 174], [299705, 246], [299570, 254]],
        return: [[299770, 38], [299820, -58], [299885, -142], [299945, -52], [300010, 52], [300065, 136]],
        hangar: [[300020, -210], [300075, -118], [300135, -32], [300190, -212], [300250, 86], [300355, 116], [300405, -118]],
        spool: [[300090, 124], [300020, 15], [300080, -208], [300170, -235], [300330, -218], [300410, -95], [300420, 85], [300320, 162]],
    };
    return (sets[name] || sets.apron).map(([x, z]) => ({ x, z }));
}

export function stage9RadarLandmarks() {
    return [
        { x: S9_TOWER.x, z: S9_TOWER.z, type: 'objective' },
        { x: S9_HANGAR.x, z: S9_HANGAR.z, type: 'objective' },
        { x: 300272, z: -47, type: 'vehicle' },
    ];
}

export function stage9WorldDebug() {
    ensureStage9World();
    return {
        built, origin: { ...S9_ORIGIN }, bounds: { ...S9_BOUNDS }, deterministic: true,
        theme: 'rural-kertajati-airport-perimeter',
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
            },
        },
        aircraft: transportDebug(transport),
        blockers: { total: blockers.length, bullet: blockers.filter((b) => b.bullet).length },
        nav: navGrid ? { cols: navGrid.cols, rows: navGrid.rows, cell: navGrid.cell } : null,
        staticBatches: staticBatch.length,
        pointLights: stageLights.length,
        markers: Object.keys(markers),
        supplies: { crateCandidates: crateCandidates.length, barrelCandidates: barrelCandidates.length },
    };
}
