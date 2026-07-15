import * as THREE from 'three';

export class FuturisticMeetingTable {
    constructor() {
        this.group = new THREE.Group();
        this.buildTable();
    }

    buildTable() {
        // --- Materials ---
        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a22,
            metalness: 0.9,
            roughness: 0.2
        });

        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x001122,
            metalness: 0.5,
            roughness: 0.1,
            transparent: true,
            opacity: 0.4,
            emissive: 0x0044ff,
            emissiveIntensity: 0.2
        });

        const glowCyan = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 1.5
        });

        const glowMagenta = new THREE.MeshStandardMaterial({
            color: 0xff00ff,
            emissive: 0xff00ff,
            emissiveIntensity: 1.5
        });

        const holoMaterial = new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            emissive: 0x00aaff,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8
        });

        // --- Table Top (Rounded Rectangle Extrude) ---
        const w = 7, h = 3.5, r = 0.8;
        const shape = new THREE.Shape();
        shape.moveTo(-w/2 + r, -h/2);
        shape.lineTo(w/2 - r, -h/2);
        shape.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
        shape.lineTo(w/2, h/2 - r);
        shape.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
        shape.lineTo(-w/2 + r, h/2);
        shape.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
        shape.lineTo(-w/2, -h/2 + r);
        shape.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);

        const extrudeSettings = {
            depth: 0.3,
            bevelEnabled: true,
            bevelThickness: 0.1,
            bevelSize: 0.1,
            bevelSegments: 4
        };

        const tableTopGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        tableTopGeo.center();
        const tableTop = new THREE.Mesh(tableTopGeo, glassMaterial);
        tableTop.position.y = 1.5;
        this.group.add(tableTop);

        // Glowing edge trim
        const edgeGeo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.05,
            bevelEnabled: false
        });
        edgeGeo.center();
        const edge = new THREE.Mesh(edgeGeo, glowCyan);
        edge.position.y = 1.5;
        edge.scale.set(1.02, 1.02, 1.2); // Slightly larger and thinner
        this.group.add(edge);

        // --- Central Pedestal Base ---
        const baseGeo = new THREE.CylinderGeometry(1.5, 2, 0.4, 8); // Octagonal base
        const base = new THREE.Mesh(baseGeo, metalMaterial);
        base.position.y = 0.2;
        this.group.add(base);

        const pillarGeo = new THREE.CylinderGeometry(0.4, 0.6, 1.2, 8);
        const pillar = new THREE.Mesh(pillarGeo, metalMaterial);
        pillar.position.y = 0.9;
        this.group.add(pillar);

        // --- Central Holographic Projector ---
        const projectorGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.2, 16);
        const projector = new THREE.Mesh(projectorGeo, metalMaterial);
        projector.position.y = 1.45;
        this.group.add(projector);

        const emitterGeo = new THREE.CircleGeometry(0.4, 16);
        const emitter = new THREE.Mesh(emitterGeo, glowMagenta);
        emitter.rotation.x = -Math.PI / 2;
        emitter.position.y = 1.56;
        this.group.add(emitter);

        // Holographic Cone Beam
        const coneGeo = new THREE.ConeGeometry(1, 2, 16, 1, true);
        const cone = new THREE.Mesh(coneGeo, holoMaterial);
        cone.position.y = 2.5;
        cone.rotation.x = Math.PI; // Pointing up
        this.group.add(cone);

        // Floating Holographic Data Sphere
        const holoSphereGeo = new THREE.IcosahedronGeometry(0.6, 0);
        this.holoSphere = new THREE.Mesh(holoSphereGeo, glowCyan);
        this.holoSphere.position.y = 2.8;
        this.group.add(this.holoSphere);

        // --- User Terminals (Glowing panels on the edge) ---
        const terminalGeo = new THREE.BoxGeometry(0.8, 0.05, 0.4);
        // 4 terminals on the long sides, 2 on the short sides
        const terminalPositions = [
            [-2.5, 1.7, 1.65], [0, 1.7, 1.65], [2.5, 1.7, 1.65], // Front
            [-2.5, 1.7, -1.65], [0, 1.7, -1.65], [2.5, 1.7, -1.65], // Back
            [-3.35, 1.7, 0], [3.35, 1.7, 0] // Sides
        ];

        terminalPositions.forEach(pos => {
            const terminal = new THREE.Mesh(terminalGeo, glowCyan);
            terminal.position.set(pos[0], pos[1], pos[2]);
            this.group.add(terminal);
        });
    }

    // Call this in your game loop to animate the table
    update(time) {
        // Slowly rotate the entire table to show off the 3D model
        this.group.rotation.y += 0.003;

        // Spin the floating hologram
        if (this.holoSphere) {
            this.holoSphere.rotation.x += 0.02;
            this.holoSphere.rotation.y += 0.02;
            // Hover effect for the sphere
            this.holoSphere.position.y = 2.8 + Math.sin(time * 2) * 0.15;
        }

        // Pulse the terminals and edge trim
        const pulse = (Math.sin(time * 4) * 0.5) + 0.5;
        this.group.traverse((child) => {
            if (child.isMesh && child.material.emissiveIntensity > 0) {
                if (child.material.color.getHex() === 0x00ffff) {
                    child.material.emissiveIntensity = 0.5 + pulse * 1.5;
                }
            }
        });
    }
}