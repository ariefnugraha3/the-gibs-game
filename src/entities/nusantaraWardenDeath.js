// Pecahan memakai rakitan asli; seluruh pose mengikuti waktu absolut.
import { CFG } from '../core/config.js';
import { addCamShake } from '../core/renderer.js';
import { PAL } from '../world/palette.js';
import { playSFX, sfxTankBlast, sfxTankExplode } from '../utils/sfx.js';

const tuning = () => CFG.campaign.bosses.warden;
const sat = x => Math.max(0, Math.min(1, x));
const ease = x => { const k = sat(x); return k * k * (3 - 2 * k); };

function record(node) {
    return { node, parent: node.parent, position: node.position.clone(),
        rotation: new THREE.Euler().copy(node.rotation), scale: node.scale.clone(),
        visible: node.visible, startPos: node.position.clone(),
        startRot: new THREE.Euler().copy(node.rotation), startScale: node.scale.clone(),
        launch: new THREE.Vector3(), launchRot: new THREE.Euler(),
        released: false, landed: false, launchAt: 0, landAge: Infinity };
}

function mesh(root, geometry, color) {
    const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color,
        transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide }));
    m.visible = false; root.add(m); return m;
}

export function buildNusantaraWardenDeath(w) {
    const D = tuning().deathFx, p = w.parts;
    const root = new THREE.Group(); root.name = 'Nusantara-Warden-Destruction';
    w.fxRoot.add(root); root.visible = false;
    const poses = [];
    p.group.traverse(node => poses.push(record(node)));
    const pose = node => poses.find(r => r.node === node);
    const debris = [...p.shutters, ...p.capacitors.map(q => q.rig),
        ...p.couplings.map(q => q.rig)].map(pose);
    const legs = p.legs.map(q => ({ hip: pose(q.hip), upper: pose(q.upper),
        lower: pose(q.lower), foot: pose(q.foot) }));
    const blasts = Array.from({ length: 5 }, (_, i) => ({ fired: false,
        flash: mesh(root, new THREE.IcosahedronGeometry(1, 1),
            i === 2 ? PAL.white : PAL.amber),
        ring: mesh(root, new THREE.RingGeometry(.82, 1, 32), PAL.amber) }));
    for (const b of blasts) b.ring.rotation.x = -Math.PI / 2;
    const sparkGeo = new THREE.BoxGeometry(.7, .7, 3);
    const smokeGeo = new THREE.IcosahedronGeometry(1, 1);
    const fireGeo = new THREE.ConeGeometry(1, 1, 7);
    const sparks = Array.from({ length: D.sparkCount }, () => mesh(root, sparkGeo, PAL.amber));
    const smoke = Array.from({ length: D.smokeCount }, () => mesh(root, smokeGeo, PAL.ink));
    const fires = Array.from({ length: D.fireCount }, () => mesh(root, fireGeo, PAL.amber));
    const glow = mesh(root, smokeGeo, PAL.white);
    const materials = Object.values(p.materials).map(mat => ({ mat,
        color: mat.color.getHex(), emissive: mat.emissiveIntensity,
        opacity: mat.opacity, startColor: mat.color.clone(), startEmissive: 0 }));
    w.deathFx = { root, poses, debris, legs, blasts, sparks, smoke, fires, glow,
        coreRig: pose(p.coreRig), core: pose(p.core), carrier: pose(p.group), materials,
        bounds: new THREE.Box3(), base: new THREE.Vector3(),
        time: 0, stage: 'idle', impact: false, active: false, groundY: 0 };
    return w.deathFx;
}

export function resetNusantaraWardenDeath(w) {
    const fx = w?.deathFx;
    if (!fx) return;
    for (const r of fx.poses) {
        if (r.node.parent !== r.parent) r.parent.add(r.node);
        r.node.position.copy(r.position); r.node.rotation.copy(r.rotation);
        r.node.scale.copy(r.scale); r.node.visible = r.visible;
        r.released = r.landed = false; r.launchAt = 0; r.landAge = Infinity;
    }
    for (const r of fx.materials) {
        r.mat.color.setHex(r.color); r.mat.opacity = r.opacity;
        if (r.emissive != null) r.mat.emissiveIntensity = r.emissive;
    }
    for (const b of fx.blasts) { b.fired = false; b.flash.visible = b.ring.visible = false; }
    for (const list of [fx.sparks, fx.smoke, fx.fires])
        for (const m of list) m.visible = false;
    fx.root.visible = fx.glow.visible = fx.active = fx.impact = false;
    fx.time = 0; fx.stage = 'idle';
}

export function beginNusantaraWardenDeath(w) {
    const fx = w.deathFx, p = w.parts;
    if (fx.active) return;
    for (const r of fx.poses) {
        r.startPos.copy(r.node.position); r.startRot.copy(r.node.rotation);
        r.startScale.copy(r.node.scale);
    }
    for (const r of fx.materials) {
        r.startColor.copy(r.mat.color); r.startEmissive = r.mat.emissiveIntensity || 0;
    }
    fx.base.copy(p.group.position);
    fx.groundY = w.groundY || 0;
    fx.root.position.copy(p.group.position); fx.root.rotation.copy(p.group.rotation);
    fx.root.scale.copy(p.group.scale); fx.root.visible = fx.active = true;
    fx.time = 0; fx.stage = 'overload';
    p.shield.visible = p.attackCharge.visible = false;
    p.attackCharge.scale.setScalar(0);
    for (const targets of [p.capacitors, p.couplings]) for (const q of targets) {
        for (const m of [q.fx.flash, q.fx.barBack, q.fx.barFill, ...q.fx.sparks]) {
            m.visible = false; m.scale.setScalar(0);
        }
    }
    updateNusantaraWardenDeath(w, 0);
}

function restoreStart(r) {
    r.node.position.copy(r.startPos); r.node.rotation.copy(r.startRot);
}

function floorSafe(fx, node, scale) {
    fx.bounds.setFromObject(node);
    if (fx.bounds.min.y < fx.groundY + .12)
        node.position.y += (fx.groundY + .12 - fx.bounds.min.y) / scale;
}

function poseAt(w, t) {
    const B = tuning(), D = B.deathFx, fx = w.deathFx, p = w.parts;
    const k = sat(t / B.deathSec), overload = ease(k / D.ruptureFraction);
    const fall = ease((k - D.collapseFraction) / (D.impactFraction - D.collapseFraction));
    const tremor = Math.sin(t * 39) * Math.sin(t * 17) * overload * (1 - fall);
    const settle = ease((k - D.impactFraction) / (1 - D.impactFraction));
    restoreStart(fx.carrier);
    restoreStart(fx.coreRig);
    p.coreRig.position.y += overload * 7 * (1 - fall) - fall * 12;
    p.coreRig.position.x -= fall * 16;
    p.coreRig.rotation.y += overload * .7 + tremor * .06;
    p.coreRig.rotation.z += tremor * .08 - fall * 1.05;
    p.coreRig.position.y += Math.sin(settle * Math.PI * 3) * (1 - settle) * 1.2;
    p.core.visible = k < D.ruptureFraction;
    p.core.scale.copy(fx.core.startScale).multiplyScalar(p.core.visible ? 1 + overload * .55 : 0);
    p.core.material.emissiveIntensity = p.core.visible ? .7 + overload * 2 : 0;
    for (let i = 0; i < fx.debris.length; i++) {
        const r = fx.debris[i];
        if (r.released) continue;
        restoreStart(r);
        if (i < p.shutters.length) {
            const a = i * Math.PI * 2 / p.shutters.length;
            r.node.position.x += Math.cos(a) * overload * 9;
            r.node.position.z += Math.sin(a) * overload * 9;
            r.node.rotation.z += Math.sin(a) * overload * .4;
        } else r.node.rotation.z += tremor * .08;
    }
    for (let i = 0; i < fx.legs.length; i++) {
        const leg = fx.legs[i], sign = i % 2 ? 1 : -1;
        restoreStart(leg.hip); restoreStart(leg.upper);
        restoreStart(leg.lower); restoreStart(leg.foot);
        const buckle = ease((k - D.collapseFraction - i * .018)
            / (D.impactFraction - D.collapseFraction));
        leg.hip.node.position.y -= buckle * 8;
        leg.hip.node.rotation.y += buckle * sign * .16;
        leg.upper.node.rotation.z += buckle * .16 + tremor * sign * .035;
        leg.lower.node.rotation.z -= buckle * .23;
        leg.foot.node.rotation.z += buckle * sign * .1;
        p.group.updateMatrixWorld(true);
        floorSafe(fx, leg.hip.node, p.group.scale.y || 1);
    }
    p.group.updateMatrixWorld(true);
    floorSafe(fx, p.coreRig, p.group.scale.y || 1);
    const char = ease((k - D.ruptureFraction) / (1 - D.ruptureFraction));
    for (const r of fx.materials) {
        r.mat.color.copy(r.startColor).multiplyScalar(1 - char * .76);
        if (r.emissive != null && r.mat !== p.core.material)
            r.mat.emissiveIntensity = r.startEmissive * (1 - char);
    }
}

function fragmentAt(w, r, i, age) {
    const D = tuning().deathFx, fx = w.deathFx;
    const drag = Math.max(.001, D.drag), travel = (1 - Math.exp(-drag * age)) / drag;
    const a = i * 2.399963, sign = i % 2 ? -1 : 1;
    r.node.rotation.set(r.launchRot.x + travel * sign * (3 + i * .17),
        r.launchRot.y + travel * 2.8, r.launchRot.z + travel * sign * 4.2);
    r.node.position.set(r.launch.x + Math.cos(a) * D.debrisSpeed * travel,
        r.launch.y + D.debrisLift * age - .5 * D.gravity * age * age,
        r.launch.z + Math.sin(a) * D.debrisSpeed * travel);
    fx.root.updateMatrixWorld(true); fx.bounds.setFromObject(r.node);
    return fx.bounds.min.y - fx.groundY - .12;
}

function release(w, r, i, at) {
    const fx = w.deathFx, B = tuning(), D = B.deathFx;
    fx.root.attach(r.node); r.launch.copy(r.node.position);
    r.launchRot.copy(r.node.rotation); r.released = true; r.launchAt = at;
    // Cari kontak pertama pada lintasan analitis, lalu bekukan pose saat mendarat.
    // Pencarian ini juga berjalan ketika SKIP melewati seluruh pelepasan.
    const horizon = Math.max(B.deathSec, 2 * D.debrisLift / Math.max(1, D.gravity) + 4);
    let low = 0, high = horizon;
    for (let step = 1; step <= 96; step++) {
        high = horizon * step / 96;
        if (fragmentAt(w, r, i, high) <= 0) break;
        low = high;
    }
    for (let step = 0; step < 24; step++) {
        const middle = (low + high) / 2;
        if (fragmentAt(w, r, i, middle) > 0) low = middle;
        else high = middle;
    }
    r.landAge = high;
}

function blastFraction(D, i) {
    return i === 0 ? D.ruptureFraction * .4 : i === 1 ? D.ruptureFraction * .8
        : i === 2 ? D.ruptureFraction : i === 3 ? D.collapseFraction : D.impactFraction;
}

function paintFx(w, t) {
    const B = tuning(), D = B.deathFx, fx = w.deathFx;
    const k = sat(t / B.deathSec), age = t - D.ruptureFraction * B.deathSec;
    const tail = 1 - ease((k - D.impactFraction) / (1 - D.impactFraction));
    fx.glow.visible = age < 0;
    fx.glow.position.set(w.parts.coreRig.position.x, w.parts.coreRig.position.y + 4, 0);
    fx.glow.scale.setScalar(9 + ease(k / D.ruptureFraction) * 10);
    fx.glow.material.opacity = .12 + ease(k / D.ruptureFraction) * .5;
    for (let i = 0; i < fx.blasts.length; i++) {
        const b = fx.blasts[i], beat = t - blastFraction(D, i) * B.deathSec;
        const u = sat(beat / D.blastSec), final = i === fx.blasts.length - 1;
        b.flash.visible = b.ring.visible = beat >= 0 && beat < D.blastSec && k < 1;
        if (!b.flash.visible) continue;
        const size = (i === 2 ? 38 : final ? 48 : 16) * (.2 + u);
        b.flash.position.set(final ? -16 : Math.sin(i * 3) * 12, final ? 8 : 33,
            Math.cos(i * 3) * 8);
        b.flash.scale.setScalar(size * (1 - u * .55));
        b.flash.material.opacity = (1 - u) ** 2 * .92;
        b.ring.position.set(0, w.hazardY, 0); b.ring.scale.setScalar(size * (1 + u));
        b.ring.material.opacity = (1 - u) * .6;
    }
    for (let i = 0; i < fx.sparks.length; i++) {
        const m = fx.sparks[i], a = i * 2.399963;
        m.visible = age > 0 && age < 2.2 && k < 1;
        if (!m.visible) continue;
        m.position.set(Math.cos(a) * age * (20 + i % 7 * 4),
            Math.max(.6, 37 + age * (20 + i % 5 * 7) - D.gravity * age * age * .5),
            Math.sin(a) * age * (20 + i % 7 * 4));
        m.rotation.set(age * 7, a, age * 11); m.material.opacity = 1 - age / 2.2;
    }
    for (let i = 0; i < fx.smoke.length; i++) {
        const m = fx.smoke[i], localAge = age - i * .07;
        m.visible = localAge > 0 && k < 1;
        if (!m.visible) continue;
        m.position.set(Math.sin(i * 2.4) * (10 + localAge * 2),
            16 + localAge * (4 + i % 3), Math.cos(i * 2.4) * (10 + localAge * 2));
        m.scale.setScalar(3 + localAge * 2.3);
        m.material.opacity = Math.min(.6, localAge) * tail;
    }
    for (let i = 0; i < fx.fires.length; i++) {
        const m = fx.fires[i], height = (13 + Math.sin(t * 17 + i) * 4) * tail;
        m.visible = age > 0 && k < 1;
        m.position.set(Math.cos(i * 2.4) * 18 - 8, height / 2 + .2, Math.sin(i * 2.4) * 16);
        m.scale.set(3, height, 3); m.material.opacity = .8 * tail;
    }
}

export function updateNusantaraWardenDeath(w, dt) {
    const B = tuning(), D = B.deathFx, fx = w.deathFx;
    if (!fx?.active) return false;
    const t = Math.min(B.deathSec, fx.time + Math.max(0, dt));
    for (let i = 0; i < fx.debris.length; i++) {
        const r = fx.debris[i], at = B.deathSec * (D.ruptureFraction + i * D.partStaggerFraction);
        if (!r.released && t >= at) { poseAt(w, at); release(w, r, i, at); }
    }
    poseAt(w, t);
    for (let i = 0; i < fx.debris.length; i++) {
        const r = fx.debris[i];
        if (!r.released) continue;
        const age = Math.max(0, t - r.launchAt);
        r.landed = age >= r.landAge;
        fragmentAt(w, r, i, Math.min(age, r.landAge));
        floorSafe(fx, r.node, fx.root.scale.y || 1);
    }
    paintFx(w, t);
    for (let i = 0; i < fx.blasts.length; i++) {
        const b = fx.blasts[i], at = blastFraction(D, i) * B.deathSec;
        if (b.fired || t < at) continue;
        b.fired = true;
        if (t - at < D.blastSec && t < B.deathSec) {
            playSFX(i === 2 ? sfxTankExplode : sfxTankBlast, .85);
            addCamShake(i === 4 ? D.impactShake : D.blastShake);
        }
    }
    fx.time = w.phaseT = t; fx.impact = t >= B.deathSec * D.impactFraction;
    fx.stage = t >= B.deathSec ? 'settled' : fx.impact ? 'aftermath'
        : t >= B.deathSec * D.collapseFraction ? 'collapse'
            : t >= B.deathSec * D.ruptureFraction ? 'rupture' : 'overload';
    return t >= B.deathSec;
}

export function nusantaraWardenDeathDebug(w) {
    const fx = w?.deathFx;
    if (!fx) return null;
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
