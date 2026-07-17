// SCENE: Campaign STAGE 4 (final) — "Jalan Menuju Alun-Alun".
// Dibuat 2026-07-13; LAYOUT DIROMBAK TOTAL 2026-07-17 dari denah referensi
// user (STASIUN DIHAPUS, diganti ALUN-ALUN): level LUAR-RUANGAN (bukan grid):
// PARKIRAN GEDUNG kecil (barat, sisi UTARA jalan; start = pintu keluar gedung)
// -> JALAN RAYA 2 LAJUR (barat->timur, ~500 m; cover rongsokan slalom) ->
// KOMPLEKS ALUN-ALUN di ujung timur: lapangan alun-alun persegi DIKELILINGI
// jalan ring 2 lajur (SQ = ring + alun, seluruhnya walkable).
// Area boleh-jalan = UNION 3 persegi (parkiran + jalan + kompleks alun-alun).
// GERBANG di mulut ring (GATE_X): TERTUTUP (blocker pejal) selama masih ada
// robot — robot hanya ada di parkiran+jalan (alun-alun steril); bunuh SEMUA
// robot -> gerbang terbuka + BOSS TANK muncul menggelinding ke TENGAH
// alun-alun -> hancurkan tank -> MISSION COMPLETE (tanpa trigger finish).
// KUNCI ARENA BOSS (2026-07-17, permintaan user): begitu player MENGINJAK
// lapangan alun-alun selagi tank hidup, arena TERKUNCI — player dijepit di
// dalam rumput ALUN (tak bisa keluar, bahkan tak bisa mundur ke ring road)
// dan tepi tapak-pandang kamera dijepit di dalam kompleks SQ (alun + ring)
// lewat hook scene `camBounds` (renderer.followViewCam); bebas lagi saat
// boss hancur.

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
import { spawnTank, updateTank, disposeTank, resolveTankBlock } from '../../entities/tank.js';
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
// LAYOUT DIROMBAK TOTAL 2026-07-17 (denah user): PARKIRAN diperkecil lagi
// (100×43 m -> 60×30 m), STASIUN DIHAPUS, dan ujung timur jalan kini masuk ke
// KOMPLEKS ALUN-ALUN (SQ ~86×86 m): lapangan alun-alun (ALUN) dikelilingi
// jalan RING 2 lajur selebar jalan raya (RING_W = 2×ROAD.hz). Seluruh SQ
// (ring + alun) walkable; jalan raya tetap 2 lajur ~500 m.
const ROAD = { x0: OX, x1: OX + 3500, cz: OZ, hz: 32 };                    // jalan 500 m, 2 lajur (|z|<=hz)
const PARK = { x0: OX - 140, x1: OX + 280, z0: OZ - 220, z1: OZ - 10 };    // parkiran kecil (utara-barat)
const SQ = { x0: OX + 3470, x1: OX + 4070, z0: OZ - 300, z1: OZ + 300 };   // kompleks alun-alun (ring + alun)
const RING_W = 64;                                                          // lebar ring 2 lajur (= lebar jalan raya)
const ALUN = { x0: SQ.x0 + RING_W, x1: SQ.x1 - RING_W, z0: SQ.z0 + RING_W, z1: SQ.z1 - RING_W }; // lapangan tengah

export const S4_START = { x: OX - 10, z: OZ - 180 };                        // pintu keluar gedung (parkiran barat-laut)
export const S4_END = { x: (SQ.x0 + SQ.x1) / 2, z: OZ };                   // PUSAT alun-alun (landmark radar + spawn boss)
export const S4_GATE = { x: OX + 3480, z: OZ };                            // gerbang mulut ring (jalan -> alun-alun)
const BOSS_POS = S4_END;                                                    // boss muncul di tengah alun-alun

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

// Titik (x,z) radius r di dalam area boleh-jalan (parkiran ∪ jalan ∪ alun-alun)?
// SQ (ring + lapangan alun-alun) walkable seluruhnya — pemisahan ring/alun
// murni visual; gerbang masuk kompleks dijaga blocker (gateBlocker), bukan union.
export function stage4Walk(x, z, r) {
    if (x >= ROAD.x0 + r && x <= ROAD.x1 - r && Math.abs(z - ROAD.cz) <= ROAD.hz - r) return true;
    if (x >= PARK.x0 + r && x <= PARK.x1 - r && z >= PARK.z0 + r && z <= PARK.z1 - r) return true;
    if (x >= SQ.x0 + r && x <= SQ.x1 - r && z >= SQ.z0 + r && z <= SQ.z1 - r) return true;
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

// GERBANG alun-alun (2026-07-17): mesh panel + blocker pejal di mulut ring —
// tertutup selama masih ada robot; dibuka (mesh hilang + blocker dicabut) saat
// boss muncul. gateBlocker DIBAKE ke nav-grid (dibangun saat build) — tak apa:
// robot tak pernah perlu menyeberanginya (semuanya di barat gerbang).
let roadGate = null, gateBlocker = null;

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

    // --- Beton parkiran ---
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

    // --- KOMPLEKS ALUN-ALUN (2026-07-17): ring jalan 2 lajur mengelilingi
    //     lapangan tengah. Ring = 4 strip aspal (tekstur marka sama dgn jalan
    //     raya, repeat pendek); strip vertikal dibungkus Group ber-yaw 90° agar
    //     markanya membujur utara-selatan. Lapangan = rumput alun-alun. ---
    const ringTex = makeTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#26262a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#1e1e22', '#2e2e33', '#232327', '#333338'], 300, 1, 5);
        g.strokeStyle = 'rgba(206,200,180,0.6)'; g.lineWidth = 4;
        for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, h * 0.5 - 2); g.lineTo(x + 34, h * 0.5 - 2); g.stroke(); }
        g.strokeStyle = 'rgba(206,200,180,0.35)'; g.lineWidth = 3;
        for (const zy of [0.06, 0.94]) { g.beginPath(); g.moveTo(0, h * zy); g.lineTo(w, h * zy); g.stroke(); }
    }, 5, 1);
    const ringMat = new THREE.MeshPhongMaterial({ map: ringTex, normalMap: asphaltNrm, shininess: 6, specular: 0x101014 });
    const mkRingStrip = (cx, cz, len, vertical) => {
        const grp = new THREE.Group();
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, RING_W), ringMat);
        m.rotation.x = -Math.PI / 2;
        m.receiveShadow = true;
        grp.add(m);
        grp.position.set(cx, 0.02, cz);
        if (vertical) grp.rotation.y = Math.PI / 2;   // marka membujur utara-selatan
        scene.add(grp);
    };
    const sqCx = (SQ.x0 + SQ.x1) / 2, sqCz = (SQ.z0 + SQ.z1) / 2;
    mkRingStrip(sqCx, SQ.z0 + RING_W / 2, SQ.x1 - SQ.x0, false);                       // ring utara
    mkRingStrip(sqCx, SQ.z1 - RING_W / 2, SQ.x1 - SQ.x0, false);                       // ring selatan
    mkRingStrip(SQ.x0 + RING_W / 2, sqCz, (SQ.z1 - SQ.z0) - RING_W * 2, true);          // ring barat
    mkRingStrip(SQ.x1 - RING_W / 2, sqCz, (SQ.z1 - SQ.z0) - RING_W * 2, true);          // ring timur
    // Lapangan alun-alun: rumput dgn jalur paving menyilang di tengah
    const grassTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#2f4423'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#28391e', '#3a5029', '#243619', '#33482a'], 260, 1, 4);
    }, 10, 10);
    const alun = new THREE.Mesh(new THREE.PlaneGeometry(ALUN.x1 - ALUN.x0, ALUN.z1 - ALUN.z0),
        new THREE.MeshPhongMaterial({ map: grassTex, shininess: 2, specular: 0x0a0f08 }));
    alun.rotation.x = -Math.PI / 2;
    alun.position.set((ALUN.x0 + ALUN.x1) / 2, 0.03, (ALUN.z0 + ALUN.z1) / 2);
    alun.receiveShadow = true;
    scene.add(alun);
    const paveMat = new THREE.MeshPhongMaterial({ map: concTex, shininess: 5, specular: 0x121110 });
    for (const [sx, sz] of [[ALUN.x1 - ALUN.x0, 40], [40, ALUN.z1 - ALUN.z0]]) {
        const path = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), paveMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set((ALUN.x0 + ALUN.x1) / 2, 0.04, (ALUN.z0 + ALUN.z1) / 2);
        path.receiveShadow = true;
        scene.add(path);
    }

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
    addWall((PARK.x1 + SQ.x0) / 2, -ROAD.hz - T / 2, SQ.x0 - PARK.x1, T, 40);             // utara jalan (timur parkiran -> alun)
    addWall((ROAD.x0 + SQ.x0) / 2, ROAD.hz + T / 2, SQ.x0 - ROAD.x0, T, 40);              // selatan jalan (barat alun)
    // Keliling kompleks ALUN-ALUN: utara/timur/selatan penuh; barat dua segmen
    // dgn BUKAAN selebar jalan (|z|<=hz) = mulut ring tempat jalan raya masuk.
    addWall((SQ.x0 + SQ.x1) / 2, SQ.z0 - T / 2, SQ.x1 - SQ.x0, T, 60);                    // utara alun
    addWall((SQ.x0 + SQ.x1) / 2, SQ.z1 + T / 2, SQ.x1 - SQ.x0, T, 60);                    // selatan alun
    addWall(SQ.x1 + T / 2, (SQ.z0 + SQ.z1) / 2, T, SQ.z1 - SQ.z0, 60);                    // timur alun
    addWall(SQ.x0 - T / 2, (SQ.z0 - ROAD.hz) / 2, T, -ROAD.hz - SQ.z0, 60);               // barat alun (utara bukaan)
    addWall(SQ.x0 - T / 2, (ROAD.hz + SQ.z1) / 2, T, SQ.z1 - ROAD.hz, 60);                // barat alun (selatan bukaan)

    // GERBANG ALUN-ALUN (2026-07-17): panel retak menutup mulut ring — pejal
    // (blocker) selama masih ada robot; dibuka saat boss muncul (openGate).
    const gateTex = makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#514b43'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#453f38', '#5c564d', '#38342e'], 90, 1, 4);
        g.strokeStyle = 'rgba(15,13,10,0.7)'; g.lineWidth = 2;   // retakan
        for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(Math.random() * w, 0); g.lineTo(Math.random() * w, h); g.stroke(); }
    });
    roadGate = new THREE.Mesh(new THREE.BoxGeometry(12, 48, ROAD.hz * 2 + 8),
        new THREE.MeshPhongMaterial({ map: gateTex, shininess: 4, specular: 0x121110 }));
    roadGate.position.set(S4_GATE.x, 24, S4_GATE.z);
    roadGate.castShadow = true; roadGate.receiveShadow = true;
    scene.add(roadGate);
    gateBlocker = {
        x: S4_GATE.x, z: S4_GATE.z, hx: 8, hz: ROAD.hz + 6,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(8, ROAD.hz + 6), top: 48, standable: false
    };
    blockers.push(gateBlocker);

    // --- Cover: mobil rongsok, bus, kontainer, pembatas jalan ---
    const carGeo = new THREE.BoxGeometry(1, 1, 1);
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a222a });
    const CAR_SCALE = 7;   // 1 unit-model -> 7 u (panjang ~35 u, sekelas mobil)
    // Cat mobil sipil Jakarta 2045: perak/putih berdebu, hijau, marun, teal pudar
    // (panduan gaya world/palette.js — buang biru-hitam dingin).
    const SUV_PALETTE = [0x8f8a80, 0xb8b2a6, 0x4a5a50, 0x6e3a34, 0x37505a];
    const SED_PALETTE = [0xb0aa9c, 0x50606a, 0x5a4a34, 0x74423a, 0x46584e];
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
    // Parkiran KECIL (60×30 m): baris parkir dekat tembok utara + rongsokan
    mkSedan(OX + 60, OZ - 186, 1.52);      // baris utara (moncong ke tembok)
    mkCar(OX + 170, OZ - 183, 1.48);
    mkCar(OX - 60, OZ - 100, 0.12);        // rongsok tersebar
    mkSedan(OX + 200, OZ - 95, 1.35);
    mkSedan(OX + 90, OZ - 48, 0.9);        // dekat mulut jalan
    mkContainer(OX + 232, OZ - 165);       // spot 4 tumpukan barang (sudut timur)
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
    mkBarrier(OX + 3380, OZ + 24, 90);     // pembatas bahu selatan sebelum gerbang

    // --- Prop futuristik (entities/futuristic*.js) di area luar: kios/krat/puing
    //     = COVER pejal (blocker, dijauhkan dari koridor supaya konektivitas
    //     union START->END tak putus — diverifikasi flood-fill smoke); bangku &
    //     planter/kios = DEKORASI alun-alun TANPA blocker (nav tak berubah). ---
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
    // ALUN-ALUN: dekorasi TANPA blocker (arena duel tank harus lapang) — bangku
    // di tepi jalur paving + planter di 4 sudut lapangan; kios kecil di ring utara.
    mkPropDecor(buildFuturisticBenchMesh, S4_END.x - 90, OZ + 34, 44, 10, 16);
    mkPropDecor(buildFuturisticBenchMesh, S4_END.x + 90, OZ - 34, 44, 10, 16);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x0 + 24, ALUN.z0 + 24, 26, 34, 26);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x1 - 24, ALUN.z0 + 24, 26, 34, 26);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x0 + 24, ALUN.z1 - 24, 26, 34, 26);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x1 - 24, ALUN.z1 - 24, 26, 34, 26);
    mkPropDecor(buildFuturisticStallMesh, S4_END.x, SQ.z0 + RING_W + 18, 44, 40, 28);
    // Parkiran: tumpukan KRAT (cover) di samping kontainer barang (spot 4).
    mkPropCover(buildFuturisticCrateMesh, OX + 190, OZ - 130, 24, 24, 24, true);
    mkPropCover(buildFuturisticCrateMesh, OX + 165, OZ - 105, 20, 20, 20, true, 0.4);
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
    addLamp(OX + 60, OZ - 120, 0xffe0a0, 0.7, 420);    // parkiran
    addLamp(OX + 220, OZ - 120, 0xffe0a0, 0.7, 420);
    addLamp(OX + 500, OZ - 44, 0xfff0c0, 0.6, 460);    // bahu utara jalan
    addLamp(OX + 1400, OZ - 44, 0xfff0c0, 0.6, 460);
    addLamp(OX + 2300, OZ - 44, 0xfff0c0, 0.6, 460);
    addLamp(S4_END.x, S4_END.z, 0xbfe4ff, 0.8, 620);   // pusat alun-alun

    // --- Nav-grid pathfinder atas union (cover di-bake lewat resolve) ---
    const gx0 = PARK.x0 - 20, gx1 = SQ.x1 + 20, gz0 = SQ.z0 - 20, gz1 = SQ.z1 + 20;
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
// (Retarget 2026-07-17 mengikuti layout alun-alun: robot HANYA di parkiran +
// jalan raya sampai sebelum gerbang alun-alun [x <= ~3400 < GATE 3480] —
// ALUN-ALUN STERIL dari robot; jumlah spot & total 44 robot TIDAK berubah.)
const S4_ROBOTS = [
    [OX + 60, OZ - 170, 3],    // 1 dekat pintu keluar gedung
    [OX + 170, OZ - 150, 4],   // 2 parkiran tengah
    [OX + 60, OZ - 90, 3],     // 3 dekat mobil rongsok
    [OX + 200, OZ - 60, 4],    // 4 dekat kontainer + krat barang
    [OX + 230, OZ - 190, 3],   // 5 sudut timur parkiran
    [OX + 120, OZ + 0, 4],     // 6 awal jalan raya (terbuka)
    [OX + 800, OZ + 0, 4],     // 7 jalan sisi barat
    [OX + 1250, OZ - 14, 3],   // 8 dekat bus rusak
    [OX + 1700, OZ + 0, 4],    // 9 tengah jalan (mobil hancur)
    [OX + 2100, OZ + 8, 3],    // 10 tengah kanan jalan
    [OX + 2450, OZ - 8, 3],    // 11 dekat pembatas bahu jalan
    [OX + 2900, OZ + 0, 3],    // 12 jalan menjelang alun-alun
    [OX + 3320, OZ - 6, 3],    // 13 ujung jalan di depan gerbang alun-alun
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
    put('mag', OX + 220, OZ - 130); put('mag', OX + 40, OZ - 60);     // parkiran
    put('medkit', OX + 130, OZ - 200);
    put('mag', OX + 1400, OZ - 18); put('mag', OX + 2400, OZ + 16);   // jalan
    put('medkit', OX + 1900, OZ + 20);
    put('medkit', OX + 3400, OZ - 18);                                 // sebelum gerbang alun-alun
}

// --- Boss stage 4: TANK penjaga alun-alun (entities/tank.js). Muncul setelah
// SEMUA robot mati — SPAWN DI TENGAH ALUN-ALUN (2026-07-17: menggelinding dari
// sisi timur lapangan ke pusat; wallX ditaruh di BARAT home agar fase smash
// dinding tank TIDAK pernah terpicu) bersamaan GERBANG ring terbuka; MISSION
// COMPLETE saat tank hancur (tanpa trigger finish — stasiun dihapus). ---
let bossSpawned = false, bossDefeated = false;
let tank = null, exitHintT = 0, winT = 0, winFired = false;
const WIN_DELAY_SEC = 2.5;   // jeda visual ledakan tank -> layar MISSION COMPLETE
// KUNCI ARENA BOSS (2026-07-17): true begitu player menginjak lapangan ALUN
// selagi tank hidup — playerCollide menjepit player di dalam lapangan &
// camBounds membatasi kamera; dilepas saat boss kalah / enter() ulang.
let arenaLocked = false;

// Referensi tank aktif (dipakai smoke test utk melumpuhkan boss)
export function currentTank() { return tank; }
// Debug/uji: status kunci arena + rect lapangan (ALUN) & kompleks (SQ)
export const arenaDebug = () => ({ locked: arenaLocked, alun: { ...ALUN }, sq: { ...SQ } });

// Buka gerbang alun-alun: mesh disembunyikan + blocker dicabut dari daftar
// (dipulihkan lagi di enter()). Nav-grid TIDAK dibangun ulang (lihat catatan).
function openGate() {
    if (roadGate) roadGate.visible = false;
    const gi = blockers.indexOf(gateBlocker);
    if (gi >= 0) blockers.splice(gi, 1);
}

function spawnBoss() {
    bossSpawned = true;
    openGate();
    // arena = rect kompleks alun-alun (SQ) — dipakai mekanik ENRAGE/CHARGE tank
    // (charge keluar-masuk arena; sama dgn rect camBounds sehingga tank yang
    // keluar benar-benar di luar pandangan kamera yang dijepit).
    tank = spawnTank({
        homeX: BOSS_POS.x, homeZ: BOSS_POS.z, wallX: BOSS_POS.x - 9999, faceX: S4_START.x,
        arena: { x0: SQ.x0, x1: SQ.x1, z0: SQ.z0, z1: SQ.z1 }
    });
    showStageMsg('THE GATE IS OPEN — A WAR TANK GUARDS THE TOWN SQUARE!');
    updateUI();
}

function onBossDown() {
    bossDefeated = true;
    arenaLocked = false;   // arena terbuka lagi — player bebas berkeliling
    winT = WIN_DELAY_SEC;
    showStageMsg('THE TANK IS DESTROYED — THE TOWN SQUARE IS FREE!');
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
        bossSpawned = false; bossDefeated = false; exitHintT = 0; winT = 0; winFired = false;
        arenaLocked = false;
        // Pasang lagi gerbang alun-alun (mesh + blocker — dicabut openGate saat run sebelumnya)
        if (roadGate) roadGate.visible = true;
        if (gateBlocker && !blockers.includes(gateBlocker)) blockers.push(gateBlocker);
        placeRobots();
        applyLightPreset(scene, 'night');
        camera.position.set(S4_START.x, CFG.player.eyeHeight, S4_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);   // hadap timur (menuju jalan)
        player.vy = 0; player.onGround = true;
        showStageMsg('CLEAR THE HIGHWAY — REACH THE TOWN SQUARE EAST');
        updateUI();
    },

    restartScene: () => stage1Scene,

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Boss TANK: muncul saat SEMUA robot mati (gerbang terbuka + tank
    // menggelinding ke tengah alun-alun); jalankan siklus serangannya tiap
    // frame; tank hancur -> MISSION COMPLETE setelah jeda ledakan singkat.
    updateMode(dt) {
        if (!bossSpawned) {
            if (countStageRobots(4) === 0) spawnBoss();   // semua robot normal habis
        } else if (tank) {
            updateTank(tank, dt);
            if (tank.dead && !bossDefeated) onBossDown();
            if (bossDefeated && !winFired) {
                winT -= dt;
                if (winT <= 0) { winFired = true; gameOver(true); }   // MISSION COMPLETE
            }
            updateUI();   // refresh HP bar tank
        }
    },

    // Dinding = clamp union (menyusur per-sumbu) + cover pejal (termasuk
    // gateBlocker selama gerbang tertutup) + badan tank boss (pejal,
    // 2026-07-17); mendekati gerbang tertutup = hint.
    playerCollide(pos, oldX, oldZ, feetY) {
        slideUnion(pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideUnion(pos, oldX, oldZ, player.radius);
        resolveTankBlock(tank, pos);   // player tidak bisa menembus tank/bangkainya
        // KUNCI ARENA BOSS (2026-07-17): menginjak lapangan ALUN selagi tank
        // hidup mengunci duel; selama terkunci player DIJEPIT di dalam rumput
        // lapangan (WASD/click-move/dodge semua lewat sini) — tak bisa keluar
        // alun-alun, tak bisa mundur ke ring road. Pemicu butuh masuk sedikit
        // lebih dalam (+2) dari jepitan supaya tidak ada dorongan saat terkunci.
        const r = player.radius;
        if (bossSpawned && !bossDefeated && !arenaLocked
            && pos.x > ALUN.x0 + r + 2 && pos.x < ALUN.x1 - r - 2
            && pos.z > ALUN.z0 + r + 2 && pos.z < ALUN.z1 - r - 2) {
            arenaLocked = true;
            showStageMsg('THE DUEL BEGINS — NO WAY OUT UNTIL THE TANK FALLS!');
        }
        if (arenaLocked) {
            if (pos.x < ALUN.x0 + r) pos.x = ALUN.x0 + r;
            else if (pos.x > ALUN.x1 - r) pos.x = ALUN.x1 - r;
            if (pos.z < ALUN.z0 + r) pos.z = ALUN.z0 + r;
            else if (pos.z > ALUN.z1 - r) pos.z = ALUN.z1 - r;
        }
        if (!bossSpawned && Math.abs(pos.z - S4_GATE.z) <= ROAD.hz
            && pos.x > S4_GATE.x - 70 && pos.x < S4_GATE.x + 70) {
            const now = Date.now();
            if (now - exitHintT > 2500) {
                exitHintT = now;
                showPickup('Clear all enemies to open the town square gate!', '#ff4757');
            }
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Hook opsional kamera (renderer.followViewCam, 2026-07-17): selama duel
    // boss terkunci, tepi tapak-pandang kamera TIDAK BOLEH melewati batas
    // kompleks alun-alun (SQ = lapangan + ring road) — pandangan maksimal
    // sampai tembok keliling; null = kamera bebas (default semua scene lain).
    camBounds() {
        return arenaLocked ? { x0: SQ.x0, x1: SQ.x1, z0: SQ.z0, z1: SQ.z1, groundY: 0 } : null;
    },

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
        } else s += bossDefeated ? ' | MISSION COMPLETE' : ' | Reach the town square (east)';
        return s;
    },

    // Landmark: pusat alun-alun (dijepit ke tepi radar saat jauh; hijau saat
    // gerbang terbuka = boss menunggu di sana)
    radarLandmarks(plot) {
        plot(S4_END.x - camera.position.x, S4_END.z - camera.position.z, bossSpawned ? "#2eff6a" : "#ffb04a", 5, true);
    },
};
