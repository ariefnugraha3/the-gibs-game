// Scene manager minimal: satu scene aktif dengan lifecycle enter()/exit().
// "Scene" = objek modul (menu tak lewat sini — DOM murni sebelum game mulai):
// survival, campaign-stage1..8. Kontrak antarmuka scene lengkap
// terdokumentasi di MODULES.md — sistem bersama (player/peluru/granat/robot)
// hanya bicara ke scene aktif lewat hook ini, jadi menambah stage baru tidak
// menyentuh sistem lain.

import { setActiveStageLights } from '../world/lighting.js';
import { beginStageStats } from './state.js';

export let activeScene = null;

export function setScene(s, opts = {}) {
    if (activeScene && activeScene.exit) activeScene.exit();
    activeScene = s;
    // Statistik finish screen bersifat PER-STAGE. Modal hack/repair kembali
    // lewat resumeScene(), dan shop/cutscene tak cocok pola ini, jadi keduanya
    // tidak pernah mereset timer atau hitungan loot box stage yang aktif.
    if (/^campaign-[1-9][0-9]*$/.test(s?.id || '')) beginStageStats(s.id);
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
