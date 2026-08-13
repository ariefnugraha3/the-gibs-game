// Scene manager minimal: satu scene aktif dengan lifecycle enter()/exit().
// "Scene" = objek modul (menu tak lewat sini — DOM murni sebelum game mulai):
// survival, campaign-stage1..13. Kontrak antarmuka scene lengkap
// terdokumentasi di MODULES.md — sistem bersama (player/peluru/granat/robot)
// hanya bicara ke scene aktif lewat hook ini, jadi menambah stage baru tidak
// menyentuh sistem lain.

import { setActiveStageLights } from '../world/lighting.js';
import { beginStageStats } from './state.js';
import { hideBossHud } from './dom.js';
import { setActiveCampaignWorldRoots, activeCampaignWorldRoots } from '../scenes/campaign/utility/campaignWorldRegistry.js';

export let activeScene = null;

// Kunci root dunia sebuah scene (2026-08-13: diperluas dari Stage 9–13 ke SEMUA
// stage campaign). SELURUH dunia campaign hidup bersama dalam satu THREE.Scene;
// tanpa ini renderer menelusuri + menguji frustum belasan ribu objek milik stage
// yang sedang tidak dimainkan SETIAP frame (diukur: ~12 ribu objek, dominan
// Stage 5/6/7). Root tak-terlihat membuat `projectObject` berhenti di akarnya.
//
// `null` = scene ini TIDAK punya dunia sendiri (shop antar-stage, modal hack/
// repair, menu): set root DIBIARKAN apa adanya — sama seperti aturan lightsKey —
// supaya kembali dari modal tidak meninggalkan dunia yang tersembunyi.
// Sub-scene (chapter Stage 6 & 12) memanggil registry-nya sendiri di enter().
function worldKeyFor(id) {
    if (!id) return null;
    if (id === 'campaign-12') return 'campaign-12-surface';
    return /^campaign-(?:[1-9]|1[0-3])$/.test(id) ? id : null;
}

export function setScene(s, opts = {}) {
    if (activeScene && activeScene.exit) activeScene.exit();
    hideBossHud();
    const worldKey = worldKeyFor(s?.id);
    if (worldKey) setActiveCampaignWorldRoots(worldKey);
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
    // enter() dapat baru membangun/mendaftarkan root pada akses langsung, dan
    // chapter Stage 6/12 memilih root-nya sendiri di sana — jadi jangan menimpa
    // pilihan chapter: hanya set ulang bila belum ada root aktif yang cocok.
    if (worldKey && !activeCampaignWorldRoots().length) setActiveCampaignWorldRoots(worldKey);
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
