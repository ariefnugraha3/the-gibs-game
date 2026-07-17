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
import { playSFX, sfxExplode, sfxShoot, sfxShotgun, sfxHit } from '../utils/sfx.js';
import { updateUI } from '../core/hud.js';
import { flashDamage, showHitDir } from '../core/dom.js';
import { startPlayerDeath } from '../core/game.js';

const _wp = new THREE.Vector3();   // scratch getWorldPosition
// KILAT TERTEMBAK (2026-07-17): porsi tint MERAH maksimum pada cat saat peluru
// player mengenai tank — permintaan user: SEDIKIT saja, 10% dari 100% — dan lama
// pudarnya. Visual murni (konvensi: konstanta visual tinggal di kode, bukan CFG).
const HIT_TINT = 0.10;
const HIT_FLASH_SEC = 0.15;
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

// ===== Bangun mesh tank prosedural — DIROMBAK TOTAL 2026-07-15 mengacu bentuk
// TANK TIGER I Jerman PD2 (lambung boxy sisi-tegak yang menggantung di atas
// track, roda jalan besar saling-tumpang, meriam 88 mm panjang + rem moncong
// dobel-baffle, mantlet, kubah komandan, kotak stowage buritan, spatbor, alat,
// mata rantai cadangan di glacis). CAT DIGANTI 2026-07-16 ke skema faksi robot
// 2045 (gunmetal gelap + lensa sensor merah, panduan gaya world/palette.js) —
// bentuk Tiger I tetap. Primitif murah
// (Lambert/Basic = program shader yang SUDAH dipanaskan → tanpa recompile).
// KONTRAK MEKANIK TAK BERUBAH: FRONT = -X (ke player); HULL diam, TURRET (anak)
// berputar (turret.rotation.y) & cannon = +Z lokal; muzzle anchor sbg titik
// spawn proyektil; `wheels[]` diputar spinTracks (rotation.x); `paintMats[]`
// dihanguskan saat mati. Nilai muzzle sekadar kosmetik (proyektil terbang ke
// player) — hit-test & damage tak bergantung padanya. =====
export function buildTankMesh() {
    const group = new THREE.Group();
    const paintMats = [];   // cat bodi (dihanguskan saat mati)

    // --- Material (di-share; Lambert = 1 program shader, tanpa recompile) ---
    // Cat 2045 (panduan gaya world/palette.js): gunmetal gelap faksi robot —
    // senada rangka robot & warna armor boss, BUKAN dunkelgelb WWII lagi.
    const armor = new THREE.MeshLambertMaterial({ color: 0x474d41 });    // abu-zaitun gelap (bodi+turret)
    const armorDk = new THREE.MeshLambertMaterial({ color: 0x363b33 });  // panel bayangan/bawah
    const camoGrn = new THREE.MeshLambertMaterial({ color: 0x2f353b });  // tambalan kamuflase gunmetal
    const camoBrn = new THREE.MeshLambertMaterial({ color: 0x3d444c });  // tambalan senada serpihan robot
    const steel = new THREE.MeshLambertMaterial({ color: 0x71757d });    // logam terang (pelek/hub/kabel)
    const gun = new THREE.MeshLambertMaterial({ color: 0x1f2226 });      // gunmetal (laras/MG/knalpot)
    const track = new THREE.MeshLambertMaterial({ color: 0x34363a });    // rantai besi gelap
    const rubber = new THREE.MeshLambertMaterial({ color: 0x161618 });   // ban karet roda jalan
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a29 });     // gagang alat
    const glass = new THREE.MeshLambertMaterial({ color: 0x120404, emissive: 0x661010 }); // lensa sensor merah (senada mata robot)
    paintMats.push(armor, armorDk, camoGrn, camoBrn);

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
    // kolar meriam, laras (di +Z). Poros dibaked ke Z sekali via rotateX.
    const lat = (r1, r2, h, seg) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.rotateX(Math.PI / 2); return g; };

    // ===================== LAMBUNG BAWAH (bak) =====================
    mk(new THREE.BoxGeometry(52, 8, 26), armorDk, 1, 8, 0, group);

    // ===================== TRACK + RODA (kiri z-, kanan z+) =====================
    // Roda jalan Tiger: BESAR & saling tumpang. Geo ban dibaked poros ke sumbu-X
    // lokal (rotateZ) supaya di dalam wrapper ber-rotasi Y 90° porosnya jadi Z
    // dunia (lateral, menghadap kamera) DAN spinTracks(rotation.x) = menggelinding.
    const tireGeo = new THREE.CylinderGeometry(6, 6, 5.4, 16); tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(2, 2, 5.8, 10); hubGeo.rotateZ(Math.PI / 2);
    const tracks = [], wheels = [];
    for (const side of [-1, 1]) {
        const zc = side * 13.5;
        tracks.push(mk(new THREE.BoxGeometry(56, 10, 9), track, 1, 5.5, zc, group));   // lintasan bawah
        mk(new THREE.BoxGeometry(50, 4, 8.6), track, 1, 15.5, zc, group);              // return run atas
        // sprocket depan (-X) & idler belakang (+X) — cakram lateral bergigi kasar
        mk(lat(6.6, 6.6, 6, 12), track, -27.5, 6.5, zc, group);
        mk(lat(6.6, 6.6, 6, 12), track, 29.5, 6.5, zc, group);
        mk(lat(3, 3, 6.4, 8), steel, -27.5, 6.5, zc, group, 0, 0, 0, true);
        mk(lat(3, 3, 6.4, 8), steel, 29.5, 6.5, zc, group, 0, 0, 0, true);
        // roda jalan besar saling tumpang (7 buah) — berputar (wheels[])
        for (let wx = -21; wx <= 23; wx += 6.2) {
            const ww = new THREE.Group();
            ww.position.set(wx, 6, zc); ww.rotation.y = Math.PI / 2; group.add(ww);
            const wheel = new THREE.Group(); ww.add(wheel);
            mk(tireGeo, rubber, 0, 0, 0, wheel, 0, 0, 0, true);
            mk(hubGeo, steel, 0, 0, 0, wheel, 0, 0, 0, true);
            wheels.push(wheel);
        }
        // spatbor/mudguard depan & belakang (menjorok di ujung track)
        mk(new THREE.BoxGeometry(16, 0.8, 11), armorDk, -24, 20, zc, group, 0, 0, -0.05);
        mk(new THREE.BoxGeometry(16, 0.8, 11), armorDk, 25, 20, zc, group, 0, 0, 0.05);
    }

    // ===================== SUPERSTRUKTUR (lambung atas, MENGGANTUNG) =====================
    // Tiger: dinding tegak yang melebar menutupi track. Lebar 36 (± track).
    mk(new THREE.BoxGeometry(50, 10, 36), armor, 1, 16.5, 0, group);
    mk(new THREE.BoxGeometry(50, 2, 36), armorDk, 1, 11.6, 0, group, 0, 0, 0, true);   // tepi bawah gelap

    // ----- GLACIS depan (-X): pelat miring + pelat pengemudi + visor + bola MG -----
    mk(new THREE.BoxGeometry(9, 11, 36), armor, -25, 16, 0, group, 0, 0, 0.34);        // glacis miring
    mk(new THREE.BoxGeometry(3.5, 13, 36), armorDk, -26.8, 10, 0, group);              // pelat bawah tegak
    mk(new THREE.BoxGeometry(1.6, 2.6, 6), gun, -29.3, 17.5, 8, group, 0, 0, 0.34, true);   // celah visor sopir
    // mata rantai cadangan tergantung di glacis (ikonik) — sebaris di sumbu Z
    for (let sz = -12; sz <= 12; sz += 4) mk(new THREE.BoxGeometry(4, 3.4, 3), track, -29.5, 13.5, sz, group, 0, 0, 0.34, true);

    // (bola MG glacis DIHAPUS 2026-07-17 — senapan mesin pindah KOAKSIAL ke turret)
    // lampu depan
    mk(lat(1.5, 1.5, 1.6, 10), steel, -27, 20.4, 10.5, group, 0, 0, 0, true);
    mk(lat(1.1, 1.1, 0.5, 10), glass, -27, 20.4, 11.4, group, 0, 0, 0, true);

    // ----- DEK MESIN belakang (+X): pelat + kisi + knalpot + pelat buritan -----
    mk(new THREE.BoxGeometry(15, 1.4, 30), armorDk, 22, 21.8, 0, group);
    for (let gz = -9; gz <= 9; gz += 4.4) mk(new THREE.BoxGeometry(12, 0.8, 2.6), gun, 22, 22.6, gz, group, 0, 0, 0, true);
    for (const ez of [-11, 11]) {
        mk(new THREE.CylinderGeometry(1.8, 2.1, 9, 10), gun, 27.5, 20, ez, group);         // knalpot tegak
        mk(new THREE.CylinderGeometry(2.1, 2.1, 1.4, 10), track, 27.5, 24.7, ez, group, 0, 0, 0, true);
    }
    mk(new THREE.BoxGeometry(3, 13, 34), armor, 28.7, 15.5, 0, group);                       // pelat buritan
    // alat di sisi kanan (z+, menghadap kamera): sekop + kapak + kabel derek
    mk(new THREE.BoxGeometry(15, 1.1, 1.1), wood, -6, 20.6, 18.3, group, 0, 0, 0, true);
    mk(new THREE.BoxGeometry(3.4, 1.6, 1.2), steel, 3, 20.6, 18.3, group, 0, 0, 0, true);
    mk(new THREE.BoxGeometry(11, 1.0, 1.0), wood, 13, 20.6, 18.3, group, 0, 0, 0, true);
    mk(new THREE.BoxGeometry(20, 0.6, 0.6), steel, -2, 18.5, 18.4, group, 0, 0.05, 0, true);   // kabel derek

    // ===================== TURRET berputar (anak). Cannon = +Z lokal =====================
    const turret = new THREE.Group();
    turret.position.set(3, 21, 0);
    group.add(turret);
    mk(new THREE.CylinderGeometry(14.5, 15, 2, 20), armorDk, 0, 0.5, -1, turret, 0, 0, 0, true);   // cincin
    mk(new THREE.CylinderGeometry(13.5, 14.2, 9, 24), armor, 0, 5.5, -1, turret);                  // drum turret (sisi tegak)
    mk(new THREE.CylinderGeometry(13.6, 13.6, 0.9, 24), armorDk, 0, 10.3, -1, turret, 0, 0, 0, true); // atap
    mk(new THREE.CylinderGeometry(2, 2, 1, 12), armorDk, 5, 10.9, -4, turret, 0, 0, 0, true);       // ventilator
    // muka datar + mantlet bulat (Saukopf-ish) di depan (+Z)
    mk(new THREE.BoxGeometry(19, 9, 3), armor, 0, 5.5, 12.5, turret);
    mk(lat(5.4, 5.4, 5, 16), gun, 0, 5.5, 14.5, turret);
    // ----- MERIAM 88 mm (L/56) ke +Z: pangkal tebal + laras panjang + rem moncong dobel-baffle -----
    mk(lat(2.7, 2.9, 6, 14), gun, 0, 5.5, 18, turret);
    mk(lat(1.7, 1.8, 30, 14), gun, 0, 5.5, 34, turret);
    // rem moncong BULAT (bukan kotak) + dua flens + PORT samping gelap + LUBANG
    // BORE hitam di muka → laras terlihat BERONGGA/berlubang, bukan balok pejal.
    const bore = new THREE.MeshBasicMaterial({ color: 0x070707 });   // Basic gelap = "lubang" (sudah dipanaskan)
    mk(lat(2.7, 2.6, 4.8, 16), gun, 0, 5.5, 50.6, turret);          // badan rem moncong (silinder)
    mk(lat(3.0, 3.0, 0.8, 18), gun, 0, 5.5, 48.4, turret, 0, 0, 0, true);   // flens belakang
    mk(lat(3.0, 3.0, 0.8, 18), gun, 0, 5.5, 52.8, turret, 0, 0, 0, true);   // flens depan
    mk(new THREE.BoxGeometry(1.3, 2.4, 2.4), bore, 2.9, 5.5, 50.6, turret, 0, 0, 0, true);   // port ventilasi kanan
    mk(new THREE.BoxGeometry(1.3, 2.4, 2.4), bore, -2.9, 5.5, 50.6, turret, 0, 0, 0, true);  // port ventilasi kiri
    mk(lat(1.05, 1.05, 4.0, 14), bore, 0, 5.5, 51.4, turret, 0, 0, 0, true);   // LUBANG BORE (rongga laras)
    // ----- SENAPAN MESIN KOAKSIAL (2026-07-17: PINDAH dari bola glacis hull ke
    // TURRET, di samping meriam — anchor muzzle anak turret sehingga MG ikut
    // berputar melacak player bersama turret; badan tank kini diam) -----
    mk(new THREE.BoxGeometry(2.0, 2.0, 4.6), gun, 3.6, 5.6, 16.4, turret, 0, 0, 0, true);   // rumah MG di mantlet
    mk(lat(0.6, 0.6, 10, 8), gun, 3.6, 5.6, 22, turret, 0, 0, 0, true);                     // laras koaksial
    mk(lat(0.85, 0.85, 1.3, 8), gun, 3.6, 5.6, 26.6, turret, 0, 0, 0, true);                // penekan kilat moncong
    const mgMuzzle = new THREE.Object3D(); mgMuzzle.position.set(3.6, 5.6, 27.5); turret.add(mgMuzzle);
    const cannonMuzzle = new THREE.Object3D(); cannonMuzzle.position.set(0, 5.5, 53.6); turret.add(cannonMuzzle);
    const cannonFlash = new THREE.Mesh(GEO.explosion, new THREE.MeshBasicMaterial({
        color: 0xffd070, transparent: true, opacity: 0, toneMapped: false
    }));
    cannonFlash.scale.setScalar(3.5); cannonFlash.position.copy(cannonMuzzle.position); turret.add(cannonFlash);

    // ----- KUBAH KOMANDAN (cupola) kiri-belakang atap + blok pandang periskop -----
    mk(new THREE.CylinderGeometry(3.6, 3.8, 4.2, 16), armor, -6.5, 12.4, -6, turret);
    mk(new THREE.CylinderGeometry(4.1, 4.1, 0.8, 16), armorDk, -6.5, 14.7, -6, turret, 0, 0, 0, true);
    for (let a = 0; a < 6; a++) {
        const ang = a / 6 * Math.PI * 2;
        mk(new THREE.BoxGeometry(1.3, 1.9, 1), gun, -6.5 + Math.cos(ang) * 3.7, 12.4, -6 + Math.sin(ang) * 3.7, turret, 0, -ang, 0, true);
    }
    // kotak stowage buritan turret (Rommelkiste) + antena
    mk(new THREE.BoxGeometry(17, 6, 5), armorDk, 0, 4.5, -15.5, turret);
    mk(new THREE.CylinderGeometry(0.18, 0.18, 18, 5), gun, -10, 13, -7, turret, 0, 0, 0, true);

    // ----- TABUNG MORTAR di BELAKANG turret, MENGHADAP KE DEPAN (condong
    // atas-DEPAN, +Z) — menembak lob PARABOLA ke arah player (rotation.x +0.6
    // memiringkan ujung tabung ke +Z/depan-atas; muzzle di ujung depan-atas) -----
    mk(new THREE.BoxGeometry(6, 4, 6), armorDk, 0, 9, -6, turret);                            // dudukan (di atap belakang)
    mk(new THREE.CylinderGeometry(2.4, 2.7, 13, 12), gun, 0, 13, -2.5, turret, 0.6, 0, 0);    // tabung condong ke depan-atas
    mk(new THREE.CylinderGeometry(2.7, 2.7, 1, 12), track, 0, 16.4, 0.6, turret, 0.6, 0, 0, true);   // bibir depan
    const mortarMuzzle = new THREE.Object3D(); mortarMuzzle.position.set(0, 18.2, 1.4); turret.add(mortarMuzzle);
    const mortarGlow = new THREE.Mesh(GEO.explosion, new THREE.MeshBasicMaterial({
        color: 0xff7a3a, transparent: true, opacity: 0, toneMapped: false
    }));
    mortarGlow.scale.setScalar(2.4); mortarGlow.position.copy(mortarMuzzle.position); turret.add(mortarGlow);

    // ===================== KAMUFLASE 3-warna (bercak tipis, terutama ATAP & sisi +Z) =====================
    const camo = (m, w, h, d, x, y, z, parent, ry) => mk(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent, 0, ry, 0, true);
    camo(camoGrn, 15, 0.4, 11, -7, 21.7, 6, group);          // atap superstruktur
    camo(camoBrn, 12, 0.4, 9, 15, 21.7, -6, group);
    camo(camoGrn, 17, 6, 0.4, -3, 16.5, 18.25, group);       // sisi +Z (menghadap kamera)
    camo(camoBrn, 9, 5, 0.4, 17, 15.5, 18.25, group);
    camo(camoGrn, 9, 5, 0.3, 6, 5.5, 12.7, turret);          // depan turret
    camo(camoBrn, 7, 6, 0.3, -11.5, 5, 3, turret, 0.5);      // sisi turret

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
        shells: [], mortars: [],
        turretYaw: Math.atan2((faceX != null ? faceX : homeX - 300) - homeX, 0),
        // Mekanik ENRAGE/CHARGE (2026-07-17): hullYaw HANYA berubah dalam fase
        // charge (battle tak pernah memutar badan); arena di-inject scene.
        // `avoid` (opsional) = lingkaran {x,z,r} yang TIDAK BOLEH dilintasi
        // gerak charge (bangkai heli di pusat alun) — arah charge dideleksi
        // + slide per-frame (chargeMove) menjauhinya.
        hullYaw: 0, arena: arena || null, avoid: avoid || null,
        chargeDirX: 0, chargeDirZ: 0, awayLeft: 0, awayTimer: 0, wasInside: true,
        trackPhase: 0, chargeK: 0, onWallSmash: null
    };
}

export function disposeTank(tank) {
    if (!tank || !tank.parts) return;
    hideZap();   // busur petir di-share antar tank -> cukup disembunyikan
    tank.shells.forEach(s => scene.remove(s.mesh));
    tank.mortars.forEach(m => scene.remove(m.mesh));
    tank.parts.group.traverse(o => { if (o.isMesh && o.material && o.material.dispose) o.material.dispose(); });
    scene.remove(tank.parts.group);
    tank.parts = null;
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
    tank.turretYaw = turnAngle(tank.turretYaw, want, 2.2 * dt);
    p.turret.rotation.y = tank.turretYaw - tank.hullYaw;
    // kilat muzzle meredup tiap frame (di-nyalakan saat menembak / charge)
    p.cannonFlash.material.opacity *= 0.82;
    p.mortarGlow.material.opacity *= 0.9;

    // Hit-test peluru PLAYER (tank bukan anggota `robots` -> uji sendiri di sini)
    tankBulletHits(tank);
    if (tank.dead) return;

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
        // lalu siapkan charge kembali ke pusat arena.
        tank.awayTimer -= dt;
        if (tank.awayTimer <= 0) {
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
        if (tank.hullYaw === 0) {
            tank.phase = 'battle';
            tank.cd = gapFor(tank);
            tank.attackIdx = -1;   // wajib 1 siklus penuh lagi sebelum roll charge berikutnya
        }
        return;
    }

    // --- FASE BATTLE (badan diam; hanya turret yang berputar) ---
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
        spawnGibs(x, 20, z, 10, tank.chargeDirX, tank.chargeDirZ, 2.0, 0x8a8378, 0.4);
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
    spawnGibs(wx, 22, wz, 12, -1, 0, 2.2, 0x8a8378, 0.4);      // pecahan beton (terlempar ke barat)
    spawnGibs(wx, 14, wz, 8, -0.6, 0.5, 1.6, 0x6f6a60, 0.4);
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
    playSFX(sfxShoot);
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
        life: (T.mortarMaxSec || 6) * 60, id: tank.pendingId
    });
    p.mortarGlow.material.opacity = 1;
    playSFX(sfxShotgun);
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
        // meledak saat proyektil MENDARAT (menurun melewati landY) / umur habis
        if ((mo.vy < 0 && mo.mesh.position.y <= mo.landY) || mo.life <= 0) {
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
    queueBoom(x, 5, z, radius, true, damage, 1);
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
                queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage);
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

// ===== KEMATIAN: ledakan besar berantai + serpihan + turret terangkat, lalu
// bangkai membara. Skor boss diberikan. stage4 mendeteksi tank.dead. =====
function killTank(tank) {
    tank.dead = true; tank.hp = 0; tank.deathT = 0;
    hideZap();   // listrik padam bersama tank
    addScore(tank.score);
    stats.kills++;
    const p = tank.parts, px = p.group.position.x, pz = p.group.position.z;
    // gelapkan cat (bangkai hangus)
    p.paintMats.forEach(m => m.color && m.color.setHex(0x20211c));
    // ledakan besar + serpihan logam ke segala arah
    explodeAt(new THREE.Vector3(px, 16, pz), 30, 1);
    spawnGibs(px, 18, pz, 14, 1, 0, 2.2, 0x3d444c, 0.4);
    spawnGibs(px, 14, pz, 10, -1, 0.4, 1.8, 0x20211c, 0.4);
    spawnBloodDecal(px, pz, 8, 0x141210);
    addCamShake(9);
    playSFX(sfxExplode);
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
