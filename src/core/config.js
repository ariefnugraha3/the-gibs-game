// CFG = seluruh konstanta mekanik yang bisa di-tuning, dimuat dari
// config/gameplay.json SEBELUM game dimulai (await loadConfig() di main.js).
// Sebagian stage memiliki BERKAS TUNING SENDIRI (lihat CONFIG_PARTS) supaya
// bisa di-retune tanpa menyentuh gameplay.json; hasilnya digabung ke posisi
// yang sama persis di dalam CFG, jadi TIDAK ADA modul yang perlu tahu bedanya.
// Semua modul membaca CFG.<seksi>.<kunci> DI DALAM fungsi (bukan top-level),
// jadi urutan muat aman. JANGAN hardcode angka mekanik di modul lain.

export const CFG = {};

// Skala dunia: 1 meter = 7 unit (kalibrasi tinggi mata 11.4 ≈ 1.6 m dan
// GRAVITY 70 ≈ 9.8 m/s²). Konstanta arsitektur, bukan tuning — bukan di JSON.
export const CAMP_M = 7;

const SECTIONS = ['player', 'stamina', 'movement', 'weapons', 'melee',
    'grenade', 'robot', 'survival', 'campaign', 'drops', 'shop', 'difficulty',
    'dialogue'];

// BERKAS TUNING TERPISAH (permintaan user 2026-08-28: "pisahkan data khusus
// untuk stage ini biar saya bisa edit sesuka hati"). `path` = letaknya di dalam
// CFG, `file` = berkas sumbernya. Penggabungan terjadi SEBELUM CFG_BASE dibekukan,
// jadi applyDifficulty dan seluruh pembaca CFG.<seksi>.<kunci> tidak berubah.
// Naskah dialog TIDAK ikut dipisah — ia tetap terpusat di gameplay.json.
export const CONFIG_PARTS = Object.freeze([
    { path: ['campaign', 'stage10'], file: 'config/stage10.json' },
]);

// Tempelkan tiap berkas terpisah ke posisinya di dalam objek config mentah.
// `parts` = { '<file>': <data> }; berkas yang tidak dipasok dilewati supaya
// harness yang sudah menggabung sendiri tetap bekerja.
export function mergeConfigParts(data, parts) {
    for (const { path, file } of CONFIG_PARTS) {
        if (!parts || !(file in parts)) continue;
        let node = data;
        for (const key of path.slice(0, -1)) {
            if (!node[key] || typeof node[key] !== 'object') node[key] = {};
            node = node[key];
        }
        node[path[path.length - 1]] = parts[file];
    }
    return data;
}

// Salinan MURNI hasil muat (tak pernah dimutasi) — applyDifficulty selalu
// menghitung ulang CFG dari sini agar pengali tidak terkali berulang.
export let CFG_BASE = null;

async function fetchJson(file) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(file + ' HTTP ' + res.status);
    return res.json();
}

export async function loadConfig() {
    let data;
    let parts = null;
    if (globalThis.__GIBS_CONFIG__) {
        data = globalThis.__GIBS_CONFIG__;   // jalur harness/test headless
        parts = globalThis.__GIBS_CONFIG_PARTS__ || null;
    } else {
        data = await fetchJson('config/gameplay.json');
        parts = {};
        for (const { file } of CONFIG_PARTS) parts[file] = await fetchJson(file);
    }
    mergeConfigParts(data, parts);
    for (const k of SECTIONS) {
        if (!data[k]) throw new Error('gameplay.json missing section: "' + k + '"');
    }
    for (const { path, file } of CONFIG_PARTS) {
        let node = data;
        for (const key of path) node = node && node[key];
        if (!node) throw new Error('config part missing: "' + file + '"');
    }
    CFG_BASE = JSON.parse(JSON.stringify(data));
    Object.assign(CFG, data);
    return CFG;
}

// Terapkan preset difficulty (dipanggil layar menu SEBELUM startGame; boleh
// dipanggil ulang — idempoten karena selalu mulai dari CFG_BASE). Hanya kunci
// yang tercantum di bawah yang terpengaruh; sisanya tetap nilai JSON.
export function applyDifficulty(name) {
    if (!CFG_BASE) return;
    Object.assign(CFG, JSON.parse(JSON.stringify(CFG_BASE)));
    const d = CFG.difficulty && CFG.difficulty[name];
    if (!d) return;
    const hp = d.robotHpMul, dmg = d.robotDamageMul, spawn = d.spawnIntervalMul;
    // HP & attack per KELAS robot (C/B/A) diskalakan difficulty (HP dibulatkan —
    // peluru berdamage bulat). Boss & Monas-claw juga.
    for (const k in CFG.robot.classes) {
        const c = CFG.robot.classes[k];
        c.hp = Math.max(1, Math.round(c.hp * hp));
        c.attack *= dmg;
    }
    CFG.campaign.bosses.giant.hp = Math.max(1, Math.round(CFG.campaign.bosses.giant.hp * hp));
    CFG.campaign.bosses.giant.clawDamage *= dmg;
    CFG.campaign.bosses.tank.hp = Math.max(1, Math.round(CFG.campaign.bosses.tank.hp * hp));
    // Boss akhir Campaign memiliki beberapa pool durability dan serangan sendiri.
    // Difficulty sengaja hanya mengubah ketahanan, damage, dan jeda pemulihan;
    // telegraph/lock/projectile speed tetap agar waktu reaksi tidak menyusut.
    const warden = CFG.campaign.bosses.warden;
    if (warden) {
        warden.hp = Math.max(1, Math.round(warden.hp * hp));
        warden.capacitors.hp = Math.max(1, Math.round(warden.capacitors.hp * hp));
        warden.couplings.hp = Math.max(1, Math.round(warden.couplings.hp * hp));
        for (const attack of ['rail', 'stomp', 'burst', 'sector']) {
            if (warden[attack] && Number.isFinite(warden[attack].damage))
                warden[attack].damage *= dmg;
        }
        warden.attackGapSec *= spawn;
    }
    // Stage 11 Chapter-1 weapon pickups own their durability and damage in
    // gameplay.json rather than borrowing mutable robot-class values. Apply
    // the same difficulty multipliers explicitly so moving that ownership
    // does not make these vehicles ignore Easy/Hard mode.
    const forestVehicles = CFG.campaign?.stage11?.forestVehicles;
    if (forestVehicles) {
        for (const key of ['machineGun', 'homingMissile']) {
            const v = forestVehicles[key];
            v.hp = Math.max(1, Math.round(v.hp * hp));
            v.damage *= dmg;
        }
        forestVehicles.homingMissile.projectileHp = Math.max(1,
            Math.round(forestVehicles.homingMissile.projectileHp * hp));
    }
    const mahapatih = CFG.campaign.bosses.mahapatih;
    if (mahapatih) {
        for (const key of ['siegeHp', 'combatHp', 'coreHp'])
            mahapatih[key] = Math.max(1, Math.round(mahapatih[key] * hp));
        mahapatih.hardline.anchorHp = Math.max(1, Math.round(mahapatih.hardline.anchorHp * hp));
        for (const attack of ['artillery', 'charge', 'seismic', 'turret', 'blade', 'lunge', 'wave', 'cannon']) {
            if (mahapatih[attack] && Number.isFinite(mahapatih[attack].damage))
                mahapatih[attack].damage *= dmg;
        }
        mahapatih.hardline.sweepDamage *= dmg;
        mahapatih.attackGapSec *= spawn;
    }
    CFG.survival.monasClawDamage *= dmg;
    CFG.survival.spawnIntervalBase *= spawn;
    CFG.survival.spawnIntervalMin *= spawn;
}
