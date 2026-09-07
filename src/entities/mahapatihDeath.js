// Final-frame destruction director. All FX and restore records are allocated
// with the boss. Flying debris is the real rig, never a replacement model.
import { CFG } from '../core/config.js';
import { addCamShake } from '../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../world/palette.js';
import { playSFX, sfxTankExplode, sfxTankBlast } from '../utils/sfx.js';

const tuning = () => CFG.campaign.bosses.mahapatih;
const sat = x => Math.max(0, Math.min(1, x));
const ease = x => { const k = sat(x); return k * k * (3 - 2 * k); };

function fxMesh(root, geometry, color, opacity = 0) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true,
        opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false;
    root.add(mesh); return mesh;
}

function record(node) {
    return { node, parent: node.parent, position: node.position.clone(),
        rotation: new THREE.Euler().copy(node.rotation), scale: node.scale.clone(),
        visible: node.visible, startPos: new THREE.Vector3(), startRot: new THREE.Euler(),
        launch: new THREE.Vector3(), launchRot: new THREE.Euler(), released: false,
        landed: false, launchAt: 0 };
}

export function buildMahapatihDeath(parts, parent) {
    const D = tuning().deathFx;
    const root = new THREE.Group(); root.name = 'Mahapatih-Destruction';
    parent.add(root); root.visible = false;
    const nodes = [parts.combat, parts.torso, parts.head, parts.shoulderCannon,
        ...parts.arms.map(a => a.shoulder), parts.shutterL, parts.shutterR,
        ...parts.legsCombat];
    const poses = nodes.map(record);
    const debris = poses.slice(2);
    const blasts = D.blastFractions.map((at, i) => ({ at, fired: false,
        flash: fxMesh(root, new THREE.IcosahedronGeometry(1, 1), i === 2 ? PAL.white : PAL.amber),
        ring: fxMesh(root, new THREE.RingGeometry(0.8, 1, 32), PAL.amber) }));
    for (const blast of blasts) blast.ring.rotation.x = -Math.PI / 2;
    const sparks = Array.from({ length: D.sparkCount }, () =>
        fxMesh(root, new THREE.BoxGeometry(0.7, 0.7, 3), PAL.amber));
    const smoke = Array.from({ length: D.smokeCount }, () =>
        fxMesh(root, new THREE.IcosahedronGeometry(1, 1), PAL.ink));
    const fires = Array.from({ length: D.fireCount }, () =>
        fxMesh(root, new THREE.ConeGeometry(1, 1, 7), PAL.amber));
    const coreGlow = fxMesh(parts.torso, new THREE.IcosahedronGeometry(1, 1), PAL.amber);
    coreGlow.position.copy(parts.core.position);
    const materials = Object.values(parts.materials).map(mat => ({ mat,
        color: mat.color.getHex(), emissive: mat.emissiveIntensity }));
    return { root, poses, debris, blasts, sparks, smoke, fires, coreGlow, materials,
        bounds: new THREE.Box3(), time: 0, impact: false, stage: 'idle',
        base: new THREE.Vector3(), yaw: 0, wreckX: -1, wreckZ: 0.2 };
}

export function resetMahapatihDeath(fx) {
    for (const r of fx.poses) {
        if (r.node.parent !== r.parent) r.parent.add(r.node);
        r.node.position.copy(r.position); r.node.rotation.copy(r.rotation);
        r.node.scale.copy(r.scale); r.node.visible = r.visible;
        r.released = r.landed = false; r.launchAt = 0;
    }
    for (const m of fx.materials) {
        m.mat.color.setHex(m.color);
        if (m.emissive != null) m.mat.emissiveIntensity = m.emissive;
    }
    for (const b of fx.blasts) { b.fired = false; b.flash.visible = b.ring.visible = false; }
    for (const list of [fx.sparks, fx.smoke, fx.fires]) for (const m of list) m.visible = false;
    fx.coreGlow.visible = fx.root.visible = false;
    fx.time = 0; fx.impact = false; fx.stage = 'idle';
}

export function warmMahapatihDeath(fx, visible) {
    fx.root.visible = visible;
    for (const b of fx.blasts) b.flash.visible = b.ring.visible = visible;
    for (const list of [fx.sparks, fx.smoke, fx.fires]) for (const m of list) m.visible = visible;
    fx.coreGlow.visible = visible;
}

export function beginMahapatihDeath(b, ctx) {
    const fx = b.deathFx, p = b.parts;
    fx.base.copy(p.group.position); fx.yaw = p.group.rotation.y;
    fx.wreckX = ctx.wreckDir?.x ?? -1; fx.wreckZ = ctx.wreckDir?.z ?? 0.2;
    fx.root.position.copy(p.group.position); fx.root.rotation.set(0, fx.yaw, 0);
    fx.root.scale.copy(p.group.scale); fx.root.visible = true;
    for (const r of fx.poses) {
        r.startPos.copy(r.node.position); r.startRot.copy(r.node.rotation);
    }
    fx.stage = 'overload'; fx.time = 0;
    updateMahapatihDeath(b, 0);
}

function poseAt(b, t) {
    const B = tuning(), D = B.deathFx, fx = b.deathFx, p = b.parts;
    const k = sat(t / B.deathSec), stagger = ease(k / D.ruptureFraction);
    const fall = ease((k - D.fallFraction) / (D.impactFraction - D.fallFraction));
    const settle = ease((k - D.impactFraction) / (1 - D.impactFraction));
    const shudder = Math.sin(t * 37) * Math.sin(t * 17) * (1 - fall) * stagger;
    const slide = D.slide * (fall * 0.75 + settle * 0.25);
    p.group.position.x = fx.base.x + fx.wreckX * slide;
    p.group.position.z = fx.base.z + fx.wreckZ * slide;
    // Independently buckling joints replace the former rigid whole-body tilt.
    for (let i = 0; i < fx.poses.length; i++) {
        const r = fx.poses[i]; if (r.released) continue;
        r.node.position.copy(r.startPos); r.node.rotation.copy(r.startRot);
        if (i === 0) {
            r.node.position.x += shudder * 1.5;
            r.node.rotation.y += shudder * 0.035;
        } else if (i === 1) {
            r.node.rotation.x += -stagger * 0.2 + fall * 0.52;
            r.node.rotation.z += shudder * 0.085 - fall * 1.48;
            r.node.rotation.y += Math.sin(t * 7) * stagger * (1 - fall) * 0.16;
        } else {
            const sign = i % 2 ? -1 : 1;
            r.node.rotation.x += stagger * (i >= 8 ? 0.7 * sign : i === 4 || i === 5 ? -1.6 : -0.65);
            r.node.rotation.z += stagger * sign * 0.3 + shudder * sign * 0.12;
        }
    }
    // Hidden FX still participate in THREE.Box3 bounds. Remove their size once
    // the core ruptures, BEFORE measuring support, so the previous frame's
    // flicker cannot lift/sink the wreck or make SKIP land differently.
    p.core.visible = fx.coreGlow.visible = k < D.ruptureFraction;
    p.core.scale.setScalar(p.core.visible ? 1 + stagger * 0.6 : 0);
    fx.coreGlow.scale.setScalar(fx.coreGlow.visible
        ? 4.5 + stagger * 5 + Math.sin(t * 26) * stagger : 0);
    fx.coreGlow.material.opacity = 0.2 + stagger * 0.55;
    // Once the limbs have torn free, the remaining torso falls onto its actual
    // drawn bounds. Measuring it avoids sinking a resized wreck through ground.
    if (fall > 0) {
        const r = fx.poses[0], sc = p.group.scale.y || 1;
        p.combat.position.y = 0;
        p.group.updateMatrixWorld(true);
        fx.bounds.setFromObject(p.combat);
        const ground = (0.12 - fx.bounds.min.y) / sc;
        p.combat.position.y = Math.max(ground, r.startPos.y * (1 - fall) + ground * fall
            + Math.sin(settle * Math.PI * 3) * (1 - settle) * 1.2);
    }
    p.materials.core.color.setHex(k < D.ruptureFraction ? PAL.white : PAL.ink);
    const char = ease((k - D.ruptureFraction) / (1 - D.ruptureFraction));
    for (const m of fx.materials) {
        if (m.mat === p.materials.core) continue;
        const r = (m.color >> 16) & 255, g = (m.color >> 8) & 255, bl = m.color & 255;
        const f = 1 - char * 0.78;
        m.mat.color.setRGB(r * f / 255, g * f / 255, bl * f / 255);
        if (m.emissive != null) m.mat.emissiveIntensity = Math.min(EMISSIVE_MAX, m.emissive) * (1 - char);
    }
}

function releasePart(b, r, at) {
    const fx = b.deathFx;
    // attach preserves the live world pose, including all parent rotations.
    fx.root.attach(r.node);
    r.launch.copy(r.node.position); r.launchRot.copy(r.node.rotation);
    r.launchAt = at; r.released = true;
}

function debrisAt(b, t) {
    const D = tuning().deathFx, fx = b.deathFx;
    for (let i = 0; i < fx.debris.length; i++) {
        const r = fx.debris[i]; if (!r.released) continue;
        const age = Math.max(0, t - r.launchAt), a = i * 2.39996;
        const travel = (1 - Math.exp(-D.drag * age)) / D.drag;
        const tumble = travel * (i % 2 ? -1 : 1);
        r.node.rotation.set(r.launchRot.x + tumble * (3 + i * 0.3),
            r.launchRot.y + tumble * 2.8, r.launchRot.z + tumble * 4.2);
        r.node.position.set(r.launch.x + Math.cos(a) * D.debrisSpeed * travel,
            0, r.launch.z + Math.sin(a) * D.debrisSpeed * travel);
        fx.bounds.setFromObject(r.node);
        const floor = (0.12 - fx.bounds.min.y) / (fx.root.scale.y || 1);
        const ballistic = r.launch.y + D.debrisLift * age - 0.5 * D.gravity * age * age;
        r.landed = ballistic <= floor;
        r.node.position.y = Math.max(floor, ballistic);
    }
}

function paintFx(b, t) {
    const B = tuning(), D = B.deathFx, fx = b.deathFx, k = sat(t / B.deathSec);
    const aftermath = sat((k - D.impactFraction) / (1 - D.impactFraction));
    const dx = b.parts.group.position.x - fx.base.x, dz = b.parts.group.position.z - fx.base.z;
    const impactX = (dx * Math.cos(fx.yaw) - dz * Math.sin(fx.yaw)) / fx.root.scale.x;
    const impactZ = (dx * Math.sin(fx.yaw) + dz * Math.cos(fx.yaw)) / fx.root.scale.z;
    for (let i = 0; i < fx.blasts.length; i++) {
        const blast = fx.blasts[i], age = t - blast.at * B.deathSec;
        const live = age >= 0 && age < D.blastSec;
        blast.flash.visible = blast.ring.visible = live;
        if (!live) continue;
        const u = sat(age / D.blastSec), last = i === fx.blasts.length - 1;
        const size = (last ? 45 : i === 2 ? 30 : 18) * (0.25 + u);
        blast.flash.position.set(last ? impactX : Math.sin(i * 3) * 9,
            last ? 5 : 25, last ? impactZ : Math.cos(i * 3) * 7);
        blast.flash.scale.setScalar(size * (1 - u * 0.6));
        blast.flash.material.opacity = (1 - u) ** 2 * 0.9;
        blast.ring.position.set(last ? impactX : 0, 0.4, last ? impactZ : 0);
        blast.ring.scale.setScalar(size * (1 + u));
        blast.ring.material.opacity = (1 - u) * 0.7;
    }
    const age = Math.max(0, t - D.ruptureFraction * B.deathSec);
    for (let i = 0; i < fx.sparks.length; i++) {
        const m = fx.sparks[i], a = i * 2.39996;
        m.visible = age > 0 && age < 2.2;
        m.position.set(Math.cos(a) * age * (18 + i % 7 * 4),
            Math.max(0.5, 28 + age * (20 + i % 5 * 7) - D.gravity * age * age * 0.5),
            Math.sin(a) * age * (18 + i % 7 * 4));
        m.rotation.set(age * 7, a, age * 11);
        m.material.opacity = Math.max(0, 1 - age / 2.2);
    }
    for (let i = 0; i < fx.smoke.length; i++) {
        const m = fx.smoke[i], localAge = Math.max(0, age - i * 0.055);
        m.visible = localAge > 0 && k < 1;
        m.position.set(Math.sin(i * 2.4) * (8 + localAge * 2),
            12 + localAge * (5 + i % 3), Math.cos(i * 2.4) * (8 + localAge * 2));
        m.scale.setScalar(3 + localAge * 2.1);
        m.material.opacity = Math.min(0.62, localAge) * (1 - aftermath);
    }
    for (let i = 0; i < fx.fires.length; i++) {
        const m = fx.fires[i], a = i * 2.4;
        m.visible = age > 0 && k < 1;
        const height = (14 + Math.sin(t * 17 + i) * 4) * (1 - aftermath * 0.65);
        m.position.set(impactX + Math.cos(a) * 12, height / 2 + 0.2, impactZ + Math.sin(a) * 9);
        m.scale.set(3.5, height, 3.5);
        m.material.opacity = 0.78 * (1 - aftermath);
    }
}

export function updateMahapatihDeath(b, dt) {
    const B = tuning(), D = B.deathFx, fx = b.deathFx;
    const t = Math.min(B.deathSec, fx.time + dt);
    // Evaluate each release at its authored instant even when a frame skips
    // several beats. Large dt and 60 fps must leave identical pieces of wreck.
    for (let i = 0; i < fx.debris.length; i++) {
        const r = fx.debris[i], at = B.deathSec * (D.ruptureFraction + i * D.partStaggerFraction);
        if (!r.released && t >= at) { poseAt(b, at); releasePart(b, r, at); }
    }
    poseAt(b, t); debrisAt(b, t); paintFx(b, t);
    for (let i = 0; i < fx.blasts.length; i++) {
        const blast = fx.blasts[i];
        if (!blast.fired && t >= blast.at * B.deathSec) {
            blast.fired = true;
            if (t - blast.at * B.deathSec < D.blastSec) {
                playSFX(i === 2 ? sfxTankExplode : sfxTankBlast, 0.85);
                addCamShake(i === fx.blasts.length - 1 ? D.impactShake : D.blastShake);
            }
        }
    }
    fx.time = b.deathT = t; fx.impact = t >= B.deathSec * D.impactFraction;
    fx.stage = t >= B.deathSec ? 'settled' : fx.impact ? 'aftermath'
        : t >= B.deathSec * D.fallFraction ? 'collapse'
            : t >= B.deathSec * D.ruptureFraction ? 'rupture' : 'overload';
    return t >= B.deathSec;
}

export function mahapatihDeathDebug(fx) {
    return { stage: fx.stage, time: fx.time, impact: fx.impact,
        blasts: fx.blasts.filter(b => b.fired).length,
        released: fx.debris.filter(r => r.released).length,
        landed: fx.debris.filter(r => r.landed).length,
        sparks: fx.sparks.filter(m => m.visible).length,
        smoke: fx.smoke.filter(m => m.visible).length,
        fires: fx.fires.filter(m => m.visible).length,
        fragments: fx.debris.map(r => ({ released: r.released, landed: r.landed,
            x: r.node.position.x, y: r.node.position.y, z: r.node.position.z })) };
}
