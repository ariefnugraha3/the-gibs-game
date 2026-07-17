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
import { scene, camera, addCamShake, setCineFocus } from '../../core/renderer.js';
import { setScene } from '../../core/sceneManager.js';
import { setCinematicActive, setPaused } from '../../core/state.js';
import { setCineBars, blocker } from '../../core/dom.js';
import { hidePauseMenu } from '../../core/pauseMenu.js';
import { releaseInputs } from '../../core/input.js';
import { aimPoint } from '../../core/input.js';
import { applyLightPreset } from '../../world/lighting.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { PAL } from '../../world/palette.js';
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
const DOOR = at(36, -HALF_Z + 40);                 // pintu di bulkhead (sisi utara -z)
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

let built = false, roof = null;                    // grup dunia atap (dibuang di akhir)
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
    // ~1.9 m radius, tinggi total ~7 m (dulu ~13 m = raksasa) ---
    const tk = at(-110, -96);
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

export const introScene = {
    id: 'campaign-intro',

    // enter() (via setScene di startGame): bangun dunia atap + SEMUA dunia
    // campaign (agar warmup meng-compile shadernya & transisi ke Stage 1 di akhir
    // instan) + lampu malam. Cutscene sendiri dimulai beginIntro() (setelah
    // avatar/senjata ter-init). Posisikan pivot di atap utk frame awal.
    enter() {
        if (!built) { built = true; roof = buildRoof(); }
        ensureCampaignWorlds();
        applyLightPreset(scene, 'night');
        camera.position.set(DROP.x, ROOF_Y + eyeH, DROP.z);
        camera.quaternion.set(0, 0, 0, 1);
    },

    restartScene: () => stage1Scene,   // mati mustahil di cutscene — tetap aman

    // Mesin cutscene (dipanggil updateGame tiap frame selagi TAK paused).
    updateMode(dt) {
        if (!cine) return;
        const I = CFG.campaign.intro;
        cine.t += dt;

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
                cine.phase = 'walk'; cine.t = 0;
                setAvatarRappel(false);   // lepas tali → pose jalan normal
                addCamShake(1.4);          // hentakan pendaratan
            }

        } else if (cine.phase === 'walk') {
            // SCENE 2: character BERJALAN dari titik turun ke PINTU gedung.
            updateHelicopter(heli, dt);
            const k = Math.min(1, cine.t / (I.walkSec || 2.6));
            const e = smooth(k);
            camera.position.set(lerp(DROP.x, DOOR.x, e), ROOF_Y + eyeH, lerp(DROP.z, DOOR.z, e));
            layRope(heli.parts.group.position.y + 2, BELLY_Y - ROOF_Y, 1 - Math.min(1, k * 1.4));   // tali ditarik naik
            hoverHeli(dt);
            faceAvatar(DOOR.x, DOOR.z);
            if (k >= 1) { cine.phase = 'enter'; cine.t = 0; if (rope) rope.visible = false; }

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
    built = false;
}
