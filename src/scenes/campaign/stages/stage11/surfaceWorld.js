// Stage 11 surface — a complete low-poly IKN city-in-forest composition.
// The playable civic axis is surrounded by deterministic semantic districts in
// three depth bands. Far architecture is visual-only and shadowless; authored
// cover and colonnades alone participate in collision/navigation.

import { scene } from '../../../../core/renderer.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStaticShadowAware } from '../../../../utils/meshBatch.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';

export const STAGE11_SURFACE_LIGHTS_KEY = 'campaign-11-surface';
export const S11_SURFACE_ORIGIN = Object.freeze({ x: 390000, z: 0 });
export const S11_SURFACE_START = Object.freeze({ x: 390720, z: -115 });
export const S11_AXIS_GATE = Object.freeze({ x: 390355, z: -35 });
export const S11_ROOT_COURT = Object.freeze({ x: 389430, z: 120 });
export const S11_DESCENT = Object.freeze({ x: 389275, z: 125 });

const BOUNDS = Object.freeze({ x0: 389050, x1: 390900, z0: -850, z1: 850 });
const PLAY = Object.freeze({ x0: 389180, x1: 390800, z0: -220, z1: 260 });
const ARCHETYPES = Object.freeze([
    'civic-palace', 'cultural-hall', 'garden-tower', 'ministry', 'transit-hub',
    'skybridge', 'water-garden', 'colonnade', 'forest-terrace', 'civic-spire',
]);

export const S11_SURFACE_OCC = 'campaign-11-surface';   // utility/occlusion.js
let built = false;
let root = null;
let nav = null;
let descentDoor = null;
let rawMeshes = 0;
let weldedMeshes = 0;
const blockers = [];
const clusters = [];
const chunkStats = [];
const semantic = new Map();
const lights = [];
const mats = {};

function material(name, color, opts = {}) {
    if (!mats[name]) mats[name] = new THREE.MeshLambertMaterial({
        color, emissive: opts.emissive || 0,
        emissiveIntensity: Math.min(EMISSIVE_MAX, opts.emissiveIntensity || 0),
        transparent: !!opts.transparent, opacity: opts.opacity == null ? 1 : opts.opacity,
        depthWrite: opts.depthWrite == null ? true : !!opts.depthWrite,
        flatShading: opts.flatShading == null ? true : !!opts.flatShading,
    });
    return mats[name];
}
function hash(i, salt = 0) {
    let n = Math.imul((i + 11) ^ Math.imul(salt + 7, 0x9e3779b1), 0x85ebca6b);
    n ^= n >>> 16; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}
function count(kind, n = 1) { semantic.set(kind, (semantic.get(kind) || 0) + n); }
function mesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0,
    cast = false, receive = false) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz); m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m); rawMeshes++; return m;
}
function blocker(x, z, hx, hz, top, yaw = 0, kind = 'cover') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    blockers.push({ x, z, hx, hz, top, axx: c, axz: s, azx: -s, azz: c,
        rad: Math.hypot(hx, hz), standable: false, yaw, kind });
}
function pointBlocked(x, z, r = 0) {
    for (const b of blockers) {
        const dx = x - b.x, dz = z - b.z;
        const lx = dx * b.axx + dz * b.axz, lz = dx * b.azx + dz * b.azz;
        if (Math.abs(lx) <= b.hx + r && Math.abs(lz) <= b.hz + r) return true;
    }
    return false;
}
function segBox(x0, z0, x1, z1, b) {
    const dx = x1 - x0, dz = z1 - z0;
    const steps = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 8));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = x0 + dx * t, z = z0 + dz * t;
        const qx = x - b.x, qz = z - b.z;
        if (Math.abs(qx * b.axx + qz * b.axz) <= b.hx
            && Math.abs(qx * b.azx + qz * b.azz) <= b.hz) return true;
    }
    return false;
}

export function stage11SurfaceWalk(x, z, r = 0) {
    return x >= PLAY.x0 + r && x <= PLAY.x1 - r
        && z >= PLAY.z0 + r && z <= PLAY.z1 - r;
}
export function stage11SurfaceResolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
}
export function stage11SurfaceSegBlocked(x0, z0, x1, z1) {
    return blockers.some(b => segBox(x0, z0, x1, z1, b));
}
export function stage11SurfaceGroundHeight() { return 0; }
export function stage11SurfaceNav() { return nav; }

function buildTerrainAndAxis() {
    const g = new THREE.Group();
    mesh(g, new THREE.PlaneGeometry(2250, 1850), material('greenGround', 0x4a603b),
        S11_SURFACE_ORIGIN.x, -1.4, 0, -Math.PI / 2, 0, 0, false, true);
    // Ceremonial axis: pale paving, red-white restrained datum strips and
    // tiered planted shoulders. It spans the entire playable route.
    mesh(g, new THREE.BoxGeometry(1710, 2, 300), material('axisStone', PAL.panel),
        389985, 0, 20, 0, -.035, 0, false, true);
    mesh(g, new THREE.BoxGeometry(1710, 1, 84), material('axisCenter', 0xa49f92),
        389985, 1.2, 20, 0, -.035, 0, false, true);
    for (const s of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(1710, 1.2, 5), material('nationalRed', PAL.hazard),
            389985, 1.8, 20 + s * 48, 0, -.035, 0, false, false);
        mesh(g, new THREE.BoxGeometry(1710, 1.2, 5), material('nationalWhite', PAL.white),
            389985, 1.8, 20 + s * 56, 0, -.035, 0, false, false);
    }
    // Terraced landscape on both sides creates a city built with the forest,
    // rather than generic towers dropped on flat asphalt.
    for (let band = 0; band < 5; band++) for (const side of [-1, 1]) {
        const z = side * (215 + band * 95);
        mesh(g, new THREE.BoxGeometry(1840 - band * 85, 8 + band * 4, 82),
            material(`terrace-${band}`, band % 2 ? 0x66705c : 0x77806a),
            389980, 2 + band * 2, z, 0, 0, side * .015, false, true);
        mesh(g, new THREE.BoxGeometry(1800 - band * 90, 2, 62),
            material(`terrace-green-${band}`, band % 2 ? 0x486438 : 0x557347),
            389980, 7 + band * 4, z, 0, 0, 0, false, true);
        count('landscape-terrace');
    }
    // Water gardens alongside the civic plaza, simple stable water surfaces.
    for (const x of [390280, 389890, 389540]) for (const s of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(150, 3, 64), material('waterBasin', PAL.concrete),
            x, 1, s * 142, 0, 0, 0, false, true);
        mesh(g, new THREE.PlaneGeometry(138, 52), material('water', 0x476b63),
            x, 2.6, s * 142, -Math.PI / 2, 0, 0, false, false);
        for (let k = -2; k <= 2; k++)
            mesh(g, new THREE.BoxGeometry(14, 3, 14), material('steppingStone', PAL.panel),
                x + k * 25, 3.1, s * 142, 0, 0, 0, false, true);
        count('water-garden');
    }
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function addCivicCover() {
    // Cover & kolonade adalah penghalang pandangan utama di permukaan IKN, jadi
    // tiap potong berdiri sendiri (dilas ke dalam dirinya) supaya bisa memudar.
    for (let i = 0; i < 14; i++) {
        const x = 390560 - i * 84, z = i % 2 ? 118 : -84;
        const g = new THREE.Group();
        mesh(g, new THREE.BoxGeometry(34, 11, 14), material('integratedCover', PAL.concrete),
            x, 5.5, z, 0, -.035, 0, true, true);
        mesh(g, new THREE.BoxGeometry(28, 2, 18), material('coverPlanter', 0x526746),
            x, 11, z, 0, -.035, 0, false, true);
        for (let k = -2; k <= 2; k++)
            mesh(g, new THREE.DodecahedronGeometry(3.4, 0), material('coverShrub', PAL.leaf),
                x + k * 5, 16 + Math.abs(k % 2), z, 0, 0, 0, false, false);
        weldOccluder(S11_SURFACE_OCC, root, g, { x, z, radius: 18, top: 18 });
        blocker(x, z, 17, 7, 13, -.035, 'landscape-cover');
    }
    // Administrative colonnade is both place-defining architecture and cover.
    for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
        const x = 390410 - i * 47, z = side * 195;
        const g = new THREE.Group();
        mesh(g, new THREE.CylinderGeometry(5, 7, 36, 8), material('column', PAL.panel),
            x, 18, z, 0, 0, 0, true, true);
        mesh(g, new THREE.BoxGeometry(42, 4, 20), material('colonnadeBeam', PAL.concrete),
            x, 37, z, 0, 0, 0, true, true);
        weldOccluder(S11_SURFACE_OCC, root, g, { x, z, radius: 21, top: 39 });
        blocker(x, z, 7, 7, 36, 0, 'colonnade');
    }
    count('integrated-cover', 14); count('colonnade', 24);
}

function clusterShell(type, x, z, scale, band, id) {
    const g = new THREE.Group();
    const pale = material('civicPale', 0xc2bcae);
    const concrete = material('civicConcrete', PAL.concrete);
    const dark = material('civicDark', PAL.gunmetal);
    const glass = material('civicGlass', 0x284d49, { emissive: PAL.techDim, emissiveIntensity: .2 });
    const roof = material('culturalRoof', 0x5b4d3b);
    const leaf = material('towerLeaf', PAL.leaf);
    const top = band === 0 ? 42 + hash(id, 1) * 28
        : band === 1 ? 85 + hash(id, 2) * 85 : 150 + hash(id, 3) * 155;
    const w = scale * (1.1 + hash(id, 4) * .8), d = scale * (.8 + hash(id, 5) * .65);
    if (type === 'civic-palace') {
        mesh(g, new THREE.BoxGeometry(w * 1.8, top * .34, d), pale, x, top * .17, z);
        for (const s of [-1, 1])
            mesh(g, new THREE.BoxGeometry(w * .75, top * .44, d * .72), concrete,
                x + s * w * .85, top * .22, z + d * .16);
        mesh(g, new THREE.ConeGeometry(w * .62, top * .38, 7), roof,
            x, top * .53, z, 0, 0, 0, false, false);
        for (let k = -3; k <= 3; k++)
            mesh(g, new THREE.CylinderGeometry(2, 2.8, top * .30, 7), pale,
                x + k * w * .18, top * .18, z - d * .53, 0, 0, 0, false, false);
    } else if (type === 'cultural-hall') {
        mesh(g, new THREE.BoxGeometry(w * 1.6, top * .35, d * 1.3), concrete,
            x, top * .175, z);
        for (const s of [-1, 1])
            mesh(g, new THREE.ConeGeometry(w * .72, top * .45, 6), roof,
                x + s * w * .42, top * .53, z, 0, s * .2, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.25, top * .13, d * 1.48), pale,
            x, top * .40, z, 0, 0, 0, false, false);
    } else if (type === 'garden-tower') {
        const tiers = band + 4;
        for (let t = 0; t < tiers; t++) {
            const tw = w * (1 - t * .09), th = top / tiers;
            mesh(g, new THREE.BoxGeometry(tw, th * .8, d * (1 - t * .06)),
                t % 2 ? pale : concrete, x + (t % 2 ? w * .08 : -w * .05),
                th * (t + .42), z, 0, t * .05, 0, false, false);
            mesh(g, new THREE.BoxGeometry(tw * 1.08, th * .08, d * 1.06), leaf,
                x, th * (t + .82), z, 0, 0, 0, false, false);
        }
    } else if (type === 'ministry') {
        mesh(g, new THREE.BoxGeometry(w, top, d), concrete, x, top / 2, z);
        for (let t = 0; t < 5; t++)
            mesh(g, new THREE.BoxGeometry(w * 1.05, 2.2, d * 1.05), pale,
                x, top * (.14 + t * .17), z, 0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * .72, top * .76, d * 1.03), glass,
            x - w * .06, top * .49, z - d * .02, 0, 0, 0, false, false);
    } else if (type === 'transit-hub') {
        mesh(g, new THREE.BoxGeometry(w * 1.7, top * .28, d * 1.5), dark,
            x, top * .14, z);
        for (const s of [-1, 1])
            mesh(g, new THREE.BoxGeometry(w * .18, top * .56, d * 1.25), pale,
                x + s * w * .62, top * .28, z, 0, 0, s * .12, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.55, top * .10, d * 1.72), glass,
            x, top * .49, z, 0, 0, 0, false, false);
    } else if (type === 'skybridge') {
        for (const s of [-1, 1])
            mesh(g, new THREE.BoxGeometry(w * .48, top, d), concrete,
                x + s * w * .42, top / 2, z);
        mesh(g, new THREE.BoxGeometry(w, top * .18, d * .58), glass,
            x, top * .62, z, 0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.08, 3, d * .72), pale,
            x, top * .72, z, 0, 0, 0, false, false);
    } else if (type === 'water-garden') {
        mesh(g, new THREE.BoxGeometry(w * 1.6, 5, d * 1.5), pale, x, 2.5, z);
        mesh(g, new THREE.PlaneGeometry(w * 1.35, d * 1.22), material('clusterWater', 0x476b63),
            x, 5.2, z, -Math.PI / 2, 0, 0, false, false);
        for (let k = 0; k < 7; k++)
            mesh(g, new THREE.CylinderGeometry(2.4, 3.3, 10 + k, 7), leaf,
                x - w * .55 + k * w * .18, 9, z + (k % 2 ? d * .34 : -d * .32));
    } else if (type === 'colonnade') {
        mesh(g, new THREE.BoxGeometry(w * 1.7, 5, d), pale, x, top, z);
        for (let k = -4; k <= 4; k++)
            mesh(g, new THREE.CylinderGeometry(2.2, 3, top, 8), pale,
                x + k * w * .18, top / 2, z);
        mesh(g, new THREE.BoxGeometry(w * 1.8, 4, d * 1.15), concrete,
            x, 2, z);
    } else if (type === 'forest-terrace') {
        for (let t = 0; t < 5; t++) {
            mesh(g, new THREE.BoxGeometry(w * (1 - t * .10), 8, d * (1 - t * .08)),
                concrete, x, 4 + t * 8, z + t * d * .06);
            mesh(g, new THREE.BoxGeometry(w * (1 - t * .12), 2, d * .45), leaf,
                x, 9 + t * 8, z - d * .28);
        }
    } else {
        mesh(g, new THREE.CylinderGeometry(w * .30, w * .43, top * .82, 8), pale,
            x, top * .41, z);
        mesh(g, new THREE.ConeGeometry(w * .34, top * .24, 7), roof,
            x, top * .94, z);
        for (let k = 0; k < 4; k++)
            mesh(g, new THREE.TorusGeometry(w * (.24 + k * .035), 1.8, 6, 16), dark,
                x, top * (.22 + k * .15), z, Math.PI / 2, 0, 0, false, false);
    }
    count(type);
    clusters.push({ id, type, band, x, z, top, rawParts: g.children.length });
    return g;
}

function buildMegacity() {
    // 72 authored deterministic clusters, 24 per depth band. Near band stays
    // lower than far civic skyline so the top-down camera cannot be blinded.
    const chunks = new Map();
    for (let band = 0; band < 3; band++) {
        for (let i = 0; i < 24; i++) {
            const id = band * 24 + i;
            const side = i % 2 ? 1 : -1;
            const x = 390800 - (i % 12) * 145 - band * 24 + (hash(id, 20) - .5) * 48;
            const baseZ = band === 0 ? 315 : band === 1 ? 515 : 720;
            const z = side * (baseZ + hash(id, 21) * (band === 2 ? 100 : 75));
            const type = ARCHETYPES[(id * 7 + band * 3) % ARCHETYPES.length];
            const scale = 34 + band * 15 + hash(id, 22) * 26;
            const chunkId = `${band}-${Math.floor((x - BOUNDS.x0) / 320)}`;
            let chunk = chunks.get(chunkId);
            if (!chunk) { chunk = { group: new THREE.Group(), ids: [], raw0: rawMeshes }; chunks.set(chunkId, chunk); }
            chunk.group.add(clusterShell(type, x, z, scale, band, id)); chunk.ids.push(id);
        }
    }
    for (const [id, chunk] of chunks) {
        const out = addMergedStaticShadowAware(root, [chunk.group]); weldedMeshes += out.length;
        chunkStats.push({ id, clusters: chunk.ids.length, raw: rawMeshes - chunk.raw0,
            batches: out.length });
    }

    // Transit viaduct binds the districts into one city rather than isolated
    // decorative towers. Train silhouette and piers are all static backdrop.
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
        const z = side * 405;
        mesh(g, new THREE.BoxGeometry(1780, 10, 20), material('viaduct', PAL.concrete),
            389990, 66, z, 0, 0, 0, false, false);
        for (let i = 0; i < 15; i++)
            mesh(g, new THREE.BoxGeometry(12, 66, 12), material('viaductPier', PAL.panel),
                390730 - i * 110, 33, z, 0, 0, 0, false, false);
        for (let car = 0; car < 5; car++) {
            mesh(g, new THREE.BoxGeometry(46, 13, 16), material('transitCar', PAL.gunmetal),
                390190 + car * 49, 78, z, 0, 0, 0, false, false);
            mesh(g, new THREE.BoxGeometry(32, 5, 16.4), material('transitGlass', 0x315651,
                { emissive: PAL.techDim, emissiveIntensity: .24 }),
            390190 + car * 49, 80, z, 0, 0, 0, false, false);
        }
        count('transit-viaduct'); count('transit-car', 5);
    }
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildRootCourt() {
    const g = new THREE.Group();
    mesh(g, new THREE.CylinderGeometry(170, 190, 11, 20), material('courtPlinth', PAL.concrete),
        S11_ROOT_COURT.x, 4, S11_ROOT_COURT.z, 0, 0, 0, true, true);
    mesh(g, new THREE.TorusGeometry(118, 8, 8, 28), material('courtRing', PAL.panel),
        S11_ROOT_COURT.x, 11, S11_ROOT_COURT.z, Math.PI / 2, 0, 0, true, true);
    for (let i = 0; i < 12; i++) {
        const a = i * Math.PI * 2 / 12, x = S11_ROOT_COURT.x + Math.cos(a) * 145;
        const z = S11_ROOT_COURT.z + Math.sin(a) * 145;
        mesh(g, new THREE.BoxGeometry(14, 46, 14), material('courtPylon', PAL.panel),
            x, 28, z, 0, -a, 0, true, true);
        mesh(g, new THREE.BoxGeometry(8, 25, 18), material('courtInset', PAL.techDim,
            { emissive: PAL.techDim, emissiveIntensity: .45 }), x, 31, z,
        0, -a, 0, false, false);
        if (i !== 6) blocker(x, z, 8, 8, 51, 0, 'root-court-pylon');
    }
    // Monumental iris descent gate with layered ribs and an authority bridge.
    for (let i = 0; i < 7; i++) {
        const a = -1.1 + i * .36;
        mesh(g, new THREE.BoxGeometry(16, 58, 8), material('descentRib', PAL.gunmetal),
            S11_DESCENT.x, 29, S11_DESCENT.z, 0, 0, a, true, true);
    }
    descentDoor = mesh(g, new THREE.CylinderGeometry(44, 44, 8, 16),
        material('descentDoor', PAL.gunmetal), S11_DESCENT.x, 4, S11_DESCENT.z,
        Math.PI / 2, 0, 0, true, true);
    mesh(g, new THREE.BoxGeometry(210, 5, 38), material('authorityBridge', PAL.panel),
        389360, 7, 125, 0, 0, 0, true, true);
    count('root-access-court'); count('authority-bridge'); count('descent-iris');
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
    for (const p of [{ x: 389430, z: 40 }, { x: 389430, z: 200 }]) {
        const l = new THREE.PointLight(PAL.amber, .7, 90, 2);
        l.position.set(p.x, 26, p.z); root.add(l); lights.push(l);
        registerStageLight(STAGE11_SURFACE_LIGHTS_KEY, l);
    }
}

export function setStage11DescentOpen(open) {
    if (descentDoor) descentDoor.position.y = open ? -12 : 4;
}
export function resetStage11SurfaceVisuals() {
    setStage11DescentOpen(false);
    resetStageOccluders(S11_SURFACE_OCC);
}

// Dipanggil tiap frame dari sub-scene permukaan.
export function updateStage11SurfaceVisuals(dt) {
    updateStageOccluders(S11_SURFACE_OCC, dt);
}

export const stage11SurfaceOcclusionDebug = () => occlusionDebug(S11_SURFACE_OCC);

export function ensureStage11SurfaceWorld(parent = scene) {
    if (built) return root;
    built = true; root = new THREE.Group(); root.name = 'campaign-stage11-ikn-surface';
    parent.add(root);
    buildTerrainAndAxis(); addCivicCover(); buildMegacity(); buildRootCourt();
    nav = makeNavGrid(PLAY.x0, PLAY.z0, 14,
        Math.ceil((PLAY.x1 - PLAY.x0) / 14), Math.ceil((PLAY.z1 - PLAY.z0) / 14),
        (x, z) => stage11SurfaceWalk(x, z, 3.5) && !pointBlocked(x, z, 3.5));
    registerCampaignWorldRoot({ key: STAGE11_SURFACE_LIGHTS_KEY, root,
        bounds: { ...BOUNDS }, lightsKey: STAGE11_SURFACE_LIGHTS_KEY,
        warmupViews: [S11_SURFACE_START, S11_AXIS_GATE, S11_ROOT_COURT],
    });
    return root;
}

export const stage11SurfaceWorldDebug = () => ({
    occluders: occlusionDebug(S11_SURFACE_OCC),
    built, root: root?.name || null, origin: { ...S11_SURFACE_ORIGIN }, bounds: { ...BOUNDS },
    playBounds: { ...PLAY }, start: { ...S11_SURFACE_START }, descent: { ...S11_DESCENT },
    rawMeshes, weldedMeshes, blockerCount: blockers.length,
    clusters: clusters.map(c => ({ ...c })), clusterCount: clusters.length,
    depthBands: [...new Set(clusters.map(c => c.band))], archetypes: [...ARCHETYPES],
    archetypeCounts: ARCHETYPES.map(type => ({ type, count: semantic.get(type) || 0 })),
    chunks: chunkStats.map(c => ({ ...c })), semantic: Object.fromEntries(semantic),
    lights: { key: STAGE11_SURFACE_LIGHTS_KEY, count: lights.length },
    cameraSideMaxTop: clusters.filter(c => c.band === 0)
        .reduce((n, c) => Math.max(n, c.top), 0),
    farMaxTop: clusters.filter(c => c.band === 2).reduce((n, c) => Math.max(n, c.top), 0),
    descentOpen: !!descentDoor && descentDoor.position.y < 0,
    nav: nav && { cols: nav.cols, rows: nav.rows,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});

