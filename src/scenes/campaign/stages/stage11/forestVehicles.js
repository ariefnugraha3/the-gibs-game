// Stage 11 Chapter 1 — six stationary double-cabin weapon pickups.
// Vehicle bodies, weapon rigs, MG bolts and homing missiles are all prebuilt.
// The mounted gunner remains a real campaign robot, so normal player weapons,
// kill accounting and drops keep using the shared robot pipeline.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { scene, camera, addCamShake } from '../../../../core/renderer.js';
import {
    robots, bullets, enemyBullets, player, stats,
    makeEnemyBulletMesh,
} from '../../../../core/state.js';
import { spawnCampaignRobot } from '../../utility/common.js';
import { buildCombatGunshipMissileMesh } from '../../../../entities/combatGunship.js';
import {
    buildStage7RoadVehicle, STAGE7_ROAD_VEHICLE_SPECS,
} from '../stage7/roadVehicles.js';
import { queueBoom } from '../../../../entities/robots.js';
import { explodeAt } from '../../../../entities/effects.js';
import { segPointDist2, clamp } from '../../../../utils/math.js';
import {
    playSFX, sfxTankMG, sfxRocketShot, sfxRocketExplode, sfxTankExplode,
} from '../../../../utils/sfx.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';

export const STAGE11_DOUBLE_CABIN_METERS = STAGE7_ROAD_VEHICLE_SPECS.pickup;
const RIDER_ANCHOR = Object.freeze({ x: -1.72, y: 1.48, z: 0 });

let built = false, root = null;
const rigs = [], mgPool = [], missiles = [];
const mountPos = new THREE.Vector3(), muzzlePos = new THREE.Vector3();
let shotsFired = 0, missilesFired = 0, completedBursts = 0, vehiclesCleared = 0;

function cfg() { return CFG.campaign.stage11.forestVehicles; }
function mk(parent, geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = false; m.receiveShadow = false; parent.add(m); return m;
}

// One complete cinematic wreck rig is built for every hostile pickup during
// loading. Runtime only changes transforms, visibility and opacity—no mesh,
// material or light is created on the kill frame.
function buildVehicleWreckFx(parent, index) {
    const W = cfg().wreck;
    const group = new THREE.Group();
    group.name = `stage11-vehicle-wreck-fx-${index + 1}`;
    group.visible = false; parent.add(group);
    const blastOffsets = [
        { x: 0, y: 8, z: 0 },
        { x: -10, y: 10, z: 5 },
        { x: 8, y: 6, z: -6 },
    ];
    const blasts = [];
    for (let i = 0; i < W.blastCount; i++) {
        const holder = new THREE.Group(); group.add(holder); holder.visible = false;
        const o = blastOffsets[i % blastOffsets.length]; holder.position.set(o.x, o.y, o.z);
        const coreMat = new THREE.MeshBasicMaterial({
            color: i === 2 ? 0xffe1a3 : 0xff7a24, transparent: true,
            opacity: 0, depthWrite: false, toneMapped: false,
        });
        const ringMat = new THREE.MeshBasicMaterial({
            color: PAL.amber, transparent: true, opacity: 0,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            depthWrite: false, toneMapped: false,
        });
        const core = mk(holder, new THREE.SphereGeometry(1, 9, 7), coreMat, 0, 0, 0);
        const ring = mk(holder, new THREE.RingGeometry(.45, 1, 22), ringMat,
            0, -o.y + .7, 0, -Math.PI / 2);
        blasts.push({ holder, core, ring, coreMat, ringMat });
    }
    const fires = [];
    for (let i = 0; i < W.fireCount; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: i % 2 ? 0xffa52b : 0xff5a1f, transparent: true,
            opacity: 0, depthWrite: false, toneMapped: false,
        });
        const mesh = mk(group, new THREE.SphereGeometry(1, 8, 6), material,
            (i - 1) * 7, 4 + (i % 2) * 2, (i % 2 ? 1 : -1) * 3.5);
        mesh.visible = false; fires.push({ mesh, material, phase: i * 1.7 });
    }
    const smoke = [];
    for (let i = 0; i < W.smokeCount; i++) {
        const material = new THREE.MeshLambertMaterial({
            color: i % 2 ? 0x353230 : 0x262524, transparent: true,
            opacity: 0, depthWrite: false,
        });
        const mesh = mk(group, new THREE.SphereGeometry(1, 7, 5), material,
            ((i % 3) - 1) * 5, 6, (i % 2 ? 1 : -1) * 3);
        mesh.visible = false;
        smoke.push({ mesh, material, delay: i * .16,
            x: ((i % 3) - 1) * 5, z: (i % 2 ? 1 : -1) * 3 });
    }
    const sparks = [];
    for (let i = 0; i < W.sparkCount; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: i % 3 ? PAL.amber : PAL.white, toneMapped: false,
        });
        const mesh = mk(group, new THREE.BoxGeometry(.48, .38, 2.5 + i % 3),
            material, 0, 8, 0);
        mesh.visible = false;
        sparks.push({ mesh, vx: 0, vy: 0, vz: 0, spin: 0 });
    }
    return { group, blasts, fires, smoke, sparks };
}

function charHex(hex) {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return ((Math.max(13, r * .24) | 0) << 16)
        | ((Math.max(12, g * .22) | 0) << 8) | (Math.max(10, b * .20) | 0);
}

function captureWreckState(pickup, weapon) {
    const breakaways = pickup.group.children
        .filter(o => o.userData.stage7WreckLoose)
        .map((o, i) => ({
            o, role: o.userData.stage7WreckLoose, index: i,
            px: o.position.x, py: o.position.y, pz: o.position.z,
            rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
            vx: 0, vy: 0, vz: 0, vrx: 0, vry: 0, vrz: 0, landed: false,
        }));
    breakaways.push({
        o: weapon.turret, role: 'weapon-turret', index: breakaways.length,
        px: weapon.turret.position.x, py: weapon.turret.position.y,
        pz: weapon.turret.position.z, rx: weapon.turret.rotation.x,
        ry: weapon.turret.rotation.y, rz: weapon.turret.rotation.z,
        vx: 0, vy: 0, vz: 0, vrx: 0, vry: 0, vrz: 0, landed: false,
    });
    const materials = [], seen = new Set();
    pickup.group.traverse(o => {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) if (m && m.color && !seen.has(m)) {
            seen.add(m); materials.push({ m, color: m.color.getHex(),
                emissive: m.emissive ? m.emissive.getHex() : null,
                emissiveIntensity: m.emissiveIntensity });
        }
    });
    return { breakaways, materials };
}

function resetVehicleWreck(rig) {
    rig.destroying = false; rig.destructionT = 0; rig.blastStage = 0;
    rig.charred = false;
    for (const p of rig.breakaways) {
        p.o.position.set(p.px, p.py, p.pz); p.o.rotation.set(p.rx, p.ry, p.rz);
        p.vx = p.vy = p.vz = p.vrx = p.vry = p.vrz = 0;
        p.landed = false; p.o.visible = true;
    }
    for (const x of rig.wreckMaterials) {
        x.m.color.setHex(x.color);
        if (x.emissive != null && x.m.emissive) x.m.emissive.setHex(x.emissive);
        x.m.emissiveIntensity = x.emissiveIntensity;
    }
    const fx = rig.wreckFx; fx.group.visible = false;
    for (const b of fx.blasts) {
        b.holder.visible = false; b.coreMat.opacity = b.ringMat.opacity = 0;
    }
    for (const f of fx.fires) { f.mesh.visible = false; f.material.opacity = 0; }
    for (const s of fx.smoke) { s.mesh.visible = false; s.material.opacity = 0; }
    for (const s of fx.sparks) s.mesh.visible = false;
}

function startVehicleWreck(rig) {
    const W = cfg().wreck, p = rig.pickup;
    rig.cleared = true; rig.active = false; rig.engaged = false; rig.inView = false;
    rig.destroying = true; rig.destructionT = 0; rig.blastStage = 1;
    rig.charred = true; rig.weapon.flashMat.opacity = 0;
    vehiclesCleared++; p.passengers = [];
    for (const x of rig.wreckMaterials) {
        x.m.color.setHex(charHex(x.color));
        if (x.m.emissive) x.m.emissive.setHex(0x100906);
        x.m.emissiveIntensity = 0;
    }
    for (const part of rig.breakaways) {
        const a = (part.index + 1) * 2.399963 + rig.id * .61;
        const f = W.partForce * (.78 + (part.index % 4) * .11);
        part.vx = Math.cos(a) * f; part.vz = Math.sin(a) * f;
        part.vy = W.partLift * (.82 + (part.index % 3) * .16);
        part.vrx = 2.6 + (part.index % 3) * .9;
        part.vry = (part.index % 2 ? -1 : 1) * (2.2 + part.index * .18);
        part.vrz = (part.index % 3 - 1) * 2.8; part.landed = false;
    }
    const fx = rig.wreckFx;
    fx.group.position.set(p.group.position.x, 0, p.group.position.z);
    fx.group.rotation.y = p.group.rotation.y; fx.group.visible = true;
    for (let i = 0; i < fx.sparks.length; i++) {
        const s = fx.sparks[i], a = i * 2.399963 + rig.id * .43;
        const speed = W.sparkSpeed * (.7 + (i % 4) * .12);
        s.mesh.position.set(0, 8, 0); s.mesh.rotation.set(0, a, a * .35);
        s.mesh.visible = true; s.vx = Math.cos(a) * speed;
        s.vz = Math.sin(a) * speed; s.vy = speed * (.65 + (i % 3) * .16);
        s.spin = (i % 2 ? -1 : 1) * (7 + i * .3);
    }
    addCamShake(W.cameraShake); playSFX(sfxTankExplode, .72);
}

function updateVehicleWreck(rig, dt) {
    const W = cfg().wreck, p = rig.pickup, fx = rig.wreckFx;
    rig.destructionT = Math.min(W.durationSec, rig.destructionT + dt);
    p.wreckT = rig.destructionT;
    const t = rig.destructionT;
    if (rig.blastStage < 2 && t >= W.secondaryBlastSec) {
        rig.blastStage = 2; addCamShake(W.secondaryShake);
        playSFX(sfxTankExplode, .48);
    }
    if (rig.blastStage < 3 && t >= W.finalBlastSec) {
        rig.blastStage = 3; addCamShake(W.secondaryShake * .8);
        playSFX(sfxTankExplode, .4);
    }
    const starts = [0, W.secondaryBlastSec, W.finalBlastSec];
    for (let i = 0; i < fx.blasts.length; i++) {
        const b = fx.blasts[i], age = t - starts[i % starts.length];
        const live = age >= 0 && age < W.blastLifeSec;
        b.holder.visible = live;
        if (!live) continue;
        const q = age / W.blastLifeSec, scale = W.blastScales[i] || W.blastScales[0];
        b.core.scale.setScalar(scale * (.28 + q * .9));
        b.ring.scale.setScalar(scale * (.6 + q * 2.6));
        b.coreMat.opacity = (1 - q) * .95; b.ringMat.opacity = (1 - q) * .82;
    }
    const fireAge = t - W.fireStartSec;
    const fade = Math.max(0, Math.min(1, (W.durationSec - t) / 1.1));
    for (let i = 0; i < fx.fires.length; i++) {
        const f = fx.fires[i]; f.mesh.visible = fireAge >= 0;
        if (!f.mesh.visible) continue;
        const pulse = .88 + Math.sin(t * 13 + f.phase) * .18;
        f.mesh.scale.set(5.2 * pulse, 8.6 * pulse, 5.2 * pulse);
        f.mesh.position.y = 4 + Math.sin(t * 9 + f.phase) * 1.2;
        f.material.opacity = .82 * fade;
    }
    for (const s of fx.smoke) {
        const age = fireAge - s.delay; s.mesh.visible = age >= 0;
        if (!s.mesh.visible) continue;
        s.mesh.position.set(s.x + Math.sin(age * 1.7 + s.delay) * 2,
            7 + age * W.smokeRisePerSec, s.z + Math.cos(age * 1.3) * 1.5);
        const scale = 5.5 + age * 3.2;
        s.mesh.scale.set(scale * 1.15, scale, scale * .9);
        s.material.opacity = Math.min(.68, age * 1.8) * fade;
    }
    for (const s of fx.sparks) if (s.mesh.visible) {
        s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt; s.vy -= W.sparkGravity * dt;
        s.mesh.rotation.x += s.spin * dt; s.mesh.rotation.z += s.spin * .7 * dt;
        if (t > 1.25 || s.mesh.position.y < .3) s.mesh.visible = false;
    }
    for (const part of rig.breakaways) if (!part.landed) {
        part.o.position.x += part.vx * dt; part.o.position.y += part.vy * dt;
        part.o.position.z += part.vz * dt; part.vy -= W.partGravity * dt;
        part.o.rotation.x += part.vrx * dt; part.o.rotation.y += part.vry * dt;
        part.o.rotation.z += part.vrz * dt;
        if (part.o.position.y > W.partFloor) continue;
        part.o.position.y = W.partFloor;
        part.vy = Math.abs(part.vy) * W.partBounce;
        const drag = Math.max(0, 1 - dt * W.partDragPerSec);
        part.vx *= drag; part.vz *= drag;
        part.vrx *= drag; part.vry *= drag; part.vrz *= drag;
        if (Math.abs(part.vy) < .45) { part.vy = 0; part.landed = true; }
    }
    const hopK = Math.min(1, t / Math.max(.05, W.bodyHopSec));
    const hop = Math.sin(hopK * Math.PI) * W.bodyHopUnits;
    const settle = 1 - Math.exp(-Math.max(0, t - W.bodyHopSec) * W.settlePerSec);
    p.group.position.y = hop - settle * W.sinkUnits;
    const pose = 1 - Math.exp(-t * W.tiltResponsePerSec);
    p.group.rotation.x = W.tiltX * pose;
    p.group.rotation.z = (rig.id % 2 ? 1 : -1) * W.tiltZ * pose;
    if (t < W.durationSec) return;
    rig.destroying = false; fx.group.visible = false;
    for (const b of fx.blasts) b.holder.visible = false;
    for (const f of fx.fires) { f.mesh.visible = false; f.material.opacity = 0; }
    for (const s of fx.smoke) { s.mesh.visible = false; s.material.opacity = 0; }
    for (const s of fx.sparks) s.mesh.visible = false;
    p.group.position.y = -W.sinkUnits; p.group.rotation.x = W.tiltX;
    p.group.rotation.z = (rig.id % 2 ? 1 : -1) * W.tiltZ;
}
function addDoubleCabAndWeapon(g, type, index, bodyColor) {
    const M = {
        armor: new THREE.MeshLambertMaterial({ color: bodyColor }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        glass: new THREE.MeshLambertMaterial({
            color: PAL.screenBg, emissive: PAL.techDim,
            emissiveIntensity: .08,
        }),
    };
    // Second seating row extends the original angular cab rearward; the bed
    // remains open behind it for one mounted robot and the weapon pedestal.
    mk(g, new THREE.BoxGeometry(1.15, .88, 1.98), M.armor,
        -.12, 1.68, 0);
    mk(g, new THREE.BoxGeometry(1.34, .12, 2.08), M.dark,
        -.08, 2.18, 0);
    for (const side of [-1, 1])
        mk(g, new THREE.BoxGeometry(.68, .42, .055), M.glass,
            -.10, 1.78, side * 1.01);

    const turret = new THREE.Group();
    turret.position.set(-1.42, 1.88, 0); g.add(turret);
    const weaponDark = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const weaponSteel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const hazard = new THREE.MeshLambertMaterial({
        color: PAL.hazard, emissive: PAL.hazard,
        emissiveIntensity: EMISSIVE_MAX * .42,
    });
    mk(turret, new THREE.CylinderGeometry(.52, .68, .28, 10),
        weaponDark, 0, 0, 0);
    let muzzleOffsets;
    if (type === 'machineGun') {
        mk(turret, new THREE.BoxGeometry(1.15, .78, 1.15),
            weaponSteel, .15, .34, 0);
        for (const z of [-.22, .22])
            mk(turret, new THREE.CylinderGeometry(.10, .10, 2.35, 7),
                weaponDark, 1.45, .38, z, 0, 0, Math.PI / 2);
        mk(turret, new THREE.BoxGeometry(.18, .92, 1.42),
            hazard, -.52, .42, 0);
        muzzleOffsets = [{ x: 2.65, y: .38, z: -.22 },
            { x: 2.65, y: .38, z: .22 }];
    } else {
        mk(turret, new THREE.BoxGeometry(1.7, .66, 1.65),
            weaponDark, .15, .36, 0);
        for (const z of [-.46, .46]) {
            mk(turret, new THREE.CylinderGeometry(.24, .24, 1.85, 8),
                weaponSteel, 1.05, .38, z, 0, 0, Math.PI / 2);
            mk(turret, new THREE.ConeGeometry(.24, .68, 7),
                hazard, 2.30, .38, z, 0, 0, -Math.PI / 2);
        }
        muzzleOffsets = [{ x: 2.58, y: .38, z: -.46 },
            { x: 2.58, y: .38, z: .46 }];
    }
    const flashMat = new THREE.MeshBasicMaterial({
        color: PAL.amber, transparent: true, opacity: 0, depthWrite: false,
        toneMapped: false,
    });
    const flash = mk(turret, new THREE.SphereGeometry(.42, 7, 5),
        flashMat, type === 'machineGun' ? 2.65 : 2.58, .38, 0);
    flash.visible = true;
    return { turret, muzzleOffsets, flash, flashMat, index };
}

function muzzleWorld(rig, local, out) {
    const p = rig.pickup, turret = rig.weapon.turret;
    // Apply the live turret yaw before the pickup's Stage-7 authored scale
    // and carrier yaw. This keeps the projectile on the drawn barrel instead
    // of firing from a fixed point in the bed while the turret turns.
    const tc = Math.cos(turret.rotation.y), ts = Math.sin(turret.rotation.y);
    const tx = turret.position.x + local.x * tc + local.z * ts;
    const tz = turret.position.z - local.x * ts + local.z * tc;
    const lx = tx * p.scaleX, ly = (turret.position.y + local.y) * p.scaleY;
    const lz = tz * p.scaleZ, yaw = p.group.rotation.y;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    out.set(p.group.position.x + lx * cy + lz * sy,
        p.group.position.y + ly,
        p.group.position.z - lx * sy + lz * cy);
    return out;
}
function riderWorld(rig, out) {
    const p = rig.pickup, o = RIDER_ANCHOR, yaw = p.group.rotation.y;
    const lx = o.x * CAMP_M, lz = o.z * CAMP_M;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    out.set(p.group.position.x + lx * cy + lz * sy,
        p.group.position.y + o.y * CAMP_M,
        p.group.position.z - lx * sy + lz * cy);
    return out;
}
function updatePickupVisual(rig, dt) {
    const p = rig.pickup;
    p.group.visible = true;
    if (rig.destroying) { updateVehicleWreck(rig, dt); return; }
    if (!rig.cleared) {
        p.wreckT = 0; p.group.position.y = 0;
        p.group.rotation.x *= Math.max(0, 1 - dt * 7);
        p.group.rotation.z *= Math.max(0, 1 - dt * 7);
    }
}
function desiredYaw(rig) {
    const dx = camera.position.x - rig.pickup.group.position.x;
    const dz = camera.position.z - rig.pickup.group.position.z;
    return Math.atan2(-dz, dx) - rig.pickup.group.rotation.y;
}
function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
function riderAlive(rig) { return !!rig.rider && robots.includes(rig.rider); }
function acquireMGBullet() {
    for (const p of mgPool) if (!enemyBullets.includes(p.bullet)) return p;
    return null;
}
function fireMG(rig) {
    const C = cfg().machineGun, pooled = acquireMGBullet();
    if (!pooled) return false;
    const slot = rig.shotsInBurst % rig.weapon.muzzleOffsets.length;
    muzzleWorld(rig, rig.weapon.muzzleOffsets[slot], muzzlePos);
    const dx = camera.position.x - muzzlePos.x;
    const dz = camera.position.z - muzzlePos.z;
    const d = Math.hypot(dx, dz) || 1, b = pooled.bullet;
    b.dir.set(dx / d, 0, dz / d);
    b.mesh.position.copy(muzzlePos);
    b.mesh.rotation.y = Math.atan2(b.dir.x, b.dir.z);
    b.mesh.visible = true; scene.add(b.mesh);
    // Shared enemy-bullet runtime stores lifetime in 60 Hz frame units (tank
    // and locomotive use CFG.robot.rangedBulletLife). Keep JSON human-readable
    // in seconds, then convert at the projectile boundary.
    b.speed = C.bulletSpeed; b.life = C.bulletLifeSec * 60; b.dmg = C.damage;
    b.monasDmg = 0; b.px = muzzlePos.x; b.py = muzzlePos.y; b.pz = muzzlePos.z;
    b.source = 'stage11-double-cabin-mg'; b.vehicleId = rig.id;
    enemyBullets.push(b);
    rig.weapon.flashMat.opacity = 1;
    rig.shotsFired++; rig.shotsInBurst++; shotsFired++;
    if (rig.audioT <= 0) {
        playSFX(sfxTankMG, .34); rig.audioT = C.audioGapSec;
    }
    return true;
}
function fireMissile(rig) {
    const C = cfg().homingMissile;
    const m = missiles.find(x => !x.active); if (!m) return false;
    const slot = rig.missilesFired % rig.weapon.muzzleOffsets.length;
    muzzleWorld(rig, rig.weapon.muzzleOffsets[slot], muzzlePos);
    const dx = camera.position.x - muzzlePos.x;
    const dz = camera.position.z - muzzlePos.z;
    const d = Math.hypot(dx, dz) || 1;
    m.active = true; m.source = rig; m.hp = C.projectileHp; m.life = C.lifeSec;
    m.speed = C.speed; m.dirx = dx / d; m.dirz = dz / d;
    m.mesh.position.copy(muzzlePos); m.mesh.visible = true;
    m.mesh.rotation.y = -Math.atan2(m.dirz, m.dirx);
    rig.missilesFired++; missilesFired++;
    rig.weapon.flashMat.opacity = 1;
    playSFX(sfxRocketShot, .62); return true;
}
function hideMissile(m) {
    m.active = false; m.source = null; m.mesh.visible = false;
}
function updateMissiles(dt) {
    const C = cfg().homingMissile;
    for (const m of missiles) if (m.active) {
        const want = Math.atan2(camera.position.z - m.mesh.position.z,
            camera.position.x - m.mesh.position.x);
        let cur = Math.atan2(m.dirz, m.dirx);
        cur += clamp(wrapAngle(want - cur), -C.turnRadPerSec * dt,
            C.turnRadPerSec * dt);
        m.dirx = Math.cos(cur); m.dirz = Math.sin(cur);
        m.px = m.mesh.position.x; m.pz = m.mesh.position.z;
        m.mesh.position.x += m.dirx * m.speed * dt;
        m.mesh.position.z += m.dirz * m.speed * dt;
        m.mesh.position.y += (8 - m.mesh.position.y) * Math.min(1, dt * 2);
        m.mesh.rotation.y = -cur; m.life -= dt;
        const flame = m.mesh.userData.flame;
        if (flame) flame.scale.y = .82 + Math.sin(m.life * 18) * .16;
        let shotDown = false;
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            if (segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0,
                b.mesh.position.z, m.mesh.position.x, 0, m.mesh.position.z)
                >= C.hitRadius ** 2) continue;
            m.hp -= b.damage != null ? b.damage : CFG.weapons.bulletDamage;
            stats.hits++; scene.remove(b.mesh); bullets.splice(bi, 1);
            if (m.hp <= 0) {
                explodeAt(new THREE.Vector3(m.mesh.position.x, 6,
                    m.mesh.position.z), 8, 1, sfxRocketExplode);
                hideMissile(m); shotDown = true;
            }
            break;
        }
        if (shotDown) continue;
        if (Math.hypot(m.mesh.position.x - camera.position.x,
            m.mesh.position.z - camera.position.z) < player.radius + 5) {
            queueBoom(m.mesh.position.x, 6, m.mesh.position.z,
                C.blastRadius, true, C.damage, 1, sfxRocketExplode);
            hideMissile(m); addCamShake(2.5);
        } else if (m.life <= 0) hideMissile(m);
    }
}
function clearProjectiles() {
    for (const p of mgPool) {
        const i = enemyBullets.indexOf(p.bullet);
        if (i >= 0) enemyBullets.splice(i, 1);
        scene.remove(p.bullet.mesh); p.bullet.mesh.visible = false;
        if (root) root.add(p.bullet.mesh);
    }
    for (const m of missiles) hideMissile(m);
}

export function ensureStage11ForestVehicles(parent, placements) {
    if (built) return rigs;
    if (cfg().asset !== 'stage7Pickup')
        throw new Error(`Unsupported Stage 11 forest vehicle asset: ${cfg().asset}`);
    built = true; root = parent;
    for (let i = 0; i < placements.length; i++) {
        const placement = placements[i];
        const colors = cfg().bodyColors;
        const bodyColor = colors[i % colors.length];
        const group = buildStage7RoadVehicle('pickup', bodyColor, CAMP_M);
        const pickup = {
            group, scaleX: CAMP_M, scaleY: CAMP_M, scaleZ: CAMP_M,
            dimensionsMeters: STAGE7_ROAD_VEHICLE_SPECS.pickup,
            passengers: [], wreckT: 0,
        };
        pickup.group.name = `stage11-double-cabin-${i + 1}`;
        pickup.group.userData.stage11AssetSource = 'stage7-roadVehicles';
        const weapon = addDoubleCabAndWeapon(pickup.group,
            placement.type, i, bodyColor);
        parent.add(pickup.group);
        const wreckFx = buildVehicleWreckFx(parent, i);
        const wreckState = captureWreckState(pickup, weapon);
        rigs.push({
            id: i + 1, meter: placement.meter, type: placement.type,
            placement: { ...placement }, pickup, weapon, rider: null,
            active: false, cleared: false, engaged: false, inView: false,
            viewT: 0, fireReady: false,
            shotT: 0, cooldownT: 0, burstLeft: 0, shotsInBurst: 0,
            shotsFired: 0, burstsCompleted: 0, audioT: 0,
            missileT: 0, missilesFired: 0,
            destroying: false, destructionT: 0, blastStage: 0, charred: false,
            wreckFx, breakaways: wreckState.breakaways,
            wreckMaterials: wreckState.materials,
        });
    }
    const M = cfg().machineGun;
    for (let i = 0; i < M.poolSize; i++) {
        const bullet = {
            // Tank and locomotive MGs both use this shared enemy bolt rather
            // than the deliberately elongated Combat Gunship tracer.
            mesh: makeEnemyBulletMesh(1, 0),
            dir: new THREE.Vector3(), speed: M.bulletSpeed, life: 0,
            dmg: M.damage, monasDmg: 0, px: 0, py: 0, pz: 0,
            source: 'stage11-double-cabin-mg', vehicleId: 0,
        };
        bullet.mesh.visible = false; parent.add(bullet.mesh); mgPool.push({ bullet });
    }
    for (let i = 0; i < cfg().homingMissile.poolSize; i++) {
        const mesh = buildCombatGunshipMissileMesh();
        parent.add(mesh);
        missiles.push({
            mesh, active: false, source: null, hp: 0, life: 0,
            speed: 0, dirx: 0, dirz: 0, px: 0, pz: 0,
        });
    }
    return rigs;
}

export function resetStage11ForestVehicles() {
    clearProjectiles();
    shotsFired = missilesFired = completedBursts = vehiclesCleared = 0;
    const M = cfg().machineGun;
    for (const rig of rigs) {
        resetVehicleWreck(rig);
        rig.pickup.group.rotation.set(0, rig.placement.yaw, 0);
        rig.pickup.group.position.set(rig.placement.x, 0, rig.placement.z);
        rig.pickup.group.visible = true; rig.pickup.wreckT = 0;
        rig.active = true; rig.cleared = false; rig.engaged = false; rig.inView = false;
        rig.viewT = 0; rig.fireReady = false;
        rig.shotT = 0; rig.cooldownT = 0; rig.burstLeft = M.roundsPerBurst;
        rig.shotsInBurst = 0; rig.shotsFired = 0; rig.burstsCompleted = 0;
        rig.audioT = 0; rig.missileT = cfg().homingMissile.launchDelaySec;
        rig.missilesFired = 0;
        rig.weapon.turret.rotation.y = 0;
        rig.weapon.flashMat.opacity = 0;
        const V = cfg()[rig.type];
        spawnCampaignRobot(rig.placement.x, rig.placement.z, 11,
            V.robotClass, true);
        const bot = robots[robots.length - 1];
        bot.hp = V.hp; bot.maxHp = V.hp;
        bot.mounted = true; bot.state = 'mounted'; bot.moving = false;
        bot.aiming = true; bot.ranged = false;
        bot.stage11ForestVehicle = rig;
        bot.encounter = `forest-vehicle-${rig.meter}-${rig.id}`;
        rig.rider = bot; rig.pickup.passengers = [bot];
    }
}

export function stage11ForestVehicleRobotAI(bot) {
    const rig = bot?.stage11ForestVehicle;
    if (!rig) return null;
    riderWorld(rig, mountPos);
    bot.mesh.position.copy(mountPos); bot.groundY = mountPos.y;
    bot.state = 'mounted'; bot.moving = false; bot.aiming = true; bot.losOK = true;
    const dx = camera.position.x - bot.mesh.position.x;
    const dz = camera.position.z - bot.mesh.position.z;
    bot.mesh.rotation.y = Math.atan2(dx, dz);
    return {};
}

export function updateStage11ForestVehicles(dt, context = {}) {
    const C = cfg(), M = C.machineGun;
    for (const rig of rigs) {
        rig.audioT = Math.max(0, rig.audioT - dt);
        rig.weapon.flashMat.opacity *= Math.max(0,
            1 - dt * C.muzzleFlashFadePerSec);
        if (!rig.cleared && !riderAlive(rig)) {
            startVehicleWreck(rig);
        }
        updatePickupVisual(rig, dt);
        if (!rig.active) continue;
        const want = desiredYaw(rig);
        rig.weapon.turret.rotation.y += wrapAngle(want - rig.weapon.turret.rotation.y)
            * Math.min(1, dt * C.aimResponsePerSec);
        const d = Math.hypot(camera.position.x - rig.pickup.group.position.x,
            camera.position.z - rig.pickup.group.position.z);
        rig.inView = !context.inView || context.inView(
            rig.pickup.group.position.x, rig.pickup.group.position.z,
            STAGE11_DOUBLE_CABIN_METERS.height * CAMP_M * .65);
        // Entering the frame starts both the Pasupati-style camera zoom and a
        // readable two-second arming window. Leaving the frame resets it, so a
        // vehicle can never bank an off-camera countdown and fire on re-entry.
        rig.viewT = rig.inView
            ? Math.min(C.engagementDelaySec, rig.viewT + dt) : 0;
        rig.fireReady = rig.viewT >= C.engagementDelaySec;
        rig.engaged = rig.inView && d <= C.activationRangeMeters * CAMP_M
            && (!context.los || context.los(rig.pickup.group.position.x,
                rig.pickup.group.position.z, camera.position.x, camera.position.z));
        if (!rig.engaged || !rig.fireReady) continue;
        if (rig.type === 'machineGun') {
            if (rig.cooldownT > 0) {
                rig.cooldownT -= dt;
                if (rig.cooldownT <= 0) {
                    rig.burstLeft = M.roundsPerBurst; rig.shotsInBurst = 0;
                }
                continue;
            }
            rig.shotT -= dt;
            if (rig.burstLeft > 0 && rig.shotT <= 0 && fireMG(rig)) {
                rig.burstLeft--; rig.shotT = M.roundGapSec;
                if (rig.burstLeft === 0) {
                    rig.cooldownT = M.burstGapSec;
                    rig.burstsCompleted++; completedBursts++;
                }
            }
        } else {
            rig.missileT -= dt;
            const ownActive = missiles.some(m => m.active && m.source === rig);
            if (rig.missileT <= 0 && !ownActive && fireMissile(rig))
                rig.missileT = C.homingMissile.fireGapSec;
        }
    }
    updateMissiles(dt);
}

export function cleanupStage11ForestVehicles() {
    clearProjectiles();
    for (const rig of rigs) {
        rig.engaged = false; rig.inView = false; rig.weapon.flashMat.opacity = 0;
        rig.viewT = 0; rig.fireReady = false;
        rig.wreckFx.group.visible = false;
    }
}
export function stage11ForestVehiclesAllCleared() {
    return rigs.length > 0 && rigs.every(r => r.cleared || !riderAlive(r));
}
export function stage11ForestNearestVehicle() {
    let best = null, d2 = Infinity;
    for (const rig of rigs) if (!rig.cleared && riderAlive(rig)) {
        const dx = rig.placement.x - camera.position.x;
        const dz = rig.placement.z - camera.position.z;
        const q = dx * dx + dz * dz;
        if (q < d2) { d2 = q; best = rig; }
    }
    return best ? { x: best.placement.x, z: best.placement.z,
        meter: best.meter, type: best.type } : null;
}
export function stage11ForestVisibleVehicle() {
    let best = null, d2 = Infinity;
    for (const rig of rigs) if (rig.active && rig.inView && riderAlive(rig)) {
        const dx = rig.placement.x - camera.position.x;
        const dz = rig.placement.z - camera.position.z;
        const q = dx * dx + dz * dz;
        if (q < d2) { d2 = q; best = rig; }
    }
    return best ? { id: best.id, meter: best.meter, type: best.type } : null;
}
// Live weapon vehicles standing at one route metre. The fabricator checkpoint
// at that metre reads this as part of its own gate condition, so a metre that
// carries vehicles cannot be opened by destroying the machines alone.
export function stage11ForestVehiclesAliveAt(meter) {
    let n = 0;
    for (const rig of rigs)
        if (rig.meter === meter && !rig.cleared && riderAlive(rig)) n++;
    return n;
}
export function stage11ForestCheckpointCleared(meter) {
    const group = rigs.filter(r => r.meter === meter);
    // Keep the combat camera wide through the authored blast sequence, then
    // release it while the last smoke puffs finish fading.
    return group.length > 0 && group.every(r => r.cleared
        && (!r.destroying || r.destructionT >= cfg().wreck.cameraHoldSec));
}
export const stage11ForestVehiclesDebug = () => {
    const M = cfg().machineGun, H = cfg().homingMissile;
    return {
        built, count: rigs.length, active: rigs.filter(r => r.active).length,
        cleared: vehiclesCleared,
        assetSource: 'stage7-roadVehicles', assetType: 'pickup',
        typeCounts: {
            machineGun: rigs.filter(r => r.type === 'machineGun').length,
            homingMissile: rigs.filter(r => r.type === 'homingMissile').length,
        },
        configOwned: true,
        activationRangeMeters: cfg().activationRangeMeters,
        engagementDelaySec: cfg().engagementDelaySec,
        asset: cfg().asset,
        wreck: {
            ...cfg().wreck,
            prebuiltPerVehicle: true, pointLights: 0,
            active: rigs.filter(r => r.destroying).length,
            blastsPerVehicle: rigs[0]?.wreckFx.blasts.length || 0,
            firesPerVehicle: rigs[0]?.wreckFx.fires.length || 0,
            smokePerVehicle: rigs[0]?.wreckFx.smoke.length || 0,
            sparksPerVehicle: rigs[0]?.wreckFx.sparks.length || 0,
            breakawaysPerVehicle: rigs[0]?.breakaways.length || 0,
        },
        checkpoints: cfg().checkpoints.map(c => ({
            meter: c.meter,
            weapons: c.vehicles.map(v => v.weapon),
            vehicles: c.vehicles.map(v => ({ ...v })),
        })),
        machineGun: {
            hp: M.hp, robotClass: M.robotClass,
            roundsPerBurst: M.roundsPerBurst, damage: M.damage,
            roundGapSec: M.roundGapSec, burstGapSec: M.burstGapSec,
            bulletSpeed: M.bulletSpeed, bulletLifeSec: M.bulletLifeSec,
            audioGapSec: M.audioGapSec,
            visualSource: 'shared-tank-train-bolt', aimMode: 'live-per-round',
            poolSize: mgPool.length,
            activeProjectiles: mgPool.filter(p => enemyBullets.includes(p.bullet)).length,
            shotsFired, completedBursts,
        },
        homingMissile: {
            hp: H.hp, robotClass: H.robotClass,
            poolSize: missiles.length, damage: H.damage,
            projectileHp: H.projectileHp, speed: H.speed,
            turnRadPerSec: H.turnRadPerSec, lifeSec: H.lifeSec,
            launchDelaySec: H.launchDelaySec, fireGapSec: H.fireGapSec,
            blastRadius: H.blastRadius, hitRadius: H.hitRadius,
            visualSource: 'combatGunship', steering: 'homing', prebuilt: true,
            active: missiles.filter(m => m.active).length, fired: missilesFired,
            missiles: missiles.map(m => ({
                active: m.active, x: m.mesh.position.x, z: m.mesh.position.z,
                dirx: m.dirx, dirz: m.dirz, hp: m.hp, life: m.life,
            })),
        },
        rigs: rigs.map(r => ({
            id: r.id, meter: r.meter, type: r.type,
            x: r.placement.x, z: r.placement.z, yaw: r.placement.yaw,
            lateral: r.placement.lateral, active: r.active,
            cleared: r.cleared, engaged: r.engaged, inView: r.inView,
            destroying: r.destroying, destructionT: r.destructionT,
            blastStage: r.blastStage, charred: r.charred,
            wreckFxVisible: r.wreckFx.group.visible,
            visibleFires: r.wreckFx.group.visible
                ? r.wreckFx.fires.filter(x => x.mesh.visible).length : 0,
            visibleSmoke: r.wreckFx.group.visible
                ? r.wreckFx.smoke.filter(x => x.mesh.visible).length : 0,
            visibleSparks: r.wreckFx.group.visible
                ? r.wreckFx.sparks.filter(x => x.mesh.visible).length : 0,
            breakaways: r.breakaways.length,
            landedParts: r.breakaways.filter(x => x.landed).length,
            breakawayPoseSum: r.breakaways.reduce((n, x) => n
                + Math.abs(x.o.position.x - x.px)
                + Math.abs(x.o.position.y - x.py)
                + Math.abs(x.o.position.z - x.pz)
                + Math.abs(x.o.rotation.x - x.rx)
                + Math.abs(x.o.rotation.y - x.ry)
                + Math.abs(x.o.rotation.z - x.rz), 0),
            bodyY: r.pickup.group.position.y,
            viewT: r.viewT, fireReady: r.fireReady,
            riderAlive: riderAlive(r), doubleCabin: true,
            assetSource: r.pickup.group.userData.stage11AssetSource,
            assetType: r.pickup.group.userData.stage7VehicleType,
            hp: riderAlive(r) ? r.rider.hp : 0,
            maxHp: r.rider?.maxHp || cfg()[r.type].hp,
            configuredHp: cfg()[r.type].hp,
            robotClass: cfg()[r.type].robotClass,
            shotsFired: r.shotsFired, shotsInBurst: r.shotsInBurst,
            burstsCompleted: r.burstsCompleted, cooldownT: r.cooldownT,
            missilesFired: r.missilesFired,
        })),
    };
};
