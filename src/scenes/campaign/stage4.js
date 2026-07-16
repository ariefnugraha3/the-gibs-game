// SCENE: Campaign STAGE 4 (final) — "Jalan Menuju Stasiun Kereta Api".
// Dibuat 2026-07-13 dari denah referensi user; LAYOUT DIROMBAK 2026-07-16
// (parkiran & pelataran stasiun DIPERKECIL, jalan jadi 2 LAJUR tanpa median).
// Level LUAR-RUANGAN (bukan grid):
// PARKIRAN GEDUNG kecil (barat, sisi UTARA jalan; start = pintu keluar gedung)
// -> JALAN RAYA 2 LAJUR (barat->timur, ~500 m; cover rongsokan slalom di bahu
// bergantian, TANPA pembatas tengah) -> STASIUN KERETA API kecil (timur, sisi
// SELATAN jalan; finish = pintu masuk stasiun).
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
import { saveCampaignStage } from '../../core/saveGame.js';
import { updateUI } from '../../core/hud.js';
import { gameOver } from '../../core/game.js';
import { NADE_R } from '../../entities/grenades.js';
import { disposeRobot } from '../../entities/robots.js';
import { spawnTank, updateTank, disposeTank } from '../../entities/tank.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { buildFuturisticSUVMesh } from '../../entities/futuristicSUV.js';
import { buildFuturisticSedanMesh } from '../../entities/futuristicSedan.js';
import { buildFuturisticCrateMesh } from '../../entities/futuristicCrate.js';
import { buildFuturisticBenchMesh } from '../../entities/futuristicBench.js';
import { buildFuturisticPlanterMesh } from '../../entities/futuristicPlanter.js';
import { buildFuturisticStallMesh } from '../../entities/futuristicStall.js';
import { buildFuturisticRubbleMesh } from '../../entities/futuristicRubble.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots } from './common.js';
import { campaignJumpToStage } from './transition.js';
import { stage1Scene } from './stage1.js';

// Dunia ditaruh ~120 km dari origin (jauh dari gedung stage 1/2/3). Skala 1 m ≈ 7 u.
const OX = 120000, OZ = 0;
// UTARA = z negatif (atas layar), SELATAN = z positif; BARAT = x kecil, TIMUR = x besar.
// LAYOUT DIROMBAK 2026-07-16 (permintaan user): jalan kini HANYA 2 LAJUR
// (lebar total ~9 m, 1 marka tengah putus-putus, TANPA pembatas/median tengah)
// dan luas PARKIRAN + PELATARAN STASIUN diperkecil drastis (parkiran 163×60 m
// -> 100×43 m; pelataran 146×70 m -> 94×50 m, bangunan stasiun ikut mengecil).
// Panjang jalan tetap ~500 m; alur & kontrak scene tak berubah.
const ROAD = { x0: OX, x1: OX + 3500, cz: OZ, hz: 32 };                  // jalan 500 m, 2 lajur (|z|<=hz)
const PARK = { x0: OX - 140, x1: OX + 560, z0: OZ - 310, z1: OZ - 10 };  // parkiran kecil (utara-barat)
const STA = { x0: OX + 2860, x1: OX + 3520, z0: OZ + 10, z1: OZ + 360 }; // pelataran stasiun kecil (selatan-timur)
const STATION_BLD = { x: OX + 3190, z: OZ + 290, hx: 220, hz: 70 };     // bangunan stasiun (pejal; pintu di sisi utara)

export const S4_START = { x: OX - 10, z: OZ - 260 };                     // pintu keluar gedung (parkiran barat-laut)
export const S4_END = { x: OX + 3190, z: OZ + 195 };                    // pintu masuk stasiun (utara bangunan)
const S4_EXIT = { x0: OX + 3090, x1: OX + 3290, z0: OZ + 170, z1: OZ + 225 };  // trigger finish
const BOSS_POS = { x: OX + 3400, z: OZ + 0 };                           // ujung timur jalan

const blockers = [];      // cover pejal (mobil/bus/pembatas/kontainer/bangunan)
let navGrid = null;
let built = false;

// Bangun dunia SEKALI (guard `built`) — dipanggil enter() DAN `stage1.enter`
// (2026-07-16: SEMUA dunia campaign di-pre-build di awal, di balik layar
// loading awal + warmupAll [ikut meng-compile MeshStandard/Physical mobil
// futuristik yang dulu bikin LOADING #2 transisi ke stage 4 paling lama],
// supaya loading antar-stage konsisten ~900 ms).
export function ensureWorld() { if (!built) { built = true; buildWorld(); } }
export const worldBuilt = () => built;   // debug/smoke

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

let exitSignMat = null, exitLightRef = null, bossGate = null;

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
        // 2 LAJUR: SATU marka tengah putus-putus (repeat.z=1 -> tepat di as jalan)
        g.strokeStyle = 'rgba(206,200,180,0.6)';
        g.lineWidth = 4;
        for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, h * 0.5 - 2); g.lineTo(x + 34, h * 0.5 - 2); g.stroke(); }
        // garis tepi menerus di kedua bahu
        g.strokeStyle = 'rgba(206,200,180,0.35)';
        g.lineWidth = 3;
        for (const zy of [0.06, 0.94]) { g.beginPath(); g.moveTo(0, h * zy); g.lineTo(w, h * zy); g.stroke(); }
    }, 26, 1);
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
    addWall(PARK.x1 + T / 2, (PARK.z0 - ROAD.hz) / 2, T, -ROAD.hz - PARK.z0, 60);         // timur parkiran (turun ke bahu jalan)
    addWall((PARK.x1 + ROAD.x1) / 2, -ROAD.hz - T / 2, ROAD.x1 - PARK.x1, T, 40);         // utara jalan (timur parkiran)
    addWall((ROAD.x0 + STA.x0) / 2, ROAD.hz + T / 2, STA.x0 - ROAD.x0, T, 40);            // selatan jalan (barat stasiun)
    addWall(STA.x0 - T / 2, (ROAD.hz + STA.z1) / 2, T, STA.z1 - ROAD.hz, 60);             // barat stasiun
    addWall(STA.x1 + T / 2, (STA.z0 + STA.z1) / 2, T, STA.z1 - STA.z0, 60);               // timur stasiun
    addWall((STA.x0 + STA.x1) / 2, STA.z1 + T / 2, STA.x1 - STA.x0, T, 60);               // selatan stasiun

    // GERBANG BOSS: panel dinding retak di ujung TIMUR jalan (di jalur BOSS_POS) —
    // DITEROBOS oleh tank saat muncul (disembunyikan lewat tank.onWallSmash).
    const gateTex = makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#514b43'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#453f38', '#5c564d', '#38342e'], 90, 1, 4);
        g.strokeStyle = 'rgba(15,13,10,0.7)'; g.lineWidth = 2;   // retakan
        for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(Math.random() * w, 0); g.lineTo(Math.random() * w, h); g.stroke(); }
    });
    // Panel menutup hampir seluruh lebar jalan 2-lajur; CELAH selatan (z +8..+32)
    // = jalur memutar player ke pelataran stasiun (seperti celah desain lama).
    bossGate = new THREE.Mesh(new THREE.BoxGeometry(6, 48, 38),
        new THREE.MeshPhongMaterial({ map: gateTex, shininess: 4, specular: 0x121110 }));
    bossGate.position.set(ROAD.x1 + T / 2 - 2, 24, ROAD.cz - 11);
    bossGate.castShadow = true; bossGate.receiveShadow = true;
    scene.add(bossGate);

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
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a222a });
    const CAR_SCALE = 7;   // 1 unit-model -> 7 u (panjang ~35 u, sekelas mobil)
    const SUV_PALETTE = [0x0a0e1a, 0x1a2230, 0x3a1520, 0x14202a, 0x2a2418];
    const SED_PALETTE = [0x1a1a2e, 0x2a1030, 0x102a2a, 0x301a10, 0x1c2438];
    const addBlockerBox = (x, z, hx, hz, top, standable) => {
        blockers.push({ x, z, hx, hz, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(hx, hz), top, standable });
    };
    // Model mobil MEMANJANG di sumbu-X saat yaw 0 -> blocker MENGIKUTI orientasi
    // (penting utk jalan sempit 2 lajur: mobil sejajar jalan hanya memblokir
    // ~20 u dari lebar 64 u; mobil melintang/parkir memblokir memanjang di z).
    const carHalf = (yaw, hLong, hShort) =>
        Math.abs(Math.sin(yaw)) > 0.5 ? [hShort, hLong] : [hLong, hShort];
    const mkCar = (x, z, yaw) => {
        // model SUV futuristik (entities/futuristicSUV.js), warna divariasikan
        const car = buildFuturisticSUVMesh(CAR_SCALE, SUV_PALETTE[(Math.random() * SUV_PALETTE.length) | 0]);
        car.position.set(x, 0, z);
        car.rotation.set(rand(-0.05, 0.05), yaw, rand(-0.06, 0.06));
        scene.add(car);
        const [hx, hz] = carHalf(yaw, 17, 10);
        addBlockerBox(x, z, hx, hz, 9, false);
    };
    const mkSedan = (x, z, yaw) => {
        // model sedan futuristik (entities/futuristicSedan.js) — lebih pendek/ceper
        const car = buildFuturisticSedanMesh(CAR_SCALE, SED_PALETTE[(Math.random() * SED_PALETTE.length) | 0]);
        car.position.set(x, 0, z);
        car.rotation.set(rand(-0.04, 0.04), yaw, rand(-0.05, 0.05));
        scene.add(car);
        const [hx, hz] = carHalf(yaw, 15, 9);
        addBlockerBox(x, z, hx, hz, 7, false);
    };
    const mkBus = (x, z) => {   // bus mogok SEJAJAR jalan (memanjang X)
        const bus = new THREE.Group();
        const body = new THREE.Mesh(carGeo, new THREE.MeshLambertMaterial({ color: 0x6b5a2a }));
        body.scale.set(70, 16, 20); body.position.y = 8; body.castShadow = true;
        bus.add(body);
        const win = new THREE.Mesh(carGeo, glassMat);
        win.scale.set(60, 5, 21); win.position.y = 12; bus.add(win);
        bus.position.set(x, 0, z); bus.rotation.y = rand(-0.08, 0.08);
        scene.add(bus);
        addBlockerBox(x, z, 36, 12, 16, false);
    };
    const mkContainer = (x, z) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(46, 26, 26),
            new THREE.MeshLambertMaterial({ color: 0x3f6b4a }));
        box.position.set(x, 13, z); box.castShadow = true; box.receiveShadow = true;
        scene.add(box);
        addBlockerBox(x, z, 23, 13, 26, false);
    };
    const mkBarrier = (x, z, sx) => {   // pembatas beton rendah di BAHU jalan (bisa dipijak)
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 9, 10),
            new THREE.MeshLambertMaterial({ color: 0x8a8378 }));
        m.position.set(x, 4.5, z); m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        addBlockerBox(x, z, sx / 2, 5, 9, true);
    };
    // Parkiran KECIL: satu baris parkir dekat tembok utara + rongsokan tersebar
    mkSedan(OX + 150, OZ - 275, 1.52);     // baris utara (moncong ke tembok)
    mkCar(OX + 300, OZ - 272, 1.48);
    mkSedan(OX + 450, OZ - 276, 1.55);
    mkCar(OX + 80, OZ - 140, 0.12);        // rongsok tersebar
    mkSedan(OX + 330, OZ - 120, 1.35);
    mkCar(OX + 500, OZ - 210, 0.25);
    mkSedan(OX + 180, OZ - 55, 0.9);       // dekat mulut jalan
    mkContainer(OX + 430, OZ - 170);       // spot 4 tumpukan barang
    // Jalan 2 LAJUR (TANPA median): rongsokan slalom bergantian bahu utara/selatan,
    // mayoritas SEJAJAR jalan supaya tiap wreck menyisakan satu lajur lolos.
    mkSedan(OX + 420, OZ - 14, 0.08);
    mkCar(OX + 700, OZ + 14, -0.06);
    mkCar(OX + 950, OZ - 12, 0.1);
    mkBus(OX + 1250, OZ + 14);             // spot 8 bus rusak (sejajar jalan)
    mkSedan(OX + 1550, OZ - 14, -0.1);
    mkCar(OX + 1800, OZ + 12, 0.35);       // spot 9 mobil hancur (agak serong)
    mkBarrier(OX + 2050, OZ - 22, 90);     // spot 11 pembatas beton bahu utara
    mkSedan(OX + 2300, OZ + 14, 0.06);
    mkCar(OX + 2600, OZ - 12, -0.08);
    mkSedan(OX + 2950, OZ + 13, 0.1);
    mkCar(OX + 3200, OZ - 14, 0.3);
    // Pelataran stasiun KECIL: parkir sisi barat + pembatas depan pintu
    mkBarrier(OX + 3120, OZ + 90, 110);
    mkSedan(OX + 2900, OZ + 260, 0.05);
    mkCar(OX + 3460, OZ + 200, 1.55);

    // --- Prop futuristik (entities/futuristic*.js) di area luar: kios/krat/puing
    //     = COVER pejal (blocker, dijauhkan dari koridor supaya konektivitas
    //     union START->END tak putus — diverifikasi flood-fill smoke); bangku &
    //     planter = DEKORASI pelataran stasiun TANPA blocker (nav tak berubah). ---
    const mkPropCover = (build, x, z, sx, sy, sz, standable, yaw = 0) => {
        const m = build(sx, sy, sz);
        m.position.set(x, 0, z); if (yaw) m.rotation.y = yaw;
        scene.add(m);
        addBlockerBox(x, z, sx / 2, sz / 2, sy, standable);
    };
    const mkPropDecor = (build, x, z, sx, sy, sz, yaw = 0) => {
        const m = build(sx, sy, sz);
        m.position.set(x, 0, z); if (yaw) m.rotation.y = yaw;
        scene.add(m);
    };
    // Pelataran stasiun: KIOS (cover, tepi barat) + bangku mengapit pintu masuk +
    // planter sudut (dekor — pintu masuk END di x≈OX+3190, dijauhkan).
    mkPropCover(buildFuturisticStallMesh, OX + 2940, OZ + 150, 44, 40, 28, false);
    mkPropDecor(buildFuturisticBenchMesh, OX + 3080, OZ + 212, 44, 10, 16);
    mkPropDecor(buildFuturisticBenchMesh, OX + 3300, OZ + 212, 44, 10, 16);
    mkPropDecor(buildFuturisticPlanterMesh, OX + 2890, OZ + 40, 26, 34, 26);
    mkPropDecor(buildFuturisticPlanterMesh, OX + 3470, OZ + 40, 26, 34, 26);
    // Parkiran: tumpukan KRAT (cover) di samping kontainer barang (spot 4).
    mkPropCover(buildFuturisticCrateMesh, OX + 500, OZ - 120, 24, 24, 24, true);
    mkPropCover(buildFuturisticCrateMesh, OX + 478, OZ - 92, 20, 20, 20, true, 0.4);
    // Jalan: PUING runtuhan (cover) menempel tembok UTARA (lajur selatan terbuka).
    mkPropCover(buildFuturisticRubbleMesh, OX + 1500, OZ - 24, 40, 14, 24, true);

    // --- Lampu jalan (atmosfer malam) ---
    const lampFix = new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false });
    const addLamp = (x, z, color, inten, dist) => {
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(x, 60, z); scene.add(L);
        const fix = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), lampFix);
        fix.position.set(x, 60, z); scene.add(fix);
    };
    addLamp(OX + 150, OZ - 160, 0xffe0a0, 0.7, 420);   // parkiran
    addLamp(OX + 450, OZ - 160, 0xffe0a0, 0.7, 420);
    addLamp(OX + 500, OZ - 44, 0xfff0c0, 0.6, 460);    // bahu utara jalan
    addLamp(OX + 1400, OZ - 44, 0xfff0c0, 0.6, 460);
    addLamp(OX + 2300, OZ - 44, 0xfff0c0, 0.6, 460);
    addLamp(OX + 3190, OZ + 120, 0xbfe4ff, 0.7, 440);  // stasiun

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
// (Koordinat diretarget 2026-07-16 mengikuti layout baru: parkiran & stasiun
// kecil, jalan 2 lajur — jumlah spot & total 44 robot TIDAK berubah.)
const S4_ROBOTS = [
    [OX + 40, OZ - 260, 3],    // 1 dekat pintu keluar gedung
    [OX + 260, OZ - 220, 4],   // 2 parkiran tengah
    [OX + 100, OZ - 120, 3],   // 3 dekat mobil rongsok
    [OX + 430, OZ - 120, 4],   // 4 dekat kontainer + krat barang
    [OX + 480, OZ - 250, 3],   // 5 sudut timur parkiran
    [OX + 120, OZ + 0, 4],     // 6 awal jalan raya (terbuka)
    [OX + 800, OZ + 0, 4],     // 7 jalan sisi barat
    [OX + 1250, OZ - 14, 3],   // 8 dekat bus rusak
    [OX + 1700, OZ + 0, 4],    // 9 tengah jalan (mobil hancur)
    [OX + 2100, OZ + 8, 3],    // 10 tengah kanan jalan
    [OX + 2450, OZ - 8, 3],    // 11 dekat pembatas bahu jalan
    [OX + 3300, OZ + 0, 3],    // 12 akhir jalan sebelum stasiun
    [OX + 3190, OZ + 120, 3],  // 13 depan pintu masuk stasiun
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
    put('mag', OX + 280, OZ - 180); put('mag', OX + 460, OZ - 60);    // parkiran
    put('medkit', OX + 120, OZ - 290);
    put('mag', OX + 1400, OZ - 18); put('mag', OX + 2400, OZ + 16);   // jalan
    put('medkit', OX + 1900, OZ + 20);
    put('medkit', OX + 3150, OZ + 60);                                 // dekat stasiun
}

// --- Boss stage 4: TANK penjaga stasiun (entities/tank.js). Muncul setelah
// SEMUA robot mati — MENABRAK dinding di ujung TIMUR jalan lalu diam menembaki
// player; pintu masuk stasiun aktif setelah tank hancur. ---
let bossSpawned = false, bossDefeated = false;
let tank = null, exitHintT = 0;

// Referensi tank aktif (dipakai smoke test utk melumpuhkan boss)
export function currentTank() { return tank; }

function spawnBoss() {
    bossSpawned = true;
    tank = spawnTank({ homeX: BOSS_POS.x, homeZ: BOSS_POS.z, wallX: ROAD.x1 + 8, faceX: S4_START.x });
    tank.onWallSmash = () => { if (bossGate) bossGate.visible = false; };
    showStageMsg('THE HIGHWAY SHAKES — A WAR TANK SMASHES THROUGH!');
    updateUI();
}

function onBossDown() {
    bossDefeated = true;
    if (exitSignMat) exitSignMat.color.setHex(0x2eff6a);
    if (exitLightRef) { exitLightRef.color.setHex(0x39ff7a); exitLightRef.intensity = 1.0; }
    showStageMsg('THE TANK IS DESTROYED — ENTER THE STATION');
    updateUI();
}

export const stage4Scene = {
    id: 'campaign-4',

    // Transisi dari stage 3 (tangga keluar). Bangun dunia sekali; bersihkan
    // robot stage 3 tersisa; tempatkan robot + supply stage 4; reset boss.
    enter() {
        saveCampaignStage(4);   // checkpoint: campaign berada di stage 4 (final)
        ensureWorld();   // normalnya sudah dibangun stage1.enter (pre-build) — guard jaga-jaga
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 3) {
                disposeRobot(robots[i]);
                scene.remove(robots[i].mesh);
                robots.splice(i, 1);
            }
        }
        if (tank) { disposeTank(tank); tank = null; }
        bossSpawned = false; bossDefeated = false; exitHintT = 0;
        if (bossGate) bossGate.visible = true;   // pasang lagi gerbang boss
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

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Boss TANK: muncul saat SEMUA robot mati (menabrak dinding timur); jalankan
    // siklus serangannya tiap frame; deteksi saat hancur -> buka pintu stasiun.
    updateMode(dt) {
        if (!bossSpawned) {
            if (countStageRobots(4) === 0) spawnBoss();   // semua robot normal habis
        } else if (tank) {
            updateTank(tank, dt);
            if (tank.dead && !bossDefeated) onBossDown();
            updateUI();   // refresh HP bar tank
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
                    showPickup(bossSpawned ? 'Destroy the tank first!' : 'Clear all enemies to draw out the boss!', '#ff4757');
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

    clampRobot(z, oldX, oldZ) { campaignClampRobot(z, oldX, oldZ, { walkable: stage4Walk, resolve }); },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() {
        let s = `FINAL — Robots: ${countStageRobots(4)}`;
        if (tank && !bossDefeated) {
            const frac = Math.max(0, tank.hp / tank.maxHp);
            const blocks = Math.ceil(frac * 10);
            s += ` — TANK ${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)}`;
        } else s += bossDefeated ? ' | Enter the station!' : ' | Reach the train station (east)';
        return s;
    },

    // Landmark: pintu masuk stasiun (dijepit ke tepi radar saat jauh)
    radarLandmarks(plot) {
        plot(S4_END.x - camera.position.x, S4_END.z - camera.position.z, bossDefeated ? "#2eff6a" : "#ffb04a", 5, true);
    },
};
