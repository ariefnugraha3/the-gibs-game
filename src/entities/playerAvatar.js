// Avatar player TOP-DOWN (pivot 2026-07-11). Pivot LOGIKA player tetap objek
// `camera` lama (core/renderer.js) — posisi = titik setinggi mata, yaw = arah
// bidik. Modul ini murni VISUAL: tubuh tentara blocky segaya zombie (kotak +
// pivot kaki utk animasi jalan) yang berdiri di kaki pivot, menghadap titik
// bidik kursor, memegang senapan kompak — `avatarGunTip` di ujung laras jadi
// titik spawn peluru + induk kilat muzzle (weapons.js). Juga memiliki penanda
// "move to point" (klik kanan) berupa cincin berdenyut di tanah.

import { camera } from '../core/renderer.js';
import { GEO } from '../core/state.js';
import { aimPoint } from '../core/input.js';
import { eyeHCur } from './player.js';

export let avatarGroup = null;
export let avatarGunTip = null;   // Object3D ujung laras (dibaca weapons.js)
let legL = null, legR = null;
let phase = 0, lastX = 0, lastZ = 0;
let marker = null, markerT = 0;

export function initPlayerAvatar(sc) {
    // Phong warna polos = program shader sama dgn material dunia (tanpa compile baru)
    const mat = (c, sh = 10) => new THREE.MeshPhongMaterial({ color: c, shininess: sh, specular: 0x1c1a16 });
    const skin = mat(0xd09a66), shirt = mat(0x4a5138), vest = mat(0x23262b, 20),
        pants = mat(0x33383f), boots = mat(0x1b1d20), hair = mat(0x181512), gun = mat(0x15171a, 30);

    avatarGroup = new THREE.Group();   // menghadap +Z; di-lookAt ke titik bidik
    const mk = (geo, m, x, y, z, parent = avatarGroup, shadow = true) => {
        const b = new THREE.Mesh(geo, m);
        b.position.set(x, y, z);
        b.castShadow = shadow;
        parent.add(b);
        return b;
    };
    // Torso + rompi taktis + kepala (proporsi = manusia zombie: mata ~11.4)
    mk(new THREE.BoxGeometry(3.4, 3.2, 1.9), shirt, 0, 7.6, 0);
    mk(new THREE.BoxGeometry(3.6, 2.2, 2.1), vest, 0, 7.9, 0);
    mk(new THREE.BoxGeometry(2.0, 2.0, 2.0), skin, 0, 10.6, 0);
    mk(new THREE.BoxGeometry(2.16, 0.7, 2.16), hair, 0, 11.5, -0.06, avatarGroup, false);
    // Kaki: pivot pinggul (rotation.x diayun saat berjalan)
    const mkLeg = (sx) => {
        const hip = new THREE.Group();
        hip.position.set(sx, 6.0, 0);
        avatarGroup.add(hip);
        mk(new THREE.BoxGeometry(1.25, 3.0, 1.4), pants, 0, -1.6, 0, hip);
        mk(new THREE.BoxGeometry(1.35, 1.6, 1.5), pants, 0, -3.7, 0, hip);
        mk(new THREE.BoxGeometry(1.4, 0.9, 2.1), boots, 0, -4.9, 0.25, hip, false);
        return hip;
    };
    legL = mkLeg(-0.95);
    legR = mkLeg(0.95);
    // Lengan menodong ke depan (pose dua tangan di senapan)
    const mkArm = (sx, rx) => {
        const sh = new THREE.Group();
        sh.position.set(sx, 9.0, 0.4);
        sh.rotation.x = rx;
        avatarGroup.add(sh);
        mk(new THREE.BoxGeometry(1.0, 2.6, 1.0), shirt, 0, -1.2, 0, sh);
        mk(new THREE.BoxGeometry(0.9, 1.4, 0.9), skin, 0, -2.9, 0, sh, false);
        return sh;
    };
    mkArm(1.7, -1.35);
    mkArm(-1.4, -1.15);
    // Senapan kompak (visual; semua senjata memakai model ini dari atas)
    const gunGrp = new THREE.Group();
    gunGrp.position.set(0.65, 7.5, 1.2);
    avatarGroup.add(gunGrp);
    mk(new THREE.BoxGeometry(0.55, 0.8, 3.4), gun, 0, 0, 1.2, gunGrp);
    const gBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 8), gun);
    gBarrel.rotation.x = Math.PI / 2;
    gBarrel.position.set(0, 0.15, 3.6);
    gunGrp.add(gBarrel);
    mk(new THREE.BoxGeometry(0.5, 1.3, 0.8), gun, 0, -0.9, 1.0, gunGrp, false);
    avatarGunTip = new THREE.Object3D();
    avatarGunTip.position.set(0, 0.15, 4.5);
    gunGrp.add(avatarGunTip);

    sc.add(avatarGroup);

    // Penanda "move to point": cincin pipih berdenyut di titik klik kanan
    marker = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({
        color: 0x6fd26a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
    }));
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    sc.add(marker);
}

export function showMoveMarker(x, y, z) {
    if (!marker) return;
    marker.position.set(x, y + 0.5, z);
    marker.visible = true;
    markerT = 0;
}

export function hideMoveMarker() {
    if (marker) marker.visible = false;
}

// Per frame dari animate() — SETELAH updateGame (pakai posisi pivot & aim
// terbaru); jalan juga saat pause (pose beku, konsisten dgn kontrak decor).
export function updatePlayerAvatar(dt) {
    if (!avatarGroup) return;
    const feetY = camera.position.y - eyeHCur;
    const px = camera.position.x, pz = camera.position.z;
    avatarGroup.position.set(px, feetY, pz);
    // Menghadap titik bidik (grup dibangun menghadap +Z, sama spt rig zombie).
    // Guard: kursor TEPAT di atas player = arah nol -> lookAt menghasilkan NaN;
    // pertahankan hadap terakhir bila jaraknya < 0.5 unit.
    if (aimPoint) {
        const adx = aimPoint.x - px, adz = aimPoint.z - pz;
        if (adx * adx + adz * adz > 0.25) avatarGroup.lookAt(aimPoint.x, feetY, aimPoint.z);
    }
    // Ayunan kaki menurut kecepatan horizontal NYATA (WASD ataupun klik-kanan)
    const sp = dt > 0 ? Math.hypot(px - lastX, pz - lastZ) / dt : 0;
    lastX = px; lastZ = pz;
    if (sp > 1) {
        phase += dt * Math.min(13, 4 + sp * 0.12);
        const s = Math.sin(phase) * Math.min(0.62, sp * 0.012);
        legL.rotation.x = s;
        legR.rotation.x = -s;
    } else {
        legL.rotation.x *= Math.max(0, 1 - dt * 10);
        legR.rotation.x *= Math.max(0, 1 - dt * 10);
    }
    if (marker && marker.visible) {
        markerT += dt;
        const k = 1 + Math.sin(markerT * 6) * 0.18;
        marker.scale.setScalar(3.2 * k);
        marker.material.opacity = 0.55 + Math.sin(markerT * 6) * 0.25;
    }
}
