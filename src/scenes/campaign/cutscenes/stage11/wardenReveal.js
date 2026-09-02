// CUTSCENE: KEMUNCULAN NUSANTARA WARDEN — Stage 11 bab 3 (root hall).
//
// PAPAN SHOT (permintaan user 2026-09-02, empat shot persis):
//   1. close-up Major Gibran yang sedang mengupload file di komputer,
//   2. close-up LAYAR komputer: uploadnya berhenti di 70%,
//   3. close-up bos Warden yang datang dengan cara TURUN DARI ATAS,
//   4. close-up Major Gibran, dan ia berkata "This never gets any easier."
//
// ATURAN KERAS (sama seperti cutscene keberangkatan/kedatangan Stage 5 — jangan
// "dirapikan"):
//   * PERPINDAHAN ANTAR SHOT = POTONGAN. `cutTo()` menulis ofset kamera +
//     `setCineFocus(..., snap)` SEKALI, lalu tidak ada yang menyentuhnya lagi:
//     tidak ada pan, tidak ada dolly, tidak ada fade di dalam cutscene.
//   * SHOT 1, 2 dan 4 LOCKED-OFF. Yang bergerak hanya ISINYA — bar upload yang
//     merangkak dan tubuh Gibran.
//   * SHOT 3 ADALAH SATU-SATUNYA SHOT YANG KAMERANYA BERGERAK, dan itu
//     disengaja (permintaan user 2026-09-02 "buat agar kamera mengikuti
//     pergerakan warden, jadi warden akan terus ada di fokus kamera"). Ia
//     MENGIKUTI bos: titik bidiknya mengejar pusat badan Warden dari atap
//     sampai lantai — dan mengejar x/z-nya juga, jadi bos yang melangkah pun
//     tak akan meninggalkan bingkai. Ia tetap SEJAJAR sepanjang jalan
//     (`cam.y` ikut diperbarui tiap frame), dan tetap tanpa fade.
//
// TIGA HAL YANG DITURUNKAN, BUKAN DIKETIK:
//   * "70%" TIDAK PERNAH ditulis di sini maupun di naskah dialog. Angkanya
//     adalah `CFG.campaign.stage11.upload.preBossFraction` — SATU nilai yang
//     sudah dipakai gameplay untuk menahan siaran selama bos hidup. Cutscene ini
//     hanya membawa bar sampai ke sana, jadi menyetel ulang config memindahkan
//     shot 2 dan pertarungannya sekaligus, dan keduanya tak mungkin berselisih.
//   * Lama shot 3 = `descent.sec` MILIK BOS + `descentHoldSec`. Tinggi dan lama
//     jatuhnya adalah properti Warden (entities/nusantaraWarden.js), bukan
//     properti kamera yang kebetulan menontonnya.
//   * Shot 4 tidak dipatok timer: ia menunggu antrean dialog benar-benar habis,
//     lalu menahan `lineHoldSec`.
//
// Modul ini tidak tahu apa pun soal alur Stage 11 selain hook yang di-inject
// root.js (`getWarden`/`setUpload`/`onComplete`).

import { CFG } from '../../../../core/config.js';
import { setCinematicActive } from '../../../../core/state.js';
import { camera, viewCam, setCineFocus } from '../../../../core/renderer.js';
import { setCineBars, showCutsceneSkip, hideCutsceneSkip } from '../../../../core/dom.js';
import { releaseInputs, aimPoint } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { playSFX, sfxRobotSpawn } from '../../../../utils/sfx.js';
import {
    activateNusantaraWarden, nusantaraWardenEnvelope,
} from '../../../../entities/nusantaraWarden.js';
import {
    S11_INSERT, S11_INSERT_STAND, S11_WARDEN_HOME,
    S11_CONSOLE_SCREEN, holdStage11RootOccluders,
} from '../../stages/stage11/rootWorld.js';
import {
    queueStage11Dialogue, stage11DialogueIdle, stage11DialogueDebug,
} from '../../stages/stage11/runtime.js';

export const S11_REVEAL_SHOTS = Object.freeze(['insert', 'screen', 'descent', 'line']);

// Layar utama konsol: satu-satunya readout yang dibingkai shot 2. Geometrinya
// DIIMPOR dari dunia (`S11_CONSOLE_SCREEN`), bukan disalin — panel yang diubah
// ukurannya akan memindahkan shot ini bersamanya.
const SCREEN = S11_CONSOLE_SCREEN;
// Berapa kali lebih besar bingkai kamera dibanding BEZEL layar. > 1 = seluruh
// bezel masuk DENGAN sisa ruang di sekelilingnya (permintaan user 2026-09-02:
// "ada sedikit lebihan untuk melihat bezel layar komputernya"); jarak shot 2
// diturunkan dari angka ini, tidak pernah diketik sebagai ofset.
const SCREEN_SHOT_MARGIN = 1.35;
// Berapa kali lebih besar bingkai dibanding selubung gambar Warden. Lebih kecil
// dari margin layar: bos ini jauh lebih lebar daripada tinggi (kaki terentang),
// jadi memberi sisa 35% pada bentangnya akan mendorong kamera terlalu jauh dan
// mengubah shot pengikut menjadi shot lebar.
const WARDEN_SHOT_MARGIN = 1.15;
// Kelambatan kamera mengikuti bos. Bukan kunci kaku: sedikit tertinggal membuat
// jatuhnya terasa punya bobot dan meredam getaran hover, sementara bingkainya
// tetap jauh lebih besar dari bosnya sehingga ia tak pernah keluar frame.
const FOLLOW_RATE = 7;

// Ofset kamera per shot, RELATIF titik fokus shot itu, dan SETIAP SHOT SEJAJAR
// (permintaan user 2026-09-02 "eye level"): tingginya tidak diketik, melainkan
// `lookY - tinggi mata player`, sehingga kamera duduk PERSIS pada ketinggian
// yang dibidiknya dan sumbu pandangnya benar-benar nol derajat. Menyalin sebuah
// angka y ke sini akan diam-diam memiringkan shot begitu lantai berubah — mata
// player berdiri di atas alas komputer setinggi 8.8 unit, bukan di y=0.
//
// `lookY` = ketinggian dunia yang dibidik (hook `camLookY` renderer); `'eye'`
// berarti setinggi mata Gibran, dibaca hidup dari pivot.
//
// SHOT 1 memandang dari SISI. Komputernya berdiri persis di sisi -x Gibran dan
// deck sentuhnya menjulur SAMPAI setinggi matanya, jadi kamera "dari depan" di
// sini akan berada di dalam — atau di balik — badan komputer. Profil sejajar
// mata adalah satu-satunya sudut yang memperlihatkan wajahnya sekaligus layar
// yang sedang ia kerjakan.
//
// SHOT 4 justru DARI DEPAN dan seluruh badan: kamera berdiri di sisi +x (tak
// ada apa pun antara ia dan Gibran) dan Gibran BERBALIK menghadapnya, dengan
// Warden yang baru mendarat mengisi latar di belakangnya. Jaraknya (~30 unit)
// diambil supaya setengah-tinggi bingkai melebihi tinggi tubuhnya di atas alas,
// jadi kakinya tidak pernah terpotong.
const SHOT_CAM = Object.freeze({
    insert: Object.freeze({ x: 6, z: 18, lookY: 'eye', face: 'console' }),
    // Tepat di depan layar utama dan sejajar dengannya. `fit: 'screen'` berarti
    // JARAKNYA DIHITUNG dari bezel yang benar-benar digambar (lihat `fitScreen`)
    // alih-alih diketik, jadi seluruh layar plus pinggiran bezelnya selalu masuk
    // bingkai — di rasio layar mana pun.
    screen: Object.freeze({ x: 0, z: 0, lookY: SCREEN.y, fit: 'screen' }),
    // SHOT PENGIKUT — satu-satunya shot yang kameranya bergerak, dan itu
    // disengaja (permintaan user 2026-09-02 "buat agar kamera mengikuti
    // pergerakan warden"). Jaraknya DITURUNKAN dari selubung gambar bos, dan
    // titik bidiknya mengejar pusat badannya turun dari atap sampai lantai.
    descent: Object.freeze({ x: 1, z: 1, lookY: 0, fit: 'warden', follow: 'warden' }),
    line: Object.freeze({ x: 27, z: 13, lookY: 'eye', face: 'camera' }),
});
// Setengah-tinggi bingkai per unit jarak, DITURUNKAN dari fov kamera render
// yang sebenarnya — bukan konstanta 0.466 yang dibulatkan. Satu sumber: jarak
// shot 2 dihitung dari angka ini DAN bingkai yang diterbitkan debug diukur
// dengannya, jadi keduanya tak mungkin meleset sepersekian unit. Shot 3 memakai
// lookY 70 pada jarak ~150, sehingga bingkainya menutup y 0..140 — di atas
// tinggi jatuh 130, itulah sebabnya seluruh turunnya terlihat tanpa kamera
// bergerak sedikit pun.
const frameHalfPerUnit = () =>
    Math.tan(((viewCam && viewCam.fov) || 50) * Math.PI / 180 * .5);

const REV = () => CFG.campaign.stage11.wardenReveal;
const UPLOAD_CAP = () => CFG.campaign.stage11.upload.preBossFraction;
const DESCENT = () => CFG.campaign.bosses.warden.descent;
const clamp01 = k => (k < 0 ? 0 : k > 1 ? 1 : k);
const smooth = k => k * k * (3 - 2 * k);

export function createStage11WardenReveal({ getWarden, setUpload, onComplete }) {
    let shot = -1, t = 0, hold = -1, active = false, done = false;
    let landed = false, progress = 0, skipped = false;
    const cam = { x: 0, y: 0, z: 0 };
    let lookY = null;

    // Tinggi MATA Gibran = pivot player. Dibaca hidup, tidak pernah diketik:
    // ia berdiri di atas alas komputer, bukan di lantai aula.
    const eyeY = () => camera.position.y;
    // Yaw avatar. `avatarGroup.rotation.y = yaw` memetakan +z lokal ke
    // (sin yaw, cos yaw), jadi menghadap sebuah arah (dx,dz) = atan2(dx, dz).
    // 'console' = menghadap komputer (dan, kemudian, Warden — keduanya di -x);
    // 'camera' = BERBALIK menghadap lensa, yang membuat shot 4 "dari depan".
    function faceYaw(mode) {
        if (mode === 'camera') return Math.atan2(cam.x, cam.z);
        return Math.atan2(S11_INSERT.x - S11_INSERT_STAND.x, 0);
    }

    // Mundur secukupnya agar SELURUH bezel layar masuk bingkai dengan sisa
    // ruang. Diuji terhadap KEDUA sumbu: tinggi memakai fov vertikal, lebar
    // memakai fov vertikal x aspek, sehingga jendela yang sempit (aspek kecil)
    // otomatis mundur lebih jauh alih-alih memotong sisi layar.
    function fitScreenDistance() {
        const tanY = frameHalfPerUnit();
        const aspect = (viewCam && viewCam.aspect) || 1.6;
        return Math.max(
            SCREEN.bezelH * .5 * SCREEN_SHOT_MARGIN / tanY,
            SCREEN.bezelW * .5 * SCREEN_SHOT_MARGIN / (tanY * Math.max(.2, aspect)),
        );
    }

    // Jarak yang memuat SELUBUNG GAMBAR Warden utuh dengan sisa ruang; sama
    // seperti shot layar, kedua sumbu diuji supaya jendela sempit mundur
    // sendiri alih-alih memotong ujung kakinya.
    function fitWardenDistance() {
        const env = nusantaraWardenEnvelope();
        const tanY = frameHalfPerUnit();
        const aspect = (viewCam && viewCam.aspect) || 1.6;
        return Math.max(
            env.top * .5 * WARDEN_SHOT_MARGIN / tanY,
            env.spanRadius * WARDEN_SHOT_MARGIN / (tanY * Math.max(.2, aspect)),
        );
    }

    // Titik bidik shot pengikut: PUSAT BADAN bos, bukan pangkal grupnya —
    // membidik y=0 miliknya akan menaruhnya seluruhnya di paruh atas layar.
    function wardenFocusY() {
        const w = getWarden();
        return (w?.parts?.group?.position?.y || 0) + nusantaraWardenEnvelope().centreY;
    }

    // Ofset datar shot pengikut, dipertahankan arahnya (azimuth tenggara yang
    // sama dengan kamera bab) sambil jaraknya diturunkan dari selubung bos.
    function placeFollowCam() {
        const d = fitWardenDistance();
        const h = Math.sqrt(Math.max(1, d * d - cam.y * cam.y));
        const k = Math.hypot(SHOT_CAM.descent.x, SHOT_CAM.descent.z) || 1;
        cam.x = SHOT_CAM.descent.x / k * h;
        cam.z = SHOT_CAM.descent.z / k * h;
    }

    function cutTo(index) {
        shot = index; t = 0; hold = -1;
        const key = S11_REVEAL_SHOTS[index], c = SHOT_CAM[key];
        lookY = c.fit === 'warden' ? wardenFocusY()
            : c.lookY === 'eye' ? eyeY() : c.lookY;
        // SEJAJAR: kamera duduk tepat pada ketinggian yang dibidik.
        cam.x = c.x; cam.z = c.z; cam.y = lookY - eyeY();
        if (c.fit === 'screen') {
            // Ketinggiannya sudah dipatok oleh aturan sejajar, jadi sisa
            // jaraknya diambil di bidang datar.
            const d = fitScreenDistance();
            cam.x = Math.sqrt(Math.max(1, d * d - cam.y * cam.y));
        }
        if (key === 'insert') {
            setCineFocus(S11_INSERT_STAND.x - 3, S11_INSERT_STAND.z, true);
            setAvatarRadioPose(true, faceYaw(c.face), 'consoleWork', 0);
            queueStage11Dialogue('insertDrive');
        } else if (key === 'screen') {
            setCineFocus(S11_INSERT.x + SCREEN.dx, S11_INSERT.z, true);
            queueStage11Dialogue('uploadAccepted');
            queueStage11Dialogue('uploadStalled');
        } else if (key === 'descent') {
            setCineFocus(S11_WARDEN_HOME.x, S11_WARDEN_HOME.z, true);
            // Bos MENGGANTUNG dulu di ketinggian atap, baru jatuh. Tinggi,
            // hover dan lama jatuhnya milik Warden; cutscene membingkainya.
            activateNusantaraWarden(getWarden(), null, { drop: true });
            // Dibingkai SESUDAH ia lahir: frame pertama shot ini sudah
            // memperlihatkannya di atap, bukan lantai kosong yang lalu disusul.
            lookY = wardenFocusY(); cam.y = lookY - eyeY(); placeFollowCam();
            playSFX(sfxRobotSpawn, .6);
        } else {
            setCineFocus(S11_INSERT_STAND.x - 2, S11_INSERT_STAND.z, true);
            setAvatarRadioPose(true, faceYaw(c.face), 'wardenSighted', 0);
            queueStage11Dialogue('wardenSighted');
        }
    }

    // Bidik avatar mengikuti cutscene: playerAvatar membaca `aimPoint` untuk yaw
    // normalnya, dan input sudah beku, jadi override ini tak melawan kursor.
    function faceTo(x, z) {
        if (aimPoint) aimPoint.set(x, camera.position.y - CFG.player.eyeHeight, z);
    }

    // Tubuhnya berakting mengikuti progres huruf kalimat yang sedang diketik,
    // bukan mematung satu pose sepanjang shot.
    function syncPose(gesture) {
        const line = stage11DialogueDebug();
        const p = line.text && line.text.length ? line.chars / line.text.length : 0;
        setAvatarRadioPose(true, faceYaw(SHOT_CAM[S11_REVEAL_SHOTS[shot]]?.face),
            gesture, clamp01(p));
    }

    function finish() {
        if (!active) return;
        active = false; done = true; shot = -1; hold = -1;
        // SKIP harus mendarat pada keadaan yang SAMA dengan menonton sampai
        // habis: bar tepat di batasnya, bos benar-benar berdiri di lantai.
        progress = UPLOAD_CAP(); setUpload?.(progress);
        const w = getWarden();
        if (w && !w.active) activateNusantaraWarden(w, null, { drop: false });
        if (w && w.phase === 'descent') {
            w.parts.group.position.y = 0; w.landed = true;
            w.phase = 'reveal'; w.phaseT = 0;
        }
        setAvatarRadioPose(false); holdStage11RootOccluders(false);
        setCineFocus(null); setCineBars(false); setCinematicActive(false);
        hideCutsceneSkip(); releaseInputs(); clearMoveTarget();
        onComplete?.({ skipped });
    }

    function start() {
        if (active || done) return false;
        active = true; skipped = false; landed = false; progress = 0;
        releaseInputs(); clearMoveTarget();
        setCinematicActive(true); setCineBars(true);
        // Komputer adalah SUBJEK shot 1-2: tahan seluruh occluder bab ini tetap
        // pekat, atau fade gameplay akan melarutkan benda yang sedang disorot.
        holdStage11RootOccluders(true);
        faceTo(S11_INSERT.x, S11_INSERT.z);
        showCutsceneSkip(() => { skipped = true; finish(); });
        cutTo(0);
        return true;
    }

    function update(dt) {
        if (!active) return;
        t += dt;
        const R = REV(), key = S11_REVEAL_SHOTS[shot];
        if (key === 'insert') {
            // Bar merangkak dari 0 sampai batasnya SEPANJANG shot ini, jadi
            // pemain melihat siarannya benar-benar berjalan sebelum berhenti.
            const sec = Math.max(.1, R.insertSec);
            progress = UPLOAD_CAP() * smooth(clamp01(t / sec));
            setUpload?.(progress);
            syncPose('consoleWork');
            if (t >= sec) cutTo(1);
            return;
        }
        if (key === 'screen') {
            // BERHENTI: nilainya dipatok tepat di batas config dan tidak
            // bergerak lagi — inilah "upload terhenti di 70%".
            progress = UPLOAD_CAP(); setUpload?.(progress);
            if (t >= Math.max(.1, R.screenSec)) cutTo(2);
            return;
        }
        if (key === 'descent') {
            // KAMERA MENGIKUTI BOS. Titik bidik mengejar pusat badannya dengan
            // sedikit kelambatan, dan `cam.y` ikut supaya shot tetap SEJAJAR
            // sepanjang turunnya; fokus mendatarnya juga mengejar, jadi bos yang
            // nanti melangkah tidak akan meninggalkan bingkai.
            const target = wardenFocusY();
            lookY += (target - lookY) * (1 - Math.exp(-FOLLOW_RATE * dt));
            cam.y = lookY - eyeY(); placeFollowCam();
            const wp = getWarden()?.parts?.group?.position;
            if (wp) setCineFocus(wp.x, wp.z, false);
            // Dibaca LANGSUNG dari rig, bukan lewat `nusantaraWardenDebug` —
            // debug bos memetakan seluruh kapasitor/kopling, jadi memanggilnya
            // tiap frame berarti alokasi per frame di dalam loop render.
            const w = getWarden();
            // Guncangan/ledakan/debu benturan milik rig bos (`onLand`); di sini
            // hanya beat naratifnya, supaya tidak ada dua guncangan bertumpuk.
            if (!landed && w && w.landed) { landed = true; queueStage11Dialogue('wardenWake'); }
            const D = DESCENT();
            if (t >= Math.max(0, D.hoverSec || 0) + Math.max(.1, D.sec)
                + Math.max(0, R.descentHoldSec)) cutTo(3);
            return;
        }
        syncPose('wardenSighted');
        if (hold < 0) { if (stage11DialogueIdle()) hold = 0; }
        else if ((hold += dt) >= Math.max(0, R.lineHoldSec)) finish();
    }

    function reset() {
        if (active) {
            setAvatarRadioPose(false); holdStage11RootOccluders(false);
            setCineFocus(null);
            setCineBars(false); setCinematicActive(false); hideCutsceneSkip();
        }
        active = false; done = false; skipped = false;
        shot = -1; t = 0; hold = -1; landed = false; progress = 0;
    }

    return {
        start, update, reset,
        isActive: () => active,
        isDone: () => done,
        camOffset: () => (active ? cam : null),
        camLookY: () => (active ? lookY : null),
        uploadProgress: () => progress,
        // Dipanggil tiap frame oleh root.js -> jangan lewat `debug()`, yang
        // membangun objek baru.
        isStalled: () => active && S11_REVEAL_SHOTS[shot] === 'screen',
        debug: () => ({
            active, done, skipped, shot,
            shotKey: shot >= 0 ? S11_REVEAL_SHOTS[shot] : null,
            shots: S11_REVEAL_SHOTS.length, t, hold, landed, progress,
            stalled: active && S11_REVEAL_SHOTS[shot] === 'screen',
            wardenY: getWarden()?.parts?.group?.position?.y ?? null,
            uploadCap: UPLOAD_CAP(),
            cam: { ...cam, lookY },
            // Bingkai shot yang sedang berjalan, diukur dari ofset kamera
            // sendiri: dipakai tes untuk membuktikan shot 3 memuat titik lahir
            // di atas DAN lantai, dan bahwa tiap shot benar-benar sejajar.
            frame: shot >= 0 ? (() => {
                const d = Math.hypot(cam.x, cam.y, cam.z);
                const hh = d * frameHalfPerUnit();
                return {
                    level: Math.abs(cam.y - (lookY - camera.position.y)) < 1e-9,
                    distance: d, halfHeight: hh,
                    top: lookY + hh, bottom: lookY - hh,
                };
            })() : null,
            screenFocus: { x: S11_INSERT.x + SCREEN.dx, y: SCREEN.y,
                bezelH: SCREEN.bezelH, bezelW: SCREEN.bezelW,
                margin: SCREEN_SHOT_MARGIN, fitDistance: fitScreenDistance() },
            descent: { ...DESCENT() },
            // Shot pengikut: titik bidik hidup + selubung bos yang membingkainya.
            follow: { lookY, targetY: shot >= 0
                && SHOT_CAM[S11_REVEAL_SHOTS[shot]]?.follow === 'warden'
                ? wardenFocusY() : null,
            envelope: nusantaraWardenEnvelope(), margin: WARDEN_SHOT_MARGIN,
            fitDistance: fitWardenDistance() },
        }),
    };
}
