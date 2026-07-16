// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: kursi kantor
// beneran — dasar bintang-5 dgn KASTOR menapak lantai, tabung gas lift,
// dudukan, sandaran miring, 2 sandaran tangan (dulu ~23 mesh: sphere 16×16
// utk "hover caster" glow, cincin hidrolik glow, trim & strut emissive).
// TANPA emissive sama sekali (kursi tidak menyala). SEMUA
// MeshLambertMaterial (program shader sudah dipanaskan preload -> tanpa
// recompile & murah). Model lokal: tapak ~1.9 u, dudukan y≈1.28, puncak
// sandaran ~2.9, dasar kastor di y=0. Dekorasi murni (tanpa blocker).
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class FuturisticChair {
    constructor() {
        this.group = new THREE.Group();
        this.buildChair();
    }

    buildChair() {
        const frameMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const padMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });   // jok/kain
        const castMat = new THREE.MeshLambertMaterial({ color: PAL.rubber });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            this.group.add(m);
            return m;
        };

        // Dasar bintang-5: tiap lengan = strut kotak + kastor silinder kecil
        const legGeo = new THREE.BoxGeometry(0.85, 0.08, 0.15);
        const castGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.12, 8);
        for (let i = 0; i < 5; i++) {
            const arm = new THREE.Group();
            const leg = new THREE.Mesh(legGeo, frameMat);
            leg.position.set(0.45, 0.14, 0);
            arm.add(leg);
            const caster = new THREE.Mesh(castGeo, castMat);
            caster.position.set(0.82, 0.06, 0);      // menapak lantai (bawah y=0)
            arm.add(caster);
            arm.rotation.y = (i / 5) * Math.PI * 2;
            this.group.add(arm);
        }

        // Tabung gas lift
        mk(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 8), frameMat, 0, 0.68, 0);

        // Dudukan + sandaran miring
        mk(new THREE.BoxGeometry(1.3, 0.16, 1.15), padMat, 0, 1.26, 0);
        const back = mk(new THREE.BoxGeometry(1.2, 1.5, 0.14), padMat, 0, 2.12, -0.52);
        back.rotation.x = 0.12;

        // 2 sandaran tangan: tiang + pad
        const postGeo = new THREE.BoxGeometry(0.08, 0.35, 0.08);
        const armGeo = new THREE.BoxGeometry(0.18, 0.06, 0.7);
        for (const x of [-0.65, 0.65]) {
            mk(postGeo, frameMat, x, 1.5, 0.05);
            mk(armGeo, padMat, x, 1.7, 0.05);
        }
    }

    update(time) { }   // statis (kompat API)
}

/**
 * Drop-in builder kursi (dekorasi TANPA blocker). Model lokal: tapak ~1.9 u,
 * dudukan y≈1.26, puncak sandaran ~2.9, dasar kastor di y=0. Di-skala uniform;
 * berdiri di y=0 tanpa pengangkatan.
 * @param {number} [scale=4.5]  skala uniform (1 u-model → `scale` u-dunia)
 * @returns {THREE.Group}
 */
export function buildFuturisticChairMesh(scale = 4.5) {
    const c = new FuturisticChair();
    c.group.scale.setScalar(scale);                  // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(c.group);
    return g;
}

export default FuturisticChair;
