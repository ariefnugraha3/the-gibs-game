// Stage 11 Chapter 2 — the IKN city controller.
//
// The player lands on the southern boulevard and has to fight 1.5 km up a real
// road network to the enemy headquarters at its head. The roads are the only
// walkable surface, the two roundabouts are solid in the middle, and thirteen
// blockades stand across them — some on the direct route, some on branches, some
// on roads that go nowhere. Nothing signposts which is which.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { player, keys, robots, setCinematicActive } from '../../../../core/state.js';
import {
    scene, camera, viewCam, CAM_LOOK_DROP, camFocusPos, setCineFocus,
} from '../../../../core/renderer.js';
import { showStageMsg, setCineBars, setCineFade, showCutsceneSkip,
    hideCutsceneSkip } from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import { spawnBarrel, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import {
    campaignRobotAI, campaignClampRobot, countStageRobots, spawnCampaignRobot,
} from '../../utility/common.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights, applyLightPreset } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import {
    STAGE11_SURFACE_LIGHTS_KEY, S11_SURFACE_START, S11_DESCENT,
    S11_CITY_HEADQUARTERS,
    stage11SurfaceWalk, stage11SurfaceResolve, stage11SurfaceSegBlocked,
    stage11SurfaceGroundHeight, stage11SurfaceNav, stage11SurfaceHitsBlocker,
    resetStage11SurfaceVisuals, updateStage11SurfaceVisuals,
    setStage11DescentOpen, stage11SurfaceWorldDebug,
} from './surfaceWorld.js';
import {
    S11_CITY_EDGES, S11_CITY_ROUNDABOUTS, stage11CityProjectToRoad,
} from './cityRoads.js';
import {
    resetStage11CityBlockades, updateStage11CityBlockades,
    cleanupStage11CityBlockades, stage11CityBlockadeBulletHit,
    stage11CityBlockadeTarget, stage11CityBlockadeStatus,
    stage11CityGateBlocksMovement, stage11CityBlockadesDebug,
} from './cityBlockades.js';
import {
    STAGE11_CITY_VEHICLE_GROUP as VG,
    resetStage11WeaponVehicles, updateStage11WeaponVehicles,
    cleanupStage11WeaponVehicles, stage11WeaponVehicleRobotAI,
    stage11WeaponVehicleBulletHit,
    stage11NearestWeaponVehicle, stage11VisibleWeaponVehicle,
    stage11WeaponVehicleGroupCleared, stage11WeaponVehiclesDebug,
} from './weaponVehicles.js';
import {
    phase, complete, setStage11Phase, enterStage11Sub,
    queueStage11Dialogue, stage11DialogueIdle, clearStage11DialogueQueue,
} from './runtime.js';
import { rootScene } from './root.js';
import {
    STAGE11_CHAPTER_CAMERA, stage11ChapterScreenDirection,
} from './chapterCamera.js';

const cineCam = { ...STAGE11_CHAPTER_CAMERA };
const cityCam = { ...STAGE11_CHAPTER_CAMERA };
let cine = null;
let elapsed = 0;
let descentCommitted = false;
let blockadeWarned = false;
let combatKey = null, combatCamBlend = 0;
let patrolPlaced = 0, spotPool = [];

function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function vehicleCfg() { return CFG.campaign.stage11.forestVehicles; }

// Same frustum test Chapter 1 uses: a weapon vehicle may only open fire once it
// is genuinely on screen, and a cleared blockade only collapses on screen.
function pointInCityView(x, z, y = 8) {
    const off = cityCam;
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

// The Pasupati-scale pull-back Chapter 1 established: a visible weapon vehicle
// widens the frame so its tracers and missiles can be read coming in.
//
// Its AMPLITUDE is the config's own normal->combat RATIO, never the config's
// absolute offsets: Chapters 2 and 3 share one southeast azimuth
// (`STAGE11_CHAPTER_CAMERA`), and copying Chapter 1's offsets would swing the
// city round to the opposite corner the moment a weapon vehicle appeared.
function combatZoom() {
    const C = vehicleCfg().camera;
    const base = Math.hypot(C.normal.x, C.normal.z) || 1;
    return { plan: Math.hypot(C.combat.x, C.combat.z) / base,
        height: C.combat.y / (C.normal.y || 1) };
}
export function stage11CityCameraAt(blend) {
    const B = STAGE11_CHAPTER_CAMERA, Z = combatZoom(), s = smooth(blend);
    return { x: B.x * (1 + (Z.plan - 1) * s), y: B.y * (1 + (Z.height - 1) * s),
        z: B.z * (1 + (Z.plan - 1) * s) };
}
function updateCombatCamera(dt) {
    if (combatKey != null && stage11WeaponVehicleGroupCleared(VG, combatKey))
        combatKey = null;
    if (combatKey == null) {
        const visible = stage11VisibleWeaponVehicle(VG);
        if (visible) combatKey = visible.key;
    }
    const target = combatKey == null ? 0 : 1;
    const k = 1 - Math.exp(-vehicleCfg().camera.easePerSec * dt);
    combatCamBlend += (target - combatCamBlend) * k;
    if (Math.abs(combatCamBlend - target) < 1e-4) combatCamBlend = target;
    Object.assign(cityCam, stage11CityCameraAt(combatCamBlend));
}

export function resetSurface() {
    cine = null; elapsed = 0;
    descentCommitted = false; blockadeWarned = false;
    combatKey = null; combatCamBlend = 0; patrolPlaced = 0;
    Object.assign(cityCam, stage11CityCameraAt(0));
    resetStage11SurfaceVisuals(); resetStage11CityBlockades();
}

// One deterministic pool of DISTINCT standing places, walked down every road on
// the network so supplies, barrels and patrols spread over the whole city.
//
// It replaces indexing one short list of edge midpoints with two different
// strides: `(i * 5 + 1) % spots.length` and `(i * 7 + 4) % spots.length` both
// wrapped long before they ran out of items, so the same point was handed out
// several times over — which is what stacked crates on crates and crates on
// barrels. Every consumer now takes a DISJOINT slice of one shuffled pool, and
// a minimum separation is enforced while the pool is built, so two things can
// never share a spot even if the counts are retuned.
const SPOT_SPACING = 90, SPOT_MIN_GAP = 34;
function hash11(i, salt = 0) {
    let n = Math.imul((i + 13) ^ Math.imul(salt + 5, 0x9e3779b1), 0x85ebca6b);
    n ^= n >>> 16; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}
function roadSpots() {
    const raw = [];
    for (const e of S11_CITY_EDGES) {
        const steps = Math.max(1, Math.round(e.len / SPOT_SPACING));
        for (let i = 0; i < steps; i++) {
            const t = (i + .5) / steps;
            const side = ((e.index + i) % 2) ? 1 : -1;
            // Beside the kerb rather than on the centre line, so nothing stands
            // where the player is driven through a barrier or a fight.
            const lat = side * (e.w - 18);
            const p = stage11CityProjectToRoad(
                e.ax + (e.bx - e.ax) * t + (-e.tz) * lat,
                e.az + (e.bz - e.az) * t + e.tx * lat, 8);
            if (stage11SurfaceHitsBlocker(p.x, p.z, 16)) continue;
            if (stage11CityGateBlocksMovement(p.x, p.z, 18)) continue;
            raw.push({ x: p.x, z: p.z, key: e.index * 131 + i });
        }
    }
    // Deterministic shuffle: the same run always lays the same city out.
    raw.sort((q, r) => hash11(q.key, 3) - hash11(r.key, 3));
    const spots = [];
    for (const p of raw) {
        let ok = true;
        for (const q of spots)
            if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 < SPOT_MIN_GAP ** 2) {
                ok = false; break;
            }
        if (ok) spots.push(p);
    }
    return spots;
}

function placeItems(spots, cursor) {
    const C = CFG.campaign.stage11;
    const take = () => spots[cursor++ % spots.length];
    for (let i = 0; i < Math.max(0, C.lootboxCount | 0); i++) {
        const p = take(); spawnCrate(p.x, p.z, 0);
    }
    for (let i = 0; i < Math.max(0, C.barrelCount | 0); i++) {
        const p = take(); spawnBarrel(p.x, p.z, 0);
    }
    const supply = stage11CityProjectToRoad(S11_SURFACE_START.x - 60,
        S11_SURFACE_START.z + 40, 6);
    spawnAmmoDrop(supply.x, supply.z, 'rifle', 1e9);
    spawnAmmoDrop(supply.x + 22, supply.z, 'pistol', 1e9);
    spawnMedkitDrop(supply.x - 22, supply.z, 1e9);
    return cursor;
}

// Scattered patrols standing on the roads. They spawn IDLE and are woken by
// `campaignRobotAI`'s activate hook the first frame their body enters the
// gameplay viewport (the Stage 10 port rule), so the city is populated without
// robots converging on the player out of streets they have never seen.
function placePatrols(spots, cursor) {
    const P = CFG.campaign.stage11.cityAxis.patrol;
    const order = [];
    for (const cls of ['C', 'B', 'A'])
        for (let i = 0; i < Math.max(0, P.robots[cls] | 0); i++) order.push(cls);
    const placed = [];
    for (const cls of order) {
        let p = null;
        // Patrols want to be SPREAD: a spot too near one already used is
        // skipped rather than accepted, so they never read as a clump.
        for (let tries = 0; tries < spots.length && !p; tries++) {
            const q = spots[cursor++ % spots.length];
            if (placed.some(r => (r.x - q.x) ** 2 + (r.z - q.z) ** 2
                < P.minSpacingUnits ** 2)) continue;
            p = q;
        }
        if (!p) p = spots[cursor++ % spots.length];
        placed.push(p);
        spawnCampaignRobot(p.x, p.z, 11, cls, false);
        robots[robots.length - 1].encounter = 'city-patrol';
    }
    patrolPlaced = placed.length;
    return cursor;
}

function cleanupOpening() {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, CFG.campaign.stage11.fadeSec); setCinematicActive(false);
}
function finishOpening(skipped = false) {
    if (skipped) clearStage11DialogueQueue();
    cleanupOpening(); setStage11Phase('cityAdvance');
    showStageMsg('FIGHT UP THE BOULEVARDS — REACH THE ENEMY HEADQUARTERS', 4600);
}
function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { t: 0, dialogue: false };
    cineCam.x = 210; cineCam.y = 268; cineCam.z = 210;
    setCineFocus(S11_CITY_ROUNDABOUTS[0].x, S11_CITY_ROUNDABOUTS[0].z, true);
    showCutsceneSkip(() => finishOpening(true));
}
function updateOpening(dt) {
    cine.t += dt;
    if (!cine.dialogue) {
        cine.dialogue = true; queueStage11Dialogue('surfaceReveal');
        queueStage11Dialogue('rootBelow');
    }
    if (cine.t >= CFG.campaign.stage11.openingMinSec && stage11DialogueIdle())
        finishOpening(false);
}

function descend() {
    if (descentCommitted) return;
    descentCommitted = true; setStage11Phase('descend');
    setCineFade(1, CFG.campaign.stage11.fadeSec);
    enterStage11Sub(rootScene, { fade: true });
}

function updateProgress() {
    if (phase !== 'cityAdvance') return;
    if (!blockadeWarned && stage11CityBlockadeStatus()) {
        blockadeWarned = true; queueStage11Dialogue('roadBlockade');
    }
    // REACHING THE COMPOUND GATE ENDS THE CHAPTER, whatever is still standing
    // behind the player. The blockades gate ROADS, never the objective: the
    // layout forces only a handful of them (`minBlockadesToHq`) and every other
    // one, on a branch or a dead end, is a fight the player may simply skip.
    if (near(S11_DESCENT, CFG.campaign.stage11.interactionRange * 1.6)) {
        setStage11DescentOpen(true); descend();
    }
}

export const surfaceScene = {
    id: 'campaign-11-surface',
    enter() {
        setActiveCampaignWorldRoots(STAGE11_SURFACE_LIGHTS_KEY);
        setActiveStageLights(STAGE11_SURFACE_LIGHTS_KEY);
        applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x76806f, fogColor: 0x69746a,
            fogNear: 240, fogFar: 2600 });
        resetSurface(); resetStage11WeaponVehicles(VG);
        spotPool = roadSpots();
        placePatrols(spotPool, placeItems(spotPool, 0));
        setStage11Phase('opening');
        camera.position.set(S11_SURFACE_START.x, CFG.player.eyeHeight,
            S11_SURFACE_START.z);
        // Face up the boulevard on the first frame. Mouse aim takes over
        // immediately, but the handoff no longer presents Gibran backwards.
        const dx = S11_CITY_HEADQUARTERS.x - S11_SURFACE_START.x;
        const dz = S11_CITY_HEADQUARTERS.z - S11_SURFACE_START.z;
        const yaw = Math.atan2(dx, dz) * .5;
        camera.quaternion.set(0, Math.sin(yaw), 0, Math.cos(yaw));
        player.vy = 0; player.onGround = true;
        startOpening();
    },
    exit() { cleanupOpening(); cleanupStage11WeaponVehicles(VG);
        cleanupStage11CityBlockades(); },
    updateMode(dt) {
        elapsed += dt;
        updateStage11SurfaceVisuals(dt);
        updateStage11WeaponVehicles(VG, dt, {
            los: (x0, z0, x1, z1) => !stage11SurfaceSegBlocked(x0, z0, x1, z1),
            inView: pointInCityView,
        });
        updateStage11CityBlockades(dt, {
            inView: pointInCityView,
            live: !cine && !complete && phase === 'cityAdvance',
        });
        updateCombatCamera(dt);
        if (cine) updateOpening(dt);
        else if (!complete) updateProgress();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage11SurfaceWalk, pos, oldX, oldZ, player.radius);
        stage11SurfaceResolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage11SurfaceWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage11SurfaceGroundHeight,
    get camOffset() { return cine ? cineCam : cityCam; },
    bulletBlocked(b) {
        // Shared double-cabin body and fabricator both own their hit before the
        // scenery sweep; Chapter 1 and 2 therefore cannot drift apart.
        return stage11WeaponVehicleBulletHit(VG, b)
            || stage11CityBlockadeBulletHit(b)
            || stage11SurfaceSegBlocked(b.px, b.pz,
                b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage11SurfaceSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11SurfaceWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -.4; g.vz *= -.4;
        }
        stage11SurfaceResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        // A robot still being printed is posed by the fabricator, not the AI.
        if (bot.machineBirth) {
            bot.state = 'idle'; bot.moving = false; bot.aiming = false; return {};
        }
        const mounted = stage11WeaponVehicleRobotAI(bot);
        if (mounted) return mounted;
        return campaignRobotAI(bot, dt, step, {
            walkable: stage11SurfaceWalk, resolve: stage11SurfaceResolve,
            nav: stage11SurfaceNav(),
            los: (x0, z0, x1, z1) => !stage11SurfaceSegBlocked(x0, z0, x1, z1),
            // A scattered patrol wakes the first frame its BODY enters the
            // gameplay viewport, and stays awake — never on range alone, or the
            // player would be chased out of streets they have not seen.
            activate: z => pointInCityView(z.mesh.position.x, z.mesh.position.z, 8),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage11SurfaceWalk, resolve: stage11SurfaceResolve });
    },
    clampDropPos(x, z) {
        // Loot that lands off the asphalt is pulled back onto it, or it would
        // rest on ground the player is never allowed to walk on.
        if (stage11SurfaceWalk(x, z, 2)) return [x, z];
        const p = stage11CityProjectToRoad(x, z, 2);
        return [p.x, p.z];
    },
    hudStatus() {
        if (phase === 'opening') return 'NUSANTARA — IKN ROAD NETWORK';
        if (phase === 'descend') return 'HEADQUARTERS BREACHED — DESCENDING';
        const gate = stage11CityBlockadeStatus();
        if (gate) return `ROAD BLOCKADE — FABRICATORS ${gate.alive}/${gate.total}`
            + (gate.vehicles ? ` · VEHICLES ${gate.vehicles}` : '')
            + ` | Hostiles: ${countStageRobots(11)}`;
        // Deliberately NO "blockades cleared N/13": the objective is reaching
        // the headquarters, and a running count reads as a quota the player has
        // to fill before the chapter will let them finish.
        const left = Math.round(Math.hypot(
            S11_CITY_HEADQUARTERS.x - camera.position.x,
            S11_CITY_HEADQUARTERS.z - camera.position.z) / CAMP_M);
        return `ENEMY HEADQUARTERS ${left} M`
            + ` | Hostiles: ${countStageRobots(11)}`;
    },
    radarLandmarks(plot) {
        const p = stage11CityBlockadeTarget()
            || stage11NearestWeaponVehicle(VG) || S11_DESCENT;
        plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const surfaceDebug = () => ({
    elapsed, cinematic: !!cine, descentCommitted,
    camera: { offset: { ...surfaceScene.camOffset }, corner: 'lower-right',
        base: stage11CityCameraAt(0), combat: stage11CityCameraAt(1),
        zoomFromConfigRatio: combatZoom(),
        easePerSec: vehicleCfg().camera.easePerSec,
        combatKey, combatBlend: combatCamBlend, pasupatiScale: true,
        progress: stage11ChapterScreenDirection(S11_SURFACE_START, S11_DESCENT) },
    blockades: stage11CityBlockadesDebug(),
    vehicles: stage11WeaponVehiclesDebug(VG),
    items: { spots: spotPool.length, minGapUnits: SPOT_MIN_GAP,
        lootboxCount: CFG.campaign.stage11.lootboxCount,
        barrelCount: CFG.campaign.stage11.barrelCount },
    patrol: { placed: patrolPlaced, activatesOnView: true,
        configured: ['C', 'B', 'A'].reduce((n, c) =>
            n + (CFG.campaign.stage11.cityAxis.patrol.robots[c] | 0), 0),
        minSpacingUnits: CFG.campaign.stage11.cityAxis.patrol.minSpacingUnits,
        dormant: robots.filter(r => r.stage === 11
            && r.encounter === 'city-patrol' && r.state === 'idle').length,
        awake: robots.filter(r => r.stage === 11
            && r.encounter === 'city-patrol' && r.state !== 'idle').length },
    world: stage11SurfaceWorldDebug(),
});
