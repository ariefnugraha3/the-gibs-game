// CFG = seluruh konstanta mekanik yang bisa di-tuning, dimuat dari
// config/gameplay.json SEBELUM game dimulai (await loadConfig() di main.js).
// Semua modul membaca CFG.<seksi>.<kunci> DI DALAM fungsi (bukan top-level),
// jadi urutan muat aman. JANGAN hardcode angka mekanik di modul lain.

export const CFG = {};

// Skala dunia: 1 meter = 7 unit (kalibrasi tinggi mata 11.4 ≈ 1.6 m dan
// GRAVITY 70 ≈ 9.8 m/s²). Konstanta arsitektur, bukan tuning — bukan di JSON.
export const CAMP_M = 7;

const SECTIONS = ['player', 'stamina', 'movement', 'weapons', 'melee',
    'grenade', 'robot', 'survival', 'campaign', 'drops', 'shop', 'difficulty',
    'dialogue'];

// Salinan MURNI hasil muat (tak pernah dimutasi) — applyDifficulty selalu
// menghitung ulang CFG dari sini agar pengali tidak terkali berulang.
export let CFG_BASE = null;

export async function loadConfig() {
    let data;
    if (globalThis.__GIBS_CONFIG__) {
        data = globalThis.__GIBS_CONFIG__;   // jalur harness/test headless
    } else {
        const res = await fetch('config/gameplay.json');
        if (!res.ok) throw new Error('config/gameplay.json HTTP ' + res.status);
        data = await res.json();
    }
    for (const k of SECTIONS) {
        if (!data[k]) throw new Error('gameplay.json missing section: "' + k + '"');
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
