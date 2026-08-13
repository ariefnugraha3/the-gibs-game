// Campaign Stage 12 — NUSANTARA ROOT facade.
// Surface and root are internal chapters. `activeScene` remains stage12Scene;
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
import { stage13Scene } from '../stage13/index.js';   // (circular aman: dibaca DI DALAM fungsi)
import {
    ensureStage12SurfaceWorld, stage12SurfaceWorldDebug,
    STAGE12_SURFACE_LIGHTS_KEY,
} from './surfaceWorld.js';
import {
    ensureStage12RootWorld, stage12RootWorldDebug,
} from './rootWorld.js';
import {
    phase, sub, complete, setStage12Phase, setStage12Complete,
    enterStage12Sub, resetStage12Sub, updateStage12Dialogue,
    resetStage12Dialogue, stage12DialogueDebug, clearStage12Robots,
    setStage12CompletionHook,
} from './runtime.js';
import { surfaceScene, surfaceDebug, resetSurface } from './surface.js';
import { rootScene, rootDebug, resetRoot } from './root.js';

export { surfaceScene, rootScene, setStage12CompletionHook };
export { STAGE12_DIALOGUE } from './runtime.js';
export {
    S12_SURFACE_ORIGIN, S12_SURFACE_START, S12_AXIS_GATE, S12_ROOT_COURT,
    S12_DESCENT, stage12SurfaceWalk, stage12SurfaceResolve,
    stage12SurfaceSegBlocked, stage12SurfaceWorldDebug,
} from './surfaceWorld.js';
export {
    S12_ROOT_ORIGIN, S12_ROOT_START, S12_AUTHORITY_GATE, S12_INSERT,
    S12_ARENA, S12_WARDEN_HOME, stage12RootWalk, stage12RootResolve,
    stage12RootSegBlocked, stage12RootWorldDebug,
} from './rootWorld.js';

let worldsReady = false;
let warden = null;

export function ensureStage12World(parent = scene) {
    if (worldsReady) return { surface: ensureStage12SurfaceWorld(parent),
        root: ensureStage12RootWorld(parent), warden };
    worldsReady = true;
    const surface = ensureStage12SurfaceWorld(parent);
    const root = ensureStage12RootWorld(parent);
    // Boss and every hazard pool are built into the hidden root up front, so
    // the reveal only toggles existing objects and cannot compile/allocate.
    warden = createNusantaraWarden(root);
    return { surface, root, warden };
}
export const getStage12Warden = () => warden;
export const stage12WorldBuilt = () => worldsReady;

function activeSub() { return sub || surfaceScene; }

function resetStage() {
    setStage12Phase('opening'); setStage12Complete(false);
    resetSurface(); resetRoot(); resetStage12Sub(); resetStage12Dialogue();
    hideDownloadBar(); hideBossHud();
}

export const stage12Scene = {
    id: 'campaign-12', lightsKey: STAGE12_SURFACE_LIGHTS_KEY,
    enter() {
        saveCampaignStage(12); ensureStage12World(scene);
        // Bab root memanggil hook ini setelah epilog anomali selesai. Dipasang
        // di sini (bukan di root.js) supaya root tak mengimpor stage 13 —
        // gateway finish hijau -> Field Shop -> Stage 13 tetap satu-satunya jalur.
        setStage12CompletionHook(() => beginStageTransition(stage13Scene));
        clearStage12Robots(); resetCrates(); resetBarrels(); resetStage();
        applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x778178, fogColor: 0x68736a,
            fogNear: 190, fogFar: 1700 });
        enterStage12Sub(surfaceScene, { fade: false }); updateUI();
    },
    exit() {
        activeSub()?.exit?.(); cleanupNusantaraWarden(warden, false);
        hideStageRadioDialogue(); hideDownloadBar(); hideBossHud();
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) {
        updateStage12Dialogue(dt); activeSub().updateMode(dt); updateUI();
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

export const stage12WorldDebug = () => ({
    built: worldsReady, phase, complete,
    sub: sub?.id || null, chapter: sub === rootScene ? 'root' : 'surface',
    activeSceneStable: stage12Scene.id,
    robots: countStageRobots(12), objective: stage12Scene.hudStatus(),
    dialogue: stage12DialogueDebug(), surface: surfaceDebug(), root: rootDebug(),
    worlds: { surface: stage12SurfaceWorldDebug(), root: stage12RootWorldDebug() },
    warden: nusantaraWardenDebug(warden),
});

