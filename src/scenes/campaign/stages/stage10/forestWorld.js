// Stage 10 Chapter 2 — THE GREEN FIREWALL, dunia hutan tropis + waterworks.
// Seluruh tata letak statis deterministik. Identitas tempat datang dari vegetasi,
// topografi, jalan layanan, dan bendungan; tidak ada skyline/gedung kota.

import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStaticShadowAware } from '../../../../utils/meshBatch.js';
import { resolveBlockers, resolveCylinders } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import { mergeObjectInPlace } from '../../../../utils/meshBatch.js';
import {
    registerOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';

export const STAGE10_FOREST_LIGHTS_KEY = 'campaign-10-forest';
export const S10_FOREST_ORIGIN = Object.freeze({ x: 360000, z: 0 });
export const S10_FOREST_START = Object.freeze({ x: 360690, z: -250 });
export const S10_FOREST_WRECK = Object.freeze({ x: 360620, z: -210 });
export const S10_FOREST_SENSOR_ENTRY = Object.freeze({ x: 360170, z: -35 });
export const S10_FOREST_SHELTER = Object.freeze({ x: 359915, z: 95 });
export const S10_FOREST_WATERWORKS = Object.freeze({ x: 359650, z: 155 });
export const S10_FOREST_GALLERY = Object.freeze({ x: 359430, z: 230 });
export const S10_FOREST_FINISH = Object.freeze({ x: 359270, z: 265 });

const GROUND_Y = 0;
const BOUNDS = Object.freeze({ x0: 359100, x1: 360850, z0: -690, z1: 690 });
const ROUTE = Object.freeze([
    Object.freeze({ x: 360730, z: -255, w: 88, zone: 'wreckClearing' }),
    Object.freeze({ x: 360500, z: -220, w: 62, zone: 'serviceRoad' }),
    Object.freeze({ x: 360315, z: -105, w: 54, zone: 'canopyTrail' }),
    Object.freeze({ x: 360135, z: -15, w: 66, zone: 'scanBelt' }),
    Object.freeze({ x: 359920, z: 95, w: 72, zone: 'maintenanceShelter' }),
    Object.freeze({ x: 359720, z: 145, w: 78, zone: 'waterworks' }),
    Object.freeze({ x: 359500, z: 215, w: 70, zone: 'damCrest' }),
    Object.freeze({ x: 359270, z: 265, w: 52, zone: 'utilityDescent' }),
]);

let built = false;
let root = null;
let nav = null;
let carrier = null;
let tunnelDoor = null;
let rawMeshes = 0;
let weldedMeshes = 0;
const blockers = [];
const trunks = [];
const blockerScratch = [];
const shelters = [];
const denseCanopy = [];
let occluderCount = 0;   // pohon/bangunan yang didaftarkan ke utility/occlusion.js
const semantic = new Map();
const vegetationChunks = [];
const lights = [];
let roadOutline = null;   // tepi kiri/kanan pita jalan (uji kesinambungan)

const mats = {};
function mat(name, color, opts = {}) {
    if (!mats[name]) mats[name] = new THREE.MeshLambertMaterial({
        color,
        emissive: opts.emissive || 0,
        emissiveIntensity: Math.min(EMISSIVE_MAX, opts.emissiveIntensity || 0),
        transparent: !!opts.transparent,
        opacity: opts.opacity == null ? 1 : opts.opacity,
        depthWrite: opts.depthWrite == null ? true : !!opts.depthWrite,
        flatShading: opts.flatShading == null ? true : !!opts.flatShading,
    });
    return mats[name];
}

function count(kind, n = 1) { semantic.set(kind, (semantic.get(kind) || 0) + n); }
function hash(i, salt = 0) {
    let n = Math.imul((i + 1) ^ Math.imul(salt + 17, 0x45d9f3b), 0x27d4eb2d);
    n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}

function mesh(parent, geo, material, x, y, z, rx = 0, ry = 0, rz = 0,
    cast = false, receive = false) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m); rawMeshes++; return m;
}

function routeDist2(x, z) {
    let best = Infinity;
    for (let i = 0; i < ROUTE.length - 1; i++) {
        const a = ROUTE[i], b = ROUTE[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const den = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / den));
        const px = a.x + dx * t, pz = a.z + dz * t;
        const w = a.w + (b.w - a.w) * t;
        const d2 = (x - px) ** 2 + (z - pz) ** 2;
        if (d2 / (w * w) < best) best = d2 / (w * w);
    }
    return best;
}

function inRect(x, z, r, q) {
    return x >= q.x - q.hx + r && x <= q.x + q.hx - r
        && z >= q.z - q.hz + r && z <= q.z + q.hz - r;
}

export function stage10ForestWalk(x, z, radius = 0) {
    if (x < BOUNDS.x0 + radius || x > BOUNDS.x1 - radius
        || z < BOUNDS.z0 + radius || z > BOUNDS.z1 - radius) return false;
    if (routeDist2(x, z) <= 1) return true;
    // Dua jalur pada pendekatan hutan yang menyatu kembali di sensor belt.
    const northFork = { x: 360385, z: -45, hx: 205, hz: 42 };
    const southFork = { x: 360385, z: -245, hx: 205, hz: 48 };
    if (inRect(x, z, radius, northFork) || inRect(x, z, radius, southFork)) return true;
    // Dam crest dan control gallery adalah lantai lebar, bukan garis tipis.
    if (inRect(x, z, radius, { x: 359610, z: 175, hx: 170, hz: 92 })) return true;
    if (inRect(x, z, radius, { x: 359390, z: 235, hx: 105, hz: 72 })) return true;
    return false;
}

function addBoxBlocker(x, z, hx, hz, top, yaw = 0, kind = 'structure', bullet = true) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const b = { x, z, hx, hz, top, axx: c, axz: s, azx: -s, azz: c,
        rad: Math.hypot(hx, hz), standable: false, yaw, kind, bullet };
    blockers.push(b); return b;
}

function addTrunk(x, z, r, top, kind) { trunks.push({ x, z, r, top, kind }); }

function segmentCircle(x0, z0, x1, z1, c, extra = 0) {
    const dx = x1 - x0, dz = z1 - z0, den = dx * dx + dz * dz;
    const t = den > 1e-8 ? Math.max(0, Math.min(1,
        ((c.x - x0) * dx + (c.z - z0) * dz) / den)) : 0;
    return (x0 + dx * t - c.x) ** 2 + (z0 + dz * t - c.z) ** 2
        <= (c.r + extra) ** 2;
}

function segmentBox(x0, z0, x1, z1, b, pad = 0) {
    const tx0 = (x0 - b.x) * b.axx + (z0 - b.z) * b.axz;
    const tz0 = (x0 - b.x) * b.azx + (z0 - b.z) * b.azz;
    const tx1 = (x1 - b.x) * b.axx + (z1 - b.z) * b.axz;
    const tz1 = (x1 - b.x) * b.azx + (z1 - b.z) * b.azz;
    const dx = tx1 - tx0, dz = tz1 - tz0;
    let lo = 0, hi = 1;
    for (const [p, q] of [[-dx, tx0 + b.hx + pad], [dx, b.hx + pad - tx0],
        [-dz, tz0 + b.hz + pad], [dz, b.hz + pad - tz0]]) {
        if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
        const t = q / p;
        if (p < 0) { if (t > hi) return false; lo = Math.max(lo, t); }
        else { if (t < lo) return false; hi = Math.min(hi, t); }
    }
    return lo <= hi;
}

export function stage10ForestSegBlocked(x0, z0, x1, z1, bullet = true) {
    for (const b of blockers) if ((!bullet || b.bullet) && segmentBox(x0, z0, x1, z1, b)) return true;
    for (const t of trunks) if (segmentCircle(x0, z0, x1, z1, t, bullet ? 0 : 2)) return true;
    return false;
}

export function stage10ForestResolve(pos, radius, feetY = 0) {
    blockerScratch.length = 0;
    for (const b of blockers) blockerScratch.push(b);
    resolveBlockers(pos, radius, feetY, blockerScratch);
    resolveCylinders(pos, radius, trunks);
}

export function stage10ForestGroundHeight() { return GROUND_Y; }
export function stage10ForestNav() { return nav; }

export function stage10ForestPlayerProtected(x, z) {
    return shelters.some(s => Math.abs(x - s.x) <= s.hx && Math.abs(z - s.z) <= s.hz)
        || denseCanopy.some(s => (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r ** 2);
}

// ===== PITA MITER (2026-08-26, permintaan user: "jalannya menyambung") =====
// Jalan & saluran dulu dibangun sebagai KOTAK PER-RUAS: tiap ruas memakai
// lebar min(a.w, b.w) sendiri dan diputar sendiri, sehingga tiap simpul rute
// memperlihatkan UNDAKAN lebar sekaligus takik di sisi luar belokan — persis
// "patahan pada belokan yang tidak rapih" yang dilaporkan. Sekarang seluruh
// rute jadi SATU poligon dengan sambungan miter dan lebar per-TITIK, jadi tepi
// jalan menyambung mulus dari bangkai carrier sampai mulut terowongan.
function miterFrames(pts) {
    const n = pts.length, out = [];
    const dir = (a, b) => {
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l };
    };
    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const din = i > 0 ? dir(pts[i - 1], p) : dir(p, pts[1]);
        const dout = i < n - 1 ? dir(p, pts[i + 1]) : dir(pts[n - 2], p);
        const tx = din.x + dout.x, tz = din.z + dout.z;
        const l = Math.hypot(tx, tz) || 1;
        const nx = -tz / l, nz = tx / l;                       // normal kiri rata-rata
        const c = Math.max(0.35, nx * -dout.z + nz * dout.x);  // cos(theta/2)
        out.push({ x: p.x, z: p.z, nx, nz, m: 1 / c });
    }
    return out;
}

// Satu bidang datar menerus dari kerangka miter. `half(i)`/`off(i)` = setengah
// lebar & geseran lateral di titik i (saluran tepi memakai `off`). Koordinat
// shape RELATIF terhadap origin dunia supaya presisi float32 tetap sehat.
function ribbon(parent, material, frames, half, off, y, receive = true) {
    const left = [], right = [];
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i], w = half(i) * f.m, o = off(i) * f.m;
        left.push([f.x + f.nx * (o + w), f.z + f.nz * (o + w)]);
        right.push([f.x + f.nx * (o - w), f.z + f.nz * (o - w)]);
    }
    const ring = left.concat(right.reverse());
    const shape = new THREE.Shape();
    for (let i = 0; i < ring.length; i++) {
        const sx = ring[i][0] - S10_FOREST_ORIGIN.x;
        const sy = -(ring[i][1] - S10_FOREST_ORIGIN.z);   // rot -90 deg X: shape +Y -> dunia -Z
        if (i === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
    }
    return mesh(parent, new THREE.ShapeGeometry(shape), material,
        S10_FOREST_ORIGIN.x, y, S10_FOREST_ORIGIN.z, -Math.PI / 2, 0, 0, false, receive);
}

function buildGround() {
    const g = new THREE.Group();
    mesh(g, new THREE.PlaneGeometry(2100, 1500), mat('forestSoil', 0x35432b),
        S10_FOREST_ORIGIN.x, -1.5, 0, -Math.PI / 2, 0, 0, false, true);
    // Broad terrain facets keep the world filled beyond the route and fog edge.
    for (let i = 0; i < 24; i++) {
        const x = BOUNDS.x0 + 35 + hash(i, 1) * (BOUNDS.x1 - BOUNDS.x0 - 70);
        const z = BOUNDS.z0 + 35 + hash(i, 2) * (BOUNDS.z1 - BOUNDS.z0 - 70);
        const sx = 90 + hash(i, 3) * 210, sz = 60 + hash(i, 4) * 155;
        mesh(g, new THREE.CircleGeometry(1, 9), mat(i % 3 ? 'loam' : 'moss',
            i % 3 ? 0x493a29 : 0x40552f), x, -0.7, z,
        -Math.PI / 2, 0, hash(i, 5) * Math.PI, false, true).scale.set(sx, sz, 1);
    }
    // Service road: SATU pita menerus (bahu kerikil + aspal) mengikuti rute.
    const frames = miterFrames(ROUTE);
    const halfW = i => ROUTE[i].w * 0.6;
    ribbon(g, mat('roadShoulder', 0x4a4534), frames, i => halfW(i) + 9, () => 0, 0.34);
    ribbon(g, mat('wetRoad', 0x41413b), frames, halfW, () => 0, 0.5);
    // Tepi pita disimpan supaya uji asap bisa membuktikan jalannya MENYAMBUNG
    // (satu poligon, lebar berubah bertahap, tak keluar koridor berjalan).
    roadOutline = {
        left: frames.map((f, i) => ({ x: f.x + f.nx * halfW(i) * f.m,
            z: f.z + f.nz * halfW(i) * f.m })),
        right: frames.map((f, i) => ({ x: f.x - f.nx * halfW(i) * f.m,
            z: f.z - f.nz * halfW(i) * f.m })),
    };
    for (let i = 0; i < ROUTE.length - 1; i++) {
        const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz), yaw = Math.atan2(dz, dx);
        // Sambungan beton melintang: lebarnya ikut pita, jadi tak menonjol keluar.
        for (let k = 1; k < 5; k++) {
            const t = k / 5, w = (a.w + (b.w - a.w) * t) * 0.6;
            mesh(g, new THREE.BoxGeometry(1.1, 0.18, w * 1.86),
                mat('roadSeam', 0x625f55), a.x + dx * t, 0.6, a.z + dz * t,
                0, -yaw, 0, false, false);
        }
        // Marka tengah putus-putus: penegas bahwa rute ini SATU jalur menerus.
        const dashes = Math.max(1, Math.floor(len / 34));
        for (let k = 0; k < dashes; k++) {
            const t = (k + .5) / dashes;
            mesh(g, new THREE.BoxGeometry(15, 0.16, 1.8), mat('roadMark', 0x8d8a7e),
                a.x + dx * t, 0.62, a.z + dz * t, 0, -yaw, 0, false, false);
        }
    }
    count('broken-asphalt', ROUTE.length - 1); count('terrain-facet', 24);
    count('road-ribbon', 2);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildDrainage() {
    const g = new THREE.Group();
    // Saluran tepi: pita miter juga, jadi ia MENGIKUTI belokan jalan alih-alih
    // putus tiap ruas seperti versi kotak-per-ruas.
    const drainPts = ROUTE.slice(0, ROUTE.length - 2);
    const drainFrames = miterFrames(drainPts);
    const drainOff = i => drainPts[i].w * 0.6 + 11;
    for (const side of [-1, 1]) {
        ribbon(g, mat('drainConcrete', PAL.concrete), drainFrames,
            () => 5, i => side * drainOff(i), 0.9);
        ribbon(g, mat('drainWater', 0x294c43), drainFrames,
            () => 2.6, i => side * drainOff(i), 0.98, false);
    }
    // Natural streams cross under culverts, visibly continuing into forest.
    for (const [x, z, yaw, len] of [
        [360420, -95, 0.58, 430], [360035, 80, -0.35, 510], [359760, 325, 0.22, 620],
    ]) {
        mesh(g, new THREE.BoxGeometry(20, 1.2, len), mat('stream', 0x31584e),
            x, -0.2, z, 0, yaw, 0, false, false);
        for (const s of [-1, 1])
            mesh(g, new THREE.BoxGeometry(6, 4, len), mat('streamBank', 0x4b4b35),
                x + Math.cos(yaw) * s * 14, 0, z - Math.sin(yaw) * s * 14,
                0, yaw, s * 0.07, false, true);
        count('stream');
    }
    count('drainage-channel', 2);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

// ===== DAUN/PELEPAH (2026-08-26, laporan user "daunnya aneh") =====
// Bug lama: pelepah palem & paku memakai `rotation.set(PI/2, a, ...)`. Dengan
// urutan euler XYZ, rotasi Y adalah rotasi DALAM sehingga TIDAK menyentuh sumbu
// +Y lokal — jadi seluruh pelepah satu pohon menunjuk ke arah dunia +Z yang
// sama, menembus batang, sementara `scale.z` malah memendekkan (bukan
// memipihkan) kerucutnya. Sekarang arah dipetakan lewat (0, ry, rz): dengan
// x=0, sumbu +Y lokal jatuh tepat di
//     (-cos(ry)*sin(rz), cos(rz), sin(ry)*sin(rz))
// sehingga rz = sudut dari tegak (T) dan ry = PI - azimut (A).
function frondAngles(A, T) { return { ry: Math.PI - A, rz: T }; }

// Satu helai daun: kerucut yang PANGKALNYA di titik tumbuh (geometri digeser
// +len/2) lalu dipipihkan pada sumbu lokal Z -> bilah, bukan tanduk.
function frond(parent, m, x, y, z, len, wide, thin, A, T, seg = 4, cast = false) {
    const a = frondAngles(A, T);
    const f = mesh(parent, new THREE.ConeGeometry(wide, len, seg).translate(0, len / 2, 0),
        m, x, y, z, 0, a.ry, a.rz, cast, false);
    f.scale.set(1, 1, thin);
    return f;
}

function treeParts(parent, x, z, scale, type, fadeable = false) {
    const trunkMat = fadeable ? mat(`fade-trunk-${occluderCount}`, PAL.wood,
        { transparent: true }) : mat('trunk', PAL.wood);
    const leafBase = type === 'palm' ? 0x52733a : type === 'bamboo' ? 0x4a6735
        : type === 'fern' ? 0x355e32 : type === 'banana' ? 0x668044 : PAL.leaf;
    const leafMat = fadeable ? mat(`fade-leaf-${occluderCount}`, leafBase,
        { transparent: true }) : mat(`leaf-${type}`, leafBase);
    // Tinggi per SPESIES (dulu paku & pisang ikut angka pohon 2.8 sehingga
    // proporsinya salah: paku setinggi pohon, pisang sekurus bambu).
    const h = scale * (type === 'dipterocarp' ? 4.4 : type === 'palm' ? 3.9
        : type === 'bamboo' ? 3.2 : type === 'fern' ? 1.35 : 2.3);
    const seed = Math.floor(x * 0.31 + z * 0.17);
    const group = new THREE.Group();
    if (type === 'bamboo') {
        // Rumpun bambu: batang RAMPING beruas dengan semburat daun kecil di
        // pucuk. Versi lama menaruh kerucut selebar ~2 m di tiap batang —
        // dari kamera atas terbaca seperti topi kerucut, bukan bambu.
        for (let k = -2; k <= 2; k++) {
            const bx = x + k * scale * 0.3, bz = z + (((k * 7) % 3) - 1) * scale * 0.24;
            const ch = h * (0.76 + hash(seed, 30 + k) * 0.5), lean = k * 0.028;
            mesh(group, new THREE.CylinderGeometry(scale * 0.075, scale * 0.1, ch, 6),
                trunkMat, bx, ch / 2, bz, 0, 0, lean, false, false);
            for (let r = 0; r < 3; r++)   // ruas
                mesh(group, new THREE.CylinderGeometry(scale * 0.105, scale * 0.105,
                    scale * 0.07, 6), trunkMat, bx, ch * (0.34 + r * 0.2), bz,
                0, 0, lean, false, false);
            for (let d = 0; d < 4; d++) {
                const A = (k + 2) * 1.1 + d * 1.571 + hash(seed, 40 + d) * 0.5;
                frond(group, leafMat, bx, ch * (0.74 + (d % 2) * 0.17), bz,
                    scale * 1.15, scale * 0.15, 0.34, A, 1.0 + (d % 2) * 0.28, 3);
            }
        }
    } else if (type === 'palm') {
        mesh(group, new THREE.CylinderGeometry(scale * 0.2, scale * 0.32, h, 8),
            trunkMat, x, h / 2, z, 0, hash(seed, 6) * Math.PI, 0, !fadeable, true);
        // Mahkota: pangkal semua pelepah bertemu di satu titik di pucuk batang,
        // jadi tak ada lagi pelepah yang muncul dari sisi lain batang.
        mesh(group, new THREE.DodecahedronGeometry(scale * 0.34, 0), trunkMat,
            x, h, z, 0, 0, 0, false, false);
        for (let k = 0; k < 9; k++) {
            const A = k * Math.PI * 2 / 9 + hash(seed, 50 + k) * 0.22;
            frond(group, leafMat, x, h, z, scale * 3.1, scale * 0.44, 0.2,
                A, 1.16 + (k % 3) * 0.12, 4, !fadeable);
        }
        for (let k = 0; k < 3; k++)   // pelepah muda masih tegak di tengah
            frond(group, leafMat, x, h, z, scale * 1.7, scale * 0.3, 0.2,
                k * 2.094 + 0.5, 0.42, 4);
    } else if (type === 'banana') {
        mesh(group, new THREE.CylinderGeometry(scale * 0.26, scale * 0.36, h, 7),
            trunkMat, x, h / 2, z, 0, hash(seed, 6) * Math.PI, 0, !fadeable, true);
        for (let k = 0; k < 7; k++) {
            const A = k * Math.PI * 2 / 7 + hash(seed, 60 + k) * 0.3;
            // Daun pisang: LEBAR dan sangat tipis, menjuntai ke bawah.
            frond(group, leafMat, x, h * 0.94, z, scale * 2.8, scale * 0.82, 0.1,
                A, 1.05 + (k % 2) * 0.3, 4, !fadeable);
        }
        for (let k = 0; k < 2; k++)   // pucuk gulung yang masih tegak
            frond(group, leafMat, x, h * 0.94, z, scale * 1.5, scale * 0.26, 0.35,
                k * 3.14 + 0.9, 0.3, 4);
    } else if (type === 'fern') {
        mesh(group, new THREE.CylinderGeometry(scale * 0.17, scale * 0.26, h, 6),
            trunkMat, x, h / 2, z, 0, 0, 0, false, true);
        for (let k = 0; k < 8; k++) {
            const A = k * Math.PI / 4 + hash(seed, 70 + k) * 0.2;
            frond(group, leafMat, x, h, z, scale * 2.0, scale * 0.32, 0.28,
                A, 1.28 + (k % 2) * 0.14, 4);
        }
        for (let k = 0; k < 4; k++)   // mahkota dalam yang lebih tegak
            frond(group, leafMat, x, h, z, scale * 1.2, scale * 0.24, 0.28,
                k * 1.571 + 0.4, 0.72, 4);
    } else {
        mesh(group, new THREE.CylinderGeometry(scale * 0.36, scale * 0.52, h, 7),
            trunkMat, x, h / 2, z, 0, hash(seed, 6) * Math.PI, 0, !fadeable, true);
        // Buttress roots make the species readable even under the top-down camera.
        for (let k = 0; k < 5; k++) {
            const a = k * Math.PI * 2 / 5;
            mesh(group, new THREE.BoxGeometry(scale * 1.8, scale * 0.35, scale * 0.32),
                trunkMat, x + Math.cos(a) * scale * 0.62, scale * 0.25,
                z + Math.sin(a) * scale * 0.62, 0, -a, 0.18, !fadeable, true);
        }
        // Dahan menopang tajuk supaya gumpalan daun tak melayang lepas dari batang.
        for (let k = 0; k < 3; k++)
            frond(group, trunkMat, x, h * 0.74, z, scale * 1.6, scale * 0.13, 1,
                k * 2.094 + hash(seed, 80) * 1.5, 1.02, 5);
        // Tajuk dipipihkan (scale.y): kanopi hutan hujan itu lebar & datar,
        // bukan bola-bola benjol seperti versi lama.
        for (const [ox, oy, oz, r] of [[0, .84, 0, 1.95], [-1.05, .78, .42, 1.4],
            [.95, .74, -.52, 1.5], [.28, 1.0, .48, 1.25], [-.35, .95, -.6, 1.15]])
            mesh(group, new THREE.DodecahedronGeometry(scale * r, 0), leafMat,
                x + ox * scale, h * oy, z + oz * scale, 0, 0, 0, false, false)
                .scale.set(1, 0.62, 1);
    }
    count(type);
    if (fadeable) {
        parent.add(group);
        // Material pohon hero sudah instans sendiri (`fade-trunk-N`/`fade-leaf-N`),
        // jadi tak perlu diklon lagi oleh pendaftar.
        registerOccluder(STAGE10_FOREST_LIGHTS_KEY, group,
            { x, z, radius: scale * 4.8, top: h * 1.2, clone: false });
        occluderCount++;
    } else parent.add(group);
    return { h, r: scale * 0.5 };
}

function buildForest() {
    const TYPES = ['dipterocarp', 'palm', 'bamboo', 'fern', 'banana'];
    const chunkSize = 220;
    for (let c = 0; c < 8; c++) {
        const chunk = new THREE.Group();
        const x0 = BOUNDS.x0 + c * chunkSize;
        let local = 0;
        for (let i = 0; i < 44; i++) {
            const id = c * 61 + i;
            const x = x0 + hash(id, 10) * chunkSize;
            const z = BOUNDS.z0 + hash(id, 11) * (BOUNDS.z1 - BOUNDS.z0);
            if (routeDist2(x, z) < 1.28) continue;
            if (x < 359820 && x > 359350 && z > 35 && z < 340) continue;
            const type = TYPES[(id + c) % TYPES.length];
            const scale = 4.2 + hash(id, 12) * (type === 'fern' ? 2.8 : 6.2);
            const p = treeParts(chunk, x, z, scale, type, false);
            if (type !== 'fern' && type !== 'banana') addTrunk(x, z, p.r, p.h, type);
            local++;
        }
        const before = rawMeshes;
        const batches = addMergedStaticShadowAware(root, [chunk]);
        weldedMeshes += batches.length;
        vegetationChunks.push({ id: c, x0, x1: x0 + chunkSize, trees: local,
            raw: rawMeshes - before + local, batches: batches.length });
    }
    // Route-side hero trees retain independent transparent materials so their
    // canopy can fade without making an entire distant forest batch disappear.
    for (let i = 0; i < 22; i++) {
        const p = ROUTE[1 + (i % 5)], side = i % 2 ? 1 : -1;
        const x = p.x + (hash(i, 20) - .5) * 100;
        const z = p.z + side * (p.w + 18 + hash(i, 21) * 24);
        const type = i % 5 === 0 ? 'palm' : i % 4 === 0 ? 'banana' : 'dipterocarp';
        const scale = 5.2 + hash(i, 22) * 3.5;
        const q = treeParts(root, x, z, scale, type, true);
        if (type === 'dipterocarp') addTrunk(x, z, q.r, q.h, type);
        if (i % 6 === 0) denseCanopy.push({ x, z, r: 24 + scale });
    }
    count('vegetation-chunk', vegetationChunks.length);
}

function buildShelter(parent, x, z, yaw, kind = 'sensor-shelter') {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
    const concrete = mat('shelterConcrete', PAL.concrete);
    const steel = mat('shelterSteel', PAL.gunmetal);
    mesh(g, new THREE.BoxGeometry(38, 2, 28), concrete, 0, 1, 0, 0, 0, 0, true, true);
    for (const s of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(3, 16, 28), concrete, s * 17.5, 9, 0, 0, 0, 0, true, true);
        mesh(g, new THREE.BoxGeometry(35, 2.2, 3), concrete, 0, 9, s * 12.5, 0, 0, 0, true, true);
    }
    mesh(g, new THREE.BoxGeometry(42, 2.4, 32), concrete, 0, 18, 0, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(15, 6, 2), steel, 5, 5, 12, 0, 0, 0, true, true);
    for (let i = -2; i <= 2; i++)
        mesh(g, new THREE.BoxGeometry(1.2, 5, 1.2), mat('shelterVent', PAL.steel),
            -9 + i * 3, 5, -13.4, 0, 0, 0, false, false);
    parent.add(g);
    registerOccluder(STAGE10_FOREST_LIGHTS_KEY, g, { x, z, radius: 21, top: 19.2 });
    occluderCount++;
    shelters.push({ x, z, hx: 21, hz: 17, kind });
    addBoxBlocker(x - Math.cos(yaw) * 17.5, z + Math.sin(yaw) * 17.5, 2, 14, 18, yaw, kind);
    addBoxBlocker(x + Math.cos(yaw) * 17.5, z - Math.sin(yaw) * 17.5, 2, 14, 18, yaw, kind);
    count(kind); return g;
}

function buildWaterworks() {
    const g = new THREE.Group();
    // Reservoir and lower channel are broad simple stable planes.
    mesh(g, new THREE.PlaneGeometry(680, 470), mat('reservoir', 0x31584e),
        359590, -0.35, 445, -Math.PI / 2, 0, 0, false, false);
    mesh(g, new THREE.BoxGeometry(560, 14, 34), mat('damWall', PAL.concrete),
        359630, 7, 250, 0, -.12, 0, true, true);
    mesh(g, new THREE.BoxGeometry(480, 6, 82), mat('damCrest', 0x77746b),
        359620, 2, 187, 0, -.12, 0, true, true);
    for (let i = 0; i < 8; i++) {
        const x = 359845 - i * 58;
        mesh(g, new THREE.BoxGeometry(7, 27, 42), mat('spillPier', PAL.panel),
            x, 10, 268 + (x - 359620) * -.12, 0, -.12, 0, true, true);
        mesh(g, new THREE.CylinderGeometry(4.8, 4.8, 34, 8), mat('intakePipe', PAL.gunmetal),
            x, 8, 242 + (x - 359620) * -.12, Math.PI / 2, 0, 0, true, true);
    }
    // Intake tower with bridge, railings, valve housings, and service stairs.
    // Rumah intake berdiri sendiri supaya bisa memudar (28 unit, tepat di rute).
    const intake = new THREE.Group();
    mesh(intake, new THREE.BoxGeometry(56, 28, 48), mat('intakeHouse', PAL.panel),
        359720, 14, 338, 0, 0, 0, true, true);
    mesh(intake, new THREE.BoxGeometry(18, 44, 18), mat('intakeCore', PAL.concrete),
        359720, 22, 356, 0, 0, 0, true, true);
    const intakeNode = mergeObjectInPlace(intake);
    root.add(intakeNode); weldedMeshes += intakeNode.children.length || 1;
    registerOccluder(STAGE10_FOREST_LIGHTS_KEY, intakeNode, { x: 359720, z: 342, radius: 28, top: 44 });
    occluderCount++;
    mesh(g, new THREE.BoxGeometry(24, 4, 142), mat('serviceBridge', PAL.steel),
        359720, 19, 283, 0, 0, 0, true, true);
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++)
        mesh(g, new THREE.BoxGeometry(1, 7, 1), mat('rail', PAL.gunmetal),
            359720 + s * 11, 23, 220 + i * 15, 0, 0, 0, false, false);
    for (let i = 0; i < 5; i++) {
        mesh(g, new THREE.CylinderGeometry(6, 6, 3, 12), mat('valve', PAL.hazard),
            359775 - i * 27, 7, 158, Math.PI / 2, 0, 0, false, false);
        mesh(g, new THREE.TorusGeometry(7, 1, 6, 14), mat('valveWheel', PAL.steel),
            359775 - i * 27, 13, 158, Math.PI / 2, 0, 0, false, false);
    }
    // Permanent concrete cover on the exposed crest.
    for (let i = 0; i < 7; i++) {
        const x = 359800 - i * 62, z = 165 + (i % 2) * 38;
        mesh(g, new THREE.BoxGeometry(28, 15, 10), mat('crestCover', PAL.concrete),
            x, 7.5, z, 0, -.12, 0, true, true);
        addBoxBlocker(x, z, 14, 5, 15, -.12, 'crest-cover');
    }
    addBoxBlocker(359720, 338, 28, 24, 28, 0, 'intake-house');
    count('reservoir'); count('dam-crest'); count('spillway', 8); count('intake-structure');
    count('service-bridge'); count('valve-housing', 5); count('concrete-cover', 7);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;

    buildShelter(root, S10_FOREST_SHELTER.x, S10_FOREST_SHELTER.z, 0.12);
    buildShelter(root, S10_FOREST_GALLERY.x, S10_FOREST_GALLERY.z, -0.12, 'control-gallery');
    // Fixed service lights: count is constant throughout the stage.
    for (const p of [S10_FOREST_SHELTER, S10_FOREST_GALLERY]) {
        const l = new THREE.PointLight(PAL.amber, 0.8, 85, 2);
        l.position.set(p.x, 13, p.z); root.add(l); lights.push(l);
        registerStageLight(STAGE10_FOREST_LIGHTS_KEY, l);
    }
}

function buildSensorNodes() {
    // Tiang sensor setinggi 32 unit BERDIRI SENDIRI (bukan satu batch bersama):
    // masing-masing harus bisa memudar saat menutupi player/robot. Biayanya kecil
    // — tiap tiang dilas ke dalam dirinya sendiri (`mergeObjectInPlace`).
    for (let i = 0; i < 8; i++) {
        const x = 360140 - i * 92, z = (i % 2 ? 1 : -1) * (90 + (i % 3) * 34) + 40;
        const g = new THREE.Group();
        mesh(g, new THREE.CylinderGeometry(4.5, 6, 30, 8), mat('sensorMast', PAL.gunmetal),
            x, 15, z, 0, 0, 0, true, true);
        mesh(g, new THREE.BoxGeometry(20, 2, 5), mat('sensorArray', PAL.panel),
            x, 28, z, 0, i % 2 ? .35 : -.35, 0, false, false);
        mesh(g, new THREE.CylinderGeometry(2, 2, 7, 8), mat('sensorEye', PAL.hazard,
            { emissive: PAL.hazard, emissiveIntensity: .55 }), x, 32, z,
        Math.PI / 2, 0, 0, false, false);
        for (const s of [-1, 1])
            mesh(g, new THREE.BoxGeometry(1, 28, 1), mat('mastBrace', PAL.steel),
                x + s * 5, 12, z, 0, 0, s * .22, false, false);
        const node = mergeObjectInPlace(g);
        root.add(node); weldedMeshes += node.children.length || 1;
        registerOccluder(STAGE10_FOREST_LIGHTS_KEY, node, { x, z, radius: 11, top: 35 });
        occluderCount++;
        addBoxBlocker(x, z, 6, 6, 32, 0, 'sensor-mast');
    }
    count('sensor-mast', 8);
}

function buildCarrierWreck() {
    const g = new THREE.Group(); g.name = 'stage10Forest-armored-carrier-wreck';
    g.position.set(S10_FOREST_WRECK.x, 0, S10_FOREST_WRECK.z); g.rotation.y = -0.18;
    const armor = mat('wreckArmor', 0x30353a), char = mat('wreckChar', PAL.rubber);
    const steel = mat('wreckSteel', PAL.steel), hazard = mat('wreckHazard', PAL.hazard);
    // Eight-wheel armored freight carrier: independent damaged hull sections,
    // cabin, grille, axles, wheel hubs, cargo ribs, hatch, broken ramp and drive.
    mesh(g, new THREE.BoxGeometry(68, 10, 28), armor, 0, 12, 0, 0, 0, -.06, true, true);
    mesh(g, new THREE.BoxGeometry(30, 14, 27), armor, -43, 16, 0, 0, 0, -.15, true, true);
    mesh(g, new THREE.BoxGeometry(18, 8, 24), char, -64, 10, 0, 0, 0, -.22, true, true);
    mesh(g, new THREE.BoxGeometry(8, 7, 22), steel, -74, 9, 0, 0, 0, 0, true, true);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const wheel = mesh(g, new THREE.CylinderGeometry(7.2, 7.2, 5, 12), char,
            -47 + i * 29, 7 + (i === 3 ? 3 : 0), side * 16.5,
            Math.PI / 2, 0, i === 3 ? .42 : 0, true, true);
        void wheel;
        mesh(g, new THREE.CylinderGeometry(2.7, 2.7, 5.5, 10), steel,
            -47 + i * 29, 7 + (i === 3 ? 3 : 0), side * 16.5,
            Math.PI / 2, 0, 0, false, false);
    }
    for (let i = 0; i < 5; i++) {
        mesh(g, new THREE.BoxGeometry(4, 18, 30), steel, -10 + i * 14, 18, 0,
            0, 0, -.03 * i, true, true);
        mesh(g, new THREE.BoxGeometry(12, 2, 30), hazard, -10 + i * 14, 27, 0,
            0, 0, 0, false, false);
    }
    mesh(g, new THREE.BoxGeometry(22, 3, 25), armor, 43, 6, -3, 0, .18, -.46, true, true);
    mesh(g, new THREE.BoxGeometry(12, 2, 20), char, 59, 3, -9, 0, .25, -.7, true, true);
    mesh(g, new THREE.BoxGeometry(22, 3, 12), steel, -43, 24, -8, 0, 0, -.42, true, true);
    for (let i = 0; i < 6; i++)
        mesh(g, new THREE.BoxGeometry(2.2, 2.2, 15), char, 53 + i * 4.5,
            2 + i * .5, -22 - i * 4, .2 * i, 0, .35, false, false);
    root.add(g); carrier = g;
    registerOccluder(STAGE10_FOREST_LIGHTS_KEY, g,
        { x: S10_FOREST_WRECK.x, z: S10_FOREST_WRECK.z, radius: 46, top: 30 });
    occluderCount++;
    addBoxBlocker(S10_FOREST_WRECK.x, S10_FOREST_WRECK.z, 70, 22, 30, -0.18, 'carrier-wreck');
    count('carrier-wreck'); count('carrier-wheel', 8); count('carrier-cargo-rib', 5);
    carrier.userData.partCount = 3 + 16 + 10 + 4 + 6;
}

function buildTunnel() {
    const g = new THREE.Group(); g.position.set(S10_FOREST_FINISH.x, 0, S10_FOREST_FINISH.z);
    mesh(g, new THREE.BoxGeometry(18, 34, 64), mat('tunnelPier', PAL.concrete),
        0, 17, -31, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(18, 34, 64), mat('tunnelPier', PAL.concrete),
        0, 17, 31, 0, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(20, 10, 78), mat('tunnelLintel', PAL.panel),
        0, 34, 0, 0, 0, 0, true, true);
    tunnelDoor = mesh(g, new THREE.BoxGeometry(4, 28, 48), mat('tunnelDoor', PAL.gunmetal),
        -4, 14, 0, 0, 0, 0, true, true);
    for (let i = -2; i <= 2; i++)
        mesh(g, new THREE.BoxGeometry(1, 22, 2), mat('doorRib', PAL.steel),
            -6.2, 14, i * 9, 0, 0, 0, false, false);
    mesh(g, new THREE.BoxGeometry(1, 4, 18), mat('doorAuthority', PAL.tech,
        { emissive: PAL.techDim, emissiveIntensity: .6 }), -6.5, 19, 0,
    0, 0, 0, false, false);
    root.add(g);
    count('utility-tunnel'); count('sealed-door');
}

// ===== PAGAR BATAS AREA MAIN (2026-08-26, permintaan user) =====
// Tepi `stage10ForestWalk` dulu berupa DINDING TAK TERLIHAT: player mentok di
// tengah hutan tanpa satu pun petunjuk visual. Kontur predikat itu ditelusuri
// dengan marching squares (grid `FENCE_STEP`, titik potong dicari bisection
// supaya konturnya halus, bukan tangga) lalu ditandai pagar dinas kehutanan:
// kerb beton menerus (yang terbaca dari kamera top-down), tiang baja, dua rel,
// dan pelat bahaya berkala.
//
// MURNI PENANDA — tak ada `addBoxBlocker`, tak ada `addTrunk`: yang memblokir
// tetap predikat walkable yang sama, jadi pagar ini tak pernah bisa menggeser
// batas main atau menghalangi peluru. Ia digambar TEPAT di kontur radius-0
// (batas geometris), sementara pusat player berhenti `player.radius` lebih
// awal — jadi player berjalan sampai menyentuh pagar, persis seperti dugaannya.
const FENCE_STEP = 20;     // resolusi grid kontur (unit dunia)
const FENCE_TOP = 9;       // tinggi tiang (~1,3 m) — terlihat, tak menutupi pandangan
const fencePosts = [];
let fenceSegments = 0;

// Pasangan sisi sel yang dipotong kontur, per kode marching-squares
// (bit 1 = sudut (i,j), 2 = (i+1,j), 4 = (i+1,j+1), 8 = (i,j+1);
//  sisi 0 = bawah, 1 = kanan, 2 = atas, 3 = kiri).
const MS_EDGES = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]],
    [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]],
    [[1, 3]], [[0, 1]], [[0, 3]], []];

function fenceCrossX(z, xIn, xOut) {
    let a = xIn, b = xOut;
    for (let i = 0; i < 5; i++) {
        const m = (a + b) / 2;
        if (stage10ForestWalk(m, z, 0)) a = m; else b = m;
    }
    return (a + b) / 2;
}
function fenceCrossZ(x, zIn, zOut) {
    let a = zIn, b = zOut;
    for (let i = 0; i < 5; i++) {
        const m = (a + b) / 2;
        if (stage10ForestWalk(x, m, 0)) a = m; else b = m;
    }
    return (a + b) / 2;
}

function boundaryContour() {
    const step = FENCE_STEP;
    const cols = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / step);
    const rows = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / step);
    const gx = i => BOUNDS.x0 + i * step, gz = j => BOUNDS.z0 + j * step;
    const segs = [];
    let rowA = [];
    for (let i = 0; i <= cols; i++) rowA.push(stage10ForestWalk(gx(i), gz(0), 0));
    for (let j = 0; j < rows; j++) {
        const rowB = [];
        for (let i = 0; i <= cols; i++) rowB.push(stage10ForestWalk(gx(i), gz(j + 1), 0));
        for (let i = 0; i < cols; i++) {
            const p00 = rowA[i], p10 = rowA[i + 1], p11 = rowB[i + 1], p01 = rowB[i];
            const code = (p00 ? 1 : 0) | (p10 ? 2 : 0) | (p11 ? 4 : 0) | (p01 ? 8 : 0);
            const pairs = MS_EDGES[code];
            if (!pairs.length) continue;
            const pt = (e) => {
                if (e === 0) return { z: gz(j), x: fenceCrossX(gz(j),
                    p00 ? gx(i) : gx(i + 1), p00 ? gx(i + 1) : gx(i)) };
                if (e === 1) return { x: gx(i + 1), z: fenceCrossZ(gx(i + 1),
                    p10 ? gz(j) : gz(j + 1), p10 ? gz(j + 1) : gz(j)) };
                if (e === 2) return { z: gz(j + 1), x: fenceCrossX(gz(j + 1),
                    p01 ? gx(i) : gx(i + 1), p01 ? gx(i + 1) : gx(i)) };
                return { x: gx(i), z: fenceCrossZ(gx(i),
                    p00 ? gz(j) : gz(j + 1), p00 ? gz(j + 1) : gz(j)) };
            };
            for (const pair of pairs) segs.push([pt(pair[0]), pt(pair[1])]);
        }
        rowA = rowB;
    }
    return segs;
}

function buildBoundaryFence() {
    const g = new THREE.Group();
    // Mulut terowongan dibiarkan bersih: pagar di sana akan menembus pier/pintu
    // dan membuat titik finish terbaca seperti tertutup.
    const skip = [{ x: S10_FOREST_FINISH.x, z: S10_FOREST_FINISH.z, r: 70 }];
    const kerbMat = mat('fenceKerb', 0x6f6a5e);
    const postMat = mat('fencePost', PAL.gunmetal);
    const railMat = mat('fenceRail', PAL.steel);
    const markMat = mat('fenceMark', PAL.hazard);
    let n = 0;
    for (const seg of boundaryContour()) {
        const a = seg[0], b = seg[1];
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.8) continue;
        if (skip.some(s => (mx - s.x) ** 2 + (mz - s.z) ** 2 < s.r * s.r)) continue;
        // Jangan menanam pagar DI DALAM struktur/pohon yang sudah berdiri di
        // tepi (tiang sensor, penutup crest, rumah intake, batang pohon):
        // pagarnya akan menembus mereka dan — karena pagar sendiri tak punya
        // collider — terlihat seperti penanda yang berbohong.
        if (stage10ForestSegBlocked(a.x, a.z, b.x, b.z, false)) continue;
        const yaw = -Math.atan2(dz, dx);
        mesh(g, new THREE.BoxGeometry(len + 1.6, 1.7, 3.4), kerbMat,
            mx, 0.85, mz, 0, yaw, 0, false, true);
        mesh(g, new THREE.BoxGeometry(1.3, FENCE_TOP, 1.3), postMat,
            a.x, FENCE_TOP / 2, a.z, 0, yaw, 0, true, false);
        for (const y of [3.3, 6.7])
            mesh(g, new THREE.BoxGeometry(len + 1.6, 0.55, 0.55), railMat,
                mx, y, mz, 0, yaw, 0, false, false);
        if (n % 7 === 0)
            mesh(g, new THREE.BoxGeometry(3.6, 3.6, 0.5), markMat,
                mx, 6.2, mz, 0, yaw, 0, false, false);
        fencePosts.push({ x: a.x, z: a.z });
        n++;
    }
    fenceSegments = n;
    count('boundary-fence', n);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

export function setStage10ForestTunnelOpen(open) {
    if (tunnelDoor) tunnelDoor.position.y = open ? 38 : 14;
}

export function setCarrierWreckBurning(on) {
    if (carrier) carrier.userData.burning = !!on;
}

// Fade occluder kini uji GARIS PANDANG bersama (player DAN robot), bukan lagi
// sekadar jarak ke player — lihat utility/occlusion.js.
export function updateStage10ForestWorldVisuals(dt) {
    updateStageOccluders(STAGE10_FOREST_LIGHTS_KEY, dt);
}

export function resetStage10ForestWorldVisuals() {
    setStage10ForestTunnelOpen(false); setCarrierWreckBurning(true);
    resetStageOccluders(STAGE10_FOREST_LIGHTS_KEY);
}

export function ensureStage10ForestWorld(parent = scene) {
    if (built) return root;
    built = true; root = new THREE.Group(); root.name = 'campaign-stage10-chapter2-green-firewall';
    parent.add(root);
    buildGround(); buildDrainage(); buildForest(); buildCarrierWreck();
    buildSensorNodes(); buildWaterworks(); buildTunnel(); buildBoundaryFence();
    nav = makeNavGrid(BOUNDS.x0, BOUNDS.z0, 14,
        Math.ceil((BOUNDS.x1 - BOUNDS.x0) / 14),
        Math.ceil((BOUNDS.z1 - BOUNDS.z0) / 14),
        (x, z) => stage10ForestWalk(x, z, 3.5)
            && !blockers.some(b => segmentBox(x, z, x, z, b, 3.5))
            && !trunks.some(t => (x - t.x) ** 2 + (z - t.z) ** 2 <= (t.r + 3.5) ** 2));
    registerCampaignWorldRoot({
        key: STAGE10_FOREST_LIGHTS_KEY, root, bounds: { ...BOUNDS },
        lightsKey: STAGE10_FOREST_LIGHTS_KEY,
        warmupViews: [S10_FOREST_START, S10_FOREST_SENSOR_ENTRY, S10_FOREST_WATERWORKS, S10_FOREST_FINISH],
    });
    return root;
}

export const stage10ForestWorldDebug = () => ({
    built, origin: { ...S10_FOREST_ORIGIN }, bounds: { ...BOUNDS }, route: ROUTE.map(p => ({ ...p })),
    start: { ...S10_FOREST_START }, finish: { ...S10_FOREST_FINISH }, worldRoot: root?.name || null,
    rawMeshes, weldedMeshes, blockers: blockers.length, trunks: trunks.length,
    vegetationChunks: vegetationChunks.map(c => ({ ...c })),
    vegetationArchetypes: ['dipterocarp', 'palm', 'bamboo', 'fern', 'banana']
        .map(kind => ({ kind, count: semantic.get(kind) || 0 })),
    semantic: Object.fromEntries(semantic), urbanBuildings: 0,
    shelters: shelters.map(s => ({ ...s })), denseCanopy: denseCanopy.map(s => ({ ...s })),
    // Pagar batas: penanda VISUAL tepi area main (bukan blocker).
    fence: { step: FENCE_STEP, top: FENCE_TOP, segments: fenceSegments,
        posts: fencePosts.map(p => ({ ...p })) },
    road: roadOutline && { ribbons: 2,
        left: roadOutline.left.map(p => ({ ...p })),
        right: roadOutline.right.map(p => ({ ...p })) },
    // Posisi/radius diekspor supaya uji asap bisa berdiri TEPAT di belakang
    // sebuah occluder tanpa menebak koordinat.
    occluders: occlusionDebug(STAGE10_FOREST_LIGHTS_KEY),
    lights: { key: STAGE10_FOREST_LIGHTS_KEY, indoor: lights.length, outdoor: 0 },
    carrier: carrier && { persistent: true, solid: true, detailed: true,
        parts: carrier.userData.partCount, burning: !!carrier.userData.burning },
    tunnelOpen: !!tunnelDoor && tunnelDoor.position.y > 20,
    nav: nav && { cols: nav.cols, rows: nav.rows,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});
