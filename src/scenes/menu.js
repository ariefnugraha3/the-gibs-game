// SCENE menu (DOM murni, sebelum dunia 3D dibangun): MENU UTAMA (#mainMenu,
// z-index 32: Start Game / Settings / Credits / Exit) -> layar pilih mode
// (#modeSelect, z-index 30) + baris difficulty + cutscene pembuka (z-index 20,
// khusus Survival). Dunia baru dibangun SETELAH mode dipilih — onPick(mode)
// memanggil startGame; difficulty diterapkan ke CFG TEPAT sebelum itu.

import { applyDifficulty } from '../core/config.js';
import { setDifficulty } from '../core/state.js';
import { loadCampaignStage, clearCampaignSave } from '../core/saveGame.js';

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
        // Terapkan difficulty SEBELUM dunia/entitas dibangun: CFG dimutasi
        // dari CFG_BASE + high score dimuat per-difficulty.
        applyDifficulty(diff);
        setDifficulty(diff);
        document.getElementById('modeSelect').style.display = 'none';
        document.getElementById('continuePrompt').style.display = 'none';
        // Cutscene pembuka bertema Monas -> hanya untuk Survival; Campaign
        // langsung ke layar mulai (blocker) di bawahnya.
        if (mode === 'campaign') document.getElementById('cutscene').style.display = 'none';
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

    initCutscene();
}

// Menu utama: Start Game menyingkap #modeSelect; Settings/Credits membuka
// panelnya masing-masing (Back kembali ke daftar tombol); Exit menutup tab.
function initMainMenu() {
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

    initSettingsQuality();
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
        'justify-content:center;background:#000;color:#ffb84d;font-family:Arial;' +
        'font-size:26px;letter-spacing:2px;text-align:center;padding:20px;">' +
        'Thanks for playing Gibran vs Robot.<br>You may now close this tab.</div>';
}

// Slideshow pembuka 4 slide (DOM/CSS murni — tak menyentuh state game;
// finish() hanya menyingkap blocker yang klik-nya meminta PointerLock).
function initCutscene() {
    const cutscene = document.getElementById('cutscene');
    const slides = cutscene.querySelectorAll('.slide');
    const caption = document.getElementById('cutsceneCaption');
    const nextBtn = document.getElementById('nextBtn');
    const skipBtn = document.getElementById('skipBtn');
    const dotsWrap = document.getElementById('cutsceneDots');

    const captions = [
        "Jakarta has fallen... a citizen flees from the rogue robots.",
        "But he is not alone — an entire army of machines marches in.",
        "He runs toward Monas, the last place of refuge.",
        "Facing the machine army, he stops and turns around..."
    ];

    slides.forEach(() => {
        const d = document.createElement('div');
        d.className = 'dot';
        dotsWrap.appendChild(d);
    });
    const dots = dotsWrap.querySelectorAll('.dot');

    let idx = 0;
    function show(i) {
        slides.forEach((s, n) => s.classList.toggle('active', n === i));
        dots.forEach((d, n) => d.classList.toggle('on', n === i));
        caption.textContent = captions[i];
        nextBtn.textContent = (i === slides.length - 1) ? "START ⚔️" : "Next ▶";
    }

    function finish() {
        cutscene.style.display = 'none';  // blocker di bawahnya muncul -> klik untuk pointerlock
    }

    nextBtn.addEventListener('click', () => {
        if (idx < slides.length - 1) show(++idx);
        else finish();
    });
    skipBtn.addEventListener('click', finish);

    show(0);
}
