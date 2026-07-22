// Orkestrasi inti: urutan update per frame (kontrak urutan LAMA dipertahankan
// persis), game over, dan reset/restart. Logika detail hidup di modul
// entities/*; logika khas mode hidup di scene aktif.

import { CFG } from './config.js';
import {
    isPaused, isGameOver, setGameOver, setScore, score, highScore, setHighScore, player,
    robots, bullets, enemyBullets, grenades, explosions, drops, clearArray, configurePlayer,
    stats, resetStats, mode, cinematicActive
} from './state.js';
import { scene } from './renderer.js';
import { activeScene, setScene } from './sceneManager.js';
import { gameOverScreen, gameOverTitle, finalScoreEl, bestScoreEl } from './dom.js';
import { updateUI } from './hud.js';
import { updateWeaponTimers, updateWeaponState, updateShooting, resetWeapons } from '../entities/weapons.js';
import { updatePlayerMovement, resetPlayerState } from '../entities/player.js';
import { updateGrenades } from '../entities/grenades.js';
import { updateExplosions, updateBloodPool, resetBloodPool, spawnBloodBurst } from '../entities/effects.js';
import { updateGore, resetGore, spawnBloodDecal } from '../entities/gore.js';
import { updateDrops } from '../entities/drops.js';
import { updateBarrels, barrelBulletHits, resetBarrels } from '../entities/barrels.js';
import { updateBullets } from '../entities/bullets.js';
import { updateRobots, updateEnemyBullets, disposeRobot, resetRobotsFx, PLAYER_BLOOD_HEX } from '../entities/robots.js';
import { avatarGroup, hideMoveMarker, playAvatarDeath, resetAvatarDeath } from '../entities/playerAvatar.js';
import { releaseInputs, requestLock } from './input.js';
import { clearCampaignSave, loadCampaignStage } from './saveGame.js';
import { campaignJumpToStage } from '../scenes/campaign/utility/transition.js';
import { stopMusic } from '../utils/sfx.js';

// ===== Sekuens KEMATIAN player (2026-07-12; revisi "mati biasa"): HP habis
// TIDAK langsung layar GAME OVER — avatar ROBOH ke arah dorongan damage
// terakhir (animasi playAvatarDeath di playerAvatar.js: rebah di pivot kaki,
// senjata terlepas, tubuh lemas) dengan semburan darah sedang + genangan di
// bawah badan (TANPA gib/ledakan), dunia tetap hidup TANPA kendali player,
// lalu layar muncul setelah CFG.player.deathDelaySec (2 dtk). Dipicu
// startPlayerDeath(dirx, dirz) dari semua titik damage player di robots.js. =====
let playerDeathT = -1;   // >= 0 = sekuens kematian sedang berjalan
export function isPlayerDying() { return playerDeathT >= 0; }

export function startPlayerDeath(dirx = 0, dirz = 1) {
    if (playerDeathT >= 0 || isGameOver) return;   // sekali saja
    playerDeathT = CFG.player.deathDelaySec != null ? CFG.player.deathDelaySec : 2;
    player.hp = 0;
    releaseInputs();        // lepaskan WASD/klik yang tertahan (pointer tetap terkunci)
    hideMoveMarker();
    updateUI();
    const dl = Math.hypot(dirx, dirz) || 1;
    const dx = dirx / dl, dz = dirz / dl;
    playAvatarDeath(dx, dz);   // tubuh roboh searah dorongan (avatar TETAP tampil)
    // Darah kematian sedang (bukan ledakan): satu semburan searah roboh +
    // genangan di titik jatuh dan di arah rebah badan (kepala mendarat ~6 unit).
    const p = avatarGroup.position;
    spawnBloodBurst(p.x, p.y + 6, p.z, dx, dz, 12, 1.0, 2.6, PLAYER_BLOOD_HEX);
    spawnBloodDecal(p.x, p.z, 5, 0x8f1616);
    spawnBloodDecal(p.x + dx * 6, p.z + dz * 6, 3.5, 0x8f1616);
}

// Urutan blok = urutan update() lama — JANGAN diubah tanpa alasan kuat:
// mis. peluru harus maju SEBELUM hit test robot memakai segmen sweep-nya.
export function updateGame(dt, step, T) {
    if (isGameOver || isPaused) return;

    // Sekuens kematian: hitung mundur -> layar GAME OVER. Selama itu dunia
    // (darah/gib/robot/peluru) tetap berjalan, tapi SEMUA kendali & update
    // player (gerak/tembak/timer senjata) dan wave/win-check dilewati.
    const dying = playerDeathT >= 0;
    if (dying) {
        playerDeathT -= dt;
        if (playerDeathT <= 0) { playerDeathT = -1; gameOver(false); return; }
    }

    if (!dying && activeScene.updateMode) activeScene.updateMode(dt);   // survival: wave + spawner

    // MODE SINEMATIK (2026-07-17): cutscene membekukan SEMUA kendali player
    // (blok yang sama dgn sekuens kematian) tapi updateMode TETAP jalan di
    // atas (cutscene dikemudikan dari sana) dan dunia tetap disimulasikan.
    const noCtl = dying || cinematicActive;
    if (!noCtl) {
        updateWeaponTimers(dt);        // animasi ganti senjata + melee (hit di 45%)
        updatePlayerMovement(dt, step);// stamina, WASD, tabrakan scene, lompat, langkah
        if (isGameOver) return;        // (jaga-jaga: transisi scene tak mengakhiri game)
        updateWeaponState(dt);         // recoil/heat decay + posisi z senjata
        updateShooting();              // klik kiri -> spawn peluru
    }
    updateGrenades(dt);            // balistik + fuse + ledakan
    updateExplosions(dt);          // animasi visual ledakan/puff
    updateBloodPool(dt);           // pudarkan percikan darah
    updateDrops(dt, T);            // bob item + pickup + kedaluwarsa (+ magnet loot)
    updateBarrels(dt);             // denyut beacon barel peledak
    updateBullets(step);           // maju + mati di dinding scene
    barrelBulletHits();            // peluru player -> barel meledak (SEBELUM sweep robot)
    updateRobots(dt, step);       // AI scene + serang (cakar/tembak) + rig + hit peluru (+ spawn mayat/gib saat mati)
    if (isGameOver) return;        // Monas runtuh (damageMonas) tetap mengakhiri game seketika
    updateEnemyBullets(dt, step);  // peluru robot ranged -> hit player (bisa memicu sekuens kematian)
    if (isGameOver) return;        // peluru ber-monasDmg bisa meruntuhkan Monas
    updateGore(dt);                // mayat terjatuh/memudar + gib balistik + genangan darah

    if (!dying && activeScene.checkWin) activeScene.checkWin();   // campaign stage akhir
}

// title opsional: judul khusus scene (mis. survival 'THE MONUMENT HAS FALLEN');
// default tetap MISSION COMPLETE / GAME OVER.
export function gameOver(won, title) {
    setGameOver(true);
    stopMusic();   // stage berakhir (menang/kalah) -> musik battle/boss berhenti (2026-07-19)
    document.exitPointerLock();
    // MISSION COMPLETE (won, campaign stage 4 selesai) = campaign tamat →
    // hapus checkpoint supaya campaign berikutnya mulai baru (bukan Continue).
    if (won) clearCampaignSave();
    if (score > highScore) setHighScore(score);
    // Campaign selesai = menang; selain itu (HP habis) = kalah.
    gameOverTitle.innerText = title || (won ? 'MISSION COMPLETE' : 'GAME OVER');
    gameOverScreen.style.background = won ? 'rgba(0, 90, 30, 0.82)' : 'rgba(150, 0, 0, 0.8)';
    finalScoreEl.innerText = `Money: ${score}`;
    bestScoreEl.innerText = `Best: ${highScore}`;
    // Statistik run (IMPROVEMENT-PLAN #10): akurasi dihitung per peluru
    const acc = stats.shots > 0 ? Math.round(stats.hits / stats.shots * 100) : 0;
    document.getElementById('goStats').innerText =
        `Kills ${stats.kills} · Accuracy ${acc}%`;
    // Prompt game-over: RESTART (campaign = ulang dari AWAL stage yang sedang
    // dimainkan; survival = ulang run) / EXIT TO MAIN MENU (reload → #mainMenu).
    wireGameOverButtons();
    document.getElementById('goRestart').textContent =
        mode === 'campaign' ? 'RESTART STAGE' : 'RESTART';
    gameOverScreen.style.display = 'flex';
}

// Rangkai tombol prompt game-over sekali (lazy). Restart = ulang stage sekarang
// (checkpoint campaign), Exit = kembali ke menu utama (reload — startGame
// sekali-jalan). Klik bekerja karena pointer sudah di-unlock oleh gameOver.
let goWired = false;
function wireGameOverButtons() {
    if (goWired) return;
    goWired = true;
    document.getElementById('goRestart').addEventListener('click', () => resetGame(true));
    document.getElementById('goExit').addEventListener('click', () => location.reload());
}

// atCurrentStage: campaign mengulang dari AWAL stage yang sedang dimainkan
// (checkpoint tersimpan) alih-alih stage 1 — dipakai prompt/SPACE game-over.
// Default false = kebijakan restartScene (pause "RESTART GAME" = dari awal).
export function resetGame(atCurrentStage = false) {
    setScore(0);
    stopMusic();           // run baru: musik battle mati sampai tembakan kena pertama (2026-07-19)
    resetStats();          // statistik run baru
    configurePlayer();     // hp/granat/amunisi/magazen/upgrade kembali ke nilai CFG
    playerDeathT = -1;     // batalkan sekuens kematian yang mungkin berjalan
    resetAvatarDeath();    // bangkit dari pose roboh + prop senjata dievaluasi ulang
    releaseInputs();
    resetWeapons();        // batalkan reload/ganti/melee; kembali ke rifle
    resetPlayerState();    // vy/onGround/stamina + bar stamina

    setGameOver(false);
    gameOverScreen.style.display = 'none';

    // Bersihkan seluruh entitas (material per-instance di-dispose)
    robots.forEach(z => { disposeRobot(z); scene.remove(z.mesh); });
    robots.length = 0;
    resetRobotsFx();   // antrean ledakan (peluru Grenade Launcher) yang belum terproses
    resetBloodPool();   // pool tetap, cukup disembunyikan
    resetGore();        // buang mayat + sembunyikan pool gib/genangan darah
    resetBarrels();     // buang barel peledak (ditaruh ulang oleh enter() stage)
    clearArray(bullets, scene);
    clearArray(enemyBullets, scene);   // peluru robot ranged
    clearArray(grenades, scene);
    clearArray(explosions, scene);
    clearArray(drops, scene);

    // Titik restart: `atCurrentStage` (prompt game-over) campaign → ulang dari
    // AWAL stage checkpoint (campaignJumpToStage: dunia sudah terbangun selama
    // main, ia setScene + tempatkan robot stage itu; stage 2 ditangani khusus).
    // Selain itu (pause "RESTART GAME") pakai kebijakan restartScene stage:
    // survival mengulang di tempat, campaign dari stage 1.
    if (atCurrentStage && mode === 'campaign') {
        campaignJumpToStage(loadCampaignStage() || 1);
    } else {
        const target = activeScene.restartScene ? activeScene.restartScene() : activeScene;
        if (target === activeScene) target.enter({ fresh: true });
        else setScene(target, { fresh: true });
    }

    updateUI();
    requestLock();
}
