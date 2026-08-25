// Stage 9 Chapter 2 — playable airport-building interior.

import { CFG } from '../../../../core/config.js';
import { player } from '../../../../core/state.js';
import { camera } from '../../../../core/renderer.js';
import { showStageMsg } from '../../../../core/dom.js';
import { resolveCrateBlock } from '../../../../entities/crates.js';
import { resolveBarrelBlock } from '../../../../entities/barrels.js';
import { slideWalk } from '../../../../utils/collision.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { campaignRobotAI, campaignClampRobot } from '../../utility/common.js';
import {
    S9_INTERIOR_KEY, S9_BUILDING_START, S9_INTERIOR_CHECKPOINT,
    S9_BUILDING_EXIT, S9_INTERIOR_BOUNDS, S9_INTERIOR_ENV,
    stage9InteriorWalkable, stage9Resolve, stage9SegHitsWall, stage9NavGrid,
    stage9BlockedAt, stage9SetMarkers, stage9UpdateWorld, setStage9WorldChapter,
} from './world.js';
import {
    phase, stageElapsed, setStage9Phase, queueStage9Dialogue, spawnStage9Encounter,
    stage9EncounterCount, stage9RobotInView, enterStage9Sub,
} from './runtime.js';
import { runwayScene } from './runway.js';

function near(p, r) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r;
}

function updateProgress() {
    const range = CFG.campaign.stage9.interactionRange;
    if (phase === 'interiorCheckin'
        && stage9EncounterCount('interiorCheckin') === 0
        && near(S9_INTERIOR_CHECKPOINT, range * 2)) {
        setStage9Phase('interiorConcourse');
        stage9SetMarkers(['buildingExit']);
        spawnStage9Encounter('interiorConcourse',
            CFG.campaign.stage9.encounters.interiorConcourse, false);
        showStageMsg('SECURITY HALL CLEAR — FIGHT THROUGH THE CONCOURSE', 4600);
    } else if (phase === 'interiorConcourse'
        && stage9EncounterCount('interiorConcourse') === 0
        && near(S9_BUILDING_EXIT, range)) {
        setStage9Phase('runwayApron');
        enterStage9Sub(runwayScene);
    }
}

export const interiorScene = {
    id: 'campaign-9-interior',
    chapter: 2,
    enter() {
        setStage9WorldChapter('interior');
        setActiveCampaignWorldRoots(S9_INTERIOR_KEY);
        setActiveStageLights(S9_INTERIOR_KEY);
        enterCityEnv(S9_INTERIOR_ENV);
        camera.position.set(S9_BUILDING_START.x, CFG.player.eyeHeight, S9_BUILDING_START.z);
        player.vy = 0; player.onGround = true;
        stage9SetMarkers(['interiorCheckpoint']);
        spawnStage9Encounter('interiorCheckin',
            CFG.campaign.stage9.encounters.interiorCheckin, false);
        queueStage9Dialogue('buildingEntry');
        showStageMsg('CHAPTER 2 — CLEAR CHECK-IN AND REACH SECURITY', 4800);
    },
    exit() { stage9SetMarkers([]); },
    updateMode(dt) {
        stage9UpdateWorld(dt, stageElapsed, 0, false, 0);
        updateProgress();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage9InteriorWalkable, pos, oldX, oldZ, player.radius);
        stage9Resolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius);
        resolveBarrelBlock(pos, player.radius);
        slideWalk(stage9InteriorWalkable, pos, oldX, oldZ, player.radius);
        if (player.onGround) { pos.y = CFG.player.eyeHeight; player.vy = 0; }
    },
    groundHeight: () => 0,
    camOffset: null,
    bulletBlocked(b) {
        return stage9SegHitsWall(b.px, b.pz, b.mesh.position.x,
            b.mesh.position.z, b.mesh.position.y);
    },
    blastBlocked: stage9SegHitsWall,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage9InteriorWalkable(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -0.4; g.vz *= -0.4;
        }
        stage9Resolve(g.mesh.position, 2, 0);
    },
    robotAI(robot, dt, step) {
        if (robot.stage !== 9) return { skip: true };
        return campaignRobotAI(robot, dt, step, {
            walkable: stage9InteriorWalkable, resolve: stage9Resolve,
            nav: stage9NavGrid('interior'),
            activate: stage9RobotInView,
            los: (x0, z0, x1, z1) => !stage9SegHitsWall(x0, z0, x1, z1, 8),
        });
    },
    clampRobot(robot, oldX, oldZ) {
        campaignClampRobot(robot, oldX, oldZ,
            { walkable: stage9InteriorWalkable, resolve: stage9Resolve });
    },
    clampDropPos(x, z) {
        if (stage9InteriorWalkable(x, z, 2) && !stage9BlockedAt(x, z, 2)) return [x, z, 0];
        const nx = Math.max(S9_INTERIOR_BOUNDS.x0 + 18,
            Math.min(S9_INTERIOR_BOUNDS.x1 - 18, x));
        const nz = Math.max(S9_INTERIOR_BOUNDS.z0 + 18,
            Math.min(S9_INTERIOR_BOUNDS.z1 - 18, z));
        return [nx, nz, 0];
    },
    hudStatus() {
        if (phase === 'interiorCheckin')
            return `CHAPTER 2 — REACH SECURITY — HOSTILES ${stage9EncounterCount('interiorCheckin')}`;
        return `CHAPTER 2 — CROSS CONCOURSE — HOSTILES ${stage9EncounterCount('interiorConcourse')}`;
    },
    radarLandmarks(plot) {
        const p = phase === 'interiorCheckin' ? S9_INTERIOR_CHECKPOINT : S9_BUILDING_EXIT;
        plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
