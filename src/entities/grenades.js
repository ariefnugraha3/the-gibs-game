// Granat: model Mk2 "nanas" bersama, lemparan balistik ber-sumbu (fuse),
// fisika pantul/gelinding, dan kepejalan granat yang sudah mendarat.

import { CFG } from '../core/config.js';
import { player, grenades, zombies, _v3 } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { playSFX, sfxThrow, sfxNadeRoll } from '../utils/sfx.js';
import { updateUI } from '../core/hud.js';
import { explodeAt } from './effects.js';

export const NADE_R = 1.5;   // radius fisik = radius geometri body (bukan tuning)

// ----- Model granat (lemparan & item drop): gaya Mk2 "nanas" -----
// Geometri & material DIBAGI antar semua granat (dibuat sekali di sini);
// buildGrenadeMesh hanya merakit Group — jangan pernah dispose bahan ini.
const NADE_GEO = {
    body: new THREE.SphereGeometry(1.5, 12, 10),
    ringEq: new THREE.TorusGeometry(1.48, 0.1, 6, 18),    // sabuk khatulistiwa / alur vertikal
    ringSm: new THREE.TorusGeometry(1.3, 0.09, 6, 16),    // alur atas & bawah
    neck: new THREE.CylinderGeometry(0.42, 0.54, 0.5, 8),
    head: new THREE.CylinderGeometry(0.52, 0.52, 0.55, 8),
    lever: new THREE.BoxGeometry(0.3, 1.55, 0.34),
    pin: new THREE.TorusGeometry(0.3, 0.07, 6, 12)
};
const NADE_MAT = {
    body: new THREE.MeshLambertMaterial({ color: 0x4a5c2e, emissive: 0x121a0a }),   // hijau zaitun
    groove: new THREE.MeshLambertMaterial({ color: 0x33421e, emissive: 0x0c1208 }),
    steel: new THREE.MeshLambertMaterial({ color: 0x9aa1a8, emissive: 0x14161a }),
    lever: new THREE.MeshLambertMaterial({ color: 0x707a3c, emissive: 0x10120a }),
    pin: new THREE.MeshLambertMaterial({ color: 0xd8b03a, emissive: 0x241a06 })
};

export function buildGrenadeMesh(scale = 1) {
    const grp = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0, rz = 0, shadow = false) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.x = rx; m.rotation.z = rz;
        m.castShadow = shadow;   // hanya badan yang cast (detail kecil tak terlihat bayangannya)
        grp.add(m);
        return m;
    };
    add(NADE_GEO.body, NADE_MAT.body, 0, 0, 0, 0, 0, true);
    add(NADE_GEO.ringEq, NADE_MAT.groove, 0, 0, 0, Math.PI / 2);     // sabuk tengah
    add(NADE_GEO.ringSm, NADE_MAT.groove, 0, 0.66, 0, Math.PI / 2);  // alur atas
    add(NADE_GEO.ringSm, NADE_MAT.groove, 0, -0.66, 0, Math.PI / 2); // alur bawah
    add(NADE_GEO.ringEq, NADE_MAT.groove, 0, 0, 0);                  // alur vertikal
    add(NADE_GEO.neck, NADE_MAT.steel, 0, 1.62, 0);                  // leher fuse
    add(NADE_GEO.head, NADE_MAT.steel, 0, 2.02, 0);                  // kepala fuse
    add(NADE_GEO.lever, NADE_MAT.lever, 0.66, 1.28, 0, 0, -0.42);    // tuas (spoon)
    add(NADE_GEO.pin, NADE_MAT.pin, 0, 2.05, 0.56);                  // cincin pin
    grp.scale.setScalar(scale);
    return grp;
}

export function handleThrowGrenade() {
    if (player.grenades <= 0) return;
    player.grenades--;
    playSFX(sfxThrow);
    updateUI();

    // Lemparan balistik: kecepatan awal searah pandang + dorongan ke atas.
    // Granat TIDAK meledak saat menyentuh apa pun — hanya saat sumbunya habis
    // (updateGrenades); membidik ke atas = lemparan lebih jauh.
    camera.getWorldDirection(_v3);
    const gMesh = buildGrenadeMesh();
    gMesh.rotation.y = Math.random() * 6.283;   // orientasi awal acak
    gMesh.position.copy(camera.position).addScaledVector(_v3, 3);
    scene.add(gMesh);
    grenades.push({
        mesh: gMesh, fuse: CFG.grenade.fuseSec, rolled: false,
        vx: _v3.x * CFG.grenade.throwSpeed,
        vy: _v3.y * CFG.grenade.throwSpeed + CFG.grenade.throwUpward,
        vz: _v3.z * CFG.grenade.throwSpeed
    });
}

// Dorong granat pejal (yang sudah di tanah) keluar dari pendorong (player/zombie).
// Koreksi posisi (granat tak tembus badan) + dorongan KECIL yang DICAP di
// CFG.grenade.pushSpeed searah dorong: menggelinding wajar sesaat lalu berhenti
// oleh gesekan di loop granat. Cap (bukan impuls ∝ kecepatan pendorong) yang
// menjaga agar lari kencang menabrak granat TIDAK menendangnya jauh.
export function nudgeGrenade(g, px, pz, radius) {
    const dx = g.mesh.position.x - px, dz = g.mesh.position.z - pz;
    const d = Math.hypot(dx, dz), minD = radius + NADE_R;
    if (d >= minD || d < 1e-4) return;
    const nx = dx / d, nz = dz / d;
    g.mesh.position.x = px + nx * minD;   // geser tepat ke tepi pendorong (pejal)
    g.mesh.position.z = pz + nz * minD;
    const cur = g.vx * nx + g.vz * nz;    // laju granat yang sudah searah dorong
    if (cur < CFG.grenade.pushSpeed) {    // naikkan sampai cap saja; jangan menendang/menahan
        const add = CFG.grenade.pushSpeed - cur;
        g.vx += nx * add; g.vz += nz * add;
    }
}

// --- Loop granat: balistik + sumbu (fuse), BUKAN on-impact ---
export function updateGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
        const g = grenades[i];
        g.fuse -= dt;
        if (g.fuse <= 0) {   // meledak di mana pun ia berada saat sumbu habis
            explodeAt(g.mesh.position);
            scene.remove(g.mesh);
            grenades.splice(i, 1);
            continue;
        }

        // Integrasi gerak (detik nyata, gravitasi sama dgn player)
        const oldGX = g.mesh.position.x, oldGZ = g.mesh.position.z;
        g.vy -= CFG.player.gravity * dt;
        g.mesh.position.x += g.vx * dt;
        g.mesh.position.y += g.vy * dt;
        g.mesh.position.z += g.vz * dt;

        // Granat PEJAL setelah menyentuh tanah: player & zombie (yang tak melayang)
        // yang menabraknya mendorongnya keluar + nudge kecil. Diproses SEBELUM
        // resolve tembok/lantai di bawah agar hasil dorongan langsung dibersihkan
        // dari tembok/pohon/median (granat tak terdorong menembus dinding).
        if (g.rolled && g.mesh.position.y < NADE_R + 5) {
            nudgeGrenade(g, camera.position.x, camera.position.z, player.radius);
            for (let zi = 0; zi < zombies.length; zi++) {
                const zb = zombies[zi];
                if (zb.state === 'jumping') continue;   // zombie melayang tak mendorong
                nudgeGrenade(g, zb.mesh.position.x, zb.mesh.position.z, 3.5);
            }
        }

        // Pantulan dinding/tepi area + penghalang pejal milik scene aktif
        // (survival: pagar+Monas+pohon/bak; campaign: dinding grid / tepi jalan
        // + median/mobil/furnitur + plafon stage 1).
        activeScene.grenadeCollide(g, oldGX, oldGZ);

        // Lantai (tanah / puncak median-campaign atau bak-survival): memantul
        // beberapa kali, lalu menggelinding
        const gFloor = activeScene.groundHeight(g.mesh.position.x, g.mesh.position.z,
            g.mesh.position.y - NADE_R) + NADE_R;
        if (g.mesh.position.y <= gFloor) {
            g.mesh.position.y = gFloor;
            // Bunyi menggelinding SEKALI di kontak lantai pertama — dan HANYA
            // bila player cukup dekat (radius dengar 90 unit); lemparan jauh
            // tidak terdengar. Volume mengecil dgn jarak.
            if (!g.rolled) {
                g.rolled = true;
                const dN = Math.hypot(g.mesh.position.x - camera.position.x,
                    g.mesh.position.z - camera.position.z);
                if (dN < 90) playSFX(sfxNadeRoll, Math.max(0.08, 0.6 * (1 - dN / 90)));
            }
            if (g.vy < -9) {                       // masih laju -> pantul (redam energi)
                g.vy = -g.vy * 0.42;
                g.vx *= 0.72; g.vz *= 0.72;
            } else {                               // menggelinding: gesekan memperlambat
                g.vy = 0;
                const fr = Math.max(0, 1 - 2.0 * dt);
                g.vx *= fr; g.vz *= fr;
            }
        }

        // Rotasi menggelinding: sumbu tegak lurus arah gerak, sudut = jarak / radius
        const ghv = Math.hypot(g.vx, g.vz);
        if (ghv > 0.4) {
            _v3.set(g.vz / ghv, 0, -g.vx / ghv);
            g.mesh.rotateOnWorldAxis(_v3, ghv * dt / NADE_R);
        }
    }
}
