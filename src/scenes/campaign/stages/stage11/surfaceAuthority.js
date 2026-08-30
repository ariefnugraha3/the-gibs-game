// Stage 11 Chapter 2 — the three AUTHORITY PYLONS that seal root access, and
// the civic lockdown that closes the axis behind the player.
//
// The chapter used to be one straight lane: clear a batch, walk 240 units,
// clear the next, five times over, with the final batch containing a single
// robot.  These pylons replace that with a route: each one stands off the
// centre line on alternating sides, each is defended by one whole configured
// `encounters.civicAxis` formation, and the descent iris stays shut until all
// three are down — so the last thing fought before the Warden is a defended
// objective rather than a stray class C.
//
// Every rig, curtain and material is built with the world; destroying a pylon
// and raising a curtain only change transforms and colours.

import { CFG } from '../../../../core/config.js';
import { camera, addCamShake } from '../../../../core/renderer.js';
import { showStageMsg } from '../../../../core/dom.js';
import { robots, player, stats } from '../../../../core/state.js';
import { explodeAt, spawnGroundPuff, spawnBloodBurst } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import { segPointDist2 } from '../../../../utils/math.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';

const PYLON_TOP = 62, PYLON_BASE_R = 13;
// A curtain is parked far below the opaque civic slab rather than hidden, so
// its materials have been drawn since the first frame (the Stage 3 deploy rule)
// and raising one can never trigger a shader recompile.
const CURTAIN_STOW = -78, CURTAIN_H = 52;
const CHAR = Object.freeze({ body: PAL.rubber, trim: PAL.ink, ember: PAL.amberDim });

let built = false, root = null, world = null;
const pylons = [], curtains = [];
let lockdownX = 0, activeIndex = 0, destroyed = 0;

function cfg() { return CFG.campaign.stage11.civicAxis; }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

// --- build -------------------------------------------------------------------

function buildPylonRig(parent, spec, index, M) {
    const g = new THREE.Group();
    g.position.set(spec.x, 0, spec.z); parent.add(g);
    const put = (geo, mat, y, r = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y; if (r) m.rotation.y = r;
        m.castShadow = false; m.receiveShadow = false; g.add(m); return m;
    };
    put(new THREE.CylinderGeometry(PYLON_BASE_R, PYLON_BASE_R + 3, 6, 12), M.plinth, 3);
    put(new THREE.CylinderGeometry(9, 11, 5, 12), M.plinth, 8);
    put(new THREE.BoxGeometry(11, PYLON_TOP - 18, 11), M.shaft, (PYLON_TOP - 18) / 2 + 10,
        index * .4);
    // The exposed core is the only thing that reads as a weak point from the
    // top-down camera, so it sits proud of the shaft at eye-catching height.
    const core = put(new THREE.CylinderGeometry(6.4, 6.4, 15, 10), M.core, 30);
    for (const side of [-1, 1]) {
        const collar = new THREE.Mesh(new THREE.BoxGeometry(4, 20, 15), M.collar);
        collar.position.set(side * 8.5, 30, 0); g.add(collar);
    }
    put(new THREE.TorusGeometry(12, 2.2, 6, 18), M.ring, 46, 0).rotation.x = Math.PI / 2;
    put(new THREE.ConeGeometry(9, 14, 8), M.crown, PYLON_TOP - 4);
    const beacon = put(new THREE.SphereGeometry(3.4, 8, 6), M.beacon, PYLON_TOP + 4);
    return { group: g, core, beacon };
}

function buildCurtain(parent, index, M) {
    const g = new THREE.Group();
    g.position.set(0, CURTAIN_STOW, 0); parent.add(g);
    const put = (geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false;
        g.add(m); return m;
    };
    const half = world.playHalfZ, mid = world.playMidZ;
    put(new THREE.BoxGeometry(7, 8, half * 2 + 20), M.curtainSill, 0, 3, mid);
    put(new THREE.BoxGeometry(4, CURTAIN_H, half * 2 + 12), M.curtainField, 0,
        CURTAIN_H / 2 + 6, mid);
    for (let i = -3; i <= 3; i++)
        put(new THREE.BoxGeometry(6, CURTAIN_H + 8, 5), M.curtainRib, 0,
            CURTAIN_H / 2 + 6, mid + i * (half / 3.2));
    put(new THREE.BoxGeometry(8, 5, half * 2 + 20), M.curtainSill, 0,
        CURTAIN_H + 8, mid);
    return { group: g, index, x: 0, raised: false, t: 0 };
}

export function ensureStage11SurfaceAuthority(parent, api) {
    if (built) return pylons;
    built = true; root = parent; world = api;
    const M = {
        plinth: new THREE.MeshLambertMaterial({ color: PAL.concrete, flatShading: true }),
        shaft: new THREE.MeshLambertMaterial({ color: PAL.panel, flatShading: true }),
        collar: new THREE.MeshLambertMaterial({ color: PAL.gunmetal, flatShading: true }),
        ring: new THREE.MeshLambertMaterial({ color: PAL.steel, flatShading: true }),
        crown: new THREE.MeshLambertMaterial({ color: PAL.gunmetal, flatShading: true }),
    };
    for (const [i, spec] of cfg().pylons.entries()) {
        // Core and beacon get their OWN material instance per pylon: one shared
        // instance would char every pylon in the plaza the moment one fell.
        const core = new THREE.MeshLambertMaterial({ color: PAL.techDim,
            emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * .5, flatShading: true });
        const beacon = new THREE.MeshLambertMaterial({ color: PAL.amber,
            emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * .55 });
        const rig = buildPylonRig(parent, spec, i, { ...M, core, beacon });
        api.blocker(spec.x, spec.z, PYLON_BASE_R, PYLON_BASE_R, PYLON_TOP,
            0, 'authority-pylon');
        pylons.push({ index: i, x: spec.x, z: spec.z, rig,
            coreMat: core, beaconMat: beacon,
            hp: 0, alive: true, hitT: 0, wreckT: 0 });
    }
    const CM = {
        curtainSill: new THREE.MeshLambertMaterial({ color: PAL.gunmetal, flatShading: true }),
        curtainRib: new THREE.MeshLambertMaterial({ color: PAL.panel, flatShading: true }),
        curtainField: new THREE.MeshLambertMaterial({ color: PAL.hazard,
            emissive: PAL.hazard, emissiveIntensity: EMISSIVE_MAX * .45,
            transparent: true, opacity: .5, depthWrite: false }),
    };
    for (let i = 0; i < pylons.length; i++)
        curtains.push(buildCurtain(parent, i, CM));
    api.count('authority-pylon', pylons.length);
    api.count('civic-lockdown-curtain', curtains.length);
    return pylons;
}

// --- state -------------------------------------------------------------------

export function resetStage11SurfaceAuthority() {
    activeIndex = 0; destroyed = 0; lockdownX = world.playX1;
    for (const p of pylons) {
        p.hp = cfg().pylonHp; p.alive = true; p.hitT = 0; p.wreckT = 0;
        p.rig.group.rotation.set(0, 0, 0); p.rig.group.position.set(p.x, 0, p.z);
        p.coreMat.color.setHex(PAL.techDim); p.coreMat.emissive.setHex(PAL.tech);
        p.beaconMat.color.setHex(PAL.amber); p.beaconMat.emissive.setHex(PAL.amber);
    }
    for (const c of curtains) {
        c.raised = false; c.t = 0; c.x = 0;
        c.group.position.set(0, CURTAIN_STOW, 0);
    }
}

export const stage11AuthorityLockdownX = () => lockdownX;
export const stage11AuthorityTarget = () =>
    pylons.find(p => p.alive) || null;
export const stage11AuthorityAllDown = () =>
    pylons.length > 0 && pylons.every(p => !p.alive);
export const stage11AuthorityIndex = () => activeIndex;

// The suppression sweep works the segment the player is actually locked in:
// from the closed curtain behind to just beyond the next objective ahead.
export function stage11AuthoritySegment() {
    const target = stage11AuthorityTarget();
    const aheadX = target
        ? (pylons[target.index + 1]?.x ?? world.descentX)
        : world.descentX;
    return { x0: aheadX - 80, x1: lockdownX };
}

function raiseCurtain(index) {
    const c = curtains[index];
    if (!c || c.raised) return;
    c.raised = true; c.t = 0; c.x = lockdownX;
    c.group.position.x = c.x;
}

function destroyPylon(p) {
    if (!p.alive) return;
    p.alive = false; p.hp = 0; p.hitT = 0; p.wreckT = 0; destroyed++;
    p.coreMat.color.setHex(CHAR.trim); p.coreMat.emissive.setHex(CHAR.ember);
    p.beaconMat.color.setHex(CHAR.body); p.beaconMat.emissive.setHex(CHAR.ember);
    explodeAt(new THREE.Vector3(p.x, PYLON_TOP * .55, p.z), 38, 1);
    spawnGibs(p.x, PYLON_TOP * .6, p.z, 16, -1, 0, 2.8, PAL.panel, .4, PAL.ink);
    spawnBloodDecal(p.x, p.z, 9, PAL.ink); addCamShake(10);
    // The axis seals behind the player only once an objective is actually down,
    // so the closing wall always reads as a consequence, never as a timer.
    lockdownX = Math.min(lockdownX, p.x + cfg().lockdown.trailUnits);
    raiseCurtain(p.index);
    activeIndex = Math.min(pylons.length - 1, p.index + 1);
    const left = pylons.filter(x => x.alive).length;
    showStageMsg(left > 0
        ? `AUTHORITY PYLON DOWN — ${left} STILL HOLDING ROOT ACCESS`
        : 'ALL AUTHORITY PYLONS DOWN — ROOT ACCESS RELEASED', 4200);
}

export function stage11SurfacePylonBulletHit(b) {
    const r2 = cfg().pylonHitRadius ** 2;
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    for (const p of pylons) {
        if (!p.alive) continue;
        if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, p.x, 0, p.z) >= r2) continue;
        p.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage)
            * (b.explosive ? 1 : (player.dmgMul || 1));
        if (!b.explosive) {
            stats.hits++;
            spawnBloodBurst(bx, 30 + Math.random() * 6, bz, b.dir?.x || -1,
                b.dir?.z || 0, 3, .6, 1.4, PAL.tech);
        }
        p.hitT = 1;
        if (p.hp <= 0) destroyPylon(p);
        return true;
    }
    return false;
}

export function updateStage11SurfaceAuthority(dt, clock = 0) {
    const L = cfg().lockdown;
    for (const p of pylons) {
        if (p.alive) {
            p.hitT = Math.max(0, p.hitT - dt * 4.5);
            // A live pylon breathes; a hit flares its core so the weak point is
            // unmistakable without ever showing a health bar.
            const pulse = .5 + Math.sin(clock * 2.2 + p.index) * .12 + p.hitT * .38;
            p.coreMat.emissiveIntensity = Math.min(EMISSIVE_MAX, EMISSIVE_MAX * pulse);
            p.rig.beacon.position.y = PYLON_TOP + 4 + Math.sin(clock * 1.7 + p.index) * 1.4;
            continue;
        }
        p.wreckT += dt;
        const k = smooth(Math.min(1, p.wreckT * .7));
        p.rig.group.rotation.z = -.42 * k * (p.index % 2 ? 1 : -1);
        p.rig.group.position.y = -9 * k;
        p.coreMat.emissiveIntensity = EMISSIVE_MAX * .12 * (1 - k);
        p.beaconMat.emissiveIntensity = EMISSIVE_MAX * .1 * (1 - k);
    }
    for (const c of curtains) {
        if (!c.raised) continue;
        c.t = Math.min(L.closeSec, c.t + dt);
        c.group.position.x = c.x;
        c.group.position.y = CURTAIN_STOW
            + (0 - CURTAIN_STOW) * smooth(c.t / Math.max(.05, L.closeSec));
    }
}

export const stage11SurfaceAuthorityDebug = () => {
    const C = cfg();
    return {
        built, count: pylons.length, destroyed, configOwned: true, prebuilt: true,
        pylonHp: C.pylonHp, hitRadius: C.pylonHitRadius,
        lockdownX, lockdownTrailUnits: C.lockdown.trailUnits,
        activeIndex, allDown: stage11AuthorityAllDown(),
        target: stage11AuthorityTarget()?.index ?? null,
        segment: stage11AuthoritySegment(),
        pylons: pylons.map(p => ({
            index: p.index, x: p.x, z: p.z, hp: p.hp, alive: p.alive,
            hitT: p.hitT, tiltZ: p.rig.group.rotation.z,
            sunkY: p.rig.group.position.y,
            coreHex: p.coreMat.color.getHex(),
            charred: p.coreMat.color.getHex() === CHAR.trim,
        })),
        curtains: curtains.map(c => ({
            index: c.index, raised: c.raised, x: c.x,
            y: c.group.position.y, stowY: CURTAIN_STOW,
        })),
    };
};
