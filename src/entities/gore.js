// GORE (2026-07-11; re-tema COOLANT 2026-07-12): robot tidak lenyap seketika
// saat mati — ia TERJATUH (bangkai toppling lalu memudar), MUNCRAT cairan
// COOLANT hijau, dan ANGGOTA MESINNYA TERLEPAS (gib serpihan logam). Ledakan
// MENGHANCURKAN rangka (dismember penuh). Plus genangan coolant di tanah.
// Dipisah dari effects.js (yang memegang ledakan + sprite percikan coolant).
//
// Pool TETAP: gib & decal dibuat SEKALI di initGore (disembunyikan, tetap di
// scene) supaya program shader-nya ikut terkompilasi saat warmup preload
// (renderer.compile menyusuri objek tersembunyi) — NOL recompile di tengah main.
// Mayat memakai ULANG mesh robot (diserahkan killRobot); materialnya (semua
// per-instance) di-dispose saat mayat lenyap. Geometri/ material gib & tekstur
// decal DIBAGI (jangan dispose).

import { scene } from '../core/renderer.js';
import { makeTexture } from '../utils/textures.js';
import { rand } from '../utils/math.js';
import { spawnBloodBurst } from './effects.js';   // sirkular aman (gore->effects->robots->gore): dipakai di dalam fungsi

const corpses = [];              // mayat yang sedang jatuh/memudar (mesh robot di-reuse)
const bisected = [];             // bangkai TERBELAH DUA (kill pedang 2026-07-13): atas terbang berputar, bawah berdiri lalu roboh
const GIB_POOL = [], DECAL_POOL = [];
let nextGib = 0, nextDecal = 0;
const GIB_COUNT = 64, DECAL_COUNT = 44;
const GIB_GRAV = 150;            // gravitasi gib (visual, unit/dtk²)

let GIB_GEO = null;              // geometri potongan tubuh (dibagi)
let CUT_GEO = null;              // cakram tepi-potong bisection (dibagi; jangan dispose)
const _wp = new THREE.Vector3(); // scratch posisi dunia anggota tubuh
const _bq = new THREE.Quaternion(), _bax = new THREE.Vector3();   // scratch jungkiran paruh atas

// Tekstur genangan COOLANT: blob hijau + tetesan (latar transparan)
function drawBloodDecal(g, w, h) {
    const cx = w / 2, cy = h / 2;
    const blob = (x, y, r, a) => {
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(30,170,86,${a})`);
        rg.addColorStop(0.7, `rgba(18,124,60,${a * 0.8})`);
        rg.addColorStop(1, 'rgba(10,84,40,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    };
    blob(cx, cy, 26, 0.92);
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, d = 12 + Math.random() * 16; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + Math.random() * 7, 0.85); }
    for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283, d = 24 + Math.random() * 8; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.4 + Math.random() * 2.4, 0.7); }
}

export function initGore(sc) {
    // Geometri gib: potongan aktuator lengan/kaki (silinder), pecahan pelat (elipsoid), kepala (bola)
    const limb = new THREE.CylinderGeometry(0.42, 0.3, 2.4, 6);
    const chunk = new THREE.SphereGeometry(0.62, 7, 5); chunk.scale(1.25, 0.8, 1.0);
    const head = new THREE.SphereGeometry(0.82, 8, 6);
    GIB_GEO = [limb, chunk, head, chunk, limb];   // campuran bentuk per slot pool

    for (let i = 0; i < GIB_COUNT; i++) {
        const m = new THREE.MeshLambertMaterial({ color: 0x3d444c, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(GIB_GEO[i % GIB_GEO.length], m);
        mesh.castShadow = false; mesh.visible = false;
        sc.add(mesh);
        GIB_POOL.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, rest: false, bled: false, restY: 0.3, decalTone: 0x2fbf66 });
    }

    CUT_GEO = new THREE.CircleGeometry(1.3, 12);   // penampang potongan pinggang (bisection)

    const decalTex = makeTexture(64, 64, drawBloodDecal);
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < DECAL_COUNT; i++) {
        const m = new THREE.MeshBasicMaterial({ map: decalTex, color: 0x2fbf66, transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(decalGeo, m);
        mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.renderOrder = 1;
        sc.add(mesh);
        DECAL_POOL.push({ mesh, life: 0 });
    }
}

// Genangan coolant pipih di tanah (di titik mati / benturan gib). Pool round-robin.
export function spawnBloodDecal(x, z, s, tone = 0x2fbf66) {
    if (!DECAL_POOL.length) return;
    const d = DECAL_POOL[nextDecal++ % DECAL_POOL.length];
    d.mesh.visible = true;
    d.mesh.position.set(x, 0.06 + Math.random() * 0.03, z);
    d.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * 6.283);   // rebah + putar acak di bidang tanah
    d.mesh.scale.set(s, s, 1);
    d.mesh.material.color.setHex(tone);
    d.mesh.material.opacity = 0.8;
    d.life = 5 + Math.random() * 2;
}

// Lempar `count` potongan tubuh dari (x,y,z) ke arah (dirx,dirz) (kerucut acak).
// `decalTone` (opsional) = warna GENANGAN yang muncul saat gib mendarat: default
// COOLANT hijau (robot); mesin non-robot (heli/tank) melewatkan warna HITAM —
// "hanya robot yang punya cairan hijau" (permintaan user 2026-07-18).
export function spawnGibs(x, y, z, count, dirx, dirz, power, tone, restY, decalTone) {
    if (!GIB_POOL.length) return;
    const dl = Math.hypot(dirx, dirz) || 1;
    const baseAng = Math.atan2(dirz / dl, dirx / dl);
    for (let n = 0; n < count; n++) {
        const g = GIB_POOL[nextGib++ % GIB_POOL.length];
        g.mesh.visible = true;
        g.mesh.position.set(x + rand(-1.5, 1.5), y + rand(-1, 2), z + rand(-1.5, 1.5));
        g.mesh.rotation.set(Math.random() * 6.283, Math.random() * 6.283, Math.random() * 6.283);
        g.mesh.scale.setScalar((0.75 + Math.random() * 0.6) * (0.85 + power * 0.2));
        const ang = baseAng + rand(-1.15, 1.15);
        const spd = (13 + Math.random() * 20) * power;
        g.vx = Math.cos(ang) * spd;
        g.vz = Math.sin(ang) * spd;
        g.vy = 16 + Math.random() * 22 * power;
        g.sx = rand(-16, 16); g.sy = rand(-16, 16); g.sz = rand(-16, 16);
        g.life = 2.4 + Math.random() * 1.4;
        g.rest = false; g.bled = false;
        g.restY = restY != null ? restY : 0.3;
        g.decalTone = decalTone != null ? decalTone : 0x2fbf66;   // genangan mendarat (hijau default)
        g.mesh.material.color.setHex(tone != null ? tone : 0x3d444c);
        g.mesh.material.opacity = 1;
    }
}

// Warna anggota mesin (baca material mesh pertama di pivot) → gib mengikuti warna
// pelat armor/rangka robot itu, digelapkan sedikit (bekas hangus/oli).
function limbTone(piv) {
    let hex = null;
    piv.traverse(o => { if (hex === null && o.isMesh && o.material && o.material.color) hex = o.material.color.getHex(); });
    if (hex === null) return 0x3d444c;
    const c = new THREE.Color(hex); c.offsetHSL(0, 0.05, -0.12);
    return c.getHex();
}

// Lepaskan anggota tubuh dari rig: sembunyikan di MAYAT + lempar gib seukurannya.
// level 'heavy' (ledakan) = banyak anggota; 'light' (peluru/melee) = kadang satu.
export function gibRobot(rig, group, level, dirx, dirz, restY) {
    if (!rig) return;
    group.updateMatrixWorld(true);
    const sy = group.scale.y || 1;
    let keys;
    if (level === 'heavy') keys = ['armL', 'armR', 'thighL', 'thighR', 'head'];
    else keys = Math.random() < 0.55 ? [['armL', 'armR', 'head'][(Math.random() * 3) | 0]] : [];
    for (const key of keys) {
        const piv = rig[key];
        if (!piv || !piv.visible) continue;
        piv.getWorldPosition(_wp);
        const yOff = (key === 'head' ? 1.2 : -2.0) * sy;   // kepala di atas pivot, anggota lain di bawahnya
        spawnGibs(_wp.x, _wp.y + yOff, _wp.z, 1, dirx, dirz,
            level === 'heavy' ? 1.4 : 1.0, limbTone(piv), restY);
        piv.visible = false;   // hilang dari mayat (dismembered)
    }
}

// Jadikan mesh robot sebuah MAYAT: pose lemas, lalu toppling + memudar.
export function spawnCorpse(group, rig, opts = {}) {
    if (rig) {   // pose lemas mati (menimpa pose jalan/serang terakhir)
        if (rig.inner) rig.inner.position.y = 0;
        if (rig.thighL) rig.thighL.rotation.set(0.15, 0, 0);
        if (rig.thighR) rig.thighR.rotation.set(-0.1, 0, 0);
        if (rig.shinL) rig.shinL.rotation.set(0.25, 0, 0);
        if (rig.shinR) rig.shinR.rotation.set(0.35, 0, 0);
        if (rig.armL) rig.armL.rotation.set(0.2, 0, 0.35);
        if (rig.armR) rig.armR.rotation.set(0.2, 0, -0.35);
        if (rig.head) rig.head.rotation.set(0.3, 0, 0.15);
    }
    // Kumpulkan material unik (per-instance) → dijadikan transparan utk fade.
    const mats = [], seen = new Set();
    group.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of arr) if (!seen.has(m)) { seen.add(m); m.transparent = true; mats.push(m); }
    });
    const fallDur = opts.fast ? 0.28 : 0.42;
    corpses.push({
        group, mats,
        t: 0, fallDur,
        fallW: (Math.PI / 2) / fallDur * (Math.random() < 0.5 ? 1 : -1),   // arah toppling acak
        dur: opts.dur || 1.7, fadeDur: 0.6, baseY: group.position.y
    });
}

// ===== BANGKAI TERBELAH DUA (kill pedang, 2026-07-13) =====
// Rig robot dibelah di bidang pinggang (lokal y 6.35 — antara panggul 5.6 dan
// dasar torso): anak-anak `inner` dgn posisi lokal >= 6.3 (torso/dada/inti/
// ransel/bahu/leher/kepala/kedua lengan) dipindah ke grup paruh ATAS baru yang
// ber-origin TEPAT di bidang potong (jungkiran berputar di pinggang, bukan di
// kaki); panggul + kedua kaki tinggal di grup asli = paruh BAWAH. Karena grup
// robot hanya ber-yaw (lookAt sedatar) dan pose inner dinetralkan dulu,
// translasi sederhana mempertahankan pose dunia setiap anak 1:1. Kedua
// penampang diberi CAKRAM TEPI-POTONG menyala oranye (bekas sayatan panas;
// Lambert emissive = program shader visor robot — sudah warm, nol recompile).
// Paruh atas TERLEMPAR berputar ke depan-kiri arah bidik (arah jalan bilah
// pedang) sambil MENETESKAN coolant; paruh bawah BERDIRI sesaat (kaki melemas,
// stump menyembur) lalu roboh. Keduanya memudar + dispose bersama (material
// robot DIBAGI antar paruh — dikumpulkan unik, dispose SEKALI).
export function bisectCorpse(group, rig, opts = {}) {
    if (!rig || !rig.inner) { spawnCorpse(group, rig, opts); return; }   // fallback aman
    const inner = rig.inner;
    inner.position.set(0, 0, 0);      // netralkan bob/lunge/puntiran serangan terakhir
    inner.rotation.set(0, 0, 0);

    const CUT_Y = 6.35;               // bidang potong (ruang lokal rig — bebas skala kelas)
    const s = group.scale.y || 1;
    const topG = new THREE.Group();
    topG.position.set(group.position.x, group.position.y + CUT_Y * s, group.position.z);
    topG.rotation.copy(group.rotation);
    topG.scale.copy(group.scale);
    const innerTop = new THREE.Group();
    innerTop.position.set(0, -CUT_Y, 0);   // anak pindahan mempertahankan koordinat ruang-inner
    topG.add(innerTop);
    scene.add(topG);
    for (const ch of [...inner.children]) if (ch.position.y >= 6.3) innerTop.add(ch);

    // Pose paruh: lengan atas terkulai kaget + kepala tersentak; kaki bawah
    // disetel menapak netral (melemas bertahap di updateGore sebelum roboh).
    if (rig.armL) rig.armL.rotation.set(-0.9 + Math.random() * 0.5, 0, 0.5);
    if (rig.armR) rig.armR.rotation.set(-1.25 + Math.random() * 0.5, 0, -0.45);
    if (rig.head) rig.head.rotation.set(0.35, 0, 0.2);
    if (rig.thighL) rig.thighL.rotation.set(0.05, 0, 0);
    if (rig.thighR) rig.thighR.rotation.set(-0.05, 0, 0);
    if (rig.shinL) rig.shinL.rotation.set(0.05, 0, 0);
    if (rig.shinR) rig.shinR.rotation.set(0.05, 0, 0);

    // Cakram tepi-potong menyala di kedua penampang (transparan sejak awal
    // supaya ikut memudar; material per-bangkai -> ikut di-dispose).
    const mkCut = (parent, y, faceUp) => {
        const m = new THREE.MeshLambertMaterial({
            color: 0x14171b, emissive: new THREE.Color(0xff8a2a),
            transparent: true, opacity: 1
        });
        const d = new THREE.Mesh(CUT_GEO, m);
        d.position.y = y;
        d.rotation.x = faceUp ? -Math.PI / 2 : Math.PI / 2;
        d.castShadow = false;
        parent.add(d);
    };
    mkCut(innerTop, CUT_Y - 0.3, false);   // penampang bawah torso (menghadap ke bawah)
    mkCut(inner, CUT_Y - 0.25, true);      // penampang atas panggul (menghadap ke atas)

    // Kumpulkan material unik KEDUA paruh (dibagi antar paruh; termasuk cakram)
    // -> transparan utk fade, dispose SEKALI di akhir.
    const mats = [], seen = new Set();
    const collect = (g) => g.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of arr) if (!seen.has(m)) { seen.add(m); m.transparent = true; mats.push(m); }
    });
    collect(group); collect(topG);

    // Arah lemparan paruh atas: campuran arah bidik (opts.dirx/dirz) + KIRI-nya
    // (bilah pedang menyapu ke kiri layar saat fase strike) -> terbang serong.
    const dl = Math.hypot(opts.dirx || 0, opts.dirz || 0) || 1;
    const ax0 = (opts.dirx || 0) / dl, az0 = (opts.dirz == null ? 1 : opts.dirz) / dl;
    let fx = ax0 * 0.55 + az0 * 0.85, fz = az0 * 0.55 - ax0 * 0.85;   // kiri arah bidik = (dirz, -dirx)
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const spd = 14 + Math.random() * 7;
    const restY = opts.restY != null ? opts.restY : 0.3;
    bisected.push({
        top: topG, bot: group, rig, mats,
        t: 0,
        vx: fx * spd, vy: 11 + Math.random() * 5, vz: fz * spd,
        axX: fz, axZ: -fx,                                   // sumbu jungkir = tegak lurus arah lempar
        spinW: (4.5 + Math.random() * 3) * (Math.random() < 0.25 ? -1 : 1),
        topRest: false, topRestY: restY + 1.6 * s,           // pivot potongan saat dada rebah di tanah
        drip: 0.05, gush: 0.12,                              // pewaktu tetesan (atas) & semburan stump (bawah)
        stumpY: group.position.y + (CUT_Y - 0.2) * s,
        standSec: 0.5 + Math.random() * 0.35,                // jeda paruh bawah tetap berdiri
        fallDur: 0.38,
        fallW: (Math.PI / 2) / 0.38 * (Math.random() < 0.5 ? 1 : -1),
        dur: 2.35, fadeDur: 0.55, botBaseY: group.position.y
    });
}

// Update per frame (game.js): mayat + bangkai terbelah + gib + genangan darah.
export function updateGore(dt) {
    // --- Bangkai TERBELAH DUA: atas balistik+jungkir+menetes; bawah berdiri
    //     (kaki melemas, stump menyembur) -> roboh; fade+dispose bersama ---
    for (let i = bisected.length - 1; i >= 0; i--) {
        const w = bisected[i];
        w.t += dt;
        if (!w.topRest) {
            w.vy -= GIB_GRAV * 0.85 * dt;   // sedikit lebih ringan dari gib (potongan besar, dramatis)
            w.top.position.x += w.vx * dt;
            w.top.position.y += w.vy * dt;
            w.top.position.z += w.vz * dt;
            _bq.setFromAxisAngle(_bax.set(w.axX, 0, w.axZ).normalize(), w.spinW * dt);
            w.top.quaternion.premultiply(_bq);   // jungkir ruang-dunia di pivot pinggang
            w.drip -= dt;
            if (w.drip <= 0) {   // coolant MENETES dari penampang selama melayang
                w.drip = 0.06;
                spawnBloodBurst(w.top.position.x, w.top.position.y, w.top.position.z,
                    -w.vx, -w.vz, 2, 0.5, 6.283);
            }
            if (w.top.position.y <= w.topRestY && w.vy < 0) {
                w.top.position.y = w.topRestY;
                w.topRest = true;
                spawnBloodDecal(w.top.position.x, w.top.position.z, 2.6 + Math.random() * 1.6);
            }
        }
        if (w.t < w.standSec) {
            // Paruh bawah masih BERDIRI: kaki melemas perlahan + stump menyembur
            const kk = w.t / w.standSec;
            if (w.rig.thighL) w.rig.thighL.rotation.x = 0.05 + kk * 0.3;
            if (w.rig.thighR) w.rig.thighR.rotation.x = -0.05 - kk * 0.22;
            if (w.rig.shinL) w.rig.shinL.rotation.x = kk * 0.5;
            if (w.rig.shinR) w.rig.shinR.rotation.x = kk * 0.4;
            w.gush -= dt;
            if (w.gush <= 0) {
                w.gush = 0.09;
                spawnBloodBurst(w.bot.position.x, w.stumpY, w.bot.position.z, 0, 0, 2, 0.75, 6.283);
            }
        } else if (w.t < w.standSec + w.fallDur) {
            w.bot.rotateX(w.fallW * dt);   // lalu roboh spt bangkai biasa
        }
        const fadeStart = w.dur - w.fadeDur;
        if (w.t > fadeStart) {
            const k = Math.max(0, 1 - (w.t - fadeStart) / w.fadeDur);
            for (const m of w.mats) m.opacity = k;
            w.bot.position.y = w.botBaseY - (1 - k) * 4;   // ambles sembari pudar
            w.top.position.y -= dt * 3;
        }
        if (w.t >= w.dur) {
            for (const m of w.mats) m.dispose();   // material dibagi antar paruh — sudah unik, dispose sekali
            scene.remove(w.top); scene.remove(w.bot);
            bisected.splice(i, 1);
        }
    }
    // --- Mayat: toppling -> diam -> memudar + ambles -> dispose ---
    for (let i = corpses.length - 1; i >= 0; i--) {
        const c = corpses[i];
        c.t += dt;
        if (c.t < c.fallDur) c.group.rotateX(c.fallW * dt);   // rebah di atas kaki
        const fadeStart = c.dur - c.fadeDur;
        if (c.t > fadeStart) {
            const k = Math.max(0, 1 - (c.t - fadeStart) / c.fadeDur);
            for (const m of c.mats) m.opacity = k;
            c.group.position.y = c.baseY - (1 - k) * 4;   // ambles ke tanah sembari pudar
        }
        if (c.t >= c.dur) {
            for (const m of c.mats) m.dispose();
            scene.remove(c.group);
            corpses.splice(i, 1);
        }
    }
    // --- Gib: balistik + spin + memantul + memudar ---
    for (let k = 0; k < GIB_POOL.length; k++) {
        const g = GIB_POOL[k];
        if (g.life <= 0) continue;
        g.life -= dt;
        if (!g.rest) {
            g.vy -= GIB_GRAV * dt;
            g.mesh.position.x += g.vx * dt;
            g.mesh.position.y += g.vy * dt;
            g.mesh.position.z += g.vz * dt;
            g.mesh.rotation.x += g.sx * dt;
            g.mesh.rotation.y += g.sy * dt;
            g.mesh.rotation.z += g.sz * dt;
            if (g.mesh.position.y <= g.restY) {
                g.mesh.position.y = g.restY;
                if (!g.bled && g.vy < -6) { g.bled = true; spawnBloodDecal(g.mesh.position.x, g.mesh.position.z, 1.8 + Math.random() * 1.8, g.decalTone); }
                g.vy = -g.vy * 0.3; g.vx *= 0.5; g.vz *= 0.5;
                g.sx *= 0.4; g.sy *= 0.4; g.sz *= 0.4;
                if (Math.abs(g.vy) < 3) { g.rest = true; g.vy = 0; }
            }
        }
        if (g.life < 0.5) g.mesh.material.opacity = Math.max(0, g.life / 0.5);
        if (g.life <= 0) { g.mesh.visible = false; g.mesh.material.opacity = 1; }
    }
    // --- Genangan coolant: tahan lalu memudar lambat ---
    for (let k = 0; k < DECAL_POOL.length; k++) {
        const d = DECAL_POOL[k];
        if (d.life <= 0) continue;
        d.life -= dt;
        d.mesh.material.opacity = Math.min(1, d.life) * 0.8;
        if (d.life <= 0) d.mesh.visible = false;
    }
}

// resetGame: buang mayat & bangkai terbelah (dispose material robot),
// sembunyikan pool gib & decal.
export function resetGore() {
    for (const c of corpses) { for (const m of c.mats) m.dispose(); scene.remove(c.group); }
    corpses.length = 0;
    for (const w of bisected) { for (const m of w.mats) m.dispose(); scene.remove(w.top); scene.remove(w.bot); }
    bisected.length = 0;
    for (const g of GIB_POOL) { g.life = 0; g.mesh.visible = false; g.mesh.material.opacity = 1; }
    for (const d of DECAL_POOL) { d.life = 0; d.mesh.visible = false; }
    nextGib = 0; nextDecal = 0;
}
