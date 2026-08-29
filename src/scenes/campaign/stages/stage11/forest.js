// Stage 11 Chapter 1 — Major Gibran parachutes into the forest outside IKN,
// clears the perimeter patrol and reaches the existing civic-axis chapter.

import { CFG } from '../../../../core/config.js';
import { player, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, CAM_OFF_DEFAULT } from '../../../../core/renderer.js';
import {
    showStageMsg, setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { avatarGroup, setAvatarRappel } from '../../../../entities/playerAvatar.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../../entities/crates.js';
import { spawnBarrel, resetBarrels, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { campaignRobotAI, campaignClampRobot, countStageRobots } from '../../utility/common.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights, applyLightPreset } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import {
    STAGE11_FOREST_LIGHTS_KEY, S11_FOREST_LANDING, S11_FOREST_GATE,
    S11_FOREST_ROUTE, stage11ForestWalk, stage11ForestResolve,
    stage11ForestSegBlocked, stage11ForestGroundHeight, stage11ForestNav,
    stage11ForestOnAsphalt, stage11ForestSpawnPoint,
    setStage11ParachutePose, setStage11ForestExitMarker,
    resetStage11ForestVisuals, updateStage11ForestVisuals,
    stage11ForestWorldDebug,
} from './forestWorld.js';
import {
    phase, complete, setStage11Phase, enterStage11Sub,
    queueStage11Dialogue, clearStage11DialogueQueue,
    clearStage11Robots, makeStage11WaveQueue, spawnStage11Batch,
    stage11BatchAlive, stage11WaveQueueDebug,
} from './runtime.js';
import { surfaceScene } from './surface.js';

const PARACHUTE_CAM = Object.freeze({ x: -92, y: 82, z: 104 });
let elapsed = 0, cine = null, waveQueue = null;
let encounterRecords = [], cityCommitted = false, landed = false;

function near(p, r) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r;
}
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function parachuteCfg() { return CFG.campaign.stage11.parachute; }

export function resetForest() {
    elapsed = 0; cine = null; cityCommitted = false; landed = false;
    waveQueue = makeStage11WaveQueue(CFG.campaign.stage11.encounters.forestApproach);
    encounterRecords = []; resetStage11ForestVisuals();
    setAvatarRappel(false);
}

function forestBatchPoints(index) {
    if (index <= 0) return [
        { x: 380465, z: 12 }, { x: 380410, z: 112 },
        { x: 380355, z: -72 }, { x: 380300, z: 26 },
    ];
    return [
        { x: 379835, z: -38 }, { x: 379765, z: -142 },
        { x: 379690, z: 10 }, { x: 379610, z: -55 },
    ];
}
function spawnNextBatch() {
    const index = waveQueue.cursor + 1;
    const rec = spawnStage11Batch(waveQueue, forestBatchPoints(index), 'forest',
        stage11ForestSpawnPoint);
    encounterRecords.push(...rec); return rec.length > 0;
}
function currentBatchClear() {
    return waveQueue.cursor < 0 || stage11BatchAlive('forest', waveQueue.cursor) === 0;
}
function allConfiguredSpawned() {
    return waveQueue.spawnedTotal >= waveQueue.configuredTotal;
}
function nextGateX() { return 380060 - Math.max(0, waveQueue.cursor) * 420; }

function placeForestItems() {
    const crates = [
        [380585, 25], [380315, -115], [380000, 88], [379720, -18],
    ];
    for (const [x, z] of crates) spawnCrate(x, z, 0);
    for (const [x, z] of [[380430, -45], [379875, -132], [379560, 112]])
        spawnBarrel(x, z, 0);
    spawnAmmoDrop(380260, 65, 'rifle', 1e9);
    spawnAmmoDrop(379690, -138, 'launcher', 1e9);
    spawnMedkitDrop(379505, 104, 1e9);
}

function cleanupParachute() {
    cine = null; setStage11ParachutePose(false); setAvatarRappel(false);
    hideCutsceneSkip(); setCineBars(false);
    setCineFade(0, CFG.campaign.stage11.fadeSec); setCinematicActive(false);
}
function finishParachute(skipped = false) {
    if (!cine) return;
    if (skipped) clearStage11DialogueQueue();
    camera.position.set(S11_FOREST_LANDING.x, CFG.player.eyeHeight,
        S11_FOREST_LANDING.z);
    player.vy = 0; player.onGround = true; landed = true;
    cleanupParachute(); setStage11Phase('forestAdvance');
    queueStage11Dialogue('forestLanded');
    showStageMsg('CROSS THE FOREST — REACH THE IKN PERIMETER', 4600);
    spawnNextBatch();
}
function startParachute() {
    const C = parachuteCfg();
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { t: 0, startX: S11_FOREST_LANDING.x + C.driftX,
        startZ: S11_FOREST_LANDING.z + C.driftZ };
    camera.position.set(cine.startX, CFG.player.eyeHeight + C.startHeight, cine.startZ);
    player.vy = 0; player.onGround = false;
    setStage11ParachutePose(true, { x: cine.startX, feetY: C.startHeight,
        z: cine.startZ, yaw: -Math.PI / 2 });
    setAvatarRappel(true, 0, -Math.PI / 2);
    setStage11Phase('parachute');
    queueStage11Dialogue('dropApproach'); queueStage11Dialogue('canopyOpen');
    showCutsceneSkip(() => finishParachute(true));
}
function updateParachute(dt) {
    const C = parachuteCfg(); cine.t += dt;
    const k = Math.min(1, cine.t / Math.max(.1, C.descentSec));
    const fall = smooth(k), settle = 1 - fall;
    const sway = Math.sin(cine.t * 1.7) * 3.2 * settle;
    const x = cine.startX + (S11_FOREST_LANDING.x - cine.startX) * fall + sway;
    const z = cine.startZ + (S11_FOREST_LANDING.z - cine.startZ) * fall
        + Math.sin(cine.t * 1.1) * 2.2 * settle;
    const feetY = C.startHeight * settle;
    camera.position.set(x, feetY + CFG.player.eyeHeight, z);
    player.vy = 0; player.onGround = false;
    const flare = Math.max(0, (k - .72) / .28);
    setStage11ParachutePose(true, { x, feetY, z,
        yaw: -Math.PI / 2 + Math.sin(cine.t * .65) * .08,
        pitch: Math.sin(cine.t * 1.25) * .035 * settle,
        roll: Math.sin(cine.t * 1.7) * .06 * settle, flare });
    setAvatarRappel(true, k, -Math.PI / 2);
    if (k >= 1) finishParachute(false);
}

function enterCity() {
    if (cityCommitted) return;
    cityCommitted = true; setStage11Phase('cityTransition');
    queueStage11Dialogue('perimeterSighted');
    clearStage11Robots(); resetCrates(); resetBarrels();
    setCineFade(1, CFG.campaign.stage11.fadeSec);
    enterStage11Sub(surfaceScene, { fade: true });
}
function updateProgress() {
    if (phase === 'forestAdvance' && currentBatchClear() && !allConfiguredSpawned()
        && camera.position.x <= nextGateX()) spawnNextBatch();
    if (phase === 'forestAdvance' && allConfiguredSpawned() && currentBatchClear()) {
        setStage11Phase('forestExit'); setStage11ForestExitMarker(true);
        showStageMsg('FOREST PATROL CLEARED — ENTER IKN', 4300);
    }
    if (phase === 'forestExit'
        && near(S11_FOREST_GATE, CFG.campaign.stage11.interactionRange * 1.35)) enterCity();
}

export const forestScene = {
    id: 'campaign-11-forest',
    enter() {
        setActiveCampaignWorldRoots(STAGE11_FOREST_LIGHTS_KEY);
        setActiveStageLights(STAGE11_FOREST_LIGHTS_KEY);
        applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x58644e, fogColor: 0x4e5d4b,
            fogNear: 125, fogFar: 1180 });
        clearStage11Robots(); resetCrates(); resetBarrels(); resetForest(); placeForestItems();
        if (avatarGroup) avatarGroup.visible = true;
        startParachute();
    },
    exit() {
        cleanupParachute(); setStage11ForestExitMarker(false);
    },
    updateMode(dt) {
        elapsed += dt; updateStage11ForestVisuals(dt);
        if (cine) updateParachute(dt);
        else if (!complete) updateProgress();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage11ForestWalk, pos, oldX, oldZ, player.radius);
        stage11ForestResolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage11ForestWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage11ForestGroundHeight,
    get camOffset() { return cine ? PARACHUTE_CAM : null; },
    bulletBlocked(b) {
        return stage11ForestSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage11ForestSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11ForestWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -.4; g.vz *= -.4;
        }
        stage11ForestResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        return campaignRobotAI(bot, dt, step, {
            walkable: stage11ForestWalk, resolve: stage11ForestResolve,
            nav: stage11ForestNav(),
            los: (x0, z0, x1, z1) => !stage11ForestSegBlocked(x0, z0, x1, z1),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage11ForestWalk, resolve: stage11ForestResolve });
    },
    clampDropPos(x, z) {
        return stage11ForestWalk(x, z, 2) ? [x, z]
            : [S11_FOREST_LANDING.x, S11_FOREST_LANDING.z];
    },
    hudStatus() {
        if (phase === 'parachute') return 'PARACHUTE INSERTION — OUTER IKN FOREST';
        if (phase === 'forestExit') return 'IKN PERIMETER OPEN — ENTER THE CITY';
        return `CROSS THE OUTER FOREST | Robots: ${countStageRobots(11)}`;
    },
    radarLandmarks(plot) {
        const p = phase === 'forestExit' ? S11_FOREST_GATE
            : S11_FOREST_ROUTE[Math.min(S11_FOREST_ROUTE.length - 1,
                Math.max(2, (waveQueue?.cursor || 0) * 3 + 3))];
        plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const forestDebug = () => ({
    elapsed, cinematic: !!cine, landed, cityCommitted,
    descent: cine ? { t: cine.t, duration: parachuteCfg().descentSec,
        height: camera.position.y - CFG.player.eyeHeight } : null,
    waveQueue: stage11WaveQueueDebug(waveQueue),
    currentAlive: waveQueue && waveQueue.cursor >= 0
        ? stage11BatchAlive('forest', waveQueue.cursor) : 0,
    encounters: encounterRecords.map(x => ({ ...x,
        onRoad: stage11ForestOnAsphalt(x.x, x.z, 4),
        walkable: stage11ForestWalk(x.x, x.z, 4),
    })),
    world: stage11ForestWorldDebug(),
    cam: cine ? { ...PARACHUTE_CAM } : { ...CAM_OFF_DEFAULT },
});
