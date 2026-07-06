// Zombie manusia prosedural: pabrik mesh (varian profesi), animasi rig, daur
// hidup (kill/dispose), dan loop update bersama. Logika GERAK per mode
// (kejar+vault survival / idle+aktivasi campaign) milik scene aktif lewat
// hook scene.zombieAI(z, dt, step) — modul ini menangani bagian yang sama di
// semua scene: cakaran, animasi rig, dan hit test peluru.

import { CFG } from '../core/config.js';
import { player, zombies, bullets, addScore, stats, _dir } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { makeTexture, speckle } from '../utils/textures.js';
import { rand, clamp, segPointDist2 } from '../utils/math.js';
import { playSFX, sfxZombieBite, sfxHit } from '../utils/sfx.js';
import { crosshair, flashDamage, showHitDir } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { spawnGroundPuff, spawnBlood, explodeAt } from './effects.js';
import { spawnDrop } from './drops.js';
import { gameOver } from '../core/game.js';

// Ceritanya: warga biasa yang diubah alien. Dibangun dari balok (tanpa file
// model), dengan varian penampilan: warga, pekerja proyek, polisi, pedagang,
// penjaga toko, pekerja kantoran.
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

// Sudut penyerang relatif hadap kamera (0 = depan, + = searah jarum jam di
// layar) — dipakai indikator arah serangan (showHitDir). Diekspor utk dipakai
// juga oleh serangan non-cakar (ledakan exploder).
export function attackerAngle(ax, az) {
    camera.getWorldDirection(_dir);
    const dx = ax - camera.position.x, dz = az - camera.position.z;
    return Math.atan2(_dir.x * dz - _dir.z * dx, _dir.x * dx + _dir.z * dz);
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

// Warnai ulang seluruh material 1 zombie (per-instance, aman) — pembeda
// visual varian: exploder kehijauan menyala, brute/boss lebih gelap.
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

// Geometri bersama bagian tubuh (dipakai ulang antar instance; JANGAN
// di-dispose saat zombie mati — hanya materialnya yang per-instance).
const ZG = {
    torso: new THREE.BoxGeometry(3.8, 4.6, 2.0),
    head: new THREE.BoxGeometry(2.4, 2.4, 2.4),
    thigh: new THREE.BoxGeometry(1.5, 3.0, 1.6),
    shin: new THREE.BoxGeometry(1.3, 2.6, 1.4),
    foot: new THREE.BoxGeometry(1.4, 0.7, 2.3),
    arm: new THREE.BoxGeometry(1.1, 4.0, 1.2),
    hand: new THREE.BoxGeometry(1.0, 1.0, 1.0),
    vest: new THREE.BoxGeometry(4.15, 3.3, 2.35),     // rompi (pekerja/penjaga toko)
    stripe: new THREE.BoxGeometry(4.25, 0.4, 2.45),   // strip reflektif rompi
    apron: new THREE.BoxGeometry(3.4, 4.2, 0.3),      // celemek pedagang
    capTop: new THREE.BoxGeometry(2.6, 0.9, 2.6),     // topi dinas polisi
    capBrim: new THREE.BoxGeometry(2.4, 0.25, 1.1),
    helmet: new THREE.CylinderGeometry(1.5, 1.75, 1.3, 10),   // helm proyek
    caping: new THREE.ConeGeometry(2.8, 1.5, 10),     // caping pedagang
    tie: new THREE.BoxGeometry(0.55, 2.2, 0.15),      // dasi kantoran
    badge: new THREE.BoxGeometry(0.55, 0.65, 0.15),   // lencana polisi
    tag: new THREE.BoxGeometry(0.75, 0.4, 0.12),      // papan nama penjaga toko
};

let zombieFaceTex = null;   // tekstur wajah bersama (dibuat sekali, saat spawn pertama)

// Wajah zombie (tekstur bersama; di-tint warna kulit lewat material.color)
function drawZombieFace(g, w, h) {
    g.fillStyle = '#cfd6c2'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, ['#8a9377', '#a75b4a', '#6d7a5e'], 40, 2, 6);   // luka & noda busuk
    g.fillStyle = '#161a12';                                          // rongga mata cekung
    g.fillRect(12, 22, 14, 12); g.fillRect(38, 22, 14, 12);
    g.fillStyle = '#dfe8cd';                                          // pupil pucat kosong
    g.fillRect(16, 26, 5, 5); g.fillRect(43, 26, 5, 5);
    g.fillStyle = '#221010';                                          // mulut menganga
    g.fillRect(20, 44, 24, 8);
    g.fillStyle = '#7c3a34';
    g.fillRect(22, 46, 20, 4);
    g.fillStyle = 'rgba(110,28,24,0.85)';                             // darah menetes
    g.fillRect(28, 52, 5, 10);
}

// Bangun 1 zombie manusia (varian profesi acak). Material dibuat per-instance
// agar jitter grime (offsetHSL) tiap zombie unik & dispose aman; geometri dibagi (ZG).
// Rig pivot pinggul/lutut/bahu/kepala digerakkan animateZombieRig; menghadap +Z
// (di-lookAt ke player oleh AI), kaki di y=0.
export function buildHumanZombie() {
    if (!zombieFaceTex) zombieFaceTex = makeTexture(64, 64, drawZombieFace);
    const V = ZOMBIE_VARIANTS[(Math.random() * ZOMBIE_VARIANTS.length) | 0];
    const skinTone = ZOMBIE_SKIN_TONES[(Math.random() * ZOMBIE_SKIN_TONES.length) | 0];
    const mat = (hex) => new THREE.MeshLambertMaterial({
        color: new THREE.Color(hex).offsetHSL(0, 0, rand(-0.05, 0.03))   // kumal, tiap zombie beda
    });
    const skin = mat(skinTone);
    const shirt = mat(V.shirts[(Math.random() * V.shirts.length) | 0]);
    const pants = mat(V.pants), shoes = mat(V.shoes);

    const group = new THREE.Group();   // outer: di-lookAt AI
    const inner = new THREE.Group();   // bob badan naik-turun
    group.add(inner);
    // shadow=false utk bagian kecil (sepatu/tangan/aksesori): memangkas draw
    // call depth pass ~50% per zombie tanpa mengubah siluet bayangan yang
    // terlihat (torso/kepala/paha/betis/lengan tetap jadi caster).
    const mk = (geo, m, x, y, z, parent, shadow = true) => {
        const b = new THREE.Mesh(geo, m);
        b.position.set(x, y, z);
        b.castShadow = shadow;
        parent.add(b);
        return b;
    };

    mk(ZG.torso, shirt, 0, 7.9, 0, inner);
    // Kepala: wajah bertekstur di sisi depan (+Z, indeks material 4)
    const headG = new THREE.Group();
    headG.position.set(0, 10.3, 0);
    inner.add(headG);
    const faceMat = new THREE.MeshLambertMaterial({ color: skinTone, map: zombieFaceTex });
    const head = new THREE.Mesh(ZG.head, [skin, skin, skin, skin, faceMat, skin]);
    head.position.y = 1.2;
    head.castShadow = true;
    headG.add(head);

    // Kaki: pivot pinggul -> paha; pivot lutut -> betis + sepatu
    const mkLeg = (sx) => {
        const hip = new THREE.Group(); hip.position.set(sx, 5.7, 0); inner.add(hip);
        mk(ZG.thigh, pants, 0, -1.5, 0, hip);
        const knee = new THREE.Group(); knee.position.set(0, -3.0, 0); hip.add(knee);
        mk(ZG.shin, pants, 0, -1.3, 0, knee);
        mk(ZG.foot, shoes, 0, -2.45, 0.45, knee, false);
        return { hip, knee };
    };
    const legL = mkLeg(-1.0), legR = mkLeg(1.0);
    // Lengan: pivot bahu (pose dasar menjulur ke depan khas zombie, di animateZombieRig)
    const mkArm = (sx) => {
        const sh = new THREE.Group(); sh.position.set(sx, 9.7, 0); inner.add(sh);
        mk(ZG.arm, shirt, 0, -1.9, 0, sh);
        mk(ZG.hand, skin, 0, -4.2, 0, sh, false);
        return sh;
    };
    const armL = mkArm(-2.45), armR = mkArm(2.45);

    // Aksesori pembeda profesi
    if (V.acc === 'worker') {
        mk(ZG.vest, mat(0xd97b1f), 0, 8.4, 0, inner, false);          // rompi keselamatan oranye
        mk(ZG.stripe, mat(0xd8d8ca), 0, 7.7, 0, inner, false);        // strip reflektif
        mk(ZG.helmet, mat(0xe8c11c), 0, 2.5, 0, headG, false);        // helm proyek kuning
    } else if (V.acc === 'police') {
        mk(ZG.capTop, mat(0x4a3a28), 0, 2.55, 0, headG, false);       // topi dinas
        mk(ZG.capBrim, mat(0x38291c), 0, 2.25, 1.55, headG, false);
        mk(ZG.badge, mat(0xd8b03a), -1.1, 8.9, 1.06, inner, false);   // lencana emas
    } else if (V.acc === 'vendor') {
        mk(ZG.apron, mat(0x4f3a28), 0, 7.3, 1.0, inner, false);       // celemek
        mk(ZG.caping, mat(0xb99a55), 0, 2.75, 0, headG, false);       // caping anyaman
    } else if (V.acc === 'clerk') {
        mk(ZG.vest, mat(0x2f5f9f), 0, 8.4, 0, inner, false);          // rompi biru minimarket
        mk(ZG.tag, mat(0xe8e8e8), 1.05, 8.95, 1.2, inner, false);     // papan nama
    } else if (V.acc === 'office') {
        mk(ZG.tie, mat(0x7c2430), 0, 8.6, 1.05, inner, false);        // dasi
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
// geometri ZG & tekstur wajah dibagi antar zombie -> JANGAN di-dispose).
// Kepala memakai ARRAY material (wajah di sisi depan) — tangani keduanya.
export function disposeZombie(z) {
    z.mesh.traverse(o => {
        if (!o.isMesh || !o.material) return;
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose && m.dispose());
        else if (o.material.dispose) o.material.dispose();
    });
}

// Sengaja TIDAK ada umpan-balik warna luka pada zombie: player tidak boleh
// tahu zombie sudah tertembak / hampir mati — warna asli dipertahankan.

// Antrean ledakan exploder. JANGAN memanggil explodeAt langsung dari
// killZombie: explodeAt mengiterasi & men-splice array zombies yang sama —
// ledakan berantai di tengah iterasi = bug indeks. Antrean diproses SETELAH
// loop utama (processPendingBooms); ledakan berantai berjalan iteratif di sana.
const pendingBooms = [];
export function resetZombiesFx() { pendingBooms.length = 0; }   // dipanggil resetGame

export function killZombie(i) {
    const z = zombies[i];
    spawnGroundPuff(z.mesh.position.x, z.mesh.position.z, 0x5a1616, 13, z.groundY + 0.6);   // percikan (visual)
    if (z.kind === 'exploder') pendingBooms.push(z.mesh.position.clone());
    disposeZombie(z);
    scene.remove(z.mesh);
    zombies.splice(i, 1);
    stats.kills++;
    addScore(z.kind === 'boss' ? CFG.campaign.boss.score : 100);
}

// Proses ledakan exploder yang antre: visual+kill zombie sekitar (explodeAt,
// radius kecil) + MELUKAI player bila dekat (beda dgn granat player yang
// bersahabat). killZombie di dalam explodeAt bisa menambah antrean lagi
// (ledakan berantai) — loop while menuntaskannya.
function processPendingBooms() {
    while (pendingBooms.length) {
        const p = pendingBooms.shift();
        const V = CFG.zombie.variants.exploder;
        explodeAt(p, V.boomRadius);
        const d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
        if (d < V.boomRadius) {
            player.hp -= V.boomDamage;
            updateUI();
            flashDamage();
            showHitDir(attackerAngle(p.x, p.z));
            if (player.hp <= 0) { gameOver(false); return; }
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
                player.hp -= (z.clawDmg != null ? z.clawDmg : CFG.zombie.clawDamage);
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
        // KEPALA dicek lebih dulu — headshot = mati seketika (KECUALI boss:
        // z.noInstakill -> damage x headshotDamageMul); badan = hp turun.
        // Semua radius/tinggi diskalakan z.scl (runner kecil / brute / boss).
        const scl = z.scl || 1;
        const hitR = (z.isModel ? 6 : 4.5) * scl;
        const hitY = z.mesh.position.y + (z.isModel ? 6 : 0) * scl;
        const headY = z.mesh.position.y + CFG.zombie.headHeight * scl;
        const HEAD_R = CFG.zombie.headshotRadius * scl;
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            const bx = b.mesh.position.x, by = b.mesh.position.y, bz = b.mesh.position.z;
            const isHead = z.isModel &&
                segPointDist2(b.px, b.py, b.pz, bx, by, bz,
                    z.mesh.position.x, headY, z.mesh.position.z) < HEAD_R * HEAD_R;
            if (isHead ||
                segPointDist2(b.px, b.py, b.pz, bx, by, bz,
                    z.mesh.position.x, hitY, z.mesh.position.z) < hitR * hitR) {
                const dmg = CFG.weapons.bulletDamage * (player.dmgMul || 1);   // upgrade shop
                stats.hits++;
                if (isHead) stats.headshots++;
                z.hp = isHead
                    ? (z.noInstakill ? z.hp - dmg * CFG.campaign.boss.headshotDamageMul : 0)
                    : z.hp - dmg;
                // Percikan darah di titik tumbuk = titik terdekat lintasan
                // peluru ke pusat bola yang kena (kepala/dada).
                const cy = isHead ? headY : hitY;
                const abx = bx - b.px, aby = by - b.py, abz = bz - b.pz;
                const al2 = abx * abx + aby * aby + abz * abz;
                const at = al2 > 0 ? clamp(((z.mesh.position.x - b.px) * abx
                    + (cy - b.py) * aby + (z.mesh.position.z - b.pz) * abz) / al2, 0, 1) : 0;
                spawnBlood(b.px + abx * at, b.py + aby * at, b.pz + abz * at);
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
