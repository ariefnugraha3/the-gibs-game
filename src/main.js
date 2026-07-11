// Entry point: muat config -> menu pilih mode -> LAYAR LOADING (bangun engine
// + scene mode terpilih + pemanasan shader/tekstur di core/preload.js) -> loop
// render. Urutan init di dalam startGame tetap mengikuti init() lama — hanya
// dipenggal dgn await loadingStep() agar overlay & bar sempat dilukis browser.

import { loadConfig } from './core/config.js';
import { setMode, configurePlayer, isPaused, isGameOver, highScore } from './core/state.js';
import {
    initRenderer, initQualityUI, scene, camera, viewCam, renderer, composer, postFxOn,
    followViewCam
} from './core/renderer.js';
import { initGrain, bestScoreEl, showFatal } from './core/dom.js';
import { setScene } from './core/sceneManager.js';
import { updateGame } from './core/game.js';
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
import { stage1Scene } from './scenes/campaign/stage1.js';
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

export async function startGame(mode) {
    try {
        setMode(mode);
        configurePlayer();

        showLoading();
        await loadingStep(5, 'Starting the engine…');

        initRenderer();            // scene + fog + kamera + renderer + composer
        createBaseLights(scene);   // ambient/hemi/dir(bayangan)/rim — dipakai semua scene
        initQualityUI();           // baris tombol kualitas (butuh dirLight sudah ada)
        initEffects(scene);        // pool lampu ledakan + pool sprite darah
        initGore(scene);           // pool gib + genangan darah (mayat pakai mesh zombie)
        createSky(scene);          // kubah langit + bulan (ikut player)
        await loadingStep(30, 'Building the world…');

        // Scene mode terpilih membangun dunianya + menempatkan entitas + posisi awal
        setScene(mode === 'campaign' ? stage1Scene : survivalScene);
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
        await loadingStep(85, 'Warming up the renderer…');
        await warmupAll();         // kompilasi shader + unggah tekstur (lihat preload.js)

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
    const dt = Math.min(clock.getDelta(), 0.05);   // clamp anti-spike (tab switch)
    const step = dt * 60;                          // normalisasi ke baseline 60fps
    const T = clock.elapsedTime;

    // Bidik top-down: kursor -> aimPoint + yaw pivot (pakai matrix viewCam
    // frame lalu — lag 1 frame tak terasa; harus SEBELUM updateGame supaya
    // tembakan/lemparan frame ini memakai arah kursor terkini).
    updateTopdownAim();

    updateGame(dt, step, T);

    // Kamera top-down & avatar mengikuti posisi pivot TERBARU (pasca-gerak).
    // Jalan juga saat pause (pose beku konsisten, kontrak lama updateDecor).
    followViewCam();
    updatePlayerAvatar(dt);

    // Dekoratif: jalan juga saat pause (kontrak lama updateDecor)
    updateShadowFollow(camera);
    updateWorldDecor(dt, T, camera);
    updateWeaponVisuals(dt);

    if (!isPaused && !isGameOver) {
        updateEmbers(dt, T, camera);
        if (radarTick++ & 1) drawRadar();
    }

    if (composer && postFxOn) composer.render();   // bloom + gamma + FXAA (RenderPass = viewCam)
    else renderer.render(scene, viewCam);          // tier rendah / CDN post-fx gagal
}

// Auto-boot di browser; harness test meng-import modul ini tanpa boot.
if (!globalThis.__GIBS_TEST__) boot();
