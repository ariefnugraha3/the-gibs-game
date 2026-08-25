// Stage 10 Chapter 1 harbor-defense cannon. Environmental setpiece, not a boss:
// three ordered exposed servos, fixed lock point, and no HP-bar integration.

import { segPointDist2 } from '../../../../utils/math.js';

// Durasi visual murni. Seluruh mesh sudah dibangun saat world dibuat agar
// feedback servo tidak menambah object atau shader baru di tengah permainan.
export const SERVO_HIT_SEC = 0.16;
export const SERVO_DESTROY_SEC = 0.72;

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
    const live = new THREE.Group();
    live.name = `${id}-servo-live-parts`;
    group.add(live);

    // Siluet dasar jauh lebih besar daripada kabinet lama. Bentuk mekanisme di
    // atasnya berbeda per fungsi supaya tiga sasaran terbaca tanpa papan teks.
    box(live, M.servoBody, 18, 8, 14, 0, 4, 0);
    box(live, M.frame, 20, 1.4, 16, 0, 8.7, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        box(live, M.frame, 1.5, 9.5, 1.5, sx * 8.2, 4.5, sz * 6.2);
    const face = box(live, M.servoFace, 11.5, 5.8, 0.7, 0, 4.6, -7.35, false);

    const rotor = new THREE.Group();
    rotor.name = `${id}-servo-rotor`;
    live.add(rotor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.72, 6, 20), M.servoGlow);
    ring.position.set(0, 5, -7.8);
    rotor.add(ring);
    const axle = cylinder(rotor, M.steel, 1.55, 19, 0, 5, 0, 'z', 12);

    if (id === 'traverse') {
        // Roda penggerak horizontal lebar: mekanisme pemutar dudukan meriam.
        for (const side of [-1, 1])
            cylinder(live, M.steel, 3.2, 5.2, side * 5.1, 12.2, 0, 'z', 12);
        box(live, M.frame, 15.5, 2, 3, 0, 12.2, 0);
    } else if (id === 'elevation') {
        // Sepasang aktuator tinggi dengan batang silang pengangkat laras.
        for (const side of [-1, 1]) {
            cylinder(live, M.steel, 2.2, 10, side * 4.5, 13, 0, 'y', 12);
            cylinder(live, M.frame, 1.1, 8, side * 4.5, 19, 0, 'y', 10);
        }
        box(live, M.frame, 13, 2.2, 3.2, 0, 22.2, 0);
    } else {
        // Relay berbentuk hub bertingkat dengan tiga sirip kontrol tembakan.
        cylinder(live, M.steel, 4.2, 9, 0, 13, 0, 'y', 10);
        for (let i = 0; i < 3; i++) {
            const angle = i * Math.PI * 2 / 3;
            const fin = box(live, M.frame, 2, 8, 7, Math.cos(angle) * 5,
                14, Math.sin(angle) * 5);
            fin.rotation.y = -angle;
        }
        cylinder(live, M.servoGlow, 1.15, 8, 0, 21, 0, 'y', 8);
    }

    // Halo lantai + penunjuk melayang hanya menyala pada servo yang saat ini
    // dapat dirusak. Keduanya dibangun sejak awal dan hanya ditransformasikan.
    const target = new THREE.Group();
    target.name = `${id}-servo-current-target`;
    target.visible = false;
    group.add(target);
    const targetHalo = new THREE.Mesh(new THREE.TorusGeometry(10, 0.9, 6, 24), M.servoGlow);
    targetHalo.rotation.x = Math.PI * 0.5;
    targetHalo.position.y = 0.35;
    target.add(targetHalo);
    const targetPointer = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 4), M.servoGlow);
    targetPointer.position.y = 27;
    targetPointer.rotation.z = Math.PI;
    target.add(targetPointer);

    // Flash benturan dan bentuk reruntuhan selalu tersedia di pool world.
    const flash = new THREE.Mesh(new THREE.SphereGeometry(4.4, 8, 5), M.servoGlow);
    flash.position.set(0, 7, -7.9);
    flash.visible = false;
    group.add(flash);
    const wreck = new THREE.Group();
    wreck.name = `${id}-servo-wreck`;
    wreck.visible = false;
    group.add(wreck);
    const wreckPlate = box(wreck, M.wreck, 14, 2.2, 11, -1.5, 1.4, 0);
    wreckPlate.rotation.y = 0.18;
    const wreckRotor = cylinder(wreck, M.wreck, 4.2, 2.6, 4.8, 2.7, -3.4, 'z', 10);
    wreckRotor.rotation.z = 0.35;
    box(wreck, M.frame, 2.2, 6.5, 2.2, -6.2, 3.2, 3.5);

    return {
        id, label, profile: id, group, live, face, rotor, ring, axle,
        target, targetHalo, targetPointer, flash, wreck,
        x, z, hitRadius: 10.5, hp: 0, maxHp: 0, destroyed: false,
        hitT: 0, hitCount: 0, hitDamaged: false,
        destroyT: 0, destroying: false,
    };
}

function syncServoTargets(system) {
    for (let i = 0; i < system.servos.length; i++)
        system.servos[i].target.visible = system.active && !system.shutdown
            && !system.servos[i].destroyed && i === system.destroyedCount;
}

function markServoHit(servo, damaged) {
    servo.hitT = SERVO_HIT_SEC;
    servo.hitCount++;
    servo.hitDamaged = damaged;
    servo.flash.visible = true;
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
        limitedYaw: 0, shots: 0, recoil: 0, visualT: 0,
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
    system.visualT = 0;
    system.turret.visible = true;
    system.turret.position.set(system.x, 8, system.z);
    system.turret.rotation.y = 0;
    system.radar.rotation.y = 0;
    system.warning.visible = false;
    system.targetRing.visible = false;
    for (const servo of system.servos) {
        servo.hp = servoHp;
        servo.maxHp = servoHp;
        servo.destroyed = false;
        servo.group.visible = true;
        servo.group.position.set(servo.x, 0, servo.z);
        servo.group.rotation.set(0, 0, 0);
        servo.live.visible = true;
        servo.live.position.set(0, 0, 0);
        servo.live.rotation.set(0, 0, 0);
        servo.rotor.rotation.set(0, 0, 0);
        servo.target.visible = false;
        servo.target.rotation.set(0, 0, 0);
        servo.target.scale.set(1, 1, 1);
        servo.flash.visible = false;
        servo.flash.scale.set(1, 1, 1);
        servo.wreck.visible = false;
        servo.wreck.scale.set(1, 1, 1);
        servo.hitT = 0;
        servo.hitCount = 0;
        servo.hitDamaged = false;
        servo.destroyT = 0;
        servo.destroying = false;
    }
    syncServoTargets(system);
}

export function activateDefenseArray(system) {
    if (system.shutdown) return;
    system.active = true;
    system.phase = 'tracking';
    system.timer = 0;
    syncServoTargets(system);
}

function destroyCurrentServo(system) {
    const servo = system.servos[system.destroyedCount];
    if (!servo) return null;
    servo.destroyed = true;
    servo.hp = 0;
    servo.destroyT = 0;
    servo.destroying = true;
    servo.wreck.visible = true;
    servo.wreck.scale.set(0.2, 0.2, 0.2);
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
    syncServoTargets(system);
    return servo;
}

export function defenseArrayBulletHit(system, bullet, damage) {
    const bx = bullet.mesh.position.x, bz = bullet.mesh.position.z;
    for (let index = 0; index < system.servos.length; index++) {
        const servo = system.servos[index];
        if (segPointDist2(bullet.px, 0, bullet.pz, bx, 0, bz, servo.x, 0, servo.z)
            > servo.hitRadius * servo.hitRadius)
            continue;
        const vulnerable = !servo.destroyed && index === system.destroyedCount && system.active;
        markServoHit(servo, vulnerable);
        let destroyed = null;
        if (vulnerable) {
            servo.hp -= damage;
            if (servo.hp <= 0) destroyed = destroyCurrentServo(system);
        }
        return { hit: true, damaged: vulnerable, destroyed };
    }
    return { hit: false, damaged: false, destroyed: null };
}

export function updateDefenseArrayVisuals(system, dt) {
    system.visualT += dt;
    const current = system.servos[system.destroyedCount];
    for (const servo of system.servos) {
        servo.group.position.x = servo.x;
        servo.group.position.y = 0;
        servo.group.position.z = servo.z;
        servo.group.rotation.x = 0;
        servo.group.rotation.z = 0;

        if (servo.hitT > 0) {
            servo.hitT = Math.max(0, servo.hitT - dt);
            const k = servo.hitT / SERVO_HIT_SEC;
            const strength = servo.hitDamaged ? 1 : 0.45;
            servo.group.position.x += Math.sin(k * Math.PI * 7) * strength * 0.9;
            servo.group.rotation.z = Math.sin(k * Math.PI * 5) * strength * 0.065;
            servo.flash.visible = true;
            servo.flash.scale.set(0.65 + k * 0.7, 0.65 + k * 0.7, 0.65 + k * 0.7);
        } else if (!servo.destroying) {
            servo.flash.visible = false;
        }

        if (servo.destroyed) {
            servo.destroyT = Math.min(SERVO_DESTROY_SEC, servo.destroyT + dt);
            const k = servo.destroyT / SERVO_DESTROY_SEC;
            servo.destroying = k < 1;
            servo.wreck.visible = true;
            const wreckScale = Math.min(1, 0.2 + k * 1.35);
            servo.wreck.scale.set(wreckScale, wreckScale, wreckScale);
            if (servo.destroying) {
                servo.live.visible = true;
                servo.live.position.y = -k * 5;
                servo.live.rotation.x = k * 0.62;
                servo.live.rotation.z = Math.sin(k * Math.PI * 8) * (1 - k) * 0.18;
                servo.rotor.rotation.z += dt * (8 + k * 15);
                servo.flash.visible = Math.floor(k * 12) % 2 === 0;
                servo.flash.scale.set(1.15 + (1 - k), 1.15 + (1 - k), 1.15 + (1 - k));
            } else {
                servo.live.visible = false;
                servo.live.position.set(0, 0, 0);
                servo.live.rotation.set(0, 0, 0);
                servo.flash.visible = false;
            }
        } else {
            servo.live.visible = true;
            servo.live.position.set(0, 0, 0);
            servo.live.rotation.set(0, 0, 0);
            if (servo === current && system.active)
                servo.rotor.rotation.z += dt * 1.8;
        }

        const isCurrent = servo === current && system.active && !system.shutdown
            && !servo.destroyed;
        servo.target.visible = isCurrent;
        if (isCurrent) {
            const pulse = 1 + Math.sin(system.visualT * 7) * 0.12;
            servo.target.scale.set(pulse, pulse, pulse);
            servo.target.rotation.y += dt * 1.4;
            servo.targetPointer.position.y = 27 + Math.sin(system.visualT * 6) * 1.8;
        }
    }
}

export function updateDefenseArray(system, dt, C, playerX, playerZ, onFire) {
    updateDefenseArrayVisuals(system, dt);
    system.radar.rotation.y += dt * (system.shutdown ? 0 : 0.7);
    if (system.recoil > 0) {
        system.recoil = Math.max(0, system.recoil - dt * 4);
        system.turret.position.x = system.x - system.recoil * 3;
    } else system.turret.position.x = system.x;
    system.turret.position.y = 8;
    system.turret.position.z = system.z;
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
            id: servo.id, label: servo.label, profile: servo.profile,
            hp: servo.hp, maxHp: servo.maxHp, hitRadius: servo.hitRadius,
            destroyed: servo.destroyed,
            currentTarget: servo.target.visible,
            hitAnimating: servo.hitT > 0,
            hitCount: servo.hitCount,
            destroying: servo.destroying,
            destroyProgress: servo.destroyed ? servo.destroyT / SERVO_DESTROY_SEC : 0,
            liveVisible: servo.live.visible,
            wreckVisible: servo.wreck.visible,
        })),
        lockPoint: { ...system.lockPoint },
        tracksAfterLock: false,
        shots: system.shots,
        turret: {
            visible: system.turret.visible,
            x: system.turret.position.x,
            y: system.turret.position.y,
            z: system.turret.position.z,
            baseX: system.x,
        },
    };
}
