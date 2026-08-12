// Stage 5 — BUILDER PROP STATIS: landmark C1/C2, perabot depot/peron, pintu
// stasiun, dan konsist kereta musuh. Semuanya fungsi murni "bangun lalu
// kembalikan"; state dunia (blocker, daftar perabot, root) tetap milik
// world.js dan hanya dititipkan lewat parameter.

import { PAL } from '../../../../world/palette.js';
import { mergeObjectInPlace } from '../../../../utils/meshBatch.js';
import {
    buildSplitDoor, buildDoorSideLights, DOOR_LOCKED_COLOR,
} from '../../utility/doors.js';
import { buildStandMarker } from '../../utility/common.js';
import { CELL, WALL_H, cellPos } from './world.js';

export function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m); return m;
}

export function cylinder(parent, mat, rt, rb, h, segments, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = shadow; m.receiveShadow = shadow; parent.add(m); return m;
}

export function torus(parent, mat, radius, tube, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 18), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

export function meshCount(root) {
    let n = 0, stack = [root];
    while (stack.length) {
        const o = stack.pop();
        if (o?.geometry) n++;
        if (o?.children) for (const c of o.children) stack.push(c);
    }
    return n;
}

// Kotak pijak 12×12 milik campaign; bentuknya dipegang `utility/common.js`
// supaya Stage 5 dan Stage 6 HQ tak pernah berbeda sedikit pun.
export const buildMarker = buildStandMarker;

const screenMaterial = () => new THREE.MeshLambertMaterial({
    color: PAL.screenBg, emissive: PAL.techDim, emissiveIntensity: 0.25,
});

// C2 adalah turbogenerator modular 2045: drum terbuka, enam kumparan, cincin
// servis, konverter daya dan cage proteksi. Siluetnya sengaja lebar mengikuti
// empat sel C2 pada CSV agar terbaca sebagai landmark dari kamera.
export function buildGenerator(M, root, at, addBlocker) {
    const g = new THREE.Group(); g.position.set(at.x, 0, at.z);
    box(g, M.ink, CELL * 3.65, 2.4, CELL * 0.98, 0, 1.2, 0);
    box(g, M.body, CELL * 3.45, 2.2, CELL * 0.82, 0, 2.5, 0);
    for (const x of [-CELL * 1.55, CELL * 1.55]) {
        box(g, M.steel, 3.2, 12, CELL * 0.72, x, 7, 0);
        box(g, M.hazard, 3.7, 1.1, CELL * 0.78, x, 12.3, 0);
    }

    const rotor = new THREE.Group(); rotor.position.y = 11; g.add(rotor);
    cylinder(rotor, M.tech, 5.4, 5.4, CELL * 2.65, 16, 0, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const coil = box(rotor, i % 2 ? M.white : M.hazard,
            CELL * 2.72, 1.55, 2.15, 0, Math.cos(a) * 7.3, Math.sin(a) * 7.3);
        coil.rotation.x = a;
    }
    for (const x of [-CELL, 0, CELL])
        torus(g, M.steel, 9.3, 1.25, x, 11, 0, 0, Math.PI / 2, 0);
    cylinder(g, M.body, 9.1, 9.1, 5, 14, -CELL * 1.4, 11, 0, 0, 0, Math.PI / 2);
    cylinder(g, M.body, 9.1, 9.1, 5, 14, CELL * 1.4, 11, 0, 0, 0, Math.PI / 2);
    for (const x of [-CELL * 1.18, CELL * 1.18]) {
        box(g, M.ink, 12, 10, 10, x, 7.2, -9);
        box(g, M.panel, 9.5, 7.5, 8.5, x, 7.4, -9);
        for (const vx of [-3, 0, 3]) box(g, M.steel, 1.1, 5, 0.7, x + vx, 7.5, -13.4, false);
    }
    // Exhaust/heat exchanger kembar dan rangka servis di atas mesin.
    for (const x of [-CELL * 0.72, CELL * 0.72]) {
        cylinder(g, M.ink, 3.1, 3.6, 11, 10, x, 20, -5);
        cylinder(g, M.steel, 3.8, 3.8, 1.2, 10, x, 25.4, -5);
    }
    for (const x of [-CELL * 1.62, CELL * 1.62]) box(g, M.steel, 1.5, 24, 1.5, x, 12, 8);
    box(g, M.steel, CELL * 3.3, 1.5, 1.5, 0, 23.5, 8);
    for (const x of [-CELL, 0, CELL]) box(g, M.hazard, 1.4, 0.9, CELL * 0.75, x, 3.8, 0);

    // Console servis menghadap titik H di sel selatan.
    box(g, M.ink, 17, 7.5, 6.5, 5, 4.4, CELL * 0.48);
    const consoleTop = box(g, M.body, 18, 2.1, 8, 5, 8.2, CELL * 0.47);
    consoleTop.rotation.x = -0.13;
    const screen = box(g, screenMaterial(), 10, 4.8, 0.65, 5, 9.2, CELL * 0.72, false);
    screen.rotation.x = -0.13;
    for (const x of [-4, 0, 4]) box(g, M.amber, 1.1, 1.1, 0.7, x + 5, 6.2, CELL * 0.73, false);
    // Kabel daya berat masuk ke lantai; tidak menambah blocker terpisah.
    for (const x of [-12, 0, 12]) box(g, M.ink, 3.2, 0.8, CELL * 0.7, x, 0.7, CELL * 0.66);

    root.add(g);
    addBlocker(at.x, at.z, CELL * 1.78, CELL * 0.5, 26);
    return { screen, rotor, meshes: meshCount(g) };
}

// C1 = access-core station 2045, bukan deretan PC kantor: tujuh server bay,
// data spine, cooling fins, conduit atas dan console berbentuk command altar.
export function buildTerminal(M, root, at, addBlocker) {
    const g = new THREE.Group(); g.position.set(at.x, 0, at.z);
    box(g, M.ink, 10, 18, CELL * 7.7, 1.5, 9, 0);
    for (let i = -3; i <= 3; i++) {
        const z = i * CELL;
        box(g, M.ink, 14, 17, 14, 0, 8.5, z);
        box(g, M.body, 11.8, 14.5, 11.8, -0.4, 8.2, z);
        box(g, M.panel, 0.85, 11.5, 9.4, -6.35, 8.2, z);
        box(g, i === 0 ? M.amber : M.tech, 0.65, 7.8, 1.15, -6.85, 9, z, false);
        for (const vz of [-3.2, 0, 3.2]) box(g, M.ink, 0.7, 1.1, 2.1, -6.9, 4.8, z + vz, false);
        // Sirip heat-sink membuat setiap bay punya profil bergerigi futuristis.
        for (const fy of [4, 8, 12]) {
            const fin = box(g, M.steel, 3.8, 0.7, 11.5, 5.3, fy, z);
            fin.rotation.z = -0.08;
        }
        box(g, M.hazard, 1.1, 2.2, 12.5, 5.9, 15.6, z);
    }
    box(g, M.steel, 16, 2, CELL * 7.85, 0, 18.8, 0);
    for (const z of [-CELL * 3.65, CELL * 3.65]) {
        box(g, M.steel, 2, 25, 2, -8, 12.5, z);
        const brace = box(g, M.steel, 2, 2, 22, -8, 24, z > 0 ? z - 10 : z + 10);
        brace.rotation.x = z > 0 ? 0.22 : -0.22;
    }

    const core = new THREE.Group(); core.position.set(-8.2, 12, CELL * 0.5); g.add(core);
    cylinder(core, M.tech, 3.3, 3.3, 13, 12, 0, 0, 0, 0, 0, 0, false);
    for (const y of [-5, 0, 5]) torus(core, M.amber, 4.6, 0.65, 0, y, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        box(core, M.steel, 1, 11, 1, Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5);
    }

    // Console utama menonjol ke H, dilindungi dua wing miring.
    box(g, M.ink, 14, 6.5, 15, -8.8, 3.5, CELL * 0.5);
    const leftWing = box(g, M.body, 8, 2.2, 15, -10.5, 7, CELL * 0.5 - 10);
    const rightWing = box(g, M.body, 8, 2.2, 15, -10.5, 7, CELL * 0.5 + 10);
    leftWing.rotation.x = 0.1; rightWing.rotation.x = -0.1;
    const screen = box(g, screenMaterial(), 0.75, 6.5, 11, -13, 8.2, CELL * 0.5, false);
    screen.rotation.z = 0.12;
    for (const z of [-5, 0, 5]) box(g, M.amber, 0.8, 0.9, 1.7, -13.45, 4.4, CELL * 0.5 + z, false);

    root.add(g);
    addBlocker(at.x - 3.5, at.z, 12, CELL * 3.9, 19);
    return { screen, core, meshes: meshCount(g) };
}

// --- Perabot depot & peron -------------------------------------------------
// `reg(which, kind, p, hx, hz, top)` mendaftarkan blocker + entri debug.

function buildPalletRack(M, add, reg, c, r, span = 4) {
    const p = cellPos(c, r), sx = span * CELL, sz = 13;
    for (const x of [-sx / 2 + 2, sx / 2 - 2]) for (const z of [-5, 5])
        add(2, 22, 2, p.x + x, 11, p.z + z, M.steel);
    for (const y of [4, 11, 18]) {
        add(sx, 1.5, 2, p.x, y, p.z - 5, M.hazard);
        add(sx, 1.5, 2, p.x, y, p.z + 5, M.hazard);
        add(sx - 3, 1.2, sz, p.x, y, p.z, M.steel);
        // Bibir rak + label bay membuat tiap tingkat terbaca terpisah dari atas.
        add(sx - 5, 0.8, 0.7, p.x, y + 1.1, p.z - 6.1, M.white);
    }
    for (const z of [-5.8, 5.8]) {
        const a = add(sx * 0.82, 0.85, 0.8, p.x, 11, p.z + z, M.steel);
        const b = add(sx * 0.82, 0.85, 0.8, p.x, 11, p.z + z, M.steel);
        a.rotation.z = 0.31; b.rotation.z = -0.31;
    }
    const bays = Math.max(3, span + 1);
    for (let i = 0; i < bays; i++) {
        const x = p.x - sx * 0.4 + i * (sx * 0.8 / Math.max(1, bays - 1));
        const mat = i % 3 === 0 ? M.wood : (i % 3 === 1 ? M.body : M.panel);
        add(8, 5.5 + (i % 2) * 2, 8, x, 7.2, p.z, mat);
        if (i % 2 === 0) add(7.5, 5, 7.5, x, 14.1, p.z, M.wood);
    }
    reg('depot', 'pallet-rack', p, sx / 2, sz / 2, 22);
}

function buildCargoContainer(M, add, reg, c, r, span = 3) {
    const p = cellPos(c, r), sx = span * CELL, sz = 18;
    add(sx, 14, sz, p.x, 7, p.z, M.body);
    add(sx - 3, 11.5, sz + 0.8, p.x, 7, p.z, M.panel);
    for (let x = -sx / 2 + 4; x <= sx / 2 - 3; x += 7)
        add(1.1, 11, sz + 1.2, p.x + x, 7, p.z, M.steel);
    for (const x of [-sx / 2 + 2, sx / 2 - 2]) {
        add(2.4, 14.8, 2.2, p.x + x, 7.4, p.z - sz / 2, M.hazard);
        add(2.4, 14.8, 2.2, p.x + x, 7.4, p.z + sz / 2, M.hazard);
    }
    add(sx - 5, 0.8, 2, p.x, 14.5, p.z, M.white);
    // Daun servis, locking bar dan pelat identitas di kedua ujung kontainer.
    for (const z of [-sz / 2 - 0.55, sz / 2 + 0.55]) {
        add(sx - 5, 0.65, 0.7, p.x, 7, p.z + z, M.ink);
        for (const x of [-sx * 0.22, sx * 0.22]) {
            add(1, 10.5, 0.9, p.x + x, 7, p.z + z, M.steel);
            add(3.2, 1.1, 1.1, p.x + x, 8.5, p.z + z, M.hazard);
        }
        add(7, 2.4, 0.85, p.x, 11.3, p.z + z, M.white);
    }
    reg('depot', 'cargo-container', p, sx / 2, sz / 2, 15);
}

function buildWorkshop(M, add, reg, c, r) {
    const p = cellPos(c, r), sx = 15, sz = CELL * 2.6;
    add(sx, 3, sz, p.x, 6.5, p.z, M.wood);
    for (const z of [-sz / 2 + 2, sz / 2 - 2]) for (const x of [-5, 5])
        add(2, 6, 2, p.x + x, 3, p.z + z, M.steel);
    add(2, 17, sz, p.x + 6.2, 14, p.z, M.body);
    for (const z of [-14, -5, 5, 14]) {
        add(1, 6, 7, p.x + 4.8, 14, p.z + z, M.hazard);
        add(5, 1, 1, p.x + 2, 15 + (z % 2), p.z + z, M.steel);
    }
    add(8, 5, 9, p.x - 1, 10.5, p.z - 10, M.ink);
    add(6, 0.7, 7, p.x - 1, 13.3, p.z - 10, M.tech);
    add(1, 16, sz - 4, p.x + 7.3, 14, p.z, M.steel);
    for (const z of [-14, -7, 0, 7, 14]) {
        add(1.4, 1.4, 1.4, p.x + 7.9, 12 + (Math.abs(z) % 3), p.z + z, M.white);
        add(5, 0.8, 0.8, p.x + 4.8, 11, p.z + z, M.steel);
    }
    reg('depot', 'maintenance-workbench', p, sx / 2, sz / 2, 23);
}

function buildForklift(M, add, addGeo, reg, c, r) {
    const p = cellPos(c, r);
    add(34, 5, 18, p.x, 3, p.z, M.hazard);
    add(17, 11, 16, p.x - 6, 9, p.z, M.body);
    for (const x of [-14, 2]) for (const z of [-7, 7])
        add(2, 17, 2, p.x + x, 15, p.z + z, M.steel);
    add(18, 2, 18, p.x - 6, 24, p.z, M.steel);
    add(3, 25, 18, p.x + 14, 13, p.z, M.ink);
    for (const z of [-5, 5]) add(22, 1.8, 2.2, p.x + 25, 1.2, p.z + z, M.steel);
    for (const x of [-11, 9]) for (const z of [-9, 9])
        addGeo(new THREE.CylinderGeometry(4, 4, 2.4, 10), p.x + x, 3.8, p.z + z,
            M.ink, Math.PI / 2, 0, 0);
    add(5, 2, 11, p.x - 14, 17, p.z, M.amber);
    reg('depot', 'autonomous-forklift', p, 18, 11, 25);
}

function buildDrumCluster(M, addGeo, reg, c, r, which = 'depot') {
    const p = cellPos(c, r);
    const offsets = [[-6, -5], [6, -5], [-6, 6], [6, 6], [0, 0]];
    for (let i = 0; i < offsets.length; i++) {
        const [x, z] = offsets[i], mat = i % 2 ? M.body : M.hazard;
        addGeo(new THREE.CylinderGeometry(4.2, 4.2, 10, 12), p.x + x, 5, p.z + z, mat);
        addGeo(new THREE.TorusGeometry(4.25, 0.45, 6, 12), p.x + x, 8.5, p.z + z,
            M.steel, Math.PI / 2, 0, 0);
    }
    reg(which, 'sealed-drum-cluster', p, 12, 12, 11);
}

function buildFreightScale(M, add, reg, c, r) {
    const p = cellPos(c, r);
    add(CELL * 2.5, 1.8, CELL * 1.15, p.x, 0.9, p.z, M.steel);
    add(CELL * 2.2, 0.5, CELL * 0.92, p.x, 2, p.z, M.ink);
    for (const x of [-CELL, CELL]) add(2, 9, 2, p.x + x, 5.5, p.z - 8, M.hazard);
    add(CELL * 2.1, 1.2, 1.2, p.x, 10, p.z - 8, M.hazard);
    add(8, 5, 1, p.x, 7, p.z - 8.8, M.tech);
    reg('depot', 'freight-scale', p, CELL * 1.25, CELL * 0.58, 10);
}

function buildLockerBank(M, add, reg, c, r) {
    const p = cellPos(c, r);
    for (let i = -2; i <= 2; i++) {
        add(9, 18, 10, p.x, 9, p.z + i * 10, M.body);
        add(0.7, 13, 7.5, p.x - 4.85, 9, p.z + i * 10, M.panel);
        add(0.8, 1.2, 2.5, p.x - 5.3, 10, p.z + i * 10, i === 0 ? M.amber : M.steel);
        for (const z of [-2.2, 0, 2.2])
            add(0.85, 0.55, 1.4, p.x - 5.32, 14.2, p.z + i * 10 + z, M.ink);
    }
    add(11, 1.2, 52, p.x, 18.6, p.z, M.steel);
    add(11, 1.6, 52, p.x, 0.8, p.z, M.ink);
    reg('depot', 'tool-lockers', p, 5, 25, 18);
}

function buildPlatformCart(M, add, addGeo, reg, c, r) {
    const p = cellPos(c, r);
    add(CELL * 1.9, 2.5, 12, p.x, 4, p.z, M.body);
    add(CELL * 1.75, 0.8, 10, p.x, 5.6, p.z, M.wood);
    for (const x of [-CELL * 0.78, CELL * 0.78]) for (const z of [-5, 5])
        add(1, 8, 1, p.x + x, 9, p.z + z, M.steel);
    add(CELL * 1.65, 1, 1, p.x, 13, p.z - 5, M.steel);
    add(CELL * 1.65, 1, 1, p.x, 13, p.z + 5, M.steel);
    for (const x of [-CELL * 0.65, CELL * 0.65]) for (const z of [-7, 7])
        addGeo(new THREE.CylinderGeometry(2.7, 2.7, 1.8, 9), p.x + x, 2.6, p.z + z,
            M.ink, Math.PI / 2, 0, 0);
    reg('platform', 'freight-cart', p, CELL * 0.95, 8, 13);
}

function buildPlatformPallets(M, add, reg, c, r) {
    const p = cellPos(c, r);
    for (const y of [1, 4.2]) {
        add(24, 1.2, 15, p.x, y, p.z, M.wood);
        for (const z of [-5, 0, 5]) add(24, 1, 1.5, p.x, y + 0.8, p.z + z, M.ink);
    }
    for (const x of [-7, 7]) add(10, 9, 11, p.x + x, 9.5, p.z, x < 0 ? M.panel : M.body);
    add(22, 0.8, 2, p.x, 14.5, p.z, M.hazard);
    reg('platform', 'secured-pallets', p, 13, 9, 15);
}

function buildPlatformBench(M, add, reg, c, r) {
    const p = cellPos(c, r);
    add(30, 2.2, 7, p.x, 7, p.z, M.wood);
    add(30, 9, 2, p.x, 11.5, p.z - 3, M.steel);
    for (const x of [-12, 0, 12]) add(2, 7, 6, p.x + x, 3.5, p.z, M.steel);
    add(12, 4, 5, p.x, 10.5, p.z + 3, M.ink);
    add(9, 0.6, 3.5, p.x, 12.7, p.z + 3, M.tech);
    for (const x of [-12, 0, 12]) add(3.6, 0.8, 8.2, p.x + x, 7.9, p.z, M.steel);
    add(28, 0.65, 0.8, p.x, 13.8, p.z - 4.1, M.white);
    reg('platform', 'dispatch-bench', p, 16, 5, 16);
}

function buildSignalCabinet(M, add, reg, c, r) {
    const p = cellPos(c, r);
    add(13, 20, 11, p.x, 10, p.z, M.body);
    add(10.5, 16, 0.8, p.x, 10, p.z + 5.8, M.panel);
    for (const x of [-3, 0, 3]) add(1.2, 8, 0.9, p.x + x, 11, p.z + 6.3, M.ink);
    add(8, 3.5, 1, p.x, 16, p.z + 6.5, M.tech);
    add(11, 1, 1, p.x, 19, p.z + 5.9, M.hazard);
    for (const y of [5.5, 8, 10.5, 13])
        add(7.5, 0.55, 0.9, p.x, y, p.z + 6.45, M.ink);
    add(1.1, 4.5, 1, p.x + 4, 10, p.z + 6.5, M.steel);
    reg('platform', 'signal-cabinet', p, 7, 6, 20);
}

function buildPackingIsland(M, add, reg, c, r) {
    const p = cellPos(c, r);
    add(25, 3, 16, p.x, 5.5, p.z, M.wood);
    add(23, 1.1, 14, p.x, 7.6, p.z, M.steel);
    for (const x of [-10, 10]) for (const z of [-5.5, 5.5])
        add(1.8, 7, 1.8, p.x + x, 3.5, p.z + z, M.body);
    for (const x of [-7, 0, 7]) {
        add(5.5, 4 + (x === 0 ? 2 : 0), 5.5, p.x + x, 10.2, p.z, x === 0 ? M.panel : M.wood);
        add(4.4, 0.65, 4.4, p.x + x, 12.4 + (x === 0 ? 1 : 0), p.z, M.hazard);
    }
    add(13, 5.5, 1, p.x, 11, p.z + 7.2, M.tech);
    reg('depot', 'packing-island', p, 13, 9, 14);
}

function buildPipeRack(M, add, addGeo, reg, c, r) {
    const p = cellPos(c, r);
    for (const z of [-13, 13]) for (const x of [-5, 5])
        add(2, 18, 2, p.x + x, 9, p.z + z, M.steel);
    for (const y of [4, 10, 16]) {
        add(13, 1.2, 30, p.x, y, p.z, M.body);
        for (const x of [-4, 0, 4])
            addGeo(new THREE.CylinderGeometry(1.25, 1.25, 27, 8), p.x + x, y + 1.8, p.z,
                x === 0 ? M.hazard : M.panel, Math.PI / 2, 0, 0);
    }
    reg('depot', 'conduit-rack', p, 8, 17, 19);
}

function buildDroneDock(M, add, addGeo, reg, c, r) {
    const p = cellPos(c, r);
    add(27, 1.6, 27, p.x, 0.8, p.z, M.ink);
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const x = Math.cos(a) * 10, z = Math.sin(a) * 10;
        add(7, 2, 3, p.x + x, 4.5, p.z + z, M.hazard);
        add(1.5, 11, 1.5, p.x + x, 5.5, p.z + z, M.steel);
    }
    addGeo(new THREE.CylinderGeometry(7, 9, 3, 8), p.x, 2.4, p.z, M.body);
    addGeo(new THREE.TorusGeometry(8.2, 0.8, 7, 16), p.x, 4.1, p.z, M.tech, Math.PI / 2);
    add(11, 5, 8, p.x, 7, p.z, M.panel);
    add(8, 0.7, 5, p.x, 9.8, p.z, M.amber);
    reg('depot', 'drone-service-dock', p, 14, 14, 11);
}

// --- BADAN JALUR: tanah, aspal, rel, bantalan, dan PAGAR BESI PERIMETER ---
// Jalur masuk barat + apron run-out timur dibangun dari satu deskripsi rentang,
// jadi kedua sisi peron tidak akan pernah lagi tumbuh terpisah.
const FENCE_DZ = 4, FENCE_PLINTH_H = 3, FENCE_TOP = 18.4, FENCE_PICKET_TOP = 18;

export function buildTrackBed(M, add, g) {
    const { leadX0, runoutX1, mapX0, mapX1, bandZ, bandD, tracks, gaugeHalf } = g;
    // `CELL` adalah binding hidup dari world.js (impor melingkar) — hanya boleh
    // dibaca DI DALAM fungsi, tidak pernah di puncak modul.
    const FENCE_POST_STEP = CELL, FENCE_PICKET_STEP = CELL / 4;
    for (const [x0, len] of [[mapX1, runoutX1 - mapX1], [leadX0, mapX0 - leadX0]]) {
        add(len, 2, bandD, x0 + len / 2, -1, bandZ, M.ground);
        add(len, 1, bandD, x0 + len / 2, -0.1, bandZ, M.asphalt);
    }
    for (const base of tracks) for (const z of [base - gaugeHalf, base + gaugeHalf])
        add(runoutX1 - leadX0, 1.2, 1.8, (leadX0 + runoutX1) / 2, 0.1, z, M.steel);
    // Bantalan tetap sebidang dengan kolom CSV (langkah dua sel) supaya sisi
    // barat menyambung mulus dengan yang sudah ada di bawah peron.
    for (let x = mapX0 + CELL / 2 - Math.ceil((mapX0 - leadX0) / (CELL * 2)) * CELL * 2;
        x <= runoutX1; x += CELL * 2)
        for (const base of tracks)
            add(CELL * 1.7, 0.8, gaugeHalf * 2 + 8, x, -0.25, base, M.ink);
    // PAGAR BESI PERIMETER DI UTARA REL (2026-08-11, permintaan user: "tidak ada
    // pembatas antara wilayah stasiun dan dunia luar"). Ia berdiri PERSIS di
    // luar pita aspal track dan membentang penuh dari ujung jalur masuk barat
    // sampai ujung apron timur — tidak ada sisi jalur yang menganga ke kota.
    // DEKOR MURNI: nol blocker, nol sel nav, nol PointLight. Sel track sudah
    // ditolak playerStationWalk/robotStationWalk, jadi collider di sini cuma
    // menambah kerja resolve tanpa mengubah satu pun jalur. Semua batangnya
    // dilas ke batch statis, jadi ~600 mesh mentah = nol draw call tambahan.
    const fz = g.northEdgeZ - FENCE_DZ, fLen = runoutX1 - leadX0;
    const fCx = (leadX0 + runoutX1) / 2;
    add(fLen, FENCE_PLINTH_H, 3, fCx, FENCE_PLINTH_H / 2, fz, M.ground);
    for (const y of [6.4, 16]) add(fLen, 1, 1.2, fCx, y, fz, M.steel);
    let posts = 0, pickets = 0;
    for (let x = leadX0; x <= runoutX1 + 0.01; x += FENCE_POST_STEP, posts++) {
        add(2, FENCE_TOP - FENCE_PLINTH_H, 2, x, (FENCE_TOP + FENCE_PLINTH_H) / 2, fz, M.steel);
        add(2.8, 0.8, 2.8, x, FENCE_TOP + 0.4, fz, M.panel);
    }
    for (let x = leadX0 + FENCE_PICKET_STEP / 2; x < runoutX1; x += FENCE_PICKET_STEP, pickets++)
        add(0.7, FENCE_PICKET_TOP - FENCE_PLINTH_H, 0.7,
            x, (FENCE_PICKET_TOP + FENCE_PLINTH_H) / 2, fz, M.steel);
    return { z: fz, x0: leadX0, x1: runoutX1, top: FENCE_TOP, posts, pickets };
}

export function buildStationFurniture(M, add, addGeo, reg) {
    let meshes = 0;
    const detailAdd = (...args) => { meshes++; return add(...args); };
    const detailGeo = (...args) => { meshes++; return addGeo(...args); };
    buildPalletRack(M, detailAdd, reg, 10, 24, 4);
    buildPalletRack(M, detailAdd, reg, 18, 27, 4);
    buildPalletRack(M, detailAdd, reg, 11, 34, 4);
    buildCargoContainer(M, detailAdd, reg, 20, 34, 3);
    buildCargoContainer(M, detailAdd, reg, 23, 22, 3);
    buildWorkshop(M, detailAdd, reg, 27, 31);
    buildForklift(M, detailAdd, detailGeo, reg, 20, 43);
    buildDrumCluster(M, detailGeo, reg, 27, 39);
    buildFreightScale(M, detailAdd, reg, 14, 41);
    buildLockerBank(M, detailAdd, reg, 27, 26);
    buildPackingIsland(M, detailAdd, reg, 8, 29);
    buildPackingIsland(M, detailAdd, reg, 15, 45);
    buildPipeRack(M, detailAdd, detailGeo, reg, 8, 36);
    buildPipeRack(M, detailAdd, detailGeo, reg, 25, 38);
    buildDroneDock(M, detailAdd, detailGeo, reg, 14, 31);
    buildDroneDock(M, detailAdd, detailGeo, reg, 20, 48);

    // Peron kini baris 10-16; jalur naik kereta (kolom 7) dibiarkan bersih.
    buildPlatformCart(M, detailAdd, detailGeo, reg, 11, 12);
    buildPlatformCart(M, detailAdd, detailGeo, reg, 18, 12);
    buildPlatformPallets(M, detailAdd, reg, 23, 12);
    buildPlatformBench(M, detailAdd, reg, 9, 15);
    buildSignalCabinet(M, detailAdd, reg, 28, 11);
    buildDrumCluster(M, detailGeo, reg, 20, 15, 'platform');
    return { meshes };
}

export function buildStationDoor(M, root, kind, x, z, sx, sz) {
    const rig = buildSplitDoor(root, M.body, x, (WALL_H - 2) / 2, z,
        sx, WALL_H - 2, sz);
    const lampMat = new THREE.MeshBasicMaterial({ color: DOOR_LOCKED_COLOR, toneMapped: false });
    const lamps = buildDoorSideLights(root, x, z, sx, sz, CELL, WALL_H, lampMat);
    return {
        kind, panel: rig.panel, rig, leaves: rig.leaves, lamps, open: 0, target: 0,
        cx: x, cz: z, ew: !rig.horizontal, hx: sx / 2, hz: sz / 2,
        cell: CELL, linger: 0,
        canOpen: kind !== 'platform',
        blocker: { x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx, sz) / 2, top: WALL_H, standable: false },
    };
}

// --- KONSIST PENYERBU BERLAPIS BAJA (rombak total 2026-08-08, permintaan user
// "kereta musuh ini buat agar bentuknya lebih menyeramkan") -----------------
//
// SEPULUH gerbong angkut TERTUTUP + satu lokomotif perisai berhaluan bajak.
// Tiap gerbong adalah PETI BAJA: dinding jauh, sekat ujung, dan tiang sudut
// setinggi penuh, sementara dinding dekat terdiri atas bagian bawah setinggi
// dada YANG TETAP plus RAMP berengsel di atasnya. Selama ramp tertutup dinding
// dekat setinggi penuh dan isi gerbong benar-benar tak terlihat; begitu ramp
// jatuh keluar seperti pintu bomb-bay, dek + barisan robotnya terbuka.
//
// GEOMETRI TERIKAT GARIS PANDANG (aturan yang sama dengan blok kota Stage 7):
// kamera duduk di +z dan garis pandangnya naik ~1,16 unit per unit jarak tanah,
// jadi (1) dinding dekat yang TETAP wajib <= ~10 unit supaya dek terbaca,
// (2) atap hanya boleh menutup separuh JAUH dek — kalau ia menjorok sampai tepi
// dekat, tepinya memotong kepala robot di barisan tembak, dan (3) ramp yang
// terbuka harus berhenti di ~49 derajat supaya ujungnya tidak menyentuh gerbong
// player di seberang rel.
//
// Lambung statis tiap gerbong DILAS `mergeObjectInPlace` — alasannya sama
// dengan CombatGunship: konsist sepuluh gerbong ini adalah aset hero tunggal,
// jadi kerumitan yang DITULIS boleh tinggi selama yang DIGAMBAR tetap murah.
// Yang tetap berdiri sendiri hanya bagian yang bergerak/berganti visibilitas:
// ramp, lampu peringatan, dan roda.
export const ET_RAMP_OPEN = 0.85;                // rad (~49 derajat)
export const ET_CAR_HEIGHT = 26;                 // tinggi peti baja
export const ET_CAR_SILL = 8;                    // dinding dekat TETAP (setinggi dada)

function buildEnemyCargoCar(M, car, len, half) {
    const H = ET_CAR_HEIGHT, SILL = ET_CAR_SILL, W = half * 2;
    const wallZ = half - 0.9, endX = len / 2 - 1.3;
    const hull = new THREE.Group(); car.add(hull);

    // Rangka bawah: dek + solebar + headstock.
    box(hull, M.ink, len, 3.2, W, 0, -2.0, 0);
    box(hull, M.panel, len - 5, 0.7, W - 2.6, 0, 0.35, 0);
    for (const dz of [-half + 1.1, half - 1.1])
        box(hull, M.ink, len - 2, 2.6, 1.6, 0, -4.2, dz, false);
    for (const s of [-1, 1])
        box(hull, M.ink, 2.4, 3.0, W - 1.2, s * (len / 2 - 1.2), -4.0, 0, false);

    // Dinding jauh setinggi penuh + dinding dekat setinggi dada (TETAP).
    box(hull, M.body, len - 4, H, 1.8, 0, H / 2, -wallZ);
    box(hull, M.body, len - 4, SILL, 1.8, 0, SILL / 2, wallZ);
    box(hull, M.steel, len - 4, 1.1, 2.8, 0, SILL + 0.55, wallZ, false);
    box(hull, M.hazard, len - 26, 1.2, 0.5, 0, SILL - 2.2, half + 0.45, false);
    box(hull, M.tech, len - 34, 0.6, 0.45, 0, 4.4, half + 0.45, false);

    // Sekat ujung + tiang sudut: yang memberi siluet peti tertutup.
    for (const s of [-1, 1]) {
        box(hull, M.body, 2.6, H, W - 0.6, s * endX, H / 2, 0);
        box(hull, M.hazard, 3.0, 1.3, W - 3.2, s * endX, H - 2.0, 0, false);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        box(hull, M.steel, 3.2, H + 1.6, 2.4, sx * endX, (H + 1.6) / 2, sz * wallZ);

    // Atap SEPARUH JAUH saja (lihat aturan garis pandang di atas).
    const roofW = W * 0.58, roofZ = -half + roofW / 2;
    box(hull, M.body, len - 4, 1.8, roofW, 0, H, roofZ);
    for (const dx of [-22, 22]) box(hull, M.steel, 2.2, 1.2, roofW, dx, H + 1.4, roofZ, false);

    // RAMP: engsel di puncak dinding dekat, jatuh KELUAR menjauhi player.
    const ramp = new THREE.Group();
    ramp.position.set(0, SILL, half + 0.15);
    car.add(ramp);
    const RH = H - SILL;
    box(ramp, M.body, len - 4, RH, 1.6, 0, RH / 2, 0);
    box(ramp, M.steel, len - 4, 1.2, 2.4, 0, RH - 0.6, 0, false);
    for (const dx of [-26, 0, 26]) box(ramp, M.steel, 2.2, RH - 2, 1.0, dx, RH / 2, 1.0, false);
    box(ramp, M.hazard, len - 30, 1.6, 0.55, 0, RH * 0.46, 1.1, false);

    // Lampu peringatan gerbong AKTIF: menempel badan (bukan ramp) supaya ia
    // tetap terbaca ketika ramp sudah terlipat keluar.
    const strobe = box(car, M.lamp, len - 42, 1.1, 1.2, 0, SILL + 1.9, half + 1.3, false);
    strobe.visible = false;
    return { hull, ramp, strobe };
}

function buildEnemyLoco(M, car, len, half) {
    const H = ET_CAR_HEIGHT, W = half * 2, endX = len / 2;
    const hull = new THREE.Group(); car.add(hull);
    box(hull, M.ink, len, 3.2, W, 0, -2.0, 0);
    box(hull, M.body, len - 8, H - 2, W - 0.8, -5, (H - 2) / 2 + 1, 0);
    box(hull, M.steel, len - 22, 1.6, W - 4.4, -7, H, 0);
    box(hull, M.panel, 22, 12, W - 0.6, 21, H - 5, 0);
    box(hull, M.glass, 1.4, 4.8, W - 5.4, 32.2, H - 5, 0, false);
    box(hull, M.body, 20, 9, W - 1.4, 28, 5.5, 0);
    // Haluan bajak: kerucut 4 sisi yang menusuk ke depan (+x).
    cylinder(hull, M.ink, 0.6, 12.5, 22, 4, endX + 7, 7, 0, 0, 0, -Math.PI / 2);
    box(hull, M.hazard, 4.0, 3.2, W - 6, endX - 1.5, 3.4, 0, false);
    for (const dz of [-6.4, 6.4]) box(hull, M.lamp, 2.4, 2.8, 3.4, endX - 3, 11.5, dz, false);
    for (const bx of [-30, -18, -6]) cylinder(hull, M.ink, 2.3, 3.0, 7, 8, bx, H + 2.5, -5.5);
    box(hull, M.steel, 1.4, 11, 1.4, 8, H + 5.5, 6.5);
    box(hull, M.lamp, 3.2, 1.2, 3.2, 8, H + 11, 6.5, false);
    for (const dx of [-30, -12, 6]) box(hull, M.steel, 2.2, H - 8, 1.1, dx, (H - 8) / 2 + 1, half + 0.3, false);
    box(hull, M.tech, len - 40, 0.7, 0.5, 0, H - 6, half + 0.45, false);
    // ===== DUA SENJATA DI ATAP (2026-08-09, permintaan user: lokomotif jadi
    // mini boss). Keduanya sudah TERPASANG sejak konsist muncul tetapi mati —
    // larasnya mengarah LURUS KE DEPAN (arah laju kereta, +x). Mereka BUKAN
    // anak `hull`: hull dilas jadi satu mesh, sementara kedua dudukan ini harus
    // bisa berputar (yaw) saat mengunci sasaran. Tiap senjata = grup dudukan
    // (statis) + grup putar berisi larasnya, plus satu anchor moncong yang
    // dibaca runtime lewat getWorldPosition.
    const turret = (bx, scale, barrelLen, barrelR, mat) => {
        const base = new THREE.Group(); base.position.set(bx, H + 1.6, 0); car.add(base);
        box(base, M.ink, 9 * scale, 2.2, 9 * scale, 0, 1.1, 0);
        const yaw = new THREE.Group(); yaw.position.y = 2.6; base.add(yaw);
        box(yaw, M.body, 7 * scale, 4.2, 7.4 * scale, 0, 2.1, 0);
        // Laras di +x: "mengarah ke depan arah kereta" saat idle (yaw = 0).
        cylinder(yaw, mat, barrelR, barrelR, barrelLen, 8,
            barrelLen / 2 + 3, 2.6, 0, 0, 0, -Math.PI / 2);
        const muzzle = new THREE.Object3D();
        muzzle.position.set(barrelLen + 3.4, 2.6, 0); yaw.add(muzzle);
        return { base, yaw, muzzle };
    };
    // MG: laras ramping panjang. GL: laras pendek gemuk — siluetnya harus bisa
    // dibedakan dari jarak kamera oblique.
    const mg = turret(-2, 1, 15, 0.85, M.steel);
    const gl = turret(-24, 1.15, 8.5, 1.9, M.ink);
    // Strip peringatan yang menyala saat senjata aktif. WAJIB di luar `hull`:
    // hull dilas jadi satu mesh, dan apa pun yang di-toggle `visible` tak boleh
    // ikut terlas (aturan meshBatch).
    const warn = box(car, M.hazard, 16, 0.9, 1.0, -12, H + 0.6, half - 1.2, false);
    warn.visible = false;
    return { hull, weapons: { mg, gl, warn } };
}

// Konsist musuh statis-prealokasi: `cargoCars` peti baja + satu lokomotif di
// indeks `cargoCars`. Gerbong 0 adalah gerbong PALING BELAKANG — yang pertama
// disejajarkan dengan gerbong player. Tidak ada mesh/material yang dibuat saat
// runtime: runtime hanya memutar ramp, menyalakan lampu, menggeser bangkai, dan
// mematikan `visible` gerbong yang sudah terlepas.
export function buildEnemyTrain(M, root, cargoCars, len, step, half, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const carGroups = [], hulls = [], ramps = [], strobes = [], wheels = [], gauge = 4.2;
    let locoWeapons = null;
    for (let i = 0; i <= cargoCars; i++) {
        const car = new THREE.Group(); car.position.x = i * step; g.add(car);
        const parts = i === cargoCars
            ? buildEnemyLoco(M, car, len, half)
            : buildEnemyCargoCar(M, car, len, half);
        if (parts.weapons) locoWeapons = parts.weapons;
        hulls.push(parts.hull);
        if (parts.ramp) { ramps.push(parts.ramp); strobes.push(parts.strobe); }
        // Bogie: hanya roda sisi DEKAT yang dibuat — sisi jauh selalu tertutup
        // badan gerbong, jadi 4 mesh berputar per gerbong (bukan 8) sudah cukup.
        for (const bx of [-len * 0.29, len * 0.29]) {
            box(parts.hull, M.ink, 22, 4.4, gauge * 2 + 3, bx, -3.6, 0, false);
            for (const wx of [-6.5, 6.5])
                wheels.push(cylinder(car, M.steel, 3.4, 3.4, 1.6, 10, bx + wx, -3.4, gauge, Math.PI / 2));
        }
        mergeObjectInPlace(parts.hull);
        if (parts.ramp) mergeObjectInPlace(parts.ramp);
        carGroups.push(car);
    }
    root.add(g);
    // POOL GRANAT LOKOMOTIF (mini boss 2026-08-09). Prealokasi wajib: peluru
    // MG menumpang pool peluru robot yang sudah ada, tetapi granat lob punya
    // mesh sendiri — dibuat SEKALI di sini, disembunyikan, dan dipasang pada
    // `root` (worldRoot, tidak ikut bergerak) supaya lintasannya berada di
    // koordinat dunia, bukan koordinat konsist yang bergeser.
    const grenades = [];
    const gGeo = new THREE.SphereGeometry(1.9, 8, 6);
    const gMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
    for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(gGeo, gMat);
        m.visible = false; root.add(m);
        grenades.push({ mesh: m, live: false, t: 0, dur: 0, x0: 0, z0: 0, y0: 0, tx: 0, tz: 0 });
    }
    return {
        group: g, cars: carGroups, hulls, ramps, strobes, wheels, step, len, half,
        wheelPhase: 0, weapons: locoWeapons, grenades,
    };
}
