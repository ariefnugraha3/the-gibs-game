// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Sofa {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Sofa";
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.8, roughness: 0.5 });
        const magentaGlow = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.5 });
        const baseGeo = new THREE.BoxGeometry(2.5, 0.5, 1);
        const base = new THREE.Mesh(baseGeo, darkMat);
        base.position.y = 0.25;
        this.group.add(base);
        // Backrest
        const backGeo = new THREE.BoxGeometry(2.5, 1, 0.2);
        const back = new THREE.Mesh(backGeo, darkMat);
        back.position.set(0, 0.75, -0.4);
        this.group.add(back);
        // Cushions (Glowing)
        const cushionGeo = new THREE.BoxGeometry(0.7, 0.2, 0.8);
        for (let i = -1; i <= 1; i++) {
            const c = new THREE.Mesh(cushionGeo, magentaGlow);
            c.position.set(i * 0.8, 0.6, 0.1);
            this.group.add(c);
        }
    }
    update(t) {}
}

export default Sofa;
