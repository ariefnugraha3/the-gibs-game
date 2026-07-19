// BOSS STAGE 4 (2026-07-14): TANK penjaga stasiun — menggantikan robot raksasa.
// Menabrak dinding di ujung TIMUR jalan lalu DIAM di tempat menembaki player.
// HP/skor = CFG.campaign.bosses.tank.hp / .score (SAMA dgn robot raksasa lama:
// 1800 / 1000; kini kunci tank sendiri, tak lagi meminjam bosses.giant).
//
// Entitas MANDIRI (BUKAN anggota array `robots`): dikelola stage4.updateMode
// (spawnTank/updateTank/damageTank). Alasan: rig/gore/selebrasi/animasi di
// robots.js semuanya mengasumsikan rangka humanoid — tank punya bentuk & mati
// sendiri (meledak, tanpa gib humanoid). Peluru PLAYER di-hit-test sendiri di
// sini; senjata tank memakai sistem bersama: peluru senapan mesin lewat
// `enemyBullets`, ledakan meriam/mortar lewat `queueBoom` (hurtPlayer=true —
// armor/godMode/i-frame dodge ditangani processPendingBooms).
//
// TIGA serangan BERGANTIAN (cannon -> senapan mesin -> mortar), jeda antar
// serangan CFG.campaign.bosses.tank.gapSec ATAU saat proyektil meriam/mortar MELEDAK
// (yang lebih dulu; senapan mesin tak meledak -> selalu jeda penuh):
//   1. MERIAM  : turret membidik player lalu menembak 1 peluru meledak-saat-tiba
//      (damage cannonDamage, radius = killRadius granat × cannonBlastRatio).
//   2. SENAPAN MESIN : 1 sesi = mgBurst peluru dari MG KOAKSIAL di TURRET, di
//      samping meriam (2026-07-17 — PINDAH dari bola glacis hull): muzzle anak
//      turret jadi ikut melacak player, tiap peluru membidik posisi player
//      SAAT INI. BADAN tank DIAM — tidak lagi berputar mengikuti player; hanya
//      TURRET yang berputar (kerucut mgConeDeg + rotasi hull hullTurnRadPerSec
//      DIHAPUS; kedua kunci config itu kini DORMAN).
//   3. MORTAR  : BURST mortarBurst (3) proyektil LOB PARABOLA (balistik+gravitasi)
//      berjeda mortarBurstGapSec (0.5 dtk) dari tabung belakang turret yang
//      MENGHADAP KE DEPAN; tiap mortar mendarat di posisi player SAAT tembakan
//      itu — dihindari dgn MENJAUH dari titik jatuh atau TUMBLE/dodge (i-frame
//      meleset; damage mortarDamage, radius killRadius × mortarBlastRatio).
//      Lengkung DIROMBAK 2026-07-16: lob BER-APEX (lihat fireMortar) — selalu
//      melambung tinggi dulu, tak lagi menukik datar pada sasaran dekat.
//      TITIK JATUH MENGEJAR PLAYER (2026-07-17): selama terbang kecepatan
//      mendatar dikoreksi tiap frame agar titik jatuh = posisi player SAAT INI;
//      pada mortarLockSec (0.5 dtk) TERAKHIR titik jatuh TERKUNCI di posisi
//      player saat penguncian — jendela menghindar tinggal 0.5 dtk itu.
//
// MEKANIK ENRAGE / CHARGE (2026-07-17): saat HP < enrageHpFrac (50%), tiap
// SIKLUS serangan penuh (cannon->MG->mortar) selesai tank SELALU memulai
// sekuens CHARGE (sistem peluang `chargeChance` DIHAPUS 2026-07-17 —
// permintaan user; fase di updateTank):
//   'turn'       badan berputar DI POROS ke arah player (hullTurnRadPerSec —
//                kunci ini HIDUP LAGI; dulu dorman pasca-MG-koaksial);
//   'chargeOut'  maju lurus SECEPAT LARI PLAYER (CFG.player.speed × 60 ×
//                chargeSpeedMul) menembus arena sampai KELUAR rect
//                `tank.arena` + chargeOutMargin — di luar jangkauan kamera
//                yang dijepit camBounds, jadi player KEHILANGAN JEJAK tank
//                (debris + guncangan saat menerobos tepi kompleks);
//   'away'       dari luar layar menghujani player awayMortarShots (10)
//                mortir berjeda awayMortarGapSec (mortir tetap mengejar +
//                terkunci mortarLockSec seperti biasa);
//   'chargeBack' teleport ke titik start ACAK di luar arena SEGARIS arah
//                player (S = home − dirKePlayer × jarak; jarak acak, yang
//                penting di luar) lalu charge kembali menuju PUSAT arena
//                (home) — arah datangnya = arah tempat player berada;
//   'straighten' tiba di pusat: badan berputar di poros MELURUSKAN diri ke
//                orientasi awal duel (rotation.y = 0, moncong barat seperti
//                saat duel dimulai) lalu kembali 'battle' (cd = gapSec).
// `tank.arena` (rect kompleks alun-alun) di-inject stage4 lewat spawnTank —
// tanpa arena mekanik ini MATI (tank.js tetap buta geometri scene).
//
// JEDA MASUK ARENA (2026-07-17): saat player BARU menginjak lapangan alun-alun
// (kunci arena terpicu), stage4 men-set tank.holdT = engageDelaySec (2 dtk) —
// selama itu tank MENAHAN semua serangan (cd/burst beku, mortir 'away' pun
// menunggu); turret tetap melacak & tank tetap bisa ditembak.
//
// KOLISI BADAN (2026-07-17): player tidak bisa menembus tank — stage4
// memanggil resolveTankBlock di playerCollide (dorong keluar lingkaran
// bodyRadius dari pusat hull; berlaku juga pada bangkai).
//
// PAGAR LISTRIK (2026-07-16): tank TIDAK BISA DIDEKATI — player di dalam radius
// shockRadiusMeters tersengat shockDps HP/detik MENEMBUS ARMOR (HP dikurangi
// langsung, TANPA damagePlayerHp/durability; godMode kebal, i-frame dodge
// meleset). Busur petir tank->player + percikan biru + flash merah = umpan
// balik; saat tak ada yang dekat, lambung sesekali BERDESIS busur kecil
// (telegraf "berlistrik"). HP habis oleh setruman -> startPlayerDeath (roboh
// menjauhi tank).

import { CFG, CAMP_M } from '../core/config.js';
import { player, bullets, enemyBullets, GEO, MAT, addScore, stats, godMode, dodgeInvuln } from '../core/state.js';
import { scene, camera, addCamShake } from '../core/renderer.js';
import { segPointDist2, clamp, rand } from '../utils/math.js';
import { queueBoom, attackerAngle } from './robots.js';
import { spawnGroundPuff, spawnBloodBurst, explodeAt } from './effects.js';
import { spawnGibs, spawnBloodDecal } from './gore.js';
import {
    playSFX, playLoopSFX, stopLoopSFX, sfxExplode, sfxHit,
    sfxTankMG, sfxTankMortar, sfxTankBlast, sfxTankExplode,
    sfxTankIncoming, sfxTankMove, sfxTankTurret
} from '../utils/sfx.js';
import { updateUI } from '../core/hud.js';
import { flashDamage, showHitDir } from '../core/dom.js';
import { startPlayerDeath } from '../core/game.js';

const _wp = new THREE.Vector3();   // scratch getWorldPosition
// KILAT TERTEMBAK (2026-07-17): porsi tint MERAH maksimum pada cat saat peluru
// player mengenai tank — permintaan user: SEDIKIT saja, 10% dari 100% — dan lama
// pudarnya. Visual murni (konvensi: konstanta visual tinggal di kode, bukan CFG).
const HIT_TINT = 0.10;
const HIT_FLASH_SEC = 0.15;
// SKALA TANK (2026-07-18, permintaan user): dikecilkan sedikit agar proporsional
// terhadap karakter/robot/heli (dulu terlihat terlalu besar). Diterapkan ke grup
// (buildTankMesh) — muzzle/turret/roda ikut menyusut; hitRadius/bodyRadius di
// CFG sudah diturunkan seukuran (kolisi & hit-test cocok dgn siluet baru).
const TANK_SCALE = 0.7;
// CAIRAN/DEBRIS tank = HITAM/oli, BUKAN hijau ("hanya robot yang punya coolant
// hijau", permintaan user 2026-07-18): genangan gib mendarat pakai tone gelap.
const TANK_FLUID = 0x141210;
// DESING MORTAR DATANG (2026-07-19): suara tank-incoming-mortar dinyalakan saat
// sisa terbang <= detik ini (durasi pas: belum ditembakkan = belum berbunyi,
// dihentikan paksa tepat saat mendarat). Konvensi: konstanta audio-visual di kode.
const INCOMING_SEC = 1.2;
const _UP = new THREE.Vector3(0, 1, 0);   // sumbu HIDUNG mortar (+Y lokal) utk orientasi lintasan
const _vv = new THREE.Vector3();          // scratch arah kecepatan mortar

// ===== Mesh PROYEKTIL MORTAR (2026-07-16): shell mortir REALISTIS (acuan M73 HE)
// menggantikan bola kuning lama. Badan OGIVE zaitun (silinder + hidung/buritan
// kerucut) + FUZE kuningan di hidung + BOOM ekor & 4 SIRIP baja menyilang. Hidung
// = +Y lokal (updateMortars mengarahkannya sepanjang kecepatan -> menukik saat
// turun). Geometri+material dibuat SEKALI (malas, shared); Lambert = program
// shader yang sudah dipanaskan -> tanpa recompile saat mortar pertama ditembak. =====
let MSHELL = null;
export function mortarShell() {
    if (!MSHELL) {
        MSHELL = {
            body: new THREE.CylinderGeometry(1.15, 1.02, 2.4, 14),
            nose: new THREE.ConeGeometry(1.15, 1.8, 14),
            tail: new THREE.ConeGeometry(1.02, 1.5, 14),
            boom: new THREE.CylinderGeometry(0.34, 0.34, 1.7, 8),
            fuze: new THREE.CylinderGeometry(0.24, 0.34, 0.85, 8),
            fin: new THREE.BoxGeometry(0.08, 1.25, 1.15),
            olive: new THREE.MeshLambertMaterial({ color: 0x40492a, emissive: 0x3a1e00 }),   // HE zaitun (emissive rendah agar terlihat terbang)
            steel: new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }),                         // sirip/boom baja
            brass: new THREE.MeshLambertMaterial({ color: 0xb8923e, emissive: 0x2a1800 }),     // fuze kuningan
        };
    }
    const S = MSHELL, g = new THREE.Group();
    const put = (geo, mat, y, rx) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; if (rx) m.rotation.x = rx; g.add(m); return m; };
    put(S.body, S.olive, 0.6);              // badan utama (zaitun)
    put(S.nose, S.olive, 2.65);             // hidung ogive (apex +Y)
    put(S.tail, S.olive, -1.35, Math.PI);   // buritan mengerucut ke boom (apex -Y)
    put(S.boom, S.steel, -2.7);             // tabung ekor
    put(S.fuze, S.brass, 3.75);             // fuze/sumbu di ujung hidung
    for (let i = 0; i < 4; i++) {           // 4 sirip ekor menyilang, menonjol radial dari boom
        const a = i * Math.PI / 2, f = new THREE.Mesh(S.fin, S.steel);
        f.position.set(Math.sin(a) * 0.9, -3.0, Math.cos(a) * 0.9);
        f.rotation.y = a;
        g.add(f);
    }
    return g;
}

// ===== BUSUR PETIR pagar listrik (2026-07-16): satu group segmen kotak tipis
// (MeshBasic biru-es = program shader yang sudah dipanaskan, tanpa recompile)
// yang tiap frame dibentangkan ZIG-ZAG antara dua titik (tank->player saat
// menyengat; dua titik lambung acak saat crackle idle). Dibuat SEKALI (malas),
// di-share, TIDAK ikut di-dispose bersama tank (cukup disembunyikan). =====
let ZAP = null;
const ZAP_SEGS = 9;
const _za = new THREE.Vector3();   // scratch arah segmen busur
function zapPool() {
    if (!ZAP) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x9fe2ff, transparent: true, opacity: 0.9, toneMapped: false });
        const geo = new THREE.BoxGeometry(0.55, 1, 0.55);   // memanjang di +Y -> diarahkan setFromUnitVectors
        const grp = new THREE.Group();
        grp.visible = false;
        const segs = [];
        for (let i = 0; i < ZAP_SEGS; i++) { const m = new THREE.Mesh(geo, mat); segs.push(m); grp.add(m); }
        ZAP = { grp, segs, mat, inScene: false };
    }
    if (!ZAP.inScene) { scene.add(ZAP.grp); ZAP.inScene = true; }
    return ZAP;
}
// Bentangkan busur dari (ax,ay,az) ke (bx,by,bz): waypoint di-jitter tegak-lurus
// (envelope sin -> ujung tetap terpaku), tiap segmen kotak diskala+diorientasikan.
function layZap(ax, ay, az, bx, by, bz) {
    const Z = zapPool();
    let px = ax, py = ay, pz = az;
    for (let i = 0; i < ZAP_SEGS; i++) {
        const t = (i + 1) / ZAP_SEGS;
        const env = Math.sin(Math.PI * t) * 6;   // jitter maksimum di tengah busur
        const nx = ax + (bx - ax) * t + (i < ZAP_SEGS - 1 ? (Math.random() - 0.5) * env : 0);
        const ny = ay + (by - ay) * t + (i < ZAP_SEGS - 1 ? (Math.random() - 0.5) * env : 0);
        const nz = az + (bz - az) * t + (i < ZAP_SEGS - 1 ? (Math.random() - 0.5) * env : 0);
        const m = Z.segs[i];
        _za.set(nx - px, ny - py, nz - pz);
        const len = _za.length() || 0.001;
        m.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
        m.scale.set(1, len, 1);
        _za.normalize();
        m.quaternion.setFromUnitVectors(_UP, _za);
        px = nx; py = ny; pz = nz;
    }
    Z.grp.visible = true;
    Z.mat.opacity = 0.5 + Math.random() * 0.5;   // kelap-kelip listrik
}
function hideZap() { if (ZAP) ZAP.grp.visible = false; }

// ===== Bangun mesh tank prosedural — DIROMBAK LAGI 2026-07-19 (permintaan
// user) dari Tiger I PD2 menjadi MBT FUTURISTIS 2045: lambung wedge FACET
// stealth rendah, skirt armor menutup sebagian roda, glacis tajam dgn STRIP
// SENSOR merah (senada mata robot), turret facet rendah, meriam gaya RAILGUN
// (selubung angular + rel kembar + cincin kapasitor + bore gelap), pod MG
// koaksial kompak, tabung mortar belakang MENGHADAP DEPAN dlm rumah angular,
// nozel pendorong vektor di buritan, tiang sensor pengganti kubah komandan.
// Cat tetap skema faksi robot (gunmetal, world/palette.js). Primitif murah
// (Lambert/Basic = program shader yang SUDAH dipanaskan → tanpa recompile).
// KONTRAK MEKANIK TAK BERUBAH (JANGAN diubah saat menyentuh visual): FRONT =
// -X (ke player); HULL diam, TURRET (anak) berputar (turret.rotation.y) &
// cannon = +Z lokal; muzzle anchor (koordinat LAMA dipertahankan) = titik
// spawn proyektil; `wheels[]` diputar spinTracks (rotation.x); `paintMats[]`/
// `paintBase` utk kilat tertembak + bangkai hangus. Nilai muzzle sekadar
// kosmetik (proyektil terbang ke player) — hit-test/damage tak bergantung. =====
export function buildTankMesh() {
    const group = new THREE.Group();
    const paintMats = [];   // cat bodi (dihanguskan saat mati)

    // --- Material (di-share; Lambert = 1 program shader, tanpa recompile) ---
    // Cat 2045 (panduan gaya world/palette.js): gunmetal gelap faksi robot.
    const armor = new THREE.MeshLambertMaterial({ color: 0x474d41 });    // abu-zaitun gelap (bodi+turret)
    const armorDk = new THREE.MeshLambertMaterial({ color: 0x363b33 });  // panel bayangan/bawah
    const panelA = new THREE.MeshLambertMaterial({ color: 0x2f353b });   // panel facet gunmetal
    const panelB = new THREE.MeshLambertMaterial({ color: 0x3d444c });   // panel senada serpihan robot
    const steel = new THREE.MeshLambertMaterial({ color: 0x71757d });    // logam terang (hub/cincin)
    const gun = new THREE.MeshLambertMaterial({ color: 0x1f2226 });      // gunmetal (laras/MG/nozel)
    const track = new THREE.MeshLambertMaterial({ color: 0x34363a });    // rantai komposit gelap
    const rubber = new THREE.MeshLambertMaterial({ color: 0x161618 });   // roda jalan
    const glass = new THREE.MeshLambertMaterial({ color: 0x120404, emissive: 0x661010 }); // lensa/strip sensor merah (senada mata robot)
    paintMats.push(armor, armorDk, panelA, panelB);

    // mk: mesh + posisi + rotasi opsional (noShadow utk detail kecil = hemat).
    const mk = (g, m, x, y, z, parent, rx, ry, rz, noShadow) => {
        const b = new THREE.Mesh(g, m);
        b.position.set(x, y, z);
        if (rx) b.rotation.x = rx; if (ry) b.rotation.y = ry; if (rz) b.rotation.z = rz;
        if (!noShadow) { b.castShadow = true; b.receiveShadow = true; }
        parent.add(b);
        return b;
    };
    // Silinder yang berbaring LATERAL (poros = sumbu Z dunia): sprocket/idler,
    // laras (di +Z). Poros dibaked ke Z sekali via rotateX.
    const lat = (r1, r2, h, seg) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.rotateX(Math.PI / 2); return g; };

    // ===================== LAMBUNG BAWAH (bak) =====================
    mk(new THREE.BoxGeometry(52, 8, 26), armorDk, 1, 8, 0, group);

    // ===================== TRACK + RODA (kiri z-, kanan z+) =====================
    // Geo ban dibaked poros ke sumbu-X lokal (rotateZ) supaya di dalam wrapper
    // ber-rotasi Y 90° porosnya jadi Z dunia DAN spinTracks(rotation.x) =
    // menggelinding — KONTRAK LAMA, jangan diubah.
    const tireGeo = new THREE.CylinderGeometry(6, 6, 5.4, 16); tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(2, 2, 5.8, 10); hubGeo.rotateZ(Math.PI / 2);
    const tracks = [], wheels = [];
    for (const side of [-1, 1]) {
        const zc = side * 13.5;
        tracks.push(mk(new THREE.BoxGeometry(56, 10, 9), track, 1, 5.5, zc, group));   // lintasan bawah
        // SKIRT ARMOR FACET 2045 (pengganti return-run polos): slab miring
        // menggantung menutupi separuh atas roda — roda tetap terlihat berputar.
        const skirt = mk(new THREE.BoxGeometry(54, 8, 1.6), panelA, 1, 13, zc + side * 4.6, group);
        skirt.rotation.x = side * 0.14;
        mk(new THREE.BoxGeometry(50, 3.5, 8.6), track, 1, 15.5, zc, group, 0, 0, 0, true);   // return run (di balik skirt)
        // sprocket depan (-X) & idler belakang (+X)
        mk(lat(6.6, 6.6, 6, 12), track, -27.5, 6.5, zc, group);
        mk(lat(6.6, 6.6, 6, 12), track, 29.5, 6.5, zc, group);
        mk(lat(3, 3, 6.4, 8), steel, -27.5, 6.5, zc, group, 0, 0, 0, true);
        mk(lat(3, 3, 6.4, 8), steel, 29.5, 6.5, zc, group, 0, 0, 0, true);
        // roda jalan saling tumpang (7 buah) — berputar (wheels[])
        for (let wx = -21; wx <= 23; wx += 6.2) {
            const ww = new THREE.Group();
            ww.position.set(wx, 6, zc); ww.rotation.y = Math.PI / 2; group.add(ww);
            const wheel = new THREE.Group(); ww.add(wheel);
            mk(tireGeo, rubber, 0, 0, 0, wheel, 0, 0, 0, true);
            mk(hubGeo, steel, 0, 0, 0, wheel, 0, 0, 0, true);
            wheels.push(wheel);
        }
        // mudguard wedge depan & belakang (menirus, bukan pelat datar)
        mk(new THREE.BoxGeometry(15, 1.2, 10.4), panelB, -24, 19.6, zc, group, 0, 0, -0.16);
        mk(new THREE.BoxGeometry(15, 1.2, 10.4), panelB, 25, 19.6, zc, group, 0, 0, 0.16);
    }

    // ===================== SUPERSTRUKTUR FACET (lambung atas) =====================
    // Slab utama + panel sisi MIRING (facet stealth) yang melebar menutupi track.
    mk(new THREE.BoxGeometry(50, 10, 30), armor, 1, 16.5, 0, group);
    for (const side of [-1, 1]) {   // panel sisi miring keluar (wedge sisi)
        const p = mk(new THREE.BoxGeometry(46, 11, 4), panelB, 1, 16, side * 16.4, group);
        p.rotation.x = -side * 0.38;
    }
    mk(new THREE.BoxGeometry(50, 1.2, 33), armorDk, 1, 21.9, 0, group, 0, 0, 0, true);   // dek atap tipis

    // ----- GLACIS depan (-X): wedge tajam + STRIP SENSOR merah + lampu slit -----
    mk(new THREE.BoxGeometry(10, 11, 33), armor, -25, 15.5, 0, group, 0, 0, 0.42);      // glacis miring tajam
    mk(new THREE.BoxGeometry(4, 12, 30), armorDk, -26.8, 9.5, 0, group, 0, 0, 0.1);     // pelat bawah nyaris tegak
    mk(new THREE.BoxGeometry(8, 1.2, 30), panelA, -21.5, 21.2, 0, group, 0, 0, 0.1, true); // pelat hidung atas
    // STRIP SENSOR menyala merah melintang glacis (pengganti visor sopir WWII)
    mk(new THREE.BoxGeometry(0.9, 1.4, 24), glass, -28.4, 18.6, 0, group, 0, 0, 0.42, true);
    // sepasang lampu slit sipit
    mk(new THREE.BoxGeometry(0.8, 1.0, 4.5), glass, -29.2, 14.5, 10, group, 0, 0, 0.1, true);
    mk(new THREE.BoxGeometry(0.8, 1.0, 4.5), glass, -29.2, 14.5, -10, group, 0, 0, 0.1, true);

    // ----- DEK MESIN belakang (+X): kisi datar + NOZEL PENDORONG VEKTOR -----
    mk(new THREE.BoxGeometry(15, 1.4, 28), armorDk, 22, 22.4, 0, group);
    for (let gz = -9; gz <= 9; gz += 4.4) mk(new THREE.BoxGeometry(12, 0.8, 2.6), gun, 22, 23.2, gz, group, 0, 0, 0, true);
    mk(new THREE.BoxGeometry(3, 13, 30), armor, 28.7, 15.5, 0, group, 0, 0, -0.12);      // pelat buritan miring
    for (const ez of [-9.5, 9.5]) {   // nozel pendorong kotak (pengganti knalpot bulat WWII)
        mk(new THREE.BoxGeometry(4.5, 5, 7.5), gun, 29.6, 17.5, ez, group);
        mk(new THREE.BoxGeometry(1.2, 3.2, 6), new THREE.MeshBasicMaterial({ color: 0x070707 }), 31.6, 17.5, ez, group, 0, 0, 0, true);   // rongga nozel gelap
    }

    // ===================== TURRET FACET berputar (anak). Cannon = +Z lokal =====================
    const turret = new THREE.Group();
    turret.position.set(3, 21, 0);
    group.add(turret);
    mk(new THREE.CylinderGeometry(14.5, 15, 2, 20), armorDk, 0, 0.5, -1, turret, 0, 0, 0, true);   // cincin dasar
    // badan turret RENDAH facet: slab tengah + panel pipi miring kiri/kanan + atap
    mk(new THREE.BoxGeometry(22, 9, 22), armor, 0, 5.5, -2, turret);
    for (const side of [-1, 1]) {
        const cheek = mk(new THREE.BoxGeometry(4, 10, 21), panelA, side * 12, 5, -2, turret);
        cheek.rotation.z = side * 0.3;   // pipi miring ke dalam (wedge)
    }
    mk(new THREE.BoxGeometry(20, 1, 20), armorDk, 0, 10.4, -2, turret, 0, 0, 0, true);   // atap datar
    // muka turret wedge + mantlet ANGULAR (bukan bulat)
    mk(new THREE.BoxGeometry(18, 8, 4), armor, 0, 5.5, 10.5, turret, 0.12, 0, 0);
    mk(new THREE.BoxGeometry(11, 7, 5), gun, 0, 5.5, 14, turret);
    // strip optik merah di muka turret (sensor tembak)
    mk(new THREE.BoxGeometry(8, 0.9, 0.6), glass, -3, 9.2, 12.6, turret, 0.12, 0, 0, true);
    // ----- MERIAM RAILGUN ke +Z: selubung angular + laras inti + REL KEMBAR
    // atas-bawah + cincin kapasitor + moncong angular ber-BORE gelap -----
    const bore = new THREE.MeshBasicMaterial({ color: 0x070707 });   // Basic gelap = "lubang" (sudah dipanaskan)
    mk(new THREE.BoxGeometry(6.5, 6.5, 11), gun, 0, 5.5, 19.5, turret);                  // selubung pangkal angular
    mk(lat(1.35, 1.5, 27, 12), gun, 0, 5.5, 36, turret);                                 // laras inti
    mk(new THREE.BoxGeometry(1.0, 2.8, 26), panelB, 0, 5.5, 36.5, turret, 0, 0, 0, true); // rel kembar (atas+bawah laras)
    for (const rz of [26.5, 32.5, 38.5, 44.5]) {                                          // cincin kapasitor
        mk(lat(2.4, 2.4, 1.1, 10), steel, 0, 5.5, rz, turret, 0, 0, 0, true);
    }
    mk(new THREE.BoxGeometry(3.6, 3.6, 4.4), gun, 0, 5.5, 51, turret);                   // moncong angular
    mk(lat(1.05, 1.05, 2.4, 12), bore, 0, 5.5, 52.4, turret, 0, 0, 0, true);             // LUBANG BORE (rongga laras)
    // ----- SENAPAN MESIN KOAKSIAL: pod kompak di samping meriam (anchor muzzle
    // anak turret — ikut melacak player bersama turret; kontrak 2026-07-17) -----
    mk(new THREE.BoxGeometry(2.4, 2.4, 5.2), gun, 3.6, 5.6, 16.4, turret, 0, 0, 0, true);   // pod MG angular
    mk(lat(0.6, 0.6, 10, 8), gun, 3.6, 5.6, 22, turret, 0, 0, 0, true);                     // laras koaksial
    mk(new THREE.BoxGeometry(1.6, 1.6, 1.4), gun, 3.6, 5.6, 26.6, turret, 0, 0, 0, true);   // penekan kilat kotak
    const mgMuzzle = new THREE.Object3D(); mgMuzzle.position.set(3.6, 5.6, 27.5); turret.add(mgMuzzle);
    const cannonMuzzle = new THREE.Object3D(); cannonMuzzle.position.set(0, 5.5, 53.6); turret.add(cannonMuzzle);
    const cannonFlash = new THREE.Mesh(GEO.explosion, new THREE.MeshBasicMaterial({
        color: 0xffd070, transparent: true, opacity: 0, toneMapped: false
    }));
    cannonFlash.scale.setScalar(3.5); cannonFlash.position.copy(cannonMuzzle.position); turret.add(cannonFlash);

    // ----- TIANG SENSOR kiri-belakang atap (pengganti kubah komandan): mast
    // pendek + lensa merah berkeliling + antena phased-array pipih -----
    mk(new THREE.CylinderGeometry(2.2, 2.8, 4.6, 10), armor, -6.5, 12.4, -6, turret);
    mk(new THREE.CylinderGeometry(2.5, 2.5, 1.0, 10), gun, -6.5, 15, -6, turret, 0, 0, 0, true);
    mk(new THREE.BoxGeometry(1.0, 0.9, 4.6), glass, -6.5, 13.4, -6, turret, 0, 0, 0, true);      // lensa depan-belakang
    mk(new THREE.BoxGeometry(4.6, 0.9, 1.0), glass, -6.5, 13.4, -6, turret, 0, 0, 0, true);      // lensa kiri-kanan
    mk(new THREE.BoxGeometry(0.5, 7, 3.4), panelB, -10.5, 14, -9, turret, 0, 0.4, 0, true);      // panel antena pipih
    mk(new THREE.CylinderGeometry(0.18, 0.18, 14, 5), gun, -10, 15, -7, turret, 0, 0, 0, true);  // antena cambuk
    // modul baterai/stowage buritan turret (angular, menirus)
    mk(new THREE.BoxGeometry(16, 6, 5), armorDk, 0, 4.5, -14.5, turret, -0.14, 0, 0);

    // ----- TABUNG MORTAR di BELAKANG turret, MENGHADAP KE DEPAN (kontrak lama:
    // condong atas-DEPAN +Z, muzzle di ujung depan-atas) — kini dlm RUMAH
    // angular 2045 dgn bibir moncong facet -----
    mk(new THREE.BoxGeometry(7, 5, 7), armorDk, 0, 9, -6, turret);                            // rumah dudukan angular
    mk(new THREE.BoxGeometry(5.4, 4, 5.4), panelA, 0, 11.5, -4.6, turret, 0.6, 0, 0, true);   // kerah rumah miring
    mk(new THREE.CylinderGeometry(2.4, 2.7, 13, 10), gun, 0, 13, -2.5, turret, 0.6, 0, 0);    // tabung condong depan-atas
    mk(new THREE.BoxGeometry(4.6, 1.2, 4.6), track, 0, 16.4, 0.6, turret, 0.6, 0, 0, true);   // bibir moncong facet
    const mortarMuzzle = new THREE.Object3D(); mortarMuzzle.position.set(0, 18.2, 1.4); turret.add(mortarMuzzle);
    const mortarGlow = new THREE.Mesh(GEO.explosion, new THREE.MeshBasicMaterial({
        color: 0xff7a3a, transparent: true, opacity: 0, toneMapped: false
    }));
    mortarGlow.scale.setScalar(2.4); mortarGlow.position.copy(mortarMuzzle.position); turret.add(mortarGlow);

    // ===================== AKSEN PANEL (pengganti bercak kamuflase WWII) =====================
    const accent = (m, w, h, d, x, y, z, parent, ry) => mk(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent, 0, ry, 0, true);
    accent(panelA, 15, 0.4, 11, -7, 22.1, 6, group);         // panel atap
    accent(panelB, 12, 0.4, 9, 15, 22.1, -6, group);
    accent(panelA, 14, 5, 0.5, -4, 16.5, 15.3, group);       // panel sisi +Z (menghadap kamera)
    accent(panelB, 8, 4, 0.5, 14, 15.5, 15.3, group);
    accent(panelB, 8, 4.5, 0.4, 5, 5.5, 9.4, turret);        // panel muka turret

    group.scale.setScalar(TANK_SCALE);   // kecilkan sedikit (proporsional; kolisi CFG seukuran)

    return {
        group, turret, tracks, wheels, mgMuzzle, cannonMuzzle, mortarMuzzle,
        cannonFlash, mortarGlow, paintMats,
        // warna dasar tiap material cat (urutan = paintMats) — acuan kilat
        // tertembak applyHitFlash agar tint memudar kembali PERSIS ke asal
        paintBase: paintMats.map(m => m.color.getHex())
    };
}

// ===== Buat & tempatkan tank. `homeX/homeZ` = posisi diam (ujung timur jalan);
// `wallX` = x dinding yang ditabrak (pecah saat tank melintasinya). Tank SPAWN
// di timur dinding lalu menggelinding ke home (fase 'spawn'). `arena` (opsional)
// = rect {x0,x1,z0,z1} kompleks arena utk mekanik enrage/charge (tanpa arena
// mekaniknya mati). =====
export function spawnTank({ homeX, homeZ, wallX, faceX, arena, avoid }) {
    const parts = buildTankMesh();
    const startX = homeX + 160;   // mulai di timur (di balik dinding, luar peta)
    parts.group.position.set(startX, 0, homeZ);
    scene.add(parts.group);

    const B = CFG.campaign.bosses.tank;
    return {
        parts, homeX, homeZ, wallX: wallX != null ? wallX : homeX + 108,
        faceX: faceX != null ? faceX : homeX - 300,   // arah player (barat) utk orientasi awal
        hp: B.hp, maxHp: B.hp, score: B.score,
        phase: 'spawn', spawnT: 0, wallSmashed: false, dead: false, deathT: 0,
        hitT: 0,   // kilat tertembak (1 saat kena -> pudar HIT_FLASH_SEC)
        // Siklus serangan
        attackIdx: -1, cd: 1.4, aiming: false,
        blastPending: false, pendingId: 0,
        mgLeft: 0, mgTimer: 0,
        mortarLeft: 0, mortarTimer: 0,
        shockFxT: 0, shockSfxT: 0, idleZapT: 1.5,
        // SUARA (2026-07-19): timer heartbeat gerak/turret + node loop aktifnya
        // (tank-moving / tank-turret-rotate) — dikelola updateTankAudio.
        moveT: 0, moveSnd: null, turretT: 0, turretSnd: null,
        shells: [], mortars: [],
        turretYaw: Math.atan2((faceX != null ? faceX : homeX - 300) - homeX, 0),
        // Mekanik ENRAGE/CHARGE (2026-07-17): hullYaw HANYA berubah dalam fase
        // charge (battle tak pernah memutar badan); arena di-inject scene.
        // `avoid` (opsional) = lingkaran {x,z,r} yang TIDAK BOLEH dilintasi
        // gerak charge (bangkai heli di pusat alun) — arah charge dideleksi
        // + slide per-frame (chargeMove) menjauhinya.
        hullYaw: 0, arena: arena || null, avoid: avoid || null,
        chargeDirX: 0, chargeDirZ: 0, awayLeft: 0, awayTimer: 0, wasInside: true,
        // JEDA MASUK ARENA (2026-07-17): stage4 men-set holdT = engageDelaySec
        // saat player BARU menginjak lapangan alun-alun — selama holdT > 0 tank
        // MENAHAN semua serangan (cd/burst beku, mortir 'away' pun menunggu).
        holdT: 0,
        trackPhase: 0, chargeK: 0, onWallSmash: null
    };
}

export function disposeTank(tank) {
    if (!tank || !tank.parts) return;
    hideZap();   // busur petir di-share antar tank -> cukup disembunyikan
    stopTankAudio(tank);   // loop gerak/turret mati bersama tank (2026-07-19)
    tank.shells.forEach(s => scene.remove(s.mesh));
    tank.mortars.forEach(m => { stopLoopSFX(m.snd); scene.remove(m.mesh); });
    tank.parts.group.traverse(o => { if (o.isMesh && o.material && o.material.dispose) o.material.dispose(); });
    scene.remove(tank.parts.group);
    tank.parts = null;
}

// ===== AUDIO TANK (2026-07-19, permintaan user): loop tank-moving saat BADAN
// bergerak (fase spawn/charge/pivot + drive cutscene — BUKAN rotasi turret) dan
// loop tank-turret-rotate saat turret benar-benar berputar. Pola "heartbeat":
// tiap kode penggerak memanggil tankMovingTick / men-set turretT; timer > 0 →
// loop menyala, habis → berhenti. Satu node loop per tank (bukan per frame). =====
export function tankMovingTick(tank) { tank.moveT = 0.15; }
function updateTankAudio(tank, dt) {
    if (tank.moveT > 0) {
        tank.moveT -= dt;
        if (!tank.moveSnd) tank.moveSnd = playLoopSFX(sfxTankMove, 0.55);
    } else if (tank.moveSnd) { stopLoopSFX(tank.moveSnd); tank.moveSnd = null; }
    if (tank.turretT > 0) {
        tank.turretT -= dt;
        if (!tank.turretSnd) tank.turretSnd = playLoopSFX(sfxTankTurret, 0.3);
    } else if (tank.turretSnd) { stopLoopSFX(tank.turretSnd); tank.turretSnd = null; }
}
function stopTankAudio(tank) {
    if (tank.moveSnd) { stopLoopSFX(tank.moveSnd); tank.moveSnd = null; }
    if (tank.turretSnd) { stopLoopSFX(tank.turretSnd); tank.turretSnd = null; }
    tank.moveT = 0; tank.turretT = 0;
}

// Sudut yaw turret (DUNIA) agar cannon (+Z lokal) menghadap titik (tx,tz) —
// dihitung dari POSISI tank saat ini (= home saat diam; benar juga saat tank
// bergerak dalam fase charge enrage 2026-07-17).
function aimYaw(tank, tx, tz) {
    const g = tank.parts.group.position;
    return Math.atan2(tx - g.x, tz - g.z);
}

// ===== Loop utama tank (dipanggil stage4.updateMode tiap frame). step
// dihitung lokal (updateMode hanya diberi dt oleh game.js). =====
export function updateTank(tank, dt) {
    if (!tank || !tank.parts) return;
    const step = dt * 60;
    const p = tank.parts;

    // Proyektil selalu di-update (biar meledak walau fase mati)
    updateShells(tank, dt, step);
    updateMortars(tank, dt, step);

    if (tank.dead) { updateDeath(tank, dt); return; }
    if (tank.hp <= 0) { killTank(tank); return; }   // HP habis (peluru/ledakan) -> hancur

    // Pemeliharaan loop suara gerak/turret — SEBELUM early-return 'cine' supaya
    // tick dari drive cutscene (cineTracksDust) ikut terpelihara (2026-07-19).
    updateTankAudio(tank, dt);

    // FASE 'cine' (2026-07-17): transform tank dikemudikan CUTSCENE scene
    // (stage4) — seluruh logika mandiri (shock/serangan/turret) dilewati.
    if (tank.phase === 'cine') return;

    // KILAT TERTEMBAK: cat ter-tint MERAH tipis (maks HIT_TINT 10%) saat peluru
    // player mengenai tank, memudar HIT_FLASH_SEC — umpan balik "kena!" saja,
    // BUKAN indikator sisa HP. Diletakkan SETELAH cek mati agar tak menimpa cat
    // hangus bangkai; k=0 mengembalikan warna dasar PERSIS.
    if (tank.hitT > 0) {
        tank.hitT = Math.max(0, tank.hitT - dt / HIT_FLASH_SEC);
        applyHitFlash(tank, tank.hitT);
    }

    // PAGAR LISTRIK: aktif selama tank hidup (fase spawn maupun battle)
    updateShock(tank, dt);

    // --- FASE SPAWN: menggelinding dari timur, MENABRAK dinding, berhenti di home ---
    if (tank.phase === 'spawn') {
        tank.spawnT += dt;
        const dur = CFG.campaign.bosses.tank.spawnRollSec || 2.4;
        const k = clamp(tank.spawnT / dur, 0, 1);
        const ease = 1 - Math.pow(1 - k, 2);   // easeOut: melambat mendekati home
        const startX = tank.homeX + 160;
        p.group.position.x = startX + (tank.homeX - startX) * ease;
        tank.trackPhase += dt * 8;
        spinTracks(p, tank.trackPhase);
        tankMovingTick(tank);   // suara tank-moving selama menggelinding masuk
        addCamShake(0.7);
        if (Math.random() < 0.6) spawnGroundPuff(p.group.position.x + 22, p.group.position.z + (Math.random() - 0.5) * 20, 0x6b6252, 5 + Math.random() * 4, 3);
        // Momen MENABRAK dinding (melintasi wallX menuju barat)
        if (!tank.wallSmashed && p.group.position.x <= tank.wallX) {
            tank.wallSmashed = true;
            smashWall(tank);
        }
        p.turret.rotation.y = aimYaw(tank, tank.faceX, tank.homeZ);
        if (k >= 1) { tank.phase = 'battle'; tank.spawnT = 0; }
        return;
    }

    // --- SEMUA FASE HIDUP PASCA-SPAWN (battle + fase charge enrage) ---
    // TURRET selalu MELACAK player (yaw DUNIA; rotasi lokal dikoreksi yaw hull
    // — hull hanya berputar dalam fase charge, saat battle tetap diam pada
    // orientasinya); kilat muzzle meredup; peluru player diuji-tumbuk (tank
    // tetap bisa ditembak selagi berputar/charge).
    const T = CFG.campaign.bosses.tank;
    const want = aimYaw(tank, camera.position.x, camera.position.z);
    const prevTurretYaw = tank.turretYaw;
    tank.turretYaw = turnAngle(tank.turretYaw, want, 2.2 * dt);
    // Suara rotasi turret HANYA saat yaw benar-benar berubah signifikan
    // (2026-07-19) — turret yang sudah terkunci ke player tidak berbunyi.
    if (Math.abs(tank.turretYaw - prevTurretYaw) > 0.004) tank.turretT = 0.12;
    p.turret.rotation.y = tank.turretYaw - tank.hullYaw;
    // kilat muzzle meredup tiap frame (di-nyalakan saat menembak / charge)
    p.cannonFlash.material.opacity *= 0.82;
    p.mortarGlow.material.opacity *= 0.9;

    // Hit-test peluru PLAYER (tank bukan anggota `robots` -> uji sendiri di sini)
    tankBulletHits(tank);
    if (tank.dead) return;

    // JEDA MASUK ARENA (2026-07-17): hitung mundur di SEMUA fase hidup (fase
    // 'away' pun) — selama holdT > 0 senjata ditahan (cek di fase battle + gerbang
    // tembak 'away'); turret tetap melacak & tank tetap bisa ditembak.
    if (tank.holdT > 0) tank.holdT -= dt;

    // --- FASE CHARGE (mekanik ENRAGE, 2026-07-17 — lihat komentar header) ---
    if (tank.phase === 'turn') {
        // Badan berputar DI POROS menghadap player; sampai -> kunci arah charge.
        // Arah dasar (ke player) DIDEFLEKSI menjauhi lingkaran `avoid` (bangkai
        // heli) bila lintasan lurusnya bakal menabrak — tank tak pernah
        // menggilas bangkai (2026-07-17).
        const gx = p.group.position.x, gz = p.group.position.z;
        let bx = camera.position.x - gx, bz = camera.position.z - gz;
        const bd = Math.hypot(bx, bz) || 1; bx /= bd; bz /= bd;
        const dir = deflectDir(tank, bx, bz, (dx, dz) => [gx, gz, gx + dx * 1200, gz + dz * 1200]);
        const wantHull = Math.atan2(dir.z, -dir.x);   // moncong hull = -X lokal
        tank.hullYaw = turnAngle(tank.hullYaw, wantHull, (T.hullTurnRadPerSec || 1.6) * dt);
        p.group.rotation.y = tank.hullYaw;
        tank.trackPhase += dt * 6; spinTracks(p, tank.trackPhase);   // track memutar di tempat
        tankMovingTick(tank);   // pivot badan = track bergerak (bukan turret) -> suara moving
        if (tank.hullYaw === wantHull) {   // turnAngle men-snap tepat saat tiba
            tank.chargeDirX = -Math.cos(tank.hullYaw);   // arah moncong (dikunci — dodge-able)
            tank.chargeDirZ = Math.sin(tank.hullYaw);
            tank.wasInside = inArena(tank, 0);
            tank.phase = 'chargeOut';
        }
        return;
    }
    if (tank.phase === 'chargeOut') {
        // Maju lurus secepat lari player sampai KELUAR arena + margin ->
        // tersembunyi di luar jangkauan kamera (camBounds menjepit pandangan).
        chargeMove(tank, dt);
        if (!inArena(tank, T.chargeOutMargin || 180)) {
            tank.phase = 'away';
            tank.awayLeft = T.awayMortarShots || 10;
            tank.awayTimer = 0.6;   // jeda kecil sebelum hujan mortir dimulai
        }
        return;
    }
    if (tank.phase === 'away') {
        // Dari luar layar: hujani player mortir (awayMortarShots tembakan),
        // lalu siapkan charge kembali ke pusat arena. Selama jeda masuk arena
        // (holdT) tembakan menunggu (timer boleh habis, peluru tak keluar).
        tank.awayTimer -= dt;
        if (tank.awayTimer <= 0 && tank.holdT <= 0) {
            if (tank.awayLeft > 0) {
                fireMortar(tank);
                tank.awayLeft--;
                tank.awayTimer = T.awayMortarGapSec || 0.7;
            } else beginChargeBack(tank);
        }
        return;
    }
    if (tank.phase === 'chargeBack') {
        // Charge menuju PUSAT arena (home); lewat pusat -> snap & luruskan badan.
        chargeMove(tank, dt);
        const rx = tank.homeX - p.group.position.x, rz = tank.homeZ - p.group.position.z;
        if (rx * tank.chargeDirX + rz * tank.chargeDirZ <= 0) {   // pusat terlewati/tercapai
            p.group.position.x = tank.homeX;
            p.group.position.z = tank.homeZ;
            tank.phase = 'straighten';
        }
        return;
    }
    if (tank.phase === 'straighten') {
        // Badan berputar di poros MELURUSKAN diri ke orientasi awal duel
        // (rotation.y = 0, moncong barat — seperti saat duel dimulai).
        tank.hullYaw = turnAngle(tank.hullYaw, 0, (T.hullTurnRadPerSec || 1.6) * dt);
        p.group.rotation.y = tank.hullYaw;
        tank.trackPhase += dt * 6; spinTracks(p, tank.trackPhase);
        tankMovingTick(tank);   // pivot meluruskan diri = track bergerak
        if (tank.hullYaw === 0) {
            tank.phase = 'battle';
            tank.cd = gapFor(tank);
            tank.attackIdx = -1;   // wajib 1 siklus penuh lagi sebelum roll charge berikutnya
        }
        return;
    }

    // --- FASE BATTLE (badan diam; hanya turret yang berputar) ---
    // JEDA MASUK ARENA: selama holdT > 0 SEMUA logika serangan ditahan (burst
    // MG/mortar beku, cd beku, tak ada serangan baru) — "napas" 2 dtk saat
    // player baru menginjak lapangan; proyektil yang sudah terbang tetap jalan.
    if (tank.holdT > 0) return;

    // Sesi SENAPAN MESIN sedang berjalan?
    if (tank.mgLeft > 0) {
        tank.mgTimer -= dt;
        if (tank.mgTimer <= 0) {
            fireMG(tank);
            tank.mgLeft--;
            tank.mgTimer = CFG.campaign.bosses.tank.mgIntervalSec || 0.12;
            if (tank.mgLeft <= 0) { tank.cd = gapFor(tank); tank.aiming = false; }
        }
        return;
    }

    // Sesi MORTAR (burst) sedang berjalan? Tembak `mortarBurst` mortir dengan
    // jeda `mortarBurstGapSec` antar tembakan. Setiap mortar membidik posisi
    // player SAAT itu (burst tersebar mengejar player). blastPending sudah true
    // sejak launchAttack -> cd tetap beku selama burst + semua mortar terbang;
    // jeda gapSec baru mulai saat mortar TERAKHIR meledak (detonate id===pendingId,
    // karena fireMortar menaikkan pendingId tiap tembakan -> yg terakhir = max).
    if (tank.mortarLeft > 0) {
        tank.mortarTimer -= dt;
        if (tank.mortarTimer <= 0) {
            fireMortar(tank);
            tank.mortarLeft--;
            tank.mortarTimer = CFG.campaign.bosses.tank.mortarBurstGapSec || 0.5;
        }
        return;
    }

    // MENUNGGU proyektil MELEDAK: utk cannon/mortar, jeda `gapSec` BARU dimulai
    // SETELAH shell/mortar meledak (detonate men-set cd), BUKAN saat meledak
    // langsung menembak. Selama proyektil masih terbang, jangan hitung mundur.
    if (tank.blastPending) return;

    // Cooldown antar serangan. Telegraf "charge" pada aimSec terakhir, di muzzle
    // serangan BERIKUTNYA (nextIdx).
    tank.cd -= dt;
    const aimSec = CFG.campaign.bosses.tank.aimSec || 1.1;
    const nextIdx = (tank.attackIdx + 1) % 3;
    const charging = tank.cd <= aimSec && tank.cd > 0 && (nextIdx === 0 || nextIdx === 2);
    tank.chargeK += ((charging ? 1 : 0) - tank.chargeK) * Math.min(1, dt * 10);
    applyCharge(tank, nextIdx);

    if (tank.cd <= 0) {
        // Trigger ENRAGE (2026-07-17): SIKLUS penuh baru saja selesai (serangan
        // terakhir = mortar [attackIdx 2] dan giliran kembali ke cannon
        // [nextIdx 0]), HP < enrageHpFrac, arena ter-inject -> SELALU memulai
        // sekuens charge alih-alih serangan berikutnya (sistem peluang
        // `chargeChance` DIHAPUS 2026-07-17, permintaan user — pasti charge
        // tiap siklus). Pasca-charge attackIdx di-reset -1 sehingga WAJIB satu
        // siklus penuh lagi sebelum charge berikutnya ("setelah 1 cycle").
        if (nextIdx === 0 && tank.attackIdx === 2 && tank.arena
            && tank.hp < tank.maxHp * (T.enrageHpFrac || 0.5)) {
            tank.phase = 'turn';
            return;
        }
        tank.attackIdx = nextIdx;
        launchAttack(tank);
    }
}

// ===== Helper mekanik ENRAGE/CHARGE (2026-07-17) =====
// Defleksi arah charge menjauhi lingkaran `avoid` (bangkai heli, 2026-07-17):
// coba rotasi 0, ±10°, ±20°, ... ±77° — kandidat pertama yang SEGMEN
// lintasannya bebas lingkaran dipakai; tanpa avoid / semua gagal -> arah dasar.
// `mkSeg(dx,dz)` = segmen lintasan kandidat (chargeOut: sinar dari posisi tank;
// chargeBack: titik start luar -> home).
const DEFLECT_STEPS = [0, 0.17, -0.17, 0.35, -0.35, 0.52, -0.52, 0.7, -0.7, 0.9, -0.9, 1.1, -1.1, 1.35, -1.35];
function deflectDir(tank, baseX, baseZ, mkSeg) {
    if (!tank.avoid) return { x: baseX, z: baseZ };
    const r2 = (tank.avoid.r + 2) * (tank.avoid.r + 2);
    for (const a of DEFLECT_STEPS) {
        const c = Math.cos(a), s = Math.sin(a);
        const dx = baseX * c - baseZ * s, dz = baseX * s + baseZ * c;
        const seg = mkSeg(dx, dz);
        if (segPointDist2(seg[0], 0, seg[1], seg[2], 0, seg[3], tank.avoid.x, 0, tank.avoid.z) >= r2) {
            return { x: dx, z: dz };
        }
    }
    return { x: baseX, z: baseZ };
}

// Tank di dalam rect arena (diperluas margin m)? Tanpa arena -> anggap selalu
// di dalam (mekanik charge mati; trigger juga menjaga `tank.arena`).
function inArena(tank, m) {
    const a = tank.arena;
    if (!a) return true;
    const g = tank.parts.group.position;
    return g.x >= a.x0 - m && g.x <= a.x1 + m && g.z >= a.z0 - m && g.z <= a.z1 + m;
}

// Gerak maju fase charge: kecepatan = LARI PLAYER (CFG.player.speed × 60 ×
// chargeSpeedMul unit/detik — player.speed adalah unit-per-step, step = 60/dtk),
// track berputar + debu di belakang + guncangan kecil. Saat MENYILANG tepi
// arena (keluar/masuk) semburkan debris beton + guncangan besar — tembok
// keliling memang visual-only, FX inilah yang "menjual" terobosannya.
function chargeMove(tank, dt) {
    const T = CFG.campaign.bosses.tank;
    const p = tank.parts;
    const spd = CFG.player.speed * 60 * (T.chargeSpeedMul || 1);
    p.group.position.x += tank.chargeDirX * spd * dt;
    p.group.position.z += tank.chargeDirZ * spd * dt;
    tankMovingTick(tank);   // suara tank-moving selama charge (2026-07-19)
    // SLIDE anti-tabrak bangkai heli (2026-07-17): bila menyentuh lingkaran
    // `avoid`, dorong keluar radial — jaring pengaman di atas defleksi arah.
    if (tank.avoid) {
        const ax = p.group.position.x - tank.avoid.x, az = p.group.position.z - tank.avoid.z;
        const ad = Math.hypot(ax, az);
        if (ad < tank.avoid.r && ad > 0.001) {
            p.group.position.x = tank.avoid.x + ax / ad * tank.avoid.r;
            p.group.position.z = tank.avoid.z + az / ad * tank.avoid.r;
        }
    }
    tank.trackPhase += dt * 10;
    spinTracks(p, tank.trackPhase);
    addCamShake(0.6);
    if (Math.random() < 0.5) spawnGroundPuff(
        p.group.position.x - tank.chargeDirX * 26,
        p.group.position.z - tank.chargeDirZ * 26, 0x6b6252, 4 + Math.random() * 4, 3);
    const now = inArena(tank, 0);
    if (now !== tank.wasInside) {
        tank.wasInside = now;
        const x = p.group.position.x, z = p.group.position.z;
        spawnGibs(x, 20, z, 10, tank.chargeDirX, tank.chargeDirZ, 2.0, 0x8a8378, 0.4, TANK_FLUID);
        spawnGroundPuff(x, z, 0xcbbfa6, 10, 10);
        addCamShake(5);
        playSFX(sfxExplode);
    }
}

// Siapkan charge KEMBALI (fase 'away' selesai): teleport ke titik start ACAK
// di LUAR arena yang SEGARIS arah player dari pusat — S = home − dirKePlayer ×
// (jarak keluar analitik + acak) — sehingga arah datang charge = arah tempat
// player berada dan lintasannya berakhir TEPAT di pusat. Teleport tak terlihat
// (di luar jangkauan kamera yang dijepit camBounds).
function beginChargeBack(tank) {
    const T = CFG.campaign.bosses.tank;
    const a = tank.arena, p = tank.parts;
    const m = T.chargeOutMargin || 180;
    let bx = camera.position.x - tank.homeX, bz = camera.position.z - tank.homeZ;
    const bd = Math.hypot(bx, bz);
    if (bd < 1) { bx = -1; bz = 0; } else { bx /= bd; bz /= bd; }   // player tepat di pusat: fallback barat
    const extra = rand(0, 220);   // titik start acak — yang penting di luar arena
    // Jarak keluar dari home MELAWAN arah kandidat (e = -dir), analitik per sumbu
    const exitDist = (ex, ez) => {
        const tX = ex > 1e-6 ? (a.x1 + m - tank.homeX) / ex : ex < -1e-6 ? (a.x0 - m - tank.homeX) / ex : Infinity;
        const tZ = ez > 1e-6 ? (a.z1 + m - tank.homeZ) / ez : ez < -1e-6 ? (a.z0 - m - tank.homeZ) / ez : Infinity;
        return Math.min(tX, tZ) + extra;
    };
    // Arah dasar = ke player; DIDEFLEKSI bila segmen start->home bakal melintasi
    // bangkai heli (avoid) — mis. player di sisi seberang bangkai (2026-07-17).
    const dir = deflectDir(tank, bx, bz, (dx, dz) => {
        const dd = exitDist(-dx, -dz);
        return [tank.homeX - dx * dd, tank.homeZ - dz * dd, tank.homeX, tank.homeZ];
    });
    const dist = exitDist(-dir.x, -dir.z);
    p.group.position.x = tank.homeX - dir.x * dist;
    p.group.position.z = tank.homeZ - dir.z * dist;
    tank.chargeDirX = dir.x; tank.chargeDirZ = dir.z;
    tank.hullYaw = Math.atan2(dir.z, -dir.x);   // moncong hull (-X lokal) menghadap arah charge
    p.group.rotation.y = tank.hullYaw;
    tank.wasInside = false;
    tank.phase = 'chargeBack';
}

// ===== PAGAR LISTRIK: player dalam radius shockRadiusMeters dari pusat tank
// tersengat shockDps HP/DETIK yang MENEMBUS ARMOR — HP dikurangi LANGSUNG,
// sengaja TIDAK lewat damagePlayerHp (spesifikasi user: setrum mengabaikan
// armor; durability armor pun tak tergerus). godMode kebal (visual tetap
// tampil — konsisten titik damage lain); i-frame dodge = MELESET total.
// Umpan balik: busur petir tank->dada player tiap frame + percikan biru-es +
// flash merah + arah serangan (rate-limit 0.22 dtk) + jerit sfxHit tiap 1 dtk.
// Di luar radius: crackle kecil sesekali antara dua titik lambung acak =
// telegraf bahwa tank berlistrik (player belajar radius TANPA mati konyol).
function updateShock(tank, dt) {
    const T = CFG.campaign.bosses.tank;
    const R = (T.shockRadiusMeters || 0) * CAMP_M;
    const px = tank.parts.group.position.x, pz = tank.parts.group.position.z;
    const dx = camera.position.x - px, dz = camera.position.z - pz;
    const d = Math.hypot(dx, dz);
    if (R > 0 && d < R && player.hp > 0 && !dodgeInvuln) {
        if (!godMode) {
            player.hp -= (T.shockDps || 10) * dt;   // MENEMBUS armor: HP langsung
            if (player.hp <= 0) {
                player.hp = 0;
                startPlayerDeath(dx, dz);   // roboh menjauhi tank
            }
        }
        // busur petir dari tepi lambung terdekat ke dada player (bergetar tiap frame)
        const ux = dx / (d || 1), uz = dz / (d || 1);
        layZap(px + ux * 20, 14, pz + uz * 20,
            camera.position.x, camera.position.y - 3, camera.position.z);
        tank.shockFxT -= dt;
        if (tank.shockFxT <= 0) {
            tank.shockFxT = 0.22;
            // percikan LISTRIK biru-es menyembur dari badan (bukan darah merah — setrum)
            spawnBloodBurst(camera.position.x, camera.position.y - 4, camera.position.z,
                ux, uz, 3, 0.7, 2.6, 0x9fe2ff);
            flashDamage();
            showHitDir(attackerAngle(px, pz));
            addCamShake(0.5);
        }
        tank.shockSfxT -= dt;
        if (tank.shockSfxT <= 0) { tank.shockSfxT = 1.0; playSFX(sfxHit); }
        tank.idleZapT = 0.6;   // tunda crackle idle agar tak menimpa busur utama
        return;
    }
    // Tak ada yang tersengat: crackle idle 0.12 dtk tiap ~1-2 dtk di lambung
    tank.shockFxT = 0; tank.shockSfxT = 0;
    tank.idleZapT -= dt;
    if (tank.idleZapT <= -0.12) { tank.idleZapT = 0.9 + Math.random() * 1.1; hideZap(); return; }
    if (tank.idleZapT <= 0) {
        const a = Math.random() * 6.283, b = Math.random() * 6.283;
        layZap(px + Math.sin(a) * 24, 8 + Math.random() * 12, pz + Math.cos(a) * 14,
            px + Math.sin(b) * 24, 8 + Math.random() * 12, pz + Math.cos(b) * 14);
    } else hideZap();
}

// Belok sudut a menuju b dgn laju terbatas maxDelta (rad)
function turnAngle(a, b, maxDelta) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxDelta) return b;
    return a + Math.sign(d) * maxDelta;
}

function spinTracks(p, ph) {
    for (let i = 0; i < p.wheels.length; i++) p.wheels[i].rotation.x = ph;   // roda gigi berputar
}

// Tank MENABRAK dinding ujung timur: serpihan beton + debu + guncangan; stage4
// menyembunyikan panel gerbangnya lewat callback onWallSmash (bila di-set).
function smashWall(tank) {
    const wx = tank.wallX, wz = tank.homeZ;
    spawnGibs(wx, 22, wz, 12, -1, 0, 2.2, 0x8a8378, 0.4, TANK_FLUID);      // pecahan beton (terlempar ke barat)
    spawnGibs(wx, 14, wz, 8, -0.6, 0.5, 1.6, 0x6f6a60, 0.4, TANK_FLUID);
    spawnGroundPuff(wx, wz, 0xcbbfa6, 12, 12);
    spawnGroundPuff(wx, wz + 14, 0xcbbfa6, 8, 8);
    spawnGroundPuff(wx, wz - 14, 0xcbbfa6, 8, 8);
    addCamShake(6);
    playSFX(sfxExplode);
    if (typeof tank.onWallSmash === 'function') tank.onWallSmash();
}

// Telegraf charge di muzzle senjata yang akan menembak (idx = nextIdx). Hanya
// MENAIKKAN (peluruhan glow ditangani di puncak fase battle). MG tak ada charge.
function applyCharge(tank, idx) {
    const p = tank.parts, k = tank.chargeK;
    if (idx === 0) p.cannonFlash.material.opacity = Math.max(p.cannonFlash.material.opacity, k * 0.5);
    else if (idx === 2) p.mortarGlow.material.opacity = Math.max(p.mortarGlow.material.opacity, k * 0.9);
}

// ===== Mulai serangan sesuai attackIdx (0 meriam, 1 senapan mesin, 2 mortar) =====
function launchAttack(tank) {
    tank.chargeK = 0;
    const T = CFG.campaign.bosses.tank;
    if (tank.attackIdx === 0) {
        fireCannon(tank);
        tank.blastPending = true;   // jeda gapSec dimulai SETELAH shell meledak (detonate)
    } else if (tank.attackIdx === 1) {
        tank.mgLeft = T.mgBurst || 10; tank.mgTimer = 0; tank.aiming = true;
        // (senapan mesin tak meledak -> cd = gapSec di-set saat burst selesai)
    } else {
        // MORTAR: burst `mortarBurst` tembakan berjeda `mortarBurstGapSec`
        // (handler di updateTank). blastPending di-set sekarang -> cd beku selama
        // burst + terbang; jeda gapSec baru dimulai saat mortar TERAKHIR meledak.
        tank.mortarLeft = T.mortarBurst || 3;
        tank.mortarTimer = 0;   // tembakan pertama langsung frame berikutnya
        tank.blastPending = true;
    }
}

// --- MERIAM: 1 peluru meledak-saat-tiba ke posisi player saat menembak ---
function fireCannon(tank) {
    const p = tank.parts;
    p.cannonMuzzle.getWorldPosition(_wp);
    const tx = camera.position.x, tz = camera.position.z;
    const dx = tx - _wp.x, dz = tz - _wp.z;
    const dist = Math.hypot(dx, dz) || 1;
    const m = new THREE.Mesh(GEO.grenade, new THREE.MeshLambertMaterial({ color: 0x2b2b2b, emissive: 0x552200 }));
    m.scale.setScalar(1.6);
    m.position.copy(_wp);
    scene.add(m);
    tank.pendingId++;
    tank.shells.push({
        mesh: m, dirx: dx / dist, dirz: dz / dist,
        speed: CFG.campaign.bosses.tank.cannonShellSpeed || 7,
        tx, tz, travelled: 0, dist, life: 220, id: tank.pendingId
    });
    p.cannonFlash.material.opacity = 1;
    playSFX(sfxExplode);
    addCamShake(2.4);
}

function updateShells(tank, dt, step) {
    for (let i = tank.shells.length - 1; i >= 0; i--) {
        const s = tank.shells[i];
        const dpos = s.speed * step;
        s.mesh.position.x += s.dirx * dpos;
        s.mesh.position.z += s.dirz * dpos;
        s.travelled += dpos; s.life -= step;
        if (s.travelled >= s.dist || s.life <= 0) {
            const R = CFG.grenade.killRadius * (CFG.campaign.bosses.tank.cannonBlastRatio || 0.3);
            detonate(tank, s.mesh.position.x, s.mesh.position.z, R, CFG.campaign.bosses.tank.cannonDamage || 50, s.id);
            scene.remove(s.mesh); tank.shells.splice(i, 1);
        }
    }
}

// --- SENAPAN MESIN KOAKSIAL (2026-07-17: PINDAH dari bola glacis hull ke
// TURRET, di samping meriam): muzzle anak turret — ikut berputar bersama turret
// yang melacak player — dan tiap peluru MEMBIDIK posisi player SAAT INI (pola
// pra-kerucut). Kerucut depan mgConeDeg + rotasi hull dihapus bersama pindahnya
// MG (badan tank diam; mgConeDeg & hullTurnRadPerSec di config kini DORMAN). ---
function fireMG(tank) {
    const p = tank.parts;
    p.mgMuzzle.getWorldPosition(_wp);
    const dx = camera.position.x - _wp.x, dz = camera.position.z - _wp.z;
    const d = Math.hypot(dx, dz) || 1;
    const m = new THREE.Mesh(GEO.bullet, MAT.enemyBullet);
    m.scale.setScalar(1.15);
    m.position.copy(_wp);
    scene.add(m);
    enemyBullets.push({
        mesh: m, dir: new THREE.Vector3(dx / d, 0, dz / d),
        speed: CFG.campaign.bosses.tank.mgBulletSpeed || 4, life: CFG.robot.rangedBulletLife,
        dmg: CFG.campaign.bosses.tank.mgDamage || 5, monasDmg: 0,
        px: _wp.x, py: _wp.y, pz: _wp.z
    });
    playSFX(sfxTankMG);   // rentetan MG tank (boss-tank/tank-machine-gun, 2026-07-19)
}

// --- MORTAR: 1 proyektil LOB PARABOLA (balistik, gravitasi) ke posisi player
// saat menembak — BUKAN homing. LENGKUNG DIROMBAK 2026-07-16 ("parabola aneh"):
// dulu waktu-terbang = jarak/mortarSpeed lalu vy diturunkan darinya — pada
// sasaran DEKAT vy jadi NEGATIF (shell menukik DATAR seperti peluru, bukan
// mortir). Kini LOB BER-APEX sejati: puncak lengkung = titik tertinggi kedua
// ujung + max(mortarApexMeters, jarak × mortarApexRatio) — SELALU melambung
// tinggi dulu (dekat = lob hampir vertikal, jauh = parabola panjang). Waktu
// terbang murni gravitasi: naik √(2·hUp/g) + turun √(2·hDown/g); kecepatan
// mendatar = jarak/waktu (mortarSpeed kini DORMAN). Titik jatuh MENGEJAR player
// selama terbang dan TERKUNCI mortarLockSec sebelum mendarat (2026-07-17,
// lihat updateMortars) — hindari dgn bergerak di detik terakhir / tumble. ---
function fireMortar(tank) {
    const p = tank.parts;
    p.mortarMuzzle.getWorldPosition(_wp);
    const T = CFG.campaign.bosses.tank;
    const sx = _wp.x, sy = _wp.y, sz = _wp.z;
    const dx = camera.position.x - sx, dz = camera.position.z - sz;
    const d = Math.hypot(dx, dz) || 1;
    const g = T.mortarGravity || 90;                     // gravitasi lob (units/detik^2)
    const landY = 5;                                     // tinggi ledakan (sejajar player)
    // puncak dibatasi agar waktu terbang selalu < mortarMaxSec (sasaran SANGAT
    // jauh tetap terkejar — lob panjang cepat, bukan kedaluwarsa di udara)
    const riseCap = 0.5 * g * Math.pow((T.mortarMaxSec || 6) * 0.45, 2);
    const rise = Math.min(riseCap,
        Math.max((T.mortarApexMeters || 12) * CAMP_M, d * (T.mortarApexRatio || 0.25)));
    const apexY = Math.max(sy, landY) + rise;            // puncak lengkung (koordinat dunia)
    const tUp = Math.sqrt(2 * (apexY - sy) / g);
    const tDown = Math.sqrt(2 * (apexY - landY) / g);
    const flight = tUp + tDown;                          // waktu terbang (detik)
    const vx = dx / flight, vz = dz / flight;            // units/detik mendatar
    const vy = g * tUp;                                  // SELALU ke atas (lob sejati)
    const m = mortarShell();          // shell mortir realistis (ogive zaitun + sirip + fuze)
    m.position.set(sx, sy, sz);
    scene.add(m);
    spawnGroundPuff(sx, sz, 0xcbd2da, 3, sy);            // kepulan tembak di mulut tabung
    tank.pendingId++;
    tank.mortars.push({
        mesh: m, vx, vz, vy, g, landY, trailT: 0,
        tLeft: flight,   // sisa waktu terbang — utk pengejaran + penguncian titik jatuh (updateMortars)
        snd: null,       // node desing "incoming" (menyala INCOMING_SEC sebelum mendarat)
        life: (T.mortarMaxSec || 6) * 60, id: tank.pendingId
    });
    p.mortarGlow.material.opacity = 1;
    playSFX(sfxTankMortar);   // "bloop" tabung mortar (boss-tank/tank-mortar-shot, 2026-07-19)
    addCamShake(1.2);
}

function updateMortars(tank, dt, step) {
    const T = CFG.campaign.bosses.tank;
    for (let i = tank.mortars.length - 1; i >= 0; i--) {
        const mo = tank.mortars[i];
        // TITIK JATUH MENGEJAR PLAYER (2026-07-17): selama sisa terbang masih
        // > mortarLockSec, kecepatan mendatar dikoreksi tiap frame agar titik
        // jatuh = posisi player SAAT INI; memasuki mortarLockSec (0.5 dtk)
        // terakhir titik jatuh TERKUNCI (= posisi player saat penguncian) —
        // jendela menghindar player memang tinggal sesingkat itu. Gerak
        // VERTIKAL murni gravitasi (lengkung lob ber-apex tak berubah).
        // Mortar tanpa tLeft (injeksi test lama) = parabola murni tanpa kejar.
        if (mo.tLeft != null) {
            mo.tLeft -= dt;
            if (mo.tLeft > (T.mortarLockSec || 0.5)) {
                mo.vx = (camera.position.x - mo.mesh.position.x) / mo.tLeft;
                mo.vz = (camera.position.z - mo.mesh.position.z) / mo.tLeft;
            }
        }
        mo.vy -= mo.g * dt;                              // gravitasi (parabola)
        mo.mesh.position.x += mo.vx * dt;
        mo.mesh.position.y += mo.vy * dt;
        mo.mesh.position.z += mo.vz * dt;
        // Hadapkan HIDUNG (+Y lokal) sepanjang arah gerak -> naik miring ke atas,
        // lalu MENUKIK nose-first saat menurun (bukan tumbling acak).
        _vv.set(mo.vx, mo.vy, mo.vz);
        if (_vv.length() > 1e-3) { _vv.normalize(); mo.mesh.quaternion.setFromUnitVectors(_UP, _vv); }
        // jejak ASAP tipis di belakang shell (puff kelabu kecil, menumpang pool
        // explosions — hidup singkat, jadi hanya beberapa aktif per shell)
        mo.trailT = (mo.trailT || 0) - dt;
        if (mo.trailT <= 0) {
            mo.trailT = 0.12;
            spawnGroundPuff(mo.mesh.position.x, mo.mesh.position.z, 0x8a8f96, 1.6, mo.mesh.position.y);
        }
        mo.life -= step;
        // DESING MORTAR DATANG (2026-07-19, permintaan user — durasi PAS):
        // menyala saat sisa terbang <= INCOMING_SEC (jadi tak pernah berbunyi
        // sebelum ditembakkan), dan DIHENTIKAN PAKSA saat meledak di bawah.
        if (mo.tLeft != null && mo.tLeft <= INCOMING_SEC && !mo.snd)
            mo.snd = playSFX(sfxTankIncoming, 0.6);
        // meledak saat proyektil MENDARAT (menurun melewati landY) / umur habis
        if ((mo.vy < 0 && mo.mesh.position.y <= mo.landY) || mo.life <= 0) {
            stopLoopSFX(mo.snd);   // desing berhenti TEPAT saat ledakan (tak tersisa)
            const R = CFG.grenade.killRadius * (T.mortarBlastRatio || 0.35);
            detonate(tank, mo.mesh.position.x, mo.mesh.position.z, R, T.mortarDamage || 50, mo.id);
            scene.remove(mo.mesh); tank.mortars.splice(i, 1);
        }
    }
}

// Jeda antar-serangan: saat ENRAGE (HP < enrageHpFrac × maxHp) pakai
// enrageGapSec yang lebih cepat, selain itu gapSec normal.
function gapFor(tank) {
    const T = CFG.campaign.bosses.tank;
    const enraged = tank.hp < tank.maxHp * (T.enrageHpFrac || 0.5);
    return (enraged && T.enrageGapSec) ? T.enrageGapSec : T.gapSec;
}

// Ledakan proyektil (meriam/mortar): AoE ke player via queueBoom (hurtPlayer;
// armor/godMode/i-frame dodge ditangani processPendingBooms). Saat proyektil
// serangan yang menanti meledak -> MULAI jeda `gapSec` (BUKAN langsung menembak
// lagi): set cd penuh + lepas blastPending supaya cooldown baru dihitung.
function detonate(tank, x, z, radius, damage, id) {
    queueBoom(x, 5, z, radius, true, damage, 1, sfxTankBlast);   // ledakan meriam/mortar = tank-explosive-attack (2026-07-19)
    if (tank && !tank.dead && id === tank.pendingId && tank.blastPending) {
        tank.blastPending = false;
        tank.cd = gapFor(tank);   // jeda BARU dimulai SETELAH ledakan (enrageGapSec saat enrage)
    }
}

// ===== KOLISI BADAN TANK (2026-07-17): player tidak bisa berjalan menembus
// tank — dorong keluar lingkaran bodyRadius dari pusat hull. Dipanggil dari
// playerCollide stage4 SETELAH resolve dinding/cover, jadi WASD, click-move,
// dan dodge semuanya ikut terhalang. Berlaku juga pada BANGKAI (wreck pejal). =====
export function resolveTankBlock(tank, pos) {
    if (!tank || !tank.parts) return;
    const R = CFG.campaign.bosses.tank.bodyRadius || 26;
    const px = tank.parts.group.position.x, pz = tank.parts.group.position.z;
    const dx = pos.x - px, dz = pos.z - pz;
    const d = Math.hypot(dx, dz);
    if (d >= R) return;
    if (d < 0.001) { pos.x = px + R; return; }   // tepat di pusat: dorong ke timur
    pos.x = px + (dx / d) * R;
    pos.z = pz + (dz / d) * R;
}

// ===== Hit-test peluru PLAYER -> tank (tank di luar array robots) =====
function tankBulletHits(tank) {
    const p = tank.parts;
    const cx = p.group.position.x, cz = p.group.position.z;
    const R = CFG.campaign.bosses.tank.hitRadius || 18;
    const R2 = R * R;
    for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const bx = b.mesh.position.x, bz = b.mesh.position.z;
        if (segPointDist2(b.px, 0, b.pz, bx, 0, bz, cx, 0, cz) < R2) {
            if (b.explosive) {
                // Peluru Grenade Launcher: damage LANGSUNG ke tank + boom visual
                queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage, b.boomSfx);
                damageTank(tank, b.damage != null ? b.damage : CFG.grenade.damage);
            } else {
                const dmg = (b.damage != null ? b.damage : CFG.weapons.bulletDamage) * (player.dmgMul || 1);
                stats.hits++;
                damageTank(tank, dmg);
                // percikan bunga api di titik tumbuk (visual)
                spawnBloodBurst(bx, 14 + Math.random() * 6, bz, b.dir.x, b.dir.z, 2, 0.5, 1.4, 0xffb24a);
            }
            scene.remove(b.mesh); bullets.splice(j, 1);
            if (tank.dead) return;
        }
    }
}

// Tint SEMUA material cat ke arah MERAH sebesar k×HIT_TINT (k 1→0 selama kilat
// memudar; k=0 = warna dasar persis dari paintBase). Hanya mengubah NILAI warna
// material Lambert yang sudah ada (setHex) — tanpa material/shader baru.
function applyHitFlash(tank, k) {
    const p = tank.parts, t = k * HIT_TINT;
    for (let i = 0; i < p.paintMats.length; i++) {
        const base = p.paintBase[i];
        const br = base >> 16 & 255, bg = base >> 8 & 255, bb = base & 255;
        const r = Math.round(br + (255 - br) * t);   // merah naik ke arah 255
        const g = Math.round(bg * (1 - t));          // hijau/biru turun -> rona memerah
        const b = Math.round(bb * (1 - t));
        p.paintMats[i].color.setHex(r << 16 | g << 8 | b);
    }
}

export function damageTank(tank, dmg) {
    if (tank.dead) return;
    tank.hitT = 1;   // picu kilat merah tertembak (dipudarkan updateTank)
    tank.hp -= Math.max(1, dmg);
    if (tank.hp <= 0) killTank(tank);
}

// Buang SEKETIKA semua proyektil tank yang masih terbang (shell meriam + mortar)
// DAN peluru senapan mesin di enemyBullets — dipanggil saat tank hancur supaya
// bangkainya TIDAK bisa lagi mencelakai player (permintaan user 2026-07-18).
// Proyektil hilang tanpa meledak (tak ada AoE susulan). Aman menghapus SELURUH
// enemyBullets: di duel stage 4 semua robot sudah mati -> satu-satunya sumber
// peluru musuh = MG tank.
function clearTankProjectiles(tank) {
    for (const s of tank.shells) scene.remove(s.mesh);
    tank.shells.length = 0;
    for (const m of tank.mortars) { stopLoopSFX(m.snd); scene.remove(m.mesh); }
    tank.mortars.length = 0;
    for (let i = enemyBullets.length - 1; i >= 0; i--) { scene.remove(enemyBullets[i].mesh); enemyBullets.splice(i, 1); }
}

// ===== KEMATIAN: ledakan besar berantai + serpihan + turret terangkat, lalu
// bangkai membara. Skor boss diberikan. stage4 mendeteksi tank.dead. =====
function killTank(tank) {
    tank.dead = true; tank.hp = 0; tank.deathT = 0;
    hideZap();   // listrik padam bersama tank
    stopTankAudio(tank);          // loop gerak/turret mati seketika (2026-07-19)
    clearTankProjectiles(tank);   // shell/mortar/peluru MG terbang -> lenyap (tak melukai player)
    addScore(tank.score);
    stats.kills++;
    const p = tank.parts, px = p.group.position.x, pz = p.group.position.z;
    // gelapkan cat (bangkai hangus)
    p.paintMats.forEach(m => m.color && m.color.setHex(0x20211c));
    // ledakan besar + serpihan logam ke segala arah — suara khusus
    // boss-tank/tank-explode (2026-07-19) lewat param sfx explodeAt.
    explodeAt(new THREE.Vector3(px, 16, pz), 30, 1, sfxTankExplode);
    spawnGibs(px, 18, pz, 14, 1, 0, 2.2, 0x3d444c, 0.4, TANK_FLUID);
    spawnGibs(px, 14, pz, 10, -1, 0.4, 1.8, 0x20211c, 0.4, TANK_FLUID);
    spawnBloodDecal(px, pz, 8, TANK_FLUID);
    addCamShake(9);
    updateUI();
}

function updateDeath(tank, dt) {
    const p = tank.parts;
    tank.deathT += dt;
    // beberapa kepulan asap/ledakan susulan ~1.6 dtk; turret TERANGKAT & MIRING
    // (terlempar dari cincin — rest y baru = 21 pasca-overhaul Tiger)
    p.turret.position.y += (24.5 - p.turret.position.y) * Math.min(1, dt * 2);
    p.turret.rotation.z += (0.32 - p.turret.rotation.z) * Math.min(1, dt * 2);
    if (tank.deathT < 1.8 && Math.random() < 0.25) {
        const px = p.group.position.x + (Math.random() - 0.5) * 30;
        const pz = p.group.position.z + (Math.random() - 0.5) * 18;
        spawnGroundPuff(px, pz, 0x2a2622, 6 + Math.random() * 5, 8 + Math.random() * 10);
        if (Math.random() < 0.4) explodeAt(new THREE.Vector3(px, 12, pz), 8, 1);
    }
}
