// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Bench {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Bench";
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.3 });
        const cyanGlow = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5 });
        const seatGeo = new THREE.BoxGeometry(2, 0.1, 0.5);
        const seat = new THREE.Mesh(seatGeo, metalMat);
        seat.position.y = 0.5;
        this.group.add(seat);
        // Hover pads instead of legs
        const padGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
        for (let i = -1; i <= 1; i += 2) {
            const pad = new THREE.Mesh(padGeo, cyanGlow);
            pad.position.set(i * 0.7, 0.2, 0);
            this.group.add(pad);
        }
    }
    update(t) { this.group.position.y = Math.sin(t * 2) * 0.05; }
}

export default Bench;
