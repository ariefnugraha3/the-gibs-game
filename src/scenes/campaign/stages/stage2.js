// SCENE: Campaign STAGE 2 — "Gedung Terbengkalai (Lantai 2)", perkantoran indoor.
// DENAH DIROMBAK TOTAL 2026-07-21 mengikuti PLAN RESMI user (stage2-v3.csv):
// grid 50x50 (sel 2 m), SUDAH TERHUBUNG PENUH dari sumber (2118 sel, BFS-verified
// — tak perlu pintu tambahan lagi). Legenda plan: '#'=dinding, '-'=pintu geser,
// 'T'=TANGGA RUSAK (titik MASUK, kiri-atas), 'L'=LIFT (titik SELESAI, nook
// kiri-tengah), 'X'=GENERATOR power supply (jalur kanan-atas), 'W'=ruang SUPPLY
// (tengah-atas: 4 ammo + 2 medkit), 'R'=toilet (kanan-tengah), '@'=RAK GUDANG
// (bawah; player mengambil 3 komponen generator), '1'/'2'/'3'=area spawn robot
// gelombang-2 (kelas C / B / A).
//
// ALUR GAMEPLAY (state machine `s2Phase`):
//   1. 'clear1'    : spawn di TANGGA RUSAK (pesan: cari lift). Lift butuh daya:
//                    dekati lift → "The elevator has no power — restore the
//                    generator". BUNUH 50 robot KELAS C → generator bisa dipulihkan.
//   2. 'goGen'     : datangi GENERATOR (X, kanan-atas) → "collect 3 components
//                    from the warehouse" + 20 robot penjaga (berbagai kelas) spawn
//                    di gudang.
//   3. 'collect'   : ambil 3 komponen (acak di rak @; berdiri di TIMUR rak).
//   4. 'restore'   : kembali ke generator, INJAK kotak bermarker.
//   5. 'restoring' : PULIHKAN 10 dtk (bar progress; gerak DIBEKUKAN). Selesai →
//                    langsung 'done' + 25 robot bala bantuan (10 C ruang1, 10 B
//                    ruang2, 5 A ruang3) spawn.
//   6. 'done'      : lift SUDAH BERDAYA — player TIDAK wajib membunuh bala bantuan
//                    (2026-07-21, permintaan user): tinggal capai LIFT → stage
//                    selesai (transisi ke stage 3). Boleh lari melewati robot.

import { CFG, CAMP_M } from '../../../core/config.js';
import { player, robots, drops, _v3, keys, setCinematicActive } from '../../../core/state.js';
import { scene, camera } from '../../../core/renderer.js';
import { makeTexture, speckle } from '../../../utils/textures.js';
import { rand } from '../../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { applyLightPreset } from '../../../world/lighting.js';
import { PAL } from '../../../world/palette.js';
import { showStageMsg, hideStageMsg, showPickup, showDownloadBar, setDownloadProgress, hideDownloadBar } from '../../../core/dom.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { updateUI } from '../../../core/hud.js';
import { NADE_R } from '../../../entities/grenades.js';
import { disposeRobot } from '../../../entities/robots.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { buildMedkitMesh, buildMagMesh } from '../../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../../entities/futuristicCupboard.js';
import { buildFuturisticCrateMesh } from '../../../entities/futuristicCrate.js';
import { buildFuturisticSofaMesh } from '../../../entities/futuristicSofa.js';
import { buildFuturisticRubbleMesh } from '../../../entities/futuristicRubble.js';
import { buildFuturisticConsoleMesh } from '../../../entities/futuristicConsole.js';
import { buildFuturisticBenchMesh } from '../../../entities/futuristicBench.js';
import { buildFuturisticMeetingTableMesh } from '../../../entities/futuristicMeetingTable.js';
import { buildFuturisticStallMesh } from '../../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../../entities/futuristicSink.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, updateRoomLamps, resetRoomLamps } from '../utility/common.js';
import { buildInteriorWallMat, buildInteriorFloorMat } from '../utility/interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors, doorBlocksShot, doorClampShot } from '../utility/doors.js';
import { buildStairwellUp, stairwellUpFootprint } from '../utility/stairwell.js';
import { buildCampaignCityscape, enterCityEnv } from '../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
import { stage1Scene } from './stage1.js';
import { stage3Scene } from './stage3.js';

// Grid 50x50 (sel 2 m). Gedung ~60 km dari origin — hidup berdampingan dgn stage
// lain, dipisah jarak (camera.far + culling).
export const S2 = {
    G: 50, ROWS: 50, CELL: 2 * CAMP_M, H: 22,   // tinggi plafon ~3.1 m
    x0: 60000 - 25 * 2 * CAMP_M,                 // pojok barat-laut grid
    z0: -25 * 2 * CAMP_M
};
export let s2grid = null;                        // [row][col] 1=dinding, 0=lantai
export const s2Cell = (c, r) => ({ x: S2.x0 + (c + 0.5) * S2.CELL, z: S2.z0 + (r + 0.5) * S2.CELL });
export const S2_START = { c: 5, r: 2 };          // spawn di ruang TANGGA RUSAK (kiri-atas), timur blocker tangga
// LIFT (titik SELESAI): nook kiri-tengah (sel L c9-10 r15-19 + lorong c11).
export const S2_LIFT = { c0: 9, r0: 15, c1: 11, r1: 19 };
export const S2_GEN = { c: 44, r: 3 };           // sel BERDIRI generator (kotak pulih) — mesin 2 sel di utara (44,1)
// Gudang (@) = bawah; penjaga & komponen di sini. Rak = kolom @ (12 kolom, tiap 4 sel).
const S2_SHELF_COLS = [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45];
const S2_SHELF_R0 = 33, S2_SHELF_R1 = 44;        // baris rak gudang

// DENAH RESMI (stage2-v3.csv, 50x50). '#'=dinding, '.'=lantai (pintu = lantai +
// pintu geser S2_DOORS). JANGAN ubah tanpa update S2_DOORS/robot + tes ulang.
const S2_MAP = [
    '##################################################',   // 0
    '#.......#........#.....................#.........#',   // 1
    '#.......#........#.....................#.........#',   // 2
    '#.......#........#.........#...........#.........#',   // 3
    '#.......#..................#...........#.........#',   // 4
    '#.......#..................#...........#.........#',   // 5
    '#.......#........#######################.........#',   // 6
    '#.............................#........#.........#',   // 7
    '#.............................#........#.........#',   // 8
    '######..#.....................#........#.........#',   // 9
    '#.......#.....................#........#.........#',   // 10
    '#.......#..............................#.........#',   // 11
    '#.......#..............................#.........#',   // 12
    '#.......#.....................#........#.........#',   // 13
    '#.......#.....................#........#.........#',   // 14
    '#.......#....#................#........#.........#',   // 15
    '#.......#....#................#........#.........#',   // 16
    '#.......#....#................#........#.........#',   // 17
    '#.......#....###########################.........#',   // 18
    '#.......#....#.........................#.........#',   // 19
    '#..###########.........................#.........#',   // 20
    '#............#.............#...........#.........#',   // 21
    '#............#.............#...........#.........#',   // 22
    '#..........................#...........#.........#',   // 23
    '#..........................#...........#.........#',   // 24
    '#............#.............#...........#.........#',   // 25
    '#............#.............#...........#.........#',   // 26
    '#............#.............#.....................#',   // 27
    '#............#.............#.....................#',   // 28
    '############################################..####',   // 29
    '#................................................#',   // 30
    '#................................................#',   // 31
    '#................................................#',   // 32
    '#................................................#',   // 33
    '#................................................#',   // 34
    '#................................................#',   // 35
    '#................................................#',   // 36
    '#................................................#',   // 37
    '#................................................#',   // 38
    '#................................................#',   // 39
    '#................................................#',   // 40
    '#................................................#',   // 41
    '#................................................#',   // 42
    '#................................................#',   // 43
    '#................................................#',   // 44
    '#................................................#',   // 45
    '#................................................#',   // 46
    '#................................................#',   // 47
    '#................................................#',   // 48
    '##################################################',   // 49
];

// PINTU geser (8, persis dari plan '-'). dir 'ew'=celah dinding VERTIKAL /
// 'ns'=celah dinding HORIZONTAL. Semua jamb sudah diverifikasi dinding.
const S2_DOORS = [
    { c0: 17, r0: 4, c1: 17, r1: 5, dir: 'ew' },     // upper-center <-> cols9-16 area
    { c0: 6, r0: 9, c1: 7, r1: 9, dir: 'ns' },       // T-area <-> center hall
    { c0: 30, r0: 11, c1: 30, r1: 12, dir: 'ew' },   // center hall <-> R-toilet/center-right
    { c0: 27, r0: 19, c1: 27, r1: 20, dir: 'ew' },   // corridor split (center-lower <-> lower-center-right)
    { c0: 1, r0: 20, c1: 2, r1: 20, dir: 'ns' },     // left corridor <-> lower-left
    { c0: 13, r0: 23, c1: 13, r1: 24, dir: 'ew' },   // lower-left <-> center-lower
    { c0: 39, r0: 27, c1: 39, r1: 28, dir: 'ew' },   // lower-center-right <-> GENERATOR room
    { c0: 44, r0: 29, c1: 45, r1: 29, dir: 'ns' },   // lower region <-> WAREHOUSE (bawah)
];
let s2doors = null;

// Lampu PER-RUANGAN + papan status.
let s2Lamps = [];
export const s2LampsDbg = () => s2Lamps;
let s2HallLamp = null;
let s2HintT = 0, s2LiftT = 0;

// ===== STATE MACHINE ALUR STAGE 2 =====
let s2Phase = 'clear1';   // clear1 | goGen | collect | restore | restoring | done
let s2RestT = 0;          // timer pulih generator
let s2GenPos = null;      // {x,z} dunia kotak berdiri generator
let s2LiftPos = null;     // {x,z} dunia pusat lift (peringatan)
let s2Marker = null, s2MarkerMat = null;   // marker kotak pulih generator
let s2Components = [];    // [{col,row,mx,mz,got,marker,mat}] — 3 komponen acak di rak
let s2CompGot = 0;
export const s2Debug = () => ({ phase: s2Phase, restT: s2RestT, comp: s2CompGot });
export const s2ComponentsDbg = () => s2Components;   // smoke test (posisi komponen)

const blockers = [];

function buildS2Grid() {
    s2grid = S2_MAP.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
}

export function s2Wall(c, r) {
    return c < 0 || r < 0 || c >= S2.G || r >= S2.ROWS || s2grid[r][c] === 1;
}

export function stage2Walk(x, z, r) {
    if (!s2grid) return false;
    const c0 = Math.floor((x - r - S2.x0) / S2.CELL), c1 = Math.floor((x + r - S2.x0) / S2.CELL);
    const r0 = Math.floor((z - r - S2.z0) / S2.CELL), r1 = Math.floor((z + r - S2.z0) / S2.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s2Wall(cc, rr)) return false;
    return true;
}

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

export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

export let s2Nav = null;

// MARKER "berdiri di sini" (amber menyala) — kotak pulih generator + 3 komponen.
function buildStandMarker(color = 0xffb03b) {
    const g = new THREE.Group();
    const fillMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fillMat);
    fill.rotation.x = -Math.PI / 2; fill.position.y = 0.14;
    g.add(fill);
    const barMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const [sx, sz, px, pz] of [[12, 1, 0, -6], [12, 1, 0, 6], [1, 12, -6, 0], [1, 12, 6, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), barMat);
        bar.position.set(px, 0.22, pz);
        g.add(bar);
    }
    return { group: g, fillMat };
}

// GENERATOR — instalasi POWER SUPPLY BESAR yang MEMENUHI sisi UTARA ruang
// kanan-atas (strip 'X' plan, c40-48): bank housing lebar (~116 u) + 3 unit
// turbin dengan INTI TEAL menyala menyembul di atas + pipa/konduit baja + kabinet
// kontrol + konsol aktivasi tengah + lampu bahaya. Origin group = kotak (44,1);
// -z = tembok utara, +z = ruangan (player). GIBS-2045: gunmetal/steel/panel/ink
// + aksen teal (PAL.tech) & amber/hazard secukupnya. Semua Lambert/Basic (warm,
// tanpa recompile); puncak tertinggi ~20 u (< plafon 22).
function buildGenerator() {
    const g = new THREE.Group();
    const WIDE = 116, HT = 15, DEPTH = 18, BACKZ = -6;
    const zc = BACKZ + DEPTH / 2;              // pusat z badan utama (~3)
    const frontZ = zc + (DEPTH - 4) / 2;       // muka SELATAN badan (~10)
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const panel = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const teal = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const amber = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const box = (mat, sx, sy, sz, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    const cyl = (mat, r, h, x, y, z, axis = 'y') => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat);
        m.position.set(x, y, z);
        if (axis === 'x') m.rotation.z = Math.PI / 2;         // rebah sepanjang sumbu-x
        else if (axis === 'z') m.rotation.x = Math.PI / 2;    // rebah sepanjang sumbu-z
        m.castShadow = true; g.add(m); return m;
    };

    // Fondasi + badan housing LEBAR + panel atap
    box(ink, WIDE, 2.6, DEPTH, 0, 1.3, zc);
    box(gun, WIDE, HT, DEPTH - 4, 0, 2.6 + HT / 2, zc);
    box(panel, WIDE + 2, 1.6, DEPTH - 1, 0, 2.6 + HT + 0.8, zc);
    // Rusuk vertikal di muka selatan (kesan padat & besar)
    for (let x = -WIDE / 2 + 10; x <= WIDE / 2 - 10; x += 18)
        box(ink, 1.8, HT - 4, 0.8, x, 2.6 + HT / 2, frontZ + 0.3);

    // 3 UNIT TURBIN (silinder) + INTI TEAL menyala menyembul di atas (tampak dari
    // kamera SW top-down) + cincin baja + strip teal di muka.
    for (const ux of [-40, 0, 40]) {
        cyl(steel, 9.5, HT + 1.5, ux, 2.6 + (HT + 1.5) / 2, zc - 0.5);      // rumah turbin
        cyl(gun, 10.4, 1.8, ux, 2.6 + HT + 1.5, zc - 0.5);                 // flens atas
        cyl(steel, 10.2, 1.3, ux, 2.6 + HT * 0.4, zc - 0.5);               // cincin tengah
        cyl(teal, 3.6, 5, ux, 2.6 + HT, zc - 0.5);                         // inti menyala (puncak ~20)
        box(teal, 2, HT - 5, 0.8, ux, 2.6 + HT / 2, frontZ - 0.2);         // strip teal muka
    }
    // Kabinet kontrol antar-unit (muka selatan) + layar teal + lampu bahaya
    for (const cx of [-20, 20]) {
        box(panel, 14, HT - 3, 3, cx, 2.6 + (HT - 3) / 2, frontZ - 1.5);
        box(teal, 9, 4, 0.8, cx, 2.6 + HT - 4.5, frontZ - 0.1);
        box(hazard, 3.2, 1.2, 0.8, cx, 4.6, frontZ - 0.1);
    }

    // Pipa baja horizontal (menyambung unit) di atas + di muka, + konduit tebal
    // ke tembok utara.
    cyl(steel, 1.6, WIDE - 8, 0, 2.6 + HT + 0.2, zc + 1, 'x');
    cyl(steel, 1.5, WIDE - 14, 0, 2.6 + HT * 0.5, frontZ + 0.1, 'x');
    for (const ux of [-30, 30]) cyl(steel, 2.2, DEPTH, ux, 2.6 + HT - 2, zc - DEPTH / 2, 'z');

    // KONSOL AKTIVASI tengah (menghadap player di selatan) + layar teal + strip
    // amber, lalu strip hazard memanjang di dasar muka (marka area mesin).
    box(gun, 18, 7.5, 4.5, 0, 2.6 + 3.75, frontZ + 2);
    box(teal, 12, 4, 0.7, 0, 8.5, frontZ + 4.2);
    box(amber, 13, 0.9, 0.7, 0, 5.4, frontZ + 4.2);
    box(hazard, WIDE - 8, 1, 0.9, 0, 1.4, frontZ + 3);
    return g;
}

// LIFT (titik SELESAI): dinding belakang SELATAN + dua daun BERGESER TERBUKA di
// muka UTARA (-z, mengundang player masuk dari aula) + langit interior teal
// menyala. Sel L tetap walkable (player masuk = trigger selesai). Nook menghadap
// UTARA.
function buildLiftCar() {
    const g = new THREE.Group();
    const H = S2.H, W = 26, D = 40;   // W = lebar (x, ~2 sel L), D = kedalaman (z)
    const frameMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const tealMat = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    // dinding belakang (SELATAN, +z) + langit interior menyala
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 1.4), frameMat);
    back.position.set(0, H / 2, D / 2); g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.8, D), tealMat);
    roof.position.set(0, H - 1, 0); g.add(roof);
    // dua daun pintu TERGESER ke sisi (terbuka) di muka UTARA (-z)
    for (const s of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(6, H * 0.85, 1.2), frameMat);
        leaf.position.set(s * (W / 2 - 3), H * 0.43, -D / 2);
        g.add(leaf);
    }
    // strip indikator teal di ambang atas (muka utara)
    const ind = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 1.3, 1), tealMat);
    ind.position.set(0, H * 0.9, -D / 2 + 0.5);
    g.add(ind);
    return g;
}

export function buildWorld() {
    buildS2Grid();
    const sizeX = S2.G * S2.CELL, sizeZ = S2.ROWS * S2.CELL;   // 700 x 700 unit
    const cx = S2.x0 + sizeX / 2, cz = S2.z0 + sizeZ / 2;

    // --- Lantai: satu bidang panel fasilitas TERANG (interior.js). LIFT = titik
    // selesai (bukan tangga turun berlubang), jadi lantai penuh tanpa lubang. ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        buildInteriorFloorMat(S2.G, S2.ROWS));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    buildCampaignCityscape(cx, cz, sizeX / 2, sizeZ / 2);

    // --- Plafon (disembunyikan; top-down) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#282520'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#221f1a', '#2f2b25', '#1b1915'], 120, 1, 4);
    }, S2.G, S2.ROWS);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S2.H, cz);
    ceil.visible = false;
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
        buildInteriorWallMat(), wallCells.length);
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

    // --- Pintu geser ---
    s2doors = buildStageDoors(S2_DOORS, s2Cell, S2.CELL, S2.H);

    // --- Furnitur KANTOR ---
    const putModel = (mesh, x, z, sx, sy, sz, standable = true) => {
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        mesh.position.set(x, 0, z);
        scene.add(mesh);
    };
    const deskModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s2Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, true);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.5 + 2);
        chair.rotation.y = Math.PI;
        scene.add(chair);
    };
    const meetingModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s2Cell(c, r);
        putModel(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, true);
    };
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s2Cell(c, r), x = p.x + dx, z = p.z + dz;
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
        const n = Math.max(1, Math.min(6, Math.round(longLen / shortLen)));
        const unit = longLen / n;
        for (let i = 0; i < n; i++) {
            const off = -longLen / 2 + unit * (i + 0.5);
            const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
            cab.position.set(along ? x + off : x, 0, along ? z : z + off);
            scene.add(cab);
        }
    };
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s2Cell(c, r);
        putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };

    // Center hall (c9-29 r7-19): office + meja rapat + krat
    deskModel(24, 8, 20, 7, 10);
    meetingModel(16, 10, 30, 7, 16);
    propModel(buildFuturisticCrateMesh, 26, 15, 14, 9, 14);
    // Upper-center (c18-26 r1-5): meja rapat
    meetingModel(21, 3, 26, 7, 14);
    // W supply (c28-38 r1-5): rak + meja (supply diletakkan placeSupplies)
    cupboardModel(29, 3, 8, 15, 12);
    deskModel(36, 3, 16, 7, 10);
    // R toilet (c31-38 r7-17): bilik + wastafel
    propModel(buildFuturisticStallMesh, 33, 9, 2, 15, 10);
    propModel(buildFuturisticStallMesh, 33, 13, 2, 15, 10);
    propModel(buildFuturisticSinkMesh, 37, 16, 10, 8, 4);
    // Center-right kolom (dekat R): puing
    propModel(buildFuturisticRubbleMesh, 33, 8, 10, 9, 10);
    // Lower-left (room2, c1-12 r21-28): sofa
    propModel(buildFuturisticSofaMesh, 6, 22, 18, 6, 16);
    // Center-lower (room1, c14-26 r21-28): meja
    deskModel(22, 21, 18, 7, 10);
    // Lower-center-right (c28-38 r21-28): konsol + kabinet
    propModel(buildFuturisticConsoleMesh, 32, 22, 22, 7, 12);
    cupboardModel(35, 27, 8, 15, 10);
    // Left corridor (c1-7): kabinet
    cupboardModel(6, 16, 6, 15, 10);

    // GENERATOR room (c40-48 r1-28): mesin generator (atas) + meja + bangku + konsol
    const genP = s2Cell(S2_GEN.c, S2_GEN.r);
    s2GenPos = { x: genP.x, z: genP.z };
    const genMachine = buildGenerator();
    const gm = s2Cell(S2_GEN.c, S2_GEN.r - 2);   // origin mesin 2 sel di UTARA kotak berdiri
    genMachine.position.set(gm.x, 0, gm.z);
    scene.add(genMachine);
    // Blocker LEBAR menutup instalasi (c40-48, sisi utara) — cocok dgn bentuk baru;
    // sisi selatan berhenti ~1 sel di UTARA kotak berdiri (44,3) supaya marker tetap
    // bisa dipijak. hx 56 tetap di dalam ruang (tembok c39/c49).
    blockers.push({
        x: gm.x, z: gm.z + 4, hx: 56, hz: 12, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(56, 12), top: 19, standable: false
    });
    // MARKER kotak pulih (amber) di kotak berdiri generator (tampil fase restore)
    const mk = buildStandMarker(0xffb03b);
    s2Marker = mk.group; s2MarkerMat = mk.fillMat;
    s2Marker.position.set(genP.x, 0, genP.z);
    s2Marker.visible = false;
    scene.add(s2Marker);
    deskModel(44, 13, 18, 7, 10);
    propModel(buildFuturisticBenchMesh, 44, 22, 20, 6, 10);

    // === GUDANG (@) — 12 rak (kolom @) sebagai rak logam tinggi (blocker) ===
    for (const col of S2_SHELF_COLS) {
        const midR = (S2_SHELF_R0 + S2_SHELF_R1) / 2;
        const sz = (S2_SHELF_R1 - S2_SHELF_R0 + 1) * S2.CELL - 4;   // tinggi rak (z), sepanjang baris rak
        cupboardModel(col, midR, 8, 15, sz, 0, 0, false);
    }

    // --- Tangga RUSAK (entry): flight naik dari Lt.3 + PUING (jebol, tak bisa
    // dipakai keluar → player harus ke lift). Blocker solid spt biasa. ---
    const upF = stairwellUpFootprint(S2.x0 + S2.CELL, S2.z0 + S2.CELL);
    buildStairwellUp(S2.x0 + S2.CELL, S2.z0 + S2.CELL, S2.H);
    blockers.push({
        x: upF.x, z: upF.z, hx: upF.hx, hz: upF.hz,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(upF.hx, upF.hz), top: 10, standable: true
    });
    propModel(buildFuturisticRubbleMesh, 4, 4, 12, 9, 12);   // puing di kaki tangga (rusak)

    // === LIFT (titik selesai) di nook cols9-10 rows15-19 (menghadap utara) ===
    const la = s2Cell(9, 15), lb = s2Cell(10, 19);
    const liftC = { x: (la.x + lb.x) / 2, z: (la.z + lb.z) / 2 };
    s2LiftPos = { x: liftC.x, z: liftC.z };
    const lift = buildLiftCar();
    lift.position.set(liftC.x, 0, liftC.z);
    scene.add(lift);

    // --- Pencahayaan PER-RUANGAN (mati → nyala saat pintu dibuka / rect dimasuki) ---
    s2Lamps = [];
    const addLamp = (c, r, color, inten, dist, c0, r0, c1, r1) => {
        const p = s2Cell(c, r);
        const L = new THREE.PointLight(color, 0, dist, 2);
        L.position.set(p.x, S2.H - 3, p.z);
        scene.add(L);
        const lm = {
            L, base: inten, on: false, k: 0,
            x0: S2.x0 + c0 * S2.CELL, x1: S2.x0 + (c1 + 1) * S2.CELL,
            z0: S2.z0 + r0 * S2.CELL, z1: S2.z0 + (r1 + 1) * S2.CELL
        };
        if (!s2Lamps.some(o => o.shroud && o.x0 === lm.x0 && o.z0 === lm.z0 && o.x1 === lm.x1 && o.z1 === lm.z1)) {
            const sh = new THREE.Mesh(
                new THREE.BoxGeometry(lm.x1 - lm.x0 - 1, S2.H - 0.6, lm.z1 - lm.z0 - 1),
                new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 1 }));
            sh.position.set((lm.x0 + lm.x1) / 2, (S2.H - 0.6) / 2 + 0.2, (lm.z0 + lm.z1) / 2);
            scene.add(sh);
            lm.shroud = sh;
        }
        s2Lamps.push(lm);
        return lm;
    };
    addLamp(4, 4, 0xffd9a0, 0.9, 260, 1, 1, 7, 8);           // 0 T-area (start, pra-nyala)
    addLamp(4, 14, 0xffc890, 0.85, 320, 1, 10, 7, 19);       // 1 left corridor
    s2HallLamp = addLamp(19, 12, 0xffe2b8, 0.9, 500, 8, 7, 30, 20);   // 2 center hall (FLICKER, + nook lift)
    addLamp(22, 3, 0xffd9a0, 0.85, 300, 18, 1, 26, 5);       // 3 upper-center
    addLamp(33, 3, 0xbfe4ff, 0.9, 320, 28, 1, 38, 5);        // 4 W supply (dingin)
    addLamp(35, 12, 0xffe2b8, 0.85, 340, 31, 7, 38, 17);     // 5 R toilet
    addLamp(44, 9, 0xbfe4ff, 0.9, 560, 40, 1, 48, 28);       // 6 generator room (dingin, besar)
    addLamp(6, 24, 0xffc890, 0.85, 320, 1, 21, 12, 28);      // 7 lower-left (room2)
    addLamp(19, 24, 0xffe2b8, 0.85, 360, 14, 21, 26, 28);    // 8 center-lower (room1)
    addLamp(32, 24, 0xbfe4ff, 0.85, 360, 27, 21, 38, 28);    // 9 lower-center-right
    addLamp(14, 39, 0xffc07a, 0.9, 640, 1, 30, 24, 48);      // 10 warehouse W (gudang)
    addLamp(37, 39, 0xffc07a, 0.9, 640, 25, 30, 48, 48);     // 11 warehouse E
    for (const lm of s2Lamps) lm.doors = s2doors.filter(d =>
        d.cx >= lm.x0 - 1.5 * S2.CELL && d.cx <= lm.x1 + 1.5 * S2.CELL &&
        d.cz >= lm.z0 - 1.5 * S2.CELL && d.cz <= lm.z1 + 1.5 * S2.CELL);

    // Bake nav-grid TERAKHIR
    const half = S2.CELL / 2;
    s2Nav = makeNavGrid(S2.x0, S2.z0, half, S2.G * 2, S2.ROWS * 2, (x, z) => {
        if (!stage2Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });
}

// ===== ROBOT GELOMBANG 1: 50 KELAS C tersebar di gedung kantor (bukan gudang) =====
const S2_ROBOTS = [
    [4, 12, 3], [12, 3, 3], [22, 3, 4], [33, 3, 3], [44, 6, 4], [44, 14, 3],
    [44, 24, 3], [20, 11, 5], [24, 15, 4], [35, 11, 3], [35, 15, 3],
    [20, 23, 5], [31, 23, 4], [6, 24, 3],
];
export const s2Wave1Count = S2_ROBOTS.reduce((a, s) => a + s[2], 0);   // 50
export function placeRobots() {
    for (const [c, r, n] of S2_ROBOTS) {
        const p = s2Cell(c, r);
        for (let k = 0; k < n; k++) {
            _v3.set(p.x + rand(-7, 7), 0, p.z + rand(-7, 7));
            resolve(_v3, 4, 0);
            if (!stage2Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            spawnCampaignRobot(_v3.x, _v3.z, 2);
        }
    }
    placeSupplies();
}

// ===== PENJAGA GUDANG: 20 (12 C / 5 B / 3 A) — spawn saat generator didekati =====
// Semua di gudang (rows 30-48); di lorong antar-rak / pita terbuka atas & bawah.
const S2_GUARDS = [
    ['C', 3, 31], ['C', 11, 31], ['C', 19, 31], ['C', 27, 31], ['C', 35, 31], ['C', 43, 31],
    ['C', 7, 47], ['C', 19, 47], ['C', 31, 47], ['C', 43, 47], ['C', 15, 39], ['C', 35, 39],
    ['B', 3, 39], ['B', 23, 39], ['B', 47, 39], ['B', 11, 46], ['B', 39, 46],
    ['A', 27, 39], ['A', 3, 46], ['A', 47, 31],
];
function spawnGuards() {
    for (const [cls, c, r] of S2_GUARDS) {
        const p = s2Cell(c, r);
        _v3.set(p.x + rand(-5, 5), 0, p.z + rand(-5, 5));
        resolve(_v3, 4, 0);
        if (!stage2Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
        spawnCampaignRobot(_v3.x, _v3.z, 2, cls);
    }
}

// ===== ROBOT GELOMBANG 2: 25 (10 C ruang1 / 10 B ruang2 / 5 A ruang3) =====
// ruang1 = center-lower (c14-26 r21-27), ruang2 = lower-left (c1-11 r21-28),
// ruang3 = mid-left corridor (c3-5 r12-17) — persis marka plan 1/2/3.
const S2_WAVE2 = [
    ['C', 18, 23], ['C', 18, 23], ['C', 22, 24], ['C', 22, 24], ['C', 16, 26],
    ['C', 16, 26], ['C', 24, 22], ['C', 24, 22], ['C', 20, 26], ['C', 20, 26],   // 10 C (ruang 1)
    ['B', 5, 24], ['B', 5, 24], ['B', 8, 25], ['B', 8, 25], ['B', 4, 25],
    ['B', 4, 25], ['B', 9, 24], ['B', 9, 24], ['B', 6, 26], ['B', 6, 26],         // 10 B (ruang 2)
    ['A', 4, 13], ['A', 4, 15], ['A', 4, 17], ['A', 4, 12], ['A', 4, 16],         // 5 A (ruang 3)
];
export function spawnWave2() {
    for (const [cls, c, r] of S2_WAVE2) {
        const p = s2Cell(c, r);
        _v3.set(p.x + rand(-6, 6), 0, p.z + rand(-6, 6));
        resolve(_v3, 4, 0);
        if (!stage2Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
        spawnCampaignRobot(_v3.x, _v3.z, 2, cls);
    }
}

// SUPPLY (ruang W plan, c28-38 r1-5): 4 ammo + 2 medkit.
function placeSupplies() {
    const put = (type, c, r, dx = 0, dz = 0) => {
        const p = s2Cell(c, r);
        const mesh = type === 'mag' ? buildMagMesh() : buildMedkitMesh();
        mesh.position.set(p.x + dx, 1, p.z + dz);
        scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    put('mag', 29, 2); put('mag', 33, 2); put('mag', 37, 2); put('mag', 31, 4);
    put('medkit', 34, 4); put('medkit', 30, 4);
}

// Pilih 3 rak memegang komponen. Tiap komponen di UJUNG PALING DALAM rak (baris
// TERBAWAH `S2_SHELF_R1` — paling jauh dari pintu masuk gudang di KANAN-ATAS),
// di sel TIMUR rak (tempat berdiri). 1 rak ACAK per ZONA kiri/tengah/kanan supaya
// komponen tersebar selebar gudang → player HARUS menyusuri seluruh gudang &
// berhadapan dengan semua robot penjaga dulu (2026-07-21, permintaan user).
function pickComponents() {
    // buang marker lama
    for (const c of s2Components) if (c.marker) scene.remove(c.marker);
    s2Components = []; s2CompGot = 0;
    const zones = [
        S2_SHELF_COLS.slice(0, 4),    // kiri  (c1,5,9,13) — terjauh dari pintu
        S2_SHELF_COLS.slice(4, 8),    // tengah (c17,21,25,29)
        S2_SHELF_COLS.slice(8, 12),   // kanan (c33,37,41,45) — sisi pintu masuk
    ];
    for (const zone of zones) {
        const col = zone[Math.floor(rand(0, zone.length))];
        const row = S2_SHELF_R1;   // ujung paling DALAM rak (baris terbawah)
        const mp = s2Cell(col + 1, row);   // sel TIMUR rak (tempat player berdiri)
        const mk = buildStandMarker(0x39d0ff);   // marker komponen (teal terang)
        mk.group.position.set(mp.x, 0, mp.z);
        scene.add(mk.group);
        s2Components.push({ col, row, mx: mp.x, mz: mp.z, got: false, marker: mk.group, mat: mk.fillMat });
    }
}

export const stage2Scene = {
    id: 'campaign-2',

    enter() {
        saveCampaignStage(2);
        // Buang robot stage 1 yang tersisa (silent)
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 1) { disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1); }
        }
        placeRobots();            // GELOMBANG 1 (50 kelas C) + supply
        applyLightPreset(scene, 'indoor');
        enterCityEnv();
        // Reset ALUR
        s2Phase = 'clear1'; s2RestT = 0;
        setCinematicActive(false);
        hideDownloadBar();
        // marker generator + komponen bersih
        if (s2Marker) s2Marker.visible = false;
        for (const c of s2Components) if (c.marker) scene.remove(c.marker);
        s2Components = []; s2CompGot = 0;
        // Lampu ruangan MATI; start room pra-nyala; kedip hall reset
        resetRoomLamps(s2Lamps);
        if (s2HallLamp) s2HallLamp.flicker = false;
        if (s2Lamps[0]) {
            const st = s2Lamps[0];
            st.on = true; st.k = 1; st.L.intensity = st.base;
            if (st.shroud) { st.shroud.visible = false; st.shroud.material.opacity = 0; }
        }
        s2HintT = Date.now(); s2LiftT = 0;
        const sp = s2Cell(S2_START.c, S2_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);
        player.vy = 0; player.onGround = true;
        showStageMsg('The stairs are wrecked — find the elevator to escape (destroy the robots to power it).', 5200);
        updateUI();
    },

    // Mati di stage 2 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    updateMode(dt) {
        updateStageDoors(s2doors, dt);
        updateRoomLamps(s2Lamps, dt);
        const s2 = CFG.campaign.stage2;
        const px = camera.position.x, pz = camera.position.z;
        const n = countStageRobots(2);

        if (s2Phase === 'clear1') {
            if (n === 0) {
                s2Phase = 'goGen';
                showStageMsg('All robots destroyed — the generator can be restored. Head to it (far-right room).', 4600);
            }
        } else if (s2Phase === 'goGen') {
            // Dekati generator → butuh 3 komponen + spawn penjaga gudang + pilih komponen
            if (s2GenPos && Math.hypot(px - s2GenPos.x, pz - s2GenPos.z) < s2.genApproachRange) {
                s2Phase = 'collect';
                spawnGuards();
                pickComponents();
                showStageMsg('The generator needs 3 components — find them in the storage warehouse (south).', 5200);
            }
        } else if (s2Phase === 'collect') {
            // Ambil komponen: berdiri di TIMUR rak bermarker
            for (const cmp of s2Components) {
                if (cmp.got) continue;
                if (Math.hypot(px - cmp.mx, pz - cmp.mz) < s2.componentRange) {
                    cmp.got = true; s2CompGot++;
                    if (cmp.marker) cmp.marker.visible = false;
                    showPickup(`Generator component ${s2CompGot}/3 recovered`, '#39d0ff');
                }
            }
            if (s2CompGot >= 3) {
                s2Phase = 'restore';
                if (s2Marker) s2Marker.visible = true;
                showStageMsg('All 3 components recovered — return to the generator and restore it.', 5000);
            }
        } else if (s2Phase === 'restore') {
            // Injak kotak bermarker → mulai pulih (bekukan gerak)
            if (s2GenPos && Math.hypot(px - s2GenPos.x, pz - s2GenPos.z) < s2.genRestoreRange) {
                s2Phase = 'restoring'; s2RestT = 0;
                clearMoveTarget();
                keys.w = keys.a = keys.s = keys.d = false;
                setCinematicActive(true);
                showDownloadBar('RESTORING GENERATOR…');
                if (s2Marker) s2Marker.visible = false;
                showStageMsg('Restoring generator — hold position.', 2400);
            }
        } else if (s2Phase === 'restoring') {
            s2RestT += dt;
            const k = Math.min(1, s2RestT / s2.restoreSec);
            setDownloadProgress(k);
            if (k >= 1) {
                // Selesai: lift BERDAYA. Bala bantuan datang tapi player TIDAK wajib
                // membunuh semua (2026-07-21, permintaan user) — langsung 'done'.
                s2Phase = 'done';
                setCinematicActive(false);
                hideDownloadBar();
                spawnWave2();
                showStageMsg('Generator online — the elevator is powered! Reinforcements inbound — reach the lift and escape!', 5600);
            }
        }

        // Denyut marker generator (fase restore)
        if (s2MarkerMat && s2Marker && s2Marker.visible)
            s2MarkerMat.opacity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(Date.now() * 0.004));
        // Denyut marker komponen (fase collect)
        for (const cmp of s2Components) if (cmp.marker && cmp.marker.visible)
            cmp.mat.opacity = 0.24 + 0.18 * (0.5 + 0.5 * Math.sin(Date.now() * 0.005 + cmp.col));

        // LIFT: peringatan "belum berdaya" (sebelum generator dipulihkan)
        if (s2LiftPos && Math.hypot(px - s2LiftPos.x, pz - s2LiftPos.z) < s2.liftRange
            && s2Phase !== 'done' && Date.now() - s2LiftT > 4200) {
            s2LiftT = Date.now();
            showStageMsg('The elevator has no power — restore the generator first.', 2600);
        }

        // Kedip lampu hall SETELAH menyala
        if (s2HallLamp && s2HallLamp.on && s2HallLamp.k >= 1 && !s2HallLamp.flicker)
            s2HallLamp.flicker = true;
    },

    // Dinding + furnitur + trigger LIFT (fase 'done' → transisi stage 3).
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage2Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage2Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S2.x0 + S2_LIFT.c0 * S2.CELL
            && pos.x <= S2.x0 + (S2_LIFT.c1 + 1) * S2.CELL
            && pos.z >= S2.z0 + S2_LIFT.r0 * S2.CELL
            && pos.z <= S2.z0 + (S2_LIFT.r1 + 1) * S2.CELL
            && s2Phase === 'done') {
            beginStageTransition(stage3Scene);
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    bulletBlocked(b) {
        return (b.mesh.position.y < S2.H
            && s2SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z))
            || doorClampShot(s2doors, b);
    },

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
        return campaignRobotAI(z, dt, step, {
            walkable: stage2Walk, resolve, nav: s2Nav,
            los: (x1, z1, x2, z2) => s2LOS(x1, z1, x2, z2)
                && !doorBlocksShot(s2doors, x1, z1, x2, z2, 8),
            doorBlock: (pos, r) => resolveDoors(s2doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, {
            walkable: stage2Walk, resolve, doorBlock: (pos, r) => resolveDoors(s2doors, pos, r)
        });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        const n = countStageRobots(2);
        switch (s2Phase) {
            case 'clear1': return `FLOOR 2 — Robots: ${n} | Destroy ALL robots to power the generator`;
            case 'goGen': return 'FLOOR 2 — Reach the generator (far-right room, top) to begin repairs';
            case 'collect': return `FLOOR 2 — Recover generator components: ${s2CompGot}/3 (warehouse, south)`;
            case 'restore': return 'FLOOR 2 — Return to the generator and step on the marker to restore it';
            case 'restoring': return `FLOOR 2 — Restoring generator... ${Math.round(Math.min(1, s2RestT / CFG.campaign.stage2.restoreSec) * 100)}%`;
            default: return 'FLOOR 2 — Generator restored! Board the elevator to escape';
        }
    },

    // Landmark radar: objektif saat ini (generator saat clear1/goGen/restore/
    // restoring; komponen saat collect; lift saat done).
    radarLandmarks(plot) {
        let tx, tz, col;
        if (s2Phase === 'collect') {
            // arahkan ke komponen terdekat yang belum diambil
            let best = null, bd = 1e9;
            for (const cmp of s2Components) if (!cmp.got) {
                const d = Math.hypot(cmp.mx - camera.position.x, cmp.mz - camera.position.z);
                if (d < bd) { bd = d; best = cmp; }
            }
            if (best) { tx = best.mx; tz = best.mz; col = '#39d0ff'; }
        } else if (s2Phase === 'done') {
            tx = s2LiftPos.x; tz = s2LiftPos.z; col = '#2eff6a';
        } else {
            tx = s2GenPos.x; tz = s2GenPos.z; col = s2Phase === 'clear1' ? '#ff5040' : '#7fe3ff';
        }
        if (tx != null) plot(tx - camera.position.x, tz - camera.position.z, col, 5, true);
    },
};
