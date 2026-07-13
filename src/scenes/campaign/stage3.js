// SCENE: Campaign STAGE 3 (final) — "Gedung Terbengkalai (Lantai 2)" indoor.
// DIROMBAK TOTAL 2026-07-13 dari Taman Monas malam menjadi gedung dalam-ruangan
// KETIGA mengikuti floor-plan referensi user (denah dgn ATRIUM/VOID pusat).
// Tata letak: ring koridor mengelilingi ATRIUM (lubang berpagar di tengah);
// ruangan di sekeliling:
//   ATAS:   TANGGA(START, kiri-atas) | ARCHIVE ROOM | koridor sempit | OFFICE
//   TENGAH: READING ROOM (kiri) | ATRIUM/VOID (pusat) | SUPPLY ROOM (kanan)
//   BAWAH:  CAFETERIA | ELECTRICAL ROOM | STORAGE ROOM | TANGGA(END, kanan-bawah)
// Grid sel 2 m (1=dinding, 0=lantai) — dinding/collision/LOS/hit-peluru dari
// grid yang SAMA (pola stage1/stage2). Konektivitas + bebas-pintu DIVERIFIKASI
// BFS (scratchpad s3grid.mjs & smoke test). Menang = capai tangga END ->
// MISSION COMPLETE (gameOver(true)). TANPA boss.

import { CFG, CAMP_M } from '../../core/config.js';
import { player, robots, drops, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { applyLightPreset } from '../../world/lighting.js';
import { showStageMsg } from '../../core/dom.js';
import { updateUI } from '../../core/hud.js';
import { gameOver } from '../../core/game.js';
import { NADE_R } from '../../entities/grenades.js';
import { disposeRobot } from '../../entities/robots.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { spawnCampaignRobot, campaignRobotAI, countStageRobots } from './common.js';
import { stage1Scene } from './stage1.js';

// Grid 42 kolom x 30 baris (sel 2 m). Gedung ditaruh ~90 km dari origin —
// jauh dari gedung stage1 (x≈30000) & stage2 (x≈60000); ketiga dunia campaign
// hidup berdampingan di satu scene, dipisah jarak (camera.far + culling).
export const S3 = {
    G: 42, ROWS: 30, CELL: 2 * CAMP_M, H: 22,
    x0: 90000 - 21 * 2 * CAMP_M,
    z0: -15 * 2 * CAMP_M,
    VOID: { c0: 19, r0: 14, c1: 24, r1: 18 }   // lubang atrium (dinding grid; dirender pagar+pit)
};
export let s3grid = null;
export const s3Cell = (c, r) => ({ x: S3.x0 + (c + 0.5) * S3.CELL, z: S3.z0 + (r + 0.5) * S3.CELL });
export const S3_START = { c: 3, r: 3 };
export const S3_END = { c: 37, r: 26 };
const S3_EXIT = { c0: 34, r0: 24, c1: 40, r1: 28 };

const blockers = [];
let built = false;

function inVoid(c, r) {
    const V = S3.VOID;
    return c >= V.c0 && c <= V.c1 && r >= V.r0 && r <= V.r1;
}

function buildS3Grid() {
    const g = Array.from({ length: S3.ROWS }, () => Array(S3.G).fill(1));
    const carve = (c0, r0, c1, r1) => {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = 0;
    };
    // --- Ruangan (verifikasi BFS di scratchpad s3grid.mjs) ---
    carve(1, 1, 5, 6);       // START (tangga turun)
    carve(8, 1, 17, 8);      // ARCHIVE ROOM
    carve(20, 1, 28, 4);     // koridor sempit atas (spot 2)
    carve(31, 1, 40, 8);     // OFFICE ROOM
    carve(1, 12, 10, 19);    // READING ROOM
    carve(34, 12, 40, 19);   // SUPPLY ROOM
    carve(1, 23, 11, 28);    // CAFETERIA
    carve(14, 23, 22, 28);   // ELECTRICAL ROOM
    carve(25, 23, 31, 28);   // STORAGE ROOM
    carve(34, 23, 40, 28);   // END (tangga turun ke lantai bawah)
    carve(15, 11, 28, 21);   // ATRIUM (ring di sekitar VOID)
    // --- Ring koridor mengelilingi atrium ---
    carve(2, 9, 35, 10);     // ring ATAS
    carve(12, 9, 13, 22);    // ring KIRI (vertikal)
    carve(30, 9, 31, 22);    // ring KANAN (vertikal)
    carve(6, 21, 35, 22);    // ring BAWAH
    // --- Pintu / penghubung ---
    carve(2, 6, 4, 9);       // START -> ring atas (spot 1)
    carve(11, 8, 12, 9);     // ARCHIVE -> ring atas
    carve(23, 4, 24, 9);     // koridor sempit -> ring atas
    carve(34, 8, 35, 9);     // OFFICE -> ring atas
    carve(10, 15, 12, 15);   // READING -> ring kiri
    carve(31, 15, 34, 15);   // SUPPLY -> ring kanan
    carve(5, 22, 6, 23);     // CAFETERIA -> ring bawah
    carve(17, 22, 18, 23);   // ELECTRICAL -> ring bawah
    carve(27, 22, 28, 23);   // STORAGE -> ring bawah
    carve(35, 22, 36, 23);   // END -> ring bawah
    carve(21, 10, 22, 11);   // ATRIUM utara -> ring atas
    carve(13, 16, 15, 16);   // ATRIUM barat -> ring kiri
    carve(28, 16, 30, 16);   // ATRIUM timur -> ring kanan
    carve(21, 21, 22, 22);   // ATRIUM selatan -> ring bawah
    // --- VOID pusat = dinding grid (dirender pagar + pit, bukan tembok tinggi) ---
    for (let r = S3.VOID.r0; r <= S3.VOID.r1; r++)
        for (let c = S3.VOID.c0; c <= S3.VOID.c1; c++) g[r][c] = 1;
    s3grid = g;
}

export function s3Wall(c, r) {
    return c < 0 || r < 0 || c >= S3.G || r >= S3.ROWS || s3grid[r][c] === 1;
}

export function stage3Walk(x, z, r) {
    if (!s3grid) return false;
    const c0 = Math.floor((x - r - S3.x0) / S3.CELL), c1 = Math.floor((x + r - S3.x0) / S3.CELL);
    const r0 = Math.floor((z - r - S3.z0) / S3.CELL), r1 = Math.floor((z + r - S3.z0) / S3.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s3Wall(cc, rr)) return false;
    return true;
}

export function s3LOS(x1, z1, x2, z2) {
    if (!s3grid) return true;
    const dx = x2 - x1, dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (S3.CELL * 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + dx * t - S3.x0) / S3.CELL);
        const r = Math.floor((z1 + dz * t - S3.z0) / S3.CELL);
        if (s3Wall(c, r)) return false;
    }
    return true;
}

export function s3SegHitsWall(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 7));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + (x2 - x1) * t - S3.x0) / S3.CELL);
        const r = Math.floor((z1 + (z2 - z1) * t - S3.z0) / S3.CELL);
        if (s3Wall(c, r)) return true;
    }
    return false;
}

export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

export let s3Nav = null;

export function buildWorld() {
    buildS3Grid();
    const sizeX = S3.G * S3.CELL, sizeZ = S3.ROWS * S3.CELL;
    const cx = S3.x0 + sizeX / 2, cz = S3.z0 + sizeZ / 2;

    // --- Lantai ---
    const floorTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#46433c'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#3c3931', '#4e4940', '#332f2a', '#565045'], 240, 1, 5);
        g.strokeStyle = 'rgba(20,18,15,0.6)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.moveTo(0, 0); g.lineTo(0, h); g.stroke();
        for (let i = 0; i < 3; i++) {
            g.globalAlpha = 0.10 + Math.random() * 0.12;
            g.fillStyle = '#100e0a';
            g.beginPath();
            g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 24, 6 + Math.random() * 14, Math.random() * 3, 0, 6.283);
            g.fill();
        }
        g.globalAlpha = 1;
    }, S3.G, S3.ROWS);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshPhongMaterial({ map: floorTex, shininess: 8, specular: 0x121110 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // --- Plafon (disembunyikan; top-down) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#26231e'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#201d18', '#2d2923', '#1a1813'], 120, 1, 4);
    }, S3.G, S3.ROWS);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S3.H, cz);
    ceil.visible = false;
    scene.add(ceil);

    // --- Dinding (InstancedMesh; sel dinding bertetangga lantai, KECUALI VOID) ---
    const wallTex = makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#63605a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#585449', '#6e6960', '#4f4b42'], 140, 1, 4);
        for (let i = 0; i < 5; i++) {
            g.strokeStyle = 'rgba(36,33,28,0.5)';
            g.lineWidth = 1 + Math.random();
            let x = Math.random() * w, y = 0;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 3; s++) { x += rand(-6, 6); y += h / 3; g.lineTo(x, y); }
            g.stroke();
        }
    });
    const wallCells = [];
    for (let r = 0; r < S3.ROWS; r++) {
        for (let c = 0; c < S3.G; c++) {
            if (s3grid[r][c] !== 1 || inVoid(c, r)) continue;   // VOID dirender terpisah
            let nearFloor = false;
            for (let dr = -1; dr <= 1 && !nearFloor; dr++)
                for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                    if (!s3Wall(c + dc, r + dr)) nearFloor = true;
            if (nearFloor) wallCells.push([c, r]);
        }
    }
    const wallMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(S3.CELL, S3.H, S3.CELL),
        new THREE.MeshPhongMaterial({ map: wallTex, shininess: 5, specular: 0x14130f }),
        wallCells.length);
    {
        const _m = new THREE.Matrix4(), _c = new THREE.Color();
        wallCells.forEach(([c, r], i) => {
            const p = s3Cell(c, r);
            _m.setPosition(p.x, S3.H / 2, p.z);
            wallMesh.setMatrixAt(i, _m);
            _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04));
            wallMesh.setColorAt(i, _c);
        });
        if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    }
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;
    scene.add(wallMesh);

    // --- ATRIUM VOID: pit gelap + pagar rendah keliling (bukan tembok tinggi) ---
    const V = S3.VOID;
    const vx0 = S3.x0 + V.c0 * S3.CELL, vx1 = S3.x0 + (V.c1 + 1) * S3.CELL;
    const vz0 = S3.z0 + V.r0 * S3.CELL, vz1 = S3.z0 + (V.r1 + 1) * S3.CELL;
    const vcx = (vx0 + vx1) / 2, vcz = (vz0 + vz1) / 2, vW = vx1 - vx0, vD = vz1 - vz0;
    // Pit gelap (lubang ke lantai bawah): pelat hitam sedikit di atas lantai
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(vW, vD),
        new THREE.MeshBasicMaterial({ color: 0x050505 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(vcx, 0.06, vcz);
    scene.add(pit);
    // Pagar rendah (railing) di keliling void: 4 balok tipis + rel atas terang
    const railMat = new THREE.MeshPhongMaterial({ color: 0x2c2f33, shininess: 30, specular: 0x666a70 });
    const railTopMat = new THREE.MeshPhongMaterial({ color: 0x9aa0a8, shininess: 60, specular: 0xcfd4da });
    const railH = 5, railT = 1.6;
    const mkRail = (x, z, sx, sz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(sx, railH, sz), railMat);
        post.position.set(x, railH / 2, z);
        post.castShadow = true; post.receiveShadow = true;
        scene.add(post);
        const top = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.6, 0.9, sz + 0.6), railTopMat);
        top.position.set(x, railH, z);
        scene.add(top);
    };
    mkRail(vcx, vz0, vW + railT, railT);   // utara
    mkRail(vcx, vz1, vW + railT, railT);   // selatan
    mkRail(vx0, vcz, railT, vD + railT);   // barat
    mkRail(vx1, vcz, railT, vD + railT);   // timur

    // --- Furnitur (InstancedMesh + blocker; dijauhkan dari pintu & VOID) ---
    const fur = [];
    const furBox = (c, r, sx, sy, sz, color, ry = 0, dx = 0, dz = 0) => {
        const p = s3Cell(c, r);
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
    const WOOD = 0x6b4a2f, SHELF = 0x55606a, CRATE = 0x7a5c33,
        TABLE = 0x7d6a4a, CONSOLE = 0x2f3a44, PLANTER = 0x3a4a32;
    // ARCHIVE (c8-17 r1-8): banyak rak + meja
    furBlock(10, 2, 8, 15, 40, SHELF);
    furBlock(15, 2, 8, 15, 40, SHELF);
    furBlock(12, 6, 26, 7, 12, TABLE, 2, 0);
    // OFFICE (c31-40 r1-8): meja kerja
    furBlock(33, 2, 26, 7, 12, WOOD);
    furBlock(38, 5, 22, 7, 12, WOOD, 0, 2);
    // READING (c1-10 r12-19): meja baca + rak
    furBlock(3, 13, 28, 7, 12, TABLE);
    furBlock(7, 17, 26, 7, 12, TABLE, 0, 2);
    furBlock(2, 16, 8, 15, 24, SHELF);
    // CAFETERIA (c1-11 r23-28): meja makan tersebar
    furBlock(3, 25, 16, 7, 16, TABLE);
    furBlock(8, 26, 16, 7, 16, TABLE, 2, 0);
    // ELECTRICAL (c14-22 r23-28): panel/konsol
    furBlock(16, 25, 24, 9, 12, CONSOLE);
    furBlock(20, 26, 10, 15, 20, SHELF, 2, 0);
    // STORAGE (c25-31 r23-28): rak + krat
    furBlock(26, 25, 8, 15, 26, SHELF);
    furBlock(30, 26, 16, 9, 12, CRATE);
    // SUPPLY (c34-40 r12-19): rak (jauh dari titik persediaan & pintu c34 r15)
    furBlock(40, 17, 8, 15, 26, SHELF);
    furBlock(36, 19, 26, 15, 8, SHELF, 0, 0);
    // TOP corridor (c20-28 r1-4): cover
    furBlock(21, 2, 12, 8, 12, CRATE);
    furBlock(27, 2, 12, 8, 12, CRATE);
    // ATRIUM ring: planter di sudut (jauh dari 4 pintu atrium)
    furBlock(16, 12, 14, 6, 14, PLANTER);
    furBlock(27, 20, 14, 6, 14, PLANTER);
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

    // --- Tangga masuk (START) & keluar (END) ---
    const stepMat = new THREE.MeshPhongMaterial({ color: 0x57534b, shininess: 6 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x020202 });
    const mkStairs = (c, r, dirZ) => {
        const p = s3Cell(c, r);
        for (let i = 0; i < 5; i++) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(26, 2 + i * 2, 8), stepMat);
            st.position.set(p.x, (2 + i * 2) / 2, p.z + dirZ * (i * 8 - 14));
            st.castShadow = true; st.receiveShadow = true;
            scene.add(st);
        }
        const portal = new THREE.Mesh(new THREE.PlaneGeometry(26, S3.H - 10), holeMat);
        portal.position.set(p.x, (S3.H - 10) / 2 + 9, p.z + dirZ * 20);
        portal.rotation.y = dirZ > 0 ? Math.PI : 0;
        scene.add(portal);
        blockers.push({
            x: p.x, z: p.z + dirZ * 4, hx: 13, hz: 20,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(13, 20), top: 10, standable: true
        });
    };
    mkStairs(S3_START.c, S3_START.r - 1, -1);
    mkStairs(S3_END.c, S3_END.r, 1);

    // Papan EXIT hijau di atas tangga keluar = penanda tujuan (MISSION COMPLETE)
    const exitP = s3Cell(S3_END.c, S3_END.r - 1);
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x2eff6a, toneMapped: false }));
    exitSign.position.set(exitP.x, S3.H - 4, exitP.z);
    scene.add(exitSign);
    const exitLight = new THREE.PointLight(0x39ff7a, 0.85, 220, 2);
    exitLight.position.set(exitP.x, S3.H - 6, exitP.z);
    scene.add(exitLight);

    // --- Pencahayaan interior per-ruang ---
    const lampFix = new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false });
    const addLamp = (c, r, color, inten, dist) => {
        const p = s3Cell(c, r);
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(p.x, S3.H - 3, p.z);
        scene.add(L);
        const fix = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 8), lampFix);
        fix.position.set(p.x, S3.H - 0.4, p.z);
        scene.add(fix);
        return L;
    };
    addLamp(3, 3, 0xffd9a0, 0.9, 220);      // start
    addLamp(12, 4, 0xffe2b8, 0.9, 300);     // archive
    addLamp(24, 3, 0xffd9a0, 0.85, 240);    // top corridor
    addLamp(35, 4, 0xffe2b8, 0.9, 300);     // office
    addLamp(5, 15, 0xffd9a0, 0.85, 260);    // reading
    addLamp(21, 12, 0xbfe4ff, 0.7, 300);    // atrium (dingin, samar)
    addLamp(21, 20, 0xbfe4ff, 0.6, 260);    // atrium south
    addLamp(37, 15, 0xbfe4ff, 0.85, 260);   // supply (dingin)
    addLamp(5, 26, 0xffd9a0, 0.85, 260);    // cafeteria
    addLamp(18, 26, 0xffb060, 0.7, 240);    // electrical (gelap kekuningan)
    addLamp(28, 26, 0xffc890, 0.8, 240);    // storage
    addLamp(37, 26, 0xffd9a0, 0.8, 240);    // end

    // Bake nav-grid TERAKHIR (blockers terisi)
    const half = S3.CELL / 2;
    s3Nav = makeNavGrid(S3.x0, S3.z0, half, S3.G * 2, S3.ROWS * 2, (x, z) => {
        if (!stage3Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });
}

// Robot stage 3: spot pada denah [col, row, jumlah]. Kelas C default, sebagian
// penembak B/A (spot bertanda). Terakhir = ruang READING (denah tampak musuh).
const S3_ROBOTS = [
    [3, 8, 3],    // 1 tangga & koridor awal
    [24, 3, 4],   // 2 koridor sempit atas
    [12, 4, 4],   // 3 ARCHIVE
    [21, 12, 5],  // 4 ATRIUM/VOID (sekitar lubang)
    [35, 4, 4],   // 5 OFFICE
    [5, 26, 5],   // 6 CAFETERIA
    [18, 26, 4],  // 7 ELECTRICAL
    [31, 15, 3],  // 8 koridor kanan menuju keluar
    [37, 24, 3],  // 9 dekat tangga akhir
    [5, 15, 4],   // 10 READING ROOM
];
const S3_RANGED = { 2: 'B', 4: 'A', 5: 'B', 8: 'B' };   // index spot (1-based) -> penembak sesekali

export function placeRobots() {
    S3_ROBOTS.forEach(([c, r, n], si) => {
        const p = s3Cell(c, r);
        const rangedCls = S3_RANGED[si + 1];
        for (let k = 0; k < n; k++) {
            _v3.set(p.x + rand(-7, 7), 0, p.z + rand(-7, 7));
            resolve(_v3, 4, 0);
            if (!stage3Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            const cls = (rangedCls && k === 0) ? rangedCls : 'C';
            spawnCampaignRobot(_v3.x, _v3.z, 3, cls);
        }
    });
    placeSupplies();
}

// SUPPLY ROOM (kanan-tengah) ammo + medkit; tak kedaluwarsa.
function placeSupplies() {
    const put = (type, c, r, dx = 0, dz = 0) => {
        const p = s3Cell(c, r);
        const mesh = type === 'mag' ? buildMagMesh() : buildMedkitMesh();
        mesh.position.set(p.x + dx, 1, p.z + dz);
        scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    put('mag', 35, 13); put('mag', 37, 13); put('mag', 39, 13);
    put('medkit', 36, 18); put('medkit', 38, 18);
    // Bonus tersebar
    put('mag', 24, 2);       // koridor atas
    put('medkit', 9, 24);    // cafeteria
    put('mag', 3, 13);       // reading
}

export const stage3Scene = {
    id: 'campaign-3',

    // Transisi dari stage 2 (tangga keluar). Bangun dunia sekali; bersihkan
    // robot stage 2 yang tersisa; tempatkan robot + supply stage 3.
    enter() {
        if (!built) { built = true; buildWorld(); }
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 2) {
                disposeRobot(robots[i]);
                scene.remove(robots[i].mesh);
                robots.splice(i, 1);
            }
        }
        placeRobots();
        applyLightPreset(scene, 'indoor');
        const sp = s3Cell(S3_START.c, S3_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // yaw 180° — hadap selatan (masuk gedung)
        player.vy = 0; player.onGround = true;
        showStageMsg('FINAL FLOOR — REACH THE STAIRS DOWN TO ESCAPE');
        updateUI();
    },

    // Mati di stage 3 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,

    // Dinding grid + furnitur; cek trigger tangga END -> MISSION COMPLETE
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S3.x0 + S3_EXIT.c0 * S3.CELL
            && pos.x <= S3.x0 + (S3_EXIT.c1 + 1) * S3.CELL
            && pos.z >= S3.z0 + S3_EXIT.r0 * S3.CELL
            && pos.z <= S3.z0 + (S3_EXIT.r1 + 1) * S3.CELL) {
            gameOver(true);   // capai tangga keluar = MISSION COMPLETE
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    bulletBlocked(b) {
        return b.mesh.position.y < S3.H
            && s3SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },

    grenadeCollide(g, oldGX, oldGZ) {
        if (!stage3Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        if (g.mesh.position.y > S3.H - NADE_R) {
            g.mesh.position.y = S3.H - NADE_R;
            if (g.vy > 0) g.vy = -g.vy * 0.3;
        }
    },

    robotAI(z, dt, step) {
        return campaignRobotAI(z, dt, step, { walkable: stage3Walk, resolve, los: s3LOS, nav: s3Nav });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() { return `FINAL FLOOR — Robots: ${countStageRobots(3)} | Reach the stairs down`; },

    radarLandmarks(plot) {
        const e = s3Cell(S3_END.c, S3_END.r);
        plot(e.x - camera.position.x, e.z - camera.position.z, "#2eff6a", 5, true);
    },
};
