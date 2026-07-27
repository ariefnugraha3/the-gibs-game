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

        // Aksen teknologi sipil (teal pudar) — SATU-SATUNYA aksen tech di mobil
        // sipil; emissive sengaja rendah (0.35 << EMISSIVE_MAX) supaya jadi garis
        // redup, BUKAN neon. Aturan gaya GIBS 2045: neon cyan/magenta & underglow
        // DILARANG (world/palette.js).
        const accentMat = new THREE.MeshLambertMaterial({
            color: PAL.tech, emissive: PAL.tech, emissiveIntensity: 0.35
        });

        const mk = (geo, mat, x, y, z, rz) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            if (rz) m.rotation.z = rz;
            m.castShadow = true; m.receiveShadow = true;
            this.group.add(m);
            return m;
        };

        // --- Bodi "3 kotak" (tanpa rotasi — blocky terbaca jelas dari top-down) ---
        mk(new THREE.BoxGeometry(4.6, 0.55, 1.76), bodyMat, 0, 0.575, 0);      // bodi bawah (y 0.3..0.85)
        mk(new THREE.BoxGeometry(1.2, 0.30, 1.66), bodyMat, 1.6, 1.0, 0);      // kap mesin depan
        mk(new THREE.BoxGeometry(1.0, 0.28, 1.66), bodyMat, -1.75, 0.99, 0);   // bagasi belakang
        mk(new THREE.BoxGeometry(1.75, 0.50, 1.50), glassMat, -0.20, 1.10, 0); // kaca samping kabin
        mk(new THREE.BoxGeometry(1.45, 0.08, 1.40), bodyMat, -0.25, 1.39, 0);  // pelat atap

        // --- KACA MIRING (2026-07-28): kabin lama = kotak tegak lurus, siluetnya
        //     terbaca sebagai mobil kotak tahun 90-an. Kaca depan & belakang kini
        //     REBAH — profil fastback yang bikin mobil terbaca modern dari kamera
        //     oblique, tanpa perlu bentuk aneh-aneh. ---
        mk(new THREE.BoxGeometry(0.58, 0.06, 1.46), glassMat, 0.74, 1.25, 0, -0.36);   // kaca depan
        mk(new THREE.BoxGeometry(0.37, 0.06, 1.46), glassMat, -1.11, 1.24, 0, 0.675);  // kaca belakang

        // --- Bumper + LAMPU BATANG SELEBAR BODI (depan = +X) ---
        // Muka TERTUTUP tanpa gril + satu batang lampu penuh = bahasa desain EV
        // yang sudah umum sejak 2020-an; ini isyarat "mobil baru" paling kuat.
        mk(new THREE.BoxGeometry(0.22, 0.30, 1.80), trimMat, 2.35, 0.50, 0);   // bumper depan
        mk(new THREE.BoxGeometry(0.22, 0.30, 1.80), trimMat, -2.35, 0.50, 0);  // bumper belakang
        mk(new THREE.BoxGeometry(0.07, 0.09, 1.70), headMat, 2.33, 0.80, 0);   // batang lampu depan
        mk(new THREE.BoxGeometry(0.05, 0.05, 1.62), accentMat, 2.34, 0.68, 0); // garis DRL teal (aksen tunggal)
        mk(new THREE.BoxGeometry(0.07, 0.10, 1.70), tailMat, -2.33, 0.80, 0);  // batang lampu belakang

        // --- POD SENSOR atap (mengemudi otonom) — kubah kecil di tepi depan atap.
        //     Detail 2045 yang PALING terbaca dari kamera top-down, dan sekaligus
        //     paling masuk akal: mobil sipil 2045 mengemudi sendiri. ---
        mk(new THREE.BoxGeometry(0.30, 0.10, 0.34), trimMat, 0.30, 1.48, 0);

        // --- Garis bahu di kedua sisi: memecah lambung polos jadi dua bidang ---
        mk(new THREE.BoxGeometry(2.9, 0.05, 0.06), trimMat, 0, 0.86, 0.90);
        mk(new THREE.BoxGeometry(2.9, 0.05, 0.06), trimMat, 0, 0.86, -0.90);

        // --- Roda: poros Z (tegak), menapak y=0, menonjol keluar sisi bodi ---
        // Bodi setengah-lebar 0.88; roda di z ±0.94 (span 0.80..1.08) -> terlihat.
        // Hub diperbesar 0.15 -> 0.24 = TUTUP RODA AERO (pelek tertutup rata),
        // ciri mobil listrik modern; tetap silinder (kontrak uji roda smoke).
        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 12);
        wheelGeo.rotateX(Math.PI / 2);                                          // poros Y -> Z
        const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.30, 10);
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
