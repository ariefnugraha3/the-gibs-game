// Stage 5 — SUB-SCENE 2: KERETA BERANGKAT (departure -> cargo -> security ->
// roof -> finalDefense). Arena kereta tetap statis; hanya pool scenery yang
// bergulir. Selesai gelombang terakhir, kendali diserahkan ke sub-scene arrival.

import { CFG } from '../../../../core/config.js';
import { robots, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageMsg, setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { disposeRobot } from '../../../../entities/robots.js';
import {
    setTrainDoor, TRAIN_CAR_LENGTH, TRAIN_CAR_STEP, TRAIN_CAR_COUNT, TRAIN_HALF_WIDTH,
} from '../../../../entities/train.js';
import { countStageRobots } from '../../utility/common.js';
import { playSFX, sfxPurchase } from '../../../../utils/sfx.js';
import { rand } from '../../../../utils/math.js';
import {
    stationRoot, train, setStationTrainView, boardMarker, updateLandmarks,
    TRAIN_BASE_X, TRAIN_CENTER_Z, STATION_TC_X, STATION_TRAIN_DX, S5_ENGINE, CELL,
} from './world.js';
import {
    phase, setPhase, cine, setCine, cineCam, enterSub, queueDialogue, dialogueIdle,
    spawnOne, countEncounter, updateRide, rideT, routeK, resetRide,
    resetEnemyTrain, startTrainLoop, TRAIN_HOOKS,
} from './runtime.js';
import { arrivalScene } from './arrival.js';

let departureShift = 0, finalT = 0, finalWaveIndex = 0;
let encounterSpawned = { cargo: false, security: false, roof: false };

export function resetJourney() {
    departureShift = 0; finalT = 0; finalWaveIndex = 0;
    encounterSpawned = { cargo: false, security: false, roof: false };
}

export function carAt(x) {
    return Math.max(0, Math.min(TRAIN_CAR_COUNT - 1, Math.round((x - TRAIN_BASE_X) / TRAIN_CAR_STEP)));
}

function spawnEncounter(name, counts, carIndex, boarding = false) {
    if (!counts) return;
    const cx = TRAIN_BASE_X + carIndex * TRAIN_CAR_STEP;
    let k = 0;
    for (const cls of ['C', 'B', 'A']) {
        const n = Math.max(0, counts[cls] | 0);
        for (let i = 0; i < n; i++, k++) {
            const side = k % 2 ? 1 : -1;
            const rearEntry = boarding && k % 3 === 0;
            const x = rearEntry ? cx - TRAIN_CAR_LENGTH / 2 - 8 : cx + rand(-32, 32);
            const z = boarding && !rearEntry ? TRAIN_CENTER_Z + side * (TRAIN_HALF_WIDTH + 11)
                : TRAIN_CENTER_Z + side * rand(4, 12);
            const target = rearEntry ? { x: cx - 31, z } : null;
            spawnOne(cls, x, z, name, boarding, target);
        }
    }
}

function finishDeparture() {
    // Reset arena train ketika layar hitam; stasiun awal tidak pernah bergeser.
    departureShift = 0; train.group.position.x = 0;
    stationRoot.visible = false;
    camera.position.set(TRAIN_BASE_X - 28, CFG.player.eyeHeight, TRAIN_CENTER_Z);
    hideCutsceneSkip(); setCineFocus(null); setCineBars(false); setCinematicActive(false);
    setCineFade(0, CFG.campaign.stage5.fadeSec);
    setCine(null); setPhase('cargo'); setTrainDoor(train, 0, true);
    showStageMsg('FIGHT THROUGH THE TRAIN — REACH THE CONTROL CAR', 4800);
}

function updateDepartureCine(dt) {
    if (!cine) return;
    cine.t += dt;
    const C = CFG.campaign.stage5;
    const k = Math.min(1, cine.t / Math.max(0.01, C.departureMinSec));
    cineCam.x = -125 + k * 50; cineCam.y = 90 + k * 18; cineCam.z = 125 - k * 35;
    // Kereta benar-benar keluar ke timur selama shot; seluruh stationRoot
    // tetap di (0,0,0). Arena di-reset saat layar hitam di finishDeparture.
    departureShift = k * CELL * 15;
    train.group.position.x = STATION_TRAIN_DX + departureShift;
    camera.position.x = STATION_TC_X - 46 + departureShift;
    camera.position.z = TRAIN_CENTER_Z;
    setCineFocus(STATION_TC_X + departureShift, TRAIN_CENTER_Z, true);
    if (!cine.fading && cine.t >= C.departureMinSec && dialogueIdle()) {
        cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
    }
    if (cine.fading && (cine.fadeT += dt) >= C.fadeSec) finishDeparture();
}

function updateEncounters(dt) {
    const C = CFG.campaign.stage5, car = carAt(camera.position.x);
    if (phase === 'cargo') {
        if (!encounterSpawned.cargo && rideT >= C.cargoGateSec && car >= 1) {
            encounterSpawned.cargo = true;
            spawnEncounter('cargo', C.encounters.cargo, 1, true);
            queueDialogue('breach'); queueDialogue('breachReply'); addCamShake(2.0);
        }
        if (encounterSpawned.cargo && countEncounter('cargo') === 0 && rideT >= C.securityGateSec) {
            setTrainDoor(train, 1, true); setPhase('security');
            showStageMsg('CARGO CAR SECURED — ADVANCE THROUGH THE TRAIN', 3200);
        }
    } else if (phase === 'security') {
        if (!encounterSpawned.security && car >= 2) {
            encounterSpawned.security = true; spawnEncounter('security', C.encounters.security, 2, false);
        }
        if (encounterSpawned.security && countEncounter('security') === 0 && rideT >= C.roofGateSec) {
            setTrainDoor(train, 2, true); setPhase('roof');
            showStageMsg('SECURITY CAR CLEARED — CROSS THE OPEN DECK', 3200);
        }
    } else if (phase === 'roof') {
        if (!encounterSpawned.roof && car >= 3) {
            encounterSpawned.roof = true; spawnEncounter('roof', C.encounters.roof, 3, true);
            queueDialogue('roofWarning'); queueDialogue('roofReply'); addCamShake(2.4);
        }
        if (encounterSpawned.roof && countEncounter('roof') === 0 && rideT >= C.finalGateSec) {
            setTrainDoor(train, 3, true);
            if (car >= 4) {
                setPhase('finalDefense'); finalT = 0; finalWaveIndex = 0;
                queueDialogue('finalApproach'); queueDialogue('finalReply');
                showStageMsg('FINAL APPROACH — HOLD THE CONTROL CAR', 4300);
            }
        }
    } else if (phase === 'finalDefense') {
        finalT += dt;
        const waves = C.encounters.finalWaves || [];
        while (finalWaveIndex < waves.length && finalT >= finalWaveIndex * C.finalWaveGapSec) {
            spawnEncounter('final', waves[finalWaveIndex], Math.max(1, 3 - finalWaveIndex), true);
            finalWaveIndex++; addCamShake(1.6);
        }
        if (finalWaveIndex >= waves.length && finalT >= C.finalDefenseSec
            && rideT >= C.rideMinSec && countStageRobots(5) === 0) enterSub(arrivalScene);
    }
}

export const journeyDebug = () => ({
    departureShift, finalT, finalWaveIndex, encountered: { ...encounterSpawned },
});

export const journeyScene = {
    id: 'campaign-5-journey',

    enter() {
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setPhase('departure'); resetRide(); boardMarker.visible = false;
        setStationTrainView(false); resetEnemyTrain();
        // Apa pun yang masih hidup di stasiun ditinggal di sana; kereta harus
        // berangkat dengan deck bersih sebelum encounter cargo dijadwalkan.
        for (let i = robots.length - 1; i >= 0; i--) {
            const z = robots[i];
            if (z.stage !== 5) continue;
            disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
        }
        camera.position.set(STATION_TC_X - 46, CFG.player.eyeHeight, TRAIN_CENTER_Z);
        setCinematicActive(true); setCineBars(true);
        setCine({ kind: 'departure', t: 0, fading: false });
        queueDialogue('commandDeparture'); queueDialogue('gibranDeparture');
        setCineFocus(STATION_TC_X, TRAIN_CENTER_Z, true);
        showCutsceneSkip(finishDeparture); startTrainLoop(); playSFX(sfxPurchase, 0.45);
    },

    updateMode(dt) {
        if (phase === 'departure') {
            // Stasiun masih terlihat selama shot keberangkatan: rotor C1/C2
            // harus tetap berputar, bukan membeku.
            updateLandmarks(dt, true, true);
            updateDepartureCine(dt); updateRide(dt);
            return;
        }
        updateRide(dt); updateEncounters(dt);
    },

    ...TRAIN_HOOKS,

    hudStatus() {
        const C = CFG.campaign.stage5 || {};
        const km = Math.max(1, Math.ceil((C.routeKm || 120) * (1 - routeK())));
        if (phase === 'finalDefense') return `TO BANDUNG — ${km} KM | HOLD THE CONTROL CAR | Robots: ${countStageRobots(5)}`;
        return `TO BANDUNG — ${km} KM | CAR ${carAt(camera.position.x) + 1}/${TRAIN_CAR_COUNT} | Robots: ${countStageRobots(5)}`;
    },

    radarLandmarks(plot) {
        let p = null;
        if (phase === 'departure' || phase === 'cargo') p = { x: TRAIN_BASE_X + TRAIN_CAR_STEP, z: TRAIN_CENTER_Z };
        else if (phase === 'security') p = { x: TRAIN_BASE_X + 2 * TRAIN_CAR_STEP, z: TRAIN_CENTER_Z };
        else if (phase === 'roof') p = { x: TRAIN_BASE_X + 3 * TRAIN_CAR_STEP, z: TRAIN_CENTER_Z };
        else if (phase === 'finalDefense') p = S5_ENGINE;
        if (p) plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};
