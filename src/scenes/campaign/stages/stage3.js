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

import { CFG, CAMP_M } from '../../../core/config.js';
import { player, robots, drops, _v3 } from '../../../core/state.js';
import { scene, camera } from '../../../core/renderer.js';
import { makeTexture, speckle } from '../../../utils/textures.js';
import { rand } from '../../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { applyLightPreset } from '../../../world/lighting.js';
import { showStageMsg } from '../../../core/dom.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { updateUI } from '../../../core/hud.js';
import { NADE_R } from '../../../entities/grenades.js';
import { disposeRobot } from '../../../entities/robots.js';
import { buildMedkitMesh, buildMagMesh } from '../../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../../entities/futuristicCupboard.js';
import { buildFuturisticCrateMesh } from '../../../entities/futuristicCrate.js';
import { buildFuturisticConsoleMesh } from '../../../entities/futuristicConsole.js';
import { buildFuturisticPlanterMesh } from '../../../entities/futuristicPlanter.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, updateRoomLamps, resetRoomLamps } from '../utility/common.js';
import { buildInteriorFloorMat, buildInteriorWallMat } from '../utility/interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors, doorBlocksShot, doorClampShot } from '../utility/doors.js';
import { buildStairwellUp, stairwellUpFootprint } from '../utility/stairwell.js';
import { buildCampaignCityscape, enterCityEnv } from '../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
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

// Lampu PER-RUANGAN (2026-07-19): mati saat stage dimulai, menyala saat player
// memasuki rect ruangannya. Papan EXIT (pintu lobi): MERAH terkunci -> HIJAU.
let s3Lamps = [];
let s3ExitSign = null, s3ExitLight = null, s3ExitOpen = false;
let s3HintT = 0;

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

    // --- Tangga START: BORDES dog-leg (2026-07-19, foto referensi user) —
    // flight TURUN DARI Lt.3 (dua flight + bordes + railing hitam + poros gelap
    // Lt.3), TANPA lubang lantai. END stage 3 = PINTU UTAMA LOBI (di bawah),
    // BUKAN tangga — jadi hanya varian NAIK di sini. Blocker persis footprint
    // lama -> nav/kolisi/BFS tak berubah. ---
    // TANGGA SUDUT L rapat tembok BARAT & UTARA (redesain 2026-07-19 — tanpa
    // celah, tanpa kotak gelap melayang; masuk dari sisi TIMUR).
    const upF = stairwellUpFootprint(S3.x0 + S3.CELL, S3.z0 + S3.CELL);
    buildStairwellUp(S3.x0 + S3.CELL, S3.z0 + S3.CELL, S3.H);
    blockers.push({
        x: upF.x, z: upF.z, hx: upF.hx, hz: upF.hz,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(upF.hx, upF.hz), top: 10, standable: true
    });

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
    // Papan EXIT pintu lobi + downlight — mulai MERAH = TERKUNCI sampai semua
    // robot stage 3 tumbang (2026-07-19, permintaan user); hijau di updateMode.
    s3ExitOpen = false;
    s3ExitSign = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xff4a3c, toneMapped: false }));
    s3ExitSign.position.set(exP.x, S3.H - 6, exP.z - 3);
    scene.add(s3ExitSign);
    s3ExitLight = new THREE.PointLight(0xff5040, 0.9, 240, 2);
    s3ExitLight.position.set(exP.x, S3.H - 8, exP.z - 6);
    scene.add(s3ExitLight);

    // --- Pencahayaan interior per-ruang. LAMPU PER-RUANGAN (2026-07-19,
    // permintaan user): mulai MATI (intensity 0), menyala saat player MEMASUKI
    // rect ruangannya (updateRoomLamps); kedua lampu lobi berbagi rect lobi. ---
    s3Lamps = [];
    const addLamp = (c, r, color, inten, dist, c0, r0, c1, r1) => {
        const p = s3Cell(c, r);
        const L = new THREE.PointLight(color, 0, dist, 2);
        L.position.set(p.x, S3.H - 3, p.z);
        scene.add(L);
        const lm = {
            L, base: inten, on: false, k: 0,
            x0: S3.x0 + c0 * S3.CELL, x1: S3.x0 + (c1 + 1) * S3.CELL,
            z0: S3.z0 + r0 * S3.CELL, z1: S3.z0 + (r1 + 1) * S3.CELL
        };
        // SELUBUNG GELAP (revisi 2026-07-19): ruangan belum dimasuki = hitam
        // total; kedua lampu lobi berbagi SATU selubung (rect sama).
        if (!s3Lamps.some(o => o.shroud && o.x0 === lm.x0 && o.z0 === lm.z0 && o.x1 === lm.x1 && o.z1 === lm.z1)) {
            const sh = new THREE.Mesh(
                new THREE.BoxGeometry(lm.x1 - lm.x0 - 1, S3.H - 0.6, lm.z1 - lm.z0 - 1),
                new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 1 }));
            sh.position.set((lm.x0 + lm.x1) / 2, (S3.H - 0.6) / 2 + 0.2, (lm.z0 + lm.z1) / 2);
            scene.add(sh);
            lm.shroud = sh;
        }
        s3Lamps.push(lm);
        return L;
    };
    addLamp(3, 3, 0xffd9a0, 0.9, 220, 1, 1, 6, 10);       // start
    addLamp(12, 4, 0xffe2b8, 0.9, 300, 8, 1, 18, 8);      // archive
    addLamp(24, 3, 0xffd9a0, 0.85, 240, 20, 1, 29, 8);    // top corridor
    addLamp(35, 4, 0xffe2b8, 0.9, 300, 31, 1, 38, 8);     // office
    addLamp(5, 15, 0xffd9a0, 0.85, 260, 1, 12, 11, 19);   // reading
    addLamp(21, 12, 0xbfe4ff, 0.7, 300, 13, 9, 31, 22);   // lobi utara (rect lobi)
    addLamp(21, 20, 0xbfe4ff, 0.6, 260, 13, 9, 31, 22);   // lobi selatan (rect lobi)
    addLamp(37, 15, 0xbfe4ff, 0.85, 260, 33, 12, 38, 19); // supply (dingin)
    addLamp(5, 26, 0xffd9a0, 0.85, 260, 1, 21, 11, 28);   // cafeteria
    addLamp(18, 26, 0xffb060, 0.7, 240, 12, 23, 23, 28);  // electrical (gelap kekuningan)
    addLamp(28, 26, 0xffc890, 0.8, 240, 24, 23, 32, 28);  // storage
    addLamp(37, 26, 0xffd9a0, 0.8, 240, 33, 21, 38, 28);  // end
    // Tautkan PINTU -> lampu ruangan (revisi 2026-07-19: lampu menyala saat
    // PINTU DIBUKA, bukan saat player melangkah masuk; ±1.5 sel dari rect).
    for (const lm of s3Lamps) lm.doors = s3doors.filter(d =>
        d.cx >= lm.x0 - 1.5 * S3.CELL && d.cx <= lm.x1 + 1.5 * S3.CELL &&
        d.cz >= lm.z0 - 1.5 * S3.CELL && d.cz <= lm.z1 + 1.5 * S3.CELL);

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
// penembak B/A (spot bertanda). Total 55 (2026-07-19 malam, permintaan user —
// dulu 40; lobi tengah & lobi bawah terpadat, ruang samping 5-6).
const S3_ROBOTS = [
    [12, 4, 5],   // 1 ruang kiri-atas
    [24, 4, 5],   // 2 ruang tengah-atas
    [34, 4, 5],   // 3 ruang kanan-atas
    [15, 10, 5],  // 4 koridor tengah
    [21, 16, 7],  // 5 LOBI TENGAH (area terbuka terbesar)
    [5, 16, 5],   // 6 ruang kiri-tengah (READING)
    [35, 16, 5],  // 7 ruang kanan-tengah (SUPPLY)
    [5, 25, 5],   // 8 ruang kiri-bawah (CAFETERIA)
    [21, 24, 7],  // 9 LOBI BAWAH (jalur ke pintu utama)
    [35, 25, 6],  // 10 ruang kanan-bawah (STORAGE)
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
        // Lampu ruangan mulai MATI + papan EXIT balik MERAH (terkunci)
        resetRoomLamps(s3Lamps);
        s3ExitOpen = false;
        if (s3ExitSign) {
            s3ExitSign.material.color.setHex(0xff4a3c);
            s3ExitLight.color.setHex(0xff5040);
        }
        const sp = s3Cell(S3_START.c, S3_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // yaw 180° — hadap selatan (masuk gedung)
        player.vy = 0; player.onGround = true;
        showStageMsg('FIGHT TO THE MAIN LOBBY DOORS TO EXIT THE BUILDING');
        updateUI();
    },

    // Mati di stage 3 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Pintu geser + lampu per-ruangan + papan EXIT merah->hijau saat bersih
    updateMode(dt) {
        updateStageDoors(s3doors, dt);
        updateRoomLamps(s3Lamps, dt);
        const clear = countStageRobots(3) === 0;
        if (clear !== s3ExitOpen && s3ExitSign) {
            s3ExitOpen = clear;
            s3ExitSign.material.color.setHex(clear ? 0x2eff6a : 0xff4a3c);
            s3ExitLight.color.setHex(clear ? 0x39ff7a : 0xff5040);
        }
    },

    // Dinding grid + furnitur; trigger PINTU LOBI -> keluar gedung (stage 4).
    // EXIT TERKUNCI (2026-07-19): transisi hanya bila SEMUA robot stage 3 mati.
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S3.x0 + S3_EXIT.c0 * S3.CELL
            && pos.x <= S3.x0 + (S3_EXIT.c1 + 1) * S3.CELL
            && pos.z >= S3.z0 + S3_EXIT.r0 * S3.CELL
            && pos.z <= S3.z0 + (S3_EXIT.r1 + 1) * S3.CELL) {
            if (countStageRobots(3) === 0) {
                beginStageTransition(stage4Scene);   // → SHOP SCENE (loading→shop→loading→stage 4)
            } else if (Date.now() - s3HintT > 2500) {
                s3HintT = Date.now();
                showStageMsg('THE LOBBY DOOR IS LOCKED — DESTROY ALL ROBOTS FIRST!', 2200);
            }
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Peluru MATI di dinding; PINTU TERTUTUP juga memblok peluru player & robot
    // (2026-07-19; doorClampShot menjepit posisi peluru ke sisi penembak —
    // boom launcher tak meledak di balik pintu).
    bulletBlocked(b) {
        return (b.mesh.position.y < S3.H
            && s3SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z))
            || doorClampShot(s3doors, b);
    },

    // AoE ledakan (launcher) TIDAK menembus pintu tertutup (2026-07-19):
    // dicek explodeAt per robot — ruas pusat ledakan -> robot.
    blastBlocked(x0, z0, x1, z1, y) { return doorBlocksShot(s3doors, x0, z0, x1, z1, y); },

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
        // Aktivasi HANYA bila robot MELIHAT player (2026-07-19 — LOS grid +
        // PINTU TERTUTUP menutup pandangan; bypass jarak dihapus).
        // doorBlock: robot tak bisa menembus pintu TERTUTUP (2026-07-18).
        return campaignRobotAI(z, dt, step, {
            walkable: stage3Walk, resolve, nav: s3Nav,
            los: (x1, z1, x2, z2) => s3LOS(x1, z1, x2, z2)
                && !doorBlocksShot(s3doors, x1, z1, x2, z2, 8),
            doorBlock: (pos, r) => resolveDoors(s3doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, {
            walkable: stage3Walk, resolve, doorBlock: (pos, r) => resolveDoors(s3doors, pos, r)
        });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        const n = countStageRobots(3);
        return n > 0 ? `FLOOR 2 — Robots: ${n} | Destroy ALL robots to unlock the lobby door`
            : 'FLOOR 2 — Robots: 0 | DOOR UNLOCKED — reach the MAIN LOBBY DOOR';
    },

    // Landmark pintu lobi (merah = terkunci / hijau = terbuka)
    radarLandmarks(plot) {
        const e = s3Cell(S3_END.c, S3_END.r);
        plot(e.x - camera.position.x, e.z - camera.position.z,
            s3ExitOpen ? "#2eff6a" : "#ff5040", 5, true);
    },
};
