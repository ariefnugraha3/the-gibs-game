// PETI PERSEDIAAN YANG BISA DIHANCURKAN (2026-07-26, permintaan user): peti kayu-
// komposit yang boleh DITEMBAK atau DITEBAS (melee) sampai pecah. Sejak
// 2026-07-27 peti SELALU (100%) berisi sesuatu — uang 50% / amunisi 30% /
// medkit 20% — jadi alasan bagi player untuk MASUK ke setiap ruangan, bukan
// hanya lewat koridor.
//
// DESAIN AMAN (nol dampak nav/BFS — sama seperti barrels.js): peti BUKAN
// penghalang nav (robot boleh menembusnya), hanya PEJAL ke PLAYER lewat
// resolveCrateBlock yang dipanggil playerCollide tiap stage. Dengan begitu
// menghancurkan peti tak pernah perlu bake-ulang nav-grid, dan robot tak pernah
// terkurung di balik peti.
//
// Geo/material BERSAMA (pola MAG_GEO drops.js / BG barrels.js) — JANGAN dispose.
// Semua Lambert/Basic + token PAL (GIBS-2045) sehingga tak ada shader recompile.

import { CFG } from '../core/config.js';
import { scene } from '../core/renderer.js';
import { bullets, player } from '../core/state.js';
import { rand, segPointDist2 } from '../utils/math.js';
import { PAL } from '../world/palette.js';
import { playSFX, sfxMelee } from '../utils/sfx.js';
import { spawnGroundPuff } from './effects.js';                     // call-time (circular aman)
import { spawnGibs } from './gore.js';                              // call-time
import { spawnAmmoDrop, spawnMedkitDrop, spawnLoot } from './drops.js';
import { AMMO_WEAPONS } from './ammoPickups.js';

export const crates = [];   // { mesh, x, z, y, groundY, hp, hpMax, lid, ring, beacon, hit, ph }

const CW = 10, CH = 9;      // lebar & tinggi peti (unit dunia)
const CR = 6.6;             // radius pejal-ke-player (lingkaran cembung = tak menjebak)

// TAMPILAN "BISA DIHANCURKAN" (2026-07-27, permintaan user): peti lama = kotak
// kayu pejal yang terbaca sebagai PERABOT diam. Sekarang bahasanya SAMA dengan
// barel peledak — satu-satunya benda lain yang boleh ditembak — supaya player
// langsung paham tanpa tutorial:
//   1. SILUET RAPUH — badan dipecah 3 BILAH kayu bercelah (inti gelap terlihat di
//      selanya) + tiang sudut baja; jelas "papan yang bisa pecah", bukan tembok.
//   2. MUKA ATAS = kanvas utama kamera top-down: pelat tutup + chevron bahaya
//      menyilang + CINCIN SASARAN amber berputar (bahasa universal "tembak sini").
//   3. BEACON amber berdenyut melayang di atas — persis penanda barel peledak.
//   4. PELAT LABEL amber di KEEMPAT sisi (azimuth kamera beda per stage: barat
//      daya default, barat laut di stage 3) → sinyal terbaca dari sudut mana pun.
//   5. UMPAN BALIK RUSAK — tiap pukulan bikin peti tersentak (`hit`) dan tutupnya
//      makin menganga miring seiring HP turun, jadi tembakan pertama sudah
//      "berbunyi": benda ini memang mau pecah.
// Ukuran tapak (CW/CH/CR) TIDAK berubah → kolisi & aturan penempatan tetap.

// Geometri & material BERSAMA antar instance (JANGAN dispose).
const PLANK_H = 2.5;                      // tebal satu bilah kayu
const PLANK_Y = [1.45, 4.5, 7.55];        // 3 bilah bercelah ~0.55 (inti gelap tampak)
const CG = {
    plank: new THREE.BoxGeometry(CW, PLANK_H, CW),
    core: new THREE.BoxGeometry(CW - 1.4, CH - 0.8, CW - 1.4),   // inti gelap (isi celah)
    lid: new THREE.BoxGeometry(CW + 0.6, 1.0, CW + 0.6),
    band: new THREE.BoxGeometry(CW + 0.3, 0.9, CW + 0.3),        // strip bahaya keliling
    post: new THREE.BoxGeometry(1.1, CH, 1.1),
    chevron: new THREE.BoxGeometry(CW + 1.4, 0.36, 1.5),         // marka silang di tutup
    ring: new THREE.TorusGeometry(2.7, 0.42, 6, 16),             // cincin sasaran
    pip: new THREE.CylinderGeometry(0.85, 0.85, 0.5, 8),         // titik tengah sasaran
    label: new THREE.BoxGeometry(3.2, 1.0, 0.35),                // pelat label sisi
    beacon: new THREE.SphereGeometry(0.85, 8, 6),
};
const CM = {
    body: new THREE.MeshLambertMaterial({ color: PAL.wood }),
    core: new THREE.MeshLambertMaterial({ color: PAL.ink }),
    frame: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
    post: new THREE.MeshLambertMaterial({ color: PAL.steel }),
    hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
    label: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
};
// Penanda amber yang BERDENYUT (cincin sasaran + beacon) — Basic toneMapped:false
// = ikut bloom; opasitasnya dianimasikan updateCrates. Material BERSAMA antar
// peti (satu tulisan per frame, semurah beacon barel).
const MARK_MAT = new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true, opacity: 0.9, toneMapped: false });

// Peti low-poly (19 mesh): inti gelap + 3 bilah kayu bercelah + strip bahaya +
// 4 tiang sudut baja + pelat tutup + 2 chevron + cincin sasaran + titik tengah +
// 4 pelat label sisi + beacon amber. `userData` membawa bagian yang dianimasikan.
export function buildCrateMesh() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, ry = 0, shadow = true) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; g.add(m);
        return m;
    };
    add(CG.core, CM.core, 0, CH / 2, 0, 0, false);               // inti gelap di balik celah
    for (const py of PLANK_Y) add(CG.plank, CM.body, 0, py, 0);  // 3 bilah kayu bercelah
    add(CG.band, CM.hazard, 0, PLANK_Y[1], 0);                   // strip bahaya keliling
    for (const sx of [-1, 1]) for (const sz of [-1, 1])          // tiang sudut baja
        add(CG.post, CM.post, sx * (CW / 2 - 0.4), CH / 2, sz * (CW / 2 - 0.4));

    // Tutup: satu grup supaya bisa MENGANGA miring saat peti babak belur.
    const lid = new THREE.Group();
    lid.position.y = CH + 0.4;
    g.add(lid);
    const addLid = (geo, mat, y, ry = 0, rx = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y; m.rotation.y = ry; m.rotation.x = rx; lid.add(m);
        return m;
    };
    addLid(CG.lid, CM.frame, 0).castShadow = true;
    addLid(CG.chevron, CM.hazard, 0.62, Math.PI / 4);            // marka bahaya menyilang
    addLid(CG.chevron, CM.hazard, 0.62, -Math.PI / 4);
    const ring = addLid(CG.ring, MARK_MAT, 0.95, 0, Math.PI / 2);  // cincin sasaran (rebah)
    addLid(CG.pip, MARK_MAT, 0.95);

    for (let i = 0; i < 4; i++) {                                 // pelat label KEEMPAT sisi
        const a = i * Math.PI / 2;
        add(CG.label, CM.label, Math.sin(a) * (CW / 2 + 0.15), PLANK_Y[2], Math.cos(a) * (CW / 2 + 0.15), a, false);
    }
    const beacon = add(CG.beacon, MARK_MAT, 0, CH + 3.4, 0, 0, false);

    g.userData.lid = lid; g.userData.ring = ring; g.userData.beacon = beacon;
    return g;
}

// Taruh satu peti di (x,z) menapak groundY. y = titik pusat (tinggi dada peti).
export function spawnCrate(x, z, groundY = 0) {
    const mesh = buildCrateMesh();
    mesh.position.set(x, groundY, z);
    mesh.rotation.y = rand(-0.25, 0.25);   // sedikit miring acak (tak terlihat seragam)
    scene.add(mesh);
    const hp = CFG.crates.hp;
    crates.push({
        mesh, x, z, y: groundY + CH * 0.5, groundY, hp, hpMax: hp,
        lid: mesh.userData.lid, ring: mesh.userData.ring, beacon: mesh.userData.beacon,
        hit: 0, ph: Math.random() * 6.283, baseY: groundY
    });
}

// Denyut penanda + animasi peti (visual saja; dipanggil updateGame bersebelahan
// dgn updateBarrels). MARK_MAT BERSAMA -> semua cincin/beacon berdenyut serempak
// (satu tulisan per frame). Per peti: cincin sasaran BERPUTAR, beacon mengambang,
// tutup makin MENGANGA seiring HP turun, dan sentakan `hit` meluruh.
let markT = 0;
export function updateCrates(dt) {
    if (!crates.length) return;
    markT += dt;
    MARK_MAT.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(markT * 5));
    for (const cr of crates) {
        if (cr.ring) cr.ring.rotation.z += dt * 1.4;
        if (cr.beacon) cr.beacon.position.y = CH + 3.4 + Math.sin(markT * 3 + cr.ph) * 0.45;
        const dmg = 1 - Math.max(0, cr.hp) / (cr.hpMax || 1);     // 0 utuh -> 1 nyaris pecah
        if (cr.lid) { cr.lid.rotation.z = dmg * 0.22; cr.lid.position.y = CH + 0.4 + dmg * 0.9; }
        if (cr.hit > 0) {                                          // sentakan kena tembak
            cr.hit = Math.max(0, cr.hit - dt * 5);
            const s = 1 + cr.hit * 0.10;
            cr.mesh.scale.set(s, 1 + cr.hit * 0.05, s);
            cr.mesh.position.y = cr.baseY + cr.hit * 0.6;
        }
    }
}

// Catat satu pukulan: kurangi HP + percik serpih kayu + sentakan visual.
function damageCrate(cr, dmg) {
    cr.hp -= dmg;
    cr.hit = 1;
    spawnGroundPuff(cr.x, cr.z, 0xb99a63, 3, cr.y);   // serpih kayu
}

// Undian ISI peti: `lootChance` peluang berisi sesuatu (kini 1 = SELALU berisi,
// permintaan user 2026-07-27), lalu jenis diundi dari BOBOT (ammo / uang /
// medkit) — bobot lebih mudah di-tune user daripada probabilitas yang wajib
// berjumlah 1. Bobot default 30/50/20 = persis ammo 30% / uang 50% / medkit 20%.
// Amunisi diundi dari senjata yang DIMILIKI player saja supaya isinya tak pernah
// mubazir: undian SERAGAM, jadi dgn 3 slot senjata (CFG.weapons.maxWeapons)
// peluangnya tepat 33,33% per jenis.
function rollCrateLoot(x, z) {
    const C = CFG.crates;
    if (C.lootChance < 1 && Math.random() > C.lootChance) return null;
    const wA = C.ammoWeight || 0, wM = C.moneyWeight || 0, wK = C.medkitWeight || 0;
    const total = wA + wM + wK;
    if (total <= 0) return null;
    let r = Math.random() * total;
    if (r < wA) {
        const owned = AMMO_WEAPONS.filter(w => player.owned[w]);
        const w = owned.length ? owned[Math.floor(Math.random() * owned.length)] : 'pistol';
        spawnAmmoDrop(x, z, w);
        return 'ammo';
    }
    r -= wA;
    if (r < wM) { spawnCrateMoney(x, z); return 'money'; }
    spawnMedkitDrop(x, z);
    return 'medkit';
}

// Nilai uang peti diundi dari TANGGA `CFG.crates.moneyTiers` (2026-07-27):
// tiap tier = { value, chips, weight } — default 8 (50%) / 16 (30%) / 24 (20%),
// dijatuhkan sbg `chips` keping loot bernilai sama (8 per keping) supaya
// pembagian value/chips di spawnLoot selalu BULAT (tak ada uang hilang saat
// dibulatkan). Fallback ke moneyValue/moneyChips lama bila tabelnya kosong.
function spawnCrateMoney(x, z) {
    const C = CFG.crates;
    const tiers = (Array.isArray(C.moneyTiers) && C.moneyTiers.length)
        ? C.moneyTiers
        : [{ value: C.moneyValue || 8, chips: C.moneyChips || 1, weight: 1 }];
    let total = 0;
    for (const t of tiers) total += (t.weight || 0);
    let r = Math.random() * (total > 0 ? total : tiers.length);
    let pick = tiers[tiers.length - 1];
    for (const t of tiers) { r -= (total > 0 ? (t.weight || 0) : 1); if (r < 0) { pick = t; break; } }
    spawnLoot(x, z, pick.value, pick.chips || 1);
}

// Hancurkan satu peti: keluarkan dari daftar DULU (cegah pecah ganda dari dua
// peluru di frame yang sama), serpihan kayu + debu + "krak", lalu undi isinya.
export function breakCrate(cr) {
    const i = crates.indexOf(cr);
    if (i < 0) return null;
    crates.splice(i, 1);
    spawnGibs(cr.x, cr.y, cr.z, 8, rand(-1, 1), rand(-1, 1), 1.3, PAL.wood, (cr.groundY || 0) + 0.3, 0x2a1c10);
    spawnGroundPuff(cr.x, cr.z, 0x9a7a4a, 8, (cr.groundY || 0) + 0.6);
    playSFX(sfxMelee, 0.55);
    scene.remove(cr.mesh);
    return rollCrateLoot(cr.x, cr.z);
}

// Hit-test PELURU PLAYER -> peti (dipanggil updateGame setelah updateBullets,
// bersama barrelBulletHits). Sweep segmen prev->kini (anti-tunnel). Peluru
// launcher DIBIARKAN lewat: ledakannya yang memecah peti (crateBlastHits).
export function crateBulletHits() {
    if (!crates.length) return;
    const r2 = (CR + 1) * (CR + 1);
    for (let ci = crates.length - 1; ci >= 0; ci--) {
        const cr = crates[ci];
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (b.explosive) continue;   // roket/granat: biar ledakannya yang memecah
            if (segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0, b.mesh.position.z, cr.x, 0, cr.z) < r2) {
                damageCrate(cr, b.damage != null ? b.damage : CFG.weapons.bulletDamage);
                scene.remove(b.mesh); bullets.splice(j, 1);
                if (cr.hp <= 0) { breakCrate(cr); break; }
            }
        }
    }
}

// Peti dalam radius ledakan ikut pecah (dipanggil explodeAt di effects.js —
// sejalan dgn detonateBarrelsInRadius). Iterasi mundur (breakCrate men-splice).
export function crateBlastHits(x, z, R) {
    if (!crates.length) return;
    for (let i = crates.length - 1; i >= 0; i--) {
        const cr = crates[i];
        if (Math.hypot(cr.x - x, cr.z - z) < R + CR) breakCrate(cr);
    }
}

// Tebasan pedang (F) memecah peti — dipanggil doMeleeHit (weapons.js) memakai
// arah tebasan yang sama dgn robot: kena bila DI DALAM jangkauan melee DAN di
// kerucut depan (~±70°). Return true bila minimal satu peti kena (utk SFX "kena").
export function crateMeleeHit(px, pz, dirx, dirz, range, dmg) {
    if (!crates.length) return false;
    let hit = false;
    for (let i = crates.length - 1; i >= 0; i--) {
        const cr = crates[i];
        const dx = cr.x - px, dz = cr.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > range + CR) continue;
        if (d > 1e-3 && (dx * dirx + dz * dirz) / d < 0.35) continue;   // kerucut depan
        hit = true;
        damageCrate(cr, dmg);
        if (cr.hp <= 0) breakCrate(cr);
    }
    return hit;
}

// PEJAL ke PLAYER saja (dipanggil playerCollide tiap stage). Lingkaran cembung =
// tak pernah menjebak. Robot mengabaikan peti (tak masuk nav) — sengaja, supaya
// menghancurkan peti tak perlu bake-ulang nav.
export function resolveCrateBlock(pos, r) {
    if (!crates.length) return;
    const rr = r + CR;
    for (const cr of crates) {
        const dx = pos.x - cr.x, dz = pos.z - cr.z;
        const d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-4) { pos.x = cr.x + dx / d * rr; pos.z = cr.z + dz / d * rr; }
    }
}

// Buang semua peti (resetGame + enter() tiap stage sebelum menaruh peti baru).
export function resetCrates() {
    for (const cr of crates) scene.remove(cr.mesh);
    crates.length = 0;
}

export const crateDebug = () => ({ count: crates.length });
