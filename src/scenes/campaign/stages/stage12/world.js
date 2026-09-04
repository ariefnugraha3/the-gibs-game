// Stage 12 — ZERO HOUR: MONAS.
//
// THE LAST BOSS IS FOUGHT IN THE SURVIVAL MONAS PARK ITSELF (2026-09-04, user:
// "gunakan benar-benar area monas di survival mode, jangan buat baru lagi").
// There is now exactly ONE Taman Monas in the game: the one
// `scenes/survival/world.js` builds — its ground, Jalan Medan Merdeka, the
// concrete perimeter fence, the radial plaza, the Jalan Silang diagonals, the
// dancing fountain, the reflecting pool, the tree lawns, the Monas itself and
// the ruined Jakarta skyline ring. Campaign Stage 12 calls `ensureParkWorld()`
// and PLAYS IN IT. It does not author a lookalike, and it never mutates it:
// nothing here damages the monument, and `resetMonasCollapse()` on entry undoes
// anything a previous Survival run did to it.
//
// This module therefore owns only what is CAMPAIGN: the deployment boulevard
// west of the park, the gate that seals behind the player, the four hardline
// pads, the legacy vault the boss rises from, the wrecks and inert shells along
// the road, and the arrival transport.
//
// TWO THINGS FOLLOW FROM SHARING ONE PARK.
// (1) The park is its own registered world root (`monas-park`), so it is hidden
//     and un-traversed while Stages 1-11 play, and shown by BOTH Stage 12 and
//     Survival. Stage 12's own root is a second, separate record.
// (2) Collision, ground height and the monument itself come from the SURVIVAL
//     predicates (`resolveMonas`, `resolveObstacles`, `groundHeightAt`,
//     `segmentHitsFountain`). Re-deriving them here is exactly the duplication
//     the user rejected — if the park moves, this stage moves with it.
//
// PLACEMENT RULE (2026-09-03, user report "masih ada gedung yang berada di
// tengah jalan"): every prop this module places is tested against the SAME
// rectangles the walk predicate is built from, and the shared park keeps its
// west approach corridor free of skyline buildings (`PARK_WEST_CORRIDOR`), so
// nothing can stand on a surface the player walks on.

import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStatic, mergeObjectInPlace } from '../../../../utils/meshBatch.js';
import { slideWalk, resolveBlockers } from '../../../../utils/collision.js';
import { segPointDist2, clamp } from '../../../../utils/math.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import {
    buildSplitDoor, splitDoorLeafOffset, doorEasedOpen, updateDoorMotion,
} from '../../utility/doors.js';
import {
    registerOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';
import {
    buildStage12TransportMesh, resetStage12TransportRig,
    updateStage12TransportRig, stage12TransportDebug,
} from './transport.js';
// ---- TAMAN MONAS BERSAMA (survival). Bukan salinan: instans yang sama. ----
import {
    PARK, FENCE_H, ROAD_W, FOUNTAIN, MONAS_HALF, PARK_GATE, PARK_WEST_CORRIDOR,
    PARK_VAULT, PARK_HARDLINE_PADS, PARK_RESERVED,
    treeColliders, ensureParkWorld, monasParkRoot, resolveMonas, resolveObstacles,
    groundHeightAt, segmentHitsFountain, resetMonasCollapse,
} from '../../../survival/world.js';

export const STAGE12_LIGHTS_KEY = 'campaign-12';
export const MONAS_PARK_KEY = 'monas-park';

// Taman Monas berdiri di TITIK ASAL dunia, jadi Stage 12 pun bermain di sana.
export const S12_ORIGIN = Object.freeze({ x: 0, z: 0 });
export const S12_PARK = Object.freeze({
    cx: 0, cz: 0, hx: PARK.hx, hz: PARK.hz,
    fenceH: FENCE_H, roadW: ROAD_W, shared: true,
});
export const S12_MONAS = Object.freeze({ x: 0, z: 0, radius: MONAS_HALF });
export const S12_FOUNTAIN = Object.freeze({ ...FOUNTAIN });

// Gerbang: bukaan pagar barat MILIK TAMAN BERSAMA. Daunnya campaign, lubangnya
// bukan — jadi tidak ada dinding tak terlihat dan tidak ada tembok yang ditembus.
export const S12_GATE = Object.freeze({
    x: PARK_GATE.x, z: PARK_GATE.z, halfSpan: PARK_GATE.halfSpan,
    height: 20, thickness: 8,
    // Daun menggeser di MUKA pagar (gerbang sorong), bukan menembus temboknya.
    leafX: PARK_GATE.x - 7,
});

export const S12_START = Object.freeze({ x: -1360, z: 0 });
export const S12_ARENA_ENTRY = Object.freeze({ x: S12_GATE.x - 62, z: 0 });
// Vault M-0 dan pad hardline berdiri PERSIS di petak yang direservasi taman
// bersama untuk mereka, jadi tak ada pohon acak yang bisa tumbuh menembusnya.
export const S12_BOSS_CENTER = Object.freeze({ x: PARK_VAULT.x, z: PARK_VAULT.z });

export const S12_BOUNDS = Object.freeze({
    x0: -1600, x1: 1800, z0: -1800, z1: 1800,
});
// Batas PROYEKTIL boss — bukan batas kamera. Kamera Stage 12 tidak pernah
// dikunci (2026-09-04, permintaan user); hanya Stage 4 yang menjepit pandangan.
export const S12_ARENA_BOUNDS = Object.freeze({
    x0: -PARK.hx, x1: PARK.hx, z0: -PARK.hz, z1: PARK.hz, groundY: 0,
});
// BATAS GERAK BOSS = SELURUH TAMAN, bukan kotak kecil di sisi monumen
// (2026-09-04, laporan user "tempatnya seperti terbatas di area sebelah Monas").
// Angkanya DITURUNKAN dari taman yang benar-benar dibangun, jadi kalau taman
// berubah ukuran, arena boss ikut — hanya menyisakan ruang badan dari pagar.
const BOSS_MARGIN = 52;
export const S12_BOSS_BOUNDS = Object.freeze({
    x0: -(PARK.hx - BOSS_MARGIN), x1: PARK.hx - BOSS_MARGIN,
    z0: -(PARK.hz - BOSS_MARGIN), z1: PARK.hz - BOSS_MARGIN,
});
// Monas TIDAK boleh digilas: satu-satunya rintangan yang benar-benar menahan
// badan boss. Radiusnya menutupi SUDUT kotak Monas (bukan sisinya) plus badan.
const BOSS_MONAS_CLEAR = 34;
export const S12_BOSS_AVOID = Object.freeze({
    x: 0, z: 0, radius: MONAS_HALF * Math.SQRT2 + BOSS_MONAS_CLEAR,
});

// Lane serang tangensial/vertikal mengelilingi Monas. Kedua lingkaran ujung
// (termasuk badan boss) melewati dasar Monas dengan jarak lebar.
export const S12_CHARGE_LANES = Object.freeze([
    Object.freeze({ x0: -150, z0: -155, x1: 150, z1: -155 }),
    Object.freeze({ x0: 150, z0: 155, x1: -150, z1: 155 }),
    Object.freeze({ x0: -150, z0: -195, x1: -150, z1: 195 }),
    Object.freeze({ x0: 150, z0: 195, x1: 150, z1: -195 }),
]);

export const S12_HARDLINE_STATIONS = Object.freeze(
    PARK_HARDLINE_PADS.map(p => Object.freeze({ x: p.x, z: p.z, index: p.index })));

// ===== Rektangel yang mendefinisikan permukaan ============================
// SATU sumber untuk `stage12Walk` DAN untuk filter penempatan prop: sebuah
// gedung tidak bisa berdiri di jalan kalau keduanya membaca daftar yang sama.
const AVENUE = Object.freeze({
    x0: -1500, x1: S12_GATE.x + 34, z0: -102, z1: 102 });
const PARK_RECT = Object.freeze({
    x0: -PARK.hx, x1: PARK.hx, z0: -PARK.hz, z1: PARK.hz });
const PLAY_RECTS = Object.freeze([AVENUE, PARK_RECT]);

// Aspal dekor: bahu boulevard + Jalan Medan Merdeka milik taman bersama.
const SHOULDER = Object.freeze({
    x0: AVENUE.x0 - 40, x1: AVENUE.x1, z0: -150, z1: 150 });
const RING_OUT = PARK.hx + ROAD_W;
const RING_ZOUT = PARK.hz + ROAD_W;
const ROAD_RECTS = Object.freeze([SHOULDER, Object.freeze({
    x0: -RING_OUT, x1: RING_OUT, z0: -RING_ZOUT, z1: RING_ZOUT })]);

function rectHit(r, x, z, hw, hd, margin) {
    return x + hw + margin > r.x0 && x - hw - margin < r.x1
        && z + hd + margin > r.z0 && z - hd - margin < r.z1;
}
/** Kotak (pusat + setengah ukuran) menyentuh lantai yang bisa diinjak player? */
function boxOnPlayfield(x, z, hw, hd, margin = 0) {
    return PLAY_RECTS.some(r => rectHit(r, x, z, hw, hd, margin));
}
/** Menyentuh aspal mana pun (lantai player ATAU jalan dekor)? */
function boxOnPavement(x, z, hw, hd, margin = 0) {
    return boxOnPlayfield(x, z, hw, hd, margin)
        || ROAD_RECTS.some(r => rectHit(r, x, z, hw, hd, margin));
}

let built = false, root = null, parkRoot = null, transport = null;
let staticBatch = [], sunrise = 0;
const blockers = [];
const shotWalls = [];          // pagar barat + daun gerbang: menghentikan peluru
let occluderCount = 0;
const semantic = new Map();
let rawMeshes = 0, inertRobotCount = 0, inertVehicleCount = 0;
let roadTreeCount = 0, propDetailCount = 0, rejectedOnRoad = 0;
let gateRig = null, gateLamps = [];
const gateLeafBlockers = [];
const gateDoor = { open: 0, target: 0, linger: 0, rig: null,
    cx: S12_GATE.leafX, cz: S12_GATE.z, ew: true,
    hx: S12_GATE.thickness / 2, hz: S12_GATE.halfSpan };
let gateSealed = false;

function tag(name, n = 1) { semantic.set(name, (semantic.get(name) || 0) + n); }

function materialSet() {
    return {
        asphalt: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        roadEdge: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        pale: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        gunmetal: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        leaf: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg,
            emissive: PAL.techDim, emissiveIntensity: EMISSIVE_MAX * 0.12 }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        dawn: new THREE.MeshBasicMaterial({ color: PAL.amberDim, transparent: true,
            opacity: 0, depthWrite: false, toneMapped: false }),
    };
}

function addMesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); rawMeshes++;
    return m;
}

function box(parent, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
    return addMesh(parent, new THREE.BoxGeometry(sx, sy, sz), mat,
        x, y, z, rx, ry, rz);
}

function staticBox(list, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; list.push(m); rawMeshes++;
    return m;
}

function blocker(x, z, hx, hz, top, standable = false) {
    const b = { x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(hx, hz), top, standable };
    blockers.push(b); return b;
}
/** Tembok pejal yang juga menghentikan peluru (pagar barat & daun gerbang). */
function wallBlocker(x, z, hx, hz, top) {
    const b = blocker(x, z, hx, hz, top); shotWalls.push(b); return b;
}

// Ruas AB memotong AABB? Uji slab, dipakai peluru vs pagar/gerbang — satu peluru
// menempuh puluhan unit per frame, jadi uji titik akan menembusnya.
function segHitsBox(x0, z0, x1, z1, b) {
    const dx = x1 - x0, dz = z1 - z0;
    let t0 = 0, t1 = 1;
    const slabs = [[x0, dx, b.x - b.hx, b.x + b.hx],
        [z0, dz, b.z - b.hz, b.z + b.hz]];
    for (const [p, d, lo, hi] of slabs) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
        let a = (lo - p) / d, c = (hi - p) / d;
        if (a > c) { const t = a; a = c; c = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) return false;
    }
    return true;
}

// ===== Boulevard pendekatan menuju gerbang taman ==========================
function buildAvenue(M, props) {
    const midX = (AVENUE.x0 + AVENUE.x1) / 2, len = AVENUE.x1 - AVENUE.x0;
    staticBox(props, M.asphalt, len, 0.8, 204, midX, -0.28, 0);
    staticBox(props, M.concrete, len, 0.55, 12, midX, 0.1, 0);   // median
    for (const z of [-78, -52, -26, 26, 52, 78])
        for (let x = AVENUE.x0 + 24; x <= AVENUE.x1 - 24; x += 32)
            staticBox(props, M.white, 15, 0.08, 0.8, x, 0.22, z);
    for (const z of [-108, 108]) {
        staticBox(props, M.roadEdge, len + 20, 1.2, 12, midX, 0, z);
        staticBox(props, M.asphalt, len + 20, 0.6, 34, midX, -0.4,
            z + Math.sign(z) * 22);
    }
    tag('deployment-avenue');
}

// ===== Gerbang Monas: satu-satunya jalan masuk, lalu tersegel =============
// Bukaan pagarnya milik taman bersama (`PARK_GATE`); yang dibangun di sini
// hanyalah daun, palang dan lampu statusnya.
function buildGate(M, props) {
    const G = S12_GATE, H = G.height;
    staticBox(props, M.steel, 6, 3, G.halfSpan * 2 + 24, G.x, H + 5, G.z);
    gateRig = buildSplitDoor(root, M.gunmetal, G.leafX, H / 2, G.z,
        G.thickness, H, G.halfSpan * 2);
    gateDoor.rig = gateRig;
    for (const leaf of gateRig.leaves) {
        for (let i = 0; i < 5; i++) {
            const bar = new THREE.Mesh(
                new THREE.BoxGeometry(G.thickness + 0.5, H - 5, 1.6), M.steel);
            bar.position.set(0, 0, (i - 2) * (G.halfSpan / 2.9));
            leaf.add(bar); rawMeshes++;
        }
        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(G.thickness + 0.7, 2.6, G.halfSpan * 0.86), M.hazard);
        stripe.position.y = -H / 2 + 3; leaf.add(stripe); rawMeshes++;
    }
    // Lampu status: instans material MILIK SENDIRI — satu instans bersama akan
    // mewarnai ulang setiap marka hazard begitu gerbang terbuka.
    gateLamps = [];
    for (const sign of [-1, 1]) {
        const mat = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
        const lamp = addMesh(root, new THREE.BoxGeometry(1.6, 2.6, 1.6), mat,
            G.x - 7, H - 2, G.z + sign * (G.halfSpan + 4));
        lamp.castShadow = false; gateLamps.push(lamp);
    }
    // Collider daun: mengikuti PERSIS daun yang digambar.
    for (let i = 0; i < 2; i++)
        gateLeafBlockers.push(wallBlocker(G.leafX, G.z,
            G.thickness / 2, gateRig.leafSpan / 2, H));
    // Dua ruas pagar barat di kiri-kanan bukaan: PLAY_RECTS sengaja tumpang
    // tindih di garis pagar supaya tak ada jahitan, jadi tembok inilah yang
    // menahan player di luar mulut gerbang.
    for (const sign of [-1, 1]) {
        const outer = sign * PARK.hz, inner = sign * G.halfSpan;
        wallBlocker(G.x, (outer + inner) / 2, 1.2,
            Math.abs(outer - inner) / 2, FENCE_H);
    }
    syncGateColliders();
    tag('monas-gate');
}

function syncGateColliders() {
    if (!gateRig) return;
    const off = splitDoorLeafOffset(gateRig, doorEasedOpen(gateDoor.open));
    for (let i = 0; i < gateLeafBlockers.length; i++) {
        gateLeafBlockers[i].z = S12_GATE.z + (i ? 1 : -1) * off;
        gateLeafBlockers[i].x = S12_GATE.leafX;
    }
    const shut = gateDoor.open < 0.02;
    for (const lamp of gateLamps) lamp.material.color.setHex(shut ? PAL.hazard : PAL.amber);
}

// ===== Infrastruktur countermand: empat pad hardline + vault legacy =======
function buildHardlineInfrastructure(M, props) {
    for (const s of S12_HARDLINE_STATIONS) {
        staticBox(props, M.dark, 39, 3, 39, s.x, 1.5, s.z, 0, Math.PI / 4);
        staticBox(props, M.concrete, 31, 2, 31, s.x, 3.5, s.z, 0, Math.PI / 4);
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4;
            staticBox(props, M.steel, 3, 7, 3,
                s.x + Math.cos(a) * 15, 6.5, s.z + Math.sin(a) * 15);
        }
        tag('hardline-station'); propDetailCount += 6;
    }
    const vx = S12_BOSS_CENTER.x, vz = S12_BOSS_CENTER.z;
    staticBox(props, M.dark, 82, 4, 68, vx, 1.7, vz);
    for (let i = 0; i < 6; i++) {
        staticBox(props, i % 2 ? M.gunmetal : M.concrete,
            70 - i * 7, 3, 58 - i * 6, vx, 3.5 + i * 2.6, vz);
        staticBox(props, M.hazard, 4, 3.3, 63 - i * 5,
            vx - 34 + i * 3.4, 4 + i * 2.6, vz);
    }
    tag('legacy-vault');
}

// ===== Sisa perang di sepanjang boulevard =================================
function vehicle(M, x, z, kind, yaw, damaged = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
    const long = kind === 'bus' ? 36 : kind === 'truck' ? 31 : 22;
    const wide = kind === 'bus' ? 11 : 10;
    box(g, damaged ? M.dark : M.gunmetal, long, 5, wide, 0, 5, 0);
    box(g, kind === 'bus' ? M.concrete : M.pale, long * 0.62, 5.5,
        wide * 0.86, -long * 0.06, 9, 0, 0, 0, damaged ? 0.06 : 0);
    for (const side of [-1, 1]) for (const ax of [-long * 0.3, long * 0.28])
        addMesh(g, new THREE.CylinderGeometry(2.4, 2.4, 1.6, 10), M.dark,
            ax, 2.5, side * wide * 0.48, Math.PI / 2);
    for (const side of [-1, 1]) box(g, M.glass, long * 0.45, 2.4, 0.6,
        -long * 0.03, 9.8, side * (wide / 2 + 0.2));
    box(g, M.hazard, 2, 1.1, wide + 0.4, -long / 2 - 0.2, 5.5, 0);
    // Berdiri sendiri (dilas ke dalam dirinya) supaya bisa MEMUDAR saat menutupi
    // player/robot di boulevard, tapi tetap segelintir draw call.
    const node = mergeObjectInPlace(g);
    root.add(node);
    registerOccluder(STAGE12_LIGHTS_KEY, node,
        { x, z, radius: (long + wide) / 4, top: 12.5 });
    occluderCount++;
    inertVehicleCount++; propDetailCount += 9;
}

function buildInertVehicles(M) {
    // Diparkir menyamping: sumbu panjangnya di z, jadi setengah-kedalamannya 19
    // dan setengah-lebarnya 6 — diuji dengan tapak ITU, bukan kotak buta.
    for (let i = 0; i < 24; i++) {
        const side = i % 2 ? 1 : -1;
        const x = AVENUE.x0 + 40 + i * 34;
        const z = side * (128 + (i % 3) * 13);
        if (boxOnPlayfield(x, z, 6, 19, 4)) { rejectedOnRoad++; continue; }
        vehicle(M, x, z, i % 7 === 0 ? 'bus' : i % 4 === 0 ? 'truck' : 'car',
            side * (Math.PI / 2 + (i % 3 - 1) * 0.08), i % 6 === 0);
    }
    tag('abandoned-vehicle', inertVehicleCount);
}

function buildRoadTrees(M) {
    // Pohon hujan berdiri sendiri karena tajuknya HARUS memudar saat menutupi
    // boulevard. Berjajar di luar koridor jalan kaki.
    for (let i = 0; i < 14; i++) {
        const side = i % 2 ? 1 : -1;
        const x = AVENUE.x0 + 60 + (i >> 1) * 118;
        const z = side * (248 + (i % 3) * 15);
        if (boxOnPlayfield(x, z, 22, 22, 0)) { rejectedOnRoad++; continue; }
        const trunkMat = M.wood.clone(); trunkMat.transparent = true;
        const crownMat = M.leaf.clone(); crownMat.transparent = true;
        const tree = new THREE.Group(); tree.position.set(x, 0, z); root.add(tree);
        addMesh(tree, new THREE.CylinderGeometry(3.6, 5.4, 31, 8), trunkMat, 0, 15.5, 0);
        addMesh(tree, new THREE.SphereGeometry(19 + i % 3 * 2, 9, 7), crownMat, 0, 38, 0);
        addMesh(tree, new THREE.SphereGeometry(13, 8, 6), crownMat,
            side * 10, 35, (i % 2 ? 1 : -1) * 6);
        blocker(x, z, 5.5, 5.5, 31);
        registerOccluder(STAGE12_LIGHTS_KEY, tree,
            { x, z, radius: 26, top: 58, clone: false });
        occluderCount++; roadTreeCount++; propDetailCount += 3;
    }
    tag('occluder-tree', roadTreeCount);
}

function buildInertArmy(M) {
    // Bangkai pasukan G.A.R.U.D.A: DEKOR murni (tanpa blocker, tanpa objek AI),
    // dan tidak satu pun berdiri di aspal yang dilalui player.
    const spots = [];
    for (let i = 0; i < 320 && spots.length < 240; i++) {
        const col = i % 20, row = Math.floor(i / 20);
        const x = AVENUE.x0 + 30 + col * 44 + (row % 3) * 13;
        const z = (row % 2 ? 1 : -1) * (300 + (row % 4) * 20);
        if (boxOnPavement(x, z, 4, 4, 5)) { rejectedOnRoad++; continue; }
        spots.push([x, z, i]);
    }
    const N = spots.length;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.gunmetal, N);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.dark, N);
    const limb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.steel, N * 2);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
        const [x, z, seed] = spots[i];
        q.setFromAxisAngle(axis, ((seed * 37) % 17 - 8) * 0.025);
        matrix.compose(pos.set(x, 7.8, z), q, scale.set(6.2, 10.5, 4.8));
        body.setMatrixAt(i, matrix);
        matrix.compose(pos.set(x, 15.2, z), q, scale.set(4.2, 3.4, 4.2));
        head.setMatrixAt(i, matrix);
        for (const side of [-1, 1]) {
            matrix.compose(pos.set(x, 4.0, z + side * 3), q, scale.set(2, 8, 2.4));
            limb.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), matrix);
        }
    }
    for (const inst of [body, head, limb]) {
        inst.instanceMatrix.needsUpdate = true; inst.castShadow = true;
        root.add(inst); rawMeshes++;
    }
    inertRobotCount = N; tag('inert-army-shell', N);
}

// Puing SENGAJA boleh tergeletak di bahu jalan dekor — kota yang hancur memang
// begitu — tapi TIDAK PERNAH di lantai yang bisa diinjak player.
function buildDamagedPerimeter(M, props) {
    let rubble = 0;
    for (let i = 0; i < 120; i++) {
        const x = AVENUE.x0 + 20 + (i % 60) * 14;
        const z = (i % 2 ? 1 : -1) * (180 + (i * 19) % 50);
        if (boxOnPlayfield(x, z, 8, 8, 4)) { rejectedOnRoad++; continue; }
        staticBox(props, i % 3 ? M.concrete : M.gunmetal,
            5 + i % 4 * 2, 2 + i % 5, 4 + (i * 7) % 8,
            x, 1 + i % 3, z, i * 0.08, i * 0.17, i * 0.11);
        rubble++; propDetailCount++;
    }
    let craters = 0;
    for (let i = 0; i < 16; i++) {
        const x = AVENUE.x0 + 70 + i * 52;
        const z = (i % 2 ? 1 : -1) * (196 + i % 3 * 18);
        if (boxOnPlayfield(x, z, 17, 17, 3)) { rejectedOnRoad++; continue; }
        const crater = addMesh(root, new THREE.RingGeometry(9 + i % 3 * 3,
            14 + i % 3 * 3, 18), M.dark, x, 0.5, z, -Math.PI / 2);
        crater.castShadow = false; craters++;
    }
    tag('damaged-perimeter'); tag('rubble', rubble); tag('crater', craters);
}

// ===== Transport hero =====================================================
const T_AIR = Object.freeze({ x: S12_START.x - 160, y: 95, z: -120 });
// Cukup jauh dari player agar ia berdiri DI BAWAH ujung sayap, bukan di dalam
// sponson roda: jaraknya diuji terhadap `lowHalfZ` yang diukur rig itu sendiri.
const T_LAND = Object.freeze({ x: S12_START.x - 76, z: -8 });

function buildTransport() {
    transport = buildStage12TransportMesh();
    root.add(transport.group);
    resetStage12Transport();
    let n = 0; transport.group.traverse(o => { if (o.isMesh) n++; });
    rawMeshes += n; propDetailCount += n;
    tag('return-transport');
}

function buildWorld() {
    // TAMAN BERSAMA lebih dulu: Stage 12 bermain DI DALAMNYA, tidak di sebelahnya.
    parkRoot = ensureParkWorld();
    registerCampaignWorldRoot({
        key: MONAS_PARK_KEY, root: parkRoot,
        bounds: { x0: -1800, x1: 1800, z0: -1800, z1: 1800 },
        lightsKey: STAGE12_LIGHTS_KEY,
        warmupViews: [S12_MONAS, S12_BOSS_CENTER],
    });

    root = new THREE.Group(); root.name = 'campaign-stage12-approach'; scene.add(root);
    const M = materialSet(), props = [];
    buildTransport();
    buildAvenue(M, props); buildGate(M, props);
    buildHardlineInfrastructure(M, props);
    buildInertVehicles(M); buildRoadTrees(M);
    buildDamagedPerimeter(M, props); buildInertArmy(M);
    staticBatch = addMergedStatic(root, props);
    // Lapisan fajar ada sejak boot dan hanya berubah opacity.
    const dawn = addMesh(root, new THREE.PlaneGeometry(1900, 620), M.dawn,
        420, 240, -900, 0, 0, 0);
    dawn.name = 'Stage12-Sunrise-Horizon'; dawn.castShadow = false;
    root.userData.dawn = dawn;
    registerCampaignWorldRoot({
        key: STAGE12_LIGHTS_KEY, root, bounds: { ...S12_BOUNDS },
        lightsKey: STAGE12_LIGHTS_KEY,
        warmupViews: [S12_START, S12_ARENA_ENTRY],
    });
}

export function ensureStage12World() {
    if (!built) { built = true; buildWorld(); }
    return root;
}

/** Kunci root yang harus AKTIF saat Stage 12 dimainkan: jalannya DAN tamannya. */
export const STAGE12_ROOT_KEYS = Object.freeze([STAGE12_LIGHTS_KEY, MONAS_PARK_KEY]);

export function stage12Walk(x, z, radius = 0) {
    for (const r of PLAY_RECTS)
        if (x >= r.x0 + radius && x <= r.x1 - radius
            && z >= r.z0 + radius && z <= r.z1 - radius) return true;
    return false;
}

// Tabrakan di dalam taman memakai predikat SURVIVAL — Monas, pohon dan bak air
// mancur yang sama persis dengan yang dilihat pemain Survival.
export function resolveStage12World(pos, radius, feetY = 0, oldX = pos.x, oldZ = pos.z) {
    resolveBlockers(pos, radius, feetY, blockers);
    resolveMonas(pos, oldX, oldZ, radius);
    // JARING PENGAMAN: `resolveMonas` menyusur pakai posisi frame SEBELUMNYA, dan
    // kalau pemanggil tidak punya (clamp robot generik memanggil resolve tanpa
    // old-position) ia justru MEMBEKUKAN entitas di dalam box alih-alih
    // mengeluarkannya. Dorong keluar lewat sisi terdekat kalau itu terjadi.
    const h = MONAS_HALF + radius;
    if (Math.abs(pos.x) < h && Math.abs(pos.z) < h) {
        if (h - Math.abs(pos.x) <= h - Math.abs(pos.z))
            pos.x = (pos.x >= 0 ? 1 : -1) * h;
        else pos.z = (pos.z >= 0 ? 1 : -1) * h;
    }
    resolveObstacles(pos, radius, feetY);
    return pos;
}

export function stage12GroundHeight(x, z, feetY = 0) {
    return groundHeightAt(x, z, feetY);
}

export function clampStage12Point(pos, radius = 0, oldX = pos.x, oldZ = pos.z) {
    slideWalk(stage12Walk, pos, oldX, oldZ, radius);
    resolveStage12World(pos, radius, 0, oldX, oldZ); return pos;
}

export function clampStage12Boss(pos) {
    pos.x = clamp(pos.x, S12_BOSS_BOUNDS.x0, S12_BOSS_BOUNDS.x1);
    pos.z = clamp(pos.z, S12_BOSS_BOUNDS.z0, S12_BOSS_BOUNDS.z1);
    // Didorong keluar dari monumen lewat sisi terdekat. Boss boleh ke mana pun
    // di dalam taman KECUALI menembus Monas — dan Stage 12 tak pernah merusaknya.
    const r = S12_BOSS_AVOID.radius;
    const dx = pos.x - S12_BOSS_AVOID.x, dz = pos.z - S12_BOSS_AVOID.z;
    const d = Math.hypot(dx, dz);
    if (d < r) {
        if (d < 1e-4) pos.x = S12_BOSS_AVOID.x + r;
        else { pos.x = S12_BOSS_AVOID.x + dx / d * r; pos.z = S12_BOSS_AVOID.z + dz / d * r; }
    }
    return pos;
}

export function stage12BulletBlocked(b) {
    const x = b.mesh.position.x, z = b.mesh.position.z;
    if (!stage12Walk(x, z, 0)) return true;
    if (segPointDist2(b.px, 0, b.pz, x, 0, z, 0, 0, 0) < S12_MONAS.radius ** 2) return true;
    if (segmentHitsFountain(b.px, b.pz, x, z)) return true;
    // Pagar barat dan daun gerbang tertutup menghentikan tembakan juga: ruas
    // DISAPU, bukan diuji sebagai titik, karena satu peluru menempuh puluhan
    // unit per frame dan akan menembus pelat setipis daun gerbang.
    for (const w of shotWalls) if (segHitsBox(b.px, b.pz, x, z, w)) return true;
    return false;
}

export function stage12BlastBlocked(x0, z0, x1, z1) {
    if (segPointDist2(x0, 0, z0, x1, 0, z1, 0, 0, 0) < S12_MONAS.radius ** 2) return true;
    for (const w of shotWalls) if (segHitsBox(x0, z0, x1, z1, w)) return true;
    return false;
}

// ===== Gerbang: dibuka saat mendekat, lalu TERSEGEL selamanya =============
export function updateStage12Gate(dt, target) {
    if (!gateRig) return;
    updateDoorMotion(gateDoor, dt, gateSealed ? 0 : clamp(target, 0, 1));
    syncGateColliders();
}

export function sealStage12Gate() { gateSealed = true; }

export function resetStage12Gate() {
    gateSealed = false; gateDoor.open = 0; gateDoor.target = 0; gateDoor.linger = 0;
    if (gateRig) { updateDoorMotion(gateDoor, 1e3, 0); syncGateColliders(); }
}

export function stage12GateState() {
    return { x: S12_GATE.x, z: S12_GATE.z, span: S12_GATE.halfSpan * 2,
        open: gateDoor.open, target: gateDoor.target, sealed: gateSealed,
        shut: gateDoor.open < 0.02 };
}

/** Player sudah melewati garis gerbang, masuk ke taman? */
export function stage12InsidePark(x, z) {
    return x > S12_GATE.x + 6 && Math.abs(z) < PARK.hz;
}

export function stage12MonasDistance(x, z) { return Math.hypot(x, z); }

export function resetStage12Transport() {
    if (!transport) return;
    transport.group.visible = true;
    transport.group.position.set(T_AIR.x, T_AIR.y, T_AIR.z);
    transport.group.rotation.set(0, Math.PI / 2, 0);
    resetStage12TransportRig(transport);
}

export function updateStage12Transport(dt, progress = 0, deployed = false) {
    if (!transport) return;
    const k = clamp(progress, 0, 1), smooth = k * k * (3 - 2 * k);
    transport.group.position.x = T_AIR.x + smooth * (T_LAND.x - T_AIR.x);
    transport.group.position.z = T_AIR.z + smooth * (T_LAND.z - T_AIR.z);
    // Ketinggian akhir DITURUNKAN dari roda pesawat itu sendiri, bukan diketik:
    // memperpanjang kaki roda tidak boleh menenggelamkan badannya ke aspal.
    transport.group.position.y = T_AIR.y + smooth * (transport.restY - T_AIR.y);
    // Hidung sedikit terangkat dan badan miring saat masih melayang, lalu rata
    // persis ketika roda menapak — flare pendaratan, bukan turun tegak lurus.
    transport.group.rotation.z = (1 - smooth) * -0.09;
    transport.group.rotation.x = (1 - smooth) * 0.05;
    transport.group.rotation.y = Math.PI / 2 - smooth * 0.08;
    updateStage12TransportRig(transport, dt, k, deployed);
}

export function hideStage12Transport() {
    if (transport) transport.group.visible = false;
}

export function setStage12Sunrise(k) {
    sunrise = clamp(k, 0, 1);
    const dawn = root?.userData?.dawn;
    if (dawn) dawn.material.opacity = sunrise * 0.68;
}

export function updateStage12World(dt) {
    updateStageOccluders(STAGE12_LIGHTS_KEY, dt);
}

export function resetStage12World() {
    setStage12Sunrise(0); resetStage12Transport(); resetStage12Gate();
    // Campaign tidak pernah merusak Monas — tapi run Survival sebelumnya bisa
    // saja merobohkannya, dan monumennya kini SATU objek yang sama.
    resetMonasCollapse();
    resetStageOccluders(STAGE12_LIGHTS_KEY);
}

function segmentClearOfMonas(path, extra = 0) {
    return segPointDist2(path.x0, 0, path.z0, path.x1, 0, path.z1, 0, 0, 0)
        >= (S12_MONAS.radius + extra) ** 2;
}

function countPointLights(node) {
    let n = 0;
    if (node) node.traverse(o => { if (o.isPointLight) n++; });
    return n;
}

function countObjects(node) {
    let n = 0;
    if (node) node.traverse(() => { n++; });
    return n;
}

// Monas benar-benar pejal? DIPROBE lewat predikat yang dipakai gameplay, bukan
// dinyatakan — sebuah `true` yang diketik berhenti menjadi bukti begitu jalur
// tabrakannya berubah.
function monasSolidProbe() {
    const p = { x: 0, y: 0, z: 0 };
    resolveStage12World(p, 5, 0, S12_MONAS.radius + 40, 0);
    return Math.hypot(p.x, p.z) > 1e-6;
}

// Sensus penempatan: dihitung ULANG dari collider yang benar-benar dibangun,
// bukan dari niat pembuatnya. NOL adalah kontraknya.
function playfieldAudit() {
    let onAvenue = 0;
    for (const b of blockers) {
        const onRoad = b.x - b.hx < AVENUE.x1 && b.x + b.hx > AVENUE.x0
            && Math.abs(b.z) - b.hz < AVENUE.z1;
        // Pagar barat dan daun gerbang MEMANG berdiri di ujung boulevard: itulah
        // batas yang digambar. Sisanya tidak boleh ada di aspal sama sekali.
        if (onRoad && b.x < S12_GATE.x - 12) onAvenue++;
    }
    return { blockersOnAvenue: onAvenue, rejectedOnRoad,
        playRects: PLAY_RECTS.length, roadRects: ROAD_RECTS.length,
        westCorridor: { ...PARK_WEST_CORRIDOR } };
}

export function stage12WorldDebug() {
    return {
        built, root: root?.name || null, visible: !!root?.visible,
        origin: { ...S12_ORIGIN }, bounds: { ...S12_BOUNDS },
        start: { ...S12_START }, arenaEntry: { ...S12_ARENA_ENTRY },
        bossCenter: { ...S12_BOSS_CENTER }, bossBounds: { ...S12_BOSS_BOUNDS },
        rootKeys: [...STAGE12_ROOT_KEYS],
        // TAMAN BERSAMA — bukan salinan. Angkanya dibaca dari modul Survival.
        park: {
            shared: true, source: 'scenes/survival/world.js',
            root: parkRoot?.name || null, visible: !!parkRoot?.visible,
            hx: PARK.hx, hz: PARK.hz, fenceH: FENCE_H, roadW: ROAD_W,
            monasHalf: MONAS_HALF, fountain: { ...FOUNTAIN },
            gate: { ...PARK_GATE }, westCorridor: { ...PARK_WEST_CORRIDOR },
            reserved: PARK_RESERVED.map(k => ({ ...k })),
            reservedClearOfTrees: PARK_RESERVED.every(k =>
                treeColliders.every(t => Math.hypot(t.x - k.x, t.z - k.z) >= k.r)),
            trees: treeColliders.length, objects: countObjects(parkRoot),
            pointLights: countPointLights(parkRoot),
        },
        gate: stage12GateState(),
        monas: { ...S12_MONAS, shared: true, campaignOnly: false,
            campaignDamages: false, destructible: false, solid: monasSolidProbe() },
        chargeLanes: S12_CHARGE_LANES.map(p => ({ ...p,
            clearOfMonas: segmentClearOfMonas(p, 34) })),
        hardlineStations: S12_HARDLINE_STATIONS.map(s => ({ ...s })),
        playfield: playfieldAudit(),
        walkRects: PLAY_RECTS.map(r => ({ ...r })),
        census: {
            inertRobots: inertRobotCount, liveInertRobots: 0,
            inertVehicles: inertVehicleCount, roadTrees: roadTreeCount,
            detailedProps: propDetailCount,
            rubble: semantic.get('rubble') || 0,
            craters: semantic.get('crater') || 0,
        },
        semantic: Object.fromEntries(semantic),
        batching: { sourceMeshes: rawMeshes, batches: staticBatch.length },
        transport: transport ? { ...stage12TransportDebug(transport),
            visible: transport.group.visible,
            // Jarak titik mendarat ke titik start player, di sumbu yang benar:
            // rotation.y = PI/2 memetakan BENTANG SAYAP (z lokal) ke x dunia.
            landing: { x: T_LAND.x, z: T_LAND.z,
                startClearance: Math.abs(S12_START.x - T_LAND.x) } } : null,
        blockers: { count: blockers.length, shotWalls: shotWalls.length },
        occluders: occlusionDebug(STAGE12_LIGHTS_KEY),
        sunrise, pointLights: countPointLights(root), deterministic: true,
        // Taman Survival dipakai APA ADANYA, dan Campaign tidak pernah mengubahnya.
        survivalParkShared: true, survivalStateMutated: false,
    };
}
