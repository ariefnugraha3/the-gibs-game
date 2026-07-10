// Item drop: magazen / granat / medkit. Drop acak dari zombie mati +
// persediaan tetap (ditaruh manual oleh stage). Pickup dgn aturan "full-item":
// item yang player-nya sudah penuh TIDAK dikonsumsi — ditinggal di lantai.

import { CFG } from '../core/config.js';
import { player, drops } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { playSFX, sfxPickup } from '../utils/sfx.js';
import { showPickup } from '../core/dom.js';
import { updateUI } from '../core/hud.js';
import { buildGrenadeMesh } from './grenades.js';
// Seam co-op (no-op selain host): broadcast drop lahir / diambil.
import { hostOnDropSpawn, hostOnDropTaken } from '../net/host.js';

// ----- Medkit (hanya ditaruh manual oleh stage, bukan drop zombie) -----
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

// ----- Magazen (item ammo): magazen kurva ala rifle, bukan balok polos -----
// Geometri & material BERSAMA antar instance (Group tidak ditelusuri
// clearArray, sama seperti medkit) — JANGAN dispose MAG_GEO / MAG_MAT.
export const MAG_GEO = {
    seg: new THREE.BoxGeometry(0.95, 1.25, 1.75),          // segmen badan (ditumpuk miring = lengkung)
    base: new THREE.BoxGeometry(1.2, 0.42, 2.05),          // pelat alas
    lips: new THREE.BoxGeometry(1.04, 0.42, 1.55),         // bibir pengumpan
    round: new THREE.CylinderGeometry(0.26, 0.26, 1.05, 8),// selongsong peluru
    tip: new THREE.ConeGeometry(0.24, 0.55, 8),            // ujung peluru
};
export const MAG_MAT = {
    body: new THREE.MeshLambertMaterial({ color: 0x4d5660, emissive: 0x171c20 }),   // polymer gelap
    trim: new THREE.MeshLambertMaterial({ color: 0x2b3138, emissive: 0x0b0d10 }),   // alas & bibir
    brass: new THREE.MeshLambertMaterial({ color: 0xf1c40f, emissive: 0x6e5406 }),  // brass glow (warna khas ammo)
};
export function buildMagMesh() {
    const grp = new THREE.Group();
    // Badan: 3 segmen dgn ofset-z + tilt progresif = siluet "banana mag"
    for (const [y, z, rx] of [[2.2, -0.32, 0.10], [1.1, -0.14, 0.26], [0.02, 0.22, 0.42]]) {
        const s = new THREE.Mesh(MAG_GEO.seg, MAG_MAT.body);
        s.position.set(0, y, z); s.rotation.x = rx;
        grp.add(s);
    }
    const base = new THREE.Mesh(MAG_GEO.base, MAG_MAT.trim);
    base.position.set(0, -0.58, 0.52); base.rotation.x = 0.42;
    grp.add(base);
    const lips = new THREE.Mesh(MAG_GEO.lips, MAG_MAT.trim);
    lips.position.set(0, 2.9, -0.42); lips.rotation.x = 0.10;
    grp.add(lips);
    // Peluru teratas: selongsong rebah menghadap depan + ujung kerucut
    const r1 = new THREE.Mesh(MAG_GEO.round, MAG_MAT.brass);
    r1.position.set(-0.13, 3.28, -0.45); r1.rotation.x = Math.PI / 2;
    grp.add(r1);
    const t1 = new THREE.Mesh(MAG_GEO.tip, MAG_MAT.brass);
    t1.position.set(-0.13, 3.28, -1.25); t1.rotation.x = -Math.PI / 2;
    grp.add(t1);
    // Selongsong kedua (kesan double-stack), sedikit lebih rendah & pendek
    const r2 = new THREE.Mesh(MAG_GEO.round, MAG_MAT.brass);
    r2.position.set(0.16, 3.12, -0.28); r2.rotation.x = Math.PI / 2;
    r2.scale.set(0.9, 0.55, 0.9);
    grp.add(r2);
    return grp;
}

// Id drop berurutan (co-op: identitas jaringan — indeks array tidak stabil
// karena splice; SP: hanya stempel tak terpakai, tanpa efek).
let nextDropId = 1;

// Drop acak saat zombie mati. Posisi dijepit oleh scene aktif (survival:
// ke dalam pagar; campaign: apa adanya) lewat hook clampDropPos. Co-op host:
// tiap drop yang lahir disiarkan ke client (hostOnDropSpawn — no-op selain host).
export function spawnDrop(pos) {
    const [px, pz] = activeScene.clampDropPos(pos.x, pos.z);
    if (Math.random() < CFG.drops.magChance) {
        const magMesh = buildMagMesh();
        magMesh.position.set(px, 1, pz);
        scene.add(magMesh);
        drops.push({ id: nextDropId++, mesh: magMesh, type: 'mag', timer: CFG.drops.lifetimeSec });   // detik
        hostOnDropSpawn(drops[drops.length - 1]);
    }
    if (Math.random() < CFG.drops.grenadeChance) {
        const nadeMesh = buildGrenadeMesh(0.8);   // model granat yang sama, skala item
        nadeMesh.position.set(px + 1.5, 1, pz + 1.5);
        scene.add(nadeMesh);
        drops.push({ id: nextDropId++, mesh: nadeMesh, type: 'grenade', timer: CFG.drops.lifetimeSec });
        hostOnDropSpawn(drops[drops.length - 1]);
    }
}

// Drop GHOST di client co-op: lahir dari event `drop` host (id milik host,
// TANPA broadcast). Mesh dibangun per type; timer lifetime berjalan lokal.
export function spawnNetDrop(id, type, x, z) {
    const mesh = type === 'mag' ? buildMagMesh()
        : type === 'medkit' ? buildMedkitMesh() : buildGrenadeMesh(0.8);
    mesh.position.set(x, 1, z);
    scene.add(mesh);
    drops.push({ id, mesh, type, timer: CFG.drops.lifetimeSec });
}

// Terapkan EFEK pickup satu item ke pemain lokal (+SFX+feed+HUD). Dipakai
// jalur pickup normal di bawah DAN client co-op saat host mengabulkan klaim
// `take` miliknya (event dropgone by=localId).
export function applyDropPickup(type) {
    if (type === 'mag') {          // isi senjata yang DIMILIKI (di-cap maxMags)
        const ownedW = ['rifle', 'pistol', 'shotgun'].filter(w => player.owned[w]);
        for (const w of ownedW)
            player[w].mags = Math.min(CFG.weapons.maxMags, player[w].mags + 1);
        showPickup('+1 Mag (All Weapons)', '#f1c40f');
    } else if (type === 'medkit') {
        // Medkit = item genggam (maks CFG.player.maxMedkits). Diambil ke
        // inventori; PAKAI dgn tombol 4 (bukan sembuh saat diambil).
        player.medkits = Math.min(CFG.player.maxMedkits, player.medkits + 1);
        showPickup('+1 Medkit (press 4 to use)', '#ff6b81');
    } else {
        player.grenades = Math.min(CFG.grenade.max, player.grenades + 1);
        showPickup('+1 Grenade', '#2ed573');
    }
    playSFX(sfxPickup);
    updateUI();
}

let fullInfoCd = 0;   // jeda pesan "already full" agar tidak spam tiap frame

export function updateDrops(dt, T) {
    if (fullInfoCd > 0) fullInfoCd -= dt;
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.timer -= dt;
        d.mesh.rotation.y += 3 * dt;
        d.mesh.position.y = 1.2 + Math.sin(T * 3 + i) * 0.3;   // bob (jalan di kedua mode)

        const dist = Math.hypot(d.mesh.position.x - camera.position.x, d.mesh.position.z - camera.position.z);
        if (dist < player.radius + 2) {
            // Item PENUH tidak diambil (ditinggal untuk nanti) — beri info
            // "already full" di feed, dgn jeda 1.2 dtk agar tidak spam saat
            // player berdiri di atas item. Mag hanya menghitung senjata yang
            // DIMILIKI (Survival mulai pistol saja).
            const ownedW = ['rifle', 'pistol', 'shotgun'].filter(w => player.owned[w]);
            const isFull =
                (d.type === 'mag' && ownedW.every(w => player[w].mags >= CFG.weapons.maxMags)) ||
                (d.type === 'grenade' && player.grenades >= CFG.grenade.max) ||
                (d.type === 'medkit' && player.medkits >= CFG.player.maxMedkits);
            if (isFull) {
                if (fullInfoCd <= 0) {
                    fullInfoCd = 1.2;
                    showPickup(d.type === 'mag' ? 'Mags already full'
                        : d.type === 'grenade' ? 'Grenades already full'
                            : 'Medkit already carried', '#b8b8b8');
                }
            } else if (activeScene.onDropTake) {
                // Hook co-op CLIENT: kirim KLAIM ambil ke host (sekali per drop)
                // — item TIDAK dikonsumsi lokal; efeknya diterapkan saat host
                // mengabulkan (event dropgone by=aku -> applyDropPickup).
                if (!d.claimed) { d.claimed = true; activeScene.onDropTake(d); }
            } else {
                applyDropPickup(d.type);
                hostOnDropTaken(d.id, 0, d.type);   // co-op host: umumkan drop diambil host (no-op SP)
                scene.remove(d.mesh);
                drops.splice(i, 1);
                continue;
            }
        }
        if (d.timer <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
    }
}
