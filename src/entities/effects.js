// Efek visual berdaur hidup: ledakan (pool lampu tetap), percikan darah
// (pool sprite tetap), dan cincin debu/percikan generik.

import { CFG } from '../core/config.js';
import { GEO, explosions, robots } from '../core/state.js';
import { scene, viewCam } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { makeTexture } from '../utils/textures.js';
import { playSFX, sfxExplode } from '../utils/sfx.js';
import { spawnDrop } from './drops.js';
import { killRobot } from './robots.js';
import { detonateBarrelsInRadius } from './barrels.js';   // call-time (circular aman)
import { crateBlastHits } from './crates.js';             // call-time (circular aman)
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

// ===== KILAT MONCONG ROBOT (2026-07-27) =====
// Sebelumnya tembakan robot A/B TIDAK punya kilat sama sekali — bola plasma
// muncul begitu saja dari udara, jadi tembakannya tak pernah terbaca sebagai
// "letusan". Pool TETAP (dibuat sekali di initEffects, `visible=false` saat
// idle) berisi bidang datar ber-blending aditif, DIREBAHKAN menghadap ke atas
// persis seperti kilat moncong player supaya terlihat dari kamera top-down.
// PENTING: pool ini SENGAJA TANPA PointLight — jumlah lampu harus konstan
// (invarian "no mid-game shader recompile"); terangnya datang dari material
// aditif + bloom. Materialnya milik masing-masing entri (opasitas per kilat)
// tapi dibuat SEKALI, dan programnya sama dgn kilat moncong player yang sudah
// ikut warm-up.
const MUZZLE_COUNT = 10;
const muzzlePool = [];
let nextMuzzle = 0;

// ===== SELONGSONG PELURU TERLEMPAR (2026-07-28) =====
// Detail sinematik tembakan player: tiap letusan MELONTARKAN selongsong kuningan
// dari port ejeksi ke KANAN-belakang senjata, berputar di udara, memantul sekali
// di lantai, lalu memudar. Pool TETAP (dibuat sekali, `visible=false` saat idle)
// — nol alokasi per tembakan, dan karena senapan bisa memuntahkan 8 tembakan/dtk
// jumlahnya sengaja lega. Ukurannya SENGAJA dilebih-lebihkan (~13 cm) supaya
// terbaca dari kamera top-down; selongsong seukuran aslinya tak akan terlihat.
const CASING_COUNT = 20;
const CASING_G = 150;      // gravitasi selongsong (unit/dtk²) — busur pendek & cepat
const casingPool = [];
let nextCasing = 0;

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
        bloodPool.push({ spr, life: 0, s0: 3, vx: 0, vy: 0, vz: 0, gy: 0 });
    }

    // Kilat moncong: bintang 4 lidah api + inti pijar (sama gaya dgn milik player).
    const muzzleTex = makeTexture(64, 64, (g) => {
        g.translate(32, 32);
        const core = g.createRadialGradient(0, 0, 0, 0, 0, 13);
        core.addColorStop(0, 'rgba(255,255,255,1)');
        core.addColorStop(0.45, 'rgba(255,224,150,0.85)');
        core.addColorStop(1, 'rgba(255,170,60,0)');
        g.fillStyle = core;
        g.beginPath(); g.arc(0, 0, 13, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(255,214,130,0.92)';
        for (let i = 0; i < 4; i++) {
            g.rotate(Math.PI / 2);
            g.beginPath();
            g.moveTo(0, -2.6); g.lineTo(29, 0); g.lineTo(0, 2.6);
            g.closePath(); g.fill();
        }
    });
    const muzzleGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MUZZLE_COUNT; i++) {
        const m = new THREE.Mesh(muzzleGeo, new THREE.MeshBasicMaterial({
            map: muzzleTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
            depthWrite: false, depthTest: false, toneMapped: false
        }));
        m.rotation.x = -Math.PI / 2;   // REBAH menghadap atas (terbaca dari kamera top-down)
        m.renderOrder = 9;
        m.visible = false;
        sc.add(m);
        muzzlePool.push({ mesh: m, life: 0, s0: 1 });
    }

    // Selongsong: SATU geometri bersama, material per-entri (opasitas memudar
    // sendiri-sendiri) — program GPU sama, jadi tetap satu kali kompilasi.
    const casingGeo = new THREE.CylinderGeometry(0.2, 0.22, 1.0, 6);
    for (let i = 0; i < CASING_COUNT; i++) {
        const m = new THREE.Mesh(casingGeo, new THREE.MeshLambertMaterial({
            color: 0xc79a3a, emissive: 0x2a1c06, transparent: true, opacity: 1
        }));
        m.visible = false;
        sc.add(m);
        casingPool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, gy: 0, rest: false });
    }
}

// Lontarkan satu selongsong dari (x,y,z). (dirX,dirZ) = arah HADAP senjata;
// selongsong keluar ke KANAN + sedikit ke belakang & atas, lalu berputar.
// `power` menskalakan kecepatan (shotgun melempar lebih jauh).
export function spawnShellCasing(x, y, z, dirX, dirZ, power = 1) {
    if (!casingPool.length) return;
    const c = casingPool[nextCasing++ % casingPool.length];
    const rx = -dirZ, rz = dirX;                       // vektor KANAN dari arah hadap
    const sp = (10 + Math.random() * 6) * power;
    c.vx = rx * sp - dirX * 3 + (Math.random() - 0.5) * 3;
    c.vz = rz * sp - dirZ * 3 + (Math.random() - 0.5) * 3;
    c.vy = (12 + Math.random() * 6) * power;
    c.sx = (Math.random() - 0.5) * 26;                 // kecepatan putar (tumbling)
    c.sy = (Math.random() - 0.5) * 26;
    c.sz = (Math.random() - 0.5) * 26;
    c.rest = false;
    c.life = 1;
    c.gy = sceneGroundY(x, z, y);
    c.mesh.position.set(x, y, z);
    c.mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    c.mesh.material.opacity = 1;
    c.mesh.visible = true;
}

// Debug/uji: jumlah selongsong yang sedang terbang/tergeletak.
export const shellCasingDebug = () => casingPool.reduce((n, c) => n + (c.life > 0 ? 1 : 0), 0);

// Pemanasan pra-game (core/preload.js): pinjam SATU selongsong supaya program
// Lambert-transparannya ikut terkompilasi sebelum tembakan pertama.
export function borrowShellCasing() {
    return casingPool.length ? casingPool[0].mesh : null;
}

// Selongsong: balistik + tumbling, memantul di lantai lalu diam & memudar.
// Menumpang loop ledakan (tanpa updater baru); entri idle langsung dilewati.
export function updateShellCasings(dt) {
    for (let i = 0; i < casingPool.length; i++) {
        const c = casingPool[i];
        if (c.life <= 0) continue;
        c.life -= dt * 0.7;                                   // ~1,4 dtk umur
        if (!c.rest) {
            c.vy -= CASING_G * dt;
            const p = c.mesh.position;
            p.x += c.vx * dt; p.y += c.vy * dt; p.z += c.vz * dt;
            c.mesh.rotation.x += c.sx * dt;
            c.mesh.rotation.y += c.sy * dt;
            c.mesh.rotation.z += c.sz * dt;
            if (p.y <= c.gy + 0.22) {                          // menyentuh lantai
                p.y = c.gy + 0.22;
                if (c.vy < -14) {                              // masih deras -> MEMANTUL
                    c.vy = -c.vy * 0.34;
                    c.vx *= 0.55; c.vz *= 0.55;
                    c.sx *= 0.5; c.sy *= 0.5; c.sz *= 0.5;
                } else {                                       // diam: rebah di lantai
                    c.rest = true;
                    c.mesh.rotation.set(Math.PI / 2, c.mesh.rotation.y, 0);
                }
            }
        }
        if (c.life < 0.35) c.mesh.material.opacity = Math.max(0, c.life / 0.35);
        if (c.life <= 0) { c.mesh.visible = false; c.mesh.material.opacity = 1; }
    }
}

// Pool tetap: cukup disembunyikan saat reset (tanpa dispose)
export function resetShellCasings() {
    casingPool.forEach(c => { c.life = 0; c.rest = false; c.mesh.visible = false; c.mesh.material.opacity = 1; });
}

// Nyalakan satu kilat moncong di titik dunia (x,y,z). `yaw` = arah tembak
// (kilat diputar mengikutinya), `scale` = besar kilat (kelas A lebih besar).
// Round-robin: kilat tertua ditimpa bila 10 tembakan berbarengan.
export function spawnMuzzleFlash(x, y, z, yaw = 0, scale = 4) {
    if (!muzzlePool.length) return;
    const f = muzzlePool[nextMuzzle++ % muzzlePool.length];
    f.mesh.position.set(x, y, z);
    f.mesh.rotation.set(-Math.PI / 2, 0, yaw + Math.random() * 0.6);   // roll acak = tiap letusan beda
    f.s0 = scale;
    f.mesh.scale.setScalar(scale);
    f.mesh.material.opacity = 1;
    f.mesh.visible = true;
    f.life = 1;
}

// Debug/uji: jumlah kilat moncong yang sedang menyala.
export const muzzleFlashDebug = () => muzzlePool.reduce((n, f) => n + (f.life > 0 ? 1 : 0), 0);
// Debug/uji: LEBAR kilat terbesar yang sedang menyala (bidangnya PlaneGeometry(1,1),
// jadi skala = lebar dunia). Terpisah dari muzzleFlashDebug karena yang itu
// dibandingkan dengan `===` sebagai cacah di beberapa assert. Dipakai smoke untuk
// menjaga "tembakan musuh harus terbaca" tanpa mematok angka skala apa pun.
export const muzzleFlashSizeDebug = () =>
    muzzlePool.reduce((w, f) => (f.life > 0 ? Math.max(w, f.mesh.scale.x) : w), 0);

// Pemanasan pra-game (core/preload.js): pinjam SATU bidang kilat moncong supaya
// TEKSTUR-nya ikut terunggah di frame pemanasan. Programnya sama dgn kilat
// moncong player, tapi teksturnya beda — tanpa ini, unggahan tekstur terjadi
// pada tembakan robot A/B PERTAMA (persis saat aksi mulai). Pemanggil wajib
// mengembalikan visible/opacity-nya + menaruhnya lagi ke scene.
export function borrowMuzzleFlash() {
    return muzzlePool.length ? muzzlePool[0].mesh : null;
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
// `sfx` (2026-07-19, opsional): klip ledakan pengganti default grenade-explode —
// roket Lv3 = rocket-explode, proyektil tank = tank-explosive-attack, tank mati
// = tank-explode (diteruskan queueBoom atau pemanggil langsung).
export function explodeAt(pos, radius, dmg, sfx) {
    const expMesh = new THREE.Mesh(
        GEO.explosion,
        new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.85 })
    );
    expMesh.position.copy(pos);
    expMesh.scale.setScalar(1);
    scene.add(expMesh);
    // Kilat cahaya dari pool (visual saja; radius blast dari CFG.grenade.killRadius)
    const gy = sceneGroundY(pos.x, pos.z, pos.y);
    const flash = explosionLights[nextExplosionLight++ % explosionLights.length];
    flash.position.set(pos.x, gy + 14, pos.z);
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
    shock.position.set(pos.x, gy + 0.8, pos.z);
    scene.add(shock);
    explosions.push({ mesh: shock, life: 1, scale: 95 });
    playSFX(sfx || sfxExplode);

    const R = radius != null ? radius : CFG.grenade.killRadius + 3.5;
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.invuln) continue;   // belum boleh dilukai (mis. masih tersegel di gerbong musuh)
        if (z.mesh.position.distanceTo(pos) < R) {
            // PINTU TERTUTUP menahan ledakan (2026-07-19, permintaan user):
            // hook scene opsional blastBlocked (stage 1-3 -> doorBlocksShot) —
            // ruas pusat ledakan -> robot yang terhalang daun pintu tertutup
            // berarti robot di balik pintu TIDAK kena AoE launcher.
            if (activeScene && activeScene.blastBlocked
                && activeScene.blastBlocked(pos.x, pos.z, z.mesh.position.x, z.mesh.position.z, pos.y)) continue;
            // Model damage: boss tahan (grenadeDamage khusus, TIDAK terpengaruh
            // upgrade); robot lain kena dmg param (peluru launcher, sudah ber-level)
            // atau default CFG.grenade.damage — dikurangi armor kelas (0 saat ini).
            const d = z.kind === 'boss' ? CFG.campaign.bosses.giant.grenadeDamage
                : (dmg != null ? dmg : CFG.grenade.damage);
            z.hp -= Math.max(1, d - (z.armor || 0));
            if (z.hp > 0) continue;
            spawnDrop(z.mesh.position);
            // GORE: mati oleh ledakan = HANCUR (dismember). Arah = keluar dari pusat ledakan.
            killRobot(i, { cause: 'explosion', dirx: z.mesh.position.x - pos.x, dirz: z.mesh.position.z - pos.z });
        }
    }
    // Rambatan BAREL PELEDAK: barel dalam radius ikut meledak (chain). Antre boom
    // baru diproses di while-loop processPendingBooms yang sama (bukan rekursi).
    detonateBarrelsInRadius(pos.x, pos.z, R);
    crateBlastHits(pos.x, pos.z, R);   // peti dlm radius ikut pecah (isinya berhamburan)
    updateUI();
}

// Cincin debu/percikan di ketinggian y — visual murni; menumpang daur hidup array
// explosions (loop ledakan menangani skala, pudar opasitas, dispose, dan splice).
// TINGGI TANAH DI SATU TITIK (2026-08-10, laporan user: di ujung turunan
// Pasupati "ledakan dan pecahan musuh masih melayang di atas"). Semua FX yang
// menyentuh tanah DULU memakai y=0 mati — benar selama semua lantai ada di y=0,
// tetapi jalan Stage 7 turun 12 m sepanjang 200 m terakhir, jadi cincin ledakan,
// percikan coolant dan genangan menggantung 84 unit di atas aspal. Satu-satunya
// sumber kebenaran tetap hook `activeScene.groundHeight`.
export function sceneGroundY(x, z, feetY = 0) {
    return (activeScene && activeScene.groundHeight)
        ? activeScene.groundHeight(x, z, feetY) : 0;
}

export function spawnGroundPuff(x, z, color, scale, y = 0.6) {
    const m = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
    explosions.push({ mesh: m, life: 1, scale });
}

// Efek tembakan di lantai (2026-07-16): dipanggil bullets.js saat peluru
// berakhir di BATAS KURSOR tanpa mengenai apa pun — kilat percik kecil +
// cincin debu tepat di titik kursor saat tembakan dilepas. Tinggi lantai
// dari hook scene aktif (groundHeight; y = tinggi peluru, agar puncak
// standable [atap bangkai mobil dsb] ikut dihitung). Menumpang pool
// explosions via spawnGroundPuff — tanpa material/lampu baru.
export function spawnBulletFloorHit(x, z, y = 0) {
    const gy = sceneGroundY(x, z, y);
    spawnGroundPuff(x, z, 0xffd28a, 4, gy + 0.8);   // percik terang (amber)
    spawnGroundPuff(x, z, 0x8f8579, 7, gy + 0.5);   // debu
}

// Satu percikan cairan dari pool tetap (round-robin). Opsional kecepatan
// (vx/vy/vz) = MUNCRAT keluar lalu jatuh (updateBloodPool); `color` = warna
// cairan (default coolant hijau; darah player = merah). Sprite sedikit
// digeser ke kamera render supaya tidak terbenam di dalam badan.
export function spawnBlood(x, y, z, vx = 0, vy = 0, vz = 0, color = COOLANT_HEX,
    groundY = null) {
    const bl = bloodPool[nextBlood++ % bloodPool.length];
    // Dihitung SEKALI per percikan (atau diwariskan dari semburannya): pada
    // stage berlantai banyak blocker, memanggil groundHeight per partikel per
    // frame jauh lebih mahal daripada menyimpannya.
    bl.gy = groundY != null ? groundY : sceneGroundY(x, z, y);
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
    const gy = sceneGroundY(x, z, y);   // satu kali untuk seluruh semburan
    for (let i = 0; i < n; i++) {
        const ang = base + (Math.random() - 0.5) * spread;
        const spd = (7 + Math.random() * 24) * power;
        spawnBlood(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3,
            Math.cos(ang) * spd, 5 + Math.random() * 22 * power, Math.sin(ang) * spd, color, gy);
    }
}

// --- Animasi ledakan (membesar + memudar + kilat cahaya meredup) ---
// Sekaligus meluruhkan pool KILAT MONCONG: menumpang updater yang sudah ada
// supaya urutan blok updateGame (kontrak) tidak bertambah.
export function updateExplosions(dt) {
    updateMuzzleFlashes(dt);
    updateShellCasings(dt);
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

// --- Kilat moncong (pool tetap): SANGAT singkat (~70 ms) + MENGEMBANG sedikit
// sambil memudar; menumpang loop ledakan supaya tak ada updater baru. ---
export function updateMuzzleFlashes(dt) {
    for (let i = 0; i < muzzlePool.length; i++) {
        const f = muzzlePool[i];
        if (f.life <= 0) continue;
        f.life -= dt * 14;                       // umur ~0.07 dtk = letusan, bukan lampu
        const k = Math.max(0, f.life);
        f.mesh.scale.setScalar(f.s0 * (1 + (1 - k) * 0.55));
        f.mesh.material.opacity = k;
        if (f.life <= 0) f.mesh.visible = false;
    }
}

// Pool tetap: cukup disembunyikan saat reset (tanpa dispose)
export function resetMuzzleFlashes() {
    muzzlePool.forEach(f => { f.life = 0; f.mesh.visible = false; });
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
        if (bl.spr.position.y < bl.gy + 0.4) {
            bl.spr.position.y = bl.gy + 0.4;
            bl.vx *= 0.6; bl.vz *= 0.6; bl.vy = 0;
        }
        bl.spr.scale.setScalar(bl.s0 * (1 + (1 - Math.max(0, bl.life)) * 0.5));
        bl.spr.material.opacity = Math.max(0, bl.life) * 0.95;
        if (bl.life <= 0) bl.spr.visible = false;
    }
}

// Debug/uji: percikan yang sedang hidup + tinggi tanah yang dipakainya (dipakai
// smoke membuktikan percikan mengendap di ASPAL, bukan menggantung di y=0).
export const bloodPoolDebug = () => bloodPool.filter(bl => bl.life > 0).map(bl => ({
    x: bl.spr.position.x, y: bl.spr.position.y, z: bl.spr.position.z, gy: bl.gy,
}));

// Pool tetap: cukup disembunyikan saat reset (tanpa dispose)
export function resetBloodPool() {
    bloodPool.forEach(bl => { bl.life = 0; bl.spr.visible = false; });
}
