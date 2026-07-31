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
// v3 (2026-08-04): prolog jadi SCENE THREE sungguhan — satu ruang gelap, satu meja
//     proyeksi, dan SATU shot kamera yang mengorbitnya dari awal sampai akhir. Tiap
//     era diproyeksikan di atas meja sebagai hologram (kota, emblem, robot pekerja,
//     jet, lini perakitan, barisan pasukan, peta kepulauan). Hologram memberi ALASAN
//     kenapa bentuknya sederhana — jadi terbaca sengaja, bukan keterbatasan.
//     Pergantian era BUKAN ganti slide: proyeksi lama MELIPAT turun ke dalam meja
//     sementara yang baru TERBIT dari meja (scale.y), kamera terus berjalan.
// v4 = INI (2026-07-31, permintaan user: "kok tempatnya di atap gedung sih? ubah
//     total latar tempatnya agar berada di atas meja meeting dan berada dalam ruang
//     meeting yang terlihat agak gelap"). Dua hal diganti, dan yang PERTAMA adalah
//     BUG, bukan selera:
//     (1) KAMERA v3 BERDIRI DI ATAS PLAFON. viewCam duduk di `pivot.y + camOff.y`
//         (renderer.followViewCam), sementara papan beat v3 menaruh `h` seolah itu
//         tinggi ABSOLUT — jadi era 2028 & 2045 sebenarnya di y 26+64=90 dan 26+68=94
//         padahal plafon ada di y 86: yang terlihat memang cuma pelat plafon dari
//         atas = persis "atap gedung". Assert "kamera di dalam ruangan" ikut lolos
//         karena `beatCamPos` juga lupa menambah PIVOT_Y. Sekarang `h` tiap beat =
//         TINGGI KAMERA ABSOLUT, `setCam` sendiri yang menurunkannya jadi ofset
//         (`h - pivotY`), dan `prologueDebug().height` melaporkan tinggi absolut itu
//         supaya smoke bisa mengunci kamera antara daun meja dan plafon TIAP FRAME.
//     (2) LATARNYA kini RUANG MEETING, bukan aula komando: 21,7 x 15,7 x 4,3 m,
//         berdinding lambris kayu, plafon berkisi dgn panel lampu redup, layar situasi
//         gelap di satu sisi, kredensa, pintu — dan sebuah MEJA MEETING PANJANG
//         (11 x 4,9 m) lengkap dgn dua belas kursi. Hologramnya berdiri DI ATAS DAUN
//         MEJA itu (bukan di atas tatakan bundar setinggi pinggang di ruang kosong),
//         diperkecil `HOLO_FIT` supaya tapaknya muat di daun meja. Kamera mengorbit
//         setinggi mata orang duduk/berdiri (9,5-17 u) — jadi dinding, plafon, kursi,
//         dan bahu para perwira SELALU ada di frame: itu yang membuat ruangan terbaca
//         sebagai ruangan. Ruangan sengaja GELAP: preset lampu 'night' milik intro heli
//         (amb .15 / hemi .2 / dir .32) dibiarkan apa adanya, penerangan datang dari
//         panel plafon + hologramnya sendiri.
// v5 (2026-07-31, permintaan user yang sama, dua putaran kemudian):
//     (a) "hilangkan orang/robot di ruangan itu" — SELURUH sosok manusia dibuang,
//         termasuk siluet MAJOR GIBRAN (user memilih eksplisit "hapus SEMUA"). Yang
//         tersisa cuma kursi-kursinya. Konsekuensinya penutup prolog dirancang ulang:
//         era 2045 TIDAK lagi PAN ke orang, melainkan DOLLY MASUK ke meja (dist 36→22)
//         sambil garis pandang merayap turun ke permukaan peta — prolog berakhir rapat
//         pada kepulauan gelap dgn satu titik amber di balik Bandung. Robot hanya ada
//         sebagai ISI HOLOGRAM, tak pernah sebagai benda nyata di ruangan; dijaga
//         assert "ruangan KOSONG dari sosok setinggi manusia". Kursi tetap boleh di
//         mana saja karena puncak sandarannya (7,6) selalu di bawah lensa, jadi ia
//         membingkai bawah frame tanpa pernah menutup hologram.
//     (b) "desain tembok dan atapnya terlalu polos, coba beri sedikit teksture lagi" —
//         dinding/plafon/lambris/karpet kini ber-`map` prosedural (wallTexture /
//         ceilTexture / woodTexture / carpetTexture, canvas 128² + RepeatWrapping).
//         SEMUA digambar ABU-ABU, tak pernah berwarna: three mengalikan map dengan
//         material.color, jadi warnanya tetap token PAL dan sapuan palet smoke tetap
//         lolos. Tekstur saja tak cukup di ruangan segelap ini, jadi ditambah RELIEF
//         geometris yang menangkap gradien panel plafon: pilaster tegak, rel kornis di
//         atas lambris, rusuk plafon sekunder, dan empat difuser AC.
// v6 (2026-07-31, permintaan user ketiga): "kameranya jangan bergerak ... kameranya
//     akan menyorot dari arah depan proyeksi hologram itu tepat ke arah layar yang di
//     belakangnya. kemudian, pindahkan semua teks itu ke dalam layar itu."
//     (a) SHOT TUNGGAL. Papan sembilan beat, orbit, dolly, dan "napas" DIHAPUS
//         seluruhnya (`orbit()` tak ada lagi). Kamera dipasang sekali di
//         `beginPrologue` lewat `SHOT` dan tak pernah disentuh lagi: az 0° = berdiri
//         di sisi +z, di depan proyeksi, menghadap lurus ke layar dinding utara.
//         Dijaga assert "kamera TIDAK BERGERAK sama sekali" (simpangan az/jarak/
//         tinggi/fokus tiap frame harus NOL, bukan sekadar kecil).
//     (b) NASKAH PINDAH KE LAYAR. Takarir DOM dibuang; teks digambar ke kanvas dan
//         dipasang sebagai tekstur pada layar briefing — benda yang sedang disorot.
//         `#prologue` tetap ada di HTML tapi SELALU display:none.
//     (c) KONSEKUENSI yang tak boleh dilepas: begitu kamera dikunci menghadap layar,
//         hologram dan layar BERBAGI FRAME, jadi siluet hologram bisa menimpa teks.
//         Karena itu HOLO_FIT turun 0,47 → 0,24 dan lensa naik ke 22 — lihat hitungan
//         `yOcc` di dekat HOLO_FIT. Mejanya ikut mengecil (78x34 → 56x26) supaya
//         proporsinya tetap masuk akal terhadap proyeksi yang lebih kecil.
//
// ===== NASKAH — MILIK USER, KATA PER KATA =====
// `PROLOGUE_CHAPTERS` = naskah resmi user (2026-08-02), disalin PERSIS: tak ada
// kata/tanda baca yang boleh diubah, dipadatkan, atau ditambah. Dipatok assert
// "PROLOG NASKAH" (perbandingan STRING PERSIS) di tools/smoke.mjs. Naskahnya
// ber-markup (`**tebal**`, `*miring*`, baris kosong = paragraf; kartu 2045 dua
// paragraf). Sejak v6 markup itu dibaca `parseRuns` dan digambar sebagai GAYA HURUF
// di kanvas layar (tebal/miring), bukan sebagai HTML — bintangnya tak pernah tampil.
// `renderInline`/`stripInline` TETAP diekspor: `stripInline` dipakai menghitung waktu
// baca, dan keduanya masih jadi kontrak markup yang diuji smoke.
//
// ===== MEKANIK (pola sama dgn intro campaign & intro Survival) =====
// * Scene NON-GAMEPLAY: semua hook gameplay no-op; `cinematicActive` (sudah di-set
//   beginIntro) membekukan kendali player, sementara `updateGame` TETAP memanggil
//   `updateMode` — mesin sinematik ada di sana. Mesin BERBASIS TIMER (deterministik,
//   bisa diuji headless tanpa RAF).
// * Durasi tiap era = `chapterTotal(i)` = fadeIn + `holdFor(i)` + fadeOut, yaitu
//   waktu baca yang MENGIKUTI panjang naskahnya (config-driven, lihat holdFor).
// * `camera` = PIVOT LOGIKA; sudut kamera lewat hook `camOffset` (objek `camOff`
//   dimutasi `setCam`) — persis cara monasIntro.js, HANYA SEKALI di beginPrologue.
//   Tak ada satu pun sistem yang menyentuh kamera setelah itu.
// * Titik fokus X/Z = pusat meja, tetap, dari era pertama sampai tirai turun.
// * DUNIA: ruang meeting dibangun SEKALI di x≈180000 (jauh dari dunia survival,
//   keempat dunia campaign, DAN dunia atap intro heli di 150000), `lightsKey` SENGAJA sama dgn
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
import { makeTexture, speckle } from '../../../utils/textures.js';
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

// ===== URUTAN TIAP ERA (v7, 2026-07-31, permintaan user) =====
// Naskah TIDAK lagi muncul sekaligus. Satu era dijalankan sebagai TIGA FASE
// berurutan di layar yang sama:
//   1. TAHUN  — fade in, huruf besar di TENGAH layar, tahan `yearHoldSec`, fade out.
//   2. JUDUL  — idem, `titleHoldSec`.
//   3. ISI    — diketik HURUF PER HURUF pada `typeCps` huruf/detik, lalu diam
//               `tailSec` detik sebelum era berikutnya.
// Semuanya CONFIG-DRIVEN (config/gameplay.json → campaign.prologue). `typeCps`
// adalah satu-satunya tuas kecepatan: user minta "jangan terlalu cepat agar orang
// bodoh pun bisa membacanya tanpa tertinggal", jadi default 20 huruf/detik ≈ 240
// kata/menit — sedikit di atas kecepatan baca nyaman, dan MENENTUKAN durasi total
// prolog (naskahnya ±2.900 huruf). Menurunkannya memperlambat seluruh prolog.
//
// `readSecPerWord`/`maxHoldSec` DIHAPUS dari config: model lama "tahan sekian detik
// per kata" tak berlaku lagi karena teks kini muncul seiring diketik. `holdSec`
// tinggal jadi LANTAI durasi fase isi (jaring pengaman kalau `typeCps` disetel tinggi).
// Jumlah huruf yang harus diketik. Diturunkan LAZY dari `bodyWords` — tokenizer yang
// sama dgn yang membangun tata letak layar — supaya mustahil berbeda dari jumlah huruf
// yang bisa digambar. Versi lama menghitungnya dari naskah polos dan itu meleset saat
// tokenizer memecah kata di batas markup: ketikan berhenti sebelum huruf terakhir.
let CHARS_CACHE = null;
function charsOf(i) {
    if (!CHARS_CACHE) CHARS_CACHE = PROLOGUE_CHAPTERS.map(ch => {
        const w = bodyWords(ch.body).filter(t => !t.br);
        return w.reduce((a, t) => a + t.w.length, 0) + Math.max(0, w.length - 1);
    });
    return CHARS_CACHE[i];
}
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

export const typeSecFor = (i) => charsOf(i) / Math.max(1, num(cfg().typeCps, 20));
export const yearSpan = () => { const c = cfg(); return 2 * num(c.yearFadeSec, 0.8) + num(c.yearHoldSec, 3); };
export const titleSpan = () => { const c = cfg(); return 2 * num(c.titleFadeSec, 0.8) + num(c.titleHoldSec, 3); };
// `holdFor(i)` = durasi FASE ISI (mengetik + jeda akhir). Namanya dipertahankan:
// artinya tetap "berapa lama naskah era ini di layar", dan ia masih ikut panjang teks.
export function holdFor(i) {
    const c = cfg();
    return Math.max(num(c.holdSec, 7.8), typeSecFor(i) + num(c.tailSec, 5));
}
export const chapterTotal = (i) => yearSpan() + titleSpan() + holdFor(i);

// Fase + selubung opasitas + berapa huruf yang sudah diketik pada detik `t` era ke-i.
// Dipisah dari rendering supaya bisa diuji headless tanpa kanvas.
export function phaseAt(i, t) {
    const c = cfg();
    const yF = num(c.yearFadeSec, 0.8), yH = num(c.yearHoldSec, 3);
    const tF = num(c.titleFadeSec, 0.8), tH = num(c.titleHoldSec, 3);
    const yEnd = 2 * yF + yH, tEnd = yEnd + 2 * tF + tH;
    const env = (u, fade, hold) => u < fade ? smooth(u / fade)
        : (u > fade + hold ? smooth(1 - (u - fade - hold) / fade) : 1);
    if (t < yEnd) return { phase: 'year', alpha: clamp01(env(t, yF, yH)), chars: 0 };
    if (t < tEnd) return { phase: 'title', alpha: clamp01(env(t - yEnd, tF, tH)), chars: 0 };
    // FASE ISI: opacity penuh selama mengetik & menunggu, baru redup di ujung jeda.
    const u = t - tEnd, body = holdFor(i), out = num(c.fadeOutSec, 1.1);
    // +1e-6: tepat di detik terakhir, u*cps bisa jatuh di 350,9999 karena float dan
    // huruf pamungkas jadi tak pernah muncul.
    const chars = Math.min(charsOf(i), Math.floor(u * Math.max(1, num(c.typeCps, 20)) + 1e-6));
    const a = u > body - out ? smooth(1 - (u - (body - out)) / out) : 1;
    return { phase: 'body', alpha: clamp01(a), chars };
}

// ===================== PANGGUNG =====================
// Ruang meeting duduk JAUH dari SEMUA dunia lain, dan daftar itu ada ENAM, bukan
// lima: survival di origin, campaign stage 1-4 di x≈30000/60000/90000/120000, DAN
// **dunia atap cutscene heli di x=150000** (`IX` di cutscenes/intro.js).
// BUG 2026-07-31: PRO dulu 150000 = PERSIS di atas dunia atap intro — gedung atap,
// parapet, dan kota latarnya berdiri menembus ruang meeting ini. Dipindah ke 180000
// (30.000 unit dari tetangga terdekat, jauh di luar `camera.far` 4000).
// Dijaga assert "panggung prolog tak menumpuk dunia lain" (smoke).
export const PRO = { x: 180000, z: 0 };
// RUANG MEETING pada skala game (1 m ≈ 7 u) = 21,7 x 15,7 m, plafon 4,3 m. Ukurannya
// DITENTUKAN KAMERANYA: orbit terjauh 43 u + "napas" 2,2 u harus tetap punya jarak
// ke dinding, dan tinggi kamera tertinggi (17) harus di bawah plafon — kalau tidak,
// kamera berdiri di luar/di atas ruangan dan yang terlihat cuma punggung dinding
// atau pelat plafon (persis bug v3). Dijaga assert "kamera selalu DI DALAM ruangan".
export const ROOM = { w: 152, d: 110, h: 30 };
// MEJA MEETING panjang (11 x 4,9 m, daun setinggi 0,9 m) — hologram berdiri DI ATAS
// daun ini, bukan di atas tatakan bundar di ruang kosong seperti v3.
export const TABLE = { len: 56, wid: 26, top: 6.4 };
// Hologram dibangun dalam satuan LOKAL-nya sendiri (radius bidang HOLO_R), lalu
// SELURUH grupnya diperkecil HOLO_FIT. Sejak SHOT TUNGGAL (v6) angkanya turun
// 0.47 → 0.24, dan alasannya bukan selera melainkan HITUNGAN: hologram kini harus
// BERBAGI FRAME dgn layar teks di belakangnya. Puncak proyeksi diproyeksikan dari
// lensa ke bidang layar (`yOcc` = camY + (holoTop-camY)·D/d); supaya jatuh di BAWAH
// tepi bawah layar (9), puncaknya harus jauh di bawah mata kamera. Pada 0.47
// puncaknya y 23 = DI ATAS lensa → siluetnya menutupi seluruh layar; pada 0.24
// puncaknya 15,3 → yOcc 3,5, layar bersih total. Dijaga assert "siluet hologram
// jatuh di BAWAH layar" — kalau HOLO_FIT dinaikkan lagi, assert itu yang gagal.
const HOLO_R = 34;
export const HOLO_FIT = 0.24;
const HOLO_Y = TABLE.top + 0.25;               // dasar semua hologram = tepat di daun meja

// LAYAR BRIEFING di dinding utara — di sinilah SELURUH naskah ditulis sejak v6
// (dulu takarir DOM di atas pita letterbox). Membentang dari puncak lambris (9)
// sampai tepat di bawah rusuk plafon (29).
export const SCREEN = { w: 120, h: 20, y: 19 };   // membentang y 9..29

// ===== SHOT TUNGGAL (v6, 2026-07-31: "kameranya jangan bergerak") =====
// Kamera DIAM di depan proyeksi (sisi +z, az 0°) menghadap lurus ke layar di
// dinding seberang. Tak ada orbit, tak ada dolly, tak ada "napas" — satu frame
// terkunci dari era 2028 sampai 2045; yang berubah hanya hologram di meja dan
// teks di layar. Angkanya saling terkunci, jangan diubah satu-satu:
//   * h 22 > puncak hologram 15,3  -> siluet hologram tak menimpa layar (yOcc 3,5).
//   * pivot 24 -> viewCam memandang y 16 (pivot-8), yaitu 6 unit di bawah lensa =
//     turun ±11°: cukup untuk memasukkan daun meja ke frame, cukup datar untuk
//     tetap terbaca "menyorot lurus ke layar".
//   * dist 30 -> daun meja (y 6,4) baru masuk frame pada jarak 23 u, jadi tepi
//     meja terdekat jatuh di luar bawah layar dan yang terlihat justru permukaannya.
export const SHOT = { az: 0, dist: 30, h: 22, pivot: 24 };

// Posisi kamera DUNIA-relatif-ruangan untuk shot itu — `y` tinggi ABSOLUT, sama
// dengan yang benar-benar dipakai viewCam (lihat catatan v4). Dipakai assert.
export function shotCamPos() {
    const a = SHOT.az * Math.PI / 180;
    return { x: Math.sin(a) * SHOT.dist, y: SHOT.h, z: Math.cos(a) * SHOT.dist };
}

const camOff = { x: 0, y: 0, z: SHOT.dist };   // objek MUTABLE yang dibaca renderer
let camY = SHOT.h;                             // tinggi kamera ABSOLUT (dibaca debug)
// `height` = tinggi ABSOLUT yang diinginkan; renderer menaruh viewCam di
// `pivot.y + camOff.y`, jadi ofsetnya = tinggi - tinggi pivot (boleh negatif).
function setCam(azDeg, dist, height, pivotY) {
    const a = azDeg * Math.PI / 180;
    camOff.x = Math.sin(a) * dist;
    camOff.z = Math.cos(a) * dist;
    camOff.y = height - pivotY;
    camY = height;
}

// ===== State modul =====
let root = null, built = false, MATS = null;
let eras = [];                 // { key, group, anim(t,k) } per era
let glowRed = null, glowAmber = null;
let cine = null;               // mesin sinematik (null = tidak berjalan)
let doneCb = null, started = false, clickHandler = null;
let textEl = null;             // hanya dipakai untuk MEMASTIKAN takarir DOM lama tersembunyi

export const prologueDebug = () => ({
    active: !!cine, started, built,
    era: cine ? cine.era : -1, count: PROLOGUE_CHAPTERS.length,
    chapter: cine ? PROLOGUE_CHAPTERS[cine.era].title : null,
    hold: cine ? holdFor(cine.era) : 0,
    // Isi LAYAR (menggantikan bodyHtml takarir DOM): apa yang benar-benar tergambar.
    screen: screenInfo, screenAlpha: SCR ? SCR.mat.opacity : 0,
    // sinematografi (dibaca assert): sudut kamera, jarak, TINGGI ABSOLUT, titik fokus.
    // `height` sengaja tinggi absolut (bukan camOff.y) supaya smoke bisa membuktikan
    // kamera tetap di dalam ruangan tiap frame — v3 gagal justru di situ.
    az: cine ? cine.az : 0, dist: cine ? cine.dist : 0, height: camY,
    room: { w: ROOM.w, d: ROOM.d, h: ROOM.h, tableTop: TABLE.top },
    focus: cine ? { x: cine.fx, z: cine.fz } : { x: 0, z: 0 },
    visibleEras: eras.map((e, i) => e.group.visible ? i : -1).filter(i => i >= 0),
    outro: !!(cine && cine.outro),
});

// ===================== MATERIAL =====================
// Satu set material dipakai SELURUH ruangan & hologram (dibuat sekali): makin
// sedikit material, makin sedikit program shader. Semuanya ikut ter-compile
// `renderer.compile()` + `warmupPrologue()` selagi layar loading masih menutup —
// invarian "tak ada rekompilasi shader di tengah permainan".
// ===== TEKSTUR PROSEDURAL RUANGAN (2026-07-31, permintaan user: "desain tembok
// dan atapnya terlalu polos, coba beri sedikit teksture lagi") =====
// SEMUANYA digambar dalam ABU-ABU, bukan warna: three MENGALIKAN `map` dengan
// `material.color`, jadi warna permukaan tetap token PAL (aturan GIBS 2045 &
// sapuan palet smoke) dan teksturnya hanya modulasi terang-gelap. Basis sengaja
// terang (±0.85) supaya perkalian tidak menggelapkan dinding lebih jauh dari yang
// dimaksud. Kanvas kecil (128²) + RepeatWrapping = biaya memori nyaris nol.
// Repeat dihitung per permukaan (satu material per ukuran dinding), kalau tidak
// dinding panjang dan dinding pendek akan punya kerapatan tekstur berbeda.
function wallTexture(repX, repY) {
    return makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#c8c8c8', '#e6e6e6', '#d0d0d0'], 130, 1, 4);           // butiran plester
        g.fillStyle = '#a9a9a9';                                                  // nat vertikal antar panel
        g.fillRect(0, 0, 2, h); g.fillRect(w / 2 - 1, 0, 2, h);
        g.fillStyle = '#b8b8b8'; g.fillRect(0, h * 0.5 - 1, w, 2);                // nat horizontal
        g.fillStyle = '#e9e9e9'; g.fillRect(0, h * 0.5 + 1, w, 1);                // sorot tipis di bawah nat
    }, repX, repY);
}
function ceilTexture(repX, repY) {
    return makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#d2d2d2'; g.fillRect(0, 0, w, h);
        for (let y = 7; y < h; y += 9) for (let x = 7; x < w; x += 9) {           // lubang ubin akustik
            g.fillStyle = '#aeaeae'; g.fillRect(x, y, 2, 2);
        }
        g.fillStyle = '#9c9c9c'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);  // nat ubin
        speckle(g, w, h, ['#c2c2c2', '#dedede'], 60, 1, 3);
    }, repX, repY);
}
function woodTexture(repX, repY) {
    return makeTexture(64, 128, (g, w, h) => {
        g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 30; i++) {                                            // serat kayu memanjang
            g.fillStyle = i % 2 ? '#c4c4c4' : '#ececec';
            g.fillRect(0, Math.random() * h, w, 0.6 + Math.random() * 1.8);
        }
        g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, w, 1.5);                        // nat antar papan
    }, repX, repY);
}
function carpetTexture(repX, repY) {
    return makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#c2c2c2', '#e4e4e4', '#cdcdcd'], 220, 1, 3);           // anyaman kasar
    }, repX, repY);
}

function ensureMats() {
    if (MATS) return MATS;
    const holo = (color, opacity) => new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const T = 24;                                       // satu petak tekstur ≈ 24 unit (3,4 m)
    MATS = {
        floor: new THREE.MeshLambertMaterial({ color: PAL.rubber }),         // lantai (paling gelap)
        carpet: new THREE.MeshLambertMaterial({ color: PAL.ink, map: carpetTexture(ROOM.w / T, ROOM.d / T) }),
        // Dinding panjang & pendek punya material sendiri HANYA karena repeat-nya
        // beda — kalau dishare, satu sisi ruangan teksturnya melar.
        wall: new THREE.MeshLambertMaterial({ color: PAL.gunmetal, map: wallTexture(ROOM.w / T, ROOM.h / T) }),
        wallEnd: new THREE.MeshLambertMaterial({ color: PAL.gunmetal, map: wallTexture(ROOM.d / T, ROOM.h / T) }),
        ceil: new THREE.MeshLambertMaterial({ color: PAL.gunmetal, map: ceilTexture(ROOM.w / T, ROOM.d / T) }),
        wood: new THREE.MeshLambertMaterial({ color: PAL.wood, map: woodTexture(6, 1) }),   // lambris
        woodTop: new THREE.MeshLambertMaterial({ color: PAL.wood, map: woodTexture(3, 1.4) }), // daun meja
        trim: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.rubber }),          // siluet perwira/Gibran + kursi
        screen: new THREE.MeshBasicMaterial({ color: PAL.screenBg }),        // layar dinding (mati)
        strip: holo(PAL.techDim, 0.5),                                       // strip lampu dinding
        lamp: holo(PAL.white, 0.16),                                         // panel lampu plafon (redup)
        holo: holo(PAL.tech, 0.5),                                           // hologram utama
        holoSoft: holo(PAL.tech, 0.22),                                      // lapis samar (grid/tapak)
        holoFaint: holo(PAL.tech, 0.06),                                     // kerucut proyektor (sangat samar)
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

// Kursi meeting (sandaran menghadap -z = membelakangi meja saat diputar). SENGAJA
// PENDEK: puncak sandaran 7,6 < titik terendah yang pernah ditempati kamera (±8,6
// — beat 2043 setinggi 9,5 dikurangi "napas" 1,1), jadi kursi boleh berdiri di mana
// saja termasuk tepat di depan lensa: ia membingkai bawah frame, tak pernah menutup
// hologram. Dijaga assert "kursi lebih pendek dari kamera terendah" (smoke).
function chair(mat) {
    const g = new THREE.Group();
    put(g, box(5.6, 0.5, 5.6, mat), 0, 0.25, 0);        // kaki bintang
    put(g, cyl(0.8, 0.8, 3.1, 8, mat), 0, 1.8, 0);      // tiang
    put(g, box(7, 0.9, 6.6, mat), 0, 3.7, 0);           // dudukan
    put(g, box(7, 4.4, 0.9, mat), 0, 5.4, -2.8);        // sandaran (puncak 7,6)
    return g;
}

// Kanvas teks layar: SATU kanvas + SATU CanvasTexture dibuat sekali, digambar ulang
// (needsUpdate) tiap era. Sengaja BUKAN tekstur baru per era — 9 tekstur besar berarti
// 9 unggahan GPU baru di tengah prolog. Latarnya transparan supaya panel gelap di
// belakangnya tetap terlihat dan fade cukup lewat opacity material.
function makeScreenText() {
    const c = document.createElement('canvas');
    c.width = TXT.w; c.height = TXT.h;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    // Warna material WAJIB token PAL (sapuan palet smoke): warna huruf sendiri
    // sudah dibakar di kanvas, dan PAL.white cuma menghangatkannya sedikit.
    const mat = new THREE.MeshBasicMaterial({
        color: PAL.white, map: tex, transparent: true, opacity: 0, depthWrite: false,
    });
    return { canvas: c, ctx: c.getContext('2d'), tex, mat };
}

// ===================== DUNIA =====================
export function ensureWorld() {
    if (built) return root;
    built = true;
    const M = ensureMats();
    root = new THREE.Group();
    root.position.set(PRO.x, 0, PRO.z);
    scene.add(root);

    const HW = ROOM.w / 2, HD = ROOM.d / 2;

    // --- kulit ruangan: lantai berkarpet, empat dinding berlambris kayu, plafon
    // berkisi (gelap; TANPA PointLight sama sekali — penerangan datang dari panel
    // plafon & hologramnya, semuanya material Basic aditif) ---
    put(root, box(ROOM.w, 2, ROOM.d, M.floor), 0, -1, 0);
    put(root, box(ROOM.w - 40, 0.3, ROOM.d - 30, M.carpet), 0, 0.15, 0);          // karpet ruang rapat
    put(root, box(ROOM.w, 2, ROOM.d, M.ceil), 0, ROOM.h + 1, 0);                  // plafon (sisi bawah tepat di ROOM.h)
    put(root, box(ROOM.w, ROOM.h, 3, M.wall), 0, ROOM.h / 2, -HD);                // dinding utara
    put(root, box(ROOM.w, ROOM.h, 3, M.wall), 0, ROOM.h / 2, HD);                 // selatan
    put(root, box(3, ROOM.h, ROOM.d, M.wallEnd), -HW, ROOM.h / 2, 0);             // barat
    put(root, box(3, ROOM.h, ROOM.d, M.wallEnd), HW, ROOM.h / 2, 0);              // timur
    // RELIEF DINDING (2026-07-31): pilaster tegak + rel kornis tepat di atas lambris.
    // Tekstur saja tak cukup di ruangan segelap ini — yang benar-benar memecah bidang
    // polos adalah geometri yang menangkap gradien cahaya panel plafon. Pilaster
    // sengaja HANYA di tempat yang tak ditempati layar/pintu/kredensa.
    for (const sz of [-1, 1]) for (const px of [-62, 62])
        put(root, box(3.4, ROOM.h, 1.8, M.trim), px, ROOM.h / 2, sz * (HD - 2.4));
    for (const px of [-40, 0]) put(root, box(3.4, ROOM.h, 1.8, M.trim), px, ROOM.h / 2, HD - 2.4);
    // Sisi timur/barat HANYA di z ±38: di antaranya ada papan kaca (z -17..29) dan
    // kredensa (z -28..16) — pilaster di sana akan menembusnya.
    for (const sx of [-1, 1]) for (const pz of [-38, 38])
        put(root, box(1.8, ROOM.h, 3.4, M.trim), sx * (HW - 2.4), ROOM.h / 2, pz);
    put(root, box(ROOM.w, 1.1, 2.2, M.trim), 0, 9.5, -HD + 2.4);                  // kornis di atas lambris
    put(root, box(ROOM.w, 1.1, 2.2, M.trim), 0, 9.5, HD - 2.4);
    put(root, box(2.2, 1.1, ROOM.d, M.trim), -HW + 2.4, 9.5, 0);
    put(root, box(2.2, 1.1, ROOM.d, M.trim), HW - 2.4, 9.5, 0);
    // Lambris kayu setinggi pinggang — isyarat "ruang rapat", bukan hanggar. Sisi
    // selatan DIPOTONG di lubang pintu (x 16..36): kalau menerus, kusen & daun pintu
    // berimpit muka dgn lambris = z-fighting.
    put(root, box(ROOM.w, 9, 1.2, M.wood), 0, 4.5, -HD + 2.1);
    put(root, box(92, 9, 1.2, M.wood), -30, 4.5, HD - 2.1);
    put(root, box(40, 9, 1.2, M.wood), 56, 4.5, HD - 2.1);
    put(root, box(1.2, 9, ROOM.d, M.wood), -HW + 2.1, 4.5, 0);
    put(root, box(1.2, 9, ROOM.d, M.wood), HW - 2.1, 4.5, 0);
    // KISI PLAFON: rusuk utama + rusuk sekunder yang lebih tipis di antaranya
    // (plafon polos = bidang paling besar & paling membosankan di frame; ubin
    // akustiknya sendiri datang dari `M.ceil`), enam panel lampu redup, dan empat
    // difuser udara. Semua MENEMPEL sisi bawah plafon, bukan menggantung dgn celah.
    for (let i = -2; i <= 2; i++) put(root, box(ROOM.w - 6, 1.1, 2, M.trim), 0, ROOM.h - 0.55, i * 22);
    for (let i = -1; i <= 1; i++) put(root, box(2, 1.1, ROOM.d - 6, M.trim), i * 44, ROOM.h - 0.55, 0);
    for (let i = -2; i <= 1; i++) put(root, box(ROOM.w - 6, 0.5, 0.9, M.trim), 0, ROOM.h - 0.3, i * 22 + 11);
    for (const px of [-22, 22, -66, 66]) put(root, box(0.9, 0.5, ROOM.d - 6, M.trim), px, ROOM.h - 0.3, 0);
    for (let ix = -1; ix <= 1; ix++) for (const iz of [-1, 1])
        put(root, box(30, 0.5, 11, M.lamp), ix * 44, ROOM.h - 0.25, iz * 22);
    for (const [dx, dz] of [[-62, -38], [62, -38], [-62, 38], [62, 38]]) {
        put(root, box(9, 1, 9, M.trim), dx, ROOM.h - 0.7, dz);                    // difuser AC
        put(root, box(7.4, 0.4, 7.4, M.screen), dx, ROOM.h - 1.3, dz);
    }
    // ===== LAYAR BRIEFING (v6, 2026-07-31) — inilah yang disorot kamera dan tempat
    // SELURUH naskah prolog ditulis. Menggantikan deret tiga layar mati yang dulu
    // menempel di dinding ini. Tiga lapis, dari dinding ke arah kamera:
    //   (1) bingkai logam, (2) panel gelap (latar), (3) bidang TEKS berlatar
    // transparan yang opasitasnya di-fade tiap era (lihat updateScreenText).
    put(root, box(SCREEN.w + 4, SCREEN.h + 4, 0.8, M.trim), 0, SCREEN.y, -HD + 1.8);
    put(root, box(SCREEN.w, SCREEN.h, 0.6, M.screen), 0, SCREEN.y, -HD + 2.3);
    put(root, box(SCREEN.w + 4, 0.8, 1, M.strip), 0, SCREEN.y - SCREEN.h / 2 - 2.4, -HD + 2.3);
    SCR = makeScreenText();
    put(root, box(SCREEN.w - 5, SCREEN.h - 3, 0.2, SCR.mat), 0, SCREEN.y, -HD + 2.75);
    // pintu di dinding selatan (kusen menempel dinding, daun DI DEPAN kusen supaya
    // benar-benar terlihat) + papan kaca di dinding timur + kredensa di barat
    put(root, box(20, 23, 1.2, M.trim), 26, 11.5, HD - 2.1);
    put(root, box(16, 19.5, 0.6, M.wood), 26, 9.9, HD - 2.8);
    put(root, box(20, 0.6, 1, M.strip), 26, 23.8, HD - 2.1);
    put(root, box(1, 18, 46, M.screen), HW - 2.6, 18, 6);
    put(root, box(8, 7, 44, M.wood), -HW + 7, 3.5, -6);
    put(root, box(9, 0.8, 45, M.trim), -HW + 7, 7.4, -6);

    // --- MEJA MEETING: daun kayu + dua kaki plinth + tapak proyeksi bercahaya
    // yang tertanam di daunnya (di sinilah hologram berdiri) ---
    put(root, box(TABLE.len, 1.3, TABLE.wid, M.woodTop), 0, TABLE.top - 0.65, 0);
    put(root, box(TABLE.len + 1.6, 0.5, TABLE.wid + 1.6, M.trim), 0, TABLE.top - 1.45, 0);
    for (const sx of [-1, 1]) put(root, box(12, TABLE.top - 1.6, 16, M.trim), sx * 16, (TABLE.top - 1.6) / 2, 0);
    const plate = HOLO_R * HOLO_FIT;                                              // radius tapak proyeksi di daun meja
    put(root, cyl(plate, plate, 0.5, 32, M.holoSoft), 0, TABLE.top + 0.05, 0);
    glowRed = put(root, cyl(plate, plate, 0.5, 32, M.holoHot), 0, TABLE.top + 0.12, 0);
    glowAmber = put(root, cyl(plate, plate, 0.5, 32, M.holoWarm), 0, TABLE.top + 0.19, 0);
    glowRed.visible = false; glowAmber.visible = false;
    // proyektor plafon (menempel plafon) + kerucut cahaya sangat samar turun ke daun
    // meja. Kerucutnya menyempit ke ATAS: radius bawahnya = tapak proyeksi di meja.
    const lensY = ROOM.h - 3.9;                                                   // sisi bawah lensa proyektor
    put(root, box(9, 3, 9, M.trim), 0, ROOM.h - 1.8, 0);
    put(root, cyl(2.4, 2.4, 1.2, 12, M.strip), 0, lensY + 0.6, 0);
    put(root, cyl(2.6, plate + 2, lensY - TABLE.top, 20, M.holoFaint),
        0, TABLE.top + (lensY - TABLE.top) / 2, 0);

    // --- DUA BELAS KURSI mengelilingi meja. Kursi boleh berdiri di mana saja:
    // puncak sandarannya (8,3) selalu di bawah kamera terendah (9,5). ---
    const SEATS = [];
    for (const sz of [-1, 1]) for (const cx of [-19, -9.5, 0, 9.5, 19]) SEATS.push([cx, sz * 17, sz]);
    SEATS.push([-33, 0, 0], [33, 0, 0]);
    for (const [cx, cz, sz] of SEATS) {
        const c = chair(M.dark);
        c.position.set(cx, 0, cz);
        c.rotation.y = sz ? (sz > 0 ? Math.PI : 0) : Math.atan2(-cx, 0);   // sandaran membelakangi meja
        root.add(c);
    }

    // --- TIDAK ADA SOSOK MANUSIA DI RUANGAN INI (2026-07-31, permintaan user
    // "hilangkan orang/robot di ruangan itu"). Sebelumnya ada empat perwira duduk,
    // dua pengamat berdiri, dan siluet MAJOR GIBRAN di ujung ruangan. Ruangannya
    // sekarang KOSONG: kursi-kursinya saja yang tersisa, dan itu justru bekerja —
    // ruang rapat kosong dgn proyeksi masih menyala terbaca sebagai arsip/rekaman.
    // Robot HANYA ada sebagai isi hologram di atas meja, tak pernah sebagai benda
    // nyata di ruangan. Dijaga assert "ruangan KOSONG dari sosok setinggi manusia".

    // --- hologram tiap era: SEMUA dibangun sekarang, ditampilkan bergantian.
    // Grupnya diperkecil HOLO_FIT (x/z tetap, y dipakai animasi LIPAT/TERBIT). ---
    eras = PROLOGUE_CHAPTERS.map((ch) => {
        const b = HOLO[ch.holo]();
        b.group.position.set(0, HOLO_Y, 0);
        b.group.visible = false;
        b.group.scale.set(HOLO_FIT, 0.0001, HOLO_FIT);
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
        put(g, cyl(HOLO_R - 6, HOLO_R - 6, 0.4, 32, M.holoSoft), 0, 0.2, 0);
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
        put(g, cyl(HOLO_R - 8, HOLO_R - 8, 0.4, 32, M.holoSoft), 0, 0.2, 0);
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
        const ring = put(g, cyl(HOLO_R - 5, HOLO_R - 5, 0.5, 32, M.holoHot), 0, 0.3, 0);
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
        put(g, cyl(HOLO_R - 5, HOLO_R - 5, 0.4, 32, M.holoSoft), 0, 0.2, 0);
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
                // Dulu proyeksi MENYUSUT di paruh kedua (kamera pergi ke Gibran, ruangan
                // menggelap). Sejak sosok Gibran dihapus kamera justru MENDEKAT ke peta
                // ini — menyusutkannya akan menjauhkan subjek dari lensa, jadi petanya
                // ditahan penuh dan yang menguat hanya benteng terakhirnya.
                halo.position.y = 0.7 + 0.25 * smooth(clamp01((k - 0.45) / 0.5));
            }
        };
    },
};

// ===================== TEKS DI LAYAR RUANGAN =====================
// v6 (2026-07-31, permintaan user "pindahkan semua teks itu ke dalam layar itu"):
// naskah TIDAK LAGI ditulis sebagai takarir DOM di atas pita letterbox — ia digambar
// ke KANVAS dan dipasang sebagai tekstur pada layar briefing di dinding utara, yaitu
// benda yang sedang disorot kamera. Elemen DOM `#prologue` tetap ada tapi SELALU
// disembunyikan (dibiarkan di HTML supaya tak ada perubahan markup yang menganggur).
//
// Kenapa kanvas TERPISAH dari panel layarnya: latar layar harus tetap gelap solid,
// sementara TEKS-nya harus bisa fade-in/out tiap era. Jadi teks digambar pada kanvas
// BERLATAR TRANSPARAN lalu dipasang di bidang tipis DI DEPAN panel, dan yang
// dianimasikan cuma `material.opacity` bidang itu — nol kerja per frame, tak ada
// kanvas yang digambar ulang selain saat era berganti.
//
// TATA LETAK dua kolom, karena layarnya lebar (6:1): kolom kiri = TAHUN (amber) +
// JUDUL, kolom kanan = badan naskah. Ukuran font badan MENGECIL OTOMATIS sampai
// muat (era 2045 dua paragraf & hampir 2x era terpendek); tanpa ini paragraf
// terpanjang akan terpotong keluar kanvas.
const TXT = { w: 2048, h: 303, padX: 56, padY: 26, col1: 600, gap: 56 };   // 6,76:1 = aspek bidang teks
const FONT = (px, b, it) => (it ? 'italic ' : '') + (b ? 'bold ' : '') +
    px + 'px "Courier Prime", "Courier New", monospace';
const CSS_AMBER = '#ffb03b', CSS_TEXT = '#e8e4da', CSS_RULE = '#2fb8a6';

let SCR = null;          // { canvas, ctx, tex, mat }
let screenKey = '';      // fase+jumlah huruf yang SEDANG tergambar (anti gambar-ulang sia-sia)
let screenInfo = { era: -1, year: '', title: '', text: '', bold: 0, italic: 0, px: 0, lines: 0 };

// `**tebal**` / `*miring*` -> daftar potongan bergaya. Naskahnya milik user dan
// TIDAK BOLEH berubah, jadi penandanya dibaca sebagai GAYA, bukan dibuang.
function parseRuns(src) {
    const out = [];
    let rest = String(src), m;
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/;
    while ((m = re.exec(rest))) {
        if (m.index > 0) out.push({ text: rest.slice(0, m.index), b: false, i: false });
        if (m[2] != null) out.push({ text: m[2], b: true, i: false });
        else out.push({ text: m[3], b: false, i: true });
        rest = rest.slice(m.index + m[0].length);
    }
    if (rest) out.push({ text: rest, b: false, i: false });
    return out;
}

// Naskah -> daftar KATA; baris kosong jadi penanda ganti paragraf (`br`).
//
// BUG 2026-07-31 yang diperbaiki di sini: versi sebelumnya memecah teks per RUN
// markup DULU baru per spasi, sehingga `**Bandung**,` jadi DUA kata ("Bandung" dan
// ",") dan `(*General ... Architecture*)` jadi "(" + kata-kata + ")". Akibatnya
// (a) jumlah kata layar > jumlah kata naskah polos, jadi penghitung ketikan habis
// SEBELUM huruf terakhir digambar — teks berhenti sebelum selesai di era 2029/2030/
// 2040/2045; dan (b) tanda baca terpisah spasi ("Bandung ,").
// Sekarang PEMISAHNYA SPASI, TITIK. Satu kata boleh berisi beberapa potongan gaya
// (`parts`), jadi "**Bandung**," tetap SATU kata dgn dua potongan: "Bandung" tebal
// dan "," biasa. Dijaga assert "jumlah huruf layar == jumlah huruf naskah polos".
function bodyWords(src) {
    const out = [];
    String(src).split(/\n\s*\n/).forEach((para, pi) => {
        if (pi) out.push({ br: true });
        let cur = null;
        for (const r of parseRuns(para)) {
            for (const chunk of r.text.split(/(\s+)/)) {
                if (!chunk) continue;
                if (/^\s+$/.test(chunk)) { if (cur) { out.push(cur); cur = null; } continue; }
                if (!cur) cur = { w: '', parts: [] };
                cur.w += chunk;
                cur.parts.push({ t: chunk, b: r.b, i: r.i });
            }
        }
        if (cur) out.push(cur);
    });
    return out;
}

// Lebar satu kata = jumlah lebar potongannya (tiap potongan bisa beda gaya huruf).
function wordWidth(g, it, px) {
    let w = 0;
    for (const pt of it.parts) { g.font = FONT(px, pt.b, pt.i); w += g.measureText(pt.t).width; }
    return w;
}

// Gambar satu kata mulai x. `limit` = maksimal huruf yang boleh tampil (mesin ketik);
// mengembalikan { x, drawn } supaya pemanggil tahu persis apa yang TERGAMBAR.
function drawWord(g, it, x, y, px, color, limit) {
    let cx = x, left = (limit == null ? Infinity : limit), drawn = '';
    g.fillStyle = color;
    for (const pt of it.parts) {
        if (left <= 0) break;
        const t = left >= pt.t.length ? pt.t : pt.t.slice(0, left);
        g.font = FONT(px, pt.b, pt.i);
        g.fillText(t, cx, y);
        cx += g.measureText(t).width;
        left -= t.length; drawn += t;
    }
    return { x: cx, drawn };
}

function wrapWords(g, words, px, maxW) {
    const lines = [];
    let cur = [], w = 0;
    g.font = FONT(px, false, false);
    const spaceW = g.measureText(' ').width;
    for (const it of words) {
        if (it.br) { lines.push(cur); cur = []; w = 0; continue; }
        const ww = wordWidth(g, it, px);
        const add = (cur.length ? spaceW : 0) + ww;
        if (cur.length && w + add > maxW) { lines.push(cur); cur = [it]; w = ww; }
        else { cur.push(it); w += add; }
    }
    if (cur.length) lines.push(cur);
    return lines;
}

// TATA LETAK ISI dihitung SEKALI per era lalu disimpan. Wajib: kalau dibungkus ulang
// tiap huruf, baris akan mengalir-ulang saat mengetik dan teks tampak "melompat".
// `total` = jumlah huruf termasuk pemisah antar kata — sama persis dgn CHARS[i],
// karena tiap jeda kata (spasi ATAU ganti baris) dihitung satu huruf.
let bodyLayout = null;   // { era, lines, px, lh, total }

function layoutBody(i) {
    if (bodyLayout && bodyLayout.era === i) return bodyLayout;
    const g = SCR.ctx, words = bodyWords(PROLOGUE_CHAPTERS[i].body);
    const colW = TXT.w - TXT.padX * 2, avail = TXT.h - TXT.padY * 2;
    let px = 40, lines = wrapWords(g, words, px, colW);
    while (px > 24 && lines.length * (px * 1.34) > avail) { px -= 2; lines = wrapWords(g, words, px, colW); }
    let total = 0;
    for (const ln of lines) for (const it of ln) total += it.w.length + 1;
    bodyLayout = { era: i, lines, px, lh: px * 1.34, total: Math.max(0, total - 1) };
    return bodyLayout;
}

// Satu baris besar di TENGAH layar (fase tahun & judul). Judul panjang dibungkus.
function drawCentered(txt, px, color, bold) {
    const g = SCR.ctx;
    const words = String(txt).trim().split(/\s+/).filter(Boolean)
        .map(w => ({ w, parts: [{ t: w, b: !!bold, i: false }] }));
    const maxW = TXT.w - TXT.padX * 2;
    let size = px, lines = wrapWords(g, words, size, maxW);
    while (size > 28 && lines.length > 2) { size -= 4; lines = wrapWords(g, words, size, maxW); }
    const lh = size * 1.24, y0 = (TXT.h - lines.length * lh) / 2;
    g.textAlign = 'left';
    for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        g.font = FONT(size, false, false);
        const spaceW = g.measureText(' ').width;
        let wsum = 0;
        for (let q = 0; q < line.length; q++) wsum += wordWidth(g, line[q], size) + (q ? spaceW : 0);
        let cx = TXT.w / 2 - wsum / 2;                      // rata tengah, dihitung sendiri
        for (let q = 0; q < line.length; q++) {
            if (q) cx += spaceW;
            cx = drawWord(g, line[q], cx, y0 + n * lh, size, color).x;
        }
    }
    return size;
}

// Gambar layar untuk fase `mode`. Dipanggil saat fase berganti DAN saat jumlah huruf
// bertambah (mesin ketik) — bukan tiap frame: setiap panggilan = satu unggah tekstur.
function drawScreen(i, mode, nChars) {
    if (!SCR) return;
    const ch = PROLOGUE_CHAPTERS[i], g = SCR.ctx;
    g.clearRect(0, 0, TXT.w, TXT.h);
    g.textBaseline = 'top';
    let px = 0, lineCount = 0, shown = '';

    if (mode === 'year') {
        px = drawCentered(ch.year, 104, CSS_AMBER, true);
        lineCount = 1; shown = ch.year;
    } else if (mode === 'title') {
        px = drawCentered(ch.title, 72, CSS_TEXT, true);
        lineCount = 1; shown = ch.title;
    } else {
        const L = layoutBody(i);
        px = L.px; lineCount = L.lines.length;
        const n = Math.max(0, Math.min(L.total, nChars | 0));
        let seen = 0, caret = null, first = true, sep = false;
        const drawnParts = [];
        g.textAlign = 'left';
        outer:
        for (let r = 0; r < L.lines.length; r++) {
            const y = TXT.padY + r * L.lh;
            g.font = FONT(L.px, false, false);
            const spaceW = g.measureText(' ').width;
            let cx = TXT.padX;
            for (let q = 0; q < L.lines[r].length; q++) {
                const it = L.lines[r][q];
                // Tiap jeda antar kata = SATU huruf, baik spasi dalam baris maupun
                // ganti baris. Kata pertama seluruh naskah tak didahului apa pun.
                // Pemisahnya baru dicatat sbg "tergambar" SETELAH lolos ambang `left`,
                // supaya `shown` tak pernah mengaku lebih banyak dari yang tampil.
                if (!first) { seen += 1; if (q) cx += spaceW; sep = true; }
                first = false;
                const left = n - seen;
                if (left <= 0) { caret = { x: cx, y }; break outer; }
                if (sep) { drawnParts.push(' '); sep = false; }
                const res = drawWord(g, it, cx, y, L.px, CSS_TEXT, left);
                cx = res.x; drawnParts.push(res.drawn);
                seen += it.w.length;
                if (res.drawn.length < it.w.length) { caret = { x: cx, y }; break outer; }
            }
        }
        // kursor blok mesin ketik — hanya selagi masih mengetik
        if (caret && n < L.total) {
            g.fillStyle = CSS_AMBER;
            g.fillRect(caret.x + 2, caret.y + L.px * 0.12, L.px * 0.52, L.px * 0.92);
        }
        // `shown` = apa yang BENAR-BENAR tergambar, bukan potongan naskah yang
        // diasumsikan tergambar. Bedanya penting: bug "teks berhenti sebelum habis"
        // dulu lolos assert justru karena `shown` dihitung dari naskah, bukan layar.
        shown = drawnParts.join('');
    }

    SCR.tex.needsUpdate = true;
    const words = bodyWords(ch.body).filter(t => !t.br);
    screenInfo = {
        era: i, phase: mode, year: ch.year, title: ch.title,
        text: plainBody(i), shown,
        bold: words.filter(t => t.parts.some(pt => pt.b)).length,
        italic: words.filter(t => t.parts.some(pt => pt.i)).length,
        px, lines: lineCount, chars: charsOf(i),
        fit: mode !== 'body' || lineCount * (px * 1.34) <= TXT.h - TXT.padY * 2,
    };
}

const plainBody = (i) => stripInline(PROLOGUE_CHAPTERS[i].body).replace(/\s+/g, ' ').trim();

// Selubung opasitas layar. Semua kurva fade (tahun/judul/isi) datang dari `phaseAt`,
// jadi fungsi ini tinggal menuliskannya — nol logika waktu yang terduplikasi.
function updateScreenText(t, i) {
    if (!SCR) return null;
    const ph = phaseAt(i, t);
    SCR.mat.opacity = ph.alpha;
    return ph;
}

// Satu-satunya jalan masuk per frame: setel opasitas, lalu GAMBAR ULANG hanya bila
// isinya benar-benar berubah (ganti fase, atau bertambah satu huruf saat mengetik).
// Tiap gambar-ulang = satu unggah tekstur, jadi penjagaan `screenKey` inilah yang
// membuat mesin ketik tidak mengunggah tekstur 60x per detik.
function syncScreen(t, i) {
    const ph = updateScreenText(t, i);
    if (!ph) return;
    const key = ph.phase + ':' + (ph.phase === 'body' ? ph.chars : 0);
    if (key !== screenKey) { screenKey = key; drawScreen(i, ph.phase, ph.chars); }
}

// `#prologue` (takarir DOM lama) dipastikan TERSEMBUNYI — naskah sekarang di layar.
function hideDomCaption() {
    textEl = document.getElementById('prologue');
    if (textEl && textEl.style) textEl.style.display = 'none';
}

// ===================== MESIN SINEMATIK =====================
const RUSH_MUL = 8;

// Dipanggil main.js MASIH di balik layar loading: bangun ruangan, persenjatai
// mesinnya. Frame pertama baru tampil setelah hideLoading().
export function beginPrologue(onDone) {
    doneCb = typeof onDone === 'function' ? onDone : null;
    started = true;
    hideDomCaption();
    ensureWorld();
    root.visible = true;
    releaseInputs();
    setCinematicActive(true);
    setCineBars(true);
    // SHOT TUNGGAL: kamera dipasang SEKALI di sini dan tak pernah disentuh lagi.
    camera.position.set(PRO.x, SHOT.pivot, PRO.z);
    camera.quaternion.set(0, 0, 0, 1);
    setCineFocus(PRO.x, PRO.z, true);
    setCam(SHOT.az, SHOT.dist, SHOT.h, SHOT.pivot);
    cine = {
        era: 0, t: 0, total: 0, live: false, outro: false, outroT: 0, rush: 0,
        az: SHOT.az, dist: SHOT.dist, fx: PRO.x, fz: PRO.z,
    };
    enterEra(0, true);
    console.info('[prologue] ruang meeting — ' + PROLOGUE_CHAPTERS.length + ' era (2028–2045) di meja, kamera DIAM menghadap layar');
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
    bodyLayout = null; screenKey = '';
    syncScreen(0, i);          // era selalu dibuka oleh FASE TAHUN
    for (let k = 0; k < eras.length; k++) {
        if (k === i) { eras[k].group.visible = true; eras[k].group.scale.y = first ? HOLO_FIT : 0.0001; }
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
            // Gambar ulang layar SEKALI di frame tampil pertama: gambar pertama
            // jalan di balik layar loading, saat Courier Prime bisa jadi belum
            // selesai dimuat sehingga kanvasnya terlanjur memakai fallback.
            bodyLayout = null; screenKey = '';
            syncScreen(cine.t, cine.era);
            showCutsceneSkip(skipPrologue);
            setCineFade(1); setCineFade(0, cfg().fadeInSec);
            installClick();   // klik = maju-cepat (dipasang baru SEKARANG: klik di
                              // layar loading tak boleh menggeser cerita)
        }
        const c = cfg();

        // ---- OUTRO: tirai turun, lalu serahkan ke cutscene heli ----
        if (cine.outro) {
            cine.outroT += dt;
            syncScreen(chapterTotal(8) + cine.outroT, 8);
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
        syncScreen(cine.t, cine.era);

        // Animasi hologram era ini + LIPATAN era sebelumnya (transisi = proyeksi
        // lama turun ke meja sementara yang baru terbit; BUKAN ganti slide).
        const cur = eras[cine.era];
        if (cur) {
            cur.group.scale.y = Math.max(0.0001, HOLO_FIT * smooth(clamp01(cine.t / Math.max(0.2, c.fadeInSec))));
            cur.anim(cine.t, k);
        }
        if (cine.era > 0) {
            const old = eras[cine.era - 1];
            const fold = 1 - smooth(clamp01(cine.t / Math.max(0.2, c.fadeInSec)));
            if (old && old.group.visible) {
                old.group.scale.y = Math.max(0.0001, HOLO_FIT * fold);
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

// (Fungsi `orbit()` DIHAPUS di v6, 2026-07-31: "kameranya jangan bergerak". Kamera
// dipasang sekali di beginPrologue dan tak pernah disentuh lagi — tak ada lerp beat,
// tak ada pan, tak ada "napas". Yang berubah sepanjang prolog hanya hologram di meja
// dan teks di layar.)

// Akhiri prolog → bersihkan sinematik & sembunyikan ruangan → SERAHKAN ke cutscene
// heli. `resumeScene` (BUKAN setScene) supaya `introScene.enter()` tidak jalan dua
// kali: dunia atap/kota sudah dibangun & fog aslinya sudah disimpan saat main.js
// memasang introScene di balik layar loading, dan mesin helinya sudah dipersenjatai
// beginIntro(). Tirai TETAP hitam di sini — frame pertama cutscene heli sendiri
// yang membukanya (mulus, tanpa kedip).
function finishPrologue() {
    cine = null;
    // WAJIB: kembalikan keadaan kamera PERSIS seperti yang `beginIntro()` pasang
    // sebelum prolog menyela. beginIntro memanggil `setCineFocus(null)` supaya kamera
    // MEMBUNTUTI pivot (yang menempel helikopter); prolog menimpanya dgn fokus tetap
    // di meja. Tanpa dilepas di sini, `resumeScene` TIDAK memanggil beginIntro lagi
    // sehingga cutscene heli dibuka dgn fokus terkunci di panggung prolog — kamera
    // menyorot gedung diam alih-alih mengikuti heli (bug 2026-07-31).
    setCineFocus(null);
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
    for (const e of eras) { e.group.visible = true; e.group.scale.y = HOLO_FIT; }
    if (glowRed) glowRed.visible = true;
    if (glowAmber) glowAmber.visible = true;
    camera.position.set(PRO.x, SHOT.pivot, PRO.z);
    // Satu sudut saja sekarang — shot-nya memang cuma satu. Layar teks ikut digambar
    // supaya tekstur kanvasnya sudah terunggah ke GPU sebelum frame pertama.
    drawScreen(0, 'year', 0);
    setCam(SHOT.az, SHOT.dist, SHOT.h, SHOT.pivot);
    followViewCam();   // snap viewCam ke pivot (lompatan > 400 = snap)
    render();
    eras.forEach((e, i) => { e.group.visible = keep[i]; e.group.scale.y = keep[i] ? HOLO_FIT : 0.0001; });
    if (glowRed) glowRed.visible = false;
    if (glowAmber) glowAmber.visible = false;
}
