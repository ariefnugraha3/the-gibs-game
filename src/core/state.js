// State bersama lintas modul + resource geometry/material bersama.
// Binding ES module bersifat LIVE: modul lain mengimpor dan membaca nilai
// terbaru; reassignment hanya lewat fungsi setter di modul pemilik ini.

import { CFG } from './config.js';

// ----------- Status inti game ----------- //
export let isPaused = true;
export let isGameOver = false;
export let score = 0;
export let mode = null;   // 'survival' | 'campaign' — di-set layar pilih mode
// High score disimpan PER difficulty (kunci lama 'gibsHighScore' = fallback
// normal, agar skor pemain lama tidak hilang).
export let difficulty = 'normal';
const hsKey = () => 'gibsHighScore_' + difficulty;
export let highScore = +(localStorage.getItem('gibsHighScore_normal')
    || localStorage.getItem('gibsHighScore') || 0);

export const setPaused = (v) => { isPaused = v; };
export const setGameOver = (v) => { isGameOver = v; };
export const setScore = (v) => { score = v; };
export const addScore = (n) => { score += n; };
export const setMode = (m) => { mode = m; };

// Cheat: god mode (player & Monas KEBAL — HP tak berkurang). Di-toggle lewat
// konsol cheat (tombol `). Dibaca di robots.js (damage player) & survival damageMonas.
export let godMode = false;
export const setGodMode = (v) => { godMode = v; };

// I-frame dodge/evade: player KEBAL selama animasi tumble (di-set player.js saat
// tryDodge mulai, dimatikan saat animasi selesai). Dibaca di robots.js (kedua
// titik damage: cakar & ledakan) berdampingan dgn godMode.
export let dodgeInvuln = false;
export const setDodgeInvuln = (v) => { dodgeInvuln = v; };
export const setHighScore = (v) => { highScore = v; localStorage.setItem(hsKey(), v); };
export const setDifficulty = (name) => {   // dipanggil menu sebelum startGame
    difficulty = name;
    highScore = +(localStorage.getItem(hsKey())
        || (name === 'normal' ? localStorage.getItem('gibsHighScore') : 0) || 0);
};

// ----------- Statistik satu run (layar game over) ----------- //
export const stats = { kills: 0, shots: 0, hits: 0 };
export function resetStats() { stats.kills = 0; stats.shots = 0; stats.hits = 0; }

// ----------- Player & input yang sedang ditekan ----------- //
// Catatan: konstanta kecepatan dikalibrasi pada 60 fps, lalu dikalikan `step`
// (delta-time ternormalisasi) agar gerak konsisten di monitor refresh tinggi.
export const player = {
    hp: 10, grenades: 3, medkits: 0,
    // Upgrade KARAKTER shop Survival (2026-07-13, per-run — reset configurePlayer):
    // maxHp EFEKTIF (dinaikkan item Vitality via hpLvl; SEMUA pembaca max HP
    // memakai field ini, bukan CFG.player.maxHp), tier kap peluru (ammoLvl —
    // kap efektif lewat maxAmmoFor()), dan ARMOR yang dikenakan: armorLvl 0..3
    // (0 = tanpa armor), armor = durability kini, armorMax = durability penuh.
    // Armor memotong `reduce` (CFG.armor.tiers) dari damage masuk; durability
    // menerima damage BASE penuh; 0 -> HANCUR (damagePlayerHp di robots.js).
    maxHp: 100, hpLvl: 1, ammoLvl: 1,
    armorLvl: 0, armor: 0, armorMax: 0,
    // Sistem MAGAZEN DIHAPUS (2026-07-11): tiap senjata = SATU kolam peluru,
    // kap per-senjata dari CFG.weapons.<w>.maxAmmo (rifle 500 / pistol 150 /
    // shotgun 300). Tanpa reload — menembak sampai kolam habis.
    rifle: { ammo: 500 },       // utama ("Assault Rifle")
    pistol: { ammo: 150 },      // secondary; damage peluru sama
    shotgun: { ammo: 300 },     // multi-pelet (shop Survival)
    launcher: { ammo: 50 },     // Grenade Launcher: peluru ledak-saat-kena (shop Survival)
    // SLOT senjata BERURUTAN (maks CFG.weapons.maxWeapons = 3): weapons[0] =
    // tombol 1, weapons[1] = tombol 2, weapons[2] = tombol 3. Survival mulai HANYA
    // pistol (senjata lain dibeli di shop; slot ke-4 minta ganti salah satu);
    // Campaign mulai rifle+pistol. owned = turunan dari weapons (dipakai
    // drops/shop) — sinkron via syncOwnedFromWeapons. Di-set configurePlayer per mode.
    weapons: ['pistol'],
    owned: { pistol: true, rifle: true, shotgun: true, launcher: true },
    // Level upgrade per senjata (shop Survival, 2026-07-12): 1..maxWeaponLevel.
    // Damage efektif = base × (1 + upgradeDamagePct·(lvl−1)) — lihat weaponDamage()
    // di weapons.js. Level bertahan walau senjatanya diganti lalu dibeli lagi
    // (per-run; direset configurePlayer).
    weaponLvl: { rifle: 1, pistol: 1, shotgun: 1, launcher: 1 },
    hasRadar: true,   // radar minimap: Survival mulai TANPA (dibeli di shop); mode lain punya
    isReloading: false, lastShot: 0, reloadTimer: 0, speed: 1.5, radius: 5,
    vy: 0, onGround: true,           // vertikal: gravitasi + jatuh dari tepian (lompat dihapus)
    // Upgrade shop survival (per-run; kembali 1/0 di configurePlayer):
    dmgMul: 1, reloadMul: 1, upDmg: 0, upReload: 0,
    reloadDurMs: 3000                // durasi reload EFEKTIF terakhir (rig KF membacanya)
};

// Rebuild owned dari slot weapons (satu sumber kebenaran). Dipanggil tiap kali
// slot berubah (configurePlayer, beli/ganti senjata di shop).
export function syncOwnedFromWeapons() {
    player.owned = { rifle: false, pistol: false, shotgun: false, launcher: false };
    for (const w of player.weapons) player.owned[w] = true;
}

// Kap peluru EFEKTIF sebuah senjata: base CFG.weapons.<w>.maxAmmo, atau nilai
// tier upgrade Ammo Capacity (CFG.weapons.ammoUpgrades[player.ammoLvl-2]) bila
// sudah dibeli di shop. SEMUA pembaca kap peluru (drops/shop/hud) lewat sini.
export function maxAmmoFor(w) {
    if ((player.ammoLvl || 1) >= 2) {
        const t = (CFG.weapons.ammoUpgrades || [])[player.ammoLvl - 2];
        if (t && t[w] != null) return t[w];
    }
    return CFG.weapons[w].maxAmmo;
}

// Stempel nilai CFG ke player (dipanggil saat boot & resetGame)
export function configurePlayer() {
    player.maxHp = CFG.player.maxHp;
    player.hp = player.maxHp;
    player.hpLvl = 1;
    player.ammoLvl = 1;
    player.armorLvl = 0; player.armor = 0; player.armorMax = 0;
    player.speed = CFG.player.speed;
    player.radius = CFG.player.radius;
    player.medkits = 0;
    // Tanpa magazen: mulai dgn kolam peluru PENUH per senjata (kap efektif)
    for (const w of ['rifle', 'pistol', 'shotgun', 'launcher'])
        player[w].ammo = maxAmmoFor(w);
    // Slot senjata awal per mode (maks 3): Survival mulai pistol saja (beli
    // senjata lain di shop); Campaign & mode lain mulai rifle + pistol
    // (shotgun & Grenade Launcher hanya dari shop Survival). owned diturunkan dari slot ini.
    const survivalStart = mode === 'survival';
    player.weapons = survivalStart ? ['pistol'] : ['rifle', 'pistol'];
    syncOwnedFromWeapons();
    // Radar: Survival mulai TANPA radar (dibeli di shop, item "Radar"); mode lain langsung ada.
    player.hasRadar = !survivalStart;
    player.dmgMul = 1; player.reloadMul = 1;
    player.upDmg = 0; player.upReload = 0;
    player.weaponLvl = { rifle: 1, pistol: 1, shotgun: 1, launcher: 1 };
}

export const keys = { w: false, a: false, s: false, d: false };   // Shift kini = dodge (aksi diskret), bukan tombol tahan
export const mouse = { isDown: false };

// ----------- Container entitas (di-splice mundur di update) ----------- //
export const bullets = [];
export const enemyBullets = [];   // peluru DITEMBAKKAN robot ranged (kelas B/A) -> melukai player
export const robots = [];
export const grenades = [];
export const explosions = [];
export const drops = [];

// ----------- Geometry & Material bersama (hemat alokasi/GC) ----------- //
export const GEO = {
    bullet: new THREE.SphereGeometry(0.8, 6, 6),
    grenade: new THREE.SphereGeometry(1.5, 8, 8),
    explosion: new THREE.SphereGeometry(1, 16, 16),
    dropNade: new THREE.SphereGeometry(1, 8, 8),
    ring: new THREE.RingGeometry(0.75, 1, 32),   // gelombang kejut / cincin debu
};
export const MAT = {
    bullet: new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false }),       // tracer terang (ikut bloom)
    enemyBullet: new THREE.MeshBasicMaterial({ color: 0x55b8ff, toneMapped: false }),   // peluru robot (BIRU plasma, beda dari tracer kuning player)
    grenade: new THREE.MeshLambertMaterial({ color: 0x2ecc71, emissive: 0x0a3d1e }),
    dropNade: new THREE.MeshLambertMaterial({ color: 0x2ecc71, emissive: 0x0e4d24 }),
};

// Vektor scratch yang dipakai ulang tiap frame (hindari alokasi di loop)
export const _dir = new THREE.Vector3();
export const _right = new THREE.Vector3();
export const _tip = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _sRight = new THREE.Vector3(), _sUp = new THREE.Vector3();   // basis sebar peluru
export const _kickEuler = new THREE.Euler(0, 0, 0, 'YXZ');                // tendangan recoil kamera

// Bersihkan satu array entitas: dispose material per-entitas (bahan bersama
// MAT.* di-skip), padamkan lampu pool (tetap di scene), lepaskan mesh.
export function clearArray(arr, scene) {
    arr.forEach(o => {
        if (o.mesh.material && o.mesh.material.dispose && o.mesh.material !== MAT.bullet
            && o.mesh.material !== MAT.enemyBullet
            && o.mesh.material !== MAT.grenade && o.mesh.material !== MAT.dropNade) o.mesh.material.dispose();
        if (o.light) o.light.intensity = 0;   // lampu pool: cukup dipadamkan, tetap di scene
        scene.remove(o.mesh);
    });
    arr.length = 0;
}
