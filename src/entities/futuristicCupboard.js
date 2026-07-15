import * as THREE from 'three';

export class FuturisticCupboard {
    constructor() {
        this.group = new THREE.Group();
        this.isOpen = false;
        this.doorAnimation = 0; // 0 = closed, 1 = open
        this.buildCupboard();
    }

    buildCupboard() {
        // --- Materials ---
        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x111118,
            metalness: 0.9,
            roughness: 0.3
        });

        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x0044ff,
            metalness: 0.5,
            roughness: 0.05,
            transparent: true,
            opacity: 0.3,
            emissive: 0x0022aa,
            emissiveIntensity: 0.2
        });

        this.glowCyan = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 1.5
        });

        this.glowMagenta = new THREE.MeshStandardMaterial({
            color: 0xff00ff,
            emissive: 0xff00ff,
            emissiveIntensity: 1.5
        });

        this.internalLight = new THREE.PointLight(0x00ffff, 0, 4);
        this.internalLight.position.set(0, 1.5, 0.5);
        this.group.add(this.internalLight);

        // --- Main Body (Hollow Box) ---
        // We build a hollow box by creating 4 walls and a back, leaving the front open.
        const wallGeo = new THREE.BoxGeometry(2, 4, 0.2);
        
        // Back
        const back = new THREE.Mesh(wallGeo, metalMaterial);
        back.position.z = -0.9;
        this.group.add(back);

        // Left Wall
        const sideWallGeo = new THREE.BoxGeometry(0.2, 4, 2);
        const leftWall = new THREE.Mesh(sideWallGeo, metalMaterial);
        leftWall.position.x = -0.9;
        this.group.add(leftWall);

        // Right Wall
        const rightWall = new THREE.Mesh(sideWallGeo, metalMaterial);
        rightWall.position.x = 0.9;
        this.group.add(rightWall);

        // Top & Bottom
        const topBottomGeo = new THREE.BoxGeometry(2, 0.2, 2);
        const top = new THREE.Mesh(topBottomGeo, metalMaterial);
        top.position.y = 1.9;
        this.group.add(top);

        const bottom = new THREE.Mesh(topBottomGeo, metalMaterial);
        bottom.position.y = -1.9;
        this.group.add(bottom);

        // --- Internal Shelves & Items ---
        const shelfGeo = new THREE.BoxGeometry(1.8, 0.05, 1.8);
        const itemGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
        const vialGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);

        for (let i = 0; i < 3; i++) {
            const y = -1 + i * 1.2;
            
            // Shelf
            const shelf = new THREE.Mesh(shelfGeo, metalMaterial);
            shelf.position.y = y;
            this.group.add(shelf);

            // Glowing shelf edge
            const shelfEdge = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.02, 0.05), 
                this.glowCyan
            );
            shelfEdge.position.set(0, y + 0.03, 0.9);
            this.group.add(shelfEdge);

            // Random items
            if (i === 0) {
                // Server blocks
                for(let j=0; j<3; j++) {
                    const server = new THREE.Mesh(itemGeo, metalMaterial);
                    server.position.set(-0.5 + j*0.5, y + 0.25, 0);
                    this.group.add(server);
                    const serverGlow = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.05, 0.31), this.glowMagenta);
                    serverGlow.position.set(-0.5 + j*0.5, y + 0.1, 0);
                    this.group.add(serverGlow);
                }
            } else if (i === 1) {
                // Vials
                for(let j=0; j<4; j++) {
                    const vial = new THREE.Mesh(vialGeo, this.glowCyan);
                    vial.position.set(-0.6 + j*0.4, y + 0.25, 0);
                    this.group.add(vial);
                }
            } else {
                 // Glowing artifact
                 const artifact = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), this.glowMagenta);
                 artifact.position.set(0, y + 0.3, 0);
                 artifact.name = "artifact";
                 this.group.add(artifact);
            }
        }

        // --- Sliding Glass Door ---
        // We put the door in its own group to slide it easily
        this.doorGroup = new THREE.Group();
        
        const doorFrameGeo = new THREE.BoxGeometry(2.1, 4.1, 0.1);
        const doorFrame = new THREE.Mesh(doorFrameGeo, metalMaterial);
        doorFrame.position.z = 0.05;
        this.doorGroup.add(doorFrame);

        const doorGlassGeo = new THREE.BoxGeometry(1.8, 3.8, 0.05);
        const doorGlass = new THREE.Mesh(doorGlassGeo, glassMaterial);
        doorGlass.position.z = 0.12;
        this.doorGroup.add(doorGlass);

        // Biometric Touchpad on door
        const padGeo = new THREE.BoxGeometry(0.2, 0.2, 0.03);
        this.pad = new THREE.Mesh(padGeo, this.glowMagenta);
        this.pad.position.set(0.75, -1.5, 0.15);
        this.doorGroup.add(this.pad);

        // Position the whole door at the front
        this.doorGroup.position.x = 1.1; // Start off-center to look closed
        this.group.add(this.doorGroup);

        // --- Base / Anti-Gravity Pads ---
        const baseGeo = new THREE.BoxGeometry(2.2, 0.3, 2.2);
        const base = new THREE.Mesh(baseGeo, metalMaterial);
        base.position.y = -2.15;
        this.group.add(base);

        const padPos = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]];
        padPos.forEach(p => {
            const hoverPad = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16),
                this.glowCyan
            );
            hoverPad.position.set(p[0], -2.35, p[1]);
            this.group.add(hoverPad);
        });
    }

    toggleDoor() {
        this.isOpen = !this.isOpen;
    }

    // Call this in your game loop to animate the cupboard
    update(time) {
        // Smoothly animate door sliding
        const targetX = this.isOpen ? 2.3 : 1.1; // 2.3 = open, 1.1 = closed
        this.doorGroup.position.x += (targetX - this.doorGroup.position.x) * 0.1;

        // Toggle internal light based on door state
        const targetIntensity = this.isOpen ? 2 : 0;
        this.internalLight.intensity += (targetIntensity - this.internalLight.intensity) * 0.1;

        // Pulse the touchpad (Red when locked, Green/Cyan when open)
        const pulse = (Math.sin(time * 5) * 0.5) + 0.5;
        if (this.isOpen) {
            this.pad.material = this.glowCyan;
            this.pad.material.emissiveIntensity = 1.0 + pulse * 0.5;
        } else {
            this.pad.material = this.glowMagenta;
            this.pad.material.emissiveIntensity = 0.5 + pulse * 1.0;
        }

        // Hovering base effect
        this.group.position.y = Math.sin(time * 2) * 0.05;

        // Rotate the artifact if it exists
        const artifact = this.group.getObjectByName("artifact");
        if (artifact) {
            artifact.rotation.x += 0.02;
            artifact.rotation.y += 0.01;
        }
    }
}