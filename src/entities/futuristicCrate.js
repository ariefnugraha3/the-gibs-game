// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK 2026-07-16 — low-poly ringan & realistis: badan krat + TUTUP di
// atasnya + tepi marka amber (LineSegments, bukan mesh). SEMUA
// MeshLambertMaterial (program shader sudah dipanaskan preload -> tanpa
// recompile & murah). Model lokal: kubus 1.2, dasar di y=0 (tutup y≈1.2).
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Crate {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Crate";
        const bodyMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const lidMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        // Badan krat (dasar di y=0)
        const geo = new THREE.BoxGeometry(1.2, 1.14, 1.2);
        const body = new THREE.Mesh(geo, bodyMat);
        body.position.y = 0.57;
        this.group.add(body);
        // Tutup sedikit menjorok
        const lid = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.06, 1.26), lidMat);
        lid.position.y = 1.17;
        this.group.add(lid);
        // Tepi marka amber (krat logistik sipil)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: PAL.amber }));
        edges.position.y = 0.57;
        this.group.add(edges);
    }
    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder krat (cover stage campaign). Model lokal: 1.2×1.2×1.2,
 * dasar di y=0. Di-skala NON-UNIFORM mengisi footprint sx×sz dgn tinggi sy;
 * berdiri di y=0.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticCrateMesh(sx, sy, sz) {
    const c = new Crate();
    c.group.scale.set(sx / 1.2, sy / 1.2, sz / 1.2);   // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(c.group);
    return g;
}

export default Crate;
