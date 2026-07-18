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
import { robots } from '../../core/state.js';
import { PAL } from '../../world/palette.js';

const OPEN_DIST = 48;    // jarak (unit) player/robot memicu buka
const OPEN_TIME = 0.45;  // detik buka/tutup penuh
const GREEN = 0x39ff7a;  // hijau "bisa dibuka" (senada lampu EXIT)

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

        // --- LAMPU HIJAU di kedua sisi (di ATAS tembok jamb) = penanda bisa dibuka ---
        const jamb = ew
            ? [cellFn(d.c0, d.r0 - 1), cellFn(d.c1, d.r1 + 1)]
            : [cellFn(d.c0 - 1, d.r0), cellFn(d.c1 + 1, d.r1)];
        for (const j of jamb) {
            const g = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 5), greenMat);
            g.position.set(j.x, H + 1, j.z);                     // pad hijau di puncak tembok samping
            scene.add(g);
        }

        doors.push({ panel, cx, cz, closedY, openY, open: 0 });
    }
    return doors;
}

// Animasi pintu tiap frame (dari updateMode stage). Buka bila player ATAU robot
// mana pun < OPEN_DIST dari pusat pintu; jika tidak, tutup. Ease-in-out halus.
export function updateStageDoors(doors, dt) {
    if (!doors || !doors.length) return;
    const px = camera.position.x, pz = camera.position.z, d2 = OPEN_DIST * OPEN_DIST;
    const step = dt / OPEN_TIME;
    for (const dr of doors) {
        let near = (px - dr.cx) ** 2 + (pz - dr.cz) ** 2 < d2;
        if (!near) {
            for (const z of robots) {
                const m = z.mesh; if (!m) continue;
                if ((m.position.x - dr.cx) ** 2 + (m.position.z - dr.cz) ** 2 < d2) { near = true; break; }
            }
        }
        const target = near ? 1 : 0;
        if (dr.open < target) dr.open = Math.min(target, dr.open + step);
        else if (dr.open > target) dr.open = Math.max(target, dr.open - step);
        const t = dr.open, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;   // easeInOut
        dr.panel.position.y = dr.closedY + (dr.openY - dr.closedY) * e;
    }
}
