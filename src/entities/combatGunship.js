// N.U.S.A. combat gunship boss — entity BARU untuk Stage 8. Sengaja tidak
// memakai atau mengimpor entities/helicopter.js. HP/skor = `bosses.gunship.hp`
// / `.score` MILIKNYA SENDIRI (2026-08-09, permintaan user) — dulu HP-nya
// meminjam `bosses.tank.hp`, jadi meretune tank diam-diam meretune bos akhir.
//
// ROMBAK TOTAL BENTUK 2026-08-08 (permintaan user: "buat agar lebih bagus, lebih
// dramatis, lebih futuristis, lebih cinematic, dan lebih terlihat keren lagi").
// Versi lama adalah heli generik: bola yang di-scale jadi badan, empat bilah
// telanjang, boom kotak, dan turret bola kecil — siluetnya tidak terbaca sebagai
// BOSS AKHIR. Sekarang: lambung BERSUDUT (faceted, bukan bola), kanopi tandem
// bersudut, chin turret bergimbal dengan GATLING empat laras, sayap stub anhedral
// berpylon + pod rudal, sepasang nacelle mesin dengan exhaust menyala, ROTOR
// BERSELUBUNG (ducted) berbilah lima, dan ekor twin-boom dengan FENESTRON.
//
// TIGA aturan proyek yang membentuk desain ini:
//  1. Kamera oblique top-down: bos HARUS terbaca dari atas-belakang, jadi detail
//     ditumpuk di permukaan ATAS dan siluet dibuat lebar, bukan tinggi.
//  2. Tanpa PointLight (jumlah lampu stage harus tetap) — semua "cahaya" adalah
//     material emissive/Basic yang dianimasikan.
//  3. Lambung STATIS dilas `mergeObjectInPlace` saat dibangun: detailnya jauh
//     lebih kaya dari versi lama TAPI draw call-nya justru lebih sedikit, karena
//     hanya bagian yang benar-benar bergerak (rotor, fenestron, turret, gimbal
//     sensor, exhaust, flash) yang tetap berdiri sendiri.
//
// Hidung sengaja menghadap -X: bos melayang di DEPAN player (`bossX = PLAYER_X +
// 130`) dan menembak ke -X, jadi menghadap -X berarti ia benar-benar menatap
// player, dan shot masuk intro (x mengecil) menjadi terbang maju, bukan mundur.

import { CFG } from '../core/config.js';
import { scene, camera, addCamShake } from '../core/renderer.js';
import { bullets, enemyBullets, GEO, MAT, player, stats } from '../core/state.js';
import { queueBoom } from './robots.js';
import { explodeAt, spawnGroundPuff } from './effects.js';
import { spawnGibs } from './gore.js';
import { segPointDist2, clamp } from '../utils/math.js';
import { PAL, EMISSIVE_MAX } from '../world/palette.js';
import { mergeObjectInPlace } from '../utils/meshBatch.js';
import { makeTexture } from '../utils/textures.js';
import {
    playSFX, sfxTankMG, sfxTankMortar, sfxTankBlast,
    sfxRocketShot, sfxRocketExplode, sfxTankExplode,
} from '../utils/sfx.js';

function mk(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

export function buildCombatGunshipMissileMesh() {
    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const dark = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const hot = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });
    const tube = mk(g, new THREE.CylinderGeometry(0.44, 0.5, 4.0, 8), body, 0, 0, 0, 0, 0, Math.PI / 2);
    tube.castShadow = false;
    mk(g, new THREE.CylinderGeometry(0.52, 0.52, 0.5, 8), dark, 0.9, 0, 0, 0, 0, Math.PI / 2);
    mk(g, new THREE.ConeGeometry(0.46, 1.5, 6), body, 2.7, 0, 0, 0, 0, -Math.PI / 2);
    mk(g, new THREE.ConeGeometry(0.34, 0.9, 6), hot, -2.4, 0, 0, 0, 0, Math.PI / 2).castShadow = false;
    // Sirip kanard depan + sirip ekor: siluet rudal jelajah, bukan tabung polos.
    for (const a of [0, Math.PI / 2]) {
        mk(g, new THREE.BoxGeometry(0.7, 0.07, 1.35), body, -1.5, 0, 0, a, 0, 0);
        mk(g, new THREE.BoxGeometry(0.5, 0.06, 0.85), body, 1.45, 0, 0, a, 0, 0);
    }
    g.visible = false; return g;
}

export function buildCombatGunshipShellMesh() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: PAL.ink, emissive: PAL.amberDim, emissiveIntensity: 0.5 });
    const hot = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });
    mk(g, new THREE.CylinderGeometry(0.58, 0.66, 2.6, 8), mat, 0, 0, 0, 0, 0, Math.PI / 2);
    mk(g, new THREE.ConeGeometry(0.6, 1.3, 8), mat, 1.9, 0, 0, 0, 0, -Math.PI / 2);
    mk(g, new THREE.CylinderGeometry(0.34, 0.2, 0.9, 8), hot, -1.7, 0, 0, 0, 0, Math.PI / 2).castShadow = false;
    g.visible = false; return g;
}

// Tekstur koridor telegraph: chevron bahaya yang jauh lebih terbaca daripada
// kotak oranye polos, dan warnanya kembali ke token PAL (dulu hex mentah).
function telegraphTexture() {
    return makeTexture(256, 32, (g, w, h) => {
        g.fillStyle = 'rgba(179,64,46,0.55)'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(216,210,196,0.92)';
        for (let x = -h; x < w; x += 34) {
            g.beginPath();
            g.moveTo(x, 0); g.lineTo(x + 13, 0); g.lineTo(x + 13 + h, h); g.lineTo(x + h, h);
            g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(216,210,196,1)';
        g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    });
}

export function buildCombatGunshipMesh(scale = 4.8) {
    const group = new THREE.Group(); group.name = 'NUSA-Combat-Gunship';
    const M = {
        armor: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        plate: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true,
            opacity: 0.76, emissive: PAL.techDim, emissiveIntensity: 0.16 }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        // Strip penanda hostile: emissive supaya bisa MENYALA saat enrage.
        warn: new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard,
            emissiveIntensity: EMISSIVE_MAX * 0.35 }),
        sensor: new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard,
            emissiveIntensity: EMISSIVE_MAX * 0.72 }),
        rotor: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        blur: new THREE.MeshBasicMaterial({ color: PAL.steel, transparent: true,
            opacity: 0.12, depthWrite: false, toneMapped: false }),
        exhaust: new THREE.MeshBasicMaterial({ color: PAL.amberDim, transparent: true,
            opacity: 0.5, depthWrite: false, toneMapped: false }),
        flash: new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
            opacity: 0, toneMapped: false }),
    };

    // ===== LAMBUNG STATIS (dilas jadi beberapa mesh saja di akhir) =====
    const hull = new THREE.Group();

    // Badan chevron bersudut: tulang punggung + dek atas + perut + dua flank
    // yang dimiringkan, menggantikan bola yang di-scale.
    mk(hull, new THREE.BoxGeometry(7.8, 1.30, 2.30), M.armor, 0.15, 0.05, 0);
    mk(hull, new THREE.BoxGeometry(6.9, 0.70, 3.40), M.plate, 0.20, 0.60, 0);
    mk(hull, new THREE.BoxGeometry(6.2, 0.65, 2.95), M.armor, 0.05, -0.60, 0);
    for (const s of [-1, 1]) {
        mk(hull, new THREE.BoxGeometry(6.7, 1.45, 0.85), M.armor, 0.15, 0, s * 1.42, s * 0.34);
        mk(hull, new THREE.BoxGeometry(4.6, 0.26, 0.55), M.warn, 0.05, 0.52, s * 1.55, s * 0.30);
        mk(hull, new THREE.BoxGeometry(1.5, 0.30, 0.70), M.dark, 2.20, -0.35, s * 1.45, s * 0.30);
    }

    // Hidung facet enam sisi + brow armor + kanopi tandem bersudut.
    mk(hull, new THREE.ConeGeometry(1.22, 2.7, 6), M.armor, -5.05, 0.02, 0, 0, 0, Math.PI / 2);
    mk(hull, new THREE.BoxGeometry(1.7, 0.85, 2.15), M.plate, -3.35, 0.55, 0, 0, 0, -0.20);
    mk(hull, new THREE.BoxGeometry(2.35, 0.90, 1.50), M.glass, -2.45, 0.88, 0, 0, 0, -0.12);
    mk(hull, new THREE.BoxGeometry(1.85, 0.82, 1.66), M.glass, -0.75, 1.06, 0, 0, 0, -0.05);
    mk(hull, new THREE.BoxGeometry(0.32, 1.00, 1.80), M.dark, -1.66, 0.96, 0);

    // Sayap stub anhedral + pylon + pod rudal berlaras tiga.
    for (const s of [-1, 1]) {
        mk(hull, new THREE.BoxGeometry(3.10, 0.30, 2.85), M.armor, 0.30, -0.32, s * 2.35, s * 0.24);
        mk(hull, new THREE.BoxGeometry(1.55, 0.26, 1.30), M.plate, -0.95, -0.52, s * 3.05, s * 0.24);
        mk(hull, new THREE.BoxGeometry(0.85, 0.55, 0.95), M.dark, 0.35, -0.62, s * 3.45, s * 0.24);
        const pod = mk(hull, new THREE.BoxGeometry(2.70, 0.90, 1.10), M.dark, -0.20, -1.02, s * 3.52);
        pod.name = s < 0 ? 'missilePodL' : 'missilePodR';
        mk(hull, new THREE.BoxGeometry(2.80, 0.22, 1.20), M.hazard, -0.20, -1.48, s * 3.52);
        for (let i = -1; i <= 1; i++)
            mk(hull, new THREE.CylinderGeometry(0.17, 0.17, 0.22, 6), M.warn,
                -1.58, -1.02, s * 3.52 + i * 0.34, 0, 0, Math.PI / 2);
    }

    // Nacelle mesin kembar di punggung + intake depan; exhaust-nya animatif jadi
    // dibuat di luar lambung.
    const exhausts = [];
    for (const s of [-1, 1]) {
        mk(hull, new THREE.CylinderGeometry(0.70, 0.60, 3.20, 8), M.armor, 1.55, 0.78, s * 1.24, 0, 0, Math.PI / 2);
        mk(hull, new THREE.BoxGeometry(1.05, 0.60, 1.05), M.dark, -0.35, 0.90, s * 1.24, 0, 0, -0.12);
        mk(hull, new THREE.CylinderGeometry(0.52, 0.52, 0.34, 8), M.dark, 3.20, 0.78, s * 1.24, 0, 0, Math.PI / 2);
        const glow = mk(group, new THREE.CylinderGeometry(0.40, 0.28, 0.62, 8), M.exhaust,
            3.55, 0.78, s * 1.24, 0, 0, Math.PI / 2);
        glow.castShadow = false; glow.receiveShadow = false;
        exhausts.push(glow);
    }

    // Selubung rotor (ducted fan) — inilah yang membuat siluetnya "2045", bukan
    // heli biasa: cincin penuh + empat strut penopang.
    mk(hull, new THREE.TorusGeometry(3.95, 0.24, 6, 22), M.steel, 0.15, 1.95, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++)
        mk(hull, new THREE.BoxGeometry(8.0, 0.16, 0.34), M.steel, 0.15, 1.95, 0, 0, i * Math.PI / 4);
    mk(hull, new THREE.CylinderGeometry(0.62, 0.90, 0.85, 8), M.armor, 0.15, 1.55, 0);

    // Ekor twin-boom + dua sirip miring + selubung FENESTRON.
    mk(hull, new THREE.BoxGeometry(4.70, 0.66, 0.80), M.armor, 5.55, 0.36, 0, 0, 0, 0.04);
    for (const s of [-1, 1]) {
        mk(hull, new THREE.BoxGeometry(3.30, 0.34, 0.46), M.plate, 5.00, 0.20, s * 0.95, 0, 0, 0.03);
        mk(hull, new THREE.BoxGeometry(1.85, 2.35, 0.30), M.plate, 7.55, 1.45, s * 0.62, s * 0.44, 0, -0.14);
    }
    mk(hull, new THREE.TorusGeometry(1.10, 0.22, 6, 16), M.steel, 6.95, 0.42, 0);
    mk(hull, new THREE.BoxGeometry(1.05, 2.60, 0.34), M.armor, 6.95, 0.42, -0.30);

    // Detail kecil: antena, dispenser countermeasure, strip penanda punggung.
    for (const s of [-1, 1]) {
        mk(hull, new THREE.BoxGeometry(0.9, 0.30, 0.34), M.dark, 3.05, -0.62, s * 1.15);
        mk(hull, new THREE.BoxGeometry(0.24, 0.70, 0.24), M.steel, -3.90, 0.75, s * 0.55, 0, 0, -0.25);
    }
    mk(hull, new THREE.BoxGeometry(3.10, 0.18, 0.40), M.warn, 1.60, 1.22, 0);

    // Lambung dilas: puluhan pelat -> segelintir mesh, transform & material tetap.
    group.add(mergeObjectInPlace(hull));

    // ===== BAGIAN BERGERAK =====
    // Rotor berbilah lima di dalam selubung + cakram blur.
    const rotor = new THREE.Group(); rotor.position.set(0.15, 2.02, 0); group.add(rotor);
    mk(rotor, new THREE.CylinderGeometry(0.34, 0.48, 0.72, 8), M.steel, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        mk(rotor, new THREE.BoxGeometry(3.55, 0.10, 0.46), M.rotor,
            Math.cos(a) * 1.98, 0, Math.sin(a) * 1.98, 0, -a, 0.13);
    }
    const rotorBlur = mk(rotor, new THREE.CylinderGeometry(3.72, 3.72, 0.06, 20), M.blur, 0, 0, 0);
    rotorBlur.castShadow = false; rotorBlur.receiveShadow = false;

    // Fenestron: lima bilah pendek berputar pada sumbu Z di dalam cincin ekor.
    const tailRotor = new THREE.Group(); tailRotor.position.set(6.95, 0.42, 0.34); group.add(tailRotor);
    for (let i = 0; i < 5; i++)
        mk(tailRotor, new THREE.BoxGeometry(0.17, 1.72, 0.09), M.rotor, 0, 0, 0, 0, 0, i * Math.PI / 5);
    mk(tailRotor, new THREE.CylinderGeometry(0.22, 0.26, 0.30, 8), M.steel, 0, 0, 0, Math.PI / 2);

    // Chin turret bergimbal: yoke + bola + GATLING empat laras + meriam.
    const turret = new THREE.Group(); turret.position.set(-3.55, -1.05, 0); group.add(turret);
    mk(turret, new THREE.CylinderGeometry(0.62, 0.80, 0.50, 8), M.dark, 0, 0.36, 0);
    mk(turret, new THREE.SphereGeometry(0.64, 10, 8), M.armor, 0, 0, 0);
    const gatling = new THREE.Group(); gatling.position.set(-0.55, 0.02, -0.34); turret.add(gatling);
    mk(gatling, new THREE.CylinderGeometry(0.28, 0.32, 0.36, 8), M.dark, 0, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        mk(gatling, new THREE.CylinderGeometry(0.085, 0.085, 1.55, 6), M.steel,
            -0.85, Math.sin(a) * 0.17, Math.cos(a) * 0.17, 0, 0, Math.PI / 2);
    }
    mk(turret, new THREE.CylinderGeometry(0.20, 0.27, 2.25, 8), M.armor, -1.05, -0.06, 0.44, 0, 0, Math.PI / 2);
    mk(turret, new THREE.BoxGeometry(0.55, 0.46, 0.48), M.dark, 0.18, -0.06, 0.44);
    const mgMuzzle = new THREE.Object3D(); mgMuzzle.position.set(-2.20, 0.02, -0.34); turret.add(mgMuzzle);
    const cannonMuzzle = new THREE.Object3D(); cannonMuzzle.position.set(-2.25, -0.06, 0.44); turret.add(cannonMuzzle);
    const muzzleFlash = mk(turret, new THREE.SphereGeometry(0.44, 8, 6), M.flash, -2.05, -0.02, 0.05);
    muzzleFlash.castShadow = false; muzzleFlash.receiveShadow = false;

    // Gimbal sensor di bawah hidung: bola merah yang MENATAP player.
    const sensorRig = new THREE.Group(); sensorRig.position.set(-4.55, -0.80, 0); group.add(sensorRig);
    mk(sensorRig, new THREE.CylinderGeometry(0.30, 0.38, 0.36, 8), M.dark, 0, 0.36, 0);
    const sensor = mk(sensorRig, new THREE.SphereGeometry(0.52, 12, 9), M.sensor, 0, 0, 0);
    mk(sensorRig, new THREE.CylinderGeometry(0.28, 0.28, 0.16, 10), M.dark, -0.46, 0, 0, 0, 0, Math.PI / 2);

    group.scale.setScalar(scale);
    return { group, rotor, rotorBlur, tailRotor, turret, gatling, sensorRig, sensor,
        mgMuzzle, cannonMuzzle, muzzleFlash, exhausts, materials: M, scale };
}

function makeTelegraph() {
    const mat = new THREE.MeshBasicMaterial({ color: PAL.white, map: telegraphTexture(),
        transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(330, 0.08, 11), mat);
    mesh.visible = false; scene.add(mesh); return mesh;
}

export function createCombatGunship(scale = 4.8) {
    const parts = buildCombatGunshipMesh(scale); scene.add(parts.group);
    const missiles = [];
    for (let i = 0; i < 3; i++) {
        const mesh = buildCombatGunshipMissileMesh(); scene.add(mesh);
        missiles.push({ mesh, active: false, hp: 0, life: 0, dirx: -1, dirz: 0, speed: 0 });
    }
    const shells = [];
    for (let i = 0; i < 2; i++) {
        const mesh = buildCombatGunshipShellMesh(); scene.add(mesh);
        shells.push({ mesh, active: false, life: 0, laneZ: 0 });
    }
    const gunship = {
        parts, missiles, shells, telegraph: makeTelegraph(), active: false,
        hp: 0, maxHp: 0, score: 0, dead: false, deathDone: false, deathT: 0, deathBlast: false,
        attackIdx: 0, attackState: 'cooldown', attackT: 0, targetLane: 0,
        mgLeft: 0, mgT: 0, missileLeft: 0, missileT: 0, hoverT: 0, hitT: 0,
        gatSpin: 0,
    };
    resetCombatGunship(gunship);
    return gunship;
}

export function resetCombatGunship(gunship, opts = {}) {
    if (!gunship) return;
    // HP/skor SENDIRI, sejajar bos tank (2026-08-09, permintaan user).
    const B = CFG.campaign.bosses.gunship;
    gunship.hp = B.hp; gunship.maxHp = B.hp; gunship.score = B.score;
    gunship.active = !!opts.active;
    gunship.dead = false; gunship.deathDone = false; gunship.deathT = 0; gunship.deathBlast = false;
    gunship.attackIdx = 0; gunship.attackState = 'cooldown'; gunship.attackT = opts.holdSec || 1;
    gunship.targetLane = 0; gunship.mgLeft = 0; gunship.mgT = 0;
    gunship.missileLeft = 0; gunship.missileT = 0; gunship.hoverT = 0; gunship.hitT = 0;
    gunship.gatSpin = 0;
    const p = gunship.parts;
    p.group.visible = gunship.active;
    p.group.position.set(opts.x || 0, opts.y == null ? 42 : opts.y, opts.z || 0);
    p.group.rotation.set(0, 0, 0); p.rotor.rotation.y = 0; p.tailRotor.rotation.z = 0;
    p.turret.rotation.y = 0; p.sensorRig.rotation.y = 0; p.gatling.rotation.x = 0;
    p.muzzleFlash.material.opacity = 0; p.sensor.material.emissiveIntensity = EMISSIVE_MAX * 0.72;
    p.materials.warn.emissiveIntensity = EMISSIVE_MAX * 0.35;
    p.materials.exhaust.opacity = 0.5; p.materials.blur.opacity = 0.12;
    for (const e of p.exhausts) e.scale.setScalar(1);
    p.rotorBlur.scale.setScalar(1);
    gunship.telegraph.visible = false; gunship.telegraph.material.opacity = 0;
    for (const m of gunship.missiles) { m.active = false; m.mesh.visible = false; m.hp = 0; }
    for (const s of gunship.shells) { s.active = false; s.mesh.visible = false; }
    clearGunshipBullets();
}

function clearGunshipBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i--) if (enemyBullets[i].source === 'gunship') {
        scene.remove(enemyBullets[i].mesh); enemyBullets.splice(i, 1);
    }
}

function laneZ(ctx, lane) {
    return ctx.laneZ ? ctx.laneZ(lane) : camera.position.z;
}

function startTelegraph(g, ctx) {
    const C = CFG.campaign.bosses.gunship;
    g.targetLane = ctx.playerLane;
    g.attackState = 'telegraph';
    g.attackT = g.attackIdx === 0 ? C.mgTelegraphSec
        : g.attackIdx === 1 ? C.cannonTelegraphSec : C.missileLockSec;
    g.telegraph.visible = true;
    g.telegraph.position.set(ctx.roadX, 0.24, laneZ(ctx, g.targetLane));
    g.telegraph.material.opacity = 0.22;
}

function endAttack(g) {
    const C = CFG.campaign.bosses.gunship;
    const enraged = g.hp <= g.maxHp * C.enrageHpFrac;
    g.attackIdx = (g.attackIdx + 1) % 3;
    g.attackState = 'cooldown';
    g.attackT = C.attackGapSec * (enraged ? C.enrageGapMul : 1);
    g.telegraph.visible = false; g.telegraph.material.opacity = 0;
}

function fireMG(g, ctx) {
    const C = CFG.campaign.bosses.gunship, p = g.parts;
    const sx = p.group.position.x - 8, sy = 13, sz = laneZ(ctx, g.targetLane);
    const m = new THREE.Mesh(GEO.bullet, MAT.enemyBullet);
    m.scale.set(1.15, 1.15, 7); m.position.set(sx, sy, sz); scene.add(m);
    enemyBullets.push({
        mesh: m, dir: new THREE.Vector3(-1, 0, 0), speed: C.mgBulletSpeed,
        life: CFG.robot.rangedBulletLife, dmg: C.mgDamage, monasDmg: 0,
        px: sx, py: sy, pz: sz, source: 'gunship',
    });
    p.muzzleFlash.material.opacity = 1; playSFX(sfxTankMG, 0.5);
}

function fireCannon(g, ctx) {
    const C = CFG.campaign.bosses.gunship;
    const s = g.shells.find(x => !x.active); if (!s) { endAttack(g); return; }
    s.active = true; s.life = 3; s.laneZ = laneZ(ctx, g.targetLane);
    s.mesh.visible = true; s.mesh.position.set(g.parts.group.position.x - 5, 8, s.laneZ);
    playSFX(sfxTankMortar, 0.75); addCamShake(1.8);
}

function fireMissile(g) {
    const C = CFG.campaign.bosses.gunship;
    const m = g.missiles.find(x => !x.active); if (!m) return;
    const slot = g.missileLeft;
    m.active = true; m.hp = C.missileHp; m.life = C.missileLifeSec;
    m.speed = C.missileSpeed; m.dirx = -1; m.dirz = 0;
    m.mesh.visible = true;
    m.mesh.position.set(g.parts.group.position.x - 7, 9, g.parts.group.position.z + (slot - 2) * 8);
    playSFX(sfxRocketShot, 0.75);
}

function updateAttacks(g, dt, ctx) {
    const C = CFG.campaign.bosses.gunship;
    if (!ctx.allowAttack) return;
    if (g.attackState === 'cooldown') {
        g.attackT -= dt;
        // Jangan menumpuk serangan berikutnya di atas shell/roket yang masih
        // hidup. Telegraph baru menunggu corridor sebelumnya benar-benar aman.
        if (g.attackT <= 0 && !g.shells.some(s => s.active)
            && !g.missiles.some(m => m.active)) startTelegraph(g, ctx);
        return;
    }
    if (g.attackState === 'telegraph') {
        g.attackT -= dt;
        g.telegraph.material.opacity = 0.16 + Math.sin(g.hoverT * 18) * 0.08;
        if (g.attackT > 0) return;
        g.telegraph.visible = false;
        if (g.attackIdx === 0) {
            g.attackState = 'mg'; g.mgLeft = C.mgBurst; g.mgT = 0;
        } else if (g.attackIdx === 1) {
            fireCannon(g, ctx); endAttack(g);
        } else {
            g.attackState = 'missile'; g.missileLeft = C.missileBurst; g.missileT = 0;
        }
        return;
    }
    if (g.attackState === 'mg') {
        g.mgT -= dt;
        if (g.mgLeft > 0 && g.mgT <= 0) {
            fireMG(g, ctx); g.mgLeft--; g.mgT = C.mgIntervalSec;
        }
        if (g.mgLeft <= 0 && g.mgT <= 0) endAttack(g);
    } else if (g.attackState === 'missile') {
        g.missileT -= dt;
        if (g.missileLeft > 0 && g.missileT <= 0) {
            fireMissile(g); g.missileLeft--; g.missileT = C.missileGapSec;
        }
        if (g.missileLeft <= 0 && g.missileT <= 0) endAttack(g);
    }
}

function updateShells(g, dt) {
    const C = CFG.campaign.bosses.gunship;
    for (const s of g.shells) if (s.active) {
        s.mesh.position.x -= C.cannonSpeed * dt; s.life -= dt;
        if (s.mesh.position.x <= camera.position.x + 2 || s.life <= 0) {
            queueBoom(camera.position.x, 5, s.laneZ, C.cannonBlastRadius,
                true, C.cannonDamage, 1, sfxTankBlast);
            s.active = false; s.mesh.visible = false; addCamShake(3.2);
        }
    }
}

function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

function updateMissiles(g, dt) {
    const C = CFG.campaign.bosses.gunship;
    for (const m of g.missiles) if (m.active) {
        const want = Math.atan2(camera.position.z - m.mesh.position.z,
            camera.position.x - m.mesh.position.x);
        let cur = Math.atan2(m.dirz, m.dirx);
        const turn = clamp(wrapAngle(want - cur), -C.missileTurnRadPerSec * dt,
            C.missileTurnRadPerSec * dt);
        cur += turn; m.dirx = Math.cos(cur); m.dirz = Math.sin(cur);
        m.mesh.position.x += m.dirx * m.speed * dt;
        m.mesh.position.z += m.dirz * m.speed * dt;
        m.mesh.rotation.y = -cur; m.life -= dt;
        if (Math.hypot(m.mesh.position.x - camera.position.x,
            m.mesh.position.z - camera.position.z) < player.radius + 4) {
            queueBoom(m.mesh.position.x, 5, m.mesh.position.z, C.missileBlastRadius,
                true, C.missileDamage, 1, sfxRocketExplode);
            m.active = false; m.mesh.visible = false; addCamShake(2.5);
        } else if (m.life <= 0) { m.active = false; m.mesh.visible = false; }
    }
}

function projectileHits(g) {
    const C = CFG.campaign.bosses.gunship;
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi], bx = b.mesh.position.x, bz = b.mesh.position.z;
        let consumed = false;
        for (const m of g.missiles) if (m.active && segPointDist2(
            b.px, 0, b.pz, bx, 0, bz, m.mesh.position.x, 0, m.mesh.position.z) < C.missileHitRadius ** 2) {
            m.hp -= b.damage != null ? b.damage : CFG.weapons.bulletDamage;
            stats.hits++; scene.remove(b.mesh); bullets.splice(bi, 1); consumed = true;
            if (m.hp <= 0) {
                m.active = false; m.mesh.visible = false;
                explodeAt(new THREE.Vector3(m.mesh.position.x, 6, m.mesh.position.z), 8, 1, sfxRocketExplode);
            }
            break;
        }
        if (consumed || g.dead) continue;
        const p = g.parts.group.position;
        if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, p.x, 0, p.z) < C.hitRadius ** 2) {
            const dmg = b.damage != null ? b.damage : CFG.weapons.bulletDamage;
            stats.hits++; damageCombatGunship(g, dmg);
            if (b.explosive) explodeAt(new THREE.Vector3(bx, b.mesh.position.y, bz), b.explodeR, 1, b.boomSfx);
            scene.remove(b.mesh); bullets.splice(bi, 1);
        }
    }
}

export function damageCombatGunship(g, dmg) {
    if (!g || !g.active || g.dead) return false;
    g.hp -= Math.max(1, dmg); g.hitT = 1;
    if (g.hp <= 0) killCombatGunship(g);
    return true;
}

function killCombatGunship(g) {
    g.hp = 0; g.dead = true; g.deathT = 0; g.attackState = 'dead';
    g.telegraph.visible = false; clearGunshipBullets();
    for (const s of g.shells) { s.active = false; s.mesh.visible = false; }
    for (const m of g.missiles) { m.active = false; m.mesh.visible = false; }
    stats.kills++; addCamShake(5);
    explodeAt(new THREE.Vector3(g.parts.group.position.x, g.parts.group.position.y,
        g.parts.group.position.z), 12, 1, sfxTankExplode);
}

function updateDeath(g, dt) {
    g.deathT += dt; const p = g.parts, k = Math.min(1, g.deathT / 4.2);
    p.rotor.rotation.y += dt * (15 * (1 - k)); p.tailRotor.rotation.z += dt * (20 * (1 - k));
    // Rotor kehilangan tenaga, exhaust padam, strip penanda mati: jatuhnya
    // terbaca sebagai mesin yang MATI, bukan sekadar model yang berputar.
    g.gatSpin = Math.max(0, g.gatSpin - dt * 30);
    p.gatling.rotation.x += dt * g.gatSpin;
    p.materials.blur.opacity = 0.12 * (1 - k);
    p.materials.exhaust.opacity = 0.62 * Math.max(0, 1 - k * 1.6);
    p.materials.warn.emissiveIntensity = EMISSIVE_MAX * 0.35 * Math.max(0, 1 - k * 1.3);
    p.materials.sensor.emissiveIntensity = EMISSIVE_MAX * 0.72 * Math.max(0, 1 - k * 1.8);
    p.group.rotation.x += dt * 0.55; p.group.rotation.z += dt * 0.42;
    p.group.position.y -= dt * (4 + 30 * k); p.group.position.x += dt * 26;
    p.group.position.z += dt * 58;
    if (g.deathT < 2.8 && Math.floor(g.deathT * 7) !== Math.floor((g.deathT - dt) * 7)) {
        spawnGroundPuff(p.group.position.x, p.group.position.z, 0x4a4640, 4 + k * 5, p.group.position.y);
        spawnGibs(p.group.position.x, p.group.position.y, p.group.position.z,
            2, 1, 1, 1.1, PAL.gunmetal, 0.4);
    }
    if (!g.deathBlast && g.deathT >= 3.2) {
        g.deathBlast = true;
        explodeAt(new THREE.Vector3(p.group.position.x, Math.max(4, p.group.position.y),
            p.group.position.z), 26, 1, sfxTankExplode);
        addCamShake(8);
    }
    if (g.deathT >= 4.2) { g.deathDone = true; p.group.visible = false; }
}

// Yaw lokal yang membuat HIDUNG rig (menghadap -X) menatap satu titik dunia.
// Rotasi bodi ikut dikurangi supaya bidikan benar di ruang dunia, bukan lokal.
function aimYaw(p, tx, tz, limit) {
    const dx = tx - p.group.position.x, dz = tz - p.group.position.z;
    return clamp(wrapAngle(Math.atan2(dz, -dx) - p.group.rotation.y), -limit, limit);
}

export function updateCombatGunship(g, dt, ctx = {}) {
    if (!g || !g.active) return;
    if (g.dead) { updateDeath(g, dt); return; }
    const C = CFG.campaign.bosses.gunship;
    const p = g.parts; g.hoverT += dt;
    p.group.visible = true;
    p.group.position.x = ctx.bossX == null ? p.group.position.x : ctx.bossX;
    p.group.position.z = (ctx.bossZ || 0) + Math.sin(g.hoverT * 0.72) * 18;
    p.group.position.y = 42 + Math.sin(g.hoverT * 2.1) * 2.2;
    // Bank/yaw/pitch mengikuti geseran melayangnya: bos terbaca sebagai pesawat
    // yang MENGGIRING player, bukan papan yang meluncur menyamping. Sumbu maju
    // rig = X, jadi roll di rotation.x dan pitch di rotation.z.
    const drift = Math.cos(g.hoverT * 0.72);
    p.group.rotation.x = drift * 0.20;
    p.group.rotation.y = -drift * 0.09;
    p.group.rotation.z = Math.sin(g.hoverT * 2.1) * 0.035;
    p.rotor.rotation.y += dt * 28; p.tailRotor.rotation.z += dt * 34;

    // Turret + gimbal sensor MENATAP player terus-menerus; itu yang membuat
    // telegraph terbaca (laras berayun ke lajur yang akan disapu).
    const tx = camera.position.x, tz = camera.position.z;
    p.turret.rotation.y += (aimYaw(p, tx, tz, 1.0) - p.turret.rotation.y) * Math.min(1, dt * 5.5);
    p.sensorRig.rotation.y += (aimYaw(p, tx, tz, 1.2) - p.sensorRig.rotation.y) * Math.min(1, dt * 8);
    // Gatling berputar saat gilirannya, melambat sendiri sesudahnya.
    const spinning = g.attackState === 'mg'
        || (g.attackState === 'telegraph' && g.attackIdx === 0);
    g.gatSpin += ((spinning ? 26 : 0) - g.gatSpin) * Math.min(1, dt * 3.5);
    p.gatling.rotation.x += dt * g.gatSpin;

    // Exhaust dan cakram rotor bernapas mengikuti fase serangan.
    const heat = g.attackState === 'mg' || g.attackState === 'missile' ? 1
        : g.attackState === 'telegraph' ? 0.74 : 0.46;
    const flick = 0.86 + Math.sin(g.hoverT * 14) * 0.14;
    p.materials.exhaust.opacity = 0.32 + heat * 0.5 * flick;
    for (const e of p.exhausts) e.scale.set(1, 0.8 + heat * 0.55, 1);
    p.materials.blur.opacity = 0.10 + heat * 0.06;

    // ENRAGE: strip penanda menyala jauh lebih panas begitu HP menembus ambang
    // config yang sama dengan yang mempercepat serangannya.
    const enraged = g.hp <= g.maxHp * C.enrageHpFrac;
    const warnBase = enraged ? 0.62 + Math.sin(g.hoverT * 7) * 0.2 : 0.35;
    p.materials.warn.emissiveIntensity = EMISSIVE_MAX * clamp(warnBase, 0, 1);

    p.muzzleFlash.material.opacity *= Math.max(0, 1 - dt * 18);
    if (g.hitT > 0) {
        g.hitT = Math.max(0, g.hitT - dt * 4);
        p.materials.sensor.emissiveIntensity = EMISSIVE_MAX * (0.45 + g.hitT * 0.5);
    } else p.materials.sensor.emissiveIntensity = EMISSIVE_MAX * 0.72;
    projectileHits(g); if (g.dead) return;
    updateShells(g, dt); updateMissiles(g, dt); updateAttacks(g, dt, ctx);
}

export function disposeCombatGunship(g) {
    if (!g) return;
    clearGunshipBullets();
    scene.remove(g.parts.group); scene.remove(g.telegraph);
    for (const m of g.missiles) scene.remove(m.mesh);
    for (const s of g.shells) scene.remove(s.mesh);
}

export function combatGunshipDebug(g) {
    return {
        built: !!g, active: !!g?.active, hp: g?.hp || 0, maxHp: g?.maxHp || 0,
        score: g?.score || 0,
        dead: !!g?.dead, deathDone: !!g?.deathDone, deathT: g?.deathT || 0,
        attackIdx: g?.attackIdx ?? -1, attackState: g?.attackState || 'none',
        targetLane: g?.targetLane ?? null, mgLeft: g?.mgLeft || 0,
        missileLeft: g?.missileLeft || 0,
        missilesActive: g?.missiles?.filter(m => m.active).length || 0,
        shellsActive: g?.shells?.filter(s => s.active).length || 0,
        telegraph: !!g?.telegraph?.visible,
        position: g ? { x: g.parts.group.position.x, y: g.parts.group.position.y,
            z: g.parts.group.position.z } : null,
    };
}
