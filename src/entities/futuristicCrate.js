// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Crate {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Crate";
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.3 });
        const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const mesh = new THREE.Mesh(geo, metalMat);
        this.group.add(mesh);
        // Glowing edges
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x00ffff }));
        this.group.add(edges);
    }
    update(t) { this.group.rotation.y += 0.01; }
}

export default Crate;
