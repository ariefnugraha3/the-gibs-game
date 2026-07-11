// Avatar player TOP-DOWN (pivot 2026-07-11). Pivot LOGIKA player tetap objek
// `camera` lama (core/renderer.js) — posisi = titik setinggi mata, yaw = arah
// bidik. Modul ini murni VISUAL: tubuh tentara membulat/stylized segaya robot
// (silinder + elipsoid, pivot kaki utk animasi jalan) yang berdiri di kaki pivot, menghadap titik
// bidik kursor, memegang senapan kompak — `avatarGunTip` di ujung laras jadi
// titik spawn peluru + induk kilat muzzle (weapons.js). Juga memiliki penanda
// "move to point" (klik kanan) berupa cincin berdenyut di tanah.

import { camera } from '../core/renderer.js';
import { GEO } from '../core/state.js';
import { aimPoint } from '../core/input.js';
import { eyeHCur, dodgeActive, dodgeProgress, dodgeDirX, dodgeDirZ } from './player.js';

export let avatarGroup = null;
export let avatarGunTip = null;   // Object3D ujung laras (dibaca weapons.js)
let legL = null, legR = null;
let phase = 0, lastX = 0, lastZ = 0;
let marker = null, markerT = 0;
const _qT = new THREE.Quaternion(), _tumbleAxis = new THREE.Vector3();   // animasi tumble dodge

export function initPlayerAvatar(sc) {
    // Phong warna polos = program shader sama dgn material dunia (tanpa compile baru)
    const mat = (c, sh = 10) => new THREE.MeshPhongMaterial({ color: c, shininess: sh, specular: 0x1c1a16 });
    const skin = mat(0xd09a66), shirt = mat(0x4a5138), vest = mat(0x23262b, 20),
        pants = mat(0x33383f), boots = mat(0x1b1d20), hair = mat(0x181512), gun = mat(0x15171a, 30);

    // Elipsoid (sphere di-skala) — bentuk membulat untuk kepala/bahu/telapak.
    const ellip = (r, sx, sy, sz, ws = 10, hs = 8) => { const g = new THREE.SphereGeometry(r, ws, hs); g.scale(sx, sy, sz); return g; };

    avatarGroup = new THREE.Group();   // menghadap +Z; di-lookAt ke titik bidik
    const mk = (geo, m, x, y, z, parent = avatarGroup, shadow = true) => {
        const b = new THREE.Mesh(geo, m);
        b.position.set(x, y, z);
        b.castShadow = shadow;
        parent.add(b);
        return b;
    };
    // OVERHAUL 2026-07-11: tentara membulat/stylized (silinder meruncing + elipsoid),
    // bukan balok Minecraft/Roblox. Proporsi & rig pivot (legL/legR, gunGrp,
    // avatarGunTip) DIPERTAHANKAN — mata ~11.4, spawn peluru tak bergeser.
    // Torso meruncing dipipihkan + rompi taktis (cangkang) + yoke bahu + leher
    const torsoG = new THREE.CylinderGeometry(1.55, 1.08, 4.3, 12, 1); torsoG.scale(1, 1, 0.66);
    mk(torsoG, shirt, 0, 7.7, 0);
    const vestG = new THREE.CylinderGeometry(1.68, 1.24, 3.0, 12, 1, true); vestG.scale(1, 1, 0.72);
    mk(vestG, vest, 0, 7.9, 0, avatarGroup, false);
    mk(ellip(1.02, 2.1, 0.74, 1.0, 12, 6), shirt, 0, 9.55, 0, avatarGroup, false);   // yoke bahu
    mk(new THREE.CylinderGeometry(0.52, 0.64, 1.0, 8), skin, 0, 9.9, 0, avatarGroup, false);   // leher
    // Kepala membulat + rambut kubah
    mk(ellip(1.12, 1.0, 1.14, 1.06, 12, 10), skin, 0, 10.7, 0);
    const hairG = new THREE.SphereGeometry(1.16, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.62); hairG.scale(1.0, 1.0, 1.04);
    mk(hairG, hair, 0, 10.62, -0.04, avatarGroup, false);
    // Kaki: pivot pinggul (rotation.x diayun saat berjalan) — paha+betis meruncing + boot
    const mkLeg = (sx) => {
        const hip = new THREE.Group();
        hip.position.set(sx, 6.0, 0);
        avatarGroup.add(hip);
        mk(new THREE.CylinderGeometry(0.78, 0.58, 3.0, 8), pants, 0, -1.5, 0, hip);
        mk(new THREE.CylinderGeometry(0.56, 0.44, 2.4, 8), pants, 0, -3.9, 0, hip, false);
        mk(ellip(0.62, 1.1, 0.66, 1.75, 8, 6), boots, 0, -5.05, 0.35, hip, false);
        return hip;
    };
    legL = mkLeg(-0.95);
    legR = mkLeg(0.95);
    // Lengan menodong ke depan (pose dua tangan di senapan) — silinder meruncing + telapak
    const mkArm = (sx, rx) => {
        const sh = new THREE.Group();
        sh.position.set(sx, 9.0, 0.4);
        sh.rotation.x = rx;
        avatarGroup.add(sh);
        mk(new THREE.CylinderGeometry(0.54, 0.42, 3.6, 8), shirt, 0, -1.5, 0, sh);
        mk(ellip(0.5, 1.0, 0.85, 1.0, 8, 6), skin, 0, -3.4, 0, sh, false);
        return sh;
    };
    mkArm(1.7, -1.35);
    mkArm(-1.4, -1.15);
    // Senapan kompak (visual; semua senjata memakai model ini dari atas). gunGrp &
    // avatarGunTip TIDAK boleh bergeser (titik spawn peluru terkalibrasi).
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
    // Menghadap titik bidik (grup dibangun menghadap +Z, sama spt rig robot).
    // Guard: kursor TEPAT di atas player = arah nol -> lookAt menghasilkan NaN;
    // pertahankan hadap terakhir bila jaraknya < 0.5 unit.
    if (aimPoint) {
        const adx = aimPoint.x - px, adz = aimPoint.z - pz;
        if (adx * adx + adz * adz > 0.25) avatarGroup.lookAt(aimPoint.x, feetY, aimPoint.z);
    }
    // DODGE tumble (2026-07-11): jungkir PENUH di ATAS hadap-bidik. Sumbu putar =
    // horizontal tegak lurus arah gulingan (kiri-kanan relatif arah); sudut 0..2π
    // sepanjang animasi — karena 360° penuh, avatar MULAI & SELESAI tegak
    // menghadap bidik (tanpa 'pop'). i-frame aktif sepanjang window ini (player.js).
    if (dodgeActive) {
        _tumbleAxis.set(dodgeDirZ, 0, -dodgeDirX);
        const al = Math.hypot(_tumbleAxis.x, _tumbleAxis.z);
        if (al > 1e-4) {
            _tumbleAxis.multiplyScalar(1 / al);
            _qT.setFromAxisAngle(_tumbleAxis, dodgeProgress * Math.PI * 2);
            avatarGroup.quaternion.premultiply(_qT);   // putaran ruang-dunia SETELAH hadap
        }
    }
    // Ayunan kaki menurut kecepatan horizontal NYATA (WASD ataupun klik-kanan);
    // dilewati saat tumble (kaki netral, badan berguling utuh).
    const sp = dt > 0 ? Math.hypot(px - lastX, pz - lastZ) / dt : 0;
    lastX = px; lastZ = pz;
    if (dodgeActive) {
        legL.rotation.x = 0;
        legR.rotation.x = 0;
    } else if (sp > 1) {
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
