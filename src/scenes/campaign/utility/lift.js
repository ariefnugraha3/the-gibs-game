// UTIL: LIFT (elevator) — entity kabin lift REUSABLE lintas stage 1/2/3 (2026-07-22,
// permintaan user: pisahkan jadi entity sendiri agar BENTUK, UKURAN, & PENEMPATAN
// KONSISTEN; SEMUA stage pakai SEPASANG lift KIRI-KANAN spt stage 1). SATU bentuk
// kabin dipakai semua — hanya beda STATE pintu: `open:true` = pintu TERGESER
// TERBUKA + interior teal menyala (stage 2 finish & stage 3 entry, bisa dimasuki),
// `open:false` = pintu TERTUTUP + tombol panggil (stage 1 lift RUSAK, dekor solid).
// Orientasi KANONIK lokal: pintu menghadap +x (TIMUR), badan kabin memanjang dari
// tembok (x≈0) ke muka pintu (x=DEPTH); arah nyata via `facing` (rotation.y).
// `buildLiftBank` = SEPASANG unit ber-offset tegak lurus arah hadap (kiri-kanan).
// Semua Lambert/Basic (warm, tanpa recompile). GIBS-2045: gunmetal/steel + teal.

import { PAL } from '../../../world/palette.js';

// UKURAN KANONIK (dipakai SEMUA lift → konsisten). CARW = lebar bukaan pintu,
// DEPTH = kedalaman kabin (nyembul dari tembok), GAP = jarak pusat antar unit sepasang.
export const LIFT = { CARW: 22, DEPTH: 15, GAP: 30 };

const YAW = { east: 0, north: Math.PI / 2, west: Math.PI, south: -Math.PI / 2 };

function box(g, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    if (shadow) m.castShadow = true;
    g.add(m);
    return m;
}

// Bangun SATU unit kabin lift. opts:
//   facing : arah pintu ('east' default | 'north' | 'west' | 'south')
//   H      : tinggi plafon (default 22)
//   open   : pintu terbuka + interior menyala (default true) | tertutup (rusak)
export function buildLift({ facing = 'east', H = 22, open = true } = {}) {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const doorMat = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const tealMat = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const W = LIFT.CARW, D = LIFT.DEPTH;

    box(g, frameMat, 1.4, H, W + 2, 0.7, H / 2, 0);                     // dinding belakang (di tembok, x≈0)
    box(g, tealMat, D, 0.7, W, D / 2, H - 1, 0, false);                 // langit teal (plafon kabin)
    box(g, doorMat, D - 1, 0.4, W - 1, D / 2, 0.25, 0, false);          // lantai kabin
    if (open) box(g, tealMat, 0.5, H * 0.66, W - 3, 1.6, H * 0.45, 0, false);   // strip interior menyala (tampak saat terbuka)
    for (const s of [-1, 1]) box(g, frameMat, 1.4, H, 1.6, D, H / 2, s * (W / 2 - 0.2));   // tiang bingkai pintu (muka)
    if (open) {
        for (const s of [-1, 1]) box(g, doorMat, 1, H * 0.85, 5, D, H * 0.44, s * (W / 2 - 2.8));   // dua daun TERGESER ke sisi
    } else {
        for (const s of [-1, 1]) box(g, doorMat, 1, H * 0.85, W / 2 - 0.6, D, H * 0.44, s * (W / 4));   // dua daun TERTUTUP (rapat tengah)
        box(g, frameMat, 1.2, H * 0.85, 0.7, D + 0.1, H * 0.44, 0);     // seam tengah
        box(g, tealMat, 0.6, 1.6, 0.9, D + 0.1, H * 0.42, W / 2 + 1.4, false);   // tombol panggil (sisi)
    }
    box(g, tealMat, 0.9, 1.2, W * 0.55, D - 0.3, H * 0.9, 0, false);    // indikator lantai (ambang atas)
    g.rotation.y = YAW[facing];
    return g;
}

// Bangun SEPASANG lift (kiri-kanan) — dua unit ber-offset ±gap/2 TEGAK LURUS arah
// hadap (hadap timur/barat → offset sepanjang z; hadap utara/selatan → sepanjang x).
// Origin group = muka tembok (di tengah pasangan); pemanggil menaruh + (stage 1)
// mendaftarkan blocker via liftBankFootprint.
export function buildLiftBank({ facing = 'east', H = 22, open = true, gap = LIFT.GAP } = {}) {
    const parent = new THREE.Group();
    const alongZ = (facing === 'east' || facing === 'west');
    for (const s of [-1, 1]) {
        const unit = buildLift({ facing, H, open });
        if (alongZ) unit.position.z = s * gap / 2; else unit.position.x = s * gap / 2;
        parent.add(unit);
    }
    return parent;
}

// Footprint blocker SEPASANG lift (utk stage yg solid, mis. stage 1) relatif origin
// bank: pusat bergeser DEPTH/2 ke arah hadap; hx/hz = setengah bentang.
export function liftBankFootprint(facing, gap = LIFT.GAP) {
    const along = LIFT.DEPTH / 2 + 1, across = (gap + LIFT.CARW) / 2 + 1;
    switch (facing) {
        case 'west': return { cx: -LIFT.DEPTH / 2, cz: 0, hx: along, hz: across };
        case 'north': return { cx: 0, cz: -LIFT.DEPTH / 2, hx: across, hz: along };
        case 'south': return { cx: 0, cz: LIFT.DEPTH / 2, hx: across, hz: along };
        default: return { cx: LIFT.DEPTH / 2, cz: 0, hx: along, hz: across };   // east
    }
}
