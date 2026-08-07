// Campaign Stage 5 — THE LAST TRAIN TO BANDUNG.
// File ini adalah FASAD scene: `stage5Scene` tetap satu-satunya scene yang
// dilihat core/sceneManager (id `campaign-5`, checkpoint 5, resume modal
// hack/repair), sementara isi stage dipecah menjadi tiga SUB-SCENE di folder
// ini — station (stasiun awal) -> journey (kereta berangkat) -> arrival
// (tiba di Bandung, stage selesai). Pergantian sub-scene memakai fade-in
// `CFG.campaign.stage5.subSceneFadeSec` (0.5 dtk); lihat runtime.js.

import { CFG } from '../../../../core/config.js';
import { player, robots } from '../../../../core/state.js';
import { scene, camera } from '../../../../core/renderer.js';
import { hideStageRadioDialogue } from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { resetCrates } from '../../../../entities/crates.js';
import { trainJourneyDebug as trainDebug } from '../../../../entities/train.js';
import { applyLightPreset } from '../../../../world/lighting.js';
import { campaignAwardKill, countStageRobots } from '../../utility/common.js';
import { campaignJumpToStage } from '../../utility/transition.js';
import { exitCityEnv } from '../../utility/cityscape.js';
import { stage1Scene } from '../stage1.js';
import {
    ensureWorld, stationRoot, train, journey, S5_START, resetWorldVisual,
} from './world.js';
import {
    phase, complete, setPhase, setComplete, cine, cineCam, sub, enterSub, resetSub,
    updateSubFade, updateDialogue, resetDialogue, cleanupCine, stopTrainLoop,
    resetRide, rideT, resetEnemyTrain, enemyTrainDebug,
} from './runtime.js';
import { stationScene, stationDebug, resetStation } from './station.js';
import { journeyScene, journeyDebug, resetJourney } from './journey.js';
import { arrivalScene } from './arrival.js';

// Permukaan publik stage 5 tidak berubah walau file-nya dipecah.
export {
    S5_MAP, S5_LEGEND, S5_FINISH_MAP, S5_START, S5_GENERATOR, S5_TERMINAL,
    S5_BOARD, S5_TCI, S5_ENGINE, ensureWorld, worldBuilt, resolve,
    stage5Walk, stage5TrainWalk, stage5SegHitsWall, stage5WorldDebug,
    stage5StaticBatchDbg,
} from './world.js';
export { STAGE5_DIALOGUE, stage5DialogueDebug } from './runtime.js';
export { stationScene, journeyScene, arrivalScene };

const RIDE_PHASES = ['departure', 'cargo', 'security', 'roof', 'finalDefense', 'arrival'];
const activeSub = () => sub || stationScene;

function resetStage() {
    setPhase('opening'); setComplete(false); resetRide();
    resetStation(); resetJourney(); resetSub();
    stopTrainLoop(); cleanupCine(); resetDialogue(); resetEnemyTrain();
    resetWorldVisual();
}

export const stage5Debug = () => {
    const C = CFG.campaign.stage5 || {};
    const routeK = Math.min(1, rideT / Math.max(1, C.rideMinSec || 1));
    const distance = phase === 'arrival' || phase === 'complete' ? 0
        : Math.max(1, Math.ceil((C.routeKm || 120) * (1 - routeK)));
    const st = stationDebug(), jr = journeyDebug();
    return {
        phase, sub: sub?.id || null, objective: stage5Scene.hudStatus(),
        repairInstalled: st.repairInstalled, repairTotal: st.repairTotal,
        repairArmed: st.repairArmed, hackArmed: st.hackArmed, hackCd: st.hackCd,
        platformUnlocked: st.platformUnlocked, depotAwake: st.depotAwake,
        flybySent: st.flybySent, departureShift: jr.departureShift,
        stationX: stationRoot?.position?.x || 0, stationZ: stationRoot?.position?.z || 0,
        rideT, routeK, distance, finalT: jr.finalT, finalWaveIndex: jr.finalWaveIndex,
        robots: countStageRobots(5), complete, encountered: { ...jr.encountered },
        enemyTrain: enemyTrainDebug(),
    };
};

export const trainJourneyDebug = () => ({
    ...trainDebug(train, journey),
    station: {
        visible: !!stationRoot?.visible,
        x: stationRoot?.position?.x || 0,
        z: stationRoot?.position?.z || 0,
    },
});

export const stage5Scene = {
    id: 'campaign-5',
    lightsKey: 'campaign-5',

    enter() {
        saveCampaignStage(5);
        ensureWorld();
        // Transisi normal membuang stage 4 lewat shop; guard juga membersihkan
        // robot stage lama pada jalur continue/cheat yang tidak biasa.
        for (let i = robots.length - 1; i >= 0; i--) {
            disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
        resetCrates(); resetStage();
        applyLightPreset(scene, 'night'); exitCityEnv();
        camera.position.set(S5_START.x, CFG.player.eyeHeight, S5_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        // `fade:false`: masuk stage HARUS langsung terlihat (kontrak entry
        // Stage 5); tirai 0.5 dtk hanya untuk pergantian antar sub-scene.
        enterSub(stationScene, { fade: false });
        updateUI();
    },

    exit() {
        hideStageRadioDialogue();
        if (cine) cleanupCine();
        if (RIDE_PHASES.includes(phase)) stopTrainLoop();
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
