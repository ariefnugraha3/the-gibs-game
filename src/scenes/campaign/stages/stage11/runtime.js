// Shared Stage 11 facade state, chapter manager, dialogue and bounded waves.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { robots } from '../../../../core/state.js';
import { scene } from '../../../../core/renderer.js';
import { showStageRadioDialogue, hideStageRadioDialogue } from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';

export const STAGE11_DIALOGUE = dialogueMap('campaign.stage11.lines');
export let phase = 'opening';
export let sub = null;
export let complete = false;
export const setStage11Phase = p => { phase = p; };
export const setStage11Complete = v => { complete = !!v; };
let completionHook = null;
export const setStage11CompletionHook = fn => { completionHook = typeof fn === 'function' ? fn : null; };
export function invokeStage11Completion(payload = {}) {
    if (!completionHook) return false;
    completionHook(payload); return true;
}

export function enterStage11Sub(next, opts = {}) {
    if (sub?.exit) sub.exit();
    sub = next; next?.enter?.(opts);
}
export function resetStage11Sub() { sub = null; }

let current = null, queue = [], seen = new Set(), dialogueT = 0, chars = 0;
let hook = null;
export const setStage11DialogueHook = fn => { hook = fn; };

function render() {
    if (!current) { hideStageRadioDialogue(); return; }
    chars = Math.max(0, Math.min(current.text.length, chars | 0));
    showStageRadioDialogue(current.speaker, current.text.slice(0, chars),
        chars < current.text.length, !!current.distorted);
}
function next() {
    current = queue.shift() || null; dialogueT = 0; chars = 0;
    if (current) hook?.(current.key); else setAvatarRadioPose(false);
    render();
}
export function queueStage11Dialogue(key, repeat = false) {
    const line = STAGE11_DIALOGUE[key];
    if (!line || (!repeat && seen.has(key))) return false;
    if (!repeat) seen.add(key);
    queue.push({ key, ...line }); if (!current) next(); return true;
}
export function updateStage11Dialogue(dt) {
    if (!current) return;
    const d = CFG.campaign.dialogue; dialogueT += dt;
    while (current) {
        const sec = current.text.length / Math.max(1, d.cps) + Math.max(0, d.holdSec);
        if (dialogueT < sec) { chars = Math.floor(dialogueT * Math.max(1, d.cps)); render(); return; }
        chars = current.text.length; render(); dialogueT -= sec; next();
    }
}
export const stage11DialogueIdle = () => !current && !queue.length;
export function resetStage11Dialogue() {
    clearStage11DialogueQueue(); seen = new Set(); hook = null;
}
// Cutscene skip clears only what is currently being spoken.  `seen` belongs to
// the whole Stage-11 facade and must survive forest -> city -> root handoffs.
export function clearStage11DialogueQueue() {
    current = null; queue = []; dialogueT = 0; chars = 0;
    hideStageRadioDialogue(); setAvatarRadioPose(false);
}
export const stage11DialogueDebug = () => ({
    key: current?.key || null, speaker: current?.speaker || '',
    text: current?.text || '', chars,
    shown: current ? current.text.slice(0, chars) : '',
    typing: !!current && chars < current.text.length,
    queued: queue.map(x => x.key), seen: [...seen],
});

export function clearStage11Robots() {
    for (let i = robots.length - 1; i >= 0; i--) {
        if (robots[i].stage !== 11) continue;
        disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
    }
}
