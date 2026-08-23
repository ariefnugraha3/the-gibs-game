// Shared Stage 11 facade state, chapter manager, dialogue and bounded waves.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { robots } from '../../../../core/state.js';
import { scene } from '../../../../core/renderer.js';
import { showStageRadioDialogue, hideStageRadioDialogue } from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnCampaignRobot } from '../../utility/common.js';

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
    current = null; queue = []; seen = new Set(); dialogueT = 0; chars = 0; hook = null;
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

function waveUnits(raw) {
    const units = [];
    for (let wave = 0; wave < (Array.isArray(raw) ? raw.length : raw ? 1 : 0); wave++) {
        const item = Array.isArray(raw) ? raw[wave] : raw;
        // B remains more common than A; exact class totals survive batching.
        for (const cls of ['C', 'B', 'A'])
            for (let i = 0; i < Math.max(0, item?.[cls] | 0); i++) units.push({ cls, wave });
    }
    return units;
}

// Split large config rows into bounded batches without changing any configured
// class total. A single live batch stays <=24, leaving headroom below 30 for a
// just-dying robot or scripted entity in the shared update.
export function makeStage11WaveQueue(raw, maxLive = 24) {
    const units = waveUnits(raw), batches = [];
    for (let i = 0; i < units.length; i += maxLive) batches.push(units.slice(i, i + maxLive));
    return { batches, configuredTotal: units.length, spawnedTotal: 0, cursor: -1 };
}

export function spawnStage11Batch(queueState, points, prefix) {
    const index = queueState.cursor + 1;
    const batch = queueState.batches[index];
    if (!batch) return [];
    queueState.cursor = index; const records = [];
    for (let i = 0; i < batch.length; i++) {
        const u = batch[i], p = points[(index * 5 + i) % points.length];
        const dx = ((i * 19 + index * 13) % 29) - 14;
        const dz = ((i * 23 + index * 7) % 27) - 13;
        spawnCampaignRobot(p.x + dx, p.z + dz, 11, u.cls, true);
        const bot = robots[robots.length - 1]; bot.encounter = `${prefix}-${index}`;
        records.push({ cls: u.cls, sourceWave: u.wave, batch: index,
            x: bot.mesh.position.x, z: bot.mesh.position.z });
    }
    queueState.spawnedTotal += batch.length; return records;
}
export function stage11BatchAlive(prefix, index) {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 11 && bot.encounter === `${prefix}-${index}`) n++;
    return n;
}
export const stage11WaveQueueDebug = q => ({
    configuredTotal: q?.configuredTotal || 0, spawnedTotal: q?.spawnedTotal || 0,
    remainingConfigTotal: Math.max(0, (q?.configuredTotal || 0) - (q?.spawnedTotal || 0)),
    cursor: q?.cursor ?? -1, batchCount: q?.batches?.length || 0,
    batchSizes: q?.batches?.map(x => x.length) || [],
});
