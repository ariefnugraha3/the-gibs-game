// Item drop: amunisi PER-SENJATA / medkit / loot-uang. Drop acak dari robot mati
// + persediaan tetap (ditaruh manual oleh stage) + isi peti yang dipecah
// (crates.js). Pickup dgn aturan "full-item": item yang player-nya sudah penuh
// TIDAK dikonsumsi — ditinggal di lantai.
//
// AMUNISI PER-SENJATA (2026-07-26, permintaan user): dulu satu item 'mag'
// mengisi ammo SEMUA senjata sekaligus. Sekarang tiap drop amunisi membawa
// `d.weapon` ('pistol'|'shotgun'|'rifle'|'launcher') dan HANYA mengisi senjata
// itu; bentuk meshnya beda-beda per jenis (entities/ammoPickups.js).

import { CFG, CAMP_M } from '../core/config.js';
import { player, drops, maxAmmoFor, addScore } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { playSFX, sfxPickup } from '../utils/sfx.js';
import { showPickup } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { PAL } from '../world/palette.js';
import { buildAmmoMesh, AMMO_KINDS, AMMO_WEAPONS } from './ammoPickups.js';

// ----- Medkit (hanya ditaruh manual oleh stage, bukan drop robot) -----
// Material BERSAMA: Group tidak ditelusuri clearArray, jadi bahan bersama
// wajib dipakai agar tidak bocor saat reset. JANGAN dispose MEDKIT_MAT.
export const MEDKIT_MAT = {
    box: new THREE.MeshLambertMaterial({ color: 0xe8e8e8, emissive: 0x1c1c1c }),
    cross: new THREE.MeshLambertMaterial({ color: 0xd23c3c, emissive: 0x3d0f0f })
};
export function buildMedkitMesh() {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 5), MEDKIT_MAT.box);
    base.position.y = 0;
    grp.add(base);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 1.2), MEDKIT_MAT.cross);
    c1.position.y = 1.55;
    grp.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 3.6), MEDKIT_MAT.cross);
    c2.position.y = 1.55;
    grp.add(c2);
    return grp;
}

// ----- Amunisi PER-SENJATA: mesh & tabel jenis ada di entities/ammoPickups.js.
// Taruh satu paket amunisi senjata `w` di (x,z) (dipakai stage/peti/drop robot). -----
export function spawnAmmoDrop(x, z, w, lifetime) {
    const [px, pz] = activeScene.clampDropPos(x, z);
    const mesh = buildAmmoMesh(w);
    mesh.position.set(px, 1, pz);
    scene.add(mesh);
    drops.push({
        mesh, type: 'ammo', weapon: w,
        timer: lifetime != null ? lifetime : CFG.drops.lifetimeSec
    });
}

// Taruh satu medkit di (x,z) (isi peti / persediaan stage).
export function spawnMedkitDrop(x, z, lifetime) {
    const [px, pz] = activeScene.clampDropPos(x, z);
    const mesh = buildMedkitMesh();
    mesh.position.set(px, 1, pz);
    scene.add(mesh);
    drops.push({
        mesh, type: 'medkit',
        timer: lifetime != null ? lifetime : CFG.drops.lifetimeSec
    });
}

// ----- LOOT / uang (SECOND-IMPROVEMENT-PLAN point 1, 2026-07-22) -----
// Chip kredit amber yang JATUH dari robot mati (campaign) lalu TERSEDOT ke player
// (magnet) dan menambah SKOR = mata uang shop. Campaign kini TAK memberi skor
// saat kill (killRobot: hook activeScene.awardKill -> campaignAwardKill menaruh
// loot); player harus MELOOT untuk dapat uang belanja (ala Alien Shooter).
// Geo/material BERSAMA (JANGAN dispose). Amber = aksen manusia GIBS-2045.
const LOOT_GEO = {
    coin: new THREE.CylinderGeometry(2.0, 2.0, 0.7, 8),   // chip oktagonal
    core: new THREE.CylinderGeometry(1.15, 1.15, 0.9, 8), // emboss tengah
};
const LOOT_MAT = {
    coin: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: PAL.amberDim, toneMapped: false }),
};
export function buildLootMesh() {
    const g = new THREE.Group();
    const coin = new THREE.Mesh(LOOT_GEO.coin, LOOT_MAT.coin);
    coin.rotation.x = Math.PI / 2;   // hadap kamera top-down (pipih di bidang xz)
    g.add(coin);
    const core = new THREE.Mesh(LOOT_GEO.core, LOOT_MAT.core);
    core.rotation.x = Math.PI / 2;
    g.add(core);
    return g;
}

// Taruh loot senilai `value` (dipecah `chips` keping) di (x,z) — dipakai
// campaignAwardKill (common.js). Keping tersebar sedikit + magnet ke player.
export function spawnLoot(x, z, value, chips = 1) {
    const [px, pz] = activeScene.clampDropPos(x, z);
    const per = Math.max(1, Math.round(value / chips));
    for (let i = 0; i < chips; i++) {
        const mesh = buildLootMesh();
        const a = Math.random() * 6.283, r = chips > 1 ? 3 + Math.random() * 6 : 0;
        mesh.position.set(px + Math.cos(a) * r, 2, pz + Math.sin(a) * r);
        scene.add(mesh);
        drops.push({ mesh, type: 'loot', value: per, timer: CFG.drops.lootLifetimeSec, spin: Math.random() * 6.283 });
    }
}

// Drop acak saat robot mati. Posisi dijepit oleh scene aktif (survival:
// ke dalam pagar; campaign: apa adanya) lewat hook clampDropPos.
// Jenis amunisinya diundi dari senjata yang DIMILIKI player saja — kalau tidak,
// drop untuk senjata yang belum dibeli jadi mubazir (2026-07-26).
export function spawnDrop(pos) {
    if (Math.random() >= CFG.drops.magChance) return;
    const owned = AMMO_WEAPONS.filter(w => player.owned[w]);
    const w = owned.length ? owned[Math.floor(Math.random() * owned.length)] : 'pistol';
    spawnAmmoDrop(pos.x, pos.z, w);
}

let fullInfoCd = 0;   // jeda pesan "already full" agar tidak spam tiap frame
let lootSndCd = 0;    // jeda suara ambil loot (banyak keping = jangan spam audio)

export function updateDrops(dt, T) {
    if (fullInfoCd > 0) fullInfoCd -= dt;
    if (lootSndCd > 0) lootSndCd -= dt;
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.timer -= dt;

        // LOOT (uang): berputar pipih + TERSEDOT ke player (magnet) -> ambil =
        // +value ke SKOR (mata uang shop campaign). Ditangani penuh di sini.
        if (d.type === 'loot') {
            d.spin += 5 * dt; d.mesh.rotation.y = d.spin;
            const dxl = camera.position.x - d.mesh.position.x, dzl = camera.position.z - d.mesh.position.z;
            const distL = Math.hypot(dxl, dzl);
            const magR = CFG.drops.lootMagnetMeters * CAMP_M;
            if (distL < magR && distL > 1e-3) {   // makin dekat makin cepat tersedot
                const pull = CFG.drops.lootMagnetSpeed * (0.4 + 0.6 * (1 - distL / magR));
                d.mesh.position.x += dxl / distL * pull * dt;
                d.mesh.position.z += dzl / distL * pull * dt;
            }
            d.mesh.position.y = 2 + Math.sin(T * 4 + i) * 0.4;
            if (distL < CFG.drops.lootPickupRadius) {
                addScore(d.value);
                if (lootSndCd <= 0) { lootSndCd = 0.12; playSFX(sfxPickup, 0.5); }
                updateUI();
                scene.remove(d.mesh); drops.splice(i, 1);
                continue;
            }
            if (d.timer <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
            continue;
        }

        d.mesh.rotation.y += 3 * dt;
        d.mesh.position.y = 1.2 + Math.sin(T * 3 + i) * 0.3;   // bob (jalan di kedua mode)

        const dist = Math.hypot(d.mesh.position.x - camera.position.x, d.mesh.position.z - camera.position.z);
        if (dist < player.radius + 2) {
            // Item PENUH tidak diambil (ditinggal untuk nanti) — beri info
            // "already full" di feed, dgn jeda 1.2 dtk agar tidak spam saat
            // player berdiri di atas item. AMUNISI PER-SENJATA (2026-07-26):
            // drop 'ammo' membawa d.weapon dan HANYA mengisi senjata itu
            // (+CFG.weapons.<w>.ammoPickup, di-cap maxAmmoFor); amunisi untuk
            // senjata yang BELUM dimiliki ditinggal (tak terpakai).
            const kind = d.type === 'ammo' ? (AMMO_KINDS[d.weapon] || AMMO_KINDS.pistol) : null;
            const unowned = d.type === 'ammo' && !player.owned[d.weapon];
            const isFull =
                (d.type === 'ammo' && (unowned || player[d.weapon].ammo >= maxAmmoFor(d.weapon))) ||
                (d.type === 'medkit' && player.medkits >= CFG.player.maxMedkits);
            if (isFull) {
                if (fullInfoCd <= 0) {
                    fullInfoCd = 1.2;
                    showPickup(d.type !== 'ammo' ? 'Medkit already carried'
                        : (unowned ? `${kind.label} — you don't own that weapon`
                            : `${kind.label} already full`), '#b8b8b8');
                }
            } else {
                if (d.type === 'ammo') {         // paket peluru: HANYA senjata jenis ini
                    const w = d.weapon;
                    player[w].ammo = Math.min(maxAmmoFor(w), player[w].ammo + CFG.weapons[w].ammoPickup);
                    showPickup(`+${CFG.weapons[w].ammoPickup} ${kind.label}`, kind.color);
                } else if (d.type === 'medkit') {
                    // Medkit = item genggam (maks 1). Diambil ke inventori; PAKAI
                    // dgn tombol 4 untuk memulihkan HP (bukan sembuh saat diambil).
                    player.medkits = Math.min(CFG.player.maxMedkits, player.medkits + 1);
                    showPickup('+1 Medkit (press 4 to use)', '#ff6b81');
                }
                playSFX(sfxPickup);
                updateUI();
                scene.remove(d.mesh);
                drops.splice(i, 1);
                continue;
            }
        }
        if (d.timer <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
    }
}
