// ============================================================
// menuArt.js — GAMBAR VEKTOR LAYAR MENU (ROMBAK TOTAL 2026-08-09)
// ============================================================
// Menu lama memakai EMOJI (🏛️/🌆) + gradien radial merah sebagai "seni"; itu
// yang membuatnya terbaca sebagai template generik. Semua gambar layar menu
// sekarang dibuat DI SINI sebagai line-art SVG buatan tangan:
//
//   skylineSvg(layer)  siluet Jakarta 2045 TIGA LAPIS (far/mid/near) untuk latar
//                      parallax #mainMenu + #modeSelect — Monas jadi jangkar
//                      komposisi, ditemani menara, derek, dan asap kebakaran.
//   modeArtSvg(mode)   skema misi tiap kartu mode: denah pertahanan Monas
//                      (survival) dan profil rute delapan stage (campaign).
//
// ATURAN:
// 1. Warna WAJIB dari MENU_INK — turunan palet GIBS 2045 (amber manusia, teal
//    sipil, merah-bata hazard, kertas hangat). Tanpa neon cyan/magenta.
// 2. Variasi (jendela menyala, tinggi lantai) memakai HASH DETERMINISTIK, bukan
//    Math.random — menu dibangun ulang tiap kali panel dibuka dan harus selalu
//    tampil persis sama.
// 3. Semua koordinat digambar di satu sistem 1600×420 dgn tanah di y=420;
//    CSS yang menskalakan (preserveAspectRatio slice), bukan JS.

// Tinta menu — semua turunan src/world/palette.js (dipakai juga oleh CSS).
export const MENU_INK = Object.freeze({
    far: '#2b2d34',      // siluet terjauh, paling terhapus kabut
    mid: '#1b1d22',      // skyline utama
    near: '#0d0e11',     // atap latar depan (paling gelap)
    amber: '#ffb03b',    // PAL.amber — aksen manusia
    amberDim: '#8a5a14', // PAL.amberDim — jendela menyala
    tech: '#2fb8a6',     // PAL.tech — teal sipil
    techDim: '#1f5f57',  // jendela/layar standby
    hazard: '#b3402e',   // PAL.hazard — lampu peringatan & vektor ancaman
    paper: '#d8d2c4',    // PAL.white — garis teknis terang
});

const W = 1600;   // lebar kanvas skyline
const GY = 420;   // garis tanah

// Hash deterministik (mixer 32-bit) — pengganti Math.random supaya susunan
// jendela & tinggi lantai identik di setiap sesi. Aturan sama dgn lanskap Stage 5.
function rnd(seed) {
    let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const n = (v) => Math.round(v * 10) / 10;
const rect = (x, y, w, h, cls) =>
    `<rect${cls ? ` class="${cls}"` : ''} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/>`;
const poly = (pts, cls) =>
    `<polygon${cls ? ` class="${cls}"` : ''} points="${pts.map(p => n(p[0]) + ',' + n(p[1])).join(' ')}"/>`;

// --- Tabel gedung: [x, lebar, tinggi, gaya]. Ditulis tangan, bukan digenerate:
// kepadatan sengaja dimiringkan ke KANAN karena teks menu duduk di kiri. ---

const FAR_BLOCKS = [
    [10, 92, 96, 'flat'], [96, 64, 138, 'flat'], [150, 120, 78, 'step'],
    [262, 56, 172, 'spire'], [310, 104, 110, 'flat'], [404, 78, 150, 'step'],
    [470, 132, 92, 'flat'], [590, 60, 186, 'spire'], [640, 110, 124, 'flat'],
    [742, 96, 84, 'flat'], [826, 70, 160, 'step'], [888, 128, 104, 'flat'],
    [1006, 58, 178, 'spire'], [1056, 116, 90, 'flat'], [1164, 84, 142, 'step'],
    [1240, 104, 76, 'flat'], [1336, 66, 166, 'spire'], [1394, 122, 112, 'flat'],
    [1508, 100, 88, 'flat'],
];

// Sengaja ada CELAH di sekitar x≈930: itu pelataran Monas. Tak ada satu pun
// gedung mid yang boleh lebih tinggi dari tugunya (306) — jangkar komposisi
// harus jadi titik tertinggi, persis seperti aslinya di Lapangan Merdeka.
const MID_BLOCKS = [
    [-20, 128, 156, 'step'], [96, 74, 214, 'flat'], [162, 100, 128, 'flat'],
    [252, 60, 268, 'spire'], [304, 146, 182, 'step'], [438, 86, 232, 'flat'],
    [516, 116, 142, 'flat'], [624, 92, 196, 'step'], [672, 64, 262, 'spire'],
    [772, 134, 150, 'flat'], [812, 86, 208, 'step'], [968, 122, 128, 'flat'],
    [1082, 64, 206, 'flat'], [1216, 96, 176, 'step'], [1304, 70, 268, 'spire'],
    [1366, 152, 188, 'step'], [1508, 112, 236, 'flat'],
];

// Latar depan: atap RENDAH memanjang (bingkai bawah layar) + dua massa tinggi
// di tepi supaya komposisi punya "kusen" kiri-kanan.
const NEAR_BLOCKS = [
    [-40, 210, 118, 'roof'], [150, 168, 86, 'roof'], [300, 122, 132, 'roof'],
    [408, 196, 74, 'roof'], [590, 150, 104, 'roof'], [728, 210, 82, 'roof'],
    [922, 164, 122, 'roof'], [1072, 188, 90, 'roof'], [1246, 142, 138, 'roof'],
    [1376, 264, 100, 'roof'],
];

// Satu massa gedung/gaya. 'spire' & 'step' membawa detail atap sendiri supaya
// garis langit tidak pernah jadi deretan kotak rata.
function blockSvg(b, seed) {
    const [x, w, h, kind] = b;
    const y = GY - h;
    let s = rect(x, y, w, h);
    if (kind === 'spire') {
        const cx = x + w * 0.5;
        s += poly([[x, y], [x + w, y], [cx + w * 0.24, y - 26], [cx - w * 0.24, y - 26]]);
        s += rect(cx - 1.4, y - 60, 2.8, 34);
        s += `<circle class="miBeacon" cx="${n(cx)}" cy="${n(y - 64)}" r="2.8"/>`;
    } else if (kind === 'step') {
        const w2 = w * 0.56, x2 = x + (w - w2) * 0.5, h2 = Math.max(14, h * 0.2);
        s += rect(x2, y - h2, w2, h2 + 2);
        s += rect(x2 + w2 * 0.42, y - h2 - 20, 2.4, 20);
    } else if (kind === 'roof') {
        // Parapet + kotak lift/AC — atap tempat kamera "berdiri".
        s += rect(x, y - 5, w, 6);
        s += rect(x + w * 0.16, y - 22, w * 0.2, 18);
        s += rect(x + w * 0.62, y - 15, w * 0.16, 11);
    } else {
        s += rect(x + w * 0.14, y - 10, w * 0.2, 10);
        s += rect(x + w * 0.6, y - 6, w * 0.26, 6);
        if (rnd(seed * 13) > 0.55) s += rect(x + w * 0.86, y - 26, 2.2, 26);
    }
    return s;
}

// Jendela menyala: hanya ~1 dari 6 sel, dua warna (amber hunian, teal sipil).
// Sengaja jarang — kota ini sedang mati listrik, bukan Times Square.
function windowsSvg(b, seed) {
    const [x, w, h] = b;
    const cols = Math.floor(w / 15), rows = Math.floor(h / 19);
    if (cols < 1 || rows < 1) return '';
    const padX = (w - cols * 15) * 0.5 + 4;
    let s = '';
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const v = rnd(seed * 9176 + c * 131 + r * 17);
            if (v < 0.82) continue;
            s += rect(x + padX + c * 15, GY - h + 9 + r * 19, 6, 7,
                v > 0.955 ? 'miWinT' : 'miWin');
        }
    }
    return s;
}

// MONAS — jangkar komposisi. Proporsi asli: pelataran lebar, tugu meruncing,
// cawan, lidah api. Api satu-satunya elemen amber terang di skyline.
function monasSvg(cx) {
    const top = GY - 306;
    return rect(cx - 58, GY - 14, 116, 14)
        + rect(cx - 34, GY - 44, 68, 30)
        + poly([[cx - 9.5, GY - 44], [cx + 9.5, GY - 44], [cx + 5.4, top], [cx - 5.4, top]])
        + poly([[cx - 17, top], [cx + 17, top], [cx + 9, top - 15], [cx - 9, top - 15]])
        + poly([[cx - 6, top - 15], [cx + 6, top - 15], [cx + 2.6, top - 34],
        [cx - 1, top - 24], [cx - 4, top - 33]], 'miFlame');
}

// Derek konstruksi — garis, bukan massa: memecah siluet kotak.
function craneSvg(x, h, dir) {
    const top = GY - h, jib = 132 * dir;
    return `<g class="miWire">`
        + `<path d="M${n(x)} ${GY} L${n(x)} ${n(top)}"/>`
        + `<path d="M${n(x - jib * 0.34)} ${n(top)} L${n(x + jib)} ${n(top)}"/>`
        + `<path d="M${n(x)} ${n(top - 26)} L${n(x + jib * 0.72)} ${n(top)}"/>`
        + `<path d="M${n(x)} ${n(top - 26)} L${n(x - jib * 0.3)} ${n(top)}"/>`
        + `<path d="M${n(x + jib * 0.66)} ${n(top)} L${n(x + jib * 0.66)} ${n(top + 42)}"/>`
        + `</g>`;
}

// Asap kebakaran: pilar tipis yang melebar ke atas. Dua titik saja — kota yang
// diserang, bukan kota yang terbakar habis.
function smokeSvg(x, h, lean) {
    return poly([[x - 9, GY - h * 0.06], [x + 9, GY - h * 0.06],
    [x + 30 + lean, GY - h], [x - 16 + lean, GY - h]], 'miSmoke');
}

// Satu lapis skyline. `layer` menentukan tabel gedung + detail yang dibawa.
export function skylineSvg(layer) {
    const blocks = layer === 'far' ? FAR_BLOCKS : layer === 'near' ? NEAR_BLOCKS : MID_BLOCKS;
    let body = '';
    blocks.forEach((b, i) => { body += blockSvg(b, i + 1); });

    if (layer === 'mid') {
        body += monasSvg(930);
        MID_BLOCKS.forEach((b, i) => { body += windowsSvg(b, i + 3); });
        body += craneSvg(486, 268, 1) + craneSvg(1454, 300, -1);
        body += smokeSvg(352, 300, 46) + smokeSvg(1258, 250, -34);
    } else if (layer === 'near') {
        // Tiang antena + parabola di atap latar depan (kanan bawah): "kamera"
        // menu berdiri di atap stasiun relai.
        body += `<g class="miWire">`
            + `<path d="M1494 ${GY} L1494 ${GY - 196}"/>`
            + `<path d="M1462 ${GY - 150} L1526 ${GY - 150}"/>`
            + `<path d="M1470 ${GY - 118} L1518 ${GY - 118}"/>`
            + `<path d="M1494 ${GY - 196} L1360 ${GY - 96}"/>`
            + `<path d="M1494 ${GY - 196} L1596 ${GY - 108}"/>`
            + `</g>`
            + `<circle class="miBeacon" cx="1494" cy="${GY - 200}" r="3.4"/>`
            + rect(1256, GY - 158, 8, 40)
            + `<path class="miDish" d="M1236 ${GY - 176} a30 30 0 0 1 46 26 l-46 20 z"/>`;
    } else {
        body += craneSvg(1122, 190, 1);
    }

    return `<svg class="miSvg" viewBox="0 0 ${W} ${GY}" preserveAspectRatio="xMidYMax slice"`
        + ` xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
        + `<g class="miBody">${body}</g></svg>`;
}

// ---------- Skema kartu mode ----------
// Keduanya digambar sebagai LEMBAR TEKNIS (garis tipis, tick), bukan ikon.
// KETERANGAN SUDUT DIBUANG 2026-08-10: "MERDEKA SQ" / "360° HOSTILE" /
// "ROUTE PROFILE // 8 STAGES" / "IKN UPLINK" mengulang apa yang sudah ditulis
// kartunya sendiri, dan empat label mikro di empat sudut adalah pengisi ruang.
// Nomor stage di atas simpul rute TETAP — itu data grafiknya, bukan hiasan.

// Kurung sudut lembar — pengganti bingkai kotak penuh, supaya bingkai .mcArt di
// CSS tidak jadi garis ganda.
const CORNERS = `<path class="maFrame" d="M10 28 L10 10 L30 10 M290 10 L310 10 L310 28`
    + ` M310 112 L310 130 L290 130 M30 130 L10 130 L10 112"/>`;

// SURVIVAL: denah Lapangan Merdeka — cincin pertahanan mengecil ke Monas,
// enam vektor ancaman masuk dari tepi. Titik awal ditulis sebagai KOORDINAT di
// dalam bingkai (bukan panjang dari pusat) supaya tak pernah terpotong tepi.
function survivalArt() {
    const cx = 160, cy = 74;
    let s = CORNERS;
    for (const r of [58, 42, 26]) s += `<circle class="maRing" cx="${cx}" cy="${cy}" r="${r}"/>`;
    // Sudut bawah kiri/kanan sengaja dikosongkan — di situ label berdiri.
    const starts = [[30, 48], [104, 20], [250, 24], [298, 68], [266, 106], [54, 106]];
    for (const [x0, y0] of starts) {
        const dx = cx - x0, dy = cy - y0, m = Math.hypot(dx, dy);
        const ux = dx / m, uy = dy / m;
        const x1 = cx - ux * 32, y1 = cy - uy * 32;
        s += `<path class="maVec" d="M${n(x0)} ${n(y0)} L${n(x1)} ${n(y1)}"/>`;
        s += poly([[x1, y1], [x1 - ux * 9 - uy * 4, y1 - uy * 9 + ux * 4],
        [x1 - ux * 9 + uy * 4, y1 - uy * 9 - ux * 4]], 'maHead');
    }
    // Monas dalam denah: alas persegi + garis bidik.
    s += `<rect class="maCore" x="${cx - 9}" y="${cy - 9}" width="18" height="18"/>`;
    s += `<path class="maCoreMark" d="M${cx} ${cy - 20} L${cx} ${cy + 20} M${cx - 20} ${cy} L${cx + 20} ${cy}"/>`;
    return wrapArt(s);
}

// CAMPAIGN: profil rute delapan stage Jakarta ke timur, ditutup menara pemancar
// yang jadi tujuan cerita.
function campaignArt() {
    // Tinggi tiap simpul ditulis tangan = profil medan, bukan garis lurus.
    const ys = [98, 90, 82, 94, 72, 80, 60, 66];
    let path = '', dots = '';
    ys.forEach((y, i) => {
        const x = 26 + i * 30;
        path += (i ? ' L' : 'M') + x + ' ' + y;
        dots += `<rect class="maNode${i === 0 ? ' maNodeOn' : ''}" x="${x - 3.5}" y="${y - 3.5}" width="7" height="7"/>`;
        if (i % 2 === 0) dots += `<text class="maNum" x="${x}" y="${y - 11}">0${i + 1}</text>`;
    });
    let s = CORNERS;
    // Medan di bawah rute: siluet kasar kota lalu perbukitan.
    s += `<path class="maTerrain" d="M14 130 L14 110 L46 106 L64 114 L92 102 L120 112 L150 98`
        + ` L182 108 L214 90 L244 98 L272 80 L298 88 L298 130 Z"/>`;
    s += `<path class="maRoute" d="${path}"/>`;
    s += `<path class="maRouteGhost" d="M236 66 L286 52"/>`;
    s += dots;
    // Menara pemancar IKN + gelombang siar.
    s += `<path class="maMast" d="M286 52 L286 34 M279 41 L293 41 M281 47 L291 47"/>`;
    for (const r of [8, 14, 20]) s += `<path class="maWave" d="M${286 - r} 34 A${r} ${r} 0 0 1 ${286 + r} 34"/>`;
    s += `<circle class="maCore2" cx="286" cy="32" r="3"/>`;
    return wrapArt(s);
}

function wrapArt(body) {
    return `<svg class="maSvg" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet"`
        + ` xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

export function modeArtSvg(mode) {
    return mode === 'campaign' ? campaignArt() : survivalArt();
}

// Isi seluruh wadah gambar di dalam `root` (satu layar menu): tiap `.mCity`
// dapat lapis skyline sesuai data-depth, tiap `[data-art]` dapat skema modenya.
export function paintMenuArt(root) {
    if (!root) return;
    for (const el of root.querySelectorAll('.mCity')) {
        el.innerHTML = skylineSvg(el.dataset.depth || 'mid');
    }
    for (const el of root.querySelectorAll('[data-art]')) {
        el.innerHTML = modeArtSvg(el.dataset.art);
    }
}
