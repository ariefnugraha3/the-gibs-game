// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: meja kantor dgn
// top slab + 2 panel kaki samping + panel penutup belakang + monitor
// (alas/leher/layar, DUDUK di meja — bukan melayang) + keyboard 1 lempeng
// (dulu ~60 mesh: grid 45 tombol, kaki miring + pad glow, top kaca).
// SEMUA MeshLambertMaterial (program shader sudah dipanaskan preload ->
// tanpa recompile & murah). Model lokal: lebar(x) 6, dalam(z) 3, permukaan
// meja di y≈1.5 (kalibrasi builder LAMA dipertahankan), dasar kaki di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class FuturisticDesk {
    constructor() {
        this.group = new THREE.Group();
        this.buildDesk();
    }

    buildDesk() {
        const topMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const trimMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const screenMat = new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.tech, emissiveIntensity: 0.7 });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            this.group.add(m);
            return m;
        };

        // Top slab (permukaan y≈1.5–1.6) + 2 panel kaki samping + penutup belakang
        mk(new THREE.BoxGeometry(6, 0.2, 3), topMat, 0, 1.5, 0);
        mk(new THREE.BoxGeometry(0.15, 1.4, 2.7), trimMat, -2.8, 0.7, 0);
        mk(new THREE.BoxGeometry(0.15, 1.4, 2.7), trimMat, 2.8, 0.7, 0);
        mk(new THREE.BoxGeometry(5.5, 0.9, 0.1), trimMat, 0, 0.95, -1.3);

        // Monitor duduk di atas meja: alas + leher + layar (housing+muka sejajar)
        mk(new THREE.BoxGeometry(0.7, 0.05, 0.45), trimMat, 0, 1.62, -0.9);
        mk(new THREE.BoxGeometry(0.08, 0.4, 0.08), trimMat, 0, 1.83, -0.95);
        const scr = new THREE.Group();
        scr.position.set(0, 2.35, -0.95);
        scr.rotation.x = -0.1;                      // sedikit menunduk ke pengguna
        scr.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 0.08), trimMat));
        this.monitor = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.83, 0.02), screenMat);
        this.monitor.position.z = 0.05;
        scr.add(this.monitor);
        this.group.add(scr);

        // Keyboard = 1 lempeng tipis (bukan grid 45 tombol)
        this.keyboard = mk(new THREE.BoxGeometry(1.6, 0.04, 0.5), trimMat, 0, 1.63, 0.55);
    }

    update(time) {
        // Pulsa layar monitor (kompat API; TIDAK dipanggil game — statis)
        const pulse = (Math.sin(time * 3) * 0.5) + 0.5;
        this.monitor.material.emissiveIntensity = 0.4 + pulse * 0.3;
    }
}

/**
 * Drop-in builder untuk "object meja" (dipakai furnitur meja stage 1/2/3).
 * Model lokal: lebar(x) 6, dalam(z) 3, permukaan meja di y≈1.5, kaki dari y=0.
 * Di-skala NON-UNIFORM agar tepat mengisi footprint (sx×sz) blocker & permukaan
 * meja duduk di ketinggian sy; berdiri di y=0 (siap ditaruh di posisi sel).
 * @param {number} sx  lebar dunia (sumbu X)
 * @param {number} sy  tinggi permukaan meja (= top blocker)
 * @param {number} sz  kedalaman dunia (sumbu Z)
 * @returns {THREE.Group}
 */
export function buildFuturisticDeskMesh(sx, sy, sz) {
    const d = new FuturisticDesk();
    d.group.scale.set(sx / 6, sy / 1.5, sz / 3);
    const g = new THREE.Group();
    g.add(d.group);
    return g;
}

export default FuturisticDesk;
