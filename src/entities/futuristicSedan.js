// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — versi low-poly ringan:
//  - Semua MeshLambertMaterial (program shader yang SUDAH dipanaskan preload
//    -> tanpa recompile & jauh lebih murah di-render; dulu ExtrudeGeometry
//    ber-bevel + MeshStandardMaterial).
//  - Bentuk "3 kotak" sedan klasik: kap mesin depan + kabin kaca + bagasi.
//  - RODA DIBENAHI: silinder ber-POROS Z (tegak, menggelinding searah panjang
//    bodi), menapak tanah di y=0, dan MENONJOL keluar sisi bodi — dulu roda
//    terkubur di dalam bodi (z ±0.9 < tebal bodi+bevel ±1.1) dan model harus
//    diangkat 0.9·scale oleh builder.
// Model lokal: panjang di sumbu X (depan = +X), dasar roda di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js) — tanpa neon.

import { PAL } from '../world/palette.js';

export class FuturisticSedan {
    constructor(bodyColor = null) {
        this.bodyColor = bodyColor;
        this.group = new THREE.Group();
        this.buildCar();
    }

    buildCar() {
        // --- Material (Lambert semua = 1 program shader, murah) ---
        const bodyMat = new THREE.MeshLambertMaterial({ color: this.bodyColor != null ? this.bodyColor : PAL.gunmetal });
        const glassMat = new THREE.MeshLambertMaterial({
            color: PAL.screenBg, transparent: true, opacity: 0.65,
            emissive: PAL.techDim, emissiveIntensity: 0.25
        });
        const trimMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const tireMat = new THREE.MeshLambertMaterial({ color: PAL.rubber });
        const hubMat = new THREE.MeshLambertMaterial({ color: PAL.steel });
        const headMat = new THREE.MeshLambertMaterial({ color: PAL.white, emissive: PAL.white, emissiveIntensity: 0.5 });
        const tailMat = new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard, emissiveIntensity: 0.5 });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            m.castShadow = true; m.receiveShadow = true;
            this.group.add(m);
            return m;
        };

        // --- Bodi "3 kotak" (tanpa rotasi — blocky terbaca jelas dari top-down) ---
        mk(new THREE.BoxGeometry(4.6, 0.55, 1.76), bodyMat, 0, 0.575, 0);      // bodi bawah (y 0.3..0.85)
        mk(new THREE.BoxGeometry(1.2, 0.30, 1.66), bodyMat, 1.6, 1.0, 0);      // kap mesin depan
        mk(new THREE.BoxGeometry(1.0, 0.28, 1.66), bodyMat, -1.75, 0.99, 0);   // bagasi belakang
        mk(new THREE.BoxGeometry(2.0, 0.50, 1.50), glassMat, -0.15, 1.10, 0);  // kabin kaca (di atas bodi)
        mk(new THREE.BoxGeometry(1.7, 0.08, 1.40), bodyMat, -0.15, 1.39, 0);   // pelat atap

        // --- Bumper + lampu (depan = +X) ---
        mk(new THREE.BoxGeometry(0.22, 0.30, 1.80), trimMat, 2.35, 0.50, 0);   // bumper depan
        mk(new THREE.BoxGeometry(0.22, 0.30, 1.80), trimMat, -2.35, 0.50, 0);  // bumper belakang
        mk(new THREE.BoxGeometry(0.06, 0.12, 1.40), headMat, 2.32, 0.78, 0);   // strip headlight
        mk(new THREE.BoxGeometry(0.06, 0.12, 1.40), tailMat, -2.32, 0.78, 0);  // strip taillight

        // --- Roda: poros Z (tegak), menapak y=0, menonjol keluar sisi bodi ---
        // Bodi setengah-lebar 0.88; roda di z ±0.94 (span 0.80..1.08) -> terlihat.
        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 12);
        wheelGeo.rotateX(Math.PI / 2);                                          // poros Y -> Z
        const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.30, 8);
        hubGeo.rotateX(Math.PI / 2);
        this.wheels = [];
        for (const x of [1.5, -1.5]) for (const z of [0.94, -0.94]) {
            this.wheels.push(mk(wheelGeo, tireMat, x, 0.35, z));               // r 0.35 -> menapak y=0
            mk(hubGeo, hubMat, x, 0.35, z);
        }
    }

    // Kompat API lama (TIDAK dipanggil game — mobil statis).
    update(delta, state = {}) {
        if (typeof state.speed === 'number' && this.wheels) {
            for (const w of this.wheels) w.rotation.z -= state.speed * delta * 2;
        }
    }

    dispose() {
        this.group.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
    }
}

/**
 * Drop-in builder untuk "object mobil" cover (sejajar buildFuturisticSUVMesh).
 * Mengembalikan THREE.Group: panjang bodi di-orient ke sumbu Z (siap di-yaw lewat
 * group.rotation.y) dan berdiri di y=0 (dasar roda model SUDAH di y=0 — tanpa
 * pengangkatan lagi). `update()` TIDAK dipanggil (mobil statis).
 * @param {number} [scale=7]         1 unit-model ≈ `scale` u-dunia (1 m ≈ 7 u)
 * @param {number|null} [bodyColor]  warna cat bodi (null = default gunmetal)
 * @returns {THREE.Group}
 */
export function buildFuturisticSedanMesh(scale = 7, bodyColor = null) {
    const sed = new FuturisticSedan(bodyColor);
    sed.group.rotation.y = Math.PI / 2;   // panjang bodi (X model) -> sumbu Z dunia
    sed.group.scale.setScalar(scale);
    const g = new THREE.Group();
    g.add(sed.group);
    return g;
}

export default FuturisticSedan;
