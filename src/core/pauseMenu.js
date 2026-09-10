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
import { activeScene } from './sceneManager.js';

let instr = null, menu = null, mainP = null, confP = null, confText = null, tutP = null;
let startTitle = null, startSub = null, startGrid = null, startCta = null;
let tutTitle = null, tutGrid = null;
let onYes = null, wired = false, visible = false;

const TUTORIALS = {
    default: [
        ['WASD', 'Move'],
        ['Mouse', 'Aim'],
        ['L-Click', 'Shoot / Use'],
        ['R-Click', 'Move to cursor'],
        ['1&nbsp;2&nbsp;3', 'Weapons'],
        ['Q', 'Swap Weapon'],
        ['4', 'Medkit'],
        ['F', 'Melee'],
        ['Shift', 'Dodge'],
    ],
    stage8: [
        ['WASD', 'Steer the vehicle'],
        ['Mouse', 'Aim'],
        ['L-Click', 'Shoot raiders'],
        ['1&nbsp;2&nbsp;3', 'Weapons'],
        ['Q', 'Swap Weapon'],
        ['4', 'Medkit'],
        ['A / D', 'Change lanes'],
        ['W / S', 'Push forward / fall back'],
    ],
    stage10: [
        ['WASD', 'Fly'],
        ['Guns', 'Auto-fire forward'],
        ['L-Click', 'Manual guns'],
        ['Space', 'Drop bomb'],
        ['R-Click', 'Drop bomb'],
        ['Enter', 'Manual guns'],
        ['Drops', 'Collect repairs / bombs'],
    ],
};

function tutorialProfile() {
    const p = activeScene?.tutorialProfile;
    if (p && TUTORIALS[p]) return p;
    if (activeScene?.id === 'campaign-8') return 'stage8';
    if (activeScene?.id === 'campaign-10') return 'stage10';
    return 'default';
}

function startTutorialProfile() {
    const p = activeScene?.startTutorialProfile;
    if (p && TUTORIALS[p]) return p;
    if (activeScene?.id === 'campaign-1') return 'default';
    return null;
}

function renderRows(grid, rows) {
    if (!grid) return;
    grid.innerHTML = rows.map(([key, desc]) =>
        `<div class="keyRow"><span class="keyCap">${key}</span><span class="keyDesc">${desc}</span></div>`
    ).join('');
}

function renderPauseTutorial() {
    const profile = tutorialProfile();
    if (tutTitle) tutTitle.textContent = profile === 'stage8' ? 'STAGE 8 CONTROLS'
        : profile === 'stage10' ? 'STAGE 10 CONTROLS' : 'HOW TO PLAY';
    if (tutGrid) renderRows(tutGrid, TUTORIALS[profile]);
}

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
    startTitle = instr?.querySelector('.startTitle');
    startSub = instr?.querySelector('.startSub');
    startGrid = instr?.querySelector('.keyGrid');
    startCta = instr?.querySelector('.startCta');
    tutTitle = tutP?.querySelector('.pauseTitle');
    tutGrid = tutP?.querySelector('.keyGrid');
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
    renderPauseTutorial();
    if (mainP) mainP.style.display = 'none';
    if (confP) confP.style.display = 'none';
    if (tutP) tutP.style.display = 'flex';
}

export function showStartPrompt() {
    wire();
    visible = false;
    if (menu) menu.style.display = 'none';
    if (instr) instr.style.display = '';
    const profile = startTutorialProfile();
    if (profile) {
        if (startTitle) startTitle.textContent = 'Click to Start the Action';
        if (startSub) startSub.textContent = "Enters fullscreen - so Ctrl+W etc. won't close the tab";
        if (startGrid) { startGrid.style.display = ''; renderRows(startGrid, TUTORIALS[profile]); }
        if (startCta) startCta.textContent = 'Click anywhere to begin';
    } else {
        if (startTitle) startTitle.textContent = 'Click to Continue';
        if (startSub) startSub.textContent = '';
        if (startGrid) startGrid.style.display = 'none';
        if (startCta) startCta.textContent = 'Click anywhere to continue';
    }
    const blocker = document.getElementById('blocker');
    if (blocker) blocker.style.display = 'flex';
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
