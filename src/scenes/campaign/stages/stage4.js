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

import { CFG } from '../../../core/config.js';
import { player, robots, drops, _v3 } from '../../../core/state.js';
import { scene, camera, SCREEN_UP } from '../../../core/renderer.js';
import { stopMusic } from '../../../utils/sfx.js';
import { makeTexture, speckle, makeNormalMap, noiseHeight } from '../../../utils/textures.js';
import { rand } from '../../../utils/math.js';
import { resolveBlockers, blockersGroundHeight } from '../../../utils/collision.js';
import { makeNavGrid } from '../../../utils/pathfind.js';
import { applyLightPreset } from '../../../world/lighting.js';
import { PAL } from '../../../world/palette.js';
import { makeFacadeTex, makeLitTex, makeCityMat, fillBuildingInstances, CITY_PALETTE } from '../../../world/facades.js';
import { showStageMsg, showPickup } from '../../../core/dom.js';
import { saveCampaignStage } from '../../../core/saveGame.js';
import { updateUI } from '../../../core/hud.js';
import { gameOver } from '../../../core/game.js';
import { NADE_R } from '../../../entities/grenades.js';
import { disposeRobot } from '../../../entities/robots.js';
import { updateTank, disposeTank, resolveTankBlock } from '../../../entities/tank.js';
import { buildMedkitMesh, buildMagMesh } from '../../../entities/drops.js';
import { buildFuturisticSUVMesh } from '../../../entities/futuristicSUV.js';
import { buildFuturisticSedanMesh } from '../../../entities/futuristicSedan.js';
import { buildFuturisticBenchMesh } from '../../../entities/futuristicBench.js';
import { buildFuturisticPlanterMesh } from '../../../entities/futuristicPlanter.js';
import { buildFuturisticStallMesh } from '../../../entities/futuristicStall.js';
import { buildFuturisticRubbleMesh } from '../../../entities/futuristicRubble.js';
import { spawnCampaignRobot, campaignRobotAI, campaignClampRobot, countStageRobots, campaignAwardKill } from '../utility/common.js';
import { spawnBarrel, resolveBarrelBlock, resetBarrels } from '../../../entities/barrels.js';
import { exitCityEnv } from '../utility/cityscape.js';
import { campaignJumpToStage } from '../utility/transition.js';
import { stage1Scene } from './stage1.js';
import { createTankBossIntro } from '../cutscenes/tankBossIntro.js';

// Dunia ditaruh ~120 km dari origin (jauh dari gedung stage 1/2/3). Skala 1 m ≈ 7 u.
const OX = 120000, OZ = 0;
// UTARA = z negatif (atas layar), SELATAN = z positif; BARAT = x kecil, TIMUR = x besar.
// LAYOUT DIROMBAK TOTAL 2026-07-17 (denah user): PARKIRAN diperkecil lagi
// (100×43 m -> 60×30 m), STASIUN DIHAPUS, dan ujung timur jalan kini masuk ke
// KOMPLEKS ALUN-ALUN (SQ ~86×86 m): lapangan alun-alun (ALUN) dikelilingi
// jalan RING 2 lajur selebar jalan raya (RING_W = 2×ROAD.hz). Seluruh SQ
// (ring + alun) walkable; jalan raya tetap 2 lajur ~500 m.
// hz 38.5 => koridor 77 u: aspal 49 u (7 m = 2 lajur × 3.5 m) + trotoar 14 u (2 m) tiap sisi (2026-07-18, permintaan user).
const ROAD = { x0: OX - 140, x1: OX + 3500, cz: OZ, hz: 38.5 };            // jalan 2 lajur; ujung barat DIPERPANJANG (2026-07-18) sampai mentok tepi barat parkiran (PARK.x0)
const PARK = { x0: OX - 140, x1: OX + 280, z0: OZ - 220, z1: OZ - 10 };    // parkiran kecil (utara-barat)
const SQ = { x0: OX + 3470, x1: OX + 4070, z0: OZ - 300, z1: OZ + 300 };   // kompleks alun-alun (ring + alun)
const RING_W = 64;                                                          // lebar ring 2 lajur (= lebar jalan raya)
const ALUN = { x0: SQ.x0 + RING_W, x1: SQ.x1 - RING_W, z0: SQ.z0 + RING_W, z1: SQ.z1 - RING_W }; // lapangan tengah

export const S4_START = { x: OX - 10, z: OZ - 180 };                        // pintu keluar gedung (parkiran barat-laut)
export const S4_END = { x: (SQ.x0 + SQ.x1) / 2, z: OZ };                   // PUSAT alun-alun (landmark radar + heli penjemput)
export const S4_GATE = { x: OX + 3480, z: OZ };                            // gerbang mulut ring (jalan -> alun-alun)
// CUTSCENE PENJEMPUTAN (2026-07-17): heli menunggu di PUSAT alun; tank datang
// dari UTARA menembaknya lalu parkir di DEPAN bangkai (barat = arah hidung
// heli & arah kedatangan player) — pusat kini terisi bangkai, jadi home boss
// BUKAN lagi S4_END. WRECK_CLEAR = radius lingkaran anti-tabrak bangkai yang
// di-inject ke tank (defleksi arah charge + slide, entities/tank.js).
const HELI_POS = S4_END;
const BOSS_POS = { x: S4_END.x - 90, z: S4_END.z };
const WRECK_CLEAR = 58;
export const S4_BOSS = BOSS_POS;   // utk smoke test

const blockers = [];      // cover pejal (mobil/bus/pembatas/kontainer/bangunan)
let navGrid = null;
let built = false;

// === ZONA GAMEPLAY BEBAS-DEKOR (2026-07-19, permintaan user): gedung/pohon/
// dekor roadside DILARANG berdiri di area parkiran, koridor jalan raya
// (aspal + trotoar), dan kompleks alun-alun (ring + lapangan). Semua penempatan
// dekor lewat claimDecor (footprint dicatat + ditolak bila kena zona ATAU
// menimpa dekor lain) — ditegakkan smoke test lewat roadsideDebug(). ===
const DECOR_ZONES = [
    { x0: PARK.x0 - 6, x1: PARK.x1 + 6, z0: PARK.z0 - 6, z1: PARK.z1 + 6 },
    { x0: ROAD.x0 - 6, x1: SQ.x0 + 6, z0: ROAD.cz - ROAD.hz - 2, z1: ROAD.cz + ROAD.hz + 2 },
    { x0: SQ.x0 - 6, x1: SQ.x1 + 6, z0: SQ.z0 - 6, z1: SQ.z1 + 6 },
];
const decorRects = [];
function clearOfZones(x0, x1, z0, z1) {
    return DECOR_ZONES.every(zn => x1 < zn.x0 || x0 > zn.x1 || z1 < zn.z0 || z0 > zn.z1);
}
function claimDecor(x0, x1, z0, z1) {
    if (!clearOfZones(x0, x1, z0, z1)) return false;
    for (const r of decorRects) if (!(x1 < r.x0 || x0 > r.x1 || z1 < r.z0 || z0 > r.z1)) return false;
    decorRects.push({ x0, x1, z0, z1 });
    return true;
}
// Debug/uji: jumlah footprint dekor terklaim + semuanya bebas zona gameplay.
export const roadsideDebug = () => ({
    count: decorRects.length,
    clear: decorRects.every(r => clearOfZones(r.x0, r.x1, r.z0, r.z1)),
});

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

// === OCCLUSION FADE (2026-07-18, permintaan user): objek dekor yg menutup garis
// pandang kamera->player/robot dibuat semi-transparan (≈45%) supaya entitas tetap
// terlihat; pulih opak saat tak menutup. Kamera dari BARAT-DAYA (SCREEN_UP =
// timur-laut), jadi occluder = objek di sisi kamera (barat-daya) dari entitas &
// cukup tinggi utk menutup garis pandang miring di titik itu. ===
const occluders = [];
function registerOccluder(obj, radius, top) {
    const items = [], seen = new Set();
    obj.traverse((m) => {
        if (!m.material) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
            if (seen.has(mat)) continue;
            seen.add(mat);
            items.push({ mat, baseOp: (mat.opacity == null ? 1 : mat.opacity), baseTr: !!mat.transparent });
        }
    });
    occluders.push({ x: obj.position.x, z: obj.position.z, radius, top, f: 1, items });
}
function updateOccluders(dt) {
    if (!occluders.length) return;
    const ux = -SCREEN_UP.x, uz = -SCREEN_UP.z;   // ke arah kamera (barat-daya), unit
    const vx = SCREEN_UP.z, vz = -SCREEN_UP.x;     // tegak lurus (kanan layar), unit
    const px = camera.position.x, pz = camera.position.z;
    const hits = (o, ex, ez) => {
        const dx = o.x - ex, dz = o.z - ez;
        const along = dx * ux + dz * uz;                       // sejauh mana ke arah kamera
        if (along < 3) return false;                            // objek harus DI DEPAN entitas (sisi kamera)
        if (o.top < (7 + 1.09 * along) - 14) return false;      // terlalu pendek utk menutup garis pandang di titik itu
        return Math.abs(dx * vx + dz * vz) < o.radius + 12;     // sejajar di layar
    };
    for (const o of occluders) {
        let occ = hits(o, px, pz);
        if (!occ) {
            for (const z of robots) {
                const rx = z.mesh.position.x, rz = z.mesh.position.z;
                if (Math.abs(rx - px) > 320 || Math.abs(rz - pz) > 320) continue;   // hanya robot dekat/di layar
                if (hits(o, rx, rz)) { occ = true; break; }
            }
        }
        o.f += ((occ ? 0.45 : 1) - o.f) * Math.min(1, dt * 9);
        const faded = o.f < 0.985;
        for (const it of o.items) { it.mat.opacity = it.baseOp * o.f; it.mat.transparent = it.baseTr || faded; }
    }
}
// Debug/uji: jumlah occluder terdaftar + faktor fade paling kecil saat ini.
export const occluderDebug = () => ({ count: occluders.length, minF: occluders.reduce((a, o) => Math.min(a, o.f), 1) });

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

    // --- TROTOAR (2026-07-18, permintaan user): strip beton datar selebar 1.5 m
    //     (≈10.5 u) di KEDUA sisi jalan raya DAN mengapit jalan ring alun-alun
    //     (tepi luar dekat tembok + tepi dalam dekat rumput). Murni dekor (beton
    //     terang vs aspal gelap + garis kerb) — tanpa blocker, nav tak berubah. ---
    const WALK_W = 14;   // 2 m × 7 u/m (2026-07-18, dilebarkan dari 1.5 m atas permintaan user)
    const walkTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#6f685c'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#645d52', '#7a7367', '#585248', '#6a6459'], 240, 1, 5);
    }, 4, 4);
    const walkMat = new THREE.MeshPhongMaterial({ map: walkTex, shininess: 4, specular: 0x141310 });
    const curbMat = new THREE.MeshBasicMaterial({ color: 0xb8b1a1, toneMapped: false });
    const sidewalk = (cx, cz, sx, sz) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), walkMat);
        m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.045, cz); m.receiveShadow = true;
        scene.add(m);
    };
    const curbLine = (cx, cz, sx, sz) => {   // garis kerb tipis (datar) di tepi jalan
        const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), curbMat);
        m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.05, cz); scene.add(m);
    };
    // JALAN RAYA: trotoar sisi utara & selatan (berhenti di mulut kompleks alun).
    {
        const x0 = ROAD.x0, x1 = SQ.x0, mid = (x0 + x1) / 2, len = x1 - x0;
        sidewalk(mid, -ROAD.hz + WALK_W / 2, len, WALK_W);   // sisi utara
        sidewalk(mid, ROAD.hz - WALK_W / 2, len, WALK_W);    // sisi selatan
        curbLine(mid, -ROAD.hz + WALK_W, len, 1.4);
        curbLine(mid, ROAD.hz - WALK_W, len, 1.4);
    }
    // RING ALUN-ALUN: trotoar tepi LUAR (dekat tembok keliling) & tepi DALAM
    // (mengelilingi lapangan rumput); bukaan gerbang barat (|z|<=ROAD.hz) dilewati.
    {
        const cx = (SQ.x0 + SQ.x1) / 2, cz = (SQ.z0 + SQ.z1) / 2;
        const W = SQ.x1 - SQ.x0, H = SQ.z1 - SQ.z0;
        sidewalk(cx, SQ.z0 + WALK_W / 2, W, WALK_W);                       // luar utara
        sidewalk(cx, SQ.z1 - WALK_W / 2, W, WALK_W);                       // luar selatan
        sidewalk(SQ.x1 - WALK_W / 2, cz, WALK_W, H - 2 * WALK_W);          // luar timur
        sidewalk(SQ.x0 + WALK_W / 2, (SQ.z0 - ROAD.hz) / 2, WALK_W, -ROAD.hz - SQ.z0);   // luar barat (utara bukaan)
        sidewalk(SQ.x0 + WALK_W / 2, (ROAD.hz + SQ.z1) / 2, WALK_W, SQ.z1 - ROAD.hz);    // luar barat (selatan bukaan)
        const aw = ALUN.x1 - ALUN.x0, ah = ALUN.z1 - ALUN.z0;
        sidewalk(cx, ALUN.z0 - WALK_W / 2, aw + 2 * WALK_W, WALK_W);       // dalam utara
        sidewalk(cx, ALUN.z1 + WALK_W / 2, aw + 2 * WALK_W, WALK_W);       // dalam selatan
        sidewalk(ALUN.x0 - WALK_W / 2, cz, WALK_W, ah);                    // dalam barat
        sidewalk(ALUN.x1 + WALK_W / 2, cz, WALK_W, ah);                    // dalam timur
    }

    // --- Fasad GEDUNG parkiran (visual; pintu keluar player). SEMUA TEMBOK
    //     PEMBATAS LAIN DIHAPUS 2026-07-19 (permintaan user — jelek): tembok
    //     keliling kompleks alun-alun diganti PAGAR HEDGE rendah + pilar beton,
    //     panel gerbang diganti DERETAN PEMBATAS JALAN (lihat bawah); batas
    //     gameplay tetap clamp union (stage4Walk) yang tak terlihat. Fasad
    //     gedung memakai tekstur jendela besar supaya terbaca sbg gedung. ---
    const bldMat = new THREE.MeshLambertMaterial({ color: 0x6a655c, map: makeFacadeTex(2) });
    const addWall = (cx, cz, sx, sz, hgt = 44) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, hgt, sz), bldMat);
        m.position.set(cx, hgt / 2, cz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
    };
    const T = 16;   // ketebalan fasad gedung
    // Gedung parkiran (utara): dua segmen dgn CELAH pintu keluar di START
    addWall((PARK.x0 + (S4_START.x - 55)) / 2, PARK.z0 - T / 2, (S4_START.x - 55) - PARK.x0, T, 90);
    addWall(((S4_START.x + 55) + PARK.x1) / 2, PARK.z0 - T / 2, PARK.x1 - (S4_START.x + 55), T, 90);
    addWall(PARK.x0 - T / 2, (PARK.z0 + PARK.z1) / 2, T, PARK.z1 - PARK.z0, 80);          // barat parkiran (backing gedung)
    // PAGAR KELILING ALUN-ALUN (2026-07-19, pengganti tembok 60 unit): hedge
    // hijau rendah + pilar beton pendek khas alun-alun — murni dekor (player
    // sudah dijepit union); bukaan barat (|z|<=hz) = mulut ring dari jalan raya.
    const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x2e4426 });
    const pillarMat = new THREE.MeshLambertMaterial({ color: PAL.concrete });
    const hedge = (cx, cz, sx, sz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 7, sz), hedgeMat);
        m.position.set(cx, 3.5, cz); m.receiveShadow = true; scene.add(m);
    };
    const pillar = (cx, cz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(5, 13, 5), pillarMat);
        m.position.set(cx, 6.5, cz); m.castShadow = true; scene.add(m);
    };
    hedge((SQ.x0 + SQ.x1) / 2, SQ.z0 - 4, SQ.x1 - SQ.x0 + 14, 6);                         // utara
    hedge((SQ.x0 + SQ.x1) / 2, SQ.z1 + 4, SQ.x1 - SQ.x0 + 14, 6);                         // selatan
    hedge(SQ.x1 + 4, (SQ.z0 + SQ.z1) / 2, 6, SQ.z1 - SQ.z0);                              // timur
    hedge(SQ.x0 - 4, (SQ.z0 - ROAD.hz - 6) / 2, 6, (-ROAD.hz - 6) - SQ.z0);               // barat (utara bukaan)
    hedge(SQ.x0 - 4, (ROAD.hz + 6 + SQ.z1) / 2, 6, SQ.z1 - (ROAD.hz + 6));                // barat (selatan bukaan)
    for (let x = SQ.x0; x <= SQ.x1 + 1; x += 120) { pillar(x, SQ.z0 - 4); pillar(x, SQ.z1 + 4); }
    for (let z = SQ.z0; z <= SQ.z1 + 1; z += 120) {
        pillar(SQ.x1 + 4, z);
        if (Math.abs(z - ROAD.cz) > ROAD.hz + 10) pillar(SQ.x0 - 4, z);
    }

    // GERBANG ALUN-ALUN (DIROMBAK 2026-07-19, permintaan user): panel beton
    // retak diganti DERETAN PEMBATAS JALAN bergaris merah-putih (road barrier
    // ala pembatas lalu lintas Jakarta, foto referensi user) menutup mulut
    // ring. MEKANIK TIDAK BERUBAH: gateBlocker pejal selama masih ada robot;
    // openGate menyembunyikan mesh + mencabut blocker (dipulihkan enter()).
    const stripeTex = makeTexture(64, 32, (g, w, h) => {
        g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, w, h);   // putih hangat (PAL.white)
        g.fillStyle = '#b3402e';                            // merah bata (PAL.hazard)
        for (let x = -h; x < w + h; x += 16) {
            g.beginPath();
            g.moveTo(x, h); g.lineTo(x + 8, h); g.lineTo(x + 8 + h, 0); g.lineTo(x + h, 0);
            g.closePath(); g.fill();
        }
    }, 2, 1);
    const barrierMat = new THREE.MeshLambertMaterial({ map: stripeTex });
    const barrierTopMat = new THREE.MeshLambertMaterial({ color: PAL.hazard });
    const barrierFootMat = new THREE.MeshLambertMaterial({ color: PAL.ink });
    roadGate = new THREE.Group();
    const GATE_SPAN = (ROAD.hz + 2) * 2, GATE_N = 3, BAR_W = GATE_SPAN / GATE_N;
    for (let k = 0; k < GATE_N; k++) {
        const u = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(7, 9, BAR_W - 2), barrierMat);
        body.position.y = 5.5; body.castShadow = true; body.receiveShadow = true; u.add(body);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(10, 2, BAR_W - 1), barrierFootMat);
        foot.position.y = 1; u.add(foot);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, BAR_W - 2), barrierTopMat);
        rail.position.y = 11.1; u.add(rail);
        u.position.set(rand(-1.5, 1.5), 0, -GATE_SPAN / 2 + BAR_W * (k + 0.5));
        roadGate.add(u);
    }
    roadGate.position.set(S4_GATE.x, 0, S4_GATE.z);
    scene.add(roadGate);
    gateBlocker = {
        x: S4_GATE.x, z: S4_GATE.z, hx: 6, hz: ROAD.hz + 4,
        axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(6, ROAD.hz + 4), top: 13, standable: false
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
    // Builder futuristic* mengembalikan mesh dgn PANJANG bodi di sumbu Z pada
    // yaw 0 (moncong = -Z). Jadi yaw 0/π = moncong UTARA-SELATAN (memanjang Z,
    // utk parkir NOSE-IN), yaw ±π/2 = memanjang X (sejajar jalan). Blocker
    // mengikuti orientasi ASLI model ini (dulu terbalik → mobil parkir salah hadap).
    const carHalf = (yaw, hLong, hShort) =>
        Math.abs(Math.sin(yaw)) > 0.5 ? [hLong, hShort] : [hShort, hLong];
    const mkCar = (x, z, yaw) => {
        // model SUV futuristik (entities/futuristicSUV.js), warna divariasikan
        const car = buildFuturisticSUVMesh(CAR_SCALE, SUV_PALETTE[(Math.random() * SUV_PALETTE.length) | 0]);
        car.position.set(x, 0, z);
        car.rotation.set(rand(-0.05, 0.05), yaw, rand(-0.06, 0.06));
        scene.add(car);
        const [hx, hz] = carHalf(yaw, 17, 10);
        addBlockerBox(x, z, hx, hz, 9, false);
        registerOccluder(car, 18, 16);   // mobil memudar saat menutup player/robot
    };
    const mkSedan = (x, z, yaw) => {
        // model sedan futuristik (entities/futuristicSedan.js) — lebih pendek/ceper
        const car = buildFuturisticSedanMesh(CAR_SCALE, SED_PALETTE[(Math.random() * SED_PALETTE.length) | 0]);
        car.position.set(x, 0, z);
        car.rotation.set(rand(-0.04, 0.04), yaw, rand(-0.05, 0.05));
        scene.add(car);
        const [hx, hz] = carHalf(yaw, 15, 9);
        addBlockerBox(x, z, hx, hz, 7, false);
        registerOccluder(car, 16, 14);
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
        registerOccluder(bus, 38, 18);
    };
    const mkBarrier = (x, z, sx) => {   // pembatas beton rendah di BAHU jalan (bisa dipijak)
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 9, 10),
            new THREE.MeshLambertMaterial({ color: 0x8a8378 }));
        m.position.set(x, 4.5, z); m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        addBlockerBox(x, z, sx / 2, 5, 9, true);
    };
    // === PARKIRAN (dirombak 2026-07-18, permintaan user — dirapikan mirip foto
    //     referensi): petak parkir bermarka + mobil berjajar rapi + wheel-stop
    //     (pembatas) + panah arah; KONTAINER & tumpukan krat DIHAPUS. ===
    const bayLineMat = new THREE.MeshBasicMaterial({ color: 0xd8d2be, toneMapped: false });
    const BAY_W = 30, BAY_D = 36;
    const bayLine = (cx, cz) => {   // garis petak (membujur Z = ⟂ jalan; petak nose-in)
        const ln = new THREE.Mesh(new THREE.PlaneGeometry(2, BAY_D), bayLineMat);
        ln.rotation.x = -Math.PI / 2; ln.position.set(cx, 0.05, cz); scene.add(ln);
    };
    const stopMat = new THREE.MeshPhongMaterial({ color: 0x8f887c, shininess: 6, specular: 0x141310 });
    const wheelStop = (cx, cz) => {   // pembatas beton rendah di ujung petak (sejajar jalan)
        const m = new THREE.Mesh(new THREE.BoxGeometry(16, 3.5, 4), stopMat);
        m.position.set(cx, 1.75, cz); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    };
    // KISI PETAK SERAGAM (2026-07-18, permintaan user "luruskan & serasikan"):
    // SEMUA deret memakai KISI-X yang SAMA -> garis petak SEJAJAR & sekolom LURUS
    // antar-deret (dulu tiap deret pakai offset X sendiri = terlihat zigzag).
    // 14 petak dari tepi barat parkiran (PARK.x0) ke tepi timur (PARK.x1).
    const BAY_X0 = OX - 125, BAY_N = 14;
    const bayCenter = (i) => BAY_X0 + i * BAY_W;
    // Gambar SATU deret di kisi: garis pembatas kiri + wheel-stop tiap petak,
    // isi mobil via carFn(cx,i) (null = petak KOSONG tetap bermarka+wheel-stop),
    // lewati indeks di `skip` (celah pintu). Garis penutup di ujung tiap segmen.
    const buildBayRow = (rowZ, stopZ, carFn, skip) => {
        for (let i = 0; i < BAY_N; i++) {
            if (skip && skip.has(i)) continue;
            const cx = bayCenter(i);
            bayLine(cx - BAY_W / 2, rowZ);
            wheelStop(cx, stopZ);
            const mk = carFn && carFn(cx, i);
            if (mk) mk();
            if (i === BAY_N - 1 || (skip && skip.has(i + 1))) bayLine(cx + BAY_W / 2, rowZ);
        }
    };
    // DERET UTARA (moncong ke tembok, yaw 0): wheel-stop DEKAT TEMBOK; 3 petak
    // di celah pintu keluar gedung = KOSONG total (biar player keluar).
    // MOBIL DIKURANGI 2026-07-19 (permintaan user): hanya SEBAGIAN petak terisi
    // rapi (NROW_CARS), sisanya petak kosong bermarka.
    const NROW_Z = OZ - 198, NROW_STOP = OZ - 214;
    const DOOR_BAYS = new Set([3, 4, 5]);   // pusat -35/-5/+25 (celah pintu OX-65..OX+45)
    const NROW_CARS = new Set([0, 1, 7, 10, 13]);
    buildBayRow(NROW_Z, NROW_STOP,
        (cx, i) => NROW_CARS.has(i) ? () => (i % 2 ? mkSedan : mkCar)(cx, NROW_Z, rand(-0.02, 0.02)) : null,
        DOOR_BAYS);
    // DERET SELATAN: mayoritas PETAK KOSONG bermarka + wheel-stop; 2 petak
    // paling BARAT (0,1) & TIMUR (12,13) tanpa marka = jalur keluar-masuk mobil.
    const SROW_Z = OZ - 70, SROW_STOP = OZ - 52;
    const SOUTH_CARS = new Set([10]);
    const SROW_GAPS = new Set([0, 1, 12, 13]);
    buildBayRow(SROW_Z, SROW_STOP,
        (cx, i) => SOUTH_CARS.has(i) ? () => (i % 2 ? mkCar : mkSedan)(cx, SROW_Z, Math.PI + rand(-0.02, 0.02)) : null,
        SROW_GAPS);
    // MOBIL BERANTAKAN (2026-07-19, permintaan user): beberapa mobil ditinggal
    // panik saat invasi — serong menyilang petak / melintang di aisle. Tetap
    // blocker + occluder; jauh dari celah pintu keluar & jalur keluar timur
    // (konektivitas union tak berubah — blocker hanya dihindari, tak memutus).
    mkSedan(bayCenter(8) + 12, NROW_Z + 20, 0.55);          // serong menyilang dua petak utara
    mkCar(OX + 96, OZ - 120, 1.25);                          // melintang di tengah aisle
    mkSedan(bayCenter(4), SROW_Z - 26, Math.PI - 0.4);       // gagal parkir, serong depan deret selatan
    // Panah arah LURUS ke timur (+X) di aisle menuntun keluar ke jalan raya.
    const arrowTex = makeTexture(64, 64, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = 'rgba(206,200,180,0.85)';
        g.beginPath();
        g.moveTo(w * 0.18, h * 0.40); g.lineTo(w * 0.58, h * 0.40); g.lineTo(w * 0.58, h * 0.26);
        g.lineTo(w * 0.86, h * 0.50); g.lineTo(w * 0.58, h * 0.74); g.lineTo(w * 0.58, h * 0.60);
        g.lineTo(w * 0.18, h * 0.60); g.closePath(); g.fill();
    }, 1, 1);
    const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, toneMapped: false, depthWrite: false });
    const addArrow = (ax, az, heading = 0) => {   // heading rad: 0 = timur (+X); -π/2 = SELATAN (+Z, ke jalan)
        const grp = new THREE.Group();
        const a = new THREE.Mesh(new THREE.PlaneGeometry(32, 20), arrowMat);
        a.rotation.x = -Math.PI / 2; grp.add(a);
        grp.position.set(ax, 0.06, az); grp.rotation.y = heading; scene.add(grp);
    };
    addArrow(OX + 10, OZ - 134, 0);              // aisle -> timur
    addArrow(OX + 140, OZ - 134, 0);
    addArrow(OX + 160, OZ - 105, -Math.PI / 2);  // DIPINDAH 2026-07-18 ke tengah aisle -> SELATAN, membelok ke jalan
    addArrow(OX + 420, OZ - 8, 0);               // di jalan raya -> timur
    // Jalan 2 LAJUR (TANPA median): rongsokan slalom bergantian bahu utara/
    // selatan — DIPADATKAN 2026-07-19 (permintaan user: lebih banyak mobil di
    // jalan raya), tapi tiap x tetap menyisakan koridor lolos di sisi seberang
    // (ditegakkan smoke test koridor bebas-blocker sepanjang jalan). yaw ±π/2 =
    // SEJAJAR jalan (kontrak model: yaw 0 = memanjang Z); beberapa serong /
    // MELINTANG lajur utk kesan mobil ditinggal panik saat invasi.
    mkSedan(OX + 420, OZ - 14, Math.PI / 2 + 0.08);
    mkSedan(OX + 560, OZ + 12, Math.PI / 2 + 0.3);       // serong ditinggal panik
    mkCar(OX + 700, OZ + 14, -Math.PI / 2 - 0.06);
    mkCar(OX + 830, OZ - 14, -Math.PI / 2 + 0.1);
    mkCar(OX + 950, OZ - 12, Math.PI / 2 + 0.1);
    mkSedan(OX + 1100, OZ + 14, 0.2);                    // MELINTANG lajur selatan (utara terbuka)
    mkBus(OX + 1250, OZ + 14);             // spot 8 bus rusak (sejajar jalan)
    mkCar(OX + 1420, OZ + 16, Math.PI / 2 - 0.05);
    mkSedan(OX + 1550, OZ - 14, -Math.PI / 2 - 0.1);
    mkSedan(OX + 1670, OZ - 13, -Math.PI / 2 - 0.35);    // serong
    mkCar(OX + 1800, OZ + 12, Math.PI / 2 + 0.35);       // spot 9 mobil hancur (agak serong)
    mkBarrier(OX + 2050, OZ - 22, 90);     // spot 11 pembatas beton bahu utara
    mkCar(OX + 2200, OZ + 12, -0.15);                    // MELINTANG lajur selatan
    mkSedan(OX + 2300, OZ + 14, Math.PI / 2 + 0.06);
    mkCar(OX + 2600, OZ - 12, -Math.PI / 2 - 0.08);
    mkSedan(OX + 2750, OZ - 12, Math.PI / 2 + 0.1);
    mkSedan(OX + 2950, OZ + 13, Math.PI / 2 + 0.1);
    mkCar(OX + 3080, OZ + 14, Math.PI / 2 - 0.2);
    mkCar(OX + 3200, OZ - 14, Math.PI / 2 + 0.3);
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
    // ALUN-ALUN: dekorasi TANPA blocker (arena duel tank harus lapang) — TENGAH
    // LAPANGAN WAJIB KOSONG (2026-07-19, permintaan user: hanya heli penjemput
    // di pusat) — bangku DIPINDAH ke tepi trotoar dalam; planter di 4 sudut
    // lapangan; kios kecil di ring utara.
    mkPropDecor(buildFuturisticBenchMesh, S4_END.x - 120, ALUN.z0 - 7, 44, 10, 16);
    mkPropDecor(buildFuturisticBenchMesh, S4_END.x + 120, ALUN.z1 + 7, 44, 10, 16, Math.PI);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x0 + 24, ALUN.z0 + 24, 26, 34, 26);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x1 - 24, ALUN.z0 + 24, 26, 34, 26);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x0 + 24, ALUN.z1 - 24, 26, 34, 26);
    mkPropDecor(buildFuturisticPlanterMesh, ALUN.x1 - 24, ALUN.z1 - 24, 26, 34, 26);
    mkPropDecor(buildFuturisticStallMesh, S4_END.x, SQ.z0 + RING_W + 18, 44, 40, 28);
    // Jalan: PUING runtuhan (cover) menempel tembok UTARA (lajur selatan terbuka).
    mkPropCover(buildFuturisticRubbleMesh, OX + 1500, OZ - 24, 40, 14, 24, true);

    // --- Lampu jalan BERTIANG (2026-07-18: tiang tinggi + lengan + kepala LED,
    //     mirip foto referensi) — DEKORASI (tanpa blocker), ditaruh di tepi. ---
    const poleMat = new THREE.MeshPhongMaterial({ color: 0x2b2d31, shininess: 30, specular: 0x3a3d42 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe8bf, toneMapped: false });
    // arm = sudut lengan (rad): -π/2 = MENGHADAP JALAN (selatan), π = menghadap
    // barat; null = kepala di atas tiang (tanpa lengan). Kepala+lampu = anak grup
    // -> ikut berputar dgn lengan (jadi cahaya menyorot ke arah yg dihadapi).
    const addLamp = (x, z, color, inten, dist, arm = -Math.PI / 2) => {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.9, 54, 8), poleMat);   // DIKECILKAN 2026-07-18 (dulu 74, terlalu tinggi/besar)
        pole.position.y = 27; pole.castShadow = true; g.add(pole);
        const hasArm = arm !== null && arm !== undefined;
        const hx = hasArm ? 14 : 0;
        if (hasArm) {
            const a = new THREE.Mesh(new THREE.BoxGeometry(15, 1.8, 1.8), poleMat);
            a.position.set(7, 52, 0); g.add(a);
        }
        const head = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 5), headMat);
        head.position.set(hx, hasArm ? 51 : 55, 0); g.add(head);
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(hx, hasArm ? 49.5 : 53, 0); g.add(L);
        g.position.set(x, 0, z);
        if (hasArm) g.rotation.y = arm;
        scene.add(g);
    };
    // Parkiran: tiang tepi utara, lengan MENGHADAP JALAN (selatan) menyorot aisle
    addLamp(OX - 100, OZ - 216, 0xffe0a0, 0.7, 440);
    addLamp(OX + 130, OZ - 216, 0xffe0a0, 0.7, 440);
    addLamp(OX + 220, OZ - 216, 0xffe0a0, 0.7, 440);
    addLamp(OX + 276, OZ - 44, 0xffe0a0, 0.6, 420, Math.PI);   // sudut tenggara, lengan ke mulut jalan (barat)
    // JALAN RAYA (2026-07-18, permintaan user): lampu jalan berselang di KEDUA
    // bahu sepanjang jalan (di trotoar), lengan menghadap ke aspal — selayaknya
    // lampu jalan raya. Utara -> lengan ke selatan; selatan -> lengan ke utara.
    for (let k = 0, x = ROAD.x0 + 260; x < SQ.x0 - 150; x += 600, k++) {
        const north = (k % 2 === 0);
        addLamp(x, north ? -ROAD.hz + 3 : ROAD.hz - 3, 0xfff0c0, 0.6, 480, north ? -Math.PI / 2 : Math.PI / 2);
    }
    // TENGAH ALUN-ALUN WAJIB KOSONG (2026-07-19, permintaan user): lampu tiang
    // pusat DIHAPUS — pusat lapangan hanya utk heli penjemput. Penerangan
    // lapangan dipindah ke 2 tiang di sudut ring (lengan menyorot ke dalam).
    addLamp(SQ.x0 + 24, SQ.z0 + 24, 0xbfe4ff, 0.7, 620, -Math.PI / 4);
    addLamp(SQ.x1 - 24, SQ.z1 - 24, 0xbfe4ff, 0.7, 620, Math.PI * 0.75);

    buildRoadside();   // gedung/toko/rumah/warung/pohon/pagar/JPO Jakarta di kiri-kanan jalan (dekor)

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

// === JAKARTA ROADSIDE (2026-07-18; DIROMBAK 2026-07-19, permintaan user):
// kiri-kanan jalan raya diisi VARIAN kota Jakarta sungguhan — gedung, ruko/toko,
// rumah kampung beratap pelana genteng, warung, bengkel (rolling door terbuka),
// sekolah (tiang bendera merah-putih), taman kecil + pohon — dgn fasad JENDELA
// BESAR (makeFacadeTex(2), proporsional dilihat dekat). SEMUA penempatan lewat
// claimDecor: footprint DITOLAK bila menyentuh zona gameplay (parkiran /
// koridor jalan / kompleks alun-alun) atau menimpa dekor lain — ditegakkan
// smoke test lewat roadsideDebug(). Murni dekor: TANPA blocker/nav. Sisi
// SELATAN (arah kamera) = occluder (memudar saat menutup entitas); sisi UTARA
// (= KIRI jalan arah timur, kini paling bervariasi) + skyline = latar. ===
function buildRoadside() {
    const RX0 = ROAD.x0 + 20, RX1 = SQ.x0 - 26, LEN = RX1 - RX0;
    const NX0 = PARK.x1 + 30;   // dekor sisi UTARA mulai TIMUR parkiran (zona parkiran bebas dekor)
    const facadeTex = makeFacadeTex(2);   // JENDELA BESAR (2026-07-19, permintaan user)
    const litTex = makeLitTex(2);

    // --- Verge (tanah tepi) hijau kecoklatan; sisi UTARA mulai timur parkiran ---
    const vergeTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#2b3320'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#25301c', '#343d26', '#20281a', '#2e3722'], 240, 1, 4);
    }, 20, 4);
    const vergeMat = new THREE.MeshPhongMaterial({ map: vergeTex, shininess: 2, specular: 0x0a0f08 });
    const vergePlane = (x0, x1, s) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 300), vergeMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set((x0 + x1) / 2, 0.006, s * (ROAD.hz + 150));
        m.receiveShadow = true; scene.add(m);
    };
    vergePlane(RX0 - 40, RX1, 1);    // selatan penuh
    vergePlane(NX0, RX1, -1);        // utara mulai timur parkiran

    // --- Material & palet bersama varian bangunan Jakarta ---
    const rukoCols = [0x8a7f6a, 0x9a5a4a, 0x6a7a5a, 0x7a6a8a, 0xb0a48a, 0x5a6a7a, 0xa88a5a, 0x86603f];
    const canopyCols = [0xc0503a, 0x3a7a5a, 0x4a5a8a, 0xb8863a];
    const roofCols = [0x7e4434, 0x6e3a30, 0x54585e, 0x7a5a3a];       // genteng tanah liat / seng
    const houseCols = [0xcfc7b2, 0xb8ab8f, 0x9fae9a, 0xc2b4a4, 0xa8b2bd];
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const lam = (color, map) => new THREE.MeshLambertMaterial(map ? { color, map } : { color });
    const darkFront = new THREE.MeshBasicMaterial({ color: 0x17181c });   // rongga pintu/rolling-door terbuka
    const signMat = new THREE.MeshLambertMaterial({ color: PAL.white });
    const poleThin = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x33502a });
    const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x2e4426 });

    // Kumpulan pohon — diisi lot 'taman', tepi jalan, & sekeliling alun-alun;
    // dirender SEKALI sbg instanced mesh di akhir. addTree menolak titik yang
    // kena zona gameplay atau berdiri di dalam footprint bangunan terklaim.
    const trees = [];
    const addTree = (x, z) => {
        if (!clearOfZones(x - 6, x + 6, z - 6, z + 6)) return;
        for (const r of decorRects) if (x > r.x0 - 4 && x < r.x1 + 4 && z > r.z0 - 4 && z < r.z1 + 4) return;
        trees.push({ x, z });
    };

    // --- JPO (jembatan penyeberangan orang) menyeberang jalan (2 titik) —
    //     di-claim DULUAN supaya lot bangunan menyisakan ruang pendaratannya ---
    const jMat = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
    const jDeckMat = new THREE.MeshLambertMaterial({ color: 0x80808a });
    for (const jx of [RX0 + LEN * 0.4, RX0 + LEN * 0.78]) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 3, ROAD.hz * 2 + 48), jDeckMat);
        deck.position.set(jx, 52, 0); scene.add(deck);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 1.4, ROAD.hz * 2 + 48), jMat);
        roof.position.set(jx, 60, 0); scene.add(roof);
        for (const s of [-1, 1]) {
            const col = new THREE.Mesh(new THREE.BoxGeometry(5, 52, 5), jMat);
            col.position.set(jx, 26, s * (ROAD.hz + 18)); scene.add(col);
            const tower = new THREE.Mesh(new THREE.BoxGeometry(13, 52, 15), jMat);
            tower.position.set(jx, 26, s * (ROAD.hz + 42)); tower.castShadow = true; scene.add(tower);
            claimDecor(jx - 8, jx + 8, s * (ROAD.hz + 42) - 9, s * (ROAD.hz + 42) + 9);
            if (s > 0) registerOccluder(tower, 13, 52);   // menara sisi kamera = occluder
        }
    }

    // ---- Satu LOT varian di sisi s (+1 selatan / -1 utara); front = sisi jalan
    //      (lokal -s*z). Mengembalikan lebar lot terpakai; lot yang gagal claim
    //      (kena zona/JPO) dilewati tapi tetap memajukan x. ----
    const buildLot = (x, s, type) => {
        let w, d, hgt;
        if (type === 'gedung') { w = rand(50, 70); d = rand(44, 60); hgt = rand(110, 200); }
        else if (type === 'ruko') { w = rand(38, 58); d = rand(32, 48); hgt = rand(34, 78); }
        else if (type === 'toko' || type === 'warung') { w = rand(22, 30); d = rand(16, 22); hgt = 13; }
        else if (type === 'rumah') { w = rand(30, 44); d = rand(26, 36); hgt = 15; }
        else if (type === 'bengkel') { w = rand(42, 58); d = rand(34, 44); hgt = 21; }
        else if (type === 'sekolah') { w = rand(74, 96); d = rand(30, 40); hgt = 24; }
        else { w = rand(50, 80); d = rand(40, 60); hgt = 0; }   // 'taman'
        const setback = type === 'taman' ? 4 : rand(2, 12);
        const zNear = s * (ROAD.hz + 22 + setback);
        const bx = x + w / 2, bz = zNear + s * d / 2;
        if (!claimDecor(x, x + w, Math.min(zNear, zNear + s * d), Math.max(zNear, zNear + s * d))) return w;
        const G = new THREE.Group();
        G.position.set(bx, 0, bz);
        if (type === 'gedung' || type === 'ruko') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), lam(pick(rukoCols), facadeTex));
            body.position.y = hgt / 2; body.castShadow = true; body.receiveShadow = true; G.add(body);
            if (type === 'ruko') {   // kanopi toko + papan nama di muka jalan
                const can = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 2, 9), lam(pick(canopyCols)));
                can.position.set(0, 13, -s * (d / 2 + 4)); G.add(can);
                const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 5, 1.2), signMat);
                sign.position.set(0, 18.5, -s * (d / 2 + 0.9)); G.add(sign);
            } else {                 // gedung: penthouse atap
                const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 10, d * 0.5), lam(0x54504a));
                top.position.y = hgt + 5; G.add(top);
            }
        } else if (type === 'toko' || type === 'warung') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, 13, d), lam(0x8a7a5a));
            body.position.y = 6.5; body.castShadow = true; G.add(body);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 5, 1.6, d + 6), lam(pick(canopyCols)));
            roof.position.set(0, 14.3, -s * 2); G.add(roof);
            const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 8, 0.6), darkFront);
            front.position.set(0, 5, -s * (d / 2 + 0.1)); G.add(front);
        } else if (type === 'rumah') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), lam(pick(houseCols)));
            body.position.y = hgt / 2; body.castShadow = true; body.receiveShadow = true; G.add(body);
            const rMat = lam(pick(roofCols));
            for (const rs of [-1, 1]) {   // atap PELANA (bubungan sepanjang X)
                const slope = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 1.4, d * 0.62), rMat);
                slope.position.set(0, hgt + 3.4, rs * d * 0.24);
                slope.rotation.x = -rs * 0.5;
                slope.castShadow = true; G.add(slope);
            }
            const door = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 0.6), lam(PAL.wood));
            door.position.set(rand(-w * 0.25, w * 0.25), 4.5, -s * (d / 2 + 0.1)); G.add(door);
        } else if (type === 'bengkel') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), lam(0x7d8288));
            body.position.y = hgt / 2; body.castShadow = true; G.add(body);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 1.6, d + 4), lam(0x565b61));
            roof.position.set(0, hgt + 1, s * 1); roof.rotation.x = s * 0.06; G.add(roof);
            const bay = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, hgt * 0.68, 0.6), darkFront);
            bay.position.set(-w * 0.12, hgt * 0.34, -s * (d / 2 + 0.1)); G.add(bay);   // rolling door terbuka
            const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 4.5, 1.2), lam(PAL.amber));
            sign.position.set(0, hgt + 4, -s * (d / 2 - 2)); G.add(sign);
        } else if (type === 'sekolah') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d * 0.7), lam(0xcfc7b2, facadeTex));
            body.position.set(0, hgt / 2, s * d * 0.15); body.castShadow = true; body.receiveShadow = true; G.add(body);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 1.6, d * 0.7 + 6), lam(0x6e3a30));
            roof.position.set(0, hgt + 0.9, s * d * 0.15); G.add(roof);
            // tiang bendera MERAH-PUTIH di halaman depan (aksen nasional, hemat)
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 6), poleThin);
            pole.position.set(-w * 0.28, 13, -s * d * 0.32); G.add(pole);
            const fr = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.4), lam(PAL.hazard));
            fr.position.set(-w * 0.28 + 3.2, 24.4, -s * d * 0.32); G.add(fr);
            const fw = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.4), lam(PAL.white));
            fw.position.set(-w * 0.28 + 3.2, 22.4, -s * d * 0.32); G.add(fw);
        } else {   // 'taman': lapangan hijau kecil + hedge depan + pohon
            const grass = new THREE.Mesh(new THREE.PlaneGeometry(w, d), grassMat);
            grass.rotation.x = -Math.PI / 2; grass.position.y = 0.02; grass.receiveShadow = true; G.add(grass);
            const hb = new THREE.Mesh(new THREE.BoxGeometry(w, 3.5, 2), hedgeMat);
            hb.position.set(0, 1.75, -s * (d / 2 - 1)); G.add(hb);
            for (let k = 0, n = 3 + (Math.random() * 3 | 0); k < n; k++)
                trees.push({ x: bx + rand(-w * 0.4, w * 0.4), z: bz + rand(-d * 0.4, d * 0.4) });
        }
        scene.add(G);
        if (s > 0 && hgt > 0) registerOccluder(G, Math.hypot(w, d) / 2, hgt + 6);
        return w;
    };
    const fillSide = (s, xStart, types) => {
        let x = xStart, i = 0;
        while (x < RX1 - 36) x += buildLot(x, s, types[i++ % types.length]) + rand(8, 22);
    };
    // Sisi SELATAN (dekat kamera): deret ruko/toko/rumah/bengkel/warung — occluder
    fillSide(1, RX0, ['ruko', 'toko', 'ruko', 'rumah', 'bengkel', 'ruko', 'warung', 'taman']);
    // Sisi UTARA = KIRI jalan arah timur (2026-07-19, permintaan user: variasi
    // diperbanyak): gedung, ruko, rumah kampung, sekolah, taman, bengkel, warung
    fillSide(-1, NX0, ['ruko', 'rumah', 'gedung', 'warung', 'sekolah', 'ruko', 'taman', 'bengkel', 'rumah']);

    // --- Pagar (fence) rendah di verge selatan, antara lot & trotoar ---
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x54504a });
    for (let x = RX0; x < RX1 - 84; x += 110) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(84, 8, 1.6), fenceMat);
        f.position.set(x + 42, 4, ROAD.hz + 11); scene.add(f);
    }

    // --- Skyline latar sisi UTARA + sekeliling ALUN-ALUN (instanced): tembok
    //     keliling dihapus (2026-07-19) — kota berlanjut di balik pagar hedge.
    //     Semua kandidat lewat claimDecor -> tak pernah berdiri di zona gameplay
    //     (dulu loop lama bisa menaruh gedung di ring/parkiran). Sisi BARAT &
    //     SELATAN alun dibiarkan kosong (arah kamera — jangan menutup arena). ---
    const cityMat = makeCityMat(facadeTex, litTex);
    const bg = [];
    const tryBg = (x, z, w2, d2, h2) => {
        if (!claimDecor(x - w2 / 2, x + w2 / 2, z - d2 / 2, z + d2 / 2)) return;
        bg.push({
            x, z, w: w2, d: d2, h: h2, ry: rand(-0.04, 0.04), rz: 0,
            color: CITY_PALETTE[(Math.random() * CITY_PALETTE.length) | 0]
        });
    };
    for (let x = NX0; x < RX1; x += rand(64, 104)) {
        for (const row of [150, 250]) {
            if (Math.random() < 0.3) continue;
            tryBg(x + rand(-14, 14), -(ROAD.hz + row) + rand(-16, 16),
                rand(48, 92), rand(44, 78), row > 200 ? rand(200, 360) : rand(120, 240));
        }
    }
    for (let x = SQ.x0 - 40; x < SQ.x1 + 60; x += rand(70, 110)) {
        tryBg(x, SQ.z0 - rand(90, 200), rand(50, 90), rand(44, 80), rand(90, 240));   // utara alun
    }
    for (let z = SQ.z0; z < SQ.z1; z += rand(70, 110)) {
        tryBg(SQ.x1 + rand(90, 200), z, rand(50, 90), rand(44, 80), rand(80, 220));   // timur alun
    }
    fillBuildingInstances(scene, bg, cityMat);

    // --- Pepohonan tepi jalan + sekeliling alun-alun (utara/timur saja) ---
    for (let x = RX0; x < RX1; x += 58) { if (Math.random() < 0.4) continue; addTree(x + rand(-10, 10), (ROAD.hz + 12) + rand(-3, 3)); }
    for (let x = NX0; x < RX1; x += 58) { if (Math.random() < 0.4) continue; addTree(x + rand(-10, 10), -(ROAD.hz + 12) + rand(-3, 3)); }
    for (let x = SQ.x0 + 20; x < SQ.x1; x += 64) addTree(x + rand(-8, 8), SQ.z0 - rand(18, 44));
    for (let z = SQ.z0 + 30; z < SQ.z1; z += 64) addTree(SQ.x1 + rand(18, 44), z + rand(-8, 8));
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2f4a24 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2c1e });
    const coneGeo = new THREE.ConeGeometry(1, 1, 7), trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 6);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
        _p = new THREE.Vector3(), _sc = new THREE.Vector3();
    _q.setFromEuler(_e);
    const fol = new THREE.InstancedMesh(coneGeo, foliageMat, trees.length);
    const trk = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    trees.forEach((t, i) => {
        const hgt = rand(26, 40), r = rand(7, 10);
        _m.compose(_p.set(t.x, hgt * 0.62, t.z), _q, _sc.set(r, hgt * 0.72, r)); fol.setMatrixAt(i, _m);
        _m.compose(_p.set(t.x, hgt * 0.2, t.z), _q, _sc.set(2.2, hgt * 0.42, 2.2)); trk.setMatrixAt(i, _m);
    });
    fol.frustumCulled = false; trk.frustumCulled = false; scene.add(fol); scene.add(trk);
}

// Robot stage 4: 13 spot denah [x, z, jumlah] (relatif OX/OZ) + kelas.
// DIROMBAK 2026-07-19 (permintaan user): total 40 robot (dulu 44) dgn LEBIH
// BANYAK penembak kelas A/B — S4_RANGED kini DAFTAR kelas per spot (robot ke-k
// spot itu memakai kelas daftar[k], sisanya C): 25 C + 9 B + 6 A = 40.
// (Retarget 2026-07-17: robot HANYA di parkiran + jalan raya sampai sebelum
// gerbang alun-alun [x <= ~3400 < GATE 3480] — ALUN-ALUN STERIL dari robot.)
const S4_ROBOTS = [
    [OX + 60, OZ - 170, 3],    // 1 dekat pintu keluar gedung
    [OX + 170, OZ - 150, 3],   // 2 parkiran tengah
    [OX + 60, OZ - 90, 3],     // 3 dekat mobil rongsok
    [OX + 200, OZ - 60, 3],    // 4 deret parkir selatan
    [OX + 230, OZ - 190, 3],   // 5 sudut timur parkiran
    [OX + 120, OZ + 0, 3],     // 6 awal jalan raya (terbuka)
    [OX + 800, OZ + 0, 4],     // 7 jalan sisi barat
    [OX + 1250, OZ - 14, 3],   // 8 dekat bus rusak
    [OX + 1700, OZ + 0, 3],    // 9 tengah jalan (mobil hancur)
    [OX + 2100, OZ + 8, 3],    // 10 tengah kanan jalan
    [OX + 2450, OZ - 8, 3],    // 11 dekat pembatas bahu jalan
    [OX + 2900, OZ + 0, 3],    // 12 jalan menjelang alun-alun
    [OX + 3320, OZ - 6, 3],    // 13 ujung jalan di depan gerbang alun-alun
];
// index spot (1-based) -> daftar kelas penembak (sisanya kelas C)
const S4_RANGED = {
    2: ['B'], 4: ['B'], 6: ['B', 'B'], 7: ['A', 'B'], 8: ['B'],
    9: ['A', 'B'], 10: ['A'], 11: ['B'], 12: ['A', 'B'], 13: ['A', 'A'],
};

export function placeRobots() {
    S4_ROBOTS.forEach(([sx, sz, n], si) => {
        const rangedCls = S4_RANGED[si + 1] || [];
        for (let k = 0; k < n; k++) {
            _v3.set(sx + rand(-24, 24), 0, sz + rand(-18, 18));
            resolve(_v3, 4, 0);
            if (!stage4Walk(_v3.x, _v3.z, 4)) _v3.set(sx, 0, sz);
            spawnCampaignRobot(_v3.x, _v3.z, 4, rangedCls[k] || 'C');
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

// ===== BAREL PELEDAK (SECOND-IMPROVEMENT point 2): tong eksplosif sepanjang
// jalur tempur parkiran → jalan raya (cover + hazard ala Alien Shooter). Ditembak
// -> ledakan AoE + rambat antar barel. Pejal ke player (resolveBarrelBlock). =====
const S4_BARRELS = [
    [OX + 120, OZ - 110], [OX + 230, OZ - 150],   // parkiran
    [OX + 800, OZ + 20], [OX + 1700, OZ - 18], [OX + 2450, OZ + 16], [OX + 2900, OZ - 14],   // jalan raya
];
export function placeBarrels() {
    for (const [x, z] of S4_BARRELS) spawnBarrel(x, z, 0);
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

// CUTSCENE TANK-BOSS (heli penjemput + tank masuk menghancurkan heli) DIPISAH
// 2026-07-19 (permintaan user) ke cutscenes/tankBossIntro.js. State heli/cine
// kini milik modul itu; stage4 hanya menyimpan tank (utk DUEL) + geometri.

// Referensi tank aktif (dipakai smoke test utk melumpuhkan boss)
export function currentTank() { return tank; }
// Referensi heli penjemput (utk smoke test) — delegasi ke modul cutscene
export const currentHeli = () => intro.currentHeli();
// Debug/uji: status kunci arena + rect lapangan (ALUN) & kompleks (SQ)
export const arenaDebug = () => ({ locked: arenaLocked, alun: { ...ALUN }, sq: { ...SQ } });
// Debug/uji cutscene: delegasi ke modul cutscene (fase + geometri bangkai)
export const cineDebug = () => intro.cineDebug();

// Buka gerbang alun-alun: mesh disembunyikan + blocker dicabut dari daftar
// (dipulihkan lagi di enter()). Nav-grid TIDAK dibangun ulang (lihat catatan).
function openGate() {
    if (roadGate) roadGate.visible = false;
    const gi = blockers.indexOf(gateBlocker);
    if (gi >= 0) blockers.splice(gi, 1);
}

// Pengontrol CUTSCENE TANK-BOSS (cutscenes/tankBossIntro.js): mengurus heli
// penjemput + mesin sinematik; tank yang di-spawn di tengah cutscene diserahkan
// balik ke stage4 lewat setTank (bossSpawned=true + ref tank utk duel).
const intro = createTankBossIntro({
    SQ, HELI_POS, BOSS_POS, WRECK_CLEAR, S4_START, blockers, openGate,
    setTank: (t) => { tank = t; bossSpawned = true; }
});

function onBossDown() {
    bossDefeated = true;
    arenaLocked = false;   // arena terbuka lagi — player bebas berkeliling
    stopMusic();           // boss tumbang -> musik boss-fight berhenti (2026-07-19)
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
        // Reset CUTSCENE + heli: buang heli/bangkai lama + blocker-nya, batalkan
        // sinematik yang mungkin berjalan (restart/cheat) — cutscenes/tankBossIntro.js.
        intro.reset();
        // Pasang lagi gerbang alun-alun (mesh + blocker — dicabut openGate saat run sebelumnya)
        if (roadGate) roadGate.visible = true;
        if (gateBlocker && !blockers.includes(gateBlocker)) blockers.push(gateBlocker);
        placeRobots();
        resetBarrels(); placeBarrels();   // barel peledak (bersihkan barel stage lain dulu)
        applyLightPreset(scene, 'night');
        exitCityEnv();   // stage 4 outdoor: pulihkan kubah kobaran-api global + fog apokaliptik (stage 1-3 menyembunyikannya)
        camera.position.set(S4_START.x, CFG.player.eyeHeight, S4_START.z);
        camera.quaternion.set(0, -0.7071, 0, 0.7071);   // hadap timur (menuju jalan)
        player.vy = 0; player.onGround = true;
        showStageMsg('CLEAR THE HIGHWAY — REACH THE TOWN SQUARE EAST');
        updateUI();
    },

    restartScene: () => stage1Scene,

    // Ganjaran kill campaign: LOOT/uang (bukan skor langsung). Lihat common.js.
    awardKill: campaignAwardKill,

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // ALUR AKHIR (2026-07-17): semua robot mati -> gerbang terbuka + HELI
    // penjemput menunggu di pusat (heliArrives) -> player menginjak ring road
    // -> CUTSCENE (tank datang dari utara, menghancurkan heli, parkir di depan
    // bangkai) -> duel; tank hancur -> MISSION COMPLETE setelah jeda singkat.
    updateMode(dt) {
        updateOccluders(dt);   // objek penghalang -> semi-transparan (2026-07-18)
        intro.update(dt);      // heli penjemput + mesin cutscene tank-boss (cutscenes/tankBossIntro.js)
        // updateTank dipanggil JUGA selama cutscene (2026-07-19, permintaan
        // user — SFX cutscene lengkap): fase 'cine' early-return SETELAH
        // updateTankAudio, jadi loop tank-moving (tick dari cineTracksDust) +
        // tank-turret-rotate (tick dari aimTurretAtHeli) berbunyi saat tank
        // digerakkan sinematik; logika duel tetap menunggu cutscene selesai.
        if (tank) updateTank(tank, dt);
        // Cutscene SELESAI (tank sudah diserahkan lewat setTank) -> jalankan DUEL.
        if (tank && intro.isDone() && !intro.isActive()) {
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
        resolveBarrelBlock(pos, player.radius);   // barel peledak pejal ke player
        resolveTankBlock(tank, pos);   // player tidak bisa menembus tank/bangkainya
        // PEMICU CUTSCENE (2026-07-17): heli sudah menunggu + player MENGINJAK
        // ring road (masuk rect SQ) -> mulai sinematik penjemputan-gagal.
        // (Selama cutscene playerCollide tak terpanggil — kontrol player beku.)
        if (intro.isHeliSpawned() && !intro.isDone() && !intro.isActive()
            && pos.x > SQ.x0 + 2 && pos.x < SQ.x1 - 2
            && pos.z > SQ.z0 + 2 && pos.z < SQ.z1 - 2) {
            intro.start();
        }
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
            // JEDA MASUK ARENA (2026-07-17): tank menahan semua serangan
            // engageDelaySec (2 dtk) — napas sejenak begitu player baru
            // menginjak lapangan sebelum tank mulai menembak.
            if (tank) tank.holdT = CFG.campaign.bosses.tank.engageDelaySec || 2;
            showStageMsg('THE DUEL BEGINS — NO WAY OUT UNTIL THE TANK FALLS!');
        }
        if (arenaLocked) {
            if (pos.x < ALUN.x0 + r) pos.x = ALUN.x0 + r;
            else if (pos.x > ALUN.x1 - r) pos.x = ALUN.x1 - r;
            if (pos.z < ALUN.z0 + r) pos.z = ALUN.z0 + r;
            else if (pos.z > ALUN.z1 - r) pos.z = ALUN.z1 - r;
        }
        if (!intro.isHeliSpawned() && Math.abs(pos.z - S4_GATE.z) <= ROAD.hz
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
        if (intro.isActive()) return s;   // HUD tersembunyi selama cutscene (body.cine)
        if (tank && !bossDefeated) {
            const frac = Math.max(0, tank.hp / tank.maxHp);
            const blocks = Math.ceil(frac * 10);
            s += ` — TANK ${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)}`;
        } else if (bossDefeated) s += ' | MISSION COMPLETE';
        else if (intro.isHeliSpawned()) s += ' | Reach the extraction helicopter (east)!';
        else s += ' | Reach the town square (east)';
        return s;
    },

    // Landmark: pusat alun-alun (dijepit ke tepi radar saat jauh; hijau saat
    // gerbang terbuka = heli penjemput menunggu di sana)
    radarLandmarks(plot) {
        plot(S4_END.x - camera.position.x, S4_END.z - camera.position.z, intro.isHeliSpawned() ? "#2eff6a" : "#ffb04a", 5, true);
    },
};
