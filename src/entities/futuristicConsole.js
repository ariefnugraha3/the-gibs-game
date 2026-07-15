// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Console {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Console";
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.3 });
        const cyanGlow = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5 });
        const magentaGlow = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.5 });
        const baseGeo = new THREE.BoxGeometry(1.5, 1, 0.5);
        const base = new THREE.Mesh(baseGeo, metalMat);
        this.group.add(base);
        // Screen
        const screenGeo = new THREE.PlaneGeometry(1.4, 0.8);
        this.screen = new THREE.Mesh(screenGeo, cyanGlow);
        this.screen.position.set(0, 0.1, 0.26);
        this.group.add(this.screen);
        // Base Glow
        const padGeo = new THREE.BoxGeometry(1.6, 0.05, 0.6);
        const pad = new THREE.Mesh(padGeo, magentaGlow);
        pad.position.y = -0.5;
        this.group.add(pad);
    }
    update(t) {
        this.screen.material.emissiveIntensity = 0.5 + (Math.sin(t * 5) * 0.5 + 0.5);
    }
}

/**
 * Drop-in builder konsol/terminal. Model lokal: lebar(x)≈1.6, dalam(z)≈0.6,
 * tinggi ≈1.025 (dasar pad glow di y=-0.525). Di-skala NON-UNIFORM mengisi
 * footprint sx×sz dgn tinggi sy; berdiri di y=0. Layar menghadap +z.
 * `update()` (pulsa layar) TIDAK dipanggil (statis). Lihat buildFuturisticDeskMesh.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticConsoleMesh(sx, sy, sz) {
    const c = new Console();
    const scY = sy / 1.025;
    c.group.scale.set(sx / 1.6, scY, sz / 0.6);
    c.group.position.y = 0.525 * scY;   // dasar (pad y -0.525) -> y=0 dunia
    const g = new THREE.Group();
    g.add(c.group);
    return g;
}

export default Console;
