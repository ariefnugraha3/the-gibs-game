// SCENE: Campaign STAGE 1 — "Gedung Terbengkalai (Lantai 2)", indoor 60x60 m.
// DENAH DIROMBAK 2026-07-18 mengikuti PLAN RESMI user (stage1.csv/gambar) — grid
// 30x30 (BUKAN 40x30 seperti stage 2/3): '#'=dinding biru, '-'=pintu (merah),
// tangga START hijau (kiri-atas), tangga END kuning (kanan-bawah). buildS1Grid
// mem-parse string denah `S1_MAP` langsung (bukan carve()), jadi dinding/pintu
// PERSIS sesuai plan. Tata letak: START (kiri-atas) -> CONFERENCE (tengah-atas) /
//   SUPPLY (kanan-atas: ammo/medkit) -> OFFICE (kiri-tengah) / MAIN HALL (pusat) /
//   SECURITY (kanan-tengah) -> BREAK (kiri-bawah) / RESTROOM & STORAGE (bawah-
//   tengah) -> END tangga TURUN (kanan-bawah = stage 2). Grid sel 2 m (1=dinding,
//   0=lantai) — dinding visual, collision, LOS, hit-peluru semua dari grid SAMA.
//   Konektivitas (684 sel lantai, 1 region) + 0 dinding-ganda DIVERIFIKASI BFS
//   (scratchpad parse1.mjs & smoke test); pintu geser di semua bukaan '-'.

import { CFG, CAMP_M } from '../../core/config.js';
import { player, drops, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { setS1FlickerLight } from '../../world/decor.js';
import { applyLightPreset } from '../../world/lighting.js';
import { hideStageMsg } from '../../core/dom.js';
import { startMusic } from '../../utils/sfx.js';
import { saveCampaignStage } from '../../core/saveGame.js';
import { NADE_R } from '../../entities/grenades.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../entities/futuristicCupboard.js';
import { buildFuturisticMeetingTableMesh } from '../../entities/futuristicMeetingTable.js';
import { buildFuturisticCrateMesh } from '../../entities/futuristicCrate.js';
import { buildFuturisticSofaMesh } from '../../entities/futuristicSofa.js';
import { buildFuturisticStallMesh } from '../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../entities/futuristicSink.js';
import { buildFuturisticConsoleMesh } from '../../entities/futuristicConsole.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots } from './common.js';
import { buildInteriorFloorMat, buildInteriorWallMat } from './interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors } from './doors.js';
import { buildCampaignCityscape, enterCityEnv } from './cityscape.js';
import { beginStageTransition, campaignJumpToStage } from './transition.js';
import { stage2Scene, buildWorld as buildStage2World, placeRobots as placeStage2Robots } from './stage2.js';
import { ensureWorld as ensureStage3World } from './stage3.js';   // (circular aman: dipanggil DI DALAM enter)
import { ensureWorld as ensureStage4World } from './stage4.js';

// Grid 30 kolom x 30 baris (sel 2 m; PERSEGI 30x30 sesuai plan resmi user —
// BUKAN 40x30 seperti stage 2/3). Gedung ~26 km dari jalan raya (stage 2) —
// kedua dunia hidup berdampingan di satu scene, dipisah jarak.
export const S1 = {
    G: 30, CELL: 2 * CAMP_M, H: 22,       // tinggi plafon ~3.1 m
    x0: 30000 - 15 * 2 * CAMP_M,          // pojok barat-laut grid (kiri-atas denah)
    z0: -15 * 2 * CAMP_M
};
export let s1grid = null;                 // [row][col] 1=dinding, 0=lantai
export const s1Cell = (c, r) => ({ x: S1.x0 + (c + 0.5) * S1.CELL, z: S1.z0 + (r + 0.5) * S1.CELL });
export const S1_START = { c: 3, r: 4 };   // ruang tangga TURUN dari Lantai 3 (hijau, kiri-atas)
export const S1_END = { c: 25, r: 27 };   // tangga TURUN (kuning, kanan-bawah) -> stage 2
// Trigger tangga TURUN (kanan-bawah) -> turun ke lantai bawah (stage 2 jalan raya)
export const S1_EXIT = { c0: 22, r0: 25, c1: 28, r1: 28 };

// DENAH RESMI (stage1.csv). 30x30. '#'=dinding, '.'=lantai (pintu '-' = lantai).
// JANGAN ubah tanpa update S1_DOORS/S1_EXIT/robot + tes ulang (parse1.mjs/smoke).
const S1_MAP = [
    '##############################',   // 0
    '#.......#....................#',   // 1
    '#.......#....................#',   // 2
    '#...................#........#',   // 3  (pintu A<->B @c8, B<->C @c20)
    '#...................#........#',   // 4
    '#.......#...........#........#',   // 5
    '#.......#...........#........#',   // 6
    '###..########...##############',   // 7  (pintu A<->D @c3-4, B<->Hall @c13-15)
    '#.......#............#.......#',   // 8
    '#.......#............#.......#',   // 9
    '#.......#............#.......#',   // 10
    '#....................#.......#',   // 11 (pintu D<->Hall @c8)
    '#............................#',   // 12 (pintu D<->Hall @c8, Hall<->H @c21)
    '#.......#............#.......#',   // 13
    '#.......#............#.......#',   // 14
    '#.......#............#.......#',   // 15
    '#.......#............#.......#',   // 16
    '###..####......#.....#########',   // 17 (pintu D<->E @c3-4; Hall turun @c9-14,16-20)
    '#.......#......#.....#.......#',   // 18
    '#.......#......#.....#.......#',   // 19
    '#.......#####..#.#####.......#',   // 20 (pintu F @c13-14, I @c16)
    '#.......#......#.....#.......#',   // 21
    '#.......#......#.....#.......#',   // 22
    '#.......#......#.............#',   // 23 (pintu I<->J @c21)
    '#.......#......#.............#',   // 24
    '#.......#......#.....#.......#',   // 25
    '#.......#......#.....#.......#',   // 26
    '#.......#......#.....#.......#',   // 27
    '#.......#......#.....#.......#',   // 28
    '##############################',   // 29
];

// PINTU geser otomatis di SEMUA bukaan '-' plan resmi (10 pintu). {sel bukaan
// c0,r0..c1,r1, dir} dir 'ew'=dinding VERTIKAL (panel sumbu-z) / 'ns'=HORIZONTAL.
const S1_DOORS = [
    { c0: 8, r0: 3, c1: 8, r1: 4, dir: 'ew' },      // A (start) <-> B (conference)
    { c0: 20, r0: 1, c1: 20, r1: 2, dir: 'ew' },    // B (conference) <-> C (supply)
    { c0: 3, r0: 7, c1: 4, r1: 7, dir: 'ns' },      // A <-> D (office)
    { c0: 13, r0: 7, c1: 15, r1: 7, dir: 'ns' },    // B <-> Main Hall (pintu utara aula)
    { c0: 8, r0: 11, c1: 8, r1: 12, dir: 'ew' },    // D (office) <-> Main Hall
    { c0: 21, r0: 12, c1: 21, r1: 12, dir: 'ew' },  // Main Hall <-> H (security)
    { c0: 3, r0: 17, c1: 4, r1: 17, dir: 'ns' },    // D (office) <-> E (break room)
    { c0: 13, r0: 20, c1: 14, r1: 20, dir: 'ns' },  // F restroom (bagi atas/bawah)
    { c0: 16, r0: 20, c1: 16, r1: 20, dir: 'ns' },  // I storage (bagi atas/bawah)
    { c0: 21, r0: 23, c1: 21, r1: 24, dir: 'ew' },  // I (storage) <-> J (end/stairs)
];
let s1doors = null;

const blockers = [];   // furnitur/undakan pejal stage 1 {x,z,hx,hz,ax*,az*,top,standable}
let built = false;

function buildS1Grid() {
    // Bangun grid langsung dari denah resmi (baris string -> 1/0); '.' & '-' = lantai.
    s1grid = S1_MAP.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
}

// Sel dinding? (di luar grid = dinding)
export function s1Wall(c, r) {
    return c < 0 || r < 0 || c >= S1.G || r >= S1.G || s1grid[r][c] === 1;
}

// Lingkaran (x,z,r) sepenuhnya di lantai gedung? (walkable stage 1)
export function stage1Walk(x, z, r) {
    if (!s1grid) return false;
    const c0 = Math.floor((x - r - S1.x0) / S1.CELL), c1 = Math.floor((x + r - S1.x0) / S1.CELL);
    const r0 = Math.floor((z - r - S1.z0) / S1.CELL), r1 = Math.floor((z + r - S1.z0) / S1.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s1Wall(cc, rr)) return false;
    return true;
}

// Garis pandang bebas dinding? (sampling grid tiap ~setengah sel).
// Dipakai aktivasi robot stage 1: bangun hanya bila MELIHAT player
// (atau sangat dekat menembus dinding tipis / tertembak).
export function s1LOS(x1, z1, x2, z2) {
    if (!s1grid) return true;
    const dx = x2 - x1, dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (S1.CELL * 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + dx * t - S1.x0) / S1.CELL);
        const r = Math.floor((z1 + dz * t - S1.z0) / S1.CELL);
        if (s1Wall(c, r)) return false;
    }
    return true;
}

// Ruas peluru menabrak dinding? (sampling tiap ~7 unit; peluru cepat = 2 sel/frame)
export function s1SegHitsWall(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 7));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + (x2 - x1) * t - S1.x0) / S1.CELL);
        const r = Math.floor((z1 + (z2 - z1) * t - S1.z0) / S1.CELL);
        if (s1Wall(c, r)) return true;
    }
    return false;
}

// Penghalang pejal stage 1 = furnitur + undakan tangga (balok axis-aligned)
export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

// Nav-grid pathfinder stage 1: resolusi SETENGAH sel denah (7 unit = 1 m)
// agar furnitur ikut ter-bake tanpa menutup jalur yang sebenarnya lebar.
// Dinding dari grid denah; furnitur/undakan via resolve (sel yang tergeser =
// penghalang) -> robot MEMUTARI meja/krat, bukan menabrak/mendorongnya.
// Di-bake di AKHIR buildWorld (butuh blockers sudah terisi semua).
export let s1Nav = null;

// Bangun SEMUA dunia campaign (stage 1 sendiri + stage 2/3/4) SEKALI, guard
// `built` — bagian pembangunan MURNI dari enter() (tanpa menempatkan robot /
// memosisikan player). Dipakai stage1.enter() DAN cutscene intro (intro.js)
// supaya dunia sudah ada untuk warmup + transisi ke stage 1 di akhir intro,
// tanpa menempatkan robot dua kali.
export function ensureWorld() {
    if (built) return;
    built = true;
    buildStage2World();   // STAGE 2: gedung terbengkalai Lantai 2 (denah, jauh)
    buildWorld();         // STAGE 1: gedung terbengkalai (jauh dari stage 2)
    // PRE-BUILD dunia stage 3 & 4 juga (2026-07-16): SEMUA dunia campaign
    // dibangun di sini, di balik layar loading awal startGame (warmupAll
    // sesudahnya ikut meng-compile shadernya, termasuk MeshStandard/Physical
    // mobil stage 4) → LOADING #2 antar-stage tak lagi menanggung build+compile
    // lazy, tiap transisi konsisten ~900 ms.
    ensureStage3World();
    ensureStage4World();
}

export function buildWorld() {
    buildS1Grid();
    const size = S1.G * S1.CELL;                      // 420 unit = 60 m
    const cx = S1.x0 + size / 2, cz = S1.z0 + size / 2;

    // --- Lantai: panel fasilitas TERANG futuristik (interior.js; 1 ubin/sel 2 m) ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        buildInteriorFloorMat(S1.G, S1.G));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // Latar KOTA JAKARTA mengelilingi gedung (2026-07-18) — dekor, tanpa blocker
    buildCampaignCityscape(cx, cz, size / 2, size / 2);

    // --- Plafon: panel akustik gelap (menghadap ke bawah) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#2a2723'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#24211c', '#312d27', '#1d1b17'], 120, 1, 4);
        g.strokeStyle = 'rgba(12,11,9,0.7)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.moveTo(0, 0); g.lineTo(0, h); g.stroke();
    }, S1.G, S1.G);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S1.H, cz);
    // TOP-DOWN (pivot 2026-07-11): plafon DISEMBUNYIKAN — kamera berada jauh di
    // atasnya; dinding tetap berdiri jadi interior terlihat dari atas ala Alien
    // Shooter. Fisika "granat memantul di plafon" (grenadeCollide) tidak berubah.
    ceil.visible = false;
    scene.add(ceil);

    // --- Dinding: satu InstancedMesh (hanya sel dinding yang bertetangga lantai) ---
    const wallCells = [];
    for (let r = 0; r < S1.G; r++) {
        for (let c = 0; c < S1.G; c++) {
            if (s1grid[r][c] !== 1) continue;
            let nearFloor = false;                     // dinding terkubur di-skip (hemat)
            for (let dr = -1; dr <= 1 && !nearFloor; dr++)
                for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                    if (!s1Wall(c + dc, r + dr)) nearFloor = true;
            if (nearFloor) wallCells.push([c, r]);
        }
    }
    const wallMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(S1.CELL, S1.H, S1.CELL),
        buildInteriorWallMat(),
        wallCells.length);
    {
        const _m = new THREE.Matrix4(), _c = new THREE.Color();
        wallCells.forEach(([c, r], i) => {
            const p = s1Cell(c, r);
            _m.setPosition(p.x, S1.H / 2, p.z);
            wallMesh.setMatrixAt(i, _m);
            _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04));   // jitter kusam per panel
            wallMesh.setColorAt(i, _c);
        });
        if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    }
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;   // bounds instance tak dihitung r128
    scene.add(wallMesh);

    // --- Pintu geser otomatis (ruangan tertutup; buka saat player mendekat) ---
    s1doors = buildStageDoors(S1_DOORS, s1Cell, S1.CELL, S1.H);

    // --- Furnitur: satu InstancedMesh box + blocker pejal ---
    const fur = [];   // {x,y,z,sx,sy,sz,ry,color}
    const furBox = (c, r, sx, sy, sz, color, ry = 0, dx = 0, dz = 0) => {
        const p = s1Cell(c, r);
        fur.push({ x: p.x + dx, y: sy / 2, z: p.z + dz, sx, sy, sz, ry, color });
        return { x: p.x + dx, z: p.z + dz };
    };
    // blocker pejal axis-aligned (standable -> bisa dipanjat/dipijak)
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
        const p = s1Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, standable);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.5 + 2);   // majukan KELUAR dari meja (2026-07-18)
        chair.rotation.y = Math.PI;                     // putar 180°: jok menghadap meja
        scene.add(chair);
    };
    // MEJA RAPAT: model meeting table (ruang konferensi).
    const meetingModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r);
        putModel(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };
    // RAK/LEMARI: deret lemari (cupboard) sepanjang sisi terpanjang (tiap unit ~kotak,
    // dibatasi 4) — 1 blocker footprint penuh (nav/collision sama seperti dulu).
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r), x = p.x + dx, z = p.z + dz;
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
        const p = s1Cell(c, r);
        putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };
    // MONITOR: konsol kecil DI ATAS meja (dekorasi, TANPA blocker) di y=top.
    const monitorModel = (c, r, sx, sy, sz, dx, dz, top) => {
        const p = s1Cell(c, r);
        const m = buildFuturisticConsoleMesh(sx, sy, sz);
        m.position.set(p.x + dx, top, p.z + dz);
        scene.add(m);
    };
    // Furnitur DIROMBAK 2026-07-18 ke denah resmi (jauh dari pintu/bukaan aula).
    // Conference (B) c9-19 r1-6: meja rapat panjang di tengah
    meetingModel(14, 3, 84, 7, 30);
    // Supply (C) c21-28 r1-6: rak logam (model lemari) di dinding utara & timur
    cupboardModel(24, 1, 70, 15, 8, 0, 1);
    cupboardModel(27, 4, 8, 15, 24);
    // Office (D) c1-7 r8-16: dua meja (model meja + kursi) + terminal
    deskModel(3, 10, 26, 7, 12);
    deskModel(4, 13, 22, 7, 12, 2, 0);
    monitorModel(3, 10, 6, 4, 1.5, 0, -3, 7);
    // Main Hall (pusat) c9-20 r8-16: krat cover tersebar (jalur tengah terbuka)
    propModel(buildFuturisticCrateMesh, 12, 10, 16, 9, 16);
    propModel(buildFuturisticCrateMesh, 17, 13, 16, 9, 16);
    propModel(buildFuturisticCrateMesh, 11, 15, 14, 8, 14);
    // Security (H) c22-28 r8-16: meja monitor + terminal + kabinet
    deskModel(25, 10, 24, 7, 12);
    cupboardModel(27, 14, 8, 16, 20);
    monitorModel(25, 10, 6, 4, 1.5, 0, -3, 7);
    // Break Room (E) c1-7 r18-28: sofa + meja
    propModel(buildFuturisticSofaMesh, 3, 20, 20, 6, 18);
    deskModel(4, 25, 16, 7, 12, 2, 0);
    // Restroom (F) c9-14 r21-28: bilik (sekat) + deret wastafel
    propModel(buildFuturisticStallMesh, 10, 24, 2, 15, 18, 2, 0);
    propModel(buildFuturisticSinkMesh, 11, 27, 10, 8, 4, 0, -1);
    // Storage (I) c16-20 r21-28: rak + krat (sisakan jalur c18-20 ke pintu c21)
    cupboardModel(17, 22, 8, 16, 16);
    propModel(buildFuturisticCrateMesh, 18, 27, 12, 9, 10);
    // End room (J) c22-28 r18-28: sebagian besar TERBUKA (jalur ke tangga); satu krat pinggir
    propModel(buildFuturisticCrateMesh, 24, 19, 12, 9, 12);
    if (fur.length) {   // render sisa furnitur balok sbg satu instanced mesh (kini kosong: semua prop -> model)
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

    // --- Tangga masuk & keluar: undakan + portal gelap (kesan lantai bawah) ---
    const stepMat = new THREE.MeshPhongMaterial({ color: 0x57534b, shininess: 6 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x020202 });
    const mkStairs = (c, r, dirZ) => {   // dirZ: -1 = naik ke utara, +1 = ke selatan
        const p = s1Cell(c, r);
        for (let i = 0; i < 5; i++) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(26, 2 + i * 2, 8), stepMat);
            st.position.set(p.x, (2 + i * 2) / 2, p.z + dirZ * (i * 8 - 14));
            st.castShadow = true; st.receiveShadow = true;
            scene.add(st);
        }
        const portal = new THREE.Mesh(new THREE.PlaneGeometry(26, S1.H - 10), holeMat);
        // tepat di DEPAN muka dinding (bukan terkubur di dalam sel dinding)
        portal.position.set(p.x, (S1.H - 10) / 2 + 9, p.z + dirZ * 20);
        portal.rotation.y = dirZ > 0 ? Math.PI : 0;
        scene.add(portal);
        blockers.push({   // undakan pejal (bisa dipijak)
            x: p.x, z: p.z + dirZ * 4, hx: 13, hz: 20,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(13, 20), top: 10, standable: true
        });
    };
    mkStairs(3, 2, -1);     // START: tangga naik ke utara = jalur turun dari Lantai 3 (hijau)
    mkStairs(25, 27, 1);    // END: tangga TURUN ke selatan = ke lantai bawah (stage 2) (kuning)

    // Papan EXIT hijau menyala di atas tangga keluar (kanan-bawah)
    const exitP = s1Cell(25, 26);
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x2eff6a, toneMapped: false }));
    exitSign.position.set(exitP.x, S1.H - 4, exitP.z);
    scene.add(exitSign);

    // --- Pencahayaan interior: 6 titik lampu TETAP (dibuat saat build, sebelum
    // render pertama -> shader compile sekali; hanya intensity yang dianimasikan).
    const lampFix = new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false });
    const addLamp = (c, r, color, inten, dist) => {
        const p = s1Cell(c, r);
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(p.x, S1.H - 3, p.z);
        scene.add(L);
        const fix = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 8), lampFix);
        fix.position.set(p.x, S1.H - 0.4, p.z);
        scene.add(fix);
        return L;
    };
    addLamp(3, 3, 0xffd9a0, 0.9, 220);                           // stairwell/start
    addLamp(14, 3, 0xffe2b8, 0.95, 320);                         // conference
    addLamp(24, 3, 0xffd9a0, 0.9, 240);                          // supply room
    addLamp(3, 12, 0xffd9a0, 0.85, 220);                         // office
    setS1FlickerLight(addLamp(14, 12, 0xffe2b8, 0.9, 340));      // main hall (berkedip)
    addLamp(25, 12, 0xbfe4ff, 0.8, 240);                         // security (dingin kebiruan)
    addLamp(3, 23, 0xffd9a0, 0.8, 220);                          // break room
    addLamp(11, 25, 0xbfe4ff, 0.7, 200);                         // restroom
    addLamp(18, 25, 0xffc890, 0.8, 240);                         // storage
    addLamp(25, 22, 0xffc890, 0.8, 240);                         // end room
    const exitLight = new THREE.PointLight(0x39ff7a, 0.85, 220, 2);
    exitLight.position.set(exitP.x, S1.H - 6, exitP.z);
    scene.add(exitLight);

    // Bake nav-grid TERAKHIR (semua blockers sudah terisi): dinding dari grid
    // denah, furnitur/undakan dari resolve. Radius sampel 3 (< badan 3.5)
    // agar celah sempit tapi lewat-able tidak tertutup di grid.
    const half = S1.CELL / 2;
    s1Nav = makeNavGrid(S1.x0, S1.z0, half, S1.G * 2, S1.G * 2, (x, z) => {
        if (!stage1Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });
}

// Robot stage 1: 9 spot pada denah referensi [col, row, jumlah]. Tiap spot
// men-spawn `n` robot di sekitar titiknya (jitter + resolve keluar furnitur).
const S1_ROBOTS = [
    [14, 3, 3],    // 1 conference (tengah-atas)
    [24, 3, 3],    // 2 supply room (kanan-atas)
    [4, 12, 3],    // 3 office (kiri-tengah)
    [14, 12, 5],   // 4 main hall (area terbuka)
    [25, 12, 4],   // 5 security (kanan-tengah, ambush)
    [4, 23, 3],    // 6 break room (kiri-bawah)
    [11, 25, 3],   // 7 restroom (bawah-tengah)
    [18, 25, 3],   // 8 storage (bawah-tengah)
    [25, 24, 2],   // 9 dekat tangga keluar (serangan terakhir)
];
export function placeRobots() {
    for (const [c, r, n] of S1_ROBOTS) {
        const p = s1Cell(c, r);
        for (let k = 0; k < n; k++) {
            _v3.set(p.x + rand(-7, 7), 0, p.z + rand(-7, 7));
            resolve(_v3, 4, 0);                             // geser keluar furnitur
            if (!stage1Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            spawnCampaignRobot(_v3.x, _v3.z, 1);
        }
    }
}

// Persediaan stage 1 (tak kedaluwarsa): SUPPLY ROOM (kanan-atas) berisi ammo +
// medkit; bonus kecil tersebar di break/restroom/storage. (Granat lempar dihapus
// 2026-07-11 — persediaan granat lama diganti paket peluru.)
export function placeSupplies() {
    const put = (type, c, r, dx = 0, dz = 0) => {
        const p = s1Cell(c, r);
        const mesh = type === 'mag' ? buildMagMesh() : buildMedkitMesh();
        mesh.position.set(p.x + dx, 1, p.z + dz);
        scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    // Supply Room (c21-28 r1-6; hindari rak dinding utara r1 & timur c27)
    put('mag', 22, 3); put('mag', 23, 4);
    put('mag', 24, 3); put('mag', 25, 4);
    put('medkit', 23, 5); put('medkit', 25, 3);
    // Bonus tersebar (sel lantai terbuka — bebas furnitur)
    put('mag', 3, 22);       // break room
    put('medkit', 11, 23);   // restroom (bagian atas, dekat pintu ke aula)
    put('mag', 19, 27);      // storage
}

export const stage1Scene = {
    id: 'campaign-1',

    // Masuk stage 1 = mulai campaign (start pertama ATAU restart setelah mati).
    // Array robots/drops selalu sudah bersih di titik ini, jadi penempatan
    // ulang aman. Kedua dunia dibangun sekali (guard `built`).
    enter() {
        saveCampaignStage(1);     // checkpoint: campaign berada di stage 1
        ensureWorld();            // bangun SEMUA dunia campaign sekali (guard `built`;
                                  // intro.js mungkin sudah membangunnya lebih dulu)
        placeStage2Robots();     // robot gedung stage 2 (9 spot denah) + supply
        placeRobots();           // robot gedung sesuai denah (stage 1)
        placeSupplies();          // ruang persediaan: ammo/granat/medkit
        applyLightPreset(scene, 'indoor');   // interior TERANG futuristik (2026-07-18)
        enterCityEnv();   // latar kota Jakarta: kubah api global disembunyikan + haze dingin
        const sp = s1Cell(S1_START.c, S1_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // yaw 180° — hadap selatan (pintu lobby)
        startMusic();   // musik latar in-game (mulai saat masuk Stage 1; TIDAK di intro/menu)
        hideStageMsg();
    },

    // Mati -> ulang dari stage 1 juga (dirinya sendiri)
    restartScene: () => stage1Scene,

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Animasi pintu geser otomatis (buka saat player/robot mendekat)
    updateMode(dt) { updateStageDoors(s1doors, dt); },

    // Dinding grid: geser per-sumbu (menyusur tembok), penghalang furnitur,
    // slide lagi, lalu cek trigger tangga keluar -> transisi ke stage 2.
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        // Trigger tangga keluar -> FIELD SHOP dulu, lalu transisi ber-loading ke stage 2
        if (pos.x >= S1.x0 + S1_EXIT.c0 * S1.CELL
            && pos.x <= S1.x0 + (S1_EXIT.c1 + 1) * S1.CELL
            && pos.z >= S1.z0 + S1_EXIT.r0 * S1.CELL
            && pos.z <= S1.z0 + (S1_EXIT.r1 + 1) * S1.CELL) {
            beginStageTransition(stage2Scene);   // → SHOP SCENE (loading→shop→loading→stage 2)
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Peluru MATI di dinding — mencegah membunuh robot diam di ruangan lain
    // menembus tembok (sweep ruas posisi-lalu -> kini).
    bulletBlocked(b) {
        return b.mesh.position.y < S1.H
            && s1SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },

    grenadeCollide(g, oldGX, oldGZ) {
        // Pantulan dinding grid + penghalang furnitur
        if (!stage1Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        // Plafon gedung: granat memantul turun, tidak lolos ke atas
        if (g.mesh.position.y > S1.H - NADE_R) {
            g.mesh.position.y = S1.H - NADE_R;
            if (g.vy > 0) g.vy = -g.vy * 0.3;
        }
    },

    robotAI(z, dt, step) {
        // Indoor: aktivasi butuh LOS grid (atau sangat dekat / tertembak).
        // doorBlock: robot tak bisa menembus pintu TERTUTUP (2026-07-18).
        return campaignRobotAI(z, dt, step, {
            walkable: stage1Walk, resolve, los: s1LOS, nav: s1Nav,
            doorBlock: (pos, r) => resolveDoors(s1doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, {
            walkable: stage1Walk, resolve, doorBlock: (pos, r) => resolveDoors(s1doors, pos, r)
        });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() { return `FLOOR 2 — Robots: ${countStageRobots(1)} | Find the stairs down`; },

    // Landmark gedung: tangga keluar (hijau menyala; dijepit ke tepi saat jauh)
    radarLandmarks(plot) {
        const ex = S1.x0 + (S1_EXIT.c0 + S1_EXIT.c1 + 1) / 2 * S1.CELL;
        const ez = S1.z0 + (S1_EXIT.r0 + S1_EXIT.r1 + 1) / 2 * S1.CELL;
        plot(ex - camera.position.x, ez - camera.position.z, "#2eff6a", 5, true);
    },
};
