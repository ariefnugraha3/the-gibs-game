// Save game / checkpoint Campaign (2026-07-15): simpan nomor stage terakhir yang
// START-nya dicapai player di localStorage supaya ia bisa EXIT lalu MELANJUTKAN
// dari titik-mulai stage itu. HANYA nomor stage (1..4) yang disimpan — loadout,
// skor, dan progres dalam-stage TIDAK (continue = mulai SEGAR di START stage).
// Ditulis tiap kali sebuah stage campaign di-enter (= checkpoint), dibersihkan
// saat MISSION COMPLETE atau saat player memilih "No, New Game" di prompt menu.

const KEY = 'gibsCampaignStage';

// Tulis checkpoint stage n (dipanggil di enter() tiap stage). try/catch: mode
// privat / storage penuh melempar — abaikan (save opsional, tak boleh crash).
export function saveCampaignStage(n) {
    try { localStorage.setItem(KEY, String(n)); } catch (e) { /* storage tak tersedia */ }
}

// Kembalikan stage tersimpan (1..4), atau 0 bila tak ada save valid.
export function loadCampaignStage() {
    let n = 0;
    try { n = parseInt(localStorage.getItem(KEY), 10); } catch (e) { /* abaikan */ }
    return (n >= 1 && n <= 4) ? n : 0;
}

// Hapus save (New Game / mission complete).
export function clearCampaignSave() {
    try { localStorage.removeItem(KEY); } catch (e) { /* abaikan */ }
}
