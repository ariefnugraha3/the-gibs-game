// N.U.S.A. combat gunship boss — entity BARU untuk Stage 8. Sengaja tidak
// memakai atau mengimpor entities/helicopter.js. HP selalu membaca HP tank.

import { CFG } from '../core/config.js';
import { scene, camera, addCamShake } from '../core/renderer.js';
import { bullets, enemyBullets, GEO, MAT, player, stats } from '../core/state.js';
import { queueBoom } from './robots.js';
import { explodeAt, spawnGroundPuff } from './effects.js';
import { spawnGibs } from './gore.js';
import { segPointDist2, clamp } from '../utils/math.js';
import { PAL, EMISSIVE_MAX } from '../world/palette.js';
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
    const hot = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });
    const tube = mk(g, new THREE.CylinderGeometry(0.48, 0.48, 4.2, 10), body, 0, 0, 0, 0, 0, Math.PI / 2);
    tube.castShadow = false;
    mk(g, new THREE.ConeGeometry(0.5, 1.2, 10), body, 2.65, 0, 0, 0, 0, -Math.PI / 2);
    mk(g, new THREE.ConeGeometry(0.36, 0.8, 8), hot, -2.42, 0, 0, 0, 0, Math.PI / 2).castShadow = false;
    for (const z of [-0.62, 0.62]) mk(g, new THREE.BoxGeometry(0.8, 0.08, 0.55), body, -1.55, 0, z);
    g.visible = false; return g;
}

export function buildCombatGunshipShellMesh() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: PAL.ink, emissive: PAL.amberDim, emissiveIntensity: 0.5 });
    mk(g, new THREE.CylinderGeometry(0.62, 0.62, 2.8, 10), mat, 0, 0, 0, 0, 0, Math.PI / 2);
    mk(g, new THREE.ConeGeometry(0.64, 1.0, 10), mat, 1.9, 0, 0, 0, 0, -Math.PI / 2);
    g.visible = false; return g;
}

export function buildCombatGunshipMesh(scale = 4.8) {
    const group = new THREE.Group(); group.name = 'NUSA-Combat-Gunship';
    const M = {
        armor: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true,
            opacity: 0.76, emissive: PAL.techDim, emissiveIntensity: 0.16 }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        sensor: new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard,
            emissiveIntensity: EMISSIVE_MAX * 0.72 }),
        rotor: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        flash: new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
            opacity: 0, toneMapped: false }),
    };

    // Fuselage tandem, hidung sensor, twin engine dan tail boom.
    mk(group, new THREE.SphereGeometry(1.72, 14, 9), M.armor, 0.4, 0, 0).scale.set(2.45, 1.0, 0.92);
    mk(group, new THREE.SphereGeometry(1.05, 12, 8), M.glass, 2.55, 0.32, 0).scale.set(1.55, 0.72, 0.82);
    mk(group, new THREE.ConeGeometry(1.04, 2.1, 12), M.armor, 4.05, -0.05, 0, 0, 0, -Math.PI / 2);
    mk(group, new THREE.BoxGeometry(5.7, 0.56, 0.70), M.dark, -3.22, 0.34, 0);
    mk(group, new THREE.BoxGeometry(1.45, 2.25, 0.42), M.armor, -5.72, 1.17, 0, 0, 0, -0.08);
    for (const z of [-1.16, 1.16]) {
        mk(group, new THREE.SphereGeometry(0.78, 10, 7), M.dark, -0.35, 1.48, z).scale.set(1.65, 0.75, 0.75);
        mk(group, new THREE.BoxGeometry(3.7, 0.22, 1.04), M.armor, 0.05, -0.12, z * 1.65, 0, 0, z < 0 ? -0.08 : 0.08);
        const pod = mk(group, new THREE.CylinderGeometry(0.48, 0.48, 2.15, 10), M.dark,
            0.25, -0.30, z * 2.02, 0, 0, Math.PI / 2);
        pod.name = z < 0 ? 'missilePodL' : 'missilePodR';
        for (let i = -1; i <= 1; i++)
            mk(group, new THREE.CylinderGeometry(0.13, 0.13, 0.16, 8), M.hazard,
                1.36, -0.30 + i * 0.34, z * 2.02, 0, 0, Math.PI / 2);
    }

    // Rotor utama/tail, chin MG, cannon dan sensor pod.
    const rotor = new THREE.Group(); rotor.position.set(-0.25, 2.18, 0); group.add(rotor);
    for (let i = 0; i < 4; i++) {
        const blade = mk(rotor, new THREE.BoxGeometry(7.6, 0.08, 0.28), M.rotor, i % 2 ? 0 : 0, 0, 0, 0, i * Math.PI / 2, 0);
        blade.castShadow = true;
    }
    mk(rotor, new THREE.CylinderGeometry(0.27, 0.35, 0.62, 10), M.steel, 0, -0.24, 0);
    const tailRotor = new THREE.Group(); tailRotor.position.set(-5.98, 1.32, 0.28); group.add(tailRotor);
    for (let i = 0; i < 3; i++) mk(tailRotor, new THREE.BoxGeometry(0.18, 2.2, 0.08), M.rotor,
        0, 0, 0, 0, 0, i * Math.PI / 3);
    const turret = new THREE.Group(); turret.position.set(2.34, -1.22, 0); group.add(turret);
    mk(turret, new THREE.SphereGeometry(0.50, 10, 7), M.dark, 0, 0, 0);
    const mgMuzzle = new THREE.Object3D(); mgMuzzle.position.set(1.55, -0.08, -0.24); turret.add(mgMuzzle);
    const cannonMuzzle = new THREE.Object3D(); cannonMuzzle.position.set(1.76, -0.08, 0.32); turret.add(cannonMuzzle);
    mk(turret, new THREE.CylinderGeometry(0.11, 0.15, 1.72, 8), M.steel, 0.85, -0.08, -0.24, 0, 0, Math.PI / 2);
    mk(turret, new THREE.CylinderGeometry(0.18, 0.22, 2.05, 9), M.armor, 0.96, -0.08, 0.32, 0, 0, Math.PI / 2);
    const muzzleFlash = mk(turret, new THREE.SphereGeometry(0.34, 8, 6), M.flash, 1.90, -0.08, 0.02);
    const sensor = mk(group, new THREE.SphereGeometry(0.44, 10, 7), M.sensor, 3.10, -0.66, 0);

    group.scale.setScalar(scale);
    return { group, rotor, tailRotor, turret, mgMuzzle, cannonMuzzle, muzzleFlash,
        sensor, materials: M, scale };
}

function makeTelegraph() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true,
        opacity: 0, depthWrite: false, toneMapped: false });
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
        hp: 0, maxHp: 0, dead: false, deathDone: false, deathT: 0, deathBlast: false,
        attackIdx: 0, attackState: 'cooldown', attackT: 0, targetLane: 0,
        mgLeft: 0, mgT: 0, missileLeft: 0, missileT: 0, hoverT: 0, hitT: 0,
    };
    resetCombatGunship(gunship);
    return gunship;
}

export function resetCombatGunship(gunship, opts = {}) {
    if (!gunship) return;
    const hp = CFG.campaign.bosses.tank.hp;
    gunship.hp = hp; gunship.maxHp = hp; gunship.active = !!opts.active;
    gunship.dead = false; gunship.deathDone = false; gunship.deathT = 0; gunship.deathBlast = false;
    gunship.attackIdx = 0; gunship.attackState = 'cooldown'; gunship.attackT = opts.holdSec || 1;
    gunship.targetLane = 0; gunship.mgLeft = 0; gunship.mgT = 0;
    gunship.missileLeft = 0; gunship.missileT = 0; gunship.hoverT = 0; gunship.hitT = 0;
    const p = gunship.parts;
    p.group.visible = gunship.active;
    p.group.position.set(opts.x || 0, opts.y == null ? 42 : opts.y, opts.z || 0);
    p.group.rotation.set(0, 0, 0); p.rotor.rotation.y = 0; p.tailRotor.rotation.z = 0;
    p.muzzleFlash.material.opacity = 0; p.sensor.material.emissiveIntensity = EMISSIVE_MAX * 0.72;
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
    const C = CFG.campaign.stage8.gunship;
    g.targetLane = ctx.playerLane;
    g.attackState = 'telegraph';
    g.attackT = g.attackIdx === 0 ? C.mgTelegraphSec
        : g.attackIdx === 1 ? C.cannonTelegraphSec : C.missileLockSec;
    g.telegraph.visible = true;
    g.telegraph.position.set(ctx.roadX, 0.24, laneZ(ctx, g.targetLane));
    g.telegraph.material.opacity = 0.22;
}

function endAttack(g) {
    const C = CFG.campaign.stage8.gunship;
    const enraged = g.hp <= g.maxHp * C.enrageHpFrac;
    g.attackIdx = (g.attackIdx + 1) % 3;
    g.attackState = 'cooldown';
    g.attackT = C.attackGapSec * (enraged ? C.enrageGapMul : 1);
    g.telegraph.visible = false; g.telegraph.material.opacity = 0;
}

function fireMG(g, ctx) {
    const C = CFG.campaign.stage8.gunship, p = g.parts;
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
    const C = CFG.campaign.stage8.gunship;
    const s = g.shells.find(x => !x.active); if (!s) { endAttack(g); return; }
    s.active = true; s.life = 3; s.laneZ = laneZ(ctx, g.targetLane);
    s.mesh.visible = true; s.mesh.position.set(g.parts.group.position.x - 5, 8, s.laneZ);
    playSFX(sfxTankMortar, 0.75); addCamShake(1.8);
}

function fireMissile(g) {
    const C = CFG.campaign.stage8.gunship;
    const m = g.missiles.find(x => !x.active); if (!m) return;
    const slot = g.missileLeft;
    m.active = true; m.hp = C.missileHp; m.life = C.missileLifeSec;
    m.speed = C.missileSpeed; m.dirx = -1; m.dirz = 0;
    m.mesh.visible = true;
    m.mesh.position.set(g.parts.group.position.x - 7, 9, g.parts.group.position.z + (slot - 2) * 8);
    playSFX(sfxRocketShot, 0.75);
}

function updateAttacks(g, dt, ctx) {
    const C = CFG.campaign.stage8.gunship;
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
    const C = CFG.campaign.stage8.gunship;
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
    const C = CFG.campaign.stage8.gunship;
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
    const C = CFG.campaign.stage8.gunship;
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

export function updateCombatGunship(g, dt, ctx = {}) {
    if (!g || !g.active) return;
    if (g.dead) { updateDeath(g, dt); return; }
    const p = g.parts; g.hoverT += dt;
    p.group.visible = true;
    p.group.position.x = ctx.bossX == null ? p.group.position.x : ctx.bossX;
    p.group.position.z = (ctx.bossZ || 0) + Math.sin(g.hoverT * 0.72) * 18;
    p.group.position.y = 42 + Math.sin(g.hoverT * 2.1) * 2.2;
    p.rotor.rotation.y += dt * 28; p.tailRotor.rotation.z += dt * 34;
    p.sensor.rotation.y += dt * 1.4;
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
        hpMatchesTank: !!g && g.maxHp === CFG.campaign.bosses.tank.hp,
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
