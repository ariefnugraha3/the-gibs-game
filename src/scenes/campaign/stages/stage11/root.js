// Stage 11 Chapter B — root transmitter, monotonic upload and Warden battle.

import { CFG } from '../../../../core/config.js';
import { player, keys, robots, stats, setCinematicActive } from '../../../../core/state.js';
import {
    scene, camera, viewCam, CAM_LOOK_DROP, camFocusPos, addCamShake,
} from '../../../../core/renderer.js';
import {
    showStageMsg, hideDownloadBar,
    setBossHud, hideBossHud, setCineFade, setCineBars,
} from '../../../../core/dom.js';
import { updateUI } from '../../../../core/hud.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { explodeAt, spawnGroundPuff, spawnBloodBurst } from '../../../../entities/effects.js';
import { spawnGibs, spawnBloodDecal } from '../../../../entities/gore.js';
import { resetCrates, resolveCrateBlock } from '../../../../entities/crates.js';
import { resetBarrels, resolveBarrelBlock } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop, spawnLoot } from '../../../../entities/drops.js';
import {
    campaignRobotAI, campaignClampRobot, countStageRobots, spawnCampaignRobot,
} from '../../utility/common.js';
import { beginHackMinigame, isHackOpen } from '../../utility/hackMinigame.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { setActiveStageLights, applyLightPreset } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { slideWalk } from '../../../../utils/collision.js';
import { segPointDist2 } from '../../../../utils/math.js';
import { playSFX, sfxRobotSpawn } from '../../../../utils/sfx.js';
import { PAL } from '../../../../world/palette.js';
import {
    wreckSpawnMachine, spawnMachineHp,
} from '../../../../entities/spawnMachine.js';
import {
    resetNusantaraWarden, updateNusantaraWarden,
    cleanupNusantaraWarden, resolveNusantaraWardenBlock,
    nusantaraWardenBulletHit, nusantaraWardenIsJamming,
    nusantaraWardenWrecked, nusantaraWardenDebug,
} from '../../../../entities/nusantaraWarden.js';
import {
    STAGE11_ROOT_LIGHTS_KEY, S11_ROOT_START, S11_AUTHORITY_GATE,
    S11_ROOT_ENCOUNTER, S11_DOOR_STAND, S11_INSERT, S11_INSERT_STAND,
    S11_ARENA, S11_WARDEN_HOME, stage11RootWalk, stage11RootResolve,
    stage11RootSegBlocked, stage11RootGroundHeight, stage11RootNav,
    stage11RootMeterAt, stage11RootPointAtMeter, stage11RootMachines,
    setStage11AuthorityDoor, updateStage11AuthorityDoor,
    setStage11DoorHackMarker, setStage11InsertMarker,
    updateStage11RootMachines,
    updateStage11RootVisuals, updateStage11RootOccluders,
    resetStage11RootVisuals, stage11RootWorldDebug,
} from './rootWorld.js';
import {
    phase, complete, setStage11Phase, setStage11Complete,
    queueStage11Dialogue, stage11DialogueIdle,
    clearStage11Robots, invokeStage11Completion,
} from './runtime.js';
import { getStage11Warden } from './index.js';
import {
    STAGE11_CHAPTER_CAMERA, stage11ChapterScreenDirection,
} from './chapterCamera.js';
import {
    createStage11WardenReveal, S11_REVEAL_SHOTS,
} from '../../cutscenes/stage11/wardenReveal.js';

let elapsed = 0;
let encounterTriggered = false;
let spawnPlan = [];
let spawnCursor = 0;
let spawnClock = 0;
let births = [];
let spawnedByClass = { C: 0, B: 0, A: 0 };
let productionByClass = { C: 0, B: 0, A: 0 };
let producedTotal = 0;
let doorHacked = false;
let doorHackArmed = true;
let doorHackAttempts = 0;
let insertT = 0;
let uploadProgress = 0;
let previousUpload = 0;
let minObservedDelta = 0;
let uploadAccepted = false;
let wardenActivated = false;
let rewardDropped = false;
let endingQueued = false;
let completionInvoked = false;
let lastWardenPhase = 'dormant';
let jamFrames = 0;
let progressFrames = 0;

let revealPlaying = false;

function W() { return getStage11Warden(); }

// KEMUNCULAN WARDEN (2026-09-02, permintaan user). Menancapkan drive tidak lagi
// langsung membangunkan bos: cutscene empat shot inilah yang memperlihatkan
// upload berjalan, BERHENTI di `upload.preBossFraction`, lalu bos turun dari
// atas. Ia tetap bukan "bar pasif" yang ditunggu pemain — layar tidak pernah
// dikembalikan ke pemain selama siarannya merangkak; begitu kendali kembali,
// pertarungan sudah dimulai.
const wardenReveal = createStage11WardenReveal({
    getWarden: () => W(),
    setUpload: v => { uploadProgress = v; },
    onComplete: () => finishWardenReveal(),
});
function near(p, r) { return Math.hypot(camera.position.x - p.x, camera.position.z - p.z) <= r; }
function R() { return CFG.campaign.stage11.rootCorridor; }

// Fabricator activation follows the rendered Chapter-3 camera, not a distance
// or route-metre trigger. Half extents widen the NDC test so the first visible
// edge of the 30x20x30 machine counts, rather than waiting for its centre.
function rootFabricatorInView(machine) {
    const off = STAGE11_CHAPTER_CAMERA;
    let focus = camFocusPos();
    if (Math.hypot(focus.x - camera.position.x, focus.z - camera.position.z) > 400)
        focus = camera.position;
    const ex = focus.x + off.x, ey = focus.y + off.y, ez = focus.z + off.z;
    let fx = -off.x, fy = -off.y - CAM_LOOK_DROP, fz = -off.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const rh = Math.hypot(fx, fz) || 1;
    const rx = -fz / rh, rz = fx / rh;
    const ux = -fy * rz, uy = fx * rz - fz * rx, uz = fy * rx;
    const dx = machine.x - ex, dy = 13 - ey, dz = machine.z - ez;
    const depth = dx * fx + dy * fy + dz * fz;
    if (depth <= 1) return false;
    const tanY = Math.tan(((viewCam?.fov || 50) * Math.PI / 180) * .5);
    const tanX = tanY * (viewCam?.aspect || 1);
    const screenX = (dx * rx + dz * rz) / (depth * tanX);
    const screenY = (dx * ux + dy * uy + dz * uz) / (depth * tanY);
    const marginX = 18 / Math.max(1, depth * tanX);
    const marginY = 24 / Math.max(1, depth * tanY);
    return Math.abs(screenX) <= 1 + marginX && Math.abs(screenY) <= 1 + marginY;
}

const anyRootFabricatorInView = () =>
    stage11RootMachines().some(rootFabricatorInView);

export function resetRoot() {
    elapsed = 0; insertT = 0; uploadProgress = 0; previousUpload = 0;
    minObservedDelta = 0; uploadAccepted = false; wardenActivated = false;
    rewardDropped = false; endingQueued = false; completionInvoked = false;
    lastWardenPhase = 'dormant'; jamFrames = 0; progressFrames = 0;
    encounterTriggered = false; spawnPlan = []; spawnCursor = 0; spawnClock = 0;
    births = []; spawnedByClass = { C: 0, B: 0, A: 0 };
    productionByClass = { C: 0, B: 0, A: 0 }; producedTotal = 0;
    doorHacked = false; doorHackArmed = true; doorHackAttempts = 0;
    revealPlaying = false; wardenReveal.reset();
    resetStage11RootVisuals(); hideBossHud(); hideDownloadBar();
    resetNusantaraWarden(W(), { active: false, x: S11_WARDEN_HOME.x,
        z: S11_WARDEN_HOME.z, home: S11_WARDEN_HOME, arena: S11_ARENA });
}

function placeRootSupplies() {
    // Supplies sit in the clear corridor after the metre-50 ambush, keeping
    // the circular hall and its central computer visually uncluttered.
    const p = stage11RootPointAtMeter(82);
    for (const [z, weapon] of [[-66, 'rifle'], [-32, 'pistol'], [32, 'shotgun'], [66, 'launcher']])
        spawnAmmoDrop(p.x, z, weapon, 1e9);
    spawnMedkitDrop(p.x + 28, 0, 1e9);
}

function buildCorridorSpawnPlan() {
    const wanted = { C: Math.max(0, R().robots.C | 0),
        B: Math.max(0, R().robots.B | 0), A: Math.max(0, R().robots.A | 0) };
    const used = { C: 0, B: 0, A: 0 }, out = [];
    const total = wanted.C + wanted.B + wanted.A;
    // Weighted round-robin keeps all three classes mixed while preserving the
    // exact authored 12/8/4 census.
    for (let i = 0; i < total; i++) {
        let best = null, ratio = Infinity;
        for (const cls of ['C', 'B', 'A']) {
            if (used[cls] >= wanted[cls]) continue;
            const q = used[cls] / Math.max(1, wanted[cls]);
            if (q < ratio) { ratio = q; best = cls; }
        }
        used[best]++; out.push(best);
    }
    return out;
}

function corridorBirthTarget(machine, slot) {
    const lane = (slot % 4) - 1.5;
    const row = Math.floor(slot / 4) % 2;
    return { x: machine.x - 24 - row * 10,
        z: machine.z * .42 + lane * 12 };
}

function productionHash(seed) {
    let n = Math.imul((seed + 23) ^ 0x9e3779b1, 0x85ebca6b);
    n ^= n >>> 16; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}

function productionClass(seed) {
    const mix = R().production.classMix;
    const c = Math.max(0, mix.C || 0), b = Math.max(0, mix.B || 0);
    const a = Math.max(0, mix.A || 0), total = c + b + a;
    if (!(total > 0)) return 'C';
    const roll = productionHash(seed) * total;
    return roll < c ? 'C' : (roll < c + b ? 'B' : 'A');
}

function producedAlive() {
    let n = 0;
    for (const bot of robots)
        if (bot.stage === 11 && bot.encounter === 'root-corridor-50'
            && bot.rootCorridorProduced) n++;
    return n;
}

function spawnCorridorRobot(cls, index, produced = false, forcedMachine = null) {
    const live = stage11RootMachines().filter(m => m.alive && m.active);
    const machine = forcedMachine || live[index % Math.max(1, live.length)];
    if (!machine) return false;
    const start = machine.hatch, slot = machine.spawned++;
    const target = corridorBirthTarget(machine, slot);
    spawnCampaignRobot(start.x, start.z, 11, cls, true);
    const bot = robots[robots.length - 1], base = bot.scl || 1;
    bot.encounter = 'root-corridor-50'; bot.rootCorridorBorn = true;
    bot.rootCorridorProduced = !!produced;
    bot.machineBirth = true; bot.state = 'idle'; bot.moving = false; bot.aiming = false;
    bot.mesh.scale.set(base * .06, base * .025, base * .06);
    bot.mesh.rotation.y = machine.yaw;
    births.push({ bot, t: 0, base, start: { ...start }, target,
        sec: produced ? R().production.birthSec : R().birthSec });
    if (produced) { productionByClass[cls]++; producedTotal++; }
    else spawnedByClass[cls]++;
    spawnGroundPuff(start.x, start.z, 0x48bfc2, 7, .8);
    playSFX(sfxRobotSpawn, .42);
    return true;
}

function updateCorridorBirths(dt) {
    for (let i = births.length - 1; i >= 0; i--) {
        const b = births[i];
        if (robots.indexOf(b.bot) < 0 || b.bot.hp <= 0) {
            births.splice(i, 1); continue;
        }
        b.t += dt;
        const sec = Math.max(.1, b.sec);
        const k = Math.min(1, b.t / sec), growK = Math.min(1, k / .62);
        const grow = growK * growK * (3 - 2 * growK);
        const travelK = Math.max(0, Math.min(1, (k - .2) / .8));
        const travel = 1 - (1 - travelK) ** 2;
        b.bot.mesh.position.x = b.start.x + (b.target.x - b.start.x) * travel;
        b.bot.mesh.position.z = b.start.z + (b.target.z - b.start.z) * travel;
        b.bot.mesh.position.y = Math.sin(travel * Math.PI) * 4.5;
        b.bot.mesh.scale.set(b.base * (.06 + grow * .94),
            b.base * (.025 + grow * .975), b.base * (.06 + grow * .94));
        if (k < 1) continue;
        b.bot.mesh.position.set(b.target.x, 0, b.target.z);
        b.bot.mesh.scale.setScalar(b.base); b.bot.machineBirth = false;
        b.bot.state = 'chasing'; b.bot.moving = false; b.bot.aiming = false;
        births.splice(i, 1);
    }
}

function triggerCorridorEncounter() {
    if (encounterTriggered) return;
    encounterTriggered = true; spawnPlan = buildCorridorSpawnPlan();
    spawnCursor = 0; spawnClock = Math.max(0, R().firstBirthSec);
    const firstBatch = Math.max(0, R().production.firstBatchSec);
    for (const m of stage11RootMachines()) {
        m.alive = true; m.active = true; m.hp = spawnMachineHp(); m.hitT = 0;
        m.clock = 0; m.nextBatch = firstBatch; m.pending = 0;
        m.birthCooldown = 0; m.batches = 0; m.spawned = 0;
    }
    setStage11Phase('corridorBattle');
    showStageMsg('FABRICATORS IN SIGHT — DESTROY BOTH | CONTINUOUS PRODUCTION ONLINE', 4700);
}

function destroyRootMachine(m) {
    if (!m.alive) return;
    m.alive = false; m.active = false; m.hp = 0; m.pending = 0; m.hitT = 0;
    wreckSpawnMachine(m.rig);
    explodeAt(new THREE.Vector3(m.x, 16, m.z), 30, 1);
    spawnGibs(m.x, 20, m.z, 14, -1, 0, 2.5, PAL.gunmetal, .4, PAL.ink);
    spawnBloodDecal(m.x, m.z, 7, PAL.ink); addCamShake(8);
    const left = stage11RootMachines().filter(q => q.alive).length;
    showStageMsg(left > 0 ? `FABRICATOR DOWN — ${left} STILL RUNNING`
        : 'BOTH FABRICATORS DESTROYED — ROOT HALL TERMINAL UNLOCKED', 3400);
}

function rootMachineBulletHit(b) {
    if (!encounterTriggered) return false;
    const r2 = R().hitRadius ** 2;
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    for (const m of stage11RootMachines()) {
        if (!m.alive) continue;
        if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, m.x, 0, m.z) >= r2) continue;
        m.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage)
            * (b.explosive ? 1 : (player.dmgMul || 1));
        if (!b.explosive) {
            stats.hits++;
            spawnBloodBurst(bx, 12, bz, b.dir?.x || -1,
                b.dir?.z || 0, 3, .6, 1.4, PAL.amber);
        }
        m.hitT = 1;
        if (m.hp <= 0) destroyRootMachine(m);
        return true;
    }
    return false;
}

function updateRootMachineProduction(dt) {
    const P = R().production;
    const batchCount = Math.max(1, P.batchCount | 0);
    const batchSec = Math.max(.1, P.batchSec);
    const birthGap = Math.max(.01, P.birthGapSec);
    const maxAlive = Math.max(1, P.maxAlive | 0);
    for (const m of stage11RootMachines()) {
        if (!m.alive || !m.active) continue;
        m.clock += dt; m.birthCooldown -= dt;
        while (m.clock >= m.nextBatch) {
            m.pending += batchCount; m.batches++; m.nextBatch += batchSec;
        }
        while (m.pending > 0 && m.birthCooldown <= 0) {
            if (producedAlive() >= maxAlive) { m.pending = 0; break; }
            const cls = productionClass(m.index * 100003 + producedTotal);
            if (!spawnCorridorRobot(cls, producedTotal, true, m)) break;
            m.pending--; m.birthCooldown += birthGap;
        }
    }
}

function beginDoorHack() {
    if (doorHacked || isHackOpen()) return;
    doorHackArmed = false; doorHackAttempts++;
    setStage11Phase('doorHacking'); queueStage11Dialogue('authorityDenied');
    beginHackMinigame({
        head: 'ROOT HALL — AUTHORITY DOOR',
        sub: 'Rotate the security chips to bridge the ingress line and release '
            + 'the two monumental door leaves.',
        onSuccess: () => {
            doorHacked = true; setStage11AuthorityDoor(true);
            setStage11DoorHackMarker(false); setStage11InsertMarker(true);
            setStage11Phase('insertDrive');
            showStageMsg('ACCESS GRANTED — ROOT HALL OPEN | REACH THE CENTRAL COMPUTER', 4800);
        },
        onFail: () => {
            setStage11Phase('doorLocked');
            showStageMsg('BREACH FAILED — STEP AWAY FROM THE TERMINAL AND RETRY', 3800);
        },
    });
}

function updateRootApproach(dt) {
    const C = R();
    if (!encounterTriggered && anyRootFabricatorInView()) triggerCorridorEncounter();
    if (encounterTriggered && spawnCursor < spawnPlan.length
        && stage11RootMachines().some(m => m.alive)) {
        spawnClock -= dt;
        const gap = Math.max(.03, C.birthGapSec);
        while (spawnCursor < spawnPlan.length && spawnClock <= 0) {
            if (!spawnCorridorRobot(spawnPlan[spawnCursor], spawnCursor)) break;
            spawnCursor++; spawnClock += gap;
        }
    }
    if (encounterTriggered) updateRootMachineProduction(dt);
    updateCorridorBirths(dt);
    updateStage11RootMachines(dt);
    updateStage11AuthorityDoor(dt);

    if (doorHacked) return;
    const close = near(S11_DOOR_STAND, C.hackRange);
    if (!close) doorHackArmed = true;
    else if (doorHackArmed && !isHackOpen()) {
        const alive = stage11RootMachines().filter(m => m.alive).length;
        if (alive > 0) {
            doorHackArmed = false;
            showStageMsg(`DESTROY ${alive > 1 ? 'BOTH FABRICATORS' : 'THE LAST FABRICATOR'} BEFORE BREACHING THE HALL`, 3200);
        } else beginDoorHack();
    }
}

function wardenCallbacks() {
    return {
        onPhase(next) {
            lastWardenPhase = next;
            if (next === 'phase1' && phase === 'wardenIntro') setStage11Phase('wardenBattle');
            if (next === 'jam1') {
                queueStage11Dialogue('jamOne');
                showStageMsg('UPLOAD JAMMED — DESTROY THREE ANCHORED CAPACITORS', 4800);
            } else if (next === 'jam2') {
                queueStage11Dialogue('jamTwo');
                showStageMsg('WARDEN SEIZING ROOT — DESTROY THE COUPLINGS', 4800);
            }
        },
        onDeath() {
            setStage11Phase('wardenBattle');
            queueStage11Dialogue('wardenDown');
        },
    };
}

function beginUpload() {
    if (uploadAccepted) return;
    uploadAccepted = true; setStage11Phase('upload'); setStage11InsertMarker(false);
    // NO centre-screen download popup (2026-09-02, user request "hilangkan popup
    // loading warna biru yang di tengah layar itu"). The broadcast percentage is
    // DRAWN on the root computer's own display (rootDisplay.js) and carried by
    // the boss HUD's UPLOAD bar during the duel — a floating HUD popup in front
    // of the machine that is doing the work was saying it twice.
    hideDownloadBar();
    // The reveal cutscene owns the progress and the boss entrance; it queues the
    // insert/accepted/stalled/wake lines itself, in shot order.
    // Phase callbacks are installed BEFORE the cutscene so the boss's own
    // reveal/arm/phase1 transitions are tracked while it is being watched.
    W().callbacks = wardenCallbacks();
    revealPlaying = true; setStage11Phase('wardenReveal');
    wardenReveal.start();
}

// Called by the cutscene on its last frame (or on SKIP). The Warden is already
// standing on the arena floor by then, so all that is left is to hand it the
// scene's own phase/jam callbacks and open the fight.
function finishWardenReveal() {
    revealPlaying = false;
    const w = W();
    w.callbacks = wardenCallbacks(); wardenActivated = true;
    setStage11Phase('wardenBattle');
    setBossHud({ name: 'NUSANTARA WARDEN', hp: w.hp, maxHp: w.maxHp,
        secondaryLabel: 'UPLOAD', secondaryFraction: uploadProgress,
        state: 'ENGAGED' });
    showStageMsg('BROADCAST HELD AT '
        + Math.round(CFG.campaign.stage11.upload.preBossFraction * 100)
        + '% — DESTROY THE NUSANTARA WARDEN', 4800);
}

function updateUpload(dt) {
    if (!uploadAccepted || completionInvoked) return;
    // While the reveal is playing the cutscene is the only writer of progress.
    if (revealPlaying) return;
    const w = W(), U = CFG.campaign.stage11.upload;
    const jammed = nusantaraWardenIsJamming(w);
    previousUpload = uploadProgress;
    if (nusantaraWardenWrecked(w)) {
        uploadProgress = Math.min(1, uploadProgress + U.finalRatePerSec * dt);
        progressFrames++;
    } else if (!jammed) {
        uploadProgress = Math.min(U.preBossFraction,
            uploadProgress + U.ratePerSec * dt);
        progressFrames++;
    } else jamFrames++;
    const delta = uploadProgress - previousUpload;
    minObservedDelta = Math.min(minObservedDelta, delta);
    if (wardenActivated && !nusantaraWardenWrecked(w)) {
        const wd = nusantaraWardenDebug(w);
        const targetState = wd.phase === 'jam1' ? 'JAMMED — CAPACITORS'
            : wd.phase === 'jam2' ? 'JAMMED — COUPLINGS'
                : wd.phase === 'death' ? 'COLLAPSING' : wd.phase.toUpperCase();
        setBossHud({ name: 'NUSANTARA WARDEN', hp: w.hp, maxHp: w.maxHp,
            secondaryLabel: jammed ? 'UPLOAD — JAMMED' : 'UPLOAD',
            secondaryFraction: uploadProgress, state: targetState });
    }
    if (nusantaraWardenWrecked(w) && !rewardDropped) {
        rewardDropped = true; spawnLoot(w.parts.group.position.x,
            w.parts.group.position.z, w.score, 8);
        hideBossHud(); setStage11Phase('broadcast');
    }
    if (uploadProgress >= 1 && !endingQueued) {
        endingQueued = true; setStage11Phase('anomaly');
        queueStage11Dialogue('networkSilent'); queueStage11Dialogue('anomaly');
        queueStage11Dialogue('mahapatihReveal'); queueStage11Dialogue('jakartaCoordinate');
        queueStage11Dialogue('returnVow');
        showStageMsg('NATIONAL NETWORK DECOMMISSIONED', 4800);
    }
    if (endingQueued && stage11DialogueIdle() && !completionInvoked) {
        completionInvoked = true; setStage11Complete(true); setStage11Phase('complete');
        clearStage11Robots(); cleanupNusantaraWarden(w, false); hideBossHud(); hideDownloadBar();
        invokeStage11Completion({ stage: 11, uploadProgress, warden: nusantaraWardenDebug(w) });
    }
}

function updateComputerInteraction(dt) {
    if (phase === 'insertDrive') {
        if (near(S11_INSERT_STAND, CFG.campaign.stage11.interactionRange)) {
            insertT += dt;
            if (insertT >= .9) beginUpload();
        } else insertT = 0;
    }
}

export const rootScene = {
    id: 'campaign-11-root',
    // Match Chapter 2: camera sits southeast/lower-right and looks northwest,
    // placing the console and Warden toward the upper-left of the screen. The
    // reveal cutscene borrows the angle shot by shot and gives it back EXACTLY
    // — the same frozen object, so a stage-wide camera test still identifies it.
    get camOffset() { return wardenReveal.camOffset() || STAGE11_CHAPTER_CAMERA; },
    // Absolute look height, used only by the cutscene (see core/renderer.js).
    get camLookY() { return wardenReveal.camLookY(); },
    enter() {
        setActiveCampaignWorldRoots(STAGE11_ROOT_LIGHTS_KEY);
        setActiveStageLights(STAGE11_ROOT_LIGHTS_KEY);
        applyLightPreset(scene, 'indoor');
        enterCityEnv({ background: 0x171814, fogColor: 0x24231f,
            fogNear: 80, fogFar: 900 });
        clearStage11Robots(); resetCrates(); resetBarrels(); resetRoot(); placeRootSupplies();
        setStage11Phase('rootCorridor');
        camera.position.set(S11_ROOT_START.x, CFG.player.eyeHeight, S11_ROOT_START.z);
        camera.quaternion.set(0, 0.7071, 0, 0.7071);
        player.vy = 0; player.onGround = true;
        releaseInputs(); clearMoveTarget(); keys.w = keys.a = keys.s = keys.d = false;
        setCinematicActive(false); setCineBars(false);
        setCineFade(0, CFG.campaign.stage11.fadeSec);
        showStageMsg('ROOT HALL 100 M — ADVANCE TO THE SEALED DOOR', 4300);
    },
    exit() {
        wardenReveal.reset(); revealPlaying = false;
        cleanupNusantaraWarden(W(), false); hideBossHud(); hideDownloadBar();
        births.length = 0; setStage11DoorHackMarker(false); setStage11InsertMarker(false);
    },
    updateMode(dt) {
        elapsed += dt; updateRootApproach(dt); updateComputerInteraction(dt);
        updateStage11RootOccluders(dt);
        const w = W();
        updateNusantaraWarden(w, dt, { arena: S11_ARENA,
            allowAttack: phase === 'wardenBattle' });
        // AFTER the boss update: the reveal reacts to the landing on the SAME
        // frame the feet touch the floor, not one frame later.
        wardenReveal.update(dt);
        updateUpload(dt);
        // Runs before AND after upload: the floor destination must pulse while
        // the player is still looking for the central-computer interaction.
        // The reveal's frozen bar drives the drawn gauge's own stall state.
        updateStage11RootVisuals(dt, uploadProgress,
            uploadAccepted && nusantaraWardenIsJamming(w),
            wardenReveal.isStalled());
        updateUI();
    },
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage11RootWalk, pos, oldX, oldZ, player.radius);
        stage11RootResolve(pos, player.radius, feetY);
        resolveNusantaraWardenBlock(W(), pos, player.radius);
        resolveCrateBlock(pos, player.radius); resolveBarrelBlock(pos, player.radius);
        slideWalk(stage11RootWalk, pos, oldX, oldZ, player.radius);
    },
    groundHeight: stage11RootGroundHeight,
    bulletBlocked(b) {
        // Fabricator and boss swept hit tests must run before chamber blockers
        // or their own solid footprints would swallow valid damaging rounds.
        if (rootMachineBulletHit(b)) return true;
        if (nusantaraWardenBulletHit(W(), b)) return true;
        return stage11RootSegBlocked(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },
    blastBlocked: stage11RootSegBlocked,
    grenadeCollide(g, oldX, oldZ) {
        if (!stage11RootWalk(g.mesh.position.x, g.mesh.position.z, 2)) {
            g.mesh.position.x = oldX; g.mesh.position.z = oldZ; g.vx *= -.4; g.vz *= -.4;
        }
        stage11RootResolve(g.mesh.position, 2, 0);
        resolveNusantaraWardenBlock(W(), g.mesh.position, 2);
    },
    robotAI(bot, dt, step) {
        // Surviving corridor robots are FROZEN for the whole reveal: the player
        // is locked in place for four shots and cannot answer them (the Stage 9
        // dialogue-lock rule). They resume the instant control returns.
        if (bot.machineBirth || revealPlaying) {
            bot.state = 'idle'; bot.moving = false; bot.aiming = false; return {};
        }
        return campaignRobotAI(bot, dt, step, {
            walkable: stage11RootWalk, resolve: stage11RootResolve,
            nav: stage11RootNav(),
            los: (x0, z0, x1, z1) => !stage11RootSegBlocked(x0, z0, x1, z1),
        });
    },
    clampRobot(bot, oldX, oldZ) {
        campaignClampRobot(bot, oldX, oldZ,
            { walkable: stage11RootWalk, resolve: stage11RootResolve });
    },
    clampDropPos(x, z) { return stage11RootWalk(x, z, 2) ? [x, z] : [S11_ROOT_START.x, 0]; },
    hudStatus() {
        if (phase === 'rootCorridor') return 'ROOT HALL DOOR — 100 M';
        if (phase === 'corridorBattle') {
            const machines = stage11RootMachines().filter(m => m.alive).length;
            return `DESTROY FABRICATORS ${machines}/${R().machines} | Robots: ${countStageRobots(11)}`;
        }
        if (phase === 'doorHacking') return 'BREACHING ROOT HALL AUTHORITY';
        if (phase === 'doorLocked') return 'HACK THE LARGE ROOT HALL DOOR';
        if (phase === 'insertDrive') return 'INSERT THE KILL-SWITCH DRIVE';
        if (phase === 'wardenReveal') return 'BROADCASTING — ROOT CHAMBER RESPONDING';
        if (phase === 'wardenBattle' || phase === 'wardenIntro') {
            const wd = nusantaraWardenDebug(W());
            if (wd.phase === 'jam1') return 'UPLOAD JAMMED — DESTROY THREE CAPACITORS';
            if (wd.phase === 'jam2') return 'WARDEN SEIZING ROOT — DESTROY THE COUPLINGS';
            return `DESTROY THE NUSANTARA WARDEN | UPLOAD ${Math.round(uploadProgress * 100)}%`;
        }
        if (phase === 'broadcast') return `NATIONAL BROADCAST — ${Math.round(uploadProgress * 100)}%`;
        if (phase === 'anomaly') return 'BROADCAST COMPLETE — SOVEREIGN ANOMALY DETECTED';
        if (phase === 'complete') return 'STAGE 11 COMPLETE — JAKARTA COORDINATE LOCKED';
        return `KILL-SWITCH UPLOAD — ${Math.round(uploadProgress * 100)}%`;
    },
    radarLandmarks(plot) {
        const liveMachines = stage11RootMachines().filter(m => m.alive);
        const marks = !doorHacked ? (liveMachines.length ? liveMachines
            : [S11_DOOR_STAND])
            : phase === 'insertDrive' ? [S11_INSERT_STAND] : [];
        const wd = nusantaraWardenDebug(W());
        if (wd.active && !wd.deathDone && wd.position) marks.push(wd.position);
        for (const p of marks)
            plot(p.x - camera.position.x, p.z - camera.position.z, '#ffb03b', 5, true);
    },
};

export const rootDebug = () => ({
    elapsed, uploadProgress, previousUpload, minObservedDelta,
    camera: { offset: { ...rootScene.camOffset }, corner: 'lower-right',
        progress: stage11ChapterScreenDirection(S11_ROOT_START, S11_WARDEN_HOME) },
    uploadAccepted, monotonic: minObservedDelta >= -1e-9,
    clampWhileAlive: CFG.campaign.stage11.upload.preBossFraction,
    jammed: nusantaraWardenIsJamming(W()), jamFrames, progressFrames,
    wardenActivated, rewardDropped, endingQueued, completionInvoked,
    corridor: { meter: stage11RootMeterAt(camera.position.x), encounterTriggered,
        configuredMeter: R().encounterMeter, machines: R().machines,
        machineInView: anyRootFabricatorInView(), activation: 'viewport',
        planned: spawnPlan.length, spawned: spawnCursor, activeBirths: births.length,
        configuredRobots: { ...R().robots }, spawnedByClass: { ...spawnedByClass },
        machineHp: spawnMachineHp(), machinesAlive: stage11RootMachines().filter(m => m.alive).length,
        producedTotal, producedAlive: producedAlive(), productionByClass: { ...productionByClass },
        production: { ...R().production, classMix: { ...R().production.classMix } },
        alive: robots.filter(z => z.stage === 11
            && z.encounter === 'root-corridor-50').length },
    door: { hacked: doorHacked, armed: doorHackArmed, attempts: doorHackAttempts,
        hacking: isHackOpen(), stand: { ...S11_DOOR_STAND } },
    lastWardenPhase,
    reveal: { ...wardenReveal.debug(), playing: revealPlaying,
        shotNames: [...S11_REVEAL_SHOTS] },
    warden: nusantaraWardenDebug(W()), world: stage11RootWorldDebug(),
});
