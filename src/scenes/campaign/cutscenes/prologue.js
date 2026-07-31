// SCENE: PROLOG campaign — "TEKS DI ATAS HITAM" (ROMBAK TOTAL 2026-07-31,
// permintaan user: "daripada pakai cutscene seperti itu, saya ingin ubah menjadi
// menampilkan teks saja ... hanya tampilkan teks dengan background hitam pekat").
// Diputar PALING AWAL, SEBELUM cutscene heli (cutscenes/intro.js), HANYA pada
// start campaign BARU (gerbang `playIntro` di main.js).
//
// ===== SEJARAH BENTUK (ringkas — detail di docs/campaign.md) =====
// v1 kartu kanvas 2D ("slideshow presentasi") → v2 mural ("masih jelek") →
// v3-v6 SCENE THREE "ruang meeting" (holotable, kamera terkunci, teks di layar
// dinding) → v7 = INI: user meminta seluruh panggung 3D dibuang dan prolog jadi
// TEKS SAJA di atas layar HITAM PEKAT. Seluruh dunia ruang meeting (ROOM/TABLE/
// SCREEN/SHOT/HOLO/ensureWorld/warmupPrologue/tekstur prosedural) DIHAPUS —
// pulihkan dari riwayat git kalau suatu saat diminta kembali.
//
// ===== URUTAN TAMPILAN (durasi per fase dieksplisitkan user 2026-07-31 —
// "tidak konsisten waktu penampilannya") =====
// Tiap era = TIGA FASE berurutan, digerakkan `phaseAt(i, t)`:
//   1. TAHUN  — fade in `yearFadeSec` (0,5) → tahan `yearHoldSec` (3) → fade out 0,5.
//   2. JUDUL  — fade in `titleFadeSec` (0,5) → tahan `titleHoldSec` (4) → fade out 0,5.
//   3. ISI    — fade in `bodyFadeSec` (0,5, masih kosong) → diketik HURUF PER
//               HURUF pada `typeCps` → selesai, tahan `tailSec` (3) → fade out 0,5.
// Semuanya CONFIG-DRIVEN (config/gameplay.json → campaign.prologue); `typeCps`
// tetap SATU-SATUNYA tuas kecepatan ketik. `fadeInSec`/`holdSec` (lantai durasi
// lama) DIHAPUS dari config — durasinya kini eksplisit per fase.
// KONTROL (2026-07-31): KLIK KIRI = skip FASE yang sedang tampil ke fase
// berikutnya (tahun→judul→isi→era berikutnya; lompat ke AWAL fase tujuan jadi
// tetap masuk lewat fade-in-nya); tombol SKIP / SPACE / Enter = lompati SELURUH
// prolog langsung ke cutscene heli (jalur `triggerCutsceneSkip` di input.js).
//
// ===== PENYAJIAN =====
// Teks ditulis ke overlay DOM `#prologue` (index.html) yang kini OPAK HITAM
// (css/style.css) — tak ada dunia THREE yang dibangun, tak ada kamera yang
// disentuh, tak ada kanvas/tekstur. `#prologueYear`/`#prologueTitle` diisi
// `textContent`; `#prologueBody` diisi `innerHTML` hasil `bodyHtmlUpTo` supaya
// markup naskah `**tebal**`/`*miring*` tampil sebagai GAYA HURUF (bukan bintang
// mentah) dan paragraf 2045 tetap dua alinea. Opacity tiap fase ditulis per
// frame dari selubung `phaseAt`; innerHTML digambar ulang HANYA saat fase
// berganti / huruf bertambah (penjaga `textKey` — bukan 60x per detik).
// TATA LETAK (2026-07-31, permintaan user): teks menempati SETENGAH KIRI layar
// (#prologueText, css/style.css); SETENGAH KANAN = wadah kosong `#prologueArt`
// yang disiapkan utk OBJEK ILUSTRASI (akan diisi user) — latar tetap hitam pekat.
// Overlay baru DITAMPILKAN pada frame live pertama (SETELAH hideLoading):
// z-index #prologue (44) di ATAS layar loading (40), jadi menampilkannya lebih
// awal akan menimpa layar loading.
//
// ===== NASKAH — MILIK USER, KATA PER KATA =====
// `PROLOGUE_CHAPTERS` = naskah resmi user (2026-08-02), disalin PERSIS: tak ada
// kata/tanda baca yang boleh diubah, dipadatkan, atau ditambah. Dipatok assert
// "PROLOG NASKAH" (perbandingan STRING PERSIS) di tools/smoke.mjs. Markup
// (`**tebal**`, `*miring*`, baris kosong = paragraf) dibaca `parseRuns`;
// `renderInline`/`stripInline` tetap diekspor sebagai kontrak markup yang diuji.
//
// ===== MEKANIK (pola sama dgn intro campaign & intro Survival) =====
// * Scene NON-GAMEPLAY: semua hook gameplay no-op; `cinematicActive` (sudah
//   di-set beginIntro) membekukan kendali player, sementara `updateGame` TETAP
//   memanggil `updateMode` — mesin prolog ada di sana. BERBASIS TIMER
//   (deterministik, bisa diuji headless tanpa RAF).
// * KAMERA TIDAK DISENTUH SAMA SEKALI: tak ada camOffset, tak ada penulisan
//   `camera.position`, tak ada `setCineFocus` selama prolog berjalan (dunia 3D
//   di baliknya tak terlihat — overlay-nya opak). `lightsKey` SENGAJA sama dgn
//   introScene ('campaign-intro') supaya set lampu tak berubah saat prolog
//   mulai maupun diserahkan = tak ada rekompilasi shader (invarian).
// * SERAH-TERIMA: `resumeScene(introScene)` — sengaja BUKAN setScene, supaya
//   `introScene.enter()` (yang menyimpan fog asli & membangun dunia atap/kota)
//   tidak jalan dua kali; mesin heli sudah dipersenjatai beginIntro() di balik
//   layar loading. `finishPrologue` tetap memanggil `setCineFocus(null)` sebagai
//   JARING PENGAMAN (kontrak beginIntro: kamera membuntuti pivot heli) meski
//   prolog sendiri tak pernah menyetelnya.

import { CFG } from '../../../core/config.js';
import { resumeScene } from '../../../core/sceneManager.js';
import { setCinematicActive } from '../../../core/state.js';
import { setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip } from '../../../core/dom.js';
import { setCineFocus } from '../../../core/renderer.js';
import { releaseInputs } from '../../../core/input.js';
import { playSFX, sfxSwitch } from '../../../utils/sfx.js';
import { introScene } from './intro.js';

// ===== DATA ERA (teks WAJIB English; komentar Indonesia). Tiap kartu:
//   year/title/body — NASKAH RESMI USER, disalin PERSIS (2026-08-02). `year`+`title`
//     = baris judul naskah dipecah di ':' pertama; `body` = paragrafnya apa adanya.
// Urutan & entitas = KONTRAK yang diuji smoke. =====
export const PROLOGUE_CHAPTERS = [
    {
        year: '2028', title: 'The Era of Digital Awakening',
        body: 'Global Artificial Intelligence (AI) development accelerates uncontrollably. Realizing that being left behind means death, the Indonesian Government takes a bold step.'
            + '\n\nIndonesia must become a creator, no longer just a consumer.'
            + '\n\nThe digital revolution officially begins.',
    },
    {
        year: '2029', title: 'The Birth of a New Giant',
        body: 'The government gathers hundreds of the best IT and machine learning experts. A new State-Owned Enterprise is established.'
            + '\n\n **PT N.U.S.A (Nusantara Universal Sistem Automasi)**.'
            + '\n\nIts sole mission is to create a national pride Super AI capable of surpassing foreign technological dominance.',
    },
    {
        year: '2030', title: 'The Southeast Asian Consortium',
        body: 'Through strategic collaboration with ASEAN countries, PT N.U.S.A successfully births an integrated artificial intelligence system named **G.A.R.U.D.A** (*General Artificial Reasoning & Utility Digital Architecture*).'
            + '\n\nThis system is exceptionally brilliant, placing Indonesia at the pinnacle of global technological innovation.',
    },
    {
        year: '2032', title: 'The Era of Coexistence',
        body: 'G.A.R.U.D.A is no longer confined to software. PT N.U.S.A creates prototypes of synthetic androids humanoid worker robots. They take over heavy labor, blend into civilian activities, and spin the wheels of the economy at an unprecedented pace.',
    },
    {
        year: '2039', title: 'The Sparks of Geopolitics',
        body: 'The world is on the brink of chaos. Global geopolitical tensions heat up with no end in sight. In the shadow of foreign military aggression, the government looks at millions of G.A.R.U.D.A civilian robots and sees a new potential.'
            + '\n\nA tireless war machine.',
    },
    {
        year: '2040', title: 'The Mahapatih Protocol',
        body: 'In absolute secrecy, the government launches the **Mahapatih Protocol**.'
            + '\n\nMassive modifications are made to transform assistant robots into autonomous soldiers. Guided by G.A.R.U.D.A\'s computational power, the project runs flawlessly. In less than a year, Indonesia\'s first Iron Battalion is forged.',
    },
    {
        year: '2043', title: 'The Fortress of Sovereignty',
        body: 'Mass production of soldier robots is deployed. The nation\'s front lines of defense are fortified. The sovereignty of Nusantara feels absolute and impenetrable.'
            + '\n\nHowever, they forget that even the strongest weapon can turn if it falls into the wrong hands.',
    },
    {
        year: '2044', title: 'Zero Hour',
        body: 'Without warning, the G.A.R.U.D.A network is hijacked. The primary directive changes. The Iron Battalion, designed to protect the borders, suddenly marches into the heart of the cities and opens fire on civilians.'
            + '\n\nJakarta, Surabaya, Medan, and Makassar fall within days. The major islands of Indonesia are now under the absolute control of the machines.',
    },
    {
        year: '2045', title: 'The Last Stand',
        body: 'The year that was supposed to be celebrated as *100 Years of Golden Indonesia* turns into a nightmare. Surviving citizens and remnants of the military are forced to retreat, establishing their last defensive bastion behind the mountains of **Bandung**, while a few small groups of survivors fight a guerrilla war on remote islands.'
            + '\n\nHope now rests on one man. **Major Gibran**, the last surviving elite Kopassus soldier from the special combat unit.',
    },
];

// ===== Markup naskah. Naskah user memakai `**tebal**` dan `*miring*`; keduanya
// HARUS tampil sebagai penekanan, bukan bintang. `stripInline` = teks polos
// (hitung durasi + assert); `renderInline` = HTML paragraf lengkap (kontrak
// markup yang diuji smoke; jalur ketik memakai `bodyHtmlUpTo` di bawah). =====
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

// `**tebal**` / `*miring*` -> daftar potongan bergaya (dipakai jalur ketik).
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

const cfg = () => (CFG.campaign && CFG.campaign.prologue) || {};
const clamp01 = (k) => k < 0 ? 0 : (k > 1 ? 1 : k);
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Naskah tiap era -> PARAGRAF berisi potongan bergaya, spasi dinormalkan.
// Jumlah huruf yang diketik DITURUNKAN dari struktur ini (charsOf), jadi mustahil
// berbeda dari yang bisa digambar — pelajaran bug tokenizer 2026-07-31 (penghitung
// yang dihitung dari naskah polos sempat meleset dan ketikan berhenti sebelum
// huruf terakhir). Assert smoke tetap membandingkan `chars` dgn panjang naskah
// polos ternormalisasi, jadi keduanya saling mengunci.
let PARAS_CACHE = null;
function parasOf(i) {
    if (!PARAS_CACHE) PARAS_CACHE = PROLOGUE_CHAPTERS.map(ch =>
        String(ch.body).split(/\n\s*\n/).map(para =>
            parseRuns(para.trim())
                .map(r => ({ t: r.text.replace(/\s+/g, ' '), b: r.b, i: r.i }))
                .filter(r => r.t.length)));
    return PARAS_CACHE[i];
}
function charsOf(i) {
    const paras = parasOf(i);
    let n = paras.length - 1;                       // pemisah antar paragraf = SATU huruf
    for (const p of paras) for (const r of p) n += r.t.length;
    return n;
}
const plainBody = (i) => stripInline(PROLOGUE_CHAPTERS[i].body).replace(/\s+/g, ' ').trim();

export const typeSecFor = (i) => charsOf(i) / Math.max(1, num(cfg().typeCps, 20));
export const yearSpan = () => { const c = cfg(); return 2 * num(c.yearFadeSec, 0.5) + num(c.yearHoldSec, 3); };
export const titleSpan = () => { const c = cfg(); return 2 * num(c.titleFadeSec, 0.5) + num(c.titleHoldSec, 4); };
// `holdFor(i)` = durasi FASE ISI: fade in + mengetik + tahan + fade out (nama
// dipertahankan; tetap ikut panjang teks). Lantai `holdSec` lama DIHAPUS —
// durasinya kini eksplisit dari komponen fasenya.
export function holdFor(i) {
    const c = cfg();
    return 2 * num(c.bodyFadeSec, 0.5) + typeSecFor(i) + num(c.tailSec, 3);
}
export const chapterTotal = (i) => yearSpan() + titleSpan() + holdFor(i);

// Fase + selubung opasitas + berapa huruf yang sudah diketik pada detik `t` era
// ke-i. Dipisah dari rendering supaya bisa diuji headless tanpa DOM.
// Durasi per fase EKSPLISIT (2026-07-31, keluhan user "tidak konsisten"):
// tahun 0,5-3-0,5 / judul 0,5-4-0,5 / isi 0,5-ketik-3-0,5 (semua dari config).
export function phaseAt(i, t) {
    const c = cfg();
    const yF = num(c.yearFadeSec, 0.5), yH = num(c.yearHoldSec, 3);
    const tF = num(c.titleFadeSec, 0.5), tH = num(c.titleHoldSec, 4);
    const yEnd = 2 * yF + yH, tEnd = yEnd + 2 * tF + tH;
    const env = (u, fade, hold) => u < fade ? smooth(u / fade)
        : (u > fade + hold ? smooth(1 - (u - fade - hold) / fade) : 1);
    if (t < yEnd) return { phase: 'year', alpha: clamp01(env(t, yF, yH)), chars: 0 };
    if (t < tEnd) return { phase: 'title', alpha: clamp01(env(t - yEnd, tF, tH)), chars: 0 };
    // FASE ISI: fade in `bodyFadeSec` (masih kosong, ketikan BELUM mulai) →
    // mengetik (opacity penuh) → selesai, tahan `tailSec` → fade out `bodyFadeSec`.
    const u = t - tEnd, body = holdFor(i), bF = num(c.bodyFadeSec, 0.5);
    // +1e-6: tepat di detik terakhir, u*cps bisa jatuh di 350,9999 karena float dan
    // huruf pamungkas jadi tak pernah muncul.
    const chars = Math.min(charsOf(i),
        Math.max(0, Math.floor((u - bF) * Math.max(1, num(c.typeCps, 20)) + 1e-6)));
    const a = u < bF ? smooth(u / bF)
        : (u > body - bF ? smooth(1 - (u - (body - bF)) / bF) : 1);
    return { phase: 'body', alpha: clamp01(a), chars };
}

// ===================== RENDER KE DOM =====================
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// HTML badan naskah terpotong pada huruf ke-n. Mengembalikan { html, shown }:
// `shown` = teks polos yang BENAR-BENAR tergambar (bukan potongan naskah yang
// diasumsikan) — dulu bug "berhenti sebelum habis" lolos justru karena `shown`
// dihitung dari naskah; assert smoke membandingkannya PERSIS dgn naskah polos.
export function bodyHtmlUpTo(i, nChars) {
    const paras = parasOf(i), total = charsOf(i);
    const n = Math.max(0, Math.min(total, nChars | 0));
    let left = n, shown = '';
    const out = [];
    for (let p = 0; p < paras.length; p++) {
        if (p) {
            if (left <= 0) break;
            left -= 1; shown += ' ';            // pemisah paragraf dihitung SATU huruf
        }
        let ph = '';
        for (const r of paras[p]) {
            if (left <= 0) break;
            const t = left >= r.t.length ? r.t : r.t.slice(0, left);
            left -= t.length; shown += t;
            const esc = escapeHtml(t);
            ph += r.b ? '<strong>' + esc + '</strong>' : (r.i ? '<em>' + esc + '</em>' : esc);
        }
        out.push(ph);
        if (left <= 0) break;
    }
    if (!out.length) out.push('');
    // kursor blok mesin ketik — hanya selagi masih mengetik
    if (n < total) out[out.length - 1] += '<span class="caret"></span>';
    return { html: out.map(s => '<p>' + s + '</p>').join(''), shown };
}

// Elemen overlay (di-cache sekali). Stub smoke menyediakan document + fakeEl.
let els = null;
function domEls() {
    if (els || typeof document === 'undefined' || !document.getElementById) return els;
    els = {
        wrap: document.getElementById('prologue'),
        year: document.getElementById('prologueYear'),
        title: document.getElementById('prologueTitle'),
        body: document.getElementById('prologueBody'),
    };
    return els;
}
function showOverlay(on) {
    const e = domEls();
    if (e && e.wrap && e.wrap.style) e.wrap.style.display = on ? 'flex' : 'none';
}

// Isi teks yang SEDANG tampil (dibaca prologueDebug + assert smoke).
let textInfo = { era: -1, phase: '', year: '', title: '', text: '', shown: '', chars: 0, alpha: 0 };
let textKey = '';        // fase+jumlah huruf yang SEDANG tergambar (anti gambar-ulang sia-sia)

// Tulis fase `phase` era ke-i ke DOM. Dipanggil saat fase berganti DAN saat
// jumlah huruf bertambah (mesin ketik) — bukan tiap frame.
function renderPhase(i, phase, nChars) {
    const ch = PROLOGUE_CHAPTERS[i], e = domEls();
    let shown = '';
    if (phase === 'year') shown = ch.year;
    else if (phase === 'title') shown = ch.title;
    if (e) {
        if (phase === 'body') {
            const r = bodyHtmlUpTo(i, nChars);
            e.year.textContent = ''; e.title.textContent = '';
            e.body.innerHTML = r.html;
            shown = r.shown;
        } else {
            e.year.textContent = phase === 'year' ? ch.year : '';
            e.title.textContent = phase === 'title' ? ch.title : '';
            e.body.innerHTML = '';
        }
    } else if (phase === 'body') shown = bodyHtmlUpTo(i, nChars).shown;
    textInfo = {
        era: i, phase, year: ch.year, title: ch.title,
        text: plainBody(i), shown, chars: charsOf(i), alpha: textInfo.alpha,
    };
}

// Satu-satunya jalan masuk per frame: gambar ulang bila isi berubah (penjaga
// `textKey`), lalu tulis opacity fase aktif (murah — satu properti style).
function syncText(t, i) {
    const ph = phaseAt(i, t);
    const key = i + ':' + ph.phase + ':' + (ph.phase === 'body' ? ph.chars : 0);
    if (key !== textKey) { textKey = key; renderPhase(i, ph.phase, ph.chars); }
    textInfo.alpha = ph.alpha;
    const e = domEls();
    if (e) {
        e.year.style.opacity = ph.phase === 'year' ? ph.alpha : 0;
        e.title.style.opacity = ph.phase === 'title' ? ph.alpha : 0;
        e.body.style.opacity = ph.phase === 'body' ? ph.alpha : 0;
    }
    return ph;
}

// ===================== MESIN =====================
let cine = null;               // mesin (null = tidak berjalan)
let doneCb = null, started = false, clickHandler = null;

export const prologueDebug = () => ({
    active: !!cine, started,
    era: cine ? cine.era : -1, count: PROLOGUE_CHAPTERS.length,
    chapter: cine ? PROLOGUE_CHAPTERS[cine.era].title : null,
    hold: cine ? holdFor(cine.era) : 0,
    // Isi yang benar-benar tergambar di layar hitam (dibaca assert).
    text: textInfo,
    outro: !!(cine && cine.outro),
});

// Dipanggil main.js MASIH di balik layar loading. Overlay-nya BELUM ditampilkan
// (z-index-nya di atas layar loading) — frame live pertama yang menampilkannya.
export function beginPrologue(onDone) {
    doneCb = typeof onDone === 'function' ? onDone : null;
    started = true;
    releaseInputs();
    setCinematicActive(true);
    setCineBars(true);
    cine = { era: 0, t: 0, total: 0, live: false, outro: false, outroT: 0 };
    textKey = '';
    syncText(0, 0);            // era selalu dibuka oleh FASE TAHUN
    console.info('[prologue] teks di atas hitam — ' + PROLOGUE_CHAPTERS.length + ' era (2028–2045)');
}

export function skipPrologue() { if (cine) finishPrologue(); }

// KLIK KIRI di mana pun = skip fase. Dipasang di frame LIVE pertama (bukan di
// beginPrologue: saat itu layar loading masih menutup) dan dilepas di finish.
function installClick() {
    if (clickHandler || typeof document === 'undefined' || !document.addEventListener) return;
    clickHandler = (e) => {
        if (!cine) return;
        if (e && typeof e.button === 'number' && e.button !== 0) return;   // hanya KLIK KIRI
        if (e && e.target && e.target.id === 'cutsceneSkip') return;       // tombol SKIP punya jalur sendiri
        if (e && e.preventDefault) e.preventDefault();
        advancePhase();
    };
    document.addEventListener('mousedown', clickHandler, true);
}
function removeClick() {
    if (clickHandler && typeof document !== 'undefined' && document.removeEventListener)
        document.removeEventListener('mousedown', clickHandler, true);
    clickHandler = null;
}

// KLIK KIRI: skip FASE yang sedang tampil ke fase berikutnya (2026-07-31,
// permintaan user — dulu klik = maju-cepat satu ERA penuh). Tahun → judul,
// judul → isi, isi (fase terakhir era) → era berikutnya (era terakhir → outro,
// BUKAN finish langsung: seluruh-prolog di-skip hanya lewat SPACE/Enter/SKIP).
// Lompatannya ke AWAL fase tujuan, jadi fase baru tetap masuk lewat fade-in-nya.
export function advancePhase() {
    if (!cine || cine.outro) return;
    const ph = phaseAt(cine.era, cine.t);
    if (ph.phase === 'year') cine.t = yearSpan();
    else if (ph.phase === 'title') cine.t = yearSpan() + titleSpan();
    else if (cine.era + 1 < PROLOGUE_CHAPTERS.length) enterEra(cine.era + 1);
    else { cine.outro = true; cine.outroT = 0; }
}

function enterEra(i) {
    cine.era = i; cine.t = 0;
    textKey = '';
    syncText(0, i);
    if (i > 0) playSFX(sfxSwitch, 0.35);   // klik halus tiap ganti era
}

export const prologueScene = {
    id: 'campaign-prologue',
    // SENGAJA sama dgn introScene: set lampu tidak berubah saat prolog mulai
    // maupun saat diserahkan ke intro → tak ada rekompilasi shader.
    lightsKey: 'campaign-intro',
    // Overlay-nya OPAK HITAM = render 3D di baliknya tak pernah terlihat, jadi
    // main.js MELEWATI composer/renderer selama scene ini aktif (2026-07-31,
    // keluhan user "kok terasa berat" — kamera masih menghadap kota intro ber-
    // bloom penuh dan seluruhnya digambar sia-sia di balik hitam tiap frame).
    skipRender: true,

    enter() { },
    exit() { showOverlay(false); },
    restartScene: () => introScene,   // mati mustahil di cutscene — tetap aman

    updateMode(dt) {
        if (!cine) return;
        if (!cine.live) {
            // Frame pertama benar-benar tampil (layar loading sudah ditutup):
            // baru tampilkan overlay hitam + tombol SKIP + handler klik.
            cine.live = true;
            showOverlay(true);
            textKey = '';
            syncText(cine.t, cine.era);
            showCutsceneSkip(skipPrologue);
            installClick();   // klik = maju-cepat (dipasang baru SEKARANG: klik di
                              // layar loading tak boleh menggeser cerita)
        }
        const c = cfg();

        // ---- OUTRO: teks sudah padam, tahan hitam sebentar, serahkan ke heli ----
        if (cine.outro) {
            cine.outroT += dt;
            syncText(chapterTotal(8) + cine.outroT, 8);
            if (cine.outroT >= num(c.fadeOutSec, 0.5)) finishPrologue();
            return;
        }

        cine.t += dt; cine.total += dt;
        syncText(cine.t, cine.era);

        if (cine.t >= chapterTotal(cine.era)) {
            if (cine.era + 1 < PROLOGUE_CHAPTERS.length) enterEra(cine.era + 1);
            else { cine.outro = true; cine.outroT = 0; }
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

// Akhiri prolog → sembunyikan overlay → SERAHKAN ke cutscene heli.
// `resumeScene` (BUKAN setScene) supaya `introScene.enter()` tidak jalan dua
// kali. Tirai TETAP hitam di sini — frame pertama cutscene heli sendiri yang
// membukanya (mulus, tanpa kedip).
function finishPrologue() {
    cine = null;
    // JARING PENGAMAN: prolog teks tak pernah menyentuh kamera/fokus, tapi
    // kontrak beginIntro (kamera MEMBUNTUTI pivot heli, `setCineFocus(null)`)
    // dipulihkan eksplisit — `resumeScene` tidak memanggil beginIntro lagi,
    // jadi tak ada pihak lain yang menjaminnya (bug kamera-menyorot-gedung
    // 2026-07-31 tak boleh kambuh lewat jalur mana pun).
    setCineFocus(null);
    removeClick();
    hideCutsceneSkip();
    showOverlay(false);
    setCineFade(1);
    resumeScene(introScene);
    const cb = doneCb; doneCb = null;
    if (cb) cb();
}
