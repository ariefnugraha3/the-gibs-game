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

// ===== INDEKS SPASIAL BLOCKER (dibagi-pakai, 2026-08-13) =====================
// `resolveBlockers`/`blockersGroundHeight` menyapu SELURUH daftar tiap panggilan,
// dan pemanggilnya bukan cuma player: tiap robot memanggilnya lewat AI, clamp,
// dan separasi. Di interior padat (stage 1 = 200+ blocker, stage 2 = 250+) itu
// puluhan ribu uji AABB per frame untuk balok yang letaknya TAK PERNAH berubah.
//
// Pola ini pertama kali dipakai di Stage 6 HQ (optimasi 2026-08-12) dan kini
// menjadi satu implementasi bersama: sebar tiap blocker ke SEMUA sel kisi yang
// disinggung AABB-nya, lalu query hanya menyentuh sel yang benar-benar
// bersinggungan dengan kotak (pos ± radius). Kalau sebuah blocker berada dalam
// jangkauan, kedua kotak pasti berbagi minimal satu sel — jadi hasilnya identik
// dengan sapuan penuh. Stempel `mark` mencegah blocker lebar terpakai dua kali
// dalam satu query.
//
// `rebuild()` WAJIB dipanggil ulang setiap daftar blocker berubah (mis. mesin
// spawn yang dipasang/dicabut); di luar itu daftarnya statis.
export function makeBlockerIndex(blockers, opts = {}) {
    const cell = opts.cell > 0 ? opts.cell : 28;
    const x0 = opts.x0 || 0, z0 = opts.z0 || 0;
    const cells = new Map();
    const gathered = [];
    let stamp = 0;
    // `resolveBlockers` MENGGESER pos sambil berjalan, jadi sebuah balok yang
    // semula di luar kotak query bisa ikut bekerja sesudah dorongan pertama.
    // Kotak query karena itu diberi marjin sebesar setengah-rusuk TERBESAR di
    // dunia itu. Marjin yang lebih ketat (`min(hx,hz)`, dgn alasan "dorongan
    // selalu lewat sisi terkecil") SUDAH DICOBA dan DITOLAK: dorongan beruntun
    // dari beberapa balok bertumpuk bisa melebihi satu dorongan tunggal, dan
    // uji paritas 20.000 titik langsung menemukan 3 titik yang meleset. Paritas
    // dengan sapuan penuh adalah syaratnya, bukan kecepatan maksimum.
    let pad = 0;
    const key = (gx, gz) => gx * 4096 + gz;
    function rebuild() {
        cells.clear();
        // Urutan DAFTAR dicatat: dorongan keluar bersifat berurutan, jadi sebuah
        // titik yang berada di dalam dua balok mendarat di tempat berbeda kalau
        // urutannya berubah. Query mengembalikan hasil yang SUDAH diurutkan ulang
        // ke urutan daftar asli, sehingga indeks ini benar-benar identik dengan
        // sapuan penuh — bukan sekadar "mirip".
        pad = 0;
        for (let i = 0; i < blockers.length; i++) {
            blockers[i].order = i;
            pad = Math.max(pad, blockers[i].hx, blockers[i].hz);
        }
        for (const b of blockers) {
            const gx0 = Math.floor((b.x - b.hx - x0) / cell), gx1 = Math.floor((b.x + b.hx - x0) / cell);
            const gz0 = Math.floor((b.z - b.hz - z0) / cell), gz1 = Math.floor((b.z + b.hz - z0) / cell);
            for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
                const k = key(gx, gz);
                let list = cells.get(k);
                if (!list) { list = []; cells.set(k, list); }
                list.push(b);
            }
        }
    }
    // Belum di-index (dunia baru dibangun) = kembalikan daftar penuh: benar,
    // hanya lambat — jangan pernah mengembalikan hasil kosong yang salah.
    // `moving` = pemanggil akan MENGGESER titiknya (resolveBlockers) sehingga
    // marjin `pad` wajib; query titik murni (tinggi lantai, LOS) memakai false
    // dan karenanya jauh lebih sempit.
    function gather(x, z, radius = 0, moving = true) {
        if (!cells.size) return blockers;
        gathered.length = 0;
        const s = ++stamp;
        const reach = radius + (moving ? pad : 0);
        const gx0 = Math.floor((x - reach - x0) / cell), gx1 = Math.floor((x + reach - x0) / cell);
        const gz0 = Math.floor((z - reach - z0) / cell), gz1 = Math.floor((z + reach - z0) / cell);
        for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
            const list = cells.get(key(gx, gz));
            if (!list) continue;
            for (const b of list) {
                if (b.mark === s) continue;
                b.mark = s;
                // Sisip terurut (daftar hasil query hanya berisi segelintir
                // balok, jadi insertion sort lebih murah daripada Array.sort).
                let j = gathered.length;
                gathered.push(b);
                while (j > 0 && gathered[j - 1].order > b.order) {
                    gathered[j] = gathered[j - 1]; gathered[j - 1] = b; j--;
                }
            }
        }
        return gathered;
    }
    return { rebuild, gather, debug: () => ({ cells: cells.size, blockers: blockers.length, cell, pad }) };
}
