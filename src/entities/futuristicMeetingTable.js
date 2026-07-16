// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// DIROMBAK TOTAL 2026-07-16 — low-poly ringan & realistis: meja rapat top
// kayu jati + 2 pedestal kotak + hub kabel/media teal di tengah permukaan
// (dulu 2× ExtrudeGeometry rounded-rect ber-bevel + proyektor hologram +
// bola data + kerucut sinar + 8 terminal glow — berat & tak realistis).
// SEMUA MeshLambertMaterial (program shader sudah dipanaskan preload ->
// tanpa recompile & murah). Model lokal: lebar(x) 7, dalam(z) 3.5, permukaan
// di y≈1.5 (kalibrasi builder LAMA dipertahankan), dasar pedestal di y=0.
// Warna mengikuti panduan gaya "GIBS 2045" (world/palette.js).

import { PAL } from '../world/palette.js';

export class FuturisticMeetingTable {
    constructor() {
        this.group = new THREE.Group();
        this.buildTable();
    }

    buildTable() {
        const topMat = new THREE.MeshLambertMaterial({ color: PAL.wood });
        const legMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
        const hubMat = new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.tech, emissiveIntensity: 0.6 });

        // Top slab kayu (permukaan y≈1.5–1.6)
        const top = new THREE.Mesh(new THREE.BoxGeometry(7, 0.18, 3.5), topMat);
        top.position.y = 1.5;
        this.group.add(top);
        // 2 pedestal kotak menapak lantai
        const pedGeo = new THREE.BoxGeometry(0.9, 1.4, 2.2);
        for (const x of [-2.2, 2.2]) {
            const ped = new THREE.Mesh(pedGeo, legMat);
            ped.position.set(x, 0.7, 0);
            this.group.add(ped);
        }
        // Hub kabel/media di tengah permukaan (satu-satunya glow)
        const hub = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.5), hubMat);
        hub.position.y = 1.61;
        this.group.add(hub);
    }

    update(time) { }   // statis (kompat API)
}

/**
 * Drop-in builder meja rapat/konferensi. Model lokal: top 7×3.5 u di y≈1.5,
 * pedestal dari y=0. Di-skala NON-UNIFORM mengisi footprint sx×sz dgn permukaan
 * di sy; berdiri di y=0.
 * @param {number} sx lebar dunia @param {number} sy tinggi permukaan @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticMeetingTableMesh(sx, sy, sz) {
    const t = new FuturisticMeetingTable();
    t.group.scale.set(sx / 7, sy / 1.5, sz / 3.5);
    const g = new THREE.Group();
    g.add(t.group);
    return g;
}

export default FuturisticMeetingTable;
