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
// Klip yang sebelumnya menganggur di disk, dipakai sejak 2026-07-27 oleh cutscene
// pembuka SURVIVAL: derap "mesin mendarat" saat pasukan robot melompati pagar taman.
export const sfxRobotSpawn = new Audio('assets/sounds/robot-spawn.mp3');

// ----- PINTU + KERETA (2026-08-07, permintaan user) -----
// SATU pasang klip pintu dipakai SELURUH pintu di stage mana pun (stage 1-3,
// pintu blast stage 3, pintu stasiun stage 5, pintu stage 6): `door-open` saat
// daun mulai bergerak membuka, `door-closed` saat ia mendarat tertutup.
// Pemicunya terpusat di `campaign/utility/doors.js` -> playDoorSFX.
export const sfxDoorOpen = new Audio('assets/sounds/door-open.mp3');
export const sfxDoorClose = new Audio('assets/sounds/door-closed.mp3');
// Kereta berjalan (LOOP) — menggantikan pinjaman sfxTankMove di Stage 5.
export const sfxTrain = new Audio('assets/sounds/train-sound.mp3');

// ----- MUSIK LATAR (DIROMBAK 2026-07-19, permintaan user): 3 KONTEKS -----
// 1. MENU  (bg-music-main-menu): menyala di main menu. Untuk Campaign BARU,
//    musik diteruskan sepanjang loading + prolog dan baru berhenti pada frame
//    live pertama intro heli. Continue/Survival berhenti saat mode dipilih.
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
    if (curTrack) { try { curTrack.pause(); curTrack.currentTime = 0; curTrack.volume = musicVol; } catch (e) { } }
    curTrack = el; curName = name;
    // volume dipulihkan ke musicVol: track bisa saja tertinggal ter-DUCK oleh
    // sekuens kematian sebelumnya (duckMusic menulis .volume per elemen).
    try { curTrack.currentTime = 0; curTrack.volume = musicVol; } catch (e) { }
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
    if (curTrack) { try { curTrack.pause(); curTrack.currentTime = 0; curTrack.volume = musicVol; } catch (e) { } }
    curTrack = null; curName = null;
}
// REDAM musik SEMENTARA tanpa menyentuh slider Settings (k = 1 normal, 0 senyap)
// — dipakai sekuens kematian player (core/deathCine.js) supaya lagu battle
// SURUT perlahan alih-alih terpotong mendadak. Volume elemen dipulihkan oleh
// playTrack/stopMusic, jadi tak ada sisa duck di run berikutnya.
export function duckMusic(k) {
    if (!curTrack) return;
    try { curTrack.volume = Math.max(0, Math.min(1, k)) * musicVol; } catch (e) { }
}
// Debug/uji: nama konteks musik yang sedang menyala (null = mati).
export const musicDebug = () => curName;
// Debug/uji: volume nyata track yang sedang menyala (-1 = tak ada musik).
export const musicVolNow = () => curTrack ? curTrack.volume : -1;

// ===== LOOP TANPA JEDA (2026-08-07, laporan user: "train-sound ada jedanya di
// setiap pengulangan") ======================================================
// AKAR MASALAH: `<audio loop>` mengulang SELURUH aliran hasil decode, TERMASUK
// padding encoder MP3. `train-sound.mp3` (Lavc, 320 kbps) membawa 576 sampel
// encoder delay + 1498 sampel padding = 2074 sampel ≈ 47 ms SENYAP di tiap
// putaran — persis "jeda sepersekian detik" itu. Ini TIDAK bisa diperbaiki
// dengan re-encode: padding melekat pada format MP3 itu sendiri.
//
// PERBAIKAN: klip yang terdaftar `GAPLESS_LOOPS` diputar lewat WEB AUDIO.
// `decodeAudioData` menghasilkan PCM (dan sudah membuang padding bila browser
// menghormati tag LAME/Info), lalu `AudioBufferSourceNode.loop` menyambungnya
// SAMPEL-AKURAT tanpa jeda. `loopStart`/`loopEnd` dipotong sekali lagi ke sampel
// non-senyap pertama/terakhir, jadi senyap sisa — baik dari codec maupun yang
// memang ada di rekaman — ikut hilang.
//
// Handle-nya sengaja MENIRU permukaan HTMLAudioElement yang benar-benar dipakai
// pemanggil (`volume`, `playbackRate`, `pause()`, `currentTime`, `src`) supaya
// SELURUH call-site lama tidak berubah sebaris pun. Bila Web Audio tak tersedia,
// buffer belum siap, atau klipnya tidak terdaftar, ia jatuh mulus ke klon
// `<audio>` lama — perilakunya identik, hanya jedanya kembali ada.
//
// CATATAN CAKUPAN: daftarnya sengaja HANYA kereta. Loop heli/tank membawa
// padding yang sama, tetapi tiga call-site menyetel `playbackRate` pada mereka
// (stage7 1.55, stage8 1.65/1.18) — `<audio>` mempertahankan pitch saat
// dipercepat, `AudioBufferSourceNode` TIDAK. Memindahkannya akan mengubah
// karakter suara yang tidak diminta; tambahkan ke daftar ini bila memang mau.
const GAPLESS_LOOPS = [sfxTrain];
const SILENCE_TH = 3e-4;                 // ~-70 dBFS: buang padding, jangan makan fade
let audioCtx = null;                     // hanya di-set bila BERHASIL dibuat
const loopBuffers = new Map();           // src -> AudioBuffer
const loopTrims = new Map();             // src -> { start, end } detik

// Sengaja TIDAK memoize kegagalan: percobaan pertama bisa jatuh sebelum browser
// mengizinkan AudioContext (kebijakan autoplay), dan panggilan berikutnya harus
// tetap bisa berhasil — memoize `false` akan mematikan jalur gapless selamanya.
function ensureAudioCtx() {
    if (audioCtx) return audioCtx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    try { audioCtx = new AC(); } catch (e) { return false; }
    return audioCtx;
}

// Cari sampel non-senyap pertama & terakhir di SELURUH channel.
export function trimSilenceRange(buf) {
    const n = buf.length, sr = buf.sampleRate || 44100;
    let first = n, last = -1;
    for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        let i = 0; while (i < n && Math.abs(d[i]) < SILENCE_TH) i++;
        let j = n - 1; while (j > i && Math.abs(d[j]) < SILENCE_TH) j--;
        if (i < first) first = i;
        if (j > last) last = j;
    }
    if (last <= first) return { start: 0, end: n / sr };   // seluruhnya senyap: jangan potong
    return { start: first / sr, end: (last + 1) / sr };
}

// Dipanggil preloadAllSFX (layar loading, sesudah klik pilih mode = user
// activation) supaya buffer sudah siap sebelum gameplay pertama memakainya.
export function primeGaplessLoops() {
    const ctx = ensureAudioCtx();
    if (!ctx || typeof fetch !== 'function') return false;
    for (const clip of GAPLESS_LOOPS) {
        const src = clip && clip.src;
        if (!src || loopBuffers.has(src)) continue;
        loopBuffers.set(src, null);                        // tandai "sedang diambil"
        fetch(src)
            .then(r => r.arrayBuffer())
            .then(ab => ctx.decodeAudioData(ab))
            .then(buf => { loopBuffers.set(src, buf); loopTrims.set(src, trimSilenceRange(buf)); })
            .catch(() => { loopBuffers.delete(src); });     // gagal: tetap pakai <audio>
    }
    return true;
}

// Handle Web Audio yang berperilaku seperti node <audio> bagi pemanggil.
function gaplessHandle(node, gain, src) {
    return {
        src, gapless: true, loop: true, paused: false, currentTime: 0,
        get volume() { return gain.gain.value; },
        set volume(v) { try { gain.gain.value = Math.max(0, Math.min(1, v)); } catch (e) { } },
        get playbackRate() { return node.playbackRate.value; },
        set playbackRate(r) { try { node.playbackRate.value = r; } catch (e) { } },
        pause() {
            if (this.paused) return;
            this.paused = true;
            try { node.stop(); } catch (e) { }
            try { node.disconnect(); gain.disconnect(); } catch (e) { }
        },
    };
}

// ----- SFX LOOPING (2026-07-19): heli terbang / tank bergerak / turret berputar.
// Node clone KHUSUS di luar pool playSFX (pool me-reuse node round-robin — node
// ber-loop yang tertinggal di pool bisa terputar ulang tak berujung). Pemanggil
// menyimpan node & menghentikannya lewat stopLoopSFX. -----
export function playLoopSFX(sfx, vol = 0.5) {
    const v = Math.min(1, vol * (sfxVol / SFX_BASE));   // relatif SFX_BASE, ikut slider Settings
    const ctx = audioCtx, buf = ctx && sfx && loopBuffers.get(sfx.src);
    if (ctx && buf) {
        try {
            if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => { });
            const node = ctx.createBufferSource();
            node.buffer = buf; node.loop = true;
            const t = loopTrims.get(sfx.src);
            if (t) { node.loopStart = t.start; node.loopEnd = t.end; }
            const gain = ctx.createGain();
            gain.gain.value = v;
            node.connect(gain); gain.connect(ctx.destination);
            node.start(0, t ? t.start : 0);
            return gaplessHandle(node, gain, sfx.src);
        } catch (e) { /* apa pun yang gagal: jatuh ke elemen <audio> di bawah */ }
    }
    const n = sfx.cloneNode(true);
    n.loop = true;
    n.volume = v;
    n.play().catch(() => { });
    return n;
}
export function stopLoopSFX(n) {
    if (!n) return;
    try { n.pause(); n.currentTime = 0; } catch (e) { }
}

// Debug/uji: status jalur loop tanpa jeda.
export const gaplessLoopDebug = () => ({
    ctx: !!audioCtx,
    registered: GAPLESS_LOOPS.map(c => c && c.src),
    ready: [...loopBuffers.entries()].filter(([, b]) => !!b).map(([s]) => s),
    trims: [...loopTrims.entries()].map(([src, t]) => ({ src, ...t })),
});

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
        sfxRobotBite, sfxFootstep, sfxRobotStep, sfxRobotSpawn,
        sfxLauncherShot, sfxRocketShot, sfxRocketExplode, sfxHeal,
        sfxMeleeSwing, sfxMeleeHit, sfxRobotShot, sfxHeli,
        sfxTankExplode, sfxTankBlast, sfxTankIncoming, sfxTankMG,
        sfxTankMortar, sfxTankMove, sfxTankTurret,
        sfxDoorOpen, sfxDoorClose, sfxTrain];
    all.forEach(a => { try { a.load(); } catch (e) { /* klip hilang: abaikan */ } });
    // Musik latar (4 track): fetch dini, TANPA prime (loop — jangan sampai terdengar).
    // Jangan panggil load() pada track yang SEDANG bermain: browser akan
    // menginterupsi playback-nya. Ini penting saat musik menu dipertahankan
    // sepanjang loading Campaign baru menuju prolog.
    for (const m of [bgMusic, bgMusicAlt, bgMusicMenu, bgMusicBoss]) {
        if (m === curTrack) continue;
        try { m.load(); } catch (e) { }
    }
    all.forEach(a => {
        try {
            const n = playSFX(a, 0);
            setTimeout(() => { try { n.pause(); n.currentTime = 0; } catch (e) { } }, 400);
        } catch (e) { /* autoplay ditolak: prime dilewati, game tetap jalan */ }
    });
    // Decode buffer loop TANPA JEDA di sini juga: klik pilih mode sudah memberi
    // user activation, jadi AudioContext boleh dibuat, dan buffernya siap jauh
    // sebelum gameplay pertama memakainya.
    try { primeGaplessLoops(); } catch (e) { /* tanpa Web Audio: tetap <audio> */ }
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
