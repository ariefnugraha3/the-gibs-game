// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK 2026-07-16 — low-poly ringan & realistis: bongkahan beton (warna
// senada dinding gedung) + tulangan BESI mencuat (dulu kabel glow — puing
// beton nyatanya berisi rebar, bukan neon). TANPA emissive. SEMUA
// MeshLambertMaterial (program shader sudah dipanaskan preload -> tanpa
// recompile & murah). Model lokal: sebaran ~1.6×1.6, tinggi ~1.0, batu
// terendah menapak y≈0. Warna: panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Rubble {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Rubble";
        const concA = new THREE.MeshLambertMaterial({ color: PAL.concrete });
        const concB = new THREE.MeshLambertMaterial({ color: PAL.panel });
        const rebarMat = new THREE.MeshLambertMaterial({ color: PAL.ink });

        // 4 bongkahan beton acak (2 rona beton bergantian)
        for (let i = 0; i < 4; i++) {
            const r = 0.22 + Math.random() * 0.3;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), i % 2 ? concB : concA);
            rock.position.set((Math.random() - 0.5), r * 0.7, (Math.random() - 0.5));
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            this.group.add(rock);
        }
        // 2 tulangan besi (rebar) mencuat miring
        const rebarGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4);
        for (let i = 0; i < 2; i++) {
            const bar = new THREE.Mesh(rebarGeo, rebarMat);
            bar.position.set((Math.random() - 0.5) * 0.8, 0.3, (Math.random() - 0.5) * 0.8);
            bar.rotation.set((Math.random() - 0.5) * 1.2, Math.random() * Math.PI, (Math.random() - 0.5) * 1.2);
            this.group.add(bar);
        }
    }
    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder puing/runtuhan. Model lokal acak: sebaran ~1.6×1.6, tinggi
 * ~1.0, dasar menapak y≈0. Di-skala NON-UNIFORM mengisi footprint sx×sz dgn
 * tinggi sy; berdiri di y≈0 (puing dekorasi, sedikit overhang tak masalah).
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticRubbleMesh(sx, sy, sz) {
    const rb = new Rubble();
    rb.group.scale.set(sx / 1.6, sy / 1.0, sz / 1.6);   // dasar model sudah ~y=0
    const g = new THREE.Group();
    g.add(rb.group);
    return g;
}

export default Rubble;
