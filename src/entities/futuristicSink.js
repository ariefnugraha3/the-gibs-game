// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: wastafel pedestal
// porselen dgn keran BERCUCURAN (riser tegak + cucuran mendatar di atas bak —
// dulu keran cuma silinder tegak tanpa cucuran + "air hologram" teal menyala).
// TANPA emissive. SEMUA MeshLambertMaterial (program shader sudah dipanaskan
// preload -> tanpa recompile & murah). Model lokal: lebar(x) 0.8, dalam(z)
// 0.5, tinggi 1.1, dasar pedestal di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Sink {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Sink";
        const porcMat = new THREE.MeshLambertMaterial({ color: PAL.white });   // porselen
        const tapMat = new THREE.MeshLambertMaterial({ color: PAL.steel });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            this.group.add(m);
            return m;
        };

        mk(new THREE.CylinderGeometry(0.12, 0.18, 0.55, 8), porcMat, 0, 0.275, 0);  // pedestal (dasar y=0)
        mk(new THREE.BoxGeometry(0.8, 0.25, 0.5), porcMat, 0, 0.675, 0);            // bak cuci (top ~0.8)
        // Keran: riser tegak di belakang bak + cucuran mendatar menjorok ke bak
        mk(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), tapMat, 0, 0.93, -0.18);
        mk(new THREE.BoxGeometry(0.05, 0.05, 0.22), tapMat, 0, 1.06, -0.08);
    }
    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder wastafel. Model lokal: lebar(x) 0.8, dalam(z) 0.5, tinggi
 * 1.1, dasar pedestal di y=0. Di-skala NON-UNIFORM mengisi footprint sx×sz
 * dgn tinggi sy; berdiri di y=0.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticSinkMesh(sx, sy, sz) {
    const s = new Sink();
    s.group.scale.set(sx / 0.8, sy / 1.1, sz / 0.5);   // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(s.group);
    return g;
}

export default Sink;
