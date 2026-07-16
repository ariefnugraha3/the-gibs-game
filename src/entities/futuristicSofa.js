// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: sofa dgn rangka,
// SANDARAN TANGAN kiri-kanan (dulu tidak ada!), 3 bantalan duduk + 3 bantalan
// punggung kain merah-bata (dulu bantalan glow magenta). TANPA emissive.
// SEMUA MeshLambertMaterial (program shader sudah dipanaskan preload ->
// tanpa recompile & murah). Model lokal: lebar(x) 2.5, dalam(z) 1.0,
// tinggi 1.25, dasar rangka di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Sofa {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Sofa";
        const frameMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const fabricMat = new THREE.MeshLambertMaterial({ color: PAL.hazard });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            this.group.add(m);
            return m;
        };

        mk(new THREE.BoxGeometry(2.5, 0.5, 0.95), frameMat, 0, 0.25, 0.02);      // rangka bawah (dasar y=0)
        mk(new THREE.BoxGeometry(2.5, 0.75, 0.22), frameMat, 0, 0.85, -0.39);    // sandaran punggung
        mk(new THREE.BoxGeometry(0.25, 0.45, 0.95), frameMat, -1.125, 0.72, 0.02); // sandaran tangan kiri
        mk(new THREE.BoxGeometry(0.25, 0.45, 0.95), frameMat, 1.125, 0.72, 0.02);  // sandaran tangan kanan
        // 3 bantalan duduk + 3 bantalan punggung (kain merah-bata)
        const seatGeo = new THREE.BoxGeometry(0.62, 0.16, 0.7);
        const backGeo = new THREE.BoxGeometry(0.62, 0.5, 0.14);
        for (const x of [-0.66, 0, 0.66]) {
            mk(seatGeo, fabricMat, x, 0.58, 0.08);
            mk(backGeo, fabricMat, x, 0.92, -0.23);
        }
    }
    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder sofa. Model lokal: lebar(x) 2.5, dalam(z) 1.0, tinggi 1.25
 * (dasar di y=0). Di-skala NON-UNIFORM mengisi footprint sx×sz dgn tinggi sy;
 * berdiri di y=0.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticSofaMesh(sx, sy, sz) {
    const s = new Sofa();
    s.group.scale.set(sx / 2.5, sy / 1.25, sz / 1.0);   // dasar sofa sudah di y=0
    const g = new THREE.Group();
    g.add(s.group);
    return g;
}

export default Sofa;
