// GARUDA LTV-45 — kendaraan taktis hero untuk outro Stage 7 dan arena Stage 8.
// Desain generik 2045 (bukan replika/merek kendaraan dunia nyata): bodi lapis
// baja bersudut, bull bar + winch, sensor atap, pintu pengemudi animatif,
// dashboard rute, dan dudukan senjata kosong. Tidak ada PointLight; seluruh
// animasi hanya mengubah transform/material yang sudah dibuat.

import { PAL, EMISSIVE_MAX } from '../world/palette.js';
import { makeTexture } from '../utils/textures.js';

function dashboardTexture() {
    return makeTexture(512, 160, (g, w, h) => {
        g.fillStyle = '#11130f'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#bd8b42'; g.lineWidth = 7; g.strokeRect(6, 6, w - 12, h - 12);
        g.fillStyle = '#f0dfbc'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 29px monospace'; g.fillText('CISUMDAWU', w / 2, 54);
        g.fillStyle = '#c89445'; g.font = '22px monospace';
        g.fillText('KERTAJATI INTERNATIONAL AIRPORT', w / 2, 112);
    });
}

function mk(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

/**
 * Hero vehicle. Model lokal memanjang di X (depan = +X), dasar ban y=0.
 * @param {number} scale skala dunia (default 7 unit per meter)
 * @param {number|null} bodyColor warna cat PAL, null = PAL.gunmetal
 */
export function buildTacticalVehicleMesh(scale = 7, bodyColor = null) {
    const group = new THREE.Group(); group.name = 'GarudaLTV45';
    const M = {
        body: new THREE.MeshLambertMaterial({ color: bodyColor ?? PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        rubber: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true,
            opacity: 0.72, emissive: PAL.techDim, emissiveIntensity: 0.12 }),
        head: new THREE.MeshLambertMaterial({ color: PAL.white, emissive: PAL.white,
            emissiveIntensity: 0 }),
        tail: new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard,
            emissiveIntensity: 0 }),
        amber: new THREE.MeshLambertMaterial({ color: PAL.amberDim, emissive: PAL.amber,
            emissiveIntensity: 0 }),
        dash: new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.techDim,
            emissiveIntensity: 0, map: dashboardTexture() }),
    };

    // Chassis dan lapisan armor miring. Bentuk tetap proporsional dan mudah
    // dibaca dari kamera top-down, tanpa detail mikro yang boros draw call.
    mk(group, new THREE.BoxGeometry(5.7, 0.75, 2.28), M.ink, 0, 0.76, 0);
    mk(group, new THREE.BoxGeometry(5.2, 0.82, 2.12), M.body, -0.05, 1.27, 0);
    mk(group, new THREE.BoxGeometry(2.95, 0.76, 1.94), M.panel, -0.50, 1.98, 0);
    mk(group, new THREE.BoxGeometry(1.10, 0.58, 1.98), M.body, 1.72, 1.75, 0, 0, 0, -0.18);
    mk(group, new THREE.BoxGeometry(0.88, 0.06, 1.78), M.glass, 1.08, 2.18, 0, 0, 0, -0.72);
    mk(group, new THREE.BoxGeometry(1.65, 0.08, 1.80), M.glass, -0.60, 2.38, 0);
    mk(group, new THREE.BoxGeometry(2.75, 0.13, 1.88), M.body, -0.48, 2.47, 0);
    // Fender dan panel samping memperkuat siluet lapis baja.
    for (const z of [-1.12, 1.12]) {
        mk(group, new THREE.BoxGeometry(5.0, 0.30, 0.15), M.panel, -0.05, 1.12, z);
        for (const x of [-1.75, 1.65])
            mk(group, new THREE.BoxGeometry(1.18, 0.22, 0.18), M.body, x, 0.83, z);
    }

    // Bull bar, winch, recovery points, dan skid plate.
    const ram = new THREE.Group(); ram.position.set(3.03, 0, 0); group.add(ram);
    mk(ram, new THREE.BoxGeometry(0.18, 1.05, 2.26), M.steel, 0, 0.92, 0);
    mk(ram, new THREE.BoxGeometry(0.18, 0.18, 2.72), M.ink, 0.16, 1.35, 0);
    for (const z of [-1.18, 1.18]) mk(ram, new THREE.BoxGeometry(0.35, 0.70, 0.18), M.ink, 0.14, 0.84, z);
    mk(ram, new THREE.CylinderGeometry(0.25, 0.25, 0.82, 12), M.steel,
        -0.12, 0.72, 0, Math.PI / 2);
    mk(group, new THREE.BoxGeometry(0.64, 0.16, 1.65), M.steel, 2.57, 0.36, 0, 0, 0, -0.18);

    // Lampu tanpa PointLight: emissive dinyalakan oleh update visual.
    const headlights = [
        mk(group, new THREE.BoxGeometry(0.08, 0.22, 0.70), M.head, 2.79, 1.52, -0.67),
        mk(group, new THREE.BoxGeometry(0.08, 0.22, 0.70), M.head, 2.79, 1.52, 0.67),
    ];
    const taillights = [
        mk(group, new THREE.BoxGeometry(0.08, 0.25, 0.54), M.tail, -2.69, 1.47, -0.72),
        mk(group, new THREE.BoxGeometry(0.08, 0.25, 0.54), M.tail, -2.69, 1.47, 0.72),
    ];

    // Sensor pod dan dudukan senjata kosong (tidak ada senjata/boss mechanic).
    const sensor = new THREE.Group(); sensor.position.set(0.25, 2.58, 0); group.add(sensor);
    mk(sensor, new THREE.CylinderGeometry(0.24, 0.30, 0.22, 10), M.ink, 0, 0, 0);
    mk(sensor, new THREE.BoxGeometry(0.46, 0.16, 0.34), M.amber, 0.08, 0.18, 0);
    const mount = new THREE.Group(); mount.position.set(-0.62, 2.56, 0); group.add(mount);
    mk(mount, new THREE.CylinderGeometry(0.43, 0.52, 0.20, 12), M.steel, 0, 0, 0);
    mk(mount, new THREE.TorusGeometry(0.39, 0.07, 6, 14), M.ink, 0, 0.16, 0, Math.PI / 2);
    // Roof hatch tempur Stage 8. Dua daun bergeser ke sisi kabin; gunnerMount
    // adalah anchor publik tempat scene menaruh pivot logika/pose Major.
    const roofHatch = new THREE.Group(); roofHatch.position.set(-0.62, 2.57, 0); group.add(roofHatch);
    const hatchLeaves = [
        mk(roofHatch, new THREE.BoxGeometry(0.78, 0.09, 0.46), M.body, 0, 0.11, -0.24),
        mk(roofHatch, new THREE.BoxGeometry(0.78, 0.09, 0.46), M.body, 0, 0.11, 0.24),
    ];
    const gunnerMount = new THREE.Object3D(); gunnerMount.position.set(-0.62, 2.72, 0); group.add(gunnerMount);

    // Pintu pengemudi sisi +Z memakai pivot engsel belakang.
    const driverDoor = new THREE.Group(); driverDoor.position.set(-1.48, 1.72, 1.08); group.add(driverDoor);
    mk(driverDoor, new THREE.BoxGeometry(1.62, 1.32, 0.12), M.body, 0.81, 0, 0);
    mk(driverDoor, new THREE.BoxGeometry(1.18, 0.52, 0.08), M.glass, 0.75, 0.38, 0.08);
    mk(driverDoor, new THREE.BoxGeometry(0.24, 0.10, 0.12), M.steel, 1.32, -0.04, 0.12);

    // Dashboard berada di kabin dan terlihat saat pintu terbuka/camera close-up.
    const dashboard = mk(group, new THREE.BoxGeometry(0.08, 0.58, 1.30), M.dash,
        0.58, 1.87, 0, 0, 0, 0.30);

    // Roda besar, poros Z, menapak y=0.
    const wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.42, 14); wheelGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.46, 10); hubGeo.rotateX(Math.PI / 2);
    for (const x of [-1.82, 1.72]) for (const z of [-1.17, 1.17]) {
        wheels.push(mk(group, wheelGeo, M.rubber, x, 0.62, z));
        mk(group, hubGeo, M.steel, x, 0.62, z);
    }

    group.scale.setScalar(scale);
    const vehicle = {
        group, wheels, driverDoor, headlights, taillights, dashboard, barrierRam: ram,
        sensor, mount, roofHatch, hatchLeaves, gunnerMount, materials: M,
        wheelPhase: 0, doorOpen: 0, hatchOpen: 0, engineOn: false,
        speed: 0, baseY: 0,
    };
    group.userData.tacticalVehicle = vehicle;
    resetTacticalVehicleVisual(vehicle);
    return vehicle;
}

export function resetTacticalVehicleVisual(vehicle) {
    if (!vehicle) return;
    vehicle.wheelPhase = 0; vehicle.doorOpen = 0; vehicle.hatchOpen = 0;
    vehicle.engineOn = false; vehicle.speed = 0;
    vehicle.driverDoor.rotation.y = 0;
    if (vehicle.hatchLeaves) {
        vehicle.hatchLeaves[0].position.z = -0.24;
        vehicle.hatchLeaves[1].position.z = 0.24;
    }
    for (const w of vehicle.wheels) w.rotation.z = 0;
    vehicle.materials.head.emissiveIntensity = 0;
    vehicle.materials.tail.emissiveIntensity = 0;
    vehicle.materials.amber.emissiveIntensity = 0;
    vehicle.materials.dash.emissiveIntensity = 0;
    vehicle.group.position.y = vehicle.baseY || 0;
}

export function updateTacticalVehicleVisual(vehicle, dt, state = {}) {
    if (!vehicle) return;
    const doorTarget = Math.max(0, Math.min(1, Number(state.doorOpen ?? vehicle.doorOpen)));
    vehicle.doorOpen += (doorTarget - vehicle.doorOpen) * Math.min(1, dt * 5.5);
    const e = vehicle.doorOpen * vehicle.doorOpen * (3 - 2 * vehicle.doorOpen);
    vehicle.driverDoor.rotation.y = -1.18 * e;

    const hatchTarget = Math.max(0, Math.min(1, Number(state.hatchOpen ?? vehicle.hatchOpen)));
    vehicle.hatchOpen += (hatchTarget - vehicle.hatchOpen) * Math.min(1, dt * 6.5);
    const he = vehicle.hatchOpen * vehicle.hatchOpen * (3 - 2 * vehicle.hatchOpen);
    if (vehicle.hatchLeaves) {
        vehicle.hatchLeaves[0].position.z = -0.24 - he * 0.58;
        vehicle.hatchLeaves[1].position.z = 0.24 + he * 0.58;
    }

    vehicle.engineOn = state.engineOn == null ? vehicle.engineOn : !!state.engineOn;
    vehicle.speed = Number.isFinite(state.speed) ? Math.max(0, state.speed) : vehicle.speed;
    vehicle.wheelPhase += dt * vehicle.speed * 0.12;
    for (const w of vehicle.wheels) w.rotation.z = -vehicle.wheelPhase;

    const on = vehicle.engineOn ? 1 : 0;
    vehicle.materials.head.emissiveIntensity = EMISSIVE_MAX * 0.94 * on;
    vehicle.materials.tail.emissiveIntensity = EMISSIVE_MAX * 0.70 * on;
    vehicle.materials.amber.emissiveIntensity = EMISSIVE_MAX * (0.35 + Math.sin(vehicle.wheelPhase * 0.35) * 0.12) * on;
    vehicle.materials.dash.emissiveIntensity = EMISSIVE_MAX * 0.62 * on;
    vehicle.sensor.rotation.y += dt * (vehicle.engineOn ? 0.85 : 0.12);
    vehicle.group.position.y = (vehicle.baseY || 0) + (vehicle.engineOn ? Math.sin(vehicle.wheelPhase * 0.7) * 0.08 : 0);
}

export function tacticalVehicleDebug(vehicle) {
    return {
        built: !!vehicle,
        wheels: vehicle?.wheels?.length || 0,
        doorOpen: vehicle?.doorOpen || 0,
        hatchOpen: vehicle?.hatchOpen || 0,
        doorYaw: vehicle?.driverDoor?.rotation?.y || 0,
        engineOn: !!vehicle?.engineOn,
        wheelPhase: vehicle?.wheelPhase || 0,
        speed: vehicle?.speed || 0,
        lights: vehicle ? {
            head: vehicle.materials.head.emissiveIntensity,
            tail: vehicle.materials.tail.emissiveIntensity,
            dash: vehicle.materials.dash.emissiveIntensity,
        } : { head: 0, tail: 0, dash: 0 },
        position: vehicle ? {
            x: vehicle.group.position.x, y: vehicle.group.position.y, z: vehicle.group.position.z,
        } : null,
    };
}
