// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: lemari arsip
// berkaki plinth dgn 2 pintu berdaun + gagang + strip status kecil (dulu
// kotak berongga 5 dinding + 3 rak isi server/vial/artefak melayang + pintu
// kaca geser + hover-pad + PointLight ~30 mesh). SEMUA MeshLambertMaterial
// (program shader sudah dipanaskan preload -> tanpa recompile & murah).
// TANPA PointLight sama sekali. Model lokal: lebar(x) 2, dalam(z) 1.9,
// tinggi 3.9, dasar plinth di y=0 (pintu menghadap +z).
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class FuturisticCupboard {
    constructor() {
        this.group = new THREE.Group();
        this.buildCupboard();
    }

    buildCupboard() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const doorMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const handleMat = new THREE.MeshLambertMaterial({ color: PAL.steel });
        const ledMat = new THREE.MeshLambertMaterial({ color: PAL.tech, emissive: PAL.tech, emissiveIntensity: 0.7 });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            this.group.add(m);
            return m;
        };

        mk(new THREE.BoxGeometry(2.0, 0.12, 1.9), doorMat, 0, 0.06, 0);        // plinth kaki
        mk(new THREE.BoxGeometry(2.0, 3.70, 1.8), bodyMat, 0, 1.97, 0);        // badan lemari
        mk(new THREE.BoxGeometry(2.06, 0.08, 1.88), bodyMat, 0, 3.86, 0);      // pelat atas
        // 2 daun pintu di muka (+z) + gagang vertikal di dekat celah tengah
        mk(new THREE.BoxGeometry(0.94, 3.50, 0.06), doorMat, -0.5, 1.97, 0.93);
        mk(new THREE.BoxGeometry(0.94, 3.50, 0.06), doorMat, 0.5, 1.97, 0.93);
        mk(new THREE.BoxGeometry(0.04, 0.50, 0.05), handleMat, -0.09, 1.97, 0.97);
        mk(new THREE.BoxGeometry(0.04, 0.50, 0.05), handleMat, 0.09, 1.97, 0.97);
        // Strip status/card-reader teal kecil (satu-satunya glow)
        mk(new THREE.BoxGeometry(0.18, 0.05, 0.03), ledMat, 0.62, 3.45, 0.945);
    }

    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder lemari/rak (cupboard). Model lokal: lebar(x) 2, dalam(z) 1.9,
 * tinggi 3.9, dasar di y=0. Di-skala NON-UNIFORM mengisi footprint sx×sz dgn
 * tinggi sy; berdiri di y=0. Tanpa PointLight.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticCupboardMesh(sx, sy, sz) {
    const c = new FuturisticCupboard();
    c.group.scale.set(sx / 2, sy / 3.9, sz / 1.9);   // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(c.group);
    return g;
}

export default FuturisticCupboard;
