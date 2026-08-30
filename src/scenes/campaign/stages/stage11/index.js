// Campaign Stage 11 — NUSANTARA ROOT facade.
// Forest, civic surface and root chamber are three internal chapters.
// `activeScene` remains stage11Scene;
// switching chapters never calls setScene and therefore preserves checkpoint,
// stage statistics, dialogue order and modal return behavior.

import { CFG } from '../../../../core/config.js';
import { scene } from '../../../../core/renderer.js';
import { hideStageRadioDialogue, hideDownloadBar, hideBossHud } from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { resetCrates } from '../../../../entities/crates.js';
import { resetBarrels } from '../../../../entities/barrels.js';
import { createNusantaraWarden, cleanupNusantaraWarden,
    nusantaraWardenDebug } from '../../../../entities/nusantaraWarden.js';
import { campaignAwardKill, countStageRobots } from '../../utility/common.js';
import { campaignJumpToStage, beginStageTransition } from '../../utility/transition.js';
import { stage1Scene } from '../stage1/index.js';
import { stage12Scene } from '../stage12/index.js';   // (circular aman: dibaca DI DALAM fungsi)
import {
    ensureStage11ForestWorld, stage11ForestWorldDebug,
    STAGE11_FOREST_LIGHTS_KEY,
} from './forestWorld.js';
import {
    ensureStage11SurfaceWorld, stage11SurfaceWorldDebug,
} from './surfaceWorld.js';
import {
    ensureStage11RootWorld, stage11RootWorldDebug,
} from './rootWorld.js';
import {
    phase, sub, complete, setStage11Phase, setStage11Complete,
    enterStage11Sub, resetStage11Sub, updateStage11Dialogue,
    resetStage11Dialogue, stage11DialogueDebug, clearStage11Robots,
    setStage11CompletionHook,
} from './runtime.js';
import { forestScene, forestDebug, resetForest } from './forest.js';
import { surfaceScene, surfaceDebug, resetSurface } from './surface.js';
import { rootScene, rootDebug, resetRoot } from './root.js';

export { forestScene, surfaceScene, rootScene, setStage11CompletionHook };
export { STAGE11_DIALOGUE } from './runtime.js';
export {
    STAGE11_CHAPTER_CAMERA, stage11ChapterScreenDirection,
} from './chapterCamera.js';
export {
    S11_FOREST_ORIGIN, S11_FOREST_LANDING, S11_FOREST_GATE, S11_FOREST_ROUTE,
    S11_FOREST_ROUTE_METERS, stage11ForestPointAtMeter, stage11ForestMeterAt,
    stage11ForestWalk, stage11ForestResolve, stage11ForestSegBlocked,
    stage11ForestOnAsphalt, stage11ForestSpawnPoint,
    stage11ForestWorldDebug,
} from './forestWorld.js';
export {
    STAGE11_FOREST_VEHICLE_GROUP, STAGE11_CITY_VEHICLE_GROUP,
    stage11WeaponVehiclesDebug, stage11WeaponVehicleBulletHit,
} from './weaponVehicles.js';
export {
    stage11ForestCheckpointPlan, stage11ForestCheckpointsDebug,
    stage11ForestCheckpointBulletHit, stage11ForestCheckpointsAllCleared,
    stage11ForestGateSegBlocked, STAGE11_CHECKPOINT_PREFIX,
} from './forestCheckpoints.js';
export {
    stage11ForestMortarDebug, stage11ForestMortarInZone,
    stage11ForestMortarBlastRadius, stage11ForestMortarBlastOrigin,
} from './forestMortar.js';
export {
    S11_CITY_SPAN_METERS, S11_CITY_START, S11_CITY_HQ, S11_CITY_HQ_APRON,
    S11_CITY_EDGES, S11_CITY_NODES, S11_CITY_ROUNDABOUTS, S11_CITY_BLOCKADES,
    S11_CITY_BOUNDS, S11_CITY_START_BACK_UNITS, S11_CITY_START_RENDER_UNITS,
    S11_CITY_START_TANGENT, S11_CITY_SIDEWALK, S11_CITY_SIDEWALK_METERS,
    stage11CityWalk, stage11CityWalkExcept, stage11CityPastStartCut,
    stage11CityCrossingAsphalt,
    stage11CityIslandHit,
    stage11CityIslandSegBlocked, stage11CityProjectToRoad,
    stage11CityRoadClearance, stage11CityFenceRuns, stage11CityRoadsDebug,
} from './cityRoads.js';
export {
    stage11CityBlockadesDebug, stage11CityBlockadeBulletHit,
    stage11CityBlockadesAllCleared, stage11CityBlockadeStatus,
    stage11CityBlockadePlan, stage11CityVehiclePlacements,
    stage11CityGateBlocksMovement, STAGE11_BLOCKADE_PREFIX,
} from './cityBlockades.js';
export {
    S11_SURFACE_ORIGIN, S11_SURFACE_START, S11_DESCENT,
    S11_CITY_HEADQUARTERS, stage11SurfaceWalk, stage11SurfaceResolve,
    stage11SurfaceSegBlocked, stage11SurfaceGroundHeight,
    stage11SurfaceHitsBlocker, stage11SurfaceFreeLane, stage11SurfaceWorldDebug,
} from './surfaceWorld.js';
export {
    S11_ROOT_ORIGIN, S11_ROOT_CORRIDOR_METERS, S11_ROOT_ENCOUNTER_METER,
    S11_ROOT_START, S11_AUTHORITY_GATE, S11_ROOT_ENCOUNTER,
    S11_DOOR_TERMINAL, S11_DOOR_STAND, S11_INSERT, S11_INSERT_STAND,
    S11_ARENA, S11_WARDEN_HOME, stage11RootWalk, stage11RootResolve,
    stage11RootSegBlocked, stage11RootMeterAt, stage11RootPointAtMeter,
    stage11RootWorldDebug,
} from './rootWorld.js';

let worldsReady = false;
let warden = null;

export function ensureStage11World(parent = scene) {
    if (worldsReady) return { forest: ensureStage11ForestWorld(parent),
        surface: ensureStage11SurfaceWorld(parent), root: ensureStage11RootWorld(parent), warden };
    worldsReady = true;
    const forest = ensureStage11ForestWorld(parent);
    const surface = ensureStage11SurfaceWorld(parent);
    const root = ensureStage11RootWorld(parent);
    // Boss and every hazard pool are built into the hidden root up front, so
    // the reveal only toggles existing objects and cannot compile/allocate.
    warden = createNusantaraWarden(root);
    return { forest, surface, root, warden };
}
export const getStage11Warden = () => warden;
export const stage11WorldBuilt = () => worldsReady;

function activeSub() { return sub || forestScene; }

function resetStage() {
    setStage11Phase('opening'); setStage11Complete(false);
    resetForest(); resetSurface(); resetRoot(); resetStage11Sub(); resetStage11Dialogue();
    hideDownloadBar(); hideBossHud();
}

export const stage11Scene = {
    id: 'campaign-11', lightsKey: STAGE11_FOREST_LIGHTS_KEY,
    enter() {
        saveCampaignStage(11); ensureStage11World(scene);
        // Bab root memanggil hook ini setelah epilog anomali selesai. Dipasang
        // di sini (bukan di root.js) supaya root tak mengimpor Stage 12 —
        // gateway finish hijau -> Field Shop -> Stage 12 tetap satu-satunya jalur.
        setStage11CompletionHook(() => beginStageTransition(stage12Scene));
        clearStage11Robots(); resetCrates(); resetBarrels(); resetStage();
        enterStage11Sub(forestScene, { fade: false }); updateUI();
    },
    exit() {
        activeSub()?.exit?.(); cleanupNusantaraWarden(warden, false);
        hideStageRadioDialogue(); hideDownloadBar(); hideBossHud();
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) {
        updateStage11Dialogue(dt); activeSub().updateMode(dt); updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) { activeSub().playerCollide(pos, oldX, oldZ, feetY); },
    groundHeight(x, z, feetY) { return activeSub().groundHeight(x, z, feetY); },
    get camOffset() { return activeSub().camOffset || null; },
    bulletBlocked(b) { return activeSub().bulletBlocked(b); },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        return activeSub().blastBlocked(x0, z0, x1, z1, y);
    },
    grenadeCollide(g, oldX, oldZ) { activeSub().grenadeCollide(g, oldX, oldZ); },
    robotAI(bot, dt, step) { return activeSub().robotAI(bot, dt, step); },
    clampRobot(bot, oldX, oldZ) { activeSub().clampRobot(bot, oldX, oldZ); },
    clampDropPos(x, z) { return activeSub().clampDropPos(x, z); },
    hudStatus() { return activeSub().hudStatus(); },
    radarLandmarks(plot) { activeSub().radarLandmarks(plot); },
};

export const stage11WorldDebug = () => ({
    built: worldsReady, phase, complete,
    sub: sub?.id || null, chapter: sub === rootScene ? 'root'
        : sub === surfaceScene ? 'city' : 'forest',
    activeSceneStable: stage11Scene.id,
    robots: countStageRobots(11), objective: stage11Scene.hudStatus(),
    dialogue: stage11DialogueDebug(), forest: forestDebug(),
    surface: surfaceDebug(), root: rootDebug(),
    worlds: { forest: stage11ForestWorldDebug(),
        surface: stage11SurfaceWorldDebug(), root: stage11RootWorldDebug() },
    warden: nusantaraWardenDebug(warden),
});
