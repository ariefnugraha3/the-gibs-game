// SCENE: PROLOGUE campaign (2026-07-30; SENI DIROMBAK 2026-07-31 lalu DISEDERHANAKAN
// & OBJEK DICOCOKKAN KE NARASI 2026-08-01, permintaan user) — diputar PALING AWAL,
// SEBELUM intro helikopter (cutscenes/intro.js), HANYA pada start campaign BARU
// (gerbang `playIntro` di main.js).
//
// APA INI: PROLOG SINEMATIK "motion-graphic" — bukan teks polos, bukan video
// (situs statis tanpa build/aset). Sembilan KARTU ERA (2028→2045) menceritakan
// latar cerita; tiap kartu = DIORAMA prosedural di <canvas> 2D + tipografi
// (TAHUN/JUDUL/narasi) di DOM.
//
// PRINSIP SENI (2026-08-01, permintaan user "gak usah blur/bloom yang mahal —
// biasa aja; OBJEK di slide harus SESUAI narasi"):
//   • TANPA `ctx.filter` blur (mahal). Kedalaman lewat WARNA: lapisan jauh diberi
//     warna lebih dekat ke langit (aerial perspective murah), bukan blur.
//   • Bloom SEPERLUNYA: satu `softGlow()` (radial gradient) hanya untuk cahaya
//     kunci (matahari/bulan/emblem/api/mata) — tidak ditumpuk puluhan.
//   • OBJEK TIAP SLIDE = ISI NARASINYA (ini fokus utama perbaikan):
//       2028 fajar: MONAS + skyline Jakarta bangun + data naik (kebangkitan digital)
//       2029 N.U.S.A: GEDUNG MARKAS ber-emblem + kerumunan PARA AHLI berkumpul
//       2030 G.A.R.U.D.A: EMBLEM GARUDA (elang) bercahaya + jaringan ASEAN
//       2032 koeksistensi: ROBOT PEKERJA mengangkut beban + manusia (ekonomi ramai)
//       2039 geopolitik: JET TEMPUR ASING di horizon + robot SIPIL (belum merah)
//       2040 Mahapatih: LINI PERAKITAN robot PRAJURIT (Iron Battalion) di bawah mata GARUDA
//       2043 benteng: BARISAN pasukan robot masif + tembok benteng + sorot
//       2044 Zero Hour: kota TERBAKAR + robot menyerang + warga lari + mata GARUDA MERAH (dibajak)
//       2045 last stand: gunung BANDUNG + MAJOR GIBRAN + bendera + kota terbakar jauh
//   • Grade tipis (vignette + duotone lembut) + grain halus + letterbox. Semua
//     objek di-seed SEKALI per kartu (RNG) → stabil, tak berkedip.
//
// KONTROL: tiap slide 10 dtk (CFG.campaign.prologue). KLIK layar → slide
// BERIKUTNYA (`advanceSlide`); tombol SKIP / SPACE / Enter / Esc → lompati SELURUH
// prolog (`skipPrologue`).
//
// INTEGRASI (main.js): init campaign jalan penuh (heli ter-arm & warmup), lalu
// SEBELUM animate() `setPaused(true)` (mesin heli BEKU di layar hitam),
// `playPrologue(() => setPaused(false))` setelah animate() — selesai/skip → hide
// overlay (menampakkan `cineFade` hitam yg sama) → unpause → frame LIVE pertama
// heli membuka dari hitam itu. Overlay DOM murni → risiko minim.
//
// KONTRAK NARASI (assert "PROLOG NARASI" di smoke): 9 era kronologis, entitas
// kunci N.U.S.A / G.A.R.U.D.A / Mahapatih Protocol / Iron Battalion / Zero Hour /
// Bandung / Major Gibran; berakhir pada Major Gibran (serah-terima ke intro heli).

import { CFG } from '../../../core/config.js';
import { showCutsceneSkip, hideCutsceneSkip } from '../../../core/dom.js';

// ===== DATA ERA (teks WAJIB English; komentar Indonesia). Tiap kartu:
//   year/title/body — narasi (setia storyline user, dipadatkan agar sinematik).
//   art — { type, sky:[atas,tengah,bawah], accent, accent2 } untuk dioramanya.
// Urutan & entitas = KONTRAK yang diuji smoke. =====
export const PROLOGUE_CHAPTERS = [
    {
        year: 'INDONESIA 2028', title: 'The Era of Digital Awakening',
        body: 'Global AI races ahead, beyond anyone’s control. To be left behind is to perish. Indonesia makes its choice: to become a creator, no longer a consumer. The digital revolution begins.',
        art: { type: 'dawn', sky: ['#0a1428', '#1d3a55', '#5a6f7e'], accent: '#5fd8c6', accent2: '#ffb765' }
    },
    {
        year: 'INDONESIA 2029', title: 'The Birth of a New Giant',
        body: 'Hundreds of the nation’s finest minds are gathered. A new state enterprise is founded — PT N.U.S.A — with a single mission: forge a national Super AI to rival the world’s technological giants.',
        art: { type: 'genesis', sky: ['#0c1020', '#1a2440', '#33405e'], accent: '#7fc8ff', accent2: '#ffcf8a' }
    },
    {
        year: 'INDONESIA 2030', title: 'The Southeast Asian Consortium',
        body: 'With its ASEAN allies, N.U.S.A gives birth to G.A.R.U.D.A — a General Artificial Reasoning & Utility Digital Architecture. Brilliant beyond measure, it lifts Indonesia to the summit of global innovation.',
        art: { type: 'garuda', sky: ['#03100f', '#073038', '#0c4a54'], accent: '#3fe3d1', accent2: '#ffe08a' }
    },
    {
        year: 'INDONESIA 2032–2035', title: 'The Era of Coexistence',
        body: 'G.A.R.U.D.A leaves the screen. Synthetic androids walk among the people — tireless workers who take on the heavy labor and turn the wheels of an economy soaring at an unprecedented pace.',
        art: { type: 'coexist', sky: ['#1c1305', '#3e2b11', '#78552a'], accent: '#ffce7a', accent2: '#8fd6ff' }
    },
    {
        year: 'INDONESIA 2039', title: 'The Sparks of Geopolitics',
        body: 'The world teeters on the brink of chaos. As foreign military aggression looms, the government looks upon millions of civilian robots and sees something new: a tireless war machine.',
        art: { type: 'sparks', sky: ['#0d0a12', '#231624', '#412032'], accent: '#ff6a4a', accent2: '#9fb0d0' }
    },
    {
        year: 'INDONESIA 2040', title: 'The Mahapatih Protocol',
        body: 'In absolute secrecy, the Mahapatih Protocol begins. Assistant robots are reforged into autonomous soldiers. Guided by G.A.R.U.D.A, the first Iron Battalion is born in less than a year.',
        art: { type: 'battalion', sky: ['#070606', '#170d0c', '#2c1512'], accent: '#ff3a26', accent2: '#ffb03b' }
    },
    {
        year: 'INDONESIA 2043', title: 'The Fortress of Sovereignty',
        body: 'Soldier robots roll off the lines en masse. The front lines are fortified; the sovereignty of Nusantara feels absolute and impenetrable. They forget that the strongest weapon can be turned.',
        art: { type: 'fortress', sky: ['#080e15', '#16283a', '#31485f'], accent: '#a6c6de', accent2: '#ff5238' }
    },
    {
        year: 'INDONESIA 2044', title: 'Zero Hour',
        body: 'Without warning, the G.A.R.U.D.A network is hijacked. The prime directive changes. The Iron Battalion turns on the very cities it was built to protect. Jakarta, Surabaya, Medan, and Makassar fall within days.',
        art: { type: 'inferno', sky: ['#0b0400', '#3a0f02', '#7a2606'], accent: '#ff7a1a', accent2: '#ffd35a' }
    },
    {
        year: 'INDONESIA 2045', title: 'The Last Stand',
        body: 'The year meant to crown a Golden Indonesia becomes a nightmare. Survivors retreat behind the mountains of Bandung. Hope now rests on one man — Major Gibran, the last elite Kopassus soldier.',
        art: { type: 'laststand', sky: ['#05091a', '#102340', '#294f72'], accent: '#ffd98a', accent2: '#6fb8ff' }
    },
];

// ===== State modul =====
let root = null, canvas = null, ctx = null;
let yearEl = null, titleEl = null, bodyEl = null, counterEl = null;
let active = false, started = false, doneCb = null;
let idx = -1, chapT = 0, driftT = 0, lastMs = 0, rafId = 0;
let keyHandler = null, clickHandler = null;
let W = 0, H = 0, dpr = 1;
let S = null;            // sceneState per-kartu (di-seed sekali → tak berkedip)
let flashT = 0, panDir = 1;
let grainTile = null;

// Debug/uji: status prolog (tak bergantung timing RAF).
export const prologueDebug = () => ({
    active, started, idx, count: PROLOGUE_CHAPTERS.length,
    chapter: active && idx >= 0 ? PROLOGUE_CHAPTERS[idx].title : null,
});

const nowMs = () => Date.now();
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => k < 0 ? 0 : (k > 1 ? 1 : k);
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const cfg = () => (CFG.campaign && CFG.campaign.prologue) || { fadeInSec: 1.1, holdSec: 7.8, fadeOutSec: 1.1 };
const chapterTotal = () => { const c = cfg(); return c.fadeInSec + c.holdSec + c.fadeOutSec; };

// RNG ber-seed (mulberry32) — objek deterministik per kartu = TAK berkedip.
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ===== Publik: mulai prolog. `onDone` dipanggil SEKALI saat selesai/skip. =====
export function playPrologue(onDone) {
    doneCb = typeof onDone === 'function' ? onDone : null;
    grabDom();
    if (!root || !canvas) {
        console.warn('[prologue] elemen #prologue tidak ditemukan (index.html lama / cache?) — prolog dilewati.');
        active = false; started = true;
        const cb = doneCb; doneCb = null; if (cb) cb();
        return;
    }
    console.info('[prologue] mulai — ' + PROLOGUE_CHAPTERS.length + ' kartu era (2028–2045)');
    active = true; started = true; idx = -1; driftT = 0;
    ensureGrain();
    sizeCanvas();
    if (root) root.style.display = 'block';
    showCutsceneSkip(skipPrologue);
    installInput();
    enterChapter(0);
    lastMs = nowMs();
    loop();
}

export function skipPrologue() { if (active) finish(); }

// KLIK layar / manual: maju ke slide BERIKUTNYA (atau selesai bila terakhir).
function advanceSlide() {
    if (!active) return;
    if (idx + 1 >= PROLOGUE_CHAPTERS.length) { finish(); return; }
    enterChapter(idx + 1);
    lastMs = nowMs();
}

function grabDom() {
    root = document.getElementById('prologue');
    canvas = document.getElementById('prologueCanvas');
    yearEl = document.getElementById('prologueYear');
    titleEl = document.getElementById('prologueTitle');
    bodyEl = document.getElementById('prologueBody');
    counterEl = document.getElementById('prologueCounter');
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
}

function sizeCanvas() {
    const win = (typeof window !== 'undefined') ? window : { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 };
    dpr = Math.min(2, win.devicePixelRatio || 1);
    W = win.innerWidth; H = win.innerHeight;
    if (canvas) { canvas.width = Math.max(1, (W * dpr) | 0); canvas.height = Math.max(1, (H * dpr) | 0); }
}

function installInput() {
    keyHandler = (e) => {
        if (!active) return;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
            e.preventDefault(); e.stopPropagation(); skipPrologue();
        }
    };
    clickHandler = (e) => { if (!active) return; e.preventDefault(); e.stopPropagation(); advanceSlide(); };
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('keydown', keyHandler, true);
    if (root && root.addEventListener) root.addEventListener('click', clickHandler);
}

// ===== Ganti kartu: isi teks + seed diorama. =====
function enterChapter(i) {
    idx = i; chapT = 0;
    const ch = PROLOGUE_CHAPTERS[i];
    if (yearEl) yearEl.textContent = ch.year;
    if (titleEl) titleEl.textContent = ch.title;
    if (bodyEl) bodyEl.textContent = ch.body;
    if (counterEl) counterEl.textContent =
        String(i + 1).padStart(2, '0') + ' / ' + String(PROLOGUE_CHAPTERS.length).padStart(2, '0');
    panDir = (i % 2 === 0) ? 1 : -1;
    flashT = 0;
    seedScene(ch);
}

function loop() {
    if (!active) return;
    const t = nowMs();
    const dt = Math.min(0.05, (t - lastMs) / 1000);
    lastMs = t;
    chapT += dt; driftT += dt;
    if (chapT >= chapterTotal()) {
        if (idx + 1 >= PROLOGUE_CHAPTERS.length) { finish(); return; }
        enterChapter(idx + 1);
    }
    render(dt);
    rafId = requestAnimationFrame(loop);
}

function finish() {
    active = false;
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    rafId = 0;
    if (root) root.style.display = 'none';
    hideCutsceneSkip();
    if (keyHandler && typeof document !== 'undefined' && document.removeEventListener)
        document.removeEventListener('keydown', keyHandler, true);
    if (clickHandler && root && root.removeEventListener) root.removeEventListener('click', clickHandler);
    keyHandler = null; clickHandler = null;
    const cb = doneCb; doneCb = null;
    if (cb) cb();
}

function chapterAlpha() {
    const c = cfg();
    if (chapT < c.fadeInSec) return smooth(chapT / c.fadeInSec);
    if (chapT < c.fadeInSec + c.holdSec) return 1;
    return smooth(1 - (chapT - c.fadeInSec - c.holdSec) / c.fadeOutSec);
}

// ===================== SEEDING (sekali per kartu) =====================
function seedScene(ch) {
    const type = ch.art.type;
    const seed = 1000 + idx * 97;
    const R = rng(seed);
    S = { type, sky: [], mid: [], near: [], stars: [], particles: [], crowd: [], jets: [], ranks: [], mountains: [], nodes: [] };

    // Bintang (malam)
    const starN = ({ dawn: 120, genesis: 150, garuda: 110, sparks: 70, fortress: 110, inferno: 30, laststand: 240 }[type]) || 0;
    for (let k = 0; k < starN; k++) S.stars.push({ x: R(), y: R() * 0.6, r: 0.3 + R() * 1.1, tw: R() * 6.283, sp: 1 + R() * 2 });

    // Partikel (jumlah dijaga hemat)
    const spec = PARTICLE_SPEC[type] || PARTICLE_SPEC.none;
    for (let k = 0; k < spec.count; k++) S.particles.push({ x: R(), y: R(), v: 0.2 + R() * 0.9, r: spec.rMin + R() * (spec.rMax - spec.rMin), ph: R() * 6.283, sway: 0.3 + R() * 0.8 });

    // Skyline: sebagian scene punya 2 lapis (jauh hazy + dekat) tanpa blur.
    const cityFor = (defs) => defs.map(d => seedSkyline(rng(seed + d.s), d));
    if (type === 'dawn') S.mid = cityFor([
        { s: 1, baseY: 0.74, h: 0.20, wMin: 0.04, wMax: 0.08, litProb: 0.06, color: '#1a3049', tone: '#33506e', warm: 0.5 },
        { s: 2, baseY: 0.80, h: 0.30, wMin: 0.03, wMax: 0.06, litProb: 0.12, color: '#0c1c2e', tone: '#1c3040', warm: 0.55 },
    ]);
    else if (type === 'genesis') S.mid = cityFor([
        { s: 1, baseY: 0.80, h: 0.16, wMin: 0.04, wMax: 0.07, litProb: 0.10, color: '#111d33', tone: '#26385a', warm: 0.4 },
    ]);
    else if (type === 'garuda') S.mid = cityFor([
        { s: 3, baseY: 0.88, h: 0.12, wMin: 0.03, wMax: 0.06, litProb: 0.12, color: '#062028', tone: '#0c4048', warm: 0.15 },
    ]);
    else if (type === 'coexist') S.mid = cityFor([
        { s: 1, baseY: 0.66, h: 0.22, wMin: 0.045, wMax: 0.08, litProb: 0.22, color: '#2a1a08', tone: '#5a3c18', warm: 0.75 },
        { s: 2, baseY: 0.74, h: 0.34, wMin: 0.03, wMax: 0.06, litProb: 0.32, color: '#160f04', tone: '#3a260c', warm: 0.8 },
    ]);
    else if (type === 'sparks') S.mid = cityFor([
        { s: 1, baseY: 0.80, h: 0.14, wMin: 0.04, wMax: 0.07, litProb: 0.05, color: '#160a12', tone: '#301826', warm: 0.3 },
    ]);
    else if (type === 'fortress') S.mid = cityFor([
        { s: 1, baseY: 0.74, h: 0.14, wMin: 0.04, wMax: 0.07, litProb: 0.05, color: '#0e1826', tone: '#22384f', warm: 0.2 },
    ]);
    else if (type === 'inferno') S.mid = cityFor([
        { s: 1, baseY: 0.66, h: 0.24, wMin: 0.045, wMax: 0.09, litProb: 0.05, color: '#2a1006', tone: '#5a1e08', warm: 0.9 },
        { s: 2, baseY: 0.74, h: 0.36, wMin: 0.03, wMax: 0.06, litProb: 0.06, color: '#180802', tone: '#3c1204', warm: 0.95 },
    ]);

    // Kerumunan (ahli / manusia+robot / warga) — posisi stabil.
    const seedCrowd = (n, kinds) => { for (let k = 0; k < n; k++) S.crowd.push({ x: 0.06 + (k / (n - 1)) * 0.88 + (R() - 0.5) * 0.02, sc: 0.85 + R() * 0.4, kind: kinds[k % kinds.length] }); };
    if (type === 'genesis') seedCrowd(9, ['human']);
    else if (type === 'coexist') seedCrowd(9, ['worker', 'human', 'worker', 'human']);
    else if (type === 'sparks') seedCrowd(11, ['civ']);
    else if (type === 'inferno') { seedCrowd(9, ['soldier']); for (let k = 0; k < 4; k++) S.crowd.push({ x: 0.2 + k * 0.18, sc: 0.7, kind: 'flee' }); }

    // Jet tempur asing (2039) — bergerak pelan lintas horizon.
    if (type === 'sparks') for (let k = 0; k < 5; k++) S.jets.push({ x: R(), y: 0.16 + R() * 0.12, sc: 0.7 + R() * 0.6, sp: 0.02 + R() * 0.02 });

    // Barisan robot menyusut (fortress / battalion)
    if (type === 'fortress' || type === 'battalion') {
        const rows = type === 'fortress' ? 5 : 4;
        for (let row = 0; row < rows; row++) {
            const rr = rng(seed + row * 11), n = 7 + row * 2, line = [];
            for (let k = 0; k < n; k++) line.push({ t: (k + 0.5) / n, j: (rr() - 0.5) * 0.02, ignite: rr() });
            S.ranks.push({ row, n, line });
        }
    }
    // Gunung berlapis (laststand)
    if (type === 'laststand') S.mountains = [seedRidge(rng(seed + 1), 0.60, 0.16), seedRidge(rng(seed + 2), 0.66, 0.24), seedRidge(rng(seed + 3), 0.74, 0.34)];
    // Simpul jaringan ASEAN (garuda)
    if (type === 'garuda') for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + R() * 0.2; S.nodes.push({ a, rad: 0.30 + R() * 0.12, ph: R() * 6.283 }); }
}

const PARTICLE_SPEC = {
    dawn: { count: 26, mode: 'rise', rMin: 0.5, rMax: 1.4 },
    genesis: { count: 22, mode: 'rise', rMin: 0.4, rMax: 1.2 },
    garuda: { count: 34, mode: 'rise', rMin: 0.4, rMax: 1.2 },
    coexist: { count: 22, mode: 'rise', rMin: 0.5, rMax: 1.3 },
    sparks: { count: 60, mode: 'rain', rMin: 0.5, rMax: 1.1 },
    battalion: { count: 50, mode: 'spark', rMin: 0.4, rMax: 1.4 },
    fortress: { count: 26, mode: 'ash', rMin: 0.4, rMax: 1.2 },
    inferno: { count: 80, mode: 'ember', rMin: 0.7, rMax: 2.2 },
    laststand: { count: 70, mode: 'snow', rMin: 0.5, rMax: 1.2 },
    none: { count: 0, mode: 'none', rMin: 1, rMax: 1 },
};

function seedSkyline(R, d) {
    const buildings = [];
    let x = -0.03;
    while (x < 1.03) {
        const bw = d.wMin + R() * (d.wMax - d.wMin), bh = d.h * (0.32 + R() * 0.68), wins = [];
        const cols = Math.max(1, Math.floor(bw / 0.013)), rows = Math.max(2, Math.floor(bh / 0.022));
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
            if (R() < d.litProb) wins.push({ u: (c + 0.5) / cols, v: (r + 0.5) / rows, warm: R() < d.warm, ph: R() * 6.283, blink: R() < 0.1 });
        buildings.push({ x: x + bw * 0.5, w: bw, h: bh, wins, antenna: R() < 0.3 });
        x += bw + (0.004 + R() * 0.012);
    }
    return { def: d, buildings };
}

function seedRidge(R, baseY, amp) {
    const pts = []; let x = 0;
    while (x <= 1.001) { pts.push({ x, y: baseY - amp * (0.25 + R() * 0.75) }); x += 0.05 + R() * 0.05; }
    return { baseY, amp, pts };
}

// ===================== RENDER =====================
function render(dt) {
    if (!ctx) return;
    const ch = PROLOGUE_CHAPTERS[idx];
    const a = chapterAlpha();
    const pw = W * dpr, ph = H * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.clearRect(0, 0, pw, ph);

    // Ken Burns: zoom + pan pelan (parallax murah).
    const kb = chapT / chapterTotal();
    const zoom = 1.02 + kb * 0.05;
    const panX = panDir * (kb - 0.5) * 0.04 * pw;
    ctx.save();
    ctx.translate(pw / 2 + panX, ph / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-pw / 2, -ph / 2);
    drawScene(ch.art, pw, ph, dt);
    ctx.restore();

    // Grade tipis + vignette + grain + fade + letterbox.
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    grade(ph, pw, ph);
    vignette(pw, ph);
    filmGrain(pw, ph);
    if (a < 1) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - a) + ')'; ctx.fillRect(0, 0, pw, ph); }
    const bar = ph * 0.11;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pw, bar); ctx.fillRect(0, ph - bar, pw, bar);

    const rise = (1 - smooth(clamp01(chapT / cfg().fadeInSec))) * 16;
    setText(yearEl, a, rise, ch.art.accent);
    setText(titleEl, a, rise * 0.7, null);
    setText(bodyEl, a, rise * 0.4, null);
    if (counterEl) counterEl.style.opacity = String(a * 0.7);
}

function setText(el, a, rise, color) {
    if (!el) return;
    el.style.opacity = String(a);
    el.style.transform = 'translateY(' + rise.toFixed(1) + 'px)';
    if (color) el.style.color = color;
}

function drawScene(art, w, h, dt) {
    sky(art, w, h);
    switch (art.type) {
        case 'dawn': sceneDawn(art, w, h); break;
        case 'genesis': sceneGenesis(art, w, h); break;
        case 'garuda': sceneGaruda(art, w, h); break;
        case 'coexist': sceneCoexist(art, w, h); break;
        case 'sparks': sceneSparks(art, w, h); break;
        case 'battalion': sceneBattalion(art, w, h); break;
        case 'fortress': sceneFortress(art, w, h); break;
        case 'inferno': sceneInferno(art, w, h); break;
        case 'laststand': sceneLastStand(art, w, h); break;
    }
    drawParticles(art, w, h, dt);
}

// ---------- Primitif murah ----------
// Satu halo cahaya (dipakai hemat — hanya cahaya kunci).
function softGlow(x, y, r, color, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
}
// Pita kabut atmosfer (aerial perspective murah, TANPA blur).
function haze(color, y0, y1, a, w) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
}

function sky(art, w, h) {
    const c = art.sky;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c[0]); g.addColorStop(0.55, c[1] || c[0]); g.addColorStop(1, c[2] || c[1] || c[0]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Bintang (satu pass 'lighter', titik kecil — murah)
    if (S && S.stars.length) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const st of S.stars) {
            const tw = 0.4 + 0.6 * Math.sin(driftT * st.sp + st.tw);
            ctx.fillStyle = hexA('#dfeaff', 0.5 * tw);
            ctx.fillRect(st.x * w, st.y * h, st.r * dpr, st.r * dpr);
        }
        ctx.restore();
    }
}

// Skyline sederhana (siluet + jendela + antena). Aerial perspective lewat WARNA.
function drawSkylines(w, h) {
    if (!S) return;
    for (const L of S.mid) {
        const d = L.def, baseY = d.baseY * h;
        ctx.fillStyle = d.color;
        for (const b of L.buildings) {
            const bx = b.x * w - b.w * w / 2, bw = b.w * w, bh = b.h * h;
            ctx.fillRect(bx, baseY - bh, bw, bh);
            if (b.antenna) ctx.fillRect(b.x * w - 0.6 * dpr, baseY - bh - 7 * dpr, 1.2 * dpr, 7 * dpr);
        }
        // jendela
        for (const b of L.buildings) {
            const bx = b.x * w - b.w * w / 2, bw = b.w * w, bh = b.h * h;
            for (const win of b.wins) {
                const al = win.blink ? (0.4 + 0.5 * (0.5 + 0.5 * Math.sin(driftT * 2 + win.ph))) : 0.85;
                ctx.fillStyle = hexA(win.warm ? '#ffcf92' : '#bfe0ff', al);
                ctx.fillRect(bx + win.u * bw - 0.9 * dpr, baseY - bh + (1 - win.v) * bh - 1 * dpr, 1.8 * dpr, 2 * dpr);
            }
        }
        // kabut kaki lapisan → menyatu
        haze(d.tone, baseY, baseY - h * 0.12, 0.16, w);
    }
}

// MONAS — obelisk marmer + lidah api emas (ikon Jakarta/Indonesia, slide 2028).
function monas(cx, baseY, hgt, w) {
    const shaftW = hgt * 0.05;
    ctx.fillStyle = '#243447';
    ctx.fillRect(cx - hgt * 0.14, baseY - hgt * 0.1, hgt * 0.28, hgt * 0.1);        // pelataran
    ctx.beginPath();                                                                 // obelisk meruncing
    ctx.moveTo(cx - shaftW, baseY - hgt * 0.1); ctx.lineTo(cx + shaftW, baseY - hgt * 0.1);
    ctx.lineTo(cx + shaftW * 0.6, baseY - hgt * 0.92); ctx.lineTo(cx - shaftW * 0.6, baseY - hgt * 0.92); ctx.closePath(); ctx.fill();
    // cawan + lidah api
    ctx.fillRect(cx - hgt * 0.05, baseY - hgt * 0.97, hgt * 0.1, hgt * 0.05);
    ctx.fillStyle = '#ffb43a';
    ctx.beginPath(); ctx.moveTo(cx, baseY - hgt * 1.06); ctx.lineTo(cx + hgt * 0.03, baseY - hgt * 0.97); ctx.lineTo(cx - hgt * 0.03, baseY - hgt * 0.97); ctx.closePath(); ctx.fill();
    softGlow(cx, baseY - hgt * 1.0, hgt * 0.18, '#ffb43a', 0.4);
}

// Gedung MARKAS N.U.S.A (slide 2029): monumen institusi + emblem bercahaya.
function hqBuilding(cx, baseY, bw, bh, art) {
    ctx.fillStyle = '#141b2c';
    ctx.fillRect(cx - bw / 2, baseY - bh, bw, bh);                                    // badan
    ctx.fillRect(cx - bw * 0.62, baseY - bh * 0.5, bw * 1.24, bh * 0.5);              // sayap bawah lebih lebar
    // kolom pintu masuk (siluet)
    ctx.fillStyle = '#0d1320';
    for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * bw * 0.16 - 1.5 * dpr, baseY - bh * 0.32, 3 * dpr, bh * 0.32);
    // jendela
    ctx.fillStyle = hexA(art.accent, 0.75);
    for (let r = 0; r < 6; r++) for (let c = -3; c <= 3; c++) if ((r + c) % 2 === 0) ctx.fillRect(cx + c * bw * 0.12 - 2 * dpr, baseY - bh + bh * 0.08 + r * bh * 0.1, 4 * dpr, 5 * dpr);
    // emblem bercahaya di puncak (lingkaran + bintang) = insignia negara
    const ey = baseY - bh - bh * 0.06;
    softGlow(cx, ey, bh * 0.22, art.accent, 0.5);
    ctx.fillStyle = hexA(art.accent2, 0.95);
    star(cx, ey, bh * 0.06, 5);
}

// Bintang lima sudut (emblem).
function star(cx, cy, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const rr = i % 2 ? r * 0.45 : r, a = i / (n * 2) * 6.283 - Math.PI / 2; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
}

// EMBLEM GARUDA (elang bercahaya, slide 2030) — siluet elang sayap terkembang.
function garudaEmblem(cx, cy, s, art, t) {
    const flap = Math.sin(t * 1.4) * 0.06;
    softGlow(cx, cy, s * 2.4, art.accent, 0.4);
    softGlow(cx, cy, s * 1.2, art.accent2, 0.45);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hexA(art.accent2, 0.92);
    // badan
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.5); ctx.lineTo(cx + s * 0.12, cy + s * 0.6); ctx.lineTo(cx - s * 0.12, cy + s * 0.6); ctx.closePath(); ctx.fill();
    // kepala + paruh
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.5, s * 0.14, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + s * 0.1, cy - s * 0.52); ctx.lineTo(cx + s * 0.28, cy - s * 0.46); ctx.lineTo(cx + s * 0.1, cy - s * 0.42); ctx.closePath(); ctx.fill();
    // sayap (dua sisi, tiap sayap 3 bulu segitiga) — sedikit mengepak
    for (const sgn of [-1, 1]) {
        for (let f = 0; f < 3; f++) {
            const a = (0.5 + f * 0.35 + flap) * sgn;
            const len = s * (1.3 - f * 0.18);
            ctx.beginPath();
            ctx.moveTo(cx, cy - s * 0.2 + f * s * 0.12);
            ctx.lineTo(cx + Math.cos(a) * len * sgn * 0 + sgn * len, cy - s * 0.2 + f * s * 0.12 - Math.sin(a) * len + s * 0.1);
            ctx.lineTo(cx + sgn * len * 0.9, cy - s * 0.05 + f * s * 0.16);
            ctx.closePath(); ctx.fill();
        }
    }
    // ekor (kipas)
    for (let f = -2; f <= 2; f++) { ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.55); ctx.lineTo(cx + f * s * 0.09, cy + s * 0.95); ctx.lineTo(cx + f * s * 0.09 + s * 0.05, cy + s * 0.95); ctx.closePath(); ctx.fill(); }
    ctx.restore();
}

// Jaringan konsorsium (garis + simpul + pulsa) di sekitar emblem.
function network(cx, cy, w, h, art, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1 * dpr;
    for (const n of S.nodes) {
        const nx = cx + Math.cos(n.a) * n.rad * w, ny = cy + Math.sin(n.a) * n.rad * h * 1.3;
        ctx.strokeStyle = hexA(art.accent, 0.25);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
        const pk = (t * 0.4 + n.ph / 6.283) % 1;
        ctx.fillStyle = hexA('#ffffff', 0.8); ctx.fillRect(lerp(cx, nx, pk) - 1.5 * dpr, lerp(cy, ny, pk) - 1.5 * dpr, 3 * dpr, 3 * dpr);
        ctx.fillStyle = hexA(art.accent, 0.9); ctx.fillRect(nx - 2 * dpr, ny - 2 * dpr, 4 * dpr, 4 * dpr);
    }
    ctx.restore();
}

// Prajurit siluet (manusia) — dipakai warga/tentara/Gibran.
function human(x, baseY, s, color, kind) {
    ctx.fillStyle = color;
    const bw = s * 0.32;
    ctx.fillRect(x - bw * 0.4, baseY - s * 0.42, bw * 0.32, s * 0.42);
    ctx.fillRect(x + bw * 0.08, baseY - s * 0.42, bw * 0.32, s * 0.42);
    ctx.fillRect(x - bw * 0.45, baseY - s * 0.9, bw * 0.9, s * 0.5);
    ctx.beginPath(); ctx.arc(x, baseY - s * 0.98, s * 0.12, 0, 6.283); ctx.fill();
    if (kind === 'soldier') {                                                        // helm + senapan
        ctx.beginPath(); ctx.arc(x, baseY - s * 1.0, s * 0.15, Math.PI, 0); ctx.fill();
        ctx.lineWidth = Math.max(1.2, s * 0.04); ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(x - bw * 0.5, baseY - s * 0.5); ctx.lineTo(x + bw * 0.8, baseY - s * 0.74); ctx.stroke();
    }
}

// Robot pekerja (slide 2032): mengangkut KOTAK di depan dada (bukan tempur).
function worker(x, baseY, s, color) {
    ctx.fillStyle = color;
    const bw = s * 0.36;
    ctx.fillRect(x - bw * 0.42, baseY - s * 0.4, bw * 0.26, s * 0.4);
    ctx.fillRect(x + bw * 0.16, baseY - s * 0.4, bw * 0.26, s * 0.4);
    ctx.fillRect(x - bw * 0.48, baseY - s * 0.86, bw * 0.96, s * 0.48);
    ctx.beginPath(); ctx.moveTo(x - s * 0.13, baseY - s * 0.86); ctx.lineTo(x + s * 0.13, baseY - s * 0.86); ctx.lineTo(x + s * 0.1, baseY - s * 1.0); ctx.lineTo(x - s * 0.1, baseY - s * 1.0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2fb8a6'; ctx.fillRect(x - s * 0.07, baseY - s * 0.94, s * 0.14, s * 0.02);   // mata teal (sipil/ramah)
    ctx.fillStyle = '#6a5230'; ctx.fillRect(x - s * 0.2, baseY - s * 0.62, s * 0.4, s * 0.22);      // KOTAK diangkut
    ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = 1 * dpr; ctx.strokeRect(x - s * 0.2, baseY - s * 0.62, s * 0.4, s * 0.22);
}

// Robot prajurit angular (mata merah opsional) — militer.
function robot(x, baseY, s, color, eye) {
    ctx.fillStyle = color;
    const bw = s * 0.4;
    ctx.fillRect(x - bw * 0.42, baseY - s * 0.4, bw * 0.26, s * 0.4);
    ctx.fillRect(x + bw * 0.16, baseY - s * 0.4, bw * 0.26, s * 0.4);
    ctx.fillRect(x - bw * 0.5, baseY - s * 0.9, bw, s * 0.52);
    ctx.fillRect(x - bw * 0.62, baseY - s * 0.88, bw * 0.16, s * 0.2);
    ctx.fillRect(x + bw * 0.46, baseY - s * 0.88, bw * 0.16, s * 0.2);
    ctx.beginPath(); ctx.moveTo(x - s * 0.15, baseY - s * 0.9); ctx.lineTo(x + s * 0.15, baseY - s * 0.9); ctx.lineTo(x + s * 0.11, baseY - s * 1.05); ctx.lineTo(x - s * 0.11, baseY - s * 1.05); ctx.closePath(); ctx.fill();
    if (eye) { ctx.fillStyle = eye; ctx.fillRect(x - s * 0.09, baseY - s * 1.0, s * 0.18, s * 0.025); softGlow(x, baseY - s * 0.99, s * 0.28, eye, 0.5); }
}

// Jet tempur (slide 2039) — siluet delta.
function jet(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + s * 22, y); ctx.lineTo(x - s * 8, y - s * 3); ctx.lineTo(x - s * 20, y - s * 10);
    ctx.lineTo(x - s * 14, y - s * 1); ctx.lineTo(x - s * 24, y); ctx.lineTo(x - s * 14, y + s * 1);
    ctx.lineTo(x - s * 20, y + s * 10); ctx.lineTo(x - s * 8, y + s * 3); ctx.closePath(); ctx.fill();
}

// Api horizon (kota terbakar) — cheap: satu gradien + beberapa halo.
function fire(horizonY, w, h, t, intensity) {
    const flick = 0.72 + Math.sin(t * 8) * 0.16;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, horizonY - h * 0.2, 0, horizonY + h * 0.03);
    g.addColorStop(0, hexA('#ff6a1a', 0)); g.addColorStop(1, hexA('#ffb23a', 0.42 * intensity * flick));
    ctx.fillStyle = g; ctx.fillRect(0, horizonY - h * 0.2, w, h * 0.23);
    ctx.restore();
    for (let i = 0; i < 5; i++) softGlow((i + 0.5) / 5 * w + Math.sin(t * 2 + i) * w * 0.015, horizonY - h * 0.01, w * 0.07 * (0.7 + intensity), '#ff7a1e', 0.28 * flick * intensity);
}

function moon(cx, cy, r) {
    softGlow(cx, cy, r * 3.6, '#fff2d0', 0.22);
    ctx.fillStyle = '#f2ebd4'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(210,204,182,0.5)';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.15, r * 0.16, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.24, cy + r * 0.28, r * 0.11, 0, 6.283); ctx.fill();
}

function flag(x, y, s, t) {
    ctx.strokeStyle = '#0a0806'; ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath(); ctx.moveTo(x, y + s * 1.4); ctx.lineTo(x, y - s * 0.2); ctx.stroke();
    const fw = s * 0.95, fh = s * 0.52, seg = 10;
    for (let half = 0; half < 2; half++) {
        ctx.fillStyle = half === 0 ? '#d61f26' : '#f5f5f5';
        ctx.beginPath();
        for (let i = 0; i <= seg; i++) { const k = i / seg, wv = Math.sin(k * 6 + t * 4.2) * fh * 0.13; ctx.lineTo(x + k * fw, y - s * 0.2 + half * fh * 0.5 + wv); }
        for (let i = seg; i >= 0; i--) { const k = i / seg, wv = Math.sin(k * 6 + t * 4.2) * fh * 0.13; ctx.lineTo(x + k * fw, y - s * 0.2 + (half + 1) * fh * 0.5 + wv); }
        ctx.closePath(); ctx.fill();
    }
}

// Mata G.A.R.U.D.A yang mengawasi (slide 2040/2044). `red` = dibajak.
function garudaEye(cx, cy, s, color) {
    softGlow(cx, cy, s * 2.2, color, 0.4);
    ctx.fillStyle = hexA(color, 0.9);
    ctx.beginPath(); ctx.ellipse(cx, cy, s, s * 0.5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#05060a';
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, 6.283); ctx.fill();
    ctx.fillStyle = hexA(color, 1); ctx.beginPath(); ctx.arc(cx, cy, s * 0.12, 0, 6.283); ctx.fill();
}

function searchlight(x, y, angle, len, spread, color, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-spread * 0.2, 0); ctx.lineTo(-spread, -len); ctx.lineTo(spread, -len); ctx.lineTo(spread * 0.2, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
}

// ---------- Partikel ----------
function drawParticles(art, w, h, dt) {
    if (!S) return;
    const spec = PARTICLE_SPEC[art.type] || PARTICLE_SPEC.none;
    if (spec.mode === 'none') return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of S.particles) {
        if (spec.mode === 'rise' || spec.mode === 'spark' || spec.mode === 'ember') {
            p.y -= p.v * dt * (spec.mode === 'ember' ? 0.13 : 0.09);
            p.x += Math.sin(driftT * 0.7 * p.sway + p.ph) * 0.0005;
            if (p.y < -0.02) { p.y = 1.02; p.x = (p.x + 0.37) % 1; }
        } else {
            p.y += p.v * dt * (spec.mode === 'rain' ? 0.6 : (spec.mode === 'snow' ? 0.12 : 0.14));
            p.x += (spec.mode === 'rain' ? 0.04 : Math.sin(driftT + p.ph) * 0.02) * dt * p.sway;
            if (p.y > 1.02) { p.y = -0.02; p.x = (p.x + 0.53) % 1; }
        }
        const px = ((p.x % 1) + 1) % 1 * w, py = p.y * h, tw = 0.5 + 0.5 * Math.sin(driftT * 3 + p.ph);
        let col, al;
        if (spec.mode === 'rain') { col = '#9fb4c8'; al = 0.3 + tw * 0.2; }
        else if (spec.mode === 'snow') { col = '#dfe9f5'; al = 0.35 + tw * 0.3; }
        else if (spec.mode === 'ember') { col = tw > 0.5 ? '#ffb04a' : '#ff6a24'; al = 0.4 + tw * 0.4; }
        else if (spec.mode === 'spark') { col = '#ffcf7a'; al = 0.5 + tw * 0.4; }
        else if (spec.mode === 'ash') { col = '#8a8078'; al = 0.25 + tw * 0.25; }
        else { col = art.accent; al = 0.4 + tw * 0.4; }
        if (spec.mode === 'rain') { ctx.strokeStyle = hexA(col, al); ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 1 * dpr, py + p.r * 6 * dpr); ctx.stroke(); }
        else { ctx.fillStyle = hexA(col, al); ctx.fillRect(px, py, p.r * dpr, p.r * dpr); }
    }
    ctx.restore();
}

// ---------- Kerumunan ----------
function drawCrowd(baseY, s, w) {
    if (!S) return;
    for (const c of S.crowd) {
        const x = c.x * w, sc = s * c.sc;
        if (c.kind === 'worker') worker(x, baseY, sc, '#06070c');
        else if (c.kind === 'soldier') robot(x, baseY, sc, '#05060a', '#ff2a1e');
        else human(x, baseY, sc, '#06060c', c.kind === 'soldier' ? 'soldier' : (c.kind === 'flee' ? 'flee' : ''));
    }
}

// ---------- Adegan per-era (OBJEK = NARASI) ----------
// 2028: MONAS + kota bangun + fajar + data naik (kebangkitan digital Indonesia).
function sceneDawn(art, w, h) {
    softGlow(w * 0.66, h * 0.74, w * 0.34, art.accent2, 0.4);   // matahari terbit
    softGlow(w * 0.66, h * 0.74, w * 0.12, '#fff0d0', 0.5);
    haze(art.sky[2], h * 0.6, h * 0.74, 0.22, w);
    drawSkylines(w, h);
    monas(w * 0.34, h * 0.80, h * 0.5, w);                       // MONAS ikonik
    // data naik dari kota (kebangkitan digital) — garis teal pendek
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(art.accent, 0.5); ctx.lineWidth = 1 * dpr;
    const R = rng(281);
    for (let k = 0; k < 16; k++) { const x = R() * w, y0 = h * (0.7 + R() * 0.06), ln = h * (0.05 + R() * 0.1) * (0.5 + 0.5 * Math.sin(driftT * 1.5 + k)); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - ln); ctx.stroke(); }
    ctx.restore();
}

// 2029: GEDUNG MARKAS N.U.S.A + kerumunan PARA AHLI berkumpul di depannya.
function sceneGenesis(art, w, h) {
    drawSkylines(w, h);
    haze(art.sky[2], h * 0.62, h * 0.76, 0.2, w);
    // sorot institusi
    searchlight(w * 0.5, h * 0.82, -0.2, h * 0.5, w * 0.1, art.accent, 0.06);
    searchlight(w * 0.5, h * 0.82, 0.2, h * 0.5, w * 0.1, art.accent, 0.06);
    hqBuilding(w * 0.5, h * 0.82, w * 0.2, h * 0.42, art);       // MARKAS ber-emblem
    drawCrowd(h * 0.84, h * 0.07, w);                            // PARA AHLI berkumpul
}

// 2030: EMBLEM GARUDA bercahaya + jaringan ASEAN (kelahiran G.A.R.U.D.A).
function sceneGaruda(art, w, h) {
    drawSkylines(w, h);
    const cx = w * 0.5, cy = h * 0.44;
    network(cx, cy, w, h, art, driftT);
    garudaEmblem(cx, cy, h * 0.2, art, driftT);
    softGlow(cx, h * 0.9, w * 0.5, art.accent, 0.12);            // pantulan di kaki kota
}

// 2032: ROBOT PEKERJA mengangkut beban + manusia (koeksistensi, ekonomi ramai).
function sceneCoexist(art, w, h) {
    softGlow(w * 0.5, h * 0.66, w * 0.5, art.accent, 0.16);      // pijar golden-hour
    drawSkylines(w, h);
    // derek/gudang samar (aktivitas ekonomi) di latar
    ctx.strokeStyle = '#241706'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(w * 0.14, h * 0.66); ctx.lineTo(w * 0.14, h * 0.5); ctx.lineTo(w * 0.28, h * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.86, h * 0.66); ctx.lineTo(w * 0.86, h * 0.52); ctx.lineTo(w * 0.74, h * 0.54); ctx.stroke();
    drawCrowd(h * 0.84, h * 0.075, w);                           // robot pekerja + manusia
}

// 2039: JET ASING di horizon + robot SIPIL (belum merah) + badai/kilat.
function sceneSparks(art, w, h) {
    // awan badai (elips solid, tanpa blur)
    ctx.fillStyle = hexA('#160810', 0.7);
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(w * (0.12 + k * 0.2), h * 0.2, w * 0.16, h * 0.07, 0, 0, 6.283); ctx.fill(); }
    // kilat
    flashT -= 0.016; if (flashT <= 0 && Math.random() < 0.016) flashT = 0.13;
    if (flashT > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hexA('#cfe0ff', flashT * 2.4); ctx.fillRect(0, 0, w, h * 0.5); ctx.restore(); }
    drawSkylines(w, h);
    // JET TEMPUR ASING mendekat (agresi militer asing)
    for (const j of S.jets) { const jx = ((j.x + driftT * j.sp) % 1.1) * w; jet(jx, j.y * h, j.sc * dpr, '#0a0d14'); }
    // ROBOT SIPIL berjajar (mata teal ramah, belum merah) — yang "dilihat" pemerintah
    for (const c of S.crowd) worker(c.x * w, h * 0.82, h * 0.06 * c.sc, '#0a0508');
    fire(h * 0.8, w, h, driftT, 0.15);
}

// 2040: LINI PERAKITAN robot PRAJURIT (Iron Battalion) di bawah MATA GARUDA.
function sceneBattalion(art, w, h) {
    // pijar foundry dari bawah
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, h * 0.9, 0, h * 0.6); g.addColorStop(0, hexA('#ff3a12', 0.35)); g.addColorStop(1, hexA('#ff3a12', 0)); ctx.fillStyle = g; ctx.fillRect(0, h * 0.6, w, h * 0.3);
    ctx.restore();
    // gantry rakitan (garis atas)
    ctx.strokeStyle = '#1a1211'; ctx.lineWidth = 3 * dpr;
    ctx.beginPath(); ctx.moveTo(0, h * 0.32); ctx.lineTo(w, h * 0.32); ctx.stroke();
    for (let x = w * 0.1; x < w; x += w * 0.16) { ctx.beginPath(); ctx.moveTo(x, h * 0.32); ctx.lineTo(x, h * 0.42); ctx.stroke(); }
    // MATA GARUDA mengawasi dari atas (membimbing)
    garudaEye(w * 0.5, h * 0.22, h * 0.05, '#ff8a3a');
    // BARISAN robot prajurit dirakit — sebagian mata MENYALA merah (jadi war machine)
    for (const rk of S.ranks) {
        const yy = h * (0.62 + rk.row * 0.08), sc = h * (0.12 - rk.row * 0.016);
        ctx.save(); ctx.globalAlpha = 1 - rk.row * 0.14;
        for (const it of rk.line) {
            const x = w * (0.06 + it.t * 0.88 + it.j);
            const on = (Math.sin(driftT * 1.2 + it.ignite * 6.283) > 0.2);   // mata menyala bergiliran
            robot(x, yy, sc, '#141011', on ? '#ff2a1e' : null);
        }
        ctx.restore();
    }
    // welding sparks
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA('#ffcf7a', 0.7); ctx.lineWidth = 1.3 * dpr;
    const R = rng(400 + Math.floor(driftT * 12));
    for (let k = 0; k < 16; k++) { const x = R() * w, y = h * (0.55 + R() * 0.25); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2 * dpr, y + (8 + R() * 16) * dpr); ctx.stroke(); }
    ctx.restore();
}

// 2043: BARISAN pasukan robot masif + tembok benteng + sorot.
function sceneFortress(art, w, h) {
    haze(art.sky[2], h * 0.5, h * 0.66, 0.18, w);
    for (let k = 0; k < 3; k++) { const a = -0.5 + Math.sin(driftT * 0.4 + k * 2) * 0.4; searchlight(w * (0.25 + k * 0.25), h * 0.74, a, h * 0.7, w * 0.06, art.accent, 0.08); }
    drawSkylines(w, h);
    // tembok benteng
    ctx.fillStyle = '#0b1420'; ctx.fillRect(0, h * 0.7, w, h * 0.05);
    for (let x = 0; x < w; x += w * 0.05) ctx.fillRect(x, h * 0.68, w * 0.026, h * 0.02);
    // barisan robot menyusut (aerial haze makin jauh)
    for (const rk of S.ranks) {
        const yy = h * (0.78 + rk.row * 0.045), sc = h * (0.075 - rk.row * 0.012);
        ctx.save(); ctx.globalAlpha = 1 - rk.row * 0.15;
        for (const it of rk.line) robot(w * (0.05 + it.t * 0.9 + it.j), yy, sc, '#0b141e', '#ff3a2a');
        ctx.restore();
        haze(art.sky[2], yy, yy - h * 0.05, 0.14 + rk.row * 0.05, w);
    }
}

// 2044: kota TERBAKAR + robot menyerang + warga lari + MATA GARUDA MERAH (dibajak).
function sceneInferno(art, w, h) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.7); g.addColorStop(0, hexA('#ff4a12', 0)); g.addColorStop(1, hexA('#ff5a1a', 0.36)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.7);
    ctx.restore();
    drawSkylines(w, h);
    fire(h * 0.7, w, h, driftT, 1.0);
    garudaEye(w * 0.5, h * 0.2, h * 0.045, '#ff2a1e');           // GARUDA DIBAJAK (merah)
    // glitch tipis di sekitar mata
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA('#ff3020', 0.4); ctx.lineWidth = 1 * dpr;
    for (let k = 0; k < 4; k++) { const y = h * 0.2 + (Math.random() - 0.5) * h * 0.06; ctx.beginPath(); ctx.moveTo(w * 0.4, y); ctx.lineTo(w * 0.6, y); ctx.stroke(); }
    ctx.restore();
    drawCrowd(h * 0.86, h * 0.055, w);                          // robot menyerang + warga lari
}

// 2045: gunung BANDUNG + MAJOR GIBRAN + bendera + kota terbakar jauh.
function sceneLastStand(art, w, h) {
    moon(w * 0.74, h * 0.26, h * 0.05);
    fire(h * 0.68, w, h, driftT, 0.35);                         // kota terbakar jauh
    const tones = ['#0d1a32', '#0a1326', '#050c18'];
    for (let i = 0; i < S.mountains.length; i++) {
        const m = S.mountains[i];
        ctx.fillStyle = tones[i];
        ctx.beginPath(); ctx.moveTo(0, m.baseY * h);
        for (const p of m.pts) ctx.lineTo(p.x * w, p.y * h);
        ctx.lineTo(w, m.baseY * h); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        haze('#16324a', m.baseY * h, m.baseY * h - h * 0.07, 0.2, w);
    }
    const hx = w * 0.32, hy = h * 0.8;
    human(hx, hy, h * 0.12, '#03060e', 'soldier');              // MAJOR GIBRAN
    flag(hx + h * 0.07, hy - h * 0.12, h * 0.11, driftT);
}

// ===================== GRADE (murah) =====================
function grade(_h, w, h) {
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.18;
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#243a50'); g.addColorStop(1, '#0a0d12'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
}
function vignette(w, h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.24, w / 2, h * 0.56, h * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.72, 'rgba(0,0,0,0.24)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function ensureGrain() {
    if (grainTile) return;
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext ? c.getContext('2d') : null; if (!g) { grainTile = null; return; }
    const id = g.createImageData ? g.createImageData(128, 128) : null;
    if (id && id.data) { for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255 | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } if (g.putImageData) g.putImageData(id, 0, 0); }
    grainTile = c;
}
function filmGrain(w, h) {
    if (!grainTile) return;
    const pat = ctx.createPattern ? ctx.createPattern(grainTile, 'repeat') : null;
    if (!pat) return;
    ctx.save(); ctx.globalAlpha = 0.04; ctx.globalCompositeOperation = 'overlay';
    ctx.translate((Math.random() * 30) | 0, (Math.random() * 30) | 0);
    ctx.fillStyle = pat; ctx.fillRect(-30, -30, w + 60, h + 60);
    ctx.restore();
}

// #rrggbb + alpha → rgba().
function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
