// SCENE: Campaign STAGE 4 (final) — "Jalan Menuju Stasiun Kereta Api".
// Dibuat 2026-07-13 dari denah referensi user. Level LUAR-RUANGAN (bukan grid):
// PARKIRAN GEDUNG (barat, sisi UTARA jalan; start = pintu keluar gedung) ->
// JALAN RAYA (barat->timur, ~500 m, banyak cover: mobil/bus/pembatas) ->
// STASIUN KERETA API (timur, sisi SELATAN jalan; finish = pintu masuk stasiun).
// Area boleh-jalan = UNION 3 persegi (parkiran + jalan + pelataran stasiun);
// gedung/tembok keliling & bangunan stasiun = dinding (visual + clamp union).
// ALUR MENANG: bunuh SEMUA robot -> BOSS muncul di ujung TIMUR jalan -> bunuh
// boss -> pintu masuk stasiun aktif -> MISSION COMPLETE.

import { CFG } from '../../core/config.js';
import { player, robots, drops, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle, makeNormalMap, noiseHeight } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { applyLightPreset } from '../../world/lighting.js';
import { showStageMsg, showPickup } from '../../core/dom.js';
import { updateUI } from '../../core/hud.js';
import { gameOver } from '../../core/game.js';
import { NADE_R } from '../../entities/grenades.js';
import { disposeRobot } from '../../entities/robots.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { spawnCampaignRobot, campaignRobotAI, countStageRobots } from './common.js';
import { stage1Scene } from './stage1.js';

// Dunia ditaruh ~120 km dari origin (jauh dari gedung stage 1/2/3). Skala 1 m ≈ 7 u.
const OX = 120000, OZ = 0;
// UTARA = z negatif (atas layar), SELATAN = z positif; BARAT = x kecil, TIMUR = x besar.
const ROAD = { x0: OX, x1: OX + 3500, cz: OZ, hz: 84 };                  // jalan 500 m (|z|<=hz)
const PARK = { x0: OX - 140, x1: OX + 1000, z0: OZ - 470, z1: OZ - 50 }; // parkiran (utara-barat)
const STA = { x0: OX + 2500, x1: OX + 3520, z0: OZ + 50, z1: OZ + 540 }; // pelataran stasiun (selatan-timur)
const STATION_BLD = { x: OX + 3010, z: OZ + 430, hx: 340, hz: 95 };     // bangunan stasiun (pejal; pintu di sisi utara)

export const S4_START = { x: OX - 10, z: OZ - 330 };                     // pintu keluar gedung (parkiran barat-laut)
export const S4_END = { x: OX + 3010, z: OZ + 300 };                    // pintu masuk stasiun (utara bangunan)
const S4_EXIT = { x0: OX + 2890, x1: OX + 3130, z0: OZ + 275, z1: OZ + 330 };  // trigger finish
const BOSS_POS = { x: OX + 3400, z: OZ + 0 };                           // ujung timur jalan

const blockers = [];      // cover pejal (mobil/bus/pembatas/kontainer/bangunan)
let navGrid = null;
let built = false;

// Titik (x,z) radius r di dalam area boleh-jalan (parkiran ∪ jalan ∪ stasiun)?
export function stage4Walk(x, z, r) {
    if (x >= ROAD.x0 + r && x <= ROAD.x1 - r && Math.abs(z - ROAD.cz) <= ROAD.hz - r) return true;
    if (x >= PARK.x0 + r && x <= PARK.x1 - r && z >= PARK.z0 + r && z <= PARK.z1 - r) return true;
    if (x >= STA.x0 + r && x <= STA.x1 - r && z >= STA.z0 + r && z <= STA.z1 - r) return true;
    return false;
}

export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

// slide per-sumbu supaya player MENYUSUR tepi union (tidak menempel/macet)
function slideUnion(pos, oldX, oldZ, r) {
    if (stage4Walk(pos.x, pos.z, r)) return;
    if (stage4Walk(pos.x, oldZ, r)) { pos.z = oldZ; return; }
    if (stage4Walk(oldX, pos.z, r)) { pos.x = oldX; return; }
    pos.x = oldX; pos.z = oldZ;
}

let exitSignMat = null, exitLightRef = null;

export function buildWorld() {
    // --- Tanah dasar gelap (di bawah semua) ---
    const baseTex = makeTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#141310'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#0e0d0a', '#1d1a13', '#26221a', '#0a0908'], 260, 2, 9);
    }, 60, 60);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000),
        new THREE.MeshPhongMaterial({ map: baseTex, shininess: 4, specular: 0x0c0b09 }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(OX + 1700, -0.5, OZ + 40);
    base.receiveShadow = true;
    scene.add(base);

    // --- Aspal jalan raya (marka lajur) ---
    const asphaltNrm = makeNormalMap(128, 128, (g, w, h) => {
        noiseHeight(128, 34, 420, 1, 4)(g, w, h);
    }, 1.4);
    const roadTex = makeTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#26262a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#1e1e22', '#2e2e33', '#232327', '#333338'], 300, 1, 5);
        g.strokeStyle = 'rgba(206,200,180,0.6)';   // marka lajur putus-putus (memanjang X)
        g.lineWidth = 4;
        for (const zy of [0.5]) for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, h * zy - 2); g.lineTo(x + 34, h * zy - 2); g.stroke(); }
    }, 26, 3);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD.x1 - ROAD.x0, ROAD.hz * 2),
        new THREE.MeshPhongMaterial({ map: roadTex, normalMap: asphaltNrm, shininess: 6, specular: 0x101014 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set((ROAD.x0 + ROAD.x1) / 2, 0.02, ROAD.cz);
    road.receiveShadow = true;
    scene.add(road);

    // --- Beton parkiran + pelataran stasiun ---
    const concTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#3a3833'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#332f2a', '#454039', '#2c2925'], 220, 1, 5);
        g.strokeStyle = 'rgba(20,18,15,0.5)'; g.lineWidth = 2;
        for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    }, 18, 8);
    const concMat = new THREE.MeshPhongMaterial({ map: concTex, shininess: 5, specular: 0x121110 });
    const mkPlane = (rx, rz, sx, sz) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), concMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(rx, 0.015, rz);
        m.receiveShadow = true;
        scene.add(m);
    };
    mkPlane((PARK.x0 + PARK.x1) / 2, (PARK.z0 + PARK.z1) / 2, PARK.x1 - PARK.x0, PARK.z1 - PARK.z0);
    mkPlane((STA.x0 + STA.x1) / 2, (STA.z0 + STA.z1) / 2, STA.x1 - STA.x0, STA.z1 - STA.z0);

    // --- Tembok/gedung keliling (VISUAL saja; batas gameplay = clamp union) ---
    const wallTex = makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#4a4640'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#413d37', '#54504a', '#38352f'], 120, 1, 4);
    });
    const wallMat = new THREE.MeshPhongMaterial({ map: wallTex, shininess: 5, specular: 0x14130f });
    const addWall = (cx, cz, sx, sz, hgt = 44) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, hgt, sz), wallMat);
        m.position.set(cx, hgt / 2, cz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
    };
    const T = 16;   // ketebalan tembok
    // Gedung parkiran (utara): dua segmen dgn CELAH pintu keluar di START
    addWall((PARK.x0 + (S4_START.x - 55)) / 2, PARK.z0 - T / 2, (S4_START.x - 55) - PARK.x0, T, 90);
    addWall(((S4_START.x + 55) + PARK.x1) / 2, PARK.z0 - T / 2, PARK.x1 - (S4_START.x + 55), T, 90);
    addWall(PARK.x0 - T / 2, (PARK.z0 + PARK.z1) / 2, T, PARK.z1 - PARK.z0, 80);          // barat parkiran
    addWall(PARK.x1 + T / 2, (PARK.z0 - 95) / 2 + PARK.z0 / 2, T, (-95 - PARK.z0), 60);   // timur parkiran (di atas jalan)
    addWall((PARK.x1 + ROAD.x1) / 2, -ROAD.hz - T / 2, ROAD.x1 - PARK.x1, T, 40);         // utara jalan (timur parkiran)
    addWall((ROAD.x0 + STA.x0) / 2, ROAD.hz + T / 2, STA.x0 - ROAD.x0, T, 40);            // selatan jalan (barat stasiun)
    addWall(ROAD.x1 + T / 2, ROAD.cz - 17, T, ROAD.hz * 2 - 68, 46);                      // timur jalan (celah selatan ke stasiun)
    addWall(STA.x0 - T / 2, (ROAD.hz + STA.z1) / 2, T, STA.z1 - ROAD.hz, 60);             // barat stasiun
    addWall(STA.x1 + T / 2, (STA.z0 + STA.z1) / 2, T, STA.z1 - STA.z0, 60);               // timur stasiun
    addWall((STA.x0 + STA.x1) / 2, STA.z1 + T / 2, STA.x1 - STA.x0, T, 60);               // selatan stasiun

    // --- Bangunan STASIUN (pejal; pintu masuk di sisi utara = END) ---
    const stTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#5a5348'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#4e483e', '#655d51', '#443f36'], 140, 1, 5);
        g.fillStyle = 'rgba(20,18,14,0.5)';
        for (let x = 8; x < w; x += 26) g.fillRect(x, 12, 12, h - 24);   // pilar/jendela
    }, 8, 3);
    const stMat = new THREE.MeshPhongMaterial({ map: stTex, shininess: 8, specular: 0x1a1712 });
    const stBld = new THREE.Mesh(new THREE.BoxGeometry(STATION_BLD.hx * 2, 130, STATION_BLD.hz * 2), stMat);
    stBld.position.set(STATION_BLD.x, 65, STATION_BLD.z);
    stBld.castShadow = true; stBld.receiveShadow = true;
    scene.add(stBld);
    blockers.push({
        x: STATION_BLD.x, z: STATION_BLD.z, hx: STATION_BLD.hx, hz: STATION_BLD.hz,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(STATION_BLD.hx, STATION_BLD.hz), top: 130, standable: false
    });
    // Papan nama stasiun + panah masuk (hijau menyala = penanda finish)
    const stSign = new THREE.Mesh(new THREE.BoxGeometry(160, 14, 3),
        new THREE.MeshBasicMaterial({ color: 0xcfe6ff, toneMapped: false }));
    stSign.position.set(STATION_BLD.x, 118, STATION_BLD.z - STATION_BLD.hz - 2);
    scene.add(stSign);

    // --- Cover: mobil rongsok, bus, kontainer, pembatas jalan ---
    const carGeo = new THREE.BoxGeometry(1, 1, 1);
    const carMats = [0x7a3226, 0x2e4a63, 0x5a5a5e, 0x8a7a2a, 0x4a3a30].map(c =>
        new THREE.MeshLambertMaterial({ color: new THREE.Color(c).offsetHSL(0, -0.1, -0.05) }));
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a222a });
    const addBlockerBox = (x, z, hx, hz, top, standable) => {
        blockers.push({ x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(hx, hz), top, standable });
    };
    const mkCar = (x, z, yaw) => {
        const car = new THREE.Group();
        const bodyMat = carMats[(Math.random() * carMats.length) | 0];
        const body = new THREE.Mesh(carGeo, bodyMat);
        body.scale.set(15, 9, 32); body.position.y = 4.5; body.castShadow = true;
        car.add(body);
        const cabin = new THREE.Mesh(carGeo, Math.random() < 0.5 ? glassMat : bodyMat);
        cabin.scale.set(12, 6, 16); cabin.position.set(0, 10, rand(-3, 1)); cabin.castShadow = true;
        car.add(cabin);
        car.position.set(x, 0, z);
        car.rotation.set(rand(-0.05, 0.05), yaw, rand(-0.06, 0.06));
        scene.add(car);
        addBlockerBox(x, z, 10, 17, 9, false);
    };
    const mkBus = (x, z) => {
        const bus = new THREE.Group();
        const body = new THREE.Mesh(carGeo, new THREE.MeshLambertMaterial({ color: 0x6b5a2a }));
        body.scale.set(20, 16, 70); body.position.y = 8; body.castShadow = true;
        bus.add(body);
        const win = new THREE.Mesh(carGeo, glassMat);
        win.scale.set(21, 5, 60); win.position.y = 12; bus.add(win);
        bus.position.set(x, 0, z); bus.rotation.y = rand(-0.15, 0.15);
        scene.add(bus);
        addBlockerBox(x, z, 12, 36, 16, false);
    };
    const mkContainer = (x, z) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(46, 26, 26),
            new THREE.MeshLambertMaterial({ color: 0x3f6b4a }));
        box.position.set(x, 13, z); box.castShadow = true; box.receiveShadow = true;
        scene.add(box);
        addBlockerBox(x, z, 23, 13, 26, false);
    };
    const mkBarrier = (x, z, sx) => {   // pembatas beton rendah (bisa dipijak)
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 9, 10),
            new THREE.MeshLambertMaterial({ color: 0x8a8378 }));
        m.position.set(x, 4.5, z); m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        addBlockerBox(x, z, sx / 2, 5, 9, true);
    };
    // Parkiran (cover + "tumpukan barang")
    mkCar(OX + 250, OZ - 330, 0.1);
    mkCar(OX + 100, OZ - 150, 1.4);
    mkCar(OX + 520, OZ - 320, -0.2);
    mkContainer(OX + 560, OZ - 190);       // spot 4 tumpukan barang
    mkCar(OX + 780, OZ - 330, 0.3);
    mkCar(OX + 880, OZ - 200, 1.5);
    // Median tengah jalan (beton putus-putus, bisa dipijak)
    for (let x = OX + 260; x < OX + 3300; x += 260) mkBarrier(x, OZ, 120);
    // Jalan: mobil hancur + bus + pembatas
    mkCar(OX + 950, OZ + 45, 1.5);
    mkBus(OX + 1150, OZ + 52);             // spot 8 bus rusak
    mkCar(OX + 1700, OZ - 28, 0.4);        // spot 9 mobil hancur
    mkCar(OX + 2000, OZ + 40, 1.6);
    mkBarrier(OX + 2050, OZ + 60, 90);     // spot 11 pembatas jalan
    mkCar(OX + 2600, OZ - 24, 0.2);
    // Stasiun: pembatas depan
    mkBarrier(OX + 2760, OZ + 150, 120);

    // --- Lampu jalan (atmosfer malam) ---
    const lampFix = new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false });
    const addLamp = (x, z, color, inten, dist) => {
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(x, 60, z); scene.add(L);
        const fix = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), lampFix);
        fix.position.set(x, 60, z); scene.add(fix);
    };
    addLamp(OX + 150, OZ - 260, 0xffe0a0, 0.7, 420);   // parkiran
    addLamp(OX + 650, OZ - 260, 0xffe0a0, 0.7, 420);
    addLamp(OX + 500, OZ, 0xfff0c0, 0.6, 460);         // jalan
    addLamp(OX + 1400, OZ, 0xfff0c0, 0.6, 460);
    addLamp(OX + 2300, OZ, 0xfff0c0, 0.6, 460);
    addLamp(OX + 3100, OZ + 180, 0xbfe4ff, 0.7, 440);  // stasiun

    // Papan EXIT hijau di pintu masuk stasiun = penanda finish (amber -> hijau saat boss tumbang)
    exitSignMat = new THREE.MeshBasicMaterial({ color: 0xd08a2a, toneMapped: false });
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 3), exitSignMat);
    exitSign.position.set(S4_END.x, 30, S4_END.z + 6);
    scene.add(exitSign);
    exitLightRef = new THREE.PointLight(0xffb04a, 0.9, 260, 2);
    exitLightRef.position.set(S4_END.x, 26, S4_END.z);
    scene.add(exitLightRef);

    // --- Nav-grid pathfinder atas union (cover di-bake lewat resolve) ---
    const gx0 = PARK.x0 - 20, gx1 = STA.x1 + 20, gz0 = PARK.z0 - 20, gz1 = STA.z1 + 20;
    const cell = 14;
    navGrid = makeNavGrid(gx0, gz0, cell,
        Math.ceil((gx1 - gx0) / cell), Math.ceil((gz1 - gz0) / cell),
        (x, z) => {
            if (!stage4Walk(x, z, 3.5)) return false;
            _v3.set(x, 0, z);
            resolve(_v3, 3.5, 0);
            return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
        });
}

// Robot stage 4: 13 spot denah [x, z, jumlah] (relatif OX/OZ) + kelas.
// Mayoritas melee C; sebagian penembak B/A di area terbuka jalan raya.
const S4_ROBOTS = [
    [OX + 40, OZ - 310, 3],    // 1 dekat pintu keluar gedung
    [OX + 300, OZ - 300, 4],   // 2 parkiran tengah
    [OX + 120, OZ - 180, 3],   // 3 dekat mobil & cover
    [OX + 560, OZ - 250, 4],   // 4 dekat tumpukan barang
    [OX + 850, OZ - 380, 3],   // 5 sudut parkiran dekat tangga darurat
    [OX + 120, OZ + 0, 4],     // 6 awal jalan raya (terbuka)
    [OX + 900, OZ - 30, 4],    // 7 tengah kiri jalan
    [OX + 1150, OZ + 30, 3],   // 8 dekat bus rusak
    [OX + 1700, OZ - 10, 4],   // 9 tengah jalan (mobil hancur)
    [OX + 2100, OZ + 15, 3],   // 10 tengah kanan jalan
    [OX + 2050, OZ + 40, 3],   // 11 dekat pembatas jalan
    [OX + 3200, OZ - 20, 3],   // 12 akhir jalan sebelum stasiun
    [OX + 3010, OZ + 180, 3],  // 13 depan pintu masuk stasiun
];
const S4_RANGED = { 6: 'B', 7: 'A', 9: 'B', 10: 'A', 12: 'B' };   // index spot (1-based) -> penembak sesekali

export function placeRobots() {
    S4_ROBOTS.forEach(([sx, sz, n], si) => {
        const rangedCls = S4_RANGED[si + 1];
        for (let k = 0; k < n; k++) {
            _v3.set(sx + rand(-24, 24), 0, sz + rand(-18, 18));
            resolve(_v3, 4, 0);
            if (!stage4Walk(_v3.x, _v3.z, 4)) _v3.set(sx, 0, sz);
            const cls = (rangedCls && k === 0) ? rangedCls : 'C';
            spawnCampaignRobot(_v3.x, _v3.z, 4, cls);
        }
    });
    placeSupplies();
}

// SUPPLY: ammo + medkit di parkiran (awal) & sepanjang jalan; tak kedaluwarsa.
function placeSupplies() {
    const put = (type, x, z) => {
        const mesh = type === 'mag' ? buildMagMesh() : buildMedkitMesh();
        mesh.position.set(x, 1, z);
        scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    put('mag', OX + 360, OZ - 260); put('mag', OX + 700, OZ - 300);   // parkiran
    put('medkit', OX + 200, OZ - 350);
    put('mag', OX + 1400, OZ - 40); put('mag', OX + 2400, OZ + 30);   // jalan
    put('medkit', OX + 1900, OZ + 45);
    put('medkit', OX + 3000, OZ + 140);                                // dekat stasiun
}

// --- Boss stage 4: penjaga stasiun di ujung TIMUR jalan. Muncul setelah SEMUA
// robot mati; pintu masuk stasiun aktif setelah boss tumbang. ---
let bossSpawned = false, bossDefeated = false;
let bossRef = null, bossUiT = 0, exitHintT = 0;

function spawnBoss() {
    bossSpawned = true;
    spawnCampaignRobot(BOSS_POS.x, BOSS_POS.z, 4, 'boss');
    bossRef = robots[robots.length - 1];
    showStageMsg('THE AREA IS CLEAR — SOMETHING BIG BLOCKS THE STATION');
    updateUI();
}

function onBossDown() {
    bossDefeated = true; bossRef = null;
    if (exitSignMat) exitSignMat.color.setHex(0x2eff6a);
    if (exitLightRef) { exitLightRef.color.setHex(0x39ff7a); exitLightRef.intensity = 1.0; }
    showStageMsg('THE GUARDIAN IS DOWN — ENTER THE STATION');
    updateUI();
}

export const stage4Scene = {
    id: 'campaign-4',

    // Transisi dari stage 3 (tangga keluar). Bangun dunia sekali; bersihkan
    // robot stage 3 tersisa; tempatkan robot + supply stage 4; reset boss.
    enter() {
        if (!built) { built = true; buildWorld(); }
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 3) {
                disposeRobot(robots[i]);
                scene.remove(robots[i].mesh);
                robots.splice(i, 1);
            }
        }
        bossSpawned = false; bossDefeated = false; bossRef = null; bossUiT = 0; exitHintT = 0;
        if (exitSignMat) exitSignMat.color.setHex(0xd08a2a);
        if (exitLightRef) { exitLightRef.color.setHex(0xffb04a); exitLightRef.intensity = 0.9; }
        placeRobots();
        applyLightPreset(scene, 'night');
        camera.position.set(S4_START.x, CFG.player.eyeHeight, S4_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);   // hadap timur (menuju jalan)
        player.vy = 0; player.onGround = true;
        showStageMsg('REACH THE TRAIN STATION — CROSS THE HIGHWAY EAST');
        updateUI();
    },

    restartScene: () => stage1Scene,

    // Boss: muncul saat SEMUA robot mati; refresh HP bar; deteksi boss tumbang.
    updateMode(dt) {
        if (!bossSpawned) {
            if (countStageRobots(4) === 0) spawnBoss();   // semua robot normal habis
        } else if (!bossDefeated) {
            if (robots.indexOf(bossRef) === -1) onBossDown();
            else { bossUiT -= dt; if (bossUiT <= 0) { bossUiT = 0.2; updateUI(); } }
        }
    },

    // Dinding = clamp union (menyusur per-sumbu) + cover pejal; lalu trigger
    // finish (pintu masuk stasiun) — aktif hanya setelah boss tumbang.
    playerCollide(pos, oldX, oldZ, feetY) {
        slideUnion(pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideUnion(pos, oldX, oldZ, player.radius);
        if (pos.x >= S4_EXIT.x0 && pos.x <= S4_EXIT.x1 && pos.z >= S4_EXIT.z0 && pos.z <= S4_EXIT.z1) {
            if (bossDefeated) gameOver(true);   // masuk stasiun = MISSION COMPLETE
            else {
                const now = Date.now();
                if (now - exitHintT > 2500) {
                    exitHintT = now;
                    showPickup(bossSpawned ? 'Defeat the guardian first!' : 'Clear all enemies to draw out the boss!', '#ff4757');
                }
            }
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Outdoor: peluru tak terhalang dinding interior; habis oleh umur/cover-hit
    bulletBlocked() { return false; },

    grenadeCollide(g, oldGX, oldGZ) {
        if (!stage4Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
    },

    robotAI(z, dt, step) {
        // Outdoor: aktivasi murni jarak (tanpa LOS), pathfinder nav-grid
        return campaignRobotAI(z, dt, step, { walkable: stage4Walk, resolve, nav: navGrid });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        let s = `FINAL — Robots: ${countStageRobots(4)}`;
        if (bossRef && robots.indexOf(bossRef) !== -1) {
            const frac = Math.max(0, bossRef.hp / bossRef.maxHp);
            const blocks = Math.ceil(frac * 10);
            s += ` — BOSS ${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)}`;
        } else s += bossDefeated ? ' | Enter the station!' : ' | Reach the train station (east)';
        return s;
    },

    // Landmark: pintu masuk stasiun (dijepit ke tepi radar saat jauh)
    radarLandmarks(plot) {
        plot(S4_END.x - camera.position.x, S4_END.z - camera.position.z, bossDefeated ? "#2eff6a" : "#ffb04a", 5, true);
    },
};
