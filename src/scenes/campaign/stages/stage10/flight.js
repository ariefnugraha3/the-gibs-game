// Stage 10 — top-down air battle, dibentuk mengikuti referensi user
// (Air Strike 1944): pesawat player mengunci di bagian bawah layar dan menembak
// OTOMATIS lurus ke depan; musuh datang sebagai FORMASI dari atas; instalasi
// darat ikut menggulung naik; power-up bintang menaikkan pola tembakan; BOM
// membersihkan layar; dan misi ditutup satu bomber boss. Panjang misi TIDAK
// ditulis di sini — ia `flight.durationSec` di config dan pernah berubah
// (8 -> 6 menit), jadi menyebut angkanya di komentar hanya bikin basi.

import { CFG } from '../../../../core/config.js';
import {
    player, keys, stats, addScore, godMode, setCinematicActive,
} from '../../../../core/state.js';
import { scene, camera, viewCam, addCamShake } from '../../../../core/renderer.js';
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
    playSFX, sfxTankMG, sfxRobotShot, sfxRocketShot, sfxRocketExplode,
    sfxExplode, sfxPickup, sfxHeal, sfxHit,
} from '../../../../utils/sfx.js';
import {
    STAGE10_FLIGHT_KEY, S10_FLIGHT_X, S10_FLIGHT_START_Z, GROUND_KINDS, S10_CAM_HEIGHT,
    S10_FLIGHT_BOUNDS,
    ensureStage10FlightWorld, stage10FlightWorld, stage10FlightWorldDebug,
    setCoastShoreline,
} from './flightWorld.js';

const CAM_OFFSET = Object.freeze({ x: 0, y: S10_CAM_HEIGHT, z: 0 });
const CAMERA_UP = Object.freeze({ x: 0, y: 0, z: -1 });
const TILE_LENGTH = 340;
const PLAYER_EXPLOSION_SEC = 2.7;
// Suara MG pesawat = klip rentetan tank (~0.24 dtk). Kalau kadens tembak
// disetel jauh lebih cepat dari ini, klipnya TIDAK diulang tiap volley —
// hasilnya tetap rentetan rapat, bukan puluhan salinan yang saling menimpa.
const MG_SFX_MIN_GAP = 0.1;

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
let mgCooldown = 0, bombCooldown = 0, mgSfxCooldown = 0;
let moveVX = 0, moveVZ = 0;
let lastBiomeMessage = '';
let bombs = 0;
let waveT = 0, waveNumber = 0, lastFormation = '';
let enemyFireGap = 0, peakEnemyRounds = 0, peakMissiles = 0;
let groundT = 0;
let nextWaveEntrySide = -1;
const boss = {
    active: false, hp: 0, maxHp: 0, x: 0, zOffset: 0, t: 0, entryT: 0,
    gunCd: 0, missileCd: 0, missileLeft: 0, dir: 1, hitFlash: 0,
    dying: false, deathT: 0, enraged: false,
};
const playerImpact = {
    active: false, kind: 'none', t: 0, duration: 0,
    dirX: 0, dirZ: 0, rollSign: 1, strength: 0,
    offsetX: 0, offsetY: 0, offsetZ: 0,
    roll: 0, pitch: 0, yaw: 0,
};

const counters = {
    spawned: { airC: 0, airB: 0, airA: 0, shipB: 0, shipA: 0 },
    ground: { turret: 0, tank: 0, bunker: 0, depot: 0 },
    destroyed: { aircraft: 0, ships: 0, ground: 0, boss: 0 },
    waves: 0, formations: {},
    playerVolleys: 0, mgSfx: 0,
    enemyRounds: 0, missiles: 0, bombsUsed: 0,
    machineGunHits: 0, bombKills: 0,
    moneyDrops: 0, healthDrops: 0, bombDrops: 0,
    pickups: 0, rams: 0, missilesShotDown: 0, fireBlocked: 0, projectilesCulled: 0,
    playerImpacts: { bullet: 0, missile: 0, collision: 0 },
    surfaceReconciled: { groundToShip: 0, shipToGround: 0, cancelled: 0 },
    explosions: { player: 0, aircraft: 0, ships: 0, ground: 0, blast: 0, boss: 0 },
};

function C() { return CFG.campaign.stage10.flight; }
function EC(type) { return C().enemies[type]; }
function FIRE() { return C().enemyFire; }
// KADENS PUN MILIK STAGE INI (2026-08-28, permintaan user "bebaskan semua
// ketergantungan dari gameplay.json"): dulu diambil dari Assault Rifle, jadi
// menyetel senapan darat Major Gibran diam-diam mengubah DPS pesawat.
function machineDelay() { return C().machineGunDelaySec; }
// SENJATA PESAWAT ITU TETAP — TANPA TANGGA LEVEL (2026-08-28, permintaan user
// "tidak usah ada weapon levels, bikin damagenya tetap saja; terlalu berlebihan
// untuk dipakai hanya di 1 stage"). `flight.machineGunDamage` adalah damage PER
// BUTIR dan berdiri sendiri — tidak diturunkan dari Assault Rifle level 3, jadi
// menyetel senjata darat Major Gibran tidak menyentuh Stage 10 — sementara pola
// tembaknya dipatok `machineGunPairs` / `machineGunAngledPairs` / `cannonEvery`.
function roundDamage() { return C().machineGunDamage; }
function volleyRounds() {
    return C().machineGunPairs * 2 + C().machineGunAngledPairs * 2;
}
function volleyDamage() { return roundDamage() * volleyRounds(); }
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
// SATU PREDIKAT LAYAR untuk semua (2026-08-28, laporan user "pesawat musuh yang
// belum masuk ke layar sudah bisa ditembak jatuh"): bingkai kamera nyata, bukan
// tebakan. Dipakai untuk membuang proyektil DAN untuk mengurung damage area.
// Uji ELIPS terhadap siluet pesawat player. Lingkaran radius `playerRadius`
// hanya menutupi 56% panjang badan, jadi ekor tidak pernah bisa tertembak —
// itulah yang dilaporkan user. `pad` menebalkan kedua sumbu dengan jumlah yang
// sama (radius proyektilnya sendiri), bukan menskalakan elipsnya, supaya peluru
// gemuk tidak jadi lebih mudah kena di sisi panjang daripada di sisi pendek.
function hitsPlayer(x, z, px, pz, pad = 0) {
    const h = stage10FlightWorld().playerHit;
    const dx = (x - px) / (h.halfSpan + pad);
    const dz = (z - pz) / (h.halfLength + pad);
    return dx * dx + dz * dz <= 1;
}

function onFlightScreen(x, z, margin = 0) {
    const f = aircraftFlightFrame();
    return x >= f.left - margin && x <= f.right + margin
        && z >= f.top - margin && z <= f.bottom + margin;
}

// Proyektil dibuang begitu meninggalkan layar — tapi hanya SESUDAH ia sempat
// masuk, karena musuh di tepi (turret darat, pesawat yang baru turun) menembak
// dari sedikit di luar bingkai dan pelurunya harus tetap sempat masuk.
function cullOffScreen(slot) {
    const p = slot.mesh.position;
    const margin = C().projectileCullMargin;
    if (onFlightScreen(p.x, p.z, margin)) { slot.entered = true; return false; }
    if (!slot.entered) return false;
    resetPoolItem(slot); counters.projectilesCulled++;
    return true;
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
function deathNoise(enemy, salt) {
    let n = Math.imul((enemy.index + 1) ^ 0x51f15e, 2246822519)
        ^ Math.imul((salt + 11) ^ (enemy.wave || 0), 3266489917);
    n ^= n >>> 15; n = Math.imul(n, 2246822519); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}
function lerp(a, b, k) { return a + (b - a) * k; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smooth01(v) { const q = clamp(v, 0, 1); return q * q * (3 - 2 * q); }
function angleDelta(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
function dampAngle(from, to, rate, dt) {
    return from + angleDelta(from, to) * (1 - Math.exp(-rate * dt));
}
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
    if ('destroying' in slot) slot.destroying = false;
    if (slot.mesh) slot.mesh.visible = false;
    if (slot.group) slot.group.visible = false;
}

function clearPools() {
    const W = stage10FlightWorld();
    for (const enemy of W.enemies) {
        resetPoolItem(enemy);
        for (const v of Object.values(enemy.variants)) v.visible = false;
        enemy.damageFx.group.visible = false;
    }
    for (const g of W.groundTargets) {
        resetPoolItem(g);
        for (const v of Object.values(g.variants)) v.visible = false;
        g.damageFx.group.visible = false;
    }
    for (const list of [W.playerRounds, W.enemyRounds, W.missiles,
        W.drops, W.explosions]) for (const slot of list) resetPoolItem(slot);
    W.bombFlash.group.visible = false; W.bombFlash.active = false;
    W.playerImpactFx.group.visible = false;
    W.boss.visible = false;
}

function resetCounters() {
    for (const k in counters.spawned) counters.spawned[k] = 0;
    for (const k in counters.ground) counters.ground[k] = 0;
    for (const k in counters.destroyed) counters.destroyed[k] = 0;
    counters.waves = 0; counters.formations = {};
    counters.playerVolleys = counters.mgSfx = 0;
    counters.enemyRounds = counters.missiles = counters.bombsUsed = 0;
    counters.machineGunHits = counters.bombKills = 0;
    counters.moneyDrops = counters.healthDrops = 0;
    counters.bombDrops = 0;
    counters.pickups = counters.rams = 0;
    counters.missilesShotDown = 0; counters.fireBlocked = 0;
    counters.projectilesCulled = 0;
    counters.playerImpacts.bullet = 0;
    counters.playerImpacts.missile = 0;
    counters.playerImpacts.collision = 0;
    counters.surfaceReconciled.groundToShip = 0;
    counters.surfaceReconciled.shipToGround = 0;
    counters.surfaceReconciled.cancelled = 0;
    for (const k in counters.explosions) counters.explosions[k] = 0;
}

// ----------------------------------------------------------------- biome ---

// PETA, BUKAN JAM: batas biome adalah KOORDINAT DUNIA tetap, diturunkan dari
// detik yang sama seperti dulu (jarak = detik x scrollSpeed). Karena itu daratan,
// pantai dan laut benar-benar berdiri di tempatnya masing-masing dan dilewati,
// bukan di-fade di tempat.
function biomeBoundaryZ() {
    const speed = C().scrollSpeed;
    return {
        javaOcean: S10_FLIGHT_START_Z - C().biomes.javaEndSec * speed,
        oceanKalimantan: S10_FLIGHT_START_Z - C().biomes.oceanEndSec * speed,
    };
}
function biomeAtZ(z) {
    const b = biomeBoundaryZ();
    if (z > b.javaOcean) return 'java';
    if (z > b.oceanKalimantan) return 'ocean';
    return 'kalimantan';
}
function desiredBiome() { return biomeAtZ(scrollZ); }

// `biome` sekarang hanya BACAAN posisi player, dipakai untuk tabel spawn dan
// papan status. Tidak ada lagi keadaan peralihan yang perlu dianimasikan.
function setBiome(next, announce = true) {
    biome = next;
    const label = biome === 'java' ? 'JAVA AIRSPACE'
        : biome === 'ocean' ? 'JAVA SEA CORRIDOR' : 'KALIMANTAN AIRSPACE';
    if (announce && lastBiomeMessage !== label) showStageMsg(label, 2800);
    lastBiomeMessage = label;
}

// Pilih penampilan satu tile dari POSISI DUNIANYA. Tile yang rentangnya memuat
// sebuah batas mendapat varian pantai, dengan garis air tepat di batas itu.
// Rig pantai hanya ada SATU salinan per arah (lihat flightWorld). Tile yang
// memuat batas "meminjamnya": rig dipindahkan ke posisi tile itu, dan tile yang
// tidak lagi memegangnya melepasnya kembali.
function dressTerrainTile(tile) {
    const W = stage10FlightWorld();
    const half = TILE_LENGTH * 0.5;
    const z = tile.group.position.z;
    const b = biomeBoundaryZ();
    let key = biomeAtZ(z), shore = null, coastKey = null;
    if (b.javaOcean <= z + half && b.javaOcean >= z - half) {
        coastKey = 'coastOut'; key = coastKey;
    } else if (b.oceanKalimantan <= z + half && b.oceanKalimantan >= z - half) {
        coastKey = 'coastIn'; key = coastKey;
    }
    // Lepas rig yang tadinya dipegang tile ini kalau ia bukan lagi tile pantai.
    for (const [name, rig] of Object.entries(W.coastRigs)) {
        if (rig.userData.ownerTile === tile.index && name !== coastKey) {
            rig.userData.ownerTile = -1;
            rig.visible = false;
        }
    }
    if (coastKey) {
        const rig = W.coastRigs[coastKey];
        const boundary = coastKey === 'coastOut' ? b.javaOcean : b.oceanKalimantan;
        rig.userData.ownerTile = tile.index;
        rig.position.set(tile.group.position.x, 0, z);
        rig.visible = true;
        shore = setCoastShoreline(rig, boundary - z);
    }
    // Tile pantai tidak menampilkan biome murni apa pun — rig bersama yang
    // menutupi seluruh rentangnya.
    for (const [name, group] of Object.entries(tile.biomes))
        group.visible = !coastKey && name === key;
    tile.dressed = key;
    tile.shore = shore;
    return key;
}

// ------------------------------------------------------------------ reset ---

function resetWorldPositions() {
    const W = stage10FlightWorld();
    for (let i = 0; i < W.terrainTiles.length; i++) {
        W.terrainTiles[i].group.position.set(S10_FLIGHT_X, 0, (2 - i) * TILE_LENGTH);
        dressTerrainTile(W.terrainTiles[i]);
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
    playerDestroyedT = 0; playerExplosionPulse = 0;
    playerImpact.active = false; playerImpact.kind = 'none'; playerImpact.t = 0;
    playerImpact.offsetX = playerImpact.offsetY = playerImpact.offsetZ = 0;
    playerImpact.roll = playerImpact.pitch = playerImpact.yaw = 0;
    rngState = 0x5a10f17; lastBiomeMessage = '';
    mgMouse = mgKey = bombMouse = bombKey = false;
    mgCooldown = bombCooldown = mgSfxCooldown = 0;
    moveVX = moveVZ = 0;
    bombs = C().bomb.start;
    waveT = 1.2; waveNumber = 0; lastFormation = ''; nextWaveEntrySide = -1;
    enemyFireGap = 0; peakEnemyRounds = 0; peakMissiles = 0;
    groundT = C().ground.intervalStartSec * 0.55;
    boss.active = false; boss.dying = false; boss.deathT = 0; boss.enraged = false;
    boss.hp = boss.maxHp = C().boss.hp; boss.t = 0; boss.entryT = 0;
    boss.gunCd = boss.missileCd = 0; boss.missileLeft = 0; boss.dir = 1; boss.hitFlash = 0;
    flightHp = C().playerHp;
    player.maxHp = C().playerHp;
    player.hp = flightHp;
    clearPools(); resetCounters(); resetWorldPositions();
    W.playerImpactFx.group.visible = false;
    setBiome(biomeAtZ(scrollZ), false);
    W.playerAircraft.visible = true;
    W.playerAircraft.position.set(S10_FLIGHT_X, C().altitude,
        scrollZ + C().arenaBottomOffset * 0.62);
    W.playerAircraft.rotation.set(0, Math.PI * 0.5, 0);
    const pdata = W.playerAircraft.userData.transport;
    pdata.flightRig.rotation.set(0, 0, 0);
    pdata.fanAngle = 0;
    for (const engine of pdata.engines) engine.fan.rotation.z = 0;
    camera.position.set(W.playerAircraft.position.x, C().altitude,
        W.playerAircraft.position.z);
}

function updateTerrain(dt) {
    const W = stage10FlightWorld();
    const cycle = W.terrainTiles.length * TILE_LENGTH;
    for (const tile of W.terrainTiles) {
        // Sebuah tile hanya boleh BERGANTI RUPA saat ia berpindah tempat, yaitu
        // ketika sudah jauh di luar layar — jadi daratan/pantai/laut tidak pernah
        // terlihat berubah di depan mata.
        let moved = false;
        while (tile.group.position.z > scrollZ + TILE_LENGTH * 2.5) {
            tile.group.position.z -= cycle; moved = true;
        }
        while (tile.group.position.z < scrollZ - cycle + TILE_LENGTH * 1.5) {
            tile.group.position.z += cycle; moved = true;
        }
        if (moved) dressTerrainTile(tile);
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
}

// ------------------------------------------------------- musuh: kelahiran ---

function enemyVariant(slot, type) {
    for (const [name, model] of Object.entries(slot.variants)) model.visible = name === type;
}

function restoreBreakaways(poses) {
    for (const pose of poses) {
        pose.part.position.set(pose.x, pose.y, pose.z);
        pose.part.rotation.set(pose.rx, pose.ry, pose.rz);
        pose.part.visible = true;
    }
}

function resetTargetDamageFx(slot) {
    const fx = slot.damageFx;
    fx.group.visible = false; fx.group.position.set(0, 0, 0); fx.group.rotation.set(0, 0, 0);
    for (const fire of fx.fires) { fire.visible = true; fire.scale.setScalar(0.1); }
    for (let i = 0; i < fx.smoke.length; i++) {
        const smoke = fx.smoke[i]; smoke.visible = true;
        smoke.position.set(0, 0, -4 - i * 3.4); smoke.scale.setScalar(0.1);
    }
    for (const spark of fx.sparks) {
        spark.visible = true; spark.position.set(0, 0, 0); spark.scale.setScalar(1);
    }
}

function restoreAircraftRig(slot) {
    if (!isAircraft(slot)) return;
    // Slot pool bisa sebelumnya memegang kapal; jangan biarkan metadata rig
    // kapal bocor ke read-out/animasi saat slot kembali menjadi pesawat.
    slot.shipRig = null; slot.shipMuzzleT = 0;
    slot.turnT = 0; slot.turnIntensity = 0; slot.turnDir = 0;
    slot.turnStartYaw = 0;
    const model = slot.variants[slot.type];
    const rig = model.userData.rig;
    rig.core.position.set(0, 0, 0); rig.core.rotation.set(0, 0, 0);
    restoreBreakaways(rig.breakaways);
    for (const control of rig.controls) {
        control.rotation.x = 0;
        control.rotation.z = 0;
    }
    for (const engine of rig.engines) {
        engine.fan.rotation.z = 0;
        engine.exhaust.scale.set(1, 1, 1);
        engine.exhaust.visible = true;
    }
    for (const vapor of rig.turnVapors) {
        vapor.visible = false;
        vapor.scale.set(1, 1, 1);
    }
    const fx = slot.damageFx;
    fx.group.visible = false; fx.group.position.set(0, 0, 0); fx.group.rotation.set(0, 0, 0);
    for (const fire of fx.fires) { fire.visible = true; fire.scale.setScalar(0.1); }
    for (let i = 0; i < fx.smoke.length; i++) {
        const smoke = fx.smoke[i]; smoke.visible = true;
        smoke.position.set(0, 0, -4 - i * 3.4); smoke.scale.setScalar(0.1);
    }
    for (const spark of fx.sparks) {
        spark.visible = true; spark.position.set(0, 0, 0); spark.scale.setScalar(1);
    }
}

function restoreShipRig(slot) {
    if (!slot.type.startsWith('ship')) return;
    const rig = slot.variants[slot.type].userData.shipRig;
    const model = slot.variants[slot.type];
    slot.shipRig = rig;
    slot.shipMuzzleT = 0; slot.shipMuzzleIndex = 0; slot.shipMissileIndex = 0;
    rig.mainTurret.rotation.set(0, 0, 0);
    rig.ciws.rotation.set(0, 0, 0);
    rig.gunMount.rotation.set(0, 0, 0);
    rig.gunMount.position.z = rig.recoilBaseZ;
    rig.radar.rotation.set(0, 0, 0);
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
    restoreBreakaways(rig.breakaways);
    for (const flash of rig.muzzleFlashes) {
        flash.visible = false;
        flash.scale.setScalar(0.1);
    }
    for (const wake of rig.wakes) {
        wake.visible = true;
        wake.scale.set(1, 1, 1);
    }
    resetTargetDamageFx(slot);
}

function initEnemySlot(slot, type) {
    const cfg = EC(type);
    const W = stage10FlightWorld();
    slot.active = true; slot.destroying = false; slot.type = type; slot.hp = cfg.hp; slot.maxHp = cfg.hp;
    slot.t = rand() * 6.28; slot.fireCd = 0.7 + rand() * 1.1;
    slot.burstLeft = cfg.burstShots || 0; slot.hitFlash = 0;
    // Slot pool dipakai ulang: `armed` WAJIB dikembalikan ke default di sini.
    // Tanpa ini sebuah slot yang pernah jadi anggota formasi tak bersenjata
    // akan bisu selamanya, dan tekanan tembakan menyusut diam-diam.
    slot.armed = true; slot.carriesUpgrade = false;
    slot.enginePhase = rand() * Math.PI * 2;
    slot.surfaceEntered = false; slot.surfaceBiome = null;
    slot.heading = 0;
    slot.radius = type.startsWith('air')
        ? W.playerAircraft.userData.transport.flightVisual.enemyAircraftHitRadius
        : W.surfaceVisual.hitRadius[type];
    slot.group.visible = true; slot.group.scale.setScalar(1);
    enemyVariant(slot, type);
    if (type.startsWith('air')) restoreAircraftRig(slot);
    else {
        slot.damageFx.group.visible = false;
        restoreShipRig(slot);
    }
    counters.spawned[type]++;
}

// Satu pesawat musuh, dipakai oleh spawner formasi DAN oleh debug/smoke.
function spawnEnemy(type, x = null, z = null) {
    const W = stage10FlightWorld();
    const aircraft = type.startsWith('air');
    if (aircraft && x == null && z == null
        && activeAircraftCount() >= C().maxAircraftOnScreen) return null;
    // Slot terspesialisasi: pesawat dan kapal punya jatahnya sendiri.
    const family = aircraft ? 'air' : 'ship';
    const slot = W.enemies.find(e => !e.active && !e.destroying && e.family === family);
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
        slot.surfaceBiome = biomeAtZ(sz);
        slot.surfaceEntered = onFlightScreen(sx, sz, slot.radius);
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
        const e = W.enemies.find(s => !s.active && !s.destroying && s.family === 'air');
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
        const initialYaw = entry === 'top' ? 0
            : Math.atan2(e.crossDir * 1.35, 0.18);
        e.heading = initialYaw;
        e.group.rotation.set(0, initialYaw, 0);
        // Pemimpin formasi membawa power-up: satu-satunya sumber bintang yang
        // dijamin, persis peran "pesawat berwarna beda" di referensi.
        e.carriesUpgrade = born.length === 0 && rand() < cfg.upgradeDropChance;
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

function groundKindsForBiome(routeBiome = biome) {
    if (routeBiome === 'ocean') return [];
    return routeBiome === 'java'
        ? ['turret', 'tank', 'bunker', 'depot']
        : ['turret', 'tank', 'bunker'];
}

function spawnGroundTarget(kind = null, x = null, z = null) {
    const W = stage10FlightWorld();
    const frame = aircraftFlightFrame();
    const gz = z == null
        ? playerScreenTopZ() - C().ground.leadMargin - rand() * 160 : z;
    const routeBiome = biomeAtZ(gz);
    const kinds = groundKindsForBiome(routeBiome);
    if (!kinds.length || (kind && !kinds.includes(kind))) return null;
    const type = kind || (kinds.length ? kinds[Math.floor(rand() * kinds.length)] : null);
    if (!type) return null;
    // Tiap slot darat hanya membawa satu jenis. Kalau jatah jenis itu penuh,
    // pakai jenis lain yang masih punya slot — lebih baik instalasi berbeda
    // daripada tidak ada instalasi sama sekali.
    let slot = W.groundTargets.find(g => !g.active && !g.destroying && g.kind === type);
    let chosen = type;
    if (!slot) {
        slot = W.groundTargets.find(g => !g.active && !g.destroying && kinds.includes(g.kind));
        if (slot) chosen = slot.kind;
    }
    if (!slot) return null;
    const cfg = EC(chosen);
    slot.active = true; slot.destroying = false;
    slot.type = chosen; slot.hp = cfg.hp; slot.maxHp = cfg.hp;
    slot.radius = W.groundVisual.hitRadius[chosen]; slot.hitFlash = 0; slot.t = rand() * 6.28;
    slot.fireCd = 0.8 + rand() * 1.4; slot.burstLeft = cfg.burstShots || 0;
    slot.speed = cfg.speed || 0;
    slot.drift = rand() < 0.5 ? -1 : 1;
    slot.group.visible = true; slot.group.scale.setScalar(1);
    for (const [name, model] of Object.entries(slot.variants)) model.visible = name === chosen;
    slot.turret = slot.variants[chosen].userData.turret || null;
    slot.rig = slot.variants[chosen].userData.groundRig || null;
    slot.destructionRig = slot.variants[chosen].userData.destructionRig;
    const model = slot.variants[chosen];
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
    restoreBreakaways(slot.destructionRig.breakaways);
    resetTargetDamageFx(slot);
    slot.muzzleT = 0; slot.muzzleIndex = 0;
    if (slot.rig) {
        slot.rig.traverse.rotation.set(0, 0, 0);
        slot.rig.elevation.rotation.set(0, 0, 0);
        slot.rig.elevation.position.z = slot.rig.recoilBaseZ;
        if (slot.rig.radar) slot.rig.radar.rotation.set(0, 0, 0);
        for (const flash of slot.rig.muzzleFlashes) {
            flash.visible = false; flash.scale.setScalar(0.1);
        }
    }
    // Instalasi yang kini jauh lebih besar tidak boleh saling tumpang tindih;
    // beberapa percobaan sudah cukup karena jalur daratnya lebar.
    let gx = x;
    for (let tries = 0; tries < 8; tries++) {
        if (x == null) gx = frame.cx + randRange(-1, 1) * frame.laneHalfWidth * 0.9;
        let clear = true;
        for (const other of W.groundTargets) {
            if ((!other.active && !other.destroying) || other === slot) continue;
            if (Math.hypot(gx - other.group.position.x, gz - other.group.position.z)
                < slot.radius + other.radius) { clear = false; break; }
        }
        if (clear || (x != null && z != null)) break;
    }
    slot.group.position.set(gx, 0, gz);
    slot.group.rotation.set(0, rand() * 0.4 - 0.2, 0);
    slot.surfaceBiome = biomeAtZ(gz);
    slot.surfaceEntered = onFlightScreen(gx, gz, slot.radius);
    counters.ground[chosen]++;
    return slot;
}

function releasePendingSurface(slot) {
    resetPoolItem(slot);
    for (const v of Object.values(slot.variants)) v.visible = false;
    slot.surfaceEntered = false; slot.surfaceBiome = null;
}

function spawnScheduledSurface() {
    const W = stage10FlightWorld();
    const frame = aircraftFlightFrame();
    // Titik dipilih SEKALI, lalu jenis target diturunkan dari geografi titik itu.
    // Jangan memilih dari `biome` player: bagian atas layar bisa sudah melewati
    // garis pantai sementara player masih berada di biome sebelumnya.
    const z = playerScreenTopZ() - C().ground.leadMargin - rand() * 160;
    const routeBiome = biomeAtZ(z);
    if (routeBiome === 'ocean') {
        const x = frame.cx + randRange(-1, 1) * frame.laneHalfWidth * 0.82;
        return spawnEnemy(rand() < 0.62 ? 'shipB' : 'shipA', x, z);
    }
    if (activeCount(W.groundTargets) >= C().ground.maxActive) return null;
    return spawnGroundTarget(null, null, z);
}

// Target yang belum pernah menyentuh frame boleh diganti tanpa pop visual.
// Begitu satu piksel siluetnya masuk layar, identitasnya dikunci sampai keluar.
function reconcilePendingSurfaceTargets() {
    const W = stage10FlightWorld();
    const pendingShips = [], pendingGround = [];
    for (const enemy of W.enemies) {
        if (!enemy.active || enemy.destroying || !enemy.type?.startsWith('ship')) continue;
        const pos = enemy.group.position;
        if (onFlightScreen(pos.x, pos.z, enemy.radius)) enemy.surfaceEntered = true;
        if (!enemy.surfaceEntered && biomeAtZ(pos.z) !== 'ocean') pendingShips.push(enemy);
    }
    for (const ground of W.groundTargets) {
        if (!ground.active || ground.destroying) continue;
        const pos = ground.group.position;
        if (onFlightScreen(pos.x, pos.z, ground.radius)) ground.surfaceEntered = true;
        if (!ground.surfaceEntered && biomeAtZ(pos.z) === 'ocean') pendingGround.push(ground);
    }
    for (const ship of pendingShips) {
        const x = ship.group.position.x, z = ship.group.position.z;
        releasePendingSurface(ship);
        const replacement = spawnGroundTarget(null, x, z);
        if (replacement) counters.surfaceReconciled.shipToGround++;
        else counters.surfaceReconciled.cancelled++;
    }
    for (const ground of pendingGround) {
        const x = ground.group.position.x, z = ground.group.position.z;
        releasePendingSurface(ground);
        const replacement = spawnEnemy(rand() < 0.62 ? 'shipB' : 'shipA', x, z);
        if (replacement) counters.surfaceReconciled.groundToShip++;
        else counters.surfaceReconciled.cancelled++;
    }
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
    // Jarak maksimum adalah tuning Stage 10 yang eksplisit. `life` hanya
    // backstop turunan agar perubahan speed tidak diam-diam mengubah range.
    p.rangeLeft = C().enemyBulletRange;
    p.life = C().enemyBulletRange / Math.max(1, C().enemyBulletSpeed);
    p.damage = damage;
    p.entered = onFlightScreen(x, z);
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
    p.life = FIRE().missileLifeSec; p.damage = damage;
    // Rudal hanya MENGEJAR selama jendela pendek, lalu lurus — sesudah itu ia
    // dihindari dengan bergerak, bukan dengan menebak. Ia juga bisa ditembak.
    p.homeLeft = FIRE().missileHomeSec;
    p.hp = FIRE().missileHp;
    p.radius = W.missileVisual.hitRadius;
    p.entered = onFlightScreen(x, z);
    p.mesh.rotation.y = a;
    counters.missiles++; playSFX(sfxRocketShot, 0.38);
    return true;
}

function spawnDrop(type, value, x, _y, z) {
    const W = stage10FlightWorld();
    // Pool penuh TIDAK BOLEH berarti item hilang diam-diam: pertempuran padat
    // bisa mengisi seluruh slot dengan uang yang belum sempat dipungut, dan
    // bom yang gagal lahir terbaca sebagai bug. Slot
    // TERTUA yang belum dipungut didaur ulang, mengikuti pola spawnExplosion.
    let p = W.drops.find(d => !d.active);
    if (!p) {
        for (const d of W.drops)
            if (!d.collecting && (!p || d.age > p.age)) p = d;
        if (!p) p = W.drops.reduce((a, b) => (a.age || 0) > (b.age || 0) ? a : b);
    }
    if (!p) return false;
    p.active = true; p.group.visible = true; p.type = type; p.value = value;
    // ITEM IKUT TERBANG (2026-08-28, laporan user): uang/heal dulu tergeletak di
    // tanah, sehingga dari kamera setinggi 900 unit ia tampak jauh lebih kecil
    // daripada segala sesuatu yang bertempur di ketinggian. Sekarang setiap item
    // naik ke `altitude` yang sama dengan pesawat, apa pun sumbernya.
    p.collecting = false; p.collectT = 0; p.age = 0; p.baseY = C().altitude;
    p.group.position.set(x, p.baseY, z); p.group.scale.setScalar(1);
    for (const [name, model] of Object.entries(p.variants)) model.visible = name === type;
    if (type === 'money') counters.moneyDrops++;
    else if (type === 'health') counters.healthDrops++;
    else if (type === 'bomb') counters.bombDrops++;
    return true;
}

function rollDrop(cfgType, x, y, z, carriesUpgrade = false) {
    if (carriesUpgrade) {
        // Hadiah pemimpin gelombang selalu berguna: bom dulu, dan kalau stok bom
        // sudah penuh ia jadi uang dobel — tidak pernah pickup kosong.
        if (bombs < C().bomb.max) return spawnDrop('bomb', 1, x, y, z);
        return spawnDrop('money', (cfgType.money || 40) * 2, x, y, z);
    }
    const r = rand();
    if (r < cfgType.moneyChance) spawnDrop('money', cfgType.money, x, y, z);
    else if (r < cfgType.moneyChance + cfgType.healthChance)
        spawnDrop('health', C().healthHealFraction * C().playerHp, x, y, z);
}

function spawnExplosion(x, y, z, size, kind, visualSeed = null) {
    const W = stage10FlightWorld();
    let seededState = visualSeed == null ? 0 : visualSeed >>> 0;
    const visualRand = visualSeed == null ? rand : () => {
        seededState = (Math.imul(seededState, 1664525) + 1013904223) >>> 0;
        return seededState / 4294967296;
    };
    let p = W.explosions.find(e => !e.active);
    if (!p) p = W.explosions.reduce((a, b) => (a.t || 0) > (b.t || 0) ? a : b);
    p.active = true; p.group.visible = true; p.group.position.set(x, y, z);
    p.group.scale.setScalar(1); p.t = 0;
    p.duration = kind === 'player' || kind === 'boss' ? 2.2 : 1.15;
    p.size = size; p.kind = kind;
    p.core.scale.setScalar(0.1); p.fire.scale.setScalar(0.1); p.ring.scale.setScalar(0.1);
    for (let i = 0; i < p.debris.length; i++) {
        const d = p.debris[i], a = i / p.debris.length * Math.PI * 2 + visualRand() * 0.35;
        d.position.set(0, 0, 0);
        d.rotation.set(visualRand() * 3, visualRand() * 3, visualRand() * 3);
        d.visible = true;
        d.userData.vx = Math.cos(a) * size * (8 + visualRand() * 14);
        d.userData.vz = Math.sin(a) * size * (8 + visualRand() * 14);
        d.userData.vy = 10 + visualRand() * 18;
    }
    for (let i = 0; i < p.smoke.length; i++) {
        p.smoke[i].position.set((visualRand() - 0.5) * size * 3, i * 1.8,
            (visualRand() - 0.5) * size * 3);
        p.smoke[i].scale.setScalar(0.1); p.smoke[i].visible = true;
    }
    if (kind in counters.explosions) counters.explosions[kind]++;
    playSFX(kind === 'blast' ? sfxRocketExplode : sfxExplode,
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
    if (withDrop) rollDrop(EC(enemy.type), pos.x, pos.y, pos.z, !!enemy.carriesUpgrade);
    if (ship) {
        beginSurfaceDestruction(enemy);
        counters.destroyed.ships++;
    } else {
        beginAircraftDestruction(enemy);
        counters.destroyed.aircraft++;
    }
    stats.kills++;
}

function killGroundTarget(target, withDrop = true) {
    if (!target.active) return;
    const pos = target.group.position;
    if (withDrop) rollDrop(EC(target.type), pos.x, 12, pos.z, false);
    beginGroundDestruction(target);
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

function impactRank(kind) { return kind === 'collision' ? 3 : kind === 'missile' ? 2 : 1; }

function beginPlayerImpact(kind = 'bullet', sourceX = null, sourceZ = null) {
    if (phase === 'playerDestroyed') return false;
    const cfg = C().playerImpact;
    const rank = impactRank(kind);
    // Jangan biarkan rentetan peluru kecil memotong animasi missile/tabrakan.
    // Impact sekelas yang datang bertubi-tubi juga menunggu fase hentakan awal.
    if (playerImpact.active) {
        const currentRank = impactRank(playerImpact.kind);
        if (rank < currentRank || (rank === currentRank
            && playerImpact.t < playerImpact.duration * 0.28)) return false;
    }
    const plane = stage10FlightWorld().playerAircraft;
    let dx = plane.position.x - (sourceX == null ? plane.position.x : sourceX);
    let dz = plane.position.z - (sourceZ == null ? plane.position.z - 1 : sourceZ);
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const alternate = (counters.playerImpacts.bullet + counters.playerImpacts.missile
        + counters.playerImpacts.collision) & 1 ? -1 : 1;
    playerImpact.active = true; playerImpact.kind = kind; playerImpact.t = 0;
    playerImpact.duration = kind === 'collision' ? cfg.collisionDurationSec
        : kind === 'missile' ? cfg.missileDurationSec : cfg.bulletDurationSec;
    playerImpact.dirX = dx; playerImpact.dirZ = dz;
    playerImpact.rollSign = Math.abs(dx) > 0.08 ? Math.sign(dx) : alternate;
    playerImpact.strength = rank;
    playerImpact.offsetX = playerImpact.offsetY = playerImpact.offsetZ = 0;
    playerImpact.roll = playerImpact.pitch = playerImpact.yaw = 0;
    counters.playerImpacts[kind]++;

    const fx = stage10FlightWorld().playerImpactFx;
    fx.group.visible = true; fx.group.position.copy(plane.position);
    fx.group.rotation.set(0, 0, 0);
    fx.flash.visible = true; fx.flash.scale.setScalar(0.1);
    fx.ring.visible = true; fx.ring.scale.setScalar(0.1);
    const spread = kind === 'bullet' ? 13 : kind === 'missile' ? 27 : 34;
    for (let i = 0; i < fx.sparks.length; i++) {
        const spark = fx.sparks[i], a = i / fx.sparks.length * Math.PI * 2
            + playerImpact.rollSign * 0.24;
        spark.visible = kind !== 'bullet' || i < 7;
        spark.position.set(0, 0, 0); spark.scale.setScalar(1);
        spark.userData.vx = Math.cos(a) * (spread * (0.55 + i % 4 * 0.16));
        spark.userData.vz = Math.sin(a) * (spread * (0.48 + i % 3 * 0.18));
        spark.userData.vy = 5 + i % 5 * 2.1;
        spark.rotation.set(i * 0.31, i * 0.47, i * 0.23);
    }
    for (let i = 0; i < fx.smoke.length; i++) {
        const smoke = fx.smoke[i];
        smoke.visible = kind !== 'bullet';
        smoke.position.set((i - 2.5) * 1.1, -0.5 + i % 2, -i * 1.3);
        smoke.scale.setScalar(0.1);
    }
    for (let i = 0; i < fx.fire.length; i++) {
        const fire = fx.fire[i];
        fire.visible = kind !== 'bullet';
        fire.position.set((i - 1) * 2.4, 0, -1 + i * 1.2);
        fire.scale.setScalar(0.1);
    }
    for (let i = 0; i < fx.debris.length; i++) {
        const debris = fx.debris[i], a = i / fx.debris.length * Math.PI * 2;
        debris.visible = kind === 'collision'; debris.position.set(0, 0, 0);
        debris.scale.setScalar(1);
        debris.userData.vx = Math.cos(a) * (13 + i % 3 * 4);
        debris.userData.vz = Math.sin(a) * (11 + i % 4 * 3);
        debris.userData.vy = 7 + i % 4 * 2.8;
        debris.rotation.set(i * 0.37, i * 0.29, i * 0.41);
    }
    addCamShake(kind === 'collision' ? 5.5 : kind === 'missile' ? 3.2 : 0.75);
    return true;
}

function updatePlayerImpact(dt) {
    if (!playerImpact.active) return;
    const cfg = C().playerImpact, fx = stage10FlightWorld().playerImpactFx;
    playerImpact.t += dt;
    const q = clamp(playerImpact.t / Math.max(0.01, playerImpact.duration), 0, 1);
    const recover = Math.sin(q * Math.PI), fade = 1 - q;
    const bullet = playerImpact.kind === 'bullet';
    const missile = playerImpact.kind === 'missile';
    const kick = bullet ? cfg.bulletKick : missile ? cfg.missileKick : cfg.collisionKick;
    const rollDeg = bullet ? cfg.bulletRollDeg
        : missile ? cfg.missileRollDeg : cfg.collisionRollDeg;
    const vibration = Math.sin(playerImpact.t * (bullet ? 72 : 42))
        * fade * (bullet ? 1.25 : missile ? 2.8 : 3.8);
    playerImpact.offsetX = playerImpact.dirX * kick * recover
        + playerImpact.rollSign * vibration;
    playerImpact.offsetZ = playerImpact.dirZ * kick * recover * 0.52
        + Math.cos(playerImpact.t * 37) * fade * playerImpact.strength;
    const drop = missile ? cfg.missileAltitudeDrop
        : playerImpact.kind === 'collision' ? cfg.collisionAltitudeDrop : 0;
    playerImpact.offsetY = -drop * recover;
    playerImpact.roll = playerImpact.rollSign * rollDeg * Math.PI / 180 * recover;
    playerImpact.pitch = (missile ? -0.24 : bullet ? -0.06 : 0.2) * recover;
    playerImpact.yaw = playerImpact.rollSign
        * (playerImpact.kind === 'collision' ? 0.32 : missile ? 0.13 : 0.035) * recover;

    const flashLife = bullet ? 0.5 : 0.34;
    fx.flash.visible = q < flashLife;
    if (fx.flash.visible) fx.flash.scale.setScalar((bullet ? 5 : missile ? 10 : 13)
        * Math.max(0.08, 1 - q / flashLife));
    fx.ring.visible = q < 0.7;
    if (fx.ring.visible) fx.ring.scale.setScalar((bullet ? 3 : 6) + q * (bullet ? 22 : 38));
    for (const spark of fx.sparks) if (spark.visible) {
        spark.position.x += spark.userData.vx * dt;
        spark.position.z += spark.userData.vz * dt;
        spark.position.y += spark.userData.vy * dt;
        spark.userData.vy -= 24 * dt;
        spark.rotation.x += dt * 13; spark.rotation.z += dt * 10;
        spark.scale.setScalar(Math.max(0.03, fade * 1.1));
    }
    for (let i = 0; i < fx.smoke.length; i++) {
        const smoke = fx.smoke[i]; if (!smoke.visible) continue;
        smoke.position.x += Math.sin(playerImpact.t * 5 + i) * dt * 2.2;
        smoke.position.y += dt * (3.4 + i * 0.35);
        smoke.position.z += dt * (2 + i * 0.25);
        smoke.scale.setScalar(0.45 + q * (2.2 + i * 0.28));
    }
    for (let i = 0; i < fx.fire.length; i++) {
        const fire = fx.fire[i]; if (!fire.visible) continue;
        fire.position.y += dt * (2.2 + i * 0.4);
        fire.scale.setScalar(Math.max(0.08,
            (1.5 + i * 0.5) * fade * (0.8 + Math.sin(playerImpact.t * 25 + i) * 0.2)));
    }
    for (const debris of fx.debris) if (debris.visible) {
        debris.position.x += debris.userData.vx * dt;
        debris.position.z += debris.userData.vz * dt;
        debris.position.y += debris.userData.vy * dt;
        debris.userData.vy -= 20 * dt;
        debris.rotation.x += dt * 8; debris.rotation.y += dt * 11;
        debris.scale.setScalar(Math.max(0.08, fade));
    }
    if (q >= 1) {
        playerImpact.active = false; playerImpact.kind = 'none';
        playerImpact.offsetX = playerImpact.offsetY = playerImpact.offsetZ = 0;
        playerImpact.roll = playerImpact.pitch = playerImpact.yaw = 0;
        fx.flash.visible = fx.ring.visible = false;
        for (const part of fx.sparks) part.visible = false;
        for (const part of fx.smoke) part.visible = false;
        for (const part of fx.fire) part.visible = false;
        for (const part of fx.debris) part.visible = false;
        fx.group.visible = false;
    }
}

function damagePlayer(damage, kind = 'bullet', sourceX = null, sourceZ = null) {
    if (!fighting() || godMode) return;
    flightHp = Math.max(0, flightHp - damage); player.hp = flightHp;
    beginPlayerImpact(kind, sourceX, sourceZ);
    playSFX(kind === 'missile' ? sfxRocketExplode : sfxHit,
        kind === 'collision' ? 0.75 : kind === 'missile' ? 0.7 : 0.55);
    if (flightHp <= 0) startPlayerDestruction();
}

function startPlayerDestruction() {
    if (phase === 'playerDestroyed') return;
    phase = 'playerDestroyed'; playerDestroyedT = 0; playerExplosionPulse = 0;
    playerImpact.active = false;
    stage10FlightWorld().playerImpactFx.group.visible = false;
    mgMouse = mgKey = bombMouse = bombKey = false;
    setCinematicActive(true);
    const p = stage10FlightWorld().playerAircraft.position;
    spawnExplosion(p.x, p.y, p.z, 2.1, 'player');
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

function animateEnemyAircraft(enemy, dt) {
    const rig = enemy.variants[enemy.type].userData.rig;
    enemy.enginePhase += dt * (enemy.type === 'airC' ? 18 : enemy.type === 'airB' ? 14 : 11);
    const pulse = 0.88 + Math.sin(enemy.enginePhase * 2.4) * 0.14;
    for (const engine of rig.engines) {
        engine.fan.rotation.z += dt * (enemy.type === 'airC' ? 34 : 27);
        const boost = 1 + (enemy.turnIntensity || 0) * 0.82;
        engine.exhaust.scale.set(0.88 + pulse * 0.12,
            0.88 + pulse * 0.12, pulse * boost);
    }
    const deflect = clamp(enemy.group.rotation.z * 0.55, -0.2, 0.2)
        + Math.sin(enemy.t * 2.1) * 0.035;
    for (let i = 0; i < rig.controls.length; i++)
        rig.controls[i].rotation.x = deflect * (i % 2 ? -1 : 1);
    for (const vapor of rig.turnVapors) {
        const intensity = enemy.turnIntensity || 0;
        vapor.visible = intensity > 0.12;
        if (vapor.visible) vapor.scale.set(0.7 + intensity * 0.75,
            0.7 + intensity * 0.75, 0.45 + intensity * 1.65);
    }
}

function beginAircraftTurn(enemy) {
    enemy.path = 'turn'; enemy.turnT = 0; enemy.turnIntensity = 0;
    // Semua anggota satu wave membelok ke sisi yang sama sehingga formasi
    // terbaca sebagai combat break, bukan sekumpulan model yang flip sendiri.
    enemy.turnDir = ((enemy.wave || 0) & 1) ? 1 : -1;
    enemy.turnStartYaw = enemy.group.rotation.y;
}

function updateAircraftTurn(enemy, dt, cfg) {
    const turn = C().waves;
    enemy.turnT += dt;
    const q = clamp(enemy.turnT / Math.max(0.01, turn.turnSec), 0, 1);
    const eased = smooth01(q);
    const intensity = Math.sin(q * Math.PI);
    const heading = enemy.turnStartYaw + enemy.turnDir * Math.PI * eased;
    const speed = cfg.speed * turn.turnSpeedMul * (0.78 + intensity * 0.34);
    enemy.group.position.x += Math.sin(heading) * speed * dt;
    enemy.group.position.z += Math.cos(heading) * speed * dt;
    enemy.group.position.y = C().altitude + intensity * turn.turnClimb;
    enemy.group.rotation.y = heading;
    enemy.group.rotation.z = -enemy.turnDir * intensity
        * turn.turnBankDeg * Math.PI / 180;
    // Paruh pertama menarik hidung naik, paruh kedua menukik kembali ke jalur.
    enemy.group.rotation.x = -Math.sin(q * Math.PI * 2)
        * turn.turnPitchDeg * Math.PI / 180;
    enemy.heading = heading; enemy.turnIntensity = intensity;
    if (q >= 1) {
        enemy.path = 'exit'; enemy.turnIntensity = 0;
        enemy.group.position.y = C().altitude;
        enemy.group.rotation.x = 0; enemy.group.rotation.z = 0;
    }
}

function primeTargetDestruction(target, poses) {
    target.active = false; target.destroying = true; target.deathT = 0;
    target.group.scale.setScalar(1);
    target.deathSecondary = false; target.deathFinal = false;
    target.deathLeanDir = deathNoise(target, 301) < 0.5 ? -1 : 1;
    const fx = target.damageFx; fx.group.visible = true;
    for (let i = 0; i < fx.fires.length; i++) {
        const fire = fx.fires[i]; fire.visible = true;
        fire.position.set((i - 1) * 2.8, 2 + i * 0.7, (i - 1) * -3.2);
        fire.scale.setScalar(0.1);
    }
    for (let i = 0; i < fx.smoke.length; i++) {
        const smoke = fx.smoke[i]; smoke.visible = true;
        smoke.position.set((deathNoise(target, 320 + i) - 0.5) * 4,
            2 + i * 0.7, -i * 2.5);
        smoke.scale.setScalar(0.1);
    }
    for (let i = 0; i < fx.sparks.length; i++) {
        const spark = fx.sparks[i]; spark.visible = true; spark.position.set(0, 3, 0);
        const a = i / fx.sparks.length * Math.PI * 2 + deathNoise(target, 350 + i) * 0.5;
        const speed = lerp(8, 20, deathNoise(target, 370 + i));
        spark.userData.vx = Math.cos(a) * speed;
        spark.userData.vz = Math.sin(a) * speed;
        spark.userData.vy = lerp(7, 18, deathNoise(target, 390 + i));
        spark.rotation.set(deathNoise(target, 410 + i) * 3,
            deathNoise(target, 430 + i) * 3, deathNoise(target, 450 + i) * 3);
        spark.scale.setScalar(1);
    }
    for (let i = 0; i < poses.length; i++) {
        const pose = poses[i];
        pose.vx = (deathNoise(target, 500 + i) - 0.5) * (5 + i * 0.8);
        pose.vz = (deathNoise(target, 520 + i) - 0.5) * (5 + i * 0.8);
        pose.vy = 4.5 + deathNoise(target, 540 + i) * 7;
        pose.spinX = (deathNoise(target, 560 + i) - 0.5) * 4;
        pose.spinY = (deathNoise(target, 580 + i) - 0.5) * 5;
        pose.spinZ = (deathNoise(target, 600 + i) - 0.5) * 4;
    }
}

function updateTargetDamageFx(target, dt, q) {
    const fx = target.damageFx;
    for (let i = 0; i < fx.fires.length; i++) {
        const fire = fx.fires[i];
        const s = (1.9 + i * 0.7) * (0.82 + Math.sin(target.deathT * 22 + i) * 0.18)
            * (1 - q * 0.35);
        fire.position.x += Math.sin(target.deathT * 11 + i) * dt * 1.4;
        fire.position.y += dt * (0.8 + i * 0.25);
        fire.scale.setScalar(Math.max(0.18, s));
    }
    for (let i = 0; i < fx.smoke.length; i++) {
        const smoke = fx.smoke[i];
        smoke.position.x += Math.sin(target.deathT * 3.5 + i) * dt * (1.5 + i * 0.2);
        smoke.position.y += dt * (3.2 + i * 0.45);
        smoke.position.z -= dt * (1.2 + i * 0.32);
        smoke.scale.setScalar(0.55 + q * (3.1 + i * 0.32));
    }
    for (const spark of fx.sparks) {
        spark.position.x += spark.userData.vx * dt;
        spark.position.z += spark.userData.vz * dt;
        spark.position.y += spark.userData.vy * dt;
        spark.userData.vy -= C().targetDeath.debrisGravity * dt;
        spark.rotation.x += dt * 9; spark.rotation.z += dt * 7;
        spark.scale.setScalar(Math.max(0.04, 1 - q * 1.8));
    }
}

function updateTargetBreakaways(target, poses) {
    const cfg = C().targetDeath;
    const age = Math.max(0, target.deathT - cfg.secondaryBlastSec * 0.55);
    if (age <= 0) return;
    for (const pose of poses) {
        pose.part.position.x = pose.x + pose.vx * age;
        pose.part.position.z = pose.z + pose.vz * age;
        pose.part.position.y = pose.y + pose.vy * age
            - cfg.debrisGravity * 0.5 * age * age;
        pose.part.rotation.x = pose.rx + pose.spinX * age;
        pose.part.rotation.y = pose.ry + pose.spinY * age;
        pose.part.rotation.z = pose.rz + pose.spinZ * age;
    }
}

function beginSurfaceDestruction(enemy) {
    const rig = enemy.shipRig || enemy.variants[enemy.type].userData.shipRig;
    enemy.shipRig = rig;
    primeTargetDestruction(enemy, rig.breakaways);
    enemy.deathVX = (deathNoise(enemy, 620) - 0.5) * 5;
    enemy.deathVZ = EC(enemy.type).speed * 0.55;
    for (const wake of rig.wakes) wake.visible = false;
    for (const flash of rig.muzzleFlashes) flash.visible = false;
    const p = enemy.group.position;
    spawnExplosion(p.x, p.y + 5, p.z, enemy.type === 'shipA' ? 2.1 : 1.7,
        'ships', (enemy.index + 1) * 6151);
}

function beginGroundDestruction(target) {
    const rig = target.destructionRig
        || target.variants[target.type].userData.destructionRig;
    target.destructionRig = rig;
    primeTargetDestruction(target, rig.breakaways);
    if (target.rig) for (const flash of target.rig.muzzleFlashes) flash.visible = false;
    const p = target.group.position;
    const size = target.type === 'depot' ? 2.4 : target.type === 'bunker' ? 2 : 1.7;
    spawnExplosion(p.x, 7, p.z, size, 'ground', (target.index + 1) * 7103);
}

function finishTargetDestruction(target) {
    target.damageFx.group.visible = false;
    for (const v of Object.values(target.variants)) v.visible = false;
    resetPoolItem(target);
}

function updateSurfaceDestruction(enemy, dt) {
    const cfg = C().targetDeath;
    enemy.deathT += dt;
    const q = clamp(enemy.deathT / cfg.shipDurationSec, 0, 1);
    const p = enemy.group.position, model = enemy.variants[enemy.type];
    p.x += enemy.deathVX * dt; p.z += enemy.deathVZ * dt;
    p.y -= cfg.shipSinkSpeed * dt * (0.35 + q * 0.9);
    model.rotation.z = enemy.deathLeanDir * q * q * 0.34;
    model.rotation.x = q * 0.08;
    updateTargetBreakaways(enemy, enemy.shipRig.breakaways);
    updateTargetDamageFx(enemy, dt, q);
    if (!enemy.deathSecondary && enemy.deathT >= cfg.secondaryBlastSec) {
        enemy.deathSecondary = true;
        spawnExplosion(p.x + enemy.deathLeanDir * 8, p.y + 5, p.z - 5,
            1.25, 'ships', (enemy.index + 1) * 6151 + 1);
    }
    if (!enemy.deathFinal && enemy.deathT >= cfg.finalBlastSec) {
        enemy.deathFinal = true;
        spawnExplosion(p.x, Math.max(2, p.y + 3), p.z, 2.35,
            'ships', (enemy.index + 1) * 6151 + 2);
    }
    if (enemy.deathT >= cfg.shipDurationSec) finishTargetDestruction(enemy);
}

function updateGroundDestruction(target, dt) {
    const cfg = C().targetDeath;
    target.deathT += dt;
    const q = clamp(target.deathT / cfg.groundDurationSec, 0, 1);
    const p = target.group.position, model = target.variants[target.type];
    const building = target.type === 'bunker' || target.type === 'depot';
    model.position.y = -q * (building ? 3.2 : 1.25);
    model.rotation.z = target.deathLeanDir * q * q * (building ? 0.1 : 0.18);
    if (target.type === 'tank') model.rotation.x = q * 0.08;
    updateTargetBreakaways(target, target.destructionRig.breakaways);
    updateTargetDamageFx(target, dt, q);
    if (!target.deathSecondary && target.deathT >= cfg.secondaryBlastSec) {
        target.deathSecondary = true;
        spawnExplosion(p.x + target.deathLeanDir * 6, 8, p.z - 3,
            building ? 1.6 : 1.15, 'ground', (target.index + 1) * 7103 + 1);
    }
    if (!target.deathFinal && target.deathT >= cfg.finalBlastSec) {
        target.deathFinal = true;
        spawnExplosion(p.x, 5, p.z, building ? 2.25 : 1.75,
            'ground', (target.index + 1) * 7103 + 2);
    }
    if (target.deathT >= cfg.groundDurationSec) finishTargetDestruction(target);
}

function animateSurfaceShip(enemy, dt, targetX, targetZ) {
    const rig = enemy.shipRig;
    if (!rig) return;
    const p = enemy.group.position;
    // Kedua sistem senjata mengikuti player di ruang lokal kapal. Radar, recoil,
    // flash dan wake seluruhnya hanya mengubah rig yang sudah dipra-bangun.
    const worldAim = Math.atan2(targetX - p.x, targetZ - p.z);
    const localAim = worldAim - enemy.group.rotation.y;
    rig.mainTurret.rotation.y = localAim;
    rig.ciws.rotation.y = localAim + Math.sin(enemy.t * 2.2) * 0.035;
    rig.radar.rotation.y += dt * (enemy.type === 'shipA' ? 2.15 : 2.75);

    enemy.shipMuzzleT = Math.max(0, (enemy.shipMuzzleT || 0) - dt);
    const recoil = clamp(enemy.shipMuzzleT / 0.16, 0, 1);
    rig.gunMount.position.z = rig.recoilBaseZ
        - recoil * (enemy.type === 'shipA' ? 0.85 : 0.65);
    for (let i = 0; i < rig.muzzleFlashes.length; i++) {
        const flash = rig.muzzleFlashes[i];
        flash.visible = recoil > 0.04 && i === enemy.shipMuzzleIndex;
        if (flash.visible) {
            const s = 0.65 + recoil * 1.15;
            flash.scale.set(s, s, 0.7 + recoil * 1.5);
        }
    }
    const wakePulse = 0.92 + Math.sin(enemy.t * 5.2) * 0.12;
    for (let i = 0; i < rig.wakes.length; i++)
        rig.wakes[i].scale.set(0.9 + wakePulse * 0.12,
            1, wakePulse + i * 0.035);
}

function beginAircraftDestruction(enemy) {
    const cfg = C().aircraftDeath;
    enemy.active = false; enemy.destroying = true; enemy.deathT = 0;
    enemy.deathSecondary = false; enemy.deathFinal = false;
    const spinNoise = deathNoise(enemy, 0);
    enemy.deathSpin = (spinNoise < 0.5 ? -1 : 1) * cfg.spinSpeed
        * lerp(0.78, 1.18, deathNoise(enemy, 1));
    enemy.deathVX = Math.sin(enemy.group.rotation.y) * cfg.driftSpeed
        + (deathNoise(enemy, 2) - 0.5) * cfg.driftSpeed * 0.55;
    enemy.deathVZ = Math.cos(enemy.group.rotation.y) * cfg.driftSpeed * 0.72;
    enemy.deathVY = 2 + deathNoise(enemy, 3) * 4;
    const fx = enemy.damageFx;
    fx.group.visible = true;
    for (let i = 0; i < fx.sparks.length; i++) {
        const spark = fx.sparks[i];
        const a = i / fx.sparks.length * Math.PI * 2 + deathNoise(enemy, 10 + i) * 0.4;
        spark.position.set(0, 0, 0);
        spark.rotation.set(deathNoise(enemy, 30 + i) * 3,
            deathNoise(enemy, 50 + i) * 3, deathNoise(enemy, 70 + i) * 3);
        const speed = lerp(7, 18, deathNoise(enemy, 90 + i));
        spark.userData.vx = Math.cos(a) * speed;
        spark.userData.vz = Math.sin(a) * speed;
        spark.userData.vy = lerp(5, 15, deathNoise(enemy, 110 + i));
    }
    spawnExplosion(enemy.group.position.x, enemy.group.position.y,
        enemy.group.position.z, 0.72, 'aircraft');
}

function updateAircraftDestruction(enemy, dt) {
    const cfg = C().aircraftDeath;
    enemy.deathT += dt;
    const q = clamp(enemy.deathT / Math.max(0.01, cfg.durationSec), 0, 1);
    const pos = enemy.group.position;
    enemy.deathVY -= cfg.fallAcceleration * dt;
    pos.x += enemy.deathVX * dt;
    pos.z += enemy.deathVZ * dt;
    pos.y = Math.max(3, pos.y + enemy.deathVY * dt);
    enemy.group.rotation.y += enemy.deathSpin * dt * (0.38 + q * 0.62);
    enemy.group.rotation.z += enemy.deathSpin * dt * 0.42;

    const rig = enemy.variants[enemy.type].userData.rig;
    const tear = clamp((enemy.deathT - cfg.secondaryBlastSec * 0.55)
        / Math.max(0.1, cfg.durationSec - cfg.secondaryBlastSec * 0.55), 0, 1);
    for (let i = 0; i < rig.breakaways.length; i++) {
        const pose = rig.breakaways[i], side = i % 2 ? 1 : -1;
        pose.part.position.x = pose.x + side * tear * tear * (7 + i * 1.8);
        pose.part.position.y = pose.y + tear * (2 + i * 0.65);
        pose.part.position.z = pose.z - tear * (4 + i * 1.4);
        pose.part.rotation.x = pose.rx + side * tear * 2.4;
        pose.part.rotation.y = pose.ry + side * tear * 1.7;
        pose.part.rotation.z = pose.rz + side * tear * 3.2;
    }
    rig.core.position.x = Math.sin(enemy.deathT * 24) * (0.15 + q * 0.7);

    const fx = enemy.damageFx;
    for (let i = 0; i < fx.fires.length; i++) {
        const fire = fx.fires[i];
        const s = (1.5 + i * 0.55) * (0.82 + Math.sin(enemy.deathT * 24 + i) * 0.18)
            * (1 - q * 0.42);
        fire.position.x = Math.sin(enemy.deathT * 13 + i * 2.1) * (1.2 + i * 0.7);
        fire.position.y = 0.8 + i * 0.35;
        fire.scale.setScalar(Math.max(0.12, s));
    }
    for (let i = 0; i < fx.smoke.length; i++) {
        const smoke = fx.smoke[i], age = clamp(q * 1.35 - i * 0.065, 0, 1);
        smoke.position.x = Math.sin(enemy.deathT * 4.5 + i) * (1.4 + i * 0.55);
        smoke.position.y = 1.2 + i * 0.5 + age * 5;
        smoke.position.z = -5 - i * (3.5 + q * 2.2);
        smoke.scale.setScalar(0.45 + age * (2.8 + i * 0.28));
    }
    for (const spark of fx.sparks) {
        spark.position.x += spark.userData.vx * dt;
        spark.position.z += spark.userData.vz * dt;
        spark.position.y += spark.userData.vy * dt;
        spark.userData.vy -= 22 * dt;
        spark.rotation.x += dt * 8; spark.rotation.z += dt * 6;
        spark.scale.setScalar(Math.max(0.05, 1 - q * 1.4));
    }

    if (!enemy.deathSecondary && enemy.deathT >= cfg.secondaryBlastSec) {
        enemy.deathSecondary = true;
        spawnExplosion(pos.x + lerp(-9, 9, deathNoise(enemy, 201)),
            pos.y + lerp(-2, 3, deathNoise(enemy, 202)),
            pos.z + lerp(-7, 7, deathNoise(enemy, 203)), 0.95, 'aircraft',
            (enemy.index + 1) * 4099 + 1);
    }
    if (!enemy.deathFinal && enemy.deathT >= cfg.finalBlastSec) {
        enemy.deathFinal = true;
        spawnExplosion(pos.x, Math.max(4, pos.y), pos.z, 1.65, 'aircraft',
            (enemy.index + 1) * 4099 + 2);
        for (const engine of rig.engines) engine.exhaust.visible = false;
    }
    if (enemy.deathT >= cfg.durationSec) {
        enemy.damageFx.group.visible = false;
        for (const v of Object.values(enemy.variants)) v.visible = false;
        resetPoolItem(enemy);
    }
}

function updateEnemies(dt) {
    const W = stage10FlightWorld();
    const view = aircraftFlightFrame();
    const bottom = view.bottom + 110;
    const px = camera.position.x, pz = camera.position.z;
    for (const enemy of W.enemies) {
        if (enemy.destroying) {
            if (isAircraft(enemy)) updateAircraftDestruction(enemy, dt);
            else updateSurfaceDestruction(enemy, dt);
            continue;
        }
        if (!enemy.active) continue;
        const cfg = EC(enemy.type); enemy.t += dt; enemy.fireCd -= dt;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
        enemy.group.scale.setScalar(enemy.hitFlash > 0 ? 1.08 : 1);
        const ship = enemy.type.startsWith('ship');
        const pos = enemy.group.position;
        const oldX = pos.x, oldZ = pos.z;

        if (ship) {
            // Kapal bergerak menuju +Z, tetapi tidak boleh pernah menyeberang
            // pantai Jawa. Batas air adalah geografi tetap yang sama dengan tile.
            const seaEdge = biomeBoundaryZ().javaOcean - enemy.radius * 0.72;
            const nextZ = pos.z + cfg.speed * dt;
            pos.z = biomeAtZ(pos.z) === 'ocean' ? Math.min(nextZ, seaEdge) : nextZ;
            pos.x += Math.sin(enemy.t * 0.65) * dt * 3;
            pos.y = 1.2 + Math.sin(enemy.t * 1.8) * 0.35;
            enemy.group.rotation.y = Math.sin(enemy.t * 0.45) * 0.05;
        } else if (enemy.path === 'kamikaze') {
            const dx = px - pos.x, dz = pz - pos.z;
            const d = Math.hypot(dx, dz) || 1;
            pos.x += dx / d * cfg.speed * dt;
            pos.z += dz / d * cfg.speed * dt;
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
            if (enemy.dwellLeft <= 0) beginAircraftTurn(enemy);
        } else if (enemy.path === 'turn') {
            updateAircraftTurn(enemy, dt, cfg);
        } else if (enemy.path === 'exit') {
            const speed = cfg.speed * C().waves.exitSpeedMul;
            pos.x += Math.sin(enemy.heading) * speed * dt;
            pos.z += Math.cos(enemy.heading) * speed * dt;
        } else {   // cross — masuk dari samping, menyeberang layar
            pos.x += enemy.crossDir * cfg.speed * 1.35 * dt;
            pos.z += Math.sin(enemy.t * 0.8) * dt * 16 + cfg.speed * 0.18 * dt;
        }

        if (!ship) {
            const mx = pos.x - oldX, mz = pos.z - oldZ;
            if (enemy.path !== 'turn') {
                const vx = mx / Math.max(dt, 1e-4);
                let desiredYaw = enemy.group.rotation.y;
                // HOLD memakai forward bias: jitter sinus hanya memberi sedikit
                // yaw/bank, tidak boleh membalik hidung ketika sinus berbalik.
                if (enemy.path === 'hold') desiredYaw = Math.atan2(vx, cfg.speed * 0.9);
                else if (mx * mx + mz * mz > 1e-6) desiredYaw = Math.atan2(mx, mz);
                enemy.group.rotation.y = dampAngle(enemy.group.rotation.y,
                    desiredYaw, 6.2, dt);
                enemy.heading = enemy.group.rotation.y;
                const desiredBank = enemy.path === 'kamikaze'
                    ? Math.sin(enemy.t * 5) * 0.12
                    : clamp(-vx * 0.0018, -0.4, 0.4);
                const settle = 1 - Math.exp(-7.5 * dt);
                enemy.group.rotation.z = lerp(enemy.group.rotation.z, desiredBank, settle);
                enemy.group.rotation.x = lerp(enemy.group.rotation.x, 0, settle);
                enemy.turnIntensity = 0;
                pos.y = C().altitude;
            }
            animateEnemyAircraft(enemy, dt);
        } else animateSurfaceShip(enemy, dt, px, pz);

        const visible = pos.x > view.left - enemy.radius * 2
            && pos.x < view.right + enemy.radius * 2
            && pos.z > view.top - enemy.radius * 2
            && pos.z < view.bottom + enemy.radius * 2;
        if (ship && visible) enemy.surfaceEntered = true;

        // TEMBAKAN: kelas B memuntahkan burst bola plasma, kelas A rudal homing.
        if (visible && fighting() && enemy.path !== 'turn'
            && enemy.armed !== false && enemy.fireCd <= 0) {
            if (enemy.type === 'airB' || enemy.type === 'shipB') {
                let shotX = pos.x, shotY = pos.y + 1.2, shotZ = pos.z;
                if (ship && enemy.shipRig?.gunMuzzles.length) {
                    enemy.shipMuzzleIndex = (enemy.shipMuzzleIndex + 1)
                        % enemy.shipRig.gunMuzzles.length;
                    enemy.shipRig.gunMuzzles[enemy.shipMuzzleIndex].getWorldPosition(_v);
                    shotX = _v.x; shotY = _v.y; shotZ = _v.z;
                }
                if (spawnEnemyRound(shotX, shotZ, shotY, cfg.damage)) {
                    if (ship) {
                        enemy.shipMuzzleT = 0.16;
                        const flash = enemy.shipRig.muzzleFlashes[enemy.shipMuzzleIndex];
                        if (flash) { flash.visible = true; flash.scale.setScalar(1.4); }
                    }
                    enemy.burstLeft--;
                    if (enemy.burstLeft > 0) enemy.fireCd = cfg.burstGapSec || 0.22;
                    else { enemy.burstLeft = cfg.burstShots || 1; enemy.fireCd = cfg.fireDelaySec; }
                }
            } else if (enemy.type === 'airA' || enemy.type === 'shipA') {
                let launchX = pos.x, launchY = pos.y + (ship ? 6 : 0), launchZ = pos.z;
                if (ship && enemy.shipRig?.missileMuzzles.length) {
                    enemy.shipMissileIndex = (enemy.shipMissileIndex + 1)
                        % enemy.shipRig.missileMuzzles.length;
                    enemy.shipRig.missileMuzzles[enemy.shipMissileIndex].getWorldPosition(_v);
                    launchX = _v.x; launchY = _v.y; launchZ = _v.z;
                }
                if (spawnMissile(launchX, launchZ, launchY, cfg, cfg.damage)) {
                    enemy.burstLeft--;
                    if (enemy.burstLeft > 0) enemy.fireCd = cfg.burstGapSec;
                    else { enemy.burstLeft = cfg.burstShots; enemy.fireCd = cfg.burstRestSec; }
                }
            }
        }

        // TABRAKAN: setiap pesawat musuh berbahaya kalau ditabrak (aturan shmup).
        if (!ship && Math.hypot(pos.x - px, pos.z - pz) < enemy.radius + C().playerRadius * 0.6) {
            damagePlayer(cfg.damage, 'collision', pos.x, pos.z);
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
        if (g.destroying) { updateGroundDestruction(g, dt); continue; }
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
        // Traverse dihitung dalam ruang LOKAL karena hull tank berputar mengikuti
        // laju track. Elevasi laras, radar, roda, recoil, dan muzzle flash juga
        // bergerak sehingga instalasi terasa sebagai mesin aktif.
        if (g.rig) {
            const aimWorld = Math.atan2(px - pos.x, pz - pos.z);
            g.rig.traverse.rotation.y = aimWorld - g.group.rotation.y;
            const horizontal = Math.max(1, Math.hypot(px - pos.x, pz - pos.z));
            const targetElevation = -clamp(Math.atan2(C().altitude - pos.y, horizontal),
                0.04, g.type === 'turret' ? 0.62 : 0.34);
            const aimK = 1 - Math.exp(-dt * (g.type === 'turret' ? 7 : 4.5));
            g.rig.elevation.rotation.x = lerp(g.rig.elevation.rotation.x,
                targetElevation, aimK);
            if (g.rig.radar) g.rig.radar.rotation.y += dt * 2.8;
            if (g.rig.wheels.length) for (const wheel of g.rig.wheels)
                wheel.rotation.x += dt * g.speed * g.drift * 0.22;
            g.muzzleT = Math.max(0, g.muzzleT - dt);
            const recoil = clamp(g.muzzleT / 0.16, 0, 1);
            g.rig.elevation.position.z = g.rig.recoilBaseZ - recoil * (g.type === 'turret' ? 1.1 : 1.7);
            for (let i = 0; i < g.rig.muzzleFlashes.length; i++) {
                const flash = g.rig.muzzleFlashes[i];
                const lit = recoil > 0.22 && i === g.muzzleIndex;
                flash.visible = lit;
                if (lit) flash.scale.setScalar(0.8 + recoil * 1.8);
            }
        } else if (g.turret) {
            g.turret.rotation.y = Math.atan2(px - pos.x, pz - pos.z) - g.group.rotation.y;
        }
        const visible = pos.z > view.top - 40 && pos.z < view.bottom + 40
            && Math.abs(pos.x - view.cx) < view.halfWidth + 60;
        if (visible) g.surfaceEntered = true;
        if (visible && fighting() && cfg.fireDelaySec > 0 && g.fireCd <= 0) {
            let shotX = pos.x, shotY = 8, shotZ = pos.z;
            if (g.rig?.muzzles.length) {
                g.muzzleIndex = g.rig.muzzles.length > 1
                    ? (g.muzzleIndex + 1) % g.rig.muzzles.length : 0;
                g.group.updateMatrixWorld(true);
                g.rig.muzzles[g.muzzleIndex].getWorldPosition(_v);
                shotX = _v.x; shotY = _v.y; shotZ = _v.z;
            }
            if (spawnEnemyRound(shotX, shotZ, shotY, cfg.damage)) {
                g.muzzleT = 0.16;
                if (g.rig) {
                    const flash = g.rig.muzzleFlashes[g.muzzleIndex];
                    if (flash) { flash.visible = true; flash.scale.setScalar(2.2); }
                }
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
    // Seluruh airframe memakai local +Z sebagai depan; boss masuk dari atas
    // menuju +Z, jadi tidak membutuhkan kompensasi rotasi 180 derajat.
    W.boss.rotation.set(0, 0, 0);
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
        damagePlayer(cfg.damage * dt * 2.5, 'collision', p.x, p.z);
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
            m.mesh.position.x, m.mesh.position.z, m.radius + pad);
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
    spawnExplosion(m.mesh.position.x, C().altitude, m.mesh.position.z, 0.7, 'blast');
    resetPoolItem(m); counters.missilesShotDown++;
    return true;
}

// Damage area TIDAK PERNAH melewati tepi layar: ledakan meriam maupun bom
// hanya menyentuh sasaran yang benar-benar terlihat, sehingga gelombang yang
// masih menunggu di luar bingkai tak bisa ikut hancur.
function areaDamage(x, z, radius, damage, counterKey) {
    const W = stage10FlightWorld();
    const margin = C().projectileCullMargin;
    for (const e of W.enemies) if (e.active
        && Math.hypot(x - e.group.position.x, z - e.group.position.z) <= radius
        && onFlightScreen(e.group.position.x, e.group.position.z, margin)) {
        damageEnemy(e, damage); if (counterKey) counters[counterKey]++;
    }
    for (const g of W.groundTargets) if (g.active
        && Math.hypot(x - g.group.position.x, z - g.group.position.z) <= radius
        && onFlightScreen(g.group.position.x, g.group.position.z, margin)) {
        damageGroundTarget(g, damage); if (counterKey) counters[counterKey]++;
    }
    for (const m of W.missiles) if (m.active
        && Math.hypot(x - m.mesh.position.x, z - m.mesh.position.z) <= radius
        && onFlightScreen(m.mesh.position.x, m.mesh.position.z, margin))
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
        if (hit || b.life <= 0) { resetPoolItem(b); continue; }
        cullOffScreen(b);
    }
}

function updateEnemyProjectiles(dt) {
    const W = stage10FlightWorld();
    const px = camera.position.x, pz = camera.position.z;
    for (const b of W.enemyRounds) {
        if (!b.active) continue;
        const stepX = b.vx * dt, stepZ = b.vz * dt;
        b.life -= dt;
        b.rangeLeft -= Math.hypot(stepX, stepZ);
        b.mesh.position.x += stepX; b.mesh.position.z += stepZ;
        b.halo.rotation.z += dt * 4;
        if (hitsPlayer(b.mesh.position.x, b.mesh.position.z, px, pz, 2)) {
            damagePlayer(b.damage, 'bullet',
                b.mesh.position.x - b.vx * 0.08,
                b.mesh.position.z - b.vz * 0.08);
            resetPoolItem(b); continue;
        }
        if (b.rangeLeft <= 0 || b.life <= 0) { resetPoolItem(b); continue; }
        cullOffScreen(b);
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
        if (hitsPlayer(m.mesh.position.x, m.mesh.position.z, px, pz, 3)) {
            const x = m.mesh.position.x, z = m.mesh.position.z;
            damagePlayer(m.damage, 'missile',
                x - Math.sin(m.angle) * 18, z - Math.cos(m.angle) * 18);
            spawnExplosion(x, C().altitude, z, 0.8, 'blast');
            resetPoolItem(m); continue;
        }
        if (m.life <= 0) { resetPoolItem(m); continue; }
        cullOffScreen(m);
    }
}

// ------------------------------------------------------------ drop & power ---

function grantBomb() {
    bombs = Math.min(C().bomb.max, bombs + 1);
    showStageMsg(`BOMB ${bombs}`, 1500);
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
            } else { grantBomb(); playSFX(sfxPickup, 0.85); }
            counters.pickups++; updateUI();
        } else if (d.group.position.z > scrollZ + C().arenaBottomOffset + 130 || d.age > 20) {
            resetPoolItem(d);
        }
    }
}

// ---------------------------------------------------------- senjata player ---

function launchRound(slot, originX, originZ, angle, speed, life, damage) {
    slot.active = true; slot.mesh.visible = true;
    slot.entered = onFlightScreen(originX, originZ);
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
    const guns = data.weapons.wingMachineGuns;
    W.playerAircraft.updateMatrixWorld(true);
    const spread = C().spreadAngleDeg * Math.PI / 180;
    const each = roundDamage();
    let fired = 0;
    // Pasangan lurus: pasangan dalam dulu, lalu pasangan luar.
    for (let pair = 0; pair < C().machineGunPairs; pair++) {
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
    for (let a = 1; a <= C().machineGunAngledPairs; a++) {
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
    if (fired) {
        mgCooldown = machineDelay(); counters.playerVolleys++; stats.shots++;
        if (mgSfxCooldown <= 0) {
            playSFX(sfxTankMG, 0.42);
            mgSfxCooldown = Math.max(MG_SFX_MIN_GAP, machineDelay());
            counters.mgSfx++;
        }
        return true;
    }
    return false;
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
            z + randRange(-220, 60), randRange(1.4, 2.3), 'blast');
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
    // Jenis target mengikuti BIOME TITIK SPAWN di depan layar, bukan biome
    // player. Ini penting di pantai: bagian atas layar lebih dulu masuk laut/
    // daratan daripada posisi player.
    groundT -= dt;
    if (groundT <= 0) {
        const g = C().ground;
        spawnScheduledSurface();
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
    updatePlayerImpact(dt);
    data.fanAngle += dt * 42;
    const impactPulse = playerImpact.active
        ? Math.sin(playerImpact.t * (playerImpact.kind === 'bullet' ? 34 : 21)) : 0;
    for (const engine of data.engines) {
        engine.fan.rotation.z = data.fanAngle;
        engine.exhaust.material.opacity = playerImpact.kind === 'missile'
            || playerImpact.kind === 'collision'
            ? 0.31 + Math.abs(impactPulse) * 0.28 : 0.48;
        engine.exhaust.material.emissiveIntensity = 0.78;
        const sputter = playerImpact.active && playerImpact.kind !== 'bullet'
            ? 0.72 + Math.abs(impactPulse) * 0.48 : 1;
        engine.exhaust.scale.set(1, 1, sputter);
    }
    const k = 1 - Math.exp(-7 * dt);
    // Hero aircraft Stage 9 memanjang di local +X dan sayap kanannya berada di
    // local +Z. Setelah carrier diputar ke arah layar atas, roll POSITIF pada
    // local X menurunkan sayap kanan. Tanda negatif lama membalik bank visual.
    data.flightRig.rotation.x = lerp(data.flightRig.rotation.x,
        moveVX * 0.003 + playerImpact.roll, k);
    data.flightRig.rotation.z = lerp(data.flightRig.rotation.z,
        moveVZ * 0.0015 + playerImpact.pitch, k);
    plane.position.x = camera.position.x + playerImpact.offsetX;
    plane.position.z = camera.position.z + playerImpact.offsetZ;
    plane.position.y = C().altitude + Math.sin(elapsed * 4.2) * 0.7
        + playerImpact.offsetY;
    plane.rotation.x = 0;
    plane.rotation.y = Math.PI * 0.5 + playerImpact.yaw;
    plane.rotation.z = playerImpact.kind === 'collision'
        ? playerImpact.roll * 0.18 : 0;
    plane.visible = phase !== 'playerDestroyed' || playerDestroyedT < 1.65;
}

function updateFlight(dt) {
    scrollZ -= C().scrollSpeed * dt;
    enemyFireGap = Math.max(0, enemyFireGap - dt);
    if (phase === 'combat') elapsed = Math.min(C().durationSec, elapsed + dt);
    const nextBiome = desiredBiome();
    if (nextBiome !== biome) setBiome(nextBiome, true);
    updateTerrain(dt);
    reconcilePendingSurfaceTargets();
    updateSpawning(dt);
    updateEnemies(dt); updateGroundTargets(dt); updateBoss(dt);
    updatePlayerRounds(dt); updateEnemyProjectiles(dt);
    updateDrops(dt); updateExplosions(dt); updateBombFlash(dt);
    peakEnemyRounds = Math.max(peakEnemyRounds,
        activeCount(stage10FlightWorld().enemyRounds));
    peakMissiles = Math.max(peakMissiles, activeCount(stage10FlightWorld().missiles));
    if (phase === 'playerDestroyed') updatePlayerDestruction(dt);
    else updateAircraftAnimation(dt);
    updateMissionPhase(dt);
}

export const stage10Scene = {
    id: 'campaign-10', lightsKey: STAGE10_FLIGHT_KEY,
    hudProfile: 'aircraft',
    camOffset: CAM_OFFSET,
    cameraUp: CAMERA_UP,
    exactTopDown: true,

    enter() {
        saveCampaignStage(10);
        ensureStage10FlightWorld(scene);
        setActiveCampaignWorldRoots(STAGE10_FLIGHT_KEY);
        setActiveStageLights(STAGE10_FLIGHT_KEY);
        applyLightPreset(scene, 'flight');
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
        mgSfxCooldown = Math.max(0, mgSfxCooldown - dt);
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
    aircraftOrdnanceStatus() {
        return { bombs, maxBombs: C().bomb.max, hint: 'SPACE / RMB' };
    },
    hudStatus() {
        if (phase === 'playerDestroyed') return 'AIRCRAFT DESTROYED';
        if (phase === 'bossIntro' || phase === 'boss')
            return `BOSS ${Math.ceil(boss.hp / Math.max(1, boss.maxHp) * 100)}%`;
        if (phase === 'victory' || phase === 'complete')
            return `AIRSPACE CLEAR | FINISH ${Math.max(0, C().clearDelaySec - clearT).toFixed(1)}s`;
        return formatTime(C().durationSec - elapsed);
    },
    radarLandmarks() { },
};

// ------------------------------------------------------------- debug hooks ---

export function stage10FlightSpawnEnemy(type, x, z) { return spawnEnemy(type, x, z); }
export function stage10FlightSpawnWave(opts) { return spawnWave(opts); }
export function stage10FlightSpawnGround(kind, x, z) { return spawnGroundTarget(kind, x, z); }
export function stage10FlightSpawnScheduledSurface() { return spawnScheduledSurface(); }
export function stage10FlightClearEnemies() {
    const W = stage10FlightWorld();
    // Debug/smoke hard-clear: staged wrecks are reserved pool entries, jadi
    // membunuh ulang target aktif tidak lagi cukup untuk membersihkan arena.
    for (const e of W.enemies) {
        resetPoolItem(e); e.damageFx.group.visible = false;
        for (const v of Object.values(e.variants)) v.visible = false;
    }
    for (const g of W.groundTargets) {
        resetPoolItem(g); g.damageFx.group.visible = false;
        for (const v of Object.values(g.variants)) v.visible = false;
    }
}
export function stage10FlightSetElapsed(sec) {
    elapsed = clamp(sec, 0, C().durationSec);
    // Waktu dan tempat berjalan bersama: memajukan jam berarti memindahkan
    // pesawat ke koordinat rute yang sama, lalu seluruh medan didandani ulang.
    scrollZ = S10_FLIGHT_START_Z - elapsed * C().scrollSpeed;
    const W = stage10FlightWorld();
    const cycle = W.terrainTiles.length * TILE_LENGTH;
    for (let i = 0; i < W.terrainTiles.length; i++) {
        const tile = W.terrainTiles[i];
        tile.group.position.z = scrollZ + (2 - i) * TILE_LENGTH;
        while (tile.group.position.z > scrollZ + TILE_LENGTH * 2.5) tile.group.position.z -= cycle;
        dressTerrainTile(tile);
    }
    camera.position.z = scrollZ + C().arenaBottomOffset * 0.62;
    W.playerAircraft.position.z = camera.position.z;
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
export function stage10FlightDamagePlayer(damage, kind = 'bullet', sourceX = null, sourceZ = null) {
    damagePlayer(damage, kind, sourceX, sourceZ);
}
// Probe MURNI: menjawab "apakah titik ini mengenai pesawat player?" lewat
// predikat yang sama persis dipakai peluru dan rudal, tanpa menyentuh state apa
// pun. Versi pertama uji ini benar-benar menembakkan peluru lalu men-tick scene,
// dan itu merusak 14 test sesudahnya — harness ini satu skrip berurutan, jadi
// uji yang mengubah state bocor ke test tetangga.
export function stage10FlightPlayerHitTest(x, z, pad = 2) {
    return hitsPlayer(x, z, camera.position.x, camera.position.z, pad);
}

export function stage10FlightSetPlayerHp(hp) {
    flightHp = clamp(hp, 0, C().playerHp); player.hp = flightHp;
}
export function stage10FlightGrantDrop(type) {
    if (type === 'bomb') grantBomb();
}
export function stage10FlightUseBomb() { return useBomb(); }

export function stage10Debug() {
    const W = stage10FlightWorld();
    const horizontal = horizontalFlightBounds();
    const flightFrame = aircraftFlightFrame();
    const surfaceRows = [
        ...W.enemies.filter(e => e.active && e.type?.startsWith('ship')).map(e => ({
            pool: 'ship', index: e.index, type: e.type,
            x: e.group.position.x, z: e.group.position.z,
            entered: !!e.surfaceEntered, terrainBiome: biomeAtZ(e.group.position.z),
            matches: biomeAtZ(e.group.position.z) === 'ocean',
        })),
        ...W.groundTargets.filter(g => g.active).map(g => ({
            pool: 'ground', index: g.index, type: g.type,
            x: g.group.position.x, z: g.group.position.z,
            entered: !!g.surfaceEntered, terrainBiome: biomeAtZ(g.group.position.z),
            matches: biomeAtZ(g.group.position.z) !== 'ocean',
        })),
    ];
    const weapon = {
        machineGun: {
            configKey: 'campaign.stage10.flight.machineGunDamage',
            baseDamage: C().machineGunDamage,
            damage: volleyDamage(), perRound: roundDamage(), rounds: volleyRounds(),
            fireDelaySec: machineDelay(), muzzles: 4,
            autoFire: C().autoFire === true,
            sfx: 'boss-tank/tank-machine-gun.mp3',
            sfxMinGapSec: MG_SFX_MIN_GAP, sfxPlays: counters.mgSfx,
            forward: true, spreadAngleDeg: C().spreadAngleDeg,
            range: 'screen-edge', screenTopOffset: playerScreenTopZ() - scrollZ,
        },
        // Pesawat player HANYA punya machine gun sekarang.
        cannon: { removed: true },
    };
    return {
        phase, elapsed, durationSec: C().durationSec,
        spawning: phase === 'combat',
        clearDelaySec: C().clearDelaySec, clearT, transitionCommitted,
        // Pemisahan batas biome dibandingkan panjang SATU SIKLUS tile. Rig
        // pantai hanya ada satu salinan per arah (optimasi 2026-08-29), jadi dua
        // garis pantai tidak boleh pernah dibutuhkan bersamaan — dan itu hanya
        // dijamin selama jarak antar batas melebihi rentang pool tile. Sebelum
        // ini angkanya cuma catatan di dokumen, tidak dijaga apa pun.
        coastSeparation: {
            gapUnits: (C().biomes.oceanEndSec - C().biomes.javaEndSec) * C().scrollSpeed,
            tileCycleUnits: stage10FlightWorld().terrainTiles.length * TILE_LENGTH,
        },
        biome, biomeTimeline: { java: [0, C().biomes.javaEndSec],
            ocean: [C().biomes.javaEndSec, C().biomes.oceanEndSec],
            kalimantan: [C().biomes.oceanEndSec, C().durationSec] },
        surfaceRouting: {
            targets: surfaceRows,
            mismatches: surfaceRows.filter(x => !x.matches),
            reconciled: { ...counters.surfaceReconciled },
            rule: 'target-world-position',
            visibleIdentityLocked: true,
        },
        // Peralihan biome adalah GEOGRAFI, bukan fade: batasnya koordinat tetap
        // dan yang dilewati pesawat adalah tile pantai sungguhan.
        coast: {
            crossFade: false,
            boundaries: biomeBoundaryZ(),
            tiles: W.terrainTiles.map(t => ({
                index: t.index, z: t.group.position.z, dressed: t.dressed,
                landscape: t.landscapes?.[t.dressed]?.zone || null,
                shore: t.shore ? { ...t.shore } : null,
            })),
            rigs: Object.keys(W.coastRigs).length,
            visibleVariants: W.terrainTiles.map(t => [
                ...Object.entries(t.biomes).filter(([, g]) => g.visible).map(([n]) => n),
                ...Object.entries(W.coastRigs)
                    .filter(([, r]) => r.visible && r.userData.ownerTile === t.index)
                    .map(([n]) => n),
            ]),
        },
        camera: { exactTopDown: true, playerScreenRegion: 'lower', offset: { ...CAM_OFFSET },
            up: { ...CAMERA_UP }, screenHalfWidth: playerScreenHalfWidth(),
            screenHalfDepth: playerScreenHalfDepth(), horizontalBounds: { ...horizontal } },
        player: { hp: flightHp, maxHp: C().playerHp, radius: C().playerRadius,
            hit: { ...stage10FlightWorld().playerHit },
            visible: W.playerAircraft.visible, destroyedT: playerDestroyedT,
            visualScale: W.playerAircraft.userData.transport.flightVisual.scale,
            visualSpan: W.playerAircraft.userData.transport.flightVisual.span,
            impact: {
                active: playerImpact.active, kind: playerImpact.kind,
                t: playerImpact.t, duration: playerImpact.duration,
                counts: { ...counters.playerImpacts },
                offset: { x: playerImpact.offsetX, y: playerImpact.offsetY,
                    z: playerImpact.offsetZ },
                pose: { roll: playerImpact.roll, pitch: playerImpact.pitch,
                    yaw: playerImpact.yaw },
                fxVisible: W.playerImpactFx.group.visible,
                sparks: W.playerImpactFx.sparks.filter(x => x.visible).length,
                smoke: W.playerImpactFx.smoke.filter(x => x.visible).length,
                fire: W.playerImpactFx.fire.filter(x => x.visible).length,
                debris: W.playerImpactFx.debris.filter(x => x.visible).length,
            } },
        // Senjata TETAP: tidak ada level, tidak ada tangga — satu angka damage
        // dan satu pola tembak, keduanya milik config stage ini.
        firepower: {
            levels: false,
            perRound: roundDamage(), rounds: volleyRounds(),
            volleyDamage: volleyDamage(),
            pairs: C().machineGunPairs, angledPairs: C().machineGunAngledPairs,
        },
        bomb: { held: bombs, max: C().bomb.max, start: C().bomb.start,
            used: counters.bombsUsed, cooldown: bombCooldown,
            clearsEnemyFire: C().bomb.clearsEnemyFire === true },
        // Player TERBANG SENDIRIAN: tidak ada escort di stage ini.
        escorts: { supported: false },
        waves: { number: waveNumber, spawned: counters.waves,
            formations: { ...counters.formations },
            available: FORMATION_NAMES.slice(),
            dwellSec: C().waves.dwellSec, sizeRange: [C().waves.sizeMin, C().waves.sizeMax],
            turn: { durationSec: C().waves.turnSec,
                speedMul: C().waves.turnSpeedMul,
                bankDeg: C().waves.turnBankDeg,
                pitchDeg: C().waves.turnPitchDeg,
                climb: C().waves.turnClimb } },
        weapon,
        enemies: { active: activeCount(W.enemies), config: JSON.parse(JSON.stringify(C().enemies)),
            spawned: { ...counters.spawned }, destroyed: { ...counters.destroyed },
            destroyingAircraft: W.enemies.filter(e => e.destroying && isAircraft(e)).length,
            destroyingShips: W.enemies.filter(e => e.destroying && !isAircraft(e)).length,
            destruction: { ...C().aircraftDeath },
            targetDestruction: { ...C().targetDeath },
            maxAircraftOnScreen: C().maxAircraftOnScreen,
            activeAircraft: activeAircraftCount(),
            aircraftOnScreen: aircraftOnScreenCount(flightFrame),
            flightFrame: { ...flightFrame },
            positions: W.enemies.filter(e => e.active).map(e => ({ index: e.index, type: e.type,
                x: e.group.position.x, z: e.group.position.z, radius: e.radius,
                path: e.path, entryFrom: e.entryFrom, formation: e.formation,
                wave: e.wave, holdX: e.holdX, holdZOffset: e.holdZOffset,
                carriesUpgrade: !!e.carriesUpgrade,
                surfaceEntered: e.type.startsWith('ship') ? !!e.surfaceEntered : null,
                terrainBiome: e.type.startsWith('ship') ? biomeAtZ(e.group.position.z) : null,
                heading: e.heading, bank: e.group.rotation.z,
                pitch: e.group.rotation.x, altitude: e.group.position.y,
                turnT: e.turnT || 0, turnDirection: e.turnDir || 0,
                turnIntensity: e.turnIntensity || 0,
                turnVapors: isAircraft(e)
                    ? e.variants[e.type].userData.rig.turnVapors.filter(v => v.visible).length
                    : 0,
                shipTurretYaw: e.shipRig?.mainTurret.rotation.y ?? null,
                shipRadarYaw: e.shipRig?.radar.rotation.y ?? null,
                shipRecoil: e.shipMuzzleT || 0,
                shipMuzzleFlash: !!e.shipRig?.muzzleFlashes.some(f => f.visible) })) },
        ground: { active: activeCount(W.groundTargets),
            destroying: W.groundTargets.filter(g => g.destroying).length,
            spawned: { ...counters.ground },
            maxActive: C().ground.maxActive,
            visualScale: W.groundVisual.scale,
            hitRadius: { ...W.groundVisual.hitRadius },
            kinds: [...GROUND_KINDS],
            positions: W.groundTargets.filter(g => g.active).map(g => ({
                index: g.index, type: g.type, x: g.group.position.x,
                z: g.group.position.z, hp: g.hp, radius: g.radius,
                surfaceEntered: !!g.surfaceEntered,
                terrainBiome: biomeAtZ(g.group.position.z),
                turretYaw: g.rig?.traverse.rotation.y ?? null,
                elevation: g.rig?.elevation.rotation.x ?? null,
                recoil: g.muzzleT || 0,
                muzzleFlash: !!g.rig?.muzzleFlashes.some(f => f.visible),
                radarYaw: g.rig?.radar?.rotation.y ?? null })) },
        boss: { active: boss.active, hp: boss.hp, maxHp: boss.maxHp,
            dying: boss.dying, enraged: boss.enraged, visible: W.boss.visible,
            x: boss.x, z: scrollZ + boss.zOffset, zOffset: boss.zOffset,
            entrySec: C().boss.entrySec, radius: C().boss.radius,
            turrets: W.boss.userData.boss.turrets.length },
        projectiles: { playerRounds: activeCount(W.playerRounds),
            enemyRounds: activeCount(W.enemyRounds), missiles: activeCount(W.missiles),
            enemyRoundShape: 'orb',
            cullMargin: C().projectileCullMargin,
            culledOffScreen: counters.projectilesCulled,
            offScreen: [...W.playerRounds, ...W.enemyRounds, ...W.missiles]
                .filter(b => b.active && b.entered
                    && !onFlightScreen(b.mesh.position.x, b.mesh.position.z,
                        C().projectileCullMargin)).length,
            areaDamageOnScreenOnly: true },
        enemyFire: {
            maxActiveRounds: FIRE().maxActiveRounds, maxActiveMissiles: FIRE().maxActiveMissiles,
            minGapSec: FIRE().minGapSec, gap: enemyFireGap,
            aimJitterDeg: FIRE().aimJitterDeg, bulletSpeed: C().enemyBulletSpeed,
            bulletRange: C().enemyBulletRange,
            bulletLifeSec: C().enemyBulletRange / Math.max(1, C().enemyBulletSpeed),
            activeRounds: activeCount(W.enemyRounds), activeMissiles: activeCount(W.missiles),
            peakRounds: peakEnemyRounds, peakMissiles,
            blocked: counters.fireBlocked,
            shooterFraction: C().waves.shooterFraction,
            armedAircraft: W.enemies.filter(e => e.active && isAircraft(e) && e.armed !== false).length,
            aircraftOnScreen: aircraftOnScreenCount(flightFrame),
            missile: { homeSec: FIRE().missileHomeSec, hp: FIRE().missileHp,
                hitRadius: W.missileVisual.hitRadius,
                drawnLength: W.missileVisual.length,
                shotDown: counters.missilesShotDown,
                homing: W.missiles.filter(m => m.active && m.homeLeft > 0).length },
        },
        drops: { active: activeCount(W.drops), money: counters.moneyDrops,
            altitude: C().altitude, visualScale: W.dropVisual.scale,
            flying: W.drops.filter(d => d.active).every(d => d.baseY === C().altitude),
            pickupRadius: C().dropPickupRadius,
            health: counters.healthDrops,
            bomb: counters.bombDrops,
            pickups: counters.pickups,
            healthHeal: C().playerHp * C().healthHealFraction, instant: true },
        animations: { playerMovement: true, enemyAircraftMovement: true, shipMovement: true,
            groundTargetMovement: true, bossMovement: true,
            enemyEngineFans: true, enemyExhaustPulse: true,
            enemyAircraftDestruction: W.enemies.filter(e => e.destroying && isAircraft(e)).map(e => ({
                index: e.index, type: e.type, t: e.deathT,
                visible: e.group.visible, secondaryBlast: !!e.deathSecondary,
                finalBlast: !!e.deathFinal,
            })),
            surfaceDestruction: W.enemies.filter(e => e.destroying && !isAircraft(e)).map(e => ({
                index: e.index, type: e.type, t: e.deathT,
                visible: e.group.visible, secondaryBlast: !!e.deathSecondary,
                finalBlast: !!e.deathFinal,
                sinking: e.group.position.y < 1.2,
            })),
            groundDestruction: W.groundTargets.filter(g => g.destroying).map(g => ({
                index: g.index, type: g.type, t: g.deathT,
                visible: g.group.visible, secondaryBlast: !!g.deathSecondary,
                finalBlast: !!g.deathFinal,
            })),
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
