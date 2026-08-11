// BANGUNAN YANG BISA DIHANCURKAN (2026-07-28, permintaan user: "ketika tank
// masuk, tank itu kan menabrak sebuah bangunan. buat agar bangunan itu hancur
// ketika ditabrak oleh tank agar lebih dramatis. karena sekarang tank hanya
// berjalan melewatinya").
//
// Dipakai SATU kali: sebuah RUKO dua lantai yang berdiri TEPAT di lintasan masuk
// tank pada cutscene tank-boss Stage 4 (posisi `S4_SMASH` di stage4/index.js; lintasan
// tank di tankBossIntro.js DITURUNKAN dari titik itu supaya tabrakannya selalu
// tepat di tengah, bukan hasil kebetulan). Sebelum ini tank melewati begitu saja
// gedung latar instanced yang kebetulan berdiri di jalurnya.
//
// CARA KERJA — TIDAK ADA fisika baru & TIDAK ADA material/pool baru:
//   * bangunan = SATU Group berisi ~20 balok Lambert biasa yang dibangun bersama
//     dunia stage 4 (jadi shader-nya ikut ter-warmup; tak ada recompile saat
//     hancur — aturan "no mid-game shader recompile" tetap utuh),
//   * `smashBuilding()` mengubah tiap balok itu menjadi PUING: tiap balok diberi
//     kecepatan + kecepatan sudut, lalu `updateSmashBuilding(dt)` mengintegrasi-
//     kannya (gravitasi + pantulan teredam) sampai mendarat dan MENETAP sebagai
//     reruntuhan. Balok yang sama, hanya berpindah — nol alokasi mesh baru,
//   * balok yang berada DI ATAS titik tumbukan tidak dilempar mendatar melainkan
//     AMBRUK ke bawah (lantai atas & atap "pancake"), sementara balok di sekitar
//     titik tumbukan terlempar searah laju tank -> terbaca sebagai DITEROBOS,
//     bukan sekadar meledak,
//   * debu memakai pool ground-puff yang sudah ada; serpihan memakai pool gib.
//
// Bangunan ini MURNI DEKOR: TIDAK masuk `blockers` maupun nav-grid (ia berdiri di
// luar area boleh-jalan), jadi menghancurkannya tak pernah bisa mengubah kolisi
// atau pathing. Ia juga SENGAJA tidak ikut `addMergedStatic` — bagian-bagiannya
// bergerak, dan batching akan melasnya jadi satu mesh (lihat aturan batching di
// CLAUDE.md).

import { scene } from '../core/renderer.js';
import { PAL } from '../world/palette.js';
import { spawnGroundPuff } from './effects.js';
import { spawnGibs } from './gore.js';
import { playSFX, sfxExplode } from '../utils/sfx.js';
import { rand } from '../utils/math.js';

const GRAV = 150;          // percepatan jatuh puing (unit/dtk²; skala dunia 1 m ≈ 7 unit)
const REST_EPS = 26;       // |vy| di bawah ini saat menyentuh tanah -> puing MENETAP
const DUST_SEC = 0.9;      // lama kepulan debu menyusul setelah runtuh
// Warna puing = beton berdebu (bukan hijau coolant — hanya robot yang punya itu).
const RUBBLE = 0x8a8378;

// Material DIBAGI & dibuat MALAS (pola sama dgn mortarShell di tank.js): satu
// program shader untuk semua bangunan, tak pernah di-dispose di tengah permainan.
let MAT = null;
function mats() {
    if (!MAT) {
        MAT = {
            wall: new THREE.MeshLambertMaterial({ color: 0x8a7f6a }),        // dinding plester hangat
            trim: new THREE.MeshLambertMaterial({ color: PAL.concrete }),    // kolom/slab beton
            roof: new THREE.MeshLambertMaterial({ color: 0x54585e }),        // atap seng/dak
            dark: new THREE.MeshBasicMaterial({ color: 0x17181c }),          // rongga rolling-door (sudah dipanaskan)
            glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg }),   // kaca jendela lantai 2
            sign: new THREE.MeshLambertMaterial({ color: PAL.amber }),       // papan nama (aksen manusia)
            steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),      // tandon air/AC atap
        };
    }
    return MAT;
}

// ===== Bangun mesh RUKO dua lantai (muka ber-rolling-door menghadap +Z).
// Ukuran default sengaja "sedikit lebih besar dari tank" supaya siluet tank yang
// menerobos lantai dasarnya terbaca jelas dari kamera cutscene. Mengembalikan
// `{group, parts}` — `parts` menyimpan ukuran tiap balok (dipakai puing untuk
// menghitung tinggi istirahatnya) + transform aslinya (dipakai reset). =====
export function buildSmashRukoMesh(W = 66, D = 44, H = 34) {
    const M = mats();
    const group = new THREE.Group();
    const parts = [];
    const hw = W / 2, hd = D / 2;
    // add(w,h,d, x,y,z, mat, noShadow) — semua koordinat LOKAL terhadap group.
    const add = (w, h, d, x, y, z, mat, noShadow) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (!noShadow) { m.castShadow = true; m.receiveShadow = true; }
        group.add(m);
        parts.push({ mesh: m, w, h, d, ox: x, oy: y, oz: z });
        return m;
    };

    const G = 15;          // tinggi lantai dasar
    const SLAB = 3;        // tebal slab lantai/atap
    const U = H - G - SLAB;  // tinggi lantai dua

    // --- LANTAI DASAR: dua pilar muka + ambang, rongga rolling-door di antaranya
    add(16, G, 3, -hw + 8, G / 2, hd, M.wall);
    add(16, G, 3, hw - 8, G / 2, hd, M.wall);
    add(W, 4, 3, 0, G - 2, hd, M.trim);                       // ambang/lintel
    add(W - 34, G - 5, 1, 0, (G - 5) / 2, hd - 1.6, M.dark, true);   // rongga gelap (toko terbuka)
    add(3, G, D, -hw, G / 2, 0, M.wall);                      // dinding samping kiri
    add(3, G, D, hw, G / 2, 0, M.wall);                       // dinding samping kanan
    add(W, G, 3, 0, G / 2, -hd, M.wall);                      // dinding belakang (yang DITABRAK tank)
    add(5, G, 5, 0, G / 2, -6, M.trim);                       // kolom dalam

    // --- SLAB lantai dua + papan nama menggantung di muka
    add(W + 4, SLAB, D + 4, 0, G + SLAB / 2, 0, M.trim);
    add(W - 20, 7, 1.5, 0, G + 5, hd + 2.2, M.sign, true);

    // --- LANTAI DUA: dinding + tiga jendela
    const uy = G + SLAB + U / 2;
    add(W, U, 3, 0, uy, hd, M.wall);
    for (const wx of [-20, 0, 20]) add(14, 7, 0.8, wx, uy + 1, hd + 1.7, M.glass, true);
    add(3, U, D, -hw, uy, 0, M.wall);
    add(3, U, D, hw, uy, 0, M.wall);
    add(W, U, 3, 0, uy, -hd, M.wall);

    // --- ATAP: dak + parapet muka + tandon air (silhouette khas ruko)
    add(W + 6, SLAB, D + 6, 0, H + SLAB / 2, 0, M.roof);
    add(W + 6, 5, 2, 0, H + SLAB + 2.5, hd + 2, M.trim, true);
    add(11, 7, 11, hw - 14, H + SLAB + 3.5, -hd + 12, M.steel);

    return { group, parts };
}

// ===== Tempatkan bangunan di dunia (yaw opsional). Objeknya menyimpan puing +
// status runtuh; SATU instance saja yang dipakai (set-piece stage 4). =====
export function spawnSmashBuilding(x, z, yaw = 0, size) {
    const { group, parts } = size
        ? buildSmashRukoMesh(size.w, size.d, size.h)
        : buildSmashRukoMesh();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    return { group, parts, x, z, smashed: false, active: false, dustT: 0, t: 0 };
}

// ===== DIHANTAM: ubah tiap balok jadi puing. `(dirX, dirZ)` = arah laju penabrak
// (dinormalisasi di sini); titik masuknya dihitung sebagai sisi bangunan yang
// BERLAWANAN arah itu, jadi balok di dekat lubang tembus terlempar paling jauh. =
export function smashBuilding(b, dirX, dirZ) {
    if (!b || b.smashed) return false;
    b.smashed = true; b.active = true; b.dustT = DUST_SEC; b.t = 0;
    const dl = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / dl, dz = dirZ / dl;
    // Titik tumbukan (LOKAL): tepi bangunan di sisi datangnya penabrak, setinggi
    // badan tank. Dihitung dari kotak pembatas balok-baloknya sendiri.
    let ex = 0, ez = 0, ey = 0;
    for (const p of b.parts) {
        ex = Math.max(ex, Math.abs(p.ox) + p.w / 2);
        ez = Math.max(ez, Math.abs(p.oz) + p.d / 2);
        ey = Math.max(ey, p.oy + p.h / 2);
    }
    const hx = -dx * ex, hz = -dz * ez, hy = 9;
    for (const p of b.parts) {
        const rx = p.ox - hx, ry = p.oy - hy, rz = p.oz - hz;
        const d = Math.hypot(rx, rz);
        const kick = Math.max(0, 1 - d / (ex + ez));          // makin dekat lubang, makin terlempar
        const ol = d || 1;                                    // arah radial keluar dari titik tumbuk
        if (kick < 0.12 && p.oy < ey * 0.4) {
            // TUNGGUL: pilar muka di ujung terjauh dari lubang — terlalu jauh dari
            // tumbukan untuk ikut terlempar. Ia TETAP BERDIRI (miring sedikit) jadi
            // yang tersisa adalah reruntuhan bergerigi, bukan bangunan yang LENYAP.
            p.mesh.rotation.set(rand(-0.06, 0.06), 0, rand(-0.05, 0.05));
            p.rest = true;
            continue;
        }
        if (ry > 10) {
            // DI ATAS titik tumbukan: penyangganya lenyap -> AMBRUK ke bawah
            // (lantai dua & atap "pancake"), hanya sedikit terseret searah tank.
            p.vx = dx * (14 + 24 * kick) + rand(-9, 9);
            p.vy = -(6 + 26 * kick);
            p.vz = dz * (14 + 24 * kick) + rand(-9, 9);
        } else {
            // SEJAJAR titik tumbukan: DITEROBOS — terlempar searah laju tank +
            // menyembur radial keluar dari lubang. Lemparan sengaja CEPAT tapi
            // RENDAH (busur pendek): puing mendarat di kaki bangunan, tidak
            // sampai berhamburan ke dalam kompleks alun-alun.
            p.vx = dx * (18 + 44 * kick) + (rx / ol) * 22 * kick + rand(-10, 10);
            p.vy = 14 + 40 * kick + rand(0, 10);
            p.vz = dz * (18 + 44 * kick) + (rz / ol) * 22 * kick + rand(-10, 10);
        }
        p.wx = rand(-4.5, 4.5); p.wy = rand(-3, 3); p.wz = rand(-4.5, 4.5);
        p.rest = false;
    }
    // FX: dinding debu di kaki bangunan + serpihan beton terlempar searah tank.
    const wx = b.group.position.x, wz = b.group.position.z;
    for (let i = 0; i < 10; i++) {
        spawnGroundPuff(wx + rand(-ex, ex), wz + rand(-ez, ez),
            0xa89c88, 7 + Math.random() * 6, 2 + Math.random() * 14);
    }
    spawnGibs(wx - dx * ez, 14, wz - dz * ez, 14, dx, dz, 2.4, RUBBLE, 0.4, RUBBLE);
    playSFX(sfxExplode, 0.75);
    return true;
}

// ===== Integrasi puing per frame (dipanggil stage4.updateMode). Selesai =>
// `active` false dan fungsi ini jadi no-op (reruntuhan diam permanen). =====
export function updateSmashBuilding(b, dt) {
    if (!b || !b.active) return;
    b.t += dt;
    let moving = false;
    for (const p of b.parts) {
        if (p.rest) continue;
        p.vy -= GRAV * dt;
        const m = p.mesh;
        m.position.x += p.vx * dt;
        m.position.y += p.vy * dt;
        m.position.z += p.vz * dt;
        m.rotation.x += p.wx * dt; m.rotation.y += p.wy * dt; m.rotation.z += p.wz * dt;
        if (m.position.y <= 1.5 && p.vy < 0) {
            if (-p.vy < REST_EPS) settlePart(p);
            else {                                   // memantul sekali-dua, meredam cepat
                m.position.y = 1.5;
                p.vy = -p.vy * 0.26;
                p.vx *= 0.5; p.vz *= 0.5;
                p.wx *= 0.4; p.wy *= 0.4; p.wz *= 0.4;
                moving = true;
            }
        } else moving = true;
    }
    if (b.dustT > 0) {
        b.dustT -= dt;
        if (Math.random() < 0.5) spawnGroundPuff(
            b.group.position.x + rand(-40, 40), b.group.position.z + rand(-28, 28),
            0xa89c88, 5 + Math.random() * 5, 2 + Math.random() * 8);
    }
    if (!moving && b.dustT <= 0) b.active = false;
}

// Puing MENDARAT: rebahkan RATA — sisi TERTIPIS balok diputar menghadap ke atas
// (dinding roboh berbaring pada mukanya, bukan berdiri tegak separuh terbenam),
// lalu taruh tepat menapak tanah. Yaw hasil tumbling DIPERTAHANKAN supaya
// tumpukan puing tidak berbaris rapi searah; `order = 'YXZ'` membuat yaw itu
// diterapkan di ruang DUNIA sehingga sisi tertipis benar-benar jadi vertikal.
function settlePart(p) {
    const m = p.mesh;
    const ry = m.rotation.y;
    m.rotation.order = 'YXZ';
    let vert;
    if (p.h <= p.w && p.h <= p.d) { m.rotation.set(0, ry, 0); vert = p.h; }          // sudah pipih mendatar
    else if (p.d <= p.w) { m.rotation.set(Math.PI / 2, ry, 0); vert = p.d; }         // dinding depan/belakang -> rebah
    else { m.rotation.set(0, ry, Math.PI / 2); vert = p.w; }                          // dinding samping -> rebah
    m.position.y = vert / 2;
    p.rest = true;
}

// Kembalikan bangunan ke keadaan UTUH (dipanggil stage4.enter — restart/cheat).
export function resetSmashBuilding(b) {
    if (!b) return;
    for (const p of b.parts) {
        p.mesh.position.set(p.ox, p.oy, p.oz);
        p.mesh.rotation.order = 'XYZ';
        p.mesh.rotation.set(0, 0, 0);
        p.rest = false;
    }
    b.smashed = false; b.active = false; b.dustT = 0; b.t = 0;
}

export function disposeSmashBuilding(b) {
    if (!b) return;
    b.group.traverse(o => { if (o.isMesh && o.geometry && o.geometry.dispose) o.geometry.dispose(); });
    scene.remove(b.group);   // material DIBAGI (lihat mats()) -> jangan di-dispose
    b.parts = [];
}

// Debug/uji: status runtuh + berapa puing yang sudah mendarat.
export const smashBuildingDebug = (b) => b ? ({
    smashed: b.smashed, active: b.active, parts: b.parts.length,
    resting: b.parts.filter(p => p.rest).length,
    maxY: b.parts.reduce((m, p) => Math.max(m, p.mesh.position.y), 0),
    top: b.parts.reduce((m, p) => Math.max(m, p.oy + p.h / 2), 0),
    // Sebaran puing terjauh ke arah +Z (dunia) — dipakai assert untuk memastikan
    // reruntuhan tak berhamburan masuk ke kompleks alun-alun tempat duel.
    maxZ: b.parts.reduce((m, p) => Math.max(m, b.group.position.z + p.mesh.position.z), -Infinity),
}) : null;
