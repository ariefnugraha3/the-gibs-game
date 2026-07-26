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
