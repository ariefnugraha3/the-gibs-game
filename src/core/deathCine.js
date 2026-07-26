// ===== SUTRADARA SEKUENS KEMATIAN PLAYER (2026-07-26) =====
// Sebelum ini, "mati" = avatar roboh 90° dalam 0,6 dtk lalu layar GAME OVER —
// datar dan tidak dramatis (permintaan user: bikin JAUH lebih dramatis). Modul
// ini adalah LAPISAN SINEMATIK di atas animasi tubuh (poseDeath di
// entities/playerAvatar.js): ia memegang JAM WAKTU-NYATA sekuens dan
// mengemudikan lima hal sekaligus —
//   1. SLOW MOTION   — skala waktu global (main.js mengalikan dt-nya): dunia
//      melambat ke CFG.player.death.slowMoScale, ditahan slowMoHoldSec, lalu
//      pulih. Tubuh player memakai dt yang SAMA, jadi keruntuhannya ikut lambat.
//   2. DEATH CAM     — kamera MENDEKAT ke jasad (camZoom), meng-ORBIT halus, dan
//      MEMIRING (dutch angle) — didorong ke renderer lewat setDeathCam.
//   3. LAYAR         — overlay #deathFx (pandangan menutup berdarah) + warna
//      dunia LURUH jadi nyaris monokrom (filter CSS di kanvas) + letterbox.
//   4. AUDIO         — musik SURUT perlahan (duckMusic, bukan potong mendadak),
//      "whump" bernada rendah saat ajal, dan hantaman tubuh ke lantai.
//   5. ISYARAT FX    — debu + semburan darah + genangan yang MELUAS, dipicu dari
//      FASE animasi tubuh (avatarDeathPhase) supaya benturan lantai PERSIS
//      sinkron dengan pose, bukan menebak stempel waktu.
// Jam di sini WAKTU NYATA (dtReal, tak terpengaruh slow motion) supaya jeda
// menuju layar GAME OVER tetap CFG.player.deathDelaySec detik sungguhan.
// Semua angka "rasa" ada di config (player.death); amplitudo visual = konstanta.
// Dipanggil dari: game.startPlayerDeath (mulai), game.updateGame (tick + gerbang
// kendali), game.gameOver/resetGame (endDeathCine), main.animate (deathTimeScale).

import { CFG } from './config.js';
// Live binding + pola "dorong nilai masuk" (renderer TIDAK mengimpor modul ini).
import { setDeathCam, resetDeathCam, addCamShake, renderer } from './renderer.js';
import { setDeathFx, setDeathGrade, setCineBars } from './dom.js';
import { avatarDeathPhase } from '../entities/playerAvatar.js';
import { spawnBloodBurst, spawnGroundPuff } from '../entities/effects.js';
import { spawnBloodDecal } from '../entities/gore.js';
import { PLAYER_BLOOD_HEX } from '../entities/robots.js';   // sirkular aman: dibaca dalam fungsi
import { playSFX, sfxExplode, sfxMelee, duckMusic } from '../utils/sfx.js';

// --- Konstanta VISUAL (bukan tuning gameplay -> tetap di kode) ---
const RAMP_IN = 0.12;        // detik: 1 -> slowMoScale (hentakan masuk slow motion)
const RAMP_OUT = 0.8;        // detik: slowMoScale -> 1 (dunia pulih)
const PUSH_SEC = 2.6;        // durasi dorongan kamera ke jasad
const ORBIT_RAD = 0.20;      // orbit azimuth maks (~11°)
const TILT_RAD = 0.10;       // dutch angle maks (~6°)
const FLASH_TAU = 0.10;      // peluruhan hentakan merah di awal
const CLOSE_DELAY = 0.5;     // pandangan mulai menutup setelah ini
const CLOSE_SEC = 2.6;       // durasi menutup penuh
const GRADE_SEC = 2.2;       // durasi warna luruh
const DUCK_SEC = 1.6;        // durasi musik surut
const BLOOD = () => PLAYER_BLOOD_HEX;                       // darah MERAH player
const POOL_TONE = 0x8f1616;                                 // genangan darah player
const smoothstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

let active = false;
let t = 0;                   // detik NYATA sejak ajal
let dirX = 0, dirZ = 1;      // arah roboh (= arah dorongan damage terakhir)
let px = 0, py = 0, pz = 0;  // titik jatuh (kaki player)
let lastPhase = 'none';      // fase animasi tubuh frame lalu (deteksi transisi)
let barsOwned = false;       // letterbox dinyalakan OLEH kita (bukan cutscene yg sedang jalan)
let poolT = -1;              // hitung mundur genangan susulan (darah MELUAS)

// Skala waktu global — dibaca main.animate SEBELUM updateGame tiap frame.
export function deathTimeScale() {
    if (!active) return 1;
    const D = (CFG.player && CFG.player.death) || {};
    const s = D.slowMoScale != null ? D.slowMoScale : 0.45;
    const hold = D.slowMoHoldSec != null ? D.slowMoHoldSec : 1;
    if (t < RAMP_IN) return 1 + (s - 1) * (t / RAMP_IN);
    if (t < RAMP_IN + hold) return s;
    const k = (t - RAMP_IN - hold) / RAMP_OUT;
    return k >= 1 ? 1 : s + (1 - s) * k;
}

// x/y/z = titik kaki player, dir = arah roboh (ternormalisasi oleh pemanggil).
export function startDeathCine(x, y, z, dx, dz) {
    active = true;
    t = 0; poolT = -1;
    px = x; py = y; pz = z; dirX = dx; dirZ = dz;
    lastPhase = 'none';
    // Letterbox: hanya kalau BUKAN sedang cutscene (jangan rebut milik cutscene).
    barsOwned = !(document.body && document.body.classList
        && document.body.classList.contains('cine'));
    if (barsOwned) setCineBars(true);
    // "Whump" bernada rendah = dunia seakan jatuh ke dalam sumur.
    const n = playSFX(sfxExplode, 0.24);
    if (n) { try { n.playbackRate = 0.4; } catch (e) { } }
    // Semburan darah pertama + genangan di titik jatuh (searah roboh).
    spawnBloodBurst(x, y + 8, z, dirX, dirZ, 14, 1.1, 2.4, BLOOD());
    spawnBloodDecal(x, z, 5, POOL_TONE);
}

// dtReal = dt SEBELUM diskalakan slow motion (dari main.animate lewat updateGame).
export function updateDeathCine(dtReal) {
    if (!active) return;
    t += dtReal;

    // --- Kamera: dorong mendekat + orbit + miring (smoothstep, tanpa sentakan)
    const D = (CFG.player && CFG.player.death) || {};
    const k = smoothstep(t / PUSH_SEC);
    const zoom = D.camZoom != null ? D.camZoom : 0.42;
    setDeathCam(1 - zoom * k, ORBIT_RAD * k, TILT_RAD * k);

    // --- Layar: hentakan merah cepat lalu pandangan MENUTUP perlahan
    const punch = 0.55 * Math.exp(-t / FLASH_TAU);
    const close = 0.92 * smoothstep((t - CLOSE_DELAY) / CLOSE_SEC);
    setDeathFx(Math.max(punch, close));
    setDeathGrade(smoothstep(t / GRADE_SEC), renderer && renderer.domElement);

    // --- Musik surut (volume elemen; slider Settings tak tersentuh)
    duckMusic(1 - smoothstep(t / DUCK_SEC));

    // --- Isyarat FX mengikuti FASE TUBUH (sinkron pose, bukan stempel waktu)
    const ph = avatarDeathPhase();
    if (ph !== lastPhase) {
        if (ph === 'settle') groundImpact();       // badan menghantam lantai
        lastPhase = ph;
    }
    // Genangan MELUAS: satu lapis susulan yang lebih lebar setelah benturan.
    if (poolT > 0) {
        poolT -= dtReal;
        if (poolT <= 0) {
            spawnBloodDecal(px + dirX * 3.5, pz + dirZ * 3.5, 8.5, POOL_TONE);
            spawnBloodDecal(px + dirX * 8, pz + dirZ * 8, 5.5, POOL_TONE);
        }
    }
}

// Benturan lantai: debu terhambur di bawah badan, darah MENYEMBUR mendatar
// (kerucut lebar, tenaga rendah — bukan air mancur), genangan di torso & kepala,
// guncangan kamera, dan dua lapis bunyi (gedebuk + "krak" perlengkapan).
function groundImpact() {
    const D = (CFG.player && CFG.player.death) || {};
    const mx = px + dirX * 5, mz = pz + dirZ * 5;   // titik tengah jasad yang rebah
    spawnGroundPuff(mx, mz, 0xb8a58c, 9, py + 1.2);
    spawnGroundPuff(px + dirX * 9, pz + dirZ * 9, 0xb8a58c, 6, py + 1);
    spawnBloodBurst(mx, py + 2.2, mz, dirX, dirZ, 18, 0.75, 4.2, BLOOD());
    spawnBloodDecal(mx, mz, 6.5, POOL_TONE);
    spawnBloodDecal(px + dirX * 9.5, pz + dirZ * 9.5, 4.5, POOL_TONE);
    addCamShake(D.camShake != null ? D.camShake : 7);
    const n = playSFX(sfxExplode, 0.34);
    if (n) { try { n.playbackRate = 0.55; } catch (e) { } }
    playSFX(sfxMelee, 0.45);
    poolT = 1.2;   // genangan meluas 1,2 dtk kemudian
}

// Layar GAME OVER muncul: SETOP jam + slow motion + letterbox, tapi FRAMING-nya
// DIBEKUKAN (kamera dekat/miring, warna luruh, pandangan menutup) — jasad tetap
// terkomposisi rapi di belakang panel. Kalau di sini semua di-reset, kamera
// MELETIK mundur satu frame dan kelihatan menembus panel yang cuma 80% opak.
// Aman dipanggil walau tak pernah aktif (mis. gameOver karena MENANG).
export function endDeathCine() {
    active = false;
    if (barsOwned) { setCineBars(false); barsOwned = false; }
}
// resetGame (restart): baru di sini seluruh presentasi kembali normal.
export function resetDeathCine() {
    endDeathCine();
    t = 0; poolT = -1; lastPhase = 'none';
    resetDeathCam();
    setDeathFx(0);
    setDeathGrade(0, renderer && renderer.domElement);
}

export const deathCineDebug = () => ({
    active, t, scale: deathTimeScale(), push: smoothstep(t / PUSH_SEC), phase: lastPhase,
});
