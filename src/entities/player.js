// Player = kamera. Modul ini memiliki: gerak WASD (normalisasi diagonal) +
// gerak klik-kanan, stamina, DODGE/evade (tumble + i-frame), gravitasi + jatuh
// dari tepian (tanpa lompat), bunyi langkah, dan kepejalan badan robot terhadap
// player. Tabrakan dunia (pagar/dinding/penghalang) didelegasikan ke scene aktif.
// (Jongkok & lompat DIHAPUS 2026-07-11; SPRINT DIHAPUS 2026-07-11 — Shift kini
// memicu dodge/evade.)

import { CFG } from '../core/config.js';
import { player, keys, robots, setDodgeInvuln } from '../core/state.js';
import { camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { playSFX, sfxFootstep, sfxRobotStep } from '../utils/sfx.js';
import { staminaFill } from '../core/dom.js';
import { medkitMode } from './weapons.js';
import { showMoveMarker, hideMoveMarker } from './playerAvatar.js';

// ----- Status milik player (live export; reassign hanya di modul ini) -----
export let stamina = 100;
export let staExhausted = false;
export let eyeHCur = 11.4;         // tinggi mata (konstan = eyeHeight; jongkok dihapus)

// ----- Dodge/evade (Shift, 2026-07-11): guling cepat + i-frame. Dipicu diskret
// oleh input.js.tryDodge; state di sini dibaca playerAvatar (animasi tumble). -----
export let dodgeActive = false;     // sedang berguling (override gerak WASD)
export let dodgeProgress = 0;       // 0..1 sepanjang animasi (dibaca playerAvatar utk sudut tumble)
export let dodgeDirX = 0, dodgeDirZ = 0;   // arah gulingan di dunia (unit)
let dodgeT = 0;                     // sisa durasi dodge (detik)
let dodgeCd = 0;                    // sisa cooldown anti-spam (detik)
const _fwd = new THREE.Vector3();   // sementara: arah hadap utk dodge mundur

let footT = 0;    // irama langkah kaki player (detik antar langkah)
let zStepT = 0;   // irama langkah robot (satu suara global, bukan per robot)

// ----- Kecepatan DIREKSIONAL relatif arah bidik/kursor (2026-07-12): berlari
// SEARAH kursor = kecepatan penuh; menyamping = ×strafeWeight (0.5); MUNDUR
// membelakangi kursor = ×backpedalWeight (0.5) — orang tak bisa berlari mundur/
// menyamping secepat lari maju. Blend halus lewat dot(arah gerak, arah bidik):
// maju-serong otomatis di antaranya (mis. 0.75). (mx,mz) WAJIB ternormalisasi. -----
function dirSpeedMul(mx, mz) {
    camera.getWorldDirection(_fwd);   // yaw pivot = arah kursor (updateTopdownAim)
    const al = Math.hypot(_fwd.x, _fwd.z) || 1;
    const dot = (mx * _fwd.x + mz * _fwd.z) / al;
    const M = CFG.movement;
    return dot >= 0
        ? M.strafeWeight + (1 - M.strafeWeight) * dot                        // samping -> maju
        : M.strafeWeight + (M.backpedalWeight - M.strafeWeight) * (-dot);    // samping -> mundur
}

// Kuras stamina (melee/dodge). Jatuh ke 0 -> exhausted (terkunci sampai regen
// mencapai recoverThreshold) — dulu dipicu sprint; kini oleh dodge & melee.
export function drainStamina(n) {
    stamina -= n;
    if (stamina <= 0) { stamina = 0; staExhausted = true; }
}

// ----- Dodge/evade: dipanggil input.js saat tekan Shift. Mulai gulingan bila
// tidak sedang dodge, cooldown habis, tidak exhausted, stamina cukup, & tidak
// sedang memakai medkit. Arah = arah WASD bila ditekan; jika diam -> MUNDUR
// (lawan arah hadap bidik) = "tumble ke belakang". Kebal sepanjang animasi. -----
export function tryDodge() {
    if (dodgeActive || dodgeCd > 0 || staExhausted || medkitMode) return;
    if (stamina < CFG.dodge.staminaCost) return;
    drainStamina(CFG.dodge.staminaCost);
    const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);     // +1 = atas layar (-z)
    const side = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);    // +1 = kiri layar (-x)
    if (fwd !== 0 || side !== 0) {
        const inv = 1 / Math.hypot(fwd, side);
        dodgeDirX = -side * inv;   // A = -x dunia
        dodgeDirZ = -fwd * inv;    // W = -z dunia
    } else {
        camera.getWorldDirection(_fwd);   // arah hadap (= arah bidik, horizontal)
        const h = Math.hypot(_fwd.x, _fwd.z) || 1;
        dodgeDirX = -_fwd.x / h;   // MUNDUR = lawan arah hadap
        dodgeDirZ = -_fwd.z / h;
    }
    dodgeActive = true;
    dodgeProgress = 0;
    dodgeT = CFG.dodge.durationSec;
    dodgeCd = CFG.dodge.cooldownSec;   // jeda anti-spam (dari MULAI dodge)
    setDodgeInvuln(true);              // i-frame: kebal sepanjang animasi tumble
    clearMoveTarget();                 // dodge membatalkan gerak klik-kanan
}

// ===== Gerak klik-kanan "move to point" (kontrol top-down 2026-07-11) =====
// setMoveTarget dipanggil input.js saat klik kanan (titik kursor di bidang
// kaki); WASD / pause / tiba di tujuan / macet menabrak dinding membatalkan.
let moveTarget = null;         // {x, z} atau null
let moveLastD = Infinity;      // jarak terakhir (deteksi macet)
let moveStuckT = 0;            // detik tanpa kemajuan

export function setMoveTarget(x, z) {
    moveTarget = { x, z };
    moveLastD = Infinity;
    moveStuckT = 0;
    showMoveMarker(x, camera.position.y - eyeHCur, z);
}

export function clearMoveTarget() {
    moveTarget = null;
    hideMoveMarker();
}

// Dipanggil saat boot & resetGame: stempel nilai awal dari CFG
export function resetPlayerState() {
    player.vy = 0; player.onGround = true;
    eyeHCur = CFG.player.eyeHeight;
    stamina = CFG.stamina.max; staExhausted = false;
    dodgeActive = false; dodgeProgress = 0; dodgeT = 0; dodgeCd = 0;
    setDodgeInvuln(false);
    staminaFill.style.width = '100%';
    staminaFill.style.background = '#3ddc6a';
}

// --- Gerak player per frame (top-down 2026-07-11: WASD = SUMBU LAYAR, karena
// kamera render ber-yaw tetap menghadap -z — W atas layar, S bawah, A kiri,
// D kanan; KECEPATAN DIREKSIONAL 2026-07-12: penuh saat searah kursor,
// ×0.5 menyamping/mundur — lihat dirSpeedMul) + gerak klik-kanan ke titik +
// stamina + vertikal. Jongkok & ADS dihapus. ---
export function updatePlayerMovement(dt, step) {
    const oldX = camera.position.x, oldZ = camera.position.z;
    // Input WASD digabung jadi SATU vektor lalu dinormalisasi terhadap panjang
    // input mentah — diagonal (mis. W+A) tidak lagi ~1.41x lebih cepat.
    const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);     // +1 = atas layar (-z dunia)
    const side = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);    // +1 = kiri layar (-x dunia)
    const keyMove = fwd !== 0 || side !== 0;
    if (keyMove && moveTarget) clearMoveTarget();        // WASD membatalkan klik-kanan
    const moving = keyMove || moveTarget !== null;

    // --- Stamina: SPRINT DIHAPUS 2026-07-11. Kini hanya dikuras oleh dodge
    // (tryDodge) & melee; di sini cuma REGEN menuju penuh + pulih dari exhausted.
    stamina = Math.min(CFG.stamina.max, stamina + CFG.stamina.regenPerSec * dt);
    if (staExhausted && stamina >= CFG.stamina.recoverThreshold) staExhausted = false;
    // Bar HUD: hijau -> oranye -> merah (merah juga penanda exhausted)
    staminaFill.style.width = (stamina / CFG.stamina.max * 100) + '%';
    staminaFill.style.background = staExhausted ? '#e74c3c' : stamina > CFG.stamina.max * 0.45 ? '#3ddc6a' : '#e0a53e';

    // Cooldown dodge meluruh tiap frame (dari waktu MULAI dodge).
    if (dodgeCd > 0) dodgeCd -= dt;

    // Memakai medkit memperlambat gerak (medkitSlowMul, mis. -25%).
    const medkitMul = medkitMode ? CFG.player.medkitSlowMul : 1;
    if (dodgeActive) {
        // DODGE: guling ke arah dodgeDir dgn kecepatan meluruh (ease-out) — MENG-
        // OVERRIDE WASD/klik-kanan. Tabrakan dinding & badan robot tetap diproses
        // di bawah (tak bisa berguling menembus dinding). Animasi tumble di
        // playerAvatar membaca dodgeProgress; i-frame mati saat progress penuh.
        dodgeT -= dt;
        dodgeProgress = Math.min(1, 1 - Math.max(0, dodgeT) / CFG.dodge.durationSec);
        const spd = CFG.dodge.speed * (1 - dodgeProgress) * step;   // meluruh 1 -> 0
        camera.position.x += dodgeDirX * spd;
        camera.position.z += dodgeDirZ * spd;
        if (dodgeT <= 0) { dodgeActive = false; dodgeProgress = 1; setDodgeInvuln(false); }
    } else {
        const moveSpeed = player.speed * medkitMul * step;   // kecepatan dasar (dikali arah-relatif-kursor di bawah)
        if (keyMove) {
            const h = Math.hypot(fwd, side);
            // Pengali direksional: dihitung dari arah gerak ternormalisasi vs arah kursor
            const mul = dirSpeedMul(-side / h, -fwd / h);
            const k = moveSpeed * mul / h;
            camera.position.x += -side * k;   // A = kiri layar = -x dunia
            camera.position.z += -fwd * k;    // W = atas layar = -z dunia
        } else if (moveTarget) {
            // Gerak klik-kanan: lurus ke target dgn tabrakan dinding biasa
            // (menyusur); berhenti saat TIBA atau MACET (tak ada kemajuan ~1.2 dtk,
            // mis. tertahan dinding) supaya tidak berlari di tempat selamanya.
            // Pengali direksional juga berlaku (mundur/menyamping dari kursor = lambat).
            const dx = moveTarget.x - camera.position.x;
            const dz = moveTarget.z - camera.position.z;
            const d = Math.hypot(dx, dz);
            if (d < 3.5) clearMoveTarget();
            else {
                const mul = dirSpeedMul(dx / d, dz / d);
                const k = Math.min(moveSpeed * mul, d) / d;
                camera.position.x += dx * k;
                camera.position.z += dz * k;
                if (d < moveLastD - 0.05) { moveLastD = d; moveStuckT = 0; }
                else {
                    moveStuckT += dt;
                    if (moveStuckT > 1.2) clearMoveTarget();
                }
            }
        }
    }

    // Badan robot pejal bagi player: dorong keluar horizontal (2D, konsisten
    // dgn filosofi tabrakan 2D game ini) — player tak bisa menembus kerumunan.
    // Hanya PLAYER yang didorong; gerak/AI robot tidak tersentuh. Robot yang
    // masih melayang (lompat pagar / vault bak) dilewati. Dinding scene di
    // bawah tetap membersihkan posisi akhir setelah dorongan ini.
    const ZBODY_R = CFG.robot.bodyBlockRadius;
    for (let zi = 0; zi < robots.length; zi++) {
        const zb = robots[zi];
        // idle (campaign) ikut pejal — tak bisa ditembus sambil mereka diam;
        // aman dari dorongan tiap-frame karena robot idle tidak mencakar.
        if (zb.state !== 'chasing' && zb.state !== 'idle') continue;
        const zdx = camera.position.x - zb.mesh.position.x;
        const zdz = camera.position.z - zb.mesh.position.z;
        const zd = Math.hypot(zdx, zdz);
        const br = ZBODY_R * (zb.scl || 1);   // kelas besar (A/boss) = badan lebih lebar
        if (zd < br && zd > 0.001) {
            const push = (br - zd) / zd;
            camera.position.x += zdx * push;
            camera.position.z += zdz * push;
        }
    }

    // Dinding & penghalang dunia milik scene aktif (pagar+Monas+pohon/bak di
    // survival; grid gedung / tepi jalan + blocker + trigger exit di campaign).
    const feetNow = camera.position.y - eyeHCur;
    activeScene.playerCollide(camera.position, oldX, oldZ, feetNow);

    // --- Gravitasi + jatuh dari tepian (tanpa lompat di top-down). Batas
    // horizontal scene di atas bekerja apa pun ketinggiannya. vy hanya pernah
    // negatif (jatuh) atau 0 (menapak): di tanah datar ia dijepit ke lantai
    // tiap frame; melangkah dari tepi standable (stage 2) memicu jatuh.
    const feetY = camera.position.y - eyeHCur;
    const gH = activeScene.groundHeight(camera.position.x, camera.position.z, feetY);
    const wasAirborne = !player.onGround;
    player.vy -= CFG.player.gravity * dt;
    let newFeet = feetY + player.vy * dt;
    if (newFeet <= gH && player.vy <= 0) {        // mendarat / menempel lantai
        newFeet = gH;
        player.vy = 0;
        player.onGround = true;
        if (wasAirborne) playSFX(sfxFootstep, 0.55);   // bunyi mendarat setelah jatuh
    } else {
        player.onGround = false;
    }
    eyeHCur = CFG.player.eyeHeight;   // tinggi pivot tetap = kaki + tinggi mata
    camera.position.y = newFeet + eyeHCur;

    // Langkah kaki berirama saat berjalan/berlari di tanah (WASD ataupun
    // gerak klik-kanan — `moving` sudah menghitung keduanya)
    if (player.onGround && moving && !dodgeActive) {
        footT -= dt;
        if (footT <= 0) {
            playSFX(sfxFootstep, 0.4);
            footT = 0.42;   // irama langkah jalan (sprint dihapus)
        }
    } else {
        footT = 0.12;   // langkah pertama cepat terdengar saat mulai bergerak
    }

    // Langkah robot: HEMAT PERFORMA — cuma SATU playSFX tiap ~0.55 dtk dari
    // robot bergerak terdekat, volume mengecil dgn jarak. Cukup sebagai
    // penanda "ada yang mendekat" tanpa membebani audio/CPU per robot.
    zStepT -= dt;
    if (zStepT <= 0) {
        zStepT = 0.55;
        let nd = 120;   // radius dengar
        for (let zi = 0; zi < robots.length; zi++) {
            const zz = robots[zi];
            if (zz.state !== 'chasing' || zz.moving === false) continue;
            const d = Math.hypot(zz.mesh.position.x - camera.position.x, zz.mesh.position.z - camera.position.z);
            if (d < nd) nd = d;
        }
        if (nd < 120) playSFX(sfxRobotStep, Math.max(0.08, 0.5 * (1 - nd / 120)));
    }
}
