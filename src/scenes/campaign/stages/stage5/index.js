// Campaign Stage 5 — THE LAST TRAIN TO BANDUNG.
// File ini adalah FASAD scene: `stage5Scene` tetap satu-satunya scene yang
// dilihat core/sceneManager (id `campaign-5`, checkpoint 5, resume modal
// hack/repair), sementara isi stage dipecah menjadi EMPAT SUB-SCENE di folder
// ini — station (stasiun awal) -> departure (cutscene kereta berangkat) ->
// journey (perjalanan) -> finish (cutscene tiba di Bandung, stage selesai).
// Pergantian sub-scene memakai fade-in `CFG.campaign.stage5.subSceneFadeSec`
// (0.5 dtk); lihat runtime.js.

import { CFG } from '../../../../core/config.js';
import { player, robots } from '../../../../core/state.js';
import { scene, camera } from '../../../../core/renderer.js';
import { hideStageRadioDialogue } from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { resetCrates } from '../../../../entities/crates.js';
import { resetBarrels } from '../../../../entities/barrels.js';
import { trainJourneyDebug as trainDebug } from '../../../../entities/train.js';
import { applyLightPreset } from '../../../../world/lighting.js';
import { campaignAwardKill, countStageRobots } from '../../utility/common.js';
import { campaignJumpToStage } from '../../utility/transition.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { stage1Scene } from '../stage1.js';
import {
    ensureWorld, stationRoot, train, journey, highway, S5_START, resetWorldVisual,
} from './world.js';
import {
    phase, complete, setPhase, setComplete, cine, cineCam, sub, enterSub, resetSub,
    updateSubFade, updateDialogue, resetDialogue, cleanupCine, stopTrainLoop,
    resetRide, rideT, routeK, resetEnemyTrain, enemyTrainDebug,
} from './runtime.js';
import { resetHighway, highwayDebug } from './highway.js';
import { journeyHighwayDebug as hwPoolDebug } from '../../../../entities/train.js';
import { stationScene, stationDebug, resetStation } from './station.js';
import { departureScene, departureDebug, resetDeparture } from '../../cutscenes/stage5/departure.js';
import { journeyScene, journeyDebug, resetJourney } from './journey.js';
import { finishScene, finishDebug, resetFinish } from '../../cutscenes/stage5/finish.js';

// Permukaan publik stage 5 tidak berubah walau file-nya dipecah.
export {
    S5_MAP, S5_LEGEND, S5_FINISH_MAP, S5_START, S5_GENERATOR, S5_TERMINAL,
    S5_BOARD, S5_TCI, S5_SPAWN_MACHINE, S5_MACHINE_SPAWNS,
    BARREL_POINTS, ensureWorld, worldBuilt, resolve,
    stage5Walk, stage5TrainWalk, stage5SegHitsWall, stage5WorldDebug,
    stage5StaticBatchDbg,
} from './world.js';
export { STAGE5_DIALOGUE, stage5DialogueDebug, trainLoopDebug } from './runtime.js';
export { highwayDebug, roadOffsetAt } from './highway.js';
// Transform HIDUP pool jalan raya: dipakai smoke untuk memastikan sambungan
// modulnya rapat (regresi "jalannya patah-patah", 2026-08-08).
export const journeyHighwayDebug = () => hwPoolDebug(highway);
export { stationScene, departureScene, journeyScene, finishScene };

const RIDE_PHASES = ['departure', 'ride', 'arrival'];
const activeSub = () => sub || stationScene;

function resetStage() {
    setPhase('opening'); setComplete(false); resetRide();
    resetStation(); resetDeparture(); resetJourney(); resetFinish(); resetSub();
    stopTrainLoop(); cleanupCine(); resetDialogue(); resetEnemyTrain(); resetHighway();
    resetWorldVisual();
}

export const stage5Debug = () => {
    // TIDAK ADA LAGI JARAK/HITUNG MUNDUR (2026-08-08, permintaan user):
    // kemajuan rute = gerbong musuh yang sudah dihancurkan.
    const st = stationDebug(), jr = journeyDebug();
    return {
        phase, sub: sub?.id || null, objective: stage5Scene.hudStatus(),
        repairInstalled: st.repairInstalled, repairTotal: st.repairTotal,
        repairArmed: st.repairArmed, hackArmed: st.hackArmed, hackCd: st.hackCd,
        platformUnlocked: st.platformUnlocked, depotAwake: st.depotAwake,
        boardCommitted: st.boardCommitted, boardHoldT: st.boardHoldT,
        boardHoldSec: CFG.campaign.stage5.departureDelaySec,
        machine: st.machine,
        flybySent: st.flybySent,
        departureShift: departureDebug().shift, departure: departureDebug(),
        finish: finishDebug(),
        stationX: stationRoot?.position?.x || 0, stationZ: stationRoot?.position?.z || 0,
        rideT, routeK: routeK(), gapT: jr.gapT,
        consistLaunched: jr.consistLaunched,
        clearHoldT: jr.clearT, clearHoldSec: CFG.campaign.stage5.arrivalDelaySec,
        carsKilled: jr.carsKilled, carTotal: jr.carTotal,
        robots: countStageRobots(5), complete,
        enemyTrain: enemyTrainDebug(),
        highway: highwayDebug(),
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
        resetCrates(); resetBarrels(); resetStage();
        // Depot berdiri di TENGAH KOTA (2026-08-09), jadi stage ini memakai
        // lingkungan kota Stage 1-3: kubah kobaran-api global disembunyikan,
        // background haze malam dingin, fog dilebarkan supaya cincin kota di
        // luar tembok depot benar-benar terlihat. Stage 6 memulihkannya.
        applyLightPreset(scene, 'night'); enterCityEnv();
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
