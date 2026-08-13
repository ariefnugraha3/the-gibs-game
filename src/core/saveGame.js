// Save game / checkpoint Campaign (2026-07-15): simpan nomor stage terakhir yang
// START-nya dicapai player di localStorage supaya ia bisa EXIT lalu MELANJUTKAN
// dari titik-mulai stage itu. HANYA nomor stage (1..13) yang disimpan — loadout,
// skor, dan progres dalam-stage TIDAK (continue = mulai SEGAR di START stage).
// Ditulis tiap kali sebuah stage campaign di-enter (= checkpoint), dibersihkan
// saat MISSION COMPLETE atau saat player memilih "No, New Game" di prompt menu.

const KEY = 'gibsCampaignStage';

// Tulis checkpoint stage n (dipanggil di enter() tiap stage). try/catch: mode
// privat / storage penuh melempar — abaikan (save opsional, tak boleh crash).
export function saveCampaignStage(n) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 13) return false;
    try { localStorage.setItem(KEY, String(n)); return true; } catch (e) { return false; }
}

// Kembalikan stage tersimpan (1..13), atau 0 bila tak ada save valid. Number()
// + Number.isInteger sengaja dipakai: parseInt dulu menerima "12.5"/"12xyz".
export function loadCampaignStage() {
    let n = 0;
    try { n = Number(localStorage.getItem(KEY)); } catch (e) { /* abaikan */ }
    return (Number.isInteger(n) && n >= 1 && n <= 13) ? n : 0;
}

// Hapus save (New Game / mission complete).
export function clearCampaignSave() {
    try { localStorage.removeItem(KEY); } catch (e) { /* abaikan */ }
}
