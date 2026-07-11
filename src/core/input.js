// Semua input: pointer lock, mouse look, klik tembak/ADS, keyboard gameplay,
// jaring pengaman fokus/unload, dan Keyboard Lock (perangkap Ctrl+W dkk).

import { keys, mouse, isPaused, isGameOver, setPaused, mode } from './state.js';
import { camera, viewCam } from './renderer.js';
import { blocker } from './dom.js';
import { activeScene } from './sceneManager.js';
import { resetGame } from './game.js';
import { showPauseMenu, hidePauseMenu, isPauseMenuOpen } from './pauseMenu.js';
import { openCheatConsole, closeCheatConsole, forceHideCheatConsole, isCheatConsoleOpen, handleKey } from './cheatConsole.js';
import {
    tryMelee, trySwitchKey, setAiming, equipMedkit
} from '../entities/weapons.js';
import { eyeHCur, setMoveTarget, clearMoveTarget } from '../entities/player.js';

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

// ===== Bidik top-down (pivot 2026-07-11) =====
// Pointer Lock DIPERTAHANKAN (infra pause/keyboard-lock utuh) — mouse
// menggerakkan KURSOR VIRTUAL (#aimCursor, delta movementX/Y, dijepit layar).
// Tiap frame updateTopdownAim(): kursor -> NDC -> ray viewCam -> dipotong
// bidang tanah setinggi kaki player = `aimPoint`; lalu YAW pivot `camera`
// dihadapkan ke titik itu — semua sistem lama (peluru/granat/melee/radar yang
// membaca camera.getWorldDirection) otomatis membidik ke kursor.
export const aimPoint = new THREE.Vector3(0, 0, -1);
let curX = window.innerWidth / 2, curY = window.innerHeight / 2;
let aimCursorEl = null;
const _aimV = new THREE.Vector3();

function placeAimCursor() {
    if (aimCursorEl) aimCursorEl.style.transform =
        `translate(${curX}px, ${curY}px) translate(-50%, -50%)`;
}

function showAimCursor(on) {
    if (!aimCursorEl) aimCursorEl = document.getElementById('aimCursor');
    if (aimCursorEl) aimCursorEl.style.display = on ? 'block' : 'none';
}

// Dipanggil animate() SEBELUM updateGame: segarkan aimPoint + yaw pivot.
// Memakai matrix viewCam frame sebelumnya (lag 1 frame tak terasa; startGame
// memanggil followViewCam sekali sebelum frame pertama agar matrix valid).
export function updateTopdownAim() {
    if (!viewCam || isPaused || isGameOver) return;
    const ndcX = (curX / window.innerWidth) * 2 - 1;
    const ndcY = -(curY / window.innerHeight) * 2 + 1;
    _aimV.set(ndcX, ndcY, 0.5).unproject(viewCam).sub(viewCam.position);
    const feetY = camera.position.y - eyeHCur;
    const t = (feetY - viewCam.position.y) / (_aimV.y || -1e-6);
    aimPoint.set(
        viewCam.position.x + _aimV.x * t,
        feetY,
        viewCam.position.z + _aimV.z * t);
    // Yaw pivot menghadap titik bidik: forward kamera (-Z diputar yaw) == arah bidik
    const dx = aimPoint.x - camera.position.x, dz = aimPoint.z - camera.position.z;
    if (dx * dx + dz * dz > 1e-6) camera.rotation.set(0, Math.atan2(-dx, -dz), 0);
}

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

// Lepas semua input yang sedang ditekan (dipanggil saat unlock / blur / reset).
export function releaseInputs() {
    mouse.isDown = false;
    setAiming(false);
    clearMoveTarget();  // gerak klik-kanan berhenti saat pause/blur/reset
    for (const k in keys) keys[k] = false;
    // Catatan: shop survival TIDAK ditutup di sini — ia MODAL (game di-pause,
    // pointer sengaja dilepas untuk kursor). Ditutup hanya oleh Start Next Wave
    // atau saat scene di-enter ulang (reset). Blur/unlock membiarkannya terbuka.
}

export function initInput() {
    // ----- PointerLock -----
    // Klik latar blocker = mulai/lanjut — KECUALI saat menu jeda terbuka:
    // resume hanya lewat tombol RESUME (klik-di-mana-saja dihapus 2026-07-10).
    blocker.addEventListener('click', () => { if (!isPauseMenuOpen()) requestLock(); });
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            hasStarted = true;         // game berjalan -> unlock (Esc) berikutnya = PAUSE
            hidePauseMenu();           // resume: tutup menu jeda bila sedang terbuka
            blocker.style.display = 'none';
            // Pilihan kualitas hanya di layar mulai — sembunyikan permanen
            // begitu game pertama dimulai (blocker pause tak menampilkannya).
            document.getElementById('qualityRow').style.display = 'none';
            // Kursor bidik virtual: pusatkan ulang & tampilkan selama bermain
            curX = window.innerWidth / 2;
            curY = window.innerHeight / 2;
            placeAimCursor();
            showAimCursor(true);
            setPaused(false);
        } else {
            showAimCursor(false);      // pause/shop/menu: kursor OS yang tampil
            forceHideCheatConsole();   // ESC saat konsol cheat terbuka -> tutup (menu jeda ambil alih)
            setPaused(true);
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

    // ----- Kursor bidik virtual (top-down): delta mouse menggerakkan kursor,
    // bukan memutar kamera. Arah tembak/lempar/melee mengikuti kursor. -----
    document.addEventListener('mousemove', (e) => {
        if (isPaused || isGameOver) return;
        if (document.pointerLockElement !== document.body) return;
        curX = Math.max(0, Math.min(window.innerWidth, curX + e.movementX));
        curY = Math.max(0, Math.min(window.innerHeight, curY + e.movementY));
        placeAimCursor();
    });

    // ----- Klik kiri = TEMBAK (atau tahan utk channel medkit) ke arah kursor;
    // klik kanan = BERGERAK ke titik kursor (WASD membatalkannya). (Lempar granat
    // dihapus 2026-07-11 — diganti weapon Grenade Launcher.) -----
    document.addEventListener('mousedown', (e) => {
        if (isPaused || isGameOver) return;
        if (e.button === 2) {
            // Move-to-point: simpan target di titik kursor (bidang kaki player)
            setMoveTarget(aimPoint.x, aimPoint.z);
            return;
        }
        if (e.button !== 0) return;
        mouse.isDown = true;   // tembak / tahan utk channel medkit
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
        if (keys.hasOwnProperty(key)) {
            keys[key] = true;
            // WASD MEMBATALKAN gerak klik-kanan (kontrol top-down 2026-07-11)
            if (key === 'w' || key === 'a' || key === 's' || key === 'd') clearMoveTarget();
        }
        if (e.key === 'Shift') keys.shift = true;
        // (R = reload DIHAPUS bersama sistem magazen 2026-07-11 — tiap senjata
        // kini satu kolam peluru tanpa reload.)
        // F = melee: pukul dgn popor senjata aktif ke arah kursor.
        // Gate stamina/cooldown/reload di dalam tryMelee.
        if (key === 'f' && !isPaused && !isGameOver) tryMelee();
        // 1/2 = slot senjata, 3 = GRANAT (equip -> klik lempar), Q = tukar antar
        // slot senjata. (Shop modal sudah dicegat di atas. Jongkok C/Ctrl &
        // lompat SPASI dihapus di mode top-down.)
        if ((key === '1' || key === '2' || key === '3' || key === 'q')
            && !isPaused && !isGameOver) trySwitchKey(key);
        // 4 = pegang Medkit di tangan (tekan lagi = holster); lalu TAHAN klik kiri
        // medkitUseSec detik untuk memakainya (pulihkan 70% HP; hanya bisa punya 1).
        if (key === '4' && !isPaused && !isGameOver) equipMedkit();
        if (e.code === 'Space' && isGameOver) resetGame();   // restart
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false;
        if (e.key === 'Shift') keys.shift = false;
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
