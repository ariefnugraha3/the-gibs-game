// NUSANTARA WARDEN — independent Stage 11 root guardian.
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
import {
    buildNusantaraWardenDeath, resetNusantaraWardenDeath, beginNusantaraWardenDeath,
    updateNusantaraWardenDeath, nusantaraWardenDeathDebug,
} from './nusantaraWardenDeath.js';

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();
const VISUAL = Object.freeze({ revealSec: 1.45, armSec: .85 });
// Authored so the lowest foot/toe corner stays >=0.12 above the arena floor
// through both walk extremes, both jam poses and the settled wreck.
// Angka rig yang dipakai DUA kali: sekali untuk membangun badannya, sekali
// untuk menerbitkan selubung gambarnya (`nusantaraWardenEnvelope`). Sebuah shot
// kamera boleh mengukur dirinya terhadap selubung itu — dan karena builder-nya
// membaca tabel yang sama, bos yang diubah ukurannya memindahkan shot itu
// bersamanya alih-alih meninggalkan angka jarak yang basi.
const RIG = Object.freeze({
    coreRigY: 29, coreLocalY: 4, coreRadius: 9,
    hipRadius: 18, upperLen: 28, lowerLen: 24, footReach: 12,
});
const LEG_POSE = Object.freeze({
    hipY: 19, upper: -.25, lower: 0,
    walkUpper: .08, walkLower: .12,
    jamUpper: -.32, jamLower: .10,
    lowerBodyY: 1, footBodyY: 6, toeY: 5,
    minFloorClearance: .12,
});
// Puncak yang benar-benar digambar = inti di atas core rig; bentang mendatar =
// jangkauan kaki yang terentang. Keduanya diturunkan, bukan diketik ulang.
const RIG_TOP = RIG.coreRigY + RIG.coreLocalY + RIG.coreRadius;
const RIG_SPAN = RIG.hipRadius
    + (RIG.upperLen + RIG.lowerLen) * Math.cos(LEG_POSE.upper) + RIG.footReach;
// Selubung gambar rig: dipakai kamera cutscene untuk membingkainya utuh.
export const nusantaraWardenEnvelope = () =>
    ({ top: RIG_TOP, spanRadius: RIG_SPAN, centreY: RIG_TOP * .5 });

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
        shield: new THREE.MeshBasicMaterial({ color: PAL.tech, transparent: true,
            opacity: .32, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
        warning: new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
            opacity: .35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
        warningPale: new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true,
            opacity: .65, depthWrite: false, toneMapped: false }),
        projectile: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
        attackCharge: new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
            opacity: .72, depthWrite: false, toneMapped: false }),
    };
}

function buildLeg(parent, index, M) {
    const a = index * Math.PI * 2 / 6;
    const hip = new THREE.Group();
    hip.position.set(Math.cos(a) * RIG.hipRadius, LEG_POSE.hipY,
        Math.sin(a) * RIG.hipRadius);
    hip.rotation.y = -a; parent.add(hip);
    mesh(hip, new THREE.SphereGeometry(5.2, 9, 7), M.joint, 0, 0, 0);
    const upper = new THREE.Group(); upper.rotation.z = LEG_POSE.upper; hip.add(upper);
    mesh(upper, new THREE.BoxGeometry(RIG.upperLen, 7, 9), M.armor,
        RIG.upperLen * .5, -1, 0);
    mesh(upper, new THREE.BoxGeometry(18, 2, 10), M.plate, 11, 3.6, 0, 0, 0, -.08);
    for (let k = 0; k < 3; k++)
        mesh(upper, new THREE.BoxGeometry(2, 8, 10), M.steel, 7 + k * 7, -1, 0,
            0, 0, 0, false, false);
    const knee = new THREE.Group(); knee.position.set(RIG.upperLen, -3, 0); upper.add(knee);
    mesh(knee, new THREE.CylinderGeometry(5, 5, 11, 10), M.joint, 0, 0, 0,
        Math.PI / 2);
    const lower = new THREE.Group(); lower.rotation.z = LEG_POSE.lower; knee.add(lower);
    mesh(lower, new THREE.BoxGeometry(RIG.lowerLen, 6, 8), M.armorDark,
        RIG.lowerLen * .5, LEG_POSE.lowerBodyY, 0);
    mesh(lower, new THREE.BoxGeometry(16, 2, 9), M.steel, 10, 2.7, 0,
        0, 0, -.05, false, false);
    const foot = new THREE.Group(); foot.position.set(RIG.lowerLen, -2, 0); lower.add(foot);
    mesh(foot, new THREE.BoxGeometry(17, 5, 13), M.armor,
        4, LEG_POSE.footBodyY, 0);
    for (const z of [-4, 0, 4])
        mesh(foot, new THREE.BoxGeometry(11, 2, 2.4), M.steel, 10, LEG_POSE.toeY, z,
            0, 0, 0, false, false);
    return { index, a, hip, upper, knee, lower, foot,
        baseUpper: LEG_POSE.upper, baseLower: LEG_POSE.lower };
}

function buildWeakTargetFx(rig, kind) {
    const flashMat = new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true,
        opacity: 0, depthWrite: false, toneMapped: false });
    const sparkMat = new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
        opacity: 0, depthWrite: false, toneMapped: false });
    const flash = kind === 'capacitor'
        ? mesh(rig, new THREE.CylinderGeometry(7.3, 8, 18.2, 10), flashMat,
            0, 0, 0, 0, 0, 0, false, false)
        : mesh(rig, new THREE.BoxGeometry(29, 13.5, 15.5), flashMat,
            4.5, 0, 0, 0, 0, 0, false, false);
    flash.visible = false;
    const sparks = [];
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI * 2 / 6;
        const q = mesh(rig, new THREE.BoxGeometry(.65, .65, 2.6), sparkMat,
            0, 0, 0, 0, -a, 0, false, false);
        q.visible = false;
        q.userData.hitDx = Math.cos(a); q.userData.hitDz = Math.sin(a);
        q.userData.hitLift = .45 + (i % 3) * .25; sparks.push(q);
    }
    const barY = kind === 'capacitor' ? 12 : 9;
    const barBack = mesh(rig, new THREE.BoxGeometry(17, .7, 2.5),
        new THREE.MeshBasicMaterial({ color: PAL.ink, transparent: true,
            opacity: .82, depthWrite: false, toneMapped: false }),
        0, barY, 0, 0, 0, 0, false, false);
    const barFill = mesh(rig, new THREE.BoxGeometry(15, .9, 1.5),
        new THREE.MeshBasicMaterial({ color: kind === 'capacitor' ? PAL.amber : PAL.tech,
            transparent: true, opacity: .95, depthWrite: false, toneMapped: false }),
        0, barY + .45, 0, 0, 0, 0, false, false);
    barBack.visible = barFill.visible = false;
    return { flash, sparks, barBack, barFill, hitT: 0, hits: 0 };
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

    const coreRig = new THREE.Group(); coreRig.position.y = RIG.coreRigY; group.add(coreRig);
    mesh(coreRig, new THREE.CylinderGeometry(13, 16, 12, 12), M.armorDark, 0, 0, 0);
    const core = mesh(coreRig, new THREE.IcosahedronGeometry(RIG.coreRadius, 1), M.core,
        0, RIG.coreLocalY, 0, 0, 0, 0, false, false);
    const attackCharge = mesh(coreRig, new THREE.IcosahedronGeometry(12.5, 1),
        M.attackCharge, 0, 4, 0, 0, 0, 0, false, false);
    attackCharge.visible = false;
    const shutters = [];
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const q = mesh(coreRig, new THREE.BoxGeometry(9, 13, 3), M.armor,
            Math.cos(a) * 13, 4, Math.sin(a) * 13, 0, -a, 0);
        shutters.push(q);
    }
    const shield = new THREE.Group(); shield.position.y = 22; group.add(shield);
    const arc = C().shield.arcDeg * Math.PI / 180;
    const shieldArc = mesh(shield, new THREE.CylinderGeometry(43, 43, 32, 32, 1,
        true, -Math.PI / 2 - arc / 2, arc), M.shield,
    0, 0, 0, 0, 0, 0, false, false);
    const shieldLock = mesh(shield, new THREE.CylinderGeometry(35, 35, 36, 48, 1, true),
        M.shield.clone(), 0, 0, 0, 0, 0, 0, false, false);
    shieldLock.visible = false;
    const shieldEdges = new THREE.Group(); shield.add(shieldEdges);
    const edgeMat = new THREE.MeshBasicMaterial({ color: PAL.tech, transparent: true,
        opacity: .9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    for (const y of [-16, 0, 16]) {
        const geo = new THREE.RingGeometry(42.4, 43.6, 40, 1, Math.PI - arc / 2, arc);
        geo.rotateX(Math.PI / 2);
        mesh(shieldEdges, geo, edgeMat, 0, y, 0, 0, 0, 0, false, false);
    }
    for (let i = 0; i <= 6; i++) {
        const a = Math.PI - arc / 2 + arc * i / 6;
        mesh(shieldEdges, new THREE.BoxGeometry(.7, 32, .7), edgeMat,
            Math.cos(a) * 43, 0, Math.sin(a) * 43, 0, 0, 0, false, false);
    }
    const shieldLockEdges = new THREE.Group(); shield.add(shieldLockEdges);
    for (const y of [-18, 0, 18]) {
        const geo = new THREE.RingGeometry(34.5, 35.5, 48); geo.rotateX(-Math.PI / 2);
        mesh(shieldLockEdges, geo, edgeMat, 0, y, 0, 0, 0, 0, false, false);
    }

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
        capacitors.push({ index: i, rig, hp: 0, maxHp: 0, alive: true, exposed: false,
            baseX: rig.position.x, baseY: rig.position.y, baseZ: rig.position.z,
            hitShape: { minX: -8, maxX: 8, step: 8, radius: 10 },
            fx: buildWeakTargetFx(rig, 'capacitor') });
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
        couplings.push({ index: i, rig, hp: 0, maxHp: 0, alive: true, exposed: false,
            baseX: rig.position.x, baseY: rig.position.y, baseZ: rig.position.z,
            hitShape: { minX: -10, maxX: 20, step: 7.5, radius: 11 },
            fx: buildWeakTargetFx(rig, 'coupling') });
    }
    return { group, legs, coreRig, core, attackCharge, shutters, shield, shieldArc,
        shieldLock, shieldEdges, shieldLockEdges,
        capacitors, couplings, materials: M };
}

function makeRailPool(parent) {
    const out = [];
    for (let i = 0; i < C().rail.poolSize; i++) {
        const shot = new THREE.Mesh(new THREE.BoxGeometry(34, 5, C().rail.width * .72),
            new THREE.MeshBasicMaterial({ color: PAL.white, toneMapped: false }));
        shot.visible = false; parent.add(shot);
        const trail = new THREE.Mesh(new THREE.BoxGeometry(58, 1.5, C().rail.width * .88),
            new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
                opacity: .5, depthWrite: false, toneMapped: false }));
        trail.visible = false; parent.add(trail);
        out.push({ shot, trail, active: false, warned: false, t: 0,
            sx: 0, sz: 0, dx: 1, dz: 0, traveled: 0, hit: false });
    }
    return out;
}
function makeBurstPool(parent) {
    const out = [];
    for (let i = 0; i < C().burst.poolSize; i++) {
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(4.2, 0),
            new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }));
        mesh.visible = false; parent.add(mesh);
        out.push({ mesh, active: false, dx: 0, dz: 0, life: 0, px: 0, pz: 0 });
    }
    return out;
}
function makeSectorPool(parent) {
    const out = [];
    const angle = Math.PI * 2 / 3 - C().sector.gapDeg * Math.PI / 180;
    for (let i = 0; i < C().sector.poolSize; i++) {
        const geo = new THREE.RingGeometry(0, C().sector.radius, 28, 1,
            -angle / 2, angle);
        geo.rotateX(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAL.hazard,
            transparent: true, opacity: .34, depthWrite: false, toneMapped: false,
            side: THREE.DoubleSide }));
        mesh.visible = false; parent.add(mesh);
        const crestGeo = new THREE.CylinderGeometry(C().sector.radius,
            C().sector.radius, 12, 28, 1, true, Math.PI / 2 - angle / 2, angle);
        const crest = new THREE.Mesh(crestGeo, new THREE.MeshBasicMaterial({
            color: PAL.amber, transparent: true, opacity: .85, depthWrite: false,
            toneMapped: false, side: THREE.DoubleSide }));
        crest.visible = false; parent.add(crest);
        out.push({ mesh, crest, active: false, angle: 0, impactT: 0 });
    }
    return out;
}
function makeStompWarnings(parent) {
    const out = [];
    for (let i = 0; i < 6; i++) {
        const geo = new THREE.RingGeometry(0,
            C().stomp.radius, 26);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAL.hazard,
            transparent: true, opacity: .48, depthWrite: false, toneMapped: false,
            side: THREE.DoubleSide }));
        mesh.visible = false; parent.add(mesh);
        const edgeGeo = new THREE.RingGeometry(C().stomp.radius * .96, C().stomp.radius, 48);
        edgeGeo.rotateX(-Math.PI / 2);
        const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({
            color: PAL.amber, transparent: true, opacity: .9, depthWrite: false,
            toneMapped: false, side: THREE.DoubleSide }));
        edge.visible = false; parent.add(edge);
        out.push({ mesh, edge, active: false, impactT: 0, radius: C().stomp.radius });
    }
    return out;
}

function makeWhirlwindFx(parent) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    for (let i = 0; i < 4; i++) {
        const geo = new THREE.CylinderGeometry(C().whirlwind.radius,
            C().whirlwind.radius * .94, 4, 32, 1, true, i * Math.PI / 2, Math.PI / 3);
        const blade = mesh(group, geo, new THREE.MeshBasicMaterial({ color: i % 2 ? PAL.white : PAL.amber,
            transparent: true, opacity: .72, depthWrite: false, toneMapped: false,
            side: THREE.DoubleSide }), 0, 7 + i * 5, 0, 0, 0, 0, false, false);
        blade.userData.whirlBaseY = blade.position.y;
        blade.userData.whirlBaseOpacity = blade.material.opacity;
    }
    const geo = new THREE.RingGeometry(C().whirlwind.radius * .96, C().whirlwind.radius, 64);
    geo.rotateX(-Math.PI / 2);
    const ring = mesh(group, geo, new THREE.MeshBasicMaterial({ color: PAL.hazard,
        transparent: true, opacity: .8, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide }), 0, .9, 0, 0, 0, 0, false, false);
    ring.userData.whirlBaseY = ring.position.y;
    ring.userData.whirlBaseOpacity = ring.material.opacity;
    return group;
}

export function createNusantaraWarden(parent = scene) {
    const parts = buildNusantaraWardenMesh(); parent.add(parts.group);
    const fxRoot = new THREE.Group(); fxRoot.name = 'Nusantara-Warden-Fixed-Hazard-Pool';
    parent.add(fxRoot);
    const w = {
        parts, fxRoot, rails: makeRailPool(fxRoot), bursts: makeBurstPool(fxRoot),
        sectors: makeSectorPool(fxRoot), stomps: makeStompWarnings(fxRoot),
        whirlwindFx: makeWhirlwindFx(fxRoot),
        active: false, phase: 'dormant', hp: 0, maxHp: 0, score: 0,
        phaseT: 0, attackState: 'cooldown', attackT: 0, attackIndex: 0,
        burstLeft: 0, burstT: 0, hitT: 0, animT: 0, sectorBase: 0, moveCycleT: 0,
        dead: false,
        deathDone: false, callbacks: {}, arena: null, home: null,
        awarded: false, jamSerial: 0,
    };
    buildNusantaraWardenDeath(w);
    resetNusantaraWarden(w);
    return w;
}

function clearHazards(w) {
    for (const r of w.rails) {
        r.active = r.warned = false;
        r.shot.visible = r.trail.visible = false;
    }
    for (const b of w.bursts) { b.active = false; b.mesh.visible = false; }
    for (const s of w.sectors) {
        s.active = false; s.impactT = 0; s.mesh.visible = s.crest.visible = false;
    }
    for (const s of w.stomps) {
        s.active = false; s.impactT = 0; s.mesh.visible = s.edge.visible = false;
    }
    w.whirlwindFx.visible = false;
    w.whirlwindFx.scale.set(1, 1, 1);
    for (const part of w.whirlwindFx.children) {
        part.rotation.y = 0;
        part.position.y = part.userData.whirlBaseY ?? part.position.y;
        if (part.material && part.userData.whirlBaseOpacity !== undefined) {
            part.material.opacity = part.userData.whirlBaseOpacity;
        }
    }
    w.whirlContact = 0;
    w.railLeft = 0; w.railT = 0; w.burstVolley = 0;
    w.burstLeft = 0; w.burstT = 0;
}

export function resetNusantaraWarden(w, opts = {}) {
    if (!w) return;
    resetNusantaraWardenDeath(w);
    const cfg = C();
    w.hp = cfg.hp; w.maxHp = cfg.hp; w.score = cfg.score;
    w.active = !!opts.active; w.phase = opts.phase || 'dormant'; w.phaseT = 0;
    w.attackState = 'cooldown'; w.attackT = cfg.attackGapSec; w.attackIndex = 0;
    w.hitT = 0; w.animT = 0; w.sectorBase = 0; w.moveCycleT = 0; w.chaseSide = 1;
    w.dead = false; w.deathDone = false;
    w.dropHeight = 0; w.dropSec = 0; w.dropHover = 0; w.landed = false;
    w.awarded = false; w.jamSerial = 0; w.callbacks = opts.callbacks || {};
    w.arena = opts.arena || w.arena || { x: opts.x || 0, z: opts.z || 0, radius: 280 };
    w.groundY = opts.groundY ?? 0;
    w.hazardY = opts.hazardY ?? w.groundY + .75;
    w.home = opts.home || w.home || { x: opts.x || 0, z: opts.z || 0 };
    const p = w.parts;
    p.group.visible = w.active;
    p.group.position.set(opts.x ?? w.home.x, opts.y || 0, opts.z ?? w.home.z);
    p.group.rotation.set(0, opts.yaw || 0, 0); p.group.scale.setScalar(1);
    p.coreRig.position.set(0, 29, 0); p.coreRig.rotation.set(0, 0, 0);
    p.core.scale.setScalar(1); p.attackCharge.visible = false;
    p.attackCharge.scale.setScalar(1); p.attackCharge.material.opacity = .72;
    p.core.material.emissiveIntensity = EMISSIVE_MAX * .7;
    p.shield.visible = false; p.shield.rotation.set(0, 0, 0);
    p.shieldLock.visible = p.shieldLockEdges.visible = false;
    p.shieldArc.visible = p.shieldEdges.visible = true;
    p.shieldArc.material.opacity = .26;
    for (const q of p.shutters) { q.rotation.set(0, 0, 0); q.position.y = 4; }
    for (const leg of p.legs) {
        leg.hip.rotation.x = leg.hip.rotation.z = 0;
        leg.upper.rotation.z = leg.baseUpper; leg.lower.rotation.z = leg.baseLower;
        leg.foot.rotation.set(0, 0, 0);
    }
    for (const cap of p.capacitors) {
        cap.hp = cap.maxHp = cfg.capacitors.hp; cap.alive = true; cap.exposed = false;
        cap.rig.position.set(cap.baseX, cap.baseY, cap.baseZ);
        cap.rig.visible = true; cap.rig.rotation.set(0, 0, 0); cap.rig.scale.setScalar(1);
        resetWeakTargetFx(cap);
    }
    for (const coupling of p.couplings) {
        coupling.hp = coupling.maxHp = cfg.couplings.hp;
        coupling.alive = true; coupling.exposed = false; coupling.rig.visible = true;
        coupling.rig.position.set(coupling.baseX, coupling.baseY, coupling.baseZ);
        coupling.rig.rotation.set(0, 0, 0); coupling.rig.scale.setScalar(1);
        resetWeakTargetFx(coupling);
    }
    clearHazards(w);
}

// ENTRANCE (2026-09-02, user request "boss warden yang datang dengan cara turun
// dari atas"): the arrival is a property of the BOSS, not of whichever camera is
// watching it, so the drop lives here and a cutscene only has to frame it. Pass
// `drop:true` and the rig is placed `descent.heightUnits` above its landing spot
// and flown down over `descent.sec`; it is untouchable and unable to attack all
// the way to the floor (`descent` joins `dormant`/`reveal` in every guard), and
// `onLand` fires on the frame the feet actually reach y=0 so the impact FX can
// never drift away from the landing.
export function activateNusantaraWarden(w, callbacks = null, opts = {}) {
    if (!w || w.dead) return false;
    if (callbacks) w.callbacks = callbacks;
    w.active = true; w.parts.group.visible = true; w.attackState = 'cooldown';
    clearHazards(w);
    const D = C().descent || {};
    const height = Math.max(0, opts.dropHeight != null ? opts.dropHeight : D.heightUnits || 0);
    if (opts.drop && height > 0) {
        w.dropHeight = height;
        w.dropSec = Math.max(.1, opts.dropSec != null ? opts.dropSec : D.sec || 3);
        // HOVER dulu, baru jatuh (2026-09-02, permintaan user "perlihatkan
        // warden dari atap, KEMUDIAN warden turun ke bawah"): tanpa jeda ini ia
        // sudah setengah jalan turun sebelum pemain sempat melihatnya di atas.
        w.dropHover = Math.max(0, opts.hoverSec != null ? opts.hoverSec : D.hoverSec || 0);
        w.landed = false;
        w.parts.group.position.y = height;
        w.phase = 'descent'; w.phaseT = 0;
        w.callbacks.onPhase?.('descent', w); return true;
    }
    w.dropHeight = 0; w.dropSec = 0; w.dropHover = 0; w.landed = true;
    w.parts.group.position.y = 0;
    w.phase = 'reveal'; w.phaseT = 0;
    w.callbacks.onPhase?.('reveal', w); return true;
}

// Feet-first arrival: accelerating fall (`k^1.9`) so the rig reads as dropping
// under its own mass instead of easing in, exactly reaching y=0 at `dropSec`.
function updateDescent(w, dt) {
    const hover = w.dropHover || 0;
    // Selama hover ia MENGGANTUNG di ketinggian atap, hanya bergetar pelan —
    // jatuhnya baru mulai sesudahnya.
    const k = Math.min(1, Math.max(0, w.phaseT - hover) / Math.max(.1, w.dropSec));
    w.parts.group.position.y = w.dropHeight * (1 - k ** 1.9)
        + (w.phaseT < hover ? Math.sin(w.phaseT * 7.5) * 1.2 : 0);
    // Thrusters/vents flare harder the closer the floor gets.
    w.parts.core.material.emissiveIntensity = Math.min(EMISSIVE_MAX,
        .35 + k * .5 + Math.sin(w.animT * 9) * .06);
    w.animT += dt;
    // Kaki merentang sesaat sebelum menyentuh lantai (pose mendarat).
    const brace = k > .55 ? (k - .55) / .45 : 0;
    for (const leg of w.parts.legs)
        leg.upper.rotation.z += ((leg.baseUpper - brace * .22)
            - leg.upper.rotation.z) * Math.min(1, dt * 7);
    if (k < 1) return;
    w.parts.group.position.y = 0;
    if (!w.landed) {
        w.landed = true;
        const p = w.parts.group.position, D = C().descent || {};
        addCamShake(Math.max(0, D.impactShake || 0));
        explodeAt(new THREE.Vector3(p.x, 4, p.z), 22, 0);
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3;
            spawnGroundPuff(p.x + Math.cos(a) * C().bodyRadius,
                p.z + Math.sin(a) * C().bodyRadius, PAL.concrete, 9, 1.1);
        }
        w.callbacks.onLand?.(w);
    }
    setPhase(w, 'reveal');
}

function setPhase(w, phase) {
    w.phase = phase; w.phaseT = 0; clearHazards(w);
    w.moveCycleT = 0;
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
function resetWeakTargetFx(target) {
    const fx = target.fx; if (!fx) return;
    fx.hitT = 0; fx.hits = 0; fx.flash.visible = false;
    fx.flash.material.opacity = 0; fx.flash.scale.setScalar(1);
    fx.barBack.visible = fx.barFill.visible = false;
    fx.barFill.scale.set(1, 1, 1); fx.barFill.position.x = 0;
    for (const spark of fx.sparks) {
        spark.visible = false; spark.material.opacity = 0;
        spark.position.set(0, 0, 0); spark.scale.setScalar(1);
    }
}
function removeBullet(index, b) {
    if (b.explosive) explodeAt(new THREE.Vector3(b.mesh.position.x,
        b.mesh.position.y, b.mesh.position.z), b.explodeR, 0, b.boomSfx);
    scene.remove(b.mesh); bullets.splice(index, 1);
}
function targetHit(w, b, target) {
    if (!target.alive || !target.exposed) return false;
    // Weak points are multipart horizontal machines. Test a row of overlapping
    // circles along the actual local-X silhouette instead of one tiny centre
    // circle, so rounds through an end cap/ring still register at low FPS.
    const h = target.hitShape;
    for (let x = h.minX; x <= h.maxX + 1e-6; x += h.step) {
        TMP.set(x, 0, 0); target.rig.localToWorld(TMP);
        if (segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0,
            b.mesh.position.z, TMP.x, 0, TMP.z) <= h.radius ** 2) return true;
    }
    return false;
}
function frontShielded(w, impactX, impactZ) {
    const cfg = C();
    if (w.phase === 'phase3' || w.phase === 'death' || w.phase === 'wreck') return false;
    const p = w.parts.group.position;
    const hitAngle = Math.atan2(impactZ - p.z, impactX - p.x);
    const front = Math.PI - w.parts.group.rotation.y;
    return Math.abs(wrap(hitAngle - front)) <= cfg.shield.arcDeg * Math.PI / 360;
}

export function damageNusantaraWarden(w, damage, impact = {}) {
    if (!w?.active || w.dead || ['dormant', 'descent', 'reveal'].includes(w.phase)) return false;
    let d = Math.max(0, damage || 0);
    if (w.phase === 'jam1' || w.phase === 'jam2') { w.hitT = 1; return false; }
    if (d <= 0) return false;
    if (frontShielded(w, impact.x ?? w.parts.group.position.x - 1,
        impact.z ?? w.parts.group.position.z)) d *= C().shield.damageMul;
    const floor = w.phase === 'phase1' ? w.maxHp * C().phase2HpFrac
        : w.phase === 'phase2' ? w.maxHp * C().phase3HpFrac : 0;
    w.hp = Math.max(floor, w.hp - d); w.hitT = 1;
    if (w.hp <= 0) killNusantaraWarden(w);
    else if (w.phase === 'phase1' && w.hp <= w.maxHp * C().phase2HpFrac) startJam(w, 'jam1');
    else if (w.phase === 'phase2' && w.hp <= w.maxHp * C().phase3HpFrac) startJam(w, 'jam2');
    return true;
}

function damageTarget(w, target, damage, kind) {
    if (!target.alive || !target.exposed) return false;
    target.hp -= Math.max(1, damage); w.hitT = 1;
    const fx = target.fx; fx.hitT = 1; fx.hits++;
    fx.flash.visible = fx.barBack.visible = fx.barFill.visible = true;
    for (const spark of fx.sparks) spark.visible = true;
    if (target.hp > 0) return true;
    target.hp = 0; target.alive = false; target.exposed = false;
    fx.hitT = 0; fx.flash.visible = fx.barBack.visible = fx.barFill.visible = false;
    for (const spark of fx.sparks) spark.visible = false;
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
            for (const q of w.parts.couplings) if (targetHit(w, b, q)) {
                hit = damageTarget(w, q, damage, 'coupling'); break;
            }
        }
        if (!hit && segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0,
            b.mesh.position.z, p.x, 0, p.z) <= C().hitRadius ** 2)
        {
            damageNusantaraWarden(w, damage, { x: b.mesh.position.x, z: b.mesh.position.z });
            hit = true;
        }
        if (!hit) continue;
        stats.hits++; removeBullet(i, b);
    }
}

function freeRail(w) { return w.rails.find(r => !r.active) || null; }
function beginRail(w, charge = true) {
    const r = freeRail(w); if (!r) return false;
    const p = w.parts.group.position;
    const a = Math.atan2(camera.position.z - p.z, camera.position.x - p.x);
    r.active = true; r.warned = charge; r.t = C().rail.telegraphSec;
    r.sx = p.x; r.sz = p.z; r.dx = Math.cos(a); r.dz = Math.sin(a);
    r.traveled = 0; r.hit = false; r.shot.visible = false;
    if (!charge) fireRail(r);
    return true;
}
function fireRail(r) {
    r.warned = false;
    r.shot.visible = r.trail.visible = true;
    r.shot.position.set(r.sx, 12, r.sz); r.shot.rotation.y = -Math.atan2(r.dz, r.dx);
    r.trail.position.set(r.sx - r.dx * 30, 8, r.sz - r.dz * 30);
    r.trail.rotation.y = r.shot.rotation.y;
}
function updateRails(w, dt) {
    for (const r of w.rails) if (r.active) {
        if (r.warned) {
            r.t -= dt;
            if (r.t <= 1e-9) {
                if (w.phase !== 'phase1') {
                    const a = Math.atan2(camera.position.z - r.sz, camera.position.x - r.sx);
                    r.dx = Math.cos(a); r.dz = Math.sin(a);
                }
                fireRail(r); w.railT = C().rail.shotGapSec;
                w.railJustFired = true; w.attackState = 'railFire';
                if (!w.railLeft) endAttack(w);
            }
            continue;
        }
        const oldX = r.shot.position.x, oldZ = r.shot.position.z;
        const step = C().rail.speed * dt; r.traveled += step;
        r.shot.position.x += r.dx * step; r.shot.position.z += r.dz * step;
        r.trail.position.x = r.shot.position.x - r.dx * 30;
        r.trail.position.z = r.shot.position.z - r.dz * 30;
        if (!r.hit && segPointDist2(oldX, 0, oldZ, r.shot.position.x, 0,
            r.shot.position.z, camera.position.x, 0, camera.position.z)
            <= (C().rail.width * .55 + player.radius) ** 2) {
            r.hit = true; queueBoom(camera.position.x, 5, camera.position.z,
                player.radius + 2, true, C().rail.damage, 0);
        }
        if (r.traveled >= 620) {
            r.active = false; r.shot.visible = r.trail.visible = false;
        }
    }
}

function beginStomp(w) {
    w.attackT = C().stomp.telegraphSec;
    for (let i = 0; i < w.stomps.length; i++) {
        const s = w.stomps[i], leg = w.parts.legs[i];
        leg.upper.rotation.z = leg.baseUpper; leg.lower.rotation.z = leg.baseLower;
        leg.foot.rotation.z = 0;
        TMP.set(4, LEG_POSE.footBodyY, 0); leg.foot.localToWorld(TMP);
        s.active = w.phase !== 'phase1' || i % 2 === w.attackIndex % 2;
        s.mesh.visible = s.edge.visible = s.active; s.impactT = 0;
        s.radius = C().stomp.radius * (w.phase === 'phase3' ? C().stomp.phase3RadiusMul : 1);
        s.mesh.scale.setScalar(s.radius / C().stomp.radius);
        s.edge.scale.copy(s.mesh.scale);
        s.mesh.material.color.setHex(PAL.hazard);
        s.edge.material.opacity = .95;
        s.mesh.position.set(TMP.x, w.hazardY, TMP.z);
        s.edge.position.copy(s.mesh.position); s.edge.position.y += .15;
    }
}
function resolveStomp(w) {
    for (const s of w.stomps) if (s.active) {
        queueBoom(s.mesh.position.x, 4, s.mesh.position.z, s.radius,
            true, C().stomp.damage, 0);
        s.active = false; s.impactT = C().stomp.impactSec;
        s.mesh.material.color.setHex(PAL.amber);
        spawnGroundPuff(s.mesh.position.x, s.mesh.position.z, PAL.concrete, 10, 1);
    }
    addCamShake(4);
}

function beginBurst(w) {
    w.attackT = C().burst.telegraphSec;
    w.burstVolleys = w.phase === 'phase3' ? C().burst.phase3Volleys : 1;
    w.burstLeft = C().burst.count * w.burstVolleys;
    w.burstShots = 0; w.burstElapsed = 0; w.burstT = 0;
}
function emitBurst(w, shot, volley) {
    const free = w.bursts.find(b => !b.active); if (!free) return;
    const a = shot * Math.PI * 2 / Math.max(1, C().burst.count)
        + w.burstBase + volley * Math.PI / C().burst.count;
    free.active = true; free.dx = Math.cos(a); free.dz = Math.sin(a); free.life = 5;
    free.mesh.position.set(w.parts.group.position.x, 18, w.parts.group.position.z);
    free.px = free.mesh.position.x; free.pz = free.mesh.position.z; free.mesh.visible = true;
}
function updateBursts(w, dt) {
    if (w.attackState === 'burstFire') {
        w.burstElapsed += dt;
        while (w.burstLeft > 0) {
            const shot = w.burstShots % C().burst.count;
            const volley = Math.floor(w.burstShots / C().burst.count);
            const due = volley * C().burst.volleyGapSec + shot * C().burst.gapSec;
            if (w.burstElapsed + 1e-9 < due) break;
            emitBurst(w, shot, volley); w.burstLeft--; w.burstShots++;
            w.burstVolley = volley;
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
        s.impactT = 0; s.crest.visible = false; s.mesh.scale.setScalar(1);
        s.mesh.material.color.setHex(PAL.hazard);
        s.mesh.position.set(w.parts.group.position.x, w.hazardY, w.parts.group.position.z);
        // Geometry already lies on XZ; yaw is around world-up.
        s.mesh.rotation.y = -s.angle;
        s.crest.position.copy(s.mesh.position); s.crest.position.y += 6;
        s.crest.rotation.y = -s.angle;
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
    for (const s of w.sectors) if (s.active) {
        s.active = false; s.impactT = C().sector.impactSec;
        s.mesh.material.color.setHex(PAL.amber); s.crest.visible = true;
    }
    addCamShake(6);
}

// Ground attacks are world-space meshes. When the Warden keeps closing on the
// player during a telegraph, carry those warnings with its carrier so the
// visible danger and the resolved hit stay together.
function translateGroundWarnings(w, dx, dz) {
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return;
    for (const s of w.stomps) if (s.active) {
        s.mesh.position.x += dx; s.mesh.position.z += dz;
        s.edge.position.x += dx; s.edge.position.z += dz;
    }
    for (const s of w.sectors) if (s.active) {
        s.mesh.position.x += dx; s.mesh.position.z += dz;
        s.crest.position.x += dx; s.crest.position.z += dz;
    }
}
function stompTargetInRange(w) {
    const radius = C().stomp.radius
        * (w.phase === 'phase3' ? C().stomp.phase3RadiusMul : 1) + player.radius;
    for (let i = 0; i < w.parts.legs.length; i++) {
        if (w.phase === 'phase1' && i % 2 !== w.attackIndex % 2) continue;
        const leg = w.parts.legs[i];
        TMP.set(4, LEG_POSE.footBodyY, 0); leg.foot.localToWorld(TMP);
        if (Math.hypot(camera.position.x - TMP.x, camera.position.z - TMP.z) <= radius)
            return true;
    }
    return false;
}

function attacksBusy(w) {
    return w.rails.some(r => r.active) || w.bursts.some(b => b.active)
        || w.stomps.some(s => s.active) || w.sectors.some(s => s.active);
}
function beginAttack(w) {
    const choices = w.phase === 'phase3' ? ['rail', 'stomp', 'burst', 'sector', 'whirlwind']
        : ['rail', 'stomp', 'burst', 'sector'];
    for (let attempt = 0; attempt < choices.length; attempt++) {
        const kind = choices[w.attackIndex % choices.length];
        w.attackIndex++;
        // Stomp is only selected when at least one of the active foot circles
        // can reach the player. Otherwise skip it without showing a false
        // telegraph and continue the normal attack cycle.
        if (kind === 'stomp' && !stompTargetInRange(w)) continue;
        w.attackState = `${kind}Telegraph`;
        if (kind === 'rail') {
            w.railLeft = (w.phase === 'phase3' ? C().rail.phase3Count
                : w.phase === 'phase2' ? C().rail.phase2Count : 1) - 1;
            if (!beginRail(w)) endAttack(w); else w.attackT = C().rail.telegraphSec;
        }
        else if (kind === 'stomp') beginStomp(w);
        else if (kind === 'burst') beginBurst(w);
        else if (kind === 'sector') beginSector(w);
        else {
            w.attackT = C().whirlwind.telegraphSec;
            w.whirlContact = 0; w.whirlwindFx.visible = true;
        }
        return;
    }
    endAttack(w);
}
function endAttack(w) {
    w.attackState = 'cooldown';
    const enrage = w.phase === 'phase3';
    w.attackT = C().attackGapSec * (enrage ? C().enrageGapMul : 1);
}
function animateTelegraphs(w) {
    const pulse = (1 + Math.sin(w.animT * 13)) / 2;
    if (w.attackState === 'stompTelegraph') {
        for (const s of w.stomps) if (s.active) {
            s.mesh.material.opacity = .4 + pulse * .28;
        }
    } else if (w.attackState === 'sectorTelegraph') {
        for (const s of w.sectors) if (s.active) {
            s.mesh.material.opacity = .45 + pulse * .3;
        }
    } else if (w.attackState === 'whirlwindTelegraph') {
        const cfg = C().whirlwind;
        const progress = cfg.telegraphSec > 0
            ? Math.min(1, Math.max(0, 1 - w.attackT / cfg.telegraphSec))
            : 1;
        const signal = (1 + Math.sin(w.animT * 18)) / 2;
        const scale = .78 + progress * .22 + signal * .08;
        w.whirlwindFx.scale.set(scale, 1, scale);
        for (let i = 0; i < w.whirlwindFx.children.length; i++) {
            const part = w.whirlwindFx.children[i];
            const baseY = part.userData.whirlBaseY ?? part.position.y;
            const baseOpacity = part.userData.whirlBaseOpacity ?? part.material?.opacity ?? 1;
            part.rotation.y = w.animT * (3.5 + i * .55) + i * Math.PI / 2;
            part.position.y = baseY + Math.sin(w.animT * 10 + i * 1.4) * (0.35 + progress * .35);
            if (part.material) part.material.opacity = baseOpacity * (.58 + signal * .42);
        }
    } else if (w.attackState === 'whirlwind') {
        w.whirlwindFx.scale.set(1, 1, 1);
        for (const part of w.whirlwindFx.children) {
            part.position.y = part.userData.whirlBaseY ?? part.position.y;
            if (part.material && part.userData.whirlBaseOpacity !== undefined) {
                part.material.opacity = part.userData.whirlBaseOpacity;
            }
        }
    }
}

function updateImpactFx(w, dt) {
    for (const s of w.stomps) if (s.impactT > 0) {
        s.impactT = Math.max(0, s.impactT - dt);
        const k = 1 - s.impactT / C().stomp.impactSec;
        s.mesh.material.opacity = (1 - k) * .65;
        s.edge.scale.setScalar(s.radius / C().stomp.radius * (.12 + k * .88));
        s.edge.material.opacity = (1 - k) * .95;
        s.mesh.visible = s.edge.visible = s.impactT > 0;
    }
    for (const s of w.sectors) if (s.impactT > 0) {
        s.impactT = Math.max(0, s.impactT - dt);
        const k = 1 - s.impactT / C().sector.impactSec;
        s.mesh.material.opacity = (1 - k) * .85;
        s.crest.scale.set(.1 + k * .9, 1 + Math.sin(k * Math.PI), .1 + k * .9);
        s.crest.material.opacity = (1 - k) * .95;
        s.mesh.visible = s.crest.visible = s.impactT > 0;
    }
    if (w.whirlwindFx.visible) {
        w.whirlwindFx.position.copy(w.parts.group.position);
        w.whirlwindFx.rotation.y = w.parts.group.rotation.y;
    }
}

function updateWhirlwind(w, dt, ctx) {
    const cfg = C().whirlwind, p = w.parts.group.position;
    const step = Math.min(dt, Math.max(0, w.attackT));
    const oldX = p.x, oldZ = p.z;
    updatePursuitWindow(w, step, ctx, cfg.chaseSpeed || C().moveSpeed);
    w.parts.group.rotation.y += cfg.spinRadPerSec * step;
    // Pecah kontak menjadi tick kecil agar DPS tetap sama pada frame rate berbeda.
    const endD = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
    const startD = Math.hypot(camera.position.x - oldX, camera.position.z - oldZ);
    const radius = cfg.radius + player.radius;
    const contact = endD <= radius ? step * (startD <= radius ? 1
        : clamp((radius - endD) / Math.max(1e-6, startD - endD), 0, 1)) : 0;
    w.whirlContact += contact;
    while (w.whirlContact + 1e-9 >= cfg.tickSec) {
        queueBoom(camera.position.x, 5, camera.position.z, player.radius + 2,
            true, cfg.damagePerSec * cfg.tickSec, 0);
        w.whirlContact = Math.max(0, w.whirlContact - cfg.tickSec);
    }
    w.attackT = Math.max(0, w.attackT - step);
    if (w.attackT <= 1e-9 || (contact === 0 && w.whirlContact > 0)) {
        if (w.whirlContact > 0) queueBoom(camera.position.x, 5, camera.position.z,
            player.radius + 2, true, cfg.damagePerSec * w.whirlContact, 0);
        w.whirlContact = 0;
    }
    if (w.attackT <= 1e-9) { w.whirlwindFx.visible = false; endAttack(w); }
}

function updateAttackState(w, dt, allow, ctx) {
    updateImpactFx(w, dt);
    if (!allow || !['phase1', 'phase2', 'phase3'].includes(w.phase)) return;
    w.railJustFired = false;
    updateRails(w, dt); updateBursts(w, dt); animateTelegraphs(w);
    if (w.attackState === 'whirlwind') { updateWhirlwind(w, dt, ctx); return; }
    if (w.attackState === 'railFire') {
        if (!w.railJustFired) w.railT -= dt;
        while (w.railLeft > 0 && w.railT <= 1e-9) {
            if (!beginRail(w, false)) break;
            w.railLeft--; w.railT += C().rail.shotGapSec;
        }
        if (!w.railLeft) endAttack(w);
        return;
    }
    if (w.attackState === 'cooldown') {
        w.attackT -= dt;
        if (w.attackT <= 0 && !attacksBusy(w)) beginAttack(w);
        return;
    }
    if (w.attackState === 'burstFire') return;
    w.attackT -= dt;
    if (w.attackState.endsWith('Telegraph') && w.attackT <= 0) {
        if (w.attackState === 'railTelegraph') return;
        else if (w.attackState === 'stompTelegraph') { resolveStomp(w); endAttack(w); }
        else if (w.attackState === 'burstTelegraph') {
            w.attackState = 'burstFire'; w.burstBase = w.animT * .2;
        } else if (w.attackState === 'sectorTelegraph') { resolveSector(w); endAttack(w); }
        else if (w.attackState === 'whirlwindTelegraph') {
            w.attackState = 'whirlwind'; w.attackT = C().whirlwind.durationSec;
        }
    }
}

function updateMovement(w, dt, ctx) {
    // `g` = group (rotasi), `p` = posisinya. Keduanya HARUS dipisah: rotasi
    // hidup di group, bukan di Vector3 posisi.
    const g = w.parts.group, p = g.position;
    const active = ['phase1', 'phase2', 'phase3'].includes(w.phase);
    if (!active || w.attackState === 'whirlwind') return;
    const oldX = p.x, oldZ = p.z;
    const speed = w.attackState === 'whirlwindTelegraph'
        ? C().whirlwind.chaseSpeed || C().moveSpeed : C().moveSpeed;
    updatePursuitWindow(w, dt, ctx, speed);
    translateGroundWarnings(w, p.x - oldX, p.z - oldZ);
}

function updatePursuitWindow(w, dt, ctx, speed) {
    if (!(dt > 0)) return;
    const movement = C().movement || {};
    const moveSec = Math.max(0, movement.moveSec ?? 5);
    const restSec = Math.max(0, movement.restSec ?? 5);
    const cycleSec = moveSec + restSec;
    if (cycleSec <= 1e-9) return;
    let remaining = dt;
    while (remaining > 1e-9) {
        let t = ((w.moveCycleT % cycleSec) + cycleSec) % cycleSec;
        const moving = t < moveSec;
        const phaseEnd = moving ? moveSec : cycleSec;
        const slice = Math.min(remaining, Math.max(1e-9, phaseEnd - t));
        if (moving) moveTowardPlayer(w, slice, ctx, speed);
        t += slice;
        w.moveCycleT = t >= cycleSec - 1e-9 ? 0 : t;
        remaining -= slice;
    }
}

// The player movement loop uses a 60 fps-normalized step, while boss updates
// receive seconds. Warden pursuit is therefore tuned directly in units/sec and
// uses the same live player target as its attacks.
function moveTowardPlayer(w, dt, ctx = {}, speed = C().moveSpeed) {
    if (!(dt > 0)) return;
    const g = w.parts.group, p = g.position, arena = ctx.arena || w.arena;
    const tx = camera.position.x, tz = camera.position.z;
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    const stop = C().bodyRadius + player.radius + 4;
    const travel = Math.min(speed * dt, Math.max(0, d - stop));
    if (travel <= 1e-9 || d <= 1e-9) {
        const want = Math.PI - Math.atan2(dz, dx);
        g.rotation.y = turn(g.rotation.y, want, C().turnRadPerSec, dt);
        return;
    }
    const ux = dx / d, uz = dz / d;
    const oldX = p.x, oldZ = p.z;
    p.x = oldX + ux * travel; p.z = oldZ + uz * travel;
    ctx.resolveBoss?.(p);
    clampToArena(w, arena);
    let bestX = p.x, bestZ = p.z;
    let bestD = Math.hypot(tx - p.x, tz - p.z);

    // A direct line can meet the central transmitter. If the resolver leaves
    // that step without closing the gap, take a short tangent step so the
    // Warden can go around the obstruction instead of appearing stuck.
    if (ctx.resolveBoss && bestD >= d - 1e-6) {
        const side = w.chaseSide || 1;
        const px = -uz, pz = ux;
        for (const sign of [side, -side]) {
            p.x = oldX + px * sign * travel;
            p.z = oldZ + pz * sign * travel;
            ctx.resolveBoss(p); clampToArena(w, arena);
            const candidateD = Math.hypot(tx - p.x, tz - p.z);
            if (candidateD < bestD - 1e-6
                || (Math.abs(candidateD - bestD) < 1e-6
                    && sign === side)) {
                bestD = candidateD; bestX = p.x; bestZ = p.z;
            }
        }
        p.x = bestX; p.z = bestZ;
        if (Math.hypot(p.x - oldX, p.z - oldZ) < 1e-6)
            w.chaseSide = -side;
    } else { w.chaseSide = w.chaseSide || 1; }
    const want = Math.PI - Math.atan2(tz - p.z, tx - p.x);
    g.rotation.y = turn(g.rotation.y, want, C().turnRadPerSec, dt);
}

function clampToArena(w, arena = w.arena) {
    if (!arena) return;
    const p = w.parts.group.position;
    const dArena = Math.hypot(p.x - arena.x, p.z - arena.z);
    if (dArena > arena.radius - C().bodyRadius) {
        const k = (arena.radius - C().bodyRadius) / dArena;
        p.x = arena.x + (p.x - arena.x) * k; p.z = arena.z + (p.z - arena.z) * k;
    }
}

function animateRig(w, dt) {
    const p = w.parts; w.animT += dt;
    if (w.whirlwindFx.visible) {
        w.whirlwindFx.position.copy(p.group.position);
        w.whirlwindFx.position.y += w.hazardY;
        w.whirlwindFx.rotation.y = p.group.rotation.y;
    }
    const moving = ['phase1', 'phase2', 'phase3'].includes(w.phase)
        && w.attackState === 'cooldown';
    for (const leg of p.legs) {
        const stomp = w.stomps[leg.index];
        if (w.attackState === 'stompTelegraph' && stomp.active) {
            const t = clamp(1 - w.attackT / C().stomp.telegraphSec, 0, 1);
            const lift = t < .7 ? Math.sin(t / .7 * Math.PI / 2)
                : (1 - (t - .7) / .3) ** 2;
            leg.upper.rotation.z = leg.baseUpper + lift * .48;
            leg.lower.rotation.z = leg.baseLower - lift * .18;
            leg.foot.rotation.z = -lift * .12;
            continue;
        }
        if (stomp.impactT > 0) {
            leg.upper.rotation.z = leg.baseUpper;
            leg.lower.rotation.z = leg.baseLower; leg.foot.rotation.z = 0;
            continue;
        }
        const step = moving ? Math.sin(w.animT * 4.2 + leg.index * Math.PI / 3) : 0;
        const jamAnchor = w.phase === 'jam1' && leg.index % 2 === 0
            || w.phase === 'jam2' && leg.index % 2 === 1;
        leg.upper.rotation.z += ((jamAnchor ? LEG_POSE.jamUpper
            : leg.baseUpper + step * LEG_POSE.walkUpper)
            - leg.upper.rotation.z) * Math.min(1, dt * 7);
        leg.lower.rotation.z += ((jamAnchor ? LEG_POSE.jamLower
            : leg.baseLower - step * LEG_POSE.walkLower)
            - leg.lower.rotation.z) * Math.min(1, dt * 7);
        leg.foot.rotation.z = jamAnchor ? 0 : step * .04;
    }
    p.coreRig.rotation.y += dt * (w.phase === 'phase3' ? 2.2 : .75);
    const locked = nusantaraWardenIsJamming(w);
    p.shield.visible = locked || w.phase === 'phase1' || w.phase === 'phase2';
    p.shield.rotation.y = 0;
    p.shieldArc.visible = p.shieldEdges.visible = !locked;
    p.shieldLock.visible = p.shieldLockEdges.visible = locked;
    const shieldPulse = .28 + (1 + Math.sin(w.animT * 5)) * .045 + w.hitT * .3;
    p.shieldArc.material.opacity = shieldPulse;
    p.shieldLock.material.opacity = shieldPulse;
    const open = w.phase === 'phase3' ? 1 : w.phase === 'phase2' ? .45 : 0;
    for (let i = 0; i < p.shutters.length; i++) {
        const q = p.shutters[i], a = i * Math.PI / 4;
        q.position.x = Math.cos(a) * (13 + open * 8);
        q.position.z = Math.sin(a) * (13 + open * 8);
    }
    p.core.material.emissiveIntensity = Math.min(EMISSIVE_MAX,
        .45 + (w.phase === 'phase3' ? .35 : .16) + Math.sin(w.animT * 6) * .08);
    const charging = w.attackState.endsWith('Telegraph')
        || w.attackState === 'burstFire' || w.attackState === 'railFire'
        || w.attackState === 'whirlwind';
    p.attackCharge.visible = charging;
    if (charging) {
        const pulse = (1 + Math.sin(w.animT * 15)) / 2;
        p.attackCharge.scale.setScalar(.9 + pulse * .32);
        p.attackCharge.material.opacity = .38 + pulse * .48;
    }
    updateWeakTargetFx(w, dt);
    if (w.hitT > 0) {
        w.hitT = Math.max(0, w.hitT - dt * 5);
        p.core.scale.setScalar(1 + w.hitT * .18);
    } else p.core.scale.setScalar(1);
}

function animateWeakTarget(target, dt) {
    const fx = target.fx;
    if (!target.alive) return;
    target.rig.position.set(target.baseX, target.baseY, target.baseZ);
    target.rig.scale.setScalar(1);
    if (fx.hitT <= 0) {
        fx.flash.visible = fx.barBack.visible = fx.barFill.visible = false;
        for (const spark of fx.sparks) spark.visible = false;
        return;
    }
    fx.hitT = Math.max(0, fx.hitT - dt * 2.35);
    const age = 1 - fx.hitT;
    const kick = Math.sin(age * Math.PI);
    target.rig.position.y = target.baseY + kick * 1.5;
    target.rig.scale.setScalar(1 + kick * .045);
    fx.flash.visible = fx.barBack.visible = fx.barFill.visible = true;
    fx.flash.material.opacity = fx.hitT * .78;
    fx.flash.scale.setScalar(1 + age * .22);
    const hpFrac = clamp(target.hp / Math.max(1, target.maxHp), 0, 1);
    fx.barFill.scale.x = hpFrac;
    fx.barFill.position.x = -7.5 * (1 - hpFrac);
    for (let i = 0; i < fx.sparks.length; i++) {
        const spark = fx.sparks[i], centerX = target.hitShape.maxX > 10 ? 4.5 : 0;
        spark.visible = true; spark.material.opacity = fx.hitT;
        spark.position.set(centerX + spark.userData.hitDx * age * 14,
            spark.userData.hitLift * age * 10, spark.userData.hitDz * age * 14);
        spark.scale.setScalar(.7 + fx.hitT * .8);
        spark.rotation.z += dt * (9 + i);
    }
}
function updateWeakTargetFx(w, dt) {
    for (const target of w.parts.capacitors) animateWeakTarget(target, dt);
    for (const target of w.parts.couplings) animateWeakTarget(target, dt);
}

function killNusantaraWarden(w) {
    if (w.dead) return;
    w.hp = 0; w.dead = true; w.phase = 'death'; w.phaseT = 0;
    w.attackState = 'dead'; clearHazards(w); stats.kills++; addCamShake(8);
    w.parts.attackCharge.visible = false;
    beginNusantaraWardenDeath(w);
    w.callbacks.onDeath?.(w);
}
function updateDeath(w, dt) {
    if (updateNusantaraWardenDeath(w, dt)) {
        w.phase = 'wreck'; w.deathDone = true;
        w.callbacks.onWreck?.(w);
    }
}

export function updateNusantaraWarden(w, dt, ctx = {}) {
    if (!w?.active) return;
    if (w.phase === 'death') { updateDeath(w, dt); return; }
    if (w.phase === 'wreck') return;
    w.phaseT += dt;
    if (w.phase === 'descent') { updateDescent(w, dt); return; }
    if (w.phase === 'reveal' && w.phaseT >= VISUAL.revealSec) setPhase(w, 'arm');
    else if (w.phase === 'arm' && w.phaseT >= VISUAL.armSec) setPhase(w, 'phase1');
    projectileHits(w); if (w.dead) return;
    updateMovement(w, dt, ctx); updateAttackState(w, dt, ctx.allowAttack !== false, ctx);
    animateRig(w, dt);
}

export function resolveNusantaraWardenBlock(w, pos, radius) {
    if (!w?.active || w.phase === 'dormant' || w.phase === 'descent') return false;
    const p = w.parts.group.position, min = C().bodyRadius + radius;
    const dx = pos.x - p.x, dz = pos.z - p.z, d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(Math.max(1e-6, d2));
    pos.x = p.x + dx / d * min; pos.z = p.z + dz / d * min; return true;
}

export function nusantaraWardenBulletBlocked(w, bullet) {
    if (!w?.active || w.phase === 'dormant' || w.phase === 'descent') return false;
    const p = w.parts.group.position;
    return segPointDist2(bullet.px, 0, bullet.pz, bullet.mesh.position.x, 0,
        bullet.mesh.position.z, p.x, 0, p.z) <= C().bodyRadius ** 2;
}

// Hook for scene.bulletBlocked: updateMode runs before the frame's bullet
// movement, so a projectile may enter a hit volume only afterwards. This path
// applies that just-entered segment and lets updateBullets perform removal (and
// launcher impact explosion) exactly once.
export function nusantaraWardenBulletHit(w, b) {
    if (!w?.active || w.dead || !b || w.phase === 'descent') return false;
    const damage = b.damage != null ? b.damage : CFG.weapons.bulletDamage;
    if (w.phase === 'jam1') {
        for (const q of w.parts.capacitors) if (targetHit(w, b, q)) {
            damageTarget(w, q, damage, 'capacitor'); stats.hits++; return true;
        }
    } else if (w.phase === 'jam2') {
        for (const q of w.parts.couplings) if (targetHit(w, b, q)) {
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
    if (hide) {
        w.active = false; w.parts.group.visible = false; w.deathFx.root.visible = false;
    }
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
    && !['dormant', 'descent', 'reveal', 'jam1', 'jam2'].includes(w.phase);
export const nusantaraWardenDescending = w => w?.phase === 'descent';

function legFloorClearance(w, leg) {
    const rootY = w.parts.group.position.y;
    const hipY = leg.hip.position.y;
    const hipA = leg.hip.rotation.z;
    const upperA = hipA + leg.upper.rotation.z;
    const atY = (baseY, angle, x, y) => baseY + Math.sin(angle) * x + Math.cos(angle) * y;
    const boxMin = (baseY, angle, x, y, hx, hy, localRz = 0) => {
        const a = angle + localRz;
        return atY(baseY, angle, x, y) - Math.abs(Math.sin(a) * hx)
            - Math.abs(Math.cos(a) * hy);
    };
    let low = hipY - 5.2;
    low = Math.min(low, boxMin(hipY, upperA, 14, -1, 14, 3.5));
    low = Math.min(low, boxMin(hipY, upperA, 11, 3.6, 9, 1, -.08));
    for (let k = 0; k < 3; k++)
        low = Math.min(low, boxMin(hipY, upperA, 7 + k * 7, -1, 1, 4));
    const kneeY = atY(hipY, upperA, 28, -3);
    low = Math.min(low, kneeY - 5);
    const lowerA = upperA + leg.lower.rotation.z;
    low = Math.min(low, boxMin(kneeY, lowerA, 12, LEG_POSE.lowerBodyY, 12, 3));
    low = Math.min(low, boxMin(kneeY, lowerA, 10, 2.7, 8, 1, -.05));
    const footY = atY(kneeY, lowerA, 24, -2);
    const footA = lowerA + leg.foot.rotation.z;
    low = Math.min(low, boxMin(footY, footA, 4, LEG_POSE.footBodyY, 8.5, 2.5));
    low = Math.min(low, boxMin(footY, footA, 10, LEG_POSE.toeY, 5.5, 1));
    return rootY + low;
}

export function nusantaraWardenDebug(w) {
    if (!w) return { built: false };
    const target = q => {
        const p = targetWorld(w, q, new THREE.Vector3());
        return { index: q.index, hp: q.hp, maxHp: q.maxHp, alive: q.alive,
            exposed: q.exposed, x: p.x, y: p.y, z: p.z,
            hitFx: q.fx.hitT, hitFxVisible: q.fx.flash.visible,
            hitCount: q.fx.hits, hitRadius: q.hitShape.radius,
            hitLength: q.hitShape.maxX - q.hitShape.minX };
    };
    return {
        built: true, active: w.active, phase: w.phase, phaseT: w.phaseT,
        descent: { height: w.dropHeight || 0, sec: w.dropSec || 0,
            hoverSec: w.dropHover || 0, descending: w.phase === 'descent',
            hovering: w.phase === 'descent' && w.phaseT < (w.dropHover || 0),
            landed: !!w.landed, y: w.parts.group.position.y },
        hp: w.hp, maxHp: w.maxHp, score: w.score, dead: w.dead,
        deathDone: w.deathDone, attackState: w.attackState,
        destruction: nusantaraWardenDeathDebug(w),
        attackIndex: w.attackIndex, jammed: nusantaraWardenIsJamming(w),
        position: { x: w.parts.group.position.x, y: w.parts.group.position.y,
            z: w.parts.group.position.z },
        envelope: nusantaraWardenEnvelope(),
        rig: { legs: w.parts.legs.length, shutters: w.parts.shutters.length,
            capacitors: w.parts.capacitors.length, couplings: w.parts.couplings.length,
            wreckUsesExistingParts: true, minFloorClearance: LEG_POSE.minFloorClearance,
            currentFloorClearance: Math.min(...w.parts.legs.map(q => legFloorClearance(w, q))),
            carrierNeverSinks: true, attackChargeVisible: w.parts.attackCharge.visible },
        capacitors: w.parts.capacitors.map(target), couplings: w.parts.couplings.map(target),
        pools: {
            rail: { size: w.rails.length, active: w.rails.filter(q => q.active).length },
            burst: { size: w.bursts.length, active: w.bursts.filter(q => q.active).length },
            sector: { size: w.sectors.length, active: w.sectors.filter(q => q.active).length },
            stomp: { size: w.stomps.length, active: w.stomps.filter(q => q.active).length },
        },
    };
}
