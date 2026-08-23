// Save game / checkpoint Campaign (2026-07-15): simpan nomor stage terakhir yang
// START-nya dicapai player di localStorage supaya ia bisa EXIT lalu MELANJUTKAN
// dari titik-mulai stage itu. HANYA checkpoint stage (1..12) + versi format yang
// disimpan — loadout, skor, dan progres dalam-stage TIDAK (continue = mulai SEGAR).
// Ditulis tiap kali sebuah stage campaign di-enter (= checkpoint), dibersihkan
// saat MISSION COMPLETE atau saat player memilih "No, New Game" di prompt menu.

const KEY = 'gibsCampaignStage';
const VERSION_KEY = 'gibsCampaignStageVersion';
const SAVE_VERSION = 2;

// Tulis checkpoint stage n (dipanggil di enter() tiap stage). try/catch: mode
// privat / storage penuh melempar — abaikan (save opsional, tak boleh crash).
export function saveCampaignStage(n) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 12) return false;
    try {
        localStorage.setItem(KEY, String(n));
        localStorage.setItem(VERSION_KEY, String(SAVE_VERSION));
        return true;
    } catch (e) { return false; }
}

// Kembalikan stage tersimpan (1..12), atau 0 bila tak ada save valid. Save tanpa
// versi berasal dari campaign 13-stage: 11→10, 12→11, 13→12. Save versi 2 sudah
// memakai nomor baru. Number() + Number.isInteger menolak "12.5"/"12xyz".
export function loadCampaignStage() {
    let n = 0, version = 0;
    try {
        n = Number(localStorage.getItem(KEY));
        version = Number(localStorage.getItem(VERSION_KEY));
    } catch (e) { /* abaikan */ }
    if (!Number.isInteger(n) || n < 1 || n > 13) return 0;
    if (version === SAVE_VERSION) return n <= 12 ? n : 0;
    if (n >= 11) return n - 1;
    return n;
}

// Hapus save (New Game / mission complete).
export function clearCampaignSave() {
    try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(VERSION_KEY);
    } catch (e) { /* abaikan */ }
}
