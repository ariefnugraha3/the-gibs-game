// Stage 11 Chapter 2 — the thirteen ENEMY BLOCKADES of the IKN road network.
//
// A blockade is the city's version of Chapter 1's fabricator checkpoint: a
// hazard barrier straight across one road, defended by shared spawn machines, a
// garrison, and — at five of them — the same double-cabin weapon pickups. The
// road opens only when every fabricator AND every weapon vehicle standing at
// that blockade is destroyed; killing the garrison is never enough.
//
// Five rules, and three of them differ from Chapter 1 on purpose.
//
// (1) A CITY BARRIER STOPS MOVEMENT, NOT BULLETS. Chapter 1's route is a single
//     corridor, so a barrier can only ever be met from one side. This network
//     has loops and a player who circles round can arrive at a blockade from
//     BEHIND it, so a barrier that also blocked line of fire would be an
//     unopenable deadlock: the machines would stand on the unreachable side. It
//     is a rail barricade, so shooting between the rails is also what it looks
//     like.
//
// (2) THE DEFENDED SIDE IS DERIVED, never authored. `S11_CITY_BLOCKADES` carries
//     a `front` sign taken from each road end's graph distance to the start, so
//     machines, garrison and vehicles always face the natural approach without a
//     second orientation table to fall out of step with the map.
//
// (3) ARMING IS BY PROXIMITY AND CAPPED. Chapter 1 can arm "the next" checkpoint
//     because its route is ordered; a network has no next. Any uncleared
//     blockade within `armRangeUnits` arms, closest first, up to `maxArmed` at
//     once — which is what bounds the live population on a map that can put
//     three blockades within sight of one junction.
//
// (4) Clearing is POLLED in the frame update, never done inside `destroyMachine`
//     — at a vehicle blockade the last thing standing can be a weapon pickup,
//     whose death happens inside `weaponVehicles.js` with no hook of its own.
//
// (5) A cleared blockade takes its garrison with it (`collapseOnClear`): on
//     screen through the normal explosion path with full gore and loot, off
//     screen silently. Without it, thirteen blockades would grow the live
//     population without bound.
//
// Every fabricator rig, barrier mesh and material is built with the world; the
// runtime only changes transforms and colours.

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
    STAGE11_CITY_VEHICLE_GROUP, stage11WeaponVehiclesAliveAt,
} from './weaponVehicles.js';
import { explodeAt, spawnGroundPuff, spawnBloodBurst } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { segPointDist2 } from '../../../../utils/math.js';
import { playSFX, sfxRobotSpawn } from '../../../../utils/sfx.js';
import { PAL } from '../../../../world/palette.js';
import { S11_CITY_BLOCKADES, S11_CITY_SIDEWALK } from './cityRoads.js';

const MACHINE_W = 24, MACHINE_H = 16, MACHINE_D = 24;
const MACHINE_HALF = MACHINE_W * 0.5;
const BIRTH_REACH = 34;
const BIRTH_SLOT_LATERAL = [-11, 11, -22, 22];
const GATE_RAIL_THICK = 5.5, GATE_BLOCK_HALF = 5.5;
const GATE_LAMP_LOCKED = PAL.hazard;
// Campaign door convention: a way through that is open is always green.
const GATE_LAMP_OPEN = 0x2eff6a;
const PREFIX = 'city-blockade';

let built = false, root = null, world = null;
const points = [];
const gateBoxes = [];
const births = [];
let clearedCount = 0, spawnedTotal = 0, producedTotal = 0, standDowns = 0;
let viewTest = null;

function cfg() { return CFG.campaign.stage11.cityAxis.blockade; }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function hash(i, salt = 0) {
    let n = Math.imul((i + 29) ^ Math.imul(salt + 37, 0x9e3779b1), 0x85ebca6b);
    n ^= n >>> 16; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}

// --- layout ------------------------------------------------------------------

// Which blockades carry weapon vehicles is DERIVED from the one vehicle table in
// config, exactly as Chapter 1 derives its lighter checkpoints from the metres
// where pickups already stand. There is no second list of "vehicle blockades".
export function stage11CityVehiclePlacements() {
    const out = [];
    for (const entry of cfg().vehicles || []) {
        const spec = S11_CITY_BLOCKADES[entry.blockade | 0];
        if (!spec) continue;
        const ahead = cfg().vehicleAheadUnits;
        for (const v of entry.vehicles || []) {
            const lateral = clampLateral(spec.w, v.lateral || 0, 22);
            const x = spec.x + spec.tx * spec.front * ahead + spec.nx * lateral;
            const z = spec.z + spec.tz * spec.front * ahead + spec.nz * lateral;
            out.push({
                key: spec.index, blockade: spec.index, type: v.weapon,
                lateral, x, z,
                // Hostile pickups face back down the road toward the approach.
                yaw: Math.atan2(-spec.tz * spec.front, spec.tx * spec.front),
            });
        }
    }
    return out;
}
export const stage11CityVehicleBlockades = () =>
    new Set((cfg().vehicles || []).map(v => v.blockade | 0));

// A prop this wide can never be pushed past the fence: the search only ever
// pulls it back toward the centre line, so it cannot seal the road either.
function clampLateral(w, want, halfSize) {
    const limit = Math.max(halfSize + 4, w - halfSize - 6);
    const mag = Math.min(Math.abs(want), limit);
    return want < 0 ? -mag : mag;
}

export function stage11CityBlockadePlan() {
    const C = cfg(), vehicleSet = stage11CityVehicleBlockades();
    return S11_CITY_BLOCKADES.map(spec => {
        const withVehicles = vehicleSet.has(spec.index);
        const shape = withVehicles ? C.vehicle : C.standard;
        return {
            index: spec.index, kind: withVehicles ? 'vehicle' : 'standard',
            x: spec.x, z: spec.z, w: spec.w, road: spec.kind,
            machines: Math.max(1, shape.machines | 0),
            robots: { C: shape.robots.C | 0, B: shape.robots.B | 0,
                A: shape.robots.A | 0 },
        };
    });
}

function buildGate(spec) {
    const M = world.mats;
    // The walk predicate opens up to `w` PLUS the pavement either side of the
    // centre line, so the barrier has to span that or its ends would be a gap
    // beside a solid-looking rail — the pavement is walkable.
    const half = spec.w + S11_CITY_SIDEWALK + 6;
    const g = new THREE.Group();
    g.position.set(spec.x, 0, spec.z); g.rotation.y = spec.yaw;
    root.add(g);

    // The lamp material is CLONED per gate: one shared instance would turn every
    // barrier in the city green the moment a single blockade fell (the Stage 9
    // fuel-indicator bug).
    const lampMat = M.gateLamp.clone();
    const lamps = [];
    for (const side of [-1, 1]) {
        const z = side * (half + 5);
        world.mesh(g, new THREE.BoxGeometry(10, 16, 10), M.gatePylon, 0, 8, z);
        world.mesh(g, new THREE.BoxGeometry(11, 1.8, 11), M.gateHazard, 0, 13.2, z);
        lamps.push(world.mesh(g, new THREE.BoxGeometry(3.4, 3.4, 3.4),
            lampMat, 0, 17.4, z));
    }
    // Everything that blocks lives in one group, so opening the barrier is one
    // transform and the collider is dropped on the same frame.
    const rail = new THREE.Group(); g.add(rail);
    world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 2, half * 2),
        M.gateHazard, 0, 10, 0);
    world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 2, half * 2),
        M.gateHazard, 0, 5, 0);
    world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 9, 3.6),
        M.gateFrame, 0, 6, 0);
    for (const side of [-1, 1]) {
        world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK, 9, 3.6),
            M.gateFrame, 0, 6, side * half * 0.55);
        world.mesh(rail, new THREE.BoxGeometry(GATE_RAIL_THICK * 0.8, 1.2, half * 0.9),
            M.gateWhite, 0, 7.4, side * half * 0.5);
        // Concrete road blocks in front of the rail: the barricade reads as
        // something that was dragged into place, not a factory-fitted gate.
        world.mesh(g, new THREE.BoxGeometry(9, 7, 16), M.gateBlock,
            spec.front * 16, 3.5, side * half * 0.62);
    }
    return { group: g, rail, lamps, lampMat, half,
        x: spec.x, z: spec.z, yaw: spec.yaw, tx: spec.tx, tz: spec.tz,
        openT: 0, blocked: true };
}

function placeMachine(spec, lateral, index) {
    const C = cfg();
    const lat = clampLateral(spec.w, lateral, MACHINE_HALF);
    for (const along of [0, 10, -10, 20, -20, 30]) {
        const ahead = C.machineAheadUnits + along;
        const x = spec.x + spec.tx * spec.front * ahead + spec.nx * lat;
        const z = spec.z + spec.tz * spec.front * ahead + spec.nz * lat;
        if (!world.walk(x, z, MACHINE_HALF)) continue;
        if (world.hitsBlocker(x, z, MACHINE_HALF + 2)) continue;
        return { x, z };
    }
    const ahead = C.machineAheadUnits + index * 8;
    const raw = { x: spec.x + spec.tx * spec.front * ahead + spec.nx * lat,
        z: spec.z + spec.tz * spec.front * ahead + spec.nz * lat };
    return world.projectToRoad(raw.x, raw.z, MACHINE_HALF);
}

function buildBlockade(plan) {
    const spec = S11_CITY_BLOCKADES[plan.index];
    const cp = { ...plan, spec, armed: false, cleared: false, clearT: 0,
        machines: [], gate: null, garrison: 0, produced: 0 };
    const lateral = cfg().machineLateral;
    for (let i = 0; i < plan.machines; i++) {
        const base = (i % 2 ? lateral : -lateral) + (i > 1 ? (i % 2 ? 18 : -18) : 0);
        const p = placeMachine(spec, base, i);
        const rig = buildSpawnMachineMesh(MACHINE_W, MACHINE_H, MACHINE_D);
        // The shared rig's hatch faces local +z; this yaw turns it back down the
        // road so ejected robots always come out toward the player.
        const yaw = Math.atan2(-spec.tz * spec.front, spec.tx * spec.front)
            - Math.PI / 2;
        rig.group.position.set(p.x, 0, p.z);
        rig.group.rotation.y = yaw;
        rig.group.name = `stage11-city-fabricator-${plan.index}-${i + 1}`;
        root.add(rig.group); resetSpawnMachine(rig, false);
        world.blocker(p.x, p.z, MACHINE_HALF, MACHINE_HALF,
            MACHINE_H + 6, yaw, 'spawn-machine');
        cp.machines.push({
            id: `${plan.index}-${i + 1}`, rig, x: p.x, z: p.z, yaw,
            lateral: base, hp: 0, alive: true, active: false, hitT: 0,
            clock: 0, nextBatch: 0, pending: 0, birthCooldown: 0,
            batches: 0, spawned: 0,
        });
    }
    cp.gate = buildGate(spec);
    return cp;
}

export function ensureStage11CityBlockades(parent, api) {
    if (built) return points;
    built = true; root = parent; world = api;
    for (const plan of stage11CityBlockadePlan()) points.push(buildBlockade(plan));
    api.count('city-blockade', points.length);
    api.count('blockade-fabricator',
        points.reduce((n, c) => n + c.machines.length, 0));
    api.count('blockade-barrier', points.length);
    return points;
}

// --- barrier collision -------------------------------------------------------

function refreshGateBoxes() {
    gateBoxes.length = 0;
    for (const cp of points) {
        const g = cp.gate;
        if (!g.blocked) continue;
        // Axes come STRAIGHT from the road tangent, never from a yaw round trip:
        // a mirrored box is rotated off the road normal, and sliding along its
        // face then carries the player forward past it.
        gateBoxes.push({ x: g.x, z: g.z, hx: GATE_BLOCK_HALF, hz: g.half, top: 13,
            axx: g.tx, axz: g.tz, azx: -g.tz, azz: g.tx,
            rad: Math.hypot(GATE_BLOCK_HALF, g.half), standable: false,
            yaw: g.yaw, kind: 'city-blockade-barrier' });
    }
}
export function stage11CityGateResolve(pos, radius, feetY = 0) {
    if (gateBoxes.length) resolveBlockers(pos, radius, feetY, gateBoxes);
}
// Deliberately NOT part of `stage11SurfaceSegBlocked`: see rule (1) at the top.
export function stage11CityGateBlocksMovement(x, z, radius = 0) {
    for (const b of gateBoxes) {
        const qx = x - b.x, qz = z - b.z;
        if (Math.abs(qx * b.axx + qz * b.axz) <= b.hx + radius
            && Math.abs(qx * b.azx + qz * b.azz) <= b.hz + radius) return true;
    }
    return false;
}
export const stage11CityClosedGateCount = () => gateBoxes.length;

// --- robot production --------------------------------------------------------

function blockadeRobots(cp) {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 11 && bot.encounter === `${PREFIX}-${cp.index}`) n++;
    return n;
}
function producedAlive(cp) {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 11 && bot.encounter === `${PREFIX}-${cp.index}`
            && bot.blockadeBorn) n++;
    return n;
}
function productionClass(seed) {
    const mix = cfg().production.classMix;
    const c = Math.max(0, mix.C || 0), b = Math.max(0, mix.B || 0);
    const a = Math.max(0, mix.A || 0), total = c + b + a;
    if (!(total > 0)) return 'C';
    const roll = hash(seed, 7) * total;
    return roll < c ? 'C' : (roll < c + b ? 'B' : 'A');
}
function hatchPoint(m) {
    return { x: m.x + Math.sin(m.yaw) * (MACHINE_HALF + 2),
        z: m.z + Math.cos(m.yaw) * (MACHINE_HALF + 2) };
}
function birthTarget(m, slot) {
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    const lateral = BIRTH_SLOT_LATERAL[slot % BIRTH_SLOT_LATERAL.length];
    return world.projectToRoad(m.x + fx * BIRTH_REACH - fz * lateral,
        m.z + fz * BIRTH_REACH + fx * lateral, 4);
}
function spawnBlockadeRobot(cp, cls, x, z, born) {
    spawnCampaignRobot(x, z, 11, cls, true);
    const bot = robots[robots.length - 1];
    bot.encounter = `${PREFIX}-${cp.index}`;
    bot.blockadeIndex = cp.index; bot.blockadeBorn = !!born;
    spawnedTotal++;
    return bot;
}
function machineBirth(cp, m) {
    const start = hatchPoint(m), target = birthTarget(m, m.spawned);
    const cls = productionClass(cp.index * 31 + m.spawned);
    const bot = spawnBlockadeRobot(cp, cls, start.x, start.z, true);
    const base = bot.scl || 1;
    bot.state = 'idle'; bot.machineBirth = true; bot.moving = false; bot.aiming = false;
    bot.mesh.scale.set(base * 0.06, base * 0.025, base * 0.06);
    bot.mesh.rotation.y = m.yaw;
    births.push({ bot, t: 0, base, start, target });
    m.spawned++; cp.produced++; producedTotal++;
    spawnGroundPuff(start.x, start.z, PAL.tech, 9, 1.1);
    spawnBloodBurst(start.x, 9, start.z, -1, 0, 7, 0.85, 2.3, PAL.tech);
    playSFX(sfxRobotSpawn, 0.42);
}
function updateBirths(dt) {
    const sec = Math.max(0.1, cfg().production.birthSec);
    for (let i = births.length - 1; i >= 0; i--) {
        const b = births[i];
        if (robots.indexOf(b.bot) < 0 || b.bot.hp <= 0) {
            b.bot.mesh.scale.setScalar(b.base); b.bot.machineBirth = false;
            births.splice(i, 1); continue;
        }
        b.t += dt;
        const k = Math.min(1, b.t / sec), grow = Math.min(1, k / 0.62);
        const g = grow * grow * (3 - 2 * grow);
        const e = 1 - (1 - Math.min(1, Math.max(0, (k - 0.28) / 0.72))) ** 2;
        b.bot.mesh.position.x = b.start.x + (b.target.x - b.start.x) * e;
        b.bot.mesh.position.z = b.start.z + (b.target.z - b.start.z) * e;
        b.bot.mesh.position.y = Math.sin(e * Math.PI) * 5;
        b.bot.mesh.scale.set(b.base * (0.06 + g * 0.94), b.base * (0.025 + g * 0.975),
            b.base * (0.06 + g * 0.94));
        if (k < 1) continue;
        b.bot.mesh.position.set(b.target.x, 0, b.target.z);
        b.bot.mesh.scale.setScalar(b.base); b.bot.machineBirth = false;
        b.bot.state = 'chasing'; b.bot.moving = false; b.bot.aiming = false;
        spawnGroundPuff(b.target.x, b.target.z, PAL.techDim, 6, 0.7);
        births.splice(i, 1);
    }
}

// --- arming / clearing -------------------------------------------------------

const machinesDown = cp => cp.machines.every(m => !m.alive);
const vehiclesLeft = cp => cp.kind === 'vehicle'
    ? stage11WeaponVehiclesAliveAt(STAGE11_CITY_VEHICLE_GROUP, cp.index) : 0;
const vehiclesDown = cp => vehiclesLeft(cp) === 0;

function armBlockade(cp) {
    const C = cfg(), P = C.production, spec = cp.spec;
    cp.armed = true;
    for (const m of cp.machines) {
        m.alive = true; m.active = true; m.hp = spawnMachineHp();
        m.hitT = 0; m.clock = 0; m.nextBatch = Math.max(0, P.firstBatchSec);
        m.pending = 0; m.birthCooldown = 0; m.batches = 0; m.spawned = 0;
        resetSpawnMachine(m.rig, true);
    }
    const order = [];
    for (const cls of ['C', 'B', 'A'])
        for (let i = 0; i < cp.robots[cls]; i++) order.push(cls);
    for (let i = 0; i < order.length; i++) {
        // The garrison stands on the DEFENDED side only, or half of it would be
        // born behind its own barrier where it could never reach the player.
        const ahead = C.machineAheadUnits
            + ((i * 7) % 9) * 14 + hash(cp.index + i, 3) * 20;
        const lateral = clampLateral(spec.w,
            (i % 2 ? 1 : -1) * (10 + (i % 5) * 14), 6);
        const raw = { x: spec.x + spec.tx * spec.front * ahead + spec.nx * lateral,
            z: spec.z + spec.tz * spec.front * ahead + spec.nz * lateral };
        const p = world.projectToRoad(raw.x, raw.z, 4);
        spawnBlockadeRobot(cp, order[i], p.x, p.z, false);
    }
    cp.garrison = order.length;
    showStageMsg(`ROAD BLOCKADE — DESTROY `
        + `${cp.machines.length} ${cp.machines.length > 1 ? 'MACHINES' : 'MACHINE'}`
        + (cp.kind === 'vehicle' ? ' AND THE WEAPON VEHICLES' : '')
        + ' TO OPEN THE ROAD', 4200);
    addCamShake(3.2);
}

// A blockade the player has walked away from STANDS DOWN again: its garrison is
// removed and its fabricators go quiet until the player comes back. Without it
// the `maxArmed` cap is a one-way ratchet — arm two blockades on a loop, walk
// off, and no third one can ever arm again — and every garrison the player
// bypassed would trail them across the whole city.
function standDownBlockade(cp) {
    cp.armed = false; cp.garrison = 0;
    for (const m of cp.machines) {
        m.active = false; m.pending = 0; m.clock = 0; m.nextBatch = 0;
        m.birthCooldown = 0;
        if (m.alive) resetSpawnMachine(m.rig, false);
    }
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 11 || z.encounter !== `${PREFIX}-${cp.index}`) continue;
        // Standing down is not a kill: the player never fought these.
        disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
        standDowns++;
    }
    for (let i = births.length - 1; i >= 0; i--)
        if (robots.indexOf(births[i].bot) < 0) births.splice(i, 1);
}

function collapseBlockade(cp, inView) {
    if (!cfg().collapseOnClear) return 0;
    let n = 0;
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 11 || z.encounter !== `${PREFIX}-${cp.index}`) continue;
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
    explodeAt(new THREE.Vector3(m.x, MACHINE_H * 0.8, m.z), 30, 1);
    spawnGibs(m.x, MACHINE_H, m.z, 14, -1, 0, 2.5, PAL.gunmetal, 0.4, PAL.ink);
    spawnBloodDecal(m.x, m.z, 7, PAL.ink); addCamShake(8);
    const left = cp.machines.filter(x => x.alive).length;
    if (left > 0) { showStageMsg(`FABRICATOR DOWN — ${left} STILL RUNNING`, 2600); return; }
    const cars = vehiclesLeft(cp);
    if (cars > 0) showStageMsg('FABRICATORS DOWN — DESTROY '
        + `${cars} ENEMY ${cars > 1 ? 'VEHICLES' : 'VEHICLE'} TO OPEN THE ROAD`, 3800);
}

function clearBlockade(cp, inView) {
    cp.cleared = true; cp.clearT = 0; cp.gate.blocked = false;
    clearedCount++; refreshGateBoxes();
    const down = collapseBlockade(cp, inView);
    showStageMsg(down > 0
        ? `BLOCKADE CLEAR — ${down} UNITS DOWN, ROAD OPEN`
        : 'BLOCKADE CLEAR — ROAD OPEN', 4200);
    addCamShake(11);
}

// --- frame -------------------------------------------------------------------

export function stage11CityBlockadeBulletHit(b) {
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
                    b.dir?.z || 0, 3, 0.6, 1.4, PAL.amber);
            }
            m.hitT = 1;
            if (m.hp <= 0) destroyMachine(cp, m);
            return true;
        }
    }
    return false;
}

export function updateStage11CityBlockades(dt, context = {}) {
    const C = cfg(), P = C.production;
    const batchCount = Math.max(1, P.batchCount | 0);
    const batchSec = Math.max(0.1, P.batchSec);
    const birthGap = Math.max(0.01, P.birthGapSec);
    const maxAlive = Math.max(1, P.maxAlive | 0);
    viewTest = context.inView || null;

    // Proximity arming, closest first, capped. A network has no "next"
    // blockade, so the cap is what bounds the live population where several
    // blockades sit within sight of one junction.
    if (context.live !== false) {
        const range = C.armRangeUnits;
        // The release ring is derived from the arm range so the two can never be
        // configured into a band that arms and stands down on alternate frames.
        const release = range * Math.max(1.2, C.releaseRangeFactor || 1.2);
        for (const cp of points) {
            if (!cp.armed || cp.cleared) continue;
            if (Math.hypot(camera.position.x - cp.x, camera.position.z - cp.z)
                > release) standDownBlockade(cp);
        }
        let armed = points.filter(c => c.armed && !c.cleared).length;
        const near = points
            .filter(c => !c.armed && !c.cleared)
            .map(c => ({ c, d: Math.hypot(camera.position.x - c.x,
                camera.position.z - c.z) }))
            .filter(e => e.d <= range)
            .sort((a, b) => a.d - b.d);
        for (const e of near) {
            if (armed >= Math.max(1, C.maxArmed | 0)) break;
            armBlockade(e.c); armed++;
        }
    }

    for (const cp of points) {
        for (const m of cp.machines) {
            if (m.hitT > 0) m.hitT = Math.max(0, m.hitT - dt * 4.5);
            if (cp.armed && !cp.cleared && m.alive && m.active) {
                m.clock += dt; m.birthCooldown -= dt;
                while (m.clock >= m.nextBatch) {
                    m.pending += batchCount; m.batches++; m.nextBatch += batchSec;
                }
                while (m.pending > 0 && m.birthCooldown <= 0) {
                    if (producedAlive(cp) >= maxAlive) { m.pending = 0; break; }
                    machineBirth(cp, m);
                    m.pending--; m.birthCooldown += birthGap;
                }
            }
            updateSpawnMachine(m.rig, dt, m.active && m.alive, m.hitT);
        }
        if (cp.armed && !cp.cleared && machinesDown(cp) && vehiclesDown(cp))
            clearBlockade(cp, viewTest);
        if (!cp.cleared) continue;
        // The rail retracts under the opaque asphalt instead of being hidden, so
        // its materials stay drawn and opening a road cannot cause a recompile.
        cp.clearT = Math.min(C.gate.openSec, cp.clearT + dt);
        const k = smooth(cp.clearT / Math.max(0.05, C.gate.openSec));
        cp.gate.rail.position.y = -C.gate.sinkUnits * k;
        cp.gate.lampMat.color.setHex(GATE_LAMP_OPEN);
    }
    updateBirths(dt);
}

export function resetStage11CityBlockades() {
    births.length = 0; clearedCount = 0; spawnedTotal = 0; producedTotal = 0;
    standDowns = 0;
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
export function cleanupStage11CityBlockades() { births.length = 0; viewTest = null; }

export const stage11CityBlockadesAllCleared = () =>
    points.length > 0 && points.every(c => c.cleared);
export function stage11CityActiveBlockade() {
    let best = null, d2 = Infinity;
    for (const cp of points) {
        if (!cp.armed || cp.cleared) continue;
        const q = (cp.x - camera.position.x) ** 2 + (cp.z - camera.position.z) ** 2;
        if (q < d2) { d2 = q; best = cp; }
    }
    return best;
}
// Radar target: the live fabricator of the nearest armed blockade, then its
// surviving weapon vehicles once the machines are down.
export function stage11CityBlockadeTarget() {
    const cp = stage11CityActiveBlockade();
    if (!cp) return null;
    let best = null, d2 = Infinity;
    for (const m of cp.machines) if (m.alive) {
        const q = (m.x - camera.position.x) ** 2 + (m.z - camera.position.z) ** 2;
        if (q < d2) { d2 = q; best = m; }
    }
    return best ? { x: best.x, z: best.z, blockade: cp.index }
        : { x: cp.x, z: cp.z, blockade: cp.index };
}
export function stage11CityBlockadeStatus() {
    const cp = stage11CityActiveBlockade();
    if (!cp) return null;
    return { index: cp.index, alive: cp.machines.filter(m => m.alive).length,
        total: cp.machines.length, vehicles: vehiclesLeft(cp) };
}
export const stage11CityBlockadesClearedCount = () => clearedCount;

export const stage11CityBlockadesDebug = () => {
    const C = cfg();
    return {
        built, count: points.length, cleared: clearedCount,
        configOwned: true, prebuilt: true,
        armRangeUnits: C.armRangeUnits, maxArmed: C.maxArmed,
        collapseOnClear: !!C.collapseOnClear,
        machineHp: spawnMachineHp(),
        machineTotal: points.reduce((n, c) => n + c.machines.length, 0),
        robotTotal: points.reduce((n, c) =>
            n + c.robots.C + c.robots.B + c.robots.A, 0),
        vehicleBlockades: [...stage11CityVehicleBlockades()],
        spawnedTotal, producedTotal, standDowns, activeBirths: births.length,
        releaseRangeUnits: C.armRangeUnits * Math.max(1.2, C.releaseRangeFactor || 1.2),
        closedGates: gateBoxes.length,
        armed: points.filter(c => c.armed && !c.cleared).length,
        active: stage11CityActiveBlockade()?.index ?? null,
        production: { ...C.production, classMix: { ...C.production.classMix } },
        // Bullets and line of sight deliberately pass a rail barricade; only
        // movement is stopped. See rule (1).
        barrierBlocksBullets: false,
        points: points.map(c => ({
            index: c.index, kind: c.kind, road: c.road, x: c.x, z: c.z, w: c.w,
            front: c.spec.front, machines: c.machines.length,
            robots: { ...c.robots }, armed: c.armed, cleared: c.cleared,
            garrison: c.garrison, produced: c.produced, alive: blockadeRobots(c),
            machinesDown: machinesDown(c), vehiclesLeft: vehiclesLeft(c),
            needsVehicles: c.kind === 'vehicle',
            gateBlocked: c.gate.blocked, gateHalfWidth: c.gate.half,
            gateRailY: c.gate.rail.position.y, gateLamps: c.gate.lamps.length,
            gateLampHex: c.gate.lampMat.color.getHex(),
            gateAxis: { axx: c.gate.tx, axz: c.gate.tz,
                azx: -c.gate.tz, azz: c.gate.tx },
            rigs: c.machines.map(m => ({
                id: m.id, x: m.x, z: m.z, yaw: m.yaw, lateral: m.lateral,
                hp: m.hp, alive: m.alive, active: m.active, spawned: m.spawned,
                ...spawnMachineDebug(m.rig),
            })),
        })),
    };
};

export const STAGE11_BLOCKADE_PREFIX = PREFIX;
