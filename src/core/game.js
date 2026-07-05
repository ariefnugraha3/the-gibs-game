// Orkestrasi inti: urutan update per frame (kontrak urutan LAMA dipertahankan
// persis), game over, dan reset/restart. Logika detail hidup di modul
// entities/*; logika khas mode hidup di scene aktif.

import {
    isPaused, isGameOver, setGameOver, setScore, score, highScore, setHighScore,
    zombies, bullets, grenades, explosions, drops, clearArray, configurePlayer
} from './state.js';
import { scene } from './renderer.js';
import { activeScene, setScene } from './sceneManager.js';
import { gameOverScreen, gameOverTitle, finalScoreEl, bestScoreEl } from './dom.js';
import { updateUI } from './hud.js';
import { updateWeaponTimers, updateWeaponState, updateShooting, resetWeapons } from '../entities/weapons.js';
import { updatePlayerMovement, resetPlayerState } from '../entities/player.js';
import { updateGrenades } from '../entities/grenades.js';
import { updateExplosions, updateBloodPool, resetBloodPool } from '../entities/effects.js';
import { updateDrops } from '../entities/drops.js';
import { updateBullets } from '../entities/bullets.js';
import { updateZombies, disposeZombie } from '../entities/zombies.js';
import { releaseInputs, requestLock } from './input.js';

// Urutan blok = urutan update() lama — JANGAN diubah tanpa alasan kuat:
// mis. peluru harus maju SEBELUM hit test zombie memakai segmen sweep-nya.
export function updateGame(dt, step, T) {
    if (isGameOver || isPaused) return;

    if (activeScene.updateMode) activeScene.updateMode(dt);   // survival: wave + spawner

    updateWeaponTimers(dt);        // animasi ganti senjata + melee (hit di 45%)
    updatePlayerMovement(dt, step);// stamina, WASD, tabrakan scene, lompat, langkah
    if (isGameOver) return;        // (jaga-jaga: transisi scene tak mengakhiri game)
    updateWeaponState(dt);         // recoil/heat decay + posisi z senjata
    updateShooting();              // klik kiri -> spawn peluru
    updateGrenades(dt);            // balistik + fuse + ledakan
    updateExplosions(dt);          // animasi visual ledakan/puff
    updateBloodPool(dt);           // pudarkan percikan darah
    updateDrops(dt, T);            // bob item + pickup + kedaluwarsa
    updateBullets(step);           // maju + mati di dinding scene
    updateZombies(dt, step);       // AI scene + cakar + rig + hit peluru
    if (isGameOver) return;        // cakar bisa mengakhiri game di tengah loop

    if (activeScene.checkWin) activeScene.checkWin();   // campaign stage akhir
}

export function gameOver(won) {
    setGameOver(true);
    document.exitPointerLock();
    if (score > highScore) setHighScore(score);
    // Campaign selesai = menang; selain itu (HP habis) = kalah.
    gameOverTitle.innerText = won ? 'MISSION COMPLETE' : 'GAME OVER';
    gameOverScreen.style.background = won ? 'rgba(0, 90, 30, 0.82)' : 'rgba(150, 0, 0, 0.8)';
    finalScoreEl.innerText = `Score: ${score}`;
    bestScoreEl.innerText = `Best: ${highScore}`;
    gameOverScreen.style.display = 'flex';
}

export function resetGame() {
    setScore(0);
    configurePlayer();     // hp/granat/amunisi/magazen kembali ke nilai CFG
    releaseInputs();
    resetWeapons();        // batalkan reload/ganti/melee; kembali ke rifle
    resetPlayerState();    // vy/onGround/crouch/stamina + bar stamina

    setGameOver(false);
    gameOverScreen.style.display = 'none';

    // Bersihkan seluruh entitas (material per-instance di-dispose)
    zombies.forEach(z => { disposeZombie(z); scene.remove(z.mesh); });
    zombies.length = 0;
    resetBloodPool();   // pool tetap, cukup disembunyikan
    clearArray(bullets, scene);
    clearArray(grenades, scene);
    clearArray(explosions, scene);
    clearArray(drops, scene);

    // Scene menentukan titik restart: survival mengulang di tempat; campaign
    // SELALU mengulang dari stage 1 (kebijakan restartScene milik stage).
    const target = activeScene.restartScene ? activeScene.restartScene() : activeScene;
    if (target === activeScene) target.enter({ fresh: true });
    else setScene(target, { fresh: true });

    updateUI();
    requestLock();
}
