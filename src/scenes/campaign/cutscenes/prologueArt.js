// ILUSTRASI PROLOG — setengah KANAN layar (2026-07-31, permintaan user:
// "SEKARANG BUATKAN ILUSTRASINYA!! SESUAI DENGAN DIALOG CHAPTERSNYA!! tapi
// backgroundnya harus tetap hitam").
//
// MEDIUM: SVG inline di DOM `#prologueArt` — BUKAN kanvas, BUKAN objek THREE.
// Alasannya teknis, bukan selera: selama prolog berjalan `prologueScene`
// memasang `skipRender` (render 3D dilewati total di balik overlay hitam),
// jadi satu-satunya yang bisa tampil adalah DOM; dan SVG garis tipis menyala
// di atas hitam pekat terbaca sebagai skema/berkas briefing — satu bahasa
// dgn teks yang diketik di kolom kiri, bukan "slideshow" (bentuk kartu 2D
// yang dulu ditolak user; ilustrasi ini ada KEMBALI atas permintaan eksplisit
// user 2026-07-31 — lihat docs/campaign.md).
//
// GAYA: line-art duotone palet GIBS 2045 (turunan token src/world/palette.js,
// dibekukan sbg hex CSS di ART_COLORS): teal `PAL.tech` utk garis teknologi,
// AMBER `PAL.amber` utk aksen manusia/harapan, merah-bata `PAL.hazard` utk era
// dibajak/perang — TANPA neon cyan/magenta (disapu assert smoke: setiap hex di
// SVG wajib anggota ART_COLORS). Latar SVG transparan → hitam #prologue tembus.
//
// KONTRAK PER ERA (dipatok assert smoke "ILUSTRASI"): urutan ART_MOTIFS ==
// urutan PROLOGUE_CHAPTERS, tiap SVG unik + membawa `data-era`/`data-motif`.
//   0 city      2028 — skyline Jakarta + Monas + jejak sirkuit naik (kebangkitan digital)
//   1 nusa      2029 — emblem PT N.U.S.A + markas + barisan ahli berkumpul
//   2 garuda    2030 — burung GARUDA + 9 node konsorsium ASEAN berdenyut
//   3 coexist   2032 — manusia & robot pekerja berdampingan (roda ekonomi)
//   4 jets      2039 — jet asing melintas + radar + robot menatap ke atas
//   5 mahapatih 2040 — keris menyilang + lini perakitan pekerja→prajurit (scan)
//   6 fortress  2043 — benteng + merah-putih + barisan pasukan di baliknya
//   7 zerohour  2044 — mata G.A.R.U.D.A memerah + kepulauan, 4 kota jatuh
//   8 laststand 2045 — pegunungan Bandung, cahaya amber, siluet Major Gibran
//
// ANIMASI: kelas CSS kecil (aPulse/aBlink/aScan/aSpin di css/style.css) pada
// elemen aksen — murah (compositor), tak tersentuh JS per frame. JS hanya
// menukar innerHTML saat GANTI ERA (cache `artEra`) dan menulis opacity wadah
// per frame (selubung fade era dari prologue.js) — pola yang sama dgn teksnya.

// Hex CSS palet ilustrasi — turunan langsung token PAL (palette.js memakai int
// 0x...; DOM butuh string). Kalau PAL di-retune, samakan di sini.
const T = '#2fb8a6';    // PAL.tech      — garis teknologi/sirkuit
const TD = '#0f3b36';   // PAL.techDim   — garis latar/samar
const A = '#ffb03b';    // PAL.amber     — aksen manusia/harapan
const AD = '#8a5a14';   // PAL.amberDim  — berkas cahaya redup
const R = '#b3402e';    // PAL.hazard    — dibajak/perang (BUKAN merah mata robot)
const W = '#d8d2c4';    // PAL.white     — bintang/label/putih bendera
const S = '#7c848c';    // PAL.steel     — logam/manusia netral
const INK = '#23262b';  // PAL.ink       — isi siluet (di atas hitam tetap terbaca)
export const ART_COLORS = [T, TD, A, AD, R, W, S, INK];

export const ART_MOTIFS = ['city', 'nusa', 'garuda', 'coexist', 'jets', 'mahapatih', 'fortress', 'zerohour', 'laststand'];

// ---------- primitif bersama ----------
// Robot kecil (jangkar KAKI di titik lokal 0,0; tinggi ±64 pada s=1).
// `eye` = warna visor (teal pekerja / merah prajurit); `armed` = lengan meriam.
function bot(x, y, s, eye, armed) {
    return `<g transform="translate(${x} ${y}) scale(${s})">`
        + `<rect x="-15" y="-40" width="30" height="24" rx="4" stroke="${T}" fill="${INK}"/>`
        + `<rect x="-10" y="-60" width="20" height="16" rx="4" stroke="${T}" fill="${INK}"/>`
        + `<line x1="-4" y1="-52" x2="4" y2="-52" stroke="${eye}" stroke-width="4"/>`
        + `<line x1="-9" y1="-16" x2="-9" y2="0" stroke="${T}"/>`
        + `<line x1="9" y1="-16" x2="9" y2="0" stroke="${T}"/>`
        + `<line x1="-15" y1="-36" x2="-22" y2="-20" stroke="${T}"/>`
        + (armed
            ? `<rect x="15" y="-37" width="24" height="8" rx="2" stroke="${R}" fill="${INK}"/>`
            : `<line x1="15" y1="-36" x2="22" y2="-20" stroke="${T}"/>`)
        + '</g>';
}
// Sosok manusia sederhana (jangkar kaki 0,0; tinggi ±40 pada s=1).
function man(x, y, s, c) {
    return `<g transform="translate(${x} ${y}) scale(${s})" stroke="${c}">`
        + `<circle cx="0" cy="-34" r="5" fill="${INK}"/>`
        + `<line x1="0" y1="-29" x2="0" y2="-13"/>`
        + `<line x1="0" y1="-24" x2="-7" y2="-16"/><line x1="0" y1="-24" x2="7" y2="-16"/>`
        + `<line x1="0" y1="-13" x2="-6" y2="0"/><line x1="0" y1="-13" x2="6" y2="0"/>`
        + '</g>';
}
// Gedung skyline (dasar di y=300) + dua garis jendela samar.
function bldg(x, w, h) {
    return `<rect x="${x}" y="${300 - h}" width="${w}" height="${h}" stroke="${T}" fill="${INK}"/>`
        + `<line x1="${x + w * 0.33}" y1="${306 - h}" x2="${x + w * 0.33}" y2="294" stroke="${TD}" stroke-dasharray="3 5"/>`
        + `<line x1="${x + w * 0.67}" y1="${306 - h}" x2="${x + w * 0.67}" y2="294" stroke="${TD}" stroke-dasharray="3 5"/>`;
}
// Kepulauan Indonesia tersederhanakan (pita y ±200-290).
function isles(col) {
    return `<g stroke="${col}" fill="${INK}">`
        + `<ellipse cx="92" cy="216" rx="56" ry="15" transform="rotate(38 92 216)"/>`
        + `<rect x="128" y="268" width="122" height="14" rx="7"/>`
        + `<ellipse cx="190" cy="210" rx="40" ry="31"/>`
        + `<path d="M256 188 q15 9 9 27 q17 -7 24 9 q-15 5 -22 3 q5 19 -7 28 q-9 -17 -10 -31 q-9 11 -19 9 q9 -13 15 -17 q1 -15 10 -28 z"/>`
        + `<ellipse cx="330" cy="240" rx="33" ry="19"/>`
        + '</g>';
}
// Sayap garuda (sisi kanan; sisi kiri = mirror scale(-1,1)).
function wing(sign) {
    return `<path transform="scale(${sign} 1)" d="M14 -10 Q60 -46 98 -42 Q66 -28 52 -22 Q72 -18 86 -8 Q58 -8 46 -4 Q58 4 64 14 Q42 8 26 2 Z" stroke="${T}" fill="${INK}"/>`;
}
// Kepala robot mungil utk barisan pasukan di balik benteng.
function rank(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})">`
        + `<rect x="-7" y="-10" width="14" height="10" rx="2" stroke="${TD}" fill="${INK}"/>`
        + `<circle cx="0" cy="-5" r="1.6" fill="${R}" stroke="none"/>`
        + '</g>';
}
// Tanda kota JATUH (silang merah berkedip + lingkar).
function cityX(x, y, delay) {
    return `<g transform="translate(${x} ${y})" class="aBlink" style="animation-delay:${delay}s">`
        + `<circle r="10" stroke="${R}" fill="none"/>`
        + `<line x1="-5" y1="-5" x2="5" y2="5" stroke="${R}" stroke-width="3"/>`
        + `<line x1="-5" y1="5" x2="5" y2="-5" stroke="${R}" stroke-width="3"/>`
        + '</g>';
}

// ---------- satu adegan per era ----------
const SCENES = {
    // 2028 — kebangkitan digital: skyline + Monas + sirkuit merambat naik ke halo data.
    city() {
        let s = `<g stroke="${TD}" fill="none"><circle cx="200" cy="94" r="32"/><circle cx="200" cy="94" r="56"/><circle cx="200" cy="94" r="82"/></g>`
            + `<circle cx="200" cy="94" r="6" fill="${A}" stroke="none" class="aPulse"/>`
            + `<line x1="26" y1="312" x2="374" y2="312" stroke="${S}"/>`
            + bldg(38, 34, 72) + bldg(82, 26, 106) + bldg(116, 30, 62)
            + bldg(254, 30, 90) + bldg(292, 26, 62) + bldg(326, 36, 116);
        s += `<rect x="176" y="288" width="48" height="12" stroke="${T}" fill="${INK}"/>`
            + `<rect x="188" y="270" width="24" height="18" stroke="${T}" fill="${INK}"/>`
            + `<path d="M196 270 L193 152 L207 152 L204 270 Z" stroke="${T}" fill="${INK}"/>`
            + `<path d="M200 134 L207 152 L193 152 Z" fill="${A}" stroke="none" class="aPulse"/>`;
        // jejak sirkuit dari atap gedung menuju halo
        s += `<g stroke="${T}" fill="none">`
            + `<polyline points="99,194 99,158 132,158 132,124"/>`
            + `<polyline points="269,210 269,170 244,170 244,138"/>`
            + `<polyline points="344,184 344,140 310,140 310,116"/>`
            + '</g>'
            + `<circle cx="132" cy="124" r="3.5" fill="${A}" stroke="none" class="aPulse"/>`
            + `<circle cx="244" cy="138" r="3.5" fill="${A}" stroke="none" class="aPulse" style="animation-delay:.5s"/>`
            + `<circle cx="310" cy="116" r="3.5" fill="${A}" stroke="none" class="aPulse" style="animation-delay:1s"/>`;
        return s;
    },

    // 2029 — lahirnya raksasa baru: emblem N.U.S.A + markas + ratusan ahli berkumpul.
    nusa() {
        let s = `<g transform="translate(200 92)">`
            + `<polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" stroke="${A}" fill="${INK}"/>`
            + `<g stroke="${T}" fill="${INK}"><circle r="4.5"/><circle cx="-17" cy="-11" r="3"/><circle cx="15" cy="-15" r="3"/><circle cx="17" cy="13" r="3"/><circle cx="-15" cy="15" r="3"/>`
            + `<line x1="0" y1="0" x2="-17" y2="-11"/><line x1="0" y1="0" x2="15" y2="-15"/><line x1="0" y1="0" x2="17" y2="13"/><line x1="0" y1="0" x2="-15" y2="15"/></g>`
            + `</g>`
            + `<text x="200" y="162" fill="${W}" stroke="none" font-size="15" letter-spacing="5" text-anchor="middle">PT N.U.S.A</text>`;
        s += `<rect x="164" y="180" width="72" height="122" stroke="${T}" fill="${INK}"/>`
            + `<line x1="200" y1="180" x2="200" y2="166" stroke="${T}"/>`
            + `<circle cx="200" cy="163" r="2.5" fill="${A}" stroke="none" class="aPulse"/>`
            + `<line x1="182" y1="192" x2="182" y2="290" stroke="${TD}" stroke-dasharray="4 6"/>`
            + `<line x1="218" y1="192" x2="218" y2="290" stroke="${TD}" stroke-dasharray="4 6"/>`
            + `<rect x="192" y="280" width="16" height="22" stroke="${A}" fill="${INK}"/>`
            + `<line x1="26" y1="302" x2="374" y2="302" stroke="${S}"/>`;
        // para ahli berdatangan dari dua sisi
        for (const [x, sc] of [[52, 0.9], [84, 1.0], [116, 1.1], [146, 1.2]]) s += man(x, 302, sc, S);
        for (const [x, sc] of [[348, 0.9], [316, 1.0], [284, 1.1], [254, 1.2]]) s += man(x, 302, sc, S);
        return s;
    },

    // 2030 — konsorsium Asia Tenggara: garuda + 9 node jaringan berdenyut.
    garuda() {
        let s = '';
        for (let i = 0; i < 9; i++) {
            const a = -Math.PI / 2 + (i / 9) * Math.PI * 2;
            const nx = Math.round(200 + Math.cos(a) * 148), ny = Math.round(196 + Math.sin(a) * 148);
            const ix = Math.round(200 + Math.cos(a) * 64), iy = Math.round(196 + Math.sin(a) * 64);
            s += `<line x1="${ix}" y1="${iy}" x2="${nx}" y2="${ny}" stroke="${TD}"/>`
                + `<circle cx="${nx}" cy="${ny}" r="6" stroke="${T}" fill="${INK}" class="aPulse" style="animation-delay:${(i * 0.27).toFixed(2)}s"/>`;
        }
        s += `<g transform="translate(200 196)">` + wing(1) + wing(-1)
            + `<path d="M0 -18 L16 -6 L12 26 L0 36 L-12 26 L-16 -6 Z" stroke="${T}" fill="${INK}"/>`
            + `<path d="M0 36 L-9 60 L0 53 L9 60 Z" stroke="${T}" fill="${INK}"/>`
            + `<circle cx="0" cy="-30" r="9" stroke="${T}" fill="${INK}"/>`
            + `<path d="M9 -31 L21 -27 L9 -23 Z" fill="${A}" stroke="none"/>`
            + `<path d="M-3 -39 L0 -46 L3 -39 Z" fill="${A}" stroke="none"/>`
            + `</g>`
            + `<text x="200" y="332" fill="${W}" stroke="none" font-size="14" letter-spacing="5" text-anchor="middle">G.A.R.U.D.A</text>`;
        return s;
    },

    // 2032 — koeksistensi: manusia & robot pekerja berhadapan, roda ekonomi berputar.
    coexist() {
        return `<g transform="translate(200 168)" stroke="${TD}" fill="none" class="aSpin">`
            + `<circle r="62"/><circle r="12"/>`
            + `<line x1="0" y1="-62" x2="0" y2="-74"/><line x1="0" y1="62" x2="0" y2="74"/>`
            + `<line x1="-62" y1="0" x2="-74" y2="0"/><line x1="62" y1="0" x2="74" y2="0"/>`
            + `<line x1="-44" y1="-44" x2="-52" y2="-52"/><line x1="44" y1="-44" x2="52" y2="-52"/>`
            + `<line x1="-44" y1="44" x2="-52" y2="52"/><line x1="44" y1="44" x2="52" y2="52"/>`
            + '</g>'
            + `<line x1="40" y1="300" x2="360" y2="300" stroke="${S}"/>`
            + man(148, 300, 2.1, S)
            + `<line x1="160" y1="252" x2="184" y2="262" stroke="${S}"/>`      // tangan manusia terulur
            + bot(252, 300, 1.35, T)
            + `<line x1="232" y1="264" x2="216" y2="262" stroke="${T}"/>`      // capit robot terulur
            + `<circle cx="200" cy="262" r="5" fill="${A}" stroke="none" class="aPulse"/>` // titik temu
            + `<rect x="286" y="272" width="30" height="24" rx="3" stroke="${A}" fill="${INK}"/>`  // peti kerja
            + `<line x1="286" y1="284" x2="316" y2="284" stroke="${A}"/>`;
    },

    // 2039 — percikan geopolitik: jet asing melintas, radar menyapu, robot menatap.
    jets() {
        const jet = (x, y, sc) => `<g transform="translate(${x} ${y}) scale(${sc})">`
            + `<path d="M0 8 L36 0 L28 8 L36 16 Z" stroke="${R}" fill="${INK}"/>`
            + `<line x1="42" y1="8" x2="62" y2="8" stroke="${TD}" stroke-dasharray="4 6"/>`
            + '</g>';
        return jet(272, 52, 1.1) + jet(196, 88, 0.95) + jet(282, 118, 0.8)
            + `<g stroke="${TD}" fill="none">`
            + `<path d="M60 320 m60 0 a60 60 0 0 0 -60 -60"/>`
            + `<path d="M60 320 m98 0 a98 98 0 0 0 -98 -98"/>`
            + `<path d="M60 320 m136 0 a136 136 0 0 0 -136 -136"/>`
            + '</g>'
            + `<line x1="60" y1="320" x2="176" y2="238" stroke="${T}" class="aBlink"/>`
            + `<circle cx="176" cy="238" r="4" fill="${R}" stroke="none" class="aBlink"/>`
            + `<line x1="40" y1="332" x2="360" y2="332" stroke="${S}"/>`
            + bot(296, 332, 1.4, T)
            + `<line x1="290" y1="254" x2="252" y2="146" stroke="${TD}" stroke-dasharray="3 7"/>`  // arah tatapan ke jet
            + `<g transform="translate(338 176)" class="aBlink" style="animation-delay:.4s">`
            + `<path d="M0 -17 L16 11 L-16 11 Z" stroke="${A}" fill="${INK}"/>`
            + `<line x1="0" y1="-7" x2="0" y2="2" stroke="${A}"/><circle cx="0" cy="6.5" r="1.8" fill="${A}" stroke="none"/>`
            + '</g>';
    },

    // 2040 — Protokol Mahapatih: keris menyilang + lini perakitan pekerja→prajurit.
    mahapatih() {
        const keris = (rot) => `<g transform="translate(200 96) rotate(${rot})">`
            + `<path d="M0 -6 q6 -9 0 -18 q-6 -9 0 -18 q5 -8 1 -16 L0 -62 L-2 -58 q-4 9 1 17 q6 9 0 18 q-6 9 -1 17 Z" stroke="${A}" fill="${INK}"/>`
            + `<rect x="-5" y="-8" width="10" height="12" rx="3" stroke="${A}" fill="${INK}"/>`
            + '</g>';
        let s = `<circle cx="200" cy="72" r="52" stroke="${TD}" fill="none"/>` + keris(35) + keris(-35);
        s += `<line x1="52" y1="300" x2="348" y2="300" stroke="${S}"/>`;
        for (let x = 70; x <= 330; x += 40) s += `<circle cx="${x}" cy="307" r="5" stroke="${TD}" fill="${INK}"/>`;
        s += bot(110, 300, 1.15, T)
            + `<path d="M168 300 L168 212 L232 212 L232 300" stroke="${TD}" fill="none"/>`
            + `<line x1="172" y1="256" x2="228" y2="256" stroke="${A}" class="aScan"/>`
            + bot(200, 300, 1.15, T)
            + bot(292, 300, 1.15, R, true)
            + `<path d="M142 262 h16 m-6 -5 l6 5 l-6 5" stroke="${A}" fill="none"/>`
            + `<path d="M240 262 h16 m-6 -5 l6 5 l-6 5" stroke="${A}" fill="none"/>`;
        return s;
    },

    // 2043 — benteng kedaulatan: tembok, merah-putih berkibar, barisan di baliknya.
    fortress() {
        let s = `<line x1="200" y1="210" x2="200" y2="96" stroke="${S}"/>`
            + `<rect x="200" y="96" width="36" height="11" fill="${R}" stroke="none"/>`
            + `<rect x="200" y="107" width="36" height="11" fill="${W}" stroke="none"/>`;
        // barisan pasukan (3 baris, makin jauh makin kecil) — digambar SEBELUM tembok
        for (let i = 0; i < 9; i++) s += rank(72 + i * 33, 178, 0.8);
        for (let i = 0; i < 8; i++) s += rank(84 + i * 34, 192, 0.95);
        for (let i = 0; i < 7; i++) s += rank(94 + i * 36, 208, 1.1);
        // berkas lampu sorot
        s += `<path d="M74 214 L28 128 L108 190 Z" fill="${AD}" opacity="0.3" stroke="none"/>`
            + `<path d="M326 214 L372 128 L292 190 Z" fill="${AD}" opacity="0.3" stroke="none"/>`;
        // tembok + menara + merlon + gerbang
        s += `<rect x="62" y="222" width="276" height="58" stroke="${T}" fill="${INK}"/>`;
        for (let x = 70; x <= 310; x += 40) s += `<rect x="${x}" y="210" width="20" height="12" stroke="${T}" fill="${INK}"/>`;
        s += `<rect x="40" y="196" width="28" height="84" stroke="${T}" fill="${INK}"/>`
            + `<rect x="332" y="196" width="28" height="84" stroke="${T}" fill="${INK}"/>`
            + `<path d="M186 280 L186 252 Q200 238 214 252 L214 280" stroke="${A}" fill="${INK}"/>`
            + `<line x1="26" y1="280" x2="374" y2="280" stroke="${S}"/>`;
        return s;
    },

    // 2044 — Zero Hour: mata G.A.R.U.D.A memerah, empat kota jatuh di peta.
    zerohour() {
        let s = `<g transform="translate(200 84)">`
            + `<path d="M-70 0 Q0 -46 70 0 Q0 46 -70 0 Z" stroke="${R}" fill="${INK}"/>`
            + `<circle r="17" stroke="${R}" fill="${INK}"/>`
            + `<circle r="7" fill="${R}" stroke="none" class="aBlink"/>`
            + `<rect x="-88" y="-5" width="26" height="4" fill="${R}" stroke="none" class="aBlink" style="animation-delay:.2s"/>`
            + `<rect x="64" y="-14" width="22" height="4" fill="${R}" stroke="none" class="aBlink" style="animation-delay:.5s"/>`
            + `<rect x="70" y="7" width="16" height="4" fill="${R}" stroke="none" class="aBlink" style="animation-delay:.8s"/>`
            + '</g>';
        s += `<g stroke="${R}" stroke-dasharray="4 7">`
            + `<line x1="176" y1="110" x2="112" y2="192"/>`
            + `<line x1="200" y1="114" x2="196" y2="256"/>`
            + `<line x1="224" y1="110" x2="282" y2="204"/>`
            + '</g>';
        s += isles(TD)
            + cityX(78, 196, 0) + cityX(150, 272, 0.3) + cityX(225, 276, 0.6) + cityX(262, 232, 0.9);
        return s;
    },

    // 2045 — pertahanan terakhir: pegunungan Bandung, cahaya harapan, Major Gibran.
    laststand() {
        let s = `<defs><radialGradient id="lsGlow"><stop offset="0%" stop-color="${A}" stop-opacity="0.5"/><stop offset="100%" stop-color="${A}" stop-opacity="0"/></radialGradient></defs>`;
        for (const [sx, sy, d] of [[58, 64, 0], [122, 40, 0.7], [206, 30, 1.3], [284, 52, 0.4], [346, 84, 1.0], [92, 110, 1.6], [318, 128, 0.2]])
            s += `<circle cx="${sx}" cy="${sy}" r="1.4" fill="${W}" stroke="none" class="aPulse" style="animation-delay:${d}s"/>`;
        s += `<circle cx="200" cy="222" r="88" fill="url(#lsGlow)" stroke="none" class="aPulse"/>`
            + `<line x1="200" y1="180" x2="200" y2="120" stroke="${A}" class="aPulse"/>`
            + `<circle cx="200" cy="116" r="3" fill="${A}" stroke="none" class="aPulse"/>`
            + `<path d="M18 270 L92 196 L142 242 L200 178 L262 240 L320 202 L382 270 Z" stroke="${TD}" fill="${INK}"/>`
            + `<path d="M0 296 L72 238 L152 284 L242 232 L332 286 L400 254 L400 400 L0 400 Z" stroke="${TD}" fill="${INK}"/>`
            + `<circle cx="62" cy="304" r="2.6" fill="${A}" stroke="none" class="aPulse" style="animation-delay:.6s"/>`
            + `<circle cx="344" cy="300" r="2.6" fill="${A}" stroke="none" class="aPulse" style="animation-delay:1.2s"/>`;
        // siluet Major Gibran dari belakang, menghadap cahaya
        s += `<g transform="translate(200 392)" stroke="${A}">`
            + `<line x1="-18" y1="-32" x2="20" y2="-58" stroke="${S}" stroke-width="3.5"/>`   // senapan tersandang
            + `<circle cx="0" cy="-66" r="9" fill="${INK}"/>`
            + `<path d="M-14 -54 Q0 -60 14 -54 L10 -22 L-10 -22 Z" fill="${INK}"/>`
            + `<line x1="-6" y1="-22" x2="-7" y2="0"/><line x1="6" y1="-22" x2="7" y2="0"/>`
            + '</g>';
        return s;
    },
};

// ---------- API ----------
let CACHE = null;
export function prologueArtSvg(i) {
    if (!CACHE) CACHE = ART_MOTIFS.map((m, idx) =>
        `<svg viewBox="0 0 400 400" data-era="${idx}" data-motif="${m}" xmlns="http://www.w3.org/2000/svg" `
        + `fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">`
        + SCENES[m]() + '</svg>');
    return CACHE[i] || '';
}

let artEl = null, artEra = -1;
function el() {
    if (!artEl && typeof document !== 'undefined' && document.getElementById)
        artEl = document.getElementById('prologueArt');
    return artEl;
}
// Pasang SVG era ke-i — innerHTML hanya ditulis saat GANTI era (bukan tiap frame).
export function showPrologueArt(i) {
    const e = el();
    if (!e || artEra === i) { artEra = i; return; }
    artEra = i;
    e.innerHTML = prologueArtSvg(i);
}
// Opacity wadah — selubung fade per-era dikirim prologue.js tiap frame.
export function setPrologueArtAlpha(a) {
    const e = el();
    if (e && e.style) e.style.opacity = a;
}
export function resetPrologueArt() {
    const e = el();
    if (e) { e.innerHTML = ''; if (e.style) e.style.opacity = 0; }
    artEra = -1;
}
export const prologueArtDebug = () => ({ era: artEra, count: ART_MOTIFS.length, motifs: ART_MOTIFS.slice() });
