// Campaign Stage 9 — KERTAJATI AIRPORT ESCAPE.
// Alur stage dibagi tegas menjadi tiga chapter: area luar gedung, interior
// gedung bandara, lalu landasan dengan objective pompa bahan bakar.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus } from '../../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { avatarGroup, setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../../entities/crates.js';
import { spawnBarrel, resetBarrels, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { currentWeapon } from '../../../../entities/weapons.js';
import { slideWalk } from '../../../../utils/collision.js';
import { applyLightPreset, setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import {
    spawnCampaignRobot, campaignAwardKill, campaignRobotAI,
    campaignClampRobot, countStageRobots,
} from '../../utility/common.js';
import { beginStageTransition, campaignJumpToStage } from '../../utility/transition.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { stopMusic } from '../../../../utils/sfx.js';
import { stage1Scene } from '../stage1/index.js';
import { stage10Scene } from '../stage10/index.js';
import {
    ensureStage9World, S9_START, S9_BUILDING_ENTRY, S9_BUILDING_START,
    S9_BUILDING_EXIT, S9_RUNWAY_START, S9_PUMP, S9_BOARD, S9_BOUNDS,
    stage9Walkable, stage9BlockedAt, stage9Resolve, stage9SegHitsWall,
    stage9GroundHeight, stage9NavGrid, stage9Transport, stage9SetFuelPumpOn,
    stage9SetMarkers, stage9UpdateWorld, stage9SupplyPlacements,
    stage9EncounterPoints, stage9RadarLandmarks, stage9WorldDebug,
    resetStage9Occluders,
} from './world.js';

export { ensureStage9World, stage9WorldDebug } from './world.js';
export const STAGE9_DIALOGUE = dialogueMap('campaign.stage9.lines');

let chapter = 1;
let phase = 'opening';
let complete = false;
let stageElapsed = 0;
let fuelT = 0;
let fuelPumpOn = false;
let takeoffT = 0;
let transitionSent = false;
let cine = null;
const spawnedEncounters = Object.create(null);
const cineCam = new THREE.Vector3(-112, 102, 116);

let dialogueCurrent = null;
let dialogueQueue = [];
let dialogueSeen = new Set();
let dialogueT = 0;
let dialogueChars = 0;

const config = () => CFG.campaign.stage9;

function distanceTo(p) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
}

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}

function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null;
    dialogueT = 0;
    dialogueChars = 0;
    setAvatarRadioPose(!!dialogueCurrent);
    renderDialogue();
}

function queueDialogue(key, repeat = false) {
    const line = STAGE9_DIALOGUE[key];
    if (!line || (!repeat && dialogueSeen.has(key))) return false;
    if (!repeat) dialogueSeen.add(key);
    dialogueQueue.push({ key, ...line });
    if (!dialogueCurrent) nextDialogue();
    return true;
}

function updateDialogue(dt) {
    if (!dialogueCurrent) return;
    const D = CFG.campaign.dialogue;
    dialogueT += dt;
    while (dialogueCurrent) {
        const seconds = dialogueCurrent.text.length / Math.max(1, D.cps)
            + Math.max(0, D.holdSec);
        if (dialogueT < seconds) {
            dialogueChars = Math.floor(dialogueT * Math.max(1, D.cps));
            renderDialogue();
            return;
        }
        dialogueChars = dialogueCurrent.text.length;
        renderDialogue();
        dialogueT -= seconds;
        nextDialogue();
    }
}

function resetDialogue() {
    dialogueCurrent = null;
    dialogueQueue = [];
    dialogueSeen = new Set();
    dialogueT = 0;
    dialogueChars = 0;
    setAvatarRadioPose(false);
    hideStageRadioDialogue();
}

function removeStage9Robots() {
    for (let i = robots.length - 1; i >= 0; i--) {
        if (robots[i].stage !== 9) continue;
        disposeRobot(robots[i]);
        scene.remove(robots[i].mesh);
        robots.splice(i, 1);
    }
}

function clearSpawnPoint(p, seed) {
    const radius = Math.floor(seed / 7) * 9;
    const angle = seed * 2.399963;
    let x = p.x + Math.cos(angle) * radius;
    let z = p.z + Math.sin(angle) * radius;
    if (!stage9Walkable(x, z, 4) || stage9BlockedAt(x, z, 4)) {
        x = p.x;
        z = p.z;
    }
    return { x, z };
}

function spawnEncounter(name, counts, active = false) {
    if (!counts || spawnedEncounters[name]) return 0;
    spawnedEncounters[name] = true;
    const points = stage9EncounterPoints(name);
    let cursor = 0;
    for (const cls of ['C', 'B', 'A']) {
        const amount = Math.max(0, counts[cls] | 0);
        for (let i = 0; i < amount; i++, cursor++) {
            const point = clearSpawnPoint(points[cursor % points.length], cursor);
            spawnCampaignRobot(point.x, point.z, 9, cls, active);
            robots[robots.length - 1].encounter = name;
        }
    }
    return cursor;
}

function encounterCount(name) {
    let n = 0;
    for (const robot of robots)
        if (robot.stage === 9 && robot.encounter === name) n++;
    return n;
}

function placeSupplies() {
    const placements = stage9SupplyPlacements();
    const C = config();
    for (const p of placements.crates.slice(0, C.lootboxCount)) spawnCrate(p.x, p.z, 0);
    for (const p of placements.barrels.slice(0, C.barrelCount)) spawnBarrel(p.x, p.z, 0);
    for (const p of placements.drops) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}

function movePlayerTo(point) {
    camera.position.set(point.x, CFG.player.eyeHeight, point.z);
    player.vy = 0;
    player.onGround = true;
}

function resetStage() {
    chapter = 1;
    phase = 'opening';
    complete = false;
    stageElapsed = 0;
    fuelT = 0;
    fuelPumpOn = false;
    takeoffT = 0;
    transitionSent = false;
    cine = null;
    for (const name of Object.keys(spawnedEncounters)) delete spawnedEncounters[name];
    resetDialogue();
    stage9SetFuelPumpOn(false);
    stage9SetMarkers([]);
    resetStage9Occluders();
    stage9UpdateWorld(0, 0, 0, false, 0);
}

function cleanupCine(revealSec = 0) {
    cine = null;
    hideCutsceneSkip();
    setCineFocus(null);
    setCineBars(false);
    setCineFade(0, revealSec);
    setCinematicActive(false);
    if (avatarGroup) avatarGroup.visible = true;
}

function finishOpening(skipped = false) {
    if (!cine || cine.kind !== 'opening') return;
    if (skipped) resetDialogue();
    cleanupCine(config().fadeSec);
    phase = 'outsideClear';
    chapter = 1;
    stage9SetMarkers(['building']);
    queueDialogue('outsideCommand');
    showStageMsg('CHAPTER 1 — CLEAR THE AIRPORT GROUNDS AND REACH THE BUILDING', 4800);
}

function startOpening() {
    releaseInputs();
    clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true);
    setCineBars(true);
    setCineFade(1, 0);
    setCineFade(0, config().fadeSec);
    cine = { kind: 'opening', t: 0, shot: -1 };
    queueDialogue('openingCommand');
    queueDialogue('openingGibran');
    setCineFocus(S9_BUILDING_ENTRY.x, S9_BUILDING_ENTRY.z, true);
    showCutsceneSkip(() => finishOpening(true));
}

function enterBuilding() {
    if (phase !== 'outsideClear' || encounterCount('outside') > 0
        || distanceTo(S9_BUILDING_ENTRY) > config().interactionRange * 2) return;
    chapter = 2;
    phase = 'insideClear';
    movePlayerTo(S9_BUILDING_START);
    stage9SetMarkers(['buildingExit']);
    spawnEncounter('inside', config().encounters.inside, true);
    queueDialogue('buildingEntry');
    showStageMsg('CHAPTER 2 — CLEAR THE AIRPORT BUILDING AND REACH THE APRON EXIT', 4800);
}

function enterRunway() {
    if (phase !== 'insideClear' || encounterCount('inside') > 0
        || distanceTo(S9_BUILDING_EXIT) > config().interactionRange) return;
    chapter = 3;
    phase = 'fuelPump';
    movePlayerTo(S9_RUNWAY_START);
    stage9SetMarkers(['pump']);
    spawnEncounter('runway', config().encounters.runway, true);
    queueDialogue('runwayEntry');
    showStageMsg('CHAPTER 3 — TURN ON THE FUEL PUMP', 4200);
}

function startFuelPump() {
    if (phase !== 'fuelPump' || fuelPumpOn || distanceTo(S9_PUMP) > config().fuel.interactionRange) return;
    fuelPumpOn = true;
    phase = 'fueling';
    stage9SetFuelPumpOn(true);
    stage9SetMarkers([]);
    queueDialogue('pumpStarted');
    showStageMsg('FUEL PUMP ACTIVE — FILL THE AIRCRAFT', 4200);
}

function finishFueling() {
    if (phase !== 'fueling' || fuelT < config().fuel.durationSec) return;
    fuelT = config().fuel.durationSec;
    phase = 'board';
    stage9SetMarkers(['board']);
    queueDialogue('fuelFull');
    showStageMsg('AIRCRAFT FUEL FULL — APPROACH THE TRANSPORT', 4600);
}

function startTakeoff() {
    if (phase !== 'board' || cine || distanceTo(S9_BOARD) > config().interactionRange) return;
    phase = 'takeoff';
    takeoffT = 0;
    stage9SetMarkers([]);
    releaseInputs();
    clearMoveTarget();
    setCinematicActive(true);
    setCineBars(true);
    cine = { kind: 'takeoff', t: 0, shot: -1 };
    if (avatarGroup) avatarGroup.visible = false;
    queueDialogue('departure');
    setCineFocus(stage9Transport().position.x, stage9Transport().position.z, true);
    showCutsceneSkip(() => finishTakeoff(true));
}

function finishTakeoff(skipped = false) {
    if (complete) return;
    if (skipped) {
        takeoffT = config().takeoffSec;
        stage9UpdateWorld(0, stageElapsed, 1, fuelPumpOn, 1);
    }
    resetDialogue();
    complete = true;
    phase = 'complete';
    cleanupCine(0);
    if (!transitionSent) {
        transitionSent = true;
        beginStageTransition(stage10Scene);
    }
}

function updateCine(dt) {
    if (!cine) return;
    cine.t += dt;
    if (cine.kind === 'opening') {
        const third = config().openingMinSec / 3;
        const shot = Math.min(2, Math.floor(cine.t / Math.max(0.01, third)));
        if (shot !== cine.shot) {
            cine.shot = shot;
            if (shot === 0) setCineFocus(S9_BUILDING_ENTRY.x, S9_BUILDING_ENTRY.z, true);
            else if (shot === 1) setCineFocus(S9_RUNWAY_START.x, S9_RUNWAY_START.z, true);
            else setCineFocus(stage9Transport().position.x, stage9Transport().position.z, true);
        }
        if (cine.t >= config().openingMinSec && !dialogueCurrent && !dialogueQueue.length)
            finishOpening(false);
        return;
    }
    if (cine.kind === 'takeoff') {
        takeoffT = Math.min(config().takeoffSec, takeoffT + dt);
        const progress = takeoffT / config().takeoffSec;
        stage9UpdateWorld(dt, stageElapsed, 1, fuelPumpOn, progress);
        const aircraft = stage9Transport();
        setCineFocus(aircraft.position.x, aircraft.position.z);
        if (takeoffT >= config().takeoffSec) finishTakeoff(false);
    }
}

function updateObjectives(dt) {
    const C = config();
    if (phase === 'outsideClear' && encounterCount('outside') === 0
        && distanceTo(S9_BUILDING_ENTRY) <= C.interactionRange * 2) enterBuilding();
    else if (phase === 'insideClear' && encounterCount('inside') === 0
        && distanceTo(S9_BUILDING_EXIT) <= C.interactionRange) enterRunway();
    else if (phase === 'fuelPump') startFuelPump();
    else if (phase === 'fueling') {
        fuelT = Math.min(C.fuel.durationSec, fuelT + dt);
        if (fuelT >= C.fuel.durationSec) finishFueling();
    } else if (phase === 'board') startTakeoff();
}

function objectivePoint() {
    if (phase === 'outsideClear') return S9_BUILDING_ENTRY;
    if (phase === 'insideClear') return S9_BUILDING_EXIT;
    if (phase === 'fuelPump' || phase === 'fueling') return S9_PUMP;
    if (phase === 'board') return S9_BOARD;
    return null;
}

export function stage9Debug() {
    const C = config();
    return {
        chapter, phase, complete, stageElapsed,
        fuel: {
            seconds: fuelT, duration: C.fuel.durationSec,
            progress: fuelT / C.fuel.durationSec, pumpOn: fuelPumpOn,
        },
        encounters: Object.fromEntries(Object.keys(spawnedEncounters)
            .map((name) => [name, encounterCount(name)])),
        takeoff: { seconds: takeoffT, duration: C.takeoffSec },
        cinematic: cine?.kind || null,
        transitionSent,
        world: stage9WorldDebug(),
    };
}

export const stage9Scene = {
    id: 'campaign-9',
    lightsKey: 'campaign-9',

    enter() {
        saveCampaignStage(9);
        ensureStage9World();
        setActiveCampaignWorldRoots('campaign-9');
        setActiveStageLights('campaign-9');
        removeStage9Robots();
        resetCrates();
        resetBarrels();
        resetStage();
        spawnEncounter('outside', config().encounters.outside, false);
        placeSupplies();
        applyLightPreset(scene, 'night');
        enterCityEnv({ background: 0x50606a, fogColor: 0x46555a, fogNear: 260, fogFar: 1800 });
        movePlayerTo(S9_START);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        startOpening();
        updateUI();
    },

    exit() {
        resetDialogue();
        if (cine) cleanupCine(0);
        stage9SetMarkers([]);
        stopMusic();
        setActiveCampaignWorldRoots([]);
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: (n) => campaignJumpToStage(n),
    awardKill: campaignAwardKill,

    updateMode(dt) {
        stageElapsed += dt;
        updateDialogue(dt);
        updateCine(dt);
        if (!cine) stage9UpdateWorld(dt, stageElapsed,
            config().fuel.durationSec > 0 ? fuelT / config().fuel.durationSec : 0,
            fuelPumpOn, phase === 'complete' ? 1 : 0);
        if (!cine && !complete) updateObjectives(dt);
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage9Walkable, pos, oldX, oldZ, player.radius);
        stage9Resolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius);
        resolveBarrelBlock(pos, player.radius);
        slideWalk(stage9Walkable, pos, oldX, oldZ, player.radius);
        if (player.onGround) {
            pos.y = CFG.player.eyeHeight;
            player.vy = 0;
        }
    },

    groundHeight: stage9GroundHeight,
    get camOffset() { return cine ? cineCam : null; },

    bulletBlocked(b) {
        return stage9SegHitsWall(b.px, b.pz, b.mesh.position.x,
            b.mesh.position.z, b.mesh.position.y);
    },

    blastBlocked(x0, z0, x1, z1, y = 0) {
        return stage9SegHitsWall(x0, z0, x1, z1, y);
    },

    grenadeCollide(g, oldX, oldZ) {
        if (!stage9Walkable(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX;
            g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4;
            g.vz = -g.vz * 0.4;
        }
        stage9Resolve(g.mesh.position, 2, 0);
    },

    robotAI(robot, dt, step) {
        if (robot.stage !== 9) return { skip: true };
        if (phase === 'opening' || phase === 'takeoff' || phase === 'complete') {
            robot.state = 'idle';
            robot.moving = false;
            robot.aiming = false;
            return {};
        }
        return campaignRobotAI(robot, dt, step, {
            walkable: stage9Walkable,
            resolve: stage9Resolve,
            nav: stage9NavGrid(),
            los: (x0, z0, x1, z1) => !stage9SegHitsWall(x0, z0, x1, z1, 8),
        });
    },

    clampRobot(robot, oldX, oldZ) {
        campaignClampRobot(robot, oldX, oldZ,
            { walkable: stage9Walkable, resolve: stage9Resolve });
    },

    clampDropPos(x, z) {
        if (stage9Walkable(x, z, 2) && !stage9BlockedAt(x, z, 2)) return [x, z, 0];
        const nx = Math.max(S9_BOUNDS.x0 + 20, Math.min(S9_BOUNDS.x1 - 20, x));
        const nz = Math.max(-250, Math.min(270, z));
        return [nx, nz, 0];
    },

    hudStatus() {
        if (phase === 'opening') return 'STAGE 9 — KERTAJATI AIRPORT';
        if (phase === 'outsideClear') return `CHAPTER 1 — REACH AIRPORT BUILDING — HOSTILES ${encounterCount('outside')}`;
        if (phase === 'insideClear') return `CHAPTER 2 — CLEAR AIRPORT BUILDING — HOSTILES ${encounterCount('inside')}`;
        if (phase === 'fuelPump') return 'CHAPTER 3 — TURN ON THE FUEL PUMP';
        if (phase === 'fueling') return `CHAPTER 3 — FUELING AIRCRAFT ${Math.floor(fuelT / config().fuel.durationSec * 100)}%`;
        if (phase === 'board') return 'AIRCRAFT FUEL FULL — APPROACH THE TRANSPORT';
        if (phase === 'takeoff') return 'STAGE 9 — DEPARTURE';
        return 'STAGE 9 COMPLETE';
    },

    radarLandmarks(plot) {
        const objective = objectivePoint();
        if (objective) plot(objective.x - camera.position.x,
            objective.z - camera.position.z, '#ffb03b', 5, true);
        void stage9RadarLandmarks;
    },

    countStageRobots: () => countStageRobots(9),
};
