// Stage 6 — RUNTIME BERSAMA kedua chapter (arrival + hq).
//
// Sama seperti Stage 5: chapter adalah SUB-SCENE yang memakai kontrak hook scene
// biasa tetapi TIDAK pernah melewati `core/sceneManager` — `activeScene` tetap
// `stage6Scene`, sehingga checkpoint, stageStats, restart dan modal apa pun tak
// berubah perilaku. Arrival -> HQ berpindah langsung tanpa dialog/cutscene;
// helper fade tetap tersedia untuk entry/reset lain yang memerlukannya.

import { CFG } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, bullets, stats, setCinematicActive } from '../../../../core/state.js';
import { scene, CAM_OFF_DEFAULT, setCineFocus, addCamShake } from '../../../../core/renderer.js';
import {
    showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot, queueBoom } from '../../../../entities/robots.js';
import { explodeAt, spawnBloodBurst } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import { spawnCampaignRobot } from '../../utility/common.js';
import { rand, segPointDist2 } from '../../../../utils/math.js';

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

export function enterSub(next, opts = {}) {
    if (sub && sub.exit) sub.exit();
    sub = next;
    if (next && next.enter) next.enter(opts);
}

export function updateSubFade() {}

export function resetSub() { sub = null; }
export const subFadeDebug = () => ({ pending: false, sec: 0 });

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

// Putuskan dialog aktif/antrean tanpa menghapus `seen`. Dipakai saat pindah
// Arrival -> HQ agar kalimat chapter lama tidak ikut terbawa ke kantor.
export function clearDialogueQueue() {
    dialogueCurrent = null; dialogueQueue = [];
    dialogueT = 0; dialogueChars = 0;
    hideStageRadioDialogue(); setAvatarRadioPose(false);
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

// --- Mesin pembuat robot (dipakai KEDUA chapter) ---------------------------
// Sapuan segmen prev->now: peluru senapan menempuh puluhan unit per frame, jadi
// uji titik per frame akan menembus rangka selebar apa pun.
function circleEntryT(x0, z0, x1, z1, cx, cz, r2) {
    const dx = x1 - x0, dz = z1 - z0;
    const fx = x0 - cx, fz = z0 - cz;
    const a = dx * dx + dz * dz;
    const c = fx * fx + fz * fz - r2;
    if (c < 0) return 0;
    if (a < 1e-9) return null;
    const q = 2 * (fx * dx + fz * dz);
    const disc = q * q - 4 * a * c;
    if (disc <= 0) return null;
    const t = (-q - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
}

export function machineBulletHit(b, list, hitRadius, blockedBeforeHit = null) {
    const r2 = Math.max(1, hitRadius) ** 2;
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    let hit = null, hitT = Infinity;
    for (const m of list) {
        if (!m.alive) continue;
        if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.x, 0, m.z) >= r2) continue;
        const t = circleEntryT(b.px, b.pz, bx, bz, m.x, m.z, r2);
        if (t == null || t >= hitT) continue;
        const x = b.px + (bx - b.px) * t, z = b.pz + (bz - b.pz) * t;
        if (blockedBeforeHit && blockedBeforeHit(b, m, b.px, b.pz, x, z)) continue;
        hit = m; hitT = t;
    }
    if (!hit) return false;
    if (b.explosive) {
        hit.hp -= (b.damage != null ? b.damage : CFG.grenade.damage);
    } else {
        hit.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
        stats.hits++;
        spawnBloodBurst(bx, 12 + Math.random() * 6, bz, b.dir.x, b.dir.z, 2, 0.5, 1.4, 0xffb24a);
    }
    hit.hitT = 1;
    return true;
}

export function machineBulletHits(list, hitRadius) {
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (!machineBulletHit(b, list, hitRadius)) continue;
        // Jalur batch membuang pelurunya sendiri, jadi ledakan impact juga
        // diantrikan di sini. Jalur bulletBlocked mengembalikan true dan
        // membiarkan updateBullets mengantrikannya tepat satu kali.
        if (b.explosive) {
            queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z,
                b.explodeR, false, 0, b.damage, b.boomSfx);
        }
        scene.remove(b.mesh); bullets.splice(j, 1);
    }
}

// Ledakan penghancurnya; bangkai gosongnya sendiri milik `wreckSpawnMachine`.
export function machineWreckFx(x, z) {
    explodeAt(new THREE.Vector3(x, 12, z), 28, 1, undefined);
    spawnGibs(x, 14, z, 12, 1, 0, 2.2, 0x3d444c, 0.4, 0x141210);
    spawnBloodDecal(x, z, 7, 0x141210);
    addCamShake(8);
}
