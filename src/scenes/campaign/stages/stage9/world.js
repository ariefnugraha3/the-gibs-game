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
import { buildTurbofan } from '../../utility/turbofan.js';
import {
    buildArmedHeavyAircraft, resetTransport,
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
// Marker tetap di titik ramp setelah rig pesawat diperkecil 25%: ujung ramp
// sekarang sekitar 62 unit di belakang pusat dan marker berjarak 52 unit, jadi
// player masih menaiki pesawat dari belakang tanpa mengubah alur Chapter 3.
export const S9_BOARD = Object.freeze({ x: 300648, z: -220 });
// Menara digeser ke timur pier terminal supaya keduanya tak saling menembus;
// hanggar digeser ke barat supaya pompa bahan bakar tetap berdiri BEBAS di
// mulut tenggaranya setelah bentang hanggar dilebarkan.
const S9_CONTROL_TOWER = Object.freeze({ x: 300260, z: 452 });
const S9_CARGO_HANGAR = Object.freeze({ x: 300620, z: 250 });
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
    // Tinggi/panjang yang DIGAMBAR untuk struktur yang siluetnya jauh melewati
    // collider-nya (menara, hanggar, jet bridge, tiang lampu, pesawat). Dicatat
    // dari konstanta yang sama yang membangunnya, dalam METER, supaya smoke
    // menguji ukuran nyata alih-alih angka unit yang bisa berarti apa saja.
    drawnMeters: Object.create(null),
    // Jumlah batang marka perkerasan: "terlalu banyak ornamen garis" itu angka,
    // bukan selera.
    markings: 0,
    // Bukti "SEMUA pesawat bermesin JET" (permintaan user 2026-08-27). Sebuah
    // turbofan itu kipas TERKURUNG: radius kipas < radius cowl. Baling-baling
    // justru kebalikannya, jadi angka inilah yang membedakan keduanya.
    engines: null,
};

function drawnM(kind, meters) {
    runwayLayoutRecords.drawnMeters[kind] =
        Math.max(runwayLayoutRecords.drawnMeters[kind] || 0, +meters.toFixed(2));
}
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

// Kontrak "tak ada prop airside yang menembus prop lain" — versi Chapter 3 dari
// aturan mobil parkir Chapter 1. Dinding hanggar sengaja dikecualikan terhadap
// sesamanya (mereka satu bangunan) dan kolom jet bridge terhadap dirinya.
const S9_RUNWAY_OVERLAP_OK = new Set(['hangar-wall|hangar-wall']);

export function stage9RunwayOverlaps(tolerance = 0.5) {
    const bad = [];
    for (let i = 0; i < blockers.length; i++) {
        const a = blockers[i];
        for (let j = i + 1; j < blockers.length; j++) {
            const b = blockers[j];
            if (S9_RUNWAY_OVERLAP_OK.has([a.kind, b.kind].sort().join('|'))) continue;
            const depth = blockerOverlapDepth(a, b);
            if (depth > tolerance) bad.push({
                a: a.kind, b: b.kind, depth: +depth.toFixed(2),
                x: Math.round(a.x), z: Math.round(a.z),
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

// ============================================================================
// CHAPTER 3 — AIRSIDE KERTAJATI. SEMUA UKURAN DITURUNKAN DARI METER.
// ============================================================================
// Properti airside ditulis dalam METER lalu dikali CAMP_M, bukan angka unit
// tangan (permintaan user 2026-08-27: "ukurannya masih tidak sesuai dengan
// badan Major Gibran"). Patokannya badan pemain: eyeHeight 11,4 unit = 1,63 m.
// Bus apron versi lama setinggi 9 unit = 1,29 m — JUSTRU lebih pendek daripada
// Gibran — dan pesawat parkirnya hanya sepanjang 6,3 m, sehingga seluruh apron
// terbaca sebagai diorama mainan. Ubah angka METER-nya, jangan unitnya.
const am = (meters) => meters * CAMP_M;

// Lima stand apron. SATU-SATUNYA sumber posisi pesawat parkir, jet bridge, muka
// terminal dan garis lead-in, supaya jarak antar-stand tak pernah lebih sempit
// daripada bentang sayap yang benar-benar digambar.
const S9_STAND_XS = Object.freeze([299240, 299430, 299620, 299810, 300000]);
const S9_STAND_Z = 180;                 // sumbu badan pesawat parkir
const S9_AIRLINER_SPAN = am(25);        // jet regional 25 m
const S9_AIRLINER_SWEEP = .34;          // sapuan sayap — isyarat jet paling terbaca
const S9_AIRLINER_LEN = am(22);
// Jembatan penumpang berlabuh ke PINTU DEPAN SISI PORT, bukan ke hidung: sumbu
// terowongannya digeser am(3.6) ke +x (kiri pesawat yang menghadap +z) dan
// kabinnya berhenti sejajar pintu di z 224. Terowongan yang lurus di atas garis
// tengah stand akan menembus radome.
const S9_BRIDGE_OFFSET = am(3.6);
const S9_BRIDGE_CAB_Z = 224;            // kabin jembatan, sejajar pintu penumpang
const S9_BRIDGE_ROT_Z = 402;            // rotunda pada muka terminal
const S9_PIER_Z = 434;                  // muka pier terminal (dekor, luar walkable)

function buildAirsideTree(parent, M, x, z, seed = 0) {
    // Pohon pematang ~10 m. Satu bola di atas silinder terbaca placeholder pada
    // skala sebesar ini, jadi batangnya meruncing dan tajuknya berlapis tiga.
    const h = am(6.4 + (seed % 3) * .9), r = am(2.3 + (seed % 4) * .3);
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(am(.22), am(.46), h, 8), M.wood);
    trunk.position.set(x, h * .5, z);
    trunk.castShadow = true; trunk.receiveShadow = true;
    parent.add(trunk);
    for (const [bx, by, bz, br] of [
        [0, h + r * .3, 0, r],
        [r * .6, h * .85, r * .22, r * .64],
        [-r * .52, h * .9, -r * .3, r * .58],
    ]) {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(br, 8, 6), M.leaf);
        crown.position.set(x + bx, by, z + bz);
        crown.castShadow = true;
        parent.add(crown);
    }
    for (const s of [-1, 1]) {
        const limb = cylinder(parent, M.wood, am(.13), r * .95,
            x + s * r * .32, h * .8, z, 6);
        limb.rotation.z = s * .72;
    }
    count('windbreakTree');
}

function buildTower(parent, M) {
    const x = S9_CONTROL_TOWER.x, z = S9_CONTROL_TOWER.z;
    // Menara kontrol 39 m: blok operasi 6 m, batang 22 m, kabin 4,2 m dan dek
    // radar di atasnya. Versi lama hanya 11 m — kabinnya bahkan lebih pendek
    // daripada seorang manusia.
    const baseW = am(30), baseD = am(18), baseH = am(6);
    const shaftW = am(9), cabY = baseH + am(22), cabW = am(13), cabH = am(4.2);
    box(parent, M.concrete, baseW, baseH, baseD, x, baseH * .5, z);
    box(parent, M.roof, baseW + am(.8), am(.6), baseD + am(.8), x, baseH + am(.3), z);
    for (let i = -5; i <= 5; i++)
        box(parent, M.frame, am(.4), baseH, am(.4),
            x + i * baseW / 11, baseH * .5, z - baseD * .5 - am(.25), false);
    box(parent, M.glass, baseW - am(6), am(1.7), am(.35),
        x, baseH * .62, z - baseD * .5 - am(.45), false);
    box(parent, M.panel, am(2.6), am(2.6), am(.5),
        x - baseW * .32, am(1.3), z - baseD * .5 - am(.5));
    // Batang: inti beton, empat kolom sudut, celah tangga berkaca, cincin lantai.
    const shaftH = cabY - baseH, shaftMidY = (cabY + baseH) * .5;
    box(parent, M.concrete, shaftW, shaftH, shaftW, x, shaftMidY, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        box(parent, M.panel, am(.95), shaftH, am(.95),
            x + sx * shaftW * .5, shaftMidY, z + sz * shaftW * .5);
    for (const sz of [-1, 1])
        box(parent, M.glass, am(1.2), shaftH * .84, am(.3),
            x, shaftMidY, z + sz * (shaftW * .5 + am(.2)), false);
    for (let y = baseH + am(4); y < cabY - am(2); y += am(4))
        box(parent, M.frame, shaftW + am(.7), am(.28), shaftW + am(.7), x, y, z, false);
    // Kabin: lantai menggantung, kaca MIRING KELUAR (memantulkan langit, bukan
    // apron) dan gallery rail — kotak kaca tegak lurus itulah yang dulu terbaca
    // sebagai placeholder.
    box(parent, M.panel, cabW + am(1.6), am(.8), cabW + am(1.6), x, cabY, z);
    for (const s of [-1, 1]) {
        const pz = box(parent, M.glass, cabW, cabH, am(.3),
            x, cabY + cabH * .55, z + s * cabW * .52, false);
        pz.rotation.x = -s * .26;
        const px = box(parent, M.glass, am(.3), cabH, cabW,
            x + s * cabW * .52, cabY + cabH * .55, z, false);
        px.rotation.z = s * .26;
        box(parent, M.frame, cabW + am(3.2), am(.22), am(.22),
            x, cabY - am(1.1), z + s * (cabW * .5 + am(1.5)), false);
        box(parent, M.frame, am(.22), am(.22), cabW + am(3.2),
            x + s * (cabW * .5 + am(1.5)), cabY - am(1.1), z, false);
    }
    box(parent, M.roof, cabW + am(3), am(.9), cabW + am(3), x, cabY + cabH + am(.6), z);
    // Dek peralatan: radar, antena whip dan lampu obstruksi.
    const topY = cabY + cabH + am(1.1);
    box(parent, M.panel, am(4), am(1.2), am(4), x, topY + am(.6), z);
    cylinder(parent, M.frame, am(.26), am(5), x, topY + am(3.5), z, 8);
    const radar = box(parent, M.white, am(4.6), am(.5), am(1.1), x, topY + am(6), z);
    radar.rotation.y = .45;
    for (const s of [-1, 1])
        cylinder(parent, M.steel, am(.1), am(3.6),
            x + s * am(1.7), topY + am(2.6), z + s * am(1.5), 6);
    box(parent, M.hazard, am(.5), am(.5), am(.5), x, topY + am(6.7), z, false);
    drawnM('control-tower', (topY + am(6.9)) / CAMP_M);
    addBlocker(x, z, baseW * .5, baseD * .5, baseH, 0, 'control-tower');
    count('controlTower');
}

function buildHangar(parent, M) {
    const x = S9_CARGO_HANGAR.x, z = S9_CARGO_HANGAR.z;
    // Hanggar perawatan tiga bentang, 41 x 24 m dan setinggi 14 m — ekor
    // pesawat harus muat di dalamnya. Mulut menghadap SELATAN (taxiway),
    // dinding belakang di utara.
    const halfW = am(20.7), halfD = am(12.2), wallH = am(14), ridge = am(16.4);
    for (const s of [-1, 1]) {
        box(parent, M.panel, am(.7), wallH, halfD * 2, x + s * halfW, wallH * .5, z);
        for (let pz = -halfD + am(2); pz <= halfD - am(2); pz += am(3))
            box(parent, M.frame, am(.9), wallH, am(.35),
                x + s * (halfW + am(.45)), wallH * .5, z + pz, false);
    }
    box(parent, M.panel, halfW * 2, wallH, am(.7), x, wallH * .5, z + halfD);
    for (let px = -halfW + am(3); px <= halfW - am(3); px += am(3.4))
        box(parent, M.frame, am(.35), wallH, am(.9),
            x + px, wallH * .5, z + halfD + am(.45), false);
    for (const bay of [-1, 0, 1]) {
        const bx = x + bay * halfW * (2 / 3);
        const roof = box(parent, M.roof, halfW * .68, am(1.1), halfD * 2 + am(1.4),
            bx, ridge - am(.6), z);
        roof.rotation.z = -bay * .05;
        box(parent, M.steel, halfW * .58, am(.35), halfD * 2, bx, ridge + am(.15), z, false);
    }
    for (let pz = -halfD + am(1.5); pz <= halfD; pz += am(4)) {
        box(parent, M.frame, halfW * 2, am(.5), am(.5), x, wallH + am(.4), z + pz);
        for (const px of [-halfW * .66, 0, halfW * .66])
            box(parent, M.frame, am(.45), wallH * .32, am(.45),
                x + px, wallH * .84, z + pz, false);
    }
    // Daun pintu geser diparkir TERBUKA di kedua tepi mulut: dekor, tanpa
    // collider, supaya mulut hanggar tetap bisa dimasuki.
    box(parent, M.frame, halfW * 2, am(.7), am(1.2), x, wallH + am(.25), z - halfD + am(.5));
    for (const s of [-1, 1])
        box(parent, M.steel, halfW * .3, wallH - am(.7), am(.5),
            x + s * halfW * .84, wallH * .5, z - halfD + am(.5));
    box(parent, M.steel, halfW * 2 + am(1), am(.5), am(.6),
        x, ridge - am(1.3), z - halfD - am(.35), false);
    for (const s of [-1, 1])
        cylinder(parent, M.steel, am(.19), wallH,
            x + s * (halfW + am(.55)), wallH * .5, z - halfD + am(1.2), 6);
    box(parent, M.frame, am(1.3), am(2.4), am(.4),
        x - halfW + am(2.6), am(1.2), z - halfD - am(.25));
    // Rel derek di bay tengah — tanda hanggar ini benar-benar bengkel.
    box(parent, M.steel, halfW * 1.5, am(.55), am(.8), x, wallH - am(1.4), z - am(2));
    box(parent, M.hazard, am(3), am(.8), am(1.1), x + halfW * .2, wallH - am(2.1), z - am(2));
    for (let i = -6; i <= 6; i++)
        box(parent, M.hazard, am(2.4), .18, am(.35), x + i * am(3.2), .16, z - halfD - am(1.7), false);
    drawnM('maintenance-hangar', ridge / CAMP_M);
    drawnM('maintenance-hangar-span', halfW * 2 / CAMP_M);
    addBlocker(x - halfW, z, am(.6), halfD, wallH, 0, 'hangar-wall');
    addBlocker(x + halfW, z, am(.6), halfD, wallH, 0, 'hangar-wall');
    addBlocker(x, z + halfD, halfW, am(.6), wallH, 0, 'hangar-wall');
    count('maintenanceHangar');
}

function buildParkedAirliner(parent, M, x, z, variant = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = variant & 1 ? M.panel : M.white;
    // JET REGIONAL 2045 (permintaan user 2026-08-27: "mana ada pesawat pakai
    // baling-baling"). Dua isyarat jet yang paling terbaca dari kamera oblique
    // adalah SAYAP MENYAPU dan NACELLE BERCOWL, jadi keduanya yang dipakai.
    //
    // Nacelle duduk DI ATAS sayap, dan itu bukan gaya-gayaan: pesawat 22 m
    // dengan sayap tinggi 4,1 m tak punya ruang untuk menggantung fan
    // berdiameter 2,1 m di bawahnya tanpa menaruhnya setinggi kepala player —
    // sementara ruang di bawah sayap HARUS tetap kosong, karena collider
    // pesawat ini hanya badannya dan player memang berjalan di bawah sayap
    // untuk berpindah antar-stand. Bonusnya: dari atas, mesinnya justru terlihat.
    const R = am(1.45), LEN = S9_AIRLINER_LEN, SPAN = S9_AIRLINER_SPAN;
    const deck = am(2.9), wingY = am(4.1), finH = am(5);
    const sweep = S9_AIRLINER_SWEEP, tanS = Math.tan(sweep);
    const half = SPAN * .5, zRoot = am(.6);
    cylinder(g, body, R, LEN * .72, 0, deck, LEN * .02, 16, 'z');
    const nose = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 10), body);
    nose.position.set(0, deck, LEN * .38); nose.scale.z = 1.7;
    nose.castShadow = true; g.add(nose);
    const radome = new THREE.Mesh(new THREE.SphereGeometry(R * .55, 10, 8), M.frame);
    radome.position.set(0, deck - am(.1), LEN * .49); radome.scale.z = 1.3; g.add(radome);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(R, LEN * .4, 14), body);
    tail.position.set(0, deck + am(.95), -LEN * .52); tail.rotation.x = -Math.PI * .5;
    tail.castShadow = true; g.add(tail);
    // Sayap: dua panel per sisi pada SATU garis sapu yang menerus. Panjang tiap
    // panel dibagi cos(sweep) supaya rentang sayapnya tetap SPAN setelah diputar.
    box(g, body, am(4.8), am(1.3), am(3.8), 0, wingY - am(.55), zRoot);
    for (const s of [-1, 1]) {
        for (const [y0, y1, chord] of [
            [am(1.1), half * .58, am(2.7)],
            [half * .58, half - am(.5), am(1.7)],
        ]) {
            const ym = (y0 + y1) * .5, span = (y1 - y0) / Math.cos(sweep);
            const panel = box(g, body, span, am(.45), chord, s * ym, wingY, zRoot - tanS * ym);
            panel.rotation.y = s * sweep;
        }
        const tipY = half - am(.35);
        const wl = box(g, M.hazard, am(.4), am(1.7), am(1.2),
            s * tipY, wingY + am(.75), zRoot - tanS * tipY);
        wl.rotation.z = -s * .2; wl.rotation.y = s * sweep;
    }
    // Dua TURBOFAN bercowl lewat modul bersama: kipasnya terkurung di dalam
    // cowl, jadi pesawat ini tak bisa diam-diam kembali berbaling-baling.
    const nacelleMats = {
        cowl: body, lip: M.steel, duct: M.rubber,
        hub: M.frame, fan: M.steel, nozzle: M.frame,
    };
    const cowlR = am(1.05);
    let nacelle = null;
    for (const s of [-1, 1]) {
        const ey = s * am(4.4), ez = zRoot - tanS * am(4.4) + am(1);
        const nacY = wingY + am(1.3);
        box(g, body, am(1.6), am(1.7), am(3.2), ey, wingY + am(.6), ez);   // pilon
        nacelle = buildTurbofan(g, nacelleMats,
            { x: ey, y: nacY, z: ez, cowlRadius: cowlR, length: am(3.8), blades: 11 });
    }
    // Roda pendarat: nose gear + main gear ganda dalam sponson badan.
    cylinder(g, M.steel, am(.15), am(2.3), 0, am(1.15), LEN * .3, 8);
    for (const dz of [-am(.32), am(.32)])
        cylinder(g, M.rubber, am(.42), am(.28), 0, am(.42), LEN * .3 + dz, 10, 'z');
    for (const s of [-1, 1]) {
        box(g, body, am(1.6), am(1.5), am(4.4), s * am(1.6), am(1.6), -LEN * .05);
        cylinder(g, M.steel, am(.16), am(2), s * am(1.6), am(1), -LEN * .06, 8);
        for (const dz of [-am(.62), am(.62)])
            cylinder(g, M.rubber, am(.5), am(.32), s * am(1.6), am(.5), -LEN * .06 + dz, 10, 'z');
    }
    // Ekor T dengan sirip MENYAPU; bidang datarnya diletakkan di puncak sirip
    // yang dihitung, bukan diketik, supaya sapuan sirip bisa diubah bebas.
    const finSweep = .44, finZ = -LEN * .43;
    const fin = box(g, body, am(.6), finH, am(3.4), 0, deck + am(1.5) + finH * .5, finZ);
    fin.rotation.x = -finSweep;
    const finTopY = deck + am(1.5) + finH * .5 * (1 + Math.cos(finSweep));
    const finTopZ = finZ - finH * .5 * Math.sin(finSweep);
    box(g, variant % 3 ? M.hazard : M.tech, am(.66), finH * .42, am(1.6),
        0, finTopY - finH * .28, finTopZ + finH * .12, false);
    box(g, body, am(2.2), am(.6), am(2.4), 0, finTopY, finTopZ);
    const stabSweep = .3, stabHalf = am(4.3);
    for (const s of [-1, 1]) {
        const stab = box(g, body, stabHalf / Math.cos(stabSweep), am(.4), am(1.9),
            s * stabHalf * .5, finTopY, finTopZ - Math.tan(stabSweep) * stabHalf * .5);
        stab.rotation.y = s * stabSweep;
    }
    // Jendela kabin, pintu penumpang, pintu kargo dan cheatline.
    for (const s of [-1, 1]) {
        for (let pz = -LEN * .26; pz <= LEN * .3; pz += am(1.05))
            box(g, M.glass, am(.06), am(.5), am(.36), s * R, deck + am(.6), pz, false);
        box(g, M.frame, am(.07), am(1.7), am(.8), s * R, deck + am(.1), LEN * .27, false);
        box(g, M.hazard, am(.07), am(.24), LEN * .6, s * R, deck - am(.3), 0, false);
    }
    box(g, M.frame, am(.07), am(1.3), am(1.7), R, deck - am(.15), -LEN * .18, false);
    runwayLayoutRecords.engines = {
        type: 'ducted-turbofan',
        perAircraft: 2,
        cowlRadiusM: +(nacelle.cowlRadius / CAMP_M).toFixed(3),
        fanRadiusM: +(nacelle.fanRadius / CAMP_M).toFixed(3),
        ducted: nacelle.fanRadius < nacelle.cowlRadius,
        wingSweep: +sweep.toFixed(3),
    };
    drawnM('parked-airliner', (finTopY + am(.4)) / CAMP_M);
    drawnM('parked-airliner-span', SPAN / CAMP_M);
    drawnM('parked-airliner-length', LEN / CAMP_M);
    weldOccluder(S9_OCC, parent, g, {
        x, z, hx: SPAN * .5, hz: LEN * .58, top: finTopY + am(.8),
    });
    addBlocker(x, z, am(5), LEN * .5, am(4), 0, 'parked-airliner');
    count('parkedAirliner');
    runwayLayoutRecords.parkedAircraft++;
}

function buildJetBridge(parent, M, standX) {
    const g = new THREE.Group();
    const x = standX + S9_BRIDGE_OFFSET;
    g.position.set(0, 0, 0);
    // Jembatan penumpang 20 m: rotunda pada muka terminal, dua bentang
    // teleskopik dan kabin berkanopi karet. Lantainya am(3.6) = 25 unit, jadi
    // player lewat di bawahnya; hanya bogie penyangganya yang jadi collider.
    const cabZ = S9_BRIDGE_CAB_Z, rotZ = S9_BRIDGE_ROT_Z;
    const midZ = (cabZ + rotZ) * .5, len = rotZ - cabZ;
    const w = am(3), h = am(2.7), floor = am(3.6), bogieZ = 280;
    cylinder(g, M.panel, am(2.4), floor + h + am(.7), x, (floor + h) * .5, rotZ, 12);
    box(g, M.roof, am(5.6), am(.4), am(5.6), x, floor + h + am(.85), rotZ);
    for (const [zc, zl, ww, hh] of [
        [midZ + len * .22, len * .56, w + am(.35), h + am(.3)],
        [midZ - len * .26, len * .54, w, h],
    ]) {
        box(g, M.panel, ww, hh, zl, x, floor + hh * .5, zc);
        box(g, M.frame, ww + am(.3), am(.35), zl, x, floor, zc, false);
        box(g, M.roof, ww + am(.35), am(.32), zl + am(.4), x, floor + hh + am(.16), zc);
        for (let pz = -zl * .5 + am(1.8); pz <= zl * .5 - am(1.2); pz += am(2.4))
            box(g, M.glass, ww + am(.08), hh * .4, am(1.5),
                x, floor + hh * .62, zc + pz, false);
    }
    // Kabin + kanopi karet: kanopi menjulur ke -x sampai menyentuh kulit badan
    // pesawat (jari-jari am(1.45) dari garis tengah stand), jadi jembatan ini
    // benar-benar tersambung alih-alih menggantung di sebelahnya.
    box(g, M.panel, am(3.4), h + am(1), am(3.6), x, floor + (h + am(1)) * .5, cabZ);
    box(g, M.rubber, am(1.2), h + am(.6), am(2.6), x - am(1.9), floor + h * .55, cabZ);
    box(g, M.glass, am(3.4), am(1.1), am(.3), x, floor + h * .85, cabZ + am(1.9), false);
    box(g, M.hazard, am(3.6), am(.3), am(.3), x, floor - am(.25), cabZ, false);
    // Bogie beroda + dua kolom hidrolik: satu-satunya bagian yang memblokir.
    box(g, M.steel, am(5.4), am(.9), am(1.7), x, am(.65), bogieZ);
    for (const s of [-1, 1]) {
        box(g, M.frame, am(.75), floor - am(.5), am(.75),
            x + s * am(2), (floor - am(.5)) * .5, bogieZ);
        cylinder(g, M.steel, am(.22), floor * .7, x + s * am(2), floor * .55, bogieZ + am(.9), 8);
        cylinder(g, M.rubber, am(.55), am(.42), x + s * am(2.5), am(.55), bogieZ, 10, 'z');
        addBlocker(x + s * am(2), bogieZ, am(.6), am(.6), floor, 0, 'jet-bridge-column');
    }
    for (let i = 0; i < 7; i++)
        box(g, M.frame, am(1.5), am(.16), am(.44),
            x + am(2.7), floor - (i + 1) * floor / 8, rotZ - am(2.2) - i * am(.6), false);
    drawnM('jet-bridge', (floor + h) / CAMP_M);
    drawnM('jet-bridge-length', len / CAMP_M);
    drawnM('jet-bridge-floor', floor / CAMP_M);
    weldOccluder(S9_OCC, parent, g,
        { x, z: midZ, hx: am(3.2), hz: len * .56, top: floor + h + am(1.4) });
    count('jetBridge');
    runwayLayoutRecords.jetBridges++;
}

function buildTerminalPier(parent, M) {
    // Muka terminal tempat kelima jet bridge berlabuh. Jembatan yang berujung di
    // udara kosong itulah yang membuat apron terbaca belum jadi. Dekor MURNI di
    // luar ruang walkable: tanpa blocker, tanpa nav, tanpa PointLight.
    const g = new THREE.Group();
    const x0 = 299150, x1 = 300085, cx = (x0 + x1) * .5, w = x1 - x0;
    const z = S9_PIER_Z, h = am(11);
    box(g, M.concrete, w, h, am(9), cx, h * .5, z);
    box(g, M.roof, w + am(2), am(1.2), am(11.5), cx, h + am(.6), z);
    box(g, M.glass, w - am(5), am(4.6), am(.4), cx, am(5.6), z - am(4.75), false);
    box(g, M.frame, w - am(4), am(.4), am(.7), cx, am(8.2), z - am(4.9), false);
    for (let px = x0 + am(3.5); px <= x1 - am(3.5); px += am(6.5)) {
        box(g, M.panel, am(1.2), h, am(1.2), px, h * .5, z - am(4.6));
        box(g, M.frame, am(1.5), am(.5), am(2.4), px, h + am(1.3), z - am(5.6), false);
    }
    for (const sx of S9_STAND_XS) {
        const gx = sx + S9_BRIDGE_OFFSET;   // mulut gate = sumbu jet bridge
        box(g, M.frame, am(5.4), am(3.4), am(.5), gx, am(2.4), z - am(4.95));
        box(g, M.glass, am(4.2), am(2.2), am(.25), gx, am(2.3), z - am(5.2), false);
    }
    drawnM('terminal-pier', h / CAMP_M);
    weldOccluder(S9_OCC, parent, g,
        { x: cx, z, hx: w * .5, hz: am(7), top: h + am(2.4) });
    count('terminalPier');
}

function buildLightMast(parent, M, x, z) {
    // Tiang lampu apron 21 m berangka empat kaki. Balok tunggal setinggi 4 m
    // yang lama tidak pernah terbaca sebagai tiang lampu bandara.
    const g = new THREE.Group();
    const h = am(21), leg = am(.85);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        box(g, M.frame, am(.3), h, am(.3), x + sx * leg, h * .5, z + sz * leg);
    for (let y = am(3); y < h - am(1); y += am(4)) {
        for (const sz of [-1, 1])
            box(g, M.frame, leg * 2, am(.18), am(.18), x, y, z + sz * leg, false);
        for (const sx of [-1, 1])
            box(g, M.frame, am(.18), am(.18), leg * 2, x + sx * leg, y, z, false);
        const brace = box(g, M.frame, leg * 2.4, am(.14), am(.14), x, y + am(2), z - leg, false);
        brace.rotation.z = .55;
    }
    box(g, M.panel, am(4.6), am(.6), am(2.2), x, h + am(.4), z);
    box(g, M.frame, am(4.6), am(.3), am(.4), x, h - am(.1), z + am(1), false);
    for (let i = -2; i <= 2; i++) {
        const lamp = box(g, M.white, am(.82), am(.5), am(.95),
            x + i * am(1), h + am(.05), z - am(.45));
        lamp.rotation.x = .5;
    }
    box(g, M.hazard, am(.36), am(.36), am(.36), x, h + am(1), z, false);
    drawnM('apron-light-mast', h / CAMP_M);
    weldOccluder(S9_OCC, parent, g, { x, z, radius: am(3), top: h + am(1.4) });
    count('apronLightMast');
}

function buildFireStation(parent, M, x, z) {
    // Stasiun pemadam 25 x 15 m setinggi 8 m dengan tiga bay berpintu rol
    // 4,6 m — versi lama pintunya 1,7 m, tak ada mobil damkar yang bisa lewat.
    const halfW = am(12.5), halfD = am(7.5), h = am(8), bayDoor = am(4.6);
    drawnM('fire-station-bay-door', bayDoor / CAMP_M);
    drawnM('fire-station-hose-tower', am(13.2) / CAMP_M);
    box(parent, M.concrete, halfW * 2, h, halfD * 2, x, h * .5, z);
    box(parent, M.roof, halfW * 2 + am(1), am(.9), halfD * 2 + am(1), x, h + am(.45), z);
    box(parent, M.hazard, halfW * 2 + am(1.1), am(1), am(.4),
        x, h * .84, z - halfD - am(.6), false);
    for (let i = -1; i <= 1; i++) {
        const px = x + i * am(7.7);
        box(parent, M.steel, am(6), bayDoor, am(.5), px, bayDoor * .5, z - halfD - am(.3));
        for (let y = am(.5); y < bayDoor - am(.2); y += am(.6))
            box(parent, M.frame, am(6), am(.16), am(.22), px, y, z - halfD - am(.6), false);
        box(parent, M.hazard, am(.7), am(.36), am(.32), px, am(5.2), z - halfD - am(.55), false);
    }
    box(parent, M.glass, halfW * .85, am(1.6), am(.35), x, am(6.4), z - halfD - am(.45), false);
    // Menara pengering selang + tiang sirene: siluet khas stasiun pemadam.
    box(parent, M.concrete, am(3.2), am(13), am(3.2),
        x + halfW - am(2.6), am(6.5), z + halfD - am(2.6));
    box(parent, M.roof, am(4), am(.7), am(4),
        x + halfW - am(2.6), am(13.2), z + halfD - am(2.6));
    box(parent, M.glass, am(.9), am(6), am(.3),
        x + halfW - am(2.6), am(7), z + halfD - am(4.25), false);
    cylinder(parent, M.frame, am(.17), am(5.2),
        x - halfW + am(1.7), h + am(2.6), z + halfD - am(1.7), 6);
    box(parent, M.hazard, am(1.4), am(.5), am(.4),
        x - halfW + am(1.7), h + am(5.1), z + halfD - am(1.7), false);
    box(parent, M.panel, am(4.2), am(2.6), am(1.5), x, am(1.3), z + halfD + am(.75));
    addBlocker(x, z, halfW, halfD, h, 0, 'airport-fire-station');
    count('airportFireStation');
    runwayLayoutRecords.fireStations++;
    runwayLayoutRecords.zones.push({ kind: 'fire-station', x, z, hx: halfW, hz: halfD });
}

function wheels(parent, M, points, yaw = 0, radius = am(.5), width = am(.32)) {
    for (const p of points) {
        const tyre = cylinder(parent, M.rubber, radius, width, p[0], p[1], p[2], 10, 'z');
        tyre.rotation.y = yaw;
        const hub = cylinder(parent, M.steel, radius * .5, width * 1.1, p[0], p[1], p[2], 8, 'z');
        hub.rotation.y = yaw;
    }
}

function buildTug(parent, M, x, z) {
    // Pushback tug 5,0 x 2,4 x 2,9 m.
    const g = new THREE.Group(); parent.add(g);
    const L = am(5), W = am(2.4);
    box(g, M.hazard, L, am(.95), W, x, am(.8), z);
    box(g, M.frame, L * .97, am(.28), W + am(.35), x, am(1.32), z, false);
    box(g, M.white, am(2), am(1.7), W - am(.3), x - am(.85), am(2.15), z);
    box(g, M.glass, am(.1), am(.95), W - am(.8), x - am(1.85), am(2.45), z, false);
    for (const s of [-1, 1]) {
        box(g, M.glass, am(1.5), am(.9), am(.1),
            x - am(.85), am(2.45), z + s * (W * .5 - am(.15)), false);
        box(g, M.frame, am(1.1), am(.14), am(.5),
            x - am(.4), am(1.05), z + s * (W * .5 + am(.15)), false);
        box(g, M.white, am(.35), am(.3), am(.28),
            x - am(2.1), am(1.5), z + s * am(.85), false);
    }
    box(g, M.frame, am(2.2), am(.16), W - am(.2), x - am(.85), am(3.05), z, false);
    box(g, M.steel, am(2.4), am(.4), am(.7), x + L * .48, am(1.15), z);
    box(g, M.frame, am(.5), am(.5), am(.5), x + L * .62, am(1.15), z);
    box(g, M.panel, am(.9), am(.7), W - am(.5), x + am(1.1), am(1.65), z, false);
    cylinder(g, M.hazard, am(.16), am(.3), x - am(.85), am(3.25), z, 8);
    cylinder(g, M.frame, am(.09), am(1.1), x + am(.1), am(2.4), z - W * .42, 6);
    wheels(g, M, [[x - am(1.4), am(.5), z - am(1)], [x - am(1.4), am(.5), z + am(1)],
        [x + am(1.5), am(.5), z - am(1)], [x + am(1.5), am(.5), z + am(1)]],
    0, am(.5), am(.34));
    addBlocker(x, z, am(2.6), am(1.3), am(3.4), 0, 'pushback-tug');
    count('pushbackTug');
}

function buildBaggageTrain(parent, M, x, z) {
    // Tiga gerobak bagasi berkanvas 3,2 x 1,9 x 2,0 m dalam satu rangkai.
    const L = am(3.2), W = am(1.9), pitch = am(3.8);
    box(parent, M.frame, am(1.7), am(.18), am(.18), x - pitch * 1.5, am(.75), z, false);
    for (let i = 0; i < 3; i++) {
        const cx = x + (i - 1) * pitch;
        box(parent, M.frame, L, am(.3), W, cx, am(.72), z);
        box(parent, M.steel, L * .96, am(.18), W - am(.2), cx, am(.9), z, false);
        for (const s of [-1, 1]) {
            box(parent, M.frame, am(.16), am(1.35), am(.16),
                cx - L * .45, am(1.55), z + s * (W * .5 - am(.1)));
            box(parent, M.frame, am(.16), am(1.35), am(.16),
                cx + L * .45, am(1.55), z + s * (W * .5 - am(.1)));
        }
        box(parent, i % 2 ? M.panel : M.hazard, L * .98, am(1.1), W - am(.15), cx, am(1.6), z);
        box(parent, M.frame, L, am(.22), W + am(.1), cx, am(2.22), z);
        for (let r = -1; r <= 1; r++)
            box(parent, M.frame, am(.14), am(1.15), W + am(.14), cx + r * L * .3, am(1.6), z, false);
        box(parent, M.frame, am(1.5), am(.16), am(.16), cx - L * .78, am(.72), z, false);
        wheels(parent, M, [[cx - L * .3, am(.34), z - W * .42], [cx - L * .3, am(.34), z + W * .42],
            [cx + L * .3, am(.34), z - W * .42], [cx + L * .3, am(.34), z + W * .42]],
        0, am(.34), am(.24));
        addBlocker(cx, z, am(1.6), am(1), am(2.3), 0, 'baggage-cart');
    }
    count('baggageCart', 3);
}

function buildFuelTruck(parent, M, x, z) {
    // Refueller 11 x 2,55 x 3,5 m: kabin, sasis, tangki berkelim, walkway atas,
    // gulungan selang dan plakat bahaya.
    const L = am(11), W = am(2.55);
    box(parent, M.frame, L, am(.5), W - am(.35), x, am(1.05), z);
    box(parent, M.white, am(2.5), am(2.1), W, x + L * .38, am(2.15), z);
    box(parent, M.glass, am(.12), am(1), W - am(.55), x + L * .38 + am(1.2), am(2.7), z, false);
    for (const s of [-1, 1]) {
        box(parent, M.glass, am(1.2), am(.9), am(.1),
            x + L * .38, am(2.75), z + s * (W * .5 - am(.05)), false);
        box(parent, M.frame, am(.5), am(.16), am(.4),
            x + L * .3, am(3.15), z + s * (W * .5 + am(.2)), false);
        box(parent, M.frame, am(1.2), am(.14), am(.35),
            x + L * .24, am(1.1), z + s * (W * .5 + am(.1)), false);
    }
    box(parent, M.roof, am(2.6), am(.3), W + am(.1), x + L * .38, am(3.25), z);
    cylinder(parent, M.panel, am(1.28), L * .56, x - L * .12, am(2.5), z, 14, 'x');
    for (let i = -2; i <= 2; i++)
        cylinder(parent, M.frame, am(1.31), am(.16), x - L * .12 + i * L * .12, am(2.5), z, 14, 'x');
    box(parent, M.steel, L * .56, am(.2), am(1.5), x - L * .12, am(3.8), z);
    for (const s of [-1, 1]) {
        box(parent, M.frame, L * .56, am(.12), am(.12),
            x - L * .12, am(4.3), z + s * am(.7), false);
        for (let i = -2; i <= 2; i++)
            box(parent, M.frame, am(.1), am(.5), am(.1),
                x - L * .12 + i * L * .12, am(4.05), z + s * am(.7), false);
        box(parent, M.hazard, am(1.8), am(.9), am(.06),
            x - L * .12, am(2.6), z + s * (W * .5 + am(.02)), false);
    }
    box(parent, M.panel, am(1.6), am(1.4), W - am(.3), x - L * .46, am(2), z);
    cylinder(parent, M.rubber, am(.72), am(.36), x - L * .46, am(2.6), z - am(.7), 12, 'z');
    box(parent, M.frame, am(.9), am(1.1), am(.9), x - L * .3, am(1.7), z + W * .38, false);
    for (let i = 0; i < 4; i++)
        box(parent, M.frame, am(.8), am(.12), am(.3),
            x + L * .27, am(.5) + i * am(.42), z + W * .52, false);
    wheels(parent, M, [[x + L * .34, am(.58), z - W * .46], [x + L * .34, am(.58), z + W * .46],
        [x - L * .18, am(.58), z - W * .46], [x - L * .18, am(.58), z + W * .46],
        [x - L * .35, am(.58), z - W * .46], [x - L * .35, am(.58), z + W * .46]],
    0, am(.58), am(.36));
    addBlocker(x, z, am(5.6), am(1.4), am(4.5), 0, 'aviation-fuel-truck');
    count('fuelTruck');
}

function buildMobileStairs(parent, M, x, z) {
    // Tangga penumpang: platform atas 4,2 m (setinggi pintu pesawat), dua belas
    // anak tangga, pegangan berbalustrade dan kanopi.
    const L = am(8), W = am(2.6), top = am(4.2);
    box(parent, M.frame, L, am(.35), W, x, am(.75), z);
    box(parent, M.steel, L * .94, am(.16), W - am(.3), x, am(.95), z, false);
    for (let i = 0; i < 12; i++) {
        const sx = x - L * .42 + i * (L * .72 / 12), sy = am(1.1) + i * (top - am(1.1)) / 12;
        box(parent, M.white, L * .06, am(.14), W - am(.5), sx, sy, z);
        box(parent, M.frame, am(.08), (top - am(1.1)) / 12, W - am(.5),
            sx + L * .028, sy - am(.14), z, false);
    }
    box(parent, M.white, am(1.8), am(.2), W - am(.35), x + L * .38, top, z);
    for (const s of [-1, 1]) {
        const rail = box(parent, M.hazard, L * .78, am(.14), am(.14),
            x - am(.2), am(2.9), z + s * (W * .5 - am(.2)));
        rail.rotation.z = .36;
        for (let i = 0; i < 6; i++)
            box(parent, M.frame, am(.09), am(1.1), am(.09),
                x - L * .4 + i * L * .14, am(1.5) + i * am(.28), z + s * (W * .5 - am(.2)), false);
        box(parent, M.frame, am(1.9), am(.13), am(.13),
            x + L * .38, am(5.3), z + s * (W * .5 - am(.2)));
        box(parent, M.frame, am(.11), am(1.1), am(.11),
            x + L * .46, am(4.75), z + s * (W * .5 - am(.2)));
        box(parent, M.frame, am(.22), am(.9), am(.22),
            x + L * .4, am(.5), z + s * (W * .5 + am(.2)), false);
    }
    box(parent, M.roof, am(2.4), am(.16), W, x + L * .38, am(5.9), z);
    box(parent, M.panel, am(.9), am(1), W - am(.5), x - L * .48, am(1.4), z, false);
    box(parent, M.frame, am(1.6), am(.16), am(.16), x - L * .62, am(.85), z, false);
    wheels(parent, M, [[x - L * .3, am(.5), z - W * .42], [x - L * .3, am(.5), z + W * .42],
        [x + L * .3, am(.5), z - W * .42], [x + L * .3, am(.5), z + W * .42]],
    0, am(.5), am(.3));
    addBlocker(x, z, am(4), am(1.4), am(4.4), 0, 'mobile-stairs');
    count('mobileStairs');
}

function buildCargoLoader(parent, M, x, z) {
    // Main-deck loader 9 x 3,2 m: dua platform roller bergunting, pagar
    // pengaman dan stand operator.
    const L = am(9), W = am(3.2);
    box(parent, M.frame, L, am(.55), W, x, am(.85), z);
    for (const [px, py, pw] of [[-L * .26, am(2.4), L * .4], [L * .26, am(3.2), L * .4]]) {
        box(parent, M.hazard, pw, am(.3), W - am(.2), x + px, py, z);
        for (let r = -3; r <= 3; r++)
            cylinder(parent, M.steel, am(.14), W - am(.35),
                x + px + r * pw * .13, py + am(.24), z, 8, 'z');
        for (const s of [-1, 1]) {
            box(parent, M.frame, pw, am(.12), am(.12),
                x + px, py + am(1.05), z + s * (W * .5 - am(.12)));
            for (const dx of [-pw * .4, 0, pw * .4])
                box(parent, M.frame, am(.1), am(1), am(.1),
                    x + px + dx, py + am(.6), z + s * (W * .5 - am(.12)), false);
            const a = box(parent, M.frame, am(.22), py * .9, am(.22),
                x + px - pw * .28, py * .55, z + s * (W * .5 - am(.35)));
            a.rotation.z = .5;
            const b = box(parent, M.frame, am(.22), py * .9, am(.22),
                x + px + pw * .28, py * .55, z + s * (W * .5 - am(.35)));
            b.rotation.z = -.5;
        }
    }
    box(parent, M.panel, am(1.1), am(1.5), am(1.1), x - L * .44, am(1.9), z + W * .3);
    box(parent, M.tech, am(.7), am(.5), am(.1), x - L * .44, am(2.3), z + W * .3 - am(.6), false);
    box(parent, M.frame, am(.9), am(1.1), am(.9), x - L * .44, am(1.2), z - W * .28, false);
    wheels(parent, M, [[x - L * .32, am(.55), z - W * .4], [x - L * .32, am(.55), z + W * .4],
        [x + L * .32, am(.55), z - W * .4], [x + L * .32, am(.55), z + W * .4]],
    0, am(.55), am(.34));
    addBlocker(x, z, am(4.6), am(1.7), am(3.6), 0, 'cargo-loader');
    count('cargoLoader');
}

function buildBaggageTractor(parent, M, x, z) {
    // Traktor bagasi 4,0 x 1,7 x 2,1 m berkanopi terbuka.
    const L = am(4), W = am(1.7);
    box(parent, M.hazard, L, am(.85), W, x, am(.78), z);
    box(parent, M.frame, L * .96, am(.24), W + am(.25), x, am(1.24), z, false);
    box(parent, M.panel, am(1.1), am(.75), W - am(.3), x - L * .28, am(1.7), z);
    box(parent, M.frame, am(.9), am(.9), am(.12), x - L * .1, am(1.85), z, false);
    box(parent, M.glass, am(.1), am(.85), W - am(.4), x + L * .32, am(1.9), z, false);
    for (const s of [-1, 1]) {
        box(parent, M.frame, am(.11), am(1.2), am(.11),
            x - L * .05, am(2.05), z + s * (W * .5 - am(.1)));
        box(parent, M.white, am(.3), am(.28), am(.26),
            x + L * .48, am(1.3), z + s * am(.5), false);
    }
    box(parent, M.roof, am(1.7), am(.14), W + am(.1), x - am(.15), am(2.7), z);
    box(parent, M.steel, am(.9), am(.35), am(.6), x - L * .52, am(.95), z);
    box(parent, M.frame, am(.4), am(.4), am(.4), x - L * .6, am(.95), z);
    cylinder(parent, M.hazard, am(.15), am(.28), x - am(.15), am(2.9), z, 8);
    wheels(parent, M, [[x - L * .3, am(.42), z - W * .45], [x - L * .3, am(.42), z + W * .45],
        [x + L * .3, am(.42), z - W * .45], [x + L * .3, am(.42), z + W * .45]],
    0, am(.42), am(.26));
    addBlocker(x, z, am(2.1), am(.95), am(3), 0, 'baggage-tractor');
    count('baggageTractor');
}

function buildBeltLoader(parent, M, x, z) {
    // Belt loader 9 m: sabuk miring bersirip dari lantai bagasi ke pintu kargo,
    // rel samping, roller ujung dan pos kendali.
    const L = am(9), W = am(2.4), tilt = -.3;
    box(parent, M.frame, L * .78, am(.5), W, x - am(.5), am(.8), z);
    const belt = box(parent, M.rubber, L, am(.24), W - am(.6), x + am(.6), am(2.5), z);
    belt.rotation.z = tilt;
    for (let i = -6; i <= 6; i++) {
        const slat = box(parent, M.steel, am(.16), am(.26), W - am(.6),
            x + am(.6) + i * L * .075, am(2.5) - i * L * .075 * Math.tan(-tilt), z, false);
        slat.rotation.z = tilt;
    }
    for (const s of [-1, 1]) {
        const rail = box(parent, M.hazard, L, am(.3), am(.14),
            x + am(.6), am(2.72), z + s * (W * .5 - am(.24)));
        rail.rotation.z = tilt;
        const strut = box(parent, M.frame, am(.24), am(2.4), am(.24),
            x + am(1.6), am(1.8), z + s * (W * .5 - am(.3)));
        strut.rotation.z = .4;
        const back = box(parent, M.frame, am(.2), am(1.7), am(.2),
            x - am(1.9), am(1.3), z + s * (W * .5 - am(.3)));
        back.rotation.z = -.35;
    }
    for (const [px, py] of [[L * .46, am(3.9)], [-L * .4, am(1.35)]])
        cylinder(parent, M.steel, am(.3), W - am(.55), x + am(.6) + px, py, z, 10, 'z');
    box(parent, M.panel, am(1), am(1.4), am(1), x - L * .44, am(1.75), z + W * .28);
    box(parent, M.tech, am(.6), am(.45), am(.1), x - L * .44, am(2.1), z + W * .28 - am(.55), false);
    box(parent, M.frame, am(1.7), am(.16), am(.16), x - L * .56, am(.9), z, false);
    wheels(parent, M, [[x - L * .3, am(.5), z - W * .42], [x - L * .3, am(.5), z + W * .42],
        [x + L * .18, am(.5), z - W * .42], [x + L * .18, am(.5), z + W * .42]],
    0, am(.5), am(.3));
    addBlocker(x, z, am(4.6), am(1.3), am(4.2), 0, 'belt-loader');
    count('beltLoader');
}

function buildGroundPowerUnit(parent, M, x, z) {
    // GPU 4,2 x 1,9 x 2,1 m: kabin genset berlouvre, cerobong, gulungan kabel
    // dan tow bar.
    const L = am(4.2), W = am(1.9);
    box(parent, M.frame, L, am(.4), W, x, am(.62), z);
    box(parent, M.hazard, L * .9, am(1.35), W - am(.15), x, am(1.5), z);
    box(parent, M.roof, L * .94, am(.18), W + am(.1), x, am(2.24), z);
    for (let i = -2; i <= 2; i++)
        box(parent, M.frame, am(.12), am(.9), am(.1), x + i * am(.55), am(1.5), z - W * .5, false);
    for (const s of [-1, 1])
        box(parent, M.frame, am(1.5), am(.75), am(.1),
            x - am(.6), am(1.5), z + s * (W * .5 - am(.02)), false);
    box(parent, M.panel, am(.9), am(.85), am(.12), x + L * .32, am(1.6), z - W * .52);
    box(parent, M.tech, am(.55), am(.4), am(.08), x + L * .32, am(1.75), z - W * .58, false);
    cylinder(parent, M.steel, am(.13), am(1.1), x - L * .34, am(2.7), z + am(.4), 8);
    cylinder(parent, M.rubber, am(.42), am(.3), x - L * .3, am(1.5), z + W * .55, 10);
    box(parent, M.frame, am(1.7), am(.16), am(.16), x + L * .62, am(.65), z, false);
    box(parent, M.frame, am(.4), am(.4), am(.4), x + L * .78, am(.65), z, false);
    box(parent, M.hazard, am(.24), am(.24), am(.24), x, am(2.45), z, false);
    wheels(parent, M, [[x - L * .28, am(.4), z - W * .45], [x - L * .28, am(.4), z + W * .45],
        [x + L * .28, am(.4), z - W * .45], [x + L * .28, am(.4), z + W * .45]],
    0, am(.4), am(.24));
    addBlocker(x, z, am(2.3), am(1), am(2.9), 0, 'ground-power-unit');
    count('groundPowerUnit');
}

function buildSafetyEquipment(parent, M, x, z) {
    // Kerucut 0,75 m dan pasangan wheel chock 0,25 m — ukuran nyata, bukan
    // kerucut 37 cm yang tenggelam di bawah lutut Gibran.
    for (let i = 0; i < 8; i++) {
        const cx = x + i * am(2.6), cz = z + (i % 2) * am(1.1);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(am(.32), am(.75), 8), M.hazard);
        drawnM('safety-cone', .75);
        cone.position.set(cx, am(.42), cz);
        cone.castShadow = true;
        parent.add(cone);
        box(parent, M.white, am(.52), am(.08), am(.52), cx, am(.05), cz, false);
        const band = new THREE.Mesh(new THREE.ConeGeometry(am(.21), am(.14), 8), M.white);
        band.position.set(cx, am(.52), cz);
        parent.add(band);
    }
    for (let i = 0; i < 6; i++) {
        const cx = x + am(1.2) + i * am(3.4), cz = z + am(2.6);
        for (const s of [-1, 1]) {
            const chock = new THREE.Mesh(new THREE.ConeGeometry(am(.3), am(.42), 4), M.hazard);
            chock.rotation.z = s * Math.PI * .5;
            chock.position.set(cx + s * am(.42), am(.21), cz);
            parent.add(chock);
        }
        box(parent, M.frame, am(1.2), am(.07), am(.1), cx, am(.05), cz, false);
    }
    count('safetyCone', 8); count('wheelChockPair', 6);
}

function buildAirportBus(parent, M, x, z) {
    // Bus apron lantai rendah 12 x 2,7 x 3,1 m — versi lama setinggi 1,29 m,
    // lebih pendek daripada penumpangnya sendiri.
    const L = am(12), W = am(2.7), H = am(3.1);
    box(parent, M.white, L, H - am(.55), W, x, am(1.15) + (H - am(.55)) * .5, z);
    box(parent, M.frame, L, am(.5), W - am(.1), x, am(.95), z);
    box(parent, M.roof, L - am(.4), am(.35), W + am(.1), x, H + am(.75), z);
    box(parent, M.panel, am(3.2), am(.5), am(1.8), x - L * .18, H + am(1.1), z);
    box(parent, M.hazard, L, am(.4), W + am(.06), x, am(1.5), z, false);
    for (const s of [-1, 1]) {
        for (let i = -4; i <= 4; i++)
            box(parent, M.glass, am(1.15), am(1.15), am(.1),
                x + i * am(1.24), am(3.1), z + s * (W * .5 + am(.01)), false);
        box(parent, M.frame, am(.16), am(2.3), am(.1),
            x + L * .22, am(2.5), z + s * (W * .5 + am(.03)), false);
        box(parent, M.frame, am(.16), am(2.3), am(.1),
            x - L * .3, am(2.5), z + s * (W * .5 + am(.03)), false);
        box(parent, M.frame, L - am(.6), am(.14), am(.14),
            x, am(1.75), z + s * (W * .5 + am(.06)), false);
        box(parent, M.white, am(.4), am(.35), am(.32),
            x + L * .49, am(1.85), z + s * (W * .5 - am(.35)), false);
        box(parent, M.hazard, am(.35), am(.3), am(.3),
            x - L * .49, am(1.85), z + s * (W * .5 - am(.35)), false);
        box(parent, M.frame, am(.5), am(.2), am(.4),
            x + L * .38, am(3.6), z + s * (W * .5 + am(.28)), false);
    }
    box(parent, M.glass, am(.12), am(1.5), W - am(.5), x + L * .5, am(3.2), z, false);
    box(parent, M.glass, am(.12), am(1.4), W - am(.5), x - L * .5, am(3.2), z, false);
    box(parent, M.frame, am(1.1), am(.5), W - am(.2), x + L * .52, am(1.25), z, false);
    box(parent, M.frame, am(1.1), am(.5), W - am(.2), x - L * .52, am(1.25), z, false);
    wheels(parent, M, [[x + L * .34, am(.58), z - W * .48], [x + L * .34, am(.58), z + W * .48],
        [x - L * .28, am(.58), z - W * .48], [x - L * .28, am(.58), z + W * .48]],
    0, am(.58), am(.36));
    addBlocker(x, z, am(6), am(1.45), am(4), 0, 'apron-bus');
    count('apronBus');
}

function buildCargoPallet(parent, M, x, z, variant = 0) {
    // ULD 3,2 x 2,4 x 1,6 m: pelat dasar, badan bersudut potong, jaring pengikat
    // dan tie-down — bukan kotak polos di atas palet.
    const g = new THREE.Group();
    const L = am(3.2), W = am(2.4), H = am(1.6);
    box(g, M.wood, L, am(.22), W, x, am(.11), z);
    for (let i = -1; i <= 1; i++)
        box(g, M.wood, am(.3), am(.14), W, x + i * L * .32, am(.03), z, false);
    box(g, variant % 3 ? M.panel : M.steel, L * .96, H, W - am(.12), x, am(.22) + H * .5, z);
    const bevel = box(g, variant % 3 ? M.panel : M.steel, L * .96, H * .5, am(.9),
        x, am(.22) + H * .3, z - W * .5 + am(.35));
    bevel.rotation.x = -.5;
    box(g, M.frame, L * .98, am(.14), W, x, am(.22) + H, z, false);
    for (const s of [-1, 1])
        box(g, M.frame, am(.14), H, am(.14),
            x + s * L * .47, am(.22) + H * .5, z + s * W * .45, false);
    box(g, M.hazard, L * .5, am(.5), am(.08), x, am(.22) + H * .62, z + W * .5, false);
    for (let i = -2; i <= 2; i++)
        box(g, M.frame, am(.09), H * .8, am(.09), x + i * L * .2, am(.22) + H * .5, z + W * .5, false);
    weldOccluder(S9_OCC, parent, g, { x, z, radius: am(2), top: am(2) });
    addBlocker(x, z, am(1.7), am(1.3), am(1.9), 0, 'air-cargo-pallet');
}

function buildFuelPump(parent, M) {
    const x = S9_PUMP.x, z = S9_PUMP.z;
    const g = new THREE.Group();
    // Dispenser hidran bahan bakar 2,6 x 1,6 x 2,2 m. Indikatornya memakai
    // MATERIAL SENDIRI: `stage9SetFuelPumpOn` mengubah warna material itu, dan
    // M.hazard dipakai bersama oleh marka/hanggar/pesawat — mewarnai instance
    // bersama akan menghijaukan separuh apron begitu pompa menyala.
    const indMat = material(PAL.hazard, .4, .05,
        { emissive: PAL.hazard, emissiveIntensity: .18 });
    box(g, M.concrete, am(3.4), am(.4), am(2.4), x, am(.2), z, false);
    box(g, M.frame, am(2.6), am(.4), am(1.6), x, am(.55), z);
    box(g, M.panel, am(2.2), am(1.7), am(1.4), x, am(1.6), z);
    box(g, M.frame, am(2.4), am(.22), am(1.6), x, am(2.5), z);
    box(g, M.hazard, am(2.45), am(.3), am(1.65), x, am(2.72), z);
    box(g, M.tech, am(1.1), am(.7), am(.1), x, am(2), z - am(.75), false);
    box(g, M.frame, am(1.6), am(.5), am(.12), x, am(1.05), z - am(.75), false);
    for (const s of [-1, 1])
        box(g, M.frame, am(.16), am(1.7), am(.16), x + s * am(1.15), am(1.6), z + am(.75), false);
    cylinder(g, M.steel, am(.5), am(.9), x - am(.7), am(1.7), z + am(.85), 10, 'z');
    const hose = cylinder(g, M.rubber, am(.11), am(2.6), x - am(1.3), am(.9), z + am(1.1), 8, 'z');
    hose.rotation.x = .35;
    box(g, M.frame, am(.5), am(.3), am(.3), x - am(1.6), am(.35), z + am(2.1), false);
    cylinder(g, M.frame, am(.1), am(1.5), x + am(1.5), am(.75), z - am(.6), 6);
    box(g, M.frame, am(.24), am(.5), am(.24), x, am(2.85), z - am(.4), false);
    const indicator = box(g, indMat, am(.42), am(.42), am(.3), x, am(3.05), z - am(.4), false);
    indicator.userData.fuelIndicator = true;
    parent.add(g);
    fuelPump = { group: g, indicator };
    addBlocker(x, z, am(1.3), am(.8), am(2.4), 0, 'fuel-pump');
    count('fuelPump');
}

// Setiap batang marka perkerasan lewat sini supaya jumlahnya terukur.
function paint(parent, mat, sx, sy, sz, x, y, z) {
    runwayLayoutRecords.markings++;
    return box(parent, mat, sx, sy, sz, x, y, z, false);
}

function buildRunwayAndApron(parent, M) {
    // Denah user: apron + fasilitas di utara/+z, taxiway melintang di tengah,
    // runway 14-32 di selatan/-z. MARKA SENGAJA SEDIKIT (permintaan user
    // 2026-08-27, "jalannya terlalu banyak ornamen garis"): satu centreline per
    // bidang, satu ambang per ujung runway, satu lead-in per stand. Tidak ada
    // lagi deretan edge light, hold-short berlapis, atau cabang pemandu ganda.
    // Bidang rumput dilebarkan ke timur supaya lari lepas landas transport
    // berakhir di ATAS tanah, bukan di atas haze latar.
    box(parent, M.grass, 2700, 1, 1120, S9_ORIGIN.x + 200, -0.75, 30, false);
    box(parent, M.apron, 940, .42, 250, 299580, -.04, 180, false);
    box(parent, M.apron, 800, .42, 310, 300450, -.04, 175, false);
    // Bidang yang saling menyambung harus punya overlap lebih lebar daripada
    // diameter player. Kalau hanya bertemu pada satu garis setelah radius
    // diterapkan, `slideWalk` membacanya sebagai dinding tak terlihat.
    box(parent, M.asphalt, 1760, .44, 110, 300000, -.04, 25, false);
    // Runway dilebarkan 110 -> 170 unit (24 m): transport berbentang 25 m tak
    // boleh terlihat lebih lebar daripada landasannya sendiri.
    box(parent, M.asphalt, 1720, .46, 170, 300010, -.03, -220, false);
    runwayLayoutRecords.zones.push(
        { kind: 'apron', x: 299580, z: 180, hx: 470, hz: 125 },
        { kind: 'service-yard', x: 300450, z: 175, hx: 400, hz: 155 },
        { kind: 'taxiway-b', x: 300000, z: 25, hx: 880, hz: 55 },
        { kind: 'runway-14-32', x: 300010, z: -220, hx: 860, hz: 85 },
    );

    // Tiga konektor C3/C2/D1 dari taxiway ke runway: badan aspal + SATU garis.
    for (const x of [299860, 300250, 300700]) {
        box(parent, M.asphalt, 86, .43, 190, x, -.02, -85, false);
        paint(parent, M.taxiLine, 1.8, .08, 176, x, .23, -85);
        runwayLayoutRecords.taxiwayConnectors++;
    }

    // Centreline taxiway + satu lead-in pendek per stand apron.
    paint(parent, M.taxiLine, 1710, .08, 1.8, 300000, .23, 25);
    for (const x of S9_STAND_XS)
        paint(parent, M.taxiLine, 1.8, .08, 96, x, .23, 112);

    // Runway: centreline putus-putus dan satu ambang pada tiap ujung.
    for (let x = 299280; x <= 300740; x += 200)
        paint(parent, M.white, 120, .08, 2.6, x, .24, -220);
    for (const [edgeX, dir] of [[299180, 1], [300840, -1]])
        for (let i = -3; i <= 3; i++)
            paint(parent, M.white, 28, .1, 5, edgeX + dir * 24, .24, -220 + i * 21);
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
    // SATU batas apron, SATU hold-short per konektor, SATU garis jalur servis
    // per bidang. Versi lama menumpuk lima batang di DUA baris untuk tiap
    // konektor plus garis putus-putus jalur servis — itulah "terlalu banyak
    // ornamen garis" yang dilaporkan user (2026-08-27).
    paint(parent, M.taxiLine, 930, .08, 1.6, 299580, .24, 304);
    for (const x of [299860, 300250, 300700])
        paint(parent, M.taxiLine, 86, .08, 2.6, x, .24, -124);
    paint(parent, M.white, 900, .08, 1.2, 299580, .24, 64);
    paint(parent, M.white, 720, .08, 1.2, 300450, .24, 142);
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
        // Marka taxiway/apron memakai AMBER (aturan #3 palette.js: amber untuk
        // marka bahaya), bukan merah-bata M.hazard yang dipakai bodi prop.
        taxiLine: material(PAL.amber, 0.92, 0.02),
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
    // Sabuk pohon pematang: ~10 m, seukuran pohon sungguhan di sebelah pesawat
    // 25 m. `buildTree` yang lama sengaja TIDAK diubah — dia dipakai planter
    // Chapter 1 yang tajuknya wajib muat di dalam kotak planter.
    for (let x = 299140, k = 0; x <= 300860; x += 48, k++) {
        buildAirsideTree(staticRoot, M, x, -540 + (k % 3) * 12, k);
        buildAirsideTree(staticRoot, M, x, 552 - (k % 3) * 10, k + 2);
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
    occProp((p) => buildTower(p, M), S9_CONTROL_TOWER.x, S9_CONTROL_TOWER.z, 124, am(40));
    occProp((p) => buildHangar(p, M), S9_CARGO_HANGAR.x, S9_CARGO_HANGAR.z, 170, am(17));
    occProp(buildFireStation, 300175, 210, 104, am(15));

    // Lima stand: pesawat parkir, jet bridge dan muka terminal semuanya
    // diturunkan dari S9_STAND_XS, jadi jarak antar-stand tak pernah lebih
    // sempit daripada bentang sayap yang digambar.
    S9_STAND_XS.forEach((x, i) => {
        buildParkedAirliner(worldRoot, M, x, S9_STAND_Z, i);
        buildJetBridge(worldRoot, M, x);
    });
    buildTerminalPier(worldRoot, M);

    // GSE berbaris pada SATU jalur servis di belakang tiap bidang (apron z=88,
    // service yard z=112). Satu jalur membuat semuanya terpisah bersih dari
    // badan pesawat (z 103..257), barel, drop dan titik encounter. Koridor
    // x~300800 antara dinding timur hanggar dan tepi yard SENGAJA dikosongkan:
    // itu satu-satunya jalan menuju pompa bahan bakar.
    occProp(buildTug, 299300, 88, 22, am(3.6));
    occProp(buildBaggageTrain, 299470, 88, 46, am(2.5));
    occProp(buildFuelTruck, 299680, 88, 42, am(4.7));
    occProp(buildMobileStairs, 299850, 88, 32, am(6.2));
    occProp(buildCargoLoader, 299980, 88, 36, am(4.6));
    occProp(buildAirportBus, 299530, 278, 46, am(4.2));
    occProp(buildBaggageTractor, 300310, 112, 18, am(3.2));
    occProp(buildBaggageTractor, 300640, 112, 18, am(3.2));
    occProp(buildBeltLoader, 300420, 112, 36, am(4.4));
    occProp(buildBeltLoader, 300730, 112, 36, am(4.4));
    occProp(buildGroundPowerUnit, 300530, 112, 20, am(3));
    occProp(buildGroundPowerUnit, 300430, 150, 20, am(3));
    buildSafetyEquipment(staticRoot, M, 300150, 78);

    // Staging ULD: 3,2 x 2,4 x 1,6 m dengan jarak yang cukup untuk lorong forklift.
    for (let i = 0; i < 12; i++)
        buildCargoPallet(worldRoot, M, 300290 + (i % 4) * 26, 250 + Math.floor(i / 4) * 24, i);
    count('airCargoPallet', 12);

    // Tiang lampu apron 21 m. Semuanya berdiri di LUAR ruang walkable (tepi
    // belakang apron/yard), jadi rangka empat kakinya tidak perlu collider dan
    // tak pernah menghalangi rute misi.
    const lampSpecs = [
        [299150, 332], [299335, 332], [299525, 332], [299905, 332],
        [300430, 350], [300840, 350],
    ];
    for (const [x, z] of lampSpecs) {
        buildLightMast(worldRoot, M, x, z);
        const light = new THREE.PointLight(PAL.amber, 1.15, 180);
        light.position.set(x, am(20.5), z);
        scene.add(light);
        registerStageLight(S9_RUNWAY_KEY, light);
        stageLights.push(light);
    }

    transport = buildArmedHeavyAircraft();
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
    // Taxiway 90 -> 110 unit dan runway 110 -> 170 unit (2026-08-27): pesawat
    // berskala nyata (bentang 25 m) tak boleh terlihat lebih lebar daripada
    // perkerasan yang dilewatinya. Overlap ke konektor jadi 45 unit, jauh di
    // atas diameter player, jadi tak ada seam baru.
    const taxiway = x >= 299120 + radius && x <= 300880 - radius
        && z >= -30 + radius && z <= 80 - radius;
    const runway = x >= 299150 + radius && x <= 300870 - radius
        && z >= -305 + radius && z <= -135 - radius;
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
            // Digeser 299970,84 -> 299900,130 (2026-08-27): cargo loader kini
            // berukuran nyata 9 m, jadi titik lama berdiri di dalam colliernya.
            { x: 299900, z: 130, type: 'ammo', weapon: 'rifle' },
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
            terminalPiers: semantic.terminalPier || 0,
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
                // Sensus UKURAN NYATA (meter) tiap keluarga prop airside,
                // DITURUNKAN dari collider-nya sendiri: "yang digambar adalah
                // yang memblokir", jadi angka ini sekaligus menjaga keduanya
                // tetap sinkron. `drawnMeters` menambahkan siluet struktur yang
                // menjulang jauh di atas collider-nya.
                propMeters: blockers.reduce((a, b) => {
                    const wx = b.hx * Math.abs(b.axx) + b.hz * Math.abs(b.azx);
                    const wz = b.hx * Math.abs(b.axz) + b.hz * Math.abs(b.azz);
                    const cur = a[b.kind] || (a[b.kind] = {
                        count: 0, lengthM: 0, widthM: 0, heightM: 0,
                    });
                    cur.count++;
                    cur.lengthM = Math.max(cur.lengthM, +(wx * 2 / CAMP_M).toFixed(2));
                    cur.widthM = Math.max(cur.widthM, +(wz * 2 / CAMP_M).toFixed(2));
                    cur.heightM = Math.max(cur.heightM, +(b.top / CAMP_M).toFixed(2));
                    return a;
                }, Object.create(null)),
                drawnMeters: { ...runwayLayoutRecords.drawnMeters },
                markings: runwayLayoutRecords.markings,
                engines: runwayLayoutRecords.engines
                    ? { ...runwayLayoutRecords.engines } : null,
                propOverlaps: stage9RunwayOverlaps(),
                // Indikator pompa WAJIB punya material sendiri: `stage9SetFuelPumpOn`
                // menulis warna material itu, dan M.hazard dipakai bersama oleh
                // marka/hanggar/pesawat.
                fuelIndicatorMeshes: (() => {
                    if (!fuelPump) return 0;
                    let n = 0;
                    worldRoot.traverse((o) => {
                        if (o.isMesh && o.material === fuelPump.indicator.material) n++;
                    });
                    return n;
                })(),
                standXs: [...S9_STAND_XS],
                standPitch: S9_STAND_XS.length > 1
                    ? S9_STAND_XS[1] - S9_STAND_XS[0] : 0,
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
                    pier: { x: (299150 + 300085) * .5, z: S9_PIER_Z },
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
