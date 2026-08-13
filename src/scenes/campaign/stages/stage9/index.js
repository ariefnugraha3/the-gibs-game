// Campaign Stage 9 — KERTAJATI AIRLIFT.
// Facade owns the objective state machine; geometry and aircraft stay isolated
// in world.js/aircraft.js so every standard scene hook remains explicit.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import {
    avatarGroup, setAvatarRadioPose, setAvatarMissionCase,
} from '../../../../entities/playerAvatar.js';
import { disposeRobot, damagePlayerHp, killRobot } from '../../../../entities/robots.js';
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
import { transportJetZones } from './aircraft.js';
import {
    ensureStage9World, S9_START, S9_TOWER, S9_CORE, S9_HANGAR, S9_INSTALL, S9_BOARD,
    S9_BOUNDS, stage9Walkable, stage9BlockedAt, stage9Resolve, stage9SegHitsWall,
    stage9GroundHeight, stage9NavGrid, stage9Transport, stage9SetCoreInstalled,
    stage9SetMarkers, stage9UpdateWorld, stage9SupplyPlacements,
    stage9EncounterPoints, stage9RadarLandmarks, stage9WorldDebug,
} from './world.js';

export { ensureStage9World, stage9WorldDebug } from './world.js';
export const STAGE9_DIALOGUE = dialogueMap('campaign.stage9.lines');

let phase = 'opening';
let complete = false;
let stageElapsed = 0;
let coreAcquired = false;
let coreInstalled = false;
let spoolT = 0;
let spoolBeat = 0;
let spoolGapT = 0;
let takeoffT = 0;
let transitionSent = false;
let cine = null;
let jetZones = [];
let blastShakeT = 0;
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

function spawnEncounter(name, counts, active = false, apronBlocker = false) {
    if (!counts || spawnedEncounters[name]) return 0;
    spawnedEncounters[name] = true;
    const points = stage9EncounterPoints(name.startsWith('spool-') ? 'spool' : name);
    let cursor = 0;
    for (const cls of ['C', 'B', 'A']) {
        const amount = Math.max(0, counts[cls] | 0);
        for (let i = 0; i < amount; i++, cursor++) {
            const point = clearSpawnPoint(points[cursor % points.length], cursor);
            spawnCampaignRobot(point.x, point.z, 9, cls, active);
            const robot = robots[robots.length - 1];
            robot.encounter = name;
            robot.apronBlocker = apronBlocker;
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

function apronBlockerCount() {
    let n = 0;
    for (const robot of robots)
        if (robot.stage === 9 && robot.apronBlocker) n++;
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

function resetStage() {
    phase = 'opening';
    complete = false;
    stageElapsed = 0;
    coreAcquired = false;
    coreInstalled = false;
    spoolT = 0;
    spoolBeat = 0;
    spoolGapT = 0;
    takeoffT = 0;
    transitionSent = false;
    cine = null;
    blastShakeT = 0;
    jetZones = transportJetZones(stage9Transport());
    for (const name of Object.keys(spawnedEncounters)) delete spawnedEncounters[name];
    resetDialogue();
    setAvatarMissionCase(false);
    stage9SetCoreInstalled(false);
    stage9SetMarkers([]);
    stage9UpdateWorld(0, 0, 0, 0);
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
    phase = 'reachTower';
    stage9SetMarkers(['tower']);
    queueDialogue('towerLocked');
    queueDialogue('coreLocated');
    showStageMsg('REACH THE CONTROL TOWER OPERATIONS ROOM', 4800);
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
    setCineFocus(S9_TOWER.x, S9_TOWER.z, true);
    showCutsceneSkip(() => finishOpening(true));
}

function startTakeoff() {
    if (phase !== 'board' || cine) return;
    phase = 'takeoff';
    takeoffT = 0;
    stage9SetMarkers([]);
    releaseInputs();
    clearMoveTarget();
    setCinematicActive(true);
    setCineBars(true);
    cine = { kind: 'takeoff', t: 0, shot: -1 };
    if (avatarGroup) avatarGroup.visible = false;
    queueDialogue('airDefense');
    setCineFocus(stage9Transport().position.x, stage9Transport().position.z, true);
    showCutsceneSkip(() => finishTakeoff(true));
}

function finishTakeoff(skipped = false) {
    if (complete) return;
    if (skipped) {
        takeoffT = config().takeoffSec;
        stage9UpdateWorld(0, stageElapsed, 1, 1);
    }
    // Panel radio SELALU ditutup di garis finish (bukan hanya saat skip) —
    // kalau tidak, satu baris tertinggal menempel di layar finish hijau + shop.
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
            if (shot === 0) setCineFocus(S9_TOWER.x, S9_TOWER.z, shot > 0);
            else if (shot === 1) setCineFocus(299880, -20, true);
            else setCineFocus(stage9Transport().position.x, stage9Transport().position.z, true);
        }
        if (cine.t >= config().openingMinSec && !dialogueCurrent && !dialogueQueue.length)
            finishOpening(false);
        return;
    }
    if (cine.kind === 'takeoff') {
        takeoffT = Math.min(config().takeoffSec, takeoffT + dt);
        const progress = takeoffT / config().takeoffSec;
        stage9UpdateWorld(dt, stageElapsed, 1, progress);
        const aircraft = stage9Transport();
        setCineFocus(aircraft.position.x, aircraft.position.z);
        if (takeoffT >= config().takeoffSec) finishTakeoff(false);
    }
}

function enterTowerObjective() {
    if (phase !== 'reachTower') return;
    phase = 'takeCore';
    stage9SetMarkers(['core']);
    spawnEncounter('tower', config().encounters.tower, true);
    showStageMsg('CLEAR TOWER SECURITY — SECURE THE FLIGHT CORE', 4200);
}

function takeCore() {
    if (phase !== 'takeCore') return;
    coreAcquired = true;
    setAvatarMissionCase(true, 'flight-core');
    phase = 'reachHangar';
    stage9SetMarkers(['install']);
    spawnEncounter('return', config().encounters.return, true);
    queueDialogue('coreTaken');
    showStageMsg('FLIGHT CORE SECURED — RETURN TO THE CARGO HANGAR', 4600);
}

function reachHangar() {
    if (phase !== 'reachHangar') return;
    phase = 'installCore';
    spawnEncounter('hangar', config().encounters.hangar, true);
    stage9SetMarkers(['install']);
    showStageMsg('CLEAR THE HANGAR AND INSTALL THE FLIGHT CORE', 4200);
}

function startSpoolDefense() {
    if (phase !== 'installCore') return;
    coreInstalled = true;
    setAvatarMissionCase(false);
    stage9SetCoreInstalled(true);
    stage9SetMarkers([]);
    phase = 'spoolDefense';
    spoolT = 0;
    spoolBeat = 1;
    spoolGapT = 0;
    const waves = config().spool.encounters;
    spawnEncounter('spool-1', waves[0], true, true);
    queueDialogue('aircraftBoot');
    queueDialogue('assaultWarning');
    spawnAmmoDrop(S9_INSTALL.x - 38, S9_INSTALL.z + 54, currentWeapon, 1e9);
    showStageMsg('ENGINE SPOOL STARTED — KEEP THE APRON CLEAR', 4800);
}

function finishSpool() {
    if (phase !== 'spoolDefense') return;
    phase = 'board';
    stage9SetMarkers(['board']);
    queueDialogue('enginesReady');
    queueDialogue('boardNow');
    spawnAmmoDrop(S9_BOARD.x - 22, S9_BOARD.z + 34, currentWeapon, 1e9);
    showStageMsg('ENGINES READY — BOARD THE TRANSPORT', 4800);
}

function updateSpool(dt) {
    const C = config().spool;
    const waves = C.encounters;
    const blockers = apronBlockerCount();
    if (!C.pauseWhenBlocked || blockers === 0) {
        spoolT = Math.min(C.durationSec, spoolT + dt);
        spoolGapT += dt;
    }
    if (blockers === 0 && spoolBeat < waves.length && spoolGapT >= C.waveGapSec) {
        const next = spoolBeat;
        spoolBeat++;
        spoolGapT = 0;
        spawnEncounter(`spool-${next + 1}`, waves[next], true, true);
        showStageMsg(`APRON ASSAULT — WAVE ${next + 1} / ${waves.length}`, 3000);
    }
    if (spoolT >= C.durationSec && spoolBeat >= waves.length && apronBlockerCount() === 0)
        finishSpool();
}

function inJetZone(x, z) {
    for (const zone of jetZones)
        if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) return zone;
    return null;
}

function applyJetBlast(dt) {
    const C = config().jetBlast;
    if (spoolT < C.warmupSec) return;
    const ratio = spoolT / config().spool.durationSec;
    const playerZone = inJetZone(camera.position.x, camera.position.z);
    if (playerZone) {
        const oldX = camera.position.x, oldZ = camera.position.z;
        camera.position.x += playerZone.directionX * C.push * dt;
        camera.position.z += playerZone.directionZ * C.push * dt;
        stage9Resolve(camera.position, player.radius, 0);
        if (!stage9Walkable(camera.position.x, camera.position.z, player.radius)) {
            camera.position.x = oldX;
            camera.position.z = oldZ;
        }
        if (ratio >= C.activeFraction) damagePlayerHp(C.damage * dt);
        blastShakeT -= dt;
        if (blastShakeT <= 0) { addCamShake(0.65 + ratio); blastShakeT = 0.18; }
    }
    for (let i = robots.length - 1; i >= 0; i--) {
        const robot = robots[i];
        if (robot.stage !== 9) continue;
        const zone = inJetZone(robot.mesh.position.x, robot.mesh.position.z);
        if (!zone) continue;
        const oldX = robot.mesh.position.x, oldZ = robot.mesh.position.z;
        robot.mesh.position.x += zone.directionX * C.push * dt;
        robot.mesh.position.z += zone.directionZ * C.push * dt;
        stage9Resolve(robot.mesh.position, 3.5, 0);
        if (!stage9Walkable(robot.mesh.position.x, robot.mesh.position.z, 3)) {
            robot.mesh.position.x = oldX;
            robot.mesh.position.z = oldZ;
        }
        if (ratio >= C.activeFraction) {
            robot.hp -= C.damage * dt;
            if (robot.hp <= 0) killRobot(i, { cause: 'explosion', dirx: -1, dirz: 0 });
        }
    }
}

function updateObjectives(dt) {
    const range = config().interactionRange;
    if (phase === 'reachTower' && encounterCount('apron') === 0
        && distanceTo(S9_TOWER) <= range * 3) enterTowerObjective();
    else if (phase === 'takeCore' && encounterCount('tower') === 0
        && distanceTo(S9_CORE) <= range) takeCore();
    else if (phase === 'reachHangar' && distanceTo(S9_HANGAR) <= range * 3) reachHangar();
    else if (phase === 'installCore' && encounterCount('return') === 0
        && encounterCount('hangar') === 0 && distanceTo(S9_INSTALL) <= range) startSpoolDefense();
    else if (phase === 'spoolDefense') {
        updateSpool(dt);
        applyJetBlast(dt);
    } else if (phase === 'board' && distanceTo(S9_BOARD) <= range) startTakeoff();
}

function objectivePoint() {
    if (phase === 'reachTower') return S9_TOWER;
    if (phase === 'takeCore') return S9_CORE;
    if (phase === 'reachHangar' || phase === 'installCore') return S9_INSTALL;
    if (phase === 'board') return S9_BOARD;
    return null;
}

export function stage9Debug() {
    const C = config();
    return {
        phase, complete, stageElapsed, coreAcquired, coreInstalled,
        spool: {
            seconds: spoolT, duration: C.spool.durationSec,
            progress: spoolT / C.spool.durationSec,
            beat: spoolBeat, beats: C.spool.encounters.length,
            paused: C.spool.pauseWhenBlocked && apronBlockerCount() > 0,
            apronBlockers: apronBlockerCount(),
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
        spawnEncounter('apron', config().encounters.apron, false);
        placeSupplies();
        applyLightPreset(scene, 'night');
        enterCityEnv({ background: 0x50606a, fogColor: 0x46555a, fogNear: 260, fogFar: 1800 });
        camera.position.set(S9_START.x, CFG.player.eyeHeight, S9_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0;
        player.onGround = true;
        startOpening();
        updateUI();
    },

    exit() {
        resetDialogue();
        if (cine) cleanupCine(0);
        stage9SetMarkers([]);
        setAvatarMissionCase(false);
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
            config().spool.durationSec > 0 ? spoolT / config().spool.durationSec : 0,
            phase === 'complete' ? 1 : 0);
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
        if (phase === 'opening') return 'STAGE 9 — KERTAJATI AIRLIFT';
        if (phase === 'reachTower') return `REACH CONTROL TOWER — HOSTILES ${encounterCount('apron')}`;
        if (phase === 'takeCore') return `SECURE FLIGHT CORE — DEFENDERS ${encounterCount('tower')}`;
        if (phase === 'reachHangar') return 'FLIGHT CORE SECURED — RETURN TO CARGO HANGAR';
        if (phase === 'installCore')
            return `INSTALL FLIGHT CORE — HOSTILES ${encounterCount('return') + encounterCount('hangar')}`;
        if (phase === 'spoolDefense') {
            const percent = Math.floor(spoolT / config().spool.durationSec * 100);
            const pause = apronBlockerCount() ? ' — PAUSED: CLEAR APRON' : '';
            return `ENGINE SPOOL ${percent}% — ASSAULT ${spoolBeat}/${config().spool.encounters.length}${pause}`;
        }
        if (phase === 'board') return 'ENGINES READY — BOARD THE TRANSPORT';
        if (phase === 'takeoff') return 'KERTAJATI AIRLIFT — TAKEOFF';
        return 'STAGE 9 COMPLETE';
    },

    radarLandmarks(plot) {
        const objective = objectivePoint();
        if (objective) plot(objective.x - camera.position.x,
            objective.z - camera.position.z, '#ffb03b', 5, true);
        if (phase === 'spoolDefense') {
            for (const robot of robots) if (robot.stage === 9 && robot.apronBlocker)
                plot(robot.mesh.position.x - camera.position.x,
                    robot.mesh.position.z - camera.position.z, '#ff4a3c', 3, true);
        }
        void stage9RadarLandmarks;
    },

    countStageRobots: () => countStageRobots(9),
};
