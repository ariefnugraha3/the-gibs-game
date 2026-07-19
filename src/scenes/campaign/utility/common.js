// Campaign bersama: pembangunan kedua dunia stage (sekali), penempatan ulang
// entitas (restart), pabrik robot campaign, dan AI robot campaign generik
// (idle -> aktif -> kejar) yang diparametrikan hook milik stage.

import { CFG, CAMP_M } from '../../../core/config.js';
import { player, robots } from '../../../core/state.js';
import { scene, camera } from '../../../core/renderer.js';
import { buildRobotMesh, reachForScale } from '../../../entities/robots.js';
import { navAim, turnToward } from '../../../utils/pathfind.js';

// Catatan arsitektur: KEDUA dunia stage dibangun sekali di awal campaign dan
// hidup berdampingan di satu THREE.Scene, dipisah jarak ~26 km (gedung stage 1
// di x≈30000). camera.far 4000 + culling robot menyembunyikan stage yang
// jauh. Orkestrasi build/penempatan ada di stage1.js (scene masuk campaign).

// Robot campaign: DIAM di tempat (state 'idle') sampai player mendekat /
// tertembak. HP/speed/attack per KELAS (CFG.robot.classes); tag z.stage utk
// hitungan HUD & pembersihan saat pindah stage.
// cls: 'C' (default melee) | 'B' | 'A' (penembak, CFG.robot.classes) | 'boss'
// (CFG.campaign.bosses.giant — langsung 'chasing', melee, granat luka berkurang
// [boss.grenadeDamage], skor & jangkauan khusus).
export function spawnCampaignRobot(x, z, stage, cls = 'C') {
    // Rangka robot per kelas ('boss' = frame melee gelap raksasa dari builder yang sama)
    const built2 = buildRobotMesh(cls);
    const zMesh = built2.group;
    zMesh.position.set(x, 0, z);
    zMesh.rotation.y = Math.random() * 6.283;   // arah hadap acak saat diam
    scene.add(zMesh);

    const B = cls === 'boss' ? CFG.campaign.bosses.giant : null;
    const C = B ? null : CFG.robot.classes[cls];
    const hp = B ? B.hp : C.hp;
    const speed = B ? B.speed : C.speed * CFG.campaign.robotSpeedScale;
    const scl = B ? B.scale : C.scale;
    if (scl !== 1) zMesh.scale.setScalar(scl);

    robots.push({
        mesh: zMesh, hp, maxHp: hp, speed,
        rig: built2.rig, isModel: true, baseY: 0, phase: Math.random() * 6.28,
        state: B ? 'chasing' : 'idle', stage, jumpT: 0, jumpDur: 0.55,
        sx: x, sz: z, lx: x, lz: z,
        jumpY0: 0, jumpY1: 0, arcH: 0, groundY: 0, vaultCd: 0,
        attackCd: 0, clawT: 0, windT: 0, clawSide: 1, moving: false,
        kind: B ? 'boss' : cls, scl,
        armor: B ? 0 : C.armor, attack: B ? B.clawDamage : C.attack,
        clawDmg: B ? B.clawDamage : C.attack,
        ranged: B ? false : C.ranged,
        fireDelaySec: B ? 0 : (C.fireDelaySec || 0), bulletSpeed: B ? 0 : (C.bulletSpeed || 0),
        range: B ? 0 : (C.rangeMeters || 0) * CAMP_M,   // radius tembak (m -> unit; 0 = melee)
        fireCd: B ? 0 : Math.random() * (C.fireDelaySec || 0),
        // reach mengikuti skala badan (lihat reachForScale) — badan besar tidak
        // boleh mendorong player keluar dari jangkauan cakarnya sendiri
        reachMul: reachForScale(scl, B ? B.reachMul : 1)
    });
}

// AI robot campaign generik. `stage` menyuplai:
//   walkable(x,z,r)  — area boleh-jalan stage (grid gedung / union jalan raya)
//   resolve(pos,r,f) — penghalang pejal stage (furnitur / median+mobil+bak)
//   los(x1,z1,x2,z2) — OPSIONAL garis-pandang (stage 1 indoor); tanpa los =
//                      aktivasi murni jarak (stage 2)
//   nav              — OPSIONAL nav-grid pathfinder (utils/pathfind.js);
//                      tanpa nav = selalu kejar lurus (perilaku lama)
// Return kontrak robots.js: {skip} utk idle jauh; {chaseDist} saat mengejar.
export function campaignRobotAI(z, dt, step, stage) {
    // Culling jarak jauh (peta besar, banyak robot statis) — ini juga yang
    // menyembunyikan robot milik stage satunya (≈26 km jauhnya).
    const dCull = Math.hypot(z.mesh.position.x - camera.position.x,
        z.mesh.position.z - camera.position.z);
    z.mesh.visible = dCull < CFG.campaign.cullDistance;
    if (z.state === 'idle') {
        z.moving = false;
        // Stage indoor (hook los ada): bangun HANYA bila MELIHAT player — bypass
        // "sangat dekat menembus dinding tipis" DIHAPUS 2026-07-19 (permintaan
        // user: robot di dalam ruangan tak boleh mengejar sebelum player
        // terlihat / memasuki ruangannya; stage 1-3 membungkus los dgn cek
        // pintu tertutup juga). Tertembak tetap membangunkan (robots.js);
        // tanpa hook los (stage 4 outdoor) aktivasi murni jarak spt semula.
        if (dCull < CFG.campaign.activateMeters * CAMP_M && (!stage.los ||
            stage.los(z.mesh.position.x, z.mesh.position.z, camera.position.x, camera.position.z))) {
            z.state = 'chasing'; z.groundY = 0;
        }
        else if (dCull > CFG.campaign.cullDistance) return { skip: true };   // jauh & diam: lewati animasi/hit test
    }
    if (z.state === 'idle') {
        // Diam di tempat: hanya animasi napas (moving=false) + tetap bisa
        // ditembak (hit test peluru di robots.js). Tak bergerak/mencakar.
        return {};
    }

    // Kejar player; berhenti tepat di jangkauan cakar. Robot yang BARU
    // teraktivasi frame ini langsung masuk cabang kejar (perilaku lama).
    const oldZX = z.mesh.position.x, oldZZ = z.mesh.position.z;
    const dx = camera.position.x - z.mesh.position.x;
    const dz = camera.position.z - z.mesh.position.z;
    const distToEye = Math.hypot(dx, dz);
    // Pathfinder: direct = garis lurus bebas (kejar player langsung);
    // selain itu menuju waypoint agar memutari tembok/median. Gerak memakai
    // heading berlaju-putar-terbatas (turnToward) -> belokan melengkung alami.
    const aim = navAim(z, stage.nav, camera.position.x, camera.position.z, dt, step);
    // PENEMBAK (B/A): berhenti di radius tembaknya (0.95×range) bila garis
    // pandang bebas, lalu menembak dari tempat (gerbang tembak = z.losOK di
    // robots.js); melee merapat sampai jangkauan cakar seperti biasa.
    const stopD = z.ranged && aim.direct ? (z.range || 70) * 0.95
        : player.radius + CFG.robot.stopRange * (z.reachMul || 1);
    z.moving = !aim.direct || distToEye > stopD;
    z.losOK = aim.direct;
    // Stance MEMBIDIK (lengan senapan terangkat, animateRobotRig): berdiri di
    // radius tembak dgn garis pandang bebas = mengacungkan senjata.
    if (z.ranged) z.aiming = !z.moving && aim.direct;
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

    // Penghalang pejal stage, PINTU TERTUTUP (robot tak bisa menembus, 2026-07-18),
    // lalu jepit ke area boleh-jalan per-sumbu (menyusur dinding gedung/tepi jalan).
    stage.resolve(z.mesh.position, 3.5, 0);
    if (stage.doorBlock) stage.doorBlock(z.mesh.position, 3.5);
    if (!stage.walkable(z.mesh.position.x, z.mesh.position.z, 3)) {
        if (stage.walkable(z.mesh.position.x, oldZZ, 3)) z.mesh.position.z = oldZZ;
        else if (stage.walkable(oldZX, z.mesh.position.z, 3)) z.mesh.position.x = oldZX;
        else { z.mesh.position.x = oldZX; z.mesh.position.z = oldZZ; }
    }
    z.mesh.position.y = z.baseY;

    return { chaseDist: distToEye };
}

// Jepit robot campaign ke area sah SETELAH dorongan separasi robot-robot
// (cegah nyangkut/tembus dinding, 2026-07-16). Sama seperti clamp gerak di
// campaignRobotAi: penghalang pejal `stage.resolve` lalu jepit per-sumbu ke area
// `stage.walkable`, dgn (oldX,oldZ) = posisi valid pra-separasi sbg jatuh-balik.
export function campaignClampRobot(z, oldX, oldZ, stage) {
    const p = z.mesh.position;
    stage.resolve(p, 3.5, 0);
    if (stage.doorBlock) stage.doorBlock(p, 3.5);   // pintu tertutup memblok robot (2026-07-18)
    if (!stage.walkable(p.x, p.z, 3)) {
        if (stage.walkable(p.x, oldZ, 3)) p.z = oldZ;
        else if (stage.walkable(oldX, p.z, 3)) p.x = oldX;
        else { p.x = oldX; p.z = oldZ; }
    }
}

// Hitung sisa robot milik satu stage (teks status HUD)
export function countStageRobots(stage) {
    let n = 0;
    for (let i = 0; i < robots.length; i++) if (robots[i].stage === stage) n++;
    return n;
}

// ===== LAMPU PER-RUANGAN (2026-07-19, permintaan user): semua lampu ruangan
// MATI saat stage dimulai dan MENYALA (fade ~0.5 dtk) saat SALAH SATU PINTU
// ruangannya MULAI TERBUKA (`lm.doors`, revisi 2026-07-19 — "menyala ketika
// pintu dibuka, bukan ketika player baru masuk": pintu geser terbuka saat
// player berdiri di depannya, jadi ruangan sudah terang SEBELUM dimasuki);
// masuk rect tanpa lewat pintu (aula/lobi/koridor bukaan terbuka + ruang
// spawn) tetap menyalakan sbg CADANGAN. Sekali menyala tetap menyala. Jumlah
// PointLight konstan (dibuat saat build; HANYA intensity yang dianimasikan).
// SELUBUNG GELAP (`lm.shroud` — "harus hitam total, bukan sekadar lampu
// mati"): kotak hitam pekat memenuhi ruangan yang belum terbuka (menutup
// interior dari ambient global + menyembunyikan isinya), MEMUDAR HILANG
// bersama lampu yang menyala.
// lamps: [{L, base, x0, x1, z0, z1, on, k, shroud?, doors?}] milik stage. =====
const DOOR_LIT = 0.3;   // pintu tergeser terbuka segini -> lampu ruangan menyala
export function updateRoomLamps(lamps, dt) {
    const px = camera.position.x, pz = camera.position.z;
    for (const lm of lamps) {
        if (!lm.on
            && ((lm.doors && lm.doors.some(d => d.open > DOOR_LIT))
                || (px >= lm.x0 && px <= lm.x1 && pz >= lm.z0 && pz <= lm.z1))) lm.on = true;
        if (lm.on && lm.k < 1) {
            lm.k = Math.min(1, lm.k + dt * 2.2);
            lm.L.intensity = lm.base * lm.k;
            if (lm.shroud) {
                lm.shroud.material.opacity = 1 - lm.k;
                lm.shroud.visible = lm.k < 1;
            }
        }
    }
}
export function resetRoomLamps(lamps) {
    for (const lm of lamps) {
        lm.on = false; lm.k = 0; lm.L.intensity = 0;
        if (lm.shroud) { lm.shroud.material.opacity = 1; lm.shroud.visible = true; }
    }
}
