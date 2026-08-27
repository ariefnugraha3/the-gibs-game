// Stage 10 Chapter 2 runtime: deterministic encounter gates and single dialogue queue.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { robots } from '../../../../core/state.js';
import { scene } from '../../../../core/renderer.js';
import { hideStageRadioDialogue, showStageRadioDialogue } from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import {
    beginStage10SpawnDeployment, activateStage10SpawnDeploymentPrefix,
    stage10SpawnDeploymentPending,
} from './spawnDeployment.js';
import { stage10ForestSegBlocked, stage10ForestWalk } from './forestWorld.js';

export const STAGE10_FOREST_DIALOGUE = dialogueMap('campaign.stage10.chapter2.lines');

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

export function queueStage10ForestDialogue(key, repeat = false) {
    const line = STAGE10_FOREST_DIALOGUE[key];
    if (!line || (!repeat && seen.has(key))) return false;
    if (!repeat) seen.add(key);
    queue.push({ key, ...line }); if (!current) next(); return true;
}

export function updateStage10ForestDialogue(dt) {
    if (!current) return;
    const d = CFG.campaign.dialogue;
    dialogueT += dt;
    while (current) {
        const sec = current.text.length / Math.max(1, d.cps) + Math.max(0, d.holdSec);
        if (dialogueT < sec) { chars = Math.floor(dialogueT * Math.max(1, d.cps)); render(); return; }
        chars = current.text.length; render(); dialogueT -= sec; next();
    }
}

export const stage10ForestDialogueIdle = () => !current && !queue.length;

export function resetStage10ForestDialogue() {
    current = null; queue = []; seen = new Set(); dialogueT = 0; chars = 0;
    hideStageRadioDialogue(); setAvatarRadioPose(false);
}

export const stage10ForestDialogueDebug = () => ({
    key: current?.key || null, speaker: current?.speaker || '',
    text: current?.text || '', chars,
    shown: current ? current.text.slice(0, chars) : '',
    typing: !!current && chars < current.text.length,
    queued: queue.map(x => x.key), seen: [...seen],
});

export function clearStage10ForestRobots() {
    for (let i = robots.length - 1; i >= 0; i--) {
        if (robots[i].stage !== 10) continue;
        disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
    }
}

function normalizeWave(raw) {
    if (Array.isArray(raw)) return raw;
    return raw ? [raw] : [];
}

export function stage10ForestWaveTotals(raw) {
    return normalizeWave(raw).map(w => ['C', 'B', 'A']
        .reduce((n, cls) => n + Math.max(0, w?.[cls] | 0), 0));
}

// Dorong sebuah titik spawn KELUAR dari gelembung bebas-robot (mis. 20 m di
// sekitar titik masuk Chapter 2). Didorong SETELAH jitter supaya posisi akhir
// yang dijamin bersih, bukan titik tabelnya.
function pushOutside(x, z, keep) {
    if (!keep || !(keep.r > 0)) return [x, z];
    const dx = x - keep.x, dz = z - keep.z;
    const d = Math.hypot(dx, dz);
    if (d >= keep.r) return [x, z];
    if (d < 1e-3) return [keep.x - keep.r, keep.z];
    const k = keep.r / d;
    return [keep.x + dx * k, keep.z + dz * k];
}

function forestSpawnClear(x, z) {
    return stage10ForestWalk(x, z, 7)
        && !stage10ForestSegBlocked(x, z, x, z, false);
}

// Jitter dan dorongan keep-out dapat menggeser titik melewati pagar atau ke
// batang pohon. Sapu cincin deterministik sampai kembali ke lantai jalan;
// tidak ada fallback yang mengizinkan robot lahir di hutan.
function clearForestSpawnPoint(x, z, keep, seed) {
    const first = pushOutside(x, z, keep);
    if (forestSpawnClear(first[0], first[1])) return first;
    const start = ((seed * 2.399963229728653) % (Math.PI * 2)) - Math.PI;
    for (let ring = 1; ring <= 28; ring++) {
        const radius = ring * 7;
        for (let step = 0; step < 24; step++) {
            const a = start + step / 24 * Math.PI * 2;
            const pushed = pushOutside(first[0] + Math.cos(a) * radius,
                first[1] + Math.sin(a) * radius, keep);
            if (forestSpawnClear(pushed[0], pushed[1])) return pushed;
        }
    }
    throw new Error(`Stage 10 forest spawn has no road-clear point near ${x},${z}`);
}

// Spawn exactly ONE configured wave. Stages 9–13 are prebuilt, but combatants
// are not: keeping future waves as config data avoids feeding 100+ idle meshes
// through the shared robot update before their geographic gate is reached.
// `opts.active` (default true) = langsung mengejar; gelombang penyergapan
// pembuka Chapter 2 memakai false supaya robot MENUNGGU player maju dulu.
// `opts.keepOut` = {x, z, r} area yang wajib bersih dari robot saat spawn.
export function spawnStage10ForestWave(raw, waveIndex, placements, prefix, opts = {}) {
    const waves = normalizeWave(raw);
    const w = Math.max(0, waveIndex | 0);
    if (!waves[w]) return [];
    const active = opts.active !== false;
    const keep = opts.keepOut || null;
    const records = [];
    const plans = [];
    const counts = waves[w] || {};
    let slot = 0;
    for (const cls of ['C', 'B', 'A']) {
        for (let i = 0; i < Math.max(0, counts[cls] | 0); i++, slot++) {
            const p = placements[(w * 7 + slot) % placements.length];
            const dx = ((slot * 17 + w * 11) % 31) - 15;
            const dz = ((slot * 23 + w * 5) % 29) - 14;
            const out = clearForestSpawnPoint(p.x + dx, p.z + dz, keep,
                w * 131 + slot * 17 + 1);
            plans.push({ cls, x: out[0], z: out[1], encounter: `${prefix}-${w}`, active });
            records.push({ cls, wave: w, x: out[0], z: out[1], roadClear: true });
        }
    }
    const machinePoints = [placements[0],
        placements[Math.floor(placements.length / 2)] || placements[0]].map((p, i) => {
        const q = clearForestSpawnPoint(p.x, p.z, keep, 9001 + w * 13 + i);
        return { x: q[0], z: q[1] };
    });
    beginStage10SpawnDeployment('campaign-10-forest', {
        name: `${prefix}-${w}`, plans,
        machinePoints,
    });
    return records;
}

export function activateStage10ForestPrefix(prefix) {
    activateStage10SpawnDeploymentPrefix('campaign-10-forest', prefix);
    for (const bot of robots) if (bot.stage === 10 && String(bot.encounter).startsWith(prefix)) {
        bot.state = 'chasing'; bot.moving = false; bot.aiming = false;
    }
}

export function stage10ForestPrefixAlive(prefix) {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 10 && String(bot.encounter).startsWith(prefix)) n++;
    return n + (stage10SpawnDeploymentPending('campaign-10-forest', prefix) ? 1 : 0);
}
