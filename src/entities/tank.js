// BOSS STAGE 4 (2026-07-14): TANK penjaga stasiun — menggantikan robot raksasa.
// Menabrak dinding di ujung TIMUR jalan lalu DIAM di tempat menembaki player.
// HP = CFG.campaign.boss.hp (SAMA dgn robot raksasa lama); skor = boss.score.
//
// Entitas MANDIRI (BUKAN anggota array `robots`): dikelola stage4.updateMode
// (spawnTank/updateTank/damageTank). Alasan: rig/gore/selebrasi/animasi di
// robots.js semuanya mengasumsikan rangka humanoid — tank punya bentuk & mati
// sendiri (meledak, tanpa gib humanoid). Peluru PLAYER di-hit-test sendiri di
// sini; senjata tank memakai sistem bersama: peluru senapan mesin lewat
// `enemyBullets`, ledakan meriam/mortar lewat `queueBoom` (hurtPlayer=true —
// armor/godMode/i-frame dodge ditangani processPendingBooms).
//
// TIGA serangan BERGANTIAN (cannon -> senapan mesin -> mortar), jeda antar
// serangan CFG.campaign.tank.gapSec ATAU saat proyektil meriam/mortar MELEDAK
// (yang lebih dulu; senapan mesin tak meledak -> selalu jeda penuh):
//   1. MERIAM  : turret membidik player lalu menembak 1 peluru meledak-saat-tiba
//      (damage cannonDamage, radius = killRadius granat × cannonBlastRatio).
//   2. SENAPAN MESIN : 1 sesi = mgBurst peluru dari HULL depan, arahnya SELALU
//      mengikuti player (damage mgDamage/peluru).
//   3. MORTAR  : 1 proyektil HOMING dari tabung di BELAKANG meriam, mengejar
//      player (belok terbatas) — dihindari dgn TUMBLE/dodge (i-frame meleset;
//      damage mortarDamage, radius killRadius × mortarBlastRatio).

import { CFG } from '../core/config.js';
import { player, bullets, enemyBullets, GEO, MAT, addScore, stats } from '../core/state.js';
import { scene, camera, addCamShake } from '../core/renderer.js';
import { segPointDist2, clamp } from '../utils/math.js';
import { queueBoom } from './robots.js';
import { spawnGroundPuff, spawnBloodBurst, explodeAt } from './effects.js';
import { spawnGibs, spawnBloodDecal } from './gore.js';
import { playSFX, sfxExplode, sfxShoot, sfxShotgun } from '../utils/sfx.js';
import { updateUI } from '../core/hud.js';

const _wp = new THREE.Vector3();   // scratch getWorldPosition

// ===== Bangun mesh tank prosedural (primitif murah, seperti robot). FRONT =
// arah -X (barat, ke player); HULL diam, TURRET (anak grup) berputar membidik.
// Cannon dibangun sepanjang +Z lokal turret (aim via turret.rotation.y =
// atan2(dx,dz)); mortar = tabung condong di belakangnya; senapan mesin di HULL
// depan. Kembalikan anchor muzzle (Object3D) utk titik spawn proyektil. =====
export function buildTankMesh() {
    const group = new THREE.Group();
    const paintMats = [];   // material lambung/turret (digelapkan saat mati)
    const paint = (hex) => { const m = new THREE.MeshLambertMaterial({ color: hex }); paintMats.push(m); return m; };
    const hullMat = paint(0x4a5138);      // hijau-zaitun militer kusam
    const turretMat = paint(0x545c40);
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1d19 });   // laras/track
    const steel = new THREE.MeshLambertMaterial({ color: 0x6b7079 });
    const rubber = new THREE.MeshLambertMaterial({ color: 0x141414 });

    const mk = (geo, m, x, y, z, parent, rx, ry, rz) => {
        const b = new THREE.Mesh(geo, m);
        b.position.set(x, y, z);
        if (rx) b.rotation.x = rx; if (ry) b.rotation.y = ry; if (rz) b.rotation.z = rz;
        b.castShadow = true; b.receiveShadow = true;
        parent.add(b);
        return b;
    };

    // --- Track kiri/kanan (dua balok gelap sepanjang X) + roda gigi (berputar) ---
    const tracks = [], wheels = [];
    for (const sz of [-13, 13]) {
        tracks.push(mk(new THREE.BoxGeometry(48, 9, 8), rubber, 0, 4.5, sz, group));
        for (const tx of [-22, 22]) wheels.push(mk(new THREE.CylinderGeometry(5, 5, 9, 10), steel, tx, 4.5, sz, group, 0, 0, Math.PI / 2));
    }
    // --- Lambung utama + geladak miring depan ---
    mk(new THREE.BoxGeometry(46, 9, 22), hullMat, 0, 11, 0, group);
    mk(new THREE.BoxGeometry(16, 8, 22), hullMat, -24, 10, 0, group, 0, 0, 0.5);   // glacis depan miring
    // baut/pelat detail geladak
    mk(new THREE.BoxGeometry(20, 2, 18), turretMat, 4, 15.6, 0, group);

    // --- SENAPAN MESIN di hull depan (menghadap -X) ---
    mk(new THREE.BoxGeometry(4, 4, 4), dark, -20, 16.5, -6, group);   // dudukan
    mk(new THREE.CylinderGeometry(0.7, 0.7, 10, 8), dark, -26, 16.5, -6, group, 0, 0, Math.PI / 2);
    const mgMuzzle = new THREE.Object3D(); mgMuzzle.position.set(-31, 16.5, -6); group.add(mgMuzzle);

    // --- TURRET berputar (anak) di atas lambung. Cannon = +Z lokal. ---
    const turret = new THREE.Group();
    turret.position.set(3, 17.5, 0);
    group.add(turret);
    mk(new THREE.CylinderGeometry(9, 10.5, 8, 14), turretMat, 0, 2, 0, turret);   // kubah turret
    mk(new THREE.BoxGeometry(12, 5, 14), turretMat, -2, 3, 0, turret);            // blok mantlet
    // Cannon: laras panjang ke +Z (depan)
    mk(new THREE.CylinderGeometry(2.2, 2.4, 10, 12), steel, 0, 2.5, 8, turret, Math.PI / 2, 0, 0);   // pangkal
    mk(new THREE.CylinderGeometry(1.5, 1.6, 26, 12), dark, 0, 2.5, 24, turret, Math.PI / 2, 0, 0);   // laras
    mk(new THREE.CylinderGeometry(2.0, 2.0, 3, 12), dark, 0, 2.5, 37, turret, Math.PI / 2, 0, 0);    // rem moncong
    const cannonMuzzle = new THREE.Object3D(); cannonMuzzle.position.set(0, 2.5, 39); turret.add(cannonMuzzle);
    // Kilatan muncrat meriam (basic transparent, tanpa lampu baru = tanpa recompile)
    const cannonFlash = new THREE.Mesh(GEO.explosion, new THREE.MeshBasicMaterial({
        color: 0xffd070, transparent: true, opacity: 0, toneMapped: false
    }));
    cannonFlash.scale.setScalar(3.5); cannonFlash.position.copy(cannonMuzzle.position); turret.add(cannonFlash);

    // --- TABUNG MORTAR di BELAKANG cannon (condong ke atas-belakang) ---
    mk(new THREE.BoxGeometry(7, 5, 7), turretMat, 0, 3, -6, turret);   // dudukan
    mk(new THREE.CylinderGeometry(2.3, 2.6, 12, 10), dark, 0, 6.5, -9, turret, -0.6, 0, 0);   // tabung condong
    const mortarMuzzle = new THREE.Object3D(); mortarMuzzle.position.set(0, 10, -12.5); turret.add(mortarMuzzle);
    const mortarGlow = new THREE.Mesh(GEO.explosion, new THREE.MeshBasicMaterial({
        color: 0xff7a3a, transparent: true, opacity: 0, toneMapped: false
    }));
    mortarGlow.scale.setScalar(2.4); mortarGlow.position.copy(mortarMuzzle.position); turret.add(mortarGlow);

    // Antena + lampu komandan (detail)
    mk(new THREE.CylinderGeometry(0.2, 0.2, 14, 5), dark, 6, 10, -3, turret);

    return {
        group, turret, tracks, wheels, mgMuzzle, cannonMuzzle, mortarMuzzle,
        cannonFlash, mortarGlow, paintMats
    };
}

// ===== Buat & tempatkan tank. `homeX/homeZ` = posisi diam (ujung timur jalan);
// `wallX` = x dinding yang ditabrak (pecah saat tank melintasinya). Tank SPAWN
// di timur dinding lalu menggelinding ke home (fase 'spawn'). =====
export function spawnTank({ homeX, homeZ, wallX, faceX }) {
    const parts = buildTankMesh();
    const startX = homeX + 160;   // mulai di timur (di balik dinding, luar peta)
    parts.group.position.set(startX, 0, homeZ);
    scene.add(parts.group);

    const B = CFG.campaign.boss;
    return {
        parts, homeX, homeZ, wallX: wallX != null ? wallX : homeX + 108,
        faceX: faceX != null ? faceX : homeX - 300,   // arah player (barat) utk orientasi awal
        hp: B.hp, maxHp: B.hp, score: B.score,
        phase: 'spawn', spawnT: 0, wallSmashed: false, dead: false, deathT: 0,
        // Siklus serangan
        attackIdx: -1, cd: 1.4, aiming: false,
        blastPending: false, pendingId: 0,
        mgLeft: 0, mgTimer: 0,
        shells: [], mortars: [],
        turretYaw: Math.atan2((faceX != null ? faceX : homeX - 300) - homeX, 0),
        trackPhase: 0, chargeK: 0, onWallSmash: null
    };
}

export function disposeTank(tank) {
    if (!tank || !tank.parts) return;
    tank.shells.forEach(s => scene.remove(s.mesh));
    tank.mortars.forEach(m => scene.remove(m.mesh));
    tank.parts.group.traverse(o => { if (o.isMesh && o.material && o.material.dispose) o.material.dispose(); });
    scene.remove(tank.parts.group);
    tank.parts = null;
}

// Sudut yaw turret agar cannon (+Z lokal) menghadap titik (tx,tz)
function aimYaw(tank, tx, tz) {
    return Math.atan2(tx - tank.homeX, tz - tank.homeZ);
}

// ===== Loop utama tank (dipanggil stage4.updateMode tiap frame). step
// dihitung lokal (updateMode hanya diberi dt oleh game.js). =====
export function updateTank(tank, dt) {
    if (!tank || !tank.parts) return;
    const step = dt * 60;
    const p = tank.parts;

    // Proyektil selalu di-update (biar meledak walau fase mati)
    updateShells(tank, dt, step);
    updateMortars(tank, dt, step);

    if (tank.dead) { updateDeath(tank, dt); return; }
    if (tank.hp <= 0) { killTank(tank); return; }   // HP habis (peluru/ledakan) -> hancur

    // --- FASE SPAWN: menggelinding dari timur, MENABRAK dinding, berhenti di home ---
    if (tank.phase === 'spawn') {
        tank.spawnT += dt;
        const dur = CFG.campaign.tank.spawnRollSec || 2.4;
        const k = clamp(tank.spawnT / dur, 0, 1);
        const ease = 1 - Math.pow(1 - k, 2);   // easeOut: melambat mendekati home
        const startX = tank.homeX + 160;
        p.group.position.x = startX + (tank.homeX - startX) * ease;
        tank.trackPhase += dt * 8;
        spinTracks(p, tank.trackPhase);
        addCamShake(0.7);
        if (Math.random() < 0.6) spawnGroundPuff(p.group.position.x + 22, p.group.position.z + (Math.random() - 0.5) * 20, 0x6b6252, 5 + Math.random() * 4, 3);
        // Momen MENABRAK dinding (melintasi wallX menuju barat)
        if (!tank.wallSmashed && p.group.position.x <= tank.wallX) {
            tank.wallSmashed = true;
            smashWall(tank);
        }
        p.turret.rotation.y = aimYaw(tank, tank.faceX, tank.homeZ);
        if (k >= 1) { tank.phase = 'battle'; tank.spawnT = 0; }
        return;
    }

    // --- FASE BATTLE ---
    // Turret MELACAK player terus-menerus (belok terbatas — terlihat hidup).
    const want = aimYaw(tank, camera.position.x, camera.position.z);
    tank.turretYaw = turnAngle(tank.turretYaw, want, 2.2 * dt);
    p.turret.rotation.y = tank.turretYaw;
    // kilat muzzle meredup tiap frame (di-nyalakan saat menembak / charge)
    p.cannonFlash.material.opacity *= 0.82;
    p.mortarGlow.material.opacity *= 0.9;

    // Hit-test peluru PLAYER (tank bukan anggota `robots` -> uji sendiri di sini)
    tankBulletHits(tank);
    if (tank.dead) return;

    // Sesi SENAPAN MESIN sedang berjalan?
    if (tank.mgLeft > 0) {
        tank.mgTimer -= dt;
        if (tank.mgTimer <= 0) {
            fireMG(tank);
            tank.mgLeft--;
            tank.mgTimer = CFG.campaign.tank.mgIntervalSec || 0.12;
            if (tank.mgLeft <= 0) { tank.cd = CFG.campaign.tank.gapSec; tank.aiming = false; }
        }
        return;
    }

    // MENUNGGU proyektil MELEDAK: utk cannon/mortar, jeda `gapSec` BARU dimulai
    // SETELAH shell/mortar meledak (detonate men-set cd), BUKAN saat meledak
    // langsung menembak. Selama proyektil masih terbang, jangan hitung mundur.
    if (tank.blastPending) return;

    // Cooldown antar serangan. Telegraf "charge" pada aimSec terakhir, di muzzle
    // serangan BERIKUTNYA (nextIdx).
    tank.cd -= dt;
    const aimSec = CFG.campaign.tank.aimSec || 1.1;
    const nextIdx = (tank.attackIdx + 1) % 3;
    const charging = tank.cd <= aimSec && tank.cd > 0 && (nextIdx === 0 || nextIdx === 2);
    tank.chargeK += ((charging ? 1 : 0) - tank.chargeK) * Math.min(1, dt * 10);
    applyCharge(tank, nextIdx);

    if (tank.cd <= 0) {
        tank.attackIdx = nextIdx;
        launchAttack(tank);
    }
}

// Belok sudut a menuju b dgn laju terbatas maxDelta (rad)
function turnAngle(a, b, maxDelta) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxDelta) return b;
    return a + Math.sign(d) * maxDelta;
}

function spinTracks(p, ph) {
    for (let i = 0; i < p.wheels.length; i++) p.wheels[i].rotation.x = ph;   // roda gigi berputar
}

// Tank MENABRAK dinding ujung timur: serpihan beton + debu + guncangan; stage4
// menyembunyikan panel gerbangnya lewat callback onWallSmash (bila di-set).
function smashWall(tank) {
    const wx = tank.wallX, wz = tank.homeZ;
    spawnGibs(wx, 22, wz, 12, -1, 0, 2.2, 0x8a8378, 0.4);      // pecahan beton (terlempar ke barat)
    spawnGibs(wx, 14, wz, 8, -0.6, 0.5, 1.6, 0x6f6a60, 0.4);
    spawnGroundPuff(wx, wz, 0xcbbfa6, 12, 12);
    spawnGroundPuff(wx, wz + 14, 0xcbbfa6, 8, 8);
    spawnGroundPuff(wx, wz - 14, 0xcbbfa6, 8, 8);
    addCamShake(6);
    playSFX(sfxExplode);
    if (typeof tank.onWallSmash === 'function') tank.onWallSmash();
}

// Telegraf charge di muzzle senjata yang akan menembak (idx = nextIdx). Hanya
// MENAIKKAN (peluruhan glow ditangani di puncak fase battle). MG tak ada charge.
function applyCharge(tank, idx) {
    const p = tank.parts, k = tank.chargeK;
    if (idx === 0) p.cannonFlash.material.opacity = Math.max(p.cannonFlash.material.opacity, k * 0.5);
    else if (idx === 2) p.mortarGlow.material.opacity = Math.max(p.mortarGlow.material.opacity, k * 0.9);
}

// ===== Mulai serangan sesuai attackIdx (0 meriam, 1 senapan mesin, 2 mortar) =====
function launchAttack(tank) {
    tank.chargeK = 0;
    const T = CFG.campaign.tank;
    if (tank.attackIdx === 0) {
        fireCannon(tank);
        tank.blastPending = true;   // jeda gapSec dimulai SETELAH shell meledak (detonate)
    } else if (tank.attackIdx === 1) {
        tank.mgLeft = T.mgBurst || 10; tank.mgTimer = 0; tank.aiming = true;
        // (senapan mesin tak meledak -> cd = gapSec di-set saat burst selesai)
    } else {
        fireMortar(tank);
        tank.blastPending = true;   // jeda gapSec dimulai SETELAH mortar meledak (detonate)
    }
}

// --- MERIAM: 1 peluru meledak-saat-tiba ke posisi player saat menembak ---
function fireCannon(tank) {
    const p = tank.parts;
    p.cannonMuzzle.getWorldPosition(_wp);
    const tx = camera.position.x, tz = camera.position.z;
    const dx = tx - _wp.x, dz = tz - _wp.z;
    const dist = Math.hypot(dx, dz) || 1;
    const m = new THREE.Mesh(GEO.grenade, new THREE.MeshLambertMaterial({ color: 0x2b2b2b, emissive: 0x552200 }));
    m.scale.setScalar(1.6);
    m.position.copy(_wp);
    scene.add(m);
    tank.pendingId++;
    tank.shells.push({
        mesh: m, dirx: dx / dist, dirz: dz / dist,
        speed: CFG.campaign.tank.cannonShellSpeed || 7,
        tx, tz, travelled: 0, dist, life: 220, id: tank.pendingId
    });
    p.cannonFlash.material.opacity = 1;
    playSFX(sfxExplode);
    addCamShake(2.4);
}

function updateShells(tank, dt, step) {
    for (let i = tank.shells.length - 1; i >= 0; i--) {
        const s = tank.shells[i];
        const dpos = s.speed * step;
        s.mesh.position.x += s.dirx * dpos;
        s.mesh.position.z += s.dirz * dpos;
        s.travelled += dpos; s.life -= step;
        if (s.travelled >= s.dist || s.life <= 0) {
            const R = CFG.grenade.killRadius * (CFG.campaign.tank.cannonBlastRatio || 0.3);
            detonate(tank, s.mesh.position.x, s.mesh.position.z, R, CFG.campaign.tank.cannonDamage || 50, s.id);
            scene.remove(s.mesh); tank.shells.splice(i, 1);
        }
    }
}

// --- SENAPAN MESIN: peluru dari hull depan, arah MENGIKUTI player tiap tembakan ---
function fireMG(tank) {
    const p = tank.parts;
    p.mgMuzzle.getWorldPosition(_wp);
    const dx = camera.position.x - _wp.x, dz = camera.position.z - _wp.z;
    const d = Math.hypot(dx, dz) || 1;
    const m = new THREE.Mesh(GEO.bullet, MAT.enemyBullet);
    m.scale.setScalar(1.15);
    m.position.copy(_wp);
    scene.add(m);
    enemyBullets.push({
        mesh: m, dir: new THREE.Vector3(dx / d, 0, dz / d),
        speed: CFG.campaign.tank.mgBulletSpeed || 4, life: CFG.robot.rangedBulletLife,
        dmg: CFG.campaign.tank.mgDamage || 5, monasDmg: 0,
        px: _wp.x, py: _wp.y, pz: _wp.z
    });
    playSFX(sfxShoot);
}

// --- MORTAR: 1 proyektil HOMING (belok terbatas) mengejar player ---
function fireMortar(tank) {
    const p = tank.parts;
    p.mortarMuzzle.getWorldPosition(_wp);
    const dx = camera.position.x - _wp.x, dz = camera.position.z - _wp.z;
    const d = Math.hypot(dx, dz) || 1;
    const m = new THREE.Mesh(GEO.grenade, new THREE.MeshLambertMaterial({ color: 0x30281c, emissive: 0xaa3a10 }));
    m.scale.setScalar(1.4);
    m.position.copy(_wp);
    scene.add(m);
    tank.pendingId++;
    tank.mortars.push({
        mesh: m, dirx: dx / d, dirz: dz / d,
        speed: CFG.campaign.tank.mortarSpeed || 2.6,
        turn: CFG.campaign.tank.mortarTurnRadPerSec || 1.6,
        life: (CFG.campaign.tank.mortarMaxSec || 6) * 60, id: tank.pendingId, vy: 0.6
    });
    p.mortarGlow.material.opacity = 1;
    playSFX(sfxShotgun);
    addCamShake(1.2);
}

function updateMortars(tank, dt, step) {
    const T = CFG.campaign.tank;
    for (let i = tank.mortars.length - 1; i >= 0; i--) {
        const mo = tank.mortars[i];
        // Homing: belokkan arah mendatar ke player (laju belok terbatas)
        const dx = camera.position.x - mo.mesh.position.x;
        const dz = camera.position.z - mo.mesh.position.z;
        const cur = Math.atan2(mo.dirx, mo.dirz);
        const want = Math.atan2(dx, dz);
        const na = turnAngle(cur, want, mo.turn * dt);
        mo.dirx = Math.sin(na); mo.dirz = Math.cos(na);
        const dpos = mo.speed * step;
        mo.mesh.position.x += mo.dirx * dpos;
        mo.mesh.position.z += mo.dirz * dpos;
        // busur tinggi: naik lalu turun mendekati player
        const hd = Math.hypot(dx, dz);
        mo.mesh.position.y += (clamp(hd * 0.12, 3, 34) - mo.mesh.position.y) * Math.min(1, dt * 3);
        mo.mesh.rotation.x += dt * 6;
        mo.life -= step;
        // meledak saat cukup dekat player (mendatar) atau kehabisan umur
        if (hd < (CFG.grenade.killRadius * (T.mortarBlastRatio || 0.35)) * 0.7 || mo.life <= 0) {
            const R = CFG.grenade.killRadius * (T.mortarBlastRatio || 0.35);
            detonate(tank, mo.mesh.position.x, mo.mesh.position.z, R, T.mortarDamage || 50, mo.id);
            scene.remove(mo.mesh); tank.mortars.splice(i, 1);
        }
    }
}

// Ledakan proyektil (meriam/mortar): AoE ke player via queueBoom (hurtPlayer;
// armor/godMode/i-frame dodge ditangani processPendingBooms). Saat proyektil
// serangan yang menanti meledak -> MULAI jeda `gapSec` (BUKAN langsung menembak
// lagi): set cd penuh + lepas blastPending supaya cooldown baru dihitung.
function detonate(tank, x, z, radius, damage, id) {
    queueBoom(x, 5, z, radius, true, damage, 1);
    if (tank && !tank.dead && id === tank.pendingId && tank.blastPending) {
        tank.blastPending = false;
        tank.cd = CFG.campaign.tank.gapSec;   // jeda 5 dtk BARU dimulai SETELAH ledakan
    }
}

// ===== Hit-test peluru PLAYER -> tank (tank di luar array robots) =====
function tankBulletHits(tank) {
    const p = tank.parts;
    const cx = p.group.position.x, cz = p.group.position.z;
    const R = CFG.campaign.tank.hitRadius || 18;
    const R2 = R * R;
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const bx = b.mesh.position.x, bz = b.mesh.position.z;
        if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, cx, 0, cz) < R2) {
            if (b.explosive) {
                // Peluru Grenade Launcher: damage LANGSUNG ke tank + boom visual
                queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage);
                damageTank(tank, b.damage != null ? b.damage : CFG.grenade.damage);
            } else {
                const dmg = (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
                stats.hits++;
                damageTank(tank, dmg);
                // percikan bunga api di titik tumbuk (visual)
                spawnBloodBurst(bx, 14 + Math.random() * 6, bz, b.dir.x, b.dir.z, 2, 0.5, 1.4, 0xffb24a);
            }
            scene.remove(b.mesh); bullets.splice(j, 1);
            if (tank.dead) return;
        }
    }
}

export function damageTank(tank, dmg) {
    if (tank.dead) return;
    tank.hp -= Math.max(1, dmg);
    if (tank.hp <= 0) killTank(tank);
}

// ===== KEMATIAN: ledakan besar berantai + serpihan + turret terangkat, lalu
// bangkai membara. Skor boss diberikan. stage4 mendeteksi tank.dead. =====
function killTank(tank) {
    tank.dead = true; tank.hp = 0; tank.deathT = 0;
    addScore(tank.score);
    stats.kills++;
    const p = tank.parts, px = p.group.position.x, pz = p.group.position.z;
    // gelapkan cat (bangkai hangus)
    p.paintMats.forEach(m => m.color && m.color.setHex(0x20211c));
    // ledakan besar + serpihan logam ke segala arah
    explodeAt(new THREE.Vector3(px, 16, pz), 30, 1);
    spawnGibs(px, 18, pz, 14, 1, 0, 2.2, 0x3d444c, 0.4);
    spawnGibs(px, 14, pz, 10, -1, 0.4, 1.8, 0x20211c, 0.4);
    spawnBloodDecal(px, pz, 8, 0x141210);
    addCamShake(9);
    playSFX(sfxExplode);
    updateUI();
}

function updateDeath(tank, dt) {
    const p = tank.parts;
    tank.deathT += dt;
    // beberapa kepulan asap/ledakan susulan ~1.6 dtk, turret terangkat sedikit
    p.turret.position.y += (19.4 - p.turret.position.y) * Math.min(1, dt * 2);
    p.turret.rotation.z += (0.18 - p.turret.rotation.z) * Math.min(1, dt * 2);
    if (tank.deathT < 1.8 && Math.random() < 0.25) {
        const px = p.group.position.x + (Math.random() - 0.5) * 30;
        const pz = p.group.position.z + (Math.random() - 0.5) * 18;
        spawnGroundPuff(px, pz, 0x2a2622, 6 + Math.random() * 5, 8 + Math.random() * 10);
        if (Math.random() < 0.4) explodeAt(new THREE.Vector3(px, 12, pz), 8, 1);
    }
}
