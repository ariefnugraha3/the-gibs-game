// Campaign Stage 9 — Kertajati rural airport perimeter.
// Everything is generated from fixed coordinates: no runtime/random skyline and
// deliberately no city buildings around the airfield.

import { CAMP_M, CFG } from '../../../../core/config.js';
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
    buildSplitDoor, setSplitDoorOpen, splitDoorLeafOffset, DOOR_OPEN_REVEAL,
} from '../../utility/doors.js';
import {
    BARRICADE_TOP, barricadeBlocker, buildFurniturePile, buildWallBreach,
} from '../../utility/barricade.js';
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
// Dipindah user (denah CSV Chapter 2, 2026-08-26) ke sel (21,3): ujung utara
// aula check-in, tepat di depan sekat toilet yang jebol. Z-nya digeser ke sisi
// bebas sel karena pulau konter menempati z 444..466.
export const S9_INTERIOR_CHECKPOINT = Object.freeze({ x: 312100, z: 475 });
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
export const S9_FRONT_PARKING_LOTS = Object.freeze({
    left: Object.freeze({ x0: 305675, x1: 306325, z0: -295, z1: -115 }),
    right: Object.freeze({ x0: 305675, x1: 306325, z0: 335, z1: 490 }),
});
// Geometri parkir DITURUNKAN dari bodi mobil Stage 7, bukan angka tangan: sebuah
// baris yang digeser tanpa menghitung ulang setengah panjangnya membuat mobil
// menembus pagar batas / wheel stop, dan itu terbaca sebagai bug.
export const S9_PARK_CAR_HALF_LEN = STAGE7_ROAD_VEHICLE_SPECS.sedan.length * CAMP_M * .5;
export const S9_PARK_ROW_OFFSET = S9_PARK_CAR_HALF_LEN + 28.2;   // pusat baris <-> aisle
export const S9_PARK_WHEEL_STOP_OFFSET = S9_PARK_CAR_HALF_LEN + 1.8;
// Tinggi bebas kanopi surya. Atap SUV Stage 7 setinggi 2,2 m (15,4 unit), jadi
// slab lama pada y 14,25 memotong atap mobil yang parkir di bawahnya.
export const S9_PARK_CANOPY_CLEAR = 21;
// Dua kantong parkir: aisle (pembatas wheel stop) plus dua baris simetris.
export const S9_FRONT_PARKING_COURTS = Object.freeze([
    Object.freeze({ divider: -210, lot: 'left' }),
    Object.freeze({ divider: 420, lot: 'right' }),
]);

// ---- Denah grid Chapter 2 (stages(Stage9-Chapter2).csv) ----------------------
// Sel 20 unit; kolom 0 = barat (x-330 relatif origin), baris 0 = utara (z+540).
// Hanya token yang MENGUBAH dunia yang dibawa ke sini: sisanya sudah terbangun
// dari koordinat aslinya.
export const S9_INTERIOR_CELL = 20;
export const S9_INTERIOR_GRID = Object.freeze({ cols: 33, rows: 54, x0: -330, z1: 540 });
export const s9InteriorCellPos = (c, r) => ({
    x: S9_INTERIOR_ORIGIN.x + S9_INTERIOR_GRID.x0 + (c + .5) * S9_INTERIOR_CELL,
    z: S9_INTERIOR_GRID.z1 - (r + .5) * S9_INTERIOR_CELL,
});
// '=' TEMBOK BOLONG: sekat toko yang dijebol supaya bisa dilewati. Tiga lubang
// merangkai restoran -> kafe -> toilet -> aula check-in di belakang deret toko.
export const S9_INTERIOR_BREACHES = Object.freeze([
    Object.freeze({ col: 11, r0: 2, r1: 3 }),
    Object.freeze({ col: 16, r0: 2, r1: 3 }),
    Object.freeze({ col: 20, r0: 2, r1: 3 }),

]);
// '@' OBSTACLE: tumpukan perabot/koper yang TIDAK bisa dilewati. Disimpan sebagai
// RUN, bukan sel lepas, supaya ujungnya bisa dirapatkan ke dinding terdekat.
export const S9_INTERIOR_OBSTACLE_RUNS = Object.freeze([
    Object.freeze({ c0: 12, c1: 20, r0: 9, r1: 9 }),    // muka kafe + toilet ditutup
    Object.freeze({ c0: 20, c1: 20, r0: 10, r1: 14 }),  // turun ke tembok security
    Object.freeze({ c0: 21, c1: 21, r0: 23, r1: 25 }),  // pintu timur security disumbat
    Object.freeze({ c0: 21, c1: 21, r0: 35, r1: 45 }),  // pemisah paruh bawah
]);
export const S9_INTERIOR_OBSTACLE_CELLS = Object.freeze(
    S9_INTERIOR_OBSTACLE_RUNS.flatMap((run) => {
        const out = [];
        for (let c = run.c0; c <= run.c1; c++)
            for (let r = run.r0; r <= run.r1; r++) out.push(Object.freeze([c, r]));
        return out;
    }));
// Petak loot Chapter 2. Baggage memakai kotak pembatas sel 'Z' pada denah, bukan
// hanya lingkar belt, supaya 15 peti tersebar di seluruh hall reclaim.
// Kotak ini adalah HALL reclaim-nya, bukan lingkar beltnya: lubang di tengah
// torus dikelilingi empat collider belt sehingga player tak pernah bisa masuk.
export const S9_INTERIOR_BAGGAGE_LOOT = Object.freeze({ c0: 22, c1: 31, r0: 40, r1: 52 });
// Kisi bank kursi ruang tunggu (offset dari S9_INTERIOR_ORIGIN.x). Dipakai DUA
// kali: membangun kursinya, dan menurunkan titik spawn encounter concourse —
// supaya "60 robot di area kursi tunggu" tak pernah lepas dari kursinya.
export const S9_SEAT_XS = Object.freeze([-285, -225, -165, -105]);
export const S9_SEAT_ZS = Object.freeze([300, 235, 170, 105, 40, -25, -90, -155, -220, -285]);
const seatSkipped = (dx, z) => dx === S9_SEAT_XS[0] && z <= -220;
// Lorong di antara (dan di kedua sisi) deret kursi: itulah tempat robot berdiri.
export const S9_SEAT_AISLE_XS = Object.freeze([
    S9_SEAT_XS[0] - 20,
    ...S9_SEAT_XS.slice(1).map((dx, i) => (dx + S9_SEAT_XS[i]) * .5),
    S9_SEAT_XS[S9_SEAT_XS.length - 1] + 30,
]);
export const S9_SEAT_AISLE_ZS = Object.freeze(
    S9_SEAT_ZS.slice(1).map((z, i) => (z + S9_SEAT_ZS[i]) * .5));

export const S9_OCC = 'campaign-9-runway';
export const S9_FRONT_KEY = 'campaign-9';
export const S9_INTERIOR_KEY = 'campaign-9-interior';
export const S9_RUNWAY_KEY = 'campaign-9-runway';
export const S9_EXTERIOR_ENV = Object.freeze({
    background: 0x263222, fogColor: 0x263222, fogNear: 260, fogFar: 1800,
});
export const S9_INTERIOR_ENV = Object.freeze({
    background: 0x000000, fogColor: 0x000000, fogNear: 260, fogFar: 1800,
});
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
const frontCanopyRecords = [];
const frontPlanterRecords = [];
const frontBoundaryRuns = [];
const interiorObstacleRecords = [];
const interiorBreachRecords = [];
const interiorLayoutRecords = {
    zones: [], amenityRows: { north: [], south: [] },
    checkinCounters: 0, securityLanes: 0, seatBanks: 0,
    selfCheckKiosks: 0, baggageBelts: 0,
    toiletCubicles: 0, toiletBasins: 0, toiletUrinals: 0, toiletDoors: [],
    // Perabot per jenis ruang (permintaan user 2026-08-27): dihitung saat dunia
    // dibangun supaya smoke bisa membedakan properti nyata dari placeholder.
    fixtures: Object.create(null),
    // Lebar lorong yang tersisa di antara gondola toko souvenir: dicatat supaya
    // smoke menguji CLEARANCE-nya, bukan sekadar jumlah raknya.
    shopAisles: [],
};

// Hash deterministik: dunia Chapter 2 dibangun bersama seluruh dunia campaign
// lain saat loading, jadi memakai Math.random() akan menggeser penempatan acak
// stage lain.
function ihash(n) {
    let h = Math.imul(n | 0, 374761393) + 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fixture(kind, amount = 1) {
    const f = interiorLayoutRecords.fixtures;
    f[kind] = (f[kind] || 0) + amount;
}
const runwayLayoutRecords = {
    zones: [], parkedAircraft: 0, jetBridges: 0,
    taxiwayConnectors: 0, fireStations: 0,
};
let fuelPump = null;

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

// Kedalaman tumpang tindih dua footprint OBB (SAT). Dipakai kontrak "tidak ada
// kendaraan yang parkir menembus benda apa pun": nilai <= 0 berarti terpisah.
function blockerOverlapDepth(a, b) {
    const axes = [[a.axx, a.axz], [a.azx, a.azz], [b.axx, b.axz], [b.azx, b.azz]];
    let depth = Infinity;
    for (const [ux, uz] of axes) {
        const reach = (o) => Math.abs(o.hx * (o.axx * ux + o.axz * uz))
            + Math.abs(o.hz * (o.azx * ux + o.azz * uz));
        const gap = reach(a) + reach(b)
            - Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz);
        if (gap <= 0) return 0;
        depth = Math.min(depth, gap);
    }
    return depth;
}

const VEHICLE_KINDS = ['parked-car', 'abandoned-vehicle', 'airport-front-bus',
    'airport-service-van'];

// Perabot Chapter 2 yang punya collider. Aturan "yang digambar adalah yang
// memblokir" berlaku dua arah, jadi tak satu pun boleh menembus tembok, sekat,
// atau perabot lain — persis kontrak kendaraan parkir Chapter 1.
const S9_INTERIOR_FIXTURE_KINDS = new Set([
    'souvenir-wall-shelf', 'souvenir-gondola', 'souvenir-checkout',
    'restaurant-servery', 'restaurant-table', 'restaurant-tray-return',
    'cafe-back-bar', 'cafe-counter', 'cafe-table', 'central-cafe-counter',
    'checkin-island', 'checkin-bag-drop', 'self-check-kiosk',
    'security-scanner-post', 'security-xray', 'security-console',
    'security-podium', 'baggage-belt', 'baggage-chute', 'baggage-display',
]);
// Corong bagasi memang DIBANGUN DI DALAM collider belt sisi baratnya, supaya
// tudungnya tidak menambah satu unit pun area terlarang.
const S9_INTERIOR_OVERLAP_OK = new Set(['baggage-belt|baggage-chute']);

export function stage9InteriorOverlaps(tolerance = 0.5) {
    const bad = [];
    for (let i = 0; i < interiorBlockers.length; i++) {
        const a = interiorBlockers[i];
        if (!S9_INTERIOR_FIXTURE_KINDS.has(a.kind)) continue;
        for (let j = 0; j < interiorBlockers.length; j++) {
            if (i === j) continue;
            const b = interiorBlockers[j];
            if (S9_INTERIOR_OVERLAP_OK.has([a.kind, b.kind].sort().join('|')))
                continue;
            const depth = blockerOverlapDepth(a, b);
            if (depth > tolerance) bad.push({
                a: a.kind, b: b.kind, depth: +depth.toFixed(2),
                x: Math.round(a.x - S9_INTERIOR_ORIGIN.x), z: Math.round(a.z),
            });
        }
    }
    return bad;
}

// Laporan bentrok kendaraan Chapter 1. Toleransi 0,5 unit (~7 cm) menyerap
// pembulatan float; apa pun di atasnya benar-benar terlihat menembus.
function frontVehicleOverlaps(tolerance = 0.5) {
    const bad = [];
    for (let i = 0; i < frontBlockers.length; i++) {
        const a = frontBlockers[i];
        if (!VEHICLE_KINDS.includes(a.kind)) continue;
        for (let j = 0; j < frontBlockers.length; j++) {
            if (i === j) continue;
            const b = frontBlockers[j];
            if (j < i && VEHICLE_KINDS.includes(b.kind)) continue;
            const depth = blockerOverlapDepth(a, b);
            if (depth > tolerance)
                bad.push({ kind: a.kind, x: a.x, z: a.z, into: b.kind, depth });
        }
        // Slab kanopi surya adalah dekor tanpa blocker: atap mobil di bawahnya
        // harus tetap lebih rendah daripada sisi bawah slab.
        const worldHalfX = a.hx * Math.abs(a.axx) + a.hz * Math.abs(a.azx);
        const worldHalfZ = a.hx * Math.abs(a.axz) + a.hz * Math.abs(a.azz);
        for (const c of frontCanopyRecords) {
            if (Math.abs(a.x - c.x) >= c.hx + worldHalfX) continue;
            if (Math.abs(a.z - c.z) >= c.hz + worldHalfZ) continue;
            if (a.top > c.underside - tolerance)
                bad.push({ kind: a.kind, x: a.x, z: a.z, into: 'parking-canopy-roof',
                    depth: a.top - c.underside });
        }
    }
    return bad;
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
    // Bidang yang saling menyambung harus punya overlap lebih lebar daripada
    // diameter player. Kalau hanya bertemu pada satu garis setelah radius
    // diterapkan, `slideWalk` membacanya sebagai dinding tak terlihat.
    box(parent, M.asphalt, 1760, .44, 90, 300000, -.04, 25, false);
    box(parent, M.asphalt, 1720, .46, 110, 300010, -.03, -220, false);
    runwayLayoutRecords.zones.push(
        { kind: 'apron', x: 299580, z: 180, hx: 470, hz: 125 },
        { kind: 'service-yard', x: 300450, z: 175, hx: 400, hz: 155 },
        { kind: 'taxiway-b', x: 300000, z: 25, hx: 880, hz: 45 },
        { kind: 'runway-14-32', x: 300010, z: -220, hx: 860, hz: 55 },
    );

    // Tiga konektor C3/C2/D1 dari taxiway ke runway.
    for (const x of [299860, 300250, 300700]) {
        box(parent, M.asphalt, 86, .43, 190, x, -.02, -85, false);
        box(parent, M.hazard, 2, .08, 170, x, .23, -85, false);
        for (const side of [-1, 1])
            box(parent, M.hazard, 1, .08, 170, x + side * 31, .23, -85, false);
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
    // Slab menggantung TEPAT di atas tinggi bebas: kalau disamakan dengan tinggi
    // kolom lama (15) atap SUV yang parkir di bawahnya menembus beton.
    const clear = S9_PARK_CANOPY_CLEAR;
    box(g, M.roof, 196, 1.5, 82, 0, clear + .75, 0);
    // Panel surya lebar memberi massa visual tanpa menambah PointLight.
    for (const px of [-68, -23, 23, 68])
        box(g, M.glass, 38, .7, 72, px, clear + 1.85, 0, false);
    for (const px of [-88, -29, 29, 88]) {
        box(g, M.frame, 2, clear, 2, px, clear * .5, 0);
        addChapterBlocker(frontBlockers, x + px, z, 1.5, 1.5, clear,
            0, 'parking-canopy-column');
    }
    weldOccluder(S9_FRONT_KEY, parent, g,
        { x, z, hx: 98, hz: 41, top: clear + 2.5 });
    frontCanopyRecords.push({ x, z, hx: 98, hz: 41, underside: clear });
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
    // Backdrop rural nyata: bidang rumput jauh lebih lebar daripada footprint
    // kamera ultrawide, dengan petak meadow dan sabuk pohon di seluruh horizon.
    // Semuanya dekor murni di luar union walkable (tanpa blocker/nav).
    box(statics, M.grass, 2800, 0.8, 1800, 305720, -0.7, 80, false);
    for (const [x, z, sx, sz] of [
        [304760, -510, 620, 250], [305520, -570, 700, 210],
        [306360, -540, 720, 240], [304820, 700, 700, 260],
        [305650, 740, 720, 220], [306470, 690, 650, 270],
    ]) {
        box(statics, M.fieldGreen, sx, .38, sz, x, -.28, z, false);
        count('frontBackdropMeadow');
    }
    for (let x = 304450; x <= 306990; x += 58) for (const z of [-650, 820]) {
        buildTree(statics, M, x, z, .62 + ((x / 58) % 4) * .08);
        count('frontBackdropTree');
    }
    for (let z = -530; z <= 720; z += 62) for (const x of [304470, 306970]) {
        buildTree(statics, M, x, z, .58 + ((z / 62) % 5) * .07);
        count('frontBackdropTree');
    }
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
    // Setiap bangkai berdiri di jalur bebas: dulu dua di antaranya menembus
    // pagar batas barat dan kolom kanopi parkir utara.
    const wrecks = [
        [305360, 48, .08], [305570, 278, -.12], [305880, 38, .05],
        [305940, 280, -.06], [306120, -190, .02], [306150, 300, -.04],
        [306330, 52, .1], [306385, 270, -.08], [306450, -145, .04],
    ];
    wrecks.forEach(([x, z, yaw], i) => buildFrontCar(parent, M, x, z,
        yaw, i + 1, 'abandoned-vehicle'));

    // Parkir depan terminal sengaja padat tetapi teratur: empat baris mobil
    // menyisakan boulevard utama dan sumbu masuk z=160 tetap lapang.
    const parkingRows = S9_FRONT_PARKING_COURTS.flatMap((court) =>
        [court.divider - S9_PARK_ROW_OFFSET, court.divider + S9_PARK_ROW_OFFSET]);
    const dividerFor = (z) => S9_FRONT_PARKING_COURTS
        .reduce((best, court) => Math.abs(court.divider - z)
            < Math.abs(best - z) ? court.divider : best, S9_FRONT_PARKING_COURTS[0].divider);
    let parked = 0;
    for (const z of parkingRows) for (let x = 305760; x <= 306320; x += 70) {
        const dividerZ = dividerFor(z);
        // Model Stage 7 menghadap +X lokal. ±90° membuat panjangnya mengikuti
        // petak z dan bagian DEPAN selalu menunjuk wheel-stop/pembatas tengah.
        const yaw = dividerZ > z ? -Math.PI * .5 : Math.PI * .5;
        buildFrontCar(parent, M, x, z, yaw, parked);
        frontParkingRecords.push({ x, z, yaw, dividerZ });
        parked++;
    }
    // Kanopi surya membuat dua lapangan parkir terbaca sebagai massa arsitektur,
    // bukan hamparan aspal. Kolom berada di sela dua baris mobil.
    for (const x of [305850, 306070, 306290])
        for (const court of S9_FRONT_PARKING_COURTS)
            buildParkingCanopy(parent, M, x, court.divider);
    // Kendaraan servis mengisi tepi terluar lot tanpa menyempitkan rute tempur.
    // Deret van berhenti sebelum bus sudut lot; versi lama menabrak badannya.
    let van = 0;
    for (const z of [-310, 510]) for (let x = 305600; x <= 306350; x += 150) {
        buildFrontVan(parent, M, x, z, z > 0 ? Math.PI : 0, van++);
    }
    for (const [x, z, yaw] of [[305820, -110, 0], [305820, 330, Math.PI],
        [306395, -285, Math.PI * .5], [306395, 445, Math.PI * .5]])
        buildFrontBus(parent, M, x, z, yaw, z > 0 ? 1 : 0);
    for (const [x, z] of [[305585, 25], [305585, 295], [306360, 15], [306360, 305]])
        buildFrontBooth(parent, M, x, z, z > 160 ? Math.PI : 0);
    for (const [x, z] of [[306490, -270], [306490, -85], [306490, 315], [306490, 485]])
        buildTrolleyBay(parent, M, x, z, Math.PI * .5);
    for (const x of [305650, 305850, 306050, 306250, 306450]) {
        buildFrontMast(parent, M, x, -345);
        buildFrontMast(parent, M, x, 535);
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

    for (const [x, z, sx, sz] of [[305980, -35, 90, 18], [306150, 340, 110, 18],
        [306335, -25, 74, 18], [306425, 340, 84, 18]]) {
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
        const x = 305690 + (i % 8) * 82, z = i < 8 ? -290 : i < 16 ? 355 : 497;
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
        box(statics, M.concrete, 10, .8, 2.2, x, .4,
            z + Math.sign(dividerFor(z) - z) * S9_PARK_WHEEL_STOP_OFFSET, false);
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
    // Pita lubang '=' pada denah: satu per kolom breach, dipakai untuk MEMOTONG
    // sekat toko yang melewatinya sekaligus menandai lorong bebas di belakang.
    const breachBands = S9_INTERIOR_BREACHES.map((b) => {
        const c = s9InteriorCellPos(b.col, b.r0);
        return {
            col: b.col, x: c.x,
            z0: S9_INTERIOR_GRID.z1 - (b.r1 + 1) * S9_INTERIOR_CELL,
            z1: S9_INTERIOR_GRID.z1 - b.r0 * S9_INTERIOR_CELL,
        };
    });
    const breachAt = (px) => breachBands.find((b) =>
        Math.abs(px - b.x) <= S9_INTERIOR_CELL * .5);
    // Sekat yang kena lubang dipecah jadi dua ruas; kusen bergerigi dibangun oleh
    // helper '/' BERSAMA (utility/barricade.js), tanpa blocker — persis Stage 1/2.
    const partitionWall = (thickness, depth, px, pz, kind) => {
        const band = breachAt(px);
        const z0 = pz - depth * .5, z1 = pz + depth * .5;
        if (!band || band.z0 <= z0 || band.z1 >= z1) {
            wall(thickness, depth, px, pz, kind);
            return;
        }
        wall(thickness, band.z0 - z0, px, (z0 + band.z0) * .5, kind);
        wall(thickness, z1 - band.z1, px, (band.z1 + z1) * .5, kind);
        const breachParts = [];
        buildWallBreach(breachParts, px, (band.z0 + band.z1) * .5, 'ew',
            band.z1 - band.z0, 22, thickness);
        for (const part of breachParts) statics.add(part);
        interiorBreachRecords.push({
            col: band.col, x: px, z: (band.z0 + band.z1) * .5,
            gap: band.z1 - band.z0, kind,
        });
    };

    // TOILET (permintaan user 2026-08-27, menggantikan tiga sekat kaca + tabung
    // putih): bilik berpintu di dinding belakang, meja wastafel bercermin di satu
    // sisi, deret urinoir bersekat di sisi lain, lalu TEMBOK DEPAN dengan satu
    // ambang pintu lebar. Semua perabot menempel dinding; lorong tengah dan pita
    // lubang '=' tetap kosong, jadi tak ada satu pun yang menghalangi rute.
    const buildRestroom = (cx, cz, width, depth, frontDir, left, right, backZ) => {
        const frontZ = cz + frontDir * depth * .5;
        const inX0 = left + 1.5, inX1 = right - 1.5;
        const zLo = cz - depth * .5, zHi = cz + depth * .5;
        // Lorong '=' yang menembus ruang ini: perabot tak boleh menyentuhnya.
        const lane = breachBands.filter((b) =>
            b.x >= left - 1 && b.x <= right + 1 && b.z1 > zLo && b.z0 < zHi);
        const stallLimit = lane.reduce((limit, b) => Math.min(limit,
            Math.abs(backZ - (frontDir > 0 ? b.z0 : b.z1))), Infinity);
        const stallDepth = Math.min(Math.max(30, depth * .34), stallLimit);
        const stallFront = backZ + frontDir * stallDepth;
        const usable = inX1 - inX0;

        // --- baris bilik menempel dinding belakang ---
        const cabins = Math.max(2, Math.floor(usable / 27));
        const cabinW = usable / cabins;
        const midZ = backZ + frontDir * stallDepth * .5;
        for (let i = 0; i < cabins; i++) {
            const px = inX0 + cabinW * (i + .5);
            const g = new THREE.Group();
            for (const side of [-1, 1])
                box(g, M.panel, 2, 15, stallDepth - 1,
                    px + side * cabinW * .5, 7.5, midZ, false);
            // Kloset: alas, dudukan dan tangki, semuanya menempel dinding belakang.
            box(g, M.white, 9, 3.4, 11, px, 1.7, backZ + frontDir * 8, false);
            box(g, M.white, 11, 1, 12, px, 3.7, backZ + frontDir * 8.5, false);
            box(g, M.white, 12, 7, 3.4, px, 5.5, backZ + frontDir * 2.6, false);
            box(g, M.steel, 3.4, .8, .8, px, 8.6, backZ + frontDir * 2.6, false);
            // Daun pintu bilik dibiarkan menganga: bilik terbaca kosong.
            const hinge = px - cabinW * .5 + 2;
            const swing = frontDir * (i % 2 ? .6 : 1.0);
            const leafW = cabinW - 5;
            const leaf = box(g, M.panel, leafW, 12, 1.6,
                hinge + leafW * .5 * Math.cos(swing),
                6.6, stallFront - frontDir * (1.2 + leafW * .5 * Math.sin(Math.abs(swing))),
                false);
            leaf.rotation.y = swing;
            weldOccluder(S9_INTERIOR_KEY, parent, g,
                { x: px, z: midZ, hx: cabinW * .5, hz: stallDepth * .5, top: 15 });
            addChapterBlocker(interiorBlockers, px, midZ,
                cabinW * .5 - 1, stallDepth * .5, 15, 0, 'toilet-cubicle');
            interiorLayoutRecords.toiletCubicles++;
        }

        // --- zona perabot: antara ambang pintu dan bilik / lorong breach ---
        const zoneBack = lane.length
            ? (frontDir > 0 ? Math.min(...lane.map(b => b.z0))
                : Math.max(...lane.map(b => b.z1)))
            : stallFront;
        const zoneDepth = Math.abs(zoneBack - frontZ);
        const slots = Math.max(1, Math.min(3, Math.floor((zoneDepth - 24) / 21)));
        const fixtureZ = (t) => frontZ + frontDir * (20 + t * 21);
        const bankZ = frontZ + frontDir * (20 + (slots - 1) * 21 * .5);
        const bankLen = 13 + (slots - 1) * 21;

        // Meja wastafel + cermin pada dinding KIRI.
        {
            const basinX = inX0 + 5;
            const g = new THREE.Group();
            box(g, M.panel, 10, 4, bankLen, basinX, 7, bankZ, false);
            box(g, M.frame, 9, 3, bankLen - 2, basinX, 4.5, bankZ, false);
            box(g, M.glass, .5, 11, bankLen - 3, inX0 + .4, 15, bankZ, false);
            for (let t = 0; t < slots; t++) {
                cylinder(g, M.white, 3.1, 1.6, basinX + 1, 9.4, fixtureZ(t), 10);
                box(g, M.steel, 1, 3, 1, basinX - 3.2, 10.5, fixtureZ(t), false);
                interiorLayoutRecords.toiletBasins++;
            }
            weldOccluder(S9_INTERIOR_KEY, parent, g,
                { x: basinX, z: bankZ, hx: 5, hz: bankLen * .5, top: 20 });
            addChapterBlocker(interiorBlockers, basinX, bankZ,
                5, bankLen * .5, 9, 0, 'toilet-basin-counter');
        }
        // Urinoir bersekat pada dinding KANAN.
        {
            const urinalX = inX1 - 4;
            const g = new THREE.Group();
            for (let t = 0; t < slots; t++) {
                const pz = fixtureZ(t);
                box(g, M.white, 7, 9, 8, urinalX, 8, pz, false);
                box(g, M.white, 7, 2, 9.5, urinalX, 4.6, pz, false);
                box(g, M.glass, 6, 13, .5, urinalX, 9, pz + frontDir * 5.6, false);
                interiorLayoutRecords.toiletUrinals++;
            }
            weldOccluder(S9_INTERIOR_KEY, parent, g,
                { x: urinalX, z: bankZ, hx: 4, hz: bankLen * .5, top: 15 });
            addChapterBlocker(interiorBlockers, urinalX, bankZ,
                4, bankLen * .5, 13, 0, 'toilet-urinal-row');
        }
        // Tempat sampah dan pengering tangan: dekor kecil, tanpa collider.
        box(statics, M.frame, 5, 7, 5, inX0 + 7, 3.5, frontZ - frontDir * 10, false);
        box(statics, M.panel, 4, 4, 2.5, inX1 - 3, 12, frontZ - frontDir * 28, false);

        // --- TEMBOK DEPAN + AMBANG PINTU ---
        // Lebar bukaan dikunci minimal 4x radius player dan sisa dindingnya
        // dibagi rata, jadi retune lebar ruang tak pernah menyempitkan jalan.
        // Daun yang terbuka penuh menjorok `leafReach x bentang` dari pusat; batasi
        // bentangnya supaya kedua daun berhenti DI DALAM tembok depan alih-alih
        // mencuat melewati sekat samping ruang.
        const leafReach = .5 + (1 - DOOR_OPEN_REVEAL) / 2;
        const opening = Math.min(usable / (2 * leafReach),
            Math.max(CFG.player.radius * 4, 42));
        const stub = (usable - opening) * .5;
        if (stub > 1) {
            wall(stub, 3, inX0 + stub * .5, frontZ, 'toilet-front-wall');
            wall(stub, 3, inX1 - stub * .5, frontZ, 'toilet-front-wall');
        }
        for (const side of [-1, 1])
            box(statics, M.frame, 2.5, 22, 4,
                cx + side * opening * .5, 11, frontZ, false);
        box(statics, M.frame, opening + 5, 3, 4, cx, 20.5, frontZ, false);
        // Daun pintu memakai rig dua-daun BERSAMA, dipasang MENGANGA PENUH dan
        // tak pernah digerakkan: pintunya terlihat tetapi tak pernah memblokir.
        const door = buildSplitDoor(statics, M.glass, cx, 9.5, frontZ,
            opening, 19, 1.6);
        setSplitDoorOpen(door, 1);
        interiorLayoutRecords.toiletDoors.push({
            x: cx, z: frontZ, opening,
            // Lebar BERSIH: tepi dalam kedua daun saat menganga penuh.
            clear: 2 * (splitDoorLeafOffset(door, 1) - door.leafSpan * .5),
            leafReach: opening * leafReach,
        });
    };

    const buildAmenity = (kind, cx, cz, width, depth, frontDir, row) => {
        const left = cx - width * .5, right = cx + width * .5;
        const backZ = cz - frontDir * depth * .5;
        box(statics, M.wood, width - 5, .14, depth - 5, cx, -.02, cz, false);
        // Tiga dinding didaftarkan sendiri-sendiri: toko berongga tidak boleh
        // memakai satu footprint occluder sebesar seluruh ruang kosongnya.
        partitionWall(3, depth, left, cz, `${kind}-partition`);
        partitionWall(3, depth, right, cz, `${kind}-partition`);
        wall(width, 3, cx, backZ, `${kind}-back-wall`);
        box(statics, M.frame, width, 2, 3,
            cx, 18, cz + frontDir * depth * .5);

        // Muka DALAM kedua sekat samping: perabot dirapatkan ke sana supaya
        // lorong tengah toko tidak pernah tersumbat.
        const inL = left + 3, inR = right - 3;
        const seed = Math.round(cx * .37 + cz * .11);
        const goods = [M.hazard, M.tech, M.white, M.leaf, M.wood, M.steel];
        // Lorong '=' yang menembus baris fasilitas UTARA adalah satu-satunya
        // hubungan aula check-in ke concourse; perabot tambahan tidak boleh
        // menyempitkannya, jadi hanya toko yang benar-benar dilalui yang diuji.
        const laneBands = breachBands.filter((b) =>
            b.x >= left - 14 && b.x <= right + 14);
        const clearsLane = (pz, hz) => !laneBands.some((b) =>
            pz - hz < b.z1 + CFG.player.radius && pz + hz > b.z0 - CFG.player.radius);

        if (kind === 'souvenir') {
            // Rak dinding belakang penuh barang. Menempel pada tembok yang sudah
            // solid, jadi ia menebalkan siluet toko tanpa menyentuh rute apa pun.
            {
                const g = new THREE.Group();
                const wz = backZ + frontDir * 7;
                box(g, M.panel, width - 12, 21, 5, cx, 10.5, wz, false);
                const n = Math.max(3, Math.round((width - 22) / 11));
                for (let t = 0; t < 3; t++) {
                    const sy = 5.4 + t * 5.2;
                    box(g, M.wood, width - 14, .8, 6, cx, sy, wz + frontDir * 1.6, false);
                    for (let i = 0; i < n; i++) {
                        const h = ihash(seed + i * 13 + t * 71);
                        box(g, goods[(i + t * 2) % goods.length],
                            5.4, 2.4 + h * 2.2, 4.6,
                            cx - (width - 22) * .5 + (i + .5) * (width - 22) / n,
                            sy + 1.6 + h * 1.1, wz + frontDir * 1.6, false);
                    }
                    fixture('souvenirShelfTier');
                }
                weldOccluder(S9_INTERIOR_KEY, parent, g,
                    { x: cx, z: wz, hx: (width - 12) * .5, hz: 4.5, top: 21 });
                addChapterBlocker(interiorBlockers, cx, wz,
                    (width - 12) * .5, 4.5, 21, 0, 'souvenir-wall-shelf');
            }
            // Dua gondola dua-muka MEMBUJUR ke arah pintu. Jaraknya DITURUNKAN
            // dari lebar toko, bukan diketik: ketiga lorong (tengah dan dua tepi)
            // dibuat sama lebar, sehingga menyempitkan toko tidak pernah bisa
            // diam-diam mengurung rak paling luar.
            const gHalf = 5.1;
            const aisle = (width - 6 - 4 * gHalf) / 3;
            const gOff = aisle * .5 + gHalf;
            const gz = backZ + frontDir * 34;
            const sides = aisle >= CFG.player.radius * 2 + 2 ? [-1, 1] : [0];
            interiorLayoutRecords.shopAisles.push({
                kind, row, gondolas: sides.length,
                aisle: sides.length > 1 ? aisle : (width - 6 - 2 * gHalf) * .5,
            });
            for (const side of sides) {
                const px = cx + side * gOff;
                const g = new THREE.Group();
                box(g, M.frame, 9, 1.4, 36, px, .7, gz, false);
                box(g, M.panel, 4, 12, 34, px, 6.5, gz, false);
                for (const face of [-1, 1]) for (let t = 0; t < 3; t++) {
                    const sy = 3.2 + t * 3.8;
                    box(g, M.wood, 3.6, .6, 33, px + face * 3.2, sy, gz, false);
                    for (let k = 0; k < 6; k++) {
                        const h = ihash(seed + side * 211 + face * 53 + t * 17 + k);
                        box(g, goods[(k + t + (side + 1) + (face + 1)) % goods.length],
                            2.8, 1.9 + h * 1.5, 3.8,
                            px + face * 3.2, sy + 1.2 + h * .75,
                            gz - 15 + k * 6, false);
                    }
                }
                box(g, M.hazard, 5, .9, 30, px, 13.2, gz, false);
                weldOccluder(S9_INTERIOR_KEY, parent, g,
                    { x: px, z: gz, hx: gHalf, hz: 18, top: 13.6 });
                addChapterBlocker(interiorBlockers, px, gz, gHalf, 18, 13.6,
                    0, 'souvenir-gondola');
                fixture('souvenirGondola');
            }
            // Meja kasir dirapatkan ke sekat kiri: mesin register, layar dan
            // tiang antre. Tengah toko tetap kosong.
            {
                const px = inL + 9, pz = backZ + frontDir * 76;
                if (clearsLane(pz, 11)) {
                    box(statics, M.wood, 16, 6.4, 20, px, 3.2, pz);
                    box(statics, M.panel, 18, 1.1, 22, px, 6.9, pz, false);
                    box(statics, M.steel, 6, 3, 8, px + 1, 8.6, pz - frontDir * 5, false);
                    box(statics, M.tech, .4, 4.6, 7, px + 6.5, 9.6, pz + frontDir * 3, false);
                    box(statics, M.frame, 3, 7, 3, px - 4, 3.5, pz + frontDir * 9, false);
                    addChapterBlocker(interiorBlockers, px, pz, 9, 11, 8,
                        0, 'souvenir-checkout');
                    fixture('souvenirCheckout');
                }
            }
            // Rak putar kartu pos: dekor setinggi bahu tanpa collider, sekelas
            // bangku — di bawah ambang occlusion setengah badan.
            for (const side of [-1, 1]) {
                const px = cx + side * (width * .5 - 13);
                const pz = backZ + frontDir * 96;
                cylinder(statics, M.frame, .9, 13, px, 6.5, pz, 8);
                cylinder(statics, M.steel, 3.4, .7, px, 1, pz, 10);
                for (let f = 0; f < 4; f++) {
                    const a = f * Math.PI / 4;
                    const fin = box(statics, goods[(f + side + 1) % goods.length],
                        5.4, 8, .5,
                        px + Math.cos(a) * 2.7, 8, pz - Math.sin(a) * 2.7, false);
                    fin.rotation.y = a;
                }
                fixture('souvenirCarousel');
            }
        } else if (kind === 'restaurant') {
            // Lini servery menempel dinding belakang: bak penghangat, tudung,
            // dan tumpukan piring.
            {
                const g = new THREE.Group();
                const wz = backZ + frontDir * 9;
                box(g, M.panel, width - 14, 6.5, 12, cx, 3.2, wz, false);
                box(g, M.steel, width - 12, 1.1, 14, cx, 7.2, wz, false);
                const bays = Math.max(3, Math.round((width - 30) / 20));
                for (let i = 0; i < bays; i++) {
                    const px = cx - (width - 30) * .5 + (i + .5) * (width - 30) / bays;
                    box(g, M.frame, 15, 1.6, 9, px, 8.4, wz, false);
                    box(g, M.hazard, 13, .5, 7, px, 9.3, wz, false);
                    box(g, M.steel, 16, 1.2, 10, px, 14.6, wz, false);
                    for (const sx of [-7, 7])
                        box(g, M.frame, 1.2, 6, 1.2, px + sx, 11.6, wz - frontDir * 4, false);
                    fixture('restaurantWarmer');
                }
                for (const sx of [-(width - 30) * .5 - 3, (width - 30) * .5 + 3])
                    cylinder(g, M.white, 3.2, 3, cx + sx, 9.6, wz + frontDir * 3.4, 12);
                weldOccluder(S9_INTERIOR_KEY, parent, g,
                    { x: cx, z: wz, hx: (width - 12) * .5, hz: 7, top: 15.5 });
                addChapterBlocker(interiorBlockers, cx, wz,
                    (width - 12) * .5, 7, 15.5, 0, 'restaurant-servery');
                fixture('restaurantServery');
            }
            for (const ox of [-.26, .26]) for (const oz of [-.20, .20]) {
                const px = cx + ox * width, pz = cz + oz * depth;
                // Meja berkaki tunggal beserta peralatan makannya.
                cylinder(statics, M.steel, 1.6, 3.4, px, 1.7, pz, 8);
                cylinder(statics, M.steel, 5.5, .6, px, .3, pz, 10);
                box(statics, M.wood, 18, 1.8, 12, px, 4.3, pz);
                for (const sx of [-5, 5]) {
                    cylinder(statics, M.white, 2.4, .5, px + sx, 5.5, pz, 10);
                    cylinder(statics, M.glass, .9, 2.4, px + sx - 3.4, 6.4, pz + 3.6, 8);
                }
                box(statics, M.frame, 2.2, 3.4, 2.2, px, 6.9, pz - 3.8, false);
                // Empat kursi. Sengaja TIDAK menambah collider — sama seperti
                // bangku versi lama, jadi footprint meja tetap persis sama dan
                // koridor di antara meja tidak menyempit.
                for (const [dx, dz] of [[-11, 0], [11, 0], [0, -9], [0, 9]]) {
                    const seat = new THREE.Group();
                    seat.position.set(px + dx, 0, pz + dz);
                    seat.rotation.y = dx
                        ? (dx < 0 ? Math.PI * .5 : -Math.PI * .5)
                        : (dz < 0 ? 0 : Math.PI);
                    box(seat, M.panel, 7, 1.2, 7, 0, 3.4, 0);
                    box(seat, M.panel, 7, 6, 1.3, 0, 6.2, -3);
                    for (const [lx, lz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]])
                        box(seat, M.frame, .9, 3.4, .9, lx, 1.7, lz, false);
                    statics.add(seat);
                    fixture('restaurantChair');
                }
                addChapterBlocker(interiorBlockers, px, pz, 9, 6, 5,
                    0, 'restaurant-table');
                fixture('restaurantTable');
            }
            // Stasiun pengembalian nampan, rapat ke sekat kanan.
            {
                const px = inR - 6.5, pz = cz + frontDir * depth * .30;
                if (clearsLane(pz, 8)) {
                    box(statics, M.frame, 12, 9, 14, px, 4.5, pz);
                    box(statics, M.panel, 13, 1.2, 15, px, 9.6, pz, false);
                    box(statics, M.rubber, 8, 3, 9, px, 11.7, pz, false);
                    addChapterBlocker(interiorBlockers, px, pz, 6.5, 7.5, 12,
                        0, 'restaurant-tray-return');
                    fixture('restaurantTrayReturn');
                }
            }
        } else if (kind === 'cafe') {
            const counterZ = backZ + frontDir * 22;
            const cw = width - 16;
            // Bar belakang menempel dinding: rak cangkir/botol dan satu layar
            // menu. Layar adalah status/kontrol, bukan papan nama lokasi.
            {
                const g = new THREE.Group();
                const wz = backZ + frontDir * 7;
                box(g, M.wood, width - 16, 9, 6, cx, 4.5, wz, false);
                box(g, M.steel, width - 14, 1, 8, cx, 9.5, wz, false);
                const n = Math.max(4, Math.round((width - 24) / 8));
                for (let t = 0; t < 2; t++) {
                    const sy = 13 + t * 5;
                    box(g, M.frame, width - 18, .7, 5.5, cx, sy, wz, false);
                    for (let i = 0; i < n; i++) {
                        const h = ihash(seed + i * 29 + t * 131);
                        cylinder(g, h > .55 ? M.white : M.wood, 1.5, 2.4 + h * 1.8,
                            cx - (width - 24) * .5 + (i + .5) * (width - 24) / n,
                            sy + 1.6 + h * .9, wz, 8);
                    }
                    fixture('cafeBackShelf');
                }
                box(g, M.tech, width * .3, 5, .4, cx, 20.5, wz - frontDir * 3.4, false);
                weldOccluder(S9_INTERIOR_KEY, parent, g,
                    { x: cx, z: wz, hx: (width - 14) * .5, hz: 4, top: 21 });
                addChapterBlocker(interiorBlockers, cx, wz,
                    (width - 14) * .5, 4, 21, 0, 'cafe-back-bar');
                fixture('cafeBackBar');
            }
            // Konter layan: plint, meja atas menggantung, dan rel kaki.
            box(statics, M.panel, cw, 8, 11, cx, 4, counterZ);
            box(statics, M.wood, cw + 3, 1.4, 13, cx, 8.7, counterZ);
            box(statics, M.steel, cw, .8, 1.2, cx, 1.4, counterZ + frontDir * 5.6, false);
            {   // Etalase kue berkaca dua tingkat.
                const dx = cx - cw * .28;
                box(statics, M.frame, cw * .3, 1, 11, dx, 9.7, counterZ, false);
                box(statics, M.glass, cw * .3, 7, 10, dx, 13.2, counterZ, false);
                for (let t = 0; t < 2; t++)
                    box(statics, M.wood, cw * .26, .5, 8, dx, 11 + t * 3, counterZ, false);
                fixture('cafeDisplayCase');
            }
            {   // Mesin espresso, penggiling, dan kasir.
                const mx = cx + cw * .3;
                box(statics, M.steel, 13, 8, 8, mx, 13.4, counterZ, false);
                box(statics, M.frame, 14, 1.2, 9, mx, 17.8, counterZ, false);
                for (const sx of [-3.5, 3.5])
                    cylinder(statics, M.frame, .7, 3.4, mx + sx, 11.2,
                        counterZ - frontDir * 3.6, 8);
                cylinder(statics, M.steel, 2.6, 7, mx + 9, 12.9, counterZ, 10);
                box(statics, M.tech, 4.5, 3, .4, mx - 11, 12.4,
                    counterZ - frontDir * 4.2, false);
                fixture('cafeMachine');
            }
            addChapterBlocker(interiorBlockers, cx, counterZ,
                (cw + 3) * .5, 6.5, 9.5, 0, 'cafe-counter');
            fixture('cafeCounter');
            // Bangku bar: tiang, dudukan, dan pijakan kaki.
            for (let i = -2; i <= 2; i++) {
                const px = cx + i * (width - 24) / 5, pz = counterZ + frontDir * 15;
                cylinder(statics, M.steel, .9, 6, px, 3, pz, 8);
                cylinder(statics, M.panel, 2.6, 1.1, px, 6.5, pz, 10);
                cylinder(statics, M.frame, 2, .4, px, 1.8, pz, 10);
                fixture('cafeStool');
            }
            // Dua meja bundar berkursi di sisi toko, lorong tengah tetap kosong.
            for (const side of [-1, 1]) {
                const px = cx + side * width * .26;
                const pz = backZ + frontDir * (depth - 42);
                if (!clearsLane(pz, 9)) continue;
                cylinder(statics, M.steel, 1.4, 4, px, 2, pz, 8);
                cylinder(statics, M.steel, 4.6, .5, px, .25, pz, 10);
                cylinder(statics, M.wood, 8, 1.4, px, 4.7, pz, 12);
                cylinder(statics, M.white, 2, .4, px - 2.6, 5.6, pz + 1.4, 10);
                for (const dz of [-11, 11]) {
                    const seat = new THREE.Group();
                    seat.position.set(px, 0, pz + dz);
                    seat.rotation.y = dz < 0 ? 0 : Math.PI;
                    box(seat, M.panel, 7, 1.2, 7, 0, 3.4, 0);
                    box(seat, M.panel, 7, 5.5, 1.3, 0, 6, -3);
                    for (const [lx, lz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]])
                        box(seat, M.frame, .9, 3.4, .9, lx, 1.7, lz, false);
                    statics.add(seat);
                }
                addChapterBlocker(interiorBlockers, px, pz, 8, 8, 6.1,
                    0, 'cafe-table');
                fixture('cafeTable');
            }
        } else {
            buildRestroom(cx, cz, width, depth, frontDir, left, right, backZ);
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
    // Pulau konter berhenti di x+295: lorong sirkulasi selebar 18 unit tetap
    // terbuka antara ujung pulau dan barisan kolom terminal (x+315). Versi lama
    // (212 unit, berujung di x+311) menyisakan 2 unit — ujung utara aula, tempat
    // penanda checkpoint sekarang berdiri, praktis tak bisa dicapai.
    const islandC = x + 197, islandHalf = 98;
    // Konter menghadap -z (arah antre), jadi sisi penumpang ada di z-, sisi
    // petugas di z+. Setiap posisi lengkap: badan konter, meja atas menggantung,
    // layar penumpang, monitor petugas, rak papan ketik, dan printer label.
    for (const z of [455, 350]) {
        box(statics, M.frame, islandHalf * 2, 1.1, 22, islandC, .7, z);
        box(statics, M.panel, islandHalf * 2, 1.3, 24, islandC, 5.9, z);
        for (const sx of [-1, 1])
            box(statics, M.frame, 4, 7, 24, islandC + sx * (islandHalf - 2),
                3.2, z, false);
        for (let i = -4; i <= 4; i++) {
            const px = islandC + i * 22;
            box(statics, M.panel, 19, 5, 16, px, 2.6, z);
            box(statics, M.steel, 20, .9, 1.4, px, 1, z - 8.4, false);
            box(statics, M.tech, 9, 2.2, .3, px, 5.1, z - 8.1, false);
            // Sisi petugas: monitor bertiang, rak papan ketik, printer label.
            cylinder(statics, M.frame, .8, 4, px - 3, 8.5, z + 5, 8);
            const mon = box(statics, M.tech, 9, 6, .5, px - 3, 13, z + 5, false);
            mon.rotation.x = .16;
            box(statics, M.frame, 10, .5, 5, px - 3, 6.9, z + 3, false);
            box(statics, M.steel, 5, 4, 6, px + 6, 8.6, z + 4, false);
            box(statics, M.hazard, 4, .4, 3, px + 6, 10.8, z + 4, false);
            fixture('checkinAgentStation');
        }
        addChapterBlocker(interiorBlockers, islandC, z, islandHalf, 12,
            7.2, 0, 'checkin-island');
        interiorLayoutRecords.checkinCounters++;
        // Ban berjalan penurunan bagasi membentang di depan pulau: bak, rol,
        // pelat timbang, pagar sisi, dan koper yang benar-benar duduk di atasnya.
        const beltZ = z - 20;
        box(statics, M.frame, islandHalf * 2, 3.4, 13, islandC, 1.7, beltZ);
        box(statics, M.rubber, islandHalf * 2 - 4, .7, 10, islandC, 3.7, beltZ, false);
        for (const dz of [-6.2, 6.2])
            box(statics, M.steel, islandHalf * 2, 1.2, 1.2, islandC, 4.4,
                beltZ + dz, false);
        for (let i = -4; i <= 4; i++) {
            const px = islandC + i * 22;
            for (let r = 0; r < 5; r++)
                cylinder(statics, M.steel, .8, 9.6, px - 8.8 + r * 4.4, 4.2,
                    beltZ, 8, 'z');
            box(statics, M.hazard, 13, .3, 9, px, 4.15, beltZ, false);
            const h = ihash(Math.round(px) + Math.round(z) * 7);
            if (h > .42) {
                const bag = box(statics, h > .72 ? M.wood : M.panel,
                    9 + h * 3, 6 + h * 3, 6.4, px, 7.6 + h * 1.5, beltZ);
                bag.rotation.y = (h - .5) * .5;
                box(statics, M.steel, 3, .8, 1.2, px, 11 + h * 3, beltZ, false);
                fixture('checkinBag');
            }
            fixture('checkinBagDrop');
        }
        addChapterBlocker(interiorBlockers, islandC, beltZ, islandHalf, 7,
            5, 0, 'checkin-bag-drop');
        // Tiang dan tali antre.
        for (let i = -4; i <= 4; i++) for (const dz of [-35, -65]) {
            const px = islandC + i * 22;
            cylinder(statics, M.frame, .7, 3, px, 1.5, z + dz, 8);
            cylinder(statics, M.steel, 1.9, .5, px, .25, z + dz, 10);
            if (i < 4) box(statics, M.frame, 21, .35, .35,
                px + 11, 2.7, z + dz, false);
        }
    }

    // Empat kiosk mandiri di tengah aula kanan.
    for (let i = 0; i < 4; i++) {
        const px = x + 135 + i * 48, pz = -35;
        // Menghadap -z. Alas, tiang badan, kepala miring berbezel, lalu slot
        // pemindai paspor, pencetak boarding pass, corong label bagasi dan
        // pembaca kartu — kiosk yang benar-benar bisa dipakai, bukan kotak.
        box(statics, M.frame, 13, 1.4, 11, px, .7, pz);
        box(statics, M.panel, 10, 8, 8, px, 5.2, pz);
        box(statics, M.frame, 11.5, 1, 9, px, 9.6, pz, false);
        const head = box(statics, M.panel, 11, 8.4, 3.4, px, 13.6, pz - 1.4, false);
        head.rotation.x = -.22;
        const screen = box(statics, M.tech, 8.4, 6.4, .4, px, 13.7, pz - 3, false);
        screen.rotation.x = -.22;
        box(statics, M.tech, 5, .5, 2.6, px - 2.4, 10, pz - 3.4, false);
        box(statics, M.steel, 4.6, .9, 3, px + 2.6, 9.9, pz - 3.2, false);
        box(statics, M.frame, 3.4, 3.6, 2.6, px + 4.4, 6.6, pz - 4.2, false);
        box(statics, M.hazard, 2.6, .35, 1.8, px - 4.2, 9.9, pz - 3.6, false);
        for (const sx of [-1, 1])
            box(statics, M.frame, .8, 11, 7, px + sx * 5.6, 5.5, pz + .5, false);
        addChapterBlocker(interiorBlockers, px, pz, 6.5, 5.5, 16,
            0, 'self-check-kiosk');
        interiorLayoutRecords.selfCheckKiosks++;
        fixture('kioskScanner');
        fixture('kioskPrinter');
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
        // GAWANG DETEKTOR: dua pilar penuh tinggi, ambang atas, dan pita lampu
        // di dalamnya. Celah lolos di antara pilar tetap 20 unit seperti dahulu.
        for (const dz of [-12, 12]) {
            const g = new THREE.Group();
            box(g, M.panel, 4.4, 22, 5, gateX, 11, laneZ + dz, false);
            box(g, M.frame, 6, 1.4, 7, gateX, .7, laneZ + dz, false);
            box(g, M.frame, 5.4, 1.2, 6, gateX, 21.8, laneZ + dz, false);
            box(g, M.tech, .4, 16, 2.6, gateX - 2.3,
                11, laneZ + dz - Math.sign(dz) * .6, false);
            weldOccluder(S9_INTERIOR_KEY, parent, g,
                { x: gateX, z: laneZ + dz, hx: 3, hz: 3.5, top: 22 });
            addChapterBlocker(interiorBlockers, gateX, laneZ + dz,
                2.2, 2.5, 22, 0, 'security-scanner-post');
            fixture('securityArchPillar');
        }
        box(statics, M.frame, 5, 2.4, 28, gateX, 22.6, laneZ, false);
        box(statics, M.hazard, 4, 1.2, 26, gateX, 21, laneZ, false);
        box(statics, M.hazard, 5.4, .12, 24, gateX, .08, laneZ, false);
        fixture('securityArch');

        // MESIN X-RAY menggantikan meja nampan polos, TEPAT pada footprint lama
        // (hx 18, hz 5) supaya lebar lolos di bukaan dinding samping tak berubah:
        // rol masuk, terowongan berkelir timbal, rol keluar.
        {
            const mx = x + 68, mz = laneZ + 21;
            const g = new THREE.Group();
            box(g, M.frame, 36, 4.6, 10, mx, 2.3, mz, false);
            for (let r = 0; r < 12; r++)
                cylinder(g, M.steel, .9, 9.4, mx - 16.5 + r * 3, 5.1, mz, 8, 'z');
            box(g, M.panel, 17, 13, 10, mx, 10.5, mz, false);
            box(g, M.frame, 18, 1.4, 11, mx, 17.4, mz, false);
            box(g, M.tech, 15, .4, 8, mx, 4.9, mz, false);
            for (const sx of [-8.6, 8.6])
                box(g, M.rubber, .8, 8.4, 8.4, mx + sx, 8.4, mz, false);
            box(g, M.hazard, 17, .9, 10.2, mx, 16.4, mz, false);
            weldOccluder(S9_INTERIOR_KEY, parent, g,
                { x: mx, z: mz, hx: 18, hz: 5, top: 18 });
            addChapterBlocker(interiorBlockers, mx, mz,
                18, 5, 14, 0, 'security-xray');
            fixture('securityXray');
            // Tumpukan nampan di ujung masuk: dekor kecil tanpa collider.
            for (let t = 0; t < 4; t++)
                box(statics, M.panel, 11, 1.1, 8, mx + 12, 5.6 + t * 1.2, mz, false);
            fixture('securityTrayStack');
        }
        // MEJA OPERATOR di belakang mesin, merapat dinding lajur.
        {
            const ox = x + 68, oz = laneZ + 21 + (laneZ > 0 ? 15 : -15);
            box(statics, M.panel, 20, 7.5, 9, ox, 3.7, oz);
            box(statics, M.frame, 21, 1, 10, ox, 7.9, oz, false);
            const scr = box(statics, M.tech, 15, 6.4, .5, ox, 11.8,
                oz + (laneZ > 0 ? 1.6 : -1.6), false);
            scr.rotation.x = laneZ > 0 ? -.2 : .2;
            box(statics, M.frame, 9, .5, 4, ox, 8.8,
                oz - (laneZ > 0 ? 2.6 : -2.6), false);
            addChapterBlocker(interiorBlockers, ox, oz, 10.5, 5, 9,
                0, 'security-console');
            fixture('securityConsole');
        }
        // Podium petugas di sisi keluar gawang, di luar celah jalan.
        {
            const px = gateX - 16, pz = laneZ + 20;
            box(statics, M.panel, 7, 9, 7, px, 4.5, pz);
            box(statics, M.frame, 8, 1, 8, px, 9.5, pz, false);
            box(statics, M.tech, 5, .4, 4, px, 10.1, pz, false);
            addChapterBlocker(interiorBlockers, px, pz, 4, 4, 10,
                0, 'security-podium');
            fixture('securityPodium');
        }
        // Tiang antre menuju gawang: dekor, tanpa collider.
        for (let i = 0; i < 3; i++) for (const dz of [-11, 11]) {
            const px = gateX + 20 + i * 15;
            cylinder(statics, M.frame, .7, 3.2, px, 1.6, laneZ + dz, 8);
            cylinder(statics, M.steel, 1.9, .5, px, .25, laneZ + dz, 10);
            if (i < 2) box(statics, M.frame, 15, .35, .35,
                px + 7.5, 2.9, laneZ + dz, false);
        }
        interiorLayoutRecords.securityLanes++;
    }

    // Ruang tunggu keberangkatan besar di kiri. Bank kursi berulang mengikuti
    // kisi denah, tetapi menyisakan lorong keliling dan jalur lebar ke pintu
    // apron di barat-bawah.
    recordZone('departure-concourse', x - 185, -5, 130, 350);
    for (const dx of S9_SEAT_XS) for (const z of S9_SEAT_ZS) {
        if (seatSkipped(dx, z)) continue;
        const px = x + dx;
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
    box(statics, M.frame, 90, 1, 30, x + 28, .5, -255);
    box(statics, M.panel, 100, 8, 18, x + 28, 4, -255);
    box(statics, M.wood, 104, 1.5, 21, x + 28, 8.8, -255);
    box(statics, M.steel, 100, .8, 1.2, x + 28, 1.4, -246, false);
    {   // Etalase kue, mesin espresso, penggiling, dan kasir di atas konter.
        box(statics, M.frame, 26, 1, 15, x - 4, 9.8, -255, false);
        box(statics, M.glass, 26, 7, 14, x - 4, 13.2, -255, false);
        for (let t = 0; t < 2; t++)
            box(statics, M.wood, 23, .5, 11, x - 4, 11 + t * 3, -255, false);
        fixture('centralCafeDisplayCase');
        box(statics, M.steel, 14, 8, 9, x + 46, 13.5, -255, false);
        box(statics, M.frame, 15, 1.2, 10, x + 46, 17.9, -255, false);
        for (const sx of [-3.8, 3.8])
            cylinder(statics, M.frame, .7, 3.4, x + 46 + sx, 11.3, -259, 8);
        cylinder(statics, M.steel, 2.6, 7, x + 57, 13, -255, 10);
        box(statics, M.tech, 5, 3.2, .4, x + 30, 12.5, -246.5, false);
        fixture('centralCafeMachine');
    }
    // Gantri rak cangkir di belakang konter: dekor tinggi, tanpa collider baru.
    for (const sx of [-40, 40])
        cylinder(statics, M.frame, 1.1, 22, x + 28 + sx, 11, -264, 8);
    box(statics, M.frame, 84, 1.2, 4, x + 28, 21.4, -264, false);
    for (let i = 0; i < 9; i++) {
        const h = ihash(i * 61 + 17);
        cylinder(statics, h > .5 ? M.white : M.wood, 1.5, 2.4 + h * 1.6,
            x - 12 + i * 10, 13.4, -264, 8);
    }
    box(statics, M.tech, 30, 5, .4, x + 28, 17.6, -264.4, false);
    // Bangku bar bertiang.
    for (let i = -3; i <= 3; i++) {
        const px = x - 8 + i * 12;
        cylinder(statics, M.steel, .9, 6, px, 3, -235, 8);
        cylinder(statics, M.panel, 2.6, 1.1, px, 6.5, -235, 10);
        cylinder(statics, M.frame, 2, .4, px, 1.8, -235, 10);
        fixture('centralCafeStool');
    }
    addChapterBlocker(interiorBlockers, x + 28, -255, 52, 10.5,
        10.3, 0, 'central-cafe-counter');
    fixture('centralCafeCounter');

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
    // Dek tengah di dalam lingkar belt: bidang miring rendah dengan pita bahaya,
    // supaya lubangnya terbaca sebagai bagian mesin dan bukan lantai kosong.
    box(statics, M.panel, 104, 3, 62, baggageX, 1.5, baggageZ, false);
    box(statics, M.frame, 96, .6, 54, baggageX, 3.2, baggageZ, false);
    for (const sz of [-1, 1])
        box(statics, M.hazard, 92, .25, 3, baggageX, 3.6,
            baggageZ + sz * 22, false);
    // Rok/badan belt: satu balok per collider, jadi yang DIGAMBAR persis sama
    // dengan yang memblokir.
    for (const [bx, bz, hx, hz] of [
        [baggageX, baggageZ - 48, 64, 9], [baggageX, baggageZ + 48, 64, 9],
        [baggageX - 64, baggageZ, 9, 39], [baggageX + 64, baggageZ, 9, 39],
    ]) {
        box(statics, M.panel, hx * 2, 4.4, hz * 2, bx, 2.2, bz, false);
        box(statics, M.frame, hx * 2 + 2, .8, hz * 2 + 2, bx, 4.7, bz, false);
        addChapterBlocker(interiorBlockers, bx, bz, hx, hz, 5, 0, 'baggage-belt');
        fixture('baggageSkirt');
    }
    // Corong pemasukan koper di ujung barat: tudung miring, pipi samping, dan
    // tirai karet. Footprintnya berada DI DALAM collider belt barat, jadi tidak
    // menambah satu unit pun area terlarang.
    {
        const hx2 = baggageX - 64;
        box(statics, M.panel, 16, 15, 40, hx2, 11, baggageZ, false);
        const hood = box(statics, M.frame, 17, 1.6, 22, hx2 + 3, 17.6,
            baggageZ, false);
        hood.rotation.z = .28;
        for (const sz of [-1, 1])
            box(statics, M.frame, 15, 12, 1.6, hx2, 11,
                baggageZ + sz * 19.2, false);
        for (let f = 0; f < 5; f++)
            box(statics, M.rubber, 1, 8, 6.4, hx2 + 7.6, 8.5,
                baggageZ - 16 + f * 8, false);
        box(statics, M.hazard, 16.4, .9, 40, hx2, 18.4, baggageZ, false);
        addChapterBlocker(interiorBlockers, hx2, baggageZ, 8, 20, 19,
            0, 'baggage-chute');
        fixture('baggageChute');
    }
    // Koper yang benar-benar duduk di atas pita, ditempatkan deterministik.
    for (let i = 0; i < 9; i++) {
        const h = ihash(i * 97 + 13);
        const a = (i / 9) * Math.PI * 2 + h * .3;
        const bx = baggageX + Math.cos(a) * 63.8;
        const bz = baggageZ + Math.sin(a) * 44;
        const bag = box(statics, h > .66 ? M.wood : (h > .33 ? M.panel : M.steel),
            10 + h * 5, 6.5 + h * 4, 7, bx, 7.8 + h * 2, bz);
        bag.rotation.y = a;
        box(statics, M.steel, 3.4, .8, 1.2, bx, 11.4 + h * 4, bz, false);
        fixture('baggageBag');
    }
    // Tiang layar status di sisi timur belt dan setumpuk koper tak diambil.
    {
        const px = baggageX + 88, pz = baggageZ + 30;
        cylinder(statics, M.frame, 2.4, 20, px, 10, pz, 8);
        for (const sx of [-1, 1])
            box(statics, M.tech, .4, 8, 9, px + sx * 2.6, 15, pz, false);
        box(statics, M.frame, 7, 1.2, 12, px, 19.6, pz, false);
        addChapterBlocker(interiorBlockers, px, pz, 3, 3, 20,
            0, 'baggage-display');
        fixture('baggageDisplay');
    }
    for (let i = 0; i < 4; i++) {
        const h = ihash(i * 211 + 7);
        const bag = box(statics, h > .5 ? M.wood : M.panel, 11, 7, 8,
            baggageX - 20 + i * 13, 3.5 + (i % 2) * 7,
            baggageZ + 74 + (h - .5) * 5);
        bag.rotation.y = h * .6;
        fixture('baggageStrayBag');
    }
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

    // '@' pada denah: tumpukan perabot/koper setinggi BARRICADE_TOP yang menutup
    // muka kafe/toilet, memanjang ke tembok security, menyumbat pintu timurnya,
    // dan memisahkan concourse dari aula check-in di paruh bawah.
    // Blocker dibuat per SEL (kontrak token '*' bersama), lalu sel di UJUNG run
    // DIRAPATKAN ke muka dinding terdekat: kuantisasi grid 20 unit bisa menyisakan
    // celah selebar pemain yang tidak terlihat di denah.
    const wallFaces = interiorBlockers.filter((b) => b.top >= 20);
    const sealEnd = (blocker, axis, dir, crossHalf) => {
        const half = axis === 'z' ? blocker.hz : blocker.hx;
        const centre = axis === 'z' ? blocker.z : blocker.x;
        const crossC = axis === 'z' ? blocker.x : blocker.z;
        const face = centre + dir * half;
        let best = 0;
        for (const w of wallFaces) {
            const wHalf = axis === 'z' ? w.hz : w.hx;
            const wCentre = axis === 'z' ? w.z : w.x;
            const wCross = axis === 'z' ? w.x : w.z;
            const wCrossHalf = axis === 'z' ? w.hx : w.hz;
            if (Math.abs(wCross - crossC) >= wCrossHalf + crossHalf) continue;
            const near = wCentre - dir * wHalf;         // muka dinding yang menghadap run
            const gap = (near - face) * dir;
            if (gap > 0 && gap <= S9_INTERIOR_CELL && gap > best) best = gap;
        }
        if (!best) return 0;
        if (axis === 'z') { blocker.z += dir * best * .5; blocker.hz += best * .5; }
        else { blocker.x += dir * best * .5; blocker.hx += best * .5; }
        blocker.rad = Math.hypot(blocker.hx, blocker.hz);
        return best;
    };
    for (const run of S9_INTERIOR_OBSTACLE_RUNS) {
        const cells = [];
        for (let c = run.c0; c <= run.c1; c++)
            for (let r = run.r0; r <= run.r1; r++) cells.push([c, r]);
        const made = cells.map(([c, r]) => {
            const p = s9InteriorCellPos(c, r);
            const proto = barricadeBlocker(p.x, p.z, S9_INTERIOR_CELL);
            const blocker = addChapterBlocker(interiorBlockers, proto.x, proto.z,
                proto.hx, proto.hz, proto.top, 0, 'terminal-obstacle');
            const pile = buildFurniturePile(null, p.x, p.z, c * 97 + r, (group) =>
                weldOccluder(S9_INTERIOR_KEY, parent, group, {
                    x: p.x, z: p.z, hx: S9_INTERIOR_CELL * .5,
                    hz: S9_INTERIOR_CELL * .5, top: BARRICADE_TOP,
                }));
            interiorObstacleRecords.push({ c, r, x: p.x, z: p.z, recipe: pile.recipe });
            return blocker;
        });
        const axis = run.r0 === run.r1 ? 'x' : 'z';
        const crossHalf = S9_INTERIOR_CELL * .5;
        sealEnd(made[0], axis, axis === 'z' ? 1 : -1, crossHalf);
        sealEnd(made[made.length - 1], axis, axis === 'z' ? -1 : 1, crossHalf);
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
    interiorReachSet = null;
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
    // Apron dan service yard berbagi satu bidang lantai. Kontraksikan tepi LUAR
    // union, bukan tepi internal x=300050, agar tidak tercipta seam collision.
    const apronServiceCore = x >= 299112 + radius && x <= 300850 - radius
        && z >= 55 + radius && z <= 305 - radius;
    const taxiway = x >= 299120 + radius && x <= 300880 - radius
        && z >= -20 + radius && z <= 70 - radius;
    const runway = x >= 299150 + radius && x <= 300870 - radius
        && z >= -275 + radius && z <= -165 - radius;
    const connector = [299860, 300250, 300700].some((cx) =>
        x >= cx - 43 + radius && x <= cx + 43 - radius
        && z >= -180 + radius && z <= 10 - radius);
    return apron || serviceYard || apronServiceCore || taxiway || runway || connector;
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

// Petak yang BENAR-BENAR bisa didatangi player di Chapter 2. Sebuah titik bebas
// collider belum tentu bisa dicapai: lubang tengah belt baggage dikepung empat
// collider, jadi peti di sana hanya terlihat dan tak pernah bisa diambil.
// Flood fill sekali dari titik masuk chapter, lalu di-memo (dunia statis).
let interiorReachSet = null;
const INTERIOR_REACH_STEP = 10;
function interiorReachable(x, z) {
    if (!interiorReachSet) {
        const radius = CFG.player.radius;
        const free = (cx, cz) => {
            const px = S9_BUILDING_START.x + cx * INTERIOR_REACH_STEP;
            const pz = S9_BUILDING_START.z + cz * INTERIOR_REACH_STEP;
            return stage9InteriorWalkable(px, pz, radius)
                && !interiorBlockers.some((b) => pointInBlocker(px, pz, radius, b));
        };
        interiorReachSet = new Set(['0,0']);
        const queue = [[0, 0]];
        while (queue.length) {
            const [cx, cz] = queue.pop();
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, nz = cz + dz, key = `${nx},${nz}`;
                if (interiorReachSet.has(key)) continue;
                if (Math.abs(nx) > 120 || Math.abs(nz) > 160) continue;
                if (!free(nx, nz)) continue;
                interiorReachSet.add(key);
                queue.push([nx, nz]);
            }
        }
    }
    const cx = Math.round((x - S9_BUILDING_START.x) / INTERIOR_REACH_STEP);
    const cz = Math.round((z - S9_BUILDING_START.z) / INTERIOR_REACH_STEP);
    return interiorReachSet.has(`${cx},${cz}`);
}

export function stage9SupplyPlacements() {
    const parkingCrates = [];
    const counts = CFG.campaign.stage9.parkingLootBoxes;
    const placeParking = (parking, amount, rows) => {
        const lot = S9_FRONT_PARKING_LOTS[parking];
        const picked = [];
        const xs = [];
        for (let x = lot.x0 + 25; x <= lot.x1 - 25; x += 30) xs.push(x);
        for (let pass = 0; pass < rows.length && picked.length < amount; pass++) {
            for (let i = 0; i < xs.length && picked.length < amount; i++) {
                const x = xs[i], z = rows[(i + pass) % rows.length];
                if (!stage9FrontWalkable(x, z, 8)
                    || frontBlockers.some((b) => pointInBlocker(x, z, 8, b))
                    || picked.some((p) => Math.hypot(p.x - x, p.z - z) < 18)) continue;
                picked.push({ x, z, parking });
            }
        }
        parkingCrates.push(...picked);
    };
    placeParking('left', Math.max(0, counts.left | 0), [-285, -225, -210, -135]);
    placeParking('right', Math.max(0, counts.right | 0), [345, 415, 430, 475]);

    // Loot box Chapter 2 (denah CSV 2026-08-26): 15 di hall baggage 'Z' dan 5 di
    // tiap jenis petak fasilitas 'V'/'R'/'C'/'W'. Sebuah jenis punya DUA ruang
    // (deret utara + selatan); jatahnya dibagi bergiliran supaya keduanya terisi.
    const interiorCrates = [];
    const interiorCounts = CFG.campaign.stage9.interiorLootBoxes || {};
    const placeInterior = (area, rects, amount, inset = 16) => {
        const picked = [];
        const pools = rects.map((rect) => {
            const spots = [];
            for (let z = rect.z - rect.hz + inset; z <= rect.z + rect.hz - inset; z += 22)
                for (let x = rect.x - rect.hx + inset; x <= rect.x + rect.hx - inset; x += 22)
                    if (stage9InteriorWalkable(x, z, 8) && !stage9BlockedAt(x, z, 8)
                        && interiorReachable(x, z))
                        spots.push({ x, z });
            return spots;
        });
        for (let pass = 0; picked.length < amount; pass++) {
            let progressed = false;
            for (const pool of pools) {
                if (picked.length >= amount) break;
                while (pool.length) {
                    const spot = pool.shift();
                    if (picked.some((p) => Math.hypot(p.x - spot.x, p.z - spot.z) < 20))
                        continue;
                    picked.push({ ...spot, area });
                    progressed = true;
                    break;
                }
            }
            if (!progressed) break;
        }
        interiorCrates.push(...picked);
    };
    const zonesOf = (kind) => interiorLayoutRecords.zones
        .filter((z) => z.kind === kind)
        .map((z) => ({ x: z.x, z: z.z, hx: z.hx, hz: z.hz }));
    const bag = S9_INTERIOR_BAGGAGE_LOOT;
    const bagLo = s9InteriorCellPos(bag.c0, bag.r1), bagHi = s9InteriorCellPos(bag.c1, bag.r0);
    const hall = {
        x0: bagLo.x - S9_INTERIOR_CELL * .5, x1: bagHi.x + S9_INTERIOR_CELL * .5,
        z0: bagLo.z - S9_INTERIOR_CELL * .5, z1: bagHi.z + S9_INTERIOR_CELL * .5,
    };
    // Empat pita MENGELILINGI belt, bukan satu kotak yang menelannya: giliran
    // antar-pita menyebarkan peti ke keempat sisi carousel, bukan menumpuk di
    // satu tepi. Lubang tengah torus tidak pernah jadi kandidat.
    const belt = interiorLayoutRecords.zones.find((z) => z.kind === 'baggage-reclaim');
    const rectOf = (x0, x1, z0, z1) => ({
        x: (x0 + x1) * .5, z: (z0 + z1) * .5,
        hx: (x1 - x0) * .5, hz: (z1 - z0) * .5,
    });
    placeInterior('baggage', belt ? [
        rectOf(hall.x0, hall.x1, belt.z + belt.hz, hall.z1),      // utara belt
        rectOf(hall.x0, hall.x1, hall.z0, belt.z - belt.hz),      // selatan belt
        rectOf(hall.x0, belt.x - belt.hx, belt.z - belt.hz, belt.z + belt.hz),
        rectOf(belt.x + belt.hx, hall.x1, belt.z - belt.hz, belt.z + belt.hz),
    ] : [rectOf(hall.x0, hall.x1, hall.z0, hall.z1)],
    Math.max(0, interiorCounts.baggage | 0), 10);
    for (const kind of ['souvenir', 'restaurant', 'cafe', 'toilet'])
        placeInterior(kind, zonesOf(kind), Math.max(0, interiorCounts[kind] | 0));

    return {
        crates: [...parkingCrates, ...interiorCrates],
        parkingCrates,
        interiorCrates,
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
        // 60 robot ruang tunggu (permintaan user 2026-08-27): titik lahirnya
        // adalah LORONG kisi kursi, jadi seluruh gelombang berdiri di antara
        // bank kursi alih-alih di tepi aula.
        interiorConcourse: S9_SEAT_AISLE_ZS.flatMap((z) =>
            S9_SEAT_AISLE_XS.map((dx) => [S9_INTERIOR_ORIGIN.x + dx, z])),
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
    const supplies = stage9SupplyPlacements();
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
                backdrop: {
                    meadows: semantic.frontBackdropMeadow || 0,
                    trees: semantic.frontBackdropTree || 0,
                },
                abandonedVehicles: semantic.frontAbandonedVehicle || 0,
                parkedCars: semantic.frontParkedCar || 0,
                stage7CarModels: {
                    sedans: semantic.frontStage7Sedan || 0,
                    suvs: semantic.frontStage7SUV || 0,
                },
                parkingFacingDivider,
                parkingRows: frontParkingRecords.map((p) => p.z)
                    .filter((z, i, all) => all.indexOf(z) === i).sort((a, b) => a - b),
                canopies: frontCanopyRecords.map((c) => ({ ...c })),
                vehicleOverlaps: frontVehicleOverlaps(),
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
                    toiletCubicles: interiorLayoutRecords.toiletCubicles,
                    toiletBasins: interiorLayoutRecords.toiletBasins,
                    toiletUrinals: interiorLayoutRecords.toiletUrinals,
                    toiletDoors: interiorLayoutRecords.toiletDoors.map(d => ({ ...d })),
                    fixtures: { ...interiorLayoutRecords.fixtures },
                    // Sensus collider per jenis: yang DIGAMBAR harus benar-benar
                    // memblokir, jadi setiap keluarga perabot wajib muncul di sini
                    // dengan jumlah yang sama dengan meshnya.
                    blockerKinds: interiorBlockers.reduce((a, b) => {
                        a[b.kind] = (a[b.kind] || 0) + 1; return a;
                    }, Object.create(null)),
                    shopAisles: interiorLayoutRecords.shopAisles.map(a => ({ ...a })),
                },
                grid: {
                    cell: S9_INTERIOR_CELL, ...S9_INTERIOR_GRID,
                    checkpointCell: (() => {
                        const c = Math.floor((S9_INTERIOR_CHECKPOINT.x
                            - S9_INTERIOR_ORIGIN.x - S9_INTERIOR_GRID.x0) / S9_INTERIOR_CELL);
                        const r = Math.floor((S9_INTERIOR_GRID.z1
                            - S9_INTERIOR_CHECKPOINT.z) / S9_INTERIOR_CELL);
                        return [c, r];
                    })(),
                },
                obstacles: {
                    cells: interiorObstacleRecords.map((o) => [o.c, o.r]),
                    recipes: [...new Set(interiorObstacleRecords.map((o) => o.recipe))].length,
                    placements: interiorObstacleRecords.map((o) => ({ x: o.x, z: o.z })),
                },
                breaches: interiorBreachRecords.map((b) => ({ ...b })),
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
        supplies: {
            crateCandidates: supplies.crates.length,
            parkingCrates: {
                left: supplies.parkingCrates.filter((p) => p.parking === 'left').length,
                right: supplies.parkingCrates.filter((p) => p.parking === 'right').length,
            },
            interiorCrates: Object.fromEntries(
                ['baggage', 'souvenir', 'restaurant', 'cafe', 'toilet'].map((area) =>
                    [area, supplies.interiorCrates.filter((p) => p.area === area).length])),
            barrelCandidates: barrelCandidates.length,
        },
    };
}
