// Scene manager minimal: satu scene aktif dengan lifecycle enter()/exit().
// "Scene" = objek modul (menu tak lewat sini — DOM murni sebelum game mulai):
// survival, campaign-stage1..4. Kontrak antarmuka scene lengkap
// terdokumentasi di MODULES.md — sistem bersama (player/peluru/granat/robot)
// hanya bicara ke scene aktif lewat hook ini, jadi menambah stage baru tidak
// menyentuh sistem lain.

import { setActiveStageLights } from '../world/lighting.js';

export let activeScene = null;

export function setScene(s, opts = {}) {
    if (activeScene && activeScene.exit) activeScene.exit();
    activeScene = s;
    // Hanya lampu milik stage ini yang menyala (world/lighting.js) -> shader tak
    // melooping lampu 3 dunia lain tiap fragmen. Scene tanpa `lightsKey` (mis.
    // shop antar-stage) MEMPERTAHANKAN set lampu sebelumnya.
    if (s.lightsKey) setActiveStageLights(s.lightsKey);
    s.enter(opts);
}

// KEMBALI ke scene yang sedang berjalan setelah sebuah scene MODAL (minigame
// hack, campaign/utility/hackMinigame.js) — sengaja TIDAK memanggil enter():
// enter() sebuah stage me-reset seluruh stage itu (robot, supply, posisi player,
// fase), padahal player hanya "keluar sebentar" ke layar puzzle dan dunia stage
// harus tetap persis seperti saat ia ditinggalkan. exit() modal tetap dipanggil.
export function resumeScene(s) {
    if (!s) return;
    if (activeScene && activeScene.exit) activeScene.exit();
    activeScene = s;
    if (s.lightsKey) setActiveStageLights(s.lightsKey);
}
