// PETI PERSEDIAAN YANG BISA DIHANCURKAN (2026-07-26, permintaan user): peti kayu-
// komposit yang boleh DITEMBAK atau DITEBAS (melee) sampai pecah. Saat pecah ada
// PELUANG berisi loot: amunisi (per-senjata), uang, atau medkit — jadi alasan
// bagi player untuk MASUK ke setiap ruangan, bukan hanya lewat koridor.
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

export const crates = [];   // { mesh, x, z, y, groundY, hp }

const CW = 10, CH = 9;      // lebar & tinggi peti (unit dunia)
const CR = 6.6;             // radius pejal-ke-player (lingkaran cembung = tak menjebak)

// Geometri & material BERSAMA antar instance (JANGAN dispose).
const CG = {
    body: new THREE.BoxGeometry(CW, CH, CW),
    lid: new THREE.BoxGeometry(CW + 0.6, 1.0, CW + 0.6),
    slat: new THREE.BoxGeometry(CW + 0.25, 1.3, 0.6),
    post: new THREE.BoxGeometry(1.1, CH, 1.1),
    label: new THREE.BoxGeometry(4.2, 2.4, 0.4),
    latch: new THREE.BoxGeometry(2.0, 1.2, 0.4),
};
const CM = {
    body: new THREE.MeshLambertMaterial({ color: PAL.wood }),
    frame: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
    post: new THREE.MeshLambertMaterial({ color: PAL.steel }),
    hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
    label: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    latch: new THREE.MeshBasicMaterial({ color: PAL.tech, toneMapped: false }),
};

// Peti low-poly (12 mesh): badan kayu + tutup logam + 4 tiang sudut baja +
// bilah penguat + strip bahaya + pelat label amber + kunci teal.
export function buildCrateMesh() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, ry = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m);
        return m;
    };
    add(CG.body, CM.body, 0, CH / 2, 0);
    add(CG.lid, CM.frame, 0, CH + 0.4, 0);                       // tutup logam
    for (const sx of [-1, 1]) for (const sz of [-1, 1])          // tiang sudut baja
        add(CG.post, CM.post, sx * (CW / 2 - 0.4), CH / 2, sz * (CW / 2 - 0.4));
    add(CG.slat, CM.frame, 0, CH * 0.72, 0);                     // bilah penguat atas
    add(CG.slat, CM.frame, 0, CH * 0.72, 0, Math.PI / 2);
    add(CG.slat, CM.hazard, 0, CH * 0.30, 0);                    // strip bahaya bawah
    add(CG.slat, CM.hazard, 0, CH * 0.30, 0, Math.PI / 2);
    add(CG.label, CM.label, 0, CH * 0.52, CW / 2 + 0.15);        // pelat label amber (muka selatan)
    add(CG.latch, CM.latch, 0, CH * 0.52, -CW / 2 - 0.15);       // kunci teal (muka utara)
    return g;
}

// Taruh satu peti di (x,z) menapak groundY. y = titik pusat (tinggi dada peti).
export function spawnCrate(x, z, groundY = 0) {
    const mesh = buildCrateMesh();
    mesh.position.set(x, groundY, z);
    mesh.rotation.y = rand(-0.25, 0.25);   // sedikit miring acak (tak terlihat seragam)
    scene.add(mesh);
    crates.push({ mesh, x, z, y: groundY + CH * 0.5, groundY, hp: CFG.crates.hp });
}

// Undian ISI peti: `lootChance` peluang berisi sesuatu, lalu jenis diundi dari
// BOBOT (ammo / uang / medkit) — bobot lebih mudah di-tune user daripada
// probabilitas yang wajib berjumlah 1. Amunisi diundi dari senjata yang DIMILIKI
// player saja supaya isinya tak pernah mubazir.
function rollCrateLoot(x, z) {
    const C = CFG.crates;
    if (Math.random() > C.lootChance) return null;
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
    if (r < wM) { spawnLoot(x, z, C.moneyValue, C.moneyChips); return 'money'; }
    spawnMedkitDrop(x, z);
    return 'medkit';
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
                cr.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage);
                spawnGroundPuff(cr.x, cr.z, 0xb99a63, 3, cr.y);   // serpih kayu
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
        cr.hp -= dmg;
        if (cr.hp <= 0) breakCrate(cr);
        else spawnGroundPuff(cr.x, cr.z, 0xb99a63, 4, cr.y);
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
