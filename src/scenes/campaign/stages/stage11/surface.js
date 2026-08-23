// Stage 11 Chapter A — IKN civic-axis surface controller.

import { CFG } from '../../../../core/config.js';
import { player, keys, setCinematicActive } from '../../../../core/state.js';
import { camera, setCineFocus, CAM_OFF_DEFAULT } from '../../../../core/renderer.js';
import { showStageMsg, setCineBars, setCineFade, showCutsceneSkip,
    hideCutsceneSkip } from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import { spawnBarrel, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { campaignRobotAI, campaignClampRobot, countStageRobots } from '../../utility/common.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights } from '../../../../world/lighting.js';
import { slideWalk } from '../../../../utils/collision.js';
import {
    STAGE11_SURFACE_LIGHTS_KEY, S11_SURFACE_START, S11_AXIS_GATE,
    S11_ROOT_COURT, S11_DESCENT, stage11SurfaceWalk, stage11SurfaceResolve,
    stage11SurfaceSegBlocked, stage11SurfaceGroundHeight, stage11SurfaceNav,
    resetStage11SurfaceVisuals, updateStage11SurfaceVisuals,
    setStage11DescentOpen, stage11SurfaceWorldDebug,
} from './surfaceWorld.js';
import {
    phase, complete, setStage11Phase, enterStage11Sub,
    queueStage11Dialogue, stage11DialogueIdle, resetStage11Dialogue,
    makeStage11WaveQueue, spawnStage11Batch, stage11BatchAlive,
    stage11WaveQueueDebug,
} from './runtime.js';
import { rootScene } from './root.js';

const cineCam = { ...CAM_OFF_DEFAULT };
let cine = null;
let elapsed = 0;
let waveQueue = null;
let encounterRecords = [];
let descentCommitted = false;
let axisLineWarned = false;

function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }

export function resetSurface() {
    cine = null; elapsed = 0;
    waveQueue = makeStage11WaveQueue(CFG.campaign.stage11.encounters.civicAxis);
    encounterRecords = []; descentCommitted = false; axisLineWarned = false;
    resetStage11SurfaceVisuals();
}

function batchPoints(index) {
    const x = 390620 - index * 240;
    return [
        { x, z: -112 }, { x: x - 42, z: 96 },
        { x: x - 86, z: -38 }, { x: x + 25, z: 155 },
    ];
}
function nextGateX() { return 390690 - (waveQueue.cursor + 1) * 240; }
function spawnNextBatch() {
    const index = waveQueue.cursor + 1;
    const rec = spawnStage11Batch(waveQueue, batchPoints(index), 'surface');
    encounterRecords.push(...rec);
    if (rec.length && !axisLineWarned) {
        axisLineWarned = true; queueStage11Dialogue('lastFormation');
    }
    return rec.length > 0;
}
function currentCleared() {
    return waveQueue.cursor < 0 || stage11BatchAlive('surface', waveQueue.cursor) === 0;
}
function allConfiguredSpawned() { return waveQueue.spawnedTotal >= waveQueue.configuredTotal; }

function placeItems() {
    const C = CFG.campaign.stage11;
    for (let i = 0; i < Math.max(0, C.lootboxCount | 0); i++) {
        const t = (i + .5) / Math.max(1, C.lootboxCount);
        spawnCrate(390610 - t * 1080, i % 2 ? 152 : -128, 0);
    }
    for (let i = 0; i < Math.max(0, C.barrelCount | 0); i++) {
        const t = (i + .5) / Math.max(1, C.barrelCount);
        spawnBarrel(390610 - t * 1040, i % 2 ? 88 : -62, 0);
    }
    spawnAmmoDrop(S11_ROOT_COURT.x + 75, S11_ROOT_COURT.z - 45, 'rifle', 1e9);
    spawnAmmoDrop(S11_ROOT_COURT.x + 55, S11_ROOT_COURT.z - 45, 'pistol', 1e9);
    spawnMedkitDrop(S11_ROOT_COURT.x + 35, S11_ROOT_COURT.z - 45, 1e9);
}

function cleanupOpening() {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, CFG.campaign.stage11.fadeSec); setCinematicActive(false);
}
function finishOpening(skipped = false) {
    if (skipped) resetStage11Dialogue();
    cleanupOpening(); setStage11Phase('axisAssault');
    showStageMsg('ADVANCE ALONG THE CIVIC AXIS', 4400);
}
function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { t: 0, dialogue: false };
    cineCam.x = 140; cineCam.y = 178; cineCam.z = 142;
    setCineFocus(S11_AXIS_GATE.x, S11_AXIS_GATE.z, true);
    showCutsceneSkip(() => finishOpening(true));
}
function updateOpening(dt) {
    cine.t += dt;
    if (!cine.dialogue) {
        cine.dialogue = true; queueStage11Dialogue('surfaceReveal');
        queueStage11Dialogue('rootBelow');
    }
    if (cine.t >= CFG.campaign.stage11.openingMinSec && stage11DialogueIdle()) finishOpening(false);
}

function descend() {
    if (descentCommitted) return;
    descentCommitted = true; setStage11Phase('descend');
    setCineFade(1, CFG.campaign.stage11.fadeSec);
    enterStage11Sub(rootScene, { fade: true });
}

function updateProgress() {
    if (phase === 'axisAssault' && currentCleared() && !allConfiguredSpawned()
        && camera.position.x <= nextGateX()) spawnNextBatch();
    if (phase === 'axisAssault' && allConfiguredSpawned() && currentCleared()) {
        setStage11Phase('rootApproach'); setStage11DescentOpen(true);
        showStageMsg('CIVIC DEFENSE BROKEN — REACH ROOT ACCESS', 4400);
    }
    if (phase === 'rootApproach' && near(S11_DESCENT, CFG.campaign.stage11.interactionRange))
        descend();
}

export const surfaceScene = {
    id: 'campaign-11-surface',
    enter() {
        setActiveCampaignWorldRoots(STAGE11_SURFACE_LIGHTS_KEY);
        setActiveStageLights(STAGE11_SURFACE_LIGHTS_KEY);
        resetSurface(); placeItems(); setStage11Phase('opening');
        camera.position.set(S11_SURFACE_START.x, CFG.player.eyeHeight, S11_SURFACE_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening();
    },
    exit() { cleanupOpening(); },
    updateMode(dt) {
        elapsed += dt;
        updateStage11SurfaceVisuals(dt);
        if (cine) updateOpening(dt);
        else if (!complete) updateProgress();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage11SurfaceWalk, pos, oldX, oldZ, player.radius);
        stage11SurfaceResolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage11SurfaceWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage11SurfaceGroundHeight,
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        return stage11SurfaceSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage11SurfaceSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11SurfaceWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ; g.vx *= -.4; g.vz *= -.4;
        }
        stage11SurfaceResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        return campaignRobotAI(bot, dt, step, {
            walkable: stage11SurfaceWalk, resolve: stage11SurfaceResolve,
            nav: stage11SurfaceNav(),
            los: (x0, z0, x1, z1) => !stage11SurfaceSegBlocked(x0, z0, x1, z1),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage11SurfaceWalk, resolve: stage11SurfaceResolve });
    },
    clampDropPos(x, z) {
        return stage11SurfaceWalk(x, z, 2) ? [x, z] : [S11_SURFACE_START.x, S11_SURFACE_START.z];
    },
    hudStatus() {
        if (phase === 'opening') return 'NUSANTARA ROOT — CIVIC AXIS';
        if (phase === 'rootApproach') return 'ROOT ACCESS OPEN — REACH THE DESCENT';
        return `BREAK THE LAST FORMATION | Robots: ${countStageRobots(11)}`;
    },
    radarLandmarks(plot) {
        const p = phase === 'rootApproach' ? S11_DESCENT : S11_ROOT_COURT;
        plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const surfaceDebug = () => ({
    elapsed, cinematic: !!cine, descentCommitted,
    waveQueue: stage11WaveQueueDebug(waveQueue),
    encounterRecords: encounterRecords.map(x => ({ ...x })),
    currentAlive: waveQueue && waveQueue.cursor >= 0
        ? stage11BatchAlive('surface', waveQueue.cursor) : 0,
    world: stage11SurfaceWorldDebug(),
});

