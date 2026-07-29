// Konsol cheat (tombol `): kotak input untuk mengetik perintah. Ketikan
// DIBANGUN MANUAL dari event keydown (handleKey, dipanggil input.js) — bukan
// dari <input> ter-fokus — supaya tak bergantung pada fokus/Keyboard Lock saat
// pointer-lock (tombol seperti G/D ikut ter-lock selama main). Saat konsol
// terbuka, game DI-PAUSE & input.js menelan tombol gameplay. Perintah:
// "god-mode" + Enter = TOGGLE kebal player & Monas; "more-money" + Enter =
// +100000 skor (mata uang shop Survival); "give-weapon-N" = senjata level maks
// (2026-07-29); "give-armor-N" = pakai armor tier N durability penuh
// (2026-07-30). Teks UI English (aturan permanen).

import { setPaused, godMode, setGodMode, addScore, player, syncOwnedFromWeapons, maxAmmoFor } from './state.js';
import { CFG } from './config.js';
import { updateUI } from './hud.js';
import { activeScene } from './sceneManager.js';
import { WEAPON_DEF, refreshOwnedWeapon, startSwitch } from '../entities/weapons.js';

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

// ----- CHEAT SENJATA "give-weapon-N" (2026-07-29, permintaan user) -----
// N = nomor senjata (1 pistol / 2 shotgun / 3 rifle / 4 launcher); yang bisa
// diberikan hanya 2/3/4 — pistol sudah selalu dibawa. Senjata datang di LEVEL
// MAKSIMUM (`CFG.weapons.maxWeaponLevel`, config-driven) dengan kolam peluru
// penuh; khusus launcher, level maks itulah yang menjadikannya ROCKET LAUNCHER
// (weapons.js: `isRocket` = launcher lvl >= 3).
const GIVE_WEAPON = { 2: 'shotgun', 3: 'rifle', 4: 'launcher' };

export function giveCheatWeapon(w) {
    if (!WEAPON_DEF[w]) return null;
    const maxLvl = CFG.weapons.maxWeaponLevel || 1;
    const had = !!player.owned[w];
    let dropped = null;
    if (!had) {
        const W = player.weapons;
        // Slot penuh (maxWeapons): cheat TIDAK memunculkan dialog "pilih yang
        // diganti" seperti shop — buang PISTOL dulu (bawaan, paling lemah),
        // baru slot terakhir bila pistol sudah tak ada.
        if (W.length >= CFG.weapons.maxWeapons) {
            const di = W.indexOf('pistol') >= 0 ? W.indexOf('pistol') : W.length - 1;
            dropped = W[di];
            W.splice(di, 1);
        }
        W.push(w);
        syncOwnedFromWeapons();
    }
    player.weaponLvl[w] = maxLvl;
    player[w].ammo = maxAmmoFor(w);
    refreshOwnedWeapon();   // senjata aktif & lastWeapon tetap sah + segarkan HUD
    startSwitch(w);         // langsung dipegang (animasi jalan begitu konsol ditutup)
    return {
        weapon: w, lvl: maxLvl, had, dropped,
        slot: player.weapons.indexOf(w) + 1,
        label: w === 'launcher' && maxLvl >= 3 ? 'Rocket Launcher' : WEAPON_DEF[w].name,
    };
}

// ----- CHEAT ARMOR "give-armor-N" (2026-07-30, permintaan user) -----
// N = tier armor (1/2/3 = CFG.armor.tiers — jumlah tier & nilainya CONFIG-DRIVEN,
// tidak dihardcode di sini). Efeknya = MENGENAKAN tier itu dgn durability PENUH,
// sama seperti membelinya di Field Shop (`armorTierItem.apply`, survival/shop.js),
// TAPI tanpa gerbang harga/tier: cheat boleh MENURUNKAN tier (shop menolak tier
// lebih rendah dari yang dipakai) dan boleh dipakai berulang utk REPAIR penuh.
// Overlay pelat di avatar mengikuti sendiri (playerAvatar membaca player.armorLvl
// tiap frame lewat cache armorKey), jadi tak ada yang perlu dipanggil di sini.
export function giveCheatArmor(tier) {
    const T = (CFG.armor && CFG.armor.tiers) || [];
    const t = T[tier - 1];
    if (!t) return null;
    const prev = player.armorLvl || 0;
    player.armorLvl = tier;
    player.armor = player.armorMax = t.durability;
    updateUI();   // bar ARMOR muncul/terisi di HUD
    return { tier, prev, durability: t.durability, reduce: t.reduce || 0 };
}

// Diekspor supaya smoke bisa menjalankan perintah tanpa mensimulasikan ketikan.
export function runCheatCommand(cmd) { runCommand(cmd); }

function runCommand(cmd) {
    const c = cmd.toLowerCase();
    if (c === 'god-mode') {
        setGodMode(!godMode);   // TOGGLE
        setFeedback(godMode ? 'God mode: ON - player & Monas are invincible' : 'God mode: OFF');
    } else if (c === 'more-money') {
        addScore(100000);       // +100000 skor = mata uang shop Survival
        updateUI();             // segarkan angka MONEY di HUD
        setFeedback('+100000 score - buy anything in the Field Shop!');
    } else if (/^give-weapon-\d+$/.test(c)) {
        const w = GIVE_WEAPON[parseInt(c.slice('give-weapon-'.length), 10)];
        if (!w) {
            setFeedback('No such weapon - use give-weapon-2 (Shotgun), -3 (Assault Rifle) or -4 (Rocket Launcher)', false);
        } else {
            const r = giveCheatWeapon(w);
            setFeedback(`${r.label} Lv${r.lvl} ${r.had ? 'restocked' : 'added'} in slot ${r.slot} (ammo full)`
                + (r.dropped ? ` - dropped ${WEAPON_DEF[r.dropped].name}` : '')
                + ' - close the console, it is already drawn');
        }
    } else if (/^give-armor-\d+$/.test(c)) {
        const n = parseInt(c.slice('give-armor-'.length), 10);
        const r = giveCheatArmor(n);
        if (!r) {
            const max = ((CFG.armor && CFG.armor.tiers) || []).length || 1;
            setFeedback('No such armor tier - use give-armor-1..' + max, false);
        } else {
            setFeedback(`Armor Level ${r.tier} equipped - blocks ${Math.round(r.reduce * 100)}%`
                + ` of incoming damage, durability ${r.durability}/${r.durability}`
                + (r.prev && r.prev !== r.tier ? ` (replaced Level ${r.prev})` : ''));
        }
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
