// Stage 11 — THE GREEN FIREWALL, dunia hutan tropis + waterworks.
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

export const STAGE11_LIGHTS_KEY = 'campaign-11';
export const S11_ORIGIN = Object.freeze({ x: 360000, z: 0 });
export const S11_START = Object.freeze({ x: 360690, z: -250 });
export const S11_WRECK = Object.freeze({ x: 360620, z: -210 });
export const S11_SENSOR_ENTRY = Object.freeze({ x: 360170, z: -35 });
export const S11_SHELTER = Object.freeze({ x: 359915, z: 95 });
export const S11_WATERWORKS = Object.freeze({ x: 359650, z: 155 });
export const S11_GALLERY = Object.freeze({ x: 359430, z: 230 });
export const S11_FINISH = Object.freeze({ x: 359270, z: 265 });

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

export function stage11Walk(x, z, radius = 0) {
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

export function stage11SegBlocked(x0, z0, x1, z1, bullet = true) {
    for (const b of blockers) if ((!bullet || b.bullet) && segmentBox(x0, z0, x1, z1, b)) return true;
    for (const t of trunks) if (segmentCircle(x0, z0, x1, z1, t, bullet ? 0 : 2)) return true;
    return false;
}

export function stage11Resolve(pos, radius, feetY = 0) {
    blockerScratch.length = 0;
    for (const b of blockers) blockerScratch.push(b);
    resolveBlockers(pos, radius, feetY, blockerScratch);
    resolveCylinders(pos, radius, trunks);
}

export function stage11GroundHeight() { return GROUND_Y; }
export function stage11Nav() { return nav; }

export function stage11PlayerProtected(x, z) {
    return shelters.some(s => Math.abs(x - s.x) <= s.hx && Math.abs(z - s.z) <= s.hz)
        || denseCanopy.some(s => (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r ** 2);
}

function buildGround() {
    const g = new THREE.Group();
    mesh(g, new THREE.PlaneGeometry(2100, 1500), mat('forestSoil', 0x35432b),
        S11_ORIGIN.x, -1.5, 0, -Math.PI / 2, 0, 0, false, true);
    // Broad terrain facets keep the world filled beyond the route and fog edge.
    for (let i = 0; i < 24; i++) {
        const x = BOUNDS.x0 + 35 + hash(i, 1) * (BOUNDS.x1 - BOUNDS.x0 - 70);
        const z = BOUNDS.z0 + 35 + hash(i, 2) * (BOUNDS.z1 - BOUNDS.z0 - 70);
        const sx = 90 + hash(i, 3) * 210, sz = 60 + hash(i, 4) * 155;
        mesh(g, new THREE.CircleGeometry(1, 9), mat(i % 3 ? 'loam' : 'moss',
            i % 3 ? 0x493a29 : 0x40552f), x, -0.7, z,
        -Math.PI / 2, 0, hash(i, 5) * Math.PI, false, true).scale.set(sx, sz, 1);
    }
    // Service road: segmented to follow the authored route.
    for (let i = 0; i < ROUTE.length - 1; i++) {
        const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz), yaw = Math.atan2(dz, dx);
        mesh(g, new THREE.BoxGeometry(len + 5, 1.2, Math.min(a.w, b.w) * 1.2),
            mat('wetRoad', 0x41413b), (a.x + b.x) / 2, -0.1, (a.z + b.z) / 2,
            0, -yaw, 0, false, true);
        // Split asphalt and repaired concrete seams give scale from above.
        for (let k = 1; k < 5; k++) {
            const t = k / 5;
            mesh(g, new THREE.BoxGeometry(1.1, 0.18, Math.min(a.w, b.w) * 0.96),
                mat('roadSeam', 0x625f55), a.x + dx * t, 0.55, a.z + dz * t,
                0, -yaw, 0, false, false);
        }
    }
    count('broken-asphalt', ROUTE.length - 1); count('terrain-facet', 24);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildDrainage() {
    const g = new THREE.Group();
    for (let i = 0; i < ROUTE.length - 3; i++) {
        const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz), yaw = Math.atan2(dz, dx);
        const nx = -dz / len, nz = dx / len;
        for (const side of [-1, 1]) {
            const off = (Math.min(a.w, b.w) * 0.68 + 5) * side;
            const cx = (a.x + b.x) / 2 + nx * off, cz = (a.z + b.z) / 2 + nz * off;
            mesh(g, new THREE.BoxGeometry(len, 2.0, 6), mat('drainConcrete', PAL.concrete),
                cx, -0.1, cz, 0, -yaw, side * 0.05, false, true);
            mesh(g, new THREE.BoxGeometry(len - 3, 0.35, 3.2), mat('drainWater', 0x294c43),
                cx, 0.95, cz, 0, -yaw, 0, false, false);
        }
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
    count('drainage-channel', (ROUTE.length - 3) * 2);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function treeParts(parent, x, z, scale, type, fadeable = false) {
    const trunkMat = fadeable ? mat(`fade-trunk-${occluderCount}`, PAL.wood,
        { transparent: true }) : mat('trunk', PAL.wood);
    const leafBase = type === 'palm' ? 0x52733a : type === 'bamboo' ? 0x4a6735
        : type === 'fern' ? 0x355e32 : type === 'banana' ? 0x668044 : PAL.leaf;
    const leafMat = fadeable ? mat(`fade-leaf-${occluderCount}`, leafBase,
        { transparent: true }) : mat(`leaf-${type}`, leafBase);
    const h = scale * (type === 'dipterocarp' ? 4.4 : type === 'palm' ? 3.9 : 2.8);
    const group = new THREE.Group();
    if (type === 'bamboo') {
        for (let k = -2; k <= 2; k++) {
            const bx = x + k * scale * 0.25, bz = z + ((k * 7) % 3) * scale * 0.16;
            mesh(group, new THREE.CylinderGeometry(scale * 0.12, scale * 0.16, h, 6),
                trunkMat, bx, h / 2, bz, 0, 0, k * 0.035, false, false);
            mesh(group, new THREE.ConeGeometry(scale * 0.95, scale * 1.8, 7), leafMat,
                bx, h * 0.78, bz, 0, k * 0.5, 0, false, false);
        }
    } else {
        const trunk = mesh(group,
            new THREE.CylinderGeometry(scale * (type === 'dipterocarp' ? 0.36 : 0.24),
                scale * 0.52, h, 7), trunkMat, x, h / 2, z,
            0, hash(Math.floor(x + z), 6) * Math.PI, 0, !fadeable, true);
        void trunk;
        if (type === 'dipterocarp') {
            // Buttress roots make the species readable even under the top-down camera.
            for (let k = 0; k < 5; k++) {
                const a = k * Math.PI * 2 / 5;
                mesh(group, new THREE.BoxGeometry(scale * 1.8, scale * 0.35, scale * 0.32),
                    trunkMat, x + Math.cos(a) * scale * 0.62, scale * 0.25,
                    z + Math.sin(a) * scale * 0.62, 0, -a, 0.18, !fadeable, true);
            }
        }
        if (type === 'palm' || type === 'banana') {
            const leaves = type === 'palm' ? 9 : 7;
            for (let k = 0; k < leaves; k++) {
                const a = k * Math.PI * 2 / leaves;
                const leaf = mesh(group,
                    new THREE.ConeGeometry(scale * 0.58, scale * 4.1, 5), leafMat,
                    x + Math.cos(a) * scale * 1.45, h * 0.92,
                    z + Math.sin(a) * scale * 1.45,
                    Math.PI / 2, a, 0.22, false, false);
                leaf.scale.z = 0.42;
            }
        } else if (type === 'fern') {
            for (let k = 0; k < 8; k++) {
                const a = k * Math.PI / 4;
                mesh(group, new THREE.ConeGeometry(scale * 0.38, scale * 2.5, 5), leafMat,
                    x + Math.cos(a) * scale, scale * 0.9, z + Math.sin(a) * scale,
                    Math.PI / 2, a, 0.35, false, false);
            }
        } else {
            for (const [ox, oy, oz, r] of [[0, .82, 0, 1.9], [-1.0, .76, .4, 1.35],
                [.9, .72, -.5, 1.45], [.25, 1.03, .45, 1.2]])
                mesh(group, new THREE.DodecahedronGeometry(scale * r, 0), leafMat,
                    x + ox * scale, h * oy, z + oz * scale, 0, 0, 0, false, false);
        }
    }
    count(type);
    if (fadeable) {
        parent.add(group);
        // Material pohon hero sudah instans sendiri (`fade-trunk-N`/`fade-leaf-N`),
        // jadi tak perlu diklon lagi oleh pendaftar.
        registerOccluder(STAGE11_LIGHTS_KEY, group,
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
    registerOccluder(STAGE11_LIGHTS_KEY, g, { x, z, radius: 21, top: 19.2 });
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
            x, 11, 268 + (x - 359620) * -.12, 0, -.12, 0, true, true);
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
    registerOccluder(STAGE11_LIGHTS_KEY, intakeNode, { x: 359720, z: 342, radius: 28, top: 44 });
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

    buildShelter(root, S11_SHELTER.x, S11_SHELTER.z, 0.12);
    buildShelter(root, S11_GALLERY.x, S11_GALLERY.z, -0.12, 'control-gallery');
    // Fixed service lights: count is constant throughout the stage.
    for (const p of [S11_SHELTER, S11_GALLERY]) {
        const l = new THREE.PointLight(PAL.amber, 0.8, 85, 2);
        l.position.set(p.x, 13, p.z); root.add(l); lights.push(l);
        registerStageLight(STAGE11_LIGHTS_KEY, l);
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
        registerOccluder(STAGE11_LIGHTS_KEY, node, { x, z, radius: 11, top: 35 });
        occluderCount++;
        addBoxBlocker(x, z, 6, 6, 32, 0, 'sensor-mast');
    }
    count('sensor-mast', 8);
}

function buildCarrierWreck() {
    const g = new THREE.Group(); g.name = 'stage11-armored-carrier-wreck';
    g.position.set(S11_WRECK.x, 0, S11_WRECK.z); g.rotation.y = -0.18;
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
    registerOccluder(STAGE11_LIGHTS_KEY, g,
        { x: S11_WRECK.x, z: S11_WRECK.z, radius: 46, top: 30 });
    occluderCount++;
    addBoxBlocker(S11_WRECK.x, S11_WRECK.z, 70, 22, 30, -0.18, 'carrier-wreck');
    count('carrier-wreck'); count('carrier-wheel', 8); count('carrier-cargo-rib', 5);
    carrier.userData.partCount = 3 + 16 + 10 + 4 + 6;
}

function buildTunnel() {
    const g = new THREE.Group(); g.position.set(S11_FINISH.x, 0, S11_FINISH.z);
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

export function setStage11TunnelOpen(open) {
    if (tunnelDoor) tunnelDoor.position.y = open ? 38 : 14;
}

export function setCarrierWreckBurning(on) {
    if (carrier) carrier.userData.burning = !!on;
}

// Fade occluder kini uji GARIS PANDANG bersama (player DAN robot), bukan lagi
// sekadar jarak ke player — lihat utility/occlusion.js.
export function updateStage11WorldVisuals(dt) {
    updateStageOccluders(STAGE11_LIGHTS_KEY, dt);
}

export function resetStage11WorldVisuals() {
    setStage11TunnelOpen(false); setCarrierWreckBurning(true);
    resetStageOccluders(STAGE11_LIGHTS_KEY);
}

export function ensureStage11World(parent = scene) {
    if (built) return root;
    built = true; root = new THREE.Group(); root.name = 'campaign-stage11-green-firewall';
    parent.add(root);
    buildGround(); buildDrainage(); buildForest(); buildCarrierWreck();
    buildSensorNodes(); buildWaterworks(); buildTunnel();
    nav = makeNavGrid(BOUNDS.x0, BOUNDS.z0, 14,
        Math.ceil((BOUNDS.x1 - BOUNDS.x0) / 14),
        Math.ceil((BOUNDS.z1 - BOUNDS.z0) / 14),
        (x, z) => stage11Walk(x, z, 3.5)
            && !blockers.some(b => segmentBox(x, z, x, z, b, 3.5))
            && !trunks.some(t => (x - t.x) ** 2 + (z - t.z) ** 2 <= (t.r + 3.5) ** 2));
    registerCampaignWorldRoot({
        key: STAGE11_LIGHTS_KEY, root, bounds: { ...BOUNDS },
        lightsKey: STAGE11_LIGHTS_KEY,
        warmupViews: [S11_START, S11_SENSOR_ENTRY, S11_WATERWORKS, S11_FINISH],
    });
    return root;
}

export const stage11WorldDebug = () => ({
    built, origin: { ...S11_ORIGIN }, bounds: { ...BOUNDS }, route: ROUTE.map(p => ({ ...p })),
    start: { ...S11_START }, finish: { ...S11_FINISH }, worldRoot: root?.name || null,
    rawMeshes, weldedMeshes, blockers: blockers.length, trunks: trunks.length,
    vegetationChunks: vegetationChunks.map(c => ({ ...c })),
    vegetationArchetypes: ['dipterocarp', 'palm', 'bamboo', 'fern', 'banana']
        .map(kind => ({ kind, count: semantic.get(kind) || 0 })),
    semantic: Object.fromEntries(semantic), urbanBuildings: 0,
    shelters: shelters.map(s => ({ ...s })), denseCanopy: denseCanopy.map(s => ({ ...s })),
    // Posisi/radius diekspor supaya uji asap bisa berdiri TEPAT di belakang
    // sebuah occluder tanpa menebak koordinat.
    occluders: occlusionDebug(STAGE11_LIGHTS_KEY),
    lights: { key: STAGE11_LIGHTS_KEY, indoor: lights.length, outdoor: 0 },
    carrier: carrier && { persistent: true, solid: true, detailed: true,
        parts: carrier.userData.partCount, burning: !!carrier.userData.burning },
    tunnelOpen: !!tunnelDoor && tunnelDoor.position.y > 20,
    nav: nav && { cols: nav.cols, rows: nav.rows,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});
