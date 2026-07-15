// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Stall {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Stall";
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.3 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.8, roughness: 0.5 });
        const cyanGlow = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5 });
        const magentaGlow = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.5 });
        // Counter
        const counterGeo = new THREE.BoxGeometry(2, 1, 1);
        const counter = new THREE.Mesh(counterGeo, metalMat);
        counter.position.y = 0;
        this.group.add(counter);
        // Floating Roof
        const roofGeo = new THREE.BoxGeometry(2.2, 0.1, 1.2);
        const roof = new THREE.Mesh(roofGeo, darkMat);
        roof.position.y = 1.5;
        this.group.add(roof);
        // Support beams (glowing)
        const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        for (let x = -1; x <= 1; x += 2) {
            for (let z = -1; z <= 1; z += 2) {
                const beam = new THREE.Mesh(beamGeo, cyanGlow);
                beam.position.set(x * 0.9, 0.75, z * 0.4);
                this.group.add(beam);
            }
        }
        // Sign
        const signGeo = new THREE.PlaneGeometry(1.5, 0.4);
        const sign = new THREE.Mesh(signGeo, magentaGlow);
        sign.position.set(0, 1.2, 0.51);
        this.group.add(sign);
    }
    update(t) {}
}

/**
 * Drop-in builder kios/sekat. Model lokal: lebar(x)≈2.2, dalam(z)≈1.2, tinggi
 * ≈2.05 (dasar counter di y=-0.5, atap ≈y1.55). Di-skala NON-UNIFORM mengisi
 * footprint sx×sz dgn tinggi sy; berdiri di y=0. `update()` no-op. Sejajar
 * buildFuturisticDeskMesh.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticStallMesh(sx, sy, sz) {
    const s = new Stall();
    const scY = sy / 2.05;
    s.group.scale.set(sx / 2.2, scY, sz / 1.2);
    s.group.position.y = 0.5 * scY;   // dasar counter (y -0.5) -> y=0 dunia
    const g = new THREE.Group();
    g.add(s.group);
    return g;
}

export default Stall;
