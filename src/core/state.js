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
// konsol cheat (tombol `). Dibaca di zombies.js (damage player) & survival damageMonas.
export let godMode = false;
export const setGodMode = (v) => { godMode = v; };
export const setHighScore = (v) => { highScore = v; localStorage.setItem(hsKey(), v); };
export const setDifficulty = (name) => {   // dipanggil menu sebelum startGame
    difficulty = name;
    highScore = +(localStorage.getItem(hsKey())
        || (name === 'normal' ? localStorage.getItem('gibsHighScore') : 0) || 0);
};

// ----------- Statistik satu run (layar game over) ----------- //
export const stats = { kills: 0, headshots: 0, shots: 0, hits: 0 };
export function resetStats() { stats.kills = 0; stats.headshots = 0; stats.shots = 0; stats.hits = 0; }

// ----------- Player & input yang sedang ditekan ----------- //
// Catatan: konstanta kecepatan dikalibrasi pada 60 fps, lalu dikalikan `step`
// (delta-time ternormalisasi) agar gerak konsisten di monitor refresh tinggi.
export const player = {
    hp: 10, grenades: 3, medkits: 0,
    rifle: { ammo: 30, mags: 3, magSize: 30 },    // utama ("Assault Rifle")
    pistol: { ammo: 15, mags: 3, magSize: 15 },   // secondary; damage peluru sama
    shotgun: { ammo: 6, mags: 2, magSize: 6 },    // senjata ke-3 (multi-pelet)
    // SLOT senjata BERURUTAN (maks CFG.weapons.maxWeapons = 2): weapons[0] =
    // tombol 1, weapons[1] = tombol 2. Survival mulai HANYA pistol (senjata ke-2
    // dibeli di shop; ke-3 minta ganti salah satu); Campaign mulai rifle+pistol.
    // owned = turunan dari weapons (dipakai drops/shop) — sinkron via
    // syncOwnedFromWeapons. Di-set configurePlayer per mode.
    weapons: ['pistol'],
    owned: { pistol: true, rifle: true, shotgun: true },
    hasRadar: true,   // radar minimap: Survival mulai TANPA (dibeli di shop); mode lain punya
    isReloading: false, lastShot: 0, reloadTimer: 0, speed: 1.5, radius: 5,
    vy: 0, onGround: true,           // vertikal: lompat (SPASI) & gravitasi
    // Upgrade shop survival (per-run; kembali 1/0 di configurePlayer):
    dmgMul: 1, reloadMul: 1, upDmg: 0, upReload: 0,
    reloadDurMs: 3000                // durasi reload EFEKTIF terakhir (rig KF membacanya)
};

// Rebuild owned dari slot weapons (satu sumber kebenaran). Dipanggil tiap kali
// slot berubah (configurePlayer, beli/ganti senjata di shop).
export function syncOwnedFromWeapons() {
    player.owned = { rifle: false, pistol: false, shotgun: false };
    for (const w of player.weapons) player.owned[w] = true;
}

// Stempel nilai CFG ke player (dipanggil saat boot & resetGame)
export function configurePlayer() {
    player.hp = CFG.player.maxHp;
    player.speed = CFG.player.speed;
    player.radius = CFG.player.radius;
    player.grenades = CFG.grenade.start;
    player.medkits = 0;
    for (const w of ['rifle', 'pistol', 'shotgun']) {
        player[w].magSize = CFG.weapons[w].magSize;
        player[w].ammo = CFG.weapons[w].magSize;
        player[w].mags = CFG.weapons[w].startMags;
    }
    // Slot senjata awal per mode (maks 2): Survival mulai pistol saja (beli
    // senjata lain di shop); Campaign & mode lain mulai rifle + pistol
    // (shotgun hanya dari shop Survival). owned diturunkan dari slot ini.
    const survivalStart = mode === 'survival';
    player.weapons = survivalStart ? ['pistol'] : ['rifle', 'pistol'];
    syncOwnedFromWeapons();
    // Radar: Survival mulai TANPA radar (dibeli di shop, item "Radar"); mode lain langsung ada.
    player.hasRadar = !survivalStart;
    player.dmgMul = 1; player.reloadMul = 1;
    player.upDmg = 0; player.upReload = 0;
}

export const keys = { w: false, a: false, s: false, d: false, shift: false };
export const mouse = { isDown: false };

// ----------- Container entitas (di-splice mundur di update) ----------- //
export const bullets = [];
export const zombies = [];
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
            && o.mesh.material !== MAT.grenade && o.mesh.material !== MAT.dropNade) o.mesh.material.dispose();
        if (o.light) o.light.intensity = 0;   // lampu pool: cukup dipadamkan, tetap di scene
        scene.remove(o.mesh);
    });
    arr.length = 0;
}
