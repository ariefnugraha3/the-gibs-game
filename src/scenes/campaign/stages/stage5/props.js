// Stage 5 — BUILDER PROP STATIS: landmark C1/C2, perabot depot/peron, pintu
// stasiun, dan konsist kereta musuh. Semuanya fungsi murni "bangun lalu
// kembalikan"; state dunia (blocker, daftar perabot, root) tetap milik
// world.js dan hanya dititipkan lewat parameter.

import { PAL } from '../../../../world/palette.js';
import { mergeObjectInPlace } from '../../../../utils/meshBatch.js';
import { buildSplitDoor } from '../../utility/doors.js';
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

export function buildMarker(parent, x, z, color) {
    // Persis pola `buildStandMarker` Stage 1/2: bidang amber 12×12 dengan
    // empat bar tebal. Marker adalah AREA PIJAK, bukan cincin waypoint.
    const g = new THREE.Group();
    const fillMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false,
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fillMat);
    fill.rotation.x = -Math.PI / 2; fill.position.y = 0.14; g.add(fill);
    const barMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const [sx, sz, px, pz] of [
        [12, 1, 0, -6], [12, 1, 0, 6], [1, 12, -6, 0], [1, 12, 6, 0],
    ]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), barMat);
        bar.position.set(px, 0.22, pz); g.add(bar);
    }
    // Alias material menjaga animator/debug lama tanpa membuat material baru.
    g.material = fillMat; g.userData.fill = fill; g.userData.bars = 4;
    g.position.set(x, 0, z); g.visible = false;
    parent.add(g); return g;
}

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
    }
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
    reg('platform', 'dispatch-bench', p, 16, 5, 16);
}

function buildSignalCabinet(M, add, reg, c, r) {
    const p = cellPos(c, r);
    add(13, 20, 11, p.x, 10, p.z, M.body);
    add(10.5, 16, 0.8, p.x, 10, p.z + 5.8, M.panel);
    for (const x of [-3, 0, 3]) add(1.2, 8, 0.9, p.x + x, 11, p.z + 6.3, M.ink);
    add(8, 3.5, 1, p.x, 16, p.z + 6.5, M.tech);
    add(11, 1, 1, p.x, 19, p.z + 5.9, M.hazard);
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

export function buildStationFurniture(M, add, addGeo, reg) {
    buildPalletRack(M, add, reg, 10, 24, 4);
    buildPalletRack(M, add, reg, 18, 27, 4);
    buildPalletRack(M, add, reg, 11, 34, 4);
    buildCargoContainer(M, add, reg, 20, 34, 3);
    buildCargoContainer(M, add, reg, 23, 22, 3);
    buildWorkshop(M, add, reg, 27, 31);
    buildForklift(M, add, addGeo, reg, 20, 43);
    buildDrumCluster(M, addGeo, reg, 27, 39);
    buildFreightScale(M, add, reg, 14, 41);
    buildLockerBank(M, add, reg, 27, 26);
    buildPackingIsland(M, add, reg, 8, 29);
    buildPackingIsland(M, add, reg, 15, 45);
    buildPipeRack(M, add, addGeo, reg, 8, 36);
    buildPipeRack(M, add, addGeo, reg, 25, 38);
    buildDroneDock(M, add, addGeo, reg, 14, 31);
    buildDroneDock(M, add, addGeo, reg, 20, 48);

    // Peron kini baris 10-16; jalur naik kereta (kolom 7) dibiarkan bersih.
    buildPlatformCart(M, add, addGeo, reg, 11, 12);
    buildPlatformCart(M, add, addGeo, reg, 18, 12);
    buildPlatformPallets(M, add, reg, 23, 12);
    buildPlatformBench(M, add, reg, 9, 15);
    buildSignalCabinet(M, add, reg, 28, 11);
    buildDrumCluster(M, addGeo, reg, 20, 15, 'platform');
}

export function buildStationDoor(M, root, kind, x, z, sx, sz) {
    const rig = buildSplitDoor(root, M.body, x, (WALL_H - 2) / 2, z,
        sx, WALL_H - 2, sz);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(kind === 'platform' ? 5 : 1, 1.2, kind === 'platform' ? 1 : 5),
        new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }));
    lamp.position.set(x, WALL_H - 3, z); root.add(lamp);
    return {
        kind, panel: rig.panel, rig, leaves: rig.leaves, lamp, open: 0, target: 0,
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
    return { hull };
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
    for (let i = 0; i <= cargoCars; i++) {
        const car = new THREE.Group(); car.position.x = i * step; g.add(car);
        const parts = i === cargoCars
            ? buildEnemyLoco(M, car, len, half)
            : buildEnemyCargoCar(M, car, len, half);
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
    return { group: g, cars: carGroups, hulls, ramps, strobes, wheels, step, len, half, wheelPhase: 0 };
}
