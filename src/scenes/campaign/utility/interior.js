// interior.js — MATERIAL DINDING & LANTAI gedung campaign stage 1-3.
// Desain ulang 2026-07-18 (permintaan user: lebih bagus, futuristis, wajar,
// CERAH). Ganti tekstur cokelat-kusam lama dengan PANEL FASILITAS abu-abu
// hangat TERANG + aksen strip/nat TEAL (PAL.tech) yang MENYALA lembut — sesuai
// panduan GIBS 2045 (emissive <= EMISSIVE_MAX, teal satu-satunya aksen tech).
// Dibagikan ketiga stage indoor supaya konsisten & tanpa duplikasi.
//
// Catatan r128: peta sekunder (emissiveMap/normalMap) memakai transform UV dari
// `map` (repeat diffuse) — jadi dibangun repeat 1,1 lalu ikut repeat diffuse.

import { makeTexture, makeNormalMap, speckle } from '../../../utils/textures.js';
import { PAL, EMISSIVE_MAX } from '../../../world/palette.js';

const TEAL = '#2fb8a6';   // PAL.tech (aksen tech sipil)

// =====================  LANTAI  =====================
// Panel besar terang + nat gelap ber-bevel + garis nat TEAL menyala (grid saat
// di-tile) — kesan ubin fasilitas dengan lampu tersembunyi di sela panel.
function floorDiffuse(repX, repY) {
    return makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#b2ab9d'; g.fillRect(0, 0, w, h);                       // dasar abu hangat TERANG
        speckle(g, w, h, ['#b8b1a3', '#aaa294', '#bdb6a8', '#a49d8f'], 220, 1, 3);
        g.fillStyle = 'rgba(202,194,182,0.45)';                                // panel dalam sedikit lebih terang
        g.fillRect(5, 5, w - 10, h - 10);
        // nat panel gelap (tepi atas & kiri -> jadi grid saat di-tile)
        g.fillStyle = '#6b665c';
        g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
        // sorot bevel terang tepat di dalam nat
        g.fillStyle = 'rgba(233,227,214,0.55)';
        g.fillRect(0, 3, w, 1); g.fillRect(3, 0, 1, h);
        // garis nat TEAL (tepi bawah & kanan -> grid menyala kontinu saat di-tile)
        g.fillStyle = 'rgba(47,184,166,0.5)';
        g.fillRect(0, h - 2, w, 2); g.fillRect(w - 2, 0, 2, h);
        // baut kecil di sudut (detail)
        g.fillStyle = 'rgba(60,58,52,0.5)';
        for (const [bx, by] of [[10, 10], [w - 10, 10], [10, h - 10]]) { g.beginPath(); g.arc(bx, by, 1.6, 0, 6.283); g.fill(); }
    }, repX, repY);
}
// Mask emissive lantai: hanya garis nat TEAL yang menyala (dim).
function floorEmissive() {
    return makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#e6fbf5'; g.fillRect(0, h - 2, w, 2); g.fillRect(w - 2, 0, 2, h);
    }, 1, 1);
}
export function buildInteriorFloorMat(repX, repY) {
    // LAMBERT (bukan Phong): lantai MATTE — TANPA specular sama sekali supaya tak
    // memantulkan sorot lampu / silau (permintaan user 2026-07-18). Aksen teal
    // tetap dari emissiveMap (self-illum, bukan pantulan). NormalMap dihapus agar
    // nat tak menangkap kilau terang; kedalaman cukup dari nat gelap di diffuse.
    return new THREE.MeshLambertMaterial({
        map: floorDiffuse(repX, repY),
        emissiveMap: floorEmissive(),
        emissive: new THREE.Color(PAL.tech),
        emissiveIntensity: Math.min(EMISSIVE_MAX, 0.4),
    });
}

// =====================  DINDING  =====================
// Panel vertikal abu hangat terang + rim atas terang (siluet dari atas) + STRIP
// TEAL menyala di dekat puncak (terlihat dari kamera top-down oblique).
const STRIP_Y = 22, STRIP_H = 5;   // posisi strip di kanvas (dekat PUNCAK dinding)
function wallDiffuse() {
    return makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#918b7f'; g.fillRect(0, 0, w, h);                       // dasar abu hangat TERANG
        speckle(g, w, h, ['#978f83', '#8a8276', '#9c968a', '#847d71'], 150, 1, 4);
        // rim atas terang (bibir dinding = terlihat jelas dari atas)
        g.fillStyle = 'rgba(206,199,186,0.7)'; g.fillRect(0, 0, w, 6);
        g.fillStyle = 'rgba(40,38,34,0.6)'; g.fillRect(0, 6, w, 1);
        // nat panel vertikal (3 panel per sel)
        g.fillStyle = 'rgba(46,44,40,0.55)';
        g.fillRect((w / 3 | 0) - 1, 8, 2, h - 8); g.fillRect((2 * w / 3 | 0) - 1, 8, 2, h - 8);
        g.fillStyle = 'rgba(196,190,178,0.35)';                                // sorot di sisi nat
        g.fillRect((w / 3 | 0) + 1, 8, 1, h - 8); g.fillRect((2 * w / 3 | 0) + 1, 8, 1, h - 8);
        // STRIP TEAL menyala dekat puncak + housing gelap
        g.fillStyle = '#1c2b28'; g.fillRect(0, STRIP_Y - 2, w, STRIP_H + 4);
        g.fillStyle = TEAL; g.fillRect(0, STRIP_Y, w, STRIP_H);
        g.fillStyle = 'rgba(220,255,248,0.5)'; g.fillRect(0, STRIP_Y + 1, w, 1);
        // baut di baris panel
        g.fillStyle = 'rgba(56,54,48,0.6)';
        for (const bx of [10, w / 2, w - 10]) { g.beginPath(); g.arc(bx, h - 12, 2, 0, 6.283); g.fill(); }
    }, 1, 1);
}
// Mask emissive dinding: hanya STRIP TEAL yang menyala.
function wallEmissive() {
    return makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#eafff9'; g.fillRect(0, STRIP_Y, w, STRIP_H);
    }, 1, 1);
}
function wallHeight(g, w, h) {
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgb(180,180,180)'; g.fillRect(0, 0, w, 6);                  // rim atas menonjol
    g.fillStyle = 'rgb(92,92,92)';                                            // nat & alur strip = turun
    g.fillRect((w / 3 | 0) - 1, 8, 2, h - 8); g.fillRect((2 * w / 3 | 0) - 1, 8, 2, h - 8);
    g.fillRect(0, STRIP_Y - 2, w, STRIP_H + 4);
}

export function buildInteriorWallMat() {
    return new THREE.MeshPhongMaterial({
        map: wallDiffuse(),
        normalMap: makeNormalMap(128, 128, wallHeight, 2),
        emissiveMap: wallEmissive(),
        emissive: new THREE.Color(PAL.tech),
        emissiveIntensity: Math.min(EMISSIVE_MAX, 0.7),
        shininess: 18, specular: 0x24262a,
    });
}
