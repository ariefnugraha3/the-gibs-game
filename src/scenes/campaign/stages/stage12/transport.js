// N.U.S.A. "GARUDA" — transport TILTROTOR VTOL siluman yang menurunkan Major
// Gibran di Medan Merdeka pada pembuka Stage 12.
//
// 2026-09-04, permintaan user: "bentuk pesawat yg dinaiki player di awal di
// stage 12 itu masih jelek dan terlalu basic seperti placeholder." Rig lama
// memang begitu — satu kotak badan, satu kerucut hidung, dua kotak sayap dan
// dua rotor berbilah lima; total 25 mesh yang terlihat seperti blocking model.
//
// Aset ini HERO: ia mendarat tepat di kaki player dan dibingkai rapat oleh
// kamera cutscene, jadi ia dibangun seperti helikopter/gunship — badan berfaset
// yang DILAS jadi beberapa draw call, dan hanya bagian yang benar-benar
// bergerak yang berdiri sendiri.
//
// EMPAT ATURAN YANG DIWARISI, bukan ditulis ulang di sini:
// (1) SEMUA pesawat memakai turbofan bercowl bersama `utility/turbofan.js` —
//     tak ada bilah yang digambar per stage lagi, dan `fanRadius` diturunkan
//     dari `cowlRadius` di modul itu sehingga kipas tak bisa tumbuh keluar cowl
//     dan kembali menjadi baling-baling.
// (2) NOL PointLight. Semua "lampu" adalah material emissive milik sendiri yang
//     dianimasikan lewat `emissiveIntensity` — nilai itu bukan bagian dari kunci
//     program shader r128, jadi menyalakannya tidak memicu rekompilasi.
// (3) Token PAL saja, emissive <= EMISSIVE_MAX, dan warna sinyal gameplay
//     (merah mata robot, hijau EXIT/coolant, biru plasma) tidak dipakai sebagai
//     dekor. Lampu navigasi memakai hazard/putih hangat, bukan hijau.
// (4) Deterministik — tak ada `Math.random()`; dunia Stage 12 dibangun bersama
//     seluruh dunia campaign saat loading.
//
// ORIENTASI LOKAL (dipertahankan dari rig lama supaya jalur terbang cutscene
// tidak ikut berubah): HIDUNG di -x, EKOR di +x, sayap membentang di z, atas +y.
// Nacelle turbofan menghadap +z lokalnya sendiri, jadi ia dibungkus grup
// ber-`rotation.y = -PI/2` agar dorongannya searah hidung (-x).

import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { mergeObjectInPlace } from '../../../../utils/meshBatch.js';
import { buildTurbofan } from '../../utility/turbofan.js';
import { clamp } from '../../../../utils/math.js';

// Ukuran badan: 96 unit ~ 13,7 m pada CAMP_M 7. Dipublikasikan supaya dunia dan
// tes membaca angka yang SAMA dengan yang digambar.
export const S12_TRANSPORT = Object.freeze({
    length: 96, span: 104, height: 46,
    noseX: -48, tailX: 48, nacelleZ: 42, wingY: 27,
    cowlRadius: 9.5, nacelleLength: 30, fanArms: 9,
});

// Sudut nacelle: 0 rad = arah jelajah (dorongan ke belakang, hidung ke depan),
// -PI/2 = hover (dorongan ke bawah). Sebuah tiltrotor yang diparkir berdiri di
// posisi hover, jadi itulah pose akhirnya.
const TILT_CRUISE = -0.16;
const TILT_HOVER = -Math.PI / 2;
const GEAR_STOW = -1.5;      // roda terlipat ke depan, masuk sponson
// Daun bay mengayun KE BAWAH: dengan offset panel di +z/-z, tanda ini yang
// menghasilkan -y. Versi pertama memakai tanda terbalik dan kedua pintunya
// mengayun ke ATAS menembus sponson.
const DOOR_OPEN = 1.15;
const RAMP_OPEN = 0.92;

const smooth = k => k * k * (3 - 2 * k);

function mat(color, opts = {}) {
    return new THREE.MeshLambertMaterial({ color, ...opts });
}

function glow(color, intensity) {
    return new THREE.MeshLambertMaterial({ color: PAL.ink,
        emissive: color, emissiveIntensity: Math.min(EMISSIVE_MAX, intensity) });
}

function bx(parent, m, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = true; o.receiveShadow = true; parent.add(o);
    o.userData.half = { x: sx / 2, y: sy / 2, z: sz / 2 };
    return o;
}

// Setengah-rentang kotak ber-Euler XYZ pada sumbu y dan z (AABB dari OBB, baris
// matriks yang bersangkutan) — sebuah chine yang diputar 45 derajat tidak boleh
// dihitung selebar diagonalnya, dan sebuah faset bahu yang dicondongkan tetap
// harus dihitung sejauh ia benar-benar menjulur.
function extents(rot, h) {
    const s1 = Math.sin(rot.x), c1 = Math.cos(rot.x);
    const s2 = Math.sin(rot.y), c2 = Math.cos(rot.y);
    const s3 = Math.sin(rot.z), c3 = Math.cos(rot.z);
    return {
        y: Math.abs(c1 * s3 + s1 * s2 * c3) * h.x
            + Math.abs(c1 * c3 - s1 * s2 * s3) * h.y + Math.abs(s1 * c2) * h.z,
        z: Math.abs(s1 * s3 - c1 * s2 * c3) * h.x
            + Math.abs(s1 * c3 + c1 * s2 * s3) * h.y + Math.abs(c1 * c2) * h.z,
    };
}

// Arah sebuah sumbu lokal setelah rotasi Euler XYZ. Dipakai untuk MEMBUKTIKAN
// ke mana sebuah bagian benar-benar menghadap, bukan menebaknya dari sudut yang
// tertulis — persis kelas cacat yang dilaporkan user 2026-09-04 ("ada yang
// seperti terbalik, ada yang kurang pas sudutnya").
function dir(rot, v) {
    const s1 = Math.sin(rot.x), c1 = Math.cos(rot.x);
    const s2 = Math.sin(rot.y), c2 = Math.cos(rot.y);
    const s3 = Math.sin(rot.z), c3 = Math.cos(rot.z);
    return {
        x: (c2 * c3) * v[0] + (-c2 * s3) * v[1] + s2 * v[2],
        y: (c1 * s3 + s1 * s2 * c3) * v[0] + (c1 * c3 - s1 * s2 * s3) * v[1]
            + (-s1 * c2) * v[2],
        z: (s1 * s3 - c1 * s2 * c3) * v[0] + (s1 * c3 + c1 * s2 * s3) * v[1]
            + (c1 * c2) * v[2],
    };
}

// Rentang AABB sebuah kotak ber-Euler XYZ pada KETIGA sumbu.
function ext3(rot, h) {
    const a = extents(rot, h);
    const s2 = Math.sin(rot.y), c2 = Math.cos(rot.y);
    const s3 = Math.sin(rot.z), c3 = Math.cos(rot.z);
    return { x: Math.abs(c2 * c3) * h.x + Math.abs(c2 * s3) * h.y
        + Math.abs(s2) * h.z, y: a.y, z: a.z };
}

// AUDIT CERMIN: setiap bagian di +z wajib punya pasangan di -z dengan BENTUK
// TERPROYEKSI yang identik. Diukur pada rentang AABB, bukan pada sudut Euler,
// karena dua sudut yang berbeda bisa menghasilkan bentuk yang sama (chine
// berpenampang bujur sangkar yang diputar +-45 derajat itu identik) — yang
// dicari adalah bagian yang benar-benar terpasang beda kiri dan kanan, seperti
// sirip ekor yang `ry`-nya lupa diberi tanda sisi.
function auditMirror(rig, group) {
    const parts = group.children.filter(o => o.userData?.half
        && Math.abs(o.position.z) > 1e-6);
    let pairs = 0, unmatched = 0, worst = 0;
    for (const o of parts) {
        if (o.position.z < 0) continue;
        const twin = parts.find(t => t.position.z < 0
            && Math.abs(t.position.x - o.position.x) < 1e-6
            && Math.abs(t.position.y - o.position.y) < 1e-6
            && Math.abs(t.position.z + o.position.z) < 1e-6);
        if (!twin) { unmatched++; continue; }
        const a = ext3(o.rotation, o.userData.half);
        const b = ext3(twin.rotation, twin.userData.half);
        worst = Math.max(worst, Math.abs(a.x - b.x),
            Math.abs(a.y - b.y), Math.abs(a.z - b.z));
        pairs++;
    }
    rig.mirror = { pairs, unmatched, worst };
}

// Seberapa lebar pesawat ini DI BAWAH sayap — angka yang menentukan apakah
// seseorang bisa berdiri di sampingnya tanpa berada di dalam badannya. Diukur
// dari kotak yang benar-benar dibangun, bukan dari niat pembuatnya.
function measureLowBody(rig, group) {
    const lowY = S12_TRANSPORT.wingY - 4;
    let half = 0;
    for (const o of group.children) {
        const h = o.userData?.half;
        if (!h) continue;
        const e = extents(o.rotation, h);
        if (o.position.y - e.y >= lowY) continue;      // sayap/punggung: di atas kepala
        half = Math.max(half, Math.abs(o.position.z) + e.z);
    }
    // Nacelle memutar di bidang x-y, jadi tiltnya TIDAK mengubah jangkauan z-nya
    // sama sekali; dalam pose hover ia menjulur ke bawah sampai setinggi orang.
    half = Math.max(half, S12_TRANSPORT.nacelleZ + S12_TRANSPORT.cowlRadius * 1.08);
    rig.lowHalfZ = half;
}

function shape(parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = true; o.receiveShadow = true; parent.add(o);
    return o;
}

// ---- Lambung: berfaset, berchine, dan DILAS jadi beberapa draw call --------
function buildHull(rig, M) {
    const g = new THREE.Group(); rig.group.add(g);
    const T = S12_TRANSPORT;

    // Keel + badan tengah + geladak atas: tiga massa bertingkat, bukan satu kotak.
    bx(g, M.body, 78, 5, 20, 2, 6.5, 0);
    bx(g, M.body, 72, 13, 19, 1, 14, 0);
    bx(g, M.deck, 58, 8, 15, -3, 22.5, 0);
    // Chine siluman: kotak diputar 45 derajat di sumbu x menjadi mata pisau.
    for (const s of [-1, 1]) {
        bx(g, M.trim, 80, 3.4, 3.4, 1, 10.2, s * 11.2, Math.PI / 4);
        bx(g, M.body, 66, 3.4, 9, 0, 19.6, s * 9.4, s * 0.62);
        bx(g, M.trim, 62, 0.9, 1.6, 0, 12.6, s * 10.6);       // garis panel
    }

    // Hidung: kerucut BERFASET 6 sisi (bukan bulat), plus radome bawah dan
    // dua chine sejajar.
    //
    // ARAH vs ROLL (Euler XYZ = Rx*Ry*Rz): `rz` PI/2 memetakan sumbu kerucut
    // (+y lokal) ke -x, yaitu hidung. Untuk memutar faset heksagonalnya pada
    // porosnya sendiri, roll harus ditulis di `rx` — yang berlaku SESUDAH rz,
    // jadi ia berputar mengelilingi sumbu -x yang baru. Menulisnya di `ry`
    // (versi pertama) justru MEMIRINGKAN sumbunya 30 derajat ke samping:
    // hidungnya benar-benar menghadap serong. Perangkap yang sama dengan
    // frond palem Stage 10.
    // Apex kerucut berada di setengah tingginya, jadi pusatnya diletakkan
    // sedemikian rupa sehingga ujungnya jatuh TEPAT di `noseX`.
    const nose = shape(g, new THREE.ConeGeometry(9.2, 27, 6), M.body,
        T.noseX + 13.5, 13.5, 0, Math.PI / 6, 0, Math.PI / 2);
    rig.axes.nose = dir(nose.rotation, [0, 1, 0]);          // sumbu kerucut
    bx(g, M.trim, 19, 3.2, 13, T.noseX + 13, 7.4, 0, 0, 0, 0.13);
    for (const s of [-1, 1])
        bx(g, M.trim, 20, 2.2, 2.2, T.noseX + 14, 11.4, s * 7.4, Math.PI / 4);

    // Kokpit: tiga faset bersudut + kusen + visor alis. Kacanya SENGAJA opak
    // (Lambert gelap + emissive lemah) supaya ikut terlas dan tidak masuk
    // antrean transparan.
    // RAKE KANOPI: dengan hidung di -x, normal kaca depan harus condong ke
    // -x (maju-dan-ke-atas), yang berarti `rz` POSITIF. Versi pertama memakai
    // rz negatif, yang mencondongkannya ke arah ekor — kanopinya terbaca
    // terpasang terbalik.
    const canopy = bx(g, M.glass, 13, 8, 13.4, -25, 25.2, 0, 0, 0, 0.44);
    rig.axes.canopy = dir(canopy.rotation, [0, 1, 0]);      // normal kaca depan
    for (const s of [-1, 1]) {
        bx(g, M.glass, 15, 6, 1.4, -20, 24, s * 7.2, 0, 0, 0.2);
        bx(g, M.trim, 15.4, 1.1, 1.1, -20, 26.8, s * 7.4, 0, 0, 0.2);
    }
    bx(g, M.trim, 10, 1.8, 14.6, -29.5, 28.4, 0, 0, 0, 0.42);
    bx(g, M.trim, 1.6, 8.6, 13.6, -18.6, 25.4, 0, 0, 0, 0.44);

    // Lambung tengah: pintu geser tersembunyi + kusen cekung + palka atap.
    for (const s of [-1, 1]) {
        bx(g, M.trim, 26, 12, 0.7, 6, 14.5, s * 9.9);
        bx(g, M.deck, 23, 10, 1.1, 6, 14.5, s * 10.2);
    }
    bx(g, M.deck, 17, 1.2, 11, 8, 26.6, 0);

    // Ekor: boom yang mendongak, dinding bukaan ramp, dan dua sirip kanard V.
    bx(g, M.body, 32, 11, 14, 33, 18.6, 0, 0, 0, 0.11);
    bx(g, M.trim, 7, 15, 17, 46, 18, 0, 0, 0, 0.11);
    // SIRIP V: cant di `rx` (bertanda, jadi simetris keluar) dan rake di `rz`
    // (top condong ke +x = tersapu ke belakang). `ry` versi pertama TIDAK
    // bertanda `s`, jadi sirip kiri toe-in sementara yang kanan toe-out —
    // persis "satu bagian terpasang terbalik". Ujung podnya diletakkan pada
    // ujung sirip yang SUDAH dimiringkan, bukan pada posisi tegaknya.
    for (const s of [-1, 1]) {
        const fin = bx(g, M.body, 21, 23, 3.2, 40, 32, s * 9.5, s * 0.46, 0, -0.16);
        if (s > 0) { rig.axes.fin = dir(fin.rotation, [0, 1, 0]); rig.axes.finZ = fin.position.z; }
        bx(g, M.trim, 8, 3.2, 3.6, 42, 42.2, s * 14.5, s * 0.46, 0, -0.16);
        bx(g, M.body, 15, 8, 2.6, 41, 6, s * 6.5, -s * 0.36);   // strake ventral
    }

    // Sayap bahu menyapu ke belakang dengan ujung anhedral, plus LERX yang
    // memanjang ke depan dari bahu — siluet inilah yang terbaca "modern".
    // SAPUAN: `ry` harus BERTANDA agar ujung sayap bergerak ke +x (ke arah
    // ekor). Versi pertama memakai tanda terbalik, jadi kedua sayap tersapu ke
    // DEPAN — siluet yang salah untuk sebuah transport, dan bertentangan dengan
    // pusat panel yang memang sudah mundur (x 3 -> 5 -> 9). LERX kebalikannya:
    // ia MENYEMPIT ke arah hidung, jadi tandanya negatif.
    bx(g, M.body, 22, 5.5, 27, 3, T.wingY, 0);
    for (const s of [-1, 1]) {
        const panel = bx(g, M.body, 17, 4, 23, 5, T.wingY + 0.4, s * 20, 0, s * 0.30);
        if (s > 0) rig.axes.wingSpan = dir(panel.rotation, [0, 0, 1]);
        bx(g, M.body, 13.5, 3.4, 17, 9, T.wingY + 0.2, s * 35, s * 0.14, s * 0.34);
        bx(g, M.trim, 3, 5, 12, 4, T.wingY + 4, s * 26, 0, s * 0.30);   // pagar sayap
        bx(g, M.body, 27, 2.6, 8, -14, 23.4, s * 8.8, 0, -s * 0.17);    // LERX
    }

    // Punggung: fairing tulang belakang, tiga bilah komunikasi, kubah satkom.
    bx(g, M.deck, 27, 4.4, 8.4, 15, 28.4, 0);
    for (let i = 0; i < 3; i++)
        bx(g, M.trim, 1.4, 6.6, 5.4, 9 + i * 6.5, 32, 0, 0, 0, -0.12);
    shape(g, new THREE.SphereGeometry(4.6, 8, 6), M.deck, 26, 30.4, 0);
    bx(g, M.trim, 2.2, 7.6, 2.2, -7, 30.6, 0);

    // Sponson roda: rumah gear yang juga memberi bahu badan.
    for (const s of [-1, 1]) {
        bx(g, M.body, 27, 10, 8.4, 10, 9.5, s * 11.6);
        bx(g, M.trim, 27, 1.2, 1.2, 10, 14.4, s * 11.6);
    }

    // Lambung statis DILAS ke dalam dirinya sendiri: siluet kaya, draw call
    // segelintir. (Di harness `canMerge()` false sehingga ini no-op — angka
    // mesh yang dipatok tes adalah kerumitan yang DITULIS, bukan digambar.)
    measureLowBody(rig, g);
    auditMirror(rig, g);
    const welded = mergeObjectInPlace(g);
    if (welded !== g) { rig.group.remove(g); rig.group.add(welded); }
    rig.hull = welded;
}

// ---- Nacelle yang bisa MENDONGAK: turbofan bersama di dalam pylon ---------
function buildNacelle(rig, M, side) {
    const T = S12_TRANSPORT;
    const pivot = new THREE.Group();
    pivot.position.set(6, T.wingY, side * T.nacelleZ);
    rig.group.add(pivot);

    bx(pivot, M.body, 22, 9.6, 11, 0, 0, 0);                  // pylon/fairing
    bx(pivot, M.trim, 24, 1.2, 1.4, 0, 5.2, 0);

    // Nacelle bersama menghadap +z LOKALNYA; hidung pesawat ada di -x, jadi
    // dibungkus rotation.y = -PI/2. Jangan tulis +PI/2: itu memasang mesinnya
    // terbalik dan dorongannya mengarah ke ekor.
    const housing = new THREE.Group();
    housing.rotation.y = -Math.PI / 2;
    pivot.add(housing);
    const jet = buildTurbofan(housing, {
        cowl: M.body, lip: M.trim, duct: M.dark, hub: M.trim,
        fan: M.steel, nozzle: M.dark,
    }, { cowlRadius: T.cowlRadius, length: T.nacelleLength,
        blades: T.fanArms, radial: 12 });

    // Cincin buang: material SENDIRI supaya nyalanya tidak mewarnai ulang
    // apa pun yang berbagi warna amber di dunia ini.
    const ring = shape(pivot, new THREE.CylinderGeometry(
        T.cowlRadius * 0.72, T.cowlRadius * 0.82, 2.4, 12), M.exhaust,
    T.nacelleLength * 0.52, 0, 0, 0, 0, Math.PI / 2);
    ring.castShadow = false;
    for (const s of [-1, 1])
        bx(pivot, M.trim, 18, 1.1, 1.1, -2, s * 6.4, 0);      // strake cowl

    rig.nacelles.push({ pivot, fan: jet.fan, jet, side });
}

// ---- Roda pendarat: terlipat ke depan masuk sponson -----------------------
function buildGear(rig, M, x, z, legLen, wheelR, twin) {
    const leg = new THREE.Group();
    leg.position.set(x, 8, z);
    // Tinggi parkir pesawat DITURUNKAN dari rodanya sendiri, tidak diketik di
    // dunia: mengubah panjang kaki atau jari-jari roda memindahkan pesawatnya
    // ikut, bukan menenggelamkannya ke dalam aspal.
    rig.wheelLow = Math.min(rig.wheelLow, 8 - legLen - wheelR);
    rig.group.add(leg);
    bx(leg, M.trim, 3, legLen, 3, 0, -legLen / 2, 0);
    bx(leg, M.steel, 2.2, legLen * 0.42, 2.2, 0, -legLen * 0.74, 0);
    bx(leg, M.trim, 2, legLen * 0.5, 6.5, 2.4, -legLen * 0.3, 0, 0, 0, 0.5);
    const axleGeo = new THREE.CylinderGeometry(wheelR, wheelR, 2.6, 10);
    for (const s of twin ? [-1, 1] : [0])
        shape(leg, axleGeo, M.tyre, 0, -legLen, s * 2.6, Math.PI / 2);

    const door = new THREE.Group();
    door.position.set(x, 5.4, z + (z >= 0 ? 4 : -4));
    rig.group.add(door);
    bx(door, M.body, 14, 0.9, 7, 0, 0, z >= 0 ? 3.2 : -3.2);
    rig.gear.push({ leg, door, doorSign: z >= 0 ? 1 : -1 });
}

// ---- Ramp belakang: engsel sungguhan, bukan kotak yang diputar di tengah ---
function buildRamp(rig, M) {
    const pivot = new THREE.Group();
    pivot.position.set(45, 11.5, 0);
    rig.group.add(pivot);
    bx(pivot, M.deck, 22, 2.4, 15, 11, 0, 0);
    bx(pivot, M.trim, 22, 3.4, 1.6, 11, 1.8, 7.4);
    bx(pivot, M.trim, 22, 3.4, 1.6, 11, 1.8, -7.4);
    bx(pivot, M.trim, 3, 1.2, 15, 21.6, -0.4, 0);
    rig.ramp = pivot;
}

// ---- Lampu: emissive, NOL PointLight -------------------------------------
function buildLights(rig, M) {
    const T = S12_TRANSPORT;
    for (const s of [-1, 1]) {
        const l = bx(rig.group, M.land, 3.4, 1.8, 3.4, T.noseX + 12, 5.2, s * 5.2);
        l.castShadow = false; rig.landing.push(l);
    }
    for (const [y, x] of [[33.6, 15], [4.2, 14]]) {
        const b = bx(rig.group, M.beacon, 2.4, 2.4, 2.4, x, y, 0);
        b.castShadow = false; rig.beacons.push(b);
    }
    // Navigasi ujung sayap: hazard di kiri, putih hangat di kanan. Hijau adalah
    // warna sinyal EXIT/coolant dan tidak boleh dipakai sebagai dekor.
    for (const [s, m] of [[-1, M.navA], [1, M.navB]]) {
        const n = bx(rig.group, m, 3, 1.8, 2.6, 12, T.wingY + 1.6, s * 43.5);
        n.castShadow = false;
    }
    for (const s of [-1, 1]) {
        const strip = bx(rig.group, M.strip, 44, 0.7, 0.7, 4, 11.6, s * 12.4);
        strip.castShadow = false;
    }
}

/**
 * Bangun satu rig transport lengkap. Semua material dibuat DI SINI (instans
 * milik rig ini sendiri) supaya menyalakan lampunya tidak bisa mewarnai apa pun
 * di dunia yang kebetulan memakai token PAL yang sama.
 */
export function buildStage12TransportMesh() {
    const M = {
        body: mat(PAL.gunmetal), deck: mat(PAL.steel), trim: mat(PAL.ink),
        dark: mat(PAL.rubber), steel: mat(PAL.steel), tyre: mat(PAL.rubber),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg,
            emissive: PAL.techDim, emissiveIntensity: EMISSIVE_MAX * 0.14 }),
        exhaust: glow(PAL.amber, EMISSIVE_MAX * 0.5),
        land: glow(PAL.white, EMISSIVE_MAX * 0.25),
        beacon: glow(PAL.hazard, EMISSIVE_MAX * 0.2),
        strip: glow(PAL.techDim, EMISSIVE_MAX * 0.3),
        navA: glow(PAL.hazard, EMISSIVE_MAX * 0.55),
        navB: glow(PAL.white, EMISSIVE_MAX * 0.55),
    };
    const rig = {
        group: new THREE.Group(), mats: M, nacelles: [], gear: [],
        landing: [], beacons: [], hull: null, ramp: null,
        tilt: TILT_CRUISE, rampT: 0, beaconT: 0, fanAngle: 0, gearT: 0,
        wheelLow: 0, restY: 0, lowHalfZ: 0,
        axes: {}, mirror: { pairs: 0, unmatched: 0, worst: 0 },
    };
    rig.group.name = 'Stage12-Garuda-VTOL-Transport';

    buildHull(rig, M);
    buildNacelle(rig, M, -1); buildNacelle(rig, M, 1);
    buildGear(rig, M, S12_TRANSPORT.noseX + 20, 0, 12.4, 3, false);
    buildGear(rig, M, 13, -12.4, 12, 3.4, true);
    buildGear(rig, M, 13, 12.4, 12, 3.4, true);
    buildRamp(rig, M);
    buildLights(rig, M);
    rig.restY = -rig.wheelLow;   // ketinggian grup saat roda menapak y = 0
    resetStage12TransportRig(rig);
    return rig;
}

export function resetStage12TransportRig(rig) {
    if (!rig) return;
    rig.tilt = TILT_CRUISE; rig.rampT = 0; rig.beaconT = 0;
    rig.fanAngle = 0; rig.gearT = 0;
    for (const n of rig.nacelles) { n.pivot.rotation.z = TILT_CRUISE; n.fan.rotation.z = 0; }
    for (const g of rig.gear) { g.leg.rotation.z = GEAR_STOW; g.door.rotation.x = 0; }
    if (rig.ramp) rig.ramp.rotation.z = 0;
    rig.mats.exhaust.emissiveIntensity = EMISSIVE_MAX * 0.5;
    rig.mats.land.emissiveIntensity = EMISSIVE_MAX * 0.25;
    rig.mats.beacon.emissiveIntensity = EMISSIVE_MAX * 0.2;
}

/**
 * `progress` 0..1 menempuh pendaratan; `deployed` berarti sudah menyentuh tanah.
 * `dt <= 0` berarti SNAP — `finishReturnCine` memanggilnya sekali dengan dt 0
 * saat cutscene dilewati, dan sebuah ramp yang berhenti setengah jalan di sana
 * akan terlihat seperti bug.
 */
export function updateStage12TransportRig(rig, dt, progress = 0, deployed = false) {
    if (!rig) return;
    const snap = !(dt > 0), k = clamp(progress, 0, 1);

    // Nacelle mendongak dari jelajah ke hover selama turun. Sebuah tiltrotor
    // yang diparkir berdiri di posisi hover, jadi itu pula pose akhirnya.
    const tiltK = smooth(clamp((k - 0.05) / 0.7, 0, 1));
    rig.tilt = TILT_CRUISE + (TILT_HOVER - TILT_CRUISE) * tiltK;
    for (const n of rig.nacelles) n.pivot.rotation.z = rig.tilt;

    // Roda keluar di paruh pendaratan, pintu bay ikut membuka.
    rig.gearT = smooth(clamp((k - 0.22) / 0.46, 0, 1));
    for (const g of rig.gear) {
        g.leg.rotation.z = GEAR_STOW * (1 - rig.gearT);
        g.door.rotation.x = g.doorSign * DOOR_OPEN * rig.gearT;
    }

    // Kipas: berputar cepat saat mendekat, idle saat sudah di tanah.
    const spin = dt > 0 ? dt * (deployed ? 9 : 34) : 0;
    rig.fanAngle += spin;
    for (const n of rig.nacelles) n.fan.rotation.z = rig.fanAngle;

    // Ramp hanya turun setelah mendarat.
    const rampTarget = deployed ? 1 : 0;
    rig.rampT = snap ? rampTarget
        : rig.rampT + (rampTarget - rig.rampT) * Math.min(1, dt * 3);
    if (rig.ramp) rig.ramp.rotation.z = -RAMP_OPEN * rig.rampT;

    // "Lampu" = emissiveIntensity, bukan PointLight: dorongan menyala saat
    // menahan berat di udara dan meredup begitu roda menapak.
    const thrust = deployed ? 0.3 : 0.55 + 0.45 * (1 - smooth(k));
    rig.mats.exhaust.emissiveIntensity = EMISSIVE_MAX * clamp(thrust, 0, 1);
    rig.mats.land.emissiveIntensity =
        EMISSIVE_MAX * clamp(deployed ? 0.4 : 0.25 + 0.7 * smooth(k), 0, 1);
    rig.beaconT += Math.max(0, dt);
    rig.mats.beacon.emissiveIntensity =
        EMISSIVE_MAX * clamp(0.18 + 0.72 * (0.5 + 0.5 * Math.sin(rig.beaconT * 7)), 0, 1);
}

export function stage12TransportDebug(rig) {
    if (!rig) return null;
    let meshes = 0, pointLights = 0, nonBox = 0;
    rig.group.traverse(o => {
        if (o.isMesh) { meshes++; if (o.geometry?.type !== 'box') nonBox++; }
        if (o.isPointLight) pointLights++;
    });
    const jet = rig.nacelles[0]?.jet;
    return {
        name: rig.group.name, meshes, nonBox, pointLights,
        dimensions: { ...S12_TRANSPORT },
        engine: jet ? { type: 'ducted-turbofan', ducted: true,
            cowlRadius: jet.cowlRadius, fanRadius: jet.fanRadius,
            blades: jet.blades } : null,
        nacelles: rig.nacelles.length,
        tiltRad: rig.tilt, tiltCruise: TILT_CRUISE, tiltHover: TILT_HOVER,
        gearLegs: rig.gear.length, gearExtended: rig.gearT,
        rampOpen: rig.rampT, fanAngle: rig.fanAngle,
        welded: !!rig.hull, restY: rig.restY, lowHalfZ: rig.lowHalfZ,
        axes: { ...rig.axes }, mirror: { ...rig.mirror },
        // Daun bay: tanda y inilah yang membedakan mengayun turun
        // dari mengayun ke atas menembus sponson.
        gearDoorSwingY: -3.2 * Math.sin(DOOR_OPEN),
        emissive: {
            exhaust: rig.mats.exhaust.emissiveIntensity,
            landing: rig.mats.land.emissiveIntensity,
            beacon: rig.mats.beacon.emissiveIntensity,
        },
    };
}
