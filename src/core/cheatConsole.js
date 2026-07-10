// Konsol cheat (tombol `): kotak input untuk mengetik perintah. Ketikan
// DIBANGUN MANUAL dari event keydown (handleKey, dipanggil input.js) — bukan
// dari <input> ter-fokus — supaya tak bergantung pada fokus/Keyboard Lock saat
// pointer-lock (tombol seperti G/D ikut ter-lock selama main). Saat konsol
// terbuka, game DI-PAUSE & input.js menelan tombol gameplay. Perintah:
// "god-mode" + Enter = TOGGLE kebal player & Monas. Teks UI English (aturan permanen).

import { setPaused, godMode, setGodMode } from './state.js';

let open = false, buffer = '', inputEl = null, feedbackEl = null, boxEl = null, wired = false;

function wire() {
    if (wired) return;
    wired = true;
    inputEl = document.getElementById('cheatInput');
    feedbackEl = document.getElementById('cheatFeedback');
    boxEl = document.getElementById('cheatConsole');
    if (boxEl) boxEl.addEventListener('mousedown', e => e.stopPropagation());
}

function render() { if (inputEl) inputEl.value = buffer; }

export function isCheatConsoleOpen() { return open; }

export function openCheatConsole() {
    wire();
    if (open) return;
    open = true;
    buffer = '';
    setPaused(true);   // bekukan game saat mengetik (tak ada damage/gerak/tembak)
    if (boxEl) boxEl.style.display = 'flex';
    render();
    setFeedback(godMode ? 'God mode: ON' : '');
}

function hide() {
    open = false;
    if (boxEl) boxEl.style.display = 'none';
}

// Tutup via tombol ` : sembunyikan + LANJUTKAN game.
export function closeCheatConsole() { if (open) { hide(); setPaused(false); } }
// Tutup paksa via unlock/ESC: sembunyikan TANPA resume (pause dikelola input.js).
export function forceHideCheatConsole() { if (open) hide(); }

// Bangun perintah dari keydown (dipanggil input.js selama konsol terbuka).
// Backtick (toggle) & gating pointer-lock ditangani di input.js; di sini hanya
// Enter / Backspace / karakter cetak.
export function handleKey(e) {
    if (!open) return;
    if (e.key === 'Enter') { e.preventDefault(); runCommand(buffer.trim()); buffer = ''; render(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); buffer = buffer.slice(0, -1); render(); return; }
    if (e.key && e.key.length === 1 && /[\w \-]/.test(e.key)) { e.preventDefault(); buffer += e.key; render(); }
}

function setFeedback(text, ok = true) {
    if (!feedbackEl) return;
    feedbackEl.textContent = text || '';
    feedbackEl.style.color = ok ? '#7fe0a0' : '#ff6b6b';
}

function runCommand(cmd) {
    const c = cmd.toLowerCase();
    if (c === 'god-mode') {
        setGodMode(!godMode);   // TOGGLE
        setFeedback(godMode ? 'God mode: ON - player & Monas are invincible' : 'God mode: OFF');
    } else if (c) {
        setFeedback('Unknown command: ' + cmd, false);
    }
}
