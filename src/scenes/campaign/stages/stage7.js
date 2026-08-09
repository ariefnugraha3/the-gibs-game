// Campaign Stage 7 — BANDUNG LOCKDOWN.
// Gerbang Bandung HQ -> jaringan kota seperti labirin -> gang sempit -> taman kota ->
// bundaran -> gang permukiman + taman kedua -> tiga pabrik robot Gerbang Tol
// Cisumdawu -> GRD LTV-45.
//
// DIROMBAK 2026-08-08 (permintaan user): sistem pemilihan tiga cabang dibuang.
// Seluruh aspal dibangun dari ruas selebar tepat 8 m dengan trotoar 2 m di KEDUA
// sisinya. Plaza lebar memakai beton, bukan aspal. Jalur start->tol sengaja putus
// bila semua gang ATAU semua taman dihapus, jadi keduanya bagian puzzle, bukan dekor.

import { CFG, CAMP_M } from '../../../core/config.js';
import { dialogueMap } from '../../../core/dialogue.js';
import { player, robots, stats, keys, setCinematicActive } from '../../../core/state.js';
import {
    scene, camera, viewCam, setCineFocus, CAM_OFF_DEFAULT, addCamShake,
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
import { beginStageTransition, campaignJumpToStage } from '../utility/transition.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { stage1Scene } from './stage1.js';
import { stage8Scene } from './stage8.js';
import { applyLightPreset, registerStageLight } from '../../../world/lighting.js';
import { enterCityEnv } from '../utility/cityscape.js';
import { PAL } from '../../../world/palette.js';
import { addMergedStatic, mergeObjectInPlace } from '../../../utils/meshBatch.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { makeTexture } from '../../../utils/textures.js';
import { rand, segPointDist2 } from '../../../utils/math.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../entities/drops.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../entities/crates.js';
import { spawnBarrel, resetBarrels, resolveBarrelBlock } from '../../../entities/barrels.js';
import { explodeAt, spawnGroundPuff, spawnBloodBurst } from '../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../entities/gore.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, updateSpawnMachine, spawnMachineDebug,
} from '../../../entities/spawnMachine.js';
import { FuturisticSUV } from '../../../entities/futuristicSUV.js';
import { FuturisticSedan } from '../../../entities/futuristicSedan.js';
import {
    buildTacticalVehicleMesh, resetTacticalVehicleVisual,
    updateTacticalVehicleVisual, tacticalVehicleDebug as vehicleDebug,
} from '../../../entities/tacticalVehicle.js';
import {
    sfxTankMove, sfxRobotSpawn, playLoopSFX, stopLoopSFX, playSFX,
} from '../../../utils/sfx.js';

const OX = 240000, OZ = 0;
// Grid live tetap 280×184 agar kepadatan kota dan anggaran nav stabil.
const MAP_COLS = 280, MAP_ROWS = 184, CELL = 14, BUILDING_H = 34;
const MAP_X0 = OX - MAP_COLS * CELL / 2;
const MAP_Z0 = OZ - MAP_ROWS * CELL / 2;
const mapCellPos = (c, r) => ({ x: MAP_X0 + (c + 0.5) * CELL, z: MAP_Z0 + (r + 0.5) * CELL });
const cellPos = (c, r) => mapCellPos(c, r);
const EMPTY_INDICES = Object.freeze([]);

// Jaringan ruas centerline membentuk loop, jalan buntu, dan lintasan memutar.
export const S7_ROAD_SEGMENTS = Object.freeze([
    ['hq-avenue', 2, 92, 44, 92],
    ['west-spine', 44, 34, 44, 150],
    ['old-town-north', 44, 34, 94, 34],
    ['north-descent', 94, 34, 94, 62],
    ['upper-cross', 44, 62, 94, 62],
    ['shop-dead-end', 44, 92, 86, 92],
    ['market-spine', 68, 62, 68, 118],
    ['market-cross', 68, 118, 98, 118],
    ['south-rise', 98, 118, 98, 150],
    ['south-loop', 44, 150, 98, 150],
    ['park-exit', 168, 62, 204, 62],
    ['roundabout-north', 204, 62, 204, 87],
    ['roundabout-west', 170, 96, 195, 96],
    ['roundabout-east', 213, 96, 240, 96],
    ['school-rise', 240, 70, 240, 96],
    ['school-front', 222, 70, 240, 70],
    ['roundabout-south', 204, 105, 204, 134],
    ['garden-road', 204, 134, 226, 134],
    ['toll-approach', 258, 92, 258, 104],
    ['toll-exit', 258, 92, 279, 92],
].map(x => Object.freeze({ id: x[0], c0: x[1], r0: x[2], c1: x[3], r1: x[4] })));

export const S7_ALLEY_SEGMENTS = Object.freeze([
    ['old-town-alley', 94, 62, 124, 62, true, true],
    ['pocket-park-lane', 36, 58, 44, 58, false, false],
    ['school-lane', 238, 62, 238, 70, false, false],
    ['garden-alley', 226, 134, 244, 134, true, true],
    ['toll-garden-exit', 258, 104, 258, 114, true, false],
].map(x => Object.freeze({ id: x[0], c0: x[1], r0: x[2], c1: x[3], r1: x[4],
    required: x[5], betweenBuildings: x[6] })));

export const S7_PARKS = Object.freeze([
    Object.freeze({ id: 'pocket-park', c0: 20, r0: 48, c1: 36, r1: 68, required: false }),
    Object.freeze({ id: 'central-park', c0: 124, r0: 42, c1: 168, r1: 82, required: true }),
    Object.freeze({ id: 'school-field', c0: 222, r0: 42, c1: 254, r1: 62, required: false }),
    Object.freeze({ id: 'toll-garden', c0: 244, r0: 114, c1: 268, r1: 152, required: true }),
]);
export const S7_PAVED_AREAS = Object.freeze([
    Object.freeze({ id: 'toll-plaza', c0: 248, r0: 76, c1: 279, r1: 108 }),
]);
export const S7_ROUNDABOUT = Object.freeze({ id: 'civic-roundabout', c: 204, r: 96, radiusMeters: 14 });
export const S7_DEAD_ENDS = Object.freeze([
    Object.freeze(cellPos(86, 92)), Object.freeze(cellPos(170, 96)),
    Object.freeze(cellPos(222, 70)), Object.freeze(cellPos(20, 58)),
]);

// Lebar surface dibaca dari CFG hanya di dalam fungsi, sesuai urutan load config.
const streetCfg = () => CFG.campaign.stage7.streets;
let surfaceGeometry = null;
function ensureSurfaceGeometry() {
    if (surfaceGeometry) return surfaceGeometry;
    const C = streetCfg();
    const compileSegment = s => {
        const a = cellPos(s.c0, s.r0), b = cellPos(s.c1, s.r1);
        const dx = b.x - a.x, dz = b.z - a.z;
        return { ...s, x0: a.x, z0: a.z, dx, dz, den: dx * dx + dz * dz };
    };
    const compileArea = a => {
        const p0 = cellPos(a.c0, a.r0), p1 = cellPos(a.c1, a.r1);
        return { ...a, x0: Math.min(p0.x, p1.x) - CELL / 2,
            x1: Math.max(p0.x, p1.x) + CELL / 2,
            z0: Math.min(p0.z, p1.z) - CELL / 2, z1: Math.max(p0.z, p1.z) + CELL / 2 };
    };
    const rp = cellPos(S7_ROUNDABOUT.c, S7_ROUNDABOUT.r);
    const rw = C.asphaltWidthMeters * CAMP_M, sw = C.sidewalkWidthMeters * CAMP_M;
    const roundRadius = S7_ROUNDABOUT.radiusMeters * CAMP_M;
    const roundRoadInner = Math.max(0, roundRadius - rw / 2);
    const roundRoadOuter = roundRadius + rw / 2;
    // Bundaran hanya mempunyai trotoar luar. Sisi dalam adalah curb rendah lalu
    // pulau rumput, seperti bundaran kota nyata, bukan cincin trotoar kedua.
    const roundCurbWidth = 0.35 * CAMP_M;
    const roundIslandRadius = Math.max(0, roundRoadInner - roundCurbWidth);
    const roads = S7_ROAD_SEGMENTS.map(compileSegment);
    const alleys = S7_ALLEY_SEGMENTS.map(compileSegment);
    const parks = S7_PARKS.map(compileArea), paved = S7_PAVED_AREAS.map(compileArea);
    // Cari seluruh node siku/T/perempatan dari centerline aktual.
    const crossPoints = new Map();
    for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
        const a = roads[i], b = roads[j];
        const ah = Math.abs(a.dz) < 1e-6, bh = Math.abs(b.dz) < 1e-6;
        if (ah === bh) continue;
        const h = ah ? a : b, v = ah ? b : a;
        const hx0 = Math.min(h.x0, h.x0 + h.dx), hx1 = Math.max(h.x0, h.x0 + h.dx);
        const vz0 = Math.min(v.z0, v.z0 + v.dz), vz1 = Math.max(v.z0, v.z0 + v.dz);
        if (v.x0 < hx0 - 1e-6 || v.x0 > hx1 + 1e-6
            || h.z0 < vz0 - 1e-6 || h.z0 > vz1 + 1e-6) continue;
        crossPoints.set(`${v.x0.toFixed(3)},${h.z0.toFixed(3)}`, { x: v.x0, z: h.z0 });
    }
    const junctions = [...crossPoints.values()].map((p, index) => {
        const arms = new Set(), segmentIds = [];
        for (const s of roads) {
            const x1 = s.x0 + s.dx, z1 = s.z0 + s.dz;
            const on = p.x >= Math.min(s.x0, x1) - 1e-6 && p.x <= Math.max(s.x0, x1) + 1e-6
                && p.z >= Math.min(s.z0, z1) - 1e-6 && p.z <= Math.max(s.z0, z1) + 1e-6
                && segmentDistance2(p.x, p.z, s) < 1e-6;
            if (!on) continue;
            segmentIds.push(s.id);
            if (Math.abs(s.dz) < 1e-6) {
                if (Math.min(s.x0, x1) < p.x - 1e-6) arms.add('west');
                if (Math.max(s.x0, x1) > p.x + 1e-6) arms.add('east');
            } else {
                if (Math.min(s.z0, z1) < p.z - 1e-6) arms.add('north');
                if (Math.max(s.z0, z1) > p.z + 1e-6) arms.add('south');
            }
        }
        return { id: `intersection-${index}`, ...p, arms: [...arms], segmentIds };
    });
    const intersections = junctions.filter(p => p.arms.length >= 3);
    const turnRadius = 11 * CAMP_M;
    const armVector = arm => arm === 'west' ? { x: -1, z: 0 }
        : arm === 'east' ? { x: 1, z: 0 }
            : arm === 'north' ? { x: 0, z: -1 } : { x: 0, z: 1 };
    const elbows = junctions.filter(p => p.arms.length === 2
        && p.arms.some(a => a === 'west' || a === 'east')
        && p.arms.some(a => a === 'north' || a === 'south')
        // Bila gang ikut menempel, node ini adalah junction beda-lebar, bukan
        // belokan murni; membulatkannya akan menutup mulut gang.
        && !alleys.some(s => segmentDistance2(p.x, p.z, s)
            <= (turnRadius + rw / 2 + sw) ** 2)
        && !paved.some(a => p.x >= a.x0 && p.x <= a.x1 && p.z >= a.z0 && p.z <= a.z1))
        .map((p, index) => {
        const u = armVector(p.arms[0]), v = armVector(p.arms[1]);
        return { ...p, id: `turn-${index}`, radius: turnRadius,
            ux: u.x, uz: u.z, vx: v.x, vz: v.z,
            cx: p.x + (u.x + v.x) * turnRadius,
            cz: p.z + (u.z + v.z) * turnRadius };
    });
    const buildBins = (segments, radius) => {
        const bins = new Array(MAP_COLS * MAP_ROWS);
        for (let i = 0; i < segments.length; i++) {
            const s = segments[i], x1 = s.x0 + s.dx, z1 = s.z0 + s.dz;
            const c0 = Math.max(0, Math.floor((Math.min(s.x0, x1) - radius - MAP_X0) / CELL));
            const c1 = Math.min(MAP_COLS - 1, Math.floor((Math.max(s.x0, x1) + radius - MAP_X0) / CELL));
            const r0 = Math.max(0, Math.floor((Math.min(s.z0, z1) - radius - MAP_Z0) / CELL));
            const r1 = Math.min(MAP_ROWS - 1, Math.floor((Math.max(s.z0, z1) + radius - MAP_Z0) / CELL));
            for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
                const k = r * MAP_COLS + c; (bins[k] || (bins[k] = [])).push(i);
            }
        }
        return bins;
    };
    surfaceGeometry = {
        roadWidth: rw, sidewalkWidth: sw,
        alleyWidth: C.alleyWidthMeters * CAMP_M,
        roads, alleys, intersections, elbows,
        roadBins: buildBins(roads, rw / 2 + sw),
        alleyBins: buildBins(alleys, C.alleyWidthMeters * CAMP_M / 2),
        parks, paved,
        roundX: rp.x, roundZ: rp.z, roundRadius,
        roundRoadInner, roundRoadOuter, roundCurbWidth, roundIslandRadius,
        roundRoadInner2: roundRoadInner ** 2,
        roundRoadOuter2: roundRoadOuter ** 2,
        roundWalkInner2: roundRoadOuter ** 2,
        roundWalkOuter2: (roundRoadOuter + sw) ** 2,
    };
    return surfaceGeometry;
}
const roadWidth = () => ensureSurfaceGeometry().roadWidth;
const sidewalkWidth = () => ensureSurfaceGeometry().sidewalkWidth;
const alleyWidth = () => ensureSurfaceGeometry().alleyWidth;
const segmentDistance2 = (x, z, s) => {
    const k = s.den > 0 ? Math.max(0, Math.min(1,
        ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.den)) : 0;
    const qx = x - (s.x0 + s.dx * k), qz = z - (s.z0 + s.dz * k);
    return qx * qx + qz * qz;
};
const inCompiledArea = (x, z, a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;
function surfaceTokenAt(x, z) {
    if (x < MAP_X0 || x >= MAP_X0 + MAP_COLS * CELL
        || z < MAP_Z0 || z >= MAP_Z0 + MAP_ROWS * CELL) return '#';
    const G = ensureSurfaceGeometry(), rw2 = (G.roadWidth / 2) ** 2;
    const corridor2 = (G.roadWidth / 2 + G.sidewalkWidth) ** 2;
    const ci = Math.floor((x - MAP_X0) / CELL), ri = Math.floor((z - MAP_Z0) / CELL);
    const bin = ri * MAP_COLS + ci;
    for (const a of G.paved) if (inCompiledArea(x, z, a)) return 'Q';
    // Simpang T/perempatan: pusat + lengan aspal menyatu. Hanya sudut yang
    // diapit dua lengan aktif mendapat fillet aspal dan curb quarter-circle.
    const roadHalf = G.roadWidth / 2, corridor = roadHalf + G.sidewalkWidth;
    for (const q of G.intersections) {
        const dx = x - q.x, dz = z - q.z;
        if (Math.abs(dx) > corridor || Math.abs(dz) > corridor) continue;
        const armX = dx < 0 ? 'west' : 'east';
        const armZ = dz < 0 ? 'north' : 'south';
        if (Math.abs(dx) <= roadHalf && Math.abs(dz) <= roadHalf) return 'R';
        if (Math.abs(dz) <= roadHalf && q.arms.includes(armX)) return 'R';
        if (Math.abs(dx) <= roadHalf && q.arms.includes(armZ)) return 'R';
        if (Math.abs(dx) >= roadHalf && Math.abs(dz) >= roadHalf) {
            if (q.arms.includes(armX) && q.arms.includes(armZ)) {
                const cx = Math.sign(dx) * corridor, cz = Math.sign(dz) * corridor;
                if ((dx - cx) ** 2 + (dz - cz) ** 2 <= G.sidewalkWidth ** 2) return 'W';
                return 'R';
            }
        }
    }
    // Tikungan 90° memakai annulus seperempat lingkaran yang sama dengan mesh.
    // Area capsule lama di sekitar node sengaja dimask menjadi '#' di luar tiga
    // pita ini agar tidak tersisa bulb aspal/trotoar berbentuk lingkaran.
    for (const q of G.elbows) {
        const dx = x - q.cx, dz = z - q.cz;
        const au = -(dx * q.ux + dz * q.uz), av = -(dx * q.vx + dz * q.vz);
        const outerWalk = q.radius + corridor;
        if (au < -1e-6 || av < -1e-6 || au > outerWalk || av > outerWalk) continue;
        const d = Math.hypot(dx, dz);
        const innerWalk = q.radius - corridor;
        const innerRoad = q.radius - roadHalf, outerRoad = q.radius + roadHalf;
        if (d >= innerRoad && d <= outerRoad) return 'R';
        if ((d >= innerWalk && d < innerRoad) || (d > outerRoad && d <= outerWalk)) return 'W';
        return '#';
    }
    const rdx = x - G.roundX, rdz = z - G.roundZ, rr2 = rdx * rdx + rdz * rdz;
    if (rr2 >= G.roundRoadInner2 && rr2 <= G.roundRoadOuter2) return 'R';
    if (rr2 >= G.roundWalkInner2 && rr2 <= G.roundWalkOuter2) return 'W';
    let sidewalk = false;
    for (const i of G.roadBins[bin] || EMPTY_INDICES) {
        const s = G.roads[i];
        const d2 = segmentDistance2(x, z, s);
        if (d2 <= rw2) return 'R';
        if (d2 <= corridor2) sidewalk = true;
    }
    if (sidewalk) return 'W';
    const alley2 = (G.alleyWidth / 2) ** 2;
    for (const i of G.alleyBins[bin] || EMPTY_INDICES)
        if (segmentDistance2(x, z, G.alleys[i]) <= alley2) return 'A';
    for (const a of G.parks) if (inCompiledArea(x, z, a)) return 'P';
    return '#';
}

export let S7_MAP = Object.freeze([]);
function ensureLayoutMap() {
    if (S7_MAP.length) return;
    const a = Array.from({ length: MAP_ROWS }, (_, r) => Array.from({ length: MAP_COLS }, (_, c) => {
        const p = mapCellPos(c, r); return surfaceTokenAt(p.x, p.z);
    }));
    a[92][5] = 'S'; a[92][249] = 'T'; a[92][269] = 'V';
    S7_MAP = Object.freeze(a.map(row => row.join('')));
}
export const S7_LEGEND = Object.freeze({
    '#': 'blocked-city', R: 'asphalt-road', W: 'sidewalk', A: 'alley',
    P: 'open-park', Q: 'concrete-plaza', S: 'start', T: 'toll-defense', V: 'tactical-vehicle',
});

export const S7_START = Object.freeze(cellPos(5, 92));
export const S7_MAZE_ENTRY = Object.freeze(cellPos(44, 62));
export const S7_ROUNDABOUT_APPROACH = Object.freeze(cellPos(204, 79));
export const S7_TOLL = Object.freeze(cellPos(249, 92));
// Titik interaksi berada 4 m di depan bumper barat, bukan 8 m dari kendaraan.
export const S7_VEHICLE = Object.freeze(cellPos(269, 92));
const VEHICLE_OBJECT = Object.freeze(cellPos(271, 92));
export const S7_MACHINE_POINTS = Object.freeze([
    Object.freeze({ id: 'north', ...cellPos(258, 82), yaw: 0 }),
    Object.freeze({ id: 'west', ...cellPos(252, 92), yaw: Math.PI / 2 }),
    Object.freeze({ id: 'south', ...cellPos(258, 102), yaw: Math.PI }),
]);

export const STAGE7_DIALOGUE = dialogueMap('campaign.stage7.lines');

const ENCOUNTER_POINTS = Object.freeze({
    hqEscape: Object.freeze([[10, 90], [14, 94], [18, 91], [22, 93], [26, 90], [30, 94],
        [34, 91], [38, 93], [41, 90], [42, 94], [20, 94], [32, 90], [12, 93], [36, 94]]),
    oldTown: Object.freeze([[44, 82], [44, 70], [48, 62], [60, 62], [72, 62], [84, 62],
        [94, 48], [86, 34], [70, 34], [52, 34], [68, 76], [68, 90], [80, 92], [68, 106]]),
    marketMaze: Object.freeze([[68, 118], [80, 118], [94, 118], [98, 128], [98, 142],
        [86, 150], [70, 150], [52, 150], [44, 136], [44, 122], [44, 108], [58, 92]]),
    parkDistrict: Object.freeze([[108, 62], [132, 55], [142, 70], [154, 52], [160, 72],
        [176, 62], [190, 62], [204, 70], [134, 76], [152, 64], [164, 58]]),
    civicMaze: Object.freeze([[204, 87], [194, 96], [178, 96], [214, 96], [234, 96],
        [240, 84], [240, 72], [228, 70], [204, 116], [204, 128], [216, 134]]),
    gardenDistrict: Object.freeze([[234, 134], [250, 126], [252, 142], [262, 132], [258, 112],
        [252, 100], [266, 100], [270, 84], [260, 78], [274, 104]]),
});

const CITY_SUPPLIES = Object.freeze([
    { type: 'ammo', weapon: 'pistol', ...cellPos(8, 90) },
    { type: 'medkit', ...cellPos(28, 94) },
    { type: 'ammo', weapon: 'rifle', ...cellPos(58, 62) },
    { type: 'ammo', weapon: 'shotgun', ...cellPos(116, 62) },
    { type: 'medkit', ...cellPos(145, 62) },
    { type: 'ammo', weapon: 'launcher', ...cellPos(188, 62) },
    { type: 'ammo', weapon: 'rifle', ...cellPos(204, 122) },
    { type: 'medkit', ...cellPos(252, 134) },
]);
const CITY_CRATES = Object.freeze([
    { area: 'hq', ...cellPos(16, 94) }, { area: 'old-town', ...cellPos(44, 74) },
    { area: 'market', ...cellPos(74, 118) }, { area: 'central-park', ...cellPos(128, 62) },
    { area: 'central-park', ...cellPos(138, 54) }, { area: 'roundabout', ...cellPos(186, 96) },
    { area: 'school', ...cellPos(232, 70) }, { area: 'garden', ...cellPos(246, 126) },
    { area: 'toll', ...cellPos(272, 104) },
]);
const CITY_BARRELS = Object.freeze([
    [9, 94], [24, 90], [36, 90], [44, 86], [44, 48], [62, 34], [82, 34],
    [54, 62], [76, 62], [68, 82], [76, 92], [68, 110], [88, 118], [98, 136],
    [54, 150], [84, 150], [130, 62], [138, 72], [158, 54], [184, 62],
    [182, 96], [230, 96], [240, 78], [204, 120], [212, 134], [246, 140],
]);
// Tiang visual mengikuti centerline secara deterministik. Hanya 14 di antaranya
// memakai PointLight; seluruh kepala tetap emissive sehingga jalan malam terbaca
// tanpa menambah jumlah shader-light di tengah permainan.
const LAMP_SPACING_METERS = 42;
const STREET_TREE_SPACING_METERS = 40;
const STAGE_POINT_LIGHTS = 14;
const lampSpecs = [], streetTreeSpecs = [], frontageRecords = [];

let built = false, worldRoot = null, navGrid = null, staticBatch = [];
const blockers = [], softBlockers = [], propRecords = [], stageLights = [], occluders = [];
const reservedRects = [], cityBlocks = [];
const streetSurfaces = [], intersectionSurfaces = [], turnSurfaces = [], parkSurfaces = [];
let streetEdgeCount = 0;
const rainPool = [], ripplePool = [], sparkPool = [], exhaustPool = [];
const markers = {};
let tacticalVehicle = null, tollBarrier = null, exhaustCursor = 0;
let occlusionProbeCache = null, occlusionSpatialAuditCache = null;
let occluderBins = null, occluderMarks = null, occluderStamp = 0;
const OCCLUDER_HIT_PAD = 3.5;
const OCCLUDER_BIN_PAD = OCCLUDER_HIT_PAD + CELL;
const spawnMachines = [], machineBirths = [];

let phase = 'opening', complete = false;
let mazeMidSeen = false, tollSighted = false;
let stageElapsed = 0, barrierBroken = false;
let cine = null, vehicleLoop = null;
const cineCam = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };

let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function mapCellAt(x, z) {
    ensureLayoutMap();
    const c = Math.floor((x - MAP_X0) / CELL), r = Math.floor((z - MAP_Z0) / CELL);
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return { c, r, token: '#' };
    return { c, r, token: S7_MAP[r][c] };
}
const openToken = token => token !== '#';

export function stage7Walk(x, z, radius = 0) {
    const d = Math.max(0, radius);
    if (d === 0) return openToken(surfaceTokenAt(x, z));
    // Clearance bundaran dihitung secara radial. Four-corner sampling biasa
    // membentuk tepi bergerigi pada lingkaran dan dapat menjepit player ketika
    // dua axis mencoba meluncur di sisi pulau.
    const G = ensureSurfaceGeometry();
    const rr = Math.hypot(x - G.roundX, z - G.roundZ);
    if (rr <= Math.sqrt(G.roundWalkOuter2) + d) {
        if (rr < G.roundRoadInner + d) return false;
        if (rr <= Math.sqrt(G.roundWalkOuter2) - d) return true;
    }
    return openToken(surfaceTokenAt(x - d, z - d))
        && openToken(surfaceTokenAt(x + d, z - d))
        && openToken(surfaceTokenAt(x - d, z + d))
        && openToken(surfaceTokenAt(x + d, z + d));
}

function insideRoundaboutIsland(x, z) {
    const G = ensureSurfaceGeometry();
    return Math.hypot(x - G.roundX, z - G.roundZ) < G.roundRoadInner;
}

function resolveRoundaboutIsland(pos, radius) {
    const G = ensureSurfaceGeometry(), dx = pos.x - G.roundX, dz = pos.z - G.roundZ;
    const dist = Math.hypot(dx, dz), minDist = G.roundRoadInner + Math.max(0, radius);
    if (dist >= minDist) return false;
    // Posisi tepat di pusat tetap mendapat arah deterministik sehingga save lama
    // atau dorongan robot tidak dapat meninggalkan player terkunci di dalam pulau.
    const nx = dist > 1e-6 ? dx / dist : 1, nz = dist > 1e-6 ? dz / dist : 0;
    pos.x = G.roundX + nx * minDist; pos.z = G.roundZ + nz * minDist;
    return true;
}

function addBlocker(x, z, hx, hz, top = BUILDING_H, standable = false) {
    const b = { x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(hx, hz), top, standable };
    blockers.push(b); return b;
}
function blockedAt(x, z, radius = 3.5) {
    for (const b of blockers)
        if (Math.abs(x - b.x) <= b.hx + radius && Math.abs(z - b.z) <= b.hz + radius) return true;
    for (const b of softBlockers)
        if (Math.abs(x - b.x) <= b.hx + radius && Math.abs(z - b.z) <= b.hz + radius) return true;
    return false;
}
export function resolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
    resolveBlockers(pos, radius, 0, softBlockers);
}

function segHitsRect(x0, z0, x1, z1, b) {
    const dx = x1 - x0, dz = z1 - z0;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) {
        if (x0 < b.x - b.hx || x0 > b.x + b.hx) return false;
    } else {
        let a = (b.x - b.hx - x0) / dx, c = (b.x + b.hx - x0) / dx;
        if (a > c) { const swap = a; a = c; c = swap; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return false;
    }
    if (Math.abs(dz) < 1e-9) {
        if (z0 < b.z - b.hz || z0 > b.z + b.hz) return false;
    } else {
        let a = (b.z - b.hz - z0) / dz, c = (b.z + b.hz - z0) / dz;
        if (a > c) { const swap = a; a = c; c = swap; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return false;
    }
    return t1 >= 0 && t0 <= 1;
}
export function stage7SegHitsWall(x0, z0, x1, z1) {
    if (blockers.some(b => segHitsRect(x0, z0, x1, z1, b))) return true;
    const dist = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(dist / (CELL * 0.3)));
    for (let i = 1; i <= steps; i++) {
        const k = i / steps, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        // Pulau tengah menghentikan karakter, bukan peluru. Vegetasi bundaran
        // juga memakai soft blocker sehingga tembakan tidak mati pada grass disc.
        if (!stage7Walk(x, z, 0) && !insideRoundaboutIsland(x, z)) return true;
    }
    return false;
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
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.36, p.z); m.visible = false;
    worldRoot.add(m); markers[name] = m; return m;
}

function recordProp(kind, p, hx = 0, hz = 0, top = 0, solid = false, meta = null) {
    propRecords.push({ kind, x: p.x, z: p.z, hx, hz, top, solid, ...(meta || {}) });
    if (solid) addBlocker(p.x, p.z, hx, hz, top);
}
function addSoftBlocker(p, hx, hz, top = 20) {
    softBlockers.push({ x: p.x, z: p.z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1,
        rad: Math.hypot(hx, hz), top, standable: false });
}
// Blok kota generik TIDAK boleh menumpuk landmark buatan tangan.
function reserveCells(c, r, wCells, dCells) {
    reservedRects.push({
        c0: Math.floor(c - wCells / 2 - 1), r0: Math.floor(r - dCells / 2 - 1),
        c1: Math.ceil(c + wCells / 2 + 1), r1: Math.ceil(r + dCells / 2 + 1),
    });
}
function worldCellX(x) { return (x - MAP_X0) / CELL - 0.5; }
function worldCellZ(z) { return (z - MAP_Z0) / CELL - 0.5; }
function pointReserved(x, z, margin = 0) {
    const c = worldCellX(x), r = worldCellZ(z);
    return reservedRects.some(v => c >= v.c0 - margin && c <= v.c1 + margin
        && r >= v.r0 - margin && r <= v.r1 + margin);
}
function reserveWorldRect(x, z, hx, hz) {
    reserveCells(worldCellX(x), worldCellZ(z), hx * 2 / CELL, hz * 2 / CELL);
}

function registerOccluder(obj, footprint, top, kind = 'structure') {
    const items = [], seen = new Set();
    obj.traverse(m => {
        if (!m.material) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) if (!seen.has(mat)) {
            seen.add(mat);
            // Transparent dipasang SEKALI sebelum render pertama. Runtime hanya
            // mengubah opacity, jadi fade tidak mengganti shader/program material.
            const baseOp = mat.opacity == null ? 1 : mat.opacity;
            mat.transparent = true;
            mat.opacity = baseOp;
            mat.needsUpdate = true;
            items.push({ mat, baseOp });
        }
    });
    const circle = typeof footprint === 'number';
    const hx = circle ? footprint : footprint.hx;
    const hz = circle ? footprint : footprint.hz;
    occluders.push({ x: obj.position.x, z: obj.position.z,
        shape: circle ? 'circle' : 'aabb', radius: circle ? footprint : Math.hypot(hx, hz),
        hx, hz, top, kind, f: 1, occluding: false, items });
}

// Interval intersection pada ruas viewCam -> entity. Parameter t=0 berada di
// render camera dan t=1 berada di entity; tExit adalah sisi footprint terdekat
// entity. Menguji tinggi di sana membuat fade bertahan juga ketika player berada
// di bawah atap/di dalam footprint, kasus yang gagal pada heuristik titik tengah.
function sightExit(o, sx, sz, ex, ez) {
    const dx = ex - sx, dz = ez - sz;
    if (o.shape === 'circle') {
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-9) return -1;
        const tc = ((o.x - sx) * dx + (o.z - sz) * dz) / len2;
        const qx = o.x - (sx + dx * tc), qz = o.z - (sz + dz * tc);
        const rr = o.radius + OCCLUDER_HIT_PAD, rem = rr * rr - qx * qx - qz * qz;
        if (rem < 0) return -1;
        const span = Math.sqrt(rem / len2);
        const t0 = Math.max(0, tc - span), t1 = Math.min(1, tc + span);
        return t1 >= 0 && t0 <= 1 && t0 <= t1 ? t1 : -1;
    }
    let t0 = 0, t1 = 1;
    const pad = OCCLUDER_HIT_PAD;
    if (Math.abs(dx) < 1e-9) {
        if (sx < o.x - o.hx - pad || sx > o.x + o.hx + pad) return -1;
    } else {
        let a = (o.x - o.hx - pad - sx) / dx;
        let b = (o.x + o.hx + pad - sx) / dx;
        if (a > b) { const q = a; a = b; b = q; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
    }
    if (Math.abs(dz) < 1e-9) {
        if (sz < o.z - o.hz - pad || sz > o.z + o.hz + pad) return -1;
    } else {
        let a = (o.z - o.hz - pad - sz) / dz;
        let b = (o.z + o.hz + pad - sz) / dz;
        if (a > b) { const q = a; a = b; b = q; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
    }
    return t1 >= 0 && t0 <= 1 ? Math.min(1, t1) : -1;
}

function occluderHits(o, ex, ey, ez) {
    const sx = viewCam?.position?.x ?? ex + CAM_OFF_DEFAULT.x;
    const sy = viewCam?.position?.y ?? ey + CAM_OFF_DEFAULT.y;
    const sz = viewCam?.position?.z ?? ez + CAM_OFF_DEFAULT.z;
    const tExit = sightExit(o, sx, sz, ex, ez);
    if (tExit < 0) return false;
    const yNearEntity = sy + (ey - sy) * tExit;
    return yNearEntity <= o.top + 3;
}

function buildOccluderBins() {
    occluderBins = new Array(MAP_COLS * MAP_ROWS);
    occluderMarks = new Int32Array(occluders.length);
    for (let i = 0; i < occluders.length; i++) {
        const o = occluders[i], hx = o.shape === 'circle' ? o.radius : o.hx;
        const hz = o.shape === 'circle' ? o.radius : o.hz;
        // Satu sel ekstra menjadikan sampling ray sebuah supercover konservatif:
        // chord yang hanya menyentuh sudut sel tidak dapat melewatkan pohon kecil.
        const c0 = Math.max(0, Math.floor((o.x - hx - OCCLUDER_BIN_PAD - MAP_X0) / CELL));
        const c1 = Math.min(MAP_COLS - 1, Math.floor((o.x + hx + OCCLUDER_BIN_PAD - MAP_X0) / CELL));
        const r0 = Math.max(0, Math.floor((o.z - hz - OCCLUDER_BIN_PAD - MAP_Z0) / CELL));
        const r1 = Math.min(MAP_ROWS - 1, Math.floor((o.z + hz + OCCLUDER_BIN_PAD - MAP_Z0) / CELL));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const k = r * MAP_COLS + c;
            (occluderBins[k] || (occluderBins[k] = [])).push(i);
        }
    }
}

function markOccludersForTarget(ex, ey, ez) {
    if (!occluderBins) buildOccluderBins();
    if (++occluderStamp >= 0x7fffffff) { occluderMarks.fill(0); occluderStamp = 1; }
    const sx = viewCam?.position?.x ?? ex + CAM_OFF_DEFAULT.x;
    const sz = viewCam?.position?.z ?? ez + CAM_OFF_DEFAULT.z;
    const dx = ex - sx, dz = ez - sz;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL * 0.65)));
    for (let j = 0; j <= steps; j++) {
        const t = j / steps, x = sx + dx * t, z = sz + dz * t;
        const c = Math.floor((x - MAP_X0) / CELL), r = Math.floor((z - MAP_Z0) / CELL);
        if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) continue;
        for (const i of occluderBins[r * MAP_COLS + c] || EMPTY_INDICES) {
            if (occluderMarks[i] === occluderStamp) continue;
            occluderMarks[i] = occluderStamp;
            const o = occluders[i];
            if (!o.occluding && occluderHits(o, ex, ey, ez)) o.occluding = true;
        }
    }
}

function updateOccluders(dt) {
    for (const o of occluders) o.occluding = false;
    markOccludersForTarget(camera.position.x, camera.position.y, camera.position.z);
    for (const z of robots) {
        if (z.stage !== 7 || Math.abs(z.mesh.position.x - camera.position.x) > 320
            || Math.abs(z.mesh.position.z - camera.position.z) > 320) continue;
        markOccludersForTarget(z.mesh.position.x, z.mesh.position.y + 7, z.mesh.position.z);
    }
    for (const o of occluders) {
        o.f += ((o.occluding ? 0.45 : 1) - o.f) * Math.min(1, dt * 9);
        for (const it of o.items) it.mat.opacity = it.baseOp * o.f;
    }
}

function buildOccluderFacade(M, c, r, w, d, h) {
    const p = cellPos(c, r), g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const body = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const trim = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const glass = new THREE.MeshLambertMaterial({ color: PAL.screenBg, transparent: true, opacity: 0.68 });
    box(g, body, w, h, d, 0, h / 2, 0);
    box(g, trim, w * 0.88, 2, d + 0.7, 0, h * 0.72, 0);
    for (let x = -w * 0.32; x <= w * 0.32; x += 16) box(g, glass, 6, 8, 0.8, x, 12, d / 2 + 0.5);
    worldRoot.add(g); registerOccluder(g, { hx: w / 2, hz: d / 2 + 1 }, h, 'office');
    reserveCells(c, r, w / CELL, d / CELL);
    recordProp('occluder-facade', p, w / 2, d / 2, h, false);
}

function buildLinearStreetSpecs() {
    if (lampSpecs.length || streetTreeSpecs.length) return;
    const G = ensureSurfaceGeometry();
    const corridor = G.roadWidth / 2 + G.sidewalkWidth;
    const placeAlong = (out, spacingMeters, vergeMeters, phase) => {
        const spacing = spacingMeters * CAMP_M;
        for (let si = 0; si < G.roads.length; si++) {
            const s = G.roads[si], len = Math.sqrt(s.den);
            const count = Math.max(1, Math.round(len / spacing));
            const alongX = Math.abs(s.dx) >= Math.abs(s.dz);
            for (let i = 0; i < count; i++) {
                const t = (i + 0.5 + phase) / count;
                if (t <= 0.08 || t >= 0.92) continue;
                const baseX = s.x0 + s.dx * t, baseZ = s.z0 + s.dz * t;
                let placed = null;
                for (const side0 of [((si + i) & 1) ? 1 : -1, ((si + i) & 1) ? -1 : 1]) {
                    const nx = alongX ? 0 : 1, nz = alongX ? 1 : 0;
                    const off = corridor + vergeMeters * CAMP_M;
                    const x = baseX + nx * side0 * off, z = baseZ + nz * side0 * off;
                    if (surfaceTokenAt(x, z) !== '#' || pointReserved(x, z, 0.3)) continue;
                    placed = { x, z, segment: s.id, t, side: side0,
                        axis: alongX ? 'z' : 'x', dir: -side0,
                        cold: ((si * 5 + i) % 4) === 0, corridorOffset: off };
                    break;
                }
                if (!placed) continue;
                const minGap = out === lampSpecs ? 15 * CAMP_M : 10 * CAMP_M;
                if (out.some(q => Math.hypot(q.x - placed.x, q.z - placed.z) < minGap)) continue;
                out.push(Object.freeze(placed));
            }
        }
    };
    placeAlong(lampSpecs, LAMP_SPACING_METERS, 0.65, 0);
    // Batang berada di verge depan fasad, tetapi tajuk jalan dibuat lebih ramping
    // daripada pohon taman supaya tidak tertanam ke dinding frontage yang rapat.
    placeAlong(streetTreeSpecs, STREET_TREE_SPACING_METERS, 0.55, 0.22);
}

// Tiang lampu jalan: semua memiliki bulb emissive; subset tetap memakai
// PointLight. Posisi tiang berada di verge luar trotoar, lengannya menghadap jalan.
function lampTip(spec) {
    const reach = 1.7 * CAMP_M;
    return { x: spec.x + (spec.axis === 'x' ? spec.dir * reach : 0),
        z: spec.z + (spec.axis === 'z' ? spec.dir * reach : 0) };
}
function buildLampPost(M, add, spec) {
    const { cold, axis, dir } = spec, p = spec;
    add(2.6, 26, 2.6, p.x, 13, p.z, M.steel);
    const reach = 1.7 * CAMP_M;
    add(axis === 'x' ? reach + 2.6 : 2.6, 1.6, axis === 'z' ? reach + 2.6 : 2.6,
        p.x + (axis === 'x' ? dir * reach / 2 : 0), 25.4,
        p.z + (axis === 'z' ? dir * reach / 2 : 0), M.steel);
    const tip = lampTip(spec);
    add(axis === 'x' ? 6.4 : 2.4, 1.4, axis === 'z' ? 6.4 : 2.4,
        tip.x, 24.3, tip.z, cold ? M.techGlow : M.amberGlow);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6),
        new THREE.MeshBasicMaterial({ color: cold ? PAL.tech : PAL.amber, toneMapped: false }));
    bulb.position.set(tip.x, 24.7, tip.z); worldRoot.add(bulb);
    recordProp('lamp-post', p, 1.5, 1.5, 26, true,
        { segment: spec.segment, corridorOffset: spec.corridorOffset });
}

function buildStreetProps(M, add) {
    const facadeMaterials = () => ({
        body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        wall: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        window: new THREE.MeshLambertMaterial({ color: PAL.screenBg }),
    });
    const office = (c, r, w, d, h) => {
        buildOccluderFacade(M, c, r, w * CELL, d * CELL, h);
        recordProp('office', cellPos(c, r), w * CELL / 2, d * CELL / 2, h, false);
    };
    const house = (c, r, w, d, h) => {
        const p = cellPos(c, r), ww = w * CELL, dd = d * CELL, g = new THREE.Group();
        const F = facadeMaterials(); g.position.set(p.x, 0, p.z);
        box(g, F.wall, ww, h, dd, 0, h / 2, 0);
        const angle = 0.48, len = dd * 0.62, drop = Math.sin(angle) * len / 2;
        for (const side of [-1, 1]) {
            const roof = box(g, F.wood, ww + 5, 1.5, len, 0, h + drop, side * dd * 0.24);
            roof.rotation.x = side * angle;
        }
        box(g, F.wood, ww * 0.42, 7, 1, 0, 8, dd / 2 + 0.6);
        worldRoot.add(g);
        const top = h + drop * 2 + Math.cos(angle) * 0.75;
        registerOccluder(g, { hx: ww / 2 + 3, hz: dd * 0.57 }, top, 'house');
        reserveCells(c, r, w, d); recordProp('house', p, ww / 2, dd / 2, top, false);
    };
    const shop = (c, r, w, d, h, alleySide = false) => {
        const p = cellPos(c, r), ww = w * CELL, dd = d * CELL, g = new THREE.Group();
        const F = facadeMaterials(); g.position.set(p.x, 0, p.z);
        box(g, F.body, ww, h, dd, 0, h / 2, 0);
        box(g, F.window, ww * 0.9, 9, 1.2, 0, 9, dd / 2 + 0.7);
        box(g, F.wood, ww + 3, 1.5, 13, 0, 15, dd / 2 + 6);
        for (let x = -ww * 0.35; x <= ww * 0.35; x += 18)
            box(g, F.steel, 2, 11, 2, x, 5.5, dd / 2 + 1.5);
        worldRoot.add(g); registerOccluder(g,
            { hx: ww / 2 + 2, hz: dd / 2 + 13 }, h, 'shop');
        reserveCells(c, r, w, d); recordProp('shop', p, ww / 2, dd / 2, h, false);
        if (alleySide) recordProp('alley-building', p, ww / 2, dd / 2, h, false);
    };
    const school = (c, r) => {
        const p = cellPos(c, r), w = 22 * CELL, d = 10 * CELL, g = new THREE.Group();
        const F = facadeMaterials(); g.position.set(p.x, 0, p.z);
        box(g, F.wall, w, 30, d, 0, 15, 0);
        box(g, F.wood, w + 5, 2, d + 5, 0, 31, 0);
        for (let x = -w * 0.4; x <= w * 0.4; x += 24)
            box(g, F.window, 10, 8, 1, x, 14, d / 2 + 0.7);
        box(g, new THREE.MeshBasicMaterial({ color: PAL.white,
            map: signTexture('BANDUNG CIVIC SCHOOL', 'EVACUATED'), toneMapped: false }),
        58, 9, 1, 0, 38, d / 2 + 1);
        worldRoot.add(g); registerOccluder(g, { hx: w / 2 + 3, hz: d / 2 + 3 }, 43, 'school');
        reserveCells(c, r, 22, 10); recordProp('school', p, w / 2, d / 2, 40, false);
    };
    const treeAt = (p, s = 1, zone = 'park', park = null) => {
        const trunkH = 15 * s, g = new THREE.Group(); g.position.set(p.x, 0, p.z);
        // Pohon jalan dibuat tinggi/rimbun tetapi tetap ramping di bidang XZ agar
        // tajuknya tidak menembus frontage yang hanya berjarak 1.5 m dari trotoar.
        const crownRadius = (zone === 'street' ? 3.9 : 10) * s;
        const large = s >= 1.05;
        const trunkMat = new THREE.MeshLambertMaterial({ color: PAL.wood });
        const leafMat = new THREE.MeshLambertMaterial({ color: PAL.leaf });
        box(g, trunkMat, 3.2 * s, trunkH, 3.2 * s, 0, trunkH / 2, 0);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(crownRadius, 22 * s, 7), leafMat);
        crown.position.set(0, trunkH + 10 * s, 0); crown.castShadow = true; crown.receiveShadow = true;
        g.add(crown);
        if (large) {
            const crownUpper = new THREE.Mesh(new THREE.ConeGeometry(crownRadius * 0.78, 17 * s, 7), leafMat);
            crownUpper.position.set(0, trunkH + 22 * s, 0);
            crownUpper.castShadow = true; crownUpper.receiveShadow = true; g.add(crownUpper);
        }
        worldRoot.add(g);
        const treeTop = trunkH + (large ? 30.5 : 21) * s;
        registerOccluder(g, crownRadius, treeTop,
            zone === 'street' ? 'street-tree' : 'tree');
        addSoftBlocker(p, 2.5 * s, 2.5 * s, trunkH);
        recordProp('tree', p, 2.5 * s, 2.5 * s, treeTop, false,
            { zone, park, crownRadius, large });
    };
    const tree = (c, r, s = 1, park = null) => treeAt(cellPos(c, r), s, 'park', park);

    office(18, 76, 16, 10, 82); office(184, 42, 16, 10, 94);
    for (const h of [[54, 22, 8, 7, 28], [76, 22, 9, 7, 31], [54, 164, 8, 7, 27],
        [78, 164, 9, 7, 30], [214, 150, 8, 7, 28]]) house(...h);
    shop(82, 82, 18, 8, 34); shop(109, 54, 26, 14, 38, true);
    shop(109, 70, 26, 14, 34, true);
    shop(178, 108, 14, 8, 32); school(236, 30);

    for (const park of S7_PARKS) {
        const p0 = cellPos(park.c0, park.r0), p1 = cellPos(park.c1, park.r1);
        recordProp('park', { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 },
            Math.abs(p1.x - p0.x) / 2, Math.abs(p1.z - p0.z) / 2, 0, false);
    }
    for (const t of [[24, 52, .8, 'pocket-park'], [31, 64, .9, 'pocket-park'],
        [22, 64, .75, 'pocket-park'], [34, 51, .8, 'pocket-park'],
        [130, 48, 1, 'central-park'], [142, 48, .9, 'central-park'],
        [158, 48, 1.1, 'central-park'], [132, 76, .9, 'central-park'],
        [158, 76, 1, 'central-park'], [166, 70, .85, 'central-park'],
        [226, 48, .9, 'school-field'], [248, 48, 1, 'school-field'],
        [228, 58, .75, 'school-field'], [250, 58, .8, 'school-field'],
        [248, 120, .9, 'toll-garden'], [264, 122, 1, 'toll-garden'],
        [248, 146, 1.05, 'toll-garden'], [264, 146, .9, 'toll-garden'],
        [266, 134, .85, 'toll-garden'],
        // Pohon kanopi besar ditempatkan di tepi taman, jauh dari jalur silang
        // utama dan furniture, agar taman Bandung terasa rindang tanpa menyegel nav.
        [20.5, 68, 1.22, 'pocket-park'], [36, 48, 1.18, 'pocket-park'],
        [124, 42, 1.34, 'central-park'], [168, 42, 1.28, 'central-park'],
        [124, 82, 1.24, 'central-park'], [168, 68, 1.18, 'central-park'],
        [238, 42, 1.25, 'school-field'], [254, 62, 1.18, 'school-field'],
        [244, 132, 1.32, 'toll-garden'], [268, 132, 1.24, 'toll-garden']]) tree(...t);

    buildLinearStreetSpecs();
    for (let i = 0; i < streetTreeSpecs.length; i++) {
        const t = streetTreeSpecs[i];
        if (lampSpecs.some(l => Math.hypot(l.x - t.x, l.z - t.z) < 5 * CAMP_M)) continue;
        treeAt(t, 0.92 + (i % 4) * 0.08, 'street', null);
    }

    // Mobil sipil/angkot menjadi cover tetapi menyisakan trotoar untuk lewat.
    for (const [c, r, yaw, type] of [[72, 92, 0, 'sedan'], [54, 34, 0, 'suv'],
        [220, 96, 0, 'sedan'], [204, 110, Math.PI / 2, 'suv']]) {
        const p = cellPos(c, r), raw = type === 'suv'
            ? new FuturisticSUV({ scale: CAMP_M, bodyColor: PAL.panel }).group
            : new FuturisticSedan(PAL.gunmetal).group;
        if (type === 'sedan') raw.scale.setScalar(CAMP_M);
        raw.position.set(p.x, 0, p.z); raw.rotation.y = yaw;
        const car = mergeObjectInPlace(raw); worldRoot.add(car); registerOccluder(car, 20, 16, 'street-car');
        const turn = Math.abs(Math.sin(yaw)) > 0.5;
        recordProp('street-car', p, turn ? 8 : 18, turn ? 18 : 8, 16, true);
    }
    const ap = cellPos(82, 118), angkot = new THREE.Group(); angkot.position.set(ap.x, 0, ap.z);
    box(angkot, M.body, 26, 8, 12, 0, 5, 0); box(angkot, M.glass, 17, 5, 12.3, -2, 10, 0);
    for (const x of [-8, 8]) for (const z of [-6, 6])
        cylinder(angkot, M.ink, 3, 3, 2, 10, x, 3, z, Math.PI / 2);
    worldRoot.add(angkot); recordProp('angkot', ap, 14, 7, 13, true);

    for (const spec of lampSpecs) buildLampPost(M, add, spec);
}

function buildMazeLandmarks(M, add) {
    // Shop row Old Town dibangun oleh buildStreetProps; pasangan massa di sini
    // mengapit gang taman. Sel '#' di bawah semuanya sudah menjadi collider dunia.
    for (const [c, r, w, d] of [[235, 126, 16, 14], [235, 142, 16, 14]]) {
        const p = cellPos(c, r), ww = w * CELL, dd = d * CELL;
        buildOccluderFacade(M, c, r, ww, dd, 32);
        recordProp('alley-building', p, ww / 2, dd / 2, 32, false);
    }

    for (const [c, r] of [[76, 86], [82, 86], [224, 74], [230, 74]]) {
        const p = cellPos(c, r);
        add(24, 4, 15, p.x, 2, p.z, M.wood); add(27, 1, 18, p.x, 8, p.z, M.hazard);
        recordProp('market-stall', p, 12, 7.5, 9, false);
    }
    const bench = (c, r, yaw, park) => {
        const p = cellPos(c, r), alongX = Math.abs(Math.cos(yaw)) > 0.5;
        add(alongX ? 18 : 4, 4, alongX ? 4 : 18, p.x, 3, p.z, M.wood);
        add(alongX ? 20 : 3, 2, alongX ? 3 : 20, p.x, 6, p.z, M.steel);
        recordProp('park-bench', p, alongX ? 10 : 2, alongX ? 2 : 10, 7, true, { park });
    };
    const planter = (c, r, park) => {
        const p = cellPos(c, r);
        add(15, 5, 15, p.x, 2.5, p.z, M.concrete);
        add(11, 4, 11, p.x, 5.2, p.z, M.leaf);
        recordProp('park-planter', p, 7.5, 7.5, 8, true, { park });
    };
    const bin = (c, r, park) => {
        const p = cellPos(c, r);
        cylinder(worldRoot, M.panel, 3, 3, 8, 8, p.x, 4, p.z);
        recordProp('park-bin', p, 3, 3, 8, true, { park });
    };
    const fountain = (c, r, park, radius = 8) => {
        const p = cellPos(c, r);
        cylinder(worldRoot, M.concrete, radius, radius + 1.5, 3, 20, p.x, 1.5, p.z);
        const water = new THREE.Mesh(new THREE.CircleGeometry(radius - 1.2, 24),
            new THREE.MeshBasicMaterial({ color: PAL.tech, transparent: true,
                opacity: 0.48, toneMapped: false, depthWrite: false }));
        water.rotation.x = -Math.PI / 2; water.position.set(p.x, 3.1, p.z); worldRoot.add(water);
        cylinder(worldRoot, M.steel, 1.2, 1.8, 9, 10, p.x, 7.5, p.z);
        cylinder(worldRoot, M.techGlow, 0.7, 1.1, 5, 10, p.x, 13, p.z);
        recordProp('park-fountain', p, radius + 1.5, radius + 1.5, 16, true, { park });
    };
    const gazebo = (c, r, park) => {
        const p = cellPos(c, r), g = new THREE.Group(); g.position.set(p.x, 0, p.z);
        const wood = new THREE.MeshLambertMaterial({ color: PAL.wood });
        const roof = new THREE.MeshLambertMaterial({ color: PAL.panel });
        for (const x of [-11, 11]) for (const z of [-8, 8]) box(g, wood, 2, 18, 2, x, 9, z);
        box(g, roof, 30, 2.4, 24, 0, 20, 0);
        box(g, wood, 24, 1.5, 7, 0, 4, 0);
        worldRoot.add(g); registerOccluder(g, { hx: 15, hz: 12 }, 22, 'park-gazebo');
        recordProp('park-gazebo', p, 15, 12, 22, true, { park });
    };
    const playground = (c, r, park) => {
        const p = cellPos(c, r);
        for (const x of [-9, 9]) add(2, 15, 2, p.x + x, 7.5, p.z, M.hazard);
        add(22, 2, 5, p.x, 14, p.z, M.steel);
        add(5, 2, 18, p.x + 12, 7, p.z + 6, M.panel);
        recordProp('park-playground', p, 15, 11, 16, true, { park });
    };

    for (const q of [
        [23, 55, 0, 'pocket-park'], [33, 55, 0, 'pocket-park'],
        [23, 62, 0, 'pocket-park'], [33, 62, 0, 'pocket-park'],
        [128, 46, 0, 'central-park'], [152, 46, 0, 'central-park'],
        [128, 80, 0, 'central-park'], [166, 80, Math.PI / 2, 'central-park'],
        [224, 44, 0, 'school-field'], [252, 44, 0, 'school-field'],
        [224, 60, 0, 'school-field'], [252, 60, 0, 'school-field'],
        [246, 150, 0, 'toll-garden'], [266, 150, 0, 'toll-garden'],
        [246, 116, Math.PI / 2, 'toll-garden'], [266, 116, Math.PI / 2, 'toll-garden'],
    ]) bench(...q);
    fountain(28, 58, 'pocket-park', 7);
    fountain(148, 80, 'central-park', 9);
    fountain(256, 148, 'toll-garden', 8);
    for (const q of [[28, 50, 'pocket-park'], [28, 66, 'pocket-park'],
        [136, 80, 'central-park'], [160, 44, 'central-park'],
        [230, 54, 'school-field'], [246, 54, 'school-field'],
        [244, 144, 'toll-garden'], [268, 140, 'toll-garden']]) planter(...q);
    for (const q of [[21, 54, 'pocket-park'], [35, 65, 'pocket-park'],
        [126, 52, 'central-park'], [166, 74, 'central-park'],
        [224, 52, 'school-field'], [252, 52, 'school-field'],
        [246, 122, 'toll-garden'], [266, 124, 'toll-garden']]) bin(...q);
    gazebo(162, 52, 'central-park');
    gazebo(246, 118, 'toll-garden');
    playground(238, 52, 'school-field');

    // Surface, curb, dan pulau rumput bundaran dibuat bersama-sama oleh
    // buildStreetSurfaces agar semua lapisannya konsentris dan tidak z-fighting.
    const G = ensureSurfaceGeometry(), rp = { x: G.roundX, z: G.roundZ };
    recordProp('roundabout', rp, G.roundIslandRadius, G.roundIslandRadius, 1.4, false,
        { grassIsland: true, bulletTransparent: true });
}

function buildToll(M, add) {
    // Empat gardu mengapit satu lajur tengah bebas — jalur keluar GRD LTV-45.
    for (const r of [80, 86, 98, 104]) {
        const p = cellPos(275, r);
        add(15, 12, 20, p.x, 6, p.z, M.body); add(12, 7, 20.5, p.x, 12, p.z, M.window);
        add(18, 2, 23, p.x, 17, p.z, M.hazard);
        recordProp('toll-booth', p, 7.5, 10, 18, true);
    }
    const canopyP = cellPos(270, 92), canopy = new THREE.Group(); canopy.position.set(canopyP.x, 0, canopyP.z);
    const cm = new THREE.MeshLambertMaterial({ color: PAL.panel });
    box(canopy, cm, 18 * CELL, 4, 34 * CELL, 0, 26, 0);
    for (const x of [-6 * CELL, 6 * CELL]) for (const z of [-12 * CELL, 12 * CELL])
        box(canopy, cm, 3, 26, 3, x, 13, z);
    worldRoot.add(canopy); registerOccluder(canopy,
        { hx: 9 * CELL, hz: 17 * CELL }, 30, 'toll-canopy');
    recordProp('toll-canopy', canopyP, 9 * CELL, 17 * CELL, 30, false);

    const signP = cellPos(249, 78);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(112, 18, 1.2),
        new THREE.MeshBasicMaterial({ color: PAL.white,
            map: signTexture('CISUMDAWU TOLL GATE', 'KERTAJATI AIRPORT ROUTE'), toneMapped: false }));
    sign.position.set(signP.x, 35, signP.z); worldRoot.add(sign);

    // Palang yang dihantam pada shot terakhir.
    const lane = cellPos(278, 92);
    const barrierP = { x: lane.x, z: lane.z - 24 };
    tollBarrier = new THREE.Group(); tollBarrier.position.set(barrierP.x, 0, barrierP.z); worldRoot.add(tollBarrier);
    box(tollBarrier, M.steel, 2, 8, 2, 0, 4, 0);
    const armPivot = new THREE.Group(); armPivot.position.set(0, 8, 0); tollBarrier.add(armPivot);
    box(armPivot, M.hazard, 1.6, 1.6, 48, 0, 0, 24);
    tollBarrier.userData.arm = armPivot;
    recordProp('toll-barrier', { x: lane.x, z: lane.z }, 1.2, 24, 10, true);

    tacticalVehicle = buildTacticalVehicleMesh(7, PAL.gunmetal);
    tacticalVehicle.group.position.set(VEHICLE_OBJECT.x, 0, VEHICLE_OBJECT.z);
    tacticalVehicle.group.rotation.y = 0; tacticalVehicle.baseY = 0;
    worldRoot.add(tacticalVehicle.group);
    recordProp('grd-ltv-45', VEHICLE_OBJECT, 21, 11, 19, true);
}

function machineDir(m) {
    return { x: Math.sin(m.yaw), z: Math.cos(m.yaw) };
}
function machineHatch(m) {
    const d = machineDir(m);
    return { x: m.x + d.x * 17, z: m.z + d.z * 17 };
}
function machineLanding(m, slot) {
    const d = machineDir(m), sideX = d.z, sideZ = -d.x;
    const lateral = [-13, -4.5, 4.5, 13][slot % 4];
    return {
        x: m.x + d.x * 38 + sideX * lateral,
        z: m.z + d.z * 38 + sideZ * lateral,
    };
}
function buildSpawnFactories() {
    for (const p of S7_MACHINE_POINTS) {
        const rig = buildSpawnMachineMesh(30, 20, 30);
        rig.group.position.set(p.x, 0, p.z); rig.group.rotation.y = p.yaw;
        worldRoot.add(rig.group); resetSpawnMachine(rig, false);
        const m = {
            ...p, rig, hp: 0, alive: true, active: false, hitT: 0,
            nextBatch: 0, birthCooldown: 0, pending: 0, batches: 0, spawned: 0,
        };
        spawnMachines.push(m);
        // Chassis tetap menjadi cover sesudah hancur; nav hanya dibangun sekali.
        recordProp('robot-factory', p, 17, 17, 24, true);
    }
}

// ===== BLOK KOTA =====
// Peta live sekarang hampir 2x rework sebelumnya: kalau sel '#' dibiarkan kosong jalanan
// terasa melayang di atas tanah gelap. Blok diisi gedung, TAPI kamera oblique
// memandang dari barat daya: apa pun yang berdiri antara kamera dan player akan
// menutupinya. Garis pandang kamera naik 116/100 = 1.16 unit per unit jarak, jadi
// gedung sejauh `d` unit ke arah kamera aman selama tingginya < 1.16*d. Aturan yang
// dipakai di sini SENGAJA lebih ketat (kemiringan 1.0) dan diuji smoke:
//   tinggi <= (jarak-ke-surface-walkable-dalam-sel - 1) * CELL
// Konsekuensinya deretan pertama jadi ruko rendah dan menara hanya tumbuh di dalam
// blok — persis siluet kota yang diinginkan, tanpa pernah menghalangi player.
const CITY_BLOCK = 6;        // sisi blok skyline (sel)
const CITY_SETBACK = 3;      // skyline dalam; frontage dekat punya kontrak meter sendiri

function pointAabbDistance2(px, pz, x, z, hx, hz) {
    const dx = Math.max(0, Math.abs(px - x) - hx);
    const dz = Math.max(0, Math.abs(pz - z) - hz);
    return dx * dx + dz * dz;
}
function segmentAabbDistance2(s, x, z, hx, hz) {
    const rect = { x, z, hx, hz };
    const x1 = s.x0 + s.dx, z1 = s.z0 + s.dz;
    if (segHitsRect(s.x0, s.z0, x1, z1, rect)) return 0;
    let best = Math.min(pointAabbDistance2(s.x0, s.z0, x, z, hx, hz),
        pointAabbDistance2(x1, z1, x, z, hx, hz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        best = Math.min(best, segPointDist2(s.x0, 0, s.z0, x1, 0, z1,
            x + sx * hx, 0, z + sz * hz));
    return best;
}
function rectsOverlap(x, z, hx, hz, a) {
    return x + hx >= a.x0 && x - hx <= a.x1 && z + hz >= a.z0 && z - hz <= a.z1;
}
function footprintIntrudesSurface(x, z, hx, hz) {
    const G = ensureSurfaceGeometry();
    const corridor = G.roadWidth / 2 + G.sidewalkWidth;
    if (G.roads.some(s => segmentAabbDistance2(s, x, z, hx, hz) <= corridor * corridor)
        || G.alleys.some(s => segmentAabbDistance2(s, x, z, hx, hz)
            <= (G.alleyWidth / 2) ** 2)
        || G.parks.some(a => rectsOverlap(x, z, hx, hz, a))
        || G.paved.some(a => rectsOverlap(x, z, hx, hz, a))) return true;
    const minR = Math.sqrt(pointAabbDistance2(G.roundX, G.roundZ, x, z, hx, hz));
    const maxR = Math.max(
        Math.hypot(x - hx - G.roundX, z - hz - G.roundZ),
        Math.hypot(x - hx - G.roundX, z + hz - G.roundZ),
        Math.hypot(x + hx - G.roundX, z - hz - G.roundZ),
        Math.hypot(x + hx - G.roundX, z + hz - G.roundZ));
    return maxR >= G.roundRoadInner && minR <= Math.sqrt(G.roundWalkOuter2);
}
function footprintReserved(x, z, hx, hz) {
    const c0 = worldCellX(x - hx), c1 = worldCellX(x + hx);
    const r0 = worldCellZ(z - hz), r1 = worldCellZ(z + hz);
    return reservedRects.some(v => c0 <= v.c1 && c1 >= v.c0 && r0 <= v.r1 && r1 >= v.r0)
        || frontageRecords.some(v => Math.abs(x - v.x) < hx + v.hx + 2
            && Math.abs(z - v.z) < hz + v.hz + 2);
}

// Deretan ruko/rumah/kantor membentuk tepi jalan nyata. Jarak diukur dari
// TEPI LUAR trotoar (bukan dari aspal, karena trotoarnya sendiri 2 m) dan tidak
// pernah melebihi nilai CFG. Skyline lama tetap mengisi bagian dalam blok kota.
function buildStreetFrontages() {
    const G = ensureSurfaceGeometry();
    const maxGap = streetCfg().buildingSetbackMeters * CAMP_M;
    const corridor = G.roadWidth / 2 + G.sidewalkWidth;
    const pitch = 18 * CAMP_M;
    frontageRecords.length = 0; streetEdgeCount = 0;
    for (let si = 0; si < G.roads.length; si++) {
        const s = G.roads[si], len = Math.sqrt(s.den);
        const count = Math.max(1, Math.round(len / pitch));
        const alongX = Math.abs(s.dx) >= Math.abs(s.dz);
        const slotLen = len / count;
        const lotLen = Math.max(7 * CAMP_M, Math.min(20 * CAMP_M, slotLen - 3 * CAMP_M));
        for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            const seed = (si * 11 + i * 5 + (side > 0 ? 3 : 0)) % 17;
            const depth = (6 + (seed % 3)) * CAMP_M;
            // Verge 1,4â€“1,5 m memberi ruang nyata untuk batang pohon dan tiang
            // di depan fasad, tetapi tetap tidak pernah melewati batas 1,5 m.
            const gap = maxGap * (0.94 + (seed % 4) * 0.015);
            const nx = alongX ? 0 : 1, nz = alongX ? 1 : 0;
            const off = corridor + gap + depth / 2;
            const x = s.x0 + s.dx * t + nx * side * off;
            const z = s.z0 + s.dz * t + nz * side * off;
            const hx = alongX ? lotLen / 2 : depth / 2;
            const hz = alongX ? depth / 2 : lotLen / 2;
            const kind = ['ruko', 'house', 'shop', 'office'][seed % 4];
            const vergeOccupied = [...lampSpecs, ...streetTreeSpecs].some(q => alongX
                ? Math.abs(q.x - x) <= hx + 5 && Math.abs(q.z - z) <= hz + maxGap
                : Math.abs(q.z - z) <= hz + 5 && Math.abs(q.x - x) <= hx + maxGap);
            const hasAwning = (kind === 'shop' || kind === 'ruko') && !vergeOccupied;
            // Validasi memakai footprint VISUAL terluar (atap/awning), bukan hanya
            // kotak badan gedung. Dengan demikian angka debug adalah hasil ukur,
            // bukan salinan dari nilai yang diminta generator.
            const visualHx = hx + (alongX ? 1 : hasAwning ? 5 : 1);
            const visualHz = hz + (alongX ? (hasAwning ? 5 : 1) : 1);
            const intrusion = footprintIntrudesSurface(x, z, visualHx, visualHz);
            if (x - visualHx < MAP_X0 || x + visualHx > MAP_X0 + MAP_COLS * CELL
                || z - visualHz < MAP_Z0 || z + visualHz > MAP_Z0 + MAP_ROWS * CELL
                || intrusion || footprintReserved(x, z, visualHx, visualHz)) continue;
            const measuredGap = Math.max(0, (alongX
                ? Math.abs(z - s.z0) - visualHz
                : Math.abs(x - s.x0) - visualHx) - corridor);
            const h = (kind === 'office' ? 8.5 : kind === 'house' ? 4.2 : 5.4
                + (seed % 3) * 0.55) * CAMP_M;
            const g = new THREE.Group(); g.position.set(x, 0, z);
            g.name = `stage7-frontage-${s.id}-${side}-${i}`;
            const wall = new THREE.MeshLambertMaterial({ color:
                kind === 'office' ? PAL.gunmetal : kind === 'house' ? PAL.concrete : PAL.panel });
            const roof = new THREE.MeshLambertMaterial({ color: kind === 'house' ? PAL.wood : PAL.steel });
            const window = new THREE.MeshBasicMaterial({ color: seed % 3 ? PAL.amber : PAL.tech,
                toneMapped: false });
            box(g, wall, alongX ? lotLen : depth, h, alongX ? depth : lotLen,
                0, h / 2, 0);
            box(g, roof, alongX ? lotLen + 2 : depth + 2, 1.5,
                alongX ? depth + 2 : lotLen + 2, 0, h + 0.75, 0);
            const front = -side;
            if (alongX) {
                box(g, window, lotLen * 0.76, Math.min(10, h * 0.3), 1,
                    0, Math.min(h - 6, 12), front * (depth / 2 + 0.55));
                if (hasAwning) box(g, roof, lotLen * 0.9, 1.2, 5,
                    0, 13, front * (depth / 2 + 2.5));
            } else {
                box(g, window, 1, Math.min(10, h * 0.3), lotLen * 0.76,
                    front * (depth / 2 + 0.55), Math.min(h - 6, 12), 0);
                if (hasAwning) box(g, roof, 5, 1.2, lotLen * 0.9,
                    front * (depth / 2 + 2.5), 13, 0);
            }
            const facade = mergeObjectInPlace(g); worldRoot.add(facade);
            registerOccluder(facade, { hx: visualHx, hz: visualHz }, h + 1.5,
                'frontage-building');
            reserveWorldRect(x, z, visualHx, visualHz);
            const rec = { x, z, hx: visualHx, hz: visualHz, bodyHx: hx, bodyHz: hz,
                top: h + 1.5, kind, segment: s.id, intrusion,
                requestedSetbackMeters: gap / CAMP_M,
                setback: measuredGap, setbackMeters: measuredGap / CAMP_M,
                frontageSpanMeters: lotLen / CAMP_M };
            frontageRecords.push(rec); streetEdgeCount++;
            recordProp('frontage-building', { x, z }, visualHx, visualHz, h + 1.5, false,
                { buildingKind: kind, setbackMeters: measuredGap / CAMP_M, segment: s.id });
        }
    }
}

function surfaceDistanceField() {
    const n = MAP_COLS * MAP_ROWS, dist = new Int16Array(n).fill(-1), q = new Int32Array(n);
    let head = 0, tail = 0;
    for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++)
        if (S7_MAP[r][c] !== '#') { dist[r * MAP_COLS + c] = 0; q[tail++] = r * MAP_COLS + c; }
    while (head < tail) {
        const cur = q[head++], c = cur % MAP_COLS, r = (cur / MAP_COLS) | 0, d = dist[cur] + 1;
        if (c > 0 && dist[cur - 1] < 0) { dist[cur - 1] = d; q[tail++] = cur - 1; }
        if (c < MAP_COLS - 1 && dist[cur + 1] < 0) { dist[cur + 1] = d; q[tail++] = cur + 1; }
        if (r > 0 && dist[cur - MAP_COLS] < 0) { dist[cur - MAP_COLS] = d; q[tail++] = cur - MAP_COLS; }
        if (r < MAP_ROWS - 1 && dist[cur + MAP_COLS] < 0) { dist[cur + MAP_COLS] = d; q[tail++] = cur + MAP_COLS; }
    }
    return dist;
}
export const cityHeightCap = dmin => (dmin - 1) * CELL;
function blockNoise(c, r) {
    let h = Math.imul(c + 7, 73856093) ^ Math.imul(r + 13, 19349663);
    h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13;
    return ((h >>> 0) % 10007) / 10007;
}
function blockReserved(c0, r0) {
    const c1 = c0 + CITY_BLOCK - 1, r1 = r0 + CITY_BLOCK - 1;
    return reservedRects.some(v => c0 <= v.c1 && c1 >= v.c0 && r0 <= v.r1 && r1 >= v.r0);
}

function buildCityBlocks(M, add) {
    const dist = surfaceDistanceField();
    for (let r0 = 0; r0 + CITY_BLOCK <= MAP_ROWS; r0 += CITY_BLOCK)
        for (let c0 = 0; c0 + CITY_BLOCK <= MAP_COLS; c0 += CITY_BLOCK) {
            let dmin = 1e9;
            for (let r = r0; r < r0 + CITY_BLOCK; r++)
                for (let c = c0; c < c0 + CITY_BLOCK; c++)
                    dmin = Math.min(dmin, dist[r * MAP_COLS + c]);
            if (dmin < CITY_SETBACK || blockReserved(c0, r0)) continue;
            const n = blockNoise(c0, r0);
            const h = Math.max(12, Math.min(20 + n * 94, cityHeightCap(dmin)));
            const p = mapCellPos(c0 + (CITY_BLOCK - 1) / 2, r0 + (CITY_BLOCK - 1) / 2);
            const w = (CITY_BLOCK - 0.8) * CELL;
            let kind, actualTop = h;
            if (n < 0.24) {
                kind = 'house'; const bh = h * 0.72;
                add(w, bh, w * 0.82, p.x, bh / 2, p.z, M.warmWall);
                const roofDepth = w * 0.52;
                const rise = Math.max(0.2, h - bh - 0.8);
                const angle = Math.asin(Math.min(0.42, rise / roofDepth));
                const roofY = bh + Math.sin(angle) * roofDepth / 2;
                for (const side of [-1, 1]) {
                    const roof = add(w + 3, 1.4, roofDepth, p.x, roofY,
                        p.z + side * w * 0.2, M.wood);
                    roof.rotation.x = side * angle;
                }
                actualTop = roofY + Math.sin(angle) * roofDepth / 2 + Math.cos(angle) * 0.7;
            } else if (n < 0.48) {
                kind = 'shop'; const bh = h * 0.82;
                add(w, bh, w, p.x, bh / 2, p.z, M.blockWarm);
                add(w * 0.9, Math.min(8, bh * 0.3), 1, p.x, Math.min(8, bh * 0.35),
                    p.z + w / 2 + 0.6, M.window);
                add(w + 4, 1.4, 10, p.x, Math.min(h - 1, bh * 0.72), p.z + w / 2 + 4, M.wood);
            } else if (n < 0.78) {
                kind = 'office';
                add(w, h * 0.72, w, p.x, h * 0.36, p.z, M.blockCool);
                add(w * 0.78, h * 0.25, w * 0.78, p.x, h * 0.845, p.z, M.panel);
                add(w * 0.82, 2.2, w + 0.8, p.x, Math.min(h - 2, h * 0.46), p.z, M.window);
            } else {
                kind = 'ruko';
                add(w, h, w, p.x, h / 2, p.z, M.blockWarm);
                add(w * 1.04, 3, w * 1.04, p.x, Math.min(h - 1.5, 9), p.z, M.concrete);
                add(w * 0.72, 2.4, w * 0.72, p.x, h - 1.2, p.z, M.ink);
            }
            cityBlocks.push({ c: c0, r: r0, dmin, h, actualTop, kind, x: p.x, z: p.z });
        }
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
        const s = S7_ROAD_SEGMENTS[i % S7_ROAD_SEGMENTS.length];
        const p = cellPos((s.c0 + s.c1) / 2, (s.r0 + s.r1) / 2);
        const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 16), rippleMat);
        m.rotation.x = -Math.PI / 2; m.position.set(p.x + rand(-28, 28), 0.34, p.z + rand(-20, 20));
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

// Satu-satunya pembuat surface jalan: exact-width asphalt, sidewalk, alley,
// parks, concrete plaza, serta annulus bundaran.
function buildStreetSurfaces(M, add, staticProps) {
    const G = ensureSurfaceGeometry();
    const rw = G.roadWidth, sw = G.sidewalkWidth, aw = G.alleyWidth;
    const corridor = rw / 2 + sw;
    streetSurfaces.length = 0; intersectionSurfaces.length = 0; turnSurfaces.length = 0;
    parkSurfaces.length = 0; streetEdgeCount = 0;
    const disc = (radius, x, z, mat, y) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), mat);
        m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
        staticProps.push(m);
    };
    S7_ROAD_SEGMENTS.forEach((s, index) => {
        const a = cellPos(s.c0, s.r0), b = cellPos(s.c1, s.r1);
        const rawDx = b.x - a.x, rawDz = b.z - a.z;
        const len = Math.hypot(rawDx, rawDz), ux = rawDx / len, uz = rawDz / len;
        const elbowAt = p => G.elbows.find(q => q.segmentIds.includes(s.id)
            && Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6);
        const elbowA = elbowAt(a), elbowB = elbowAt(b);
        const trimA = elbowA ? elbowA.radius : 0, trimB = elbowB ? elbowB.radius : 0;
        const aa = { x: a.x + ux * trimA, z: a.z + uz * trimA };
        const bb = { x: b.x - ux * trimB, z: b.z - uz * trimB };
        const dx = bb.x - aa.x, dz = bb.z - aa.z;
        const straightLen = Math.hypot(dx, dz), alongX = Math.abs(dx) >= Math.abs(dz);
        const cx = (aa.x + bb.x) / 2, cz = (aa.z + bb.z) / 2;
        const nx = alongX ? 0 : 1, nz = alongX ? 1 : 0;
        for (const side of [-1, 1]) {
            const off = side * (rw / 2 + sw / 2);
            add(alongX ? straightLen : sw, 0.7, alongX ? sw : straightLen,
                cx + nx * off, -0.16 + index * 0.0008, cz + nz * off, M.sidewalk);
        }
        add(alongX ? straightLen : rw, 0.48, alongX ? rw : straightLen,
            cx, -0.04 + index * 0.0008, cz, M.road);
        // Endpoint siku TIDAK mendapat disc: ia sudah dipotong di tangent point
        // dan akan disambung oleh annulus tikungan di bawah.
        for (const [p, elbow] of [[a, elbowA], [b, elbowB]]) if (!elbow) {
            disc(rw / 2 + sw, p.x, p.z, M.sidewalk, 0.19 + index * 0.0008);
            disc(rw / 2, p.x, p.z, M.road, 0.205 + index * 0.0008);
        }
        const dashCount = Math.max(1, Math.floor(straightLen / (8 * CAMP_M)));
        for (let i = 0; i <= dashCount; i++) {
            if ((i === 0 && elbowA) || (i === dashCount && elbowB)) continue;
            const k = dashCount ? i / dashCount : 0.5;
            const p = { x: aa.x + dx * k, z: aa.z + dz * k };
            // Marka tengah berhenti sebelum zebra/stop line dan tidak menerobos
            // conflict box simpang seperti pada builder capsule lama.
            if (G.intersections.some(q => Math.hypot(p.x - q.x, p.z - q.z)
                < corridor + 4.2 * CAMP_M)
                || Math.hypot(p.x - G.roundX, p.z - G.roundZ)
                    < G.roundRoadOuter + 4 * CAMP_M) continue;
            add(alongX ? 3 * CAMP_M : 0.55, 0.1, alongX ? 0.55 : 3 * CAMP_M,
                p.x, 0.25, p.z, M.white);
        }
        streetSurfaces.push({ id: s.id, kind: 'straight', capShape: 'capsule', asphaltWidth: rw,
            sidewalkLeft: sw, sidewalkRight: sw, length: len,
            renderedStraightLength: straightLen, turnTrimStart: trimA, turnTrimEnd: trimB });
    });

    // Tikungan siku memakai tiga annulus konsentris. Tidak ada disc/end-cap pada
    // node lama, jadi lebar aspal dan kedua trotoar tetap konstan sepanjang busur.
    const thetaForWorld = (x, z) => {
        const t = Math.atan2(-z, x); return t < 0 ? t + Math.PI * 2 : t;
    };
    const elbowArc = q => {
        let start = thetaForWorld(-q.vx, -q.vz);
        let end = thetaForWorld(-q.ux, -q.uz);
        let span = (end - start + Math.PI * 2) % (Math.PI * 2);
        if (span > Math.PI) {
            const swap = start; start = end; end = swap;
            span = (end - start + Math.PI * 2) % (Math.PI * 2);
        }
        return { start, span };
    };
    const arcRing = (q, inner, outer, mat, y, start, span, segments = 28) => {
        const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, segments, 1,
            start, span), mat);
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(q.cx, y, q.cz);
        mesh.receiveShadow = true; staticProps.push(mesh); return mesh;
    };
    for (const q of G.elbows) {
        const { start, span } = elbowArc(q);
        const innerWalk = q.radius - corridor, innerRoad = q.radius - rw / 2;
        const outerRoad = q.radius + rw / 2, outerWalk = q.radius + corridor;
        arcRing(q, innerWalk, innerRoad, M.sidewalk, 0.34, start, span);
        arcRing(q, innerRoad, outerRoad, M.road, 0.345, start, span);
        arcRing(q, outerRoad, outerWalk, M.sidewalk, 0.34, start, span);
        const curbW = 0.16 * CAMP_M;
        arcRing(q, innerRoad - curbW / 2, innerRoad + curbW / 2,
            M.white, 0.365, start, span);
        arcRing(q, outerRoad - curbW / 2, outerRoad + curbW / 2,
            M.white, 0.365, start, span);
        const curvedDashes = 4;
        for (let i = 0; i < curvedDashes; i++) {
            const theta = start + span * ((i + 0.5) / curvedDashes);
            const x = q.cx + Math.cos(theta) * q.radius;
            const z = q.cz - Math.sin(theta) * q.radius;
            const tx = -Math.sin(theta), tz = -Math.cos(theta);
            const dash = add(1.8 * CAMP_M, 0.1, 0.55, x, 0.37, z, M.white);
            dash.rotation.y = Math.atan2(-tz, tx);
        }
        const mid = start + span / 2, mx = Math.cos(mid), mz = -Math.sin(mid);
        const tokenAtRadius = r => surfaceTokenAt(q.cx + mx * r, q.cz + mz * r);
        turnSurfaces.push({ id: q.id, kind: 'rounded-elbow', x: q.x, z: q.z,
            centerX: q.cx, centerZ: q.cz, segmentIds: [...q.segmentIds],
            radius: q.radius, arcRadians: span, asphaltWidth: outerRoad - innerRoad,
            sidewalkInner: innerRoad - innerWalk, sidewalkOuter: outerWalk - outerRoad,
            roadInner: innerRoad, roadOuter: outerRoad, innerWalk, outerWalk,
            curvedDashes, endCapsAtCorner: 0, samples: {
                road: tokenAtRadius(q.radius),
                innerSidewalk: tokenAtRadius((innerWalk + innerRoad) / 2),
                outerSidewalk: tokenAtRadius((outerRoad + outerWalk) / 2),
                blockedInside: tokenAtRadius(innerWalk - 0.5 * CAMP_M),
            } });
    }

    // Simpang T/perempatan nyata: pusat dan lengan aspal dilapis ulang setelah
    // sidewalk ruas. Sudut di antara dua lengan aktif mendapat fillet aspal dan
    // quarter-disc curb; sisi buntu simpang T tetap menjadi trotoar lurus.
    const cornerStart = (sx, sz) => sx > 0
        ? (sz > 0 ? Math.PI / 2 : Math.PI)
        : (sz > 0 ? 0 : Math.PI * 1.5);
    const crossDepth = 2.8 * CAMP_M, crossInset = 0.25 * CAMP_M;
    const stripeThickness = 0.34 * CAMP_M, stripeCount = 5;
    const usableCrossing = rw - 1.2 * CAMP_M;
    const armDirs = {
        west: { x: -1, z: 0 }, east: { x: 1, z: 0 },
        north: { x: 0, z: -1 }, south: { x: 0, z: 1 },
    };
    for (const q of G.intersections) {
        add(rw, 0.1, rw, q.x, 0.27, q.z, M.road);
        for (const arm of q.arms) {
            const dir = armDirs[arm];
            add(dir.x ? sw : rw, 0.1, dir.x ? rw : sw,
                q.x + dir.x * (rw / 2 + sw / 2), 0.27,
                q.z + dir.z * (rw / 2 + sw / 2), M.road);
        }
        const activeCorners = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const armX = sx < 0 ? 'west' : 'east';
            const armZ = sz < 0 ? 'north' : 'south';
            if (!q.arms.includes(armX) || !q.arms.includes(armZ)) continue;
            activeCorners.push({ sx, sz });
            add(sw, 0.1, sw, q.x + sx * (rw / 2 + sw / 2), 0.27,
                q.z + sz * (rw / 2 + sw / 2), M.road);
            const start = cornerStart(sx, sz);
            const corner = new THREE.Mesh(new THREE.CircleGeometry(sw, 18, start, Math.PI / 2),
                M.sidewalk);
            corner.rotation.x = -Math.PI / 2;
            corner.position.set(q.x + sx * corridor, 0.35, q.z + sz * corridor);
            corner.receiveShadow = true; staticProps.push(corner);
            const curb = new THREE.Mesh(new THREE.RingGeometry(sw - 0.18 * CAMP_M, sw,
                18, 1, start, Math.PI / 2), M.white);
            curb.rotation.x = -Math.PI / 2;
            curb.position.set(corner.position.x, 0.365, corner.position.z);
            curb.receiveShadow = true; staticProps.push(curb);
        }
        for (const arm of q.arms) {
            const dir = armDirs[arm];
            const crossCenter = corridor + crossDepth / 2 + crossInset;
            for (let i = 0; i < stripeCount; i++) {
                // Batang zebra memanjang SEJAJAR arah jalan; deret batangnya
                // menyebar pada sumbu melintang jalan. Implementasi sebelumnya
                // menukar kedua sumbu ini sehingga terlihat seperti palang penuh.
                const across = (i - (stripeCount - 1) / 2)
                    * (usableCrossing / stripeCount);
                const x = q.x + dir.x * crossCenter + (dir.z ? across : 0);
                const z = q.z + dir.z * crossCenter + (dir.x ? across : 0);
                add(dir.x ? crossDepth : stripeThickness, 0.07,
                    dir.x ? stripeThickness : crossDepth, x, 0.37, z, M.white);
            }
            const stopDist = corridor + crossDepth + 0.55 * CAMP_M;
            add(dir.x ? 0.28 * CAMP_M : usableCrossing, 0.07,
                dir.x ? usableCrossing : 0.28 * CAMP_M,
                q.x + dir.x * stopDist, 0.365, q.z + dir.z * stopDist, M.white);
        }
        const sample = activeCorners[0];
        const missingArm = Object.keys(armDirs).find(arm => !q.arms.includes(arm));
        const missingDir = missingArm ? armDirs[missingArm] : null;
        intersectionSurfaces.push({ id: q.id,
            kind: q.arms.length === 4 ? 'four-way' : 'three-way', x: q.x, z: q.z,
            arms: [...q.arms], asphaltSpan: corridor * 2, cornerRadius: sw,
            missingArm: missingArm || null,
            roundedCorners: activeCorners.length,
            crosswalks: q.arms.length, stripesPerCrosswalk: stripeCount,
            stopLines: q.arms.length,
            centerDashes: 0, crosswalkDepth: crossDepth,
            crosswalkAxes: q.arms.map(arm => ({ arm,
                roadAxis: arm === 'west' || arm === 'east' ? 'x' : 'z',
                stripeAxis: arm === 'west' || arm === 'east' ? 'x' : 'z',
                repeatAxis: arm === 'west' || arm === 'east' ? 'z' : 'x' })),
            samples: {
                center: surfaceTokenAt(q.x, q.z),
                roundedCurb: surfaceTokenAt(q.x + sample.sx * (corridor - sw * 0.25),
                    q.z + sample.sz * (corridor - sw * 0.25)),
                asphaltFillet: surfaceTokenAt(q.x + sample.sx * (rw / 2 + sw * 0.1),
                    q.z + sample.sz * (rw / 2 + sw * 0.1)),
                closedSide: missingDir ? surfaceTokenAt(
                    q.x + missingDir.x * (rw / 2 + sw / 2),
                    q.z + missingDir.z * (rw / 2 + sw / 2)) : null,
            } });
    }

    S7_ALLEY_SEGMENTS.forEach((s, index) => {
        const a = cellPos(s.c0, s.r0), b = cellPos(s.c1, s.r1);
        const dx = b.x - a.x, dz = b.z - a.z, alongX = Math.abs(dx) >= Math.abs(dz);
        const len = Math.hypot(dx, dz);
        add(alongX ? len : aw, 0.42, alongX ? aw : len,
            (a.x + b.x) / 2, 0.01 + index * 0.001, (a.z + b.z) / 2, M.cobble);
        disc(aw / 2, a.x, a.z, M.cobble, 0.225 + index * 0.001);
        disc(aw / 2, b.x, b.z, M.cobble, 0.225 + index * 0.001);
    });

    for (const p of S7_PARKS) {
        const a = cellPos(p.c0, p.r0), b = cellPos(p.c1, p.r1);
        const w = Math.abs(b.x - a.x) + CELL, d = Math.abs(b.z - a.z) + CELL;
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        add(w, 0.55, d, cx, -0.18, cz, M.grass);
        add(w * 0.72, 0.16, 2 * CAMP_M, cx, 0.18, cz, M.parkPath);
        add(2 * CAMP_M, 0.17, d * 0.66, cx, 0.19, cz, M.parkPath);
        parkSurfaces.push({ id: p.id, width: w, depth: d, area: w * d, required: p.required });
    }
    for (const q of S7_PAVED_AREAS) {
        const a = cellPos(q.c0, q.r0), b = cellPos(q.c1, q.r1);
        add(Math.abs(b.x - a.x) + CELL, 0.58, Math.abs(b.z - a.z) + CELL,
            (a.x + b.x) / 2, -0.16, (a.z + b.z) / 2, M.concrete);
    }

    const rp = { x: G.roundX, z: G.roundZ }, cr = G.roundRadius;
    const ring = (inner, outer, mat, y, segments = 96) => {
        const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, segments), mat);
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(rp.x, y, rp.z); mesh.receiveShadow = true;
        staticProps.push(mesh);
    };
    // Susunan dari tengah ke luar: rumput, curb rendah berwarna peringatan,
    // aspal satu lajur sirkulasi, lalu trotoar luar. Tidak ada trotoar dalam.
    disc(G.roundIslandRadius, rp.x, rp.z, M.grass, 0.30);
    ring(G.roundIslandRadius, G.roundRoadInner, M.concrete, 0.32);
    const curbTrim = 0.12 * CAMP_M;
    ring(G.roundRoadInner - curbTrim, G.roundRoadInner, M.hazard, 0.37);
    ring(G.roundRoadInner, G.roundRoadOuter, M.road, 0.205);
    ring(G.roundRoadOuter, Math.sqrt(G.roundWalkOuter2), M.sidewalk, 0.19);

    // Empat garis give-way terputus berada melintang terhadap arah kendaraan.
    // Tiap batang pendek, bukan zebra panjang, sehingga mulut bundaran terbaca
    // jelas tanpa membuat lingkaran marka palsu di tengah lajur.
    const yieldEntries = 4, yieldDashes = 6;
    const entryDirs = [{ x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 }];
    const yieldDist = G.roundRoadOuter + 1.2 * CAMP_M;
    const acrossSpan = rw - 1.25 * CAMP_M;
    for (const dir of entryDirs) for (let i = 0; i < yieldDashes; i++) {
        const across = (i - (yieldDashes - 1) / 2) * (acrossSpan / yieldDashes);
        const x = rp.x + dir.x * yieldDist + (dir.z ? across : 0);
        const z = rp.z + dir.z * yieldDist + (dir.x ? across : 0);
        add(dir.x ? 0.22 * CAMP_M : 0.72 * CAMP_M, 0.08,
            dir.x ? 0.72 * CAMP_M : 0.22 * CAMP_M, x, 0.38, z, M.white);
    }
    streetSurfaces.push({ id: S7_ROUNDABOUT.id, kind: 'roundabout', asphaltWidth: rw,
        x: rp.x, z: rp.z, sidewalkLeft: 0, sidewalkRight: sw, radius: cr,
        roadInner: G.roundRoadInner, roadOuter: G.roundRoadOuter,
        islandRadius: G.roundIslandRadius, curbWidth: G.roundCurbWidth,
        grassIsland: true, innerSidewalk: 0, outerSidewalk: sw,
        yieldEntries, yieldDashesPerEntry: yieldDashes,
        bulletTransparentIsland: true, collisionMode: 'radial-slide' });
}

function buildWorld() {
    ensureLayoutMap();
    worldRoot = new THREE.Group(); scene.add(worldRoot);
    const M = {
        ground: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        road: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        sidewalk: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        cobble: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        grass: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        parkPath: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        leaf: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        warmWall: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        blockWarm: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        blockCool: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        techGlow: new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false }),
        amberGlow: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
        window: new THREE.MeshLambertMaterial({ color: PAL.screenBg }),
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
    // Lapisan datar tidak sebidang: tanah -> taman/plaza/trotoar -> aspal/marka.
    add(MAP_COLS * CELL, 1.5, MAP_ROWS * CELL, OX, -0.8, OZ, M.ground);
    buildStreetSurfaces(M, add, staticProps);

    buildStreetProps(M, add); buildMazeLandmarks(M, add); buildToll(M, add);
    buildSpawnFactories();
    buildStreetFrontages();
    buildCityBlocks(M, add);

    // Gerbang HQ di belakang titik start.
    const hp = cellPos(1, 92);
    add(12, 46, 15 * CELL, hp.x - 18, 23, hp.z, M.body);
    const hqSign = new THREE.Mesh(new THREE.BoxGeometry(58, 15, 1.2),
        new THREE.MeshBasicMaterial({ color: PAL.white,
            map: signTexture('BANDUNG HEADQUARTERS', 'LOCKDOWN — OUTER GATE'), toneMapped: false }));
    hqSign.position.set(hp.x - 10, 33, hp.z); hqSign.rotation.y = Math.PI / 2; worldRoot.add(hqSign);

    // Siluet gunung tetap sebagai identitas Bandung di luar kota.
    for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(96 + (i % 3) * 30, 150 + (i % 2) * 48, 5),
            i % 2 ? M.body : M.ink);
        m.position.set(MAP_X0 + 90 + i * 235, 46, MAP_Z0 - 175 - (i % 3) * 38);
        m.rotation.y = i * 0.31; staticProps.push(m);
    }

    // Papan lingkungan memberi petunjuk puzzle tanpa penanda radar ke finish.
    for (const [p, title, sub, yaw] of [
        [cellPos(44, 86), 'OLD BANDUNG', 'LOCAL STREETS', Math.PI / 2],
        [cellPos(94, 58), 'PEDESTRIAN PASSAGE', 'CITY PARK', 0],
        [cellPos(198, 76), 'CIVIC ROUNDABOUT', 'TOLL DISTRICT', Math.PI / 2],
        [cellPos(226, 130), 'LOCAL ACCESS', 'GARDEN WALK', 0],
    ]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(45, 12, 1),
            new THREE.MeshBasicMaterial({ color: PAL.white, map: signTexture(title, sub), toneMapped: false }));
        s.position.set(p.x, 22, p.z); s.rotation.y = yaw; staticProps.push(s);
    }

    staticBatch = addMergedStatic(worldRoot, staticProps);

    markerAt('maze-entry', S7_MAZE_ENTRY, PAL.amber);
    markerAt('toll', S7_TOLL, PAL.amber);
    markerAt('vehicle', S7_VEHICLE, PAL.amber);

    buildFxPools(M);
    // PointLight tetap 14 dan dipilih merata dari seluruh tiang visual.
    const litSpecs = Array.from({ length: Math.min(STAGE_POINT_LIGHTS, lampSpecs.length) }, (_, i) =>
        lampSpecs[Math.min(lampSpecs.length - 1, Math.floor((i + 0.5) * lampSpecs.length
            / Math.min(STAGE_POINT_LIGHTS, lampSpecs.length)))]);
    for (const spec of litSpecs) {
        const tip = lampTip(spec);
        const L = new THREE.PointLight(spec.cold ? PAL.tech : PAL.amber, 0.44, 165);
        L.position.set(tip.x, 25, tip.z); scene.add(L); registerStageLight('campaign-7', L); stageLights.push(L);
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
    for (const p of CITY_SUPPLIES) placeSupply(p);
    for (const p of CITY_CRATES) spawnCrate(p.x, p.z, 0);
    for (const [c, r] of CITY_BARRELS) {
        const p = cellPos(c, r); spawnBarrel(p.x, p.z, 0);
    }
}
function setMarkers(names) {
    const wanted = new Set(names);
    for (const [name, m] of Object.entries(markers)) m.visible = wanted.has(name);
}
const distanceTo = p => Math.hypot(camera.position.x - p.x, camera.position.z - p.z);

const machineConfig = () => CFG.campaign.stage7.spawnMachines;
const machinesAlive = () => spawnMachines.reduce((n, m) => n + (m.alive ? 1 : 0), 0);
const factoryRobotCount = () => robots.reduce((n, z) =>
    n + (z.stage === 7 && String(z.encounter).startsWith('factory-') ? 1 : 0), 0);

function randomMachineClass() {
    const mix = machineConfig().classMix;
    const c = Math.max(0, mix.C || 0), b = Math.max(0, mix.B || 0), a = Math.max(0, mix.A || 0);
    const total = c + b + a;
    if (!(total > 0)) return 'C';
    const roll = Math.random() * total;
    return roll < c ? 'C' : (roll < c + b ? 'B' : 'A');
}

function spawnMachineBirth(m, slot) {
    const start = machineHatch(m), target = machineLanding(m, slot);
    const z = spawnOne(randomMachineClass(), start, `factory-${m.id}`, false);
    const base = z.scl || 1;
    z.state = 'idle'; z.machineBirth = true; z.moving = false; z.aiming = false;
    z.mesh.scale.set(base * 0.06, base * 0.025, base * 0.06);
    z.mesh.rotation.y = m.yaw;
    machineBirths.push({ z, m, t: 0, base, start, target });
    m.spawned++;
    spawnGroundPuff(start.x, start.z, PAL.tech, 10, 1.1);
    spawnBloodBurst(start.x, 9, start.z, -1, 0, 8, 0.9, 2.4, PAL.tech);
    playSFX(sfxRobotSpawn, 0.48);
}

function updateMachineBirths(dt) {
    const sec = Math.max(0.1, machineConfig().birthSec);
    for (let i = machineBirths.length - 1; i >= 0; i--) {
        const b = machineBirths[i];
        if (robots.indexOf(b.z) < 0 || b.z.hp <= 0) {
            b.z.mesh.scale.setScalar(b.base); b.z.machineBirth = false;
            machineBirths.splice(i, 1); continue;
        }
        b.t += dt;
        const k = Math.min(1, b.t / sec), grow = Math.min(1, k / 0.62);
        const g = grow * grow * (3 - 2 * grow), eject = Math.max(0, (k - 0.28) / 0.72);
        const e = 1 - (1 - Math.min(1, eject)) ** 2;
        b.z.mesh.position.x = b.start.x + (b.target.x - b.start.x) * e;
        b.z.mesh.position.z = b.start.z + (b.target.z - b.start.z) * e;
        b.z.mesh.position.y = Math.sin(e * Math.PI) * 5;
        b.z.mesh.scale.set(b.base * (0.06 + g * 0.94),
            b.base * (0.025 + g * 0.975), b.base * (0.06 + g * 0.94));
        if (k >= 1) {
            b.z.mesh.position.set(b.target.x, 0, b.target.z); b.z.mesh.scale.setScalar(b.base);
            b.z.machineBirth = false; b.z.state = 'chasing'; b.z.moving = false; b.z.aiming = false;
            spawnGroundPuff(b.target.x, b.target.z, PAL.techDim, 7, 0.7);
            machineBirths.splice(i, 1);
        }
    }
}

function destroyMachine(m) {
    if (!m.alive) return;
    m.alive = false; m.active = false; m.hp = 0; m.pending = 0; m.hitT = 0;
    resetSpawnMachine(m.rig, false);
    explodeAt(new THREE.Vector3(m.x, 13, m.z), 32, 1);
    spawnGibs(m.x, 15, m.z, 16, -1, 0, 2.6, PAL.gunmetal, 0.4, PAL.ink);
    spawnBloodDecal(m.x, m.z, 8, PAL.ink); addCamShake(9);
    const left = machinesAlive();
    showStageMsg(`ROBOT FACTORY DESTROYED — ${left}/3 REMAINING`, 3200);
    if (left === 0) {
        // Runtuhnya jaringan mematikan semua hasil cetak yang masih aktif;
        // kemenangan ditentukan oleh tiga chassis, bukan wave tersembunyi.
        for (const z of robots) if (z.stage === 7 && String(z.encounter).startsWith('factory-')) z.hp = 0;
        showStageMsg('FACTORY NETWORK COLLAPSED — GRD LTV-45 ACCESS OPEN', 4600);
        addCamShake(13);
    }
}

function machineBulletHit(b) {
    if (phase !== 'factorySiege') return false;
    const r2 = machineConfig().hitRadius ** 2;
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    for (const m of spawnMachines) {
        if (!m.alive || segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.x, 0, m.z) >= r2) continue;
        m.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage)
            * (b.explosive ? 1 : (player.dmgMul || 1));
        if (!b.explosive) {
            stats.hits++;
            spawnBloodBurst(bx, 12 + Math.random() * 5, bz, b.dir?.x || -1, b.dir?.z || 0,
                3, 0.65, 1.5, 0xffb24a);
        }
        m.hitT = 1;
        if (m.hp <= 0) destroyMachine(m);
        return true;
    }
    return false;
}

function startFactorySiege() {
    phase = 'factorySiege'; setMarkers([]);
    const C = machineConfig();
    for (const m of spawnMachines) {
        m.active = m.alive = true; m.hp = C.hp; m.clock = 0;
        m.nextBatch = Math.max(0, C.firstBatchSec); m.birthCooldown = 0;
        m.pending = m.batches = m.spawned = 0; m.hitT = 0;
        resetSpawnMachine(m.rig, true);
    }
    showStageMsg('THREE ROBOT FACTORIES ONLINE — DESTROY ALL THREE', 4800);
    addCamShake(3.5);
}

function updateSpawnFactories(dt) {
    const C = machineConfig();
    const batchCount = Math.max(1, C.batchCount | 0);
    const batchSec = Math.max(0.1, C.batchSec);
    const birthGap = Math.max(0.01, C.birthGapSec);
    for (const m of spawnMachines) {
        if (m.hitT > 0) m.hitT = Math.max(0, m.hitT - dt * 4.5);
        if (phase === 'factorySiege' && m.alive && m.active) {
            m.clock += dt; m.birthCooldown -= dt;
            while (m.clock >= m.nextBatch) {
                m.pending += batchCount; m.batches++; m.nextBatch += batchSec;
                if (m.id === 'west') {
                    showStageMsg(`FACTORIES FABRICATING — ${batchCount} ROBOTS EACH`, 2200);
                    addCamShake(1.4);
                }
            }
            while (m.pending > 0 && m.birthCooldown <= 0) {
                spawnMachineBirth(m, m.spawned % batchCount);
                m.pending--; m.birthCooldown += birthGap;
            }
        }
        updateSpawnMachine(m.rig, dt, m.active && m.alive, m.hitT);
    }
    updateMachineBirths(dt);
    if (phase === 'factorySiege' && machinesAlive() === 0 && factoryRobotCount() === 0) {
        phase = 'vehicleReveal'; setMarkers(['vehicle']);
        showStageMsg('TACTICAL VEHICLE LOCATED — INSPECT THE GRD LTV-45', 4800);
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
    if (tollBarrier?.userData.arm) tollBarrier.userData.arm.rotation.x = -1.5;
    if (tacticalVehicle) {
        resetTacticalVehicleVisual(tacticalVehicle);
        tacticalVehicle.group.position.x = VEHICLE_OBJECT.x + 185;
        updateTacticalVehicleVisual(tacticalVehicle, 0, { doorOpen: 0, engineOn: true, speed: 72 });
    }
    cleanupCine(0); stopVehicleLoop();
    beginStageTransition(stage8Scene);
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
            barrierBroken = true; tollBarrier.userData.arm.rotation.x = -1.5; addCamShake(3.5);
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
        const active = (phase === 'cityMaze' || phase === 'tollApproach') && i < 12;
        s.visible = active;
        if (active) {
            const p = cellPos(224 + (i % 6) * 3, i % 2 ? 68 : 72);
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
    phase = 'opening'; complete = false;
    mazeMidSeen = tollSighted = false;
    stageElapsed = 0; barrierBroken = false; exhaustCursor = 0;
    machineBirths.length = 0;
    resetDialogue(); stopVehicleLoop();
    if (cine) cleanupCine(0);
    if (avatarGroup) avatarGroup.visible = true;
    setAvatarRadioPose(false); setCineBars(false); setCineFade(0, 0);
    setMarkers([]);
    if (tollBarrier?.userData.arm) tollBarrier.userData.arm.rotation.x = 0;
    if (tacticalVehicle) {
        tacticalVehicle.group.position.set(VEHICLE_OBJECT.x, 0, VEHICLE_OBJECT.z);
        tacticalVehicle.group.rotation.y = 0; resetTacticalVehicleVisual(tacticalVehicle);
    }
    for (const e of exhaustPool) e.visible = false;
    for (const s of sparkPool) s.visible = false;
    for (const o of occluders) {
        o.f = 1; o.occluding = false;
        for (const it of o.items) { it.mat.opacity = it.baseOp; it.mat.transparent = true; }
    }
    const C = machineConfig();
    for (const m of spawnMachines) {
        m.hp = C.hp; m.alive = true; m.active = false; m.hitT = 0; m.clock = 0;
        m.nextBatch = C.firstBatchSec; m.birthCooldown = 0; m.pending = 0;
        m.batches = 0; m.spawned = 0; m.rig.group.visible = true;
        resetSpawnMachine(m.rig, false);
    }
}

export const stage7DialogueDebug = () => ({
    key: dialogueCurrent?.key || null, speaker: dialogueCurrent?.speaker || '',
    text: dialogueCurrent?.text || '', chars: dialogueChars,
    shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
    typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
    queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen],
});

function floodCells(seed, allow) {
    const seen = new Set(), q = [seed]; let head = 0;
    while (head < q.length) {
        const p = q[head++], key = p.c + ',' + p.r;
        if (seen.has(key) || p.c < 0 || p.c >= MAP_COLS || p.r < 0 || p.r >= MAP_ROWS) continue;
        if (!allow(p.c, p.r)) continue;
        seen.add(key);
        q.push({ c: p.c + 1, r: p.r }, { c: p.c - 1, r: p.r },
            { c: p.c, r: p.r + 1 }, { c: p.c, r: p.r - 1 });
    }
    return seen;
}
function shortestCellPath(seed, target, allow) {
    const q = [{ ...seed, d: 0 }], seen = new Set(); let head = 0;
    while (head < q.length) {
        const p = q[head++], key = p.c + ',' + p.r;
        if (seen.has(key) || p.c < 0 || p.c >= MAP_COLS || p.r < 0 || p.r >= MAP_ROWS) continue;
        if (!allow(p.c, p.r)) continue;
        if (p.c === target.c && p.r === target.r) return p.d;
        seen.add(key);
        q.push({ c: p.c + 1, r: p.r, d: p.d + 1 }, { c: p.c - 1, r: p.r, d: p.d + 1 },
            { c: p.c, r: p.r + 1, d: p.d + 1 }, { c: p.c, r: p.r - 1, d: p.d + 1 });
    }
    return -1;
}

// Topologi centerline dihitung dari intersection nyata antar-ruas, bukan dari
// label "maze". Cycle rank > 0 membuktikan loop dan degree-1 membuktikan spur.
function semanticRoadTopology() {
    const points = S7_ROAD_SEGMENTS.map(s => [{ c: s.c0, r: s.r0 }, { c: s.c1, r: s.r1 }]);
    const addPoint = (i, c, r) => {
        if (!points[i].some(p => p.c === c && p.r === r)) points[i].push({ c, r });
    };
    const between = (v, a, b) => v >= Math.min(a, b) && v <= Math.max(a, b);
    for (let i = 0; i < S7_ROAD_SEGMENTS.length; i++) for (let j = i + 1; j < S7_ROAD_SEGMENTS.length; j++) {
        const a = S7_ROAD_SEGMENTS[i], b = S7_ROAD_SEGMENTS[j];
        const ah = a.r0 === a.r1, bh = b.r0 === b.r1;
        if (ah !== bh) {
            const h = ah ? a : b, v = ah ? b : a;
            if (between(v.c0, h.c0, h.c1) && between(h.r0, v.r0, v.r1)) {
                addPoint(i, v.c0, h.r0); addPoint(j, v.c0, h.r0);
            }
        } else if (ah && a.r0 === b.r0) {
            for (const p of [{ c: a.c0, r: a.r0 }, { c: a.c1, r: a.r1 },
                { c: b.c0, r: b.r0 }, { c: b.c1, r: b.r1 }])
                if (between(p.c, a.c0, a.c1) && between(p.c, b.c0, b.c1)) {
                    addPoint(i, p.c, p.r); addPoint(j, p.c, p.r);
                }
        } else if (!ah && a.c0 === b.c0) {
            for (const p of [{ c: a.c0, r: a.r0 }, { c: a.c1, r: a.r1 },
                { c: b.c0, r: b.r0 }, { c: b.c1, r: b.r1 }])
                if (between(p.r, a.r0, a.r1) && between(p.r, b.r0, b.r1)) {
                    addPoint(i, p.c, p.r); addPoint(j, p.c, p.r);
                }
        }
    }
    const edgeKeys = new Set(), adjacency = new Map();
    const key = p => `${p.c},${p.r}`;
    const link = (a, b) => {
        const ka = key(a), kb = key(b); if (ka === kb) return;
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; if (edgeKeys.has(ek)) return;
        edgeKeys.add(ek);
        if (!adjacency.has(ka)) adjacency.set(ka, new Set());
        if (!adjacency.has(kb)) adjacency.set(kb, new Set());
        adjacency.get(ka).add(kb); adjacency.get(kb).add(ka);
    };
    for (let i = 0; i < S7_ROAD_SEGMENTS.length; i++) {
        const s = S7_ROAD_SEGMENTS[i], horizontal = s.r0 === s.r1;
        points[i].sort((a, b) => horizontal ? a.c - b.c : a.r - b.r);
        for (let k = 1; k < points[i].length; k++) link(points[i][k - 1], points[i][k]);
    }
    let components = 0; const visited = new Set();
    for (const start of adjacency.keys()) if (!visited.has(start)) {
        components++; const q = [start]; visited.add(start);
        while (q.length) for (const n of adjacency.get(q.pop()) || [])
            if (!visited.has(n)) { visited.add(n); q.push(n); }
    }
    const degrees = [...adjacency.entries()].map(([node, links]) => ({ node, degree: links.size }));
    return {
        nodes: adjacency.size, edges: edgeKeys.size, components,
        cycleRank: edgeKeys.size - adjacency.size + components,
        junctions: degrees.filter(x => x.degree >= 3),
        terminalNodes: degrees.filter(x => x.degree === 1),
    };
}

function localDeadEndShape(p, allow, radiusCells = 12) {
    const m = mapCellAt(p.x, p.z);
    const c0 = Math.max(0, m.c - radiusCells), c1 = Math.min(MAP_COLS - 1, m.c + radiusCells);
    const r0 = Math.max(0, m.r - radiusCells), r1 = Math.min(MAP_ROWS - 1, m.r + radiusCells);
    const local = floodCells({ c: m.c, r: m.r }, (c, r) =>
        c >= c0 && c <= c1 && r >= r0 && r <= r1 && allow(c, r));
    const sides = [];
    if ([...local].some(k => Number(k.split(',')[0]) === c0)) sides.push('west');
    if ([...local].some(k => Number(k.split(',')[0]) === c1)) sides.push('east');
    if ([...local].some(k => Number(k.split(',')[1]) === r0)) sides.push('north');
    if ([...local].some(k => Number(k.split(',')[1]) === r1)) sides.push('south');
    return { ...p, localCells: local.size, egressSides: sides, terminal: sides.length === 1 };
}

function alleyBuildingContext(s) {
    const a = cellPos(s.c0, s.r0), b = cellPos(s.c1, s.r1);
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z), matches = [], sides = new Set();
    for (const p of propRecords) if (p.kind === 'alley-building') {
        const overlaps = horizontal
            ? p.x + p.hx >= Math.min(a.x, b.x) && p.x - p.hx <= Math.max(a.x, b.x)
            : p.z + p.hz >= Math.min(a.z, b.z) && p.z - p.hz <= Math.max(a.z, b.z);
        const delta = horizontal ? p.z - a.z : p.x - a.x;
        const half = horizontal ? p.hz : p.hx;
        if (overlaps && Math.abs(delta) > alleyWidth() / 2
            && Math.abs(delta) - half <= alleyWidth() / 2 + CELL * 0.5) {
            matches.push({ x: p.x, z: p.z, side: Math.sign(delta) }); sides.add(Math.sign(delta));
        }
    }
    return { id: s.id, required: s.required, betweenBuildings: s.betweenBuildings,
        buildings: matches, sides: [...sides].sort() };
}

export function stage7ConnectivityDebug() {
    ensureLayoutMap();
    let start = null, open = 0;
    const tokens = {};
    for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) {
        const t = S7_MAP[r][c]; tokens[t] = (tokens[t] || 0) + 1;
        if (t !== '#') open++;
        if (t === 'S') start = { c, r };
    }
    const target = mapCellAt(S7_TOLL.x, S7_TOLL.z);
    const tokenWalk = (c, r) => S7_MAP[r]?.[c] !== undefined && S7_MAP[r][c] !== '#';
    const clearanceWalk = (c, r) => {
        const p = mapCellPos(c, r);
        return stage7Walk(p.x, p.z, CFG.player.radius) && !blockedAt(p.x, p.z, CFG.player.radius);
    };
    const seen = start ? floodCells(start, tokenWalk) : new Set();
    const clearSeen = start ? floodCells(start, clearanceWalk) : new Set();
    const noAlleys = start ? floodCells(start, (c, r) => tokenWalk(c, r) && S7_MAP[r][c] !== 'A') : new Set();
    const noParks = start ? floodCells(start, (c, r) => tokenWalk(c, r) && S7_MAP[r][c] !== 'P') : new Set();
    const reached = (set, p) => { const m = mapCellAt(p.x, p.z); return set.has(m.c + ',' + m.r); };
    const shortest = start ? shortestCellPath(start, target, clearanceWalk) : -1;
    const direct = start ? Math.hypot(target.c - start.c, target.r - start.r) : 0;
    return {
        open, reachable: seen.size, connected: open > 0 && seen.size === open,
        clearanceReachable: clearSeen.size, tokens,
        requiresAlley: !reached(noAlleys, S7_TOLL), requiresPark: !reached(noParks, S7_TOLL),
        shortestCells: shortest, directCells: direct, detourRatio: direct > 0 ? shortest / direct : 0,
        deadEnds: S7_DEAD_ENDS.map(p => ({ ...p, reachable: reached(clearSeen, p) })),
        goals: {
            mazeEntry: reached(clearSeen, S7_MAZE_ENTRY),
            roundabout: reached(clearSeen, S7_ROUNDABOUT_APPROACH),
            toll: reached(clearSeen, S7_TOLL), vehicle: reached(clearSeen, S7_VEHICLE),
            machineLandings: spawnMachines.every(m => [0, 1, 2, 3]
                .every(i => reached(clearSeen, machineLanding(m, i)))),
        },
    };
}
export const stage7MazeDebug = () => ({
    routeSelection: false, gates: 0, deadEnds: S7_DEAD_ENDS.length,
    roads: S7_ROAD_SEGMENTS.length, alleys: S7_ALLEY_SEGMENTS.length, parks: S7_PARKS.length,
    topology: semanticRoadTopology(),
    deadEndShapes: S7_DEAD_ENDS.map(p => localDeadEndShape(p, (c, r) => {
        const q = mapCellPos(c, r);
        return stage7Walk(q.x, q.z, CFG.player.radius) && !blockedAt(q.x, q.z, CFG.player.radius);
    })),
    alleyContexts: S7_ALLEY_SEGMENTS.map(alleyBuildingContext),
    connectivity: stage7ConnectivityDebug(),
});
export const stage7Debug = () => ({
    phase, objective: stage7Scene.hudStatus(), stageElapsed, mazeMidSeen, tollSighted,
    machinesAlive: machinesAlive(), factoryRobots: factoryRobotCount(),
    machines: spawnMachines.map(m => ({
        id: m.id, hp: m.hp, alive: m.alive, active: m.active,
        batches: m.batches, spawned: m.spawned, pending: m.pending,
        clock: m.clock, nextBatch: m.nextBatch,
    })),
    robots: countStageRobots(7), vehicleReady: phase === 'vehicleReveal',
    barrierBroken, outro: cine?.kind === 'outro' ? { stage: cine.stage, t: cine.t } : null,
    complete,
    encounters: Object.fromEntries(Object.keys(ENCOUNTER_POINTS).map(k => [k, countEncounter(k)])),
});
// Blok kota: dipakai smoke untuk membuktikan aturan garis pandang kamera.
export const stage7CityDebug = () => ({
    setback: CITY_SETBACK, block: CITY_BLOCK, cell: CELL,
    blocks: cityBlocks.map(b => ({ ...b })),
    overSightLine: cityBlocks.filter(b => b.actualTop > cityHeightCap(b.dmin) + 1e-6).length,
    tooClose: cityBlocks.filter(b => b.dmin < CITY_SETBACK).length,
    maxHeight: cityBlocks.reduce((m, b) => Math.max(m, b.actualTop), 0),
    buildingKinds: [...new Set(cityBlocks.map(b => b.kind))],
});
export const stage7StreetDebug = () => {
    const streetTrees = propRecords.filter(p => p.kind === 'tree' && p.zone === 'street');
    const allTrees = propRecords.filter(p => p.kind === 'tree');
    const frontageSpanMeters = frontageRecords.reduce((sum, p) => sum + p.frontageSpanMeters, 0);
    const totalRoadSidesMeters = ensureSurfaceGeometry().roads.reduce((sum, s) =>
        sum + Math.sqrt(s.den) * 2 / CAMP_M, 0);
    const minTreeFrontageClearanceMeters = streetTrees.reduce((best, tree) =>
        Math.min(best, ...frontageRecords.map(frontage =>
            (Math.sqrt(pointAabbDistance2(tree.x, tree.z, frontage.x, frontage.z,
                frontage.hx, frontage.hz)) - tree.crownRadius) / CAMP_M)), Infinity);
    return {
    meters: { asphalt: streetCfg().asphaltWidthMeters, sidewalk: streetCfg().sidewalkWidthMeters,
        alley: streetCfg().alleyWidthMeters,
        buildingSetback: streetCfg().buildingSetbackMeters },
    world: { asphalt: roadWidth(), sidewalk: sidewalkWidth(), alley: alleyWidth() },
    sections: streetSurfaces.map(s => ({ ...s })),
    intersections: intersectionSurfaces.map(s => ({ ...s, arms: [...s.arms] })),
    turns: turnSurfaces.map(s => ({ ...s, segmentIds: [...s.segmentIds], samples: { ...s.samples } })),
    parks: parkSurfaces.map(p => {
        const furniture = propRecords.filter(q => q.park === p.id);
        return { ...p, furniture: furniture.length,
            furnitureKinds: [...new Set(furniture.map(q => q.kind))],
            benches: furniture.filter(q => q.kind === 'park-bench').length,
            trees: furniture.filter(q => q.kind === 'tree').length };
    }),
    pavedAreas: S7_PAVED_AREAS.map(p => ({ ...p })),
    frontages: {
        count: frontageRecords.length,
        maxAllowedMeters: streetCfg().buildingSetbackMeters,
        maxSetbackMeters: frontageRecords.reduce((m, p) => Math.max(m, p.setbackMeters), 0),
        intrusions: frontageRecords.filter(p => p.intrusion).length,
        spanMeters: frontageSpanMeters,
        roadSideCoverage: totalRoadSidesMeters ? frontageSpanMeters / totalRoadSidesMeters : 0,
        records: frontageRecords.map(p => ({ ...p })),
    },
    lamps: {
        visual: lampSpecs.length, pointLights: stageLights.length,
        spacingMeters: LAMP_SPACING_METERS,
        outsideWalkable: lampSpecs.every(p => surfaceTokenAt(p.x, p.z) === '#'),
        minPairMeters: lampSpecs.reduce((best, p, i) => Math.min(best,
            ...lampSpecs.slice(i + 1).map(q => Math.hypot(p.x - q.x, p.z - q.z) / CAMP_M)), Infinity),
    },
    trees: {
        total: allTrees.length,
        street: streetTrees.length,
        parks: allTrees.filter(p => p.zone === 'park').length,
        large: allTrees.filter(p => p.large).length,
        largeStreet: streetTrees.filter(p => p.large).length,
        largeParks: allTrees.filter(p => p.zone === 'park' && p.large).length,
        minFrontageClearanceMeters: minTreeFrontageClearanceMeters,
    },
    spatialIndex: { roadBins: ensureSurfaceGeometry().roadBins.filter(Boolean).length,
        alleyBins: ensureSurfaceGeometry().alleyBins.filter(Boolean).length },
    };
};

function occlusionProbe(o, wantHit) {
    const eye = CFG.player.eyeHeight;
    const c0 = Math.max(0, Math.floor((o.x - o.radius - 180 - MAP_X0) / CELL));
    const c1 = Math.min(MAP_COLS - 1, Math.ceil((o.x + o.radius + 180 - MAP_X0) / CELL));
    const r0 = Math.max(0, Math.floor((o.z - o.radius - 180 - MAP_Z0) / CELL));
    const r1 = Math.min(MAP_ROWS - 1, Math.ceil((o.z + o.radius + 180 - MAP_Z0) / CELL));
    let best = null, bestD = Infinity;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const p = mapCellPos(c, r);
        if (!stage7Walk(p.x, p.z, CFG.player.radius) || blockedAt(p.x, p.z, CFG.player.radius)) continue;
        const sx = p.x + CAM_OFF_DEFAULT.x, sy = eye + CAM_OFF_DEFAULT.y;
        const sz = p.z + CAM_OFF_DEFAULT.z;
        const tExit = sightExit(o, sx, sz, p.x, p.z);
        const occ = tExit >= 0 && sy + (eye - sy) * tExit <= o.top + 3;
        if (occ !== wantHit) continue;
        const d = Math.hypot(p.x - o.x, p.z - o.z);
        if (d < bestD) { bestD = d; best = { x: p.x, z: p.z }; }
    }
    return best;
}

function spatialIndexContains(index, sx, sz, ex, ez) {
    if (!occluderBins) buildOccluderBins();
    const dx = ex - sx, dz = ez - sz;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL * 0.65)));
    for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const c = Math.floor((sx + dx * t - MAP_X0) / CELL);
        const r = Math.floor((sz + dz * t - MAP_Z0) / CELL);
        if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) continue;
        if ((occluderBins[r * MAP_COLS + c] || EMPTY_INDICES).includes(index)) return true;
    }
    return false;
}

// Audit debug satu-kali: bandingkan kandidat indeks dengan intersection brute pada
// banyak posisi walkable di sekitar setiap pohon/frontage. Ini menangkap regresi
// chord pendek di sudut bin yang tidak selalu muncul pada probe tengah biasa.
function auditOccluderSpatialIndex() {
    const eye = CFG.player.eyeHeight;
    let checks = 0, misses = 0;
    for (let i = 0; i < occluders.length; i++) {
        const o = occluders[i];
        if (o.kind !== 'tree' && o.kind !== 'street-tree' && o.kind !== 'frontage-building') continue;
        const c0 = Math.max(0, Math.floor((o.x - o.radius - 180 - MAP_X0) / CELL));
        const c1 = Math.min(MAP_COLS - 1, Math.ceil((o.x + o.radius + 180 - MAP_X0) / CELL));
        const r0 = Math.max(0, Math.floor((o.z - o.radius - 180 - MAP_Z0) / CELL));
        const r1 = Math.min(MAP_ROWS - 1, Math.ceil((o.z + o.radius + 180 - MAP_Z0) / CELL));
        for (let r = r0; r <= r1; r += 2) for (let c = c0; c <= c1; c += 2) {
            const p = mapCellPos(c, r);
            if (!stage7Walk(p.x, p.z, CFG.player.radius)
                || blockedAt(p.x, p.z, CFG.player.radius)) continue;
            const sx = p.x + CAM_OFF_DEFAULT.x, sy = eye + CAM_OFF_DEFAULT.y;
            const sz = p.z + CAM_OFF_DEFAULT.z;
            const tExit = sightExit(o, sx, sz, p.x, p.z);
            if (tExit < 0 || sy + (eye - sy) * tExit > o.top + 3) continue;
            checks++;
            if (!spatialIndexContains(i, sx, sz, p.x, p.z)) misses++;
        }
    }
    return { checks, misses, binPadding: OCCLUDER_BIN_PAD };
}

export const stage7OccluderDebug = () => {
    const materialOwners = new Map();
    for (let i = 0; i < occluders.length; i++) for (const it of occluders[i].items) {
        let owners = materialOwners.get(it.mat);
        if (!owners) { owners = new Set(); materialOwners.set(it.mat, owners); }
        owners.add(i);
    }
    const sharedMaterials = [...materialOwners.values()].filter(x => x.size > 1).length;
    const summarize = o => ({ kind: o.kind, x: o.x, z: o.z, shape: o.shape,
        radius: o.radius, hx: o.hx, hz: o.hz, top: o.top, f: o.f,
        occluding: o.occluding, materials: o.items.length,
        allTransparent: o.items.every(it => it.mat.transparent === true),
        minOpacity: o.items.reduce((m, it) => Math.min(m, it.mat.opacity), 1) });
    if (!occlusionProbeCache) {
        const find = kind => {
            for (const o of occluders) if (o.kind === kind) {
                const behind = occlusionProbe(o, true), clear = occlusionProbe(o, false);
                if (behind && clear) return { o, behind, clear };
            }
            return null;
        };
        occlusionProbeCache = { building: find('frontage-building'), tree: find('street-tree') };
    }
    if (!occlusionSpatialAuditCache) occlusionSpatialAuditCache = auditOccluderSpatialIndex();
    const probe = q => q ? { entry: summarize(q.o), behind: { ...q.behind },
        clear: { ...q.clear } } : null;
    return {
        count: occluders.length, faded: occluders.filter(o => o.f < 0.985).length,
        minF: occluders.reduce((m, o) => Math.min(m, o.f), 1), sharedMaterials,
        treeCount: occluders.filter(o => o.kind === 'tree' || o.kind === 'street-tree').length,
        spatialAudit: { ...occlusionSpatialAuditCache },
        entries: occluders.map(summarize), probes: {
            building: probe(occlusionProbeCache.building), tree: probe(occlusionProbeCache.tree),
        },
    };
};
const placementDebug = p => ({ ...p, surface: surfaceTokenAt(p.x, p.z),
    clearOfWorldProps: !blockedAt(p.x, p.z, CFG.player.radius) });
export const stage7WorldDebug = () => ({
    built, map: { rows: MAP_ROWS, cols: MAP_COLS, cell: CELL,
        open: S7_MAP.reduce((n, row) => n + [...row].filter(t => t !== '#').length, 0) },
    start: { ...S7_START }, mazeEntry: { ...S7_MAZE_ENTRY }, roundabout: { ...S7_ROUNDABOUT_APPROACH },
    toll: { ...S7_TOLL }, vehicle: { ...S7_VEHICLE },
    blockers: blockers.length, softBlockers: softBlockers.length, props: propRecords.map(p => ({ ...p })),
    propKinds: [...new Set(propRecords.map(p => p.kind))],
    pools: { rain: rainPool.length, ripples: ripplePool.length, sparks: sparkPool.length, exhaust: exhaustPool.length },
    visiblePools: { sparks: sparkPool.filter(x => x.visible).length, exhaust: exhaustPool.filter(x => x.visible).length },
    lights: stageLights.length, occluders: occluders.length, staticBatches: staticBatch.length,
    cityBlocks: cityBlocks.length, streetEdges: streetEdgeCount,
    nav: !!navGrid, sceneRoot: worldRoot?.position ? { x: worldRoot.position.x, z: worldRoot.position.z } : null,
    supplies: CITY_SUPPLIES.map(placementDebug), crates: CITY_CRATES.map(placementDebug),
    barrels: CITY_BARRELS.map(([c, r]) => placementDebug(cellPos(c, r))),
    streets: stage7StreetDebug(),
    spawnMachines: spawnMachines.map(m => ({
        id: m.id, x: m.x, z: m.z, hatch: machineHatch(m),
        landings: [0, 1, 2, 3].map(i => machineLanding(m, i)),
        hp: m.hp, alive: m.alive, active: m.active, ...spawnMachineDebug(m.rig),
    })),
    encounterPoints: Object.fromEntries(Object.entries(ENCOUNTER_POINTS)
        .map(([k, v]) => [k, v.map(([c, r]) => placementDebug(cellPos(c, r)))])),
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
        for (const name of Object.keys(ENCOUNTER_POINTS)) if (name !== 'hqEscape')
            spawnEncounter(name, CFG.campaign.stage7.encounters[name], false);
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
        stageElapsed += dt; updateDialogue(dt); updateCine(dt);
        updateFx(dt); updateOccluders(dt); updateSpawnFactories(dt);
        if (!cine && tacticalVehicle) updateTacticalVehicleVisual(tacticalVehicle, dt,
            { doorOpen: 0, engineOn: false, speed: 0 });
        for (const m of Object.values(markers)) if (m.visible) {
            const s = 1 + Math.sin(stageElapsed * 3.4) * 0.08; m.scale.setScalar(s);
        }
        if (cine || complete) { updateUI(); return; }

        if (phase === 'hqEscape' && countEncounter('hqEscape') === 0) {
            phase = 'cityMaze'; queueDialogue('mazePlan'); setMarkers([]);
            showStageMsg('FIND A WAY THROUGH BANDUNG TO CISUMDAWU', 4200);
        } else if (phase === 'cityMaze') {
            if (!mazeMidSeen && distanceTo(S7_ROUNDABOUT_APPROACH) < CFG.campaign.stage7.mazeBeatRange) {
                mazeMidSeen = true; queueDialogue('roundaboutCommand'); queueDialogue('roundaboutGibran');
            }
            if (distanceTo(S7_TOLL) < CFG.campaign.stage7.tollSightRange) {
                phase = 'tollApproach'; tollSighted = true; queueDialogue('tollSight');
                setMarkers(['toll']); showStageMsg('CISUMDAWU TOLL GATE LOCATED', 3600);
            }
        } else if (phase === 'tollApproach') {
            if (distanceTo(S7_TOLL) < CFG.campaign.stage7.tollTriggerRange)
                startFactorySiege();
        } else if (phase === 'vehicleReveal') {
            if (Math.hypot(camera.position.x - S7_VEHICLE.x, camera.position.z - S7_VEHICLE.z)
                < CFG.campaign.stage7.vehicleRange) startOutro();
        }
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage7Walk, pos, oldX, oldZ, player.radius);
        resolveRoundaboutIsland(pos, player.radius);
        resolve(pos, player.radius, feetY); resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage7Walk, pos, oldX, oldZ, player.radius);
        resolveRoundaboutIsland(pos, player.radius);
    },
    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        if (b.mesh.position.y >= BUILDING_H) return false;
        return machineBulletHit(b)
            || stage7SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        if (y >= BUILDING_H) return false;
        return stage7SegHitsWall(x0, z0, x1, z1);
    },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage7Walk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4; g.vz = -g.vz * 0.4;
        }
        resolve(g.mesh.position, 2, 0);
    },
    robotAI(z, dt, step) {
        if (z.machineBirth) {
            z.state = 'idle'; z.moving = false; z.aiming = false; return {};
        }
        if (phase === 'opening' && z.encounter === 'hqEscape') {
            z.state = 'idle'; z.moving = false; z.aiming = false; return {};
        }
        return campaignRobotAI(z, dt, step, { walkable: stage7Walk, resolve, nav: navGrid,
            los: (x0, z0, x1, z1) => !stage7SegHitsWall(x0, z0, x1, z1) });
    },
    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: stage7Walk, resolve });
    },
    clampDropPos(x, z) { return stage7Walk(x, z, 2) ? [x, z] : [S7_START.x, S7_START.z]; },
    hudStatus() {
        if (phase === 'opening') return 'STAGE 7 — BANDUNG LOCKDOWN';
        if (phase === 'hqEscape') return `BREAK THROUGH THE HQ PERIMETER — Robots: ${countEncounter('hqEscape')}`;
        if (phase === 'cityMaze') return 'FIND A WAY THROUGH THE ALLEYS AND PARKS';
        if (phase === 'tollApproach') return 'REACH THE CISUMDAWU TOLL PLAZA';
        if (phase === 'factorySiege')
            return `DESTROY ROBOT FACTORIES — ${machinesAlive()}/3 | Robots: ${factoryRobotCount()}`;
        if (phase === 'vehicleReveal') return 'INSPECT THE GRD LTV-45';
        if (phase === 'outro') return 'ROUTE CONFIRMED — KERTAJATI INTERNATIONAL AIRPORT';
        return 'NEXT DESTINATION — KERTAJATI';
    },
    radarLandmarks(plot) {
        const mark = (p, color = '#ffb03b') => plot(p.x - camera.position.x, p.z - camera.position.z, color, 5, true);
        if (phase === 'hqEscape') mark(S7_MAZE_ENTRY);
        else if (phase === 'tollApproach') mark(S7_TOLL);
        else if (phase === 'factorySiege') for (const m of spawnMachines) if (m.alive) mark(m, '#ff7b3b');
        else if (phase === 'vehicleReveal') mark(S7_VEHICLE);
    },
};
