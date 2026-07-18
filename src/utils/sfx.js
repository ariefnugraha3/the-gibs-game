// SFX: definisi klip + pool pemutaran. SELALU putar lewat playSFX().

export const sfxShoot = new Audio('assets/sounds/gun-shoot.mp3');
export const sfxShotgun = new Audio('assets/sounds/shotgun-shot.mp3');   // tembakan shotgun
export const sfxEmpty = new Audio('assets/sounds/empty-gun.mp3');        // klik kosong (peluru & magazen habis)
export const sfxSwitch = new Audio('assets/sounds/switch-weapon.mp3');   // ganti senjata
export const sfxExplode = new Audio('assets/sounds/grenade-explode.mp3');
export const sfxReload = new Audio('assets/sounds/reload.mp3');
export const sfxHit = new Audio('assets/sounds/jokowi-kaget.mp3');
export const sfxPistol = new Audio('assets/sounds/pistol-shoot.mp3');
export const sfxPickup = new Audio('assets/sounds/pick-up-item.mp3');
export const sfxPurchase = new Audio('assets/sounds/success-purchase.mp3');   // sukses beli item di shop
export const sfxMelee = new Audio('assets/sounds/smash-melee-attack.mp3');
export const sfxThrow = new Audio('assets/sounds/throwing-grenade.mp3');
export const sfxNadeRoll = new Audio('assets/sounds/grenade-rolling.mp3');   // granat kontak lantai (digerbang jarak)
export const sfxRobotBite = new Audio('assets/sounds/robot-attack-melee.mp3');
export const sfxFootstep = new Audio('assets/sounds/player-footstep.mp3');
export const sfxRobotStep = new Audio('assets/sounds/robot-step.mp3');

// ----- MUSIK LATAR IN-GAME (2026-07-18, permintaan user) -----
// HANYA saat BERMAIN: dinyalakan `startMusic()` di enter() scene gameplay
// (survival + campaign stage 1-4), TIDAK di main menu / intro / menu lain.
// Menu jeda in-game & shop tetap DIBIARKAN menyala (musik terus). Kembali ke
// main menu selalu lewat reload halaman → audio otomatis mati. Loop, satu instans.
const MUSIC_VOL = 0.3;   // latar, di bawah SFX (0.7)
export const bgMusic = new Audio('assets/sounds/bg-music-in-game.mp3');
bgMusic.loop = true;
bgMusic.volume = MUSIC_VOL;

let musicOn = false, retryArmed = false;
function tryPlayMusic() {
    const p = bgMusic.play();
    if (p && p.catch) p.catch(() => armMusicRetry());   // autoplay ditolak → tunggu gesture
}
function armMusicRetry() {
    if (retryArmed || typeof window === 'undefined') return;
    retryArmed = true;
    const retry = () => {
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
        retryArmed = false;
        if (musicOn) tryPlayMusic();
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
}
// Idempoten: dipanggil tiap enter() stage/survival — kalau sudah menyala, biarkan
// (jangan mengulang dari awal antar-stage). Aman dipanggil berkali-kali.
export function startMusic() {
    if (musicOn) return;
    musicOn = true;
    tryPlayMusic();
}
// Hentikan musik (dipakai bila perlu keluar gameplay tanpa reload). Saat ini
// jalur ke menu selalu reload, jadi belum dipanggil — disediakan untuk masa depan.
export function stopMusic() {
    musicOn = false;
    try { bgMusic.pause(); bgMusic.currentTime = 0; } catch (e) { }
}

// Pramuat semua klip (dipanggil layar loading pra-game, core/preload.js).
// Dua tahap — load() saja TIDAK cukup (hanya fetch, decode tetap terjadi di
// play pertama, dan pipa audio OS baru hidup saat SESUATU benar-benar diputar;
// itulah sisa "jeda" saat equip granat pertama = play perdana sfxSwitch):
// 1) load() elemen asli -> fetch file ke cache;
// 2) PRIME: putar tiap klip sekali dgn volume 0 lewat pool playSFX yang asli
//    (klik pilih mode = sticky user activation, play() diizinkan) -> node pool
//    pertama terbentuk, decoder terinisialisasi, dan perangkat audio menyala —
//    semua saat layar loading, bukan di tengah aksi. Node dihentikan sesaat
//    kemudian; klip panjang tidak sempat terdengar (volume 0).
export function preloadAllSFX() {
    const all = [sfxShoot, sfxShotgun, sfxEmpty, sfxSwitch, sfxExplode, sfxReload, sfxHit,
        sfxPistol, sfxPickup, sfxPurchase, sfxMelee, sfxThrow, sfxNadeRoll,
        sfxRobotBite, sfxFootstep, sfxRobotStep];
    all.forEach(a => { try { a.load(); } catch (e) { /* klip hilang: abaikan */ } });
    try { bgMusic.load(); } catch (e) { /* musik latar: fetch dini, TANPA prime (loop) */ }
    all.forEach(a => {
        try {
            const n = playSFX(a, 0);
            setTimeout(() => { try { n.pause(); n.currentTime = 0; } catch (e) { } }, 400);
        } catch (e) { /* autoplay ditolak: prime dilewati, game tetap jalan */ }
    });
}

// Pool kecil per-klip: hindari cloneNode (alokasi + GC) di tiap tembakan.
const sfxPool = new Map();
export function playSFX(sfx, vol = 0.7) {
    let pool = sfxPool.get(sfx);
    if (!pool) { pool = { nodes: [], next: 0 }; sfxPool.set(sfx, pool); }
    let node;
    if (pool.nodes.length < 8) {
        node = sfx.cloneNode(true);
        pool.nodes.push(node);
    } else {
        node = pool.nodes[pool.next++ % pool.nodes.length];
        node.currentTime = 0;
    }
    node.volume = vol;
    node.play().catch(() => { });
    return node;   // dikembalikan agar pemanggil bisa menghentikannya (mis. reload dibatalkan)
}
