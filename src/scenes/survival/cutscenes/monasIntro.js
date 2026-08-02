// CUTSCENE: PEMBUKA SURVIVAL — "THE LAST STAND AT MONAS" (2026-07-27, permintaan
// user). Cutscene survival LAMA berupa SLIDESHOW DOM 4 slide (emoji 🏃🤖 di
// `#cutscene` index.html + `initCutscene()` menu.js — KEDUANYA DIHAPUS) diganti
// adegan SINEMATIK 3D di dalam engine, sekelas intro campaign (campaign/cutscenes/
// intro.js) & cutscene tank-boss.
//
// KONTRAK NARASI — empat pesan cerita slideshow lama yang TIDAK BOLEH hilang apa
// pun perubahannya (dijaga assert "SURV INTRO NARASI 1-4" di tools/smoke.mjs):
//   (1) Jakarta jatuh — seorang WARGA BERLARI dikejar robot liar,
//   (2) ia TAK SENDIRI: SATU PASUKAN robot ikut masuk (melompati pagar taman),
//   (3) ia berlari ke MONAS — tempat berlindung terakhir,
//   (4) di depan pasukan itu ia BERHENTI & BERBALIK menghadapinya ("I WILL FIGHT").
//
// PAPAN SHOT (9 shot; durasi tiap shot dari CFG.survival.intro):
//   1 city     TAMAN — kamera tinggi MENGHADAP Monas: monumen + seluruh taman,
//              player sebutir yang berlari masuk (skala pertahanan terakhir)
//   2 flee     TRACKING SAMPING rendah: ia BERLARI, debu terhambur, pengejar di belakang
//   3 pursuit  REVERSE ANGLE dari depan: mata merah pengejar makin dekat
//   4 horde    CUT ke pagar: SATU PASUKAN melompati pagar (gelombang lompatan)
//              lalu MELANGKAH masuk berbaris — tanah bergetar (camShake + langkah)
//   5 refuge   CUT balik ke player dari BELAKANG: Monas menjulang di depannya
//   6 arrive   ia melambat & BERHENTI di pelataran Monas — debu mengendap
//   7 turn     kamera MENGORBIT dia sambil ia BERBALIK menghadapi pasukan
//   8 stand    HERO ANGLE rendah: "I WILL FIGHT" — barisan robot berhenti, mata
//              menyala, kamera mendorong masuk
//   9 settle   kamera MENARIK MUNDUR ke sudut GAMEPLAY (CAM_OFF_DEFAULT) + kabut
//              kembali ke preset taman -> serah-terima ke Wave 1 tanpa "jentikan"
//              sudut kamera saat layar tutorial muncul
//
// MEKANIK (sama seperti intro campaign): scene NON-GAMEPLAY, semua hook gameplay
// no-op; `state.cinematicActive` membekukan kendali player & input (kecuali Esc)
// sementara `updateGame` TETAP memanggil `updateMode` (mesin cutscene di sini).
// Mesin BERBASIS TIMER (deterministik, headless-testable).
//   * `camera` = PIVOT LOGIKA player: menggerakkan `camera.position` = menggerakkan
//     avatar (playerAvatar menaruh avatar di pivot tiap frame). Player "berlari"
//     dengan menggeser pivot sepanjang polyline `RUN_PATH`; siklus langkah avatar
//     terpicu KECEPATAN pivot, jadi cukup menggesernya cukup cepat.
//   * SUDUT kamera per shot lewat hook `activeScene.camOffset` (dibaca renderer
//     tiap frame) — objek `camOff` yang sama dimutasi `setShotCam`/`shotCam`.
//   * CUT antar shot (shot 4 & 5) lewat `setCineFocus(x, z, snap=true)`: titik
//     fokus kamera dipindah SEKETIKA (bukan pan) — itulah "potongan" film.
// Dunia = TAMAN MONAS survival yang sebenarnya (`ensureParkWorld`), jadi frame
// terakhir cutscene = frame pertama gameplay (player berhenti TEPAT di titik
// spawn survival) dan tak ada dunia tambahan yang perlu dibangun/dibuang.

import { CFG } from '../../../core/config.js';
import { dialogueMap } from '../../../core/dialogue.js';
import {
    scene, camera, viewCam, renderer, composer, postFxOn,
    addCamShake, setCineFocus, followViewCam, CAM_OFF_DEFAULT
} from '../../../core/renderer.js';
import { setScene } from '../../../core/sceneManager.js';
import { setCinematicActive, setPaused } from '../../../core/state.js';
import { setCineBars, blocker, showCutsceneSkip, hideCutsceneSkip, showCineCaption, hideCineCaption } from '../../../core/dom.js';
import { hidePauseMenu } from '../../../core/pauseMenu.js';
import { releaseInputs, aimPoint } from '../../../core/input.js';
import { applyLightPreset, LIGHT_PRESETS } from '../../../world/lighting.js';
import { clamp, rand } from '../../../utils/math.js';
import { spawnGroundPuff } from '../../../entities/effects.js';
import { buildRobotMesh, animateRobotRig, disposeRobot } from '../../../entities/robots.js';
import { avatarGroup } from '../../../entities/playerAvatar.js';
import {
    playSFX, sfxFootstep, sfxRobotStep, sfxSwitch, sfxRobotSpawn,
    startBattleMusic, stopMusic, duckMusic
} from '../../../utils/sfx.js';
import { PARK, FENCE_H, ensureParkWorld, resolveObstacles } from '../world.js';
import { survivalScene } from '../index.js';

// ===== PANGGUNG (koordinat dunia taman: x ±620, z ±340, Monas di origin) =====
// Player berlari masuk menyusuri JALAN SILANG (diagonal taman) dari sudut jauh
// ke pelataran Monas. Diagonal dipilih bukan cuma karena jalannya memang ada:
// `createParkProps` (world.js) MENOLAK menanam pohon dalam pita 30 unit di kedua
// sisi diagonal DAN di dalam kotak pelataran |x|,|z| < 120 — jadi lintasan ini
// DIJAMIN bebas pohon walau pohonnya ditanam acak tiap build (diuji smoke).
// Orientasi dunia (konvensi lama, lihat CLAUDE.md): +x = TIMUR, -x = BARAT,
// +z = SELATAN, -z = UTARA; kamera gameplay duduk di barat-daya (azimut 315).
const PLAZA = { x: 0, z: 120 };          // titik henti = TITIK SPAWN gameplay survival
// Fokus SHOT 1: titik di antara Monas & titik masuk player, BUKAN player — supaya
// satu frame memuat Monas (menjulang di sepertiga atas) DAN player (sebutir di
// bawah). Kalau shot pembuka memfokus player seperti shot lain, arah pandang
// kameranya justru MEMBELAKANGI Monas dan monumen yang mau dipertahankan tak
// pernah terlihat di shot pembuka.
const CITY_FOCUS = { x: 260, z: 143 };
// Fokus SHOT 4 (cutaway pagar): pusat blok pendaratan pasukan.
const HORDE_FOCUS = { x: 520, z: 285 };
const RUN_PATH = [
    { x: 520, z: 285 },                  // masuk dari sudut jauh (tepat di garis diagonal)
    { x: 300, z: 164 },
    { x: 150, z: 82 },
    { x: 70, z: 104 },                   // membelok mengitari dasar Monas
    PLAZA,
];
// Panjang kumulatif polyline (matematika murni — aman di top level, tanpa CFG).
const SEG = [];
let PATH_LEN = 0;
for (let i = 1; i < RUN_PATH.length; i++) {
    const d = Math.hypot(RUN_PATH[i].x - RUN_PATH[i - 1].x, RUN_PATH[i].z - RUN_PATH[i - 1].z);
    SEG.push(d); PATH_LEN += d;
}
// Arah masuk (dipakai staging pasukan): dari titik masuk menuju Monas.
const MARCH = (() => {
    const dx = RUN_PATH[2].x - RUN_PATH[0].x, dz = RUN_PATH[2].z - RUN_PATH[0].z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
})();
const SIDE = { x: -MARCH.z, z: MARCH.x };   // tegak lurus arah barisan

// Titik pada polyline di progres u (0..1). u < 0 diekstrapolasi ke BELAKANG garis
// pertama supaya pengejar bisa berada di belakang player pada frame pertama.
function runAt(u) {
    let d = u * PATH_LEN;
    if (d <= 0) return { x: RUN_PATH[0].x + MARCH.x * d, z: RUN_PATH[0].z + MARCH.z * d };
    for (let i = 0; i < SEG.length; i++) {
        if (d <= SEG[i] || i === SEG.length - 1) {
            const k = Math.min(1, d / SEG[i]);
            const a = RUN_PATH[i], b = RUN_PATH[i + 1];
            return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
        }
        d -= SEG[i];
    }
    return { ...PLAZA };
}

// PROGRES LINTASAN PER SHOT (angka SINEMATIK, bukan tuning gameplay — karena itu
// di kode, bukan config): tiap shot menghabiskan potongan lintasannya sendiri
// sehingga laju lari bisa DIATUR per shot. Shot rapat (flee/pursuit/refuge) dapat
// potongan besar = langkah benar-benar terbaca sebagai BERLARI; shot yang sangat
// lebar (city) & shot CUTAWAY (horde, player di luar frame) dapat potongan kecil.
const RUN_U = {
    city: [0.00, 0.16],
    flee: [0.16, 0.50],
    pursuit: [0.50, 0.70],
    horde: [0.70, 0.76],   // player di luar frame — lajunya tak terbaca
    refuge: [0.76, 0.97],
    arrive: [0.97, 1.00],   // melambat (easeOut) lalu BERHENTI di PLAZA
};

// Kelompok pengejar: 4 robot yang sudah di dalam taman, mengejar di belakang
// player sepanjang lintasan yang sama (lag = fraksi lintasan ≈ 43-101 unit; saat
// player berhenti mereka ikut berhenti di jarak itu = garis depan yang terbaca).
const CHASE_LAG = [0.075, 0.105, 0.14, 0.175];
const CHASE_OFF = [-14, 12, -20, 18];     // geser menyamping supaya tak sebaris

// ===== SINEMATOGRAFI =====
// Ofset kamera per shot dinyatakan sebagai (azimut°, jarak mendatar, tinggi,
// fogNear, fogFar) — azimut = arah KAMERA BERADA dari titik fokus (default
// gameplay 315°, jarak 100, tinggi 116). Arah lari player ≈ azimut 241°, jadi:
// 241 = kamera DI DEPAN-nya (melihat wajah + pengejar di belakangnya), 61 = DI
// BELAKANG-nya (melihat ke arah tujuan = Monas), 331 = samping (tracking).
const camOff = { x: -70.7, y: 116, z: 70.7 };   // objek MUTABLE yang dibaca renderer
function setShotCam(azDeg, dist, height, fogNear, fogFar) {
    const a = azDeg * Math.PI / 180;
    camOff.x = Math.sin(a) * dist;
    camOff.z = Math.cos(a) * dist;
    camOff.y = height;
    // Kabut per-shot = uniform belaka, jadi menganimasikannya GRATIS: shot lebar
    // butuh kabut longgar (kota di horizon terbaca), shot rendah butuh kabut
    // tebal (pinggiran arena larut jadi haze). Dipulihkan `applyLightPreset` di finish.
    if (fogNear != null && scene && scene.fog) { scene.fog.near = fogNear; scene.fog.far = fogFar; }
}
function shotCam(A, B, k) {
    setShotCam(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k),
        lerp(A[3], B[3], k), lerp(A[4], B[4], k));
}
const SHOT = {
    //          azimut jarak tinggi fogNear fogFar
    // Shot pembuka: jarak & tinggi DIHITUNG, bukan dikira-kira. Pada sudut tunduk
    // curam tapak-pandang TIDAK simetris terhadap titik fokus (tepi dekat jauh
    // lebih rapat dari tepi jauh), jadi versi pertama shot ini justru membuang
    // player ke luar tepi bawah frame. Dgn tinggi 620 / jarak 700 (tunduk ~41°)
    // tapaknya membentang ~[-340, +760] di sekitar fokus, sementara Monas & titik
    // masuk player masing-masing 293 unit di kedua sisi fokus -> KEDUANYA masuk
    // frame dgn margin (dijaga assert `SURV INTRO SHOT 1 FRAMING` di smoke).
    cityA: [70, 700, 620, 700, 2600],   // nyaris dari atas MENGHADAP Monas: taman + monumen
    cityB: [80, 665, 585, 640, 2500],   // hanyut halus (kamera tak pernah benar-benar diam)
    fleeA: [331, 150, 74, 200, 1700],   // crane TURUN ke samping player
    fleeB: [318, 118, 46, 170, 1500],   // makin rapat & rendah — laju terasa
    pursuit: [241, 112, 40, 170, 1450],   // dari DEPAN: pengejar mengisi latar
    hordeA: [225, 235, 78, 220, 1800],   // CUT: pasukan melompati pagar (lebar)
    hordeB: [258, 180, 40, 190, 1600],   // menyapu barisan yang melangkah masuk
    refugeA: [61, 150, 80, 200, 1650],   // CUT: dari belakang player, Monas di depan
    refugeB: [55, 108, 44, 170, 1500],   // merapat — Monas menjulang
    arrive: [250, 88, 34, 160, 1400],   // memutar ke depan saat ia berhenti
    turnEnd: [200, 96, 30, 160, 1400],   // akhir ORBIT — pasukan terbuka di belakangnya
    stand: [241, 68, 22, 150, 1350],   // HERO ANGLE rendah: "I WILL FIGHT"
    standIn: [241, 54, 18, 140, 1250],   // dorongan terakhir
};

const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIn = (k) => k * k;
const smooth = (k) => k * k * (3 - 2 * k);

// ===== TEKS NARASI (WAJIB English — aturan permanen user). Empat pesan cerita
// slideshow lama, dipecah jadi enam takarir sinematik yang muncul di atas pita
// letterbox bawah (dom.showCineCaption). =====
const CAP = dialogueMap('survival.monasIntro.captions');

let cine = null;          // {phase, t, live, ...} — null = cutscene tak aktif
let chasers = [];         // robot pengejar (aktor cutscene, BUKAN entitas gameplay)
let army = [];            // pasukan yang melompati pagar
let eyeH = 11.4;
let stepT = 0, marchT = 0;

// Debug/uji: status cutscene
export const survIntroDebug = () => ({
    phase: cine ? cine.phase : null, active: !!cine,
    u: cine ? cine.u : 0,
    heroX: camera ? camera.position.x : null,
    heroZ: camera ? camera.position.z : null,
    chasers: chasers.length, army: army.length,
    chasePos: chasers.map(a => ({ x: a.mesh.position.x, z: a.mesh.position.z })),
    armyVaulting: army.filter(a => a.state === 'jumping').length,
    armyInside: army.filter(a => a.state !== 'waiting' && insidePark(a.mesh.position)).length,
    armyMarching: army.filter(a => a.moving).length,
    caption: cine ? cine.caption : null,
    plaza: { ...PLAZA }, start: { ...RUN_PATH[0] }, pathLen: PATH_LEN,
});
// Metrik panggung utk smoke (staging pasukan & lintasan lari).
export const survIntroMetrics = () => ({
    path: RUN_PATH.map(p => ({ ...p })), pathLen: PATH_LEN,
    march: { ...MARCH }, runU: RUN_U,
    spawns: army.map(a => ({ ...a.spawn })), lands: army.map(a => ({ ...a.land })),
    captions: [CAP.city, CAP.flee, CAP.horde, CAP.refuge, CAP.turn, CAP.stand],
});
const insidePark = (p) => Math.abs(p.x) < PARK.hx && Math.abs(p.z) < PARK.hz;

// ===== AKTOR ROBOT CUTSCENE =====
// Sengaja BUKAN entitas `robots` gameplay: tak ber-HP, tak menyerang, tak memberi
// skor, tak tersentuh updateRobots — jadi cutscene 100% deterministik dan tak bisa
// mengganggu hitungan wave. Rig-nya tetap dianimasikan `animateRobotRig` (fungsi
// yang sama dengan robot gameplay), jadi jalan/lompatnya identik.
// Dibangun di `enter()` = MASIH di balik layar loading -> tanpa hitch di tengah adegan.
function makeActor(cls, x, z) {
    const built = buildRobotMesh(cls);
    const scl = CFG.robot.classes[cls].scale;
    const g = built.group;
    if (scl !== 1) g.scale.setScalar(scl);
    g.position.set(x, 0, z);
    scene.add(g);
    return {
        mesh: g, rig: built.rig, kind: cls, scl,
        // Field yang dibaca animateRobotRig (harus lengkap: `phase`/`speed` dipakai
        // siklus jalan; windT/clawT sengaja kosong = tak pernah menyerang).
        phase: Math.random() * 6.28, speed: 0.6, moving: true, state: 'chasing',
        ranged: cls !== 'C', aiming: false, fireCd: 9, clawSide: 1,
        spawn: { x, z }, land: { x, z },
    };
}

function faceActor(a, tx, tz) {
    a.mesh.lookAt(tx, a.mesh.position.y, tz);
}

// Bangun panggung robot: pengejar (sudah di dalam taman, di belakang player) +
// PASUKAN yang menunggu DI LUAR pagar untuk melompat masuk di shot 4.
function buildCast() {
    const S = CFG.survival.intro || {};
    const n = Math.max(6, Math.floor(S.hordeCount || 28));
    const COLS = 7, GAPC = 26, GAPR = 34;
    // Titik MENDARAT barisan depan: di garis diagonal, di dalam pagar.
    const L0 = { x: 500, z: 274 };
    for (let i = 0; i < n; i++) {
        const r = Math.floor(i / COLS), c = i % COLS;
        const off = (c - (COLS - 1) / 2) * GAPC;
        // Mendarat: barisan ke-r makin ke belakang (ke arah pagar); dijepit ke
        // dalam pagar (sudut taman sempit -> barisan jadi sedikit tak beraturan,
        // dan itu justru terlihat organik).
        const land = {
            x: clamp(L0.x - MARCH.x * (r * GAPR) + SIDE.x * off, -PARK.hx + 26, PARK.hx - 26),
            z: clamp(L0.z - MARCH.z * (r * GAPR) + SIDE.z * off, -PARK.hz + 26, PARK.hz - 26),
        };
        // Menunggu DI LUAR pagar, 150 unit di belakang titik mendaratnya.
        const spawn = { x: land.x - MARCH.x * 150, z: land.z - MARCH.z * 150 };
        const a = makeActor(i % 9 === 4 ? 'B' : 'C', spawn.x, spawn.z);
        a.spawn = spawn; a.land = land;
        a.state = 'waiting'; a.moving = false;
        a.rank = r; a.col = c;
        a.delay = 0.05 + i * 0.055 + Math.random() * 0.05;   // gelombang lompatan
        a.jumpDur = 1.0 + Math.random() * 0.15;
        a.jt = 0;
        // Jarak henti: barisan depan paling dekat player, barisan belakang di
        // belakangnya -> tembok robot yang rapi, tak menumpuk di satu titik.
        a.stopD = 205 + r * 40 + Math.abs(off) * 0.12;
        faceActor(a, land.x + MARCH.x * 10, land.z + MARCH.z * 10);
        army.push(a);
    }
    for (let i = 0; i < CHASE_LAG.length; i++) {
        const p = runAt(-CHASE_LAG[i]);
        const a = makeActor('C', p.x + SIDE.x * CHASE_OFF[i], p.z + SIDE.z * CHASE_OFF[i]);
        a.lag = CHASE_LAG[i]; a.side = CHASE_OFF[i];
        a.speed = 0.85;
        chasers.push(a);
    }
}

function disposeCast() {
    for (const a of army.concat(chasers)) { disposeRobot(a); scene.remove(a.mesh); }
    army = []; chasers = [];
}

// ===== Mulai cutscene (dipanggil main.js SETELAH avatar/senjata di-init) =====
// AUTO-PLAY seperti intro campaign: TANPA layar tutorial lebih dulu (unpause +
// blocker disembunyikan); tutorial baru muncul di akhir, saat Wave 1 mau dimulai.
export function beginSurvivalIntro() {
    eyeH = CFG.player.eyeHeight;
    releaseInputs();
    setCinematicActive(true);
    setCineBars(true);
    setCineFocus(null);
    setPaused(false);
    if (blocker) blocker.style.display = 'none';
    if (avatarGroup) avatarGroup.visible = true;
    // Player di titik masuk taman, sudah berlari.
    const p0 = runAt(0);
    camera.position.set(p0.x, eyeH, p0.z);
    camera.quaternion.set(0, 0, 0, 1);
    setShotCam(...SHOT.cityA);
    cutTo(CITY_FOCUS.x, CITY_FOCUS.z);   // shot pembuka memandang Monas, bukan membuntuti player
    // `live:false`: beginSurvivalIntro dipanggil main.js MASIH di balik layar
    // loading, jadi tombol SKIP + suara baru dinyalakan pada frame PERTAMA
    // updateMode (bug fix yang sama dengan intro campaign 2026-07-20).
    cine = { phase: 'city', t: 0, u: 0, live: false, caption: null, turnK: 0 };
    stepT = 0.1; marchT = 0;
}

// SKIP (tombol kanan-bawah / SPACE): finish aman dipanggil dari fase mana pun.
export function skipSurvivalIntro() { if (cine) finishSurvivalIntro(); }

// ===== PEMANASAN: dipanggil main.js SETELAH warmupAll, MASIH di balik layar
// loading — render taman dari SEMUA sudut kamera cutscene supaya buffer/tekstur
// (kota latar, Monas, pagar, robot pasukan) sudah terunggah ke GPU sebelum adegan
// berjalan. Kamera & ofset dipulihkan persis. =====
export function warmupSurvivalIntro() {
    if (!camera || !viewCam) return;
    const render = () => { if (composer && postFxOn) composer.render(); else renderer.render(scene, viewCam); };
    const sx = camera.position.x, sy = camera.position.y, sz = camera.position.z;
    const ox = camOff.x, oy = camOff.y, oz = camOff.z;
    const views = [
        [SHOT.cityA, runAt(0)],          // shot lebar dari atas (seluruh taman + kota)
        [SHOT.fleeB, runAt(0.35)],       // tracking rapat
        [SHOT.hordeA, HORDE_FOCUS],      // pagar + pasukan
        [SHOT.refugeB, runAt(0.9)],      // Monas dari belakang player
        [SHOT.stand, PLAZA],             // hero angle di pelataran
    ];
    for (const [s, p] of views) {
        setShotCam(...s);
        camera.position.set(p.x, eyeH, p.z);
        // Fokus di-SNAP ke titik view: `beginSurvivalIntro` sudah mengunci fokus
        // sinematik di CITY_FOCUS, jadi tanpa snap KELIMA render ini memandang
        // titik yang sama & pemanasan tak menyentuh bagian taman yang lain.
        setCineFocus(p.x, p.z, true);
        followViewCam();
        render();
    }
    camOff.x = ox; camOff.y = oy; camOff.z = oz;
    camera.position.set(sx, sy, sz);
    // Pulihkan keadaan fokus sinematik shot pembuka (atau lepas bila dipanggil
    // di luar cutscene, mis. dari test).
    if (cine) cutTo(CITY_FOCUS.x, CITY_FOCUS.z); else setCineFocus(null);
    followViewCam();
}

// Titik fokus kamera DIPINDAH SEKETIKA (potongan/CUT film) lalu dikunci di sana.
const cutTo = (x, z) => setCineFocus(x, z, true);

// Hadapkan AVATAR player ke sebuah titik: playerAvatar membaca `aimPoint` untuk
// yaw badan, jadi meng-override-nya = menyetir arah hadap avatar.
function faceHero(tx, tz) {
    if (aimPoint) aimPoint.set(tx, camera.position.y - eyeH, tz);
}

// Geser player ke progres lintasan u + efek langkah (debu + suara) saat berlari.
function moveHero(u, dt, running) {
    const p = runAt(u);
    const dx = p.x - camera.position.x, dz = p.z - camera.position.z;
    camera.position.set(p.x, eyeH, p.z);
    cine.u = u;
    // Menghadap ARAH GERAK selagi berlari (saat berhenti, pemanggil yang mengatur).
    if (running && (dx * dx + dz * dz) > 0.01) faceHero(p.x + dx * 40, p.z + dz * 40);
    if (!running) return;
    stepT -= dt;
    if (stepT <= 0) {
        stepT = 0.27;
        playSFX(sfxFootstep, 0.5);
        spawnGroundPuff(p.x + rand(-3, 3), p.z + rand(-3, 3), 0x8a7a5e, 3.2, 0.6);
    }
}

// Pengejar mengikuti lintasan yang sama di belakang player (lag tetap). Begitu
// player berhenti (u tak bertambah lagi) mereka OTOMATIS ikut berhenti di jarak
// lag-nya dan berbalik menghadap dia — `moving` diturunkan dari perpindahan
// nyata frame ini, jadi rig-nya beralih sendiri ke pose berdiri.
function updateChasers(dt) {
    for (const a of chasers) {
        const p = runAt(cine.u - a.lag);
        const nx = clamp(p.x + SIDE.x * a.side, -PARK.hx + 18, PARK.hx - 18);
        const nz = clamp(p.z + SIDE.z * a.side, -PARK.hz + 18, PARK.hz - 18);
        const dx = nx - a.mesh.position.x, dz = nz - a.mesh.position.z;
        a.moving = (dx * dx + dz * dz) > 0.02;
        a.mesh.position.set(nx, 0, nz);
        resolveObstacles(a.mesh.position, 3.5, 0);
        if (a.moving) faceActor(a, nx + dx * 40, nz + dz * 40);
        else faceActor(a, PLAZA.x, PLAZA.z);   // player berhenti -> menatap dia
        animateRobotRig(a, dt);
    }
}

// Pasukan: menunggu -> MELOMPATI PAGAR (busur lompat yang sama dengan spawner
// gameplay) -> MELANGKAH masuk berbaris sampai jarak henti masing-masing.
function updateArmy(dt, step, active) {
    const S = CFG.survival.intro || {};
    const spd = S.hordeSpeed || 0.6;
    let anyMarching = false;
    for (const a of army) {
        if (a.state === 'waiting') {
            if (!active) { animateRobotRig(a, dt); continue; }
            a.delay -= dt;
            if (a.delay <= 0) {
                a.state = 'jumping'; a.jt = 0;
                // Bunyi lompatan hanya tiap robot ke-3: 28 klip berturut-turut akan
                // saling memotong di pool playSFX (8 node) & terdengar seperti derau.
                if (a.rank % 2 === 0 && a.col % 3 === 0) playSFX(sfxRobotSpawn, 0.32);
            }
            animateRobotRig(a, dt);
            continue;
        }
        if (a.state === 'jumping') {
            a.jt += dt / a.jumpDur;
            const t = Math.min(1, a.jt);
            a.mesh.position.set(
                a.spawn.x + (a.land.x - a.spawn.x) * t, 0,
                a.spawn.z + (a.land.z - a.spawn.z) * t);
            a.mesh.position.y = Math.sin(Math.PI * t) * (FENCE_H + 16);
            faceActor(a, a.land.x + MARCH.x * 10, a.land.z + MARCH.z * 10);
            if (t >= 1) {
                a.state = 'chasing'; a.mesh.position.y = 0;
                spawnGroundPuff(a.mesh.position.x, a.mesh.position.z, 0x8a7a5e, 13, 0.6);
                addCamShake(0.7);
            }
            animateRobotRig(a, dt);
            continue;
        }
        // MELANGKAH masuk: maju sepanjang arah barisan sampai jarak henti.
        const d = Math.hypot(a.mesh.position.x - PLAZA.x, a.mesh.position.z - PLAZA.z);
        a.moving = d > a.stopD;
        if (a.moving) {
            a.mesh.position.x += MARCH.x * spd * step;
            a.mesh.position.z += MARCH.z * spd * step;
            resolveObstacles(a.mesh.position, 3.5, 0);   // menyusur pohon/bak, tak menembus
            faceActor(a, a.mesh.position.x + MARCH.x * 10, a.mesh.position.z + MARCH.z * 10);
            anyMarching = true;
        } else faceActor(a, PLAZA.x, PLAZA.z);
        animateRobotRig(a, dt);
    }
    // DERAP MASSA: SATU timer global (aturan performa lama — jangan per-robot):
    // satu ketukan langkah + getaran tanah kecil selagi barisan melangkah.
    if (anyMarching) {
        marchT -= dt;
        if (marchT <= 0) { marchT = 0.5; playSFX(sfxRobotStep, 0.5); addCamShake(0.45); }
    }
}

export const survivalIntroScene = {
    id: 'survival-intro',
    lightsKey: 'survival',        // dunia yang sama dgn gameplay survival
    camOffset: camOff,            // hook kamera per-scene (dimutasi setShotCam)

    // enter(): pastikan dunia taman terbangun + panggung robot dibuat (masih di
    // balik layar loading). Mesin cutscene sendiri dinyalakan beginSurvivalIntro().
    enter() {
        ensureParkWorld();
        applyLightPreset(scene, 'outdoor');
        if (!army.length && !chasers.length) buildCast();
        const p0 = runAt(0);
        camera.position.set(p0.x, CFG.player.eyeHeight, p0.z);
        camera.quaternion.set(0, 0, 0, 1);
    },

    restartScene: () => survivalScene,   // mati mustahil di cutscene — tetap aman

    // ===== Mesin shot (dipanggil updateGame tiap frame selagi tak paused) =====
    updateMode(dt, step) {
        if (!cine) return;
        if (!cine.live) {
            cine.live = true;
            showCutsceneSkip(skipSurvivalIntro);   // tombol SKIP kanan-bawah (SPACE juga)
        }
        const I = CFG.survival.intro || {};
        const st = step != null ? step : dt * 60;
        cine.t += dt;
        const U = (name, k) => lerp(RUN_U[name][0], RUN_U[name][1], k);
        const say = (text) => { if (cine.caption !== text) { cine.caption = text; showCineCaption(text); } };

        if (cine.phase === 'city') {
            // ===== SHOT 1 "TAMAN": sebelum apa pun terjadi, perlihatkan DI MANA
            // kita berada — Monas menjulang di sepertiga atas frame, seluruh taman
            // yang akan dipertahankan di bawahnya, dan satu titik kecil yang
            // berlari masuk. Inilah yang memberi SKALA pada pertahanan terakhir
            // (kota yang terbakar terlihat di shot-shot rendah berikutnya, di mana
            // sudut tunduk kamera cukup dangkal untuk memuat horizon).
            const k = Math.min(1, cine.t / (I.citySec || 2.8));
            say(CAP.city);
            shotCam(SHOT.cityA, SHOT.cityB, k);
            moveHero(U('city', easeIn(k)), dt, true);
            updateChasers(dt);
            updateArmy(dt, st, false);
            if (k >= 1) {
                cine.phase = 'flee'; cine.t = 0;
                // POTONGAN: fokus DAN sudut kamera dipindah di frame yang SAMA —
                // kalau hanya fokusnya, satu frame masih memakai sudut shot lama.
                setShotCam(...SHOT.fleeA);
                cutTo(camera.position.x, camera.position.z);   // POTONGAN ke player
                setCineFocus(null);                            // lepas -> kamera membuntutinya
            }

        } else if (cine.phase === 'flee') {
            // ===== SHOT 2 "LARI": kamera CRANE TURUN ke samping player &
            // merapat — debu terhambur di belakang sepatunya, pengejar masuk
            // frame. Dari "peta" ke "manusia".
            const k = Math.min(1, cine.t / (I.fleeSec || 3.0));
            say(CAP.flee);
            shotCam(SHOT.fleeA, SHOT.fleeB, smooth(k));
            moveHero(U('flee', k), dt, true);
            updateChasers(dt);
            updateArmy(dt, st, false);
            if (k >= 1) { cine.phase = 'pursuit'; cine.t = 0; }

        } else if (cine.phase === 'pursuit') {
            // ===== SHOT 3 "DIKEJAR": REVERSE ANGLE dari depan — wajahnya di
            // frame, dan di belakangnya mata merah yang makin dekat.
            const k = Math.min(1, cine.t / (I.pursuitSec || 1.8));
            shotCam(SHOT.fleeB, SHOT.pursuit, smooth(k));
            moveHero(U('pursuit', k), dt, true);
            updateChasers(dt);
            updateArmy(dt, st, false);
            if (k >= 1) {
                cine.phase = 'horde'; cine.t = 0;
                setShotCam(...SHOT.hordeA);   // sudut + fokus berpindah di frame yang sama
                cutTo(HORDE_FOCUS.x, HORDE_FOCUS.z);   // POTONGAN ke pagar (bukan pan)
                startBattleMusic();          // pasukan tiba -> musik masuk (dihentikan di finish)
            }

        } else if (cine.phase === 'horde') {
            // ===== SHOT 4 "PASUKAN" (pesan cerita #2): CUT ke pagar taman —
            // satu PASUKAN robot melompatinya dalam gelombang, mendarat, lalu
            // MELANGKAH masuk berbaris. Kamera menyapu barisan; tanah bergetar.
            // Player di luar frame (ia masih berlari) — inilah taruhannya.
            const k = Math.min(1, cine.t / (I.hordeSec || 4.2));
            say(CAP.horde);
            shotCam(SHOT.hordeA, SHOT.hordeB, smooth(k));
            moveHero(U('horde', k), dt, true);
            updateChasers(dt);
            updateArmy(dt, st, true);
            if (k >= 1) {
                cine.phase = 'refuge'; cine.t = 0;
                setShotCam(...SHOT.refugeA);                   // sudut + fokus berpindah bersamaan
                cutTo(camera.position.x, camera.position.z);   // POTONGAN balik ke player
                setCineFocus(null);                            // lepas -> kamera membuntuti pivot
            }

        } else if (cine.phase === 'refuge') {
            // ===== SHOT 5 "MONAS" (pesan cerita #3): dari BELAKANG player —
            // Monas menjulang di depan, apinya menyala. Tempat berlindung
            // terakhir itu benar-benar terlihat sebagai tujuan.
            const k = Math.min(1, cine.t / (I.refugeSec || 2.2));
            say(CAP.refuge);
            shotCam(SHOT.refugeA, SHOT.refugeB, smooth(k));
            moveHero(U('refuge', k), dt, true);
            updateChasers(dt);
            updateArmy(dt, st, true);
            if (k >= 1) { cine.phase = 'arrive'; cine.t = 0; }

        } else if (cine.phase === 'arrive') {
            // ===== SHOT 6 "TIBA": ia melambat (easeOut) dan BERHENTI di
            // pelataran Monas; kamera memutar ke depan, debu mengendap.
            const k = Math.min(1, cine.t / (I.arriveSec || 1.8));
            shotCam(SHOT.refugeB, SHOT.arrive, smooth(k));
            moveHero(U('arrive', easeOut(k)), dt, k < 0.85);
            updateChasers(dt);
            updateArmy(dt, st, true);
            if (k >= 1) {
                cine.phase = 'turn'; cine.t = 0;
                playSFX(sfxSwitch, 0.7);   // senjata disiagakan
            }

        } else if (cine.phase === 'turn') {
            // ===== SHOT 7 "BERBALIK" (pesan cerita #4): kamera MENGORBIT dia
            // sementara ia berbalik dari arah Monas ke arah pasukan — barisan
            // robot terbuka di belakangnya. Satu gerakan, dua informasi.
            const k = Math.min(1, cine.t / (I.turnSec || 2.6));
            say(CAP.turn);
            shotCam(SHOT.arrive, SHOT.turnEnd, smooth(k));
            camera.position.set(PLAZA.x, eyeH, PLAZA.z);
            cine.u = 1;
            // Titik hadap di-lerp dari "ke Monas" ke "ke pasukan" -> avatar
            // berputar di tempat (rantai hadap playerAvatar: torso dulu, kaki menyusul).
            const e = smooth(k);
            faceHero(lerp(0, RUN_PATH[0].x, e), lerp(0, RUN_PATH[0].z, e));
            updateChasers(dt);
            updateArmy(dt, st, true);
            if (k >= 1) { cine.phase = 'stand'; cine.t = 0; }

        } else if (cine.phase === 'stand') {
            // ===== SHOT 8 "I WILL FIGHT": hero angle rendah, kamera mendorong
            // masuk; barisan robot berhenti di depannya.
            const k = Math.min(1, cine.t / (I.standSec || 3.4));
            if (k > 0.18) say(CAP.stand);
            shotCam(SHOT.stand, SHOT.standIn, smooth(k));
            camera.position.set(PLAZA.x, eyeH, PLAZA.z);
            faceHero(RUN_PATH[0].x, RUN_PATH[0].z);
            updateChasers(dt);
            updateArmy(dt, st, true);
            if (k >= 1) { cine.phase = 'settle'; cine.t = 0; }

        } else if (cine.phase === 'settle') {
            // ===== SHOT 9 "SERAH-TERIMA": kamera menarik mundur TEPAT ke sudut
            // gameplay (CAM_OFF_DEFAULT) & kabut kembali ke preset taman, takarir
            // memudar, musik surut. Tanpa shot ini sudut kamera "menjentik" ke
            // sudut gameplay begitu layar tutorial muncul (blocker cuma 60% hitam,
            // jadi jentikannya kelihatan).
            const k = Math.min(1, cine.t / (I.settleSec || 1.4));
            const e = smooth(k);
            const F = LIGHT_PRESETS.outdoor;
            camOff.x = lerp(SHOT.standIn[1] * Math.sin(SHOT.standIn[0] * Math.PI / 180), CAM_OFF_DEFAULT.x, e);
            camOff.z = lerp(SHOT.standIn[1] * Math.cos(SHOT.standIn[0] * Math.PI / 180), CAM_OFF_DEFAULT.z, e);
            camOff.y = lerp(SHOT.standIn[2], CAM_OFF_DEFAULT.y, e);
            if (scene && scene.fog) {
                scene.fog.near = lerp(SHOT.standIn[3], F.fogNear, e);
                scene.fog.far = lerp(SHOT.standIn[4], F.fogFar, e);
            }
            camera.position.set(PLAZA.x, eyeH, PLAZA.z);
            faceHero(RUN_PATH[0].x, RUN_PATH[0].z);
            updateChasers(dt);
            updateArmy(dt, st, true);
            if (k > 0.25) hideCineCaption();               // takarir memudar (transisi CSS)
            duckMusic(1 - e);                              // musik SURUT, tidak terpotong kasar
            if (k >= 1) finishSurvivalIntro();
        }
    },

    // Hook gameplay = no-op (tak ada gameplay selama cutscene)
    playerCollide() { },
    groundHeight: () => 0,
    bulletBlocked: () => false,
    grenadeCollide() { },
    robotAI: () => ({ skip: true }),
    clampRobot() { },
    clampDropPos: (x, z) => [x, z],
    hudStatus: () => '',
    radarLandmarks() { },
};

// Akhiri cutscene -> bersihkan aktor & sinematik -> scene Survival (enter()
// menempatkan player di titik spawn + memulai Wave 1) -> layar tutorial.
function finishSurvivalIntro() {
    cine = null;
    hideCutsceneSkip();
    hideCineCaption();
    setCinematicActive(false);
    setCineBars(false);
    setCineFocus(null);
    stopMusic();   // musik cutscene berhenti: gameplay tetap "musik menyala saat
                   // peluru pertama MENGENAI robot" (invarian sfx.js tak berubah)
    disposeCast();
    applyLightPreset(scene, 'outdoor');   // pulihkan kabut/cahaya preset taman
    if (avatarGroup) avatarGroup.visible = true;
    setScene(survivalScene, { fresh: true });
    // Baru SEKARANG tampilkan tutorial "Click to Start the Action" (game mau
    // dimulai): pause + blocker. Pointer belum pernah terkunci selama auto-play
    // -> klik = start awal (bukan resume).
    setPaused(true);
    hidePauseMenu();
    if (blocker) blocker.style.display = 'flex';
}
