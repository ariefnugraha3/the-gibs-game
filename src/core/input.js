// Semua input: pointer lock, mouse look, klik tembak/ADS, keyboard gameplay,
// jaring pengaman fokus/unload, dan Keyboard Lock (perangkap Ctrl+W dkk).

import { keys, mouse, isPaused, isGameOver, setPaused, mode } from './state.js';
import { camera } from './renderer.js';
import { blocker } from './dom.js';
import { activeScene } from './sceneManager.js';
import { resetGame } from './game.js';
import { showPauseMenu, hidePauseMenu } from './pauseMenu.js';
import { openCheatConsole, closeCheatConsole, forceHideCheatConsole, isCheatConsoleOpen, handleKey } from './cheatConsole.js';
import {
    startReload, tryMelee, trySwitchKey, toggleAim, setAiming,
    grenadeMode, throwEquippedGrenade, equipMedkit
} from '../entities/weapons.js';
import { toggleCrouch, setCrouchHold, clearCrouch, tryJump } from '../entities/player.js';
// Co-op LAN: netRole utk gate kecil (cheat console off, restart milik host);
// localDown = pemain lokal tumbang (input gameplay ditelan sampai respawn).
import { netRole } from '../net/index.js';
import { localDown } from '../net/players.js';

// Dunia MP tidak bisa di-pause: scene MP memasang hook pausable() -> false.
// Scene tanpa hook (semua scene SP) = true -> perilaku lama persis.
const scenePausable = () =>
    !activeScene || !activeScene.pausable || activeScene.pausable();

// ----- Fullscreen + Keyboard Lock: cegah shortcut browser saat main -----
// Ctrl+W (tutup tab), Ctrl+R (reload), Ctrl+T/N, dsb TIDAK bisa dicegah
// dengan preventDefault biasa — itu shortcut level browser/OS. Satu-satunya
// cara andal adalah Keyboard Lock API, yang HANYA menangkap tombol sistem
// saat dokumen fullscreen (Chromium; Firefox/Safari tak punya API-nya — di
// sana jaring pengaman 'beforeunload' di bawah yang bekerja). Kita kunci
// HANYA tombol gameplay + shortcut berbahaya, SENGAJA tanpa Escape, agar
// Esc tetap keluar pointer-lock (pause) seperti biasa.
const LOCK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyG',
    'KeyQ', 'KeyC', 'KeyT', 'KeyN', 'KeyP', 'KeyB',
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

// Apakah game sudah pernah dimulai (pointer pernah ter-lock). Sebelum ini
// #blocker = layar mulai (klik untuk lanjut); sesudahnya, unlock via Esc =
// PAUSE -> tampilkan menu jeda (Restart/Exit).
let hasStarted = false;

export function enterImmersive() {
    // Fullscreen wajib agar Keyboard Lock menangkap tombol sistem (Ctrl+W dkk).
    // Dipanggil dari gesture pengguna (klik blocker / tekan SPASI restart) -> valid.
    const el = document.documentElement;
    if (el && !document.fullscreenElement && el.requestFullscreen) {
        const fp = el.requestFullscreen();
        if (fp && fp.catch) fp.catch(() => { });
    }
    // Selalu lock ulang (idempotent): kalau player sempat keluar fullscreen,
    // browser otomatis melepas lock — panggilan ini memasangnya lagi saat resume.
    if (navigator.keyboard && navigator.keyboard.lock) {
        navigator.keyboard.lock(LOCK_KEYS).catch(() => { });
    }
}

// Minta pointer-lock dengan aman: Chrome melempar NotAllowedError bila diminta
// terlalu cepat setelah Esc (cooldown ~1.25 dtk) — jangan jadi unhandled rejection.
export function requestLock() {
    try {
        const p = document.body.requestPointerLock();
        if (p && p.catch) p.catch(() => { });
    } catch (e) { /* player cukup klik lagi */ }
    enterImmersive();
}

// Co-op: requestLock TANPA gesture pengguna (wavestart dari ready pemain lain /
// timer shop habis / restart host) bisa DITOLAK browser — dan unlock-nya
// terjadi saat shop terbuka (blocker sengaja tidak ditampilkan), jadi tanpa
// bantuan ini tidak ada permukaan klik utk me-lock ulang. Cek sesaat kemudian:
// masih unlocked & bukan shop/game-over -> tampilkan blocker (klik = resume).
export function showBlockerIfUnlocked(delayMs = 350) {
    setTimeout(() => {
        if (document.pointerLockElement === document.body) return;
        if (isGameOver) return;
        const shopModal = activeScene && activeScene.shopActive && activeScene.shopActive();
        if (shopModal) return;
        hidePauseMenu();   // tampilkan instruksi klik-untuk-lanjut, bukan menu jeda
        blocker.style.display = 'flex';
    }, delayMs);
}

// Lepas semua input yang sedang ditekan (dipanggil saat unlock / blur / reset).
export function releaseInputs() {
    mouse.isDown = false;
    setAiming(false);
    clearCrouch();   // toggle jongkok ikut dilepas (konsisten dgn toggle bidik)
    for (const k in keys) keys[k] = false;
    // Catatan: shop survival TIDAK ditutup di sini — ia MODAL (game di-pause,
    // pointer sengaja dilepas untuk kursor). Ditutup hanya oleh Start Next Wave
    // atau saat scene di-enter ulang (reset). Blur/unlock membiarkannya terbuka.
}

export function initInput() {
    // ----- PointerLock -----
    blocker.addEventListener('click', requestLock);
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            hasStarted = true;         // game berjalan -> unlock (Esc) berikutnya = PAUSE
            hidePauseMenu();           // resume: tutup menu jeda bila sedang terbuka
            blocker.style.display = 'none';
            // Pilihan kualitas hanya di layar mulai — sembunyikan permanen
            // begitu game pertama dimulai (blocker pause tak menampilkannya).
            document.getElementById('qualityRow').style.display = 'none';
            setPaused(false);
        } else {
            forceHideCheatConsole();   // ESC saat konsol cheat terbuka -> tutup (menu jeda ambil alih)
            // MP (pausable() false): dunia TERUS berjalan saat unlock — menu ESC
            // lokal / shop tanpa menghentikan pemain lain. Input gameplay saat
            // unlocked ditelan oleh gate di handler bawah.
            if (scenePausable()) setPaused(true);
            releaseInputs();   // bug fix: tombol/tembakan jangan "nyangkut" saat unlock
            // Shop survival membuka -> pointer dilepas DISENGAJA agar kursor bisa
            // memakai menu klik: JANGAN tampilkan blocker pause (game tetap
            // di-pause & shop tetap terbuka). Selain kasus itu: blocker normal.
            const shopModal = activeScene && activeScene.shopActive && activeScene.shopActive();
            if (!shopModal && !isGameOver) {
                blocker.style.display = 'flex';
                // Pause di tengah permainan (bukan layar mulai) -> menu jeda
                // (RESTART GAME / EXIT GAME dgn konfirmasi).
                if (hasStarted) showPauseMenu();
            }
        }
    });

    // ----- Mouse look -----
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    document.addEventListener('mousemove', (e) => {
        if (isPaused || isGameOver) return;
        // MP: tanpa pointer lock (menu ESC lokal di atas dunia berjalan) /
        // tumbang -> kamera tidak boleh ikut gerakan mouse.
        if (!scenePausable() &&
            (document.pointerLockElement !== document.body || localDown)) return;
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= e.movementX * 0.002;
        euler.x -= e.movementY * 0.002;
        euler.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, euler.x));
        camera.quaternion.setFromEuler(euler);
    });

    // ----- Klik kiri = tembak; klik kanan = TOGGLE bidik iron sight (ADS) -----
    document.addEventListener('mousedown', (e) => {
        if (isPaused || isGameOver) return;
        // MP: klik saat pointer tak ter-lock = klik menu (blocker/pause/shop),
        // bukan tembakan; saat tumbang semua klik gameplay ditelan.
        if (!scenePausable() &&
            (document.pointerLockElement !== document.body || localDown)) return;
        // Mode granat (tombol 3): klik kiri = lempar JAUH, klik kanan = lempar
        // DEKAT (bukan tembak/ADS). Ditangani sebelum jalur senjata biasa.
        if (grenadeMode) {
            if (e.button === 0) throwEquippedGrenade('far');
            else if (e.button === 2) throwEquippedGrenade('near');
            return;
        }
        if (e.button === 0) mouse.isDown = true;
        // ADS butuh stamina: saat exhausted, toggle ON diabaikan (OFF selalu boleh)
        if (e.button === 2) toggleAim();
    });
    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) mouse.isDown = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());

    // ----- Keyboard -----
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        // Konsol cheat (tombol `): toggle. Buka HANYA saat main aktif (pointer
        // ter-lock). Saat terbuka, telan semua tombol gameplay (ketikan -> <input>);
        // Enter ditangani oleh input konsol, backtick di sini utk menutup.
        if (e.code === 'Backquote') {
            e.preventDefault();
            if (netRole !== 'off') return;   // cheat console NONAKTIF saat co-op (god-mode = desync)
            if (isCheatConsoleOpen()) closeCheatConsole();
            else if (document.pointerLockElement === document.body) openCheatConsole();
            return;
        }
        if (isCheatConsoleOpen()) { handleKey(e); return; }   // ketikan -> perintah konsol
        // Shop survival = MODAL (game di-pause): telan semua tombol gameplay;
        // hanya SPACE/Enter (Start Next Wave, via scene.shopKey) yang bertindak.
        // Ditangani lebih dulu & TANPA gate !isPaused (shop mem-pause game).
        // Pembelian item lewat KLIK mouse (shop.js), bukan keyboard.
        if (activeScene && activeScene.shopActive && activeScene.shopActive()) {
            if (activeScene.shopKey) activeScene.shopKey(key);
            e.preventDefault();
            return;
        }
        // MP: pointer tak ter-lock (menu ESC lokal — dunia jalan terus) atau
        // pemain tumbang -> telan SEMUA tombol gameplay; hanya SPACE restart
        // game-over yang tetap hidup (host saja — client menunggu host).
        if (!scenePausable() &&
            (document.pointerLockElement !== document.body || localDown)) {
            if (e.code === 'Space' && isGameOver && netRole !== 'client') resetGame();
            return;
        }
        if (keys.hasOwnProperty(key)) keys[key] = true;
        if (e.key === 'Shift') keys.shift = true;
        if (key === 'r' && !isPaused && !isGameOver) startReload();
        // C = toggle jongkok (akurasi naik, gerak melambat)
        if (key === 'c' && !isPaused && !isGameOver) toggleCrouch();
        // Ctrl kiri = jongkok TAHAN (lepas tombol = berdiri; C tetap toggle).
        // preventDefault meredam shortcut browser sebisanya — Ctrl+W tetap bisa
        // ditelan browser (tutup tab); perangkap andalnya Keyboard Lock di atas.
        if (e.code === 'ControlLeft') { setCrouchHold(true); e.preventDefault(); }
        // F = melee: pukul dgn popor senjata aktif (1x pukul bunuh zombie).
        // Gate stamina/cooldown/reload di dalam tryMelee.
        if (key === 'f' && !isPaused && !isGameOver) tryMelee();
        // 1/2 = slot senjata, 3 = GRANAT (equip -> klik lempar), Q = tukar antar
        // slot senjata. (Shop modal sudah dicegat di atas.)
        if ((key === '1' || key === '2' || key === '3' || key === 'q')
            && !isPaused && !isGameOver) trySwitchKey(key);
        // 4 = pegang Medkit di tangan (tekan lagi = holster); lalu TAHAN klik kiri
        // medkitUseSec detik untuk memakainya (pulihkan 70% HP; hanya bisa punya 1).
        if (key === '4' && !isPaused && !isGameOver) equipMedkit();
        if (e.code === 'Space') {
            // Restart game-over: di co-op hanya HOST (client menunggu pesan
            // `restart` dari host — layarnya menampilkan "Waiting for the host").
            if (isGameOver) { if (netRole !== 'client') resetGame(); }
            else tryJump();                    // lompat
        }
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false;
        if (e.key === 'Shift') keys.shift = false;
        if (e.code === 'ControlLeft') setCrouchHold(false);
    });
    window.addEventListener('blur', releaseInputs);   // bug fix: Alt-Tab meninggalkan tombol tertekan

    // Jaring pengaman lintas-browser: bila Keyboard Lock tak tersedia (Firefox/
    // Safari) dan Ctrl+W/Ctrl+R lolos, minta konfirmasi sebelum tab tertutup/
    // reload saat sedang bermain — mencegah kehilangan progres tak sengaja.
    // (Tidak mengganggu saat di menu / sudah game over.)
    window.addEventListener('beforeunload', (e) => {
        if (mode && !isGameOver && !isPaused) { e.preventDefault(); e.returnValue = ''; }
    });
}
