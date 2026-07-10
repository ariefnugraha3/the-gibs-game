// Helper matematika murni (tanpa THREE, tanpa DOM) — dipakai semua modul.

export const rand = (a, b) => a + Math.random() * (b - a);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const smooth01 = (u) => u * u * (3 - 2 * u);   // smoothstep

// PRNG deterministik kecil (mulberry32). Dipakai world ber-seed co-op LAN —
// host mengirim seed saat start supaya SEMUA pemain membangun dunia taman yang
// identik (posisi pohon = collider gameplay). Return fungsi 0..1 ala Math.random.
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Kuadrat jarak titik P ke ruas garis A->B (3D). Dipakai hit test peluru:
// sweep segmen posisi-lalu -> posisi-kini agar peluru tak menembus target
// di jarak dekat (point-blank) maupun saat fps rendah (langkah per frame besar).
export function segPointDist2(ax, ay, az, bx, by, bz, px, py, pz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 > 0 ? clamp((apx * abx + apy * aby + apz * abz) / len2, 0, 1) : 0;
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
    return dx * dx + dy * dy + dz * dz;
}
