// Campaign Stage 12 — ZERO HOUR: MONAS.
// Compact hardwired-guard approach -> independent M-0 Mahapatih encounter ->
// sunrise epilogue. The final `gameOver` is deliberately delayed until every
// epilogue beat has resolved, so checkpoint 12 survives an interrupted ending.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { dialogueMap } from '../../../../core/dialogue.js';
import { player, robots, keys, setCinematicActive } from '../../../../core/state.js';
import { scene, camera, CAM_OFF_DEFAULT, setCineFocus } from '../../../../core/renderer.js';
import {
    showStageMsg, showStageRadioDialogue, hideStageRadioDialogue,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
    setBossHud, hideBossHud,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { gameOver } from '../../../../core/game.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { disposeRobot } from '../../../../entities/robots.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import {
    spawnCampaignRobot, campaignAwardKill, campaignRobotAI,
    campaignClampRobot, countStageRobots,
} from '../../utility/common.js';
import { campaignJumpToStage } from '../../utility/transition.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { applyLightPreset, setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import { startBossMusic, stopMusic } from '../../../../utils/sfx.js';
import { stage1Scene } from '../stage1/index.js';
import {
    createMahapatih, resetMahapatih, setMahapatihWarmupVisible,
    updateMahapatih, mahapatihBulletHit, damageMahapatih, damageMahapatihHardline,
    resolveMahapatihBlock, clearMahapatihHazards, mahapatihDebug,
} from '../../../../entities/mahapatih.js';
import {
    STAGE12_LIGHTS_KEY, S12_ORIGIN, S12_START, S12_ARENA_ENTRY,
    S12_BOSS_CENTER, S12_MONAS, S12_ARENA_BOUNDS, S12_CHARGE_LANES,
    S12_HARDLINE_STATIONS, S12_GATE, STAGE12_ROOT_KEYS,
    ensureStage12World as ensureWorldRoot, stage12WorldDebug,
    stage12Walk, resolveStage12World, stage12GroundHeight, clampStage12Boss,
    stage12BulletBlocked, stage12BlastBlocked,
    resetStage12World, updateStage12World, updateStage12Transport,
    hideStage12Transport, setStage12Sunrise,
    updateStage12Gate, sealStage12Gate, stage12GateState,
    stage12InsidePark, stage12MonasDistance,
} from './world.js';

export { stage12WorldDebug };

export const STAGE12_DIALOGUE = dialogueMap('campaign.stage12.lines');

const PLAY_CAM = Object.freeze({ x: -82, y: 132, z: 82 });
const BOSS_CAM = Object.freeze({ x: -112, y: 165, z: 112 });
const END_CAM = Object.freeze({ x: -135, y: 116, z: 102 });
const cineCam = { ...CAM_OFF_DEFAULT };
const bossContext = {
    center: S12_BOSS_CENTER,
    chargeLanes: S12_CHARGE_LANES,
    clampBoss: clampStage12Boss,
    projectileAllowed: (x, z) => x >= S12_ARENA_BOUNDS.x0 && x <= S12_ARENA_BOUNDS.x1
        && z >= S12_ARENA_BOUNDS.z0 && z <= S12_ARENA_BOUNDS.z1,
    wreckDir: { x: -1, z: 0.2 },
};

let worldRoot = null, boss = null;
let phase = 'returnCine', complete = false, elapsed = 0;
let cine = null, bossRevealT = 0, endingT = 0;
let gateArmed = false, parkSealed = false;
let completionCommitted = false, finalScreenShown = false;
let guardSpawned = new Set(), guardCensus = [], guardSuppliesPlaced = false;
let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function stageCfg() { return CFG.campaign.stage12; }
function bossCfg() { return CFG.campaign.bosses.mahapatih; }

// Stage 1 calls this during the initial campaign build. Creating the entity
// here ensures every fixed pool exists before Stage 12; loading may reveal all
// child programs temporarily while the world root itself remains inactive.
export function ensureStage12World(parent = scene) {
    worldRoot = ensureWorldRoot(parent);
    if (!boss) {
        boss = createMahapatih({ parent: worldRoot, active: false,
            x: S12_BOSS_CENTER.x, z: S12_BOSS_CENTER.z });
        setMahapatihWarmupVisible(boss, true);
    }
    return worldRoot;
}

function renderDialogue() {
    if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
    dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
    showStageRadioDialogue(dialogueCurrent.speaker,
        dialogueCurrent.text.slice(0, dialogueChars), dialogueChars < dialogueCurrent.text.length);
}

function nextDialogue() {
    dialogueCurrent = dialogueQueue.shift() || null; dialogueT = 0; dialogueChars = 0;
    if (!dialogueCurrent) setAvatarRadioPose(false); renderDialogue();
}

function queueDialogue(key, repeat = false) {
    const line = STAGE12_DIALOGUE[key];
    if (!line || (!repeat && dialogueSeen.has(key))) return false;
    if (!repeat) dialogueSeen.add(key);
    dialogueQueue.push({ key, ...line });
    if (!dialogueCurrent) { setAvatarRadioPose(true); nextDialogue(); }
    return true;
}

function updateDialogue(dt) {
    if (!dialogueCurrent) return;
    const D = CFG.campaign.dialogue; dialogueT += dt;
    while (dialogueCurrent) {
        const sec = dialogueCurrent.text.length / Math.max(1, D.cps)
            + Math.max(0, D.holdSec);
        if (dialogueT < sec) {
            dialogueChars = Math.floor(dialogueT * Math.max(1, D.cps));
            renderDialogue(); return;
        }
        dialogueChars = dialogueCurrent.text.length; renderDialogue();
        dialogueT -= sec; nextDialogue();
    }
}

function resetDialogue() {
    dialogueCurrent = null; dialogueQueue = []; dialogueSeen = new Set();
    dialogueT = 0; dialogueChars = 0; setAvatarRadioPose(false); hideStageRadioDialogue();
}

function dialogueIdle() { return !dialogueCurrent && dialogueQueue.length === 0; }

function clearStage12Robots() {
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 12) {
        disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
    }
}

function encounterPoint(raw) {
    // Config accepts map-local offsets (the committed schema) while retaining
    // sane support for absolute values in a tuning branch.
    return {
        x: Math.abs(raw.x) < 10000 ? S12_ORIGIN.x + raw.x : raw.x,
        z: Math.abs(raw.z) < 10000 ? S12_ORIGIN.z + raw.z : raw.z,
    };
}

function encounterTrigger(raw) {
    return Math.abs(raw) < 10000 ? S12_ORIGIN.x + raw : raw;
}

function spawnEncounter(encounter) {
    if (!encounter || guardSpawned.has(encounter.id)) return 0;
    guardSpawned.add(encounter.id); let total = 0;
    for (let pi = 0; pi < encounter.points.length; pi++) {
        const spec = encounter.points[pi], center = encounterPoint(spec);
        for (let i = 0; i < Math.max(0, spec.count | 0); i++) {
            // Deterministic fan: preserves config center/class/count without
            // random first-frame pop or overlapping all guards at one point.
            const col = i % 4, row = (i / 4) | 0;
            const x = center.x + (col - 1.5) * 13 + row * 3;
            const z = center.z + (row - 0.5) * 15 + (col % 2 ? 4 : -4);
            spawnCampaignRobot(x, z, 12, spec.cls, false);
            const bot = robots[robots.length - 1];
            bot.offlineGuard = true; bot.hardwired = true; bot.encounter = encounter.id;
            total++;
        }
    }
    const census = guardCensus.find(x => x.id === encounter.id);
    if (census) { census.spawned = true; census.spawnedTotal = total; }
    return total;
}

function prepareConfiguredGuards() {
    guardCensus = (stageCfg().encounters || []).map(encounter => ({
        id: encounter.id,
        total: encounter.points.reduce((n, p) => n + Math.max(0, p.count | 0), 0),
        triggerX: encounterTrigger(encounter.triggerX),
        spawned: false, spawnedTotal: 0, activated: false,
    }));
}

function activateEncounter(id) {
    const encounter = (stageCfg().encounters || []).find(x => x.id === id);
    if (encounter && !guardSpawned.has(id)) spawnEncounter(encounter);
    const census = guardCensus.find(x => x.id === id);
    if (census) census.activated = true;
    for (const bot of robots) if (bot.stage === 12 && bot.encounter === id
        && bot.state === 'idle') bot.state = 'chasing';
}

function encounterAlive(id) {
    return robots.reduce((n, bot) => n + (bot.stage === 12 && bot.encounter === id ? 1 : 0), 0);
}

function allGuardsDown() {
    return guardCensus.length > 0 && guardCensus.every(e => e.spawned)
        && countStageRobots(12) === 0;
}

function bossTriggerRange() {
    return Math.max(1, stageCfg().bossTriggerMeters) * CAMP_M;
}

function placeBossResupply() {
    if (guardSuppliesPlaced) return;
    guardSuppliesPlaced = true;
    const x = S12_ARENA_ENTRY.x - 36, z = S12_ARENA_ENTRY.z;
    for (const [weapon, dz] of [['pistol', -18], ['rifle', -6],
        ['shotgun', 6], ['launcher', 18]]) spawnAmmoDrop(x, z + dz, weapon, 1e9);
    spawnMedkitDrop(x - 14, z, 1e9);
    showStageMsg('BLACK GUARD DOWN — FINAL RESUPPLY DEPLOYED', 4300);
}

function cleanupCine(revealSec = 0) {
    cine = null; hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, revealSec); setCinematicActive(false);
}

function finishReturnCine(skipped = false) {
    if (skipped) resetDialogue();
    updateStage12Transport(0, 1, true); cleanupCine(stageCfg().fadeSec);
    phase = 'silentApproach'; gateArmed = false; parkSealed = false;
    activateEncounter('deployment');
    queueDialogue('monasAhead');
    showStageMsg('ADVANCE THROUGH SILENT JAKARTA — REACH MEDAN MERDEKA', 4800);
}

function startReturnCine() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'return', t: 0, dialogue: false, deployed: false };
    cineCam.x = 145; cineCam.y = 175; cineCam.z = 128;
    setCineFocus(S12_START.x - 60, S12_START.z, true);
    showCutsceneSkip(() => finishReturnCine(true));
}

function updateReturnCine(dt) {
    const C = stageCfg().returnCine; cine.t += dt;
    if (!cine.dialogue) { cine.dialogue = true; queueDialogue('returnJakarta'); }
    const progress = cine.t / Math.max(0.1, C.deploySec);
    cine.deployed = cine.t >= C.deploySec;
    updateStage12Transport(dt, progress, cine.deployed);
    if (cine.deployed) setCineFocus(S12_START.x + 35, S12_START.z, false);
    if (cine.t >= C.durationSec && dialogueIdle()) finishReturnCine(false);
}

function beginVaultReveal() {
    if (phase === 'vaultReveal' || boss?.active) return;
    phase = 'vaultReveal'; bossRevealT = 0;
    releaseInputs(); clearMoveTarget(); setCinematicActive(true);
    setCineBars(true); cineCam.x = -105; cineCam.y = 145; cineCam.z = 105;
    setCineFocus(S12_BOSS_CENTER.x, S12_BOSS_CENTER.z, true);
    resetMahapatih(boss, { active: true, phase: 'siege',
        x: S12_BOSS_CENTER.x, z: S12_BOSS_CENTER.z, yaw: -Math.PI / 2,
        holdSec: bossCfg().attackGapSec });
    startBossMusic();
    queueDialogue('vaultOpening'); queueDialogue('gibranAnswer');
    showStageMsg('M-0 MAHAPATIH — SOVEREIGN WAR BODY', 5200);
}

function finishVaultReveal() {
    cleanupCine(stageCfg().fadeSec); phase = 'bossPhase1';
}

function bossPhaseCallback(nextPhase) {
    if (nextPhase === 'transition') {
        phase = 'bossTransition';
        showStageMsg('SIEGE CHASSIS RUPTURED', 3500);
    } else if (nextPhase === 'personal') {
        phase = 'bossPhase2'; queueDialogue('phaseTwo');
        showStageMsg('MAHAPATIH COMBAT FRAME ENGAGED', 4300);
    } else if (nextPhase === 'hardline') {
        phase = 'zeroHour'; queueDialogue('hardlineStart');
        showStageMsg('COUNTERMAND CHARGING — SEVER THE FOUR HARDLINES', 5200);
    } else if (nextPhase === 'core') {
        phase = 'finalCore'; queueDialogue('finalCore');
        showStageMsg('SHIELD DOWN — DESTROY THE EXPOSED CORE', 4700);
    } else if (nextPhase === 'dying') {
        phase = 'bossDeath'; hideBossHud(); stopMusic(); queueDialogue('mahapatihDeath');
    } else if (nextPhase === 'wreck') startEnding();
}

function anchorCallback(index, remaining) {
    if (remaining === bossCfg().hardline.anchorCount - 1) queueDialogue('anchorOne');
    showStageMsg(`HARDLINE ${index + 1} SEVERED — ${remaining} REMAINING`, 3000);
}

function updateBossHud() {
    const d = mahapatihDebug(boss); if (!d || !boss.active || boss.dead) return hideBossHud();
    let hp = d.hp, maxHp = d.maxHp;
    let state = 'SOVEREIGN SIEGE FRAME', secondaryLabel = '', secondaryFraction = 0;
    if (d.phase === 'transition') state = 'CHASSIS RUPTURE';
    else if (d.phase === 'personal') state = 'MAHAPATIH COMBAT FRAME';
    else if (d.phase === 'hardline') {
        state = 'COUNTERMAND CHARGING'; secondaryLabel = 'HARDLINES';
        secondaryFraction = 1 - d.anchorsRemaining / Math.max(1, bossCfg().hardline.anchorCount);
        hp = d.hardlines.reduce((sum, h) => sum + h.hp, 0);
        maxHp = d.hardlines.reduce((sum, h) => sum + h.maxHp, 0);
    } else if (d.phase === 'core') {
        state = d.hitVolumes.coreOpen ? 'CORE EXPOSED' : 'CORE SHUTTERS CLOSED';
        secondaryLabel = 'CORE WINDOW'; secondaryFraction = d.hitVolumes.coreOpen ? 1 : 0;
    }
    setBossHud({ name: 'M-0 MAHAPATIH — SOVEREIGN WAR BODY', hp,
        maxHp, state, secondaryLabel, secondaryFraction });
}

function startEnding() {
    if (phase === 'ending' || phase === 'complete') return;
    clearMahapatihHazards(boss); hideBossHud(); phase = 'ending'; endingT = 0;
    releaseInputs(); clearMoveTarget(); setCinematicActive(true);
    setCineBars(true); setCineFade(0, 0); hideStage12Transport();
    cineCam.x = END_CAM.x; cineCam.y = END_CAM.y; cineCam.z = END_CAM.z;
    setCineFocus(S12_MONAS.x - 72, S12_MONAS.z, true);
    // Any presentation-only guards still alive shut down without loot/score.
    clearStage12Robots();
}

function finishCampaign() {
    if (completionCommitted) return;
    completionCommitted = true; phase = 'complete'; complete = true;
    resetDialogue(); hideBossHud(); cleanupCine(stageCfg().ending.fadeSec);
    // gameOver performs clearCampaignSave here — never at enter() or during the
    // epilogue. An interruption before this callback retains checkpoint 12.
    finalScreenShown = true;
    gameOver(true, 'CAMPAIGN COMPLETE', {
        continueLabel: 'RETURN TO MAIN MENU',
        onContinue: () => location.reload(),
    });
}

function updateEnding(dt) {
    const E = stageCfg().ending; endingT += dt;
    const sunriseStart = E.settleSec;
    setStage12Sunrise((endingT - sunriseStart) / Math.max(0.1, E.sunriseSec));
    if (endingT >= E.settleSec + E.dialogueDelaySec && !dialogueSeen.has('networkSafe')) {
        queueDialogue('networkSafe'); queueDialogue('finalGibran');
    }
    if (endingT >= E.settleSec + E.dialogueDelaySec + E.sunriseSec && dialogueIdle())
        finishCampaign();
}

// Gerbang taman: TIDAK dibuka lewat timer. Ia merespons kedatangan player hanya
// setelah boulevard bersih, lalu MENUTUP PERMANEN begitu player melewati garis
// gerbang — sejak itu Taman Monas adalah arena tertutup (permintaan user
// 2026-09-03: "pintu gerbang itu tertutup agar player tidak bisa keluar").
function gateTarget() {
    if (parkSealed || !gateArmed) return 0;
    return Math.hypot(camera.position.x - S12_GATE.x,
        camera.position.z - S12_GATE.z) <= stageCfg().gateOpenRange ? 1 : 0;
}

function sealPark() {
    if (parkSealed) return;
    parkSealed = true; phase = 'parkSealed';
    sealStage12Gate(); queueDialogue('gateSealed');
    showStageMsg('GATE SEALED — APPROACH THE MONUMENT', 4600);
}

function updateApproach() {
    const encounters = stageCfg().encounters || [];
    for (let i = 0; i < encounters.length; i++) {
        const encounter = encounters[i];
        const trigger = encounterTrigger(encounter.triggerX);
        const census = guardCensus.find(x => x.id === encounter.id);
        const priorCleared = i === 0 || encounterAlive(encounters[i - 1].id) === 0;
        if (camera.position.x >= trigger && priorCleared && census && !census.activated) {
            activateEncounter(encounter.id);
            if (encounter.id === 'park') {
                phase = 'blackGuard'; queueDialogue('offlineWake');
                showStageMsg('BLACK GUARD HARDLINE DETECTED', 4200);
            }
        }
    }
    if (!allGuardsDown()) return;
    placeBossResupply();
    if (!gateArmed) {
        gateArmed = true; phase = 'gateApproach'; queueDialogue('gateAhead');
        showStageMsg('MEDAN MERDEKA GATE — THE ONLY WAY INTO THE PARK', 4600);
    }
    if (!parkSealed && stage12InsidePark(camera.position.x, camera.position.z)) sealPark();
}

// Boss hanya bangkit ketika player benar-benar MENDEKATI monumen — bukan saat
// gerbang tertutup. Jaraknya dalam METER (config), dikali CAMP_M sekali di sini.
function updateSealedPark() {
    if (stage12MonasDistance(camera.position.x, camera.position.z) <= bossTriggerRange())
        beginVaultReveal();
}

function resetStage() {
    phase = 'returnCine'; complete = false; elapsed = 0; cine = null;
    bossRevealT = 0; endingT = 0;
    gateArmed = false; parkSealed = false;
    completionCommitted = false; finalScreenShown = false;
    guardSpawned = new Set(); guardCensus = []; guardSuppliesPlaced = false;
    resetDialogue(); hideBossHud(); resetStage12World();
    if (boss) resetMahapatih(boss, { active: false });
    hideCutsceneSkip(); setCineBars(false); setCineFade(0, 0); setCinematicActive(false);
}

function bossAllowed() {
    return ['bossPhase1', 'bossTransition', 'bossPhase2', 'zeroHour',
        'finalCore', 'bossDeath'].includes(phase);
}

export const stage12Scene = {
    id: 'campaign-12', lightsKey: STAGE12_LIGHTS_KEY,
    enter() {
        saveCampaignStage(12); worldRoot = ensureStage12World(scene);
        // DUA root: jalan pendekatan campaign DAN Taman Monas bersama.
        setActiveCampaignWorldRoots(STAGE12_ROOT_KEYS);
        setActiveStageLights(STAGE12_LIGHTS_KEY); applyLightPreset(scene, 'midnight');
        enterCityEnv({ background: 0x090d16, fogColor: 0x0d1118,
            fogNear: 210, fogFar: 1550 });
        clearStage12Robots(); resetStage();
        resetMahapatih(boss, { active: false,
            x: S12_BOSS_CENTER.x, z: S12_BOSS_CENTER.z });
        prepareConfiguredGuards();
        camera.position.set(S12_START.x, CFG.player.eyeHeight, S12_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startReturnCine(); updateUI();
    },
    exit() {
        clearMahapatihHazards(boss); resetMahapatih(boss, { active: false });
        resetDialogue(); hideBossHud(); stopMusic(); cleanupCine(0);
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) {
        elapsed += dt; updateDialogue(dt);
        updateStage12World(dt); updateStage12Gate(dt, gateTarget());
        if (cine?.kind === 'return') updateReturnCine(dt);
        else if (phase === 'silentApproach' || phase === 'blackGuard'
            || phase === 'gateApproach') updateApproach();
        else if (phase === 'parkSealed') updateSealedPark();
        else if (phase === 'vaultReveal') {
            bossRevealT += dt;
            updateMahapatih(boss, dt, { ...bossContext, allowAttack: false,
                onPhase: bossPhaseCallback, onAnchor: anchorCallback });
            if (bossRevealT >= stageCfg().fadeSec && dialogueIdle()) finishVaultReveal();
        } else if (bossAllowed()) {
            updateMahapatih(boss, dt, { ...bossContext,
                allowAttack: phase !== 'bossTransition' && phase !== 'bossDeath',
                onPhase: bossPhaseCallback, onAnchor: anchorCallback });
            updateBossHud();
        } else if (phase === 'ending') updateEnding(dt);
        updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage12Walk, pos, oldX, oldZ, player.radius);
        resolveStage12World(pos, player.radius, feetY, oldX, oldZ);
        if (boss?.active) resolveMahapatihBlock(boss, pos, player.radius);
        slideWalk(stage12Walk, pos, oldX, oldZ, player.radius);
    },
    // Bak air mancur dan bibir kolam pantul BISA dinaiki, persis seperti di
    // Taman Monas Survival — tingginya datang dari collider yang digambar.
    groundHeight: (x, z, feetY) => stage12GroundHeight(x, z, feetY),
    bulletBlocked(bullet) {
        return mahapatihBulletHit(boss, bullet, {
            ...bossContext, onPhase: bossPhaseCallback, onAnchor: anchorCallback,
        }) || stage12BulletBlocked(bullet);
    },
    blastBlocked: stage12BlastBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage12Walk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -0.42; g.vz *= -0.42;
        }
        resolveStage12World(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        if (bossAllowed() || phase === 'ending' || phase === 'complete') return { skip: true };
        return campaignRobotAI(bot, dt, step, {
            walkable: stage12Walk, resolve: resolveStage12World,
            activate: z => z.state !== 'idle',
        });
    },
    clampRobot(bot, oldX, oldZ) {
        // Posisi frame sebelumnya DITERUSKAN: `resolveMonas` memakainya untuk
        // memutuskan sumbu mana yang boleh menyusur sisi monumen. Clamp generik
        // memanggil `resolve(p, r, f)` tanpa itu, jadi ditutup di sini.
        campaignClampRobot(bot, oldX, oldZ, {
            walkable: stage12Walk,
            resolve: (p, r, f) => resolveStage12World(p, r, f, oldX, oldZ),
        });
    },
    clampDropPos(x, z) {
        return stage12Walk(x, z, 2) ? [x, z] : [S12_ARENA_ENTRY.x - 42, 0];
    },
    hudStatus() {
        if (phase === 'returnCine') return 'STAGE 12 — ZERO HOUR: MONAS';
        if (phase === 'silentApproach' || phase === 'blackGuard')
            return `SILENT JAKARTA — HARDWIRED GUARDS ${countStageRobots(12)}`;
        if (phase === 'gateApproach') return 'ENTER TAMAN MONAS THROUGH THE GATE';
        if (phase === 'parkSealed') return 'GATE SEALED — APPROACH THE MONUMENT';
        const d = mahapatihDebug(boss);
        if (phase === 'zeroHour') return `COUNTERMAND CHARGING — HARDLINES ${d?.anchorsRemaining ?? 0}`;
        if (phase === 'finalCore') return `M-0 CORE — ${d?.hitVolumes?.coreOpen ? 'EXPOSED' : 'SHUTTERS CLOSED'}`;
        if (phase === 'ending') return 'ZERO HOUR ENDED — DAWN OVER JAKARTA';
        if (phase === 'complete') return 'CAMPAIGN COMPLETE';
        return 'M-0 MAHAPATIH — SOVEREIGN WAR BODY';
    },
    radarLandmarks(plot) {
        if (phase === 'zeroHour') {
            const d = mahapatihDebug(boss);
            for (const h of d?.hardlines || []) if (h.alive) {
                const s = S12_HARDLINE_STATIONS[h.index];
                plot(s.x - camera.position.x, s.z - camera.position.z, '#ffb03b', 5, true);
            }
        } else if (boss?.active && !boss.dead) {
            const p = boss.parts.group.position;
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ff4a3c', 6, true);
        } else if (phase === 'gateApproach') {
            plot(S12_GATE.x - camera.position.x,
                S12_GATE.z - camera.position.z, '#ffb03b', 5, true);
        } else if (phase !== 'parkSealed') {
            plot(S12_ARENA_ENTRY.x - camera.position.x,
                S12_ARENA_ENTRY.z - camera.position.z, '#ffb03b', 5, true);
        }
        plot(S12_MONAS.x - camera.position.x, S12_MONAS.z - camera.position.z,
            '#d8d2c4', 4, true);
    },
    // KAMERA TIDAK PERNAH DIKUNCI DI SINI (2026-09-04, permintaan user "jangan
    // kunci kamera ketika melawan boss ... aturan kamera terkunci itu hanya ada
    // di stage 4 boss tank"). Duel Mahapatih memakai kamera pengikut biasa;
    // `S12_ARENA_BOUNDS` tinggal menjadi batas PROYEKTIL boss, bukan batas
    // pandangan. Stage 4 adalah satu-satunya stage yang menjepit kamera, karena
    // di sana tank sengaja bisa menghilang dari jangkauan pandang.
    camBounds: () => null,
    get camOffset() {
        if (cine || phase === 'vaultReveal') return cineCam;
        if (bossAllowed()) return BOSS_CAM;
        if (phase === 'ending') return END_CAM;
        return PLAY_CAM;
    },
};

// Integration/debug helpers intentionally avoid mutating shared systems.
export const stage12DamageBossForDebug = damage => damageMahapatih(boss, damage, {
    force: true, ctx: { ...bossContext, onPhase: bossPhaseCallback,
        onAnchor: anchorCallback },
});
export const stage12DamageHardlineForDebug = (index, damage) =>
    damageMahapatihHardline(boss, index, damage, {
        ...bossContext, onPhase: bossPhaseCallback, onAnchor: anchorCallback,
    });
export const stage12BeginEndingForDebug = () => startEnding();
export const stage12CompleteEndingForDebug = () => finishCampaign();

export const stage12Debug = () => {
    const world = stage12WorldDebug(), bossState = mahapatihDebug(boss);
    return {
        phase, complete, elapsed, cinematic: !!cine || phase === 'vaultReveal'
            || phase === 'ending', cameraLocked: false, completionCommitted,
        finalScreenShown, checkpointClearTiming: finalScreenShown ? 'complete' : 'preserved',
        gate: { ...stage12GateState(), armed: gateArmed, parkSealed },
        bossTrigger: { meters: stageCfg().bossTriggerMeters, units: bossTriggerRange(),
            monasDistance: stage12MonasDistance(camera.position.x, camera.position.z) },
        guards: {
            configured: guardCensus.reduce((n, e) => n + e.total, 0),
            alive: countStageRobots(12), activeNearby: robots.reduce((n, r) => n
                + (r.stage === 12 && r.state !== 'idle' ? 1 : 0), 0),
            hardwired: robots.filter(r => r.stage === 12 && r.hardwired).length,
            noBossAdds: bossAllowed() && countStageRobots(12) === 0,
            encounters: guardCensus.map(e => ({ ...e, alive: encounterAlive(e.id) })),
        },
        boss: bossState,
        telegraph: bossState ? { attack: bossState.attack,
            chargePath: bossState.chargePath,
            countermand: bossState.countermand } : null,
        monasCollisionClearance: world.chargeLanes.every(l => l.clearOfMonas),
        endingCleanup: phase === 'ending' || phase === 'complete'
            ? !!bossState?.hazardsCleared && countStageRobots(12) === 0 : false,
        objective: stage12Scene.hudStatus(), world,
        dialogue: { current: dialogueCurrent?.key || null,
            queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen] },
    };
};
