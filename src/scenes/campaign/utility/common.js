// Campaign bersama: pembangunan kedua dunia stage (sekali), penempatan ulang
// entitas (restart), pabrik robot campaign, dan AI robot campaign generik
// (idle -> aktif -> kejar) yang diparametrikan hook milik stage.

import { CFG, CAMP_M } from '../../../core/config.js';
import { player, robots } from '../../../core/state.js';
import { scene, camera, camFocusPos, groundViewExtents } from '../../../core/renderer.js';
import { buildRobotMesh, reachForScale } from '../../../entities/robots.js';
import { spawnLoot } from '../../../entities/drops.js';
import { navAim, turnToward } from '../../../utils/pathfind.js';

// Catatan arsitektur: KEDUA dunia stage dibangun sekali di awal campaign dan
// hidup berdampingan di satu THREE.Scene, dipisah jarak ~26 km (gedung stage 1
// di x≈30000). camera.far 4000 + culling robot menyembunyikan stage yang
// jauh. Orkestrasi build/penempatan ada di stage1/index.js (scene masuk campaign).

// Radius tabrakan player terhadap PERABOT indoor (2026-08-11, permintaan user:
// "celah di antara perabotan terlihat cukup dilewati, tapi player tidak bisa").
// Ternyata bukan blocker-nya yang kegemukan — footprint perabot PERSIS mesh-nya
// (`hx = sx/2`). Yang kegemukan `player.radius` 5: bagian terlebar avatar cuma
// rompi radius 1,66 (+lengan ~2,5), jadi collider-nya 2x lebar tubuh yang
// terlihat dan menuntut celah 10 unit (1,43 m) untuk lewat.
//
// `player.radius` TIDAK diturunkan sebab ia bukan cuma ukuran badan: ia juga
// titik acuan jangkauan robot (`reachForScale` di robots.js dirancang supaya
// scl 1 menghasilkan TEPAT 1.0 pada radius 5) dan dipakai survival + semua
// stage lain. Jadi bentrokan-ke-PERABOT dipisah ke angka sendiri; dinding grid,
// pintu, peti & barel tetap memakai `player.radius` penuh.
export function propClearance() {
    const r = CFG.player.propRadius;
    return (typeof r === 'number' && r > 0) ? Math.min(r, player.radius) : player.radius;
}

// PENANDA KOTAK BERDIRI 12x12 — bahasa visual TUNGGAL untuk "berdiri di sini
// supaya sesuatu terjadi" di seluruh campaign (Stage 1 komputer, Stage 2
// generator, Stage 5 C1/C2, Stage 6 HQ terminal hack + konsol upload). Sengaja
// sebuah AREA PIJAK berbar tebal, bukan cincin waypoint: cincin berarti "pergi
// ke sana", kotak berarti "injak petak ini".
//
// Lahir `visible = false` (pemanggil yang menyalakannya sesuai fase) dan TIDAK
// pernah diputar — bidangnya rebah di lantai, jadi memutar sumbu z akan
// mendirikannya. Animasinya cukup opasitas; `pulseStandMarker` di bawah adalah
// denyut bakunya. `g.material` dialias ke material isian supaya animator/debug
// lama tetap jalan tanpa membuat material baru.
// `sizeX`/`sizeZ` OPSIONAL (2026-08-31): sebagian petak pijak bukan kotak kecil
// melainkan JEJAK sebuah benda — mis. area naik Stage 9 yang seluas badan
// pesawat. Ukuran default tetap kotak 12x12, jadi tak satu pun pemanggil lama
// berubah, dan ukuran yang dipakai direkam di userData supaya "yang digambar
// adalah yang memicu" dapat diuji dari mesh-nya sendiri.
export const STAND_MARKER_SIZE = 12;
export function buildStandMarker(parent, x, z, color,
    sizeX = STAND_MARKER_SIZE, sizeZ = sizeX) {
    const g = new THREE.Group();
    const SX = Math.max(1, sizeX), SZ = Math.max(1, sizeZ);
    const fillMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false,
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(SX, SZ), fillMat);
    fill.rotation.x = -Math.PI / 2; fill.position.y = 0.14; g.add(fill);
    const barMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const [sx, sz, px, pz] of [
        [SX, 1, 0, -SZ / 2], [SX, 1, 0, SZ / 2],
        [1, SZ, -SX / 2, 0], [1, SZ, SX / 2, 0],
    ]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), barMat);
        bar.position.set(px, 0.22, pz); g.add(bar);
    }
    g.material = fillMat; g.userData.fill = fill; g.userData.bars = 4;
    g.userData.standMarker = true;
    g.userData.sizeX = SX; g.userData.sizeZ = SZ;
    g.position.set(x, 0, z); g.visible = false;
    if (parent) parent.add(g);
    return g;
}

export function pulseStandMarker(m, t, phase = 0) {
    if (m?.visible) m.material.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t + phase));
}

// Robot campaign: DIAM di tempat (state 'idle') sampai player mendekat /
// tertembak. HP/speed/attack per KELAS (CFG.robot.classes); tag z.stage utk
// hitungan HUD & pembersihan saat pindah stage.
// cls: 'C' (default melee) | 'B' | 'A' (penembak, CFG.robot.classes) | 'boss'
// (CFG.campaign.bosses.giant — langsung 'chasing', melee, granat luka berkurang
// [boss.grenadeDamage], skor & jangkauan khusus).
// `active` (2026-07-22): true = langsung 'chasing' (bukan 'idle') — dipakai
// SWARM/horde (spawnSwarm) supaya robot langsung menyerbu, bukan menunggu LOS.
export function spawnCampaignRobot(x, z, stage, cls = 'C', active = false) {
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
        state: (B || active) ? 'chasing' : 'idle', stage, jumpT: 0, jumpDur: 0.55,
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

// ===== PENGALI JUMLAH ROBOT PER STAGE (2026-08-16, permintaan user) =====
// `CFG.campaign.stageN.robotCountMul` mengalikan SELURUH populasi robot yang
// DITEMPATKAN stage itu — garnisun awal, gelombang bala bantuan, dan horde —
// tanpa menyentuh satu pun tabel titik spawn: satu angka per stage, jadi user
// bisa menaikkan/menurunkan kepadatan tempur sebuah stage lewat config saja.
// Yang SENGAJA di luar jangkauannya: pabrik/spawn-machine yang mencetak robot
// tanpa batas sampai dihancurkan (jumlahnya bukan angka, melainkan laju yang
// sudah dipagari `machineMaxAlive`), dan konsist musuh Stage 5 (jumlah gerbong
// = konstanta GEOMETRI `ET_CARGO_CARS`, mesh-nya dipreallokasi).
export function stageRobotMul(stage) {
    const s = CFG.campaign['stage' + stage];
    const m = s && s.robotCountMul;
    return m != null && m > 0 ? m : 1;
}

// Kalikan SATU angka jumlah robot (mis. `gateWaveCount`). Tabel yang aslinya
// berisi robot tak boleh menguap jadi nol karena pembulatan.
export function scaleRobotCount(n, stage) {
    const base = Math.max(0, n | 0);
    if (!base) return 0;
    return Math.max(1, Math.round(base * stageRobotMul(stage)));
}

// Kalikan SEDERET jumlah (per titik spawn, atau per kelas C/B/A) dengan
// pembulatan AKUMULATIF: totalnya PERSIS `Math.round(total × mul)` dan porsi
// tiap entri tetap proporsional. Membulatkan tiap entri sendiri-sendiri akan
// menggelembungkan total (mis. 3 × 1,5 = 4,5 dibulatkan NAIK di setiap spot),
// dan itu mengubah komposisi kelas sebuah encounter.
export function scaleSpawnCounts(counts, stage) {
    const mul = stageRobotMul(stage);
    const out = [];
    let running = 0, placed = 0;
    for (const n of counts) {
        running += Math.max(0, n | 0);
        const want = Math.max(0, Math.round(running * mul) - placed);
        out.push(want); placed += want;
    }
    return out;
}

// GANJARAN kill campaign (SECOND-IMPROVEMENT-PLAN point 1, 2026-07-22): campaign
// TAK memberi skor langsung — jatuhkan LOOT/uang (CFG.drops.loot per KELAS) di
// posisi robot; player memungutnya (magnet, drops.js) → jadi uang belanja shop
// (ala Alien Shooter). Boss = pecahan banyak keping. Dipakai stage*.awardKill.
export function campaignAwardKill(z) {
    const L = CFG.drops.loot || {};
    const value = L[z.kind] != null ? L[z.kind] : (L.C || 15);
    spawnLoot(z.mesh.position.x, z.mesh.position.z, value, z.kind === 'boss' ? 8 : 1);
}

// SWARM / HORDE (SECOND-IMPROVEMENT-PLAN point 3, 2026-07-22): sebar sekelompok
// robot yang LANGSUNG MENYERBU (active=true → 'chasing', bukan idle) dari daftar
// titik `spots` [[cellC, cellR, n], ...]. `cellFn(c,r)`→{x,z} dunia, `walkFn`/
// `resolveFn` menjepit spawn ke lantai sah. Reusable untuk stage mana pun.
export function spawnSwarm(spots, stage, cellFn, walkFn, resolveFn, scratch, cls = 'C') {
    for (const [c, r, n] of spots) {
        const p = cellFn(c, r);
        for (let k = 0; k < n; k++) {
            scratch.set(p.x + (Math.random() - 0.5) * 14, 0, p.z + (Math.random() - 0.5) * 14);
            if (resolveFn) resolveFn(scratch, 4, 0);
            if (walkFn && !walkFn(scratch.x, scratch.z, 4)) scratch.set(p.x, 0, p.z);
            // `cls` boleh FUNGSI (2026-07-30): diundi ULANG per robot -> satu
            // gerombolan bisa bercampur kelas (stage 3 memakai classMix-nya).
            spawnCampaignRobot(scratch.x, scratch.z, stage, typeof cls === 'function' ? cls() : cls, true);   // active = langsung menyerbu
        }
    }
}

// ===== SPAWN DI LUAR PANDANGAN KAMERA (2026-07-28, alarm hack gagal) =====
// Player TIDAK BOLEH melihat robot "muncul begitu saja" di layar: titik spawn
// harus di luar TAPAK-PANDANG kamera. `groundViewExtents` (renderer.js) memberi
// ofset min/maks tapak pandang relatif titik fokus kamera — di luar rect itu
// (+ margin) = di luar layar. Kandidat dicari pada CINCIN di sekitar player,
// arah demi arah (urutan diacak) supaya horde datang dari berbagai sisi, bukan
// menumpuk di satu titik. Titik yang tak lolos `walkable` dilewati, jadi ini
// aman di gedung indoor (robot lalu mengejar lewat nav-grid stage).
// o: { walkable(x,z,r), resolve?(pos,r,feetY), scratch (Vector3),
//      minUnits?, maxUnits?, margin? }
export function offscreenSpawnPoints(count, o) {
    const out = [];
    if (count <= 0) return out;
    const f = camFocusPos();
    const e = groundViewExtents(f.y, 0);
    const m = o.margin != null ? o.margin : 24;
    const rx0 = f.x + e.minX - m, rx1 = f.x + e.maxX + m;
    const rz0 = f.z + e.minZ - m, rz1 = f.z + e.maxZ + m;
    const offscreen = (x, z) => x < rx0 || x > rx1 || z < rz0 || z > rz1;
    const rMin = o.minUnits != null ? o.minUnits : 120;
    const rMax = o.maxUnits != null ? o.maxUnits : 60 * CAMP_M;
    const DIRS = 24;
    const order = [];
    for (let i = 0; i < DIRS; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [order[i], order[j]] = [order[j], order[i]];
    }
    const a0 = Math.random() * 6.283;
    const px = camera.position.x, pz = camera.position.z;
    // Dua sapuan: sapuan pertama satu titik per arah (menyebar), sapuan kedua
    // mengisi sisa bila arah yang lolos lebih sedikit dari jumlah yang diminta.
    for (let pass = 0; pass < 2 && out.length < count; pass++) {
        for (const i of order) {
            if (out.length >= count) break;
            const ang = a0 + (i / DIRS) * 6.283 + (pass ? 0.13 : 0);
            const dx = Math.sin(ang), dz = Math.cos(ang);
            for (let rad = rMin; rad <= rMax; rad += 14) {
                const x = px + dx * rad, z = pz + dz * rad;
                if (!offscreen(x, z)) continue;
                o.scratch.set(x, 0, z);
                if (o.resolve) o.resolve(o.scratch, 4, 0);
                if (!o.walkable(o.scratch.x, o.scratch.z, 4)) continue;
                if (!offscreen(o.scratch.x, o.scratch.z)) continue;   // resolve bisa menariknya kembali ke layar
                out.push({ x: o.scratch.x, z: o.scratch.z });
                break;
            }
        }
    }
    return out;
}

// HORDE ALARM (2026-07-28, permintaan user): hack yang GAGAL karena ICE TRACE
// habis menyalakan alarm — sekelompok robot muncul DI LUAR LAYAR lalu
// LANGSUNG menyerbu player (persis horde stage 1/3). Kembalikan jumlah yang
// benar-benar di-spawn. Titik sah dipakai ulang bila jumlah uniknya kurang;
// `fallbackSpots` (sel [[c,r,n]]) dipakai HANYA bila tak ada satu pun titik
// luar-layar yang sah — mis. player terpojok di ruangan kecil.
export function spawnAlarmHorde(stage, o) {
    const n = o.count | 0;
    if (n <= 0) return 0;
    const pts = offscreenSpawnPoints(n, o);
    // `o.cls` boleh FUNGSI pengundi kelas (2026-07-30) — diundi per robot, jadi
    // satu skuad bisa bercampur kelas alih-alih seragam kelas C.
    const pick = () => (typeof o.cls === 'function' ? o.cls() : (o.cls || 'C'));
    for (const p of pts) spawnCampaignRobot(p.x, p.z, stage, pick(), true);
    let left = n - pts.length;
    // Bila hanya sebagian kandidat sah ditemukan, pakai ulang kandidat sah itu
    // untuk sisanya. Menumpuk sesaat lebih aman daripada memunculkan satu robot
    // di dalam layar; pemisahan robot merenggangkan gerombolan sesudah spawn.
    if (left > 0 && pts.length > 0) {
        for (let i = 0; i < left; i++) {
            const p = pts[i % pts.length];
            spawnCampaignRobot(p.x, p.z, stage, pick(), true);
        }
        left = 0;
    }
    if (left > 0 && o.fallbackSpots && o.fallbackSpots.length && o.cellFn) {
        const per = Math.floor(left / o.fallbackSpots.length), rem = left % o.fallbackSpots.length;
        const spots = o.fallbackSpots.map((a, i) => [a[0], a[1], per + (i < rem ? 1 : 0)]);
        spawnSwarm(spots, stage, o.cellFn, o.walkable, o.resolve, o.scratch, o.cls || 'C');   // fungsi pengundi diteruskan apa adanya
    }
    return n;
}

// AI robot campaign generik. `stage` menyuplai:
//   walkable(x,z,r)  — area boleh-jalan stage (grid gedung / union jalan raya)
//   resolve(pos,r,f) — penghalang pejal stage (furnitur / median+mobil+bak)
//   los(x1,z1,x2,z2) — OPSIONAL garis-pandang (stage 1 indoor); tanpa los =
//                      aktivasi murni jarak (stage 2)
//   activate(z,d)     — OPSIONAL predikat aktivasi idle milik scene; bila ada,
//                      menggantikan gerbang jarak+LOS (Stage 7 = masuk kamera)
//   nav              — OPSIONAL nav-grid pathfinder (utils/pathfind.js);
//                      tanpa nav = selalu kejar lurus (perilaku lama)
//   pathWalkable     — OPSIONAL hambatan dinamis A* (terutama pintu tertutup)
// Return kontrak robots.js: {skip} utk idle jauh; {chaseDist} saat mengejar.
export function campaignRobotAI(z, dt, step, stage) {
    // Culling jarak jauh (peta besar, banyak robot statis) — ini juga yang
    // menyembunyikan robot milik stage satunya (≈26 km jauhnya).
    const dCull = Math.hypot(z.mesh.position.x - camera.position.x,
        z.mesh.position.z - camera.position.z);
    z.mesh.visible = dCull < CFG.campaign.cullDistance;
    if (z.state === 'idle') {
        z.moving = false; z.navIdle = false;
        // Robot melee indoor tetap bangun hanya bila melihat player. Penembak
        // A/B yang punya nav-grid bangun dalam radius aktivasi walau LOS tertutup:
        // mereka harus mencoba mencari sudut tembak; bila A* gagal, cabang
        // navIdle di bawah membuatnya tetap diam sambil animasi idle.
        const activate = stage.activate
            ? stage.activate(z, dCull)
            : dCull < CFG.campaign.activateMeters * CAMP_M
                && (!stage.los || (z.ranged && stage.nav)
                    || stage.los(z.mesh.position.x, z.mesh.position.z,
                        camera.position.x, camera.position.z));
        if (activate) {
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
    const aim = navAim(z, stage.nav, camera.position.x, camera.position.z,
        dt, step, stage.pathWalkable);
    // GARIS TEMBAK != GARIS JALAN (bugfix 2026-07-27, laporan user): dulu
    // penembak B/A memakai `aim.direct` — LOS NAV-GRID setebal badan robot, yang
    // ikut memblok FURNITUR (meja/lemari). Akibatnya robot ranged di balik meja
    // mengira tembakannya terhalang lalu MENGITARI meja seperti robot melee C,
    // padahal peluru robot HANYA diblok dinding & pintu tertutup
    // (`bulletBlocked` stage 1-3; stage 4 outdoor tak memblok apa pun). Kini
    // gerbangnya = hook `stage.los` — predikat yang SAMA dengan peluru — jadi
    // penembak berdiri diam menembaki player melewati meja di depannya.
    // Tanpa hook los (stage 4) = garis tembak selalu bebas.
    const shotOK = !z.ranged ? aim.direct
        : (stage.los ? stage.los(z.mesh.position.x, z.mesh.position.z,
            camera.position.x, camera.position.z) : true);
    // PENEMBAK (B/A): berhenti di radius tembaknya (0.95×range) bila garis
    // TEMBAK bebas, lalu menembak dari tempat (gerbang tembak = z.losOK di
    // robots.js); melee merapat sampai jangkauan cakar seperti biasa.
    const stopD = z.ranged && shotOK ? (z.range || 70) * 0.95
        : player.radius + CFG.robot.stopRange * (z.reachMul || 1);

    // Tidak ada rute = jangan fallback mendorong dinding/pintu. Pengecualian
    // hanya penembak yang SUDAH punya garis tembak bersih dan sudah berada di
    // radius tembak: ia tidak membutuhkan path, cukup menembak dari tempat.
    const canHoldShot = z.ranged && shotOK && distToEye <= stopD;
    if (!aim.reachable && !canHoldShot) {
        z.moving = false; z.aiming = false; z.navIdle = true;
        z.losOK = shotOK; z.windT = 0; z.clawT = 0;
        z.mesh.position.y = z.baseY;
        return { pathBlocked: true };
    }

    z.navIdle = false;
    z.moving = !shotOK || distToEye > stopD;
    z.losOK = shotOK;
    // Stance MEMBIDIK (lengan senapan terangkat, animateRobotRig): berdiri di
    // radius tembak dgn garis tembak bebas = mengacungkan senjata.
    if (z.ranged) z.aiming = !z.moving && shotOK;
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

// ===== LAMPU PER-RUANGAN (stage 1-3): MEKANISME "MATI LAMPU" DIHAPUS
// 2026-08-11 (permintaan user). Dulu tiap lampu ruangan lahir dgn intensity 0
// + selubung hitam pekat, lalu menyala saat pintunya terbuka/rect dimasuki
// (updateRoomLamps/resetRoomLamps + lm.doors + lm.shroud), dan lampu aula
// stage 1 berkedip lewat decor.js. Sekarang SEMUA lampu ruangan menyala penuh
// sejak dunia dibangun: tak ada selubung, tak ada state on/k, tak ada kedip —
// jadi tak ada lagi fungsi update/reset di sini.
// `sNLamps` tetap ada sbg DATA ruangan: [{L, base, x0, x1, z0, z1}] — rect-nya
// masih dipakai (mis. cek "tiap ruangan punya peti" di smoke). =====
