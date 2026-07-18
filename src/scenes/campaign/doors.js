// doors.js — PINTU GESER OTOMATIS gedung campaign stage 1-3 (2026-07-18,
// permintaan user). Pintu MELUNCUR TURUN ke bawah lantai saat player (atau
// robot) mendekat = "terbuka otomatis ketika memasuki ruangan", lalu naik lagi
// menutup saat menjauh. LAMPU HIJAU kecil di KEDUA SISI pintu (di atas tembok
// jamb) menandai pintu ini BISA dibuka — nanti akan ada pintu terkunci TANPA
// lampu hijau. Hanya di ruangan TERTUTUP; jangan di aula/koridor tengah.
//
// MURNI DEKOR REAKTIF: TIDAK mengubah collision/nav/BFS (sel doorway di grid
// tetap walkable) — pintu selalu terbuka lebih dulu sebelum dicapai. Material
// Lambert/Basic (sudah dipanaskan preload) → tanpa recompile; tanpa PointLight
// (jumlah lampu tetap) — indikator hijau = MeshBasic emissive-semu.

import { scene, camera } from '../../core/renderer.js';
import { PAL } from '../../world/palette.js';

const OPEN_TIME = 0.45;      // detik buka/tutup penuh
const FRONT_CELLS = 2;       // player HARUS di <= 2 kotak DI DEPAN bukaan (permintaan user 2026-07-18)
const DOOR_SOLID_MAX = 0.5;  // pintu PEJAL (memblok robot) selama open < ini (masih >=1/2 tertutup)
const GREEN = 0x39ff7a;      // hijau "bisa dibuka" (senada lampu EXIT)

// Bangun pintu untuk satu stage.
//   doorList item {c0,r0,c1,r1,dir} — dir 'ew' (celah di dinding VERTIKAL, panel
//   membentang sumbu-z) / 'ns' (celah di dinding HORIZONTAL, panel membentang
//   sumbu-x). Sel doorList = SEL LANTAI bukaan; jamb = sel dinding di kedua ujung.
//   cellFn(c,r)->{x,z}; CELL & H dari konstanta stage.
export function buildStageDoors(doorList, cellFn, CELL, H) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });   // panel matte (tak silau)
    const seamMat = new THREE.MeshLambertMaterial({ color: PAL.ink });        // seam tengah gelap
    const tealMat = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const greenMat = new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });
    const doors = [];

    for (const d of doorList) {
        const a = cellFn(d.c0, d.r0), b = cellFn(d.c1, d.r1);
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        const ew = d.dir === 'ew';
        const span = ew ? (Math.abs(d.r1 - d.r0) + 1) * CELL : (Math.abs(d.c1 - d.c0) + 1) * CELL;
        const w = span + 0.6, thick = 3.2;                       // lebar menutup celah + seal tipis

        // --- PANEL (grup; digeser .position.y untuk buka/tutup) ---
        const panel = new THREE.Group();
        const body = new THREE.Mesh(
            ew ? new THREE.BoxGeometry(thick, H, w) : new THREE.BoxGeometry(w, H, thick), bodyMat);
        body.castShadow = true; body.receiveShadow = true;
        panel.add(body);
        // seam vertikal tengah (kesan pintu dua daun)
        const seam = new THREE.Mesh(
            ew ? new THREE.BoxGeometry(thick + 0.3, H, 0.7) : new THREE.BoxGeometry(0.7, H, thick + 0.3), seamMat);
        panel.add(seam);
        // dua garis aksen TEAL horizontal (menyala, dua muka)
        for (const ay of [H * 0.66, H * 0.34]) {
            const acc = new THREE.Mesh(
                ew ? new THREE.BoxGeometry(thick + 0.4, 1.3, w * 0.9) : new THREE.BoxGeometry(w * 0.9, 1.3, thick + 0.4), tealMat);
            acc.position.y = ay - H / 2;
            panel.add(acc);
        }
        const closedY = H / 2, openY = -H / 2 - 1;               // turun sampai tenggelam di lantai
        panel.position.set(cx, closedY, cz);
        scene.add(panel);

        // --- LAMPU HIJAU KECIL di MUKA tembok = penanda pintu bisa dibuka.
        //     2026-07-18 (permintaan user): dipindah dari PUNCAK tembok ke kedua
        //     MUKA jamb — DEPAN (+) & BELAKANG (−) — dan DIPERKECIL. Tiap jamb
        //     dapat 2 lampu (satu tiap muka) → keempat titik pintu bertanda. ---
        const jamb = ew
            ? [cellFn(d.c0, d.r0 - 1), cellFn(d.c1, d.r1 + 1)]
            : [cellFn(d.c0 - 1, d.r0), cellFn(d.c1 + 1, d.r1)];
        const halfC = CELL / 2, lampY = H * 0.55;   // tinggi lampu ~tengah muka tembok
        for (const j of jamb) {
            for (const s of [-1, 1]) {               // dua MUKA tembok: depan & belakang
                const g = new THREE.Mesh(
                    ew ? new THREE.BoxGeometry(0.5, 2.2, 1.3) : new THREE.BoxGeometry(1.3, 2.2, 0.5),
                    greenMat);
                g.position.set(
                    ew ? j.x + s * (halfC + 0.25) : j.x,
                    lampY,
                    ew ? j.z : j.z + s * (halfC + 0.25));
                scene.add(g);
            }
        }

        doors.push({
            panel, cx, cz, closedY, openY, open: 0,
            ew,                                    // orientasi: true = dinding vertikal (masuk dari ±x)
            perpMax: (FRONT_CELLS + 0.5) * CELL,   // tegak-lurus dinding: <= 2 kotak di depan (+ tepi sel)
            paraMax: span / 2 + CELL * 0.4,        // sejajar dinding: dalam lebar bukaan (+ sedikit margin)
            hx: ew ? thick / 2 : w / 2,            // setengah-footprint daun pintu (blok robot saat tutup)
            hz: ew ? w / 2 : thick / 2,
        });
    }
    return doors;
}

// Animasi pintu tiap frame (dari updateMode stage). HANYA PLAYER yang membuka
// (robot TIDAK), dan hanya bila player berada dalam ZONA "2 kotak di depan"
// pintu: <= perpMax tegak-lurus dinding (2 sel) DAN <= paraMax sejajar dinding
// (selebar bukaan). Di luar zona → pintu SELALU tertutup. Ease-in-out halus.
export function updateStageDoors(doors, dt) {
    if (!doors || !doors.length) return;
    const px = camera.position.x, pz = camera.position.z;   // camera = pivot logika player
    const step = dt / OPEN_TIME;
    for (const dr of doors) {
        const dx = px - dr.cx, dz = pz - dr.cz;
        const perp = dr.ew ? Math.abs(dx) : Math.abs(dz);   // tegak-lurus dinding (arah masuk pintu)
        const para = dr.ew ? Math.abs(dz) : Math.abs(dx);   // sejajar dinding (lebar bukaan)
        const near = perp <= dr.perpMax && para <= dr.paraMax;
        const target = near ? 1 : 0;
        if (dr.open < target) dr.open = Math.min(target, dr.open + step);
        else if (dr.open > target) dr.open = Math.max(target, dr.open - step);
        const t = dr.open, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;   // easeInOut
        dr.panel.position.y = dr.closedY + (dr.openY - dr.closedY) * e;
    }
}

// Dorong sebuah lingkaran (pos.x,pos.z, radius) KELUAR dari footprint pintu yang
// masih TERTUTUP (open < DOOR_SOLID_MAX). Dipakai kolisi ROBOT: robot TIDAK bisa
// menembus pintu tertutup (2026-07-18, permintaan user) — pintu hanya dibuka
// player, jadi robot terhalang daun pintu persis seperti tembok. Dorong sepanjang
// sumbu penetrasi TERKECIL (biasanya tegak-lurus daun tipis → mundur ke ruangan).
// Player TIDAK diblok (dia yang membuka pintu; footprint ⊂ zona buka → selalu
// terbuka saat player menyentuhnya) sehingga tak pernah terjepit.
export function resolveDoors(doors, pos, radius) {
    if (!doors) return;
    for (const dr of doors) {
        if (dr.open >= DOOR_SOLID_MAX) continue;              // sudah cukup terbuka → tembus
        const ex = dr.hx + radius, ez = dr.hz + radius;
        const dx = pos.x - dr.cx, dz = pos.z - dr.cz;
        if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) continue;   // di luar footprint
        const ox = ex - Math.abs(dx), oz = ez - Math.abs(dz);     // penetrasi tiap sumbu
        if (ox < oz) pos.x = dr.cx + (dx < 0 ? -ex : ex);         // dorong sumbu-x
        else pos.z = dr.cz + (dz < 0 ? -ez : ez);                 // dorong sumbu-z
    }
}
