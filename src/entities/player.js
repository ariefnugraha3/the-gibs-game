// Player = kamera. Modul ini memiliki: gerak WASD (bobot arah + normalisasi
// diagonal), stamina, jongkok (toggle C / tahan Ctrl), lompat + gravitasi,
// bunyi langkah, dan kepejalan badan zombie terhadap player. Tabrakan dunia
// (pagar/dinding/penghalang) didelegasikan ke scene aktif.

import { CFG } from '../core/config.js';
import { player, keys, zombies, isPaused, isGameOver, _dir, _right } from '../core/state.js';
import { camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { playSFX, sfxFootstep, sfxZombieStep } from '../utils/sfx.js';
import { staminaFill } from '../core/dom.js';
import { isAiming, setAiming } from './weapons.js';

// ----- Status milik player (live export; reassign hanya di modul ini) -----
export let stamina = 100;
export let staExhausted = false;
export let sprintingNow = false;   // sprint EFEKTIF frame ini (shift + bergerak + stamina ada)
export let crouchedNow = false;    // jongkok efektif frame ini (toggle C ATAU tahan Ctrl)
export let eyeHCur = 11.4;         // tinggi mata efektif frame ini (turun saat jongkok)

let isCrouching = false, crouchT = 0;   // crouchT 0..1 (transisi dihaluskan)
let crouchHold = false;                 // jongkok versi TAHAN (Ctrl kiri); C tetap toggle
let footT = 0;    // irama langkah kaki player (detik antar langkah)
let zStepT = 0;   // irama langkah zombie (satu suara global, bukan per zombie)

export function drainStamina(n) { stamina -= n; }
export function toggleCrouch() { isCrouching = !isCrouching; }
export function setCrouchHold(v) { crouchHold = v; }   // keyup clearing TANPA gate — tak boleh nyangkut
export function clearCrouch() { isCrouching = false; crouchHold = false; }

// Lompat (SPASI): hanya saat menapak & tidak pause
export function tryJump() {
    if (!isPaused && player.onGround) {
        player.vy = CFG.player.jumpVelocity;
        player.onGround = false;
    }
}

// Dipanggil saat boot & resetGame: stempel nilai awal dari CFG
export function resetPlayerState() {
    player.vy = 0; player.onGround = true;
    crouchT = 0; eyeHCur = CFG.player.eyeHeight;   // isCrouching dilepas releaseInputs()
    stamina = CFG.stamina.max; staExhausted = false; sprintingNow = false;
    staminaFill.style.width = '100%';
    staminaFill.style.background = '#3ddc6a';
}

// --- Gerak player per frame (WASD relatif kamera) + stamina + vertikal ---
export function updatePlayerMovement(dt, step) {
    camera.getWorldDirection(_dir);
    _dir.y = 0; _dir.normalize();
    _right.crossVectors(camera.up, _dir).normalize();

    const oldX = camera.position.x, oldZ = camera.position.z;
    // Jongkok efektif = toggle C ATAU tahan Ctrl kiri
    crouchedNow = isCrouching || crouchHold;
    // Input WASD digabung jadi SATU vektor lalu dinormalisasi terhadap panjang
    // input mentah — diagonal (mis. W+A) tidak lagi ~1.41x lebih cepat (bug fix).
    // Bobot arah: komponen mundur & samping diperlambat (CFG.movement);
    // gerak diagonal mendapat interpolasi di antara bobot-bobot itu.
    const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const side = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);

    // --- Stamina: kuras (lari/ADS) -> exhausted -> pulih (regen) ---
    // Sprint efektif butuh: shift + tidak jongkok + benar-benar BERGERAK +
    // stamina tersedia & tidak sedang exhausted.
    sprintingNow = keys.shift && !crouchedNow && !staExhausted && stamina > 0
        && (fwd !== 0 || side !== 0);
    if (sprintingNow) stamina -= CFG.stamina.sprintDrainPerSec * dt;
    if (isAiming) stamina -= CFG.stamina.adsDrainPerSec * dt;
    if (stamina <= 0) {
        stamina = 0;
        staExhausted = true;
        sprintingNow = false;
        setAiming(false);        // terlalu lelah membidik — senjata turun sendiri
    }
    if (!sprintingNow && !isAiming) stamina = Math.min(CFG.stamina.max, stamina + CFG.stamina.regenPerSec * dt);
    if (staExhausted && stamina >= CFG.stamina.recoverThreshold) staExhausted = false;
    // Bar HUD: hijau -> oranye -> merah (merah juga penanda exhausted)
    staminaFill.style.width = (stamina / CFG.stamina.max * 100) + '%';
    staminaFill.style.background = staExhausted ? '#e74c3c' : stamina > CFG.stamina.max * 0.45 ? '#3ddc6a' : '#e0a53e';

    // Pengali kecepatan: jongkok (mendominasi, TIDAK ditumpuk dgn ADS);
    // ADS saja lebih lambat. Sprint dimatikan selama jongkok / stamina habis.
    const moveMult = crouchedNow ? CFG.movement.crouchMultiplier : (isAiming ? CFG.movement.adsMultiplier : 1);
    const moveSpeed = player.speed * (sprintingNow ? CFG.movement.sprintMultiplier : 1) * moveMult * step;
    if (fwd !== 0 || side !== 0) {
        const wz = fwd * (fwd < 0 ? CFG.movement.backpedalWeight : 1);   // mundur lebih lambat
        const wx = side * CFG.movement.strafeWeight;                     // menyamping lebih lambat
        const k = moveSpeed / Math.hypot(fwd, side);
        camera.position.addScaledVector(_dir, wz * k);
        camera.position.addScaledVector(_right, wx * k);
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
        if (zd < ZBODY_R && zd > 0.001) {
            const push = (ZBODY_R - zd) / zd;
            camera.position.x += zdx * push;
            camera.position.z += zdz * push;
        }
    }

    // Dinding & penghalang dunia milik scene aktif (pagar+Monas+pohon/bak di
    // survival; grid gedung / tepi jalan + blocker + trigger exit di campaign).
    const feetNow = camera.position.y - eyeHCur;
    activeScene.playerCollide(camera.position, oldX, oldZ, feetNow);

    // --- Lompat & gravitasi (SPASI). Batas horizontal scene di atas bekerja
    // apa pun ketinggiannya. PENTING: kaki dihitung dgn eyeHCur frame LALU;
    // crouchT baru diperbarui setelahnya — kaki tetap menempel tanah selama
    // transisi jongkok (tanpa "jatuh" semu yang memicu bunyi mendarat).
    const feetY = camera.position.y - eyeHCur;
    const gH = activeScene.groundHeight(camera.position.x, camera.position.z, feetY);
    const wasAirborne = !player.onGround;
    player.vy -= CFG.player.gravity * dt;
    let newFeet = feetY + player.vy * dt;
    if (newFeet <= gH && player.vy <= 0) {        // mendarat / menempel lantai
        newFeet = gH;
        player.vy = 0;
        player.onGround = true;
        if (wasAirborne) playSFX(sfxFootstep, 0.55);   // bunyi mendarat setelah lompat
    } else {
        player.onGround = false;
    }
    // Transisi jongkok mulus: mata turun crouchDrop saat crouchT -> 1
    crouchT += ((crouchedNow ? 1 : 0) - crouchT) * Math.min(1, dt * 10);
    eyeHCur = CFG.player.eyeHeight - CFG.player.crouchDrop * crouchT;
    camera.position.y = newFeet + eyeHCur;

    // Langkah kaki berirama saat berjalan/berlari di tanah (jongkok = pelan & senyap)
    if (player.onGround && (keys.w || keys.a || keys.s || keys.d)) {
        footT -= dt;
        if (footT <= 0) {
            playSFX(sfxFootstep, crouchedNow ? 0.22 : 0.4);
            footT = crouchedNow ? 0.6 : sprintingNow ? 0.28 : 0.42;   // lari EFEKTIF = irama rapat
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
