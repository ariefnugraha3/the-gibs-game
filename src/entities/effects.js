// Efek visual berdaur hidup: ledakan (pool lampu tetap), percikan darah
// (pool sprite tetap), dan cincin debu/percikan generik.

import { CFG } from '../core/config.js';
import { GEO, explosions, robots } from '../core/state.js';
import { scene, viewCam } from '../core/renderer.js';
import { makeTexture } from '../utils/textures.js';
import { playSFX, sfxExplode } from '../utils/sfx.js';
import { spawnDrop } from './drops.js';
import { killRobot } from './robots.js';
import { updateUI } from '../core/hud.js';

// Pool 3 lampu ledakan, selalu di scene dengan intensity 0:
// jumlah lampu konstan -> Three.js tidak compile ulang shader saat granat meledak.
const explosionLights = [];
let nextExplosionLight = 0;

// Pool sprite percikan darah: JUMLAH TETAP — 48 sprite dibuat SEKALI
// (visible=false saat idle) lalu dipakai bergilir oleh spawnBlood(). Nol
// alokasi geometri/material/dispose per tembakan agar performa tidak turun.
// GORE 2026-07-11: tiap percikan kini punya kecepatan (vx/vy/vz) -> darah
// MUNCRAT keluar & jatuh (bukan diam), dipakai spawnBloodBurst().
const bloodPool = [];
let nextBlood = 0;
const BLOOD_COUNT = 72;
// Warna cairan default: COOLANT hijau robot. Darah MERAH player dipilih pemanggil
// lewat parameter warna spawnBlood/spawnBloodBurst (robots.js, PLAYER_BLOOD_HEX).
export const COOLANT_HEX = 0x49e07c;

export function initEffects(sc) {
    for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xff8a3d, 0, 260, 2);
        sc.add(l);
        explosionLights.push(l);
    }

    // Tekstur percikan NETRAL putih (2026-07-12): bentuk splat (blob + tetesan)
    // digambar putih dan DIWARNAI per-spawn lewat material.color — satu pool
    // melayani DUA cairan: COOLANT hijau (robot) dan DARAH merah (player kena).
    const bloodTex = makeTexture(64, 64, (g) => {
        // splat: blob pusat + tetesan acak di sekitarnya (latar transparan)
        const blob = (x, y, r, a) => {
            const rg = g.createRadialGradient(x, y, 0, x, y, r);
            rg.addColorStop(0, `rgba(255,255,255,${a})`);
            rg.addColorStop(0.65, `rgba(235,235,235,${a * 0.85})`);
            rg.addColorStop(1, 'rgba(210,210,210,0)');
            g.fillStyle = rg;
            g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
        };
        blob(32, 32, 15, 0.95);
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * 6.283, d = 12 + Math.random() * 16;
            blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5 + Math.random() * 3.5, 0.9);
        }
    });
    for (let i = 0; i < BLOOD_COUNT; i++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
            map: bloodTex, color: COOLANT_HEX, transparent: true, opacity: 0, depthWrite: false
        }));
        spr.visible = false;
        sc.add(spr);
        bloodPool.push({ spr, life: 0, s0: 3, vx: 0, vy: 0, vz: 0 });
    }
}

// Pemanasan pra-game (core/preload.js): pinjam 1 sprite darah dari pool supaya
// program sprite + teksturnya ikut terkompilasi/terunggah di frame pemanasan.
// Pemanggil wajib mengembalikan visibilitas/opasitasnya dan menaruhnya lagi
// ke scene (reparent ke grup warmup otomatis melepasnya dari scene).
export function borrowBloodSprite() {
    return bloodPool.length ? bloodPool[0].spr : null;
}

// radius & dmg opsional: default = blast granat (killRadius+3.5, damage
// CFG.grenade.damage). Peluru Grenade Launcher meneruskan radius + b.damage-nya
// sendiri (b.damage sudah termasuk bonus level upgrade shop Survival).
export function explodeAt(pos, radius, dmg) {
    const expMesh = new THREE.Mesh(
        GEO.explosion,
        new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.85 })
    );
    expMesh.position.copy(pos);
    expMesh.scale.setScalar(1);
    scene.add(expMesh);
    // Kilat cahaya dari pool (visual saja; radius blast dari CFG.grenade.killRadius)
    const flash = explosionLights[nextExplosionLight++ % explosionLights.length];
    flash.position.set(pos.x, 14, pos.z);
    flash.intensity = 7;
    explosions.push({ mesh: expMesh, light: flash, life: 1, scale: 40 });   // life 0..1
    // Inti putih menyilaukan (ditangkap bloom) + gelombang kejut cincin di tanah
    const core = new THREE.Mesh(GEO.explosion, new THREE.MeshBasicMaterial({
        color: 0xfff2c0, transparent: true, opacity: 0.95, toneMapped: false
    }));
    core.position.copy(pos);
    scene.add(core);
    explosions.push({ mesh: core, life: 1, scale: 20 });
    const shock = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
        color: 0xffa040, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    shock.rotation.x = -Math.PI / 2;
    shock.position.set(pos.x, 0.8, pos.z);
    scene.add(shock);
    explosions.push({ mesh: shock, life: 1, scale: 95 });
    playSFX(sfxExplode);

    const R = radius != null ? radius : CFG.grenade.killRadius + 3.5;
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.mesh.position.distanceTo(pos) < R) {
            // Model damage: boss tahan (grenadeDamage khusus, TIDAK terpengaruh
            // upgrade); robot lain kena dmg param (peluru launcher, sudah ber-level)
            // atau default CFG.grenade.damage — dikurangi armor kelas (0 saat ini).
            const d = z.kind === 'boss' ? CFG.campaign.boss.grenadeDamage
                : (dmg != null ? dmg : CFG.grenade.damage);
            z.hp -= Math.max(1, d - (z.armor || 0));
            if (z.hp > 0) continue;
            spawnDrop(z.mesh.position);
            // GORE: mati oleh ledakan = HANCUR (dismember). Arah = keluar dari pusat ledakan.
            killRobot(i, { cause: 'explosion', dirx: z.mesh.position.x - pos.x, dirz: z.mesh.position.z - pos.z });
        }
    }
    updateUI();
}

// Cincin debu/percikan di ketinggian y — visual murni; menumpang daur hidup array
// explosions (loop ledakan menangani skala, pudar opasitas, dispose, dan splice).
export function spawnGroundPuff(x, z, color, scale, y = 0.6) {
    const m = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
    explosions.push({ mesh: m, life: 1, scale });
}

// Satu percikan cairan dari pool tetap (round-robin). Opsional kecepatan
// (vx/vy/vz) = MUNCRAT keluar lalu jatuh (updateBloodPool); `color` = warna
// cairan (default coolant hijau; darah player = merah). Sprite sedikit
// digeser ke kamera render supaya tidak terbenam di dalam badan.
export function spawnBlood(x, y, z, vx = 0, vy = 0, vz = 0, color = COOLANT_HEX) {
    const bl = bloodPool[nextBlood++ % bloodPool.length];
    const dx = viewCam.position.x - x, dy = viewCam.position.y - y, dz = viewCam.position.z - z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    bl.spr.position.set(x + dx / dl * 1.2, y + dy / dl * 1.2, z + dz / dl * 1.2);
    bl.spr.material.color.setHex(color);
    bl.vx = vx; bl.vy = vy; bl.vz = vz;
    bl.spr.material.rotation = Math.random() * 6.283;   // roll acak tiap percikan
    bl.s0 = 1.4 + Math.random() * 1.5;
    bl.spr.scale.setScalar(bl.s0);
    bl.spr.material.opacity = 0.98;
    bl.life = 1;
    bl.spr.visible = true;
}

// Semburan darah: `n` percikan terlempar sebagai kerucut ke arah (dirx,dirz) +
// ke atas. `spread` = lebar kerucut (rad; default ±1.05; pakai 6.283 = 360° utk
// ledakan → darah ke SEGALA arah). Dipakai saat peluru mengenai & (jauh lebih
// deras + omni) saat robot hancur oleh ledakan.
export function spawnBloodBurst(x, y, z, dirx, dirz, n, power = 1, spread = 2.1, color = COOLANT_HEX) {
    const dl = Math.hypot(dirx, dirz) || 1;
    const base = Math.atan2(dirz / dl, dirx / dl);
    for (let i = 0; i < n; i++) {
        const ang = base + (Math.random() - 0.5) * spread;
        const spd = (7 + Math.random() * 24) * power;
        spawnBlood(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3,
            Math.cos(ang) * spd, 5 + Math.random() * 22 * power, Math.sin(ang) * spd, color);
    }
}

// --- Animasi ledakan (membesar + memudar + kilat cahaya meredup) ---
export function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const e = explosions[i];
        e.life -= dt * 3;
        const s = e.scale * (1 - e.life * 0.5);
        e.mesh.scale.setScalar(Math.max(0.1, s));
        e.mesh.material.opacity = Math.max(0, e.life * 0.85);
        if (e.light) e.light.intensity = Math.max(0, e.life) * 7;
        if (e.life <= 0) {
            e.mesh.material.dispose();
            scene.remove(e.mesh);
            if (e.light) e.light.intensity = 0;   // lampu pool tetap di scene
            explosions.splice(i, 1);
        }
    }
}

// --- Percikan darah (pool tetap): muncrat keluar (kecepatan + gravitasi),
// membesar sedikit, lalu memudar. Loop ringan; yang idle langsung dilewati. ---
export function updateBloodPool(dt) {
    for (let i = 0; i < bloodPool.length; i++) {
        const bl = bloodPool[i];
        if (bl.life <= 0) continue;
        bl.life -= dt * 1.7;   // umur ~0.6 dtk (cukup utk melihat semburannya)
        bl.vy -= 62 * dt;      // gravitasi darah
        bl.spr.position.x += bl.vx * dt;
        bl.spr.position.y += bl.vy * dt;
        bl.spr.position.z += bl.vz * dt;
        if (bl.spr.position.y < 0.4) { bl.spr.position.y = 0.4; bl.vx *= 0.6; bl.vz *= 0.6; bl.vy = 0; }
        bl.spr.scale.setScalar(bl.s0 * (1 + (1 - Math.max(0, bl.life)) * 0.5));
        bl.spr.material.opacity = Math.max(0, bl.life) * 0.95;
        if (bl.life <= 0) bl.spr.visible = false;
    }
}

// Pool tetap: cukup disembunyikan saat reset (tanpa dispose)
export function resetBloodPool() {
    bloodPool.forEach(bl => { bl.life = 0; bl.spr.visible = false; });
}
