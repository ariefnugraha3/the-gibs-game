// MESIN PEMBUAT ROBOT — hero prop procedural bersama Stage 3 + Stage 6.
//
// Siluet 2026-08-08: pod fabrikasi oktagonal dengan chamber berlapis, dua turbin
// samping, lengan gantry, iris hatch, scan ring, crown antenna dan armor miring.
// Hatch menghadap +z LOKAL; pemanggil tetap bebas memutar seluruh grup. Seluruh
// animasi hanya mengubah transform/material yang sudah dibuat — tanpa alokasi,
// PointLight, atau shader/material baru di tengah permainan.

import { PAL } from '../world/palette.js';

export function buildSpawnMachineMesh(W = 26, H = 17, D = 26) {
    const g = new THREE.Group();
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const panel = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const coreMat = new THREE.MeshLambertMaterial({ color: PAL.techDim,
        emissive: PAL.tech, emissiveIntensity: 0.16 });
    const glass = new THREE.MeshLambertMaterial({ color: PAL.screenBg,
        emissive: PAL.techDim, emissiveIntensity: 0.12, transparent: true,
        opacity: 0.32, depthWrite: false });
    const teal = new THREE.MeshBasicMaterial({ color: PAL.techDim, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2b1f, toneMapped: false });
    const amberMat = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });
    const box = (parent, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
        m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const cyl = (parent, mat, r, h, x, y, z, ax = 'y', seg = 12) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
        m.position.set(x, y, z);
        if (ax === 'x') m.rotation.z = Math.PI / 2; else if (ax === 'z') m.rotation.x = Math.PI / 2;
        m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const torus = (parent, mat, r, tube, x, y, z, rx = 0, ry = 0, rz = 0, seg = 18) => {
        const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 7, seg), mat);
        m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
        m.castShadow = true; parent.add(m); return m;
    };
    const minSide = Math.min(W, D);

    // Fondasi oktagonal bertingkat: footprint gameplay tetap milik pemanggil.
    cyl(g, ink, minSide * 0.47, 2.4, 0, 1.2, 0, 'y', 8);
    cyl(g, gun, minSide * 0.41, 1.1, 0, 2.8, 0, 'y', 12);
    const deckRing = torus(g, hazard, minSide * 0.37, 0.42, 0, 3.05, 0, Math.PI / 2);

    // Empat menara miring + pod kaki membuat siluet lebih kuat dari kotak lama.
    const frame = new THREE.Group(); g.add(frame);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * W * 0.38, z = sz * D * 0.35;
        cyl(frame, steel, minSide * 0.055, 3.1, x, 3.5, z, 'y', 8);
        box(frame, gun, W * 0.075, H * 0.74, D * 0.075,
            x, 4.2 + H * 0.37, z, sz * 0.12, 0, -sx * 0.13);
        box(frame, panel, W * 0.12, H * 0.17, D * 0.12,
            x, 3.5 + H * 0.72, z, 0, sx * sz * 0.35, 0);
    }
    // Armor belakang bertumpuk seperti tulang belakang reaktor.
    for (let i = -2; i <= 2; i++)
        box(frame, i % 2 ? steel : gun, W * 0.18, H * 0.66, D * 0.075,
            i * W * 0.18, 3.4 + H * 0.34, -D * 0.44,
            0, i * -0.08, i * 0.035);

    // Chamber pusat: kapsul kaca, energi kristal, cage rings dan scan hoop.
    const chamber = new THREE.Group(); chamber.position.y = 3.1; g.add(chamber);
    const core = cyl(chamber, coreMat, minSide * 0.135, H * 0.58,
        0, H * 0.34, 0, 'y', 12);
    const coreCrystal = new THREE.Mesh(new THREE.IcosahedronGeometry(minSide * 0.14, 1), coreMat);
    coreCrystal.position.set(0, H * 0.35, 0); chamber.add(coreCrystal);
    const capsule = cyl(chamber, glass, minSide * 0.22, H * 0.67,
        0, H * 0.35, 0, 'y', 16);
    const cageRings = [];
    for (const ky of [0.08, 0.31, 0.54, 0.68])
        cageRings.push(torus(chamber, steel, minSide * 0.235, minSide * 0.027,
            0, H * ky, 0, Math.PI / 2));
    const energyCoils = [];
    for (const ky of [0.2, 0.39, 0.58])
        energyCoils.push(torus(chamber, teal, minSide * 0.16, minSide * 0.018,
            0, H * ky, 0, Math.PI / 2, ky * 2.4));
    const scanRing = torus(chamber, amberMat, minSide * 0.19, minSide * 0.018,
        0, H * 0.17, 0, Math.PI / 2);

    // Turbin samping berlapis memberi massa mekanis dan profil non-kotak.
    const turbines = [];
    for (const sx of [-1, 1]) {
        const turbine = new THREE.Group();
        turbine.position.set(sx * W * 0.46, 3.1 + H * 0.43, -D * 0.03);
        frame.add(turbine); turbines.push(turbine);
        cyl(turbine, ink, minSide * 0.13, W * 0.12, 0, 0, 0, 'x', 12);
        cyl(turbine, steel, minSide * 0.095, W * 0.135, 0, 0, 0, 'x', 10);
        torus(turbine, hazard, minSide * 0.105, minSide * 0.018,
            sx * W * 0.07, 0, 0, 0, Math.PI / 2);
        for (let n = 0; n < 4; n++)
            box(turbine, panel, W * 0.018, minSide * 0.17, D * 0.025,
                sx * W * 0.075, 0, 0, 0, 0, n * Math.PI / 2);
    }

    // Gantry atas + dua lengan fabrikasi berengsel di atas chamber.
    const gantry = new THREE.Group(); gantry.position.y = 3.1 + H * 0.79; g.add(gantry);
    cyl(gantry, gun, minSide * 0.3, 2.2, 0, 0, 0, 'y', 8);
    torus(gantry, steel, minSide * 0.29, minSide * 0.035, 0, -0.9, 0, Math.PI / 2);
    const arms = [];
    for (const sx of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(sx * W * 0.19, 0, D * 0.02); gantry.add(arm);
        box(arm, steel, W * 0.08, H * 0.34, D * 0.08, 0, -H * 0.15, 0, 0, 0, sx * 0.28);
        cyl(arm, hazard, minSide * 0.055, W * 0.09, sx * W * 0.055, -H * 0.31, 0, 'x', 8);
        box(arm, gun, W * 0.15, H * 0.08, D * 0.06,
            sx * W * 0.05, -H * 0.39, D * 0.02, 0, sx * 0.25, sx * -0.35);
        arms.push(arm);
    }

    // Hatch bundar dengan enam iris-blade dan enam pelat armor radial.
    const hatchFrame = new THREE.Group();
    hatchFrame.position.set(0, 3.1 + H * 0.39, D * 0.47); g.add(hatchFrame);
    torus(hatchFrame, gun, minSide * 0.27, minSide * 0.055, 0, 0, 0);
    torus(hatchFrame, steel, minSide * 0.205, minSide * 0.025, 0, 0, D * 0.015);
    const hatch = cyl(hatchFrame, teal, minSide * 0.17, D * 0.035,
        0, 0, D * 0.03, 'z', 16);
    const iris = new THREE.Group(); iris.position.z = D * 0.055; hatchFrame.add(iris);
    const irisBlades = [];
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const blade = box(iris, panel, minSide * 0.13, minSide * 0.055, D * 0.022,
            Math.cos(a) * minSide * 0.085, Math.sin(a) * minSide * 0.085, 0,
            0, 0, a + 0.32);
        blade.userData.a = a; irisBlades.push(blade);
        box(hatchFrame, i % 2 ? gun : steel, minSide * 0.12, minSide * 0.055, D * 0.045,
            Math.cos(a) * minSide * 0.31, Math.sin(a) * minSide * 0.31, 0,
            0, 0, a);
    }
    // Tiga sensor predator + rel peringatan mengapit mulut hatch.
    const eyes = [];
    for (const x of [-W * 0.1, 0, W * 0.1])
        eyes.push(box(hatchFrame, eyeMat, W * 0.07, H * 0.07, D * 0.025,
            x, H * 0.35, D * 0.03, 0, 0, x / W * -0.4));
    for (const x of [-W * 0.3, W * 0.3])
        box(hatchFrame, hazard, W * 0.16, H * 0.055, D * 0.028,
            x, -H * 0.34, D * 0.03, 0, 0, x > 0 ? 0.12 : -0.12);

    // Crown/antenna asimetris: titik fokus vertikal untuk kamera oblique.
    const crown = new THREE.Group(); crown.position.y = 4.2 + H; g.add(crown);
    cyl(crown, steel, minSide * 0.045, H * 0.34, 0, H * 0.12, 0, 'y', 8);
    torus(crown, amberMat, minSide * 0.12, minSide * 0.018, 0, H * 0.13, 0, Math.PI / 2);
    box(crown, gun, W * 0.33, H * 0.055, D * 0.06, W * 0.08, 0, 0, 0, 0, -0.08);
    const beacon = new THREE.Mesh(new THREE.IcosahedronGeometry(minSide * 0.055, 0), eyeMat);
    beacon.position.set(0, H * 0.31, 0); crown.add(beacon);

    const rig = {
        group: g, frame, chamber, core, coreCrystal, capsule, cageRings, energyCoils,
        scanRing, turbines, gantry, arms, hatchFrame, hatch, iris, irisBlades,
        eyes, crown, beacon, deckRing, eye: eyes[1], eyeMat, coreMat,
        glowMats: [coreMat, glass], signalMats: [teal, amberMat],
        animT: 0, power: 0, W, H, D,
    };
    resetSpawnMachine(rig, false);
    return rig;
}

// Pose dipisahkan agar reset stage deterministik dan uji dapat membedakan mesin
// mati vs aktif tanpa bergantung pada frame rate.
function poseSpawnMachine(rig, active, hit = 0) {
    const p = rig.power, t = rig.animT;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    rig.chamber.rotation.y = t * (0.12 + p * 0.72);
    rig.coreCrystal.rotation.x = t * (0.18 + p * 1.15);
    rig.coreCrystal.rotation.y = -t * (0.24 + p * 1.65);
    rig.coreCrystal.scale.setScalar(0.82 + p * (0.12 + pulse * 0.1));
    for (let i = 0; i < rig.energyCoils.length; i++) {
        const ring = rig.energyCoils[i];
        ring.rotation.z = (i % 2 ? -1 : 1) * t * (0.18 + p * 1.2);
        ring.rotation.x = Math.PI / 2 + Math.sin(t * 1.7 + i * 2.1) * 0.12 * p;
    }
    rig.scanRing.position.y = rig.H * (0.17 + p * (0.18 + 0.34 * (0.5 + 0.5 * Math.sin(t * 2.4))));
    rig.scanRing.scale.setScalar(0.9 + p * (0.08 + pulse * 0.08));
    rig.iris.rotation.z = -t * (0.1 + p * 1.4);
    const irisR = Math.min(rig.W, rig.D) * (0.085 + p * (0.055 + pulse * 0.012));
    for (const blade of rig.irisBlades) {
        const a = blade.userData.a;
        blade.position.x = Math.cos(a) * irisR;
        blade.position.y = Math.sin(a) * irisR;
        blade.rotation.z = a + 0.32 + p * 0.62;
    }
    for (let i = 0; i < rig.arms.length; i++) {
        const sign = i ? 1 : -1;
        rig.arms[i].rotation.z = sign * (0.08 + p * (0.18 + 0.11 * Math.sin(t * 2.8 + i * Math.PI)));
        rig.arms[i].rotation.y = sign * p * 0.12 * Math.sin(t * 1.9);
    }
    for (let i = 0; i < rig.turbines.length; i++)
        rig.turbines[i].rotation.x = (i ? -1 : 1) * t * p * 2.2;
    rig.crown.rotation.y = t * (0.08 + p * 0.55);
    rig.hatch.scale.setScalar(0.82 + p * (0.1 + pulse * 0.08));
    rig.coreMat.color.setHex(active || p > 0.08 ? PAL.tech : PAL.techDim);
    rig.coreMat.emissiveIntensity = 0.14 + p * (0.42 + pulse * 0.18);
    rig.glowMats[1].emissiveIntensity = 0.1 + p * (0.22 + pulse * 0.12);
    rig.glowMats[1].opacity = 0.25 + p * (0.12 + pulse * 0.08);
    rig.signalMats[0].color.setHex(active || p > 0.08 ? PAL.tech : PAL.techDim);
    rig.signalMats[1].color.setHex(p > 0.5 && pulse > 0.62 ? PAL.white : PAL.amber);
    rig.eyeMat.color.setHex(hit > 0.55 ? PAL.white : (active ? 0xff2b1f : PAL.steel));
    // Hentakan hanya pada rangka dalam; posisi/collision grup induk tetap stabil.
    rig.frame.position.x = hit * Math.sin(t * 34) * 0.55;
    rig.chamber.position.z = hit * Math.cos(t * 29) * 0.38;
}

export function resetSpawnMachine(rig, active = false) {
    if (!rig) return;
    rig.animT = 0;
    rig.power = active ? 1 : 0;
    poseSpawnMachine(rig, !!active, 0);
}

export function updateSpawnMachine(rig, dt, active = true, hit = 0) {
    if (!rig) return;
    const d = Math.max(0, Math.min(0.1, dt || 0));
    const target = active ? 1 : 0;
    rig.power += (target - rig.power) * Math.min(1, d * 3.6);
    rig.animT += d * (0.45 + rig.power * 1.55);
    poseSpawnMachine(rig, !!active, Math.max(0, Math.min(1, hit || 0)));
}

export function spawnMachineDebug(rig) {
    let meshes = 0, nonBox = 0, pointLights = 0;
    rig?.group?.traverse(o => {
        if (o.isMesh) { meshes++; if (o.geometry?.type !== 'box') nonBox++; }
        if (o.isPointLight) pointLights++;
    });
    const b = rig?.irisBlades?.[0];
    return {
        meshes, nonBox, pointLights, power: rig?.power || 0,
        irisRadius: b ? Math.hypot(b.position.x, b.position.y) : 0,
        scanY: rig?.scanRing?.position.y || 0,
        chamberYaw: rig?.chamber?.rotation.y || 0,
        crystalYaw: rig?.coreCrystal?.rotation.y || 0,
        armTilt: rig?.arms?.map(a => a.rotation.z) || [],
        hatchFacing: '+z',
    };
}
