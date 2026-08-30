// Stage 11 Chapter 1 — Major Gibran parachutes into the forest outside IKN,
// fights through a fabricator checkpoint every 50 metres plus three escalating
// weapon-vehicle checkpoints, and reaches the existing civic-axis chapter.

import { CFG } from '../../../../core/config.js';
import { player, keys, setCinematicActive } from '../../../../core/state.js';
import {
    scene, camera, viewCam, CAM_LOOK_DROP, camFocusPos,
} from '../../../../core/renderer.js';
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
    S11_FOREST_ROUTE_METERS,
    stage11ForestPointAtMeter, stage11ForestMeterAt,
    stage11ForestWalk, stage11ForestResolve,
    stage11ForestSegBlocked, stage11ForestGroundHeight, stage11ForestNav,
    setStage11ParachutePose, setStage11ForestExitMarker,
    resetStage11ForestVisuals, updateStage11ForestVisuals,
    stage11ForestWorldDebug,
} from './forestWorld.js';
import {
    phase, complete, setStage11Phase, enterStage11Sub,
    queueStage11Dialogue, clearStage11DialogueQueue,
    clearStage11Robots,
} from './runtime.js';
import {
    STAGE11_FOREST_VEHICLE_GROUP as VG,
    resetStage11WeaponVehicles, updateStage11WeaponVehicles,
    cleanupStage11WeaponVehicles, stage11WeaponVehicleRobotAI,
    stage11WeaponVehicleBulletHit,
    stage11WeaponVehiclesAllCleared, stage11NearestWeaponVehicle,
    stage11VisibleWeaponVehicle, stage11WeaponVehicleGroupCleared,
    stage11WeaponVehiclesDebug,
} from './weaponVehicles.js';
import {
    resetStage11ForestCheckpoints, updateStage11ForestCheckpoints,
    cleanupStage11ForestCheckpoints, stage11ForestCheckpointBulletHit,
    stage11ForestCheckpointsAllCleared, stage11ForestNearestFabricator,
    stage11ForestCheckpointStatus, stage11ForestCheckpointsDebug,
} from './forestCheckpoints.js';
import {
    resetStage11ForestMortar, updateStage11ForestMortar,
    cleanupStage11ForestMortar, stage11ForestMortarBlastOrigin,
    stage11ForestMortarInZone, stage11ForestMortarDebug,
} from './forestMortar.js';
import { surfaceScene } from './surface.js';

const PARACHUTE_CAM = Object.freeze({ x: 92, y: 82, z: -104 });
const forestCam = { x: 0, y: 0, z: 0 };
let elapsed = 0, cine = null;
let cityCommitted = false, landed = false;
let combatMeter = null, combatCamBlend = 0;

function near(p, r) {
    return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r;
}
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function parachuteCfg() { return CFG.campaign.stage11.parachute; }
function vehicleCfg() { return CFG.campaign.stage11.forestVehicles; }

function pointInForestView(x, z, y = 8) {
    const off = forestCam;
    let focus = camFocusPos();
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
    const tanY = Math.tan(((viewCam?.fov || 50) * Math.PI / 180) * .5);
    const tanX = tanY * (viewCam?.aspect || 1);
    const screenX = (dx * rx + dz * rz) / (depth * tanX);
    const screenY = (dx * ux + dy * uy + dz * uz) / (depth * tanY);
    return Math.abs(screenX) <= 1 && Math.abs(screenY) <= 1;
}

function updateCombatCamera(dt) {
    if (combatMeter != null && stage11WeaponVehicleGroupCleared(VG, combatMeter))
        combatMeter = null;
    if (combatMeter == null) {
        const visible = stage11VisibleWeaponVehicle(VG);
        if (visible) combatMeter = visible.meter;
    }
    const target = combatMeter == null ? 0 : 1;
    const C = vehicleCfg().camera;
    const k = 1 - Math.exp(-C.easePerSec * dt);
    combatCamBlend += (target - combatCamBlend) * k;
    if (Math.abs(combatCamBlend - target) < 1e-4) combatCamBlend = target;
    const s = smooth(combatCamBlend);
    forestCam.x = C.normal.x + (C.combat.x - C.normal.x) * s;
    forestCam.y = C.normal.y + (C.combat.y - C.normal.y) * s;
    forestCam.z = C.normal.z + (C.combat.z - C.normal.z) * s;
}

export function resetForest() {
    elapsed = 0; cine = null; cityCommitted = false; landed = false;
    combatMeter = null; combatCamBlend = 0;
    Object.assign(forestCam, vehicleCfg().camera.normal);
    resetStage11ForestVisuals(); resetStage11ForestCheckpoints();
    resetStage11ForestMortar(); setAvatarRappel(false);
}

function placeForestItems() {
    for (const [meter, lateral] of [[45, -34], [185, 38], [365, -36], [610, 34]]) {
        const p = stage11ForestPointAtMeter(meter, lateral); spawnCrate(p.x, p.z, 0);
    }
    for (const [meter, lateral] of [[120, 32], [440, -34], [690, 35]]) {
        const p = stage11ForestPointAtMeter(meter, lateral); spawnBarrel(p.x, p.z, 0);
    }
    let p = stage11ForestPointAtMeter(225, 34);
    spawnAmmoDrop(p.x, p.z, 'rifle', 1e9);
    p = stage11ForestPointAtMeter(540, -35);
    spawnAmmoDrop(p.x, p.z, 'launcher', 1e9);
    p = stage11ForestPointAtMeter(710, 35);
    spawnMedkitDrop(p.x, p.z, 1e9);
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
    cleanupStage11WeaponVehicles(VG); cleanupStage11ForestCheckpoints();
    cleanupStage11ForestMortar();
    clearStage11Robots(); resetCrates(); resetBarrels();
    setCineFade(1, CFG.campaign.stage11.fadeSec);
    enterStage11Sub(surfaceScene, { fade: true });
}
function updateProgress() {
    if (phase === 'forestAdvance' && stage11WeaponVehiclesAllCleared(VG)
        && stage11ForestCheckpointsAllCleared()) {
        setStage11Phase('forestExit'); setStage11ForestExitMarker(true);
        showStageMsg('VEHICLE PATROLS DESTROYED — ENTER IKN', 4300);
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
        clearStage11Robots(); resetCrates(); resetBarrels(); resetForest();
        resetStage11WeaponVehicles(VG); placeForestItems();
        if (avatarGroup) avatarGroup.visible = true;
        startParachute();
    },
    exit() {
        cleanupParachute(); cleanupStage11WeaponVehicles(VG);
        cleanupStage11ForestCheckpoints(); cleanupStage11ForestMortar();
        setStage11ForestExitMarker(false);
    },
    updateMode(dt) {
        elapsed += dt; updateStage11ForestVisuals(dt);
        updateStage11WeaponVehicles(VG, dt, {
            los: (x0, z0, x1, z1) => !stage11ForestSegBlocked(x0, z0, x1, z1),
            inView: pointInForestView,
        });
        updateStage11ForestCheckpoints(dt, { inView: pointInForestView });
        // Artillery only falls while the player has real control: a cutscene or
        // a finished chapter must never take a shell it cannot dodge.
        updateStage11ForestMortar(dt, { live: !cine && !complete
            && phase === 'forestAdvance' });
        updateCombatCamera(dt);
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
    get camOffset() { return cine ? PARACHUTE_CAM : forestCam; },
    bulletBlocked(b) {
        // Kendaraan dan fabricator adalah target sekaligus blocker. Keduanya
        // diuji sebelum scenery agar tembakan yang mengenai mesh tak terlihat
        // seperti ditelan aspal/cover tanpa damage atau feedback.
        return stage11WeaponVehicleBulletHit(VG, b)
            || stage11ForestCheckpointBulletHit(b)
            || stage11ForestSegBlocked(b.px, b.pz,
                b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked(x0, z0, x1, z1) {
        // A mortar round falls from above, so road-level cover between its
        // impact and a robot beside that cover must not absorb it.
        return !stage11ForestMortarBlastOrigin(x0, z0)
            && stage11ForestSegBlocked(x0, z0, x1, z1);
    },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11ForestWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -.4; g.vz *= -.4;
        }
        stage11ForestResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        // A robot still being printed is posed by the fabricator, not the AI.
        if (bot.machineBirth) {
            bot.state = 'idle'; bot.moving = false; bot.aiming = false; return {};
        }
        const mounted = stage11WeaponVehicleRobotAI(bot);
        if (mounted) return mounted;
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
        const here = stage11ForestMeterAt(camera.position.x, camera.position.z);
        const meter = Math.round(here);
        const shelled = stage11ForestMortarInZone(here) ? ' | MORTAR FIRE' : '';
        const gate = stage11ForestCheckpointStatus();
        if (gate) return `CHECKPOINT ${gate.meter} M — FABRICATORS `
            + `${gate.alive}/${gate.total}`
            + (gate.vehicles ? ` · VEHICLES ${gate.vehicles}` : '')
            + `${shelled} | Hostiles: ${countStageRobots(11)}`;
        return `OUTER IKN ROUTE ${meter} / ${S11_FOREST_ROUTE_METERS} M`
            + `${shelled} | Hostiles: ${countStageRobots(11)}`;
    },
    radarLandmarks(plot) {
        const p = phase === 'forestExit' ? S11_FOREST_GATE
            : stage11ForestNearestFabricator()
            || stage11NearestWeaponVehicle(VG) || S11_FOREST_GATE;
        plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const forestDebug = () => ({
    elapsed, cinematic: !!cine, landed, cityCommitted,
    descent: cine ? { t: cine.t, duration: parachuteCfg().descentSec,
        height: camera.position.y - CFG.player.eyeHeight } : null,
    routeMeter: stage11ForestMeterAt(camera.position.x, camera.position.z),
    routeMeters: S11_FOREST_ROUTE_METERS,
    vehicles: stage11WeaponVehiclesDebug(VG),
    checkpoints: stage11ForestCheckpointsDebug(),
    mortar: stage11ForestMortarDebug(),
    world: stage11ForestWorldDebug(),
    camera: {
        base: { ...vehicleCfg().camera.normal },
        combat: { ...vehicleCfg().camera.combat },
        current: { ...forestCam }, combatMeter, combatBlend: combatCamBlend,
        easePerSec: vehicleCfg().camera.easePerSec,
        pasupatiScale: true, configOwned: true,
    },
    cam: cine ? { ...PARACHUTE_CAM } : { ...forestCam },
});
