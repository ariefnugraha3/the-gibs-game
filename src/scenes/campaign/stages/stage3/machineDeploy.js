// STAGE 3 — SEKUENS PENGERAHAN MESIN PEMBUAT ROBOT (2026-08-13, permintaan user).
//
// Dulu keempat mesin sudah berdiri di ruang PABRIK X sejak player masuk lift.
// Sekarang mesinnya BARU ADA setelah PINTU BLAST terbuka, dan kemunculannya
// adalah sebuah pertunjukan: dua BAY di lantai pabrik membuka empat daun hatch
// (pinwheel), mesin naik dari silo di bawah lantai sambil berputar, klem
// mengunci, lalu sistemnya online.
//
// TIGA ATURAN YANG MEMBENTUK MODUL INI — jangan "dirapikan":
//
// 1. MESIN TIDAK PERNAH `visible=false`. Ia DITENGGELAMKAN (`MACHINE_SINK` 32)
//    di bawah lantai; bidang lantai stage 3 buram dan menutupi seluruh grid,
//    jadi mesin yang tenggelam benar-benar tak tergambar TANPA pernah menyembunyikan
//    mesh. Ini yang menjaga aturan "tanpa rekompilasi shader di tengah main":
//    material mesin sudah dirender sejak frame pertama stage.
//    Colliders tetap mengikuti aturan proyek "yang terlihat itulah yang menghalangi"
//    — pemanggil memasang blocker persis saat fase `rise` mulai.
//
// 2. TIDAK ADA MESH/MATERIAL/POINTLIGHT YANG DIBUAT SAAT SEKUENS BERJALAN.
//    Seluruh bay dibangun bersama dunia; animasinya hanya transform + `color`/
//    `intensity`. Satu PointLight per bay ada sejak awal dengan intensitas 0.
//
// 3. LUBANG SILO ITU PALSU. Lantai stage 3 satu bidang utuh tanpa lubang, jadi
//    "mulut silo" adalah pelat gelap + rim yang digambar SEDIKIT DI ATAS lantai
//    (y 0.12/0.2). Selagi hatch tertutup ia tersembunyi di bawah daun-daunnya.
//
// Kamera TIDAK diambil alih: pintu blast terbuka saat player masih bertarung
// melawan gelombang hack terakhir di ruangan lain, jadi membekukan kontrol di
// sana justru berbahaya. Drama disampaikan lewat guncangan kamera berskala
// jarak, alarm, strobo hazard, debu, dan geometri bay itu sendiri.

import { PAL } from '../../../../world/palette.js';
import { mergeObjectInPlace } from '../../../../utils/meshBatch.js';

// Kedalaman silo: lebih tinggi dari mesin utuh (~28 u termasuk crown+beacon),
// supaya tak ada satu pun bagian yang menyembul lewat lantai sebelum waktunya.
export const MACHINE_SINK = 32;
// Sedikit lewat batas atas lalu turun mengendap — massa berat tidak berhenti mendadak.
const RISE_OVERSHOOT = 1.8;
// Mesin naik sambil TERPUTAR, lalu diluruskan ke arah hadap akhirnya oleh klem.
const RISE_SPIN = -1.35;
// Tinggi total satu klem (tiang 7.0 + rahang menghadap atas s/d y 5.8) dan
// kedalaman simpanannya. STOW WAJIB >= tinggi klem, kalau tidak puncak rahangnya
// menyembul dari lantai selama fase `door` — persis yang mau disembunyikan.
const CLAMP_HEIGHT = 12.8, CLAMP_STOW = 14;
// Ketinggian pangkal klem saat terkunci penuh, dan sudut lipat rahangnya ke dalam.
const CLAMP_UP = 2.4, CLAMP_SWING = 1.5;

// Urutan babak. `warn` (alarm) -> `hatch` (daun membuka) -> `rise` (mesin naik)
// -> `lock` (klem mengunci) -> `online` (sistem menyala) -> `done`.
export const DEPLOY_ACTS = ['warn', 'hatch', 'rise', 'lock', 'online'];

// Durasi tiap babak dari config (satu-satunya sumber angka waktu).
export function deployActSecs(cfg) {
    const d = (cfg && cfg.machineDeploy) || {};
    return {
        warn: d.warnSec != null ? d.warnSec : 2.4,
        hatch: d.hatchSec != null ? d.hatchSec : 1.9,
        rise: d.riseSec != null ? d.riseSec : 3.6,
        lock: d.lockSec != null ? d.lockSec : 1.5,
        online: d.onlineSec != null ? d.onlineSec : 1.3,
        stagger: d.staggerSec != null ? d.staggerSec : 0.9,
    };
}
export function deployTotalSec(cfg, machineCount = 1) {
    const s = deployActSecs(cfg);
    return s.warn + s.hatch + s.rise + s.lock + s.online
        + s.stagger * Math.max(0, machineCount - 1);
}

// Waktu LOKAL mesin ke-i -> babak + kemajuan babak (0..1) + kemajuan total.
export function deployPhaseAt(cfg, t) {
    const s = deployActSecs(cfg);
    if (!(t > 0)) return { phase: 'idle', k: 0, act: -1 };
    let acc = 0;
    for (let i = 0; i < DEPLOY_ACTS.length; i++) {
        const name = DEPLOY_ACTS[i], len = Math.max(1e-4, s[name]);
        if (t < acc + len) return { phase: name, k: (t - acc) / len, act: i };
        acc += len;
    }
    return { phase: 'done', k: 1, act: DEPLOY_ACTS.length };
}

const eOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const eInOut = (k) => k * k * (3 - 2 * k);

// ===== GEOMETRI BAY =========================================================
// Bagian DIAM (curb, chevron hazard, pad beacon, cerobong, strip strobo) dilas
// jadi segelintir mesh; hanya daun hatch, klem, mulut silo dan rim yang tetap
// terpisah karena bergerak. Strip + pad beacon berbagi SATU material strobo,
// jadi pengelasan tidak menghilangkan kemampuan mengganti warnanya runtime.
//
// SATU BATASAN BENTUK YANG MENGIKAT SELURUH RIG: collider mesin hanya ±14 unit,
// jadi player BOLEH berdiri tepat di bibir bay. Apa pun di LUAR ±14 karena itu
// harus tetap SETINGGI CURB (<= ~2.5 u ≈ 0.35 m) — kalau tidak, badan player
// (radius 5) menembusnya. Semua yang tinggi hidup di dalam ±14 (mesin) atau
// TENGGELAM di bawah lantai saat tak dipakai (klem), persis trik mesinnya.
export function buildMachineBay(parent, cx, cz, half = 15) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    parent.add(g);

    const gun = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const ink = new THREE.MeshLambertMaterial({ color: PAL.ink });
    const panel = new THREE.MeshLambertMaterial({ color: PAL.panel });
    // Material RAMBU: warnanya diganti tiap frame lewat `color.setHex` saja.
    const strobe = new THREE.MeshBasicMaterial({ color: PAL.steel, toneMapped: false });
    const rimMat = new THREE.MeshBasicMaterial({ color: PAL.techDim, toneMapped: false });
    const hazard = new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false });
    const white = new THREE.MeshBasicMaterial({ color: PAL.white, toneMapped: false });

    // Pengukur invarian bentuk: puncak tertinggi dari apa pun yang MENJULUR ke
    // luar footprint collider mesin (±14). Diisi otomatis oleh helper di bawah
    // untuk seluruh perabot bay yang duduk di ruang lokal bay (mulut + curb).
    // `measuring` dimatikan sebelum daun & klem dibangun: keduanya hidup di grup
    // bersarang (yaw/hinge) sehingga koordinat lokalnya bukan ruang bay, dan
    // keamanannya dijamin cara lain (daun di dalam ±13.4, klem lewat `clampRadius`).
    let curbTopOutside = 0, measuring = true;
    const note = (x, y, z, ex, ey, ez) => {
        if (measuring && Math.max(Math.abs(x) + ex, Math.abs(z) + ez) > 14)
            curbTopOutside = Math.max(curbTopOutside, y + ey);
    };
    const box = (p, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
        m.castShadow = true; m.receiveShadow = true; p.add(m);
        // Rotasi di sini hanya yaw (ry) untuk chevron: pakai diagonal sbg batas aman.
        const r = ry ? Math.hypot(sx, sz) / 2 : 0;
        note(x, y, z, r || sx / 2, sy / 2, r || sz / 2);
        return m;
    };
    const cyl = (p, mat, r, h, x, y, z, seg = 8) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
        m.position.set(x, y, z);
        m.castShadow = true; m.receiveShadow = true; p.add(m);
        note(x, y, z, r, h / 2, r);
        return m;
    };

    // --- MULUT SILO (palsu: pelat gelap + rim, digambar di ATAS lantai) ---
    const mouth = box(g, ink, half * 1.78, 0.3, half * 1.78, 0, 0.12, 0);
    mouth.castShadow = false;
    const rimRing = new THREE.Mesh(
        new THREE.TorusGeometry(half * 0.92, 0.34, 6, 20), rimMat);
    rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 0.22; g.add(rimRing);
    // Rusuk dalam silo: memberi kesan kedalaman ketika daun hatch terbuka.
    for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        box(g, steel, 1.5, 0.5, half * 0.24,
            Math.cos(a) * half * 0.78, 0.2, Math.sin(a) * half * 0.78, 0, -a, 0)
            .castShadow = false;
    }

    // --- CURB (diam, RATA LANTAI: tertinggi 2.4 u) ---
    const curb = new THREE.Group(); g.add(curb);
    cyl(curb, gun, half * 1.32, 1.7, 0, 0.85, 0, 8);
    cyl(curb, steel, half * 1.15, 1.0, 0, 1.45, 0, 8);
    for (let i = 0; i < 8; i++) {                       // chevron hazard di bibir curb
        const a = i / 8 * Math.PI * 2;
        box(curb, i % 2 ? hazard : white, half * 0.44, 0.3, 2.2,
            Math.cos(a) * half * 1.22, 1.95, Math.sin(a) * half * 1.22, 0, -a, 0);
    }
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {   // pad beacon sudut
        const x = sx * half * 1.16, z = sz * half * 1.16;
        cyl(curb, panel, 2.3, 0.6, x, 1.9, z, 6);
        cyl(curb, strobe, 1.7, 0.9, x, 2.0, z, 6);
    }
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {     // cerobong uap pendek
        cyl(curb, ink, 1.35, 1.6, ox * half * 1.24, 1.3, oz * half * 1.24, 6);
        cyl(curb, steel, 1.6, 0.4, ox * half * 1.24, 2.1, oz * half * 1.24, 6);
    }
    for (let i = 0; i < 12; i++) {                      // strip strobo mengelilingi curb
        const a = (i + 0.5) / 12 * Math.PI * 2;
        box(curb, strobe, half * 0.3, 0.5, 0.9,
            Math.cos(a) * half * 1.3, 1.05, Math.sin(a) * half * 1.3, 0, -a, 0)
            .castShadow = false;
    }
    mergeObjectInPlace(curb);

    // --- EMPAT DAUN HATCH (pinwheel): tiap kuadran berengsel di rusuk luarnya,
    // membuka dgn berputar KE BAWAH sehingga tertelan lantai (tak perlu
    // `visible=false`, lihat aturan #1 & #3 di kepala file). ---
    const leaves = [];
    measuring = false;
    for (let i = 0; i < 4; i++) {
        const yawG = new THREE.Group(); yawG.rotation.y = i * Math.PI / 2; g.add(yawG);
        const hinge = new THREE.Group(); hinge.position.set(half * 0.89, 0.95, 0); yawG.add(hinge);
        const plate = new THREE.Group();
        plate.position.set(-half * 0.445, 0, half * 0.445); hinge.add(plate);
        box(plate, gun, half * 0.89, 1.1, half * 0.89, 0, 0, 0);
        box(plate, steel, half * 0.89, 0.35, 1.6, 0, 0.62, half * 0.3);
        box(plate, i % 2 ? hazard : white, half * 0.5, 0.28, 1.4,
            -half * 0.1, 0.72, -half * 0.22, 0, 0.6, 0).castShadow = false;
        box(plate, ink, 1.5, 0.4, half * 0.7, half * 0.36, 0.66, 0).castShadow = false;
        mergeObjectInPlace(plate);
        leaves.push(hinge);
    }

    // --- EMPAT KLEM PENGUNCI. Dua derajat kebebasan, DUA-DUANYA dipilih supaya
    // klem tak pernah bisa ditembus badan player maupun menembus mesin:
    //   (a) TIANG naik lurus vertikal dari dalam curb — tersimpan `CLAMP_STOW`
    //       (>= tinggi klem) di bawah lantai yang buram, tegak di radius DIAGONAL
    //       `half*0.98`; karena collider mesin berbentuk KOTAK, yang menentukan
    //       keamanan adalah koordinat sumbunya (`clampMaxAxis`), bukan radiusnya;
    //   (b) RAHANG bertengger di puncak tiang, awalnya menghadap ATAS (jadi
    //       siluetnya ramping saat naik) lalu terlipat ke DALAM mencengkeram
    //       pinggang mesin. Tak ada satu pun bagian yang menjulur ke luar. ---
    const clamps = [];
    const clampRadius = half * 0.98;
    for (let i = 0; i < 4; i++) {
        const yawG = new THREE.Group(); yawG.rotation.y = i * Math.PI / 2 + Math.PI / 4; g.add(yawG);
        const rise = new THREE.Group(); rise.position.set(clampRadius, -CLAMP_STOW, 0); yawG.add(rise);
        const post = new THREE.Group(); rise.add(post);
        box(post, gun, 3.2, 7.0, 3.2, 0, 3.5, 0);
        box(post, steel, 4.0, 0.9, 4.0, 0, 1.0, 0);
        box(post, hazard, 3.4, 0.4, 0.7, 0, 5.4, 0).castShadow = false;
        mergeObjectInPlace(post);
        const jaw = new THREE.Group(); jaw.position.set(0, 7.0, 0); rise.add(jaw);
        box(jaw, steel, 2.2, 5.0, 3.0, 0, 2.5, 0);
        box(jaw, gun, 3.0, 2.4, 3.6, 0, 4.6, 0);
        box(jaw, hazard, 0.8, 2.2, 1.0, -1.4, 4.6, 0).castShadow = false;
        mergeObjectInPlace(jaw);
        clamps.push({ rise, jaw });
    }

    // Lampu bay: SATU per bay, ada sejak dunia dibangun dengan intensitas 0
    // (jumlah PointLight stage tetap; hanya intensitas/warna yang dianimasikan).
    const light = new THREE.PointLight(PAL.hazard, 0, half * 14, 2);
    light.position.set(cx, 9, cz);

    const bay = {
        group: g, mouth, rimRing, leaves, clamps, light, half,
        mats: { strobe, rim: rimMat }, t: 0, phase: 'idle',
        curbTopOutside, clampRadius,
        // Koordinat |x| (atau |z|) TERBESAR yang pernah disentuh sebuah klem:
        // tiangnya berdiri di diagonal 45°, jadi jaraknya ke sumbu = radius/√2,
        // ditambah setengah diagonal pelat dasar 4x4. Angka INI yang harus lebih
        // kecil dari jangkauan badan avatar — bukan jarak radialnya, karena
        // collider mesin berbentuk KOTAK, bukan lingkaran.
        clampMaxAxis: clampRadius * Math.SQRT1_2 + Math.SQRT2 * 2,
        // Puncak klem saat TERSIMPAN. Harus < 0 (di bawah lantai) atau ia
        // menyembul di ruang pabrik sepanjang fase `door`.
        clampStowTop: -CLAMP_STOW + CLAMP_HEIGHT,
    };
    resetMachineBay(bay);
    return bay;
}

// Pose "tersegel": hatch rapat, klem rebah, semua rambu mati, lampu padam.
export function resetMachineBay(bay) {
    if (!bay) return;
    bay.t = 0; bay.phase = 'idle';
    poseMachineBay(bay, 'idle', 0, 0);
}

// ===== POSE =================================================================
// Satu fungsi murni: babak + kemajuan -> transform & warna. Dipanggil tiap frame
// oleh stage; tidak menyentuh state global, tidak mengalokasi apa pun.
export function poseMachineBay(bay, phase, k, t = 0) {
    if (!bay) return 0;
    bay.phase = phase;
    const kk = Math.max(0, Math.min(1, k));
    const half = bay.half;

    // --- daun hatch: 0 tertutup, 1 terlipat penuh ke dalam curb ---
    let hatchK = 0;
    if (phase === 'hatch') hatchK = eInOut(kk);
    else if (phase === 'rise' || phase === 'lock' || phase === 'online' || phase === 'done') hatchK = 1;
    for (let i = 0; i < bay.leaves.length; i++) {
        const h = bay.leaves[i];
        // Sedikit beda fase antar daun supaya bukaannya berputar seperti baling-baling.
        const kl = Math.max(0, Math.min(1, hatchK * 1.36 - i * 0.12));
        h.rotation.z = kl * 1.62;          // + = daun berayun KE BAWAH, ditelan lantai
        h.position.y = 0.95 - kl * 0.5;
    }

    // --- klem: 0 tersimpan di bawah lantai, 1 berdiri mencengkeram mesin.
    // Tiang naik dulu (0..0.62) baru rahang terlipat ke dalam (0.5..1), jadi
    // rahangnya masih menghadap atas selagi melewati badan mesin. ---
    let clampK = 0;
    if (phase === 'lock') clampK = eOutCubic(kk);
    else if (phase === 'online' || phase === 'done') clampK = 1;
    for (let i = 0; i < bay.clamps.length; i++) {
        const c = bay.clamps[i];
        const kc = Math.max(0, Math.min(1, clampK * 1.32 - i * 0.09));
        c.rise.position.y = -CLAMP_STOW + (CLAMP_STOW + CLAMP_UP) * Math.min(1, kc / 0.62);
        c.jaw.rotation.z = Math.max(0, Math.min(1, (kc - 0.5) / 0.5)) * CLAMP_SWING;
    }

    // --- tinggi mesin (dikembalikan ke pemanggil) ---
    let y = -MACHINE_SINK;
    if (phase === 'rise') y = -MACHINE_SINK + (MACHINE_SINK + RISE_OVERSHOOT) * eOutCubic(kk);
    else if (phase === 'lock') y = RISE_OVERSHOOT * (1 - kk) * (1 - kk) * Math.cos(kk * Math.PI * 2.6);
    else if (phase === 'online' || phase === 'done') y = 0;

    // --- rambu: mati -> strobo hazard makin cepat -> tembaga solid -> teal ---
    const strobe = bay.mats.strobe, rim = bay.mats.rim;
    if (phase === 'idle') {
        strobe.color.setHex(PAL.steel); rim.color.setHex(PAL.techDim);
        bay.light.intensity = 0; bay.light.color.setHex(PAL.hazard);
        bay.rimRing.scale.setScalar(1);
    } else if (phase === 'online' || phase === 'done') {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
        strobe.color.setHex(PAL.tech);
        rim.color.setHex(pulse > 0.62 ? PAL.white : PAL.tech);
        bay.light.color.setHex(PAL.tech);
        bay.light.intensity = phase === 'done' ? 0.75 : 0.75 + (1 - kk) * 1.5;
        bay.rimRing.scale.setScalar(1 + pulse * 0.03);
    } else {
        // Kecepatan strobo naik tiap babak — jantung sekuens yang makin cepat.
        const rate = phase === 'warn' ? 6.5 : phase === 'hatch' ? 9 : phase === 'rise' ? 12 : 18;
        const blink = Math.sin(t * rate) > 0;
        strobe.color.setHex(blink ? PAL.hazard : PAL.amberDim);
        rim.color.setHex(phase === 'warn' ? PAL.techDim : (blink ? PAL.hazard : PAL.amber));
        bay.light.color.setHex(PAL.hazard);
        const peak = phase === 'warn' ? 0.9 * eInOut(kk) : phase === 'lock' ? 1.9 : 1.5;
        bay.light.intensity = peak * (blink ? 1 : 0.28);
        bay.rimRing.scale.setScalar(1 + (phase === 'warn' ? 0 : 0.06 * (blink ? 1 : 0)));
    }
    return y;
}

// Mesin hancur: bay-nya ikut MATI (rambu gelap, lampu padam) supaya bangkai
// gosong tidak berdiri di atas dudukan yang masih berdenyut teal. Warna saja —
// tidak ada mesh/material/PointLight yang dibuat atau dibuang.
export function killMachineBay(bay) {
    if (!bay) return;
    bay.phase = 'wrecked';
    bay.mats.strobe.color.setHex(PAL.rubber);
    bay.mats.rim.color.setHex(PAL.amberDim);
    bay.light.intensity = 0;
    bay.rimRing.scale.setScalar(1);
}

// Putaran mesin selagi naik: -RISE_SPIN rad saat mulai, lurus lagi saat terkunci.
export function deploySpin(phase, k) {
    const kk = Math.max(0, Math.min(1, k));
    if (phase === 'idle' || phase === 'warn' || phase === 'hatch') return RISE_SPIN;
    if (phase === 'rise') return RISE_SPIN * (1 - eOutCubic(kk) * 0.72);
    if (phase === 'lock') return RISE_SPIN * 0.28 * (1 - eOutCubic(kk));
    return 0;
}

export const machineBayDebug = (bay) => ({
    phase: bay ? bay.phase : null,
    leafTilt: bay ? bay.leaves.map(l => +l.rotation.z.toFixed(3)) : [],
    clampY: bay ? bay.clamps.map(c => +c.rise.position.y.toFixed(3)) : [],
    clampJaw: bay ? bay.clamps.map(c => +c.jaw.rotation.z.toFixed(3)) : [],
    lightIntensity: bay ? +bay.light.intensity.toFixed(3) : 0,
    lightHex: bay ? bay.light.color.getHex() : 0,
    strobeHex: bay ? bay.mats.strobe.color.getHex() : 0,
    // Titik TERTINGGI apa pun yang berada di luar footprint collider mesin
    // (±14): dipatok smoke supaya bay tak pernah menumbuhkan sesuatu yang
    // ditembus badan player. Klem sengaja TIDAK dihitung — tiangnya tegak di
    // radius diagonal yang tak terjangkau badan player.
    curbTopOutside: bay ? +bay.curbTopOutside.toFixed(3) : 0,
    clampRadius: bay ? +bay.clampRadius.toFixed(3) : 0,
    clampMaxAxis: bay ? +bay.clampMaxAxis.toFixed(3) : 0,
    clampStowTop: bay ? +bay.clampStowTop.toFixed(3) : 0,
});
