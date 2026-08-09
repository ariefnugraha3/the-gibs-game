// Stage 5 — MINI BOSS: LOKOMOTIF KERETA MUSUH (2026-08-09, permintaan user).
//
// Sesudah kesepuluh gerbong hancur, konsist tidak lagi langsung terbakar dan
// pergi. Lokomotifnya MAJU sampai sejajar dengan gerbong player, MENYALAKAN dua
// senjata yang sejak awal sudah terpasang di atapnya (larasnya selama ini
// mengarah lurus ke depan, arah laju kereta), lalu bertempur sampai HP-nya
// habis.
//
// TIGA ATURAN YANG MEMBEDAKANNYA DARI BOS TANK STAGE 4 — jangan "diseragamkan":
//
//   1. JENDELA KEBAL. Selama `armSec` (3 dtk) pertama sesudah sejajar, senjata
//      hanya BERPUTAR KE POSISI TEMPUR dan strip peringatannya menyala; peluru
//      player TIDAK melukainya. Itu telegraph "mesin ini baru bangun", dan
//      sekaligus mencegah lokomotif mati sebelum player sempat melihatnya.
//   2. MG MENEMBAK KE TITIK MATI, BUKAN MENGEJAR. MG tank membidik ulang posisi
//      player TIAP peluru; MG ini MENGUNCI satu titik, memberi player
//      `mgLockSec` (0.5 dtk) untuk menyingkir, lalu memuntahkan `mgShots`
//      peluru menyusuri garis lurus yang sama. Menghindarinya = pindah, bukan
//      berlari melingkar.
//   3. GRANAT MENYUSUL, TIDAK BERSAMAAN. `mgToGlSec` (2 dtk) sesudah peluru MG
//      terakhir keluar, grenade launcher melempar `glShots` granat; tiap granat
//      mengunci titik jatuhnya saat ditembakkan dan baru meledak `glFlightSec`
//      (0.5 dtk) kemudian — jendela menghindar yang sama.
//
// KEDUA ARAH PERGANTIAN SENJATA PUNYA JEDA (2026-08-09, permintaan user "beri
// jeda 1 detik antar pergantian senjata"): MG -> GL lewat `mgToGlSec`, dan
// GL -> MG lewat `cycleGapSec` (1 dtk). `cycleGapSec` karena itu BUKAN sekadar
// "istirahat antar siklus" — ia jeda serah-terima senjata, dan memangkasnya ke
// 0 membuat MG mengunci pada frame granat terakhir mendarat.
//
// Radius ledakan granatnya SENGAJA dibaca dari `bosses.tank.mortarBlastRatio`
// (permintaan user: "radius sama dengan mortar tank"). Menyalin angkanya akan
// membuat keduanya diam-diam berbeda begitu mortar tank di-retune.

import { CFG } from '../../../../core/config.js';
import { bullets, player, stats } from '../../../../core/state.js';
import { scene, camera, addCamShake } from '../../../../core/renderer.js';
import { spawnBloodBurst, explodeAt } from '../../../../entities/effects.js';
import { queueBoom, spawnTurretBullet } from '../../../../entities/robots.js';
import { spawnGibs } from '../../../../entities/gore.js';
import { PAL } from '../../../../world/palette.js';
import { playSFX, sfxTankExplode, sfxTankBlast } from '../../../../utils/sfx.js';
import { enemyTrain, ET_LEN, ET_HALF, ET_CARGO_CARS, enemyCarOffsetX } from './world.js';

const bossCfg = () => (CFG.campaign.stage5.enemyTrain || {}).boss || {};
// Radius granat = radius mortar tank, dibaca LANGSUNG dari config bos tank.
export const locoBlastRadius = () =>
    CFG.grenade.killRadius * ((CFG.campaign.bosses.tank || {}).mortarBlastRatio || 0.35);

// Fase: 'off' (belum jadi bos) -> 'arm' (kebal, senjata bangun) -> 'fight'
// -> 'dead'. `sub` adalah sub-fase siklus tembak selama 'fight'.
let boss = null;
const _wp = new THREE.Vector3();

export function resetLocoBoss() {
    boss = null;
    const w = enemyTrain?.weapons;
    if (w) {
        w.mg.yaw.rotation.y = 0; w.gl.yaw.rotation.y = 0;
        w.warn.visible = false;
    }
    for (const g of enemyTrain?.grenades || []) { g.live = false; g.mesh.visible = false; }
}

// Dipanggil runtime saat lokomotif sudah SEJAJAR dengan gerbong player.
export function armLocoBoss() {
    const B = bossCfg();
    boss = {
        phase: 'arm', t: 0, hp: B.hp ?? 1000, maxHp: B.hp ?? 1000,
        sub: 'idle', subT: 0, shots: 0, lockX: 0, lockZ: 0, hitT: 0, cycles: 0,
    };
    if (enemyTrain?.weapons) enemyTrain.weapons.warn.visible = true;
    addCamShake(2.6);
}

export const locoBossActive = () => !!boss && boss.phase !== 'dead';
export const locoBossDead = () => !!boss && boss.phase === 'dead';
// Hanya bisa dilukai SESUDAH jendela kebal habis (permintaan user).
export const locoBossVulnerable = () => !!boss && boss.phase === 'fight';

export const locoBossDebug = () => (boss ? {
    phase: boss.phase, hp: boss.hp, maxHp: boss.maxHp,
    sub: boss.sub, subT: boss.subT, shots: boss.shots, cycles: boss.cycles,
    vulnerable: locoBossVulnerable(),
    lock: { x: boss.lockX, z: boss.lockZ },
    grenades: (enemyTrain?.grenades || []).filter(g => g.live).length,
    mgYaw: enemyTrain?.weapons?.mg.yaw.rotation.y ?? 0,
    glYaw: enemyTrain?.weapons?.gl.yaw.rotation.y ?? 0,
    warn: !!enemyTrain?.weapons?.warn.visible,
} : null);

// Pusat lokomotif dalam koordinat dunia (konsist bergerak; lokomotif = gerbong
// indeks ET_CARGO_CARS).
export function locoCenter(out = _wp) {
    const g = enemyTrain.group.position;
    return out.set(g.x + enemyCarOffsetX(ET_CARGO_CARS), 0, g.z);
}

// Yaw senjata menuju sebuah titik dunia, di-ease supaya putarannya terbaca.
function aimTurret(turret, tx, tz, dt, rate = 2.6) {
    turret.yaw.getWorldPosition(_wp);
    const want = Math.atan2(tx - _wp.x, tz - _wp.z) - Math.PI / 2;
    // Sumbu laras lokal +x, jadi yaw 0 = menghadap +x (depan kereta).
    let d = want - turret.yaw.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    turret.yaw.rotation.y += d * Math.min(1, dt * rate);
}

function fireMg() {
    const B = bossCfg(), w = enemyTrain.weapons;
    w.mg.muzzle.getWorldPosition(_wp);
    spawnTurretBullet(_wp.x, _wp.y, _wp.z, boss.lockX, boss.lockZ,
        B.mgBulletSpeed ?? 1.6, B.mgDamage ?? 4);
}

function fireGrenade() {
    const B = bossCfg(), w = enemyTrain.weapons;
    const slot = enemyTrain.grenades.find(g => !g.live);
    if (!slot) return;
    w.gl.muzzle.getWorldPosition(_wp);
    slot.live = true; slot.t = 0;
    slot.dur = Math.max(0.05, B.glFlightSec ?? 0.5);
    slot.x0 = _wp.x; slot.y0 = _wp.y; slot.z0 = _wp.z;
    // Titik jatuh DIKUNCI saat ditembakkan: itulah jendela menghindar.
    slot.tx = boss.lockX; slot.tz = boss.lockZ;
    slot.mesh.visible = true;
    slot.mesh.position.set(slot.x0, slot.y0, slot.z0);
    playSFX(sfxTankExplode, 0.22);
}

// Lintasan granat: parabola sederhana dari moncong ke titik kunci.
function updateGrenades(dt) {
    const R = locoBlastRadius(), dmg = bossCfg().glDamage ?? 35;
    for (const g of enemyTrain.grenades) {
        if (!g.live) continue;
        g.t += dt;
        const k = Math.min(1, g.t / g.dur);
        g.mesh.position.set(g.x0 + (g.tx - g.x0) * k, 0, g.z0 + (g.tz - g.z0) * k);
        // Apex di tengah lintasan; tinggi lemparan proporsional jaraknya.
        const arc = 14 + Math.hypot(g.tx - g.x0, g.tz - g.z0) * 0.16;
        g.mesh.position.y = g.y0 * (1 - k) + Math.sin(Math.PI * k) * arc + 1.2 * k;
        if (k < 1) continue;
        g.live = false; g.mesh.visible = false;
        queueBoom(g.tx, 4, g.tz, R, true, dmg, 0, sfxTankBlast);
        addCamShake(2.2);
    }
}

// Siklus tembak: lock -> semburan MG -> jeda -> semburan granat -> istirahat.
function updateAttack(dt) {
    const B = bossCfg(), w = enemyTrain.weapons;
    boss.subT += dt;
    if (boss.sub === 'idle') {
        // MENGUNCI: kedua laras berputar ke posisi player SEKARANG, lalu titik
        // itu dibekukan. Player punya `mgLockSec` untuk pergi dari sana.
        boss.lockX = camera.position.x; boss.lockZ = camera.position.z;
        boss.sub = 'lock'; boss.subT = 0; boss.shots = 0;
        return;
    }
    if (boss.sub === 'lock') {
        aimTurret(w.mg, boss.lockX, boss.lockZ, dt, 5.5);
        aimTurret(w.gl, boss.lockX, boss.lockZ, dt, 3.4);
        if (boss.subT >= (B.mgLockSec ?? 0.5)) { boss.sub = 'mg'; boss.subT = 0; }
        return;
    }
    if (boss.sub === 'mg') {
        const gap = Math.max(0.02, B.mgShotGapSec ?? 0.09);
        const want = Math.min(B.mgShots ?? 10, Math.floor(boss.subT / gap) + 1);
        while (boss.shots < want) { fireMg(); boss.shots++; }
        if (boss.shots >= (B.mgShots ?? 10)) { boss.sub = 'gap'; boss.subT = 0; }
        return;
    }
    if (boss.sub === 'gap') {
        // Jeda WAJIB sesudah peluru MG terakhir keluar (permintaan user 2 dtk).
        if (boss.subT >= (B.mgToGlSec ?? 2)) {
            boss.sub = 'gl'; boss.subT = 0; boss.shots = 0;
            boss.lockX = camera.position.x; boss.lockZ = camera.position.z;
        }
        return;
    }
    if (boss.sub === 'gl') {
        // Tiap granat mengunci ulang titik jatuhnya saat ditembakkan.
        aimTurret(w.gl, boss.lockX, boss.lockZ, dt, 4.2);
        const gap = Math.max(0.05, B.glShotGapSec ?? 0.55);
        const want = Math.min(B.glShots ?? 3, Math.floor(boss.subT / gap) + 1);
        while (boss.shots < want) {
            boss.lockX = camera.position.x; boss.lockZ = camera.position.z;
            fireGrenade(); boss.shots++;
        }
        if (boss.shots >= (B.glShots ?? 3)) { boss.sub = 'rest'; boss.subT = 0; }
        return;
    }
    // rest = PERGANTIAN SENJATA GL -> MG. Pasangan dari `mgToGlSec` (MG -> GL):
    // sesudah granat terakhir lepas, lokomotif menahan `cycleGapSec` detik
    // sebelum MG boleh mengunci lagi, jadi kedua arah pergantian senjata sama-
    // sama punya jeda yang bisa dibaca player.
    if (boss.subT >= (B.cycleGapSec ?? 1)) { boss.sub = 'idle'; boss.cycles++; }
}

// Hit-test peluru PLAYER -> lokomotif. Sapuan segmen prev->kini terhadap KOTAK
// badan lokomotif: peluru rifle menempuh puluhan unit per frame, jadi uji titik
// per frame bisa menembus badan selebar 24 unit tanpa tercatat.
function segHitsBox(x0, z0, x1, z1, bx0, bz0, bx1, bz1) {
    if (Math.max(x0, x1) < bx0 || Math.min(x0, x1) > bx1) return false;
    if (Math.max(z0, z1) < bz0 || Math.min(z0, z1) > bz1) return false;
    // Slab clip pada segmen.
    let t0 = 0, t1 = 1;
    const clip = (p, q) => {
        if (Math.abs(p) < 1e-9) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
        return true;
    };
    const dx = x1 - x0, dz = z1 - z0;
    return clip(-dx, x0 - bx0) && clip(dx, bx1 - x0)
        && clip(-dz, z0 - bz0) && clip(dz, bz1 - z0);
}

function damageLoco(d) {
    if (!boss || boss.phase !== 'fight') return;
    boss.hp -= d; boss.hitT = 1;
    if (boss.hp > 0) return;
    boss.hp = 0; boss.phase = 'dead';
    for (const g of enemyTrain.grenades) { g.live = false; g.mesh.visible = false; }
    if (enemyTrain.weapons) enemyTrain.weapons.warn.visible = false;
}

function bulletHits() {
    locoCenter(_wp);
    const x0 = _wp.x - ET_LEN / 2, x1 = _wp.x + ET_LEN / 2;
    const z0 = _wp.z - ET_HALF, z1 = _wp.z + ET_HALF;
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const bx = b.mesh.position.x, bz = b.mesh.position.z;
        if (!segHitsBox(b.px, b.pz, bx, bz, x0, z0, x1, z1)) continue;
        if (b.explosive) {
            queueBoom(bx, b.mesh.position.y, bz, b.explodeR, false, 0, b.damage, b.boomSfx);
            damageLoco(b.damage != null ? b.damage : CFG.grenade.damage);
        } else {
            stats.hits++;
            damageLoco((b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1));
            spawnBloodBurst(bx, 16 + Math.random() * 8, bz, b.dir.x, b.dir.z, 2, 0.5, 1.4, 0xffb24a);
        }
        scene.remove(b.mesh); bullets.splice(i, 1);
        if (boss.phase === 'dead') return;
    }
}

export function updateLocoBoss(dt) {
    if (!boss || !enemyTrain) return;
    const B = bossCfg(), w = enemyTrain.weapons;
    boss.t += dt;
    if (boss.hitT > 0) boss.hitT = Math.max(0, boss.hitT - dt * 6);
    updateGrenades(dt);
    if (boss.phase === 'arm') {
        // Senjata BANGUN: berputar dari posisi stow (lurus ke depan) ke arah
        // player, strip peringatan menyala. Kebal sepanjang jendela ini.
        aimTurret(w.mg, camera.position.x, camera.position.z, dt, 1.8);
        aimTurret(w.gl, camera.position.x, camera.position.z, dt, 1.4);
        w.warn.visible = ((boss.t * 4) | 0) % 2 === 0;
        if (boss.t >= (B.armSec ?? 3)) {
            boss.phase = 'fight'; boss.t = 0; boss.sub = 'idle'; boss.subT = 0;
            w.warn.visible = true;
            addCamShake(3.2); playSFX(sfxTankExplode, 0.35);
        }
        return;
    }
    if (boss.phase === 'fight') {
        updateAttack(dt);
        bulletHits();
    }
}

// Ledakan penutup: dipanggil runtime saat masuk babak `finale`.
export function locoDeathBurst() {
    locoCenter(_wp);
    explodeAt(_wp, 0.1, 0, sfxTankExplode);
    spawnGibs(_wp.x, 12, _wp.z, 10, -1, 0, 1.8, PAL.gunmetal, 0.6, 0x141210);
    addCamShake(5.5);
    // Jangkauan ledakan matinya sengaja TIDAK melukai player: ia berada di
    // seberang rel, dan kematian bos tidak boleh membunuh player.
}
