// doors.js — PINTU GESER OTOMATIS campaign (2026-07-18, dirombak 2026-08-08).
// Setiap pintu aktif terdiri dari DUA DAUN 50:50 yang bergeser simetris ke kiri
// dan kanan sepanjang dinding saat membuka, lalu bertemu lagi saat menutup.
// Terbuka penuh TIDAK menelan daunnya bulat-bulat ke dalam dinding: 10% tiap
// daun tetap terlihat di tepi bukaan (`DOOR_OPEN_REVEAL`, lihat rig di bawah).
// LAMPU HIJAU kecil di KEDUA SISI pintu (di atas tembok
// jamb) menandai pintu ini BISA dibuka — nanti akan ada pintu terkunci TANPA
// lampu hijau. Hanya di ruangan TERTUTUP; jangan di aula/koridor tengah.
//
// MURNI DEKOR REAKTIF: TIDAK mengubah collision/nav/BFS (sel doorway di grid
// tetap walkable) — pintu selalu terbuka lebih dulu sebelum dicapai. Material
// Lambert/Basic (sudah dipanaskan preload) → tanpa recompile; tanpa PointLight
// (jumlah lampu tetap) — indikator hijau = MeshBasic emissive-semu.

import { CFG } from '../../../core/config.js';
import { scene, camera } from '../../../core/renderer.js';
import { PAL } from '../../../world/palette.js';
import { playSFX, sfxDoorOpen, sfxDoorClose } from '../../../utils/sfx.js';

// ===== SFX PINTU BERSAMA (2026-08-07, permintaan user) ======================
// SATU pintu masuk audio untuk SELURUH pintu di stage mana pun: pintu geser
// stage 1-3 (updateStageDoors di bawah), pintu blast stage 3, pintu stasiun
// stage 5, dan pintu stage 6. Jangan memanggil playSFX pintu dari tempat lain —
// menaruhnya di sini yang membuat aturan "semua pintu berbunyi sama" tak bisa
// bocor saat stage baru ditambahkan.
//   door-open   : saat daun MULAI bergerak membuka.
//   door-closed : saat daun benar-benar MENDARAT tertutup.
// Digerbang jarak: pintu di ujung gedung tak boleh ikut terdengar, dan
// volumenya meredup mengikuti jarak (pola yang sama dgn tembakan robot).
const DOOR_HEAR = 340;
let doorSfx = { open: 0, close: 0, last: null };
export const doorSfxDebug = () => ({ ...doorSfx });
export const resetDoorSfx = () => { doorSfx = { open: 0, close: 0, last: null }; };

export function playDoorSFX(opening, x, z) {
    const d = Math.hypot(camera.position.x - x, camera.position.z - z);
    if (d > DOOR_HEAR) return false;
    const clip = opening ? sfxDoorOpen : sfxDoorClose;
    playSFX(clip, 0.6 * (1 - d / DOOR_HEAR));
    doorSfx[opening ? 'open' : 'close']++;
    doorSfx.last = clip.src || null;
    return true;
}

// Pemicu untuk loop animasi pintu MANA PUN: simpan `open` frame lalu dan panggil
// ini sesudah memperbaruinya.
//
// Gerbangnya adalah PERLINTASAN AMBANG tertutup<->terbuka, BUKAN arah gerak
// per-frame (bugfix 2026-08-07, laporan user "suara pintu terbuka dijalankan
// berkali-kali saat pintu terbuka, audionya menumpuk"). Integrator pintu boleh
// bergetar di sekitar target — mis. `dir` yang tak pernah nol membuat `open`
// naik-turun 0.965<->1 tiap frame — dan pemicu berbasis arah akan membunyikan
// klip 30x/detik. Berbasis ambang, satu kali buka = SATU bunyi, apa pun yang
// terjadi di antaranya. Stateless: reset stage yang menulis `open = 0` langsung
// juga tidak bisa memicu bunyi palsu karena prev-nya ikut 0.
export function doorMotionSFX(dr, prev, x, z) {
    const now = dr.open > 1e-4, was = prev > 1e-4;
    if (now === was) return;
    playDoorSFX(now, x, z);
}

const OPEN_TIME = 0.45;      // detik buka/tutup penuh
const FRONT_CELLS = 2;       // player HARUS di <= 2 kotak DI DEPAN bukaan (permintaan user 2026-07-18)
// PINTU RUSAK (2026-08-12, legenda '+' denah Stage 1): pintu yang TIDAK PERNAH
// bisa dibuka — bukan "terkunci sampai objektif selesai", melainkan macet
// permanen. Dia memakai rig dua-daun yang sama supaya tetap terbaca sebagai
// PINTU (bukan tembok), tapi dipaku pada bukaan kecil ini dan dilewati
// updateStageDoors sepenuhnya: daunnya tak pernah bergerak, jadi tak pernah ada
// bunyi buka/tutup. 0.14 < DOOR_SOLID_MAX, jadi resolveDoors/doorsWalkable tetap
// memperlakukannya PEJAL untuk player maupun robot; celahnya (~1 unit) hanya
// cukup untuk terlihat macet, bukan untuk dilewati peluru.
export const DOOR_BROKEN_AJAR = 0.14;
const DOOR_SOLID_MAX = 0.5;  // pintu PEJAL (memblok robot) selama open < ini (masih >=1/2 tertutup)
const GREEN = 0x39ff7a;      // hijau "bisa dibuka" (senada lampu EXIT)
const LOCK_RED = 0xff4a3c;   // merah "TERKUNCI" (varian pintu terkunci, mis. ruang komputer stage 1)
export const DOOR_OPEN_COLOR = GREEN;
export const DOOR_LOCKED_COLOR = LOCK_RED;

export function setDoorSideLightState(lights, canOpen) {
    const color = canOpen ? GREEN : LOCK_RED;
    for (const lamp of lights || []) lamp.material.color.setHex(color);
}

// ===== STANDAR GERAK + ZONA PINTU =========================================
// Stage 1 adalah patokan semua pintu geser aktif campaign. Stage lain boleh
// memiliki aturan cerita sendiri untuk target buka, tetapi integrator, easing,
// zona player, dan jeda tutupnya harus lewat helper yang sama.
export function doorEasedOpen(open) {
    const t = Math.max(0, Math.min(1, open));
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function doorGeometry(dr) {
    const blocker = dr.blocker || {};
    const horizontal = dr.rig?.horizontal ?? !dr.ew;
    return {
        cx: dr.cx ?? blocker.x,
        cz: dr.cz ?? blocker.z,
        ew: dr.ew ?? !horizontal,
        hx: dr.hx ?? blocker.hx,
        hz: dr.hz ?? blocker.hz,
        span: dr.rig?.span ?? 0,
    };
}

export function doorNearPlayer(dr, px, pz, CELL) {
    const g = doorGeometry(dr);
    const perp = g.ew ? Math.abs(px - g.cx) : Math.abs(pz - g.cz);
    const para = g.ew ? Math.abs(pz - g.cz) : Math.abs(px - g.cx);
    const perpMax = dr.perpMax ?? (FRONT_CELLS + 0.5) * CELL;
    const paraMax = dr.paraMax ?? g.span / 2 + CELL * 0.4;
    return perp <= perpMax && para <= paraMax;
}

// Menghasilkan target otomatis Stage 1: buka saat player masuk zona, lalu
// tetap terbuka selama closeDelaySec setelah player keluar zona.
export function doorProximityTarget(dr, dt, px, pz, CELL, canOpen = true) {
    if (!canOpen) { dr.linger = 0; return 0; }
    const near = doorNearPlayer(dr, px, pz, CELL);
    const closeDelay = CFG.campaign.doors.closeDelaySec;
    if (near) dr.linger = closeDelay;
    else if (dr.linger > 0) dr.linger = Math.max(0, dr.linger - dt);
    return near || dr.linger > 0 ? 1 : 0;
}

export function updateDoorMotion(dr, dt, target) {
    dr.target = target;
    const prev = dr.open, step = dt / OPEN_TIME;
    dr.open = dr.open < target ? Math.min(target, dr.open + step)
        : Math.max(target, dr.open - step);
    const g = doorGeometry(dr);
    doorMotionSFX(dr, prev, g.cx, g.cz);
    setSplitDoorOpen(dr.rig, doorEasedOpen(dr.open));
}

// ===== RIG DUA DAUN 50:50 BERSAMA =========================================
// Dipakai pintu stage 1-3, blast door stage 3, stasiun stage 5, dan kedua
// chapter stage 6. `horizontal` berarti bukaan memanjang di sumbu X; selain itu
// memanjang di Z. Daun berada di 1/4 bentang ketika tertutup lalu bergeser ke
// arah berlawanan ketika membuka.
//
// SISA TAMPAK (2026-08-08, permintaan user "saat pintu terbuka seperti terlihat
// masuk menembus tembok"): dulu jarak gesernya PERSIS sepanjang daun, jadi
// terbuka penuh = daun hilang total di balik dinding dan pintunya seolah lenyap.
// Sekarang daun hanya bergeser `1 - DOOR_OPEN_REVEAL` dari panjangnya, sehingga
// 10% tiap daun TETAP menonjol di tepi kiri/kanan bukaan. Konsekuensinya bukaan
// efektif menyempit 10% (5% tiap sisi) — disengaja, itu yang membuat pintunya
// terbaca. Angkanya visual-only (seperti OPEN_TIME), jadi tetap di kode, tapi
// DIEKSPOR supaya smoke tak perlu menyalin 0.1.
export const DOOR_OPEN_REVEAL = 0.1;

// `opts.headRail` (2026-08-09, laporan user Stage 5: "di atas pintu gerbong ada
// besi yang melintang dan kepala major gibran menembus itu"): palang kepala yang
// dulu bagian dari KUSEN DIAM kini boleh menjadi bagian DAUN — separuh palang
// menempel pada masing-masing daun, jadi ia ikut menyingkir saat pintu terbuka.
// Wajib untuk pintu yang dindingnya lebih rendah daripada tinggi orang (gondola
// Stage 5): apa pun yang melintang di atas bukaan akan menembus kepala avatar.
// Opsional, jadi pintu Stage 1-3/6 (bukaan setinggi dinding) tidak berubah.
//   { mat, h, t, overhang }  — material, tebal palang, tebal arah bukaan, dan
//   berapa jauh palang menjorok melewati tepi daun.
export function buildSplitDoor(parent, material, x, y, z, sx, sy, sz, opts = {}) {
    const panel = new THREE.Group();
    panel.position.set(x, y, z);
    parent.add(panel);
    const horizontal = sx >= sz;
    const span = horizontal ? sx : sz;
    const leafSpan = span / 2;
    const leaves = [];
    const rail = opts.headRail || null;
    for (const sign of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(
            horizontal ? leafSpan : sx, sy, horizontal ? sz : leafSpan), material);
        leaf.castShadow = true; leaf.receiveShadow = true;
        leaf.position[horizontal ? 'x' : 'z'] = sign * span / 4;
        panel.add(leaf);
        leaves.push(leaf);
        if (!rail) continue;
        // Menjorok HANYA ke sisi luar bukaan: dua separuh palang bertemu rapat
        // di tengah saat tertutup, tanpa saling menembus.
        const over = rail.overhang || 0, len = leafSpan + over;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(
            horizontal ? len : rail.t, rail.h, horizontal ? rail.t : len),
        rail.mat || material);
        bar.castShadow = true; bar.receiveShadow = true;
        bar.position.y = sy / 2 + rail.h / 2;
        bar.position[horizontal ? 'x' : 'z'] = sign * over / 2;
        leaf.add(bar);
    }
    return { panel, leaves, horizontal, span, leafSpan, travel: leafSpan * (1 - DOOR_OPEN_REVEAL) };
}

// Lampu status untuk pintu yang dibangun di luar `buildStageDoors` (Stage 5
// dan Stage 6). Polanya sengaja sama dengan Stage 1: dua kusen kiri/kanan,
// masing-masing terlihat dari kedua muka tembok; tidak ada panel lampu di atas
// bukaan yang membuat pintu tampak seperti plafon.
export function buildDoorSideLights(parent, x, z, sx, sz, cell, wallH, material) {
    const horizontal = sx >= sz;
    const span = horizontal ? sx : sz;
    const jambOffset = span / 2 + cell / 2;
    const faceOffset = cell / 2 + 0.25;
    const lights = [];
    for (const side of [-1, 1]) {
        for (const face of [-1, 1]) {
            const lamp = new THREE.Mesh(
                horizontal ? new THREE.BoxGeometry(1.3, 2.2, 0.5)
                    : new THREE.BoxGeometry(0.5, 2.2, 1.3),
                material);
            lamp.position.set(
                horizontal ? x + side * jambOffset : x + face * faceOffset,
                wallH * 0.55,
                horizontal ? z + face * faceOffset : z + side * jambOffset);
            parent.add(lamp);
            lights.push(lamp);
        }
    }
    return lights;
}

// Jarak pusat daun dari pusat bukaan pada bukaan ter-ease `easedOpen`. SATU-
// SATUNYA sumber posisi daun: dipakai animasi visual DAN uji peluru-vs-daun,
// supaya keduanya tidak bisa berbeda (dulu rumusnya disalin di dua tempat).
export function splitDoorLeafOffset(door, easedOpen) {
    if (!door) return 0;
    const e = Math.max(0, Math.min(1, easedOpen));
    const leafSpan = door.leafSpan != null ? door.leafSpan : door.span / 2;
    const travel = door.travel != null ? door.travel : leafSpan * (1 - DOOR_OPEN_REVEAL);
    return door.span / 4 + travel * e;
}

export function setSplitDoorOpen(door, easedOpen) {
    if (!door || !door.leaves) return;
    const off = splitDoorLeafOffset(door, easedOpen);
    const axis = door.horizontal ? 'x' : 'z';
    for (let i = 0; i < door.leaves.length; i++) door.leaves[i].position[axis] = (i ? 1 : -1) * off;
}

export const splitDoorDebug = door => ({
    horizontal: !!door?.horizontal,
    span: door?.span || 0,
    leafSpan: door?.leafSpan || 0,
    travel: door?.travel || 0,
    leaves: door?.leaves?.map(l => ({ x: l.position.x, y: l.position.y, z: l.position.z })) || [],
    // Palang kepala opsional yang MENEMPEL pada daun: ofsetnya sepanjang sumbu
    // bukaan harus bergerak bersama daunnya (lihat `opts.headRail`).
    rails: door?.leaves?.map(l => {
        const bar = l.children && l.children[0];
        if (!bar) return null;
        const ax = door.horizontal ? 'x' : 'z';
        return { off: l.position[ax] + bar.position[ax], y: l.position.y + bar.position.y };
    }) || [],
});

// Bangun pintu untuk satu stage.
//   doorList item {c0,r0,c1,r1,dir} — dir 'ew' (celah di dinding VERTIKAL, panel
//   membentang sumbu-z) / 'ns' (celah di dinding HORIZONTAL, panel membentang
//   sumbu-x). Sel doorList = SEL LANTAI bukaan; jamb = sel dinding di kedua ujung.
//   cellFn(c,r)->{x,z}; CELL & H dari konstanta stage.
// `parent` (2026-08-13): root dunia stage. Default `scene` supaya pemanggil lama
// tak berubah; stage yang punya root sendiri mengirimkannya agar pintunya ikut
// disembunyikan bersama dunianya.
export function buildStageDoors(doorList, cellFn, CELL, H, parent = null) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });   // panel matte (tak silau)
    const seamMat = new THREE.MeshLambertMaterial({ color: PAL.ink });        // seam tengah gelap
    const tealMat = new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false });
    const greenMat = new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });
    const doors = [];

    for (const d of doorList) {
        const broken = !!d.broken;                 // '+' denah: macet permanen (selalu terkunci)
        const locked = broken || !!d.locked;
        const a = cellFn(d.c0, d.r0), b = cellFn(d.c1, d.r1);
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        const ew = d.dir === 'ew';
        const span = ew ? (Math.abs(d.r1 - d.r0) + 1) * CELL : (Math.abs(d.c1 - d.c0) + 1) * CELL;
        const w = span + 0.6, thick = 3.2;                       // lebar menutup celah + seal tipis

        // --- DUA DAUN 50:50: bergeser sejajar dinding ke arah berlawanan. ---
        const rig = buildSplitDoor(parent || scene, bodyMat, cx, H / 2, cz,
            ew ? thick : w, H, ew ? w : thick);
        const panel = rig.panel;
        for (let i = 0; i < rig.leaves.length; i++) {
            const leaf = rig.leaves[i], sign = i ? 1 : -1;
            // Strip gelap di tepi dalam memperjelas pertemuan kedua daun.
            const seam = new THREE.Mesh(
                ew ? new THREE.BoxGeometry(thick + 0.3, H, 0.7) : new THREE.BoxGeometry(0.7, H, thick + 0.3), seamMat);
            seam.position[ew ? 'z' : 'x'] = -sign * (rig.leafSpan / 2 - 0.35);
            leaf.add(seam);
            // Dua garis aksen TEAL horizontal ikut bergerak bersama tiap daun.
            for (const ay of [H * 0.66, H * 0.34]) {
                const acc = new THREE.Mesh(
                    ew ? new THREE.BoxGeometry(thick + 0.4, 1.3, rig.leafSpan * 0.86)
                        : new THREE.BoxGeometry(rig.leafSpan * 0.86, 1.3, thick + 0.4), tealMat);
                acc.position.y = ay - H / 2;
                leaf.add(acc);
            }
        }

        // --- LAMPU KECIL di MUKA tembok = penanda status pintu. HIJAU = bisa
        //     dibuka; MERAH (d.locked, mis. ruang komputer stage 1) = TERKUNCI
        //     sampai objektif selesai (setDoorLocked mengubahnya jadi hijau).
        //     2026-07-18 (permintaan user): dipindah dari PUNCAK tembok ke kedua
        //     MUKA jamb — DEPAN (+) & BELAKANG (−) — dan DIPERKECIL. Tiap jamb
        //     dapat 2 lampu (satu tiap muka) → keempat titik pintu bertanda. ---
        const litMat = locked
            ? new THREE.MeshBasicMaterial({ color: LOCK_RED, toneMapped: false })   // material sendiri (bisa di-recolor saat unlock)
            : greenMat;
        const lights = [];
        const jamb = ew
            ? [cellFn(d.c0, d.r0 - 1), cellFn(d.c1, d.r1 + 1)]
            : [cellFn(d.c0 - 1, d.r0), cellFn(d.c1 + 1, d.r1)];
        const halfC = CELL / 2, lampY = H * 0.55;   // tinggi lampu ~tengah muka tembok
        for (const j of jamb) {
            for (const s of [-1, 1]) {               // dua MUKA tembok: depan & belakang
                const g = new THREE.Mesh(
                    ew ? new THREE.BoxGeometry(0.5, 2.2, 1.3) : new THREE.BoxGeometry(1.3, 2.2, 0.5),
                    litMat);
                g.position.set(
                    ew ? j.x + s * (halfC + 0.25) : j.x,
                    lampY,
                    ew ? j.z : j.z + s * (halfC + 0.25));
                (parent || scene).add(g);
                lights.push(g);
            }
        }

        // Pintu RUSAK dipaku pada pose macetnya SEKARANG (sekali, saat build):
        // updateStageDoors melewatinya, jadi tak ada yang menggeser daunnya lagi.
        if (broken) setSplitDoorOpen(rig, doorEasedOpen(DOOR_BROKEN_AJAR));
        doors.push({
            panel, rig, leaves: rig.leaves, cx, cz, cell: CELL,
            open: broken ? DOOR_BROKEN_AJAR : 0,
            linger: 0,                             // sisa delay tutup (dtk) setelah player keluar zona (2026-07-20)
            ew,                                    // orientasi: true = dinding vertikal (masuk dari ±x)
            locked,                                // TERKUNCI (tak pernah membuka sampai setDoorLocked(false))
            broken,                                // RUSAK: terkunci selamanya, tak pernah beranimasi
            baseLocked: locked, baseBroken: broken,   // keadaan AWAL (dipulihkan resetDoorLocks saat masuk stage)
            lockMat: locked ? litMat : null,       // material lampu merah -> hijau saat unlock
            lights,
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
// (selebar bukaan). Di luar zona → pintu menutup, tapi TIDAK langsung
// (2026-07-20, permintaan user — dulu langsung menutup begitu player keluar
// zona): menunggu `CFG.campaign.doors.closeDelaySec` (3 dtk) dulu via timer
// `dr.linger` (di-reset penuh selama player masih di zona), BARU bergeser rapat.
// Ease-in-out halus.
export function updateStageDoors(doors, dt) {
    if (!doors || !doors.length) return;
    const px = camera.position.x, pz = camera.position.z;   // camera = pivot logika player
    for (const dr of doors) {
        if (dr.broken) continue;   // pintu RUSAK: daun beku di pose macet, tanpa bunyi
        // Pintu TERKUNCI tak pernah membuka berapa pun kedekatan player.
        const target = doorProximityTarget(dr, dt, px, pz, dr.cell, !dr.locked);
        updateDoorMotion(dr, dt, target);
    }
}

// Dorong sebuah lingkaran (pos.x,pos.z, radius) KELUAR dari footprint pintu yang
// masih TERTUTUP (open < DOOR_SOLID_MAX). Dipakai kolisi ROBOT: robot TIDAK bisa
// menembus pintu tertutup (2026-07-18, permintaan user) — pintu hanya dibuka
// player, jadi robot terhalang daun pintu persis seperti tembok. Dorong sepanjang
// sumbu penetrasi TERKECIL (biasanya tegak-lurus daun tipis → mundur ke ruangan).
// Player TIDAK diblok (dia yang membuka pintu; footprint ⊂ zona buka → selalu
// terbuka saat player menyentuhnya) sehingga tak pernah terjepit.
export function resolveDoors(doors, pos, radius, lockedOnly = false) {
    if (!doors) return;
    for (const dr of doors) {
        if (lockedOnly && !dr.locked) continue;               // blok PLAYER hanya di pintu TERKUNCI (stage 1)
        if (dr.open >= DOOR_SOLID_MAX) continue;              // sudah cukup terbuka → tembus
        const g = doorGeometry(dr);
        const ex = g.hx + radius, ez = g.hz + radius;
        const dx = pos.x - g.cx, dz = pos.z - g.cz;
        if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) continue;   // di luar footprint
        const ox = ex - Math.abs(dx), oz = ez - Math.abs(dz);     // penetrasi tiap sumbu
        if (ox < oz) pos.x = g.cx + (dx < 0 ? -ex : ex);         // dorong sumbu-x
        else pos.z = g.cz + (dz < 0 ? -ez : ez);                 // dorong sumbu-z
    }
}

// Predikat non-mutating untuk A*: false bila lingkaran calon posisi masih
// menyentuh footprint pintu yang pejal. Bentuk dan ambang bukanya SAMA dengan
// resolveDoors(), sehingga pathfinder tidak merencanakan rute menembus daun
// tertutup lalu membuat robot mendorong pintu tanpa henti.
export function doorsWalkable(doors, x, z, radius = 0) {
    if (!doors) return true;
    for (const dr of doors) {
        if (dr.open >= DOOR_SOLID_MAX) continue;
        const g = doorGeometry(dr);
        if (Math.abs(x - g.cx) < g.hx + radius
            && Math.abs(z - g.cz) < g.hz + radius) return false;
    }
    return true;
}

// Kunci/buka sebuah pintu (stage 1: ruang komputer TERKUNCI sampai semua robot
// tumbang). Membuka juga mengubah lampu penandanya dari MERAH -> HIJAU. Pintu
// terkunci tak pernah membuka (updateStageDoors) & memblok player (resolveDoors
// lockedOnly). `door` = elemen array hasil buildStageDoors.
export function setDoorLocked(door, locked) {
    if (!door || door.broken) return;   // pintu RUSAK tak bisa dibuka oleh objektif apa pun
    door.locked = !!locked;
    if (door.lockMat) door.lockMat.color.setHex(locked ? LOCK_RED : GREEN);   // merah <-> hijau (mis. re-lock saat restart)
}

// ===== OVERRIDE KENDALI PINTU (2026-08-16, permintaan user) =====
// Menguasai file kill-switch = menguasai kendali pintu gedung: SEMUA pintu yang
// terkunci — termasuk yang RUSAK '+', yang `setDoorLocked` sengaja tolak — jadi
// pintu otomatis biasa. Daun pintu rusak dipaku di pose macetnya saat build dan
// `updateStageDoors` melewatinya; melepas flag `broken` saja sudah cukup karena
// `open`-nya (DOOR_BROKEN_AJAR) memang pose daunnya sekarang, jadi animasi
// lanjut MULUS dari situ. Lampu jamb ikut MERAH -> HIJAU (material lockMat
// milik pintu itu sendiri, bukan greenMat bersama). Mengembalikan jumlah pintu
// yang dilepas supaya pemanggil bisa memilih menampilkan pesan atau tidak.
export function overrideDoorLocks(doors) {
    if (!doors) return 0;
    let n = 0;
    for (const dr of doors) {
        if (!dr.locked && !dr.broken) continue;
        dr.locked = false; dr.broken = false; dr.linger = 0;
        if (dr.lockMat) dr.lockMat.color.setHex(GREEN);
        n++;
    }
    return n;
}

// Kembalikan seluruh pintu ke keadaan AWAL denah (terkunci/rusak + tertutup).
// Dipanggil dari `enter()` stage, sebab stage bisa dimasuki lagi setelah mati
// atau restart — tanpa ini override kill-switch akan terbawa ke run berikutnya.
export function resetDoorLocks(doors) {
    if (!doors) return;
    for (const dr of doors) {
        dr.locked = !!dr.baseLocked; dr.broken = !!dr.baseBroken;
        dr.linger = 0;
        dr.open = dr.broken ? DOOR_BROKEN_AJAR : 0;
        setSplitDoorOpen(dr.rig, doorEasedOpen(dr.open));
        if (dr.lockMat) dr.lockMat.color.setHex(dr.locked ? LOCK_RED : GREEN);
    }
}

// ===== PELURU vs PINTU (2026-07-19, disesuaikan 2026-08-08): peluru PLAYER &
// ROBOT tidak bisa menembus daun pintu. Uji ruas 2D mengikuti DUA footprint
// daun yang bergeser ke samping, sehingga celah tengah membesar bersama animasi
// dan terbuka penuh ketika kedua daun sudah masuk ke sisi dinding.
// Dipanggil dari hook `bulletBlocked` stage 1-3 — peluru player (bullets.js)
// dan peluru robot (updateEnemyBullets di robots.js) sama-sama mati lewat hook
// itu, jadi SATU cek ini menutup keduanya. =====
export function doorBlocksShot(doors, x0, z0, x1, z1, y) {
    return doorShotEntry(doors, x0, z0, x1, z1, y) !== null;
}

// Inti slab test: kembalikan parameter t MASUK terkecil (0..1) ruas terhadap
// semua daun pintu yang masih menghadang di ketinggian y, atau null bila bebas.
// t dipakai doorClampShot untuk menjepit peluru di titik tumbuk.
function doorShotEntry(doors, x0, z0, x1, z1, y) {
    if (!doors) return null;
    let best = null;
    for (const dr of doors) {
        const g = doorGeometry(dr);
        const e = doorEasedOpen(dr.open);
        const alongHalf = dr.rig.leafSpan / 2 + 0.4;
        const acrossHalf = (g.ew ? g.hx : g.hz) + 0.4;
        const centerOff = splitDoorLeafOffset(dr.rig, e);   // sama persis dgn visual
        for (const sign of [-1, 1]) {
            const leafX = g.cx + (g.ew ? 0 : sign * centerOff);
            const leafZ = g.cz + (g.ew ? sign * centerOff : 0);
            const hx = g.ew ? acrossHalf : alongHalf;
            const hz = g.ew ? alongHalf : acrossHalf;
            const dx = x1 - x0, dz = z1 - z0;
            const px = x0 - leafX, pz = z0 - leafZ;
            let t0 = 0, t1 = 1, hit = true;
            for (const [p, d, h] of [[px, dx, hx], [pz, dz, hz]]) {
                if (Math.abs(d) < 1e-9) {
                    if (Math.abs(p) > h) { hit = false; break; }
                    continue;
                }
                let ta = (-h - p) / d, tb = (h - p) / d;
                if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
                if (ta > t0) t0 = ta;
                if (tb < t1) t1 = tb;
                if (t0 > t1) { hit = false; break; }
            }
            if (hit && (best === null || t0 < best)) best = t0;
        }
    }
    return best;
}

// Blok peluru SEKALIGUS jepit posisinya ke SISI PENEMBAK daun pintu (bug fix
// 2026-07-19, permintaan user): peluru launcher yang menghantam pintu dulunya
// meledak di posisi SETELAH maju frame itu — kecepatan peluru bisa membawanya
// MELEWATI daun tipis (3.2 unit), jadi pusat ledakan jatuh DI BALIK pintu dan
// AoE-nya membantai robot di ruangan sebelah. Kini posisi dimundurkan ke titik
// masuk footprint − ~1.2 unit (jelas di depan daun), sehingga boom launcher
// meledak DI DEPAN pintu dan cek oklusi blastBlocked (explodeAt) melihat daun
// pintu di antara ledakan dan robot di baliknya. Dipakai hook bulletBlocked
// stage 1-3 untuk peluru player & robot (mutasi posisi peluru robot tak
// berdampak — peluru langsung dibuang setelah hook).
export function doorClampShot(doors, b) {
    const p = b.mesh.position;
    const t = doorShotEntry(doors, b.px, b.pz, p.x, p.z, p.y);
    if (t === null) return false;
    const dx = p.x - b.px, dz = p.z - b.pz;
    const len = Math.hypot(dx, dz);
    const tt = Math.max(0, t - (len > 1e-6 ? 1.2 / len : 0));
    p.x = b.px + dx * tt;
    p.z = b.pz + dz * tt;
    return true;
}
