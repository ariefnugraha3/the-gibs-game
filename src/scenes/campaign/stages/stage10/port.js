// Campaign Stage 10 Chapter 1 — THE IRON PORT.
// Full campaign facade for the port traversal, safe crane reconfiguration,
// ordered harbor-cannon servos, and freight-carrier extraction.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import {
    scene, camera, viewCam, setCineFocus, addCamShake,
    camFocusPos, camOffsetActive, CAM_LOOK_DROP,
} from '../../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { avatarGroup, setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot, damagePlayerHp } from '../../../../entities/robots.js';
import { spawnCrate, resetCrates, resolveCrateBlock } from '../../../../entities/crates.js';
import { spawnBarrel, resetBarrels, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { currentWeapon } from '../../../../entities/weapons.js';
import { explodeAt } from '../../../../entities/effects.js';
import { slideWalk } from '../../../../utils/collision.js';
import { applyLightPreset, setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import {
    campaignAwardKill, campaignRobotAI,
    campaignClampRobot, countStageRobots,
} from '../../utility/common.js';
import { campaignJumpToStage } from '../../utility/transition.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { stopMusic } from '../../../../utils/sfx.js';
import { stage1Scene } from '../stage1/index.js';
import {
    beginCraneShift, setCraneLayout, updateCraneShift, craneDebug,
} from './cranes.js';
import {
    resetDefenseArray, activateDefenseArray, defenseArrayBulletHit,
    updateDefenseArray, updateDefenseArrayVisuals, defenseArrayDebug,
} from './defenseArray.js';
import {
    ensureStage10World, S10_START, S10_YARD, S10_SAFE_BAY, S10_WAREHOUSE,
    S10_RELAY, S10_PIPE_RACK, S10_DEFENSE, S10_EXTRACT, S10_BOUNDS,
    stage10Walkable, stage10BlockedAt, stage10PathWalkable, stage10Resolve,
    stage10SegHitsWall, stage10GroundHeight, stage10NavGrid,
    stage10CraneSystem, stage10DefenseSystem, stage10SetMarkers,
    stage10UpdateWorld, stage10SupplyPlacements, stage10EncounterPoints,
    stage10ConnectivityDebug, stage10WorldDebug, stage10ResetLayout,
} from './portWorld.js';
import {
    beginStage10SpawnDeployment, resetStage10SpawnDeployment,
    updateStage10SpawnDeployment, stage10SpawnDeploymentPending,
    stage10SpawnDeploymentDebug, stage10SpawnDeploymentBulletHit,
} from './spawnDeployment.js';

export { ensureStage10World, stage10WorldDebug } from './portWorld.js';
export const STAGE10_DIALOGUE = dialogueMap('campaign.stage10.lines');

let phase = 'opening';
let complete = false;
let stageElapsed = 0;
let relayToken = false;
let craneT = 0;
let craneSettleT = 0;
let defenseWave = 0;
let transitionSent = false;
let completionHook = null;
let cine = null;
const cineCam = new THREE.Vector3(-118, 108, 122);
const spawnedEncounters = Object.create(null);

let dialogueCurrent = null;
let dialogueQueue = [];
let dialogueSeen = new Set();
let dialogueT = 0;
let dialogueChars = 0;

const config = () => CFG.campaign.stage10;

function distanceTo(point) {
    return Math.hypot(camera.position.x - point.x, camera.position.z - point.z);
}

// Robot dorman bangun pada frame pertama tubuhnya masuk viewport. Predikat ini
// memakai pose render top-down yang sama seperti kamera, bukan radius deteksi AI.
export function stage10RobotInView(robotOrX, zArg = 0, yArg = 0) {
    let x = robotOrX, z = zArg, y = yArg;
    if (robotOrX && typeof robotOrX === 'object') {
        const p = robotOrX.mesh?.position || robotOrX.position || robotOrX;
        x = p.x; z = p.z;
        y = p.y + (robotOrX.scl || 1) * 6.5;
    }
    const off = camOffsetActive();
    let focus = camFocusPos();
    // Teleport objective/test dapat mendahului followViewCam satu frame.
    if (Math.hypot(focus.x - camera.position.x, focus.z - camera.position.z) > 400)
        focus = camera.position;
    const ex = focus.x + off.x, ey = focus.y + off.y, ez = focus.z + off.z;
    let fx = -off.x, fy = -off.y - CAM_LOOK_DROP, fz = -off.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const rh = Math.hypot(fx, fz) || 1;
    const rx = -fz / rh, rz = fx / rh;
    const ux = -fy * rz, uy = fx * rz - fz * rx, uz = fy * rx;
    const dx = x - ex, dy = y - ey, dz = z - ez;
    const depth = dx * fx + dy * fy + dz * fz;
    if (depth <= 1) return false;
    const tanY = Math.tan(((viewCam?.fov || 50) * Math.PI / 180) / 2);
    const tanX = tanY * (viewCam?.aspect || 1);
    const screenX = (dx * rx + dz * rz) / (depth * tanX);
    const screenY = (dx * ux + dy * uy + dz * uz) / (depth * tanY);
    return Math.abs(screenX) <= 1 && Math.abs(screenY) <= 1;
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
    const line = STAGE10_DIALOGUE[key];
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

function removeStage10Robots() {
    for (let i = robots.length - 1; i >= 0; i--) {
        if (robots[i].stage !== 10) continue;
        disposeRobot(robots[i]);
        scene.remove(robots[i].mesh);
        robots.splice(i, 1);
    }
}

function clearSpawnPoint(point, seed) {
    const radius = Math.floor(seed / 6) * 9;
    const angle = seed * 2.399963;
    let x = point.x + Math.cos(angle) * radius;
    let z = point.z + Math.sin(angle) * radius;
    if (!stage10PathWalkable(x, z, 4)) {
        x = point.x;
        z = point.z;
    }
    return { x, z };
}

function spawnEncounter(name, counts, active = false) {
    if (!counts || spawnedEncounters[name]) return 0;
    spawnedEncounters[name] = true;
    const baseName = name.startsWith('defense-') ? 'defense' : name;
    const points = stage10EncounterPoints(baseName);
    const plans = [];
    let cursor = 0;
    for (const cls of ['C', 'B', 'A']) {
        const amount = Math.max(0, counts[cls] | 0);
        for (let i = 0; i < amount; i++, cursor++) {
            const point = clearSpawnPoint(points[cursor % points.length], cursor);
            plans.push({ cls, x: point.x, z: point.z, encounter: name, active });
        }
    }
    return beginStage10SpawnDeployment('campaign-10-port', {
        name, plans,
        machinePoints: [points[0], points[Math.floor(points.length / 2)] || points[0]],
    });
}

function encounterCount(name) {
    let n = 0;
    for (const robot of robots)
        if (robot.stage === 10 && robot.encounter === name) n++;
    return n;
}

function activeDefenseEnemyCount() {
    let n = 0;
    for (const robot of robots)
        if (robot.stage === 10 && String(robot.encounter).startsWith('defense-')) n++;
    return n;
}

function placeSupplies() {
    const placements = stage10SupplyPlacements();
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
    relayToken = false;
    craneT = 0;
    craneSettleT = 0;
    defenseWave = 0;
    transitionSent = false;
    cine = null;
    resetStage10SpawnDeployment('campaign-10-port');
    for (const key of Object.keys(spawnedEncounters)) delete spawnedEncounters[key];
    resetDialogue();
    stage10ResetLayout();
    resetDefenseArray(stage10DefenseSystem(), config().cannon.servoHp);
    stage10SetMarkers([]);
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
    phase = 'yardEntry';
    stage10SetMarkers(['yard']);
    queueDialogue('portObjective');
    showStageMsg('ENTER THE CONTAINER TERMINAL', 4400);
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
    queueDialogue('approachLock');
    queueDialogue('divertCommand');
    setCineFocus(S10_START.x + 170, S10_START.z, true);
    showCutsceneSkip(() => finishOpening(true));
}

function finishCraneShift(skipped = false) {
    if (!cine || cine.kind !== 'craneShift') return;
    if (skipped) {
        setCraneLayout(stage10CraneSystem(), 'B');
        craneT = config().crane.moveSec;
        craneSettleT = config().crane.settleSec;
    }
    cleanupCine(config().fadeSec);
    phase = 'warehouse';
    stage10SetMarkers(['relay']);
    spawnEncounter('warehouse', config().encounters.warehouse, false);
    showStageMsg('ROUTE B OPEN — SECURE THE WAREHOUSE RELAY TOKEN', 4800);
}

function startCraneShift() {
    if (phase !== 'craneMazeA') return;
    phase = 'craneShift';
    stage10SetMarkers([]);
    releaseInputs();
    clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true);
    setCineBars(true);
    cine = { kind: 'craneShift', t: 0 };
    craneT = 0;
    craneSettleT = 0;
    beginCraneShift(stage10CraneSystem());
    queueDialogue('craneOnline');
    setCineFocus(S10_SAFE_BAY.x - 70, S10_SAFE_BAY.z, true);
    showCutsceneSkip(() => finishCraneShift(true));
}

function finishExtraction(skipped = false) {
    if (complete) return;
    resetDialogue();   // sama seperti Stage 9: finish selalu menutup panel radio
    complete = true;
    phase = 'complete';
    cleanupCine(0);
    if (!transitionSent) {
        transitionSent = true;
        completionHook?.();
    }
}

function startExtraction() {
    if (phase !== 'extract') return;
    phase = 'departure';
    stage10SetMarkers([]);
    releaseInputs();
    clearMoveTarget();
    setCinematicActive(true);
    setCineBars(true);
    cine = { kind: 'departure', t: 0 };
    if (avatarGroup) avatarGroup.visible = false;
    queueDialogue('northRoute');
    setCineFocus(S10_EXTRACT.x, S10_EXTRACT.z, true);
    showCutsceneSkip(() => finishExtraction(true));
}

function updateCine(dt) {
    if (!cine) return;
    cine.t += dt;
    if (cine.kind === 'opening') {
        const third = config().openingMinSec / 3;
        const shot = Math.min(2, Math.floor(cine.t / Math.max(0.01, third)));
        if (shot !== cine.shot) {
            cine.shot = shot;
            if (shot === 0) setCineFocus(S10_START.x + 170, S10_START.z, shot > 0);
            else if (shot === 1) setCineFocus(S10_SAFE_BAY.x, S10_SAFE_BAY.z, true);
            else setCineFocus(S10_DEFENSE.x, S10_DEFENSE.z, true);
        }
        if (cine.t >= config().openingMinSec && !dialogueCurrent && !dialogueQueue.length)
            finishOpening(false);
        return;
    }
    if (cine.kind === 'craneShift') {
        if (craneT < config().crane.moveSec) {
            craneT = Math.min(config().crane.moveSec, craneT + dt);
            updateCraneShift(stage10CraneSystem(), craneT / config().crane.moveSec);
        } else {
            setCraneLayout(stage10CraneSystem(), 'B');
            craneSettleT += dt;
            if (craneSettleT >= config().crane.settleSec) finishCraneShift(false);
        }
        return;
    }
    if (cine.kind === 'departure' && !dialogueCurrent && !dialogueQueue.length)
        finishExtraction(false);
}

function enterYard() {
    if (phase !== 'yardEntry') return;
    phase = 'craneMazeA';
    stage10SetMarkers(['safeBay']);
    spawnEncounter('yard', config().encounters.yard, false);
    showStageMsg('CROSS CONTAINER YARD A — REACH THE CRANE SAFE BAY', 4800);
}

function takeRelayToken() {
    if (phase !== 'warehouse') return;
    relayToken = true;
    phase = 'pipeRack';
    stage10SetMarkers(['defense']);
    spawnEncounter('pipeRack', config().encounters.pipeRack, true);
    queueDialogue('warehouseTrace');
    showStageMsg('RELAY TOKEN SECURED — REACH THE DEFENSE PIER', 4400);
}

function startDefenseArray() {
    if (phase !== 'pipeRack') return;
    phase = 'defenseArray';
    stage10SetMarkers([]);
    defenseWave = 0;
    activateDefenseArray(stage10DefenseSystem());
    spawnDefenseWave(0);
    queueDialogue('cannonSighted');
    spawnAmmoDrop(S10_DEFENSE.x - 105, S10_DEFENSE.z + 106, currentWeapon, 1e9);
    showStageMsg('DESTROY THE EXPOSED TRAVERSE SERVO', 4800);
}

function defenseMixForWave(index) {
    const configured = config().encounters.defense;
    if (Array.isArray(configured)) return configured[index] || configured[configured.length - 1];
    // The configured aggregate is deterministically partitioned across the
    // three bounded inter-servo groups. No independent mechanical count exists.
    const mix = {};
    for (const cls of ['C', 'B', 'A']) {
        const total = Math.max(0, configured[cls] | 0);
        const base = Math.floor(total / 3), remainder = total % 3;
        mix[cls] = base + (index < remainder ? 1 : 0);
    }
    return mix;
}

function spawnDefenseWave(index) {
    const name = `defense-${index + 1}`;
    spawnEncounter(name, defenseMixForWave(index), true);
}

function onServoDestroyed(servo) {
    addCamShake(4);
    const defenseState = stage10DefenseSystem();
    if (servo.id === 'traverse') {
        queueDialogue('servoOne');
        showStageMsg('TRAVERSE SERVO DESTROYED — SWEEP AUTHORITY LOST', 3800);
    } else if (servo.id === 'elevation') {
        queueDialogue('servoTwo');
        showStageMsg('ELEVATION SERVO DESTROYED — BLAST WIDTH REDUCED', 3800);
    } else {
        queueDialogue('arrayDown');
        showStageMsg('HARBOR DEFENSE ARRAY OFFLINE', 4400);
    }
    defenseWave = defenseState.destroyedCount;
    if (!defenseState.shutdown && defenseWave < 3) spawnDefenseWave(defenseWave);
    if (defenseState.shutdown) {
        phase = 'extract';
        stage10SetMarkers(['extract']);
        showStageMsg('AIR-DEFENSE CORRIDOR OPEN — REACH THE FREIGHT CARRIER', 4800);
    }
}

function cannonFire(point, radius, damage) {
    explodeAt(new THREE.Vector3(point.x, point.y, point.z), radius, damage);
    const distance = Math.hypot(camera.position.x - point.x, camera.position.z - point.z);
    if (distance <= radius) damagePlayerHp(damage);
    addCamShake(7);
}

function updateObjectives(dt) {
    const range = config().interactionRange;
    if (phase === 'yardEntry' && distanceTo(S10_YARD) <= range * 3) enterYard();
    else if (phase === 'craneMazeA' && encounterCount('yard') === 0
        && !stage10SpawnDeploymentPending('campaign-10-port', 'yard')
        && distanceTo(S10_SAFE_BAY) <= range) startCraneShift();
    else if (phase === 'warehouse' && encounterCount('warehouse') === 0
        && !stage10SpawnDeploymentPending('campaign-10-port', 'warehouse')
        && distanceTo(S10_RELAY) <= range) takeRelayToken();
    else if (phase === 'pipeRack' && encounterCount('pipeRack') === 0
        && !stage10SpawnDeploymentPending('campaign-10-port', 'pipeRack')
        && distanceTo(S10_DEFENSE) <= range * 4) startDefenseArray();
    else if (phase === 'defenseArray') {
        updateDefenseArray(stage10DefenseSystem(), dt, config().cannon,
            camera.position.x, camera.position.z, cannonFire);
    } else if (phase === 'extract' && distanceTo(S10_EXTRACT) <= range) startExtraction();
}

function objectivePoint() {
    if (phase === 'yardEntry') return S10_YARD;
    if (phase === 'craneMazeA') return S10_SAFE_BAY;
    if (phase === 'warehouse') return S10_RELAY;
    if (phase === 'pipeRack') return S10_DEFENSE;
    if (phase === 'extract') return S10_EXTRACT;
    return null;
}

export function stage10PortDebug() {
    const defenseState = stage10DefenseSystem();
    return {
        phase, complete, stageElapsed, relayToken,
        crane: craneDebug(stage10CraneSystem()),
        craneTiming: { move: craneT, settle: craneSettleT },
        defense: defenseArrayDebug(defenseState),
        defenseWave, activeDefenseEnemies: activeDefenseEnemyCount(),
        spawnDeployment: stage10SpawnDeploymentDebug('campaign-10-port'),
        encounters: Object.fromEntries(Object.keys(spawnedEncounters)
            .map((name) => [name, encounterCount(name)])),
        cinematic: cine?.kind || null,
        transitionSent,
        connectivity: stage10ConnectivityDebug(),
        world: stage10WorldDebug(),
    };
}

export function setStage10CompletionHook(fn) {
    completionHook = typeof fn === 'function' ? fn : null;
}

// Chapter 1 hook object. sceneManager only sees the Stage 10 facade in index.js.
export const stage10PortScene = {
    id: 'campaign-10-port',
    lightsKey: 'campaign-10-port',

    enter() {
        ensureStage10World();
        setActiveCampaignWorldRoots('campaign-10-port');
        setActiveStageLights('campaign-10-port');
        removeStage10Robots();
        resetCrates();
        resetBarrels();
        resetStage();
        spawnEncounter('entry', config().encounters.entry, false);
        placeSupplies();
        applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x596465, fogColor: 0x505b59, fogNear: 210, fogFar: 1700 });
        camera.position.set(S10_START.x, CFG.player.eyeHeight, S10_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0;
        player.onGround = true;
        startOpening();
        updateUI();
    },

    exit() {
        resetDialogue();
        if (cine) cleanupCine(0);
        stage10SetMarkers([]);
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
        updateStage10SpawnDeployment('campaign-10-port', dt);
        stage10UpdateWorld(dt, stageElapsed);
        if (!cine && !complete) updateObjectives(dt);
        // Animasi servo terakhir tetap selesai setelah fase langsung berpindah
        // ke extraction/departure. Saat array aktif, updateObjectives sudah
        // menjalankan visual bersama logika meriam.
        if (phase !== 'defenseArray') updateDefenseArrayVisuals(stage10DefenseSystem(), dt);
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage10Walkable, pos, oldX, oldZ, player.radius);
        stage10Resolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius);
        resolveBarrelBlock(pos, player.radius);
        slideWalk(stage10Walkable, pos, oldX, oldZ, player.radius);
        if (player.onGround) {
            pos.y = CFG.player.eyeHeight;
            player.vy = 0;
        }
    },

    groundHeight: stage10GroundHeight,
    get camOffset() { return cine ? cineCam : null; },

    bulletBlocked(b) {
        if (stage10SpawnDeploymentBulletHit('campaign-10-port', b,
            (x, z) => stage10SegHitsWall(b.px, b.pz, x, z, b.mesh.position.y))) return true;
        if (phase === 'defenseArray') {
            const damage = b.damage != null ? b.damage : CFG.weapons.bulletDamage;
            const result = defenseArrayBulletHit(stage10DefenseSystem(), b, damage);
            if (result.destroyed) onServoDestroyed(result.destroyed);
            if (result.hit) return true;
        }
        return stage10SegHitsWall(b.px, b.pz, b.mesh.position.x,
            b.mesh.position.z, b.mesh.position.y);
    },

    blastBlocked(x0, z0, x1, z1, y = 0) {
        return stage10SegHitsWall(x0, z0, x1, z1, y);
    },

    grenadeCollide(g, oldX, oldZ) {
        if (!stage10Walkable(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX;
            g.mesh.position.z = oldZ;
            g.vx = -g.vx * 0.4;
            g.vz = -g.vz * 0.4;
        }
        stage10Resolve(g.mesh.position, 2, 0);
    },

    robotAI(robot, dt, step) {
        if (robot.stage !== 10) return { skip: true };
        if (robot.machineBirth) {
            robot.state = 'idle'; robot.moving = false; robot.aiming = false;
            return {};
        }
        if (phase === 'opening' || phase === 'craneShift'
            || phase === 'departure' || phase === 'complete') {
            robot.state = 'idle';
            robot.moving = false;
            robot.aiming = false;
            return {};
        }
        return campaignRobotAI(robot, dt, step, {
            walkable: stage10Walkable,
            resolve: stage10Resolve,
            nav: stage10NavGrid(),
            activate: stage10RobotInView,
            pathWalkable: (x, z, radius) => stage10PathWalkable(x, z, radius),
            los: (x0, z0, x1, z1) => !stage10SegHitsWall(x0, z0, x1, z1, 8),
        });
    },

    clampRobot(robot, oldX, oldZ) {
        if (robot.machineBirth) return;
        campaignClampRobot(robot, oldX, oldZ, {
            walkable: stage10Walkable,
            resolve: stage10Resolve,
            pathWalkable: (x, z, radius) => stage10PathWalkable(x, z, radius),
        });
    },

    clampDropPos(x, z) {
        if (stage10Walkable(x, z, 2) && !stage10BlockedAt(x, z, 2)) return [x, z, 0];
        return [
            Math.max(S10_BOUNDS.x0 + 30, Math.min(S10_BOUNDS.x1 - 30, x)),
            Math.max(-220, Math.min(220, z)),
            0,
        ];
    },

    hudStatus() {
        if (phase === 'opening') return 'STAGE 10 — CHAPTER 1: THE IRON PORT';
        if (phase === 'yardEntry') return `ENTER CONTAINER TERMINAL — HOSTILES ${encounterCount('entry')}`;
        if (phase === 'craneMazeA') return `REACH CRANE SAFE BAY — YARD HOSTILES ${encounterCount('yard')}`;
        if (phase === 'craneShift') return 'PORT CRANES — RECONFIGURING TO LAYOUT B';
        if (phase === 'warehouse') return `SECURE RELAY TOKEN — WAREHOUSE HOSTILES ${encounterCount('warehouse')}`;
        if (phase === 'pipeRack') return `REACH DEFENSE PIER — HOSTILES ${encounterCount('pipeRack')}`;
        if (phase === 'defenseArray') {
            const D = stage10DefenseSystem();
            const servo = D.servos[D.destroyedCount];
            return servo
                ? `${servo.label} — ${Math.ceil(Math.max(0, servo.hp))} HP — HOSTILES ${activeDefenseEnemyCount()}`
                : 'HARBOR DEFENSE ARRAY OFFLINE';
        }
        if (phase === 'extract') return 'BOARD ARMORED FREIGHT CARRIER';
        if (phase === 'departure') return 'NORTHBOUND ROUTE TO IKN';
        return 'STAGE 10 — CHAPTER 1 COMPLETE';
    },

    radarLandmarks(plot) {
        const objective = objectivePoint();
        if (objective) plot(objective.x - camera.position.x,
            objective.z - camera.position.z, '#ffb03b', 5, true);
        if (phase === 'defenseArray') {
            const system = stage10DefenseSystem();
            const servo = system.servos[system.destroyedCount];
            if (servo) plot(servo.x - camera.position.x,
                servo.z - camera.position.z, '#ff4a3c', 5, true);
        }
    },

    countStageRobots: () => countStageRobots(10),
};
