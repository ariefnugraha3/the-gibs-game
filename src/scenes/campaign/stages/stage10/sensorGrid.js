// Stage 10 Chapter 2 sensor network. Scan is tracking pressure, never a stealth fail.
// Every shell, marker, and footprint exists at world-build time; impacts only
// toggle pooled objects and reuse the shared queued explosion/light system.

import { CFG } from '../../../../core/config.js';
import { camera } from '../../../../core/renderer.js';
import { player, robots } from '../../../../core/state.js';
import { queueBoom } from '../../../../entities/robots.js';
import { PAL } from '../../../../world/palette.js';
import { mortarShell } from '../../../../entities/tank.js';
import { stage10ForestPlayerProtected, stage10ForestSegBlocked } from './forestWorld.js';

let parent = null;
let footprint = null;
let footprintMat = null;
let scanT = 0;
let exposure = 0;
let state = 'CLEAR';
let strikeCursor = 0;
let serial = 0;
let lastImpact = null;
let firstLockPending = false;
const strikes = [];

const up = new THREE.Vector3(0, 1, 0);
const velocity = new THREE.Vector3();

// Rentang sapuan = seluruh rute yang diberi wewenang (x paling barat -> paling
// timur). Diekspor lewat debug supaya uji asap bisa menghitung DWELL dari config
// (lebar pita / laju sapuan) alih-alih menghardcode angka.
const SWEEP_X0 = 359270, SWEEP_SPAN = 1130;

function C() { return CFG.campaign.stage10.chapter2.scan; }
// Laju sapuan: satu siklus = pergi + pulang sepanjang rentang.
function sweepSpeed() { return 2 * SWEEP_SPAN / Math.max(.1, C().cycleSec); }
// Lama seorang player DIAM berada di dalam pita saat pita melewatinya.
function dwellSec() { return 2 * C().safeRadius / Math.max(1e-6, sweepSpeed()); }
function A() { return CFG.campaign.stage10.chapter2.artillery; }

function ring(radius, color, opacity) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
        depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(new THREE.RingGeometry(radius * .72, radius, 28), mat);
    m.rotation.x = -Math.PI / 2; m.visible = false;
    return m;
}

export function buildStage10ForestSensorGrid(root) {
    if (parent) return;
    parent = root;
    footprintMat = new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
        opacity: .16, depthWrite: false, toneMapped: false });
    // Lebar pita yang TERLIHAT = lebar pita yang DIUJI (2 x safeRadius): kalau
    // keduanya berbeda, player berlindung dari sesuatu yang tak sesuai gambar.
    footprint = new THREE.Mesh(new THREE.PlaneGeometry(C().safeRadius * 2, 1420), footprintMat);
    footprint.rotation.x = -Math.PI / 2; footprint.position.y = .7;
    parent.add(footprint);
    for (let i = 0; i < Math.max(1, A().poolSize | 0); i++) {
        const shell = mortarShell(); shell.visible = false; parent.add(shell);
        const marker = ring(A().blastRadius, PAL.hazard, .42); parent.add(marker);
        const lock = ring(A().blastRadius * .58, PAL.white, .75); parent.add(lock);
        strikes.push({ shell, marker, lock, active: false, t: 0, x: 0, z: 0,
            sx: 0, sy: 0, sz: 0, serial: 0 });
    }
}

export function resetStage10ForestSensorGrid() {
    scanT = 0; exposure = 0; state = 'CLEAR'; strikeCursor = 0; serial = 0;
    lastImpact = null; firstLockPending = false;
    if (footprint) footprint.visible = false;
    for (const s of strikes) {
        s.active = false; s.shell.visible = false; s.marker.visible = false;
        s.lock.visible = false; s.t = 0;
    }
}

export function clearStage10ForestStrikes() {
    exposure = 0; state = 'CLEAR';
    for (const s of strikes) {
        s.active = false; s.shell.visible = false; s.marker.visible = false;
        s.lock.visible = false;
    }
}

function sweepCenter() {
    const c = C();
    const cycle = Math.max(.1, c.cycleSec);
    const k = (scanT % cycle) / cycle;
    // Long triangular sweep crosses the whole authored route in both directions.
    const q = k < .5 ? k * 2 : (1 - k) * 2;
    return SWEEP_X0 + q * SWEEP_SPAN;
}

function playerInFootprint(cx) {
    return Math.abs(camera.position.x - cx) <= C().safeRadius
        && camera.position.z >= -420 && camera.position.z <= 420;
}

function scheduleStrike(x, z) {
    let s = null;
    for (let i = 0; i < strikes.length; i++) {
        const q = strikes[(strikeCursor + i) % strikes.length];
        if (!q.active) { s = q; strikeCursor = (strikeCursor + i + 1) % strikes.length; break; }
    }
    if (!s) return false;
    s.active = true; s.t = Math.max(.05, C().incomingSec); s.x = x; s.z = z;
    s.sx = x + 215; s.sy = 230; s.sz = z - 180; s.serial = ++serial;
    s.shell.position.set(s.sx, s.sy, s.sz); s.shell.visible = true;
    s.marker.position.set(x, .76, z); s.marker.visible = true;
    s.lock.position.set(x, .8, z); s.lock.visible = true;
    state = 'INCOMING'; firstLockPending = true;
    return true;
}

function robotBlastDamage(x, z) {
    const r = A().blastRadius;
    for (const bot of robots) {
        if (bot.stage !== 10) continue;
        if (Math.hypot(bot.mesh.position.x - x, bot.mesh.position.z - z) > r) continue;
        if (stage10ForestSegBlocked(x, z, bot.mesh.position.x, bot.mesh.position.z, false)) continue;
        bot.hp -= A().robotDamage;
    }
}

function impact(s) {
    // Shared explosion applies armor, dodge, death and visual-light pooling to
    // player. Robot damage is authored here so Stage 10 Chapter 2 artillery uses its own
    // config value and respects the same concrete LOS predicate.
    const playerBlocked = stage10ForestSegBlocked(s.x, s.z,
        camera.position.x, camera.position.z, false);
    queueBoom(s.x, 4, s.z, A().blastRadius, !playerBlocked, A().playerDamage, 0);
    robotBlastDamage(s.x, s.z);
    lastImpact = { serial: s.serial, x: s.x, z: s.z,
        radius: A().blastRadius, deadPoint: true, followedPlayer: false };
    s.active = false; s.shell.visible = false; s.marker.visible = false;
    s.lock.visible = false;
}

function updateStrikes(dt) {
    for (const s of strikes) {
        if (!s.active) continue;
        s.t -= dt;
        const duration = Math.max(.05, C().incomingSec);
        const k = 1 - Math.max(0, s.t) / duration;
        const arc = Math.sin(k * Math.PI) * 125;
        s.shell.position.set(s.sx + (s.x - s.sx) * k,
            s.sy + (4 - s.sy) * k + arc, s.sz + (s.z - s.sz) * k);
        velocity.set(s.x - s.sx, -s.sy, s.z - s.sz).normalize();
        s.shell.quaternion.setFromUnitVectors(up, velocity);
        s.marker.scale.setScalar(1 + Math.sin(scanT * 12 + s.serial) * .08);
        s.lock.scale.setScalar(.7 + k * .8);
        if (s.t <= 0) impact(s);
    }
    if (strikes.every(s => !s.active) && state === 'INCOMING') state = 'CLEAR';
}

export function updateStage10ForestSensorGrid(dt, enabled = true) {
    if (!parent) return;
    scanT += dt;
    const cx = sweepCenter();
    footprint.position.x = cx; footprint.position.z = 0;
    footprint.visible = enabled;
    if (enabled) {
        const protectedNow = stage10ForestPlayerProtected(camera.position.x, camera.position.z);
        const exposed = !protectedNow && playerInFootprint(cx);
        if (exposed) {
            state = 'SCANNING';
            exposure = Math.min(C().lockSec, exposure + dt);
            if (exposure >= C().lockSec && scheduleStrike(camera.position.x, camera.position.z))
                exposure = 0;
        } else {
            exposure = Math.max(0, exposure - dt * C().lockSec / Math.max(.05, C().decaySec));
            if (!strikes.some(s => s.active)) state = 'CLEAR';
        }
    } else {
        exposure = Math.max(0, exposure - dt * C().lockSec / Math.max(.05, C().decaySec));
        if (!strikes.some(s => s.active)) state = 'CLEAR';
    }
    updateStrikes(dt);
    if (footprintMat) footprintMat.opacity = .12 + .08 * (1 + Math.sin(scanT * 5)) / 2;
}

export function consumeStage10ForestFirstLock() {
    const v = firstLockPending; firstLockPending = false; return v;
}

export const stage10ForestScanDebug = () => ({
    state, scanT, exposure, exposureFraction: exposure / Math.max(.01, C().lockSec),
    sweep: { x0: SWEEP_X0, span: SWEEP_SPAN, speed: sweepSpeed(), dwellSec: dwellSec(),
        lockSec: C().lockSec },
    footprint: footprint && { x: footprint.position.x, z: footprint.position.z,
        halfWidth: C().safeRadius, visible: footprint.visible },
    playerProtected: stage10ForestPlayerProtected(camera.position.x, camera.position.z),
    frozenImpactPoints: strikes.filter(s => s.active).map(s => ({
        serial: s.serial, x: s.x, z: s.z, remainingSec: s.t })),
    lastImpact, pool: { size: strikes.length,
        active: strikes.reduce((n, s) => n + (s.active ? 1 : 0), 0) },
});

