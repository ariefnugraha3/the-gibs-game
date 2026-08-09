// Campaign Stage 6 — FALSE HOMECOMING.
//
// File ini adalah FASAD scene: `stage6Scene` tetap satu-satunya scene yang
// dilihat core/sceneManager (id `campaign-6`, checkpoint 6), sementara isi stage
// dipecah menjadi DUA CHAPTER sebagai sub-scene —
//   arrival (stasiun Bandung, denah CSV user) -> hq (Bandung Headquarters).
// Pergantian chapter = potong ke hitam lalu fade-in
// `CFG.campaign.stage6.chapterFadeSec`; lihat runtime.js.

import { CFG } from '../../../../core/config.js';
import { player } from '../../../../core/state.js';
import { scene, camera } from '../../../../core/renderer.js';
import { hideStageRadioDialogue, hideDownloadBar } from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { resetCrates } from '../../../../entities/crates.js';
import { applyLightPreset } from '../../../../world/lighting.js';
import { campaignAwardKill, countStageRobots } from '../../utility/common.js';
import { campaignJumpToStage } from '../../utility/transition.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { stage1Scene } from '../stage1.js';
import { ensureWorld as ensureArrivalWorld, S6_START } from './world.js';
import { ensureHqWorld } from './hqWorld.js';
import {
    phase, complete, setPhase, setComplete, cine, cineCam, sub, enterSub, resetSub,
    updateSubFade, updateDialogue, resetDialogue, cleanupCine, clearStageRobots,
} from './runtime.js';
import { arrivalScene, arrivalDebug, resetArrival } from './arrival.js';
import { hqScene, hqDebug, resetHq } from './hq.js';

// Permukaan publik stage 6.
export {
    S6_MAP, S6_LEGEND, S6_START, S6_INFO, S6_FINISH, cellPos,
    CITY_GROUND_Y as S6_CITY_GROUND_Y,
    RACK_POINTS, GENERATOR_POINTS, SUPPLY_POINTS, CRATE_POINTS, ENCOUNTER_POINTS,
    MACHINE_POINTS as S6_MACHINE_POINTS, stage6Machines,
    stage6Walk, stage6SegHitsWall, resolve, stage6WorldDebug, stage6StaticBatchDbg,
} from './world.js';
export {
    HQ_MAP, HQ_LEGEND, HQ_START, HQ_UPLOAD, HQ_SERVERS, HQ_HACK, hqCellPos,
    MACHINE_POINTS, EVENT_POINTS, HQ_SUPPLY_POINTS, HQ_CRATE_POINTS, HQ_ENCOUNTER_POINTS,
    HQ_SERVER_ROOM, hqInServerRoom, hqInServerRoomCell,
    CITY_GROUND_Y as HQ_CITY_GROUND_Y,
    hqWalk, hqResolve, hqSegHitsWall, hqWorldDebug, hqStaticBatchDbg, hqMachines,
} from './hqWorld.js';
export { STAGE6_DIALOGUE, stage6DialogueDebug, subFadeDebug } from './runtime.js';
export { arrivalScene, hqScene };

// Kedua dunia chapter dibangun SEKALIGUS di muka (dipanggil juga oleh
// `stage1.ensureWorld`), jadi seluruh shader-nya ikut dikompilasi selagi layar
// loading masih tampil — tidak ada chapter yang lazy.
let worldsReady = false;
export function ensureWorld() {
    if (worldsReady) return;
    worldsReady = true;
    ensureArrivalWorld(scene);
    ensureHqWorld(scene);
}
export const worldBuilt = () => worldsReady;

const activeSub = () => sub || arrivalScene;

function resetStage() {
    setPhase('opening'); setComplete(false);
    resetArrival(); resetHq(); resetSub();
    cleanupCine(); resetDialogue(); hideDownloadBar();
}

export const stage6Debug = () => ({
    phase, sub: sub?.id || null, chapter: sub === hqScene ? 'hq' : 'arrival',
    objective: stage6Scene.hudStatus(),
    ...arrivalDebug(), hq: hqDebug(),
    robots: countStageRobots(6), complete,
});

export const stage6Scene = {
    id: 'campaign-6',
    lightsKey: 'campaign-6',

    enter() {
        saveCampaignStage(6);
        ensureWorld();
        clearStageRobots();
        resetCrates(); resetStage();
        // LATAR KOTA seperti Stage 5 (2026-08-10, permintaan user): kubah
        // "pusaran api" global disembunyikan, background jadi haze malam dingin,
        // fog dilebarkan agar cincin kota kedua chapter terlihat di luar tembok.
        applyLightPreset(scene, 'night'); enterCityEnv();
        camera.position.set(S6_START.x, CFG.player.eyeHeight, S6_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        // `fade:false`: masuk stage HARUS langsung terlihat; tirai hanya untuk
        // pergantian antar chapter.
        enterSub(arrivalScene, { fade: false });
        updateUI();
    },

    exit() {
        hideStageRadioDialogue(); hideDownloadBar();
        if (sub && sub.exit) sub.exit();
        if (cine) cleanupCine();
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,

    updateMode(dt) {
        updateSubFade();
        updateDialogue(dt);
        activeSub().updateMode(dt);
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) { activeSub().playerCollide(pos, oldX, oldZ, feetY); },
    groundHeight(x, z, feetY) { return activeSub().groundHeight(x, z, feetY); },
    get camOffset() { return cine ? cineCam : null; },
    bulletBlocked(b) { return activeSub().bulletBlocked(b); },
    blastBlocked(x0, z0, x1, z1, y = 0) { return activeSub().blastBlocked(x0, z0, x1, z1, y); },
    grenadeCollide(g, oldX, oldZ) { activeSub().grenadeCollide(g, oldX, oldZ); },
    robotAI(z, dt, step) { return activeSub().robotAI(z, dt, step); },
    clampRobot(z, oldX, oldZ) { activeSub().clampRobot(z, oldX, oldZ); },
    clampDropPos(x, z) { return activeSub().clampDropPos(x, z); },
    hudStatus() { return activeSub().hudStatus(); },
    radarLandmarks(plot) { activeSub().radarLandmarks(plot); },
};
