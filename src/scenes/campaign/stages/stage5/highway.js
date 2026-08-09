// Stage 5 — JALAN RAYA PENDAMPING PERJALANAN (2026-08-08, permintaan user).
//
// Mulai gerbong ke-5 kereta musuh, sebuah jalan raya muncul di sisi KANAN
// kereta player (+z; arah perjalanan +x, dan dari kamera oblique sisi itu
// berada di bawah layar — berlawanan dengan jalur kereta musuh). Setiap
// beberapa saat sebuah pickup bersenjata menyusul di jalan itu membawa tiga
// robot, dan pickup itu HARUS ikut dihancurkan seperti pengangkut Stage 8.
//
// ATURAN KERAS DARI USER: "JANGAN BUAT JALAN TIBA-TIBA MUNCUL — BUAT SEOLAH-
// OLAH JALAN REL KERETA MENDEKAT KE JALAN SECARA WAJAR."
// Karena itu jalannya TIDAK pernah dinyalakan tepat di samping kereta. Yang
// dianimasikan adalah KURVA PENYATUAN `roadOffsetAt(worldX)`: jarak lateral
// jalan dihitung per KOORDINAT TEMPUH, jadi pada satu waktu modul jalan yang
// ada DI DEPAN player sudah lebih dekat ke rel daripada modul di belakangnya —
// yang terlihat adalah jalan yang menikung masuk menyatu dengan rel, bukan
// bidang jalan yang digeser ke samping. Seluruh bagian kurva yang masih jauh
// berada di luar tapak pandang kamera (tepi +z yang terlihat hanya ~118 unit),
// sehingga jalan benar-benar MASUK dari kejauhan.
//
// Pool mesh jalan + pickup dibangun sekali di world.js; modul ini hanya
// menggerakkannya dan tidak pernah mengalokasi apa pun saat runtime.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { player, robots } from '../../../../core/state.js';
import { camera, addCamShake, groundViewExtents } from '../../../../core/renderer.js';
import { showStageMsg } from '../../../../core/dom.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { currentWeapon } from '../../../../entities/weapons.js';
import {
    resetEnemyPickupVisual, updateEnemyPickupVisual, enemyPickupPassengerWorld,
    enemyPickupDebug,
} from '../../../../entities/enemyPickup.js';
import { explodeAt } from '../../../../entities/effects.js';
import { spawnGibs } from '../../../../entities/gore.js';
import { PAL } from '../../../../world/palette.js';
import { playSFX, sfxTankExplode } from '../../../../utils/sfx.js';
import {
    updateJourneyHighway, resetJourneyHighway, setJourneyForeground,
} from '../../../../entities/train.js';
import {
    TRAIN_BASE_X, TRAIN_CENTER_Z, TRAIN_X0, TRAIN_X1,
    journey, highway, highwayPickups, highwayLaneOffset, HIGHWAY_HALF_W, HIGHWAY_LANES,
} from './world.js';
import { spawnOne, trainSpeed, etrain } from './runtime.js';

const hwCfg = () => CFG.campaign.stage5.highway || {};
const smoothK = k => k * k * (3 - 2 * k);
const _mount = new THREE.Vector3();

let active = false, travel = 0, startTravel = 0;
let spawnT = 0, spawned = 0, destroyed = 0, announced = false;

export function resetHighway() {
    active = false; travel = 0; startTravel = 0;
    spawnT = 0; spawned = 0; destroyed = 0; announced = false;
    setJourneyForeground(journey, true);
    resetJourneyHighway(highway);
    for (const p of highwayPickups) resetEnemyPickupVisual(p);
}

export const highwayActive = () => active;
export const highwayCarsDestroyed = () => destroyed;

// Jarak penyatuan dalam UNIT TEMPUH, bukan detik: kurva harus sama bentuknya
// berapa pun `trainSpeed` di-retune.
const mergeDistance = () =>
    Math.max(1, (hwCfg().approachSec ?? 18) * Math.max(1, CFG.campaign.stage5.trainSpeed));

// Jarak lateral jalan (relatif sumbu rel player) pada koordinat dunia `worldX`.
// `s` = seberapa jauh titik itu SUDAH dilewati kurva penyatuan; titik di depan
// player punya `s` lebih besar sehingga jalannya lebih dekat.
export function roadOffsetAt(worldX) {
    const C = hwCfg();
    const far = C.farZ ?? 300, near = C.nearZ ?? 72;
    if (!active) return far;
    const s = (travel - startTravel) + (worldX - TRAIN_BASE_X);
    const k = smoothK(Math.max(0, Math.min(1, s / mergeDistance())));
    return far + (near - far) * k;
}

// Sudah menyatu penuh di titik player? Pickup baru boleh masuk sesudah itu.
export const roadMerged = () => active
    && Math.abs(roadOffsetAt(TRAIN_BASE_X) - (hwCfg().nearZ ?? 72)) < 0.5;

// Perjalanan berakhir: jalan raya ditutup saat layar sudah hitam (pergantian
// sub-scene), bukan dihilangkan di depan mata player. Set kedatangan Bandung
// adalah bangunan statis dan tidak boleh berbagi ruang dengan pool jalan.
export function stopHighway() {
    active = false;
    setJourneyForeground(journey, true);
    resetJourneyHighway(highway);
    for (const p of highwayPickups) resetEnemyPickupVisual(p);
}

export function startHighway() {
    if (active) return false;
    active = true; startTravel = travel; spawnT = 0;
    // Pita depan sisi kamera DIPADAMKAN: jalan raya akan menyapu tepat melewati
    // z 84..96 saat merapat, jadi rumah/pohon di sana berakhir di tengah aspal
    // (laporan user 2026-08-09). Padamnya menjalar lewat wrap — tak ada yang
    // lenyap di depan mata.
    setJourneyForeground(journey, false);
    return true;
}

// --- Pengangkut jalan raya -------------------------------------------------
const freePickup = () => highwayPickups.find(p => !p.active);
export const activeHighwayPickups = () =>
    highwayPickups.filter(p => p.active && !p.wreck).length;

function pickupZ(p) {
    return TRAIN_CENTER_Z + roadOffsetAt(p.group.position.x) + highwayLaneOffset(p.lane);
}

function spawnHighwayPickup() {
    const p = freePickup();
    if (!p) return false;
    const C = hwCfg();
    resetEnemyPickupVisual(p);
    p.active = true; p.group.visible = true; p.eventIndex = spawned;
    p.lane = spawned % HIGHWAY_LANES;
    // Masuk dari BELAKANG di luar tapak pandang: jalan raya menyusul kereta,
    // tidak pernah lahir di depan mata player.
    const view = groundViewExtents(camera.position.y, 0);
    p.entryX = TRAIN_BASE_X + view.minX - (C.entryMargin ?? 200);
    const sameSide = activeHighwayPickups() - 1;
    p.targetX = TRAIN_BASE_X + (C.combatOffset ?? 34)
        + Math.max(0, sameSide) * (C.combatSpacing ?? 62);
    p.group.position.set(p.entryX, 0, TRAIN_CENTER_Z);
    p.group.position.z = pickupZ(p);
    p.group.rotation.y = 0;
    p.passengers = [];
    // KOMPOSISI SAAT MELAWAN MINI BOS LOKOMOTIF (2026-08-09, permintaan user
    // "sesekali datangkan juga robot yang menggunakan mobil, tapi cuma boleh ada
    // 2 robot kelas B"): pengangkut hanya membawa DUA penumpang, keduanya kelas
    // B. Di luar babak bos komposisinya tetap `loads` yang lama.
    const boss = etrain.mode === 'boss';
    const classes = boss ? (C.bossLoad || ['B', 'B'])
        : (C.loads || [['B', 'B', 'A']])[spawned % (C.loads || [1]).length];
    for (let i = 0; i < classes.length; i++) {
        const r = spawnOne(classes[i] || 'B', p.group.position.x, p.group.position.z,
            `hwpickup-${spawned}`);
        r.mounted = true; r.mountSlot = i; r.pickup = p; r.state = 'mounted';
        r.moving = false; r.aiming = true;
        r.range = (C.fireRangeMeters ?? 15) * CAMP_M;
        p.passengers.push(r);
    }
    spawned++;
    if (!announced) {
        announced = true;
        showStageMsg('ROAD CONVOY ALONGSIDE — DESTROY EVERY RIDER', 5000);
    }
    return true;
}

function destroyHighwayPickup(p) {
    if (p.wreck) return;
    p.wreck = true; p.wreckT = 0; destroyed++;
    _mount.set(p.group.position.x, 7, p.group.position.z);
    explodeAt(_mount, 0.1, 0, sfxTankExplode);
    spawnGibs(_mount.x, 7, _mount.z, 8, -1, 0, 1.5, PAL.gunmetal, 0.4);
    addCamShake(2.6); playSFX(sfxTankExplode, 0.55);
    // Player tak bisa turun dari gerbong, jadi bekalnya harus datang kepadanya.
    const w = player.owned && player.owned[currentWeapon] ? currentWeapon : 'rifle';
    spawnAmmoDrop(TRAIN_BASE_X - 12, TRAIN_CENTER_Z - 4, w, 1e9);
    if (destroyed % Math.max(1, hwCfg().medkitEveryPickups | 0) === 0)
        spawnMedkitDrop(TRAIN_BASE_X + 24, TRAIN_CENTER_Z + 4, 1e9);
}

function updatePickups(dt) {
    const C = hwCfg();
    for (const p of highwayPickups) {
        if (!p.active) continue;
        const living = p.passengers.filter(z => robots.includes(z));
        if (!p.wreck && living.length === 0) destroyHighwayPickup(p);
        if (p.wreck) {
            p.group.position.x -= trainSpeed * dt * 0.55;
            p.group.position.z = pickupZ(p);
            updateEnemyPickupVisual(p, dt, { active: true, wreck: true, speed: trainSpeed });
            if (p.wreckT >= (C.wreckSec ?? 2.6) || p.group.position.x < TRAIN_X0 - 600)
                resetEnemyPickupVisual(p);
            continue;
        }
        p.group.position.x += (p.targetX - p.group.position.x)
            * Math.min(1, dt * (C.approachRate ?? 0.55));
        p.group.position.z = pickupZ(p);
        updateEnemyPickupVisual(p, dt, { active: true, wreck: false, speed: trainSpeed });
    }
}

// `consistDone` = seluruh gerbong kereta musuh sudah hancur. Begitu itu terjadi
// gelombang jalan raya BERHENTI dikirim; yang tersisa tetap harus dihabiskan.
export function updateHighway(dt, consistDone) {
    travel += Math.max(0, trainSpeed) * dt;
    updateJourneyHighway(highway, dt, trainSpeed, active, roadOffsetAt);
    if (!active) return;
    updatePickups(dt);
    if (consistDone) return;
    const C = hwCfg();
    if (!roadMerged()) return;
    spawnT += dt;
    const gap = spawned === 0 ? (C.firstPickupSec ?? 6) : (C.pickupGapSec ?? 16);
    if (spawnT < gap) return;
    // Selama babak bos hanya SATU pengangkut boleh hidup, jadi jumlah robot
    // kelas B dari jalan raya tak pernah melewati dua.
    const cap = etrain.mode === 'boss'
        ? Math.max(1, C.bossMaxActive | 0) : Math.max(1, C.maxActivePickups | 0);
    if (activeHighwayPickups() >= cap || !freePickup()) return;
    if (spawnHighwayPickup()) spawnT = 0;
}

// Jalan raya sudah bersih? Dipakai gerbang kedatangan Bandung.
export const highwayClear = () => !active || activeHighwayPickups() === 0;

// AI penumpang pickup: identik kontraknya dengan Stage 8 — menempel di anchor
// bak, menghadap player, dan `chaseDist` hanya sebagai gerbang tembak.
export function highwayRobotAI(z) {
    if (!z.pickup || !z.pickup.active || z.pickup.wreck) { z.mesh.visible = false; return { skip: true }; }
    enemyPickupPassengerWorld(z.pickup, z.mountSlot, _mount);
    z.mesh.visible = true;
    z.mesh.position.copy(_mount); z.groundY = _mount.y; z.baseY = _mount.y;
    z.state = 'mounted'; z.moving = false; z.aiming = true; z.losOK = true;
    const dx = camera.position.x - z.mesh.position.x, dz = camera.position.z - z.mesh.position.z;
    z.mesh.rotation.y = Math.atan2(dx, dz);
    return { chaseDist: Math.hypot(dx, dz) };
}

export function snapHighwayRobot(z) {
    if (!z.pickup) return;
    enemyPickupPassengerWorld(z.pickup, z.mountSlot, _mount);
    z.mesh.position.copy(_mount); z.groundY = _mount.y; z.baseY = _mount.y;
}

export const highwayDebug = () => ({
    active, merged: roadMerged(), travel, startTravel,
    offsetAtPlayer: roadOffsetAt(TRAIN_BASE_X),
    offsetAhead: roadOffsetAt(TRAIN_X1 + 260),
    offsetBehind: roadOffsetAt(TRAIN_X0 - 260),
    nearZ: hwCfg().nearZ ?? 72, farZ: hwCfg().farZ ?? 300,
    mergeDistance: mergeDistance(),
    spawned, destroyed, spawnT,
    activePickups: activeHighwayPickups(),
    riders: robots.filter(z => z.stage === 5 && z.pickup).length,
    halfWidth: HIGHWAY_HALF_W, lanes: HIGHWAY_LANES,
    pickups: highwayPickups.map(enemyPickupDebug),
});
