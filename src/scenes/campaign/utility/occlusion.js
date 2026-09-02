// FADE OCCLUDER BERSAMA — satu sistem untuk SELURUH campaign (2026-08-13,
// permintaan user: "pastikan jika ada object yang menghalangi player ATAU robot,
// object itu jadi transparan ... transparannya 20%").
//
// Sebelumnya ada TIGA salinan berbeda: stage 4 (uji garis pandang kamera->entitas,
// fade 0.45), stage 11 dan stage 13 (sekadar uji JARAK ke player, fade 0.18/0.42,
// robot tidak dihitung sama sekali). Stage 5-10 & 12 tidak punya apa-apa, jadi
// truk/peti kemas/rak/gedung menelan player begitu ia berdiri di sisi kamera.
// Modul ini menggantikan ketiganya: SATU uji, SATU nilai opasitas (`CFG.campaign
// .occlusion.opacity`), dipakai stage 1-13.
//
// KENAPA UJI GARIS PANDANG, BUKAN JARAK: kamera memandang miring dari BARAT DAYA,
// jadi yang menutupi player hanyalah objek di SISI KAMERA (barat daya) dari player
// dan cukup tinggi untuk memotong garis pandang di titik itu. Uji jarak lingkaran
// memudarkan objek yang sebenarnya di belakang player (tak menghalangi apa pun)
// dan melewatkan objek tinggi yang jauh tapi tepat menutupi.
//
// AMBANGNYA "SETENGAH BADAN" (2026-08-14, permintaan user "object apapun yang
// menghalangi akan menjadi transparan jika minimal menutupi setengah badan
// character"). Bukan lagi "kira-kira menghalangi": kemiringan garis pandang =
// CAM_OFF.y / |CAM_OFF.xz| (default 116/100 = 1.16 unit naik per unit mendekat ke
// kamera, diambil dari `camOffsetActive()` supaya stage ber-`camOffset` sendiri
// ikut sudutnya), sinar entitas->kamera diuji vs TAPAK KOTAK prop (uji slab 2-D),
// dan tinggi badan yang tersembunyi di posisi entitas =
//     cover = (top - kakiEntitas) - slope * jarakKeTitikMasukSinar
// Prop memudar hanya bila `cover >= bodyHeight * coverFraction` (0.5). Benda yang
// cuma menutupi kaki TETAP PEKAT.
//
// BIAYA: occluder di-INDEKS ke grid seragam sekali saat dunia dibangun, lalu tiap
// frame hanya sel-sel di KORIDOR entitas->kamera yang disapu (stage 7 punya 240
// kendaraan + ratusan robot — sapuan penuh n*m akan mahal). Panjang koridor juga
// dipotong dari occluder TERTINGGI di stage itu: kalau tak ada yang lebih tinggi
// dari 20 unit, tak ada gunanya menyapu lebih jauh dari ~20 unit.
//
// MATERIAL: `registerOccluder` MENG-KLON material objeknya (sekali, saat dunia
// dibangun) supaya memudarkan satu prop tidak ikut memudarkan seluruh batch yang
// kebetulan berbagi material. Klon dibuat SEBELUM layar loading selesai, jadi
// aturan "tak ada rekompilasi shader saat main" tetap utuh: `transparent` dan
// `opacity` bukan bagian dari kunci program shader r128.

import { CFG } from '../../../core/config.js';
import { robots } from '../../../core/state.js';
import { camera, camOffsetActive, SCREEN_UP } from '../../../core/renderer.js';
import { mergeObjectInPlace } from '../../../utils/meshBatch.js';

// key stage -> { list, grid, cell, maxTop, stamp, built }
const sets = new Map();

const cfg = () => (CFG && CFG.campaign && CFG.campaign.occlusion) || {};
// Opasitas target satu-satunya (dibaca juga oleh uji asap — jangan hardcode 0.2).
export const occlusionOpacity = () => {
    const v = cfg().opacity;
    return v == null ? 0.2 : v;
};

function setFor(key) {
    let s = sets.get(key);
    if (!s) {
        s = { list: [], dyn: [], grid: new Map(), cell: 0, maxTop: 0, maxRadius: 0,
            stamp: 0, hold: false };
        sets.set(key, s);
    }
    return s;
}

// Kumpulkan material unik objek lalu GANTI dengan klon milik objek ini sendiri.
function takeMaterials(obj, clone) {
    const items = [], map = new Map();
    obj.traverse((m) => {
        if (!m.material) return;
        const arr = Array.isArray(m.material) ? m.material : null;
        const list = arr || [m.material];
        const next = [];
        for (const mat of list) {
            if (!mat) { next.push(mat); continue; }
            let use = map.get(mat);
            if (!use) {
                use = (clone && typeof mat.clone === 'function') ? mat.clone() : mat;
                map.set(mat, use);
                items.push({
                    mat: use,
                    baseOp: use.opacity == null ? 1 : use.opacity,
                    baseTr: !!use.transparent,
                });
            }
            next.push(use);
        }
        m.material = arr ? next : next[0];
    });
    return items;
}

// Ukur radius/top dari kotak batas objek bila pemanggil tak menyebutkannya.
function measure(obj) {
    let r = 0, top = 0, ok = false;
    if (typeof THREE !== 'undefined' && typeof THREE.Box3 === 'function') {
        try {
            const b = new THREE.Box3().setFromObject(obj);
            if (isFinite(b.min.x) && isFinite(b.max.x) && b.max.x >= b.min.x) {
                r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
                top = b.max.y; ok = true;
            }
        } catch (e) { ok = false; }
    }
    return ok ? { r, top } : null;
}

// Daftarkan satu prop sebagai occluder stage `key`.
//   obj    : Group/Mesh yang sudah di posisi akhirnya (material di-klon), atau
//            `null` bila pemudarannya diurus `opts.onFade` (sel dinding — lihat
//            utility/wallFade.js).
//   opts   : { x, z, hx, hz, radius, top, clone, dynamic, onFade }
//            `hx`/`hz` = setengah bentang kotak prop di sumbu dunia. Ia dipakai
//            DUA kali: untuk KEDALAMAN (muka terdekat prop ke arah kamera) dan
//            untuk LEBAR LAYAR-nya. `radius` saja = kotak persegi berukuran itu.
// Mengembalikan entri occluder (untuk debug/uji), atau null bila tak ada yang
// bisa dipudarkan.
export function registerOccluder(key, obj, opts = {}) {
    if (!obj && typeof opts.onFade !== 'function') return null;
    const s = setFor(key);
    const m = (obj && (opts.radius == null || opts.top == null) && opts.hx == null)
        ? measure(obj) : null;
    const px = opts.x != null ? opts.x : (obj && obj.position ? obj.position.x : 0);
    const pz = opts.z != null ? opts.z : (obj && obj.position ? obj.position.z : 0);
    const rad = opts.radius != null ? opts.radius : (m ? m.r : 8);
    const hx = opts.hx != null ? opts.hx : rad;
    const hz = opts.hz != null ? opts.hz : rad;
    const top = opts.top != null ? opts.top : (m ? m.top : 20);
    const o = {
        obj, x: px, z: pz, hx, hz,
        radius: Math.hypot(hx, hz),
        top,
        // `dynamic`: prop yang BERGERAK (crane pelabuhan, gerbong kereta). Posisinya
        // dibaca ulang tiap frame dan ia TIDAK masuk grid — jumlahnya sedikit, jadi
        // diuji langsung terhadap tiap entitas.
        dynamic: !!opts.dynamic,
        offX: opts.offX || 0, offZ: opts.offZ || 0,
        baseTop: top,
        f: 1, occ: false,
        onFade: typeof opts.onFade === 'function' ? opts.onFade : null,
        items: obj ? takeMaterials(obj, opts.clone !== false) : [],
    };
    if (!o.items.length && !o.onFade) return null;
    s.list.push(o);
    if (o.dynamic) s.dyn.push(o); else { s.grid.clear(); s.cell = 0; }
    return o;
}

// Jalur pendek untuk prop yang SEHARUSNYA masuk batch statis besar tapi harus
// bisa memudar sendiri: las geometri DI DALAM grup itu (`mergeObjectInPlace` —
// transform & instans material tetap miliknya), pasang ke `parent`, daftarkan.
// Harganya beberapa draw call per prop, bukan puluhan.
export function weldOccluder(key, parent, obj, opts = {}) {
    const node = mergeObjectInPlace(obj);
    parent.add(node);
    registerOccluder(key, node, opts);
    return node;
}

// Bangun indeks grid (sekali; dipanggil otomatis dari update pertama).
function buildIndex(s) {
    const cell = Math.max(16, cfg().gridCell || 48);
    s.cell = cell; s.grid.clear(); s.maxTop = 0; s.maxRadius = 0;
    for (let i = 0; i < s.list.length; i++) {
        const o = s.list[i];
        if (o.top > s.maxTop) s.maxTop = o.top;
        if (o.radius > s.maxRadius) s.maxRadius = o.radius;
        if (o.dynamic) continue;
        const c0 = Math.floor((o.x - o.radius) / cell), c1 = Math.floor((o.x + o.radius) / cell);
        const r0 = Math.floor((o.z - o.radius) / cell), r1 = Math.floor((o.z + o.radius) / cell);
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
            const k = c + ':' + r;
            let b = s.grid.get(k);
            if (!b) { b = []; s.grid.set(k, b); }
            b.push(o);
        }
    }
}

// Terapkan faktor fade `f`: lewat material sendiri, atau lewat `onFade` (sel
// dinding, yang ditukar dengan proxy — lihat utility/wallFade.js).
function apply(o) {
    if (o.onFade) { o.onFade(o.f, o); return; }
    const faded = o.f < 0.995;
    for (const it of o.items) {
        it.mat.opacity = it.baseOp * o.f;
        it.mat.transparent = it.baseTr || faded;
    }
}

// SEBERAPA BANYAK badan entitas yang ditutupi occluder ini?
// Garis pandang menyerempet TEPI ATAS-TERDEKAT prop lalu turun `slope` per unit,
// jadi tinggi yang tersembunyi di posisi entitas = top - slope * (jarak ke titik
// MASUK sinar entitas->kamera ke tapak prop).
//
// Titik masuk itu dihitung dengan uji slab 2-D (sinar vs kotak sejajar sumbu),
// BUKAN "jarak ke pusat dikurangi setengah bentang". Bedanya menentukan sejak
// ambangnya diperketat jadi "setengah badan": (a) mobil panjang menutupi dari
// muka BELAKANGNYA, bukan dari pusatnya; (b) bangunan besar berongga (cangkang
// gudang Stage 10, bentang 180 unit) TIDAK boleh dianggap menutupi player yang
// berdiri 100 unit di sampingnya hanya karena masih di dalam radiusnya — sinarnya
// memang tak pernah menembus tapak itu. Kotak dilebarkan `pad` supaya prop yang
// menutupi sebagian besar siluet (bukan tepat titik pusatnya) tetap terhitung.
function coverOf(o, ex, ey, ez, ux, uz, L, slope, pad) {
    const dx = o.x - ex, dz = o.z - ez;
    const hx = o.hx + pad, hz = o.hz + pad;
    const EPS = 1e-6;
    let tmin = 0, tmax = L;
    if (Math.abs(ux) < EPS) {
        if (Math.abs(dx) > hx) return -1;
    } else {
        const a = (dx - hx) / ux, b = (dx + hx) / ux;
        tmin = Math.max(tmin, Math.min(a, b));
        tmax = Math.min(tmax, Math.max(a, b));
    }
    if (Math.abs(uz) < EPS) {
        if (Math.abs(dz) > hz) return -1;
    } else {
        const a = (dz - hz) / uz, b = (dz + hz) / uz;
        tmin = Math.max(tmin, Math.min(a, b));
        tmax = Math.min(tmax, Math.max(a, b));
    }
    if (tmin > tmax) return -1;
    return (o.top - ey) - slope * Math.max(0, tmin);
}

// Sapu koridor entitas -> kamera dan tandai occluder yang menutupi >= `need`.
function sweepEntity(s, ex, ey, ez, G, need, stamp) {
    const { ux, uz, vx, vz, L, slope, pad } = G;
    const reach = Math.min(L, (s.maxTop - ey - need) / slope + s.maxRadius);
    if (!(reach > 0)) return;
    const cell = s.cell, step = cell * 0.5;
    for (let a = 0; a <= reach + step; a += step) {
        const t = Math.min(a, reach);
        const sx = ex + ux * t, sz = ez + uz * t;
        // Tiga sel melintang supaya occluder lebar di tepi koridor ikut terjaring.
        for (let k = -1; k <= 1; k++) {
            const qx = sx + vx * k * cell, qz = sz + vz * k * cell;
            const bucket = s.grid.get(Math.floor(qx / cell) + ':' + Math.floor(qz / cell));
            if (!bucket) continue;
            for (const o of bucket) {
                if (o.occ || o.stamp === stamp) continue;
                o.stamp = stamp;
                if (coverOf(o, ex, ey, ez, ux, uz, L, slope, pad) >= need) o.occ = true;
            }
        }
        if (t >= reach) break;
    }
}

// Occluder BERGERAK diuji langsung (tak lewat grid) — jumlahnya sedikit.
function testDynamic(s, ex, ey, ez, G, need) {
    const { ux, uz, L, slope, pad } = G;
    for (const o of s.dyn) {
        if (o.occ) continue;
        if (coverOf(o, ex, ey, ez, ux, uz, L, slope, pad) >= need) o.occ = true;
    }
}

// Perbarui seluruh occluder stage `key`. Panggil SEKALI per frame dari
// `updateMode` stage (setelah posisi player/robot final).
// TAHAN PEKAT (2026-09-02, laporan user "komputer transparan selama cutscene"):
// selama sebuah cutscene, prop yang dibingkai kamera HARUS solid — sistem fade
// ini ada untuk menjaga PEMAIN tetap terlihat saat bermain, bukan untuk shot
// sinematik yang subjeknya justru prop itu sendiri. Ditahan = seluruh occluder
// stage dikembalikan ke opak SEKETIKA (potongan keras, bukan fade masuk) dan
// `updateStageOccluders` tidak menyapu apa pun sampai tahanan dilepas.
export function setStageOccludersHold(key, on) {
    const s = sets.get(key);
    if (!s) return false;
    s.hold = !!on;
    if (s.hold) for (const o of s.list) {
        o.occ = false; if (o.f !== 1) { o.f = 1; apply(o); }
    }
    return s.hold;
}

export function updateStageOccluders(key, dt) {
    const s = sets.get(key);
    if (!s || !s.list.length || s.hold) return;
    if (!s.cell) buildIndex(s);
    const C = cfg();
    const target = occlusionOpacity();
    const rate = C.fadeRate == null ? 9 : C.fadeRate;
    const range = C.robotRange == null ? 320 : C.robotRange;
    const pad = C.lateralPad == null ? 3 : C.lateralPad;
    // TINGGI BADAN karakter: satu-satunya sumbernya `CFG.player.eyeHeight`
    // (mata ada tepat di bawah puncak kepala), kecuali kalau di-override.
    const body = C.bodyHeight > 0 ? C.bodyHeight
        : ((CFG && CFG.player && CFG.player.eyeHeight) || 11.4);
    const eyeH = (CFG && CFG.player && CFG.player.eyeHeight) || 11.4;
    // Ambang "menutupi SETENGAH badan" (2026-08-14, permintaan user). Sebuah
    // benda baru memudar kalau tinggi yang disembunyikannya di posisi entitas
    // >= `coverFraction` x tinggi badan; benda yang cuma menutupi kaki tetap
    // pekat.
    const frac = C.coverFraction == null ? 0.5 : C.coverFraction;
    const need = body * frac;

    const off = camOffsetActive();
    const L = Math.hypot(off.x, off.z) || 1;
    const slope = off.y / L;
    // Arah ke kamera = kebalikan arah pandang layar (SCREEN_UP diturunkan dari
    // CAM_OFF yang sama, jadi keduanya tak pernah bisa berbeda azimuth).
    const ux = -SCREEN_UP.x, uz = -SCREEN_UP.z;
    const vx = SCREEN_UP.z, vz = -SCREEN_UP.x;
    const G = { ux, uz, vx, vz, L, slope, pad };

    for (const o of s.list) o.occ = false;
    for (const o of s.dyn) {
        if (o.obj && o.obj.position) {
            o.x = o.obj.position.x + o.offX; o.z = o.obj.position.z + o.offZ;
            // Prop yang diangkat (peti kemas di spreader crane) ikut naik puncaknya.
            o.top = o.baseTop + Math.max(0, o.obj.position.y);
        }
    }
    const stamp = ++s.stamp;
    const px = camera.position.x, pz = camera.position.z;
    // Pivot player = titik MATA; yang dibandingkan adalah tinggi di atas KAKI.
    const py = camera.position.y - eyeH;
    sweepEntity(s, px, py, pz, G, need, stamp);
    testDynamic(s, px, py, pz, G, need);
    for (const z of robots) {
        if (!z.mesh) continue;
        const rx = z.mesh.position.x, rz = z.mesh.position.z;
        if (Math.abs(rx - px) > range || Math.abs(rz - pz) > range) continue;
        // Robot besar butuh penutup lebih tinggi: ambangnya ikut skalanya.
        const rNeed = need * (z.mesh.scale && z.mesh.scale.y ? z.mesh.scale.y : 1);
        sweepEntity(s, rx, z.mesh.position.y, rz, G, rNeed, ++s.stamp);
        testDynamic(s, rx, z.mesh.position.y, rz, G, rNeed);
    }

    const k = Math.min(1, Math.max(0, dt) * rate);
    for (const o of s.list) {
        const want = o.occ ? target : 1;
        if (o.f !== want) {
            o.f += (want - o.f) * k;
            if (Math.abs(o.f - want) < 0.004) o.f = want;
            apply(o);
        }
    }
}

// Kembalikan seluruh occluder stage ke opak (dipanggil dari `enter()`/reset stage).
export function resetStageOccluders(key) {
    const s = sets.get(key);
    if (!s) return;
    s.hold = false;
    for (const o of s.list) { o.f = 1; o.occ = false; apply(o); }
}

// Buang seluruh occluder stage (dunia dibangun ulang).
export function clearStageOccluders(key) {
    const s = sets.get(key);
    if (!s) return;
    s.list.length = 0; s.dyn.length = 0; s.grid.clear(); s.cell = 0; s.maxTop = 0;
}

// Debug/uji asap: jumlah, fade terkecil, dan titik-titiknya.
export function occlusionDebug(key) {
    const s = sets.get(key);
    if (!s) return { count: 0, faded: 0, minFactor: 1, opacity: occlusionOpacity(), points: [] };
    let min = 1, faded = 0;
    for (const o of s.list) { if (o.f < min) min = o.f; if (o.f < 0.995) faded++; }
    return {
        count: s.list.length, faded, minFactor: min, opacity: occlusionOpacity(),
        hold: !!s.hold, maxTop: s.maxTop, cell: s.cell,
        points: s.list.map(o => ({ x: o.x, z: o.z, radius: o.radius,
            hx: o.hx, hz: o.hz, top: o.top, factor: o.f, wall: !!o.onFade })),
    };
}

// Daftar kunci stage yang punya occluder (uji asap menyapu stage 1-13).
export const occlusionKeys = () => [...sets.keys()];
