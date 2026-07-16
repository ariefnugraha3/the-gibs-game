// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: kios/warung dgn
// counter + top kayu + 4 TIANG baja di sudut yang MENOPANG atap (dulu atap
// "melayang" di atas 4 tiang glow cyan — tidak masuk akal secara struktur)
// + papan menu digital teal menggantung di bawah atap depan. SEMUA
// MeshLambertMaterial (program shader sudah dipanaskan preload -> tanpa
// recompile & murah). Model lokal: lebar(x) 2.2, dalam(z) 1.2, tinggi 2.05,
// dasar counter di y=0 (muka kios = +z).
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class Stall {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Stall";
        const counterMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
        const woodMat = new THREE.MeshLambertMaterial({ color: PAL.wood });
        const postMat = new THREE.MeshLambertMaterial({ color: PAL.steel });
        const roofMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const signMat = new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.tech, emissiveIntensity: 0.7 });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            this.group.add(m);
            return m;
        };

        mk(new THREE.BoxGeometry(2.0, 0.9, 0.9), counterMat, 0, 0.45, 0);     // counter (dasar y=0)
        mk(new THREE.BoxGeometry(2.1, 0.06, 1.0), woodMat, 0, 0.93, 0);       // top kayu
        // 4 tiang baja di sudut, dari lantai sampai atap
        const postGeo = new THREE.BoxGeometry(0.07, 1.96, 0.07);
        for (const x of [-0.95, 0.95]) for (const z of [-0.5, 0.5]) {
            mk(postGeo, postMat, x, 0.98, z);
        }
        mk(new THREE.BoxGeometry(2.2, 0.08, 1.2), roofMat, 0, 2.0, 0);        // atap (ditopang tiang)
        // Papan menu digital menggantung di bawah atap depan (satu-satunya glow)
        mk(new THREE.BoxGeometry(1.5, 0.35, 0.05), signMat, 0, 1.68, 0.5);
    }
    update(t) { }   // statis (kompat API)
}

/**
 * Drop-in builder kios/sekat. Model lokal: lebar(x) 2.2, dalam(z) 1.2, tinggi
 * 2.05, dasar counter di y=0. Di-skala NON-UNIFORM mengisi footprint sx×sz
 * dgn tinggi sy; berdiri di y=0.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticStallMesh(sx, sy, sz) {
    const s = new Stall();
    s.group.scale.set(sx / 2.2, sy / 2.05, sz / 1.2);   // dasar model sudah di y=0
    const g = new THREE.Group();
    g.add(s.group);
    return g;
}

export default Stall;
