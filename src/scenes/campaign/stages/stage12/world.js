// Stage 12 — campaign-only Medan Merdeka / Monas world.
// Nothing in this module imports or mutates the Survival monument. The Monas
// rig, collision, inert army, transport, skyline and ending lighting all belong
// exclusively to this root and can safely coexist with every other world.

import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStatic, mergeObjectInPlace } from '../../../../utils/meshBatch.js';
import { slideWalk, resolveBlockers } from '../../../../utils/collision.js';
import { segPointDist2, clamp } from '../../../../utils/math.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import {
    registerOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';

export const STAGE12_LIGHTS_KEY = 'campaign-12';
export const S12_ORIGIN = Object.freeze({ x: 430000, z: 0 });
export const S12_START = Object.freeze({ x: S12_ORIGIN.x - 760, z: 0 });
export const S12_ARENA_ENTRY = Object.freeze({ x: S12_ORIGIN.x - 120, z: 0 });
export const S12_BOSS_CENTER = Object.freeze({ x: S12_ORIGIN.x + 38, z: 0 });
export const S12_MONAS = Object.freeze({ x: S12_ORIGIN.x + 300, z: 0, radius: 54 });
export const S12_BOUNDS = Object.freeze({
    x0: S12_ORIGIN.x - 930, x1: S12_ORIGIN.x + 930,
    z0: -680, z1: 680,
});
export const S12_ARENA_BOUNDS = Object.freeze({
    x0: S12_ORIGIN.x - 255, x1: S12_ORIGIN.x + 565,
    z0: -390, z1: 390, groundY: 0,
});
export const S12_BOSS_BOUNDS = Object.freeze({
    x0: S12_ORIGIN.x - 165, x1: S12_ORIGIN.x + 145,
    z0: -205, z1: 205,
});

// Authored tangential/vertical lanes stay west of the monument. Both endpoint
// circles (boss body included) clear the Monas base by a wide margin.
export const S12_CHARGE_LANES = Object.freeze([
    Object.freeze({ x0: S12_ORIGIN.x - 150, z0: -155,
        x1: S12_ORIGIN.x + 128, z1: -155 }),
    Object.freeze({ x0: S12_ORIGIN.x + 128, z0: 155,
        x1: S12_ORIGIN.x - 150, z1: 155 }),
    Object.freeze({ x0: S12_ORIGIN.x - 92, z0: -195,
        x1: S12_ORIGIN.x - 92, z1: 195 }),
    Object.freeze({ x0: S12_ORIGIN.x + 82, z0: 195,
        x1: S12_ORIGIN.x + 82, z1: -195 }),
]);

export const S12_HARDLINE_STATIONS = Object.freeze([0, 1, 2, 3].map(i => {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    return Object.freeze({ x: S12_BOSS_CENTER.x + Math.cos(a) * 128,
        z: S12_BOSS_CENTER.z + Math.sin(a) * 128, index: i });
}));

let built = false, root = null, transport = null, monasRig = null;
let staticBatch = [], sunrise = 0;
const blockers = [];
let occluderCount = 0;   // prop yang didaftarkan ke utility/occlusion.js
const semantic = new Map();
let rawMeshes = 0, inertRobotCount = 0, inertVehicleCount = 0;
let treeCount = 0, cityBuildingCount = 0, propDetailCount = 0;

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
        grass: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        grassDark: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg,
            emissive: PAL.techDim, emissiveIntensity: EMISSIVE_MAX * 0.12 }),
        window: new THREE.MeshLambertMaterial({ color: PAL.amberDim,
            emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * 0.28 }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        amber: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
        red: new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }),
        water: new THREE.MeshLambertMaterial({ color: PAL.techDim, transparent: true,
            opacity: 0.64, depthWrite: false }),
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

function buildSurfaces(M, props) {
    const ground = addMesh(root, new THREE.PlaneGeometry(1900, 1380), M.grassDark,
        S12_ORIGIN.x, -0.8, 0, -Math.PI / 2);
    ground.receiveShadow = true; ground.castShadow = false;
    // National-axis deployment avenue: divided six-lane boulevard with service
    // shoulders and deliberate vehicle-free player corridor.
    staticBox(props, M.asphalt, 760, 0.8, 154,
        S12_ORIGIN.x - 500, -0.28, 0);
    staticBox(props, M.concrete, 760, 0.55, 12,
        S12_ORIGIN.x - 500, 0.1, 0);
    for (const z of [-66, -43, -20, 20, 43, 66]) for (let x = -840; x <= -180; x += 32)
        staticBox(props, M.white, 15, 0.08, 0.8,
            S12_ORIGIN.x + x, 0.22, z);
    for (const z of [-83, 83]) staticBox(props, M.roadEdge, 770, 1.2, 12,
        S12_ORIGIN.x - 500, 0, z);
    // Medan Merdeka ring road and civic plaza.
    staticBox(props, M.asphalt, 840, 0.75, 690,
        S12_ORIGIN.x + 170, -0.32, 0);
    staticBox(props, M.grass, 682, 0.5, 532,
        S12_ORIGIN.x + 170, 0.08, 0);
    staticBox(props, M.concrete, 570, 0.38, 420,
        S12_ORIGIN.x + 190, 0.34, 0);
    staticBox(props, M.pale, 410, 0.35, 330,
        S12_ORIGIN.x + 208, 0.58, 0);
    // Ring road lane markings and plaza radial joints make the large surface
    // read as authored civic space rather than one placeholder slab.
    for (const z of [-305, -280, 280, 305]) for (let x = -230; x <= 580; x += 42)
        staticBox(props, M.white, 20, 0.08, 0.7,
            S12_ORIGIN.x + x, 0.16, z);
    for (const x of [-224, -198, 538, 564]) for (let z = -260; z <= 260; z += 42)
        staticBox(props, M.white, 0.7, 0.08, 20,
            S12_ORIGIN.x + x, 0.17, z);
    for (let r = 70; r <= 205; r += 45) {
        const ring = addMesh(root, new THREE.RingGeometry(r - 0.8, r + 0.8, 64),
            M.concrete, S12_MONAS.x, 0.82, S12_MONAS.z, -Math.PI / 2);
        ring.castShadow = false;
    }
    tag('deployment-avenue'); tag('ring-road'); tag('monas-plaza');
}

function buildMonas(M, props) {
    const g = new THREE.Group(); g.name = 'Campaign-Monas-Stable'; root.add(g);
    g.position.set(S12_MONAS.x, 0, S12_MONAS.z);
    // Museum base, stepped apron and raised cup: a dedicated detailed landmark,
    // never the mutable Survival monument.
    for (let i = 0; i < 5; i++) box(g, i % 2 ? M.concrete : M.pale,
        108 - i * 10, 2.2, 108 - i * 10, 0, 1.1 + i * 2.1, 0);
    box(g, M.dark, 72, 6, 72, 0, 12, 0);
    for (const side of [-1, 1]) {
        box(g, M.pale, 12, 11, 76, side * 38, 15, 0);
        box(g, M.pale, 76, 11, 12, 0, 15, side * 38);
    }
    // Tapered obelisk assembled in authored tiers, not a single giant box.
    const tiers = [
        [24, 38, 24, 20], [20, 46, 20, 62], [16, 52, 16, 111],
        [12, 54, 12, 164], [9, 42, 9, 212],
    ];
    for (const [sx, sy, sz, y] of tiers) {
        const shaft = box(g, M.pale, sx, sy, sz, 0, y + sy / 2, 0);
        // Fine vertical shadow lines and shallow national-stone seams.
        for (const side of [-1, 1]) {
            box(g, M.concrete, 0.65, sy - 2, sz + 0.4,
                side * sx * 0.34, y + sy / 2, 0);
            box(g, M.concrete, sx + 0.4, sy - 2, 0.65,
                0, y + sy / 2, side * sz * 0.34);
        }
        void shaft;
    }
    addMesh(g, new THREE.CylinderGeometry(12, 8, 8, 8), M.steel,
        0, 241, 0);
    for (let i = 0; i < 7; i++) {
        const flame = addMesh(g, new THREE.ConeGeometry(4.6 - i * 0.35,
            18 - i * 1.3, 6), i % 2 ? M.amber : M.window,
            Math.sin(i * 1.7) * 2.8, 252 + i * 1.9, Math.cos(i * 1.4) * 2.2,
            0, i * 0.52, (i - 3) * 0.055);
        flame.castShadow = false;
    }
    // Entrance stairs, museum vents, guard rails and flag details.
    for (let x = -28; x <= 28; x += 7) {
        box(g, M.dark, 3.8, 2, 1.6, x, 16, -37.1);
        box(g, M.dark, 3.8, 2, 1.6, x, 16, 37.1);
    }
    for (let i = 0; i < 9; i++) box(g, M.concrete,
        46 - i * 3.5, 0.7, 7, -42 - i * 2.1, 0.6 + i * 0.6, 0);
    for (const z of [-46, 46]) for (let x = -42; x <= 42; x += 12) {
        box(g, M.steel, 0.8, 4, 0.8, x, 7, z);
        box(g, M.steel, 11, 0.7, 0.7, x + 5.5, 8.6, z);
    }
    const welded = mergeObjectInPlace(g);
    if (welded !== g) { root.remove(g); root.add(welded); }
    // Monas adalah penghalang TERBESAR di stage ini: berdiri di tengah arena
    // boss, jadi setiap kali player/robot berada di sisi timur-lautnya ia
    // menelan mereka sepenuhnya. Ikut memudar seperti prop lain.
    registerOccluder(STAGE12_LIGHTS_KEY, welded,
        { x: S12_MONAS.x, z: S12_MONAS.z, radius: S12_MONAS.radius, top: 260 });
    occluderCount++;
    blocker(S12_MONAS.x, S12_MONAS.z, S12_MONAS.radius, S12_MONAS.radius, 245);
    monasRig = { group: welded, stable: true, campaignOnly: true };
    tag('monas'); tag('museum-base'); tag('stable-flame');
    propDetailCount += 90;
    void props;
}

function buildPark(M, props) {
    // Formal north/south park lawns, drainage, footpaths, benches and tree rows.
    for (const side of [-1, 1]) {
        const z = side * 445;
        staticBox(props, M.grass, 720, 0.6, 190,
            S12_ORIGIN.x + 120, -0.05, z);
        staticBox(props, M.water, 680, 0.16, 11,
            S12_ORIGIN.x + 120, 0.3, z - side * 70);
        for (let x = -210; x <= 500; x += 52) {
            staticBox(props, M.concrete, 32, 0.24, 5,
                S12_ORIGIN.x + x, 0.35, z - side * 34);
            // Proper bench: concrete feet, timber seat and backrest slats.
            staticBox(props, M.concrete, 2, 4, 2,
                S12_ORIGIN.x + x - 8, 2, z - side * 25);
            staticBox(props, M.concrete, 2, 4, 2,
                S12_ORIGIN.x + x + 8, 2, z - side * 25);
            staticBox(props, M.wood, 22, 1.4, 5,
                S12_ORIGIN.x + x, 4.2, z - side * 25);
            staticBox(props, M.wood, 22, 6, 1.1,
                S12_ORIGIN.x + x, 7.2, z - side * 28);
            propDetailCount += 6;
        }
    }
    // Deterministic instanced tropical canopy with separate trunks/crowns.
    const N = 168, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.5, 1, 7),
        M.wood, N), crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), M.grass, N);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
        const side = i % 2 ? 1 : -1;
        const row = (i >> 1) % 4;
        const col = (i >> 3);
        const x = S12_ORIGIN.x - 250 + (col % 24) * 32 + ((row * 17) % 21);
        const z = side * (374 + row * 43 + (col % 3) * 5);
        const h = 15 + (i * 7 % 10), r = 8 + (i * 11 % 6);
        matrix.compose(pos.set(x, h / 2, z), q, scale.set(2.3, h, 2.3));
        trunk.setMatrixAt(i, matrix);
        matrix.compose(pos.set(x, h + r * 0.48, z), q,
            scale.set(r, r * 1.18, r)); crown.setMatrixAt(i, matrix);
    }
    trunk.instanceMatrix.needsUpdate = true; crown.instanceMatrix.needsUpdate = true;
    trunk.castShadow = crown.castShadow = true; root.add(trunk, crown);
    rawMeshes += 2; treeCount = N; tag('park-tree', N); tag('park-bench', 28);

    // Foreground rain trees are individual only because their crowns fade when
    // they occlude the wooded approach. They form staggered edges, leaving two
    // broad lateral flanking routes between trunks.
    for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1;
        const x = S12_ORIGIN.x - 295 + (i >> 1) * 56;
        const z = side * (273 + (i % 3) * 13);
        const trunkMat = M.wood.clone(); trunkMat.transparent = true;
        const crownMat = M.grass.clone(); crownMat.transparent = true;
        const tree = new THREE.Group(); tree.position.set(x, 0, z); root.add(tree);
        addMesh(tree, new THREE.CylinderGeometry(3.6, 5.4, 31, 8), trunkMat,
            0, 15.5, 0);
        addMesh(tree, new THREE.SphereGeometry(19 + i % 3 * 2, 9, 7), crownMat,
            0, 38, 0);
        addMesh(tree, new THREE.SphereGeometry(13, 8, 6), crownMat,
            side * 10, 35, (i % 2 ? 1 : -1) * 6);
        blocker(x, z, 5.5, 5.5, 31);
        // Material sudah instans milik pohon ini sendiri (clone di atas).
        registerOccluder(STAGE12_LIGHTS_KEY, tree,
            { x, z, radius: 26, top: 58, clone: false });
        occluderCount++;
        treeCount++; propDetailCount += 3;
    }
    tag('occluder-tree', 10); tag('lateral-flanking-route', 2);
}

function detailedBuilding(props, M, spec) {
    const { x, z, w, d, h, kind, damage = 0 } = spec;
    const body = kind === 'government' ? M.pale : kind === 'ruko' ? M.concrete : M.gunmetal;
    staticBox(props, M.dark, w + 8, 3, d + 8, x, 1.5, z);
    staticBox(props, body, w, h, d, x, h / 2 + 3, z, 0, damage * 0.025, damage * 0.018);
    const floors = Math.max(2, Math.floor(h / 17));
    for (let f = 1; f < floors; f++) {
        const y = 3 + f * h / floors;
        staticBox(props, M.dark, w + 1, 1, d + 1, x, y, z);
        for (const face of [-1, 1]) {
            staticBox(props, M.window, Math.max(6, w * 0.72), 5.5, 0.7,
                x, y + 4, z + face * (d / 2 + 0.4));
            staticBox(props, M.window, 0.7, 5.5, Math.max(6, d * 0.72),
                x + face * (w / 2 + 0.4), y + 4, z);
        }
    }
    if (kind === 'government') {
        staticBox(props, M.pale, w * 0.72, 7, d * 0.72, x, h + 6.5, z);
        for (let c = -2; c <= 2; c++) staticBox(props, M.steel, 2, 17, 2,
            x + c * w * 0.11, 11.5, z - d / 2 - 3);
        tag('government-building');
    } else if (kind === 'ruko') {
        staticBox(props, M.hazard, w + 3, 2.5, 6, x, h * 0.34, z - d / 2 - 3);
        for (let s = -1; s <= 1; s++) staticBox(props, M.dark, 2, h * 0.28, 1,
            x + s * w * 0.28, h * 0.16 + 3, z - d / 2 - 3.6);
        tag('ruko-building');
    } else {
        const antenna = staticBox(props, M.steel, 2, 18, 2, x, h + 12, z);
        antenna.castShadow = false; tag('office-building');
    }
    if (damage) {
        for (let i = 0; i < 7; i++) staticBox(props,
            i % 2 ? M.dark : M.concrete, 5 + i % 3, 2 + i % 4, 4 + (i * 2) % 5,
            x + w * 0.36 + (i % 3) * 5, 1 + i % 2, z - d * 0.35 + i * 3,
            i * 0.07, i * 0.13, i * 0.09);
        tag('damaged-building'); propDetailCount += 7;
    }
    cityBuildingCount++;
}

function buildSkyline(M, props) {
    const specs = [];
    // Government frontage along the north/south horizon.
    for (let i = 0; i < 12; i++) {
        const side = i % 2 ? 1 : -1;
        specs.push({ x: S12_ORIGIN.x - 510 + (i >> 1) * 195,
            z: side * (575 + (i % 3) * 18), w: 112 + i % 3 * 18,
            d: 58 + i % 2 * 16, h: 62 + (i * 17) % 42,
            kind: 'government', damage: i === 3 || i === 8 ? 1 : 0 });
    }
    // Dense Jakarta offices close the east/west horizon without becoming part
    // of the playable collision field.
    for (let i = 0; i < 32; i++) {
        const side = i % 2 ? 1 : -1;
        const z = -520 + (i % 9) * 130;
        specs.push({ x: S12_ORIGIN.x + side * (730 + (i % 4) * 38), z,
            w: 54 + (i * 13) % 42, d: 52 + (i * 19) % 38,
            h: 110 + (i * 37) % 210, kind: 'office', damage: i % 13 === 0 ? 1 : 0 });
    }
    // Low mixed-use ruko rows anchor this final world back in Jakarta.
    for (let i = 0; i < 20; i++) {
        const side = i < 10 ? -1 : 1, j = i % 10;
        specs.push({ x: S12_ORIGIN.x - 700 + j * 150,
            z: side * 625, w: 62, d: 38, h: 30 + j % 3 * 8,
            kind: 'ruko', damage: j === 2 || j === 7 ? 1 : 0 });
    }
    for (const spec of specs) detailedBuilding(props, M, spec);
    tag('jakarta-skyline');
}

function vehicle(props, M, x, z, kind, yaw, damaged = false) {
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
    // Kendaraan mogok BERDIRI SENDIRI (tidak dilebur ke batch besar) supaya bisa
    // memudar saat menutupi player/robot di boulevard; dilas ke dalam dirinya
    // sendiri jadi harganya tetap segelintir draw call.
    const node = mergeObjectInPlace(g);
    root.add(node);
    registerOccluder(STAGE12_LIGHTS_KEY, node,
        { x, z, radius: (long + wide) / 4, top: 12.5 });
    occluderCount++;
    inertVehicleCount++; propDetailCount += 9;
}

function buildInertVehicles(M, props) {
    for (let i = 0; i < 28; i++) {
        const side = i % 2 ? 1 : -1;
        const x = S12_ORIGIN.x - 805 + i * 43;
        const z = side * (112 + (i % 4) * 19);
        vehicle(props, M, x, z, i % 7 === 0 ? 'bus' : i % 4 === 0 ? 'truck' : 'car',
            side * (Math.PI / 2 + (i % 3 - 1) * 0.08), i % 6 === 0);
    }
    tag('abandoned-vehicle', inertVehicleCount);
}

function buildInertArmy(M) {
    const N = 240;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.gunmetal, N);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.dark, N);
    const limb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.steel, N * 2);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
        const band = i < 100 ? 0 : i < 175 ? 1 : 2;
        const col = i % (band === 0 ? 25 : 15), row = Math.floor(i / (band === 0 ? 25 : 15));
        const x = band === 0 ? S12_ORIGIN.x - 810 + col * 25
            : band === 1 ? S12_ORIGIN.x - 110 + col * 27
                : S12_ORIGIN.x + 460 + col * 19;
        let z = band === 0 ? (row % 2 ? 1 : -1) * (130 + (row % 4) * 18)
            : band === 1 ? -245 + (row % 9) * 58
                : (row % 2 ? 1 : -1) * (245 + (row % 4) * 18);
        // Preserve clear deployment/charge corridors. These are scenery only:
        // no blocker and no AI object is ever created for an inert shell.
        if (band === 1 && Math.abs(z) < 210) z += z >= 0 ? 230 : -230;
        const yaw = ((i * 37) % 17 - 8) * 0.025;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
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
        inst.instanceMatrix.needsUpdate = true; inst.castShadow = true; root.add(inst); rawMeshes++;
    }
    inertRobotCount = N; tag('inert-army-shell', N);
}

function buildDamagedPerimeter(M, props) {
    for (let i = 0; i < 72; i++) {
        const side = i % 2 ? 1 : -1;
        const x = S12_ORIGIN.x - 850 + (i % 36) * 48;
        const z = side * (330 + (i * 19) % 54);
        staticBox(props, i % 3 ? M.concrete : M.gunmetal,
            5 + i % 4 * 2, 2 + i % 5, 4 + (i * 7) % 8,
            x, 1 + i % 3, z, i * 0.08, i * 0.17, i * 0.11);
        propDetailCount++;
    }
    for (let i = 0; i < 10; i++) {
        const crater = addMesh(root, new THREE.RingGeometry(9 + i % 3 * 3,
            14 + i % 3 * 3, 18), M.dark,
            S12_ORIGIN.x - 650 + i * 145, 0.5,
            (i % 2 ? 1 : -1) * (285 + i % 3 * 22), -Math.PI / 2);
        crater.castShadow = false;
    }
    tag('damaged-perimeter'); tag('rubble', 72); tag('crater', 10);
}

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
    // Legacy vault aperture west of Monas, with layered shutters, rails and a
    // visible cable trench leading to the four station sockets.
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

function buildTransport(M) {
    const g = new THREE.Group(); g.name = 'Stage12-Autonomous-Return-Transport'; root.add(g);
    const fuselage = new THREE.Group(); g.add(fuselage);
    box(fuselage, M.gunmetal, 58, 10, 15, 0, 12, 0);
    box(fuselage, M.pale, 39, 7, 17, -4, 19, 0);
    addMesh(fuselage, new THREE.ConeGeometry(8.5, 21, 8), M.gunmetal,
        -38, 14, 0, 0, 0, Math.PI / 2);
    box(fuselage, M.glass, 12, 5, 17.4, -22, 20, 0);
    for (const side of [-1, 1]) {
        box(fuselage, M.gunmetal, 25, 3, 38, 2, 18, side * 19, 0, 0, side * 0.08);
        const nacelle = new THREE.Group(); nacelle.position.set(3, 19, side * 35); g.add(nacelle);
        box(nacelle, M.dark, 16, 9, 9, 0, 0, 0);
        const rotor = new THREE.Group(); rotor.position.y = 6; nacelle.add(rotor);
        for (let i = 0; i < 5; i++) box(rotor, M.steel, 28, 0.7, 2.1,
            0, 0, 0, 0, i * Math.PI / 5, 0);
        nacelle.userData.rotor = rotor;
    }
    for (const side of [-1, 1]) {
        box(g, M.dark, 15, 1.5, 2.5, 21, 4, side * 7);
        box(g, M.steel, 2, 9, 2, 21, 8, side * 7);
    }
    const ramp = box(g, M.concrete, 15, 2, 17, 29, 9, 0, 0, 0, -0.12);
    const nav = box(g, M.red, 2, 1, 2, -30, 19, 0); nav.castShadow = false;
    g.position.set(S12_START.x - 160, 95, -120); g.rotation.y = Math.PI / 2;
    transport = { group: g, rotors: g.children.filter(o => o.userData.rotor)
        .map(o => o.userData.rotor), ramp, nav };
    tag('return-transport'); propDetailCount += 35;
}

function buildWorld() {
    root = new THREE.Group(); root.name = 'campaign-stage12-monas-jakarta'; scene.add(root);
    const M = materialSet(), props = [];
    buildSurfaces(M, props); buildPark(M, props); buildSkyline(M, props);
    buildInertVehicles(M, props); buildDamagedPerimeter(M, props);
    buildHardlineInfrastructure(M, props); buildMonas(M, props);
    buildInertArmy(M); buildTransport(M);
    staticBatch = addMergedStatic(root, props);
    // Horizon sunrise layer exists from boot and only changes opacity.
    const dawn = addMesh(root, new THREE.PlaneGeometry(1500, 520), M.dawn,
        S12_ORIGIN.x + 610, 220, -560, 0, 0, 0);
    dawn.name = 'Stage12-Sunrise-Horizon'; dawn.castShadow = false;
    root.userData.dawn = dawn;
    registerCampaignWorldRoot({
        key: STAGE12_LIGHTS_KEY, root, bounds: { ...S12_BOUNDS },
        lightsKey: STAGE12_LIGHTS_KEY,
        warmupViews: [S12_START, S12_ARENA_ENTRY, S12_BOSS_CENTER, S12_MONAS],
    });
}

export function ensureStage12World() {
    if (!built) { built = true; buildWorld(); }
    return root;
}

export function stage12Walk(x, z, radius = 0) {
    const avenue = x >= S12_ORIGIN.x - 845 + radius
        && x <= S12_ORIGIN.x - 185 - radius && Math.abs(z) <= 102 - radius;
    const parkMouth = x >= S12_ORIGIN.x - 360 + radius
        && x <= S12_ORIGIN.x + 20 - radius && Math.abs(z) <= 252 - radius;
    const merdeka = x >= S12_ORIGIN.x - 245 + radius
        && x <= S12_ORIGIN.x + 570 - radius && Math.abs(z) <= 382 - radius;
    return avenue || parkMouth || merdeka;
}

export function resolveStage12World(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
    return pos;
}

export function clampStage12Point(pos, radius = 0, oldX = pos.x, oldZ = pos.z) {
    slideWalk(stage12Walk, pos, oldX, oldZ, radius);
    resolveStage12World(pos, radius, 0); return pos;
}

export function clampStage12Boss(pos) {
    pos.x = clamp(pos.x, S12_BOSS_BOUNDS.x0, S12_BOSS_BOUNDS.x1);
    pos.z = clamp(pos.z, S12_BOSS_BOUNDS.z0, S12_BOSS_BOUNDS.z1);
    return pos;
}

export function stage12BulletBlocked(b) {
    const x = b.mesh.position.x, z = b.mesh.position.z;
    if (!stage12Walk(x, z, 0)) return true;
    return segPointDist2(b.px, 0, b.pz, x, 0, z,
        S12_MONAS.x, 0, S12_MONAS.z) < S12_MONAS.radius ** 2;
}

export function stage12BlastBlocked(x0, z0, x1, z1) {
    return segPointDist2(x0, 0, z0, x1, 0, z1,
        S12_MONAS.x, 0, S12_MONAS.z) < S12_MONAS.radius ** 2;
}

export function resetStage12Transport() {
    if (!transport) return;
    transport.group.visible = true;
    transport.group.position.set(S12_START.x - 160, 95, -120);
    transport.group.rotation.set(0, Math.PI / 2, 0);
    transport.ramp.rotation.z = -0.12;
}

export function updateStage12Transport(dt, progress = 0, deployed = false) {
    if (!transport) return;
    const k = clamp(progress, 0, 1), smooth = k * k * (3 - 2 * k);
    transport.group.position.x = S12_START.x - 160 + smooth * 150;
    transport.group.position.z = -120 + smooth * 112;
    transport.group.position.y = 95 - smooth * 91;
    transport.group.rotation.z = (1 - smooth) * -0.08;
    transport.group.rotation.y = Math.PI / 2 - smooth * 0.08;
    for (const rotor of transport.rotors) rotor.rotation.y += dt * (deployed ? 8 : 28);
    transport.ramp.rotation.z += (((deployed ? -1.05 : -0.12)
        - transport.ramp.rotation.z) * Math.min(1, dt * 4));
}

export function hideStage12Transport() {
    if (transport) transport.group.visible = false;
}

export function setStage12Sunrise(k) {
    sunrise = clamp(k, 0, 1);
    const dawn = root?.userData?.dawn;
    if (dawn) dawn.material.opacity = sunrise * 0.68;
}

// Pohon depan, kendaraan mogok dan Monas memudar lewat uji GARIS PANDANG bersama
// (player DAN robot) — lihat utility/occlusion.js.
export function updateStage12World(dt) {
    updateStageOccluders(STAGE12_LIGHTS_KEY, dt);
}

export function resetStage12World() {
    setStage12Sunrise(0); resetStage12Transport();
    resetStageOccluders(STAGE12_LIGHTS_KEY);
}

function segmentClearOfMonas(path, extra = 0) {
    return segPointDist2(path.x0, 0, path.z0, path.x1, 0, path.z1,
        S12_MONAS.x, 0, S12_MONAS.z) >= (S12_MONAS.radius + extra) ** 2;
}

export function stage12WorldDebug() {
    return {
        built, root: root?.name || null, visible: !!root?.visible,
        origin: { ...S12_ORIGIN }, bounds: { ...S12_BOUNDS },
        start: { ...S12_START }, arenaEntry: { ...S12_ARENA_ENTRY },
        bossCenter: { ...S12_BOSS_CENTER }, bossBounds: { ...S12_BOSS_BOUNDS },
        monas: { ...S12_MONAS, campaignOnly: monasRig?.campaignOnly === true,
            stable: monasRig?.stable === true, destructible: false },
        chargeLanes: S12_CHARGE_LANES.map(p => ({ ...p,
            clearOfMonas: segmentClearOfMonas(p, 34) })),
        hardlineStations: S12_HARDLINE_STATIONS.map(s => ({ ...s })),
        census: {
            inertRobots: inertRobotCount, liveInertRobots: 0,
            inertVehicles: inertVehicleCount, parkTrees: treeCount,
            cityBuildings: cityBuildingCount, detailedProps: propDetailCount,
            government: semantic.get('government-building') || 0,
            offices: semantic.get('office-building') || 0,
            ruko: semantic.get('ruko-building') || 0,
            damagedBuildings: semantic.get('damaged-building') || 0,
        },
        semantic: Object.fromEntries(semantic),
        batching: { sourceMeshes: rawMeshes, batches: staticBatch.length,
            instancedArmy: true, instancedTrees: true },
        transport: transport ? { detailed: true, rotors: transport.rotors.length,
            visible: transport.group.visible } : null,
        blockers: { count: blockers.length, monasSolid: blockers.length > 0 },
        occluders: occlusionDebug(STAGE12_LIGHTS_KEY),
        sunrise, pointLights: 0, deterministic: true,
        survivalStateImported: false,
    };
}
