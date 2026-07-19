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
import { buildFuturisticSofaMesh } from '../../../entities/futuristicSofa.js';
import { buildFuturisticRubbleMesh } from '../../../entities/futuristicRubble.js';
import { buildFuturisticConsoleMesh } from '../../../entities/futuristicConsole.js';
import { buildFuturisticBenchMesh } from '../../../entities/futuristicBench.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots } from '../utility/common.js';
import { buildInteriorFloorMat, buildInteriorWallMat } from '../utility/interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors, doorBlocksShot, doorClampShot } from '../utility/doors.js';
import { buildCampaignCityscape, enterCityEnv } from '../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
import { stage1Scene } from './stage1.js';
import { stage3Scene } from './stage3.js';

// Grid 40 kolom x 30 baris (sel 2 m). DENAH DIROMBAK 2026-07-18 mengikuti PLAN
// RESMI user (stage2.csv/gambar): '#'=dinding, '.'=lantai; pintu (merah), start
// (hijau, kiri-atas), end (kuning, kanan-bawah). Gedung ~60 km dari origin —
// hidup berdampingan dgn stage lain, dipisah jarak (camera.far + culling).
export const S2 = {
    G: 40, ROWS: 30, CELL: 2 * CAMP_M, H: 22,   // tinggi plafon ~3.1 m
    x0: 60000 - 20 * 2 * CAMP_M,                 // pojok barat-laut grid
    z0: -15 * 2 * CAMP_M
};
export let s2grid = null;                        // [row][col] 1=dinding, 0=lantai
export const s2Cell = (c, r) => ({ x: S2.x0 + (c + 0.5) * S2.CELL, z: S2.z0 + (r + 0.5) * S2.CELL });
export const S2_START = { c: 3, r: 3 };          // ruang tangga TURUN dari Lt.3 (hijau, kiri-atas)
export const S2_END = { c: 36, r: 27 };          // tangga TURUN ke stage 3 (kuning, kanan-bawah)
// Trigger tangga keluar (ruang END, kanan-bawah)
const S2_EXIT = { c0: 34, r0: 26, c1: 38, r1: 28 };

// DENAH RESMI (stage2.csv). 40x30. '#'=dinding, '.'=lantai (pintu = lantai +
// diberi pintu geser dari S2_DOORS). JANGAN ubah tanpa update S2_DOORS/robot.
const S2_MAP = [
    '########################################',
    '#.......#........#.....................#',
    '#.......#........#.........#...........#',
    '#.......#........#.........#...........#',
    '#.......#..................#...........#',
    '#.......#..................#...........#',
    '#.......#........#######################',
    '#.............................#........#',
    '#.............................#........#',
    '####..#####...................#........#',
    '#.........#...................#........#',
    '#.........#............................#',
    '#.........#............................#',
    '#.............................#........#',
    '#.............................#........#',
    '#.........#...................#........#',
    '#.........#...................#........#',
    '#.........#...................#........#',
    '####..##################################',
    '#............#.........................#',
    '#............#.........................#',
    '#............#.............#...........#',
    '#............#.............#...........#',
    '#..........................#...........#',
    '#..........................#...........#',
    '#............#.............#...........#',
    '#............#.............#...........#',
    '#............#.............#...........#',
    '#............#.............#...........#',
    '########################################',
];

// PINTU geser otomatis di SEMUA bukaan '-' plan resmi (7 pintu, tiap 2 sel).
const S2_DOORS = [
    { c0: 17, r0: 4, c1: 17, r1: 5, dir: 'ew' },   // OFFICE <-> ruang atas-tengah
    { c0: 4, r0: 9, c1: 5, r1: 9, dir: 'ns' },     // koridor atas <-> WAITING
    { c0: 30, r0: 11, c1: 30, r1: 12, dir: 'ew' }, // aula tengah <-> SUPPLY
    { c0: 10, r0: 13, c1: 10, r1: 14, dir: 'ew' }, // WAITING <-> aula tengah
    { c0: 4, r0: 18, c1: 5, r1: 18, dir: 'ns' },   // WAITING <-> LAB
    { c0: 27, r0: 19, c1: 27, r1: 20, dir: 'ew' }, // CONTROL <-> END
    { c0: 13, r0: 23, c1: 13, r1: 24, dir: 'ew' }, // LAB <-> CONTROL
];
let s2doors = null;

const blockers = [];   // furnitur/undakan pejal {x,z,hx,hz,ax*,az*,top,standable}
let built = false;

function buildS2Grid() {
    // Bangun grid langsung dari denah resmi (baris string -> 1/0).
    s2grid = S2_MAP.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
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

    // --- Lantai: panel fasilitas TERANG futuristik (interior.js; 1 ubin/sel 2 m) ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        buildInteriorFloorMat(S2.G, S2.ROWS));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // Latar KOTA JAKARTA mengelilingi gedung (2026-07-18) — dekor, tanpa blocker
    buildCampaignCityscape(cx, cz, sizeX / 2, sizeZ / 2);

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
        buildInteriorWallMat(),
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

    // --- Pintu geser otomatis (ruangan tertutup; buka saat player mendekat) ---
    s2doors = buildStageDoors(S2_DOORS, s2Cell, S2.CELL, S2.H);

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
        chair.position.set(x, 0, z + sz * 0.5 + 2);   // majukan KELUAR dari meja (2026-07-18)
        chair.rotation.y = Math.PI;                     // putar 180°: jok menghadap meja
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
    // PROP MODEL generik (entities/futuristic*.js): dari cell grid + blocker
    // footprint sama seperti furBlock -> nav/collision IDENTIK dgn versi balok.
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s2Cell(c, r);
        putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };
    // Furnitur DIROMBAK 2026-07-18 mengikuti denah resmi baru (jauh dari pintu).
    // OFFICE (c9-16 r1-6): meja kerja
    deskModel(12, 3, 24, 7, 12);
    // Ruang atas-tengah (c18-26 r1-5): jebakan RUNTUHAN (model puing)
    propModel(buildFuturisticRubbleMesh, 22, 3, 16, 9, 16);
    // Ruang atas-kanan (c28-38 r1-5): rak arsip (model lemari) di dinding utara
    cupboardModel(34, 2, 22, 15, 8);
    // AULA TENGAH (c11-29 r7-17): krat (model) cover tersebar (jalur tengah terbuka)
    propModel(buildFuturisticCrateMesh, 16, 11, 16, 9, 16);
    propModel(buildFuturisticCrateMesh, 23, 14, 16, 9, 16);
    // WAITING (c1-9 r10-17): sofa (model) + meja (model meja)
    propModel(buildFuturisticSofaMesh, 4, 12, 18, 6, 16);
    deskModel(6, 15, 16, 7, 10);
    // SUPPLY (c31-38 r7-17): rak logam (model lemari; jauh dari titik persediaan & pintu)
    cupboardModel(34, 8, 22, 15, 8);
    cupboardModel(37, 14, 8, 15, 20);
    // LAB (c1-12 r19-28): meja-meja lab (model bangku; bisa dilompati -> standable)
    propModel(buildFuturisticBenchMesh, 5, 22, 22, 6, 12);
    propModel(buildFuturisticBenchMesh, 9, 26, 18, 6, 10);
    // CONTROL (c14-26 r19-28): konsol elektronik (model) + kabinet
    propModel(buildFuturisticConsoleMesh, 18, 22, 24, 7, 12);
    propModel(buildFuturisticConsoleMesh, 22, 26, 20, 7, 10);
    cupboardModel(24, 20, 10, 15, 8);
    // END (c28-38 r19-28): sebagian besar kosong (ruang tangga keluar); satu krat sudut
    propModel(buildFuturisticCrateMesh, 32, 22, 16, 9, 14);
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
// Total 40 (2026-07-19, permintaan user — dulu 35).
const S2_ROBOTS = [
    [12, 3, 4],   // 1 OFFICE
    [22, 3, 5],   // 2 ruang atas-tengah (runtuhan)
    [33, 3, 4],   // 3 ruang atas-kanan (arsip)
    [20, 12, 5],  // 4 AULA TENGAH
    [5, 14, 5],   // 5 WAITING
    [34, 12, 4],  // 6 SUPPLY
    [6, 24, 4],   // 7 LAB
    [20, 24, 5],  // 8 CONTROL
    [33, 25, 4],  // 9 dekat tangga akhir (END)
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
    // SUPPLY (c31-38 r7-17; hindari rak c34 r8 & c37 r14)
    put('mag', 32, 10); put('mag', 35, 11); put('mag', 33, 13);
    put('medkit', 34, 16); put('medkit', 36, 12);
    // Bonus tersebar (sel lantai terbuka terverifikasi)
    put('mag', 13, 8);       // aula tengah
    put('medkit', 6, 24);    // lab
    put('mag', 33, 25);      // dekat tangga akhir
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
        enterCityEnv();   // latar kota Jakarta (kubah api global disembunyikan + haze dingin)
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

    // Animasi pintu geser otomatis (buka saat player/robot mendekat)
    updateMode(dt) { updateStageDoors(s2doors, dt); },

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

    // Peluru MATI di dinding (sweep ruas posisi-lalu -> kini); PINTU TERTUTUP
    // juga memblok peluru player & robot (2026-07-19; doorClampShot menjepit
    // posisi peluru ke sisi penembak — boom launcher tak meledak di balik pintu).
    bulletBlocked(b) {
        return (b.mesh.position.y < S2.H
            && s2SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z))
            || doorClampShot(s2doors, b);
    },

    // AoE ledakan (launcher) TIDAK menembus pintu tertutup (2026-07-19):
    // dicek explodeAt per robot — ruas pusat ledakan -> robot.
    blastBlocked(x0, z0, x1, z1, y) { return doorBlocksShot(s2doors, x0, z0, x1, z1, y); },

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
        // Indoor: aktivasi butuh LOS grid (atau sangat dekat / tertembak).
        // doorBlock: robot tak bisa menembus pintu TERTUTUP (2026-07-18).
        return campaignRobotAI(z, dt, step, {
            walkable: stage2Walk, resolve, los: s2LOS, nav: s2Nav,
            doorBlock: (pos, r) => resolveDoors(s2doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, {
            walkable: stage2Walk, resolve, doorBlock: (pos, r) => resolveDoors(s2doors, pos, r)
        });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() { return `FLOOR 2 — Robots: ${countStageRobots(2)} | Find the stairs down`; },

    // Landmark gedung: tangga keluar (hijau menyala; dijepit ke tepi saat jauh)
    radarLandmarks(plot) {
        const e = s2Cell(S2_END.c, S2_END.r);
        plot(e.x - camera.position.x, e.z - camera.position.z, "#2eff6a", 5, true);
    },
};
