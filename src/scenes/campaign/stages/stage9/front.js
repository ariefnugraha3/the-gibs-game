// Stage 9 Chapter 1 — access road and terminal forecourt.

import { CFG } from '../../../../core/config.js';
import { player, keys, setCinematicActive } from '../../../../core/state.js';
import { camera, setCineFocus } from '../../../../core/renderer.js';
import { showStageMsg, setCineBars, setCineFade,
    showCutsceneSkip } from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { resolveCrateBlock } from '../../../../entities/crates.js';
import { resolveBarrelBlock } from '../../../../entities/barrels.js';
import { slideWalk } from '../../../../utils/collision.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights } from '../../../../world/lighting.js';
import { campaignRobotAI, campaignClampRobot } from '../../utility/common.js';
import {
    S9_FRONT_KEY, S9_START, S9_FRONT_CHECKPOINT, S9_BUILDING_ENTRY, S9_FRONT_BOUNDS,
    stage9FrontWalkable, stage9Resolve, stage9SegHitsWall, stage9NavGrid,
    stage9BlockedAt, stage9SetMarkers, stage9UpdateWorld, setStage9WorldChapter,
} from './world.js';
import {
    phase, cine, stageElapsed, setStage9Phase, setStage9Cine, cleanupStage9Cine,
    queueStage9Dialogue, resetStage9Dialogue, stage9DialogueIdle,
    spawnStage9FrontPopulation, stage9RobotInView,
    stage9EncounterCount, enterStage9Sub,
} from './runtime.js';
import { interiorScene } from './interior.js';

const cineCam = new THREE.Vector3(-112, 102, 116);

function near(p, r) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r;
}

function movePlayerTo(p) {
    camera.position.set(p.x, CFG.player.eyeHeight, p.z);
    player.vy = 0;
    player.onGround = true;
}

function finishOpening(skipped = false) {
    if (!cine || cine.kind !== 'opening') return;
    if (skipped) resetStage9Dialogue();
    cleanupStage9Cine(CFG.campaign.stage9.fadeSec);
    setStage9Phase('frontRoad');
    stage9SetMarkers([]);
    queueStage9Dialogue('outsideCommand');
    showStageMsg('CHAPTER 1 — BREAK THROUGH THE TOLL ACCESS', 4800);
}

function startOpening() {
    releaseInputs();
    clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true);
    setCineBars(true);
    setCineFade(1, 0);
    setCineFade(0, CFG.campaign.stage9.fadeSec);
    setStage9Cine({ kind: 'opening', t: 0, shot: -1 });
    queueStage9Dialogue('openingCommand');
    queueStage9Dialogue('openingGibran');
    setCineFocus(305160, 160, true);
    showCutsceneSkip(() => finishOpening(true));
}

function updateOpening(dt) {
    cine.t += dt;
    const third = CFG.campaign.stage9.openingMinSec / 3;
    const shot = Math.min(2, Math.floor(cine.t / Math.max(0.01, third)));
    if (shot !== cine.shot) {
        cine.shot = shot;
        if (shot === 0) setCineFocus(305160, 160, true);
        else if (shot === 1) setCineFocus(S9_FRONT_CHECKPOINT.x,
            S9_FRONT_CHECKPOINT.z, true);
        else setCineFocus(S9_BUILDING_ENTRY.x, S9_BUILDING_ENTRY.z, true);
    }
    if (cine.t >= CFG.campaign.stage9.openingMinSec && stage9DialogueIdle())
        finishOpening(false);
}

function updateProgress() {
    const range = CFG.campaign.stage9.interactionRange * 2;
    const hostiles = stage9EncounterCount('frontToll')
        + stage9EncounterCount('frontForecourt');
    if (phase === 'frontRoad' && hostiles === 0) {
        setStage9Phase('frontExit');
        stage9SetMarkers(['building']);
        showStageMsg('TOLL ACCESS CLEAR — CROSS THE TERMINAL FORECOURT', 4600);
    } else if (phase === 'frontExit' && near(S9_BUILDING_ENTRY, range)) {
        setStage9Phase('interiorCheckin');
        enterStage9Sub(interiorScene);
    }
}

export function stage9FrontEngagementLocked() {
    return phase === 'opening' || !stage9DialogueIdle();
}

function holdRobotForDialogue(robot) {
    // Damage can wake an idle robot inside entities/robots.js after this hook
    // has run. Reasserting idle every locked frame—and once again on release—
    // prevents that hidden aggro from escaping the radio-dialogue lock.
    robot.state = 'idle';
    robot.groundY = 0;
    robot.moving = false;
    robot.aiming = false;
    robot.navIdle = false;
    robot.losOK = false;
    robot.windT = 0;
    robot.clawT = 0;
}

export const frontScene = {
    id: 'campaign-9-front',
    chapter: 1,
    enter() {
        setStage9WorldChapter('front');
        setActiveCampaignWorldRoots(S9_FRONT_KEY);
        setActiveStageLights(S9_FRONT_KEY);
        movePlayerTo(S9_START);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        stage9SetMarkers([]);
        spawnStage9FrontPopulation();
        startOpening();
    },
    exit() {
        if (cine?.kind === 'opening') cleanupStage9Cine(0);
        stage9SetMarkers([]);
    },
    updateMode(dt) {
        stage9UpdateWorld(dt, stageElapsed, 0, false, 0);
        if (cine?.kind === 'opening') updateOpening(dt);
        else updateProgress();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage9FrontWalkable, pos, oldX, oldZ, player.radius);
        stage9Resolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius);
        resolveBarrelBlock(pos, player.radius);
        slideWalk(stage9FrontWalkable, pos, oldX, oldZ, player.radius);
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
        if (!stage9FrontWalkable(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -0.4; g.vz *= -0.4;
        }
        stage9Resolve(g.mesh.position, 2, 0);
    },
    robotAI(robot, dt, step) {
        if (robot.stage !== 9) return { skip: true };
        if (stage9FrontEngagementLocked()) {
            robot.stage9DialogueLocked = true;
            holdRobotForDialogue(robot);
            return {};
        }
        if (robot.stage9DialogueLocked) {
            // Frame pertama setelah panel hilang selalu dimulai dari idle.
            // campaignRobotAI di bawah kemudian hanya membangunkannya bila
            // badan robot memang sudah berada di viewport player.
            holdRobotForDialogue(robot);
            robot.stage9DialogueLocked = false;
        }
        return campaignRobotAI(robot, dt, step, {
            walkable: stage9FrontWalkable, resolve: stage9Resolve,
            nav: stage9NavGrid('front'),
            activate: z => stage9RobotInView(z),
            los: (x0, z0, x1, z1) => !stage9SegHitsWall(x0, z0, x1, z1, 8),
        });
    },
    clampRobot(robot, oldX, oldZ) {
        campaignClampRobot(robot, oldX, oldZ,
            { walkable: stage9FrontWalkable, resolve: stage9Resolve });
    },
    clampDropPos(x, z) {
        if (stage9FrontWalkable(x, z, 2) && !stage9BlockedAt(x, z, 2)) return [x, z, 0];
        return [Math.max(S9_FRONT_BOUNDS.x0 + 20, Math.min(306530, x)), 160, 0];
    },
    hudStatus() {
        if (phase === 'opening') return 'STAGE 9 — KERTAJATI AIRPORT';
        const hostiles = stage9EncounterCount('frontToll')
            + stage9EncounterCount('frontForecourt');
        if (phase === 'frontRoad')
            return `CHAPTER 1 — CLEAR AIRPORT ACCESS — HOSTILES ${hostiles}`;
        return 'CHAPTER 1 — ENTER THE TERMINAL';
    },
    radarLandmarks(plot) {
        if (phase === 'frontExit') {
            plot(S9_BUILDING_ENTRY.x - camera.position.x,
                S9_BUILDING_ENTRY.z - camera.position.z, '#ffb03b', 5, true);
            return;
        }
    },
};
