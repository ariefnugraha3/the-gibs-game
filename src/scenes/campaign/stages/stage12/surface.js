// Stage 12 Chapter A — IKN civic-axis surface controller.

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
    STAGE12_SURFACE_LIGHTS_KEY, S12_SURFACE_START, S12_AXIS_GATE,
    S12_ROOT_COURT, S12_DESCENT, stage12SurfaceWalk, stage12SurfaceResolve,
    stage12SurfaceSegBlocked, stage12SurfaceGroundHeight, stage12SurfaceNav,
    resetStage12SurfaceVisuals, setStage12DescentOpen, stage12SurfaceWorldDebug,
} from './surfaceWorld.js';
import {
    phase, complete, setStage12Phase, enterStage12Sub,
    queueStage12Dialogue, stage12DialogueIdle, resetStage12Dialogue,
    makeStage12WaveQueue, spawnStage12Batch, stage12BatchAlive,
    stage12WaveQueueDebug,
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
    waveQueue = makeStage12WaveQueue(CFG.campaign.stage12.encounters.civicAxis);
    encounterRecords = []; descentCommitted = false; axisLineWarned = false;
    resetStage12SurfaceVisuals();
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
    const rec = spawnStage12Batch(waveQueue, batchPoints(index), 'surface');
    encounterRecords.push(...rec);
    if (rec.length && !axisLineWarned) {
        axisLineWarned = true; queueStage12Dialogue('lastFormation');
    }
    return rec.length > 0;
}
function currentCleared() {
    return waveQueue.cursor < 0 || stage12BatchAlive('surface', waveQueue.cursor) === 0;
}
function allConfiguredSpawned() { return waveQueue.spawnedTotal >= waveQueue.configuredTotal; }

function placeItems() {
    const C = CFG.campaign.stage12;
    for (let i = 0; i < Math.max(0, C.lootboxCount | 0); i++) {
        const t = (i + .5) / Math.max(1, C.lootboxCount);
        spawnCrate(390610 - t * 1080, i % 2 ? 152 : -128, 0);
    }
    for (let i = 0; i < Math.max(0, C.barrelCount | 0); i++) {
        const t = (i + .5) / Math.max(1, C.barrelCount);
        spawnBarrel(390610 - t * 1040, i % 2 ? 88 : -62, 0);
    }
    spawnAmmoDrop(S12_ROOT_COURT.x + 75, S12_ROOT_COURT.z - 45, 'rifle', 1e9);
    spawnAmmoDrop(S12_ROOT_COURT.x + 55, S12_ROOT_COURT.z - 45, 'pistol', 1e9);
    spawnMedkitDrop(S12_ROOT_COURT.x + 35, S12_ROOT_COURT.z - 45, 1e9);
}

function cleanupOpening() {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, CFG.campaign.stage12.fadeSec); setCinematicActive(false);
}
function finishOpening(skipped = false) {
    if (skipped) resetStage12Dialogue();
    cleanupOpening(); setStage12Phase('axisAssault');
    showStageMsg('ADVANCE ALONG THE CIVIC AXIS', 4400);
}
function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { t: 0, dialogue: false };
    cineCam.x = 140; cineCam.y = 178; cineCam.z = 142;
    setCineFocus(S12_AXIS_GATE.x, S12_AXIS_GATE.z, true);
    showCutsceneSkip(() => finishOpening(true));
}
function updateOpening(dt) {
    cine.t += dt;
    if (!cine.dialogue) {
        cine.dialogue = true; queueStage12Dialogue('surfaceReveal');
        queueStage12Dialogue('rootBelow');
    }
    if (cine.t >= CFG.campaign.stage12.openingMinSec && stage12DialogueIdle()) finishOpening(false);
}

function descend() {
    if (descentCommitted) return;
    descentCommitted = true; setStage12Phase('descend');
    setCineFade(1, CFG.campaign.stage12.fadeSec);
    enterStage12Sub(rootScene, { fade: true });
}

function updateProgress() {
    if (phase === 'axisAssault' && currentCleared() && !allConfiguredSpawned()
        && camera.position.x <= nextGateX()) spawnNextBatch();
    if (phase === 'axisAssault' && allConfiguredSpawned() && currentCleared()) {
        setStage12Phase('rootApproach'); setStage12DescentOpen(true);
        showStageMsg('CIVIC DEFENSE BROKEN — REACH ROOT ACCESS', 4400);
    }
    if (phase === 'rootApproach' && near(S12_DESCENT, CFG.campaign.stage12.interactionRange))
        descend();
}

export const surfaceScene = {
    id: 'campaign-12-surface',
    enter() {
        setActiveCampaignWorldRoots(STAGE12_SURFACE_LIGHTS_KEY);
        setActiveStageLights(STAGE12_SURFACE_LIGHTS_KEY);
        resetSurface(); placeItems(); setStage12Phase('opening');
        camera.position.set(S12_SURFACE_START.x, CFG.player.eyeHeight, S12_SURFACE_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening();
    },
    exit() { cleanupOpening(); },
    updateMode(dt) {
        elapsed += dt;
        if (cine) updateOpening(dt);
        else if (!complete) updateProgress();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage12SurfaceWalk, pos, oldX, oldZ, player.radius);
        stage12SurfaceResolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage12SurfaceWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage12SurfaceGroundHeight,
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        return stage12SurfaceSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage12SurfaceSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage12SurfaceWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ; g.vx *= -.4; g.vz *= -.4;
        }
        stage12SurfaceResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        return campaignRobotAI(bot, dt, step, {
            walkable: stage12SurfaceWalk, resolve: stage12SurfaceResolve,
            nav: stage12SurfaceNav(),
            los: (x0, z0, x1, z1) => !stage12SurfaceSegBlocked(x0, z0, x1, z1),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage12SurfaceWalk, resolve: stage12SurfaceResolve });
    },
    clampDropPos(x, z) {
        return stage12SurfaceWalk(x, z, 2) ? [x, z] : [S12_SURFACE_START.x, S12_SURFACE_START.z];
    },
    hudStatus() {
        if (phase === 'opening') return 'NUSANTARA ROOT — CIVIC AXIS';
        if (phase === 'rootApproach') return 'ROOT ACCESS OPEN — REACH THE DESCENT';
        return `BREAK THE LAST FORMATION | Robots: ${countStageRobots(12)}`;
    },
    radarLandmarks(plot) {
        const p = phase === 'rootApproach' ? S12_DESCENT : S12_ROOT_COURT;
        plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const surfaceDebug = () => ({
    elapsed, cinematic: !!cine, descentCommitted,
    waveQueue: stage12WaveQueueDebug(waveQueue),
    encounterRecords: encounterRecords.map(x => ({ ...x })),
    currentAlive: waveQueue && waveQueue.cursor >= 0
        ? stage12BatchAlive('surface', waveQueue.cursor) : 0,
    world: stage12SurfaceWorldDebug(),
});

