// Menu jeda (ESC): overlay di dalam #blocker yang muncul saat game DI-PAUSE di
// tengah permainan (mode apa pun — Survival/Campaign). Dua aksi berkonfirmasi
// Yes/No: RESTART GAME (ulang dari awal via resetGame) & EXIT GAME (kembali ke
// menu pilih mode). Karena startGame() bersifat SEKALI-JALAN (init renderer/
// input/senjata tak dirancang dipanggil ulang), "exit" = muat ulang halaman —
// jalan paling bersih & andal untuk kembali ke #modeSelect awal.
// Teks UI English (aturan permanen). Klik di dalam kotak menu TIDAK memicu
// "klik untuk lanjut" milik #blocker (stopPropagation), jadi hanya klik di
// LATAR blocker yang me-resume game.

import { resetGame } from './game.js';

let instr = null, menu = null, mainP = null, confP = null, confText = null;
let onYes = null, wired = false;

// Rangkai listener sekali (lazy — dipanggil saat pertama kali menu dibuka).
function wire() {
    if (wired) return;
    wired = true;
    instr = document.getElementById('instructions');
    menu = document.getElementById('pauseMenu');
    mainP = document.getElementById('pauseMain');
    confP = document.getElementById('pauseConfirm');
    confText = document.getElementById('pauseConfirmText');
    // Klik di dalam kotak menu != klik latar blocker (yang me-resume)
    menu.addEventListener('click', e => e.stopPropagation());
    menu.addEventListener('mousedown', e => e.stopPropagation());
    document.getElementById('pauseRestart').addEventListener('click',
        () => askConfirm('Restart the game from the beginning?', resetGame));
    document.getElementById('pauseExit').addEventListener('click',
        () => askConfirm('Exit to the mode selection menu?', () => location.reload()));
    document.getElementById('pauseYes').addEventListener('click', () => { const a = onYes; if (a) a(); });
    document.getElementById('pauseNo').addEventListener('click', showMain);
}

// Panel utama (dua tombol) tampil, prompt konfirmasi tersembunyi.
function showMain() {
    onYes = null;
    if (confP) confP.style.display = 'none';
    if (mainP) mainP.style.display = 'flex';
}

// Ganti panel utama dengan prompt konfirmasi "Yes / No" untuk sebuah aksi.
function askConfirm(text, action) {
    onYes = action;
    if (confText) confText.textContent = text;
    if (mainP) mainP.style.display = 'none';
    if (confP) confP.style.display = 'flex';
}

// Tampilkan menu jeda (input.js memanggilnya saat pointer-unlock di tengah main).
// Sembunyikan panel instruksi start agar layar bersih: hanya PAUSED + Restart/Exit.
export function showPauseMenu() {
    wire();
    if (instr) instr.style.display = 'none';
    if (menu) menu.style.display = 'flex';
    showMain();
}

// Sembunyikan menu jeda (saat resume/lock). Pulihkan panel instruksi.
export function hidePauseMenu() {
    if (!wired) return;
    if (menu) menu.style.display = 'none';
    if (instr) instr.style.display = '';
}
