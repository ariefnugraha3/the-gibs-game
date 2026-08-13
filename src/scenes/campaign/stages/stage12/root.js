// Stage 12 Chapter B — root transmitter, monotonic upload and Warden battle.

import { CFG } from '../../../../core/config.js';
import { player, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera } from '../../../../core/renderer.js';
import {
    showStageMsg, showDownloadBar, setDownloadProgress, hideDownloadBar,
    setBossHud, hideBossHud, setCineFade, setCineBars,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { resetCrates, resolveCrateBlock } from '../../../../entities/crates.js';
import { resetBarrels, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop, spawnLoot } from '../../../../entities/drops.js';
import { campaignRobotAI, campaignClampRobot, countStageRobots } from '../../utility/common.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights, applyLightPreset } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import {
    activateNusantaraWarden, resetNusantaraWarden, updateNusantaraWarden,
    cleanupNusantaraWarden, resolveNusantaraWardenBlock,
    nusantaraWardenBulletHit, nusantaraWardenIsJamming,
    nusantaraWardenDead, nusantaraWardenWrecked, nusantaraWardenDebug,
} from '../../../../entities/nusantaraWarden.js';
import {
    STAGE12_ROOT_LIGHTS_KEY, S12_ROOT_START, S12_AUTHORITY_GATE, S12_INSERT,
    S12_ARENA, S12_WARDEN_HOME, stage12RootWalk, stage12RootResolve,
    stage12RootSegBlocked, stage12RootGroundHeight, stage12RootNav,
    setStage12AuthorityDoor, setStage12InsertMarker,
    updateStage12RootVisuals, resetStage12RootVisuals, stage12RootWorldDebug,
} from './rootWorld.js';
import {
    phase, complete, setStage12Phase, setStage12Complete,
    queueStage12Dialogue, stage12DialogueIdle,
    clearStage12Robots, makeStage12WaveQueue, spawnStage12Batch,
    stage12BatchAlive, stage12WaveQueueDebug, invokeStage12Completion,
} from './runtime.js';
import { getStage12Warden } from './index.js';

let elapsed = 0;
let waveQueue = null;
let encounterRecords = [];
let insertT = 0;
let uploadProgress = 0;
let previousUpload = 0;
let minObservedDelta = 0;
let uploadAccepted = false;
let wardenActivated = false;
let rewardDropped = false;
let endingQueued = false;
let completionInvoked = false;
let lastWardenPhase = 'dormant';
let jamFrames = 0;
let progressFrames = 0;

function W() { return getStage12Warden(); }
function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }

export function resetRoot() {
    elapsed = 0; insertT = 0; uploadProgress = 0; previousUpload = 0;
    minObservedDelta = 0; uploadAccepted = false; wardenActivated = false;
    rewardDropped = false; endingQueued = false; completionInvoked = false;
    lastWardenPhase = 'dormant'; jamFrames = 0; progressFrames = 0;
    waveQueue = makeStage12WaveQueue(CFG.campaign.stage12.encounters.rootApproach);
    encounterRecords = []; resetStage12RootVisuals(); hideBossHud(); hideDownloadBar();
    resetNusantaraWarden(W(), { active: false, x: S12_WARDEN_HOME.x,
        z: S12_WARDEN_HOME.z, home: S12_WARDEN_HOME, arena: S12_ARENA });
}

function batchPoints(index) {
    const x = 400510 - index * 70;
    return [
        { x, z: -65 }, { x: x - 25, z: 62 },
        { x: x - 48, z: -12 }, { x: x + 15, z: 22 },
    ];
}
function spawnNextBatch() {
    const index = waveQueue.cursor + 1;
    const rec = spawnStage12Batch(waveQueue, batchPoints(index), 'root');
    encounterRecords.push(...rec); return rec.length > 0;
}
function currentBatchClear() {
    return waveQueue.cursor < 0 || stage12BatchAlive('root', waveQueue.cursor) === 0;
}
function rootDefenseDone() {
    return waveQueue.spawnedTotal >= waveQueue.configuredTotal && currentBatchClear();
}

function placeRootSupplies() {
    // Guaranteed full current-weapon opportunity: permanent pickups can be
    // revisited before inserting the drive; no extra puzzle or attrition gate.
    for (const [dx, weapon] of [[65, 'rifle'], [45, 'pistol'], [25, 'shotgun'], [5, 'launcher']])
        spawnAmmoDrop(S12_INSERT.x + dx, S12_INSERT.z - 52, weapon, 1e9);
    spawnMedkitDrop(S12_INSERT.x + 85, S12_INSERT.z + 48, 1e9);
}

function wardenCallbacks() {
    return {
        onPhase(next) {
            lastWardenPhase = next;
            if (next === 'phase1' && phase === 'wardenIntro') setStage12Phase('wardenBattle');
            if (next === 'jam1') {
                queueStage12Dialogue('jamOne');
                showStageMsg('UPLOAD JAMMED — DESTROY THREE ANCHORED CAPACITORS', 4800);
            } else if (next === 'jam2') {
                queueStage12Dialogue('jamTwo');
                showStageMsg('WARDEN SEIZING ROOT — DESTROY THE COUPLINGS', 4800);
            }
        },
        onDeath() {
            setStage12Phase('wardenBattle');
            queueStage12Dialogue('wardenDown');
        },
    };
}

function beginUpload() {
    if (uploadAccepted) return;
    uploadAccepted = true; setStage12Phase('upload'); setStage12InsertMarker(false);
    queueStage12Dialogue('insertDrive'); queueStage12Dialogue('uploadAccepted');
    showDownloadBar('NATIONAL KILL-SWITCH BROADCAST'); setDownloadProgress(0);
    // Activation is immediate: the player never waits through a passive bar.
    activateNusantaraWarden(W(), wardenCallbacks()); wardenActivated = true;
    setStage12Phase('wardenIntro'); queueStage12Dialogue('wardenWake');
    setBossHud({ name: 'NUSANTARA WARDEN', hp: W().hp, maxHp: W().maxHp,
        secondaryLabel: 'UPLOAD', secondaryFraction: 0, state: 'ACTIVATING' });
}

function updateUpload(dt) {
    if (!uploadAccepted || completionInvoked) return;
    const w = W(), U = CFG.campaign.stage12.upload;
    const jammed = nusantaraWardenIsJamming(w);
    previousUpload = uploadProgress;
    if (nusantaraWardenWrecked(w)) {
        uploadProgress = Math.min(1, uploadProgress + U.finalRatePerSec * dt);
        progressFrames++;
    } else if (!jammed) {
        uploadProgress = Math.min(U.preBossFraction,
            uploadProgress + U.ratePerSec * dt);
        progressFrames++;
    } else jamFrames++;
    const delta = uploadProgress - previousUpload;
    minObservedDelta = Math.min(minObservedDelta, delta);
    setDownloadProgress(uploadProgress);
    updateStage12RootVisuals(dt, uploadProgress, jammed);
    if (wardenActivated && !nusantaraWardenWrecked(w)) {
        const wd = nusantaraWardenDebug(w);
        const targetState = wd.phase === 'jam1' ? 'JAMMED — CAPACITORS'
            : wd.phase === 'jam2' ? 'JAMMED — COUPLINGS'
                : wd.phase === 'death' ? 'COLLAPSING' : wd.phase.toUpperCase();
        setBossHud({ name: 'NUSANTARA WARDEN', hp: w.hp, maxHp: w.maxHp,
            secondaryLabel: jammed ? 'UPLOAD — JAMMED' : 'UPLOAD',
            secondaryFraction: uploadProgress, state: targetState });
    }
    if (nusantaraWardenWrecked(w) && !rewardDropped) {
        rewardDropped = true; spawnLoot(w.parts.group.position.x,
            w.parts.group.position.z, w.score, 8);
        hideBossHud(); setStage12Phase('broadcast');
    }
    if (uploadProgress >= 1 && !endingQueued) {
        endingQueued = true; hideDownloadBar(); setStage12Phase('anomaly');
        queueStage12Dialogue('networkSilent'); queueStage12Dialogue('anomaly');
        queueStage12Dialogue('mahapatihReveal'); queueStage12Dialogue('jakartaCoordinate');
        queueStage12Dialogue('returnVow');
        showStageMsg('NATIONAL NETWORK DECOMMISSIONED', 4800);
    }
    if (endingQueued && stage12DialogueIdle() && !completionInvoked) {
        completionInvoked = true; setStage12Complete(true); setStage12Phase('complete');
        clearStage12Robots(); cleanupNusantaraWarden(w, false); hideBossHud(); hideDownloadBar();
        invokeStage12Completion({ stage: 12, uploadProgress, warden: nusantaraWardenDebug(w) });
    }
}

function updateAuthorityGate(dt) {
    if (phase === 'authorityGate') {
        if (currentBatchClear() && waveQueue.spawnedTotal < waveQueue.configuredTotal)
            spawnNextBatch();
        if (rootDefenseDone()) {
            setStage12AuthorityDoor(true); setStage12InsertMarker(true);
            setStage12Phase('insertDrive'); queueStage12Dialogue('authorityDenied');
            showStageMsg('AUTHORITY GATE CLEAR — INSERT THE PHYSICAL DRIVE', 4500);
        }
        return;
    }
    if (phase === 'insertDrive') {
        if (near(S12_INSERT, CFG.campaign.stage12.interactionRange)) {
            insertT += dt;
            if (insertT >= .9) beginUpload();
        } else insertT = 0;
    }
}

export const rootScene = {
    id: 'campaign-12-root',
    enter() {
        setActiveCampaignWorldRoots(STAGE12_ROOT_LIGHTS_KEY);
        setActiveStageLights(STAGE12_ROOT_LIGHTS_KEY);
        applyLightPreset(scene, 'indoor');
        enterCityEnv({ background: 0x171814, fogColor: 0x24231f,
            fogNear: 80, fogFar: 900 });
        clearStage12Robots(); resetCrates(); resetBarrels(); resetRoot(); placeRootSupplies();
        setStage12Phase('authorityGate'); spawnNextBatch();
        camera.position.set(S12_ROOT_START.x, CFG.player.eyeHeight, S12_ROOT_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setCinematicActive(false); setCineBars(false);
        setCineFade(0, CFG.campaign.stage12.fadeSec);
        showStageMsg('REACH THE PHYSICAL ROOT CONSOLE', 4300);
    },
    exit() {
        cleanupNusantaraWarden(W(), false); hideBossHud(); hideDownloadBar();
        setStage12InsertMarker(false);
    },
    updateMode(dt) {
        elapsed += dt; updateAuthorityGate(dt);
        const w = W();
        updateNusantaraWarden(w, dt, { arena: S12_ARENA,
            allowAttack: phase === 'wardenBattle' });
        updateUpload(dt);
        updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage12RootWalk, pos, oldX, oldZ, player.radius);
        stage12RootResolve(pos, player.radius, feetY);
        resolveNusantaraWardenBlock(W(), pos, player.radius);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage12RootWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage12RootGroundHeight,
    bulletBlocked(b) {
        // Boss/weak-point swept hit test must run before chamber structure so a
        // valid target aligned with the transmitter never becomes a wall hit.
        if (nusantaraWardenBulletHit(W(), b)) return true;
        return stage12RootSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage12RootSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage12RootWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ; g.vx *= -.4; g.vz *= -.4;
        }
        stage12RootResolve(g.mesh.position, 2, 0);
        resolveNusantaraWardenBlock(W(), g.mesh.position, 2);
    },
    robotAI(bot, dt, step) {
        return campaignRobotAI(bot, dt, step, {
            walkable: stage12RootWalk, resolve: stage12RootResolve,
            nav: stage12RootNav(),
            los: (x0, z0, x1, z1) => !stage12RootSegBlocked(x0, z0, x1, z1),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage12RootWalk, resolve: stage12RootResolve });
    },
    clampDropPos(x, z) { return stage12RootWalk(x, z, 2) ? [x, z] : [S12_ROOT_START.x, 0]; },
    hudStatus() {
        if (phase === 'authorityGate') return `CLEAR THE AUTHORITY THRESHOLD | Robots: ${countStageRobots(12)}`;
        if (phase === 'insertDrive') return 'INSERT THE KILL-SWITCH DRIVE';
        if (phase === 'wardenBattle' || phase === 'wardenIntro') {
            const wd = nusantaraWardenDebug(W());
            if (wd.phase === 'jam1') return 'UPLOAD JAMMED — DESTROY THREE CAPACITORS';
            if (wd.phase === 'jam2') return 'WARDEN SEIZING ROOT — DESTROY THE COUPLINGS';
            return `DESTROY THE NUSANTARA WARDEN | UPLOAD ${Math.round(uploadProgress * 100)}%`;
        }
        if (phase === 'broadcast') return `NATIONAL BROADCAST — ${Math.round(uploadProgress * 100)}%`;
        if (phase === 'anomaly') return 'BROADCAST COMPLETE — SOVEREIGN ANOMALY DETECTED';
        if (phase === 'complete') return 'STAGE 12 COMPLETE — JAKARTA COORDINATE LOCKED';
        return `KILL-SWITCH UPLOAD — ${Math.round(uploadProgress * 100)}%`;
    },
    radarLandmarks(plot) {
        const marks = phase === 'authorityGate' ? [S12_AUTHORITY_GATE]
            : phase === 'insertDrive' ? [S12_INSERT] : [];
        const wd = nusantaraWardenDebug(W());
        if (wd.active && !wd.deathDone && wd.position) marks.push(wd.position);
        for (const p of marks)
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const rootDebug = () => ({
    elapsed, uploadProgress, previousUpload, minObservedDelta,
    uploadAccepted, monotonic: minObservedDelta >= -1e-9,
    clampWhileAlive: CFG.campaign.stage12.upload.preBossFraction,
    jammed: nusantaraWardenIsJamming(W()), jamFrames, progressFrames,
    wardenActivated, rewardDropped, endingQueued, completionInvoked,
    lastWardenPhase, waveQueue: stage12WaveQueueDebug(waveQueue),
    currentAlive: waveQueue && waveQueue.cursor >= 0
        ? stage12BatchAlive('root', waveQueue.cursor) : 0,
    encounters: encounterRecords.map(x => ({ ...x })),
    warden: nusantaraWardenDebug(W()), world: stage12RootWorldDebug(),
});
