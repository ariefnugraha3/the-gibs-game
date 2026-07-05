// Campaign bersama: pembangunan kedua dunia stage (sekali), penempatan ulang
// entitas (restart), pabrik zombie campaign, dan AI zombie campaign generik
// (idle -> aktif -> kejar) yang diparametrikan hook milik stage.

import { CFG, CAMP_M } from '../../core/config.js';
import { player, zombies } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { buildHumanZombie } from '../../entities/zombies.js';
import { navAim, turnToward } from '../../utils/pathfind.js';

// Catatan arsitektur: KEDUA dunia stage dibangun sekali di awal campaign dan
// hidup berdampingan di satu THREE.Scene, dipisah jarak ~26 km (gedung stage 1
// di x≈30000). camera.far 4000 + culling zombie menyembunyikan stage yang
// jauh. Orkestrasi build/penempatan ada di stage1.js (scene masuk campaign).

// Zombie campaign: DIAM di tempat (state 'idle') sampai player mendekat /
// tertembak. HP & kecepatan dari CFG.campaign; tag z.stage utk hitungan HUD
// dan pembersihan saat pindah stage.
export function spawnCampaignZombie(x, z, stage) {
    const built2 = buildHumanZombie();
    const zMesh = built2.group;
    zMesh.position.set(x, 0, z);
    zMesh.rotation.y = Math.random() * 6.283;   // arah hadap acak saat diam
    scene.add(zMesh);
    zombies.push({
        // Campaign lebih gesit dari survival wave-1 (zombieSpeedScale 0.5 vs 0.3)
        mesh: zMesh, hp: CFG.campaign.zombieHp, maxHp: CFG.campaign.zombieHp,
        speed: (0.6 + Math.random() * 0.4) * CFG.campaign.zombieSpeedScale,
        rig: built2.rig, isModel: true, baseY: 0, phase: Math.random() * 6.28,
        state: 'idle', stage, jumpT: 0, jumpDur: 0.55,
        sx: x, sz: z, lx: x, lz: z,
        jumpY0: 0, jumpY1: 0, arcH: 0, groundY: 0, vaultCd: 0,
        attackCd: 0, clawT: 0, clawSide: 1, moving: false
    });
}

// AI zombie campaign generik. `stage` menyuplai:
//   walkable(x,z,r)  — area boleh-jalan stage (grid gedung / union jalan raya)
//   resolve(pos,r,f) — penghalang pejal stage (furnitur / median+mobil+bak)
//   los(x1,z1,x2,z2) — OPSIONAL garis-pandang (stage 1 indoor); tanpa los =
//                      aktivasi murni jarak (stage 2)
//   nav              — OPSIONAL nav-grid pathfinder (utils/pathfind.js);
//                      tanpa nav = selalu kejar lurus (perilaku lama)
// Return kontrak zombies.js: {skip} utk idle jauh; {chaseDist} saat mengejar.
export function campaignZombieAI(z, dt, step, stage) {
    // Culling jarak jauh (peta besar, banyak zombie statis) — ini juga yang
    // menyembunyikan zombie milik stage satunya (≈26 km jauhnya).
    const dCull = Math.hypot(z.mesh.position.x - camera.position.x,
        z.mesh.position.z - camera.position.z);
    z.mesh.visible = dCull < CFG.campaign.cullDistance;
    if (z.state === 'idle') {
        z.moving = false;
        // Stage 1 (indoor): bangun hanya bila MELIHAT player (LOS grid) atau
        // sangat dekat menembus dinding tipis; stage 2 cukup jarak.
        if (dCull < CFG.campaign.activateMeters * CAMP_M && (!stage.los || dCull < 30 ||
            stage.los(z.mesh.position.x, z.mesh.position.z, camera.position.x, camera.position.z))) {
            z.state = 'chasing'; z.groundY = 0;
        }
        else if (dCull > CFG.campaign.cullDistance) return { skip: true };   // jauh & diam: lewati animasi/hit test
    }
    if (z.state === 'idle') {
        // Diam di tempat: hanya animasi napas (moving=false) + tetap bisa
        // ditembak (hit test peluru di zombies.js). Tak bergerak/mencakar.
        return {};
    }

    // Kejar player; berhenti tepat di jangkauan cakar. Zombie yang BARU
    // teraktivasi frame ini langsung masuk cabang kejar (perilaku lama).
    const oldZX = z.mesh.position.x, oldZZ = z.mesh.position.z;
    const dx = camera.position.x - z.mesh.position.x;
    const dz = camera.position.z - z.mesh.position.z;
    const distToEye = Math.hypot(dx, dz);
    // Pathfinder: direct = garis lurus bebas (kejar player langsung);
    // selain itu menuju waypoint agar memutari tembok/median. Gerak memakai
    // heading berlaju-putar-terbatas (turnToward) -> belokan melengkung alami.
    const aim = navAim(z, stage.nav, camera.position.x, camera.position.z, dt, step);
    z.moving = !aim.direct || distToEye > player.radius + CFG.zombie.stopRange;
    if (z.moving) {
        const ang = turnToward(z,
            Math.atan2(aim.z - z.mesh.position.z, aim.x - z.mesh.position.x), dt);
        z.mesh.position.x += Math.cos(ang) * z.speed * step;
        z.mesh.position.z += Math.sin(ang) * z.speed * step;
        z.mesh.lookAt(z.mesh.position.x + Math.cos(ang) * 10, z.mesh.position.y,
            z.mesh.position.z + Math.sin(ang) * 10);
    } else {
        z.mesh.lookAt(camera.position.x, z.mesh.position.y, camera.position.z);
    }

    // Penghalang pejal stage, lalu jepit ke area boleh-jalan per-sumbu
    // (menyusur dinding gedung/tepi jalan, tidak menembus tembok ruangan).
    stage.resolve(z.mesh.position, 3.5, 0);
    if (!stage.walkable(z.mesh.position.x, z.mesh.position.z, 3)) {
        if (stage.walkable(z.mesh.position.x, oldZZ, 3)) z.mesh.position.z = oldZZ;
        else if (stage.walkable(oldZX, z.mesh.position.z, 3)) z.mesh.position.x = oldZX;
        else { z.mesh.position.x = oldZX; z.mesh.position.z = oldZZ; }
    }
    z.mesh.position.y = z.baseY;

    return { chaseDist: distToEye };
}

// Hitung sisa zombie milik satu stage (teks status HUD)
export function countStageZombies(stage) {
    let n = 0;
    for (let i = 0; i < zombies.length; i++) if (zombies[i].stage === stage) n++;
    return n;
}
