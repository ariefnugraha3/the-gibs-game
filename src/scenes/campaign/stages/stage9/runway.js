// Stage 9 Chapter 3 — apron/runway, fuel pump, aircraft and takeoff.

import { CFG } from '../../../../core/config.js';
import { player, keys, setCinematicActive } from '../../../../core/state.js';
import { camera, setCineFocus } from '../../../../core/renderer.js';
import {
    showStageMsg, setCineBars, showCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { avatarGroup } from '../../../../entities/playerAvatar.js';
import { resolveCrateBlock } from '../../../../entities/crates.js';
import { resolveBarrelBlock } from '../../../../entities/barrels.js';
import { slideWalk } from '../../../../utils/collision.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { campaignRobotAI, campaignClampRobot } from '../../utility/common.js';
import {
    S9_RUNWAY_KEY, S9_RUNWAY_START, S9_RUNWAY_CHECKPOINT,
    S9_PUMP, S9_BOARD, S9_BOUNDS, S9_EXTERIOR_ENV,
    stage9RunwayWalkable, stage9Resolve, stage9SegHitsWall, stage9NavGrid,
    stage9BlockedAt, stage9Transport, stage9SetFuelPumpOn, stage9SetMarkers,
    stage9UpdateWorld, setStage9WorldChapter,
} from './world.js';
import {
    phase, complete, cine, stageElapsed, fuelT, fuelPumpOn, takeoffT,
    setStage9Phase, setStage9Cine, setStage9FuelPumpOn, setStage9TakeoffTime,
    addStage9Fuel, cleanupStage9Cine, queueStage9Dialogue,
    spawnStage9Encounter, stage9EncounterCount, finishStage9,
} from './runtime.js';

const cineCam = new THREE.Vector3(-112, 102, 116);

function near(p, r) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r;
}

function startFuelPump() {
    if (phase !== 'fuelPump' || fuelPumpOn
        || !near(S9_PUMP, CFG.campaign.stage9.fuel.interactionRange)) return;
    setStage9FuelPumpOn(true);
    setStage9Phase('fueling');
    stage9SetFuelPumpOn(true);
    stage9SetMarkers([]);
    queueStage9Dialogue('pumpStarted');
    showStageMsg('FUEL PUMP ACTIVE — FILL THE AIRCRAFT', 4200);
}

function finishFueling() {
    if (phase !== 'fueling' || fuelT < CFG.campaign.stage9.fuel.durationSec) return;
    setStage9Phase('board');
    stage9SetMarkers(['board']);
    queueStage9Dialogue('fuelFull');
    showStageMsg('AIRCRAFT FUEL FULL — APPROACH THE TRANSPORT', 4600);
}

function finishTakeoff(skipped = false) {
    if (complete) return;
    if (skipped) {
        setStage9TakeoffTime(CFG.campaign.stage9.takeoffSec);
        stage9UpdateWorld(0, stageElapsed, 1, fuelPumpOn, 1);
    }
    if (avatarGroup) avatarGroup.visible = true;
    finishStage9();
}

function startTakeoff() {
    if (phase !== 'board' || cine || !near(S9_BOARD, CFG.campaign.stage9.interactionRange)) return;
    setStage9Phase('takeoff');
    setStage9TakeoffTime(0);
    stage9SetMarkers([]);
    releaseInputs(); clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true);
    setStage9Cine({ kind: 'takeoff', t: 0, shot: -1 });
    if (avatarGroup) avatarGroup.visible = false;
    queueStage9Dialogue('departure');
    setCineFocus(stage9Transport().position.x, stage9Transport().position.z, true);
    showCutsceneSkip(() => finishTakeoff(true));
}

function updateTakeoff(dt) {
    const next = Math.min(CFG.campaign.stage9.takeoffSec, takeoffT + dt);
    setStage9TakeoffTime(next);
    const progress = next / CFG.campaign.stage9.takeoffSec;
    stage9UpdateWorld(dt, stageElapsed, 1, fuelPumpOn, progress);
    const aircraft = stage9Transport();
    setCineFocus(aircraft.position.x, aircraft.position.z);
    if (next >= CFG.campaign.stage9.takeoffSec) finishTakeoff(false);
}

function updateObjective(dt) {
    if (phase === 'runwayApron'
        && spawnGateReady('runwayApron', S9_RUNWAY_CHECKPOINT)) {
        setStage9Phase('runwayAircraft');
        stage9SetMarkers(['pump']);
        spawnStage9Encounter('runwayAircraft',
            CFG.campaign.stage9.encounters.runwayAircraft, true);
        showStageMsg('SERVICE YARD CLEAR — CROSS THE TAXIWAY', 4600);
    } else if (phase === 'runwayAircraft'
        && stage9EncounterCount('runwayAircraft') === 0) {
        setStage9Phase('fuelPump');
        showStageMsg('AIRCRAFT STAND CLEAR — ACTIVATE THE FUEL PUMP', 4400);
    } else if (phase === 'fuelPump') startFuelPump();
    else if (phase === 'fueling') {
        addStage9Fuel(dt);
        finishFueling();
    } else if (phase === 'board') startTakeoff();
}

function spawnGateReady(name, point) {
    return stage9EncounterCount(name) === 0
        && near(point, CFG.campaign.stage9.interactionRange * 2);
}

export const runwayScene = {
    id: 'campaign-9-runway',
    chapter: 3,
    enter() {
        setStage9WorldChapter('runway');
        setActiveCampaignWorldRoots(S9_RUNWAY_KEY);
        setActiveStageLights(S9_RUNWAY_KEY);
        enterCityEnv(S9_EXTERIOR_ENV);
        camera.position.set(S9_RUNWAY_START.x, CFG.player.eyeHeight, S9_RUNWAY_START.z);
        player.vy = 0; player.onGround = true;
        stage9SetMarkers(['runwayCheckpoint']);
        spawnStage9Encounter('runwayApron',
            CFG.campaign.stage9.encounters.runwayApron, true);
        queueStage9Dialogue('runwayEntry');
        showStageMsg('CHAPTER 3 — CLEAR THE APRON SERVICE YARD', 4800);
    },
    exit() {
        if (cine?.kind === 'takeoff') cleanupStage9Cine(0);
        if (avatarGroup) avatarGroup.visible = true;
        stage9SetMarkers([]);
    },
    updateMode(dt) {
        if (cine?.kind === 'takeoff') updateTakeoff(dt);
        else {
            stage9UpdateWorld(dt, stageElapsed,
                CFG.campaign.stage9.fuel.durationSec > 0
                    ? fuelT / CFG.campaign.stage9.fuel.durationSec : 1,
                fuelPumpOn, complete ? 1 : 0);
            if (!complete) updateObjective(dt);
        }
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage9RunwayWalkable, pos, oldX, oldZ, player.radius);
        stage9Resolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius);
        resolveBarrelBlock(pos, player.radius);
        slideWalk(stage9RunwayWalkable, pos, oldX, oldZ, player.radius);
        if (player.onGround) { pos.y = CFG.player.eyeHeight; player.vy = 0; }
    },
    groundHeight: () => 0,
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) {
        return stage9SegHitsWall(b.px, b.pz, b.mesh.position.x,
            b.mesh.position.z, b.mesh.position.y);
    },
    blastBlocked: stage9SegHitsWall,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage9RunwayWalkable(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -0.4; g.vz *= -0.4;
        }
        stage9Resolve(g.mesh.position, 2, 0);
    },
    robotAI(robot, dt, step) {
        if (robot.stage !== 9) return { skip: true };
        if (phase === 'takeoff' || phase === 'complete') {
            robot.state = 'idle'; robot.moving = false; robot.aiming = false; return {};
        }
        return campaignRobotAI(robot, dt, step, {
            walkable: stage9RunwayWalkable, resolve: stage9Resolve,
            nav: stage9NavGrid('runway'),
            los: (x0, z0, x1, z1) => !stage9SegHitsWall(x0, z0, x1, z1, 8),
        });
    },
    clampRobot(robot, oldX, oldZ) {
        campaignClampRobot(robot, oldX, oldZ,
            { walkable: stage9RunwayWalkable, resolve: stage9Resolve });
    },
    clampDropPos(x, z) {
        if (stage9RunwayWalkable(x, z, 2) && !stage9BlockedAt(x, z, 2)) return [x, z, 0];
        const nx = Math.max(S9_BOUNDS.x0 + 20, Math.min(S9_BOUNDS.x1 - 20, x));
        const nz = Math.max(-250, Math.min(270, z));
        return [nx, nz, 0];
    },
    hudStatus() {
        if (phase === 'runwayApron')
            return `CHAPTER 3 — CROSS SERVICE YARD — HOSTILES ${stage9EncounterCount('runwayApron')}`;
        if (phase === 'runwayAircraft')
            return `CHAPTER 3 — SECURE AIRCRAFT STAND — HOSTILES ${stage9EncounterCount('runwayAircraft')}`;
        if (phase === 'fuelPump') return 'CHAPTER 3 — TURN ON THE FUEL PUMP';
        if (phase === 'fueling') return `CHAPTER 3 — FUELING AIRCRAFT ${Math.floor(
            fuelT / CFG.campaign.stage9.fuel.durationSec * 100)}%`;
        if (phase === 'board') return 'AIRCRAFT FUEL FULL — APPROACH THE TRANSPORT';
        if (phase === 'takeoff') return 'STAGE 9 — DEPARTURE';
        return 'STAGE 9 COMPLETE';
    },
    radarLandmarks(plot) {
        const p = phase === 'runwayApron' ? S9_RUNWAY_CHECKPOINT
            : phase === 'board' ? S9_BOARD : S9_PUMP;
        if (!complete) plot(p.x - camera.position.x, p.z - camera.position.z,
            '#ffb03b', 5, true);
    },
};
