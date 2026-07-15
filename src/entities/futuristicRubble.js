// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Material dibuat di dalam constructor (bukan top-level) — MeshStandardMaterial
// di-warm via renderer.compile saat dunia stage dibangun (lihat futuristicDesk).
// Dipecah dari futuristicProps.js (2026-07-15).

export class Rubble {
    constructor() {
        this.group = new THREE.Group();
        this.group.userData.name = "Rubble";
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.8, roughness: 0.5 });
        const magentaGlow = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.5 });
        // Random jagged rocks
        for (let i = 0; i < 5; i++) {
            const r = 0.2 + Math.random() * 0.3;
            const geo = new THREE.DodecahedronGeometry(r, 0);
            const mat = darkMat.clone();
            mat.color.setHex(0x333333);
            const rock = new THREE.Mesh(geo, mat);
            rock.position.set((Math.random() - 0.5), r / 2 - 0.5, (Math.random() - 0.5));
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            this.group.add(rock);

            // Broken glowing wires
            if (i % 2 === 0) {
                const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, r * 2, 4);
                const wire = new THREE.Mesh(wireGeo, magentaGlow);
                wire.position.copy(rock.position);
                wire.rotation.z = Math.PI / 2;
                this.group.add(wire);
            }
        }
    }
    update(t) {}
}

export default Rubble;
