// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: pot + permukaan
// tanah + batang + tajuk daun 2 kerucut bertumpuk (senada pohon taman
// survival; dulu "tanaman neon" dgn daun kerucut mengambang miring).
// TANPA emissive (tanaman tidak menyala). SEMUA MeshLambertMaterial
// (program shader sudah dipanaskan preload -> tanpa recompile & murah).
// Model lokal: diameter pot 1.0, tinggi total 1.8, dasar pot di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Planter {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Planter";
        const potMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const soilMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const stemMat = new THREE.MeshLambertMaterial({ color: PAL.wood });
        const leafMat = new THREE.MeshLambertMaterial({ color: PAL.leaf });

        const mk = (geo, mat, y) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.y = y;
            this.group.add(m);
            return m;
        };

        mk(new THREE.CylinderGeometry(0.5, 0.4, 0.6, 8), potMat, 0.3);    // pot (dasar y=0)
        mk(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 8), soilMat, 0.62); // permukaan tanah
        mk(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6), stemMat, 0.85);  // batang
        mk(new THREE.ConeGeometry(0.42, 0.55, 7), leafMat, 1.3);            // tajuk bawah
        mk(new THREE.ConeGeometry(0.3, 0.45, 7), leafMat, 1.62);            // tajuk atas (puncak ~1.85)
    }
    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder pot tanaman. Model lokal: diameter pot 1.0, tinggi 1.8,
 * dasar pot di y=0. Di-skala NON-UNIFORM mengisi footprint sx×sz dgn tinggi
 * sy; berdiri di y=0.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticPlanterMesh(sx, sy, sz) {
    const p = new Planter();
    p.group.scale.set(sx / 1.0, sy / 1.8, sz / 1.0);   // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(p.group);
    return g;
}

export default Planter;
