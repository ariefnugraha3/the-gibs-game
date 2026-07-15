// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// CATATAN: memakai MeshStandardMaterial (bukan Lambert/Basic) — shader-nya
// di-warm lewat renderer.compile saat dunia stage dibangun (stage 1&2 via
// warmupAll, stage 3 via runLeaveShop/campaignJumpToStage), jadi tanpa recompile.

export class FuturisticDesk {
    constructor() {
        this.group = new THREE.Group();
        this.buildDesk();
    }

    buildDesk() {
        // --- Materials ---
        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a24,
            metalness: 0.9,
            roughness: 0.3
        });

        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x002233,
            metalness: 0.5,
            roughness: 0.1,
            transparent: true,
            opacity: 0.4,
            emissive: 0x0044ff,
            emissiveIntensity: 0.3
        });

        const glowCyan = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 1.5
        });

        const glowPurple = new THREE.MeshStandardMaterial({
            color: 0xff00ff,
            emissive: 0xff00ff,
            emissiveIntensity: 1.5
        });

        const screenMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: 0x00aaff,
            emissiveIntensity: 0.8,
            roughness: 0.2
        });

        // --- Table Top (Glass with Metal Frame) ---
        const tableTopGeo = new THREE.BoxGeometry(6, 0.2, 3);
        const tableTop = new THREE.Mesh(tableTopGeo, glassMaterial);
        tableTop.position.y = 1.5;
        this.group.add(tableTop);

        // Glowing edge trim
        const edgeGeo = new THREE.BoxGeometry(6.05, 0.05, 3.05);
        const edge = new THREE.Mesh(edgeGeo, glowCyan);
        edge.position.y = 1.5;
        this.group.add(edge);

        // --- Legs (Angled metallic struts) ---
        const legGeo = new THREE.BoxGeometry(0.3, 1.5, 0.3);
        // Rotate legs to splay outward slightly for a futuristic look
        const legPositions = [
            { x: 2.5, z: 1.2, rotZ: -0.2, rotX: 0.2 },
            { x: -2.5, z: 1.2, rotZ: 0.2, rotX: 0.2 },
            { x: 2.5, z: -1.2, rotZ: -0.2, rotX: -0.2 },
            { x: -2.5, z: -1.2, rotZ: 0.2, rotX: -0.2 }
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, metalMaterial);
            leg.position.set(pos.x, 0.75, pos.z);
            leg.rotation.z = pos.rotZ;
            leg.rotation.x = pos.rotX;
            this.group.add(leg);

            // Glowing floor pads
            const padGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.1, 16);
            const pad = new THREE.Mesh(padGeo, glowPurple);
            pad.position.set(pos.x - (pos.rotZ * 2), 0.05, pos.z - (pos.rotX * 2));
            this.group.add(pad);
        });

        // --- Monitor (Floating/Hovering) ---
        const monitorStandGeo = new THREE.CylinderGeometry(0.1, 0.2, 0.8, 8);
        const monitorStand = new THREE.Mesh(monitorStandGeo, metalMaterial);
        monitorStand.position.set(0, 2.1, -1);
        this.group.add(monitorStand);

        const monitorBaseGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16);
        const monitorBase = new THREE.Mesh(monitorBaseGeo, metalMaterial);
        monitorBase.position.set(0, 1.8, -1);
        this.group.add(monitorBase);

        const monitorScreenGeo = new THREE.BoxGeometry(3, 1.5, 0.1);
        this.monitor = new THREE.Mesh(monitorScreenGeo, screenMaterial);
        this.monitor.position.set(0, 3, -1);
        this.monitor.rotation.x = -0.2; // Tilt slightly towards user
        this.group.add(this.monitor);

        // Monitor back glowing logo
        const monitorBackGlowGeo = new THREE.CircleGeometry(0.2, 16);
        const monitorBackGlow = new THREE.Mesh(monitorBackGlowGeo, glowCyan);
        monitorBackGlow.position.set(0, 3, -1.06);
        monitorBackGlow.rotation.y = Math.PI;
        this.group.add(monitorBackGlow);

        // --- Keyboard / Holographic Interface ---
        const keyboardGeo = new THREE.BoxGeometry(2, 0.05, 0.8);
        this.keyboard = new THREE.Mesh(keyboardGeo, glowCyan);
        this.keyboard.position.set(0, 1.65, 0.8);
        this.group.add(this.keyboard);

        // Keyboard keys (glowing grid)
        const keyGeo = new THREE.BoxGeometry(0.15, 0.02, 0.15);
        for(let x = -4; x <= 4; x++) {
            for(let z = -2; z <= 2; z++) {
                const key = new THREE.Mesh(keyGeo, metalMaterial);
                key.position.set(x * 0.22, 1.69, 0.8 + z * 0.22);
                this.group.add(key);
            }
        }
    }

    // Call this in your game loop to animate the desk
    update(time) {
        // Pulsing the holographic keyboard and monitor
        const pulse = (Math.sin(time * 3) * 0.5) + 0.5;
        
        if (this.keyboard) {
            this.keyboard.material.emissiveIntensity = 0.5 + pulse * 1.5;
        }
        if (this.monitor) {
            this.monitor.material.emissiveIntensity = 0.5 + pulse * 0.5;
        }

        // Slow rotation to show off the 3D model in-game
        this.group.rotation.y += 0.005;
    }
}

/**
 * Drop-in builder untuk "object meja" (dipakai furnitur meja stage 1/2/3).
 * Model lokal: lebar(x)=6, dalam(z)=3, permukaan meja di y≈1.5, kaki dari y=0.
 * Di-skala NON-UNIFORM agar tepat mengisi footprint (sx×sz) blocker & permukaan
 * meja duduk di ketinggian sy; berdiri di y=0 (siap ditaruh di posisi sel).
 * `update()` (putar/pulsa) TIDAK dipanggil (meja statis).
 * @param {number} sx  lebar dunia (sumbu X)
 * @param {number} sy  tinggi permukaan meja (= top blocker)
 * @param {number} sz  kedalaman dunia (sumbu Z)
 * @returns {THREE.Group}
 */
export function buildFuturisticDeskMesh(sx, sy, sz) {
    const d = new FuturisticDesk();
    d.group.scale.set(sx / 6, sy / 1.5, sz / 3);
    const g = new THREE.Group();
    g.add(d.group);
    return g;
}

export default FuturisticDesk;