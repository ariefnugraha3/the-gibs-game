// Cahaya dasar yang dipakai SEMUA scene: ambient + hemisphere + directional
// (matahari/bulan apokaliptik, pembawa bayangan) + rim biru. Preset intensitas
// per-lingkungan (outdoor/indoor) hanya menyentuh uniform — tanpa recompile.

import { setQualityLightRef } from '../core/renderer.js';

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

    // Rim biru dingin dari arah berlawanan: memisahkan siluet zombie dari tanah
    rimLight = new THREE.DirectionalLight(0x5a76c8, 0.22);
    rimLight.position.set(300, 200, 350);
    scene.add(rimLight);
}

// Preset kabut + intensitas cahaya per lingkungan (uniform saja — tanpa recompile)
export const LIGHT_PRESETS = {
    outdoor: { fogNear: 220, fogFar: 1700, amb: 0.3, hemi: 0.4, dir: 0.7 },   // taman / jalan raya
    indoor: { fogNear: 50, fogFar: 700, amb: 0.16, hemi: 0.22, dir: 0.35 },  // interior gelap mencekam
    night: { fogNear: 160, fogFar: 1150, amb: 0.15, hemi: 0.2, dir: 0.32 },  // taman malam (campaign stage 3)
};

export function applyLightPreset(scene, name) {
    const p = LIGHT_PRESETS[name];
    scene.fog.near = p.fogNear; scene.fog.far = p.fogFar;
    if (ambLight) ambLight.intensity = p.amb;
    if (hemiLight) hemiLight.intensity = p.hemi;
    if (dirLight) dirLight.intensity = p.dir;
}

// Kamera bayangan (ortho 640x640) digeser mengikuti player tiap frame
export function updateShadowFollow(camera) {
    dirLight.position.set(camera.position.x - 220, 260, camera.position.z - 280);
    dirLight.target.position.set(camera.position.x, 0, camera.position.z);
}
