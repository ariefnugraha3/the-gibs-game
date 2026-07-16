// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — versi low-poly ringan:
//  - Semua MeshLambertMaterial (program shader yang SUDAH dipanaskan preload
//    -> tanpa recompile & jauh lebih murah; dulu MeshStandard+MeshPhysical
//    [transmission] dengan ~64 mesh: torus arch, 5 jari-jari per roda, dll).
//  - Bentuk "2 kotak" SUV: bodi tinggi + greenhouse kaca + rel atap + ban serep.
//  - RODA DIBENAHI: dulu silinder di-rotasi `rotation.z` -> porosnya sejajar
//    PANJANG mobil (ban "rebah"/salah arah); kini geometri di-bake rotateX(90°)
//    -> POROS Z (tegak, menggelinding searah panjang bodi), menapak tanah di
//    y=0, dan menonjol keluar sisi bodi.
// Model lokal: panjang di sumbu X (depan = +X), dasar roda di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js) — aksen teal, tanpa neon.

import { PAL } from '../world/palette.js';

export class FuturisticSUV {
    /**
     * @param {Object} options
     * @param {number}  [options.bodyColor=PAL.gunmetal] warna cat bodi
     * @param {number}  [options.scale=1]                skala keseluruhan
     * @param {boolean} [options.enableLights=true]      lampu/aksen emissive menyala
     */
    constructor(options = {}) {
        this.options = Object.assign({
            bodyColor: PAL.gunmetal,
            scale: 1,
            enableLights: true,
        }, options);

        this.group = new THREE.Group();
        this.group.name = 'FuturisticSUV';
        this.wheels = [];
        this._build();
        this.group.scale.setScalar(this.options.scale);
    }

    _build() {
        const o = this.options;
        const glow = o.enableLights ? 1 : 0;

        // --- Material (Lambert semua = 1 program shader, murah) ---
        const bodyMat = new THREE.MeshLambertMaterial({ color: o.bodyColor });
        const glassMat = new THREE.MeshLambertMaterial({
            color: PAL.screenBg, transparent: true, opacity: 0.65,
            emissive: PAL.techDim, emissiveIntensity: 0.25 * glow
        });
        const trimMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const tireMat = new THREE.MeshLambertMaterial({ color: PAL.rubber });
        const hubMat = new THREE.MeshLambertMaterial({ color: PAL.steel });
        const headMat = new THREE.MeshLambertMaterial({ color: PAL.white, emissive: PAL.white, emissiveIntensity: 0.85 * glow });
        const tailMat = new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard, emissiveIntensity: 0.7 * glow });
        const accentMat = new THREE.MeshLambertMaterial({ color: PAL.tech, emissive: PAL.tech, emissiveIntensity: 0.6 * glow });

        const mk = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            m.castShadow = true; m.receiveShadow = true;
            this.group.add(m);
            return m;
        };

        // --- Bodi "2 kotak" SUV (tinggi, ground clearance jelas) ---
        mk(new THREE.BoxGeometry(4.4, 1.0, 1.84), bodyMat, 0, 1.0, 0);          // bodi utama (y 0.5..1.5)
        mk(new THREE.BoxGeometry(2.9, 0.55, 1.70), glassMat, -0.3, 1.775, 0);   // greenhouse kaca (y 1.5..2.05)
        mk(new THREE.BoxGeometry(2.7, 0.10, 1.60), bodyMat, -0.3, 2.10, 0);     // pelat atap
        mk(new THREE.BoxGeometry(2.4, 0.07, 0.08), trimMat, -0.3, 2.19, 0.62);  // rel atap kiri
        mk(new THREE.BoxGeometry(2.4, 0.07, 0.08), trimMat, -0.3, 2.19, -0.62); // rel atap kanan

        // --- Bumper + lampu + aksen (depan = +X) ---
        mk(new THREE.BoxGeometry(0.25, 0.40, 1.90), trimMat, 2.28, 0.55, 0);    // bumper depan
        mk(new THREE.BoxGeometry(0.25, 0.40, 1.90), trimMat, -2.28, 0.55, 0);   // bumper belakang
        mk(new THREE.BoxGeometry(0.05, 0.10, 1.30), accentMat, 2.33, 1.10, 0);  // bar grille teal (satu-satunya aksen)
        mk(new THREE.BoxGeometry(0.06, 0.14, 0.50), headMat, 2.32, 1.32, 0.55); // headlight kiri
        mk(new THREE.BoxGeometry(0.06, 0.14, 0.50), headMat, 2.32, 1.32, -0.55);// headlight kanan
        mk(new THREE.BoxGeometry(0.06, 0.14, 1.50), tailMat, -2.32, 1.32, 0);   // strip taillight

        // --- Roda: poros Z (tegak), menapak y=0, menonjol keluar sisi bodi ---
        // Bodi setengah-lebar 0.92; roda di z ±0.98 (span 0.81..1.15) -> terlihat.
        const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.34, 12);
        wheelGeo.rotateX(Math.PI / 2);                                           // poros Y -> Z
        const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.36, 8);
        hubGeo.rotateX(Math.PI / 2);
        for (const x of [1.5, -1.5]) for (const z of [0.98, -0.98]) {
            this.wheels.push(mk(wheelGeo, tireMat, x, 0.45, z));                 // r 0.45 -> menapak y=0
            mk(hubGeo, hubMat, x, 0.45, z);
        }

        // Ban serep di pintu belakang (poros X = menghadap ke belakang)
        const spare = mk(wheelGeo, tireMat, -2.46, 1.15, 0);
        spare.rotation.y = Math.PI / 2;
    }

    // Kompat API lama (TIDAK dipanggil game — mobil statis).
    update(delta, state = {}) {
        if (typeof state.speed === 'number') {
            for (const w of this.wheels) w.rotation.z -= state.speed * delta * 2;
        }
    }

    dispose() {
        this.group.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
        this.wheels = [];
    }
}

/**
 * Drop-in builder untuk "object mobil" cover (dipakai stage4.mkCar).
 * Mengembalikan THREE.Group: panjang bodi di-orient ke sumbu Z (siap di-yaw
 * lewat group.rotation.y) dan berdiri di y=0 (dasar roda model sudah di y=0).
 * `update()` TIDAK dipanggil (mobil statis).
 * @param {number} [scale=7]         1 unit-model ≈ `scale` u-dunia (1 m ≈ 7 u)
 * @param {number|null} [bodyColor]  warna cat bodi (null = default gunmetal)
 * @returns {THREE.Group}
 */
export function buildFuturisticSUVMesh(scale = 7, bodyColor = null) {
    const opts = { scale };
    if (bodyColor != null) opts.bodyColor = bodyColor;
    const suv = new FuturisticSUV(opts);
    suv.group.rotation.y = Math.PI / 2;   // panjang bodi (X model) -> sumbu Z dunia
    const g = new THREE.Group();
    g.add(suv.group);
    return g;
}

export default FuturisticSUV;
