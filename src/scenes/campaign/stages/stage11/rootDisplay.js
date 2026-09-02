// LAYAR KOMPUTER ROOT — UI sungguhan di dalam dunia, bukan popup HUD.
//
// Dibuat 2026-09-02 atas permintaan user: "hilangkan popup loading warna biru
// yang di tengah layar itu" + "buat agar layar komputer benar-benar menampilkan
// UI selayaknya komputer DAN persentase proses upload".
//
// Panel utama konsol root sekarang bertekstur CANVAS: bingkai jendela, judul
// tugas, ANGKA PERSEN besar, bar progres, baris status dan log yang berjalan.
// Bar `#downloadBar` biru di tengah layar tidak lagi dipakai bab ini sama
// sekali — persentasenya hidup di benda yang benar-benar berdiri di dunia,
// sehingga close-up shot 2 memperlihatkan komputer yang sedang bekerja, bukan
// komputer gelap dengan popup melayang di depannya.
//
// EMPAT ATURAN.
//   1. SATU sumber angka. `paintRootDisplay` menerima `progress` yang sama
//      dengan yang dipakai gameplay/HUD boss; layar ini tidak menyimpan
//      progresnya sendiri, jadi keduanya tak mungkin berselisih.
//   2. Kanvas, tekstur dan materialnya dibuat SEKALI saat dunia dibangun.
//      Tidak ada mesh/material lahir saat cutscene berjalan (aturan tanpa
//      rekompilasi shader), dan panelnya sudah tergambar sejak frame pertama.
//   3. REPAINT DIBATASI. Menggambar ulang kanvas berarti mengunggah tekstur;
//      itu hanya dilakukan saat angka persen bulatnya BERUBAH atau saat detak
//      `REFRESH_HZ` berikutnya (kursor kedip + log berjalan) — bukan tiap frame.
//   4. Token PAL saja, dan tanpa papan nama tempat: yang tampil adalah kontrol
//      dan status mesin, bukan penunjuk lokasi.

import { PAL } from '../../../../world/palette.js';

const W = 512, H = 470;            // ~ rasio panel layar utama (24 lebar x 22 tinggi)
const REFRESH_HZ = 8;              // detak kursor/log; batas atas unggahan tekstur
const LOG_ROWS = 5;

const css = hex => '#' + (hex >>> 0).toString(16).padStart(6, '0');
const C = {
    bg: '#050b0c',
    frame: css(PAL.techDim),
    tech: css(PAL.tech),
    dim: css(PAL.techDim),
    text: css(PAL.white),
    amber: css(PAL.amber),
    amberDim: css(PAL.amberDim),
    hazard: css(PAL.hazard),
    grid: 'rgba(47,184,166,0.10)',
    scan: 'rgba(0,0,0,0.22)',
};

// Log boot yang sama urutannya tiap kali — deterministik, bukan Math.random():
// dunia ini dibangun bersama seluruh dunia campaign lain saat loading.
const BOOT_LOG = [
    'mount /dev/root/media0 .............. OK',
    'verify kill-switch signature ........ OK',
    'authority: PHYSICAL MEDIA ........... OK',
    'open national uplink ................ OK',
    'sector map 64 blocks ................ OK',
];

let canvas = null, ctx = null, texture = null;
let t = 0, tick = 0, redraws = 0;
let lastPercent = -1, lastState = '';
let state = 'idle', percent = 0;

export function buildRootDisplayTexture() {
    if (texture) return texture;
    canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    texture = new THREE.CanvasTexture(canvas);
    if (texture.encoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    // TANPA pembalikan UV. Panelnya adalah PlaneGeometry ber-`rotation.y =
    // PI/2 + yaw`, yang memetakan +X lokal (arah u tekstur) ke -Z dunia — dan
    // -Z dunia PERSIS arah kanan-layar bagi kamera yang memandang ke -X. Jadi
    // teksnya sudah terbaca benar apa adanya; membalik `repeat` di sini justru
    // akan mencerminkannya. (Muka sebuah Box tidak bisa dipastikan seperti ini,
    // itulah sebabnya panel ini bukan Box.)
    draw();
    return texture;
}

export const rootDisplayTexture = () => texture;

function line(y, x0, x1, color, w = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
}

function draw() {
    if (!ctx) return;
    redraws++;
    const stalled = state === 'stalled', jammed = state === 'jammed';
    const accent = stalled ? C.hazard : jammed ? C.amber : C.tech;
    const blink = (tick % 2) === 0;

    // Latar + kisi halus: kaca layar, bukan pelat datar.
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 32) {
        ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke();
    }

    // Kop jendela: judul tugas + indikator sesi (chrome komputer, bukan papan nama).
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = C.bg;
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('ROOT BROADCAST CONTROL', 14, 18);
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(W - 26 - i * 18, 12, 12, 12);
    }

    // Bingkai jendela.
    ctx.strokeStyle = C.frame; ctx.lineWidth = 2;
    ctx.strokeRect(6, 40, W - 12, H - 48);

    // Baris meta.
    ctx.font = '15px "Courier New", monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText('NODE  N-ROOT-01', 20, 62);
    ctx.fillText('AUTH  PHYSICAL MEDIA', 20, 84);
    ctx.fillStyle = C.text;
    ctx.fillText('TASK  NATIONAL DECOMMISSION', 20, 106);
    line(120, 20, W - 20, C.frame);

    // ANGKA PERSEN — bagian yang dulu hidup di popup biru.
    const pctText = percent + '%';
    ctx.font = 'bold 108px "Courier New", monospace';
    ctx.fillStyle = accent;
    ctx.fillText(pctText, 26, 190);
    ctx.font = '15px "Courier New", monospace';
    ctx.fillStyle = C.dim;
    ctx.fillText('UPLINK', 26, 240);

    // Bar progres + tanda batas siaran.
    const bx = 26, by = 258, bw = W - 52, bh = 26;
    ctx.strokeStyle = C.frame; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = accent;
    ctx.fillRect(bx + 3, by + 3, Math.max(0, (bw - 6) * percent / 100), bh - 6);
    // Blok-blok kosong di sisa bar supaya terbaca sebagai progres bersegmen.
    ctx.fillStyle = C.grid;
    for (let i = 0; i < 32; i++) {
        const sx = bx + 3 + (bw - 6) * (i / 32);
        if ((i + .5) / 32 * 100 <= percent) continue;
        ctx.fillRect(sx + 1, by + 3, (bw - 6) / 32 - 2, bh - 6);
    }

    // Baris status besar.
    ctx.font = 'bold 19px "Courier New", monospace';
    ctx.fillStyle = accent;
    ctx.fillText(stalled ? 'STATUS  HALTED — EXTERNAL AUTHORITY'
        : jammed ? 'STATUS  JAMMED — CHANNEL SEIZED'
            : percent > 0 ? 'STATUS  TRANSMITTING'
                : 'STATUS  AWAITING ROOT MEDIA', 26, 312);
    line(332, 20, W - 20, C.frame);

    // Log berjalan: baris terakhir mengikuti keadaan siaran + kursor kedip.
    ctx.font = '15px "Courier New", monospace';
    for (let i = 0; i < LOG_ROWS; i++) {
        const y = 356 + i * 22;
        const last = i === LOG_ROWS - 1;
        if (!last) {
            ctx.fillStyle = C.dim;
            ctx.fillText('> ' + BOOT_LOG[i], 26, y);
            continue;
        }
        ctx.fillStyle = accent;
        const sector = Math.max(1, Math.min(64, Math.round(percent / 100 * 64)));
        const body = stalled ? 'broadcast halted at sector ' + sector + '/64'
            : jammed ? 'channel jammed — holding sector ' + sector + '/64'
                : percent > 0 ? 'broadcasting sector ' + sector + '/64'
                    : 'waiting for physical root media';
        ctx.fillText('> ' + body + (blink ? ' _' : ''), 26, y);
    }

    // Scanline: satu-satunya hiasan, dan ia yang membuatnya terbaca sebagai CRT.
    ctx.fillStyle = C.scan;
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

    if (texture) texture.needsUpdate = true;
}

// Dipanggil tiap frame oleh `updateStage11RootVisuals`, tetapi hanya benar-benar
// menggambar saat angkanya berubah atau detak berikutnya tiba.
export function paintRootDisplay(dt, progress = 0, stalled = false, jammed = false) {
    if (!ctx) return;
    t += Math.max(0, dt);
    percent = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));
    state = stalled ? 'stalled' : jammed ? 'jammed' : percent > 0 ? 'live' : 'idle';
    const nextTick = Math.floor(t * REFRESH_HZ);
    if (percent === lastPercent && state === lastState && nextTick === tick) return;
    tick = nextTick; lastPercent = percent; lastState = state;
    draw();
}

export function resetRootDisplay() {
    t = 0; tick = 0; lastPercent = -1; lastState = '';
    percent = 0; state = 'idle';
    draw();
}

export const rootDisplayDebug = () => ({
    built: !!texture, width: W, height: H, refreshHz: REFRESH_HZ,
    percent, state, redraws, logRows: LOG_ROWS,
    // UI komputer yang sebenarnya, bukan sekadar bar: keempat bagian ini yang
    // membuatnya terbaca sebagai layar mesin dan bukan overlay HUD.
    parts: ['titlebar', 'meta', 'percent', 'progressBar', 'status', 'log', 'scanlines'],
});
