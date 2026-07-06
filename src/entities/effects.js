// Efek visual berdaur hidup: ledakan (pool lampu tetap), percikan darah
// (pool sprite tetap), dan cincin debu/percikan generik.

import { CFG } from '../core/config.js';
import { GEO, explosions, zombies } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { makeTexture } from '../utils/textures.js';
import { playSFX, sfxExplode } from '../utils/sfx.js';
import { spawnDrop } from './drops.js';
import { killZombie } from './zombies.js';
import { updateUI } from '../core/hud.js';

// Pool 3 lampu ledakan, selalu di scene dengan intensity 0:
// jumlah lampu konstan -> Three.js tidak compile ulang shader saat granat meledak.
const explosionLights = [];
let nextExplosionLight = 0;

// Pool sprite percikan darah: JUMLAH TETAP — 14 sprite dibuat SEKALI
// (visible=false saat idle) lalu dipakai bergilir oleh spawnBlood(). Nol
// alokasi geometri/material/dispose per tembakan agar performa tidak turun.
const bloodPool = [];
let nextBlood = 0;

export function initEffects(sc) {
    for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xff8a3d, 0, 260, 2);
        sc.add(l);
        explosionLights.push(l);
    }

    const bloodTex = makeTexture(64, 64, (g) => {
        // splat: blob pusat + tetesan acak di sekitarnya (latar transparan)
        const blob = (x, y, r, a) => {
            const rg = g.createRadialGradient(x, y, 0, x, y, r);
            rg.addColorStop(0, `rgba(130,16,14,${a})`);
            rg.addColorStop(0.65, `rgba(92,10,10,${a * 0.85})`);
            rg.addColorStop(1, 'rgba(70,8,8,0)');
            g.fillStyle = rg;
            g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
        };
        blob(32, 32, 15, 0.95);
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * 6.283, d = 12 + Math.random() * 16;
            blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5 + Math.random() * 3.5, 0.9);
        }
    });
    for (let i = 0; i < 14; i++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
            map: bloodTex, transparent: true, opacity: 0, depthWrite: false
        }));
        spr.visible = false;
        sc.add(spr);
        bloodPool.push({ spr, life: 0, s0: 3 });
    }
}

// radius opsional: default blast granat; ledakan exploder memakai radius
// lebih kecil (CFG.zombie.variants.exploder.boomRadius) lewat parameter ini.
export function explodeAt(pos, radius) {
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
    for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        if (z.mesh.position.distanceTo(pos) < R) {
            // Boss tidak instakill oleh ledakan — menerima damage granat tetap
            // (kalau tidak, satu granat menamatkan boss ber-HP 60).
            if (z.noInstakill) {
                z.hp -= CFG.campaign.boss.grenadeDamage;
                if (z.hp > 0) continue;
            }
            spawnDrop(z.mesh.position);
            killZombie(i);
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

// Percikan darah di titik peluru mengenai zombie — ambil sprite dari pool tetap
// (round-robin). Sprite menghadap kamera dan digeser ~1.5 unit ke arah kamera
// supaya tidak terbenam di dalam badan zombie. Dipudarkan di updateBloodPool().
export function spawnBlood(x, y, z) {
    const bl = bloodPool[nextBlood++ % bloodPool.length];
    const dx = camera.position.x - x, dy = camera.position.y - y, dz = camera.position.z - z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    bl.spr.position.set(x + dx / dl * 1.5, y + dy / dl * 1.5, z + dz / dl * 1.5);
    bl.spr.material.rotation = Math.random() * 6.283;   // roll acak tiap percikan
    bl.s0 = 2.2 + Math.random() * 1.2;
    bl.spr.scale.setScalar(bl.s0);
    bl.spr.material.opacity = 0.95;
    bl.life = 1;
    bl.spr.visible = true;
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

// --- Percikan darah (pool tetap): membesar sedikit + memudar cepat.
// Loop selalu 14 iterasi ringan; yang idle (life<=0) langsung dilewati. ---
export function updateBloodPool(dt) {
    for (let i = 0; i < bloodPool.length; i++) {
        const bl = bloodPool[i];
        if (bl.life <= 0) continue;
        bl.life -= dt * 3.2;   // umur ~0.31 dtk
        bl.spr.scale.setScalar(bl.s0 * (1 + (1 - Math.max(0, bl.life)) * 0.9));
        bl.spr.material.opacity = Math.max(0, bl.life) * 0.95;
        if (bl.life <= 0) bl.spr.visible = false;
    }
}

// Pool tetap: cukup disembunyikan saat reset (tanpa dispose)
export function resetBloodPool() {
    bloodPool.forEach(bl => { bl.life = 0; bl.spr.visible = false; });
}
