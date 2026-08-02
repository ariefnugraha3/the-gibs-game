// Cahaya dasar yang dipakai SEMUA scene: ambient + hemisphere + directional
// (matahari/bulan apokaliptik, pembawa bayangan) + rim biru. Preset intensitas
// per-lingkungan (outdoor/indoor) hanya menyentuh uniform — tanpa recompile.

import { setQualityLightRef, renderer, viewCam } from '../core/renderer.js';

export let ambLight = null, hemiLight = null, dirLight = null, rimLight = null;

export function createBaseLights(scene) {
    // Ambient bernuansa hangat-kusam + cahaya bulan kemerahan dari horizon
    ambLight = new THREE.AmbientLight(0xffd9b3, 0.3);
    scene.add(ambLight);
    hemiLight = new THREE.HemisphereLight(0x4a2c1a, 0x0a0a12, 0.4); // langit oranye / tanah gelap
    scene.add(hemiLight);
    dirLight = new THREE.DirectionalLight(0xff7b3a, 0.7);          // sinar oranye matahari/bulan apokaliptik
    dirLight.position.set(-220, 260, -280);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -320; dirLight.shadow.camera.right = 320;
    dirLight.shadow.camera.top = 320; dirLight.shadow.camera.bottom = -320;
    dirLight.shadow.camera.near = 20; dirLight.shadow.camera.far = 1200;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 1.5;
    scene.add(dirLight);
    scene.add(dirLight.target);   // target ikut scene agar bayangan bisa mengikuti player
    setQualityLightRef(dirLight); // applyQuality (renderer.js) mengatur shadow map dirLight

    // Rim biru dingin dari arah berlawanan: memisahkan siluet robot dari tanah
    rimLight = new THREE.DirectionalLight(0x5a76c8, 0.22);
    rimLight.position.set(300, 200, 350);
    scene.add(rimLight);
}

// Preset kabut + intensitas cahaya per lingkungan (uniform saja — tanpa recompile)
export const LIGHT_PRESETS = {
    outdoor: { fogNear: 220, fogFar: 1700, amb: 0.3, hemi: 0.4, dir: 0.7 },   // taman / jalan raya
    indoor: { fogNear: 50, fogFar: 700, amb: 0.34, hemi: 0.42, dir: 0.5 },   // interior TERANG futuristik (dicerahkan 2026-07-18)
    night: { fogNear: 160, fogFar: 1150, amb: 0.15, hemi: 0.2, dir: 0.32 },  // taman malam (campaign stage 3)
};

export function applyLightPreset(scene, name) {
    const p = LIGHT_PRESETS[name];
    scene.fog.near = p.fogNear; scene.fog.far = p.fogFar;
    if (ambLight) ambLight.intensity = p.amb;
    if (hemiLight) hemiLight.intensity = p.hemi;
    if (dirLight) dirLight.intensity = p.dir;
}

// ===== LAMPU MILIK STAGE: hanya stage AKTIF yang menyala =====
// (2026-07-26, keluhan user "stage 4 masih agak berat".) Keenam dunia campaign
// + survival hidup berdampingan di SATU scene, jadi SEMUA lampu ruangan/jalannya
// (18+12+12+12) ikut terhitung sekaligus: three merender maju, shader Lambert/Phong
// MELOOPING setiap point light untuk SETIAP FRAGMEN — 57 iterasi per piksel walau
// 45 di antaranya milik stage yang jauh & intensitasnya 0. Paling terasa di stage 4
// yang layarnya penuh bidang tanah raksasa (6000x3000) + tumpukan trotoar/marka.
//
// `projectObject` three MELEWATI objek `visible === false` (lampu tak terkumpul),
// jadi mematikan lampu stage non-aktif memotong NUM_POINT_LIGHTS jadi ~seperempat.
// Lampu GLOBAL (kolam ledakan effects.js, kilat moncong weapons.js) TIDAK didaftar
// di sini — selalu menyala.
//
// Konsekuensinya jumlah light BERUBAH saat pindah stage = shader rekompilasi. Itu
// sebabnya `precompileStageLightSets()` (dipanggil sekali setelah keenam dunia
// campaign dibangun) mengompilasi program untuk SETIAP konfigurasi lampu di muka,
// jadi transisi stage tetap tanpa hitch — aturan "tanpa rekompilasi saat main"
// tetap dipegang.
const stageLights = [];      // [{ key, light }]
let activeLightKey = null;

export function registerStageLight(key, light) {
    stageLights.push({ key, light });
    if (activeLightKey !== null) light.visible = (key === activeLightKey);
}

export function setActiveStageLights(key) {
    if (!key || key === activeLightKey) return;
    activeLightKey = key;
    for (const e of stageLights) e.light.visible = (e.key === key);
}

// Kompilasi program shader untuk SETIAP konfigurasi lampu stage, sekali, saat
// dunia campaign baru dibangun (masih di layar loading). `renderer.compile` hanya
// menelusuri objek yang TERLIHAT, jadi tiap putaran cuma menyentuh material stage
// itu. Tanpa ini, hitch-nya pindah ke frame pertama tiap transisi stage.
export function precompileStageLightSets(scene) {
    if (!renderer || !viewCam || !stageLights.length) return 0;
    const restore = activeLightKey;
    const keys = [...new Set(stageLights.map(e => e.key))];
    for (const k of keys) {
        setActiveStageLights(k);
        renderer.compile(scene, viewCam);
    }
    activeLightKey = null;                 // paksa setActiveStageLights menerapkan lagi
    setActiveStageLights(restore || keys[0]);
    return keys.length;
}

export const stageLightsDebug = () => ({
    active: activeLightKey,
    total: stageLights.length,
    visible: stageLights.reduce((n, e) => n + (e.light.visible ? 1 : 0), 0),
    keys: [...new Set(stageLights.map(e => e.key))],
});

// Kamera bayangan (ortho 640x640) digeser mengikuti player tiap frame
export function updateShadowFollow(camera) {
    dirLight.position.set(camera.position.x - 220, 260, camera.position.z - 280);
    dirLight.target.position.set(camera.position.x, 0, camera.position.z);
}
