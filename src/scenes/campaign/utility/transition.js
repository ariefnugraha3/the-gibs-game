// Transisi antar-stage Campaign (2026-07-14, overhaul jadi SHOP SCENE terpisah):
// mencapai tangga END sebuah stage → LOADING → **SHOP SCENE** (scene tersendiri
// `campaignShopScene`, bukan overlay di atas stage; latar OPAK) → player belanja
// & tekan "Start Next Stage" → LOADING → stage berikutnya. Dua layar loading
// membungkus shop. Memakai ulang shop modal Survival dalam mode 'campaign'
// (katalog difilter: hanya item Monas yang disembunyikan — Radar/Shotgun/Rifle/
// Launcher + upgrade-nya DIJUAL). Mata uang = skor (campaign akumulasi skor dari
// kill; bertahan antar-stage). Teks UI English.

import { showLoading, loadingStep, hideLoading } from '../../../core/preload.js';
import { scene, viewCam, renderer, composer, postFxOn } from '../../../core/renderer.js';
import { setScene } from '../../../core/sceneManager.js';
import { openShop, closeShop, isShopOpen, requestNextWave } from '../../survival/shop.js';
import { setPaused, robots, bullets, enemyBullets, grenades, explosions, drops, clearArray } from '../../../core/state.js';
import { disposeRobot, resetRobotsFx } from '../../../entities/robots.js';
import { blocker } from '../../../core/dom.js';
import { hidePauseMenu } from '../../../core/pauseMenu.js';
import { stopMusic } from '../../../utils/sfx.js';
import { stage1Scene } from '../stages/stage1.js';   // restartScene (circular aman: dibaca DI DALAM fungsi)
import { stage2Scene } from '../stages/stage2.js';   // (circular aman: DI DALAM fungsi)
import { stage3Scene } from '../stages/stage3.js';
import { stage4Scene } from '../stages/stage4.js';

const MIN_LOADING_MS = 900;   // durasi minimum tiap layar loading (konsistensi & terlihat)
let pendingNext = null;       // stage tujuan setelah shop
let busy = false;             // cegah pemicu ganda (trigger tangga berulang tiap frame)

async function minHold(t0) {
    const rem = MIN_LOADING_MS - (Date.now() - t0);
    if (rem > 0) await new Promise(r => setTimeout(r, rem));
}

// Dipanggil playerCollide sebuah stage saat mencapai tangga END: mulai transisi
// ke SHOP SCENE. `busy` guard supaya trigger tangga yang berulang (tiap frame
// sampai pause aktif) tidak menumpuk. setScene mid-frame AMAN: campaignShopScene
// punya hook gameplay no-op (robotAI skip / bulletBlocked false / dst) sehingga
// sisa updateGame frame ini tak error, lalu setPaused(true) menghentikan frame
// berikutnya.
export function beginStageTransition(nextScene) {
    if (busy) return;
    busy = true;
    stopMusic();   // stage BERAKHIR -> musik battle berhenti (menyala lagi saat tembakan kena pertama di stage berikut, 2026-07-19)
    pendingNext = nextScene;
    setScene(campaignShopScene, {});
}

// ===== CHEAT: lompat LANGSUNG ke stage campaign n (2/3/4; 1 juga aman) —
// tanpa shop/loading (konsol cheat `skip-to-stage-N`, hook `cheatSkipToStage`
// di tiap stage). Buang SEMUA robot + entitas transien (stage sekarang & yang
// dilewati) lalu `setScene(target)` → enter() membangun dunia + menempatkan
// robot (SETIAP stage menempatkan robotnya sendiri di enter() — termasuk stage 2
// sejak 2026-07-21) + memosisikan player. Kembalikan n bila valid, null bila di
// luar 1..4. =====
export function campaignJumpToStage(n) {
    if (!(n >= 1 && n <= 4)) return null;
    stopMusic();   // stage lama berakhir (cheat/restart-checkpoint) -> musik battle mati dulu
    for (let i = robots.length - 1; i >= 0; i--) { disposeRobot(robots[i]); scene.remove(robots[i].mesh); }
    robots.length = 0;
    resetRobotsFx();
    clearArray(bullets, scene);
    clearArray(enemyBullets, scene);
    clearArray(grenades, scene);
    clearArray(explosions, scene);
    clearArray(drops, scene);
    busy = false;   // batalkan transisi shop yang mungkin sedang menanti
    const target = [null, stage1Scene, stage2Scene, stage3Scene, stage4Scene][n];
    setScene(target, { fresh: true });          // enter(): robot + posisi player (dunia sudah pre-built; stage 2 kini tempatkan robotnya sendiri)
    // Kompilasi shader di bawah lampu stage tujuan — jaring pengaman anti-stutter
    // utk jalur lompat-langsung (cheat skip / restart-at-stage). Sejak pre-build
    // semua dunia (2026-07-16) shader sudah di-warm startGame, jadi panggilan ini
    // murah; dipertahankan utk jaga-jaga (mis. jump sebelum warmup di smoke).
    if (renderer) renderer.compile(scene, viewCam);
    return n;
}

// ===== SCENE SHOP (terpisah dari stage) =====
// shopActive() = true SELAMA scene ini aktif (bukan hanya saat modal terbuka)
// supaya input.js menekan menu jeda + menelan tombol gameplay sepanjang loading
// & belanja. Semua hook gameplay = no-op (tak ada dunia/robot di sini).
export const campaignShopScene = {
    id: 'campaign-shop',
    enter() { runEnterShop(); },
    restartScene: () => stage1Scene,          // (mati mustahil di shop — tetap aman)
    shopActive: () => true,
    shopKey(key) {
        if (!isShopOpen()) return false;
        if (key === ' ' || key === 'enter') { requestNextWave(); return true; }
        return false;
    },
    playerCollide() { },
    groundHeight: () => 0,
    bulletBlocked: () => false,
    grenadeCollide() { },
    robotAI: () => ({ skip: true }),
    clampDropPos: (x, z) => [x, z],
    hudStatus: () => 'FIELD SHOP',
    radarLandmarks() { },
};

// LOADING #1 → buka shop. Pointer TETAP terkunci selama loading (tak
// exitPointerLock) supaya tak ada pointerlockchange → tak ada menu jeda; hanya
// setPaused(true) menghentikan updateGame. openShop-lah yang melepas pointer
// (kursor utk menu), dan karena shopActive()=true, input.js tak memunculkan menu.
async function runEnterShop() {
    const t0 = Date.now();
    setPaused(true);
    showLoading();
    await loadingStep(25, 'Reaching the field shop…');
    await loadingStep(65, 'Reaching the field shop…');
    await loadingStep(100, 'Ready!');
    await minHold(t0);
    hideLoading();
    openShop({
        mode: 'campaign', head: 'FIELD SHOP',
        nextLabel: 'Start Next Stage ▶',
        confirmHead: 'START NEXT STAGE?',
        confirmMsg: 'Finished gearing up? Start the next stage.',
        onNext: runLeaveShop,
    });
}

// LOADING #2 → bangun & mulai stage berikutnya. `busy=false` tepat setelah
// setScene(next) (stage baru aktif, player di START = tak ada trigger tangga)
// supaya transisi berikutnya bisa dipicu; sisa loading (min hold) hanya visual.
// Pointer-lock butuh gesture yang hilang pasca-async → resume lewat klik blocker
// (sama seperti mulai game). isPaused TETAP true sampai player klik.
async function runLeaveShop() {
    const t0 = Date.now();
    closeShop();
    showLoading();
    await loadingStep(8, 'Loading next area…');
    setScene(pendingNext, { transition: true });   // enter(): robot + posisi awal (SEMUA dunia
    busy = false;                                  // sudah di-pre-build stage1.enter, 2026-07-16 —
    await loadingStep(55, 'Preparing the area…');  // loading tiap transisi kini konsisten ~minHold)
    renderer.compile(scene, viewCam);              // jaring pengaman shader (sudah di-warm startGame)
    await loadingStep(78, 'Warming up…');
    for (let i = 0; i < 3; i++) {                  // beberapa frame render nyata (unggah tekstur / link program)
        if (composer && postFxOn) composer.render();
        else renderer.render(scene, viewCam);
        await loadingStep(85 + i * 5, 'Warming up…');
    }
    await loadingStep(100, 'Ready!');
    await minHold(t0);
    hideLoading();
    hidePauseMenu();                               // #instructions tampil (bukan menu jeda)
    if (blocker) blocker.style.display = 'flex';   // klik = requestLock → resume di stage baru
}
