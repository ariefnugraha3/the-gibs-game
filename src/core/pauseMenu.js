// Menu jeda (ESC): overlay di dalam #blocker yang muncul saat game DI-PAUSE di
// tengah permainan (mode apa pun — Survival/Campaign). Tombol RESUME (lanjut
// main via requestLock) + dua aksi berkonfirmasi Yes/No: RESTART GAME (ulang
// dari awal via resetGame) & EXIT GAME (kembali ke MENU UTAMA). Karena
// startGame() bersifat SEKALI-JALAN (init renderer/input/senjata tak dirancang
// dipanggil ulang), "exit" = muat ulang halaman — jalan paling bersih & andal;
// setelah reload, layar pertama = #mainMenu (Start/Settings/Credits/Exit).
// Teks UI English (aturan permanen).
// Selagi menu jeda terbuka, klik latar #blocker TIDAK me-resume (input.js
// cek isPauseMenuOpen) — resume HANYA lewat tombol RESUME (permintaan user
// 2026-07-10, hint "click anywhere" dihapus).

import { resetGame } from './game.js';
import { requestLock } from './input.js';

let instr = null, menu = null, mainP = null, confP = null, confText = null, tutP = null;
let onYes = null, wired = false, visible = false;

// Apakah menu jeda sedang tampil — input.js memakainya untuk MENGABAIKAN
// klik latar blocker (resume hanya via tombol RESUME).
export function isPauseMenuOpen() { return visible; }

// Rangkai listener sekali (lazy — dipanggil saat pertama kali menu dibuka).
function wire() {
    if (wired) return;
    wired = true;
    instr = document.getElementById('instructions');
    menu = document.getElementById('pauseMenu');
    mainP = document.getElementById('pauseMain');
    confP = document.getElementById('pauseConfirm');
    confText = document.getElementById('pauseConfirmText');
    tutP = document.getElementById('pauseTutorial-panel');
    // Klik di dalam kotak menu jangan merambat ke #blocker
    menu.addEventListener('click', e => e.stopPropagation());
    menu.addEventListener('mousedown', e => e.stopPropagation());
    // RESUME = satu-satunya jalan melanjutkan (lock ulang pointer; sukses
    // lock memicu pointerlockchange -> hidePauseMenu + setPaused(false))
    document.getElementById('pauseResume').addEventListener('click', requestLock);
    // TUTORIAL = tampilkan panel How to Play (key-mapping); Back kembali ke menu.
    document.getElementById('pauseTutorial').addEventListener('click', showTutorial);
    document.getElementById('pauseTutBack').addEventListener('click', showMain);
    document.getElementById('pauseRestart').addEventListener('click',
        () => askConfirm('Restart the game from the beginning?', resetGame));
    document.getElementById('pauseExit').addEventListener('click',
        () => askConfirm('Exit to the main menu?', () => location.reload()));
    document.getElementById('pauseYes').addEventListener('click', () => { const a = onYes; if (a) a(); });
    document.getElementById('pauseNo').addEventListener('click', showMain);
}

// Panel utama (tombol-tombol) tampil, prompt konfirmasi & tutorial tersembunyi.
function showMain() {
    onYes = null;
    if (confP) confP.style.display = 'none';
    if (tutP) tutP.style.display = 'none';
    if (mainP) mainP.style.display = 'flex';
}

// Ganti panel utama dengan prompt konfirmasi "Yes / No" untuk sebuah aksi.
function askConfirm(text, action) {
    onYes = action;
    if (confText) confText.textContent = text;
    if (mainP) mainP.style.display = 'none';
    if (confP) confP.style.display = 'flex';
}

// Tampilkan panel Tutorial (How to Play); sembunyikan menu utama.
function showTutorial() {
    if (mainP) mainP.style.display = 'none';
    if (confP) confP.style.display = 'none';
    if (tutP) tutP.style.display = 'flex';
}

// Tampilkan menu jeda (input.js memanggilnya saat pointer-unlock di tengah main).
// Sembunyikan panel instruksi start agar layar bersih: hanya PAUSED + Restart/Exit.
export function showPauseMenu() {
    wire();
    visible = true;
    if (instr) instr.style.display = 'none';
    if (menu) menu.style.display = 'flex';
    showMain();
}

// Sembunyikan menu jeda (saat resume/lock). Pulihkan panel instruksi.
export function hidePauseMenu() {
    visible = false;
    if (!wired) return;
    if (menu) menu.style.display = 'none';
    if (instr) instr.style.display = '';
}
