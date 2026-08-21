// SCENE menu (DOM murni, sebelum dunia 3D dibangun): MENU UTAMA (#mainMenu,
// z-index 32: Start Game / Settings / Credits / Exit) -> layar pilih mode
// (#modeSelect, z-index 30) + baris difficulty. Dunia baru dibangun SETELAH mode
// dipilih — onPick(mode) memanggil startGame; difficulty diterapkan ke CFG TEPAT
// sebelum itu. Cutscene pembuka KEDUA MODE sekarang adegan 3D di dalam engine
// (campaign: cutscenes/intro.js, survival: survival/cutscenes/monasIntro.js) —
// SLIDESHOW DOM 4 slide `#cutscene` + `initCutscene()` DIHAPUS 2026-07-27.
//
// ROMBAK TAMPILAN 2026-08-09 (permintaan user: menu lama "terlihat AI
// generated"). Yang bertambah di sini — semua di atas kontrak lama, bukan
// menggantinya: latar kota berlapis dari scenes/menuArt.js + parallax pointer,
// logo PNG transparan sebagai lettering judul menu utama,
// navigasi keyboard (panah/Enter/Escape) dgn baris tersorot, ringkasan angka
// difficulty yang DIBACA DARI CFG (jadi retune gameplay.json ikut terbaca), dan
// isian --fill slider volume supaya relnya terisi sesuai nilai.
//
// PAS KEDUA 2026-08-10 (user: "masih terlihat AI generated") murni pekerjaan
// markup/CSS — index.html + style.css dirampingkan, JS di file ini TIDAK
// berubah: baris menu tetap `.navRow` (kini hanya berisi `.nrLabel`), kartu
// tetap `.modeCard[data-mode]`, dan seluruh id kontrak tetap sama.

import { applyDifficulty, CFG } from '../core/config.js';
import { setDifficulty } from '../core/state.js';
import { loadCampaignStage, clearCampaignSave } from '../core/saveGame.js';
import { startMenuMusic, stopMusic, getMusicVolume, setMusicVolume, getSFXVolume, setSFXVolume } from '../utils/sfx.js';
import { paintMenuArt } from './menuArt.js';

// Satu sumber konten Credits. Markup dibangun saat menu diinisialisasi agar
// kredit proyek tidak tercecer sebagai salinan statis di index.html.
//
// DISEDERHANAKAN 2026-08-10 (permintaan user: "jauh lebih sederhana, seperti
// di menu settings"): tiap kredit kini SATU BARIS `role → name`, sama seperti
// baris Settings. Yang dibuang: eyebrow produksi, kalimat pembuka miring, dan
// kalimat `detail` di bawah tiap nama — tujuh kalimat itulah yang membuat
// panel ini terbaca padat. Keterangan lisensi TIDAK ikut dibuang (itu
// kewajiban atribusi, bukan hiasan) — ia dilipat ke dalam baris namanya.
//
// 2026-08-21 (permintaan user): nama pembuat memakai nama studio "Sunday
// Afternoon Games", dan baris "AI Development" DIBUANG — tak ada lagi kredit
// yang menyebut game ini dibantu AI. Jangan ditambahkan kembali tanpa diminta.
export const MENU_CREDITS = Object.freeze({
    groups: Object.freeze([
        Object.freeze({ role: 'Created & Directed by', name: 'Sunday Afternoon Games' }),
        Object.freeze({ role: 'Engine', name: 'Three.js r128 — MIT License' }),
        Object.freeze({ role: 'Visuals', name: 'Original procedural 3D' }),
        Object.freeze({ role: 'Audio', name: 'Royalty-free sources' }),
        Object.freeze({ role: 'Typeface', name: 'Courier Prime — SIL Open Font License' }),
        Object.freeze({ role: 'Special Thanks', name: 'The Playtesters' }),
    ]),
    footer: 'MADE IN INDONESIA',
});

// Campaign baru menahan musik menu sepanjang loading + prolog; intro heli yang
// mematikannya pada frame live pertama. Continue dan Survival tetap memakai
// perilaku lama: musik berhenti begitu mode dipilih.
export const keepMenuMusicFor = (mode, stage) => mode === 'campaign' && stage === 1;

// Ringkasan angka difficulty di bawah segmented control — DIBACA DARI CFG,
// bukan teks tetap, supaya retune config/gameplay.json langsung ikut tampil
// (aturan repo: apa pun yang mengutip angka gameplay harus config-driven).
export function difficultyNote(name) {
    const d = CFG && CFG.difficulty && CFG.difficulty[name];
    if (!d) return '';
    const parts = [];
    const add = (label, v) => {
        if (!(Math.abs(v - 1) > 0.001)) return;   // yang sama dgn baseline tak perlu disebut
        parts.push(label + ' <b>&times;' + (Math.round(v * 100) / 100).toFixed(2) + '</b>');
    };
    add('Enemy HP', d.robotHpMul);
    add('Enemy damage', d.robotDamageMul);
    add('Wave gap', d.spawnIntervalMul);
    // Semua pengali = 1 (normal) → menyebut "×1.00" tiga kali cuma bising.
    return parts.length ? parts.join(' &middot; ') : 'Baseline &mdash; the mission as designed';
}

export function initMenu(onPick) {
    initMainMenu();
    paintMenuArt(document.getElementById('modeSelect'));
    initParallax();
    // --- Pilihan difficulty (localStorage; default normal). applyDifficulty
    // idempoten (selalu dihitung dari CFG_BASE) — aman diklik berkali-kali. ---
    let diff = localStorage.getItem('gibsDifficulty') || 'normal';
    const dbtns = document.querySelectorAll('#diffRow .dbtn');
    const dnote = document.getElementById('diffNote');
    const paintDiff = () => {
        dbtns.forEach(b => b.classList.toggle('selected', b.dataset.d === diff));
        if (dnote) dnote.innerHTML = difficultyNote(diff);
    };
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
    document.getElementById('modeBack').addEventListener('click', backToMainMenu);

    // Escape = mundur satu langkah di mana pun pemain berada (prompt Continue →
    // pilih mode → menu utama). initInput() belum jalan sebelum startGame, jadi
    // tak ada listener lain yang berebut tombol ini.
    document.addEventListener('keydown', (e) => {
        if (picked || e.key !== 'Escape') return;
        if (cp.style.display === 'flex') { cp.style.display = 'none'; return; }
        if (document.getElementById('modeSelect').style.display !== 'none') backToMainMenu();
    });
}

// Kembali dari layar pilih mode ke menu utama (dipakai tombol Back + Escape).
function backToMainMenu() {
    document.getElementById('modeSelect').style.display = 'none';
    document.getElementById('mainMenu').style.display = 'flex';
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

    paintMenuArt(menu);
    initMenuNav(menu, () => showList());
    initCredits();
    initSettingsQuality();
    initSettingsVolume();
}

// Sorotan + navigasi keyboard daftar menu utama. Barisnya <button>, jadi
// Enter/Space sudah memicu klik sendiri — di sini hanya panah (pindah sorotan),
// Escape (tutup panel), dan sinkronisasi sorotan dgn pointer. Kelas `.on`
// dipakai KEDUA jalur (mouse & keyboard) supaya tak pernah ada dua baris
// tersorot sekaligus seperti kalau memakai :hover terpisah.
function initMenuNav(menu, closePanel) {
    const rows = [...menu.querySelectorAll('#mainMenuMain .navRow')];
    if (!rows.length) return;
    let idx = 0;

    const paint = (i, focus) => {
        idx = (i + rows.length) % rows.length;
        rows.forEach((r, k) => r.classList.toggle('on', k === idx));
        if (focus) rows[idx].focus({ preventScroll: true });
    };
    rows.forEach((r, k) => {
        r.addEventListener('mouseenter', () => paint(k, false));
        r.addEventListener('focus', () => paint(k, false));
    });
    paint(0, false);

    document.addEventListener('keydown', (e) => {
        if (menu.style.display === 'none') return;
        if (e.key === 'Escape') {
            if (menu.classList.contains('subview')) { closePanel(); e.preventDefault(); }
            return;
        }
        if (menu.classList.contains('subview')) return;   // panel terbuka: daftar tak aktif
        if (e.key === 'ArrowDown') { paint(idx + 1, true); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { paint(idx - 1, true); e.preventDefault(); }
    });
}

// Parallax halus latar kota: --px (satuan px) diwariskan ke tiap .mCity yang
// mengalikannya dgn --depth lapisannya, jadi lapisan dekat bergerak lebih jauh
// daripada cakrawala. Transisi CSS 0.5s yang memberi bobotnya — di sini cukup
// satu penulisan variabel per gerakan pointer.
function initParallax() {
    const screens = [...document.querySelectorAll('.menuScreen')];
    if (!screens.length) return;
    const AMP = 18;
    document.addEventListener('pointermove', (e) => {
        const px = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * -2 * AMP;
        for (const s of screens) s.style.setProperty('--px', px.toFixed(1) + 'px');
    });
}

// Baris kredit memakai tata bahasa yang SAMA dgn baris Settings: label mikro
// amber di kolom kiri, nilainya di kolom kanan. `.qlabel` sengaja dipakai ulang
// (bukan kelas baru) supaya panel ini tunduk pada satu aturan label mikro
// bersama — menambah ukuran label baru justru kesalahan yang sudah dibereskan
// di pas kedua.
function initCredits() {
    const body = document.getElementById('creditsBody');
    const footer = document.getElementById('creditsFooter');
    if (!body || !footer || body.dataset.ready === '1') return;

    footer.textContent = MENU_CREDITS.footer;
    for (const credit of MENU_CREDITS.groups) {
        const row = document.createElement('div');
        row.className = 'credRow';
        const role = document.createElement('span');
        role.className = 'qlabel'; role.textContent = credit.role;
        const name = document.createElement('span');
        name.className = 'credName'; name.textContent = credit.name;
        row.append(role, name); body.appendChild(row);
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
        // --fill = porsi rel yang tercat amber; dibaca CSS track slider.
        const paint = () => {
            const pct = Math.round(get() * 100);
            v.textContent = pct + '%';
            s.style.setProperty('--fill', pct + '%');
        };
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
        'Thanks for playing Decommission Day.<br>You may now close this tab.</div>';
}
