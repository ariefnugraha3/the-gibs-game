// Campaign Stage 13 — ZERO HOUR: MONAS.
// Compact hardwired-guard approach -> independent M-0 Mahapatih encounter ->
// sunrise epilogue. The final `gameOver` is deliberately delayed until every
// epilogue beat has resolved, so checkpoint 13 survives an interrupted ending.

import { CFG } from '../../../../core/config.js';
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
    STAGE13_LIGHTS_KEY, S13_ORIGIN, S13_START, S13_ARENA_ENTRY,
    S13_BOSS_CENTER, S13_MONAS, S13_ARENA_BOUNDS, S13_CHARGE_LANES,
    S13_HARDLINE_STATIONS,
    ensureStage13World as ensureWorldRoot, stage13WorldDebug,
    stage13Walk, resolveStage13World, clampStage13Boss,
    stage13BulletBlocked, stage13BlastBlocked,
    resetStage13World, updateStage13World, updateStage13Transport,
    hideStage13Transport, setStage13Sunrise,
} from './world.js';

export { stage13WorldDebug };

export const STAGE13_DIALOGUE = dialogueMap('campaign.stage13.lines');

const PLAY_CAM = Object.freeze({ x: -82, y: 132, z: 82 });
const BOSS_CAM = Object.freeze({ x: -112, y: 165, z: 112 });
const END_CAM = Object.freeze({ x: -135, y: 116, z: 102 });
const cineCam = { ...CAM_OFF_DEFAULT };
const bossContext = {
    center: S13_BOSS_CENTER,
    chargeLanes: S13_CHARGE_LANES,
    clampBoss: clampStage13Boss,
    projectileAllowed: (x, z) => x >= S13_ARENA_BOUNDS.x0 && x <= S13_ARENA_BOUNDS.x1
        && z >= S13_ARENA_BOUNDS.z0 && z <= S13_ARENA_BOUNDS.z1,
    wreckDir: { x: -1, z: 0.2 },
};

let worldRoot = null, boss = null;
let phase = 'returnCine', complete = false, elapsed = 0;
let cine = null, arenaLocked = false, bossRevealT = 0, endingT = 0;
let completionCommitted = false, finalScreenShown = false;
let guardSpawned = new Set(), guardCensus = [], guardSuppliesPlaced = false;
let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
let dialogueT = 0, dialogueChars = 0;

function stageCfg() { return CFG.campaign.stage13; }
function bossCfg() { return CFG.campaign.bosses.mahapatih; }

// Stage 1 calls this during the initial campaign build. Creating the entity
// here ensures every fixed pool exists before Stage 13; loading may reveal all
// child programs temporarily while the world root itself remains inactive.
export function ensureStage13World(parent = scene) {
    worldRoot = ensureWorldRoot(parent);
    if (!boss) {
        boss = createMahapatih({ parent: worldRoot, active: false,
            x: S13_BOSS_CENTER.x, z: S13_BOSS_CENTER.z });
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
    const line = STAGE13_DIALOGUE[key];
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

function clearStage13Robots() {
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 13) {
        disposeRobot(robots[i]); scene.remove(robots[i].mesh); robots.splice(i, 1);
    }
}

function encounterPoint(raw) {
    // Config accepts map-local offsets (the committed schema) while retaining
    // sane support for absolute values in a tuning branch.
    return {
        x: Math.abs(raw.x) < 10000 ? S13_ORIGIN.x + raw.x : raw.x,
        z: Math.abs(raw.z) < 10000 ? S13_ORIGIN.z + raw.z : raw.z,
    };
}

function encounterTrigger(raw) {
    return Math.abs(raw) < 10000 ? S13_ORIGIN.x + raw : raw;
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
            spawnCampaignRobot(x, z, 13, spec.cls, false);
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
    for (const bot of robots) if (bot.stage === 13 && bot.encounter === id
        && bot.state === 'idle') bot.state = 'chasing';
}

function encounterAlive(id) {
    return robots.reduce((n, bot) => n + (bot.stage === 13 && bot.encounter === id ? 1 : 0), 0);
}

function allGuardsDown() {
    return guardCensus.length > 0 && guardCensus.every(e => e.spawned)
        && countStageRobots(13) === 0;
}

function placeBossResupply() {
    if (guardSuppliesPlaced) return;
    guardSuppliesPlaced = true;
    const x = S13_ARENA_ENTRY.x - 36, z = S13_ARENA_ENTRY.z;
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
    updateStage13Transport(0, 1, true); cleanupCine(stageCfg().fadeSec);
    phase = 'silentApproach'; activateEncounter('deployment');
    queueDialogue('monasAhead');
    showStageMsg('ADVANCE THROUGH SILENT JAKARTA — REACH MEDAN MERDEKA', 4800);
}

function startReturnCine() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { kind: 'return', t: 0, dialogue: false, deployed: false };
    cineCam.x = 145; cineCam.y = 175; cineCam.z = 128;
    setCineFocus(S13_START.x - 60, S13_START.z, true);
    showCutsceneSkip(() => finishReturnCine(true));
}

function updateReturnCine(dt) {
    const C = stageCfg().returnCine; cine.t += dt;
    if (!cine.dialogue) { cine.dialogue = true; queueDialogue('returnJakarta'); }
    const progress = cine.t / Math.max(0.1, C.deploySec);
    cine.deployed = cine.t >= C.deploySec;
    updateStage13Transport(dt, progress, cine.deployed);
    if (cine.deployed) setCineFocus(S13_START.x + 35, S13_START.z, false);
    if (cine.t >= C.durationSec && dialogueIdle()) finishReturnCine(false);
}

function beginVaultReveal() {
    if (phase === 'vaultReveal' || boss?.active) return;
    phase = 'vaultReveal'; bossRevealT = 0; arenaLocked = true;
    releaseInputs(); clearMoveTarget(); setCinematicActive(true);
    setCineBars(true); cineCam.x = -105; cineCam.y = 145; cineCam.z = 105;
    setCineFocus(S13_BOSS_CENTER.x, S13_BOSS_CENTER.z, true);
    resetMahapatih(boss, { active: true, phase: 'siege',
        x: S13_BOSS_CENTER.x, z: S13_BOSS_CENTER.z, yaw: -Math.PI / 2,
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
    arenaLocked = false; releaseInputs(); clearMoveTarget(); setCinematicActive(true);
    setCineBars(true); setCineFade(0, 0); hideStage13Transport();
    cineCam.x = END_CAM.x; cineCam.y = END_CAM.y; cineCam.z = END_CAM.z;
    setCineFocus(S13_MONAS.x - 72, S13_MONAS.z, true);
    // Any presentation-only guards still alive shut down without loot/score.
    clearStage13Robots();
}

function finishCampaign() {
    if (completionCommitted) return;
    completionCommitted = true; phase = 'complete'; complete = true;
    resetDialogue(); hideBossHud(); cleanupCine(stageCfg().ending.fadeSec);
    // gameOver performs clearCampaignSave here — never at enter() or during the
    // epilogue. An interruption before this callback retains checkpoint 13.
    finalScreenShown = true;
    gameOver(true, 'CAMPAIGN COMPLETE', {
        continueLabel: 'RETURN TO MAIN MENU',
        onContinue: () => location.reload(),
    });
}

function updateEnding(dt) {
    const E = stageCfg().ending; endingT += dt;
    const sunriseStart = E.settleSec;
    setStage13Sunrise((endingT - sunriseStart) / Math.max(0.1, E.sunriseSec));
    if (endingT >= E.settleSec + E.dialogueDelaySec && !dialogueSeen.has('networkSafe')) {
        queueDialogue('networkSafe'); queueDialogue('finalGibran');
    }
    if (endingT >= E.settleSec + E.dialogueDelaySec + E.sunriseSec && dialogueIdle())
        finishCampaign();
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
    if (allGuardsDown()) placeBossResupply();
    const range = stageCfg().arenaEnterRange;
    if (allGuardsDown() && Math.hypot(camera.position.x - S13_ARENA_ENTRY.x,
        camera.position.z - S13_ARENA_ENTRY.z) <= range) beginVaultReveal();
}

function resetStage() {
    phase = 'returnCine'; complete = false; elapsed = 0; cine = null;
    arenaLocked = false; bossRevealT = 0; endingT = 0;
    completionCommitted = false; finalScreenShown = false;
    guardSpawned = new Set(); guardCensus = []; guardSuppliesPlaced = false;
    resetDialogue(); hideBossHud(); resetStage13World();
    if (boss) resetMahapatih(boss, { active: false });
    hideCutsceneSkip(); setCineBars(false); setCineFade(0, 0); setCinematicActive(false);
}

function bossAllowed() {
    return ['bossPhase1', 'bossTransition', 'bossPhase2', 'zeroHour',
        'finalCore', 'bossDeath'].includes(phase);
}

export const stage13Scene = {
    id: 'campaign-13', lightsKey: STAGE13_LIGHTS_KEY,
    enter() {
        saveCampaignStage(13); worldRoot = ensureStage13World(scene);
        setActiveCampaignWorldRoots(STAGE13_LIGHTS_KEY);
        setActiveStageLights(STAGE13_LIGHTS_KEY); applyLightPreset(scene, 'midnight');
        enterCityEnv({ background: 0x090d16, fogColor: 0x0d1118,
            fogNear: 210, fogFar: 1550 });
        clearStage13Robots(); resetStage();
        resetMahapatih(boss, { active: false,
            x: S13_BOSS_CENTER.x, z: S13_BOSS_CENTER.z });
        prepareConfiguredGuards();
        camera.position.set(S13_START.x, CFG.player.eyeHeight, S13_START.z);
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
        updateStage13World(dt);
        if (cine?.kind === 'return') updateReturnCine(dt);
        else if (phase === 'silentApproach' || phase === 'blackGuard') updateApproach();
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
        slideWalk(stage13Walk, pos, oldX, oldZ, player.radius);
        resolveStage13World(pos, player.radius, feetY);
        if (boss?.active) resolveMahapatihBlock(boss, pos, player.radius);
        slideWalk(stage13Walk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: () => 0,
    bulletBlocked(bullet) {
        return mahapatihBulletHit(boss, bullet, {
            ...bossContext, onPhase: bossPhaseCallback, onAnchor: anchorCallback,
        }) || stage13BulletBlocked(bullet);
    },
    blastBlocked: stage13BlastBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage13Walk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -0.42; g.vz *= -0.42;
        }
        resolveStage13World(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        if (bossAllowed() || phase === 'ending' || phase === 'complete') return { skip: true };
        return campaignRobotAI(bot, dt, step, {
            walkable: stage13Walk, resolve: resolveStage13World,
            activate: z => z.state !== 'idle',
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage13Walk, resolve: resolveStage13World });
    },
    clampDropPos(x, z) {
        return stage13Walk(x, z, 2) ? [x, z] : [S13_ARENA_ENTRY.x - 42, 0];
    },
    hudStatus() {
        if (phase === 'returnCine') return 'STAGE 13 — ZERO HOUR: MONAS';
        if (phase === 'silentApproach' || phase === 'blackGuard')
            return `SILENT JAKARTA — HARDWIRED GUARDS ${countStageRobots(13)}`;
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
                const s = S13_HARDLINE_STATIONS[h.index];
                plot(s.x - camera.position.x, s.z - camera.position.z, '#ffb03b', 5, true);
            }
        } else if (boss?.active && !boss.dead) {
            const p = boss.parts.group.position;
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ff4a3c', 6, true);
        } else {
            plot(S13_ARENA_ENTRY.x - camera.position.x,
                S13_ARENA_ENTRY.z - camera.position.z, '#ffb03b', 5, true);
        }
        plot(S13_MONAS.x - camera.position.x, S13_MONAS.z - camera.position.z,
            '#d8d2c4', 4, true);
    },
    camBounds() { return arenaLocked ? S13_ARENA_BOUNDS : null; },
    get camOffset() {
        if (cine || phase === 'vaultReveal') return cineCam;
        if (bossAllowed()) return BOSS_CAM;
        if (phase === 'ending') return END_CAM;
        return PLAY_CAM;
    },
};

// Integration/debug helpers intentionally avoid mutating shared systems.
export const stage13DamageBossForDebug = damage => damageMahapatih(boss, damage, {
    force: true, ctx: { ...bossContext, onPhase: bossPhaseCallback,
        onAnchor: anchorCallback },
});
export const stage13DamageHardlineForDebug = (index, damage) =>
    damageMahapatihHardline(boss, index, damage, {
        ...bossContext, onPhase: bossPhaseCallback, onAnchor: anchorCallback,
    });
export const stage13BeginEndingForDebug = () => startEnding();
export const stage13CompleteEndingForDebug = () => finishCampaign();

export const stage13Debug = () => {
    const world = stage13WorldDebug(), bossState = mahapatihDebug(boss);
    return {
        phase, complete, elapsed, cinematic: !!cine || phase === 'vaultReveal'
            || phase === 'ending', arenaLocked, completionCommitted,
        finalScreenShown, checkpointClearTiming: finalScreenShown ? 'complete' : 'preserved',
        guards: {
            configured: guardCensus.reduce((n, e) => n + e.total, 0),
            alive: countStageRobots(13), activeNearby: robots.reduce((n, r) => n
                + (r.stage === 13 && r.state !== 'idle' ? 1 : 0), 0),
            hardwired: robots.filter(r => r.stage === 13 && r.hardwired).length,
            noBossAdds: bossAllowed() && countStageRobots(13) === 0,
            encounters: guardCensus.map(e => ({ ...e, alive: encounterAlive(e.id) })),
        },
        boss: bossState,
        telegraph: bossState ? { attack: bossState.attack,
            chargePath: bossState.chargePath,
            countermand: bossState.countermand } : null,
        monasCollisionClearance: world.chargeLanes.every(l => l.clearOfMonas),
        endingCleanup: phase === 'ending' || phase === 'complete'
            ? !!bossState?.hazardsCleared && countStageRobots(13) === 0 : false,
        objective: stage13Scene.hudStatus(), world,
        dialogue: { current: dialogueCurrent?.key || null,
            queued: dialogueQueue.map(x => x.key), seen: [...dialogueSeen] },
    };
};
