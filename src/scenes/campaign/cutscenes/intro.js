// SCENE: INTRO CUTSCENE campaign (2026-07-17) — diputar SEBELUM Stage 1, hanya
// pada start campaign BARU (bukan "Continue"/restart/cheat). Dua adegan:
//   SCENE 1: HELIKOPTER terbang di langit MALAM menuju atap sebuah gedung.
//   SCENE 2: heli tiba & MENGGANTUNG tepat di atas atap, TALI menjuntai turun ke
//            atap, character player TURUN dari tali, lalu MASUK ke pintu gedung.
// 2 detik setelah character masuk pintu -> cutscene berakhir -> Stage 1.
//
// Scene NON-GAMEPLAY (seperti campaignShopScene): semua hook gameplay no-op;
// state.cinematicActive membekukan kendali player + input (kecuali Esc = pause),
// updateGame tetap memanggil updateMode (mesin cutscene di sini). MESIN BERBASIS
// TIMER (deterministik) — durasi tiap fase dari CFG.campaign.intro.
//
// AUTO-PLAY (2026-07-17): cutscene diputar OTOMATIS begitu game dimuat — TANPA
// layar tutorial "Click to Start the Action" lebih dulu (beginIntro unpause +
// SEMBUNYIKAN blocker). Layar tutorial baru ditampilkan finishIntro SETELAH
// cutscene selesai, tepat saat Stage 1 mau dimulai (blocker + pause; klik =
// start gameplay). Jadi tutorial TIDAK menutupi cutscene.
//
// MEKANIK: `camera` (pivot logika player) = posisi avatar; menggerakkan
// camera.position menggerakkan avatar (playerAvatar menaruh avatar di pivot tiap
// frame) — dan sekaligus fokus kamera RENDER (viewCam MENGIKUTI pivot via
// dead-zone followViewCam; TANPA cineFocus, supaya heli terbang & avatar turun
// terbuntuti ketat). SCENE 1 (fly): pivot = posisi heli (kamera menyusuri langit
// bersamanya). SCENE 2: 'descend' menurunkan pivot.y (avatar TURUN dgn POSE
// FAST-ROPE `setAvatarRappel`, kamera pan turun mengikutinya); 'walk' menggeser
// pivot.xz ke pintu (siklus jalan terpicu kecepatan); `aimPoint` (input.js)
// di-override ke arah pintu supaya avatar MENGHADAP arah geraknya. Dunia atap
// dibangun jauh dari stage (x~150000) & DIBUANG saat cutscene selesai.

import { CFG, CAMP_M } from '../../../core/config.js';
import { scene, camera, viewCam, renderer, composer, postFxOn, addCamShake, setCineFocus, followViewCam } from '../../../core/renderer.js';
import { setScene } from '../../../core/sceneManager.js';
import { setCinematicActive, setPaused } from '../../../core/state.js';
import { setCineBars, blocker, showCutsceneSkip, hideCutsceneSkip } from '../../../core/dom.js';
import { hidePauseMenu } from '../../../core/pauseMenu.js';
import { releaseInputs } from '../../../core/input.js';
import { aimPoint } from '../../../core/input.js';
import { applyLightPreset } from '../../../world/lighting.js';
import { makeTexture, speckle } from '../../../utils/textures.js';
import { PAL } from '../../../world/palette.js';
import { makeFacadeTex, makeLitTex, makeCityMat, fillBuildingInstances, CITY_PALETTE } from '../../../world/facades.js';
import { setEmbersVisible } from '../../../world/sky.js';
import { skyDome } from '../../../world/decor.js';
import { playLoopSFX, stopLoopSFX, playSFX, sfxHeli, sfxFootstep, getSFXScale } from '../../../utils/sfx.js';
import { spawnHelicopter, updateHelicopter, disposeHelicopter } from '../../../entities/helicopter.js';
import { avatarGroup, setAvatarRappel } from '../../../entities/playerAvatar.js';
import { stage1Scene, ensureWorld as ensureCampaignWorlds } from '../stages/stage1.js';

// Dunia atap ditaruh ~150 km dari origin (jauh dari stage 1-4 di 30k/60k/90k/
// 120k). Deck atap di y=0 (tinggi gedung sekadar visual — kamera di atasnya).
const IX = 150000, IZ = 0, ROOF_Y = 0;
const HALF_X = 168, HALF_Z = 150;                 // setengah lebar deck (unit)
const at = (dx, dz) => ({ x: IX + dx, z: IZ + dz });

// Titik-titik aksi (unit dunia)
const DROP = at(-8, 40);                           // titik tali menyentuh atap (player turun)
// PINTU di sisi KIRI-atas (barat, -x) — DITUKAR dgn tangki air 2026-07-18: Stage 1
// tangganya berawal dari KIRI-atas, jadi player harus masuk pintu dari kiri (dulu
// kanan-atas = tak konsisten). Tangki air kini di kanan-atas (buildRoof).
const DOOR = at(-90, -HALF_Z + 40);                // pintu di bulkhead (sisi utara -z, KIRI)
const HOVER_Y = 48;                                // ketinggian heli menggantung (128 -> 64 -> 48, diturunkan lagi 2026-07-19 permintaan user)
const BELLY_Y = HOVER_Y + 2;                       // pangkal tali (perut heli)
// SCENE 1: heli MENYUSURI langit malam — lintasan panjang, tinggi, dari jauh
// (barat-daya) melintas mendekati gedung. Kamera MENGIKUTI heli (pivot = heli,
// fokus AIR_DROP di bawahnya → heli di bagian atas layar, langit di sekeliling).
const FLY_START = at(-2400, 1050); FLY_START.y = 205;   // jauh (barat-daya), tinggi di langit
// Fokus kamera relatif heli → posisi heli di layar. Heli tampak `AIR_DROP + 8`
// unit di atas titik-pandang; NEGATIF = fokus di ATAS heli → heli TURUN ke
// bawah-tengah layar (dulu 52 = terpotong bar atas, 10 = masih ketinggian).
const AIR_DROP = -30;
const DESC_TOP_FEET = BELLY_Y - 16;                // kaki avatar saat mulai turun (menggantung di bawah perut heli)
// Titik heli PERGI (2026-07-18): setelah player turun, heli MENARIK NAIK tali lalu
// MENANJAK & TERBANG MENJAUH ke langit (timur-laut) — menegaskan player harus ke
// alun-alun Stage 4 utk menaikinya lagi. Player menontonnya sebelum ke pintu.
const LEAVE = at(1500, -1100); LEAVE.y = 250;

// KOTA (2026-07-18): atap ini = puncak SATU menara di tengah KOTA gedung-gedung
// & jalanan (bukan lagi void berlatar kobaran api). Jalanan CITY_GROUND unit di
// bawah deck (deck y=0); gedung sekeliling mayoritas lebih PENDEK dari deck →
// kamera menatap TURUN ke lautan gedung + jalan (mirip foto udara kota).
const CITY_GROUND = -520;

let built = false, roof = null;                    // grup dunia atap + KOTA (dibuang di akhir)
let introSky = null;                               // kubah langit intro (haze kota, ikut kamera)
let savedFog = null;                               // {hex,near,far} fog global (dipulihkan di finish)
let heli = null, rope = null;
let heliSnd = null;                                // loop helicopter-flying (2026-07-19; berhenti saat heli pergi)
let stepT = 0;                                     // irama langkah kaki fase walk/enter (2026-07-19, SFX cutscene)
let cine = null;                                   // {phase, t} mesin cutscene (null = tak aktif)
let eyeH = 11.4;

// Debug/uji: status cutscene
export const introDebug = () => ({
    phase: cine ? cine.phase : null, active: !!cine,
    heliX: heli ? heli.parts.group.position.x : null,
    heliY: heli ? heli.parts.group.position.y : null,
    heliZ: heli ? heli.parts.group.position.z : null,
    avatarShown: avatarGroup ? avatarGroup.visible : null,
    pivotX: camera ? camera.position.x : null,
    pivotY: camera ? camera.position.y : null,
    pivotZ: camera ? camera.position.z : null,
    door: { ...DOOR }, drop: { ...DROP }, roofY: ROOF_Y, eyeH
});

const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const smooth = (k) => k * k * (3 - 2 * k);

// ===== Bangun dunia ATAP (sekali, guard `built`) — deck beton + parapet +
// bulkhead berpintu (jalan turun = Stage 1) + tangki air kayu (khas atap kota) +
// unit HVAC + ventilasi. Semua Lambert/Basic (token PAL — gaya GIBS 2045). =====
function buildRoof() {
    const g = new THREE.Group();

    const concrete = new THREE.MeshLambertMaterial({ color: PAL.concrete });
    const panel = new THREE.MeshLambertMaterial({ color: PAL.panel });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const wood = new THREE.MeshLambertMaterial({ color: PAL.wood });
    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const amberGlow = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });

    const mk = (geo, mat, x, y, z, rx, ry, rz) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        return m;
    };

    // --- Deck: beton berkerikil kusam ---
    const deckTex = makeTexture(128, 128, (c, w, h) => {
        c.fillStyle = '#3b3833'; c.fillRect(0, 0, w, h);
        speckle(c, w, h, ['#332f2a', '#454039', '#2b2824', '#4d473e'], 300, 1, 4);
        c.strokeStyle = 'rgba(20,18,15,0.5)'; c.lineWidth = 2;
        for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(i * w / 6, 0); c.lineTo(i * w / 6, h); c.stroke(); }
    }, 10, 10);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2),
        new THREE.MeshLambertMaterial({ map: deckTex }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(IX, ROOF_Y + 0.02, IZ);
    deck.receiveShadow = true;
    g.add(deck);

    // --- Parapet: tembok rendah keliling tepi atap (4 sisi) — ~0.9 m ---
    const PAR_H = 6, PAR_T = 4;
    mk(new THREE.BoxGeometry(HALF_X * 2 + PAR_T, PAR_H, PAR_T), concrete, IX, PAR_H / 2, IZ - HALF_Z);
    mk(new THREE.BoxGeometry(HALF_X * 2 + PAR_T, PAR_H, PAR_T), concrete, IX, PAR_H / 2, IZ + HALF_Z);
    mk(new THREE.BoxGeometry(PAR_T, PAR_H, HALF_Z * 2 + PAR_T), concrete, IX - HALF_X, PAR_H / 2, IZ);
    mk(new THREE.BoxGeometry(PAR_T, PAR_H, HALF_Z * 2 + PAR_T), concrete, IX + HALF_X, PAR_H / 2, IZ);

    // --- BULKHEAD (rumah tangga/penthouse) di tepi UTARA dgn PINTU turun ke
    // gedung (= Stage 1). Pintu menghadap SELATAN (+z, ke arah player). Dikecilkan
    // 2026-07-17 (proporsional dgn karakter ~12 unit; door harus muat di BH). ---
    const BW = 38, BH = 25, BD = 28;
    const bx = DOOR.x, bz = IZ - HALF_Z + BD / 2 + 6;
    mk(new THREE.BoxGeometry(BW, BH, BD), panel, bx, BH / 2, bz);                 // badan bulkhead
    mk(new THREE.BoxGeometry(BW + 5, 3, BD + 5), gun, bx, BH + 1.5, bz);         // atap bulkhead
    // Kusen + daun pintu (gelap = bukaan menuju tangga bawah). Ukuran DISESUAIKAN
    // dgn tinggi karakter (~12 unit): pintu ~1.4× tinggi orang, BUKAN raksasa.
    const DFW = 8, DFH = 16.5;
    const doorZ = bz + BD / 2 + 0.4;
    mk(new THREE.BoxGeometry(DFW + 4, DFH + 3, 1.2), steel, DOOR.x, DFH / 2, doorZ);   // kusen
    mk(new THREE.BoxGeometry(DFW, DFH, 1.0), ink, DOOR.x, DFH / 2, doorZ + 0.6);       // daun pintu gelap (bukaan)
    // Lampu pintu amber (aksen manusia GIBS 2045) + PointLight kecil
    mk(new THREE.BoxGeometry(6, 1.6, 1.6), amberGlow, DOOR.x, DFH + 3, doorZ + 0.5);
    const doorLight = new THREE.PointLight(PAL.amber, 0.8, 110, 2);
    doorLight.position.set(DOOR.x, DFH + 4, doorZ + 6);
    g.add(doorLight);

    // --- TANGKI AIR kayu di atas kaki baja (ikonik atap kota) — dikecilkan
    // ~1.9 m radius, tinggi total ~7 m (dulu ~13 m = raksasa). DITUKAR ke sisi
    // KANAN-atas 2026-07-18 (pintu pindah ke kiri; lihat DOOR). ---
    const tk = at(110, -96);
    const TR = 12, TBODY = 18, TLEG = 22;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        mk(new THREE.BoxGeometry(2.4, TLEG, 2.4), steel, tk.x + lx * 8, TLEG / 2, tk.z + lz * 8);
    }
    mk(new THREE.CylinderGeometry(TR, TR, TBODY, 16), wood, tk.x, TLEG + TBODY / 2, tk.z);   // tabung kayu
    mk(new THREE.CylinderGeometry(TR + 0.8, TR + 0.8, 1.6, 16), steel, tk.x, TLEG + 4, tk.z);         // pita baja bawah
    mk(new THREE.CylinderGeometry(TR + 0.8, TR + 0.8, 1.6, 16), steel, tk.x, TLEG + TBODY - 4, tk.z); // pita baja atas
    mk(new THREE.ConeGeometry(TR + 1.5, 9, 16), wood, tk.x, TLEG + TBODY + 4.5, tk.z);       // atap kerucut

    // --- Unit HVAC (2 kotak dgn kipas) + ventilasi — dikecilkan ~40% ---
    const hvac = (hx, hz, w, d) => {
        mk(new THREE.BoxGeometry(w, 11, d), steel, hx, 5.5, hz);
        mk(new THREE.BoxGeometry(w - 5, 2.4, d - 5), gun, hx, 11, hz);
        mk(new THREE.CircleGeometry(Math.min(w, d) * 0.32, 12), ink, hx, 12.3, hz, -Math.PI / 2, 0, 0);   // kipas
    };
    hvac(IX + 100, IZ + 66, 24, 20);
    hvac(IX - 60, IZ + 100, 18, 18);
    // Cerobong/ventilasi (silinder pendek)
    mk(new THREE.CylinderGeometry(3, 3, 13, 10), gun, IX + 124, 6.5, IZ - 30);
    mk(new THREE.CylinderGeometry(2.5, 2.5, 10, 10), gun, IX - 122, 5, IZ + 20);
    // Pipa mendatar di dek (sepanjang sumbu-x)
    const pipe = new THREE.CylinderGeometry(1.5, 1.5, 90, 8); pipe.rotateZ(Math.PI / 2);
    mk(pipe, steel, IX - 10, 2, IZ - 30);

    scene.add(g);
    return g;
}

// ===== Bangun KOTA JAKARTA di bawah/keliling atap (DIROMBAK 2026-07-20,
// permintaan user + foto udara referensi Sudirman-Thamrin malam): latar harus
// BISA DIKENALI sebagai Jakarta — JALAN PROTOKOL ber-ARUS LALU LINTAS (titik
// lampu MERAH/PUTIH spt foto long-exposure), simpang susun SEMANGGI (dek ring
// layang), BUNDARAN HI (kolam + Monumen Selamat Datang + air mancur), MONAS +
// ring Medan Merdeka, STADION GBK, hamparan KAMPUNG (rumah kecil + taburan
// lampu hangat), deretan RUKO/TOKO ber-signboard, satu SEKOLAH (gedung putih +
// bendera merah-putih), dan gedung tinggi yang TIDAK terlalu banyak (menara
// jangkung hanya di koridor Sudirman-Thamrin; sisanya blok rendah jarang).
// Semua masuk grup `parent` (= roof) supaya ikut dibuang di akhir. Efisien &
// mudah dipanaskan: gedung/rumah/ruko/lampu/trafik = InstancedMesh. =====
// Bundaran + air mancur khas Jakarta (Bundaran HI) — dipakai buildCity.
const RB = { x: IX, z: IZ + 470 };   // pusat bundaran (selatan hero)
const RB_R = 220;                    // radius luar (utk sisihkan gedung/pohon)
// LANDMARK JAKARTA (2026-07-19, permintaan user — "INI DI JAKARTA!"): MONAS di
// taman Medan Merdeka (timur-laut hero = tepat arah pandang kamera saat hover/
// turun tali) + STADION GBK (barat-daya = terlihat selama fly-in). Bundaran HI
// = RB di atas. Radius = zona eksklusi gedung/pohon di buildCity/buildTrees.
const LM_MONAS = { x: IX + 700, z: IZ - 500, r: 330 };
const LM_GBK = { x: IX - 900, z: IZ + 700, r: 360 };
// Debug/uji: ketinggian hover + posisi ketiga landmark (utk smoke test)
export const introMetrics = () => ({
    hoverY: HOVER_Y,
    landmarks: { monas: { ...LM_MONAS }, gbk: { ...LM_GBK }, bundaranHI: { x: RB.x, z: RB.z, r: RB_R } },
});

// --- JALAN PROTOKOL (2026-07-20; koordinat LOKAL dx,dz thd IX/IZ; w = lebar
// aspal). Sudirman: lewat sisi timur kompleks GBK -> Bundaran HI; Thamrin:
// Bundaran HI -> tepi Medan Merdeka (Monas) — persis urutan aslinya di
// Jakarta; Tol dalam kota (Gatot Subroto) menyilang Sudirman di SEMANGGI. ---
const SUDIRMAN = { x0: -1450, z0: 1500, x1: 0, z1: 470, w: 96 };
const THAMRIN = { x0: 0, z0: 470, x1: 507, z1: -232, w: 96 };
const TOLL = { x0: -1228, z0: -492, x1: 392, z1: 1789, w: 118 };
const MAIN_ROADS = [SUDIRMAN, THAMRIN, TOLL];
const SEMANGGI = { x: -360, z: 730, r: 178 };    // pusat + radius dek ring layang
const SCHOOL = { x: 476, z: 67 };                 // kompleks sekolah (timur Thamrin)

const segLen = (s) => Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
// Jarak titik (lokal) ke SEGMEN jalan — zona eksklusi & penempatan tepi jalan
function distSeg(px, pz, s) {
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0, L2 = dx * dx + dz * dz;
    let t = L2 ? ((px - s.x0) * dx + (pz - s.z0) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s.x0 + dx * t), pz - (s.z0 + dz * t));
}
// Jarak ke tepi aspal jalan protokol terdekat (negatif = di atas aspal)
const distMainRoad = (px, pz) => Math.min(...MAIN_ROADS.map(s => distSeg(px, pz, s) - s.w / 2));

// Statistik kota (utk smoke test: Jakarta terbangun, gedung tak berlebihan)
let cityStats = null;
export const cityDebug = () => cityStats;

// Satu InstancedMesh box dari daftar {x,y,z,sx,sy,sz,ry?,color?} — dipakai
// rumah kampung, signboard ruko, mahkota gedung, lampu jalan & titik trafik.
function instBoxes(parent, list, mat) {
    if (!list.length) return null;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
        _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
    list.forEach((b, i) => {
        _e.set(0, b.ry || 0, 0);
        _m.compose(_p.set(b.x, b.y, b.z), _q.setFromEuler(_e), _s.set(b.sx, b.sy, b.sz));
        inst.setMatrixAt(i, _m);
        if (b.color != null) inst.setColorAt(i, _c.setHex(b.color));
    });
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (inst.instanceMatrix) inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    parent.add(inst);
    return inst;
}

// Jendela menyala gaya Jakarta malam (foto: gedung TERANG, campuran hangat +
// putih dingin, kepadatan ~30%) — grid = makeFacadeTex agar jendelanya sejajar.
function makeJktLitTex() {
    const sy = 16, sx = 13, ww = 9, wh = 10;
    return makeTexture(256, 512, (g, w, h) => {
        g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
        for (let y = 8; y < h - 8; y += sy) {
            for (let x = 6; x < w - 6; x += sx) {
                const r = Math.random();
                if (r < 0.30) {
                    g.fillStyle = r < 0.16 ? '#ffcf92' : (r < 0.24 ? '#f2e4c0' : '#c6d4e2');
                    g.fillRect(x, y, ww, wh);
                }
            }
        }
    });
}

function buildCity(parent) {
    const col = { red: [], white: [], lamp: [], pole: [] };   // kolektor trafik + lampu jalan (di-flush jadi InstancedMesh)

    // --- Hamparan kota dari udara: dasar gelap + TABURAN CAHAYA hunian hangat
    //     (karpet lampu kota spt foto) + garis gang/jalan lingkungan samar ---
    const cityTex = makeTexture(256, 256, (c, w, h) => {
        c.fillStyle = '#14161b'; c.fillRect(0, 0, w, h);
        speckle(c, w, h, ['#1a1c21', '#101115', '#191a1e', '#1e2026'], 170, 1, 4);
        for (let i = 0; i < 150; i++) {   // lampu hunian: mayoritas hangat, sebagian putih
            c.fillStyle = Math.random() < 0.72 ? 'rgba(255,188,116,0.5)' : 'rgba(208,218,232,0.32)';
            const s = 1 + Math.random() * 1.7;
            c.fillRect(Math.random() * w, Math.random() * h, s, s);
        }
        c.strokeStyle = 'rgba(255,200,140,0.08)'; c.lineWidth = 2;   // gang/jalan lingkungan samar
        for (let i = 1; i < 4; i++) {
            c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h);
            c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke();
        }
    }, 20, 20);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5400, 5400),
        new THREE.MeshLambertMaterial({ map: cityTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(IX, CITY_GROUND, IZ);
    ground.receiveShadow = true;
    parent.add(ground);

    // --- Kanal/sungai di sisi UTARA (jauh -z) ---
    const river = new THREE.Mesh(new THREE.PlaneGeometry(5400, 900),
        new THREE.MeshLambertMaterial({ color: 0x2c3a42 }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(IX, CITY_GROUND + 1, IZ - 1850);
    parent.add(river);

    // --- Gedung PAHLAWAN (menara tempat atap ini berada) di bawah deck: 2 tingkat
    //     setback biar siluetnya spt pencakar langit, top rata dgn deck (y ~ -4) ---
    const facadeTex = makeFacadeTex();
    const litTex = makeLitTex();
    const heroMat = new THREE.MeshLambertMaterial({
        color: 0x2b2f37, map: facadeTex, emissive: 0xff9a4a, emissiveMap: litTex, emissiveIntensity: 0.3
    });
    const heroTier = (w, d, y0, y1) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, d), heroMat);
        m.position.set(IX, (y0 + y1) / 2, IZ);
        m.castShadow = true; m.receiveShadow = true;
        parent.add(m);
    };
    heroTier(HALF_X * 2 + 70, HALF_Z * 2 + 70, CITY_GROUND, -210);   // pangkal lebar
    heroTier(HALF_X * 2 + 8, HALF_Z * 2 + 8, -210, -4);              // tingkat atas (top rata deck)

    // --- JALAN PROTOKOL ber-arus lalu lintas + simpang susun SEMANGGI ---
    buildRoads(parent, col);
    buildSemanggi(parent, col);

    // --- BUNDARAN HI + MONAS/Medan Merdeka + STADION GBK ---
    buildRoundabout(parent, col);
    buildLandmarks(parent, col);

    // --- Taman/ruang hijau tersebar (Jakarta banyak ruang terbuka hijau) ---
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x2c4a24 });
    const park = (px, pz, r) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 22), grassMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(IX + px, CITY_GROUND + 0.6, IZ + pz);
        m.receiveShadow = true; parent.add(m);
    };
    park(-760, 280, 155); park(980, -260, 130); park(-400, -880, 120); park(900, 600, 165); park(220, 1180, 140);

    // --- GEDUNG TINGGI: TIDAK terlalu banyak (permintaan user) — menara
    //     jangkung HANYA di KORIDOR Sudirman-Thamrin (canyon skyline spt foto;
    //     jendela menyala campuran hangat/putih + MAHKOTA ATAP menyala amber/
    //     putih/teal spt foto malam Jakarta), di luar koridor blok rendah jarang. ---
    const towerMat = new THREE.MeshLambertMaterial({
        color: 0xffffff, map: facadeTex, emissive: 0xffffff,
        emissiveMap: makeJktLitTex(), emissiveIntensity: 0.8
    });
    const list = [], crowns = [];
    const CROWN_COLORS = [0xffb35c, 0xcfd8e4, PAL.tech];
    const CELL = 150;
    for (let gx = -1980; gx <= 1980; gx += CELL) {
        for (let gz = -1150; gz <= 1980; gz += CELL) {
            if (Math.abs(gx) < HALF_X + 120 && Math.abs(gz) < HALF_Z + 120) continue;   // sisakan hero
            if (Math.hypot(gx, gz - (RB.z - IZ)) < RB_R + 40) continue;                 // sisakan bundaran
            if (Math.abs(gx - (LM_MONAS.x - IX)) < 400 && Math.abs(gz - (LM_MONAS.z - IZ)) < 400) continue;   // Medan Merdeka + ring jalannya
            if (Math.hypot(gx - (LM_GBK.x - IX), gz - (LM_GBK.z - IZ)) < LM_GBK.r + 40) continue;             // Stadion GBK
            if (Math.hypot(gx - SEMANGGI.x, gz - SEMANGGI.z) < SEMANGGI.r + 70) continue;                     // dek Semanggi
            if (Math.hypot(gx - SCHOOL.x, gz - SCHOOL.z) < 170) continue;                                     // sekolah
            if (distMainRoad(gx, gz) < 42) continue;                                                          // jangan di aspal
            const canyon = Math.min(distSeg(gx, gz, SUDIRMAN), distSeg(gx, gz, THAMRIN)) < 300;
            if (Math.random() > (canyon ? 0.5 : 0.14)) continue;
            const jx = (Math.random() - 0.5) * 36, jz = (Math.random() - 0.5) * 36;
            let w, d, h;
            if (canyon) {   // menara koridor protokol (canyon Sudirman spt foto)
                w = 36 + Math.random() * 30; d = 36 + Math.random() * 30;
                h = 240 + Math.random() * 320;
                if (Math.random() < 0.12) h = 560 + Math.random() * 120;   // menara super
            } else {        // luar koridor: blok rendah jarang (mal/kantor kecil)
                w = 44 + Math.random() * 46; d = 44 + Math.random() * 46;
                h = 60 + Math.random() * 140;
            }
            const ry = (Math.random() - 0.5) * 0.25;
            list.push({ x: IX + gx + jx, z: IZ + gz + jz, w, d, h, ry, rz: 0, color: CITY_PALETTE[(Math.random() * CITY_PALETTE.length) | 0] });
            if (h > 280) crowns.push({   // mahkota atap menyala (ikon skyline Jakarta malam)
                x: IX + gx + jx, y: h + 2, z: IZ + gz + jz,
                sx: w * 0.85, sy: 4, sz: d * 0.85, ry,
                color: CROWN_COLORS[(Math.random() * CROWN_COLORS.length) | 0]
            });
        }
    }
    // fillBuildingInstances menaruh box dari y=0; bungkus grup digeser ke jalanan.
    const cityG = new THREE.Group();
    cityG.position.y = CITY_GROUND;
    parent.add(cityG);
    fillBuildingInstances(cityG, list, towerMat);
    instBoxes(cityG, crowns, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));

    // --- KAMPUNG (rumah) + deretan RUKO/TOKO + SEKOLAH ---
    const nHouses = buildKampung(parent);
    const nRuko = buildRukoRows(parent);
    buildSchool(parent);

    // --- Flush lampu jalan + arus lalu lintas (satu InstancedMesh per warna) ---
    instBoxes(parent, col.pole, new THREE.MeshLambertMaterial({ color: 0x2c3036 }));
    instBoxes(parent, col.lamp, new THREE.MeshBasicMaterial({ color: 0xffe2ae, toneMapped: false }));
    instBoxes(parent, col.red, new THREE.MeshBasicMaterial({ color: 0xe8442e, toneMapped: false }));
    instBoxes(parent, col.white, new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false }));

    // --- Pepohonan (jalur hijau tepi jalan protokol + tersebar) ---
    buildTrees(parent);

    cityStats = {
        roads: MAIN_ROADS.length, towers: list.length, crowns: crowns.length,
        houses: nHouses, rukos: nRuko,
        carDots: col.red.length + col.white.length, lampHeads: col.lamp.length
    };
}

// BUNDARAN HI (dirombak 2026-07-20, foto referensi): jalan ring aspal, rumput,
// KOLAM air mancur menyala, Monumen Selamat Datang (pedestal DI KOLAM + kolom
// + dua figur melambai), cincin lampu tepi + TRAFIK memutari bundaran. Semua
// di CITY_GROUND (jauh di bawah deck) — landmark latar terlihat dari atap.
function buildRoundabout(parent, col) {
    const y = CITY_GROUND;
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x23262c });
    const grass = new THREE.MeshLambertMaterial({ color: 0x2f5227 });
    const water = new THREE.MeshLambertMaterial({ color: 0x2f5a66, emissive: 0x14343c, emissiveIntensity: 0.45 });
    const stone = new THREE.MeshLambertMaterial({ color: 0x8f8b80 });
    const monu = new THREE.MeshLambertMaterial({ color: 0xb7a98a, emissive: 0x2a2214, emissiveIntensity: 0.35 });
    const flat = (geo, mat, dy) => {
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2; m.position.set(RB.x, y + dy, RB.z);
        m.receiveShadow = true; parent.add(m);
    };
    flat(new THREE.RingGeometry(120, 210, 44), asphalt, 2.0);   // jalan ring (menutup ruas jalan protokol di bawahnya)
    flat(new THREE.CircleGeometry(118, 36), grass, 2.6);         // rumput dalam
    flat(new THREE.CircleGeometry(86, 36), water, 3.2);          // kolam air mancur (menyala lembut)
    // Monumen "Selamat Datang": pedestal DI TENGAH KOLAM + kolom + dua figur
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 12, 14), stone);
    ped.position.set(RB.x, y + 9, RB.z); ped.castShadow = true; parent.add(ped);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 36, 10), monu);
    spire.position.set(RB.x, y + 33, RB.z); spire.castShadow = true; parent.add(spire);
    for (const s of [-1, 1]) {   // dua figur "Selamat Datang" melambai (abstrak)
        const fig = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 1.5), monu);
        fig.position.set(RB.x + s * 2.8, y + 57, RB.z);
        fig.rotation.z = s * 0.12; parent.add(fig);
    }
    // Semburan air mancur menyala (foto: kolam HI bercahaya putih)
    const jetMat = new THREE.MeshBasicMaterial({ color: 0xcfe2ea, toneMapped: false });
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const jet = new THREE.Mesh(new THREE.ConeGeometry(2.2, 11, 8), jetMat);
        jet.position.set(RB.x + Math.cos(a) * 42, y + 8.5, RB.z + Math.sin(a) * 42);
        parent.add(jet);
    }
    for (let i = 0; i < 12; i++) {   // cincin lampu tepi bundaran
        const a = i / 12 * Math.PI * 2;
        const x = RB.x + Math.cos(a) * 222, z = RB.z + Math.sin(a) * 222;
        col.pole.push({ x, y: y + 12, z, sx: 1.3, sy: 24, sz: 1.3 });
        col.lamp.push({ x, y: y + 25, z, sx: 2.6, sy: 1.5, sz: 2.6 });
    }
    for (let i = 0; i < 16; i++) {   // trafik memutari bundaran
        const a = Math.random() * Math.PI * 2, r = 128 + Math.random() * 74;
        (i % 2 ? col.red : col.white).push({
            x: RB.x + Math.cos(a) * r, y: y + 2.4, z: RB.z + Math.sin(a) * r,
            sx: 2.8, sy: 1.4, sz: 2.8
        });
    }
}

// LANDMARK JAKARTA (2026-07-19, permintaan user — foto referensi): MONAS di
// taman Medan Merdeka (rumput persegi luas + pelataran cawan + obelisk marmer
// menjulang + LIDAH API emas ber-emissive amber) di TIMUR-LAUT hero — tepat
// arah pandang kamera SW→NE saat hover/turun tali; STADION GBK (mangkuk OVAL
// shell terbuka + ring kanopi + lapangan hijau + lintasan + 4 menara lampu)
// di BARAT-DAYA — terlihat selama fly-in. Bundaran HI sudah dibangun
// buildRoundabout. Semua di CITY_GROUND, murni latar (bukan gameplay);
// Lambert/Basic (ikut ter-warmup warmupIntro, tanpa recompile); emissive api
// Monas 0.85 <= EMISSIVE_MAX (aksen amber — panduan GIBS 2045).
function buildLandmarks(parent, col) {
    const y = CITY_GROUND;
    const grass = new THREE.MeshLambertMaterial({ color: 0x2c4a24 });
    // Monas malam hari DISOROT lampu sorot -> marmer ber-emissive lembut (foto)
    const marble = new THREE.MeshLambertMaterial({ color: PAL.white, emissive: 0x8a8474, emissiveIntensity: 0.5 });
    const stone = new THREE.MeshLambertMaterial({ color: 0x8f8b80 });
    const flame = new THREE.MeshLambertMaterial({ color: 0xd8a437, emissive: 0x8a5a14, emissiveIntensity: 0.85 });

    // --- MONAS + Medan Merdeka + RING JALAN keliling taman (2026-07-20) ---
    {
        const mx = LM_MONAS.x, mz = LM_MONAS.z;
        const park = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), grass);
        park.rotation.x = -Math.PI / 2; park.position.set(mx, y + 0.6, mz);
        park.receiveShadow = true; parent.add(park);
        const put = (geo, mat, py) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(mx, py, mz); m.castShadow = true; parent.add(m);
        };
        put(new THREE.BoxGeometry(120, 18, 120), stone, y + 9);                    // pelataran dasar
        put(new THREE.BoxGeometry(64, 14, 64), marble, y + 25);                    // cawan/museum
        put(new THREE.CylinderGeometry(6.5, 10.5, 250, 8), marble, y + 157);       // obelisk menjulang
        put(new THREE.CylinderGeometry(11, 8, 8, 8), marble, y + 285);             // pelataran puncak
        put(new THREE.ConeGeometry(7, 16, 8), flame, y + 296);                     // lidah api emas
        // Ring jalan Medan Merdeka (aspal persegi keliling taman) + trafik tipis
        const ringMat = new THREE.MeshLambertMaterial({ color: 0x21242b });
        const mkRing = (w_, h_, ox, oz) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w_, h_), ringMat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(mx + ox, y + 1.2, mz + oz);
            parent.add(m);
        };
        mkRing(760, 34, 0, -350); mkRing(760, 34, 0, 350);
        mkRing(34, 760, -350, 0); mkRing(34, 760, 350, 0);
        for (let i = 0; i < 10; i++) {
            const side = (Math.random() * 4) | 0, t = (Math.random() - 0.5) * 660;
            const ox = side === 0 || side === 1 ? t : (side === 2 ? -350 : 350);
            const oz = side === 0 ? -350 : (side === 1 ? 350 : t);
            (i % 2 ? col.red : col.white).push({ x: mx + ox, y: y + 2.4, z: mz + oz, sx: 2.8, sy: 1.4, sz: 2.8 });
        }
    }

    // --- STADION GBK (oval = grup di-skala-x) ---
    {
        const g = new THREE.Group();
        g.position.set(LM_GBK.x, y, LM_GBK.z);
        g.scale.x = 1.35;   // mangkuk OVAL khas stadion
        const add = (m) => { g.add(m); return m; };
        const bowl = add(new THREE.Mesh(new THREE.CylinderGeometry(215, 250, 62, 28, 1, true),
            new THREE.MeshLambertMaterial({ color: 0x9a958a, side: THREE.DoubleSide })));
        bowl.position.y = 31; bowl.castShadow = true;
        const rim = add(new THREE.Mesh(new THREE.CylinderGeometry(224, 224, 7, 28, 1, true),
            new THREE.MeshLambertMaterial({ color: 0x71757d, side: THREE.DoubleSide })));
        rim.position.y = 64;   // ring kanopi atas
        const track = add(new THREE.Mesh(new THREE.CircleGeometry(190, 28),
            new THREE.MeshLambertMaterial({ color: 0x7a4a3a })));
        track.rotation.x = -Math.PI / 2; track.position.y = 1.2;
        const field = add(new THREE.Mesh(new THREE.CircleGeometry(140, 24),
            new THREE.MeshLambertMaterial({ color: 0x2f6b2a })));
        field.rotation.x = -Math.PI / 2; field.position.y = 1.8;
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xcfd8e4, toneMapped: false });
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {   // 4 menara lampu sudut
            const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 110, 6), stone));
            pole.position.set(sx * 235, 55, sz * 200);
            const head = add(new THREE.Mesh(new THREE.BoxGeometry(26, 10, 3), lampMat));
            head.position.set(sx * 235, 116, sz * 200);
        }
        parent.add(g);
    }
}

// Pepohonan latar (foto: Sudirman-Semanggi RIMBUN jalur hijau): SATU
// InstancedMesh kerucut hijau — separuh ditanam BERBARIS di tepi jalan
// protokol (jalur hijau spt foto Semanggi), sisanya tersebar (hindari hero,
// bundaran, landmark, dek Semanggi, sekolah, aspal). Base di CITY_GROUND.
function buildTrees(parent) {
    const N = 300;
    const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
        new THREE.MeshLambertMaterial({ color: 0x27431f }), N);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    const spotOk = (dx, dz) => {
        if (Math.abs(dx) < HALF_X + 120 && Math.abs(dz) < HALF_Z + 120) return false;   // bukan hero
        if (Math.hypot(dx, dz - (RB.z - IZ)) < 128) return false;                        // bukan kolam/rumput bundaran
        if (Math.abs(dx - (LM_MONAS.x - IX)) < 300 && Math.abs(dz - (LM_MONAS.z - IZ)) < 300) return false;   // bukan pelataran Monas
        if (Math.hypot(dx - (LM_GBK.x - IX), dz - (LM_GBK.z - IZ)) < LM_GBK.r) return false;                  // bukan area GBK
        if (Math.hypot(dx - SEMANGGI.x, dz - SEMANGGI.z) < SEMANGGI.r + 16) return false;                     // bukan dek Semanggi
        if (Math.hypot(dx - SCHOOL.x, dz - SCHOOL.z) < 90) return false;                                      // bukan sekolah
        if (distMainRoad(dx, dz) < 8) return false;                                                           // jangan di aspal
        return true;
    };
    for (let i = 0; i < N; i++) {
        let dx = 0, dz = 0;
        for (let t = 0; t < 8; t++) {
            if (t < 4 && i % 2 === 0) {   // separuh pohon = barisan jalur hijau tepi jalan
                const s = MAIN_ROADS[(Math.random() * MAIN_ROADS.length) | 0];
                const len = segLen(s), ddx = (s.x1 - s.x0) / len, ddz = (s.z1 - s.z0) / len;
                const d = Math.random() * len, side = Math.random() < 0.5 ? -1 : 1;
                const off = side * (s.w / 2 + 12 + Math.random() * 14);
                dx = s.x0 + ddx * d - ddz * off; dz = s.z0 + ddz * d + ddx * off;
            } else {
                dx = (Math.random() - 0.5) * 3800; dz = -1120 + Math.random() * 3080;
            }
            if (spotOk(dx, dz)) break;
        }
        const sc = 8 + Math.random() * 11;
        _m.compose(_p.set(IX + dx, CITY_GROUND + sc / 2, IZ + dz), _q, _s.set(sc * 0.7, sc, sc * 0.7));
        inst.setMatrixAt(i, _m);
    }
    if (inst.instanceMatrix) inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    parent.add(inst);
}

// ===== JALAN PROTOKOL (2026-07-20): bidang aspal bermarka lajur (tekstur per
// ruas, repeat ikut panjang) + MEDIAN hijau + lampu jalan dua sisi + ARUS LALU
// LINTAS: pasangan titik lampu MERAH (lajur kiri) / PUTIH (lajur kanan) —
// meniru foto udara long-exposure Sudirman/tol dalam kota. =====
function buildRoads(parent, col) {
    const medianMat = new THREE.MeshLambertMaterial({ color: 0x24381e });
    for (const s of MAIN_ROADS) {
        const len = segLen(s);
        const tex = makeTexture(128, 256, (c, w, h) => {
            c.fillStyle = '#20232a'; c.fillRect(0, 0, w, h);
            speckle(c, w, h, ['#181b21', '#262a32', '#141619'], 90, 1, 3);
            c.fillStyle = 'rgba(214,208,190,0.30)';                    // garis tepi
            c.fillRect(4, 0, 3, h); c.fillRect(w - 7, 0, 3, h);
            c.fillStyle = 'rgba(214,208,190,0.16)';                    // marka lajur putus-putus
            for (const lx of [22, 38, 54, 74, 90, 106]) {
                for (let y = 0; y < h; y += 26) c.fillRect(lx, y, 2, 12);
            }
        }, 1, Math.max(2, Math.round(len / 300)));
        const g = new THREE.Group();
        g.position.set(IX + (s.x0 + s.x1) / 2, CITY_GROUND + 1.4, IZ + (s.z0 + s.z1) / 2);
        g.rotation.y = Math.atan2(s.x1 - s.x0, s.z1 - s.z0);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, len), new THREE.MeshLambertMaterial({ map: tex }));
        m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
        g.add(m);
        const med = new THREE.Mesh(new THREE.PlaneGeometry(7, len), medianMat);   // median jalur hijau
        med.rotation.x = -Math.PI / 2; med.position.y = 0.25;
        g.add(med);
        parent.add(g);
        dressRoad(col, s);
    }
}

// Lampu jalan + arus trafik sepanjang satu ruas (masuk kolektor col)
function dressRoad(col, s) {
    const len = segLen(s), dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
    const px = -dz, pz = dx;   // tegak lurus (kiri arah ruas)
    for (let d = 45; d < len - 30; d += 115) {   // tiang lampu dua sisi
        for (const side of [-1, 1]) {
            const off = side * (s.w / 2 + 7);
            const x = IX + s.x0 + dx * d + px * off, z = IZ + s.z0 + dz * d + pz * off;
            col.pole.push({ x, y: CITY_GROUND + 16, z, sx: 1.4, sy: 32, sz: 1.4 });
            col.lamp.push({ x, y: CITY_GROUND + 33, z, sx: 3, sy: 1.6, sz: 3 });
        }
    }
    const carsPerSide = Math.floor(len / 26);   // arus: sisi kiri MERAH, kanan PUTIH
    for (let i = 0; i < carsPerSide; i++) {
        for (const [listArr, side] of [[col.red, -1], [col.white, 1]]) {
            const d = Math.random() * len;
            const off = side * (7 + Math.random() * (s.w / 2 - 16));
            const cx = s.x0 + dx * d + px * off, cz = s.z0 + dz * d + pz * off;
            for (const q of [-1.7, 1.7]) {   // sepasang lampu = satu mobil
                listArr.push({ x: IX + cx + px * q, y: CITY_GROUND + 2.4, z: IZ + cz + pz * q, sx: 2.8, sy: 1.4, sz: 2.8 });
            }
        }
    }
}

// ===== Simpang susun SEMANGGI (ikon foto referensi): dek RING LAYANG di
// persilangan Sudirman × Tol — cincin aspal melayang, tepi menyala hangat,
// kolom penyangga, dan trafik memutari dek. =====
function buildSemanggi(parent, col) {
    const cx = IX + SEMANGGI.x, cz = IZ + SEMANGGI.z, H = 30;
    const deck = new THREE.Mesh(new THREE.RingGeometry(122, SEMANGGI.r, 40),
        new THREE.MeshLambertMaterial({ color: 0x23262c, side: THREE.DoubleSide }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(cx, CITY_GROUND + H, cz);
    parent.add(deck);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffdca0, toneMapped: false, side: THREE.DoubleSide });
    for (const [r0, r1] of [[122, 126], [SEMANGGI.r - 4, SEMANGGI.r]]) {   // tepi dek menyala (lampu string)
        const e = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), glowMat);
        e.rotation.x = -Math.PI / 2;
        e.position.set(cx, CITY_GROUND + H + 0.4, cz);
        parent.add(e);
    }
    const colMat = new THREE.MeshLambertMaterial({ color: 0x6a655c });
    for (let i = 0; i < 10; i++) {   // kolom penyangga dek
        const a = i / 10 * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, H, 8), colMat);
        p.position.set(cx + Math.cos(a) * 150, CITY_GROUND + H / 2, cz + Math.sin(a) * 150);
        parent.add(p);
    }
    for (let i = 0; i < 18; i++) {   // trafik memutari dek layang
        const a = Math.random() * Math.PI * 2, r = 132 + Math.random() * 36;
        (i % 2 ? col.red : col.white).push({
            x: cx + Math.cos(a) * r, y: CITY_GROUND + H + 2.2, z: cz + Math.sin(a) * r,
            sx: 2.8, sy: 1.4, sz: 2.8
        });
    }
}

// ===== Hamparan KAMPUNG (foto 1: karpet atap rumah rapat + lampu hangat di
// antara menara): rumah kecil ber-orientasi acak (SATU InstancedMesh) +
// taburan titik lampu hangat. Menghindari jalan, koridor menara, landmark. =====
function buildKampung(parent) {
    const houses = [], glow = [];
    const HOUSE_COLORS = [0x2e2a24, 0x38322a, 0x27251f, 0x403830, 0x33291f];
    let tries = 0;
    while (houses.length < 820 && tries < 6000) {
        tries++;
        const dx = (Math.random() - 0.5) * 3960, dz = -1120 + Math.random() * 3100;
        if (Math.abs(dx) < HALF_X + 150 && Math.abs(dz) < HALF_Z + 150) continue;   // hero
        if (Math.hypot(dx, dz - (RB.z - IZ)) < RB_R + 30) continue;                 // bundaran
        if (Math.abs(dx - (LM_MONAS.x - IX)) < 385 && Math.abs(dz - (LM_MONAS.z - IZ)) < 385) continue;   // Medan Merdeka + ring
        if (Math.hypot(dx - (LM_GBK.x - IX), dz - (LM_GBK.z - IZ)) < LM_GBK.r + 30) continue;             // GBK
        if (Math.hypot(dx - SEMANGGI.x, dz - SEMANGGI.z) < SEMANGGI.r + 60) continue;                     // Semanggi
        if (Math.hypot(dx - SCHOOL.x, dz - SCHOOL.z) < 150) continue;                                     // sekolah
        if (distMainRoad(dx, dz) < 20) continue;                                                          // jangan di aspal
        if (Math.min(distSeg(dx, dz, SUDIRMAN), distSeg(dx, dz, THAMRIN)) < 240) continue;                // koridor = zona menara
        const w = 8 + Math.random() * 13, d = 8 + Math.random() * 13, h = 5 + Math.random() * 8;
        houses.push({
            x: IX + dx, y: CITY_GROUND + h / 2, z: IZ + dz, sx: w, sy: h, sz: d,
            ry: (Math.random() - 0.5) * 0.9,
            color: HOUSE_COLORS[(Math.random() * HOUSE_COLORS.length) | 0]
        });
        if (Math.random() < 0.3) glow.push({   // lampu teras/gang hangat
            x: IX + dx + (Math.random() - 0.5) * 20, y: CITY_GROUND + 2.5 + Math.random() * 4,
            z: IZ + dz + (Math.random() - 0.5) * 20, sx: 1.8, sy: 1.1, sz: 1.8
        });
    }
    instBoxes(parent, houses, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    instBoxes(parent, glow, new THREE.MeshBasicMaterial({ color: 0xffc98c, toneMapped: false }));
    return houses.length;
}

// ===== Deretan RUKO/TOKO (foto: pertokoan ber-signboard menyala di tepi
// jalan): blok 2-4 lantai berjendela kasar + STRIP SIGNBOARD menyala (amber/
// putih/merah-bata/teal — tanpa neon terlarang) menghadap jalan. =====
function buildRukoRows(parent) {
    const rukos = [], signs = [];
    const SIGN_COLORS = [PAL.amber, PAL.white, PAL.hazard, PAL.tech];
    const RUKO_COLORS = [0x433c32, 0x3a362e, 0x4a4034, 0x36322c];
    const along = (s, d0, step) => {
        const len = segLen(s), dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
        const px = -dz, pz = dx, yaw = Math.atan2(dx, dz);
        for (let d = d0; d < len - 40; d += step) {
            for (const side of [-1, 1]) {
                if (Math.random() < 0.3) continue;   // sela gang/lot kosong
                const off = side * (s.w / 2 + 24);
                const x = s.x0 + dx * d + px * off, z = s.z0 + dz * d + pz * off;
                if (Math.abs(x) < 235 && Math.abs(z) < 250) continue;                       // hero
                if (Math.hypot(x, z - (RB.z - IZ)) < RB_R + 26) continue;                    // bundaran
                if (Math.hypot(x - SEMANGGI.x, z - SEMANGGI.z) < SEMANGGI.r + 40) continue;  // dek Semanggi
                if (Math.hypot(x - SCHOOL.x, z - SCHOOL.z) < 130) continue;                  // sekolah
                const h = 14 + Math.random() * 17;
                rukos.push({
                    x: IX + x, y: CITY_GROUND + h / 2, z: IZ + z, sx: 15, sy: h, sz: 20,
                    ry: yaw, color: RUKO_COLORS[(Math.random() * RUKO_COLORS.length) | 0]
                });
                signs.push({   // signboard menyala menghadap jalan
                    x: IX + x - side * px * 8.6, y: CITY_GROUND + h * 0.55, z: IZ + z - side * pz * 8.6,
                    sx: 1.1, sy: 3.4, sz: 13, ry: yaw,
                    color: SIGN_COLORS[(Math.random() * SIGN_COLORS.length) | 0]
                });
            }
        }
    };
    along(THAMRIN, 70, 26);
    along(SUDIRMAN, 220, 40);
    along(TOLL, 260, 44);
    // Jendela ruko pakai grid fasad KASAR (scale 4 -> lantai sedikit, proporsional
    // blok pendek) + jendela menyala hangat — resep facades.js yang sama.
    instBoxes(parent, rukos, makeCityMat(makeFacadeTex(4), makeLitTex(4)));
    instBoxes(parent, signs, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    return rukos.length;
}

// ===== SEKOLAH (permintaan user): kompleks khas sekolah Indonesia — gedung
// kelas putih panjang beratap genteng (bentuk L), lapangan upacara, koridor
// menyala hangat, dan tiang BENDERA MERAH-PUTIH. Timur Thamrin (terlihat
// kamera SW->NE saat hover/turun tali). =====
function buildSchool(parent) {
    const g = new THREE.Group();
    g.position.set(IX + SCHOOL.x, CITY_GROUND, IZ + SCHOOL.z);
    g.rotation.y = Math.atan2(THAMRIN.x1 - THAMRIN.x0, THAMRIN.z1 - THAMRIN.z0);   // sejajar jalan
    const wall = new THREE.MeshLambertMaterial({ color: PAL.white });
    const roofM = new THREE.MeshLambertMaterial({ color: 0x7c3b2c });   // genteng tanah liat
    const add = (geo, mat, x, yy, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, yy, z);
        m.castShadow = true; g.add(m);
        return m;
    };
    const field = new THREE.Mesh(new THREE.PlaneGeometry(92, 62),
        new THREE.MeshLambertMaterial({ color: 0x555045 }));   // lapangan upacara (paving)
    field.rotation.x = -Math.PI / 2; field.position.set(0, 1.4, 24); g.add(field);
    add(new THREE.BoxGeometry(96, 13, 16), wall, 0, 6.5, -16);        // gedung kelas utama
    add(new THREE.BoxGeometry(100, 3.4, 20), roofM, 0, 14.6, -16);    // atap genteng
    add(new THREE.BoxGeometry(16, 13, 46), wall, -44, 6.5, 12);       // sayap kelas (bentuk L)
    add(new THREE.BoxGeometry(20, 3.4, 50), roofM, -44, 14.6, 12);
    const lit = new THREE.Mesh(new THREE.BoxGeometry(92, 3.2, 0.7),   // koridor kelas menyala hangat
        new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
    lit.position.set(0, 6.8, -7.4); g.add(lit);
    add(new THREE.CylinderGeometry(0.5, 0.5, 26, 6), wall, 26, 13, 16);   // tiang bendera
    add(new THREE.BoxGeometry(5, 1.9, 0.4), new THREE.MeshLambertMaterial({ color: PAL.hazard }), 28.9, 24.4, 16);   // merah
    add(new THREE.BoxGeometry(5, 1.9, 0.4), wall, 28.9, 22.5, 16);                                                    // putih
    parent.add(g);
}

// ===== Kubah langit INTRO (2026-07-18): haze malam kota yang TENANG (biru-abu
// dingin, tanpa pijar kobaran api) — MENGGANTIKAN kubah apokaliptik global yang
// disembunyikan selama cutscene. Radius < camera.far & IKUT kamera (positionSky)
// agar tak pernah terpotong far-plane. =====
function buildIntroSky(parent) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#0a1018');   // puncak: biru malam gelap
    grad.addColorStop(0.50, '#1a2530');
    grad.addColorStop(0.78, '#33414d');   // horizon haze biru-abu
    grad.addColorStop(0.90, '#44525d');
    grad.addColorStop(1.00, '#2b343d');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    // bintang redup di atas
    g.fillStyle = '#cfd6ff';
    for (let i = 0; i < 200; i++) {
        const y = Math.random() * 180;
        g.globalAlpha = Math.max(0, 0.6 - y / 180) * (0.3 + Math.random() * 0.6);
        g.fillRect(Math.random() * 1024, y, 1.4, 1.4);
    }
    // pijar lampu KOTA di horizon (dingin putih-biru, BUKAN oranye api)
    g.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {
        const x = Math.random() * 1024, y = 392 + Math.random() * 40, r = 60 + Math.random() * 150;
        const rg = g.createRadialGradient(x, y, 3, x, y, r);
        rg.addColorStop(0, 'rgba(180,205,235,0.28)');
        rg.addColorStop(0.5, 'rgba(150,180,215,0.10)');
        rg.addColorStop(1, 'rgba(150,180,215,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    introSky = new THREE.Mesh(
        new THREE.SphereGeometry(3400, 32, 20),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })
    );
    introSky.position.set(IX, 0, IZ);
    parent.add(introSky);
}

// Kubah langit intro IKUT kamera (x,z) supaya tak terpotong far-plane (radius
// 3400 < camera.far 4000). Dipanggil tiap frame updateMode + saat warmupIntro.
function positionIntroSky() {
    if (introSky) introSky.position.set(camera.position.x, 0, camera.position.z);
}

// ===== TALI penjuntai (2026-07-17): silinder tipis dari perut heli ke atap;
// tumbuh saat fase 'rope' (scale.y 0->1, puncak terpaku di perut heli). Dibuat
// SEKALI di beginIntro (hidden) supaya shadernya ikut dipanaskan warmupAll. =====
function buildRope() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 6),
        new THREE.MeshLambertMaterial({ color: PAL.ink }));
    m.visible = false;
    scene.add(m);
    return m;
}

// Panjangkan tali: puncak terpaku di topY, tumbuh ke bawah sepanjang len×k.
function layRope(topY, len, k) {
    if (!rope) return;
    const L = Math.max(0.01, len * k);
    rope.scale.set(1, L, 1);
    rope.position.set(DROP.x, topY - L / 2, DROP.z);
    rope.visible = k > 0.02;
}

// ===== Mulai cutscene (dipanggil main.js SETELAH avatar/senjata di-init):
// sembunyikan avatar, spawn heli JAUH di langit, buat tali, nyalakan mode
// sinematik + letterbox. Kamera DIKENDALIKAN lewat pivot (dead-zone follow di
// followViewCam) — TIDAK pakai cineFocus, supaya heli terbang TERBUNTUTI ketat.
// Fase pertama = 'fly'. =====
export function beginIntro() {
    eyeH = CFG.player.eyeHeight;
    releaseInputs();
    setCinematicActive(true);
    setCineBars(true);
    setCineFocus(null);                              // kamera murni ikut pivot (dead-zone)
    // AUTO-PLAY (2026-07-17): cutscene diputar OTOMATIS (TANPA layar tutorial "Click
    // to Start") — unpause supaya updateGame menjalankan updateMode, sembunyikan
    // blocker. Tutorial baru ditampilkan finishIntro saat Stage 1 mau dimulai.
    setPaused(false);
    if (blocker) blocker.style.display = 'none';
    setEmbersVisible(false);   // TANPA percikan api di latar kota (dipulihkan finish)
    if (avatarGroup) avatarGroup.visible = false;   // player masih di heli (belum turun)
    const yaw = Math.atan2(DROP.x - FLY_START.x, DROP.z - FLY_START.z);   // hidung heli searah terbang (ke titik hover)
    heli = spawnHelicopter(FLY_START.x, FLY_START.z, yaw);
    heli.parts.group.position.y = FLY_START.y;
    heli.parts.group.rotation.z = 0.06;              // sedikit MIRING (bank) — gaya terbang
    rope = buildRope();
    // pivot (kamera) langsung mengikuti heli agar tak ada pan panjang di frame awal
    camera.position.set(FLY_START.x, FLY_START.y - AIR_DROP, FLY_START.z);
    // `live:false` (2026-07-20, bug fix): beginIntro dipanggil main.js MASIH di
    // balik layar loading (sebelum warmupAll/warmupIntro/hideLoading) — deru heli
    // + tombol SKIP dulu dinyalakan di sini sehingga MUNCUL DULUAN saat loading.
    // Keduanya kini ditunda ke frame PERTAMA updateMode (animate() baru berjalan
    // setelah hideLoading, jadi frame pertama = cutscene benar-benar tampil).
    cine = { phase: 'fly', t: 0, bob: 0, live: false };
    stepT = 0.12;                  // langkah pertama cepat terdengar saat fase walk mulai
}

// SKIP cutscene (2026-07-19, tombol kanan-bawah / SPACE): loncat langsung ke
// akhir — finishIntro aman dipanggil dari fase mana pun (lepas pose rappel,
// buang heli/tali/atap + pulihkan langit/bara/fog, masuk Stage 1 + tutorial).
export function skipIntro() { if (cine) finishIntro(); }

// Heli menggantung dgn ayunan halus (bob) di atas titik turun
function hoverHeli(dt) {
    cine.bob += dt;
    heli.parts.group.position.set(DROP.x, HOVER_Y + Math.sin(cine.bob * 1.6) * 1.6, DROP.z);
}

// ===== PEMANASAN KOTA (2026-07-18): dipanggil main.js SETELAH warmupAll, MASIH di
// balik layar loading — render scene intro dari SEMUA sudut kamera cutscene (fly
// jauh + hover + jalan) supaya SELURUH buffer/tekstur kota (InstancedMesh gedung,
// jalan, sungai, langit) terunggah ke GPU SEKARANG. Jadi saat cutscene berjalan
// TIDAK ada lag/freeze/stutter (permintaan user). Kamera dikembalikan persis. =====
export function warmupIntro() {
    if (!built) return;
    const render = () => { if (composer && postFxOn) composer.render(); else renderer.render(scene, viewCam); };
    const sx = camera.position.x, sy = camera.position.y, sz = camera.position.z;
    const views = [
        [FLY_START.x, FLY_START.y - AIR_DROP, FLY_START.z],   // Scene 1: heli menyusuri langit (kota luas)
        [DROP.x, DESC_TOP_FEET + eyeH, DROP.z],               // hover/turun (atap + kota di bawah)
        [DROP.x, ROOF_Y + eyeH, DROP.z],                      // mendarat di atap
        [DOOR.x, ROOF_Y + eyeH, DOOR.z],                      // jalan ke pintu
    ];
    for (const v of views) {
        camera.position.set(v[0], v[1], v[2]);
        positionIntroSky();
        followViewCam();   // snap viewCam ke pivot (lompatan > 400 = snap)
        render();
    }
    camera.position.set(sx, sy, sz);
    positionIntroSky();
    followViewCam();
}

export const introScene = {
    id: 'campaign-intro',

    // enter() (via setScene di startGame): bangun dunia atap + SEMUA dunia
    // campaign (agar warmup meng-compile shadernya & transisi ke Stage 1 di akhir
    // instan) + lampu malam. Cutscene sendiri dimulai beginIntro() (setelah
    // avatar/senjata ter-init). Posisikan pivot di atap utk frame awal.
    enter() {
        if (!built) { built = true; roof = buildRoof(); buildCity(roof); buildIntroSky(roof); }
        ensureCampaignWorlds();
        applyLightPreset(scene, 'night');
        // LATAR KOTA (2026-07-18): sembunyikan kubah KOBARAN API global + set fog
        // ke haze malam DINGIN (bukan oranye api) supaya gedung jauh memudar wajar
        // spt foto udara. Bara/abu disembunyikan di beginIntro. Dipulihkan finish.
        if (skyDome) skyDome.visible = false;
        if (scene.fog && scene.fog.color) {
            savedFog = { hex: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far };
            scene.fog.color.setHex(0x1b232c); scene.fog.near = 500; scene.fog.far = 3000;
        }
        camera.position.set(DROP.x, ROOF_Y + eyeH, DROP.z);
        camera.quaternion.set(0, 0, 0, 1);
    },

    restartScene: () => stage1Scene,   // mati mustahil di cutscene — tetap aman

    // Mesin cutscene (dipanggil updateGame tiap frame selagi TAK paused).
    updateMode(dt) {
        if (!cine) return;
        if (!cine.live) {
            // Frame pertama cutscene TAMPIL (layar loading sudah ditutup — lihat
            // catatan `live` di beginIntro): BARU nyalakan deru heli + tombol SKIP.
            cine.live = true;
            heliSnd = playLoopSFX(sfxHeli, 0.5);   // deru heli sepanjang cutscene (2026-07-19)
            showCutsceneSkip(skipIntro);           // tombol SKIP kanan-bawah (2026-07-19; SPACE juga)
        }
        const I = CFG.campaign.intro;
        cine.t += dt;
        positionIntroSky();   // kubah langit intro ikut kamera (anti far-plane clip)

        if (cine.phase === 'fly') {
            // SCENE 1 → SCENE 2 (transisi MULUS, digabung 2026-07-17): HELIKOPTER
            // MENYUSURI langit malam lalu MELAMBAT ke titik menggantung — SATU
            // lintasan LURUS FLY_START→hover dgn easeOut (cruise → berhenti mulus di
            // hover; TANPA belok arah / lompatan kecepatan di batas fase — dulu fly
            // linear lalu approach easeOut bikin patah). Kamera MENGIKUTI heli
            // (langit sekeliling) selama `flySec`, lalu BLEND MULUS (smoothstep) ke
            // framing tali selama `approachSec` terakhir.
            const dur = (I.flySec || 5) + (I.approachSec || 2.2);
            const k = Math.min(1, cine.t / dur);
            const e = easeOut(k);                              // posisi heli: cruise → decel ke hover
            const hx = lerp(FLY_START.x, DROP.x, e);
            const hy = lerp(FLY_START.y, HOVER_Y, e);
            const hz = lerp(FLY_START.z, DROP.z, e);
            heli.parts.group.position.set(hx, hy, hz);
            heli.parts.group.rotation.z = 0.06 * (1 - e);      // luruskan bank saat tiba
            updateHelicopter(heli, dt);
            // kamera: b=0 (ikut heli) selama flySec, lalu smoothstep 0→1 ke framing tali
            const bs = (I.flySec || 5) / dur;                  // titik mulai blend
            const b = k <= bs ? 0 : smooth((k - bs) / (1 - bs));
            camera.position.set(
                lerp(hx, DROP.x, b),
                lerp(hy - AIR_DROP, DESC_TOP_FEET + eyeH, b),
                lerp(hz, DROP.z, b));
            if (k >= 1) { cine.phase = 'hover'; cine.t = 0; heli.parts.group.rotation.z = 0; }

        } else if (cine.phase === 'hover') {
            // heli menggantung tepat di atas atap (kamera framing tali)
            hoverHeli(dt);
            updateHelicopter(heli, dt);
            camera.position.set(DROP.x, DESC_TOP_FEET + eyeH, DROP.z);
            if (cine.t >= (I.hoverSec || 1.2)) { cine.phase = 'rope'; cine.t = 0; }

        } else if (cine.phase === 'rope') {
            // TALI menjuntai turun dari heli ke atap.
            hoverHeli(dt);
            updateHelicopter(heli, dt);
            camera.position.set(DROP.x, DESC_TOP_FEET + eyeH, DROP.z);
            const k = Math.min(1, cine.t / (I.ropeSec || 1));
            layRope(heli.parts.group.position.y + 2, BELLY_Y - ROOF_Y, k);
            if (k >= 1) {
                cine.phase = 'descend'; cine.t = 0;
                if (avatarGroup) avatarGroup.visible = true;   // player mulai turun tali
            }

        } else if (cine.phase === 'descend') {
            // SCENE 2: character player TURUN dari tali — POSE FAST-ROPE (rig avatar),
            // kamera MENGIKUTI-nya turun (roof naik ke frame). setAvatarRappel(k)
            // memberi pose menggantung + redam pendaratan.
            hoverHeli(dt);
            updateHelicopter(heli, dt);
            layRope(heli.parts.group.position.y + 2, BELLY_Y - ROOF_Y, 1);
            const k = Math.min(1, cine.t / (I.descendSec || 3));
            const feetY = lerp(DESC_TOP_FEET, ROOF_Y, smooth(k));
            camera.position.set(DROP.x, feetY + eyeH, DROP.z);
            setAvatarRappel(true, k, Math.atan2(DOOR.x - DROP.x, DOOR.z - DROP.z));   // menghadap pintu
            if (k >= 1) {
                cine.phase = 'ropeUp'; cine.t = 0;
                setAvatarRappel(false);   // lepas tali → pose berdiri/jalan normal
                addCamShake(1.4);          // hentakan pendaratan
                playSFX(sfxFootstep, 0.55);   // bunyi kaki menjejak atap (2026-07-19, SFX cutscene)
            }

        } else if (cine.phase === 'ropeUp') {
            // (2026-07-18) SEBELUM player berjalan ke pintu: heli MENARIK NAIK
            // talinya. Player berdiri di titik turun MENONTON heli; kamera diam
            // di DROP. Menegaskan heli akan pergi (naik lagi kelak di Stage 4).
            hoverHeli(dt);
            updateHelicopter(heli, dt);
            camera.position.set(DROP.x, ROOF_Y + eyeH, DROP.z);
            const k = Math.min(1, cine.t / (I.ropeUpSec || 1.4));
            layRope(heli.parts.group.position.y + 2, BELLY_Y - ROOF_Y, 1 - k);   // tali ditarik naik
            faceAvatar(heli.parts.group.position.x, heli.parts.group.position.z); // menonton heli
            if (k >= 1) { cine.phase = 'heliLeave'; cine.t = 0; if (rope) rope.visible = false; }

        } else if (cine.phase === 'heliLeave') {
            // Heli MENANJAK & TERBANG PERGI meninggalkan atap; player menonton
            // kepergiannya. Setelah heli menjauh -> BARU player berjalan ke pintu.
            updateHelicopter(heli, dt);
            camera.position.set(DROP.x, ROOF_Y + eyeH, DROP.z);
            const k = Math.min(1, cine.t / (I.heliLeaveSec || 2.8));
            const e = smooth(k);
            const hx = lerp(DROP.x, LEAVE.x, e), hy = lerp(HOVER_Y, LEAVE.y, e), hz = lerp(DROP.z, LEAVE.z, e);
            heli.parts.group.position.set(hx, hy, hz);
            heli.parts.group.rotation.y = Math.atan2(LEAVE.x - DROP.x, LEAVE.z - DROP.z);   // hidung ke arah pergi
            heli.parts.group.rotation.z = 0.08 * e;   // sedikit bank saat menanjak
            if (heliSnd) heliSnd.volume = Math.min(1, 0.5 * (1 - e) * getSFXScale());   // deru memudar seiring heli menjauh (ikut slider SFX)
            faceAvatar(hx, hz);                        // player menghadap heli yang menjauh
            if (k >= 1) {
                cine.phase = 'walk'; cine.t = 0;
                stopLoopSFX(heliSnd); heliSnd = null;   // heli sudah jauh -> deru berhenti
            }

        } else if (cine.phase === 'walk') {
            // SCENE 2: character BERJALAN dari titik turun ke PINTU gedung (heli
            // sudah pergi — tak disentuh lagi di sini). Langkah kaki berirama
            // (2026-07-19, permintaan user — SFX cutscene; irama = player.js).
            updateHelicopter(heli, dt);
            const k = Math.min(1, cine.t / (I.walkSec || 2.6));
            const e = smooth(k);
            camera.position.set(lerp(DROP.x, DOOR.x, e), ROOF_Y + eyeH, lerp(DROP.z, DOOR.z, e));
            faceAvatar(DOOR.x, DOOR.z);
            stepT -= dt;
            if (stepT <= 0) { playSFX(sfxFootstep, 0.4); stepT = 0.42; }
            if (k >= 1) { cine.phase = 'enter'; cine.t = 0; }

        } else if (cine.phase === 'enter') {
            // SCENE 2: character MASUK ke dalam pintu (melangkah ke bukaan gelap)
            // — langkah kaki terus berbunyi sampai masuk.
            updateHelicopter(heli, dt);
            const k = Math.min(1, cine.t / (I.enterSec || 0.9));
            camera.position.set(DOOR.x, ROOF_Y + eyeH, lerp(DOOR.z, DOOR.z - 14, k));   // masuk ke -z (dalam pintu)
            faceAvatar(DOOR.x, DOOR.z - 40);
            stepT -= dt;
            if (stepT <= 0) { playSFX(sfxFootstep, 0.4); stepT = 0.42; }
            if (k >= 1) {
                cine.phase = 'wait'; cine.t = 0;
                if (avatarGroup) avatarGroup.visible = false;   // sudah masuk gedung
            }

        } else if (cine.phase === 'wait') {
            // 2 DETIK setelah masuk pintu -> cutscene berakhir -> Stage 1.
            updateHelicopter(heli, dt);
            if (cine.t >= (I.doorDelaySec != null ? I.doorDelaySec : 2)) finishIntro();
        }
    },

    // Hook gameplay = no-op (tak ada dunia gameplay/robot di cutscene)
    playerCollide() { },
    groundHeight: () => ROOF_Y,
    bulletBlocked: () => false,
    grenadeCollide() { },
    robotAI: () => ({ skip: true }),
    clampRobot() { },
    clampDropPos: (x, z) => [x, z],
    hudStatus: () => '',
    radarLandmarks() { },
};

// Override aimPoint (input.js) ke sebuah titik di depan supaya avatar MENGHADAP
// arah tsb (playerAvatar membaca aimPoint utk yaw). Dipanggil tiap frame fase
// avatar tampil (descend/walk/enter).
function faceAvatar(tx, tz) {
    if (aimPoint) aimPoint.set(tx, camera.position.y - eyeH, tz);
}

// Akhiri cutscene -> matikan mode sinematik + bersihkan atap/heli/tali ->
// Stage 1 (enter() memosisikan player di START & menempatkan robot).
function finishIntro() {
    cine = null;
    hideCutsceneSkip();       // tombol skip hilang bersama cutscene (2026-07-19)
    setAvatarRappel(false);   // pastikan pose rappel dilepas
    setCinematicActive(false);
    setCineBars(false);
    setCineFocus(null);
    // Pulihkan latar global (kubah kobaran-api + bara + fog apokaliptik) untuk Stage 1
    if (skyDome) skyDome.visible = true;
    setEmbersVisible(true);
    if (savedFog && scene.fog && scene.fog.color) {
        scene.fog.color.setHex(savedFog.hex); scene.fog.near = savedFog.near; scene.fog.far = savedFog.far;
    }
    savedFog = null;
    if (avatarGroup) avatarGroup.visible = true;
    disposeIntroWorld();
    setScene(stage1Scene, { fresh: true });   // Stage 1 dibangun + player diposisikan
    // SEKARANG tampilkan tutorial "Click to Start the Action" (game mau dimulai):
    // pause + tampilkan blocker/instructions. Pointer belum pernah terkunci selama
    // auto-play → klik = start awal (bukan resume) → gameplay Stage 1 dimulai.
    setPaused(true);
    hidePauseMenu();                          // pastikan #instructions (tutorial), bukan menu jeda
    if (blocker) blocker.style.display = 'flex';
}

// Buang seluruh dunia atap + heli + tali (cutscene sekali-jalan; tak diputar
// ulang saat restart/continue). Reset guard supaya build ulang aman bila suatu
// saat dipanggil lagi.
function disposeIntroWorld() {
    stopLoopSFX(heliSnd); heliSnd = null;   // jaring pengaman (cutscene diakhiri lebih awal)
    if (heli) { disposeHelicopter(heli); heli = null; }
    if (rope) {
        if (rope.material && rope.material.dispose) rope.material.dispose();
        scene.remove(rope); rope = null;
    }
    if (roof) {
        roof.traverse(o => {
            if (o.isMesh && o.material && o.material.dispose) o.material.dispose();
        });
        scene.remove(roof); roof = null;
    }
    introSky = null;   // anak `roof` — sudah ikut di-dispose di traverse
    built = false;
}
