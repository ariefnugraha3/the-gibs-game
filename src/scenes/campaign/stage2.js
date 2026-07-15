// SCENE: Campaign STAGE 2 — "Gedung Terbengkalai (Lantai 2)", indoor building.
// DIROMBAK TOTAL 2026-07-13 dari jalan-raya menjadi gedung dalam-ruangan yang
// mengikuti floor-plan referensi user (denah). Tata letak (atas->bawah,
// kiri->kanan):
//   ATAS:    TANGGA TURUN dari Lt.3 (START, kiri-atas) | OFFICE ROOM |
//            HALLWAY (koridor panjang, jebakan runtuhan) | STORAGE ROOM (arsip)
//   TENGAH:  WAITING AREA | OPEN OFFICE (banyak cover) | SUPPLY ROOM
//            (ammo/medkit); KORIDOR KANAN percabangan (spot 6)
//   BAWAH:   LAB / RESEARCH ROOM | CONTROL ROOM | TANGGA TURUN (END, kanan-
//            bawah -> ke stage 3). Grid sel 2 m: 1=dinding, 0=lantai — dinding
//            visual, collision, line-of-sight, & hit peluru dari grid yang SAMA.
//   Konektivitas + bebas-pintu DIVERIFIKASI BFS (scratchpad s2grid.mjs & smoke
//   test); jangan ubah pintu tanpa tes ulang. Menang = capai tangga END (ruang
//   kanan-bawah) -> transisi ke stage 3 (sama seperti tangga keluar stage 1;
//   TANPA boss — dibuang atas permintaan user 2026-07-13).

import { CFG, CAMP_M } from '../../core/config.js';
import { player, robots, drops, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { applyLightPreset } from '../../world/lighting.js';
import { showStageMsg } from '../../core/dom.js';
import { saveCampaignStage } from '../../core/saveGame.js';
import { updateUI } from '../../core/hud.js';
import { NADE_R } from '../../entities/grenades.js';
import { disposeRobot } from '../../entities/robots.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../entities/futuristicCupboard.js';
import { spawnCampaignRobot, campaignRobotAI, countStageRobots } from './common.js';
import { beginStageTransition, campaignJumpToStage } from './transition.js';
import { stage1Scene } from './stage1.js';
import { stage3Scene } from './stage3.js';

// Grid 40 kolom x 28 baris (sel 2 m). Gedung ditaruh ~60 km dari origin dan
// ~30 km dari gedung stage 1 (x≈30000) — kedua dunia stage hidup berdampingan
// di satu scene, dipisah jarak (camera.far + culling menyembunyikan yang jauh).
export const S2 = {
    G: 40, ROWS: 28, CELL: 2 * CAMP_M, H: 22,   // tinggi plafon ~3.1 m
    x0: 60000 - 20 * 2 * CAMP_M,                 // pojok barat-laut grid
    z0: -14 * 2 * CAMP_M
};
export let s2grid = null;                        // [row][col] 1=dinding, 0=lantai
export const s2Cell = (c, r) => ({ x: S2.x0 + (c + 0.5) * S2.CELL, z: S2.z0 + (r + 0.5) * S2.CELL });
export const S2_START = { c: 3, r: 3 };          // ruang tangga TURUN dari Lt.3 (kiri-atas)
export const S2_END = { c: 34, r: 24 };          // tangga TURUN ke stage 3 (kanan-bawah)
// Trigger tangga keluar (ruang END, kanan-bawah)
const S2_EXIT = { c0: 31, r0: 22, c1: 37, r1: 26 };

const blockers = [];   // furnitur/undakan pejal {x,z,hx,hz,ax*,az*,top,standable}
let built = false;

function buildS2Grid() {
    const g = Array.from({ length: S2.ROWS }, () => Array(S2.G).fill(1));
    const carve = (c0, r0, c1, r1) => {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = 0;
    };
    // --- Ruangan (verifikasi BFS di scratchpad s2grid.mjs) ---
    carve(1, 1, 6, 6);       // START (tangga turun dari Lt.3)
    carve(9, 1, 15, 6);      // OFFICE ROOM
    carve(18, 1, 26, 5);     // HALLWAY (koridor panjang)
    carve(30, 1, 38, 6);     // STORAGE ROOM (arsip)
    carve(1, 10, 8, 17);     // WAITING AREA
    carve(11, 9, 24, 17);    // OPEN OFFICE
    carve(31, 9, 38, 15);    // SUPPLY ROOM
    carve(1, 20, 11, 26);    // LAB / RESEARCH ROOM
    carve(14, 20, 25, 26);   // CONTROL ROOM
    carve(30, 19, 38, 26);   // END (tangga turun ke stage 3)
    // --- Koridor sempit (jadi robot-spot ambush) ---
    carve(2, 7, 27, 8);      // koridor utama HALLWAY (atas)
    carve(28, 2, 29, 19);    // koridor KANAN percabangan (spot 6)
    carve(4, 8, 5, 10);      // koridor -> WAITING (spot 1)
    carve(12, 17, 13, 19);   // OPEN OFFICE -> CONTROL (turun)
    carve(6, 17, 7, 19);     // WAITING -> LAB (turun)
    // --- Pintu (bukaan staggered 1-2 sel) ---
    carve(3, 6, 4, 7);       // START -> koridor
    carve(7, 4, 8, 4);       // START -> OFFICE
    carve(11, 6, 12, 7);     // OFFICE -> koridor
    carve(16, 2, 17, 2);     // OFFICE -> HALLWAY
    carve(21, 5, 22, 7);     // HALLWAY -> koridor
    carve(27, 3, 29, 3);     // HALLWAY -> koridor kanan
    carve(28, 4, 30, 4);     // koridor kanan -> STORAGE
    carve(15, 8, 16, 9);     // koridor -> OPEN OFFICE (pintu utara)
    carve(9, 13, 11, 13);    // WAITING -> OPEN OFFICE
    carve(24, 11, 28, 11);   // OPEN OFFICE -> koridor kanan
    carve(29, 13, 31, 13);   // koridor kanan -> SUPPLY
    carve(6, 17, 7, 18);     // WAITING -> koridor LAB
    carve(12, 17, 13, 18);   // OPEN OFFICE -> koridor CONTROL
    carve(11, 23, 14, 23);   // LAB -> CONTROL
    carve(25, 21, 30, 21);   // CONTROL -> koridor kanan -> END
    s2grid = g;
}

// Sel dinding? (di luar grid = dinding)
export function s2Wall(c, r) {
    return c < 0 || r < 0 || c >= S2.G || r >= S2.ROWS || s2grid[r][c] === 1;
}

// Lingkaran (x,z,r) sepenuhnya di lantai gedung? (walkable stage 2)
export function stage2Walk(x, z, r) {
    if (!s2grid) return false;
    const c0 = Math.floor((x - r - S2.x0) / S2.CELL), c1 = Math.floor((x + r - S2.x0) / S2.CELL);
    const r0 = Math.floor((z - r - S2.z0) / S2.CELL), r1 = Math.floor((z + r - S2.z0) / S2.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s2Wall(cc, rr)) return false;
    return true;
}

// Garis pandang bebas dinding? (aktivasi robot indoor: bangun bila MELIHAT player)
export function s2LOS(x1, z1, x2, z2) {
    if (!s2grid) return true;
    const dx = x2 - x1, dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (S2.CELL * 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + dx * t - S2.x0) / S2.CELL);
        const r = Math.floor((z1 + dz * t - S2.z0) / S2.CELL);
        if (s2Wall(c, r)) return false;
    }
    return true;
}

// Ruas peluru menabrak dinding? (sampling tiap ~7 unit)
export function s2SegHitsWall(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 7));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + (x2 - x1) * t - S2.x0) / S2.CELL);
        const r = Math.floor((z1 + (z2 - z1) * t - S2.z0) / S2.CELL);
        if (s2Wall(c, r)) return true;
    }
    return false;
}

// Penghalang pejal stage 2 = furnitur + undakan tangga (balok axis-aligned)
export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

export let s2Nav = null;

export function buildWorld() {
    buildS2Grid();
    const sizeX = S2.G * S2.CELL, sizeZ = S2.ROWS * S2.CELL;   // 560 x 392 unit
    const cx = S2.x0 + sizeX / 2, cz = S2.z0 + sizeZ / 2;

    // --- Lantai: ubin kusam bernoda ---
    const floorTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#484540'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#3e3a34', '#504b43', '#35322c', '#585349'], 240, 1, 5);
        g.strokeStyle = 'rgba(22,20,17,0.6)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.moveTo(0, 0); g.lineTo(0, h); g.stroke();
        for (let i = 0; i < 3; i++) {
            g.globalAlpha = 0.10 + Math.random() * 0.12;
            g.fillStyle = '#12100c';
            g.beginPath();
            g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 24, 6 + Math.random() * 14, Math.random() * 3, 0, 6.283);
            g.fill();
        }
        g.globalAlpha = 1;
    }, S2.G, S2.ROWS);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshPhongMaterial({ map: floorTex, shininess: 8, specular: 0x121110 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // --- Plafon: panel akustik gelap (disembunyikan seperti stage 1 = top-down) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#282520'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#221f1a', '#2f2b25', '#1b1915'], 120, 1, 4);
    }, S2.G, S2.ROWS);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S2.H, cz);
    ceil.visible = false;   // top-down: kamera di atas plafon (fisika granat tak berubah)
    scene.add(ceil);

    // --- Dinding: satu InstancedMesh (sel dinding bertetangga lantai saja) ---
    const wallTex = makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#67635b'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#5c5850', '#726d64', '#534f45'], 140, 1, 4);
        for (let i = 0; i < 5; i++) {
            g.strokeStyle = 'rgba(38,35,30,0.5)';
            g.lineWidth = 1 + Math.random();
            let x = Math.random() * w, y = 0;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 3; s++) { x += rand(-6, 6); y += h / 3; g.lineTo(x, y); }
            g.stroke();
        }
    });
    const wallCells = [];
    for (let r = 0; r < S2.ROWS; r++) {
        for (let c = 0; c < S2.G; c++) {
            if (s2grid[r][c] !== 1) continue;
            let nearFloor = false;
            for (let dr = -1; dr <= 1 && !nearFloor; dr++)
                for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                    if (!s2Wall(c + dc, r + dr)) nearFloor = true;
            if (nearFloor) wallCells.push([c, r]);
        }
    }
    const wallMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(S2.CELL, S2.H, S2.CELL),
        new THREE.MeshPhongMaterial({ map: wallTex, shininess: 5, specular: 0x14130f }),
        wallCells.length);
    {
        const _m = new THREE.Matrix4(), _c = new THREE.Color();
        wallCells.forEach(([c, r], i) => {
            const p = s2Cell(c, r);
            _m.setPosition(p.x, S2.H / 2, p.z);
            wallMesh.setMatrixAt(i, _m);
            _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04));
            wallMesh.setColorAt(i, _c);
        });
        if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    }
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;
    scene.add(wallMesh);

    // --- Furnitur: satu InstancedMesh box + blocker pejal (dijauhkan dari pintu) ---
    const fur = [];
    const furBox = (c, r, sx, sy, sz, color, ry = 0, dx = 0, dz = 0) => {
        const p = s2Cell(c, r);
        fur.push({ x: p.x + dx, y: sy / 2, z: p.z + dz, sx, sy, sz, ry, color });
        return { x: p.x + dx, z: p.z + dz };
    };
    const furBlock = (c, r, sx, sy, sz, color, dx = 0, dz = 0, standable = true) => {
        const p = furBox(c, r, sx, sy, sz, color, 0, dx, dz);
        blockers.push({
            x: p.x, z: p.z, hx: sx / 2, hz: sz / 2,
            axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
    };
    // MODEL FURNITUR (entities/futuristic*.js) — BUKAN balok instanced: daftarkan
    // blocker (footprint sama seperti furBlock) lalu render group model yg di-skala
    // mengisi footprint. update() (putar/pulsa/hover) TIDAK dipanggil (statis).
    const putModel = (mesh, x, z, sx, sy, sz, standable) => {
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        mesh.position.set(x, 0, z);
        scene.add(mesh);
    };
    // MEJA kerja: model desk + satu KURSI (dekorasi, TANPA blocker) di sisi depan.
    const deskModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s2Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, standable);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.28);
        scene.add(chair);
    };
    // RAK/LEMARI: deret lemari (cupboard) sepanjang sisi terpanjang (tiap unit ~kotak,
    // dibatasi 4) — 1 blocker footprint penuh (nav/collision sama seperti dulu).
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s2Cell(c, r), x = p.x + dx, z = p.z + dz;
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
        const n = Math.max(1, Math.min(4, Math.round(longLen / shortLen)));
        const unit = longLen / n;
        for (let i = 0; i < n; i++) {
            const off = -longLen / 2 + unit * (i + 0.5);
            const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
            cab.position.set(along ? x + off : x, 0, along ? z : z + off);
            scene.add(cab);
        }
    };
    const CRATE = 0x7a5c33,
        SOFA = 0x5a3f3f, RUBBLE = 0x4a463f, CONSOLE = 0x2f3a44, BENCH = 0x8a857a;
    // OFFICE (c9-15 r1-6): dua meja kerja (model meja)
    deskModel(11, 2, 26, 7, 12);
    deskModel(13, 4, 22, 7, 12, 4, 2);
    // HALLWAY (c18-26 r1-5): jebakan RUNTUHAN di tengah (puing rendah, bisa dipijak)
    furBlock(20, 3, 16, 9, 16, RUBBLE);
    furBlock(24, 2, 14, 8, 14, RUBBLE, 2, 0);
    // STORAGE (c30-38 r1-6): rak arsip (model lemari) di dinding timur & sudut
    cupboardModel(37, 2, 8, 15, 40);
    cupboardModel(32, 5, 30, 15, 8, 2, 0);
    // WAITING (c1-8 r10-17): sofa + meja (model meja) dekat jendela
    furBlock(3, 11, 20, 6, 16, SOFA);
    deskModel(3, 15, 22, 7, 12, 0, 2);
    // OPEN OFFICE (c11-24 r9-17): krat cover tersebar (jalur tengah terbuka)
    furBlock(14, 11, 16, 9, 16, CRATE);
    furBlock(21, 12, 16, 9, 16, CRATE);
    furBlock(16, 15, 18, 8, 14, CRATE, 2, 0);
    furBlock(20, 15, 14, 8, 14, CRATE);
    // SUPPLY (c31-38 r9-15): rak logam (model lemari; jauh dari titik persediaan & pintu)
    cupboardModel(32, 9, 26, 15, 8, 2, 0);
    cupboardModel(37, 13, 8, 15, 26);
    // LAB / RESEARCH (c1-11 r20-26): meja-meja lab (bisa dilompati -> standable)
    furBlock(3, 22, 24, 6, 12, BENCH);
    furBlock(7, 24, 20, 6, 12, BENCH, 2, 0);
    furBlock(9, 21, 12, 6, 20, BENCH);
    // CONTROL (c14-25 r20-26): konsol elektronik + kabinet
    furBlock(16, 22, 26, 7, 12, CONSOLE);
    furBlock(20, 24, 22, 7, 12, CONSOLE, 2, 2);
    cupboardModel(23, 21, 10, 16, 18);
    // END (c30-38 r19-26): sebagian besar kosong (ruang tangga keluar); satu krat sudut
    furBlock(37, 25, 14, 9, 14, CRATE);
    {
        const unit = new THREE.BoxGeometry(1, 1, 1);
        const fMesh = new THREE.InstancedMesh(unit,
            new THREE.MeshLambertMaterial({ color: 0xffffff }), fur.length);
        const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
            _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
        fur.forEach((f, i) => {
            _e.set(0, f.ry, 0);
            _m.compose(_p.set(f.x, f.y, f.z), _q.setFromEuler(_e), _s.set(f.sx, f.sy, f.sz));
            fMesh.setMatrixAt(i, _m);
            _c.setHex(f.color).offsetHSL(0, rand(-0.04, 0.02), rand(-0.05, 0.03));
            fMesh.setColorAt(i, _c);
        });
        if (fMesh.instanceColor) fMesh.instanceColor.needsUpdate = true;
        fMesh.castShadow = true;
        fMesh.frustumCulled = false;
        scene.add(fMesh);
    }

    // --- Tangga masuk (START) & keluar (END): undakan + portal gelap ---
    const stepMat = new THREE.MeshPhongMaterial({ color: 0x57534b, shininess: 6 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x020202 });
    const mkStairs = (c, r, dirZ) => {
        const p = s2Cell(c, r);
        for (let i = 0; i < 5; i++) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(26, 2 + i * 2, 8), stepMat);
            st.position.set(p.x, (2 + i * 2) / 2, p.z + dirZ * (i * 8 - 14));
            st.castShadow = true; st.receiveShadow = true;
            scene.add(st);
        }
        const portal = new THREE.Mesh(new THREE.PlaneGeometry(26, S2.H - 10), holeMat);
        portal.position.set(p.x, (S2.H - 10) / 2 + 9, p.z + dirZ * 20);
        portal.rotation.y = dirZ > 0 ? Math.PI : 0;
        scene.add(portal);
        blockers.push({
            x: p.x, z: p.z + dirZ * 4, hx: 13, hz: 20,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(13, 20), top: 10, standable: true
        });
    };
    mkStairs(S2_START.c, S2_START.r - 1, -1);   // START: tangga naik ke utara = turun dari Lt.3
    mkStairs(S2_END.c, S2_END.r, 1);            // END: tangga turun ke selatan = ke stage 3

    // Papan EXIT hijau menyala di atas tangga keluar (kanan-bawah) = penanda tujuan
    const exitP = s2Cell(S2_END.c, S2_END.r - 1);
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x2eff6a, toneMapped: false }));
    exitSign.position.set(exitP.x, S2.H - 4, exitP.z);
    scene.add(exitSign);
    const exitLight = new THREE.PointLight(0x39ff7a, 0.85, 220, 2);
    exitLight.position.set(exitP.x, S2.H - 6, exitP.z);
    scene.add(exitLight);

    // --- Pencahayaan interior: titik lampu TETAP (dibuat saat build) ---
    const lampFix = new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false });
    const addLamp = (c, r, color, inten, dist) => {
        const p = s2Cell(c, r);
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(p.x, S2.H - 3, p.z);
        scene.add(L);
        const fix = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 8), lampFix);
        fix.position.set(p.x, S2.H - 0.4, p.z);
        scene.add(fix);
        return L;
    };
    addLamp(3, 3, 0xffd9a0, 0.9, 220);                        // START/stairwell
    addLamp(12, 3, 0xffe2b8, 0.9, 260);                       // office
    addLamp(22, 3, 0xffd9a0, 0.85, 320);                      // hallway
    addLamp(34, 3, 0xffc890, 0.8, 240);                       // storage (arsip)
    addLamp(4, 13, 0xffe2b8, 0.85, 240);                      // waiting
    addLamp(18, 13, 0xffe2b8, 0.9, 360);                      // open office
    addLamp(34, 12, 0xbfe4ff, 0.85, 260);                     // supply (dingin)
    addLamp(5, 23, 0xffd9a0, 0.8, 240);                       // lab
    addLamp(19, 23, 0xbfe4ff, 0.85, 300);                     // control (elektronik, kebiruan)
    addLamp(34, 22, 0xffc890, 0.8, 260);                      // end

    // Bake nav-grid TERAKHIR (blockers sudah terisi): dinding dari grid denah,
    // furnitur/undakan dari resolve. Radius sampel 3 (< badan 3.5).
    const half = S2.CELL / 2;
    s2Nav = makeNavGrid(S2.x0, S2.z0, half, S2.G * 2, S2.ROWS * 2, (x, z) => {
        if (!stage2Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });
}

// Robot stage 2: 9 spot pada denah referensi [col, row, jumlah]. Tiap spot
// men-spawn `n` robot kelas C (grunt) di sekitar titiknya (jitter + resolve).
const S2_ROBOTS = [
    [4, 9, 3],    // 1 dekat tangga awal
    [22, 3, 4],   // 2 HALLWAY (koridor panjang)
    [34, 3, 3],   // 3 STORAGE (arsip)
    [18, 13, 5],  // 4 OPEN OFFICE
    [4, 13, 4],   // 5 WAITING AREA
    [28, 14, 5],  // 6 koridor percabangan kanan
    [5, 23, 4],   // 7 LAB / RESEARCH
    [19, 23, 4],  // 8 CONTROL ROOM
    [33, 24, 3],  // 9 dekat tangga akhir
];
// Sebagian spot dicampur penembak B/A (variasi tempur); mayoritas tetap melee C.
const S2_RANGED = { 2: 'B', 4: 'B', 6: 'A', 8: 'B' };   // index spot (1-based) -> kelas penembak sesekali

export function placeRobots() {
    S2_ROBOTS.forEach(([c, r, n], si) => {
        const p = s2Cell(c, r);
        const rangedCls = S2_RANGED[si + 1];
        for (let k = 0; k < n; k++) {
            _v3.set(p.x + rand(-7, 7), 0, p.z + rand(-7, 7));
            resolve(_v3, 4, 0);
            if (!stage2Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            // di spot bertanda ranged: ~1 dari tiap spot jadi penembak, sisanya C
            const cls = (rangedCls && k === 0) ? rangedCls : 'C';
            spawnCampaignRobot(_v3.x, _v3.z, 2, cls);
        }
    });
    placeSupplies();
}

// SUPPLY ROOM (kanan-tengah) berisi ammo + medkit; tak kedaluwarsa (timer 1e9).
// Dipanggil dari placeRobots (= dijadwalkan saat campaign mulai, seperti robot).
function placeSupplies() {
    const put = (type, c, r, dx = 0, dz = 0) => {
        const p = s2Cell(c, r);
        const mesh = type === 'mag' ? buildMagMesh() : buildMedkitMesh();
        mesh.position.set(p.x + dx, 1, p.z + dz);
        scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    // Supply Room (c31-38 r9-15; hindari rak c32 r9 & c37 r13)
    put('mag', 33, 10); put('mag', 35, 11); put('mag', 37, 10);
    put('medkit', 34, 14); put('medkit', 36, 14);
    // Bonus tersebar (sel lantai terbuka terverifikasi)
    put('mag', 22, 3);       // hallway
    put('medkit', 5, 23);    // lab
    put('mag', 33, 24);      // dekat tangga akhir
}

export const stage2Scene = {
    id: 'campaign-2',

    // Masuk dari tangga stage 1 -> 2. Robot gedung stage 1 yang tersisa
    // dibersihkan diam-diam (tanpa skor/drop) agar hitungan & menang sederhana.
    enter() {
        saveCampaignStage(2);   // checkpoint: campaign berada di stage 2
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 1) {
                disposeRobot(robots[i]);
                scene.remove(robots[i].mesh);
                robots.splice(i, 1);
            }
        }
        applyLightPreset(scene, 'indoor');
        const sp = s2Cell(S2_START.c, S2_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // yaw 180° — hadap selatan (masuk ke gedung)
        player.vy = 0; player.onGround = true;
        showStageMsg('FLOOR 2 — FIGHT TO THE STAIRS DOWN');
        updateUI();
    },

    // Mati di stage 2 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Dinding grid: geser per-sumbu (menyusur tembok), penghalang furnitur,
    // slide lagi, lalu cek trigger tangga keluar -> turun ke stage 3
    // (selalu aktif, seperti tangga keluar stage 1).
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage2Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage2Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S2.x0 + S2_EXIT.c0 * S2.CELL
            && pos.x <= S2.x0 + (S2_EXIT.c1 + 1) * S2.CELL
            && pos.z >= S2.z0 + S2_EXIT.r0 * S2.CELL
            && pos.z <= S2.z0 + (S2_EXIT.r1 + 1) * S2.CELL) {
            beginStageTransition(stage3Scene);   // → SHOP SCENE (loading→shop→loading→stage 3)
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Peluru MATI di dinding (sweep ruas posisi-lalu -> kini)
    bulletBlocked(b) {
        return b.mesh.position.y < S2.H
            && s2SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },

    grenadeCollide(g, oldGX, oldGZ) {
        if (!stage2Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        if (g.mesh.position.y > S2.H - NADE_R) {
            g.mesh.position.y = S2.H - NADE_R;
            if (g.vy > 0) g.vy = -g.vy * 0.3;
        }
    },

    robotAI(z, dt, step) {
        // Indoor: aktivasi butuh LOS grid (atau sangat dekat / tertembak)
        return campaignRobotAI(z, dt, step, { walkable: stage2Walk, resolve, los: s2LOS, nav: s2Nav });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() { return `FLOOR 2 — Robots: ${countStageRobots(2)} | Find the stairs down`; },

    // Landmark gedung: tangga keluar (hijau menyala; dijepit ke tepi saat jauh)
    radarLandmarks(plot) {
        const e = s2Cell(S2_END.c, S2_END.r);
        plot(e.x - camera.position.x, e.z - camera.position.z, "#2eff6a", 5, true);
    },
};
