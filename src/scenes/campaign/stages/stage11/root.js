// Stage 11 Chapter B — root transmitter, monotonic upload and Warden battle.

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
    STAGE11_ROOT_LIGHTS_KEY, S11_ROOT_START, S11_AUTHORITY_GATE, S11_INSERT,
    S11_INSERT_STAND,
    S11_ARENA, S11_WARDEN_HOME, stage11RootWalk, stage11RootResolve,
    stage11RootSegBlocked, stage11RootGroundHeight, stage11RootNav,
    setStage11AuthorityDoor, setStage11InsertMarker,
    updateStage11RootVisuals, updateStage11RootOccluders,
    resetStage11RootVisuals, stage11RootWorldDebug,
} from './rootWorld.js';
import {
    phase, complete, setStage11Phase, setStage11Complete,
    queueStage11Dialogue, stage11DialogueIdle,
    clearStage11Robots, makeStage11WaveQueue, spawnStage11Batch,
    stage11BatchAlive, stage11WaveQueueDebug, invokeStage11Completion,
} from './runtime.js';
import { getStage11Warden } from './index.js';

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

function W() { return getStage11Warden(); }
function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }

export function resetRoot() {
    elapsed = 0; insertT = 0; uploadProgress = 0; previousUpload = 0;
    minObservedDelta = 0; uploadAccepted = false; wardenActivated = false;
    rewardDropped = false; endingQueued = false; completionInvoked = false;
    lastWardenPhase = 'dormant'; jamFrames = 0; progressFrames = 0;
    waveQueue = makeStage11WaveQueue(CFG.campaign.stage11.encounters.rootApproach);
    encounterRecords = []; resetStage11RootVisuals(); hideBossHud(); hideDownloadBar();
    resetNusantaraWarden(W(), { active: false, x: S11_WARDEN_HOME.x,
        z: S11_WARDEN_HOME.z, home: S11_WARDEN_HOME, arena: S11_ARENA });
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
    const rec = spawnStage11Batch(waveQueue, batchPoints(index), 'root');
    encounterRecords.push(...rec); return rec.length > 0;
}
function currentBatchClear() {
    return waveQueue.cursor < 0 || stage11BatchAlive('root', waveQueue.cursor) === 0;
}
function rootDefenseDone() {
    return waveQueue.spawnedTotal >= waveQueue.configuredTotal && currentBatchClear();
}

function placeRootSupplies() {
    // Guaranteed full current-weapon opportunity: permanent pickups can be
    // revisited before inserting the drive; no extra puzzle or attrition gate.
    for (const [dx, weapon] of [[65, 'rifle'], [45, 'pistol'], [25, 'shotgun'], [5, 'launcher']])
        spawnAmmoDrop(S11_INSERT.x + dx, S11_INSERT.z - 52, weapon, 1e9);
    spawnMedkitDrop(S11_INSERT.x + 85, S11_INSERT.z + 48, 1e9);
}

function wardenCallbacks() {
    return {
        onPhase(next) {
            lastWardenPhase = next;
            if (next === 'phase1' && phase === 'wardenIntro') setStage11Phase('wardenBattle');
            if (next === 'jam1') {
                queueStage11Dialogue('jamOne');
                showStageMsg('UPLOAD JAMMED — DESTROY THREE ANCHORED CAPACITORS', 4800);
            } else if (next === 'jam2') {
                queueStage11Dialogue('jamTwo');
                showStageMsg('WARDEN SEIZING ROOT — DESTROY THE COUPLINGS', 4800);
            }
        },
        onDeath() {
            setStage11Phase('wardenBattle');
            queueStage11Dialogue('wardenDown');
        },
    };
}

function beginUpload() {
    if (uploadAccepted) return;
    uploadAccepted = true; setStage11Phase('upload'); setStage11InsertMarker(false);
    queueStage11Dialogue('insertDrive'); queueStage11Dialogue('uploadAccepted');
    showDownloadBar('NATIONAL KILL-SWITCH BROADCAST'); setDownloadProgress(0);
    // Activation is immediate: the player never waits through a passive bar.
    activateNusantaraWarden(W(), wardenCallbacks()); wardenActivated = true;
    setStage11Phase('wardenIntro'); queueStage11Dialogue('wardenWake');
    setBossHud({ name: 'NUSANTARA WARDEN', hp: W().hp, maxHp: W().maxHp,
        secondaryLabel: 'UPLOAD', secondaryFraction: 0, state: 'ACTIVATING' });
}

function updateUpload(dt) {
    if (!uploadAccepted || completionInvoked) return;
    const w = W(), U = CFG.campaign.stage11.upload;
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
    updateStage11RootVisuals(dt, uploadProgress, jammed);
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
        hideBossHud(); setStage11Phase('broadcast');
    }
    if (uploadProgress >= 1 && !endingQueued) {
        endingQueued = true; hideDownloadBar(); setStage11Phase('anomaly');
        queueStage11Dialogue('networkSilent'); queueStage11Dialogue('anomaly');
        queueStage11Dialogue('mahapatihReveal'); queueStage11Dialogue('jakartaCoordinate');
        queueStage11Dialogue('returnVow');
        showStageMsg('NATIONAL NETWORK DECOMMISSIONED', 4800);
    }
    if (endingQueued && stage11DialogueIdle() && !completionInvoked) {
        completionInvoked = true; setStage11Complete(true); setStage11Phase('complete');
        clearStage11Robots(); cleanupNusantaraWarden(w, false); hideBossHud(); hideDownloadBar();
        invokeStage11Completion({ stage: 11, uploadProgress, warden: nusantaraWardenDebug(w) });
    }
}

function updateAuthorityGate(dt) {
    if (phase === 'authorityGate') {
        if (currentBatchClear() && waveQueue.spawnedTotal < waveQueue.configuredTotal)
            spawnNextBatch();
        if (rootDefenseDone()) {
            setStage11AuthorityDoor(true); setStage11InsertMarker(true);
            setStage11Phase('insertDrive'); queueStage11Dialogue('authorityDenied');
            showStageMsg('AUTHORITY GATE CLEAR — INSERT THE PHYSICAL DRIVE', 4500);
        }
        return;
    }
    if (phase === 'insertDrive') {
        if (near(S11_INSERT_STAND, CFG.campaign.stage11.interactionRange)) {
            insertT += dt;
            if (insertT >= .9) beginUpload();
        } else insertT = 0;
    }
}

export const rootScene = {
    id: 'campaign-11-root',
    enter() {
        setActiveCampaignWorldRoots(STAGE11_ROOT_LIGHTS_KEY);
        setActiveStageLights(STAGE11_ROOT_LIGHTS_KEY);
        applyLightPreset(scene, 'indoor');
        enterCityEnv({ background: 0x171814, fogColor: 0x24231f,
            fogNear: 80, fogFar: 900 });
        clearStage11Robots(); resetCrates(); resetBarrels(); resetRoot(); placeRootSupplies();
        setStage11Phase('authorityGate'); spawnNextBatch();
        camera.position.set(S11_ROOT_START.x, CFG.player.eyeHeight, S11_ROOT_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setCinematicActive(false); setCineBars(false);
        setCineFade(0, CFG.campaign.stage11.fadeSec);
        showStageMsg('REACH THE PHYSICAL ROOT CONSOLE', 4300);
    },
    exit() {
        cleanupNusantaraWarden(W(), false); hideBossHud(); hideDownloadBar();
        setStage11InsertMarker(false);
    },
    updateMode(dt) {
        elapsed += dt; updateAuthorityGate(dt);
        updateStage11RootOccluders(dt);
        const w = W();
        updateNusantaraWarden(w, dt, { arena: S11_ARENA,
            allowAttack: phase === 'wardenBattle' });
        updateUpload(dt);
        updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage11RootWalk, pos, oldX, oldZ, player.radius);
        stage11RootResolve(pos, player.radius, feetY);
        resolveNusantaraWardenBlock(W(), pos, player.radius);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage11RootWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage11RootGroundHeight,
    bulletBlocked(b) {
        // Boss/weak-point swept hit test must run before chamber structure so a
        // valid target aligned with the transmitter never becomes a wall hit.
        if (nusantaraWardenBulletHit(W(), b)) return true;
        return stage11RootSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage11RootSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11RootWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ; g.vx *= -.4; g.vz *= -.4;
        }
        stage11RootResolve(g.mesh.position, 2, 0);
        resolveNusantaraWardenBlock(W(), g.mesh.position, 2);
    },
    robotAI(bot, dt, step) {
        return campaignRobotAI(bot, dt, step, {
            walkable: stage11RootWalk, resolve: stage11RootResolve,
            nav: stage11RootNav(),
            los: (x0, z0, x1, z1) => !stage11RootSegBlocked(x0, z0, x1, z1),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage11RootWalk, resolve: stage11RootResolve });
    },
    clampDropPos(x, z) { return stage11RootWalk(x, z, 2) ? [x, z] : [S11_ROOT_START.x, 0]; },
    hudStatus() {
        if (phase === 'authorityGate') return `CLEAR THE AUTHORITY THRESHOLD | Robots: ${countStageRobots(11)}`;
        if (phase === 'insertDrive') return 'INSERT THE KILL-SWITCH DRIVE';
        if (phase === 'wardenBattle' || phase === 'wardenIntro') {
            const wd = nusantaraWardenDebug(W());
            if (wd.phase === 'jam1') return 'UPLOAD JAMMED — DESTROY THREE CAPACITORS';
            if (wd.phase === 'jam2') return 'WARDEN SEIZING ROOT — DESTROY THE COUPLINGS';
            return `DESTROY THE NUSANTARA WARDEN | UPLOAD ${Math.round(uploadProgress * 100)}%`;
        }
        if (phase === 'broadcast') return `NATIONAL BROADCAST — ${Math.round(uploadProgress * 100)}%`;
        if (phase === 'anomaly') return 'BROADCAST COMPLETE — SOVEREIGN ANOMALY DETECTED';
        if (phase === 'complete') return 'STAGE 11 COMPLETE — JAKARTA COORDINATE LOCKED';
        return `KILL-SWITCH UPLOAD — ${Math.round(uploadProgress * 100)}%`;
    },
    radarLandmarks(plot) {
        const marks = phase === 'authorityGate' ? [S11_AUTHORITY_GATE]
            : phase === 'insertDrive' ? [S11_INSERT_STAND] : [];
        const wd = nusantaraWardenDebug(W());
        if (wd.active && !wd.deathDone && wd.position) marks.push(wd.position);
        for (const p of marks)
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const rootDebug = () => ({
    elapsed, uploadProgress, previousUpload, minObservedDelta,
    uploadAccepted, monotonic: minObservedDelta >= -1e-9,
    clampWhileAlive: CFG.campaign.stage11.upload.preBossFraction,
    jammed: nusantaraWardenIsJamming(W()), jamFrames, progressFrames,
    wardenActivated, rewardDropped, endingQueued, completionInvoked,
    lastWardenPhase, waveQueue: stage11WaveQueueDebug(waveQueue),
    currentAlive: waveQueue && waveQueue.cursor >= 0
        ? stage11BatchAlive('root', waveQueue.cursor) : 0,
    encounters: encounterRecords.map(x => ({ ...x })),
    warden: nusantaraWardenDebug(W()), world: stage11RootWorldDebug(),
});
