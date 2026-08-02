// SCENE menu (DOM murni, sebelum dunia 3D dibangun): MENU UTAMA (#mainMenu,
// z-index 32: Start Game / Settings / Credits / Exit) -> layar pilih mode
// (#modeSelect, z-index 30) + baris difficulty. Dunia baru dibangun SETELAH mode
// dipilih — onPick(mode) memanggil startGame; difficulty diterapkan ke CFG TEPAT
// sebelum itu. Cutscene pembuka KEDUA MODE sekarang adegan 3D di dalam engine
// (campaign: cutscenes/intro.js, survival: survival/cutscenes/monasIntro.js) —
// SLIDESHOW DOM 4 slide `#cutscene` + `initCutscene()` DIHAPUS 2026-07-27.

import { applyDifficulty } from '../core/config.js';
import { setDifficulty } from '../core/state.js';
import { loadCampaignStage, clearCampaignSave } from '../core/saveGame.js';
import { startMenuMusic, stopMusic, getMusicVolume, setMusicVolume, getSFXVolume, setSFXVolume } from '../utils/sfx.js';

// Satu sumber konten Credits. Markup dibangun saat menu diinisialisasi agar
// kredit proyek tidak tercecer sebagai salinan statis di index.html.
export const MENU_CREDITS = Object.freeze({
    eyebrow: 'A GIBS 2045 PRODUCTION',
    intro: 'A browser action game forged from code, persistence, and one impossible mission.',
    groups: Object.freeze([
        Object.freeze({
            role: 'Created, Designed & Directed by',
            name: 'Arief Nugraha',
            detail: 'Original concept, game direction, story, systems, world design, and production.',
            wide: true,
        }),
        Object.freeze({
            role: 'AI Development Collaborators',
            name: 'Anthropic Claude & OpenAI Codex',
            detail: 'Development assistance across implementation, iteration, debugging, and documentation.',
        }),
        Object.freeze({
            role: 'Engine & Rendering',
            name: 'Three.js r128',
            detail: 'Released under the MIT License.',
        }),
        Object.freeze({
            role: 'Visual Production',
            name: 'Original Procedural 3D',
            detail: 'Geometry, environments, characters, vehicles, materials, and effects built in code.',
        }),
        Object.freeze({
            role: 'Sound & Music',
            name: 'Royalty-Free Audio Sources',
            detail: 'Individual audio creators retain the rights to their work.',
        }),
        Object.freeze({
            role: 'Typography',
            name: 'Courier Prime',
            detail: 'Designed by Alan Dague-Greene and released under the SIL Open Font License.',
        }),
        Object.freeze({
            role: 'Special Thanks',
            name: 'The Playtesters',
            detail: 'Friends, players, and everyone who stood with Major Gibran.',
            wide: true,
        }),
    ]),
    footer: 'MADE IN INDONESIA — ONE LINE, ONE ROBOT, ONE IMPOSSIBLE MISSION AT A TIME.',
});

// Campaign baru menahan musik menu sepanjang loading + prolog; intro heli yang
// mematikannya pada frame live pertama. Continue dan Survival tetap memakai
// perilaku lama: musik berhenti begitu mode dipilih.
export const keepMenuMusicFor = (mode, stage) => mode === 'campaign' && stage === 1;

export function initMenu(onPick) {
    initMainMenu();
    // --- Pilihan difficulty (localStorage; default normal). applyDifficulty
    // idempoten (selalu dihitung dari CFG_BASE) — aman diklik berkali-kali. ---
    let diff = localStorage.getItem('gibsDifficulty') || 'normal';
    const dbtns = document.querySelectorAll('#diffRow .dbtn');
    const paintDiff = () => dbtns.forEach(b => b.classList.toggle('selected', b.dataset.d === diff));
    dbtns.forEach(b => b.addEventListener('click', () => {
        diff = b.dataset.d;
        localStorage.setItem('gibsDifficulty', diff);
        paintDiff();
    }));
    paintDiff();

    let picked = false;
    let continueStage = 0;   // stage checkpoint yang sedang ditanyakan di prompt

    // Mulai mode terpilih pada stage tertentu (campaign: 1 = baru, >1 = continue).
    function beginMode(mode, stage) {
        if (picked) return;   // jaga-jaga klik ganda
        picked = true;
        if (!keepMenuMusicFor(mode, stage)) stopMusic();
        // Terapkan difficulty SEBELUM dunia/entitas dibangun: CFG dimutasi
        // dari CFG_BASE + high score dimuat per-difficulty.
        applyDifficulty(diff);
        setDifficulty(diff);
        document.getElementById('modeSelect').style.display = 'none';
        document.getElementById('continuePrompt').style.display = 'none';
        // Cutscene pembuka kedua mode diputar OTOMATIS oleh startGame setelah
        // layar loading (adegan 3D, bukan slideshow) — tak ada overlay DOM lagi.
        onPick(mode, { stage });
    }

    document.querySelectorAll('#modeSelect .modeCard').forEach(card => {
        card.addEventListener('click', () => {
            if (picked) return;
            const mode = card.dataset.mode;
            // Campaign dengan checkpoint tersimpan (stage >1) → tawarkan Continue.
            if (mode === 'campaign') {
                const saved = loadCampaignStage();
                if (saved > 1) { showContinuePrompt(saved); return; }
            }
            beginMode(mode, 1);
        });
    });

    // Prompt "Continue game?" (campaign): Yes → mulai di stage checkpoint;
    // No → hapus save + New Game dari stage 1.
    const cp = document.getElementById('continuePrompt');
    function showContinuePrompt(stage) {
        continueStage = stage;
        document.getElementById('cpText').textContent =
            `You have a saved campaign at Stage ${stage}. Continue?`;
        cp.style.display = 'flex';
    }
    document.getElementById('cpYes').addEventListener('click', () => beginMode('campaign', continueStage));
    document.getElementById('cpNo').addEventListener('click', () => {
        clearCampaignSave();
        beginMode('campaign', 1);
    });

    // Tombol Back di layar pilih mode -> kembali ke menu utama.
    document.getElementById('modeBack').addEventListener('click', () => {
        document.getElementById('modeSelect').style.display = 'none';
        document.getElementById('mainMenu').style.display = 'flex';
    });
}

// Menu utama: Start Game menyingkap #modeSelect; Settings/Credits membuka
// panelnya masing-masing (Back kembali ke daftar tombol); Exit menutup tab.
function initMainMenu() {
    // MUSIK MAIN MENU (2026-07-19, permintaan user): menyala begitu menu tampil.
    // Autoplay browser biasanya menolak sebelum gesture pertama — retry otomatis
    // sfx.js menyalakannya pada pointerdown/keydown pertama player.
    startMenuMusic();
    const menu = document.getElementById('mainMenu');
    const settings = document.getElementById('settingsPanel');
    const credits = document.getElementById('creditsPanel');

    const showList = () => {
        menu.classList.remove('subview');
        settings.classList.remove('open');
        credits.classList.remove('open');
    };
    const openPanel = (p) => {
        menu.classList.add('subview');
        settings.classList.toggle('open', p === settings);
        credits.classList.toggle('open', p === credits);
    };

    document.getElementById('mmStart').addEventListener('click', () => {
        menu.style.display = 'none';
        document.getElementById('modeSelect').style.display = 'flex';
    });
    document.getElementById('mmSettings').addEventListener('click', () => openPanel(settings));
    document.getElementById('mmCredits').addEventListener('click', () => openPanel(credits));
    document.getElementById('mmExit').addEventListener('click', exitGame);
    document.querySelectorAll('#mainMenu .menuBack').forEach(b =>
        b.addEventListener('click', showList));

    initCredits();
    initSettingsQuality();
    initSettingsVolume();
}

function initCredits() {
    const eyebrow = document.getElementById('creditsEyebrow');
    const intro = document.getElementById('creditsIntro');
    const body = document.getElementById('creditsBody');
    const footer = document.getElementById('creditsFooter');
    if (!eyebrow || !intro || !body || !footer || body.dataset.ready === '1') return;

    eyebrow.textContent = MENU_CREDITS.eyebrow;
    intro.textContent = MENU_CREDITS.intro;
    footer.textContent = MENU_CREDITS.footer;
    for (const credit of MENU_CREDITS.groups) {
        const group = document.createElement('div');
        group.className = 'creditGroup' + (credit.wide ? ' creditWide' : '');

        const role = document.createElement('div');
        role.className = 'creditRole'; role.textContent = credit.role;
        const name = document.createElement('div');
        name.className = 'creditName'; name.textContent = credit.name;
        const detail = document.createElement('div');
        detail.className = 'creditDetail'; detail.textContent = credit.detail;

        group.append(role, name, detail); body.appendChild(group);
    }
    body.dataset.ready = '1';
}

// Slider volume MUSIK & SFX di panel Settings (2026-07-19, permintaan user;
// revisi: nilai = volume ABSOLUT 0..1 — slider penuh = 1.0, DEFAULT musik 80%
// & SFX 100%). Disimpan localStorage lewat setter sfx.js; musik menu yang
// sedang menyala langsung berubah saat slider digeser (setMusicVolume live).
function initSettingsVolume() {
    const wire = (sliderId, valId, get, set) => {
        const s = document.getElementById(sliderId), v = document.getElementById(valId);
        if (!s || !v) return;
        const paint = () => { v.textContent = Math.round(get() * 100) + '%'; };
        s.value = Math.round(get() * 100);
        paint();
        s.addEventListener('input', () => { set(s.value / 100); paint(); });
    };
    wire('musicVolSlider', 'musicVolVal', getMusicVolume, setMusicVolume);
    wire('sfxVolSlider', 'sfxVolVal', getSFXVolume, setSFXVolume);
}

// Tombol kualitas grafis di panel Settings: engine belum ada di sini, jadi
// hanya SIMPAN pilihan (localStorage 'gibsQuality') + tandai aktif. Penerapan
// sebenarnya (applyQuality) terjadi di startGame lewat initQualityUI yang
// membaca nilai tersimpan ini. Default meniru initQualityUI (tebak perangkat).
function initSettingsQuality() {
    const btns = document.querySelectorAll('#qualityRow .qbtn');
    const saved = parseInt(localStorage.getItem('gibsQuality'), 10);
    const weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    let tier = (saved >= 0 && saved <= 4) ? saved : (weak ? 1 : 0);
    const paint = () => btns.forEach(b => b.classList.toggle('active', +b.dataset.q === tier));
    btns.forEach(b => b.addEventListener('click', () => {
        tier = +b.dataset.q;
        localStorage.setItem('gibsQuality', tier);
        paint();
    }));
    localStorage.setItem('gibsQuality', tier);   // pastikan tersimpan utk startGame
    paint();
}

// Exit Game: konfirmasi, lalu coba tutup tab (window.close hanya berhasil bila
// tab dibuka lewat skrip). Bila gagal, tampilkan pesan "silakan tutup tab ini".
function exitGame() {
    if (!confirm('Exit the game?')) return;
    window.open('', '_self');   // beberapa browser izinkan close hanya utk window "self"
    window.close();
    // Fallback bila browser menolak menutup tab: layar perpisahan sederhana.
    document.body.innerHTML =
        '<div style="position:fixed;inset:0;display:flex;align-items:center;' +
        'justify-content:center;background:#000;color:#ffb84d;' +
        "font-family:'Courier Prime','Courier New',monospace;" +
        'font-size:26px;letter-spacing:2px;text-align:center;padding:20px;">' +
        'Thanks for playing Gibran vs Robot.<br>You may now close this tab.</div>';
}
