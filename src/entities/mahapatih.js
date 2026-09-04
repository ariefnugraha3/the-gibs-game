// M-0 MAHAPATIH — final Campaign boss. Entitas ini sengaja mandiri: tidak
// pernah masuk `robots`, tidak meminjam state Monas Survival, dan memiliki
// seluruh hit-volume, projectile, telegraph, hardline, serta wreck-nya sendiri.
// Semua pool dibuat saat createMahapatih(), bukan pada serangan pertama.

import { CFG } from '../core/config.js';
import { scene, camera, addCamShake } from '../core/renderer.js';
import { stats, player, addScore } from '../core/state.js';
import { queueBoom } from './robots.js';
import { explodeAt, spawnGroundPuff } from './effects.js';
import { spawnGibs } from './gore.js';
import { segPointDist2, clamp } from '../utils/math.js';
import { PAL, EMISSIVE_MAX } from '../world/palette.js';
import { mergeObjectInPlace } from '../utils/meshBatch.js';
import {
    playSFX, sfxTankMG, sfxTankMortar, sfxTankBlast, sfxTankExplode,
} from '../utils/sfx.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

const bossCfg = () => CFG.campaign.bosses.mahapatih;

// Bukaan cangkang siege. Nilai visual murni, jadi tetap di kode seperti amplitudo
// animasi lain — tidak ada gameplay yang membacanya.
const SHELL_OPEN_X = 27;    // seberapa jauh tiap paruh menggeser ke luar
const SHELL_ROLL = 0.66;    // rebah ke luar
const SHELL_DROP = 5;       // ambruk ke tanah

function mesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function box(parent, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
    return mesh(parent, new THREE.BoxGeometry(sx, sy, sz), mat,
        x, y, z, rx, ry, rz);
}

// Arah sebuah sumbu lokal setelah rotasi Euler XYZ (R = Rx*Ry*Rz). Dipakai untuk
// MEMBUKTIKAN ke mana sebuah bagian benar-benar menghadap: pada rig sebesar ini
// sebuah sudut bisa terlihat masuk akal dan tetap menunjuk 90 derajat meleset.
function axisDir(rot, v) {
    const s1 = Math.sin(rot.x), c1 = Math.cos(rot.x);
    const s2 = Math.sin(rot.y), c2 = Math.cos(rot.y);
    const s3 = Math.sin(rot.z), c3 = Math.cos(rot.z);
    return {
        x: (c2 * c3) * v[0] + (-c2 * s3) * v[1] + s2 * v[2],
        y: (c1 * s3 + s1 * s2 * c3) * v[0] + (c1 * c3 - s1 * s2 * s3) * v[1]
            + (-s1 * c2) * v[2],
        z: (s1 * s3 - c1 * s2 * c3) * v[0] + (s1 * c3 + c1 * s2 * s3) * v[1]
            + (c1 * c2) * v[2],
    };
}
const xyz = v => ({ x: v.x, y: v.y, z: v.z });

function mats() {
    return {
        armor: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
        armorDark: new THREE.MeshLambertMaterial({ color: PAL.ink }),
        plate: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
        ember: new THREE.MeshLambertMaterial({ color: PAL.amberDim,
            emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * 0.52 }),
        threat: new THREE.MeshLambertMaterial({ color: PAL.hazard,
            emissive: PAL.hazard, emissiveIntensity: EMISSIVE_MAX * 0.78 }),
        core: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
        dark: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
        glass: new THREE.MeshLambertMaterial({ color: PAL.screenBg,
            emissive: PAL.techDim, emissiveIntensity: EMISSIVE_MAX * 0.18,
            transparent: true, opacity: 0.82 }),
    };
}

function buildSiegeLeg(M, sideX, sideZ) {
    const hip = new THREE.Group(); hip.position.set(sideX * 18, 10, sideZ * 16);
    const upper = new THREE.Group(); hip.add(upper);
    box(upper, M.armor, 8, 18, 9, sideX * 4, -5, sideZ * 3,
        sideZ * 0.08, 0, -sideX * 0.18);
    box(upper, M.plate, 9, 4, 10, sideX * 5, 1, sideZ * 3);
    const knee = new THREE.Group(); knee.position.set(sideX * 7, -13, sideZ * 5);
    upper.add(knee);
    mesh(knee, new THREE.CylinderGeometry(3.2, 3.2, 8, 10), M.steel,
        0, 0, 0, Math.PI / 2, 0, 0);
    box(knee, M.armorDark, 7, 15, 7, sideX * 2, -8, sideZ * 2,
        sideZ * -0.08, 0, sideX * 0.1);
    const foot = box(knee, M.armor, 13, 4, 16, sideX * 3, -17, sideZ * 5);
    foot.userData.mahapatihFoot = true;
    return { hip, upper, knee, foot };
}

function buildBlade(M, side) {
    const pivot = new THREE.Group();
    mesh(pivot, new THREE.CylinderGeometry(1.2, 1.5, 15, 7), M.steel,
        0, -8, 0, 0, 0, side * 0.11);
    // Keris-inspired silhouette: three offset blade planes, restrained rather
    // than ornamental fantasy armour.
    box(pivot, M.ember, 2.8, 14, 1.1, side * 1.2, -19, 0, 0, 0, side * 0.13);
    box(pivot, M.ember, 2.4, 12, 0.9, -side * 0.5, -30, 0, 0, 0, -side * 0.12);
    mesh(pivot, new THREE.ConeGeometry(1.45, 7, 6), M.ember,
        side * 0.9, -39, 0, 0, 0, Math.PI);
    return pivot;
}

/** Build the two physically related silhouettes used by every boss phase. */
export function buildMahapatihMesh(scale = 1) {
    const group = new THREE.Group(); group.name = 'M0-Mahapatih-Sovereign-War-Body';
    const M = mats();

    // CHASSIS TERBELAH DUA (2026-09-04, permintaan user "ketika fase 1 hancur,
    // chasis itu terbelah 2 kemudian robot itu berdiri dan keluar"). Lambungnya
    // karena itu tidak lagi satu badan yang dilas, melainkan DUA paruh cangkang
    // kiri/kanan yang masing-masing dilas sendiri. `splitBox` mengiris tiap
    // kotak lambung pada bidang x = 0, jadi geometri yang digambar tetap sama
    // persis selama paruhnya masih rapat — belahannya baru terlihat saat dibuka.
    //
    // `siege` adalah JANGKAR bangkai: saat transisi ia DILEPAS dari `group` dan
    // dipindah ke parent dunia, sehingga cangkangnya tertinggal di tempat dan
    // tidak ikut ke mana pun robotnya pergi.
    const siege = new THREE.Group(); siege.name = 'Mahapatih-Siege-Chassis';
    group.add(siege);
    const shellL = new THREE.Group(); shellL.name = 'Siege-Shell-Port';
    const shellR = new THREE.Group(); shellR.name = 'Siege-Shell-Starboard';
    siege.add(shellL); siege.add(shellR);
    const rawL = new THREE.Group(), rawR = new THREE.Group();
    const splitBox = (mat, w, h, d, cx, cy, cz) => {
        const lo = cx - w / 2, hi = cx + w / 2;
        for (const [raw, a, b2] of [[rawL, lo, Math.min(hi, 0)],
            [rawR, Math.max(lo, 0), hi]]) {
            if (b2 - a <= 1e-6) continue;
            box(raw, mat, b2 - a, h, d, (a + b2) / 2, cy, cz);
        }
    };
    splitBox(M.armor, 43, 10, 34, 0, 16, 0);
    splitBox(M.armorDark, 34, 7, 40, -2, 21, 0);
    splitBox(M.plate, 25, 4, 31, -4, 27, 0);
    for (const z of [-15, 15]) {
        splitBox(M.armor, 31, 5, 7, 2, 19, z);
        for (const x of [-10, 0, 10]) splitBox(M.steel, 1.4, 5, 8, x, 22, z * 1.08);
    }
    for (const x of [-18, 18]) splitBox(M.armorDark, 8, 8, 27, x, 15, 0);
    const hullL = mergeObjectInPlace(rawL); hullL.name = 'Welded-Siege-Armour-Port';
    const hullR = mergeObjectInPlace(rawR); hullR.name = 'Welded-Siege-Armour-Starboard';
    shellL.add(hullL); shellR.add(hullR);
    const hull = hullL;   // kompatibilitas: rujukan lambung utama

    // Tiap kaki ikut paruh di sisinya, jadi cangkang yang terbelah membawa
    // kakinya sendiri alih-alih meninggalkan kaki melayang di tengah.
    const legs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = buildSiegeLeg(M, sx, sz);
        (sx < 0 ? shellL : shellR).add(leg.hip); legs.push(leg);
    }
    // DEPAN BOSS = +z LOKAL. `faceToward` menulis rotation.y = atan2(dx, dz),
    // dan sebuah grup ber-rotation.y memetakan +z lokal ke arah itu — jadi
    // SELURUH rig harus menghadap +z. Laras menara dulu diarahkan dengan
    // rz = PI/2, yang menunjuk ke -x: bossnya menghadap player tapi meriamnya
    // menembak 90 derajat ke samping.
    // Menara duduk di paruh KANAN: kalau tetap di jangkar, ia akan melayang di
    // udara begitu kedua cangkang membuka. Selama fase siege paruhnya belum
    // bergerak, jadi rantai rotasi menara tetap group.y + turret.y (aimTurret).
    const turret = new THREE.Group(); turret.position.set(0, 29, -2); shellR.add(turret);
    mesh(turret, new THREE.CylinderGeometry(10, 12, 6, 8), M.armor,
        0, 0, 0);
    box(turret, M.armorDark, 13, 4, 20, 0, 4, 4);
    const turretMuzzle = new THREE.Group(); turretMuzzle.position.set(0, 4, 9); turret.add(turretMuzzle);
    let turretAxis = null;
    for (const x of [-2.2, 0, 2.2]) {
        const barrel = mesh(turretMuzzle,
            new THREE.CylinderGeometry(0.65, 0.82, 21, 8), M.steel,
            x, 0, 8, Math.PI / 2, 0, 0);
        turretAxis = axisDir(barrel.rotation, [0, 1, 0]);
    }
    const muzzleFlash = mesh(turretMuzzle, new THREE.SphereGeometry(2.7, 8, 6),
        new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
            opacity: 0, depthWrite: false, toneMapped: false }), 0, 0, 19);
    muzzleFlash.castShadow = false;

    const combat = new THREE.Group(); combat.name = 'Mahapatih-Personal-Frame';
    combat.position.y = 9; group.add(combat);
    const pelvis = new THREE.Group(); pelvis.position.y = 7; combat.add(pelvis);
    box(pelvis, M.armorDark, 14, 7, 10, 0, 0, 0);
    const torso = new THREE.Group(); torso.position.y = 12; pelvis.add(torso);
    box(torso, M.armor, 19, 20, 12, 0, 6, 0);
    box(torso, M.plate, 22, 6, 14, 0, 9, 0);
    box(torso, M.armorDark, 13, 5, 14, 0, 17, 0);
    // Inti terbuka ada di DADA (muka +z), dan rananya menggeser ke kiri-kanan
    // (x) untuk menyingkap — dulu keduanya di sisi -x dan bergeser di z, jadi
    // inti yang harus ditembak menghadap ke samping.
    const core = mesh(torso, new THREE.SphereGeometry(4.2, 12, 8), M.core,
        0, 6, 6.2); core.castShadow = false;
    const shutterL = box(torso, M.armor, 5.8, 11, 2, -3.2, 6, 6.2, 0, 0, 0.08);
    const shutterR = box(torso, M.armor, 5.8, 11, 2, 3.2, 6, 6.2, 0, 0, -0.08);
    const neck = mesh(torso, new THREE.CylinderGeometry(2.4, 3, 4, 8), M.steel,
        0, 20, 0);
    const head = new THREE.Group(); head.position.set(0, 24, 0); torso.add(head);
    box(head, M.armorDark, 8, 7, 7, 0, 0, 0);
    box(head, M.plate, 8, 3, 6, 0, 2, 1);
    // Visor membentang melintang di WAJAH (+z), bukan di pipi kiri.
    const eye = box(head, M.core, 7.4, 1.4, 1, 0, 0.5, 4.1); eye.castShadow = false;
    const shoulderCannon = new THREE.Group(); shoulderCannon.position.set(-9, 20, 0); torso.add(shoulderCannon);
    box(shoulderCannon, M.armorDark, 6, 6, 13, 0, 0, 0);
    const cannonBarrel = mesh(shoulderCannon,
        new THREE.CylinderGeometry(1.2, 1.5, 15, 8), M.steel,
        0, 0, 9, Math.PI / 2, 0, 0);

    const arms = [], blades = [];
    for (const side of [-1, 1]) {
        // Lengan berada di KIRI dan KANAN badan (sumbu x). Versi lama menaruhnya
        // di z = +-10, yaitu satu di DEPAN dada dan satu di punggung — bertentangan
        // dengan torsonya sendiri, yang memang lebih lebar di x (19) daripada
        // dalam di z (12) seperti bahu manusia.
        const shoulder = new THREE.Group(); shoulder.position.set(side * 10, 16, 0); torso.add(shoulder);
        mesh(shoulder, new THREE.CylinderGeometry(4.6, 4.6, 7, 8), M.armor,
            0, 0, 0, 0, 0, Math.PI / 2);
        const arm = new THREE.Group(); arm.position.set(side * 3, -4, 0); shoulder.add(arm);
        box(arm, M.armor, 7, 17, 7, 0, -8, 0, 0, 0, side * 0.08);
        mesh(arm, new THREE.CylinderGeometry(2.5, 3, 5, 8), M.steel,
            0, -17, 0);
        const blade = buildBlade(M, side); blade.position.set(0, -17, 0); arm.add(blade);
        arms.push({ shoulder, arm }); blades.push(blade);
    }
    const legsCombat = [];
    for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(side * 5, -2, 0); pelvis.add(leg);
        box(leg, M.armor, 8, 18, 8, 0, -9, 0, 0, 0, side * 0.05);
        box(leg, M.armorDark, 11, 5, 13, side * 1.5, -19, 2);   // telapak ke +z
        legsCombat.push(leg);
    }
    combat.visible = false;
    group.scale.setScalar(scale);
    group.userData.mahapatihRig = true;
    // BENTUK YANG DIUKUR, bukan yang diniatkan. `faceToward` memutar grup dengan
    // rotation.y = atan2(dx, dz), jadi DEPAN boss adalah +z lokal dan setiap
    // bagian penunjuk arah wajib mengikutinya. Angka-angka ini dipublikasikan
    // supaya tes bisa mematok ARAH HASIL, bukan sudut yang tertulis.
    const form = {
        forward: 'z',
        turretAxis, cannonAxis: axisDir(cannonBarrel.rotation, [0, 1, 0]),
        eye: xyz(eye.position), core: xyz(core.position),
        shutters: [xyz(shutterL.position), xyz(shutterR.position)],
        shoulders: arms.map(a => xyz(a.shoulder.position)),
        upperArms: arms.map(a => xyz(a.arm.position)),
        legs: legsCombat.map(l => xyz(l.position)),
        siegeHips: legs.map(l => xyz(l.hip.position)),
        torso: { spanX: 19, depthZ: 12 },
    };
    return {
        group, siege, shellL, shellR, hull, hullL, hullR,
        legs, turret, turretMuzzle, muzzleFlash,
        combat, pelvis, torso, core, shutterL, shutterR, neck, head, eye,
        shoulderCannon, arms, blades, legsCombat, materials: M, form,
    };
}

export function buildMahapatihWaveMesh() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true,
        opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    for (const z of [-3, 0, 3]) box(g, mat, 2.4, 1.0, 13, 0, 1.1, z, 0, 0, z * 0.018);
    g.visible = false; return g;
}

export function buildMahapatihShellMesh() {
    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const hot = new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false });
    mesh(g, new THREE.CylinderGeometry(0.85, 1.1, 5.2, 8), body,
        0, 0, 0, 0, 0, Math.PI / 2);
    mesh(g, new THREE.ConeGeometry(0.86, 2.1, 8), body,
        3.6, 0, 0, 0, 0, -Math.PI / 2);
    mesh(g, new THREE.ConeGeometry(0.5, 1.3, 7), hot,
        -3.2, 0, 0, 0, 0, Math.PI / 2).castShadow = false;
    g.visible = false; return g;
}

function marker(radius, color = PAL.hazard) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true,
        opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(1, radius * 0.74), radius, 32), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.35; m.visible = false; return m;
}

function laneMarker(width = 18) {
    const mat = new THREE.MeshBasicMaterial({ color: PAL.hazard, transparent: true,
        opacity: 0.34, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, width), mat);
    m.visible = false; return m;
}

function buildHardline(index, count) {
    const group = new THREE.Group(); group.name = `Mahapatih-Hardline-${index + 1}`;
    const M = mats();
    const a = index / Math.max(1, count) * Math.PI * 2 + Math.PI / 4;
    const radius = 128;
    group.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    mesh(group, new THREE.CylinderGeometry(13, 16, 5, 8), M.armorDark, 0, 2.5, 0);
    mesh(group, new THREE.CylinderGeometry(9, 11, 12, 8), M.armor, 0, 9, 0);
    for (let i = 0; i < 4; i++) box(group, M.steel, 2, 10, 2,
        Math.cos(i * Math.PI / 2) * 8, 9, Math.sin(i * Math.PI / 2) * 8);
    const core = mesh(group, new THREE.SphereGeometry(4.2, 10, 7), M.core, 0, 15, 0);
    const cable = new THREE.Group();
    const len = radius - 13;
    box(cable, M.armorDark, len, 1.8, 4.2, -len / 2 - 12, 1.0, 0);
    box(cable, M.threat, len, 0.55, 1.1, -len / 2 - 12, 2.0, 0);
    cable.rotation.y = -a; group.add(cable);
    group.visible = false;
    return { group, core, cable, hp: 0, maxHp: 0, alive: true, hitT: 0, index };
}

function addTo(parent, object) { (parent || scene).add(object); return object; }

// LEPAS cangkang dari boss. Setelah ini `siege` bukan lagi anak `group`, jadi
// setiap pergerakan/putaran robot TIDAK menyeret bangkainya — inilah inti
// permintaan "chasis yang terbelah itu tidak boleh menempel dan mengikuti
// pergerakan robot, harus tertinggal di tempat". Polanya sama dengan turret tank
// Stage 4 yang terlepas menjadi benda dunia.
//
// Pose dunia dipertahankan dengan menyalin transform `group` ke jangkar: cangkang
// duduk di origin `group` (position 0, rotation 0), jadi menyalin posisi dan yaw
// menghasilkan pose yang identik pada frame pelepasan.
function detachSiege(b) {
    const p = b.parts;
    if (p.siege.parent === p.worldParent) return;
    p.worldParent.add(p.siege);
    p.siege.position.copy(p.group.position);
    p.siege.rotation.set(0, p.group.rotation.y, 0);
    p.siege.scale.copy(p.group.scale);
    b.siegeDetached = true;
}

function reattachSiege(b) {
    const p = b.parts;
    if (p.siege.parent !== p.group) p.group.add(p.siege);
    p.siege.position.set(0, 0, 0); p.siege.rotation.set(0, 0, 0);
    p.siege.scale.setScalar(1);
    for (const [shell, side] of [[p.shellL, -1], [p.shellR, 1]]) {
        shell.position.set(0, 0, 0); shell.rotation.set(0, 0, 0); void side;
    }
    b.siegeDetached = false;
}

// Membuka kedua paruh: menggeser ke luar, merebah keluar, dan ambruk sedikit.
// `k` 0..1 sepanjang transisi.
function openSiegeShells(b, k) {
    const p = b.parts, e = k * k * (3 - 2 * k);
    for (const [shell, side] of [[p.shellL, -1], [p.shellR, 1]]) {
        shell.position.x = side * SHELL_OPEN_X * e;
        shell.position.y = -SHELL_DROP * e;
        // Rz positif menjatuhkan puncak ke -x, jadi paruh kiri memakai +roll.
        shell.rotation.z = -side * SHELL_ROLL * e;
    }
}

/** Allocate the full final-boss rig and every phase asset up front. */
export function createMahapatih(opts = {}) {
    const B = bossCfg();
    const parent = opts.parent || scene;
    const parts = buildMahapatihMesh(opts.scale == null ? 1 : opts.scale);
    addTo(parent, parts.group);
    // Ke mana cangkang dipindahkan saat terlepas. Sengaja parent yang SAMA dengan
    // boss, bukan `scene`: di Stage 12 itu root dunia campaign, jadi bangkainya
    // ikut disembunyikan bersama dunianya.
    parts.worldParent = parent || scene;
    const artillery = [];
    for (let i = 0; i < Math.max(1, B.artillery.poolSize | 0); i++) {
        const shell = addTo(parent, buildMahapatihShellMesh());
        const mark = addTo(parent, marker(B.artillery.radius));
        artillery.push({ shell, marker: mark, active: false, t: 0, locked: false,
            x: 0, z: 0, offset: 0, serial: 0 });
    }
    const waves = [];
    for (let i = 0; i < Math.max(1, B.wave.poolSize | 0); i++) {
        const body = addTo(parent, buildMahapatihWaveMesh());
        waves.push({ body, active: false, x: 0, z: 0, dx: 0, dz: 0,
            speed: 0, life: 0, damage: 0, radius: 0, kind: 'wave' });
    }
    const shots = [];
    const shotCount = Math.max(4, (B.turret.burst | 0) + 2);
    const shotGeo = new THREE.SphereGeometry(1.15, 8, 6);
    const shotMat = new THREE.MeshBasicMaterial({ color: 0x72a8e8, toneMapped: false });
    for (let i = 0; i < shotCount; i++) {
        const body = new THREE.Mesh(shotGeo, shotMat); body.visible = false; addTo(parent, body);
        shots.push({ body, active: false, dx: 0, dz: 0, speed: 0,
            life: 0, damage: 0, radius: 2, kind: 'turret' });
    }
    const telegraphs = {
        charge: addTo(parent, laneMarker(B.charge.knockback * 0.5)),
        lunge: addTo(parent, laneMarker(B.lunge.width * 2)),
        seismicA: addTo(parent, marker(B.seismic.radius * 0.58, PAL.amber)),
        seismicB: addTo(parent, marker(B.seismic.radius, PAL.amber)),
        blade: addTo(parent, marker(B.blade.radius, PAL.amber)),
        sweep: addTo(parent, laneMarker(B.hardline.sweepWidth * 2)),
    };
    const hardlines = [];
    for (let i = 0; i < Math.max(1, B.hardline.anchorCount | 0); i++) {
        const h = buildHardline(i, B.hardline.anchorCount | 0);
        parts.group.add(h.group); hardlines.push(h);
    }
    const boss = {
        parent, parts, artillery, waves, shots, telegraphs, hardlines,
        active: false, phase: 'dormant', phaseSerial: 0, hp: 0, maxHp: 0,
        score: B.score, dead: false, deathDone: false, deathT: 0,
        transitionT: 0, siegeDetached: false,
        attackIndex: 0, attackState: 'cooldown', attackT: 0,
        attackData: null, turretLeft: 0, turretT: 0, hoverT: 0, hitT: 0,
        sweepAngle: 0, sweepState: 'telegraph', sweepT: B.hardline.sweepTelegraphSec,
        sweepHitCd: 0, shutterOpen: false, shutterT: B.core.shutterClosedSec,
        chargePath: null, lastChargePath: null, hazardsCleared: true,
        rewardGranted: false, callbackPhase: null, deathBase: null,
    };
    resetMahapatih(boss, opts);
    return boss;
}

function setVisible(b, visible) {
    b.parts.group.visible = visible;
    // Cangkang yang sudah terlepas bukan anak `group` lagi, jadi ia harus
    // disembunyikan/ditampilkan sendiri — kalau tidak, bangkainya tetap terlihat
    // setelah bossnya disembunyikan.
    if (b.parts.siege.parent !== b.parts.group) b.parts.siege.visible = visible;
    if (!visible) clearMahapatihHazards(b);
}

export function resetMahapatih(b, opts = {}) {
    if (!b) return;
    const B = bossCfg();
    clearMahapatihHazards(b);
    b.active = !!opts.active; b.dead = false; b.deathDone = false; b.deathT = 0;
    b.phase = b.active ? (opts.phase || 'siege') : 'dormant'; b.phaseSerial = 0;
    b.hp = B.siegeHp; b.maxHp = B.siegeHp; b.score = B.score;
    b.transitionT = 0; b.attackIndex = 0; b.attackState = 'cooldown';
    b.attackT = opts.holdSec == null ? B.attackGapSec : opts.holdSec;
    b.attackData = null; b.turretLeft = 0; b.turretT = 0; b.hoverT = 0; b.hitT = 0;
    b.sweepAngle = 0; b.sweepState = 'telegraph'; b.sweepT = B.hardline.sweepTelegraphSec;
    b.sweepHitCd = 0; b.shutterOpen = false; b.shutterT = B.core.shutterClosedSec;
    b.chargePath = null; b.lastChargePath = null; b.rewardGranted = false;
    b.callbackPhase = null; b.deathBase = null;
    const p = b.parts;
    p.group.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
    p.group.rotation.set(0, opts.yaw || 0, 0); p.group.scale.setScalar(opts.scale || 1);
    reattachSiege(b);
    p.siege.visible = b.active; p.combat.visible = false;
    p.combat.position.set(0, 9, 0); p.combat.rotation.set(0, 0, 0);
    p.turret.rotation.set(0, 0, 0); p.muzzleFlash.material.opacity = 0;
    p.core.visible = true; p.materials.core.color.setHex(0xff2020);
    p.shutterL.position.x = -3.2; p.shutterR.position.x = 3.2;
    p.materials.threat.emissiveIntensity = EMISSIVE_MAX * 0.78;
    for (const leg of p.legs) {
        leg.hip.rotation.set(0, 0, 0); leg.knee.rotation.set(0, 0, 0);
    }
    for (const arm of p.arms) {
        arm.shoulder.rotation.set(0, 0, 0); arm.arm.rotation.set(0, 0, 0);
    }
    for (const blade of p.blades) blade.rotation.set(0, 0, 0);
    for (const h of b.hardlines) {
        h.hp = h.maxHp = B.hardline.anchorHp; h.alive = true; h.hitT = 0;
        h.group.visible = false; h.core.visible = true; h.cable.visible = true;
        h.core.scale.setScalar(1);
    }
    setVisible(b, b.active);
}

// Loading-only visibility surface. It reveals every already-allocated program
// near the boss origin so campaignWorldRegistry/preload can compile all phases.
// resetMahapatih() restores authoritative gameplay visibility before enter.
export function setMahapatihWarmupVisible(b, visible = true) {
    if (!b) return;
    const at = b.parts.group.position;
    b.parts.group.visible = visible; b.parts.siege.visible = visible;
    b.parts.combat.visible = visible;
    for (const h of b.hardlines) h.group.visible = visible;
    let slot = 0;
    for (const a of b.artillery) {
        a.shell.visible = visible; a.marker.visible = visible;
        a.shell.position.set(at.x + (slot % 5) * 9 - 18, 7,
            at.z - 74 - ((slot / 5) | 0) * 12);
        a.marker.position.set(at.x + (slot % 5) * 9 - 18, 0.3,
            at.z - 74 - ((slot / 5) | 0) * 12); slot++;
    }
    slot = 0;
    for (const p of [...b.waves, ...b.shots]) {
        p.body.visible = visible; p.body.position.set(at.x + (slot % 8) * 7 - 25,
            2, at.z + 72 + ((slot / 8) | 0) * 9); slot++;
    }
    slot = 0;
    for (const t of Object.values(b.telegraphs)) {
        t.visible = visible; t.position.set(at.x + slot * 8 - 20, 0.25, at.z + 45); slot++;
    }
}

function hideProjectile(p) {
    p.active = false; p.body.visible = false;
}

/** Clear every damaging/telegraph surface without deleting the persistent rig. */
export function clearMahapatihHazards(b) {
    if (!b) return;
    for (const a of b.artillery || []) {
        a.active = false; a.shell.visible = false; a.marker.visible = false;
    }
    for (const p of b.waves || []) hideProjectile(p);
    for (const p of b.shots || []) hideProjectile(p);
    if (b.telegraphs) for (const t of Object.values(b.telegraphs)) t.visible = false;
    if (b.parts) b.parts.muzzleFlash.material.opacity = 0;
    b.hazardsCleared = true;
}

function phaseChanged(b, phase, ctx) {
    b.phase = phase; b.phaseSerial++; b.callbackPhase = phase;
    if (ctx.onPhase) ctx.onPhase(phase, b);
}

function gap(b) {
    const B = bossCfg();
    const frac = b.maxHp > 0 ? b.hp / b.maxHp : 1;
    return B.attackGapSec * (frac <= 0.35 ? B.enrageGapMul : 1);
}

function endAttack(b) {
    b.attackIndex++; b.attackState = 'cooldown'; b.attackT = gap(b);
    b.attackData = null; b.chargePath = null;
    for (const t of Object.values(b.telegraphs)) t.visible = false;
    b.hazardsCleared = !anyHazard(b);
}

function anyHazard(b) {
    return b.artillery.some(a => a.active)
        || b.waves.some(p => p.active) || b.shots.some(p => p.active)
        || Object.values(b.telegraphs).some(t => t.visible);
}

function faceToward(b, x, z, rate, dt) {
    const p = b.parts.group.position;
    const want = Math.atan2(x - p.x, z - p.z);
    let d = want - b.parts.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.parts.group.rotation.y += clamp(d, -rate * dt, rate * dt);
    return Math.abs(d);
}

function setLaneMesh(m, path) {
    const dx = path.x1 - path.x0, dz = path.z1 - path.z0;
    const len = Math.hypot(dx, dz);
    m.scale.x = Math.max(1, len); m.position.set((path.x0 + path.x1) / 2,
        0.3, (path.z0 + path.z1) / 2); m.rotation.y = -Math.atan2(dz, dx);
    m.visible = true;
}

function nearestChargePath(b, ctx) {
    const p = b.parts.group.position;
    const lanes = ctx.chargeLanes || [];
    if (!lanes.length) {
        const z = p.z < (ctx.center?.z || 0) ? (ctx.center?.z || 0) - 120 : (ctx.center?.z || 0) + 120;
        return { x0: p.x, z0: z, x1: p.x + (p.x < (ctx.center?.x || p.x) ? 220 : -220), z1: z };
    }
    let best = null, bestD = Infinity;
    for (const lane of lanes) for (const rev of [false, true]) {
        const x0 = rev ? lane.x1 : lane.x0, z0 = rev ? lane.z1 : lane.z0;
        const d = Math.hypot(p.x - x0, p.z - z0);
        if (d < bestD) {
            bestD = d; best = rev ? { x0: lane.x1, z0: lane.z1, x1: lane.x0, z1: lane.z0 }
                : { ...lane };
        }
    }
    return best;
}

function startArtillery(b) {
    const B = bossCfg();
    const angle = Math.atan2(camera.position.z - b.parts.group.position.z,
        camera.position.x - b.parts.group.position.x);
    const offsets = [-0.55, 0, 0.55];
    for (let i = 0; i < offsets.length; i++) {
        const a = b.artillery.find(x => !x.active); if (!a) break;
        const side = offsets[i];
        a.offset = side * 36;
        a.x = camera.position.x + Math.cos(angle + Math.PI / 2) * a.offset;
        a.z = camera.position.z + Math.sin(angle + Math.PI / 2) * a.offset;
        a.t = B.artillery.lockSec + B.artillery.incomingSec + i * 0.16;
        a.locked = false; a.active = true; a.marker.visible = true;
        a.marker.position.set(a.x, 0.38, a.z); a.marker.material.opacity = 0.32;
        a.shell.visible = true; a.shell.position.set(a.x, 90 + i * 10, a.z);
        a.shell.rotation.set(0, 0, -Math.PI / 2);
    }
    b.attackState = 'artillery'; b.hazardsCleared = false;
    playSFX(sfxTankMortar, 0.7);
}

function startSiegeAttack(b, ctx) {
    const B = bossCfg();
    switch (b.attackIndex % 4) {
    case 0:
        startArtillery(b); break;
    case 1: {
        const path = nearestChargePath(b, ctx);
        b.attackData = { path, state: 'align', hit: false };
        b.attackState = 'charge'; b.attackT = B.charge.telegraphSec;
        b.chargePath = path; b.lastChargePath = { ...path };
        break;
    }
    case 2:
        b.attackState = 'seismicTelegraph'; b.attackT = B.seismic.telegraphSec;
        b.telegraphs.seismicA.visible = true; b.telegraphs.seismicB.visible = true;
        b.hazardsCleared = false; break;
    default:
        b.attackState = 'turretTelegraph'; b.attackT = B.turret.telegraphSec;
        b.hazardsCleared = false; break;
    }
}

function startPersonalAttack(b) {
    const B = bossCfg();
    // Anchored/final phases deliberately retain only a small readable subset;
    // they never stack the entire Phase-2 moveset over the broadcast sweep.
    const choice = b.phase === 'hardline'
        ? (b.attackIndex % 2 ? 3 : 2)
        : b.phase === 'core' ? (b.attackIndex % 2 ? 3 : 0)
            : b.attackIndex % 4;
    switch (choice) {
    case 0:
        b.attackState = 'bladeTelegraph'; b.attackT = B.blade.telegraphSec;
        b.telegraphs.blade.visible = true; b.telegraphs.blade.position.set(
            b.parts.group.position.x, 0.36, b.parts.group.position.z);
        break;
    case 1: {
        const p = b.parts.group.position;
        const dx = camera.position.x - p.x, dz = camera.position.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const path = { x0: p.x, z0: p.z,
            x1: p.x + dx / d * 150, z1: p.z + dz / d * 150 };
        b.attackData = { path, hit: false }; b.chargePath = path;
        b.lastChargePath = { ...path }; setLaneMesh(b.telegraphs.lunge, path);
        b.attackState = 'lungeTelegraph'; b.attackT = B.lunge.telegraphSec; break;
    }
    case 2:
        b.attackState = 'waveTelegraph'; b.attackT = B.wave.telegraphSec; break;
    default:
        b.attackState = 'cannonTelegraph'; b.attackT = B.cannon.telegraphSec; break;
    }
    b.hazardsCleared = false;
}

function spawnShot(b, kind, speed, damage, radius, angle) {
    const p = b.shots.find(x => !x.active); if (!p) return false;
    const at = b.parts.group.position;
    p.active = true; p.kind = kind; p.speed = speed; p.damage = damage; p.radius = radius;
    p.dx = Math.cos(angle); p.dz = Math.sin(angle); p.life = 5;
    p.body.visible = true; p.body.position.set(at.x, kind === 'cannon' ? 24 : 29, at.z);
    p.body.scale.setScalar(kind === 'cannon' ? 2.2 : 1);
    return true;
}

function spawnWaves(b) {
    const B = bossCfg(), p = b.parts.group.position;
    const base = Math.atan2(camera.position.z - p.z, camera.position.x - p.x);
    for (const off of [-0.32, 0, 0.32]) {
        const w = b.waves.find(x => !x.active); if (!w) break;
        w.active = true; w.kind = 'wave'; w.x = p.x; w.z = p.z;
        w.dx = Math.cos(base + off); w.dz = Math.sin(base + off);
        w.speed = B.wave.speed; w.damage = B.wave.damage; w.radius = B.wave.radius;
        w.life = B.wave.lifeSec; w.body.visible = true;
        w.body.position.set(w.x, 0.7, w.z); w.body.rotation.y = -(base + off);
    }
}

function updateArtillery(b, dt) {
    const B = bossCfg();
    let alive = false;
    for (const a of b.artillery) if (a.active) {
        alive = true; a.t -= dt;
        const incoming = a.t <= B.artillery.incomingSec;
        // Before lock the marker tracks the current player position. Once the
        // incoming window starts, x/z freeze and remain inspectable in debug.
        if (!a.locked && !incoming) {
            const p = b.parts.group.position;
            const angle = Math.atan2(camera.position.z - p.z, camera.position.x - p.x);
            a.x = camera.position.x + Math.cos(angle + Math.PI / 2) * a.offset;
            a.z = camera.position.z + Math.sin(angle + Math.PI / 2) * a.offset;
            a.marker.position.set(a.x, 0.38, a.z);
            a.shell.position.x = a.x; a.shell.position.z = a.z;
        }
        if (incoming && !a.locked) { a.locked = true; a.marker.material.opacity = 0.82; }
        a.marker.scale.setScalar(0.94 + Math.sin(a.t * 15) * 0.04);
        if (incoming) a.shell.position.y = Math.max(3, 3 + 87 * a.t / B.artillery.incomingSec);
        if (a.t <= 0) {
            queueBoom(a.x, 2, a.z, B.artillery.radius, true,
                B.artillery.damage, 1, sfxTankBlast);
            a.active = false; a.shell.visible = false; a.marker.visible = false;
            addCamShake(2.4);
        }
    }
    if (!alive || !b.artillery.some(a => a.active)) endAttack(b);
}

function moveToward(group, x, z, speed, dt) {
    const dx = x - group.position.x, dz = z - group.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= speed * dt || d < 0.01) { group.position.x = x; group.position.z = z; return true; }
    group.position.x += dx / d * speed * dt; group.position.z += dz / d * speed * dt;
    return false;
}

function updateCharge(b, dt) {
    const B = bossCfg(), d = b.attackData, g = b.parts.group;
    if (!d) { endAttack(b); return; }
    if (d.state === 'align') {
        const arrived = moveToward(g, d.path.x0, d.path.z0, B.moveSpeed * 1.4, dt);
        faceToward(b, d.path.x1, d.path.z1, B.turnRadPerSec, dt);
        if (arrived) {
            d.state = 'telegraph'; b.attackT = B.charge.telegraphSec;
            setLaneMesh(b.telegraphs.charge, d.path);
        }
        return;
    }
    if (d.state === 'telegraph') {
        b.attackT -= dt;
        b.telegraphs.charge.material.opacity = 0.24 + Math.sin(b.hoverT * 16) * 0.1;
        if (b.attackT <= 0) { d.state = 'commit'; b.telegraphs.charge.visible = false; }
        return;
    }
    const oldX = g.position.x, oldZ = g.position.z;
    if (moveToward(g, d.path.x1, d.path.z1, B.charge.speed, dt)) {
        endAttack(b); return;
    }
    if (!d.hit && segPointDist2(oldX, 0, oldZ, g.position.x, 0, g.position.z,
        camera.position.x, 0, camera.position.z) < (B.bodyRadius + player.radius) ** 2) {
        d.hit = true; queueBoom(camera.position.x, 4, camera.position.z, 2,
            true, B.charge.damage, 1, sfxTankBlast); addCamShake(3);
    }
}

function updateSeismic(b, dt) {
    const B = bossCfg(), p = b.parts.group.position;
    b.attackT -= dt;
    b.telegraphs.seismicA.position.set(p.x, 0.36, p.z);
    b.telegraphs.seismicB.position.set(p.x, 0.35, p.z);
    if (b.attackState === 'seismicTelegraph' && b.attackT <= 0) {
        const yaw = b.parts.group.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
        queueBoom(p.x + fx * B.seismic.radius * 0.36, 2,
            p.z + fz * B.seismic.radius * 0.36, B.seismic.radius * 0.62,
            true, B.seismic.damage, 1, sfxTankBlast);
        b.telegraphs.seismicA.visible = false;
        b.attackState = 'seismicSecond'; b.attackT = B.seismic.gapSec;
    } else if (b.attackState === 'seismicSecond' && b.attackT <= 0) {
        const yaw = b.parts.group.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
        queueBoom(p.x + fx * B.seismic.radius * 0.72, 2,
            p.z + fz * B.seismic.radius * 0.72, B.seismic.radius * 0.68,
            true, B.seismic.damage, 1, sfxTankBlast);
        b.telegraphs.seismicB.visible = false; endAttack(b);
    }
}

// Menara membidik SENDIRI. Badan sudah diputar `faceToward`, jadi yang tersisa
// hanyalah sudut sisa terhadap player — tanpa ini laras diam menghadap lurus ke
// depan sementara peluru berangkat ke arah lain, dan itulah yang membuat
// tembakannya terlihat tidak keluar dari moncongnya.
function aimTurret(b, dt) {
    const g = b.parts.group, t = b.parts.turret;
    const want = Math.atan2(camera.position.x - g.position.x,
        camera.position.z - g.position.z) - g.rotation.y;
    let d = want - t.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    t.rotation.y += clamp(d, -2.6 * dt, 2.6 * dt);
}

function updateTurretAttack(b, dt) {
    const B = bossCfg(), p = b.parts.group.position;
    if (b.attackState === 'turretTelegraph') {
        b.attackT -= dt;
        faceToward(b, camera.position.x, camera.position.z, B.turnRadPerSec, dt);
        aimTurret(b, dt);
        if (b.attackT <= 0) {
            b.attackState = 'turretBurst'; b.turretLeft = B.turret.burst | 0; b.turretT = 0;
        }
        return;
    }
    if (b.attackState === 'turretBurst') {
        b.turretT -= dt;
        aimTurret(b, dt);
        if (b.turretLeft > 0 && b.turretT <= 0) {
            const a = Math.atan2(camera.position.z - p.z, camera.position.x - p.x);
            spawnShot(b, 'turret', B.turret.bulletSpeed, B.turret.damage, 2.4, a);
            b.parts.muzzleFlash.material.opacity = 1; playSFX(sfxTankMG, 0.45);
            b.turretLeft--; b.turretT = B.turret.intervalSec;
        }
        if (b.turretLeft <= 0 && b.turretT <= 0) b.attackState = 'waitProjectiles';
    }
}

function updateBlade(b, dt) {
    const B = bossCfg(), p = b.parts.group.position;
    b.attackT -= dt; b.telegraphs.blade.position.set(p.x, 0.35, p.z);
    if (b.attackState === 'bladeTelegraph' && b.attackT <= 0) {
        // KEDUA pedang menebas KE DEPAN. Versi lama memberi tanda berlawanan,
        // jadi satu pedang selalu menebas ke belakang boss — ke tempat yang
        // tidak pernah menjadi sasaran serangan ini.
        b.parts.blades[0].rotation.set(-1.25, 0, 0);
        b.parts.blades[1].rotation.set(-1.25, 0, 0);
        queueBoom(p.x, 4, p.z, B.blade.radius, true, B.blade.damage, 1, sfxTankBlast);
        b.attackState = 'bladeSecond'; b.attackT = B.blade.secondGapSec;
    } else if (b.attackState === 'bladeSecond' && b.attackT <= 0) {
        // Beat kedua: tebasan SILANG ke luar, tetap di depan badan.
        b.parts.blades[0].rotation.set(-0.55, 0, -1.15);
        b.parts.blades[1].rotation.set(-0.55, 0, 1.15);
        queueBoom(p.x, 4, p.z, B.blade.radius, true, B.blade.damage, 1, sfxTankBlast);
        b.telegraphs.blade.visible = false; endAttack(b);
    }
}

function updateLunge(b, dt, ctx) {
    const B = bossCfg(), d = b.attackData, g = b.parts.group;
    if (b.attackState === 'lungeTelegraph') {
        b.attackT -= dt;
        if (b.attackT <= 0) { b.attackState = 'lungeCommit'; b.telegraphs.lunge.visible = false; }
        return;
    }
    const oldX = g.position.x, oldZ = g.position.z;
    if (moveToward(g, d.path.x1, d.path.z1, B.lunge.speed, dt)) { endAttack(b); return; }
    if (ctx.clampBoss) ctx.clampBoss(g.position);
    if (!d.hit && segPointDist2(oldX, 0, oldZ, g.position.x, 0, g.position.z,
        camera.position.x, 0, camera.position.z) < (B.lunge.width + player.radius) ** 2) {
        d.hit = true; queueBoom(camera.position.x, 4, camera.position.z, 2,
            true, B.lunge.damage, 1, sfxTankBlast);
    }
}

function updatePersonalAttack(b, dt, ctx) {
    const B = bossCfg();
    if (b.attackState === 'bladeTelegraph' || b.attackState === 'bladeSecond') {
        updateBlade(b, dt); return;
    }
    if (b.attackState === 'lungeTelegraph' || b.attackState === 'lungeCommit') {
        updateLunge(b, dt, ctx); return;
    }
    if (b.attackState === 'waveTelegraph') {
        b.attackT -= dt;
        if (b.attackT <= 0) { spawnWaves(b); b.attackState = 'waitProjectiles'; }
        return;
    }
    if (b.attackState === 'cannonTelegraph') {
        b.attackT -= dt;
        if (b.attackT <= 0) {
            const p = b.parts.group.position;
            const a = Math.atan2(camera.position.z - p.z, camera.position.x - p.x);
            spawnShot(b, 'cannon', B.cannon.speed, B.cannon.damage, B.cannon.radius, a);
            playSFX(sfxTankMortar, 0.7); b.attackState = 'waitProjectiles';
        }
    }
}

function updateProjectiles(b, dt, ctx) {
    for (const p of b.waves) if (p.active) {
        const oldX = p.x, oldZ = p.z;
        p.x += p.dx * p.speed * dt; p.z += p.dz * p.speed * dt; p.life -= dt;
        p.body.position.set(p.x, 0.7, p.z);
        if (segPointDist2(oldX, 0, oldZ, p.x, 0, p.z,
            camera.position.x, 0, camera.position.z) < (p.radius + player.radius) ** 2) {
            queueBoom(p.x, 2, p.z, p.radius, true, p.damage, 1, sfxTankBlast); hideProjectile(p);
        } else if (p.life <= 0 || (ctx.projectileAllowed && !ctx.projectileAllowed(p.x, p.z))) hideProjectile(p);
    }
    for (const p of b.shots) if (p.active) {
        const oldX = p.body.position.x, oldZ = p.body.position.z;
        p.body.position.x += p.dx * p.speed * dt; p.body.position.z += p.dz * p.speed * dt;
        p.life -= dt;
        if (segPointDist2(oldX, 0, oldZ, p.body.position.x, 0, p.body.position.z,
            camera.position.x, 0, camera.position.z) < (p.radius + player.radius) ** 2) {
            queueBoom(p.body.position.x, 3, p.body.position.z, p.radius,
                true, p.damage, 1, sfxTankBlast); hideProjectile(p);
        } else if (p.life <= 0 || (ctx.projectileAllowed
            && !ctx.projectileAllowed(p.body.position.x, p.body.position.z))) hideProjectile(p);
    }
}

function beginTransition(b, ctx) {
    const B = bossCfg(); clearMahapatihHazards(b);
    b.hp = 0; b.transitionT = B.transitionSec; b.attackState = 'transition';
    // Cangkang dilepas PADA FRAME PECAHNYA, bukan di akhir animasi: sejak detik
    // ini boss boleh bergerak dan bangkainya tetap di tempat.
    detachSiege(b);
    phaseChanged(b, 'transition', ctx); addCamShake(5);
    explodeAt(new THREE.Vector3(b.parts.group.position.x, 18,
        b.parts.group.position.z), 18, 1, sfxTankExplode);
}

function finishTransition(b, ctx) {
    const B = bossCfg(), p = b.parts;
    openSiegeShells(b, 1);        // cangkang berhenti terbuka, dan DIAM di sana
    p.combat.visible = true; p.combat.position.y = 9;
    b.hp = b.maxHp = B.combatHp; b.attackIndex = 0; b.attackState = 'cooldown'; b.attackT = B.attackGapSec;
    phaseChanged(b, 'personal', ctx);
}

function beginHardline(b, ctx) {
    const B = bossCfg(); clearMahapatihHazards(b);
    b.hp = 0; b.maxHp = B.combatHp; b.attackIndex = 2;
    b.attackState = 'cooldown'; b.attackT = B.attackGapSec;
    b.sweepState = 'telegraph'; b.sweepT = B.hardline.sweepTelegraphSec;
    b.sweepAngle = 0; b.sweepHitCd = 0;
    for (const h of b.hardlines) {
        h.hp = h.maxHp = B.hardline.anchorHp; h.alive = true;
        h.group.visible = true; h.core.visible = true; h.cable.visible = true;
    }
    phaseChanged(b, 'hardline', ctx);
}

function beginCore(b, ctx) {
    const B = bossCfg(); clearMahapatihHazards(b);
    b.hp = b.maxHp = B.coreHp; b.attackIndex = 2;
    b.attackState = 'cooldown'; b.attackT = B.attackGapSec;
    b.shutterOpen = false; b.shutterT = B.core.shutterClosedSec;
    phaseChanged(b, 'core', ctx);
}

function killMahapatih(b, ctx) {
    const B = bossCfg(); clearMahapatihHazards(b);
    b.hp = 0; b.dead = true; b.deathDone = false; b.deathT = 0;
    // Titik jangkar animasi mati: pergeseran wreck dihitung sbg INTEGRAL dari
    // titik ini (bukan akumulasi per-frame), supaya satu dt besar menghasilkan
    // posisi akhir yang sama dengan banyak dt kecil.
    b.deathBase = { x: b.parts.group.position.x, z: b.parts.group.position.z,
        combatX: b.parts.combat.position.x };
    b.attackState = 'dead';
    if (!b.rewardGranted) { b.rewardGranted = true; addScore(B.score); stats.kills++; }
    phaseChanged(b, 'dying', ctx); addCamShake(7);
    explodeAt(new THREE.Vector3(b.parts.group.position.x, 18,
        b.parts.group.position.z), 24, 1, sfxTankExplode);
}

function updateHardlineSweep(b, dt) {
    const B = bossCfg(), t = b.telegraphs.sweep, p = b.parts.group.position;
    b.sweepHitCd = Math.max(0, b.sweepHitCd - dt);
    if (b.sweepState === 'telegraph') {
        b.sweepT -= dt; t.visible = true; t.position.set(p.x, 0.32, p.z);
        t.scale.x = 300; t.rotation.y = b.sweepAngle;
        t.material.opacity = 0.18 + Math.sin(b.hoverT * 15) * 0.07;
        if (b.sweepT <= 0) { b.sweepState = 'active'; t.material.opacity = 0.52; }
        return;
    }
    b.sweepAngle += B.hardline.sweepRadPerSec * dt; t.rotation.y = b.sweepAngle;
    const dx = camera.position.x - p.x, dz = camera.position.z - p.z;
    const side = Math.abs(-Math.sin(b.sweepAngle) * dx + Math.cos(b.sweepAngle) * dz);
    const along = Math.abs(Math.cos(b.sweepAngle) * dx + Math.sin(b.sweepAngle) * dz);
    const playerAngle = Math.atan2(dz, dx);
    let quadrant = Math.round((playerAngle - Math.PI / 4) / (Math.PI * 2)
        * b.hardlines.length);
    quadrant = ((quadrant % b.hardlines.length) + b.hardlines.length) % b.hardlines.length;
    // Destroying an anchor permanently makes its arena quadrant safe.
    const sectorPowered = !!b.hardlines[quadrant]?.alive;
    if (sectorPowered && side < B.hardline.sweepWidth + player.radius
        && along < 150 && b.sweepHitCd <= 0) {
        queueBoom(camera.position.x, 3, camera.position.z, 2, true,
            B.hardline.sweepDamage, 1, sfxTankBlast);
        b.sweepHitCd = 0.8;
    }
}

function updateCoreShutters(b, dt) {
    const B = bossCfg(); b.shutterT -= dt;
    if (b.shutterT <= 0) {
        b.shutterOpen = !b.shutterOpen;
        b.shutterT = b.shutterOpen ? B.core.shutterOpenSec : B.core.shutterClosedSec;
    }
    const target = b.shutterOpen ? 8.5 : 3.2;
    b.parts.shutterL.position.x += (-target - b.parts.shutterL.position.x) * Math.min(1, dt * 7);
    b.parts.shutterR.position.x += (target - b.parts.shutterR.position.x) * Math.min(1, dt * 7);
}

function bodyHit(b, bx, bz, px, pz) {
    const B = bossCfg(), p = b.parts.group.position;
    return segPointDist2(px, 0, pz, bx, 0, bz, p.x, 0, p.z) < B.hitRadius ** 2;
}

/**
 * Swept hit for ONE just-moved player bullet. Called by the scene's
 * `bulletBlocked` hook inside updateBullets, before world collision consumes the
 * shot. Returning true tells the shared bullet loop to remove/impact it.
 */
export function mahapatihBulletHit(b, shot, ctx = {}) {
    if (!b || !shot || !b.active || b.dead || b.phase === 'transition'
        || b.phase === 'dormant' || b.phase === 'dying' || b.phase === 'wreck') return false;
    const B = bossCfg();
    const bx = shot.mesh.position.x, bz = shot.mesh.position.z;
    if (b.phase === 'hardline') {
        for (const h of b.hardlines) if (h.alive) {
            h.group.getWorldPosition(tmp);
            if (segPointDist2(shot.px, 0, shot.pz, bx, 0, bz,
                tmp.x, 0, tmp.z) < B.hardline.hitRadius ** 2) {
                const damage = shot.damage != null ? shot.damage : CFG.weapons.bulletDamage;
                h.hp -= Math.max(1, damage); h.hitT = 1; stats.hits++;
                if (h.hp <= 0) {
                    h.hp = 0; h.alive = false; h.core.visible = false; h.cable.visible = false;
                    explodeAt(new THREE.Vector3(tmp.x, 7, tmp.z), 12, 1, sfxTankExplode);
                    const remaining = b.hardlines.filter(x => x.alive).length;
                    if (ctx.onAnchor) ctx.onAnchor(h.index, remaining);
                    if (remaining === 0) beginCore(b, ctx);
                }
                return true;
            }
        }
        // Direct body fire strikes the visibly powered shield and is consumed.
        return bodyHit(b, bx, bz, shot.px, shot.pz);
    }
    if (!bodyHit(b, bx, bz, shot.px, shot.pz)) return false;
    if (b.phase !== 'core' || b.shutterOpen) {
        const damage = shot.damage != null ? shot.damage : CFG.weapons.bulletDamage;
        damageMahapatih(b, damage, { ctx }); stats.hits++;
    }
    // Closed core shutters still physically stop the bullet but take no damage.
    return true;
}

/** Direct debug/external damage; normal gunplay is handled by swept hit tests. */
export function damageMahapatih(b, damage, opts = {}) {
    if (!b || !b.active || b.dead || b.phase === 'dormant'
        || b.phase === 'transition' || b.phase === 'hardline') return false;
    if (b.phase === 'core' && !b.shutterOpen && !opts.force) return false;
    const ctx = opts.ctx || {};
    b.hp -= Math.max(1, damage); b.hitT = 1;
    if (b.hp <= 0) {
        if (b.phase === 'siege') beginTransition(b, ctx);
        else if (b.phase === 'personal') beginHardline(b, ctx);
        else if (b.phase === 'core') killMahapatih(b, ctx);
    }
    return true;
}

function updateRig(b, dt) {
    const p = b.parts; b.hoverT += dt;
    p.muzzleFlash.material.opacity = Math.max(0, p.muzzleFlash.material.opacity - dt * 12);
    if (b.hitT > 0) b.hitT = Math.max(0, b.hitT - dt * 6);
    const stride = Math.sin(b.hoverT * (b.phase === 'siege' ? 5 : 7));
    if (b.phase === 'siege') {
        // Menara MELACAK player terus-menerus, bukan hanya saat menembak: sebuah
        // meriam yang diam menghadap lurus ke depan lalu tiba-tiba melepas
        // peluru ke samping adalah persis yang membuat serangannya terlihat
        // tidak keluar dari moncongnya.
        if (!b.dead) aimTurret(b, dt);
        for (let i = 0; i < p.legs.length; i++) {
            // Langkah mengayun MAJU-MUNDUR: kaki menggantung ke -y, jadi ayunan
            // sepanjang arah jalan (+z) adalah rotasi terhadap x. Versi lama
            // memakai rotation.z, yang menggeser telapak ke samping — chassis-nya
            // terlihat mengesot, bukan melangkah.
            p.legs[i].hip.rotation.x = stride * (i % 2 ? -0.12 : 0.12);
            p.legs[i].knee.rotation.x = stride * (i % 2 ? 0.08 : -0.08);
        }
    } else if (b.phase === 'personal' || b.phase === 'hardline' || b.phase === 'core') {
        p.combat.position.y = 9 + Math.sin(b.hoverT * 2.4) * 0.35;
        p.head.rotation.y = Math.sin(b.hoverT * 0.7) * 0.08;
        if (!b.attackState.startsWith('blade')) for (const blade of p.blades)
            blade.rotation.x *= Math.max(0, 1 - dt * 5);
    }
    p.materials.core.color.setHex(b.hitT > 0 ? PAL.white : 0xff2020);
    for (const h of b.hardlines) {
        h.hitT = Math.max(0, h.hitT - dt * 5);
        if (h.core.visible) h.core.scale.setScalar(1 + h.hitT * 0.24);
    }
}

function updateDeath(b, dt, ctx) {
    const B = bossCfg(), p = b.parts; b.deathT += dt;
    const k = Math.min(1, b.deathT / Math.max(0.1, B.deathSec));
    p.materials.threat.emissiveIntensity = EMISSIVE_MAX * 0.78 * (1 - k);
    p.materials.ember.emissiveIntensity = EMISSIVE_MAX * 0.52 * (1 - k);
    p.core.scale.setScalar(Math.max(0.1, 1 - k * 0.9));
    p.combat.rotation.z = -k * 1.08;
    const base = b.deathBase || (b.deathBase = { x: p.group.position.x,
        z: p.group.position.z, combatX: p.combat.position.x });
    p.combat.position.x = base.combatX - k * B.deathSec * 4.5;
    const dx = ctx.wreckDir?.x == null ? -1 : ctx.wreckDir.x;
    const dz = ctx.wreckDir?.z == null ? 0.25 : ctx.wreckDir.z;
    // Integral dari laju lama (dt*(1-k)*5) sepanjang deathSec = 2.5*deathSec*k*(2-k).
    const slide = 2.5 * B.deathSec * k * (2 - k);
    p.group.position.x = base.x + dx * slide;
    p.group.position.z = base.z + dz * slide;
    if (Math.floor(b.deathT * 4) !== Math.floor((b.deathT - dt) * 4) && b.deathT < B.deathSec * 0.75) {
        spawnGroundPuff(p.group.position.x, p.group.position.z, PAL.concrete,
            5 + k * 5, 4 + 12 * (1 - k));
        spawnGibs(p.group.position.x, 12, p.group.position.z, 2,
            dx, dz, 1.2, PAL.gunmetal, 0.2);
    }
    if (b.deathT >= B.deathSec) {
        b.deathDone = true; b.dead = true; phaseChanged(b, 'wreck', ctx);
        p.core.visible = false; p.combat.rotation.z = -1.08;
    }
}

/** Advance one boss frame. Context keeps map geometry out of the entity. */
export function updateMahapatih(b, dt, ctx = {}) {
    if (!b || !b.active) return;
    updateRig(b, dt); updateProjectiles(b, dt, ctx);
    if (b.phase === 'dying') { updateDeath(b, dt, ctx); return; }
    if (b.phase === 'wreck' || b.phase === 'dormant') return;
    if (b.phase === 'transition') {
        b.transitionT -= dt;
        const k = 1 - Math.max(0, b.transitionT) / Math.max(0.1, bossCfg().transitionSec);
        openSiegeShells(b, k);
        // Robot BERDIRI keluar dari dalam cangkang yang membuka.
        b.parts.combat.visible = k > 0.28; b.parts.combat.position.y = -7 + k * 16;
        if (b.transitionT <= 0) finishTransition(b, ctx);
        return;
    }
    if (ctx.clampBoss) ctx.clampBoss(b.parts.group.position);
    if (b.phase === 'hardline') updateHardlineSweep(b, dt);
    if (b.phase === 'core') updateCoreShutters(b, dt);
    if (!ctx.allowAttack) return;

    // Track player only outside committed paths. Phase 2 is faster but bounded
    // by the stage-supplied clamp and never teleports.
    if (b.attackState === 'cooldown') {
        const B = bossCfg();
        if (b.phase === 'personal') {
            const dx = camera.position.x - b.parts.group.position.x;
            const dz = camera.position.z - b.parts.group.position.z;
            const d = Math.hypot(dx, dz);
            if (d > 72) {
                b.parts.group.position.x += dx / d * B.combat.speed * dt;
                b.parts.group.position.z += dz / d * B.combat.speed * dt;
                if (ctx.clampBoss) ctx.clampBoss(b.parts.group.position);
            }
        }
        faceToward(b, camera.position.x, camera.position.z, B.turnRadPerSec, dt);
        b.attackT -= dt;
        if (b.attackT <= 0 && !anyHazard(b)) {
            if (b.phase === 'siege') startSiegeAttack(b, ctx);
            else startPersonalAttack(b);
        }
        return;
    }
    if (b.attackState === 'artillery') updateArtillery(b, dt);
    else if (b.attackState === 'charge') updateCharge(b, dt);
    else if (b.attackState === 'seismicTelegraph' || b.attackState === 'seismicSecond') updateSeismic(b, dt);
    else if (b.attackState === 'turretTelegraph' || b.attackState === 'turretBurst') updateTurretAttack(b, dt);
    else if (b.attackState === 'waitProjectiles') {
        if (!b.waves.some(p => p.active) && !b.shots.some(p => p.active)) endAttack(b);
    } else updatePersonalAttack(b, dt, ctx);
}

function pushCircle(pos, x, z, radius) {
    const dx = pos.x - x, dz = pos.z - z, d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return false;
    if (d2 < 1e-6) { pos.x = x - radius; return true; }
    const d = Math.sqrt(d2); pos.x = x + dx / d * radius; pos.z = z + dz / d * radius;
    return true;
}

/** Player/body collision that follows the visible phase and persistent wreck. */
export function resolveMahapatihBlock(b, pos, radius = player.radius) {
    if (!b || !b.active || !b.parts.group.visible) return false;
    const B = bossCfg(), p = b.parts.group.position;
    let hit = pushCircle(pos, p.x, p.z,
        radius + B.bodyRadius * (b.phase === 'personal' || b.phase === 'core' ? 0.72 : 1));
    if (b.phase === 'hardline') for (const h of b.hardlines) if (h.alive) {
        h.group.getWorldPosition(tmp);
        hit = pushCircle(pos, tmp.x, tmp.z, radius + B.hardline.hitRadius * 0.72) || hit;
    }
    return hit;
}

/** Direct anchor damage surface for deterministic smoke/debug phase simulation. */
export function damageMahapatihHardline(b, index, damage, ctx = {}) {
    if (!b || b.phase !== 'hardline') return false;
    const h = b.hardlines[index];
    if (!h || !h.alive) return false;
    h.hp -= Math.max(1, damage); h.hitT = 1;
    if (h.hp <= 0) {
        h.hp = 0; h.alive = false; h.core.visible = false; h.cable.visible = false;
        h.group.getWorldPosition(tmp);
        explodeAt(new THREE.Vector3(tmp.x, 7, tmp.z), 12, 1, sfxTankExplode);
        const remaining = b.hardlines.filter(x => x.alive).length;
        if (ctx.onAnchor) ctx.onAnchor(h.index, remaining);
        if (remaining === 0) beginCore(b, ctx);
    }
    return true;
}

export function disposeMahapatih(b) {
    if (!b) return;
    clearMahapatihHazards(b); b.active = false;
    const roots = [b.parts.group,
        ...b.artillery.flatMap(a => [a.shell, a.marker]),
        ...b.waves.map(p => p.body), ...b.shots.map(p => p.body),
        ...Object.values(b.telegraphs)];
    for (const root of roots) {
        if (root.parent) root.parent.remove(root);
        root.traverse?.(o => {
            if (o.geometry?.dispose) o.geometry.dispose();
            const materials = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
            for (const m of materials) if (m.dispose) m.dispose();
        });
    }
}

export function mahapatihDebug(b) {
    if (!b) return null;
    const B = bossCfg();
    return {
        active: b.active, phase: b.phase, phaseSerial: b.phaseSerial,
        form: b.parts.form,
        // Bangkai cangkang: terlepas dari boss dan tertinggal di tempatnya.
        wreck: {
            detached: b.siegeDetached === true,
            attachedToBoss: b.parts.siege.parent === b.parts.group,
            anchor: { x: b.parts.siege.position.x, y: b.parts.siege.position.y,
                z: b.parts.siege.position.z, yaw: b.parts.siege.rotation.y },
            shells: [b.parts.shellL, b.parts.shellR].map(sh => ({
                x: sh.position.x, y: sh.position.y, rz: sh.rotation.z })),
            splitGap: b.parts.shellR.position.x - b.parts.shellL.position.x,
        },
        hp: b.hp, maxHp: b.maxHp, dead: b.dead, deathDone: b.deathDone,
        rewardGranted: b.rewardGranted, attack: b.attackState,
        attackIndex: b.attackIndex, attackT: b.attackT,
        hitVolumes: {
            body: { x: b.parts.group.position.x, z: b.parts.group.position.z,
                radius: B.hitRadius },
            collisionRadius: B.bodyRadius,
            coreOpen: b.phase === 'core' && b.shutterOpen,
        },
        transitionComplete: b.phase !== 'transition',
        hardlines: b.hardlines.map(h => {
            const p = new THREE.Vector3(); h.group.getWorldPosition(p);
            return { index: h.index, hp: h.hp, maxHp: h.maxHp,
                alive: h.alive, visible: h.group.visible, x: p.x, z: p.z,
                hazardSectorEnabled: h.alive };
        }),
        anchorsRemaining: b.hardlines.filter(h => h.alive).length,
        countermand: b.phase === 'hardline' ? {
            state: b.sweepState, angle: b.sweepAngle, telegraphT: b.sweepT,
        } : null,
        artillery: b.artillery.map(a => ({ active: a.active, locked: a.locked,
            x: a.x, z: a.z, time: a.t })),
        telegraphs: Object.fromEntries(Object.entries(b.telegraphs)
            .map(([key, value]) => [key, { visible: value.visible,
                x: value.position.x, z: value.position.z,
                opacity: value.material.opacity } ])),
        chargePath: b.chargePath ? { ...b.chargePath } : null,
        lastChargePath: b.lastChargePath ? { ...b.lastChargePath } : null,
        pools: { artillery: b.artillery.length, waves: b.waves.length,
            shots: b.shots.length },
        activeProjectiles: b.artillery.filter(a => a.active).length
            + b.waves.filter(p => p.active).length + b.shots.filter(p => p.active).length,
        hazardsCleared: !anyHazard(b), wreckVisible: b.phase === 'wreck' && b.parts.group.visible,
        zeroPointLights: (() => {
            let n = 0; b.parts.group.traverse(o => { if (o.isPointLight) n++; }); return n === 0;
        })(),
    };
}
