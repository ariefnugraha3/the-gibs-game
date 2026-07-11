// Zombie manusia prosedural: pabrik mesh (varian profesi), animasi rig, daur
// hidup (kill/dispose), dan loop update bersama. Logika GERAK per mode
// (kejar+vault survival / idle+aktivasi campaign) milik scene aktif lewat
// hook scene.zombieAI(z, dt, step) — modul ini menangani bagian yang sama di
// semua scene: cakaran, animasi rig, dan hit test peluru.

import { CFG } from '../core/config.js';
import { player, zombies, bullets, addScore, stats, _dir, godMode } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { rand, clamp, segPointDist2 } from '../utils/math.js';
import { playSFX, sfxZombieBite, sfxHit } from '../utils/sfx.js';
import { crosshair, flashDamage, showHitDir } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { spawnBloodBurst, explodeAt } from './effects.js';
import { spawnCorpse, gibZombie, spawnGibs, spawnBloodDecal } from './gore.js';
import { spawnDrop } from './drops.js';
import { gameOver } from '../core/game.js';

// Ceritanya: warga biasa yang diubah alien. Dibangun prosedural dari primitif
// membulat/stylized (silinder meruncing + elipsoid, tanpa file model), dengan
// varian penampilan: warga, pekerja proyek, polisi, pedagang, penjaga toko,
// pekerja kantoran.
export const ZOMBIE_VARIANTS = [
    { shirts: [0x8f3f3f, 0x3f5f8f, 0x7c7c40, 0x8f6f3f], pants: 0x2f3a52, shoes: 0x26221e, acc: 'none' },   // warga (kaos warna-warni)
    { shirts: [0x6b7078], pants: 0x414652, shoes: 0x3d2f22, acc: 'worker' },   // pekerja proyek
    { shirts: [0x8a7752], pants: 0x4d422e, shoes: 0x1d1a16, acc: 'police' },   // polisi
    { shirts: [0x7c5a3a, 0x5a7c4a], pants: 0x3f3f3f, shoes: 0x54452f, acc: 'vendor' },   // pedagang
    { shirts: [0xd8d4c8], pants: 0x33465e, shoes: 0x23262b, acc: 'clerk' },    // penjaga toko
    { shirts: [0xd8d8dc], pants: 0x23262e, shoes: 0x1a1a1a, acc: 'office' },   // kantoran
];
export const ZOMBIE_SKIN_TONES = [0x7fa05a, 0x8aa66b, 0x74975a, 0x93a06a];   // kulit membusuk kehijauan

export const CLAW_TIME = 0.4;   // durasi animasi sabetan (mekanik jeda cakar dari CFG)

// Sudut penyerang relatif LAYAR (0 = atas layar, + = searah jarum jam) —
// dipakai indikator arah serangan (showHitDir). Top-down 2026-07-11: kamera
// render ber-yaw tetap menghadap -z, jadi atas layar = -z dunia & kanan layar
// = +x dunia — sudutnya murni dari ofset dunia, TIDAK lagi dari yaw pivot
// (yaw pivot kini = arah bidik kursor, bukan arah pandang).
export function attackerAngle(ax, az) {
    const dx = ax - camera.position.x, dz = az - camera.position.z;
    return Math.atan2(dx, -dz);
}

// reachMul utk zombie berskala: badan pejal (bodyBlockRadius x scl) MENDORONG
// player — tanpa ini brute/boss mendorong player keluar dari jangkauan
// cakarnya sendiri dan tak pernah bisa menyerang. Invarian dasar game
// (body 7.5 < stop 8.0 < claw 8.5) dipertahankan pada skala berapa pun:
// stop = player.radius + stopRange*reachMul harus >= body + 0.5.
// scl 1 menghasilkan tepat 1.0 (perilaku lama byte-identik).
export function reachForScale(scl, base = 1) {
    const need = (CFG.zombie.bodyBlockRadius * scl + 0.5 - CFG.player.radius)
        / CFG.zombie.stopRange;
    return Math.max(base, need);
}

// Warnai ulang seluruh material 1 zombie (per-instance, aman) — primitif yang
// dipakai applyVariantTint (di bawah) & tint boss campaign. dh/ds/dl = offset HSL.
export function tintZombie(group, dh, ds, dl, emissiveHex = 0) {
    group.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
            if (m.color) m.color.offsetHSL(dh, ds, dl);
            if (emissiveHex && m.emissive) m.emissive.setHex(emissiveHex);
        }
    });
}

// Skin pembeda per-varian (SATU sumber utk survival & campaign supaya konsisten
// antar-mode). Visual-only -> nilai tetap di kode (aturan arsitektur). Basis kulit
// zombie = hijau kusam (~88° hue). Boss dikecualikan: punya tint sendiri (badan
// raksasa) di campaign/common.js.
export function applyVariantTint(group, kind) {
    if (kind === 'runner') tintZombie(group, -0.09, 0.1, 0.1);                    // kekuningan pucat
    else if (kind === 'brute') tintZombie(group, 0, -0.2, -0.22);                 // kehitaman/arang
    else if (kind === 'exploder') tintZombie(group, -0.22, 0.1, -0.02, 0x3a0a06); // kemerahan + pijar merah samar
}

// Elipsoid (sphere di-skala) — bentuk membulat murah untuk kepala/sendi/telapak.
// geo.scale membakukan skala ke vertex (tetap satu geometri berbagi antar instance).
function ellipGeo(r, sx, sy, sz, ws = 8, hs = 6) {
    const g = new THREE.SphereGeometry(r, ws, hs);
    g.scale(sx, sy, sz);
    return g;
}
// Geometri bersama bagian tubuh (dipakai ulang antar instance; JANGAN
// di-dispose saat zombie mati — hanya materialnya yang per-instance).
// OVERHAUL 2026-07-11: bentuk membulat/stylized low-poly (silinder meruncing +
// elipsoid) menggantikan balok Minecraft/Roblox. Rig pivot & tinggi TIDAK
// berubah (animateZombieRig sama). Hit-test tetap horizontal CFG.bodyHitRadius.
const ZG = {
    // Badan: silinder meruncing (dada > pinggang) & DIPIPIHKAN depan-belakang (×0.64)
    torso: (() => { const g = new THREE.CylinderGeometry(1.5, 1.02, 4.6, 12, 1); g.scale(1, 1, 0.64); return g; })(),
    // Yoke bahu: elipsoid lebar pipih menjembatani dada->pangkal lengan (kunci
    // siluet "berbahu" dari atas — bukan tabung lurus)
    shoulders: ellipGeo(1.0, 2.05, 0.72, 0.98, 10, 6),
    neck: new THREE.CylinderGeometry(0.5, 0.62, 1.0, 8),
    head: ellipGeo(1.16, 1.0, 1.16, 1.06, 12, 10),
    eye: ellipGeo(0.28, 1.05, 1.35, 0.6, 6, 5),       // rongga mata cekung gelap
    // Lengan: silinder meruncing (bahu->pergelangan) + telapak elipsoid
    arm: new THREE.CylinderGeometry(0.62, 0.42, 4.0, 8),
    hand: ellipGeo(0.56, 1.0, 0.82, 1.0, 7, 5),
    // Kaki: paha & betis meruncing + telapak elipsoid memanjang ke depan
    thigh: new THREE.CylinderGeometry(0.86, 0.6, 3.1, 8),
    shin: new THREE.CylinderGeometry(0.58, 0.42, 2.7, 8),
    foot: ellipGeo(0.62, 1.05, 0.62, 1.95, 7, 5),
    // Aksesori pembeda profesi (menyesuaikan tubuh membulat)
    vestShell: (() => { const g = new THREE.CylinderGeometry(1.64, 1.2, 3.2, 12, 1, true); g.scale(1, 1, 0.7); return g; })(),  // rompi = cangkang terbuka
    band: (() => { const g = new THREE.CylinderGeometry(1.68, 1.52, 0.42, 12, 1, true); g.scale(1, 1, 0.72); return g; })(),    // strip reflektif
    apron: new THREE.BoxGeometry(2.4, 3.6, 0.28),                              // celemek pedagang (panel depan)
    helmet: (() => { const g = new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.05, 0.8, 1.05); return g; })(),  // helm proyek (kubah)
    capCrown: new THREE.CylinderGeometry(1.28, 1.34, 1.0, 12),                 // topi dinas polisi (mahkota)
    capBrim: new THREE.CylinderGeometry(1.34, 1.34, 0.18, 12),                 // pinggir topi
    caping: new THREE.ConeGeometry(2.7, 1.5, 12),                             // caping anyaman pedagang
    tie: new THREE.BoxGeometry(0.5, 2.2, 0.14),                               // dasi kantoran
    badge: ellipGeo(0.34, 1.0, 1.15, 0.5, 6, 5),                             // lencana polisi
    tag: new THREE.BoxGeometry(0.72, 0.4, 0.12),                             // papan nama penjaga toko
};

// Bangun 1 zombie manusia (varian profesi acak). Material dibuat per-instance
// agar jitter grime (offsetHSL) tiap zombie unik & dispose aman; geometri dibagi (ZG).
// Rig pivot pinggul/lutut/bahu/kepala digerakkan animateZombieRig; menghadap +Z
// (di-lookAt ke player oleh AI), kaki di y=0.
export function buildHumanZombie() {
    const V = ZOMBIE_VARIANTS[(Math.random() * ZOMBIE_VARIANTS.length) | 0];
    const skinTone = ZOMBIE_SKIN_TONES[(Math.random() * ZOMBIE_SKIN_TONES.length) | 0];
    const mat = (hex) => new THREE.MeshLambertMaterial({
        color: new THREE.Color(hex).offsetHSL(0, 0, rand(-0.05, 0.03))   // kumal, tiap zombie beda
    });
    const skin = mat(skinTone);
    const shirt = mat(V.shirts[(Math.random() * V.shirts.length) | 0]);
    const pants = mat(V.pants), shoes = mat(V.shoes);
    const dark = mat(0x141810);   // rongga mata cekung

    const group = new THREE.Group();   // outer: di-lookAt AI
    const inner = new THREE.Group();   // bob badan naik-turun
    group.add(inner);
    // shadow=false utk bagian kecil (leher/mata/telapak/aksesori): memangkas draw
    // call depth pass tanpa mengubah siluet bayangan (torso/kepala/paha/betis/lengan
    // tetap caster).
    const mk = (geo, m, x, y, z, parent, shadow = true) => {
        const b = new THREE.Mesh(geo, m);
        b.position.set(x, y, z);
        b.castShadow = shadow;
        parent.add(b);
        return b;
    };

    // Torso meruncing + yoke bahu + leher (siluet manusia membulat)
    mk(ZG.torso, shirt, 0, 7.9, 0, inner);
    mk(ZG.shoulders, shirt, 0, 9.75, 0, inner, false);
    mk(ZG.neck, skin, 0, 10.0, 0, inner, false);

    // Kepala membulat + rongga mata cekung gelap (wajah tersirat; top-down jarang terlihat)
    const headG = new THREE.Group();
    headG.position.set(0, 10.3, 0);
    inner.add(headG);
    mk(ZG.head, skin, 0, 1.25, 0, headG);
    mk(ZG.eye, dark, -0.42, 1.42, 1.02, headG, false);
    mk(ZG.eye, dark, 0.42, 1.42, 1.02, headG, false);

    // Kaki: pivot pinggul -> paha; pivot lutut -> betis + telapak
    const mkLeg = (sx) => {
        const hip = new THREE.Group(); hip.position.set(sx, 5.7, 0); inner.add(hip);
        mk(ZG.thigh, pants, 0, -1.5, 0, hip);
        const knee = new THREE.Group(); knee.position.set(0, -3.0, 0); hip.add(knee);
        mk(ZG.shin, pants, 0, -1.35, 0, knee);
        mk(ZG.foot, shoes, 0, -2.5, 0.5, knee, false);
        return { hip, knee };
    };
    const legL = mkLeg(-1.0), legR = mkLeg(1.0);
    // Lengan: pivot bahu (pose dasar menjulur ke depan khas zombie, di animateZombieRig)
    const mkArm = (sx) => {
        const sh = new THREE.Group(); sh.position.set(sx, 9.6, 0); inner.add(sh);
        mk(ZG.arm, shirt, 0, -1.95, 0, sh);
        mk(ZG.hand, skin, 0, -4.25, 0, sh, false);
        return sh;
    };
    const armL = mkArm(-2.05), armR = mkArm(2.05);

    // Aksesori pembeda profesi (bentuk menyesuaikan tubuh membulat)
    if (V.acc === 'worker') {
        mk(ZG.vestShell, mat(0xd97b1f), 0, 8.0, 0, inner, false);     // rompi keselamatan oranye
        mk(ZG.band, mat(0xd8d8ca), 0, 7.5, 0, inner, false);          // strip reflektif
        mk(ZG.helmet, mat(0xe8c11c), 0, 1.55, 0, headG, false);       // helm proyek kuning (kubah)
    } else if (V.acc === 'police') {
        mk(ZG.capCrown, mat(0x28324a), 0, 2.25, 0, headG, false);     // topi dinas
        mk(ZG.capBrim, mat(0x1e2636), 0, 2.0, 1.0, headG, false);
        mk(ZG.badge, mat(0xd8b03a), -0.95, 8.8, 1.02, inner, false);  // lencana emas
    } else if (V.acc === 'vendor') {
        mk(ZG.apron, mat(0x4f3a28), 0, 7.1, 0.95, inner, false);      // celemek
        mk(ZG.caping, mat(0xb99a55), 0, 2.2, 0, headG, false);        // caping anyaman
    } else if (V.acc === 'clerk') {
        mk(ZG.vestShell, mat(0x2f5f9f), 0, 8.0, 0, inner, false);     // rompi biru minimarket
        mk(ZG.tag, mat(0xe8e8e8), 0.95, 8.7, 1.05, inner, false);     // papan nama
    } else if (V.acc === 'office') {
        mk(ZG.tie, mat(0x7c2430), 0, 8.5, 0.95, inner, false);        // dasi
    }

    return {
        group,
        rig: { inner, thighL: legL.hip, thighR: legR.hip, shinL: legL.knee, shinR: legR.knee, armL, armR, head: headG }
    };
}

// Animasi jalan/lompat prosedural pada pivot rig zombie manusia.
// Rig dibangun menghadap +Z dan grup di-lookAt ke player, jadi sumbu lateral
// tubuh = sumbu X lokal tiap pivot — cukup putar rotation.x (tanpa quaternion).
export function animateZombieRig(z, dt) {
    const r = z.rig;
    if (!r) return;
    if (z.state === 'jumping') {
        // Pose melompat: paha terangkat, lutut menekuk, lengan terangkat tinggi.
        r.thighL.rotation.x = -1.1; r.thighR.rotation.x = -1.1;
        r.shinL.rotation.x = 1.3; r.shinR.rotation.x = 1.3;
        r.armL.rotation.x = -1.7; r.armR.rotation.x = -1.7;
        r.inner.position.y = 0;
        return;
    }
    if (z.moving === false) {
        // BERDIRI di jangkauan cakar / idle campaign: kaki lurus & bob hilang
        // (mulus via damping), hanya sisa sway napas kecil di lengan/kepala.
        const damp = Math.min(1, dt * 8);
        r.thighL.rotation.x += (0 - r.thighL.rotation.x) * damp;
        r.thighR.rotation.x += (0 - r.thighR.rotation.x) * damp;
        r.shinL.rotation.x += (0 - r.shinL.rotation.x) * damp;
        r.shinR.rotation.x += (0 - r.shinR.rotation.x) * damp;
        r.inner.position.y += (0 - r.inner.position.y) * damp;
        z.phase += dt * 1.5;
        const s2 = Math.sin(z.phase);
        r.armL.rotation.x = -1.15 + s2 * 0.06;
        r.armR.rotation.x = -1.15 - s2 * 0.06;
        r.head.rotation.z = s2 * 0.04;
    } else {
        // Berjalan: kaki & lengan berayun bergantian + bob badan + kepala oleng.
        z.phase += dt * (5 + z.speed * 6);
        const s = Math.sin(z.phase);
        const SW = 0.55, KN = 0.7, AR = 0.35;   // amplitudo paha / lutut / lengan
        r.thighL.rotation.x = -s * SW;
        r.thighR.rotation.x = s * SW;
        r.shinL.rotation.x = Math.max(0, -s) * KN;   // lutut menekuk saat kaki mengayun balik
        r.shinR.rotation.x = Math.max(0, s) * KN;
        r.armL.rotation.x = -1.15 + s * AR;          // pose dasar: lengan menjulur ke depan
        r.armR.rotation.x = -1.15 - s * AR;
        r.head.rotation.z = Math.sin(z.phase * 0.5) * 0.08;
        r.inner.position.y = Math.abs(s) * 1.2;
    }

    // Sabetan mencakar: satu lengan terangkat lalu menyabet ke bawah-keluar
    // (menimpa pose jalan; rotation.z kembali 0 di akhir sabetan).
    if (z.clawT > 0) {
        z.clawT -= dt;
        const k = 1 - Math.max(0, z.clawT) / CLAW_TIME;
        const sw = Math.sin(Math.PI * k);
        const arm = z.clawSide > 0 ? r.armR : r.armL;
        arm.rotation.x = -1.6 + sw * 1.5;
        arm.rotation.z = (z.clawSide > 0 ? -0.5 : 0.5) * sw;
    }
}

// Buang material milik 1 zombie (semua dibuat per-instance -> aman di-dispose;
// geometri ZG dibagi antar zombie -> JANGAN di-dispose). Tetap tangani material
// ARRAY (jaga-jaga bila ada bagian multi-material di masa depan).
export function disposeZombie(z) {
    z.mesh.traverse(o => {
        if (!o.isMesh || !o.material) return;
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose && m.dispose());
        else if (o.material.dispose) o.material.dispose();
    });
}

// Sengaja TIDAK ada umpan-balik warna luka pada zombie: player tidak boleh
// tahu zombie sudah tertembak / hampir mati — warna asli dipertahankan.

// Antrean ledakan. JANGAN memanggil explodeAt langsung dari killZombie / loop
// hit peluru: explodeAt mengiterasi & men-splice array zombies yang sama —
// ledakan berantai di tengah iterasi = bug indeks. Antrean diproses SETELAH
// loop utama (processPendingBooms); ledakan berantai berjalan iteratif di sana.
// Dipakai exploder (hurtPlayer) DAN peluru Grenade Launcher (bullets.js/zombies.js,
// friendly = tak melukai player). Entri: { pos, r, hurtPlayer, playerDmg }.
const pendingBooms = [];
export function queueBoom(x, y, z, r, hurtPlayer = false, playerDmg = 0) {
    pendingBooms.push({ pos: new THREE.Vector3(x, y, z), r, hurtPlayer, playerDmg });
}
export function resetZombiesFx() { pendingBooms.length = 0; }   // dipanggil resetGame

// Skor per kematian: boss = `CFG.campaign.boss.score`; selain itu dari
// `CFG.zombie.score` — special = varian (runner/brute/exploder) 150, normal 100.
function zombieScore(z) {
    if (z.kind === 'boss') return CFG.campaign.boss.score;
    const S = CFG.zombie.score;
    const special = z.kind === 'runner' || z.kind === 'brute' || z.kind === 'exploder';
    return special ? S.specialKill : S.normalKill;
}

// Kematian zombie (GORE 2026-07-11): TIDAK lenyap seketika — zombie dikeluarkan
// dari daftar HIDUP lalu diserahkan ke sistem gore (mesh-nya di-reuse jadi MAYAT
// yang terjatuh + memudar). Darah MUNCRAT & anggota tubuh TERLEPAS; ledakan
// (opts.cause==='explosion') MENGHANCURKAN tubuh (dismember penuh). opts.dirx/dirz
// = arah damage (peluru/melee/keluar-ledakan) → arah semburan & lemparan gib.
export function killZombie(i, opts = {}) {
    const z = zombies[i];
    zombies.splice(i, 1);          // keluar dari daftar HIDUP DULU (mayat jadi inert: tak ber-AI/pejal/kena tembak)
    stats.kills++;
    addScore(zombieScore(z));
    if (z.kind === 'exploder') {
        const V = CFG.zombie.variants.exploder;
        queueBoom(z.mesh.position.x, z.mesh.position.y, z.mesh.position.z, V.boomRadius, true, V.boomDamage);
    }

    const p = z.mesh.position, scl = z.scl || 1;
    const dirx = opts.dirx != null ? opts.dirx : (Math.random() - 0.5);
    const dirz = opts.dirz != null ? opts.dirz : (Math.random() - 0.5);
    const restY = (z.groundY || 0) + 0.3;
    const bodyY = p.y + 7 * scl;   // sekitar dada

    if (opts.cause === 'explosion') {
        // HANCUR TOTAL: darah menyembur ke SEGALA arah + berlapis, anggota tubuh
        // TERBANG, bongkah daging ekstra berhamburan, genangan TERCECER di sekitar.
        spawnBloodBurst(p.x, bodyY, p.z, dirx, dirz, 34, 2.0, 6.283);       // 360° deras
        spawnBloodBurst(p.x, p.y + 3 * scl, p.z, dirx, dirz, 18, 1.2, 6.283); // lapisan rendah menyebar
        gibZombie(z.rig, z.mesh, 'heavy', dirx, dirz, restY);              // anggota tubuh lepas
        spawnGibs(p.x, bodyY, p.z, 10, dirx, dirz, 1.8, 0x6a0f0c, restY);  // + bongkah daging ekstra
        spawnCorpse(z.mesh, z.rig, { dirx, dirz, dur: 1.2, fast: true });
        // genangan darah TERCECER di sekitar titik ledak (bukan cuma satu di tengah)
        spawnBloodDecal(p.x, p.z, 4 + Math.random() * 3);
        for (let d = 0; d < 8; d++) {
            const a = Math.random() * 6.283, r = (2 + Math.random() * 15) * scl;
            spawnBloodDecal(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 1.8 + Math.random() * 3);
        }
    } else {
        spawnBloodBurst(p.x, bodyY, p.z, dirx, dirz, 9, 1.0);          // muncratan
        gibZombie(z.rig, z.mesh, 'light', dirx, dirz, restY);          // kadang satu anggota lepas
        spawnCorpse(z.mesh, z.rig, { dirx, dirz });
        spawnBloodDecal(p.x, p.z, 3 + Math.random() * 2);             // genangan di titik mati
    }
}

// Proses ledakan yang antre: visual+kill zombie sekitar (explodeAt). Exploder
// (hurtPlayer) MELUKAI player bila dekat; peluru Grenade Launcher friendly
// (hurtPlayer=false). killZombie di dalam explodeAt bisa menambah antrean lagi
// (ledakan berantai) — loop while menuntaskannya.
function processPendingBooms() {
    while (pendingBooms.length) {
        const b = pendingBooms.shift();
        explodeAt(b.pos, b.r);
        if (b.hurtPlayer) {
            const d = Math.hypot(b.pos.x - camera.position.x, b.pos.z - camera.position.z);
            if (d < b.r) {
                if (!godMode) player.hp -= b.playerDmg;   // cheat: kebal
                updateUI();
                flashDamage();
                showHitDir(attackerAngle(b.pos.x, b.pos.z));
                if (player.hp <= 0) { gameOver(false); return; }
            }
        }
    }
}

// --- Loop zombie bersama: AI gerak per scene -> cakar -> rig -> hit peluru ---
export function updateZombies(dt, step) {
    for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];

        // Gerak/aktivasi milik scene aktif. Kontrak hasil:
        //   skip      = jauh & diam (campaign) -> lewati animasi & hit test
        //   chaseDist = jarak 2D ke player BILA cabang kejar berjalan frame ini
        const res = activeScene.zombieAI(z, dt, step) || {};
        if (res.skip) continue;

        // Serangan MENCAKAR: damage & jangkauan per zombie (varian/boss lewat
        // z.clawDmg & z.reachMul; default nilai CFG.zombie).
        if (res.chaseDist !== undefined && res.chaseDist !== null) {
            if (z.attackCd > 0) z.attackCd -= dt;
            if (res.chaseDist < player.radius + CFG.zombie.clawRange * (z.reachMul || 1)
                && z.attackCd <= 0) {
                z.attackCd = CFG.zombie.clawCooldownSec;
                z.clawT = CLAW_TIME;           // animasi sabetan (animateZombieRig)
                z.clawSide = -z.clawSide;      // lengan bergantian kiri/kanan
                if (!godMode) player.hp -= (z.clawDmg != null ? z.clawDmg : CFG.zombie.clawDamage);   // cheat: kebal
                updateUI();
                flashDamage();
                showHitDir(attackerAngle(z.mesh.position.x, z.mesh.position.z));
                playSFX(sfxZombieBite);   // sabetan cakar...
                playSFX(sfxHit);          // ...plus jeritan player (jokowi-kaget)
                if (player.hp <= 0) { gameOver(false); return; }
            }
        }

        animateZombieRig(z, dt);   // jalan/lompat prosedural

        // Tabrakan peluru (berlaku saat melompat, idle, maupun mengejar): sweep
        // SEGMEN posisi-lalu -> posisi-kini (anti tembus point-blank / fps rendah).
        // TOP-DOWN: hit test HORIZONTAL (bidang xz, y diabaikan) — bidik hanya
        // menyamping & semua entitas menapak tanah; kalau y dipakai, hitbox pendek
        // seperti runner (kecil, pusat rendah) lolos DI BAWAH lintasan peluru
        // setinggi laras dan mustahil ditembak dari depan. Damage per peluru dibawa
        // b.damage (rifle/pistol/shotgun beda). Radius diskalakan z.scl (runner/brute/boss).
        const scl = z.scl || 1;
        const hitR = (z.isModel ? CFG.zombie.bodyHitRadius : 4.5) * scl;
        const hitY = z.mesh.position.y + (z.isModel ? 6 : 0) * scl;   // tinggi percikan darah (visual)
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            const bx = b.mesh.position.x, bz = b.mesh.position.z;
            if (segPointDist2(b.px, 0, b.pz, bx, 0, bz,
                z.mesh.position.x, 0, z.mesh.position.z) < hitR * hitR) {
                // Peluru Grenade Launcher: MELEDAK saat kena zombie (AoE, bukan hit
                // tunggal). Antre boom (explodeAt di sini = splice reentrant zombies)
                // -> diproses processPendingBooms setelah loop. friendly (tak lukai player).
                if (b.explosive) {
                    queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false);
                    scene.remove(b.mesh); bullets.splice(j, 1);
                    continue;
                }
                const base = (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
                stats.hits++;
                z.hp -= base;
                // Semburan darah di titik tumbuk = titik terdekat lintasan peluru
                // (xz) ke pusat zombie, pada ketinggian badan hitY — muncrat searah peluru.
                const abx = bx - b.px, abz = bz - b.pz;
                const al2 = abx * abx + abz * abz;
                const at = al2 > 0 ? clamp(((z.mesh.position.x - b.px) * abx
                    + (z.mesh.position.z - b.pz) * abz) / al2, 0, 1) : 0;
                spawnBloodBurst(b.px + abx * at, hitY, b.pz + abz * at, b.dir.x, b.dir.z, 3, 0.6);
                scene.remove(b.mesh);
                bullets.splice(j, 1);
                crosshair.classList.add('hit');
                setTimeout(() => crosshair.classList.remove('hit'), 80);
                if (z.state === 'idle') { z.state = 'chasing'; z.groundY = 0; }   // tertembak = terbangun

                if (z.hp <= 0) { spawnDrop(z.mesh.position); killZombie(i); updateUI(); break; }
            }
        }
    }

    // Ledakan exploder yang antre (dari killZombie mana pun frame ini) —
    // diproses DI LUAR loop utama; lihat komentar pendingBooms.
    processPendingBooms();
}
