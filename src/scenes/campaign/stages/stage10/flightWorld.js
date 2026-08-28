// Stage 10 — scrolling top-down air-combat world and prebuilt entity pools.
//
// Bentuknya mengikuti referensi user (Air Strike 1944): pesawat player di bawah
// layar, gelombang pesawat musuh turun dari atas dalam FORMASI, instalasi darat
// yang ikut menggulung bersama medan, power-up bintang / bom / wingman, dan satu
// bomber boss di akhir misi. SEMUA mesh, material dan pool dibangun di sini satu
// kali; runtime (flight.js) tidak pernah membuat objek baru.

import { scene } from '../../../../core/renderer.js';
import { CFG } from '../../../../core/config.js';
import { PAL } from '../../../../world/palette.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { buildArmedHeavyAircraft, transportDebug } from '../stage9/aircraft.js';

export const STAGE10_FLIGHT_KEY = 'campaign-10-flight';
export const S10_FLIGHT_X = 420000;
export const S10_FLIGHT_START_Z = 0;
export const S10_FLIGHT_BOUNDS = Object.freeze({
    x0: S10_FLIGHT_X - 1100, x1: S10_FLIGHT_X + 1100,
    z0: -22000, z1: 220,
});

const TILE_COUNT = 6;
const TILE_LENGTH = 340;
const TERRAIN_WIDTH = 2200;
// Formasi Air Strike 1944 memuat sampai tujuh pesawat sekaligus dan boleh ada
// dua gelombang di layar, jadi pool dihitung dari kapasitas itu + instalasi.
const ENEMY_POOL = 52;
const GROUND_POOL = 22;
const PLAYER_ROUND_POOL = 220;
const CANNON_POOL = 24;
const ENEMY_ROUND_POOL = 240;
const MISSILE_POOL = 48;
const DROP_POOL = 40;
const EXPLOSION_POOL = 34;
export const WINGMAN_SLOTS = 2;

let built = false;
let root = null;
let world = null;

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function box(parent, material, sx, sy, sz, x, y, z) {
    return mesh(parent, new THREE.BoxGeometry(sx, sy, sz), material, x, y, z);
}

function cylinder(parent, material, radius, length, x, y, z, axis = 'y', radial = 10) {
    const m = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, radial), material, x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI * 0.5;
    else if (axis === 'z') m.rotation.x = Math.PI * 0.5;
    return m;
}

function flat(parent, material, radius, x, y, z, segments = 20) {
    const m = mesh(parent, new THREE.CircleGeometry(radius, segments), material, x, y, z);
    m.rotation.x = -Math.PI * 0.5;
    m.castShadow = false; m.receiveShadow = false;
    return m;
}

function mats() {
    return {
        java: new THREE.MeshLambertMaterial({ color: 0x546b36, transparent: true }),
        javaDark: new THREE.MeshLambertMaterial({ color: 0x344c2b, transparent: true }),
        javaDry: new THREE.MeshLambertMaterial({ color: 0x8a7650, transparent: true }),
        ocean: new THREE.MeshLambertMaterial({ color: 0x19566c, transparent: true }),
        oceanDeep: new THREE.MeshLambertMaterial({ color: 0x113e55, transparent: true }),
        oceanLine: new THREE.MeshBasicMaterial({ color: 0x73a8ad, transparent: true, opacity: 0.28 }),
        oceanIslandDry: new THREE.MeshLambertMaterial({ color: 0x8a7650, transparent: true }),
        oceanIslandGreen: new THREE.MeshLambertMaterial({ color: 0x344c2b, transparent: true }),
        kalimantan: new THREE.MeshLambertMaterial({ color: 0x315b32, transparent: true }),
        forest: new THREE.MeshLambertMaterial({ color: PAL.leaf, transparent: true }),
        javaRiver: new THREE.MeshLambertMaterial({ color: 0x285f6b, transparent: true }),
        kalimantanRiver: new THREE.MeshLambertMaterial({ color: 0x285f6b, transparent: true }),
        // Bangunan latar: hanya siluet, tanpa papan nama lokasi.
        roof: new THREE.MeshLambertMaterial({ color: PAL.hazard, transparent: true }),
        wall: new THREE.MeshLambertMaterial({ color: PAL.panel, transparent: true }),
        slab: new THREE.MeshLambertMaterial({ color: PAL.concrete, transparent: true }),
        slabLine: new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true, opacity: 0.5 }),
        pier: new THREE.MeshLambertMaterial({ color: PAL.wood, transparent: true }),
        cloud: new THREE.MeshLambertMaterial({ color: PAL.white, transparent: true, opacity: 0.34, depthWrite: false }),
        cloudShade: new THREE.MeshLambertMaterial({ color: PAL.panel, transparent: true, opacity: 0.22, depthWrite: false }),
        airC: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.48, metalness: 0.35 }),
        airB: new THREE.MeshStandardMaterial({ color: PAL.steel, roughness: 0.4, metalness: 0.58 }),
        airA: new THREE.MeshStandardMaterial({ color: PAL.amber, roughness: 0.42, metalness: 0.5 }),
        wing: new THREE.MeshStandardMaterial({ color: PAL.tech, roughness: 0.44, metalness: 0.5 }),
        ship: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.58, metalness: 0.45 }),
        shipDeck: new THREE.MeshStandardMaterial({ color: PAL.concrete, roughness: 0.7, metalness: 0.2 }),
        dark: new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.48, metalness: 0.62 }),
        glass: new THREE.MeshStandardMaterial({ color: PAL.screenBg, emissive: PAL.techDim, emissiveIntensity: 0.45 }),
        boss: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.42, metalness: 0.66 }),
        bossTrim: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.5, metalness: 0.3 }),
        bossGlow: new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amberDim, emissiveIntensity: 0.8 }),
        playerRound: new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false }),
        cannon: new THREE.MeshBasicMaterial({ color: 0xffb03b, toneMapped: false }),
        // Plasma musuh BIRU (warna sinyal gameplay yang sudah dipatok proyek),
        // tapi berbentuk bola besar + halo seperti referensi agar mudah dibaca.
        enemyRound: new THREE.MeshBasicMaterial({ color: 0x55b8ff, toneMapped: false }),
        enemyHalo: new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }),
        missile: new THREE.MeshBasicMaterial({ color: 0xffe7ca, toneMapped: false }),
        missileFin: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.5, metalness: 0.35 }),
        money: new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amberDim, emissiveIntensity: 0.65, metalness: 0.5 }),
        health: new THREE.MeshStandardMaterial({ color: PAL.white, emissive: PAL.hazard, emissiveIntensity: 0.4 }),
        healthRed: new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }),
        power: new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amber, emissiveIntensity: 0.85, metalness: 0.35 }),
        powerCase: new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.5, metalness: 0.6 }),
        bombPack: new THREE.MeshStandardMaterial({ color: PAL.tech, emissive: PAL.techDim, emissiveIntensity: 0.8, metalness: 0.4 }),
        wingPack: new THREE.MeshStandardMaterial({ color: PAL.white, emissive: PAL.techDim, emissiveIntensity: 0.55, metalness: 0.4 }),
        fire: new THREE.MeshBasicMaterial({ color: 0xff8a2b, transparent: true, opacity: 0.9, toneMapped: false }),
        flash: new THREE.MeshBasicMaterial({ color: 0xffe3a1, transparent: true, opacity: 0.9, toneMapped: false }),
        bombFlash: new THREE.MeshBasicMaterial({ color: 0xffe9bd, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
        bombRing: new THREE.MeshBasicMaterial({ color: 0xffd07a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
        smoke: new THREE.MeshLambertMaterial({ color: PAL.ink, transparent: true, opacity: 0.55, depthWrite: false }),
        debris: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.65, metalness: 0.5 }),
    };
}

// ---------------------------------------------------------------- terrain ---
// Setiap tile membawa KETIGA biome sebagai anak sendiri; cross-fade hanya
// mengubah opacity, jadi tidak ada mesh/material lahir saat biome berganti.

function buildHut(parent, M, x, z, w, d, h, rot) {
    box(parent, M.wall, w, h, d, x, h * 0.5 + 0.6, z).rotation.y = rot;
    const roof = box(parent, M.roof, w * 1.18, 0.9, d * 1.18, x, h + 0.9, z);
    roof.rotation.y = rot;
}

function buildVillage(parent, M, cx, cz, index) {
    for (let i = 0; i < 6; i++) {
        const x = cx + ((i * 37 + index * 17) % 62) - 31;
        const z = cz + ((i * 53 + index * 29) % 74) - 37;
        buildHut(parent, M, x, z, 9 + (i % 3) * 2.5, 7 + (i % 2) * 3,
            4 + (i % 3) * 1.4, ((i + index) % 4) * 0.22);
    }
}

function buildAirstrip(parent, M, cx, cz, index) {
    const strip = box(parent, M.slab, 26, 0.5, 190, cx, 1.1, cz);
    strip.rotation.y = index % 2 ? 0.05 : -0.05;
    for (let i = -3; i <= 3; i++) {
        const bar = box(parent, M.slabLine, 2.4, 0.12, 16, cx, 1.45, cz + i * 26);
        bar.rotation.y = strip.rotation.y;
    }
    for (const side of [-1, 1]) {
        box(parent, M.wall, 16, 6, 13, cx + side * 30, 3.6, cz - 52);
        box(parent, M.roof, 18, 1.1, 15, cx + side * 30, 7.1, cz - 52);
    }
}

function buildTerrainTile(parent, M, index) {
    const group = new THREE.Group();
    parent.add(group);
    const biomes = {};

    // --- Jawa: sawah, sungai, kampung, dan satu lanud kecil ---
    const java = new THREE.Group(); group.add(java); biomes.java = java;
    box(java, M.java, TERRAIN_WIDTH, 1.2, TILE_LENGTH + 3, 0, 0, 0);
    for (let i = 0; i < 10; i++) {
        const x = ((i * 71 + index * 43) % 420) - 210;
        const z = ((i * 97 + index * 29) % 290) - 145;
        const patch = cylinder(java, i % 3 ? M.javaDark : M.javaDry,
            17 + (i % 4) * 6, 0.45, x, 0.8, z, 'y', 10);
        patch.scale.z = 0.55 + (i % 3) * 0.16;
    }
    box(java, M.javaRiver, 15, 0.35, TILE_LENGTH, -105 + (index % 3) * 92, 1.05, 0)
        .rotation.y = (index % 2 ? 0.06 : -0.08);
    buildVillage(java, M, index % 2 ? 168 : -186, ((index * 61) % 200) - 100, index);
    if (index % 3 === 0) buildAirstrip(java, M, index % 2 ? -150 : 150, 0, index);

    // --- Laut Jawa: ombak, pulau kecil, dermaga ---
    const ocean = new THREE.Group(); group.add(ocean); biomes.ocean = ocean;
    box(ocean, M.ocean, TERRAIN_WIDTH, 1.1, TILE_LENGTH + 3, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
        const x = ((i * 83 + index * 31) % 460) - 230;
        const z = ((i * 57 + index * 91) % 310) - 155;
        const wake = box(ocean, M.oceanLine, 18 + (i % 4) * 7, 0.08, 0.75, x, 0.72, z);
        wake.rotation.y = ((i + index) % 5 - 2) * 0.08;
    }
    if (index % 3 === 1) {
        const island = cylinder(ocean, M.oceanIslandDry, 25, 0.6, 122, 0.85, -84, 'y', 12);
        island.scale.z = 0.58;
        const green = cylinder(ocean, M.oceanIslandGreen, 19, 0.55, 122, 1.15, -84, 'y', 12);
        green.scale.z = 0.52;
        box(ocean, M.pier, 4.5, 0.8, 34, 122, 1.4, -50);
        buildHut(ocean, M, 112, -88, 8, 7, 4, 0.2);
    }
    if (index % 3 === 2) {
        const island = cylinder(ocean, M.oceanIslandDry, 21, 0.6, -138, 0.85, 62, 'y', 12);
        island.scale.z = 0.6;
        cylinder(ocean, M.oceanIslandGreen, 15, 0.55, -138, 1.15, 62, 'y', 12).scale.z = 0.54;
        box(ocean, M.pier, 4.5, 0.8, 28, -138, 1.4, 92);
    }

    // --- Kalimantan: rimba rapat, sungai lebar, kamp penebangan ---
    const kalimantan = new THREE.Group(); group.add(kalimantan); biomes.kalimantan = kalimantan;
    box(kalimantan, M.kalimantan, TERRAIN_WIDTH, 1.2, TILE_LENGTH + 3, 0, 0, 0);
    for (let i = 0; i < 26; i++) {
        const x = ((i * 67 + index * 41) % 440) - 220;
        const z = ((i * 101 + index * 19) % 310) - 155;
        const crown = cylinder(kalimantan, M.forest, 9 + (i % 5) * 3.2,
            0.55, x, 0.92, z, 'y', 9);
        crown.scale.z = 0.68 + (i % 2) * 0.24;
    }
    const river = box(kalimantan, M.kalimantanRiver, 19, 0.35, TILE_LENGTH,
        68 - (index % 2) * 130, 1.08, 0);
    river.rotation.y = index % 2 ? 0.12 : -0.1;
    if (index % 2 === 0) {
        const yard = box(kalimantan, M.slab, 52, 0.5, 44, index % 4 ? 170 : -172, 1.1, 40);
        yard.rotation.y = 0.04;
        buildHut(kalimantan, M, index % 4 ? 158 : -160, 30, 13, 10, 5, 0.06);
        for (let i = 0; i < 4; i++)
            box(kalimantan, M.pier, 3, 2.4, 22, (index % 4 ? 182 : -150) + i * 5, 2.4, 50);
    }

    ocean.visible = false;
    kalimantan.visible = false;
    return { group, biomes, index };
}

function buildCloud(parent, M, index) {
    const group = new THREE.Group(); parent.add(group);
    for (let i = 0; i < 4; i++) {
        const puff = mesh(group, new THREE.SphereGeometry(1, 9, 6),
            i === 3 ? M.cloudShade : M.cloud, (i - 1.5) * 8, (i % 2) * 1.5, ((i * 7) % 3) * 4);
        puff.scale.set(12 + (index % 3) * 2, 2.4 + (i % 2), 7 + ((i + index) % 3));
        puff.castShadow = false; puff.receiveShadow = false;
    }
    return { group, index, drift: 2.5 + (index % 5), phase: index * 0.73 };
}

// ---------------------------------------------------------------- enemies ---

function buildAircraftVariant(parent, M, type) {
    const g = new THREE.Group(); parent.add(g);
    g.userData.baseSpan = type === 'airC' ? 17 : type === 'airB' ? 20 : 23;
    const mat = type === 'airC' ? M.airC : type === 'airB' ? M.airB : M.airA;
    box(g, mat, type === 'airA' ? 6.5 : 5.2, 2.2, type === 'airA' ? 16 : 13, 0, 0, 0);
    const nose = mesh(g, new THREE.ConeGeometry(type === 'airA' ? 3.4 : 2.8, 7, 5), mat, 0, 0, 9.2);
    nose.rotation.x = -Math.PI * 0.5;
    const wing = box(g, mat, type === 'airC' ? 17 : type === 'airB' ? 20 : 23,
        0.75, type === 'airC' ? 5 : 6.5, 0, 0.15, -0.5);
    wing.rotation.y = type === 'airC' ? 0 : 0.06;
    box(g, M.dark, type === 'airA' ? 11 : 8, 0.55, 3.5, 0, 0.6, -6);
    box(g, M.glass, 4.2, 1.2, 4.8, 0, 1.45, 3.1);
    if (type !== 'airC') {
        cylinder(g, M.dark, 0.32, 4.8, -5.2, 0.3, 5.2, 'z', 8);
        cylinder(g, M.dark, 0.32, 4.8, 5.2, 0.3, 5.2, 'z', 8);
    }
    if (type === 'airA') {
        for (const x of [-7.5, 0, 7.5]) cylinder(g, M.missile, 0.48, 5.5, x, -0.4, 1.2, 'z', 8);
    }
    return g;
}

function buildShipVariant(parent, M, type) {
    const g = new THREE.Group(); parent.add(g);
    const long = type === 'shipA' ? 27 : 23;
    box(g, M.ship, type === 'shipA' ? 10 : 8.5, 2.1, long, 0, 1.5, 0);
    const bow = mesh(g, new THREE.ConeGeometry(type === 'shipA' ? 5 : 4.2, 8, 4), M.ship, 0, 1.5, long * 0.5 + 3.3);
    bow.rotation.x = -Math.PI * 0.5;
    box(g, M.shipDeck, type === 'shipA' ? 7 : 6, 2.8, 8, 0, 3.7, -2);
    box(g, M.dark, 4.2, 2.4, 3.6, 0, 5.7, -3.2);
    cylinder(g, M.dark, 0.45, 4.8, 0, 5.2, 6.8, 'z', 8);
    if (type === 'shipA') {
        for (const x of [-2.4, 2.4]) cylinder(g, M.missile, 0.52, 5.2, x, 4.5, 2.2, 'z', 8);
    }
    return g;
}

function buildEnemySlot(parent, M, index, targetAircraftSpan) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const variants = {
        airC: buildAircraftVariant(group, M, 'airC'),
        airB: buildAircraftVariant(group, M, 'airB'),
        airA: buildAircraftVariant(group, M, 'airA'),
        shipB: buildShipVariant(group, M, 'shipB'),
        shipA: buildShipVariant(group, M, 'shipA'),
    };
    for (const type of ['airC', 'airB', 'airA']) {
        const model = variants[type];
        model.scale.setScalar(targetAircraftSpan / model.userData.baseSpan);
        model.userData.visualSpan = targetAircraftSpan;
    }
    for (const v of Object.values(variants)) v.visible = false;
    return { group, variants, index, active: false };
}

// ---------------------------------------------- instalasi darat (referensi) ---
// Turret AA, tank, bunker dan depot bahan bakar berdiri di medan yang menggulung
// naik ke arah player — persis peran "kotak hijau di halaman kastil" pada gambar
// referensi. Semua varian ada di satu slot pool agar tidak ada mesh lahir runtime.

function buildTurretModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.userData.baseRadius = 9;
    cylinder(g, M.slab, 9, 2.2, 0, 1.1, 0, 'y', 12);
    const turret = new THREE.Group(); g.add(turret); turret.position.y = 2.6;
    box(turret, M.ship, 8, 3.2, 8, 0, 1.4, 0);
    box(turret, M.dark, 3.4, 2.2, 3.4, 0, 3.4, 0);
    cylinder(turret, M.dark, 0.85, 12, -1.8, 3.3, 5.6, 'z', 8);
    cylinder(turret, M.dark, 0.85, 12, 1.8, 3.3, 5.6, 'z', 8);
    box(turret, M.bossTrim, 8.4, 0.5, 1.2, 0, 3.1, -3.6);
    g.userData.turret = turret;
    return g;
}

function buildTankModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.userData.baseRadius = 8;
    box(g, M.ship, 9, 2.6, 15, 0, 2, 0);
    for (const x of [-4.8, 4.8]) box(g, M.dark, 2.6, 3, 15.5, x, 1.9, 0);
    const turret = new THREE.Group(); g.add(turret); turret.position.set(0, 4.2, -0.5);
    box(turret, M.ship, 7, 2.6, 8, 0, 0, 0);
    cylinder(turret, M.dark, 0.8, 13, 0, 0.2, 6.6, 'z', 8);
    box(turret, M.bossTrim, 7.2, 0.4, 1.1, 0, 1.5, -3.2);
    g.userData.turret = turret;
    return g;
}

function buildBunkerModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.userData.baseRadius = 11;
    box(g, M.slab, 22, 5.5, 16, 0, 2.8, 0);
    box(g, M.dark, 18, 1.6, 2.2, 0, 4.4, 7.4);
    box(g, M.slab, 14, 2.2, 11, 0, 6.6, 0);
    for (const x of [-8, 8]) cylinder(g, M.dark, 1.5, 3.4, x, 7.6, -4, 'y', 8);
    g.userData.turret = null;
    return g;
}

function buildDepotModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.userData.baseRadius = 12;
    box(g, M.slab, 30, 0.7, 26, 0, 1.2, 0);
    for (let i = 0; i < 4; i++) {
        const t = cylinder(g, M.wall, 5, 9, -9 + (i % 2) * 18, 5.2, -7 + Math.floor(i / 2) * 14, 'y', 12);
        box(g, M.bossTrim, 10.4, 0.7, 0.7, t.position.x, 7.4, t.position.z);
    }
    box(g, M.wall, 12, 6, 9, 0, 4.2, 12);
    box(g, M.roof, 13.5, 1, 10.5, 0, 7.5, 12);
    g.userData.turret = null;
    return g;
}

function buildGroundSlot(parent, M, index) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const variants = {
        turret: buildTurretModel(group, M),
        tank: buildTankModel(group, M),
        bunker: buildBunkerModel(group, M),
        depot: buildDepotModel(group, M),
    };
    for (const v of Object.values(variants)) v.visible = false;
    return { group, variants, index, active: false };
}

// -------------------------------------------------------------------- boss ---
// Bomber komando: badan besar, empat mesin, tiga pod turret yang terlihat, dan
// strip bahaya. Satu rig saja — dibangun sekali, disembunyikan sampai fase boss.

function buildBoss(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const rig = new THREE.Group(); group.add(rig);
    box(rig, M.boss, 20, 7, 78, 0, 0, 0);
    const nose = mesh(rig, new THREE.ConeGeometry(10, 26, 6), M.boss, 0, 0, 50);
    nose.rotation.x = -Math.PI * 0.5;
    box(rig, M.glass, 11, 3.4, 12, 0, 3.2, 30);
    const wing = box(rig, M.boss, 132, 2.6, 26, 0, 0.4, -4);
    wing.rotation.y = 0.03;
    box(rig, M.bossTrim, 132, 0.6, 3.2, 0, 1.9, -14);
    box(rig, M.boss, 62, 2.2, 15, 0, 1.4, -34);
    for (const x of [-14, 14]) box(rig, M.boss, 9, 9, 16, x, 3, -28);
    const engines = [];
    for (const x of [-46, -24, 24, 46]) {
        const nacelle = cylinder(rig, M.dark, 5.2, 22, x, -1.4, -2, 'z', 12);
        const fan = cylinder(rig, M.bossGlow, 3.9, 1.1, x, -1.4, 8.6, 'z', 10);
        engines.push({ nacelle, fan });
    }
    const turrets = [];
    for (const [x, z] of [[-22, 16], [22, 16], [0, -30]]) {
        const t = new THREE.Group(); rig.add(t); t.position.set(x, 4.4, z);
        box(t, M.ship, 7.5, 4, 7.5, 0, 0, 0);
        cylinder(t, M.dark, 0.9, 13, -1.6, 0.4, 6.5, 'z', 8);
        cylinder(t, M.dark, 0.9, 13, 1.6, 0.4, 6.5, 'z', 8);
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.4, 13);
        t.add(muzzle);
        turrets.push({ group: t, muzzle });
    }
    const pods = [];
    for (const x of [-62, 62]) {
        const pod = new THREE.Group(); rig.add(pod); pod.position.set(x, 0, -2);
        box(pod, M.bossTrim, 9, 5, 20, 0, 0, 0);
        box(pod, M.bossGlow, 6.4, 1.2, 6.4, 0, 2.8, 2);
        pods.push(pod);
    }
    group.userData.boss = { rig, engines, turrets, pods, span: 132, length: 104 };
    return group;
}

// ---------------------------------------------------------------- wingman ---
// Pesawat pendamping kecil (power-up "W" pada referensi) — dua slot tetap.

function buildWingman(parent, M, side, span) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const g = new THREE.Group(); group.add(g);
    const baseSpan = 18;
    box(g, M.wing, 4.4, 1.9, 12, 0, 0, 0);
    const nose = mesh(g, new THREE.ConeGeometry(2.4, 6, 5), M.wing, 0, 0, 8.4);
    nose.rotation.x = -Math.PI * 0.5;
    box(g, M.wing, baseSpan, 0.7, 5.4, 0, 0.1, -0.4);
    box(g, M.dark, 7, 0.5, 3, 0, 0.5, -5.4);
    box(g, M.glass, 3.4, 1, 4, 0, 1.2, 2.6);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, 9.6);
    g.add(muzzle);
    g.scale.setScalar(span / baseSpan);
    return { group, rig: g, muzzle, side, active: false, t: 0 };
}

// ------------------------------------------------------------------ pools ---

function pooledMesh(parent, geometry, material) {
    const m = mesh(parent, geometry, material);
    m.visible = false;
    return { mesh: m, active: false };
}

function buildOrbSlot(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const core = mesh(group, new THREE.SphereGeometry(2.6, 10, 8), M.enemyRound);
    core.castShadow = false; core.receiveShadow = false;
    const halo = flat(group, M.enemyHalo, 5.2, 0, -0.6, 0, 14);
    return { mesh: group, core, halo, active: false };
}

function buildMissileSlot(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const body = cylinder(group, M.missile, 0.55, 6.8, 0, 0, 0, 'z', 8);
    body.castShadow = false;
    box(group, M.missileFin, 3.4, 0.25, 1.1, 0, 0, -2.4);
    box(group, M.fire, 1.15, 0.35, 2.2, 0, 0, -4.4);
    return { mesh: group, active: false };
}

function buildDropSlot(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const money = new THREE.Group(); group.add(money);
    cylinder(money, M.money, 4, 1.4, 0, 0, 0, 'y', 14);
    box(money, M.dark, 0.8, 1.55, 4.5, 0, 0.1, 0);
    const health = new THREE.Group(); group.add(health);
    box(health, M.health, 9, 1.6, 9, 0, 0, 0);
    box(health, M.healthRed, 2.2, 1.75, 6.2, 0, 0.2, 0);
    box(health, M.healthRed, 6.2, 1.75, 2.2, 0, 0.2, 0);
    // POWER: kapsul dengan siluet bintang lima (lima bilah menyilang).
    const power = new THREE.Group(); group.add(power);
    cylinder(power, M.powerCase, 5, 2.2, 0, 0, 0, 'y', 12);
    for (let i = 0; i < 5; i++) {
        const spike = box(power, M.power, 1.8, 1.6, 7.4, 0, 1.2, 0);
        spike.rotation.y = i * Math.PI * 2 / 5;
    }
    // BOMB: drum bersirip.
    const bombPack = new THREE.Group(); group.add(bombPack);
    cylinder(bombPack, M.bombPack, 3.2, 9, 0, 0, 0, 'z', 12);
    mesh(bombPack, new THREE.ConeGeometry(3.2, 5, 10), M.bombPack, 0, 0, 6.4)
        .rotation.x = -Math.PI * 0.5;
    for (const a of [0, Math.PI * 0.5]) {
        const fin = box(bombPack, M.powerCase, 7, 0.5, 3.4, 0, 0, -4.4);
        fin.rotation.z = a;
    }
    // WINGMAN: siluet pesawat kecil.
    const wingPack = new THREE.Group(); group.add(wingPack);
    box(wingPack, M.wingPack, 3, 1.4, 9, 0, 0, 0);
    box(wingPack, M.wingPack, 11, 1, 3.2, 0, 0.2, -0.6);
    box(wingPack, M.powerCase, 5, 0.9, 2, 0, 0.4, -4);
    const variants = { money, health, power, bomb: bombPack, wingman: wingPack };
    for (const v of Object.values(variants)) v.visible = false;
    return { group, variants, money, health, active: false };
}

function buildExplosionSlot(parent, M, index) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const core = mesh(group, new THREE.SphereGeometry(1, 10, 8), M.flash);
    const fire = mesh(group, new THREE.SphereGeometry(1, 10, 8), M.fire);
    const ring = mesh(group, new THREE.RingGeometry(0.55, 1, 24), M.flash);
    ring.rotation.x = -Math.PI * 0.5;
    const debris = [];
    for (let i = 0; i < 8; i++) debris.push(box(group, M.debris,
        1.2 + (i % 3), 0.7 + (i % 2), 2 + ((i + 1) % 3), 0, 0, 0));
    const smoke = [];
    for (let i = 0; i < 4; i++) smoke.push(mesh(group,
        new THREE.SphereGeometry(1, 8, 6), M.smoke));
    return { group, core, fire, ring, debris, smoke, index, active: false };
}

function buildBombFlash(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const sheet = flat(group, M.bombFlash, 1, 0, 0, 0, 8);
    sheet.scale.setScalar(1400);
    const ring = mesh(group, new THREE.RingGeometry(0.86, 1, 40), M.bombRing);
    ring.rotation.x = -Math.PI * 0.5;
    ring.castShadow = false; ring.receiveShadow = false;
    return { group, sheet, ring, active: false, t: 0 };
}

export function ensureStage10FlightWorld(parent = scene) {
    if (built) return root;
    built = true;
    root = new THREE.Group();
    root.name = STAGE10_FLIGHT_KEY;
    parent.add(root);
    const M = mats();

    const terrainTiles = [];
    for (let i = 0; i < TILE_COUNT; i++) terrainTiles.push(buildTerrainTile(root, M, i));
    const clouds = [];
    for (let i = 0; i < 18; i++) clouds.push(buildCloud(root, M, i));

    const playerAircraft = buildArmedHeavyAircraft();
    playerAircraft.name = 'stage10-player-aircraft';
    root.add(playerAircraft);
    const pdata = playerAircraft.userData.transport;
    const authoredAircraft = transportDebug(playerAircraft);
    const F = CFG.campaign.stage10.flight;
    const playerVisualScale = F.playerVisualScale;
    const playerVisualSpan = authoredAircraft.spanUnits * playerVisualScale;
    const playerVisualLength = authoredAircraft.lengthUnits * playerVisualScale;
    const enemyAircraftSpan = playerVisualSpan * F.enemyAircraftScaleRatio;
    playerAircraft.scale.setScalar(playerVisualScale);
    pdata.flightVisual = {
        scale: playerVisualScale,
        span: playerVisualSpan,
        length: playerVisualLength,
        halfSpan: playerVisualSpan * 0.5,
        enemyAircraftSpan,
        enemyAircraftScaleRatio: F.enemyAircraftScaleRatio,
        enemyAircraftHitRadius: enemyAircraftSpan * 0.42,
        wingmanSpan: playerVisualSpan * F.wingman.scaleRatio,
    };
    for (const gear of pdata.gear) {
        gear.strut.visible = false;
        for (const wheel of gear.wheels) wheel.visible = false;
    }
    pdata.ramp.visible = false;
    pdata.cargoBay.visible = false;
    pdata.flightRig = playerAircraft.children[0];

    const wingmen = [];
    for (let i = 0; i < WINGMAN_SLOTS; i++)
        wingmen.push(buildWingman(root, M, i === 0 ? -1 : 1, pdata.flightVisual.wingmanSpan));

    const enemies = [];
    for (let i = 0; i < ENEMY_POOL; i++)
        enemies.push(buildEnemySlot(root, M, i, enemyAircraftSpan));
    const groundTargets = [];
    for (let i = 0; i < GROUND_POOL; i++) groundTargets.push(buildGroundSlot(root, M, i));
    const boss = buildBoss(root, M);

    const playerRounds = [];
    for (let i = 0; i < PLAYER_ROUND_POOL; i++) {
        const p = pooledMesh(root, new THREE.SphereGeometry(0.7, 6, 5), M.playerRound);
        p.mesh.scale.set(1, 1, 6.5); playerRounds.push(p);
    }
    const cannonRounds = [];
    for (let i = 0; i < CANNON_POOL; i++) cannonRounds.push(
        pooledMesh(root, new THREE.SphereGeometry(2.2, 9, 7), M.cannon));
    const enemyRounds = [];
    for (let i = 0; i < ENEMY_ROUND_POOL; i++) enemyRounds.push(buildOrbSlot(root, M));
    const missiles = [];
    for (let i = 0; i < MISSILE_POOL; i++) missiles.push(buildMissileSlot(root, M));
    const dropSlots = [];
    for (let i = 0; i < DROP_POOL; i++) dropSlots.push(buildDropSlot(root, M));
    const explosions = [];
    for (let i = 0; i < EXPLOSION_POOL; i++) explosions.push(buildExplosionSlot(root, M, i));
    const bombFlash = buildBombFlash(root, M);

    const flightLight = new THREE.PointLight(PAL.white, 0.28, 480);
    flightLight.position.set(S10_FLIGHT_X, 120, S10_FLIGHT_START_Z);
    parent.add(flightLight);
    registerStageLight(STAGE10_FLIGHT_KEY, flightLight);

    world = {
        root, M, terrainTiles, clouds, playerAircraft, wingmen, enemies, groundTargets, boss,
        playerRounds, cannonRounds, enemyRounds, missiles,
        drops: dropSlots, explosions, bombFlash, flightLight,
    };
    root.userData.stage10Flight = world;
    registerCampaignWorldRoot({
        key: STAGE10_FLIGHT_KEY, root, bounds: S10_FLIGHT_BOUNDS,
        lightsKey: STAGE10_FLIGHT_KEY,
        warmupViews: [{ x: S10_FLIGHT_X, y: 0, z: -120,
            offset: { x: 0, y: 210, z: 0 } }],
    });
    return root;
}

export function stage10FlightWorld() {
    ensureStage10FlightWorld();
    return world;
}

export function stage10FlightWorldDebug() {
    const W = stage10FlightWorld();
    const visual = W.playerAircraft.userData.transport.flightVisual;
    return {
        built, key: STAGE10_FLIGHT_KEY, rootVisible: W.root.visible,
        origin: { x: S10_FLIGHT_X, z: S10_FLIGHT_START_Z },
        bounds: { ...S10_FLIGHT_BOUNDS },
        terrainTiles: W.terrainTiles.length,
        biomeLayersPerTile: 3,
        clouds: W.clouds.length,
        playerAircraft: {
            armed: true,
            machineGuns: W.playerAircraft.userData.transport.weapons.wingMachineGuns.length,
            cannons: W.playerAircraft.userData.transport.weapons.noseCannons.length,
            gearHidden: W.playerAircraft.userData.transport.gear.every(g => !g.strut.visible),
            visualScale: visual.scale,
            visualSpan: visual.span,
            visualLength: visual.length,
        },
        enemyAircraft: {
            visualSpan: visual.enemyAircraftSpan,
            scaleRatio: visual.enemyAircraftScaleRatio,
            smallerThanPlayer: visual.enemyAircraftSpan < visual.span,
            hitRadius: visual.enemyAircraftHitRadius,
        },
        wingmen: {
            slots: W.wingmen.length,
            span: visual.wingmanSpan,
            smallerThanPlayer: visual.wingmanSpan < visual.span,
        },
        groundTargets: {
            slots: W.groundTargets.length,
            kinds: Object.keys(W.groundTargets[0].variants),
        },
        boss: {
            prebuilt: !!W.boss, visible: W.boss.visible,
            engines: W.boss.userData.boss.engines.length,
            turrets: W.boss.userData.boss.turrets.length,
            pods: W.boss.userData.boss.pods.length,
            span: W.boss.userData.boss.span,
        },
        enemyRoundShape: 'orb',
        pools: {
            enemies: W.enemies.length,
            groundTargets: W.groundTargets.length,
            playerRounds: W.playerRounds.length,
            cannonRounds: W.cannonRounds.length,
            enemyRounds: W.enemyRounds.length,
            missiles: W.missiles.length,
            drops: W.drops.length,
            explosions: W.explosions.length,
            wingmen: W.wingmen.length,
        },
    };
}
