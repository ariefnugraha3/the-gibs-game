// Entry point: muat config -> menu pilih mode -> bangun engine + scene mode
// terpilih -> loop render. Urutan startGame mengikuti init() lama.

import { loadConfig } from './core/config.js';
import { setMode, configurePlayer, isPaused, isGameOver, highScore } from './core/state.js';
import {
    initRenderer, initQualityUI, scene, camera, renderer, composer, postFxOn
} from './core/renderer.js';
import { initGrain, bestScoreEl, showFatal } from './core/dom.js';
import { setScene } from './core/sceneManager.js';
import { updateGame } from './core/game.js';
import { updateUI, drawRadar } from './core/hud.js';
import { initInput } from './core/input.js';
import { createBaseLights, updateShadowFollow } from './world/lighting.js';
import { updateWorldDecor } from './world/decor.js';
import { createSky, createEmbers, updateEmbers } from './world/sky.js';
import { initEffects } from './entities/effects.js';
import { initWeapons, updateWeaponVisuals } from './entities/weapons.js';
import { resetPlayerState } from './entities/player.js';
import { initMenu } from './scenes/menu.js';
import { survivalScene } from './scenes/survival/index.js';
import { survivalCoopClientScene } from './scenes/survival/coopClient.js';
import { stage1Scene } from './scenes/campaign/stage1.js';
import { netRole } from './net/index.js';   // co-op: client memakai scene khususnya

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

export function startGame(mode) {
    setMode(mode);
    configurePlayer();

    initRenderer();            // scene + fog + kamera + renderer + composer
    createBaseLights(scene);   // ambient/hemi/dir(bayangan)/rim — dipakai semua scene
    initQualityUI();           // baris tombol kualitas (butuh dirLight sudah ada)
    initEffects(scene);        // pool lampu ledakan + pool sprite darah
    createSky(scene);          // kubah langit + bulan (ikut player)

    // Scene mode terpilih membangun dunianya + menempatkan entitas + posisi awal.
    // Co-op LAN: host menjalankan survivalScene biasa (+ lapisan broadcast);
    // CLIENT menjalankan scene interpolasi khususnya (netRole di-set lobby
    // SEBELUM startGame — 'off' = SP, jalur lama persis).
    setScene(mode === 'campaign' ? stage1Scene
        : netRole === 'client' ? survivalCoopClientScene : survivalScene);

    createEmbers(scene);       // partikel bara/abu ambien (kedua mode)
    initWeapons();             // senjata + tangan (parented kamera) + kamera ke scene
    initInput();               // pointer lock, mouse, keyboard, jaring pengaman
    resetPlayerState();        // stamina/eyeH awal dari CFG
    initGrain();               // film grain overlay

    bestScoreEl.innerText = `Best: ${highScore}`;
    updateUI();
    animate();
}

// ----------- Frame Loop ----------- //
const clock = new THREE.Clock();
let radarTick = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);   // clamp anti-spike (tab switch)
    const step = dt * 60;                          // normalisasi ke baseline 60fps
    const T = clock.elapsedTime;

    updateGame(dt, step, T);

    // Dekoratif: jalan juga saat pause (kontrak lama updateDecor)
    updateShadowFollow(camera);
    updateWorldDecor(dt, T, camera);
    updateWeaponVisuals(dt);

    if (!isPaused && !isGameOver) {
        updateEmbers(dt, T, camera);
        if (radarTick++ & 1) drawRadar();
    }

    if (composer && postFxOn) composer.render();   // bloom + gamma + FXAA
    else renderer.render(scene, camera);           // tier rendah / CDN post-fx gagal
}

// Auto-boot di browser; harness test meng-import modul ini tanpa boot.
if (!globalThis.__GIBS_TEST__) boot();
