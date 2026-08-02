// Entry point: muat config -> menu pilih mode -> LAYAR LOADING (bangun engine
// + scene mode terpilih + pemanasan shader/tekstur di core/preload.js) -> loop
// render. Urutan init di dalam startGame tetap mengikuti init() lama — hanya
// dipenggal dgn await loadingStep() agar overlay & bar sempat dilukis browser.

import { loadConfig, CFG } from './core/config.js';
import { setMode, configurePlayer, isPaused, isGameOver, highScore } from './core/state.js';
import {
    initRenderer, initQualityUI, scene, camera, viewCam, renderer, composer, postFxOn,
    followViewCam
} from './core/renderer.js';
import { initGrain, bestScoreEl, showFatal } from './core/dom.js';
import { setScene, activeScene } from './core/sceneManager.js';
import { updateGame } from './core/game.js';
import { globalTimeScale } from './core/timeScale.js';
import { updateUI, drawRadar } from './core/hud.js';
import { initInput, updateTopdownAim } from './core/input.js';
import { initPlayerAvatar, updatePlayerAvatar } from './entities/playerAvatar.js';
import { createBaseLights, updateShadowFollow } from './world/lighting.js';
import { updateWorldDecor } from './world/decor.js';
import { createSky, createEmbers, updateEmbers } from './world/sky.js';
import { initEffects } from './entities/effects.js';
import { initGore } from './entities/gore.js';
import { initWeapons, updateWeaponVisuals } from './entities/weapons.js';
import { resetPlayerState } from './entities/player.js';
import { initMenu } from './scenes/menu.js';
import { survivalScene } from './scenes/survival/index.js';
import {
    survivalIntroScene, beginSurvivalIntro, warmupSurvivalIntro
} from './scenes/survival/cutscenes/monasIntro.js';
import { stage1Scene } from './scenes/campaign/stages/stage1.js';
import { introScene, beginIntro, warmupIntro } from './scenes/campaign/cutscenes/intro.js';
import { prologueScene, beginPrologue } from './scenes/campaign/cutscenes/prologue.js';
import { campaignJumpToStage } from './scenes/campaign/utility/transition.js';
import { showLoading, loadingStep, hideLoading, warmupAll } from './core/preload.js';
import { preloadAllSFX } from './utils/sfx.js';

export async function boot() {
    try {
        await loadConfig();
    } catch (e) {
        // ES module + fetch config butuh HTTP server — file:// pasti gagal.
        showFatal('<b>Failed to load the game configuration.</b><br>' +
            'Run the game from a local HTTP server, e.g.:<br>' +
            '<code>python -m http.server 8000</code> &rarr; open ' +
            '<code>http://localhost:8000</code><br><br>' +
            '<small>' + (e && e.message ? e.message : e) + '</small>');
        throw e;
    }
    initMenu(startGame);
}

// opts.stage (campaign): titik-mulai stage (1..8) — dipakai untuk MELANJUTKAN
// game tersimpan (checkpoint). Default 1 = mulai dari awal.
export async function startGame(mode, opts = {}) {
    try {
        setMode(mode);
        configurePlayer();

        showLoading();
        await loadingStep(5, 'Starting the engine…');

        initRenderer();            // scene + fog + kamera + renderer + composer
        createBaseLights(scene);   // ambient/hemi/dir(bayangan)/rim — dipakai semua scene
        initQualityUI();           // baris tombol kualitas (butuh dirLight sudah ada)
        initEffects(scene);        // pool lampu ledakan + pool sprite darah
        initGore(scene);           // pool gib + genangan darah (mayat pakai mesh robot)
        createSky(scene);          // kubah langit + bulan (ikut player)
        await loadingStep(30, 'Building the world…');

        // Scene mode terpilih membangun dunianya + menempatkan entitas + posisi awal.
        // stage1.enter membangun SEMUA dunia campaign (1-8, guard `built`;
        // 2026-07-16 — dulu stage 3/4 lazy sehingga loading transisinya lebih
        // lama), jadi lanjut ke stage >1 aman: setScene(stage1) dulu (bangun
        // semua dunia), lalu campaignJumpToStage lompat ke checkpoint (buang
        // robot stage 1, tempatkan robot stage tujuan). warmup di bawah
        // memanaskan shader SEMUA stage sekaligus.
        //
        // INTRO CUTSCENE (2026-07-17): start campaign BARU (bukan "Continue"
        // stage>1) diawali cutscene penurunan heli di atap (introScene) SEBELUM
        // Stage 1. introScene.enter() juga membangun SEMUA dunia campaign (via
        // ensureCampaignWorlds) sehingga warmup tetap meng-compile shadernya &
        // transisi ke Stage 1 di akhir cutscene instan; beginIntro() (di bawah,
        // setelah avatar/senjata ter-init) menyalakan mesin sinematiknya.
        //
        // CUTSCENE PEMBUKA SURVIVAL (2026-07-27, permintaan user — menggantikan
        // slideshow DOM 4 slide yang lama): mode Survival pun kini diawali adegan
        // sinematik 3D (`survivalIntroScene`, survival/cutscenes/monasIntro.js) di
        // dalam TAMAN MONAS yang sebenarnya. Pola persis intro campaign:
        // setScene di sini (dunia + panggung robot dibangun di balik layar
        // loading), beginSurvivalIntro() di bawah setelah avatar/senjata ter-init,
        // warmupSurvivalIntro() setelah warmupAll; cutscene sendiri yang menyerahkan
        // ke `survivalScene` (Wave 1) di akhir. Survival tak punya "Continue",
        // jadi selalu diputar; restart setelah mati TIDAK memutarnya lagi
        // (resetGame memakai activeScene = survivalScene).
        const playIntro = mode === 'campaign' && !(opts.stage > 1);
        const playSurvIntro = mode !== 'campaign';
        if (mode !== 'campaign') setScene(survivalIntroScene);
        else if (playIntro) setScene(introScene);
        else { setScene(stage1Scene); if (opts.stage > 1) campaignJumpToStage(opts.stage); }
        await loadingStep(60, 'Preparing weapons…');

        initPlayerAvatar(scene);   // avatar top-down player (SEBELUM initWeapons:
                                   // muzzle flash di-parent ke ujung senapannya)
        createEmbers(scene);       // partikel bara/abu ambien (kedua mode)
        initWeapons();             // logika senjata + rig FPS tersembunyi + muzzle avatar
        initInput();               // pointer lock, kursor bidik, keyboard, jaring pengaman
        resetPlayerState();        // stamina/eyeH awal dari CFG
        initGrain();               // film grain overlay
        followViewCam();           // matrix kamera top-down valid utk raycast bidik frame pertama
        await loadingStep(75, 'Loading sounds…');

        preloadAllSFX();           // fetch + decode semua klip SFX sekarang
        // INTRO CUTSCENE: nyalakan mesin sinematiknya SETELAH avatar/senjata
        // ter-init (beginIntro menyembunyikan avatar & spawn heli) tapi SEBELUM
        // warmupAll — supaya heli/tali ikut ter-compile shadernya (tanpa hitch).
        if (playIntro) beginIntro();
        if (playSurvIntro) beginSurvivalIntro();   // idem utk cutscene pembuka Survival
        await loadingStep(85, 'Warming up the renderer…');
        await warmupAll();         // kompilasi shader + unggah tekstur (lihat preload.js)
        // INTRO: render KOTA latar dari semua sudut kamera cutscene MASIH di balik
        // layar loading → semua buffer/tekstur kota terunggah → cutscene tanpa lag.
        if (playIntro) { warmupIntro(); await loadingStep(98, 'Preparing the city…'); }
        if (playSurvIntro) { warmupSurvivalIntro(); await loadingStep(98, 'Preparing the park…'); }

        // PROLOG (2026-07-30; ROMBAK TOTAL jadi TEKS DI ATAS HITAM 2026-07-31,
        // permintaan user — panggung 3D "ruang meeting" dihapus seluruhnya):
        // campaign start BARU membuka dgn 9 era (2028→2045) SEBELUM cutscene heli.
        // Kini scene DOM murni (overlay `#prologue` opak hitam: teks diketik di
        // kolom kiri + ILUSTRASI SVG per era di kolom kanan [prologueArt.js];
        // tanpa dunia THREE, tanpa warmup). Urutannya penting: introScene sudah dipasang di atas
        // (dunia campaign terbangun, fog asli tersimpan) dan beginIntro() sudah
        // mempersenjatai + memanaskan heli — prolog tinggal "menyela" sebagai scene
        // aktif, lalu MENGEMBALIKANNYA lewat resumeScene(introScene) saat selesai
        // (resume, BUKAN setScene, supaya introScene.enter() tak jalan dua kali).
        const showPrologue = playIntro && !!(CFG.campaign && CFG.campaign.prologue && CFG.campaign.prologue.enabled);
        // Diagnostik: kalau start campaign TAPI prolog dilewati, cetak sebabnya —
        // biasanya CFG.campaign.prologue undefined = gameplay.json lama di cache.
        if (playIntro && !showPrologue) console.warn('[prologue] dilewati — CFG.campaign.prologue =', CFG.campaign && CFG.campaign.prologue);
        if (showPrologue) {
            setScene(prologueScene);   // scene teks — tak ada dunia yang dibangun
            beginPrologue();           // teks era pertama disiapkan; tampil setelah hideLoading
            await loadingStep(99, 'Preparing the briefing…');
        }

        hideLoading();
        bestScoreEl.innerText = `Best: ${highScore}`;
        updateUI();

        animate();
    } catch (e) {
        // startGame kini async: tanpa catch, error init cuma jadi unhandled
        // rejection sunyi — tampilkan layar fatal seperti kegagalan config.
        hideLoading();
        showFatal('<b>Failed to start the game.</b><br><small>' +
            (e && e.message ? e.message : e) + '</small>');
        throw e;
    }
}

// ----------- Frame Loop ----------- //
const clock = new THREE.Clock();
let radarTick = 0;

function animate() {
    requestAnimationFrame(animate);
    const dtReal = Math.min(clock.getDelta(), 0.05);   // clamp anti-spike (tab switch)
    // SATU-SATUNYA skala waktu global (core/timeScale.js): slow-motion kematian
    // × HIT-STOP melee. 1 = normal, jadi frame biasa identik dengan sebelumnya.
    // Dunia + tubuh player memakai dt terskala; sutradara sinematik & hitung
    // mundur GAME OVER pakai dtReal.
    const dt = dtReal * globalTimeScale();
    const step = dt * 60;                          // normalisasi ke baseline 60fps
    const T = clock.elapsedTime;

    // Bidik top-down: kursor -> aimPoint + yaw pivot (pakai matrix viewCam
    // frame lalu — lag 1 frame tak terasa; harus SEBELUM updateGame supaya
    // tembakan/lemparan frame ini memakai arah kursor terkini).
    updateTopdownAim();

    updateGame(dt, step, T, dtReal);

    // Kamera top-down & avatar mengikuti posisi pivot TERBARU (pasca-gerak).
    // Jalan juga saat pause (pose beku konsisten, kontrak lama updateDecor).
    // dt utk recenter halus saat player berhenti (followViewCam).
    followViewCam(dt);
    updatePlayerAvatar(dt);

    // Dekoratif: jalan juga saat pause (kontrak lama updateDecor)
    updateShadowFollow(camera);
    updateWorldDecor(dt, T, camera);
    updateWeaponVisuals(dt);

    if (!isPaused && !isGameOver) {
        updateEmbers(dt, T, camera);
        if (radarTick++ & 1) drawRadar();
    }

    // Scene yang menutup seluruh layar dgn overlay DOM opak (prolog teks) memasang
    // hook `skipRender` — render 3D dilewati: menggambar kota ber-bloom di balik
    // hitam pekat hanya membebani GPU (2026-07-31, keluhan "kok terasa berat").
    if (activeScene && activeScene.skipRender) return;
    if (composer && postFxOn) composer.render();   // bloom + gamma + FXAA (RenderPass = viewCam)
    else renderer.render(scene, viewCam);          // tier rendah / CDN post-fx gagal
}

// Auto-boot di browser; harness test meng-import modul ini tanpa boot.
if (!globalThis.__GIBS_TEST__) boot();
