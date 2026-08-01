// CUTSCENE: TANK-BOSS INTRO ("penjemputan gagal") — dipisah dari stage4.js pada
// 2026-07-19 (permintaan user: pisahkan cutscene dari stage & utility), lalu
// DIROMBAK TOTAL 2026-07-27 (permintaan user: "buat agar jauh lebih dramatis,
// jauh lebih cinematic ... seperti film box office"). Ini adegan scripted saat
// player BERTEMU BOSS TANK di alun-alun Stage 4.
//
// KONTRAK NARASI — empat beat yang TIDAK BOLEH hilang apa pun perubahannya
// (dijaga assert "S4 CUTSCENE NARASI" di tools/smoke.mjs):
//   (1) HELI PENJEMPUT menunggu di pusat alun-alun,
//   (2) TANK datang dari UTARA,
//   (3) tank MENGHANCURKAN heli (satu-satunya jalan pulang lenyap),
//   (4) tank PARKIR di BOSS_POS menghadap player -> DUEL.
//
// PAPAN SHOT (11 shot; durasi tiap shot dari CFG.campaign.tankIntro):
//   1  open      player berhenti melangkah — dorongan halus, letterbox masuk
//   2  survey    CRANE naik & mundur menyapu alun-alun: heli menunggu, rotor hidup
//   3  tremor    CUT ke sudut RENDAH menatap jalan utara — tanah bergetar, debu
//                melompat, deru mesin tumbuh. Yang datang BELUM terlihat.
//   4  reveal    framing yang SAMA (tanpa cut = bayaran telegraf): TANK menerobos
//                masuk frame menuju lensa, guncangan berat, badai debu
//   5  lock      CUT ke profil samping: turret MENGAYUN ke heli sementara pilot
//                panik MENGANGKAT heli — terlambat
//   6  fire      CUT ke two-shot lebar: railgun MENGISI DAYA lalu MELEDAKKAN
//                tembakan (hit-stop = gerak lambat, seluruh dunia ikut melambat)
//   7  shell     peluru menyeberangi frame; kamera mendorong masuk ke heli
//   8  crash     HANTAMAN: heli meledak di udara & JATUH menghantam pelataran
//   9  advance   tank menggilas maju melewati bangkai yang berkobar ke BOSS_POS
//  10  faceOff   HERO ANGLE rendah dari DEPAN: laras menatap lensa (kartu boss)
//  11  panBack   kamera kembali ke player & MENDARAT di sudut gameplay -> duel
//
// APA YANG DIROMBAK 2026-07-27: versi lama punya 9 fase tapi HANYA satu bahasa
// kamera — sudut gameplay tetap (oblique barat daya) sepanjang cutscene, yang
// berubah cuma titik fokus lewat setCineFocus (pan lambat 1,5/dtk). Tak ada
// telegraf, tak ada cut, tak ada gerak lambat: tank tiba-tiba ada, menembak, dan
// selesai. Sekarang tiap shot punya AZIMUT/JARAK/TINGGI sendiri (hook
// `activeScene.camOffset` — stage4 mendelegasikannya ke `camOffset()` di bawah),
// titik fokus diredam sendiri (bukan ease renderer), ada EMPAT CUT film sungguhan
// (masuk telegraf, profil samping, two-shot tembakan, dan potongan tepat di
// HANTAMAN — memotong pada ledakan adalah tata bahasa film paling tua),
// telegraf getaran sebelum reveal, gerak lambat hit-stop di tembakan & hantaman,
// heli yang MENCOBA KABUR lalu jatuh dari udara, dan dialog radio typewriter.
//
// Modul ini HANYA menangani cutscene + siklus hidup HELI. Tank yang di-spawn di
// tengah cutscene diserahkan ke stage4 lewat callback `setTank` (stage4 yang
// mengurus DUEL: updateTank, kunci arena, kondisi menang). Geometri
// (SQ/HELI_POS/BOSS_POS/WRECK_CLEAR/S4_START) + `blockers` + `openGate`
// di-inject stage4 lewat createTankBossIntro (modul ini buta geometri scene).
// Mesin BERBASIS TIMER (deterministik — headless-testable via stage4).

import { CFG } from '../../../core/config.js';
import { _v3, GEO, setCinematicActive } from '../../../core/state.js';
import { scene, camera, addCamShake, setCineFocus, CAM_OFF_DEFAULT } from '../../../core/renderer.js';
import {
    setCineBars, showStageMsg, showCutsceneSkip, hideCutsceneSkip,
    hideCineCaption, showStageRadioDialogue, hideStageRadioDialogue,
} from '../../../core/dom.js';
import { releaseInputs, aimPoint } from '../../../core/input.js';
import { addHitStop } from '../../../core/timeScale.js';
import { spawnGroundPuff } from '../../../entities/effects.js';
import { playSFX, sfxExplode, sfxTankBlast, playLoopSFX, stopLoopSFX, sfxHeli, stopMusic, startBossMusic } from '../../../utils/sfx.js';
import { spawnHelicopter, updateHelicopter, blastHelicopter, disposeHelicopter } from '../../../entities/helicopter.js';
import { spawnTank, tankMovingTick } from '../../../entities/tank.js';
import { rand } from '../../../utils/math.js';
import { updateUI } from '../../../core/hud.js';
import { countStageRobots } from '../utility/common.js';

const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIn = (k) => k * k;
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => k < 0 ? 0 : k > 1 ? 1 : k;

// ===== SINEMATOGRAFI (OVERHAUL 2026-07-27) ==================================
// Sudut kamera per shot dinyatakan (azimut°, jarak mendatar, tinggi, fogNear,
// fogFar) — azimut = arah KAMERA BERADA dari titik fokus. Pola & alasannya sama
// dengan dua cutscene lain (campaign/cutscenes/intro.js, survival/cutscenes/
// monasIntro.js): renderer membaca `activeScene.camOffset` TIAP FRAME, jadi
// cukup memutasi objek `camOff` — renderer tak perlu disentuh sama sekali.
//
// Azimut ditulis sebagai SIMPANGAN dari sudut kamera gameplay (`CAM_OFF_DEFAULT`
// — satu sumber kebenaran, JANGAN salin angkanya) supaya shot pembuka & penutup
// LITERAL sama dengan kamera gameplay: cutscene tak "menjentik" saat mulai
// maupun saat serah-terima balik ke duel.
const GAMEPLAY_AZ = (Math.atan2(CAM_OFF_DEFAULT.x, CAM_OFF_DEFAULT.z) * 180 / Math.PI + 360) % 360;
const GAMEPLAY_DIST = Math.hypot(CAM_OFF_DEFAULT.x, CAM_OFF_DEFAULT.z);
const az = (delta) => GAMEPLAY_AZ + delta;   // simpangan -> azimut absolut
// CATATAN ARAH: alun-alun dilihat dari barat daya, tank datang dari UTARA (-z).
// Kamera "menatap ke utara" = kamera berada di SELATAN titik fokus = az ~+50
// simpangan (365° ≈ 5°). Derajat sengaja boleh > 360 / < 0: interpolasi DI DALAM
// satu shot memakai selisih apa adanya, jadi menulis 365→358 mencegah lerp
// berputar arah jauh (5→358 akan menyapu 353° ke arah yang salah).
const SHOT = {
    //              azimut     jarak tinggi fogNear fogFar
    open: [az(0), GAMEPLAY_DIST, CAM_OFF_DEFAULT.y, 240, 1700],   // = KAMERA GAMEPLAY (mulai tanpa jentikan)
    openEnd: [az(-4), 88, 100, 240, 1700],   // dorongan halus: dunia mulai "menahan napas"
    surveyEnd: [az(-15), 300, 250, 320, 2100],   // CRANE lebar: seluruh alun-alun + heli menunggu
    tremorA: [az(50), 165, 30, 150, 900],   // CUT — sudut RENDAH menatap jalan utara, kabut TEBAL
    tremorB: [az(43), 148, 24, 140, 850],   // merayap lebih rendah & rapat; getaran tumbuh
    revealEnd: [az(15), 92, 26, 180, 1150],   // tank menerobos frame; kamera menyapu kecil
    lockA: [az(-47), 100, 34, 170, 1100],   // CUT — profil samping: laras mengayun ke heli
    lockB: [az(-57), 88, 30, 170, 1100],
    fireWide: [az(-65), 210, 66, 260, 1600],   // CUT — two-shot: tank & heli satu frame
    shellEnd: [az(-69), 150, 50, 230, 1450],   // mendorong masuk mengikuti peluru
    impact: [az(-72), 118, 30, 190, 1250],   // rapat & rendah saat hantaman
    crashEnd: [az(-65), 104, 24, 190, 1250],   // bangkai berkobar mengisi latar depan
    advanceEnd: [az(-42), 158, 48, 220, 1500],   // busur mengelilingi tank yang menggilas maju
    faceOffEnd: [az(-36), 96, 22, 200, 1350],   // HERO ANGLE rendah dari DEPAN — laras ke lensa
    handoff: [az(0), GAMEPLAY_DIST, CAM_OFF_DEFAULT.y, 240, 1700],   // = KAMERA GAMEPLAY (duel dimulai)
};
// Busur paruh kedua (crash 250° -> advance 273° -> faceOff 279° -> gameplay 315°)
// sengaja SEARAH tanpa pembalikan; paruh pertama (365° -> 330°) juga searah.
// Pembalikan hanya terjadi PADA CUT, di mana memang tak ada gerak yang terlihat.
// EMPAT CUT (dijaga assert): survey->tremorA, reveal->lockA, lock->fireWide, dan
// shell->impact (potongan tepat pada frame hantaman).

// Peredaman: shot menulis ke TARGET, nilai nyata mengejarnya (kamera punya BOBOT
// dan tiap patahan kecil di batas shot luruh mulus). CUT = `snap` sekali frame.
const CAM_SETTLE = 4.0;      // 1/detik (konstanta waktu ~0,25 dtk)
const FOCUS_SETTLE = 3.2;    // titik fokus sedikit lebih malas dari kameranya

// Dialog user untuk rangkaian ekstraksi gagal. Arah suara statis/ledakan bukan
// bagian body; cutoff Pilot diberi distorsi visual, sedangkan ledakan keras dan
// putusnya rotor tetap berasal dari aksi/audio sinematik yang sudah ada.
export const TANK_BOSS_DIALOGUE = Object.freeze({
    heliArrival: Object.freeze({
        speaker: 'Pilot',
        text: "Major, we’re at the LZ! Hurry, we're running out of time! Get in so we can fall back to Bandung and upload that file! Put an end to this madness once and for all!",
    }),
    tankReveal: Object.freeze({
        speaker: 'Pilot',
        text: 'Wait... what the hell is THAT?! Is that a—',
    }),
    pilotCutoff: Object.freeze({
        speaker: 'Pilot',
        text: 'GET OUT OF THE—',
        distorted: true,
    }),
    gibranReaction: Object.freeze({
        speaker: 'Major Gibran',
        text: 'DAMN IT!! That metal bastard took out our exfil... I’m taking that tank down!',
    }),
});

// Ketinggian heli saat mencoba lepas landas (fase lock/fire) — ia tertembak DI
// UDARA lalu JATUH menghantam pelataran di fase crash.
const LIFT_Y = 15;

// Bikin satu pengontrol cutscene tank-boss. `deps`:
//   SQ, HELI_POS, BOSS_POS, WRECK_CLEAR, S4_START  = geometri stage 4
//   blockers   = array blocker stage 4 (heliBlocker di-push/-splice di sini)
//   openGate   = fn stage 4 (buka gerbang ring saat heli mendarat)
//   setTank(t) = callback: stage 4 menyimpan ref tank + set bossSpawned=true
export function createTankBossIntro(deps) {
    const { SQ, HELI_POS, BOSS_POS, WRECK_CLEAR, S4_START, blockers, openGate, setTank } = deps;

    let heli = null, heliSpawned = false, heliBlocker = null, heliDead = false;
    let cine = null, cutsceneDone = false;
    let tank = null;   // dibuat cutscene; juga diteruskan ke stage4 lewat setTank
    let heliSnd = null;   // loop helicopter-flying selama heli diperlihatkan cutscene (2026-07-19)
    let savedFog = null;  // {near,far} kabut global stage 4 (kabut per-shot dipulihkan di akhir)
    let musicOn = false;  // musik boss sudah dinyalakan? (panBack menyalakannya lebih awal)
    let dialogueCurrent = null, dialogueQueue = [], dialogueSeen = new Set();
    let dialogueT = 0, dialogueChars = 0;

    function dialogueDebug() {
        return {
            key: dialogueCurrent ? dialogueCurrent.key : null,
            speaker: dialogueCurrent ? dialogueCurrent.speaker : '',
            text: dialogueCurrent ? dialogueCurrent.text : '',
            chars: dialogueChars,
            shown: dialogueCurrent ? dialogueCurrent.text.slice(0, dialogueChars) : '',
            typing: !!dialogueCurrent && dialogueChars < dialogueCurrent.text.length,
            distorted: !!dialogueCurrent?.distorted,
            queued: dialogueQueue.map(line => line.key),
            seen: [...dialogueSeen],
        };
    }

    function renderDialogue() {
        if (!dialogueCurrent) { hideStageRadioDialogue(); return; }
        dialogueChars = Math.max(0, Math.min(dialogueCurrent.text.length, dialogueChars | 0));
        showStageRadioDialogue(
            dialogueCurrent.speaker,
            dialogueCurrent.text.slice(0, dialogueChars),
            dialogueChars < dialogueCurrent.text.length,
            !!dialogueCurrent.distorted,
        );
    }

    function beginNextDialogue() {
        dialogueCurrent = dialogueQueue.shift() || null;
        dialogueT = 0;
        dialogueChars = 0;
        renderDialogue();
    }

    function queueDialogue(key) {
        const line = TANK_BOSS_DIALOGUE[key];
        if (!line || dialogueSeen.has(key)) return false;
        dialogueSeen.add(key);
        dialogueQueue.push({ key, ...line });
        if (!dialogueCurrent) beginNextDialogue();
        return true;
    }

    function updateDialogue(dt) {
        if (!dialogueCurrent) return;
        const D = CFG.campaign.dialogue;
        const cps = Math.max(1, D.cps), holdSec = Math.max(0, D.holdSec);
        dialogueT += dt;
        while (dialogueCurrent) {
            const lineSec = dialogueCurrent.text.length / cps + holdSec;
            if (dialogueT < lineSec) {
                dialogueChars = Math.floor(dialogueT * cps);
                renderDialogue();
                return;
            }
            dialogueChars = dialogueCurrent.text.length;
            renderDialogue();
            dialogueT -= lineSec;
            beginNextDialogue();
        }
    }

    function resetDialogue() {
        dialogueCurrent = null; dialogueQueue = []; dialogueSeen = new Set();
        dialogueT = 0; dialogueChars = 0;
        hideStageRadioDialogue();
    }

    // ----- Kamera & titik fokus sinematik (lihat blok SINEMATOGRAFI di atas) -----
    const camOff = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z };
    const camTarget = { x: CAM_OFF_DEFAULT.x, y: CAM_OFF_DEFAULT.y, z: CAM_OFF_DEFAULT.z, near: 240, far: 1700 };
    const focus = { x: 0, z: 0 }, focusTarget = { x: 0, z: 0 };

    function setShotCam(azDeg, dist, height, fogNear, fogFar) {
        const a = azDeg * Math.PI / 180;
        camTarget.x = Math.sin(a) * dist;
        camTarget.z = Math.cos(a) * dist;
        camTarget.y = height;
        // Kabut per-shot = uniform belaka -> menganimasikannya GRATIS. Shot rendah
        // butuh kabut TEBAL (pinggiran kompleks larut jadi haze, siluet tank
        // muncul dari kabut itu); shot lebar butuh kabut longgar supaya alun-alun
        // terbaca utuh. Nilai asli disimpan di start(), dipulihkan di akhir.
        if (fogNear != null) { camTarget.near = fogNear; camTarget.far = fogFar; }
    }
    // Interpolasi antar dua setelan kamera (gerak DI DALAM satu shot).
    function shotCam(A, B, k) {
        setShotCam(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k),
            lerp(A[3], B[3], k), lerp(A[4], B[4], k));
    }
    // Titik fokus (dunia): ditulis ke renderer dengan `snap` — peredamannya
    // dikerjakan DI SINI, bukan oleh ease 1,5/dtk milik followViewCam (terlalu
    // lambat & seragam untuk bahasa kamera per-shot).
    function aimFocus(x, z) { focusTarget.x = x; focusTarget.z = z; }
    // Dekatkan kamera + kabut + fokus ke targetnya. `snap` = tulis seketika (CUT
    // film, frame pertama cutscene, dan warm-up di mana peredaman justru salah).
    function settleAll(dt, snap) {
        const kc = snap ? 1 : 1 - Math.exp(-CAM_SETTLE * dt);
        camOff.x += (camTarget.x - camOff.x) * kc;
        camOff.y += (camTarget.y - camOff.y) * kc;
        camOff.z += (camTarget.z - camOff.z) * kc;
        if (scene && scene.fog) {
            scene.fog.near += (camTarget.near - scene.fog.near) * kc;
            scene.fog.far += (camTarget.far - scene.fog.far) * kc;
        }
        const kf = snap ? 1 : 1 - Math.exp(-FOCUS_SETTLE * dt);
        focus.x += (focusTarget.x - focus.x) * kf;
        focus.z += (focusTarget.z - focus.z) * kf;
        setCineFocus(focus.x, focus.z, true);   // fokus SUDAH diredam di sini -> tulis persis
    }
    // POTONGAN film: sudut + titik fokus berpindah dalam frame yang sama, TANPA
    // gerak antara. Inilah yang membuat cutscene terbaca sebagai film, bukan satu
    // pan panjang (versi lama tak punya satu pun cut).
    function cutTo(shot, fx, fz) {
        setShotCam(...shot);
        aimFocus(fx, fz);
        cine.snap = true;
    }
    // Avatar player MENGHADAP aksi (playerAvatar membaca aimPoint utk yaw; input
    // dibekukan cinematicActive, jadi override ini tak melawan kursor player).
    function faceAction(tx, tz) {
        if (aimPoint) aimPoint.set(tx, camera.position.y - CFG.player.eyeHeight, tz);
    }

    // ===== Geometri panggung cutscene =====
    // Lintasan masuk tank: SATU garis lurus dari jauh di UTARA (di luar kompleks,
    // tertelan kabut) ke titik tembak di utara heli — dilalui MENERUS lintas dua
    // fase (tremor + reveal) supaya tak ada patahan kecepatan di batas shot.
    // Garisnya DITURUNKAN dari `SMASH` (ruko yang diterobos, stage4.S4_SMASH):
    // titik tembak → muka ruko, diperpanjang ke utara sampai z = SQ.z0 − 330.
    // Dengan begitu tank SELALU menabrak tepat di tengah muka bangunan; kalau
    // lintasannya dihardcode lagi, tabrakannya kembali jadi kebetulan.
    const SMASH = deps.SMASH || null;
    const TANK_FIRE = { x: HELI_POS.x, z: HELI_POS.z - 130 };
    const TANK_FROM = (() => {
        const backZ = SQ.z0 - 330;
        if (!SMASH) return { x: HELI_POS.x + 42, z: backZ };   // tanpa ruko: lintasan lama
        const dx = SMASH.x - TANK_FIRE.x, dz = SMASH.z - TANK_FIRE.z;
        const t = (backZ - TANK_FIRE.z) / (dz || -1);           // perpanjang melewati ruko
        return { x: TANK_FIRE.x + dx * t, z: backZ };
    })();
    // Moncong tank menyentuh MUKA UTARA ruko pada z ini (setengah panjang lambung
    // × skala tank ≈ 18). Runtuhnya dipicu geometri, bukan nama fase — jadi tetap
    // tepat walau user menyetel ulang durasi shot di CFG.
    const SMASH_HIT_Z = SMASH ? SMASH.z - SMASH.hz - 18 : Infinity;
    // Yaw badan agar moncong (-X lokal) searah gerak (kontrak tank.js).
    const driveYaw = (from, to) => Math.atan2(to.z - from.z, -(to.x - from.x));
    // Arah laju masuk (satuan) — dipakai melempar puing ruko searah tank.
    const DRIVE_DIR = (() => {
        const dx = TANK_FIRE.x - TANK_FROM.x, dz = TANK_FIRE.z - TANK_FROM.z;
        const l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l };
    })();
    // MENEROBOS RUKO (2026-07-28): begitu moncong menyentuh muka bangunan ia
    // ROBOH — bukan tank yang melambat, bangunannya yang mengalah (tank 60 ton
    // yang tersendat justru mematahkan kesan berat). Dunia yang bergetar +
    // hit-stop singkat yang menjual bobotnya.
    function checkSmash() {
        if (!cine || cine.smashed || !tank || !deps.smash) return;
        if (tank.parts.group.position.z < SMASH_HIT_Z) return;
        cine.smashed = true;
        deps.smash(DRIVE_DIR.x, DRIVE_DIR.z);
        addCamShake(8);
        addHitStop(0.12, 0.45);   // sentakan pendek — dinding beton yang menyerah
    }
    // Yaw turret DUNIA agar meriam (+Z lokal turret) menghadap titik (tx,tz).
    const turretYawTo = (gx, gz, tx, tz) => Math.atan2(tx - gx, tz - gz);

    // Semua robot mati -> gerbang terbuka + HELI PENJEMPUT mendarat menunggu di
    // pusat alun-alun (hidung ke BARAT = arah kedatangan player). Bangkainya
    // kelak jadi obstacle -> blocker pejal ikut dipasang (dicabut di reset()).
    function heliArrives() {
        heliSpawned = true;
        openGate();
        heli = spawnHelicopter(HELI_POS.x, HELI_POS.z, -Math.PI / 2);
        heliBlocker = {
            x: HELI_POS.x, z: HELI_POS.z, hx: 26, hz: 26,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(26, 26), top: 18, standable: false
        };
        blockers.push(heliBlocker);
        showStageMsg('THE HIGHWAY IS CLEAR — REACH THE EXTRACTION HELICOPTER!');
        updateUI();
    }

    // Mulai cutscene (dipicu stage4.playerCollide saat player menginjak ring):
    // freeze input (cinematicActive; Esc tetap = pause) + letterbox.
    function start() {
        if (cine || cutsceneDone) return false;
        cine = {
            phase: 'open', t: 0, dur: 0, from: null, to: null, shell: null, sFrom: null,
            track: 0, caption: null, snap: true, hitY: 0, landed: false, smashed: false,
            player: { x: camera.position.x, z: camera.position.z },   // tempat player berdiri (shot 1 & shot penutup)
        };
        releaseInputs();
        setCinematicActive(true);
        setCineBars(true);
        // Player SUDAH dibekukan sebelum body pertama muncul. Dialog sengaja
        // dimulai dari kosong pada frame trigger ring, lalu shot survey menunggu
        // sampai panggilan LZ selesai sebelum tank menyela.
        queueDialogue('heliArrival');
        // Kamera mulai PERSIS di sudut gameplay & fokus di player: tak ada
        // jentikan di frame pertama (dulu fokus di-ease dari mana pun ia berada).
        setShotCam(...SHOT.open);
        if (scene && scene.fog) {
            savedFog = { near: scene.fog.near, far: scene.fog.far };
            camTarget.near = scene.fog.near; camTarget.far = scene.fog.far;
        }
        aimFocus(cine.player.x, cine.player.z);
        settleAll(0, true);
        // AUDIO CUTSCENE (2026-07-19): musik battle berhenti (adegan sinematik),
        // suara HELI TERBANG menyala selama heli diperlihatkan — dihentikan
        // tepat saat heli hancur ditembak tank (fase 'crash').
        stopMusic();
        musicOn = false;
        heliSnd = playLoopSFX(sfxHeli, 0.55);
        showCutsceneSkip(skip);   // tombol SKIP kanan-bawah (2026-07-19; SPACE — kursor tersembunyi saat pointer lock)
        return true;
    }

    // SKIP cutscene (2026-07-19, tombol kanan-bawah / SPACE): loncat langsung
    // ke keadaan akhir — heli pasti sudah jadi bangkai terbakar, tank spawn
    // (bila belum) dan terparkir di BOSS_POS, lalu endCutscene() memulai duel.
    function skip() {
        if (!cine) return;
        clearShell();
        if (!tank) spawnCineTank();
        if (heli && !heliDead) {
            blastHelicopter(heli); heliDead = true;
            heli.parts.group.position.y = -1.2;   // (skip melewati animasi jatuhnya)
        }
        stopLoopSFX(heliSnd); heliSnd = null;
        tank.parts.group.position.set(BOSS_POS.x, 0, BOSS_POS.z);
        resetDialogue();
        endCutscene();
    }

    // Buang peluru sinematik bila masih terbang (skip/reset di tengah fase shell)
    function clearShell() {
        if (!cine || !cine.shell) return;
        scene.remove(cine.shell);
        if (cine.shell.material.dispose) cine.shell.material.dispose();
        cine.shell = null;
    }

    // Belok sudut a -> b terbatas maxD rad (salinan lokal turnAngle tank.js)
    function approachAngle(a, b, maxD) {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d) <= maxD ? b : a + Math.sign(d) * maxD;
    }
    // Turret tank sinematik membidik heli (fase 'cine': updateTank skip logikanya,
    // tapi updateTankAudio tetap terpelihara — stage4 memanggil updateTank juga
    // selama cutscene). Rotasi RELATIF turret yang benar-benar berubah men-tick
    // suara tank-turret-rotate (2026-07-19, SFX cutscene). `rate` = rad/dtk;
    // dipakai fase 'lock' supaya ayunan larasnya TERLIHAT, bukan menjentik.
    function aimTurretAt(tx, tz, rate, dt) {
        const g = tank.parts.group.position;
        const want = turretYawTo(g.x, g.z, tx, tz);
        tank.turretYaw = rate ? approachAngle(tank.turretYaw, want, rate * dt) : want;
        const rel = tank.turretYaw - tank.hullYaw;
        if (Math.abs(rel - tank.parts.turret.rotation.y) > 0.004) tank.turretT = 0.15;
        tank.parts.turret.rotation.y = rel;
    }
    const aimTurretAtHeli = (rate, dt) => aimTurretAt(HELI_POS.x, HELI_POS.z, rate, dt);
    // Turret LURUS ke depan mengikuti badan (fase masuk: "menggilas dgn laras ke
    // depan"). Meriam = +Z lokal turret, moncong badan = -X lokal -> selisihnya
    // tepat -90°; menuliskannya lewat turretYaw menjaga kontrak fase 'battle'.
    function turretForward() {
        tank.turretYaw = tank.hullYaw - Math.PI / 2;
        tank.parts.turret.rotation.y = -Math.PI / 2;
    }
    // Roda berputar + debu + guncangan selama tank bergerak dlm cutscene.
    // `heavy` (fase reveal) = debu jauh lebih rapat + guncangan berat.
    function cineTracksDust(dt, heavy) {
        cine.track += dt * (heavy ? 13 : 8);
        tankMovingTick(tank);   // suara tank-moving ikut menyala selama drive sinematik (2026-07-19)
        for (const w of tank.parts.wheels) w.rotation.x = cine.track;
        const n = heavy ? 3 : 1;
        for (let i = 0; i < n; i++) {
            if (Math.random() < 0.5) spawnGroundPuff(
                tank.parts.group.position.x + rand(-16, 16),
                tank.parts.group.position.z + rand(-12, 12), 0x6b6252,
                heavy ? 6 + Math.random() * 5 : 4, heavy ? 5 : 3);
        }
        addCamShake(heavy ? 2.2 : 0.5);
    }
    // Spawn tank fase 'cine' di ujung utara lintasan masuk + serahkan ke stage4.
    function spawnCineTank() {
        tank = spawnTank({
            homeX: BOSS_POS.x, homeZ: BOSS_POS.z, wallX: BOSS_POS.x - 9999, faceX: S4_START.x,
            arena: { x0: SQ.x0, x1: SQ.x1, z0: SQ.z0, z1: SQ.z1 },
            avoid: { x: HELI_POS.x, z: HELI_POS.z, r: WRECK_CLEAR }
        });
        tank.phase = 'cine';
        tank.parts.group.position.set(TANK_FROM.x, 0, TANK_FROM.z);
        tank.hullYaw = driveYaw(TANK_FROM, TANK_FIRE);
        tank.parts.group.rotation.y = tank.hullYaw;
        turretForward();
        setTank(tank);   // serahkan ke stage4 (bossSpawned=true, ref utk duel)
        return tank;
    }
    // Tempatkan tank pada progres 0..1 sepanjang lintasan masuk (dipakai DUA fase
    // -> satu garis mulus, tanpa patahan kecepatan di batas shot).
    function driveTank(u) {
        tank.parts.group.position.x = lerp(TANK_FROM.x, TANK_FIRE.x, u);
        tank.parts.group.position.z = lerp(TANK_FROM.z, TANK_FIRE.z, u);
    }
    // Debu "sesuatu yang berat mendekat": kepulan meloncat dari aspal di sepanjang
    // jalan utara, makin rapat seiring getaran menguat (telegraf fase 'tremor').
    function tremorDust(dt, strength) {
        cine.washT = (cine.washT || 0) - dt * strength;
        if (cine.washT > 0) return;
        cine.washT = 0.07;
        const z = HELI_POS.z - 40 - Math.random() * 240;
        spawnGroundPuff(HELI_POS.x + rand(-90, 90), z, 0x6b6252, 2.5 + Math.random() * 3, 2);
    }

    // Durasi tiap shot (CFG — user boleh menyetelnya antar sesi; JANGAN
    // hardcode angkanya di assert).
    const SEC = (key, fallback) => {
        const T = CFG.campaign.tankIntro || {};
        return T[key] != null ? T[key] : fallback;
    };

    // ===== Mesin fase cutscene (dipanggil update() selagi cine aktif) =====
    function runCutscene(dt) {
        cine.t += dt;
        const P = cine.phase;

        if (P === 'open') {
            // ===== SHOT 1 "BERHENTI MELANGKAH": player baru menginjak pelataran;
            // letterbox meluncur masuk & kamera mendorong halus. Satu tarikan
            // napas sebelum apa pun terjadi — versi lama langsung pan pergi.
            const k = clamp01(cine.t / SEC('openSec', 0.8));
            shotCam(SHOT.open, SHOT.openEnd, smooth(k));
            aimFocus(cine.player.x, cine.player.z);
            faceAction(HELI_POS.x, HELI_POS.z);   // ia menatap heli penjemput
            if (k >= 1) next('survey');

        } else if (P === 'survey') {
            // ===== SHOT 2 "ALUN-ALUN": CRANE naik & mundur sambil fokus meluncur
            // dari player ke heli — memberi SKALA (seberapa jauh jalan pulangnya)
            // sekaligus memperkenalkan panggung duel sebelum ia dirampas.
            const k = clamp01(cine.t / SEC('surveySec', 2.6));
            shotCam(SHOT.openEnd, SHOT.surveyEnd, smooth(k));
            aimFocus(lerp(cine.player.x, HELI_POS.x, smooth(k)), lerp(cine.player.z, HELI_POS.z, smooth(k)));
            faceAction(HELI_POS.x, HELI_POS.z);
            if (k >= 1 && !dialogueCurrent && !dialogueQueue.length) {
                // TANK di-spawn SEKARANG (masih jauh di utara, tertelan kabut):
                // deru mesinnya (loop tank-moving) itulah telegrafnya.
                spawnCineTank();
                // CUT ke sudut rendah menatap jalan utara.
                cutTo(SHOT.tremorA, HELI_POS.x, HELI_POS.z - 60);
                next('tremor');
            }

        } else if (P === 'tremor') {
            // ===== SHOT 3 "SESUATU YANG BERAT" (BARU): telegraf. Kamera nyaris
            // menempel aspal menatap jalan utara; tanah bergetar, debu meloncat,
            // deru mesin tumbuh — dan tak ada apa pun yang terlihat kecuali kabut.
            // Ketegangan datang dari MENUNGGU; versi lama tak punya beat ini.
            const k = clamp01(cine.t / SEC('tremorSec', 2.0));
            shotCam(SHOT.tremorA, SHOT.tremorB, smooth(k));
            aimFocus(HELI_POS.x, HELI_POS.z - 60 - 40 * k);
            faceAction(HELI_POS.x, HELI_POS.z - 200);   // player menoleh ke arah suara
            driveTank(smooth(k) * 0.52);                // lintasan MENERUS ke fase reveal
            checkSmash();
            cineTracksDust(dt, false);
            tremorDust(dt, 0.4 + k);
            addCamShake(0.5 + 2.4 * k * k);             // getaran menguat -> puncak tepat di reveal
            if (k >= 1) {
                queueDialogue('tankReveal');
                next('reveal');
            }

        } else if (P === 'reveal') {
            // ===== SHOT 4 "TEROBOSAN": SENGAJA TANPA CUT — framing yang sama
            // persis dengan shot telegraf, jadi penonton menonton titik yang sama
            // saat TANK menerobos masuk ke frame menuju lensa. Itulah bayaran
            // sebuah telegraf; memotong ke sudut baru justru membuangnya.
            const k = clamp01(cine.t / SEC('revealSec', 2.2));
            shotCam(SHOT.tremorB, SHOT.revealEnd, smooth(k));
            driveTank(0.52 + 0.48 * easeOut(k));        // melaju penuh lalu MENGEREM di titik tembak
            checkSmash();                               // ruko di jalurnya ROBOH saat moncong menyentuhnya
            // Kamera MENAHAN frame di titik yang akan didatangi tank (bukan
            // membuntutinya): subjek yang menerjang ke arah lensa harus MASUK ke
            // frame yang sudah menunggunya. Membuntuti tank di sini justru
            // menyeret fokus 270 unit ke utara dalam sekejap = sentakan.
            aimFocus(lerp(HELI_POS.x, TANK_FIRE.x, smooth(k)),
                lerp(HELI_POS.z - 100, TANK_FIRE.z, smooth(k)));
            faceAction(tank.parts.group.position.x, tank.parts.group.position.z);
            turretForward();
            cineTracksDust(dt, true);
            if (k >= 1) {
                // CUT ke profil samping (garis tank->heli dilihat dari sisi barat).
                cutTo(SHOT.lockA, (tank.parts.group.position.x + HELI_POS.x) / 2,
                    (tank.parts.group.position.z + HELI_POS.z) / 2);
                next('lock');
            }

        } else if (P === 'lock') {
            // ===== SHOT 5 "TERKUNCI": laras MENGAYUN pelan ke heli (rate terbatas
            // supaya gerakannya terlihat) sementara pilot menyadari bahaya dan
            // MENGANGKAT heli. Dua gerak berlawanan di satu frame = ketegangan.
            const k = clamp01(cine.t / SEC('lockSec', 1.7));
            shotCam(SHOT.lockA, SHOT.lockB, smooth(k));
            aimTurretAtHeli(1.5, dt);
            liftHeli(easeIn(k) * LIFT_Y, k);
            faceAction(HELI_POS.x, HELI_POS.z);
            addCamShake(0.35);
            if (k >= 1) {
                // CUT ke two-shot lebar: tank & heli sama-sama di frame, jadi
                // peluru benar-benar TERLIHAT menyeberangi jarak itu.
                cutTo(SHOT.fireWide, (tank.parts.group.position.x + HELI_POS.x) / 2,
                    (tank.parts.group.position.z + HELI_POS.z) / 2);
                queueDialogue('pilotCutoff');
                next('fire');
            }

        } else if (P === 'fire') {
            // ===== SHOT 6 "MENGISI DAYA": meriam railgun tank (lihat buildTankMesh)
            // MENGISI — cincin kapasitor menyala makin terang — lalu MELEDAKKAN
            // tembakan. Hit-stop dipasang di frame tembakan: seluruh dunia melambat
            // (satu-satunya skala waktu global, core/timeScale.js).
            const k = clamp01(cine.t / SEC('fireSec', 0.55));
            aimTurretAtHeli(0, dt);
            liftHeli(LIFT_Y + 3 * k, 1);
            tank.parts.cannonFlash.material.opacity = 0.10 + 0.28 * k * k;
            faceAction(HELI_POS.x, HELI_POS.z);
            if (k >= 1) {
                tank.parts.cannonFlash.material.opacity = 1;
                playSFX(sfxExplode);
                addCamShake(3.4);
                addHitStop(0.30, 0.32);   // GERAK LAMBAT: tembakan terasa punya bobot
                cine.shell = new THREE.Mesh(GEO.grenade,
                    new THREE.MeshLambertMaterial({ color: 0x2b2b2b, emissive: 0x883300 }));
                cine.shell.scale.setScalar(2.1);
                tank.parts.cannonMuzzle.getWorldPosition(_v3);
                cine.shell.position.copy(_v3);
                cine.sFrom = { x: _v3.x, y: _v3.y, z: _v3.z };
                scene.add(cine.shell);
                spawnGroundPuff(_v3.x, _v3.z, 0x8a7f6a, 7, 6);   // debu tersapu ledakan moncong
                next('shell');
            }

        } else if (P === 'shell') {
            // ===== SHOT 7 "PELURU": kamera mendorong masuk mengikuti peluru yang
            // menyeberang. Karena hit-stop masih aktif, ini terbaca sebagai gerak
            // lambat — bukan sekadar animasi cepat.
            const k = clamp01(cine.t / SEC('shellSec', 0.45));
            shotCam(SHOT.fireWide, SHOT.shellEnd, k);
            cine.shell.position.set(
                lerp(cine.sFrom.x, HELI_POS.x, k),
                lerp(cine.sFrom.y, LIFT_Y + 6, k),
                lerp(cine.sFrom.z, HELI_POS.z, k));
            aimFocus(lerp(cine.sFrom.x, HELI_POS.x, k), lerp(cine.sFrom.z, HELI_POS.z, k));
            if (k >= 1) {
                clearShell();
                playSFX(sfxTankBlast);                       // ledakan peluru tank menghantam heli (2026-07-19)
                cine.hitY = heli.parts.group.position.y;     // tertembak DI UDARA...
                blastHelicopter(heli); heliDead = true;      // heli MELEDAK HANCUR (+ ledakan besar explodeAt)
                heli.parts.group.position.y = cine.hitY;     // ...blast men-set y=-1.2; kembalikan, ia JATUH di fase crash
                stopLoopSFX(heliSnd); heliSnd = null;        // rotor mati bersama helinya (2026-07-19)
                queueDialogue('gibranReaction');
                // Ledakan memutus sisa hold radio Pilot dan langsung menyerahkan
                // panel ke reaksi Gibran; body cutoff sudah sempat diketik utuh
                // sepanjang fase fire+shell.
                if (dialogueCurrent?.key === 'pilotCutoff') beginNextDialogue();
                addCamShake(9);
                addHitStop(0.34, 0.16);                      // hantaman: dunia nyaris beku sesaat
                cutTo(SHOT.impact, HELI_POS.x, HELI_POS.z);
                next('crash');
            }

        } else if (P === 'crash') {
            // ===== SHOT 8 "JATUH" (BARU): bangkai yang menyala JATUH dari udara
            // dan menghantam pelataran (dulu ia cuma "sudah rusak" di tempat).
            // Kamera rendah & rapat: api mengisi latar depan, tank di belakangnya.
            const dur = SEC('crashSec', 1.9);
            const k = clamp01(cine.t / dur);
            shotCam(SHOT.impact, SHOT.crashEnd, smooth(k));
            aimFocus(HELI_POS.x, HELI_POS.z);
            faceAction(HELI_POS.x, HELI_POS.z);
            const fall = clamp01(cine.t / (dur * 0.5));
            const g = heli.parts.group;
            g.position.y = lerp(cine.hitY, -1.2, easeIn(fall));
            g.rotation.y = -Math.PI / 2 + 0.28 * fall;        // badan berputar liar saat jatuh
            g.rotation.z = 0.14 + 0.16 * Math.sin(Math.PI * fall);
            if (fall >= 1 && !cine.landed) {
                cine.landed = true;                          // HANTAMAN ke pelataran
                addCamShake(6);
                playSFX(sfxExplode, 0.55);
                for (let i = 0; i < 8; i++) {
                    const a = Math.random() * 6.283, r = 10 + Math.random() * 22;
                    spawnGroundPuff(HELI_POS.x + Math.sin(a) * r, HELI_POS.z + Math.cos(a) * r,
                        0x7a6f5e, 5 + Math.random() * 4, 3);
                }
            }
            aimTurretAtHeli(0, dt);
            if (k >= 1) {
                cine.from = { x: tank.parts.group.position.x, z: tank.parts.group.position.z };
                cine.to = { x: BOSS_POS.x, z: BOSS_POS.z };
                next('advance');
            }

        } else if (P === 'advance') {
            // ===== SHOT 9 "MENGGILAS MAJU": tank berjalan melewati bangkai yang
            // berkobar menuju BOSS_POS sementara kamera MENGORBIT pelan & meninggi
            // — arena duel diperlihatkan sekali lagi, kini dengan pemiliknya.
            const dur = SEC('advanceSec', 2.8);
            const k = clamp01(cine.t / dur);
            const e = smooth(k);
            shotCam(SHOT.crashEnd, SHOT.advanceEnd, e);
            tank.parts.group.position.x = lerp(cine.from.x, cine.to.x, e);
            tank.parts.group.position.z = lerp(cine.from.z, cine.to.z, e);
            const wantHull = driveYaw(cine.from, cine.to);
            tank.hullYaw = approachAngle(tank.hullYaw, wantHull, 2.4 * dt);
            tank.parts.group.rotation.y = tank.hullYaw;
            cineTracksDust(dt, false);
            aimTurretAtHeli(0, dt);
            // Fokus MELEPAS bangkai dan mengalir ke tank yang bergerak (bukan
            // menjentik ke tank di frame pertama shot).
            const tp = tank.parts.group.position;
            aimFocus(lerp(HELI_POS.x, tp.x, e), lerp(HELI_POS.z, tp.z, e));
            faceAction(tp.x, tp.z);
            if (k >= 1) {
                cutTo(SHOT.advanceEnd, BOSS_POS.x, BOSS_POS.z);   // sudut sama; hanya fokus dipaku ke tank
                cine.snap = false;                                 // (bukan potongan — jangan menjentik)
                next('faceOff');
            }

        } else if (P === 'faceOff') {
            // ===== SHOT 10 "KARTU BOSS" (BARU): badan berputar di poros ke
            // orientasi duel DAN turret meninggalkan bangkai untuk MENGUNCI PLAYER,
            // sementara kamera jatuh ke hero angle rendah di DEPAN tank — laras
            // menatap lurus ke lensa. Ini kartu judul bossnya.
            const k = clamp01(cine.t / SEC('faceOffSec', 1.4));
            shotCam(SHOT.advanceEnd, SHOT.faceOffEnd, smooth(k));
            aimFocus(BOSS_POS.x, BOSS_POS.z);
            tank.hullYaw = approachAngle(tank.hullYaw, 0, 2.2 * dt);
            tank.parts.group.rotation.y = tank.hullYaw;
            if (Math.abs(tank.hullYaw) > 0.01) cineTracksDust(dt, false);
            // Turret BERPALING dari bangkai ke PLAYER (dulu ia terus membidik
            // bangkai sampai cutscene selesai — bossnya tak pernah "melihat" kita).
            aimTurretAt(cine.player.x, cine.player.z, 1.9, dt);
            faceAction(BOSS_POS.x, BOSS_POS.z);
            if (k >= 1) {
                hideCineCaption(); cine.caption = null;
                startBossMusic(); musicOn = true;   // musik duel naik SEBELUM kontrol pulih
                next('panBack');
            }

        } else if (P === 'panBack') {
            // ===== SHOT 11 "SERAH-TERIMA": fokus kembali ke player dan sudut
            // kamera MENDARAT PERSIS di kamera gameplay (CAM_OFF_DEFAULT), jadi
            // saat kendali pulih tak ada jentikan sudut sama sekali. Pola yang
            // sama dipakai kedua cutscene pembuka.
            const k = clamp01(cine.t / SEC('panBackSec', 2.2));
            // Target shot penutup DICAPAI di 80% durasi: sisa 20% dipakai peredaman
            // untuk MENGEJAR HABIS sisa jaraknya, jadi frame terakhir benar-benar
            // duduk di CAM_OFF_DEFAULT (tanpa ini kamera menyerah ~5 unit meleset
            // dan duel dibuka dgn sedikit jentikan).
            const e = smooth(clamp01(k / 0.8));
            shotCam(SHOT.faceOffEnd, SHOT.handoff, e);
            aimFocus(lerp(BOSS_POS.x, cine.player.x, e), lerp(BOSS_POS.z, cine.player.z, e));
            faceAction(BOSS_POS.x, BOSS_POS.z);   // player tetap menatap tank
            aimTurretAt(cine.player.x, cine.player.z, 1.9, dt);   // laras TERKUNCI di player sampai duel mulai
            // Framing menunggu bila typewriter Gibran belum selesai; boss fight
            // tidak memotong reaksi terakhir meskipun cps di-retune lebih lambat.
            if (k >= 1 && !dialogueCurrent && !dialogueQueue.length) { endCutscene(); return; }
        }

        // kilat moncong meluruh (updateTank fase 'cine' tak berjalan)
        if (tank && cine.phase !== 'fire') tank.parts.cannonFlash.material.opacity *= 0.86;
        // Kamera + kabut + titik fokus MENGEJAR targetnya — SATU titik terapan utk
        // semua fase, jadi tak ada batas shot yang bisa lolos tanpa diredam. `snap`
        // (di-set cutTo) memindahkannya seketika = POTONGAN film.
        settleAll(dt, cine.snap);
        cine.snap = false;
    }

    // Pindah fase (timer di-nol-kan di satu tempat saja).
    function next(phase) { cine.phase = phase; cine.t = 0; }

    // Heli MENCOBA LEPAS LANDAS: naik ke `y`, hidung sedikit mendongak & badan
    // miring — gerak panik pilot yang sadar ia sedang dibidik.
    function liftHeli(y, k) {
        if (!heli || heliDead) return;
        const g = heli.parts.group;
        g.position.y = y;
        g.rotation.x = -0.10 * k;
        g.rotation.z = 0.09 * Math.sin(k * 5.4);
    }

    function endCutscene() {
        clearShell();
        cine = null; cutsceneDone = true;
        hideCutsceneSkip();   // tombol skip hilang bersama cutscene (2026-07-19)
        hideCineCaption();
        hideStageRadioDialogue();
        setCineFocus(null);
        setCineBars(false);
        setCinematicActive(false);
        restoreFog();
        tank.hullYaw = 0;
        tank.parts.group.rotation.y = 0;
        tank.phase = 'battle';
        tank.cd = (CFG.campaign.bosses.tank.gapSec || 5) + 0.8;   // jeda napas sebelum serangan pertama
        if (!musicOn) { startBossMusic(); musicOn = true; }        // DUEL dimulai -> musik boss-fight (2026-07-19; berhenti di stage4.onBossDown)
        showStageMsg('A WAR TANK GUARDS THE TOWN SQUARE — DESTROY IT!');
        updateUI();
    }

    // Kabut per-shot dikembalikan ke setelan global stage 4 (yang di-set
    // exitCityEnv/applyLightPreset) — cutscene tak boleh meninggalkan jejak.
    function restoreFog() {
        if (savedFog && scene && scene.fog) { scene.fog.near = savedFog.near; scene.fog.far = savedFog.far; }
        savedFog = null;
    }

    // Per-frame (dipanggil stage4.updateMode): update rotor/asap heli, picu
    // kedatangan heli saat semua robot mati, jalankan mesin cutscene.
    function update(dt) {
        updateDialogue(dt);
        if (heli) updateHelicopter(heli, dt);
        if (!heliSpawned) {
            if (countStageRobots(4) === 0) heliArrives();
        } else if (cine) {
            runCutscene(dt);
        }
    }

    // Reset (dipanggil stage4.enter): buang heli/bangkai + blocker-nya, batalkan
    // sinematik yang mungkin tengah berjalan (restart/cheat). Tank TIDAK dibuang
    // di sini — stage4 yang men-disposeTank sebelum memanggil reset().
    function reset() {
        if (heli) { disposeHelicopter(heli); heli = null; }
        if (heliBlocker) {
            const hb = blockers.indexOf(heliBlocker);
            if (hb >= 0) blockers.splice(hb, 1);
            heliBlocker = null;
        }
        heliSpawned = false; cutsceneDone = false; heliDead = false; musicOn = false;
        clearShell();
        cine = null;
        restoreFog();
        stopLoopSFX(heliSnd); heliSnd = null;   // loop heli mati bila cutscene dibatalkan (restart/cheat)
        resetDialogue();
        hideCutsceneSkip();
        hideCineCaption();
        setCineFocus(null); setCineBars(false); setCinematicActive(false);
        tank = null;
    }

    return {
        update, start, reset, skip,
        dialogueDebug,
        currentHeli: () => heli,
        // Hook kamera per-scene: stage4 mendelegasikan `camOffset` ke sini.
        // null selagi cutscene TIDAK aktif -> renderer memakai CAM_OFF_DEFAULT
        // (gameplay) persis seperti sebelum modul ini punya kamera sendiri.
        camOffset: () => (cine ? camOff : null),
        cineDebug: () => ({
            active: !!cine, phase: cine ? cine.phase : null, done: cutsceneDone,
            wreckClear: WRECK_CLEAR, heliX: HELI_POS.x, heliZ: HELI_POS.z,
            caption: cine ? cine.caption : null,
            focus: { x: focus.x, z: focus.z },
            cam: { x: camOff.x, y: camOff.y, z: camOff.z },
            heliY: heli ? heli.parts.group.position.y : null,
            tankFrom: { ...TANK_FROM }, tankFire: { ...TANK_FIRE },
        }),
        isHeliSpawned: () => heliSpawned,
        isActive: () => !!cine,
        isDone: () => cutsceneDone,
    };
}
