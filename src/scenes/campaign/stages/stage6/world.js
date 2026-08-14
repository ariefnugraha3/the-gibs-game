// Stage 6 — DUNIA CHAPTER 1 "ARRIVAL" (stasiun Bandung).
//
// Denah = transliterasi beku dari `stages(Stage6-Start).csv` milik user
// (50x50). Legenda: `#` dinding, `.` lantai, `A` SAFE AREA (SA, tidak ada robot
// spawn), `S` titik spawn Gibran, `W` gudang perbekalan (ammo + medkit ditebar),
// `-` pintu yang langsung terbuka, `=` pintu berkunci, `@` pintu ke chapter
// berikutnya, `K` rak berisi kunci (satu dipilih ACAK tiap run), `I` terminal
// informasi yang menunjuk rak mana yang menyimpan kunci, `G` generator,
// `H` titik perbaikan generator, `F` titik finish chapter.
//
// Modul ini HANYA membangun dan menjawab pertanyaan tentang dunia; seluruh alur
// permainan ada di `arrival.js`.

import { camera } from '../../../../core/renderer.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { resolveBlockers, blockersGroundHeight } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { rand } from '../../../../utils/math.js';
import {
    buildSplitDoor, buildDoorSideLights, DOOR_LOCKED_COLOR, doorBlocksShot as sharedDoorBlocksShot,
    doorClampShot as sharedDoorClampShot, doorsWalkable as sharedDoorsWalkable,
    doorProximityTarget,
    resolveDoors as resolveCampaignDoors, setDoorSideLightState, splitDoorDebug, updateDoorMotion,
} from '../../utility/doors.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, updateSpawnMachine, spawnMachineDebug,
    wreckSpawnMachine, spawnMachineHp,
} from '../../../../entities/spawnMachine.js';
import { buildCampaignCityscape } from '../../utility/cityscape.js';
import { buildFadeableWalls } from '../../utility/wallFade.js';
import {
    registerOccluder, weldOccluder, updateStageOccluders, resetStageOccluders,
    occlusionDebug,
} from '../../utility/occlusion.js';

export const OX = 210000, OZ = 0;
export const MAP_COLS = 50, MAP_ROWS = 50, CELL = 14, WALL_H = 25;
export const MAP_X0 = OX - MAP_COLS * CELL / 2;
export const MAP_Z0 = OZ - MAP_ROWS * CELL / 2;
export const cellPos = (c, r) => ({ x: MAP_X0 + (c + 0.5) * CELL, z: MAP_Z0 + (r + 0.5) * CELL });

// LATAR = KOTA, SEPERTI STAGE 5 (2026-08-10, permintaan user: stage 6 masih
// memakai kubah "pusaran api" global yang terasa aneh). Terminal Bandung berdiri
// di PERMUKAAN TANAH — bukan Lantai 2 seperti kantor stage 1-3 — jadi jalan kota
// nyaris rata dengan lantai peron, persis seperti depot Stage 5.
export const CITY_GROUND_Y = -6;

// Transliterasi CSV user, baris demi baris. JANGAN diedit tanpa CSV baru.
export const S6_MAP = Object.freeze([
    '###########################################@@@@###',
    '#..........................................FFFF..#',
    '#................................................#',
    '#................................................#',
    '#................................................#',
    '#.......................................#........#',
    '#..K###.......###.......###.......###...#........#',
    '#..K###.......###.......###.......###...#........#',
    '#..K###.......###.......###.......###...#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#...###.......###......K###.......###...#........#',
    '#...###.......###......K###.......###...#........#',
    '#...###.......###......K###.......###...#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#...###.......###.......###......K###...#........#',
    '#...###.......###.......###......K###...#........#',
    '#...###.......###.......###......K###...#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#........#',
    '#.......................................#...II...#',
    '###--#######################################==####',
    '#WWWWWWWWWWWWWWWWWWWWWWWWWWWW#...................#',
    '#WWWWWWWWWWWWWWWWWWWWWWWWWWWW#...................#',
    '#WWWWWWWWWWWWWWWWWWWWWWWWWWWW#...................#',
    '#WWWWWWWWWWWWWWWWWWWWWWWWWWWW#...................#',
    '#WWWWWWWWWWWWWWWWWWWWWWWWWWWW#...GGG..GGG..GGG...#',
    '#WWWWWWWWWWWWWWWWWWWWWWWWWWWW#...GGG..GGG..GGG...#',
    '#WWWWWWWWWWWWWWWWWWWWWWWWWWWW#...GGG..GGG..GGG...#',
    '###--#########################....H....H....H....#',
    '#AAAAAAAAAAAAAAAAAAAAAAAAAAAA#...................#',
    '#AAAAAAAAAAAAAAAAAAAAAAAAAAAA#...................#',
    '#AAAAAAAAAAAAAAAAAAAAAAAAAAAA#...................#',
    '#AAAAAAAAAAAAAAAAAAAAAAAAAAAA#...................#',
    '#AAAAAAAAAAAAAAAAAAAAAAAAAAAA#...................#',
    '#AAAAAAAAAAAAAAAAAAAAAAAAAASA#####################',
]);

export const S6_LEGEND = Object.freeze({
    '#': 'wall', '.': 'floor', A: 'safe-area', S: 'start', W: 'supply-room',
    '-': 'door', '=': 'locked-door', '@': 'chapter-door',
    // `I` DULU terminal informasi yang bisa di-hack; DIHAPUS 2026-08-12 atas
    // permintaan user — tak boleh ada komputer di depan ruang generator, karena
    // satu-satunya cara membuka pintu `=` adalah KUNCI yang dicari di rak `K`.
    // Petanya tetap transliterasi beku CSV user, jadi tokennya dipertahankan dan
    // selnya kini lantai biasa.
    K: 'key-rack', I: 'floor', G: 'generator', H: 'repair-point', F: 'finish',
});

export const S6_START = Object.freeze(cellPos(27, 49));
export const S6_FINISH = Object.freeze(cellPos(44.5, 1));
// Tiga rak kunci; satu dipilih acak tiap run. Titik berdiri ada di SISI TERBUKA
// rak (rak menempel pilar), bukan di dalam selnya.
export const RACK_POINTS = Object.freeze([
    Object.freeze({ id: 0, ...cellPos(3, 7), stand: Object.freeze(cellPos(2, 7)) }),
    Object.freeze({ id: 1, ...cellPos(23, 17), stand: Object.freeze(cellPos(22, 17)) }),
    Object.freeze({ id: 2, ...cellPos(33, 27), stand: Object.freeze(cellPos(32, 27)) }),
]);
export const GENERATOR_POINTS = Object.freeze([
    Object.freeze({ id: 0, ...cellPos(34, 41), stand: Object.freeze(cellPos(34, 43)) }),
    Object.freeze({ id: 1, ...cellPos(39, 41), stand: Object.freeze(cellPos(39, 43)) }),
    Object.freeze({ id: 2, ...cellPos(44, 41), stand: Object.freeze(cellPos(44, 43)) }),
]);
// DUA MESIN PEMBUAT ROBOT (permintaan user 2026-08-09): di ujung utara gudang
// terminal, tepat SEBELUM lorong layanan yang mengantar ke pintu keluar `F` —
// jadi player melewatinya saat menuju lorong dan sekali lagi saat keluar.
// Mereka PROP, bukan token peta: denah CSV user tidak boleh diedit, jadi
// collider-nya masuk lewat `recordProp` dan ikut dipanggang ke nav.
export const MACHINE_SIZE = 30;
export const MACHINE_POINTS = Object.freeze([
    Object.freeze({ id: 0, ...cellPos(31, 3), hatch: Object.freeze(cellPos(31, 6)) }),
    Object.freeze({ id: 1, ...cellPos(38, 3), hatch: Object.freeze(cellPos(38, 6)) }),
]);

// Gudang W: "tebar banyak ammo dan medkit" — ruangan ini memang tempat mengisi
// ulang sebelum masuk hall, jadi keempat senjata dan beberapa medkit ada di sini.
export const SUPPLY_POINTS = Object.freeze([
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...cellPos(3, 38) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...cellPos(8, 38) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...cellPos(13, 38) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...cellPos(18, 38) }),
    Object.freeze({ type: 'ammo', weapon: 'rifle', ...cellPos(23, 38) }),
    Object.freeze({ type: 'ammo', weapon: 'shotgun', ...cellPos(6, 42) }),
    Object.freeze({ type: 'ammo', weapon: 'pistol', ...cellPos(16, 42) }),
    Object.freeze({ type: 'ammo', weapon: 'launcher', ...cellPos(26, 42) }),
    Object.freeze({ type: 'medkit', ...cellPos(11, 42) }),
    Object.freeze({ type: 'medkit', ...cellPos(21, 42) }),
    Object.freeze({ type: 'medkit', ...cellPos(26, 38) }),
]);
export const CRATE_POINTS = Object.freeze([
    Object.freeze({ area: 'hall', ...cellPos(10, 12) }),
    Object.freeze({ area: 'hall', ...cellPos(30, 21) }),
    Object.freeze({ area: 'hall', ...cellPos(19, 33) }),
    Object.freeze({ area: 'corridor', ...cellPos(46, 15) }),
    Object.freeze({ area: 'grid', ...cellPos(47, 38) }),
]);

// Titik spawn per encounter (kolom, baris) — semuanya di luar SA/W dan tidak
// menempel pilar, rak, generator, daun pintu maupun rangka mesin gudang.
export const ENCOUNTER_POINTS = Object.freeze({
    hall: Object.freeze([[8, 3], [20, 3], [26, 2], [12, 10], [28, 11], [38, 8],
        [2, 12], [18, 21], [30, 22], [8, 24], [38, 20], [12, 31], [26, 32], [36, 30],
        [20, 13], [6, 20]]),
    grid: Object.freeze([[33, 37], [36, 38], [42, 37], [46, 39], [31, 45],
        [36, 46], [41, 46], [45, 44], [47, 42], [30, 47]]),
    exfil: Object.freeze([[46, 30], [43, 24], [47, 18], [44, 12], [46, 6],
        [42, 3], [35, 1], [24, 1]]),
});

const DOOR_LAYOUT = Object.freeze([
    Object.freeze({ kind: 'safe', ...cellPos(3.5, 43), sx: CELL * 2, sz: 4 }),
    Object.freeze({ kind: 'hall', ...cellPos(3.5, 35), sx: CELL * 2, sz: 4 }),
    Object.freeze({ kind: 'grid', ...cellPos(44.5, 35), sx: CELL * 2, sz: 4.5 }),
    Object.freeze({ kind: 'chapter', ...cellPos(44.5, 0), sx: CELL * 4, sz: 4.5 }),
]);
// Pintu `-` membuka otomatis saat didekati; `@` hanya dibuka oleh alur.
const AUTO_DOORS = Object.freeze(['safe', 'hall']);
// Pintu `=` ruang generator: kunci dari rak hanya MEMBUKA GEMBOKNYA. Daunnya
// tetap tertutup dan baru bergeser saat player berdiri di depannya, persis pintu
// otomatis lain (permintaan user 2026-08-12 — dulu kunci langsung membuka
// pintunya dari seberang ruangan). Selama masih `locked`, targetnya tetap 0.
const KEYED_AUTO_DOORS = Object.freeze(['grid']);

export const S6_OCC = 'campaign-6';   // kunci set occluder (utility/occlusion.js)
let s6Walls = null;                   // dinding yang bisa memudar (wallFade.js)
export const s6WallsDbg = () => (s6Walls ? s6Walls.debug() : null);
let built = false, worldRoot = null, navGrid = null, staticBatch = [];
let wallDetailCount = 0, furnitureMeshCount = 0, rackDetailCount = 0;
const blockers = [], doors = [], propRecords = [], stageLights = [];
const sparkPool = [], rackVisuals = [], generatorVisuals = [], machines = [];
let finishMarker = null, cityscape = null;
const rackMarkers = [], repairMarkers = [];
let sparkT = 0;

export const worldGroup = () => worldRoot;
export const stage6Doors = () => doors;
export const stage6Lights = () => stageLights;
export const stage6Nav = () => navGrid;
export const stage6Machines = () => machines;

function mapCellAt(x, z) {
    const c = Math.floor((x - MAP_X0) / CELL), r = Math.floor((z - MAP_Z0) / CELL);
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return { c, r, token: '#' };
    return { c, r, token: S6_MAP[r][c] };
}
export { mapCellAt };

// Dinding, rak kunci dan generator memblok SEMUA entitas. Rak/generator adalah
// FURNITUR: solid untuk player dan robot, dan ikut dipanggang ke nav.
const SOLID_TOKENS = '#KG';
const openToken = token => !SOLID_TOKENS.includes(token);
const safeToken = token => token === 'A' || token === 'S';

function cornerCells(x, z, r) {
    const d = Math.max(0, r);
    return [mapCellAt(x - d, z - d), mapCellAt(x + d, z - d),
        mapCellAt(x - d, z + d), mapCellAt(x + d, z + d)];
}

export function touchesSafeArea(x, z, radius = 0) {
    return safeToken(mapCellAt(x, z).token) || cornerCells(x, z, radius).some(m => safeToken(m.token));
}

export function stage6Walk(x, z, radius = 0) {
    return cornerCells(x, z, radius).every(m => openToken(m.token));
}

// SA dan S tertutup untuk robot: itu janji "save area" pada legenda user.
export function robotWalk(x, z, radius = 0) {
    return cornerCells(x, z, radius).every(m => openToken(m.token) && !safeToken(m.token));
}

function addBlocker(x, z, hx, hz, top = WALL_H, standable = false) {
    const b = { x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(hx, hz), top, standable };
    blockers.push(b); return b;
}

function blockedAt(x, z, radius = 3.5) {
    for (const b of blockers)
        if (Math.abs(x - b.x) <= b.hx + radius && Math.abs(z - b.z) <= b.hz + radius) return true;
    return false;
}

export function resolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
    resolveCampaignDoors(doors, pos, radius);
}

export function groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); }

export function stage6SegHitsWall(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / (CELL * 0.3)));
    for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        // Rak dan generator setinggi badan: peluru berhenti di sana juga.
        if (SOLID_TOKENS.includes(mapCellAt(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k).token)) return true;
    }
    return false;
}

export function doorBlocksShot(x0, z0, x1, z1) {
    return sharedDoorBlocksShot(doors, x0, z0, x1, z1, 0);
}

export function doorsWalkable(x, z, radius = 0) {
    return sharedDoorsWalkable(doors, x, z, radius);
}

export function doorClampShot(b) {
    return sharedDoorClampShot(doors, b);
}

export const doorOf = kind => doors.find(d => d.kind === kind);

// ---------------------------------------------------------------------------
// Geometri
// ---------------------------------------------------------------------------

function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m); return m;
}

function cylinder(parent, mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function markerAt(p, color, ri = 6.5, ro = 8.5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42,
            side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.18, p.z); m.visible = false;
    worldRoot.add(m); return m;
}

// PENANGKAP PROP -> OCCLUDER (2026-08-13): tiap builder perabot memanggil
// `recordProp` TEPAT SEKALI di akhir, jadi mesh yang terkumpul sejak panggilan
// sebelumnya adalah isi prop itu. Ia dilas ke dalam grupnya sendiri lalu
// didaftarkan supaya bisa memudar saat menutupi player/robot.
let propCapture = null;
function recordProp(kind, p, hx = 0, hz = 0, top = 0, solid = false) {
    propRecords.push({ kind, x: p.x, z: p.z, hx, hz, top, solid });
    if (solid) addBlocker(p.x, p.z, hx, hz, top);
    if (propCapture && propCapture.length) {
        const g = new THREE.Group();
        for (const m of propCapture) g.add(m);
        weldOccluder(S6_OCC, worldRoot, g,
            { x: p.x, z: p.z, radius: (hx + hz) / 2 + 2, top });
        propCapture.length = 0;
    }
}

function addDoor(M, spec) {
    const rig = buildSplitDoor(worldRoot, M.body, spec.x, (WALL_H - 2) / 2, spec.z,
        spec.sx, WALL_H - 2, spec.sz);
    const lampMat = new THREE.MeshBasicMaterial({ color: DOOR_LOCKED_COLOR, toneMapped: false });
    const lamps = buildDoorSideLights(worldRoot, spec.x, spec.z,
        spec.sx, spec.sz, CELL, WALL_H, lampMat);
    const d = { kind: spec.kind, panel: rig.panel, rig, leaves: rig.leaves,
        lamps, open: 0, target: 0, cx: spec.x, cz: spec.z, ew: !rig.horizontal,
        hx: spec.sx / 2, hz: spec.sz / 2, cell: CELL, linger: 0,
        locked: !AUTO_DOORS.includes(spec.kind),
        blocker: { x: spec.x, z: spec.z, hx: spec.sx / 2, hz: spec.sz / 2,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(spec.sx, spec.sz) / 2,
            top: WALL_H, standable: false } };
    doors.push(d); return d;
}

// Rak kunci: unit rak 1x3 sel yang bersandar pada pilar. Isi raknya adalah
// peti-peti kecil; yang menyimpan kunci baru diketahui saat digeledah.
function buildRack(M, spec) {
    const g = new THREE.Group(); g.position.set(spec.x, 0, spec.z);
    const w = CELL - 2, len = CELL * 3 - 3;
    box(g, M.ink, w, 1.4, len, 0, 0.7, 0);
    for (const y of [5.5, 11.5, 17.5]) {
        box(g, M.steel, w, 0.9, len, 0, y, 0);
        box(g, M.white, w - 2.5, 0.55, 0.65, 0, y + 0.8, -len / 2 - 0.1);
        rackDetailCount++;
        for (let i = -1; i <= 1; i++)
            box(g, i % 2 ? M.body : M.panel, w - 4, 3.6, 9, 0, y + 2.6, i * 13.5);
    }
    for (const dz of [-len / 2 + 1, len / 2 - 1]) for (const dx of [-w / 2 + 1, w / 2 - 1])
        box(g, M.steel, 1.6, 21, 1.6, dx, 10.5, dz);
    for (const dz of [-len / 2 + 0.7, len / 2 - 0.7]) {
        const a = box(g, M.steel, w * 0.9, 0.7, 0.7, 0, 10.5, dz);
        const b = box(g, M.steel, w * 0.9, 0.7, 0.7, 0, 10.5, dz);
        a.rotation.z = 0.55; b.rotation.z = -0.55; rackDetailCount += 2;
    }
    const tag = box(g, M.amber, 0.7, 3, 7, -w / 2 - 0.5, 15, 0, false);
    worldRoot.add(g);
    registerOccluder(S6_OCC, g, { x: spec.x, z: spec.z, radius: (w + len) / 4 + 2, top: 21 });
    recordProp('key-rack', spec, w / 2, len / 2, 21, true);
    rackVisuals.push({ id: spec.id, group: g, tag });
    rackMarkers.push(markerAt(spec.stand, PAL.tech));
}

// Generator: blok 3x3 sel. Rotor terbuka berputar pelan saat mati dan cepat
// saat sudah dipulihkan, dengan strip status yang berganti warna.
function buildGenerator(M, spec) {
    const g = new THREE.Group(); g.position.set(spec.x, 0, spec.z);
    const s = CELL * 3 - 4;
    box(g, M.ink, s, 3, s, 0, 1.5, 0);
    box(g, M.body, s - 5, 11, s - 5, 0, 8, 0);
    const rotor = new THREE.Group(); rotor.position.set(0, 19, 0); g.add(rotor);
    cylinder(rotor, M.steel, 4.5, 4.5, s - 12, 14, 0, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const coil = box(rotor, i % 2 ? M.white : M.hazard, s - 14, 1.3, 2,
            0, Math.cos(a) * 6.5, Math.sin(a) * 6.5);
        coil.rotation.x = a;
    }
    for (const dx of [-s / 2 + 3, s / 2 - 3]) {
        box(g, M.steel, 2.2, 26, 2.2, dx, 13, -s / 2 + 3);
        box(g, M.steel, 2.2, 26, 2.2, dx, 13, s / 2 - 3);
    }
    const strip = box(g, M.hazard, s - 8, 1.3, 1, 0, 14.5, s / 2 - 2.6, false);
    box(g, M.ink, 11, 6, 5, 0, 3.5, s / 2 + 1.5);
    const screen = box(g, M.screen, 8, 4.2, 0.7, 0, 7, s / 2 + 4.2, false);
    worldRoot.add(g);
    registerOccluder(S6_OCC, g, { x: spec.x, z: spec.z, radius: s / 2 + 2, top: 26 });
    recordProp('generator', spec, s / 2, s / 2, 26, true);
    generatorVisuals.push({ id: spec.id, group: g, rotor, strip, screen });
    repairMarkers.push(markerAt(spec.stand, PAL.amber));
}

function buildSupplyRoomProps(M, add) {
    // Rak-rak logistik rendah: memberi bentuk pada gudang tanpa menutup drop.
    // Kolom 3-4 adalah lorong lurus antara kedua pintu `-`; rak logistik menjauh
    // dari sana supaya jalur masuk-keluar gudang tak pernah tersumbat.
    for (const [c, r] of [[8, 37], [16, 37], [24, 37], [8, 40], [16, 40], [24, 40]]) {
        const p = cellPos(c, r);
        const sx = CELL * 2.4;
        add(sx, 1.4, 8, p.x, 1.1, p.z, M.ink);
        for (const x of [-sx / 2 + 1.5, sx / 2 - 1.5]) for (const z of [-3, 3])
            add(1.4, 13, 1.4, p.x + x, 6.5, p.z + z, M.steel);
        for (const y of [3.2, 7.2, 11.2]) {
            add(sx, 1, 8, p.x, y, p.z, M.body);
            add(sx - 2, 0.65, 0.7, p.x, y + 0.8, p.z - 4.1, M.hazard);
        }
        for (let i = -2; i <= 2; i++)
            add(5, 2.6 + Math.abs(i % 2), 5.5, p.x + i * 5.6, 5, p.z,
                i % 2 ? M.panel : M.ink);
        recordProp('supply-shelf', p, CELL * 1.2, 3.5, 13.5, true);
    }
    const sp = cellPos(14, 39);
    add(CELL * 3, 0.5, CELL * 1.4, sp.x, 0.32, sp.z, M.tech);
}

function buildHallProps(M, add) {
    // Pita bahaya di kaki tiap klaster pilar 3x3 supaya kolom terbaca sebagai
    // struktur, bukan dinding acak. Pilar sendiri sudah jadi dinding CSV.
    for (const r of [7, 17, 27]) for (const c of [5, 15, 25, 35]) {
        if (S6_MAP[r][c] !== '#') continue;
        const p = cellPos(c, r);
        add(CELL * 3 + 1, 1.6, CELL * 3 + 1, p.x, 3.4, p.z, M.hazard);
        add(CELL * 3 + 1, 1.2, CELL * 3 + 1, p.x, WALL_H - 3.2, p.z, M.steel);
    }
    // Meja pemeriksaan kargo di lorong-lorong terbuka.
    for (const [c, r, rot] of [[9, 21, 0], [29, 12, 0], [19, 30, 1], [37, 24, 1]]) {
        const p = cellPos(c, r), sx = rot ? 10 : CELL * 2.6, sz = rot ? CELL * 2.6 : 10;
        add(sx, 1.6, sz, p.x, 5.2, p.z, M.body);
        add(sx - 3, 1, sz - 3, p.x, 5.2, p.z, M.tech);
        for (const x of [-sx / 2 + 2, sx / 2 - 2]) for (const z of [-sz / 2 + 2, sz / 2 - 2])
            add(1.6, 5, 1.6, p.x + x, 2.5, p.z + z, M.steel);
        const longX = sx >= sz;
        for (const d of [-0.28, 0.28])
            add(longX ? 1 : sx - 2, 3.5, longX ? sz - 2 : 1,
                p.x + (longX ? sx * d : 0), 8, p.z + (longX ? 0 : sz * d), M.hazard);
        add(longX ? sx - 4 : 1.2, 0.9, longX ? 1.2 : sz - 4,
            p.x, 9.8, p.z, M.white);
        recordProp('inspection-bench', p, sx / 2, sz / 2, 10.2, true);
    }
}

function buildGridHallProps(M, add) {
    // Konduit dan panel distribusi di ruang generator.
    for (const c of [31, 47]) {
        const p = cellPos(c, 39);
        add(6, 1.6, CELL * 7, p.x, 19, p.z, M.ink);
        add(4, 0.9, CELL * 7, p.x, 17.2, p.z, M.tech);
        for (let z = -CELL * 3; z <= CELL * 3; z += CELL)
            add(8, 1, 1.5, p.x, 18.1, p.z + z, M.steel);
    }
    for (const [c, r] of [[31, 37], [47, 46]]) {
        const p = cellPos(c, r);
        add(9, 15, CELL * 1.6, p.x, 7.5, p.z, M.body);
        add(0.8, 11, CELL * 1.2, p.x + 4.8, 8.5, p.z, M.screen);
        add(10.5, 1.3, CELL * 1.7, p.x, 15.7, p.z, M.steel);
        for (const z of [-7, -3.5, 0, 3.5, 7])
            add(0.9, 8, 1.4, p.x - 4.9, 8, p.z + z, z === 0 ? M.hazard : M.ink);
        recordProp('distribution-panel', p, 4.5, CELL * 0.8, 16.4, true);
    }
}

// Mesin pembuat robot gudang: rig hero bersama, corong lokal +z sudah menghadap
// hall (tanpa rotasi), jadi robot keluar ke arah player, bukan ke dinding utara.
function buildMachines() {
    for (const spec of MACHINE_POINTS) {
        const rig = buildSpawnMachineMesh(MACHINE_SIZE, 20, MACHINE_SIZE);
        rig.group.position.set(spec.x, 0, spec.z);
        worldRoot.add(rig.group);
        const half = MACHINE_SIZE / 2;
        registerOccluder(S6_OCC, rig.group,
            { x: spec.x, z: spec.z, radius: half + 2, top: 26 });
        recordProp('spawn-machine', spec, half, half, 20, true);
        machines.push({ id: spec.id, group: rig.group, rig, x: spec.x, z: spec.z,
            hatch: { x: spec.hatch.x, z: spec.hatch.z },
            hp: 0, alive: true, active: false, hitT: 0 });
    }
}

function buildSparks(M) {
    for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 2.4), M.spark);
        m.visible = false; worldRoot.add(m); sparkPool.push(m);
    }
}

function buildWorld() {
    worldRoot = new THREE.Group(); worldRoot.name = 'stage6-arrival';
    const M = {
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        floor: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        deck: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        tech: new THREE.MeshLambertMaterial({ color: PAL.techDim, emissive: PAL.tech,
            emissiveIntensity: EMISSIVE_MAX * 0.55 }),
        amber: new THREE.MeshLambertMaterial({ color: PAL.amberDim, emissive: PAL.amber,
            emissiveIntensity: EMISSIVE_MAX * 0.48 }),
        screen: new THREE.MeshLambertMaterial({ color: PAL.screenBg, emissive: PAL.techDim,
            emissiveIntensity: 0.28 }),
        spark: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    };
    const staticProps = [];
    const add = (sx, sy, sz, x, y, z, mat = M.concrete) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        (propCapture || staticProps).push(m); return m;
    };

    add(MAP_COLS * CELL, 1.5, MAP_ROWS * CELL, OX, -0.75, OZ, M.concrete);
    const addFloor = (c0, r0, c1, r1, mat) => {
        const a = cellPos(c0, r0), b = cellPos(c1, r1);
        add((c1 - c0 + 1) * CELL, 0.45, (r1 - r0 + 1) * CELL,
            (a.x + b.x) / 2, 0.05, (a.z + b.z) / 2, mat);
    };
    addFloor(1, 1, 48, 34, M.floor);      // hall + koridor layanan
    addFloor(1, 36, 28, 42, M.deck);      // gudang W
    addFloor(30, 36, 48, 48, M.deck);     // ruang generator
    addFloor(1, 44, 28, 49, M.panel);     // SAFE AREA

    wallDetailCount = 0; furnitureMeshCount = 0; rackDetailCount = 0;
    const isWall = (c, r) => c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS
        || S6_MAP[r][c] === '#';
    // DINDING BISA MEMUDAR (2026-08-14, permintaan user) — utility/wallFade.js.
    const s6WallCells = [];
    for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) {
        const t = S6_MAP[r][c];
        if (t !== '#') continue;
        const p = cellPos(c, r);
        s6WallCells.push({ c, r, x: p.x, z: p.z });
        addBlocker(p.x, p.z, CELL / 2, CELL / 2, WALL_H);
    }
    s6Walls = buildFadeableWalls({
        key: S6_OCC, parent: worldRoot, cells: s6WallCells,
        cell: CELL, wallH: WALL_H, bodyMat: M.body,
        detail: { isWall, panel: M.panel, steel: M.steel, ink: M.ink,
            accent: M.hazard, accentEvery: 13 },
    });
    wallDetailCount = s6Walls.details;

    const furnitureAdd = (...args) => { furnitureMeshCount++; return add(...args); };
    propCapture = [];
    buildSupplyRoomProps(M, furnitureAdd);
    buildHallProps(M, furnitureAdd);
    buildGridHallProps(M, furnitureAdd);
    for (const m of propCapture) staticProps.push(m);   // sisa tanpa recordProp
    propCapture = null;

    staticBatch = addMergedStatic(worldRoot, staticProps);

    for (const spec of RACK_POINTS) buildRack(M, spec);
    for (const spec of GENERATOR_POINTS) buildGenerator(M, spec);
    buildMachines();
    for (const spec of DOOR_LAYOUT) addDoor(M, spec);
    finishMarker = markerAt(S6_FINISH, PAL.tech, 9, 12);
    buildSparks(M);

    // Cincin kota Jakarta/Bandung yang sama dengan Stage 1-3 & Stage 5, DIINDUK
    // ke `worldRoot` (bukan `scene`) supaya ia ikut hidup-mati bersama chapter
    // ini dan tidak pernah bertumpuk dengan cincin kota chapter HQ di x≈216000.
    // MURNI DEKOR: tidak menambah blocker/nav/PointLight, jadi collision, BFS,
    // dan jumlah lampu stage tak berubah.
    cityscape = buildCampaignCityscape(OX, OZ, MAP_COLS * CELL / 2, MAP_ROWS * CELL / 2,
        { parent: worldRoot, groundY: CITY_GROUND_Y });

    // Jumlah lampu sengaja ditahan: kedua dunia chapter menyala BERSAMAAN di
    // bawah satu `lightsKey`, jadi totalnya (arrival + hq) yang menentukan biaya
    // shader — mematikannya per chapter akan memicu rekompilasi di tengah stage.
    const lampCells = [[20, 3], [8, 13], [32, 13], [8, 26], [32, 26], [20, 33],
        [45, 9], [45, 27], [14, 39], [39, 42]];
    for (const [c, r] of lampCells) {
        const p = cellPos(c, r);
        const L = new THREE.PointLight(r >= 36 ? PAL.amber : PAL.tech, 0.46, 150);
        L.position.set(p.x, 24, p.z); worldRoot.add(L);
        registerStageLight('campaign-6', L); stageLights.push(L);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6),
            new THREE.MeshBasicMaterial({ color: r >= 36 ? PAL.amber : PAL.tech, toneMapped: false }));
        bulb.position.copy(L.position); worldRoot.add(bulb);
    }

    navGrid = makeNavGrid(MAP_X0, MAP_Z0, CELL, MAP_COLS, MAP_ROWS,
        (x, z) => robotWalk(x, z, 4) && !blockedAt(x, z, 3.5));
}

export function ensureWorld(parent) {
    if (built) return worldRoot;
    built = true; buildWorld();
    if (parent) parent.add(worldRoot);
    // 2026-08-13 (optimasi): root chapter ini didaftarkan supaya chapter/stage
    // lain tak ikut ditelusuri renderer saat tak dimainkan.
    registerCampaignWorldRoot({
        key: 'campaign-6', root: worldRoot, lightsKey: 'campaign-6',
        bounds: { x0: MAP_X0 - 1500, x1: MAP_X0 + MAP_COLS * CELL + 1500,
            z0: MAP_Z0 - 1500, z1: MAP_Z0 + MAP_ROWS * CELL + 1500 },
        warmupViews: [{ x: OX, y: 0, z: OZ }],
    });
    return worldRoot;
}
export const worldBuilt = () => built;
export const stage6StaticBatchDbg = () => staticBatch;
export const stage6WorldRootDbg = () => worldRoot;   // smoke test (visibilitas root dunia)

// ---------------------------------------------------------------------------
// Animasi dunia
// ---------------------------------------------------------------------------

export function updateDoors(dt) {
    for (const d of doors) {
        updateDoorMotion(d, dt, d.target);
        setDoorSideLightState(d.lamps, !d.locked);
    }
}

export function updateAutoDoors(dt = 0) {
    for (const d of doors) {
        const auto = AUTO_DOORS.includes(d.kind)
            || (KEYED_AUTO_DOORS.includes(d.kind) && !d.locked);
        if (!auto) continue;
        d.target = doorProximityTarget(d, dt, camera.position.x, camera.position.z, CELL);
    }
}

export function setGeneratorOnline(id, on) {
    const g = generatorVisuals.find(v => v.id === id);
    if (!g) return;
    g.strip.material = g.strip.material.clone();
    g.strip.material.color.setHex(on ? PAL.tech : PAL.hazard);
    g.screen.material = g.screen.material.clone();
    g.screen.material.emissive.setHex(on ? PAL.tech : PAL.techDim);
    g.screen.material.emissiveIntensity = on ? 0.5 : 0.28;
}

export function updateMachinery(dt, online) {
    for (const g of generatorVisuals)
        g.rotor.rotation.x += dt * (online && online[g.id] ? 2.4 : 0.14);
}

// Mesin gudang: hidup sejak awal chapter (rangkanya memang berdiri di sana),
// menyala begitu garnisun hall bangun, dan meninggalkan BANGKAI hitam gosong —
// yang tetap terlihat, jadi tetap pejal.
export function armMachines(on) {
    for (const m of machines) if (m.alive) m.active = !!on;
}

export function killMachine(id) {
    const m = machines.find(x => x.id === id);
    if (!m || !m.alive) return;
    m.alive = false; m.active = false; m.hitT = 0;
    wreckSpawnMachine(m.rig);
}

export function updateMachineVisual(dt) {
    for (const m of machines) if (m.alive) updateSpawnMachine(m.rig, dt, m.active, m.hitT);
}

export function setMarkers(state) {
    for (let i = 0; i < rackMarkers.length; i++) rackMarkers[i].visible = !!(state.racks && state.racks[i]);
    for (let i = 0; i < repairMarkers.length; i++) repairMarkers[i].visible = !!(state.repairs && state.repairs[i]);
    if (finishMarker) finishMarker.visible = !!state.finish;
}

export function pulseMarkers(dt, t) {
    const list = [...rackMarkers, ...repairMarkers, finishMarker];
    for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m?.visible) {
            m.material.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(t * 4 + i));
            m.rotation.z += dt * 0.8;
        }
    }
}

export function activateSparks(center, sec = 2.5) {
    sparkT = Math.max(sparkT, sec);
    for (let i = 0; i < sparkPool.length; i++) {
        const s = sparkPool[i], a = i / sparkPool.length * Math.PI * 2;
        s.position.set(center.x + Math.sin(a) * rand(2, 11), rand(4, 19),
            center.z + Math.cos(a) * rand(2, 11));
        s.rotation.y = a; s.userData.vx = Math.sin(a) * rand(3, 10);
        s.userData.vy = rand(6, 15); s.userData.vz = Math.cos(a) * rand(3, 10);
        s.visible = true;
    }
}

export function updateSparks(dt) {
    if (sparkT <= 0) { for (const s of sparkPool) s.visible = false; return; }
    sparkT = Math.max(0, sparkT - dt);
    for (const s of sparkPool) {
        s.position.x += (s.userData.vx || 0) * dt;
        s.position.y += (s.userData.vy || 0) * dt;
        s.position.z += (s.userData.vz || 0) * dt;
        s.userData.vy = (s.userData.vy || 0) - dt * 30;
        s.rotation.x += dt * 8;
        if (s.position.y < 0.3) s.visible = false;
    }
}

export function setRackSearched(id, hasKey) {
    const v = rackVisuals.find(x => x.id === id);
    if (!v) return;
    v.tag.material = v.tag.material.clone();
    v.tag.material.color.setHex(hasKey ? PAL.tech : PAL.steel);
    v.tag.material.emissive.setHex(hasKey ? PAL.tech : PAL.steel);
    v.tag.material.emissiveIntensity = hasKey ? EMISSIVE_MAX * 0.6 : 0.1;
}

export function updateArrivalOccluders(dt) { updateStageOccluders(S6_OCC, dt); }
export const stage6OcclusionDebug = () => occlusionDebug(S6_OCC);

export function resetWorldVisuals() {
    resetStageOccluders(S6_OCC);
    for (const d of doors) {
        d.open = 0; d.target = 0; d.linger = 0;
        d.locked = !AUTO_DOORS.includes(d.kind);
        updateDoorMotion(d, 0, 0);
        setDoorSideLightState(d.lamps, !d.locked);
    }
    for (const v of rackVisuals) setRackSearched(v.id, false);
    for (const g of generatorVisuals) setGeneratorOnline(g.id, false);
    for (const m of machines) {
        m.alive = true; m.active = false; m.hp = spawnMachineHp(); m.hitT = 0;
        resetSpawnMachine(m.rig, false);
    }
    setMarkers({});
    sparkT = 0;
    for (const s of sparkPool) s.visible = false;
    for (const L of stageLights) { L.color.setHex(PAL.tech); L.intensity = 0.46; }
}

export const stage6WorldDebug = () => ({
    occluders: occlusionDebug(S6_OCC),
    built,
    map: { rows: MAP_ROWS, cols: MAP_COLS, cell: CELL, x0: MAP_X0, z0: MAP_Z0,
        walls: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === '#').length, 0),
        safe: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'A' || t === 'S').length, 0),
        supply: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'W').length, 0),
        racks: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'K').length, 0),
        generators: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'G').length, 0),
        repairs: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'H').length, 0),
        // Sel `I` peta beku user; sejak 2026-08-12 tak ada prop apa pun di sana.
        infoCells: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'I').length, 0),
        finish: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === 'F').length, 0),
        autoDoors: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === '-').length, 0),
        lockedDoors: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === '=').length, 0),
        chapterDoors: S6_MAP.reduce((n, row) => n + [...row].filter(t => t === '@').length, 0) },
    start: { ...S6_START }, finish: { ...S6_FINISH },
    racks: RACK_POINTS.map(p => ({ ...p, stand: { ...p.stand } })),
    generators: GENERATOR_POINTS.map(p => ({ ...p, stand: { ...p.stand } })),
    machinePoints: MACHINE_POINTS.map(p => ({ ...p, hatch: { ...p.hatch } })),
    machines: machines.map(m => ({ id: m.id, alive: m.alive, active: m.active,
        hp: m.hp, x: m.x, z: m.z, visible: !!m.group.visible,
        rig: spawnMachineDebug(m.rig) })),
    blockers: blockers.length, props: propRecords.map(p => ({ ...p })),
    propKinds: [...new Set(propRecords.map(p => p.kind))],
    doors: doors.map(d => ({ kind: d.kind, open: d.open, target: d.target,
        locked: d.locked, canOpen: !d.locked, x: d.blocker.x, z: d.blocker.z,
        lamps: d.lamps.map(l => ({ x: l.position.x, y: l.position.y, z: l.position.z,
            color: l.material.color.getHex() })),
        split: splitDoorDebug(d.rig) })),
    markers: { racks: rackMarkers.map(m => m.visible), repairs: repairMarkers.map(m => m.visible),
        finish: !!finishMarker?.visible },
    pools: { sparks: sparkPool.length },
    visiblePools: { sparks: sparkPool.filter(s => s.visible).length },
    lights: stageLights.length, nav: !!navGrid, staticBatches: staticBatch.length,
    architecture: { wallDetails: wallDetailCount },
    furniture: { meshes: furnitureMeshCount, rackDetails: rackDetailCount },
    supplies: SUPPLY_POINTS.map(p => ({ ...p })), crates: CRATE_POINTS.map(p => ({ ...p })),
    city: cityscape && { groundY: cityscape.groundY, buildings: cityscape.buildings,
        trees: cityscape.trees, parented: cityscape.root === worldRoot },
});
