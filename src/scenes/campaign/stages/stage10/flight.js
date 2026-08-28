// Stage 10 — top-down air battle, dibentuk mengikuti referensi user
// (Air Strike 1944): pesawat player mengunci di bagian bawah layar dan menembak
// OTOMATIS lurus ke depan; musuh datang sebagai FORMASI dari atas; instalasi
// darat ikut menggulung naik; power-up bintang menaikkan pola tembakan; BOM
// membersihkan layar; dan misi delapan menit ditutup satu bomber boss.

import { CFG } from '../../../../core/config.js';
import {
    player, keys, stats, addScore, godMode, setCinematicActive,
} from '../../../../core/state.js';
import { scene, camera, viewCam } from '../../../../core/renderer.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { updateUI } from '../../../../core/hud.js';
import { gameOver } from '../../../../core/game.js';
import { setAimCursorOverride } from '../../../../core/input.js';
import { showStageMsg, hideStageRadioDialogue } from '../../../../core/dom.js';
import { applyLightPreset, setActiveStageLights } from '../../../../world/lighting.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { setActiveCampaignWorldRoots } from '../../utility/campaignWorldRegistry.js';
import { campaignJumpToStage, beginStageTransition } from '../../utility/transition.js';
import { avatarGroup } from '../../../../entities/playerAvatar.js';
import { stage1Scene } from '../stage1/index.js';
import { stage11Scene } from '../stage11/index.js';
import {
    playSFX, sfxShoot, sfxRobotShot, sfxRocketShot, sfxRocketExplode,
    sfxExplode, sfxPickup, sfxHeal, sfxHit,
} from '../../../../utils/sfx.js';
import {
    STAGE10_FLIGHT_KEY, S10_FLIGHT_X, S10_FLIGHT_START_Z,
    S10_FLIGHT_BOUNDS,
    ensureStage10FlightWorld, stage10FlightWorld, stage10FlightWorldDebug,
} from './flightWorld.js';

const CAM_OFFSET = Object.freeze({ x: 0, y: 900, z: 0 });
const CAMERA_UP = Object.freeze({ x: 0, y: 0, z: -1 });
const TILE_LENGTH = 340;
const PLAYER_EXPLOSION_SEC = 2.7;
// Level 2 adalah patokan turunan senjata: empat peluru = satu volley Assault
// Rifle level 3. Semua level lain memakai kerapatan peluru yang sama per butir.
const BASE_WEAPON_LEVEL = 2;
const BASE_VOLLEY_ROUNDS = 4;

// FORMASI (bentuk, bukan angka tuning) — offset relatif terhadap titik pimpinan
// dalam satuan "slot". Runtime mengalikannya dengan jarak sayap pesawat musuh.
const FORMATIONS = {
    vee: n => Array.from({ length: n }, (_, i) => {
        const k = Math.ceil(i / 2) * (i % 2 ? -1 : 1);
        return { dx: k * 1.15, dz: -Math.abs(k) * 0.95 };
    }),
    echelon: n => Array.from({ length: n }, (_, i) => ({ dx: i * 1.1, dz: -i * 0.85 })),
    line: n => Array.from({ length: n }, (_, i) => ({ dx: (i - (n - 1) / 2) * 1.35, dz: 0 })),
    column: n => Array.from({ length: n }, (_, i) => ({ dx: 0, dz: -i * 1.5 })),
    arrow: n => Array.from({ length: n }, (_, i) => {
        const k = Math.ceil(i / 2) * (i % 2 ? -1 : 1);
        return { dx: k * 0.85, dz: -Math.abs(k) * 1.6 };
    }),
};
const FORMATION_NAMES = Object.keys(FORMATIONS);

let elapsed = 0;
let scrollZ = S10_FLIGHT_START_Z;
let phase = 'combat';
let biome = 'java';
let clearT = 0;
let victoryArmed = false;
let transitionCommitted = false;
let playerDestroyedT = 0;
let playerExplosionPulse = 0;
let flightHp = 1000;
let savedPlayer = null;
let rngState = 0x5a10f17;
let mgMouse = false, mgKey = false, bombMouse = false, bombKey = false;
let mgCooldown = 0, bombCooldown = 0, cannonSide = 0, volleyIndex = 0;
let moveVX = 0, moveVZ = 0;
let playerHitT = 0;
let lastBiomeMessage = '';
let weaponLevel = 1;
let bombs = 0;
let wingmanCount = 0;
let waveT = 0, waveNumber = 0, lastFormation = '';
let enemyFireGap = 0, peakEnemyRounds = 0, peakMissiles = 0;
let groundT = 0;
let nextWaveEntrySide = -1;
let biomeTransition = {
    from: 'java', to: 'java', t: 0, active: false,
    weights: { java: 1, ocean: 0, kalimantan: 0 },
};
const boss = {
    active: false, hp: 0, maxHp: 0, x: 0, zOffset: 0, t: 0, entryT: 0,
    gunCd: 0, missileCd: 0, missileLeft: 0, dir: 1, hitFlash: 0,
    dying: false, deathT: 0, enraged: false,
};

const counters = {
    spawned: { airC: 0, airB: 0, airA: 0, shipB: 0, shipA: 0 },
    ground: { turret: 0, tank: 0, bunker: 0, depot: 0 },
    destroyed: { aircraft: 0, ships: 0, ground: 0, boss: 0 },
    waves: 0, formations: {},
    playerVolleys: 0, cannonShots: 0, wingmanShots: 0,
    enemyRounds: 0, missiles: 0, bombsUsed: 0,
    machineGunHits: 0, cannonHits: 0, bombKills: 0,
    moneyDrops: 0, healthDrops: 0, powerDrops: 0, bombDrops: 0, wingDrops: 0,
    pickups: 0, powerUps: 0, rams: 0, missilesShotDown: 0, fireBlocked: 0,
    explosions: { player: 0, aircraft: 0, ships: 0, ground: 0, cannon: 0, boss: 0 },
};

function C() { return CFG.campaign.stage10.flight; }
function EC(type) { return C().enemies[type]; }
function FIRE() { return C().enemyFire; }
function level3Damage(weapon) {
    return CFG.weapons[weapon].damage
        * (1 + CFG.weapons.upgradeDamagePct * (CFG.weapons.maxWeaponLevel - 1));
}
function machineDelay() { return CFG.weapons.rifle.fireDelayMs / 1000; }
function cannonRadius() { return CFG.grenade.killRadius + 3.5; }
function weaponLevels() { return C().weaponLevels; }
function maxWeaponLevel() { return weaponLevels().length; }
function levelDef(level = weaponLevel) {
    const list = weaponLevels();
    return list[clamp(level, 1, list.length) - 1];
}
// Damage per BUTIR diturunkan dari volley patokan (level 2 = Assault Rifle L3),
// jadi menaikkan power benar-benar menaikkan DPS, bukan membagi ulang angka.
function roundDamage(level = weaponLevel) {
    return level3Damage('rifle') / BASE_VOLLEY_ROUNDS * levelDef(level).damageMul;
}
function volleyRounds(level = weaponLevel) {
    const def = levelDef(level);
    return def.forwardPairs * 2 + def.angledPairs * 2;
}
function volleyDamage(level = weaponLevel) { return roundDamage(level) * volleyRounds(level); }
function playerScreenHalfDepth() {
    const halfFov = ((viewCam?.fov || 50) * Math.PI / 180) * 0.5;
    const eyeToRound = Math.max(1, CAM_OFFSET.y - C().altitude);
    return eyeToRound * Math.tan(halfFov);
}
function playerScreenHalfWidth() {
    return playerScreenHalfDepth() * (viewCam?.aspect || 1);
}
function playerScreenTopZ() {
    return scrollZ - playerScreenHalfDepth();
}
function horizontalFlightBounds() {
    const W = stage10FlightWorld();
    const worldHalf = (S10_FLIGHT_BOUNDS.x1 - S10_FLIGHT_BOUNDS.x0) * 0.5;
    const visibleHalf = Math.min(worldHalf, playerScreenHalfWidth());
    const halfSpan = W.playerAircraft.userData.transport.flightVisual.halfSpan;
    const inset = halfSpan + C().screenEdgePadding;
    return {
        x0: S10_FLIGHT_X - visibleHalf + inset,
        x1: S10_FLIGHT_X + visibleHalf - inset,
        visibleHalf, inset, halfSpan,
    };
}
function aircraftFlightFrame() {
    const W = stage10FlightWorld();
    const worldHalf = (S10_FLIGHT_BOUNDS.x1 - S10_FLIGHT_BOUNDS.x0) * 0.5;
    const halfWidth = Math.min(worldHalf, playerScreenHalfWidth());
    const halfDepth = playerScreenHalfDepth();
    const enemyHalf = W.playerAircraft.userData.transport.flightVisual.enemyAircraftSpan * 0.5;
    return {
        cx: S10_FLIGHT_X,
        cz: scrollZ - 22,
        laneHalfWidth: Math.max(70, halfWidth - enemyHalf - 34),
        laneHalfDepth: Math.max(105, halfDepth - enemyHalf - 42),
        halfWidth,
        halfDepth,
        left: S10_FLIGHT_X - halfWidth,
        right: S10_FLIGHT_X + halfWidth,
        top: scrollZ - halfDepth,
        bottom: scrollZ + halfDepth,
    };
}
function projectileLifeToEdge(startZ, vz, configuredLife) {
    const distance = Math.max(1, startZ - playerScreenTopZ());
    // Batas layar ikut bergerak ke -Z bersama scrolling world.
    const closingSpeed = Math.max(1, -vz - C().scrollSpeed);
    return Math.max(configuredLife, distance / closingSpeed + 0.35);
}
function segmentCircleHitT(x0, z0, x1, z1, cx, cz, radius) {
    const dx = x1 - x0, dz = z1 - z0;
    const fx = x0 - cx, fz = z0 - cz;
    const c = fx * fx + fz * fz - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dz * dz;
    if (a <= 1e-9) return null;
    const b = 2 * (fx * dx + fz * dz);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
}
function rand() {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 4294967296;
}
function randRange(a, b) { return a + (b - a) * rand(); }
function lerp(a, b, k) { return a + (b - a) * k; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function activeCount(list) { let n = 0; for (const x of list) if (x.active) n++; return n; }
function isAircraft(enemy) { return enemy.type?.startsWith('air'); }
function activeAircraftCount() {
    let n = 0;
    for (const enemy of stage10FlightWorld().enemies)
        if (enemy.active && isAircraft(enemy)) n++;
    return n;
}
function aircraftOnScreenCount(frame = aircraftFlightFrame()) {
    let n = 0;
    for (const enemy of stage10FlightWorld().enemies) {
        if (!enemy.active || !isAircraft(enemy)) continue;
        const p = enemy.group.position, r = enemy.radius;
        if (p.x + r >= frame.left && p.x - r <= frame.right
            && p.z + r >= frame.top && p.z - r <= frame.bottom) n++;
    }
    return n;
}
function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fighting() { return phase === 'combat' || phase === 'bossIntro' || phase === 'boss'; }

function resetPoolItem(slot) {
    slot.active = false;
    if (slot.mesh) slot.mesh.visible = false;
    if (slot.group) slot.group.visible = false;
}

function clearPools() {
    const W = stage10FlightWorld();
    for (const enemy of W.enemies) {
        resetPoolItem(enemy);
        for (const v of Object.values(enemy.variants)) v.visible = false;
    }
    for (const g of W.groundTargets) {
        resetPoolItem(g);
        for (const v of Object.values(g.variants)) v.visible = false;
    }
    for (const list of [W.playerRounds, W.cannonRounds, W.enemyRounds, W.missiles,
        W.drops, W.explosions]) for (const slot of list) resetPoolItem(slot);
    W.bombFlash.group.visible = false; W.bombFlash.active = false;
    W.boss.visible = false;
}

function resetCounters() {
    for (const k in counters.spawned) counters.spawned[k] = 0;
    for (const k in counters.ground) counters.ground[k] = 0;
    for (const k in counters.destroyed) counters.destroyed[k] = 0;
    counters.waves = 0; counters.formations = {};
    counters.playerVolleys = counters.cannonShots = counters.wingmanShots = 0;
    counters.enemyRounds = counters.missiles = counters.bombsUsed = 0;
    counters.machineGunHits = counters.cannonHits = counters.bombKills = 0;
    counters.moneyDrops = counters.healthDrops = counters.powerDrops = 0;
    counters.bombDrops = counters.wingDrops = 0;
    counters.pickups = counters.powerUps = counters.rams = 0;
    counters.missilesShotDown = 0; counters.fireBlocked = 0;
    for (const k in counters.explosions) counters.explosions[k] = 0;
}

// ----------------------------------------------------------------- biome ---

function setBiomeLayerOpacity(group, amount) {
    group.visible = amount > 0.001;
    group.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;
        const mat = obj.material;
        if (mat.userData == null) mat.userData = {};
        if (mat.userData.s10BaseOpacity == null) {
            mat.userData.s10BaseOpacity = mat.opacity == null ? 1 : mat.opacity;
            mat.userData.s10BaseTransparent = !!mat.transparent;
            mat.userData.s10BaseDepthWrite = mat.depthWrite !== false;
        }
        mat.opacity = mat.userData.s10BaseOpacity * amount;
        const transparent = mat.userData.s10BaseTransparent || amount < 0.999;
        if (mat.transparent !== transparent) {
            mat.transparent = transparent;
            mat.needsUpdate = true;
        }
        mat.depthWrite = amount >= 0.999 && mat.userData.s10BaseDepthWrite;
    });
}

function applyBiomeWeights(weights) {
    const W = stage10FlightWorld();
    for (const tile of W.terrainTiles) {
        tile.biomes.java.position.y = 0;
        tile.biomes.ocean.position.y = 0.04;
        tile.biomes.kalimantan.position.y = 0.08;
        for (const [name, group] of Object.entries(tile.biomes))
            setBiomeLayerOpacity(group, weights[name] || 0);
    }
}

function setBiome(next, announce = true, smooth = false) {
    if (smooth && next === biome) return;
    const previous = biome;
    biome = next;
    if (smooth && previous !== next) {
        biomeTransition = {
            from: previous, to: next, t: 0, active: true,
            weights: { java: 0, ocean: 0, kalimantan: 0, [previous]: 1, [next]: 0 },
        };
    } else {
        biomeTransition = {
            from: next, to: next, t: C().biomes.transitionSec, active: false,
            weights: { java: next === 'java' ? 1 : 0, ocean: next === 'ocean' ? 1 : 0,
                kalimantan: next === 'kalimantan' ? 1 : 0 },
        };
    }
    applyBiomeWeights(biomeTransition.weights);
    const label = biome === 'java' ? 'JAVA AIRSPACE'
        : biome === 'ocean' ? 'JAVA SEA CORRIDOR' : 'KALIMANTAN AIRSPACE';
    if (announce && lastBiomeMessage !== label) showStageMsg(label, 2800);
    lastBiomeMessage = label;
}

function updateBiomeTransition(dt) {
    if (!biomeTransition.active) return;
    biomeTransition.t += dt;
    const raw = clamp(biomeTransition.t / Math.max(0.01, C().biomes.transitionSec), 0, 1);
    const k = raw * raw * (3 - 2 * raw);
    const weights = { java: 0, ocean: 0, kalimantan: 0 };
    weights[biomeTransition.from] = 1 - k;
    weights[biomeTransition.to] = k;
    biomeTransition.weights = weights;
    applyBiomeWeights(weights);
    if (raw >= 1) {
        biomeTransition.active = false;
        biomeTransition.from = biomeTransition.to;
    }
}

function desiredBiome() {
    if (elapsed < C().biomes.javaEndSec) return 'java';
    if (elapsed < C().biomes.oceanEndSec) return 'ocean';
    return 'kalimantan';
}

// ------------------------------------------------------------------ reset ---

function resetWorldPositions() {
    const W = stage10FlightWorld();
    for (let i = 0; i < W.terrainTiles.length; i++) {
        W.terrainTiles[i].group.position.set(S10_FLIGHT_X, 0, (2 - i) * TILE_LENGTH);
    }
    for (let i = 0; i < W.clouds.length; i++) {
        const c = W.clouds[i];
        c.group.position.set(S10_FLIGHT_X + ((i * 137) % 1120) - 560,
            i % 3 === 0 ? 54 : 18,
            scrollZ - 390 + (i % 9) * 92 + Math.floor(i / 9) * 40);
        c.group.scale.setScalar(0.7 + (i % 4) * 0.12);
    }
}

function resetFlight() {
    const W = stage10FlightWorld();
    elapsed = 0; scrollZ = S10_FLIGHT_START_Z;
    phase = 'combat'; biome = 'java'; clearT = 0; victoryArmed = false;
    transitionCommitted = false;
    playerDestroyedT = 0; playerExplosionPulse = 0; playerHitT = 0;
    rngState = 0x5a10f17; lastBiomeMessage = '';
    mgMouse = mgKey = bombMouse = bombKey = false;
    mgCooldown = bombCooldown = 0; cannonSide = 0; volleyIndex = 0;
    moveVX = moveVZ = 0;
    weaponLevel = clamp(C().startWeaponLevel, 1, maxWeaponLevel());
    bombs = C().bomb.start; wingmanCount = 0;
    waveT = 1.2; waveNumber = 0; lastFormation = ''; nextWaveEntrySide = -1;
    enemyFireGap = 0; peakEnemyRounds = 0; peakMissiles = 0;
    groundT = C().ground.intervalStartSec * 0.55;
    boss.active = false; boss.dying = false; boss.deathT = 0; boss.enraged = false;
    boss.hp = boss.maxHp = C().boss.hp; boss.t = 0; boss.entryT = 0;
    boss.gunCd = boss.missileCd = 0; boss.missileLeft = 0; boss.dir = 1; boss.hitFlash = 0;
    flightHp = C().playerHp;
    player.maxHp = C().playerHp;
    player.hp = flightHp;
    clearPools(); resetCounters(); resetWorldPositions(); setBiome('java', false);
    W.playerAircraft.visible = true;
    W.playerAircraft.position.set(S10_FLIGHT_X, C().altitude,
        scrollZ + C().arenaBottomOffset * 0.62);
    W.playerAircraft.rotation.set(0, Math.PI * 0.5, 0);
    const pdata = W.playerAircraft.userData.transport;
    pdata.flightRig.rotation.set(0, 0, 0);
    pdata.fanAngle = 0;
    for (const engine of pdata.engines) engine.fan.rotation.z = 0;
    for (const wm of W.wingmen) {
        wm.active = false; wm.group.visible = false; wm.t = 0; wm.fireCd = 0;
        wm.group.rotation.set(0, Math.PI, 0);
        wm.group.position.copy(W.playerAircraft.position);
    }
    camera.position.set(W.playerAircraft.position.x, C().altitude,
        W.playerAircraft.position.z);
    W.flightLight.position.set(S10_FLIGHT_X, 120, scrollZ);
}

function updateTerrain(dt) {
    const W = stage10FlightWorld();
    const cycle = W.terrainTiles.length * TILE_LENGTH;
    for (const tile of W.terrainTiles) {
        while (tile.group.position.z > scrollZ + TILE_LENGTH * 2.5)
            tile.group.position.z -= cycle;
        while (tile.group.position.z < scrollZ - cycle + TILE_LENGTH * 1.5)
            tile.group.position.z += cycle;
    }
    for (const cloud of W.clouds) {
        cloud.phase += dt;
        cloud.group.position.x += Math.sin(cloud.phase * 0.35) * dt * cloud.drift;
        cloud.group.position.z += dt * (C().scrollSpeed * 0.33 + cloud.drift);
        cloud.group.rotation.y += dt * 0.025;
        if (cloud.group.position.z > scrollZ + 430) {
            cloud.group.position.z -= 850;
            cloud.group.position.x = S10_FLIGHT_X + (rand() - 0.5) * 1180;
        }
    }
    W.flightLight.position.z = scrollZ;
}

// ------------------------------------------------------- musuh: kelahiran ---

function enemyVariant(slot, type) {
    for (const [name, model] of Object.entries(slot.variants)) model.visible = name === type;
}

function initEnemySlot(slot, type) {
    const cfg = EC(type);
    const W = stage10FlightWorld();
    slot.active = true; slot.type = type; slot.hp = cfg.hp; slot.maxHp = cfg.hp;
    slot.t = rand() * 6.28; slot.fireCd = 0.7 + rand() * 1.1;
    slot.burstLeft = cfg.burstShots || 0; slot.hitFlash = 0;
    slot.radius = type.startsWith('air')
        ? W.playerAircraft.userData.transport.flightVisual.enemyAircraftHitRadius : cfg.radius;
    slot.group.visible = true; slot.group.scale.setScalar(1);
    enemyVariant(slot, type);
    counters.spawned[type]++;
}

// Satu pesawat musuh, dipakai oleh spawner formasi DAN oleh debug/smoke.
function spawnEnemy(type, x = null, z = null) {
    const W = stage10FlightWorld();
    const aircraft = type.startsWith('air');
    if (aircraft && x == null && z == null
        && activeAircraftCount() >= C().maxAircraftOnScreen) return null;
    const slot = W.enemies.find(e => !e.active);
    if (!slot) return null;
    initEnemySlot(slot, type);
    const frame = aircraftFlightFrame();
    const sx = x == null
        ? frame.cx + (rand() * 2 - 1) * frame.laneHalfWidth * 0.82
        : x;
    const sz = z == null
        ? frame.top - slot.radius - 18 - rand() * 35
        : z;
    slot.group.position.set(sx, type.startsWith('ship') ? 1.2 : C().altitude, sz);
    slot.group.rotation.set(0, 0, 0);
    if (aircraft) {
        slot.path = type === 'airC' ? 'kamikaze' : 'hold';
        slot.holdX = sx;
        slot.holdZOffset = sz - scrollZ;
        slot.weaveAmp = randRange(10, 22);
        slot.weaveRate = randRange(0.5, 1.05);
        slot.dwellLeft = C().waves.dwellSec;
        slot.entryFrom = 'top';
    } else {
        slot.path = 'surface';
        slot.entryFrom = 'surface';
    }
    return slot;
}

// GELOMBANG FORMASI — inti rasa Air Strike 1944. Satu panggilan melahirkan
// seluruh formasi sekaligus dengan pola, tipe dan arah masuk yang sama.
function spawnWave(opts = {}) {
    const W = stage10FlightWorld();
    const cfg = C().waves;
    const frame = aircraftFlightFrame();
    const span = W.playerAircraft.userData.transport.flightVisual.enemyAircraftSpan;
    const room = C().maxAircraftOnScreen - activeAircraftCount();
    if (room <= 0) return null;
    let size = opts.size || Math.round(randRange(cfg.sizeMin, cfg.sizeMax));
    size = Math.max(1, Math.min(size, room));
    // Bentuk tidak boleh mengulang gelombang sebelumnya agar layar terus berubah.
    let name = opts.formation;
    if (!name) {
        do { name = FORMATION_NAMES[Math.floor(rand() * FORMATION_NAMES.length)]; }
        while (FORMATION_NAMES.length > 1 && name === lastFormation);
    }
    lastFormation = name;
    const entry = opts.entry || (rand() < 0.72 ? 'top' : (nextWaveEntrySide < 0 ? 'left' : 'right'));
    if (entry !== 'top') nextWaveEntrySide *= -1;
    const type = opts.type || chooseWaveType();
    const slots = FORMATIONS[name](size);
    const armedEvery = Math.max(1, Math.round(1 / clamp(cfg.shooterFraction, 0.05, 1)));
    const pitch = span * 1.28;
    // Titik istirahat formasi selalu di dalam kotak main yang benar-benar terlihat.
    const spread = Math.max(...slots.map(s => Math.abs(s.dx))) * pitch;
    const leadX = clamp(frame.cx + randRange(-1, 1) * frame.laneHalfWidth * 0.62,
        frame.left + spread + span, frame.right - spread - span);
    const holdOffset = -frame.laneHalfDepth * randRange(0.18, 0.66);
    const born = [];
    for (const slot of slots) {
        const e = W.enemies.find(s => !s.active);
        if (!e) break;
        initEnemySlot(e, type);
        e.holdX = clamp(leadX + slot.dx * pitch, frame.left + span, frame.right - span);
        e.holdZOffset = holdOffset + slot.dz * pitch * 0.72;
        e.weaveAmp = randRange(8, 18);
        e.weaveRate = randRange(0.55, 1.1);
        e.dwellLeft = cfg.dwellSec * randRange(0.85, 1.25);
        e.entryFrom = entry;
        e.formation = name;
        e.wave = waveNumber;
        // Sebagian formasi terbang sebagai RINTANGAN saja: satu gelombang
        // tujuh pesawat tidak boleh berarti tujuh sumber tembakan.
        e.armed = born.length % armedEvery === 0;
        if (entry === 'top') {
            e.path = 'entry';
            e.group.position.set(e.holdX,
                C().altitude,
                frame.top - e.radius - 30 + slot.dz * pitch * 0.9);
        } else {
            const side = entry === 'left' ? -1 : 1;
            e.path = 'cross';
            e.crossDir = -side;
            e.group.position.set(frame.cx + side * (frame.halfWidth + e.radius + 24 - slot.dz * pitch),
                C().altitude,
                clamp(scrollZ + e.holdZOffset + slot.dx * pitch * 0.5,
                    frame.top + e.radius, frame.cz));
        }
        e.group.rotation.set(0, 0, 0);
        // Pemimpin formasi membawa power-up: satu-satunya sumber bintang yang
        // dijamin, persis peran "pesawat berwarna beda" di referensi.
        e.carriesPower = born.length === 0 && rand() < cfg.powerDropChance;
        born.push(e);
    }
    if (!born.length) return null;
    waveNumber++; counters.waves++;
    counters.formations[name] = (counters.formations[name] || 0) + 1;
    return { formation: name, entry, type, size: born.length, members: born };
}

function chooseWaveType() {
    const r = rand();
    const progress = clamp(elapsed / Math.max(1, C().durationSec), 0, 1);
    if (r < 0.30 - progress * 0.12) return 'airC';
    if (r < 0.78 - progress * 0.16) return 'airB';
    return 'airA';
}

// -------------------------------------------------- instalasi darat (ground) ---

function groundKindsForBiome() {
    if (biome === 'ocean') return [];
    return biome === 'java'
        ? ['turret', 'tank', 'bunker', 'depot']
        : ['turret', 'tank', 'bunker'];
}

function spawnGroundTarget(kind = null, x = null, z = null) {
    const W = stage10FlightWorld();
    const kinds = groundKindsForBiome();
    const type = kind || (kinds.length ? kinds[Math.floor(rand() * kinds.length)] : null);
    if (!type) return null;
    const slot = W.groundTargets.find(g => !g.active);
    if (!slot) return null;
    const cfg = EC(type);
    const frame = aircraftFlightFrame();
    slot.active = true; slot.type = type; slot.hp = cfg.hp; slot.maxHp = cfg.hp;
    slot.radius = cfg.radius; slot.hitFlash = 0; slot.t = rand() * 6.28;
    slot.fireCd = 0.8 + rand() * 1.4; slot.burstLeft = cfg.burstShots || 0;
    slot.speed = cfg.speed || 0;
    slot.drift = rand() < 0.5 ? -1 : 1;
    slot.group.visible = true; slot.group.scale.setScalar(1);
    for (const [name, model] of Object.entries(slot.variants)) model.visible = name === type;
    slot.turret = slot.variants[type].userData.turret || null;
    slot.group.position.set(
        x == null ? frame.cx + randRange(-1, 1) * frame.laneHalfWidth * 0.9 : x,
        0,
        z == null ? playerScreenTopZ() - C().ground.leadMargin - rand() * 120 : z);
    slot.group.rotation.set(0, rand() * 0.4 - 0.2, 0);
    counters.ground[type]++;
    return slot;
}

// ----------------------------------------------------- proyektil dan drop ---

function spawnEnemyRound(x, z, y, damage, targetX = null, targetZ = null,
    spreadRad = null, bypassGap = false) {
    const W = stage10FlightWorld();
    // TIGA PAGU TEKANAN (2026-08-28, laporan user "tembakan musuh terlalu banyak
    // dan sangat sulit dihindari"): jumlah peluru hidup dibatasi, ada jeda
    // GLOBAL antar tembakan siapa pun sehingga selusin musuh tidak pernah
    // melepas satu dinding peluru serempak, dan setiap arah diberi jitter kecil
    // supaya tembakan terarah tidak pernah benar-benar sempurna.
    if (!bypassGap && enemyFireGap > 0) { counters.fireBlocked++; return false; }
    if (activeCount(W.enemyRounds) >= FIRE().maxActiveRounds) {
        counters.fireBlocked++; return false;
    }
    const p = W.enemyRounds.find(b => !b.active);
    if (!p) return false;
    if (!bypassGap) enemyFireGap = FIRE().minGapSec;
    if (spreadRad == null) spreadRad = FIRE().aimJitterDeg * Math.PI / 180;
    const tx = targetX == null ? camera.position.x : targetX;
    const tz = targetZ == null ? camera.position.z : targetZ;
    let a = Math.atan2(tx - x, tz - z);
    if (spreadRad) a += (rand() * 2 - 1) * spreadRad;
    p.active = true; p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.vx = Math.sin(a) * C().enemyBulletSpeed;
    p.vz = Math.cos(a) * C().enemyBulletSpeed;
    p.life = C().enemyBulletLifeSec; p.damage = damage;
    p.mesh.rotation.y = a;
    counters.enemyRounds++; playSFX(sfxRobotShot, 0.3);
    return true;
}

function spawnMissile(x, z, y, cfg, damage) {
    const W = stage10FlightWorld();
    if (activeCount(W.missiles) >= FIRE().maxActiveMissiles) {
        counters.fireBlocked++; return false;
    }
    const p = W.missiles.find(b => !b.active);
    if (!p) return false;
    const a = Math.atan2(camera.position.x - x, camera.position.z - z);
    p.active = true; p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.angle = a; p.speed = cfg.missileSpeed; p.turn = cfg.missileTurnRate;
    p.life = C().enemyBulletLifeSec + 2; p.damage = damage;
    // Rudal hanya MENGEJAR selama jendela pendek, lalu lurus — sesudah itu ia
    // dihindari dengan bergerak, bukan dengan menebak. Ia juga bisa ditembak.
    p.homeLeft = FIRE().missileHomeSec;
    p.hp = FIRE().missileHp;
    p.mesh.rotation.y = a;
    counters.missiles++; playSFX(sfxRocketShot, 0.38);
    return true;
}

function spawnDrop(type, value, x, y, z) {
    const W = stage10FlightWorld();
    const p = W.drops.find(d => !d.active);
    if (!p) return false;
    p.active = true; p.group.visible = true; p.type = type; p.value = value;
    p.collecting = false; p.collectT = 0; p.age = 0; p.baseY = Math.max(8, y);
    p.group.position.set(x, p.baseY, z); p.group.scale.setScalar(1);
    for (const [name, model] of Object.entries(p.variants)) model.visible = name === type;
    if (type === 'money') counters.moneyDrops++;
    else if (type === 'health') counters.healthDrops++;
    else if (type === 'power') counters.powerDrops++;
    else if (type === 'bomb') counters.bombDrops++;
    else counters.wingDrops++;
    return true;
}

function rollDrop(cfgType, x, y, z, carriesPower = false) {
    if (carriesPower) {
        // Bintang selalu berguna: setelah power maksimum ia berubah jadi bom,
        // lalu wingman — tidak pernah menjadi pickup kosong.
        if (weaponLevel < maxWeaponLevel()) return spawnDrop('power', 1, x, y, z);
        if (bombs < C().bomb.max) return spawnDrop('bomb', 1, x, y, z);
        if (wingmanCount < C().wingman.max) return spawnDrop('wingman', 1, x, y, z);
        return spawnDrop('money', (cfgType.money || 40) * 2, x, y, z);
    }
    const r = rand();
    if (r < cfgType.moneyChance) spawnDrop('money', cfgType.money, x, y, z);
    else if (r < cfgType.moneyChance + cfgType.healthChance)
        spawnDrop('health', C().healthHealFraction * C().playerHp, x, y, z);
}

function spawnExplosion(x, y, z, size, kind) {
    const W = stage10FlightWorld();
    let p = W.explosions.find(e => !e.active);
    if (!p) p = W.explosions.reduce((a, b) => (a.t || 0) > (b.t || 0) ? a : b);
    p.active = true; p.group.visible = true; p.group.position.set(x, y, z);
    p.group.scale.setScalar(1); p.t = 0;
    p.duration = kind === 'player' || kind === 'boss' ? 2.2 : 1.15;
    p.size = size; p.kind = kind;
    p.core.scale.setScalar(0.1); p.fire.scale.setScalar(0.1); p.ring.scale.setScalar(0.1);
    for (let i = 0; i < p.debris.length; i++) {
        const d = p.debris[i], a = i / p.debris.length * Math.PI * 2 + rand() * 0.35;
        d.position.set(0, 0, 0); d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        d.visible = true;
        d.userData.vx = Math.cos(a) * size * (8 + rand() * 14);
        d.userData.vz = Math.sin(a) * size * (8 + rand() * 14);
        d.userData.vy = 10 + rand() * 18;
    }
    for (let i = 0; i < p.smoke.length; i++) {
        p.smoke[i].position.set((rand() - 0.5) * size * 3, i * 1.8, (rand() - 0.5) * size * 3);
        p.smoke[i].scale.setScalar(0.1); p.smoke[i].visible = true;
    }
    if (kind in counters.explosions) counters.explosions[kind]++;
    playSFX(kind === 'cannon' ? sfxRocketExplode : sfxExplode,
        kind === 'player' || kind === 'boss' ? 0.95 : 0.65);
    return p;
}

function updateExplosions(dt) {
    const W = stage10FlightWorld();
    for (const p of W.explosions) {
        if (!p.active) continue;
        p.t += dt;
        const q = p.t / p.duration;
        p.core.scale.setScalar(p.size * (0.2 + Math.sin(Math.min(1, q) * Math.PI) * 2.6));
        p.fire.scale.setScalar(p.size * (0.3 + Math.sin(Math.min(1, q * 1.4) * Math.PI) * 1.8));
        p.ring.scale.setScalar(p.size * (0.3 + q * 6));
        for (const d of p.debris) {
            d.position.x += d.userData.vx * dt;
            d.position.z += d.userData.vz * dt;
            d.position.y += d.userData.vy * dt;
            d.userData.vy -= 34 * dt;
            d.rotation.x += dt * 5; d.rotation.z += dt * 4;
        }
        for (let i = 0; i < p.smoke.length; i++) {
            const s = p.smoke[i];
            s.position.y += dt * (8 + i * 2);
            s.scale.setScalar(p.size * (0.2 + q * (1.5 + i * 0.18)));
        }
        if (p.t >= p.duration) resetPoolItem(p);
    }
}

// ---------------------------------------------------------- damage & kill ---

function killEnemy(enemy, withDrop = true) {
    if (!enemy.active) return;
    const ship = enemy.type.startsWith('ship');
    const pos = enemy.group.position;
    spawnExplosion(pos.x, pos.y + (ship ? 3 : 0), pos.z, ship ? 1.5 : 1.25,
        ship ? 'ships' : 'aircraft');
    if (withDrop) rollDrop(EC(enemy.type), pos.x, pos.y, pos.z, !!enemy.carriesPower);
    resetPoolItem(enemy);
    for (const v of Object.values(enemy.variants)) v.visible = false;
    if (ship) counters.destroyed.ships++; else counters.destroyed.aircraft++;
    stats.kills++;
}

function killGroundTarget(target, withDrop = true) {
    if (!target.active) return;
    const pos = target.group.position;
    spawnExplosion(pos.x, 6, pos.z, 1.7, 'ground');
    if (withDrop) rollDrop(EC(target.type), pos.x, 12, pos.z, false);
    resetPoolItem(target);
    for (const v of Object.values(target.variants)) v.visible = false;
    counters.destroyed.ground++;
    stats.kills++;
}

function damageEnemy(enemy, damage) {
    if (!enemy.active) return false;
    enemy.hp -= damage; enemy.hitFlash = 0.12; stats.hits++;
    enemy.group.scale.setScalar(1.08);
    if (enemy.hp <= 0) killEnemy(enemy, true);
    return true;
}

function damageGroundTarget(target, damage) {
    if (!target.active) return false;
    target.hp -= damage; target.hitFlash = 0.12; stats.hits++;
    target.group.scale.setScalar(1.06);
    if (target.hp <= 0) killGroundTarget(target, true);
    return true;
}

function damageBoss(damage) {
    if (!boss.active || boss.dying) return false;
    boss.hp = Math.max(0, boss.hp - damage); boss.hitFlash = 0.1; stats.hits++;
    if (!boss.enraged && boss.hp <= boss.maxHp * C().boss.enrageHpFrac) {
        boss.enraged = true;
        showStageMsg('BOMBER ARMOR BREACHED', 2600);
    }
    if (boss.hp <= 0) startBossDeath();
    return true;
}

function damagePlayer(damage) {
    if (!fighting() || godMode) return;
    flightHp = Math.max(0, flightHp - damage); player.hp = flightHp;
    playerHitT = 0.22; playSFX(sfxHit, 0.55);
    if (flightHp <= 0) startPlayerDestruction();
}

function startPlayerDestruction() {
    if (phase === 'playerDestroyed') return;
    phase = 'playerDestroyed'; playerDestroyedT = 0; playerExplosionPulse = 0;
    mgMouse = mgKey = bombMouse = bombKey = false;
    setCinematicActive(true);
    const p = stage10FlightWorld().playerAircraft.position;
    spawnExplosion(p.x, p.y, p.z, 2.1, 'player');
    for (const wm of stage10FlightWorld().wingmen) {
        wm.active = false; wm.group.visible = false;
    }
}

function updatePlayerDestruction(dt) {
    const plane = stage10FlightWorld().playerAircraft;
    playerDestroyedT += dt; playerExplosionPulse -= dt;
    plane.rotation.y += dt * 2.2; plane.rotation.z += dt * 1.5;
    plane.position.y = Math.max(5, plane.position.y - dt * 7);
    if (playerExplosionPulse <= 0 && playerDestroyedT < 1.8) {
        playerExplosionPulse = 0.24;
        spawnExplosion(plane.position.x + (rand() - 0.5) * 22,
            plane.position.y + (rand() - 0.5) * 8,
            plane.position.z + (rand() - 0.5) * 26, 0.9 + rand() * 0.7, 'player');
    }
    if (playerDestroyedT >= 1.65) plane.visible = false;
    if (playerDestroyedT >= PLAYER_EXPLOSION_SEC) {
        setCinematicActive(false);
        gameOver(false, 'AIRCRAFT DESTROYED');
    }
}

// ----------------------------------------------------------- musuh: gerak ---

function updateEnemies(dt) {
    const W = stage10FlightWorld();
    const view = aircraftFlightFrame();
    const bottom = view.bottom + 110;
    const px = camera.position.x, pz = camera.position.z;
    for (const enemy of W.enemies) {
        if (!enemy.active) continue;
        const cfg = EC(enemy.type); enemy.t += dt; enemy.fireCd -= dt;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
        enemy.group.scale.setScalar(enemy.hitFlash > 0 ? 1.08 : 1);
        const ship = enemy.type.startsWith('ship');
        const pos = enemy.group.position;
        const oldX = pos.x, oldZ = pos.z;

        if (ship) {
            pos.z += cfg.speed * dt;
            pos.x += Math.sin(enemy.t * 0.65) * dt * 3;
            pos.y = 1.2 + Math.sin(enemy.t * 1.8) * 0.35;
            enemy.group.rotation.y = Math.sin(enemy.t * 0.45) * 0.05;
        } else if (enemy.path === 'kamikaze') {
            const dx = px - pos.x, dz = pz - pos.z;
            const d = Math.hypot(dx, dz) || 1;
            pos.x += dx / d * cfg.speed * dt;
            pos.z += dz / d * cfg.speed * dt;
            enemy.group.rotation.y = Math.atan2(dx, dz);
            enemy.group.rotation.z = Math.sin(enemy.t * 5) * 0.12;
        } else if (enemy.path === 'entry') {
            const targetZ = scrollZ + enemy.holdZOffset;
            const k = 1 - Math.exp(-2.6 * dt);
            pos.x = lerp(pos.x, enemy.holdX, k);
            pos.z += Math.max(cfg.speed, (targetZ - pos.z) * 2.4) * dt;
            if (pos.z >= targetZ) { pos.z = targetZ; enemy.path = 'hold'; }
        } else if (enemy.path === 'hold') {
            pos.x = enemy.holdX + Math.sin(enemy.t * enemy.weaveRate) * enemy.weaveAmp;
            pos.z = scrollZ + enemy.holdZOffset
                + Math.sin(enemy.t * enemy.weaveRate * 0.63) * enemy.weaveAmp * 0.45;
            enemy.dwellLeft -= dt;
            if (enemy.dwellLeft <= 0) enemy.path = 'exit';
        } else if (enemy.path === 'exit') {
            pos.z += cfg.speed * C().waves.exitSpeedMul * dt;
            pos.x += Math.sin(enemy.t * enemy.weaveRate) * dt * enemy.weaveAmp * 0.4;
        } else {   // cross — masuk dari samping, menyeberang layar
            pos.x += enemy.crossDir * cfg.speed * 1.35 * dt;
            pos.z += Math.sin(enemy.t * 0.8) * dt * 16 + cfg.speed * 0.18 * dt;
        }

        if (!ship) {
            const mx = pos.x - oldX, mz = pos.z - oldZ;
            if (enemy.path !== 'kamikaze' && mx * mx + mz * mz > 1e-6)
                enemy.group.rotation.y = Math.atan2(mx, mz);
            enemy.group.rotation.z = clamp(-mx / Math.max(dt, 1e-4) * 0.0018, -0.4, 0.4);
            pos.y = C().altitude;
        }

        const visible = pos.x > view.left - enemy.radius * 2
            && pos.x < view.right + enemy.radius * 2
            && pos.z > view.top - enemy.radius * 2
            && pos.z < view.bottom + enemy.radius * 2;

        // TEMBAKAN: kelas B memuntahkan burst bola plasma, kelas A rudal homing.
        if (visible && fighting() && enemy.armed !== false && enemy.fireCd <= 0) {
            if (enemy.type === 'airB' || enemy.type === 'shipB') {
                if (spawnEnemyRound(pos.x, pos.z, pos.y + 1.2, cfg.damage)) {
                    enemy.burstLeft--;
                    if (enemy.burstLeft > 0) enemy.fireCd = cfg.burstGapSec || 0.22;
                    else { enemy.burstLeft = cfg.burstShots || 1; enemy.fireCd = cfg.fireDelaySec; }
                }
            } else if (enemy.type === 'airA' || enemy.type === 'shipA') {
                if (spawnMissile(pos.x, pos.z, pos.y + (ship ? 6 : 0), cfg, cfg.damage)) {
                    enemy.burstLeft--;
                    if (enemy.burstLeft > 0) enemy.fireCd = cfg.burstGapSec;
                    else { enemy.burstLeft = cfg.burstShots; enemy.fireCd = cfg.burstRestSec; }
                }
            }
        }

        // TABRAKAN: setiap pesawat musuh berbahaya kalau ditabrak (aturan shmup).
        if (!ship && Math.hypot(pos.x - px, pos.z - pz) < enemy.radius + C().playerRadius * 0.6) {
            damagePlayer(cfg.damage);
            counters.rams++;
            killEnemy(enemy, enemy.type !== 'airC');
            continue;
        }

        const gone = pos.z > bottom
            || Math.abs(pos.x - S10_FLIGHT_X) > view.halfWidth + 300
            || pos.z < view.top - 460;
        if (gone) {
            resetPoolItem(enemy);
            for (const v of Object.values(enemy.variants)) v.visible = false;
        }
    }
}

function updateGroundTargets(dt) {
    const W = stage10FlightWorld();
    const view = aircraftFlightFrame();
    const px = camera.position.x, pz = camera.position.z;
    for (const g of W.groundTargets) {
        if (!g.active) continue;
        const cfg = EC(g.type);
        g.t += dt; g.fireCd -= dt;
        g.hitFlash = Math.max(0, g.hitFlash - dt);
        g.group.scale.setScalar(g.hitFlash > 0 ? 1.06 : 1);
        const pos = g.group.position;
        if (g.speed) {
            pos.x += g.drift * g.speed * dt;
            if (Math.abs(pos.x - view.cx) > view.laneHalfWidth) g.drift *= -1;
            g.group.rotation.y = g.drift > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        }
        // Laras selalu mengarah ke pesawat — telegraf yang bisa dibaca player.
        if (g.turret) g.turret.rotation.y = Math.atan2(px - pos.x, pz - pos.z);
        const visible = pos.z > view.top - 40 && pos.z < view.bottom + 40
            && Math.abs(pos.x - view.cx) < view.halfWidth + 60;
        if (visible && fighting() && cfg.fireDelaySec > 0 && g.fireCd <= 0) {
            if (spawnEnemyRound(pos.x, pos.z, 8, cfg.damage)) {
                g.burstLeft--;
                if (g.burstLeft > 0) g.fireCd = cfg.burstGapSec;
                else { g.burstLeft = cfg.burstShots; g.fireCd = cfg.fireDelaySec; }
            }
        }
        if (pos.z > view.bottom + 160) {
            resetPoolItem(g);
            for (const v of Object.values(g.variants)) v.visible = false;
        }
    }
}

// ------------------------------------------------------------------- boss ---

function bossPosition() {
    return { x: boss.x, z: scrollZ + boss.zOffset };
}

function startBoss() {
    const W = stage10FlightWorld();
    const cfg = C().boss;
    boss.active = true; boss.dying = false; boss.deathT = 0; boss.enraged = false;
    boss.hp = boss.maxHp = cfg.hp;
    boss.x = S10_FLIGHT_X; boss.t = 0; boss.entryT = 0; boss.dir = 1;
    boss.gunCd = cfg.gunDelaySec; boss.missileCd = cfg.missileDelaySec;
    boss.missileLeft = cfg.missileBurst; boss.hitFlash = 0;
    boss.zOffset = -playerScreenHalfDepth() - 220;
    W.boss.visible = true;
    W.boss.position.set(boss.x, C().altitude + 16, scrollZ + boss.zOffset);
    W.boss.rotation.set(0, Math.PI, 0);
    showStageMsg('WARNING — HEAVY BOMBER INBOUND', 4200);
}

function startBossDeath() {
    boss.dying = true; boss.deathT = 0;
    const p = bossPosition();
    spawnExplosion(p.x, C().altitude + 16, p.z, 3.2, 'boss');
    addScore(C().boss.money);
    counters.destroyed.boss++;
    stats.kills++;
}

function updateBoss(dt) {
    const W = stage10FlightWorld();
    const cfg = C().boss;
    if (!boss.active) return;
    boss.t += dt;
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    const rig = W.boss.userData.boss;
    for (const engine of rig.engines) engine.fan.rotation.z += dt * 26;

    if (boss.dying) {
        boss.deathT += dt;
        W.boss.rotation.z += dt * 0.55;
        W.boss.position.y = Math.max(6, W.boss.position.y - dt * 9);
        boss.zOffset += dt * 10;
        if (boss.deathT % 0.32 < dt) {
            const p = bossPosition();
            spawnExplosion(p.x + randRange(-60, 60), C().altitude + randRange(-6, 14),
                p.z + randRange(-40, 40), randRange(1.1, 2.1), 'boss');
        }
        W.boss.position.set(bossPosition().x, W.boss.position.y, bossPosition().z);
        if (boss.deathT >= cfg.deathSec) {
            boss.active = false; W.boss.visible = false;
            phase = 'victory'; clearT = 0; victoryArmed = false;
            showStageMsg('BOMBER DOWN — AIRSPACE CLEAR', 3400);
        }
        return;
    }

    const speedMul = boss.enraged ? cfg.enrageSpeedMul : 1;
    if (phase === 'bossIntro') {
        boss.entryT += dt;
        const k = clamp(boss.entryT / Math.max(0.01, cfg.entrySec), 0, 1);
        const eased = k * k * (3 - 2 * k);
        boss.zOffset = lerp(-playerScreenHalfDepth() - 220, cfg.holdOffset, eased);
        if (k >= 1) phase = 'boss';
    } else {
        boss.x += boss.dir * cfg.sweepSpeed * speedMul * dt;
        if (boss.x > S10_FLIGHT_X + cfg.sweepHalfWidth) { boss.x = S10_FLIGHT_X + cfg.sweepHalfWidth; boss.dir = -1; }
        if (boss.x < S10_FLIGHT_X - cfg.sweepHalfWidth) { boss.x = S10_FLIGHT_X - cfg.sweepHalfWidth; boss.dir = 1; }
        boss.zOffset = cfg.holdOffset + Math.sin(boss.t * 0.7) * 18;
    }
    const p = bossPosition();
    W.boss.position.set(p.x, C().altitude + 16 + Math.sin(boss.t * 1.5) * 1.6, p.z);
    W.boss.rotation.z = -boss.dir * 0.08;
    for (const t of rig.turrets)
        t.group.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);

    if (phase !== 'boss') return;
    boss.gunCd -= dt; boss.missileCd -= dt;
    if (boss.gunCd <= 0) {
        W.boss.updateMatrixWorld(true);
        const spread = cfg.gunSpread;
        for (let i = 0; i < spread; i++) {
            const a = (i - (spread - 1) / 2) * 0.14;
            const t = rig.turrets[i % rig.turrets.length];
            _v.set(0, 0, 0); t.muzzle.getWorldPosition(_v);
            const tx = camera.position.x + Math.sin(a) * 240;
            spawnEnemyRound(_v.x, _v.z, C().altitude + 6, cfg.damage,
                tx, camera.position.z, 0.04, true);
        }
        boss.gunCd = cfg.gunDelaySec / (boss.enraged ? 1.5 : 1);
        enemyFireGap = Math.max(enemyFireGap, FIRE().minGapSec);
    }
    if (boss.missileCd <= 0) {
        if (spawnMissile(p.x + randRange(-60, 60), p.z, C().altitude, cfg, cfg.missileDamage)) {
            boss.missileLeft--;
            if (boss.missileLeft > 0) boss.missileCd = 0.28;
            else { boss.missileLeft = cfg.missileBurst; boss.missileCd = cfg.missileDelaySec; }
        }
    }
    if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < cfg.radius * 0.55) {
        damagePlayer(cfg.damage * dt * 2.5);
    }
}

const _v = new THREE.Vector3();

// -------------------------------------------------- proyektil player + hit ---

// Satu sapuan segmen menabrak SEMUA keluarga target: pesawat, instalasi darat,
// dan boss. `_hit` dipakai ulang agar tidak ada alokasi per peluru per frame.
const _hit = { t: Infinity, kind: null, ref: null };

function sweepTargets(x0, z0, x1, z1, pad) {
    const W = stage10FlightWorld();
    _hit.t = Infinity; _hit.kind = null; _hit.ref = null;
    for (const e of W.enemies) {
        if (!e.active) continue;
        const t = segmentCircleHitT(x0, z0, x1, z1,
            e.group.position.x, e.group.position.z, e.radius + pad);
        if (t != null && t < _hit.t) { _hit.t = t; _hit.kind = 'enemy'; _hit.ref = e; }
    }
    for (const g of W.groundTargets) {
        if (!g.active) continue;
        const t = segmentCircleHitT(x0, z0, x1, z1,
            g.group.position.x, g.group.position.z, g.radius + pad);
        if (t != null && t < _hit.t) { _hit.t = t; _hit.kind = 'ground'; _hit.ref = g; }
    }
    for (const m of W.missiles) {
        if (!m.active) continue;
        const t = segmentCircleHitT(x0, z0, x1, z1,
            m.mesh.position.x, m.mesh.position.z, FIRE().missileHitRadius + pad);
        if (t != null && t < _hit.t) { _hit.t = t; _hit.kind = 'missile'; _hit.ref = m; }
    }
    if (boss.active && !boss.dying) {
        const p = bossPosition();
        const t = segmentCircleHitT(x0, z0, x1, z1, p.x, p.z, C().boss.radius + pad);
        if (t != null && t < _hit.t) { _hit.t = t; _hit.kind = 'boss'; _hit.ref = null; }
    }
    return _hit.kind ? _hit : null;
}

function applyDamage(hit, damage) {
    if (hit.kind === 'enemy') return damageEnemy(hit.ref, damage);
    if (hit.kind === 'ground') return damageGroundTarget(hit.ref, damage);
    if (hit.kind === 'missile') return damageMissile(hit.ref, damage);
    return damageBoss(damage);
}

// Rudal yang ditembak jatuh adalah jawaban aktif atas serangan homing.
function damageMissile(m, damage) {
    if (!m.active) return false;
    m.hp -= damage; stats.hits++;
    if (m.hp > 0) return true;
    spawnExplosion(m.mesh.position.x, C().altitude, m.mesh.position.z, 0.7, 'cannon');
    resetPoolItem(m); counters.missilesShotDown++;
    return true;
}

function areaDamage(x, z, radius, damage, counterKey) {
    const W = stage10FlightWorld();
    for (const e of W.enemies) if (e.active
        && Math.hypot(x - e.group.position.x, z - e.group.position.z) <= radius) {
        damageEnemy(e, damage); if (counterKey) counters[counterKey]++;
    }
    for (const g of W.groundTargets) if (g.active
        && Math.hypot(x - g.group.position.x, z - g.group.position.z) <= radius) {
        damageGroundTarget(g, damage); if (counterKey) counters[counterKey]++;
    }
    for (const m of W.missiles) if (m.active
        && Math.hypot(x - m.mesh.position.x, z - m.mesh.position.z) <= radius)
        damageMissile(m, damage);
    if (boss.active && !boss.dying) {
        const p = bossPosition();
        if (Math.hypot(x - p.x, z - p.z) <= radius + C().boss.radius) {
            damageBoss(damage); if (counterKey) counters[counterKey]++;
        }
    }
}

function updatePlayerRounds(dt) {
    const W = stage10FlightWorld();
    for (const b of W.playerRounds) {
        if (!b.active) continue;
        const x0 = b.mesh.position.x, z0 = b.mesh.position.z;
        b.life -= dt; b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt;
        const hit = sweepTargets(x0, z0, b.mesh.position.x, b.mesh.position.z, 2);
        if (hit) {
            b.mesh.position.x = lerp(x0, b.mesh.position.x, hit.t);
            b.mesh.position.z = lerp(z0, b.mesh.position.z, hit.t);
            applyDamage(hit, b.damage); counters.machineGunHits++;
        }
        if (hit || b.life <= 0 || b.mesh.position.z <= playerScreenTopZ() - 18)
            resetPoolItem(b);
    }
    for (const b of W.cannonRounds) {
        if (!b.active) continue;
        const x0 = b.mesh.position.x, z0 = b.mesh.position.z;
        b.life -= dt; b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt;
        const hit = sweepTargets(x0, z0, b.mesh.position.x, b.mesh.position.z, 3);
        const edge = b.mesh.position.z <= playerScreenTopZ() - 18;
        if (hit || edge || b.life <= 0) {
            if (hit) {
                b.mesh.position.x = lerp(x0, b.mesh.position.x, hit.t);
                b.mesh.position.z = lerp(z0, b.mesh.position.z, hit.t);
            }
            const x = b.mesh.position.x, z = b.mesh.position.z;
            resetPoolItem(b); spawnExplosion(x, C().altitude, z, 1.5, 'cannon');
            areaDamage(x, z, cannonRadius(), b.damage, 'cannonHits');
        }
    }
}

function updateEnemyProjectiles(dt) {
    const W = stage10FlightWorld();
    const px = camera.position.x, pz = camera.position.z;
    for (const b of W.enemyRounds) {
        if (!b.active) continue;
        b.life -= dt; b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt;
        b.halo.rotation.z += dt * 4;
        if (Math.hypot(b.mesh.position.x - px, b.mesh.position.z - pz)
            <= C().playerRadius + 2) {
            damagePlayer(b.damage); resetPoolItem(b); continue;
        }
        if (b.life <= 0) resetPoolItem(b);
    }
    for (const m of W.missiles) {
        if (!m.active) continue;
        m.life -= dt;
        m.homeLeft -= dt;
        if (m.homeLeft > 0) {
            const desired = Math.atan2(px - m.mesh.position.x, pz - m.mesh.position.z);
            let delta = desired - m.angle;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            m.angle += clamp(delta, -m.turn * dt, m.turn * dt);
        }
        m.mesh.position.x += Math.sin(m.angle) * m.speed * dt;
        m.mesh.position.z += Math.cos(m.angle) * m.speed * dt;
        m.mesh.rotation.y = m.angle;
        if (Math.hypot(m.mesh.position.x - px, m.mesh.position.z - pz)
            <= C().playerRadius + 3) {
            const x = m.mesh.position.x, z = m.mesh.position.z;
            damagePlayer(m.damage); spawnExplosion(x, C().altitude, z, 0.8, 'cannon');
            resetPoolItem(m); continue;
        }
        if (m.life <= 0) resetPoolItem(m);
    }
}

// ------------------------------------------------------------ drop & power ---

function grantPower() {
    if (weaponLevel >= maxWeaponLevel()) { addScore(120); return; }
    weaponLevel++; counters.powerUps++;
    showStageMsg(`WEAPON POWER ${weaponLevel}`, 1800);
}

function grantBomb() {
    bombs = Math.min(C().bomb.max, bombs + 1);
    showStageMsg(`BOMB ${bombs}`, 1500);
}

function grantWingman() {
    const W = stage10FlightWorld();
    if (wingmanCount >= Math.min(C().wingman.max, W.wingmen.length)) { addScore(120); return; }
    const wm = W.wingmen[wingmanCount];
    wingmanCount++;
    wm.active = true; wm.group.visible = true; wm.fireCd = 0; wm.t = 0;
    wm.group.position.set(
        camera.position.x + wm.side * C().wingman.offsetX,
        C().altitude, camera.position.z + C().wingman.offsetZ);
    showStageMsg('ESCORT JOINED', 1800);
}

function updateDrops(dt) {
    const W = stage10FlightWorld();
    for (const d of W.drops) {
        if (!d.active) continue;
        d.age += dt;
        if (d.collecting) {
            d.collectT += dt;
            const k = Math.min(1, d.collectT / 0.32);
            d.group.position.x = lerp(d.collectX, camera.position.x, k);
            d.group.position.z = lerp(d.collectZ, camera.position.z, k);
            d.group.position.y = lerp(d.collectY, C().altitude + 8, k) + Math.sin(k * Math.PI) * 18;
            d.group.scale.setScalar(1 - k * 0.85);
            if (k >= 1) resetPoolItem(d);
            continue;
        }
        d.group.rotation.y += dt * 2.8;
        d.group.position.y = d.baseY + Math.sin(d.age * 5) * 3;
        const dist = Math.hypot(d.group.position.x - camera.position.x,
            d.group.position.z - camera.position.z);
        if (dist <= C().dropPickupRadius) {
            d.collecting = true; d.collectT = 0;
            d.collectX = d.group.position.x; d.collectY = d.group.position.y;
            d.collectZ = d.group.position.z;
            if (d.type === 'money') { addScore(d.value); playSFX(sfxPickup, 0.7); }
            else if (d.type === 'health') {
                flightHp = Math.min(C().playerHp, flightHp + d.value);
                player.hp = flightHp; playSFX(sfxHeal, 0.75);
            } else if (d.type === 'power') { grantPower(); playSFX(sfxPickup, 0.85); }
            else if (d.type === 'bomb') { grantBomb(); playSFX(sfxPickup, 0.85); }
            else { grantWingman(); playSFX(sfxPickup, 0.85); }
            counters.pickups++; updateUI();
        } else if (d.group.position.z > scrollZ + C().arenaBottomOffset + 130 || d.age > 20) {
            resetPoolItem(d);
        }
    }
}

// ---------------------------------------------------------- senjata player ---

function launchRound(slot, originX, originZ, angle, speed, life, damage) {
    slot.active = true; slot.mesh.visible = true;
    slot.mesh.position.set(originX, C().altitude, originZ);
    slot.vx = Math.sin(angle) * speed;
    slot.vz = -Math.cos(angle) * speed;
    slot.life = projectileLifeToEdge(originZ, slot.vz, life);
    slot.damage = damage;
    slot.mesh.rotation.y = Math.atan2(slot.vx, slot.vz);
}

// Volley utama: SELALU lurus ke depan (layar atas). Level power menambah jumlah
// laras dan sudut sebaran, bukan mengarahkan tembakan ke kursor.
function fireVolley() {
    const W = stage10FlightWorld(), data = W.playerAircraft.userData.transport;
    const def = levelDef();
    const guns = data.weapons.wingMachineGuns;
    W.playerAircraft.updateMatrixWorld(true);
    const spread = C().spreadAngleDeg * Math.PI / 180;
    const each = roundDamage();
    let fired = 0;
    // Pasangan lurus: pasangan dalam dulu, lalu pasangan luar.
    for (let pair = 0; pair < def.forwardPairs; pair++) {
        for (const side of [-1, 1]) {
            const gun = guns.find(g => g.side === side && g.station === pair + 1) || guns[0];
            const slot = W.playerRounds.find(b => !b.active);
            if (!slot) break;
            gun.muzzle.getWorldPosition(_v);
            launchRound(slot, _v.x, _v.z, 0, C().machineGunSpeed, C().machineGunLifeSec, each);
            fired++;
        }
    }
    // Pasangan menyudut: lahir dari laras terluar, menyebar simetris.
    for (let a = 1; a <= def.angledPairs; a++) {
        for (const side of [-1, 1]) {
            const gun = guns.find(g => g.side === side && g.station === 2) || guns[0];
            const slot = W.playerRounds.find(b => !b.active);
            if (!slot) break;
            gun.muzzle.getWorldPosition(_v);
            launchRound(slot, _v.x, _v.z, side * spread * a,
                C().machineGunSpeed, C().machineGunLifeSec, each);
            fired++;
        }
    }
    // Meriam hidung ikut menyalak setiap N volley di level tinggi.
    if (def.cannonEvery > 0 && volleyIndex % def.cannonEvery === 0) fireCannon();
    volleyIndex++;
    if (fired) {
        mgCooldown = machineDelay(); counters.playerVolleys++; stats.shots++;
        playSFX(sfxShoot, 0.45); return true;
    }
    return false;
}

function fireCannon() {
    const W = stage10FlightWorld(), data = W.playerAircraft.userData.transport;
    const slot = W.cannonRounds.find(b => !b.active);
    if (!slot) return false;
    W.playerAircraft.updateMatrixWorld(true);
    data.weapons.noseCannons[cannonSide].muzzle.getWorldPosition(_v);
    cannonSide = 1 - cannonSide;
    launchRound(slot, _v.x, _v.z, 0, C().cannonSpeed, C().cannonLifeSec,
        level3Damage('launcher'));
    counters.cannonShots++; stats.shots++;
    playSFX(sfxRocketShot, 0.55); return true;
}

function updateWingmen(dt) {
    const W = stage10FlightWorld();
    const cfg = C().wingman;
    const each = roundDamage() * cfg.damageFraction;
    for (const wm of W.wingmen) {
        if (!wm.active) continue;
        wm.t += dt;
        const k = 1 - Math.exp(-dt / Math.max(0.01, cfg.followLagSec));
        const tx = camera.position.x + wm.side * cfg.offsetX;
        const tz = camera.position.z + cfg.offsetZ;
        wm.group.position.x = lerp(wm.group.position.x, tx, k);
        wm.group.position.z = lerp(wm.group.position.z, tz, k);
        wm.group.position.y = C().altitude + Math.sin(wm.t * 3.6 + wm.side) * 0.8;
        wm.group.rotation.z = clamp((tx - wm.group.position.x) * 0.012, -0.35, 0.35);
        wm.fireCd -= dt;
        if (!fighting() || wm.fireCd > 0) continue;
        const slot = W.playerRounds.find(b => !b.active);
        if (!slot) continue;
        wm.group.updateMatrixWorld(true);
        wm.muzzle.getWorldPosition(_v);
        launchRound(slot, _v.x, _v.z, 0, C().machineGunSpeed, C().machineGunLifeSec, each);
        wm.fireCd = machineDelay() * cfg.fireDelayMul;
        counters.wingmanShots++;
    }
}

// ------------------------------------------------------------------- bomb ---

function useBomb() {
    if (!fighting() || bombs <= 0 || bombCooldown > 0) return false;
    const W = stage10FlightWorld();
    const cfg = C().bomb;
    bombs--; bombCooldown = cfg.cooldownSec; counters.bombsUsed++;
    const x = camera.position.x, z = camera.position.z;
    areaDamage(x, z, cfg.radius, cfg.damage, 'bombKills');
    if (cfg.clearsEnemyFire) {
        for (const b of W.enemyRounds) if (b.active) resetPoolItem(b);
        for (const m of W.missiles) if (m.active) resetPoolItem(m);
    }
    const flash = W.bombFlash;
    flash.active = true; flash.t = 0; flash.group.visible = true;
    flash.group.position.set(x, C().altitude + 30, z);
    for (let i = 0; i < 4; i++)
        spawnExplosion(x + randRange(-180, 180), C().altitude,
            z + randRange(-220, 60), randRange(1.4, 2.3), 'cannon');
    playSFX(sfxRocketExplode, 0.95);
    updateUI();
    return true;
}

function updateBombFlash(dt) {
    const W = stage10FlightWorld();
    const flash = W.bombFlash;
    if (!flash.active) return;
    flash.t += dt;
    const q = clamp(flash.t / Math.max(0.01, C().bomb.flashSec), 0, 1);
    flash.group.position.x = camera.position.x;
    flash.group.position.z = camera.position.z;
    flash.sheet.material.opacity = (1 - q) * 0.55;
    flash.ring.material.opacity = (1 - q) * 0.8;
    flash.ring.scale.setScalar(40 + q * C().bomb.radius);
    if (q >= 1) { flash.active = false; flash.group.visible = false; }
}

// ---------------------------------------------------------------- director ---

function updateSpawning(dt) {
    if (phase !== 'combat') return;
    const cfg = C().waves;
    const progress = clamp(elapsed / C().durationSec, 0, 1);
    waveT -= dt;
    if (waveT <= 0 && activeCount(stage10FlightWorld().enemies) < C().maxEnemies) {
        const wave = spawnWave();
        waveT = wave
            ? lerp(cfg.intervalStartSec, cfg.intervalMinSec, progress)
            : 0.6;
    }
    // Laut memakai kapal permukaan sebagai pengganti instalasi darat.
    groundT -= dt;
    if (groundT <= 0) {
        const g = C().ground;
        if (biome === 'ocean') {
            spawnEnemy(rand() < 0.62 ? 'shipB' : 'shipA');
        } else if (activeCount(stage10FlightWorld().groundTargets) < g.maxActive) {
            spawnGroundTarget();
        }
        groundT = lerp(g.intervalStartSec, g.intervalMinSec, progress);
    }
}

function updateMissionPhase(dt) {
    if (phase === 'combat' && elapsed >= C().durationSec) {
        phase = 'bossIntro';
        startBoss();
        return;
    }
    if (phase !== 'victory') return;
    // Sisa dt pada frame bomber MENYENTUH tanah masih milik animasi jatuh;
    // hitungan jeda finish baru mulai pada frame berikutnya.
    if (!victoryArmed) {
        victoryArmed = true;
        showStageMsg('MISSION COMPLETE — RETURNING TO ROUTE', 3000);
        return;
    }
    clearT += dt;
    if (clearT >= C().clearDelaySec && !transitionCommitted) {
        transitionCommitted = true; phase = 'complete';
        beginStageTransition(stage11Scene);
    }
}

function updateAircraftAnimation(dt) {
    const W = stage10FlightWorld(), plane = W.playerAircraft, data = plane.userData.transport;
    data.fanAngle += dt * 42;
    for (const engine of data.engines) {
        engine.fan.rotation.z = data.fanAngle;
        engine.exhaust.material.opacity = 0.48;
        engine.exhaust.material.emissiveIntensity = 0.78;
    }
    const k = 1 - Math.exp(-7 * dt);
    data.flightRig.rotation.x = lerp(data.flightRig.rotation.x, -moveVX * 0.003, k);
    data.flightRig.rotation.z = lerp(data.flightRig.rotation.z, moveVZ * 0.0015, k);
    plane.position.y = C().altitude + Math.sin(elapsed * 4.2) * 0.7;
    plane.visible = phase !== 'playerDestroyed' || playerDestroyedT < 1.65;
    if (playerHitT > 0) {
        playerHitT -= dt;
        plane.position.x += Math.sin(playerHitT * 120) * 1.8;
    }
}

function updateFlight(dt) {
    scrollZ -= C().scrollSpeed * dt;
    enemyFireGap = Math.max(0, enemyFireGap - dt);
    if (phase === 'combat') elapsed = Math.min(C().durationSec, elapsed + dt);
    const nextBiome = desiredBiome();
    if (nextBiome !== biome) setBiome(nextBiome, true, true);
    updateBiomeTransition(dt);
    updateTerrain(dt); updateSpawning(dt);
    updateEnemies(dt); updateGroundTargets(dt); updateBoss(dt);
    updatePlayerRounds(dt); updateEnemyProjectiles(dt);
    updateDrops(dt); updateExplosions(dt); updateBombFlash(dt);
    peakEnemyRounds = Math.max(peakEnemyRounds,
        activeCount(stage10FlightWorld().enemyRounds));
    peakMissiles = Math.max(peakMissiles, activeCount(stage10FlightWorld().missiles));
    if (phase === 'playerDestroyed') updatePlayerDestruction(dt);
    else { updateAircraftAnimation(dt); updateWingmen(dt); }
    updateMissionPhase(dt);
}

function powerStars() {
    const max = maxWeaponLevel();
    return '*'.repeat(weaponLevel) + '.'.repeat(Math.max(0, max - weaponLevel));
}

export const stage10Scene = {
    id: 'campaign-10', lightsKey: STAGE10_FLIGHT_KEY,
    camOffset: CAM_OFFSET,
    cameraUp: CAMERA_UP,
    exactTopDown: true,

    enter() {
        saveCampaignStage(10);
        ensureStage10FlightWorld(scene);
        setActiveCampaignWorldRoots(STAGE10_FLIGHT_KEY);
        setActiveStageLights(STAGE10_FLIGHT_KEY);
        applyLightPreset(scene, 'outdoor');
        enterCityEnv({ background: 0x7599a8, fogColor: 0x6f91a0, fogNear: 650, fogFar: 2600 });
        savedPlayer = { hp: player.hp, maxHp: player.maxHp };
        avatarGroup.visible = false;
        setAimCursorOverride(false);
        setCinematicActive(false);
        resetFlight();
        showStageMsg('STAGE 10 — AIR STRIKE | WASD FLY | GUNS FIRE AUTOMATICALLY | SPACE/RMB DROP BOMB', 6500);
        updateUI();
    },

    exit() {
        setCinematicActive(false);
        setAimCursorOverride(null);
        avatarGroup.visible = true;
        hideStageRadioDialogue();
        if (savedPlayer) {
            player.maxHp = savedPlayer.maxHp;
            player.hp = Math.max(1, Math.min(savedPlayer.maxHp, savedPlayer.hp));
        }
        savedPlayer = null;
        const W = stage10FlightWorld();
        W.playerAircraft.visible = false;
        W.boss.visible = false;
        for (const wm of W.wingmen) { wm.active = false; wm.group.visible = false; }
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill() { return 0; },
    updateMode(dt) { updateFlight(dt); updateUI(); },
    updatePlayerControl(dt) {
        if (!fighting()) { moveVX = moveVZ = 0; return true; }
        const dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
        const dz = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
        const len = Math.hypot(dx, dz) || 1;
        moveVX = dx / len * C().playerSpeed;
        moveVZ = dz / len * C().playerSpeed;
        const horizontal = horizontalFlightBounds();
        camera.position.x = clamp(camera.position.x + moveVX * dt,
            horizontal.x0, horizontal.x1);
        camera.position.z = clamp(camera.position.z + moveVZ * dt,
            scrollZ + C().arenaTopOffset, scrollZ + C().arenaBottomOffset);
        camera.position.y = C().altitude;
        const plane = stage10FlightWorld().playerAircraft;
        plane.position.x = camera.position.x; plane.position.z = camera.position.z;
        return true;
    },
    updatePlayerCombat(dt) {
        mgCooldown = Math.max(0, mgCooldown - dt);
        bombCooldown = Math.max(0, bombCooldown - dt);
        if (!fighting()) return true;
        // AUTO-FIRE: senjata utama menyala terus seperti referensi; LMB/Enter
        // tetap dihormati kalau autoFire dimatikan lewat config.
        if ((C().autoFire || mgMouse || mgKey) && mgCooldown <= 0) fireVolley();
        if (bombMouse || bombKey) { useBomb(); bombMouse = bombKey = false; }
        return true;
    },
    pointerInput(button, pressed) {
        if (button === 0) { mgMouse = pressed; return true; }
        if (button === 2) { if (pressed) bombMouse = true; return true; }
        return false;
    },
    keyInput(key, pressed, code) {
        if (key === 'enter') { mgKey = pressed; return true; }
        if (code === 'Space' || key === ' ') { if (pressed) bombKey = true; return true; }
        // Senjata/inventory manusia tidak aktif selama menerbangkan pesawat.
        if (key === '1' || key === '2' || key === '3' || key === 'q' || key === '4') return true;
        return false;
    },
    releaseSceneInputs() { mgMouse = mgKey = bombMouse = bombKey = false; },
    allowsPlayerAction(action) { return !['moveTarget', 'dodge', 'melee'].includes(action); },
    cameraAnchor() { return { x: S10_FLIGHT_X, y: 0, z: scrollZ }; },
    playerCollide() { },
    groundHeight: () => 0,
    bulletBlocked: () => false,
    blastBlocked: () => false,
    grenadeCollide() { },
    robotAI: () => ({ skip: true }),
    clampRobot() { },
    clampDropPos: (x, z) => [x, z, C().altitude],
    hudStatus() {
        if (phase === 'playerDestroyed') return 'AIRCRAFT DESTROYED';
        const kit = `PWR ${powerStars()} | BOMB x${bombs}`
            + (wingmanCount ? ` | ESCORT x${wingmanCount}` : '');
        if (phase === 'bossIntro' || phase === 'boss')
            return `BOSS ${Math.ceil(boss.hp / Math.max(1, boss.maxHp) * 100)}% | ${kit}`;
        if (phase === 'victory' || phase === 'complete')
            return `AIRSPACE CLEAR | FINISH ${Math.max(0, C().clearDelaySec - clearT).toFixed(1)}s`;
        return `${formatTime(C().durationSec - elapsed)} | ${kit}`;
    },
    radarLandmarks() { },
};

// ------------------------------------------------------------- debug hooks ---

export function stage10FlightSpawnEnemy(type, x, z) { return spawnEnemy(type, x, z); }
export function stage10FlightSpawnWave(opts) { return spawnWave(opts); }
export function stage10FlightSpawnGround(kind, x, z) { return spawnGroundTarget(kind, x, z); }
export function stage10FlightClearEnemies() {
    const W = stage10FlightWorld();
    for (const e of W.enemies) if (e.active) killEnemy(e, false);
    for (const g of W.groundTargets) if (g.active) killGroundTarget(g, false);
}
export function stage10FlightSetElapsed(sec) {
    elapsed = clamp(sec, 0, C().durationSec);
    setBiome(desiredBiome(), false);
}
export function stage10FlightDamageEnemy(index, damage) {
    const e = stage10FlightWorld().enemies[index];
    return e ? damageEnemy(e, damage) : false;
}
export function stage10FlightDamageGround(index, damage) {
    const g = stage10FlightWorld().groundTargets[index];
    return g ? damageGroundTarget(g, damage) : false;
}
export function stage10FlightDamageBoss(damage) { return damageBoss(damage); }
export function stage10FlightDamagePlayer(damage) { damagePlayer(damage); }
export function stage10FlightSetPlayerHp(hp) {
    flightHp = clamp(hp, 0, C().playerHp); player.hp = flightHp;
}
export function stage10FlightGrantDrop(type) {
    if (type === 'power') grantPower();
    else if (type === 'bomb') grantBomb();
    else if (type === 'wingman') grantWingman();
}
export function stage10FlightUseBomb() { return useBomb(); }

export function stage10Debug() {
    const W = stage10FlightWorld();
    const horizontal = horizontalFlightBounds();
    const flightFrame = aircraftFlightFrame();
    const def = levelDef();
    const weapon = {
        machineGun: {
            reference: 'assault-rifle-level-3', damage: volleyDamage(BASE_WEAPON_LEVEL),
            perRound: roundDamage(), rounds: volleyRounds(),
            fireDelaySec: machineDelay(), muzzles: 4,
            autoFire: C().autoFire === true,
            forward: true, spreadAngleDeg: C().spreadAngleDeg,
            range: 'screen-edge', screenTopOffset: playerScreenTopZ() - scrollZ,
        },
        cannon: {
            reference: 'grenade-launcher-level-3', damage: level3Damage('launcher'),
            radius: cannonRadius(), muzzles: 2, cannonEvery: def.cannonEvery,
            range: 'screen-edge', screenTopOffset: playerScreenTopZ() - scrollZ,
        },
    };
    return {
        phase, elapsed, durationSec: C().durationSec,
        spawning: phase === 'combat',
        clearDelaySec: C().clearDelaySec, clearT, transitionCommitted,
        biome, biomeTimeline: { java: [0, C().biomes.javaEndSec],
            ocean: [C().biomes.javaEndSec, C().biomes.oceanEndSec],
            kalimantan: [C().biomes.oceanEndSec, C().durationSec] },
        biomeTransition: {
            from: biomeTransition.from, to: biomeTransition.to,
            active: biomeTransition.active, durationSec: C().biomes.transitionSec,
            progress: biomeTransition.active
                ? clamp(biomeTransition.t / Math.max(0.01, C().biomes.transitionSec), 0, 1) : 1,
            weights: { ...biomeTransition.weights },
        },
        camera: { exactTopDown: true, playerScreenRegion: 'lower', offset: { ...CAM_OFFSET },
            up: { ...CAMERA_UP }, screenHalfWidth: playerScreenHalfWidth(),
            screenHalfDepth: playerScreenHalfDepth(), horizontalBounds: { ...horizontal } },
        player: { hp: flightHp, maxHp: C().playerHp, radius: C().playerRadius,
            visible: W.playerAircraft.visible, destroyedT: playerDestroyedT,
            visualScale: W.playerAircraft.userData.transport.flightVisual.scale,
            visualSpan: W.playerAircraft.userData.transport.flightVisual.span },
        power: {
            level: weaponLevel, maxLevel: maxWeaponLevel(),
            baseLevel: BASE_WEAPON_LEVEL,
            rounds: volleyRounds(), perRound: roundDamage(),
            volleyDamage: volleyDamage(),
            ladder: weaponLevels().map((_, i) => ({
                level: i + 1, rounds: volleyRounds(i + 1), volleyDamage: volleyDamage(i + 1),
            })),
        },
        bomb: { held: bombs, max: C().bomb.max, start: C().bomb.start,
            used: counters.bombsUsed, cooldown: bombCooldown,
            clearsEnemyFire: C().bomb.clearsEnemyFire === true },
        wingmen: { active: wingmanCount, max: C().wingman.max,
            shots: counters.wingmanShots,
            positions: W.wingmen.filter(w => w.active).map(w => ({
                side: w.side, x: w.group.position.x, z: w.group.position.z })) },
        waves: { number: waveNumber, spawned: counters.waves,
            formations: { ...counters.formations },
            available: FORMATION_NAMES.slice(),
            dwellSec: C().waves.dwellSec, sizeRange: [C().waves.sizeMin, C().waves.sizeMax] },
        weapon,
        enemies: { active: activeCount(W.enemies), config: JSON.parse(JSON.stringify(C().enemies)),
            spawned: { ...counters.spawned }, destroyed: { ...counters.destroyed },
            maxAircraftOnScreen: C().maxAircraftOnScreen,
            activeAircraft: activeAircraftCount(),
            aircraftOnScreen: aircraftOnScreenCount(flightFrame),
            flightFrame: { ...flightFrame },
            positions: W.enemies.filter(e => e.active).map(e => ({ index: e.index, type: e.type,
                x: e.group.position.x, z: e.group.position.z, radius: e.radius,
                path: e.path, entryFrom: e.entryFrom, formation: e.formation,
                wave: e.wave, holdX: e.holdX, holdZOffset: e.holdZOffset,
                carriesPower: !!e.carriesPower })) },
        ground: { active: activeCount(W.groundTargets), spawned: { ...counters.ground },
            maxActive: C().ground.maxActive,
            kinds: Object.keys(W.groundTargets[0].variants),
            positions: W.groundTargets.filter(g => g.active).map(g => ({
                index: g.index, type: g.type, x: g.group.position.x,
                z: g.group.position.z, hp: g.hp, radius: g.radius })) },
        boss: { active: boss.active, hp: boss.hp, maxHp: boss.maxHp,
            dying: boss.dying, enraged: boss.enraged, visible: W.boss.visible,
            x: boss.x, z: scrollZ + boss.zOffset, zOffset: boss.zOffset,
            entrySec: C().boss.entrySec, radius: C().boss.radius,
            turrets: W.boss.userData.boss.turrets.length },
        projectiles: { playerRounds: activeCount(W.playerRounds), cannonRounds: activeCount(W.cannonRounds),
            enemyRounds: activeCount(W.enemyRounds), missiles: activeCount(W.missiles),
            enemyRoundShape: 'orb' },
        enemyFire: {
            maxActiveRounds: FIRE().maxActiveRounds, maxActiveMissiles: FIRE().maxActiveMissiles,
            minGapSec: FIRE().minGapSec, gap: enemyFireGap,
            aimJitterDeg: FIRE().aimJitterDeg, bulletSpeed: C().enemyBulletSpeed,
            activeRounds: activeCount(W.enemyRounds), activeMissiles: activeCount(W.missiles),
            peakRounds: peakEnemyRounds, peakMissiles,
            blocked: counters.fireBlocked,
            shooterFraction: C().waves.shooterFraction,
            armedAircraft: W.enemies.filter(e => e.active && isAircraft(e) && e.armed !== false).length,
            aircraftOnScreen: aircraftOnScreenCount(flightFrame),
            missile: { homeSec: FIRE().missileHomeSec, hp: FIRE().missileHp,
                hitRadius: FIRE().missileHitRadius, shotDown: counters.missilesShotDown,
                homing: W.missiles.filter(m => m.active && m.homeLeft > 0).length },
        },
        drops: { active: activeCount(W.drops), money: counters.moneyDrops,
            health: counters.healthDrops, power: counters.powerDrops,
            bomb: counters.bombDrops, wingman: counters.wingDrops,
            pickups: counters.pickups, powerUps: counters.powerUps,
            healthHeal: C().playerHp * C().healthHealFraction, instant: true },
        animations: { playerMovement: true, enemyAircraftMovement: true, shipMovement: true,
            groundTargetMovement: true, bossMovement: true,
            playerExplosion: counters.explosions.player > 0,
            aircraftExplosions: counters.explosions.aircraft,
            shipExplosions: counters.explosions.ships,
            groundExplosions: counters.explosions.ground,
            bossExplosions: counters.explosions.boss,
            bombFlash: W.bombFlash.active,
            pickupFlights: counters.pickups },
        counters: JSON.parse(JSON.stringify(counters)),
        world: stage10FlightWorldDebug(),
    };
}
