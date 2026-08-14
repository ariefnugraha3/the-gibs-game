// Campaign Stage 10 — Balikpapan-inspired industrial coast.
// The complete world includes a cargo airstrip, working port, small city edge,
// and visible sea. Coordinates and prop placement are deterministic.

import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';
import { buildStandMarker, pulseStandMarker } from '../../utility/common.js';
import {
    buildPortCranes, setCraneLayout, cranePathWalkable, craneDebug,
} from './cranes.js';
import { buildDefenseArray, defenseArrayDebug } from './defenseArray.js';

export const S10_ORIGIN = Object.freeze({ x: 330000, z: 0 });
export const S10_START = Object.freeze({ x: 329130, z: 135 });
export const S10_YARD = Object.freeze({ x: 329470, z: 30 });
export const S10_SAFE_BAY = Object.freeze({ x: 329890, z: 12 });
export const S10_WAREHOUSE = Object.freeze({ x: 330070, z: 10 });
export const S10_RELAY = Object.freeze({ x: 330135, z: 4 });
export const S10_PIPE_RACK = Object.freeze({ x: 330345, z: -42 });
export const S10_DEFENSE = Object.freeze({ x: 330590, z: -112 });
export const S10_EXTRACT = Object.freeze({ x: 330825, z: 92 });
export const S10_BOUNDS = Object.freeze({ x0: 329000, x1: 331000, z0: -650, z1: 610 });

export const S10_OCC = 'campaign-10';   // kunci set occluder (lihat utility/occlusion.js)
let built = false;
let worldRoot = null;
let navGrid = null;
let cranes = null;
let defense = null;
let carrier = null;
let staticBatch = [];
const blockers = [];
const staticBlockers = [];
const dynamicBlockers = [];
const markers = {};
const stageLights = [];
const semantic = Object.create(null);

const crateCandidates = [
    [-790, 90], [-690, -92], [-585, 146], [-488, -118], [-380, 92],
    [-270, -135], [-158, 150], [-72, -58], [32, 58], [128, -128],
    [222, 138], [322, -126], [418, 52], [516, -190], [626, 164], [738, 22],
];
const barrelCandidates = [
    [-820, 170], [-735, -138], [-652, 65], [-566, -170], [-474, 174], [-392, -48],
    [-305, 134], [-225, -178], [-142, 82], [-58, -152], [28, 138], [112, -98],
    [198, 158], [286, -188], [374, 74], [456, -152], [538, 136], [620, -72],
    [704, 174], [780, -34],
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

function cylinder(parent, mat, radius, height, x, y, z, axis = 'y', radial = 12) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, radial), mat);
    m.position.set(x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI * 0.5;
    if (axis === 'z') m.rotation.x = Math.PI * 0.5;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function makeBlocker(x, z, hx, hz, top, yaw = 0, kind = 'solid', bullet = true, dynamic = false) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const blocker = {
        x, z, hx, hz, top, kind, bullet, dynamic, active: true,
        axx: c, axz: s, azx: -s, azz: c,
        rad: Math.hypot(hx, hz), standable: false,
    };
    blockers.push(blocker);
    (dynamic ? dynamicBlockers : staticBlockers).push(blocker);
    return blocker;
}

function pointInBlocker(x, z, radius, blocker) {
    if (!blocker.active) return false;
    const dx = x - blocker.x, dz = z - blocker.z;
    if (dx * dx + dz * dz > (blocker.rad + radius + 1) ** 2) return false;
    const lx = dx * blocker.axx + dz * blocker.axz;
    const lz = dx * blocker.azx + dz * blocker.azz;
    return Math.abs(lx) <= blocker.hx + radius && Math.abs(lz) <= blocker.hz + radius;
}

function segmentHitsBlocker(x0, z0, x1, z1, blocker) {
    const tx0 = (x0 - blocker.x) * blocker.axx + (z0 - blocker.z) * blocker.axz;
    const tz0 = (x0 - blocker.x) * blocker.azx + (z0 - blocker.z) * blocker.azz;
    const tx1 = (x1 - blocker.x) * blocker.axx + (z1 - blocker.z) * blocker.axz;
    const tz1 = (x1 - blocker.x) * blocker.azx + (z1 - blocker.z) * blocker.azz;
    const dx = tx1 - tx0, dz = tz1 - tz0;
    let enter = 0, leave = 1;
    const clip = (p, q) => {
        if (Math.abs(p) < 1e-9) return q >= 0;
        const t = q / p;
        if (p < 0) { if (t > leave) return false; if (t > enter) enter = t; }
        else { if (t < enter) return false; if (t < leave) leave = t; }
        return true;
    };
    return clip(-dx, tx0 + blocker.hx) && clip(dx, blocker.hx - tx0)
        && clip(-dz, tz0 + blocker.hz) && clip(dz, blocker.hz - tz0);
}

function wheels(parent, M, points) {
    for (const [x, y, z] of points) cylinder(parent, M.rubber, 2, 1.25, x, y, z, 'z', 12);
}

function buildStaticContainer(parent, M, x, z, yaw, colorIndex, levels = 1) {
    // Tumpukan peti kemas = penghalang paling sering di stage ini (10-31 unit).
    // Dibangun sebagai grup sendiri lalu dilas ke dalam dirinya, bukan dilebur ke
    // batch pelabuhan, supaya bisa memudar saat menutupi player/robot.
    void parent;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    for (let level = 0; level < levels; level++) {
        const y = level * 10.4;
        box(g, M.container[colorIndex % M.container.length], 25, 10, 9, 0, y + 5, 0);
        for (let rx = -11; rx <= 11; rx += 3.1) {
            box(g, M.rib, 0.42, 8.6, 0.3, rx, y + 5, -4.64, false);
            box(g, M.rib, 0.42, 8.6, 0.3, rx, y + 5, 4.64, false);
        }
        for (const rz of [-3.1, 0, 3.1]) box(g, M.rib, 0.42, 8.5, 0.42, 12.2, y + 5, rz, false);
        box(g, M.white, 3.4, 1.8, 0.2, 7.5, y + 3.1, -4.88, false);
    }
    weldOccluder(S10_OCC, worldRoot, g,
        { x, z, radius: 13, top: levels * 10.4 });
    makeBlocker(x, z, 12.5, 4.5, levels * 10.4, yaw, 'container-stack');
    count('staticContainer', levels);
}

function buildCargoAirstrip(parent, M) {
    const runwayX = 329385, runwayZ = 258;
    box(parent, M.asphalt, 720, 0.45, 76, runwayX, -0.05, runwayZ, false);
    for (let x = runwayX - 330; x <= runwayX + 330; x += 48) {
        box(parent, M.white, 22, 0.1, 1.1, x, 0.23, runwayZ, false);
        for (const z of [runwayZ - 36, runwayZ + 36])
            box(parent, M.tech, 2.4, 0.25, 0.8, x, 0.25, z, false);
    }
    box(parent, M.concrete, 250, 0.42, 115, 329180, -0.04, 164, false);
    // Air-freight terminal with loading docks and rooftop ventilation.
    box(parent, M.panel, 145, 24, 52, 329090, 12, 430);
    box(parent, M.gunmetal, 150, 2, 57, 329090, 25, 430);
    for (let x = 329035; x <= 329145; x += 22) {
        box(parent, M.ink, 16, 10, 1, x, 6, 403.5);
        box(parent, M.hazard, 16, 1, 1.2, x, 11, 403);
    }
    for (let x = 329045; x <= 329135; x += 30)
        cylinder(parent, M.steel, 4, 3, x, 28, 430, 'y', 12);
    makeBlocker(329090, 430, 72.5, 26, 26, 0, 'air-freight-terminal');

    // Parked twin-engine cargo turboprop: complete silhouette, gear and ramp.
    const plane = new THREE.Group();
    plane.position.set(329265, 2, 171);
    parent.add(plane);
    cylinder(plane, M.panel, 3.4, 31, 0, 7, 0, 'x', 16);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(3.35, 14, 10), M.panel);
    nose.scale.set(1.25, 1, 1); nose.position.set(15.5, 7, 0); plane.add(nose);
    box(plane, M.panel, 10, 1.2, 32, 1, 10, 0);
    box(plane, M.gunmetal, 6, 0.5, 35, -1, 9.3, 0);
    box(plane, M.panel, 7, 0.7, 14, -13, 12, 0);
    box(plane, M.hazard, 5, 7, 0.8, -13, 16, 0);
    for (const ez of [-10, 10]) {
        cylinder(plane, M.gunmetal, 1.8, 5, 3, 8.4, ez, 'x', 14);
        cylinder(plane, M.steel, 0.35, 8, 6, 8.4, ez, 'x', 10);
        for (let i = 0; i < 5; i++) {
            const blade = box(plane, M.ink, 0.35, 7, 0.35, 8, 8.4, ez);
            blade.rotation.x = i * Math.PI * 0.4;
        }
    }
    for (const [gx, gz] of [[11, 0], [-7, -3], [-7, 3]]) {
        cylinder(plane, M.steel, 0.3, 4, gx, 3.5, gz, 'y', 8);
        cylinder(plane, M.rubber, 0.9, 0.6, gx, 1.8, gz, 'z', 10);
    }
    const ramp = box(plane, M.gunmetal, 8, 0.7, 6, -17, 3.5, 0);
    ramp.rotation.z = -0.45;
    makeBlocker(329265, 171, 20, 18, 19, 0, 'parked-cargo-aircraft');
    count('cargoAirstrip'); count('airFreightTerminal'); count('parkedCargoAircraft');
}

function buildForklift(parent, M, x, z, yaw = 0) {
    void parent;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
    box(g, M.hazard, 10, 3, 7, 0, 3, 0);
    box(g, M.gunmetal, 6, 7, 6, -2, 7, 0);
    for (const sx of [-1, 1]) box(g, M.frame, 0.8, 11, 0.8, 5, 7, sx * 2.7);
    box(g, M.frame, 1, 1, 11, 5, 12.5, 0);
    for (const sz of [-1, 1]) box(g, M.steel, 9, 0.7, 0.8, 9, 1, sz * 2.3);
    box(g, M.glass, 0.4, 4, 4.5, -5.1, 8, 0);
    wheels(g, M, [[-3, 2, -4], [-3, 2, 4], [3, 2, -4], [3, 2, 4]]);
    weldOccluder(S10_OCC, worldRoot, g, { x, z, radius: 7, top: 14 });
    makeBlocker(x, z, 7, 5, 14, yaw, 'forklift');
    count('forklift');
}

function buildReachStacker(parent, M, x, z) {
    void parent;
    const g = new THREE.Group();
    box(g, M.hazard, 28, 5, 12, x, 4, z);
    box(g, M.gunmetal, 9, 13, 11, x - 8, 11, z);
    box(g, M.glass, 5, 5, 0.4, x - 8, 14, z - 5.7);
    const boom = box(g, M.steel, 37, 3, 4, x + 8, 17, z); boom.rotation.z = 0.22;
    box(g, M.frame, 3, 12, 14, x + 25, 12, z);
    box(g, M.hazard, 2, 2, 23, x + 26, 6.5, z);
    wheels(g, M, [[x - 9, 2.8, z - 7], [x - 9, 2.8, z + 7], [x + 8, 2.8, z - 7], [x + 8, 2.8, z + 7]]);
    weldOccluder(S10_OCC, worldRoot, g, { x: x + 4, z, radius: 18, top: 23 });
    makeBlocker(x + 4, z, 25, 8, 23, 0, 'reach-stacker');
    count('reachStacker');
}

function buildWarehouse(parent, M) {
    const x = S10_WAREHOUSE.x, z = S10_WAREHOUSE.z;
    // Cangkang gudang (dinding 35 + atap) memudar: player BERTARUNG DI DALAMNYA,
    // jadi dinding sisi kamera + atap adalah penghalang pandangan permanen.
    const shell = new THREE.Group();
    box(shell, M.panel, 4, 35, 150, x - 86, 17.5, z);
    box(shell, M.panel, 4, 35, 150, x + 86, 17.5, z);
    box(shell, M.panel, 176, 35, 4, x, 17.5, z + 73);
    box(shell, M.gunmetal, 180, 2.5, 154, x, 37, z);
    weldOccluder(S10_OCC, worldRoot, shell, { x, z: z + 40, radius: 90, top: 38 });
    for (let rx = x - 75; rx <= x + 75; rx += 25) {
        box(parent, M.frame, 1.2, 35, 1.2, rx, 17.5, z - 70);
        box(parent, M.hazard, 18, 1.2, 2, rx, 1, z - 74);
    }
    // Sorting conveyors, roller beds, scanner arches and pallet racks.
    for (const rz of [z - 40, z, z + 40]) {
        box(parent, M.frame, 120, 2, 9, x, 4, rz);
        for (let rx = x - 55; rx <= x + 55; rx += 8)
            cylinder(parent, M.steel, 0.7, 8.5, rx, 5.3, rz, 'z', 8);
        for (const rx of [x - 45, x + 45]) {
            box(parent, M.frame, 2, 16, 2, rx, 8, rz);
            box(parent, M.tech, 4, 1, 10, rx, 16, rz);
        }
        makeBlocker(x, rz, 60, 5, 7, 0, 'warehouse-conveyor');
    }
    // Break conveyor runs with navigable gaps using three shorter blockers.
    staticBlockers.splice(staticBlockers.length - 3, 3);
    blockers.splice(blockers.length - 3, 3);
    for (const rz of [z - 40, z, z + 40]) {
        makeBlocker(x - 43, rz, 17, 5, 7, 0, 'warehouse-conveyor');
        makeBlocker(x + 43, rz, 17, 5, 7, 0, 'warehouse-conveyor');
    }
    makeBlocker(x - 86, z, 2, 75, 35, 0, 'warehouse-wall');
    makeBlocker(x + 86, z, 2, 75, 35, 0, 'warehouse-wall');
    makeBlocker(x, z + 73, 88, 2, 35, 0, 'warehouse-wall');
    count('automatedWarehouse'); count('sortingConveyor', 3); count('scannerArch', 6);
}

function buildPipeRack(parent, M) {
    // Tiap bent rak pipa (26 unit) berdiri sendiri: cukup tinggi untuk menelan
    // player yang berdiri di sisi kameranya.
    for (let x = 330225; x <= 330455; x += 24) {
        for (const z of [-88, -24, 42]) {
            const g = new THREE.Group();
            box(g, M.frame, 2, 26, 2, x, 13, z);
            box(g, M.frame, 2, 2, 18, x, 24, z);
            weldOccluder(S10_OCC, worldRoot, g, { x, z, radius: 9, top: 26 });
        }
    }
    for (const z of [-82, -28, 36]) {
        cylinder(parent, M.hazard, 2.5, 244, 330340, 20, z, 'x', 12);
        cylinder(parent, M.steel, 1.7, 244, 330340, 14, z + 6, 'x', 10);
        cylinder(parent, M.gunmetal, 2.1, 244, 330340, 8, z + 11, 'x', 10);
    }
    for (let x = 330250; x <= 330430; x += 45) {
        const g = new THREE.Group();
        cylinder(g, M.steel, 6, 18, x, 9, 90, 'y', 14);
        cylinder(g, M.gunmetal, 6.6, 1.5, x, 18, 90, 'y', 14);
        weldOccluder(S10_OCC, worldRoot, g, { x, z: 90, radius: 8, top: 19 });
        makeBlocker(x, 90, 7, 7, 19, 0, 'process-tank');
    }
    count('pipeRackBay', 10); count('processPipe', 9); count('processTank', 5);
}

function buildSmallCity(parent, M) {
    // A restrained low-rise coastal city edge, not a megacity skyline.
    let cityCount = 0;
    for (let row = 0; row < 2; row++) for (let col = 0; col < 10; col++) {
        const x = 329300 + col * 145 + (row % 2) * 34;
        const z = 455 + row * 82;
        const width = 62 + (col % 3) * 9;
        const depth = 42 + ((col + row) % 3) * 8;
        const height = 25 + ((col * 7 + row * 5) % 4) * 8;
        box(parent, col % 3 ? M.cityWarm : M.cityConcrete, width, height, depth, x, height * 0.5, z);
        box(parent, M.gunmetal, width + 3, 1.3, depth + 3, x, height + 0.7, z);
        for (let floor = 7; floor < height - 2; floor += 8)
            for (let wx = x - width * 0.35; wx <= x + width * 0.35; wx += 12) {
                box(parent, M.window, 5, 3.2, 0.3, wx, floor, z - depth * 0.5 - 0.2, false);
                box(parent, M.window, 5, 3.2, 0.3, wx, floor, z + depth * 0.5 + 0.2, false);
            }
        for (const side of [-1, 1])
            box(parent, M.frame, width * 0.75, 0.7, 3, x, height * 0.52, z + side * (depth * 0.5 + 1.5));
        if (col % 3 === 0) {
            cylinder(parent, M.steel, 4, 6, x + width * 0.25, height + 3.5, z, 'y', 12);
            cylinder(parent, M.gunmetal, 4.4, 0.8, x + width * 0.25, height + 6.5, z, 'y', 12);
        }
        cityCount++;
    }
    count('smallCityBuilding', cityCount);
}

function buildSeaAndShips(parent, M) {
    box(parent, M.water, 2050, 1, 440, 330000, -1.2, -450, false);
    box(parent, M.quay, 1900, 8, 24, 330000, 1, -260);
    box(parent, M.frame, 1900, 1.2, 1.2, 330000, 9, -246);
    for (let x = 329070; x <= 330930; x += 26) box(parent, M.frame, 1.1, 9, 1.1, x, 5, -246);
    // Container vessel with layered hull, bridge, hatch covers and deck loads.
    const ship = new THREE.Group(); ship.position.set(330365, -3, -410); parent.add(ship);
    box(ship, M.hull, 300, 24, 62, 0, 12, 0);
    box(ship, M.hazard, 290, 3, 63, 0, 25, 0);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(31, 56, 8), M.hull);
    bow.rotation.z = -Math.PI * 0.5; bow.position.set(177, 12, 0); ship.add(bow);
    box(ship, M.white, 56, 42, 54, -110, 47, 0);
    box(ship, M.glass, 58, 7, 55, -110, 61, 0);
    for (let level = 0; level < 3; level++) for (let ix = -60; ix <= 90; ix += 30)
        for (const z of [-20, -7, 7, 20]) {
            box(ship, M.container[(ix / 30 + level + 10) % M.container.length], 27, 9, 11,
                ix, 30 + level * 9.5, z);
            count('shipContainer');
        }
    cylinder(ship, M.gunmetal, 6, 20, -128, 77, 0, 'y', 12);
    // Harbor tug: rubber fenders, wheelhouse, towing winch.
    const tug = new THREE.Group(); tug.position.set(330725, -1, -340); parent.add(tug);
    box(tug, M.hull, 65, 13, 28, 0, 7, 0);
    box(tug, M.hazard, 52, 2, 30, -3, 14, 0);
    box(tug, M.white, 25, 17, 22, -10, 24, 0);
    box(tug, M.glass, 26, 5, 23, -10, 29, 0);
    cylinder(tug, M.gunmetal, 2.8, 13, -17, 40, 0, 'y', 10);
    cylinder(tug, M.steel, 5, 4, 17, 19, 0, 'z', 12);
    for (let x = -28; x <= 28; x += 9)
        cylinder(tug, M.rubber, 2.2, 2, x, 8, -15, 'z', 10);
    count('sea'); count('containerVessel'); count('harborTug'); count('quay');
}

function buildCarrier(parent, M) {
    const g = new THREE.Group(); g.position.set(S10_EXTRACT.x, 0, S10_EXTRACT.z); parent.add(g);
    box(g, M.gunmetal, 54, 8, 22, 0, 7, 0);
    box(g, M.armor, 32, 13, 20, -4, 16, 0);
    box(g, M.glass, 8, 5, 21, 11, 20, 0);
    box(g, M.hazard, 56, 1.3, 23, 0, 11, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 18, z = sz * 12;
        cylinder(g, M.rubber, 5, 2.5, x, 4, z, 'z', 14);
        cylinder(g, M.steel, 2.2, 2.8, x, 4, z, 'z', 12);
    }
    box(g, M.frame, 18, 2, 13, -27, 8, 0);
    cylinder(g, M.tech, 1.1, 2, 8, 25, 0, 'y', 10);
    makeBlocker(S10_EXTRACT.x, S10_EXTRACT.z, 29, 14, 27, 0, 'armored-freight-carrier');
    count('armoredFreightCarrier');
    return g;
}

function createMarker(parent, name, x, z) {
    markers[name] = buildStandMarker(parent, x, z, PAL.amber);
}

function buildWorld() {
    worldRoot = new THREE.Group();
    worldRoot.name = 'campaign-stage10-iron-port-world';
    scene.add(worldRoot);
    const staticRoot = new THREE.Group();
    const M = {
        asphalt: material(0x383b3b, 0.96), concrete: material(PAL.concrete), quay: material(0x6f6a62, 0.94),
        panel: material(PAL.panel), gunmetal: material(PAL.gunmetal, 0.64, 0.36),
        frame: material(PAL.gunmetal, 0.5, 0.55), steel: material(PAL.steel, 0.48, 0.62),
        armor: material(0x555b5c, 0.56, 0.48), ink: material(PAL.ink, 0.62, 0.4),
        rubber: material(PAL.rubber, 0.96), hazard: material(PAL.hazard), white: material(PAL.white),
        glass: material(PAL.screenBg, 0.24, 0.22, { emissive: PAL.techDim, emissiveIntensity: 0.3 }),
        tech: material(PAL.tech, 0.38, 0.12, { emissive: PAL.techDim, emissiveIntensity: EMISSIVE_MAX }),
        water: material(0x334b4b, 0.4, 0.12), hull: material(PAL.ink, 0.68, 0.36),
        rib: material(PAL.gunmetal, 0.62, 0.45),
        container: [material(PAL.hazard), material(PAL.amberDim), material(PAL.techDim), material(PAL.steel)],
        cityWarm: material(0x877a69, 0.9), cityConcrete: material(PAL.concrete, 0.92),
        window: material(PAL.screenBg, 0.3, 0.08, { emissive: PAL.amberDim, emissiveIntensity: 0.32 }),
        crane: material(PAL.hazard, 0.62, 0.4), deck: material(PAL.steel, 0.58, 0.46),
        cabin: material(PAL.panel), cable: material(PAL.ink, 0.7, 0.5),
        servoBody: material(PAL.gunmetal, 0.52, 0.52), servoFace: material(PAL.amberDim, 0.44, 0.28),
        servoGlow: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
        wreck: material(PAL.ink, 0.9, 0.2),
        warning: new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
            opacity: 0.62, toneMapped: false, depthWrite: false }),
    };

    box(staticRoot, M.concrete, 1920, 1, 520, 330000, -0.7, 10, false);
    buildSeaAndShips(staticRoot, M);
    buildCargoAirstrip(staticRoot, M);
    buildSmallCity(staticRoot, M);

    // Container yard stacks define long lanes but preserve broad cross aisles.
    for (let i = 0; i < 13; i++) {
        const x = 329360 + i * 41;
        if (i !== 6 && i !== 7) buildStaticContainer(staticRoot, M, x, -146, 0, i, 2 + (i % 2));
        if (i !== 3 && i !== 9) buildStaticContainer(staticRoot, M, x, 146, 0, i + 1, 2);
    }
    for (let i = 0; i < 6; i++) {
        const x = 329470 + i * 78;
        buildStaticContainer(staticRoot, M, x, -73, Math.PI * 0.5, i + 2, 1 + (i % 3 === 0 ? 1 : 0));
        buildStaticContainer(staticRoot, M, x + 28, 72, Math.PI * 0.5, i + 3, 1);
    }

    buildForklift(staticRoot, M, 329425, 76, 0.2);
    buildForklift(staticRoot, M, 329705, -112, -0.25);
    buildReachStacker(staticRoot, M, 329820, 116);
    buildWarehouse(staticRoot, M);
    buildPipeRack(staticRoot, M);

    cranes = buildPortCranes(worldRoot, M, S10_ORIGIN,
        (x, z, hx, hz, top, yaw, kind) => makeBlocker(x, z, hx, hz, top, yaw, kind, true, true));

    defense = buildDefenseArray(worldRoot, M, S10_DEFENSE.x, S10_DEFENSE.z);
    makeBlocker(S10_DEFENSE.x, S10_DEFENSE.z, 27, 25, 48, 0, 'defense-cannon-housing');
    carrier = buildCarrier(staticRoot, M);

    // Pier deck, bollards, safety rails and fender details.
    box(staticRoot, M.quay, 480, 2, 185, 330650, 0.2, -120, false);
    for (let x = 330455; x <= 330880; x += 42) {
        cylinder(staticRoot, M.ink, 2.4, 6, x, 3, -222, 'y', 10);
        cylinder(staticRoot, M.ink, 2.4, 6, x, 3, -24, 'y', 10);
        box(staticRoot, M.hazard, 18, 0.12, 1.1, x, 1.3, -205, false);
    }
    count('pierBollard', 22); count('defensePier');

    // Sodium-style port lamps: emissive housings plus a bounded light set.
    const lampSpecs = [
        [329190, 88], [329480, 205], [329760, 205],
        [330020, -205], [330315, 180], [330515, -212], [330780, 185],
    ];
    for (const [x, z] of lampSpecs) {
        box(staticRoot, M.frame, 1.2, 31, 1.2, x, 15.5, z);
        box(staticRoot, M.tech, 9, 1.2, 2.5, x, 31, z, false);
        const light = new THREE.PointLight(PAL.amber, 1.15, 80);
        light.position.set(x, 29, z);
        worldRoot.add(light);
        registerStageLight('campaign-10', light);
        stageLights.push(light);
    }
    count('portLightMast', lampSpecs.length);

    createMarker(worldRoot, 'yard', S10_YARD.x, S10_YARD.z);
    createMarker(worldRoot, 'safeBay', S10_SAFE_BAY.x, S10_SAFE_BAY.z);
    createMarker(worldRoot, 'relay', S10_RELAY.x, S10_RELAY.z);
    createMarker(worldRoot, 'defense', S10_DEFENSE.x - 74, S10_DEFENSE.z + 72);
    createMarker(worldRoot, 'extract', S10_EXTRACT.x - 42, S10_EXTRACT.z);

    staticBatch = addMergedStatic(worldRoot, [staticRoot]);

    const cell = 14;
    const cols = Math.ceil((330940 - 329050) / cell);
    const rows = Math.ceil((265 - (-240)) / cell);
    navGrid = makeNavGrid(329050, -240, cell, cols, rows,
        (x, z) => stage10Walkable(x, z, 4) && !stage10StaticBlockedAt(x, z, 3.5));

    registerCampaignWorldRoot({
        key: 'campaign-10', root: worldRoot, lightsKey: 'campaign-10', bounds: S10_BOUNDS,
        warmupViews: [
            { x: S10_START.x, y: 0, z: S10_START.z },
            { x: S10_SAFE_BAY.x, y: 0, z: S10_SAFE_BAY.z },
            { x: S10_DEFENSE.x, y: 0, z: S10_DEFENSE.z },
        ],
    });
}

export function ensureStage10World() {
    if (!built) { built = true; buildWorld(); }
    return worldRoot;
}

export function stage10Walkable(x, z, radius = 0) {
    const port = x >= 329055 + radius && x <= 330930 - radius
        && z >= -238 + radius && z <= 238 - radius;
    const airstripApron = x >= 329045 + radius && x <= 329620 - radius
        && z >= 115 + radius && z <= 286 - radius;
    return port || airstripApron;
}

export function stage10StaticBlockedAt(x, z, radius = 0) {
    return staticBlockers.some((blocker) => pointInBlocker(x, z, radius, blocker));
}

export function stage10BlockedAt(x, z, radius = 0) {
    return blockers.some((blocker) => pointInBlocker(x, z, radius, blocker));
}

export function stage10PathWalkable(x, z, radius = 0) {
    return stage10Walkable(x, z, radius)
        && !stage10StaticBlockedAt(x, z, radius)
        && cranePathWalkable(cranes, x, z, radius);
}

export function stage10Resolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers.filter((blocker) => blocker.active));
}

export function stage10SegHitsWall(x0, z0, x1, z1, y = 0) {
    return blockers.some((blocker) => blocker.active && blocker.bullet && y < blocker.top
        && segmentHitsBlocker(x0, z0, x1, z1, blocker));
}

export function stage10GroundHeight() { return 0; }
export function stage10NavGrid() { ensureStage10World(); return navGrid; }
export function stage10CraneSystem() { ensureStage10World(); return cranes; }
export function stage10DefenseSystem() { ensureStage10World(); return defense; }

export function stage10SetMarkers(names) {
    ensureStage10World();
    const wanted = new Set(names || []);
    for (const [name, marker] of Object.entries(markers)) marker.visible = wanted.has(name);
}

export function stage10UpdateWorld(dt, elapsed) {
    if (!built) return;
    for (const marker of Object.values(markers)) if (marker.visible) {
        pulseStandMarker(marker, elapsed * 4.2);
    }
    if (carrier) carrier.position.y = Math.sin(elapsed * 1.2) * 0.08;
    // Peti kemas/gudang/rak pipa yang menutupi player atau robot jadi nyaris
    // tembus pandang (utility/occlusion.js).
    updateStageOccluders(S10_OCC, dt);
}

export function stage10SupplyPlacements() {
    return {
        crates: crateCandidates.map(([x, z]) => ({ x: S10_ORIGIN.x + x, z })),
        barrels: barrelCandidates.map(([x, z]) => ({ x: S10_ORIGIN.x + x, z })),
        drops: [
            { x: 329290, z: 72, type: 'ammo', weapon: 'pistol' },
            { x: 329835, z: -22, type: 'medkit' },
            { x: 330205, z: 155, type: 'ammo', weapon: 'rifle' },
            { x: 330465, z: 74, type: 'medkit' },
        ],
    };
}

export function stage10EncounterPoints(name) {
    const sets = {
        entry: [[329185, 72], [329245, -32], [329310, 112], [329355, -105], [329420, 46]],
        yard: [[329455, -105], [329510, 102], [329575, -32], [329645, 112], [329710, -96], [329785, 35]],
        warehouse: [[329965, -52], [330020, 66], [330075, -58], [330125, 64], [330180, -42]],
        pipeRack: [[330220, 128], [330270, -136], [330330, 46], [330390, -104], [330450, 122]],
        defense: [[330465, 118], [330515, -182], [330565, 62], [330645, 128], [330705, -182], [330770, 28]],
    };
    return (sets[name] || sets.entry).map(([x, z]) => ({ x, z }));
}

function layoutContainerFree(x, z, radius, state) {
    for (const item of cranes.containers) {
        const t = item[state];
        const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
        const dx = x - t.x, dz = z - t.z;
        const lx = dx * c + dz * s;
        const lz = dx * -s + dz * c;
        if (Math.abs(lx) <= 12 + radius && Math.abs(lz) <= 4.5 + radius) return false;
    }
    return true;
}

function nearestCell(point, state) {
    let best = -1, bestD = Infinity;
    for (let r = 0; r < navGrid.rows; r++) for (let c = 0; c < navGrid.cols; c++) {
        const i = r * navGrid.cols + c;
        if (!navGrid.walk[i]) continue;
        const x = navGrid.x0 + (c + 0.5) * navGrid.cell;
        const z = navGrid.z0 + (r + 0.5) * navGrid.cell;
        if (!layoutContainerFree(x, z, 3.5, state)) continue;
        const d = (x - point.x) ** 2 + (z - point.z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

function connectedInLayout(state, start, goals) {
    const startCell = nearestCell(start, state);
    const goalCells = goals.map((goal) => nearestCell(goal, state));
    const seen = new Uint8Array(navGrid.walk.length);
    const queue = new Int32Array(navGrid.walk.length);
    let head = 0, tail = 0;
    if (startCell >= 0) { seen[startCell] = 1; queue[tail++] = startCell; }
    while (head < tail) {
        const at = queue[head++], c = at % navGrid.cols, r = (at / navGrid.cols) | 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= navGrid.cols || nr >= navGrid.rows) continue;
            const ni = nr * navGrid.cols + nc;
            if (seen[ni] || !navGrid.walk[ni]) continue;
            const x = navGrid.x0 + (nc + 0.5) * navGrid.cell;
            const z = navGrid.z0 + (nr + 0.5) * navGrid.cell;
            if (!layoutContainerFree(x, z, 3.5, state)) continue;
            seen[ni] = 1; queue[tail++] = ni;
        }
    }
    const reached = goalCells.map((cell) => cell >= 0 && !!seen[cell]);
    return { connected: reached.every(Boolean), reachableCells: tail, reached };
}

export function stage10ConnectivityDebug() {
    ensureStage10World();
    const A = connectedInLayout('A', S10_START, [S10_SAFE_BAY]);
    const B = connectedInLayout('B', S10_SAFE_BAY,
        [S10_RELAY, S10_PIPE_RACK, { x: S10_DEFENSE.x - 70, z: S10_DEFENSE.z + 70 }, S10_EXTRACT]);
    return { A, B, allStableStatesConnected: A.connected && B.connected };
}

export function stage10WorldDebug() {
    ensureStage10World();
    return {
        built, origin: { ...S10_ORIGIN }, bounds: { ...S10_BOUNDS }, deterministic: true,
        theme: 'balikpapan-cargo-airstrip-industrial-port-coast',
        airstrip: {
            runway: semantic.cargoAirstrip || 0,
            freightTerminals: semantic.airFreightTerminal || 0,
            parkedCargoAircraft: semantic.parkedCargoAircraft || 0,
        },
        port: {
            sea: semantic.sea || 0, quays: semantic.quay || 0,
            containerVessels: semantic.containerVessel || 0,
            harborTugs: semantic.harborTug || 0,
            staticContainers: semantic.staticContainer || 0,
            forklifts: semantic.forklift || 0,
            reachStackers: semantic.reachStacker || 0,
            warehouses: semantic.automatedWarehouse || 0,
            pipeRackBays: semantic.pipeRackBay || 0,
        },
        smallCity: { buildings: semantic.smallCityBuilding || 0, scale: 'low-rise' },
        cranes: craneDebug(cranes),
        defense: defenseArrayDebug(defense),
        connectivity: stage10ConnectivityDebug(),
        blockers: {
            total: blockers.length, static: staticBlockers.length,
            dynamic: dynamicBlockers.length,
            activeDynamic: dynamicBlockers.filter((b) => b.active).length,
        },
        nav: navGrid ? { cols: navGrid.cols, rows: navGrid.rows, cell: navGrid.cell } : null,
        staticBatches: staticBatch.length + cranes.staticBatch.length,
        pointLights: stageLights.length,
        markers: Object.keys(markers),
        occluders: occlusionDebug(S10_OCC),
        supplies: { crateCandidates: crateCandidates.length, barrelCandidates: barrelCandidates.length },
    };
}

export function stage10ResetLayout() {
    ensureStage10World();
    setCraneLayout(cranes, 'A');
    resetStageOccluders(S10_OCC);
}
