// SCENE: Campaign STAGE 3 — "Gedung Terbengkalai" indoor, LANTAI PABRIK ROBOT.
// DIROMBAK TOTAL 2026-07-21 mengikuti PLAN RESMI user (stage3-v2.csv, 40x40).
// Legenda plan: '#'=dinding, '-'=pintu geser, '+'=PINTU BLAST yang DIHANCURKAN
// dengan MENEMBAK (HP CFG.campaign.stage3.doorHp), 'T'=TANGGA rusak (sumber spawn
// robot), 'L'=LIFT (titik MASUK/spawn player), 'W'=ruang SUPPLY (6 ammo + 3
// medkit), 'R'=toilet, 'S'=MESIN PEMBUAT ROBOT (4 buah 2x2, 2 kiri 2 kanan, HP
// machineHp — dihancurkan dgn menembak), 'X'=ruang PABRIK (arena akhir), 'o'=PINTU
// KELUAR gedung (finish → transisi stage 4). Grid sel 2 m (dinding/collision/LOS/
// hit-peluru dari grid yang sama; pola stage1/2). Konektivitas BFS-verified.
//
// ALUR (state machine `s3Phase`, `s3Debug()`):
//   1. 'door'     : spawn dari LIFT. Hancurkan PINTU BLAST '+' dgn menembak.
//                   GELOMBANG robot MULAI hanya SETELAH tembakan PERTAMA ke pintu
//                   (s3DoorFired; sebelum itu player boleh berkeliling, TAK ADA
//                   robot): 6 dari TANGGA + 6 dari LIFT (gateWaveCount, kelas ACAK
//                   C50/B25/A25, LANGSUNG mengejar). ANTI-CAMP (2026-07-22): gelombang
//                   baru menyala respawnSec (8 dtk) setelah sisa robot TURUN DI BAWAH
//                   reinforceThreshold (4) — menyisakan 1 robot tak lagi membekukan
//                   spawn (dulu harus 0). Pintu hancur → gelombang STOP.
//   2. 'toX'      : robot sisa tetap mengejar; masuk ruang X (lewati bekas pintu).
//   3. 'machines' : 4 MESIN aktif. JANGAN langsung spawn — TUNDA machineFirstWaveSec
//                   (3 dtk), lalu GELOMBANG machineWaveCount (4) robot PER MESIN
//                   hidup; sisa < reinforceThreshold → respawn respawnSec (8 dtk).
//                   Hancurkan ke-4 mesin dgn menembak. Drop ammo/medkit di X DIGANDAKAN.
//   4. 'done'     : SEMUA mesin hancur + SEMUA robot habis → PINTU KELUAR 'o'
//                   AKTIF (hijau). Capai 'o' → beginStageTransition(stage4).

import { CFG, CAMP_M } from '../../../core/config.js';
import { player, robots, drops, _v3, bullets, stats, addScore } from '../../../core/state.js';
import { scene, camera, addCamShake } from '../../../core/renderer.js';
import { makeTexture, speckle } from '../../../utils/textures.js';
import { rand, segPointDist2 } from '../../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { applyLightPreset } from '../../../world/lighting.js';
import { PAL } from '../../../world/palette.js';
import { showStageMsg, showPickup } from '../../../core/dom.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { updateUI } from '../../../core/hud.js';
import { NADE_R } from '../../../entities/grenades.js';
import { disposeRobot, queueBoom } from '../../../entities/robots.js';
import { spawnBloodBurst, explodeAt } from '../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../entities/gore.js';
import { buildMedkitMesh, buildMagMesh } from '../../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../../entities/futuristicCupboard.js';
import { buildFuturisticCrateMesh } from '../../../entities/futuristicCrate.js';
import { buildFuturisticMeetingTableMesh } from '../../../entities/futuristicMeetingTable.js';
import { buildFuturisticStallMesh } from '../../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../../entities/futuristicSink.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, updateRoomLamps, resetRoomLamps } from '../utility/common.js';
import { buildInteriorFloorMat, buildInteriorWallMat } from '../utility/interior.js';
import { buildStageDoors, updateStageDoors, resolveDoors, doorBlocksShot, doorClampShot } from '../utility/doors.js';
import { buildStairwellUp, stairwellUpFootprint } from '../utility/stairwell.js';
import { buildLiftBank } from '../utility/lift.js';
import { buildCampaignCityscape, enterCityEnv } from '../utility/cityscape.js';
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
import { stage1Scene } from './stage1.js';
import { stage4Scene } from './stage4.js';

// Grid 40x40 (sel 2 m). Gedung ~90 km dari origin.
export const S3 = {
    G: 40, ROWS: 40, CELL: 2 * CAMP_M, H: 22,
    x0: 90000 - 20 * 2 * CAMP_M,
    z0: -20 * 2 * CAMP_M
};
export let s3grid = null;
export const s3Cell = (c, r) => ({ x: S3.x0 + (c + 0.5) * S3.CELL, z: S3.z0 + (r + 0.5) * S3.CELL });
export const S3_START = { c: 10, r: 16 };        // spawn di LIFT (titik masuk)
const S3_STAIRS_SPAWN = { c: 4, r: 6 };          // sumber spawn robot: tangga rusak (kiri-atas)
const S3_LIFT_SPAWN = { c: 10, r: 19 };          // sumber spawn robot: lift (selatan nook)
export const S3_END = { c: 19, r: 38 };          // PINTU KELUAR 'o' (finish, selatan-tengah)
const S3_EXIT = { c0: 18, r0: 37, c1: 21, r1: 39 };  // rect trigger keluar gedung
// PINTU BLAST '+' (dihancurkan dgn tembak): bukaan c18-21 di dinding baris 29.
const S3_PLUS = { c0: 18, c1: 21, r: 29 };
// 4 MESIN PEMBUAT ROBOT (2x2): 2 kiri (c2-3) + 2 kanan (c36-37). cc/cr = sel
// pojok kiri-atas 2x2; sc/sr = sel tempat robot MUNCUL (di aisle terdekat).
const S3_MACHINES_DEF = [
    { cc: 2, cr: 32, sc: 6, sr: 32, face: 1 },    // kiri-atas — hatch menghadap TIMUR (pusat X)
    { cc: 2, cr: 35, sc: 6, sr: 36, face: 1 },    // kiri-bawah
    { cc: 36, cr: 32, sc: 33, sr: 32, face: -1 }, // kanan-atas — hatch menghadap BARAT
    { cc: 36, cr: 35, sc: 33, sr: 36, face: -1 }, // kanan-bawah
];

// DENAH RESMI (stage3-v2.csv). 40x40. JANGAN ubah tanpa update S3_DOORS/S3_PLUS/
// S3_MACHINES/S3_EXIT + tes ulang.
const S3_MAP = [
    '########################################',   // 0
    '#......#...........#..........#........#',   // 1
    '#......#...........#..........#........#',   // 2
    '#......#...........#..........#........#',   // 3
    '#......#...........#..........#........#',   // 4
    '#......#...........#..........#........#',   // 5
    '#......#...........#..........#........#',   // 6
    '#......#...........#..........#........#',   // 7
    '#......#...........#####..#######......#',   // 8
    '#......................................#',   // 9
    '#......................................#',   // 10
    '#########.....#..............#..########',   // 11
    '#.............#..............#..#......#',   // 12
    '#.............#..............#..#......#',   // 13
    '#.......#.....#..............#..#......#',   // 14
    '#.......#..............................#',   // 15
    '#.......#..............................#',   // 16
    '#.......#.....#..............#..#......#',   // 17
    '#.......#.....#..............#..#......#',   // 18
    '#.......#.....#..............#..#......#',   // 19
    '############..#..............#..########',   // 20
    '#......................................#',   // 21
    '#......................................#',   // 22
    '#..........#....................#......#',   // 23
    '#..........#....................#......#',   // 24
    '#..........#....................#......#',   // 25
    '#..........#....................#......#',   // 26
    '#..........#....................#......#',   // 27
    '#..........#....................#......#',   // 28
    '##################....##################',   // 29
    '#......................................#',   // 30
    '#......................................#',   // 31
    '#......................................#',   // 32
    '#......................................#',   // 33
    '#......................................#',   // 34
    '#......................................#',   // 35
    '#......................................#',   // 36
    '#......................................#',   // 37
    '#......................................#',   // 38
    '##################....##################',   // 39
];

// PINTU geser otomatis di bukaan '-' plan (6 pintu).
const S3_DOORS = [
    { c0: 24, r0: 8, c1: 25, r1: 8, dir: 'ns' },     // ruang tengah-atas <-> koridor
    { c0: 32, r0: 9, c1: 32, r1: 10, dir: 'ew' },    // koridor: split kiri/kanan
    { c0: 8, r0: 12, c1: 8, r1: 13, dir: 'ew' },     // kiri-tengah <-> lift area
    { c0: 32, r0: 15, c1: 32, r1: 16, dir: 'ew' },   // tengah <-> kanan-tengah
    { c0: 11, r0: 21, c1: 11, r1: 22, dir: 'ew' },   // SUPPLY (W) <-> tengah-bawah
    { c0: 32, r0: 21, c1: 32, r1: 22, dir: 'ew' },   // tengah-bawah <-> toilet (R)
];
let s3doors = null;

// Lampu per-ruangan.
let s3Lamps = [];
let s3HintT = 0;

// ===== DESTRUCTIBLE: PINTU BLAST '+' + 4 MESIN + PINTU KELUAR =====
let s3Phase = 'door';   // door | toX | machines | done
let s3SpawnT = 0;        // timer GELOMBANG (respawn 8 dtk setelah gelombang bersih; fase door & machines)
let s3DoorFired = false; // player SUDAH menembak PINTU BLAST? (gelombang baru mulai setelahnya)
let s3DoorHp = 0;
let s3Door = null, s3DoorBlocker = null;   // mesh + blocker pintu blast
let s3DoorCX = 0, s3DoorCZ = 0;
let s3Machines = [];    // [{group, cx, cz, spawn, hp, alive, spawnT, hitT, eyeMat, blocker}]
let s3ExitSign = null, s3ExitLight = null, s3ExitDoor = null, s3ExitOpen = false;
export const s3Debug = () => ({ phase: s3Phase, doorHp: s3DoorHp, machinesAlive: s3MachinesAlive(), robots: countStageRobots(3), doorFired: s3DoorFired, spawnT: s3SpawnT });
export const s3DoorDbg = () => ({ hp: s3DoorHp, visible: s3Door ? s3Door.visible : null, blocked: blockers.indexOf(s3DoorBlocker) !== -1 });
export const s3MachinesDbg = () => s3Machines;

const blockers = [];
let built = false;

export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;

function buildS3Grid() {
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

// Uji ruas 2D vs kotak AABB (sampel) — dipakai hit-peluru PINTU BLAST lebar.
function segHitsRect(x0, z0, x1, z1, cx, cz, hx, hz) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (Math.abs(x0 + (x1 - x0) * t - cx) <= hx && Math.abs(z0 + (z1 - z0) * t - cz) <= hz) return true;
    }
    return false;
}

export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

export let s3Nav = null;
const s3MachinesAlive = () => s3Machines.reduce((a, m) => a + (m.alive ? 1 : 0), 0);

// ===== MESIN PEMBUAT ROBOT (futuristik, footprint 2x2 ~28 u, tinggi ~17) =====
// Ruang fabrikasi inti teal + gantry + hatch emitter (muka DEPAN +z) tempat robot
// keluar + SENSOR MERAH (faksi robot). GIBS-2045 (gunmetal/steel/panel/ink + teal
// + hazard). Lambert/Basic (warm, tanpa recompile). Menghadap PUSAT ruang X.
function buildSpawnMachine() {
    const g = new THREE.Group();
    const W = 26, H = 17, D = 26, f = 1;   // hatch di muka +z lokal (grup diputar ke pusat X di buildWorld)
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const panel = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const teal = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2b1f, toneMapped: false });   // sensor merah faksi robot
    const box = (mat, sx, sy, sz, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    const cyl = (mat, r, h, x, y, z, ax = 'y') => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), mat);
        m.position.set(x, y, z);
        if (ax === 'x') m.rotation.z = Math.PI / 2; else if (ax === 'z') m.rotation.x = Math.PI / 2;
        m.castShadow = true; g.add(m); return m;
    };
    // Fondasi + 4 pilar sudut + rangka atas
    box(ink, W, 2.4, D, 0, 1.2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(steel, 2.6, H, 2.6, sx * (W / 2 - 2), 2.4 + H / 2, sz * (D / 2 - 2));
    box(gun, W, 2.2, D, 0, 2.4 + H, 0);
    // Dinding belakang (jauh dari pusat) + samping
    box(gun, W, H - 2, 2.4, 0, 2.4 + (H - 2) / 2, -f * (D / 2 - 1.4));
    box(panel, 2.4, H - 2, D - 6, -W / 2 + 1.4, 2.4 + (H - 2) / 2, 0);
    box(panel, 2.4, H - 2, D - 6, W / 2 - 1.4, 2.4 + (H - 2) / 2, 0);
    // Ruang fabrikasi: inti teal menyala + cincin baja
    cyl(teal, 4.5, H - 4, 0, 2.4 + (H - 4) / 2, 0);
    for (const yy of [5, 9, 13]) cyl(steel, 5.2, 0.9, 0, yy, 0);
    // Gantry + lengan robotik di atas inti
    box(steel, 3, 3, 16, 0, 2.4 + H - 1.5, 0);
    box(gun, 2.2, 6, 2.2, 6, 2.4 + H - 6, 0);
    // Hatch emitter di muka DEPAN (ke pusat X, f) tempat robot keluar
    box(gun, 14, 12, 1.6, 0, 8, f * (D / 2 - 0.8));
    box(teal, 10, 8, 0.8, 0, 8, f * (D / 2 - 0.2));
    const eye = box(eyeMat, 5, 1.7, 0.7, 0, 15, f * (D / 2 - 0.1));   // sensor merah (kilat tertembak)
    box(hazard, W - 6, 1, 0.8, 0, 3.2, f * (D / 2 - 0.2));
    // Pipa + antena
    for (const sx of [-1, 1]) cyl(steel, 1, D - 4, sx * (W / 2 - 4), 2.4 + H - 3, 0, 'z');
    cyl(steel, 0.5, 6, 0, 2.4 + H + 3, 0);
    return { group: g, eyeMat };
}

// PINTU BLAST '+' (dihancurkan dgn tembak): slab tebal + rusuk baja + strip
// hazard + panel kunci teal. w = lebar bukaan (4 sel).
function buildBlastDoor(w) {
    const g = new THREE.Group();
    const H = S3.H, D = 4.5;
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const teal = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const white = new THREE.MeshBasicMaterial({ color: PAL.white, toneMapped: false });
    const box = (mat, sx, sy, sz, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    box(gun, w, H - 1, D, 0, (H - 1) / 2, 0);
    for (let x = -w / 2 + 5; x <= w / 2 - 5; x += 10) box(steel, 2.4, H - 3, D + 0.6, x, (H - 1) / 2, 0);
    for (const yy of [H * 0.3, H * 0.68]) box(steel, w - 2, 2.2, D + 0.4, 0, yy, 0);
    for (const s of [-1, 1]) for (let i = -2; i <= 2; i++)
        box(i % 2 ? hazard : white, 5, 2.4, 0.5, i * 6, H * 0.5, s * (D / 2 + 0.2));
    box(ink, 10, 8, 0.9, 0, H * 0.5, D / 2 + 0.3);
    box(teal, 6, 4, 0.8, 0, H * 0.5, D / 2 + 0.6);
    return g;
}

export function buildWorld() {
    buildS3Grid();
    const sizeX = S3.G * S3.CELL, sizeZ = S3.ROWS * S3.CELL;
    const cx = S3.x0 + sizeX / 2, cz = S3.z0 + sizeZ / 2;

    // --- Lantai (panel fasilitas terang) ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), buildInteriorFloorMat(S3.G, S3.ROWS));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    buildCampaignCityscape(cx, cz, sizeX / 2, sizeZ / 2);

    // --- Plafon (disembunyikan; top-down) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#26231e'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#201d18', '#2d2923', '#1a1813'], 120, 1, 4);
    }, S3.G, S3.ROWS);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S3.H, cz);
    ceil.visible = false;
    scene.add(ceil);

    // --- Dinding (InstancedMesh) ---
    const wallCells = [];
    for (let r = 0; r < S3.ROWS; r++) for (let c = 0; c < S3.G; c++) {
        if (s3grid[r][c] !== 1) continue;
        let nearFloor = false;
        for (let dr = -1; dr <= 1 && !nearFloor; dr++)
            for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                if (!s3Wall(c + dc, r + dr)) nearFloor = true;
        if (nearFloor) wallCells.push([c, r]);
    }
    const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(S3.CELL, S3.H, S3.CELL), buildInteriorWallMat(), wallCells.length);
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

    // --- Pintu geser otomatis ---
    s3doors = buildStageDoors(S3_DOORS, s3Cell, S3.CELL, S3.H);

    // --- Furnitur KANTOR ---
    const putModel = (mesh, x, z, sx, sy, sz, standable = true) => {
        blockers.push({ x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(sx / 2, sz / 2), top: sy, standable });
        mesh.position.set(x, 0, z); scene.add(mesh);
    };
    const deskModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s3Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, true);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.5 + 2); chair.rotation.y = Math.PI; scene.add(chair);
    };
    const meetingModel = (c, r, sx, sy, sz) => { const p = s3Cell(c, r); putModel(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x, p.z, sx, sy, sz, true); };
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0) => {
        const p = s3Cell(c, r), x = p.x + dx, z = p.z + dz;
        blockers.push({ x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(sx / 2, sz / 2), top: sy, standable: true });
        const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
        const n = Math.max(1, Math.min(4, Math.round(longLen / shortLen))), unit = longLen / n;
        for (let i = 0; i < n; i++) {
            const off = -longLen / 2 + unit * (i + 0.5);
            const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
            cab.position.set(along ? x + off : x, 0, along ? z : z + off); scene.add(cab);
        }
    };
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0) => { const p = s3Cell(c, r); putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, true); };
    // Ruang atas B/C/D (kantor)
    meetingModel(13, 5, 30, 7, 16); cupboardModel(16, 2, 8, 15, 18);
    deskModel(23, 3, 24, 7, 12); propModel(buildFuturisticCrateMesh, 26, 6, 14, 8, 12);
    deskModel(34, 3, 24, 7, 12); cupboardModel(37, 6, 8, 15, 18);
    deskModel(4, 7, 12, 7, 8);   // ruang tangga (kecil)
    // SUPPLY (W, c1-10 r21-28): rak (persediaan diletakkan placeSupplies)
    cupboardModel(2, 24, 8, 15, 22); cupboardModel(9, 22, 8, 15, 10);
    // Toilet (R, c33-38 r21-28): bilik + wastafel
    propModel(buildFuturisticStallMesh, 35, 23, 2, 15, 10); propModel(buildFuturisticStallMesh, 35, 27, 2, 15, 10);
    propModel(buildFuturisticSinkMesh, 37, 25, 10, 8, 4);
    // Tengah-bawah (jalur ke pintu blast): krat pinggir (jauh dari bukaan c18-21)
    propModel(buildFuturisticCrateMesh, 15, 24, 14, 9, 14); propModel(buildFuturisticCrateMesh, 28, 26, 14, 9, 14);

    // --- TANGGA RUSAK (sumber spawn robot, kiri-atas) + puing ---
    const upF = stairwellUpFootprint(S3.x0 + S3.CELL, S3.z0 + S3.CELL);
    buildStairwellUp(S3.x0 + S3.CELL, S3.z0 + S3.CELL, S3.H);
    blockers.push({ x: upF.x, z: upF.z, hx: upF.hx, hz: upF.hz, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(upF.hx, upF.hz), top: 10, standable: true });
    propModel(buildFuturisticCrateMesh, 5, 4, 10, 9, 10);   // puing kaki tangga

    // --- LIFT (titik masuk) di nook c9-10 r15-19 — SEPASANG lift (kiri-kanan)
    // MENGHADAP TIMUR, MENEMPEL tembok BARAT (col8). Terbuka; player spawn di
    // depannya (c10) seolah baru keluar lift. Walkable (tanpa blocker). ---
    const liftWallX3 = S3.x0 + 9 * S3.CELL;          // muka timur tembok barat (col8)
    const liftZ3 = S3.z0 + 16.5 * S3.CELL;           // pusat pasangan (dekat spawn r16)
    const lift = buildLiftBank({ facing: 'east', H: S3.H, open: true, gap: 30 });
    lift.position.set(liftWallX3, 0, liftZ3);
    scene.add(lift);

    // === 4 MESIN PEMBUAT ROBOT (blocker DI-BAKE nav, robot memutar) ===
    s3Machines = [];
    for (const d of S3_MACHINES_DEF) {
        const p = s3Cell(d.cc + 0.5, d.cr + 0.5);    // pusat 2x2
        const mach = buildSpawnMachine();             // hatch di muka +z lokal
        mach.group.position.set(p.x, 0, p.z);
        mach.group.rotation.y = d.face * Math.PI / 2; // putar hatch ke PUSAT ruang (timur/barat)
        scene.add(mach.group);
        const blocker = { x: p.x, z: p.z, hx: 14, hz: 14, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(14, 14), top: 17, standable: false };
        blockers.push(blocker);
        const sp = s3Cell(d.sc, d.sr);
        s3Machines.push({ group: mach.group, cx: p.x, cz: p.z, spawn: { c: d.sc, r: d.sr }, hp: 0, alive: true, hitT: 0, eyeMat: mach.eyeMat, blocker });
    }

    // --- PINTU KELUAR 'o' (finish) di dinding selatan baris 39 (c18-21) ---
    const exW = (S3_PLUS.c1 - S3_PLUS.c0 + 1) * S3.CELL;
    const exP = s3Cell((S3_EXIT.c0 + S3_EXIT.c1) / 2, S3_EXIT.r1);   // pusat bukaan @ baris 39
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(exW + 8, 5, 6), new THREE.MeshLambertMaterial({ color: PAL.gunmetal }));
    lintel.position.set(exP.x, S3.H - 2.5, exP.z); scene.add(lintel);
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x1a2b28, shininess: 60, specular: 0x4a6a64, transparent: true, opacity: 0.55 });
    s3ExitDoor = new THREE.Group();
    for (const sgn of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(exW / 2 - 1, S3.H - 6, 1.2), glassMat);
        leaf.position.set(exP.x + sgn * (exW / 4), (S3.H - 6) / 2, exP.z - 1.5);
        s3ExitDoor.add(leaf);
    }
    scene.add(s3ExitDoor);
    s3ExitSign = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 1.2), new THREE.MeshBasicMaterial({ color: 0xff4a3c, toneMapped: false }));
    s3ExitSign.position.set(exP.x, S3.H - 6, exP.z + 3); scene.add(s3ExitSign);
    s3ExitLight = new THREE.PointLight(0xff5040, 0.9, 240, 2);
    s3ExitLight.position.set(exP.x, S3.H - 8, exP.z + 6); scene.add(s3ExitLight);

    // --- Lampu per-ruangan (mati → nyala saat pintu dibuka / rect dimasuki) ---
    s3Lamps = [];
    const addLamp = (c, r, color, inten, dist, c0, r0, c1, r1) => {
        const p = s3Cell(c, r);
        const L = new THREE.PointLight(color, 0, dist, 2);
        L.position.set(p.x, S3.H - 3, p.z); scene.add(L);
        const lm = { L, base: inten, on: false, k: 0, x0: S3.x0 + c0 * S3.CELL, x1: S3.x0 + (c1 + 1) * S3.CELL, z0: S3.z0 + r0 * S3.CELL, z1: S3.z0 + (r1 + 1) * S3.CELL };
        if (!s3Lamps.some(o => o.shroud && o.x0 === lm.x0 && o.z0 === lm.z0 && o.x1 === lm.x1 && o.z1 === lm.z1)) {
            const sh = new THREE.Mesh(new THREE.BoxGeometry(lm.x1 - lm.x0 - 1, S3.H - 0.6, lm.z1 - lm.z0 - 1), new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 1 }));
            sh.position.set((lm.x0 + lm.x1) / 2, (S3.H - 0.6) / 2 + 0.2, (lm.z0 + lm.z1) / 2); scene.add(sh); lm.shroud = sh;
        }
        s3Lamps.push(lm); return lm;
    };
    addLamp(3, 4, 0xffd9a0, 0.9, 220, 1, 1, 6, 10);         // 0 tangga (kiri-atas, pra-nyala)
    addLamp(13, 4, 0xffe2b8, 0.9, 320, 8, 1, 18, 8);        // 1 ruang B
    addLamp(24, 4, 0xffd9a0, 0.85, 300, 19, 1, 29, 8);      // 2 ruang C
    addLamp(34, 4, 0xffe2b8, 0.9, 320, 30, 1, 38, 8);       // 3 ruang D
    addLamp(10, 17, 0xbfe4ff, 0.85, 320, 9, 11, 12, 20);    // 4 lift area
    addLamp(21, 15, 0xffe2b8, 0.85, 460, 14, 11, 28, 20);   // 5 chamber tengah
    addLamp(20, 24, 0xffe2b8, 0.85, 460, 12, 21, 31, 28);   // 6 tengah-bawah (jalur pintu blast)
    addLamp(5, 24, 0xffc890, 0.85, 320, 1, 21, 10, 28);     // 7 SUPPLY (W)
    addLamp(35, 24, 0xbfe4ff, 0.85, 320, 33, 21, 38, 28);   // 8 toilet (R)
    addLamp(11, 34, 0xff9a5a, 0.95, 640, 1, 30, 19, 38);    // 9 PABRIK X (barat)
    addLamp(29, 34, 0xff9a5a, 0.95, 640, 20, 30, 38, 38);   // 10 PABRIK X (timur)
    for (const lm of s3Lamps) lm.doors = s3doors.filter(d =>
        d.cx >= lm.x0 - 1.5 * S3.CELL && d.cx <= lm.x1 + 1.5 * S3.CELL &&
        d.cz >= lm.z0 - 1.5 * S3.CELL && d.cz <= lm.z1 + 1.5 * S3.CELL);

    // Bake nav-grid (blocker mesin sudah masuk → robot memutar; pintu blast BELUM)
    const half = S3.CELL / 2;
    s3Nav = makeNavGrid(S3.x0, S3.z0, half, S3.G * 2, S3.ROWS * 2, (x, z) => {
        if (!stage3Walk(x, z, 3)) return false;
        _v3.set(x, 0, z); resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });

    // === PINTU BLAST '+' (SETELAH bake nav → sel bukaan tetap walkable di nav;
    // blocker per-frame memblok sampai hancur, lalu di-splice) ===
    const dp = s3Cell((S3_PLUS.c0 + S3_PLUS.c1) / 2, S3_PLUS.r);
    s3DoorCX = dp.x; s3DoorCZ = dp.z;
    const dw = (S3_PLUS.c1 - S3_PLUS.c0 + 1) * S3.CELL;
    s3Door = buildBlastDoor(dw);
    s3Door.position.set(dp.x, 0, dp.z);
    scene.add(s3Door);
    s3DoorBlocker = { x: dp.x, z: dp.z, hx: dw / 2, hz: S3.CELL / 2, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(dw / 2, S3.CELL / 2), top: S3.H, standable: false };
    blockers.push(s3DoorBlocker);
}

// ===== ROBOT SPAWN (langsung mengejar) + kelas acak C50/B25/A25 =====
function randClass3() { const r = Math.random(); return r < 0.5 ? 'C' : r < 0.75 ? 'B' : 'A'; }
function s3SpawnChaser(cell, cls) {
    const p = s3Cell(cell.c, cell.r);
    _v3.set(p.x + rand(-5, 5), 0, p.z + rand(-5, 5));
    resolve(_v3, 4, 0);
    if (!stage3Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
    spawnCampaignRobot(_v3.x, _v3.z, 3, cls);
    const z = robots[robots.length - 1];
    z.state = 'chasing'; z.groundY = 0;   // langsung kejar (bukan idle)
}

// ===== HIT-PELURU DESTRUCTIBLE (pola tankBulletHits): peluru PLAYER (array
// `bullets`) merusak target lalu dihapus; explosive = damage langsung + boom. =====
function s3ApplyBulletDamage(b, bx, bz, apply) {
    if (b.explosive) {
        queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage, b.boomSfx);
        apply(b.damage != null ? b.damage : CFG.grenade.damage);
    } else {
        const dmg = (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
        stats.hits++;
        apply(dmg);
        spawnBloodBurst(bx, 12 + Math.random() * 6, bz, b.dir.x, b.dir.z, 2, 0.5, 1.4, 0xffb24a);
    }
}
function s3DoorBulletHits() {
    if (!s3Door || s3DoorHp <= 0) return;
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j], bx = b.mesh.position.x, bz = b.mesh.position.z;
        if (segHitsRect(b.px, b.pz, bx, bz, s3DoorCX, s3DoorCZ, 30, 9)) {
            s3DoorFired = true;   // tembakan PERTAMA ke pintu -> gelombang robot mulai (updateMode)
            s3ApplyBulletDamage(b, bx, bz, (dmg) => { s3DoorHp -= dmg; });
            scene.remove(b.mesh); bullets.splice(j, 1);
            if (s3DoorHp <= 0) return;
        }
    }
}
// GELOMBANG robot fase door: 6 dari TANGGA + 6 dari LIFT (langsung chasing).
function spawnDoorWave() {
    const n = CFG.campaign.stage3.gateWaveCount;
    for (let k = 0; k < n; k++) { s3SpawnChaser(S3_STAIRS_SPAWN, randClass3()); s3SpawnChaser(S3_LIFT_SPAWN, randClass3()); }
}
// GELOMBANG robot fase machines: machineWaveCount robot PER MESIN yang masih hidup.
function spawnMachineWave() {
    const n = CFG.campaign.stage3.machineWaveCount;
    for (const m of s3Machines) if (m.alive) for (let k = 0; k < n; k++) s3SpawnChaser(m.spawn, randClass3());
}
function s3MachineBulletHits() {
    const R2 = CFG.campaign.stage3.machineHitRadius ** 2;
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j], bx = b.mesh.position.x, bz = b.mesh.position.z;
        let hit = null;
        for (const m of s3Machines) {
            if (!m.alive) continue;
            if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.cx, 0, m.cz) < R2) { hit = m; break; }
        }
        if (hit) {
            s3ApplyBulletDamage(b, bx, bz, (dmg) => { hit.hp -= dmg; hit.hitT = 1; });
            scene.remove(b.mesh); bullets.splice(j, 1);
        }
    }
}
function s3DestroyDoor() {
    if (s3Door) s3Door.visible = false;
    const i = blockers.indexOf(s3DoorBlocker);
    if (i !== -1) blockers.splice(i, 1);
    explodeAt(new THREE.Vector3(s3DoorCX, 10, s3DoorCZ), 24, 1, undefined);
    spawnGibs(s3DoorCX, 12, s3DoorCZ, 12, 1, 0, 2, 0x3d444c, 0.4, 0x141210);
    addCamShake(7);
}
function s3DestroyMachine(m) {
    m.alive = false;
    if (m.group) m.group.visible = false;
    const i = blockers.indexOf(m.blocker);
    if (i !== -1) blockers.splice(i, 1);
    addScore(CFG.robot.score.specialKill);
    explodeAt(new THREE.Vector3(m.cx, 12, m.cz), 26, 1, undefined);
    spawnGibs(m.cx, 14, m.cz, 12, 1, 0, 2.2, 0x3d444c, 0.4, 0x141210);
    spawnBloodDecal(m.cx, m.cz, 7, 0x141210);
    addCamShake(8);
    updateUI();
}

// SUPPLY: ruang W (6 ammo + 3 medkit) + ruang PABRIK X (DIGANDAKAN: 8 ammo + 4 medkit).
function placeSupplies() {
    const put = (type, c, r) => {
        const p = s3Cell(c, r);
        const mesh = type === 'mag' ? buildMagMesh() : buildMedkitMesh();
        mesh.position.set(p.x, 1, p.z); scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    // W supply (c1-10 r21-28): 6 ammo + 3 medkit
    put('mag', 3, 22); put('mag', 6, 23); put('mag', 3, 26); put('mag', 8, 27); put('mag', 5, 25); put('mag', 7, 22);
    put('medkit', 4, 28); put('medkit', 9, 24); put('medkit', 2, 27);
    // PABRIK X (rows 30-38) DIGANDAKAN: 8 ammo + 4 medkit tersebar
    put('mag', 10, 31); put('mag', 30, 31); put('mag', 14, 37); put('mag', 26, 37);
    put('mag', 8, 34); put('mag', 32, 34); put('mag', 6, 31); put('mag', 34, 31);
    put('medkit', 12, 33); put('medkit', 28, 33); put('medkit', 16, 36); put('medkit', 24, 36);
}

export const stage3Scene = {
    id: 'campaign-3',

    // Kamera KHUSUS stage 3 (2026-07-21, permintaan user): memandang dari BARAT
    // LAUT (NW) ke TENGGARA (SE) — z dibalik dari default barat daya. Tinggi &
    // jarak horizontal sama (pitch/zoom tetap), hanya azimuth berputar. renderer
    // `applySceneCamOffset` menerapkannya + memutakhirkan basis layar (WASD/radar).
    camOffset: { x: -70.7, y: 116, z: -70.7 },

    enter() {
        saveCampaignStage(3);
        ensureWorld();
        // Buang robot stage 2 yang tersisa + sisa robot stage 3 dari run sebelumnya
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 2 || robots[i].stage === 3) { disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1); }
        }
        placeSupplies();
        applyLightPreset(scene, 'indoor');
        enterCityEnv();
        resetRoomLamps(s3Lamps);
        if (s3Lamps[0]) { const st = s3Lamps[0]; st.on = true; st.k = 1; st.L.intensity = st.base; if (st.shroud) { st.shroud.visible = false; st.shroud.material.opacity = 0; } }
        // RESET destructibles
        s3Phase = 'door';
        s3DoorFired = false;   // belum menembak pintu -> belum ada gelombang (player boleh berkeliling)
        s3SpawnT = 0;
        s3DoorHp = CFG.campaign.stage3.doorHp;
        if (s3Door) s3Door.visible = true;
        if (blockers.indexOf(s3DoorBlocker) === -1) blockers.push(s3DoorBlocker);
        for (const m of s3Machines) {
            m.hp = CFG.campaign.stage3.machineHp; m.alive = true; m.hitT = 0;
            if (m.group) m.group.visible = true;
            if (m.eyeMat) m.eyeMat.color.setHex(0xff2b1f);
            if (blockers.indexOf(m.blocker) === -1) blockers.push(m.blocker);
        }
        s3ExitOpen = false;
        if (s3ExitSign) { s3ExitSign.material.color.setHex(0xff4a3c); s3ExitLight.color.setHex(0xff5040); }
        s3HintT = 0;
        const sp = s3Cell(S3_START.c, S3_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);
        player.vy = 0; player.onGround = true;
        showStageMsg('Arrived by lift. BLAST THROUGH THE REINFORCED DOOR to reach the robot factory!', 5200);
        updateUI();
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    updateMode(dt) {
        updateStageDoors(s3doors, dt);
        updateRoomLamps(s3Lamps, dt);
        const s3 = CFG.campaign.stage3;
        const pz = camera.position.z;

        if (s3Phase === 'door') {
            s3DoorBulletHits();
            // GELOMBANG robot MULAI hanya SETELAH tembakan PERTAMA ke pintu (biarkan
            // player berkeliling dulu). 6 dari tangga + 6 dari lift. ANTI-CAMP
            // (2026-07-22): gelombang berikut menyala saat sisa robot TURUN DI BAWAH
            // `reinforceThreshold` (bukan lagi harus 0) — menyisakan 1 robot TAK LAGI
            // membekukan spawn, jadi player tak bisa aman menghancurkan pintu. Player
            // tetap dapat jeda saat benar-benar membersihkan lapangan (0 < threshold).
            if (s3DoorFired && countStageRobots(3) < s3.reinforceThreshold) {
                s3SpawnT -= dt;
                if (s3SpawnT <= 0) { spawnDoorWave(); s3SpawnT = s3.respawnSec; }
            }
            if (s3DoorHp <= 0) {
                s3DestroyDoor();
                s3Phase = 'toX';
                showStageMsg('BLAST DOOR DOWN! Push into the robot factory hall.', 4200);
            }
        } else if (s3Phase === 'toX') {
            if (pz > S3.z0 + 30 * S3.CELL) {   // masuk ruang X (lewati baris pintu 29)
                s3Phase = 'machines';
                s3SpawnT = s3.machineFirstWaveSec;   // JANGAN langsung spawn — tunda 3 dtk dulu
                showStageMsg('ROBOT FACTORIES ONLINE — destroy all 4 machines!', 4600);
            }
        } else if (s3Phase === 'machines') {
            s3MachineBulletHits();
            for (const m of s3Machines) if (m.alive && m.hp <= 0) s3DestroyMachine(m);
            // GELOMBANG mesin: tunda `machineFirstWaveSec` (3 dtk) sebelum yang PERTAMA,
            // lalu 4 robot PER MESIN hidup. ANTI-CAMP (2026-07-22): gelombang berikut
            // menyala saat sisa robot TURUN DI BAWAH `reinforceThreshold` (bukan 0) —
            // menyisakan 1 robot tak lagi membekukan spawn saat menghancurkan mesin.
            if (s3MachinesAlive() > 0 && countStageRobots(3) < s3.reinforceThreshold) {
                s3SpawnT -= dt;
                if (s3SpawnT <= 0) { spawnMachineWave(); s3SpawnT = s3.respawnSec; }
            }
            if (s3MachinesAlive() === 0 && countStageRobots(3) === 0) {
                s3Phase = 'done';
                s3ExitOpen = true;
                if (s3ExitSign) { s3ExitSign.material.color.setHex(0x2eff6a); s3ExitLight.color.setHex(0x39ff7a); }
                showStageMsg('ALL FACTORIES DESTROYED — the EXIT is open. Get out!', 4800);
            }
        }
        // Kilat sensor mesin tertembak (merah → putih, memudar)
        for (const m of s3Machines) if (m.alive && m.hitT > 0 && m.eyeMat) {
            m.hitT = Math.max(0, m.hitT - dt * 6);
            const t = m.hitT, r = 0xff, g = Math.round(0x2b + (0xff - 0x2b) * t), bl = Math.round(0x1f + (0xff - 0x1f) * t);
            m.eyeMat.color.setHex(r << 16 | g << 8 | bl);
        }
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage3Walk, pos, oldX, oldZ, player.radius);
        if (pos.x >= S3.x0 + S3_EXIT.c0 * S3.CELL && pos.x <= S3.x0 + (S3_EXIT.c1 + 1) * S3.CELL
            && pos.z >= S3.z0 + S3_EXIT.r0 * S3.CELL && pos.z <= S3.z0 + (S3_EXIT.r1 + 1) * S3.CELL) {
            if (s3Phase === 'done') beginStageTransition(stage4Scene);
            else if (Date.now() - s3HintT > 2500) { s3HintT = Date.now(); showStageMsg('THE EXIT IS SEALED — destroy the robot factories first!', 2200); }
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    bulletBlocked(b) {
        return (b.mesh.position.y < S3.H && s3SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z))
            || doorClampShot(s3doors, b);
    },

    blastBlocked(x0, z0, x1, z1, y) { return doorBlocksShot(s3doors, x0, z0, x1, z1, y); },

    grenadeCollide(g, oldGX, oldGZ) {
        if (!stage3Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        if (g.mesh.position.y > S3.H - NADE_R) { g.mesh.position.y = S3.H - NADE_R; if (g.vy > 0) g.vy = -g.vy * 0.3; }
    },

    robotAI(z, dt, step) {
        return campaignRobotAI(z, dt, step, {
            walkable: stage3Walk, resolve, nav: s3Nav,
            los: (x1, z1, x2, z2) => s3LOS(x1, z1, x2, z2) && !doorBlocksShot(s3doors, x1, z1, x2, z2, 8),
            doorBlock: (pos, r) => resolveDoors(s3doors, pos, r)
        });
    },

    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: stage3Walk, resolve, doorBlock: (pos, r) => resolveDoors(s3doors, pos, r) });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        switch (s3Phase) {
            case 'door': return `FLOOR 3 — Blast the reinforced door open (HP ${Math.max(0, Math.ceil(s3DoorHp))})`;
            case 'toX': return 'FLOOR 3 — Push south into the robot factory hall';
            case 'machines': return `FLOOR 3 — Destroy the robot factories: ${s3MachinesAlive()}/4 left | Hostiles: ${countStageRobots(3)}`;
            default: return 'FLOOR 3 — EXIT OPEN — escape the building!';
        }
    },

    radarLandmarks(plot) {
        let tx, tz, col;
        if (s3Phase === 'done') { const e = s3Cell((S3_EXIT.c0 + S3_EXIT.c1) / 2, S3_EXIT.r1); tx = e.x; tz = e.z; col = '#2eff6a'; }
        else if (s3Phase === 'machines') {
            let best = null, bd = 1e9;
            for (const m of s3Machines) if (m.alive) { const d = Math.hypot(m.cx - camera.position.x, m.cz - camera.position.z); if (d < bd) { bd = d; best = m; } }
            if (best) { tx = best.cx; tz = best.cz; col = '#ff5040'; }
        } else { tx = s3DoorCX; tz = s3DoorCZ; col = '#ff5040'; }
        if (tx != null) plot(tx - camera.position.x, tz - camera.position.z, col, 5, true);
    },
};
