// Player = kamera. Modul ini memiliki: gerak WASD (normalisasi diagonal) +
// gerak klik-kanan, stamina, gravitasi + jatuh dari tepian (tanpa lompat),
// bunyi langkah, dan kepejalan badan zombie terhadap player. Tabrakan dunia
// (pagar/dinding/penghalang) didelegasikan ke scene aktif. (Jongkok & lompat
// DIHAPUS 2026-07-11 — top-down tak punya keduanya.)

import { CFG } from '../core/config.js';
import { player, keys, zombies } from '../core/state.js';
import { camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { playSFX, sfxFootstep, sfxZombieStep } from '../utils/sfx.js';
import { staminaFill } from '../core/dom.js';
import { medkitMode } from './weapons.js';
import { showMoveMarker, hideMoveMarker } from './playerAvatar.js';

// ----- Status milik player (live export; reassign hanya di modul ini) -----
export let stamina = 100;
export let staExhausted = false;
export let sprintingNow = false;   // sprint EFEKTIF frame ini (shift + bergerak + stamina ada)
export let eyeHCur = 11.4;         // tinggi mata (konstan = eyeHeight; jongkok dihapus)

let footT = 0;    // irama langkah kaki player (detik antar langkah)
let zStepT = 0;   // irama langkah zombie (satu suara global, bukan per zombie)

export function drainStamina(n) { stamina -= n; }

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
    stamina = CFG.stamina.max; staExhausted = false; sprintingNow = false;
    staminaFill.style.width = '100%';
    staminaFill.style.background = '#3ddc6a';
}

// --- Gerak player per frame (top-down 2026-07-11: WASD = SUMBU LAYAR, karena
// kamera render ber-yaw tetap menghadap -z — W atas layar, S bawah, A kiri,
// D kanan; kecepatan seragam ke semua arah ala Alien Shooter) + gerak
// klik-kanan ke titik + stamina + vertikal. Jongkok & ADS dihapus. ---
export function updatePlayerMovement(dt, step) {
    const oldX = camera.position.x, oldZ = camera.position.z;
    // Input WASD digabung jadi SATU vektor lalu dinormalisasi terhadap panjang
    // input mentah — diagonal (mis. W+A) tidak lagi ~1.41x lebih cepat.
    const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);     // +1 = atas layar (-z dunia)
    const side = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);    // +1 = kiri layar (-x dunia)
    const keyMove = fwd !== 0 || side !== 0;
    if (keyMove && moveTarget) clearMoveTarget();        // WASD membatalkan klik-kanan
    const moving = keyMove || moveTarget !== null;

    // --- Stamina: kuras (lari) -> exhausted -> pulih (regen). Sprint efektif =
    // shift + benar-benar bergerak (WASD ataupun gerak klik-kanan) + stamina ada.
    sprintingNow = keys.shift && !staExhausted && stamina > 0 && moving && !medkitMode;
    if (sprintingNow) stamina -= CFG.stamina.sprintDrainPerSec * dt;
    if (stamina <= 0) {
        stamina = 0;
        staExhausted = true;
        sprintingNow = false;
    }
    if (!sprintingNow) stamina = Math.min(CFG.stamina.max, stamina + CFG.stamina.regenPerSec * dt);
    if (staExhausted && stamina >= CFG.stamina.recoverThreshold) staExhausted = false;
    // Bar HUD: hijau -> oranye -> merah (merah juga penanda exhausted)
    staminaFill.style.width = (stamina / CFG.stamina.max * 100) + '%';
    staminaFill.style.background = staExhausted ? '#e74c3c' : stamina > CFG.stamina.max * 0.45 ? '#3ddc6a' : '#e0a53e';

    // Memakai medkit memperlambat gerak (medkitSlowMul, mis. -25%).
    const medkitMul = medkitMode ? CFG.player.medkitSlowMul : 1;
    const moveSpeed = player.speed * (sprintingNow ? CFG.movement.sprintMultiplier : 1) * medkitMul * step;
    if (keyMove) {
        const k = moveSpeed / Math.hypot(fwd, side);
        camera.position.x += -side * k;   // A = kiri layar = -x dunia
        camera.position.z += -fwd * k;    // W = atas layar = -z dunia
    } else if (moveTarget) {
        // Gerak klik-kanan: lurus ke target dgn tabrakan dinding biasa
        // (menyusur); berhenti saat TIBA atau MACET (tak ada kemajuan ~1.2 dtk,
        // mis. tertahan dinding) supaya tidak berlari di tempat selamanya.
        const dx = moveTarget.x - camera.position.x;
        const dz = moveTarget.z - camera.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.5) clearMoveTarget();
        else {
            const k = Math.min(moveSpeed, d) / d;
            camera.position.x += dx * k;
            camera.position.z += dz * k;
            if (d < moveLastD - 0.05) { moveLastD = d; moveStuckT = 0; }
            else {
                moveStuckT += dt;
                if (moveStuckT > 1.2) clearMoveTarget();
            }
        }
    }

    // Badan zombie pejal bagi player: dorong keluar horizontal (2D, konsisten
    // dgn filosofi tabrakan 2D game ini) — player tak bisa menembus kerumunan.
    // Hanya PLAYER yang didorong; gerak/AI zombie tidak tersentuh. Zombie yang
    // masih melayang (lompat pagar / vault bak) dilewati. Dinding scene di
    // bawah tetap membersihkan posisi akhir setelah dorongan ini.
    const ZBODY_R = CFG.zombie.bodyBlockRadius;
    for (let zi = 0; zi < zombies.length; zi++) {
        const zb = zombies[zi];
        // idle (campaign) ikut pejal — tak bisa ditembus sambil mereka diam;
        // aman dari dorongan tiap-frame karena zombie idle tidak mencakar.
        if (zb.state !== 'chasing' && zb.state !== 'idle') continue;
        const zdx = camera.position.x - zb.mesh.position.x;
        const zdz = camera.position.z - zb.mesh.position.z;
        const zd = Math.hypot(zdx, zdz);
        const br = ZBODY_R * (zb.scl || 1);   // varian besar (brute/boss) = badan lebih lebar
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
    if (player.onGround && moving) {
        footT -= dt;
        if (footT <= 0) {
            playSFX(sfxFootstep, 0.4);
            footT = sprintingNow ? 0.28 : 0.42;   // lari EFEKTIF = irama rapat
        }
    } else {
        footT = 0.12;   // langkah pertama cepat terdengar saat mulai bergerak
    }

    // Langkah zombie: HEMAT PERFORMA — cuma SATU playSFX tiap ~0.55 dtk dari
    // zombie bergerak terdekat, volume mengecil dgn jarak. Cukup sebagai
    // penanda "ada yang mendekat" tanpa membebani audio/CPU per zombie.
    zStepT -= dt;
    if (zStepT <= 0) {
        zStepT = 0.55;
        let nd = 120;   // radius dengar
        for (let zi = 0; zi < zombies.length; zi++) {
            const zz = zombies[zi];
            if (zz.state !== 'chasing' || zz.moving === false) continue;
            const d = Math.hypot(zz.mesh.position.x - camera.position.x, zz.mesh.position.z - camera.position.z);
            if (d < nd) nd = d;
        }
        if (nd < 120) playSFX(sfxZombieStep, Math.max(0.08, 0.5 * (1 - nd / 120)));
    }
}
