// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Planter {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Planter";
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.3 });
        const cyanGlow = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5 });
        const magentaGlow = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.5 });
        const potGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.6, 8);
        const pot = new THREE.Mesh(potGeo, metalMat);
        pot.position.y = -0.2;
        this.group.add(pot);
        // Neon Plant
        const stemGeo = new THREE.CylinderGeometry(0.05, 0.1, 1, 6);
        const stem = new THREE.Mesh(stemGeo, cyanGlow);
        stem.position.y = 0.4;
        this.group.add(stem);
        // Leaves
        const leafGeo = new THREE.ConeGeometry(0.2, 0.5, 4);
        for (let i = 0; i < 4; i++) {
            const leaf = new THREE.Mesh(leafGeo, magentaGlow);
            leaf.position.y = 0.8;
            leaf.rotation.z = Math.PI / 4;
            leaf.rotation.y = (i / 4) * Math.PI * 2;
            leaf.position.x = Math.cos(leaf.rotation.y) * 0.2;
            leaf.position.z = Math.sin(leaf.rotation.y) * 0.2;
            this.group.add(leaf);
        }
    }
    update(t) {}
}

/**
 * Drop-in builder pot tanaman neon. Model lokal: diameter pot ≈1.0, tinggi
 * ≈1.55 (dasar pot di y=-0.5, daun puncak ≈y1.05). Di-skala NON-UNIFORM
 * mengisi footprint sx×sz dgn tinggi sy; berdiri di y=0. `update()` no-op.
 * Sejajar buildFuturisticDeskMesh.
 * @param {number} sx lebar dunia @param {number} sy tinggi @param {number} sz dalam
 * @returns {THREE.Group}
 */
export function buildFuturisticPlanterMesh(sx, sy, sz) {
    const p = new Planter();
    const scY = sy / 1.55;
    p.group.scale.set(sx / 1.0, scY, sz / 1.0);
    p.group.position.y = 0.5 * scY;   // dasar pot (y -0.5) -> y=0 dunia
    const g = new THREE.Group();
    g.add(p.group);
    return g;
}

export default Planter;
