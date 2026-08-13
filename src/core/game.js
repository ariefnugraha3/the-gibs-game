// Orkestrasi inti: urutan update per frame (kontrak urutan LAMA dipertahankan
// persis), game over, dan reset/restart. Logika detail hidup di modul
// entities/*; logika khas mode hidup di scene aktif.

import { CFG } from './config.js';
import {
    isPaused, isGameOver, setGameOver, setScore, score, highScore, setHighScore, player,
    robots, bullets, enemyBullets, grenades, explosions, drops, clearArray, configurePlayer,
    stats, resetStats, mode, cinematicActive, stageStats, updateStageStats,
    resetStageStats, beginStageStats
} from './state.js';
import { scene } from './renderer.js';
import { activeScene, setScene } from './sceneManager.js';
import {
    gameOverScreen, gameOverTitle, finalScoreEl, bestScoreEl,
    goStageStats, goTotalTime, goLootBoxes, hideBossHud,
} from './dom.js';
import { updateUI } from './hud.js';
import { updateWeaponTimers, updateWeaponState, updateShooting, resetWeapons } from '../entities/weapons.js';
import { updatePlayerMovement, resetPlayerState } from '../entities/player.js';
import { updateGrenades } from '../entities/grenades.js';
import { updateExplosions, updateBloodPool, resetBloodPool, resetMuzzleFlashes, resetShellCasings } from '../entities/effects.js';
import { updateGore, resetGore } from '../entities/gore.js';
import { updateDrops } from '../entities/drops.js';
import { updateBarrels, barrelBulletHits, resetBarrels } from '../entities/barrels.js';
import { crateBulletHits, updateCrates, resetCrates } from '../entities/crates.js';
import { updateBullets } from '../entities/bullets.js';
import { updateRobots, updateEnemyBullets, disposeRobot, resetRobotsFx } from '../entities/robots.js';
import { avatarGroup, hideMoveMarker, playAvatarDeath, resetAvatarDeath } from '../entities/playerAvatar.js';
import { releaseInputs, requestLock } from './input.js';
import { clearCampaignSave, loadCampaignStage } from './saveGame.js';
import { campaignJumpToStage } from '../scenes/campaign/utility/transition.js';
import { stopMusic } from '../utils/sfx.js';
import { startDeathCine, updateDeathCine, endDeathCine, resetDeathCine } from './deathCine.js';
import { updateTimeScale, resetTimeScale } from './timeScale.js';

// ===== Sekuens KEMATIAN player (2026-07-12; DIDRAMATISASI 2026-07-26): HP habis
// TIDAK langsung layar GAME OVER — dunia masuk SLOW MOTION, kamera mendekat &
// memiring ke jasad, layar menutup berdarah, dan avatar RUNTUH dalam 4 fase
// (hentak → lutut menyerah → jatuh → pantulan) sambil senjatanya TERLEPAS
// terbang. Pembagian tugas: animasi tubuh = poseDeath (entities/playerAvatar.js),
// lapisan sinematik + isyarat FX/audio = core/deathCine.js, dan modul ini hanya
// GERBANG-nya (kendali player mati, hitung mundur ke layar GAME OVER). Hitung
// mundur pakai dtReal (WAKTU NYATA) supaya slow motion tidak memperpanjang jeda
// CFG.player.deathDelaySec. Dipicu startPlayerDeath(dirx, dirz) dari semua titik
// damage player di robots.js + tank.js. =====
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
    playAvatarDeath(dx, dz);   // tubuh runtuh searah dorongan (avatar TETAP tampil)
    // Sutradara mengambil alih presentasi (slow motion, kamera, layar, darah,
    // audio) — termasuk semburan & genangan darah pertama di titik jatuh.
    const p = avatarGroup.position;
    startDeathCine(p.x, p.y, p.z, dx, dz);
}

// Urutan blok = urutan update() lama — JANGAN diubah tanpa alasan kuat:
// mis. peluru harus maju SEBELUM hit test robot memakai segmen sweep-nya.
// dtReal = dt SEBELUM skala slow-motion kematian (main.animate mengirimkannya;
// default = dt supaya pemanggil lama/uji tetap sah).
export function updateGame(dt, step, T, dtReal = dt) {
    if (isGameOver) return;
    // ICE BREACH/FIELD REPAIR adalah bagian dari waktu penyelesaian stage walau
    // keduanya mem-pause simulasi dunia. Pause menu, loading, dan Field Shop
    // tetap dikecualikan.
    if (isPaused) {
        if (stageStats.active && (activeScene?.id === 'campaign-hack'
            || activeScene?.id === 'campaign-signal-trace'
            || activeScene?.id === 'campaign-repair')) updateStageStats(dtReal);
        return;
    }
    updateStageStats(dtReal);    // waktu nyata gameplay/cutscene; hit-stop tak mendistorsinya
    updateTimeScale(dtReal);   // luruhkan HIT-STOP melee (waktu NYATA)

    // Sekuens kematian: hitung mundur -> layar GAME OVER. Selama itu dunia
    // (darah/gib/robot/peluru) tetap berjalan DALAM SLOW MOTION, tapi SEMUA
    // kendali & update player (gerak/tembak/timer senjata) dan wave/win-check
    // dilewati. Sutradara sinematiknya ditick WAKTU NYATA (lihat deathCine.js).
    const dying = playerDeathT >= 0;
    if (dying) {
        updateDeathCine(dtReal);
        playerDeathT -= dtReal;
        if (playerDeathT <= 0) { playerDeathT = -1; gameOver(false); return; }
    }

    if (!dying && activeScene.updateMode) activeScene.updateMode(dt);   // survival: wave + spawner

    // MODE SINEMATIK (2026-07-17): cutscene membekukan SEMUA kendali player
    // (blok yang sama dgn sekuens kematian) tapi updateMode TETAP jalan di
    // atas (cutscene dikemudikan dari sana) dan dunia tetap disimulasikan.
    const noCtl = dying || cinematicActive;
    if (!noCtl) {
        updateWeaponTimers(dt);        // animasi ganti senjata + melee (hit di 45%)
        // Scene kendaraan boleh mengambil alih gerak pivot player tanpa mode
        // if-else di sistem bersama. Return true = gerak kaki standar dilewati;
        // aiming/senjata di bawah tetap berjalan seperti biasa.
        const movementHandled = activeScene.updatePlayerControl
            ? activeScene.updatePlayerControl(dt, step) === true : false;
        if (!movementHandled) updatePlayerMovement(dt, step);// stamina, WASD, tabrakan scene, lompat, langkah
        if (isGameOver) return;        // (jaga-jaga: transisi scene tak mengakhiri game)
        updateWeaponState(dt);         // recoil/heat decay + posisi z senjata
        updateShooting();              // klik kiri -> spawn peluru
    }
    updateGrenades(dt);            // balistik + fuse + ledakan
    updateExplosions(dt);          // animasi visual ledakan/puff
    updateBloodPool(dt);           // pudarkan percikan darah
    updateDrops(dt, T);            // bob item + pickup + kedaluwarsa (+ magnet loot)
    updateBarrels(dt);             // denyut beacon barel peledak
    updateCrates(dt);              // denyut penanda + sentakan/rusak peti persediaan
    updateBullets(step);           // maju + mati di dinding scene
    barrelBulletHits();            // peluru player -> barel meledak (SEBELUM sweep robot)
    crateBulletHits();             // peluru player -> peti persediaan pecah (isi loot)
    updateRobots(dt, step);       // AI scene + serang (cakar/tembak) + rig + hit peluru (+ spawn mayat/gib saat mati)
    if (isGameOver) return;        // Monas runtuh (damageMonas) tetap mengakhiri game seketika
    updateEnemyBullets(dt, step);  // peluru robot ranged -> hit player (bisa memicu sekuens kematian)
    if (isGameOver) return;        // peluru ber-monasDmg bisa meruntuhkan Monas
    updateGore(dt);                // mayat terjatuh/memudar + gib balistik + genangan darah

    if (!dying && activeScene.checkWin) activeScene.checkWin();   // campaign stage akhir
}

// title opsional: judul khusus scene (mis. survival 'THE MONUMENT HAS FALLEN');
// `opts.preserveCampaignSave` mempertahankan checkpoint untuk ending bersambung.
// default tetap MISSION COMPLETE / GAME OVER.
export function formatStageTime(seconds) {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function gameOver(won, title, opts = {}) {
    setGameOver(true);
    hideBossHud();
    endDeathCine();   // lepas slow motion + letterbox; framing jasad dibekukan (no-op bila menang)
    stopMusic();   // stage berakhir (menang/kalah) -> musik battle/boss berhenti (2026-07-19)
    document.exitPointerLock();
    // Menang final menghapus checkpoint. Finish Stage 1–12 mempertahankannya
    // lewat gateway Field Shop; Stage 13 baru memanggil ini setelah epilog.
    if (won && !opts.preserveCampaignSave) clearCampaignSave();
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
    // Ringkasan per-stage hanya muncul pada layar FINISH hijau Campaign.
    // Nilai dibekukan saat gameOver karena updateGame berhenti setelah ini.
    const showStageSummary = won && stageStats.active;
    goStageStats.style.display = showStageSummary ? 'grid' : 'none';
    if (showStageSummary) {
        goTotalTime.innerText = formatStageTime(stageStats.elapsedSec);
        goLootBoxes.innerText = String(stageStats.lootBoxesDestroyed);
    }
    // Prompt game-over: RESTART (campaign = ulang dari AWAL stage yang sedang
    // dimainkan; survival = ulang run) / EXIT TO MAIN MENU (reload → #mainMenu).
    wireGameOverButtons();
    goPrimaryAction = typeof opts.onContinue === 'function' ? opts.onContinue : null;
    document.getElementById('goRestart').textContent = goPrimaryAction
        ? (opts.continueLabel || 'CONTINUE')
        : (mode === 'campaign' ? 'RESTART STAGE' : 'RESTART');
    gameOverScreen.style.display = 'flex';
}

// Rangkai tombol prompt game-over sekali (lazy). Restart = ulang stage sekarang
// (checkpoint campaign), Exit = kembali ke menu utama (reload — startGame
// sekali-jalan). Klik bekerja karena pointer sudah di-unlock oleh gameOver.
let goWired = false, goPrimaryAction = null;
function wireGameOverButtons() {
    if (goWired) return;
    goWired = true;
    document.getElementById('goRestart').addEventListener('click', activateGameOverPrimary);
    document.getElementById('goExit').addEventListener('click', () => location.reload());
}

// Tombol utama/SPACE pada overlay. Finish antar-stage menutup overlay TANPA
// reset player/money/loadout lalu menjalankan callback menuju Field Shop;
// GAME OVER/final biasa tetap memakai kebijakan restart checkpoint lama.
export function activateGameOverPrimary() {
    if (!isGameOver) return false;
    if (goPrimaryAction) {
        const action = goPrimaryAction;
        goPrimaryAction = null;
        setGameOver(false);
        gameOverScreen.style.display = 'none';
        goStageStats.style.display = 'none';
        action();
        return true;
    }
    resetGame(true);
    return true;
}

// atCurrentStage: campaign mengulang dari AWAL stage yang sedang dimainkan
// (checkpoint tersimpan) alih-alih stage 1 — dipakai prompt/SPACE game-over.
// Default false = kebijakan restartScene (pause "RESTART GAME" = dari awal).
export function resetGame(atCurrentStage = false) {
    goPrimaryAction = null;
    setScore(0);
    stopMusic();           // run baru: musik battle mati sampai tembakan kena pertama (2026-07-19)
    resetStats();          // statistik run baru
    resetStageStats();     // timer + loot box stage diulang oleh enter scene tujuan
    configurePlayer();     // hp/granat/amunisi/magazen/upgrade kembali ke nilai CFG
    playerDeathT = -1;     // batalkan sekuens kematian yang mungkin berjalan
    resetDeathCine();      // kamera/warna/overlay layar kembali normal
    resetTimeScale();      // batalkan hit-stop yang mungkin sedang beku
    resetAvatarDeath();    // bangkit dari pose runtuh + senjata kembali ke tangan
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
    resetMuzzleFlashes();
    resetShellCasings();   // selongsong yang masih tergeletak dari run sebelumnya
    resetGore();        // buang mayat + sembunyikan pool gib/genangan darah
    resetBarrels();     // buang barel peledak (ditaruh ulang oleh enter() stage)
    resetCrates();      // buang peti persediaan (ditaruh ulang oleh enter() stage)
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
        if (target === activeScene) {
            if (mode === 'campaign' && /^campaign-[1-9][0-9]*$/.test(activeScene?.id || ''))
                beginStageStats(activeScene.id);
            target.enter({ fresh: true });
        }
        else setScene(target, { fresh: true });
    }

    updateUI();
    requestLock();
}
