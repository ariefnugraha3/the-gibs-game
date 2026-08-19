// MINIGAME PERBAIKAN GENERATOR "FIELD REPAIR" (2026-07-29, permintaan user:
// "menyalakan generator jangan cuma bar progress 10 detik") — SCENE MODAL
// tersendiri (`repairScene`) yang mengambil alih layar saat player memasang
// KETIGA komponen generator di Campaign Stage 2.
//
// Stage 5-6 memakai daftar papan LAIN (ADVANCED_REPAIR_PARTS di bawah):
// PHASE SYNC lalu ROTOR KICKSTART.
//
// TIGA papan, SATU per komponen yang tadi dikumpulkan player di gudang
// (REPAIR_PARTS — stage2 memakai daftar yang sama untuk menamai tiap komponen
// saat dipungut), dimainkan BERURUTAN dalam satu modal:
//   1. POWER HARNESS  -> 'wires'  : sambungkan tiap kabel feed ke bus TERMINAL
//                                   BERWARNA SAMA (urutan bus diacak).
//   2. CONTROL BOARD  -> 'chips'  : pasang tiap chip ke soket yang UKURANNYA
//                                   persis sama.
//   3. COOLANT PUMP   -> 'valves' : putar tiap katup ke takik targetnya. Katup
//                                   BERGIGI: memutar katup ke-i ikut memutar
//                                   SEMUA katup di KANANNYA.
//
// TANPA HITUNG MUNDUR (beda dari ICE BREACH / hackMinigame.js — permintaan
// user): tak ada cara kalah, hanya ABORT (ESC). Stage menyimpan berapa komponen
// yang sudah terpasang (`onProgress`), jadi membatalkan tidak menghapus kemajuan.
//
// SEMUA PAPAN DIJAMIN BISA DISELESAIKAN (permintaan user, ditegakkan smoke):
//   - wires : pasangan warna kiri->kanan = permutasi bijektif; sambungan salah
//             warna DITOLAK, jadi papan tak pernah masuk keadaan buntu.
//   - chips : ukuran chip diambil dari kolam pasangan (w,h) yang SEMUANYA beda,
//             jadi tiap chip cocok tepat ke satu soket.
//   - valves: matriks gigi bersifat SEGITIGA (katup i hanya memengaruhi i..n-1),
//             jadi solusinya TUNGGAL dan selalu ada — diselesaikan dari KIRI ke
//             KANAN tanpa pernah merusak katup yang sudah benar.
//
// AKSESIBILITAS: tombol COLOR MODE (kabel) menukar palet warna biasa dengan
// palet AMAN BUTA WARNA (Okabe-Ito) + LAMBANG bentuk di tiap ujung kabel,
// sehingga warna tak lagi jadi satu-satunya pembeda. Pilihan disimpan di
// localStorage ('gibsRepairColorblind').
//
// POLA ARSITEKTUR = sama persis dengan hackMinigame.js: game DI-PAUSE, pointer
// lock dilepas supaya kursor OS bisa mengklik, `shopActive()` = true agar
// core/input.js menekan menu jeda & menelan tombol gameplay, dan saat selesai
// scene stage dipulihkan lewat `resumeScene()` (BUKAN enter(), yang akan
// me-reset seluruh stage).
//
// Seluruh teks UI English (aturan permanen); komentar Indonesia.

import { CFG } from '../../../core/config.js';
import { setPaused, isPaused, isGameOver, keys, difficulty } from '../../../core/state.js';
import { activeScene, setScene, resumeScene } from '../../../core/sceneManager.js';
import { requestLock } from '../../../core/input.js';
import { blocker } from '../../../core/dom.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { playSFX, sfxSwitch, sfxPurchase, sfxEmpty, sfxPickup, sfxHeli } from '../../../utils/sfx.js';
import { stage1Scene } from '../stages/stage1/index.js';   // hanya utk restartScene (circular aman: dipakai DI DALAM fungsi)

const STEP_MS = 700;      // jeda banner "COMPONENT k/n INSTALLED" antar papan
const FINISH_MS = 850;    // jeda banner GENERATOR ONLINE sebelum kembali ke game
const BAD_MS = 260;       // kedip merah saat pemasangan ditolak
const LOCK_FALLBACK_MS = 900;

// KETIGA komponen generator Stage 2. `label` juga dipakai stage2 untuk pesan
// "…recovered" saat komponen dipungut, jadi benda dan papannya sepasang.
export const REPAIR_PARTS = [
    {
        id: 'harness', label: 'POWER HARNESS', type: 'wires',
        sub: 'Splice every feed line to the bus terminal of the SAME colour. '
            + 'DRAG one end onto the other, or click one end then the other. '
            + 'Click a spliced line again to pull it.',
        hint: 'Drag or click — a mismatched splice is rejected, colours must run end to end',
    },
    {
        id: 'board', label: 'CONTROL BOARD', type: 'chips',
        sub: 'Seat every logic chip in the socket it FITS. DRAG a chip into its socket, '
            + 'or click the chip then the socket. Drag a seated chip back to the tray '
            + '(or click it) to lift it out.',
        hint: 'Drag or click — a chip only drops into a socket of exactly its size',
    },
    {
        id: 'pump', label: 'COOLANT PUMP', type: 'valves',
        sub: 'Turn every valve to its marked notch. The valves are GEARED: turning one '
            + 'also turns every valve to its RIGHT. Left-click turns up, right-click turns down.',
        hint: 'Geared to the right — so set them one at a time, left to right',
    },
];

// Dua pekerjaan mekanis khusus generator Stage 5-6. Sengaja berbeda dari
// kabel, chip, dan katup Stage 2 — dan berbeda satu sama lain: papan pertama
// MENYELARASKAN (geser tuas tiap fasa sampai gelombangnya berimpit dengan bus,
// melawan kopling antar tuas), papan kedua BERTINDAK (putar roda gila lalu
// nyalakan mesin di dalam jendela RPM yang menyusut). Keduanya dibaca dari
// GAMBAR, bukan dari teks: itulah alasan papan diagnosis sebelumnya dibuang.
export const ADVANCED_REPAIR_PARTS = [
    {
        id: 'sync', label: 'PHASE SYNC', type: 'sync',
        sub: 'The generator cannot couple to the grid until every phase runs with the bus. '
            + 'Slide each phase trim until its wave lies on the bus reference and the whole '
            + 'scope collapses into one steady line. The phases load each other, so moving '
            + 'one nudges the rest - come back and trim again.',
        hint: 'Drag a slider (or click its track) - every lamp green and the turbine spins up',
    },
    {
        id: 'kickstart', label: 'ROTOR KICKSTART', type: 'kickstart',
        sub: 'Crank the flywheel clockwise, fire ignition inside the green RPM band, then close the master breaker.',
        hint: 'The flywheel bleeds speed - reach the green band, then hit ignition promptly',
    },
];

// Palet kabel. `std` = warna biasa; `cb` = Okabe-Ito (aman untuk semua jenis
// buta warna) dan dipasangkan dengan LAMBANG bentuk supaya tetap terbaca
// walaupun warnanya tak terbedakan sama sekali.
const WIRE_COL = {
    std: ['#e04a3a', '#3f80e0', '#3fb95e', '#e8c33c', '#a45fd0'],
    cb: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#cc79a7'],
};
const WIRE_GLYPH = ['●', '▲', '■', '◆', '★'];   // ● ▲ ■ ◆ ★
const BUS_LABEL = ['A', 'B', 'C', 'D', 'E'];

// Kolam ukuran chip (satuan sel papan). SEMUA pasangan berbeda sebagai himpunan
// tak-berurut, jadi tiap chip hanya muat di satu soket → papan selalu solvable.
const CHIP_POOL = [[2, 2], [3, 2], [2, 4], [4, 3], [3, 3], [5, 2], [4, 4], [5, 3]];

// --- state modul (satu modal aktif; modal tak pernah bertumpuk) ---
let open = false;
let phase = 'idle';       // idle | play | step | won
let parts = [];           // daftar REPAIR_PARTS yang dimainkan sesi ini
let gi = 0;               // indeks papan yang sedang dimainkan
let done = 0;             // jumlah komponen terpasang sesi ini (termasuk startIndex)
let G = null;             // state papan aktif
let cb = null;            // {onSuccess, onFail, onProgress}
let prevScene = null;     // scene stage yang harus dipulihkan
let pendingOpts = null;
let stepTimer = 0, badTimer = 0;
let headText = '';
let cbMode = false;       // mode warna aman buta warna
// Referensi DOM (dibangun ulang tiap papan — papan kecil, murah)
let boardEl = null, bannerEl = null, subEl = null, stepEl = null, cbBtn = null, hintEl = null;
let wireLinesEl = null;   // kotak SVG kabel (dilukis ulang tiap gerak seret)
// SERET (drag & drop). `drag` = {kind:'wire'|'chip', side, i, x, y, cx, cy, moved, done};
// listener mousemove/mouseup dipasang SEKALI di document (tak perlu dicabut —
// semuanya no-op saat `drag` null), ghost = chip bayangan yang mengikuti kursor.
let drag = null, dragEl = null, ghostEl = null, docWired = false;
let rotorDrag = null;
// Referensi elemen papan ROTOR: tick peluruhan mengecat ulang jarum/roda saja,
// bukan membangun ulang seluruh papan 20x per detik.
let rotorTimer = 0, rotorWrapEl = null, rotorFaceEl = null, rotorNeedleEl = null;
let rotorRpmEl = null, rotorStateEl = null, rotorIgnEl = null, rotorCrankEl = null;
const ROTOR_TICK_MS = 50;
// Papan PHASE SYNC: gelombang bergulir sendiri, jadi ia punya tick sendiri
// dengan alasan yang sama seperti roda gila — loop game di-pause selagi modal
// terbuka. `syncDrag` = tuas yang sedang diseret (dipegang terpisah dari
// `drag`, yang milik kabel/chip).
let syncTimer = 0, syncScopeEl = null, syncNoteEl = null, syncRowEls = [], syncDrag = null;
const SYNC_TICK_MS = 50;
const DRAG_SLOP = 5;      // px sebelum gerakan dianggap seret (di bawah ini = klik biasa)

const overlayEl = () => document.getElementById('repairOverlay');
const CB_KEY = 'gibsRepairColorblind';

// ===================== MODEL PUZZLE (murni, tanpa DOM) =====================

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const mod = (v, m) => ((v % m) + m) % m;

// Jumlah elemen papan menurut difficulty (3 easy / 4 normal / 5 hard, config-driven).
export function repairCount(diff = difficulty) {
    const R = CFG.campaign.repair;
    return R.count[diff] != null ? R.count[diff] : R.count.normal;
}

// KABEL: kiri i (warna i) harus tersambung ke kanan j dengan `right[j] === i`.
// n dijepit ke jumlah warna yang tersedia — dua kabel berwarna sama akan
// merusak "satu warna = satu pasangan" (dan pemainnya tak bisa membedakan).
function buildWires(count) {
    const n = Math.max(2, Math.min(WIRE_COL.std.length, count));
    const right = shuffle([...Array(n).keys()]);
    // Hindari permutasi identitas (semua kabel sejajar = tak ada yang perlu dicari).
    for (let t = 0; t < 20 && right.every((v, i) => v === i); t++) shuffle(right);
    return { type: 'wires', n, right, links: new Array(n).fill(-1), sel: null, bad: null };
}

// CHIP: n ukuran berbeda; urutan baki & urutan soket diacak terpisah. n dijepit
// ke isi kolam ukuran (dua chip berukuran sama = pasangan tak lagi tunggal).
function buildChips(count) {
    const n = Math.max(2, Math.min(CHIP_POOL.length, count));
    const sizes = shuffle(CHIP_POOL.map(s => s.slice())).slice(0, n);
    const chips = shuffle(sizes.map(s => s.slice())).map(([w, h]) => ({ w, h, at: -1 }));
    const sockets = shuffle(sizes.map(s => s.slice())).map(([w, h]) => ({ w, h, fill: -1 }));
    return { type: 'chips', n, chips, sockets, sel: -1, bad: null };
}

// KATUP: target acak; posisi awal = target yang "dirusak" beberapa putaran
// (matriks gigi segitiga → keadaan apa pun tetap bisa dikembalikan).
function buildValves(count, steps) {
    const n = Math.max(2, count);
    const target = Array.from({ length: n }, () => (Math.random() * steps) | 0);
    const pos = target.slice();
    const press = (i, amt) => { for (let j = i; j < n; j++) pos[j] = mod(pos[j] + amt, steps); };
    for (let k = 0; k < n + 2; k++) press((Math.random() * n) | 0, 1 + ((Math.random() * (steps - 1)) | 0));
    if (pos.every((v, i) => v === target[i])) press(0, 1);   // jangan terbuka dalam keadaan selesai
    return { type: 'valves', n, steps, pos, target, bad: null };
}

//// --- PHASE SYNCHRONIZATION: SINKRONISASI GELOMBANG (2026-08-19) ------------
// Papan pertama generator Stage 5-6, permintaan user. Menggantikan FAULT
// ISOLATION ("terlalu rumit"), yang menggantikan START INTERLOCK, yang
// menggantikan FUSE LOADOUT. Tiga papan mati, tiga pelajaran, dan yang terakhir
// adalah yang paling penting:
//
//   FUSE LOADOUT    : jawabannya konstan -> hafalan.
//   START INTERLOCK : semua informasi tercetak dan salah klik gratis, jadi
//                     brute force JUSTRU strategi tercepat.
//   FAULT ISOLATION : puzzlenya bagus tapi harus DIBACA dulu — pohon, meter,
//                     probe, PAR. Ini papan perbaikan generator di tengah
//                     stage tempur, bukan teka-teki logika: yang dibutuhkan
//                     adalah sesuatu yang langsung DIPAHAMI dari melihatnya.
//
// Karena itu papan ini TIDAK punya informasi tersembunyi sama sekali dan tidak
// butuh dibaca: sebuah osiloskop menampilkan gelombang tiap fasa terhadap
// gelombang acuan bus. Yang melenceng terlihat melenceng. Player menggeser satu
// tuas per fasa sampai semua gelombang berimpit jadi SATU garis stabil, lalu
// papan selesai sendiri dengan deru turbin.
//
// SATU-SATUNYA tantangannya adalah KOPLING: menggeser satu tuas ikut menggeser
// tuas lain sedikit (`syncCoupling`) — persis generator sungguhan yang saling
// membebani. Tak ada hitung mundur, tak ada cara kalah (aturan user
// 2026-07-29): salah geser hanya perlu digeser lagi.
//
// SELALU SOLVABLE, DAN INI DIBUKTIKAN BUKAN DIHARAPKAN. Menyetel tuas i tepat
// ke sasarannya lalu lanjut ke tuas berikutnya adalah iterasi Gauss-Seidel pada
// matriks berdiagonal satu dengan elemen luar `c`. Ia menyatu (converge) bila
// matriksnya dominan diagonal ketat, yaitu `(n-1)*|c| < 1`. `buildSync` MENJEPIT
// koplingnya tepat di bawah batas itu (`SYNC_COUPLING_SAFETY`), jadi berapa pun
// nilai config yang diketik user, prosedur "setel satu per satu, ulangi"
// dijamin mendarat — smoke menjalankan prosedur itu di ratusan papan.
const SYNC_NAMES = ['PHASE R', 'PHASE S', 'PHASE T', 'PHASE N'];
// Batas keamanan kopling: 0.9 dari ambang dominan-diagonal, supaya penyatuannya
// tak cuma terjamin secara matematis tapi juga CEPAT (tiap sapuan memangkas
// galat sisa setidaknya 10%).
const SYNC_COUPLING_SAFETY = 0.9;

// Jumlah fasa menurut difficulty (user: "3 atau 4 slider").
export function syncCount(diff = difficulty) {
    const S = CFG.campaign.repair.advanced.syncPhases;
    if (!S) return 3;
    return S[diff] != null ? S[diff] : S.normal;
}
export function syncTolerance() {
    return CFG.campaign.repair.advanced.syncTolerance || 0.05;
}
// Kopling efektif = nilai config, DIJEPIT di bawah ambang dominan diagonal.
export function syncCoupling(n) {
    const raw = Math.abs(CFG.campaign.repair.advanced.syncCoupling || 0);
    const cap = SYNC_COUPLING_SAFETY / Math.max(1, n - 1);
    return Math.min(raw, cap);
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function buildSync(count) {
    const n = Math.max(2, Math.min(SYNC_NAMES.length, count | 0));
    const tol = syncTolerance();
    const target = [], v = [];
    for (let i = 0; i < n; i++) {
        // Sasaran dijauhkan dari kedua ujung track supaya kopling tak pernah
        // mendorong jawabannya keluar rentang tuas.
        target.push(0.22 + Math.random() * 0.56);
        v.push(0);
    }
    for (let i = 0; i < n; i++) {
        // Mulai jelas MELENCENG: minimal empat kali toleransi dari sasaran,
        // jadi papan tak pernah terbuka dalam keadaan (hampir) selesai.
        let x;
        do { x = 0.05 + Math.random() * 0.9; } while (Math.abs(x - target[i]) < tol * 4);
        v[i] = x;
    }
    return {
        type: 'sync', n, target, v, coupling: syncCoupling(n), tol,
        names: SYNC_NAMES.slice(0, n),
        // Fasa acak per kanal: pada frame pertama gelombangnya terlihat kacau,
        // bukan tumpukan rapi yang kebetulan sudah sejajar.
        seed: Array.from({ length: n }, () => Math.random() * Math.PI * 2),
        t: 0, last: -1, moves: 0,
    };
}

// Selisih tuas i terhadap sasarannya. Inilah SATU-SATUNYA besaran papan ini —
// frekuensi, amplitudo, warna lampu dan bentuk gelombang semuanya turunan
// darinya, jadi tampilan tak mungkin berbohong tentang keadaan model.
export const syncError = (g, i) => g.v[i] - g.target[i];
export const syncLocked = (g, i) => Math.abs(syncError(g, i)) <= g.tol;
export const syncAligned = g => g.v.every((_, i) => syncLocked(g, i));

// Pembacaan panel. Keduanya mendarat TEPAT di nilai bus saat tuas pas, jadi
// angka dan gelombang selalu sepakat.
export function syncHz(g, i) {
    const A = CFG.campaign.repair.advanced;
    return (A.syncBusHz || 50) + syncError(g, i) * (A.syncHzSpan || 6);
}
export function syncAmp(g, i) {
    return 1 - Math.min(1, Math.abs(syncError(g, i)) * 1.35);
}

// Menggeser tuas `i` ke `value`. Tuas LAIN ikut bergeser sebagian kecil searah
// gerakan ini — satu-satunya kesulitan papan, dan kenapa "geser sekali lalu
// lupakan" tak cukup.
export function applySyncSet(g, i, value) {
    if (!g || g.type !== 'sync' || i < 0 || i >= g.n || !Number.isFinite(value)) return 'none';
    const next = clamp01(value);
    const delta = next - g.v[i];
    if (Math.abs(delta) < 1e-6) return 'none';
    g.v[i] = next;
    for (let j = 0; j < g.n; j++) if (j !== i) g.v[j] = clamp01(g.v[j] + delta * g.coupling);
    g.last = i; g.moves++;
    return syncLocked(g, i) ? 'link' : 'select';
}

// Gelombang bergulir sendiri (tick `setInterval` milik modal, karena loop game
// sedang di-pause). MURNI visual: tak satu pun nilai gameplay bergantung padanya.
export function applySyncTick(g, dt) {
    if (!g || g.type !== 'sync' || !Number.isFinite(dt)) return 'none';
    g.t += dt;
    return 'none';
}

function buildKickstart(segments) {
    return {
        type: 'kickstart', n: Math.max(8, segments | 0), angle: 0, rpm: 0,
        phase: 'spin', ignited: false, breaker: false, stalls: 0, bad: false,
    };
}

// Bangun state papan MURNI (dipakai modal DAN smoke test).
export function buildRepairGame(type, n) {
    if (type === 'wires') return buildWires(n);
    if (type === 'chips') return buildChips(n);
    if (type === 'sync') return buildSync(n);
    if (type === 'kickstart') return buildKickstart(n);
    return buildValves(n, CFG.campaign.repair.valveSteps);
}

export function repairIsSolved(g) {
    if (!g) return false;
    if (g.type === 'wires') return g.links.every(v => v >= 0);
    if (g.type === 'chips') return g.chips.every(c => c.at >= 0);
    if (g.type === 'sync') return syncAligned(g);
    if (g.type === 'kickstart') return g.breaker;
    return g.pos.every((v, i) => v === g.target[i]);
}

// --- Aksi MURNI (state diberikan pemanggil). Nilai balik = jenis kejadian:
//     'link' | 'unlink' | 'select' | 'reject' | 'none' — dipakai untuk SFX. ---

export function applyWirePick(g, side, i) {
    if (!g || g.type !== 'wires' || i < 0 || i >= g.n) return 'none';
    const left = side === 'l';
    if (left && g.links[i] >= 0) { g.links[i] = -1; g.sel = null; return 'unlink'; }
    if (!left) {
        const k = g.links.indexOf(i);
        if (k >= 0) { g.links[k] = -1; g.sel = null; return 'unlink'; }
    }
    if (!g.sel || g.sel.side === side) { g.sel = { side, i }; return 'select'; }
    const l = left ? i : g.sel.i, r = left ? g.sel.i : i;
    // Sambungan ditolak: ujung yang tadi dipilih TETAP terpilih supaya player
    // bisa langsung mencoba lubang lain (sama seperti chip yang ditolak soket).
    if (g.right[r] !== l) { g.bad = { side, i }; return 'reject'; }
    g.sel = null;
    g.links[l] = r;
    return 'link';
}

export function applyChipPick(g, zone, i) {
    if (!g || g.type !== 'chips' || i < 0 || i >= g.n) return 'none';
    if (zone === 'chip') {
        const c = g.chips[i];
        if (c.at >= 0) { g.sockets[c.at].fill = -1; c.at = -1; g.sel = -1; return 'unlink'; }
        g.sel = g.sel === i ? -1 : i;
        return 'select';
    }
    const s = g.sockets[i];
    if (s.fill >= 0) { g.chips[s.fill].at = -1; s.fill = -1; g.sel = -1; return 'unlink'; }
    if (g.sel < 0) return 'none';
    const c = g.chips[g.sel];
    if (c.w !== s.w || c.h !== s.h) { g.bad = { zone, i }; return 'reject'; }
    c.at = i; s.fill = g.sel; g.sel = -1;
    return 'link';
}

// --- DRAG & DROP (2026-07-29, permintaan user: "bisa drag-n-drop juga?" —
//     BERDAMPINGAN dgn jalur klik ujung-ke-ujung yang lama, bukan menggantikan).
//     Beda dgn klik: seret = niat yang sudah jelas, jadi TAK ADA state "terpilih"
//     yang tertinggal dan sambungan lama di ujung tujuan otomatis dilepas. ---

// Seret ujung KABEL ke ujung di sisi berlawanan.
export function applyWireDrop(g, fromSide, fromI, toSide, toI) {
    if (!g || g.type !== 'wires' || fromSide === toSide) return 'none';
    const l = fromSide === 'l' ? fromI : toI;
    const r = fromSide === 'l' ? toI : fromI;
    if (l < 0 || r < 0 || l >= g.n || r >= g.n) return 'none';
    g.sel = null;
    if (g.right[r] !== l) { g.bad = { side: toSide, i: toI }; return 'reject'; }
    const k = g.links.indexOf(r);
    if (k >= 0) g.links[k] = -1;   // bus tujuan sedang dipakai kabel lain -> lepas
    g.links[l] = r;
    return 'link';
}

// Seret CHIP `ci` ke soket (`toZone` 'socket') atau kembali ke baki ('tray').
export function applyChipDrop(g, ci, toZone, toI) {
    if (!g || g.type !== 'chips' || ci < 0 || ci >= g.n) return 'none';
    const c = g.chips[ci];
    g.sel = -1;
    if (toZone === 'tray') {
        if (c.at < 0) return 'none';
        g.sockets[c.at].fill = -1; c.at = -1;
        return 'unlink';
    }
    const s = g.sockets[toI];
    if (!s) return 'none';
    if (s.fill === ci) return 'none';                        // dijatuhkan di tempatnya sendiri
    if (s.fill >= 0 || c.w !== s.w || c.h !== s.h) {         // soket terisi / salah ukuran
        g.bad = { zone: 'socket', i: toI };
        return 'reject';
    }
    if (c.at >= 0) g.sockets[c.at].fill = -1;                // pindah dari soket lain
    c.at = toI; s.fill = ci;
    return 'link';
}

// Katup BERGIGI: memutar katup i ikut memutar SEMUA katup di kanannya.
export function applyValveTurn(g, i, dir = 1) {
    if (!g || g.type !== 'valves' || i < 0 || i >= g.n) return 'none';
    for (let j = i; j < g.n; j++) g.pos[j] = mod(g.pos[j] + (dir < 0 ? -1 : 1), g.steps);
    return 'link';
}

export function applyRotorTurn(g, deltaRad) {
    if (!g || g.type !== 'kickstart' || g.phase !== 'spin' || !Number.isFinite(deltaRad)) return 'none';
    const A = CFG.campaign.repair.advanced;
    g.angle += deltaRad;
    if (deltaRad > 0) g.rpm = Math.min(1, g.rpm + deltaRad / (Math.PI * 2) * A.rotorRpmPerTurn);
    else g.rpm = Math.max(0, g.rpm + deltaRad / (Math.PI * 2) * A.rotorReverseLossPerTurn);
    g.bad = false;
    return 'link';
}

// Roda gila KEHILANGAN putaran terus-menerus (2026-08-19). Tanpa ini
// "green band" bukan jendela waktu sama sekali — RPM tak pernah turun, jadi
// papan cuma "klik crank sampai cukup, lalu ignition kapan saja". Peluruhan
// hanya berlaku SEBELUM mesin menyala; sesudah ignition mesin memutar dirinya
// sendiri. Nilai balik = true bila ada yang berubah (dipakai repaint ringan).
export function applyRotorDecay(g, dt) {
    if (!g || g.type !== 'kickstart' || g.phase !== 'spin' || !(dt > 0)) return false;
    if (g.rpm <= 0) return false;
    const A = CFG.campaign.repair.advanced;
    g.rpm = Math.max(0, g.rpm - A.rotorDecayPerSec * dt);
    g.angle += g.rpm * dt * Math.PI * 2;   // roda tetap berputar selagi melambat
    return true;
}

export function applyRotorIgnition(g) {
    if (!g || g.type !== 'kickstart' || g.phase !== 'spin') return 'none';
    const A = CFG.campaign.repair.advanced;
    if (g.rpm >= A.rotorGreenMin && g.rpm <= A.rotorGreenMax) {
        g.phase = 'ignited'; g.ignited = true; g.bad = false;
        return 'link';
    }
    g.rpm *= A.rotorStallRetain;
    g.stalls++;
    g.bad = true;
    return 'reject';
}

export function applyMasterBreaker(g) {
    if (!g || g.type !== 'kickstart' || g.phase !== 'ignited') return 'none';
    g.phase = 'online'; g.breaker = true; g.bad = false;
    return 'link';
}

// ===================== TAMPILAN =====================

const wireCol = (i) => (cbMode ? WIRE_COL.cb : WIRE_COL.std)[i % 5];
const wireGlyph = (i) => (cbMode ? WIRE_GLYPH[i % 5] : '');

function shell() {
    const root = overlayEl();
    if (!root) return;
    const p = parts[gi] || {};
    root.innerHTML =
        '<div class="repPanel">'
        + '<div class="repGlow"></div>'
        + '<div class="repHead"><span class="repTag">FIELD REPAIR</span>'
        + `<span class="repTitle">${headText}</span>`
        + '<span class="repStep" id="repStep"></span></div>'
        + `<div class="repSub" id="repSub">${p.sub || ''}</div>`
        + '<div class="repBoard" id="repBoard"></div>'
        + '<div class="repFoot">'
        + '<button class="repCb" id="repCb"></button>'
        + '<div class="repHint" id="repHint"></div>'
        + '<button class="repAbort" id="repAbort">ABORT ▸ ESC</button>'
        + '</div>'
        + '<div class="repBanner" id="repBanner"></div>'
        + '</div>';
    boardEl = document.getElementById('repBoard');
    bannerEl = document.getElementById('repBanner');
    subEl = document.getElementById('repSub');
    stepEl = document.getElementById('repStep');
    hintEl = document.getElementById('repHint');
    cbBtn = document.getElementById('repCb');
    const abortBtn = document.getElementById('repAbort');
    if (abortBtn) abortBtn.addEventListener('click', () => finish('abort'));
    if (cbBtn) cbBtn.addEventListener('click', () => repairToggleColorblind());
    if (boardEl) boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
    wireDocDrag();
    root.style.display = 'flex';
}

function paintChrome() {
    const p = parts[gi] || {};
    if (subEl) subEl.innerHTML = p.sub || '';
    if (hintEl) hintEl.innerText = p.hint || '';
    if (stepEl) stepEl.innerText = `COMPONENT ${gi + 1} / ${parts.length} — ${p.label || ''}`;
    if (cbBtn) cbBtn.innerText = 'COLOR MODE: ' + (cbMode ? 'COLOURBLIND-SAFE' : 'STANDARD');
    if (cbBtn) cbBtn.style.display = G && G.type === 'wires' ? '' : 'none';
}

// Bangun ulang papan setiap aksi (≤5 elemen — jauh lebih murah daripada
// menyimpan referensi per-elemen, dan tak pernah tak sinkron dengan model).
function renderBoard() {
    paintChrome();
    if (!boardEl) return;
    boardEl.innerHTML = '';
    if (!G) return;
    if (G.type === 'wires') renderWires();
    else if (G.type === 'chips') renderChips();
    else if (G.type === 'valves') renderValves();
    else if (G.type === 'sync') renderSync();
    else renderKickstart();
}

function mkEl(cls, parent, html) {
    const e = document.createElement('div');
    e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
}

function renderWires() {
    const n = G.n;
    const wrap = mkEl('repWires', boardEl);
    const colL = mkEl('repCol', wrap);
    wireLinesEl = mkEl('repLines', wrap);
    const colR = mkEl('repCol repColR', wrap);
    colL.style.gridTemplateRows = `repeat(${n}, 1fr)`;
    colR.style.gridTemplateRows = `repeat(${n}, 1fr)`;
    const pin = (parent, side, i, colIdx, label) => {
        const linked = side === 'l' ? G.links[i] >= 0 : G.links.indexOf(i) >= 0;
        const selp = G.sel && G.sel.side === side && G.sel.i === i;
        const badp = G.bad && G.bad.side === side && G.bad.i === i;
        const dragp = drag && drag.kind === 'wire' && drag.moved && drag.side === side && drag.i === i;
        const c = wireCol(colIdx);
        const e = mkEl('repPin' + (linked ? ' linked' : '') + (selp ? ' sel' : '')
            + (badp ? ' bad' : '') + (dragp ? ' dragging' : ''),
            parent,
            `<span class="repJack" style="background:${c};border-color:${c}">${wireGlyph(colIdx)}</span>`
            + `<span class="repPinLbl">${label}</span>`);
        e.addEventListener('click', () => repairWirePick(side, i));
        e.addEventListener('mousedown', (ev) => beginDrag(ev, { kind: 'wire', side, i }, e));
        e.addEventListener('mouseup', () => dropOn({ kind: 'wire', side, i }));
        return e;
    };
    for (let i = 0; i < n; i++) pin(colL, 'l', i, i, 'FEED ' + (i + 1));
    for (let j = 0; j < n; j++) pin(colR, 'r', j, G.right[j], 'BUS ' + BUS_LABEL[j % 5]);
    paintWireLines();
}

// Kabel: kurva dari tengah baris kiri ke tengah baris kanan (viewBox 100×100,
// preserveAspectRatio none → sejajar dengan baris grid kedua kolom), + kabel
// HIDUP yang mengikuti kursor selagi diseret.
function paintWireLines() {
    if (!wireLinesEl || !G || G.type !== 'wires') return;
    const n = G.n;
    let d = '';
    for (let i = 0; i < n; i++) {
        if (G.links[i] < 0) continue;
        const y1 = ((i + 0.5) / n) * 100, y2 = ((G.links[i] + 0.5) / n) * 100;
        d += `<path class="repWire" d="M0 ${y1} C 34 ${y1}, 66 ${y2}, 100 ${y2}" stroke="${wireCol(i)}"/>`;
    }
    if (drag && drag.moved && drag.kind === 'wire' && wireLinesEl.getBoundingClientRect) {
        const r = wireLinesEl.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) {
            const sx = drag.side === 'l' ? 0 : 100;
            const sy = ((drag.i + 0.5) / n) * 100;
            const tx = ((drag.cx - r.left) / r.width) * 100;
            const ty = ((drag.cy - r.top) / r.height) * 100;
            const col = wireCol(drag.side === 'l' ? drag.i : G.right[drag.i]);
            d += `<path class="repWire live" d="M${sx} ${sy} L${tx} ${ty}" stroke="${col}"/>`;
        }
    }
    wireLinesEl.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${d}</svg>`;
}

function renderChips() {
    const wrap = mkEl('repChipWrap', boardEl);
    const sect = (title, cls) => {
        const s = mkEl('repChipSect', wrap);
        mkEl('repChipLbl', s, title);
        return mkEl(cls, s);
    };
    const board = sect('CONTROL BOARD — SOCKETS', 'repSockets');
    const tray = sect('CHIP TRAY', 'repTray');
    const dragging = (ci) => drag && drag.kind === 'chip' && drag.moved && drag.i === ci;
    for (let i = 0; i < G.sockets.length; i++) {
        const s = G.sockets[i];
        const badp = G.bad && G.bad.zone === 'socket' && G.bad.i === i;
        const e = mkEl('repSocket' + (s.fill >= 0 ? ' filled' : '') + (badp ? ' bad' : ''), board);
        e.style.width = `calc(var(--u) * ${s.w})`;
        e.style.height = `calc(var(--u) * ${s.h})`;
        if (s.fill >= 0) {
            const ci = s.fill;
            const chip = mkEl('repChip seated' + (dragging(ci) ? ' dragging' : ''), e, chipFace(ci));
            // Chip yang sudah duduk boleh diseret KELUAR (ke baki / soket lain).
            chip.addEventListener('mousedown', (ev) => beginDrag(ev, { kind: 'chip', i: ci }, chip));
        }
        e.addEventListener('click', () => repairChipPick('socket', i));
        e.addEventListener('mouseup', () => dropOn({ kind: 'socket', i }));
    }
    // Menjatuhkan chip ke area baki = mencabutnya dari soket.
    tray.addEventListener('mouseup', () => dropOn({ kind: 'tray' }));
    for (let i = 0; i < G.chips.length; i++) {
        const c = G.chips[i];
        if (c.at >= 0) continue;   // sudah terpasang di soket
        const e = mkEl('repChip' + (G.sel === i ? ' sel' : '') + (dragging(i) ? ' dragging' : ''),
            tray, chipFace(i));
        e.style.width = `calc(var(--u) * ${c.w})`;
        e.style.height = `calc(var(--u) * ${c.h})`;
        e.addEventListener('click', () => repairChipPick('chip', i));
        e.addEventListener('mousedown', (ev) => beginDrag(ev, { kind: 'chip', i }, e));
    }
}

// ===================== SERET & LEPAS =====================
// Berdampingan dgn klik: gerakan < DRAG_SLOP tetap jadi KLIK biasa (handler
// click elemen), lebih dari itu jadi seret dan handler `mouseup` di elemen
// TUJUAN yang menyelesaikannya. Listener document dipasang sekali (lihat
// wireDocDrag) sehingga tak ada yang perlu dicabut saat papan dibangun ulang.

function wireDocDrag() {
    if (docWired || !document.addEventListener) return;
    docWired = true;
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', endDrag);
}

function beginDrag(ev, src, el) {
    if (!open || phase !== 'play' || !G) return;
    if (ev && ev.button != null && ev.button !== 0) return;   // klik kanan tetap milik katup/menu
    if (ev && ev.preventDefault) ev.preventDefault();          // jangan seret-pilih teks
    const x = ev ? ev.clientX : 0, y = ev ? ev.clientY : 0;
    drag = { ...src, x, y, cx: x, cy: y, moved: false, done: false };
    dragEl = el || null;
}

function onDragMove(ev) {
    if (!open || phase !== 'play') return;
    if (syncDrag) {
        const v = syncValueAt(syncDrag.track, ev.clientX);
        if (v != null) repairSyncSet(syncDrag.i, v);
        return;
    }
    if (rotorDrag) {
        const angle = Math.atan2(ev.clientY - rotorDrag.cy, ev.clientX - rotorDrag.cx);
        let delta = angle - rotorDrag.angle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        else if (delta < -Math.PI) delta += Math.PI * 2;
        rotorDrag.angle = angle;
        repairRotorTurn(delta);
        return;
    }
    if (!drag) return;
    drag.cx = ev.clientX; drag.cy = ev.clientY;
    if (!drag.moved) {
        if (Math.hypot(drag.cx - drag.x, drag.cy - drag.y) < DRAG_SLOP) return;
        drag.moved = true;
        if (drag.kind === 'chip') makeGhost();
        renderBoard();   // sekali saja: tandai sumber sedang diseret
    }
    if (drag.kind === 'wire') paintWireLines();
    else moveGhost();
}

// Dipanggil handler `mouseup` elemen tujuan (menggelembung ke document setelah
// ini, yang lalu membereskan sisa keadaan seret).
function dropOn(target) {
    if (!open || phase !== 'play' || !drag || !drag.moved || drag.done) return;
    drag.done = true;
    const d = drag;
    if (d.kind === 'wire' && target.kind === 'wire') repairWireDrop(d.side, d.i, target.side, target.i);
    else if (d.kind === 'chip' && target.kind === 'socket') repairChipDrop(d.i, 'socket', target.i);
    else if (d.kind === 'chip' && target.kind === 'tray') repairChipDrop(d.i, 'tray', -1);
    endDrag();
}

function endDrag() {
    rotorDrag = null; syncDrag = null;
    if (!drag) { killGhost(); return; }
    const stale = drag.moved && !drag.done;   // dilepas di ruang kosong -> batal
    drag = null; dragEl = null;
    killGhost();
    if (stale) renderBoard();
}

function makeGhost() {
    const root = overlayEl();
    if (!root || !G || !document.createElement) return;
    const c = G.chips[drag.i];
    if (!c) return;
    killGhost();
    ghostEl = document.createElement('div');
    ghostEl.className = 'repChip repGhost';
    ghostEl.innerHTML = chipFace(drag.i);
    const w = dragEl && dragEl.offsetWidth, h = dragEl && dragEl.offsetHeight;
    ghostEl.style.width = w ? w + 'px' : `calc(var(--u, 24px) * ${c.w})`;
    ghostEl.style.height = h ? h + 'px' : `calc(var(--u, 24px) * ${c.h})`;
    root.appendChild(ghostEl);
    moveGhost();
}

function moveGhost() {
    if (!ghostEl || !drag) return;
    ghostEl.style.left = drag.cx + 'px';
    ghostEl.style.top = drag.cy + 'px';
}

function killGhost() {
    if (!ghostEl) return;
    const p = ghostEl.parentNode;
    if (p && p.removeChild) p.removeChild(ghostEl);
    ghostEl = null;
}

// Muka chip: kaki di kiri-kanan + titik penanda orientasi (murni dekor).
function chipFace(i) {
    return '<span class="repChipDot"></span><span class="repChipId">IC-' + (i + 1) + '</span>';
}

function renderValves() {
    const wrap = mkEl('repValves', boardEl);
    for (let i = 0; i < G.n; i++) {
        if (i) mkEl('repGear', wrap, '›');
        const okv = G.pos[i] === G.target[i];
        const card = mkEl('repValve' + (okv ? ' ok' : ''), wrap);
        const a = (G.pos[i] / G.steps) * 360, t = (G.target[i] / G.steps) * 360;
        let ticks = '';
        for (let k = 0; k < G.steps; k++) {
            const ang = (k / G.steps) * 360;
            ticks += `<line class="repTick" x1="50" y1="9" x2="50" y2="17"`
                + ` transform="rotate(${ang} 50 50)"/>`;
        }
        const dial = mkEl('repDial', card,
            '<svg viewBox="0 0 100 100">'
            + '<circle class="repDialBg" cx="50" cy="50" r="43"/>'
            + ticks
            + `<path class="repTarget" d="M50 4 L45 16 L55 16 Z" transform="rotate(${t} 50 50)"/>`
            + `<g transform="rotate(${a} 50 50)"><line class="repNeedle" x1="50" y1="50" x2="50" y2="20"/></g>`
            + '<circle class="repHub" cx="50" cy="50" r="7"/>'
            + '</svg>');
        dial.addEventListener('click', () => repairValveTurn(i, 1));
        dial.addEventListener('contextmenu', (e) => { e.preventDefault(); repairValveTurn(i, -1); });
        const row = mkEl('repValveBtns', card);
        const btn = (txt, dir) => {
            const b = document.createElement('button');
            b.className = 'repValveBtn';
            b.innerText = txt;
            b.addEventListener('click', () => repairValveTurn(i, dir));
            row.appendChild(b);
        };
        btn('−', -1);
        mkEl('repValveLbl', row, 'V' + (i + 1));
        btn('+', 1);
    }
}

// OSILOSKOP. Jejaknya dilukis sebagai polyline SVG dan dicat ulang oleh tick
// modal — HANYA atribut `points`, `class` dan teks pembacaan, tak pernah
// `renderBoard()` penuh, karena membangun ulang papan 20x per detik akan
// mencabut tuas yang sedang diseret (pelajaran yang sama dengan `paintRotor`).
const SYNC_W = 520, SYNC_H = 168, SYNC_STEPS = 130;

// Satu jejak: gelombang sinus yang frekuensi, amplitudo dan fasanya SEMUA
// turunan dari selisih tuas terhadap sasaran. Selisih nol -> identik dengan
// acuan bus, jadi "berimpit jadi satu garis" persis sama dengan "menang".
function syncTracePoints(i) {
    const err = i < 0 ? 0 : syncError(G, i);
    const A = CFG.campaign.repair.advanced;
    const cycles = (A.syncBusCycles || 3) + err * (A.syncCycleSpan || 2.2);
    const amp = (SYNC_H / 2 - 12) * (i < 0 ? 1 : 0.45 + syncAmp(G, i) * 0.55);
    const phase = i < 0 ? 0 : G.seed[i] * Math.min(1, Math.abs(err) * 6);
    const pts = [];
    for (let k = 0; k <= SYNC_STEPS; k++) {
        const u = k / SYNC_STEPS;
        const y = SYNC_H / 2 - Math.sin((u * cycles + G.t * 0.35) * Math.PI * 2 + phase) * amp;
        pts.push(`${(u * SYNC_W).toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
}

function syncTraceClass(i) {
    return 'repSyncTrace' + (syncLocked(G, i) ? ' lock' : '') + (G.last === i ? ' active' : '');
}
const syncReadout = i =>
    `<span class="repSyncHz">${syncHz(G, i).toFixed(1)} Hz</span>`
    + `<span class="repSyncAmp">${Math.round(syncAmp(G, i) * 100)}%</span>`;

function syncScopeHtml() {
    const A = CFG.campaign.repair.advanced;
    return `<svg class="repSyncSvg" viewBox="0 0 ${SYNC_W} ${SYNC_H}" preserveAspectRatio="none">`
        + `<line class="repSyncMid" x1="0" y1="${SYNC_H / 2}" x2="${SYNC_W}" y2="${SYNC_H / 2}"/>`
        + `<polyline class="repSyncBus" points="${syncTracePoints(-1)}"/>`
        + G.v.map((_, i) => `<polyline class="${syncTraceClass(i)}" points="${syncTracePoints(i)}"/>`).join('')
        + '</svg>'
        + `<div class="repSyncBusLbl">BUS REFERENCE ${(A.syncBusHz || 50).toFixed(1)} Hz</div>`;
}
const syncNoteText = () => syncAligned(G) ? 'ALL PHASES SYNCHRONISED'
    : `${G.v.filter((_, i) => syncLocked(G, i)).length} / ${G.n} PHASES IN SYNC`;

function renderSync() {
    const wrap = mkEl('repSyncWrap', boardEl);
    // Osiloskop dicat ulang lewat innerHTML-nya SENDIRI, bukan lewat
    // `renderBoard()`: membangun ulang seluruh papan 20x per detik akan
    // mencabut tuas yang sedang diseret dari bawah kursor (pelajaran yang sama
    // dengan `paintRotor`). Elemen tuas dipegang sebagai referensi, jadi
    // pengecatan tak pernah bergantung pada penelusuran DOM.
    syncScopeEl = mkEl('repSyncScope', wrap, syncScopeHtml());

    const rows = mkEl('repSyncRows', wrap);
    syncRowEls = [];
    for (let i = 0; i < G.n; i++) {
        const row = mkEl('repSyncRow' + (syncLocked(G, i) ? ' lock' : ''), rows);
        mkEl('repSyncPip', row);
        mkEl('repSyncName', row, G.names[i]);
        const read = mkEl('repSyncRead', row, syncReadout(i));
        const track = mkEl('repSyncTrack', row);
        const fill = mkEl('repSyncFill', track);
        const knob = mkEl('repSyncKnob', track);
        fill.style.width = (G.v[i] * 100) + '%';
        knob.style.left = (G.v[i] * 100) + '%';
        // Seret DAN klik-di-track: keduanya jalur resmi, pola yang sama dengan
        // papan kabel/chip sejak 2026-07-29.
        track.addEventListener('mousedown', e => beginSyncDrag(e, i, track));
        syncRowEls.push({ row, track, fill, knob, read });
    }
    syncNoteEl = mkEl('repSyncNote' + (syncAligned(G) ? ' ok' : ''), wrap, syncNoteText());
}

// Cat ulang RINGAN: dipanggil tiap tick gelombang dan tiap gerak tuas.
function paintSync() {
    if (!G || G.type !== 'sync') return;
    if (syncScopeEl) syncScopeEl.innerHTML = syncScopeHtml();
    for (let i = 0; i < syncRowEls.length; i++) {
        const r = syncRowEls[i];
        if (!r) continue;
        r.row.className = 'repSyncRow' + (syncLocked(G, i) ? ' lock' : '');
        r.fill.style.width = (G.v[i] * 100) + '%';
        r.knob.style.left = (G.v[i] * 100) + '%';
        r.read.innerHTML = syncReadout(i);
    }
    if (syncNoteEl) {
        syncNoteEl.className = 'repSyncNote' + (syncAligned(G) ? ' ok' : '');
        syncNoteEl.innerText = syncNoteText();
    }
}

function startSyncTick() {
    stopSyncTick();
    syncTimer = setInterval(() => repairSyncTick(SYNC_TICK_MS / 1000), SYNC_TICK_MS);
}
function stopSyncTick() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = 0;
}

// Nilai tuas dari posisi kursor pada track-nya.
function syncValueAt(track, clientX) {
    const r = track.getBoundingClientRect ? track.getBoundingClientRect() : null;
    if (!r || !r.width) return null;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
}

function beginSyncDrag(ev, i, track) {
    if (!open || phase !== 'play' || !G || G.type !== 'sync') return;
    if (ev && ev.button != null && ev.button !== 0) return;
    if (ev && ev.preventDefault) ev.preventDefault();
    syncDrag = { i, track };
    const v = syncValueAt(track, ev ? ev.clientX : 0);
    if (v != null) repairSyncSet(i, v);
}

const rotorInBand = () => {
    const A = CFG.campaign.repair.advanced;
    return !!G && G.type === 'kickstart' && G.rpm >= A.rotorGreenMin && G.rpm <= A.rotorGreenMax;
};
const rotorRpmHtml = () => `<span>ROTOR SPEED</span><strong>${Math.round(G.rpm * 100)}%</strong>`;
function rotorStateText() {
    if (G.bad) return `ENGINE STALLED - ${G.stalls}`;
    if (G.phase === 'ignited') return 'COMBUSTION STABLE';
    if (G.phase === 'online') return 'GENERATOR COUPLED';
    return rotorInBand() ? 'GREEN BAND - FIRE IGNITION' : 'CRANKING';
}

function renderKickstart() {
    const A = CFG.campaign.repair.advanced;
    const wrap = mkEl('repRotorWrap' + (G.bad ? ' bad' : ''), boardEl);
    rotorWrapEl = wrap;
    const machine = mkEl('repRotorMachine', wrap);
    const wheel = mkEl('repRotor', machine);
    let spokes = '';
    for (let i = 0; i < G.n; i++) spokes += `<i style="transform:rotate(${(i / G.n) * 360}deg)"></i>`;
    wheel.innerHTML = `<div class="repRotorFace" style="transform:rotate(${G.angle}rad)">${spokes}<b></b></div>`;
    rotorFaceEl = wheel.children && wheel.children[0] ? wheel.children[0] : null;
    wheel.addEventListener('mousedown', (ev) => beginRotorDrag(ev, wheel));
    const crank = document.createElement('button');
    crank.className = 'repCrank'; crank.innerText = 'CRANK CLOCKWISE';
    crank.disabled = G.phase !== 'spin';
    crank.addEventListener('click', () => repairRotorTurn(A.rotorCrankStepRad));
    machine.appendChild(crank);
    rotorCrankEl = crank;

    const controls = mkEl('repRotorControls', wrap);
    rotorRpmEl = mkEl('repRpmLabel', controls, rotorRpmHtml());
    const meter = mkEl('repRpmMeter', controls);
    const green = mkEl('repRpmGreen', meter);
    green.style.left = `${A.rotorGreenMin * 100}%`;
    green.style.width = `${(A.rotorGreenMax - A.rotorGreenMin) * 100}%`;
    rotorNeedleEl = mkEl('repRpmNeedle', meter);
    const ignition = document.createElement('button');
    ignition.className = 'repIgnition' + (G.ignited ? ' on' : '');
    ignition.innerText = G.ignited ? 'IGNITION LIT' : 'IGNITION';
    ignition.disabled = G.phase !== 'spin';
    ignition.addEventListener('click', repairRotorIgnition);
    controls.appendChild(ignition);
    rotorIgnEl = ignition;
    const breaker = document.createElement('button');
    breaker.className = 'repMaster' + (G.breaker ? ' on' : '');
    breaker.innerText = G.breaker ? 'MASTER CLOSED' : 'CLOSE MASTER BREAKER';
    breaker.disabled = G.phase !== 'ignited';
    breaker.addEventListener('click', repairMasterBreaker);
    controls.appendChild(breaker);
    rotorStateEl = mkEl('repRotorState', controls, rotorStateText());
    paintRotor();
}

// Repaint RINGAN papan rotor (jarum, angka, muka roda, status). Dipakai tiap
// tick peluruhan dan tiap gerak seret — membangun ulang papan sesering itu
// akan mencabut elemen yang sedang diseret.
function paintRotor() {
    if (!G || G.type !== 'kickstart') return;
    const armed = rotorInBand() && G.phase === 'spin';
    if (rotorFaceEl) rotorFaceEl.style.transform = `rotate(${G.angle}rad)`;
    if (rotorNeedleEl) rotorNeedleEl.style.left = `${Math.max(0, Math.min(1, G.rpm)) * 100}%`;
    if (rotorRpmEl) rotorRpmEl.innerHTML = rotorRpmHtml();
    if (rotorStateEl) rotorStateEl.innerText = rotorStateText();
    if (rotorWrapEl && rotorWrapEl.classList) {
        rotorWrapEl.classList.toggle('live', armed);
        rotorWrapEl.classList.toggle('bad', !!G.bad);
    }
    if (rotorIgnEl && rotorIgnEl.classList) rotorIgnEl.classList.toggle('armed', armed);
}

// Loop game sedang PAUSE selama modal terbuka, jadi waktu peluruhan datang dari
// setInterval sendiri (pola yang sama dengan hitung mundur ICE BREACH).
// Diekspor supaya smoke bisa memajukannya tanpa menunggu waktu nyata.
export function repairRotorTick(dt) {
    if (!open || phase !== 'play' || !G || G.type !== 'kickstart') return false;
    if (!applyRotorDecay(G, dt)) return false;
    paintRotor();
    return true;
}

function startRotorTick() {
    stopRotorTick();
    rotorTimer = setInterval(() => repairRotorTick(ROTOR_TICK_MS / 1000), ROTOR_TICK_MS);
}

function stopRotorTick() {
    if (rotorTimer) clearInterval(rotorTimer);
    rotorTimer = 0;
}

function beginRotorDrag(ev, wheel) {
    if (!open || phase !== 'play' || !G || G.type !== 'kickstart' || G.phase !== 'spin' || ev.button !== 0) return;
    if (ev.preventDefault) ev.preventDefault();
    const r = wheel.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    rotorDrag = { cx, cy, angle: Math.atan2(ev.clientY - cy, ev.clientX - cx) };
}

function banner(text, cls) {
    if (!bannerEl) return;
    bannerEl.innerText = text;
    if (bannerEl.classList) { bannerEl.classList.remove('ok'); bannerEl.classList.add('on', cls); }
}
function clearBanner() {
    if (!bannerEl) return;
    bannerEl.innerText = '';
    if (bannerEl.classList) bannerEl.classList.remove('on', 'ok');
}

// ===================== AKSI (pembungkus modal) =====================

function afterAction(ev) {
    if (ev === 'link') playSFX(sfxPickup, 0.6);
    else if (ev === 'unlink' || ev === 'select') playSFX(sfxSwitch, 0.5);
    else if (ev === 'reject') playSFX(sfxEmpty, 0.6);
    renderBoard();
    if (G && G.bad) {
        if (badTimer) clearTimeout(badTimer);
        badTimer = setTimeout(() => { badTimer = 0; if (G) { G.bad = null; renderBoard(); } }, BAD_MS);
    }
    if (repairIsSolved(G)) stepSolved();
}

export function repairWirePick(side, i) {
    if (!open || phase !== 'play' || !G || G.type !== 'wires') return false;
    const ev = applyWirePick(G, side, i);
    if (ev === 'none') return false;
    afterAction(ev);
    return true;
}

export function repairChipPick(zone, i) {
    if (!open || phase !== 'play' || !G || G.type !== 'chips') return false;
    const ev = applyChipPick(G, zone, i);
    if (ev === 'none') return false;
    afterAction(ev);
    return true;
}

// Lepas ujung kabel yang diseret di ujung tujuan (dipakai handler drop & smoke).
export function repairWireDrop(fromSide, fromI, toSide, toI) {
    if (!open || phase !== 'play' || !G || G.type !== 'wires') return false;
    const ev = applyWireDrop(G, fromSide, fromI, toSide, toI);
    if (ev === 'none') return false;
    afterAction(ev);
    return true;
}

// Lepas chip yang diseret di soket / baki (dipakai handler drop & smoke).
export function repairChipDrop(ci, toZone, toI) {
    if (!open || phase !== 'play' || !G || G.type !== 'chips') return false;
    const ev = applyChipDrop(G, ci, toZone, toI);
    if (ev === 'none') return false;
    afterAction(ev);
    return true;
}

export function repairValveTurn(i, dir = 1) {
    if (!open || phase !== 'play' || !G || G.type !== 'valves') return false;
    const ev = applyValveTurn(G, i, dir);
    if (ev === 'none') return false;
    afterAction(ev);
    return true;
}

// Menggeser tuas fasa. Dicat RINGAN (bukan renderBoard) supaya tuas yang
// sedang diseret tak tercabut dari bawah kursor di tengah gerakan.
export function repairSyncSet(i, value) {
    if (!open || phase !== 'play' || !G || G.type !== 'sync') return false;
    const ev = applySyncSet(G, i, value);
    if (ev === 'none') return false;
    paintSync();
    if (repairIsSolved(G)) { syncDrag = null; afterAction(ev); }
    else if (ev === 'link') playSFX(sfxPickup, 0.45);
    return true;
}

export function repairSyncTick(dt) {
    if (!open || phase !== 'play' || !G || G.type !== 'sync') return false;
    applySyncTick(G, dt);
    paintSync();
    return true;
}

export function repairRotorTurn(deltaRad) {
    if (!open || phase !== 'play' || !G || G.type !== 'kickstart') return false;
    const ev = applyRotorTurn(G, deltaRad);
    if (ev === 'none') return false;
    paintRotor();   // repaint ringan: jangan bangun ulang papan tiap gerak seret
    return true;
}

export function repairRotorIgnition() {
    if (!open || phase !== 'play' || !G || G.type !== 'kickstart') return false;
    const ev = applyRotorIgnition(G);
    if (ev === 'none') return false;
    afterAction(ev);
    return true;
}

export function repairMasterBreaker() {
    if (!open || phase !== 'play' || !G || G.type !== 'kickstart') return false;
    const ev = applyMasterBreaker(G);
    if (ev === 'none') return false;
    afterAction(ev);
    return true;
}

// Tukar palet kabel biasa <-> palet AMAN BUTA WARNA (+ lambang bentuk).
export function repairToggleColorblind() {
    cbMode = !cbMode;
    try { localStorage.setItem(CB_KEY, cbMode ? '1' : '0'); } catch (e) { /* mode privat */ }
    playSFX(sfxSwitch, 0.5);
    renderBoard();
    return cbMode;
}
export const repairColorblind = () => cbMode;

// Papan selesai: catat kemajuan lalu lanjut ke komponen berikutnya (papan baru
// di modal YANG SAMA) atau tutup modal bila ini yang terakhir.
function stepSolved() {
    phase = 'step';
    done = Math.min(parts.length, done + 1);
    playSFX(sfxPurchase);
    // DERU TURBIN (2026-08-19, permintaan user: "diikuti suara putaran turbin
    // yang menderu"). Fasa yang selaras berarti generator benar-benar boleh
    // naik putaran, jadi papan PHASE SYNC ditutup dengan turbin spool-up di
    // atas nada sukses biasa. Klip yang dipakai adalah aset turbin yang sudah
    // ada — tak ada aset baru hanya untuk satu papan.
    if (parts[gi] && parts[gi].type === 'sync') playSFX(sfxHeli, 0.55);
    if (cb && cb.onProgress) cb.onProgress(done);
    const last = gi + 1 >= parts.length;
    banner(last ? 'GENERATOR ONLINE' : `${parts[gi].label} INSTALLED — ${done}/${parts.length}`, 'ok');
    if (stepTimer) clearTimeout(stepTimer);
    stepTimer = setTimeout(() => {
        stepTimer = 0;
        if (last) finish('ok');
        else { clearBanner(); loadGame(gi + 1); }
    }, last ? FINISH_MS : STEP_MS);
}

function loadGame(k) {
    gi = k;
    drag = null; dragEl = null; killGhost();   // papan baru: seret yang tertinggal dibuang
    rotorDrag = null; stopRotorTick();
    syncDrag = null; stopSyncTick(); syncScopeEl = null; syncNoteEl = null; syncRowEls = [];
    wireLinesEl = null;
    const type = parts[k].type;
    const A = CFG.campaign.repair.advanced;
    // FAULT ISOLATION dan roda gila punya angka sendiri; papan Stage 2
    // (kabel/chip/katup) tetap memakai `repairCount()` 3/4/5 per difficulty.
    const count = type === 'kickstart' ? A.rotorSegments
        : type === 'sync' ? syncCount() : repairCount();
    G = buildRepairGame(type, count);
    phase = 'play';
    renderBoard();
    if (type === 'kickstart') startRotorTick();
    if (type === 'sync') startSyncTick();
}

// Tutup modal, kembalikan scene stage (TANPA enter()), jalankan callback, lalu
// minta pointer-lock lagi supaya player langsung main.
function finish(result) {
    if (!open) return;
    open = false;
    phase = 'idle';
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = 0; }
    if (badTimer) { clearTimeout(badTimer); badTimer = 0; }
    stopRotorTick(); stopSyncTick();
    killGhost();
    drag = null; dragEl = null; rotorDrag = null; syncDrag = null;
    const root = overlayEl();
    if (root) { root.style.display = 'none'; root.innerHTML = ''; }
    boardEl = bannerEl = subEl = stepEl = cbBtn = hintEl = wireLinesEl = null;
    rotorWrapEl = rotorFaceEl = rotorNeedleEl = rotorRpmEl = rotorStateEl = null;
    rotorIgnEl = rotorCrankEl = null;
    G = null;
    const c = cb; cb = null;
    if (prevScene) resumeScene(prevScene);
    prevScene = null;
    if (result === 'ok') { if (c && c.onSuccess) c.onSuccess(); }
    else if (c && c.onFail) c.onFail(result);
    if (!open) resumePlay();   // callback boleh membuka modal lain (jangan rebut pointer)
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

// Dipanggil stage saat player memasang komponen. opts:
//   head       : judul (English)
//   startIndex : komponen ke berapa yang harus dimulai (kemajuan tersimpan)
//   parts      : daftar komponen (default REPAIR_PARTS)
//   onProgress : (jumlahTerpasang) dipanggil tiap papan selesai
//   onSuccess  : SEMUA komponen terpasang
//   onFail     : 'abort' (player membatalkan) — TAK ADA cara kalah lain
export function beginRepairMinigame(opts = {}) {
    if (open) return false;
    pendingOpts = opts;
    // Scene stage yang sedang aktif dititipkan SEBELUM setScene (setScene sudah
    // menimpa activeScene saat enter() berjalan) — dipulihkan di finish().
    repairScene.prev = activeScene;
    clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;   // lepas tombol tahan (tak drift saat kembali)
    setScene(repairScene, {});
    return true;
}

export const isRepairOpen = () => open;

// Debug/uji: keadaan modal + papan aktif (smoke memainkannya sampai selesai).
export const repairDebug = () => ({
    open, phase, index: gi, total: parts.length, done,
    type: G ? G.type : null, n: G ? G.n : 0,
    solved: repairIsSolved(G), colorblind: cbMode,
    dragging: !!(drag && drag.moved),
    part: parts[gi] ? parts[gi].id : null,
    game: G,
});

// ===================== SCENE =====================
// Semua hook gameplay = no-op/aman (sama seperti hackScene): modal ini dipasang
// DI TENGAH frame dari updateMode stage, jadi sisa frame itu masih memakai hook
// di sini sebelum setPaused menghentikan frame berikutnya. `groundHeight`
// mengembalikan feetY apa adanya — mengembalikan 0 membuat player "jatuh".
export const repairScene = {
    id: 'campaign-repair',

    enter() {
        const o = pendingOpts || {};
        pendingOpts = null;
        prevScene = repairScene.prev || null;   // dititipkan beginRepairMinigame
        cb = { onSuccess: o.onSuccess, onFail: o.onFail, onProgress: o.onProgress };
        headText = o.head || 'GENERATOR';
        parts = o.parts || REPAIR_PARTS;
        done = Math.max(0, Math.min(parts.length, o.startIndex || 0));
        try { cbMode = localStorage.getItem(CB_KEY) === '1'; } catch (e) { cbMode = false; }
        gi = Math.min(done, parts.length - 1);   // sebelum shell() — kepala panel membacanya
        open = true;
        setPaused(true);
        shell();
        loadGame(gi);
        // Pointer dilepas agar kursor OS bisa mengklik papan. input.js melihat
        // shopActive() = true -> tak memunculkan menu jeda.
        document.exitPointerLock();
    },

    // Mati mustahil di modal (game di-pause), tapi hook ini WAJIB ada.
    restartScene: () => repairScene.prev || stage1Scene,
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
    hudStatus: () => 'INSTALLING COMPONENTS',
    radarLandmarks() { },
    prev: null,   // scene stage yang dipulihkan saat modal ditutup
};
