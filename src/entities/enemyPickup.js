// N.U.S.A. RAVEN-K — pickup bak terbuka futuristis untuk pengejar Stage 8.
// Entity visual saja: tiga robot penumpang tetap entity robot standar dan
// ditempel scene ke passengerOffsets. Chassis sengaja tidak mempunyai HP.

import { PAL, EMISSIVE_MAX } from '../world/palette.js';

// Carrier juga harus muat di lajur 2,5 m. Sedikit lebih lebar dari GARUDA
// untuk ruang tiga rider, tetapi masih menyisakan clearance terhadap marka.
export const ENEMY_PICKUP_DIMENSIONS = Object.freeze({
    length: 5.15, width: 2.30, height: 2.25,
});
const AUTHORED_DIMENSIONS = Object.freeze({ length: 5.88, width: 2.88, height: 3.08 });
const MODEL_RATIO = Object.freeze({
    x: ENEMY_PICKUP_DIMENSIONS.length / AUTHORED_DIMENSIONS.length,
    y: ENEMY_PICKUP_DIMENSIONS.height / AUTHORED_DIMENSIONS.height,
    z: ENEMY_PICKUP_DIMENSIONS.width / AUTHORED_DIMENSIONS.width,
});

function mk(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

export function buildEnemyPickupMesh(scale = 7) {
    const group = new THREE.Group(); group.name = 'NUSA-Raven-K';
    const M = {
        armor: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        rubber: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true,
            opacity: 0.78, emissive: PAL.techDim, emissiveIntensity: 0.08 }),
        lamp: new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard,
            emissiveIntensity: 0 }),
    };

    // Sasis, kap berlapis, kabin miring, dan bak terbuka berpanel tinggi.
    mk(group, new THREE.BoxGeometry(6.15, 0.55, 2.45), M.dark, 0, 0.72, 0);
    mk(group, new THREE.BoxGeometry(5.75, 0.72, 2.24), M.armor, -0.05, 1.18, 0);
    mk(group, new THREE.BoxGeometry(1.62, 0.64, 2.12), M.armor, 2.12, 1.64, 0, 0, 0, -0.16);
    mk(group, new THREE.BoxGeometry(0.92, 0.07, 1.78), M.glass, 1.18, 2.05, 0, 0, 0, -0.72);
    mk(group, new THREE.BoxGeometry(1.70, 0.75, 2.04), M.armor, 0.72, 1.82, 0);
    mk(group, new THREE.BoxGeometry(2.82, 0.16, 2.10), M.dark, -1.25, 1.48, 0);
    // Bak: lantai + empat panel rendah agar siluet robot tetap terbaca.
    mk(group, new THREE.BoxGeometry(2.78, 0.16, 1.96), M.steel, -1.27, 1.61, 0);
    mk(group, new THREE.BoxGeometry(2.88, 0.72, 0.13), M.armor, -1.27, 1.94, -1.02);
    mk(group, new THREE.BoxGeometry(2.88, 0.72, 0.13), M.armor, -1.27, 1.94, 1.02);
    mk(group, new THREE.BoxGeometry(0.14, 0.72, 2.05), M.armor, -2.68, 1.94, 0);
    // Roll-cage pelindung penumpang.
    for (const x of [-2.28, -0.25]) for (const z of [-0.86, 0.86])
        mk(group, new THREE.BoxGeometry(0.10, 1.42, 0.10), M.steel, x, 2.34, z);
    for (const z of [-0.86, 0.86])
        mk(group, new THREE.BoxGeometry(2.14, 0.10, 0.10), M.steel, -1.27, 3.03, z);

    // Ram, tow hook, armor flank dan lampu merah N.U.S.A.
    mk(group, new THREE.BoxGeometry(0.20, 0.86, 2.62), M.steel, 3.10, 1.00, 0);
    for (const z of [-1.18, 1.18]) {
        mk(group, new THREE.BoxGeometry(5.55, 0.24, 0.15), M.hazard, 0, 1.12, z);
        mk(group, new THREE.BoxGeometry(0.14, 0.30, 0.62), M.lamp, 2.94, 1.55, z * 0.58);
    }

    const wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.66, 0.66, 0.44, 14); wheelGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.47, 10); hubGeo.rotateX(Math.PI / 2);
    for (const x of [-2.0, 1.92]) for (const z of [-1.22, 1.22]) {
        wheels.push(mk(group, wheelGeo, M.rubber, x, 0.65, z));
        mk(group, hubGeo, M.steel, x, 0.65, z);
    }

    // Ofset meter lokal; Stage 8 mengalikannya dengan scale dan menempelkan
    // robot biasa. Dua robot mengapit bak, satu berdiri di tengah belakang.
    const passengerOffsets = Object.freeze([
        Object.freeze({ x: -0.72, y: 1.62, z: -0.63 }),
        Object.freeze({ x: -0.72, y: 1.62, z: 0.63 }),
        Object.freeze({ x: -1.92, y: 1.62, z: 0 }),
    ]);

    const scaleX = scale * MODEL_RATIO.x;
    const scaleY = scale * MODEL_RATIO.y;
    const scaleZ = scale * MODEL_RATIO.z;
    group.scale.set(scaleX, scaleY, scaleZ);
    const pickup = {
        group, wheels, materials: M, passengerOffsets, scale, scaleX, scaleY, scaleZ,
        dimensionsMeters: ENEMY_PICKUP_DIMENSIONS,
        dimensionsWorld: {
            length: ENEMY_PICKUP_DIMENSIONS.length * scale,
            width: ENEMY_PICKUP_DIMENSIONS.width * scale,
            height: ENEMY_PICKUP_DIMENSIONS.height * scale,
        },
        active: false, wreck: false, wheelPhase: 0, speed: 0, wreckT: 0,
        passengers: [], lane: 0, eventIndex: -1,
        entrySide: '', entryX: 0, entryViewEdgeX: 0, targetX: 0,
    };
    group.userData.enemyPickup = pickup;
    resetEnemyPickupVisual(pickup);
    return pickup;
}

export function resetEnemyPickupVisual(pickup) {
    if (!pickup) return;
    pickup.active = false; pickup.wreck = false; pickup.wheelPhase = 0;
    pickup.speed = 0; pickup.wreckT = 0; pickup.passengers = [];
    pickup.lane = 0; pickup.eventIndex = -1;
    pickup.entrySide = ''; pickup.entryX = 0; pickup.entryViewEdgeX = 0; pickup.targetX = 0;
    pickup.group.visible = false; pickup.group.rotation.set(0, 0, 0);
    pickup.group.position.y = 0;
    for (const w of pickup.wheels) w.rotation.z = 0;
    pickup.materials.lamp.emissiveIntensity = 0;
    pickup.materials.glass.emissiveIntensity = 0.08;
}

export function updateEnemyPickupVisual(pickup, dt, state = {}) {
    if (!pickup) return;
    pickup.active = state.active == null ? pickup.active : !!state.active;
    pickup.wreck = state.wreck == null ? pickup.wreck : !!state.wreck;
    pickup.speed = Number.isFinite(state.speed) ? Math.max(0, state.speed) : pickup.speed;
    pickup.group.visible = pickup.active;
    if (!pickup.active) return;

    if (pickup.wreck) {
        pickup.wreckT += dt;
        pickup.speed = Math.max(0, pickup.speed - dt * 45);
        pickup.group.rotation.x += (-0.16 - pickup.group.rotation.x) * Math.min(1, dt * 3);
        pickup.group.rotation.z += (0.11 - pickup.group.rotation.z) * Math.min(1, dt * 3);
    } else {
        pickup.group.rotation.x *= Math.max(0, 1 - dt * 6);
        pickup.group.rotation.z *= Math.max(0, 1 - dt * 6);
    }
    pickup.wheelPhase += dt * pickup.speed * 0.13;
    for (const w of pickup.wheels) w.rotation.z = -pickup.wheelPhase;
    pickup.group.position.y = Math.sin(pickup.wheelPhase * 0.62) * (pickup.wreck ? 0.04 : 0.09);
    const on = pickup.wreck ? 0 : 1;
    pickup.materials.lamp.emissiveIntensity = EMISSIVE_MAX * 0.72 * on;
    pickup.materials.glass.emissiveIntensity = 0.08 + EMISSIVE_MAX * 0.18 * on;
}

export function enemyPickupPassengerWorld(pickup, slot, out) {
    const o = pickup.passengerOffsets[slot] || pickup.passengerOffsets[0];
    // Carrier dapat masuk dari depan (-X) maupun belakang (+X). Transform
    // anchor manual tanpa Vector3/matrix baru per frame.
    const lx = o.x * pickup.scaleX, lz = o.z * pickup.scaleZ;
    const yaw = pickup.group.rotation.y, cy = Math.cos(yaw), sy = Math.sin(yaw);
    out.set(
        pickup.group.position.x + lx * cy + lz * sy,
        pickup.group.position.y + o.y * pickup.scaleY,
        pickup.group.position.z - lx * sy + lz * cy,
    );
    return out;
}

export function enemyPickupDebug(pickup) {
    return {
        built: !!pickup, active: !!pickup?.active, wreck: !!pickup?.wreck,
        passengers: pickup?.passengers?.length || 0, lane: pickup?.lane ?? null,
        eventIndex: pickup?.eventIndex ?? -1, wheelPhase: pickup?.wheelPhase || 0,
        entrySide: pickup?.entrySide || '', entryX: pickup?.entryX || 0,
        entryViewEdgeX: pickup?.entryViewEdgeX || 0,
        targetX: pickup?.targetX || 0, yaw: pickup?.group?.rotation?.y || 0,
        speed: pickup?.speed || 0, wreckT: pickup?.wreckT || 0,
        dimensionsMeters: pickup?.dimensionsMeters ? { ...pickup.dimensionsMeters } : null,
        dimensionsWorld: pickup?.dimensionsWorld ? { ...pickup.dimensionsWorld } : null,
        anchors: pickup?.passengerOffsets?.length || 0,
        position: pickup ? { x: pickup.group.position.x, y: pickup.group.position.y,
            z: pickup.group.position.z } : null,
    };
}
