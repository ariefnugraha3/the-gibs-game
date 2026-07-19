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
export const sfxMelee = new Audio('assets/sounds/smash-melee-attack.mp3');    // "krak" armor pecah
export const sfxThrow = new Audio('assets/sounds/throwing-grenade.mp3');
export const sfxNadeRoll = new Audio('assets/sounds/grenade-rolling.mp3');   // granat kontak lantai (digerbang jarak)
export const sfxRobotBite = new Audio('assets/sounds/robot-attack-melee.mp3');
export const sfxFootstep = new Audio('assets/sounds/player-footstep.mp3');
export const sfxRobotStep = new Audio('assets/sounds/robot-step.mp3');
// ----- Klip BARU (2026-07-19, permintaan user — audit 30 suara) -----
export const sfxLauncherShot = new Audio('assets/sounds/grenade-launcher-shot.mp3');   // tembakan Grenade Launcher Lv1-2
export const sfxRocketShot = new Audio('assets/sounds/rocket-launcher-shot.mp3');      // tembakan launcher Lv3 (roket)
export const sfxRocketExplode = new Audio('assets/sounds/rocket-explode.mp3');         // ledakan roket Lv3
export const sfxHeal = new Audio('assets/sounds/player-heal.mp3');                     // pakai medkit
export const sfxMeleeSwing = new Audio('assets/sounds/player-melee-attack.mp3');       // ayunan pedang LUPUT
export const sfxMeleeHit = new Audio('assets/sounds/player-melee-attack-hit.mp3');     // ayunan pedang KENA musuh
export const sfxRobotShot = new Audio('assets/sounds/robot-shot.mp3');                 // tembakan robot kelas A/B
export const sfxHeli = new Audio('assets/sounds/helicopter-flying.mp3');               // heli terbang (LOOP, cutscene)
export const sfxTankExplode = new Audio('assets/sounds/boss-tank/tank-explode.mp3');           // tank boss meledak kalah
export const sfxTankBlast = new Audio('assets/sounds/boss-tank/tank-explosive-attack.mp3');    // ledakan peluru meriam/mortar
export const sfxTankIncoming = new Audio('assets/sounds/boss-tank/tank-incoming-mortar.mp3');  // desing mortar mau jatuh
export const sfxTankMG = new Audio('assets/sounds/boss-tank/tank-machine-gun.mp3');            // rentetan MG tank
export const sfxTankMortar = new Audio('assets/sounds/boss-tank/tank-mortar-shot.mp3');        // tembakan mortar tank
export const sfxTankMove = new Audio('assets/sounds/boss-tank/tank-moving.mp3');               // tank bergerak (LOOP)
export const sfxTankTurret = new Audio('assets/sounds/boss-tank/tank-turret-rotate.mp3');      // rotasi turret (LOOP)

// ----- MUSIK LATAR (DIROMBAK 2026-07-19, permintaan user): 3 KONTEKS -----
// 1. MENU  (bg-music-main-menu): menyala di main menu (initMainMenu), BERHENTI
//    saat player mengklik mode Campaign/Survival (menu.beginMode).
// 2. BATTLE (bg-music-in-game / -2, dipilih ACAK tiap mulai): TIDAK menyala
//    saat stage dimulai — baru menyala saat player BERHASIL MENEMBAK robot
//    pertama kali (trigger di robots.js, idempoten); BERHENTI saat stage
//    berakhir: masuk shop antar-stage campaign (beginStageTransition), game
//    over / restart (gameOver/resetGame), lompat stage (campaignJumpToStage).
//    Survival: terus menyala lintas wave + shop lapangan, berhenti hanya saat
//    game over / kembali ke menu (reload = audio mati sendiri).
// 3. BOSS  (bg-music-boss-fight): menyala saat DUEL tank dimulai (akhir
//    cutscene tankBossIntro), berhenti saat boss tumbang (stage4.onBossDown).
// Menu jeda in-game & shop survival DIBIARKAN menyala (overlay gameplay).
// ----- VOLUME (revisi 2026-07-19, permintaan user — slider Settings 0..1
// ABSOLUT): `musicVol` = volume nyata semua track musik (DEFAULT 0.8);
// `sfxVol` = volume nyata SFX standar (DEFAULT 1.0) — panggilan
// playSFX/playLoopSFX dgn vol khusus (heli 0.55, falloff, dst.) diskalakan
// relatif `SFX_BASE` 0.7 (mix bawaan antar-klip) agar keseimbangannya
// terjaga, di-clamp <= 1. Slider penuh = volume 1.0 utk keduanya. Disimpan
// localStorage ('gibsMusicVol' / 'gibsSfxVol') dan diterapkan LIVE ke musik. -----
const SFX_BASE = 0.7;
let musicVol = 0.8, sfxVol = 1;
try {
    const mv = parseFloat(localStorage.getItem('gibsMusicVol'));
    if (!isNaN(mv)) musicVol = Math.max(0, Math.min(1, mv));
    const sv = parseFloat(localStorage.getItem('gibsSfxVol'));
    if (!isNaN(sv)) sfxVol = Math.max(0, Math.min(1, sv));
} catch (e) { /* localStorage tak tersedia: pakai default */ }
export const getMusicVolume = () => musicVol;
export const getSFXVolume = () => sfxVol;
export const getSFXScale = () => sfxVol / SFX_BASE;   // utk penulisan volume manual (fade heli intro)
export function setMusicVolume(v) {
    musicVol = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('gibsMusicVol', String(musicVol)); } catch (e) { }
    for (const m of [bgMusic, bgMusicAlt, bgMusicMenu, bgMusicBoss]) m.volume = musicVol;
}
export function setSFXVolume(v) {
    sfxVol = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('gibsSfxVol', String(sfxVol)); } catch (e) { }
}

export const bgMusic = new Audio('assets/sounds/bg-music-in-game.mp3');       // battle track 1
export const bgMusicAlt = new Audio('assets/sounds/bg-music-in-game-2.mp3');  // battle track 2
export const bgMusicMenu = new Audio('assets/sounds/bg-music-main-menu.mp3');
export const bgMusicBoss = new Audio('assets/sounds/bg-music-boss-fight.mp3');
for (const m of [bgMusic, bgMusicAlt, bgMusicMenu, bgMusicBoss]) { m.loop = true; m.volume = musicVol; }

let curTrack = null;     // elemen Audio yang sedang menyala
let curName = null;      // 'menu' | 'battle' | 'boss' | null
let retryArmed = false;
function tryPlayMusic() {
    if (!curTrack) return;
    const p = curTrack.play();
    if (p && p.catch) p.catch(() => armMusicRetry());   // autoplay ditolak → tunggu gesture
}
function armMusicRetry() {
    if (retryArmed || typeof window === 'undefined') return;
    retryArmed = true;
    const retry = () => {
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
        retryArmed = false;
        if (curTrack) tryPlayMusic();
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
}
// Ganti track: hentikan yang lama (rewind), mulai yang baru dari awal.
function playTrack(name, el) {
    if (curTrack === el) { curName = name; return; }
    if (curTrack) { try { curTrack.pause(); curTrack.currentTime = 0; } catch (e) { } }
    curTrack = el; curName = name;
    try { curTrack.currentTime = 0; } catch (e) { }
    tryPlayMusic();
}
// MENU: idempoten — dipanggil initMainMenu (autoplay mungkin ditolak sebelum
// gesture pertama → retry otomatis pada pointerdown/keydown pertama).
export function startMenuMusic() {
    if (curName === 'menu') return;
    playTrack('menu', bgMusicMenu);
}
// BATTLE: idempoten per nyala — dipanggil TIAP KALI peluru player mengenai
// robot (robots.js), jadi guard harus murah. Track dipilih ACAK di antara dua
// lagu in-game tiap kali mulai dari mati. TIDAK menimpa musik boss.
export function startBattleMusic() {
    if (curName === 'battle' || curName === 'boss') return;
    playTrack('battle', Math.random() < 0.5 ? bgMusic : bgMusicAlt);
}
// BOSS: duel tank dimulai (akhir cutscene tankBossIntro).
export function startBossMusic() {
    if (curName === 'boss') return;
    playTrack('boss', bgMusicBoss);
}
// Hentikan musik apa pun yang menyala (stage berakhir / masuk shop campaign /
// game over / cutscene boss dimulai). startBattleMusic berikutnya menyala lagi.
export function stopMusic() {
    if (curTrack) { try { curTrack.pause(); curTrack.currentTime = 0; } catch (e) { } }
    curTrack = null; curName = null;
}
// Debug/uji: nama konteks musik yang sedang menyala (null = mati).
export const musicDebug = () => curName;

// ----- SFX LOOPING (2026-07-19): heli terbang / tank bergerak / turret berputar.
// Node clone KHUSUS di luar pool playSFX (pool me-reuse node round-robin — node
// ber-loop yang tertinggal di pool bisa terputar ulang tak berujung). Pemanggil
// menyimpan node & menghentikannya lewat stopLoopSFX. -----
export function playLoopSFX(sfx, vol = 0.5) {
    const n = sfx.cloneNode(true);
    n.loop = true;
    n.volume = Math.min(1, vol * (sfxVol / SFX_BASE));   // relatif SFX_BASE, ikut slider Settings
    n.play().catch(() => { });
    return n;
}
export function stopLoopSFX(n) {
    if (!n) return;
    try { n.pause(); n.currentTime = 0; } catch (e) { }
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
        sfxRobotBite, sfxFootstep, sfxRobotStep,
        sfxLauncherShot, sfxRocketShot, sfxRocketExplode, sfxHeal,
        sfxMeleeSwing, sfxMeleeHit, sfxRobotShot, sfxHeli,
        sfxTankExplode, sfxTankBlast, sfxTankIncoming, sfxTankMG,
        sfxTankMortar, sfxTankMove, sfxTankTurret];
    all.forEach(a => { try { a.load(); } catch (e) { /* klip hilang: abaikan */ } });
    // Musik latar (4 track): fetch dini, TANPA prime (loop — jangan sampai terdengar)
    for (const m of [bgMusic, bgMusicAlt, bgMusicMenu, bgMusicBoss]) {
        try { m.load(); } catch (e) { }
    }
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
    node.volume = Math.min(1, vol * (sfxVol / SFX_BASE));   // relatif SFX_BASE, ikut slider Settings
    node.play().catch(() => { });
    return node;   // dikembalikan agar pemanggil bisa menghentikannya (mis. reload dibatalkan)
}
