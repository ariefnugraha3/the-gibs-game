// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: kabinet konsol
// kontrol dgn panel layar MIRING di atasnya + bibir keyboard (dulu layar
// tegak mengambang + pad glow magenta melayang). SEMUA MeshLambertMaterial
// (program shader sudah dipanaskan preload -> tanpa recompile & murah).
// Model lokal: lebar(x) 1.6, dalam(z) 0.6, tinggi 1.2, dasar kabinet di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Console {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Console";
        const bodyMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const trimMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const screenMat = new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.tech, emissiveIntensity: 0.7 });
        // Kabinet
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 0.55), bodyMat);
        body.position.y = 0.375;
        this.group.add(body);
        // Panel layar miring di atas kabinet (housing + muka layar sejajar)
        const scr = new THREE.Group();
        scr.position.set(0, 0.98, -0.08);
        scr.rotation.x = -0.28;                      // condong ke belakang, muka ke +z
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.08), trimMat);
        scr.add(housing);
        this.screen = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.33, 0.02), screenMat);
        this.screen.position.z = 0.045;
        scr.add(this.screen);
        this.group.add(scr);
        // Bibir keyboard di depan
        const ledge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.25), trimMat);
        ledge.position.set(0, 0.78, 0.32);
        this.group.add(ledge);
    }
    update(t) {
        // Pulsa layar (kompat API; TIDAK dipanggil game — statis)
        this.screen.material.emissiveIntensity = 0.45 + (Math.sin(t * 5) * 0.5 + 0.5) * 0.4;
    }
}

/**
 * Drop-in builder konsol/terminal. Model lokal: lebar(x) 1.6, dalam(z) 0.6,
 * tinggi 1.2, dasar kabinet di y=0. Di-skala NON-UNIFORM mengisi footprint
 * sx×sz dgn tinggi sy; berdiri di y=0. Layar menghadap +z.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticConsoleMesh(sx, sy, sz) {
    const c = new Console();
    c.group.scale.set(sx / 1.6, sy / 1.2, sz / 0.6);   // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(c.group);
    return g;
}

export default Console;
