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
// BFS (scratchpad s3grid.mjs & smoke test). Capai tangga END -> turun ke jalan
// (stage 4). TANPA boss.

import { CFG, CAMP_M } from '../../core/config.js';
import { player, robots, drops, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { applyLightPreset } from '../../world/lighting.js';
import { showStageMsg } from '../../core/dom.js';
import { startMusic } from '../../utils/sfx.js';
import { saveCampaignStage } from '../../core/saveGame.js';
import { updateUI } from '../../core/hud.js';
import { NADE_R } from '../../entities/grenades.js';
import { disposeRobot } from '../../entities/robots.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../entities/futuristicCupboard.js';
import { buildFuturisticCrateMesh } from '../../entities/futuristicCrate.js';
import { buildFuturisticConsoleMesh } from '../../entities/futuristicConsole.js';
import { buildFuturisticPlanterMesh } from '../../entities/futuristicPlanter.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots } from './common.js';
import { buildInteriorFloorMat, buildInteriorWallMat } from './interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors } from './doors.js';
import { buildCampaignCityscape, enterCityEnv } from './cityscape.js';
import { beginStageTransition, campaignJumpToStage } from './transition.js';
import { stage1Scene } from './stage1.js';
import { stage4Scene } from './stage4.js';

// Grid 40 kolom x 30 baris (sel 2 m). DENAH DIROMBAK 2026-07-18 mengikuti PLAN
// RESMI user (stage3.csv/gambar): LOBI tengah besar (TANPA atrium/void) dgn
// ruang-ruang di sekeliling; **STAGE 3 BERAKHIR di PINTU UTAMA LOBI** (bukaan
// selatan tengah, 'o'), BUKAN tangga pojok. Gedung ~90 km dari origin.
export const S3 = {
    G: 40, ROWS: 30, CELL: 2 * CAMP_M, H: 22,
    x0: 90000 - 20 * 2 * CAMP_M,
    z0: -15 * 2 * CAMP_M
};
export let s3grid = null;
export const s3Cell = (c, r) => ({ x: S3.x0 + (c + 0.5) * S3.CELL, z: S3.z0 + (r + 0.5) * S3.CELL });
export const S3_START = { c: 3, r: 3 };          // tangga TURUN dari Lt.3 (hijau, kiri-atas)
export const S3_END = { c: 21, r: 28 };          // PINTU UTAMA LOBI (kuning, selatan-tengah)
// Trigger PINTU UTAMA LOBI (bukaan 'o' selatan-tengah) -> keluar gedung = stage 4
const S3_EXIT = { c0: 19, r0: 27, c1: 23, r1: 29 };

// DENAH RESMI (stage3.csv). 40x30. '#'=dinding, '.'=lantai (pintu '-' & bukaan
// lobi 'o' = lantai). JANGAN ubah tanpa update S3_DOORS/S3_EXIT/robot.
const S3_MAP = [
    '########################################',
    '#......#...........#..........#........#',
    '#......#...........#..........#........#',
    '#......#...........#..........#........#',
    '#......#...........#..........#........#',
    '#......#...........#..........#........#',
    '#......#...........#..........#........#',
    '#......#...........#..........#........#',
    '#......#...........#####..#######......#',
    '#......................................#',
    '#......................................#',
    '############..#..............#..########',
    '#..........#..#..............#..#......#',
    '#..........#..#..............#..#......#',
    '#..........#..#..............#..#......#',
    '#......................................#',
    '#......................................#',
    '#..........#..#..............#..#......#',
    '#..........#..#..............#..#......#',
    '#..........#..#..............#..#......#',
    '############..#..............#..########',
    '#......................................#',
    '#......................................#',
    '#..........#....................#......#',
    '#..........#....................#......#',
    '#..........#....................#......#',
    '#..........#....................#......#',
    '#..........#....................#......#',
    '#..........#....................#......#',
    '###################.....################',
];

// PINTU geser otomatis di SEMUA bukaan '-' plan resmi (6 pintu, tiap 2 sel).
const S3_DOORS = [
    { c0: 24, r0: 8, c1: 25, r1: 8, dir: 'ns' },   // koridor atas <-> lobi tengah (utara)
    { c0: 32, r0: 9, c1: 32, r1: 10, dir: 'ew' },  // koridor atas <-> ruang kanan-atas
    { c0: 11, r0: 15, c1: 11, r1: 16, dir: 'ew' }, // ruang kiri-tengah <-> lobi
    { c0: 32, r0: 15, c1: 32, r1: 16, dir: 'ew' }, // ruang kanan-tengah <-> lobi
    { c0: 11, r0: 21, c1: 11, r1: 22, dir: 'ew' }, // ruang kiri-bawah <-> lobi
    { c0: 32, r0: 21, c1: 32, r1: 22, dir: 'ew' }, // ruang kanan-bawah <-> lobi
];
let s3doors = null;

const blockers = [];
let built = false;

// Bangun dunia SEKALI (guard `built`) — dipanggil enter() DAN `stage1.enter`
// (2026-07-16: SEMUA dunia campaign di-pre-build di awal, di balik layar
// loading awal + warmupAll, supaya loading antar-stage konsisten ~900 ms —
// dulu build+compile lazy stage 3/4 membuat LOADING #2-nya jauh lebih lama
// daripada transisi 1→2 yang dunianya sudah jadi).
export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;   // debug/smoke

function buildS3Grid() {
    // Bangun grid langsung dari denah resmi (baris string -> 1/0). TANPA VOID.
    s3grid = S3_MAP.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
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

    // --- Lantai: panel fasilitas TERANG futuristik (interior.js; 1 ubin/sel 2 m) ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        buildInteriorFloorMat(S3.G, S3.ROWS));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // Latar KOTA JAKARTA mengelilingi gedung (2026-07-18) — dekor, tanpa blocker
    buildCampaignCityscape(cx, cz, sizeX / 2, sizeZ / 2);

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

    // --- Dinding (InstancedMesh; sel dinding bertetangga lantai) ---
    const wallCells = [];
    for (let r = 0; r < S3.ROWS; r++) {
        for (let c = 0; c < S3.G; c++) {
            if (s3grid[r][c] !== 1) continue;
            let nearFloor = false;
            for (let dr = -1; dr <= 1 && !nearFloor; dr++)
                for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                    if (!s3Wall(c + dc, r + dr)) nearFloor = true;
            if (nearFloor) wallCells.push([c, r]);
        }
    }
    const wallMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(S3.CELL, S3.H, S3.CELL),
        buildInteriorWallMat(),
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

    // --- Pintu geser otomatis (buka saat player mendekat) ---
    s3doors = buildStageDoors(S3_DOORS, s3Cell, S3.CELL, S3.H);

    // --- Furnitur (InstancedMesh + blocker; dijauhkan dari pintu) ---
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
        const p = s3Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, standable);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.5 + 2);   // majukan KELUAR dari meja (2026-07-18)
        chair.rotation.y = Math.PI;                     // putar 180°: jok menghadap meja
        scene.add(chair);
    };
    // RAK/LEMARI: deret lemari (cupboard) sepanjang sisi terpanjang (tiap unit ~kotak,
    // dibatasi 4) — 1 blocker footprint penuh (nav/collision sama seperti dulu).
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s3Cell(c, r), x = p.x + dx, z = p.z + dz;
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
    // PROP MODEL generik (entities/futuristic*.js): dari cell grid + blocker
    // footprint sama seperti furBlock -> nav/collision IDENTIK dgn versi balok.
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s3Cell(c, r);
        putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };
    // Furnitur DIROMBAK 2026-07-18 ke denah resmi (jauh dari pintu & bukaan lobi).
    // Ruang kiri-atas (c8-18 r2-8): rak + meja
    cupboardModel(9, 3, 8, 15, 26);
    deskModel(15, 5, 24, 7, 12);
    // Ruang tengah-atas (c20-29 r2-8): meja + krat
    deskModel(23, 3, 26, 7, 12);
    propModel(buildFuturisticCrateMesh, 26, 6, 14, 8, 12);
    // Ruang kanan-atas (c31-38 r2-8): meja + rak
    deskModel(34, 3, 26, 7, 12);
    cupboardModel(37, 6, 8, 15, 18);
    // Ruang kiri-tengah / READING (c1-10 r13-20): meja baca + rak
    deskModel(4, 14, 24, 7, 12);
    cupboardModel(2, 18, 8, 15, 20);
    // Ruang kanan-tengah / SUPPLY (c33-38 r13-20): rak (jauh dari titik persediaan)
    cupboardModel(37, 15, 8, 15, 22);
    cupboardModel(35, 19, 18, 15, 8);
    // Ruang kiri-bawah / CAFETERIA (c1-10 r22-29): meja makan
    deskModel(4, 25, 16, 7, 14);
    deskModel(8, 27, 14, 7, 12);
    // Ruang kanan-bawah / STORAGE (c33-38 r22-29): rak + krat
    cupboardModel(37, 24, 8, 15, 24);
    propModel(buildFuturisticCrateMesh, 35, 27, 14, 9, 12);
    // LOBI TENGAH: sebagian besar DIBIARKAN TERBUKA (jalur ke pintu utama);
    // hanya planter/krat di pinggir sebagai dekor (jauh dari bukaan c19-23).
    propModel(buildFuturisticPlanterMesh, 16, 14, 12, 6, 12);
    propModel(buildFuturisticPlanterMesh, 27, 19, 12, 6, 12);
    propModel(buildFuturisticCrateMesh, 15, 24, 14, 9, 14);
    propModel(buildFuturisticCrateMesh, 28, 26, 14, 9, 14);
    if (fur.length) {   // sisa furnitur balok (kini kosong: semua prop -> model)
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
    mkStairs(S3_START.c, S3_START.r - 1, -1);   // START: tangga turun dari Lt.3 (utara)

    // --- PINTU UTAMA LOBI (exit stage 3 -> keluar gedung = stage 4) ---
    // Bukaan 'o' selatan-tengah (c19-23). Render: kusen + 2 daun kaca + papan EXIT
    // menyala + downlight. Player MENCAPAI pintu ini -> transisi (BUKAN tangga).
    const exC = (S3_EXIT.c0 + S3_EXIT.c1 + 1) / 2, exR = S3_EXIT.r1 + 0.5;   // pusat bukaan @ tepi selatan
    const exP = s3Cell(exC - 0.5, exR - 0.5);
    const openW = (S3_EXIT.c1 - S3_EXIT.c0 + 1) * S3.CELL;   // lebar bukaan (5 sel)
    // ambang/kusen atas (lintel) di puncak dinding
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(openW + 8, 5, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a4046 }));
    lintel.position.set(exP.x, S3.H - 2.5, exP.z);
    scene.add(lintel);
    // dua daun pintu KACA (teal gelap tembus, dekor) di sisi bukaan
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x1a2b28, shininess: 60, specular: 0x4a6a64, transparent: true, opacity: 0.55 });
    for (const sgn of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(openW / 2 - 1, S3.H - 6, 1.2), glassMat);
        leaf.position.set(exP.x + sgn * (openW / 4), (S3.H - 6) / 2, exP.z + 1.5);
        scene.add(leaf);
    }
    // Papan EXIT hijau menyala + downlight (penanda tujuan = MISSION path)
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x2eff6a, toneMapped: false }));
    exitSign.position.set(exP.x, S3.H - 6, exP.z - 3);
    scene.add(exitSign);
    const exitLight = new THREE.PointLight(0x39ff7a, 0.9, 240, 2);
    exitLight.position.set(exP.x, S3.H - 8, exP.z - 6);
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
    [12, 4, 4],   // 1 ruang kiri-atas
    [24, 4, 4],   // 2 ruang tengah-atas
    [34, 4, 4],   // 3 ruang kanan-atas
    [15, 10, 3],  // 4 koridor tengah
    [21, 16, 5],  // 5 LOBI TENGAH
    [5, 16, 4],   // 6 ruang kiri-tengah (READING)
    [35, 16, 3],  // 7 ruang kanan-tengah (SUPPLY)
    [5, 25, 4],   // 8 ruang kiri-bawah (CAFETERIA)
    [21, 24, 5],  // 9 LOBI BAWAH (jalur ke pintu utama)
    [35, 25, 3],  // 10 ruang kanan-bawah (STORAGE)
];
const S3_RANGED = { 2: 'B', 5: 'A', 7: 'B', 9: 'B' };   // index spot (1-based) -> penembak sesekali

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
    // SUPPLY (kanan-tengah c33-38 r13-20; hindari rak c37 r15 & c35 r19)
    put('mag', 34, 14); put('mag', 36, 16); put('mag', 34, 17);
    put('medkit', 37, 18); put('medkit', 35, 15);
    // Bonus tersebar
    put('mag', 24, 3);       // ruang tengah-atas
    put('medkit', 5, 25);    // cafeteria
    put('mag', 21, 10);      // koridor tengah
}

export const stage3Scene = {
    id: 'campaign-3',

    // Transisi dari stage 2 (tangga keluar). Bangun dunia sekali; bersihkan
    // robot stage 2 yang tersisa; tempatkan robot + supply stage 3. (Bukan lagi
    // stage final — tangga END turun ke jalan/stasiun = stage 4.)
    enter() {
        saveCampaignStage(3);   // checkpoint: campaign berada di stage 3
        ensureWorld();   // normalnya sudah dibangun stage1.enter (pre-build) — guard jaga-jaga
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 2) {
                disposeRobot(robots[i]);
                scene.remove(robots[i].mesh);
                robots.splice(i, 1);
            }
        }
        placeRobots();
        applyLightPreset(scene, 'indoor');
        enterCityEnv();   // latar kota Jakarta (kubah api global disembunyikan + haze dingin)
        const sp = s3Cell(S3_START.c, S3_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // yaw 180° — hadap selatan (masuk gedung)
        player.vy = 0; player.onGround = true;
        startMusic();   // musik latar in-game (lanjut bila sudah menyala dari stage 1)
        showStageMsg('FIGHT TO THE MAIN LOBBY DOORS TO EXIT THE BUILDING');
        updateUI();
    },

    // Mati di stage 3 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Animasi pintu geser otomatis (buka saat player/robot mendekat)
    updateMode(dt) { updateStageDoors(s3doors, dt); },

    // Dinding grid + furnitur; cek trigger tangga END -> turun ke jalan (stage 4)
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S3.x0 + S3_EXIT.c0 * S3.CELL
            && pos.x <= S3.x0 + (S3_EXIT.c1 + 1) * S3.CELL
            && pos.z >= S3.z0 + S3_EXIT.r0 * S3.CELL
            && pos.z <= S3.z0 + (S3_EXIT.r1 + 1) * S3.CELL) {
            beginStageTransition(stage4Scene);   // → SHOP SCENE (loading→shop→loading→stage 4)
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
        // doorBlock: robot tak bisa menembus pintu TERTUTUP (2026-07-18).
        return campaignRobotAI(z, dt, step, {
            walkable: stage3Walk, resolve, los: s3LOS, nav: s3Nav,
            doorBlock: (pos, r) => resolveDoors(s3doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, {
            walkable: stage3Walk, resolve, doorBlock: (pos, r) => resolveDoors(s3doors, pos, r)
        });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() { return `FLOOR 2 — Robots: ${countStageRobots(3)} | Reach the MAIN LOBBY DOOR`; },

    radarLandmarks(plot) {
        const e = s3Cell(S3_END.c, S3_END.r);
        plot(e.x - camera.position.x, e.z - camera.position.z, "#2eff6a", 5, true);
    },
};
