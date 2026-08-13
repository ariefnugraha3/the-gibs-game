// Campaign Stage 7 - PASUPATI NIGHT RUN.
// Major Gibran crosses the Prof. Dr. Mochtar Kusumaatmadja Flyover from east
// to west, reaches the Pasteur toll entrance, and secures the GRD LTV-45.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, stats, keys, setCinematicActive } from '../../../../core/state.js';
import {
    scene, camera, viewCam, setCineFocus, CAM_OFF_DEFAULT, CAM_LOOK_DROP,
    camFocusPos, addCamShake,
} from '../../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { avatarGroup, setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot, queueBoom, killRobot } from '../../../../entities/robots.js';
import {
    spawnCampaignRobot, campaignAwardKill, campaignRobotAI, campaignClampRobot,
    countStageRobots,
} from '../../utility/common.js';
import { beginStageTransition, campaignJumpToStage } from '../../utility/transition.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { stage1Scene } from '../stage1/index.js';
import { stage8Scene } from '../stage8/index.js';
import { applyLightPreset, registerStageLight, LIGHT_PRESETS } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { buildBandungCity } from './stage7City.js';
import { PAL } from '../../../../world/palette.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { slideWalk, resolveBlockers } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { rand, segPointDist2 } from '../../../../utils/math.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../../entities/crates.js';
import { spawnBarrel, resetBarrels, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { explodeAt, spawnGroundPuff, spawnBloodBurst } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import {
    buildSpawnMachineMesh, resetSpawnMachine, updateSpawnMachine, spawnMachineDebug,
    wreckSpawnMachine, spawnMachineHp,
} from '../../../../entities/spawnMachine.js';
import { FuturisticSUV } from '../../../../entities/futuristicSUV.js';
import { FuturisticSedan } from '../../../../entities/futuristicSedan.js';
import {
    buildStage7RoadVehicle, STAGE7_ROAD_VEHICLE_SPECS,
} from './roadVehicles.js';
import { mortarShell } from '../../../../entities/tank.js';
import {
    buildTacticalVehicleMesh, resetTacticalVehicleVisual,
    updateTacticalVehicleVisual, tacticalVehicleDebug as vehicleDebug,
} from '../../../../entities/tacticalVehicle.js';
import {
    sfxTankMove, sfxTankMortar, sfxTankIncoming, sfxTankBlast,
    sfxRobotSpawn, playLoopSFX, stopLoopSFX, playSFX,
} from '../../../../utils/sfx.js';

const OX = 240000, OZ = 0;
const NAV_CELL = 14;
const BLOCKER_BIN_METERS = 50;
const BLOCKER_BIN_WORLD = BLOCKER_BIN_METERS * CAMP_M;
const VEHICLE_CHUNK_METERS = 125;
// MALAM PASUPATI (2026-08-10, laporan user "ini masih terlalu terang"). Yang
// membuat sebuah stage luar-ruang terasa terang BUKAN intensitas lampu,
// melainkan HAZE-nya: `enterCityEnv` standar memasang langit biru-abu 0x2b3742
// yang mengisi seluruh layar dan menjadi warna akhir kabut, jadi seterang apa
// pun setelan lampunya kota tetap terbaca senja. Stage 7 memakai preset
// `midnight` (ambient sepertiga + cahaya bulan dingin) DITAMBAH haze malam
// pekat ini; near/far dibaca dari preset yang sama supaya tak ada dua sumber
// kebenaran. Sisa cahaya hangat = lampu jalan amber, jendela kota, efek tempur.
const NIGHT_ENV = Object.freeze({ background: 0x090c11, fogColor: 0x06080c });
const PLAY_CAM = Object.freeze({ x: 70.7, y: 116, z: 70.7 });
const LANDMARK_CAM = Object.freeze({ x: 150, y: 230, z: 150 });
const MORTAR_UP = new THREE.Vector3(0, 1, 0);
const mortarVelocity = new THREE.Vector3();
const gameplayCam = { ...PLAY_CAM };
const CAR_OPEN_PATTERNS = Object.freeze([
    Object.freeze([0, 1, 2]),
    Object.freeze([5, 6, 7]),
    Object.freeze([2, 3, 4]),
    Object.freeze([0, 4, 7]),
    Object.freeze([1, 5, 6]),
]);
const SCATTER_VEHICLE_TYPES = Object.freeze([
    'pickup', 'sedan', 'container-truck', 'suv', 'dump-truck',
    'sedan', 'bus', 'pickup', 'tanker-truck', 'suv',
]);

export let S7_START = Object.freeze({ x: OX, z: OZ });
export let S7_EAST_END = Object.freeze({ x: OX, z: OZ });
export let S7_WEST_END = Object.freeze({ x: OX, z: OZ });
export let S7_LANDMARK = Object.freeze({ x: OX, z: OZ });
export let S7_TOLL = Object.freeze({ x: OX, z: OZ });
export let S7_VEHICLE = Object.freeze({ x: OX, z: OZ });
export let S7_RAMPS = Object.freeze([]);
export let S7_CARS = Object.freeze([]);
export let S7_MACHINE_POINTS = Object.freeze([]);

export const STAGE7_DIALOGUE = dialogueMap('campaign.stage7.lines');

const flyCfg = () => CFG.campaign.stage7.flyover;
const mortarCfg = () => CFG.campaign.stage7.mortar;
const mortarBlastRadius = () => CFG.grenade.killRadius
    * CFG.campaign.bosses.tank.mortarBlastRatio;
let layout = null;
let vehicleObject = Object.freeze({ x: OX, z: OZ });

function laneCenterFrom(lanes, index) {
    const i = ((index % lanes.length) + lanes.length) % lanes.length;
    return lanes[i];
}

function vehicleRect(x, z, type, yaw = 0) {
    const spec = STAGE7_ROAD_VEHICLE_SPECS[type];
    return { x, z, yaw, hx: spec.length * CAMP_M / 2,
        hz: spec.width * CAMP_M / 2 };
}

function vehicleRectsOverlap(a, b, margin = 0) {
    const axesFor = r => {
        const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
        return [{ x: c, z: s }, { x: -s, z: c }];
    };
    const aa = axesFor(a), ba = axesFor(b);
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const u of [...aa, ...ba]) {
        const dist = Math.abs(dx * u.x + dz * u.z);
        const ar = a.hx * Math.abs(u.x * aa[0].x + u.z * aa[0].z)
            + a.hz * Math.abs(u.x * aa[1].x + u.z * aa[1].z);
        const br = b.hx * Math.abs(u.x * ba[0].x + u.z * ba[0].z)
            + b.hz * Math.abs(u.x * ba[1].x + u.z * ba[1].z);
        if (dist >= ar + br + margin) return false;
    }
    return true;
}

function ensureLayout() {
    if (layout) return layout;
    const F = flyCfg();
    const lengthMeters = Math.max(100, F.lengthMeters);
    const lanesPerSide = Math.max(1, F.laneCountPerSide | 0);
    const laneWidth = Math.max(1, F.laneWidthMeters) * CAMP_M;
    const medianWidth = Math.max(0, F.medianWidthMeters) * CAMP_M;
    const shoulderWidth = Math.max(0, F.shoulderWidthMeters) * CAMP_M;
    const carriagewayWidth = lanesPerSide * laneWidth;
    const roadEdge = medianWidth / 2 + carriagewayWidth;
    const deckHalf = roadEdge + shoulderWidth;
    const deckWidth = deckHalf * 2;
    const length = lengthMeters * CAMP_M;
    const eastX = OX + length / 2, westX = OX - length / 2;
    const deckHeight = Math.max(2, F.deckHeightMeters) * CAMP_M;
    const lowerY = -deckHeight;
    const descentStartMeter = Math.max(0, Math.min(lengthMeters - 1,
        F.descentStartMeter));
    const descentLengthMeters = Math.max(1, Math.min(
        F.descentLengthMeters, lengthMeters - descentStartMeter));
    const descentEndMeter = descentStartMeter + descentLengthMeters;
    const descentDrop = Math.min(deckHeight,
        Math.max(1, F.descentDropMeters) * CAMP_M);
    const descentRun = descentLengthMeters * CAMP_M;
    const descentSlopeLength = Math.hypot(descentRun, descentDrop);
    const descentPitch = Math.atan2(descentDrop, descentRun);
    const roadYAtMeter = meter => {
        if (meter <= descentStartMeter) return 0;
        if (meter >= descentEndMeter) return -descentDrop;
        return -descentDrop * (meter - descentStartMeter) / descentLengthMeters;
    };
    const roadPitchAtMeter = meter => meter >= descentStartMeter
        && meter < descentEndMeter ? descentPitch : 0;
    const lanes = [];
    for (let i = lanesPerSide - 1; i >= 0; i--)
        lanes.push(-(medianWidth / 2 + (i + 0.5) * laneWidth));
    for (let i = 0; i < lanesPerSide; i++)
        lanes.push(medianWidth / 2 + (i + 0.5) * laneWidth);
    const xAtMeter = meter => eastX - meter * CAMP_M;
    const rampIntervalMeters = Math.max(10, F.rampIntervalMeters);
    const rampLaneCount = Math.max(1, F.rampLaneCount | 0);
    const rampWidth = rampLaneCount * Math.max(1, F.rampLaneWidthMeters) * CAMP_M;
    const rampLength = Math.min(rampIntervalMeters * 0.72,
        Math.max(8, F.rampLengthMeters)) * CAMP_M;
    const rampMergeLength = Math.min(rampIntervalMeters * 0.4,
        Math.max(20, F.rampMergeLengthMeters)) * CAMP_M;
    const ramps = [];
    for (let meter = rampIntervalMeters; meter < lengthMeters; meter += rampIntervalMeters) {
        for (const side of [-1, 1]) {
            const startMeter = Math.max(0, meter - rampLength / CAMP_M);
            const mergeEndMeter = Math.min(lengthMeters,
                meter + rampMergeLength / CAMP_M);
            const startX = xAtMeter(startMeter);
            const mergeX = xAtMeter(meter);
            const mergeEndX = xAtMeter(mergeEndMeter);
            const outerZ = side * (deckHalf + rampWidth / 2);
            ramps.push(Object.freeze({
                id: `ramp-${meter}-${side < 0 ? 'left' : 'right'}`,
                meter, mergeMeter: meter, mergeEndMeter, startMeter, side,
                x: mergeX, z: outerZ, startX, mergeX, mergeEndX,
                x0: Math.min(startX, mergeEndX), x1: Math.max(startX, mergeEndX),
                z0: side < 0 ? -(deckHalf + rampWidth) : deckHalf,
                z1: side < 0 ? -deckHalf : deckHalf + rampWidth,
                startZ: outerZ, endZ: outerZ, startY: lowerY, endY: 0,
                mouthZ: side * deckHalf, width: rampWidth, length: rampLength,
                mergeLength: rampMergeLength, laneCount: rampLaneCount,
                direction: 'up', orientation: 'parallel', travel: 'east-to-west',
                mergeTo: 'outer-lane', fifthLane: true, accessible: false,
            }));
        }
    }

    const bandCount = Math.max(0, F.mazeBandCount | 0);
    const plannedBands = [];
    for (let band = 0; band < bandCount; band++) {
        let meter = F.mazeFirstMeter + band * F.mazeBandSpacingMeters;
        if (Math.abs(meter - F.landmarkMeter) < 70)
            meter = F.landmarkMeter + (meter < F.landmarkMeter ? -82 : 82);
        if (meter > 45 && meter < lengthMeters - 175)
            plannedBands.push({ band, meter });
    }

    const cars = [];
    const carsPerBand = Math.max(1, F.carsPerBand | 0);
    const bandMeters = [];
    const carClearOfCars = (m, z, type, yaw) => {
        const candidate = vehicleRect(xAtMeter(m), z, type, yaw);
        return cars.every(p => !vehicleRectsOverlap(candidate,
            vehicleRect(p.x, p.z, p.type, p.yaw), 0.12 * CAMP_M));
    };
    for (const planned of plannedBands) {
        const { band, meter } = planned;
        bandMeters.push(meter);
        const open = CAR_OPEN_PATTERNS[band % CAR_OPEN_PATTERNS.length]
            .map(i => i % lanes.length);
        const blocked = lanes.map((_, i) => i).filter(i => !open.includes(i));
        for (let j = 0; j < carsPerBand; j++) {
            const lane = blocked[j % blocked.length];
            const localRow = Math.floor(j / blocked.length);
            const laneZ = laneCenterFrom(lanes, lane);
            let carMeter = meter + ((j % 3) - 1) * 1.35 + localRow * 7;
            const yaw = (((band * 3 + j) % 5) - 2) * 0.035;
            const type = (band + j) % 3 === 0 ? 'suv' : 'sedan';
            cars.push(Object.freeze({
                id: `gate-car-${band}-${j}`, band, meter: carMeter, lane,
                x: xAtMeter(carMeter), z: laneCenterFrom(lanes, lane),
                yaw, type,
            }));
        }
    }
    const scatteredCars = Math.max(0, F.scatteredCars | 0);
    for (let i = 0; i < scatteredCars; i++) {
        let meter = 72 + (i + 0.5) * (lengthMeters - 250) / Math.max(1, scatteredCars);
        if (Math.abs(meter - F.landmarkMeter) < 48) meter += 52;
        if (bandMeters.some(m => Math.abs(meter - m) < 15)) meter += 22;
        const lane = (i * 3 + 1) % lanes.length;
        const laneZ = laneCenterFrom(lanes, lane);
        const type = SCATTER_VEHICLE_TYPES[i % SCATTER_VEHICLE_TYPES.length];
        const yaw = [-0.16, 0.11, -0.07, 0.18][i % 4];
        // Geser di lajur yang sama sampai tak menumpuk kendaraan sebelumnya;
        // pola lintas-lajur dan koridor maze tetap tidak berubah.
        for (let guard = 0; guard < 24
            && !carClearOfCars(meter, laneZ, type, yaw); guard++)
            meter += 4;
        cars.push(Object.freeze({
            id: `scatter-car-${i}`, band: -1, meter, lane,
            x: xAtMeter(meter), z: laneZ,
            yaw, type,
        }));
    }

    // DUNIA LANJUTAN DI BALIK GERBANG TOL (2026-08-10, laporan user "dunia habis
    // di depan tol Pasteur, ini jadi terlihat aneh"). Player TETAP terkunci di
    // meter `lengthMeters` — `stage7Walk` tak berubah sama sekali — tetapi jalan,
    // tanah dan kotanya diteruskan `beyondTollMeters` lagi supaya tak ada tepi
    // dunia yang terlihat. Panjang itu bukan hiasan: tapak pandang kamera saja
    // sudah ~38 m di depan fokus, dan pada cutscene outro fokusnya IKUT
    // kendaraan yang melaju ke barat melewati gerbang, jadi yang terlihat bisa
    // sampai ~85 m di luar tol. 150 m memberi marjin sekaligus jatuh tepat di
    // `fogFar`, sehingga ujungnya larut jadi kabut, bukan potongan.
    const beyondMeters = Math.max(0, F.beyondTollMeters || 0);
    const beyondX = xAtMeter(lengthMeters + beyondMeters);
    const pointAt = (meter, z = 0) => Object.freeze({
        meter, x: xAtMeter(meter), y: roadYAtMeter(meter), z,
    });
    S7_EAST_END = pointAt(0);
    S7_WEST_END = pointAt(lengthMeters);
    S7_START = pointAt(20, laneCenterFrom(lanes, 1));
    S7_LANDMARK = pointAt(F.landmarkMeter);
    S7_TOLL = pointAt(lengthMeters - F.tollTriggerBeforeMeters);
    const leftRoadZ = laneCenterFrom(lanes, lanes.length - 1);
    S7_VEHICLE = pointAt(lengthMeters - 28, leftRoadZ);
    vehicleObject = S7_VEHICLE;
    S7_RAMPS = Object.freeze(ramps);
    S7_CARS = Object.freeze(cars);
    S7_MACHINE_POINTS = Object.freeze([
        Object.freeze({ id: 'north', ...pointAt(lengthMeters - 72,
            laneCenterFrom(lanes, 0)), yaw: 0 }),
        Object.freeze({ id: 'south', ...pointAt(lengthMeters - 57,
            laneCenterFrom(lanes, lanes.length - 1)), yaw: Math.PI }),
        Object.freeze({ id: 'west', ...pointAt(lengthMeters - 42,
            laneCenterFrom(lanes, 0)), yaw: 0 }),
    ]);
    layout = {
        F, lengthMeters, length, lanesPerSide, laneWidth, medianWidth,
        shoulderWidth, roadEdge, carriagewayWidth, deckWidth, deckHalf,
        lanes, eastX, westX, xAtMeter,
        rampIntervalMeters, rampLaneCount, rampWidth, rampLength, rampMergeLength,
        rampOuter: deckHalf + rampWidth,
        deckHeight, lowerY, leftRoadZ, beyondMeters, beyondX,
        descentStartMeter, descentLengthMeters, descentEndMeter,
        descentDrop, descentRun, descentSlopeLength, descentPitch,
        roadYAtMeter, roadPitchAtMeter,
        bandMeters,
    };
    return layout;
}

function progressMeters(x = camera.position.x) {
    const L = ensureLayout();
    return Math.max(0, Math.min(L.lengthMeters, (L.eastX - x) / CAMP_M));
}

export function stage7Walk(x, z, radius = 0) {
    const L = ensureLayout(), d = Math.max(0, radius);
    return x >= L.westX + d && x <= L.eastX - d
        && Math.abs(z) <= L.deckHalf - d;
}

let built = false, worldRoot = null, navGrid = null, navBounds = null, staticBatch = [];
const blockers = [], propRecords = [], stageLights = [], lampSpecs = [];
const blockerBins = new Map(), blockerScratch = [];
let blockerQueryStamp = 0;
const carRecords = [], rampRecords = [], shoulderRecords = [];
const supportRecords = [], lowerRoadRecords = [];
const rainPool = [], ripplePool = [], sparkPool = [], exhaustPool = [];
const mortarPool = [], mortarBlastOrigins = [];
const markers = {}, spawnMachines = [], machineBirths = [];
const supplyPlacements = [], cratePlacements = [], barrelPlacements = [];
const encounterPlacements = {};
let tacticalVehicle = null, tollBarrier = null, exhaustCursor = 0, cityStats = null;
let landmarkCableCount = 0, landmarkCableAnchorMaxZ = 0, landmarkPieceCount = 0;
let landmarkCableFrontCount = 0, landmarkCableBackCount = 0;
let landmarkCableThickness = 0;
let roadSkinSegmentCount = 0;
let vehicleChunkStats = { chunkMeters: VEHICLE_CHUNK_METERS, chunks: 0,
    raw: 0, maxRaw: 0, batches: 0 };
let landmarkSeen = false, tollSighted = false;
let phase = 'opening', complete = false, stageElapsed = 0, barrierBroken = false;
let cine = null, vehicleLoop = null;
let mortarArmed = false, mortarTimer = 0, mortarShots = 0, mortarImpacts = 0;
let mortarCursor = 0, mortarLastImpact = null;
const cineCam = { x: PLAY_CAM.x, y: PLAY_CAM.y, z: PLAY_CAM.z };

let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function addBlocker(x, z, hx, hz, top = 20, yaw = 0, kind = 'solid', bullet = true) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const worldHx = Math.abs(c) * hx + Math.abs(s) * hz;
    const b = {
        x, z, hx, hz, axx: c, axz: s, azx: -s, azz: c,
        rad: Math.hypot(hx, hz), top, standable: false, kind, bullet,
        queryStamp: 0,
    };
    blockers.push(b);
    const k0 = Math.floor((x - worldHx) / BLOCKER_BIN_WORLD);
    const k1 = Math.floor((x + worldHx) / BLOCKER_BIN_WORLD);
    for (let k = k0; k <= k1; k++) {
        let bin = blockerBins.get(k);
        if (!bin) { bin = []; blockerBins.set(k, bin); }
        bin.push(b);
    }
    return b;
}

function visitBlockers(x0, x1, padding, visit) {
    const k0 = Math.floor((Math.min(x0, x1) - padding) / BLOCKER_BIN_WORLD);
    const k1 = Math.floor((Math.max(x0, x1) + padding) / BLOCKER_BIN_WORLD);
    const stamp = ++blockerQueryStamp;
    for (let k = k0; k <= k1; k++) {
        const bin = blockerBins.get(k);
        if (!bin) continue;
        for (const b of bin) {
            if (b.queryStamp === stamp) continue;
            b.queryStamp = stamp;
            if (visit(b)) return true;
        }
    }
    return false;
}

function pointInBlocker(x, z, radius, b) {
    const dx = x - b.x, dz = z - b.z;
    if (dx * dx + dz * dz > (b.rad + radius + 1) ** 2) return false;
    const lx = dx * b.axx + dz * b.axz;
    const lz = dx * b.azx + dz * b.azz;
    return Math.abs(lx) <= b.hx + radius && Math.abs(lz) <= b.hz + radius;
}

function blockedAt(x, z, radius = 3.5) {
    return visitBlockers(x, x, radius + 1,
        b => pointInBlocker(x, z, radius, b));
}

function recordProp(kind, p, hx = 0, hz = 0, top = 0, solid = false, meta = null,
    yaw = 0, bullet = true) {
    propRecords.push({ kind, x: p.x, z: p.z, hx, hz, top, solid, yaw, ...(meta || {}) });
    if (solid) addBlocker(p.x, p.z, hx, hz, top, yaw, kind, bullet);
}

export function resolve(pos, radius, feetY = 0) {
    blockerScratch.length = 0;
    visitBlockers(pos.x, pos.x, radius + 1, b => {
        blockerScratch.push(b); return false;
    });
    resolveBlockers(pos, radius, roadHeightAtX(pos.x), blockerScratch);
}

function segHitsBlocker(x0, z0, x1, z1, b) {
    const tx0 = (x0 - b.x) * b.axx + (z0 - b.z) * b.axz;
    const tz0 = (x0 - b.x) * b.azx + (z0 - b.z) * b.azz;
    const tx1 = (x1 - b.x) * b.axx + (z1 - b.z) * b.axz;
    const tz1 = (x1 - b.x) * b.azx + (z1 - b.z) * b.azz;
    const dx = tx1 - tx0, dz = tz1 - tz0;
    let t0 = 0, t1 = 1;
    const clip = (p, q) => {
        if (Math.abs(p) < 1e-9) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
        return true;
    };
    return clip(-dx, tx0 + b.hx) && clip(dx, b.hx - tx0)
        && clip(-dz, tz0 + b.hz) && clip(dz, b.hz - tz0);
}

export function stage7SegHitsWall(x0, z0, x1, z1, y = 0) {
    return visitBlockers(x0, x1, 0,
        b => b.bullet && y < b.top && segHitsBlocker(x0, z0, x1, z1, b));
}

function mortarBlastOrigin(x, z) {
    return mortarBlastOrigins.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 4);
}

function box(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m); return m;
}

function cylinder(parent, mat, rt, rb, h, seg, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
}

function staticBox(list, mat, sx, sy, sz, x, y, z, yaw = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.rotation.y = yaw;
    m.castShadow = true; m.receiveShadow = true; list.push(m); return m;
}

function roadHeightAtX(x) {
    const L = ensureLayout();
    return L.roadYAtMeter((L.eastX - x) / CAMP_M);
}

export function stage7RoadHeight(x) { return roadHeightAtX(x); }

function stripBetween(list, mat, a, b, width, y = 0.25) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return null;
    return staticBox(list, mat, len, 0.08, width,
        (a.x + b.x) / 2, y, (a.z + b.z) / 2, -Math.atan2(dz, dx));
}

function roadSpanParts(m0, m1) {
    const L = ensureLayout();
    const cuts = [m0, m1, L.descentStartMeter, L.descentEndMeter]
        .filter(m => m >= m0 && m <= m1).sort((a, b) => a - b);
    const unique = cuts.filter((m, i) => !i || Math.abs(m - cuts[i - 1]) > 1e-6);
    const out = [];
    for (let i = 1; i < unique.length; i++)
        if (unique[i] - unique[i - 1] > 1e-6)
            out.push([unique[i - 1], unique[i]]);
    return out;
}

function roadSpanBox(list, mat, m0, m1, sy, sz, z, yOffset = 0) {
    const L = ensureLayout(), made = [];
    for (const [a, b] of roadSpanParts(m0, m1)) {
        const meter = (a + b) / 2;
        const pitch = L.roadPitchAtMeter(meter);
        const horizontal = (b - a) * CAMP_M;
        const span = horizontal / Math.max(0.001, Math.cos(pitch));
        const mesh = staticBox(list, mat, span, sy, sz,
            L.xAtMeter(meter), L.roadYAtMeter(meter) + yOffset, z);
        mesh.rotation.z = pitch; made.push(mesh);
    }
    return made;
}

function roadProfileShape(list, mat, points, yOffset = 0) {
    const L = ensureLayout();
    const minMeter = Math.min(...points.map(p => p.meter));
    const maxMeter = Math.max(...points.map(p => p.meter));
    const anchorMeter = minMeter;
    const pitch = L.roadPitchAtMeter((minMeter + maxMeter) / 2);
    const cos = Math.max(0.001, Math.cos(pitch));
    const anchorX = L.xAtMeter(anchorMeter);
    const root = new THREE.Group();
    root.position.set(anchorX, L.roadYAtMeter(anchorMeter), 0);
    root.rotation.z = pitch;
    const pieces = [];
    flatShape(pieces, mat, points.map(p => ({
        x: (L.xAtMeter(p.meter) - anchorX) / cos,
        z: p.z,
    })), 0, yOffset, 0);
    for (const piece of pieces) root.add(piece);
    list.push(root); return root;
}

function roadProfileStrip(list, mat, a, b, width, yOffset = 0.25) {
    const L = ensureLayout();
    const anchorMeter = Math.min(a.meter, b.meter);
    const pitch = L.roadPitchAtMeter((a.meter + b.meter) / 2);
    const cos = Math.max(0.001, Math.cos(pitch));
    const anchorX = L.xAtMeter(anchorMeter);
    const root = new THREE.Group();
    root.position.set(anchorX, L.roadYAtMeter(anchorMeter), 0);
    root.rotation.z = pitch;
    const pieces = [];
    stripBetween(pieces, mat, {
        x: (L.xAtMeter(a.meter) - anchorX) / cos, z: a.z,
    }, {
        x: (L.xAtMeter(b.meter) - anchorX) / cos, z: b.z,
    }, width, yOffset);
    for (const piece of pieces) root.add(piece);
    list.push(root); return root;
}

function cableBetween(list, mat, a, b, thickness) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(
        thickness, thickness, len, 6, 1, false), mat);
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    m.quaternion.setFromUnitVectors(MORTAR_UP, dir);
    m.castShadow = true; list.push(m); return m;
}

function pathFromPoints(points, PathType = THREE.Path) {
    const path = new PathType();
    if (!points.length) return path;
    path.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].z);
    path.lineTo(points[0].x, points[0].z);
    return path;
}

function flatShape(list, mat, points, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(
        pathFromPoints(points.map(p => ({ x: p.x, z: -p.z })), THREE.Shape)), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    list.push(mesh); return mesh;
}

function roadLineIntervals(z, halfWidth = 0) {
    const L = ensureLayout(), intervals = [];
    if (Math.abs(Math.abs(z) - L.roadEdge) <= halfWidth + 0.2 * CAMP_M) {
        const side = z < 0 ? -1 : 1;
        for (const r of S7_RAMPS) if (r.side === side)
            intervals.push({ a: Math.max(0, r.mergeMeter - 2),
                b: Math.min(L.lengthMeters, r.mergeEndMeter + 2) });
    }
    intervals.sort((a, b) => a.a - b.a);
    return intervals;
}

function addSolidRoadLine(list, mat, z, width) {
    const L = ensureLayout(), gaps = roadLineIntervals(z, width / 2);
    let cursor = 0;
    for (const gap of gaps) {
        if (gap.a > cursor + 0.08) {
            roadSpanBox(list, mat, cursor, gap.a, 0.08, width, z, 0.25);
        }
        cursor = Math.max(cursor, gap.b);
    }
    if (cursor < L.lengthMeters - 0.08) {
        roadSpanBox(list, mat, cursor, L.lengthMeters,
            0.08, width, z, 0.25);
    }
}

function markerAt(name, p, color = PAL.amber) {
    const m = new THREE.Mesh(new THREE.RingGeometry(6.5, 8.7, 24),
        new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.44,
            side: THREE.DoubleSide, toneMapped: false,
        }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, (p.y ?? roadHeightAtX(p.x)) + 0.36, p.z);
    m.visible = false;
    worldRoot.add(m); markers[name] = m; return m;
}

function buildMaterials() {
    return {
        road: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        underside: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        earth: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        grass: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        reflector: new THREE.MeshLambertMaterial({
            color: PAL.white, emissive: PAL.white, emissiveIntensity: 0.22,
        }),
        red: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        amber: new THREE.MeshLambertMaterial({
            color: PAL.amber, emissive: PAL.amber, emissiveIntensity: 0.72,
        }),
        window: new THREE.MeshLambertMaterial({
            color: PAL.screenBg, emissive: PAL.amberDim, emissiveIntensity: 0.42,
        }),
        // Pylon Pasupati DULU MeshBasic: material Basic mengabaikan cahaya, jadi
        // menara 26 m itu bersinar seterang siang persis di tengah adegan malam
        // — penyumbang "terlalu terang" terbesar (2026-08-10). Sekarang Lambert,
        // dan yang menyala hanya lampu peringatan penerbangan di mahkotanya.
        pylonConcrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        pylonRed: new THREE.MeshLambertMaterial({
            color: PAL.hazard, emissive: PAL.hazard, emissiveIntensity: 0.34,
        }),
        cable: new THREE.MeshBasicMaterial({
            color: PAL.white, transparent: true, opacity: 0.52,
            depthWrite: false, toneMapped: false,
        }),
        rain: new THREE.MeshBasicMaterial({
            color: PAL.white, transparent: true, opacity: 0.19,
            toneMapped: false, depthWrite: false,
        }),
        spark: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
        dust: new THREE.MeshLambertMaterial({
            color: PAL.concrete, transparent: true, opacity: 0.45,
        }),
    };
}

// Jalan-jalan di permukaan tanah kota: aspal di bawah dek, jalan lintas tiap
// interval ramp, dan dua feeder sejajar. Gedung/rumah/toko/sekolah/tamannya
// dibangun `stage7City.js` (PUSAT KOTA BANDUNG, 2026-08-10).
function buildLowerRoads(M, staticProps) {
    const L = ensureLayout();
    const beyond = L.beyondMeters * CAMP_M;
    staticBox(staticProps, M.earth, L.length + beyond + 300, 5, L.deckWidth + 720,
        OX - beyond / 2, L.lowerY - 2.8, OZ);
    for (let meter = 0; meter <= L.lengthMeters; meter += L.rampIntervalMeters) {
        const x = L.xAtMeter(meter);
        staticBox(staticProps, M.road, 8 * CAMP_M, 1, L.deckWidth + 650,
            x, L.lowerY + 0.15, OZ);
        const joinsLowerLevel = Math.abs(L.roadYAtMeter(meter) - L.lowerY) < 0.01;
        lowerRoadRecords.push({ meter, x, y: L.lowerY,
            belowDeck: !joinsLowerLevel, joinsLowerLevel });
    }
    for (const side of [-1, 1]) {
        const z = side * (L.deckHalf + L.rampWidth / 2);
        staticBox(staticProps, M.road, L.length + beyond, 1, L.rampWidth,
            OX - beyond / 2, L.lowerY + 0.16, z);
        lowerRoadRecords.push({ meter: null, x: OX - beyond / 2, z, y: L.lowerY,
            belowDeck: true, parallelFeeder: true, side });
    }
}

function buildBandung() {
    cityStats = buildBandungCity({
        L: ensureLayout(), parent: worldRoot,
        record: (kind, x, z, hx, hz, top, meta) =>
            recordProp(kind, { x, z }, hx, hz, top, false, meta),
    });
}

function buildDeck(M, staticProps) {
    const L = ensureLayout();
    const moduleMeters = L.rampIntervalMeters;
    for (let m0 = 0; m0 < L.lengthMeters; m0 += moduleMeters) {
        const m1 = Math.min(L.lengthMeters, m0 + moduleMeters);
        roadSpanBox(staticProps, M.underside, m0, m1, 1 * CAMP_M,
            L.deckWidth + 2.2 * CAMP_M, OZ, -1.45 * CAMP_M);
        roadSpanBox(staticProps, M.panel, m0, m1, 0.22,
            L.medianWidth, OZ, 0.22);
    }

    // Jalan kini utuh: satu pemanggilan membagi permukaan hanya pada dua titik
    // profil elevasi (datar -> turunan -> plaza bawah), tanpa ShapeGeometry
    // berlubang atau fragmentasi tambahan sepanjang 1,5 km.
    roadSkinSegmentCount = roadSpanBox(staticProps, M.road, 0, L.lengthMeters,
        0.12, L.deckWidth, OZ, 0.17).length;

    const separators = [];
    for (let i = 1; i < L.lanesPerSide; i++) {
        separators.push(-(L.medianWidth / 2 + i * L.laneWidth));
        separators.push(L.medianWidth / 2 + i * L.laneWidth);
    }
    for (const z of separators)
        for (let meter = 6; meter < L.lengthMeters; meter += 12)
            roadSpanBox(staticProps, M.white, Math.max(0, meter - 2.6),
                Math.min(L.lengthMeters, meter + 2.6), 0.08,
                0.12 * CAMP_M, z, 0.25);
    for (const side of [-1, 1]) {
        addSolidRoadLine(staticProps, M.white, side * (L.medianWidth / 2),
            0.09 * CAMP_M);
        addSolidRoadLine(staticProps, M.white, side * L.roadEdge,
            0.12 * CAMP_M);
        const p = { x: OX, z: side * (L.roadEdge + L.shoulderWidth / 2) };
        shoulderRecords.push({ side, ...p, width: L.shoulderWidth,
            lineZ: side * L.roadEdge, lineStyle: 'solid' });
        recordProp('road-shoulder', p, L.length / 2, L.shoulderWidth / 2,
            0, false, { side, widthMeters: L.shoulderWidth / CAMP_M,
                lineStyle: 'solid', lineZ: side * L.roadEdge });
        recordProp('shoulder-line', { x: OX, z: side * L.roadEdge },
            L.length / 2, 0.06 * CAMP_M, 0, false,
            { side, style: 'solid', dashed: false });
    }

    for (const side of [-1, 1]) {
        const openings = S7_RAMPS.filter(r => r.side === side)
            .map(r => ({ a: Math.max(0, r.mergeMeter - 2),
                b: Math.min(L.lengthMeters, r.mergeEndMeter + 2) }))
            .sort((a, b) => a.a - b.a);
        let cursor = 0;
        const addBarrierSpan = (a, b) => {
            for (const [p0, p1] of roadSpanParts(a, b)) {
                const meter = (p0 + p1) / 2;
                roadSpanBox(staticProps, M.steel, p0, p1,
                    0.9 * CAMP_M, 0.16 * CAMP_M,
                    side * (L.deckHalf - 0.15 * CAMP_M), 0.55 * CAMP_M);
                const len = (p1 - p0) * CAMP_M;
                recordProp('outer-barrier', {
                    x: L.xAtMeter(meter),
                    z: side * (L.deckHalf - 0.15 * CAMP_M),
                }, len / 2, 0.08 * CAMP_M,
                L.roadYAtMeter(meter) + 1.05 * CAMP_M, true,
                { side, outsideShoulder: true,
                    roadY: L.roadYAtMeter(meter) }, 0, true);
            }
        };
        for (const gap of openings) {
            if (gap.a > cursor) addBarrierSpan(cursor, gap.a);
            cursor = Math.max(cursor, gap.b);
        }
        if (cursor < L.lengthMeters) addBarrierSpan(cursor, L.lengthMeters);
    }
    recordProp('flyover-deck', { x: OX, z: OZ }, L.length / 2, L.deckHalf, 0,
        false, { lengthMeters: L.lengthMeters, widthMeters: L.deckWidth / CAMP_M,
            descentStartMeter: L.descentStartMeter,
            descentEndMeter: L.descentEndMeter,
            lowerLevelY: -L.descentDrop });
}

function buildRampsAndSupports(M, staticProps) {
    const L = ensureLayout();
    for (const r of S7_RAMPS) {
        const rampRoot = new THREE.Group();
        rampRoot.position.set(r.startX, r.startY, r.startZ);
        rampRoot.rotation.y = Math.PI;
        const slope = new THREE.Group();
        const slopeLength = Math.hypot(r.length, r.endY - r.startY);
        slope.rotation.z = Math.atan2(r.endY - r.startY, r.length);
        rampRoot.add(slope);
        box(slope, M.underside, slopeLength, 0.75 * CAMP_M, r.width,
            slopeLength / 2, -0.42 * CAMP_M, 0);
        box(slope, M.road, slopeLength, 0.24, r.width,
            slopeLength / 2, 0, 0);
        for (let meter = 5; meter < r.length / CAMP_M; meter += 10)
            box(slope, M.reflector, 4.2 * CAMP_M, 0.08, 0.11 * CAMP_M,
                meter * CAMP_M, 0.22, 0);
        for (const edge of [-1, 1]) {
            box(slope, M.reflector, slopeLength, 0.08, 0.09 * CAMP_M,
                slopeLength / 2, 0.22, edge * (r.width / 2 - 0.18 * CAMP_M));
            box(slope, M.steel, slopeLength, 0.75 * CAMP_M, 0.14 * CAMP_M,
                slopeLength / 2, 0.45 * CAMP_M,
                edge * (r.width / 2 - 0.08 * CAMP_M));
        }
        staticProps.push(rampRoot);

        const mergeMeters = r.mergeLength / CAMP_M;
        const midMeter = r.mergeMeter + mergeMeters * 0.52;
        const mergePoints = [
            { meter: r.mergeMeter, z: r.side * L.deckHalf },
            { meter: r.mergeMeter, z: r.side * (L.deckHalf + r.width) },
            { meter: midMeter, z: r.side * (L.deckHalf + L.laneWidth) },
            { meter: r.mergeEndMeter, z: r.side * L.roadEdge },
            { meter: r.mergeEndMeter, z: r.side * (L.roadEdge - L.laneWidth) },
            { meter: midMeter, z: r.side * L.roadEdge },
        ];
        roadProfileShape(staticProps, M.underside, mergePoints, -0.58 * CAMP_M);
        roadProfileShape(staticProps, M.road, mergePoints, 0.19);

        const outerStart = { meter: r.mergeMeter,
            z: r.side * (L.deckHalf + r.width - 0.12 * CAMP_M) };
        const outerMid = { meter: midMeter,
            z: r.side * (L.deckHalf + L.laneWidth - 0.12 * CAMP_M) };
        const outerEnd = { meter: r.mergeEndMeter,
            z: r.side * (L.roadEdge - 0.12 * CAMP_M) };
        roadProfileStrip(staticProps, M.reflector, outerStart, outerMid,
            0.1 * CAMP_M);
        roadProfileStrip(staticProps, M.reflector, outerMid, outerEnd,
            0.1 * CAMP_M);
        for (let i = 0; i < 10; i++) {
            const t0 = i / 10, t1 = Math.min(1, t0 + 0.055);
            const mergeLine = t => ({
                meter: r.mergeMeter + mergeMeters * t,
                z: r.side * (L.deckHalf
                    + (L.roadEdge - L.laneWidth * 0.5 - L.deckHalf) * t),
            });
            roadProfileStrip(staticProps, M.reflector, mergeLine(t0), mergeLine(t1),
                0.11 * CAMP_M);
        }

        for (const t of [0.3, 0.58, 0.84]) {
            const roadY = r.startY + (r.endY - r.startY) * t;
            const h = roadY - L.lowerY - 0.45 * CAMP_M;
            if (h <= 0.4 * CAMP_M) continue;
            staticBox(staticProps, M.concrete, 1.2 * CAMP_M, h,
                1.2 * CAMP_M, r.startX + (r.mergeX - r.startX) * t,
                L.lowerY + h / 2, r.startZ);
        }

        const barricadeX = r.mergeX + 0.8 * CAMP_M;
        const barricadeZ = r.side * (L.deckHalf + r.width / 2);
        staticBox(staticProps, M.concrete, 0.62 * CAMP_M, 0.9 * CAMP_M, r.width,
            barricadeX, 0.52 * CAMP_M, barricadeZ);
        const stripeCount = Math.max(4, Math.floor(r.width / (0.9 * CAMP_M)));
        for (let i = 0; i < stripeCount; i++)
            staticBox(staticProps, i % 2 ? M.white : M.red,
                0.68 * CAMP_M, 0.18 * CAMP_M, r.width / stripeCount * 0.72,
                barricadeX, 1.02 * CAMP_M,
                r.side * (L.deckHalf + (i + 0.5) * r.width / stripeCount));
        recordProp('ramp-barricade', { x: barricadeX, z: barricadeZ },
            0.31 * CAMP_M, r.width / 2, 1.12 * CAMP_M, true,
            { ramp: r.id, blocksPlayer: true, blocksRobots: true }, 0, true);
        rampRecords.push({
            id: r.id, meter: r.meter, side: r.side, direction: r.direction,
            width: r.width, length: r.length, mergeLength: r.mergeLength,
            startMeter: r.startMeter, mergeMeter: r.mergeMeter,
            mergeEndMeter: r.mergeEndMeter, laneCount: r.laneCount,
            laneWidth: r.width / r.laneCount, accessible: false,
            startY: r.startY, endY: r.endY,
            mergeEndY: L.roadYAtMeter(r.mergeEndMeter), barricaded: true,
            lowerRoadVisible: true, orientation: r.orientation,
            travel: r.travel, mergeTo: r.mergeTo, fifthLane: r.fifthLane,
            parallel: true, rightAngle: false, taperedMerge: true,
        });
        recordProp('side-ramp', {
            x: (r.startX + r.mergeEndX) / 2, z: r.startZ,
        }, Math.abs(r.startX - r.mergeEndX) / 2, r.width / 2, 0, false,
            { meter: r.meter, side: r.side, direction: r.direction,
                laneCount: r.laneCount, accessible: false,
                orientation: r.orientation, travel: r.travel,
                fifthLane: true, taperedMerge: true,
                risesFromLowerRoad: r.startY === L.lowerY && r.endY === 0 });
    }
    const supportStep = Math.max(20, L.F.supportIntervalMeters);
    for (let meter = supportStep; meter < L.lengthMeters; meter += supportStep) {
        const x = L.xAtMeter(meter);
        const roadY = L.roadYAtMeter(meter);
        const h = roadY - L.lowerY - 1.4 * CAMP_M;
        if (h <= 0.4 * CAMP_M) continue;
        staticBox(staticProps, M.concrete, 2.4 * CAMP_M, h, 4.8 * CAMP_M,
            x, L.lowerY + h / 2, OZ);
        staticBox(staticProps, M.panel, 5.5 * CAMP_M, 1.2 * CAMP_M, 7.5 * CAMP_M,
            x, L.lowerY + 0.6 * CAMP_M, OZ);
        supportRecords.push({ meter, x, baseY: L.lowerY,
            topY: roadY - 1.4 * CAMP_M, roadY });
    }
}

function buildLamps(M, staticProps) {
    const L = ensureLayout(), interval = Math.max(10, L.F.lampIntervalMeters);
    lampSpecs.length = 0;
    for (let meter = interval / 2; meter < L.lengthMeters; meter += interval) {
        if (Math.abs(meter - L.F.landmarkMeter) < interval * 0.38) continue;
        const x = L.xAtMeter(meter), g = new THREE.Group();
        const roadY = L.roadYAtMeter(meter);
        g.position.set(x, roadY, OZ);
        const h = 8.5 * CAMP_M, arm = 2.65 * CAMP_M;
        cylinder(g, M.steel, 0.18 * CAMP_M, 0.26 * CAMP_M, h, 8, 0, h / 2, 0);
        for (const side of [-1, 1]) {
            const beam = box(g, M.steel, 0.18 * CAMP_M, 0.18 * CAMP_M,
                arm, 0, h - 0.45 * CAMP_M, side * arm / 2);
            beam.rotation.x = side * 0.12;
            box(g, M.amber, 0.9 * CAMP_M, 0.18 * CAMP_M, 0.42 * CAMP_M,
                0, h - 0.72 * CAMP_M, side * (arm - 0.12 * CAMP_M));
        }
        staticProps.push(g);
        const spec = { meter, x, y: roadY, z: 0,
            height: h, branches: 2, heads: 2 };
        lampSpecs.push(spec);
        recordProp('median-lamp', { x, z: 0 }, 0.28 * CAMP_M, 0.28 * CAMP_M,
            roadY + h, true, { meter, roadY, branches: 2, heads: 2 }, 0, true);
    }
}

function buildCars(M, staticProps) {
    const L = ensureLayout();
    const colors = [PAL.gunmetal, PAL.concrete, PAL.panel, PAL.hazard, PAL.steel];
    carRecords.length = 0;
    for (let i = 0; i < S7_CARS.length; i++) {
        const p = S7_CARS[i];
        const spec = STAGE7_ROAD_VEHICLE_SPECS[p.type];
        let g;
        if (p.type === 'suv') {
            g = new FuturisticSUV({
                bodyColor: colors[i % colors.length], scale: CAMP_M, enableLights: i % 4 !== 0,
            }).group;
        } else if (p.type === 'sedan') {
            g = new FuturisticSedan(colors[i % colors.length]).group;
            g.scale.setScalar(CAMP_M);
        } else {
            g = buildStage7RoadVehicle(p.type, colors[i % colors.length], CAMP_M);
        }
        const roadY = L.roadYAtMeter(p.meter);
        const carrier = new THREE.Group();
        carrier.position.set(p.x, roadY, p.z);
        carrier.rotation.z = L.roadPitchAtMeter(p.meter);
        carrier.userData.stage7Meter = p.meter;
        g.position.set(0, 0, 0); g.rotation.y = p.yaw;
        carrier.add(g); carrier.name = `stage7-${p.id}`; staticProps.push(carrier);
        const rec = {
            ...p, y: roadY, pitch: L.roadPitchAtMeter(p.meter),
            lengthMeters: spec.length, widthMeters: spec.width,
            heightMeters: spec.height,
            hx: spec.length * CAMP_M / 2, hz: spec.width * CAMP_M / 2,
        };
        carRecords.push(rec);
        recordProp('abandoned-car', p, rec.hx, rec.hz,
            roadY + spec.height * CAMP_M, true,
            { id: p.id, meter: p.meter, lane: p.lane, vehicleType: p.type,
                vehicleLengthMeters: spec.length, vehicleWidthMeters: spec.width,
                vehicleHeightMeters: spec.height,
                mazeBand: p.band, roadY, pitch: rec.pitch }, p.yaw, true);
    }
}

function addVehicleStaticChunks(parent, objects) {
    const chunks = new Map();
    for (const o of objects) {
        const meter = Math.max(0, o.userData?.stage7Meter || 0);
        const key = Math.floor(meter / VEHICLE_CHUNK_METERS);
        let list = chunks.get(key);
        if (!list) { list = []; chunks.set(key, list); }
        list.push(o);
    }
    const out = [];
    let maxRaw = 0;
    for (const key of [...chunks.keys()].sort((a, b) => a - b)) {
        const list = chunks.get(key);
        maxRaw = Math.max(maxRaw, list.length);
        out.push(...addMergedStatic(parent, list));
    }
    vehicleChunkStats = {
        chunkMeters: VEHICLE_CHUNK_METERS,
        chunks: chunks.size,
        raw: objects.length,
        maxRaw,
        batches: out.length,
    };
    return out;
}

function buildLandmark(M, staticProps) {
    const L = ensureLayout(), p = S7_LANDMARK;
    const height = Math.max(10, L.F.landmarkHeightMeters) * CAMP_M;
    const lower = height * 0.68, upper = height - lower;
    landmarkPieceCount = 0;
    staticBox(staticProps, M.pylonConcrete, 3 * CAMP_M, 0.72 * CAMP_M,
        0.92 * CAMP_M, p.x, 0.36 * CAMP_M, p.z); landmarkPieceCount++;
    staticBox(staticProps, M.ink, 3.35 * CAMP_M, 0.16 * CAMP_M,
        1.02 * CAMP_M, p.x, 0.08 * CAMP_M, p.z); landmarkPieceCount++;
    const shaftSegments = 7;
    for (let i = 0; i < shaftSegments; i++) {
        const y0 = 0.72 * CAMP_M + i * (lower - 0.72 * CAMP_M) / shaftSegments;
        const y1 = 0.72 * CAMP_M + (i + 1) * (lower - 0.72 * CAMP_M)
            / shaftSegments;
        const k = (i + 0.5) / shaftSegments;
        staticBox(staticProps, M.pylonConcrete,
            (2.45 - k * 0.72) * CAMP_M, y1 - y0,
            (0.84 - k * 0.2) * CAMP_M, p.x, (y0 + y1) / 2, p.z);
        landmarkPieceCount++;
        if (i === 1 || i === 4) {
            staticBox(staticProps, M.pylonRed, 0.16 * CAMP_M,
                (y1 - y0) * 0.78, 0.69 * CAMP_M,
                p.x + 1.02 * CAMP_M, (y0 + y1) / 2, p.z);
            landmarkPieceCount++;
        }
    }
    for (const blade of [-1, 1]) {
        const bx = p.x + blade * 0.55 * CAMP_M;
        staticBox(staticProps, M.pylonConcrete, 0.78 * CAMP_M, upper,
            0.6 * CAMP_M, bx, lower + upper / 2, p.z);
        staticBox(staticProps, M.pylonRed, 0.16 * CAMP_M, upper * 0.92,
            0.64 * CAMP_M, bx + blade * 0.46 * CAMP_M,
            lower + upper * 0.53, p.z);
        staticBox(staticProps, M.pylonRed, 0.86 * CAMP_M, 0.38 * CAMP_M,
            0.66 * CAMP_M, bx, height - 0.22 * CAMP_M, p.z);
        landmarkPieceCount += 3;
    }
    for (const side of [-1, 1]) {
        staticBox(staticProps, M.amber, 0.32 * CAMP_M, 0.18 * CAMP_M,
            0.22 * CAMP_M, p.x + side * 1.18 * CAMP_M,
            0.82 * CAMP_M, p.z);
        landmarkPieceCount++;
    }

    landmarkCableCount = 0;
    landmarkCableAnchorMaxZ = 0;
    landmarkCableFrontCount = 0; landmarkCableBackCount = 0;
    const cableTotal = Math.max(2, L.F.landmarkCableCount | 0);
    const frontRows = Math.ceil(cableTotal / 2);
    const backRows = cableTotal - frontRows;
    landmarkCableThickness = 0.07 * CAMP_M;
    for (const direction of [1, -1]) {
        const rows = direction > 0 ? frontRows : backRows;
        for (let i = 0; i < rows; i++) {
            const anchorMeter = L.F.landmarkMeter + direction * (22 + i * 21);
            if (anchorMeter <= 0 || anchorMeter >= L.lengthMeters) continue;
            cableBetween(staticProps, M.cable, {
                x: p.x - direction * 0.42 * CAMP_M,
                y: height - (2.2 + i * 3.05) * CAMP_M,
                z: 0,
            }, {
                x: L.xAtMeter(anchorMeter), y: 0.72 * CAMP_M,
                z: 0,
            }, landmarkCableThickness);
            staticBox(staticProps, M.steel, 0.9 * CAMP_M, 0.34 * CAMP_M,
                0.32 * CAMP_M, L.xAtMeter(anchorMeter), 0.4 * CAMP_M, 0);
            landmarkCableCount++;
            if (direction > 0) landmarkCableFrontCount++;
            else landmarkCableBackCount++;
            landmarkCableAnchorMaxZ = Math.max(landmarkCableAnchorMaxZ, 0);
        }
    }
    recordProp('pasupati-pylon', p, 1.5 * CAMP_M, 0.46 * CAMP_M, height, true,
        { meter: L.F.landmarkMeter, height, cables: landmarkCableCount,
            cableAnchorMaxZ: landmarkCableAnchorMaxZ,
            cableFront: landmarkCableFrontCount, cableBack: landmarkCableBackCount,
            cableThickness: landmarkCableThickness,
            pieces: landmarkPieceCount, tapered: true, splitCrown: true,
            officialName: 'Prof. Dr. Mochtar Kusumaatmadja Flyover' }, 0, true);
}

function machineDir(m) {
    return { x: Math.sin(m.yaw), z: Math.cos(m.yaw) };
}

function machineHatch(m) {
    const d = machineDir(m);
    const x = m.x + d.x * 17, z = m.z + d.z * 17;
    return { x, y: roadHeightAtX(x), z };
}

function machineLanding(m, slot) {
    const d = machineDir(m), sideX = d.z, sideZ = -d.x;
    const lateral = [-13, -4.5, 4.5, 13][slot % 4];
    const x = m.x + d.x * 38 + sideX * lateral;
    const z = m.z + d.z * 38 + sideZ * lateral;
    return { x, y: roadHeightAtX(x), z };
}

function buildSpawnFactories() {
    for (const p of S7_MACHINE_POINTS) {
        const rig = buildSpawnMachineMesh(30, 20, 30);
        rig.group.position.set(p.x, p.y, p.z); rig.group.rotation.y = p.yaw;
        worldRoot.add(rig.group); resetSpawnMachine(rig, false);
        const m = {
            ...p, rig, hp: 0, alive: true, active: false, hitT: 0,
            nextBatch: 0, birthCooldown: 0, pending: 0, batches: 0, spawned: 0,
        };
        spawnMachines.push(m);
        recordProp('robot-factory', p, 17, 17, p.y + 24, true,
            { id: p.id, roadY: p.y, chassisRemains: true }, p.yaw, true);
    }
}

function buildToll(M, staticProps) {
    const L = ensureLayout(), gateMeter = L.lengthMeters - 9;
    const gateX = L.xAtMeter(gateMeter);
    const gateY = L.roadYAtMeter(gateMeter);
    for (const z of [
        -(L.medianWidth / 2 + L.laneWidth * 2),
        -(L.deckHalf - 0.75 * CAMP_M),
        L.medianWidth / 2 + L.laneWidth * 2,
        L.deckHalf - 0.75 * CAMP_M,
    ]) {
        staticBox(staticProps, M.concrete, 5 * CAMP_M, 3.2 * CAMP_M, 1.25 * CAMP_M,
            gateX, gateY + 1.6 * CAMP_M, z);
        staticBox(staticProps, M.window, 3.8 * CAMP_M, 1.1 * CAMP_M, 1.32 * CAMP_M,
            gateX + 0.2 * CAMP_M, gateY + 2.35 * CAMP_M, z);
        recordProp('toll-booth', { x: gateX, z }, 2.5 * CAMP_M, 0.63 * CAMP_M,
            gateY + 3.2 * CAMP_M, true, { gate: 'Pasteur', roadY: gateY });
    }
    staticBox(staticProps, M.panel, 7 * CAMP_M, 0.7 * CAMP_M, L.deckWidth,
        gateX, gateY + 6.2 * CAMP_M, 0);
    recordProp('pasteur-toll-canopy', { x: gateX, z: 0 },
        3.5 * CAMP_M, L.deckHalf, gateY + 6.6 * CAMP_M, false,
        { gate: 'Pasteur', roadY: gateY, westEndpoint: true });

    const barrierX = L.xAtMeter(L.lengthMeters - 4);
    const barrierY = L.roadYAtMeter(L.lengthMeters - 4);
    tollBarrier = new THREE.Group();
    tollBarrier.position.set(barrierX, barrierY, -4.2 * CAMP_M);
    worldRoot.add(tollBarrier);
    box(tollBarrier, M.steel, 0.7 * CAMP_M, 1.3 * CAMP_M, 0.7 * CAMP_M,
        0, 0.65 * CAMP_M, 0);
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 1.25 * CAMP_M, 0); tollBarrier.add(armPivot);
    box(armPivot, M.red, 0.42 * CAMP_M, 0.32 * CAMP_M, 8.4 * CAMP_M,
        0, 0, 4.2 * CAMP_M);
    tollBarrier.userData.arm = armPivot;
    recordProp('toll-barrier', { x: barrierX, z: 0 },
        0.35 * CAMP_M, 4.2 * CAMP_M, barrierY + 1.5 * CAMP_M, true,
        { gate: 'Pasteur', roadY: barrierY });

    tacticalVehicle = buildTacticalVehicleMesh(CAMP_M, PAL.gunmetal);
    tacticalVehicle.group.position.set(vehicleObject.x, vehicleObject.y, vehicleObject.z);
    tacticalVehicle.group.rotation.y = Math.PI; tacticalVehicle.baseY = vehicleObject.y;
    worldRoot.add(tacticalVehicle.group);
    recordProp('grd-ltv-45', vehicleObject, 21, 11, vehicleObject.y + 19, true,
        { facing: 'west', destination: 'Kertajati', roadSide: 'left',
            carriageway: 'south', centered: false,
            roadY: vehicleObject.y }, Math.PI, true);
}

// DUNIA DI BALIK GERBANG (2026-08-10, permintaan user). Jalan tol Pasteur
// diteruskan `beyondTollMeters` lagi ke barat: aspal, marka, rel pengaman,
// pulau pemisah keluar gerbang, gantry rambu, tiang lampu dan beberapa mobil
// mogok. SEMUANYA DEKOR — tak satu pun jadi blocker dan `stage7Walk` tidak
// disentuh, jadi player tetap berhenti tepat di gerbang tol; yang berubah cuma
// tidak ada lagi tepi dunia yang terlihat di ujung jalan. Lampunya juga TIDAK
// masuk `lampSpecs`, supaya ke-14 PointLight tetap terbagi di sepanjang rute
// yang benar-benar dimainkan (dan jumlah light per stage tetap).
function buildBeyondToll(M, staticProps) {
    const L = ensureLayout();
    if (L.beyondMeters <= 0) return;
    const m0 = L.lengthMeters, m1 = L.lengthMeters + L.beyondMeters;
    const roadY = L.roadYAtMeter(m1);
    roadSpanBox(staticProps, M.road, m0, m1, 0.12, L.deckWidth, OZ, 0.17);
    roadSpanBox(staticProps, M.panel, m0, m1, 0.22, L.medianWidth, OZ, 0.22);
    for (let i = 1; i < L.lanesPerSide; i++)
        for (const side of [-1, 1])
            for (let meter = m0 + 6; meter < m1; meter += 12)
                roadSpanBox(staticProps, M.white, meter - 2.6, meter + 2.6,
                    0.08, 0.12 * CAMP_M,
                    side * (L.medianWidth / 2 + i * L.laneWidth), 0.25);
    for (const side of [-1, 1]) {
        roadSpanBox(staticProps, M.white, m0, m1, 0.08, 0.09 * CAMP_M,
            side * (L.medianWidth / 2), 0.25);
        roadSpanBox(staticProps, M.white, m0, m1, 0.08, 0.12 * CAMP_M,
            side * L.roadEdge, 0.25);
        roadSpanBox(staticProps, M.steel, m0, m1, 0.9 * CAMP_M, 0.16 * CAMP_M,
            side * (L.deckHalf - 0.15 * CAMP_M), 0.55 * CAMP_M);
    }
    // Pulau pemisah keluar gerbang: hidung beton bergaris di antara gardu
    for (const z of [-(L.medianWidth / 2 + L.laneWidth * 2), -(L.deckHalf - 0.75 * CAMP_M),
        L.medianWidth / 2 + L.laneWidth * 2, L.deckHalf - 0.75 * CAMP_M]) {
        const nose = L.xAtMeter(m0 + 5);
        staticBox(staticProps, M.concrete, 9 * CAMP_M, 0.55 * CAMP_M,
            1.1 * CAMP_M, nose, roadY + 0.28 * CAMP_M, z);
        staticBox(staticProps, M.red, 1.4 * CAMP_M, 0.62 * CAMP_M,
            1.16 * CAMP_M, nose + 4 * CAMP_M, roadY + 0.31 * CAMP_M, z);
    }
    // Gantry struktur di kejauhan; papan penunjuk lokasinya sengaja dihapus.
    const gantryMeter = Math.min(m1 - 12, m0 + 70);
    const gx = L.xAtMeter(gantryMeter);
    const gantry = new THREE.Group();
    gantry.position.set(gx, roadY, OZ);
    for (const side of [-1, 1])
        cylinder(gantry, M.steel, 0.3 * CAMP_M, 0.34 * CAMP_M, 8.5 * CAMP_M, 8,
            0, 4.25 * CAMP_M, side * (L.deckHalf - 0.4 * CAMP_M));
    box(gantry, M.steel, 0.5 * CAMP_M, 0.5 * CAMP_M, L.deckWidth,
        0, 8.4 * CAMP_M, 0);
    staticProps.push(gantry);
    // Tiang lampu lanjutan (visual saja — di luar lampSpecs)
    const interval = Math.max(10, L.F.lampIntervalMeters);
    for (let meter = m0 + interval / 2; meter < m1; meter += interval) {
        const x = L.xAtMeter(meter), g = new THREE.Group();
        g.position.set(x, roadY, OZ);
        const h = 8.5 * CAMP_M, arm = 2.65 * CAMP_M;
        cylinder(g, M.steel, 0.18 * CAMP_M, 0.26 * CAMP_M, h, 8, 0, h / 2, 0);
        for (const side of [-1, 1]) {
            const beam = box(g, M.steel, 0.18 * CAMP_M, 0.18 * CAMP_M,
                arm, 0, h - 0.45 * CAMP_M, side * arm / 2);
            beam.rotation.x = side * 0.12;
            box(g, M.amber, 0.9 * CAMP_M, 0.18 * CAMP_M, 0.42 * CAMP_M,
                0, h - 0.72 * CAMP_M, side * (arm - 0.12 * CAMP_M));
        }
        staticProps.push(g);
        recordProp('beyond-lamp', { x, z: 0 }, 0.28 * CAMP_M, 0.28 * CAMP_M,
            roadY + h, false, { meter, roadY, decorOnly: true });
    }
    // Mobil mogok: jalan yang benar-benar kosong terbaca seperti set kosong
    const colors = [PAL.gunmetal, PAL.concrete, PAL.panel, PAL.steel];
    for (let i = 0; i < 5; i++) {
        const meter = m0 + 14 + i * 21;
        if (meter > m1 - 8) break;
        const lane = laneCenterFrom(L.lanes, i * 3 + 1);
        const g = i % 2
            ? new FuturisticSUV({ bodyColor: colors[i % colors.length],
                scale: CAMP_M, enableLights: false }).group
            : new FuturisticSedan(colors[i % colors.length]).group;
        if (i % 2 === 0) g.scale.setScalar(CAMP_M);
        const carrier = new THREE.Group();
        carrier.position.set(L.xAtMeter(meter), roadY, lane);
        g.rotation.y = [-0.12, 0.09, -0.05, 0.14, 0][i % 5];
        carrier.add(g); staticProps.push(carrier);
        recordProp('beyond-car', { x: carrier.position.x, z: lane },
            2.4 * CAMP_M, 1.1 * CAMP_M, roadY + 2.4 * CAMP_M, false,
            { meter, decorOnly: true });
    }
    recordProp('beyond-toll-road', { x: (L.westX + L.beyondX) / 2, z: OZ },
        Math.abs(L.westX - L.beyondX) / 2, L.deckHalf, roadY, false,
        { meters: L.beyondMeters, endX: L.beyondX, roadY, playerBlocked: true });
}

function buildFxPools(M) {
    for (let i = 0; i < 96; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 10, 0.16), M.rain);
        m.position.set(S7_START.x + rand(-190, 190), rand(4, 62),
            S7_START.z + rand(-160, 160));
        worldRoot.add(m); rainPool.push(m);
    }
    const rippleMat = new THREE.MeshBasicMaterial({
        color: PAL.white, transparent: true, opacity: 0.16,
        toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 24; i++) {
        const p = S7_CARS[i % S7_CARS.length] || S7_START;
        const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 16), rippleMat);
        const x = p.x + rand(-18, 18);
        m.rotation.x = -Math.PI / 2; m.position.set(x, roadHeightAtX(x) + 0.3,
            p.z + rand(-10, 10));
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
    const trackingMat = new THREE.MeshBasicMaterial({
        color: PAL.amber, transparent: true, opacity: 0.38,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const lockedMat = new THREE.MeshBasicMaterial({
        color: PAL.hazard, transparent: true, opacity: 0.82,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const blastR = mortarBlastRadius();
    for (let i = 0; i < Math.max(1, mortarCfg().poolSize | 0); i++) {
        const shell = mortarShell(); shell.visible = false; worldRoot.add(shell);
        const marker = new THREE.Mesh(new THREE.RingGeometry(
            blastR * 0.72, blastR, 32), trackingMat);
        marker.rotation.x = -Math.PI / 2; marker.visible = false;
        marker.position.y = 0.42; worldRoot.add(marker);
        const lock = new THREE.Mesh(new THREE.RingGeometry(
            blastR * 0.22, blastR * 0.34, 24), lockedMat);
        lock.rotation.x = -Math.PI / 2; lock.visible = false;
        lock.position.y = 0.46; worldRoot.add(lock);
        mortarPool.push({ shell, marker, lock, active: false, serial: 0,
            vx: 0, vy: 0, vz: 0, g: 0, landY: 0.5,
            tLeft: 0, life: 0, trailT: 0, locked: false,
            targetX: 0, targetY: 0, targetZ: 0, snd: null });
    }
}

function clearPointAt(meter, laneSeed = 0, radius = 4, reserved = []) {
    const L = ensureLayout();
    const laneOrder = [];
    for (let i = 0; i < L.lanes.length; i++)
        laneOrder.push((laneSeed + (i % 2 ? -(i + 1) / 2 : i / 2)) | 0);
    const offsets = [0, 7, -7, 14, -14];
    let fallback = null;
    for (const dm of offsets) for (const li of laneOrder) {
        const atMeter = Math.max(4, Math.min(L.lengthMeters - 4, meter + dm));
        const p = { meter: atMeter, x: L.xAtMeter(atMeter),
            y: L.roadYAtMeter(atMeter), z: laneCenterFrom(L.lanes, li) };
        if (!stage7Walk(p.x, p.z, radius) || blockedAt(p.x, p.z, radius)) continue;
        if (!fallback) fallback = p;
        if (reserved.every(q => Math.hypot(p.x - q.x, p.z - q.z)
            >= radius + q.radius)) return p;
    }
    return fallback || { ...S7_START };
}

function buildDynamicPlacements() {
    const L = ensureLayout();
    const supplyFractions = [0.07, 0.17, 0.29, 0.41, 0.57, 0.69, 0.81, 0.9];
    const supplyTypes = [
        ['ammo', 'pistol'], ['medkit'], ['ammo', 'rifle'], ['ammo', 'shotgun'],
        ['medkit'], ['ammo', 'launcher'], ['ammo', 'rifle'], ['medkit'],
    ];
    for (let i = 0; i < supplyFractions.length; i++) {
        const p = clearPointAt(L.lengthMeters * supplyFractions[i], i * 3, 3);
        supplyPlacements.push({
            ...p, type: supplyTypes[i][0], weapon: supplyTypes[i][1] || null,
        });
    }
    const reserved = [];
    const crateCount = Math.max(0, L.F.lootboxCount | 0);
    for (let i = 0; i < crateCount; i++) {
        const meter = 48 + (i + 0.5) * (L.lengthMeters - 150)
            / Math.max(1, crateCount);
        const p = clearPointAt(meter, i * 5 + 2, 4, reserved);
        cratePlacements.push({ ...p, section: 'flyover' });
        reserved.push({ x: p.x, z: p.z, radius: 5.2 });
    }
    const barrelCount = Math.max(0, L.F.barrelCount | 0);
    for (let i = 0; i < barrelCount; i++) {
        const meter = 55 + (i + 0.32) * (L.lengthMeters - 160)
            / Math.max(1, barrelCount);
        const p = clearPointAt(meter, i * 7 + 1, 3, reserved);
        barrelPlacements.push({ ...p, section: 'flyover' });
        reserved.push({ x: p.x, z: p.z, radius: 3.4 });
    }
}

function buildWorld() {
    const L = ensureLayout();
    worldRoot = new THREE.Group(); worldRoot.name = 'Stage7Pasupati'; scene.add(worldRoot);
    const M = buildMaterials(), staticProps = [], vehicleStaticProps = [];
    buildLowerRoads(M, staticProps);
    buildBandung();
    buildDeck(M, staticProps);
    buildRampsAndSupports(M, staticProps);
    buildLamps(M, staticProps);
    buildCars(M, vehicleStaticProps);
    buildLandmark(M, staticProps);
    buildSpawnFactories();
    buildToll(M, staticProps);
    buildBeyondToll(M, staticProps);

    staticBatch = [
        ...addMergedStatic(worldRoot, staticProps),
        ...addVehicleStaticChunks(worldRoot, vehicleStaticProps),
    ];
    markerAt('landmark', S7_LANDMARK, PAL.amber);
    markerAt('toll', S7_TOLL, PAL.amber);
    markerAt('vehicle', S7_VEHICLE, PAL.amber);
    buildFxPools(M);

    const wantedLights = Math.min(lampSpecs.length, Math.max(0, L.F.pointLights | 0));
    for (let i = 0; i < wantedLights; i++) {
        const spec = lampSpecs[Math.min(lampSpecs.length - 1,
            Math.floor((i + 0.5) * lampSpecs.length / wantedLights))];
        // Jangkauan DIPERSEMPIT 125 m -> 30 m dan intensitasnya dinaikkan
        // (2026-08-10): lampu berjangkauan 125 m praktis jadi ambient kedua —
        // seluruh dek DAN kota di bawahnya rata terang. 30 m dipilih tepat:
        // ia masih menerangi seluruh lebar dek (tepi dek berjarak ~112 unit
        // dari kepala lampu) tetapi BERHENTI sebelum baris depan kota (~213
        // unit), jadi kotanya kembali gelap dan hanya jendelanya yang menyala.
        // Di antara tiang tersisa gelap — kolam cahaya itulah
        // yang membuatnya terbaca malam.
        const light = new THREE.PointLight(PAL.amber, 1.5, 30 * CAMP_M);
        light.position.set(spec.x, spec.y + spec.height - 0.8 * CAMP_M, spec.z);
        scene.add(light); registerStageLight('campaign-7', light); stageLights.push(light);
    }

    const navPad = 2 * CAMP_M;
    const x0 = L.westX - navPad, x1 = L.eastX + navPad;
    const z0 = -L.deckHalf - navPad, z1 = L.deckHalf + navPad;
    const cols = Math.ceil((x1 - x0) / NAV_CELL);
    const rows = Math.ceil((z1 - z0) / NAV_CELL);
    navBounds = { x0, x1, z0, z1, cols, rows, cell: NAV_CELL };
    navGrid = makeNavGrid(x0, z0, NAV_CELL, cols, rows,
        (x, z) => stage7Walk(x, z, 4) && !blockedAt(x, z, 3.5));
    buildDynamicPlacements();
}

export function ensureWorld() {
    if (built) return;
    built = true; buildWorld();
    // 2026-08-13 (optimasi): Stage 7 adalah dunia campaign TERBESAR (kota Bandung
    // + 240 kendaraan). Didaftarkan supaya benar-benar dilewati renderer ketika
    // stage lain yang dimainkan.
    registerCampaignWorldRoot({
        key: 'campaign-7', root: worldRoot, lightsKey: 'campaign-7',
        bounds: { x0: OX - 3000, x1: OX + 3000, z0: OZ - 3000, z1: OZ + 3000 },
        warmupViews: [{ x: S7_START.x, y: 0, z: S7_START.z },
            { x: S7_LANDMARK.x, y: 0, z: S7_LANDMARK.z }],
    });
}
export const worldBuilt = () => built;
export const stage7StaticBatchDbg = () => staticBatch;
export const stage7WorldRootDbg = () => worldRoot;   // smoke test (visibilitas root dunia)

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
    let n = 0;
    for (const z of robots) if (z.stage === 7 && z.encounter === name) n++;
    return n;
}

function encounterRange(name) {
    const L = ensureLayout(), landmark = L.F.landmarkMeter;
    const ranges = {
        eastSpan: [45, Math.max(160, landmark * 0.42)],
        rampRun: [Math.max(180, landmark * 0.38), landmark - 90],
        cableSpan: [landmark - 70, landmark + 185],
        westSpan: [landmark + 200, L.lengthMeters * 0.82],
        pasteurApproach: [L.lengthMeters * 0.8,
            L.lengthMeters - L.F.tollSightBeforeMeters - 12],
    };
    return ranges[name] || [45, L.lengthMeters - 200];
}

function spawnOne(cls, p, encounter, active = false) {
    spawnCampaignRobot(p.x, p.z, 7, cls, active);
    const z = robots[robots.length - 1];
    const roadY = p.y ?? roadHeightAtX(p.x);
    z.encounter = encounter; z.baseY = roadY; z.groundY = roadY;
    z.mesh.position.y = roadY; return z;
}

function spawnEncounter(name, counts, active = false) {
    if (!counts) return 0;
    const total = ['C', 'B', 'A'].reduce((n, cls) => n + Math.max(0, counts[cls] | 0), 0);
    const [m0, m1] = encounterRange(name);
    encounterPlacements[name] = [];
    let k = 0;
    for (const cls of ['C', 'B', 'A'])
        for (let i = 0; i < Math.max(0, counts[cls] | 0); i++, k++) {
            const meter = m0 + (k + 1) * Math.max(1, m1 - m0) / (total + 1);
            const p = clearPointAt(meter, k * 3 + name.length, 4);
            encounterPlacements[name].push({ ...p, meter, cls });
            spawnOne(cls, p, name, active);
        }
    return k;
}

function placeCommonItems() {
    for (const p of supplyPlacements) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
    for (const p of cratePlacements) spawnCrate(p.x, p.z, p.y);
    for (const p of barrelPlacements) spawnBarrel(p.x, p.z, p.y);
}

function setMarkers(names) {
    const wanted = new Set(names);
    for (const [name, m] of Object.entries(markers)) m.visible = wanted.has(name);
}

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
    spawnGroundPuff(start.x, start.z, PAL.tech, 10, start.y + 1.1);
    spawnBloodBurst(start.x, start.y + 9, start.z,
        -1, 0, 8, 0.9, 2.4, PAL.tech);
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
        const roadY = b.start.y + (b.target.y - b.start.y) * e;
        b.z.baseY = roadY; b.z.groundY = roadY;
        b.z.mesh.position.y = roadY + Math.sin(e * Math.PI) * 5;
        b.z.mesh.scale.set(b.base * (0.06 + g * 0.94),
            b.base * (0.025 + g * 0.975), b.base * (0.06 + g * 0.94));
        if (k >= 1) {
            b.z.mesh.position.set(b.target.x, b.target.y, b.target.z);
            b.z.baseY = b.target.y; b.z.groundY = b.target.y;
            b.z.mesh.scale.setScalar(b.base); b.z.machineBirth = false;
            b.z.state = 'chasing'; b.z.moving = false; b.z.aiming = false;
            spawnGroundPuff(b.target.x, b.target.z, PAL.techDim, 7,
                b.target.y + 0.7);
            machineBirths.splice(i, 1);
        }
    }
}

function destroyMachine(m) {
    if (!m.alive) return;
    m.alive = false; m.active = false; m.hp = 0; m.pending = 0; m.hitT = 0;
    // Rangkanya sengaja TETAP di layar sebagai penutup tembak — sejak 2026-08-09
    // ia jadi bangkai hitam gosong dengan part yang terlepas, dan karena terlihat
    // ia juga tetap pejal.
    wreckSpawnMachine(m.rig);
    explodeAt(new THREE.Vector3(m.x, m.y + 13, m.z), 32, 1);
    spawnGibs(m.x, m.y + 15, m.z, 16, -1, 0, 2.6,
        PAL.gunmetal, m.y + 0.4, PAL.ink);
    spawnBloodDecal(m.x, m.z, 8, PAL.ink); addCamShake(9);
    const left = machinesAlive();
    showStageMsg(`ROBOT FACTORY DESTROYED - ${left}/3 REMAINING`, 3200);
    if (left === 0) {
        const down = collapseRobotNetwork();
        showStageMsg(`FACTORY NETWORK COLLAPSED - ${down} UNITS DOWN`, 4600);
        addCamShake(13);
    }
}

// JARINGAN RUNTUH (2026-08-10, permintaan user: "ketika 3 spawn machine itu
// hancur, semua robot akan langsung hancur dan mati juga"). Ini sekaligus
// memperbaiki bug: baris lama hanya men-set `hp = 0` pada robot cetakan pabrik,
// padahal hp<=0 HANYA diproses di jalur "peluru mengenai robot" — jadi robot itu
// tetap berkeliaran dengan 0 HP dan gerbang `factoryRobotCount() === 0` menuju
// `vehicleReveal` baru terbuka kalau player menembaki mereka satu per satu.
// Sekarang SELURUH robot stage 7 dihabisi pada frame yang sama.
//
// Yang MASIH DI LAYAR mati lewat jalur kematian ledakan yang normal — gore
// penuh + loot, sehingga runtuhnya benar-benar terlihat. Yang di luar layar
// dilenyapkan langsung: tak ada yang menyaksikan gore-nya, dan menaburkan
// ratusan loot di sepanjang 1,5 km yang sudah dilewati hanya menambah mesh
// yang tak akan pernah dipungut. Keduanya tetap dihitung sebagai kill.
function collapseRobotNetwork() {
    let wrecked = 0, cleared = 0;
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 7) continue;
        if (stage7RobotInView(z)) {
            const p = z.mesh.position;
            spawnGroundPuff(p.x, p.z, PAL.amber, 7, (z.groundY || 0) + 1.2);
            killRobot(i, { cause: 'explosion' });
            wrecked++;
        } else {
            disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
            stats.kills++; cleared++;
        }
    }
    machineBirths.length = 0;
    return wrecked + cleared;
}

function machineBulletHit(b) {
    if (phase !== 'factorySiege') return false;
    const r2 = machineConfig().hitRadius ** 2;
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    for (const m of spawnMachines) {
        if (!m.alive || segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.x, 0, m.z) >= r2)
            continue;
        m.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage)
            * (b.explosive ? 1 : (player.dmgMul || 1));
        if (!b.explosive) {
            stats.hits++;
            spawnBloodBurst(bx, 12 + Math.random() * 5, bz, b.dir?.x || -1,
                b.dir?.z || 0, 3, 0.65, 1.5, PAL.amber);
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
        m.active = m.alive = true; m.hp = spawnMachineHp(); m.clock = 0;
        m.nextBatch = Math.max(0, C.firstBatchSec); m.birthCooldown = 0;
        m.pending = m.batches = m.spawned = 0; m.hitT = 0;
        resetSpawnMachine(m.rig, true);
    }
    showStageMsg('THREE ROBOT FACTORIES ONLINE - DESTROY ALL THREE', 4800);
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
                    showStageMsg(`FACTORIES FABRICATING - ${batchCount} ROBOTS EACH`, 2200);
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
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, revealSec); setCinematicActive(false); setAvatarRadioPose(false);
}

function stopVehicleLoop() {
    if (vehicleLoop) { stopLoopSFX(vehicleLoop); vehicleLoop = null; }
}

function finishOpening(skipped = false) {
    if (skipped) resetDialogue();
    cleanupCine(CFG.campaign.stage7.fadeSec);
    phase = 'flyover'; queueDialogue('flyoverPlan');
    setMarkers(['landmark']);
    showStageMsg('CROSS 1.5 KM ON THE PASUPATI FLYOVER', 4800);
}

function startOpening() {
    const L = ensureLayout();
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'opening', t: 0, stageT: 0, dialogueStarted: false,
        fading: false, fadeT: 0 };
    cineCam.x = 126; cineCam.y = 118; cineCam.z = 105;
    setCineFocus(S7_START.x - 4 * CAMP_M, S7_START.z, true);
    showCutsceneSkip(() => finishOpening(true));
    void L;
}

function startVehicleLoop() {
    if (vehicleLoop) return;
    vehicleLoop = playLoopSFX(sfxTankMove, 0.16);
    try { vehicleLoop.playbackRate = 1.55; } catch (e) { }
}

function startOutro() {
    if (cine || phase !== 'vehicleReveal') return;
    clearMortars();
    phase = 'outro'; setMarkers([]); releaseInputs(); clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'outro', stage: 'establish', t: 0, stageT: 0,
        fading: false, fadeT: 0 };
    cineCam.x = 112; cineCam.y = 88; cineCam.z = 104;
    setCineFocus(vehicleObject.x, vehicleObject.z, true); queueDialogue('vehicleFind');
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
        tacticalVehicle.group.position.x = vehicleObject.x - 185;
        tacticalVehicle.group.rotation.y = Math.PI;
        updateTacticalVehicleVisual(tacticalVehicle, 0,
            { doorOpen: 0, engineOn: true, speed: 72 });
    }
    cleanupCine(0); stopVehicleLoop(); clearMortars();
    beginStageTransition(stage8Scene);
}

function updateCine(dt) {
    if (!cine) return;
    cine.t += dt; cine.stageT += dt;
    const C = CFG.campaign.stage7;
    if (cine.kind === 'opening') {
        const k = Math.min(1, cine.t / Math.max(1, C.openingMinSec));
        cineCam.x = 126 - 28 * k; cineCam.y = 118 - 28 * k; cineCam.z = 105 - 18 * k;
        setCineFocus(S7_START.x - CAMP_M * (4 + k * 8), S7_START.z, true);
        if (!cine.dialogueStarted && cine.t >= C.openingDialogueDelaySec) {
            cine.dialogueStarted = true;
            queueDialogue('openingCommand'); queueDialogue('openingGibran');
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
        cineCam.x = 112 + Math.sin(cine.t * 0.4) * 4;
        if (!dialogueCurrent && !dialogueQueue.length) {
            cine.stage = 'inspect'; cine.stageT = 0;
            queueDialogue('routeCommand'); queueDialogue('routeReply');
            setCineFocus(vehicleObject.x + 8, vehicleObject.z + 3, true);
            setAvatarRadioPose(true, 0, 'gibranAccepts', 0.55);
        }
    } else if (cine.stage === 'inspect') {
        const k = Math.min(1, cine.stageT / 5);
        cineCam.x = 78 + k * 18; cineCam.y = 62 + k * 8; cineCam.z = 70 - k * 16;
        updateTacticalVehicleVisual(tacticalVehicle, dt,
            { doorOpen: 0.12 + k * 0.88, engineOn: false, speed: 0 });
        if (!dialogueCurrent && !dialogueQueue.length) {
            cine.stage = 'board'; cine.stageT = 0;
            queueDialogue('warningCommand'); queueDialogue('finalGibran');
            setAvatarRadioPose(false); startVehicleLoop();
        }
    } else if (cine.stage === 'board') {
        const k = Math.min(1, cine.stageT / 3.2);
        updateTacticalVehicleVisual(tacticalVehicle, dt,
            { doorOpen: 1 - k, engineOn: true, speed: 0 });
        setCineFocus(vehicleObject.x - 2, vehicleObject.z, true);
        if (k > 0.58 && avatarGroup) avatarGroup.visible = false;
        if (!dialogueCurrent && !dialogueQueue.length && cine.t >= C.outroMinSec) {
            cine.stage = 'drive'; cine.stageT = 0;
        }
    } else if (cine.stage === 'drive') {
        const k = Math.min(1, cine.stageT / 4.2), speed = 25 + 80 * k;
        updateTacticalVehicleVisual(tacticalVehicle, dt,
            { doorOpen: 0, engineOn: true, speed });
        tacticalVehicle.group.position.x -= speed * dt;
        setCineFocus(tacticalVehicle.group.position.x - 25,
            tacticalVehicle.group.position.z, true);
        cineCam.x = 90 + k * 45; cineCam.y = 72 + k * 40; cineCam.z = 88;
        if (!barrierBroken
            && tacticalVehicle.group.position.x <= tollBarrier.position.x + 24) {
            barrierBroken = true; tollBarrier.userData.arm.rotation.x = -1.5;
            addCamShake(3.5);
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
        m.position.set(tacticalVehicle.group.position.x + 18 + rand(-2, 2),
            tacticalVehicle.group.position.y + 2 + rand(0, 2),
            tacticalVehicle.group.position.z + rand(-5, 5));
        m.scale.setScalar(burst ? 1.8 : 1);
    }
}

function updateFx(dt) {
    for (const r of rainPool) {
        r.position.y -= dt * 86;
        const groundY = roadHeightAtX(r.position.x);
        if (r.position.y < groundY + 1) {
            r.position.x = camera.position.x + rand(-190, 190);
            r.position.z = camera.position.z + rand(-160, 160);
            r.position.y = roadHeightAtX(r.position.x) + rand(45, 66);
        }
    }
    for (const r of ripplePool) {
        r.userData.phase = (r.userData.phase + dt * 0.46) % 1;
        r.scale.setScalar(0.5 + r.userData.phase * 2.4);
    }
    for (let i = 0; i < sparkPool.length; i++) {
        const s = sparkPool[i], car = carRecords[i % Math.max(1, carRecords.length)];
        const active = (phase === 'flyover' || phase === 'tollApproach') && i < 12 && !!car;
        s.visible = active;
        if (active) {
            s.position.set(car.x + Math.sin(stageElapsed * 8 + i) * 2,
                car.y + 3 + ((stageElapsed * 15 + i) % 8), car.z);
            s.rotation.z += dt * 8;
        }
    }
    for (const e of exhaustPool) if (e.visible) {
        e.userData.life -= dt; e.position.y += dt * 7; e.position.x += dt * 8;
        e.scale.multiplyScalar(1 + dt * 1.8);
        if (e.userData.life <= 0) e.visible = false;
    }
}

function deactivateMortar(m) {
    stopLoopSFX(m.snd); m.snd = null; m.active = false; m.locked = false;
    m.shell.visible = false; m.marker.visible = false; m.lock.visible = false;
}

function clearMortars() {
    for (const m of mortarPool) deactivateMortar(m);
    mortarBlastOrigins.length = 0;
}

function launchMortar() {
    if (!mortarPool.length) return false;
    let m = null;
    for (let i = 0; i < mortarPool.length; i++) {
        const candidate = mortarPool[(mortarCursor + i) % mortarPool.length];
        if (!candidate.active) { m = candidate; mortarCursor = (mortarCursor + i + 1)
            % mortarPool.length; break; }
    }
    if (!m) return false;
    const L = ensureLayout(), C = mortarCfg(), T = CFG.campaign.bosses.tank;
    const side = mortarShots % 2 ? 1 : -1;
    const sx = camera.position.x + C.sourceLongitudinalMeters * CAMP_M;
    const sy = L.lowerY + 4 * CAMP_M;
    const sz = side * (L.deckHalf + C.sourceLateralMeters * CAMP_M);
    const dx = camera.position.x - sx, dz = camera.position.z - sz;
    const d = Math.hypot(dx, dz) || 1;
    const g = T.mortarGravity;
    const landY = roadHeightAtX(camera.position.x) + 0.5;
    const riseCap = 0.5 * g * Math.pow(T.mortarMaxSec * 0.45, 2);
    const rise = Math.min(riseCap,
        Math.max(T.mortarApexMeters * CAMP_M, d * T.mortarApexRatio));
    const apexY = Math.max(sy, landY) + rise;
    const tUp = Math.sqrt(2 * (apexY - sy) / g);
    const tDown = Math.sqrt(2 * (apexY - landY) / g);
    const flight = tUp + tDown;
    m.active = true; m.serial = ++mortarShots;
    m.vx = dx / flight; m.vz = dz / flight; m.vy = g * tUp; m.g = g;
    m.landY = landY; m.tLeft = flight; m.life = T.mortarMaxSec;
    m.locked = false; m.targetX = camera.position.x;
    m.targetY = landY - 0.5; m.targetZ = camera.position.z;
    m.shell.position.set(sx, sy, sz); m.shell.visible = true;
    m.marker.position.set(m.targetX, m.targetY + 0.42, m.targetZ);
    m.marker.visible = true;
    m.lock.position.set(m.targetX, m.targetY + 0.46, m.targetZ);
    m.lock.visible = false;
    m.marker.scale.setScalar(1); m.lock.scale.setScalar(1);
    playSFX(sfxTankMortar, 0.68);
    spawnGroundPuff(sx, sz, PAL.concrete, 4, sy);
    return true;
}

function detonateMortar(m) {
    const C = mortarCfg(), x = m.shell.position.x, z = m.shell.position.z;
    stopLoopSFX(m.snd); m.snd = null;
    mortarBlastOrigins.push({ x, z, ttl: 0.25 });
    queueBoom(x, m.landY + 4.5, z, mortarBlastRadius(), true,
        C.playerDamage, C.robotDamage, sfxTankBlast);
    mortarImpacts++;
    mortarLastImpact = {
        serial: m.serial, x, y: m.landY, z,
        targetX: m.targetX, targetY: m.targetY, targetZ: m.targetZ,
        radius: mortarBlastRadius(), playerDamage: C.playerDamage,
        robotDamage: C.robotDamage, locked: m.locked,
    };
    addCamShake(5.5); deactivateMortar(m);
}

function mortarInFireZone(progress = progressMeters()) {
    const C = mortarCfg();
    return progress >= C.startMeter
        && progress <= Math.max(C.startMeter, C.endMeter);
}

function updateMortars(dt) {
    for (let i = mortarBlastOrigins.length - 1; i >= 0; i--)
        if ((mortarBlastOrigins[i].ttl -= dt) <= 0) mortarBlastOrigins.splice(i, 1);

    const C = mortarCfg();
    const mortarPhase = phase === 'flyover' || phase === 'tollApproach'
        || phase === 'factorySiege';
    const inFireZone = mortarInFireZone();
    if (!mortarArmed && !cine && mortarPhase && inFireZone) {
        mortarArmed = true; mortarTimer = C.intervalSec;
        queueDialogue('mortarWarning');
        showStageMsg('HOSTILE MORTAR FIRE - KEEP MOVING', 4200);
    }
    if (mortarArmed && !cine && mortarPhase && inFireZone) {
        mortarTimer -= dt;
        while (mortarTimer <= 0) {
            launchMortar(); mortarTimer += C.intervalSec;
        }
    } else if (mortarArmed && !inFireZone) mortarTimer = C.intervalSec;

    for (const m of mortarPool) {
        if (!m.active) continue;
        m.tLeft -= dt; m.life -= dt;
        if (!m.locked) {
            m.targetX = camera.position.x; m.targetZ = camera.position.z;
            m.targetY = roadHeightAtX(m.targetX);
            m.landY = m.targetY + 0.5;
            const remain = Math.max(0.03, m.tLeft);
            m.vx = (m.targetX - m.shell.position.x) / remain;
            m.vz = (m.targetZ - m.shell.position.z) / remain;
            if (m.tLeft <= C.lockSec) {
                m.locked = true; m.lock.visible = true;
            }
        }
        m.marker.position.set(m.targetX, m.targetY + 0.42, m.targetZ);
        m.lock.position.set(m.targetX, m.targetY + 0.46, m.targetZ);
        const pulse = 1 + Math.sin(stageElapsed * 10 + m.serial) * 0.08;
        m.marker.scale.setScalar(pulse);
        if (m.locked) m.lock.scale.setScalar(1 + (1 - Math.max(0, m.tLeft)
            / Math.max(0.01, C.lockSec)) * 0.8);

        m.vy -= m.g * dt;
        m.shell.position.x += m.vx * dt;
        m.shell.position.y += m.vy * dt;
        m.shell.position.z += m.vz * dt;
        mortarVelocity.set(m.vx, m.vy, m.vz);
        if (mortarVelocity.length() > 1e-3) {
            mortarVelocity.normalize();
            m.shell.quaternion.setFromUnitVectors(MORTAR_UP, mortarVelocity);
        }
        if (m.tLeft <= C.incomingSec && !m.snd)
            m.snd = playSFX(sfxTankIncoming, 0.62);
        if ((m.vy < 0 && m.shell.position.y <= m.landY) || m.life <= 0)
            detonateMortar(m);
    }
}

function resetStage() {
    phase = 'opening'; complete = false; landmarkSeen = tollSighted = false;
    stageElapsed = 0; barrierBroken = false; exhaustCursor = 0;
    mortarArmed = false; mortarTimer = mortarCfg().intervalSec;
    mortarShots = mortarImpacts = mortarCursor = 0; mortarLastImpact = null;
    clearMortars();
    machineBirths.length = 0;
    resetDialogue(); stopVehicleLoop();
    if (cine) cleanupCine(0);
    if (avatarGroup) avatarGroup.visible = true;
    setAvatarRadioPose(false); setCineBars(false); setCineFade(0, 0);
    setMarkers([]);
    if (tollBarrier?.userData.arm) tollBarrier.userData.arm.rotation.x = 0;
    if (tacticalVehicle) {
        tacticalVehicle.group.position.set(vehicleObject.x, vehicleObject.y, vehicleObject.z);
        tacticalVehicle.group.rotation.y = Math.PI;
        resetTacticalVehicleVisual(tacticalVehicle);
    }
    for (const e of exhaustPool) e.visible = false;
    for (const s of sparkPool) s.visible = false;
    const C = machineConfig();
    for (const m of spawnMachines) {
        m.hp = spawnMachineHp(); m.alive = true; m.active = false; m.hitT = 0; m.clock = 0;
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

function navCellFor(p) {
    if (!navGrid) return -1;
    const c = Math.floor((p.x - navGrid.x0) / navGrid.cell);
    const r = Math.floor((p.z - navGrid.z0) / navGrid.cell);
    for (let ring = 0; ring <= 6; ring++)
        for (let dr = -ring; dr <= ring; dr++)
            for (let dc = -ring; dc <= ring; dc++) {
                if (ring && Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
                const cc = c + dc, rr = r + dr;
                if (cc < 0 || rr < 0 || cc >= navGrid.cols || rr >= navGrid.rows) continue;
                const index = rr * navGrid.cols + cc;
                if (navGrid.walk[index]) return index;
            }
    return -1;
}

function navPoint(index) {
    const c = index % navGrid.cols, r = (index / navGrid.cols) | 0;
    return {
        x: navGrid.x0 + (c + 0.5) * navGrid.cell,
        z: navGrid.z0 + (r + 0.5) * navGrid.cell,
    };
}

function navFlood(startPoint, goalPoint = null) {
    const start = navCellFor(startPoint), goal = goalPoint ? navCellFor(goalPoint) : -1;
    const seen = new Uint8Array(navGrid.walk.length);
    const parent = goal >= 0 ? new Int32Array(navGrid.walk.length).fill(-2) : null;
    const queue = new Int32Array(navGrid.walk.length);
    let head = 0, tail = 0;
    if (start >= 0) { queue[tail++] = start; seen[start] = 1; if (parent) parent[start] = -1; }
    while (head < tail) {
        const at = queue[head++];
        const c = at % navGrid.cols, r = (at / navGrid.cols) | 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const cc = c + dc, rr = r + dr;
            if (cc < 0 || rr < 0 || cc >= navGrid.cols || rr >= navGrid.rows) continue;
            const next = rr * navGrid.cols + cc;
            if (!seen[next] && navGrid.walk[next]) {
                seen[next] = 1; if (parent) parent[next] = at; queue[tail++] = next;
            }
        }
    }
    const path = [];
    if (goal >= 0 && seen[goal] && parent) {
        for (let at = goal; at >= 0; at = parent[at]) path.push(navPoint(at));
        path.reverse();
    }
    return { start, goal, seen, count: tail, reached: goal < 0 ? false : !!seen[goal], path };
}

function navReached(flood, p) {
    const index = navCellFor(p);
    return index >= 0 && flood.seen[index] === 1;
}

function directWalkClear() {
    const L = ensureLayout(), z = S7_START.z;
    for (let meter = 20; meter <= L.lengthMeters - L.F.tollTriggerBeforeMeters; meter += 1.5) {
        const x = L.xAtMeter(meter);
        if (!stage7Walk(x, z, CFG.player.radius) || blockedAt(x, z, CFG.player.radius))
            return false;
    }
    return true;
}

function medianPassages() {
    const L = ensureLayout(), out = [];
    for (let meter = 70; meter < L.lengthMeters - 120; meter += 100) {
        const probe = meter + L.F.lampIntervalMeters * 0.27;
        const x = L.xAtMeter(probe);
        let clear = true;
        for (let z = -L.laneWidth * 1.25; z <= L.laneWidth * 1.25; z += CAMP_M * 0.35)
            if (!stage7Walk(x, z, CFG.player.radius)
                || blockedAt(x, z, CFG.player.radius)) { clear = false; break; }
        out.push({ meter: probe, clear });
    }
    return out;
}

export function stage7ConnectivityDebug() {
    ensureWorld();
    const L = ensureLayout(), flood = navFlood(S7_START, S7_TOLL);
    let pathLength = 0, minZ = Infinity, maxZ = -Infinity, medianCrossings = 0, lastSide = 0;
    for (let i = 0; i < flood.path.length; i++) {
        const p = flood.path[i];
        if (i) pathLength += Math.hypot(p.x - flood.path[i - 1].x,
            p.z - flood.path[i - 1].z);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        const side = p.z < -L.medianWidth / 2 ? -1 : p.z > L.medianWidth / 2 ? 1 : 0;
        if (side && lastSide && side !== lastSide) medianCrossings++;
        if (side) lastSide = side;
    }
    const direct = Math.hypot(S7_TOLL.x - S7_START.x, S7_TOLL.z - S7_START.z);
    const eastLandmark = { x: L.xAtMeter(L.F.landmarkMeter - 18),
        z: laneCenterFrom(L.lanes, L.lanesPerSide - 1) };
    const westLandmark = { x: L.xAtMeter(L.F.landmarkMeter + 18),
        z: laneCenterFrom(L.lanes, L.lanesPerSide) };
    const rampApproaches = S7_RAMPS.map(r => {
        const z = r.side * (L.roadEdge - L.laneWidth / 2);
        const candidates = [-12, 0, 12].map(dm => ({
            x: L.xAtMeter(Math.max(4, Math.min(L.lengthMeters - 4,
                r.mergeEndMeter + dm))), z,
        }));
        return {
            id: r.id, reachable: candidates.some(p => navReached(flood, p)),
            rampWalkable: stage7Walk((r.startX + r.mergeX) / 2, r.startZ, 0),
            orientation: r.orientation, fifthLane: r.fifthLane,
        };
    });
    const passages = medianPassages();
    return {
        connected: flood.reached, reachableCells: flood.count,
        goals: {
            toll: flood.reached,
            landmarkEast: navReached(flood, eastLandmark),
            landmarkWest: navReached(flood, westLandmark),
            vehicleApproach: navReached(flood, S7_VEHICLE),
            machineLandings: spawnMachines.every(m => [0, 1, 2, 3]
                .every(i => navReached(flood, machineLanding(m, i)))),
        },
        path: {
            cells: flood.path.length, length: pathLength, direct,
            detourRatio: direct > 0 ? pathLength / direct : 0,
            minZ, maxZ, crossesMedian: minZ < -L.medianWidth / 2
                && maxZ > L.medianWidth / 2,
            medianCrossings,
        },
        directBlocked: !directWalkClear(),
        rampApproaches,
        allRampApproachesReachable: rampApproaches.every(r => r.reachable),
        allRampsInaccessible: rampApproaches.every(r => !r.rampWalkable),
        medianPassages: passages,
        clearMedianPassages: passages.filter(p => p.clear).length,
        landmarkBypass: navReached(flood, eastLandmark) && navReached(flood, westLandmark),
    };
}

export const stage7FlyoverDebug = () => {
    const L = ensureLayout();
    const conn = stage7ConnectivityDebug();
    return {
        officialName: 'Prof. Dr. Mochtar Kusumaatmadja Flyover',
        legacyName: 'Pasupati',
        orientation: 'east-to-west',
        night: true,
        meters: {
            length: L.lengthMeters, lane: L.laneWidth / CAMP_M,
            median: L.medianWidth / CAMP_M,
            shoulder: L.shoulderWidth / CAMP_M,
            rampLane: L.rampWidth / L.rampLaneCount / CAMP_M,
            deckHeight: L.deckHeight / CAMP_M,
            descentStart: L.descentStartMeter,
            descentLength: L.descentLengthMeters,
            descentDrop: L.descentDrop / CAMP_M,
        },
        world: {
            length: L.length, deckWidth: L.deckWidth,
            eastX: L.eastX, westX: L.westX,
        },
        lanes: {
            perSide: L.lanesPerSide, total: L.lanes.length,
            centers: L.lanes.slice(), carriagewayWidth: L.carriagewayWidth,
            totalWidth: L.deckWidth,
        },
        shoulders: {
            count: shoulderRecords.length,
            width: L.shoulderWidth,
            entries: shoulderRecords.map(r => ({ ...r })),
            linesSolid: shoulderRecords.every(r => r.lineStyle === 'solid'),
            barriersOutside: propRecords.filter(p => p.kind === 'outer-barrier')
                .every(p => Math.abs(p.z) > L.roadEdge),
        },
        median: {
            walkable: stage7Walk(L.xAtMeter(50), 0, 0),
            collision: false, passages: conn.medianPassages,
            clearPassages: conn.clearMedianPassages,
        },
        ramps: {
            intervalMeters: L.rampIntervalMeters, count: rampRecords.length,
            expectedPerSide: S7_RAMPS.length / 2,
            left: rampRecords.filter(r => r.side < 0).length,
            right: rampRecords.filter(r => r.side > 0).length,
            laneCount: L.rampLaneCount,
            totalWidth: L.rampWidth,
            entries: rampRecords.map(r => ({ ...r })),
        },
        lamps: {
            intervalMeters: L.F.lampIntervalMeters,
            visual: lampSpecs.length, pointLights: stageLights.length,
            dualBranch: lampSpecs.every(l => l.branches === 2 && l.heads === 2),
            centerMounted: lampSpecs.every(l => l.z === 0),
        },
        elevation: {
            deckHeight: L.deckHeight, supports: supportRecords.length,
            lowerRoads: lowerRoadRecords.length,
            lowerCrossRoads: lowerRoadRecords.filter(r => !r.parallelFeeder).length,
            parallelFeeders: lowerRoadRecords.filter(r => r.parallelFeeder).length,
            lowerLevelJoins: lowerRoadRecords.filter(r => r.joinsLowerLevel).length,
            everyLowerRoadAtOrBelowDeck: lowerRoadRecords.every(r => r.y <= 0
                && (r.belowDeck || r.joinsLowerLevel || r.parallelFeeder)),
            descent: {
                startMeter: L.descentStartMeter,
                endMeter: L.descentEndMeter,
                lengthMeters: L.descentLengthMeters,
                drop: L.descentDrop,
                startY: L.roadYAtMeter(L.descentStartMeter),
                midY: L.roadYAtMeter((L.descentStartMeter + L.descentEndMeter) / 2),
                endY: L.roadYAtMeter(L.descentEndMeter),
                pitch: L.descentPitch,
                lowerApproachMeters: L.lengthMeters - L.descentEndMeter,
                continuous: Math.abs(L.roadYAtMeter(L.descentStartMeter)) < 1e-9
                    && Math.abs(L.roadYAtMeter(L.descentEndMeter)
                        + L.descentDrop) < 1e-9,
            },
        },
        maze: {
            bands: L.bandMeters.length, cars: carRecords.length,
            directBlocked: conn.directBlocked,
            connected: conn.connected, detourRatio: conn.path.detourRatio,
            crossesMedian: conn.path.crossesMedian,
            roadSkinSegments: roadSkinSegmentCount,
            carsDoNotOverlap: carRecords.every((c, i) => carRecords.slice(i + 1)
                .every(other => !vehicleRectsOverlap(c, other))),
        },
        landmark: {
            meter: L.F.landmarkMeter, x: S7_LANDMARK.x, z: S7_LANDMARK.z,
            height: Math.max(10, L.F.landmarkHeightMeters) * CAMP_M,
            cables: landmarkCableCount, inMedian: S7_LANDMARK.z === 0,
            cableFront: landmarkCableFrontCount, cableBack: landmarkCableBackCount,
            cableThickness: landmarkCableThickness,
            cableAnchorMaxZ: landmarkCableAnchorMaxZ,
            cableAnchorsInMedian: landmarkCableAnchorMaxZ <= L.medianWidth / 2,
            pieces: landmarkPieceCount, tapered: true, splitCrown: true,
            bypass: conn.landmarkBypass,
        },
        mortar: {
            startMeter: mortarCfg().startMeter,
            endMeter: mortarCfg().endMeter,
            intervalSec: mortarCfg().intervalSec,
            lockSec: mortarCfg().lockSec,
            radius: mortarBlastRadius(), pool: mortarPool.length,
            playerDamage: mortarCfg().playerDamage,
            robotDamage: mortarCfg().robotDamage,
        },
        vehicle: {
            x: vehicleObject.x, y: vehicleObject.y, z: vehicleObject.z,
            roadSide: 'left',
            carriageway: 'south', centered: vehicleObject.z === 0,
            onLeftSide: vehicleObject.z === L.leftRoadZ && vehicleObject.z > 0,
        },
        beyond: {
            meters: L.beyondMeters, endX: L.beyondX,
            roadY: L.roadYAtMeter(L.lengthMeters + L.beyondMeters),
            props: propRecords.filter(p => String(p.kind).startsWith('beyond-')).length,
            lamps: propRecords.filter(p => p.kind === 'beyond-lamp').length,
            // Dunianya diteruskan, TAPI kuncinya tidak: satu-satunya hal yang
            // memutuskan sejauh mana player boleh melangkah tetap `stage7Walk`.
            playerLocked: !stage7Walk(L.westX - 1, 0, 0)
                && !stage7Walk(L.beyondX + 1, 0, 0)
                && stage7Walk(L.westX + CFG.player.radius + 0.5, 0,
                    CFG.player.radius),
            solidProps: propRecords.filter(p => String(p.kind).startsWith('beyond-')
                && p.solid).length,
        },
        toll: {
            name: 'Pasteur Toll Gate', meter: L.lengthMeters,
            y: S7_WEST_END.y, belowUpperDeck: S7_WEST_END.y < 0,
            atLowerLevel: Math.abs(S7_WEST_END.y - L.lowerY) < 1e-9,
            atWestEnd: Math.abs(S7_WEST_END.x - (L.eastX - L.length)) < 1e-9,
        },
    };
};

// PUSAT KOTA BANDUNG (2026-08-10). `raw`/`welded` = biaya sebelum/sesudah
// pengelasan per potongan — angka `welded` inilah penjaganya, sama seperti
// lanskap perjalanan Stage 5.
export const stage7CityDebug = () => {
    if (!cityStats) return null;
    const { root, districts, ...rest } = cityStats;
    return {
        ...rest, sceneRoot: root?.name || null,
        districts: districts.map(d => ({ ...d })),
        night: {
            preset: 'midnight', ...LIGHT_PRESETS.midnight, ...NIGHT_ENV,
        },
    };
};

function blockerIndexDebug() {
    const sizes = [...blockerBins.values()].map(bin => bin.length);
    return {
        binMeters: BLOCKER_BIN_METERS,
        bins: sizes.length,
        references: sizes.reduce((n, size) => n + size, 0),
        maxPerBin: sizes.length ? Math.max(...sizes) : 0,
    };
}

export const stage7WorldDebug = () => ({
    built, sceneRoot: worldRoot?.name || null,
    city: stage7CityDebug(),
    props: propRecords.map(p => ({ ...p })),
    propKinds: [...new Set(propRecords.map(p => p.kind))],
    blockers: blockers.length, nav: !!navGrid, navBounds: navBounds ? { ...navBounds } : null,
    staticBatches: staticBatch.length, lights: stageLights.length,
    optimization: {
        vehicleChunks: { ...vehicleChunkStats },
        blockerBins: blockerIndexDebug(),
    },
    pools: {
        rain: rainPool.length, ripples: ripplePool.length,
        sparks: sparkPool.length, exhaust: exhaustPool.length,
        mortarShells: mortarPool.length,
        mortarMarkers: mortarPool.length * 2,
    },
    shoulders: shoulderRecords.map(p => ({ ...p })),
    ramps: rampRecords.map(p => ({ ...p })),
    supports: supportRecords.map(p => ({ ...p })),
    lowerRoads: lowerRoadRecords.map(p => ({ ...p })),
    supplies: supplyPlacements.map(p => ({ ...p })),
    crates: cratePlacements.map(p => ({ ...p })),
    barrels: barrelPlacements.map(p => ({ ...p })),
    encounterPoints: Object.fromEntries(Object.entries(encounterPlacements)
        .map(([k, v]) => [k, v.map(p => ({ ...p }))])),
    spawnMachines: spawnMachines.map(m => ({
        id: m.id, x: m.x, y: m.y, z: m.z, hatch: machineHatch(m),
        landings: [0, 1, 2, 3].map(i => machineLanding(m, i)),
        hp: m.hp, alive: m.alive, active: m.active, ...spawnMachineDebug(m.rig),
    })),
});

export const stage7MortarDebug = () => ({
    armed: mortarArmed, timer: mortarTimer, shots: mortarShots,
    impacts: mortarImpacts, pool: mortarPool.length,
    startMeter: mortarCfg().startMeter, endMeter: mortarCfg().endMeter,
    inFireZone: mortarInFireZone(),
    active: mortarPool.filter(m => m.active).length,
    projectiles: mortarPool.filter(m => m.active).map(m => ({
        serial: m.serial, x: m.shell.position.x, y: m.shell.position.y,
        z: m.shell.position.z, tLeft: m.tLeft, locked: m.locked,
        targetX: m.targetX, targetY: m.targetY, targetZ: m.targetZ,
        landY: m.landY,
        incoming: !!m.snd, markerVisible: m.marker.visible,
        lockVisible: m.lock.visible,
    })),
    lastImpact: mortarLastImpact ? { ...mortarLastImpact } : null,
});

export const stage7Debug = () => ({
    phase, objective: stage7Scene.hudStatus(), stageElapsed,
    progressMeters: progressMeters(), landmarkSeen, tollSighted,
    machinesAlive: machinesAlive(), factoryRobots: factoryRobotCount(),
    machines: spawnMachines.map(m => ({
        id: m.id, hp: m.hp, alive: m.alive, active: m.active,
        batches: m.batches, spawned: m.spawned, pending: m.pending,
        clock: m.clock, nextBatch: m.nextBatch,
    })),
    robots: countStageRobots(7), vehicleReady: phase === 'vehicleReveal',
    barrierBroken, outro: cine?.kind === 'outro' ? { stage: cine.stage, t: cine.t } : null,
    complete, mortar: stage7MortarDebug(),
    encounters: Object.fromEntries(Object.keys(CFG.campaign.stage7.encounters)
        .map(k => [k, countEncounter(k)])),
});

export const stage7VehicleDebug = () => vehicleDebug(tacticalVehicle);

function gameplayCameraOffset() {
    const L = ensureLayout();
    const d = Math.abs(progressMeters() - L.F.landmarkMeter);
    let k = Math.max(0, Math.min(1, 1 - d / 110));
    k = k * k * (3 - 2 * k);
    gameplayCam.x = PLAY_CAM.x + (LANDMARK_CAM.x - PLAY_CAM.x) * k;
    gameplayCam.y = PLAY_CAM.y + (LANDMARK_CAM.y - PLAY_CAM.y) * k;
    gameplayCam.z = PLAY_CAM.z + (LANDMARK_CAM.z - PLAY_CAM.z) * k;
    return gameplayCam;
}

export function stage7RobotInView(robotOrX, zArg = 0, yArg = 0) {
    let x = robotOrX, z = zArg, y = yArg;
    if (robotOrX && typeof robotOrX === 'object') {
        const p = robotOrX.mesh?.position || robotOrX.position || robotOrX;
        x = p.x; z = p.z;
        y = p.y + (robotOrX.scl || 1) * 6.5;
    }
    const off = gameplayCameraOffset();
    let focus = camFocusPos();
    if (Math.hypot(focus.x - camera.position.x, focus.z - camera.position.z) > 400)
        focus = camera.position;
    const ex = focus.x + off.x, ey = focus.y + off.y, ez = focus.z + off.z;
    let fx = -off.x, fy = -off.y - CAM_LOOK_DROP, fz = -off.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const rh = Math.hypot(fx, fz) || 1;
    const rx = -fz / rh, rz = fx / rh;
    const ux = -fy * rz, uy = fx * rz - fz * rx, uz = fy * rx;
    const dx = x - ex, dy = y - ey, dz = z - ez;
    const depth = dx * fx + dy * fy + dz * fz;
    if (depth <= 1) return false;
    const tanY = Math.tan(((viewCam?.fov || 50) * Math.PI / 180) / 2);
    const tanX = tanY * (viewCam?.aspect || 1);
    const screenX = (dx * rx + dz * rz) / (depth * tanX);
    const screenY = (dx * ux + dy * uy + dz * uz) / (depth * tanY);
    return Math.abs(screenX) <= 1 && Math.abs(screenY) <= 1;
}

function syncRobotToRoad(z) {
    const roadY = roadHeightAtX(z.mesh.position.x);
    z.baseY = roadY; z.groundY = roadY;
    if (!z.machineBirth) z.mesh.position.y = roadY;
}

export const stage7Scene = {
    id: 'campaign-7', lightsKey: 'campaign-7',
    enter() {
        saveCampaignStage(7); ensureWorld();
        for (let i = robots.length - 1; i >= 0; i--) {
            disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
        resetCrates(); resetBarrels(); resetStage();
        for (const [name, counts] of Object.entries(CFG.campaign.stage7.encounters))
            spawnEncounter(name, counts, false);
        placeCommonItems();
        applyLightPreset(scene, 'midnight');
        enterCityEnv({ ...NIGHT_ENV,
            fogNear: LIGHT_PRESETS.midnight.fogNear,
            fogFar: LIGHT_PRESETS.midnight.fogFar });
        camera.position.set(S7_START.x, S7_START.y + CFG.player.eyeHeight, S7_START.z);
        camera.quaternion.set(0, 0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true; startOpening(); updateUI();
    },
    exit() {
        resetDialogue(); if (cine) cleanupCine(0); stopVehicleLoop(); clearMortars();
        setAvatarRadioPose(false); if (avatarGroup) avatarGroup.visible = true;
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,

    updateMode(dt) {
        const L = ensureLayout();
        stageElapsed += dt; updateDialogue(dt); updateCine(dt);
        updateFx(dt); updateMortars(dt); updateSpawnFactories(dt);
        if (!cine && tacticalVehicle)
            updateTacticalVehicleVisual(tacticalVehicle, dt,
                { doorOpen: 0, engineOn: false, speed: 0 });
        for (const m of Object.values(markers)) if (m.visible) {
            const s = 1 + Math.sin(stageElapsed * 3.4) * 0.08; m.scale.setScalar(s);
        }
        if (cine || complete) { updateUI(); return; }

        const progress = progressMeters();
        if (phase === 'flyover') {
            if (!landmarkSeen
                && Math.abs(progress - L.F.landmarkMeter)
                    <= CFG.campaign.stage7.landmarkBeatRangeMeters) {
                landmarkSeen = true;
                queueDialogue('landmarkCommand'); queueDialogue('landmarkGibran');
                setMarkers([]);
                showStageMsg('PASUPATI CABLE TOWER - METER 700', 3600);
            }
            if (progress >= L.lengthMeters - L.F.tollSightBeforeMeters) {
                phase = 'tollApproach'; tollSighted = true; queueDialogue('tollSight');
                setMarkers(['toll']); showStageMsg('PASTEUR TOLL GATE LOCATED', 3600);
            }
        }
        if (phase === 'tollApproach'
            && progress >= L.lengthMeters - L.F.tollTriggerBeforeMeters)
            startFactorySiege();
        else if (phase === 'vehicleReveal'
            && Math.hypot(camera.position.x - S7_VEHICLE.x,
                camera.position.z - S7_VEHICLE.z) < CFG.campaign.stage7.vehicleRange)
            startOutro();
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage7Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage7Walk, pos, oldX, oldZ, player.radius);
        if (player.onGround) {
            pos.y = roadHeightAtX(pos.x) + CFG.player.eyeHeight;
            player.vy = 0;
        }
    },
    groundHeight(x) { return roadHeightAtX(x); },
    get camOffset() { return cine ? cineCam : gameplayCameraOffset(); },
    bulletBlocked(b) {
        return machineBulletHit(b)
            || stage7SegHitsWall(b.px, b.pz, b.mesh.position.x,
                b.mesh.position.z, b.mesh.position.y);
    },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        return !mortarBlastOrigin(x0, z0)
            && stage7SegHitsWall(x0, z0, x1, z1, y);
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
        syncRobotToRoad(z);
        if (phase === 'opening') {
            z.state = 'idle'; z.moving = false; z.aiming = false; return {};
        }
        const result = campaignRobotAI(z, dt, step, {
            walkable: stage7Walk, resolve, nav: navGrid,
            activate: stage7RobotInView,
            los: (x0, z0, x1, z1) => !stage7SegHitsWall(x0, z0, x1, z1, 8),
        });
        syncRobotToRoad(z); return result;
    },
    clampRobot(z, oldX, oldZ) {
        campaignClampRobot(z, oldX, oldZ, { walkable: stage7Walk, resolve });
        syncRobotToRoad(z);
    },
    clampDropPos(x, z) {
        if (stage7Walk(x, z, 2) && !blockedAt(x, z, 2))
            return [x, z, roadHeightAtX(x)];
        const p = clearPointAt(progressMeters(x), 3, 2);
        return [p.x, p.z, p.y];
    },
    hudStatus() {
        const L = ensureLayout(), remaining = Math.max(0,
            Math.ceil(L.lengthMeters - progressMeters()));
        if (phase === 'opening') return 'STAGE 7 - PASUPATI NIGHT RUN';
        if (phase === 'flyover')
            return `CROSS THE FLYOVER TO PASTEUR - ${remaining} M`;
        if (phase === 'tollApproach') return 'REACH THE PASTEUR TOLL GATE';
        if (phase === 'factorySiege')
            return `DESTROY ROBOT FACTORIES - ${machinesAlive()}/3 | Robots: ${factoryRobotCount()}`;
        if (phase === 'vehicleReveal') return 'INSPECT THE GRD LTV-45';
        if (phase === 'outro') return 'TOLL ROUTE CONFIRMED - KERTAJATI';
        return 'NEXT DESTINATION - KERTAJATI';
    },
    radarLandmarks(plot) {
        const mark = (p, color = '#ffb03b') =>
            plot(p.x - camera.position.x, p.z - camera.position.z, color, 5, true);
        if (phase === 'flyover' && !landmarkSeen) mark(S7_LANDMARK);
        else if (phase === 'tollApproach') mark(S7_TOLL);
        else if (phase === 'factorySiege')
            for (const m of spawnMachines) if (m.alive) mark(m, '#ff7b3b');
        else if (phase === 'vehicleReveal') mark(S7_VEHICLE);
    },
};
