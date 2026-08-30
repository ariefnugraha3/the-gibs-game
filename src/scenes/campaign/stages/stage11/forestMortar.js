// Stage 11 Chapter 1 — hostile mortar barrage over the last third of the route.
//
// Same contract as Stage 7's Pasupati artillery (2026-08-30, user request
// "tambahkan tembakan mortar musuh seperti di stage 7. dimulai dari meter 550
// sampai 750"), so the two behave identically and share one blast size:
//
//   * it may launch only while the player's ROUTE METRE sits inside the window;
//   * one ballistic shell every `intervalSec`, from off the road behind the
//     tree line ahead of the player, alternating sides;
//   * the shell keeps correcting toward the player until the final `lockSec`,
//     then FREEZES its marked impact coordinate, so the tracking ring is a
//     promise the player can outrun rather than a homing hit;
//   * the queued blast deliberately IGNORES cover between the impact and the
//     robots it catches, because it falls from above;
//   * shells and both rings are preallocated with the world.
//
// Blast radius is read from `bosses.tank.mortarBlastRatio` rather than copied,
// the same rule the Stage 5 locomotive follows, so retuning the tank keeps every
// mortar in the game equal.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { camera, addCamShake } from '../../../../core/renderer.js';
import { showStageMsg } from '../../../../core/dom.js';
import { mortarShell } from '../../../../entities/tank.js';
import { queueBoom } from '../../../../entities/robots.js';
import { spawnGroundPuff } from '../../../../entities/effects.js';
import {
    playSFX, stopLoopSFX, sfxTankMortar, sfxTankIncoming, sfxTankBlast,
} from '../../../../utils/sfx.js';
import { PAL } from '../../../../world/palette.js';

const MORTAR_UP = new THREE.Vector3(0, 1, 0);
const shellVel = new THREE.Vector3();
// The forest floor is flat, so the impact plane is one constant rather than a
// road-height query.
const GROUND_Y = 0, LAND_Y = GROUND_Y + .5;
const SOURCE_HEIGHT = 4 * CAMP_M;

let built = false, world = null;
const pool = [], blastOrigins = [];
let armed = false, timer = 0, shots = 0, impacts = 0, cursor = 0;
let clock = 0, lastImpact = null, announced = false;

function cfg() { return CFG.campaign.stage11.forestMortar; }
export function stage11ForestMortarBlastRadius() {
    return CFG.grenade.killRadius * CFG.campaign.bosses.tank.mortarBlastRatio;
}

export function ensureStage11ForestMortar(parent, api) {
    if (built) return pool;
    built = true; world = api;
    const trackingMat = new THREE.MeshBasicMaterial({
        color: PAL.amber, transparent: true, opacity: .42,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const lockedMat = new THREE.MeshBasicMaterial({
        color: PAL.hazard, transparent: true, opacity: .82,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const blastR = stage11ForestMortarBlastRadius();
    for (let i = 0; i < Math.max(1, cfg().poolSize | 0); i++) {
        const shell = mortarShell(); shell.visible = false; parent.add(shell);
        const marker = new THREE.Mesh(new THREE.RingGeometry(
            blastR * .72, blastR, 32), trackingMat);
        marker.rotation.x = -Math.PI / 2; marker.visible = false;
        marker.position.y = GROUND_Y + .42; parent.add(marker);
        const lock = new THREE.Mesh(new THREE.RingGeometry(
            blastR * .22, blastR * .34, 24), lockedMat);
        lock.rotation.x = -Math.PI / 2; lock.visible = false;
        lock.position.y = GROUND_Y + .46; parent.add(lock);
        pool.push({ shell, marker, lock, active: false, serial: 0,
            vx: 0, vy: 0, vz: 0, g: 0, tLeft: 0, life: 0, locked: false,
            targetX: 0, targetZ: 0, snd: null });
    }
    api.count('forest-mortar-shell', pool.length);
    return pool;
}

function deactivate(m) {
    stopLoopSFX(m.snd); m.snd = null; m.active = false; m.locked = false;
    m.shell.visible = false; m.marker.visible = false; m.lock.visible = false;
}
export function resetStage11ForestMortar() {
    for (const m of pool) deactivate(m);
    blastOrigins.length = 0;
    armed = announced = false; timer = cfg().intervalSec;
    shots = impacts = cursor = 0; clock = 0; lastImpact = null;
}
export const cleanupStage11ForestMortar = resetStage11ForestMortar;

// A mortar blast falls from ABOVE, so the road-level cover sweep must not stop
// it reaching the robots standing beside that cover.
export function stage11ForestMortarBlastOrigin(x, z) {
    return blastOrigins.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 4);
}

function launch() {
    let m = null;
    for (let i = 0; i < pool.length; i++) {
        const candidate = pool[(cursor + i) % pool.length];
        if (!candidate.active) {
            m = candidate; cursor = (cursor + i + 1) % pool.length; break;
        }
    }
    if (!m) return false;
    const C = cfg(), T = CFG.campaign.bosses.tank;
    const side = shots % 2 ? 1 : -1;
    const meter = world.meterAt(camera.position.x, camera.position.z);
    // Fired from beyond the tree line ahead of the player: the lateral offset
    // clears the drawn road, so the source is never standing on the asphalt.
    const ahead = world.pointAtMeter(meter + C.sourceLongitudinalMeters);
    const src = world.pointAtMeter(meter + C.sourceLongitudinalMeters,
        side * (ahead.w + C.sourceLateralMeters * CAMP_M));
    const sx = src.x, sy = SOURCE_HEIGHT, sz = src.z;
    const dx = camera.position.x - sx, dz = camera.position.z - sz;
    const d = Math.hypot(dx, dz) || 1;
    const g = T.mortarGravity;
    const riseCap = .5 * g * (T.mortarMaxSec * .45) ** 2;
    const rise = Math.min(riseCap,
        Math.max(T.mortarApexMeters * CAMP_M, d * T.mortarApexRatio));
    const apexY = Math.max(sy, LAND_Y) + rise;
    const tUp = Math.sqrt(2 * (apexY - sy) / g);
    const tDown = Math.sqrt(2 * (apexY - LAND_Y) / g);
    const flight = tUp + tDown;
    m.active = true; m.serial = ++shots;
    m.vx = dx / flight; m.vz = dz / flight; m.vy = g * tUp; m.g = g;
    m.tLeft = flight; m.life = T.mortarMaxSec; m.locked = false;
    m.targetX = camera.position.x; m.targetZ = camera.position.z;
    m.shell.position.set(sx, sy, sz); m.shell.visible = true;
    m.marker.position.set(m.targetX, GROUND_Y + .42, m.targetZ);
    m.marker.visible = true; m.marker.scale.setScalar(1);
    m.lock.position.set(m.targetX, GROUND_Y + .46, m.targetZ);
    m.lock.visible = false; m.lock.scale.setScalar(1);
    playSFX(sfxTankMortar, .68);
    spawnGroundPuff(sx, sz, PAL.concrete, 4, sy);
    return true;
}

function detonate(m) {
    const C = cfg(), x = m.shell.position.x, z = m.shell.position.z;
    stopLoopSFX(m.snd); m.snd = null;
    blastOrigins.push({ x, z, ttl: .25 });
    queueBoom(x, LAND_Y + 4.5, z, stage11ForestMortarBlastRadius(), true,
        C.playerDamage, C.robotDamage, sfxTankBlast);
    impacts++;
    lastImpact = { serial: m.serial, x, y: LAND_Y, z,
        targetX: m.targetX, targetZ: m.targetZ,
        radius: stage11ForestMortarBlastRadius(),
        playerDamage: C.playerDamage, robotDamage: C.robotDamage,
        locked: m.locked };
    addCamShake(5.5); deactivate(m);
}

export function stage11ForestMortarInZone(meter) {
    const C = cfg();
    return meter >= C.startMeter && meter <= Math.max(C.startMeter, C.endMeter);
}

export function updateStage11ForestMortar(dt, context = {}) {
    clock += dt;
    for (let i = blastOrigins.length - 1; i >= 0; i--)
        if ((blastOrigins[i].ttl -= dt) <= 0) blastOrigins.splice(i, 1);

    const C = cfg();
    const meter = world.meterAt(camera.position.x, camera.position.z);
    const inZone = !!context.live && stage11ForestMortarInZone(meter);
    if (!armed && inZone) {
        armed = true; timer = C.intervalSec;
        if (!announced) {
            announced = true;
            showStageMsg('HOSTILE MORTAR FIRE — KEEP MOVING', 4200);
        }
    }
    if (armed && inZone) {
        timer -= dt;
        while (timer <= 0) { launch(); timer += C.intervalSec; }
    } else if (armed && !inZone) timer = C.intervalSec;

    for (const m of pool) {
        if (!m.active) continue;
        m.tLeft -= dt; m.life -= dt;
        if (!m.locked) {
            m.targetX = camera.position.x; m.targetZ = camera.position.z;
            const remain = Math.max(.03, m.tLeft);
            m.vx = (m.targetX - m.shell.position.x) / remain;
            m.vz = (m.targetZ - m.shell.position.z) / remain;
            if (m.tLeft <= C.lockSec) { m.locked = true; m.lock.visible = true; }
        }
        m.marker.position.set(m.targetX, GROUND_Y + .42, m.targetZ);
        m.lock.position.set(m.targetX, GROUND_Y + .46, m.targetZ);
        m.marker.scale.setScalar(1 + Math.sin(clock * 10 + m.serial) * .08);
        if (m.locked) m.lock.scale.setScalar(1 + (1 - Math.max(0, m.tLeft)
            / Math.max(.01, C.lockSec)) * .8);

        m.vy -= m.g * dt;
        m.shell.position.x += m.vx * dt;
        m.shell.position.y += m.vy * dt;
        m.shell.position.z += m.vz * dt;
        shellVel.set(m.vx, m.vy, m.vz);
        if (shellVel.length() > 1e-3) {
            shellVel.normalize();
            m.shell.quaternion.setFromUnitVectors(MORTAR_UP, shellVel);
        }
        if (m.tLeft <= C.incomingSec && !m.snd)
            m.snd = playSFX(sfxTankIncoming, .62);
        if ((m.vy < 0 && m.shell.position.y <= LAND_Y) || m.life <= 0)
            detonate(m);
    }
}

export const stage11ForestMortarDebug = () => {
    const C = cfg();
    return {
        built, poolSize: pool.length, configOwned: true, prebuilt: true,
        startMeter: C.startMeter, endMeter: C.endMeter,
        intervalSec: C.intervalSec, lockSec: C.lockSec,
        playerDamage: C.playerDamage, robotDamage: C.robotDamage,
        blastRadius: stage11ForestMortarBlastRadius(),
        // Read from the tank rather than typed, so a tank retune moves both.
        blastRatioSource: 'campaign.bosses.tank.mortarBlastRatio',
        armed, announced, timer, shots, impacts,
        active: pool.filter(m => m.active).length,
        blastOrigins: blastOrigins.length,
        lastImpact: lastImpact && { ...lastImpact },
        shells: pool.map(m => ({
            active: m.active, locked: m.locked, serial: m.serial,
            x: m.shell.position.x, y: m.shell.position.y, z: m.shell.position.z,
            targetX: m.targetX, targetZ: m.targetZ,
            tLeft: m.tLeft, markerVisible: m.marker.visible,
            lockVisible: m.lock.visible,
        })),
    };
};
