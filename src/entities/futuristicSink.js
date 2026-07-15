// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Sink {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Sink";
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.3 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.8, roughness: 0.5 });
        const cyanGlow = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5 });
        // Basin
        const basinGeo = new THREE.BoxGeometry(0.8, 0.3, 0.5);
        const basin = new THREE.Mesh(basinGeo, metalMat);
        basin.position.y = 0.5;
        this.group.add(basin);
        // Water (Holographic)
        const waterGeo = new THREE.PlaneGeometry(0.6, 0.3);
        this.water = new THREE.Mesh(waterGeo, cyanGlow);
        this.water.rotation.x = -Math.PI / 2;
        this.water.position.y = 0.55;
        this.group.add(this.water);
        // Faucet
        const faucetGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
        const faucet = new THREE.Mesh(faucetGeo, darkMat);
        faucet.position.set(0, 0.8, -0.15);
        this.group.add(faucet);
        // Pedestal
        const pedGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.5, 8);
        const ped = new THREE.Mesh(pedGeo, metalMat);
        ped.position.y = 0.1;
        this.group.add(ped);
    }
    update(t) {
        this.water.material.emissiveIntensity = 1.0 + Math.sin(t * 10) * 0.5;
    }
}

export default Sink;
