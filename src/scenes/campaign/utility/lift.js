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
    
    // Tambahan: Material panel gelap untuk kesan futuristik & dimensi dalam (TANPA recompile)
    const darkPanelMat = new THREE.MeshLambertMaterial({ color: 0x050508 }); 
    
    const W = LIFT.CARW, D = LIFT.DEPTH;

    // 1. STRUKTUR BELAKANG & DINDING SAMPING (Penutup Bocor)
    box(g, frameMat, 1.4, H, W + 2, 0.7, H / 2, 0);                                   // dinding belakang
    box(g, darkPanelMat, 0.6, H - 4, W - 4, 1.2, H / 2, 0, false);                    // panel gelap dalam (inset)
    box(g, tealMat, 0.5, H - 8, 0.4, 1.3, H / 2, 0, false);                           // strip neon vertikal belakang
    
    // PENUTUP SAMPING KIRI & KANAN (plat abu-abu agar tidak bolong)
    for (const s of [-1, 1]) {
        box(g, frameMat, D + 0.5, H, 1.2, D / 2, H / 2, s * (W / 2 + 0.1));          // plat besi utama samping
        box(g, darkPanelMat, D - 1, H * 0.5, 0.4, D / 2, H * 0.5, s * (W / 2 + 0.25), false); // jalur panel gelap samping
        box(g, tealMat, D - 1, 0.3, 0.5, D / 2, H * 0.75, s * (W / 2 + 0.3), false);       // strip neon samping
    }

    // 2. LANGIT-LANGIT & LANTAI (Recessed lighting & threshold glow)
    box(g, darkPanelMat, D - 1, 0.6, W - 1, D / 2, H - 0.4, 0, false);                // casing plafon gelap
    box(g, tealMat, D, 0.7, W, D / 2, H - 1, 0, false);                              // strip neon plafon utama
    box(g, tealMat, D - 2, 0.1, W - 2, D / 2, H - 1.4, 0, false);                     // outline neon plafon
    
    box(g, doorMat, D - 1, 0.4, W - 1, D / 2, 0.25, 0, false);                        // lantai kabin
    box(g, tealMat, D - 1, 0.42, 0.5, D / 2, 0.25, 0, false);                         // threshold lantai tengah
    box(g, tealMat, 0.4, 0.42, W - 1, D - 0.5, 0.25, 0, false);                       // threshold lantai depan
    
    // 3. INTERIOR STRIP (Saat pintu terbuka)
    if (open) {
        box(g, tealMat, 0.5, H * 0.66, 0.6, 1.6, H * 0.45, 0, false);                 // strip neon tengah menyala
        box(g, tealMat, 0.5, H * 0.5, 0.3, 1.6, H * 0.4, -W / 3, false);              // strip neon sisi kiri
        box(g, tealMat, 0.5, H * 0.5, 0.3, 1.6, H * 0.4, W / 3, false);               // strip neon sisi kanan
    }

    // 4. TIANG BINGKAI MUKA (Cyber-struts dengan celah neon)
    for (const s of [-1, 1]) {
        box(g, frameMat, 1.8, H, 1.8, D, H / 2, s * (W / 2 - 0.2));                   // tiang bingkai utama (lebih tebal)
        box(g, darkPanelMat, 2.0, H * 0.8, 0.5, D + 0.1, H * 0.45, s * (W / 2 - 0.2), false); // alur tiang
        box(g, tealMat, 2.1, H * 0.6, 0.2, D + 0.2, H * 0.4, s * (W / 2 - 0.2), false);      // strip neon tiang
    }

    // 5. PINTU & MEKANISME HOLOGRAFIK
    if (open) {
        // Pintu terbuka (daun geser ke samping dengan garis neon edge)
        for (const s of [-1, 1]) {
            box(g, doorMat, 1, H * 0.85, 5, D, H * 0.44, s * (W / 2 - 2.8));          // daun pintu
            box(g, tealMat, 1.05, H * 0.85, 0.3, D, H * 0.44, s * (W / 2 - 2.8), false); // neon edge daun pintu
        }
    } else {
        // Pintu tertutup (berpanel dengan garis mekanis & sensor)
        for (const s of [-1, 1]) {
            box(g, doorMat, 1, H * 0.85, W / 2 - 0.6, D, H * 0.44, s * (W / 4));      // daun pintu tertutup
            
            // Detail panel pintu (garir horizontal sci-fi)
            box(g, darkPanelMat, 1.1, H * 0.15, W / 2 - 2, D, H * 0.7, s * (W / 4), false);
            box(g, tealMat, 1.2, 0.3, W / 2 - 2, D, H * 0.7, s * (W / 4), false);     // strip neon atas pintu
            
            box(g, darkPanelMat, 1.1, H * 0.15, W / 2 - 2, D, H * 0.2, s * (W / 4), false);
            box(g, tealMat, 1.2, 0.3, W / 2 - 2, D, H * 0.2, s * (W / 4), false);     // strip neon bawah pintu
            
            // Garis vertikal batas pintu
            box(g, tealMat, 1.1, H * 0.85, 0.2, D, H * 0.44, s * (W / 4 - 0.5), false);
        }
        box(g, frameMat, 1.2, H * 0.85, 0.7, D + 0.1, H * 0.44, 0);                   // seam tengah besi tebal
        
        // Panel & Tombol Panggil Holografik (bukan sekadar kotak biasa)
        box(g, darkPanelMat, 0.8, 3.5, 2.0, D + 0.2, H * 0.4, W / 2 + 1.2, false);    // panel gelam samping
        box(g, tealMat, 0.9, 1.6, 0.9, D + 0.3, H * 0.45, W / 2 + 1.4, false);        // tombol glow utama
        box(g, tealMat, 0.9, 0.4, 0.9, D + 0.3, H * 0.55, W / 2 + 1.4, false);        // status bar atas
    }

    // 6. INDIKATOR LANTAI (Digital Holographic Display di ambang atas)
    box(g, darkPanelMat, 1.0, 3.0, W * 0.6, D - 0.3, H * 0.9, 0, false);             // casing layar gelap
    box(g, tealMat, 1.1, 1.5, W * 0.5, D - 0.2, H * 0.92, 0, false);                 // layar teal menyala
    box(g, frameMat, 1.3, 0.2, W * 0.65, D - 0.2, H * 0.83, 0, false);               // batas besi bawah
    box(g, frameMat, 1.3, 0.2, W * 0.65, D - 0.2, H * 0.98, 0, false);               // batas besi atas

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