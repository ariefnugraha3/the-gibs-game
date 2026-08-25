// Campaign Stage 10 facade — Chapter 1 THE IRON PORT -> Chapter 2 THE GREEN FIREWALL.
// sceneManager only ever sees `stage10Scene`; chapter handoff keeps
// checkpoint, loadout, stats and dialogue lifecycle inside one campaign stage.

import { CFG } from '../../../../core/config.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, CAM_OFF_DEFAULT, setCineFocus } from '../../../../core/renderer.js';
import {
    showStageMsg, hideStageRadioDialogue, hideDownloadBar,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { resetCrates, spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import { resetBarrels, spawnBarrel, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import {
    campaignAwardKill, campaignRobotAI, campaignClampRobot, countStageRobots,
} from '../../utility/common.js';
import { campaignJumpToStage, beginStageTransition } from '../../utility/transition.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { applyLightPreset, setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import { stage1Scene } from '../stage1/index.js';
import { stage11Scene } from '../stage11/index.js';
import {
    stage10PortScene, stage10PortDebug, ensureStage10World as ensureStage10PortWorld,
    setStage10CompletionHook,
} from './port.js';
import {
    STAGE10_FOREST_LIGHTS_KEY, S10_FOREST_START, S10_FOREST_WRECK,
    S10_FOREST_SENSOR_ENTRY, S10_FOREST_SHELTER, S10_FOREST_WATERWORKS,
    S10_FOREST_GALLERY, S10_FOREST_FINISH,
    ensureStage10ForestWorld, stage10ForestWorldDebug,
    stage10ForestWalk, stage10ForestResolve, stage10ForestGroundHeight,
    stage10ForestNav, stage10ForestSegBlocked,
    updateStage10ForestWorldVisuals, resetStage10ForestWorldVisuals,
    setStage10ForestTunnelOpen,
} from './forestWorld.js';
import {
    buildStage10ForestSensorGrid, resetStage10ForestSensorGrid,
    clearStage10ForestStrikes, updateStage10ForestSensorGrid,
    consumeStage10ForestFirstLock, stage10ForestScanDebug,
} from './sensorGrid.js';
import {
    STAGE10_FOREST_DIALOGUE, queueStage10ForestDialogue, updateStage10ForestDialogue,
    resetStage10ForestDialogue, stage10ForestDialogueIdle, stage10ForestDialogueDebug,
    clearStage10ForestRobots, spawnStage10ForestWave, stage10ForestWaveTotals,
    activateStage10ForestPrefix, stage10ForestPrefixAlive,
} from './forestRuntime.js';

export { stage10PortScene, STAGE10_DIALOGUE, stage10RobotInView } from './port.js';
export { stage10ForestWorldDebug, STAGE10_FOREST_DIALOGUE };

export function ensureStage10World(parent = scene) {
    return {
        port: ensureStage10PortWorld(),
        forest: ensureStage10ForestWorld(parent),
    };
}

const PLAY_CAM = Object.freeze({ x: -70.7, y: 116, z: 70.7 });
const cineCam = { ...CAM_OFF_DEFAULT };
const phases = ['ambush', 'forestApproach', 'scanBelt', 'waterworks',
    'finalSweep', 'tunnelEntry', 'complete'];
let phase = 'ambush';
let complete = false;
let elapsed = 0;
let cine = null;
let transitionCommitted = false;
let interactionT = 0;
let spawned = { forest: false, sensor: false, water: false };
let waveCursor = { forest: -1, sensor: -1, water: -1 };
let configuredTotals = { forest: [], sensor: [], water: [] };
let encounterDebug = [];

const FOREST_POINTS = [
    { x: 360590, z: -245 }, { x: 360470, z: -160 },
    { x: 360350, z: -245 }, { x: 360300, z: -55 },
];
const SENSOR_POINTS = [
    { x: 360125, z: -80 }, { x: 360050, z: 70 },
    { x: 359970, z: -20 }, { x: 359890, z: 145 },
];
const WATER_POINTS = [
    { x: 359790, z: 130 }, { x: 359700, z: 215 },
    { x: 359590, z: 125 }, { x: 359500, z: 245 }, { x: 359360, z: 205 },
];

function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }

function resetStage() {
    phase = 'ambush'; complete = false; elapsed = 0; cine = null;
    transitionCommitted = false; interactionT = 0;
    spawned = { forest: false, sensor: false, water: false }; encounterDebug = [];
    waveCursor = { forest: -1, sensor: -1, water: -1 };
    const e = CFG.campaign.stage10.chapter2.encounters;
    configuredTotals = {
        forest: stage10ForestWaveTotals(e.forestApproach),
        sensor: stage10ForestWaveTotals(e.sensorBasin),
        water: stage10ForestWaveTotals(e.waterworks),
    };
    resetStage10ForestDialogue(); resetStage10ForestSensorGrid();
    resetStage10ForestWorldVisuals();
    hideDownloadBar(); hideCutsceneSkip(); setCineBars(false); setCineFade(0, 0);
}

function spawnNextWave(kind) {
    const e = CFG.campaign.stage10.chapter2.encounters;
    const raw = kind === 'forest' ? e.forestApproach
        : kind === 'sensor' ? e.sensorBasin : e.waterworks;
    const points = kind === 'forest' ? FOREST_POINTS
        : kind === 'sensor' ? SENSOR_POINTS : WATER_POINTS;
    const next = waveCursor[kind] + 1;
    if (next >= configuredTotals[kind].length) return false;
    waveCursor[kind] = next; spawned[kind] = true;
    encounterDebug.push(...spawnStage10ForestWave(raw, next, points, kind));
    return true;
}

function deterministicRoutePoint(i, n) {
    const t = (i + .5) / Math.max(1, n);
    return {
        x: 360580 - t * 1120,
        z: -205 + t * 435 + (((i * 37) % 7) - 3) * 16,
    };
}

function placeSupplies() {
    const C = CFG.campaign.stage10.chapter2;
    for (let i = 0; i < Math.max(0, C.lootboxCount | 0); i++) {
        const p = deterministicRoutePoint(i, C.lootboxCount);
        if (stage10ForestWalk(p.x, p.z, 8)) spawnCrate(p.x, p.z, 0);
    }
    for (let i = 0; i < Math.max(0, C.barrelCount | 0); i++) {
        const p = deterministicRoutePoint(i * 3 + 1, C.barrelCount * 3);
        if (stage10ForestWalk(p.x, p.z, 8)) spawnBarrel(p.x, p.z, 0);
    }
    // Guaranteed control-gallery resupply before the final crossing.
    spawnAmmoDrop(S10_FOREST_GALLERY.x + 22, S10_FOREST_GALLERY.z - 10, 'rifle', 1e9);
    spawnAmmoDrop(S10_FOREST_GALLERY.x + 8, S10_FOREST_GALLERY.z - 10, 'pistol', 1e9);
    spawnMedkitDrop(S10_FOREST_GALLERY.x - 10, S10_FOREST_GALLERY.z - 10, 1e9);
}

function finishOpening(skipped = false) {
    if (skipped) resetStage10ForestDialogue();
    cine = null; cleanupCine(); phase = 'ambush';
    showStageMsg('SURVIVE THE WRECK AMBUSH', 4200);
}

function cleanupCine() {
    hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, CFG.campaign.stage10.chapter2.fadeSec); setCinematicActive(false);
}

function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { t: 0, strike: false, dialogue: false };
    cineCam.x = 118; cineCam.y = 128; cineCam.z = 105;
    setCineFocus(S10_FOREST_WRECK.x, S10_FOREST_WRECK.z, true);
    showCutsceneSkip(() => finishOpening(true));
}

function updateOpening(dt) {
    if (!cine) return;
    const C = CFG.campaign.stage10.chapter2;
    cine.t += dt;
    if (!cine.dialogue) { cine.dialogue = true; queueStage10ForestDialogue('carrierHit'); }
    if (!cine.strike && cine.t >= C.carrierStrikeSec) {
        cine.strike = true; queueStage10ForestDialogue('stillMoving');
        setCineFocus(S10_FOREST_START.x, S10_FOREST_START.z, true);
    }
    if (cine.t >= C.openingMinSec && stage10ForestDialogueIdle()) finishOpening(false);
}

function updateProgression(dt) {
    if (phase === 'ambush' && stage10ForestPrefixAlive('forest-0') === 0) {
        phase = 'forestApproach'; queueStage10ForestDialogue('forestRoute');
        showStageMsg('FOLLOW THE FOREST SERVICE CORRIDOR', 4300);
        spawnNextWave('forest');
    }
    if (phase === 'forestApproach' && waveCursor.forest >= 1
        && stage10ForestPrefixAlive(`forest-${waveCursor.forest}`) === 0)
        activateStage10ForestPrefix('forest');
    if (phase === 'forestApproach' && camera.position.x <= S10_FOREST_SENSOR_ENTRY.x) {
        phase = 'scanBelt'; queueStage10ForestDialogue('scanDetected');
        showStageMsg('SCAN BELT — BREAK TRACKING UNDER ROOFED COVER', 4700);
        spawnNextWave('sensor');
    }
    if (phase === 'scanBelt' && waveCursor.sensor >= 0
        && stage10ForestPrefixAlive(`sensor-${waveCursor.sensor}`) === 0)
        spawnNextWave('sensor');
    if (consumeStage10ForestFirstLock()) queueStage10ForestDialogue('firstLock');
    if (phase === 'scanBelt' && camera.position.x <= S10_FOREST_SHELTER.x) {
        phase = 'waterworks'; queueStage10ForestDialogue('waterworksSighted');
        spawnNextWave('water');
    }
    if ((phase === 'waterworks' || phase === 'finalSweep') && waveCursor.water >= 0
        && stage10ForestPrefixAlive(`water-${waveCursor.water}`) === 0)
        spawnNextWave('water');
    if (phase === 'waterworks' && camera.position.x <= S10_FOREST_WATERWORKS.x - 80) {
        phase = 'finalSweep'; queueStage10ForestDialogue('rootTrace');
        showStageMsg('CONCENTRATED SWEEP — CROSS THE DAM CREST', 4500);
    }
    if (phase === 'finalSweep' && near(S10_FOREST_FINISH, CFG.campaign.stage10.chapter2.interactionRange)) {
        phase = 'tunnelEntry'; setStage10ForestTunnelOpen(true);
        queueStage10ForestDialogue('tunnelFound'); queueStage10ForestDialogue('stage11Lead');
        showStageMsg('UTILITY DESCENT OPEN — ENTER THE TUNNEL', 4200);
    }
    if (phase === 'tunnelEntry' && near(S10_FOREST_FINISH, CFG.campaign.stage10.chapter2.interactionRange)) {
        interactionT += dt;
        if (interactionT >= .75 && stage10ForestDialogueIdle()) finishStage();
    } else interactionT = 0;
}

function finishStage() {
    if (transitionCommitted) return;
    transitionCommitted = true; complete = true; phase = 'complete';
    clearStage10ForestStrikes(); resetStage10ForestDialogue(); cleanupCine();
    beginStageTransition(stage11Scene);
}

export const stage10ForestScene = {
    id: 'campaign-10-forest', lightsKey: STAGE10_FOREST_LIGHTS_KEY,
    enter() {
        const r = ensureStage10ForestWorld(scene); buildStage10ForestSensorGrid(r);
        setActiveCampaignWorldRoots(STAGE10_FOREST_LIGHTS_KEY);
        setActiveStageLights(STAGE10_FOREST_LIGHTS_KEY); applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x38443b, fogColor: 0x303b32, fogNear: 150, fogFar: 1200 });
        clearStage10ForestRobots(); resetCrates(); resetBarrels(); resetStage();
        spawnNextWave('forest'); placeSupplies();
        camera.position.set(S10_FOREST_START.x, CFG.player.eyeHeight, S10_FOREST_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening(); updateUI();
    },
    exit() {
        clearStage10ForestStrikes(); resetStage10ForestDialogue(); hideStageRadioDialogue();
        hideDownloadBar(); cleanupCine();
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) {
        elapsed += dt; updateStage10ForestDialogue(dt);
        updateStage10ForestWorldVisuals(dt);
        if (cine) updateOpening(dt);
        const sensorEnabled = !cine && phases.indexOf(phase) >= phases.indexOf('scanBelt')
            && phase !== 'tunnelEntry' && phase !== 'complete';
        updateStage10ForestSensorGrid(dt, sensorEnabled);
        if (!cine && !complete) updateProgression(dt);
        updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage10ForestWalk, pos, oldX, oldZ, player.radius);
        stage10ForestResolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage10ForestWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage10ForestGroundHeight,
    get camOffset() { return cine ? cineCam : PLAY_CAM; },
    bulletBlocked(b) {
        return stage10ForestSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z, true);
    },
    blastBlocked(x0, z0, x1, z1) { return stage10ForestSegBlocked(x0, z0, x1, z1, false); },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage10ForestWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -.4; g.vz *= -.4;
        }
        stage10ForestResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        return campaignRobotAI(bot, dt, step, {
            walkable: stage10ForestWalk, resolve: stage10ForestResolve, nav: stage10ForestNav(),
            los: (x0, z0, x1, z1) => !stage10ForestSegBlocked(x0, z0, x1, z1, true),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage10ForestWalk, resolve: stage10ForestResolve });
    },
    clampDropPos(x, z) { return stage10ForestWalk(x, z, 2) ? [x, z] : [S10_FOREST_START.x, S10_FOREST_START.z]; },
    hudStatus() {
        const s = stage10ForestScanDebug();
        const scan = s.state === 'CLEAR' ? '' : ` | ${s.state} ${Math.round(s.exposureFraction * 100)}%`;
        return `THE GREEN FIREWALL — ${phase.toUpperCase()} | Robots: ${countStageRobots(10)}${scan}`;
    },
    radarLandmarks(plot) {
        const target = phase === 'forestApproach' ? S10_FOREST_SENSOR_ENTRY
            : phase === 'scanBelt' ? S10_FOREST_SHELTER
                : phase === 'waterworks' ? S10_FOREST_WATERWORKS : S10_FOREST_FINISH;
        plot(target.x - camera.position.x, target.z - camera.position.z, '#ffb03b', 5, true);
        const scan = stage10ForestScanDebug();
        if (scan.footprint?.visible)
            plot(scan.footprint.x - camera.position.x, -camera.position.z, '#b3402e', 4, true);
    },
};

export const stage10ForestWorldDebugFull = () => stage10ForestWorldDebug();
const forestDebug = () => ({
    phase, complete, elapsed, cine: cine && { ...cine }, transitionCommitted,
    objective: stage10ForestScene.hudStatus(), robots: countStageRobots(10),
    activeRobots: robots.reduce((n, r) => n + (r.stage === 10 && r.state !== 'idle' ? 1 : 0), 0),
    finishEligible: phase === 'tunnelEntry' && stage10ForestDialogueIdle(),
    spawned: { ...spawned }, encounters: encounterDebug.map(x => ({ ...x })),
    waves: {
        cursor: { ...waveCursor }, configured: {
            forest: [...configuredTotals.forest], sensor: [...configuredTotals.sensor],
            water: [...configuredTotals.water],
        },
        spawnedTotal: encounterDebug.length,
        remainingConfigTotal: Object.keys(configuredTotals).reduce((sum, kind) =>
            sum + configuredTotals[kind].slice(waveCursor[kind] + 1)
                .reduce((n, v) => n + v, 0), 0),
    },
    dialogue: stage10ForestDialogueDebug(), scan: stage10ForestScanDebug(), world: stage10ForestWorldDebug(),
});

let chapter = null;

function activeChapter() { return chapter || stage10PortScene; }

function enterForestChapter() {
    if (chapter === stage10ForestScene) return;
    chapter?.exit?.();
    chapter = stage10ForestScene;
    stage10ForestScene.enter();
}

export const enterStage10Chapter2 = enterForestChapter;

export const stage10Scene = {
    id: 'campaign-10',
    lightsKey: 'campaign-10-port',

    enter() {
        saveCampaignStage(10);
        ensureStage10World();
        setStage10CompletionHook(enterForestChapter);
        chapter = stage10PortScene;
        chapter.enter();
    },

    exit() {
        activeChapter().exit?.();
        setStage10CompletionHook(null);
        chapter = null;
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) { activeChapter().updateMode(dt); },
    playerCollide(pos, oldX, oldZ, feetY) {
        activeChapter().playerCollide(pos, oldX, oldZ, feetY);
    },
    groundHeight(x, z, feetY) { return activeChapter().groundHeight(x, z, feetY); },
    get camOffset() { return activeChapter().camOffset || null; },
    bulletBlocked(b) { return activeChapter().bulletBlocked(b); },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        return activeChapter().blastBlocked(x0, z0, x1, z1, y);
    },
    grenadeCollide(g, oldX, oldZ) { activeChapter().grenadeCollide(g, oldX, oldZ); },
    robotAI(bot, dt, step) { return activeChapter().robotAI(bot, dt, step); },
    clampRobot(bot, oldX, oldZ) { activeChapter().clampRobot(bot, oldX, oldZ); },
    clampDropPos(x, z) { return activeChapter().clampDropPos(x, z); },
    hudStatus() { return activeChapter().hudStatus(); },
    radarLandmarks(plot) { activeChapter().radarLandmarks(plot); },
    countStageRobots: () => countStageRobots(10),
};

export const stage10Debug = () => ({
    chapter: chapter === stage10ForestScene ? 2 : 1,
    sub: activeChapter().id,
    chapter1: stage10PortDebug(),
    chapter2: forestDebug(),
    ...(chapter === stage10ForestScene ? forestDebug() : stage10PortDebug()),
});
