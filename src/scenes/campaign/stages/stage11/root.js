// Stage 11 Chapter B — root transmitter, monotonic upload and Warden battle.

import { CFG } from '../../../../core/config.js';
import { player, keys, robots, setCinematicActive } from '../../../../core/state.js';
import { scene, camera } from '../../../../core/renderer.js';
import {
    showStageMsg, showDownloadBar, setDownloadProgress, hideDownloadBar,
    setBossHud, hideBossHud, setCineFade, setCineBars,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { spawnGroundPuff } from '../../../../entities/effects.js';
import { resetCrates, resolveCrateBlock } from '../../../../entities/crates.js';
import { resetBarrels, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop, spawnLoot } from '../../../../entities/drops.js';
import {
    campaignRobotAI, campaignClampRobot, countStageRobots, spawnCampaignRobot,
} from '../../utility/common.js';
import { beginHackMinigame, isHackOpen } from '../../utility/hackMinigame.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights, applyLightPreset } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import {
    activateNusantaraWarden, resetNusantaraWarden, updateNusantaraWarden,
    cleanupNusantaraWarden, resolveNusantaraWardenBlock,
    nusantaraWardenBulletHit, nusantaraWardenIsJamming,
    nusantaraWardenWrecked, nusantaraWardenDebug,
} from '../../../../entities/nusantaraWarden.js';
import {
    STAGE11_ROOT_LIGHTS_KEY, S11_ROOT_START, S11_AUTHORITY_GATE,
    S11_ROOT_ENCOUNTER, S11_DOOR_STAND, S11_INSERT, S11_INSERT_STAND,
    S11_ARENA, S11_WARDEN_HOME, stage11RootWalk, stage11RootResolve,
    stage11RootSegBlocked, stage11RootGroundHeight, stage11RootNav,
    stage11RootMeterAt, stage11RootPointAtMeter, stage11RootMachineAnchors,
    setStage11AuthorityDoor, updateStage11AuthorityDoor,
    setStage11DoorHackMarker, setStage11InsertMarker,
    updateStage11RootMachines,
    updateStage11RootVisuals, updateStage11RootOccluders,
    resetStage11RootVisuals, stage11RootWorldDebug,
} from './rootWorld.js';
import {
    phase, complete, setStage11Phase, setStage11Complete,
    queueStage11Dialogue, stage11DialogueIdle,
    clearStage11Robots, invokeStage11Completion,
} from './runtime.js';
import { getStage11Warden } from './index.js';
import {
    STAGE11_CHAPTER_CAMERA, stage11ChapterScreenDirection,
} from './chapterCamera.js';

let elapsed = 0;
let encounterTriggered = false;
let spawnPlan = [];
let spawnCursor = 0;
let spawnClock = 0;
let births = [];
let spawnedByClass = { C: 0, B: 0, A: 0 };
let doorHacked = false;
let doorHackArmed = true;
let doorHackAttempts = 0;
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
function R() { return CFG.campaign.stage11.rootCorridor; }

export function resetRoot() {
    elapsed = 0; insertT = 0; uploadProgress = 0; previousUpload = 0;
    minObservedDelta = 0; uploadAccepted = false; wardenActivated = false;
    rewardDropped = false; endingQueued = false; completionInvoked = false;
    lastWardenPhase = 'dormant'; jamFrames = 0; progressFrames = 0;
    encounterTriggered = false; spawnPlan = []; spawnCursor = 0; spawnClock = 0;
    births = []; spawnedByClass = { C: 0, B: 0, A: 0 };
    doorHacked = false; doorHackArmed = true; doorHackAttempts = 0;
    resetStage11RootVisuals(); hideBossHud(); hideDownloadBar();
    resetNusantaraWarden(W(), { active: false, x: S11_WARDEN_HOME.x,
        z: S11_WARDEN_HOME.z, home: S11_WARDEN_HOME, arena: S11_ARENA });
}

function placeRootSupplies() {
    // Supplies sit in the clear corridor after the metre-50 ambush, keeping
    // the circular hall and its central computer visually uncluttered.
    const p = stage11RootPointAtMeter(82);
    for (const [z, weapon] of [[-66, 'rifle'], [-32, 'pistol'], [32, 'shotgun'], [66, 'launcher']])
        spawnAmmoDrop(p.x, z, weapon, 1e9);
    spawnMedkitDrop(p.x + 28, 0, 1e9);
}

function buildCorridorSpawnPlan() {
    const wanted = { C: Math.max(0, R().robots.C | 0),
        B: Math.max(0, R().robots.B | 0), A: Math.max(0, R().robots.A | 0) };
    const used = { C: 0, B: 0, A: 0 }, out = [];
    const total = wanted.C + wanted.B + wanted.A;
    // Weighted round-robin keeps all three classes mixed while preserving the
    // exact authored 12/8/4 census.
    for (let i = 0; i < total; i++) {
        let best = null, ratio = Infinity;
        for (const cls of ['C', 'B', 'A']) {
            if (used[cls] >= wanted[cls]) continue;
            const q = used[cls] / Math.max(1, wanted[cls]);
            if (q < ratio) { ratio = q; best = cls; }
        }
        used[best]++; out.push(best);
    }
    return out;
}

function corridorBirthTarget(machine, slot) {
    const lane = (slot % 4) - 1.5;
    return { x: machine.x - 24 - Math.floor(slot / 4) * 9,
        z: machine.z * .42 + lane * 12 };
}

function spawnCorridorRobot(cls, index) {
    const machines = stage11RootMachineAnchors();
    const machine = machines[index % machines.length];
    const start = machine.hatch, target = corridorBirthTarget(machine,
        Math.floor(index / machines.length));
    spawnCampaignRobot(start.x, start.z, 11, cls, true);
    const bot = robots[robots.length - 1], base = bot.scl || 1;
    bot.encounter = 'root-corridor-50'; bot.rootCorridorBorn = true;
    bot.machineBirth = true; bot.state = 'idle'; bot.moving = false; bot.aiming = false;
    bot.mesh.scale.set(base * .06, base * .025, base * .06);
    bot.mesh.rotation.y = machine.yaw;
    births.push({ bot, t: 0, base, start: { ...start }, target });
    spawnedByClass[cls]++;
    spawnGroundPuff(start.x, start.z, 0x48bfc2, 7, .8);
}

function updateCorridorBirths(dt) {
    const sec = Math.max(.1, R().birthSec);
    for (let i = births.length - 1; i >= 0; i--) {
        const b = births[i];
        if (robots.indexOf(b.bot) < 0 || b.bot.hp <= 0) {
            births.splice(i, 1); continue;
        }
        b.t += dt;
        const k = Math.min(1, b.t / sec), growK = Math.min(1, k / .62);
        const grow = growK * growK * (3 - 2 * growK);
        const travelK = Math.max(0, Math.min(1, (k - .2) / .8));
        const travel = 1 - (1 - travelK) ** 2;
        b.bot.mesh.position.x = b.start.x + (b.target.x - b.start.x) * travel;
        b.bot.mesh.position.z = b.start.z + (b.target.z - b.start.z) * travel;
        b.bot.mesh.position.y = Math.sin(travel * Math.PI) * 4.5;
        b.bot.mesh.scale.set(b.base * (.06 + grow * .94),
            b.base * (.025 + grow * .975), b.base * (.06 + grow * .94));
        if (k < 1) continue;
        b.bot.mesh.position.set(b.target.x, 0, b.target.z);
        b.bot.mesh.scale.setScalar(b.base); b.bot.machineBirth = false;
        b.bot.state = 'chasing'; b.bot.moving = false; b.bot.aiming = false;
        births.splice(i, 1);
    }
}

function triggerCorridorEncounter() {
    if (encounterTriggered) return;
    encounterTriggered = true; spawnPlan = buildCorridorSpawnPlan();
    spawnCursor = 0; spawnClock = Math.max(0, R().firstBirthSec);
    setStage11Phase('corridorBattle');
    showStageMsg('50 M — TWO FABRICATORS ONLINE | 12C / 8B / 4A INBOUND', 4700);
}

function beginDoorHack() {
    if (doorHacked || isHackOpen()) return;
    doorHackArmed = false; doorHackAttempts++;
    setStage11Phase('doorHacking'); queueStage11Dialogue('authorityDenied');
    beginHackMinigame({
        head: 'ROOT HALL — AUTHORITY DOOR',
        sub: 'Rotate the security chips to bridge the ingress line and release '
            + 'the two monumental door leaves.',
        onSuccess: () => {
            doorHacked = true; setStage11AuthorityDoor(true);
            setStage11DoorHackMarker(false); setStage11InsertMarker(true);
            setStage11Phase('insertDrive');
            showStageMsg('ACCESS GRANTED — ROOT HALL OPEN | REACH THE CENTRAL COMPUTER', 4800);
        },
        onFail: () => {
            setStage11Phase('doorLocked');
            showStageMsg('BREACH FAILED — STEP AWAY FROM THE TERMINAL AND RETRY', 3800);
        },
    });
}

function updateRootApproach(dt) {
    const C = R(), meter = stage11RootMeterAt(camera.position.x, camera.position.z);
    if (!encounterTriggered && meter >= C.encounterMeter) triggerCorridorEncounter();
    if (encounterTriggered && spawnCursor < spawnPlan.length) {
        spawnClock -= dt;
        const gap = Math.max(.03, C.birthGapSec);
        while (spawnCursor < spawnPlan.length && spawnClock <= 0) {
            spawnCorridorRobot(spawnPlan[spawnCursor], spawnCursor);
            spawnCursor++; spawnClock += gap;
        }
    }
    updateCorridorBirths(dt);
    const machinesLive = encounterTriggered
        && (spawnCursor < spawnPlan.length || births.length > 0);
    updateStage11RootMachines(dt, machinesLive);
    updateStage11AuthorityDoor(dt);

    if (doorHacked) return;
    const close = near(S11_DOOR_STAND, C.hackRange);
    if (!close) doorHackArmed = true;
    else if (doorHackArmed && !isHackOpen()) beginDoorHack();
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

function updateComputerInteraction(dt) {
    if (phase === 'insertDrive') {
        if (near(S11_INSERT_STAND, CFG.campaign.stage11.interactionRange)) {
            insertT += dt;
            if (insertT >= .9) beginUpload();
        } else insertT = 0;
    }
}

export const rootScene = {
    id: 'campaign-11-root',
    // Match Chapter 2: camera sits southeast/lower-right and looks northwest,
    // placing the console and Warden toward the upper-left of the screen.
    camOffset: STAGE11_CHAPTER_CAMERA,
    enter() {
        setActiveCampaignWorldRoots(STAGE11_ROOT_LIGHTS_KEY);
        setActiveStageLights(STAGE11_ROOT_LIGHTS_KEY);
        applyLightPreset(scene, 'indoor');
        enterCityEnv({ background: 0x171814, fogColor: 0x24231f,
            fogNear: 80, fogFar: 900 });
        clearStage11Robots(); resetCrates(); resetBarrels(); resetRoot(); placeRootSupplies();
        setStage11Phase('rootCorridor');
        camera.position.set(S11_ROOT_START.x, CFG.player.eyeHeight, S11_ROOT_START.z);
        camera.quaternion.set(0, 0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setCinematicActive(false); setCineBars(false);
        setCineFade(0, CFG.campaign.stage11.fadeSec);
        showStageMsg('ROOT HALL 100 M — ADVANCE TO THE SEALED DOOR', 4300);
    },
    exit() {
        cleanupNusantaraWarden(W(), false); hideBossHud(); hideDownloadBar();
        births.length = 0; setStage11DoorHackMarker(false); setStage11InsertMarker(false);
    },
    updateMode(dt) {
        elapsed += dt; updateRootApproach(dt); updateComputerInteraction(dt);
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
        if (bot.machineBirth) {
            bot.state = 'idle'; bot.moving = false; bot.aiming = false; return {};
        }
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
        if (phase === 'rootCorridor') return 'ROOT HALL DOOR — 100 M';
        if (phase === 'corridorBattle') return `BREAK THROUGH THE 50 M AMBUSH | Robots: ${countStageRobots(11)}`;
        if (phase === 'doorHacking') return 'BREACHING ROOT HALL AUTHORITY';
        if (phase === 'doorLocked') return 'HACK THE LARGE ROOT HALL DOOR';
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
        const marks = !doorHacked ? [encounterTriggered && spawnCursor < spawnPlan.length
            ? S11_ROOT_ENCOUNTER : S11_DOOR_STAND]
            : phase === 'insertDrive' ? [S11_INSERT_STAND] : [];
        const wd = nusantaraWardenDebug(W());
        if (wd.active && !wd.deathDone && wd.position) marks.push(wd.position);
        for (const p of marks)
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const rootDebug = () => ({
    elapsed, uploadProgress, previousUpload, minObservedDelta,
    camera: { offset: { ...rootScene.camOffset }, corner: 'lower-right',
        progress: stage11ChapterScreenDirection(S11_ROOT_START, S11_WARDEN_HOME) },
    uploadAccepted, monotonic: minObservedDelta >= -1e-9,
    clampWhileAlive: CFG.campaign.stage11.upload.preBossFraction,
    jammed: nusantaraWardenIsJamming(W()), jamFrames, progressFrames,
    wardenActivated, rewardDropped, endingQueued, completionInvoked,
    corridor: { meter: stage11RootMeterAt(camera.position.x), encounterTriggered,
        configuredMeter: R().encounterMeter, machines: R().machines,
        planned: spawnPlan.length, spawned: spawnCursor, activeBirths: births.length,
        configuredRobots: { ...R().robots }, spawnedByClass: { ...spawnedByClass },
        alive: robots.filter(z => z.stage === 11
            && z.encounter === 'root-corridor-50').length },
    door: { hacked: doorHacked, armed: doorHackArmed, attempts: doorHackAttempts,
        hacking: isHackOpen(), stand: { ...S11_DOOR_STAND } },
    lastWardenPhase,
    warden: nusantaraWardenDebug(W()), world: stage11RootWorldDebug(),
});
