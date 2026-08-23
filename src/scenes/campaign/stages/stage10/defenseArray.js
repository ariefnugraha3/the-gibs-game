// Stage 10 Chapter 1 harbor-defense cannon. Environmental setpiece, not a boss:
// three ordered exposed servos, fixed lock point, and no HP-bar integration.

import { segPointDist2 } from '../../../../utils/math.js';

function box(parent, material, sx, sy, sz, x, y, z, shadow = true) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    part.position.set(x, y, z);
    part.castShadow = shadow;
    part.receiveShadow = true;
    parent.add(part);
    return part;
}

function cylinder(parent, material, radius, length, x, y, z, axis = 'y', radial = 12) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radial), material);
    part.position.set(x, y, z);
    if (axis === 'x') part.rotation.z = Math.PI * 0.5;
    if (axis === 'z') part.rotation.x = Math.PI * 0.5;
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
}

function buildServo(parent, M, id, label, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.name = `defense-${id}-servo`;
    parent.add(group);
    box(group, M.servoBody, 13, 10, 11, 0, 5, 0);
    box(group, M.frame, 14, 1.1, 12, 0, 10.4, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        box(group, M.frame, 1.1, 11, 1.1, sx * 6.1, 5, sz * 5.1);
    const face = box(group, M.servoFace, 8.5, 5.5, 0.5, 0, 5.4, -5.65, false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.5, 6, 18), M.servoGlow);
    ring.position.set(0, 5.4, -6);
    group.add(ring);
    const axle = cylinder(group, M.steel, 1.2, 15, 0, 5, 0, 'z');
    const wreck = box(group, M.wreck, 10, 1.1, 9, 0, 1, 0);
    wreck.visible = false;
    return {
        id, label, group, face, ring, axle, wreck,
        x, z, hp: 0, maxHp: 0, destroyed: false,
    };
}

function updateWarning(system, x, z, visible) {
    const warning = system.warning;
    warning.visible = visible;
    if (!visible) return;
    const dx = x - system.x, dz = z - system.z;
    const distance = Math.max(1, Math.hypot(dx, dz));
    warning.position.set(system.x + dx * 0.5, 0.32, system.z + dz * 0.5);
    warning.scale.set(distance / system.warningBaseLength, 1, 1);
    warning.rotation.y = -Math.atan2(dz, dx);
}

function targetFor(system, playerX, playerZ) {
    if (system.destroyedCount === 0) return { x: playerX, z: playerZ };
    // With traverse destroyed, the weapon can only fire down the bearing it
    // held at that instant; range follows the target but sweep is gone.
    const distance = Math.hypot(playerX - system.x, playerZ - system.z);
    return {
        x: system.x + Math.cos(system.limitedYaw) * distance,
        z: system.z + Math.sin(system.limitedYaw) * distance,
    };
}

export function buildDefenseArray(parent, M, x, z) {
    const root = new THREE.Group();
    root.name = 'stage10-harbor-defense-array';
    parent.add(root);

    // Reinforced rail platform and traverse machinery.
    box(root, M.concrete, 118, 7, 92, x, 3.5, z);
    for (const dz of [-35, 35]) {
        box(root, M.steel, 112, 1.4, 2, x, 8, z + dz);
        for (let rx = x - 52; rx <= x + 52; rx += 8)
            box(root, M.frame, 1.2, 2, 6, rx, 7.2, z + dz);
    }
    const turret = new THREE.Group();
    turret.position.set(x, 8, z);
    root.add(turret);
    cylinder(turret, M.frame, 29, 7, 0, 3.5, 0, 'y', 18);
    cylinder(turret, M.armor, 21, 19, 0, 15, 0, 'y', 18);
    box(turret, M.armor, 34, 20, 30, -2, 18, 0);
    box(turret, M.hazard, 35, 2, 31, -2, 28.5, 0);
    for (const side of [-1, 1]) {
        cylinder(turret, M.steel, 3.5, 46, 36, 22, side * 7, 'x', 14);
        cylinder(turret, M.frame, 4.7, 7, 14, 22, side * 7, 'x', 14);
        cylinder(turret, M.ink, 2.8, 4, 58, 22, side * 7, 'x', 14);
    }
    // Recoil rails, breeches, cooling jackets and rangefinder optics.
    for (const side of [-1, 1]) {
        box(turret, M.steel, 42, 1.3, 1.3, 23, 15, side * 11);
        box(turret, M.frame, 12, 9, 11, 4, 21, side * 7);
        for (let px = 19; px <= 50; px += 6)
            cylinder(turret, M.frame, 4.1, 0.75, px, 22, side * 7, 'x', 12);
    }
    box(turret, M.glass, 8, 5, 8, 1, 31, -13);
    cylinder(turret, M.tech, 1.7, 2, 1, 31, -17.5, 'z', 10);
    const radar = new THREE.Group();
    radar.position.set(-10, 36, 0); turret.add(radar);
    cylinder(radar, M.steel, 0.8, 10, 0, 5, 0, 'y', 8);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 7), M.armor);
    dish.scale.set(0.25, 1, 1);
    dish.position.set(0, 11, 0);
    radar.add(dish);

    const servos = [
        buildServo(root, M, 'traverse', 'TRAVERSE SERVO', x - 48, z - 52),
        buildServo(root, M, 'elevation', 'ELEVATION SERVO', x + 2, z - 56),
        buildServo(root, M, 'relay', 'FIRE-CONTROL RELAY', x + 50, z - 50),
    ];

    const warning = new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 13), M.warning);
    warning.visible = false;
    warning.renderOrder = 6;
    root.add(warning);
    const targetRing = new THREE.Mesh(new THREE.TorusGeometry(7, 1, 8, 24), M.warning);
    targetRing.rotation.x = Math.PI * 0.5;
    targetRing.visible = false;
    targetRing.renderOrder = 7;
    root.add(targetRing);

    return {
        root, turret, radar, servos, warning, targetRing,
        x, z, warningBaseLength: 1,
        active: false, shutdown: false, destroyedCount: 0,
        phase: 'offline', timer: 0, lockPoint: { x, z },
        limitedYaw: 0, shots: 0, recoil: 0,
    };
}

export function resetDefenseArray(system, servoHp) {
    system.active = false;
    system.shutdown = false;
    system.destroyedCount = 0;
    system.phase = 'offline';
    system.timer = 0;
    system.shots = 0;
    system.recoil = 0;
    system.turret.rotation.y = 0;
    system.radar.rotation.y = 0;
    system.warning.visible = false;
    system.targetRing.visible = false;
    for (const servo of system.servos) {
        servo.hp = servoHp;
        servo.maxHp = servoHp;
        servo.destroyed = false;
        servo.group.visible = true;
        servo.face.visible = true;
        servo.ring.visible = true;
        servo.axle.visible = true;
        servo.wreck.visible = false;
    }
}

export function activateDefenseArray(system) {
    if (system.shutdown) return;
    system.active = true;
    system.phase = 'tracking';
    system.timer = 0;
}

function destroyCurrentServo(system) {
    const servo = system.servos[system.destroyedCount];
    if (!servo) return null;
    servo.destroyed = true;
    servo.hp = 0;
    servo.face.visible = false;
    servo.ring.visible = false;
    servo.axle.visible = false;
    servo.wreck.visible = true;
    system.destroyedCount++;
    system.limitedYaw = -system.turret.rotation.y;
    system.phase = 'cooldown';
    system.timer = 0;
    system.warning.visible = false;
    system.targetRing.visible = false;
    if (system.destroyedCount >= system.servos.length) {
        system.shutdown = true;
        system.active = false;
        system.phase = 'shutdown';
    }
    return servo;
}

export function defenseArrayBulletHit(system, bullet, damage) {
    const bx = bullet.mesh.position.x, bz = bullet.mesh.position.z;
    for (let index = 0; index < system.servos.length; index++) {
        const servo = system.servos[index];
        if (segPointDist2(bullet.px, 0, bullet.pz, bx, 0, bz, servo.x, 0, servo.z) > 49)
            continue;
        let destroyed = null;
        if (!servo.destroyed && index === system.destroyedCount && system.active) {
            servo.hp -= damage;
            if (servo.hp <= 0) destroyed = destroyCurrentServo(system);
        }
        return { hit: true, damaged: index === system.destroyedCount || !!destroyed, destroyed };
    }
    return { hit: false, damaged: false, destroyed: null };
}

export function updateDefenseArray(system, dt, C, playerX, playerZ, onFire) {
    system.radar.rotation.y += dt * (system.shutdown ? 0 : 0.7);
    if (system.recoil > 0) {
        system.recoil = Math.max(0, system.recoil - dt * 4);
        system.turret.position.x = -system.recoil * 3;
    } else system.turret.position.x = 0;
    if (!system.active || system.shutdown) {
        updateWarning(system, 0, 0, false);
        system.targetRing.visible = false;
        return;
    }

    system.timer += dt;
    if (system.phase === 'cooldown') {
        updateWarning(system, 0, 0, false);
        system.targetRing.visible = false;
        if (system.timer >= C.cooldownSec) {
            system.phase = 'tracking';
            system.timer = 0;
        }
        return;
    }

    if (system.phase === 'tracking') {
        const target = targetFor(system, playerX, playerZ);
        system.lockPoint.x = target.x;
        system.lockPoint.z = target.z;
        const yaw = Math.atan2(target.z - system.z, target.x - system.x);
        system.turret.rotation.y = -yaw;
        updateWarning(system, target.x, target.z, true);
        system.targetRing.visible = true;
        system.targetRing.position.set(target.x, 0.45, target.z);
        if (system.timer >= C.lockSec) {
            system.phase = 'locked';
            system.timer = 0;
        }
        return;
    }

    if (system.phase === 'locked') {
        updateWarning(system, system.lockPoint.x, system.lockPoint.z, true);
        system.targetRing.visible = true;
        system.targetRing.position.set(system.lockPoint.x, 0.45, system.lockPoint.z);
        if (system.timer >= C.fireDelaySec) {
            const radius = system.destroyedCount >= 2 ? C.blastRadius * 0.5 : C.blastRadius;
            onFire({ x: system.lockPoint.x, y: 0.5, z: system.lockPoint.z }, radius, C.damage);
            system.shots++;
            system.recoil = 1;
            system.phase = 'cooldown';
            system.timer = 0;
            updateWarning(system, 0, 0, false);
            system.targetRing.visible = false;
        }
    }
}

export function defenseArrayDebug(system) {
    return {
        active: system.active,
        shutdown: system.shutdown,
        phase: system.phase,
        timer: system.timer,
        destroyedCount: system.destroyedCount,
        destroyedServos: system.servos.filter((servo) => servo.destroyed).map((servo) => servo.id),
        vulnerableServo: system.servos[system.destroyedCount]?.id || null,
        servos: system.servos.map((servo) => ({
            id: servo.id, label: servo.label, hp: servo.hp,
            maxHp: servo.maxHp, destroyed: servo.destroyed,
        })),
        lockPoint: { ...system.lockPoint },
        tracksAfterLock: false,
        shots: system.shots,
    };
}
