// NUSANTARA WARDEN — independent Stage 12 root guardian.
// It is not a normal robot and never enters `robots`. All combat tuning comes
// from CFG.campaign.bosses.warden at call time. Rig, targets, projectiles,
// warnings and wreck are one persistent preallocated object graph.

import { CFG } from '../core/config.js';
import { scene, camera, addCamShake } from '../core/renderer.js';
import { bullets, player, stats } from '../core/state.js';
import { queueBoom } from './robots.js';
import { explodeAt, spawnGroundPuff } from './effects.js';
import { spawnGibs } from './gore.js';
import { segPointDist2, clamp } from '../utils/math.js';
import { PAL, EMISSIVE_MAX } from '../world/palette.js';
import { mergeObjectInPlace } from '../utils/meshBatch.js';

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();
const VISUAL = Object.freeze({ revealSec: 1.45, armSec: .85, targetRadius: 11 });

function C() { return CFG.campaign.bosses.warden; }
function mesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0,
    cast = true, receive = true) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz); m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m); return m;
}
function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
function turn(current, target, speed, dt) {
    return current + clamp(wrap(target - current), -speed * dt, speed * dt);
}

function materials() {
    return {
        armor: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        armorDark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        plate: new THREE.MeshLambertMaterial({ color: 0x555c62 }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        joint: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        core: new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard,
            emissiveIntensity: EMISSIVE_MAX * .7 }),
        capacitor: new THREE.MeshLambertMaterial({ color: PAL.amberDim, emissive: PAL.amberDim,
            emissiveIntensity: EMISSIVE_MAX * .54 }),
        coupling: new THREE.MeshLambertMaterial({ color: PAL.techDim, emissive: PAL.techDim,
            emissiveIntensity: EMISSIVE_MAX * .62 }),
        shield: new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
            opacity: .26, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
        warning: new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
            opacity: .35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
        warningPale: new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true,
            opacity: .65, depthWrite: false, toneMapped: false }),
        projectile: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    };
}

function buildLeg(parent, index, M) {
    const a = index * Math.PI * 2 / 6;
    const hip = new THREE.Group(); hip.position.set(Math.cos(a) * 18, 7, Math.sin(a) * 18);
    hip.rotation.y = -a; parent.add(hip);
    mesh(hip, new THREE.SphereGeometry(5.2, 9, 7), M.joint, 0, 0, 0);
    const upper = new THREE.Group(); upper.rotation.z = -.34; hip.add(upper);
    mesh(upper, new THREE.BoxGeometry(28, 7, 9), M.armor, 14, -1, 0);
    mesh(upper, new THREE.BoxGeometry(18, 2, 10), M.plate, 11, 3.6, 0, 0, 0, -.08);
    for (let k = 0; k < 3; k++)
        mesh(upper, new THREE.BoxGeometry(2, 8, 10), M.steel, 7 + k * 7, -1, 0,
            0, 0, 0, false, false);
    const knee = new THREE.Group(); knee.position.set(28, -3, 0); upper.add(knee);
    mesh(knee, new THREE.CylinderGeometry(5, 5, 11, 10), M.joint, 0, 0, 0,
        Math.PI / 2);
    const lower = new THREE.Group(); lower.rotation.z = .68; knee.add(lower);
    mesh(lower, new THREE.BoxGeometry(24, 6, 8), M.armorDark, 12, -1, 0);
    mesh(lower, new THREE.BoxGeometry(16, 2, 9), M.steel, 10, 2.7, 0,
        0, 0, -.05, false, false);
    const foot = new THREE.Group(); foot.position.set(24, -2, 0); lower.add(foot);
    mesh(foot, new THREE.BoxGeometry(17, 5, 13), M.armor, 4, -2, 0);
    for (const z of [-4, 0, 4])
        mesh(foot, new THREE.BoxGeometry(11, 2, 2.4), M.steel, 10, -4.2, z,
            0, 0, 0, false, false);
    return { index, a, hip, upper, knee, lower, foot, baseUpper: -.34, baseLower: .68 };
}

export function buildNusantaraWardenMesh() {
    const M = materials();
    const group = new THREE.Group(); group.name = 'Nusantara-Warden';
    const hull = new THREE.Group();
    // Broad low body: stacked hexagonal armor, radial shoulder plates, visible
    // front prow and rear machinery make facing readable from the game camera.
    mesh(hull, new THREE.CylinderGeometry(25, 31, 12, 12), M.armorDark, 0, 10, 0);
    mesh(hull, new THREE.CylinderGeometry(31, 26, 9, 12), M.armor, 0, 19, 0);
    mesh(hull, new THREE.CylinderGeometry(22, 27, 7, 12), M.plate, 0, 26, 0);
    mesh(hull, new THREE.BoxGeometry(25, 9, 20), M.armor, -29, 17, 0,
        0, 0, -.18);
    mesh(hull, new THREE.ConeGeometry(11, 18, 6), M.plate, -46, 17, 0,
        0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI * 2 / 6;
        mesh(hull, new THREE.BoxGeometry(24, 5, 15), M.armor,
            Math.cos(a) * 27, 15, Math.sin(a) * 27, 0, -a, 0);
        mesh(hull, new THREE.BoxGeometry(13, 2.5, 16), i === 3 ? M.plate : M.armorDark,
            Math.cos(a) * 30, 20, Math.sin(a) * 30, 0, -a, 0, false, false);
    }
    group.add(mergeObjectInPlace(hull));

    const legs = [];
    for (let i = 0; i < 6; i++) legs.push(buildLeg(group, i, M));

    const coreRig = new THREE.Group(); coreRig.position.y = 29; group.add(coreRig);
    mesh(coreRig, new THREE.CylinderGeometry(13, 16, 12, 12), M.armorDark, 0, 0, 0);
    const core = mesh(coreRig, new THREE.IcosahedronGeometry(9, 1), M.core, 0, 4, 0,
        0, 0, 0, false, false);
    const shutters = [];
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const q = mesh(coreRig, new THREE.BoxGeometry(9, 13, 3), M.armor,
            Math.cos(a) * 13, 4, Math.sin(a) * 13, 0, -a, 0);
        shutters.push(q);
    }
    const shield = new THREE.Group(); shield.position.y = 22; group.add(shield);
    const shieldArc = mesh(shield, new THREE.RingGeometry(34, 43, 28, 1,
        -C().shield.arcDeg * Math.PI / 360, C().shield.arcDeg * Math.PI / 180),
    M.shield, 0, 0, 0, -Math.PI / 2, 0, Math.PI / 2, false, false);

    const capacitors = [];
    for (let i = 0; i < C().capacitors.count; i++) {
        const a = Math.PI + (i - (C().capacitors.count - 1) / 2) * .62;
        const rig = new THREE.Group(); rig.position.set(Math.cos(a) * 29, 30, Math.sin(a) * 29);
        group.add(rig);
        mesh(rig, new THREE.CylinderGeometry(5.8, 6.8, 17, 10), M.capacitor, 0, 0, 0);
        for (let k = -1; k <= 1; k++)
            mesh(rig, new THREE.TorusGeometry(6.5, .7, 6, 12), M.steel, 0, k * 5.5, 0,
                Math.PI / 2, 0, 0, false, false);
        mesh(rig, new THREE.BoxGeometry(4, 13, 4), M.armorDark, -6, 0, 0);
        capacitors.push({ index: i, rig, hp: 0, maxHp: 0, alive: true, exposed: false });
    }
    const couplings = [];
    for (let i = 0; i < C().couplings.count; i++) {
        const a = i ? Math.PI / 2 : -Math.PI / 2;
        const rig = new THREE.Group(); rig.position.set(Math.cos(a) * 34, 16, Math.sin(a) * 34);
        group.add(rig);
        mesh(rig, new THREE.BoxGeometry(18, 11, 13), M.armorDark, 0, 0, 0);
        mesh(rig, new THREE.CylinderGeometry(5, 5, 20, 10), M.coupling, 8, 0, 0,
            0, 0, Math.PI / 2, false, false);
        for (let k = 0; k < 3; k++)
            mesh(rig, new THREE.TorusGeometry(5.6, .7, 6, 12), M.steel,
                1 + k * 7, 0, 0, 0, Math.PI / 2, 0, false, false);
        couplings.push({ index: i, rig, hp: 0, maxHp: 0, alive: true, exposed: false });
    }
    return { group, legs, coreRig, core, shutters, shield, shieldArc,
        capacitors, couplings, materials: M };
}

function makeRailPool(parent) {
    const out = [];
    for (let i = 0; i < C().rail.poolSize; i++) {
        const warning = new THREE.Mesh(new THREE.BoxGeometry(520, .18, C().rail.width),
            new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
                opacity: .28, depthWrite: false, toneMapped: false }));
        warning.visible = false; parent.add(warning);
        const shot = new THREE.Mesh(new THREE.BoxGeometry(24, 4, C().rail.width * .55),
            new THREE.MeshBasicMaterial({ color: PAL.white, toneMapped: false }));
        shot.visible = false; parent.add(shot);
        out.push({ warning, shot, active: false, warned: false, t: 0,
            sx: 0, sz: 0, dx: 1, dz: 0, traveled: 0, hit: false });
    }
    return out;
}
function makeBurstPool(parent) {
    const out = [];
    for (let i = 0; i < C().burst.poolSize; i++) {
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0),
            new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }));
        mesh.visible = false; parent.add(mesh);
        out.push({ mesh, active: false, dx: 0, dz: 0, life: 0, px: 0, pz: 0 });
    }
    return out;
}
function makeSectorPool(parent) {
    const out = [];
    const angle = (Math.PI * 2 - C().sector.gapDeg * Math.PI / 180) / 3;
    for (let i = 0; i < C().sector.poolSize; i++) {
        const mesh = new THREE.Mesh(new THREE.RingGeometry(12, C().sector.radius, 28, 1,
            -angle / 2, angle), new THREE.MeshBasicMaterial({ color: PAL.hazard,
            transparent: true, opacity: .22, depthWrite: false, toneMapped: false,
            side: THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI / 2; mesh.visible = false; parent.add(mesh);
        out.push({ mesh, active: false, angle: 0 });
    }
    return out;
}
function makeStompWarnings(parent) {
    const out = [];
    for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(new THREE.RingGeometry(C().stomp.radius * .72,
            C().stomp.radius, 26), new THREE.MeshBasicMaterial({ color: PAL.hazard,
            transparent: true, opacity: .35, depthWrite: false, toneMapped: false }));
        mesh.rotation.x = -Math.PI / 2; mesh.visible = false; parent.add(mesh);
        out.push({ mesh, active: false });
    }
    return out;
}

export function createNusantaraWarden(parent = scene) {
    const parts = buildNusantaraWardenMesh(); parent.add(parts.group);
    const fxRoot = new THREE.Group(); fxRoot.name = 'Nusantara-Warden-Fixed-Hazard-Pool';
    parent.add(fxRoot);
    const w = {
        parts, fxRoot, rails: makeRailPool(fxRoot), bursts: makeBurstPool(fxRoot),
        sectors: makeSectorPool(fxRoot), stomps: makeStompWarnings(fxRoot),
        active: false, phase: 'dormant', hp: 0, maxHp: 0, score: 0,
        phaseT: 0, attackState: 'cooldown', attackT: 0, attackIndex: 0,
        burstLeft: 0, burstT: 0, hitT: 0, animT: 0, sectorBase: 0, dead: false,
        deathDone: false, callbacks: {}, arena: null, home: null,
        awarded: false, jamSerial: 0,
    };
    resetNusantaraWarden(w);
    return w;
}

function clearHazards(w) {
    for (const r of w.rails) {
        r.active = r.warned = false; r.warning.visible = r.shot.visible = false;
    }
    for (const b of w.bursts) { b.active = false; b.mesh.visible = false; }
    for (const s of w.sectors) { s.active = false; s.mesh.visible = false; }
    for (const s of w.stomps) { s.active = false; s.mesh.visible = false; }
    w.burstLeft = 0; w.burstT = 0;
}

export function resetNusantaraWarden(w, opts = {}) {
    if (!w) return;
    const cfg = C();
    w.hp = cfg.hp; w.maxHp = cfg.hp; w.score = cfg.score;
    w.active = !!opts.active; w.phase = opts.phase || 'dormant'; w.phaseT = 0;
    w.attackState = 'cooldown'; w.attackT = cfg.attackGapSec; w.attackIndex = 0;
    w.hitT = 0; w.animT = 0; w.sectorBase = 0; w.dead = false; w.deathDone = false;
    w.awarded = false; w.jamSerial = 0; w.callbacks = opts.callbacks || {};
    w.arena = opts.arena || w.arena || { x: opts.x || 0, z: opts.z || 0, radius: 280 };
    w.home = opts.home || w.home || { x: opts.x || 0, z: opts.z || 0 };
    const p = w.parts;
    p.group.visible = w.active;
    p.group.position.set(opts.x ?? w.home.x, opts.y || 0, opts.z ?? w.home.z);
    p.group.rotation.set(0, opts.yaw || 0, 0); p.group.scale.setScalar(1);
    p.coreRig.rotation.set(0, 0, 0); p.core.scale.setScalar(1);
    p.core.material.emissiveIntensity = EMISSIVE_MAX * .7;
    p.shield.visible = false; p.shield.rotation.set(0, 0, 0);
    p.shieldArc.material.opacity = .26;
    for (const q of p.shutters) { q.rotation.set(0, 0, 0); q.position.y = 4; }
    for (const leg of p.legs) {
        leg.hip.rotation.x = leg.hip.rotation.z = 0;
        leg.upper.rotation.z = leg.baseUpper; leg.lower.rotation.z = leg.baseLower;
        leg.foot.rotation.set(0, 0, 0);
    }
    for (const cap of p.capacitors) {
        cap.hp = cap.maxHp = cfg.capacitors.hp; cap.alive = true; cap.exposed = false;
        cap.rig.visible = true; cap.rig.rotation.set(0, 0, 0); cap.rig.scale.setScalar(1);
    }
    for (const coupling of p.couplings) {
        coupling.hp = coupling.maxHp = cfg.couplings.hp;
        coupling.alive = true; coupling.exposed = false; coupling.rig.visible = true;
        coupling.rig.rotation.set(0, 0, 0); coupling.rig.scale.setScalar(1);
    }
    clearHazards(w);
}

export function activateNusantaraWarden(w, callbacks = null) {
    if (!w || w.dead) return false;
    if (callbacks) w.callbacks = callbacks;
    w.active = true; w.parts.group.visible = true; w.phase = 'reveal'; w.phaseT = 0;
    w.attackState = 'cooldown'; clearHazards(w);
    w.callbacks.onPhase?.('reveal', w); return true;
}

function setPhase(w, phase) {
    w.phase = phase; w.phaseT = 0; clearHazards(w);
    w.attackState = 'cooldown'; w.attackT = C().attackGapSec;
    w.callbacks.onPhase?.(phase, w);
}
function startJam(w, phase) {
    setPhase(w, phase); w.jamSerial++;
    w.parts.shield.visible = true;
    if (phase === 'jam1') for (const q of w.parts.capacitors) q.exposed = q.alive;
    else for (const q of w.parts.couplings) q.exposed = q.alive;
    w.callbacks.onJamStart?.(phase, w);
}
function endJam(w, next) {
    const prior = w.phase;
    if (prior === 'jam1') for (const q of w.parts.capacitors) q.exposed = false;
    else for (const q of w.parts.couplings) q.exposed = false;
    setPhase(w, next); w.callbacks.onJamEnd?.(prior, w);
}

function targetWorld(w, target, out = TMP) {
    out.copy(target.rig.position); return w.parts.group.localToWorld(out);
}
function removeBullet(index, b) {
    if (b.explosive) explodeAt(new THREE.Vector3(b.mesh.position.x,
        b.mesh.position.y, b.mesh.position.z), b.explodeR, 0, b.boomSfx);
    scene.remove(b.mesh); bullets.splice(index, 1);
}
function targetHit(w, b, target) {
    const p = targetWorld(w, target);
    return segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0, b.mesh.position.z,
        p.x, 0, p.z) <= VISUAL.targetRadius ** 2;
}
function frontShielded(w, impactX, impactZ) {
    const cfg = C();
    if (w.phase === 'phase3' || w.phase === 'death' || w.phase === 'wreck') return false;
    const p = w.parts.group.position;
    const hitAngle = Math.atan2(impactZ - p.z, impactX - p.x);
    const front = w.parts.group.rotation.y + Math.PI;
    return Math.abs(wrap(hitAngle - front)) <= cfg.shield.arcDeg * Math.PI / 360;
}

export function damageNusantaraWarden(w, damage, impact = {}) {
    if (!w?.active || w.dead || w.phase === 'dormant' || w.phase === 'reveal') return false;
    let d = Math.max(0, damage || 0);
    if (w.phase === 'jam1' || w.phase === 'jam2') d *= C().shield.damageMul;
    else if (frontShielded(w, impact.x ?? w.parts.group.position.x - 1,
        impact.z ?? w.parts.group.position.z)) d *= C().shield.damageMul;
    w.hp = Math.max(0, w.hp - Math.max(1, d)); w.hitT = 1;
    if (w.hp <= 0) killNusantaraWarden(w);
    else if (w.phase === 'phase1' && w.hp <= w.maxHp * C().phase2HpFrac) startJam(w, 'jam1');
    else if (w.phase === 'phase2' && w.hp <= w.maxHp * C().phase3HpFrac) startJam(w, 'jam2');
    return true;
}

function damageTarget(w, target, damage, kind) {
    if (!target.alive || !target.exposed) return false;
    target.hp -= Math.max(1, damage); w.hitT = 1;
    if (target.hp > 0) return true;
    target.hp = 0; target.alive = false; target.exposed = false;
    target.rig.rotation.z = kind === 'capacitor' ? .82 : -.72;
    target.rig.position.y -= 5; target.rig.scale.y = .72;
    const p = targetWorld(w, target);
    explodeAt(new THREE.Vector3(p.x, Math.max(4, p.y), p.z), 13, 0);
    spawnGibs(p.x, p.y, p.z, 6, 1, 0, 1.2, PAL.gunmetal, .4, PAL.ink);
    addCamShake(3.5);
    if (kind === 'capacitor' && w.parts.capacitors.every(q => !q.alive)) endJam(w, 'phase2');
    if (kind === 'coupling' && w.parts.couplings.every(q => !q.alive)) endJam(w, 'phase3');
    return true;
}

function projectileHits(w) {
    if (!w.active || w.dead) return;
    const p = w.parts.group.position;
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i]; let hit = false;
        const damage = b.damage != null ? b.damage : CFG.weapons.bulletDamage;
        if (w.phase === 'jam1') {
            for (const q of w.parts.capacitors) if (targetHit(w, b, q)) {
                hit = damageTarget(w, q, damage, 'capacitor'); break;
            }
        } else if (w.phase === 'jam2') {
            const first = w.parts.couplings.find(q => q.alive);
            if (first && targetHit(w, b, first)) hit = damageTarget(w, first, damage, 'coupling');
        }
        if (!hit && segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0,
            b.mesh.position.z, p.x, 0, p.z) <= C().hitRadius ** 2)
            hit = damageNusantaraWarden(w, damage,
                { x: b.mesh.position.x, z: b.mesh.position.z });
        if (!hit) continue;
        stats.hits++; removeBullet(i, b);
    }
}

function freeRail(w) { return w.rails.find(r => !r.active) || null; }
function beginRail(w) {
    const r = freeRail(w); if (!r) return false;
    const p = w.parts.group.position;
    const a = Math.atan2(camera.position.z - p.z, camera.position.x - p.x);
    r.active = true; r.warned = true; r.t = C().rail.telegraphSec;
    r.sx = p.x; r.sz = p.z; r.dx = Math.cos(a); r.dz = Math.sin(a);
    r.traveled = 0; r.hit = false; r.warning.visible = true; r.shot.visible = false;
    r.warning.position.set(p.x + r.dx * 250, .65, p.z + r.dz * 250);
    r.warning.rotation.y = -a; return true;
}
function fireRail(r) {
    r.warned = false; r.warning.visible = false; r.shot.visible = true;
    r.shot.position.set(r.sx, 12, r.sz); r.shot.rotation.y = -Math.atan2(r.dz, r.dx);
}
function updateRails(w, dt) {
    for (const r of w.rails) if (r.active) {
        if (r.warned) {
            r.t -= dt; r.warning.material.opacity = .18 + .16 * (1 + Math.sin(w.animT * 17)) / 2;
            if (r.t <= 0) fireRail(r);
            continue;
        }
        const oldX = r.shot.position.x, oldZ = r.shot.position.z;
        const step = C().rail.speed * dt; r.traveled += step;
        r.shot.position.x += r.dx * step; r.shot.position.z += r.dz * step;
        if (!r.hit && segPointDist2(oldX, 0, oldZ, r.shot.position.x, 0,
            r.shot.position.z, camera.position.x, 0, camera.position.z)
            <= (C().rail.width * .55 + player.radius) ** 2) {
            r.hit = true; queueBoom(camera.position.x, 5, camera.position.z,
                player.radius + 2, true, C().rail.damage, 0);
        }
        if (r.traveled >= 620) { r.active = false; r.shot.visible = false; }
    }
}

function beginStomp(w) {
    w.attackT = C().stomp.telegraphSec;
    for (let i = 0; i < w.stomps.length; i++) {
        const s = w.stomps[i], leg = w.parts.legs[i];
        const a = w.parts.group.rotation.y + leg.a;
        s.active = i % 2 === w.attackIndex % 2; s.mesh.visible = s.active;
        s.mesh.position.set(w.parts.group.position.x + Math.cos(a) * 52, .65,
            w.parts.group.position.z + Math.sin(a) * 52);
    }
}
function resolveStomp(w) {
    for (const s of w.stomps) if (s.active) {
        queueBoom(s.mesh.position.x, 4, s.mesh.position.z, C().stomp.radius,
            true, C().stomp.damage, 0);
        s.active = false; s.mesh.visible = false;
    }
    addCamShake(4);
}

function beginBurst(w) { w.attackT = C().burst.telegraphSec; w.burstLeft = C().burst.count; w.burstT = 0; }
function emitBurst(w) {
    const free = w.bursts.find(b => !b.active); if (!free) return;
    const shot = C().burst.count - w.burstLeft;
    const a = shot * Math.PI * 2 / Math.max(1, C().burst.count) + w.animT * .2;
    free.active = true; free.dx = Math.cos(a); free.dz = Math.sin(a); free.life = 5;
    free.mesh.position.set(w.parts.group.position.x, 18, w.parts.group.position.z);
    free.px = free.mesh.position.x; free.pz = free.mesh.position.z; free.mesh.visible = true;
}
function updateBursts(w, dt) {
    if (w.attackState === 'burstFire') {
        w.burstT -= dt;
        while (w.burstLeft > 0 && w.burstT <= 0) {
            emitBurst(w); w.burstLeft--; w.burstT += C().burst.gapSec;
        }
        if (w.burstLeft <= 0) endAttack(w);
    }
    for (const b of w.bursts) if (b.active) {
        b.px = b.mesh.position.x; b.pz = b.mesh.position.z;
        b.mesh.position.x += b.dx * C().burst.speed * dt;
        b.mesh.position.z += b.dz * C().burst.speed * dt;
        b.mesh.rotation.x += dt * 8; b.mesh.rotation.y += dt * 11; b.life -= dt;
        if (segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0, b.mesh.position.z,
            camera.position.x, 0, camera.position.z) <= (player.radius + 3) ** 2) {
            queueBoom(camera.position.x, 5, camera.position.z, player.radius + 2,
                true, C().burst.damage, 0); b.life = 0;
        }
        if (b.life <= 0) { b.active = false; b.mesh.visible = false; }
    }
}

function beginSector(w) {
    w.attackT = C().sector.telegraphSec;
    const activeCount = Math.min(3, w.sectors.length);
    // Pola DIBEKUKAN saat telegraf: kalau sudutnya ikut animT, baji yang
    // TERLIHAT dan lorong aman yang DIUJI meleset ~20 derajat saat ledakan.
    w.sectorBase = w.animT * .3;
    for (let i = 0; i < w.sectors.length; i++) {
        const s = w.sectors[i]; s.active = i < activeCount; s.mesh.visible = s.active;
        s.angle = w.sectorBase + i * Math.PI * 2 / activeCount;
        s.mesh.position.set(w.parts.group.position.x, .7, w.parts.group.position.z);
        s.mesh.rotation.z = s.angle;
    }
}
function resolveSector(w) {
    const p = w.parts.group.position;
    const dx = camera.position.x - p.x, dz = camera.position.z - p.z;
    const d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    const gap = C().sector.gapDeg * Math.PI / 180;
    // Three gaps are centered between the three warning wedges. At least one
    // full traversal lane remains safe for the whole telegraph — sudutnya dibaca
    // dari pola yang DIBEKUKAN di beginSector, bukan dari animT saat ini.
    let safe = false;
    const base = w.sectorBase || 0;
    for (let i = 0; i < 3; i++) {
        const center = base + i * Math.PI * 2 / 3 + Math.PI / 3;
        if (Math.abs(wrap(a - center)) <= gap / 2) safe = true;
    }
    if (!safe && d <= C().sector.radius) queueBoom(camera.position.x, 5,
        camera.position.z, player.radius + 2, true, C().sector.damage, 0);
    for (const s of w.sectors) { s.active = false; s.mesh.visible = false; }
}

function attacksBusy(w) {
    return w.rails.some(r => r.active) || w.bursts.some(b => b.active)
        || w.stomps.some(s => s.active) || w.sectors.some(s => s.active);
}
function beginAttack(w) {
    const choices = w.phase === 'phase1' ? ['rail', 'stomp', 'burst']
        : w.phase === 'phase2' ? ['sector', 'rail', 'stomp', 'burst']
            : ['rail', 'sector', 'burst'];
    const kind = choices[w.attackIndex % choices.length];
    w.attackIndex++; w.attackState = `${kind}Telegraph`;
    if (kind === 'rail') { if (!beginRail(w)) endAttack(w); else w.attackT = C().rail.telegraphSec; }
    else if (kind === 'stomp') beginStomp(w);
    else if (kind === 'burst') beginBurst(w);
    else beginSector(w);
}
function endAttack(w) {
    w.attackState = 'cooldown';
    const enrage = w.phase === 'phase3';
    w.attackT = C().attackGapSec * (enrage ? C().enrageGapMul : 1);
}
function updateAttackState(w, dt, allow) {
    updateRails(w, dt); updateBursts(w, dt);
    if (!allow || !['phase1', 'phase2', 'phase3'].includes(w.phase)) return;
    if (w.attackState === 'cooldown') {
        w.attackT -= dt;
        if (w.attackT <= 0 && !attacksBusy(w)) beginAttack(w);
        return;
    }
    if (w.attackState === 'burstFire') return;
    w.attackT -= dt;
    if (w.attackState.endsWith('Telegraph') && w.attackT <= 0) {
        if (w.attackState === 'railTelegraph') endAttack(w); // rail pool continues independently
        else if (w.attackState === 'stompTelegraph') { resolveStomp(w); endAttack(w); }
        else if (w.attackState === 'burstTelegraph') w.attackState = 'burstFire';
        else { resolveSector(w); endAttack(w); }
    }
}

function updateMovement(w, dt, ctx) {
    // `g` = group (rotasi), `p` = posisinya. Keduanya HARUS dipisah: rotasi
    // hidup di group, bukan di Vector3 posisi.
    const g = w.parts.group, p = g.position, arena = ctx.arena || w.arena;
    const active = ['phase1', 'phase2', 'phase3'].includes(w.phase);
    if (!active || !arena) return;
    const dx = p.x - arena.x, dz = p.z - arena.z;
    const angle = Math.atan2(dz, dx);
    const targetR = w.phase === 'phase1' ? arena.radius * .56
        : w.phase === 'phase2' ? arena.radius * .46 : arena.radius * .31;
    const orbitDir = w.attackIndex % 2 ? 1 : -1;
    const tx = arena.x + Math.cos(angle + orbitDir * .42) * targetR;
    const tz = arena.z + Math.sin(angle + orbitDir * .42) * targetR;
    // Rig prow/front is local -X.
    const want = Math.atan2(tz - p.z, tx - p.x) + Math.PI;
    g.rotation.y = turn(g.rotation.y, want, C().turnRadPerSec, dt);
    const dist = Math.hypot(tx - p.x, tz - p.z);
    if (dist > 4 && w.attackState === 'cooldown') {
        p.x -= Math.cos(g.rotation.y) * C().moveSpeed * dt;
        p.z -= Math.sin(g.rotation.y) * C().moveSpeed * dt;
    }
    const dArena = Math.hypot(p.x - arena.x, p.z - arena.z);
    if (dArena > arena.radius - C().bodyRadius) {
        const k = (arena.radius - C().bodyRadius) / dArena;
        p.x = arena.x + (p.x - arena.x) * k; p.z = arena.z + (p.z - arena.z) * k;
    }
}

function animateRig(w, dt) {
    const p = w.parts; w.animT += dt;
    const moving = ['phase1', 'phase2', 'phase3'].includes(w.phase)
        && w.attackState === 'cooldown';
    for (const leg of p.legs) {
        const step = moving ? Math.sin(w.animT * 4.2 + leg.index * Math.PI / 3) : 0;
        const jamAnchor = w.phase === 'jam1' && leg.index % 2 === 0
            || w.phase === 'jam2' && leg.index % 2 === 1;
        leg.upper.rotation.z += ((jamAnchor ? -.62 : leg.baseUpper + step * .16)
            - leg.upper.rotation.z) * Math.min(1, dt * 7);
        leg.lower.rotation.z += ((jamAnchor ? .98 : leg.baseLower - step * .22)
            - leg.lower.rotation.z) * Math.min(1, dt * 7);
        leg.foot.rotation.z = jamAnchor ? -.2 : step * .08;
    }
    p.coreRig.rotation.y += dt * (w.phase === 'phase3' ? 2.2 : .75);
    p.shield.rotation.y += dt * (w.phase === 'phase2' ? .48 : .92);
    const open = w.phase === 'phase3' ? 1 : w.phase === 'phase2' ? .45 : 0;
    for (let i = 0; i < p.shutters.length; i++) {
        const q = p.shutters[i], a = i * Math.PI / 4;
        q.position.x = Math.cos(a) * (13 + open * 8);
        q.position.z = Math.sin(a) * (13 + open * 8);
    }
    p.core.material.emissiveIntensity = Math.min(EMISSIVE_MAX,
        .45 + (w.phase === 'phase3' ? .35 : .16) + Math.sin(w.animT * 6) * .08);
    if (w.hitT > 0) {
        w.hitT = Math.max(0, w.hitT - dt * 5);
        p.core.scale.setScalar(1 + w.hitT * .18);
    } else p.core.scale.setScalar(1);
}

function killNusantaraWarden(w) {
    if (w.dead) return;
    w.hp = 0; w.dead = true; w.phase = 'death'; w.phaseT = 0;
    w.attackState = 'dead'; clearHazards(w); stats.kills++; addCamShake(8);
    explodeAt(new THREE.Vector3(w.parts.group.position.x, 22,
        w.parts.group.position.z), 26, 0);
    w.callbacks.onDeath?.(w);
}
function updateDeath(w, dt) {
    w.phaseT += dt; const k = Math.min(1, w.phaseT / Math.max(.1, C().deathSec));
    const p = w.parts;
    p.group.rotation.z = -.48 * k; p.group.position.y = -3.5 * k;
    p.coreRig.rotation.y += dt * (2.5 * (1 - k));
    p.core.material.emissiveIntensity = EMISSIVE_MAX * .7 * (1 - k);
    p.shield.visible = false;
    for (let i = 0; i < p.legs.length; i++) {
        const leg = p.legs[i];
        leg.hip.rotation.z += (((i % 2 ? 1 : -1) * (.25 + i * .035) * k)
            - leg.hip.rotation.z) * Math.min(1, dt * 4);
        leg.lower.rotation.z += (.95 + (i % 2) * .25 - leg.lower.rotation.z)
            * Math.min(1, dt * 4);
    }
    if (Math.floor(w.phaseT * 5) !== Math.floor((w.phaseT - dt) * 5) && k < .85) {
        const a = w.phaseT * 4.7;
        spawnGroundPuff(p.group.position.x + Math.cos(a) * 24,
            p.group.position.z + Math.sin(a) * 24, PAL.ink, 6, 7);
        spawnGibs(p.group.position.x, 15, p.group.position.z, 2,
            Math.cos(a), Math.sin(a), 1, PAL.gunmetal, .4, PAL.ink);
    }
    if (k >= 1) {
        w.phase = 'wreck'; w.deathDone = true;
        // Existing parts are the wreck; nothing new is allocated or swapped.
        p.group.position.y = -3.5; p.core.material.emissiveIntensity = 0;
        w.callbacks.onWreck?.(w);
    }
}

export function updateNusantaraWarden(w, dt, ctx = {}) {
    if (!w?.active) return;
    if (w.phase === 'death') { updateDeath(w, dt); return; }
    if (w.phase === 'wreck') return;
    w.phaseT += dt;
    if (w.phase === 'reveal' && w.phaseT >= VISUAL.revealSec) setPhase(w, 'arm');
    else if (w.phase === 'arm' && w.phaseT >= VISUAL.armSec) setPhase(w, 'phase1');
    projectileHits(w); if (w.dead) return;
    updateMovement(w, dt, ctx); updateAttackState(w, dt, ctx.allowAttack !== false);
    animateRig(w, dt);
}

export function resolveNusantaraWardenBlock(w, pos, radius) {
    if (!w?.active || w.phase === 'dormant') return false;
    const p = w.parts.group.position, min = C().bodyRadius + radius;
    const dx = pos.x - p.x, dz = pos.z - p.z, d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(Math.max(1e-6, d2));
    pos.x = p.x + dx / d * min; pos.z = p.z + dz / d * min; return true;
}

export function nusantaraWardenBulletBlocked(w, bullet) {
    if (!w?.active || w.phase === 'dormant') return false;
    const p = w.parts.group.position;
    return segPointDist2(bullet.px, 0, bullet.pz, bullet.mesh.position.x, 0,
        bullet.mesh.position.z, p.x, 0, p.z) <= C().bodyRadius ** 2;
}

// Hook for scene.bulletBlocked: updateMode runs before the frame's bullet
// movement, so a projectile may enter a hit volume only afterwards. This path
// applies that just-entered segment and lets updateBullets perform removal (and
// launcher impact explosion) exactly once.
export function nusantaraWardenBulletHit(w, b) {
    if (!w?.active || w.dead || !b) return false;
    const damage = b.damage != null ? b.damage : CFG.weapons.bulletDamage;
    if (w.phase === 'jam1') {
        for (const q of w.parts.capacitors) if (targetHit(w, b, q)) {
            damageTarget(w, q, damage, 'capacitor'); stats.hits++; return true;
        }
    } else if (w.phase === 'jam2') {
        const q = w.parts.couplings.find(x => x.alive);
        if (q && targetHit(w, b, q)) {
            damageTarget(w, q, damage, 'coupling'); stats.hits++; return true;
        }
    }
    const p = w.parts.group.position;
    if (segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0, b.mesh.position.z,
        p.x, 0, p.z) > C().hitRadius ** 2) return false;
    damageNusantaraWarden(w, damage, { x: b.mesh.position.x, z: b.mesh.position.z });
    stats.hits++; return true;
}

export function cleanupNusantaraWarden(w, hide = false) {
    if (!w) return;
    clearHazards(w); w.attackState = 'cooldown';
    if (hide) { w.active = false; w.parts.group.visible = false; }
}

export function disposeNusantaraWarden(w) {
    if (!w) return; cleanupNusantaraWarden(w, true);
    if (w.parts.group.parent) w.parts.group.parent.remove(w.parts.group);
    if (w.fxRoot.parent) w.fxRoot.parent.remove(w.fxRoot);
}

export const nusantaraWardenIsJamming = w => w?.phase === 'jam1' || w?.phase === 'jam2';
export const nusantaraWardenDead = w => !!w?.dead;
export const nusantaraWardenWrecked = w => !!w?.deathDone;
export const nusantaraWardenVulnerable = w => !!w?.active && !w?.dead
    && !['dormant', 'reveal'].includes(w.phase);

export function nusantaraWardenDebug(w) {
    if (!w) return { built: false };
    const target = q => {
        const p = targetWorld(w, q, new THREE.Vector3());
        return { index: q.index, hp: q.hp, maxHp: q.maxHp, alive: q.alive,
            exposed: q.exposed, x: p.x, y: p.y, z: p.z };
    };
    return {
        built: true, active: w.active, phase: w.phase, phaseT: w.phaseT,
        hp: w.hp, maxHp: w.maxHp, score: w.score, dead: w.dead,
        deathDone: w.deathDone, attackState: w.attackState,
        attackIndex: w.attackIndex, jammed: nusantaraWardenIsJamming(w),
        position: { x: w.parts.group.position.x, y: w.parts.group.position.y,
            z: w.parts.group.position.z },
        rig: { legs: w.parts.legs.length, shutters: w.parts.shutters.length,
            capacitors: w.parts.capacitors.length, couplings: w.parts.couplings.length,
            wreckUsesExistingParts: true },
        capacitors: w.parts.capacitors.map(target), couplings: w.parts.couplings.map(target),
        pools: {
            rail: { size: w.rails.length, active: w.rails.filter(q => q.active).length },
            burst: { size: w.bursts.length, active: w.bursts.filter(q => q.active).length },
            sector: { size: w.sectors.length, active: w.sectors.filter(q => q.active).length },
            stomp: { size: w.stomps.length, active: w.stomps.filter(q => q.active).length },
        },
    };
}
