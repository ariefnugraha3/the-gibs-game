// Stage 5 — BUILDER PROP STATIS: landmark C1/C2, perabot depot/peron, pintu
// stasiun, dan konsist kereta musuh. Semuanya fungsi murni "bangun lalu
// kembalikan"; state dunia (blocker, daftar perabot, root) tetap milik
// world.js dan hanya dititipkan lewat parameter.

import { PAL } from '../../../../world/palette.js';
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
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.RingGeometry(7, 9, 24), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.15, z); m.visible = false;
    parent.add(m); return m;
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

    // Peron kini baris 10-16; jalur naik kereta (kolom 7) dibiarkan bersih.
    buildPlatformCart(M, add, addGeo, reg, 11, 12);
    buildPlatformCart(M, add, addGeo, reg, 18, 12);
    buildPlatformPallets(M, add, reg, 23, 12);
    buildPlatformBench(M, add, reg, 9, 15);
    buildSignalCabinet(M, add, reg, 28, 11);
    buildDrumCluster(M, addGeo, reg, 20, 15, 'platform');
}

export function buildStationDoor(M, root, kind, x, z, sx, sz) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H - 2, sz), M.body);
    panel.position.set(x, (WALL_H - 2) / 2, z); panel.castShadow = true; panel.receiveShadow = true;
    root.add(panel);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(kind === 'platform' ? 5 : 1, 1.2, kind === 'platform' ? 1 : 5),
        new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }));
    lamp.position.set(x, WALL_H - 3, z); root.add(lamp);
    return {
        kind, panel, lamp, open: 0, target: 0,
        blocker: { x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx, sz) / 2, top: WALL_H, standable: false },
    };
}

// Konsist musuh statis-prealokasi: `cars-1` gerbong angkut terbuka + satu
// lokomotif. Sejak rombak 2026-08-07 ia selebar 4 m persis seperti kereta
// player, dan gerbongnya adalah DEK TERBUKA — robot yang bertengger di sana
// harus terbaca dari kamera oblique, jadi dindingnya setinggi dada saja.
// Jumlah gerbong yang dipakai per gelombang diatur runtime lewat `visible`;
// tidak ada mesh/material yang dibuat saat runtime.
export function buildEnemyTrain(M, root, cars, len, step, half, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const carGroups = [], wheels = [], gauge = 4.2;
    for (let i = 0; i < cars; i++) {
        const car = new THREE.Group(); car.position.x = i * step; g.add(car);
        const loco = i === cars - 1;
        box(car, M.ink, len, 3.2, half * 2, 0, -2.0, 0);
        box(car, M.panel, len - 5, 0.7, half * 2 - 2.6, 0, 0.35, 0);
        for (const dz of [-half + 0.6, half - 0.6])
            box(car, M.hazard, len - 3, 1.5, 1.0, 0, 0.4, dz, false);
        if (loco) {
            box(car, M.body, len - 3, 20, half * 2 - 0.6, -5, 11, 0);
            box(car, M.steel, len - 14, 1.5, half * 2 - 3.4, -5, 21.5, 0);
            box(car, M.panel, 24, 11, half * 2 - 0.4, 26, 15.5, 0);
            box(car, M.glass, 1.2, 6, half * 2 - 4.2, 38.4, 17.4, 0, false);
            box(car, M.body, 18, 8, half * 2 - 1.2, 32, 5, 0);
            box(car, M.hazard, 7, 3, half * 2 - 3, len / 2 - 2, 3.2, 0);
            for (const dz of [-5.2, 5.2]) box(car, M.lamp, 2, 2.4, 3, len / 2 - 5, 8, dz, false);
            for (const bx of [-28, -10]) cylinder(car, M.ink, 2.2, 2.8, 6, 10, bx, 24, 0);
        } else {
            // Gerbong angkut: dek terbuka, dinding setinggi dada, tiang sudut.
            for (const dz of [-half + 0.55, half - 0.55]) {
                box(car, M.body, len - 5, 8, 1.1, 0, 4, dz);
                box(car, M.steel, len - 5, 0.9, 1.7, 0, 8, dz, false);
            }
            for (const dx of [-len / 2 + 1.4, len / 2 - 1.4]) {
                box(car, M.body, 2.6, 14, half * 2 - 0.8, dx, 7, 0);
                box(car, M.hazard, 3.0, 1.2, half * 2 - 2.4, dx, 14.2, 0, false);
            }
            // Rak amunisi menempel dinding jauh; sisi menghadap player dibiarkan
            // bersih supaya siluet robot yang bertengger tidak terpotong.
            for (const dx of [-24, 0, 24]) {
                box(car, M.panel, 14, 4.2, 1.2, dx, 5.6, -half + 1.7, false);
                box(car, M.tech, 8, 0.5, 0.7, dx, 7.4, -half + 2.4, false);
            }
        }
        for (const bx of [-len * 0.29, len * 0.29]) {
            box(car, M.ink, 22, 4.4, gauge * 2 + 3, bx, -3.6, 0);
            for (const wx of [-6.5, 6.5]) for (const wz of [-gauge, gauge])
                wheels.push(cylinder(car, M.steel, 3.4, 3.4, 1.6, 10, bx + wx, -3.4, wz, Math.PI / 2));
        }
        carGroups.push(car);
    }
    root.add(g);
    return { group: g, cars: carGroups, wheels, step, len, half, wheelPhase: 0 };
}
