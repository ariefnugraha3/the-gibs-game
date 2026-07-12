// Robot manusia prosedural: pabrik mesh (varian profesi), animasi rig, daur
// hidup (kill/dispose), dan loop update bersama. Logika GERAK per mode
// (kejar+vault survival / idle+aktivasi campaign) milik scene aktif lewat
// hook scene.robotAI(z, dt, step) — modul ini menangani bagian yang sama di
// semua scene: cakaran, animasi rig, dan hit test peluru.

import { CFG } from '../core/config.js';
import { player, robots, bullets, enemyBullets, addScore, stats, _dir, godMode, dodgeInvuln, GEO, MAT } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { rand, clamp, segPointDist2 } from '../utils/math.js';
import { playSFX, sfxRobotBite, sfxHit } from '../utils/sfx.js';
import { crosshair, flashDamage, showHitDir } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { spawnBloodBurst, explodeAt } from './effects.js';
import { spawnCorpse, gibRobot, spawnGibs, spawnBloodDecal } from './gore.js';
import { spawnDrop } from './drops.js';
import { startPlayerDeath, isPlayerDying } from '../core/game.js';

// Ceritanya: tentara mesin pemberontak yang menyerbu Jakarta. Dibangun
// prosedural dari primitif murah (silinder + elipsoid + kotak, tanpa file
// model). Tampilan per KELAS (2026-07-12): pelat armor berwarna kelas —
// C hijau (melee), B kuning (penembak), A merah (penembak berat), boss gelap —
// plus visor & inti daya EMISIF senada supaya kelas terbaca sekilas dari atas.
const CLASS_LOOK = {
    C: { armor: 0x2f9e44, glow: 0x36ff7d },      // hijau (grunt melee)
    B: { armor: 0xd9a41c, glow: 0xffc832 },      // kuning (penembak)
    A: { armor: 0xbf2b1f, glow: 0xff5040 },      // merah (penembak berat)
    boss: { armor: 0x3a2f42, glow: 0xff2e4c },   // ungu-gelap + visor merah (raksasa melee)
};

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

// reachMul utk robot berskala: badan pejal (bodyBlockRadius x scl) MENDORONG
// player — tanpa ini kelas besar (A/boss) mendorong player keluar dari jangkauan
// cakarnya sendiri dan tak pernah bisa menyerang. Invarian dasar game
// (body 7.5 < stop 8.0 < claw 8.5) dipertahankan pada skala berapa pun:
// stop = player.radius + stopRange*reachMul harus >= body + 0.5.
// scl 1 menghasilkan tepat 1.0 (perilaku lama byte-identik).
export function reachForScale(scl, base = 1) {
    const need = (CFG.robot.bodyBlockRadius * scl + 0.5 - CFG.player.radius)
        / CFG.robot.stopRange;
    return Math.max(base, need);
}

// (tintRobot & applyClassTint DIHAPUS 2026-07-12 — warna kini DIBANGUN langsung
// per kelas di buildRobotMesh lewat CLASS_LOOK; boss juga lewat jalur yang sama.)

// Elipsoid (sphere di-skala) — bentuk membulat murah untuk kepala/sendi/telapak.
// geo.scale membakukan skala ke vertex (tetap satu geometri berbagi antar instance).
function ellipGeo(r, sx, sy, sz, ws = 8, hs = 6) {
    const g = new THREE.SphereGeometry(r, ws, hs);
    g.scale(sx, sy, sz);
    return g;
}
// Geometri bersama suku cadang MESIN (dipakai ulang antar instance; JANGAN
// di-dispose saat robot mati — hanya materialnya yang per-instance).
// OVERHAUL 2026-07-12: tubuh manusia diganti RANGKA ROBOT (pelat armor, sendi
// bola, piston, visor & inti daya emisif). Pivot rig & tinggi TIDAK berubah
// (animateRobotRig byte-identik; gore.js membaca pivot yang sama). Hit-test
// tetap horizontal CFG.bodyHitRadius.
const RG = {
    // Torso rangka (silinder meruncing dipipihkan) + pelat dada armor + panggul
    torso: (() => { const g = new THREE.CylinderGeometry(1.5, 1.0, 4.4, 10, 1); g.scale(1, 1, 0.68); return g; })(),
    chest: ellipGeo(1.32, 1.42, 0.95, 0.6, 10, 6),        // pelat dada (warna kelas)
    pelvis: ellipGeo(0.92, 1.32, 0.6, 0.95, 8, 5),        // blok panggul
    core: ellipGeo(0.4, 1.0, 1.3, 0.7, 8, 5),             // inti daya emisif (dada)
    pack: new THREE.BoxGeometry(1.85, 2.3, 0.95),          // ransel daya punggung
    shoulders: ellipGeo(1.0, 2.05, 0.66, 0.92, 10, 6),    // yoke bahu
    pad: ellipGeo(0.7, 1.05, 0.8, 1.0, 8, 5),             // bantalan bahu (anak pivot lengan)
    neck: new THREE.CylinderGeometry(0.34, 0.46, 0.9, 8),
    // Kepala: tabung + tutup membulat + celah visor emisif + antena (penembak)
    head: (() => { const g = new THREE.CylinderGeometry(0.95, 1.05, 1.8, 10, 1); g.scale(1, 1, 0.9); return g; })(),
    crown: ellipGeo(1.0, 0.98, 0.55, 0.9, 10, 5),
    visor: new THREE.BoxGeometry(1.5, 0.42, 0.5),
    antenna: new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5),
    antennaTip: ellipGeo(0.16, 1, 1, 1, 6, 4),
    // Lengan: aktuator silinder + siku bola; ujung = CAKAR (melee) / SENAPAN (ranged)
    arm: new THREE.CylinderGeometry(0.46, 0.36, 3.7, 8),
    elbow: ellipGeo(0.5, 1, 1, 1, 7, 5),
    claw: new THREE.ConeGeometry(0.52, 1.35, 6),
    // SENAPAN robot penembak (2026-07-12 — dipegang di tangan kanan, bukan
    // "meriam lengan" samar): receiver + laras + moncong + magasin + popor
    gunBody: new THREE.BoxGeometry(0.46, 0.66, 2.4),
    gun: new THREE.CylinderGeometry(0.14, 0.14, 1.9, 8),         // laras
    gunMuzzle: new THREE.CylinderGeometry(0.24, 0.24, 0.45, 8),  // moncong laras
    gunMag: new THREE.BoxGeometry(0.26, 0.85, 0.5),
    gunStock: new THREE.BoxGeometry(0.38, 0.55, 1.0),
    // Kaki: paha/betis silinder + sendi pinggul bola + pelindung lutut + telapak
    thigh: new THREE.CylinderGeometry(0.64, 0.5, 3.0, 8),
    hipBall: ellipGeo(0.62, 1, 1, 1, 7, 5),
    kneePad: ellipGeo(0.56, 1.0, 0.85, 1.0, 7, 5),
    shin: new THREE.CylinderGeometry(0.42, 0.58, 2.7, 8),
    foot: ellipGeo(0.62, 1.1, 0.55, 1.85, 7, 5),
};

// Bangun 1 robot per KELAS ('C'|'B'|'A'|'boss'). Material dibuat per-instance
// (jitter keausan offsetHSL tiap unit beda + dispose aman); geometri dibagi (RG).
// Rig pivot pinggul/lutut/bahu/kepala digerakkan animateRobotRig; menghadap +Z
// (di-lookAt ke player oleh AI), kaki di y=0. Penembak (B/A) diberi LENGAN
// MERIAM kanan + antena; melee (C/boss) bertangan cakar.
export function buildRobotMesh(cls = 'C') {
    const L = CLASS_LOOK[cls] || CLASS_LOOK.C;
    const mat = (hex) => new THREE.MeshLambertMaterial({
        color: new THREE.Color(hex).offsetHSL(0, 0, rand(-0.045, 0.035))   // aus/kusam, tiap unit beda
    });
    const armor = mat(L.armor);           // pelat warna kelas (C hijau / B kuning / A merah)
    const metal = mat(0x7c848c);          // rangka logam terang
    const joint = mat(0x23262b);          // sendi/aktuator gelap
    const dark = mat(0x14171b);           // laras/telapak/ransel
    // Visor + inti daya menyala warna kelas (Lambert emissive = program sama, tanpa recompile)
    const glow = new THREE.MeshLambertMaterial({ color: 0x0c0e10, emissive: new THREE.Color(L.glow) });

    const group = new THREE.Group();   // outer: di-lookAt AI
    const inner = new THREE.Group();   // bob badan naik-turun
    group.add(inner);
    // shadow=false utk bagian kecil: memangkas draw call depth pass tanpa
    // mengubah siluet bayangan (torso/kepala/paha/betis/lengan tetap caster).
    const mk = (geo, m, x, y, z, parent, shadow = true) => {
        const b = new THREE.Mesh(geo, m);
        b.position.set(x, y, z);
        b.castShadow = shadow;
        parent.add(b);
        return b;
    };

    // Torso rangka + pelat dada armor + panggul + inti daya menyala + ransel daya
    mk(RG.torso, metal, 0, 7.9, 0, inner);
    mk(RG.chest, armor, 0, 8.55, 0.42, inner, false);
    mk(RG.pelvis, joint, 0, 5.6, 0, inner, false);
    mk(RG.core, glow, 0, 7.35, 1.0, inner, false);
    mk(RG.pack, dark, 0, 8.2, -1.28, inner, false);
    mk(RG.shoulders, joint, 0, 9.75, 0, inner, false);
    mk(RG.neck, dark, 0, 10.0, 0, inner, false);

    // Kepala: tabung sensor + tutup armor + CELAH VISOR menyala (identitas kelas)
    const headG = new THREE.Group();
    headG.position.set(0, 10.3, 0);
    inner.add(headG);
    mk(RG.head, metal, 0, 1.15, 0, headG);
    mk(RG.crown, armor, 0, 2.05, 0, headG, false);
    mk(RG.visor, glow, 0, 1.3, 0.82, headG, false);
    if (cls === 'B' || cls === 'A') {   // antena penembak (penanda kelas ranged)
        mk(RG.antenna, dark, 0.72, 2.7, -0.2, headG, false);
        mk(RG.antennaTip, glow, 0.72, 3.4, -0.2, headG, false);
    }

    // Kaki: pivot pinggul -> paha; pivot lutut -> betis + pelindung lutut + telapak
    const mkLeg = (sx) => {
        const hip = new THREE.Group(); hip.position.set(sx, 5.7, 0); inner.add(hip);
        mk(RG.hipBall, joint, 0, 0, 0, hip, false);
        mk(RG.thigh, armor, 0, -1.5, 0, hip);
        const knee = new THREE.Group(); knee.position.set(0, -3.0, 0); hip.add(knee);
        mk(RG.kneePad, joint, 0, 0.12, 0.28, knee, false);
        mk(RG.shin, metal, 0, -1.35, 0, knee);
        mk(RG.foot, dark, 0, -2.5, 0.5, knee, false);
        return { hip, knee };
    };
    const legL = mkLeg(-1.0), legR = mkLeg(1.0);

    // Lengan: pivot bahu (pose dasar per kelas di animateRobotRig).
    // SENAPAN DIPEGANG utk kelas penembak — grup senjata diputar 90° sehingga
    // larasnya searah lengan yang menodong (terbaca jelas dari atas; peluru
    // musuh spawn dari muzzle ujung laras). Kelas B = senapan di TANGAN KANAN
    // saja; kelas A = DUA senapan (kiri & kanan, menembak bergantian —
    // 2026-07-12). Lengan tanpa senapan = tangan cakar.
    const mkArm = (sx, gunArm) => {
        const sh = new THREE.Group(); sh.position.set(sx, 9.6, 0); inner.add(sh);
        mk(RG.pad, armor, 0, 0.18, 0, sh, false);
        mk(RG.arm, metal, 0, -1.95, 0, sh);
        mk(RG.elbow, joint, 0, -2.05, 0, sh, false);
        let mz = null;
        if (gunArm) {
            // Grup senapan di "tangan": +Z lokal grup = arah -Y lengan (menjulur)
            const gunG = new THREE.Group();
            gunG.position.set(0, -3.9, 0.1);
            gunG.rotation.x = Math.PI / 2;
            sh.add(gunG);
            mk(RG.gunBody, dark, 0, 0.05, 0.4, gunG, false);
            mk(RG.gun, dark, 0, 0.12, 2.4, gunG, false).rotation.x = Math.PI / 2;   // laras (silinder sb-Y -> rebah sb-Z)
            mk(RG.gunMuzzle, joint, 0, 0.12, 3.4, gunG, false).rotation.x = Math.PI / 2;
            mk(RG.gunMag, armor, 0, -0.6, 0.55, gunG, false).rotation.x = 0.2;
            mk(RG.gunStock, dark, 0, -0.05, -1.05, gunG, false);
            mz = new THREE.Object3D();
            mz.position.set(0, 0.12, 3.7);   // ujung laras = titik spawn peluru musuh
            gunG.add(mz);
        } else {
            mk(RG.claw, dark, 0, -4.4, 0, sh, false).rotation.x = Math.PI;   // ujung cakar menghadap bawah
        }
        return { sh, mz };
    };
    const isRanged = cls === 'B' || cls === 'A';
    const dual = cls === 'A';   // kelas A: dua senapan
    const aL = mkArm(-2.05, dual), aR = mkArm(2.05, isRanged);
    const armL = aL.sh, armR = aR.sh;

    return {
        group,
        // muzzle = ujung laras senapan KANAN, muzzleL = KIRI (kelas A saja);
        // null utk lengan cakar — titik spawn peluru musuh.
        rig: { inner, thighL: legL.hip, thighR: legR.hip, shinL: legL.knee, shinR: legR.knee, armL, armR, head: headG, muzzle: aR.mz, muzzleL: aL.mz }
    };
}

// Animasi jalan/lompat prosedural pada pivot rig robot manusia.
// Rig dibangun menghadap +Z dan grup di-lookAt ke player, jadi sumbu lateral
// tubuh = sumbu X lokal tiap pivot — cukup putar rotation.x (tanpa quaternion).
export function animateRobotRig(z, dt) {
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
        if (!z.ranged) {
            r.armL.rotation.x = -1.15 + s2 * 0.06;
            r.armR.rotation.x = -1.15 - s2 * 0.06;
        }
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
        if (!z.ranged) {
            r.armL.rotation.x = -1.15 + s * AR;      // pose dasar melee: lengan menjulur ke depan
            r.armR.rotation.x = -1.15 - s * AR;
        }
        r.head.rotation.z = Math.sin(z.phase * 0.5) * 0.08;
        r.inner.position.y = Math.abs(s) * 1.2;
    }

    // ===== Lengan robot PENEMBAK (2026-07-12): menggantung + ayun saat jalan,
    // TERANGKAT MENGACUNGKAN senapan saat membidik (z.aiming di-set scene AI;
    // di-lerp via z.aimT), dan HENTAKAN RECOIL laras naik sesaat saat menembak
    // (z.recoilT/z.recoilSide dari fireRobotBullet) — tak lagi memakai overlay
    // cakar yang tampak "mencakar ke bawah". B: hanya TANGAN KANAN yang naik
    // (kiri tetap di bawah); A: DUA lengan bersenapan naik, recoil bergantian
    // sesuai laras yang menembak. =====
    if (z.ranged) {
        z.aimT = (z.aimT || 0) + ((z.aiming ? 1 : 0) - (z.aimT || 0)) * Math.min(1, dt * 8);
        if (z.recoilT > 0) z.recoilT -= dt;
        const s = Math.sin(z.phase);
        const swing = z.moving === false ? s * 0.05 : s * 0.35;   // ayunan saat jalan / sway kecil
        const AIM = -1.52;                                        // lengan mengacung horizontal
        const kick = z.recoilT > 0 ? Math.sin(Math.PI * (1 - z.recoilT / 0.25)) * 0.38 : 0;
        // Kanan: selalu bersenapan (B & A) — naik saat membidik + recoil miliknya
        r.armR.rotation.x = (-0.12 - swing) * (1 - z.aimT) + AIM * z.aimT
            - (z.recoilSide !== -1 ? kick : 0);
        r.armR.rotation.z = 0;
        // Kiri: A = senapan kedua (ikut mengacung, recoil saat gilirannya);
        // B = TETAP DI BAWAH (hanya mengayun mengikuti langkah).
        r.armL.rotation.x = z.kind === 'A'
            ? (-0.12 + swing) * (1 - z.aimT) + AIM * z.aimT - (z.recoilSide === -1 ? kick : 0)
            : -0.12 + swing;
        r.armL.rotation.z = 0;
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

// Buang material milik 1 robot (semua dibuat per-instance -> aman di-dispose;
// geometri RG dibagi antar robot -> JANGAN di-dispose). Tetap tangani material
// ARRAY (jaga-jaga bila ada bagian multi-material di masa depan).
export function disposeRobot(z) {
    z.mesh.traverse(o => {
        if (!o.isMesh || !o.material) return;
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose && m.dispose());
        else if (o.material.dispose) o.material.dispose();
    });
}

// ===== SELEBRASI KEMENANGAN ROBOT (2026-07-12) =====
// Player tumbang -> tiap robot BERHENTI menyerang, menoleh ke jasadnya, lalu
// BERSORAK-SORAI: kedua lengan mengacung ke langit memompa ("HOREEE" — senapan
// kelas B/A ikut teracung seperti pawai kemenangan), melompat-lompat girang,
// kepala mendongak riang. Delay tersadar + tempo + tinggi lompatan + gaya
// (serempak vs melambai bergantian) DIACAK per robot sehingga sorakan MENJALAR
// di kerumunan seperti selebrasi nyata, bukan koreografi serempak. Semua pose
// ditulis lewat pendekatan eksponensial -> transisi mulus dari pose berjalan/
// membidik/mencakar apa pun, tanpa snap. Visual murni: tidak menyentuh logika.
const _wrapA = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
function celebrateRobot(z, dt) {
    const r = z.rig;
    if (!r) return;
    if (z.celebT == null) {   // frame selebrasi pertama robot ini: tancapkan variasi
        z.celebT = -(0.1 + Math.random() * 0.8);   // < 0 = jeda "tersadar" (sorak menjalar)
        z.celebRate = 5.5 + Math.random() * 3.5;   // tempo pompa lengan
        z.celebPhase = Math.random() * 6.283;
        z.celebHop = 1.4 + Math.random() * 1.8;    // tinggi lompatan girang
        z.celebAlt = Math.random() < 0.35;         // 35%: melambai bergantian, sisanya pompa serempak
        z.aiming = false; z.clawT = 0; z.recoilT = 0; z.moving = false;
    }
    z.celebT += dt;
    const damp = Math.min(1, dt * 6), snap = Math.min(1, dt * 10);

    // Menoleh HALUS ke arah jasad player (grup robot menghadap +Z, spt lookAt scene)
    const want = Math.atan2(camera.position.x - z.mesh.position.x,
        camera.position.z - z.mesh.position.z);
    const dy = _wrapA(want - z.mesh.rotation.y), mx = dt * 5;
    z.mesh.rotation.y = Math.abs(dy) <= mx ? want : z.mesh.rotation.y + Math.sign(dy) * mx;
    z.mesh.rotation.x = 0; z.mesh.rotation.z = 0;

    if (z.celebT < 0) {
        // Fase TERSADAR: berhenti sejenak, badan tegak, lengan turun — jeda
        // hening kecil sebelum meledak bersorak (per robot beda, efek menjalar).
        r.thighL.rotation.x += (0 - r.thighL.rotation.x) * damp;
        r.thighR.rotation.x += (0 - r.thighR.rotation.x) * damp;
        r.shinL.rotation.x += (0 - r.shinL.rotation.x) * damp;
        r.shinR.rotation.x += (0 - r.shinR.rotation.x) * damp;
        r.armL.rotation.x += (-0.2 - r.armL.rotation.x) * damp;
        r.armR.rotation.x += (-0.2 - r.armR.rotation.x) * damp;
        r.armL.rotation.z += (0 - r.armL.rotation.z) * damp;
        r.armR.rotation.z += (0 - r.armR.rotation.z) * damp;
        r.inner.position.y += (0 - r.inner.position.y) * damp;
        z.mesh.position.y += ((z.groundY || 0) - z.mesh.position.y) * damp;
        return;
    }

    const t = z.celebT * z.celebRate + z.celebPhase;
    // Lompatan girang: separuh siklus DI UDARA (parabola |sin|), separuh
    // MENAPAK (ketukan berdiri) -> ritme sorak yang alami, tidak melayang terus.
    const hopS = Math.sin(t * 0.38);
    const legK = Math.max(0, hopS);   // 0 = menapak, 1 = puncak lompatan
    z.mesh.position.y += (((z.groundY || 0) + Math.pow(legK, 0.7) * z.celebHop)
        - z.mesh.position.y) * snap;

    // Kedua lengan MENGACUNG KE LANGIT memompa; merentang huruf V kemenangan.
    const pumpL = Math.sin(t);
    const pumpR = z.celebAlt ? Math.sin(t + Math.PI) : pumpL;
    const UP = -2.75;   // hampir lurus ke atas (0 = menggantung, -1.52 = horizontal)
    r.armL.rotation.x += ((UP + pumpL * 0.32) - r.armL.rotation.x) * snap;
    r.armR.rotation.x += ((UP + pumpR * 0.32) - r.armR.rotation.x) * snap;
    r.armL.rotation.z += (0.38 - r.armL.rotation.z) * damp;
    r.armR.rotation.z += (-0.38 - r.armR.rotation.z) * damp;

    // Kaki: menekuk saat menapak (per siap melompat), terlipat kecil di udara.
    const thigh = -0.5 * legK - 0.12 * (1 - legK);
    const shin = 0.65 * legK + 0.2 * (1 - legK);
    r.thighL.rotation.x += (thigh - r.thighL.rotation.x) * snap;
    r.thighR.rotation.x += (thigh - r.thighR.rotation.x) * snap;
    r.shinL.rotation.x += (shin - r.shinL.rotation.x) * snap;
    r.shinR.rotation.x += (shin - r.shinR.rotation.x) * snap;

    // Badan membusung + KEPALA MENDONGAK bersorak, goyang riang kiri-kanan.
    r.inner.position.y += ((legK * 0.9) - r.inner.position.y) * snap;
    r.inner.rotation.x += (-0.1 - r.inner.rotation.x) * damp;
    r.head.rotation.x += ((-0.3 + Math.sin(t * 1.35) * 0.07) - r.head.rotation.x) * snap;
    r.head.rotation.z += ((Math.sin(t * 0.7) * 0.1) - r.head.rotation.z) * snap;
}

// Sengaja TIDAK ada umpan-balik warna luka pada robot: player tidak boleh
// tahu robot sudah tertembak / hampir mati — warna asli dipertahankan.

// Antrean ledakan. JANGAN memanggil explodeAt langsung dari killRobot / loop
// hit peluru: explodeAt mengiterasi & men-splice array robots yang sama —
// ledakan berantai di tengah iterasi = bug indeks. Antrean diproses SETELAH
// loop utama (processPendingBooms); ledakan berantai berjalan iteratif di sana.
// Dipakai peluru Grenade Launcher (bullets.js/robots.js, friendly = tak melukai
// player). Param hurtPlayer disediakan (dulu utk exploder, dihapus 2026-07-12).
// Entri: { pos, r, hurtPlayer, playerDmg, dmg }. dmg opsional = damage AoE ke
// robot (null -> default CFG.grenade.damage di explodeAt); peluru launcher
// meneruskan b.damage-nya (sudah termasuk bonus level upgrade shop).
const pendingBooms = [];
export function queueBoom(x, y, z, r, hurtPlayer = false, playerDmg = 0, dmg = null) {
    pendingBooms.push({ pos: new THREE.Vector3(x, y, z), r, hurtPlayer, playerDmg, dmg });
}
export function resetRobotsFx() { pendingBooms.length = 0; }   // dipanggil resetGame

// Skor per kematian: boss = `CFG.campaign.boss.score`; selain itu dari
// `CFG.robot.score` — special = kelas penembak A/B (150), normal = kelas C (100).
function robotScore(z) {
    if (z.kind === 'boss') return CFG.campaign.boss.score;
    const S = CFG.robot.score;
    return (z.kind === 'A' || z.kind === 'B') ? S.specialKill : S.normalKill;
}

// Kematian robot (GORE 2026-07-11; re-tema COOLANT 2026-07-12): TIDAK lenyap
// seketika — robot dikeluarkan dari daftar HIDUP lalu diserahkan ke sistem gore
// (mesh-nya di-reuse jadi BANGKAI yang terjatuh + memudar). Cairan COOLANT hijau
// MUNCRAT & anggota mesin TERLEPAS; ledakan (opts.cause==='explosion')
// MENGHANCURKAN rangka (dismember penuh). opts.dirx/dirz = arah damage
// (peluru/melee/keluar-ledakan) → arah semburan & lemparan gib.
export function killRobot(i, opts = {}) {
    const z = robots[i];
    robots.splice(i, 1);          // keluar dari daftar HIDUP DULU (mayat jadi inert: tak ber-AI/pejal/kena tembak)
    stats.kills++;
    addScore(robotScore(z));

    const p = z.mesh.position, scl = z.scl || 1;
    const dirx = opts.dirx != null ? opts.dirx : (Math.random() - 0.5);
    const dirz = opts.dirz != null ? opts.dirz : (Math.random() - 0.5);
    const restY = (z.groundY || 0) + 0.3;
    const bodyY = p.y + 7 * scl;   // sekitar dada

    if (opts.cause === 'explosion') {
        // HANCUR TOTAL: cairan COOLANT hijau menyembur ke SEGALA arah + berlapis,
        // anggota mesin TERBANG, serpihan logam ekstra berhamburan, genangan
        // coolant TERCECER di sekitar.
        spawnBloodBurst(p.x, bodyY, p.z, dirx, dirz, 34, 2.0, 6.283);       // 360° deras
        spawnBloodBurst(p.x, p.y + 3 * scl, p.z, dirx, dirz, 18, 1.2, 6.283); // lapisan rendah menyebar
        gibRobot(z.rig, z.mesh, 'heavy', dirx, dirz, restY);              // anggota mesin lepas
        spawnGibs(p.x, bodyY, p.z, 10, dirx, dirz, 1.8, 0x3d444c, restY);  // + serpihan logam ekstra
        spawnCorpse(z.mesh, z.rig, { dirx, dirz, dur: 1.2, fast: true });
        // genangan coolant TERCECER di sekitar titik ledak (bukan cuma satu di tengah)
        spawnBloodDecal(p.x, p.z, 4 + Math.random() * 3);
        for (let d = 0; d < 8; d++) {
            const a = Math.random() * 6.283, r = (2 + Math.random() * 15) * scl;
            spawnBloodDecal(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 1.8 + Math.random() * 3);
        }
    } else {
        spawnBloodBurst(p.x, bodyY, p.z, dirx, dirz, 9, 1.0);          // muncratan coolant
        gibRobot(z.rig, z.mesh, 'light', dirx, dirz, restY);          // kadang satu anggota lepas
        spawnCorpse(z.mesh, z.rig, { dirx, dirz });
        spawnBloodDecal(p.x, p.z, 3 + Math.random() * 2);             // genangan di titik mati
    }
}

// Proses ledakan yang antre: visual+kill robot sekitar (explodeAt). Peluru
// Grenade Launcher friendly (hurtPlayer=false). killRobot di dalam explodeAt bisa
// menambah antrean lagi (ledakan berantai) — loop while menuntaskannya. (Cabang
// hurtPlayer kini tak terpakai — satu-satunya pemakainya, exploder, dihapus.)
function processPendingBooms() {
    while (pendingBooms.length) {
        const b = pendingBooms.shift();
        explodeAt(b.pos, b.r, b.dmg);
        if (b.hurtPlayer && !dodgeInvuln && player.hp > 0) {   // i-frame dodge / sudah tumbang: ledakan meleset
            const d = Math.hypot(b.pos.x - camera.position.x, b.pos.z - camera.position.z);
            if (d < b.r) {
                if (!godMode) player.hp -= b.playerDmg;   // cheat: kebal (tetap flash spt semula)
                // DARAH MERAH player terlempar keluar dari pusat ledakan
                spawnBloodBurst(camera.position.x, camera.position.y - 3, camera.position.z,
                    camera.position.x - b.pos.x, camera.position.z - b.pos.z,
                    8, 1.0, 1.8, PLAYER_BLOOD_HEX);
                updateUI();
                flashDamage();
                showHitDir(attackerAngle(b.pos.x, b.pos.z));
                // sekuens kematian (roboh menjauhi ledakan); antrean boom tetap dituntaskan
                if (player.hp <= 0)
                    startPlayerDeath(camera.position.x - b.pos.x, camera.position.z - b.pos.z);
            }
        }
    }
}

// ===== Serangan JARAK JAUH (kelas B & A, 2026-07-12) =====
// Robot penembak melepas satu peluru ke arah player. Peluru = entitas TERPISAH
// (enemyBullets) yang MELUKAI player (bukan robot). Mesh pakai GEO.bullet bersama
// + MAT.enemyBullet (merah-oranye). Dipanggil dari updateRobots saat robot ranged
// dalam jangkauan + fire cooldown habis; peluru diblok dinding via bulletBlocked.
const _ebDir = new THREE.Vector3();
const _ebPos = new THREE.Vector3();
export const PLAYER_BLOOD_HEX = 0xb51a1a;   // darah MERAH player (percikan saat player kena)
// tx/ty/tz opsional = titik sasaran (default: player). monasDmg opsional =
// peluru DITUJUKAN ke Monas — saat terblokir dinding/Monas ia memanggil hook
// scene `enemyBulletHitMonas(dmg, pos)` (survival: damageMonas). Peluru spawn
// dari UJUNG LARAS senapan robot (rig.muzzle) bila ada — fallback dada.
export function fireRobotBullet(z, tx, ty, tz, monasDmg = 0) {
    // Kelas A menembak BERGANTIAN kiri/kanan (toggle z.fireSide; delay antar
    // tembakan tetap fireDelaySec — hanya larasnya yang berganti). B/lainnya
    // selalu laras kanan.
    let mz = z.rig && z.rig.muzzle;
    let side = 1;
    if (z.kind === 'A' && z.rig && z.rig.muzzleL) {
        z.fireSide = -(z.fireSide || 1);
        if (z.fireSide < 0) { mz = z.rig.muzzleL; side = -1; }
    }
    if (mz) mz.getWorldPosition(_ebPos);
    else _ebPos.set(z.mesh.position.x, z.mesh.position.y + 8 * (z.scl || 1), z.mesh.position.z);
    const gx = tx != null ? tx : camera.position.x;
    const gz = tz != null ? tz : camera.position.z;
    const dx = gx - _ebPos.x, dz = gz - _ebPos.z;
    const d = Math.hypot(dx, dz) || 1;
    const m = new THREE.Mesh(GEO.bullet, MAT.enemyBullet);
    m.scale.setScalar(1.05);   // bola plasma biru kecil (dikecilkan dari 1.7)
    m.position.copy(_ebPos);
    scene.add(m);
    enemyBullets.push({
        mesh: m, dir: _ebDir.set(dx / d, 0, dz / d).clone(),
        speed: z.bulletSpeed, life: CFG.robot.rangedBulletLife, dmg: z.attack, monasDmg,
        px: _ebPos.x, py: _ebPos.y, pz: _ebPos.z
    });
    // RECOIL: hentakan laras NAIK sesaat pada lengan yang menembak
    // (animateRobotRig) — BUKAN lagi overlay cakar (dulu tampak "mencakar ke bawah").
    z.recoilT = 0.25;
    z.recoilSide = side;
}

// Gerak & hit peluru MUSUH -> player. Sweep segmen (anti-tunnel peluru cepat);
// i-frame dodge & god-mode = peluru MELESET (lenyap tanpa damage). Diblok
// dinding/Monas via activeScene.bulletBlocked (robot tak bisa nembak tembus tembok).
export function updateEnemyBullets(dt, step) {
    const hitR2 = player.radius * player.radius;
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.px = b.mesh.position.x; b.pz = b.mesh.position.z;
        b.mesh.position.addScaledVector(b.dir, b.speed * step);
        b.life -= step;
        // Kena player? (segmen prev->kini diproyeksikan ke xz, sama spt peluru player)
        if (segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0, b.mesh.position.z,
            camera.position.x, 0, camera.position.z) < hitR2) {
            // i-frame dodge / player sudah tumbang: peluru MELESET (lenyap tanpa efek).
            if (dodgeInvuln || player.hp <= 0) {
                scene.remove(b.mesh); enemyBullets.splice(i, 1);
                continue;
            }
            // KENA: darah + flash SELALU tampil — konsisten dgn cakar/ledakan;
            // god-mode hanya membatalkan pengurangan HP-nya, BUKAN efek visualnya
            // (dulu seluruh blok di dalam !godMode -> kena peluru tak berdarah).
            if (!godMode) player.hp -= Math.max(1, b.dmg);   // armor player belum ada
            // DARAH MERAH player muncrat searah peluru (beda dari coolant hijau robot)
            spawnBloodBurst(camera.position.x, camera.position.y - 3, camera.position.z,
                b.dir.x, b.dir.z, 10, 1.15, 1.7, PLAYER_BLOOD_HEX);
            updateUI();
            flashDamage();
            showHitDir(attackerAngle(b.px, b.pz));
            playSFX(sfxHit);
            scene.remove(b.mesh); enemyBullets.splice(i, 1);
            // HP habis -> sekuens kematian (roboh searah peluru + jeda) — GAME OVER menyusul.
            if (player.hp <= 0) startPlayerDeath(b.dir.x, b.dir.z);
            continue;
        }
        if (b.life <= 0 || activeScene.bulletBlocked(b)) {
            // Peluru bertarget MONAS yang menabrak siluet Monas/dinding -> serahkan
            // damage ke scene (survival: damageMonas + percikan). Habis-umur di
            // udara kosong tidak merusak apa pun.
            if (b.monasDmg && b.life > 0 && activeScene.enemyBulletHitMonas)
                activeScene.enemyBulletHitMonas(b.monasDmg, b.mesh.position);
            scene.remove(b.mesh); enemyBullets.splice(i, 1);
        }
    }
}

// --- Loop robot bersama: AI gerak per scene -> serang (cakar/tembak) -> rig -> hit peluru ---
export function updateRobots(dt, step) {
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];

        // ===== SELEBRASI KEMENANGAN (2026-07-12): selama sekuens kematian
        // player, SEMUA robot berhenti menyerang & bersorak (celebrateRobot) —
        // AI scene, serangan, dan rig normal dilewati. Robot campaign yang
        // masih 'idle' (dorman) tetap diam. Peluru player yang masih melayang
        // tetap diuji di bawah (adil sampai detik terakhir). =====
        if (isPlayerDying()) {
            if (z.state !== 'idle') celebrateRobot(z, dt);
        } else {
            // Gerak/aktivasi milik scene aktif. Kontrak hasil:
            //   skip      = jauh & diam (campaign) -> lewati animasi & hit test
            //   chaseDist = jarak 2D ke player BILA cabang kejar berjalan frame ini
            const res = activeScene.robotAI(z, dt, step) || {};
            if (res.skip) continue;

            // Serangan saat mengejar player. KELAS PENEMBAK (z.ranged, B/A): BERDIRI
            // di radius `z.range` (di-stop scene AI) lalu lepas peluru tiap
            // fireDelaySec — hanya bila garis pandang bebas (z.losOK dari scene AI;
            // peluru melukai player di updateEnemyBullets & diblok dinding).
            // KELAS MELEE (C/boss): sabetan cakar (damage z.clawDmg, jangkauan z.reachMul).
            if (res.chaseDist !== undefined && res.chaseDist !== null) {
                if (z.ranged) {
                    if (z.fireCd > 0) z.fireCd -= dt;
                    if (z.losOK !== false && res.chaseDist < (z.range || 70) && z.fireCd <= 0) {
                        z.fireCd = z.fireDelaySec;
                        fireRobotBullet(z);
                    }
                } else {
                    if (z.attackCd > 0) z.attackCd -= dt;
                    if (res.chaseDist < player.radius + CFG.robot.clawRange * (z.reachMul || 1)
                        && z.attackCd <= 0) {
                        z.attackCd = CFG.robot.clawCooldownSec;
                        z.clawT = CLAW_TIME;           // animasi sabetan (animateRobotRig)
                        z.clawSide = -z.clawSide;      // lengan bergantian kiri/kanan
                        playSFX(sfxRobotBite);         // swoosh sabetan (robot tetap mengayun, selalu)
                        // i-frame DODGE = serangan MELESET total (tanpa flash/damage/jeritan);
                        // player yang sudah tumbang tak dicakar lagi (sekuens kematian).
                        // (god-mode: kebal tapi tetap flash spt semula.)
                        if (!dodgeInvuln && player.hp > 0) {
                            if (!godMode) player.hp -= (z.clawDmg != null ? z.clawDmg : z.attack);   // cheat: kebal
                            // DARAH MERAH player muncrat menjauhi si pencakar
                            spawnBloodBurst(camera.position.x, camera.position.y - 3, camera.position.z,
                                camera.position.x - z.mesh.position.x, camera.position.z - z.mesh.position.z,
                                7, 0.9, 1.6, PLAYER_BLOOD_HEX);
                            updateUI();
                            flashDamage();
                            showHitDir(attackerAngle(z.mesh.position.x, z.mesh.position.z));
                            playSFX(sfxHit);          // jeritan player (jokowi-kaget)
                            // HP habis -> sekuens kematian: roboh menjauhi pencakar (GAME OVER menyusul)
                            if (player.hp <= 0) {
                                startPlayerDeath(camera.position.x - z.mesh.position.x,
                                    camera.position.z - z.mesh.position.z);
                                return;
                            }
                        }
                    }
                }
            }

            animateRobotRig(z, dt);   // jalan/lompat prosedural
        }

        // Tabrakan peluru (berlaku saat melompat, idle, maupun mengejar): sweep
        // SEGMEN posisi-lalu -> posisi-kini (anti tembus point-blank / fps rendah).
        // TOP-DOWN: hit test HORIZONTAL (bidang xz, y diabaikan) — bidik hanya
        // menyamping & semua entitas menapak tanah; kalau y dipakai, hitbox pendek
        // (robot ber-skala kecil, pusat rendah) lolos DI BAWAH lintasan peluru
        // setinggi laras dan mustahil ditembak dari depan. Damage per peluru dibawa
        // b.damage (rifle/pistol/shotgun beda). Radius diskalakan z.scl (kelas B/A/boss).
        const scl = z.scl || 1;
        const hitR = (z.isModel ? CFG.robot.bodyHitRadius : 4.5) * scl;
        const hitY = z.mesh.position.y + (z.isModel ? 6 : 0) * scl;   // tinggi percikan darah (visual)
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            const bx = b.mesh.position.x, bz = b.mesh.position.z;
            if (segPointDist2(b.px, 0, b.pz, bx, 0, bz,
                z.mesh.position.x, 0, z.mesh.position.z) < hitR * hitR) {
                // Peluru Grenade Launcher: MELEDAK saat kena robot (AoE, bukan hit
                // tunggal). Antre boom (explodeAt di sini = splice reentrant robots)
                // -> diproses processPendingBooms setelah loop. friendly (tak lukai player).
                if (b.explosive) {
                    queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage);
                    scene.remove(b.mesh); bullets.splice(j, 1);
                    continue;
                }
                const base = (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
                stats.hits++;
                z.hp -= Math.max(1, base - (z.armor || 0));   // armor = pengurang damage rata (0 utk semua kelas saat ini)
                // Semburan darah di titik tumbuk = titik terdekat lintasan peluru
                // (xz) ke pusat robot, pada ketinggian badan hitY — muncrat searah peluru.
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

                if (z.hp <= 0) { spawnDrop(z.mesh.position); killRobot(i); updateUI(); break; }
            }
        }
    }

    // Ledakan yang antre (peluru Grenade Launcher yang kena robot frame ini) —
    // diproses DI LUAR loop utama; lihat komentar pendingBooms.
    processPendingBooms();
}
