// MINIGAME HACK "ICE BREACH" (2026-07-28, permintaan user: "hacking jangan cuma
// menunggu bar progress 10 detik") — SCENE MODAL tersendiri (`hackScene`) yang
// mengambil alih layar saat player meng-hack komputer di Campaign:
//   - Stage 1: super komputer ruang server (dulu bar "DOWNLOADING DATA" 10 dtk).
//   - Stage 3: kelima terminal pembuka pintu blast (dulu bar "HACKING TERMINAL").
//
// PUZZLE: papan chip sirkuit tetap 5×5. Tiap chip punya jalur (trace) yang bisa
// DIPUTAR (klik kiri = searah jarum jam, klik kanan = berlawanan). Tugas player:
// menyambung PORT INGRESS di tepi kiri ke DATA CORE di tepi kanan menjadi satu
// rangkaian tak terputus. Papan selalu SOLVABLE — generator menggambar jalur
// acak lebih dulu, memberi tiap sel jalur bentuk yang tepat, menaburkan chip
// pengecoh di sisanya, baru mengacak semua rotasi. Ada hitung mundur "ICE TRACE";
// habis = gagal, player harus menjauh lalu mencoba lagi (tak ada hukuman lain).
//
// POLA ARSITEKTUR: modal ini meniru SHOP SCENE (transition.js) — game DI-PAUSE,
// pointer-lock DILEPAS supaya kursor OS bisa mengklik, dan `shopActive()` = true
// agar core/input.js menekan menu jeda + menelan tombol gameplay (Escape
// diteruskan ke `shopKey` = ABORT). Bedanya: selesai bermain kita TIDAK boleh
// memanggil enter() stage lagi (itu me-reset seluruh stage), jadi scene stage
// dipulihkan lewat `resumeScene()` (sceneManager) yang hanya mengembalikan
// activeScene tanpa lifecycle.
//
// Seluruh teks UI English (aturan permanen); komentar Indonesia.

import { CFG } from '../../../core/config.js';
import { setPaused, isPaused, isGameOver, keys } from '../../../core/state.js';
import { activeScene, setScene, resumeScene } from '../../../core/sceneManager.js';
import { requestLock } from '../../../core/input.js';
import { blocker } from '../../../core/dom.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { playSFX, sfxSwitch, sfxPurchase, sfxEmpty, sfxRobotSpawn } from '../../../utils/sfx.js';
import { stage1Scene } from '../stages/stage1/index.js';   // hanya utk restartScene (circular aman: dipakai DI DALAM fungsi)

// Arah: 0=N (atas), 1=E (kanan), 2=S (bawah), 3=W (kiri); bit = 1<<d.
// Memutar chip 90° searah jarum jam = geser bit ke kiri 1 (N->E->S->W->N).
const DC = [0, 1, 0, -1], DR = [-1, 0, 1, 0];
const rotM = (m, r) => ((m << r) | (m >> (4 - r))) & 15;
const opp = (d) => (d + 2) & 3;

const FINISH_MS = 850;    // jeda banner ACCESS GRANTED sebelum kembali ke game
const ALARM_MS = 1150;    // banner ALARM (gagal) ditahan sedikit lebih lama
const LOCK_FALLBACK_MS = 900;

// --- state modul (satu papan aktif; modal tak pernah bertumpuk) ---
let open = false;
let phase = 'idle';       // idle | play | won | lost
let N = 5;
let tiles = [];           // [{mask, rot, sol, spin}] — sol = mask BENAR (null utk chip pengecoh),
                          // spin = penghitung putaran KUMULATIF (visual: 3->0 tetap berputar maju)
let powerOn = [];         // hasil BFS daya terakhir (per sel)
let solved = false;
let moves = 0;
let traceLeft = 0, traceMax = 0;
let cb = null;            // {onSuccess, onFail}
let prevScene = null;     // scene stage yang harus dipulihkan
let pendingOpts = null;
let tickTimer = 0, finishTimer = 0;
let headText = '', subText = '';
// Referensi DOM (dibangun ulang tiap kali modal dibuka — papan kecil, murah)
let tileEls = [], gridEl = null, coreEl = null, bannerEl = null;
let ingressLeadEl = null, coreLeadEl = null;
let traceFillEl = null, traceNumEl = null;

const overlayEl = () => document.getElementById('hackOverlay');
const idx = (c, r) => r * N + c;

// ===================== MODEL PUZZLE =====================

// Jalur acak (DFS teracak, tanpa mengulang sel) dari sel kiri-tengah ke sel
// kanan-tengah. Selalu ketemu di grid persegi, jadi papan PASTI bisa dipecahkan.
function randomPath(size, sc, sr, tc, tr) {
    const seen = new Array(size * size).fill(false);
    const path = [];
    const walk = (c, r) => {
        seen[r * size + c] = true;
        path.push([c, r]);
        if (c === tc && r === tr) return true;
        const dirs = [0, 1, 2, 3];
        for (let i = dirs.length - 1; i > 0; i--) {   // acak urutan arah
            const j = (Math.random() * (i + 1)) | 0;
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        for (const d of dirs) {
            const nc = c + DC[d], nr = r + DR[d];
            if (nc < 0 || nr < 0 || nc >= size || nr >= size) continue;
            if (seen[nr * size + nc]) continue;
            if (walk(nc, nr)) return true;
        }
        path.pop();
        return false;
    };
    walk(sc, sr);
    return path;
}

// Bangun papan: jalur solusi + chip pengecoh + acak rotasi (dijamin BELUM
// terpecahkan saat dibuka).
function buildPuzzle(size) {
    N = size;
    const mid = (N - 1) >> 1;
    const path = randomPath(N, 0, mid, N - 1, mid);
    const sol = new Array(N * N).fill(0);
    for (let k = 0; k < path.length; k++) {
        const [c, r] = path[k];
        let m = 0;
        if (k === 0) m |= 1 << 3;                     // mulut PORT di tepi kiri
        else {
            const [pc, pr] = path[k - 1];
            m |= 1 << (pc > c ? 1 : pc < c ? 3 : pr > r ? 2 : 0);
        }
        if (k === path.length - 1) m |= 1 << 1;       // mulut DATA CORE di tepi kanan
        else {
            const [nc, nr] = path[k + 1];
            m |= 1 << (nc > c ? 1 : nc < c ? 3 : nr > r ? 2 : 0);
        }
        sol[idx(c, r)] = m;
    }
    // Chip pengecoh: siku / lurus / T / buntu (tak pernah salib — salib tak
    // pernah dibutuhkan & membuat papan terbaca "sudah benar").
    const DECOY = [3, 5, 7, 1];
    const chance = CFG.campaign.hack.decoyChance;
    tiles = new Array(N * N);
    for (let i = 0; i < N * N; i++) {
        if (sol[i]) tiles[i] = { mask: sol[i], rot: 0, sol: sol[i], spin: 0 };
        else if (Math.random() < chance) {
            const m = DECOY[(Math.random() * DECOY.length) | 0];
            tiles[i] = { mask: rotM(m, (Math.random() * 4) | 0), rot: 0, sol: null, spin: 0 };
        } else tiles[i] = { mask: 0, rot: 0, sol: null, spin: 0 };   // chip mati (dekor, tak bisa diklik)
    }
    // Acak rotasi: chip jalur WAJIB mulai salah (player harus menyentuh semuanya);
    // pengecoh bebas. Chip lurus hanya punya 2 orientasi berbeda — (rot+1..3)
    // menjamin efeknya benar-benar berbeda dari solusi.
    for (const t of tiles) {
        if (!t.mask) continue;
        if (t.sol) {
            let r = 1 + ((Math.random() * 3) | 0);
            while (rotM(t.mask, r) === t.sol) r = (r + 1) & 3;
            t.rot = r;
        } else t.rot = (Math.random() * 4) | 0;
        t.spin = t.rot;
    }
    computePower();
}

const eff = (i) => rotM(tiles[i].mask, tiles[i].rot);

// Aliran daya: BFS dari PORT (sel kiri-tengah, harus punya mulut W) menyusuri
// sambungan yang SALING bertemu. `solved` = DATA CORE (sel kanan-tengah) ikut
// menyala DAN mulut E-nya terbuka.
function computePower() {
    const mid = (N - 1) >> 1;
    powerOn = new Array(N * N).fill(false);
    solved = false;
    const start = idx(0, mid);
    if (!(eff(start) & (1 << 3))) return;
    const stack = [start];
    powerOn[start] = true;
    while (stack.length) {
        const i = stack.pop();
        const c = i % N, r = (i / N) | 0, m = eff(i);
        for (let d = 0; d < 4; d++) {
            if (!(m & (1 << d))) continue;
            const nc = c + DC[d], nr = r + DR[d];
            if (nc < 0 || nr < 0 || nc >= N || nr >= N) continue;
            const ni = idx(nc, nr);
            if (powerOn[ni] || !(eff(ni) & (1 << opp(d)))) continue;
            powerOn[ni] = true;
            stack.push(ni);
        }
    }
    const goal = idx(N - 1, mid);
    solved = powerOn[goal] && !!(eff(goal) & (1 << 1));
}

// Semua terminal membaca satu ukuran papan tetap dari config. Parameter `step`
// dipertahankan hanya agar pemanggil lama tetap kompatibel.
export function hackGridSize(_step = 0) {
    return CFG.campaign.hack.gridSize;
}

// ===================== TAMPILAN =====================

// Trace satu chip di viewBox 100×100: garis dari pusat ke tiap mulut + simpul.
function tileSVG(mask) {
    if (!mask) return '<svg viewBox="0 0 100 100"><rect class="dead" x="34" y="34" width="32" height="32" rx="6"/></svg>';
    let d = '';
    if (mask & 1) d += 'M50 50 L50 0 ';
    if (mask & 2) d += 'M50 50 L100 50 ';
    if (mask & 4) d += 'M50 50 L50 100 ';
    if (mask & 8) d += 'M50 50 L0 50 ';
    return '<svg viewBox="0 0 100 100">'
        + `<path class="pipe" d="${d}"/><path class="core" d="${d}"/>`
        + '<circle class="node" cx="50" cy="50" r="11"/></svg>';
}

function render() {
    const root = overlayEl();
    if (!root) return;
    root.innerHTML =
        '<div class="hackPanel">'
        + '<div class="hackGlow"></div>'
        + '<div class="hackHead"><span class="hackTag">ICE BREACH</span>'
        + `<span class="hackTitle">${headText}</span></div>`
        + `<div class="hackSub">${subText}</div>`
        + '<div class="hackBody">'
        + '<div class="hackPort on"><div class="hackJack"></div>'
        + '<div class="hackLead hackLeadIn" id="hackIngressLead"></div><span>INGRESS</span></div>'
        + '<div class="hackGrid" id="hackGrid"></div>'
        + '<div class="hackCore" id="hackCore"><div class="hackJack"></div>'
        + '<div class="hackLead hackLeadOut" id="hackCoreLead"></div><span>DATA CORE</span></div>'
        + '</div>'
        + '<div class="hackFoot">'
        + '<div class="hackTrace"><span class="hackTraceLbl">ICE TRACE</span>'
        + '<span class="hackTraceShell"><span class="hackTraceFill" id="hackTraceFill"></span></span>'
        + '<span class="hackTraceNum" id="hackTraceNum"></span></div>'
        + '<div class="hackHint">Left-click a chip to rotate it · right-click rotates back</div>'
        + '<button class="hackAbort" id="hackAbort">ABORT ▸ ESC</button>'
        + '</div>'
        + '<div class="hackBanner" id="hackBanner"></div>'
        + '</div>';
    gridEl = document.getElementById('hackGrid');
    coreEl = document.getElementById('hackCore');
    ingressLeadEl = document.getElementById('hackIngressLead');
    coreLeadEl = document.getElementById('hackCoreLead');
    bannerEl = document.getElementById('hackBanner');
    traceFillEl = document.getElementById('hackTraceFill');
    traceNumEl = document.getElementById('hackTraceNum');
    const abortBtn = document.getElementById('hackAbort');
    if (abortBtn) abortBtn.addEventListener('click', () => finish('abort'));
    if (gridEl) {
        gridEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
        // Klik-kanan di papan = putar balik (dan JANGAN memunculkan menu browser)
        gridEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    tileEls = [];
    for (let i = 0; i < tiles.length; i++) {
        const cell = document.createElement('div');
        cell.className = 'hackTile' + (tiles[i].mask ? '' : ' dead');
        const chip = document.createElement('div');
        chip.className = 'hackChip';
        chip.innerHTML = tileSVG(tiles[i].mask);
        cell.appendChild(chip);
        if (tiles[i].mask) {
            const k = i;
            cell.addEventListener('click', () => hackRotate(k, 1));
            cell.addEventListener('contextmenu', (e) => { e.preventDefault(); hackRotate(k, -1); });
        }
        if (gridEl) gridEl.appendChild(cell);
        tileEls.push({ cell, chip });
    }
    root.style.display = 'flex';
    paint();
}

function paint() {
    for (let i = 0; i < tileEls.length; i++) {
        const t = tileEls[i];
        if (!t) continue;
        t.chip.style.transform = `rotate(${tiles[i].spin * 90}deg)`;
        if (t.cell.classList) t.cell.classList.toggle('on', !!powerOn[i]);
    }
    if (coreEl && coreEl.classList) coreEl.classList.toggle('on', solved);
    if (ingressLeadEl) ingressLeadEl.dataset.powered = 'true';
    if (coreLeadEl) coreLeadEl.dataset.powered = solved ? 'true' : 'false';
    paintTrace();
}

function paintTrace() {
    const k = traceMax > 0 ? Math.max(0, traceLeft / traceMax) : 0;
    if (traceFillEl) {
        traceFillEl.style.width = (k * 100).toFixed(1) + '%';
        if (traceFillEl.classList) traceFillEl.classList.toggle('warn', k < 0.25);
    }
    if (traceNumEl) traceNumEl.innerText = Math.ceil(Math.max(0, traceLeft)) + 's';
}

function banner(text, cls) {
    if (!bannerEl) return;
    bannerEl.innerText = text;
    if (bannerEl.classList) bannerEl.classList.add('on', cls);
}

// ===================== AKSI =====================

// Putar chip `i` (dir +1 = searah jarum jam, -1 = berlawanan). Dipakai handler
// klik DAN smoke test.
export function hackRotate(i, dir = 1) {
    if (!open || phase !== 'play') return false;
    const t = tiles[i];
    if (!t || !t.mask) return false;
    t.rot = (t.rot + (dir < 0 ? 3 : 1)) & 3;
    t.spin += dir < 0 ? -1 : 1;   // visual: selalu berputar ke arah klik (tak pernah 'mundur' 270°)
    moves++;
    computePower();
    paint();
    playSFX(sfxSwitch);
    if (solved) win();
    return true;
}

function win() {
    phase = 'won';
    stopTick();
    playSFX(sfxPurchase);
    banner('ACCESS GRANTED', 'ok');
    finishTimer = setTimeout(() => finish('ok'), FINISH_MS);
}

// ICE TRACE habis: banner ALARM (permintaan user 2026-07-28) lalu modal ditutup
// — stage-lah yang melepas horde alarm + cooldown lewat `onFail('fail')`.
function lose() {
    phase = 'lost';
    stopTick();
    playSFX(sfxEmpty);
    playSFX(sfxRobotSpawn, 0.9);   // dengung alarm = suara robot dilepas (aset yang sudah ada)
    banner('ALARM TRIGGERED — LOCKED OUT', 'bad');
    finishTimer = setTimeout(() => finish('fail'), ALARM_MS);
}

// Hitung mundur ICE TRACE. Loop game sedang PAUSE, jadi waktunya datang dari
// setInterval sendiri (bukan dt frame); diekspor supaya smoke bisa memajukannya.
export function hackTick(dt) {
    if (!open || phase !== 'play') return;
    traceLeft -= dt;
    if (traceLeft <= 0) { traceLeft = 0; paintTrace(); lose(); return; }
    paintTrace();
}

function startTick() {
    stopTick();
    tickTimer = setInterval(() => hackTick(0.1), 100);
}
function stopTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = 0;
}

// Tutup modal, kembalikan scene stage (TANPA enter()), jalankan callback, lalu
// minta pointer-lock lagi supaya player langsung main.
function finish(result) {
    if (!open) return;
    open = false;
    phase = 'idle';
    stopTick();
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = 0; }
    const root = overlayEl();
    if (root) { root.style.display = 'none'; root.innerHTML = ''; }
    tileEls = []; gridEl = coreEl = bannerEl = traceFillEl = traceNumEl = null;
    ingressLeadEl = coreLeadEl = null;
    const c = cb; cb = null;
    if (prevScene) resumeScene(prevScene);
    prevScene = null;
    if (result === 'ok') { if (c && c.onSuccess) c.onSuccess(); }
    else if (c && c.onFail) c.onFail(result);
    resumePlay();
}

function resumePlay() {
    requestLock();
    // Jaring pengaman: bila browser menolak pointer-lock (cooldown Esc), game
    // akan tertinggal dalam keadaan pause TANPA layar apa pun — munculkan
    // blocker "klik untuk lanjut" seperti jalur resume normal.
    setTimeout(() => {
        if (open || isGameOver || !isPaused) return;
        if (typeof document.pointerLockElement !== 'undefined'
            && document.pointerLockElement === document.body) return;
        if (blocker) blocker.style.display = 'flex';
    }, LOCK_FALLBACK_MS);
}

// Dipanggil stage saat player menempel terminal. opts:
//   head/sub  : judul & instruksi (English)
//   onSuccess : puzzle terpecahkan
//   onFail    : 'abort' (player membatalkan) atau 'fail' (ICE TRACE habis)
export function beginHackMinigame(opts = {}) {
    if (open) return false;
    pendingOpts = opts;
    // Scene stage yang sedang aktif dititipkan SEBELUM setScene (setScene sudah
    // menimpa activeScene saat enter() berjalan) — dipulihkan di finish().
    hackScene.prev = activeScene;
    clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;   // lepas tombol tahan (tak drift saat kembali)
    setScene(hackScene, {});
    return true;
}

export const isHackOpen = () => open;

// Debug/uji: keadaan papan + solusi tiap chip (smoke memutar sampai `ok`).
export const hackDebug = () => ({
    open, phase, size: N, moves, solved,
    traceLeft, traceMax,
    externalLinks: {
        row: (N - 1) >> 1,
        ingressToLeftTile: !!ingressLeadEl,
        rightTileToCore: !!coreLeadEl,
        ingressPowered: !!ingressLeadEl,
        corePowered: !!coreLeadEl && solved,
    },
    tiles: tiles.map((t, i) => ({
        i, mask: t.mask, rot: t.rot, path: t.sol !== null,
        ok: t.sol === null ? true : rotM(t.mask, t.rot) === t.sol,
        on: !!powerOn[i],
    })),
});

// ===================== SCENE =====================
// Semua hook gameplay = no-op/aman: modal ini bisa dipasang DI TENGAH frame
// (dipanggil dari updateMode stage), jadi sisa updateGame frame itu masih
// memakai hook di sini sebelum setPaused menghentikan frame berikutnya.
// `groundHeight` mengembalikan feetY apa adanya — mengembalikan 0 akan membuat
// player "jatuh" satu frame di lantai atas.
export const hackScene = {
    id: 'campaign-hack',

    enter() {
        const o = pendingOpts || {};
        pendingOpts = null;
        prevScene = hackScene.prev || null;   // dititipkan beginHackMinigame
        cb = { onSuccess: o.onSuccess, onFail: o.onFail };
        headText = o.head || 'TERMINAL';
        subText = o.sub || 'Connect the ingress port to the data core.';
        moves = 0;
        traceMax = traceLeft = CFG.campaign.hack.traceSec;
        // Abaikan `opts.size` dari caller lama: semua terminal wajib 5x5.
        buildPuzzle(hackGridSize());
        open = true;
        phase = 'play';
        setPaused(true);
        render();
        // Pointer dilepas agar kursor OS bisa mengklik chip. input.js melihat
        // shopActive() = true -> tak memunculkan menu jeda.
        document.exitPointerLock();
        startTick();
    },

    // Mati mustahil di modal (game di-pause), tapi hook ini WAJIB ada: pulihkan
    // stage tempat hack dimulai, atau stage 1 bila entah bagaimana tak ada.
    restartScene: () => hackScene.prev || stage1Scene,
    shopActive: () => true,
    shopKey(key) {
        if (key === 'escape' && phase === 'play') { finish('abort'); return true; }
        return true;   // telan tombol gameplay lain selama modal terbuka
    },
    playerCollide() { },
    groundHeight: (x, z, feetY) => feetY,
    bulletBlocked: () => false,
    blastBlocked: () => false,
    grenadeCollide() { },
    robotAI: () => ({ skip: true }),
    clampRobot() { },
    clampDropPos: (x, z) => [x, z],
    hudStatus: () => 'BREACHING TERMINAL',
    radarLandmarks() { },
    prev: null,   // scene stage yang dipulihkan saat modal ditutup
};
