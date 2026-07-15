import * as THREE from 'three';

export class FuturisticChair {
    constructor() {
        this.group = new THREE.Group();
        this.buildChair();
    }

    buildChair() {
        // --- Materials ---
        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x121218,
            metalness: 0.9,
            roughness: 0.3
        });

        const seatMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e,
            metalness: 0.6,
            roughness: 0.4
        });

        const glowCyan = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 1.5
        });

        const glowOrange = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff6600,
            emissiveIntensity: 1.5
        });

        // --- 5-Star Base ---
        const baseGroup = new THREE.Group();
        const legGeo = new THREE.BoxGeometry(0.9, 0.12, 0.25);
        const wheelSphereGeo = new THREE.SphereGeometry(0.15, 16, 16);

        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            
            // Leg strut
            const leg = new THREE.Mesh(legGeo, metalMaterial);
            leg.position.x = 0.45;
            leg.position.y = 0.06;
            leg.rotation.y = angle;
            // Tilt down slightly towards the floor
            leg.rotation.z = -0.2; 
            
            // Wheel (Hover caster)
            const wheel = new THREE.Mesh(wheelSphereGeo, glowOrange);
            wheel.position.set(0.9, -0.05, 0);
            
            // Group them so we can rotate the whole arm easily
            const armGroup = new THREE.Group();
            armGroup.add(leg);
            armGroup.add(wheel);
            armGroup.rotation.y = angle;
            baseGroup.add(armGroup);
        }
        this.group.add(baseGroup);

        // --- Center Pillar (Hydraulic) ---
        const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 16);
        const pillar = new THREE.Mesh(pillarGeo, metalMaterial);
        pillar.position.y = 0.6;
        this.group.add(pillar);

        // Glowing hydraulic lines
        const lineGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 16);
        const line1 = new THREE.Mesh(lineGeo, glowCyan);
        line1.position.y = 0.9;
        this.group.add(line1);

        const line2 = new THREE.Mesh(lineGeo, glowOrange);
        line2.position.y = 0.4;
        this.group.add(line2);

        // --- Seat Base ---
        const seatBaseGeo = new THREE.BoxGeometry(1.4, 0.2, 1.2);
        this.seatBase = new THREE.Mesh(seatBaseGeo, seatMaterial);
        this.seatBase.position.y = 1.3;
        this.group.add(this.seatBase);

        // Seat glowing edge trim
        const seatTrimGeo = new THREE.BoxGeometry(1.45, 0.05, 1.25);
        const seatTrim = new THREE.Mesh(seatTrimGeo, glowCyan);
        seatTrim.position.y = 1.3;
        this.group.add(seatTrim);

        // --- Backrest ---
        const backGeo = new THREE.BoxGeometry(1.3, 1.8, 0.2);
        this.backrest = new THREE.Mesh(backGeo, seatMaterial);
        this.backrest.position.set(0, 2.3, -0.55);
        this.backrest.rotation.x = 0.15; // Tilt back slightly
        this.group.add(this.backrest);

        // Backrest glowing vertical struts
        const strutGeo = new THREE.BoxGeometry(0.1, 1.6, 0.05);
        for(let i = -1; i <= 1; i++) {
            const strut = new THREE.Mesh(strutGeo, glowCyan);
            strut.position.set(i * 0.4, 2.3, -0.44);
            strut.rotation.x = 0.15;
            this.group.add(strut);
        }

        // --- Armrests ---
        const armrestGeo = new THREE.BoxGeometry(0.2, 0.1, 0.9);
        const armSupportGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);

        // Left Armrest
        const armL = new THREE.Mesh(armrestGeo, seatMaterial);
        armL.position.set(0.75, 1.55, 0.1);
        this.group.add(armL);
        const supL = new THREE.Mesh(armSupportGeo, metalMaterial);
        supL.position.set(0.75, 1.35, 0.1);
        this.group.add(supL);
        const glowL = new THREE.Mesh(armrestGeo, glowOrange);
        glowL.scale.set(0.5, 0.5, 1);
        glowL.position.set(0.75, 1.62, 0.1);
        this.group.add(glowL);

        // Right Armrest
        const armR = new THREE.Mesh(armrestGeo, seatMaterial);
        armR.position.set(-0.75, 1.55, 0.1);
        this.group.add(armR);
        const supR = new THREE.Mesh(armSupportGeo, metalMaterial);
        supR.position.set(-0.75, 1.35, 0.1);
        this.group.add(supR);
        const glowR = new THREE.Mesh(armrestGeo, glowOrange);
        glowR.scale.set(0.5, 0.5, 1);
        glowR.position.set(-0.75, 1.62, 0.1);
        this.group.add(glowR);
    }

    // Call this in your game loop to animate the chair
    update(time) {
        // Slow rotation to show off the 3D model in-game
        this.group.rotation.y += 0.008;

        // Pulsing the hydraulic lines and armrests
        const pulse = (Math.sin(time * 4) * 0.5) + 0.5;
        
        // Find and pulse the glowing materials
        this.group.traverse((child) => {
            if (child.isMesh && child.material.emissiveIntensity > 0) {
                // Only pulse the orange parts for a subtle "power" effect
                if (child.material.color.getHex() === 0xff6600) {
                    child.material.emissiveIntensity = 0.5 + pulse * 1.5;
                }
            }
        });

        // Subtle hover bobbing
        this.group.position.y = Math.sin(time * 2) * 0.05;
    }
}