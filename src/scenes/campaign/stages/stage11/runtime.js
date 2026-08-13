// Stage 11 runtime: deterministic encounter gates and single dialogue queue.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { robots } from '../../../../core/state.js';
import { scene } from '../../../../core/renderer.js';
import { hideStageRadioDialogue, showStageRadioDialogue } from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnCampaignRobot } from '../../utility/common.js';

export const STAGE11_DIALOGUE = dialogueMap('campaign.stage11.lines');

let current = null;
let queue = [];
let seen = new Set();
let dialogueT = 0;
let chars = 0;

function render() {
    if (!current) { hideStageRadioDialogue(); return; }
    chars = Math.max(0, Math.min(current.text.length, chars | 0));
    showStageRadioDialogue(current.speaker, current.text.slice(0, chars),
        chars < current.text.length, !!current.distorted);
}

function next() {
    current = queue.shift() || null; dialogueT = 0; chars = 0;
    if (!current) setAvatarRadioPose(false);
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
    const d = CFG.campaign.dialogue;
    dialogueT += dt;
    while (current) {
        const sec = current.text.length / Math.max(1, d.cps) + Math.max(0, d.holdSec);
        if (dialogueT < sec) { chars = Math.floor(dialogueT * Math.max(1, d.cps)); render(); return; }
        chars = current.text.length; render(); dialogueT -= sec; next();
    }
}

export const stage11DialogueIdle = () => !current && !queue.length;

export function resetStage11Dialogue() {
    current = null; queue = []; seen = new Set(); dialogueT = 0; chars = 0;
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

function normalizeWave(raw) {
    if (Array.isArray(raw)) return raw;
    return raw ? [raw] : [];
}

export function stage11WaveTotals(raw) {
    return normalizeWave(raw).map(w => ['C', 'B', 'A']
        .reduce((n, cls) => n + Math.max(0, w?.[cls] | 0), 0));
}

// Spawn exactly ONE configured wave. Stages 9–13 are prebuilt, but combatants
// are not: keeping future waves as config data avoids feeding 100+ idle meshes
// through the shared robot update before their geographic gate is reached.
export function spawnStage11Wave(raw, waveIndex, placements, prefix) {
    const waves = normalizeWave(raw);
    const w = Math.max(0, waveIndex | 0);
    if (!waves[w]) return [];
    const records = [];
    const counts = waves[w] || {};
    let slot = 0;
    for (const cls of ['C', 'B', 'A']) {
        for (let i = 0; i < Math.max(0, counts[cls] | 0); i++, slot++) {
            const p = placements[(w * 7 + slot) % placements.length];
            const dx = ((slot * 17 + w * 11) % 31) - 15;
            const dz = ((slot * 23 + w * 5) % 29) - 14;
            spawnCampaignRobot(p.x + dx, p.z + dz, 11, cls, true);
            const bot = robots[robots.length - 1];
            bot.encounter = `${prefix}-${w}`;
            records.push({ cls, wave: w, x: bot.mesh.position.x, z: bot.mesh.position.z });
        }
    }
    return records;
}

export function activateStage11Prefix(prefix) {
    for (const bot of robots) if (bot.stage === 11 && String(bot.encounter).startsWith(prefix)) {
        bot.state = 'chasing'; bot.moving = false; bot.aiming = false;
    }
}

export function stage11PrefixAlive(prefix) {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 11 && String(bot.encounter).startsWith(prefix)) n++;
    return n;
}
