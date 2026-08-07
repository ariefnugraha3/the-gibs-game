// Stage 5 — SUB-SCENE 3: TIBA DI BANDUNG (arrival -> complete). Kereta
// mengerem di terminal statis, dua baris radio terakhir diketik, lalu stage
// ditutup lewat gerbang finish bersama (STAGE 5 COMPLETE -> Field Shop).

import { CFG } from '../../../../core/config.js';
import { setCinematicActive } from '../../../../core/state.js';
import { camera, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip, hideStageRadioDialogue,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { beginStageTransition } from '../../utility/transition.js';
import { stage6Scene } from '../stage6.js';
import { TRAIN_CENTER_Z, S5_ENGINE } from './world.js';
import {
    phase, setPhase, complete, setComplete, cine, setCine, cineCam,
    queueDialogue, dialogueIdle, updateRide, stopTrainLoop, TRAIN_HOOKS,
} from './runtime.js';

function finishArrival() {
    if (complete) return;
    setComplete(true); setPhase('complete'); stopTrainLoop();
    hideStageRadioDialogue(); hideCutsceneSkip(); setAvatarRadioPose(false);
    setCineFocus(null); setCineBars(false); setCinematicActive(false); setCineFade(0, 0);
    beginStageTransition(stage6Scene);
}

function updateArrivalCine(dt) {
    if (!cine) return;
    cine.t += dt;
    const C = CFG.campaign.stage5;
    const k = Math.min(1, cine.t / Math.max(0.01, C.arrivalMinSec));
    cineCam.x = -82 + k * 24; cineCam.y = 88 - k * 22; cineCam.z = 92 - k * 20;
    setAvatarRadioPose(true, Math.PI / 2, 'gibranAccepts', k);
    if (!cine.fading && cine.t >= C.arrivalMinSec && dialogueIdle()) {
        cine.fading = true; cine.fadeT = 0; setCineFade(1, C.fadeSec);
    }
    if (cine.fading) {
        cine.fadeT += dt;
        if (cine.fadeT >= C.fadeSec) finishArrival();
    }
}

export const arrivalScene = {
    id: 'campaign-5-arrival',

    enter() {
        if (complete) return;
        setPhase('arrival'); releaseInputs(); setCinematicActive(true); setCineBars(true);
        setCine({ kind: 'arrival', t: 0, fading: false });
        queueDialogue('arrivedCommand'); queueDialogue('arrivedGibran');
        setAvatarRadioPose(true, Math.PI / 2, 'gibranAccepts', 0.5);
        // Player tetap DI DALAM gerbong: framing arrival memakai ujung timur
        // dek, bukan titik di luar badan kereta.
        camera.position.set(S5_ENGINE.x, CFG.player.eyeHeight, TRAIN_CENTER_Z);
        setCineFocus(S5_ENGINE.x, S5_ENGINE.z, true);
        showCutsceneSkip(finishArrival);
        addCamShake(2.2);
    },

    updateMode(dt) {
        updateArrivalCine(dt);
        if (phase === 'arrival') updateRide(dt);
    },

    ...TRAIN_HOOKS,

    hudStatus() { return phase === 'complete' ? 'BANDUNG — ARRIVED' : 'BANDUNG — ARRIVING'; },
    radarLandmarks() { },
};
