// ============================================================
// keyArtSvg.mjs — generator key art VEKTOR (SVG) "Decommission Day"
// ============================================================
// Target gaya: assets/images/low-poly/decommission-day-banner-1250x350-v2.png
// (master low-poly 25:7). Semua bentuk poligon datar + facet shading,
// meniru aset prosedural Three.js game.
//
//   node tools/keyArtSvg.mjs [width] [height] [out.svg]
//
// Komposisi ditulis dalam ruang desain 1250x350 lalu diskalakan uniform
// (U = W/1250); kanvas lebih tinggi hanya menambah langit di atas.
//
// Aturan yang dijaga (docs/PROMOTIONAL-ART.md):
//   - judul persis "DECOMMISSION" / "DAY", huruf dibangun dari <path>
//     (tanpa font eksternal) supaya render identik di mana pun
//   - bendera Indonesia MERAH di atas PUTIH
//   - siluet game-native: Monas, pickup bak terbuka, tank + meriam,
//     robot visor merah, gunship
//   - palet tan/olive/gunmetal hangat; tanpa neon cyan/magenta, tanpa PBR
//   - sebaran acak = hash deterministik, BUKAN Math.random()
// ============================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------- util warna ----------
function parse(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function css(r, g, b) {
    const q = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + q(r) + q(g) + q(b);
}
// facet: k>1 menghadap key light, k<1 menghadap bayangan; warm menambah bara hangat
function T(c, k, warm = 0) {
    const [r, g, b] = parse(c);
    return css(r * k + warm * 46, g * k + warm * 22, b * k + warm * 4);
}

// palet hangat (keluarga concrete/panel/wood dari PAL — tanpa neon)
const C = {
    bld: '#231d16', bldSide: '#171310', win: '#d99a3a',
    ground: '#3b342a', olive: '#6d6552', tan: '#8a8069', steel: '#4b4539',
    stone: '#c9c1ae', dark: '#191510',
    visor: '#ff2020', red: '#b3402e', white: '#d8d2c4', amber: '#ffb03b',
    scarf: '#9c7226', scarfDark: '#241d15',
};
const FIRE = ['#ffe0a0', '#ffb347', '#f5851f', '#c1560f'];

// hash deterministik -> [0,1)
function h1(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const hr = (n, a, b) => a + (b - a) * h1(n);
const hi = (n, a, b) => Math.floor(hr(n, a, b + 0.999));

// ---------- util svg ----------
const out = [];
const put = (s) => out.push(s);
const f = (v) => (Math.round(v * 100) / 100);
const poly = (p, fill, o = '') => put(`<polygon points="${p.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${fill}"${o}/>`);
const ge = () => put('</g>');

// ============================================================
const W = Number(process.argv[2] || 1250);
const H = Number(process.argv[3] || 350);
const OUT = process.argv[4] || 'assets/images/low-poly/decommission-day-banner-1250x350-lowpoly-vector-v1.svg';
const U = W / 1250;              // skala uniform dari ruang desain
const YO = H - 350 * U;          // band ditempel ke bawah; sisanya langit
const X = (x) => x * U;
const Y = (y) => YO + y * U;
const GY = 250;                  // garis tanah (ruang desain)

put(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
put(`<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#080705"/><stop offset="0.72" stop-color="#140f0a"/>
  <stop offset="1" stop-color="#1c1610"/></linearGradient>
<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#6b5d49"/><stop offset="0.45" stop-color="#4f4436"/>
  <stop offset="1" stop-color="#342c24"/></linearGradient>
<radialGradient id="fireGlow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#ff9a2e" stop-opacity="0.55"/>
  <stop offset="0.45" stop-color="#d9631a" stop-opacity="0.22"/>
  <stop offset="1" stop-color="#b34a10" stop-opacity="0"/></radialGradient>
<radialGradient id="hotGlow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#ffe4ae" stop-opacity="0.95"/>
  <stop offset="0.35" stop-color="#ffa62e" stop-opacity="0.4"/>
  <stop offset="1" stop-color="#ffa62e" stop-opacity="0"/></radialGradient>
<radialGradient id="softGlow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#d8c9a4" stop-opacity="0.3"/>
  <stop offset="1" stop-color="#d8c9a4" stop-opacity="0"/></radialGradient>
<linearGradient id="vy" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
  <stop offset="0.28" stop-color="#000" stop-opacity="0"/>
  <stop offset="0.82" stop-color="#000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient>
<linearGradient id="vx" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000" stop-opacity="0.6"/>
  <stop offset="0.12" stop-color="#000" stop-opacity="0"/>
  <stop offset="0.9" stop-color="#000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient>
<linearGradient id="titleFill" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#efe2c2"/><stop offset="0.55" stop-color="#d6c69f"/>
  <stop offset="1" stop-color="#a2957a"/></linearGradient>
<filter id="cast" x="-25%" y="-25%" width="160%" height="170%">
  <feDropShadow dx="${f(3.5 * U)}" dy="${f(6 * U)}" stdDeviation="${f(3 * U)}" flood-color="#0a0806" flood-opacity="0.8"/></filter>
<filter id="soft"><feGaussianBlur stdDeviation="${f(2.4 * U)}"/></filter>
<filter id="softer"><feGaussianBlur stdDeviation="${f(7 * U)}"/></filter>
</defs>`);

// ============================================================
// 1. LANGIT
// ============================================================
put(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>`);
for (let i = 0; i < 9; i++) {
    const cx = X(hr(i * 3 + 1, -60, 1310)), cy = Y(hr(i * 3 + 2, -20, 170));
    const rw = X(hr(i * 3 + 3, 90, 260)), rh = rw * hr(i + 40, 0.3, 0.55);
    put(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rw)}" ry="${f(rh)}" fill="${T(C.bld, hr(i + 70, 0.9, 1.5))}" opacity="${f(hr(i + 90, 0.14, 0.3))}" filter="url(#softer)"/>`);
}

// ============================================================
// 2. SKYLINE — tiga baris blok gelap dengan jendela hangat
// ============================================================
function skyline(seed, baseY, maxH, step, tone, opacity) {
    put(`<g opacity="${opacity}">`);
    let x = -30;
    let i = 0;
    while (x < 1290) {
        const bw = hr(seed + i * 5, 0.55, 1.5) * step;
        const bh = hr(seed + i * 5 + 1, 0.28, 1.0) * maxH;
        poly([[X(x), Y(baseY)], [X(x + bw * 0.84), Y(baseY)], [X(x + bw * 0.84), Y(baseY - bh)], [X(x), Y(baseY - bh)]],
             T(C.bld, tone * hr(seed + i * 5 + 2, 0.9, 1.2)));
        poly([[X(x + bw * 0.84), Y(baseY)], [X(x + bw), Y(baseY - bh * 0.04)], [X(x + bw), Y(baseY - bh * 0.92)], [X(x + bw * 0.84), Y(baseY - bh)]],
             T(C.bldSide, tone));
        const wn = hi(seed + i * 5 + 3, 1, 6);
        for (let k = 0; k < wn; k++) {
            const wx = x + hr(seed + i * 31 + k, 0.1, 0.72) * bw;
            const wy = baseY - hr(seed + i * 37 + k, 0.1, 0.9) * bh;
            put(`<rect x="${f(X(wx))}" y="${f(Y(wy))}" width="${f(2.2 * U)}" height="${f(3.4 * U)}" fill="${C.win}" opacity="${f(hr(seed + i * 41 + k, 0.25, 0.75))}"/>`);
        }
        x += bw + hr(seed + i * 5 + 4, 0.05, 0.35) * step;
        i++;
    }
    ge();
}
skyline(11, GY + 2, 118, 44, 0.75, '0.85');
skyline(29, GY + 5, 82, 56, 1.0, '0.95');
skyline(53, GY + 9, 52, 70, 1.25, '1');

// ============================================================
// 3. MONAS
// ============================================================
(function monas() {
    const cx = 700, base = GY + 4, top = 78;
    const s = (k) => T(C.stone, k);
    put(`<circle cx="${f(X(cx))}" cy="${f(Y(top - 4))}" r="${f(46 * U)}" fill="url(#softGlow)"/>`);
    poly([[X(cx - 33), Y(base)], [X(cx + 33), Y(base)], [X(cx + 28), Y(base - 14)], [X(cx - 28), Y(base - 14)]], s(0.34));
    poly([[X(cx - 28), Y(base - 14)], [X(cx + 28), Y(base - 14)], [X(cx + 28), Y(base - 17)], [X(cx - 28), Y(base - 17)]], s(0.46));
    poly([[X(cx - 20), Y(base - 17)], [X(cx + 20), Y(base - 17)], [X(cx + 16), Y(base - 30)], [X(cx - 16), Y(base - 30)]], s(0.4));
    poly([[X(cx - 7.5), Y(base - 30)], [X(cx), Y(base - 30)], [X(cx), Y(top + 12)], [X(cx - 3.2), Y(top + 12)]], s(0.86));
    poly([[X(cx), Y(base - 30)], [X(cx + 7.5), Y(base - 30)], [X(cx + 3.2), Y(top + 12)], [X(cx), Y(top + 12)]], s(0.55));
    poly([[X(cx - 11), Y(top + 12)], [X(cx + 11), Y(top + 12)], [X(cx + 6), Y(top + 2)], [X(cx - 6), Y(top + 2)]], s(0.7));
    poly([[X(cx), Y(top - 17)], [X(cx + 5), Y(top + 2)], [X(cx - 5), Y(top + 2)]], T(C.amber, 0.95));
    poly([[X(cx), Y(top - 17)], [X(cx + 5), Y(top + 2)], [X(cx + 0.8), Y(top + 2)]], T(C.amber, 0.62));
})();

// ============================================================
// 4. GUNSHIP — menghadap kiri, rotor + tail boom
// ============================================================
(function gunship() {
    put(`<g transform="translate(${f(X(880))},${f(Y(72))}) scale(${f(U)})">`);
    const m = (v) => T(C.olive, v);
    // tail boom + sirip + fenestron
    poly([[22, -2], [104, -6], [106, 2], [22, 6]], m(0.72));
    poly([[96, -8], [116, -30], [124, -28], [110, -4]], m(0.9));
    poly([[104, -6], [124, -10], [126, 0], [106, 3]], m(0.62));
    put(`<circle cx="118" cy="-6" r="9" fill="none" stroke="${m(1.05)}" stroke-width="2.4"/>`);
    poly([[110, -14], [126, 2], [124, 4], [108, -12]], m(1.15));
    // badan (hidung ke kiri)
    poly([[-72, 4], [-60, -8], [-24, -16], [16, -14], [30, -4], [24, 10], [-40, 14]], m(1.0));
    poly([[-72, 4], [-60, -8], [-52, -6], [-58, 6]], m(1.35));
    poly([[-60, -8], [-24, -16], [16, -14], [16, -10], [-58, -3]], m(1.28));
    poly([[-40, 14], [24, 10], [22, 14], [-36, 18]], m(0.6));
    // kanopi tandem
    poly([[-58, -6], [-34, -14], [-18, -14], [-22, -4], [-56, 0]], T(C.dark, 1.5));
    poly([[-34, -14], [-18, -14], [-20, -8], [-32, -8]], T(C.dark, 2.4));
    // hump mesin + exhaust
    poly([[-10, -16], [18, -18], [24, -8], [-8, -8]], m(0.86));
    poly([[16, -16], [30, -14], [30, -8], [16, -9]], m(0.55));
    // stub wing + pod rudal
    poly([[-30, 8], [-4, 6], [-2, 14], [-30, 17]], m(0.78));
    poly([[-34, 14], [-2, 12], [-2, 20], [-34, 22]], m(0.95));
    put(`<circle cx="-26" cy="17" r="3.4" fill="${m(0.5)}"/>`);
    put(`<circle cx="-14" cy="16.4" r="3.4" fill="${m(0.5)}"/>`);
    // skid
    poly([[-48, 18], [-40, 26], [-38, 26], [-45, 18]], m(0.7));
    poly([[0, 16], [4, 26], [6, 26], [3, 16]], m(0.7));
    poly([[-44, 26], [10, 25], [10, 28], [-44, 29]], m(0.85));
    // chin turret
    poly([[-64, 8], [-52, 6], [-50, 14], [-62, 16]], m(1.1));
    poly([[-72, 12], [-60, 10], [-60, 13], [-72, 15]], m(0.9));
    put(`<rect x="-63" y="3" width="10" height="2.4" fill="${C.red}" opacity="0.9"/>`);
    // mast + bilah rotor
    poly([[-8, -18], [4, -18], [4, -26], [-8, -26]], m(0.9));
    poly([[-150, -27.5], [148, -29.5], [148, -27], [-150, -25]], m(1.15), ' opacity="0.95"');
    poly([[-96, -34], [104, -22], [104, -19], [-96, -31]], m(0.8), ' opacity="0.8"');
    poly([[-104, -20], [96, -34], [96, -31], [-104, -17]], m(0.72), ' opacity="0.75"');
    ge();
})();

// ============================================================
// 5. TANAH — bidang berfacet besar + puing
// ============================================================
put(`<rect x="0" y="${f(Y(GY))}" width="${W}" height="${f(H - Y(GY))}" fill="url(#gnd)"/>`);
put(`<rect x="0" y="${f(Y(GY - 16))}" width="${W}" height="${f(40 * U)}" fill="#5a4a33" opacity="0.28" filter="url(#softer)"/>`);
(function groundFacets() {
    const rows = [[GY, GY + 16], [GY + 14, GY + 38], [GY + 34, GY + 66], [GY + 60, GY + 104]];
    rows.forEach((r, ri) => {
        let x = -40;
        let i = 0;
        while (x < 1300) {
            const w = hr(ri * 100 + i, 60, 190);
            const k = hr(ri * 100 + i + 7, 0.78, 1.3);
            const j = hr(ri * 100 + i + 13, -6, 6);
            poly([[X(x), Y(r[0] + j)], [X(x + w), Y(r[0] - j * 0.6)], [X(x + w * 0.9), Y(r[1])], [X(x - 10), Y(r[1] + j * 0.4)]],
                 T(C.ground, (k + 0.24) * (1 - ri * 0.05)), ' opacity="0.5"');
            x += w * 0.86;
            i++;
        }
    });
})();

function box3(x, baseY, w, h, d, col, warm = 0) {
    poly([[X(x), Y(baseY)], [X(x + w), Y(baseY)], [X(x + w), Y(baseY - h)], [X(x), Y(baseY - h)]], T(col, 0.78, warm * 0.5));
    poly([[X(x), Y(baseY - h)], [X(x + w), Y(baseY - h)], [X(x + w + d), Y(baseY - h - d * 0.55)], [X(x + d), Y(baseY - h - d * 0.55)]], T(col, 1.25, warm));
    poly([[X(x + w), Y(baseY)], [X(x + w + d), Y(baseY - d * 0.55)], [X(x + w + d), Y(baseY - h - d * 0.55)], [X(x + w), Y(baseY - h)]], T(col, 0.5, warm * 0.3));
}
function rubbleField(n, y0, y1, sizeLo, sizeHi, seed, avoid = null) {
    for (let i = 0; i < n; i++) {
        const t = h1(seed + i * 7);
        const by = y0 + (y1 - y0) * Math.pow(t, 0.9);
        const bx = hr(seed + i * 7 + 1, -40, 1280);
        if (avoid && bx > avoid[0] && bx < avoid[1] && by < avoid[2]) continue;
        const s = sizeLo + (sizeHi - sizeLo) * ((by - y0) / Math.max(1, y1 - y0)) * hr(seed + i * 7 + 2, 0.7, 1.4);
        const warm = Math.max(0, 0.9 - Math.abs(bx - 120) / 240) * hr(seed + i + 3, 0.3, 1);
        box3(bx, by, s * hr(seed + i * 7 + 4, 0.9, 2.1), s * hr(seed + i * 7 + 5, 0.4, 0.9), s * 0.42,
             hr(seed + i * 7 + 6, 0, 1) > 0.62 ? C.steel : C.ground, warm);
    }
}
rubbleField(70, GY + 2, GY + 34, 3, 6, 400);

// ============================================================
// 6. PICKUP TERBAKAR + api heksagonal
// ============================================================
(function pickup() {
    const px = 150, py = GY + 74;
    put(`<ellipse cx="${f(X(px - 20))}" cy="${f(Y(py - 60))}" rx="${f(200 * U)}" ry="${f(120 * U)}" fill="url(#fireGlow)"/>`);
    for (let i = 0; i < 26; i++) {
        const a = hr(i + 500, 0, 6.283), rr = Math.pow(h1(i + 520), 0.7);
        const fx = px - 30 + Math.cos(a) * rr * 78, fy = py - 46 - Math.sin(a) * rr * 58 - rr * 26;
        const s = (12 - rr * 7) * hr(i + 540, 0.7, 1.35);
        const col = FIRE[Math.min(3, Math.floor(rr * 3.2 + hr(i + 560, 0, 0.9)))];
        const p = [];
        for (let k = 0; k < 6; k++) { const b = k * 1.047 + hr(i + 580, 0, 1); p.push([X(fx + Math.cos(b) * s), Y(fy + Math.sin(b) * s * 0.85)]); }
        poly(p, col, ` opacity="${f(hr(i + 590, 0.4, 0.9))}"`);
    }
    for (let i = 0; i < 6; i++) {
        put(`<ellipse cx="${f(X(px - 46 + hr(i + 610, -18, 26)))}" cy="${f(Y(py - 116 - i * 26))}" rx="${f((22 + i * 9) * U)}" ry="${f((14 + i * 7) * U)}" fill="${T(C.bld, 1.5)}" opacity="${f(0.3 - i * 0.04)}" filter="url(#softer)"/>`);
    }
    put(`<g transform="translate(${f(X(px))},${f(Y(py))}) scale(${f(U)})">`);
    const m = (v, w = 0) => T(C.tan, v * 0.84, w + 0.1);
    poly([[-128, 2], [118, 2], [110, 10], [-120, 10]], T(C.dark, 1.0), ' opacity="0.55"');
    for (const wx of [-86, 64]) {
        put(`<circle cx="${wx}" cy="-14" r="17" fill="#141210"/>`);
        put(`<circle cx="${wx}" cy="-14" r="8" fill="${m(0.62)}"/>`);
        put(`<circle cx="${wx}" cy="-14" r="3" fill="${m(0.95)}"/>`);
    }
    poly([[-124, -14], [110, -14], [106, -34], [-120, -34]], m(0.62));
    poly([[16, -34], [106, -34], [102, -62], [16, -62]], m(0.72));
    poly([[16, -62], [102, -62], [102, -57], [16, -57]], m(1.15));
    poly([[20, -57], [98, -57], [98, -38], [20, -38]], m(0.44));
    poly([[-118, -34], [12, -34], [6, -78], [-84, -82], [-112, -60]], m(0.95));
    poly([[-112, -60], [-84, -82], [6, -78], [4, -72], [-82, -76], [-106, -56]], m(1.3));
    poly([[-104, -58], [-82, -76], [-46, -74], [-46, -54]], T(C.dark, 1.6));
    poly([[-40, -74], [2, -72], [2, -54], [-40, -54]], T(C.dark, 1.35));
    poly([[-104, -58], [-82, -76], [-74, -75], [-98, -57]], T(C.stone, 0.5), ' opacity="0.5"');
    poly([[-128, -36], [-116, -36], [-116, -20], [-128, -20]], m(1.1));
    poly([[-132, -30], [-118, -30], [-118, -24], [-132, -24]], m(0.8));
    put(`<circle cx="-126" cy="-40" r="18" fill="url(#hotGlow)" opacity="0.75"/>`);
    put(`<rect x="-130" y="-44" width="10" height="7" fill="#ffe6b4"/>`);
    put(`<rect x="24" y="-56" width="30" height="4" fill="${C.red}" opacity="0.85"/>`);
    ge();
})();

// ============================================================
// 7. TANK
// ============================================================
(function tank() {
    // scale x negatif = meriam mengarah ke kanan, ke arah Major Gibran
    put(`<g transform="translate(${f(X(452))},${f(Y(GY + 40))}) scale(${f(-U)},${f(U)})">`);
    const m = (v) => T(C.tan, v * 0.86, 0.04);
    poly([[-108, 2], [104, 2], [96, 10], [-100, 10]], T(C.dark, 1.0), ' opacity="0.5"');
    poly([[-100, 0], [98, 0], [92, -20], [-94, -20]], m(0.42));
    for (let i = 0; i < 7; i++) put(`<circle cx="${-84 + i * 27}" cy="-8" r="8" fill="${m(0.3)}"/>`);
    poly([[-100, -20], [98, -20], [96, -24], [-98, -24]], m(0.55));
    poly([[-96, -24], [96, -24], [88, -44], [-70, -44], [-96, -32]], m(0.9));
    poly([[-96, -32], [-70, -44], [-66, -40], [-92, -29]], m(0.78));
    poly([[-70, -44], [88, -44], [86, -40], [-68, -40]], m(1.15));
    poly([[-94, -24], [92, -24], [90, -34], [-92, -34]], m(0.66));
    poly([[-46, -44], [56, -44], [46, -66], [-32, -66]], m(1.0));
    poly([[-32, -66], [46, -66], [42, -61], [-30, -61]], m(1.35));
    poly([[-46, -44], [-32, -66], [-26, -65], [-40, -44]], m(0.82));
    poly([[-52, -62], [-30, -62], [-30, -50], [-52, -50]], m(0.95));
    poly([[-52, -60], [-146, -57], [-146, -52], [-52, -52]], m(1.05));
    poly([[-52, -60], [-146, -57], [-146, -55.4], [-52, -58]], m(1.4));
    poly([[-146, -61], [-162, -60], [-162, -49], [-146, -48]], m(1.2));
    poly([[10, -66], [30, -66], [28, -74], [12, -74]], m(1.1));
    poly([[36, -62], [56, -60], [54, -50], [34, -52]], m(1.22));
    put(`<rect x="-24" y="-60" width="34" height="3.4" fill="${C.red}" opacity="0.9"/>`);
    ge();
})();

// ============================================================
// 8. ROBOT — prajurit mesin olive, visor merah
// ============================================================
const SHOTS = [];
function robot(bx, by, hpx, seed, pose) {
    const k = hpx / 112;
    const flip = h1(seed + 9) > 0.85 ? 1 : -1;   // mayoritas menghadap hero di kanan
    const fl = flip < 0;                          // dicerminkan -> sisi local +x jadi sisi kiri layar
    put(`<g transform="translate(${f(X(bx))},${f(Y(by))}) scale(${f(U * k * flip)},${f(U * k)})">`);
    const glow = Math.max(0, 0.75 - Math.abs(bx - 150) / 420);
    const m = (v) => T(C.olive, v * (0.70 + glow * 0.22), glow * 0.5);
    const d = (v) => T(C.steel, v * (0.72 + glow * 0.2), glow * 0.35);
    const lit = T(C.olive, 1.15, 0.3);
    const stride = pose === 2 ? 16 : pose === 0 ? 10 : 5;
    const cr = pose === 3 ? 12 : 0;

    poly([[-20, 1], [22, 1], [18, 5], [-16, 5]], T(C.dark, 1.0), ' opacity="0.5"');
    // kaki belakang
    poly([[-4 + stride, -8], [8 + stride, -8], [9 + stride, -34 + cr], [-3 + stride, -34 + cr]], d(0.72));
    poly([[-5 + stride, -34 + cr], [9 + stride, -34 + cr], [11, -58 + cr], [-1, -58 + cr]], m(0.6));
    poly([[-6 + stride, -1], [12 + stride, -1], [12 + stride, -8], [-4 + stride, -8]], d(0.6));
    // kaki depan
    poly([[-12 - stride, -8], [0 - stride, -8], [1 - stride, -34 + cr], [-11 - stride, -34 + cr]], d(0.9));
    poly([[-13 - stride, -34 + cr], [1 - stride, -34 + cr], [3, -58 + cr], [-9, -58 + cr]], m(0.8));
    poly([[-16 - stride, -1], [2 - stride, -1], [2 - stride, -8], [-14 - stride, -8]], d(0.78));
    // pinggul + torso
    poly([[-13, -58 + cr], [13, -58 + cr], [12, -68 + cr], [-12, -68 + cr]], d(0.85));
    poly([[-14, -68 + cr], [14, -68 + cr], [16, -88 + cr], [11, -96 + cr], [-11, -96 + cr], [-16, -88 + cr]], m(1.0));
    poly([[2, -68 + cr], [14, -68 + cr], [16, -88 + cr], [11, -96 + cr], [2, -96 + cr]], m(fl ? 1.18 : 0.72));
    poly([[-9, -74 + cr], [9, -74 + cr], [8, -90 + cr], [-8, -90 + cr]], m(1.28));
    poly([[-9, -80 + cr], [9, -80 + cr], [9, -77 + cr], [-9, -77 + cr]], d(0.7));
    poly([[10, -70 + cr], [22, -73 + cr], [23, -90 + cr], [11, -92 + cr]], m(0.56));
    poly([[-22, -94 + cr], [-10, -98 + cr], [-8, -86 + cr], [-20, -83 + cr]], m(fl ? 0.78 : 1.35));
    poly([[22, -94 + cr], [10, -98 + cr], [9, -86 + cr], [20, -83 + cr]], m(fl ? 1.35 : 0.78));
    // kepala + visor
    const hy = -112 + cr;
    poly([[-8, hy + 12], [-7, hy + 2], [-2, hy - 2], [4, hy - 2], [8, hy + 3], [8, hy + 12]], m(1.18));
    poly([[2, hy + 12], [4, hy - 2], [8, hy + 3], [8, hy + 12]], m(fl ? 1.22 : 0.82));
    poly([[-8.4, hy + 7.4], [8.4, hy + 7.4], [8.4, hy + 4.6], [-8.4, hy + 4.6]], T(C.dark, 1.1));
    put(`<rect x="-7" y="${hy + 5}" width="12" height="1.9" fill="${C.visor}"/>`);
    put(`<rect x="-7.6" y="${hy + 4.4}" width="13.2" height="3.1" fill="${C.visor}" opacity="0.22" filter="url(#soft)"/>`);
    if (pose === 1) poly([[6, hy + 2], [7.4, hy - 14], [9, hy + 2]], d(1.0));
    // lengan + senapan
    const gy = pose === 1 ? -92 : pose === 3 ? -80 : -84;
    poly([[-16, -92 + cr], [-8, -94 + cr], [-14, gy + 8 + cr], [-22, gy + 6 + cr]], m(1.12));
    poly([[-22, gy + 8 + cr], [-14, gy + 10 + cr], [-34, gy + 4 + cr], [-38, gy - 2 + cr]], m(0.95));
    poly([[6, -92 + cr], [14, -90 + cr], [4, gy + 10 + cr], [-2, gy + 8 + cr]], m(0.7));
    poly([[-46, gy - 3 + cr], [-6, gy + 2 + cr], [-6, gy + 11 + cr], [-46, gy + 6 + cr]], d(1.15));
    poly([[-46, gy - 3 + cr], [-6, gy + 2 + cr], [-6, gy + 5 + cr], [-46, gy], ], lit, ' opacity="0.5"');
    poly([[-6, gy + 3 + cr], [10, gy + 5 + cr], [10, gy + 12 + cr], [-6, gy + 10 + cr]], d(0.9));
    poly([[-30, gy + 8 + cr], [-20, gy + 9 + cr], [-22, gy + 20 + cr], [-30, gy + 19 + cr]], d(0.8));
    ge();

    if (pose === 1) SHOTS.push([bx + flip * (-48 * k), by + (gy + 3) * k, flip, k]);
}

const BOTS = [];
for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const depth = h1(i * 5 + 201);
    BOTS.push([196 + t * 790 + hr(i * 5 + 200, -26, 26), GY + 24 + Math.pow(depth, 0.85) * 74, 50 + Math.pow(depth, 0.85) * 58, i]);
}
BOTS.sort((a, b) => a[1] - b[1]);
BOTS.forEach((b) => robot(b[0], b[1], b[2], b[3] * 11 + 5, hi(b[3] * 5 + 202, 0, 3)));

for (const [mx, my, flip, k] of SHOTS) {
    put(`<circle cx="${f(X(mx))}" cy="${f(Y(my))}" r="${f(10 * k * U)}" fill="url(#hotGlow)" opacity="0.8"/>`);
    const s = 6 * k;
    poly([[X(mx - flip * s * 1.5), Y(my)], [X(mx), Y(my - s * 0.55)], [X(mx + flip * s * 0.4), Y(my)], [X(mx), Y(my + s * 0.55)]], '#ffe9bd');
    put(`<line x1="${f(X(mx))}" y1="${f(Y(my))}" x2="${f(X(mx - flip * 210 * k))}" y2="${f(Y(my + 7 * k))}" stroke="#ffb347" stroke-width="${f(2.6 * k * U)}" opacity="0.18" filter="url(#soft)"/>`);
    put(`<line x1="${f(X(mx))}" y1="${f(Y(my))}" x2="${f(X(mx - flip * 210 * k))}" y2="${f(Y(my + 7 * k))}" stroke="#ffe3ae" stroke-width="${f(1.0 * k * U)}" opacity="0.7"/>`);
}

rubbleField(48, GY + 66, GY + 106, 6, 13, 700, [640, 1060, GY + 96]);

put(`<rect x="0" y="${f(Y(GY - 40))}" width="${W}" height="${f(96 * U)}" fill="#7a5f34" opacity="0.16" filter="url(#softer)"/>`);

// ============================================================
// 9. HERO — Major Gibran, kanan depan
// ============================================================
(function hero() {
    const m = (v, w = 0) => T(C.tan, v, w);
    const dk = (v) => T(C.steel, v);

    // ---- massa bahu/punggung ----
    poly([[X(905), Y(350)], [X(930), Y(300)], [X(985), Y(268)], [X(1105), Y(256)],
          [X(1215), Y(276)], [X(1258), Y(320)], [X(1258), Y(350)]], m(0.34));
    poly([[X(930), Y(300)], [X(985), Y(268)], [X(1040), Y(282)], [X(985), Y(350)], [X(905), Y(350)]], m(0.5, 0.12));
    poly([[X(1040), Y(282)], [X(1105), Y(256)], [X(1215), Y(276)], [X(1180), Y(350)], [X(985), Y(350)]], m(0.4));
    poly([[X(1215), Y(276)], [X(1258), Y(320)], [X(1258), Y(350)], [X(1180), Y(350)]], m(0.28));

    // ---- syal kotak-kotak ----
    poly([[X(966), Y(322)], [X(1010), Y(288)], [X(1120), Y(280)], [X(1206), Y(302)],
          [X(1194), Y(350)], [X(976), Y(350)]], C.scarf);
    for (let i = 0; i < 120; i++) {
        const cx = 962 + (i % 12) * 21 + (Math.floor(i / 12) % 2) * 10;
        const cy = 286 + Math.floor(i / 12) * 10;
        if (cy > 346 || cx > 1200) continue;
        if (cy < 306 && cx < 1014 - (306 - cy) * 1.2) continue;
        if (cy < 296 && cx > 1190) continue;
        poly([[X(cx), Y(cy)], [X(cx + 10), Y(cy - 2)], [X(cx + 10), Y(cy + 3)], [X(cx), Y(cy + 5)]],
             i % 2 ? C.scarfDark : T(C.scarf, 0.75), ' opacity="0.8"');
    }
    poly([[X(966), Y(322)], [X(1010), Y(288)], [X(1020), Y(298)], [X(978), Y(330)]], T(C.scarf, 1.25));

    // ---- senapan hero ----
    // Popor bertumpu di bahu, tangan kiri menahan handguard, tangan kanan di grip.
    // Semua titik pegangan diturunkan dari transform senapan (RL) supaya tangan,
    // popor dan kilatan tidak bisa meleset dari senjatanya.
    const rot = -6.3, rr = rot * Math.PI / 180, rc = Math.cos(rr), rs = Math.sin(rr);
    const rx0 = 887, ry0 = 265;   // popor mendarat di (992,266) = pojok atas bahu
    put(`<g filter="url(#cast)">`);   // seluruh rakitan senjata dapat bayangan jatuh
    const RL = (lx, ly) => [rx0 + lx * rc - ly * rs, ry0 + lx * rs + ly * rc];
    const DP = (q) => [X(q[0]), Y(q[1])];
    const HAND_F = RL(-96, -2);     // tangan kiri: handguard
    const HAND_R = RL(26, 16);      // tangan kanan: pistol grip / pemicu
    const sleeve = (v) => T(C.olive, v * 0.6, 0.05);
    // tabung lengan + garis terang di sisi atas
    const arm = (q0, q1, w, base, lift) => {
        const dx = q1[0] - q0[0], dy = q1[1] - q0[1], L = Math.hypot(dx, dy) || 1;
        const px = -dy / L * w, py = dx / L * w;
        poly([[q0[0] + px, q0[1] + py], [q0[0] - px, q0[1] - py],
              [q1[0] - px, q1[1] - py], [q1[0] + px, q1[1] + py]].map(DP), sleeve(base));
        poly([[q0[0] + px, q0[1] + py], [q0[0] + px * 0.3, q0[1] + py * 0.3],
              [q1[0] + px * 0.3, q1[1] + py * 0.3], [q1[0] + px, q1[1] + py]].map(DP), sleeve(lift));
    };
    const glove = (q, w, hh, v) => poly([[q[0] - w, q[1] - hh * 0.2], [q[0] + w * 0.5, q[1] - hh],
                                         [q[0] + w, q[1] + hh * 0.4], [q[0] - w * 0.4, q[1] + hh]].map(DP), T(C.steel, v));

    // lengan penopang (kiri) — siku turun, lengan bawah naik ke handguard
    arm([1032, 288], [908, 314], 7.5, 0.7, 1.0);
    arm([908, 314], HAND_F, 6.4, 0.82, 1.15);

    put(`<g transform="translate(${f(X(rx0))},${f(Y(ry0))}) rotate(${rot}) scale(${f(U)})">`);
    const g2 = (v) => T(C.steel, v * 1.25);
    poly([[-40, -6], [56, -6], [56, 6], [-40, 6]], g2(1.0));                                  // receiver
    poly([[-40, -6], [56, -6], [56, -1.6], [-40, -1.6]], T(C.tan, 1.15), ' opacity="0.85"');
    poly([[-128, -7], [-36, -7], [-36, 3], [-128, 3]], g2(0.86));                             // handguard
    poly([[-128, -7], [-36, -7], [-36, -3.4], [-128, -3.4]], T(C.tan, 1.05), ' opacity="0.8"');
    poly([[-152, -9], [-124, -9], [-124, 5], [-152, 5]], g2(1.2));                            // muzzle brake
    poly([[-26, 6], [0, 6], [-4, 30], [-22, 30]], g2(0.72));                                   // magasin
    poly([[18, 6], [36, 6], [32, 30], [20, 30]], g2(0.82));                                    // pistol grip
    poly([[8, 4], [18, 4], [16, 14], [8, 14]], g2(0.6));                                      // pelindung pemicu
    poly([[-6, -18], [46, -18], [46, -7], [-6, -7]], g2(1.15));                               // optic
    poly([[10, -27], [28, -27], [28, -18], [10, -18]], g2(0.95));
    poly([[56, -2], [92, 2], [104, 6], [104, 24], [90, 22], [56, 14]], g2(0.68));             // popor
    poly([[100, 4], [106, 5], [106, 25], [98, 23]], g2(1.15));                                // buttplate
    poly([[-70, -14], [-36, -14], [-36, -7], [-70, -7]], g2(1.1));                            // rail atas
    ge();

    // lengan pemicu (kanan) — di DEPAN senapan, sisi terdekat kamera
    arm([1058, 280], [988, 308], 8, 0.9, 1.25);
    arm([988, 308], HAND_R, 6.6, 1.05, 1.4);
    glove(HAND_F, 9, 7.5, 0.95);
    glove(HAND_R, 8.5, 7.5, 1.05);
    ge();   // tutup grup bayangan

    // kilatan moncong, diambil dari ujung laras
    const MZ = RL(-158, -2);
    put(`<circle cx="${f(X(MZ[0]))}" cy="${f(Y(MZ[1]))}" r="${f(42 * U)}" fill="url(#hotGlow)"/>`);
    for (let i = 0; i < 6; i++) {
        const ang = i * 1.047 + 0.3, ln = (i % 2 ? 9 : 22);
        poly([[X(MZ[0]), Y(MZ[1])], [X(MZ[0] + Math.cos(ang) * ln), Y(MZ[1] + Math.sin(ang) * ln)],
              [X(MZ[0] + Math.cos(ang + 0.6) * ln * 0.4), Y(MZ[1] + Math.sin(ang + 0.6) * ln * 0.4)]], '#ffe9bd', ' opacity="0.95"');
    }


    // ---- helm berfacet ----
    const hx = 1088, hy = 176, rx = 104, ry = 86;
    const HP = (u, v) => [X(hx + u * rx), Y(hy + v * ry)];
    const hm = (v, w = 0) => T(C.olive, v, w);
    // nape/leher: menyambungkan helm ke syal
    poly([HP(-0.50, 0.70), HP(0.42, 0.66), HP(0.50, 1.34), HP(-0.58, 1.36)], hm(0.42));
    // siluet: sisi lurus panjang, tidak simetris
    const A = HP(-1.00, 0.02), B = HP(-0.86, -0.48), Cc = HP(-0.42, -0.86), D = HP(0.18, -0.98),
        E = HP(0.72, -0.72), F = HP(1.00, -0.20), G = HP(0.96, 0.36), Hh = HP(0.60, 0.78),
        I = HP(-0.18, 0.92), J = HP(-0.78, 0.66);
    poly([A, B, Cc, D, E, F, G, Hh, I, J], hm(0.6));
    // titik dalam untuk pemecah facet
    const p1 = HP(-0.72, 0.10), p2 = HP(-0.30, -0.22), p3 = HP(0.40, -0.30),
        p4 = HP(0.52, 0.20), p5 = HP(0.10, 0.48), p6 = HP(-0.52, 0.42);
    poly([A, B, Cc, p2, p1], hm(1.45, 0.3));       // satu-satunya bidang kena api
    poly([Cc, D, E, p3, p2], hm(1.02, 0.06));
    poly([E, F, G, p4, p3], hm(0.58));
    poly([p1, p2, p3, p4, p5, p6], hm(0.84, 0.03));
    poly([p4, G, Hh, p5], hm(0.44));
    poly([p6, p5, Hh, I, J], hm(0.66, 0.02));
    // brim: pita sempit di tepi bawah, memisahkan kubah dari wajah
    poly([J, I, Hh, HP(0.58, 0.60), HP(-0.14, 0.72), HP(-0.74, 0.50)], hm(1.28, 0.12));
    // rim light tepi kiri
    poly([A, B, HP(-0.80, -0.46), HP(-0.92, 0.02)], T(C.amber, 0.72), ' opacity="0.5"');
    // ear cup + rail atas
    poly([HP(-0.88, 0.06), HP(-0.54, -0.06), HP(-0.44, 0.46), HP(-0.82, 0.58)], dk(1.15));
    poly([HP(-0.82, 0.14), HP(-0.58, 0.04), HP(-0.50, 0.38), HP(-0.76, 0.48)], dk(0.7));
    poly([HP(-0.46, -0.62), HP(0.30, -0.70), HP(0.32, -0.52), HP(-0.44, -0.44)], dk(0.85));
    // patch bendera MERAH di atas PUTIH, menempel pada bidang depan-kiri
    const q0 = HP(-0.74, -0.30), q1 = HP(-0.40, -0.40), q2 = HP(-0.38, -0.06), q3 = HP(-0.72, 0.04);
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
    poly([q0, q1, q2, q3], hm(0.5));
    poly([q0, q1, mid(q1, q2), mid(q0, q3)], C.red);
    poly([mid(q0, q3), mid(q1, q2), q2, q3], C.white);
    // rumah goggle: kotak gelap besar di depan-kiri
    poly([HP(-1.10, 0.06), HP(-0.62, -0.10), HP(-0.58, 0.30), HP(-1.06, 0.44)], T(C.dark, 1.35));
    poly([HP(-1.10, 0.06), HP(-0.62, -0.10), HP(-0.62, -0.02), HP(-1.10, 0.14)], T(C.olive, 0.9), ' opacity="0.7"');
    poly([HP(-1.02, 0.12), HP(-0.70, 0.01), HP(-0.68, 0.22), HP(-1.0, 0.34)], T(C.dark, 2.2), ' opacity="0.8"');
    // masker kain + rahang
    poly([HP(-1.06, 0.44), HP(-0.58, 0.30), HP(-0.50, 0.72), HP(-0.74, 0.96), HP(-0.98, 0.84)], dk(0.68));
    poly([HP(-1.06, 0.44), HP(-0.58, 0.30), HP(-0.56, 0.44), HP(-1.04, 0.58)], dk(0.95));
    poly([HP(-0.74, 0.96), HP(-0.50, 0.72), HP(-0.30, 0.92), HP(-0.52, 1.12)], dk(0.5));
})();

(function cornerRubble() {
    box3(66, GY + 100, 46, 17, 16, C.ground, 0.55);
    box3(122, GY + 96, 30, 11, 11, C.steel, 0.4);
    box3(872, GY + 104, 52, 15, 17, C.ground, 0.1);
    box3(300, GY + 102, 40, 13, 14, C.ground, 0.2);
})();

// ============================================================
// 10. BINGKAI — batu kiri, tiang kanan
// ============================================================
(function frame() {
    poly([[-20, 90], [26, 118], [16, 168], [44, 196], [30, 246], [58, 280], [26, 350], [-20, 350]].map(([x, y]) => [X(x), Y(y)]), T(C.ground, 0.5));
    poly([[X(-20), Y(90)], [X(26), Y(118)], [X(16), Y(168)], [X(-20), Y(180)]], T(C.ground, 0.72));
    poly([[X(16), Y(168)], [X(44), Y(196)], [X(30), Y(246)], [X(-4), Y(230)]], T(C.ground, 0.62));
    poly([[X(30), Y(246)], [X(58), Y(280)], [X(26), Y(350)], [X(-6), Y(330)]], T(C.ground, 0.42));
    poly([[X(1206), Y(120)], [X(1222), Y(118)], [X(1228), Y(350)], [X(1210), Y(350)]], T(C.steel, 0.62));
    poly([[X(1206), Y(120)], [X(1214), Y(119)], [X(1218), Y(350)], [X(1210), Y(350)]], T(C.steel, 0.95));
})();

// ============================================================
// 11. VIGNETTE
// ============================================================
put(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vy)"/>`);
put(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vx)"/>`);

// ============================================================
// 12. JUDUL
// ============================================================
const GLYPH = {
    D: { w: 100, d: 'M0,0 L72,0 L100,28 L100,112 L72,140 L0,140 Z M26,26 L64,26 L74,38 L74,102 L64,114 L26,114 Z' },
    E: { w: 100, d: 'M0,0 L100,0 L100,26 L26,26 L26,56 L88,56 L88,82 L26,82 L26,114 L100,114 L100,140 L0,140 Z' },
    C: { w: 100, d: 'M28,0 L100,0 L100,26 L40,26 L26,40 L26,100 L40,114 L100,114 L100,140 L28,140 L0,112 L0,28 Z' },
    O: { w: 100, d: 'M28,0 L72,0 L100,28 L100,112 L72,140 L28,140 L0,112 L0,28 Z M38,26 L62,26 L74,38 L74,102 L62,114 L38,114 L26,102 L26,38 Z' },
    M: { w: 112, d: 'M0,0 L28,0 L56,52 L84,0 L112,0 L112,140 L86,140 L86,56 L68,92 L44,92 L26,56 L26,140 L0,140 Z' },
    I: { w: 30, d: 'M0,0 L30,0 L30,140 L0,140 Z' },
    S: { w: 100, d: 'M100,0 L100,26 L26,26 L26,56 L100,56 L100,140 L0,140 L0,114 L74,114 L74,82 L0,82 L0,0 Z' },
    N: { w: 100, d: 'M0,0 L26,0 L74,84 L74,0 L100,0 L100,140 L74,140 L26,56 L26,140 L0,140 Z' },
    A: { w: 100, d: 'M42,0 L58,0 L100,140 L74,140 L66,112 L34,112 L26,140 L0,140 Z M50,42 L60,88 L40,88 Z' },
    Y: { w: 100, d: 'M0,0 L28,0 L50,54 L72,0 L100,0 L63,88 L63,140 L37,140 L37,88 Z' },
};
function word(str, x, y, scale) {
    let cur = 0;
    const parts = [];
    for (const ch of str) { const gl = GLYPH[ch]; parts.push([gl.d, cur]); cur += gl.w + 12; }
    return {
        emit: (fill, dx = 0, dy = 0, extra = '') => {
            put(`<g transform="translate(${f(X(x) + dx)},${f(y + dy)}) scale(${f(scale * U)})"${extra}>`);
            for (const [d, ox] of parts) put(`<path d="${d}" transform="translate(${ox},0)" fill="${fill}" fill-rule="evenodd"/>`);
            ge();
        },
    };
}
(function title() {
    const scale = 0.42;
    const x = 42, y1 = 22 * U, y2 = y1 + 152 * scale * U;
    const l1 = word('DECOMMISSION', x, y1, scale);
    const l2 = word('DAY', x, y2, scale);
    put(`<mask id="distress"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
    for (let i = 0; i < 46; i++) {
        const dx = X(x + hr(i * 3 + 700, -6, 530));
        const dy = y1 + hr(i * 3 + 701, -4, 128) * U;
        const dw = hr(i * 3 + 702, 1.2, 9) * U, dh = hr(i + 740, 1.6, 11) * U;
        put(`<rect x="${f(dx)}" y="${f(dy)}" width="${f(dw)}" height="${f(dh)}" fill="#000" transform="rotate(${f(hr(i + 760, -16, 16))} ${f(dx)} ${f(dy)})"/>`);
    }
    put('</mask>');
    l1.emit('#000', 5 * U, 6 * U, ' opacity="0.6" filter="url(#soft)"');
    l2.emit('#000', 5 * U, 6 * U, ' opacity="0.6" filter="url(#soft)"');
    put('<g mask="url(#distress)">');
    l1.emit('url(#titleFill)');
    l2.emit('url(#titleFill)');
    ge();
})();

put('</svg>');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out.join('\n'));
console.log(`OK ${OUT}  ${W}x${H}  ${out.length} nodes`);
