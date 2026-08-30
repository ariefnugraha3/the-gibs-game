// Stage 11 Chapter A — IKN civic-axis surface controller.

import { CFG } from '../../../../core/config.js';
import { player, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus } from '../../../../core/renderer.js';
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
import { applyLightPreset } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import {
    STAGE11_SURFACE_LIGHTS_KEY, S11_SURFACE_START, S11_AXIS_GATE,
    S11_ROOT_COURT, S11_DESCENT, stage11SurfaceWalk, stage11SurfaceResolve,
    stage11SurfaceSegBlocked, stage11SurfaceGroundHeight, stage11SurfaceNav,
    resetStage11SurfaceVisuals, updateStage11SurfaceVisuals,
    setStage11DescentOpen, setStage11SurfaceLockdown,
    stage11SurfaceTerraceHeight, stage11SurfaceWorldDebug,
} from './surfaceWorld.js';
import {
    resetStage11SurfaceAuthority, updateStage11SurfaceAuthority,
    stage11SurfacePylonBulletHit, stage11AuthorityAllDown,
    stage11AuthorityTarget, stage11AuthorityLockdownX,
    stage11AuthoritySegment, stage11SurfaceAuthorityDebug,
} from './surfaceAuthority.js';
import {
    resetStage11SurfaceScan, updateStage11SurfaceScan,
    stage11SurfaceScanDebug,
} from './surfaceScan.js';
import {
    phase, complete, setStage11Phase, enterStage11Sub,
    queueStage11Dialogue, stage11DialogueIdle, clearStage11DialogueQueue,
    makeStage11WaveQueue, spawnStage11Batch, stage11BatchAlive,
    stage11WaveQueueDebug,
} from './runtime.js';
import { rootScene } from './root.js';
import {
    STAGE11_CHAPTER_CAMERA, stage11ChapterScreenDirection,
} from './chapterCamera.js';

const cineCam = { ...STAGE11_CHAPTER_CAMERA };
let cine = null;
let elapsed = 0;
let waveQueue = null;
let pylonQueues = [];
let encounterRecords = [];
let descentCommitted = false;
let axisLineWarned = false;

function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }
function syncRobotToTerrace(bot) {
    const y = stage11SurfaceTerraceHeight(bot.mesh.position.z);
    bot.baseY = y; bot.groundY = y;
    if (!bot.machineBirth) bot.mesh.position.y = y;
}

export function resetSurface() {
    cine = null; elapsed = 0;
    // One configured formation PER PYLON. `encounters.civicAxis` already holds
    // exactly three waves, so the split is derived rather than re-authored --
    // and it replaces a single flat queue whose last batch held ONE robot,
    // which made the final fight before the Warden a lone class C.
    const waves = CFG.campaign.stage11.encounters.civicAxis;
    pylonQueues = waves.map(w => makeStage11WaveQueue(w));
    waveQueue = pylonQueues[0];
    encounterRecords = []; descentCommitted = false; axisLineWarned = false;
    resetStage11SurfaceVisuals(); resetStage11SurfaceAuthority();
    resetStage11SurfaceScan();
    setStage11SurfaceLockdown(stage11AuthorityLockdownX());
}

// Defenders stand AROUND their own pylon on both sides of it, so the fight
// happens at the objective instead of in the middle of an empty lane.
function batchPoints(pylon, index) {
    const s = pylon.z >= 0 ? 1 : -1;
    return [
        { x: pylon.x - 60, z: pylon.z - s * 46 },
        { x: pylon.x + 66, z: pylon.z - s * 18 },
        { x: pylon.x - 18, z: pylon.z + s * 40 },
        { x: pylon.x + 24, z: pylon.z * .35 - s * (60 + index * 12) },
    ];
}
function activeQueue() {
    const target = stage11AuthorityTarget();
    return target ? pylonQueues[target.index] : null;
}
function spawnNextBatch() {
    const target = stage11AuthorityTarget();
    const q = target && pylonQueues[target.index];
    if (!q) return false;
    const index = q.cursor + 1;
    const rec = spawnStage11Batch(q, batchPoints(target, index),
        `surface-${target.index}`);
    encounterRecords.push(...rec);
    if (rec.length && !axisLineWarned) {
        axisLineWarned = true; queueStage11Dialogue('lastFormation');
    }
    waveQueue = q;
    return rec.length > 0;
}
function currentCleared() {
    const target = stage11AuthorityTarget();
    const q = target && pylonQueues[target.index];
    if (!q) return true;
    return q.cursor < 0
        || stage11BatchAlive(`surface-${target.index}`, q.cursor) === 0;
}
function allConfiguredSpawned() {
    const q = activeQueue();
    return !q || q.spawnedTotal >= q.configuredTotal;
}

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
    if (skipped) clearStage11DialogueQueue();
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
    if (phase === 'axisAssault') {
        const target = stage11AuthorityTarget();
        // A pylon's defenders arrive in bounded batches as the player closes on
        // it, so the objective is always defended and never a lone straggler.
        if (target && !allConfiguredSpawned() && currentCleared()
            && camera.position.x <= target.x + 320) spawnNextBatch();
        if (stage11AuthorityAllDown()) {
            setStage11Phase('rootApproach'); setStage11DescentOpen(true);
            showStageMsg('CIVIC DEFENSE BROKEN — REACH ROOT ACCESS', 4400);
        }
    }
    if (phase === 'rootApproach' && near(S11_DESCENT, CFG.campaign.stage11.interactionRange))
        descend();
}

export const surfaceScene = {
    id: 'campaign-11-surface',
    enter() {
        setActiveCampaignWorldRoots(STAGE11_SURFACE_LIGHTS_KEY);
        setActiveStageLights(STAGE11_SURFACE_LIGHTS_KEY);
        applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x778178, fogColor: 0x68736a,
            fogNear: 190, fogFar: 1700 });
        resetSurface(); placeItems(); setStage11Phase('opening');
        camera.position.set(S11_SURFACE_START.x, CFG.player.eyeHeight, S11_SURFACE_START.z);
        // Face into the civic axis on the first frame. Mouse aim takes over
        // immediately, but the handoff no longer presents Gibran backwards.
        camera.quaternion.set(0, 0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening();
    },
    exit() { cleanupOpening(); },
    updateMode(dt) {
        elapsed += dt;
        updateStage11SurfaceVisuals(dt);
        updateStage11SurfaceAuthority(dt, elapsed);
        // The axis seals behind the player only as pylons fall, so the walk
        // boundary follows the curtain that is actually drawn on that line.
        setStage11SurfaceLockdown(stage11AuthorityLockdownX());
        // The Warden only sweeps while the player has real control and there is
        // still an objective: no shell during a cutscene, none after the fight.
        updateStage11SurfaceScan(dt, {
            live: !cine && !complete && phase === 'axisAssault',
            segment: stage11AuthoritySegment(),
        });
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
    // Keep the opening's southeast azimuth after the cinematic: the route to
    // root access must continue visually toward screen upper-left.
    get camOffset() { return cine ? cineCam : STAGE11_CHAPTER_CAMERA; },
    bulletBlocked(b) {
        // Pylon hit test FIRST: its shaft is also a bullet-stopping blocker, so
        // sweeping the walls first would delete the round as a wall hit without
        // ever damaging the objective (the Stage 6 HQ ordering rule).
        return stage11SurfacePylonBulletHit(b)
            || stage11SurfaceSegBlocked(b.px, b.pz,
                b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage11SurfaceSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11SurfaceWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ; g.vx *= -.4; g.vz *= -.4;
        }
        stage11SurfaceResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        // The plaza is no longer flat, so a robot's own ground follows the
        // terrace exactly as the player's does. `campaignRobotAI` pins
        // `groundY = 0` on the idle->chasing transition, so this has to run
        // BEFORE it every frame (the Stage 7 road pattern).
        syncRobotToTerrace(bot);
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
        // Third element is the surface height, so loot dropped on the bank sits
        // on the bank instead of sinking to the plaza below it.
        return stage11SurfaceWalk(x, z, 2)
            ? [x, z, stage11SurfaceTerraceHeight(z)]
            : [S11_SURFACE_START.x, S11_SURFACE_START.z,
                stage11SurfaceTerraceHeight(S11_SURFACE_START.z)];
    },
    hudStatus() {
        if (phase === 'opening') return 'NUSANTARA ROOT — CIVIC AXIS';
        if (phase === 'rootApproach') return 'ROOT ACCESS OPEN — REACH THE DESCENT';
        const A = stage11SurfaceAuthorityDebug();
        const left = A.count - A.destroyed;
        const scan = stage11SurfaceScanDebug();
        const sweep = scan.armed
            ? (scan.playerInside && !scan.playerSheltered
                ? ' | SWEEP ON YOU — TAKE COVER' : ' | SWEEP ACTIVE') : '';
        return `AUTHORITY PYLONS ${left}/${A.count}${sweep}`
            + ` | Robots: ${countStageRobots(11)}`;
    },
    radarLandmarks(plot) {
        const target = stage11AuthorityTarget();
        const p = phase === 'rootApproach' ? S11_DESCENT
            : (target || S11_ROOT_COURT);
        plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const surfaceDebug = () => ({
    elapsed, cinematic: !!cine, descentCommitted,
    camera: { offset: { ...surfaceScene.camOffset }, corner: 'lower-right',
        progress: stage11ChapterScreenDirection(S11_SURFACE_START, S11_DESCENT) },
    waveQueue: stage11WaveQueueDebug(waveQueue),
    pylonQueues: pylonQueues.map(q => stage11WaveQueueDebug(q)),
    authority: stage11SurfaceAuthorityDebug(),
    suppression: stage11SurfaceScanDebug(),
    encounterRecords: encounterRecords.map(x => ({ ...x })),
    currentAlive: (() => {
        const target = stage11AuthorityTarget();
        const q = target && pylonQueues[target.index];
        return q && q.cursor >= 0
            ? stage11BatchAlive(`surface-${target.index}`, q.cursor) : 0;
    })(),
    world: stage11SurfaceWorldDebug(),
});

