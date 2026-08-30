// Stage 11 Chapter 2 — the Warden's SUPPRESSION SWEEP.
//
// The boss you are about to fight is directly below this plaza, and it knows
// you are here.  A wall of light combs the segment you are locked in, back and
// forth, and standing in the open when it passes costs health.  This is what
// turns an empty ceremonial axis into a level: the colonnade, the planted cover
// and the pylons stop being scenery the moment the open ground is lethal.
//
// Three rules make it fair rather than merely punishing.
//
// (1) DWELL EXCEEDS LOCK, and it is derived, not hoped.  The band is a constant
//     LINEAR width travelling at a constant speed, so the time it takes to
//     cross a stationary player is exactly `2 * halfWidth / speed` everywhere on
//     the map, and that must be longer than `lockSec` or the mechanic silently
//     stops existing.  (An earlier Stage 11 scan band failed exactly this way:
//     it swept 1130 units in 3.5 s against a 28-unit half-width, so an exposed
//     player was inside it for 0.17 s against a 1.2 s lock.)  A rotating beam
//     was rejected for the same reason in reverse — its linear width grows with
//     distance, so it is undodgeable at the far end of a 1600-unit axis.
//
// (2) COVER IS THE ANSWER, and it is real geometry.  A blocker within
//     `coverShadowUnits` on the side the wall is coming FROM shields the player,
//     so every column and planter casts a readable shadow along the axis and
//     the safe spot flips when the wall turns around.
//
// (3) IT ONLY HUNTS THE PLAYER.  The Warden knows exactly who the intruder is;
//     making it damage its own garrison would turn it into a farming tool.

import { CFG } from '../../../../core/config.js';
import { camera, addCamShake } from '../../../../core/renderer.js';
import { showStageMsg } from '../../../../core/dom.js';
import { damagePlayerHp } from '../../../../entities/robots.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';

let built = false, world = null;
let band = null, warn = null;
let armed = false, warmT = 0, clock = 0;
let x = 0, dir = -1, holdT = 0, lockT = 0;
let exposedSec = 0, hits = 0, passes = 0, damageDealt = 0;
let announced = false, lastSafe = true;

function cfg() { return CFG.campaign.stage11.civicAxis.suppression; }

export function ensureStage11SurfaceScan(parent, api) {
    if (built) return band;
    built = true; world = api;
    const half = api.playHalfZ, mid = api.playMidZ;
    const g = new THREE.Group(); g.position.set(0, 0, mid); parent.add(g);
    const fieldMat = new THREE.MeshBasicMaterial({ color: PAL.hazard,
        transparent: true, opacity: .3, depthWrite: false, toneMapped: false });
    const edgeMat = new THREE.MeshLambertMaterial({ color: PAL.hazard,
        emissive: PAL.hazard, emissiveIntensity: EMISSIVE_MAX * .5,
        transparent: true, opacity: .85, depthWrite: false });
    const put = (geo, mat, px, py) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, 0); m.castShadow = false; m.receiveShadow = false;
        g.add(m); return m;
    };
    const W = cfg().halfWidthUnits;
    // The band is drawn at the exact width it tests at, so what is seen is what
    // hurts — the same "what is drawn is what hits" rule the projectiles follow.
    // Its floor slab is split to ride the terrace profile: one slab across the
    // flat plaza and one per raised bank, or the wall would vanish under the
    // high ground exactly where the player goes to use it as cover.
    const T = api.terrace;
    put(new THREE.BoxGeometry(W * 2, .6, T.inner * 2), fieldMat, 0, 2.6);
    for (const s of [-1, 1]) {
        const outer = half + api.playMidZ * s;
        const deep = Math.max(10, outer - T.plateau);
        const m = put(new THREE.BoxGeometry(W * 2, .6, deep), fieldMat, 0,
            T.top + 2.6);
        m.position.z = s * (T.plateau + deep * .5) - api.playMidZ;
        const rm = put(new THREE.BoxGeometry(W * 2, .6, T.plateau - T.inner),
            fieldMat, 0, T.top * .5 + 2.6);
        rm.position.z = s * (T.inner + T.plateau) * .5 - api.playMidZ;
    }
    // Edge pillars are tall enough to stand proud of the highest terrace, so
    // the wall reads as one continuous line across the whole corridor.
    for (const s of [-1, 1])
        put(new THREE.BoxGeometry(3, T.top + 26, half * 2), edgeMat, s * W,
            (T.top + 26) * .5);
    band = { group: g, fieldMat, edgeMat, halfWidth: W };

    // A thin leading marker rides ahead of the wall as its telegraph.
    const wg = new THREE.Group(); wg.position.set(0, 0, mid); parent.add(wg);
    const warnMat = new THREE.MeshBasicMaterial({ color: PAL.amber,
        transparent: true, opacity: .5, depthWrite: false, toneMapped: false });
    const wm = new THREE.Mesh(new THREE.BoxGeometry(3, .5, half * 2), warnMat);
    wm.position.y = 2.8; wg.add(wm);
    warn = { group: wg, mat: warnMat };
    api.count('suppression-sweep');
    return band;
}

export function resetStage11SurfaceScan() {
    armed = false; warmT = 0; clock = 0; holdT = 0; lockT = 0;
    exposedSec = 0; hits = 0; passes = 0; damageDealt = 0;
    announced = false; lastSafe = true; dir = -1;
    x = world ? world.playX1 : 0;
    if (band) { band.group.position.x = x; band.group.visible = false; }
    if (warn) { warn.group.position.x = x; warn.group.visible = false; }
}

export const stage11ScanBandX = () => x;
export const stage11ScanArmed = () => armed;
// Constant everywhere, because the band is a constant linear width at a
// constant speed. This is the number that must stay above `lockSec`.
export const stage11ScanDwellSec = () =>
    2 * cfg().halfWidthUnits / Math.max(1e-3, cfg().speedUnitsPerSec);

// Safe if a blocker stands between the player and the side the wall is coming
// from. The shadow has a fixed length so every piece of cover shields the same
// readable amount of ground.
export function stage11ScanSheltered(px, pz, fromDir = dir) {
    const reach = cfg().coverShadowUnits;
    return world.segBlocked(px, pz, px - fromDir * reach, pz);
}
export function stage11ScanExposed(px, pz) {
    if (!armed) return false;
    if (Math.abs(px - x) > cfg().halfWidthUnits) return false;
    return !stage11ScanSheltered(px, pz, dir);
}

export function updateStage11SurfaceScan(dt, context = {}) {
    const C = cfg();
    clock += dt;
    const live = !!context.live;
    if (!live) {
        if (band) band.group.visible = false;
        if (warn) warn.group.visible = false;
        lockT = 0; return;
    }
    if (!armed) {
        warmT += dt;
        if (warmT < Math.max(0, C.warmupSec)) return;
        armed = true;
        if (!announced) {
            announced = true;
            showStageMsg('WARDEN SUPPRESSION SWEEP — USE THE CIVIC COVER', 4600);
            addCamShake(3);
        }
    }
    const seg = context.segment || { x0: world.playX0, x1: world.playX1 };
    const lo = Math.min(seg.x0, seg.x1), hi = Math.max(seg.x0, seg.x1);
    if (x < lo) x = lo; if (x > hi) x = hi;
    // A beat at each end of the run: the wall visibly stops and reverses, which
    // is the player's cue to move rather than a direction change they must
    // guess at mid-stride.
    if (holdT > 0) holdT = Math.max(0, holdT - dt);
    else {
        x += dir * C.speedUnitsPerSec * dt;
        if (x <= lo) { x = lo; dir = 1; holdT = C.turnHoldSec; passes++; }
        else if (x >= hi) { x = hi; dir = -1; holdT = C.turnHoldSec; passes++; }
    }
    band.group.position.x = x; band.group.visible = true;
    warn.group.position.x = x - dir * (C.halfWidthUnits + 26);
    warn.group.visible = holdT <= 0;
    const pulse = .24 + Math.sin(clock * 6) * .06;
    band.fieldMat.opacity = pulse;
    warn.mat.opacity = .32 + Math.sin(clock * 9) * .12;

    const px = camera.position.x, pz = camera.position.z;
    const inside = Math.abs(px - x) <= C.halfWidthUnits;
    const safe = !inside || stage11ScanSheltered(px, pz, dir);
    lastSafe = safe;
    if (safe) { lockT = 0; return; }
    // The lock is what makes the wall survivable: being caught starts a timer,
    // and stepping into cover before it expires costs nothing at all.
    exposedSec += dt; lockT += dt;
    if (lockT < C.lockSec) return;
    const dmg = C.damagePerSec * dt;
    damageDealt += dmg; hits++;
    damagePlayerHp(dmg);
    if (Math.random() < dt * 6) addCamShake(1.6);
}

export const stage11SurfaceScanDebug = () => {
    const C = cfg();
    return {
        built, armed, configOwned: true, prebuilt: true,
        x, dir, holdT, lockT, passes, hits,
        damageDealt, exposedSec, safe: lastSafe,
        halfWidthUnits: C.halfWidthUnits, speedUnitsPerSec: C.speedUnitsPerSec,
        lockSec: C.lockSec, damagePerSec: C.damagePerSec,
        coverShadowUnits: C.coverShadowUnits, warmupSec: C.warmupSec,
        turnHoldSec: C.turnHoldSec,
        dwellSec: stage11ScanDwellSec(),
        // The whole mechanic is void unless this holds.
        dwellExceedsLock: stage11ScanDwellSec() > C.lockSec,
        drawnHalfWidth: band ? band.halfWidth : 0,
        visible: !!band?.group.visible,
        playerInside: Math.abs(camera.position.x - x) <= C.halfWidthUnits,
        playerSheltered: stage11ScanSheltered(camera.position.x,
            camera.position.z, dir),
    };
};
