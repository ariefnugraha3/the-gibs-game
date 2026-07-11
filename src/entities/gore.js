// GORE (2026-07-11): zombie tidak lagi lenyap seketika saat mati — ia TERJATUH
// (mayat toppling lalu memudar), MUNCRAT darah, dan ANGGOTA TUBUHNYA TERLEPAS
// (gib). Ledakan MENGHANCURKAN tubuh (dismember penuh). Plus genangan darah di
// tanah. Dipisah dari effects.js (yang memegang ledakan + sprite percikan darah).
//
// Pool TETAP: gib & decal dibuat SEKALI di initGore (disembunyikan, tetap di
// scene) supaya program shader-nya ikut terkompilasi saat warmup preload
// (renderer.compile menyusuri objek tersembunyi) — NOL recompile di tengah main.
// Mayat memakai ULANG mesh zombie (diserahkan killZombie); materialnya (semua
// per-instance) di-dispose saat mayat lenyap. Geometri/ material gib & tekstur
// decal DIBAGI (jangan dispose).

import { scene } from '../core/renderer.js';
import { makeTexture } from '../utils/textures.js';
import { rand } from '../utils/math.js';

const corpses = [];              // mayat yang sedang jatuh/memudar (mesh zombie di-reuse)
const GIB_POOL = [], DECAL_POOL = [];
let nextGib = 0, nextDecal = 0;
const GIB_COUNT = 64, DECAL_COUNT = 44;
const GIB_GRAV = 150;            // gravitasi gib (visual, unit/dtk²)

let GIB_GEO = null;              // geometri potongan tubuh (dibagi)
const _wp = new THREE.Vector3(); // scratch posisi dunia anggota tubuh

// Tekstur genangan darah: blob merah gelap + tetesan (latar transparan)
function drawBloodDecal(g, w, h) {
    const cx = w / 2, cy = h / 2;
    const blob = (x, y, r, a) => {
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(96,8,8,${a})`);
        rg.addColorStop(0.7, `rgba(66,5,5,${a * 0.8})`);
        rg.addColorStop(1, 'rgba(48,3,3,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    };
    blob(cx, cy, 26, 0.92);
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, d = 12 + Math.random() * 16; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + Math.random() * 7, 0.85); }
    for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283, d = 24 + Math.random() * 8; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.4 + Math.random() * 2.4, 0.7); }
}

export function initGore(sc) {
    // Geometri gib: potongan lengan/kaki (silinder), bongkah daging (elipsoid), kepala (bola)
    const limb = new THREE.CylinderGeometry(0.42, 0.3, 2.4, 6);
    const chunk = new THREE.SphereGeometry(0.62, 7, 5); chunk.scale(1.25, 0.8, 1.0);
    const head = new THREE.SphereGeometry(0.82, 8, 6);
    GIB_GEO = [limb, chunk, head, chunk, limb];   // campuran bentuk per slot pool

    for (let i = 0; i < GIB_COUNT; i++) {
        const m = new THREE.MeshLambertMaterial({ color: 0x6a0f0c, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(GIB_GEO[i % GIB_GEO.length], m);
        mesh.castShadow = false; mesh.visible = false;
        sc.add(mesh);
        GIB_POOL.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, rest: false, bled: false, restY: 0.3 });
    }

    const decalTex = makeTexture(64, 64, drawBloodDecal);
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < DECAL_COUNT; i++) {
        const m = new THREE.MeshBasicMaterial({ map: decalTex, color: 0x8f1010, transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(decalGeo, m);
        mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.renderOrder = 1;
        sc.add(mesh);
        DECAL_POOL.push({ mesh, life: 0 });
    }
}

// Genangan darah pipih di tanah (di titik mati / benturan gib). Pool round-robin.
export function spawnBloodDecal(x, z, s, tone = 0x8f1010) {
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
export function spawnGibs(x, y, z, count, dirx, dirz, power, tone, restY) {
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
        g.mesh.material.color.setHex(tone != null ? tone : 0x6a0f0c);
        g.mesh.material.opacity = 1;
    }
}

// Warna anggota tubuh (baca material mesh pertama di pivot) → gib mengikuti warna
// baju/kulit zombie itu, digelapkan sedikit supaya berkesan berdarah.
function limbTone(piv) {
    let hex = null;
    piv.traverse(o => { if (hex === null && o.isMesh && o.material && o.material.color) hex = o.material.color.getHex(); });
    if (hex === null) return 0x6a0f0c;
    const c = new THREE.Color(hex); c.offsetHSL(0, 0.1, -0.12);
    return c.getHex();
}

// Lepaskan anggota tubuh dari rig: sembunyikan di MAYAT + lempar gib seukurannya.
// level 'heavy' (ledakan) = banyak anggota; 'light' (peluru/melee) = kadang satu.
export function gibZombie(rig, group, level, dirx, dirz, restY) {
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

// Jadikan mesh zombie sebuah MAYAT: pose lemas, lalu toppling + memudar.
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

// Update per frame (game.js): mayat + gib + genangan darah.
export function updateGore(dt) {
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
                if (!g.bled && g.vy < -6) { g.bled = true; spawnBloodDecal(g.mesh.position.x, g.mesh.position.z, 1.8 + Math.random() * 1.8); }
                g.vy = -g.vy * 0.3; g.vx *= 0.5; g.vz *= 0.5;
                g.sx *= 0.4; g.sy *= 0.4; g.sz *= 0.4;
                if (Math.abs(g.vy) < 3) { g.rest = true; g.vy = 0; }
            }
        }
        if (g.life < 0.5) g.mesh.material.opacity = Math.max(0, g.life / 0.5);
        if (g.life <= 0) { g.mesh.visible = false; g.mesh.material.opacity = 1; }
    }
    // --- Genangan darah: tahan lalu memudar lambat ---
    for (let k = 0; k < DECAL_POOL.length; k++) {
        const d = DECAL_POOL[k];
        if (d.life <= 0) continue;
        d.life -= dt;
        d.mesh.material.opacity = Math.min(1, d.life) * 0.8;
        if (d.life <= 0) d.mesh.visible = false;
    }
}

// resetGame: buang mayat (dispose material zombie), sembunyikan pool gib & decal.
export function resetGore() {
    for (const c of corpses) { for (const m of c.mats) m.dispose(); scene.remove(c.group); }
    corpses.length = 0;
    for (const g of GIB_POOL) { g.life = 0; g.mesh.visible = false; g.mesh.material.opacity = 1; }
    for (const d of DECAL_POOL) { d.life = 0; d.mesh.visible = false; }
    nextGib = 0; nextDecal = 0;
}
