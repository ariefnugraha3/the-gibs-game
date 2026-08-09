// Stage 6 — RUNTIME BERSAMA kedua chapter (arrival + hq).
//
// Sama seperti Stage 5: chapter adalah SUB-SCENE yang memakai kontrak hook scene
// biasa tetapi TIDAK pernah melewati `core/sceneManager` — `activeScene` tetap
// `stage6Scene`, sehingga checkpoint, stageStats, restart dan modal apa pun tak
// berubah perilaku. Perpindahan chapter = potong ke hitam lalu fade-in
// `CFG.campaign.stage6.chapterFadeSec`.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { robots, setCinematicActive } from '../../../../core/state.js';
import { scene, CAM_OFF_DEFAULT, setCineFocus } from '../../../../core/renderer.js';
import {
    showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnCampaignRobot } from '../../utility/common.js';
import { rand } from '../../../../utils/math.js';

// Naskah dipatok sebagai data agar smoke bisa memeriksa teks dan urutannya.
export const STAGE6_DIALOGUE = dialogueMap('campaign.stage6.lines');

// --- Fase (dimiliki chapter yang sedang aktif) -----------------------------
export let phase = 'opening';
export const setPhase = p => { phase = p; };
export let complete = false;
export const setComplete = v => { complete = v; };

// --- Cine bersama ----------------------------------------------------------
export let cine = null;
export const setCine = c => { cine = c; };
export const cineCam = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };

export function cleanupCine(revealSec = 0) {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, revealSec); setCinematicActive(false); setAvatarRadioPose(false);
}

// --- Manajer CHAPTER (sub-scene) -------------------------------------------
export let sub = null;
let subFadePending = false;

export const chapterFadeSec = () => {
    const v = CFG.campaign.stage6?.chapterFadeSec;
    return typeof v === 'number' ? v : 0.5;
};

export function enterSub(next, opts = {}) {
    if (sub && sub.exit) sub.exit();
    sub = next;
    // Tirai baru dijalankan pada frame berikutnya: transisi CSS harus melihat
    // nilai 1 lebih dulu, persis seperti pergantian sub-scene Stage 5.
    if (opts.fade === false) subFadePending = false;
    else { setCineFade(1, 0); subFadePending = true; }
    if (next && next.enter) next.enter(opts);
}

export function updateSubFade() {
    if (!subFadePending) return;
    subFadePending = false;
    setCineFade(0, chapterFadeSec());
}

export function resetSub() { sub = null; subFadePending = false; }
export const subFadeDebug = () => ({ pending: subFadePending, sec: chapterFadeSec() });

// --- Mesin dialog (SATU antrean untuk seluruh stage; tak pernah di-reset
// antar chapter supaya urutan naskah tetap utuh) ---------------------------
let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0, dialogueHook = null;

export const setDialogueHook = fn => { dialogueHook = fn; };

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}

function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null;
    dialogueT = 0; dialogueChars = 0;
    if (dialogueCurrent) { if (dialogueHook) dialogueHook(dialogueCurrent.key); }
    else setAvatarRadioPose(false);
    renderDialogue();
}

export function queueDialogue(key, repeat = false) {
    const line = STAGE6_DIALOGUE[key];
    if (!line || (!repeat && dialogueSeen.has(key))) return false;
    if (!repeat) dialogueSeen.add(key);
    dialogueQueue.push({ key, ...line });
    if (!dialogueCurrent) nextDialogue();
    return true;
}

export function updateDialogue(dt) {
    if (!dialogueCurrent) return;
    const D = CFG.campaign.dialogue;
    dialogueT += dt;
    while (dialogueCurrent) {
        const sec = dialogueCurrent.text.length / Math.max(1, D.cps) + Math.max(0, D.holdSec);
        if (dialogueT < sec) {
            dialogueChars = Math.floor(dialogueT * Math.max(1, D.cps)); renderDialogue(); return;
        }
        dialogueChars = dialogueCurrent.text.length; renderDialogue();
        dialogueT -= sec; nextDialogue();
    }
}

export function resetDialogue() {
    dialogueCurrent = null; dialogueQueue = []; dialogueSeen = new Set();
    dialogueT = 0; dialogueChars = 0; hideStageRadioDialogue();
}

export const dialogueIdle = () => !dialogueCurrent && !dialogueQueue.length;
export const dialogueSeenKey = k => dialogueSeen.has(k);
export const dialogueCurrentLine = () => dialogueCurrent;
export const dialogueCharCount = () => dialogueChars;

export const stage6DialogueDebug = () => ({
    key: dialogueCurrent?.key || null,
    speaker: dialogueCurrent?.speaker || '', text: dialogueCurrent?.text || '',
    chars: dialogueChars,
    shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
    typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
    queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen],
});

// --- Robot -----------------------------------------------------------------
export function countEncounter(name) {
    let n = 0;
    for (const z of robots) if (z.stage === 6 && z.encounter === name) n++;
    return n;
}

export function spawnOne(cls, p, encounter, active = true) {
    spawnCampaignRobot(p.x + rand(-2.5, 2.5), p.z + rand(-2.5, 2.5), 6, cls, active);
    const z = robots[robots.length - 1]; z.encounter = encounter;
    return z;
}

export function spawnEncounter(points, name, counts, active = true) {
    if (!points || !counts) return 0;
    let k = 0;
    for (const cls of ['C', 'B', 'A'])
        for (let i = 0; i < Math.max(0, counts[cls] | 0); i++, k++)
            spawnOne(cls, points[k % points.length], name, active);
    return k;
}

export function clearStageRobots() {
    for (let i = robots.length - 1; i >= 0; i--) {
        if (robots[i].stage !== 6) continue;
        disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
    }
}
