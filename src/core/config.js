// CFG = seluruh konstanta mekanik yang bisa di-tuning, dimuat dari
// config/gameplay.json SEBELUM game dimulai (await loadConfig() di main.js).
// Semua modul membaca CFG.<seksi>.<kunci> DI DALAM fungsi (bukan top-level),
// jadi urutan muat aman. JANGAN hardcode angka mekanik di modul lain.

export const CFG = {};

// Skala dunia: 1 meter = 7 unit (kalibrasi tinggi mata 11.4 ≈ 1.6 m dan
// GRAVITY 70 ≈ 9.8 m/s²). Konstanta arsitektur, bukan tuning — bukan di JSON.
export const CAMP_M = 7;

const SECTIONS = ['player', 'stamina', 'movement', 'weapons', 'melee',
    'grenade', 'zombie', 'survival', 'campaign', 'drops'];

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
    Object.assign(CFG, data);
    return CFG;
}
