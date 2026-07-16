// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: papan dudukan +
// 2 kaki kotak menapak lantai (dulu "hover pad" silinder glow melayang —
// tidak sesuai kenyataan). SEMUA MeshLambertMaterial (program shader sudah
// dipanaskan preload -> tanpa recompile & murah di-render).
// Model lokal: lebar(x) 2, dalam(z) 0.5, tinggi 0.55, dasar kaki di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Bench {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Bench";
        const seatMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const legMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        // Papan dudukan
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.5), seatMat);
        seat.position.y = 0.51;
        this.group.add(seat);
        // 2 kaki panel di ujung (menapak lantai)
        const legGeo = new THREE.BoxGeometry(0.1, 0.47, 0.44);
        for (let i = -1; i <= 1; i += 2) {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(i * 0.85, 0.235, 0);
            this.group.add(leg);
        }
    }
    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder bangku (dipakai furnitur stage campaign). Model lokal:
 * lebar(x) 2, dalam(z) 0.5, tinggi 0.55, dasar kaki di y=0. Di-skala
 * NON-UNIFORM mengisi footprint sx×sz dgn tinggi sy; berdiri di y=0.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticBenchMesh(sx, sy, sz) {
    const b = new Bench();
    b.group.scale.set(sx / 2, sy / 0.55, sz / 0.5);   // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(b.group);
    return g;
}

export default Bench;
