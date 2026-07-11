// Primitif tabrakan yang dipakai lintas scene. Filosofi game ini: tabrakan =
// cek jarak/AABB 2D + dorong keluar horizontal, BUKAN physics engine.

// Geser MENYUSUR dinding (bukan berhenti menempel): bila posisi baru tidak
// walkable, pertahankan komponen sumbu yang masih sah — mentok tembok miring
// tetap meluncur di sepanjang tembok. Fallback terakhir: kembali ke posisi lama.
// `walkable(x, z, r)` disuplai scene aktif (grid gedung / union jalan raya).
export function slideWalk(walkable, pos, oldX, oldZ, r) {
    if (walkable(pos.x, pos.z, r)) return;
    if (walkable(pos.x, oldZ, r)) { pos.z = oldZ; return; }
    if (walkable(oldX, pos.z, r)) { pos.x = oldX; return; }
    pos.x = oldX; pos.z = oldZ;
}

// Dorong keluar dari balok pejal (rotated AABB) {x,z,hx,hz,axx,axz,azx,azz,rad,
// top,standable}. Murni horizontal; dilewati bila kaki sudah di atas puncak
// balok (yang standable bisa dipijak). Return true bila yang menghalangi
// adalah balok STANDABLE (median jalan — pemicu lompatan robot survival tak
// dipakai di campaign, tapi kontraknya dipertahankan).
export function resolveBlockers(pos, radius, feetY, blockers) {
    let hitStandable = false;
    for (let i = 0; i < blockers.length; i++) {
        const b = blockers[i];
        const dx = pos.x - b.x, dz = pos.z - b.z;
        const pre = b.rad + radius + 1;
        if (dx * dx + dz * dz > pre * pre) continue;   // precheck murah
        if (feetY >= b.top - 0.4) continue;            // sedang berdiri di atasnya
        // ke bingkai lokal balok (ax/az = basis ortonormal balok di dunia)
        const lx = dx * b.axx + dz * b.axz;
        const lz = dx * b.azx + dz * b.azz;
        const px = b.hx + radius - Math.abs(lx);
        const pz = b.hz + radius - Math.abs(lz);
        if (px <= 0 || pz <= 0) continue;
        if (px < pz) {   // dorong lewat sisi penetrasi terkecil (efek menyusur)
            const s = lx >= 0 ? 1 : -1;
            pos.x += s * px * b.axx; pos.z += s * px * b.axz;
        } else {
            const s = lz >= 0 ? 1 : -1;
            pos.x += s * pz * b.azx; pos.z += s * pz * b.azz;
        }
        if (b.standable) hitStandable = true;
    }
    return hitStandable;
}

// Ketinggian "lantai" dari balok standable (median/furnitur/undakan) bila
// posisi di atasnya dan kaki datang dari atas; selain itu 0.
export function blockersGroundHeight(x, z, feetY, blockers) {
    let h = 0;
    for (let i = 0; i < blockers.length; i++) {
        const b = blockers[i];
        if (!b.standable) continue;
        const dx = x - b.x, dz = z - b.z;
        if (dx * dx + dz * dz > (b.rad + 2) * (b.rad + 2)) continue;
        const lx = dx * b.axx + dz * b.axz;
        const lz = dx * b.azx + dz * b.azz;
        if (Math.abs(lx) <= b.hx + 1 && Math.abs(lz) <= b.hz + 1 && feetY >= b.top - 2)
            h = Math.max(h, b.top);
    }
    return h;
}

// Dorong keluar dari silinder pejal {x,z,r} (batang pohon dsb). Murni horizontal.
export function resolveCylinders(pos, radius, cylinders) {
    for (let i = 0; i < cylinders.length; i++) {
        const t = cylinders[i];
        const dx = pos.x - t.x, dz = pos.z - t.z;
        const minD = t.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = t.x + dx / d * minD;
            pos.z = t.z + dz / d * minD;
        }
    }
}
