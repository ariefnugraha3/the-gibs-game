// Campaign Stage 11 — NUSANTARA ROOT facade.
// Surface and root are internal chapters. `activeScene` remains stage11Scene;
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
import { applyLightPreset } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { stage1Scene } from '../stage1/index.js';
import { stage12Scene } from '../stage12/index.js';   // (circular aman: dibaca DI DALAM fungsi)
import {
    ensureStage11SurfaceWorld, stage11SurfaceWorldDebug,
    STAGE11_SURFACE_LIGHTS_KEY,
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
import { surfaceScene, surfaceDebug, resetSurface } from './surface.js';
import { rootScene, rootDebug, resetRoot } from './root.js';

export { surfaceScene, rootScene, setStage11CompletionHook };
export { STAGE11_DIALOGUE } from './runtime.js';
export {
    S11_SURFACE_ORIGIN, S11_SURFACE_START, S11_AXIS_GATE, S11_ROOT_COURT,
    S11_DESCENT, stage11SurfaceWalk, stage11SurfaceResolve,
    stage11SurfaceSegBlocked, stage11SurfaceWorldDebug,
} from './surfaceWorld.js';
export {
    S11_ROOT_ORIGIN, S11_ROOT_START, S11_AUTHORITY_GATE, S11_INSERT,
    S11_ARENA, S11_WARDEN_HOME, stage11RootWalk, stage11RootResolve,
    stage11RootSegBlocked, stage11RootWorldDebug,
} from './rootWorld.js';

let worldsReady = false;
let warden = null;

export function ensureStage11World(parent = scene) {
    if (worldsReady) return { surface: ensureStage11SurfaceWorld(parent),
        root: ensureStage11RootWorld(parent), warden };
    worldsReady = true;
    const surface = ensureStage11SurfaceWorld(parent);
    const root = ensureStage11RootWorld(parent);
    // Boss and every hazard pool are built into the hidden root up front, so
    // the reveal only toggles existing objects and cannot compile/allocate.
    warden = createNusantaraWarden(root);
    return { surface, root, warden };
}
export const getStage11Warden = () => warden;
export const stage11WorldBuilt = () => worldsReady;

function activeSub() { return sub || surfaceScene; }

function resetStage() {
    setStage11Phase('opening'); setStage11Complete(false);
    resetSurface(); resetRoot(); resetStage11Sub(); resetStage11Dialogue();
    hideDownloadBar(); hideBossHud();
}

export const stage11Scene = {
    id: 'campaign-11', lightsKey: STAGE11_SURFACE_LIGHTS_KEY,
    enter() {
        saveCampaignStage(11); ensureStage11World(scene);
        // Bab root memanggil hook ini setelah epilog anomali selesai. Dipasang
        // di sini (bukan di root.js) supaya root tak mengimpor Stage 12 —
        // gateway finish hijau -> Field Shop -> Stage 12 tetap satu-satunya jalur.
        setStage11CompletionHook(() => beginStageTransition(stage12Scene));
        clearStage11Robots(); resetCrates(); resetBarrels(); resetStage();
        applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x778178, fogColor: 0x68736a,
            fogNear: 190, fogFar: 1700 });
        enterStage11Sub(surfaceScene, { fade: false }); updateUI();
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
    sub: sub?.id || null, chapter: sub === rootScene ? 'root' : 'surface',
    activeSceneStable: stage11Scene.id,
    robots: countStageRobots(11), objective: stage11Scene.hudStatus(),
    dialogue: stage11DialogueDebug(), surface: surfaceDebug(), root: rootDebug(),
    worlds: { surface: stage11SurfaceWorldDebug(), root: stage11RootWorldDebug() },
    warden: nusantaraWardenDebug(warden),
});
