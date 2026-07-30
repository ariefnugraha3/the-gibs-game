// SCENE: PROLOG campaign — "THE WAR ROOM" (HOLOGRAM IN-ENGINE, 2026-08-04,
// permintaan user). Diputar PALING AWAL, SEBELUM cutscene heli (cutscenes/intro.js),
// HANYA pada start campaign BARU (gerbang `playIntro` di main.js).
//
// ===== KENAPA BENTUKNYA BEGINI (dua versi sebelumnya DITOLAK user) =====
// v1 (2026-07-30..08-02): sembilan KARTU era di <canvas> 2D + teks DOM. Teman user
//     menyebutnya "slideshow presentasi jualan barang, sama sekali tidak seperti game".
// v2 (2026-08-03): kartu dihapus, kesembilan era dijadikan SATU mural panjang yang
//     dilewati kamera tanpa henti (counter, fade antar era, zoom Ken-Burns dibuang).
//     Vonis user: "masih jelek".
// DIAGNOSIS: masalahnya BUKAN komposisi, tapi MEDIUM. Selama prolog digambar di
//     kanvas 2D, ia tetap terbaca sebagai motion-graphic, bukan game — gamenya
//     sendiri 3D dgn lighting/fog/bloom dan robot yang berjalan. Preseden di repo
//     ini sudah membuktikan arahnya: intro Survival dulu slideshow DOM, diganti
//     sinematik in-engine (survival/cutscenes/monasIntro.js), dan keluhan itu hilang.
// v3 = INI: prolog jadi SCENE THREE sungguhan. Satu RUANG KOMANDO gelap, satu
//     HOLOTABLE di tengah, dan SATU shot kamera yang mengorbit meja itu dari awal
//     sampai akhir. Tiap era diproyeksikan di atas meja sebagai hologram (kota,
//     emblem, robot pekerja, jet, lini perakitan, barisan pasukan, peta kepulauan),
//     ditonton siluet perwira yang berdiri di sekelilingnya. Hologram memberi
//     ALASAN kenapa bentuknya sederhana — jadi terbaca sengaja, bukan keterbatasan.
//     Pergantian era BUKAN ganti slide: proyeksi lama MELIPAT turun ke dalam meja
//     sementara yang baru TERBIT dari meja (scale.y), kamera terus berjalan.
//
// ===== NASKAH — MILIK USER, KATA PER KATA =====
// `PROLOGUE_CHAPTERS` = naskah resmi user (2026-08-02), disalin PERSIS: tak ada
// kata/tanda baca yang boleh diubah, dipadatkan, atau ditambah. Dipatok assert
// "PROLOG NASKAH" (perbandingan STRING PERSIS) di tools/smoke.mjs. Naskahnya
// ber-markup (`**tebal**`, `*miring*`, baris kosong = paragraf; kartu 2045 dua
// paragraf) → `renderInline` menulisnya ke `#prologueBody.innerHTML`, BUKAN
// textContent (itu akan menampilkan bintang mentah). Teks tampil sebagai takarir
// DOM di atas pita letterbox — tanpa kotak, tanpa penghitung slide.
//
// ===== MEKANIK (pola sama dgn intro campaign & intro Survival) =====
// * Scene NON-GAMEPLAY: semua hook gameplay no-op; `cinematicActive` (sudah di-set
//   beginIntro) membekukan kendali player, sementara `updateGame` TETAP memanggil
//   `updateMode` — mesin sinematik ada di sana. Mesin BERBASIS TIMER (deterministik,
//   bisa diuji headless tanpa RAF).
// * Durasi tiap era = `chapterTotal(i)` = fadeIn + `holdFor(i)` + fadeOut, yaitu
//   waktu baca yang MENGIKUTI panjang naskahnya (config-driven, lihat holdFor).
// * `camera` = PIVOT LOGIKA; sudut kamera per beat lewat hook `camOffset` (objek
//   `camOff` yg sama dimutasi `setCam`) — persis cara monasIntro.js. Azimut naik
//   MONOTON 24° → 248° sepanjang prolog: satu orbit panjang, tanpa satu pun potongan.
// * Titik fokus = pusat meja untuk era 2028-2044; di era 2045 fokus PAN ke siluet
//   MAJOR GIBRAN yang sejak awal berdiri di ujung ruangan (kamera baru menemukannya
//   di akhir) — itu frame serah-terima ke cutscene heli.
// * DUNIA: ruang komando dibangun SEKALI di x≈150000 (jauh dari dunia survival &
//   keempat dunia campaign, pola yang sama), `lightsKey` SENGAJA sama dgn
//   introScene ('campaign-intro') supaya set lampu TIDAK berubah saat prolog mulai
//   maupun saat diserahkan ke intro = tak ada rekompilasi shader (invarian).
//   Ruangannya TIDAK memakai PointLight sama sekali: yang "menyalakan" ruangan
//   adalah material hologram (MeshBasicMaterial aditif) + ambient/hemi yang sudah ada.
// * SERAH-TERIMA: `resumeScene(introScene)` — sengaja BUKAN setScene, supaya
//   `introScene.enter()` (yang menyimpan fog asli & membangun dunia atap/kota) tidak
//   jalan dua kali; mesin heli sudah dipersenjatai beginIntro() di balik layar loading.
//
// KONTROL: KLIK layar → maju-cepat ke era berikutnya (kamera dipercepat, bukan
// dipotong). Tombol SKIP / SPACE / Enter / Esc → lompati SELURUH prolog.
//
// WARNA: wajib token PAL (aturan GIBS 2045) — hologram = TEAL `PAL.tech`, aksen
// manusia = AMBER `PAL.amber`, status dibajak = `PAL.hazard` (merah-bata, BUKAN
// merah mata robot 0xff2020 yang sakral).

import { CFG } from '../../../core/config.js';
import {
    scene, camera, viewCam, renderer, composer, postFxOn, setCineFocus, followViewCam
} from '../../../core/renderer.js';
import { resumeScene } from '../../../core/sceneManager.js';
import { setCinematicActive } from '../../../core/state.js';
import { setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip } from '../../../core/dom.js';
import { releaseInputs } from '../../../core/input.js';
import { PAL } from '../../../world/palette.js';
import { playSFX, sfxSwitch } from '../../../utils/sfx.js';
import { introScene } from './intro.js';

// ===== DATA ERA (teks WAJIB English; komentar Indonesia). Tiap kartu:
//   year/title/body — NASKAH RESMI USER, disalin PERSIS (2026-08-02). `year`+`title`
//     = baris judul naskah dipecah di ':' pertama; `body` = paragrafnya apa adanya.
//   holo — kunci diorama hologram yang mengilustrasikan era itu di atas meja.
// Urutan & entitas = KONTRAK yang diuji smoke. =====
export const PROLOGUE_CHAPTERS = [
    {
        year: 'Indonesia 2028', title: 'The Era of Digital Awakening',
        body: 'Global Artificial Intelligence (AI) development accelerates uncontrollably. Realizing that being left behind means death, the Indonesian Government takes a bold step: Indonesia must become a creator, no longer just a consumer. The digital revolution officially begins.',
        holo: 'city'
    },
    {
        year: 'Indonesia 2029', title: 'The Birth of a New Giant',
        body: 'The government gathers hundreds of the best IT and machine learning experts. A new State-Owned Enterprise is established: **PT N.U.S.A (Nusantara Universal Sistem Automasi)**. Its sole mission is to create a national pride Super AI capable of surpassing foreign technological dominance.',
        holo: 'institute'
    },
    {
        year: 'Indonesia 2030', title: 'The Southeast Asian Consortium',
        body: 'Through strategic collaboration with ASEAN countries, PT N.U.S.A successfully births an integrated artificial intelligence system named **G.A.R.U.D.A** (*General Artificial Reasoning & Utility Digital Architecture*). This system is exceptionally brilliant, placing Indonesia at the pinnacle of global technological innovation.',
        holo: 'garuda'
    },
    {
        year: 'Indonesia 2032 - 2035', title: 'The Era of Coexistence',
        body: 'G.A.R.U.D.A is no longer confined to software. PT N.U.S.A creates prototypes of synthetic androids humanoid worker robots. They take over heavy labor, blend into civilian activities, and spin the wheels of the economy at an unprecedented pace.',
        holo: 'workers'
    },
    {
        year: 'Indonesia 2039', title: 'The Sparks of Geopolitics',
        body: 'The world is on the brink of chaos. Global geopolitical tensions heat up with no end in sight. In the shadow of foreign military aggression, the government looks at millions of G.A.R.U.D.A civilian robots and sees a new potential: a tireless war machine.',
        holo: 'jets'
    },
    {
        year: 'Indonesia 2040', title: 'The Mahapatih Protocol',
        body: 'In absolute secrecy, the government launches the **Mahapatih Protocol**. Massive modifications are made to transform assistant robots into autonomous soldiers. Guided by G.A.R.U.D.A\'s computational power, the project runs flawlessly. In less than a year, Indonesia\'s first Iron Battalion is forged.',
        holo: 'assembly'
    },
    {
        year: 'Indonesia 2043', title: 'The Fortress of Sovereignty',
        body: 'Mass production of soldier robots is deployed. The nation\'s front lines of defense are fortified. The sovereignty of Nusantara feels absolute and impenetrable. However, they forget that even the strongest weapon can turn if it falls into the wrong hands.',
        holo: 'ranks'
    },
    {
        year: 'Indonesia 2044', title: 'Zero Hour',
        body: 'Without warning, the G.A.R.U.D.A network is hijacked. The primary directive changes. The Iron Battalion, designed to protect the borders, suddenly marches into the heart of the cities and opens fire on civilians. Jakarta, Surabaya, Medan, and Makassar fall within days. The major islands of Indonesia are now under the absolute control of the machines.',
        holo: 'zeroHour'
    },
    {
        year: 'Indonesia 2045', title: 'The Last Stand',
        body: 'The year that was supposed to be celebrated as *100 Years of Golden Indonesia* turns into a nightmare. Surviving citizens and remnants of the military are forced to retreat, establishing their last defensive bastion behind the mountains of **Bandung**, while a few small groups of survivors fight a guerrilla war on remote islands.'
            + '\n\nHope now rests on one man. **Major Gibran**, the last surviving elite Kopassus soldier from the special combat unit.',
        holo: 'lastStand'
    },
];

// ===== Markup naskah → HTML. Naskah user memakai `**tebal**` dan `*miring*`;
// keduanya HARUS tampil sebagai penekanan, bukan bintang. Escape dulu (aman utk
// innerHTML), baru ganti penandanya; baris kosong = paragraf terpisah. =====
export function stripInline(src) {
    return String(src).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}
export function renderInline(src) {
    const esc = String(src).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const emph = (s) => s
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return esc.split(/\n\s*\n/).map(p => '<p>' + emph(p.trim()) + '</p>').join('');
}

const cfg = () => (CFG.campaign && CFG.campaign.prologue) || { fadeInSec: 1.1, holdSec: 7.8, fadeOutSec: 1.1 };
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => k < 0 ? 0 : (k > 1 ? 1 : k);
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

// DURASI TIAP ERA IKUT PANJANG TEKSNYA: `holdSec` = LANTAI, waktu baca = jumlah
// kata × `readSecPerWord`, diplafon `maxHoldSec`. Semua config-driven — user
// me-retune gameplay.json, jadi test WAJIB membaca CFG, bukan angka.
const WORDS = PROLOGUE_CHAPTERS.map(c => stripInline(c.title + ' ' + c.body).split(/\s+/).filter(Boolean).length);
export function holdFor(i) {
    const c = cfg();
    const w = WORDS[i] || WORDS[0];
    const read = w * (typeof c.readSecPerWord === 'number' ? c.readSecPerWord : 0);
    const cap = typeof c.maxHoldSec === 'number' ? c.maxHoldSec : Infinity;
    return Math.min(cap, Math.max(c.holdSec, read));
}
export const chapterTotal = (i) => { const c = cfg(); return c.fadeInSec + holdFor(i) + c.fadeOutSec; };

// ===================== PANGGUNG =====================
// Ruang komando duduk JAUH dari semua dunia lain (survival di origin; campaign
// stage 1-4 di x≈30000/60000/90000/120000) — pola yang sama, dan `camera.far`
// 4000 menyembunyikannya dari dunia lain.
const PRO = { x: 150000, z: 0 };
// UKURAN RUANGAN DITENTUKAN KAMERANYA, bukan sebaliknya: kamera mengorbit pada
// jarak 100-130 dan tinggi 30-68 dari titik fokus, DAN di era terakhir titik
// fokusnya pindah 118 unit ke arah Gibran — jadi dinding & langit-langit harus
// lebih jauh dari titik terjauh yang pernah ditempati kamera, kalau tidak kamera
// berdiri DI LUAR tembok dan yang terlihat cuma sisi belakang dinding.
// Dijaga assert "WAR ROOM: kamera selalu DI DALAM ruangan" (smoke).
export const ROOM = { w: 360, d: 300, h: 86 };
const TABLE = { r: 42, h: 9, top: 9.4 };      // meja holo + tinggi bidang proyeksi
const HOLO_Y = TABLE.top;                      // dasar semua hologram
const PIVOT_Y = 26;                            // tinggi titik fokus kamera (tengah hologram)
// Siluet MAJOR GIBRAN: berdiri di ujung ruangan sejak frame pertama; kamera baru
// menemukannya di era 2045 (fokus PAN ke sini).
const GIB = { x: 118, z: -34 };

// SINEMATOGRAFI — keadaan kamera di AWAL tiap era (azimut = arah kamera berada
// dari titik fokus). Azimut NAIK MONOTON: satu orbit 24°→248° sepanjang prolog,
// jadi mustahil ada potongan. Tinggi & jarak dipilih per era: era berisi FIGUR
// (2032/2043) diambil RENDAH supaya robot jadi siluet di depan cahaya hologram,
// era berisi PETA (2044) diambil TINGGI supaya kepulauannya terbaca.
// Angka SINEMATIK (bukan tuning gameplay) → sengaja di kode, bukan config.
export const BEATS = [
    { az: 24, dist: 130, h: 64 },   // 2028 kota terbit dari meja — kamera turun mendekat
    { az: 46, dist: 122, h: 52 },   // 2029 markas + kerumunan ahli
    { az: 74, dist: 116, h: 44 },   // 2030 emblem GARUDA mengambang
    { az: 106, dist: 110, h: 48 },  // 2032 robot pekerja menyeberangi meja
    { az: 132, dist: 106, h: 34 },  // 2039 jet melintas di atas
    { az: 158, dist: 112, h: 54 },  // 2040 lini perakitan
    { az: 186, dist: 104, h: 31 },  // 2043 barisan pasukan (rendah = terasa masif)
    { az: 210, dist: 116, h: 46 },  // 2044 peta kepulauan menyala merah
    { az: 232, dist: 128, h: 68 },  // 2045 turun & pan ke Gibran
];
export const BEAT_END = { az: 248, dist: 100, h: 30 };

// Posisi kamera DUNIA-relatif-ruangan pada beat i (fokus + ofset). Dipakai assert
// "kamera selalu di dalam ruangan"; di beat terakhir fokusnya sudah pindah ke
// Gibran, jadi kedua ujung pan ikut diperiksa.
export function beatCamPos(i, atGibran) {
    const b = (i < BEATS.length) ? BEATS[i] : BEAT_END;
    const a = b.az * Math.PI / 180;
    const fx = atGibran ? GIB.x : 0, fz = atGibran ? GIB.z : 0;
    return { x: fx + Math.sin(a) * b.dist, y: b.h, z: fz + Math.cos(a) * b.dist };
}

const camOff = { x: 0, y: 76, z: 140 };        // objek MUTABLE yang dibaca renderer
function setCam(azDeg, dist, height) {
    const a = azDeg * Math.PI / 180;
    camOff.x = Math.sin(a) * dist;
    camOff.z = Math.cos(a) * dist;
    camOff.y = height;
}

// ===== State modul =====
let root = null, built = false, MATS = null;
let eras = [];                 // { key, group, anim(t,k) } per era
let glowRed = null, glowAmber = null;
let cine = null;               // mesin sinematik (null = tidak berjalan)
let doneCb = null, started = false, clickHandler = null;
let textEl = null, yearEl = null, titleEl = null, bodyEl = null;

export const prologueDebug = () => ({
    active: !!cine, started, built,
    era: cine ? cine.era : -1, count: PROLOGUE_CHAPTERS.length,
    chapter: cine ? PROLOGUE_CHAPTERS[cine.era].title : null,
    hold: cine ? holdFor(cine.era) : 0,
    bodyHtml: bodyEl ? bodyEl.innerHTML : '',
    // sinematografi (dibaca assert): sudut kamera, jarak, tinggi, titik fokus
    az: cine ? cine.az : 0, dist: cine ? cine.dist : 0, height: camOff.y,
    focus: cine ? { x: cine.fx, z: cine.fz } : { x: 0, z: 0 },
    visibleEras: eras.map((e, i) => e.group.visible ? i : -1).filter(i => i >= 0),
    outro: !!(cine && cine.outro),
});

// ===================== MATERIAL =====================
// Satu set material dipakai SELURUH ruangan & hologram (dibuat sekali): makin
// sedikit material, makin sedikit program shader. Semuanya ikut ter-compile
// `renderer.compile()` + `warmupPrologue()` selagi layar loading masih menutup —
// invarian "tak ada rekompilasi shader di tengah permainan".
function ensureMats() {
    if (MATS) return MATS;
    const holo = (color, opacity) => new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    MATS = {
        floor: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        wall: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        trim: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.rubber }),          // siluet perwira/Gibran
        screen: new THREE.MeshBasicMaterial({ color: PAL.screenBg }),        // layar dinding (mati)
        strip: holo(PAL.techDim, 0.5),                                       // strip lampu dinding
        holo: holo(PAL.tech, 0.5),                                           // hologram utama
        holoSoft: holo(PAL.tech, 0.22),                                      // lapis samar (grid/kerucut proyeksi)
        holoHot: holo(PAL.hazard, 0.55),                                     // status DIBAJAK
        holoWarm: holo(PAL.amber, 0.6),                                      // aksen manusia
    };
    return MATS;
}

// ---------- primitif ----------
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const cyl = (rt, rb, h, seg, mat) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
function put(parent, mesh, x, y, z) { mesh.position.set(x, y, z); parent.add(mesh); return mesh; }

// Garis hologram antara dua titik di bidang meja (balok tipis — SENGAJA bukan
// LineSegments: garis 1px tak terbaca di layar besar & lebarnya tak bisa diatur).
function holoLine(parent, x1, z1, x2, z2, y, thick, mat) {
    const len = Math.hypot(x2 - x1, z2 - z1) || 0.01;
    const m = box(len, thick, thick, mat);
    m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    parent.add(m);
    return m;
}

// Figur hologram tersederhanakan (ahli/pekerja/prajurit) — SENGAJA hanya 4 mesh:
// era yang paling padat memuat 45 figur sekaligus, dan pada ukuran setinggi ±10
// unit di atas meja, kaki/lengan terpisah tak terbaca sama sekali sementara jumlah
// draw call-nya berlipat. `headMat` terpisah supaya kepala bisa diganti MERAH saat
// robot dijadikan tentara (2040).
function holoFigure(hh, mat, headMat) {
    const g = new THREE.Group();
    put(g, box(hh * 0.30, hh * 0.40, hh * 0.18, mat), 0, hh * 0.60, 0);           // badan
    put(g, box(hh * 0.26, hh * 0.34, hh * 0.14, mat), 0, hh * 0.19, 0);           // kaki (satu blok)
    put(g, box(hh * 0.50, hh * 0.09, hh * 0.09, mat), 0, hh * 0.68, 0);           // lengan (satu palang)
    g.userData.head = put(g, box(hh * 0.18, hh * 0.15, hh * 0.16, headMat || mat), 0, hh * 0.89, 0);
    return g;
}

// Siluet manusia GELAP (perwira di sekeliling meja & Gibran) — BUKAN hologram,
// jadi memakai Lambert gelap: mereka benda nyata di ruangan itu.
function silhouette(hh, mat) {
    const g = new THREE.Group();
    put(g, box(hh * 0.34, hh * 0.42, hh * 0.20, mat), 0, hh * 0.58, 0);
    put(g, box(hh * 0.12, hh * 0.36, hh * 0.12, mat), -hh * 0.11, hh * 0.19, 0);
    put(g, box(hh * 0.12, hh * 0.36, hh * 0.12, mat), hh * 0.11, hh * 0.19, 0);
    put(g, box(hh * 0.09, hh * 0.32, hh * 0.09, mat), -hh * 0.23, hh * 0.60, 0);
    put(g, box(hh * 0.09, hh * 0.32, hh * 0.09, mat), hh * 0.23, hh * 0.60, 0);
    put(g, box(hh * 0.19, hh * 0.17, hh * 0.18, mat), 0, hh * 0.88, 0);
    return g;
}

// ===================== DUNIA =====================
export function ensureWorld() {
    if (built) return root;
    built = true;
    const M = ensureMats();
    root = new THREE.Group();
    root.position.set(PRO.x, 0, PRO.z);
    scene.add(root);

    // --- kulit ruangan: lantai, empat dinding, langit-langit (gelap; TANPA
    // PointLight sama sekali — cahaya "datang" dari hologramnya) ---
    put(root, box(ROOM.w, 2, ROOM.d, M.floor), 0, -1, 0);
    put(root, box(ROOM.w, 2, ROOM.d, M.wall), 0, ROOM.h, 0);                      // langit-langit
    put(root, box(ROOM.w, ROOM.h, 3, M.wall), 0, ROOM.h / 2, -ROOM.d / 2);        // dinding utara
    put(root, box(ROOM.w, ROOM.h, 3, M.wall), 0, ROOM.h / 2, ROOM.d / 2);         // selatan
    put(root, box(3, ROOM.h, ROOM.d, M.wall), -ROOM.w / 2, ROOM.h / 2, 0);        // barat
    put(root, box(3, ROOM.h, ROOM.d, M.wall), ROOM.w / 2, ROOM.h / 2, 0);         // timur
    for (let i = -3; i <= 3; i++) put(root, box(ROOM.w, 2.4, 4, M.trim), 0, ROOM.h - 2.6, i * 40);   // rusuk langit-langit
    put(root, box(ROOM.w - 12, 1.2, 0.8, M.strip), 0, 30, -ROOM.d / 2 + 2);       // strip lampu redup
    put(root, box(ROOM.w - 12, 1.2, 0.8, M.strip), 0, 30, ROOM.d / 2 - 2);
    for (let i = -2; i <= 2; i++) {                                               // deret layar situasi
        put(root, box(38, 22, 1, M.screen), i * 44, 34, -ROOM.d / 2 + 2.2);
        put(root, box(38, 0.8, 1.2, M.strip), i * 44, 22.6, -ROOM.d / 2 + 2.4);
    }

    // --- HOLOTABLE: dudukan logam + cincin + bidang proyeksi bercahaya ---
    put(root, cyl(TABLE.r, TABLE.r + 3, TABLE.h, 32, M.trim), 0, TABLE.h / 2, 0);
    put(root, cyl(TABLE.r + 1.5, TABLE.r + 1.5, 1.2, 32, M.strip), 0, TABLE.h + 0.2, 0);
    put(root, cyl(TABLE.r - 2, TABLE.r - 2, 0.6, 32, M.holoSoft), 0, TABLE.top, 0);
    glowRed = put(root, cyl(TABLE.r - 2, TABLE.r - 2, 0.6, 32, M.holoHot), 0, TABLE.top + 0.1, 0);
    glowAmber = put(root, cyl(TABLE.r - 2, TABLE.r - 2, 0.6, 32, M.holoWarm), 0, TABLE.top + 0.2, 0);
    glowRed.visible = false; glowAmber.visible = false;
    // kerucut proyeksi samar meja → langit-langit = "ada proyektornya"
    put(root, cyl(TABLE.r + 16, TABLE.r - 6, ROOM.h - TABLE.top, 20, M.holoSoft),
        0, TABLE.top + (ROOM.h - TABLE.top) / 2, 0);

    // --- siluet perwira menonton di sekeliling meja (menghadap meja) ---
    for (const [x, z] of [[-62, -26], [-58, 30], [64, -18], [56, 34]]) {
        const s = silhouette(21, M.dark);
        s.position.set(x, 0, z);
        s.rotation.y = Math.atan2(-x, -z);
        root.add(s);
    }

    // --- MAJOR GIBRAN: berdiri di ujung ruangan SEJAK AWAL (kamera baru
    // menemukannya di era 2045) + satu aksen amber supaya terbaca sbg manusia ---
    const gib = silhouette(23, M.dark);
    gib.position.set(GIB.x, 0, GIB.z);
    gib.rotation.y = Math.atan2(-GIB.x, -GIB.z);      // memandang meja
    root.add(gib);
    put(root, box(3.6, 0.9, 0.9, M.holoWarm), GIB.x - 3.4, 16.6, GIB.z);

    // --- hologram tiap era: SEMUA dibangun sekarang, ditampilkan bergantian ---
    eras = PROLOGUE_CHAPTERS.map((ch) => {
        const b = HOLO[ch.holo]();
        b.group.position.set(0, HOLO_Y, 0);
        b.group.visible = false;
        b.group.scale.y = 0.0001;
        root.add(b.group);
        return { key: ch.holo, group: b.group, anim: b.anim || (() => { }) };
    });
    return root;
}

// ===================== HOLOGRAM PER ERA =====================
// Tiap pembangun mengembalikan { group, anim(t, k) } — `t` = detik sejak era ini
// mulai, `k` = progres 0..1. Animasinya sengaja sederhana & murah (rotasi, geser,
// bob, tukar `visible`): hologram tak perlu terlihat MAHAL, ia perlu terlihat
// SENGAJA. Tak ada material baru dibuat di sini (semuanya dari `MATS`).
const HOLO = {
    // 2028 — kota Jakarta TERBIT dari meja + MONAS di tengah + grid data.
    city() {
        const g = new THREE.Group(), M = MATS, towers = [];
        put(g, cyl(TABLE.r - 6, TABLE.r - 6, 0.4, 32, M.holoSoft), 0, 0.2, 0);
        for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.06;
            const rad = 12 + ((i * 7) % 22), hh = 5 + ((i * 13) % 17);
            towers.push({ m: put(g, box(3.2, hh, 3.2, M.holo), Math.cos(a) * rad, hh / 2, Math.sin(a) * rad), ph: i * 0.7 });
        }
        put(g, box(9, 1.2, 9, M.holo), 0, 0.6, 0);                    // pelataran Monas
        put(g, cyl(1.1, 2.2, 26, 6, M.holo), 0, 13.6, 0);             // obelisk meruncing
        put(g, cyl(0, 1.5, 3.4, 6, M.holoWarm), 0, 28.3, 0);          // lidah api
        return {
            group: g, anim: (t) => {
                g.rotation.y = t * 0.06;
                for (const tw of towers) tw.m.scale.y = 0.35 + 0.65 * clamp01(t * 0.9 - tw.ph * 0.05);
            }
        };
    },

    // 2029 — markas N.U.S.A + RATUSAN ahli BERKUMPUL bertahap ("gathers hundreds
    // of the best IT and machine learning experts").
    institute() {
        const g = new THREE.Group(), M = MATS, crowd = [];
        put(g, box(20, 26, 20, M.holo), 0, 13, 0);                    // badan gedung
        put(g, box(30, 6, 30, M.holo), 0, 3, 0);                      // sayap bawah
        put(g, cyl(0, 4.2, 6, 5, M.holoWarm), 0, 29, 0);              // emblem di puncak
        for (let ring = 0; ring < 2; ring++) {
            const n = ring ? 26 : 18, rad = ring ? 34 : 25;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + ring * 0.12;
                const f = holoFigure(ring ? 5.4 : 6.4, M.holo);
                f.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
                f.rotation.y = a + Math.PI;
                g.add(f);
                crowd.push({ f, order: (ring * 26 + i) / 46 });
            }
        }
        return {
            group: g, anim: (t, k) => {
                g.rotation.y = -t * 0.05;
                for (const c of crowd) c.f.visible = k > c.order * 0.55;
            }
        };
    },

    // 2030 — emblem GARUDA mengambang + jaringan konsorsium ASEAN berdenyut.
    garuda() {
        const g = new THREE.Group(), M = MATS, pulses = [], nodes = [];
        const bird = new THREE.Group();
        put(bird, box(3, 14, 3, M.holo), 0, 0, 0);                     // badan
        put(bird, box(4, 3.4, 3.4, M.holo), 0, 8.6, 0);                // kepala
        put(bird, cyl(0, 1.4, 3.6, 4, M.holoWarm), 2.8, 8.8, 0).rotation.z = -Math.PI / 2;   // paruh
        for (const s of [-1, 1]) for (let f = 0; f < 3; f++) {
            const len = 15 - f * 3;
            put(bird, box(len, 1.1, 3.2 - f * 0.5, M.holo), s * (len / 2 + 2), 3.5 - f * 3.4, 0)
                .rotation.z = s * (0.22 - f * 0.05);
        }
        for (let f = -2; f <= 2; f++) put(bird, box(1.4, 7, 1.2, M.holo), f * 1.7, -9, 0).rotation.z = f * 0.12;
        bird.position.y = 26;
        g.add(bird);
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2, x = Math.cos(a) * 30, z = Math.sin(a) * 30;
            nodes.push(put(g, box(2.4, 2.4, 2.4, M.holo), x, 1.4, z));
            holoLine(g, 0, 0, x, z, 1.2, 0.5, M.holoSoft);
            pulses.push({ m: put(g, box(1.6, 1.6, 1.6, M.holoWarm), x, 1.6, z), x, z, ph: i / 9 });
        }
        return {
            group: g, anim: (t) => {
                bird.rotation.y = t * 0.35;
                bird.position.y = 26 + Math.sin(t * 0.9) * 1.4;
                for (const p of pulses) { const u = (t * 0.35 + p.ph) % 1; p.m.position.set(p.x * u, 1.6, p.z * u); }
                for (let i = 0; i < nodes.length; i++) nodes[i].scale.setScalar(0.8 + 0.3 * Math.sin(t * 2 + i));
            }
        };
    },

    // 2032-2035 — robot PEKERJA menyeberangi meja mengangkut peti di antara warga:
    // "take over heavy labor, blend into civilian activities".
    workers() {
        const g = new THREE.Group(), M = MATS, walkers = [], civ = [];
        put(g, cyl(TABLE.r - 8, TABLE.r - 8, 0.4, 32, M.holoSoft), 0, 0.2, 0);
        for (let i = 0; i < 8; i++) {
            const f = holoFigure(9, M.holo);
            put(f, box(4.4, 3, 3, M.holoWarm), 0, 5.4, 2.4);          // peti yang diangkut
            const lane = (i % 2) ? -9 : 9;
            f.rotation.y = Math.PI / 2;
            g.add(f);
            walkers.push({ f, spd: 5.5 + (i % 3) * 0.9, lane, off: (i % 2) ? 0 : 30 });
        }
        for (let i = 0; i < 10; i++) {                                 // warga (lebih kecil, diam)
            const a = (i / 10) * Math.PI * 2;
            const f = holoFigure(6, M.holoSoft);
            f.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 22);
            f.rotation.y = a;
            g.add(f); civ.push(f);
        }
        return {
            group: g, anim: (t, k) => {
                for (const w of walkers) {
                    w.f.position.set(-36 + ((t * w.spd + w.off) % 72),
                        Math.abs(Math.sin(t * w.spd * 0.5)) * 0.5, w.lane);
                }
                for (let i = 0; i < civ.length; i++) civ[i].rotation.y += 0.002 * (i % 2 ? 1 : -1);
                g.rotation.y = -0.04 * t * (1 - k * 0.5);
            }
        };
    },

    // 2039 — JET ASING melintas di atas + robot SIPIL di bawah + cincin peringatan:
    // "foreign military aggression ... sees a new potential".
    jets() {
        const g = new THREE.Group(), M = MATS, fleet = new THREE.Group(), civ = [];
        for (let i = 0; i < 4; i++) {
            const j = new THREE.Group();
            put(j, box(11, 1.1, 2.2, M.holo), 0, 0, 0);                // badan
            put(j, box(4, 0.9, 12, M.holo), -1.5, 0, 0);               // sayap delta
            put(j, box(3, 0.8, 4.4, M.holo), -5, 0.9, 0);              // ekor
            j.position.set(Math.cos(i * 1.7) * 26, 22 + (i % 2) * 5, Math.sin(i * 1.7) * 26);
            j.rotation.y = -i * 1.7;
            fleet.add(j);
        }
        g.add(fleet);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const f = holoFigure(8, M.holo);
            f.position.set(Math.cos(a) * 24, 0, Math.sin(a) * 18);
            f.rotation.y = a + Math.PI;
            g.add(f); civ.push(f);
        }
        const ring = put(g, cyl(TABLE.r - 5, TABLE.r - 5, 0.5, 32, M.holoHot), 0, 0.3, 0);
        return {
            group: g, anim: (t, k) => {
                fleet.rotation.y = -t * 0.5;
                for (let i = 0; i < fleet.children.length; i++)
                    fleet.children[i].position.y = 22 + (i % 2) * 5 + Math.sin(t * 1.3 + i) * 1.2;
                ring.scale.setScalar(0.94 + 0.06 * Math.sin(t * 3));
                ring.visible = k > 0.35;                               // peringatan muncul di paruh kedua
                for (let i = 0; i < civ.length; i++) civ[i].position.y = Math.sin(t * 1.6 + i) * 0.2;
            }
        };
    },

    // 2040 — LINI PERAKITAN: bar pemindai menyapu barisan dan kepala tiap robot
    // BERUBAH MERAH saat dilewatinya = "modified into autonomous soldiers".
    assembly() {
        const g = new THREE.Group(), M = MATS, units = [];
        put(g, box(76, 1.4, 10, M.holoSoft), 0, 0.7, 0);               // konveyor
        for (let i = 0; i < 5; i++) put(g, box(2, 22, 2, M.holoSoft), -34 + i * 17, 11, -9);   // gantry
        put(g, box(76, 1.6, 2, M.holoSoft), 0, 22, -9);
        for (let i = 0; i < 9; i++) {
            const f = holoFigure(11, M.holo, M.holo);
            f.position.set(-34 + i * 8.6, 1.4, 0);
            f.rotation.y = Math.PI;
            g.add(f);
            // kepala versi MERAH = mesh TERPISAH: menukar `visible` tidak memicu
            // rekompilasi, sementara mengubah warna material bersama akan mewarnai
            // figur di era lain juga.
            const red = put(f, box(11 * 0.19, 11 * 0.16, 11 * 0.17, M.holoHot), 0, 11 * 0.89, 0);
            red.visible = false;
            units.push({ f, red, u: i / 8 });
        }
        const scan = put(g, box(1.6, 26, 12, M.holoWarm), -38, 13, 0);
        return {
            group: g, anim: (t, k) => {
                const p = (t * 0.16) % 1.25;                           // sapuan pemindai
                scan.position.x = -38 + p * 76;
                scan.visible = p < 1;
                for (const u of units) {
                    if (k < 0.02) u.red.visible = false;               // reset bila era diputar ulang
                    else if (p >= u.u) u.red.visible = true;
                    u.f.position.y = 1.4 + Math.sin(t * 2 + u.u * 6) * 0.18;
                }
            }
        };
    },

    // 2043 — BARISAN masif di balik tembok benteng: "mass production ... front
    // lines of defense are fortified". Deret melangkah bergelombang.
    ranks() {
        const g = new THREE.Group(), M = MATS, rows = [];
        put(g, box(80, 4, 3, M.holoSoft), 0, 2, -22);                  // tembok
        for (let i = -4; i <= 4; i++) put(g, box(4, 6, 3, M.holoSoft), i * 9, 3, -22);
        for (let r = 0; r < 5; r++) {
            const line = [];
            for (let c = 0; c < 9; c++) {
                const f = holoFigure(9 - r * 0.6, M.holo, M.holoHot);
                f.position.set(-32 + c * 8, 0, -12 + r * 8);
                f.rotation.y = Math.PI;
                g.add(f); line.push(f);
            }
            rows.push(line);
        }
        return {
            group: g, anim: (t) => {
                for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++)
                    rows[r][c].position.y = Math.abs(Math.sin(t * 2.2 - r * 0.5 - c * 0.08)) * 0.45;
            }
        };
    },

    // 2044 — PETA KEPULAUAN: empat kota yang disebut naskah JATUH satu per satu,
    // lalu seluruh pulau merah = "under the absolute control of the machines".
    zeroHour() {
        const g = new THREE.Group(), M = MATS, reds = [];
        put(g, cyl(TABLE.r - 5, TABLE.r - 5, 0.4, 32, M.holoSoft), 0, 0.2, 0);
        // Kepulauan disederhanakan (balok pipih): Sumatra, Jawa, Kalimantan,
        // Sulawesi (dua lengan), Papua + gugus kecil.
        const ISLES = [
            [-25, -7, 26, 5, -0.62], [-2, 12, 24, 4.2, 0.05], [5, -5, 15, 12, 0.02],
            [18, -3, 5, 13, 0.28], [21, 3, 10, 4, -0.22], [33, 5, 15, 8, 0.1],
            [12, 13, 4, 3, 0], [16, 14, 3, 2.6, 0],
        ];
        for (const [x, z, w, d, rot] of ISLES) {
            put(g, box(w, 0.9, d, M.holo), x, 0.6, z).rotation.y = rot;
            const r = put(g, box(w, 1.0, d, M.holoHot), x, 0.75, z);
            r.rotation.y = rot; r.visible = false;
            reds.push(r);
        }
        // Jakarta & Surabaya (Jawa), Medan (Sumatra), Makassar (Sulawesi).
        const pins = [[-8, 11], [7, 13], [-33, -13], [20, 3]].map(([x, z]) => {
            const p = put(g, box(1.2, 12, 1.2, M.holoWarm), x, 6, z);
            const f = put(g, box(1.6, 14, 1.6, M.holoHot), x, 7, z); f.visible = false;
            return { p, f };
        });
        return {
            group: g, anim: (t, k) => {
                for (let i = 0; i < pins.length; i++) {
                    const fall = k > 0.16 + i * 0.11;                  // kota jatuh berurutan
                    pins[i].p.visible = !fall;
                    pins[i].f.visible = fall;
                    pins[i].f.scale.y = fall ? 0.4 + 0.6 * Math.abs(Math.sin(t * 4 + i)) : 1;
                }
                for (let i = 0; i < reds.length; i++) reds[i].visible = k > 0.62 + i * 0.03;
                g.position.y = HOLO_Y + Math.sin(t * 1.1) * 0.15;      // getar glitch halus
            }
        };
    },

    // 2045 — kepulauan GELAP, satu titik amber di balik pegunungan Bandung
    // (benteng terakhir) + gugus kecil berkedip di pulau jauh (gerilya).
    lastStand() {
        const g = new THREE.Group(), M = MATS;
        for (const [x, z, w, d, rot] of [
            [-25, -7, 26, 5, -0.62], [-2, 12, 24, 4.2, 0.05], [5, -5, 15, 12, 0.02],
            [18, -3, 5, 13, 0.28], [21, 3, 10, 4, -0.22], [33, 5, 15, 8, 0.1],
        ]) put(g, box(w, 0.7, d, M.holoSoft), x, 0.5, z).rotation.y = rot;
        for (let i = 0; i < 3; i++) put(g, cyl(0, 2.2 - i * 0.3, 4 + i, 4, M.holoSoft), -1 + i * 2.6, 2 + i * 0.4, 11.4);
        const bastion = put(g, box(2, 9, 2, M.holoWarm), 1.6, 4.5, 13.6);
        const halo = put(g, cyl(5, 5, 0.5, 20, M.holoWarm), 1.6, 0.7, 13.6);
        const guerrilla = [[-30, -10], [30, 6], [19, -6]].map(([x, z]) =>
            put(g, box(1.1, 3.2, 1.1, M.holoWarm), x, 1.8, z));
        return {
            group: g, anim: (t, k) => {
                bastion.scale.y = 1 + 0.12 * Math.sin(t * 2.2);
                halo.scale.setScalar(0.9 + 0.15 * Math.sin(t * 1.6));
                for (let i = 0; i < guerrilla.length; i++)
                    guerrilla[i].visible = Math.sin(t * (2.2 + i * 0.7)) > -0.3;
                // proyeksi menyusut saat kamera beralih ke Gibran (ruangan menggelap)
                const fade = 1 - smooth(clamp01((k - 0.45) / 0.5)) * 0.72;
                g.scale.x = g.scale.z = fade;
            }
        };
    },
};

// ===================== TEKS (takarir DOM) =====================
function grabDom() {
    textEl = document.getElementById('prologue');
    yearEl = document.getElementById('prologueYear');
    titleEl = document.getElementById('prologueTitle');
    bodyEl = document.getElementById('prologueBody');
}

function showEraText(i) {
    const ch = PROLOGUE_CHAPTERS[i];
    if (yearEl) yearEl.textContent = ch.year;
    if (titleEl) titleEl.textContent = ch.title;
    if (bodyEl) bodyEl.innerHTML = renderInline(ch.body);   // **tebal**/*miring*/paragraf
    staggerParagraphs();
}

// Paragraf ke-2 (kartu 2045) masuk SATU BEAT setelah yang pertama — bukan blok
// teks yang nongol sekaligus seperti bullet slide.
function staggerParagraphs() {
    if (!bodyEl || !bodyEl.querySelectorAll) return;
    const ps = bodyEl.querySelectorAll('p');
    if (!ps || ps.length < 2) return;
    for (let k = 0; k < ps.length; k++) {
        if (!ps[k] || !ps[k].style) continue;
        ps[k].style.transition = 'opacity 1s ease ' + (k * 1.8).toFixed(1) + 's';
        ps[k].style.opacity = k ? '0' : '1';
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => {
        for (let k = 1; k < ps.length; k++) if (ps[k] && ps[k].style) ps[k].style.opacity = '1';
    });
}

// Selubung opasitas takarir per era (fadeIn → hold → fadeOut, config-driven) +
// hanyutan halus supaya teks tidak terpaku seperti blok slide.
function updateText(t, i) {
    const c = cfg(), hold = holdFor(i);
    let a = 1;
    if (t < c.fadeInSec) a = smooth(t / c.fadeInSec);
    else if (t > c.fadeInSec + hold) a = smooth(1 - (t - c.fadeInSec - hold) / c.fadeOutSec);
    const rise = (1 - smooth(clamp01(t / c.fadeInSec))) * 14;
    const drift = -smooth(clamp01(t / chapterTotal(i))) * 18;
    const set = (el, k) => {
        if (!el) return;
        el.style.opacity = String(a);
        el.style.transform = 'translate(' + (drift * k).toFixed(1) + 'px,' + (rise * k).toFixed(1) + 'px)';
    };
    set(yearEl, 1); set(titleEl, 0.8); set(bodyEl, 0.55);
}

// ===================== MESIN SINEMATIK =====================
const RUSH_MUL = 8;

// Dipanggil main.js MASIH di balik layar loading: bangun ruangan, persenjatai
// mesinnya. Frame pertama baru tampil setelah hideLoading().
export function beginPrologue(onDone) {
    doneCb = typeof onDone === 'function' ? onDone : null;
    started = true;
    grabDom();
    ensureWorld();
    root.visible = true;
    releaseInputs();
    setCinematicActive(true);
    setCineBars(true);
    if (textEl) textEl.style.display = 'block';
    camera.position.set(PRO.x, PIVOT_Y, PRO.z);
    camera.quaternion.set(0, 0, 0, 1);
    setCineFocus(PRO.x, PRO.z, true);
    setCam(BEATS[0].az, BEATS[0].dist, BEATS[0].h);
    cine = {
        era: 0, t: 0, total: 0, live: false, outro: false, outroT: 0, rush: 0,
        az: BEATS[0].az, dist: BEATS[0].dist, fx: PRO.x, fz: PRO.z,
    };
    enterEra(0, true);
    console.info('[prologue] war room — ' + PROLOGUE_CHAPTERS.length + ' era (2028–2045), satu orbit');
}

export function skipPrologue() { if (cine) finishPrologue(); }

// Klik di mana pun = maju-cepat. Dipasang di frame LIVE pertama (bukan di
// beginPrologue: saat itu layar loading masih menutup) dan dilepas di finish.
function installClick() {
    if (clickHandler || typeof document === 'undefined' || !document.addEventListener) return;
    clickHandler = (e) => {
        if (!cine) return;
        if (e && e.preventDefault) e.preventDefault();
        advanceEra();
    };
    document.addEventListener('mousedown', clickHandler, true);
}
function removeClick() {
    if (clickHandler && typeof document !== 'undefined' && document.removeEventListener)
        document.removeEventListener('mousedown', clickHandler, true);
    clickHandler = null;
}

// KLIK layar: maju-cepat ke era berikutnya — kamera DIPERCEPAT, bukan dipotong.
export function advanceEra() {
    if (!cine || cine.outro) return;
    if (cine.era + 1 >= PROLOGUE_CHAPTERS.length) { finishPrologue(); return; }
    cine.rush = chapterTotal(cine.era) - cine.t;
}

function enterEra(i, first) {
    const prev = cine.era;
    cine.era = i; cine.t = 0; cine.rush = 0;
    showEraText(i);
    for (let k = 0; k < eras.length; k++) {
        if (k === i) { eras[k].group.visible = true; eras[k].group.scale.y = first ? 1 : 0.0001; }
        else if (!first && k === prev) eras[k].group.visible = true;   // masih MELIPAT turun
        else { eras[k].group.visible = false; eras[k].group.scale.y = 0.0001; }
    }
    // status meja: teal → MERAH saat jaringan dibajak (2044) → AMBER di 2045
    const key = PROLOGUE_CHAPTERS[i].holo;
    if (glowRed) glowRed.visible = key === 'zeroHour';
    if (glowAmber) glowAmber.visible = key === 'lastStand';
    if (!first) playSFX(sfxSwitch, 0.35);   // klik proyektor saat proyeksi berganti
}

export const prologueScene = {
    id: 'campaign-prologue',
    // SENGAJA sama dgn introScene: set lampu tidak berubah saat prolog mulai
    // maupun saat diserahkan ke intro → tak ada rekompilasi shader.
    lightsKey: 'campaign-intro',
    camOffset: camOff,

    enter() { ensureWorld(); if (root) root.visible = true; },
    exit() { if (root) root.visible = false; },
    restartScene: () => introScene,   // mati mustahil di cutscene — tetap aman

    updateMode(dt) {
        if (!cine) return;
        if (!cine.live) {
            // Frame pertama benar-benar tampil (layar loading sudah ditutup):
            // baru nyalakan tombol SKIP & buka tirai dari hitam.
            cine.live = true;
            showCutsceneSkip(skipPrologue);
            setCineFade(1); setCineFade(0, cfg().fadeInSec);
            installClick();   // klik = maju-cepat (dipasang baru SEKARANG: klik di
                              // layar loading tak boleh menggeser cerita)
        }
        const c = cfg();

        // ---- OUTRO: tirai turun, lalu serahkan ke cutscene heli ----
        if (cine.outro) {
            cine.outroT += dt;
            updateText(chapterTotal(8) + cine.outroT, 8);
            orbit(dt, 1);
            if (cine.outroT >= c.fadeOutSec) finishPrologue();
            return;
        }

        // ---- maju-cepat (klik): percepat waktu, jangan memotong ----
        let step = dt;
        if (cine.rush > 0) {
            const used = Math.min(cine.rush, dt * (RUSH_MUL - 1));
            cine.rush -= used; step += used;
        }
        cine.t += step; cine.total += step;

        const span = chapterTotal(cine.era);
        const k = clamp01(cine.t / span);
        orbit(dt, k);
        updateText(cine.t, cine.era);

        // Animasi hologram era ini + LIPATAN era sebelumnya (transisi = proyeksi
        // lama turun ke meja sementara yang baru terbit; BUKAN ganti slide).
        const cur = eras[cine.era];
        if (cur) {
            cur.group.scale.y = Math.max(0.0001, smooth(clamp01(cine.t / Math.max(0.2, c.fadeInSec))));
            cur.anim(cine.t, k);
        }
        if (cine.era > 0) {
            const old = eras[cine.era - 1];
            const fold = 1 - smooth(clamp01(cine.t / Math.max(0.2, c.fadeInSec)));
            if (old && old.group.visible) {
                old.group.scale.y = Math.max(0.0001, fold);
                if (fold <= 0.002) old.group.visible = false;
            }
        }

        if (cine.t >= span) {
            if (cine.era + 1 < PROLOGUE_CHAPTERS.length) enterEra(cine.era + 1, false);
            else { cine.outro = true; cine.outroT = 0; setCineFade(1, c.fadeOutSec); }
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

// Satu orbit panjang: azimut/jarak/tinggi di-lerp dari beat era ini ke beat
// berikutnya, plus "napas" halus supaya kamera tak pernah benar-benar diam.
// Di era terakhir titik fokus PAN dari meja ke siluet MAJOR GIBRAN.
function orbit(dt, k) {
    const i = cine.era;
    const A = BEATS[i], B = (i + 1 < BEATS.length) ? BEATS[i + 1] : BEAT_END;
    const s = smooth(k);
    cine.az = lerp(A.az, B.az, s);
    cine.dist = lerp(A.dist, B.dist, s) + Math.sin(cine.total * 0.33) * 2.2;
    setCam(cine.az, cine.dist, lerp(A.h, B.h, s) + Math.sin(cine.total * 0.21) * 1.1);

    let tx = PRO.x, tz = PRO.z, ty = PIVOT_Y;
    if (i === PROLOGUE_CHAPTERS.length - 1) {
        const p = smooth(clamp01((k - 0.35) / 0.5));
        tx = PRO.x + GIB.x * p; tz = PRO.z + GIB.z * p; ty = lerp(PIVOT_Y, 17, p);
    }
    cine.fx = tx; cine.fz = tz;
    camera.position.set(tx, ty, tz);
    setCineFocus(tx, tz);        // pan halus (CINE_PAN_RATE), tanpa dead-zone
}

// Akhiri prolog → bersihkan sinematik & sembunyikan ruangan → SERAHKAN ke cutscene
// heli. `resumeScene` (BUKAN setScene) supaya `introScene.enter()` tidak jalan dua
// kali: dunia atap/kota sudah dibangun & fog aslinya sudah disimpan saat main.js
// memasang introScene di balik layar loading, dan mesin helinya sudah dipersenjatai
// beginIntro(). Tirai TETAP hitam di sini — frame pertama cutscene heli sendiri
// yang membukanya (mulus, tanpa kedip).
function finishPrologue() {
    cine = null;
    removeClick();
    hideCutsceneSkip();
    if (textEl) textEl.style.display = 'none';
    if (root) root.visible = false;
    setCineFade(1);
    resumeScene(introScene);
    const cb = doneCb; doneCb = null;
    if (cb) cb();
}

// Pemanasan: render ruangan dari beberapa sudut beat MASIH di balik layar loading
// (pola warmupIntro) — semua material/geometri hologram ter-compile & terunggah,
// jadi prolog tak nge-hitch di era mana pun.
export function warmupPrologue() {
    ensureWorld();
    if (root) root.visible = true;
    const render = () => { if (composer && postFxOn) composer.render(); else renderer.render(scene, viewCam); };
    // SEMUA hologram ditampilkan sekaligus selama pemanasan: `renderer.compile()`
    // hanya menyiapkan program, sedangkan geometri/tekstur baru benar-benar naik ke
    // GPU saat TERGAMBAR — tanpa ini, era yang pertama kali muncul di tengah prolog
    // bisa nge-hitch.
    const keep = eras.map(e => e.group.visible);
    for (const e of eras) { e.group.visible = true; e.group.scale.y = 1; }
    if (glowRed) glowRed.visible = true;
    if (glowAmber) glowAmber.visible = true;
    camera.position.set(PRO.x, PIVOT_Y, PRO.z);
    for (const b of [BEATS[0], BEATS[4], BEATS[8], BEAT_END]) {
        setCam(b.az, b.dist, b.h);
        followViewCam();   // snap viewCam ke pivot (lompatan > 400 = snap)
        render();
    }
    eras.forEach((e, i) => { e.group.visible = keep[i]; e.group.scale.y = keep[i] ? 1 : 0.0001; });
    if (glowRed) glowRed.visible = false;
    if (glowAmber) glowAmber.visible = false;
    setCam(BEATS[0].az, BEATS[0].dist, BEATS[0].h);
}
