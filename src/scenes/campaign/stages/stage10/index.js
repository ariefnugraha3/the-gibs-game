// Campaign Stage 10 facade — Chapter 1 THE IRON PORT -> Chapter 2 THE GREEN FIREWALL.
// sceneManager only ever sees `stage10Scene`; chapter handoff keeps
// checkpoint, loadout, stats and dialogue lifecycle inside one campaign stage.

import { CFG, CAMP_M } from '../../../../core/config.js';
import {
    player, robots, keys, setCinematicActive, setPaused,
    bullets, enemyBullets, grenades, explosions, drops, clearArray,
} from '../../../../core/state.js';
import {
    scene, camera, viewCam, renderer, composer, postFxOn,
    CAM_OFF_DEFAULT, setCineFocus,
} from '../../../../core/renderer.js';
import { showLoading, loadingStep, hideLoading } from '../../../../core/preload.js';
import { resetRobotsFx } from '../../../../entities/robots.js';
import {
    showStageMsg, hideStageRadioDialogue, hideDownloadBar,
    setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { resetCrates, spawnCrate, resolveCrateBlock } from '../../../../entities/crates.js';
import { resetBarrels, spawnBarrel, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import {
    campaignAwardKill, campaignRobotAI, campaignClampRobot, countStageRobots,
} from '../../utility/common.js';
import { campaignJumpToStage, beginStageTransition } from '../../utility/transition.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { applyLightPreset, setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import { stage1Scene } from '../stage1/index.js';
import { stage11Scene } from '../stage11/index.js';
import {
    stage10PortScene, stage10PortDebug, ensureStage10World as ensureStage10PortWorld,
    setStage10CompletionHook,
} from './port.js';
import {
    STAGE10_FOREST_LIGHTS_KEY, S10_FOREST_START, S10_FOREST_START_FORWARD,
    S10_FOREST_WRECK,
    S10_FOREST_SENSOR_ENTRY, S10_FOREST_SHELTER, S10_FOREST_WATERWORKS,
    S10_FOREST_GALLERY, S10_FOREST_FINISH,
    ensureStage10ForestWorld, stage10ForestWorldDebug,
    stage10ForestWalk, stage10ForestResolve, stage10ForestGroundHeight,
    stage10ForestNav, stage10ForestSegBlocked,
    updateStage10ForestWorldVisuals, resetStage10ForestWorldVisuals,
    setStage10ForestTunnelOpen,
} from './forestWorld.js';
import {
    buildStage10ForestSensorGrid, resetStage10ForestSensorGrid,
    clearStage10ForestStrikes, updateStage10ForestSensorGrid,
    consumeStage10ForestFirstLock, stage10ForestScanDebug,
} from './sensorGrid.js';
import {
    STAGE10_FOREST_DIALOGUE, queueStage10ForestDialogue, updateStage10ForestDialogue,
    resetStage10ForestDialogue, stage10ForestDialogueIdle, stage10ForestDialogueDebug,
    clearStage10ForestRobots, spawnStage10ForestWave, stage10ForestWaveTotals,
    activateStage10ForestPrefix, stage10ForestPrefixAlive,
} from './forestRuntime.js';
import {
    resetStage10SpawnDeployment, updateStage10SpawnDeployment,
    stage10SpawnDeploymentDebug, stage10SpawnDeploymentBulletHit,
} from './spawnDeployment.js';

export { stage10PortScene, STAGE10_DIALOGUE, stage10RobotInView } from './port.js';
export { stage10ForestWorldDebug, STAGE10_FOREST_DIALOGUE };

export function ensureStage10World(parent = scene) {
    return {
        port: ensureStage10PortWorld(),
        forest: ensureStage10ForestWorld(parent),
    };
}

const PLAY_CAM = Object.freeze({ x: -70.7, y: 116, z: 70.7 });
const cineCam = { ...CAM_OFF_DEFAULT };
const phases = ['ambush', 'forestApproach', 'scanBelt', 'waterworks',
    'finalSweep', 'tunnelEntry', 'complete'];
let phase = 'ambush';
let complete = false;
let elapsed = 0;
let cine = null;
let transitionCommitted = false;
let interactionT = 0;
let spawned = { forest: false, sensor: false, water: false };
let ambushReleased = false;   // player sudah keluar dari zona aman 20 m?
let waveCursor = { forest: -1, sensor: -1, water: -1 };
let configuredTotals = { forest: [], sensor: [], water: [] };
let encounterDebug = [];

const FOREST_POINTS = [
    { x: 360590, z: -245 }, { x: 360470, z: -160 },
    { x: 360350, z: -245 }, { x: 360300, z: -55 },
];
const SENSOR_POINTS = [
    { x: 360125, z: -80 }, { x: 360050, z: 70 },
    { x: 359970, z: -20 }, { x: 359890, z: 145 },
];
const WATER_POINTS = [
    { x: 359790, z: 130 }, { x: 359700, z: 215 },
    { x: 359590, z: 125 }, { x: 359500, z: 245 }, { x: 359360, z: 205 },
];

function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }

// ZONA AMAN PEMBUKA (2026-08-26, permintaan user): radius bebas-robot di
// sekitar titik masuk Chapter 2. Tak satu pun robot boleh lahir di dalamnya,
// dan gelombang penyergapan baru bangun setelah player MAJU keluar darinya —
// jadi player tak lagi langsung diserbu begitu bab berganti.
function safeStartRadius() {
    return Math.max(0, CFG.campaign.stage10.chapter2.safeStartMeters || 0) * CAMP_M;
}
function safeStartZone() {
    return { x: S10_FOREST_START.x, z: S10_FOREST_START.z, r: safeStartRadius() };
}
function playerAdvance() {
    return Math.max(0, (camera.position.x - S10_FOREST_START.x) * S10_FOREST_START_FORWARD.x
        + (camera.position.z - S10_FOREST_START.z) * S10_FOREST_START_FORWARD.z);
}

function resetStage() {
    phase = 'ambush'; complete = false; elapsed = 0; cine = null;
    transitionCommitted = false; interactionT = 0;
    spawned = { forest: false, sensor: false, water: false }; encounterDebug = [];
    ambushReleased = false;
    waveCursor = { forest: -1, sensor: -1, water: -1 };
    const e = CFG.campaign.stage10.chapter2.encounters;
    configuredTotals = {
        forest: stage10ForestWaveTotals(e.forestApproach),
        sensor: stage10ForestWaveTotals(e.sensorBasin),
        water: stage10ForestWaveTotals(e.waterworks),
    };
    resetStage10SpawnDeployment('campaign-10-forest');
    resetStage10ForestDialogue(); resetStage10ForestSensorGrid();
    resetStage10ForestWorldVisuals();
    hideDownloadBar(); hideCutsceneSkip(); setCineBars(false); setCineFade(0, 0);
}

function spawnNextWave(kind) {
    const e = CFG.campaign.stage10.chapter2.encounters;
    const raw = kind === 'forest' ? e.forestApproach
        : kind === 'sensor' ? e.sensorBasin : e.waterworks;
    const points = kind === 'forest' ? FOREST_POINTS
        : kind === 'sensor' ? SENSOR_POINTS : WATER_POINTS;
    const next = waveCursor[kind] + 1;
    if (next >= configuredTotals[kind].length) return false;
    waveCursor[kind] = next; spawned[kind] = true;
    // Gelombang penyergapan PEMBUKA lahir DORMANT dan di luar zona aman;
    // sisanya tetap langsung mengejar seperti sebelumnya.
    const opening = kind === 'forest' && next === 0;
    encounterDebug.push(...spawnStage10ForestWave(raw, next, points, kind,
        { active: !opening || ambushReleased, keepOut: safeStartZone() }));
    return true;
}

function deterministicRoutePoint(i, n) {
    const t = (i + .5) / Math.max(1, n);
    return {
        x: 360580 - t * 1120,
        z: -205 + t * 435 + (((i * 37) % 7) - 3) * 16,
    };
}

function placeSupplies() {
    const C = CFG.campaign.stage10.chapter2;
    for (let i = 0; i < Math.max(0, C.lootboxCount | 0); i++) {
        const p = deterministicRoutePoint(i, C.lootboxCount);
        if (stage10ForestWalk(p.x, p.z, 8)) spawnCrate(p.x, p.z, 0);
    }
    for (let i = 0; i < Math.max(0, C.barrelCount | 0); i++) {
        const p = deterministicRoutePoint(i * 3 + 1, C.barrelCount * 3);
        if (stage10ForestWalk(p.x, p.z, 8)) spawnBarrel(p.x, p.z, 0);
    }
    // Guaranteed control-gallery resupply before the final crossing.
    spawnAmmoDrop(S10_FOREST_GALLERY.x + 22, S10_FOREST_GALLERY.z - 10, 'rifle', 1e9);
    spawnAmmoDrop(S10_FOREST_GALLERY.x + 8, S10_FOREST_GALLERY.z - 10, 'pistol', 1e9);
    spawnMedkitDrop(S10_FOREST_GALLERY.x - 10, S10_FOREST_GALLERY.z - 10, 1e9);
}

function finishOpening(skipped = false) {
    if (skipped) resetStage10ForestDialogue();
    cine = null; cleanupCine(); phase = 'ambush';
    showStageMsg('SURVIVE THE WRECK AMBUSH', 4200);
}

function cleanupCine() {
    hideCutsceneSkip(); setCineFocus(null); setCineBars(false);
    setCineFade(0, CFG.campaign.stage10.chapter2.fadeSec); setCinematicActive(false);
}

function startOpening() {
    releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
    setCinematicActive(true); setCineBars(true); setCineFade(0, 0);
    cine = { t: 0, strike: false, dialogue: false };
    cineCam.x = 118; cineCam.y = 128; cineCam.z = 105;
    setCineFocus(S10_FOREST_WRECK.x, S10_FOREST_WRECK.z, true);
    showCutsceneSkip(() => finishOpening(true));
}

function updateOpening(dt) {
    if (!cine) return;
    const C = CFG.campaign.stage10.chapter2;
    cine.t += dt;
    if (!cine.dialogue) { cine.dialogue = true; queueStage10ForestDialogue('carrierHit'); }
    if (!cine.strike && cine.t >= C.carrierStrikeSec) {
        cine.strike = true; queueStage10ForestDialogue('stillMoving');
        setCineFocus(S10_FOREST_START.x, S10_FOREST_START.z, true);
    }
    if (cine.t >= C.openingMinSec && stage10ForestDialogueIdle()) finishOpening(false);
}

function updateProgression(dt) {
    // Mesin dan robot pembuka belum ada sebelum player maju 20 m. Gerak
    // menyamping atau mundur tidak dihitung oleh proyeksi `playerAdvance`.
    if (!ambushReleased) {
        if (playerAdvance() < safeStartRadius()) return;
        ambushReleased = true;
        spawnNextWave('forest');
        activateStage10ForestPrefix('forest-0');
        queueStage10ForestDialogue('ambushSprung');
        showStageMsg('CONTACT — FABRICATORS INBOUND', 4000);
    }
    if (phase === 'ambush' && stage10ForestPrefixAlive('forest-0') === 0) {
        phase = 'forestApproach'; queueStage10ForestDialogue('forestRoute');
        showStageMsg('FOLLOW THE FOREST SERVICE CORRIDOR', 4300);
        spawnNextWave('forest');
    }
    if (phase === 'forestApproach' && waveCursor.forest >= 1
        && stage10ForestPrefixAlive(`forest-${waveCursor.forest}`) === 0)
        activateStage10ForestPrefix('forest');
    if (phase === 'forestApproach' && camera.position.x <= S10_FOREST_SENSOR_ENTRY.x) {
        phase = 'scanBelt'; queueStage10ForestDialogue('scanDetected');
        showStageMsg('SCAN BELT — BREAK TRACKING UNDER ROOFED COVER', 4700);
        spawnNextWave('sensor');
    }
    if (phase === 'scanBelt' && waveCursor.sensor >= 0
        && stage10ForestPrefixAlive(`sensor-${waveCursor.sensor}`) === 0)
        spawnNextWave('sensor');
    if (consumeStage10ForestFirstLock()) queueStage10ForestDialogue('firstLock');
    if (phase === 'scanBelt' && camera.position.x <= S10_FOREST_SHELTER.x) {
        phase = 'waterworks'; queueStage10ForestDialogue('waterworksSighted');
        spawnNextWave('water');
    }
    if ((phase === 'waterworks' || phase === 'finalSweep') && waveCursor.water >= 0
        && stage10ForestPrefixAlive(`water-${waveCursor.water}`) === 0)
        spawnNextWave('water');
    if (phase === 'waterworks' && camera.position.x <= S10_FOREST_WATERWORKS.x - 80) {
        phase = 'finalSweep'; queueStage10ForestDialogue('rootTrace');
        showStageMsg('CONCENTRATED SWEEP — CROSS THE DAM CREST', 4500);
    }
    if (phase === 'finalSweep' && near(S10_FOREST_FINISH, CFG.campaign.stage10.chapter2.interactionRange)) {
        phase = 'tunnelEntry'; setStage10ForestTunnelOpen(true);
        queueStage10ForestDialogue('tunnelFound'); queueStage10ForestDialogue('stage11Lead');
        showStageMsg('UTILITY DESCENT OPEN — ENTER THE TUNNEL', 4200);
    }
    if (phase === 'tunnelEntry' && near(S10_FOREST_FINISH, CFG.campaign.stage10.chapter2.interactionRange)) {
        interactionT += dt;
        if (interactionT >= .75 && stage10ForestDialogueIdle()) finishStage();
    } else interactionT = 0;
}

function finishStage() {
    if (transitionCommitted) return;
    transitionCommitted = true; complete = true; phase = 'complete';
    clearStage10ForestStrikes(); resetStage10ForestDialogue(); cleanupCine();
    beginStageTransition(stage11Scene);
}

export const stage10ForestScene = {
    id: 'campaign-10-forest', lightsKey: STAGE10_FOREST_LIGHTS_KEY,
    enter() {
        const r = ensureStage10ForestWorld(scene); buildStage10ForestSensorGrid(r);
        setActiveCampaignWorldRoots(STAGE10_FOREST_LIGHTS_KEY);
        setActiveStageLights(STAGE10_FOREST_LIGHTS_KEY); applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x38443b, fogColor: 0x303b32, fogNear: 150, fogFar: 1200 });
        clearStage10ForestRobots(); resetCrates(); resetBarrels(); resetStage();
        placeSupplies();
        camera.position.set(S10_FOREST_START.x, CFG.player.eyeHeight, S10_FOREST_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        startOpening(); updateUI();
    },
    exit() {
        clearStage10ForestStrikes(); resetStage10ForestDialogue(); hideStageRadioDialogue();
        hideDownloadBar(); cleanupCine();
    },
    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) {
        elapsed += dt; updateStage10ForestDialogue(dt);
        updateStage10SpawnDeployment('campaign-10-forest', dt);
        updateStage10ForestWorldVisuals(dt);
        if (cine) updateOpening(dt);
        const sensorEnabled = !cine && phases.indexOf(phase) >= phases.indexOf('scanBelt')
            && phase !== 'tunnelEntry' && phase !== 'complete';
        updateStage10ForestSensorGrid(dt, sensorEnabled);
        if (!cine && !complete) updateProgression(dt);
        updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage10ForestWalk, pos, oldX, oldZ, player.radius);
        stage10ForestResolve(pos, player.radius, feetY);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage10ForestWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage10ForestGroundHeight,
    get camOffset() { return cine ? cineCam : PLAY_CAM; },
    bulletBlocked(b) {
        if (stage10SpawnDeploymentBulletHit('campaign-10-forest', b,
            (x, z) => stage10ForestSegBlocked(b.px, b.pz, x, z, true))) return true;
        return stage10ForestSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z, true);
    },
    blastBlocked(x0, z0, x1, z1) { return stage10ForestSegBlocked(x0, z0, x1, z1, false); },
    grenadeCollide(g, oldX, oldZ) {
        if (!stage10ForestWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ;
            g.vx *= -.4; g.vz *= -.4;
        }
        stage10ForestResolve(g.mesh.position, 2, 0);
    },
    robotAI(bot, dt, step) {
        if (bot.machineBirth) {
            bot.state = 'idle'; bot.moving = false; bot.aiming = false;
            return {};
        }
        return campaignRobotAI(bot, dt, step, {
            walkable: stage10ForestWalk, resolve: stage10ForestResolve, nav: stage10ForestNav(),
            los: (x0, z0, x1, z1) => !stage10ForestSegBlocked(x0, z0, x1, z1, true),
            // Robot penyergap pembuka TIDUR sampai zona aman ditinggalkan;
            // sesudah itu jarak aktivasi campaign yang biasa berlaku lagi.
            activate: (z, d) => ambushReleased && d < CFG.campaign.activateMeters * CAMP_M,
        });
    },
    clampRobot(bot, oldX, oldZ) {
        if (bot.machineBirth) return;
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage10ForestWalk, resolve: stage10ForestResolve });
    },
    clampDropPos(x, z) { return stage10ForestWalk(x, z, 2) ? [x, z] : [S10_FOREST_START.x, S10_FOREST_START.z]; },
    hudStatus() {
        const s = stage10ForestScanDebug();
        const scan = s.state === 'CLEAR' ? '' : ` | ${s.state} ${Math.round(s.exposureFraction * 100)}%`;
        return `THE GREEN FIREWALL — ${phase.toUpperCase()} | Robots: ${countStageRobots(10)}${scan}`;
    },
    radarLandmarks(plot) {
        const target = phase === 'forestApproach' ? S10_FOREST_SENSOR_ENTRY
            : phase === 'scanBelt' ? S10_FOREST_SHELTER
                : phase === 'waterworks' ? S10_FOREST_WATERWORKS : S10_FOREST_FINISH;
        plot(target.x - camera.position.x, target.z - camera.position.z, '#ffb03b', 5, true);
        const scan = stage10ForestScanDebug();
        if (scan.footprint?.visible)
            plot(scan.footprint.x - camera.position.x, -camera.position.z, '#b3402e', 4, true);
    },
};

export const stage10ForestWorldDebugFull = () => stage10ForestWorldDebug();
const forestDebug = () => ({
    phase, complete, elapsed, cine: cine && { ...cine }, transitionCommitted,
    objective: stage10ForestScene.hudStatus(), robots: countStageRobots(10),
    activeRobots: robots.reduce((n, r) => n + (r.stage === 10 && r.state !== 'idle' ? 1 : 0), 0),
    finishEligible: phase === 'tunnelEntry' && stage10ForestDialogueIdle(),
    spawned: { ...spawned }, encounters: encounterDebug.map(x => ({ ...x })),
    spawnDeployment: stage10SpawnDeploymentDebug('campaign-10-forest'),
    safeStart: { x: S10_FOREST_START.x, z: S10_FOREST_START.z,
        radius: safeStartRadius(), released: ambushReleased,
        advance: playerAdvance(), forward: { ...S10_FOREST_START_FORWARD },
        end: {
            x: S10_FOREST_START.x + S10_FOREST_START_FORWARD.x * safeStartRadius(),
            z: S10_FOREST_START.z + S10_FOREST_START_FORWARD.z * safeStartRadius(),
        } },
    waves: {
        cursor: { ...waveCursor }, configured: {
            forest: [...configuredTotals.forest], sensor: [...configuredTotals.sensor],
            water: [...configuredTotals.water],
        },
        spawnedTotal: encounterDebug.length,
        remainingConfigTotal: Object.keys(configuredTotals).reduce((sum, kind) =>
            sum + configuredTotals[kind].slice(waveCursor[kind] + 1)
                .reduce((n, v) => n + v, 0), 0),
    },
    dialogue: stage10ForestDialogueDebug(), scan: stage10ForestScanDebug(), world: stage10ForestWorldDebug(),
});

let chapter = null;
let handoff = null;             // Promise transisi Chapter 1 -> Chapter 2
const HANDOFF_MIN_MS = 900;     // sama dengan layar loading transisi stage

function activeChapter() { return chapter || stage10PortScene; }

// ===== TRANSISI CHAPTER 1 -> CHAPTER 2 (2026-08-26, laporan user:
// "terasa aneh akibat ada lag, delay, dan freeze") =====
// Pergantian bab dulu dijalankan SINKRON di tengah frame dari
// `finishExtraction`: satu frame harus membuang ~150 robot pelabuhan, menukar
// set lampu + preset kabut, membangun sensor grid, melahirkan gelombang hutan
// dan menaruh seluruh suplai — jadi gambar membeku beberapa ratus milidetik
// tanpa satu pun umpan balik ke player.
//
// Sekarang kerja itu dipecah di balik LAYAR LOADING yang sama dengan transisi
// antar-stage: `setPaused(true)` menghentikan `updateGame` (bukan sekadar
// melambatkannya), tiap `await loadingStep` memberi browser kesempatan MELUKIS
// di antara potongan kerja berat, lalu shader dikompilasi + beberapa frame
// nyata dirender selagi layar masih tertutup. Pointer TIDAK pernah dilepas
// (tak ada `exitPointerLock`), jadi tak ada `pointerlockchange` -> tak ada menu
// jeda dan tak perlu klik untuk melanjutkan: begitu loading ditutup, permainan
// langsung lanjut di Chapter 2.
async function runChapterHandoff() {
    const t0 = Date.now();
    setPaused(true);
    showLoading();
    await loadingStep(10, 'Leaving the iron port…');

    stage10PortScene.exit?.();
    clearStage10ForestRobots();     // seluruh robot Chapter 1 (stage 10) sekaligus
    clearArray(bullets, scene); clearArray(enemyBullets, scene);
    clearArray(grenades, scene); clearArray(explosions, scene); clearArray(drops, scene);
    resetRobotsFx();
    await loadingStep(40, 'Entering the green firewall…');

    chapter = stage10ForestScene;
    stage10ForestScene.enter();
    await loadingStep(68, 'Preparing the forest corridor…');

    if (renderer) renderer.compile(scene, viewCam);
    for (let i = 0; i < 3; i++) {   // frame render NYATA: unggah tekstur, link program
        if (composer && postFxOn) composer.render();
        else if (renderer) renderer.render(scene, viewCam);
        await loadingStep(76 + i * 7, 'Warming up…');
    }
    await loadingStep(100, 'Ready!');
    const rem = HANDOFF_MIN_MS - (Date.now() - t0);
    if (rem > 0) await new Promise(r => setTimeout(r, rem));
    hideLoading();
    setPaused(false);
}

function enterForestChapter() {
    if (chapter === stage10ForestScene) return handoff || Promise.resolve();
    if (handoff) return handoff;
    handoff = runChapterHandoff().then(() => { handoff = null; },
        (e) => { handoff = null; throw e; });
    return handoff;
}

export const enterStage10Chapter2 = enterForestChapter;
// Transisi bab bersifat async (layar loading). Pemanggil headless/uji menunggu
// lewat sini; null = tak ada transisi yang sedang berjalan.
export const stage10ChapterHandoff = () => handoff;

export const stage10Scene = {
    id: 'campaign-10',
    lightsKey: 'campaign-10-port',

    enter() {
        saveCampaignStage(10);
        ensureStage10World();
        setStage10CompletionHook(enterForestChapter);
        chapter = stage10PortScene;
        chapter.enter();
    },

    exit() {
        activeChapter().exit?.();
        setStage10CompletionHook(null);
        chapter = null; handoff = null;
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,
    updateMode(dt) { activeChapter().updateMode(dt); },
    playerCollide(pos, oldX, oldZ, feetY) {
        activeChapter().playerCollide(pos, oldX, oldZ, feetY);
    },
    groundHeight(x, z, feetY) { return activeChapter().groundHeight(x, z, feetY); },
    get camOffset() { return activeChapter().camOffset || null; },
    bulletBlocked(b) { return activeChapter().bulletBlocked(b); },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        return activeChapter().blastBlocked(x0, z0, x1, z1, y);
    },
    grenadeCollide(g, oldX, oldZ) { activeChapter().grenadeCollide(g, oldX, oldZ); },
    robotAI(bot, dt, step) { return activeChapter().robotAI(bot, dt, step); },
    clampRobot(bot, oldX, oldZ) { activeChapter().clampRobot(bot, oldX, oldZ); },
    clampDropPos(x, z) { return activeChapter().clampDropPos(x, z); },
    hudStatus() { return activeChapter().hudStatus(); },
    radarLandmarks(plot) { activeChapter().radarLandmarks(plot); },
    countStageRobots: () => countStageRobots(10),
};

export const stage10Debug = () => ({
    chapter: chapter === stage10ForestScene ? 2 : 1,
    chapterHandoff: !!handoff,
    sub: activeChapter().id,
    chapter1: stage10PortDebug(),
    chapter2: forestDebug(),
    ...(chapter === stage10ForestScene ? forestDebug() : stage10PortDebug()),
});
