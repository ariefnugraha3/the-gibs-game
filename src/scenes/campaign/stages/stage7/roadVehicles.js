// Kendaraan sipil/niaga mogok khusus Stage 7. Semua model memakai geometri
// low-poly, panjang lokal di sumbu +X, dasar ban di y=0, dan ukuran meter nyata
// yang juga menjadi sumber footprint collision di index.js.

import { PAL } from '../../../../world/palette.js';

export const STAGE7_ROAD_VEHICLE_SPECS = Object.freeze({
    sedan: Object.freeze({ length: 4.8, width: 2.0, height: 1.55 }),
    suv: Object.freeze({ length: 4.8, width: 2.2, height: 2.2 }),
    pickup: Object.freeze({ length: 5.3, width: 2.2, height: 2.05 }),
    'container-truck': Object.freeze({ length: 12.0, width: 2.5, height: 4.0 }),
    'dump-truck': Object.freeze({ length: 8.5, width: 2.5, height: 3.45 }),
    bus: Object.freeze({ length: 12.0, width: 2.5, height: 3.35 }),
    'tanker-truck': Object.freeze({ length: 10.5, width: 2.5, height: 3.6 }),
});

export const STAGE7_EXTRA_VEHICLE_TYPES = Object.freeze([
    'container-truck', 'dump-truck', 'bus', 'tanker-truck', 'pickup',
]);

function materials(bodyColor) {
    return {
        body: new THREE.MeshLambertMaterial({ color: bodyColor }),
        body2: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        tire: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg }),
        pale: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        lamp: new THREE.MeshLambertMaterial({
            color: PAL.white, emissive: PAL.white, emissiveIntensity: 0.32,
        }),
        tail: new THREE.MeshLambertMaterial({
            color: PAL.hazard, emissive: PAL.hazard, emissiveIntensity: 0.28,
        }),
    };
}

function mesh(parent, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function box(parent, material, sx, sy, sz, x, y, z, rz = 0) {
    return mesh(parent, new THREE.BoxGeometry(sx, sy, sz), material,
        x, y, z, 0, 0, rz);
}

function wheel(parent, M, x, z, radius = 0.48) {
    const geo = new THREE.CylinderGeometry(radius, radius, 0.32, 10);
    geo.rotateX(Math.PI / 2);
    return mesh(parent, geo, M.tire, x, radius, z);
}

function truckCab(group, M, x, width = 2.34, height = 2.45) {
    box(group, M.body, 2.55, 0.72, width, x, 1.08, 0);
    box(group, M.body, 1.95, height - 0.72, width * 0.94,
        x - 0.12, 1.44 + (height - 0.72) / 2, 0);
    box(group, M.glass, 0.08, 0.68, width * 0.72,
        x + 0.88, height - 0.46, 0, -0.08);
    box(group, M.dark, 0.18, 0.48, width + 0.08, x + 1.31, 0.82, 0);
    for (const z of [-width * 0.3, width * 0.3])
        box(group, M.lamp, 0.06, 0.18, 0.34, x + 1.42, 1.18, z);
}

function buildPickup(group, M) {
    box(group, M.dark, 5.15, 0.36, 2.04, 0, 0.62, 0);
    box(group, M.body, 2.2, 0.72, 2.08, 1.35, 1.05, 0);
    box(group, M.body, 1.55, 0.88, 1.98, 0.92, 1.78, 0);
    box(group, M.glass, 0.07, 0.55, 1.65, 1.74, 1.88, 0, -0.38);
    box(group, M.steel, 2.42, 0.14, 1.86, -1.35, 1.02, 0);
    for (const z of [-1.01, 1.01])
        box(group, M.body, 2.48, 0.72, 0.12, -1.35, 1.42, z);
    box(group, M.body, 0.12, 0.72, 1.98, -2.55, 1.42, 0);
    box(group, M.lamp, 0.06, 0.14, 1.5, 2.62, 1.15, 0);
    box(group, M.tail, 0.06, 0.16, 1.48, -2.62, 1.18, 0);
    for (const x of [-1.72, 1.62]) for (const z of [-1.08, 1.08])
        wheel(group, M, x, z, 0.43);
}

function buildContainerTruck(group, M) {
    box(group, M.dark, 11.7, 0.42, 2.35, 0, 0.72, 0);
    truckCab(group, M, 4.38);
    box(group, M.body2, 7.75, 2.62, 2.42, -1.72, 2.48, 0);
    for (const x of [-4.7, -3.25, -1.8, -0.35, 1.75])
        box(group, M.steel, 0.10, 2.68, 2.48, x, 2.48, 0);
    box(group, M.dark, 0.10, 2.28, 2.12, -5.62, 2.46, 0);
    for (const x of [-4.35, -3.15, 3.95]) for (const z of [-1.24, 1.24])
        wheel(group, M, x, z, 0.52);
}

function buildDumpTruck(group, M) {
    box(group, M.dark, 8.15, 0.46, 2.38, 0, 0.76, 0);
    truckCab(group, M, 2.75);
    box(group, M.steel, 4.62, 0.18, 2.2, -1.55, 1.42, 0, -0.06);
    for (const z of [-1.16, 1.16])
        box(group, M.body2, 4.75, 1.35, 0.16, -1.62, 2.08, z, -0.06);
    box(group, M.body2, 0.18, 1.35, 2.3, -3.94, 2.08, 0, -0.06);
    box(group, M.body2, 0.18, 1.05, 2.3, 0.66, 1.92, 0, -0.06);
    const ram = new THREE.CylinderGeometry(0.12, 0.12, 1.55, 8);
    mesh(group, ram, M.steel, -0.45, 1.45, 0, 0, 0, -0.63);
    for (const x of [-2.75, -1.65, 2.55]) for (const z of [-1.24, 1.24])
        wheel(group, M, x, z, 0.53);
}

function buildBus(group, M) {
    box(group, M.dark, 11.85, 0.38, 2.42, 0, 0.64, 0);
    box(group, M.body, 11.65, 1.35, 2.38, 0, 1.38, 0);
    box(group, M.body2, 11.35, 1.35, 2.28, -0.1, 2.68, 0);
    for (const z of [-1.17, 1.17])
        box(group, M.glass, 8.7, 0.62, 0.05, 0.15, 2.72, z);
    box(group, M.glass, 0.06, 0.78, 1.82, 5.72, 2.62, 0, -0.08);
    box(group, M.body, 10.9, 0.12, 2.12, -0.15, 3.39, 0);
    box(group, M.dark, 0.16, 0.48, 2.5, 5.94, 0.82, 0);
    box(group, M.dark, 0.16, 0.48, 2.5, -5.94, 0.82, 0);
    box(group, M.lamp, 0.05, 0.16, 1.62, 5.99, 1.38, 0);
    box(group, M.tail, 0.05, 0.16, 1.62, -5.99, 1.38, 0);
    for (const x of [-4.05, 4.18]) for (const z of [-1.25, 1.25])
        wheel(group, M, x, z, 0.54);
}

function buildTankerTruck(group, M) {
    box(group, M.dark, 10.15, 0.42, 2.38, 0, 0.72, 0);
    truckCab(group, M, 3.65);
    for (const x of [-3.1, 0.15])
        box(group, M.steel, 0.58, 0.48, 2.08, x, 1.2, 0);
    const tank = new THREE.CylinderGeometry(1.18, 1.18, 6.55, 12, 1, false);
    tank.rotateZ(Math.PI / 2);
    mesh(group, tank, M.pale, -1.45, 2.34, 0);
    for (const x of [-4.02, -2.12, 0.02]) {
        const band = new THREE.CylinderGeometry(1.23, 1.23, 0.11, 12, 1, false);
        band.rotateZ(Math.PI / 2); mesh(group, band, M.steel, x, 2.34, 0);
    }
    box(group, M.dark, 5.85, 0.08, 0.36, -1.48, 3.56, 0);
    for (const x of [-3.65, -2.55, 3.38]) for (const z of [-1.24, 1.24])
        wheel(group, M, x, z, 0.52);
}

export function buildStage7RoadVehicle(type, bodyColor = PAL.gunmetal, scale = 1) {
    if (!STAGE7_EXTRA_VEHICLE_TYPES.includes(type)) return null;
    const group = new THREE.Group();
    group.name = `Stage7-${type}`;
    const M = materials(bodyColor);
    if (type === 'pickup') buildPickup(group, M);
    else if (type === 'container-truck') buildContainerTruck(group, M);
    else if (type === 'dump-truck') buildDumpTruck(group, M);
    else if (type === 'bus') buildBus(group, M);
    else if (type === 'tanker-truck') buildTankerTruck(group, M);
    group.scale.setScalar(scale);
    group.userData.stage7VehicleType = type;
    group.userData.dimensionsMeters = STAGE7_ROAD_VEHICLE_SPECS[type];
    return group;
}

