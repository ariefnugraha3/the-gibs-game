// State bersama lintas modul + resource geometry/material bersama.
// Binding ES module bersifat LIVE: modul lain mengimpor dan membaca nilai
// terbaru; reassignment hanya lewat fungsi setter di modul pemilik ini.

import { CFG } from './config.js';

// ----------- Status inti game ----------- //
export let isPaused = true;
export let isGameOver = false;
export let score = 0;
export let mode = null;   // 'survival' | 'campaign' — di-set layar pilih mode
export let highScore = +(localStorage.getItem('gibsHighScore') || 0);

export const setPaused = (v) => { isPaused = v; };
export const setGameOver = (v) => { isGameOver = v; };
export const setScore = (v) => { score = v; };
export const addScore = (n) => { score += n; };
export const setMode = (m) => { mode = m; };
export const setHighScore = (v) => { highScore = v; localStorage.setItem('gibsHighScore', v); };

// ----------- Player & input yang sedang ditekan ----------- //
// Catatan: konstanta kecepatan dikalibrasi pada 60 fps, lalu dikalikan `step`
// (delta-time ternormalisasi) agar gerak konsisten di monitor refresh tinggi.
export const player = {
    hp: 10, grenades: 3,
    rifle: { ammo: 30, mags: 3, magSize: 30 },    // utama ("Assault Rifle")
    pistol: { ammo: 15, mags: 3, magSize: 15 },   // secondary; damage peluru sama
    isReloading: false, lastShot: 0, reloadTimer: 0, speed: 1.5, radius: 5,
    vy: 0, onGround: true            // vertikal: lompat (SPASI) & gravitasi
};

// Stempel nilai CFG ke player (dipanggil saat boot & resetGame)
export function configurePlayer() {
    player.hp = CFG.player.maxHp;
    player.speed = CFG.player.speed;
    player.radius = CFG.player.radius;
    player.grenades = CFG.grenade.start;
    player.rifle.magSize = CFG.weapons.rifle.magSize;
    player.rifle.ammo = CFG.weapons.rifle.magSize;
    player.rifle.mags = CFG.weapons.rifle.startMags;
    player.pistol.magSize = CFG.weapons.pistol.magSize;
    player.pistol.ammo = CFG.weapons.pistol.magSize;
    player.pistol.mags = CFG.weapons.pistol.startMags;
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
