// entities/suv.js — model SUV detail untuk "object mobil" cover (dipakai stage 4).
// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// Hanya Lambert/Basic (sudah di-warm) supaya spawn tanpa recompile shader.
//
// buildSUVMesh(scale, bodyColor) -> THREE.Group.
//   - panjang bodi di-orient ke sumbu Z (siap di-yaw lewat group.rotation.y),
//   - skala 1 unit-model ≈ `scale` unit-dunia (dunia game: 1 m ≈ 7 u),
//   - berdiri di y=0 (roda menyentuh tanah).

const SUV_COLORS = [0x7a3226, 0x2e4a63, 0x5a5a5e, 0x8a7a2a, 0x4a3a30];

export function buildSUVMesh(scale = 7, bodyColor = null) {
    const g = new THREE.Group();
    const inner = new THREE.Group();   // koordinat model asli (panjang di sumbu X)

    // --- Materials (Lambert/Basic; look rongsok = sedikit digelapkan) ---
    const col = bodyColor != null ? bodyColor : SUV_COLORS[(Math.random() * SUV_COLORS.length) | 0];
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(col).offsetHSL(0, -0.1, -0.05) });
    const glassMaterial = new THREE.MeshLambertMaterial({ color: 0x111417 });
    const tireMaterial = new THREE.MeshLambertMaterial({ color: 0x141414 });
    const rimMaterial = new THREE.MeshLambertMaterial({ color: 0xbfbfbf });
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffcc, toneMapped: false });
    const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
    const rackMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

    // --- Bodi bawah ---
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1.8), bodyMaterial);
    lowerBody.position.y = 0.8; lowerBody.castShadow = true;
    inner.add(lowerBody);

    // --- Kabin atas ---
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 1.7), bodyMaterial);
    cabin.position.set(-0.2, 1.9, 0); cabin.castShadow = true;
    inner.add(cabin);

    // --- Kaca ---
    const windshieldGeo = new THREE.BoxGeometry(0.1, 1.0, 1.6);
    const windshield = new THREE.Mesh(windshieldGeo, glassMaterial);
    windshield.position.set(1.05, 1.9, 0); inner.add(windshield);
    const rearWindshield = new THREE.Mesh(windshieldGeo, glassMaterial);
    rearWindshield.position.set(-1.45, 1.9, 0); inner.add(rearWindshield);
    const sideWindowGeo = new THREE.BoxGeometry(2.3, 1.0, 0.1);
    const leftWindow = new THREE.Mesh(sideWindowGeo, glassMaterial);
    leftWindow.position.set(-0.2, 1.9, 0.86); inner.add(leftWindow);
    const rightWindow = new THREE.Mesh(sideWindowGeo, glassMaterial);
    rightWindow.position.set(-0.2, 1.9, -0.86); inner.add(rightWindow);

    // --- Roof rack ---
    const rackBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.5), rackMaterial);
    rackBase.position.set(-0.2, 2.55, 0); inner.add(rackBase);
    for (let i = 0; i < 4; i++) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 1.5), rackMaterial);
        rail.position.set(-1.2 + (i * 0.8), 2.65, 0); inner.add(rail);
    }

    // --- Roda ---
    const wheelRadius = 0.5, wheelThickness = 0.3;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 16);
    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, wheelThickness + 0.02, 8);
    const wheelPositions = [
        { x: 1.3, z: 0.95 }, { x: 1.3, z: -0.95 }, { x: -1.3, z: 0.95 }, { x: -1.3, z: -0.95 }
    ];
    for (const pos of wheelPositions) {
        const wheelGroup = new THREE.Group();
        const tire = new THREE.Mesh(wheelGeo, tireMaterial);
        tire.rotation.x = Math.PI / 2; wheelGroup.add(tire);
        const rim = new THREE.Mesh(rimGeo, rimMaterial);
        rim.rotation.x = Math.PI / 2; wheelGroup.add(rim);
        wheelGroup.position.set(pos.x, wheelRadius, pos.z);
        wheelGroup.castShadow = true;
        inner.add(wheelGroup);
    }

    // --- Lampu depan/belakang ---
    const lightGeo = new THREE.BoxGeometry(0.1, 0.3, 0.4);
    for (const z of [0.6, -0.6]) {
        const hl = new THREE.Mesh(lightGeo, lightMaterial);
        hl.position.set(2.05, 0.8, z); inner.add(hl);
        const tl = new THREE.Mesh(lightGeo, taillightMat);
        tl.position.set(-2.05, 0.8, z); inner.add(tl);
    }

    inner.rotation.y = Math.PI / 2;   // panjang bodi (X) -> sumbu Z
    inner.scale.setScalar(scale);
    g.add(inner);
    return g;
}
