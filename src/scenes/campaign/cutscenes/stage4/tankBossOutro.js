// CUTSCENE: TANK-BOSS OUTRO — diputar setelah HP tank Stage 4 habis.
//
// PAPAN SHOT:
//   1. Close-up tank selama cook-off/turret terlempar, ditahan sampai bangkai
//      benar-benar mencapai fase `wreck`.
//   2. Cut ke close-up depan-kanan Major Gibran: tangan kiri menekan earpiece,
//      tangan kanan tetap memegang senjata dengan laras ke bawah. Lima transmisi
//      radio diketik huruf-per-huruf memakai CFG.campaign.dialogue.
//   3. Fade-out hitam, lalu callback Stage 4 membuka finish screen hijau;
//      tombol CONTINUE pada screen itu yang meneruskan ke Field Shop.
//
// Modul ini buta terhadap kondisi menang Stage 4: tank + callback akhir di-
// inject oleh stage4.js. Semua state kamera/dialog/pose dibersihkan oleh reset().

import { CFG } from '../../../../core/config.js';
import { dialogueList } from '../../../../core/dialogue.js';
import { setCinematicActive } from '../../../../core/state.js';
import { scene, camera, setCineFocus, CAM_OFF_DEFAULT } from '../../../../core/renderer.js';
import {
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
    showStageRadioDialogue, hideStageRadioDialogue,
} from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => k < 0 ? 0 : k > 1 ? 1 : k;
const smooth = (k) => k * k * (3 - 2 * k);

// Naskah user dipatok kata-per-kata. `key` hanya identitas debug/test dan tidak
// pernah ikut ditampilkan di layar.
export const TANK_BOSS_OUTRO_DIALOGUE = dialogueList('campaign.tankBossOutro');

export function createTankBossOutro({ getTank, onComplete }) {
    let cine = null, done = false;
    let savedFog = null;
    let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = [];
    let dialogueT = 0, dialogueChars = 0;
    const camOff = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };
    const focus = { x: 0, z: 0 };

    const SEC = (key, fallback) => {
        const C = CFG.campaign.tankOutro || {};
        return C[key] != null ? C[key] : fallback;
    };

    function setCamera(azimuth, distance, height, fx, fz) {
        camOff.x = Math.sin(azimuth) * distance;
        camOff.y = height;
        camOff.z = Math.cos(azimuth) * distance;
        focus.x = fx; focus.z = fz;
        setCineFocus(fx, fz, true);
    }

    function renderDialogue() {
        if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
        dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
        showStageRadioDialogue(
            dialogueCurrent.speaker,
            dialogueCurrent.text.slice(0, dialogueChars),
            dialogueChars < dialogueCurrent.text.length,
        );
    }

    function beginNextDialogue() {
        dialogueCurrent = dialogueQueue.shift() || null;
        dialogueT = 0;
        dialogueChars = 0;
        if (dialogueCurrent) dialogueSeen.push(dialogueCurrent.key);
        renderDialogue();
    }

    function updateDialogue(dt) {
        if (!dialogueCurrent) return;
        const D = CFG.campaign.dialogue;
        const cps = Math.max(1, D.cps), holdSec = Math.max(0, D.holdSec);
        dialogueT += dt;
        while (dialogueCurrent) {
            const lineSec = dialogueCurrent.text.length / cps + holdSec;
            if (dialogueT < lineSec) {
                dialogueChars = Math.floor(dialogueT * cps);
                renderDialogue();
                return;
            }
            dialogueChars = dialogueCurrent.text.length;
            renderDialogue();
            dialogueT -= lineSec;
            beginNextDialogue();
        }
    }

    function syncRadioGesture() {
        if (!cine || cine.phase !== 'radio' || !dialogueCurrent) return;
        const progress = dialogueCurrent.text.length > 0
            ? dialogueChars / dialogueCurrent.text.length : 1;
        setAvatarRadioPose(true, cine.radioYaw, dialogueCurrent.key, progress);
    }

    function beginRadioShot() {
        const tank = getTank();
        const px = camera.position.x, pz = camera.position.z;
        const tx = tank?.parts?.group?.position.x ?? px;
        const tz = tank?.parts?.group?.position.z ?? pz + 1;
        const yaw = Math.atan2(tx - px, tz - pz);
        cine.phase = 'radio'; cine.t = 0; cine.radioYaw = yaw;
        // Kamera berada di depan-kanan subjek sehingga tangan di earpiece dan
        // senjata yang menggantung sama-sama terbaca dalam satu close-up.
        cine.radioAz = yaw + 0.68;
        dialogueQueue = TANK_BOSS_OUTRO_DIALOGUE.map(line => ({ ...line }));
        beginNextDialogue();   // frame pertama body kosong + caret typewriter
        syncRadioGesture();
        setCamera(cine.radioAz, 46, 25, px, pz);
    }

    function beginFade() {
        cine.phase = 'fade'; cine.t = 0;
        hideStageRadioDialogue();
        setCineFade(1, SEC('fadeSec', 0.8));
    }

    function finish() {
        if (!cine) return;
        cine = null; done = true;
        dialogueCurrent = null; dialogueQueue = [];
        dialogueT = 0; dialogueChars = 0;
        hideStageRadioDialogue();
        hideCutsceneSkip();
        setAvatarRadioPose(false);
        setCineFocus(null);
        setCineBars(false);
        setCinematicActive(false);
        // #cineFade berada di atas #gameOver; lepaskan tirai pada frame yang
        // sama agar layar kemenangan hijau langsung menggantikan hitam.
        setCineFade(0, 0);
        if (savedFog && scene?.fog) {
            scene.fog.near = savedFog.near;
            scene.fog.far = savedFog.far;
        }
        savedFog = null;
        if (onComplete) onComplete();
    }

    function start() {
        const tank = getTank();
        if (cine || done || !tank || !tank.dead) return false;
        releaseInputs();
        setCinematicActive(true);
        setCineBars(true);
        setCineFade(0, 0);
        hideStageRadioDialogue();
        setAvatarRadioPose(false);
        if (scene?.fog) savedFog = { near: scene.fog.near, far: scene.fog.far };

        const tp = tank.parts.group.position;
        const toPlayer = Math.atan2(camera.position.x - tp.x, camera.position.z - tp.z);
        cine = {
            phase: 'tank', t: 0,
            tankAz: toPlayer - 0.34,
            radioAz: 0, radioYaw: 0,
        };
        setCamera(cine.tankAz, 72, 36, tp.x, tp.z);
        if (scene?.fog) { scene.fog.near = 120; scene.fog.far = 950; }
        showCutsceneSkip(finish);
        return true;
    }

    function update(dt) {
        if (!cine) return;
        cine.t += dt;
        const tank = getTank();

        if (cine.phase === 'tank') {
            const dur = Math.max(0.01, SEC('tankShotMinSec', 3.0));
            const k = smooth(clamp01(cine.t / dur));
            const tp = tank?.parts?.group?.position || camera.position;
            setCamera(cine.tankAz, lerp(72, 58, k), lerp(36, 30, k), tp.x, tp.z);
            // Jangan potong cook-off/turret terbang: scene 2 baru boleh masuk
            // sesudah close-up benar-benar memperlihatkan bangkai final.
            if (cine.t >= dur && tank?.deathPhase === 'wreck') beginRadioShot();
            return;
        }

        if (cine.phase === 'radio') {
            const px = camera.position.x, pz = camera.position.z;
            const pushSec = Math.max(0.01, SEC('radioPushSec', 3.0));
            const k = smooth(clamp01(cine.t / pushSec));
            setCamera(cine.radioAz, lerp(46, 39, k), lerp(25, 22, k), px, pz);
            updateDialogue(dt);
            if (dialogueCurrent) syncRadioGesture();
            else if (!dialogueQueue.length) beginFade();
            return;
        }

        if (cine.phase === 'fade' && cine.t >= Math.max(0, SEC('fadeSec', 0.8))) finish();
    }

    function reset() {
        cine = null; done = false;
        dialogueCurrent = null; dialogueQueue = []; dialogueSeen = [];
        dialogueT = 0; dialogueChars = 0;
        hideStageRadioDialogue();
        hideCutsceneSkip();
        setAvatarRadioPose(false);
        setCineFocus(null);
        setCineBars(false);
        setCineFade(0, 0);
        setCinematicActive(false);
        if (savedFog && scene?.fog) {
            scene.fog.near = savedFog.near;
            scene.fog.far = savedFog.far;
        }
        savedFog = null;
    }

    function dialogueDebug() {
        return {
            key: dialogueCurrent?.key || null,
            speaker: dialogueCurrent?.speaker || '',
            text: dialogueCurrent?.text || '',
            chars: dialogueChars,
            shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
            typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
            queued: dialogueQueue.map(line => line.key),
            seen: [...dialogueSeen],
        };
    }

    function cineDebug() {
        return {
            active: !!cine,
            done,
            phase: cine?.phase || null,
            t: cine?.t || 0,
            focus: { ...focus },
            cam: { ...camOff },
        };
    }

    return {
        start, update, reset,
        isActive: () => !!cine,
        isDone: () => done,
        camOffset: () => cine ? camOff : null,
        cineDebug,
        dialogueDebug,
    };
}
