// Scene manager minimal: satu scene aktif dengan lifecycle enter()/exit().
// "Scene" = objek modul (menu tak lewat sini — DOM murni sebelum game mulai):
// survival, campaign-stage1..4. Kontrak antarmuka scene lengkap
// terdokumentasi di MODULES.md — sistem bersama (player/peluru/granat/robot)
// hanya bicara ke scene aktif lewat hook ini, jadi menambah stage baru tidak
// menyentuh sistem lain.

export let activeScene = null;

export function setScene(s, opts = {}) {
    if (activeScene && activeScene.exit) activeScene.exit();
    activeScene = s;
    s.enter(opts);
}
