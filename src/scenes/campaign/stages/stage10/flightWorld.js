// Stage 10 — scrolling top-down air-combat world and prebuilt entity pools.
//
// Bentuknya mengikuti referensi user (Air Strike 1944): pesawat player di bawah
// layar, gelombang pesawat musuh turun dari atas dalam FORMASI, instalasi darat
// yang ikut menggulung bersama medan, power-up bom, dan satu
// bomber boss di akhir misi. SEMUA mesh, material dan pool dibangun di sini satu
// kali; runtime (flight.js) tidak pernah membuat objek baru.

import { scene, viewCam } from '../../../../core/renderer.js';
import { CFG } from '../../../../core/config.js';
import { PAL } from '../../../../world/palette.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { buildArmedHeavyAircraft, transportDebug } from '../stage9/aircraft.js';

export const STAGE10_FLIGHT_KEY = 'campaign-10-flight';
export const S10_FLIGHT_X = 420000;
export const S10_FLIGHT_START_Z = 0;
export const S10_FLIGHT_BOUNDS = Object.freeze({
    x0: S10_FLIGHT_X - 1100, x1: S10_FLIGHT_X + 1100,
    z0: -22000, z1: 220,
});

const TILE_COUNT = 6;
const CLOUD_POOL = 12;
const TILE_LENGTH = 340;
const TERRAIN_WIDTH = 2200;
// Formasi Air Strike 1944 memuat sampai tujuh pesawat sekaligus dan boleh ada
// dua gelombang di layar, jadi pool dihitung dari kapasitas itu + instalasi.
// SATU SLOT HANYA MEMBAWA SILUET YANG BISA IA TAMPILKAN (2026-08-29,
// optimasi Stage 10). Dulu ke-52 slot musuh masing-masing membawa KELIMA
// siluet + rig kerusakan (251 objek per slot, 13.052 objek total) padahal
// sebuah slot hanya pernah menampilkan satu, dan pesawat tidak pernah berubah
// jadi kapal. Pool kini dipisah per keluarga; ukurannya diturunkan dari batas
// yang sudah ada (12 pesawat di layar + gelombang yang sedang meledak).
export const AIR_TYPES = Object.freeze(['airC', 'airB', 'airA']);
export const SHIP_TYPES = Object.freeze(['shipB', 'shipA']);
export const GROUND_KINDS = Object.freeze(['turret', 'tank', 'bunker', 'depot']);
// Ukuran pool DITURUNKAN dari batas yang sudah ada, bukan diketik: sebuah slot
// masih terpakai selama animasi jatuhnya, jadi kapasitas = yang boleh hidup +
// yang sedang meledak + sedikit margin. Dengan begitu menaikkan
// `maxAircraftOnScreen` di config tak pernah diam-diam membuat gelombang lahir
// kurang dari semestinya.
function airPoolSize(F) { return F.maxAircraftOnScreen * 2 + 4; }
function shipPoolSize(F) { return Math.max(12, Math.round(F.maxEnemies * 0.5)); }
const GROUND_POOL = 22;
const PLAYER_ROUND_POOL = 220;
const ENEMY_ROUND_POOL = 240;
const MISSILE_POOL = 48;
const DROP_POOL = 40;
const EXPLOSION_POOL = 34;
// Rudal homing DIGAMBAR sepanjang ini, dan lingkaran kenanya DITURUNKAN dari
// angka itu (aturan Stage 8: hitbox menutupi badan yang digambar, tidak pernah
// lebih besar darinya) — jadi memperbesar rudal otomatis memperbesar sasaran.
export const MISSILE_LENGTH = 30;
export const MISSILE_HIT_FRACTION = 0.4;

let built = false;
let root = null;
let world = null;

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function box(parent, material, sx, sy, sz, x, y, z) {
    return mesh(parent, new THREE.BoxGeometry(sx, sy, sz), material, x, y, z);
}

function cylinder(parent, material, radius, length, x, y, z, axis = 'y', radial = 10) {
    const m = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, radial), material, x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI * 0.5;
    else if (axis === 'z') m.rotation.x = Math.PI * 0.5;
    return m;
}

function flat(parent, material, radius, x, y, z, segments = 20) {
    const m = mesh(parent, new THREE.CircleGeometry(radius, segments), material, x, y, z);
    m.rotation.x = -Math.PI * 0.5;
    m.castShadow = false; m.receiveShadow = false;
    return m;
}

function destructionPose(part) {
    return { part, x: part.position.x, y: part.position.y, z: part.position.z,
        rx: part.rotation.x, ry: part.rotation.y, rz: part.rotation.z };
}

function instanceBatch(parent, geometry, material, transforms) {
    if (!transforms.length) return null;
    const batch = new THREE.InstancedMesh(geometry, material, transforms.length);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        q.setFromEuler(euler.set(t.rx || 0, t.ry || 0, t.rz || 0));
        matrix.compose(pos.set(t.x, t.y, t.z), q,
            scale.set(t.sx, t.sy, t.sz));
        batch.setMatrixAt(i, matrix);
    }
    batch.instanceMatrix.needsUpdate = true;
    batch.castShadow = true; batch.receiveShadow = true;
    // TINGGI SEBUAH BATCH HARUS DICATAT SAAT DIBANGUN (2026-08-29). Transform
    // tiap salinan hidup di `instanceMatrix`, BUKAN di position/scale, jadi
    // penelusuran objek biasa mengukur sebuah kota yang di-instance sebagai NOL
    // — itulah yang membuat menara latar Stage 10 lolos dari pengukuran pertama.
    // Dicatat dari data transform mentah, jadi angkanya sama persis di mesin
    // sungguhan maupun di harness headless.
    let top = -Infinity, halfX = 0;
    for (const t of transforms) {
        top = Math.max(top, t.y + instanceHalfHeight(t));
        // Sebaran melintang juga dicatat, dengan alasan yang sama: tanpa ini
        // tidak ada cara mengukur apakah lanskap benar-benar mengisi layar.
        halfX = Math.max(halfX, Math.abs(t.x)
            + Math.max(Math.abs(t.sx), Math.abs(t.sz)) * 0.5);
    }
    batch.userData.localTop = top;
    batch.userData.localHalfX = halfX;
    // KETERATURAN diukur, bukan dinilai dengan mata. Versi kisi lama hanya
    // punya delapan nilai x dan tiga nilai yaw untuk seluruh distrik; itulah
    // yang terbaca sebagai wallpaper. Dua cacah ini membuat "jangan kembali
    // jadi kotak-kotak" bisa diuji, bukan sekadar diklaim.
    const yaws = new Set(), xs = new Set();
    for (const t of transforms) {
        yaws.add(Math.round((t.ry || 0) * 20));
        xs.add(Math.round(t.x / 8));
    }
    batch.userData.distinctYaw = yaws.size;
    batch.userData.distinctX = xs.size;
    parent.add(batch);
    return batch;
}

// LANGIT-LANGIT SILUET PERMUKAAN: satu angka untuk instalasi darat, kapal DAN
// lanskap latar, diturunkan dari ketinggian terbang (bukan diketik), jadi
// menaikkan `altitude` melonggarkan semuanya sekaligus.
export function flightSurfaceCeiling() {
    const F = CFG.campaign.stage10.flight;
    return F.altitude * F.ground.maxHeightFraction;
}

// TIDAK ADA APA PUN DI PERMUKAAN YANG BOLEH MENCAPAI JALUR TERBANG (2026-08-29,
// laporan user "pesawat player dan pesawat musuh tertimpa object di bawahnya").
// Menara distrik kota terbaca 55,8 unit dan kanopi hutan hujan 24,1 — melawan
// `altitude` 28 — jadi pesawat benar-benar terbang MENEMBUSnya.
//
// Yang ditekan HANYA bagian di atas `baseY`, bukan seluruh grup tile. Menskalakan
// tile secara utuh akan ikut memampatkan jarak-jarak kecil di permukaan tanah —
// marka jalan hanya duduk 0,10 unit di atas aspal, sementara depth buffer pada
// jarak kamera 900 unit hanya sanggup memisahkan ~0,05 unit, jadi marka jalan
// akan mulai z-fighting. Kontak tanah, trotoar, marka dan podium karenanya tetap
// persis seperti digambar; hanya massa gedung/pohon di atasnya yang memendek.
//
// Puncaknya DIUKUR dari data transform, bukan dari tinggi yang diketik ulang,
// jadi prop baru pada distrik mana pun ikut terjepit dengan sendirinya.
function compressAbove(groups, baseY, ceiling) {
    let top = -Infinity;
    for (const list of groups)
        for (const t of list) top = Math.max(top, t.y + instanceHalfHeight(t));
    if (!(top > ceiling)) return 1;
    const k = (ceiling - baseY) / (top - baseY);
    for (const list of groups) for (const t of list) {
        t.y = baseY + (t.y - baseY) * k;
        t.sy *= k;
    }
    return k;
}

// Setengah-rentang VERTIKAL satu salinan, memperhitungkan rotasinya (AABB-of-OBB,
// baris Y matriks Euler XYZ) — sebuah silinder yang direbahkan tidak boleh
// terhitung setinggi panjangnya.
function instanceHalfHeight(t) {
    const c1 = Math.cos(t.rx || 0), s1 = Math.sin(t.rx || 0);
    const c2 = Math.cos(t.ry || 0), s2 = Math.sin(t.ry || 0);
    const c3 = Math.cos(t.rz || 0), s3 = Math.sin(t.rz || 0);
    return Math.abs(c1 * s3 + s1 * s2 * c3) * Math.abs(t.sx) * 0.5
        + Math.abs(c1 * c3 - s1 * s2 * s3) * Math.abs(t.sy) * 0.5
        + Math.abs(-s1 * c2) * Math.abs(t.sz) * 0.5;
}

// ===== TINGGI PROP PERMUKAAN TIDAK BOLEH MENCAPAI KETINGGIAN TERBANG =======
// (2026-08-29, laporan user "ada gedung yang terlalu tinggi sehingga pesawat
// musuh dan player jadi tertimpa dan menembus gedungnya"). Instalasi darat dan
// kapal diperbesar `ground.visualScale` demi keterbacaan, dan pembesaran itu
// mendorong tiang/antena/menaranya sampai 30-37 unit — sementara semua pesawat
// terbang di `altitude` 28. Karena kameranya TEPAT dari atas, tinggi hampir tak
// terbaca sedangkan TAPAK-nya sangat terbaca, jadi lebar/panjang tetap diskalakan
// penuh dan hanya sumbu Y yang dijepit. Radius kena tetap turunan tapak, jadi
// gameplay sama sekali tak berubah.

// Setengah-rentang VERTIKAL sebenarnya: baris Y matriks rotasi Euler XYZ dikali
// setengah-dimensi lokal (AABB-of-OBB). Tanpa memperhitungkan rotasi, sebuah
// silinder yang direbahkan akan terhitung setinggi panjangnya.
function geoHalfDims(g) {
    if (!g) return null;
    const p = g.parameters;
    if (p) {
        if (Number.isFinite(p.width) && Number.isFinite(p.depth))
            return [p.width / 2, p.height / 2, p.depth / 2];
        if (Number.isFinite(p.radiusTop) || Number.isFinite(p.radiusBottom)) {
            const r = Math.max(p.radiusTop || 0, p.radiusBottom || 0);
            return [r, (p.height || 0) / 2, r];
        }
        if (Number.isFinite(p.radius) && Number.isFinite(p.height))
            return [p.radius, p.height / 2, p.radius];
        if (Number.isFinite(p.outerRadius)) return [p.outerRadius, 0, p.outerRadius];
        if (Number.isFinite(p.radius)) return [p.radius, p.radius, p.radius];
    }
    if (g.args) {   // harness headless
        if (g.type === 'box') return [g.args[0] / 2, g.args[1] / 2, g.args[2] / 2];
        if (g.type === 'cyl') return [g.args[0], g.args[2] / 2, g.args[0]];
        if (g.type === 'cone') return [g.args[0], g.args[1] / 2, g.args[0]];
        if (g.type === 'sphere') return [g.args[0], g.args[0], g.args[0]];
        if (g.type === 'circle') return [g.args[0], 0, g.args[0]];
        if (g.type === 'ring') return [g.args[1], 0, g.args[1]];
    }
    return null;
}

function verticalHalf(obj) {
    const h = geoHalfDims(obj.geometry);
    if (!h) return 0;
    const r = obj.rotation || { x: 0, y: 0, z: 0 };
    const c1 = Math.cos(r.x), s1 = Math.sin(r.x);
    const c2 = Math.cos(r.y), s2 = Math.sin(r.y);
    const c3 = Math.cos(r.z), s3 = Math.sin(r.z);
    const m1 = c1 * s3 + s1 * s2 * c3;
    const m5 = c1 * c3 - s1 * s2 * s3;
    const m9 = -s1 * c2;
    return Math.abs(m1) * h[0] + Math.abs(m5) * h[1] + Math.abs(m9) * h[2];
}

export function propTopHeight(obj, parentY = 0, parentScale = 1) {
    const y = parentY + (obj.position ? obj.position.y : 0) * parentScale;
    const sc = parentScale * (obj.scale ? obj.scale.y : 1);
    const local = obj.userData && obj.userData.localTop;
    let top = y + (Number.isFinite(local) ? local : verticalHalf(obj)) * sc;
    for (const child of (obj.children || [])) top = Math.max(top, propTopHeight(child, y, sc));
    return top;
}

// Skalakan tapak penuh, lalu jepit sumbu Y supaya puncaknya tetap di bawah
// langit-langit. Mengembalikan tinggi terpasangnya untuk dilaporkan debug.
function fitSurfaceProp(model, visualScale, ceiling) {
    const raw = propTopHeight(model);
    const yScale = raw > 0 ? Math.min(visualScale, ceiling / raw) : visualScale;
    model.scale.set(visualScale, yScale, visualScale);
    return raw * yScale;
}

// PERMUKAAN BURAM HARUS BENAR-BENAR BURAM (2026-08-29, laporan user "pesawat
// tertimpa gedung di background"). Material medan/bangunan dulu diberi
// `transparent: true` demi cross-fade antar-biome — dan cross-fade itu SUDAH
// DIHAPUS saat peralihan biome menjadi geografi sungguhan. Yang tersisa hanya
// kerugiannya: setiap mesh buram ikut dilempar ke lintasan render TRANSPARAN,
// yang digambar sesudah lintasan buram dan diurutkan PER OBJEK dari belakang ke
// depan — di situlah bangunan latar bisa tergambar menimpa pesawat. Flag itu
// kini hanya dipakai material yang memang punya `opacity` < 1.
function mats() {
    return {
        java: new THREE.MeshLambertMaterial({ color: 0x546b36 }),
        javaDark: new THREE.MeshLambertMaterial({ color: 0x344c2b }),
        javaDry: new THREE.MeshLambertMaterial({ color: 0x8a7650 }),
        cityAsphalt: new THREE.MeshLambertMaterial({ color: 0x30373d }),
        cityAsphaltDark: new THREE.MeshLambertMaterial({ color: 0x20272b }),
        cityRoadMark: new THREE.MeshBasicMaterial({ color: 0xd8c46f }),
        cityConcrete: new THREE.MeshLambertMaterial({ color: 0x737d82 }),
        cityTower: new THREE.MeshLambertMaterial({ color: 0x89969b }),
        cityGlass: new THREE.MeshBasicMaterial({ color: 0x5c9fb2, transparent: true, opacity: 0.72 }),
        cityGlassDark: new THREE.MeshBasicMaterial({ color: 0x285568, transparent: true, opacity: 0.82 }),
        cityRoof: new THREE.MeshLambertMaterial({ color: 0x4b555a }),
        cityAccent: new THREE.MeshLambertMaterial({ color: 0xb46a43 }),
        houseWall: new THREE.MeshLambertMaterial({ color: 0xc6ae82 }),
        houseWallLight: new THREE.MeshLambertMaterial({ color: 0xe1d4b8 }),
        houseRoofA: new THREE.MeshLambertMaterial({ color: 0xa94b34 }),
        houseRoofB: new THREE.MeshLambertMaterial({ color: 0x486c75 }),
        houseRoofDark: new THREE.MeshLambertMaterial({ color: 0x593d35 }),
        garden: new THREE.MeshLambertMaterial({ color: 0x486f36 }),
        riceWater: new THREE.MeshLambertMaterial({ color: 0x4f8f83 }),
        riceWaterGlint: new THREE.MeshBasicMaterial({ color: 0xa8d2c3, transparent: true, opacity: 0.52 }),
        riceYoung: new THREE.MeshLambertMaterial({ color: 0x78a64a }),
        riceMature: new THREE.MeshLambertMaterial({ color: 0xa6a94d }),
        riceDark: new THREE.MeshLambertMaterial({ color: 0x4e7c38 }),
        riceBund: new THREE.MeshLambertMaterial({ color: 0x77613b }),
        plantationSoil: new THREE.MeshLambertMaterial({ color: 0x624b31 }),
        plantationLeaf: new THREE.MeshLambertMaterial({ color: 0x42672d }),
        plantationLeafLight: new THREE.MeshLambertMaterial({ color: 0x698744 }),
        tropicalCanopy: new THREE.MeshLambertMaterial({ color: 0x1f5935 }),
        tropicalCanopyLight: new THREE.MeshLambertMaterial({ color: 0x34744a }),
        tropicalCanopyDark: new THREE.MeshLambertMaterial({ color: 0x123d2b }),
        tropicalUnderstory: new THREE.MeshLambertMaterial({ color: 0x2b6139 }),
        treeTrunk: new THREE.MeshLambertMaterial({ color: 0x5b4029 }),
        palmLeaf: new THREE.MeshLambertMaterial({ color: 0x3f7b3b }),
        palmLeafLight: new THREE.MeshLambertMaterial({ color: 0x6f984b }),
        boardwalk: new THREE.MeshLambertMaterial({ color: 0x8a6540 }),
        riverBank: new THREE.MeshLambertMaterial({ color: 0x806a43 }),
        riverShallow: new THREE.MeshLambertMaterial({ color: 0x3c7980 }),
        ocean: new THREE.MeshLambertMaterial({ color: 0x19566c }),
        oceanDeep: new THREE.MeshLambertMaterial({ color: 0x113e55 }),
        oceanLine: new THREE.MeshBasicMaterial({ color: 0x73a8ad, transparent: true, opacity: 0.28 }),
        oceanIslandDry: new THREE.MeshLambertMaterial({ color: 0x8a7650 }),
        oceanIslandGreen: new THREE.MeshLambertMaterial({ color: 0x344c2b }),
        kalimantan: new THREE.MeshLambertMaterial({ color: 0x315b32 }),
        forest: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
        javaRiver: new THREE.MeshLambertMaterial({ color: 0x285f6b }),
        kalimantanRiver: new THREE.MeshLambertMaterial({ color: 0x285f6b }),
        // Bangunan latar: hanya siluet, tanpa papan nama lokasi.
        roof: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
        wall: new THREE.MeshLambertMaterial({ color: PAL.panel }),
        slab: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
        slabLine: new THREE.MeshBasicMaterial({ color: PAL.white, transparent: true, opacity: 0.5 }),
        pier: new THREE.MeshLambertMaterial({ color: PAL.wood }),
        sand: new THREE.MeshLambertMaterial({ color: 0xc9b183 }),
        sandWet: new THREE.MeshLambertMaterial({ color: 0x9d8a66 }),
        surf: new THREE.MeshBasicMaterial({ color: 0xd9ecec, transparent: true, opacity: 0.55 }),
        shallow: new THREE.MeshLambertMaterial({ color: 0x2f7f92 }),
        cloud: new THREE.MeshLambertMaterial({ color: PAL.white, transparent: true, opacity: 0.34, depthWrite: false }),
        cloudShade: new THREE.MeshLambertMaterial({ color: PAL.panel, transparent: true, opacity: 0.22, depthWrite: false }),
        airC: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.48, metalness: 0.35 }),
        airB: new THREE.MeshStandardMaterial({ color: PAL.steel, roughness: 0.4, metalness: 0.58 }),
        airA: new THREE.MeshStandardMaterial({ color: PAL.amber, roughness: 0.42, metalness: 0.5 }),
        airArmor: new THREE.MeshStandardMaterial({ color: 0x202a32, roughness: 0.34, metalness: 0.72 }),
        airPanel: new THREE.MeshStandardMaterial({ color: 0xb8c3c7, roughness: 0.4, metalness: 0.58 }),
        airStripe: new THREE.MeshStandardMaterial({ color: 0xe75b32, emissive: 0x471208,
            emissiveIntensity: 0.42, roughness: 0.38, metalness: 0.4 }),
        airEngine: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.3, metalness: 0.82 }),
        airFan: new THREE.MeshBasicMaterial({ color: 0x9de5ff, toneMapped: false }),
        airExhaust: new THREE.MeshBasicMaterial({ color: 0x56bfff, transparent: true,
            opacity: 0.74, depthWrite: false, toneMapped: false }),
        airVapor: new THREE.MeshBasicMaterial({ color: 0xd8f5ff, transparent: true,
            opacity: 0.38, depthWrite: false, toneMapped: false }),
        airFire: new THREE.MeshBasicMaterial({ color: 0xff6a1f, transparent: true,
            opacity: 0.9, depthWrite: false, toneMapped: false }),
        airSpark: new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false }),
        ship: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.58, metalness: 0.45 }),
        shipDeck: new THREE.MeshStandardMaterial({ color: PAL.concrete, roughness: 0.7, metalness: 0.2 }),
        shipHullDark: new THREE.MeshStandardMaterial({ color: 0x17252c, roughness: 0.62, metalness: 0.54 }),
        shipTrim: new THREE.MeshStandardMaterial({ color: 0xc54b35, roughness: 0.48, metalness: 0.35 }),
        shipGlass: new THREE.MeshStandardMaterial({ color: 0x5bc7e8, emissive: 0x123d50,
            emissiveIntensity: 0.72, roughness: 0.22, metalness: 0.42 }),
        shipWake: new THREE.MeshBasicMaterial({ color: 0xbbe8ef, transparent: true,
            opacity: 0.46, depthWrite: false }),
        groundArmor: new THREE.MeshStandardMaterial({ color: 0x4b5b43, roughness: 0.68, metalness: 0.34 }),
        groundArmorDark: new THREE.MeshStandardMaterial({ color: 0x263229, roughness: 0.62, metalness: 0.48 }),
        groundTrim: new THREE.MeshStandardMaterial({ color: 0xd19a35, roughness: 0.48, metalness: 0.35 }),
        groundOptic: new THREE.MeshStandardMaterial({ color: 0x72d8ff, emissive: 0x164a65,
            emissiveIntensity: 0.82, roughness: 0.25, metalness: 0.45 }),
        track: new THREE.MeshStandardMaterial({ color: 0x151a18, roughness: 0.84, metalness: 0.36 }),
        dark: new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.48, metalness: 0.62 }),
        glass: new THREE.MeshStandardMaterial({ color: PAL.screenBg, emissive: PAL.techDim, emissiveIntensity: 0.45 }),
        boss: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.42, metalness: 0.66 }),
        bossTrim: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.5, metalness: 0.3 }),
        bossGlow: new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amberDim, emissiveIntensity: 0.8 }),
        playerRound: new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false }),
        // Plasma musuh BIRU (warna sinyal gameplay yang sudah dipatok proyek),
        // tapi berbentuk bola besar + halo seperti referensi agar mudah dibaca.
        enemyRound: new THREE.MeshBasicMaterial({ color: 0x55b8ff, toneMapped: false }),
        enemyHalo: new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }),
        missile: new THREE.MeshBasicMaterial({ color: 0xffe7ca, toneMapped: false }),
        missileFin: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.5, metalness: 0.35 }),
        money: new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amberDim, emissiveIntensity: 0.65, metalness: 0.5 }),
        health: new THREE.MeshStandardMaterial({ color: PAL.white, emissive: PAL.hazard, emissiveIntensity: 0.4 }),
        healthRed: new THREE.MeshBasicMaterial({ color: PAL.hazard, toneMapped: false }),
        powerCase: new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.5, metalness: 0.6 }),
        bombPack: new THREE.MeshStandardMaterial({ color: PAL.tech, emissive: PAL.techDim, emissiveIntensity: 0.8, metalness: 0.4 }),
        fire: new THREE.MeshBasicMaterial({ color: 0xff8a2b, transparent: true, opacity: 0.9, toneMapped: false }),
        flash: new THREE.MeshBasicMaterial({ color: 0xffe3a1, transparent: true, opacity: 0.9, toneMapped: false }),
        bombFlash: new THREE.MeshBasicMaterial({ color: 0xffe9bd, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
        bombRing: new THREE.MeshBasicMaterial({ color: 0xffd07a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
        smoke: new THREE.MeshLambertMaterial({ color: PAL.ink, transparent: true, opacity: 0.55, depthWrite: false }),
        debris: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.65, metalness: 0.5 }),
    };
}

// ---------------------------------------------------------------- terrain ---
// Setiap tile membawa KETIGA biome sebagai anak sendiri; cross-fade hanya
// mengubah opacity, jadi tidak ada mesh/material lahir saat biome berganti.

function buildHut(parent, M, x, z, w, d, h, rot) {
    box(parent, M.wall, w, h, d, x, h * 0.5 + 0.6, z).rotation.y = rot;
    const roof = box(parent, M.roof, w * 1.18, 0.9, d * 1.18, x, h + 0.9, z);
    roof.rotation.y = rot;
}

function buildVillage(parent, M, cx, cz, index) {
    for (let i = 0; i < 6; i++) {
        const x = cx + ((i * 37 + index * 17) % 62) - 31;
        const z = cz + ((i * 53 + index * 29) % 74) - 37;
        buildHut(parent, M, x, z, 9 + (i % 3) * 2.5, 7 + (i % 2) * 3,
            4 + (i % 3) * 1.4, ((i + index) % 4) * 0.22);
    }
}

function buildAirstrip(parent, M, cx, cz, index) {
    const strip = box(parent, M.slab, 26, 0.5, 190, cx, 1.1, cz);
    strip.rotation.y = index % 2 ? 0.05 : -0.05;
    for (let i = -3; i <= 3; i++) {
        const bar = box(parent, M.slabLine, 2.4, 0.12, 16, cx, 1.45, cz + i * 26);
        bar.rotation.y = strip.rotation.y;
    }
    for (const side of [-1, 1]) {
        box(parent, M.wall, 16, 6, 13, cx + side * 30, 3.6, cz - 52);
        box(parent, M.roof, 18, 1.1, 15, cx + side * 30, 7.1, cz - 52);
    }
}

export function pitchedRoofLayout(w, h, raised = 0) {
    // Ridge harus menjadi titik TERTINGGI. Versi lama memakai `side * angle`,
    // sehingga kedua eave justru naik dan pertemuan tengah turun seperti talang.
    // Rise juga dibatasi agar gudang perkebunan yang lebar tidak menancapkan
    // eave ke tanah ketika memakai pitch rumah kecil.
    const halfRun = w * 0.5 + 1.1;
    const wallTop = 0.72 + raised + h;
    const clearanceRise = flightSurfaceCeiling() - wallTop - 1.05;
    const rise = Math.max(0.8, Math.min(w * 0.22, h * 0.65, 4.5, clearanceRise));
    const angle = Math.atan2(rise, halfRun);
    return {
        halfRun, rise, angle,
        panelLength: Math.hypot(halfRun, rise),
        centerAboveWall: rise * 0.5 + 0.18,
        eaveAboveWall: 0.18,
        ridgeAboveWall: rise + 0.18,
        leftRotationZ: angle,
        rightRotationZ: -angle,
    };
}

function buildPitchedHouse(parent, M, x, z, w, d, h, rot, roofMat, raised = 0) {
    const g = new THREE.Group(); parent.add(g);
    g.position.set(x, 0, z); g.rotation.y = rot;
    if (raised > 0) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1])
            box(g, M.treeTrunk, 0.75, raised + 0.8, 0.75,
                sx * w * 0.36, (raised + 0.8) * 0.5 + 0.7, sz * d * 0.34);
    }
    const floorY = 0.72 + raised;
    box(g, M.cityConcrete, w * 1.08, 0.55, d * 1.08, 0, floorY, 0);
    box(g, M.houseWall, w, h, d, 0, floorY + h * 0.5, 0);
    const roofLayout = pitchedRoofLayout(w, h, raised);
    // Dua bidang miring membuat atap benar-benar terbaca sebagai genteng,
    // bukan satu box tipis yang melayang di atas rumah.
    for (const side of [-1, 1]) {
        const roof = box(g, roofMat, roofLayout.panelLength, 0.58, d * 1.22,
            side * roofLayout.halfRun * 0.5,
            floorY + h + roofLayout.centerAboveWall, 0);
        roof.rotation.z = -side * roofLayout.angle;
    }
    box(g, M.houseRoofDark, 0.7, 0.7, d * 1.22,
        0, floorY + h + roofLayout.ridgeAboveWall, 0);
    g.userData.pitchedRoof = { ...roofLayout, ridgeHigh: true };
    // Teras, pintu dan satu tangki air memberi pembacaan skala manusia dari atas.
    box(g, M.boardwalk, w * 0.58, 0.45, 2.8, 0, floorY + 0.1, d * 0.63);
    box(g, M.houseRoofDark, w * 0.18, h * 0.56, 0.35,
        0, floorY + h * 0.34, d * 0.515);
    const tankY = floorY + h + roofLayout.ridgeAboveWall + 1.15;
    if ((Math.round(x + z) & 1) === 0
        && tankY + 0.725 < flightSurfaceCeiling() - 0.5)
        cylinder(g, M.cityRoof, 1.15, 1.45, -w * 0.28,
            tankY, -d * 0.15, 'y', 10);
    return g;
}

function makeHouseBatch() {
    return { slabs: [], walls: [], roofA: [], roofB: [], roofDark: [],
        terraces: [], doors: [], stilts: [], tanks: [] };
}

function rotatedOffset(x, z, ox, oz, ry) {
    return {
        x: x + ox * Math.cos(ry) + oz * Math.sin(ry),
        z: z - ox * Math.sin(ry) + oz * Math.cos(ry),
    };
}

// Versi batch dari rumah detail di atas. Siluetnya identik, tetapi satu distrik
// hanya membayar beberapa draw call material, bukan 8-12 draw call PER rumah.
function queuePitchedHouse(batch, x, z, w, d, h, rot, roofKey, raised = 0) {
    const floorY = 0.72 + raised;
    const roofLayout = pitchedRoofLayout(w, h, raised);
    batch.slabs.push({ x, y: floorY, z, sx: w * 1.08, sy: 0.55, sz: d * 1.08, ry: rot });
    batch.walls.push({ x, y: floorY + h * 0.5, z, sx: w, sy: h, sz: d, ry: rot });
    for (const side of [-1, 1]) {
        const p = rotatedOffset(x, z, side * roofLayout.halfRun * 0.5, 0, rot);
        batch[roofKey].push({ x: p.x,
            y: floorY + h + roofLayout.centerAboveWall, z: p.z,
            sx: roofLayout.panelLength, sy: 0.58, sz: d * 1.22,
            ry: rot, rz: -side * roofLayout.angle });
    }
    batch.roofDark.push({ x, y: floorY + h + roofLayout.ridgeAboveWall, z,
        sx: 0.7, sy: 0.7, sz: d * 1.22, ry: rot });
    const terrace = rotatedOffset(x, z, 0, d * 0.63, rot);
    batch.terraces.push({ x: terrace.x, y: floorY + 0.1, z: terrace.z,
        sx: w * 0.58, sy: 0.45, sz: 2.8, ry: rot });
    const door = rotatedOffset(x, z, 0, d * 0.515, rot);
    batch.doors.push({ x: door.x, y: floorY + h * 0.34, z: door.z,
        sx: w * 0.18, sy: h * 0.56, sz: 0.35, ry: rot });
    if (raised > 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const p = rotatedOffset(x, z, sx * w * 0.36, sz * d * 0.34, rot);
        batch.stilts.push({ x: p.x, y: (raised + 0.8) * 0.5 + 0.7, z: p.z,
            sx: 0.75, sy: raised + 0.8, sz: 0.75, ry: rot });
    }
    if ((Math.round(x + z) & 1) === 0) {
        const p = rotatedOffset(x, z, -w * 0.28, -d * 0.15, rot);
        const tankY = floorY + h + roofLayout.ridgeAboveWall + 1.15;
        if (tankY + 0.725 < flightSurfaceCeiling() - 0.5)
            batch.tanks.push({ x: p.x, y: tankY, z: p.z,
                sx: 1.15, sy: 1.45, sz: 1.15, ry: rot });
    }
}

function flushHouseBatch(parent, M, batch) {
    const unitBox = () => new THREE.BoxGeometry(1, 1, 1);
    tagRole(instanceBatch(parent, unitBox(), M.cityConcrete, batch.slabs), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.houseWall, batch.walls), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.houseRoofA, batch.roofA), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.houseRoofB, batch.roofB), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.houseRoofDark, batch.roofDark), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.boardwalk, batch.terraces), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.houseRoofDark, batch.doors), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.treeTrunk, batch.stilts), 'building');
    tagRole(instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 8), M.cityRoof, batch.tanks), 'building');
}

// ===== LANSKAP ORGANIK ======================================================
// (2026-08-29, permintaan user "terlalu rapi, jelek, gak kayak dunia nyata ...
// jangan terlalu terkotak-kotak" + "penuhi layar dari ujung kiri ke ujung
// kanan"). Tiap distrik dulu digambar sebagai kisi `for row / for col` di atas
// larik `xs`/`zs` TETAP: petak seragam, baris lurus sempurna, tak satu pun
// garis miring — dan isinya berhenti di x 380 padahal kamera menjangkau 979
// pada layar 21:9, jadi separuh lebar layar hanyalah slab kosong.
//
// Empat aturan menggantinya.
// (1) TIDAK ADA LAGI LARIK POSISI TETAP. Semuanya duduk di kisi yang jaraknya
//     MEMBAGI HABIS TILE_LENGTH lalu digeser hash. Pembagi itu bukan gaya-gayaan:
//     tile bergulir dan didandani ulang saat wrap, jadi hanya jarak yang membagi
//     habis yang menyambung mulus di sambungan tile. Isi kini merentang sampai
//     CONTENT_HALF_X, melewati tepi layar terlebar.
// (2) BENTUK MENGIKUTI KONTUR. `contourAt` adalah medan ketinggian semu yang
//     PERIODIK terhadap TILE_LENGTH; `contourAngle` memberi arah garis konturnya.
//     Sawah berteras mengikutinya, baris kebun melengkung mengikutinya, dan
//     warna lahan bergradasi menurut ketinggian. Dari kamera yang TEPAT di atas,
//     kontur nyata memang hanya terbaca lewat terasering, lengkung baris dan
//     gradasi warna — mesh ketinggian sungguhan tak akan terlihat sama sekali
//     dan cuma menambah beban.
// (3) SATU JALAN RAYA MENYAMBUNG SEMUA DISTRIK. `trunkRoadX` periodik terhadap
//     TILE_LENGTH, jadi jalan itu tersambung melewati batas tile bahkan ketika
//     distrik di seberangnya berganti.
// (4) BEBANNYA TIDAK BOLEH NAIK. Isi melebar ~2,8x tetapi anggarannya dibayar
//     dari dua sisi: jalan, petak tanah dan perahu yang dulu mesh satuan kini
//     DI-INSTANCE (satu InstancedMesh = satu draw call berapa pun salinannya),
//     dan detail yang mustahil terbaca dari ketinggian 900 unit — delapan
//     pelepah per sawit, akar banir per pohon — ditukar dengan LEBIH BANYAK
//     pohon. `terrainPerformance.maxDistrictDrawNodes` adalah pagarnya.

const CONTENT_HALF_X = 1060;        // tepi slab 1100; sisakan ruang untuk prop

// Tinggi kamera stage ini tinggal DI SINI, bukan di flight.js, supaya modul
// dunia bisa memeriksa sendiri apakah lanskapnya benar-benar mengisi layar
// tanpa membuat impor melingkar. flight.js menyusun `camOffset`-nya dari sini.
export const S10_CAM_HEIGHT = 900;

// Setengah-lebar tapak kamera di bidang tanah pada rasio `aspect`. Kamera stage
// ini TEPAT di atas, jadi tapaknya cuma tinggi kali tangen setengah fov.
export function flightCameraHalfX(aspect) {
    const fov = (viewCam && viewCam.fov) || 50;
    return S10_CAM_HEIGHT * Math.tan(fov * Math.PI / 360) * aspect;
}

function lhash(a, b, seed) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263)
        ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ketinggian semu. Suku z-nya selalu lewat sin dari sudut penuh, jadi medan ini
// PERSIS periodik terhadap TILE_LENGTH — teras dan baris kebun menyambung di
// sambungan tile alih-alih terpotong.
function contourAt(x, z, seed) {
    const a = 2 * Math.PI * z / TILE_LENGTH;
    const s = seed * 0.7;
    const v = 0.5
        + 0.30 * Math.sin(x / 270 + Math.sin(a) * 0.95 + s)
        + 0.15 * Math.sin(x / 96 - Math.sin(2 * a + 1.3) * 0.75 + s * 2.1)
        + 0.05 * Math.sin(x / 41 + Math.sin(3 * a + 0.4) * 0.5 + s * 3.7);
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Arah GARIS kontur (tegak lurus gradien). Prop dengan `ry` sudut ini
// membentangkan sisi panjangnya menyusuri lereng, seperti teras dan baris teh.
function contourAngle(x, z, seed) {
    const e = 9;
    const gx = contourAt(x + e, z, seed) - contourAt(x - e, z, seed);
    const gz = contourAt(x, z + e, seed) - contourAt(x, z - e, seed);
    if (Math.abs(gx) + Math.abs(gz) < 1e-4) return 0;
    return Math.atan2(gz, -gx);
}

// Jalan raya yang dipakai SEMUA distrik darat, periodik terhadap TILE_LENGTH.
function trunkRoadX(z) {
    const a = 2 * Math.PI * z / TILE_LENGTH;
    return Math.sin(a) * 34 + Math.sin(2 * a + 0.9) * 15;
}

// Kisi ber-jitter. Jarak baris dibulatkan ke pembagi TILE_LENGTH supaya
// menyambung antar tile; jitter ditahan di bawah setengah sel supaya urutan
// baris tidak pernah tertukar.
function jitterGrid(seed, halfX, sx, sz, fn) {
    const rows = Math.max(1, Math.round(TILE_LENGTH / sz));
    const step = TILE_LENGTH / rows;
    const cols = Math.max(1, Math.ceil((halfX * 2) / sx));
    const originX = -halfX + (halfX * 2 - cols * sx) * 0.5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const jx = lhash(c, r, seed) - 0.5, jz = lhash(c, r, seed + 91) - 0.5;
        fn(originX + (c + 0.5) * sx + jx * sx * 0.7,
            -TILE_LENGTH * 0.5 + (r + 0.5) * step + jz * step * 0.7,
            lhash(c, r, seed + 17), c, r);
    }
}

// Kumpulan transform per material: satu distrik membayar satu draw call per
// material, bukan satu mesh per petak/jalan/perahu.
function makeSurfaceBatch() { return {}; }

function queueSurface(batch, key, t) {
    (batch[key] || (batch[key] = [])).push(t);
}

// Menandai batch terakhir yang dibuat. Peran ini yang membuat "tidak ada
// bangunan di atas aspal" bisa DIUJI: `cityAccent` dipakai bersama oleh alas
// menara DAN badan mobil, dan `javaDry` oleh perkerasan DAN petak bera — jadi
// material saja tidak pernah cukup untuk membedakan.
function tagRole(batch, role) { if (batch) batch.userData.role = role; return batch; }

// `role` menandai batch pada mesh yang jadi, sehingga test bisa memisahkan
// perkerasan jalan dari petak sawah — keduanya kebetulan memakai material
// `javaDry` yang sama, jadi materialnya saja tidak cukup untuk membedakan.
function flushSurface(parent, M, batch, role) {
    let nodes = 0;
    for (const [key, list] of Object.entries(batch)) {
        if (!list.length) continue;
        const b = instanceBatch(parent, new THREE.BoxGeometry(1, 1, 1), M[key], list);
        if (b && role) b.userData.role = role;
        nodes++;
    }
    return nodes;
}

// Jalan sebagai POLILINE, bukan balok lurus: tiap ruas mewarisi yaw-nya sendiri,
// jadi jalan benar-benar membelok alih-alih patah bertingkat.
function queuePath(batch, pts, width, opts = {}) {
    const surf = opts.surface || 'cityAsphaltDark';
    const kerb = opts.kerb, mark = opts.mark;
    let marks = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) continue;
        const yaw = Math.atan2(dx, dz);
        const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
        queueSurface(batch, surf, { x: mx, y: opts.y || 0.76, z: mz,
            sx: width, sy: 0.22, sz: len + 1.4, ry: yaw });
        if (kerb) for (const side of [-1, 1]) queueSurface(batch, kerb, {
            x: mx + Math.cos(yaw) * side * (width * 0.5 + 2.2), y: 0.9,
            z: mz - Math.sin(yaw) * side * (width * 0.5 + 2.2),
            sx: 4.2, sy: 0.48, sz: len + 1.4, ry: yaw });
        // Marka tetap di y 1.01 setinggi 0.08: ketinggiannya dipatok test supaya
        // penjepitan tinggi lanskap tak pernah menyeretnya ke dalam aspal.
        if (mark && i % 2 === 0) {
            queueSurface(batch, mark, { x: mx, y: 1.01, z: mz,
                sx: 0.8, sy: 0.08, sz: len * 0.5, ry: yaw });
            marks++;
        }
    }
    return marks;
}

// ===== KORIDOR JALAN HARUS TETAP BERSIH ===================================
// (2026-08-29, laporan user "masih ada bangunan di perumahan dan perkotaan yang
// berada di atas jalan aspal"). Penempatan lewat kisi ber-jitter sama sekali
// tidak tahu di mana jalannya, jadi rumah bisa mendarat tepat di atas aspal.
// Jalan kini MENDAFTARKAN koridornya saat digambar, dan tiap bangunan diuji
// terhadap koridor itu. Ujinya jarak titik-ke-RUAS, bukan kotak kasar, karena
// jalan-jalan ini melengkung — kotak pembatas jalan diagonal akan menolak
// separuh distrik tanpa alasan.
function segDistance(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// `half` = setengah lebar aspal DITAMBAH trotoar/bahu, jadi bangunan berhenti
// di tepi perkerasan, bukan menempel ke marka.
function addRoadCorridor(list, pts, half) { list.push({ pts, half }); }

// Jarak ke sumbu jalan TERDEKAT — dipakai untuk menentukan kepadatan, karena
// kota tumbuh di sepanjang jalan APA PUN, bukan hanya jalan raya utama.
function distanceToRoads(list, x, z) {
    let best = Infinity;
    for (const c of list) for (let i = 1; i < c.pts.length; i++) {
        const a = c.pts[i - 1], b = c.pts[i];
        const d = segDistance(x, z, a.x, a.z, b.x, b.z);
        if (d < best) best = d;
    }
    return best;
}

// Uji TAPAK SEBENARNYA, bukan lingkaran pembungkus. Lingkaran pembungkus
// memakai diagonal, jadi gedung 68x60 diperlakukan selebar 90 — dan itulah yang
// membuat setiap menara ditolak di blok sedalam 113. Untuk segmen lawan kotak
// cembung, jarak minimumnya selalu jatuh di ujung segmen atau di sudut kotak,
// jadi memeriksa keduanya sudah eksak.
function clearOfRoadsBox(list, cx, cz, w, d, yaw) {
    const hx = w * 0.5, hz = d * 0.5;
    const co = Math.cos(-yaw), si = Math.sin(-yaw);
    const toLocal = (px, pz) => {
        const dx = px - cx, dz = pz - cz;
        return [dx * co + dz * si, -dx * si + dz * co];
    };
    const ptBox = (px, pz) => Math.hypot(
        Math.max(0, Math.abs(px) - hx), Math.max(0, Math.abs(pz) - hz));
    const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (const c of list) {
        for (let i = 1; i < c.pts.length; i++) {
            const [lax, laz] = toLocal(c.pts[i - 1].x, c.pts[i - 1].z);
            const [lbx, lbz] = toLocal(c.pts[i].x, c.pts[i].z);
            let best = Math.min(ptBox(lax, laz), ptBox(lbx, lbz));
            for (const [vx, vz] of corners)
                best = Math.min(best, segDistance(vx, vz, lax, laz, lbx, lbz));
            if (best < c.half) return false;
        }
    }
    return true;
}

function clearOfRoads(list, x, z, radius) {
    for (const c of list) {
        const lim = c.half + radius;
        for (let i = 1; i < c.pts.length; i++) {
            const a = c.pts[i - 1], b = c.pts[i];
            if (segDistance(x, z, a.x, a.z, b.x, b.z) < lim) return false;
        }
    }
    return true;
}

// Sungai berkelok: lebarnya ikut berubah sepanjang alur.
function queueRiver(batch, pts, width, keys) {
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) continue;
        const yaw = Math.atan2(dx, dz);
        const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
        const w = width * (a.w !== undefined ? (a.w + b.w) * 0.5 : 1);
        queueSurface(batch, keys.bank,
            { x: mx, y: 0.87, z: mz, sx: w + 15, sy: 0.35, sz: len + 3, ry: yaw });
        queueSurface(batch, keys.water,
            { x: mx, y: 1.06, z: mz, sx: w, sy: 0.28, sz: len + 3, ry: yaw });
        queueSurface(batch, keys.shallow, {
            x: mx - Math.cos(yaw) * w * 0.34, y: 1.2,
            z: mz + Math.sin(yaw) * w * 0.34,
            sx: w * 0.2, sy: 0.06, sz: len * 0.92, ry: yaw });
    }
    return pts.length - 1;
}

// SUNGAI HARUS MENYAMBUNG MELEWATI BATAS TILE (2026-08-29, laporan user
// "sungai-sungai itu tidak tersambung, terlihat sangat aneh"). Dua sebab, dan
// keduanya harus diperbaiki.
//
// (1) Tiap distrik Kalimantan menaruh sungainya di `index % 2 ? 320 : -320`,
//     jadi tile bersebelahan memindahkan sungai sejauh 640 unit. Sekarang
//     seluruh Kalimantan memakai SATU `KAL_RIVER_X`.
// (2) Simpangan alurnya dulu memakai `sin(2*PI*t + seed)` — bergeser fasa per
//     tile, sehingga nilai di ujung ikut berubah dan ujung-ujung tile meleset
//     sampai 870 unit. Simpangan kini hanya memakai suku `(1 - cos(2*PI*k*t))`:
//     nilainya NOL di t=0 dan t=1, DAN turunannya juga nol di sana. Artinya tiap
//     tile masuk dan keluar tepat di `centerX` DAN sejajar sumbu z, jadi
//     sambungannya mulus tanpa patahan sudut — berapa pun bentuk kelokannya.
//     Variasi antar tile datang dari AMPLITUDO bertanda (yang tidak menggeser
//     titik sambung), bukan dari fasa (yang menggesernya).
const KAL_RIVER_X = 240;

function riverPath(centerX, seed, amp, segments = 18) {
    const key = Math.round(seed * 131);
    const sign = (k) => (lhash(k, key, 0x5e1) < 0.5 ? -1 : 1);
    const a1 = amp * 0.5 * (0.75 + lhash(1, key, 0x77) * 0.5) * sign(1);
    const a2 = amp * 0.22 * (0.5 + lhash(2, key, 0x77) * 0.9) * sign(2);
    const a3 = amp * 0.09 * (0.4 + lhash(3, key, 0x77) * 1.0) * sign(3);
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const z = -TILE_LENGTH * 0.5 - 6 + t * (TILE_LENGTH + 12);
        const a = 2 * Math.PI * t;
        // Jendela sin^2(PI*t) menahan alur tetap MENEMPEL di `centerX` di dekat
        // kedua ujung, bukan cuma menyentuhnya. Tanpa jendela ini ujungnya memang
        // bertemu, tetapi ruas pertama tiap tile sudah membelok ~23 derajat,
        // sehingga sambungannya jadi sudut tajam meski titiknya pas.
        const win = Math.sin(Math.PI * t) ** 2;
        pts.push({
            x: centerX + win * (
                a1 * (1 - Math.cos(a))
                + a2 * (1 - Math.cos(2 * a))
                + a3 * (1 - Math.cos(3 * a))),
            z,
            w: 0.78 + 0.35 * (0.5 + 0.5 * Math.sin(3 * a)),
        });
    }
    return pts;
}

// Ringkasan SAMBUNGAN sungai, dipublikasikan tiap distrik Kalimantan supaya
// "sungainya nyambung" bisa diuji, bukan cuma dilihat: x di kedua ujung tile
// harus sama satu sama lain DAN sama di semua distrik, dan kemiringan di kedua
// ujung harus nol supaya tidak ada patahan sudut di sambungan.
// Sampling x alur pada koordinat z mana pun, resolusi ruas diturunkan dari
// panjang alurnya sendiri.
function sampleRiverX(pts, z) {
    const n = pts.length - 1;
    const t = (z + TILE_LENGTH * 0.5 + 6) / (TILE_LENGTH + 12) * n;
    const k = Math.max(0, Math.min(n - 1, Math.floor(t)));
    return pts[k].x + (pts[k + 1].x - pts[k].x) * (t - k);
}

function riverJoin(pts) {
    const n = pts.length - 1;
    let maxSlope = 0;
    for (let i = 1; i <= n; i++) maxSlope = Math.max(maxSlope,
        Math.abs((pts[i].x - pts[i - 1].x) / (pts[i].z - pts[i - 1].z)));
    return {
        x0: pts[0].x, x1: pts[n].x, maxSlope,
        slope0: (pts[1].x - pts[0].x) / (pts[1].z - pts[0].z),
        slope1: (pts[n].x - pts[n - 1].x) / (pts[n].z - pts[n - 1].z),
    };
}

function trunkRoadPath(offsetX, segments = 10) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const z = -TILE_LENGTH * 0.5 - 4 + (i / segments) * (TILE_LENGTH + 8);
        pts.push({ x: offsetX + trunkRoadX(z), z });
    }
    return pts;
}

function buildRiverBoat(parent, M, x, z, yaw, scale = 1) {
    const g = new THREE.Group(); parent.add(g);
    g.position.set(x, 1.75, z); g.rotation.y = yaw;
    box(g, M.houseRoofDark, 3.5 * scale, 0.8, 11 * scale, 0, 0, 0);
    const bow = mesh(g, new THREE.ConeGeometry(2.45 * scale, 5 * scale, 4),
        M.houseRoofDark, 0, 0, 7.2 * scale);
    bow.rotation.x = Math.PI * 0.5; bow.rotation.y = Math.PI * 0.25;
    box(g, M.boardwalk, 2.2 * scale, 0.35, 6 * scale, 0, 0.55, -0.5 * scale);
    return g;
}

// Perahu versi INSTANCE untuk kampung sungai, yang memasang belasan sekaligus:
// versi grup di atas berbiaya empat draw node per perahu.
function queueBoat(batch, x, z, yaw, scale) {
    queueSurface(batch, 'houseRoofDark',
        { x, y: 1.75, z, sx: 3.5 * scale, sy: 0.8, sz: 11 * scale, ry: yaw });
    const cab = rotatedOffset(x, z, 0, -0.5 * scale, yaw);
    queueSurface(batch, 'boardwalk', { x: cab.x, y: 2.3, z: cab.z,
        sx: 2.2 * scale, sy: 0.35, sz: 6 * scale, ry: yaw });
}

function optimizeStaticScenery(group) {
    // Global shadow map merender setiap caster sekali lagi. Background dilihat
    // dari 900 unit di atas dan sudah punya volume dari key/fill lighting, jadi
    // bayangan real-time per rumah/pohon nyaris tak terlihat tetapi biayanya
    // mendekati satu render pass tambahan. Unit tempur tetap menjadi caster.
    group.traverse(o => {
        if (o.isMesh || o instanceof THREE.InstancedMesh) o.castShadow = false;
    });
}
function sceneryRenderCensus(group) {
    const census = { drawNodes: 0, batches: 0, instances: 0, shadowCasters: 0 };
    group.traverse(o => {
        if (!(o.isMesh || o instanceof THREE.InstancedMesh)) return;
        census.drawNodes++;
        if (o instanceof THREE.InstancedMesh) {
            census.batches++;
            census.instances += o.count;
        }
        if (o.castShadow) census.shadowCasters++;
    });
    return census;
}

// ===== JAWA: KOTA ==========================================================
// Blok kota nyata tidak pernah berupa kisi menara seragam. Yang dominan justru
// deretan RUKO rendah dan rapat di tepi jalan, dengan beberapa menara berdiri
// terpisah dan sisipan kampung di antara blok.
function buildJavaUrban(parent, M, index) {
    let buildings = 0, roads = 0, rooftopDetails = 0, sidewalks = 0, traffic = 0;
    let towerCount = 0, shophouses = 0, kampung = 0, parcels = 0, blockedParcels = 0;
    const road = makeSurfaceBatch(), surf = makeSurfaceBatch();
    const houseBatch = makeHouseBatch();
    const podiums = [], towerBases = [], accentBases = [], towers = [], wallTowers = [];
    const glassBands = [], roofs = [], roofUnits = [], roofTanks = [];
    const trees = [], crowns = [];
    const keepout = [];

    const mainRoad = trunkRoadPath(0);
    queuePath(road, mainRoad, 34, { kerb: 'cityConcrete', mark: 'cityRoadMark' });
    addRoadCorridor(keepout, mainRoad, 17 + 5);
    roads++; sidewalks += 2;
    for (const bx of [-620, 620]) {
        const side = trunkRoadPath(bx, 8);
        queuePath(road, side, 26, { kerb: 'cityConcrete', mark: 'cityRoadMark' });
        addRoadCorridor(keepout, side, 13 + 5);
        roads++; sidewalks += 2;
    }
    const crossZ = [];
    // DUA jalan silang, bukan tiga: dengan tiga, blok cuma sedalam 113 unit dan
    // tak satu pun menara muat di dalamnya setelah koridor jalan dipotong.
    for (let i = 0; i < 2; i++) {
        const z0 = -TILE_LENGTH * 0.5 + (i + 0.5) * (TILE_LENGTH / 2);
        const pts = [];
        for (let k = 0; k <= 8; k++) {
            const x = -CONTENT_HALF_X - 30 + (k / 8) * (CONTENT_HALF_X * 2 + 60);
            pts.push({ x, z: z0 + Math.sin(k * 0.8 + index) * 16 });
        }
        crossZ.push(pts);
        queuePath(road, pts, 22, { kerb: 'cityConcrete', mark: 'cityRoadMark' });
        addRoadCorridor(keepout, pts, 11 + 5);
        roads++; sidewalks += 2;
    }

    // Parsel: makin dekat jalan raya makin padat dan makin tinggi — pola kota
    // yang tumbuh di sepanjang jalan utama.
    jitterGrid(index * 31 + 5, CONTENT_HALF_X, 150, 68, (x, z, u, c, r) => {
        // JENIS BANGUNAN DIPILIH DARI JARAK KE JALAN TERDEKAT, bukan dari satu
        // skalar kepadatan. Dua kali berturut-turut pendekatan skalar gagal
        // karena puncak kepadatannya jatuh DI DALAM radius penolakan koridor:
        // 30 parsel ingin jadi menara dan 29 di antaranya ditolak, menyisakan
        // satu-satunya menara di seluruh kota. Memilih jenis per pita jarak
        // membuat tiap jenis berdiri di tempat yang memang muat untuknya — dan
        // kebetulan itu juga persis susunan kota sungguhan: ruko berderet
        // menempel jalan, menara mundur satu setback, kampung mengisi dalam blok.
        const dRoad = distanceToRoads(keepout, x, z);
        parcels++;
        const yaw = (lhash(c, r, index + 61) - 0.5) * 0.55;
        // Ambang pita diturunkan dari jarak yang benar-benar TERSEDIA: dengan
        // dua jalan silang, `dRoad` hanya mencapai ~85, jadi ambang 86 membuat
        // seluruh kota jadi ruko.
        const kind = dRoad < 52 ? 'ruko'
            : u > 0.45 ? 'tower'
            : u > 0.14 ? 'kampung' : 'open';
        if (kind === 'tower') {
            const h = 14 + u * 34;
            // Menara diukur agar MUAT di bloknya: badan 80x72 yang lama, sekali
            // diputar, selalu menyenggol koridor jalan blok sedalam 170.
            const w = 34 + lhash(c, r, index + 3) * 20;
            const d = 30 + lhash(c, r, index + 9) * 18;
            // Podium ikut diuji, bukan cuma badan menaranya — podium yang
            // menjorok ke aspal sama salahnya dengan gedung di tengah jalan.
            if (!clearOfRoadsBox(keepout, x, z, w + 12, d + 12, yaw))
                { blockedParcels++; return; }
            podiums.push({ x, y: 1.25, z, sx: w + 12, sy: 1.2, sz: d + 12, ry: yaw });
            (u > 0.85 ? accentBases : towerBases).push({ x, y: 2 + h * 0.17, z,
                sx: w, sy: h * 0.34, sz: d, ry: yaw });
            (u > 0.5 ? towers : wallTowers).push({ x, y: 2 + h * 0.67, z,
                sx: w * 0.78, sy: h * 0.66, sz: d * 0.76, ry: yaw });
            glassBands.push({ x, y: 2 + h * 0.38, z,
                sx: w * 0.82, sy: 1.1, sz: d * 0.8, ry: yaw });
            roofs.push({ x, y: h + 2.6, z, sx: w * 0.72, sy: 0.7, sz: d * 0.7, ry: yaw });
            roofUnits.push({ x: x - w * 0.17, y: h + 3.8, z,
                sx: w * 0.2, sy: 1.8, sz: d * 0.25, ry: yaw });
            if (c % 2 === 0) {
                roofTanks.push({ x: x + w * 0.18, y: h + 4.2, z,
                    sx: 2.1, sy: 3.2, sz: 2.1 });
                rooftopDetails += 2;
            } else rooftopDetails++;
            buildings++; towerCount++;
        } else if (kind === 'ruko') {
            // Deret ruko: satu blok memanjang di tepi jalan, panjang deret beda.
            const n = 3 + Math.floor(u * 4);
            const unit = 17 + u * 5;
            for (let k = 0; k < n; k++) {
                const p = rotatedOffset(x, z, (k - (n - 1) * 0.5) * unit, 0, yaw);
                if (!clearOfRoads(keepout, p.x, p.z, unit * 0.75)) continue;
                queuePitchedHouse(houseBatch, p.x, p.z, unit - 1.5,
                    22 + lhash(c, r + k, index) * 8, 6 + (k % 2) * 1.6, yaw,
                    (c + k) % 2 ? 'roofDark' : 'roofB');
                buildings++; shophouses++; rooftopDetails++;
            }
            if (clearOfRoads(keepout, x, z, Math.max(n * unit + 8, 30) * 0.5))
                queueSurface(surf, 'cityConcrete', { x, y: 0.9, z,
                    sx: n * unit + 8, sy: 0.3, sz: 30, ry: yaw });
        } else if (kind === 'kampung') {
            // Sisipan kampung: rumah kecil dengan arah atap acak-acakan.
            const n = 2 + Math.floor(u * 5);
            for (let k = 0; k < n; k++) {
                const hx = lhash(c * 7 + k, r, index + 41);
                const hz = lhash(c, r * 7 + k, index + 43);
                if (!clearOfRoads(keepout, x + (hx - 0.5) * 92,
                    z + (hz - 0.5) * 52, 13)) continue;
                queuePitchedHouse(houseBatch, x + (hx - 0.5) * 92,
                    z + (hz - 0.5) * 52, 13 + hx * 5, 11 + hz * 4,
                    4.5 + hx * 1.8, (lhash(c + k, r, index + 47) - 0.5) * 2.4,
                    hz > 0.5 ? 'roofA' : 'roofDark');
                buildings++; kampung++; rooftopDetails++;
            }
        } else {
            if (!clearOfRoads(keepout, x, z, (66 + u * 40) * 0.5)) return;
            queueSurface(surf, 'garden', { x, y: 0.88, z,
                sx: 66 + u * 40, sy: 0.24, sz: 40 + u * 20, ry: yaw });
            for (let k = 0; k < 3; k++) {
                const tx = x + (lhash(c + k, r, index + 71) - 0.5) * 76;
                const tz = z + (lhash(c, r + k, index + 73) - 0.5) * 40;
                trees.push({ x: tx, y: 4.2, z: tz, sx: 1.1, sy: 7, sz: 1.1 });
                crowns.push({ x: tx, y: 8, z: tz,
                    sx: 6.4 + u * 3, sy: 1, sz: 6 + u * 2.6 });
            }
        }
    });

    // Lalu lintas menyusuri jalan yang melengkung, bukan lajur lurus.
    const carBodies = [], carCabins = [];
    for (let i = 0; i < 54; i++) {
        const z = -TILE_LENGTH * 0.5 + ((i * 97) % TILE_LENGTH);
        const base = i % 5 === 0 ? -620 : i % 5 === 1 ? 620 : 0;
        const x = base + trunkRoadX(z) + (i % 3 - 1) * 9;
        const ry = Math.atan2(trunkRoadX(z + 12) - trunkRoadX(z - 12), 24);
        carBodies.push({ x, y: 1.8, z, sx: 4.2, sy: 1.1, sz: 9, ry });
        const cab = rotatedOffset(x, z, 0, -0.4, ry);
        carCabins.push({ x: cab.x, y: 2.7, z: cab.z, sx: 3.6, sy: 0.8, sz: 4.1, ry });
        traffic++;
    }
    for (let i = 0; i < 66; i++) {
        const pts = crossZ[i % crossZ.length];
        const t = ((i * 173) % 1000) / 1000 * 8;
        const k = Math.min(7, Math.floor(t)), f = t - k;
        const x = pts[k].x + (pts[k + 1].x - pts[k].x) * f;
        const z = pts[k].z + (pts[k + 1].z - pts[k].z) * f + (i % 2 ? 6 : -6);
        const ry = Math.atan2(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
        carBodies.push({ x, y: 1.8, z, sx: 4.2, sy: 1.1, sz: 9, ry });
        const cab = rotatedOffset(x, z, 0, -0.4, ry);
        carCabins.push({ x: cab.x, y: 2.7, z: cab.z, sx: 3.6, sy: 0.8, sz: 4.1, ry });
        traffic++;
    }

    const towerSquash = compressAbove(
        [towerBases, accentBases, towers, wallTowers, glassBands,
            roofs, roofUnits, roofTanks],
        2, flightSurfaceCeiling());
    const unitBox = () => new THREE.BoxGeometry(1, 1, 1);
    let nodes = flushSurface(parent, M, road, 'road') + flushSurface(parent, M, surf);
    flushHouseBatch(parent, M, houseBatch);
    tagRole(instanceBatch(parent, unitBox(), M.cityConcrete, podiums), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.cityTower, towerBases), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.cityAccent, accentBases), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.cityTower, towers), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.wall, wallTowers), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.cityGlassDark, glassBands), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.cityRoof, roofs), 'building');
    tagRole(instanceBatch(parent, unitBox(), M.dark, roofUnits), 'building');
    tagRole(instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.cityRoof, roofTanks), 'building');
    // Kendaraan JUSTRU harus berada di atas aspal — perannya dibedakan supaya
    // uji "tidak ada bangunan di jalan" tidak salah menuduhnya.
    tagRole(instanceBatch(parent, unitBox(), M.cityAccent, carBodies), 'vehicle');
    tagRole(instanceBatch(parent, unitBox(), M.cityGlassDark, carCabins), 'vehicle');
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.treeTrunk, trees);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.javaDark, crowns);
    return { zone: 'urban', buildings, roads, rooftopDetails,
        sidewalks, traffic, architecturalLayers: buildings * 4,
        towers: towerCount, shophouses, kampung, parcels, blockedParcels,
        towerSquash, renderBatches: 13 + nodes };
}

// ===== JAWA: KAMPUNG =======================================================
// Kampung tumbuh MENYUSURI jalan dan gang, tidak pernah sebagai kisi kavling.
// Kuncinya arah atap yang acak: dari udara, itulah yang paling membedakan
// kampung sungguhan dari perumahan hasil generator.
function buildJavaHousing(parent, M, index) {
    let houses = 0, roads = 0, gardens = 0, drains = 0, pitchedRoofs = 0;
    const road = makeSurfaceBatch(), surf = makeSurfaceBatch();
    const houseBatch = makeHouseBatch();
    const trees = [], crowns = [];
    const keepout = [];

    const mainRoad = trunkRoadPath(0);
    queuePath(road, mainRoad, 30, { kerb: 'cityConcrete', mark: 'cityRoadMark' });
    addRoadCorridor(keepout, mainRoad, 15 + 5);
    roads++;
    const lanes = [];
    for (let i = 0; i < 4; i++) {
        const z0 = -TILE_LENGTH * 0.5 + (i + 0.5) * (TILE_LENGTH / 4);
        const pts = [];
        for (let k = 0; k <= 9; k++) {
            const x = -CONTENT_HALF_X - 20 + (k / 9) * (CONTENT_HALF_X * 2 + 40);
            pts.push({ x, z: z0 + Math.sin(k * 0.7 + i * 1.9 + index) * 19 });
        }
        lanes.push(pts);
        queuePath(road, pts, 15, { kerb: 'cityConcrete' });
        // Gang sempit, tapi trotoar + selokannya tetap harus bersih.
        addRoadCorridor(keepout, pts, 7.5 + 5);
        roads++;
        for (const side of [-1, 1]) for (let k = 1; k < pts.length; k++) {
            const a = pts[k - 1], b = pts[k];
            const yaw = Math.atan2(b.x - a.x, b.z - a.z);
            queueSurface(surf, 'javaRiver', {
                x: (a.x + b.x) * 0.5 + Math.cos(yaw) * side * 11, y: 1.05,
                z: (a.z + b.z) * 0.5 - Math.sin(yaw) * side * 11,
                sx: 2.2, sy: 0.24, sz: Math.hypot(b.x - a.x, b.z - a.z) + 1, ry: yaw });
        }
        drains += 2;
    }

    const laneZ = (x, i) => {
        const pts = lanes[i];
        const t = (x + CONTENT_HALF_X + 20) / (CONTENT_HALF_X * 2 + 40) * 9;
        const k = Math.max(0, Math.min(8, Math.floor(t)));
        return pts[k].z + (pts[k + 1].z - pts[k].z) * (t - k);
    };

    jitterGrid(index * 17 + 3, CONTENT_HALF_X, 88, 34, (x, z, u, c, r) => {
        const lane = Math.max(0, Math.min(3,
            Math.round((z + TILE_LENGTH * 0.5) / (TILE_LENGTH / 4) - 0.5)));
        const lz = laneZ(x, lane);
        const side = z > lz ? 1 : -1;
        // Jarak dasar dinaikkan dari 15 ke 26: rumah sedalam 19 unit yang
        // ditaruh 15 unit dari sumbu gang menjorok sampai 5,5 unit dari sumbu,
        // padahal setengah lebar gang saja sudah 7,5 — itulah rumah yang
        // terlihat berdiri di atas aspal.
        const hz = lz + side * (26 + u * 16);
        if (Math.abs(hz) > TILE_LENGTH * 0.5 + 12) return;
        if (!clearOfRoads(keepout, x, hz, 13)) return;
        if (u < 0.13) {
            queueSurface(surf, 'garden', { x, y: 0.9, z: hz, sx: 44, sy: 0.3, sz: 30 });
            for (let k = 0; k < 3; k++) {
                const tx = x + (k - 1) * 13 + (u - 0.5) * 8;
                trees.push({ x: tx, y: 4.2, z: hz, sx: 1.1, sy: 7, sz: 1.1 });
                crowns.push({ x: tx, y: 8, z: hz, sx: 6.6, sy: 1, sz: 6 });
            }
            gardens++; return;
        }
        const slope = (laneZ(x + 8, lane) - laneZ(x - 8, lane)) / 16;
        const ry = Math.atan(slope) + (lhash(c, r, index + 29) - 0.5) * 1.5;
        const w = 15 + u * 8, d = 12 + lhash(c, r, index + 31) * 7;
        queuePitchedHouse(houseBatch, x, hz, w, d, 5 + u * 2.5, ry,
            (c + r) % 3 === 0 ? 'roofDark' : (c + r) % 2 ? 'roofA' : 'roofB');
        queueSurface(surf, 'garden', { x, y: 0.88, z: hz + side * d * 0.72,
            sx: w + 8, sy: 0.22, sz: 7, ry });
        if (u > 0.62) {
            trees.push({ x: x + w * 0.7, y: 3.6, z: hz + side * 9, sx: 1, sy: 6, sz: 1 });
            crowns.push({ x: x + w * 0.7, y: 7, z: hz + side * 9,
                sx: 5.4, sy: 0.9, sz: 5 });
        }
        houses++; gardens++; pitchedRoofs++;
    });

    const nodes = flushSurface(parent, M, road, 'road') + flushSurface(parent, M, surf);
    flushHouseBatch(parent, M, houseBatch);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.treeTrunk, trees);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.javaDark, crowns);
    return { zone: 'housing', houses, roads, gardens, drains, pitchedRoofs,
        streetTrees: trees.length, batches: 11 + nodes };
}

// ===== JAWA: SAWAH =========================================================
// Sawah nyata itu TERKOTAK-KOTAK (2026-08-29, koreksi user "bentuk sawah juga
// jangan berantakan seperti itu, harus terkotak-kotak"). Versi sebelumnya
// memutar tiap petak mengikuti sudut kontur lalu menjitter posisinya, sehingga
// petak saling tumpang tindih miring-miring — itu bukan sawah, itu berantakan.
//
// Yang benar adalah PERSIL: petak persegi yang berbagi pematang, mengubin
// bidangnya tanpa celah dan tanpa tumpang tindih. Ketakteraturannya datang dari
// UKURAN, bukan dari sudut — persis peta kadaster:
//   - lebar kolom blok berbeda-beda (batas tegak tidak pernah selurus penggaris
//     sepanjang peta),
//   - tiap blok dibagi jadi jumlah baris/kolom petak yang berbeda, jadi ukuran
//     petak berganti dari blok ke blok,
//   - pematang adalah CELAH antar petak di atas satu alas tanah, jadi jaringan
//     pematang ikut tak beraturan tanpa satu pun mesh tambahan,
//   - tinggi teras satu nilai PER BLOK, diambil dari medan kontur, jadi
//     terasering tetap terbaca tanpa membuat petak jadi miring.
// Batas baris blok dipatok pada pecahan tetap dari TILE_LENGTH, jadi sama di
// setiap tile dan jahitan antar tile tidak pernah terlihat.
function buildJavaRiceFields(parent, M, index) {
    let paddies = 0, bunds = 0, irrigation = 0, cropRows = 0, waterGlints = 0;
    const surf = makeSurfaceBatch(), road = makeSurfaceBatch();
    const crops = [], glints = [];
    const keepout = [];

    // Alas pematang: satu mesh; tiap petak di atasnya menyisakan celah.
    box(parent, M.riceBund, CONTENT_HALF_X * 2 + 60, 0.2, TILE_LENGTH + 6, 0, 0.74, 0);

    // Jalan usaha tani dulu, supaya blok sawah bisa menghindarinya.
    const trunk = trunkRoadPath(0);
    queuePath(road, trunk, 16, { surface: 'javaDry' });
    addRoadCorridor(keepout, trunk, 8 + 3);
    for (let i = 0; i < 2; i++) {
        const z0 = -TILE_LENGTH * 0.5 + (i + 0.5) * (TILE_LENGTH / 2);
        const pts = [];
        for (let k = 0; k <= 8; k++) {
            const x = -CONTENT_HALF_X - 20 + (k / 8) * (CONTENT_HALF_X * 2 + 40);
            pts.push({ x, z: z0 + Math.sin(k * 0.9 + index * 1.3) * 22 });
        }
        queuePath(road, pts, 11, { surface: 'javaDry' });
        addRoadCorridor(keepout, pts, 5.5 + 3);
    }

    // Batas baris blok: pecahan TETAP dari panjang tile, jadi identik di tiap
    // tile — itulah yang membuat sambungan antar tile tak terlihat.
    const rowFrac = [0, 0.28, 0.55, 0.78, 1];
    // Batas kolom blok: lebarnya BERVARIASI, jadi jahitan tegaknya tidak pernah
    // sejajar rapi sepanjang peta.
    const colX = [-CONTENT_HALF_X];
    for (let i = 0; colX[colX.length - 1] < CONTENT_HALF_X; i++) {
        const w = 132 + lhash(i, index, 71) * 128;
        colX.push(Math.min(CONTENT_HALF_X, colX[colX.length - 1] + w));
    }

    const BUND = 2.6;                       // lebar pematang antar petak
    for (let br = 0; br < rowFrac.length - 1; br++) {
        const z0 = -TILE_LENGTH * 0.5 + rowFrac[br] * TILE_LENGTH;
        const z1 = -TILE_LENGTH * 0.5 + rowFrac[br + 1] * TILE_LENGTH;
        for (let bc = 0; bc < colX.length - 1; bc++) {
            const x0 = colX[bc], x1 = colX[bc + 1];
            const cx = (x0 + x1) * 0.5, cz = (z0 + z1) * 0.5;
            const u = lhash(bc, br, index + 13);
            // Sebagian blok bukan sawah: kampung kecil, kolam, atau lahan bera.
            if (u > 0.93) continue;
            // Satu ketinggian teras per BLOK — terasering tetap terbaca tanpa
            // memiringkan satu pun petak.
            const terrace = Math.round(contourAt(cx, cz, index) * 7) * 0.15;
            const cols = 2 + Math.floor(lhash(bc, br, index + 17) * 4);
            const rows = 1 + Math.floor(lhash(bc, br, index + 19) * 3);
            const pw = (x1 - x0) / cols, pd = (z1 - z0) / rows;
            for (let pr = 0; pr < rows; pr++) for (let pc = 0; pc < cols; pc++) {
                const px = x0 + (pc + 0.5) * pw, pz = z0 + (pr + 0.5) * pd;
                const w = pw - BUND, d = pd - BUND;
                if (w < 8 || d < 8) continue;
                // Petak yang tersentuh jalan dilewati: lebih baik pematang
                // kosong daripada sawah tergambar di atas aspal. Diuji dengan
                // TAPAK sebenarnya — lingkaran pembungkus memakai setengah sisi
                // terpanjang, jadi petak selebar 100 unit ikut terbuang sampai
                // 58 unit dari jalan dan meninggalkan pita kosong lebar.
                if (!clearOfRoadsBox(keepout, px, pz, w, d, 0)) continue;
                const phase = lhash(pc + bc * 17, pr + br * 23, index + 29);
                const key = phase < 0.28 ? 'riceWater' : phase < 0.52 ? 'riceYoung'
                    : phase < 0.8 ? 'riceMature' : 'javaDry';
                queueSurface(surf, key,
                    { x: px, y: 0.78 + terrace, z: pz, sx: w, sy: 0.24, sz: d });
                if (key === 'riceWater') {
                    for (let k = -1; k <= 1; k++) {
                        glints.push({ x: px + k * w * 0.26, y: 1.04 + terrace, z: pz,
                            sx: w * 0.18, sy: 0.05, sz: 0.7 });
                        waterGlints++;
                    }
                } else if (key !== 'javaDry') {
                    // Larik tanam mengikuti sisi PANJANG petak, seperti aslinya.
                    const along = w >= d;
                    const n = Math.max(3, Math.min(6, Math.floor((along ? d : w) / 9)));
                    for (let k = 0; k < n; k++) {
                        const t = (k + 0.5) / n - 0.5;
                        crops.push(along
                            ? { x: px, y: 1.08 + terrace, z: pz + t * d,
                                sx: w * 0.88, sy: 0.35, sz: 1.2 }
                            : { x: px + t * w, y: 1.08 + terrace, z: pz,
                                sx: 1.2, sy: 0.35, sz: d * 0.88 });
                        cropRows++;
                    }
                }
                paddies++;
            }
            bunds++;
        }
    }

    // Saluran irigasi menyusuri batas blok, lurus seperti jaringan sebenarnya,
    // dengan satu saluran induk yang berkelok.
    for (const bc of [2, 5, 8]) {
        if (bc >= colX.length) continue;
        const x = colX[bc];
        queueSurface(surf, 'javaRiver',
            { x, y: 1.0, z: 0, sx: 5, sy: 0.3, sz: TILE_LENGTH + 6 });
        irrigation++;
    }
    queueRiver(surf, riverPath(index % 2 ? 470 : -470, index * 0.9, 52, 9), 15,
        { bank: 'riceBund', water: 'javaRiver', shallow: 'riceWaterGlint' });
    irrigation++;

    // Rumah tani dan rumpun pohon, di pematang dan selalu lepas dari jalan.
    const houseBatch = makeHouseBatch();
    const trees = [], crowns = [];
    for (let i = 0; i < 9; i++) {
        const hx = -CONTENT_HALF_X + 110 + i * ((CONTENT_HALF_X * 2 - 220) / 8)
            + (lhash(i, index, 5) - 0.5) * 60;
        const hz = -TILE_LENGTH * 0.4 + lhash(i, index, 9) * TILE_LENGTH * 0.8;
        if (!clearOfRoads(keepout, hx, hz, 18)) continue;
        queuePitchedHouse(houseBatch, hx, hz, 12, 9, 4,
            (lhash(i, index, 11) - 0.5) * 2.2, 'roofA', 1.2);
        for (let k = 0; k < 3; k++) {
            const tx = hx + (k - 1) * 11 + (lhash(i, k, index) - 0.5) * 9;
            const tz = hz + 16 + (lhash(k, i, index) - 0.5) * 12;
            trees.push({ x: tx, y: 4.6, z: tz, sx: 1.1, sy: 7.8, sz: 1.1 });
            crowns.push({ x: tx, y: 8.6, z: tz, sx: 6.2, sy: 1.1, sz: 5.8 });
        }
    }

    const unitBox = () => new THREE.BoxGeometry(1, 1, 1);
    const nodes = flushSurface(parent, M, surf) + flushSurface(parent, M, road, 'road');
    flushHouseBatch(parent, M, houseBatch);
    instanceBatch(parent, unitBox(), M.riceDark, crops);
    instanceBatch(parent, unitBox(), M.riceWaterGlint, glints);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.treeTrunk, trees);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.javaDark, crowns);
    return { zone: 'rice-fields', paddies, bunds, irrigation,
        cropRows, waterGlints, roofProfile: pitchedRoofLayout(12, 4, 1.2),
        batches: 4 + nodes };
}

// ===== JAWA: KEBUN =========================================================
// Kebun teh/karet adalah contoh paling murni "baris mengikuti kontur": barisnya
// memang rapat dan teratur, tetapi MELENGKUNG menyusuri lereng, dan batas
// bloknya tidak beraturan. Kisi lurus adalah satu-satunya hal yang salah dulu.
function buildJavaPlantation(parent, M, index) {
    let trees = 0, rows = 0, roads = 0, processingBuildings = 0;
    box(parent, M.plantationSoil, CONTENT_HALF_X * 2 + 40, 0.18, TILE_LENGTH + 4, 0, 0.71, 0);
    const trunks = [], lowerCrowns = [], upperCrowns = [], rowShadows = [];
    const surf = makeSurfaceBatch(), road = makeSurfaceBatch();
    // Jalan kebun digambar lebih dulu supaya barisan pohon bisa menghindarinya.
    const keepout = [];
    const mainRoad = trunkRoadPath(0);
    queuePath(road, mainRoad, 18, { surface: 'javaDry' }); roads++;
    addRoadCorridor(keepout, mainRoad, 9 + 4);
    for (const bx of [-560, 560]) {
        const pts = [];
        for (let k = 0; k <= 10; k++) {
            const z = -TILE_LENGTH * 0.5 - 4 + (k / 10) * (TILE_LENGTH + 8);
            pts.push({ x: bx + trunkRoadX(z) * 0.6, z });
        }
        queuePath(road, pts, 14, { surface: 'javaDry' }); roads++;
        addRoadCorridor(keepout, pts, 7 + 4);
    }

    const rowCount = Math.round(TILE_LENGTH / 34);
    for (let r = 0; r < rowCount; r++) {
        const z0 = -TILE_LENGTH * 0.5 + (r + 0.5) * (TILE_LENGTH / rowCount);
        const age = lhash(0, r, index + 3);
        let prev = null;
        for (let c = 0; c <= 48; c++) {
            const x = -CONTENT_HALF_X + (c / 48) * (CONTENT_HALF_X * 2);
            const z = z0 + (contourAt(x, z0, index) - 0.5) * 26;
            const u = lhash(c, r, index + 7);
            if (u > 0.94) { prev = { x, z }; continue; }
            if (!clearOfRoads(keepout, x, z, 7)) { prev = null; continue; }
            const h = 6.4 + age * 2.2 + u * 0.8;
            const rr = 6.6 + age * 2.4 + u * 1.1;
            trunks.push({ x, y: h * 0.5 + 0.8, z, sx: 1.25, sy: h, sz: 1.25 });
            (age > 0.5 ? lowerCrowns : upperCrowns).push({ x, y: h + 0.6, z,
                sx: rr, sy: 1, sz: rr * 0.78 });
            if (prev) {
                const dx = x - prev.x, dz = z - prev.z;
                rowShadows.push({ x: (x + prev.x) * 0.5, y: 0.91, z: (z + prev.z) * 0.5,
                    sx: 12, sy: 0.08, sz: Math.hypot(dx, dz) + 2, ry: Math.atan2(dx, dz) });
            }
            prev = { x, z };
            trees++;
        }
        rows++;
    }

    const houseBatch = makeHouseBatch();
    for (const hx of [-780, -180, 420, 900]) {
        const hz = -110 + lhash(hx | 0, index, 3) * 190;
        queueSurface(surf, 'cityConcrete', { x: hx, y: 1.02, z: hz, sx: 74, sy: 0.5, sz: 44 });
        queuePitchedHouse(houseBatch, hx, hz, 50, 26, 8,
            (lhash(hx | 0, index, 7) - 0.5) * 0.5, 'roofDark');
        queueSurface(surf, 'javaDry', { x: hx + 12, y: 0.96, z: hz + 54,
            sx: 62, sy: 0.18, sz: 28 });
        processingBuildings++;
    }

    const nodes = flushSurface(parent, M, surf) + flushSurface(parent, M, road, 'road');
    flushHouseBatch(parent, M, houseBatch);
    instanceBatch(parent, new THREE.BoxGeometry(1, 1, 1), M.javaDry, rowShadows);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.treeTrunk, trunks);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.plantationLeaf, lowerCrowns);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.plantationLeafLight, upperCrowns);
    return { zone: 'plantation', trees, rows, roads, processingBuildings,
        roofProfile: pitchedRoofLayout(50, 8), batches: 4 + nodes };
}

// ===== KALIMANTAN: HUTAN HUJAN =============================================
// Kanopi hutan hujan dari udara adalah TEKSTUR: tajuk beragam ukuran yang
// saling tindih tanpa satu pun garis lurus, dipotong sungai berkelok dan
// rumpang alami. Akar banir per pohon dibuang — mustahil terlihat dari 900 unit
// dan biayanya dipakai untuk menambah pohon, yang justru terlihat.
function buildKalimantanRainforest(parent, M, index) {
    let trees = 0, canopyLayers = 0, rivers = 0, understory = 0, fallenLogs = 0;
    let treeCells = 0;
    const trunks = [], lowerCrowns = [], middleCrowns = [], upperCrowns = [];
    const shrubs = [], logs = [];
    const surf = makeSurfaceBatch();

    const river = riverPath(KAL_RIVER_X, index * 1.3, 118, 13);
    rivers += queueRiver(surf, river, 46,
        { bank: 'riverBank', water: 'kalimantanRiver', shallow: 'riverShallow' });
    // Jumlah ruas DITURUNKAN dari alurnya sendiri; versi lama menuliskan 13/12
    // di tiga tempat, jadi menaikkan resolusi alur diam-diam merusak pencarian.
    const riverXAt = (z) => sampleRiverX(river, z);

    // HUTAN DIPERLEBAT TANPA MENAMBAH BEBAN (2026-08-29, permintaan user
    // "perlebat pohon-pohon yang ada tanpa membuat gamenya jadi berat").
    // Kepadatan paling murah BUKAN menambah pohon melainkan MEMBESARKAN TAJUK:
    // tajuk yang lebih lebar menutup celah kanopi tanpa satu pun instans
    // tambahan. Jadi tajuk dilebarkan (gratis), kisi dirapatkan sedang saja,
    // lapis tajuk KETIGA dibuat jarang, dan batang turun ke silinder 4 sisi —
    // dari 900 unit sebuah batang selebar 1-2 piksel dan 4 sisi tak bisa
    // dibedakan dari 6. Hasilnya pohon jauh lebih banyak pada biaya segitiga
    // yang praktis sama.
    jitterGrid(index * 29 + 11, CONTENT_HALF_X, 30, 22, (x, z, u, c, r) => {
        if (Math.abs(x - riverXAt(z)) < 30) return;            // alur sungai
        treeCells++;
        const dens = contourAt(x, z, index + 4);
        if (u > 0.42 + dens * 0.5) {                            // rumpang alami
            if (u > 0.93) {
                shrubs.push({ x, y: 2.05, z, sx: 5 + u * 4, sy: 0.65, sz: 4 + u * 3 });
                understory++;
            }
            return;
        }
        const emergent = u < 0.06;
        const h = (9 + u * 9) * (emergent ? 1.35 : 1);
        const rr = 13 + u * 11 + (emergent ? 6 : 0);
        trunks.push({ x, y: h * 0.5 + 0.7, z, sx: 1.5 + u * 0.6, sy: h, sz: 1.5 + u * 0.6 });
        lowerCrowns.push({ x, y: h + 0.7, z, sx: rr, sy: 1.55, sz: rr * 0.84,
            ry: u * 3.1 });
        // Lapis tajuk TENGAH kini hanya pada sebagian pohon: dengan tajuk bawah
        // yang sudah jauh lebih lebar, lapis kedua berfungsi sebagai variasi
        // warna, bukan penutup celah — dan itulah yang mengembalikan biaya
        // segitiganya ke titik semula.
        if (u > 0.42) {
            middleCrowns.push({ x: x - 2.4 + u * 3, y: h + 2, z: z + 1.7 - u * 2,
                sx: rr * 0.75, sy: 1.15, sz: rr * 0.67, ry: u * 2.2 });
            canopyLayers++;
        }
        if (u < 0.30) {
            upperCrowns.push({ x: x + 2 - u * 3, y: h + 3.2, z: z - 1.8 + u * 2,
                sx: rr * 0.48, sy: 0.82, sz: rr * 0.44, ry: u * 1.7 });
            canopyLayers++;
        }
        canopyLayers++;
        trees++;
    });

    jitterGrid(index * 37 + 19, CONTENT_HALF_X, 84, 68, (x, z, u, c, r) => {
        if (Math.abs(x - riverXAt(z)) < 34) return;
        if (u < 0.75) {
            shrubs.push({ x, y: 2.05, z, sx: 6 + u * 6, sy: 0.65, sz: 5 + u * 4 });
            understory++;
        } else if (u > 0.86) {
            logs.push({ x, y: 1.35, z, sx: 10 + u * 9, sy: 1.2, sz: 1.2,
                ry: u * Math.PI });
            fallenLogs++;
        }
    });

    const canopySquash = compressAbove(
        [trunks, lowerCrowns, middleCrowns, upperCrowns], 0.7, flightSurfaceCeiling());
    const nodes = flushSurface(parent, M, surf);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 4), M.treeTrunk, trunks);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.tropicalCanopyDark, lowerCrowns);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.tropicalCanopy, middleCrowns);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.tropicalCanopyLight, upperCrowns);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.tropicalUnderstory, shrubs);
    instanceBatch(parent, new THREE.BoxGeometry(1, 1, 1), M.treeTrunk, logs);
    return { zone: 'tropical-rainforest', canopySquash, trees, canopyLayers, rivers,
        understory, fallenLogs, riverJoin: riverJoin(river),
        treeCells, crownRadiusAvg: 13 + 11 * 0.5, gridSpacingX: 30, batches: 6 + nodes };
}

// ===== KALIMANTAN: KEBUN SAWIT =============================================
// Ini satu-satunya bentang yang memang geometris di dunia nyata — tapi yang
// teratur adalah BARIS DI DALAM satu blok, bukan seluruh peta. Blok dipisahkan
// parit dan jalan, tiap blok punya arah tanam dan UMUR sendiri (tajuk lebih
// kecil dan lebih terang pada blok muda), dan batas bloknya tidak rata.
function buildKalimantanPalmPlantation(parent, M, index) {
    let palms = 0, rows = 0, drainage = 0, fronds = 0, serviceBuildings = 0;
    box(parent, M.plantationSoil, CONTENT_HALF_X * 2 + 40, 0.18, TILE_LENGTH + 4, 0, 0.72, 0);
    const trunks = [], crowns = [], frondDark = [], frondLight = [], shadows = [];
    const surf = makeSurfaceBatch(), road = makeSurfaceBatch();

    // SUNGAI INDUK ikut melintasi kebun sawit. Tanpa ini sungai lenyap di tiap
    // tile sawit (index 1 dan 4 dari enam), jadi rantainya putus lagi meski
    // hutan dan kampungnya sudah tersambung — dan kebun sawit sungguhan memang
    // dibelah sungai, bukan berhenti di tepinya.
    const river = riverPath(KAL_RIVER_X, index * 1.3, 118, 13);
    queueRiver(surf, river, 46,
        { bank: 'riverBank', water: 'kalimantanRiver', shallow: 'riverShallow' });
    // Jumlah ruas DITURUNKAN dari alurnya sendiri; versi lama menuliskan 13/12
    // di tiga tempat, jadi menaikkan resolusi alur diam-diam merusak pencarian.
    const riverXAt = (z) => sampleRiverX(river, z);

    const BLOCKS = 7;
    const blockW = (CONTENT_HALF_X * 2) / BLOCKS;
    for (let b = 0; b < BLOCKS; b++) {
        const bx = -CONTENT_HALF_X + (b + 0.5) * blockW;
        const age = lhash(b, index, 3);
        const tilt = (lhash(b, index, 7) - 0.5) * 0.42;     // arah tanam per blok
        const spacing = 42 + age * 12;
        const rowsHere = Math.max(1, Math.round(TILE_LENGTH / spacing));
        const step = TILE_LENGTH / rowsHere;
        for (let r = 0; r < rowsHere; r++) {
            const z0 = -TILE_LENGTH * 0.5 + (r + 0.5) * step;
            const cols = Math.floor(blockW / spacing);
            for (let c = 0; c < cols; c++) {
                const lx = (c - (cols - 1) * 0.5) * spacing;
                const p = rotatedOffset(bx, z0, lx, (r % 2) * spacing * 0.4, tilt);
                if (Math.abs(p.x) > CONTENT_HALF_X) continue;
                const u = lhash(c, r * 13 + b, index + 5);
                if (u > 0.96) continue;                      // pohon mati
                if (Math.abs(p.x - riverXAt(p.z)) < 40) continue;   // alur sungai
                const h = (7.5 + age * 4) + u * 1.4;
                const cr = (3.6 + age * 2.4) + u * 0.7;
                trunks.push({ x: p.x, y: h * 0.5 + 0.7, z: p.z,
                    sx: 1.3, sy: h, sz: 1.3 });
                crowns.push({ x: p.x, y: h + 0.8, z: p.z,
                    sx: cr, sy: 1.4, sz: cr, ry: u * 2.4 });
                shadows.push({ x: p.x + 4, y: 0.9, z: p.z + 3,
                    sx: cr * 3.4, sy: 0.05, sz: cr * 2.4, ry: tilt + u });
                // Empat pelepah, bukan delapan: dari 900 unit yang terbaca hanya
                // siluet tajuknya, dan biayanya dipakai untuk lebih banyak pohon.
                for (let f = 0; f < 4; f++) {
                    const a = u * 2.4 + f * Math.PI * 0.5;
                    (f % 2 ? frondLight : frondDark).push({
                        x: p.x + Math.sin(a) * cr * 1.2, y: h + 1.05,
                        z: p.z + Math.cos(a) * cr * 1.2,
                        sx: 3.1, sy: 0.25, sz: cr * 2.9, ry: a, rx: (f % 3 - 1) * 0.05 });
                    fronds++;
                }
                palms++;
            }
            rows++;
        }
        // Parit dan jalan koleksi memisahkan blok, mengikuti tepi blok.
        if (b < BLOCKS - 1) {
            const ex = bx + blockW * 0.5;
            const pts = [];
            for (let k = 0; k <= 8; k++) {
                const z = -TILE_LENGTH * 0.5 - 4 + (k / 8) * (TILE_LENGTH + 8);
                pts.push({ x: ex + Math.sin(k * 0.8 + b) * 9, z });
            }
            queueRiver(surf, pts, 7,
                { bank: 'riverBank', water: 'kalimantanRiver', shallow: 'riverShallow' });
            queuePath(road, pts, 12, { surface: 'javaDry' });
            drainage++;
        }
    }
    queuePath(road, trunkRoadPath(0), 20, { surface: 'javaDry' });

    const houseBatch = makeHouseBatch();
    const silos = [];
    for (const hx of [-820, 60, 880]) {
        const hz = -120 + lhash(hx | 0, index, 11) * 200;
        queuePitchedHouse(houseBatch, hx, hz, 38, 22, 8,
            (lhash(hx | 0, index, 13) - 0.5) * 0.6, 'roofDark');
        silos.push({ x: hx + 30, y: 4, z: hz + 34, sx: 8, sy: 5, sz: 8 });
        serviceBuildings++;
    }

    const nodes = flushSurface(parent, M, surf) + flushSurface(parent, M, road, 'road');
    flushHouseBatch(parent, M, houseBatch);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.treeTrunk, trunks);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.palmLeaf, crowns);
    instanceBatch(parent, new THREE.BoxGeometry(1, 1, 1), M.tropicalCanopyDark, shadows);
    instanceBatch(parent, new THREE.BoxGeometry(1, 1, 1), M.palmLeaf, frondDark);
    instanceBatch(parent, new THREE.BoxGeometry(1, 1, 1), M.palmLeafLight, frondLight);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.cityTower, silos);
    return { zone: 'oil-palm-plantation', riverJoin: riverJoin(river), palms, rows, drainage,
        fronds, serviceBuildings, batches: 6 + nodes };
}

// ===== KALIMANTAN: KAMPUNG SUNGAI ==========================================
// Kampung sungai berbaris MENGIKUTI ALUR, bukan mengisi bidang: rumah panggung
// menghadap air di kedua tepi, dermaga kecil menjorok, perahu ditambat, dan
// hutan langsung merapat di belakangnya.
function buildKalimantanHousing(parent, M, index) {
    let houses = 0, boardwalks = 0, boats = 0, jetties = 0, roofPanels = 0;
    let riverSegments = 0;
    const surf = makeSurfaceBatch();
    const houseBatch = makeHouseBatch();
    const trunks = [], crowns = [];

    const river = riverPath(KAL_RIVER_X, index * 1.7, 118, 13);
    riverSegments = queueRiver(surf, river, 74,
        { bank: 'riverBank', water: 'kalimantanRiver', shallow: 'riverShallow' });
    const riverAt = (z) => {
        const n = river.length - 1;
        const t = (z + TILE_LENGTH * 0.5 + 6) / (TILE_LENGTH + 12) * n;
        const k = Math.max(0, Math.min(n - 1, Math.floor(t)));
        const x = river[k].x + (river[k + 1].x - river[k].x) * (t - k);
        const yaw = Math.atan2(river[k + 1].x - river[k].x, river[k + 1].z - river[k].z);
        return { x, yaw };
    };

    // Rumah panggung berjajar di kedua tepi, menghadap air.
    const rowsHere = Math.round(TILE_LENGTH / 20);
    for (let r = 0; r < rowsHere; r++) {
        const z = -TILE_LENGTH * 0.5 + (r + 0.5) * (TILE_LENGTH / rowsHere);
        const { x: rx, yaw } = riverAt(z);
        for (const side of [-1, 1]) {
            const u = lhash(r, side, index + 3);
            if (u > 0.82) continue;
            const off = side * (52 + u * 26);
            const hx = rx + off * Math.cos(yaw);
            const hz = z - off * Math.sin(yaw);
            if (Math.abs(hx) > CONTENT_HALF_X) continue;
            queuePitchedHouse(houseBatch, hx, hz, 13 + u * 5, 10 + u * 4,
                4.5 + u * 1.6, yaw + (u - 0.5) * 0.5,
                u > 0.5 ? 'roofDark' : 'roofA', 2.4);
            houses++; roofPanels += 2;
            // Titian dari rumah ke tepi air.
            const bx = rx + side * 26 * Math.cos(yaw);
            const bz = z - side * 26 * Math.sin(yaw);
            queueSurface(surf, 'boardwalk', {
                x: (hx + bx) * 0.5, y: 2.2, z: (hz + bz) * 0.5,
                sx: 3.4, sy: 0.4, sz: Math.hypot(hx - bx, hz - bz), ry: yaw + Math.PI * 0.5 });
            jetties++;
            if (u < 0.42) {
                queueBoat(surf, rx + side * 18 * Math.cos(yaw),
                    z - side * 18 * Math.sin(yaw), yaw + (u - 0.5) * 0.4, 0.85 + u * 0.4);
                boats++;
            }
        }
    }
    // Titian memanjang di kedua tepi menghubungkan rumah.
    for (const side of [-1, 1]) {
        for (let k = 1; k < river.length; k++) {
            const a = river[k - 1], b = river[k];
            const yaw = Math.atan2(b.x - a.x, b.z - a.z);
            queueSurface(surf, 'boardwalk', {
                x: (a.x + b.x) * 0.5 + side * 44 * Math.cos(yaw), y: 2.35,
                z: (a.z + b.z) * 0.5 - side * 44 * Math.sin(yaw),
                sx: 5, sy: 0.42, sz: Math.hypot(b.x - a.x, b.z - a.z) + 2, ry: yaw });
        }
        boardwalks++;
    }

    // Hutan merapat di belakang kampung, sampai tepi layar.
    // Hutan latar kampung memakai tuas yang sama dengan hutan hujan: tajuk
    // dilebarkan (tidak menambah satu pun instans) dan kisinya dirapatkan
    // sedikit, jadi rimbunnya nyambung dengan tile hutan di sebelahnya.
    jitterGrid(index * 41 + 23, CONTENT_HALF_X, 42, 28, (x, z, u) => {
        const { x: rx } = riverAt(z);
        if (Math.abs(x - rx) < 110) return;
        if (u > 0.62) return;
        const h = 9 + u * 8;
        trunks.push({ x, y: h * 0.5 + 0.7, z, sx: 1.5, sy: h, sz: 1.5 });
        crowns.push({ x, y: h + 0.9, z, sx: 13 + u * 9, sy: 1.5, sz: 11 + u * 8,
            ry: u * 3 });
    });
    compressAbove([trunks, crowns], 0.7, flightSurfaceCeiling());

    const nodes = flushSurface(parent, M, surf);
    flushHouseBatch(parent, M, houseBatch);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 4), M.treeTrunk, trunks);
    instanceBatch(parent, new THREE.CylinderGeometry(1, 1, 1, 6), M.tropicalCanopy, crowns);
    return { zone: 'housing', riverJoin: riverJoin(river), houses, boardwalks,
        trees: trunks.length, boats,
        jetties, roofPanels, riverSegments, batches: 2 + nodes };
}

function buildCoastTile(parent, M, index, landMat, landDetailMat, landOnPlusZ) {
    const g = new THREE.Group(); parent.add(g); g.visible = false;
    const side = landOnPlusZ ? 1 : -1;
    // Pelat laut tile pantai sengaja sedikit LEBIH RENDAH dan hanya melebihi
    // tile secukupnya: di daerah tumpang tindih, pelat tile tetangga yang menang,
    // jadi tidak ada dua permukaan sebidang yang saling berkedip (z-fighting).
    const span = TILE_LENGTH * 1.4;

    // Laut menutupi seluruh tile; daratan menimpanya di sisi yang benar.
    box(g, M.ocean, TERRAIN_WIDTH, 1.1, span, 0, -0.08, 0);
    const seaTexture = [];
    for (let i = 0; i < 42; i++) seaTexture.push({
        x: ((i * 277 + index * 131) % 1900) - 950,
        y: 0.72,
        z: -side * (28 + ((i * 57 + index * 91) % 300)),
        sx: 16 + (i % 5) * 9, sy: 0.08, sz: 0.8,
        ry: ((i + index) % 7 - 3) * 0.055,
    });
    instanceBatch(g, new THREE.BoxGeometry(1, 1, 1), M.oceanLine, seaTexture);

    // Air dangkal + buih menempel tepat di garis air.
    const shallow = box(g, M.shallow, TERRAIN_WIDTH, 1.15, 34, 0, 0.06, 0);
    const surf = box(g, M.surf, TERRAIN_WIDTH, 0.1, 7, 0, 1.3, 0);
    const surfBands = [surf];
    for (let i = 1; i <= 3; i++) surfBands.push(box(g, M.surf,
        TERRAIN_WIDTH, 0.08, Math.max(1.4, 5 - i), 0, 1.18 - i * 0.04, 0));
    // Pasir: bibir pantai, lalu pasir kering ke arah daratan.
    const wet = box(g, M.sandWet, TERRAIN_WIDTH, 1.25, 16, 0, 0.1, 0);
    const sand = box(g, M.sand, TERRAIN_WIDTH, 1.3, 30, 0, 0.14, 0);
    // UJUNG DARATAN: pelat yang panjang/posisinya disetel saat tile ditugaskan.
    const land = box(g, landMat, TERRAIN_WIDTH, 1.32, 1, 0, 0.1, 0);

    // Perabot daratan dipatok pada JARAK DARI GARIS PANTAI, lalu disembunyikan
    // kalau daratan di tile itu terlalu pendek untuk memuatnya.
    const inland = [];
    for (let i = 0; i < 12; i++) {
        const item = new THREE.Group(); g.add(item);
        item.userData.inland = 42 + (i % 6) * 48;
        const x = ((i * 277 + index * 151) % 1520) - 760;
        item.position.x = x;
        if (i % 4 === 0) buildPitchedHouse(item, M, 0, 0,
            17 + i % 3 * 2, 13, 5.5, (i % 4) * 0.08,
            i % 2 ? M.houseRoofA : M.houseRoofB, side < 0 ? 1 : 0);
        else {
            const h = 8 + i % 4 * 1.5;
            cylinder(item, M.treeTrunk, 1.35, h, 0, h * 0.5 + 0.8, 0, 'y', 8);
            cylinder(item, landDetailMat, 10 + i % 4 * 2.5, 1.25,
                0, h + 1, 0, 'y', 10).scale.z = 0.72;
            cylinder(item, M.tropicalCanopyLight, 6 + i % 3 * 1.5, 0.7,
                2, h + 2.2, -1, 'y', 9).scale.z = 0.68;
        }
        inland.push(item);
    }
    // Dermaga kecil menjorok ke air — penanda "ini benar-benar pantai".
    const jetty = new THREE.Group(); g.add(jetty);
    jetty.position.x = index % 2 ? 168 : -172;
    box(jetty, M.pier, 5, 1.6, 62, 0, 1.4, 0);
    for (let i = 0; i < 4; i++) box(jetty, M.pier, 1.6, 3, 1.6, 0, 0.4, -24 + i * 16);
    buildRiverBoat(jetty, M, 9, -23, -0.08, 0.9);

    // Karang dan gosong pasir mengikuti garis air dan memberi kedalaman pesisir.
    const shoreDetails = [];
    for (let i = 0; i < 9; i++) {
        const detail = new THREE.Group(); g.add(detail);
        detail.userData.shoreOffset = -side * (30 + i % 3 * 13);
        detail.position.x = ((i * 229 + index * 71) % 1360) - 680;
        const rock = cylinder(detail, i % 3 ? M.sandWet : M.oceanIslandGreen,
            4 + i % 4 * 1.4, 0.35 + i % 2 * 0.18, 0, 0.9, 0, 'y', 8);
        rock.scale.z = 0.48 + i % 3 * 0.12;
        shoreDetails.push(detail);
    }

    g.userData.coast = { side, shallow, surf, surfBands, wet, sand, land,
        inland, jetty, shoreDetails, span };
    return g;
}

function buildTerrainTile(parent, M, index) {
    const group = new THREE.Group();
    parent.add(group);
    const biomes = {};

    // --- Jawa: empat distrik nyata yang bergantian sepanjang rute. ---
    const java = new THREE.Group(); group.add(java); biomes.java = java;
    box(java, M.java, TERRAIN_WIDTH, 1.2, TILE_LENGTH + 3, 0, 0, 0);
    // PORSI JAWA: sawah dan kebun mendominasi (2026-08-29, permintaan user
    // "untuk pulau jawa, perbanyak porsi sawah dan perkebunan"). Rotasi lama
    // empat entri menghasilkan 4 tile terbangun : 2 pertanian di enam tile —
    // terbalik dari Jawa sebenarnya. Daftar ini panjangnya PERSIS TILE_COUNT,
    // jadi porsinya benar-benar 4 pertanian : 2 terbangun dan tidak bergantung
    // pada sisa pembagian.
    const javaBuilders = [buildJavaRiceFields, buildJavaPlantation, buildJavaUrban,
        buildJavaRiceFields, buildJavaPlantation, buildJavaHousing];
    const javaLandscape = javaBuilders[index % javaBuilders.length](java, M, index);
    java.userData.landscape = javaLandscape;

    // --- Laut Jawa: ombak, pulau kecil, dermaga ---
    const ocean = new THREE.Group(); group.add(ocean); biomes.ocean = ocean;
    box(ocean, M.ocean, TERRAIN_WIDTH, 1.1, TILE_LENGTH + 3, 0, 0, 0);
    const oceanRipples = [];
    for (let i = 0; i < 52; i++) oceanRipples.push({
        x: ((i * 277 + index * 131) % 1960) - 980,
        y: 0.72,
        z: ((i * 97 + index * 211) % 320) - 160,
        sx: 15 + (i % 6) * 8, sy: 0.08, sz: 0.75,
        ry: ((i + index) % 7 - 3) * 0.065,
    });
    instanceBatch(ocean, new THREE.BoxGeometry(1, 1, 1), M.oceanLine, oceanRipples);
    if (index % 3 === 1) {
        const island = cylinder(ocean, M.oceanIslandDry, 42, 0.75, 122, 0.85, -84, 'y', 14);
        island.scale.z = 0.62;
        const green = cylinder(ocean, M.oceanIslandGreen, 34, 0.68, 122, 1.22, -84, 'y', 14);
        green.scale.z = 0.54;
        box(ocean, M.pier, 5.5, 0.9, 45, 122, 1.5, -43);
        buildPitchedHouse(ocean, M, 112, -88, 13, 10, 4.5, 0.2, M.houseRoofA, 0.5);
        for (const x of [98, 132, 145]) {
            cylinder(ocean, M.treeTrunk, 1.1, 7, x, 4.7, -79, 'y', 7);
            cylinder(ocean, M.palmLeaf, 7.2, 0.8, x, 8.3, -79, 'y', 8);
        }
        buildRiverBoat(ocean, M, 134, -47, 0.08, 0.72);
    }
    if (index % 3 === 2) {
        const island = cylinder(ocean, M.oceanIslandDry, 36, 0.7, -138, 0.85, 62, 'y', 13);
        island.scale.z = 0.64;
        const green = cylinder(ocean, M.oceanIslandGreen, 29, 0.64, -138, 1.18, 62, 'y', 13);
        green.scale.z = 0.56;
        box(ocean, M.pier, 5.2, 0.9, 38, -138, 1.45, 105);
        buildPitchedHouse(ocean, M, -148, 58, 12, 9, 4.2, -0.12, M.houseRoofB, 0.5);
        for (const z of [48, 66, 78]) {
            cylinder(ocean, M.treeTrunk, 1, 6.5, -124, 4.4, z, 'y', 7);
            cylinder(ocean, M.palmLeaf, 6.8, 0.75, -124, 7.8, z, 'y', 8);
        }
    }

    // --- Kalimantan: rimba tropis, kebun sawit teratur, dan permukiman sungai. ---
    const kalimantan = new THREE.Group(); group.add(kalimantan); biomes.kalimantan = kalimantan;
    box(kalimantan, M.kalimantan, TERRAIN_WIDTH, 1.2, TILE_LENGTH + 3, 0, 0, 0);
    const kalimantanBuilders = [buildKalimantanRainforest,
        buildKalimantanPalmPlantation, buildKalimantanHousing];
    const kalimantanLandscape = kalimantanBuilders[index % kalimantanBuilders.length](
        kalimantan, M, index);
    kalimantan.userData.landscape = kalimantanLandscape;

    ocean.visible = false;
    kalimantan.visible = false;
    optimizeStaticScenery(group);
    const renderCensus = {};
    for (const [name, layer] of Object.entries(biomes))
        renderCensus[name] = sceneryRenderCensus(layer);
    return { group, biomes, index,
        landscapes: { java: javaLandscape, kalimantan: kalimantanLandscape },
        renderCensus };
}

// Setel garis pantai sebuah tile pantai ke offset lokal tertentu, lalu
// panjangkan pelat daratan sampai tepi tile pada sisinya. Dipanggil HANYA saat
// tile sedang di luar layar, jadi tak pernah terlihat berubah.
export function setCoastShoreline(coastGroup, shoreLocal) {
    const c = coastGroup.userData.coast;
    const edge = c.side * (TILE_LENGTH * 0.5 + 40);
    const landLength = Math.max(2, Math.abs(edge - shoreLocal));
    const landCenter = (edge + shoreLocal) * 0.5;
    c.land.scale.z = landLength;
    c.land.position.z = landCenter;
    c.shallow.position.z = shoreLocal - c.side * 20;
    c.surfBands.forEach((band, i) => {
        band.position.z = shoreLocal - c.side * (7 + i * 10);
    });
    c.wet.position.z = shoreLocal + c.side * 5;
    c.sand.position.z = shoreLocal + c.side * 22;
    c.jetty.position.z = shoreLocal - c.side * 34;
    for (const detail of c.shoreDetails)
        detail.position.z = shoreLocal + detail.userData.shoreOffset;
    for (const item of c.inland) {
        const z = shoreLocal + c.side * item.userData.inland;
        item.position.z = z;
        item.visible = Math.abs(z - shoreLocal) < landLength;
    }
    return { shoreLocal, landLength, landOnPlusZ: c.side > 0 };
}

function buildCloud(parent, M, index) {
    const group = new THREE.Group(); parent.add(group);
    const litPuffs = [], shadePuffs = [];
    for (let i = 0; i < 4; i++) {
        (i === 3 ? shadePuffs : litPuffs).push({
            x: (i - 1.5) * 8, y: (i % 2) * 1.5, z: ((i * 7) % 3) * 4,
            sx: 12 + (index % 3) * 2, sy: 2.4 + (i % 2),
            sz: 7 + ((i + index) % 3),
        });
    }
    const lit = instanceBatch(group, new THREE.SphereGeometry(1, 9, 6), M.cloud, litPuffs);
    const shade = instanceBatch(group, new THREE.SphereGeometry(1, 9, 6), M.cloudShade, shadePuffs);
    lit.castShadow = shade.castShadow = false;
    lit.receiveShadow = shade.receiveShadow = false;
    return { group, index, drift: 2.5 + (index % 5), phase: index * 0.73 };
}

// ---------------------------------------------------------------- enemies ---

function buildAircraftVariant(parent, M, type) {
    const g = new THREE.Group(); parent.add(g);
    const profile = type === 'airC'
        ? { span: 27, length: 27, bodyW: 4.6, bodyH: 2.5, engines: [0],
            sweep: 0.28, wingChord: 6.2, silhouette: 'needle-interceptor' }
        : type === 'airB'
            ? { span: 32, length: 30, bodyW: 5.8, bodyH: 3.1, engines: [-4.1, 4.1],
                sweep: 0.2, wingChord: 7.6, silhouette: 'twin-engine-strike-fighter' }
            : { span: 37, length: 33, bodyW: 7.2, bodyH: 3.8, engines: [-5.2, 5.2],
                sweep: 0.34, wingChord: 9.2, silhouette: 'armored-missile-interceptor' };
    g.name = `stage10-${profile.silhouette}`;
    g.userData.baseSpan = profile.span;
    const mat = type === 'airC' ? M.airC : type === 'airB' ? M.airB : M.airA;
    const core = new THREE.Group(); g.add(core);
    const breakaways = [];
    const controls = [];
    const engines = [];
    const turnVapors = [];

    // Badan berlapis dan bersegi agar terbaca sebagai airframe, bukan balok.
    box(core, M.airArmor, profile.bodyW * 0.78, profile.bodyH * 0.72,
        profile.length * 0.72, 0, -0.45, -1.1);
    box(core, mat, profile.bodyW, profile.bodyH, profile.length * 0.58,
        0, 0.2, 0.5);
    const spine = box(core, M.airPanel, profile.bodyW * 0.5, 0.62,
        profile.length * 0.52, 0, profile.bodyH * 0.56, -1.1);
    spine.rotation.y = type === 'airC' ? 0 : 0.025;
    const nose = mesh(core, new THREE.ConeGeometry(profile.bodyW * 0.54,
        profile.length * 0.32, 6), mat, 0, 0.15, profile.length * 0.43);
    // ConeGeometry meruncing ke local +Y; +90 derajat menghadap local +Z.
    nose.rotation.x = Math.PI * 0.5;
    box(core, M.glass, profile.bodyW * 0.72, profile.bodyH * 0.58,
        profile.length * 0.2, 0, profile.bodyH * 0.68, profile.length * 0.19);
    for (const side of [-1, 1]) {
        const intake = box(core, M.airEngine, profile.bodyW * 0.34,
            profile.bodyH * 0.48, profile.length * 0.25,
            side * profile.bodyW * 0.55, -0.05, -profile.length * 0.02);
        intake.rotation.y = side * 0.045;
    }

    // Sayap cranked-swept dua ruas, elevon, tip rail, dan lampu navigasi.
    for (const side of [-1, 1]) {
        const wing = new THREE.Group();
        wing.position.set(side * profile.bodyW * 0.42, 0.05, -1.2);
        core.add(wing);
        const inner = box(wing, mat, profile.span * 0.31, 0.78,
            profile.wingChord, side * profile.span * 0.155, 0, 0);
        inner.rotation.y = side * profile.sweep;
        const outer = box(wing, mat, profile.span * 0.19, 0.58,
            profile.wingChord * 0.58, side * profile.span * 0.39, -0.04,
            -profile.wingChord * 0.37);
        outer.rotation.y = side * (profile.sweep + 0.18);
        const elevon = box(wing, M.airArmor, profile.span * 0.18, 0.34,
            1.45, side * profile.span * 0.27, 0.45, -profile.wingChord * 0.58);
        elevon.rotation.y = side * profile.sweep;
        controls.push(elevon);
        cylinder(wing, M.airEngine, 0.28, 5.7, side * profile.span * 0.46,
            -0.15, 0.2, 'z', 7);
        const nav = mesh(wing, new THREE.SphereGeometry(0.42, 7, 5),
            side < 0 ? M.airStripe : M.airFan,
            side * profile.span * 0.49, 0.35, -0.6);
        nav.castShadow = false; nav.receiveShadow = false;
        const vapor = cylinder(wing, M.airVapor, 0.24, 13.5,
            side * profile.span * 0.49, 0.12, -7.2, 'z', 7);
        vapor.visible = false; vapor.castShadow = false; vapor.receiveShadow = false;
        turnVapors.push(vapor);
        breakaways.push(wing);
    }

    // Ekor bercabang memberi siluet agresif dari kamera vertikal.
    for (const side of [-1, 1]) {
        const tail = new THREE.Group();
        tail.position.set(side * profile.bodyW * 0.42, 0.5, -profile.length * 0.33);
        core.add(tail);
        const fin = box(tail, mat, type === 'airC' ? 0.58 : 0.72,
            type === 'airA' ? 4.8 : 3.8, 5.8, side * 1.1, 1.6, 0);
        fin.rotation.z = -side * (type === 'airA' ? 0.2 : 0.12);
        const stab = box(tail, M.airArmor, profile.span * 0.19, 0.42,
            3.1, side * profile.span * 0.095, 0, -0.5);
        stab.rotation.y = side * 0.2;
        breakaways.push(tail);
    }

    // Fan duct, nacelle dan plume biru dianimasikan per frame.
    for (const x of profile.engines) {
        const pod = new THREE.Group();
        pod.position.set(x, -0.65, -profile.length * 0.17); core.add(pod);
        cylinder(pod, M.airEngine, type === 'airC' ? 1.45 : 1.7,
            type === 'airA' ? 10.5 : 8.8, 0, 0, 0, 'z', 12);
        const fan = cylinder(pod, M.airFan, type === 'airC' ? 0.92 : 1.08,
            0.55, 0, 0, 4.45, 'z', 10);
        const exhaust = cylinder(pod, M.airExhaust, type === 'airC' ? 0.78 : 0.94,
            type === 'airA' ? 5.6 : 4.6, 0, 0,
            type === 'airA' ? -7.8 : -6.6, 'z', 9);
        exhaust.castShadow = false; exhaust.receiveShadow = false;
        engines.push({ pod, fan, exhaust });
    }

    // C = twin nose gun, B = gun-pod berat, A = enam hardpoint rudal.
    const hardpoints = [];
    if (type === 'airC') {
        for (const x of [-1.35, 1.35]) hardpoints.push(cylinder(core, M.airEngine,
            0.28, 6.2, x, -0.2, profile.length * 0.34, 'z', 8));
    } else {
        for (const side of [-1, 1]) hardpoints.push(cylinder(core, M.airArmor,
            type === 'airA' ? 0.72 : 0.62, type === 'airA' ? 8.4 : 7.2,
            side * profile.span * 0.29, -0.75, 0.7, 'z', 9));
    }
    if (type === 'airA') {
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
            hardpoints.push(cylinder(core, M.missile, 0.42, 5.8,
                side * (8.2 + i * 2.1), -0.95, 1.1 - i * 1.2, 'z', 8));
        box(core, M.airStripe, profile.span * 0.63, 0.3, 1.15,
            0, 0.85, -profile.wingChord * 0.65);
    } else {
        for (const side of [-1, 1]) box(core, M.airStripe,
            profile.span * 0.13, 0.28, 1.05, side * profile.span * 0.24,
            0.72, -profile.wingChord * 0.52);
    }

    const remember = part => ({ part, x: part.position.x, y: part.position.y,
        z: part.position.z, rx: part.rotation.x, ry: part.rotation.y, rz: part.rotation.z });
    g.userData.rig = {
        type, silhouette: profile.silhouette, core, engines, controls, hardpoints,
        breakaways: breakaways.map(remember), turnVapors, meshCount: 0,
    };
    g.traverse(o => { if (o.isMesh) g.userData.rig.meshCount++; });
    return g;
}

function buildDestructionFx(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const fires = [];
    for (let i = 0; i < 3; i++) {
        const fire = mesh(group, new THREE.SphereGeometry(1, 8, 6),
            i === 0 ? M.flash : M.airFire, 0, 0, -i * 2.6);
        fire.castShadow = false; fire.receiveShadow = false; fires.push(fire);
    }
    const smoke = [];
    for (let i = 0; i < 7; i++) {
        const puff = mesh(group, new THREE.SphereGeometry(1, 8, 6), M.smoke,
            0, 0, -4 - i * 3.4);
        puff.castShadow = false; puff.receiveShadow = false; smoke.push(puff);
    }
    const sparks = [];
    for (let i = 0; i < 10; i++) {
        const spark = box(group, M.airSpark, 0.28, 0.22, 2.2, 0, 0, 0);
        spark.castShadow = false; spark.receiveShadow = false; sparks.push(spark);
    }
    return { group, fires, smoke, sparks };
}

function buildShipVariant(parent, M, type) {
    const g = new THREE.Group(); parent.add(g);
    const long = type === 'shipA' ? 27 : 23;
    const beam = type === 'shipA' ? 10 : 8.5;
    const heavy = type === 'shipA';
    g.name = heavy ? 'stage10-missile-destroyer' : 'stage10-patrol-corvette';
    g.userData.baseRadius = long * 0.42;
    // Keel gelap, hull bertingkat, armor belt dan deck inset memberi siluet
    // kapal perang yang terbaca dari atas, bukan satu balok panjang.
    box(g, M.shipHullDark, beam * 0.82, 1.25, long * 0.96, 0, 0.7, -0.2);
    box(g, M.ship, beam, 2.1, long, 0, 1.65, 0);
    box(g, M.shipHullDark, beam * 1.04, 0.55, long * 0.6, 0, 1.3, -long * 0.17);
    box(g, M.shipDeck, beam * 0.82, 0.42, long * 0.78, 0, 2.92, -long * 0.07);
    for (const side of [-1, 1]) box(g, M.shipTrim, 0.24, 0.48,
        long * 0.7, side * beam * 0.5, 2.0, -long * 0.08);
    const bow = mesh(g, new THREE.ConeGeometry(beam * 0.5, 8, 4), M.ship,
        0, 1.65, long * 0.5 + 3.3);
    // Kapal melaju dengan local +Z sebagai arah depan. ConeGeometry meruncing
    // ke local +Y, jadi +90° menaruh UJUNG di haluan; -90° membaliknya ke buritan.
    bow.rotation.x = Math.PI * 0.5;
    bow.name = `stage10-${type}-bow`;
    // Superstructure berundak dengan bridge panorama dan aft operations room.
    box(g, M.shipDeck, beam * 0.66, 2.1, heavy ? 8.8 : 7.2,
        0, 4.0, -long * 0.12);
    box(g, M.ship, beam * 0.52, 1.8, heavy ? 6.5 : 5.4,
        0, 5.75, -long * 0.1);
    box(g, M.shipGlass, beam * 0.48, 0.78, 1.05,
        0, 6.25, -long * 0.1 + (heavy ? 3.25 : 2.7));
    for (const side of [-1, 1]) box(g, M.shipGlass, 0.35, 0.72, 2.8,
        side * beam * 0.27, 6.15, -long * 0.1 + 0.4);
    box(g, M.shipHullDark, beam * 0.5, 1.5, 4.1, 0, 4.15, -long * 0.39);

    const mainTurret = new THREE.Group();
    mainTurret.position.set(0, 3.35, long * 0.28); g.add(mainTurret);
    cylinder(mainTurret, M.shipHullDark, heavy ? 2.25 : 1.8,
        0.7, 0, 0.35, 0, 'y', 12);
    box(mainTurret, M.ship, heavy ? 4.4 : 3.6, 1.7,
        heavy ? 4.7 : 3.8, 0, 1.25, 0);
    const gunMount = new THREE.Group(); gunMount.position.set(0, 1.45, 1.25);
    mainTurret.add(gunMount);
    const gunMuzzles = [], muzzleFlashes = [];
    const gunXs = heavy ? [-0.72, 0.72] : [0];
    for (const x of gunXs) {
        cylinder(gunMount, M.dark, 0.26, heavy ? 7.2 : 6.3,
            x, 0, heavy ? 4.2 : 3.75, 'z', 8);
        const muzzle = new THREE.Object3D();
        muzzle.position.set(x, 0, heavy ? 7.9 : 7.0); gunMount.add(muzzle);
        gunMuzzles.push(muzzle);
        const flash = mesh(gunMount, new THREE.SphereGeometry(1, 8, 6), M.flash,
            x, 0, heavy ? 8.2 : 7.3);
        flash.visible = false; flash.castShadow = false; flash.receiveShadow = false;
        muzzleFlashes.push(flash);
    }
    box(mainTurret, M.shipTrim, heavy ? 4.6 : 3.8, 0.28, 0.65,
        0, 2.1, -1.55);

    // Mast sensor bertingkat dengan radar bar independen.
    const mast = new THREE.Group(); mast.position.set(0, 6.5, -long * 0.13); g.add(mast);
    cylinder(mast, M.dark, 0.38, heavy ? 5.4 : 4.5, 0, 2.3, 0, 'y', 8);
    box(mast, M.shipHullDark, 3.3, 0.35, 0.55, 0, 1.45, 0);
    box(mast, M.shipGlass, 1.35, 1.05, 1.35, 0, 2.8, 0);
    const radar = new THREE.Group(); radar.position.y = heavy ? 5.2 : 4.35; mast.add(radar);
    box(radar, M.shipTrim, heavy ? 5.8 : 4.5, 0.28, 0.5, 0, 0, 0);
    cylinder(radar, M.dark, 0.22, 1.1, 0, -0.55, 0, 'y', 7);

    const turrets = [mainTurret];
    const ciws = new THREE.Group(); ciws.position.set(0, 3.5, -long * 0.34); g.add(ciws);
    cylinder(ciws, M.shipHullDark, 1.2, 0.6, 0, 0.3, 0, 'y', 10);
    box(ciws, M.ship, 1.8, 1.3, 1.8, 0, 1.1, 0);
    for (const x of [-0.34, 0.34]) cylinder(ciws, M.dark, 0.13,
        3.1, x, 1.15, 2.1, 'z', 7);
    turrets.push(ciws);

    const missileMuzzles = [], launchers = [], vlsCells = [];
    if (heavy) {
        // Destroyer A: dua pod rudal miring dan delapan sel VLS jelas terlihat.
        for (const side of [-1, 1]) {
            const launcher = new THREE.Group();
            launcher.position.set(side * 3.15, 4.0, -0.4); g.add(launcher);
            for (let i = 0; i < 2; i++) cylinder(launcher, M.missile,
                0.42, 5.4, 0, i * 0.9, 1.1 - i * 0.5, 'z', 8);
            launcher.rotation.x = -0.16;
            const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.45, 4.2);
            launcher.add(muzzle); missileMuzzles.push(muzzle); launchers.push(launcher);
        }
        for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
            const cell = box(g, M.shipHullDark, 1.15, 0.32, 1.35,
                (col - 1.5) * 1.38, 3.35, -4.2 - row * 1.55);
            box(g, M.shipTrim, 0.65, 0.12, 0.78,
                cell.position.x, 3.55, cell.position.z);
            vlsCells.push(cell);
        }
    } else {
        // Korvet B: torpedo canister dan dua life-raft pod memperkaya sisi deck.
        for (const side of [-1, 1]) {
            for (let i = 0; i < 2; i++) cylinder(g, M.shipHullDark,
                0.42, 3.8, side * 3.15, 3.7 + i * 0.58, -1.2, 'z', 8);
            cylinder(g, M.shipTrim, 0.65, 1.6, side * 3.45,
                4.2, -5.7, 'z', 9);
        }
    }

    // Wake ganda berada di buritan dan hanya dianimasikan lewat transform.
    const wakes = [];
    for (const side of [-1, 1]) {
        const wake = box(g, M.shipWake, beam * 0.26, 0.08, long * 0.72,
            side * beam * 0.27, 0.02, -long * 0.72);
        wake.castShadow = false; wake.receiveShadow = false; wakes.push(wake);
    }
    const breakaways = [mainTurret, mast, ciws, ...launchers]
        .map(destructionPose);
    const rig = { type, silhouette: heavy ? 'guided-missile-destroyer' : 'armed-patrol-corvette',
        mainTurret, gunMount, gunMuzzles, muzzleFlashes, turrets, mast, radar,
        missileMuzzles, launchers, vlsCells, ciws, wakes, breakaways,
        recoilBaseZ: gunMount.position.z, meshCount: 0 };
    g.traverse(o => { if (o.isMesh) rig.meshCount++; });
    g.userData.shipRig = rig;
    return g;
}

function buildEnemySlot(parent, M, index, targetAircraftSpan, surfaceScale,
    surfaceCeiling, family) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const variants = {};
    const hitRadius = {};
    if (family === 'air') {
        for (const type of AIR_TYPES) {
            const model = buildAircraftVariant(group, M, type);
            model.scale.setScalar(targetAircraftSpan / model.userData.baseSpan);
            model.userData.visualSpan = targetAircraftSpan;
            variants[type] = model;
        }
    } else {
        // Kapal permukaan berdiri di air (y~1) dan menderita masalah keterbacaan
        // yang sama dengan instalasi darat, jadi ia memakai skala yang sama dan
        // radius kenanya juga diturunkan dari gambarnya.
        for (const type of SHIP_TYPES) {
            const model = buildShipVariant(group, M, type);
            // Tapak penuh (radius kena diturunkan darinya), tinggi dijepit.
            model.userData.fittedTop = fitSurfaceProp(model, surfaceScale, surfaceCeiling);
            hitRadius[type] = model.userData.baseRadius * surfaceScale;
            variants[type] = model;
        }
    }
    const damageFx = buildDestructionFx(group, M);
    for (const v of Object.values(variants)) v.visible = false;
    return { group, variants, damageFx, hitRadius, family, index,
        active: false, destroying: false };
}

// ---------------------------------------------- instalasi darat (referensi) ---
// Turret AA, tank, bunker dan depot bahan bakar berdiri di medan yang menggulung
// naik ke arah player — persis peran "kotak hijau di halaman kastil" pada gambar
// referensi. Semua varian ada di satu slot pool agar tidak ada mesh lahir runtime.

function buildTurretModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.name = 'stage10-twin-aa-cannon';
    g.userData.baseRadius = 11;

    // Dudukan silang dengan empat hydraulic stabilizer membuat meriam terasa
    // benar-benar ditanam di tanah, bukan sekadar kubus di atas lingkaran.
    cylinder(g, M.groundArmorDark, 8.6, 1.3, 0, 0.7, 0, 'y', 14);
    cylinder(g, M.groundArmor, 6.8, 1.6, 0, 1.65, 0, 'y', 14);
    const stabilizers = [];
    for (const [x, z, sx, sz] of [[-8.5, 0, 9, 2], [8.5, 0, 9, 2],
        [0, -8.5, 2, 9], [0, 8.5, 2, 9]]) {
        const arm = box(g, M.groundArmorDark, sx, 0.75, sz, x, 0.65, z);
        const foot = cylinder(g, M.slab, 1.55, 0.7, x * 1.38, 0.35,
            z * 1.38, 'y', 10);
        stabilizers.push({ arm, foot });
    }
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 0.25;
        cylinder(g, M.groundTrim, 0.32, 1.8, Math.sin(a) * 6.7, 2.6,
            Math.cos(a) * 6.7, 'y', 7);
    }

    const traverse = new THREE.Group(); g.add(traverse); traverse.position.y = 2.45;
    cylinder(traverse, M.groundArmorDark, 5.7, 1.15, 0, 0.55, 0, 'y', 14);
    box(traverse, M.groundArmor, 9.6, 3.4, 7.6, 0, 2.5, -0.15);
    for (const side of [-1, 1]) {
        const cheek = box(traverse, M.groundArmorDark, 2.1, 3.9, 8.5,
            side * 4.25, 2.6, -0.35);
        cheek.rotation.z = -side * 0.08;
        box(traverse, M.groundTrim, 0.38, 2.7, 5.8, side * 5.15, 2.7, -0.4);
    }
    box(traverse, M.groundArmorDark, 6.2, 1.2, 4.4, 0, 4.6, -1.1);

    const elevation = new THREE.Group();
    elevation.position.set(0, 3.3, 1.4); traverse.add(elevation);
    const barrels = [], muzzles = [], muzzleFlashes = [];
    for (const side of [-1, 1]) {
        cylinder(elevation, M.groundArmorDark, 0.78, 4.4,
            side * 2.05, 0, 1.5, 'z', 10);
        const barrel = cylinder(elevation, M.airArmor, 0.42, 13.5,
            side * 2.05, 0, 9.6, 'z', 10);
        cylinder(elevation, M.groundTrim, 0.62, 1.7,
            side * 2.05, 0, 16.25, 'z', 10);
        const muzzle = new THREE.Object3D(); muzzle.position.set(side * 2.05, 0, 17.2);
        elevation.add(muzzle); muzzles.push(muzzle); barrels.push(barrel);
        const flash = mesh(elevation, new THREE.SphereGeometry(1, 8, 6), M.flash,
            side * 2.05, 0, 17.5);
        flash.visible = false; flash.castShadow = false; flash.receiveShadow = false;
        muzzleFlashes.push(flash);
    }
    // Radar belakang berputar independen dari traverse; optic depan mengikuti
    // sasaran sebagai telegraph sebelum bola plasma dilepas.
    const radar = new THREE.Group(); radar.position.set(0, 5.5, -3.2); traverse.add(radar);
    cylinder(radar, M.groundArmorDark, 0.5, 3.6, 0, 1.6, 0, 'y', 8);
    const dish = mesh(radar, new THREE.CylinderGeometry(0.45, 2.65, 0.75, 12),
        M.groundArmor, 0, 3.1, 0);
    dish.rotation.x = 0.72;
    box(traverse, M.groundOptic, 2.2, 1.35, 1.1, 0, 4.7, 3.45);
    for (const x of [-3.05, 3.05]) box(traverse, M.groundArmorDark,
        2.1, 2.7, 3.8, x, 2.3, -5.2);

    const rig = { kind: 'turret', silhouette: 'stabilized-twin-aa', traverse,
        elevation, barrels, muzzles, muzzleFlashes, radar, stabilizers,
        wheels: [], recoilBaseZ: elevation.position.z, meshCount: 0 };
    g.traverse(o => { if (o.isMesh) rig.meshCount++; });
    g.userData.turret = traverse; g.userData.groundRig = rig;
    g.userData.destructionRig = {
        kind: 'turret', breakaways: [traverse,
            stabilizers[0].arm, stabilizers[2].arm].map(destructionPose),
    };
    return g;
}

function buildTankModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.name = 'stage10-main-battle-tank';
    g.userData.baseRadius = 10.5;
    const wheels = [];
    for (const side of [-1, 1]) {
        box(g, M.track, 2.75, 2.5, 20.5, side * 5.55, 1.8, 0);
        box(g, M.groundArmorDark, 0.55, 1.35, 19.2, side * 7.0, 2.75, 0);
        for (let i = 0; i < 5; i++) {
            const wheel = cylinder(g, i === 0 || i === 4 ? M.groundTrim : M.slab,
                i === 0 || i === 4 ? 1.45 : 1.25, 0.7,
                side * 7.05, 1.55, -7.6 + i * 3.8, 'x', 12);
            wheels.push(wheel);
        }
    }
    // Lower hull, sloped glacis, deck, side skirt dan detail mesin belakang.
    box(g, M.groundArmorDark, 10.2, 2.2, 18.2, 0, 2.1, -0.1);
    const hull = box(g, M.groundArmor, 10.8, 2.8, 15.4, 0, 3.7, 0.2);
    hull.rotation.x = -0.035;
    const glacis = box(g, M.groundArmor, 9.8, 1.15, 5.2, 0, 5.15, 6.7);
    glacis.rotation.x = -0.16;
    box(g, M.groundArmorDark, 8.8, 0.65, 5.2, 0, 5.35, -6.1);
    for (const x of [-2.5, 0, 2.5]) box(g, M.dark, 1.6, 0.3, 4.5,
        x, 5.75, -6.15);
    for (const x of [-4.15, 4.15]) cylinder(g, M.dark, 0.48, 3.8,
        x, 6.1, -6.3, 'y', 8);
    for (const side of [-1, 1]) {
        box(g, M.groundTrim, 1.15, 0.38, 3.2, side * 4.25, 5.45, 5.1);
        box(g, M.groundArmorDark, 1.6, 1.4, 3.6, side * 4.35, 5.0, -3.5);
    }

    const traverse = new THREE.Group(); g.add(traverse); traverse.position.set(0, 5.55, -0.45);
    cylinder(traverse, M.groundArmorDark, 3.7, 0.8, 0, 0.4, 0, 'y', 12);
    box(traverse, M.groundArmor, 7.8, 2.8, 7.5, 0, 1.7, 0);
    const turretNose = box(traverse, M.groundArmor, 6.4, 2.2, 4.6, 0, 1.6, 4.2);
    turretNose.rotation.x = -0.08;
    for (const side of [-1, 1]) {
        const cheek = box(traverse, M.groundArmorDark, 1.45, 2.4, 6.5,
            side * 4.15, 1.55, 0.2);
        cheek.rotation.z = -side * 0.07;
    }
    const elevation = new THREE.Group();
    elevation.position.set(0, 1.75, 3.55); traverse.add(elevation);
    cylinder(elevation, M.groundArmorDark, 1.25, 2.5, 0, 0, 0, 'z', 12);
    const barrel = cylinder(elevation, M.airArmor, 0.56, 13.8,
        0, 0, 8.05, 'z', 12);
    cylinder(elevation, M.groundTrim, 0.83, 2.1, 0, 0, 14.65, 'z', 10);
    box(elevation, M.airArmor, 2.25, 0.8, 1.7, 0, 0, 15.65);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 16.8); elevation.add(muzzle);
    const muzzleFlash = mesh(elevation, new THREE.SphereGeometry(1, 8, 6), M.flash,
        0, 0, 17.1);
    muzzleFlash.visible = false; muzzleFlash.castShadow = false; muzzleFlash.receiveShadow = false;
    cylinder(traverse, M.groundArmorDark, 1.55, 0.85, -1.85, 3.45, -0.9, 'y', 10);
    box(traverse, M.groundArmor, 2.7, 0.48, 2.3, -1.85, 3.9, -0.9).rotation.z = 0.16;
    cylinder(traverse, M.groundOptic, 0.62, 1.5, 2.2, 3.2, 1.1, 'y', 9);
    cylinder(traverse, M.dark, 0.13, 5.6, 2.9, 5.8, -1.8, 'y', 6);
    box(traverse, M.groundTrim, 5.9, 0.35, 0.8, 0, 3.0, -3.5);

    const rig = { kind: 'tank', silhouette: 'tracked-main-battle-tank', traverse,
        elevation, barrels: [barrel], muzzles: [muzzle], muzzleFlashes: [muzzleFlash],
        radar: null, stabilizers: [], wheels, recoilBaseZ: elevation.position.z,
        meshCount: 0 };
    g.traverse(o => { if (o.isMesh) rig.meshCount++; });
    g.userData.turret = traverse; g.userData.groundRig = rig;
    g.userData.destructionRig = {
        kind: 'tank', breakaways: [traverse, wheels[0], wheels[4],
            wheels[5], wheels[9]].map(destructionPose),
    };
    return g;
}

function buildBunkerModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.userData.baseRadius = 11;
    box(g, M.slab, 22, 5.5, 16, 0, 2.8, 0);
    const firingSlit = box(g, M.dark, 18, 1.6, 2.2, 0, 4.4, 7.4);
    const roof = box(g, M.slab, 14, 2.2, 11, 0, 6.6, 0);
    const vents = [];
    for (const x of [-8, 8]) vents.push(cylinder(g, M.dark,
        1.5, 3.4, x, 7.6, -4, 'y', 8));
    g.userData.turret = null;
    g.userData.destructionRig = {
        kind: 'bunker', breakaways: [roof, firingSlit, ...vents].map(destructionPose),
    };
    return g;
}

function buildDepotModel(parent, M) {
    const g = new THREE.Group(); parent.add(g);
    g.userData.baseRadius = 12;
    box(g, M.slab, 30, 0.7, 26, 0, 1.2, 0);
    const tanks = [];
    for (let i = 0; i < 4; i++) {
        const tank = new THREE.Group();
        tank.position.set(-9 + (i % 2) * 18, 0, -7 + Math.floor(i / 2) * 14);
        g.add(tank);
        cylinder(tank, M.wall, 5, 9, 0, 5.2, 0, 'y', 12);
        box(tank, M.bossTrim, 10.4, 0.7, 0.7, 0, 7.4, 0);
        tanks.push(tank);
    }
    box(g, M.wall, 12, 6, 9, 0, 4.2, 12);
    const roof = box(g, M.roof, 13.5, 1, 10.5, 0, 7.5, 12);
    g.userData.turret = null;
    g.userData.destructionRig = {
        kind: 'depot', breakaways: [...tanks, roof].map(destructionPose),
    };
    return g;
}

const GROUND_BUILDERS = {
    turret: buildTurretModel, tank: buildTankModel,
    bunker: buildBunkerModel, depot: buildDepotModel,
};

// Satu slot darat = SATU jenis instalasi. Jenisnya dibagi rata di seluruh pool
// (lihat GROUND_KINDS), jadi tiap slot hanya membawa siluet yang benar-benar
// bisa ia tampilkan alih-alih keempat-empatnya.
function buildGroundSlot(parent, M, index, visualScale, ceiling, kind) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const model = GROUND_BUILDERS[kind](group, M);
    // Instalasi darat berdiri di y=0 sementara semuanya bertempur di ketinggian,
    // jadi TAPAK-nya dinaikkan (dan LINGKARAN KENA ikut dari sana), sementara
    // tingginya dijepit agar tak pernah menyentuh jalur terbang.
    model.userData.fittedTop = fitSurfaceProp(model, visualScale, ceiling);
    model.visible = false;
    const variants = { [kind]: model };
    const hitRadius = { [kind]: model.userData.baseRadius * visualScale };
    const damageFx = buildDestructionFx(group, M);
    return { group, variants, damageFx, hitRadius, kind, index,
        active: false, destroying: false };
}

// -------------------------------------------------------------------- boss ---
// Bomber komando: badan besar, empat mesin, tiga pod turret yang terlihat, dan
// strip bahaya. Satu rig saja — dibangun sekali, disembunyikan sampai fase boss.

function buildBoss(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const rig = new THREE.Group(); group.add(rig);
    box(rig, M.boss, 20, 7, 78, 0, 0, 0);
    const nose = mesh(rig, new THREE.ConeGeometry(10, 26, 6), M.boss, 0, 0, 50);
    nose.rotation.x = Math.PI * 0.5;
    nose.name = 'stage10-boss-bow';
    box(rig, M.glass, 11, 3.4, 12, 0, 3.2, 30);
    const wing = box(rig, M.boss, 132, 2.6, 26, 0, 0.4, -4);
    wing.rotation.y = 0.03;
    box(rig, M.bossTrim, 132, 0.6, 3.2, 0, 1.9, -14);
    box(rig, M.boss, 62, 2.2, 15, 0, 1.4, -34);
    for (const x of [-14, 14]) box(rig, M.boss, 9, 9, 16, x, 3, -28);
    const engines = [];
    for (const x of [-46, -24, 24, 46]) {
        const nacelle = cylinder(rig, M.dark, 5.2, 22, x, -1.4, -2, 'z', 12);
        const fan = cylinder(rig, M.bossGlow, 3.9, 1.1, x, -1.4, 8.6, 'z', 10);
        engines.push({ nacelle, fan });
    }
    const turrets = [];
    for (const [x, z] of [[-22, 16], [22, 16], [0, -30]]) {
        const t = new THREE.Group(); rig.add(t); t.position.set(x, 4.4, z);
        box(t, M.ship, 7.5, 4, 7.5, 0, 0, 0);
        cylinder(t, M.dark, 0.9, 13, -1.6, 0.4, 6.5, 'z', 8);
        cylinder(t, M.dark, 0.9, 13, 1.6, 0.4, 6.5, 'z', 8);
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.4, 13);
        t.add(muzzle);
        turrets.push({ group: t, muzzle });
    }
    const pods = [];
    for (const x of [-62, 62]) {
        const pod = new THREE.Group(); rig.add(pod); pod.position.set(x, 0, -2);
        box(pod, M.bossTrim, 9, 5, 20, 0, 0, 0);
        box(pod, M.bossGlow, 6.4, 1.2, 6.4, 0, 2.8, 2);
        pods.push(pod);
    }
    group.userData.boss = { rig, nose, engines, turrets, pods, span: 132, length: 104 };
    return group;
}

// ------------------------------------------------------------------ pools ---

function pooledMesh(parent, geometry, material) {
    const m = mesh(parent, geometry, material);
    m.visible = false;
    return { mesh: m, active: false };
}

function buildOrbSlot(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const core = mesh(group, new THREE.SphereGeometry(2.6, 10, 8), M.enemyRound);
    core.castShadow = false; core.receiveShadow = false;
    const halo = flat(group, M.enemyHalo, 5.2, 0, -0.6, 0, 14);
    return { mesh: group, core, halo, active: false };
}

function buildMissileSlot(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const L = MISSILE_LENGTH;
    const r = L * 0.085;
    const bodyLen = L * 0.66;
    const body = cylinder(group, M.missile, r, bodyLen, 0, 0, -L * 0.06, 'z', 10);
    body.castShadow = false;
    const nose = mesh(group, new THREE.ConeGeometry(r, L * 0.24, 8), M.missile,
        0, 0, bodyLen * 0.5 + L * 0.06);
    nose.rotation.x = Math.PI * 0.5;
    nose.name = 'stage10-enemy-homing-missile-nose';
    // Pita bahaya MERAH = penanda "boleh ditembak" yang sama dengan Stage 8.
    for (const z of [L * 0.16, -L * 0.02]) {
        const band = cylinder(group, M.missileFin, r * 1.14, L * 0.07, 0, 0, z, 'z', 10);
        band.castShadow = false;
    }
    for (const a of [0, Math.PI * 0.5]) {
        const fin = box(group, M.missileFin, L * 0.3, r * 0.5, L * 0.17,
            0, 0, -bodyLen * 0.5 + L * 0.03);
        fin.rotation.z = a;
        fin.castShadow = false;
    }
    const flame = cylinder(group, M.fire, r * 0.85, L * 0.2, 0, 0, -L * 0.44, 'z', 8);
    flame.castShadow = false;
    return { mesh: group, nose, active: false };
}

function buildDropSlot(parent, M, dropScale) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const money = new THREE.Group(); group.add(money);
    cylinder(money, M.money, 4, 1.4, 0, 0, 0, 'y', 14);
    box(money, M.dark, 0.8, 1.55, 4.5, 0, 0.1, 0);
    const health = new THREE.Group(); group.add(health);
    box(health, M.health, 9, 1.6, 9, 0, 0, 0);
    box(health, M.healthRed, 2.2, 1.75, 6.2, 0, 0.2, 0);
    box(health, M.healthRed, 6.2, 1.75, 2.2, 0, 0.2, 0);
    // BOMB: drum bersirip.
    const bombPack = new THREE.Group(); group.add(bombPack);
    cylinder(bombPack, M.bombPack, 3.2, 9, 0, 0, 0, 'z', 12);
    const bombNose = mesh(bombPack, new THREE.ConeGeometry(3.2, 5, 10),
        M.bombPack, 0, 0, 6.4);
    bombNose.rotation.x = Math.PI * 0.5;
    bombNose.name = 'stage10-player-bomb-item-nose';
    for (const a of [0, Math.PI * 0.5]) {
        const fin = box(bombPack, M.powerCase, 7, 0.5, 3.4, 0, 0, -4.4);
        fin.rotation.z = a;
    }
    const variants = { money, health, bomb: bombPack };
    // Item ikut terbang bersama pesawat, jadi ukurannya dinaikkan agar terbaca
    // pada kamera yang jauh di atas.
    for (const v of Object.values(variants)) { v.scale.setScalar(dropScale); v.visible = false; }
    return { group, variants, money, health, bombNose, active: false };
}

function buildExplosionSlot(parent, M, index) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const core = mesh(group, new THREE.SphereGeometry(1, 10, 8), M.flash);
    const fire = mesh(group, new THREE.SphereGeometry(1, 10, 8), M.fire);
    const ring = mesh(group, new THREE.RingGeometry(0.55, 1, 24), M.flash);
    ring.rotation.x = -Math.PI * 0.5;
    const debris = [];
    for (let i = 0; i < 8; i++) debris.push(box(group, M.debris,
        1.2 + (i % 3), 0.7 + (i % 2), 2 + ((i + 1) % 3), 0, 0, 0));
    const smoke = [];
    for (let i = 0; i < 4; i++) smoke.push(mesh(group,
        new THREE.SphereGeometry(1, 8, 6), M.smoke));
    return { group, core, fire, ring, debris, smoke, index, active: false };
}

function buildBombFlash(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    const sheet = flat(group, M.bombFlash, 1, 0, 0, 0, 8);
    sheet.scale.setScalar(1400);
    const ring = mesh(group, new THREE.RingGeometry(0.86, 1, 40), M.bombRing);
    ring.rotation.x = -Math.PI * 0.5;
    ring.castShadow = false; ring.receiveShadow = false;
    return { group, sheet, ring, active: false, t: 0 };
}

function buildPlayerImpactFx(parent, M) {
    const group = new THREE.Group(); parent.add(group); group.visible = false;
    group.name = 'stage10-player-impact-fx';
    const flash = mesh(group, new THREE.SphereGeometry(1, 10, 7), M.flash);
    const ring = mesh(group, new THREE.RingGeometry(0.58, 1, 24), M.flash);
    ring.rotation.x = -Math.PI * 0.5;
    const sparks = [];
    for (let i = 0; i < 12; i++) sparks.push(box(group, M.airSpark,
        0.55 + i % 3 * 0.22, 0.42, 2.4 + i % 4 * 0.55, 0, 0, 0));
    const smoke = [];
    for (let i = 0; i < 6; i++) smoke.push(mesh(group,
        new THREE.SphereGeometry(1, 7, 5), M.smoke));
    const fire = [];
    for (let i = 0; i < 3; i++) fire.push(mesh(group,
        new THREE.SphereGeometry(1, 8, 6), M.airFire));
    const debris = [];
    for (let i = 0; i < 8; i++) debris.push(box(group, M.debris,
        0.8 + i % 3 * 0.35, 0.5, 1.8 + i % 2 * 0.7, 0, 0, 0));
    group.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
    });
    return { group, flash, ring, sparks, smoke, fire, debris };
}

export function ensureStage10FlightWorld(parent = scene) {
    if (built) return root;
    built = true;
    root = new THREE.Group();
    root.name = STAGE10_FLIGHT_KEY;
    parent.add(root);
    const M = mats();

    const terrainTiles = [];
    for (let i = 0; i < TILE_COUNT; i++) terrainTiles.push(buildTerrainTile(root, M, i));
    // Satu-satunya salinan tiap pantai, dipakai bergantian oleh tile mana pun
    // yang sedang memuat batas biome.
    const coastRigs = {
        coastOut: buildCoastTile(root, M, 0, M.java, M.javaDark, true),
        coastIn: buildCoastTile(root, M, 1, M.kalimantan, M.forest, false),
    };
    for (const rig of Object.values(coastRigs)) rig.visible = false;
    const clouds = [];
    for (let i = 0; i < CLOUD_POOL; i++) clouds.push(buildCloud(root, M, i));

    const playerAircraft = buildArmedHeavyAircraft();
    playerAircraft.name = 'stage10-player-aircraft';
    root.add(playerAircraft);
    const pdata = playerAircraft.userData.transport;
    const authoredAircraft = transportDebug(playerAircraft);
    const F = CFG.campaign.stage10.flight;
    const playerVisualScale = F.playerVisualScale;
    const playerVisualSpan = authoredAircraft.spanUnits * playerVisualScale;
    const playerVisualLength = authoredAircraft.lengthUnits * playerVisualScale;
    const enemyAircraftSpan = playerVisualSpan * F.enemyAircraftScaleRatio;
    playerAircraft.scale.setScalar(playerVisualScale);
    pdata.flightVisual = {
        scale: playerVisualScale,
        span: playerVisualSpan,
        length: playerVisualLength,
        halfSpan: playerVisualSpan * 0.5,
        enemyAircraftSpan,
        enemyAircraftScaleRatio: F.enemyAircraftScaleRatio,
        enemyAircraftHitRadius: enemyAircraftSpan * 0.42,
    };
    for (const gear of pdata.gear) {
        gear.strut.visible = false;
        for (const wheel of gear.wheels) wheel.visible = false;
    }
    pdata.ramp.visible = false;
    pdata.cargoBay.visible = false;
    // Pesawat Stage 10 HANYA bersenjata machine gun (permintaan user 2026-08-28),
    // jadi kedua meriam hidung Stage 9 disembunyikan seperti roda dan ramp kargo.
    for (const cannon of pdata.weapons.noseCannons) cannon.group.visible = false;
    pdata.flightRig = playerAircraft.children[0];

    // Langit-langit prop permukaan DITURUNKAN dari ketinggian terbang, bukan
    // diketik: menaikkan `altitude` otomatis melonggarkannya.
    const surfaceCeiling = flightSurfaceCeiling();
    const airPool = airPoolSize(F), shipPool = shipPoolSize(F);
    const enemies = [];
    for (let i = 0; i < airPool + shipPool; i++)
        enemies.push(buildEnemySlot(root, M, i, enemyAircraftSpan, F.ground.visualScale,
            surfaceCeiling, i < airPool ? 'air' : 'ship'));
    const groundTargets = [];
    for (let i = 0; i < GROUND_POOL; i++)
        groundTargets.push(buildGroundSlot(root, M, i, F.ground.visualScale,
            surfaceCeiling, GROUND_KINDS[i % GROUND_KINDS.length]));
    const boss = buildBoss(root, M);

    const playerRounds = [];
    for (let i = 0; i < PLAYER_ROUND_POOL; i++) {
        const p = pooledMesh(root, new THREE.SphereGeometry(0.7, 6, 5), M.playerRound);
        p.mesh.scale.set(1, 1, 6.5); playerRounds.push(p);
    }
    const enemyRounds = [];
    for (let i = 0; i < ENEMY_ROUND_POOL; i++) enemyRounds.push(buildOrbSlot(root, M));
    const missiles = [];
    for (let i = 0; i < MISSILE_POOL; i++) missiles.push(buildMissileSlot(root, M));
    const dropSlots = [];
    for (let i = 0; i < DROP_POOL; i++) dropSlots.push(buildDropSlot(root, M, F.dropVisualScale));
    const explosions = [];
    for (let i = 0; i < EXPLOSION_POOL; i++) explosions.push(buildExplosionSlot(root, M, i));
    const bombFlash = buildBombFlash(root, M);
    const playerImpactFx = buildPlayerImpactFx(root, M);

    // KOTAK KENA PLAYER ADALAH ELIPS YANG DITURUNKAN DARI SILUET YANG DIGAMBAR
    // (2026-08-29, permintaan user "sedikit besarkan area collision pesawat
    // player ... saat ini peluru musuh harus benar-benar mengenai bagian tengah").
    // Sebuah LINGKARAN tidak bisa mewakili pesawat: badannya 78,5 unit dari
    // hidung ke ekor tapi bentangnya 75,7 unit, dan lingkaran radius 22 hanya
    // menutupi 56% panjang badan — jadi EKOR tidak pernah kena sama sekali,
    // persis yang dilaporkan. Elips memisahkan kedua sumbu: `length` mengikuti
    // badan (sumbu Z, karena rig diputar sehingga hidung menghadap -Z) dan
    // `span` mengikuti sayap (sumbu X).
    //
    // Keduanya PECAHAN dari ukuran yang benar-benar digambar, bukan angka
    // ketikan, jadi kalau `playerVisualScale` diubah kotak kenanya ikut. Lantai
    // `playerRadius` menjamin area kena tidak pernah MENGECIL dari sebelumnya,
    // dan pecahan < 1 menjamin ia tidak pernah melebihi badan pesawat — aturan
    // "yang digambar itulah yang kena" yang sama dipakai rudal dan instalasi darat.
    const playerHit = {
        halfSpan: Math.max(F.playerRadius, playerVisualSpan * 0.5 * F.playerHitSpanFraction),
        halfLength: Math.max(F.playerRadius, playerVisualLength * 0.5 * F.playerHitLengthFraction),
        drawnHalfSpan: playerVisualSpan * 0.5,
        drawnHalfLength: playerVisualLength * 0.5,
    };

    world = {
        playerHit,
        missileVisual: {
            length: MISSILE_LENGTH,
            hitRadius: MISSILE_LENGTH * MISSILE_HIT_FRACTION,
            hitFraction: MISSILE_HIT_FRACTION,
        },
        surfaceVisual: {
            scale: F.ground.visualScale,
            hitRadius: Object.assign({}, ...enemies.map(e => e.hitRadius)),
        },
        groundVisual: {
            scale: F.ground.visualScale,
            hitRadius: Object.assign({}, ...groundTargets.map(g => g.hitRadius)),
        },
        dropVisual: { scale: F.dropVisualScale },
        root, M, terrainTiles, coastRigs, clouds, playerAircraft, enemies, groundTargets, boss,
        playerRounds, enemyRounds, missiles,
        drops: dropSlots, explosions, bombFlash, playerImpactFx,
    };
    root.userData.stage10Flight = world;
    registerCampaignWorldRoot({
        key: STAGE10_FLIGHT_KEY, root, bounds: S10_FLIGHT_BOUNDS,
        lightsKey: STAGE10_FLIGHT_KEY,
        warmupViews: [{ x: S10_FLIGHT_X, y: 0, z: -120,
            offset: { x: 0, y: 210, z: 0 } }],
    });
    return root;
}

// Slot kini terspesialisasi, jadi laporan debug harus mencari slot yang
// benar-benar membawa varian yang ditanyakan — bukan asal slot pertama.
function variantOwner(list, type) { return list.find(s => s.variants[type]); }

// GARIS PANTAI ITU SATU RIG BERSAMA, BUKAN SATU PER TILE (2026-08-29, optimasi).
// Dua batas biome terpisah 6.240 unit sementara jendela enam tile hanya 2.040,
// jadi TIDAK PERNAH ada dua pantai di dalam jendela sekaligus — membangun
// coastOut+coastIn di keenam tile berarti 222 objek per tile (dari 274) yang
// hanya dipakai satu tile pada satu waktu. Rig-nya kini milik root dan
// DIPINDAHKAN ke tile yang sedang memuat batas.
export function ensureStage10CoastRigs(W) { return W.coastRigs; }

export function stage10FlightWorld() {
    ensureStage10FlightWorld();
    return world;
}

export function stage10FlightWorldDebug() {
    const W = stage10FlightWorld();
    const visual = W.playerAircraft.userData.transport.flightVisual;
    const aircraftVariants = {};
    for (const type of ['airC', 'airB', 'airA']) {
        const rig = variantOwner(W.enemies, type).variants[type].userData.rig;
        aircraftVariants[type] = {
            silhouette: rig.silhouette, meshes: rig.meshCount,
            engines: rig.engines.length, breakaways: rig.breakaways.length,
            hardpoints: rig.hardpoints.length, animatedControls: rig.controls.length,
            turnVapors: rig.turnVapors.length,
        };
    }
    const groundWeaponRigs = {};
    for (const type of ['turret', 'tank']) {
        const rig = variantOwner(W.groundTargets, type).variants[type].userData.groundRig;
        groundWeaponRigs[type] = {
            silhouette: rig.silhouette, meshes: rig.meshCount,
            barrels: rig.barrels.length, muzzles: rig.muzzles.length,
            muzzleFlashes: rig.muzzleFlashes.length,
            stabilizers: rig.stabilizers.length, wheels: rig.wheels.length,
            radar: !!rig.radar, tracking: true, elevation: true, recoil: true,
        };
    }
    const shipVariants = {};
    for (const type of ['shipB', 'shipA']) {
        const rig = variantOwner(W.enemies, type).variants[type].userData.shipRig;
        shipVariants[type] = {
            silhouette: rig.silhouette, meshes: rig.meshCount,
            mainGuns: rig.gunMuzzles.length, turrets: rig.turrets.length,
            radar: !!rig.radar, ciws: !!rig.ciws, wakes: rig.wakes.length,
            missileLaunchers: rig.launchers.length,
            missileMuzzles: rig.missileMuzzles.length,
            vlsCells: rig.vlsCells.length, breakaways: rig.breakaways.length,
        };
    }
    const landscapes = {
        java: W.terrainTiles.map(t => ({ tile: t.index, ...t.landscapes.java })),
        kalimantan: W.terrainTiles.map(t => ({ tile: t.index, ...t.landscapes.kalimantan })),
    };
    const terrainLayers = W.terrainTiles.flatMap(t => Object.entries(t.renderCensus)
        .map(([layer, census]) => ({ tile: t.index, layer,
            zone: layer === 'java' ? t.landscapes.java.zone
                : layer === 'kalimantan' ? t.landscapes.kalimantan.zone : layer,
            ...census })));
    const terrainPerformance = {
        layers: terrainLayers,
        shadowCasters: terrainLayers.reduce((n, x) => n + x.shadowCasters, 0),
        maxDistrictDrawNodes: Math.max(...terrainLayers
            .filter(x => x.layer === 'java' || x.layer === 'kalimantan')
            .map(x => x.drawNodes)),
        instancedObjects: terrainLayers.reduce((n, x) => n + x.instances, 0),
    };
    const groundDestruction = {};
    for (const type of ['turret', 'tank', 'bunker', 'depot']) {
        const rig = variantOwner(W.groundTargets, type).variants[type].userData.destructionRig;
        groundDestruction[type] = { breakaways: rig.breakaways.length };
    }
    return {
        built, key: STAGE10_FLIGHT_KEY, rootVisible: W.root.visible,
        origin: { x: S10_FLIGHT_X, z: S10_FLIGHT_START_Z },
        bounds: { ...S10_FLIGHT_BOUNDS },
        terrainTiles: W.terrainTiles.length,
        biomeLayersPerTile: 3,
        coastRigs: Object.keys(W.coastRigs).length,
        landscapes,
        terrainPerformance,
        clouds: W.clouds.length,
        lighting: {
            extraDirectional: 0,
            extraPoint: 0,
            sharedBaseRig: true,
            preset: 'flight',
            brightnessMultiplier: 0.75,
        },
        playerAircraft: {
            armed: true,
            machineGuns: W.playerAircraft.userData.transport.weapons.wingMachineGuns.length,
            cannons: 0,
            noseCannonsHidden: W.playerAircraft.userData.transport.weapons.noseCannons
                .every(c => !c.group.visible),
            gearHidden: W.playerAircraft.userData.transport.gear.every(g => !g.strut.visible),
            visualScale: visual.scale,
            visualSpan: visual.span,
            visualLength: visual.length,
        },
        playerImpactFx: {
            prebuilt: true,
            pointLights: 0,
            flash: 1,
            ring: 1,
            sparks: W.playerImpactFx.sparks.length,
            smoke: W.playerImpactFx.smoke.length,
            fire: W.playerImpactFx.fire.length,
            debris: W.playerImpactFx.debris.length,
        },
        ships: {
            visualScale: W.surfaceVisual.scale,
            hitRadius: { ...W.surfaceVisual.hitRadius },
            variants: shipVariants,
            destructionFx: {
                prebuiltPerSlot: true,
                fires: W.enemies[0].damageFx.fires.length,
                smoke: W.enemies[0].damageFx.smoke.length,
                sparks: W.enemies[0].damageFx.sparks.length,
            },
        },
        enemyAircraft: {
            visualSpan: visual.enemyAircraftSpan,
            scaleRatio: visual.enemyAircraftScaleRatio,
            smallerThanPlayer: visual.enemyAircraftSpan < visual.span,
            hitRadius: visual.enemyAircraftHitRadius,
            variants: aircraftVariants,
            destructionFx: {
                prebuiltPerSlot: true,
                fires: W.enemies[0].damageFx.fires.length,
                smoke: W.enemies[0].damageFx.smoke.length,
                sparks: W.enemies[0].damageFx.sparks.length,
            },
        },
        escorts: { supported: false },
        // TINGGI LANSKAP diukur dari mesh yang benar-benar dibangun (termasuk
        // InstancedMesh), jadi distrik baru yang digambar terlalu tinggi
        // ketahuan oleh test alih-alih ikut terkirim.
        // CAKUPAN + KETERATURAN per zona, diukur dari batch yang benar-benar
        // dibangun. `cameraHalfX` diturunkan dari fov/ofset kamera stage ini,
        // jadi kalau kameranya diubah, ambangnya ikut — tidak ada angka layar
        // yang diketik ulang di test.
        terrainCoverage: (() => {
            const per = {};
            for (const tile of W.terrainTiles)
                for (const g of Object.values(tile.biomes)) {
                    const zone = (g.userData.landscape && g.userData.landscape.zone);
                    if (!zone) continue;
                    const e = per[zone] || (per[zone] = { halfX: 0, yaw: 0, xs: 0 });
                    g.traverse(o => {
                        const u = o.userData;
                        if (!u || u.localHalfX === undefined) return;
                        e.halfX = Math.max(e.halfX, u.localHalfX);
                        e.yaw = Math.max(e.yaw, u.distinctYaw);
                        e.xs = Math.max(e.xs, u.distinctX);
                    });
                }
            for (const k of Object.keys(per)) per[k].halfX = Math.round(per[k].halfX);
            // 21:9 adalah layar terlebar yang wajar; kalau lanskap menutupinya,
            // ia menutupi semua rasio yang lebih sempit.
            return { perZone: per, cameraHalfX: Math.round(flightCameraHalfX(21 / 9)),
                contentHalfX: CONTENT_HALF_X };
        })(),
        terrainHeight: (() => {
            const per = {};
            for (const tile of W.terrainTiles)
                for (const [name, g] of Object.entries(tile.biomes)) {
                    const zone = (g.userData.landscape && g.userData.landscape.zone) || name;
                    per[zone] = Math.max(per[zone] || 0, propTopHeight(g));
                }
            for (const [name, rig] of Object.entries(W.coastRigs))
                per[name] = Math.max(per[name] || 0, propTopHeight(rig));
            for (const k of Object.keys(per)) per[k] = +per[k].toFixed(2);
            return { ceiling: flightSurfaceCeiling(),
                altitude: CFG.campaign.stage10.flight.altitude,
                tallest: Math.max(...Object.values(per)), perZone: per };
        })(),
        surfaceHeight: {
            ceiling: CFG.campaign.stage10.flight.altitude
                * CFG.campaign.stage10.flight.ground.maxHeightFraction,
            altitude: CFG.campaign.stage10.flight.altitude,
            tallest: Math.max(
                ...W.groundTargets.map(g => Object.values(g.variants)[0].userData.fittedTop || 0),
                ...W.enemies.filter(e => e.family === 'ship')
                    .flatMap(e => Object.values(e.variants).map(v => v.userData.fittedTop || 0))),
            perKind: Object.assign({}, ...W.groundTargets.map(g => ({
                [g.kind]: +(Object.values(g.variants)[0].userData.fittedTop || 0).toFixed(2) })),
                ...W.enemies.filter(e => e.family === 'ship').map(e =>
                    Object.fromEntries(Object.entries(e.variants).map(([k, v]) =>
                        [k, +(v.userData.fittedTop || 0).toFixed(2)])))),
        },
        groundTargets: {
            slots: W.groundTargets.length,
            kinds: [...GROUND_KINDS],
            visualScale: W.groundVisual.scale,
            hitRadius: { ...W.groundVisual.hitRadius },
            weaponRigs: groundWeaponRigs,
            destruction: groundDestruction,
            destructionFx: {
                prebuiltPerSlot: true,
                fires: W.groundTargets[0].damageFx.fires.length,
                smoke: W.groundTargets[0].damageFx.smoke.length,
                sparks: W.groundTargets[0].damageFx.sparks.length,
            },
        },
        missile: { ...W.missileVisual },
        drops: { visualScale: W.dropVisual.scale },
        boss: {
            prebuilt: !!W.boss, visible: W.boss.visible,
            engines: W.boss.userData.boss.engines.length,
            turrets: W.boss.userData.boss.turrets.length,
            pods: W.boss.userData.boss.pods.length,
            span: W.boss.userData.boss.span,
        },
        enemyRoundShape: 'orb',
        pools: {
            enemies: W.enemies.length,
            // Pool terspesialisasi: satu slot hanya membawa siluet keluarganya.
            airSlots: W.enemies.filter(e => e.family === 'air').length,
            shipSlots: W.enemies.filter(e => e.family === 'ship').length,
            variantsPerAirSlot: Object.keys(
                W.enemies.find(e => e.family === 'air').variants).length,
            variantsPerShipSlot: Object.keys(
                W.enemies.find(e => e.family === 'ship').variants).length,
            variantsPerGroundSlot: Object.keys(W.groundTargets[0].variants).length,
            groundTargets: W.groundTargets.length,
            playerRounds: W.playerRounds.length,
            enemyRounds: W.enemyRounds.length,
            missiles: W.missiles.length,
            drops: W.drops.length,
            explosions: W.explosions.length,
        },
    };
}
