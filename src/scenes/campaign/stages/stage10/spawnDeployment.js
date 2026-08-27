// Stage 10 shared robot deployment presentation.
//
// Every configured encounter in both chapters is routed through this module:
// exactly two prebuilt fabricators signal their landing zone, descend as compact
// drop-pods, hit the ground, unfold, charge, and only then print the configured
// robots one at a time. Robots pass through scan/assembly/ejection poses before
// AI is released, so neither the machines nor their output pop into existence.
// The two machine rigs are pooled per chapter root and only move/change pose at
// runtime; no machine mesh, material, or light is allocated during gameplay.

import { CFG } from '../../../../core/config.js';
import { player, robots, stats } from '../../../../core/state.js';
import { addCamShake } from '../../../../core/renderer.js';
import { spawnBloodBurst, spawnGroundPuff } from '../../../../entities/effects.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, updateSpawnMachine, spawnMachineDebug,
    spawnMachineHp, wreckSpawnMachine,
} from '../../../../entities/spawnMachine.js';
import { playSFX, sfxExplode, sfxRobotSpawn } from '../../../../utils/sfx.js';
import { PAL } from '../../../../world/palette.js';
import { spawnCampaignRobot } from '../../utility/common.js';

const MACHINE_COUNT = 2;
const pools = new Map();

const config = () => CFG.campaign.stage10.spawnDeployment;
const clamp01 = k => Math.max(0, Math.min(1, k));
const easeOut = k => 1 - (1 - clamp01(k)) ** 3;
const easeIn = k => clamp01(k) ** 3;
const smooth = k => { const v = clamp01(k); return v * v * (3 - 2 * v); };

function basic(color, opacity = 0) {
    return new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthWrite: false, toneMapped: false,
    });
}

// All landing/portal geometry is built with the chapter world. Runtime only
// animates transforms and opacity, preserving the no-mid-game-allocation rule.
function buildDeploymentFx(parent, rig) {
    const group = new THREE.Group(); parent.add(group);
    const warningMat = basic(PAL.hazard);
    const beamMat = basic(PAL.tech);
    const shardMat = basic(PAL.amber);
    const groundRings = [];
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(9 + i * 4, 0.35, 6, 24),
            i === 0 ? warningMat : beamMat);
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.28 + i * 0.05;
        group.add(ring); groundRings.push(ring);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 7.5, 44, 8, 1, true), beamMat);
    beam.position.y = 22; group.add(beam);
    const shards = [];
    for (let i = 0; i < 8; i++) {
        const shard = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.5, 0.7), shardMat);
        group.add(shard); shards.push(shard);
    }

    // Hatch energy remains a child of the machine, so it follows drop, impact,
    // yaw and departure automatically. Torus default normal is local +Z: it
    // sits directly over spawnMachine.js's forward-facing iris.
    const hatchGroup = new THREE.Group();
    hatchGroup.position.set(0, 3.1 + rig.H * 0.39, rig.D * 0.56);
    rig.group.add(hatchGroup);
    const hatchMat = basic(PAL.tech);
    const hatchRings = [];
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2 + i * 1.7, 0.28, 6, 20), hatchMat);
        ring.position.z = i * 0.35; hatchGroup.add(ring); hatchRings.push(ring);
    }
    const scanDisc = new THREE.Mesh(new THREE.CircleGeometry(5.7, 18), hatchMat);
    scanDisc.position.z = 0.5; hatchGroup.add(scanDisc);
    return {
        group, groundRings, beam, shards, hatchGroup, hatchRings, scanDisc,
        mats: { warning: warningMat, beam: beamMat, shard: shardMat, hatch: hatchMat },
        warning: 0, beamLevel: 0, hatchLevel: 0, meshCount: 16,
    };
}

function rememberMachineParts(rig) {
    const save = o => ({
        px: o.position.x, py: o.position.y, pz: o.position.z,
        sx: o.scale.x, sy: o.scale.y, sz: o.scale.z,
    });
    return {
        frame: save(rig.frame), chamber: save(rig.chamber), gantry: save(rig.gantry),
        hatch: save(rig.hatchFrame), crown: save(rig.crown),
        turbines: rig.turbines.map(save),
    };
}

function restorePart(o, h) {
    o.position.set(h.px, h.py, h.pz); o.scale.set(h.sx, h.sy, h.sz);
}

function poseMachineParts(machine, open) {
    const k = smooth(open), rig = machine.rig, h = machine.parts;
    restorePart(rig.frame, h.frame); rig.frame.scale.y *= 0.42 + k * 0.58;
    restorePart(rig.chamber, h.chamber);
    rig.chamber.position.y -= (1 - k) * 5.5; rig.chamber.scale.y *= 0.22 + k * 0.78;
    restorePart(rig.gantry, h.gantry);
    rig.gantry.position.y += (1 - k) * 4; rig.gantry.scale.x *= 0.28 + k * 0.72;
    restorePart(rig.hatchFrame, h.hatch); rig.hatchFrame.scale.setScalar(0.12 + k * 0.88);
    restorePart(rig.crown, h.crown); rig.crown.scale.setScalar(0.18 + k * 0.82);
    for (let i = 0; i < rig.turbines.length; i++) {
        restorePart(rig.turbines[i], h.turbines[i]);
        rig.turbines[i].scale.setScalar(0.38 + k * 0.62);
    }
    machine.mechanicalOpen = k;
}

function clearFx(machine) {
    const fx = machine.fx;
    fx.warning = fx.beamLevel = fx.hatchLevel = 0;
    fx.mats.warning.opacity = fx.mats.beam.opacity = fx.mats.shard.opacity = 0;
    fx.mats.hatch.opacity = 0;
    fx.group.scale.setScalar(0.001); fx.hatchGroup.scale.setScalar(0.001);
}

function parkMachine(machine) {
    const C = config();
    machine.phase = 'idle';
    machine.rig.group.position.set(0, Math.max(1, C.machineDropHeight), 0);
    machine.rig.group.rotation.set(0, 0, 0);
    machine.rig.group.scale.setScalar(0.001);
    resetSpawnMachine(machine.rig, false);
    machine.alive = false; machine.hp = 0; machine.hitT = 0;
    poseMachineParts(machine, 1);
    clearFx(machine);
}

export function ensureStage10SpawnDeployment(key, parent) {
    if (pools.has(key)) return pools.get(key);
    const machines = [];
    for (let i = 0; i < MACHINE_COUNT; i++) {
        const rig = buildSpawnMachineMesh(24, 17, 24);
        rig.group.name = `stage10-${key}-event-fabricator-${i + 1}`;
        parent.add(rig.group);
        const machine = {
            rig, phase: 'idle', x: 0, z: 0, yaw: 0,
            parts: rememberMachineParts(rig), fx: buildDeploymentFx(parent, rig),
            mechanicalOpen: 1, alive: false, hp: 0, hitT: 0,
        };
        machines.push(machine);
        parkMachine(machine);
    }
    const pool = { key, machines, active: null, queue: [], history: [], elapsed: 0 };
    pools.set(key, pool);
    return pool;
}

function machinePointsFor(plans, authored) {
    if (authored?.length >= MACHINE_COUNT) return authored.slice(0, MACHINE_COUNT);
    if (!plans.length) return [{ x: 0, z: 0 }, { x: 0, z: 0 }];
    return [plans[0], plans[Math.floor(plans.length / 2)] || plans[0]];
}

function poseArrivalFx(machine, phase, k, t) {
    const fx = machine.fx, pulse = 0.5 + 0.5 * Math.sin(t * 11);
    fx.group.position.set(machine.x, 0, machine.z); fx.group.scale.setScalar(1);
    let warning = 0, beam = 0, shard = 0;
    if (phase === 'beacon') { warning = 0.38 + pulse * 0.5; beam = 0.06 + k * 0.12; shard = 0.3; }
    else if (phase === 'drop') { warning = 0.55; beam = 0.18 + (1 - k) * 0.28; shard = 0.72; }
    else if (phase === 'land') { warning = 0.85 * (1 - k); beam = 0.65 * (1 - k); shard = 0.9 * (1 - k); }
    else if (phase === 'unfold' || phase === 'charge') {
        warning = 0.18 * (1 - k); beam = phase === 'charge' ? 0.16 + pulse * 0.14 : 0.28 * (1 - k);
        shard = phase === 'charge' ? 0.32 + pulse * 0.25 : 0.45;
    } else if (phase === 'exit') { beam = 0.45 * (1 - k); shard = 0.5 * (1 - k); }
    fx.warning = warning; fx.beamLevel = beam;
    fx.mats.warning.opacity = warning; fx.mats.beam.opacity = beam; fx.mats.shard.opacity = shard;
    fx.beam.scale.set(0.7 + pulse * 0.25, Math.max(0.02, beam * 1.8), 0.7 + pulse * 0.25);
    for (let i = 0; i < fx.groundRings.length; i++) {
        const ring = fx.groundRings[i], wave = (t * 1.7 + i / 3) % 1;
        ring.scale.setScalar(0.55 + wave * 0.75 + (phase === 'land' ? k * 0.7 : 0));
        ring.rotation.z = t * (i % 2 ? -1.2 : 1.35) + i;
    }
    for (let i = 0; i < fx.shards.length; i++) {
        const a = t * (1.8 + (i % 3) * 0.22) + i / fx.shards.length * Math.PI * 2;
        const radius = 11 + (i % 2) * 4 + (phase === 'land' ? k * 8 : 0);
        const shardObj = fx.shards[i];
        shardObj.position.set(Math.cos(a) * radius, 2.5 + (i % 3) * 2 + pulse * 2,
            Math.sin(a) * radius);
        shardObj.rotation.set(a * 0.3, -a, a * 0.7);
        shardObj.scale.y = 0.45 + beam * 1.4;
    }
}

function poseHatchFx(machine, births, t) {
    const fx = machine.fx, level = clamp01(births * 0.42);
    fx.hatchLevel += (level - fx.hatchLevel) * 0.35;
    const p = fx.hatchLevel, pulse = 0.5 + 0.5 * Math.sin(t * 18);
    fx.mats.hatch.opacity = p * (0.34 + pulse * 0.42);
    fx.hatchGroup.scale.setScalar(Math.max(0.001, 0.72 + p * (0.24 + pulse * 0.12)));
    for (let i = 0; i < fx.hatchRings.length; i++) {
        fx.hatchRings[i].rotation.z = t * (i % 2 ? -4.2 : 5.4) + i * 1.7;
        fx.hatchRings[i].scale.setScalar(0.82 + p * 0.24 + pulse * 0.08 * (i + 1));
    }
    fx.scanDisc.scale.setScalar(0.65 + p * 0.35 + pulse * 0.08);
}

function startNext(pool) {
    if (pool.active || !pool.queue.length) return;
    const next = pool.queue.shift();
    const points = machinePointsFor(next.plans, next.machinePoints);
    const assignments = [[], []];
    for (let i = 0; i < next.plans.length; i++) assignments[i % MACHINE_COUNT].push(next.plans[i]);
    for (let i = 0; i < MACHINE_COUNT; i++) {
        const machine = pool.machines[i], point = points[i];
        const targets = assignments[i];
        const cx = targets.reduce((n, p) => n + p.x, 0) / Math.max(1, targets.length);
        const cz = targets.reduce((n, p) => n + p.z, 0) / Math.max(1, targets.length);
        machine.x = point.x; machine.z = point.z;
        machine.yaw = Math.atan2(cx - point.x, cz - point.z);
        machine.phase = 'beacon';
        machine.alive = true; machine.hp = spawnMachineHp(); machine.hitT = 0;
        resetSpawnMachine(machine.rig, false);
        machine.rig.group.position.set(machine.x, config().machineDropHeight, machine.z);
        machine.rig.group.rotation.set(0.34, machine.yaw - 1.4, -0.26);
        machine.rig.group.scale.setScalar(0.001);
        poseMachineParts(machine, 0);
        clearFx(machine); poseArrivalFx(machine, 'beacon', 0, pool.elapsed);
    }
    pool.active = {
        ...next, phase: 'beacon', t: 0, launched: 0, completed: 0,
        cursor: 0, canceled: 0, births: [], machineCount: MACHINE_COUNT,
        startedAt: pool.elapsed,
        machinesReadyAt: null, firstRobotAt: null,
    };
    addCamShake(1.8);
}

export function beginStage10SpawnDeployment(key, spec) {
    const pool = pools.get(key);
    if (!pool) throw new Error(`Stage 10 deployment pool not built: ${key}`);
    const plans = (spec?.plans || []).map(p => ({
        cls: p.cls || 'C', x: p.x, z: p.z, y: p.y || 0,
        encounter: p.encounter || spec.name, active: p.active !== false,
    }));
    if (!plans.length) return 0;
    pool.queue.push({ name: spec.name, plans, machinePoints: spec.machinePoints || null });
    startNext(pool);
    return plans.length;
}

function spawnBirth(pool, deployment, plan, index) {
    const machineIndex = index % MACHINE_COUNT;
    const machine = pool.machines[machineIndex];
    const hatch = Math.max(8, machine.rig.D * 0.56);
    const start = {
        x: machine.x + Math.sin(machine.yaw) * hatch,
        y: plan.y + 5.5,
        z: machine.z + Math.cos(machine.yaw) * hatch,
    };
    spawnCampaignRobot(start.x, start.z, 10, plan.cls, false);
    const bot = robots[robots.length - 1], base = bot.scl || 1;
    bot.encounter = plan.encounter;
    bot.machineBirth = true;
    bot.machineBirthPhase = 'scan';
    bot.moving = false; bot.aiming = false; bot.state = 'idle';
    bot.mesh.position.y = start.y;
    bot.mesh.scale.set(base * 0.045, base * 0.012, base * 0.045);
    bot.mesh.rotation.y = machine.yaw;
    deployment.births.push({
        bot, base, t: 0, start, target: plan, active: plan.active, machineIndex,
    });
    deployment.launched++;
    if (deployment.firstRobotAt == null) deployment.firstRobotAt = pool.elapsed;
    spawnGroundPuff(start.x, start.z, PAL.tech, 9, start.y + 0.8);
    if (index < MACHINE_COUNT || index % 4 === 0) playSFX(sfxRobotSpawn, 0.52);
}

function circleEntryT(x0, z0, x1, z1, cx, cz, radius) {
    const dx = x1 - x0, dz = z1 - z0;
    const fx = x0 - cx, fz = z0 - cz;
    const a = dx * dx + dz * dz;
    const c = fx * fx + fz * fz - radius * radius;
    if (c <= 0) return 0;
    if (a < 1e-9) return null;
    const q = 2 * (fx * dx + fz * dz);
    const disc = q * q - 4 * a * c;
    if (disc < 0) return null;
    const t = (-q - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
}

function destroyMachine(pool, machine) {
    if (!machine.alive) return;
    machine.alive = false; machine.hp = 0; machine.hitT = 0;
    machine.phase = 'destroyed'; machine.mechanicalOpen = 1;
    clearFx(machine); wreckSpawnMachine(machine.rig);
    spawnGroundPuff(machine.x, machine.z, PAL.amber, 22, 2.5);
    spawnGroundPuff(machine.x, machine.z, PAL.gunmetal, 16, 1.2);
    playSFX(sfxExplode, 0.8); addCamShake(9);
    if (pool.active) pool.active.destroyed = (pool.active.destroyed || 0) + 1;
}

// Dipanggil lebih dulu oleh bulletBlocked chapter. Hanya peluru PLAYER punya
// `damage`; peluru robot membawa `dmg`, jadi pabrik tidak dapat tanpa sengaja
// menghancurkan rekannya sendiri saat muzzle preflight.
export function stage10SpawnDeploymentBulletHit(key, bullet, blockedBeforeHit = null) {
    const pool = pools.get(key), d = pool?.active;
    if (!d || bullet?.damage == null || !bullet.mesh?.position) return false;
    if (!['land', 'unfold', 'charge', 'birth', 'hold'].includes(d.phase)) return false;
    const bx = bullet.mesh.position.x, bz = bullet.mesh.position.z;
    const radius = Math.max(4, config().machineHitRadius || 15);
    let target = null, targetT = Infinity;
    for (const machine of pool.machines) {
        if (!machine.alive) continue;
        const t = circleEntryT(bullet.px, bullet.pz, bx, bz,
            machine.x, machine.z, radius);
        if (t == null || t >= targetT) continue;
        const hx = bullet.px + (bx - bullet.px) * t;
        const hz = bullet.pz + (bz - bullet.pz) * t;
        if (blockedBeforeHit && blockedBeforeHit(hx, hz, machine)) continue;
        target = machine; targetT = t;
    }
    if (!target) return false;
    const hx = bullet.px + (bx - bullet.px) * targetT;
    const hz = bullet.pz + (bz - bullet.pz) * targetT;
    const damage = Math.max(0, bullet.damage) * (bullet.explosive ? 1 : (player.dmgMul || 1));
    target.hp -= damage; target.hitT = 1;
    if (!bullet.explosive) {
        stats.hits++;
        spawnBloodBurst(hx, 10, hz, bullet.dir?.x || 0, bullet.dir?.z || 0,
            3, 0.55, 1.3, PAL.amber);
    }
    if (target.hp <= 0) destroyMachine(pool, target);
    return true;
}

function updateBirths(deployment, dt) {
    const C = config(), sec = Math.max(0.05, C.robotBirthSec);
    for (let i = deployment.births.length - 1; i >= 0; i--) {
        const birth = deployment.births[i], bot = birth.bot;
        if (robots.indexOf(bot) < 0 || bot.hp <= 0) {
            deployment.births.splice(i, 1);
            continue;
        }
        birth.t += dt;
        const k = clamp01(birth.t / sec), scanEnd = 0.22, assemblyEnd = 0.58;
        let phase, move = 0;
        if (k < scanEnd) {
            phase = 'scan';
            const s = clamp01(k / scanEnd), pulse = 0.5 + 0.5 * Math.sin(birth.t * 28);
            bot.mesh.position.set(birth.start.x, birth.start.y + Math.sin(s * Math.PI) * 1.8,
                birth.start.z);
            bot.mesh.scale.set(birth.base * (0.035 + pulse * 0.035),
                birth.base * (0.008 + s * 0.035), birth.base * (0.035 + pulse * 0.035));
            bot.mesh.rotation.y = birth.t * 13 + birth.machineIndex * Math.PI;
        } else if (k < assemblyEnd) {
            phase = 'assemble';
            const a = smooth((k - scanEnd) / (assemblyEnd - scanEnd));
            const lateral = 0.08 + a * 0.92;
            // Horizontal frame is constructed first; the vertical frame catches
            // up a beat later, making the body visibly assemble in slices.
            const vertical = 0.035 + smooth(clamp01((a - 0.16) / 0.84)) * 0.965;
            bot.mesh.position.set(birth.start.x, birth.start.y + (1 - a) * 2.2, birth.start.z);
            bot.mesh.scale.set(birth.base * lateral, birth.base * vertical, birth.base * lateral);
            bot.mesh.rotation.y = birth.machineIndex * Math.PI + (1 - a) * Math.PI * 2.4;
        } else {
            phase = 'eject';
            const e = clamp01((k - assemblyEnd) / (1 - assemblyEnd));
            move = easeOut(e);
            bot.mesh.position.x = birth.start.x + (birth.target.x - birth.start.x) * move;
            bot.mesh.position.z = birth.start.z + (birth.target.z - birth.start.z) * move;
            bot.mesh.position.y = birth.start.y + (birth.target.y - birth.start.y) * move
                + Math.sin(e * Math.PI) * Math.max(0, C.robotLaunchArc);
            const squash = Math.sin(e * Math.PI) * 0.13;
            bot.mesh.scale.set(birth.base * (1 + squash), birth.base * (1 - squash * 0.7),
                birth.base * (1 + squash));
            bot.mesh.rotation.y = birth.target.x === birth.start.x && birth.target.z === birth.start.z
                ? bot.mesh.rotation.y
                : Math.atan2(birth.target.x - birth.start.x, birth.target.z - birth.start.z);
        }
        bot.machineBirthPhase = phase;
        if (k < 1) continue;
        bot.mesh.position.set(birth.target.x, birth.target.y, birth.target.z);
        bot.mesh.scale.setScalar(birth.base);
        bot.baseY = birth.target.y; bot.groundY = birth.target.y;
        bot.machineBirth = false;
        bot.machineBirthPhase = null;
        bot.state = birth.active ? 'chasing' : 'idle';
        bot.moving = false; bot.aiming = false;
        spawnGroundPuff(birth.target.x, birth.target.z, PAL.techDim, 6, birth.target.y + 0.6);
        deployment.births.splice(i, 1);
        deployment.completed++;
    }
}

function finishDeployment(pool) {
    const done = pool.active;
    pool.history.push({
        name: done.name, machineCount: MACHINE_COUNT, planned: done.plans.length,
        launched: done.launched, completed: done.completed, startedAt: done.startedAt,
        canceled: done.canceled, destroyed: done.destroyed || 0,
        machinesReadyAt: done.machinesReadyAt, firstRobotAt: done.firstRobotAt,
        completedAt: pool.elapsed,
    });
    pool.active = null;
    for (const machine of pool.machines) parkMachine(machine);
    startNext(pool);
}

export function updateStage10SpawnDeployment(key, dt) {
    const pool = pools.get(key);
    if (!pool) return;
    const step = Math.max(0, dt || 0);
    pool.elapsed += step;
    startNext(pool);
    const d = pool.active;
    if (!d) return;
    const C = config();
    d.t += step;
    const powered = !['beacon', 'drop', 'land', 'exit'].includes(d.phase);
    for (const machine of pool.machines) {
        machine.hitT = Math.max(0, machine.hitT - step * 4.5);
        updateSpawnMachine(machine.rig, step, powered && machine.alive, machine.hitT);
    }

    if (d.phase === 'beacon') {
        const k = clamp01(d.t / Math.max(0.05, C.beaconSec));
        for (let i = 0; i < pool.machines.length; i++) {
            const machine = pool.machines[i], materialize = smooth(k);
            machine.phase = 'beacon';
            machine.rig.group.scale.setScalar(0.001 + materialize * 0.549);
            machine.rig.group.rotation.x = (1 - materialize) * (i ? -0.34 : 0.34);
            machine.rig.group.rotation.z = (1 - materialize) * (i ? 0.26 : -0.26);
            machine.rig.group.rotation.y = machine.yaw - 1.4 - materialize * 0.25;
            poseArrivalFx(machine, 'beacon', k, pool.elapsed);
        }
        if (k >= 1) {
            d.phase = 'drop'; d.t = 0;
            for (const machine of pool.machines) machine.rig.group.scale.setScalar(0.55);
        }
    } else if (d.phase === 'drop') {
        const k = clamp01(d.t / Math.max(0.05, C.machineDropSec));
        const fall = easeIn(k), wobble = (1 - k) * Math.sin(k * Math.PI * 6);
        for (let i = 0; i < pool.machines.length; i++) {
            const machine = pool.machines[i], rig = machine.rig.group;
            machine.phase = 'drop';
            rig.position.y = C.machineDropHeight * (1 - fall);
            rig.scale.setScalar(0.55 + easeOut(k) * 0.38);
            rig.rotation.x = wobble * 0.2 + (1 - k) * (i ? -0.32 : 0.32);
            rig.rotation.z = -wobble * 0.16 + (1 - k) * (i ? 0.24 : -0.24);
            rig.rotation.y = machine.yaw - (1 - k) * (Math.PI * 2.4 + i * 0.7);
            poseArrivalFx(machine, 'drop', k, pool.elapsed);
        }
        if (k >= 1) {
            d.phase = 'land'; d.t = 0;
            for (const machine of pool.machines) {
                machine.rig.group.position.y = 0;
                spawnGroundPuff(machine.x, machine.z, PAL.amber, 18, 0.8);
                spawnGroundPuff(machine.x, machine.z, PAL.steel, 12, 0.5);
            }
            playSFX(sfxRobotSpawn, 0.82); addCamShake(5.5);
        }
    } else if (d.phase === 'land') {
        const k = clamp01(d.t / Math.max(0.05, C.machineLandSec));
        const bounce = Math.sin(k * Math.PI * 2.5) * (1 - k);
        for (const machine of pool.machines) {
            if (machine.alive) machine.phase = 'land';
            machine.rig.group.position.y = Math.max(0, bounce * 2.3);
            const settle = 0.93 + k * 0.07;
            machine.rig.group.scale.set(settle + bounce * 0.05,
                settle - bounce * 0.08, settle + bounce * 0.05);
            machine.rig.group.rotation.set(bounce * 0.08, machine.yaw, -bounce * 0.065);
            if (machine.alive) poseArrivalFx(machine, 'land', k, pool.elapsed);
        }
        if (k >= 1) { d.phase = 'unfold'; d.t = 0; }
    } else if (d.phase === 'unfold') {
        const k = clamp01(d.t / Math.max(0.05, C.machineUnfoldSec));
        for (const machine of pool.machines) {
            machine.rig.group.position.y = 0; machine.rig.group.scale.setScalar(1);
            machine.rig.group.rotation.set(0, machine.yaw, 0);
            if (!machine.alive) continue;
            machine.phase = 'unfold';
            poseMachineParts(machine, k); poseArrivalFx(machine, 'unfold', k, pool.elapsed);
        }
        if (k >= 1) { d.phase = 'charge'; d.t = 0; }
    } else if (d.phase === 'charge') {
        const k = clamp01(d.t / Math.max(0.05, C.machineChargeSec));
        for (const machine of pool.machines) {
            if (!machine.alive) continue;
            machine.phase = 'charge'; poseMachineParts(machine, 1);
            poseArrivalFx(machine, 'charge', k, pool.elapsed);
        }
        if (k >= 1) {
            d.machinesReadyAt = pool.elapsed;
            d.phase = 'birth'; d.t = 0; d.launchClock = 0;
            for (const machine of pool.machines) {
                if (machine.alive) machine.phase = 'birth';
                machine.fx.mats.warning.opacity = machine.fx.mats.beam.opacity = 0;
                machine.fx.mats.shard.opacity = 0;
            }
            addCamShake(2.2);
        }
    } else if (d.phase === 'birth') {
        d.launchClock -= step;
        const gap = Math.max(0.01, C.robotBirthGapSec);
        while (d.cursor < d.plans.length && d.launchClock <= 1e-9) {
            const index = d.cursor++, machine = pool.machines[index % MACHINE_COUNT];
            if (!machine.alive) { d.canceled++; continue; }
            spawnBirth(pool, d, d.plans[index], index);
            d.launchClock += gap;
        }
    } else if (d.phase === 'hold') {
        for (const machine of pool.machines) if (machine.alive) machine.phase = 'hold';
        if (d.t >= Math.max(0, C.machineHoldSec)) { d.phase = 'exit'; d.t = 0; }
    } else if (d.phase === 'exit') {
        const k = clamp01(d.t / Math.max(0.05, C.machineExitSec));
        for (const machine of pool.machines) {
            machine.phase = 'exit';
            machine.rig.group.position.y = C.machineDropHeight * easeIn(k);
            machine.rig.group.scale.setScalar(Math.max(0.001, 1 - easeIn(k) * 0.999));
            machine.rig.group.rotation.y = machine.yaw + easeIn(k) * Math.PI * 2.2;
            poseArrivalFx(machine, 'exit', k, pool.elapsed);
        }
        if (k >= 1) finishDeployment(pool);
    }

    updateBirths(d, step);
    for (let i = 0; i < pool.machines.length; i++) {
        const births = d.births.reduce((n, b) => n + (b.machineIndex === i ? 1 : 0), 0);
        poseHatchFx(pool.machines[i], d.phase === 'birth' && pool.machines[i].alive ? births : 0,
            pool.elapsed);
    }
    if (d.phase === 'birth' && d.cursor >= d.plans.length && d.births.length === 0) {
        d.phase = 'hold'; d.t = 0;
    }
}

export function resetStage10SpawnDeployment(key) {
    const pool = pools.get(key);
    if (!pool) return;
    for (const birth of pool.active?.births || []) {
        if (birth.bot?.mesh) birth.bot.mesh.scale.setScalar(birth.base);
        if (birth.bot) { birth.bot.machineBirth = false; birth.bot.machineBirthPhase = null; }
    }
    pool.active = null; pool.queue.length = 0; pool.history.length = 0; pool.elapsed = 0;
    for (const machine of pool.machines) parkMachine(machine);
}

export function activateStage10SpawnDeploymentPrefix(key, prefix) {
    const pool = pools.get(key);
    if (!pool) return;
    const activate = d => {
        if (!String(d.name).startsWith(prefix)) return;
        for (const plan of d.plans) plan.active = true;
        for (const birth of d.births || []) birth.active = true;
    };
    if (pool.active) activate(pool.active);
    for (const queued of pool.queue) activate(queued);
}

export function stage10SpawnDeploymentPending(key, prefix = '') {
    const pool = pools.get(key);
    if (!pool) return false;
    const matches = d => !prefix || String(d.name).startsWith(prefix);
    return !!(pool.active && matches(pool.active)) || pool.queue.some(matches);
}

export function stage10SpawnDeploymentDebug(key) {
    const pool = pools.get(key);
    if (!pool) return { built: false, active: null, queued: [], machines: [], history: [] };
    const active = pool.active && {
        name: pool.active.name, phase: pool.active.phase,
        machineCount: MACHINE_COUNT, planned: pool.active.plans.length,
        launched: pool.active.launched, completed: pool.active.completed,
        canceled: pool.active.canceled, destroyed: pool.active.destroyed || 0,
        births: pool.active.births.length, machinesReadyAt: pool.active.machinesReadyAt,
        firstRobotAt: pool.active.firstRobotAt,
        birthPhases: pool.active.births.map(b => b.bot.machineBirthPhase),
    };
    return {
        built: true, active, queued: pool.queue.map(d => d.name),
        machines: pool.machines.map(machine => ({
            phase: machine.phase, x: machine.x, y: machine.rig.group.position.y,
            z: machine.z, yaw: machine.rig.group.rotation.y,
            alive: machine.alive, hp: machine.hp, maxHp: spawnMachineHp(), hit: machine.hitT,
            scale: machine.rig.group.scale.x,
            tilt: Math.max(Math.abs(machine.rig.group.rotation.x),
                Math.abs(machine.rig.group.rotation.z)),
            mechanicalOpen: machine.mechanicalOpen,
            arrivalFx: {
                warning: machine.fx.warning, beam: machine.fx.beamLevel,
                hatch: machine.fx.hatchLevel, meshes: machine.fx.meshCount,
            },
            rig: spawnMachineDebug(machine.rig),
        })),
        history: pool.history.map(h => ({ ...h })), elapsed: pool.elapsed,
    };
}
