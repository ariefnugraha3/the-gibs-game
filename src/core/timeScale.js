// ===== SKALA WAKTU GLOBAL — SATU-SATUNYA (2026-07-27) =====
// Sebelumnya `deathTimeScale()` (core/deathCine.js) langsung dibaca main.animate.
// Sejak HIT-STOP melee ada dua sumber pelambatan, jadi penggabungannya dipusatkan
// di sini: main.js hanya tahu `globalTimeScale()`, dan aturan "JANGAN tambah skala
// waktu kedua" tetap berlaku — sumber baru didaftarkan sebagai FAKTOR di fungsi
// ini, bukan sebagai pengali terpisah di loop render.
//
// HIT-STOP = teknik "juice" klasik: pada frame bilah/cakar MENGENAI sasaran,
// waktu nyaris BEKU ~70 ms lalu lepas. Otak membaca jeda itu sebagai BENTURAN
// yang punya bobot — tanpa itu sabetan cuma menembus musuh tanpa terasa. Karena
// skalanya global, animasi ayunan player, robot, darah, dan gib ikut membeku
// bersama (itulah yang membuatnya terbaca sebagai satu momen tumbukan).
//
// Semua timer yang HARUS mengabaikan pelambatan (sutradara kematian, hitung
// mundur GAME OVER, laju tembak yang memakai Date.now()) tetap memakai dtReal.

import { deathTimeScale } from './deathCine.js';

let stopT = 0;        // sisa detik hit-stop (waktu NYATA)
let stopDur = 0;      // durasi hit-stop yang sedang berjalan
let stopScale = 1;    // skala waktu di puncak beku

// sec = lama beku, scale = seberapa lambat (0.08 = nyaris berhenti).
// Pemanggilan baru TIDAK memotong hit-stop yang lebih panjang & masih berjalan.
export function addHitStop(sec = 0.07, scale = 0.08) {
    if (sec <= stopT) return;
    stopT = sec; stopDur = sec; stopScale = scale;
}

// Ditick dari updateGame dgn dtReal (tiap frame, bukan hanya saat sekuens mati).
export function updateTimeScale(dtReal) {
    if (stopT > 0) { stopT -= dtReal; if (stopT < 0) stopT = 0; }
}

// 1 saat tak ada hit-stop. Ekor 35% terakhir di-ease keluar (kuadrat) supaya
// lepas dari beku terasa "melesat", bukan sekadar tombol on/off.
export function hitStopScale() {
    if (stopT <= 0) return 1;
    const k = stopT / stopDur;                       // 1 -> 0
    const rel = k > 0.35 ? 0 : 1 - k / 0.35;         // 0 selama beku, 1 di ujung
    return stopScale + (1 - stopScale) * rel * rel;
}

// Skala waktu yang dipakai loop render. Mengembalikan TEPAT 1 saat tak ada
// pelambatan aktif → frame normal identik dgn sebelum fitur-fitur ini ada.
export function globalTimeScale() { return deathTimeScale() * hitStopScale(); }

export function resetTimeScale() { stopT = 0; stopDur = 0; stopScale = 1; }
export const timeScaleDebug = () => ({ stopT, hit: hitStopScale(), total: globalTimeScale() });
