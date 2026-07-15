// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// CATATAN: memakai MeshStandardMaterial (bukan Lambert/Basic) — shader-nya
// di-warm lewat renderer.compile saat dunia stage 4 dibangun (lihat FuturisticSUV
// & campaignJumpToStage/runLeaveShop), jadi tanpa recompile mid-game.

export class FuturisticSedan {
    constructor(bodyColor = null) {
        this.bodyColor = bodyColor;
        this.group = new THREE.Group();
        this.buildCar();
    }

    buildCar() {
        // --- Materials ---
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.bodyColor != null ? this.bodyColor : 0x1a1a2e,
            metalness: 0.9,
            roughness: 0.3
        });

        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x0044ff,
            metalness: 0.5,
            roughness: 0.1,
            transparent: true,
            opacity: 0.6,
            emissive: 0x0022aa,
            emissiveIntensity: 0.5
        });

        const glowMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 2
        });

        const redGlowMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0044,
            emissive: 0xff0044,
            emissiveIntensity: 2
        });

        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x050505,
            metalness: 0.8,
            roughness: 0.2
        });

        // --- Main Body (Sleek Extruded Shape) ---
        const shape = new THREE.Shape();
        shape.moveTo(2.2, -0.5);
        shape.lineTo(-2.2, -0.5);
        shape.lineTo(-2.4, 0);
        shape.lineTo(-1.8, 0.3);
        shape.quadraticCurveTo(-1, 0.9, 0.2, 0.9);
        shape.quadraticCurveTo(1.2, 0.8, 1.8, 0.2);
        shape.lineTo(2.2, -0.5);

        const extrudeSettings = {
            depth: 1.8,
            bevelEnabled: true,
            bevelThickness: 0.2,
            bevelSize: 0.2,
            bevelSegments: 5,
            steps: 1
        };

        const bodyGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        bodyGeo.center();
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        this.group.add(body);

        // --- Glass Canopy ---
        // Cloning the body geometry, scaling it down slightly, and pushing it up
        const glassGeo = bodyGeo.clone();
        glassGeo.scale(0.8, 0.7, 0.75);
        glassGeo.translate(0, 0.15, 0);
        const glass = new THREE.Mesh(glassGeo, glassMaterial);
        this.group.add(glass);

        // --- Wheels (Cylinders) ---
        // Rotate cylinders 90 degrees on X to lay them flat along the Z axis
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 24);
        wheelGeo.rotateX(Math.PI / 2);
        
        const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12);
        hubGeo.rotateX(Math.PI / 2);

        const wheelPositions = [
            [-1.4, -0.5, 0.9], [1.3, -0.5, 0.9],   // Right side
            [-1.4, -0.5, -0.9], [1.3, -0.5, -0.9]  // Left side
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMaterial);
            wheel.position.set(...pos);
            this.group.add(wheel);

            const hub = new THREE.Mesh(hubGeo, glowMaterial);
            hub.position.set(...pos);
            this.group.add(hub);
        });

        // --- Lights ---
        const headlightGeo = new THREE.BoxGeometry(0.1, 0.1, 1.4);
        const headlight = new THREE.Mesh(headlightGeo, glowMaterial);
        headlight.position.set(-2.3, -0.1, 0);
        this.group.add(headlight);

        const taillightGeo = new THREE.BoxGeometry(0.1, 0.1, 1.4);
        const taillight = new THREE.Mesh(taillightGeo, redGlowMaterial);
        taillight.position.set(2.3, -0.1, 0);
        this.group.add(taillight);

        // --- Spoiler ---
        const spoilerGeo = new THREE.BoxGeometry(0.3, 0.1, 1.8);
        const spoiler = new THREE.Mesh(spoilerGeo, bodyMaterial);
        spoiler.position.set(2.1, 0.6, 0);
        this.group.add(spoiler);

        const spoilerSupportGeo = new THREE.BoxGeometry(0.1, 0.3, 1.8);
        const spoilerSupport = new THREE.Mesh(spoilerSupportGeo, bodyMaterial);
        spoilerSupport.position.set(2.1, 0.4, 0);
        this.group.add(spoilerSupport);

        // --- Underglow ---
        const underglowGeo = new THREE.BoxGeometry(3.5, 0.05, 1.6);
        const underglow = new THREE.Mesh(underglowGeo, glowMaterial);
        underglow.position.set(0, -0.6, 0);
        this.group.add(underglow);
    }

    // Call this in your game loop to animate the car
    update(time) {
        // Gentle hover effect
        this.group.position.y = Math.sin(time * 2) * 0.1;
        // Slow rotation to show off the 3D model
        this.group.rotation.y += 0.01;
    }
}

/**
 * Drop-in builder untuk "object mobil" cover (sejajar buildFuturisticSUVMesh).
 * Mengembalikan THREE.Group: panjang bodi di-orient ke sumbu Z (siap di-yaw lewat
 * group.rotation.y) dan berdiri di y=0. `update()` TIDAK dipanggil (mobil statis).
 * @param {number} [scale=7]         1 unit-model ≈ `scale` u-dunia (1 m ≈ 7 u)
 * @param {number|null} [bodyColor]  warna cat bodi (null = default gelap)
 * @returns {THREE.Group}
 */
export function buildFuturisticSedanMesh(scale = 7, bodyColor = null) {
    const sed = new FuturisticSedan(bodyColor);
    sed.group.rotation.y = Math.PI / 2;   // panjang bodi (X model) -> sumbu Z dunia
    sed.group.scale.setScalar(scale);
    sed.group.position.y = 0.9 * scale;   // dasar roda (y −0.9 lokal) -> y=0 dunia
    const g = new THREE.Group();
    g.add(sed.group);
    return g;
}

export default FuturisticSedan;