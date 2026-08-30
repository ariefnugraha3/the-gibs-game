// Stage 11 Chapter 1 — robot-fabricator checkpoints every 50 metres.
//
// Each checkpoint is a PROGRESSION GATE, not an ambush: a full-width hazard
// barrier stands just past it and the only way to open it is to destroy every
// fabricator standing at that metre.  The barrier is a real blocker on exactly
// the line it is drawn on (no invisible wall), and it does not vanish when the
// checkpoint falls — it SINKS below the opaque asphalt, so its materials have
// been drawn since the stage's first frame and opening one can never trigger a
// shader recompile.
//
// The metre table is AUTHORED (`forestCheckpoints.meters`, retuned 2026-08-30
// because an even 50 m spacing read as one fight running into the next), but
// WHICH of those metres take the lighter garrison is still DERIVED: the metres
// where the double-cabin weapon vehicles already stand pick it up automatically,
// so retuning `forestVehicles.checkpoints` moves the lighter checkpoints with it
// instead of leaving a second table to fall out of sync.
//
// Every fabricator rig, gate mesh and material is built with the world.  The
// runtime only changes transforms, colours and `visible`, exactly like the
// shared spawn machine it is built from.

import { CFG } from '../../../../core/config.js';
import { scene, camera, addCamShake } from '../../../../core/renderer.js';
import { robots, player, stats } from '../../../../core/state.js';
import { showStageMsg } from '../../../../core/dom.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, updateSpawnMachine,
    wreckSpawnMachine, spawnMachineHp, spawnMachineDebug,
} from '../../../../entities/spawnMachine.js';
import { disposeRobot, killRobot } from '../../../../entities/robots.js';
import { spawnCampaignRobot } from '../../utility/common.js';
import {
    STAGE11_FOREST_VEHICLE_GROUP, stage11WeaponVehiclesAliveAt,
} from './weaponVehicles.js';
import { explodeAt, spawnGroundPuff, spawnBloodBurst } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { segPointDist2 } from '../../../../utils/math.js';
import { playSFX, sfxRobotSpawn } from '../../../../utils/sfx.js';
import { PAL } from '../../../../world/palette.js';

// Fabricator body size. Deliberately smaller than Stage 7's 30x20x30 so two of
// them plus a weapon vehicle still leave a driveable lane on an 80-unit road.
const MACHINE_W = 24, MACHINE_H = 16, MACHINE_D = 24;
const MACHINE_HALF = MACHINE_W * .5;
// Ejected robots land this far in front of the hatch, which faces back down the
// route toward the approaching player.
const BIRTH_REACH = 34;
const BIRTH_SLOT_LATERAL = [-11, 11, -22, 22];
const GATE_RAIL_THICK = 5, GATE_BLOCK_HALF = 5.5;
const GATE_LAMP_LOCKED = PAL.hazard;
// Campaign door convention: an accessible way through is always green.
const GATE_LAMP_OPEN = 0x2eff6a;
const PREFIX = 'forest-checkpoint';

let built = false, root = null, world = null;
const points = [];                 // checkpoint records
const gateBoxes = [];              // colliders of every CLOSED gate
const births = [];
let clearedCount = 0, spawnedTotal = 0, producedTotal = 0;
let lastArmed = null, viewTest = null;

function cfg() { return CFG.campaign.stage11.forestCheckpoints; }
function mats() { return world.mats; }

function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function hash(i, salt = 0) {
    let n = Math.imul((i + 23) ^ Math.imul(salt + 41, 0x9e3779b1), 0x85ebca6b);
    n ^= n >>> 16; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}

// --- layout ------------------------------------------------------------------

// One authored metre list plus the weapon vehicles' own metres. Metres outside
// the route are dropped rather than clamped, or two entries could collapse onto
// the same point and build two barriers on one line.
export function stage11ForestCheckpointPlan(routeMeters) {
    const C = cfg();
    const vehicleMeters = new Set(CFG.campaign.stage11.forestVehicles.checkpoints
        .map(c => c.meter));
    const meters = [...new Set((C.meters || [])
        .filter(m => Number.isFinite(m) && m > 0 && m < routeMeters))]
        .sort((a, b) => a - b);
    const plan = [];
    for (const meter of meters) {
        const shared = vehicleMeters.has(meter);
        const shape = shared ? C.vehicleCheckpoint : C.standard;
        plan.push({
            meter, kind: shared ? 'vehicleCheckpoint' : 'standard',
            machines: Math.max(1, shape.machines | 0),
            robots: { C: shape.robots.C | 0, B: shape.robots.B | 0, A: shape.robots.A | 0 },
            gateMeter: Math.min(routeMeters, meter + C.gateAheadMeters),
        });
    }
    return plan;
}

// Machines are placed on the asphalt and then pushed clear of anything already
// standing there — roadblock cars, hero trees and the weapon vehicles all
// register their footprint before this runs, so a fabricator can never be built
// inside one.
function placeMachine(meter, lateral, index) {
    const out = Math.sign(lateral) || 1;
    for (const along of [0, 2, -2, 4, -4, 6, -6]) {
        for (const spread of [0, 8, 16, 24]) {
            const lat = lateral + out * spread;
            const p = world.pointAtMeter(meter + along, lat);
            if (world.hitsBlocker(p.x, p.z, MACHINE_HALF + 2)) continue;
            if (!world.onAsphalt(p.x, p.z, MACHINE_HALF)) continue;
            return p;
        }
    }
    return world.pointAtMeter(meter, lateral + out * index * 4);
}

function buildGate(cp) {
    const M = mats(), p = world.pointAtMeter(cp.gateMeter);
    // The walk predicate opens up to `w` units either side of the centre line,
    // so the barrier has to be at least that wide or its ends would be a gap
    // the player can walk through beside a solid-looking rail.
    const half = p.w + 4;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw;
    root.add(g);

    // Pylons stand outside the walkable corridor and never move: they are the
    // mount the rail retracts into, and they carry the status lamp.
    // The lamp material is CLONED per gate: one shared instance would turn every
    // barrier in the forest green the moment a single checkpoint fell (the
    // Stage 9 fuel-indicator bug).
    const lampMat = M.gateLamp.clone();
    const lamps = [];
    for (const side of [-1, 1]) {
        const z = side * (half + 5);
        world.mesh(g, new THREE.BoxGeometry(9, 15, 9), M.gatePylon, 0, 7.5, z);
        world.mesh(g, new THREE.BoxGeometry(10, 1.6, 10), M.gateHazard, 0, 12.4, z);
        lamps.push(world.mesh(g, new THREE.BoxGeometry(3.2, 3.2, 3.2),
            lampMat, 0, 16.6, z));
    }

    // Everything that actually blocks lives in one group, so opening the gate is
    // a single transform and the collider is dropped on the same frame.
    const rail = new THREE.Group(); g.add(rail);
    world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 1.9, half * 2),
        M.gateHazard, 0, 9.4, 0);
    world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 1.9, half * 2),
        M.gateHazard, 0, 4.6, 0);
    world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 8.6, 3.4),
        M.gateFrame, 0, 5.6, 0);
    for (const side of [-1, 1]) {
        world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 8.6, 3.4),
            M.gateFrame, 0, 5.6, side * half * .55);
        world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK * .8, 1.1, half * .9),
            M.gateWhite, 0, 7, side * half * .5);
    }
    return { group: g, rail, lamps, lampMat, x: p.x, z: p.z, yaw: p.yaw,
        tx: p.tx, tz: p.tz, half, openT: 0, blocked: true };
}

function buildCheckpoint(spec, index) {
    const cp = { ...spec, index, armed: false, cleared: false, clearT: 0,
        machines: [], gate: null, garrison: 0, produced: 0 };
    const lateral = cfg().machineLateral;
    for (let i = 0; i < spec.machines; i++) {
        const base = (i % 2 ? lateral : -lateral)
            + (i > 1 ? (i % 2 ? 20 : -20) : 0);
        const p = placeMachine(spec.meter, base, i);
        const rig = buildSpawnMachineMesh(MACHINE_W, MACHINE_H, MACHINE_D);
        // The shared rig's hatch faces local +z; yaw - PI/2 turns that back down
        // the route so ejected robots always come out toward the player.
        rig.group.position.set(p.x, 0, p.z);
        rig.group.rotation.y = p.yaw - Math.PI / 2;
        rig.group.name = `stage11-forest-fabricator-${spec.meter}-${i + 1}`;
        root.add(rig.group); resetSpawnMachine(rig, false);
        world.blocker(p.x, p.z, MACHINE_HALF, MACHINE_HALF,
            MACHINE_H + 6, rig.group.rotation.y, 'spawn-machine');
        cp.machines.push({
            id: `${spec.meter}-${i + 1}`, rig, x: p.x, z: p.z,
            yaw: rig.group.rotation.y, lateral: base,
            hp: 0, alive: true, active: false, hitT: 0,
            clock: 0, nextBatch: 0, pending: 0, birthCooldown: 0,
            batches: 0, spawned: 0,
        });
    }
    cp.gate = buildGate(cp);
    return cp;
}

export function ensureStage11ForestCheckpoints(parent, api) {
    if (built) return points;
    built = true; root = parent; world = api;
    for (const [i, spec] of stage11ForestCheckpointPlan(api.routeMeters).entries())
        points.push(buildCheckpoint(spec, i));
    api.count('forest-checkpoint', points.length);
    api.count('checkpoint-fabricator',
        points.reduce((n, c) => n + c.machines.length, 0));
    api.count('checkpoint-gate', points.length);
    return points;
}

// --- gate collision ----------------------------------------------------------

function refreshGateBoxes() {
    gateBoxes.length = 0;
    for (const cp of points) {
        const g = cp.gate;
        if (!g.blocked) continue;
        // Axes come STRAIGHT from the route tangent, never from a yaw round
        // trip: the thin axis must be the direction of travel and the long axis
        // must lie across the road. A mirrored box is rotated off the road
        // normal, and sliding along its face then also carries the player
        // forward -- which is exactly how a closed barrier got walked around.
        gateBoxes.push({ x: g.x, z: g.z, hx: GATE_BLOCK_HALF, hz: g.half, top: 12,
            axx: g.tx, axz: g.tz, azx: -g.tz, azz: g.tx,
            rad: Math.hypot(GATE_BLOCK_HALF, g.half), standable: false,
            yaw: g.yaw, kind: 'checkpoint-gate' });
    }
}
export function stage11ForestGateResolve(pos, radius, feetY = 0) {
    if (gateBoxes.length) resolveBlockers(pos, radius, feetY, gateBoxes);
}
export function stage11ForestGateSegBlocked(x0, z0, x1, z1) {
    const cx = (x0 + x1) * .5, cz = (z0 + z1) * .5;
    const halfLen = Math.hypot(x1 - x0, z1 - z0) * .5;
    for (const b of gateBoxes) {
        // Cheap bounding-circle reject first: every bullet and every robot LOS
        // test runs this, and at most one barrier is ever near the player.
        const pre = b.rad + halfLen;
        if ((cx - b.x) ** 2 + (cz - b.z) ** 2 > pre * pre) continue;
        const dx = x1 - x0, dz = z1 - z0;
        const n = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 7));
        for (let i = 0; i <= n; i++) {
            const t = i / n, qx = x0 + dx * t - b.x, qz = z0 + dz * t - b.z;
            if (Math.abs(qx * b.axx + qz * b.axz) <= b.hx
                && Math.abs(qx * b.azx + qz * b.azz) <= b.hz) return true;
        }
    }
    return false;
}
export const stage11ForestGateBlockHalf = () => GATE_BLOCK_HALF;

// --- robot production --------------------------------------------------------

function checkpointRobots(cp) {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 11 && bot.encounter === `${PREFIX}-${cp.meter}`) n++;
    return n;
}
function producedAlive(cp) {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 11 && bot.encounter === `${PREFIX}-${cp.meter}`
            && bot.checkpointBorn) n++;
    return n;
}
function productionClass(seed) {
    const mix = cfg().production.classMix;
    const c = Math.max(0, mix.C || 0), b = Math.max(0, mix.B || 0), a = Math.max(0, mix.A || 0);
    const total = c + b + a;
    if (!(total > 0)) return 'C';
    const roll = hash(seed, 7) * total;
    return roll < c ? 'C' : (roll < c + b ? 'B' : 'A');
}
function hatchPoint(m) {
    // Hatch faces local +z of a rig yawed by `m.yaw`.
    return { x: m.x + Math.sin(m.yaw) * (MACHINE_HALF + 2),
        z: m.z + Math.cos(m.yaw) * (MACHINE_HALF + 2) };
}
function birthTarget(m, slot) {
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    const lateral = BIRTH_SLOT_LATERAL[slot % BIRTH_SLOT_LATERAL.length];
    const raw = { x: m.x + fx * BIRTH_REACH - fz * lateral,
        z: m.z + fz * BIRTH_REACH + fx * lateral };
    return world.spawnPoint(raw.x, raw.z, 4);
}

function spawnCheckpointRobot(cp, cls, x, z, born) {
    spawnCampaignRobot(x, z, 11, cls, true);
    const bot = robots[robots.length - 1];
    bot.encounter = `${PREFIX}-${cp.meter}`;
    bot.checkpointMeter = cp.meter; bot.checkpointBorn = !!born;
    spawnedTotal++;
    return bot;
}

function machineBirth(cp, m, slot) {
    const start = hatchPoint(m), target = birthTarget(m, slot);
    const cls = productionClass(cp.meter * 31 + m.spawned);
    const bot = spawnCheckpointRobot(cp, cls, start.x, start.z, true);
    const base = bot.scl || 1;
    bot.state = 'idle'; bot.machineBirth = true; bot.moving = false; bot.aiming = false;
    bot.mesh.scale.set(base * .06, base * .025, base * .06);
    bot.mesh.rotation.y = m.yaw;
    births.push({ bot, t: 0, base, start, target });
    m.spawned++; cp.produced++; producedTotal++;
    spawnGroundPuff(start.x, start.z, PAL.tech, 9, 1.1);
    spawnBloodBurst(start.x, 9, start.z, -1, 0, 7, .85, 2.3, PAL.tech);
    playSFX(sfxRobotSpawn, .42);
}

function updateBirths(dt) {
    const sec = Math.max(.1, cfg().production.birthSec);
    for (let i = births.length - 1; i >= 0; i--) {
        const b = births[i];
        if (robots.indexOf(b.bot) < 0 || b.bot.hp <= 0) {
            b.bot.mesh.scale.setScalar(b.base); b.bot.machineBirth = false;
            births.splice(i, 1); continue;
        }
        b.t += dt;
        const k = Math.min(1, b.t / sec), grow = Math.min(1, k / .62);
        const g = grow * grow * (3 - 2 * grow);
        const e = 1 - (1 - Math.min(1, Math.max(0, (k - .28) / .72))) ** 2;
        b.bot.mesh.position.x = b.start.x + (b.target.x - b.start.x) * e;
        b.bot.mesh.position.z = b.start.z + (b.target.z - b.start.z) * e;
        b.bot.mesh.position.y = Math.sin(e * Math.PI) * 5;
        b.bot.mesh.scale.set(b.base * (.06 + g * .94), b.base * (.025 + g * .975),
            b.base * (.06 + g * .94));
        if (k < 1) continue;
        b.bot.mesh.position.set(b.target.x, 0, b.target.z);
        b.bot.mesh.scale.setScalar(b.base); b.bot.machineBirth = false;
        b.bot.state = 'chasing'; b.bot.moving = false; b.bot.aiming = false;
        spawnGroundPuff(b.target.x, b.target.z, PAL.techDim, 6, .7);
        births.splice(i, 1);
    }
}

// --- arming / clearing -------------------------------------------------------

// A checkpoint opens on TWO conditions, not one. `kind` is derived from the
// weapon-vehicle metres, so a metre that carries vehicles asks about them and a
// metre that does not never can — there is no second list to keep in sync.
const machinesDown = cp => cp.machines.every(m => !m.alive);
const vehiclesLeft = cp => cp.kind === 'vehicleCheckpoint'
    ? stage11WeaponVehiclesAliveAt(STAGE11_FOREST_VEHICLE_GROUP, cp.meter) : 0;
const vehiclesDown = cp => vehiclesLeft(cp) === 0;

function armCheckpoint(cp) {
    const P = cfg().production;
    cp.armed = true; lastArmed = cp.meter;
    for (const m of cp.machines) {
        m.alive = true; m.active = true; m.hp = spawnMachineHp();
        m.hitT = 0; m.clock = 0; m.nextBatch = Math.max(0, P.firstBatchSec);
        m.pending = 0; m.birthCooldown = 0; m.batches = 0; m.spawned = 0;
        resetSpawnMachine(m.rig, true);
    }
    // Garrison: the exact configured class mix, spread along the checkpoint on
    // a deterministic pattern so a replay always presents the same fight.
    const order = [];
    for (const cls of ['C', 'B', 'A'])
        for (let i = 0; i < cp.robots[cls]; i++) order.push(cls);
    const aheadLimit = Math.max(0, cfg().gateAheadMeters - 5);
    for (let i = 0; i < order.length; i++) {
        const along = Math.min(aheadLimit,
            ((i * 7) % 9 - 4) * 4 + (hash(cp.meter + i, 3) - .5) * 10);
        const lateral = ((i % 2 ? 1 : -1) * (12 + (i % 5) * 11))
            + (hash(cp.meter + i, 11) - .5) * 12;
        const raw = world.pointAtMeter(cp.meter + along, lateral);
        const p = world.spawnPoint(raw.x, raw.z, 4);
        spawnCheckpointRobot(cp, order[i], p.x, p.z, false);
    }
    cp.garrison = order.length;
    showStageMsg(`FABRICATOR CHECKPOINT ${cp.meter} M — DESTROY `
        + `${cp.machines.length} ${cp.machines.length > 1 ? 'MACHINES' : 'MACHINE'} `
        + 'TO OPEN THE ROAD', 4200);
    addCamShake(3.2);
}

// A cleared checkpoint takes its garrison with it, the same contract Stage 7's
// factory network uses: what is on screen dies through the normal explosion path
// with full gore and loot, what is off screen is removed silently rather than
// scattering pickups nobody will ever walk back for. Without it every gate's
// survivors would follow the player into the next gate and the live population
// would grow without bound over fifteen checkpoints.
function collapseCheckpoint(cp, inView) {
    if (!cfg().collapseOnClear) return 0;
    let n = 0;
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 11 || z.encounter !== `${PREFIX}-${cp.meter}`) continue;
        if (inView && inView(z.mesh.position.x, z.mesh.position.z, 8)) {
            spawnGroundPuff(z.mesh.position.x, z.mesh.position.z, PAL.amber, 6, 1.2);
            killRobot(i, { cause: 'explosion' });
        } else {
            disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
            stats.kills++;
        }
        n++;
    }
    for (let i = births.length - 1; i >= 0; i--)
        if (robots.indexOf(births[i].bot) < 0) births.splice(i, 1);
    return n;
}

function destroyMachine(cp, m) {
    if (!m.alive) return;
    m.alive = false; m.active = false; m.hp = 0; m.pending = 0; m.hitT = 0;
    wreckSpawnMachine(m.rig);
    explodeAt(new THREE.Vector3(m.x, MACHINE_H * .8, m.z), 30, 1);
    spawnGibs(m.x, MACHINE_H, m.z, 14, -1, 0, 2.5, PAL.gunmetal, .4, PAL.ink);
    spawnBloodDecal(m.x, m.z, 7, PAL.ink); addCamShake(8);
    const left = cp.machines.filter(x => x.alive).length;
    if (left > 0) {
        showStageMsg(`FABRICATOR DOWN — ${left} STILL RUNNING`, 2600);
        return;
    }
    // Clearing itself is POLLED in the frame update, never done here: at a
    // vehicle metre the last blocker can just as easily be a weapon pickup,
    // whose death happens inside the vehicle module with no hook of its own.
    const cars = vehiclesLeft(cp);
    if (cars > 0) showStageMsg(`FABRICATORS DOWN — DESTROY `
        + `${cars} ENEMY ${cars > 1 ? 'VEHICLES' : 'VEHICLE'} TO OPEN THE ROAD`, 3800);
}

function clearCheckpoint(cp, inView) {
    cp.cleared = true; cp.clearT = 0; cp.gate.blocked = false;
    clearedCount++; refreshGateBoxes();
    const down = collapseCheckpoint(cp, inView);
    showStageMsg(down > 0
        ? `CHECKPOINT ${cp.meter} M CLEAR — ${down} UNITS DOWN, ROAD OPEN`
        : `CHECKPOINT ${cp.meter} M CLEAR — ROAD OPEN`, 4200);
    addCamShake(11);
}

// --- frame -------------------------------------------------------------------

export function stage11ForestCheckpointBulletHit(b) {
    const r2 = cfg().hitRadius ** 2;
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    for (const cp of points) {
        if (!cp.armed || cp.cleared) continue;
        for (const m of cp.machines) {
            if (!m.alive) continue;
            if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.x, 0, m.z) >= r2) continue;
            m.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage)
                * (b.explosive ? 1 : (player.dmgMul || 1));
            if (!b.explosive) {
                stats.hits++;
                spawnBloodBurst(bx, 11 + Math.random() * 4, bz, b.dir?.x || -1,
                    b.dir?.z || 0, 3, .6, 1.4, PAL.amber);
            }
            m.hitT = 1;
            if (m.hp <= 0) destroyMachine(cp, m);
            return true;
        }
    }
    return false;
}

export function updateStage11ForestCheckpoints(dt, context = {}) {
    const C = cfg(), P = C.production;
    const playerMeter = world.meterAt(camera.position.x, camera.position.z);
    const batchCount = Math.max(1, P.batchCount | 0);
    const batchSec = Math.max(.1, P.batchSec);
    const birthGap = Math.max(.01, P.birthGapSec);
    const maxAlive = Math.max(1, P.maxAlive | 0);
    // `destroyMachine` also runs from the bullet hook, which carries no context
    // of its own; one stored predicate serves both paths.
    viewTest = context.inView || null;

    // Only the NEXT uncleared checkpoint may arm, never every checkpoint the
    // player's metre happens to be past. The gates already make the sequence
    // strictly ordered; stating it here is what keeps the live population bound
    // to one checkpoint even if something ever places the player further along.
    const nextUp = points.find(c => !c.cleared) || null;
    for (const cp of points) {
        if (cp === nextUp && !cp.armed
            && playerMeter >= cp.meter - C.armAheadMeters) armCheckpoint(cp);
        for (const m of cp.machines) {
            if (m.hitT > 0) m.hitT = Math.max(0, m.hitT - dt * 4.5);
            if (cp.armed && !cp.cleared && m.alive && m.active) {
                m.clock += dt; m.birthCooldown -= dt;
                while (m.clock >= m.nextBatch) {
                    m.pending += batchCount; m.batches++; m.nextBatch += batchSec;
                }
                while (m.pending > 0 && m.birthCooldown <= 0) {
                    if (producedAlive(cp) >= maxAlive) { m.pending = 0; break; }
                    machineBirth(cp, m, m.spawned);
                    m.pending--; m.birthCooldown += birthGap;
                }
            }
            updateSpawnMachine(m.rig, dt, m.active && m.alive, m.hitT);
        }
        if (cp.armed && !cp.cleared && machinesDown(cp) && vehiclesDown(cp))
            clearCheckpoint(cp, viewTest);
        if (!cp.cleared) continue;
        // The rail retracts under the opaque asphalt instead of being hidden, so
        // its materials stay drawn and the gate can never cause a recompile.
        cp.clearT = Math.min(C.gate.openSec, cp.clearT + dt);
        const k = smooth(cp.clearT / Math.max(.05, C.gate.openSec));
        cp.gate.rail.position.y = -C.gate.sinkUnits * k;
        cp.gate.lampMat.color.setHex(GATE_LAMP_OPEN);
    }
    updateBirths(dt);
}

export function resetStage11ForestCheckpoints() {
    births.length = 0; clearedCount = 0; spawnedTotal = 0; producedTotal = 0;
    lastArmed = null;
    for (const cp of points) {
        cp.armed = false; cp.cleared = false; cp.clearT = 0;
        cp.garrison = 0; cp.produced = 0;
        for (const m of cp.machines) {
            m.alive = true; m.active = false; m.hp = 0; m.hitT = 0;
            m.clock = 0; m.nextBatch = 0; m.pending = 0; m.birthCooldown = 0;
            m.batches = 0; m.spawned = 0;
            resetSpawnMachine(m.rig, false);
        }
        cp.gate.blocked = true; cp.gate.rail.position.y = 0;
        cp.gate.lampMat.color.setHex(GATE_LAMP_LOCKED);
    }
    refreshGateBoxes();
}

export function cleanupStage11ForestCheckpoints() {
    births.length = 0; viewTest = null;
}
export function stage11ForestCheckpointsAllCleared() {
    return points.length > 0 && points.every(c => c.cleared);
}
export function stage11ForestActiveCheckpoint() {
    for (const cp of points) if (cp.armed && !cp.cleared) return cp;
    return null;
}
// Radar target: whichever fabricator of the live checkpoint is nearest.
export function stage11ForestNearestFabricator() {
    const cp = stage11ForestActiveCheckpoint();
    if (!cp) return null;
    let best = null, d2 = Infinity;
    for (const m of cp.machines) if (m.alive) {
        const q = (m.x - camera.position.x) ** 2 + (m.z - camera.position.z) ** 2;
        if (q < d2) { d2 = q; best = m; }
    }
    return best ? { x: best.x, z: best.z, meter: cp.meter } : null;
}
export function stage11ForestCheckpointStatus() {
    const cp = stage11ForestActiveCheckpoint();
    if (!cp) return null;
    return { meter: cp.meter, alive: cp.machines.filter(m => m.alive).length,
        total: cp.machines.length, vehicles: vehiclesLeft(cp) };
}

export const stage11ForestCheckpointsDebug = () => {
    const C = cfg();
    return {
        built, count: points.length, cleared: clearedCount,
        configMeters: [...(C.meters || [])], gateAheadMeters: C.gateAheadMeters,
        armAheadMeters: C.armAheadMeters, collapseOnClear: !!C.collapseOnClear,
        configOwned: true, prebuilt: true,
        meters: points.map(c => c.meter),
        machineTotal: points.reduce((n, c) => n + c.machines.length, 0),
        robotTotal: points.reduce((n, c) =>
            n + c.robots.C + c.robots.B + c.robots.A, 0),
        spawnedTotal, producedTotal, activeBirths: births.length,
        closedGates: gateBoxes.length,
        lastArmed, active: stage11ForestActiveCheckpoint()?.meter ?? null,
        machineHp: spawnMachineHp(),
        production: { ...C.production, classMix: { ...C.production.classMix } },
        points: points.map(c => ({
            meter: c.meter, kind: c.kind, gateMeter: c.gateMeter,
            machines: c.machines.length, robots: { ...c.robots },
            armed: c.armed, cleared: c.cleared, garrison: c.garrison,
            machinesDown: machinesDown(c), vehiclesLeft: vehiclesLeft(c),
            needsVehicles: c.kind === 'vehicleCheckpoint',
            produced: c.produced, alive: checkpointRobots(c),
            gateBlocked: c.gate.blocked, gateHalfWidth: c.gate.half,
            gateRailY: c.gate.rail.position.y,
            gateLamps: c.gate.lamps.length,
            gateAxis: { axx: c.gate.tx, axz: c.gate.tz,
                azx: -c.gate.tz, azz: c.gate.tx },
            gateLampHex: c.gate.lampMat.color.getHex(),
            rigs: c.machines.map(m => ({
                id: m.id, x: m.x, z: m.z, yaw: m.yaw, lateral: m.lateral,
                hp: m.hp, alive: m.alive, active: m.active,
                spawned: m.spawned, ...spawnMachineDebug(m.rig),
            })),
        })),
    };
};

export const STAGE11_CHECKPOINT_PREFIX = PREFIX;
