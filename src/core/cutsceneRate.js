// Batas frame visual untuk semua adegan sinematik.
// Nilai ini sengaja berada di kode presentasi, bukan gameplay.json: ia adalah
// bahasa presentasi cutscene, bukan tuning mekanik permainan.
export const CUTSCENE_FPS = 24;
export const CUTSCENE_FRAME_MS = 1000 / CUTSCENE_FPS;

// Menggunakan deadline berjalan (bukan `now + interval` setiap frame) menjaga
// pola 24 FPS tetap rata di display 60 Hz: dua frame render, lalu tiga frame,
// bukan jatuh terus-menerus menjadi 20 FPS.
export function cutsceneFrameDue(now, deadline) {
    return !Number.isFinite(deadline) || now >= deadline;
}

export function nextCutsceneDeadline(now, deadline) {
    const base = Number.isFinite(deadline) ? deadline : now;
    const next = base + CUTSCENE_FRAME_MS;
    // Tab switch atau hitch tidak boleh membuat beberapa tick cutscene
    // dikejar sekaligus pada callback berikutnya.
    return next > now ? next : now + CUTSCENE_FRAME_MS;
}
