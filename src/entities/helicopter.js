// HELIKOPTER PENJEMPUT (2026-07-17) — set-piece CUTSCENE stage 4: menunggu
// player di pusat alun-alun, lalu DIHANCURKAN meriam boss tank (bangkainya
// menetap sebagai obstacle sepanjang duel).
//
// Bentuk = helikopter utilitas ringan GENERIK bermesin tunggal (siluet umum
// kelas AS350/H125 sebagai acuan PROPORSI saja — tanpa merek/livery/logo,
// murni primitif prosedural sendiri): kabin membulat berkaca lebar, boom ekor
// meruncing + sirip tegak, stabilizer horizontal, rotor utama 3 bilah, rotor
// ekor 2 bilah di kiri sirip, skid landing gear. Gaya "GIBS 2045"
// (world/palette.js): bodi putih-hangat PAL.white + strip AMBER (aksen
// manusia/penyelamat), kaca PAL.screenBg, logam PAL.steel/gunmetal, beacon
// amber emissive <= EMISSIVE_MAX. HANYA material Lambert (program shader
// sudah dipanaskan -> spawn tanpa recompile). Hidung = +Z lokal (yaw di
// spawnHelicopter mengarahkannya).
//
// API (scene-agnostik, dipakai stage4):
//   spawnHelicopter(x, z, yaw) -> heli {parts, wrecked, ...}
//   updateHelicopter(heli, dt) — rotor berputar CEPAT saat utuh (+ debu
//     downwash tipis); saat bangkai: asap hitam + bara membubung terus.
//   blastHelicopter(heli)     — ledakan besar: bilah rotor terlempar sbg gib,
//     bodi miring + gosong, beacon mati, genangan hangus.
//   disposeHelicopter(heli)   — bersihkan mesh + material per-instance.

import { scene } from '../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../world/palette.js';
import { spawnGroundPuff, explodeAt } from './effects.js';
import { spawnGibs, spawnBloodDecal } from './gore.js';
import { playSFX, sfxExplode } from '../utils/sfx.js';
import { makeTexture } from '../utils/textures.js';
import { rand } from '../utils/math.js';

const ROTOR_SPEED = 16;       // rad/dtk rotor utama (berputar cepat, siap angkut)
const TAIL_SPEED = 44;        // rad/dtk rotor ekor
const WASH_GAP = 0.5;         // jeda debu downwash saat utuh (detik)
const BURN_GAP = 0.3;         // jeda kepulan asap bangkai (detik)
// CAIRAN heli = HITAM (bukan hijau — "hanya robot yang punya coolant hijau",
// permintaan user 2026-07-18): genangan bocoran hitam di titik mati + gib.
const HELI_FLUID = 0x141210;

// ===== API BERKOBAR (2026-07-18): bangkai heli MENYALA sepanjang sisa Stage 4.
// Lidah api = sprite billboard oranye (program SpriteMaterial = sudah dipanaskan
// warmup; hanya teksturnya baru — dibuat sekali, dibagi). Berkedip-kedip
// (skala+opasitas sin, sedikit bergoyang) selamanya selagi bangkai ada. =====
let FLAME_TEX = null;
function flameTex() {
    if (!FLAME_TEX) {
        FLAME_TEX = makeTexture(64, 64, (g) => {
            // lidah api: inti kuning-putih -> oranye -> merah transparan
            const rg = g.createRadialGradient(32, 40, 2, 32, 36, 30);
            rg.addColorStop(0, 'rgba(255,246,200,0.98)');
            rg.addColorStop(0.35, 'rgba(255,170,50,0.92)');
            rg.addColorStop(0.7, 'rgba(220,70,20,0.55)');
            rg.addColorStop(1, 'rgba(120,20,0,0)');
            g.fillStyle = rg;
            g.beginPath(); g.ellipse(32, 36, 20, 30, 0, 0, 6.283); g.fill();
        });
    }
    return FLAME_TEX;
}
// Satu sprite api (material sendiri = opasitas/skala per-lidah; tekstur dibagi).
export function buildHeliFlameSprite() {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex(), color: 0xffb050, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    }));
    return spr;
}

export function buildHelicopterMesh() {
    const group = new THREE.Group();
    const paintMats = [];

    // --- Material (Lambert semua; token PAL — aturan gaya GIBS 2045) ---
    const body = new THREE.MeshLambertMaterial({ color: PAL.white });      // bodi putih hangat
    const bodyDk = new THREE.MeshLambertMaterial({ color: PAL.panel });    // panel bawah/boom
    const stripe = new THREE.MeshLambertMaterial({ color: PAL.amber });    // strip penyelamat (aksen manusia)
    const glass = new THREE.MeshLambertMaterial({ color: PAL.screenBg });  // kaca gelap hangat
    const steel = new THREE.MeshLambertMaterial({ color: PAL.steel });     // skid/strut
    const dark = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });   // mesin/hub/knalpot
    const blade = new THREE.MeshLambertMaterial({ color: PAL.ink });       // bilah rotor
    const beaconM = new THREE.MeshLambertMaterial({
        color: PAL.amberDim, emissive: PAL.amber, emissiveIntensity: Math.min(0.8, EMISSIVE_MAX)
    });
    paintMats.push(body, bodyDk, stripe);

    const mk = (g, m, x, y, z, parent, rx, ry, rz, noShadow) => {
        const b = new THREE.Mesh(g, m);
        b.position.set(x, y, z);
        if (rx) b.rotation.x = rx; if (ry) b.rotation.y = ry; if (rz) b.rotation.z = rz;
        if (!noShadow) { b.castShadow = true; b.receiveShadow = true; }
        parent.add(b);
        return b;
    };

    // ===================== KABIN (hidung +Z; anggaran <= 25 mesh — penjaga low-poly) =====================
    mk(new THREE.BoxGeometry(11, 8, 15), body, 0, 10, 1, group);                 // badan utama
    mk(new THREE.BoxGeometry(8.6, 5.5, 5), body, 0, 8.6, 9.4, group, 0.34);      // hidung melandai
    mk(new THREE.BoxGeometry(8.2, 5.2, 6.4), glass, 0, 12.8, 6.6, group, 0.52, 0, 0, true);   // kaca depan lebar
    mk(new THREE.BoxGeometry(11.6, 3.4, 8), glass, 0, 12.2, 1.5, group, 0, 0, 0, true);        // jendela pintu kiri-kanan
    mk(new THREE.BoxGeometry(11.4, 1.6, 13), stripe, 0, 8.2, 1.5, group, 0, 0, 0, true);       // strip amber keliling bawah
    // mesin di atap + knalpot serong ke belakang
    mk(new THREE.BoxGeometry(6.6, 3.6, 9), steel, 0, 15.8, -2.5, group);
    mk(new THREE.CylinderGeometry(1.2, 1.5, 5, 8), dark, 0, 16.2, -8, group, 1.15, 0, 0, true);

    // ===================== BOOM EKOR + SIRIP + STABILIZER =====================
    const boomGeo = new THREE.CylinderGeometry(1.3, 2.5, 26, 10); boomGeo.rotateX(Math.PI / 2);
    mk(boomGeo, bodyDk, 0, 13, -18.5, group);                                    // boom meruncing ke belakang
    mk(new THREE.BoxGeometry(1.2, 9.5, 4.6), body, 0, 16.5, -32.5, group, -0.14);   // sirip tegak (agak menyapu)
    mk(new THREE.BoxGeometry(1.4, 2, 5), stripe, 0, 20.6, -33.1, group, -0.14, 0, 0, true);   // band amber puncak sirip
    mk(new THREE.BoxGeometry(10.5, 0.8, 3.4), body, 0, 14, -27, group, 0, 0, 0, true);        // stabilizer horizontal
    const beacon = mk(new THREE.BoxGeometry(0.9, 0.9, 0.9), beaconM, 0, 21.8, -32.6, group, 0, 0, 0, true);   // beacon amber

    // ===================== ROTOR EKOR (2 bilah, sisi kiri sirip; spin sumbu X) =====================
    const tailRotor = new THREE.Group();
    tailRotor.position.set(-1.6, 16.5, -32.8);
    group.add(tailRotor);
    const tailHubGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.6, 8); tailHubGeo.rotateZ(Math.PI / 2);
    mk(tailHubGeo, dark, 0, 0, 0, tailRotor, 0, 0, 0, true);
    mk(new THREE.BoxGeometry(0.5, 9.5, 1.1), blade, -0.6, 0, 0, tailRotor, 0, 0, 0, true);    // rotor ekor 2-BILAH = satu box menembus hub (khas heli ringan)

    // ===================== ROTOR UTAMA (3 bilah; spin sumbu Y) =====================
    // rotor ditinggikan agar sapuan bilah (radius ~35) BEBAS dari puncak sirip
    // ekor + beacon (~22.3) — tanpa saling tembus saat berputar.
    mk(new THREE.CylinderGeometry(0.8, 1.0, 4.2, 8), dark, 0, 19.2, 0, group, 0, 0, 0, true); // tiang rotor (statis)
    const rotor = new THREE.Group();
    rotor.position.set(0, 22.4, 0);
    group.add(rotor);
    mk(new THREE.CylinderGeometry(1.7, 1.7, 1.5, 10), dark, 0, 0, 0, rotor, 0, 0, 0, true);   // hub
    const bladeGeo = new THREE.BoxGeometry(1.9, 0.32, 36);
    for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(bladeGeo, blade);
        b.position.set(0, 0.35, 0);
        b.rotation.y = i * Math.PI * 2 / 3;
        b.rotation.x = 0.02;   // coning tipis
        b.castShadow = true;
        // bilah digeser keluar dari hub sepanjang arah bilahnya sendiri
        b.translateZ(17.5);
        rotor.add(b);
    }

    // ===================== SKID LANDING GEAR =====================
    const railGeo = new THREE.BoxGeometry(1.1, 1.1, 30);
    for (const side of [-1, 1]) {
        mk(railGeo, steel, side * 5.6, 1.3, 1, group, 0, 0, 0, true);                          // rail skid
        mk(new THREE.BoxGeometry(1.0, 5.8, 1.3), steel, side * 5.2, 4.6, 6.5, group, 0, 0, side * 0.28, true);   // strut depan
        mk(new THREE.BoxGeometry(1.0, 5.8, 1.3), steel, side * 5.2, 4.6, -4.5, group, 0, 0, side * 0.28, true);  // strut belakang
    }

    return { group, rotor, tailRotor, beacon, beaconM, glassMat: glass, paintMats };
}

// Buat + tempatkan heli menghadap `yaw` (hidung = +Z lokal diputar yaw).
export function spawnHelicopter(x, z, yaw = 0) {
    const parts = buildHelicopterMesh();
    parts.group.position.set(x, 0, z);
    parts.group.rotation.y = yaw;
    scene.add(parts.group);
    return { parts, wrecked: false, washT: 0.3, burnT: 0 };
}

export function updateHelicopter(heli, dt) {
    if (!heli || !heli.parts) return;
    const p = heli.parts;
    if (!heli.wrecked) {
        // Rotor berputar CEPAT (menunggu penjemputan) + debu downwash tipis
        p.rotor.rotation.y += dt * ROTOR_SPEED;
        p.tailRotor.rotation.x += dt * TAIL_SPEED;
        heli.washT -= dt;
        if (heli.washT <= 0) {
            heli.washT = WASH_GAP;
            const a = Math.random() * 6.283, r = 18 + Math.random() * 14;
            spawnGroundPuff(p.group.position.x + Math.sin(a) * r,
                p.group.position.z + Math.cos(a) * r, 0x8a8378, 3 + Math.random() * 3, 2);
        }
        return;
    }
    // BANGKAI: asap hitam + bara membubung dari badan yang hangus
    heli.burnT -= dt;
    if (heli.burnT <= 0) {
        heli.burnT = BURN_GAP;
        const px = p.group.position.x + rand(-8, 8), pz = p.group.position.z + rand(-8, 8);
        spawnGroundPuff(px, pz, 0x2a2622, 5 + Math.random() * 4, 9 + Math.random() * 8);
        if (Math.random() < 0.3) spawnGroundPuff(px, pz, 0x8a5a14, 2.5, 7);   // bara amber redup
    }
    // API BERKOBAR terus (lidah api berkedip): skala/opasitas sin + goyang halus
    heli.fireT = (heli.fireT || 0) + dt;
    if (heli.flames) {
        for (const f of heli.flames) {
            const w = heli.fireT * f.freq + f.phase;
            const flick = 0.7 + 0.3 * Math.sin(w) + 0.12 * Math.sin(w * 3.3);
            f.spr.scale.set(f.sx * flick, f.sy * (0.75 + 0.45 * flick), 1);
            f.spr.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(w * 1.7));
            f.spr.position.set(f.ox + Math.sin(w * 2.1) * 0.6, f.oy + f.sy * (flick - 1) * 0.5, f.oz);
        }
    }
}

// Heli DIHANCURKAN (cutscene: tertembak meriam tank): ledakan besar, bilah
// rotor terlempar sebagai serpihan, bodi miring + gosong, beacon padam,
// genangan hangus. Bangkai tetap di scene (obstacle duel; asap via update).
export function blastHelicopter(heli) {
    if (!heli || heli.wrecked || !heli.parts) return;
    heli.wrecked = true;
    const p = heli.parts;
    const x = p.group.position.x, z = p.group.position.z;
    p.rotor.visible = false;                          // bilah utama terlempar...
    p.tailRotor.visible = false;
    // Serpihan HITAM (bukan hijau): gib rest di y 6 (di atas bangkai), genangan HITAM
    spawnGibs(x, 22, z, 12, 0, 0, 2.6, PAL.ink, 0.4, HELI_FLUID);       // ...jadi serpihan bilah 360°
    spawnGibs(x, 14, z, 10, 0, 0, 2.0, PAL.white, 0.4, HELI_FLUID);     // sobekan panel bodi
    explodeAt(new THREE.Vector3(x, 12, z), 22, 1);            // ledakan visual besar
    spawnBloodDecal(x, z, 9, HELI_FLUID);                     // genangan bocoran HITAM (heli bukan robot)
    p.paintMats.forEach(m => m.color && m.color.setHex(0x2a241c));   // cat gosong
    if (heli.parts.glassMat && heli.parts.glassMat.color) heli.parts.glassMat.color.setHex(0x191512);
    if (heli.beaconM) { heli.beaconM.emissiveIntensity = 0; heli.beaconM.color.setHex(0x2a241c); }
    p.group.rotation.z = 0.14;                        // bodi rebah miring
    p.group.rotation.x = 0.05;
    p.group.position.y = -1.2;                        // amblas sedikit
    // API BERKOBAR: beberapa lidah api menyala di badan (dianimasikan
    // updateHelicopter, menyala sepanjang sisa Stage 4). Parent ke grup bangkai
    // supaya ikut miring/amblas. "Sedikit" — kluster kecil di sekitar mesin/kabin.
    heli.flames = [];
    // "Sedikit" api (user): kluster kecil lidah api menjilat dari mesin/kabin —
    // proporsional dgn siluet heli, bukan inferno raksasa.
    const spots = [[0, 11, 0], [2.5, 9, 3], [-3, 10, -2.5], [1.5, 8, 6], [-1.5, 11, -5]];
    for (const [ox, oy, oz] of spots) {
        const spr = buildHeliFlameSprite();
        const sx = 4 + Math.random() * 2.5, sy = 6.5 + Math.random() * 3.5;
        spr.scale.set(sx, sy, 1);
        spr.position.set(ox, oy, oz);
        p.group.add(spr);
        heli.flames.push({ spr, ox, oy, oz, sx, sy, phase: Math.random() * 6.283, freq: 6 + Math.random() * 4 });
    }
    playSFX(sfxExplode);
}

export function disposeHelicopter(heli) {
    if (!heli || !heli.parts) return;
    // Sprite api & mesh: dispose material per-instance (tekstur api DIBAGI — jangan)
    heli.parts.group.traverse(o => { if ((o.isMesh || o.isSprite) && o.material && o.material.dispose) o.material.dispose(); });
    scene.remove(heli.parts.group);
    heli.parts = null;
    heli.flames = null;
}
