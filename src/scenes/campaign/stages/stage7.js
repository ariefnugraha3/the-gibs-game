// Campaign Stage 7 — BANDUNG LOCKDOWN.
// Gerbang Bandung HQ -> tiga pilihan distrik -> junction -> underpass/flyover
// -> pertahanan Gerbang Tol Cisumdawu -> GARUDA LTV-45 menuju Kertajati.

import { CFG } from '../../../core/config.js';
import { player, robots, keys, setCinematicActive } from '../../../core/state.js';
import {
    scene, camera, setCineFocus, CAM_OFF_DEFAULT, addCamShake, SCREEN_UP,
} from '../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../core/dom.js';
import { updateUI } from '../../../core/hud.js';
import { releaseInputs } from '../../../core/input.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { avatarGroup, setAvatarRadioPose } from '../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../entities/robots.js';
import {
    spawnCampaignRobot, campaignAwardKill, campaignRobotAI, campaignClampRobot,
    countStageRobots,
} from '../utility/common.js';
import { campaignJumpToStage } from '../utility/transition.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { gameOver } from '../../../core/game.js';
import { stage1Scene } from './stage1.js';
import { applyLightPreset, registerStageLight } from '../../../world/lighting.js';
import { enterCityEnv } from '../utility/cityscape.js';
import { PAL, EMISSIVE_MAX } from '../../../world/palette.js';
import { addMergedStatic, mergeObjectInPlace } from '../../../utils/meshBatch.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { makeTexture } from '../../../utils/textures.js';
import { rand } from '../../../utils/math.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../entities/drops.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../entities/crates.js';
import { spawnBarrel, resetBarrels, resolveBarrelBlock } from '../../../entities/barrels.js';
import { FuturisticSUV } from '../../../entities/futuristicSUV.js';
import {
    buildTacticalVehicleMesh, resetTacticalVehicleVisual,
    updateTacticalVehicleVisual, tacticalVehicleDebug as vehicleDebug,
} from '../../../entities/tacticalVehicle.js';
import { sfxTankMove, playLoopSFX, stopLoopSFX } from '../../../utils/sfx.js';

const OX = 240000, OZ = 0;
const MAP_COLS = 118, MAP_ROWS = 72, CELL = 14, BUILDING_H = 34;
const MAP_X0 = OX - MAP_COLS * CELL / 2;
const MAP_Z0 = OZ - MAP_ROWS * CELL / 2;
const cellPos = (c, r) => ({ x: MAP_X0 + (c + 0.5) * CELL, z: MAP_Z0 + (r + 0.5) * CELL });

const ROAD_RECTS = Object.freeze([
    [1, 33, 21, 39, 'avenue'], [22, 29, 28, 43, 'fork-one'],
    [29, 33, 66, 39, 'boulevard'],
    [25, 13, 31, 28, 'market-rise'], [28, 13, 56, 19, 'market'], [53, 19, 59, 32, 'market-link'],
    [25, 42, 31, 60, 'residential-rise'], [28, 54, 56, 60, 'residential'], [53, 40, 59, 54, 'residential-link'],
    [58, 27, 70, 49, 'junction'],
    [66, 12, 74, 27, 'flyover-rise'], [70, 12, 100, 20, 'flyover'], [97, 20, 105, 32, 'flyover-link'],
    [66, 49, 74, 61, 'underpass-drop'], [70, 53, 100, 61, 'underpass'], [97, 40, 105, 53, 'underpass-link'],
    [102, 28, 116, 45, 'toll'],
]);

function makeMap() {
    const a = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill('#'));
    for (const [c0, r0, c1, r1] of ROAD_RECTS)
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) a[r][c] = '.';
    a[36][4] = 'S';
    a[36][25] = 'F'; a[36][64] = 'J'; a[36][69] = 'G';
    a[36][108] = 'T'; a[36][111] = 'V';
    return Object.freeze(a.map(row => row.join('')));
}

export const S7_MAP = makeMap();
export const S7_LEGEND = Object.freeze({
    '#': 'blocked-city', '.': 'road', S: 'start', F: 'fork-one', J: 'junction',
    G: 'fork-two', T: 'toll-defense', V: 'tactical-vehicle',
});

export const S7_START = Object.freeze(cellPos(4, 36));
export const S7_FORK_ONE = Object.freeze(cellPos(25, 36));
export const S7_ROUTE_ONE = Object.freeze({
    boulevard: Object.freeze(cellPos(30, 36)),
    market: Object.freeze(cellPos(28, 27)),
    residential: Object.freeze(cellPos(28, 44)),
});
export const S7_JUNCTION = Object.freeze(cellPos(64, 36));
export const S7_FORK_TWO = Object.freeze(cellPos(69, 36));
export const S7_ROUTE_TWO = Object.freeze({
    flyover: Object.freeze(cellPos(69, 26)),
    underpass: Object.freeze(cellPos(69, 50)),
});
export const S7_TOLL = Object.freeze(cellPos(106, 36));
export const S7_VEHICLE = Object.freeze(cellPos(109, 36));
const VEHICLE_OBJECT = Object.freeze(cellPos(112, 36));

export const STAGE7_DIALOGUE = Object.freeze({
    openingCommand: Object.freeze({ speaker: 'Command', text: 'Major, the trace has compromised every route around Headquarters. You need to get clear of Bandung before they surround you.' }),
    openingGibran: Object.freeze({ speaker: 'Major Gibran', text: 'Then I’ll cut through the city and find something with wheels.' }),
    routeChoice: Object.freeze({ speaker: 'Major Gibran', text: 'The main roads are blocked. I’ll have to choose a route through the city.' }),
    junctionCommand: Object.freeze({ speaker: 'Command', text: 'Enemy units are converging on the Cisumdawu entrance.' }),
    junctionGibran: Object.freeze({ speaker: 'Major Gibran', text: 'Then I’m close. Keep the route to Kertajati ready.' }),
    tollSight: Object.freeze({ speaker: 'Major Gibran', text: 'There it is—the Cisumdawu toll gate. And of course they got here first.' }),
    vehicleFind: Object.freeze({ speaker: 'Major Gibran', text: 'An armored tactical vehicle... Engine’s intact, fuel cells are still charged.' }),
    routeCommand: Object.freeze({ speaker: 'Command', text: 'The Cisumdawu corridor leads toward Kertajati. That vehicle may be your only chance of reaching the airfield.' }),
    routeReply: Object.freeze({ speaker: 'Major Gibran', text: 'Then that’s my route. I’m taking Cisumdawu to Kertajati.' }),
    warningCommand: Object.freeze({ speaker: 'Command', text: 'Understood. Move fast, Major. Enemy forces are already converging on the toll road.' }),
    finalGibran: Object.freeze({ speaker: 'Major Gibran', text: 'Let them come. Tell Kertajati I’m on my way.' }),
});

const ENCOUNTER_POINTS = Object.freeze({
    hqEscape: Object.freeze([[9, 35], [12, 38], [15, 34], [18, 38], [20, 35], [11, 34], [16, 37], [19, 34]]),
    boulevard: Object.freeze([[34, 34], [38, 38], [42, 35], [46, 38], [50, 34], [54, 38], [36, 36], [44, 36], [52, 36], [56, 35]]),
    market: Object.freeze([[29, 17], [33, 14], [37, 18], [41, 14], [45, 18], [49, 14], [53, 18], [55, 23], [56, 27], [54, 30], [47, 17]]),
    residential: Object.freeze([[29, 56], [34, 59], [39, 55], [44, 59], [49, 55], [54, 59], [56, 51], [55, 44]]),
    junction: Object.freeze([[60, 30], [64, 32], [68, 29], [60, 42], [65, 46], [69, 42], [62, 37], [68, 37]]),
    flyover: Object.freeze([[69, 20], [73, 15], [78, 18], [83, 14], [88, 18], [93, 14], [98, 18], [100, 24], [102, 29]]),
    underpass: Object.freeze([[69, 55], [74, 59], [79, 54], [84, 59], [89, 54], [94, 59], [99, 55], [101, 49], [102, 44], [96, 57]]),
    tollWave1: Object.freeze([[104, 30], [107, 32], [110, 30], [104, 41], [108, 43], [112, 41]]),
    tollWave2: Object.freeze([[103, 29], [106, 44], [111, 29], [114, 33], [114, 41], [109, 39]]),
    tollWave3: Object.freeze([[104, 34], [107, 42], [111, 31], [115, 35], [114, 43]]),
});

const COMMON_SUPPLIES = Object.freeze([
    { type: 'ammo', weapon: 'pistol', ...cellPos(6, 34) },
    { type: 'ammo', weapon: 'rifle', ...cellPos(20, 38) },
    { type: 'medkit', ...cellPos(7, 39) },
]);
const ROUTE_SUPPLIES = Object.freeze({
    boulevard: Object.freeze([
        { type: 'ammo', weapon: 'rifle', ...cellPos(39, 34) },
        { type: 'ammo', weapon: 'launcher', ...cellPos(53, 38) },
    ]),
    market: Object.freeze([{ type: 'ammo', weapon: 'shotgun', ...cellPos(43, 17) }]),
    residential: Object.freeze([{ type: 'medkit', ...cellPos(44, 57) }]),
    underpass: Object.freeze([{ type: 'ammo', weapon: 'shotgun', ...cellPos(86, 57) }]),
    flyover: Object.freeze([
        { type: 'ammo', weapon: 'rifle', ...cellPos(82, 15) },
        { type: 'ammo', weapon: 'launcher', ...cellPos(96, 18) },
    ]),
});
const COMMON_CRATES = Object.freeze([
    { area: 'hq', ...cellPos(8, 38) }, { area: 'hq', ...cellPos(19, 34) },
    { area: 'junction', ...cellPos(62, 46) },
    { area: 'toll', ...cellPos(104, 43) }, { area: 'toll', ...cellPos(114, 30) },
]);
const ROUTE_CRATES = Object.freeze({
    boulevard: Object.freeze([{ area: 'boulevard', ...cellPos(48, 34) }]),
    market: Object.freeze([
        { area: 'market', ...cellPos(31, 15) }, { area: 'market', ...cellPos(38, 18) },
        { area: 'market', ...cellPos(47, 14) }, { area: 'market', ...cellPos(55, 28) },
    ]),
    residential: Object.freeze([
        { area: 'residential', ...cellPos(35, 58) }, { area: 'residential', ...cellPos(52, 55) },
    ]),
    underpass: Object.freeze([
        { area: 'underpass', ...cellPos(77, 58) }, { area: 'underpass', ...cellPos(96, 54) },
    ]),
    flyover: Object.freeze([{ area: 'flyover', ...cellPos(90, 18) }]),
});

let built = false, worldRoot = null, navGrid = null, staticBatch = [];
const blockers = [], routeGates = [], propRecords = [], stageLights = [], occluders = [];
const rainPool = [], ripplePool = [], sparkPool = [], exhaustPool = [];
const markers = {};
let tacticalVehicle = null, tollBarrier = null, exhaustCursor = 0;

let phase = 'opening', routeOne = null, routeTwo = null, complete = false;
let routeOneSpawned = false, routeTwoSpawned = false, junctionSpawned = false;
let tollT = 0, tollWave = 0, stageElapsed = 0, barrierBroken = false;
let cine = null, vehicleLoop = null;
const cineCam = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };

let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function mapCellAt(x, z) {
    const c = Math.floor((x - MAP_X0) / CELL), r = Math.floor((z - MAP_Z0) / CELL);
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return { c, r, token: '#' };
    return { c, r, token: S7_MAP[r][c] };
}
const openToken = token => token !== '#';

export function stage7Walk(x, z, radius = 0) {
    const d = Math.max(0, radius);
    return openToken(mapCellAt(x - d, z - d).token)
        && openToken(mapCellAt(x + d, z - d).token)
        && openToken(mapCellAt(x - d, z + d).token)
        && openToken(mapCellAt(x + d, z + d).token);
}

function addBlocker(x, z, hx, hz, top = BUILDING_H, standable = false) {
    const b = { x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(hx, hz), top, standable };
    blockers.push(b); return b;
}
function blockedAt(x, z, radius = 3.5) {
    return blockers.some(b => Math.abs(x - b.x) <= b.hx + radius && Math.abs(z - b.z) <= b.hz + radius);
}
function gateSolid(g) { return g.k > 0.42; }
function resolveGates(pos, radius) {
    for (const g of routeGates) if (gateSolid(g)) resolveBlockers(pos, radius, 0, [g.blocker]);
}
export function resolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers); resolveGates(pos, radius);
}

function segHitsRect(x0, z0, x1, z1, b) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / 5));
    for (let i = 0; i <= steps; i++) {
        const k = i / steps, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        if (Math.abs(x - b.x) <= b.hx && Math.abs(z - b.z) <= b.hz) return true;
    }
    return false;
}
export function stage7SegHitsWall(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / (CELL * 0.3)));
    for (let i = 1; i <= steps; i++) {
        const k = i / steps, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        if (mapCellAt(x, z).token === '#' || blockers.some(b => segHitsRect(x0, z0, x, z, b))) return true;
    }
    return false;
}
function gateBlocksShot(x0, z0, x1, z1) {
    return routeGates.some(g => gateSolid(g) && segHitsRect(x0, z0, x1, z1, g.blocker));
}

function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; parent.add(m); return m;
}
function cylinder(parent, mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function signTexture(text, sub = '') {
    return makeTexture(512, 144, (g, w, h) => {
        g.fillStyle = '#141510'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#bd8b42'; g.lineWidth = 7; g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = '#f0dfbc'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 34px monospace'; g.fillText(text, w / 2, sub ? 50 : h / 2);
        if (sub) { g.fillStyle = '#c89445'; g.font = '20px monospace'; g.fillText(sub, w / 2, 101); }
    });
}

function markerAt(name, p, color = PAL.amber) {
    const m = new THREE.Mesh(new THREE.RingGeometry(6.5, 8.7, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.44,
            side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.2, p.z); m.visible = false;
    worldRoot.add(m); markers[name] = m; return m;
}

function recordProp(kind, p, hx = 0, hz = 0, top = 0, solid = false) {
    propRecords.push({ kind, x: p.x, z: p.z, hx, hz, top, solid });
    if (solid) addBlocker(p.x, p.z, hx, hz, top);
}

function registerOccluder(obj, radius, top) {
    const items = [], seen = new Set();
    obj.traverse(m => {
        if (!m.material) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) if (!seen.has(mat)) {
            seen.add(mat); items.push({ mat, baseOp: mat.opacity == null ? 1 : mat.opacity,
                baseTr: !!mat.transparent });
        }
    });
    occluders.push({ x: obj.position.x, z: obj.position.z, radius, top, f: 1, items });
}

function updateOccluders(dt) {
    const ux = -SCREEN_UP.x, uz = -SCREEN_UP.z, vx = SCREEN_UP.z, vz = -SCREEN_UP.x;
    const hits = (o, ex, ez) => {
        const dx = o.x - ex, dz = o.z - ez, along = dx * ux + dz * uz;
        return along >= 3 && o.top >= (7 + 1.09 * along) - 14
            && Math.abs(dx * vx + dz * vz) < o.radius + 12;
    };
    for (const o of occluders) {
        let occ = hits(o, camera.position.x, camera.position.z);
        if (!occ) for (const z of robots) {
            if (z.stage !== 7 || Math.abs(z.mesh.position.x - camera.position.x) > 320
                || Math.abs(z.mesh.position.z - camera.position.z) > 320) continue;
            if (hits(o, z.mesh.position.x, z.mesh.position.z)) { occ = true; break; }
        }
        o.f += ((occ ? 0.45 : 1) - o.f) * Math.min(1, dt * 9);
        const faded = o.f < 0.985;
        for (const it of o.items) { it.mat.opacity = it.baseOp * o.f; it.mat.transparent = it.baseTr || faded; }
    }
}

function addRouteGate(name, p, hx, hz, role, route) {
    const group = new THREE.Group(); group.position.set(p.x, 0, p.z); worldRoot.add(group);
    const mat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const lamp = new THREE.MeshLambertMaterial({ color: PAL.hazard, emissive: PAL.hazard,
        emissiveIntensity: EMISSIVE_MAX * 0.6 });
    const alongX = hx > hz, span = (alongX ? hx : hz) * 2;
    const posts = [];
    for (let s = -span / 2 + 7; s <= span / 2 - 7; s += 14) {
        const post = cylinder(group, mat, 2.1, 2.5, 10, 8, alongX ? s : 0, -4, alongX ? 0 : s);
        cylinder(post, lamp, 1.35, 1.35, 0.6, 8, 0, 5.1, 0);
        posts.push(post);
    }
    const g = { name, role, route, group, posts, k: role === 'exit' ? 1 : 0,
        target: role === 'exit' ? 1 : 0,
        blocker: { x: p.x, z: p.z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(hx, hz), top: 10, standable: false } };
    routeGates.push(g); return g;
}
const gate = name => routeGates.find(g => g.name === name);

function updateRouteGates(dt) {
    const sec = Math.max(0.05, CFG.campaign.stage7.routeSealSec);
    for (const g of routeGates) {
        const dir = g.target > g.k ? 1 : -1;
        g.k = Math.max(0, Math.min(1, g.k + dir * dt / sec));
        const e = g.k * g.k * (3 - 2 * g.k);
        for (const p of g.posts) p.position.y = -4 + e * 7;
    }
}

function buildDistrictFacade(M, add, c, r, wCells, dCells, h, kind) {
    const p = cellPos(c, r), w = wCells * CELL, d = dCells * CELL;
    add(w, h, d, p.x, h / 2, p.z, kind === 'residential' ? M.warmWall : M.body);
    add(w * 0.82, 2, d + 0.8, p.x, h * 0.72, p.z, M.panel);
    for (let x = -w * 0.35; x <= w * 0.35; x += 15)
        add(5, 7, 0.8, p.x + x, Math.min(h - 6, 12), p.z + d / 2 + 0.5, M.glass);
    recordProp(kind, p, w / 2, d / 2, h, false);
}

function buildOccluderFacade(M, c, r, w, d, h) {
    const p = cellPos(c, r), g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const body = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const trim = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const glass = new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true, opacity: 0.68 });
    box(g, body, w, h, d, 0, h / 2, 0);
    box(g, trim, w * 0.88, 2, d + 0.7, 0, h * 0.72, 0);
    for (let x = -w * 0.32; x <= w * 0.32; x += 16) box(g, glass, 6, 8, 0.8, x, 12, d / 2 + 0.5);
    worldRoot.add(g); registerOccluder(g, Math.hypot(w, d) / 2, h); recordProp('occluder-facade', p, w / 2, d / 2, h, false);
}

function buildStreetProps(M, add) {
    // Bandung Art Deco / ruko / residential silhouettes around the playable roads.
    for (const [c, r, w, d, h, kind] of [
        [10, 26, 5, 5, 52, 'art-deco'], [18, 47, 5, 4, 44, 'ruko'],
        [39, 27, 6, 4, 58, 'art-deco'], [47, 46, 5, 4, 46, 'ruko'],
        [38, 6, 5, 4, 35, 'market-block'], [47, 66, 5, 4, 28, 'residential'],
        [80, 6, 6, 4, 55, 'commercial'], [86, 67, 6, 4, 36, 'industrial'],
    ]) buildDistrictFacade(M, add, c, r, w, d, h, kind);
    buildOccluderFacade(M, 16, 45, 58, 48, 49);
    buildOccluderFacade(M, 46, 44, 55, 44, 45);
    buildOccluderFacade(M, 76, 47, 62, 42, 52);

    // Market stalls: solid edge cover, leaving the central corridor connected.
    for (const [c, r] of [[33, 14], [37, 18], [42, 14], [47, 18], [52, 14]]) {
        const p = cellPos(c, r);
        add(13, 4, 8, p.x, 2, p.z, M.wood); add(15, 1, 10, p.x, 8, p.z, M.hazard);
        recordProp('market-stall', p, 6.5, 4, 9, true);
    }
    // Bus stops and street furniture.
    for (const [c, r] of [[14, 34], [43, 38], [83, 18], [92, 57]]) {
        const p = cellPos(c, r);
        add(18, 1.2, 7, p.x, 12, p.z, M.steel);
        for (const dx of [-8, 8]) add(1, 12, 1, p.x + dx, 6, p.z, M.steel);
        add(14, 2, 5, p.x, 2, p.z, M.body);
        recordProp('bus-stop', p, 9, 3.5, 13, true);
    }
    // Generic abandoned angkot/minibuses; intentionally no branding.
    for (const [c, r, yaw] of [[35, 37, 0.08], [65, 30, -0.18], [104, 33, 0.12]]) {
        const p = cellPos(c, r), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = yaw;
        box(g, M.body, 26, 8, 12, 0, 5, 0); box(g, M.glass, 17, 5, 12.3, -2, 10, 0);
        for (const x of [-8, 8]) for (const z of [-6, 6])
            cylinder(g, M.ink, 3, 3, 2, 10, x, 3, z, Math.PI / 2);
        worldRoot.add(g); recordProp('abandoned-minibus', p, 14, 7, 13, true);
    }
    // Two civilian SUVs as cover, welded within each object but still fadeable.
    for (const [c, r, yaw] of [[61, 45, 0.3], [99, 25, -0.25]]) {
        const p = cellPos(c, r), raw = new FuturisticSUV({ scale: 7, bodyColor: PAL.panel }).group;
        raw.position.set(p.x, 0, p.z); raw.rotation.y = yaw;
        const suv = mergeObjectInPlace(raw); worldRoot.add(suv); registerOccluder(suv, 18, 16);
        recordProp('abandoned-suv', p, 13, 19, 15, true);
    }
}

function buildUnderpassAndFlyover(M, add) {
    // Underpass ribs and cable trays. The roof is an occluder so entities remain visible.
    const roofP = cellPos(85, 57), roof = new THREE.Group(); roof.position.set(roofP.x, 0, roofP.z);
    const roofMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    box(roof, roofMat, 31 * CELL, 4, 9 * CELL, 0, 27, 0);
    for (let x = -14 * CELL; x <= 14 * CELL; x += 4 * CELL)
        for (const z of [-4 * CELL, 4 * CELL]) box(roof, roofMat, 4, 27, 4, x, 13.5, z);
    worldRoot.add(roof); registerOccluder(roof, 31 * CELL / 2, 31); recordProp('underpass', roofP, 31 * CELL / 2, 9 * CELL / 2, 31, false);
    for (const [c, r] of [[76, 54], [84, 60], [93, 54]]) {
        const p = cellPos(c, r); add(30, 1, 1, p.x, 20, p.z, M.tech);
        add(30, 2, 2, p.x, 23, p.z, M.steel);
    }
    // Flyover guardrails and repeating expansion joints; gameplay remains planar.
    for (let c = 71; c <= 99; c += 3) {
        const p = cellPos(c, 16);
        add(2, 1, 8 * CELL, p.x, 0.7, p.z, M.steel);
    }
    for (const r of [12, 20]) {
        const p = cellPos(85, r); add(31 * CELL, 5, 3, p.x, 3, p.z, M.concrete);
    }
}

function buildToll(M, add) {
    // Booths are blockers but leave multiple driving/fighting lanes open.
    for (const r of [30, 36, 42]) {
        const p = cellPos(108, r);
        add(15, 12, 20, p.x, 6, p.z, M.body); add(12, 7, 20.5, p.x, 12, p.z, M.glass);
        add(18, 2, 23, p.x, 17, p.z, M.hazard);
        recordProp('toll-booth', p, 7.5, 10, 18, true);
    }
    const canopyP = cellPos(109, 36), canopy = new THREE.Group(); canopy.position.set(canopyP.x, 0, canopyP.z);
    const cm = new THREE.MeshLambertMaterial({ color: PAL.panel });
    box(canopy, cm, 13 * CELL, 4, 18 * CELL, 0, 26, 0);
    for (const x of [-5 * CELL, 5 * CELL]) for (const z of [-7 * CELL, 7 * CELL])
        box(canopy, cm, 3, 26, 3, x, 13, z);
    worldRoot.add(canopy); registerOccluder(canopy, 13 * CELL / 2, 30); recordProp('toll-canopy', canopyP, 13 * CELL / 2, 9 * CELL, 30, false);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(112, 18, 1.2),
        new THREE.MeshBasicMaterial({ color: PAL.white,
            map: signTexture('CISUMDAWU TOLL GATE', 'KERTAJATI AIRPORT ROUTE'), toneMapped: false }));
    sign.position.set(cellPos(103, 28).x, 35, cellPos(103, 28).z); worldRoot.add(sign);

    // Palang yang dihantam pada shot terakhir.
    tollBarrier = new THREE.Group(); tollBarrier.position.set(cellPos(115, 36).x, 0, cellPos(115, 36).z); worldRoot.add(tollBarrier);
    box(tollBarrier, M.steel, 2, 8, 2, 0, 4, 0);
    const armPivot = new THREE.Group(); armPivot.position.set(0, 8, 0); tollBarrier.add(armPivot);
    box(armPivot, M.hazard, 42, 1.6, 1.6, 20, 0, 0);
    tollBarrier.userData.arm = armPivot;

    tacticalVehicle = buildTacticalVehicleMesh(7, PAL.gunmetal);
    tacticalVehicle.group.position.set(VEHICLE_OBJECT.x, 0, VEHICLE_OBJECT.z);
    tacticalVehicle.group.rotation.y = 0; tacticalVehicle.baseY = 0;
    worldRoot.add(tacticalVehicle.group);
    recordProp('garuda-ltv-45', VEHICLE_OBJECT, 21, 11, 19, true);
}

function buildFxPools(M) {
    for (let i = 0; i < 96; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 10, 0.16), M.rain);
        m.position.set(S7_START.x + rand(-190, 190), rand(4, 62), S7_START.z + rand(-160, 160));
        worldRoot.add(m); rainPool.push(m);
    }
    const rippleMat = new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true,
        opacity: 0.18, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 24; i++) {
        const r = ROAD_RECTS[i % ROAD_RECTS.length], p = cellPos((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
        const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 16), rippleMat);
        m.rotation.x = -Math.PI / 2; m.position.set(p.x + rand(-28, 28), 0.12, p.z + rand(-20, 20));
        m.userData.phase = i / 24; worldRoot.add(m); ripplePool.push(m);
    }
    for (let i = 0; i < 20; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.2), M.spark);
        m.visible = false; worldRoot.add(m); sparkPool.push(m);
    }
    for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), M.dust);
        m.visible = false; m.userData.life = 0; worldRoot.add(m); exhaustPool.push(m);
    }
}

function buildWorld() {
    worldRoot = new THREE.Group(); scene.add(worldRoot);
    const M = {
        ground: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        road: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        wet: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        warmWall: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        tech: new THREE.MeshLambertMaterial({ color: PAL.techDim, emissive: PAL.tech,
            emissiveIntensity: EMISSIVE_MAX * 0.48 }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true, opacity: 0.66 }),
        rain: new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true, opacity: 0.34,
            toneMapped: false, depthWrite: false }),
        spark: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
        dust: new THREE.MeshLambertMaterial({ color: PAL.concrete, transparent: true, opacity: 0.45 }),
    };
    const staticProps = [];
    const add = (sx, sy, sz, x, y, z, mat = M.concrete) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        staticProps.push(m); return m;
    };
    add(MAP_COLS * CELL, 1.5, MAP_ROWS * CELL, OX, -0.8, OZ, M.ground);
    for (const [c0, r0, c1, r1, kind] of ROAD_RECTS) {
        const a = cellPos(c0, r0), b = cellPos(c1, r1);
        add((c1 - c0 + 1) * CELL, 0.55, (r1 - r0 + 1) * CELL,
            (a.x + b.x) / 2, -0.12, (a.z + b.z) / 2,
            kind === 'underpass' || kind === 'underpass-drop' || kind === 'underpass-link' ? M.wet : M.road);
    }
    // Lane markings communicate route flow without compass text.
    for (let c = 3; c <= 114; c += 4) {
        const p = cellPos(c, 36);
        if (stage7Walk(p.x, p.z, 1)) add(20, 0.12, 0.8, p.x, 0.18, p.z, M.white);
    }

    buildStreetProps(M, add); buildUnderpassAndFlyover(M, add); buildToll(M, add);

    // HQ gate behind the spawn.
    const hp = cellPos(1, 36);
    add(12, 42, 13 * CELL, hp.x - 18, 21, hp.z, M.body);
    const hqSign = new THREE.Mesh(new THREE.BoxGeometry(58, 15, 1.2),
        new THREE.MeshBasicMaterial({ color: PAL.white,
            map: signTexture('BANDUNG HEADQUARTERS', 'LOCKDOWN — OUTER GATE'), toneMapped: false }));
    hqSign.position.set(hp.x - 10, 31, hp.z); hqSign.rotation.y = Math.PI / 2; worldRoot.add(hqSign);

    // Fixed mountain silhouettes identify Bandung beyond the city.
    for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(90 + (i % 3) * 28, 135 + (i % 2) * 45, 5),
            i % 2 ? M.body : M.ink);
        m.position.set(MAP_X0 + 90 + i * 165, 42, MAP_Z0 - 155 - (i % 3) * 35);
        m.rotation.y = i * 0.31; staticProps.push(m);
    }

    // Route signs appear before choice commit.
    for (const [p, title, sub, yaw] of [
        [cellPos(25, 31), 'CITY CENTER', 'FASTEST ROUTE', 0],
        [cellPos(26, 25), 'MARKET DISTRICT', 'SUPPLIES', Math.PI / 2],
        [cellPos(26, 47), 'SERVICE ROAD', 'MEDICAL', Math.PI / 2],
        [cellPos(68, 25), 'ELEVATED ROAD', 'DIRECT', Math.PI / 2],
        [cellPos(68, 51), 'UNDERPASS', 'COVER', Math.PI / 2],
    ]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(45, 12, 1),
            new THREE.MeshBasicMaterial({ color: PAL.white, map: signTexture(title, sub), toneMapped: false }));
        s.position.set(p.x, 22, p.z); s.rotation.y = yaw; staticProps.push(s);
    }

    staticBatch = addMergedStatic(worldRoot, staticProps);

    // Entry seals start retracted; route exits start raised until their encounter clears.
    addRouteGate('entry-boulevard', cellPos(30, 36), 2, CELL * 3.4, 'entry', 'boulevard');
    addRouteGate('entry-market', cellPos(28, 27), CELL * 3.4, 2, 'entry', 'market');
    addRouteGate('entry-residential', cellPos(28, 44), CELL * 3.4, 2, 'entry', 'residential');
    addRouteGate('exit-boulevard', cellPos(57, 36), 2, CELL * 3.4, 'exit', 'boulevard');
    addRouteGate('exit-market', cellPos(56, 31), CELL * 3.4, 2, 'exit', 'market');
    addRouteGate('exit-residential', cellPos(56, 41), CELL * 3.4, 2, 'exit', 'residential');
    addRouteGate('entry-flyover', cellPos(69, 26), CELL * 4.4, 2, 'entry', 'flyover');
    addRouteGate('entry-underpass', cellPos(69, 50), CELL * 4.4, 2, 'entry', 'underpass');
    addRouteGate('exit-flyover', cellPos(101, 30), CELL * 4.4, 2, 'exit', 'flyover');
    addRouteGate('exit-underpass', cellPos(101, 42), CELL * 4.4, 2, 'exit', 'underpass');

    markerAt('fork1-boulevard', S7_ROUTE_ONE.boulevard, PAL.amber);
    markerAt('fork1-market', S7_ROUTE_ONE.market, PAL.tech);
    markerAt('fork1-residential', S7_ROUTE_ONE.residential, PAL.white);
    markerAt('junction', S7_JUNCTION, PAL.amber);
    markerAt('fork2-flyover', S7_ROUTE_TWO.flyover, PAL.white);
    markerAt('fork2-underpass', S7_ROUTE_TWO.underpass, PAL.tech);
    markerAt('toll', S7_TOLL, PAL.amber);
    markerAt('vehicle', S7_VEHICLE, PAL.amber);

    buildFxPools(M);
    const lampCells = [[4, 36], [18, 36], [28, 25], [28, 47], [42, 16], [43, 57],
        [50, 36], [64, 31], [64, 43], [76, 16], [78, 57], [98, 26], [103, 42], [112, 36]];
    for (const [c, r] of lampCells) {
        const p = cellPos(c, r), cold = r < 30;
        const L = new THREE.PointLight(cold ? PAL.tech : PAL.amber, 0.44, 145);
        L.position.set(p.x, 25, p.z); scene.add(L); registerStageLight('campaign-7', L); stageLights.push(L);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6),
            new THREE.MeshBasicMaterial({ color: cold ? PAL.tech : PAL.amber, toneMapped: false }));
        bulb.position.copy(L.position); worldRoot.add(bulb);
    }
    navGrid = makeNavGrid(MAP_X0, MAP_Z0, CELL, MAP_COLS, MAP_ROWS,
        (x, z) => stage7Walk(x, z, 4) && !blockedAt(x, z, 3.5));
}

export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;
export const stage7StaticBatchDbg = () => staticBatch;

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}
function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null; dialogueT = 0; dialogueChars = 0;
    if (!dialogueCurrent) setAvatarRadioPose(false); renderDialogue();
}
function queueDialogue(key, repeat = false) {
    const line = STAGE7_DIALOGUE[key];
    if (!line || (!repeat && dialogueSeen.has(key))) return false;
    if (!repeat) dialogueSeen.add(key);
    dialogueQueue.push({ key, ...line }); if (!dialogueCurrent) nextDialogue(); return true;
}
function updateDialogue(dt) {
    if (!dialogueCurrent) return;
    const D = CFG.campaign.dialogue; dialogueT += dt;
    while (dialogueCurrent) {
        const sec = dialogueCurrent.text.length / Math.max(1, D.cps) + Math.max(0, D.holdSec);
        if (dialogueT < sec) {
            dialogueChars = Math.floor(dialogueT * Math.max(1, D.cps)); renderDialogue(); return;
        }
        dialogueChars = dialogueCurrent.text.length; renderDialogue(); dialogueT -= sec; nextDialogue();
    }
}
function resetDialogue() {
    dialogueCurrent = null; dialogueQueue = []; dialogueSeen = new Set();
    dialogueT = 0; dialogueChars = 0; hideStageRadioDialogue();
}

function countEncounter(name) {
    let n = 0; for (const z of robots) if (z.stage === 7 && z.encounter === name) n++; return n;
}
function spawnOne(cls, p, encounter, active = true) {
    spawnCampaignRobot(p.x + rand(-2.5, 2.5), p.z + rand(-2.5, 2.5), 7, cls, active);
    const z = robots[robots.length - 1]; z.encounter = encounter; return z;
}
function spawnEncounter(name, counts, active = true) {
    const spots = ENCOUNTER_POINTS[name]; if (!spots || !counts) return 0;
    let k = 0;
    for (const cls of ['C', 'B', 'A']) for (let i = 0; i < Math.max(0, counts[cls] | 0); i++, k++) {
        const s = spots[k % spots.length]; spawnOne(cls, cellPos(s[0], s[1]), name, active);
    }
    return k;
}
function wakeEncounter(name) {
    for (const z of robots) if (z.stage === 7 && z.encounter === name) {
        z.state = 'chasing'; z.moving = false; z.aiming = false;
    }
}

function placeSupply(p) {
    if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
    else spawnMedkitDrop(p.x, p.z, 1e9);
}
function placeCommonItems() {
    for (const p of COMMON_SUPPLIES) placeSupply(p);
    for (const p of COMMON_CRATES) spawnCrate(p.x, p.z, 0);
}
function placeRouteItems(route) {
    for (const p of ROUTE_SUPPLIES[route] || []) placeSupply(p);
    for (const p of ROUTE_CRATES[route] || []) spawnCrate(p.x, p.z, 0);
    if (route === 'underpass') for (const [c, r] of [[74, 54], [87, 60], [95, 55]]) {
        const p = cellPos(c, r); spawnBarrel(p.x, p.z, 0);
    }
}

function setMarkers(names) {
    const wanted = new Set(names);
    for (const [name, m] of Object.entries(markers)) m.visible = wanted.has(name);
}
function setGateTarget(name, closed) { const g = gate(name); if (g) g.target = closed ? 1 : 0; }

function commitRouteOne(choice) {
    if (routeOne) return;
    routeOne = choice; routeOneSpawned = true; phase = 'routeOne';
    for (const r of ['boulevard', 'market', 'residential']) {
        setGateTarget(`entry-${r}`, r !== choice); setGateTarget(`exit-${r}`, true);
    }
    spawnEncounter(choice, CFG.campaign.stage7.encounters[choice], true); placeRouteItems(choice);
    setMarkers([]); showStageMsg(`${choice.toUpperCase()} ROUTE COMMITTED — CLEAR THE SECTOR`, 4200);
}
function commitRouteTwo(choice) {
    if (routeTwo) return;
    routeTwo = choice; routeTwoSpawned = true; phase = 'routeTwo';
    for (const r of ['flyover', 'underpass']) {
        setGateTarget(`entry-${r}`, r !== choice); setGateTarget(`exit-${r}`, true);
    }
    spawnEncounter(choice, CFG.campaign.stage7.encounters[choice], true); placeRouteItems(choice);
    setMarkers([]); showStageMsg(`${choice.toUpperCase()} ROUTE COMMITTED — BREAK THROUGH`, 4000);
}

function routeOneChoice() {
    const d = CFG.campaign.stage7.routeCommitDepth;
    if (camera.position.x > S7_ROUTE_ONE.boulevard.x + d
        && Math.abs(camera.position.z - S7_ROUTE_ONE.boulevard.z) < CELL * 4) return 'boulevard';
    if (camera.position.z < S7_ROUTE_ONE.market.z - d
        && Math.abs(camera.position.x - S7_ROUTE_ONE.market.x) < CELL * 4) return 'market';
    if (camera.position.z > S7_ROUTE_ONE.residential.z + d
        && Math.abs(camera.position.x - S7_ROUTE_ONE.residential.x) < CELL * 4) return 'residential';
    return null;
}
function routeTwoChoice() {
    const d = CFG.campaign.stage7.routeCommitDepth;
    if (camera.position.z < S7_ROUTE_TWO.flyover.z - d
        && Math.abs(camera.position.x - S7_ROUTE_TWO.flyover.x) < CELL * 5) return 'flyover';
    if (camera.position.z > S7_ROUTE_TWO.underpass.z + d
        && Math.abs(camera.position.x - S7_ROUTE_TWO.underpass.x) < CELL * 5) return 'underpass';
    return null;
}
function inJunction() { return camera.position.x >= cellPos(59, 36).x && camera.position.x <= cellPos(70, 36).x; }
function atTollApproach() { return camera.position.x >= cellPos(102, 36).x; }

function startTollDefense() {
    phase = 'tollDefense'; tollT = 0; tollWave = 1; setMarkers([]);
    spawnEncounter('tollWave1', CFG.campaign.stage7.encounters.tollWaves[0], true);
    showStageMsg('HOLD THE TOLL PLAZA — WAVE 1/3', 3400); addCamShake(1.2);
}
function updateTollDefense(dt) {
    const C = CFG.campaign.stage7; tollT += dt;
    if (tollWave < 2 && tollT >= C.tollWaveGapSec) {
        tollWave = 2; spawnEncounter('tollWave2', C.encounters.tollWaves[1], true);
        showStageMsg('HOSTILES ENTERING THE TOLL PLAZA — WAVE 2/3', 3400);
    }
    if (tollWave < 3 && tollT >= C.tollWaveGapSec * 2) {
        tollWave = 3; spawnEncounter('tollWave3', C.encounters.tollWaves[2], true);
        showStageMsg('FINAL HOSTILE WAVE — HOLD THE LINE', 3400);
    }
    const alive = countEncounter('tollWave1') + countEncounter('tollWave2') + countEncounter('tollWave3');
    if (tollWave >= 3 && tollT >= C.tollDefenseMinSec && alive === 0) {
        phase = 'vehicleReveal'; setMarkers(['vehicle']);
        showStageMsg('TACTICAL VEHICLE LOCATED — INSPECT THE GARUDA LTV-45', 4800);
    }
}

function cleanupCine(revealSec = 0) {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false); setCineFade(0, revealSec);
    setCinematicActive(false); setAvatarRadioPose(false);
}
function stopVehicleLoop() {
    if (vehicleLoop) { stopLoopSFX(vehicleLoop); vehicleLoop = null; }
}
function finishOpening(skipped = false) {
    if (skipped) resetDialogue(); cleanupCine(CFG.campaign.stage7.fadeSec);
    phase = 'hqEscape'; wakeEncounter('hqEscape');
    showStageMsg('BREAK THROUGH BANDUNG — REACH THE CISUMDAWU TOLL GATE', 4800);
}
function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'opening', t: 0, dialogueStarted: false, fading: false, fadeT: 0 };
    cineCam.x = -118; cineCam.y = 118; cineCam.z = 116;
    setCineFocus(S7_START.x + CELL * 4, S7_START.z, true);
    showCutsceneSkip(() => finishOpening(true));
}
function startVehicleLoop() {
    if (vehicleLoop) return;
    vehicleLoop = playLoopSFX(sfxTankMove, 0.16);
    try { vehicleLoop.playbackRate = 1.55; } catch (e) { }
}
function startOutro() {
    if (cine || phase !== 'vehicleReveal') return;
    phase = 'outro'; setMarkers([]); releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'outro', stage: 'establish', t: 0, stageT: 0, fading: false, fadeT: 0 };
    cineCam.x = -112; cineCam.y = 88; cineCam.z = 104;
    setCineFocus(VEHICLE_OBJECT.x, VEHICLE_OBJECT.z, true); queueDialogue('vehicleFind');
    showCutsceneSkip(finishStage);
}
function finishStage() {
    if (complete) return;
    complete = true; phase = 'complete'; barrierBroken = true;
    resetDialogue(); setAvatarRadioPose(false);
    if (avatarGroup) avatarGroup.visible = false;
    if (tollBarrier?.userData.arm) tollBarrier.userData.arm.rotation.z = -1.5;
    if (tacticalVehicle) {
        resetTacticalVehicleVisual(tacticalVehicle);
        tacticalVehicle.group.position.x = VEHICLE_OBJECT.x + 185;
        updateTacticalVehicleVisual(tacticalVehicle, 0, { doorOpen: 0, engineOn: true, speed: 72 });
    }
    cleanupCine(0); stopVehicleLoop();
    gameOver(true, 'TO BE CONTINUED', { preserveCampaignSave: true });
}

function updateCine(dt) {
    if (!cine) return;
    cine.t += dt; cine.stageT += dt;
    const C = CFG.campaign.stage7;
    if (cine.kind === 'opening') {
        const k = Math.min(1, cine.t / Math.max(1, C.openingMinSec));
        cineCam.x = -118 + 34 * k; cineCam.y = 118 - 30 * k; cineCam.z = 116 - 24 * k;
        setCineFocus(S7_START.x + CELL * (3 + k * 3), S7_START.z, true);
        if (!cine.dialogueStarted && cine.t >= C.openingDialogueDelaySec) {
            cine.dialogueStarted = true; queueDialogue('openingCommand'); queueDialogue('openingGibran');
        }
        if (!cine.fading && cine.dialogueStarted && cine.t >= C.openingMinSec
            && !dialogueCurrent && !dialogueQueue.length) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishOpening(false);
        return;
    }
    if (cine.kind !== 'outro') return;
    if (cine.stage === 'establish') {
        cineCam.x = -112 + Math.sin(cine.t * 0.4) * 4;
        if (!dialogueCurrent && !dialogueQueue.length) {
            cine.stage = 'inspect'; cine.stageT = 0; queueDialogue('routeCommand'); queueDialogue('routeReply');
            setCineFocus(VEHICLE_OBJECT.x - 8, VEHICLE_OBJECT.z + 3, true);
            setAvatarRadioPose(true, 0, 'gibranAccepts', 0.55);
        }
    } else if (cine.stage === 'inspect') {
        const k = Math.min(1, cine.stageT / 5); cineCam.x = -78 - k * 18; cineCam.y = 62 + k * 8; cineCam.z = 70 - k * 16;
        updateTacticalVehicleVisual(tacticalVehicle, dt, { doorOpen: 0.12 + k * 0.88, engineOn: false, speed: 0 });
        if (!dialogueCurrent && !dialogueQueue.length) {
            cine.stage = 'board'; cine.stageT = 0; queueDialogue('warningCommand'); queueDialogue('finalGibran');
            setAvatarRadioPose(false); startVehicleLoop();
        }
    } else if (cine.stage === 'board') {
        const k = Math.min(1, cine.stageT / 3.2);
        updateTacticalVehicleVisual(tacticalVehicle, dt, { doorOpen: 1 - k, engineOn: true, speed: 0 });
        setCineFocus(VEHICLE_OBJECT.x + 2, VEHICLE_OBJECT.z, true);
        if (k > 0.58 && avatarGroup) avatarGroup.visible = false;
        if (!dialogueCurrent && !dialogueQueue.length && cine.t >= C.outroMinSec) {
            cine.stage = 'drive'; cine.stageT = 0;
        }
    } else if (cine.stage === 'drive') {
        const k = Math.min(1, cine.stageT / 4.2), speed = 25 + 80 * k;
        updateTacticalVehicleVisual(tacticalVehicle, dt, { doorOpen: 0, engineOn: true, speed });
        tacticalVehicle.group.position.x += speed * dt;
        setCineFocus(tacticalVehicle.group.position.x + 25, tacticalVehicle.group.position.z, true);
        cineCam.x = -90 - k * 45; cineCam.y = 72 + k * 40; cineCam.z = 88;
        if (!barrierBroken && tacticalVehicle.group.position.x >= tollBarrier.position.x - 24) {
            barrierBroken = true; tollBarrier.userData.arm.rotation.z = -1.5; addCamShake(3.5);
            for (let i = 0; i < 8; i++) spawnExhaust(true);
        }
        spawnExhaust(false);
        if (!cine.fading && k >= 0.78) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishStage();
    }
}

function spawnExhaust(burst) {
    if (!tacticalVehicle || !exhaustPool.length) return;
    const count = burst ? 2 : 1;
    for (let j = 0; j < count; j++) {
        const m = exhaustPool[exhaustCursor++ % exhaustPool.length];
        m.visible = true; m.userData.life = burst ? 0.9 : 0.55;
        m.position.set(tacticalVehicle.group.position.x - 18 + rand(-2, 2), 2 + rand(0, 2),
            tacticalVehicle.group.position.z + rand(-5, 5));
        m.scale.setScalar(burst ? 1.8 : 1);
    }
}

function updateFx(dt) {
    for (const r of rainPool) {
        r.position.y -= dt * 86;
        if (r.position.y < 1) {
            r.position.y = rand(45, 66); r.position.x = camera.position.x + rand(-190, 190);
            r.position.z = camera.position.z + rand(-160, 160);
        }
    }
    for (const r of ripplePool) {
        r.userData.phase = (r.userData.phase + dt * 0.46) % 1;
        const s = 0.5 + r.userData.phase * 2.4; r.scale.setScalar(s);
    }
    for (let i = 0; i < sparkPool.length; i++) {
        const s = sparkPool[i];
        const active = phase === 'routeTwo' && routeTwo === 'underpass' && i < 12;
        s.visible = active;
        if (active) {
            const p = cellPos(78 + (i % 6) * 3, i % 2 ? 54 : 60);
            s.position.set(p.x + Math.sin(stageElapsed * 8 + i) * 2,
                3 + ((stageElapsed * 15 + i) % 8), p.z);
            s.rotation.z += dt * 8;
        }
    }
    for (const e of exhaustPool) if (e.visible) {
        e.userData.life -= dt; e.position.y += dt * 7; e.position.x -= dt * 8;
        e.scale.multiplyScalar(1 + dt * 1.8);
        if (e.userData.life <= 0) e.visible = false;
    }
}

function resetStage() {
    phase = 'opening'; routeOne = routeTwo = null; complete = false;
    routeOneSpawned = routeTwoSpawned = junctionSpawned = false;
    tollT = 0; tollWave = 0; stageElapsed = 0; barrierBroken = false; exhaustCursor = 0;
    resetDialogue(); stopVehicleLoop();
    if (cine) cleanupCine(0);
    if (avatarGroup) avatarGroup.visible = true;
    setAvatarRadioPose(false); setCineBars(false); setCineFade(0, 0);
    for (const g of routeGates) {
        g.target = g.role === 'exit' ? 1 : 0; g.k = g.target;
        const e = g.k;
        for (const p of g.posts) p.position.y = -4 + e * 7;
    }
    setMarkers([]);
    if (tollBarrier?.userData.arm) tollBarrier.userData.arm.rotation.z = 0;
    if (tacticalVehicle) {
        tacticalVehicle.group.position.set(VEHICLE_OBJECT.x, 0, VEHICLE_OBJECT.z);
        tacticalVehicle.group.rotation.y = 0; resetTacticalVehicleVisual(tacticalVehicle);
    }
    for (const e of exhaustPool) e.visible = false;
    for (const s of sparkPool) s.visible = false;
}

export const stage7DialogueDebug = () => ({
    key: dialogueCurrent?.key || null, speaker: dialogueCurrent?.speaker || '',
    text: dialogueCurrent?.text || '', chars: dialogueChars,
    shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
    typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
    queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen],
});
export function stage7ConnectivityDebug() {
    let start = null, open = 0;
    for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) {
        if (S7_MAP[r][c] !== '#') open++;
        if (S7_MAP[r][c] === 'S') start = { c, r };
    }
    const seen = new Set(), q = start ? [start] : [];
    while (q.length) {
        const p = q.shift(), key = p.c + ',' + p.r;
        if (seen.has(key) || p.c < 0 || p.c >= MAP_COLS || p.r < 0 || p.r >= MAP_ROWS
            || S7_MAP[p.r][p.c] === '#') continue;
        seen.add(key);
        q.push({ c: p.c + 1, r: p.r }, { c: p.c - 1, r: p.r },
            { c: p.c, r: p.r + 1 }, { c: p.c, r: p.r - 1 });
    }
    const reached = p => {
        const m = mapCellAt(p.x, p.z); return seen.has(m.c + ',' + m.r);
    };
    return {
        open, reachable: seen.size, connected: open > 0 && seen.size === open,
        goals: {
            boulevard: reached(S7_ROUTE_ONE.boulevard), market: reached(S7_ROUTE_ONE.market),
            residential: reached(S7_ROUTE_ONE.residential), flyover: reached(S7_ROUTE_TWO.flyover),
            underpass: reached(S7_ROUTE_TWO.underpass), junction: reached(S7_JUNCTION),
            toll: reached(S7_TOLL), vehicle: reached(S7_VEHICLE),
        },
    };
}
export const stage7RouteDebug = () => ({
    routeOne, routeTwo,
    availability: {
        boulevard: !routeOne || routeOne === 'boulevard', market: !routeOne || routeOne === 'market',
        residential: !routeOne || routeOne === 'residential',
        flyover: !routeTwo || routeTwo === 'flyover', underpass: !routeTwo || routeTwo === 'underpass',
    },
    choices: { one: ['boulevard', 'market', 'residential'], two: ['flyover', 'underpass'] },
    combinations: [
        ['boulevard', 'flyover'], ['boulevard', 'underpass'], ['market', 'flyover'],
        ['market', 'underpass'], ['residential', 'flyover'], ['residential', 'underpass'],
    ],
    gates: routeGates.map(g => ({ name: g.name, role: g.role, route: g.route,
        k: g.k, target: g.target, solid: gateSolid(g), x: g.blocker.x, z: g.blocker.z,
        hx: g.blocker.hx, hz: g.blocker.hz })),
    activeSeals: routeGates.filter(g => g.target > 0.5).map(g => g.name),
    connectivity: stage7ConnectivityDebug(),
});
export const stage7Debug = () => ({
    phase, objective: stage7Scene.hudStatus(), stageElapsed, routeOne, routeTwo,
    routeOneSpawned, routeTwoSpawned, junctionSpawned, tollT, tollWave,
    tollAlive: countEncounter('tollWave1') + countEncounter('tollWave2') + countEncounter('tollWave3'),
    robots: countStageRobots(7), vehicleReady: phase === 'vehicleReveal',
    barrierBroken, outro: cine?.kind === 'outro' ? { stage: cine.stage, t: cine.t } : null,
    complete,
    encounters: Object.fromEntries(Object.keys(ENCOUNTER_POINTS).map(k => [k, countEncounter(k)])),
});
export const stage7WorldDebug = () => ({
    built, map: { rows: MAP_ROWS, cols: MAP_COLS, cell: CELL,
        open: S7_MAP.reduce((n, row) => n + [...row].filter(t => t !== '#').length, 0) },
    start: { ...S7_START }, forkOne: { ...S7_FORK_ONE }, junction: { ...S7_JUNCTION },
    forkTwo: { ...S7_FORK_TWO }, toll: { ...S7_TOLL }, vehicle: { ...S7_VEHICLE },
    blockers: blockers.length, props: propRecords.map(p => ({ ...p })),
    propKinds: [...new Set(propRecords.map(p => p.kind))],
    pools: { rain: rainPool.length, ripples: ripplePool.length, sparks: sparkPool.length, exhaust: exhaustPool.length },
    visiblePools: { sparks: sparkPool.filter(x => x.visible).length, exhaust: exhaustPool.filter(x => x.visible).length },
    lights: stageLights.length, occluders: occluders.length, staticBatches: staticBatch.length,
    nav: !!navGrid, sceneRoot: worldRoot?.position ? { x: worldRoot.position.x, z: worldRoot.position.z } : null,
    commonSupplies: COMMON_SUPPLIES.map(p => ({ ...p })), commonCrates: COMMON_CRATES.map(p => ({ ...p })),
    routeSupplies: Object.fromEntries(Object.entries(ROUTE_SUPPLIES).map(([k, v]) => [k, v.map(p => ({ ...p }))])),
    routeCrates: Object.fromEntries(Object.entries(ROUTE_CRATES).map(([k, v]) => [k, v.map(p => ({ ...p }))])),
});
export const stage7VehicleDebug = () => vehicleDebug(tacticalVehicle);

export const stage7Scene = {
    id: 'campaign-7', lightsKey: 'campaign-7',
    enter() {
        saveCampaignStage(7); ensureWorld();
        for (let i = robots.length - 1; i >= 0; i--) {
            disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
        resetCrates(); resetBarrels(); resetStage();
        spawnEncounter('hqEscape', CFG.campaign.stage7.encounters.hqEscape, false);
        placeCommonItems(); applyLightPreset(scene, 'night'); enterCityEnv();
        camera.position.set(S7_START.x, CFG.player.eyeHeight, S7_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true; startOpening(); updateUI();
    },
    exit() {
        resetDialogue(); if (cine) cleanupCine(0); stopVehicleLoop();
        setAvatarRadioPose(false); if (avatarGroup) avatarGroup.visible = true;
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,

    updateMode(dt) {
        stageElapsed += dt; updateDialogue(dt); updateCine(dt); updateRouteGates(dt);
        updateFx(dt); updateOccluders(dt);
        if (!cine && tacticalVehicle) updateTacticalVehicleVisual(tacticalVehicle, dt,
            { doorOpen: 0, engineOn: false, speed: 0 });
        for (const m of Object.values(markers)) if (m.visible) {
            const s = 1 + Math.sin(stageElapsed * 3.4) * 0.08; m.scale.setScalar(s);
        }
        if (cine || complete) { updateUI(); return; }

        if (phase === 'hqEscape' && countEncounter('hqEscape') === 0) {
            phase = 'forkOne'; queueDialogue('routeChoice');
            setMarkers(['fork1-boulevard', 'fork1-market', 'fork1-residential']);
            showStageMsg('CHOOSE A ROUTE THROUGH THE CITY', 4200);
        } else if (phase === 'forkOne') {
            const c = routeOneChoice(); if (c) commitRouteOne(c);
        } else if (phase === 'routeOne') {
            if (countEncounter(routeOne) === 0) {
                setGateTarget(`exit-${routeOne}`, false); setMarkers(['junction']);
                if (inJunction()) {
                    phase = 'junction'; junctionSpawned = true; setMarkers([]);
                    spawnEncounter('junction', CFG.campaign.stage7.encounters.junction, true);
                    showStageMsg('SECURE THE MAIN INTERSECTION', 3600);
                }
            }
        } else if (phase === 'junction' && countEncounter('junction') === 0) {
            phase = 'forkTwo'; queueDialogue('junctionCommand'); queueDialogue('junctionGibran');
            setMarkers(['fork2-flyover', 'fork2-underpass']);
            showStageMsg('CHOOSE A ROUTE TO THE TOLL GATE', 4000);
        } else if (phase === 'forkTwo') {
            const c = routeTwoChoice(); if (c) commitRouteTwo(c);
        } else if (phase === 'routeTwo') {
            if (countEncounter(routeTwo) === 0) {
                setGateTarget(`exit-${routeTwo}`, false); setMarkers(['toll']);
                if (atTollApproach()) {
                    phase = 'tollApproach'; queueDialogue('tollSight');
                    showStageMsg('REACH THE CISUMDAWU TOLL PLAZA', 3600);
                }
            }
        } else if (phase === 'tollApproach') {
            if (Math.hypot(camera.position.x - S7_TOLL.x, camera.position.z - S7_TOLL.z) < CELL * 3.2)
                startTollDefense();
        } else if (phase === 'tollDefense') updateTollDefense(dt);
        else if (phase === 'vehicleReveal') {
            if (Math.hypot(camera.position.x - S7_VEHICLE.x, camera.position.z - S7_VEHICLE.z)
                < CFG.campaign.stage7.vehicleRange) startOutro();
        }
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage7Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage7Walk, pos, oldX, oldZ, player.radius);
    },
    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        if (b.mesh.position.y >= BUILDING_H) return false;
        return stage7SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z)
            || gateBlocksShot(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        if (y >= BUILDING_H) return false;
        return stage7SegHitsWall(x0, z0, x1, z1) || gateBlocksShot(x0, z0, x1, z1);
    },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage7Walk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },
    robotAI(z, dt, step) {
        if (phase === 'opening' && z.encounter === 'hqEscape') {
            z.state = 'idle'; z.moving = false; z.aiming = false; return {};
        }
        return campaignRobotAI(z, dt, step, { walkable: stage7Walk, resolve, nav: navGrid });
    },
    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: stage7Walk, resolve });
    },
    clampDropPos(x, z) { return stage7Walk(x, z, 2) ? [x, z] : [S7_START.x, S7_START.z]; },
    hudStatus() {
        if (phase === 'opening') return 'STAGE 7 — BANDUNG LOCKDOWN';
        if (phase === 'hqEscape') return `BREAK THROUGH THE HQ PERIMETER — Robots: ${countEncounter('hqEscape')}`;
        if (phase === 'forkOne') return 'CHOOSE A ROUTE THROUGH BANDUNG';
        if (phase === 'routeOne') return `${routeOne.toUpperCase()} DISTRICT — Robots: ${countEncounter(routeOne)}`;
        if (phase === 'junction') return `SECURE THE MAIN INTERSECTION — Robots: ${countEncounter('junction')}`;
        if (phase === 'forkTwo') return 'CHOOSE A ROUTE TO CISUMDAWU';
        if (phase === 'routeTwo') return `${routeTwo.toUpperCase()} — Robots: ${countEncounter(routeTwo)}`;
        if (phase === 'tollApproach') return 'REACH THE CISUMDAWU TOLL PLAZA';
        if (phase === 'tollDefense') {
            const left = countEncounter('tollWave1') + countEncounter('tollWave2') + countEncounter('tollWave3');
            return `DEFEND THE TOLL PLAZA — WAVE ${tollWave}/3 — Robots: ${left}`;
        }
        if (phase === 'vehicleReveal') return 'INSPECT THE GARUDA LTV-45';
        if (phase === 'outro') return 'ROUTE CONFIRMED — KERTAJATI INTERNATIONAL AIRPORT';
        return 'NEXT DESTINATION — KERTAJATI';
    },
    radarLandmarks(plot) {
        const mark = (p, color = '#ffb03b') => plot(p.x - camera.position.x, p.z - camera.position.z, color, 5, true);
        if (phase === 'hqEscape') mark(S7_FORK_ONE);
        else if (phase === 'forkOne') {
            mark(S7_ROUTE_ONE.boulevard, '#ffb03b'); mark(S7_ROUTE_ONE.market, '#39b7a5'); mark(S7_ROUTE_ONE.residential, '#efe1c2');
        } else if (phase === 'routeOne') mark(S7_JUNCTION);
        else if (phase === 'junction' || phase === 'forkTwo') {
            mark(S7_ROUTE_TWO.flyover, '#efe1c2'); mark(S7_ROUTE_TWO.underpass, '#39b7a5');
        } else if (phase === 'routeTwo' || phase === 'tollApproach' || phase === 'tollDefense') mark(S7_TOLL);
        else if (phase === 'vehicleReveal') mark(S7_VEHICLE);
    },
};
