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

import { CFG, CAMP_M } from '../../core/config.js';
import { scene, camera, viewCam, renderer, composer, postFxOn, addCamShake, setCineFocus, followViewCam } from '../../core/renderer.js';
import { setScene } from '../../core/sceneManager.js';
import { setCinematicActive, setPaused } from '../../core/state.js';
import { setCineBars, blocker } from '../../core/dom.js';
import { hidePauseMenu } from '../../core/pauseMenu.js';
import { releaseInputs } from '../../core/input.js';
import { aimPoint } from '../../core/input.js';
import { applyLightPreset } from '../../world/lighting.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { PAL } from '../../world/palette.js';
import { makeFacadeTex, makeLitTex, makeCityMat, fillBuildingInstances, CITY_PALETTE } from '../../world/facades.js';
import { setEmbersVisible } from '../../world/sky.js';
import { skyDome } from '../../world/decor.js';
import { spawnHelicopter, updateHelicopter, disposeHelicopter } from '../../entities/helicopter.js';
import { avatarGroup, setAvatarRappel } from '../../entities/playerAvatar.js';
import { stage1Scene, ensureWorld as ensureCampaignWorlds } from './stage1.js';

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
const HOVER_Y = 128;                               // ketinggian heli menggantung
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

// ===== Bangun KOTA di bawah/keliling atap (2026-07-18, permintaan user: latar
// jadi GEDUNG-GEDUNG & JALAN seperti foto udara kota, BUKAN kobaran api). Semua
// masuk grup `parent` (= roof) supaya ikut dibuang di akhir. Efisien & mudah
// dipanaskan: gedung = SATU InstancedMesh (facades.js), jalan/sungai = plane. =====
// Bundaran + air mancur khas Jakarta (Bundaran HI) — dipakai buildCity.
const RB = { x: IX, z: IZ + 470 };   // pusat bundaran (selatan hero)
const RB_R = 220;                    // radius luar (utk sisihkan gedung/pohon)

function buildCity(parent) {
    // --- Jalanan: aspal + JALAN RAYA LEBAR (Jakarta: avenue lebar, blok besar) ---
    const streetTex = makeTexture(256, 256, (c, w, h) => {
        c.fillStyle = '#1a1c22'; c.fillRect(0, 0, w, h);
        speckle(c, w, h, ['#141620', '#20232b', '#101218', '#242832'], 190, 1, 4);
        c.strokeStyle = 'rgba(170,174,186,0.14)'; c.lineWidth = 8;   // jalan tepi blok (lebar)
        c.strokeRect(3, 3, w - 6, h - 6);
        c.strokeStyle = 'rgba(210,200,150,0.10)'; c.lineWidth = 2;   // marka pudar
        c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    }, 30, 30);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5400, 5400),
        new THREE.MeshLambertMaterial({ map: streetTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(IX, CITY_GROUND, IZ);
    ground.receiveShadow = true;
    parent.add(ground);

    // --- Kanal/sungai di sisi UTARA (jauh -z) ---
    const river = new THREE.Mesh(new THREE.PlaneGeometry(5400, 900),
        new THREE.MeshLambertMaterial({ color: 0x33424a }));
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

    // --- BUNDARAN + AIR MANCUR (Bundaran HI/"Selamat Datang") di SELATAN hero ---
    buildRoundabout(parent);

    // --- Taman/ruang hijau tersebar (Jakarta banyak ruang terbuka hijau) ---
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x2c4a24 });
    const park = (px, pz, r) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 22), grassMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(IX + px, CITY_GROUND + 0.6, IZ + pz);
        m.receiveShadow = true; parent.add(m);
    };
    park(-760, 280, 155); park(660, -540, 130); park(-400, -880, 120); park(900, 600, 165); park(220, 1180, 140);

    // --- Gedung sekeliling: LEBIH RENGGANG & BERVARIASI (Jakarta: blok besar
    //     berjauhan, jalan lebar — TIDAK serapat Manhattan). Cell besar +
    //     penempatan probabilistik + footprint bervariasi (mal/hotel lebar &
    //     menara ramping) + sedikit rotasi (grid tak kaku). Mayoritas lebih
    //     PENDEK dari deck; menara pencakar langka menembus. ---
    const list = [];
    const CELL = 128;
    for (let gx = -1980; gx <= 1980; gx += CELL) {
        for (let gz = -1150; gz <= 1980; gz += CELL) {
            if (Math.abs(gx) < HALF_X + 120 && Math.abs(gz) < HALF_Z + 120) continue;   // sisakan hero
            if (Math.hypot(gx, gz - (RB.z - IZ)) < RB_R + 40) continue;                 // sisakan bundaran
            if (Math.random() < 0.42) continue;                                          // ~58% lot = kosong/hijau (renggang)
            const dist = Math.hypot(gx, gz);
            const jx = (Math.random() - 0.5) * 40, jz = (Math.random() - 0.5) * 40;
            const wide = Math.random() < 0.35;   // blok LEBAR (mal/hotel) vs menara ramping
            const w = wide ? 70 + Math.random() * 36 : 32 + Math.random() * 26;
            const d = wide ? 70 + Math.random() * 36 : 32 + Math.random() * 26;
            let h;
            if (Math.random() < 0.08 && dist > 500) h = 500 + Math.random() * 190;   // pencakar (top 0..+190)
            else if (wide) h = 90 + Math.random() * 130;                              // blok lebar rendah
            else h = 130 + Math.random() * (120 + 240 * Math.min(1, dist / 1500));    // top di bawah deck
            list.push({ x: IX + gx + jx, z: IZ + gz + jz, w, d, h, ry: (Math.random() - 0.5) * 0.3, rz: 0, color: CITY_PALETTE[(Math.random() * CITY_PALETTE.length) | 0] });
        }
    }
    // fillBuildingInstances menaruh box dari y=0; bungkus grup digeser ke jalanan.
    const cityG = new THREE.Group();
    cityG.position.y = CITY_GROUND;
    parent.add(cityG);
    fillBuildingInstances(cityG, list, makeCityMat(facadeTex, litTex));

    // --- Pepohonan (InstancedMesh kerucut hijau) tersebar di lot kosong/tepi jalan ---
    buildTrees(parent);
}

// Bundaran ikonik Jakarta: jalan ring aspal, rumput, kolam air mancur, monumen
// tengah (pedestal + tiang + dua figur "Selamat Datang" abstrak). Semua di
// CITY_GROUND (jauh di bawah deck) — sekadar landmark latar yang terlihat dari atap.
function buildRoundabout(parent) {
    const y = CITY_GROUND;
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x23262c });
    const grass = new THREE.MeshLambertMaterial({ color: 0x2f5227 });
    const water = new THREE.MeshLambertMaterial({ color: 0x2f5a66, emissive: 0x0e2b31, emissiveIntensity: 0.25 });
    const stone = new THREE.MeshLambertMaterial({ color: 0x8f8b80 });
    const monu = new THREE.MeshLambertMaterial({ color: 0xb7a98a, emissive: 0x2a2214, emissiveIntensity: 0.2 });
    const flat = (geo, mat, dy) => {
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2; m.position.set(RB.x, y + dy, RB.z);
        m.receiveShadow = true; parent.add(m);
    };
    flat(new THREE.RingGeometry(120, 210, 44), asphalt, 0.5);   // jalan ring
    flat(new THREE.CircleGeometry(118, 36), grass, 0.7);         // rumput dalam
    flat(new THREE.CircleGeometry(84, 36), water, 0.9);          // kolam air mancur
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 10, 16), stone);
    ped.position.set(RB.x, y + 5, RB.z); ped.castShadow = true; parent.add(ped);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 30, 10), monu);
    spire.position.set(RB.x, y + 25, RB.z); spire.castShadow = true; parent.add(spire);
    for (const s of [-1, 1]) {   // dua figur "Selamat Datang" (abstrak)
        const fig = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 1.4), monu);
        fig.position.set(RB.x + s * 3, y + 46, RB.z); parent.add(fig);
    }
}

// Pepohonan latar (Jakarta hijau): SATU InstancedMesh kerucut hijau tersebar di
// area kota (hindari hero + pusat bundaran + sungai). Satu draw call = ringan &
// mudah dipanaskan warmupIntro. Base menapak di CITY_GROUND.
function buildTrees(parent) {
    const N = 240;
    const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
        new THREE.MeshLambertMaterial({ color: 0x27431f }), N);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
        let dx = 0, dz = 0;
        for (let t = 0; t < 6; t++) {
            dx = (Math.random() - 0.5) * 3800; dz = -1120 + Math.random() * 3080;
            if (Math.abs(dx) < HALF_X + 120 && Math.abs(dz) < HALF_Z + 120) continue;   // bukan hero
            if (Math.hypot(dx, dz - (RB.z - IZ)) < 130) continue;                        // bukan tengah bundaran
            break;
        }
        const sc = 8 + Math.random() * 11;
        _m.compose(_p.set(IX + dx, CITY_GROUND + sc / 2, IZ + dz), _q, _s.set(sc * 0.7, sc, sc * 0.7));
        inst.setMatrixAt(i, _m);
    }
    if (inst.instanceMatrix) inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    parent.add(inst);
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
    cine = { phase: 'fly', t: 0, bob: 0 };
}

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
            faceAvatar(hx, hz);                        // player menghadap heli yang menjauh
            if (k >= 1) { cine.phase = 'walk'; cine.t = 0; }

        } else if (cine.phase === 'walk') {
            // SCENE 2: character BERJALAN dari titik turun ke PINTU gedung (heli
            // sudah pergi — tak disentuh lagi di sini).
            updateHelicopter(heli, dt);
            const k = Math.min(1, cine.t / (I.walkSec || 2.6));
            const e = smooth(k);
            camera.position.set(lerp(DROP.x, DOOR.x, e), ROOF_Y + eyeH, lerp(DROP.z, DOOR.z, e));
            faceAvatar(DOOR.x, DOOR.z);
            if (k >= 1) { cine.phase = 'enter'; cine.t = 0; }

        } else if (cine.phase === 'enter') {
            // SCENE 2: character MASUK ke dalam pintu (melangkah ke bukaan gelap).
            updateHelicopter(heli, dt);
            const k = Math.min(1, cine.t / (I.enterSec || 0.9));
            camera.position.set(DOOR.x, ROOF_Y + eyeH, lerp(DOOR.z, DOOR.z - 14, k));   // masuk ke -z (dalam pintu)
            faceAvatar(DOOR.x, DOOR.z - 40);
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
