// Campaign Stage 11 — THE GREEN FIREWALL.

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
import { stage12Scene } from '../stage12/index.js';
import {
    STAGE11_LIGHTS_KEY, S11_START, S11_WRECK, S11_SENSOR_ENTRY, S11_SHELTER,
    S11_WATERWORKS, S11_GALLERY, S11_FINISH,
    ensureStage11World as ensureWorld, stage11WorldDebug,
    stage11Walk, stage11Resolve, stage11GroundHeight, stage11Nav, stage11SegBlocked,
    updateStage11WorldVisuals, resetStage11WorldVisuals, setStage11TunnelOpen,
} from './world.js';
import {
    buildStage11SensorGrid, resetStage11SensorGrid, clearStage11Strikes,
    updateStage11SensorGrid, consumeStage11FirstLock, stage11ScanDebug,
} from './sensorGrid.js';
import {
    STAGE11_DIALOGUE, queueStage11Dialogue, updateStage11Dialogue,
    resetStage11Dialogue, stage11DialogueIdle, stage11DialogueDebug,
    clearStage11Robots, spawnStage11Wave, stage11WaveTotals,
    activateStage11Prefix, stage11PrefixAlive,
} from './runtime.js';

export { ensureWorld as ensureStage11World, stage11WorldDebug, STAGE11_DIALOGUE };

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
    const e = CFG.campaign.stage11.encounters;
    configuredTotals = {
        forest: stage11WaveTotals(e.forestApproach),
        sensor: stage11WaveTotals(e.sensorBasin),
        water: stage11WaveTotals(e.waterworks),
    };
    resetStage11Dialogue(); resetStage11SensorGrid(); resetStage11WorldVisuals();
    hideDownloadBar(); hideCutsceneSkip(); setCineBars(false); setCineFade(0, 0);
}

function spawnNextWave(kind) {
    const e = CFG.campaign.stage11.encounters;
    const raw = kind === 'forest' ? e.forestApproach
        : kind === 'sensor' ? e.sensorBasin : e.waterworks;
    const points = kind === 'forest' ? FOREST_POINTS
        : kind === 'sensor' ? SENSOR_POINTS : WATER_POINTS;
    const next = waveCursor[kind] + 1;
    if (next >= configuredTotals[kind].length) return false;
    waveCursor[kind] = next; spawned[kind] = true;
    encounterDebug.push(...spawnStage11Wave(raw, next, points, kind));
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
    const C = CFG.campaign.stage11;
    for (let i = 0; i < Math.max(0, C.lootboxCount | 0); i++) {
        const p = deterministicRoutePoint(i, C.lootboxCount);
        if (stage11Walk(p.x, p.z, 8)) spawnCrate(p.x, p.z, 0);
    }
    for (let i = 0; i < Math.max(0, C.barrelCount | 0); i++) {
        const p = deterministicRoutePoint(i * 3 + 1, C.barrelCount * 3);
        if (stage11Walk(p.x, p.z, 8)) spawnBarrel(p.x, p.z, 0);
    }
    // Guaranteed control-gallery resupply before the final crossing.
    spawnAmmoDrop(S11_GALLERY.x + 22, S11_GALLERY.z - 10, 'rifle', 1e9);
    spawnAmmoDrop(S11_GALLERY.x + 8, S11_GALLERY.z - 10, 'pistol', 1e9);
    spawnMedkitDrop(S11_GALLERY.x - 10, S11_GALLERY.z - 10, 1e9);
}

function finishOpening(skipped = false) {
    if (skipped) resetStage11Dialogue();
    cine = null; cleanupCine(); phase = 'ambush';
    showStageMsg('SURVIVE THE WRECK AMBUSH', 4200);
}

function cleanupCine() {
    hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, CFG.campaign.stage11.fadeSec); setCinematicActive(false);
}

function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { t: 0, strike: false, dialogue: false };
    cineCam.x = 118; cineCam.y = 128; cineCam.z = 105;
    setCineFocus(S11_WRECK.x, S11_WRECK.z, true);
    showCutsceneSkip(() => finishOpening(true));
}

function updateOpening(dt) {
    if (!cine) return;
    const C = CFG.campaign.stage11;
    cine.t += dt;
    if (!cine.dialogue) { cine.dialogue = true; queueStage11Dialogue('carrierHit'); }
    if (!cine.strike && cine.t >= C.carrierStrikeSec) {
        cine.strike = true; queueStage11Dialogue('stillMoving');
        setCineFocus(S11_START.x, S11_START.z, true);
    }
    if (cine.t >= C.openingMinSec && stage11DialogueIdle()) finishOpening(false);
}

function updateProgression(dt) {
    if (phase === 'ambush' && stage11PrefixAlive('forest-0') === 0) {
        phase = 'forestApproach'; queueStage11Dialogue('forestRoute');
        showStageMsg('FOLLOW THE FOREST SERVICE CORRIDOR', 4300);
        spawnNextWave('forest');
    }
    if (phase === 'forestApproach' && waveCursor.forest >= 1
        && stage11PrefixAlive(`forest-${waveCursor.forest}`) === 0)
        activateStage11Prefix('forest');
    if (phase === 'forestApproach' && camera.position.x <= S11_SENSOR_ENTRY.x) {
        phase = 'scanBelt'; queueStage11Dialogue('scanDetected');
        showStageMsg('SCAN BELT — BREAK TRACKING UNDER ROOFED COVER', 4700);
        spawnNextWave('sensor');
    }
    if (phase === 'scanBelt' && waveCursor.sensor >= 0
        && stage11PrefixAlive(`sensor-${waveCursor.sensor}`) === 0)
        spawnNextWave('sensor');
    if (consumeStage11FirstLock()) queueStage11Dialogue('firstLock');
    if (phase === 'scanBelt' && camera.position.x <= S11_SHELTER.x) {
        phase = 'waterworks'; queueStage11Dialogue('waterworksSighted');
        spawnNextWave('water');
    }
    if ((phase === 'waterworks' || phase === 'finalSweep') && waveCursor.water >= 0
        && stage11PrefixAlive(`water-${waveCursor.water}`) === 0)
        spawnNextWave('water');
    if (phase === 'waterworks' && camera.position.x <= S11_WATERWORKS.x - 80) {
        phase = 'finalSweep'; queueStage11Dialogue('rootTrace');
        showStageMsg('CONCENTRATED SWEEP — CROSS THE DAM CREST', 4500);
    }
    if (phase === 'finalSweep' && near(S11_FINISH, CFG.campaign.stage11.interactionRange)) {
        phase = 'tunnelEntry'; setStage11TunnelOpen(true);
        queueStage11Dialogue('tunnelFound'); queueStage11Dialogue('stage12Lead');
        showStageMsg('UTILITY DESCENT OPEN — ENTER THE TUNNEL', 4200);
    }
    if (phase === 'tunnelEntry' && near(S11_FINISH, CFG.campaign.stage11.interactionRange)) {
        interactionT += dt;
        if (interactionT >= .75 && stage11DialogueIdle()) finishStage();
    } else interactionT = 0;
}

function finishStage() {
    if (transitionCommitted) return;
    transitionCommitted = true; complete = true; phase = 'complete';
    clearStage11Strikes(); resetStage11Dialogue(); cleanupCine();
    beginStageTransition(stage12Scene);
}

export const stage11Scene = {
    id: 'campaign-11', lightsKey: STAGE11_LIGHTS_KEY,
    enter() {
        saveCampaignStage(11); const r = ensureWorld(scene); buildStage11SensorGrid(r);
        setActiveCampaignWorldRoots(STAGE11_LIGHTS_KEY);
        setActiveStageLights(STAGE11_LIGHTS_KEY); applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x38443b, fogColor: 0x303b32, fogNear: 150, fogFar: 1200 });
        clearStage11Robots(); resetCrates(); resetBarrels(); resetStage();
        spawnNextWave('forest'); placeSupplies();
        camera.position.set(S11_START.x, CFG.player.eyeHeight, S11_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening(); updateUI();
    },
    exit() {
        clearStage11Strikes(); resetStage11Dialogue(); hideStageRadioDialogue();
        hideDownloadBar(); cleanupCine();
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) {
        elapsed += dt; updateStage11Dialogue(dt);
        updateStage11WorldVisuals(dt, camera.position.x, camera.position.z);
        if (cine) updateOpening(dt);
        const sensorEnabled = !cine && phases.indexOf(phase) >= phases.indexOf('scanBelt')
            && phase !== 'tunnelEntry' && phase !== 'complete';
        updateStage11SensorGrid(dt, sensorEnabled);
        if (!cine && !complete) updateProgression(dt);
        updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage11Walk, pos, oldX, oldZ, player.radius);
        stage11Resolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage11Walk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage11GroundHeight,
    get camOffset() { return cine ? cineCam : PLAY_CAM; },
    bulletBlocked(b) {
        return stage11SegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z, true);
    },
    blastBlocked(x0, z0, x1, z1) { return stage11SegBlocked(x0, z0, x1, z1, false); },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11Walk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -.4; g.vz *= -.4;
        }
        stage11Resolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        return campaignRobotAI(bot, dt, step, {
            walkable: stage11Walk, resolve: stage11Resolve, nav: stage11Nav(),
            los: (x0, z0, x1, z1) => !stage11SegBlocked(x0, z0, x1, z1, true),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage11Walk, resolve: stage11Resolve });
    },
    clampDropPos(x, z) { return stage11Walk(x, z, 2) ? [x, z] : [S11_START.x, S11_START.z]; },
    hudStatus() {
        const s = stage11ScanDebug();
        const scan = s.state === 'CLEAR' ? '' : ` | ${s.state} ${Math.round(s.exposureFraction * 100)}%`;
        return `THE GREEN FIREWALL — ${phase.toUpperCase()} | Robots: ${countStageRobots(11)}${scan}`;
    },
    radarLandmarks(plot) {
        const target = phase === 'forestApproach' ? S11_SENSOR_ENTRY
            : phase === 'scanBelt' ? S11_SHELTER
                : phase === 'waterworks' ? S11_WATERWORKS : S11_FINISH;
        plot(target.x - camera.position.x, target.z - camera.position.z, '#ffb03b', 5, true);
        const scan = stage11ScanDebug();
        if (scan.footprint?.visible)
            plot(scan.footprint.x - camera.position.x, -camera.position.z, '#b3402e', 4, true);
    },
};

export const stage11WorldDebugFull = () => stage11WorldDebug();
export const stage11Debug = () => ({
    phase, complete, elapsed, cine: cine && { ...cine }, transitionCommitted,
    objective: stage11Scene.hudStatus(), robots: countStageRobots(11),
    activeRobots: robots.reduce((n, r) => n + (r.stage === 11 && r.state !== 'idle' ? 1 : 0), 0),
    finishEligible: phase === 'tunnelEntry' && stage11DialogueIdle(),
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
    dialogue: stage11DialogueDebug(), scan: stage11ScanDebug(), world: stage11WorldDebug(),
});
