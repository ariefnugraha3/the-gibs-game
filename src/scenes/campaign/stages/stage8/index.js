// Campaign Stage 8 — CISUMDAWU KILL ZONE.
// GRD LTV-45 berjalan otonom; player hanya snap kiri/kanan sambil menembak.
// Jalan/scenery bergerak dalam fixed pool, gameplay entity tetap stabil.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import {
    scene, camera, setCineFocus, addCamShake, CAM_OFF_DEFAULT,
    groundViewExtents,
} from '../../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import {
    avatarGroup, setAvatarVehiclePose, setAvatarRadioPose,
    avatarVehicleDebug,
} from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnCampaignRobot, countStageRobots } from '../../utility/common.js';
import { beginStageTransition, campaignJumpToStage } from '../../utility/transition.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { stage1Scene } from '../stage1/index.js';
import { stage9Scene } from '../stage9/index.js';
import { applyLightPreset, registerStageLight } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { rand, clamp, smooth01 } from '../../../../utils/math.js';
import { spawnAmmoDrop, spawnLoot } from '../../../../entities/drops.js';
import { currentWeapon } from '../../../../entities/weapons.js';
import {
    buildTacticalVehicleMesh, resetTacticalVehicleVisual,
    updateTacticalVehicleVisual, tacticalVehicleDebug,
} from '../../../../entities/tacticalVehicle.js';
import {
    buildEnemyPickupMesh, resetEnemyPickupVisual, updateEnemyPickupVisual,
    enemyPickupPassengerWorld, enemyPickupDebug,
} from '../../../../entities/enemyPickup.js';
import {
    createCombatGunship, resetCombatGunship, updateCombatGunship, damageCombatGunship,
    combatGunshipDebug,
} from '../../../../entities/combatGunship.js';
import { explodeAt, spawnGroundPuff } from '../../../../entities/effects.js';
import { spawnGibs } from '../../../../entities/gore.js';
import {
    playLoopSFX, stopLoopSFX, playSFX, sfxTankMove, sfxHeli,
    sfxTankExplode, startBossMusic, stopMusic,
} from '../../../../utils/sfx.js';

const OX = 270000, OZ = 0, PLAYER_X = OX;
const ROAD_MODULES = 20, MODULE_LEN = 84, ROAD_SPAN = ROAD_MODULES * MODULE_LEN;
const AIRPORT_X = OX + 1320;
const ASPHALT_LANES = Object.freeze([0, 1, 2, 4, 5, 6]);
const LANE_MULTIPLIERS = Object.freeze([-3, -2, -1, 0, 1, 2, 3]);
// Public default coordinates; live gameplay tetap membaca laneWidth dari CFG
// di laneWorldZ() agar retune tidak memerlukan perubahan logika scene.
export const S8_LANES = Object.freeze([-52.5, -35, -17.5, 0, 17.5, 35, 52.5]);
// Indonesia berkendara di sisi kiri; arah perjalanan +X berarti carriageway
// kiri berada di sisi -Z. Mulai di lajur tengah carriageway tersebut.
export const S8_START = Object.freeze({ x: PLAYER_X, z: S8_LANES[1] });
export const S8_AIRPORT = Object.freeze({ x: AIRPORT_X, z: 0 });

export const STAGE8_DIALOGUE = dialogueMap('campaign.stage8.lines');

let built = false, worldRoot = null, roadRoot = null, airportRoot = null;
let tacticalVehicle = null, gunship = null, staticBatch = [];
const roadModules = [], pickupPool = [], dustPool = [], stageLights = [];
let roadWraps = 0, dustCursor = 0;

let phase = 'opening', complete = false, stageElapsed = 0;
let groundSpawnT = 0, bossApproachT = 0;
let pickupsSpawned = 0, pickupsDestroyed = 0, firstPickupShown = false;
let laneIndex = 1, laneFrom = 1, laneTo = 1, laneT = 1, laneBuffer = 0;
let aHeld = false, dHeld = false, currentZ = S8_START.z;
let deathDelayT = 0, cine = null, vehicleLoop = null, rotorLoop = null;
const cineCam = new THREE.Vector3().copy(CAM_OFF_DEFAULT);
// Gameplay Stage 8 membutuhkan pandangan lebar untuk membaca carrier dari
// belakang sekaligus telegraph boss di lajur depan. Semua komponen offset awal
// dikalikan faktor yang sama agar kamera mundur tepat 20% tanpa mengubah sudut.
const DRIVE_CAM_PULLBACK = 1.20;
const driveCam = new THREE.Vector3(
    -112 * DRIVE_CAM_PULLBACK,
    106 * DRIVE_CAM_PULLBACK,
    102 * DRIVE_CAM_PULLBACK,
);
const mountPos = new THREE.Vector3();

let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function box(parent, mat, sx, sy, sz, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function buildRoadModule(index, M) {
    const g = new THREE.Group();
    g.position.set(OX + (index - (ROAD_MODULES - 1) / 2) * MODULE_LEN, 0, OZ);
    const laneW = CFG.campaign.stage8.laneWidth;
    const carriageW = laneW * 3, carriageZ = laneW * 2;
    const shoulderZ = laneW * 3.5 + 6, railZ = laneW * 3.5 + 13;
    // Dua carriageway dan median yang benar-benar dapat dilintasi player.
    box(g, M.asphalt, MODULE_LEN + 1, 0.7, carriageW, 0, -0.22, -carriageZ);
    box(g, M.asphalt, MODULE_LEN + 1, 0.7, carriageW, 0, -0.22, carriageZ);
    box(g, M.grass, MODULE_LEN + 1, 0.82, laneW, 0, -0.14, 0);
    box(g, M.shoulder, MODULE_LEN + 1, 0.48, 12, 0, -0.36, -shoulderZ);
    box(g, M.shoulder, MODULE_LEN + 1, 0.48, 12, 0, -0.36, shoulderZ);
    // Garis lajur putus-putus dan tepi median.
    for (const z of [-laneW * 2.5, -laneW * 1.5, laneW * 1.5, laneW * 2.5])
        for (let x = -34; x <= 34; x += 22)
        box(g, M.white, 11, 0.08, 0.7, x, 0.17, z);
    for (const z of [-laneW * 0.5, laneW * 0.5])
        box(g, M.amber, MODULE_LEN, 0.09, 0.55, 0, 0.18, z);
    // Guardrail, reflector, tiang dan scenery berganti secara modular.
    for (const z of [-railZ, railZ]) {
        box(g, M.steel, MODULE_LEN, 0.45, 0.55, 0, 3.7, z);
        for (let x = -36; x <= 36; x += 18) box(g, M.steel, 0.55, 7.4, 0.55, x, 0, z);
    }
    if (index % 3 === 0) {
        for (const side of [-1, 1]) {
            const tree = new THREE.Group(); tree.position.set(rand(-28, 28), 0, side * 96); g.add(tree);
            box(tree, M.wood, 3, 18, 3, 0, 9, 0);
            const crown = new THREE.Mesh(new THREE.SphereGeometry(11 + (index % 2) * 3, 8, 6), M.leaf);
            crown.position.y = 23; crown.castShadow = true; tree.add(crown);
        }
    } else if (index % 3 === 1) {
        for (const side of [-1, 1]) {
            const shed = new THREE.Group(); shed.position.set(rand(-22, 22), 0, side * 112); g.add(shed);
            box(shed, M.concrete, 35, 18, 25, 0, 9, 0);
            box(shed, M.hazard, 37, 2, 27, 0, 19, 0);
        }
    } else {
        for (const side of [-1, 1]) {
            const hill = new THREE.Mesh(new THREE.ConeGeometry(46, 72, 6), side < 0 ? M.hill : M.hillDark);
            hill.position.set(rand(-30, 30), 25, side * 156); hill.rotation.y = index * 0.4; g.add(hill);
        }
    }
    if (index === 2 || index === 7) {
        const gantry = new THREE.Group(); gantry.position.set(0, 0, 0); g.add(gantry);
        const gantryZ = railZ + 3;
        for (const z of [-gantryZ, gantryZ]) box(gantry, M.steel, 2, 32, 2, 0, 16, z);
        box(gantry, M.steel, 2, 2, gantryZ * 2 + 2, 0, 31, 0);
    }
    // Landmark perjalanan ikut pool modul yang sama: tidak ada mesh baru saat
    // runtime. Bentuknya sengaja cutaway agar arena tetap terbaca top-down.
    if (index === 4) {
        // Mulut terowongan pegunungan: portal berat + deret rib terbuka, tanpa
        // atap opak yang dapat menutupi player dan riders dari kamera.
        for (const x of [-36, -18, 0, 18, 36]) {
            for (const z of [-72, 72]) box(g, M.concrete, 3.5, 31, 6, x, 15.5, z);
            box(g, M.concrete, 3.5, 4, 148, x, 31, 0);
        }
        for (const z of [-82, 82]) box(g, M.hillDark, MODULE_LEN, 18, 20, 0, 9, z);
        box(g, M.hazard, 5, 3, 128, -39, 27, 0);
    } else if (index === 6) {
        // Jembatan: pylon di luar carriageway dan rangka samping membuat
        // pergantian elevasi terbaca tanpa mengubah permukaan fisika.
        for (const x of [-25, 25]) for (const z of [-78, 78]) {
            box(g, M.steel, 5, 42, 5, x, 21, z);
            box(g, M.hazard, 10, 2, 10, x, 41, z);
        }
        for (const z of [-76, 76]) {
            box(g, M.steel, MODULE_LEN, 2, 2, 0, 12, z);
            for (let x = -36; x <= 36; x += 12)
                box(g, M.steel, 1, 18, 1, x, 9, z);
        }
    } else if (index === 8 || index === 11) {
        // Sawah Sumedang dengan pematang dan kanal irigasi; seluruh petak ikut
        // wrap bersama modul, bukan Kertajati yang berada di root statis lain.
        for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
            const z = side * (92 + row * 18);
            box(g, M.rice, MODULE_LEN - 8, 0.7, 13, 0, -0.15, z);
            box(g, M.water, MODULE_LEN - 5, 0.16, 2.2, 0, 0.25, z + side * 7.2);
        }
    }
    roadRoot.add(g); roadModules.push(g);
}

function buildAirport(M) {
    airportRoot = new THREE.Group(); worldRoot.add(airportRoot);
    const props = [];
    const add = (sx, sy, sz, x, y, z, mat) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        props.push(m); return m;
    };
    add(900, 1.2, 430, AIRPORT_X, -0.7, 0, M.concrete);
    add(650, 0.5, 105, AIRPORT_X, 0, 0, M.asphalt);
    for (let x = AIRPORT_X - 280; x <= AIRPORT_X + 280; x += 36)
        add(18, 0.08, 1, x, 0.35, 0, M.white);
    add(260, 52, 100, AIRPORT_X + 250, 26, -125, M.panel);
    add(270, 8, 112, AIRPORT_X + 250, 56, -125, M.hazard);
    add(170, 36, 76, AIRPORT_X + 85, 18, 145, M.gunmetal);
    for (const z of [-195, 195]) for (let x = AIRPORT_X - 330; x <= AIRPORT_X + 330; x += 82) {
        add(2, 28, 2, x, 14, z, M.steel); add(13, 1, 3, x, 28, z, M.amber);
    }
    staticBatch = addMergedStatic(airportRoot, props);
    // Pesawat siluet jauh untuk mengikat identitas bandara tanpa aset eksternal.
    const plane = new THREE.Group(); plane.position.set(AIRPORT_X + 170, 3, 85); airportRoot.add(plane);
    box(plane, M.white, 54, 4, 7, 0, 4, 0);
    box(plane, M.white, 13, 2, 58, -4, 4, 0);
    box(plane, M.hazard, 12, 8, 2, -24, 8, 0);
    airportRoot.visible = false;
}

function buildFx(M) {
    for (let i = 0; i < 24; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 2.2), M.dust);
        m.visible = false; m.userData.life = 0; worldRoot.add(m); dustPool.push(m);
    }
}

function buildWorld() {
    worldRoot = new THREE.Group(); scene.add(worldRoot);
    roadRoot = new THREE.Group(); worldRoot.add(roadRoot);
    const M = {
        asphalt: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        shoulder: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        grass: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        white: new THREE.MeshLambertMaterial({ color: PAL.white }),
        amber: new THREE.MeshLambertMaterial({ color: PAL.amberDim, emissive: PAL.amber,
            emissiveIntensity: EMISSIVE_MAX * 0.35 }),
        hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        gunmetal: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        leaf: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        hill: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        hillDark: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        rice: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        water: new THREE.MeshLambertMaterial({ color: PAL.techDim, transparent: true,
            opacity: 0.64, depthWrite: false }),
        dust: new THREE.MeshBasicMaterial({ color: PAL.concrete, transparent: true,
            opacity: 0.58, depthWrite: false }),
    };
    for (let i = 0; i < ROAD_MODULES; i++) buildRoadModule(i, M);
    buildAirport(M); buildFx(M);

    tacticalVehicle = buildTacticalVehicleMesh(7, PAL.gunmetal);
    worldRoot.add(tacticalVehicle.group);
    for (let i = 0; i < Math.max(3, CFG.campaign.stage8.maxActivePickups); i++) {
        const p = buildEnemyPickupMesh(7); worldRoot.add(p.group); pickupPool.push(p);
    }
    gunship = createCombatGunship(4.8);

    // Konfigurasi lampu tetap: delapan lampu arena + empat apron, tidak pernah
    // dibuat/dihapus saat boss atau arrival muncul.
    for (let i = 0; i < 8; i++) {
        const L = new THREE.PointLight(i % 2 ? PAL.amber : PAL.tech, 0.42, 190);
        L.position.set(OX + (i - 3.5) * 70, 30, i % 2 ? 90 : -90);
        scene.add(L); registerStageLight('campaign-8', L); stageLights.push(L);
    }
    for (let i = 0; i < 4; i++) {
        const L = new THREE.PointLight(PAL.amber, 0.38, 180);
        L.position.set(AIRPORT_X - 180 + i * 120, 28, i % 2 ? 155 : -155);
        scene.add(L); registerStageLight('campaign-8', L); stageLights.push(L);
    }
}

export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = clamp(dialogueChars | 0, 0, dialogueCurrent.text.length);
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}
function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null; dialogueT = 0; dialogueChars = 0;
    renderDialogue();
}
function queueDialogue(key, repeat = false) {
    const line = STAGE8_DIALOGUE[key];
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

function roadSpeed() { return CFG.campaign.stage8.roadSpeed; }
function laneWorldZ(index) {
    const i = clamp(index | 0, 0, LANE_MULTIPLIERS.length - 1);
    return OZ + LANE_MULTIPLIERS[i] * CFG.campaign.stage8.laneWidth;
}

function spawnDust(x, z, burst = false) {
    if (!dustPool.length) return;
    const n = burst ? 4 : 1;
    for (let i = 0; i < n; i++) {
        const d = dustPool[dustCursor++ % dustPool.length];
        d.visible = true; d.userData.life = burst ? 0.8 : 0.42;
        d.position.set(x + rand(-7, 7), 1.1, z + rand(-5, 5));
        d.scale.setScalar(burst ? rand(1.2, 2) : 0.8);
    }
}
function updateDust(dt) {
    for (const d of dustPool) if (d.visible) {
        d.userData.life -= dt; d.position.x -= roadSpeed() * dt * 0.45;
        d.position.y += dt * 3.5; d.scale.multiplyScalar(1 + dt * 1.4);
        if (d.userData.life <= 0) d.visible = false;
    }
}
function updateRoad(dt) {
    if (!roadRoot.visible) return;
    const dx = roadSpeed() * dt;
    for (const g of roadModules) {
        g.position.x -= dx;
        while (g.position.x < OX - ROAD_SPAN / 2) { g.position.x += ROAD_SPAN; roadWraps++; }
    }
}

function syncVehicle(dt = 0) {
    if (!tacticalVehicle) return;
    // Gunner anchor lokal x=-0,62 m; scaleX sudah memuat normalisasi panjang,
    // jadi body tetap tepat di bawah pivot setelah dimensi GRD berubah.
    tacticalVehicle.group.position.set(PLAYER_X + 0.62 * tacticalVehicle.scaleX, 0, currentZ);
    tacticalVehicle.group.rotation.y = 0;
    updateTacticalVehicleVisual(tacticalVehicle, dt, {
        doorOpen: 0, hatchOpen: phase === 'arrival' || phase === 'complete' ? 0 : 1,
        engineOn: !complete, speed: roadSpeed(),
    });
}

function requestLane(dir) {
    if (!dir) return false;
    if (laneT < 1) { laneBuffer = dir; return false; }
    const next = clamp(laneIndex + dir, 0, S8_LANES.length - 1);
    if (next === laneIndex) return false;
    laneFrom = laneIndex; laneTo = next; laneT = 0;
    if (laneFrom === 3 || laneTo === 3) { spawnDust(PLAYER_X - 8, currentZ, true); addCamShake(0.8); }
    return true;
}
function updateLaneControl(dt) {
    const pressA = !!keys.a && !aHeld, pressD = !!keys.d && !dHeld;
    aHeld = !!keys.a; dHeld = !!keys.d;
    if (pressA !== pressD) requestLane(pressA ? -1 : 1);
    if (laneT < 1) {
        const C = CFG.campaign.stage8;
        const dur = (laneFrom === 3 || laneTo === 3) ? C.medianChangeSec : C.laneChangeSec;
        laneT = Math.min(1, laneT + dt / Math.max(0.05, dur));
        const k = smooth01(laneT);
        currentZ = laneWorldZ(laneFrom) + (laneWorldZ(laneTo) - laneWorldZ(laneFrom)) * k;
        if ((laneFrom === 3 || laneTo === 3) && Math.random() < dt * 18)
            spawnDust(PLAYER_X - 10, currentZ, false);
        if (laneT >= 1) {
            laneIndex = laneTo; currentZ = laneWorldZ(laneIndex);
            if (laneBuffer) { const q = laneBuffer; laneBuffer = 0; requestLane(q); }
        }
    } else currentZ = laneWorldZ(laneIndex);
    camera.position.set(PLAYER_X, CFG.player.eyeHeight, currentZ);
    player.vy = 0; player.onGround = true; syncVehicle(dt);
}

function freePickup() { return pickupPool.find(p => !p.active); }
function activePursuerCount() {
    let n = 0; for (const z of robots) if (z.stage === 8 && z.mounted) n++; return n;
}
function activePickupCount() { return pickupPool.filter(p => p.active && !p.wreck).length; }

function spawnPickup(classes, eventIndex) {
    const p = freePickup(); if (!p) return false;
    const C = CFG.campaign.stage8;
    resetEnemyPickupVisual(p); p.active = true; p.group.visible = true;
    p.eventIndex = eventIndex;
    // Entry bergantian dari belakang/depan agar carrier selalu lahir di ujung
    // fixed road pool, jauh di luar tapak pandang. Semuanya tetap searah +X.
    const fromRear = pickupsSpawned % 2 === 0;
    p.entrySide = fromRear ? 'rear' : 'front';
    const dir = fromRear ? -1 : 1;
    // Semua carrier menghadap +X. Kendaraan dari ujung depan adalah target
    // yang lebih lambat dan sedang disusul, bukan kendaraan yang melawan arus.
    // Karena Indonesia memakai lajur kiri, keduanya masuk di carriageway -Z.
    const laneSet = [0, 1, 2];
    const sameSide = pickupPool.filter(q => q.active && !q.wreck
        && q.entrySide === p.entrySide).length - 1;
    p.lane = laneSet[(pickupsSpawned / 2 | 0) % laneSet.length];
    const view = groundViewExtents(camera.position.y, 0);
    const roadEdge = ROAD_SPAN / 2 - C.pickupEntryInset;
    p.entryViewEdgeX = PLAYER_X + (fromRear ? view.minX : view.maxX);
    const outsideView = fromRear
        ? view.minX - C.pickupOffscreenMargin
        : view.maxX + C.pickupOffscreenMargin;
    const entryOffset = fromRear
        ? Math.min(-roadEdge, outsideView)
        : Math.max(roadEdge, outsideView);
    p.entryX = PLAYER_X + entryOffset;
    p.targetX = PLAYER_X + dir * (C.pickupCombatOffset
        + Math.max(0, sameSide) * C.pickupCombatSpacing);
    p.group.position.set(p.entryX, 0, laneWorldZ(p.lane));
    p.group.rotation.y = 0;
    p.passengers = [];
    for (let i = 0; i < 3; i++) {
        spawnCampaignRobot(p.group.position.x, p.group.position.z, 8, classes[i], true);
        const z = robots[robots.length - 1];
        z.mounted = true; z.mountSlot = i; z.pickup = p; z.state = 'mounted';
        z.moving = false; z.aiming = true; z.encounter = `pickup-${pickupsSpawned + 1}`;
        p.passengers.push(z);
    }
    pickupsSpawned++;
    if (!firstPickupShown) {
        firstPickupShown = true; queueDialogue('pickupSystem'); queueDialogue('pickupGibran');
        showStageMsg('DESTROY ALL THREE RIDERS TO DISABLE EACH PURSUIT VEHICLE', 5200);
    }
    return true;
}

function destroyPickup(p) {
    if (p.wreck) return;
    p.wreck = true; p.wreckT = 0; pickupsDestroyed++;
    explodeAt(new THREE.Vector3(p.group.position.x, 7, p.group.position.z), 0.1, 0, sfxTankExplode);
    spawnGibs(p.group.position.x, 7, p.group.position.z, 8, -1, 0,
        1.5, PAL.gunmetal, 0.4);
    addCamShake(2.6);
    if (pickupsDestroyed % Math.max(1, CFG.campaign.stage8.ammoEveryDestroyedPickups) === 0) {
        const w = player.owned[currentWeapon] ? currentWeapon : 'pistol';
        spawnAmmoDrop(PLAYER_X, currentZ, w, 12);
    }
}

function updatePickups(dt) {
    const C = CFG.campaign.stage8;
    for (const p of pickupPool) if (p.active) {
        const living = p.passengers.filter(z => robots.includes(z));
        if (!p.wreck && living.length === 0) destroyPickup(p);
        if (p.wreck) {
            p.group.position.x -= roadSpeed() * dt * 1.35;
            updateEnemyPickupVisual(p, dt, { active: true, wreck: true, speed: C.pickupSpeed });
            if (p.wreckT >= C.pickupWreckSec || p.group.position.x < PLAYER_X - 250)
                resetEnemyPickupVisual(p);
            continue;
        }
        p.group.position.x += (p.targetX - p.group.position.x)
            * Math.min(1, dt * C.pickupApproachRate);
        // Sedikit lane weaving, tanpa memakai median.
        p.group.position.z += (laneWorldZ(p.lane) - p.group.position.z) * Math.min(1, dt * 2.2);
        updateEnemyPickupVisual(p, dt, { active: true, wreck: false, speed: C.pickupSpeed });
    }
}

function updateGroundSpawner(dt) {
    const C = CFG.campaign.stage8;
    if (pickupsSpawned >= C.groundPickupTarget) return;
    groundSpawnT -= dt;
    if (groundSpawnT > 0 || activePickupCount() >= C.maxActivePickups || !freePickup()) return;
    const loads = C.groundLoads || [];
    const classes = loads.length ? loads[pickupsSpawned % loads.length] : ['B', 'B', 'A'];
    if (spawnPickup(classes, pickupsSpawned)) groundSpawnT = C.groundSpawnGapSec;
}

function finishOpening(skipped = false) {
    if (skipped) resetDialogue();
    cleanupCine(CFG.campaign.stage8.fadeSec); phase = 'highway';
    showStageMsg('SURVIVE THE CISUMDAWU PURSUIT', 5000);
}
function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    // Scene dimasukkan ketika transisi shop masih pause. Jangan pasang overlay
    // hitam di enter(): updateMode belum berjalan untuk memudarkannya dan layar
    // akan tampak freeze sampai pointer-lock dilanjutkan oleh player.
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'opening', t: 0, fadeIn: true,
        dialogueStarted: false, fading: false, fadeT: 0 };
    cineCam.set(-135, 88, 92); setCineFocus(PLAYER_X + 12, currentZ, true);
    showCutsceneSkip(() => finishOpening(true));
}

function startGunshipIntro() {
    if (phase === 'gunshipIntro' || phase === 'gunshipBattle') return;
    phase = 'gunshipIntro'; releaseInputs(); clearMoveTarget();
    setCinematicActive(true); setCineBars(true); setCineFade(1, 0);
    resetCombatGunship(gunship, { active: true, x: PLAYER_X + 150, y: 55, z: 0, holdSec: 1 });
    startRotorLoop();
    cine = { kind: 'gunship', t: 0, fadeIn: false,
        dialogueStarted: false, fading: false, fadeT: 0 };
    cineCam.set(-90, 92, 118); setCineFocus(PLAYER_X + 100, 0, true);
    showCutsceneSkip(() => finishGunshipIntro(true));
}
function finishGunshipIntro(skipped = false) {
    if (skipped) resetDialogue();
    cleanupCine(CFG.campaign.stage8.fadeSec); phase = 'gunshipBattle';
    startBossMusic(); showStageMsg('DESTROY THE N.U.S.A. COMBAT GUNSHIP', 4500);
}

function startArrival() {
    if (phase === 'arrival' || complete) return;
    phase = 'arrival'; releaseInputs(); clearMoveTarget();
    setCinematicActive(true); setCineBars(true); setCineFade(1, CFG.campaign.stage8.fadeSec);
    cine = { kind: 'arrival', stage: 'fadeOut', t: 0, stageT: 0, swapped: false };
    cineCam.set(-120, 86, 88); showCutsceneSkip(finishStage);
}
function swapToAirport() {
    if (cine?.swapped) return;
    cine.swapped = true; roadRoot.visible = false; airportRoot.visible = true;
    currentZ = 0; laneIndex = laneFrom = laneTo = 3; laneT = 1;
    camera.position.set(AIRPORT_X - 210, CFG.player.eyeHeight, 0);
    tacticalVehicle.group.position.set(camera.position.x + 0.62 * tacticalVehicle.scaleX, 0, 0);
    setAvatarVehiclePose(true, tacticalVehicle.gunnerPoseHeight);
    setCineFocus(camera.position.x + 120, 0, true);
    setCineFade(0, CFG.campaign.stage8.fadeSec);
    queueDialogue('arrivalSystem'); queueDialogue('arrivalCommand'); queueDialogue('arrivalGibran');
}

function cleanupCine(revealSec = 0) {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, revealSec); setCinematicActive(false); setAvatarRadioPose(false);
}
function finishStage() {
    if (complete) return;
    complete = true; phase = 'complete'; resetDialogue();
    roadRoot.visible = false; airportRoot.visible = true;
    stopVehicleLoop(); stopRotorLoop(); stopMusic();
    resetCombatGunship(gunship, { active: false });
    cleanupCine(0); setAvatarVehiclePose(false);
    if (avatarGroup) avatarGroup.visible = true;
    camera.position.set(AIRPORT_X + 105, CFG.player.eyeHeight, 14);
    beginStageTransition(stage9Scene);
}

function updateCine(dt) {
    if (!cine) return;
    cine.t += dt; if (cine.stageT != null) cine.stageT += dt;
    const C = CFG.campaign.stage8;
    if (cine.kind !== 'arrival' && !cine.fadeIn) {
        cine.fadeIn = true; setCineFade(0, C.fadeSec);
    }
    if (cine.kind === 'opening') {
        updateRoad(dt * 0.55); syncVehicle(dt);
        const k = Math.min(1, cine.t / Math.max(1, C.openingMinSec));
        cineCam.x = -135 + k * 35; cineCam.y = 88 + k * 18; cineCam.z = 92 - k * 18;
        setCineFocus(PLAYER_X + 10 + k * 22, currentZ, true);
        if (!cine.dialogueStarted && cine.t >= C.openingDialogueDelaySec) {
            cine.dialogueStarted = true;
            queueDialogue('openingSystem'); queueDialogue('openingGibran'); queueDialogue('openingCommand');
        }
        if (!cine.fading && cine.t >= C.openingMinSec && !dialogueCurrent && !dialogueQueue.length) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishOpening(false);
    } else if (cine.kind === 'gunship') {
        updateRoad(dt); syncVehicle(dt);
        gunship.parts.group.position.x = PLAYER_X + 188 - Math.min(1, cine.t / 5) * 52;
        gunship.parts.group.position.y = 58 - Math.min(1, cine.t / 5) * 16;
        gunship.parts.rotor.rotation.y += dt * 28; gunship.parts.tailRotor.rotation.z += dt * 34;
        setCineFocus(gunship.parts.group.position.x, gunship.parts.group.position.z, true);
        if (!cine.dialogueStarted && cine.t >= 0.5) {
            cine.dialogueStarted = true; queueDialogue('gunshipCommand'); queueDialogue('gunshipGibran');
        }
        if (!cine.fading && cine.t >= C.gunshipIntroMinSec && !dialogueCurrent && !dialogueQueue.length) {
            cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
        }
        if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishGunshipIntro(false);
    } else if (cine.kind === 'arrival') {
        if (cine.stage === 'fadeOut') {
            updateRoad(dt); syncVehicle(dt);
            if (cine.stageT >= C.fadeSec) {
                cine.stage = 'airport'; cine.stageT = 0; swapToAirport();
            }
        } else {
            const k = Math.min(1, cine.stageT / Math.max(6, C.arrivalMinSec));
            camera.position.x = AIRPORT_X - 210 + k * 315; camera.position.z = 0;
            tacticalVehicle.group.position.set(camera.position.x + 0.62 * tacticalVehicle.scaleX, 0, 0);
            updateTacticalVehicleVisual(tacticalVehicle, dt, {
                doorOpen: 0, hatchOpen: 1 - Math.min(1, k * 2), engineOn: k < 0.94,
                speed: roadSpeed() * (1 - k),
            });
            if (k > 0.58 && avatarGroup) avatarGroup.visible = false;
            setCineFocus(camera.position.x + 75, 0, true);
            cineCam.x = -120 - k * 24; cineCam.y = 86 + k * 28; cineCam.z = 88 + k * 16;
            if (cine.stageT >= C.arrivalMinSec && !dialogueCurrent && !dialogueQueue.length)
                finishStage();
        }
    }
}

function updateJourney(dt) {
    if (phase === 'highway') phase = 'groundPursuit';
    if (!['groundPursuit', 'bossApproach'].includes(phase)) return;
    updateRoad(dt); updatePickups(dt);
    if (phase === 'groundPursuit') {
        updateGroundSpawner(dt);
        if (pickupsDestroyed >= CFG.campaign.stage8.groundPickupTarget) {
            phase = 'bossApproach'; bossApproachT = 0;
            showStageMsg('ALL PURSUIT VEHICLES DESTROYED — AIR CONTACT INBOUND', 4400);
        }
    } else {
        bossApproachT += dt;
        if (bossApproachT >= CFG.campaign.stage8.bossApproachDelaySec
            && activePursuerCount() === 0) startGunshipIntro();
    }
}

function updateBoss(dt) {
    if (phase !== 'gunshipBattle' && phase !== 'gunshipDeath') return;
    updateRoad(dt); updatePickups(dt);
    updateCombatGunship(gunship, dt, {
        playerLane: laneIndex, laneZ: laneWorldZ, roadX: PLAYER_X,
        bossX: PLAYER_X + 130, bossZ: 0, allowAttack: phase === 'gunshipBattle',
    });
    if (phase === 'gunshipBattle' && gunship.dead) {
        phase = 'gunshipDeath'; stopMusic(); stopRotorLoop(); deathDelayT = -1;
    }
    if (phase === 'gunshipDeath' && gunship.deathDone) {
        if (deathDelayT < 0) {
            deathDelayT = 0; queueDialogue('bossDown');
            showStageMsg('COMBAT GUNSHIP DESTROYED — KERTAJATI AHEAD', 4200);
        }
        deathDelayT += dt;
        if (deathDelayT >= CFG.campaign.stage8.gunshipDeathDelaySec
            && !dialogueCurrent && !dialogueQueue.length) startArrival();
    }
}

function resetStage() {
    phase = 'opening'; complete = false; stageElapsed = 0;
    groundSpawnT = CFG.campaign.stage8.groundStartDelaySec; bossApproachT = 0;
    pickupsSpawned = 0; pickupsDestroyed = 0;
    firstPickupShown = false; deathDelayT = 0;
    laneIndex = laneFrom = laneTo = 1; laneT = 1; laneBuffer = 0;
    aHeld = dHeld = false; currentZ = laneWorldZ(1); roadWraps = 0; dustCursor = 0;
    resetDialogue(); stopVehicleLoop(); stopRotorLoop(); stopMusic();
    if (cine) cleanupCine(0);
    roadRoot.visible = true; airportRoot.visible = false;
    for (let i = 0; i < roadModules.length; i++)
        roadModules[i].position.x = OX + (i - (ROAD_MODULES - 1) / 2) * MODULE_LEN;
    for (const p of pickupPool) resetEnemyPickupVisual(p);
    for (const d of dustPool) d.visible = false;
    resetCombatGunship(gunship, { active: false });
    resetTacticalVehicleVisual(tacticalVehicle); tacticalVehicle.group.visible = true;
    if (avatarGroup) avatarGroup.visible = true;
    setAvatarVehiclePose(true, tacticalVehicle.gunnerPoseHeight); setAvatarRadioPose(false);
    setCineBars(false); setCineFade(0, 0); syncVehicle(0);
}

function startVehicleLoop() {
    if (vehicleLoop) return;
    vehicleLoop = playLoopSFX(sfxTankMove, 0.18);
    try { vehicleLoop.playbackRate = 1.65; } catch (e) { }
}
function stopVehicleLoop() { if (vehicleLoop) { stopLoopSFX(vehicleLoop); vehicleLoop = null; } }
function startRotorLoop() {
    if (rotorLoop) return; rotorLoop = playLoopSFX(sfxHeli, 0.42);
    try { rotorLoop.playbackRate = 1.18; } catch (e) { }
}
function stopRotorLoop() { if (rotorLoop) { stopLoopSFX(rotorLoop); rotorLoop = null; } }

export function stage8Walk(x, z, radius = 0) {
    return x >= PLAYER_X - 260 + radius && x <= PLAYER_X + 260 - radius
        && z >= laneWorldZ(0) - 12 + radius && z <= laneWorldZ(6) + 12 - radius;
}

export const stage8DialogueDebug = () => ({
    key: dialogueCurrent?.key || null, speaker: dialogueCurrent?.speaker || '',
    text: dialogueCurrent?.text || '', chars: dialogueChars,
    shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
    typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
    queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen],
});
export const stage8ConvoyDebug = () => ({
    spawned: pickupsSpawned, destroyed: pickupsDestroyed,
    target: CFG.campaign.stage8.groundPickupTarget,
    remaining: Math.max(0, CFG.campaign.stage8.groundPickupTarget - pickupsDestroyed),
    spawnTimer: groundSpawnT, activePickups: activePickupCount(),
    activeRiders: activePursuerCount(), maxActive: CFG.campaign.stage8.maxActivePickups,
    pickups: pickupPool.map(enemyPickupDebug),
});
export const stage8RoadDebug = () => ({
    speed: roadSpeed(), wraps: roadWraps,
    roadSpan: ROAD_SPAN, pickupEntryInset: CFG.campaign.stage8.pickupEntryInset,
    moduleCount: roadModules.length, modulePositions: roadModules.map(g => g.position.x),
    roadVisible: !!roadRoot?.visible, airportVisible: !!airportRoot?.visible,
    laneIndex, laneFrom, laneTo, laneT, laneBuffer, currentZ,
});
export const stage8WorldDebug = () => ({
    built, origin: { x: OX, z: OZ }, airport: { ...S8_AIRPORT },
    lanePositions: LANE_MULTIPLIERS.map((_, i) => laneWorldZ(i)),
    gameplayCamera: { x: driveCam.x, y: driveCam.y, z: driveCam.z,
        distance: Math.hypot(driveCam.x, driveCam.y, driveCam.z),
        pullback: DRIVE_CAM_PULLBACK },
    pools: { road: roadModules.length, pickups: pickupPool.length, dust: dustPool.length,
        missiles: gunship?.missiles?.length || 0, shells: gunship?.shells?.length || 0 },
    lights: stageLights.length, staticBatches: staticBatch.length,
    sceneRoots: { world: !!worldRoot, road: !!roadRoot, airport: !!airportRoot },
});
export const stage8Debug = () => ({
    phase, objective: stage8Scene.hudStatus(), complete, stageElapsed,
    groundSpawnT, bossApproachT,
    laneIndex, currentZ, cinematic: !!cine,
    convoy: stage8ConvoyDebug(), gunship: combatGunshipDebug(gunship),
    vehicle: tacticalVehicleDebug(tacticalVehicle), avatar: avatarVehicleDebug(),
    deathDelayT,
});
export const stage8EnemyPickupDebug = (index = 0) => enemyPickupDebug(pickupPool[index]);
export const stage8GunshipDebug = () => combatGunshipDebug(gunship);
export const stage8DamageGunshipForDebug = dmg => damageCombatGunship(gunship, dmg);
export const stage8StaticBatchDbg = () => staticBatch;

export const stage8Scene = {
    id: 'campaign-8', lightsKey: 'campaign-8',
    enter() {
        saveCampaignStage(8); ensureWorld();
        for (let i = robots.length - 1; i >= 0; i--) {
            disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
        resetStage(); applyLightPreset(scene, 'night'); enterCityEnv();
        camera.position.set(PLAYER_X, CFG.player.eyeHeight, currentZ);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true; startVehicleLoop(); startOpening(); updateUI();
    },
    exit() {
        resetDialogue(); if (cine) cleanupCine(0);
        stopVehicleLoop(); stopRotorLoop(); stopMusic();
        setAvatarVehiclePose(false); setAvatarRadioPose(false);
        if (avatarGroup) avatarGroup.visible = true;
        for (const p of pickupPool) resetEnemyPickupVisual(p);
        resetCombatGunship(gunship, { active: false });
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill(z) {
        const value = CFG.drops.loot?.[z.kind] ?? CFG.drops.loot.C;
        // X dipindah ke samping kendaraan agar loot tetap dapat diambil dalam
        // arena koordinat-stabil; Z mempertahankan lajur pickup yang dibunuh.
        spawnLoot(PLAYER_X, z.mesh.position.z, value, 1);
    },

    updateMode(dt) {
        stageElapsed += dt; updateDialogue(dt); updateCine(dt); updateDust(dt);
        if (cine || complete) { updateUI(); return; }
        updateJourney(dt); updateBoss(dt); syncVehicle(dt); updateUI();
    },
    updatePlayerControl(dt) { updateLaneControl(dt); return true; },
    allowsPlayerAction(action) { return !['moveTarget', 'dodge', 'melee'].includes(action); },

    playerCollide(pos) {
        pos.x = phase === 'arrival' || phase === 'complete' ? pos.x : PLAYER_X;
        pos.z = phase === 'arrival' || phase === 'complete' ? pos.z : currentZ;
    },
    groundHeight: () => 0,
    bulletBlocked: () => false,
    blastBlocked: () => false,
    grenadeCollide() { },
    robotAI(z) {
        if (z.stage !== 8 || !z.mounted || !z.pickup || z.pickup.wreck) return { skip: true };
        enemyPickupPassengerWorld(z.pickup, z.mountSlot, mountPos);
        z.mesh.position.copy(mountPos); z.groundY = mountPos.y;
        z.state = 'mounted'; z.moving = false; z.aiming = true; z.losOK = true;
        const dx = camera.position.x - z.mesh.position.x, dz = camera.position.z - z.mesh.position.z;
        z.mesh.rotation.y = Math.atan2(dx, dz);
        return { chaseDist: Math.hypot(dx, dz) };
    },
    clampRobot(z) {
        if (z.mounted && z.pickup) {
            enemyPickupPassengerWorld(z.pickup, z.mountSlot, mountPos); z.mesh.position.copy(mountPos);
        }
    },
    clampDropPos(x, z) {
        return [clamp(x, PLAYER_X - 20, PLAYER_X + 24),
            clamp(z, laneWorldZ(0), laneWorldZ(6))];
    },
    hudStatus() {
        const target = CFG.campaign.stage8.groundPickupTarget;
        if (phase === 'opening') return 'STAGE 8 — CISUMDAWU KILL ZONE';
        if (phase === 'groundPursuit' || phase === 'highway')
            return `PURSUIT VEHICLES — DESTROYED ${pickupsDestroyed} / ${target} — ACTIVE ${activePickupCount()} — RIDERS ${activePursuerCount()}`;
        if (phase === 'bossApproach')
            return 'PURSUIT DESTROYED — AIR CONTACT INBOUND';
        if (phase === 'gunshipIntro') return 'AIRBORNE CONTACT';
        if (phase === 'gunshipBattle' || phase === 'gunshipDeath') {
            const frac = gunship ? Math.max(0, gunship.hp / Math.max(1, gunship.maxHp)) : 0;
            const blocks = Math.ceil(frac * 10);
            return `AIR INTERCEPT — GUNSHIP ${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)}`;
        }
        if (phase === 'arrival') return 'KERTAJATI INTERNATIONAL AIRPORT — FINAL APPROACH';
        return 'KERTAJATI INTERNATIONAL AIRPORT — ROUTE COMPLETE';
    },
    radarLandmarks(plot) {
        if (phase === 'gunshipBattle' || phase === 'gunshipDeath') {
            const p = gunship.parts.group.position;
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ff4a3c', 6, true); return;
        }
        for (const p of pickupPool) if (p.active && !p.wreck)
            plot(p.group.position.x - camera.position.x, p.group.position.z - camera.position.z,
                '#ffb03b', 4, true);
    },
    get camOffset() { return cine ? cineCam : driveCam; },
};
