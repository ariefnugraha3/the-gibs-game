/**
 * FuturisticSUV.js
 * ----------------
 * A 100% procedurally-generated futuristic SUV built from Three.js primitives.
 * No external 3D model files, no brand-specific silhouettes — zero copyright risk.
 *
 * Designed to be attached to a Phaser 3 game as a game-object property.
 * See phaser-integration-example.js for the bridge pattern.
 *
 * Author: Generated for game use
 * License: MIT — free for commercial & personal use
 */

// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// CATATAN: memakai MeshStandard/MeshPhysicalMaterial (bukan Lambert/Basic),
// jadi shader-nya BELUM di-warm preload -> kompilasi sekali saat dunia stage 4
// dibangun (tersembunyi di balik loading transisi).

export class FuturisticSUV {
    /**
     * @param {Object} options
     * @param {number} [options.bodyColor=0x0a0e1a]      Main body paint color
     * @param {number} [options.accentColor=0x00e5ff]    Neon accent / light strip color
     * @param {number} [options.glassColor=0x6fb3d4]     Cabin glass tint
     * @param {number} [options.wheelRimColor=0xc0c8d0]  Wheel rim metallic color
     * @param {number} [options.scale=1]                 Overall model scale
     * @param {boolean} [options.enableLights=true]      Enable glowing accents & headlights
     * @param {boolean} [options.castShadow=true]        Allow meshes to cast shadows
     * @param {boolean} [options.receiveShadow=true]     Allow meshes to receive shadows
     */
    constructor(options = {}) {
        this.options = Object.assign({
            bodyColor: 0x0a0e1a,
            accentColor: 0x00e5ff,
            glassColor: 0x6fb3d4,
            wheelRimColor: 0xc0c8d0,
            scale: 1,
            enableLights: true,
            castShadow: true,
            receiveShadow: true,
        }, options);

        /** Root group — attach this to your scene / Phaser bridge. */
        this.group = new THREE.Group();
        this.group.name = 'FuturisticSUV';

        /** Internal references for animation. */
        this.wheels = [];
        this.frontLights = [];
        this.rearLights = [];
        this.accentStrips = [];
        this._lightPulse = 0;

        // Reusable materials
        this._materials = this._createMaterials();

        this._buildBody();
        this._buildCabin();
        this._buildWheels();
        this._buildLights();
        this._buildDetails();

        this.group.scale.setScalar(this.options.scale);

        // Orient so the car faces +Z by default (Phaser-style "up = -Y, forward = +Z")
        this.group.rotation.y = 0;
    }

    /* --------------------------------------------------------------------- *
     * Materials
     * --------------------------------------------------------------------- */

    _createMaterials() {
        const o = this.options;

        const bodyMat = new THREE.MeshStandardMaterial({
            color: o.bodyColor,
            metalness: 0.85,
            roughness: 0.35,
            envMapIntensity: 1.0,
        });

        const darkTrimMat = new THREE.MeshStandardMaterial({
            color: 0x05070d,
            metalness: 0.6,
            roughness: 0.5,
        });

        const glassMat = new THREE.MeshPhysicalMaterial({
            color: o.glassColor,
            metalness: 0.0,
            roughness: 0.05,
            transmission: 0.85,
            transparent: true,
            opacity: 0.55,
            ior: 1.4,
            envMapIntensity: 1.2,
        });

        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a0c,
            metalness: 0.1,
            roughness: 0.9,
        });

        const rimMat = new THREE.MeshStandardMaterial({
            color: o.wheelRimColor,
            metalness: 0.95,
            roughness: 0.25,
        });

        const accentMat = new THREE.MeshStandardMaterial({
            color: o.accentColor,
            emissive: o.accentColor,
            emissiveIntensity: o.enableLights ? 2.5 : 0,
            metalness: 0.2,
            roughness: 0.4,
        });

        const headlightMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: o.enableLights ? 3.0 : 0,
        });

        const taillightMat = new THREE.MeshStandardMaterial({
            color: 0xff2a2a,
            emissive: 0xff2a2a,
            emissiveIntensity: o.enableLights ? 2.5 : 0,
        });

        return { bodyMat, darkTrimMat, glassMat, tireMat, rimMat, accentMat, headlightMat, taillightMat };
    }

    /* --------------------------------------------------------------------- *
     * Body — composed of beveled boxes & angled plates to suggest a sleek SUV
     * --------------------------------------------------------------------- */

    _buildBody() {
        const { bodyMat, darkTrimMat } = this._materials;

        // Lower hull — wide, low-slung SUV stance
        const hullGeo = new THREE.BoxGeometry(4.4, 0.9, 1.9);
        const hull = new THREE.Mesh(hullGeo, bodyMat);
        hull.position.y = 0.65;
        this._applyShadow(hull);
        this.group.add(hull);

        // Mid-section "wedge" — slightly narrower, raised, gives the futuristic profile
        const midGeo = new THREE.BoxGeometry(3.6, 0.55, 1.75);
        const mid = new THREE.Mesh(midGeo, bodyMat);
        mid.position.y = 1.30;
        mid.rotation.x = 0; // flat
        this._applyShadow(mid);
        this.group.add(mid);

        // Front nose — angled plate for aero look
        const noseGeo = new THREE.BoxGeometry(1.0, 0.45, 1.7);
        const nose = new THREE.Mesh(noseGeo, bodyMat);
        nose.position.set(2.0, 0.55, 0);
        nose.rotation.z = -0.18;
        this._applyShadow(nose);
        this.group.add(nose);

        // Rear tail — slight upward kick (suv-like)
        const tailGeo = new THREE.BoxGeometry(0.9, 0.55, 1.7);
        const tail = new THREE.Mesh(tailGeo, bodyMat);
        tail.position.set(-2.1, 0.70, 0);
        tail.rotation.z = 0.12;
        this._applyShadow(tail);
        this.group.add(tail);

        // Side skirts (dark trim)
        const skirtGeo = new THREE.BoxGeometry(3.6, 0.18, 0.12);
        const skirtL = new THREE.Mesh(skirtGeo, darkTrimMat);
        skirtL.position.set(0, 0.30, 0.92);
        this._applyShadow(skirtL);
        this.group.add(skirtL);

        const skirtR = skirtL.clone();
        skirtR.position.z = -0.92;
        this.group.add(skirtR);

        // Front bumper / splitter
        const splitterGeo = new THREE.BoxGeometry(0.6, 0.12, 1.85);
        const splitter = new THREE.Mesh(splitterGeo, darkTrimMat);
        splitter.position.set(2.25, 0.25, 0);
        this._applyShadow(splitter);
        this.group.add(splitter);

        // Rear diffuser
        const diffuserGeo = new THREE.BoxGeometry(0.5, 0.18, 1.85);
        const diffuser = new THREE.Mesh(diffuserGeo, darkTrimMat);
        diffuser.position.set(-2.3, 0.30, 0);
        this._applyShadow(diffuser);
        this.group.add(diffuser);
    }

    /* --------------------------------------------------------------------- *
     * Cabin — glass canopy + roof plate
     * --------------------------------------------------------------------- */

    _buildCabin() {
        const { bodyMat, glassMat, darkTrimMat } = this._materials;

        // Glass canopy — slightly tapered trapezoid via scaled box
        const canopyGeo = new THREE.BoxGeometry(2.6, 0.7, 1.55);
        const canopy = new THREE.Mesh(canopyGeo, glassMat);
        canopy.position.set(-0.1, 1.75, 0);
        this._applyShadow(canopy);
        this.group.add(canopy);

        // Roof plate (dark, contrasting)
        const roofGeo = new THREE.BoxGeometry(2.2, 0.08, 1.5);
        const roof = new THREE.Mesh(roofGeo, darkTrimMat);
        roof.position.set(-0.1, 2.12, 0);
        this._applyShadow(roof);
        this.group.add(roof);

        // A-pillar / B-pillar accents (dark trims flanking the canopy)
        const pillarGeo = new THREE.BoxGeometry(0.08, 0.7, 1.55);
        const pillarFront = new THREE.Mesh(pillarGeo, darkTrimMat);
        pillarFront.position.set(1.15, 1.75, 0);
        this.group.add(pillarFront);

        const pillarBack = new THREE.Mesh(pillarGeo, darkTrimMat);
        pillarBack.position.set(-1.35, 1.75, 0);
        this.group.add(pillarBack);
    }

    /* --------------------------------------------------------------------- *
     * Wheels — 4 detailed wheels with rims, tires, and accent hubs
     * --------------------------------------------------------------------- */

    _buildWheels() {
        const { tireMat, rimMat, accentMat } = this._materials;
        const o = this.options;

        const wheelPositions = [
            { x:  1.45, z:  0.95 },   // front-right
            { x:  1.45, z: -0.95 },   // front-left
            { x: -1.45, z:  0.95 },   // rear-right
            { x: -1.45, z: -0.95 },   // rear-left
        ];

        const wheelRadius = 0.55;
        const wheelWidth = 0.42;

        wheelPositions.forEach((pos, i) => {
            const wheel = new THREE.Group();

            // Tire
            const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 32);
            const tire = new THREE.Mesh(tireGeo, tireMat);
            tire.rotation.z = Math.PI / 2; // lay on its side so axis is along Z
            this._applyShadow(tire);
            wheel.add(tire);

            // Rim (outer)
            const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.65, wheelRadius * 0.65, wheelWidth + 0.02, 24);
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            this._applyShadow(rim);
            wheel.add(rim);

            // Hub accent (glowing center cap)
            const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.18, wheelRadius * 0.18, wheelWidth + 0.04, 16);
            const hub = new THREE.Mesh(hubGeo, accentMat);
            hub.rotation.z = Math.PI / 2;
            wheel.add(hub);

            // Spokes — 5 small boxes to suggest a turbine-style rim
            for (let s = 0; s < 5; s++) {
                const angle = (s / 5) * Math.PI * 2;
                const spokeGeo = new THREE.BoxGeometry(0.05, wheelRadius * 0.9, wheelWidth * 0.6);
                const spoke = new THREE.Mesh(spokeGeo, rimMat);
                spoke.rotation.x = angle;
                wheel.add(spoke);
            }

            // Position the wheel and flip left side so spokes face outward
            wheel.position.set(pos.x, wheelRadius, pos.z);
            if (pos.z < 0) wheel.scale.z = -1;

            this.group.add(wheel);
            this.wheels.push(wheel);
        });

        // Wheel arches (dark trim rings sitting on the body)
        wheelPositions.forEach((pos) => {
            const archGeo = new THREE.TorusGeometry(0.65, 0.06, 8, 24, Math.PI);
            const arch = new THREE.Mesh(archGeo, this._materials.darkTrimMat);
            arch.position.set(pos.x, 0.65, pos.z);
            arch.rotation.y = Math.PI / 2;
            arch.rotation.z = Math.PI; // top half
            this.group.add(arch);
        });
    }

    /* --------------------------------------------------------------------- *
     * Lights — headlights, taillights, accent strips
     * --------------------------------------------------------------------- */

    _buildLights() {
        const { accentMat, headlightMat, taillightMat, darkTrimMat } = this._materials;
        const o = this.options;

        // Headlights — thin LED strips at the front
        const hlGeo = new THREE.BoxGeometry(0.08, 0.08, 0.55);
        const hlL = new THREE.Mesh(hlGeo, headlightMat);
        hlL.position.set(2.45, 0.75, 0.55);
        this.group.add(hlL);
        this.frontLights.push(hlL);

        const hlR = new THREE.Mesh(hlGeo, headlightMat);
        hlR.position.set(2.45, 0.75, -0.55);
        this.group.add(hlR);
        this.frontLights.push(hlR);

        // Taillights — full-width glowing strip across the rear
        const tlGeo = new THREE.BoxGeometry(0.08, 0.12, 1.6);
        const tl = new THREE.Mesh(tlGeo, taillightMat);
        tl.position.set(-2.55, 0.80, 0);
        this.group.add(tl);
        this.rearLights.push(tl);

        // Underglow accent strip (left & right)
        const underglowGeo = new THREE.BoxGeometry(3.2, 0.04, 0.04);
        const ugL = new THREE.Mesh(underglowGeo, accentMat);
        ugL.position.set(0, 0.18, 0.95);
        this.group.add(ugL);
        this.accentStrips.push(ugL);

        const ugR = new THREE.Mesh(underglowGeo, accentMat);
        ugR.position.set(0, 0.18, -0.95);
        this.group.add(ugR);
        this.accentStrips.push(ugR);

        // Front grille accent bar
        const grilleGeo = new THREE.BoxGeometry(0.4, 0.05, 1.4);
        const grille = new THREE.Mesh(grilleGeo, accentMat);
        grille.position.set(2.45, 0.55, 0);
        this.group.add(grille);
        this.accentStrips.push(grille);

        // Roofline accent (cyan strip on the roof)
        const roofStripGeo = new THREE.BoxGeometry(2.0, 0.03, 0.06);
        const roofStrip = new THREE.Mesh(roofStripGeo, accentMat);
        roofStrip.position.set(-0.1, 2.17, 0);
        this.group.add(roofStrip);
        this.accentStrips.push(roofStrip);
    }

    /* --------------------------------------------------------------------- *
     * Details — spoiler, intakes, exhausts
     * --------------------------------------------------------------------- */

    _buildDetails() {
        const { bodyMat, darkTrimMat, accentMat } = this._materials;

        // Rear wing / spoiler
        const wingPostGeo = new THREE.BoxGeometry(0.08, 0.25, 0.08);
        const postL = new THREE.Mesh(wingPostGeo, darkTrimMat);
        postL.position.set(-2.35, 1.30, 0.55);
        this.group.add(postL);
        const postR = new THREE.Mesh(wingPostGeo, darkTrimMat);
        postR.position.set(-2.35, 1.30, -0.55);
        this.group.add(postR);

        const wingGeo = new THREE.BoxGeometry(0.45, 0.06, 1.85);
        const wing = new THREE.Mesh(wingGeo, bodyMat);
        wing.position.set(-2.35, 1.45, 0);
        this._applyShadow(wing);
        this.group.add(wing);

        // Wing accent strip
        const wingAccentGeo = new THREE.BoxGeometry(0.05, 0.03, 1.7);
        const wingAccent = new THREE.Mesh(wingAccentGeo, accentMat);
        wingAccent.position.set(-2.55, 1.45, 0);
        this.group.add(wingAccent);
        this.accentStrips.push(wingAccent);

        // Side intakes (just behind front wheel arch)
        const intakeGeo = new THREE.BoxGeometry(0.4, 0.2, 0.05);
        const intakeL = new THREE.Mesh(intakeGeo, darkTrimMat);
        intakeL.position.set(0.85, 0.7, 0.95);
        this.group.add(intakeL);
        const intakeR = new THREE.Mesh(intakeGeo, darkTrimMat);
        intakeR.position.set(0.85, 0.7, -0.95);
        this.group.add(intakeR);

        // Dual exhausts (rear, glowing accent rings)
        const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12);
        [-0.4, 0.4].forEach((z) => {
            const exhaust = new THREE.Mesh(exhaustGeo, this._materials.rimMat);
            exhaust.rotation.z = Math.PI / 2;
            exhaust.rotation.y = Math.PI / 2;
            exhaust.position.set(-2.55, 0.35, z);
            this.group.add(exhaust);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.09, 0.015, 8, 16),
                accentMat
            );
            ring.position.set(-2.62, 0.35, z);
            ring.rotation.y = Math.PI / 2;
            this.group.add(ring);
            this.accentStrips.push(ring);
        });
    }

    /* --------------------------------------------------------------------- *
     * Helpers
     * --------------------------------------------------------------------- */

    _applyShadow(mesh) {
        mesh.castShadow = this.options.castShadow;
        mesh.receiveShadow = this.options.receiveShadow;
    }

    /* --------------------------------------------------------------------- *
     * Public API
     * --------------------------------------------------------------------- */

    /**
     * Returns the root THREE.Group — attach this to your scene,
     * or expose it as a property of a Phaser GameObject.
     * @returns {THREE.Group}
     */
    getGroup() {
        return this.group;
    }

    /**
     * Per-frame update. Call from your game loop (Phaser UPDATE or Three.js render loop).
     * @param {number} delta    seconds since last frame
     * @param {Object} [state]
     * @param {number} [state.speed]      if provided, rotates wheels proportional to speed
     * @param {number} [state.steer=0]    -1 (left) .. +1 (right), visually steers front wheels
     * @param {boolean} [state.brake=false]  lights up taillights brighter
     */
    update(delta, state = {}) {
        // Wheel spin
        if (typeof state.speed === 'number') {
            const spin = state.speed * delta * 2.0;
            this.wheels.forEach((w, i) => {
                // Front wheels (indices 0,1) also steer
                if (i < 2 && typeof state.steer === 'number') {
                    w.rotation.y = state.steer * 0.35;
                }
                // Spin happens on local X after the wheel rotation is applied;
                // to keep this simple we spin the tire child. But since we built
                // wheels as a Group, we rotate the group's children.
                w.children.forEach((c) => {
                    if (c.geometry && c.geometry.type === 'CylinderGeometry') {
                        c.rotation.x += spin;
                    }
                });
            });
        }

        // Brake — taillights flare
        if (typeof state.brake === 'boolean') {
            this.rearLights.forEach((l) => {
                l.material.emissiveIntensity = state.brake ? 5.0 : 2.5;
            });
        }

        // Subtle accent pulse when lights enabled
        if (this.options.enableLights) {
            this._lightPulse += delta * 2.0;
            const pulse = 1.8 + Math.sin(this._lightPulse) * 0.7;
            this.accentStrips.forEach((s) => {
                if (s.material) s.material.emissiveIntensity = pulse;
            });
        }
    }

    /**
     * Dispose of geometries & materials to free GPU memory.
     * Call when the Phaser GameObject using this SUV is destroyed.
     */
    dispose() {
        this.group.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
        this.group.clear();
        this.wheels = [];
        this.frontLights = [];
        this.rearLights = [];
        this.accentStrips = [];
    }
}

/**
 * Drop-in pengganti buildSUVMesh(scale, bodyColor) untuk "object mobil" cover.
 * Mengembalikan THREE.Group yang: panjang bodi di-orient ke sumbu Z (siap di-yaw
 * lewat group.rotation.y, seperti entities/suv.js) dan berdiri di y=0.
 * @param {number} [scale=7]         1 unit-model ≈ `scale` u-dunia (1 m ≈ 7 u)
 * @param {number|null} [bodyColor]  warna cat bodi (null = default futuristik)
 * @returns {THREE.Group}
 */
export function buildFuturisticSUVMesh(scale = 7, bodyColor = null) {
    const opts = { scale };
    if (bodyColor != null) opts.bodyColor = bodyColor;
    const suv = new FuturisticSUV(opts);
    suv.group.rotation.y = Math.PI / 2;   // panjang bodi (X model) -> sumbu Z dunia
    const g = new THREE.Group();
    g.add(suv.group);
    return g;
}

export default FuturisticSUV;
