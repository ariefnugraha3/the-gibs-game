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
        shield: new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
            opacity: .26, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
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
        capacitors, couplings, materials: M };
}

function makeRailPool(parent) {
    const out = [];
    for (let i = 0; i < C().rail.poolSize; i++) {
        const warning = new THREE.Mesh(new THREE.BoxGeometry(520, .18, C().rail.width),
            new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
                opacity: .42, depthWrite: false, toneMapped: false }));
        warning.visible = false; parent.add(warning);
        const shot = new THREE.Mesh(new THREE.BoxGeometry(34, 5, C().rail.width * .72),
            new THREE.MeshBasicMaterial({ color: PAL.white, toneMapped: false }));
        shot.visible = false; parent.add(shot);
        const trail = new THREE.Mesh(new THREE.BoxGeometry(58, 1.5, C().rail.width * .88),
            new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
                opacity: .5, depthWrite: false, toneMapped: false }));
        trail.visible = false; parent.add(trail);
        out.push({ warning, shot, trail, active: false, warned: false, t: 0,
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
    const angle = (Math.PI * 2 - C().sector.gapDeg * Math.PI / 180) / 3;
    for (let i = 0; i < C().sector.poolSize; i++) {
        const geo = new THREE.RingGeometry(12, C().sector.radius, 28, 1,
            -angle / 2, angle);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAL.hazard,
            transparent: true, opacity: .34, depthWrite: false, toneMapped: false,
            side: THREE.DoubleSide }));
        mesh.visible = false; parent.add(mesh);
        out.push({ mesh, active: false, angle: 0 });
    }
    return out;
}
function makeStompWarnings(parent) {
    const out = [];
    for (let i = 0; i < 6; i++) {
        const geo = new THREE.RingGeometry(C().stomp.radius * .68,
            C().stomp.radius, 26);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAL.hazard,
            transparent: true, opacity: .48, depthWrite: false, toneMapped: false }));
        mesh.visible = false; parent.add(mesh);
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
        r.active = r.warned = false;
        r.warning.visible = r.shot.visible = r.trail.visible = false;
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
    w.dropHeight = 0; w.dropSec = 0; w.dropHover = 0; w.landed = false;
    w.awarded = false; w.jamSerial = 0; w.callbacks = opts.callbacks || {};
    w.arena = opts.arena || w.arena || { x: opts.x || 0, z: opts.z || 0, radius: 280 };
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
    const front = w.parts.group.rotation.y + Math.PI;
    return Math.abs(wrap(hitAngle - front)) <= cfg.shield.arcDeg * Math.PI / 360;
}

export function damageNusantaraWarden(w, damage, impact = {}) {
    if (!w?.active || w.dead || ['dormant', 'descent', 'reveal'].includes(w.phase)) return false;
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
    r.warned = false; r.warning.visible = false;
    r.shot.visible = r.trail.visible = true;
    r.shot.position.set(r.sx, 12, r.sz); r.shot.rotation.y = -Math.atan2(r.dz, r.dx);
    r.trail.position.set(r.sx - r.dx * 30, 8, r.sz - r.dz * 30);
    r.trail.rotation.y = r.shot.rotation.y;
}
function updateRails(w, dt) {
    for (const r of w.rails) if (r.active) {
        if (r.warned) {
            r.t -= dt;
            r.warning.material.opacity = .34 + .26 * (1 + Math.sin(w.animT * 17)) / 2;
            if (r.t <= 0) fireRail(r);
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
        // Geometry already lies on XZ; yaw is around world-up.
        s.mesh.rotation.y = -s.angle;
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
function animateTelegraphs(w) {
    const pulse = (1 + Math.sin(w.animT * 13)) / 2;
    if (w.attackState === 'stompTelegraph') {
        for (const s of w.stomps) if (s.active) {
            s.mesh.scale.setScalar(.92 + pulse * .12);
            s.mesh.material.opacity = .4 + pulse * .28;
        }
    } else if (w.attackState === 'sectorTelegraph') {
        for (const s of w.sectors) if (s.active) {
            s.mesh.scale.setScalar(.96 + pulse * .06);
            s.mesh.material.opacity = .28 + pulse * .24;
        }
    }
}
function updateAttackState(w, dt, allow) {
    updateRails(w, dt); updateBursts(w, dt); animateTelegraphs(w);
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
        leg.upper.rotation.z += ((jamAnchor ? LEG_POSE.jamUpper
            : leg.baseUpper + step * LEG_POSE.walkUpper)
            - leg.upper.rotation.z) * Math.min(1, dt * 7);
        leg.lower.rotation.z += ((jamAnchor ? LEG_POSE.jamLower
            : leg.baseLower - step * LEG_POSE.walkLower)
            - leg.lower.rotation.z) * Math.min(1, dt * 7);
        leg.foot.rotation.z = jamAnchor ? 0 : step * .04;
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
    const charging = w.attackState.endsWith('Telegraph')
        || w.attackState === 'burstFire';
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
    explodeAt(new THREE.Vector3(w.parts.group.position.x, 22,
        w.parts.group.position.z), 26, 0);
    w.callbacks.onDeath?.(w);
}
function updateDeath(w, dt) {
    w.phaseT += dt; const k = Math.min(1, w.phaseT / Math.max(.1, C().deathSec));
    const p = w.parts;
    // Collapse individual assemblies, never the carrier. Tilting/sinking the
    // whole six-legged rig pushed the far legs through the arena floor.
    p.group.rotation.z = 0; p.group.position.y = 0;
    p.coreRig.position.y = 29 - 7 * k; p.coreRig.rotation.z = -.38 * k;
    p.coreRig.rotation.y += dt * (2.5 * (1 - k));
    p.core.material.emissiveIntensity = EMISSIVE_MAX * .7 * (1 - k);
    p.shield.visible = false;
    for (let i = 0; i < p.legs.length; i++) {
        const leg = p.legs[i];
        leg.hip.rotation.z = 0;
        const upperTarget = leg.baseUpper + (i % 2 ? .06 : -.05) * k;
        const lowerTarget = leg.baseLower + (i % 2 ? -.04 : .08) * k;
        leg.upper.rotation.z += (upperTarget - leg.upper.rotation.z)
            * Math.min(1, dt * 4);
        leg.lower.rotation.z += (lowerTarget - leg.lower.rotation.z)
            * Math.min(1, dt * 4);
        leg.foot.rotation.z += (((i % 2 ? 1 : -1) * .03 * k)
            - leg.foot.rotation.z) * Math.min(1, dt * 4);
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
        p.group.position.y = 0; p.core.material.emissiveIntensity = 0;
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
    updateMovement(w, dt, ctx); updateAttackState(w, dt, ctx.allowAttack !== false);
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
    && !['dormant', 'descent', 'reveal'].includes(w.phase);
export const nusantaraWardenDescending = w => w?.phase === 'descent';

function legFloorClearance(w, leg) {
    const rootY = w.parts.group.position.y;
    const hipY = LEG_POSE.hipY;
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
