// Konsol cheat (tombol `): kotak input untuk mengetik perintah. Ketikan
// DIBANGUN MANUAL dari event keydown (handleKey, dipanggil input.js) — bukan
// dari <input> ter-fokus — supaya tak bergantung pada fokus/Keyboard Lock saat
// pointer-lock (tombol seperti G/D ikut ter-lock selama main). Saat konsol
// terbuka, game DI-PAUSE & input.js menelan tombol gameplay. Perintah:
// "god-mode" + Enter = TOGGLE kebal player & Monas; "more-money" + Enter =
// +100000 skor (mata uang shop Survival). Teks UI English (aturan permanen).

import { setPaused, godMode, setGodMode, addScore } from './state.js';
import { updateUI } from './hud.js';
import { activeScene } from './sceneManager.js';

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
    } else if (c === 'more-money') {
        addScore(100000);       // +100000 skor = mata uang shop Survival
        updateUI();             // segarkan angka MONEY di HUD
        setFeedback('+100000 score - buy anything in the Field Shop!');
    } else if (/^skip-to-wave-\d+$/.test(c)) {
        // Lompat langsung ke wave n (Survival). Scene aktif yang mendukung punya
        // hook cheatSkipToWave (hanya survivalScene) -> bersihkan lapangan +
        // startWave(n) dengan formula naik-wave. Tutup konsol utk mulai bertarung.
        const n = parseInt(c.slice('skip-to-wave-'.length), 10);
        if (activeScene && typeof activeScene.cheatSkipToWave === 'function') {
            const applied = activeScene.cheatSkipToWave(n);
            setFeedback('Jumped to wave ' + applied + ' - close the console to fight!');
        } else {
            setFeedback('skip-to-wave only works in Survival mode', false);
        }
    } else if (/^skip-to-stage-\d+$/.test(c)) {
        // Lompat langsung ke stage campaign n (2/3/4). Scene stage campaign punya
        // hook cheatSkipToStage (transition.js campaignJumpToStage) -> bersihkan
        // robot + setScene(target). Tutup konsol utk main di stage baru.
        const n = parseInt(c.slice('skip-to-stage-'.length), 10);
        if (activeScene && typeof activeScene.cheatSkipToStage === 'function') {
            const applied = activeScene.cheatSkipToStage(n);
            if (applied) setFeedback('Jumped to Stage ' + applied + ' - close the console to play!');
            else setFeedback('Invalid stage - use skip-to-stage-1..4', false);
        } else {
            setFeedback('skip-to-stage only works in Campaign mode', false);
        }
    } else if (c) {
        setFeedback('Unknown command: ' + cmd, false);
    }
}
