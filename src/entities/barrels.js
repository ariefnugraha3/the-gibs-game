// BARREL PELEDAK (IMPROVEMENT #2 / SECOND-IMPROVEMENT-PLAN point 2, 2026-07-22):
// tong bahan bakar/tabung eksplosif di lingkungan stage campaign. DITEMBAK player
// -> MELEDAK (AoE) melukai robot DI SEKITARNYA (dan player bila terlalu dekat —
// risiko ala Alien Shooter). Ledakan juga MERAMBAT: barel lain dalam radius ikut
// meledak (chain reaction, dipicu explodeAt di effects.js).
//
// DESAIN AMAN (nol dampak nav/BFS): barel BUKAN penghalang nav (robot boleh lewat
// di atasnya — malah bagus, mereka berkerumun di dekat barel), hanya PEJAL ke
// PLAYER lewat resolveBarrelBlock (dipanggil playerCollide tiap stage). Ledakan
// lewat antrean queueBoom (robots.js) supaya diproses SETELAH loop robot (sama
// seperti peluru launcher) = tak ada splice reentrant.
//
// Geo/material BERSAMA (pola MAG_GEO drops.js) — JANGAN dispose. Warna GIBS-2045
// (palette.js): badan baja + strip bahaya merah-bata/putih + beacon amber.

import { CFG, CAMP_M } from '../core/config.js';
import { scene } from '../core/renderer.js';
import { bullets } from '../core/state.js';
import { rand, segPointDist2 } from '../utils/math.js';
import { PAL } from '../world/palette.js';
import { queueBoom } from './robots.js';          // call-time (circular aman)
import { spawnGroundPuff } from './effects.js';   // call-time (circular aman: effects->barrels)
import { spawnGibs } from './gore.js';            // call-time

export const barrels = [];   // { mesh, x, z, y, groundY, hp }

const BR = 4.0, BH = 13;     // radius & tinggi tong (unit dunia)

// Geometri & material BERSAMA antar instance (JANGAN dispose).
const BG = {
    body: new THREE.CylinderGeometry(BR, BR, BH, 12),
    rim: new THREE.CylinderGeometry(BR + 0.35, BR + 0.35, 1.1, 12),
    band: new THREE.CylinderGeometry(BR + 0.12, BR + 0.12, 2.4, 12),
    cap: new THREE.CylinderGeometry(BR - 0.5, BR - 0.5, 0.6, 12),
    beacon: new THREE.SphereGeometry(0.9, 8, 6),
};
const BM = {
    body: new THREE.MeshLambertMaterial({ color: PAL.steel }),
    rim: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
    hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
    stripe: new THREE.MeshLambertMaterial({ color: PAL.white }),
    cap: new THREE.MeshLambertMaterial({ color: PAL.amberDim }),
};
// Beacon amber (aksen bahaya manusia) — Basic toneMapped:false = ikut bloom,
// denyut opasitasnya dianimasikan updateBarrels (BERSAMA semua barel = murah).
const BEACON_MAT = new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true, opacity: 0.9, toneMapped: false });

// Tong eksplosif low-poly (7 mesh): badan baja + rim atas/bawah + strip bahaya
// merah + strip putih + tutup + beacon amber. Semua material BERSAMA.
export function buildBarrelMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BG.body, BM.body); body.position.y = BH / 2; body.castShadow = true; g.add(body);
    const topRim = new THREE.Mesh(BG.rim, BM.rim); topRim.position.y = BH - 0.4; g.add(topRim);
    const botRim = new THREE.Mesh(BG.rim, BM.rim); botRim.position.y = 0.5; g.add(botRim);
    const hz = new THREE.Mesh(BG.band, BM.hazard); hz.position.y = BH * 0.64; g.add(hz);           // strip bahaya merah
    const wt = new THREE.Mesh(BG.band, BM.stripe); wt.position.y = BH * 0.40; wt.scale.y = 0.6; g.add(wt);  // strip putih
    const cap = new THREE.Mesh(BG.cap, BM.cap); cap.position.y = BH + 0.1; g.add(cap);
    const beacon = new THREE.Mesh(BG.beacon, BEACON_MAT); beacon.position.y = BH + 1.0; g.add(beacon);
    return g;
}

// Taruh satu barel di (x,z) menapak groundY. y = titik pusat ledakan (~dada tong).
export function spawnBarrel(x, z, groundY = 0) {
    const mesh = buildBarrelMesh();
    mesh.position.set(x, groundY, z);
    scene.add(mesh);
    barrels.push({ mesh, x, z, y: groundY + BH * 0.5, groundY, hp: CFG.barrels.hp });
}

// Denyut beacon amber (visual saja). Material BERSAMA -> semua barel berdenyut
// serempak (murah; barel sedikit). Dilewati saat tak ada barel.
let beaconT = 0;
export function updateBarrels(dt) {
    if (!barrels.length) return;
    beaconT += dt;
    BEACON_MAT.opacity = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(beaconT * 6));
}

// Ledakkan satu barel: keluarkan dari daftar DULU (cegah re-detonasi/chain tak
// hingga), lempar serpihan logam + debu, lalu ANTRE ledakan (hurtPlayer=true =
// barel melukai player juga; dmg robot = robotDamage, dmg player = playerDamage).
// Radius blast = blastRadiusMeters (m -> unit). Booms diproses processPendingBooms
// (robots.js) SETELAH loop robot; explodeAt di sana memicu chain via
// detonateBarrelsInRadius. sfx null -> default grenade-explode di explodeAt.
export function detonateBarrel(bar) {
    const i = barrels.indexOf(bar);
    if (i < 0) return;
    barrels.splice(i, 1);
    const B = CFG.barrels;
    const R = (B.blastRadiusMeters || 6) * CAMP_M;
    const x = bar.x, z = bar.z, y = bar.y;
    spawnGibs(x, y, z, 9, rand(-1, 1), rand(-1, 1), 1.6, PAL.gunmetal, (bar.groundY || 0) + 0.3, 0x141210);
    spawnGroundPuff(x, z, 0x8a7a5a, 11, (bar.groundY || 0) + 0.6);
    queueBoom(x, y, z, R, true, B.playerDamage, B.robotDamage, null);
    scene.remove(bar.mesh);
}

// Ledakan lain (launcher/barel) merambat ke barel dalam radius (dipanggil
// explodeAt di effects.js). Iterasi mundur (detonateBarrel men-splice).
export function detonateBarrelsInRadius(x, z, R) {
    if (!barrels.length) return;
    for (let i = barrels.length - 1; i >= 0; i--) {
        const bar = barrels[i];
        if (Math.hypot(bar.x - x, bar.z - z) < R + BR) detonateBarrel(bar);
    }
}

// Hit-test PELURU PLAYER -> barel (dipanggil updateGame SETELAH updateBullets,
// SEBELUM updateRobots). Sweep segmen prev->kini (anti-tunnel). Peluru biasa =
// kurangi hp + percik + peluru terserap; peluru launcher = biar ledakannya yang
// meledakkan barel (chain). Barel hp<=0 -> detonateBarrel.
export function barrelBulletHits() {
    if (!barrels.length) return;
    const r2 = (BR + 1) * (BR + 1);
    for (let bi = barrels.length - 1; bi >= 0; bi--) {
        const bar = barrels[bi];
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (segPointDist2(b.px, 0, b.pz, b.mesh.position.x, 0, b.mesh.position.z, bar.x, 0, bar.z) < r2) {
                if (b.explosive) {
                    // Peluru launcher: ledak di titiknya (antre) -> chain meledakkan barel.
                    queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage, b.boomSfx);
                    scene.remove(b.mesh); bullets.splice(j, 1);
                    break;   // barel dibiarkan diledakkan boom launcher
                }
                bar.hp -= (b.damage != null ? b.damage : CFG.weapons.bulletDamage);
                spawnGroundPuff(bar.x, bar.z, 0xffd28a, 3, bar.y);   // percik amber
                scene.remove(b.mesh); bullets.splice(j, 1);
                if (bar.hp <= 0) { detonateBarrel(bar); break; }
            }
        }
    }
}

// PEJAL ke PLAYER saja (dipanggil playerCollide tiap stage SETELAH resolve lain):
// dorong player keluar lingkaran barel (satu lingkaran cembung = tak pernah
// menjebak). Robot mengabaikan barel (tak masuk nav) — sengaja.
export function resolveBarrelBlock(pos, r) {
    if (!barrels.length) return;
    const rr = r + BR;
    for (const bar of barrels) {
        const dx = pos.x - bar.x, dz = pos.z - bar.z;
        const d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-4) { pos.x = bar.x + dx / d * rr; pos.z = bar.z + dz / d * rr; }
    }
}

// Buang semua barel (dipanggil resetGame + enter() tiap stage sebelum menaruh
// barel baru). Material/geometri BERSAMA -> tak di-dispose.
export function resetBarrels() {
    for (const bar of barrels) scene.remove(bar.mesh);
    barrels.length = 0;
}

export const barrelDebug = () => ({ count: barrels.length });
