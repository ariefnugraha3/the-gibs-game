// ============================================================
// BANGKAI KENDARAAN BERKEPING-KEPING — SATU SISTEM UNTUK SEMUA
// ============================================================
// 2026-08-18, permintaan user: mula-mula "saat player mati, mobil GRD LTV-45
// meledak dan hancur berkeping-keping", lalu "buat agar mobil yang dikendarai
// musuh juga hancur berkeping-keping". Karena itu SATU modul ini yang memiliki
// perilakunya untuk KETIGA kendaraan — GRD LTV-45 milik player, carrier Raven-K,
// dan pengangkut barel VULTURE-B. Tiga salinan yang saling menyimpang adalah
// kesalahan yang sudah berulang kali menggigit repo ini (fade oklusi pernah
// punya tiga versi berbeda); jangan menulis versi per-kendaraan lagi.
//
// Kontraknya sama persis dengan `wreckSpawnMachine`:
//
// 1. NOL mesh, material, atau PointLight baru. Tiap keping adalah anak rig ITU
//    SENDIRI yang dilempar keluar dari tempatnya, jadi kendaraan yang meledak
//    tetap tak bisa memicu kompilasi shader — dan pada kasus kematian player,
//    itu terjadi di detik paling sensitif dalam permainan.
// 2. Bagian yang benar-benar TERLEPAS (pintu, sensor, bull bar, roda) terlempar
//    jauh; pelat bodi hanya terpuntir dan ambles. Bangkai yang SETIAP kepingnya
//    berhamburan berhenti terbaca sebagai kendaraan.
// 3. Acakannya DETERMINISTIK: bentuk bangkai sama tiap kali, jadi dapat diuji
//    dan tidak menyedot RNG global.
// 4. Seluruh pose dan warna asli disimpan, karena setiap kendaraan di sini
//    dipakai ulang — carrier dari pool, dan stage diulang setiap player mati.
//    `restoreVehicle` memulihkannya PERSIS, bukan mendekati.
//
// Serpihan yang BETERBANGAN bukan urusan modul ini: itu gib balistik
// (entities/gore.js), satu-satunya sistem serpihan yang tetap dianimasikan
// bahkan selama sekuens kematian player.

const CHAR_BODY = 0x14120f, CHAR_TRIM = 0x0d0c0a;
// Material yang digosongkan ke nada TRIM (lebih gelap) alih-alih nada bodi:
// kaca dan karet memang sudah gelap, dan menyamakannya dengan pelat membuat
// siluet bangkainya rata.
const TRIM_KEYS = ['glass', 'rubber', 'dark', 'ink'];

function wreckHash(i, salt) {
    const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return s - Math.floor(s);
}

/**
 * Hancurkan sebuah rig kendaraan menjadi kepingan.
 * @param {object} rig objek rig kendaraan (state disimpan di sini)
 * @param {object} opts
 *   group     grup mesh (default `rig.group`)
 *   materials peta material (default `rig.materials` lalu `rig.mats`)
 *   loose     daftar Object3D yang benar-benar terlepas (terlempar jauh)
 *   skip      daftar Object3D yang TIDAK boleh disentuh (mis. jangkar pose)
 *   force     pengali sebaran
 *   tilt      kemiringan sasis {x, z}; yaw kendaraan SELALU dipertahankan
 *   sink      seberapa dalam sasisnya ambles (satuan lokal grup)
 */
export function shatterVehicle(rig, opts = {}) {
    if (!rig || rig.shattered) return false;
    const group = opts.group || rig.group;
    if (!group) return false;
    const mats = opts.materials || rig.materials || rig.mats || {};
    const skip = opts.skip || [], loose = opts.loose || [];
    const force = opts.force != null ? opts.force : 1;
    const tilt = opts.tilt || { x: -0.06, z: 0.13 };
    const sink = opts.sink != null ? opts.sink : 0.9;
    rig.shattered = true;

    // --- Gosongkan seluruh cat/kaca/lampu, simpan aslinya.
    rig.shatterMats = [];
    for (const key of Object.keys(mats)) {
        const m = mats[key];
        if (!m || !m.color) continue;
        rig.shatterMats.push({
            m, color: m.color.getHex(),
            emissive: m.emissive ? m.emissive.getHex() : null,
            emissiveIntensity: m.emissiveIntensity, opacity: m.opacity,
        });
        m.color.setHex(TRIM_KEYS.includes(key) ? CHAR_TRIM : CHAR_BODY);
        if (m.emissive) m.emissive.setHex(CHAR_TRIM);
        m.emissiveIntensity = 0;
        if (m.transparent) m.opacity = Math.max(m.opacity, 0.9);
    }

    // --- Lempar keping-kepingnya.
    rig.shatterParts = [];
    group.children.filter(o => !skip.includes(o)).forEach((o, i) => {
        rig.shatterParts.push({
            o, px: o.position.x, py: o.position.y, pz: o.position.z,
            rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
        });
        const k = (loose.includes(o) ? 1 : 0.34) * force;
        o.position.x += (wreckHash(i, 1) - 0.5) * 2.6 * k;
        o.position.y += (wreckHash(i, 2) * 0.9 - 0.55) * k;
        o.position.z += (wreckHash(i, 3) - 0.5) * 2.9 * k;
        o.rotation.x += (wreckHash(i, 4) - 0.5) * 2.2 * k;
        o.rotation.y += (wreckHash(i, 5) - 0.5) * 1.6 * k;
        o.rotation.z += (wreckHash(i, 6) - 0.5) * 2.2 * k;
    });

    // --- Sasisnya ambles miring di atas as roda yang patah. YAW DIPERTAHANKAN:
    //     carrier musuh dapat masuk menghadap +x maupun -x, dan menolkannya akan
    //     memutar bangkainya di tempat.
    rig.shatterPose = {
        rx: group.rotation.x, ry: group.rotation.y, rz: group.rotation.z,
        py: group.position.y,
    };
    group.rotation.set(tilt.x, group.rotation.y, tilt.z);
    group.position.y -= sink;
    return true;
}

export function restoreVehicle(rig) {
    if (!rig || !rig.shattered) return false;
    for (const w of rig.shatterParts || []) {
        w.o.position.set(w.px, w.py, w.pz);
        w.o.rotation.set(w.rx, w.ry, w.rz);
    }
    for (const w of rig.shatterMats || []) {
        w.m.color.setHex(w.color);
        if (w.emissive != null && w.m.emissive) w.m.emissive.setHex(w.emissive);
        w.m.emissiveIntensity = w.emissiveIntensity; w.m.opacity = w.opacity;
    }
    const p = rig.shatterPose, group = rig.group;
    if (p && group) {
        group.rotation.set(p.rx, p.ry, p.rz);
        group.position.y = p.py;
    }
    rig.shatterParts = null; rig.shatterMats = null; rig.shatterPose = null;
    rig.shattered = false;
    return true;
}

// Sidik jari pose SELURUH keping: dipakai smoke untuk membuktikan bangkainya
// benar-benar berhamburan lalu PULIH PERSIS.
export function vehiclePoseSum(group) {
    if (!group) return 0;
    return group.children.reduce((a, o) => a
        + Math.abs(o.position.x) + Math.abs(o.position.y) + Math.abs(o.position.z)
        + Math.abs(o.rotation.x) + Math.abs(o.rotation.y) + Math.abs(o.rotation.z), 0);
}

export function vehicleWreckDebug(rig, group) {
    const g = group || rig?.group;
    return {
        shattered: !!rig?.shattered,
        shards: rig?.shatterParts?.length || 0,
        parts: g ? g.children.length : 0,
        poseSum: vehiclePoseSum(g),
        tilt: g ? { x: g.rotation.x, y: g.rotation.y, z: g.rotation.z } : null,
    };
}
