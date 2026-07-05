// Registri animasi dekoratif dunia — TIDAK menyentuh gameplay. Scene builder
// mendaftarkan objeknya (api Monas, semburan air, sprite kebakaran, lampu
// koridor berkedip, dst); satu updateWorldDecor() menganimasikan semuanya.
// Berjalan tiap frame BAHKAN saat pause (kontrak lama updateDecor).

export const waterJets = [];     // kerucut air mancur (denyut pelan)
export const fireSprites = [];   // pijar api gedung terbakar (billboard aditif)

export let flameLight = null, flameGlow = null;   // api Monas (survival)
export let burningMat = null;                     // fasad gedung terbakar
export let waterTex = null;                       // riak air (offset dianimasikan)
export let skyDome = null;                        // kubah langit + bulan (ikut player)
export let s1FlickerLight = null;                 // lampu koridor gedung (campaign stage 1)

export const setFlameLight = (l) => { flameLight = l; };
export const setFlameGlow = (g) => { flameGlow = g; };
export const setBurningMat = (m) => { burningMat = m; };
export const setWaterTex = (t) => { waterTex = t; };
export const setSkyDome = (d) => { skyDome = d; };
export const setS1FlickerLight = (l) => { s1FlickerLight = l; };

export function updateWorldDecor(dt, T, camera) {
    // Kubah langit selalu berpusat di player (peta campaign membentang jauh)
    if (skyDome) { skyDome.position.x = camera.position.x; skyDome.position.z = camera.position.z; }
    if (flameLight) flameLight.intensity = 1.1 + Math.sin(T * 6.1) * 0.12 + Math.sin(T * 17) * 0.06;
    if (s1FlickerLight) {   // lampu koridor gedung berkedip-kedip (campaign stage 1)
        const fl = Math.sin(T * 13) * Math.sin(T * 7.3) > 0.55 ? 0.12 : 0.85;
        s1FlickerLight.intensity += (fl - s1FlickerLight.intensity) * Math.min(1, dt * 22);
    }
    if (flameGlow) {
        const s = 30 + Math.sin(T * 5.2) * 2.4 + Math.sin(T * 13) * 1.2;
        flameGlow.scale.set(s, s, 1);
    }
    if (burningMat) burningMat.emissiveIntensity = 1.1 + Math.sin(T * 5.3) * 0.35 + Math.sin(T * 13) * 0.15;
    for (let i = 0; i < fireSprites.length; i++) {
        const f = fireSprites[i];
        f.sprite.material.opacity = 0.42 + Math.abs(Math.sin(T * 3.7 + f.phase)) * 0.3
            + Math.sin(T * 11 + f.phase * 3) * 0.08;
    }
    for (let i = 0; i < waterJets.length; i++) {
        const j = waterJets[i];
        j.scale.y = 1 + Math.sin(T * 2.2 + i * 2.1) * 0.12;
        j.scale.x = j.scale.z = 1 + Math.sin(T * 3.1 + i) * 0.05;
    }
    if (waterTex) { waterTex.offset.x = T * 0.018; waterTex.offset.y = T * 0.011; }
}
