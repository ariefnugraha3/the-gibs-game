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
import {
    ensureStage11SurfaceAuthority, stage11SurfaceAuthorityDebug,
} from './surfaceAuthority.js';
import {
    ensureStage11SurfaceScan, stage11SurfaceScanDebug,
} from './surfaceScan.js';
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
// Widened 2026-08-30: the old -220..260 lane was 69 m of bare rectangle with
// every water garden, terrace and colonnade sitting OUTSIDE it. The corridor now
// reaches the inner terrace face on both sides, so the plaza's own geography is
// what the fight is fought through rather than scenery beside a lane.
const PLAY = Object.freeze({ x0: 389180, x1: 390800, z0: -300, z1: 300 });

// TERRACED HIGH GROUND (2026-08-30). The chapter was flat in the literal sense:
// the walk box was 69 m of bare rectangle and `groundHeight` returned a constant
// 0, so every terrace, water garden and colonnade the world draws was scenery
// the player could never stand on. The flanking bank is now a real firing step
// 20 units (2.9 m) above the plaza, reached by a ceremonial stair.
//
// The height field is STEPPED to exactly the drawn steps rather than smoothed
// over them, so what is drawn is what is stood on. Stepping up needs no jump:
// `updatePlayer` snaps feet to `groundHeight` whenever the fall would take them
// below it, so a 3.3-unit riser is climbed simply by walking into it.
const TERRACE_INNER = 210, TERRACE_PLATEAU = 256, TERRACE_TOP = 20;
const TERRACE_STEPS = 6;
const STEP_DEPTH = (TERRACE_PLATEAU - TERRACE_INNER) / TERRACE_STEPS;
const STEP_RISE = TERRACE_TOP / TERRACE_STEPS;
export function stage11SurfaceTerraceHeight(z) {
    const a = Math.abs(z);
    if (a <= TERRACE_INNER) return 0;
    if (a >= TERRACE_PLATEAU) return TERRACE_TOP;
    return Math.min(TERRACE_TOP,
        Math.floor((a - TERRACE_INNER) / STEP_DEPTH + 1) * STEP_RISE);
}
export const STAGE11_TERRACE = Object.freeze({
    inner: TERRACE_INNER, plateau: TERRACE_PLATEAU, top: TERRACE_TOP,
    steps: TERRACE_STEPS, stepDepth: STEP_DEPTH, stepRise: STEP_RISE,
});
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
const terraceSteps = [];
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

// The civic lockdown is a DRAWN curtain standing on exactly this line, so the
// moving east boundary is a visible wall and never an invisible one.
let lockdownLimit = PLAY.x1;
export function setStage11SurfaceLockdown(x) {
    lockdownLimit = Math.max(PLAY.x0 + 60, Math.min(PLAY.x1, x));
}
export const stage11SurfaceLockdownLimit = () => lockdownLimit;
export function stage11SurfaceWalk(x, z, r = 0) {
    return x >= PLAY.x0 + r && x <= lockdownLimit - r
        && z >= PLAY.z0 + r && z <= PLAY.z1 - r;
}
export function stage11SurfaceResolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
}
export function stage11SurfaceSegBlocked(x0, z0, x1, z1) {
    return blockers.some(b => segBox(x0, z0, x1, z1, b));
}
export function stage11SurfaceGroundHeight(x, z) { return stage11SurfaceTerraceHeight(z); }
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
    // A ceremonial plaza is PAVED, not poured: shallow joint lines break a
    // 1710-unit blank slab into readable bays and give the eye a sense of scale
    // as the player crosses it. Purely inset marks -- no collision, no height.
    for (let i = 0; i <= 34; i++)
        mesh(g, new THREE.BoxGeometry(1.4, .6, 296), material('paveJoint', 0x9a9488),
            390840 - i * 50, 1.3, 20, 0, -.035, 0, false, false);
    for (const dz of [-118, -58, 98, 158])
        mesh(g, new THREE.BoxGeometry(1700, .6, 1.4), material('paveJoint', 0x9a9488),
            389985, 1.3, 20 + dz, 0, -.035, 0, false, false);
    for (const s of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(1710, 1.2, 5), material('nationalRed', PAL.hazard),
            389985, 1.8, 20 + s * 48, 0, -.035, 0, false, false);
        mesh(g, new THREE.BoxGeometry(1710, 1.2, 5), material('nationalWhite', PAL.white),
            389985, 1.8, 20 + s * 56, 0, -.035, 0, false, false);
    }
    // Playable bank: a ceremonial stair up to a planted firing step. Each riser
    // is drawn at exactly the height `stage11SurfaceTerraceHeight` reports for
    // its own tread, so the geometry and the walk surface cannot disagree.
    for (const side of [-1, 1]) {
        for (let s = 0; s < TERRACE_STEPS; s++) {
            const zc = side * (TERRACE_INNER + (s + .5) * STEP_DEPTH);
            const top = (s + 1) * STEP_RISE;
            mesh(g, new THREE.BoxGeometry(1840, top, STEP_DEPTH + .4),
                material(`terraceStep-${s % 2}`, s % 2 ? 0x66705c : 0x77806a),
                389980, top / 2, zc, 0, 0, 0, false, true);
            // Recorded from the transform that was actually built, so the
            // drawn tread and the walk surface are one measurement.
            terraceSteps.push({ z: zc, drawnTop: top / 2 + top / 2,
                fieldTop: stage11SurfaceTerraceHeight(zc) });
            count('terrace-step');
        }
        const zp = side * (TERRACE_PLATEAU + 52);
        mesh(g, new THREE.BoxGeometry(1840, TERRACE_TOP, 104),
            material('terracePlateau', 0x77806a), 389980, TERRACE_TOP / 2, zp,
            0, 0, 0, false, true);
        terraceSteps.push({ z: zp, drawnTop: TERRACE_TOP,
            fieldTop: stage11SurfaceTerraceHeight(zp) });
        mesh(g, new THREE.BoxGeometry(1790, 1.2, 88),
            material('terraceGreen', 0x557347), 389980, TERRACE_TOP + .6, zp,
            0, 0, 0, false, true);
        count('landscape-terrace');
    }
    // Outer decor bands keep rising away from the axis, so the landscape reads
    // as built up into the forest rather than stepping back down again.
    for (let band = 1; band < 5; band++) for (const side of [-1, 1]) {
        const z = side * (400 + band * 95), h = TERRACE_TOP + band * 6;
        mesh(g, new THREE.BoxGeometry(1840 - band * 85, h, 82),
            material(`terrace-${band}`, band % 2 ? 0x66705c : 0x77806a),
            389980, h / 2, z, 0, 0, side * .015, false, true);
        mesh(g, new THREE.BoxGeometry(1800 - band * 90, 2, 62),
            material(`terrace-green-${band}`, band % 2 ? 0x486438 : 0x557347),
            389980, h + 1, z, 0, 0, 0, false, true);
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
    buildPlazaInlay(g);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
    buildPromenade();
}

// Plaza dressing, split by ONE rule: anything with VOLUME stands outside the
// walk bounds, anything inside them is FLAT. A drawn prop the player can walk
// straight through is exactly the "what is drawn is what blocks" violation the
// campaign forbids, and the fight's cover is authored separately in
// addCivicCover() and must not move. So the promenade furniture lives on the
// terrace bank just past `PLAY.z`, where a player standing on the high ground
// still sees it at arm's length, and the plaza floor gets inlay only.
// Zero blockers, zero nav cells, zero PointLights.
const PROMENADE_Z = 316, PROMENADE_Y = TERRACE_TOP;
// Measured from the transforms that were actually built, so the flat-inside /
// volume-outside rule is a measurement rather than a comment.
let promenadeMinAbsZ = Infinity, inlayMaxY = 0;

function buildPlazaInlay(g) {
    // Measure only what THIS function appends: it shares the terrain group, so
    // walking every child would report the terrace tops instead of the inlay.
    const first = g.children.length;
    // Flat civic inlay: light strips down both edges of the ceremonial paving
    // and a kerb around each water garden. Sits a hair above the slab, so it
    // can never be stood on, walked into, or z-fight the pavement.
    const strip = material('civicStrip', PAL.techDim,
        { emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * .38 });
    for (const s of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(1690, .5, 3.2), strip,
            389985, 1.5, 20 + s * 132, 0, -.035, 0, false, false);
        count('civic-light-strip');
    }
    for (const x of [390280, 389890, 389540]) for (const s of [-1, 1]) {
        for (const e of [-1, 1])
            mesh(g, new THREE.BoxGeometry(158, .8, 3), material('civicKerb', PAL.panel),
                x, 1.6, s * 142 + e * 34, 0, 0, 0, false, false);
        count('water-garden-kerb');
    }
    // Transit apron marking: the plaza reads as a working civic surface with
    // a shuttle lane, not a blank parade ground.
    for (let i = 0; i < 26; i++)
        mesh(g, new THREE.BoxGeometry(28, .6, 2.2), material('laneMark', 0xb0a893),
            390720 - i * 62, 1.5, 20 - 108, 0, -.035, 0, false, false);
    count('shuttle-lane');
    for (let i = first; i < g.children.length; i++)
        inlayMaxY = Math.max(inlayMaxY, g.children[i].position.y);
}

function buildPromenade() {
    const g = new THREE.Group();
    const M = cityMats();
    const mast = material('civicMast', PAL.steel);
    const strip = material('civicStrip', PAL.techDim,
        { emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * .38 });
    const amber = material('civicAmber', PAL.amberDim,
        { emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * .34 });
    const Y = PROMENADE_Y;
    // Lighting masts along the top of both terrace banks. Emissive heads only:
    // the stage's PointLight count is a fixed contract.
    for (let i = 0; i < 20; i++) {
        const x = 390780 - i * 88;
        for (const s of [-1, 1]) {
            const z = s * PROMENADE_Z;
            mesh(g, new THREE.CylinderGeometry(1.1, 1.8, 34, 6), mast, x, Y + 17, z);
            mesh(g, new THREE.BoxGeometry(3, 2.2, 15), mast, x, Y + 34, z - s * 5,
                0, 0, 0, false, false);
            mesh(g, new THREE.BoxGeometry(2.2, .8, 12), amber, x, Y + 32.8, z - s * 5,
                0, 0, 0, false, false);
            mesh(g, new THREE.BoxGeometry(.9, 16, .9), strip, x + 1.3, Y + 16, z,
                0, 0, 0, false, false);
        }
        count('civic-light-mast', 2);
    }
    // Planted avenue behind the masts: low-poly rain trees, the tropical
    // capital's own street section rather than generic shrub blobs.
    for (let i = 0; i < 26; i++) {
        const x = 390760 - i * 68;
        for (const s of [-1, 1]) {
            const z = s * (PROMENADE_Z + 26 + hash(i * 2 + (s > 0 ? 1 : 0), 31) * 12);
            const h = 26 + hash(i, 32) * 14;
            mesh(g, new THREE.CylinderGeometry(1.5, 2.4, h, 6),
                material('avenueTrunk', PAL.wood), x, Y + h / 2, z);
            for (let c = 0; c < 3; c++)
                mesh(g, new THREE.CylinderGeometry(11 - c * 3, 13 - c * 3, 4, 7),
                    material('avenueLeaf', PAL.leaf), x, Y + h + c * 3.4, z,
                    0, c * .5, 0, false, false);
        }
        count('avenue-tree', 2);
    }
    // Information totems: civic STATUS surfaces, never place-name signage.
    for (let i = 0; i < 8; i++) {
        const x = 390700 - i * 190, z = (i % 2 ? 1 : -1) * (PROMENADE_Z - 8);
        mesh(g, new THREE.BoxGeometry(3, 16, 9), mast, x, Y + 8, z);
        mesh(g, new THREE.BoxGeometry(1.2, 11, 7), strip, x + 1.9, Y + 9.5, z,
            0, 0, 0, false, false);
        count('civic-totem');
    }
    // Parked autonomous shuttles: the plaza reads as a place people were using
    // minutes ago, not an empty monument.
    for (let i = 0; i < 6; i++) {
        const x = 390660 - i * 210;
        const z = (i % 2 ? -1 : 1) * (PROMENADE_Z + 14);
        const yaw = (i % 2 ? .06 : -.06);
        mesh(g, new THREE.BoxGeometry(30, 7, 12), M.pale, x, Y + 5.6, z, 0, yaw, 0);
        mesh(g, new THREE.BoxGeometry(24, 4.6, 12.4), M.litGlass, x, Y + 9.4, z,
            0, yaw, 0, false, false);
        mesh(g, new THREE.BoxGeometry(31, 1.6, 12.6), M.solar, x, Y + 12.2, z,
            0, yaw, 0, false, false);
        for (const s of [-1, 1])
            mesh(g, new THREE.CylinderGeometry(2.4, 2.4, 2, 8),
                material('shuttleTyre', PAL.rubber), x + s * 10, Y + 2.2, z,
                Math.PI / 2, 0, 0, false, false);
        count('civic-shuttle');
    }
    for (const c of g.children)
        promenadeMinAbsZ = Math.min(promenadeMinAbsZ, Math.abs(c.position.z));
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
        // Two low-poly trees plus a hedge run, so the piece of cover the player
        // actually crouches behind reads as a civic planter and not a lump.
        for (const k of [-1, 1]) {
            mesh(g, new THREE.CylinderGeometry(1.1, 1.7, 9, 6),
                material('coverTrunk', PAL.wood), x + k * 9, 16.5, z);
            for (let c = 0; c < 2; c++)
                mesh(g, new THREE.CylinderGeometry(6 - c * 2, 7.5 - c * 2, 3, 7),
                    material('coverShrub', PAL.leaf), x + k * 9, 21.5 + c * 2.6, z,
                    0, c * .6, 0, false, false);
        }
        mesh(g, new THREE.BoxGeometry(22, 3.4, 12), material('coverHedge', 0x486438),
            x, 13.7, z, 0, -.035, 0, false, false);
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
        // Solar canopy over the arcade plus a status strip on its underside:
        // decoration welded INTO the same occluder group, so it fades with the
        // column instead of hanging in the air when the player walks behind it.
        mesh(g, new THREE.BoxGeometry(46, 1.6, 26), material('civicSolar', PAL.ink),
            x, 40.4, z, 0, 0, side * .05, false, false);
        mesh(g, new THREE.BoxGeometry(30, .9, 3), material('civicStrip', PAL.techDim,
            { emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * .38 }),
        x, 34.6, z - side * 9, 0, 0, 0, false, false);
        weldOccluder(S11_SURFACE_OCC, root, g, { x, z, radius: 21, top: 39 });
        blocker(x, z, 7, 7, 36, 0, 'colonnade');
    }
    count('integrated-cover', 14); count('colonnade', 24);
}

// --- 2045 civic language ------------------------------------------------------
//
// One vocabulary shared by every archetype, so the skyline reads as ONE city
// instead of ten unrelated props: a warm pale/concrete structural mass, a
// REPEATED horizontal glazing band in the single civic teal, planted setbacks,
// and dark solar louvres. Pitched tile roofs, pagoda ring stacks and cone caps
// are deliberately gone -- they read as a heritage complex, not a capital built
// in 2045.
function cityMats() {
    return {
        pale: material('civicPale', 0xc2bcae),
        concrete: material('civicConcrete', PAL.concrete),
        dark: material('civicDark', PAL.gunmetal),
        steel: material('civicSteel', PAL.steel),
        // The ONE environment accent. Emissive stays well under EMISSIVE_MAX so
        // a glazed city reads as lit rather than as neon.
        glass: material('civicGlass', PAL.screenBg,
            { emissive: PAL.techDim, emissiveIntensity: .34 }),
        litGlass: material('civicGlassLit', PAL.screenBg,
            { emissive: PAL.tech, emissiveIntensity: .30 }),
        solar: material('civicSolar', PAL.ink),
        leaf: material('towerLeaf', PAL.leaf),
    };
}
// Horizontal curtain-wall bands, drawn a touch PROUD of the mass so they read
// as glazing on the facade rather than a stripe painted onto it. Lit and unlit
// bands alternate on a deterministic hash, which is what stops a repeated
// archetype from looking like the same building copied down the street.
function glazingBands(g, x, z, w, d, y0, y1, bands, M, id = 0) {
    const span = Math.max(1, y1 - y0), h = span / bands;
    for (let i = 0; i < bands; i++)
        mesh(g, new THREE.BoxGeometry(w * 1.02, h * .52, d * 1.02),
            hash(id, 60 + i) > .45 ? M.litGlass : M.glass,
            x, y0 + h * (i + .5), z, 0, 0, 0, false, false);
}
// Vertical sun louvres: the tropical-capital detail that reads instantly as
// built FOR this climate, and breaks a flat box silhouette from above.
function briseSoleil(g, x, z, w, d, y, h, n, M) {
    for (let i = 0; i < n; i++)
        mesh(g, new THREE.BoxGeometry(w * .035, h, d * .10), M.solar,
            x - w * .5 + w * ((i + .5) / n), y, z + d * .54, 0, 0, 0, false, false);
}
function plantedLip(g, x, z, w, d, y, M) {
    mesh(g, new THREE.BoxGeometry(w * 1.12, 1.6, d * 1.12), M.concrete,
        x, y, z, 0, 0, 0, false, false);
    mesh(g, new THREE.BoxGeometry(w * 1.06, 2.2, d * 1.06), M.leaf,
        x, y + 1.7, z, 0, 0, 0, false, false);
}

function clusterShell(type, x, z, scale, band, id) {
    const g = new THREE.Group();
    const M = cityMats();
    const top = band === 0 ? 42 + hash(id, 1) * 28
        : band === 1 ? 85 + hash(id, 2) * 85 : 150 + hash(id, 3) * 155;
    const w = scale * (1.1 + hash(id, 4) * .8), d = scale * (.8 + hash(id, 5) * .65);
    if (type === 'civic-palace') {
        // Assembly hall: broad podium, stepped octagonal drum, glazed clerestory.
        mesh(g, new THREE.BoxGeometry(w * 1.9, top * .22, d * 1.35), M.pale,
            x, top * .11, z);
        glazingBands(g, x, z, w * 1.9, d * 1.35, top * .04, top * .19, 2, M, id);
        for (let k = 0; k < 3; k++)
            mesh(g, new THREE.CylinderGeometry(w * (.62 - k * .12), w * (.70 - k * .12),
                top * .16, 8), k === 1 ? M.concrete : M.pale,
            x, top * (.30 + k * .16), z, 0, .3, 0, false, false);
        mesh(g, new THREE.CylinderGeometry(w * .36, w * .40, top * .10, 8), M.glass,
            x, top * .74, z, 0, .3, 0, false, false);
        mesh(g, new THREE.CylinderGeometry(w * .06, w * .06, top * .30, 6), M.steel,
            x, top * .92, z, 0, 0, 0, false, false);
        briseSoleil(g, x, z, w * 1.9, d * 1.35, top * .12, top * .16, 9, M);
    } else if (type === 'cultural-hall') {
        // Faceted shell over a fully glazed foyer -- angular, never pitched.
        mesh(g, new THREE.BoxGeometry(w * 1.5, top * .30, d * 1.25), M.glass,
            x, top * .15, z);
        for (let k = 0; k < 4; k++)
            mesh(g, new THREE.BoxGeometry(w * 1.7, top * .07, d * (1.4 - k * .22)),
                k % 2 ? M.pale : M.concrete, x + (k - 1.5) * w * .10,
                top * (.34 + k * .09), z, 0, 0, (k - 1.5) * .10, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.85, top * .05, d * 1.55), M.solar,
            x, top * .70, z, 0, 0, -.06, false, false);
    } else if (type === 'garden-tower') {
        // Vertical forest: every setback planted, every storey glazed.
        const tiers = band + 4;
        for (let t = 0; t < tiers; t++) {
            const tw = w * (1 - t * .09), td = d * (1 - t * .06), th = top / tiers;
            const tx = x + (t % 2 ? w * .06 : -w * .04);
            mesh(g, new THREE.BoxGeometry(tw, th * .78, td),
                t % 2 ? M.pale : M.concrete, tx, th * (t + .40), z,
                0, t * .05, 0, false, false);
            glazingBands(g, tx, z, tw, td, th * t + th * .12, th * t + th * .70,
                2, M, id * 7 + t);
            plantedLip(g, x, z, tw, td, th * (t + .82), M);
        }
    } else if (type === 'ministry') {
        // Curtain-wall slab with deep louvred bands and a planted roof.
        mesh(g, new THREE.BoxGeometry(w, top, d), M.concrete, x, top / 2, z);
        glazingBands(g, x, z, w, d, top * .08, top * .92, 5 + band, M, id);
        for (let t = 0; t < 5; t++)
            mesh(g, new THREE.BoxGeometry(w * 1.06, 2.4, d * 1.06), M.pale,
                x, top * (.14 + t * .17), z, 0, 0, 0, false, false);
        briseSoleil(g, x, z, w, d, top * .55, top * .74, 8, M);
        plantedLip(g, x, z, w * .92, d * .92, top + 1, M);
    } else if (type === 'transit-hub') {
        // Maglev station: a glazed hall under a segmented shell roof.
        mesh(g, new THREE.BoxGeometry(w * 1.8, top * .30, d * 1.5), M.glass,
            x, top * .15, z);
        for (const s of [-1, 1])
            mesh(g, new THREE.BoxGeometry(w * .14, top * .40, d * 1.5), M.concrete,
                x + s * w * .88, top * .20, z, 0, 0, 0, false, false);
        for (let k = -2; k <= 2; k++)
            mesh(g, new THREE.BoxGeometry(w * 1.9, top * .05, d * .34), M.steel,
                x, top * (.44 - Math.abs(k) * .035), z + k * d * .32,
                k * .10, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * 2.0, top * .04, d * 1.7), M.solar,
            x, top * .50, z, 0, 0, 0, false, false);
    } else if (type === 'skybridge') {
        // Twin glazed towers linked by two occupied bridges.
        for (const s of [-1, 1]) {
            const tx = x + s * w * .46;
            mesh(g, new THREE.BoxGeometry(w * .46, top, d), M.pale, tx, top / 2, z);
            glazingBands(g, tx, z, w * .46, d, top * .10, top * .94, 6, M,
                id * 3 + (s > 0 ? 1 : 0));
        }
        for (const f of [.52, .78]) {
            mesh(g, new THREE.BoxGeometry(w * .96, top * .09, d * .56), M.litGlass,
                x, top * f, z, 0, 0, 0, false, false);
            mesh(g, new THREE.BoxGeometry(w * 1.02, 2.4, d * .66), M.steel,
                x, top * f + top * .055, z, 0, 0, 0, false, false);
        }
    } else if (type === 'water-garden') {
        // Retention basin with a hard civic rim and a light footbridge.
        mesh(g, new THREE.BoxGeometry(w * 1.6, 5, d * 1.5), M.pale, x, 2.5, z);
        mesh(g, new THREE.PlaneGeometry(w * 1.35, d * 1.22),
            material('clusterWater', 0x476b63), x, 5.2, z, -Math.PI / 2, 0, 0,
            false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.5, 1.6, d * .16), M.steel,
            x, 8.5, z, 0, 0, 0, false, false);
        for (let k = 0; k < 7; k++)
            mesh(g, new THREE.CylinderGeometry(2.4, 3.3, 10 + k, 7), M.leaf,
                x - w * .55 + k * w * .18, 9, z + (k % 2 ? d * .34 : -d * .32));
    } else if (type === 'colonnade') {
        // Civic arcade roofed with a solar canopy, not a stone entablature.
        mesh(g, new THREE.BoxGeometry(w * 1.8, 4, d * 1.15), M.concrete, x, 2, z);
        for (let k = -4; k <= 4; k++)
            mesh(g, new THREE.BoxGeometry(w * .05, top, d * .10), M.pale,
                x + k * w * .18, top / 2, z, 0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.7, 3, d), M.steel, x, top, z,
            0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.62, 1.6, d * .86), M.solar,
            x, top + 2.6, z, 0, 0, .05, false, false);
    } else if (type === 'forest-terrace') {
        // Stepped green terraces: glazed risers, planted treads.
        for (let t = 0; t < 5; t++) {
            const tw = w * (1 - t * .10), td = d * (1 - t * .08);
            mesh(g, new THREE.BoxGeometry(tw, 8, td), M.concrete,
                x, 4 + t * 8, z + t * d * .06);
            glazingBands(g, x, z + t * d * .06, tw, td, 1 + t * 8, 7 + t * 8,
                1, M, id * 5 + t);
            mesh(g, new THREE.BoxGeometry(tw * .98, 2.4, td * .45), M.leaf,
                x, 9.2 + t * 8, z - td * .26, 0, 0, 0, false, false);
        }
    } else {
        // Civic spire: a tapered glazed shaft with a crown ring and a mast.
        for (let k = 0; k < 3; k++)
            mesh(g, new THREE.CylinderGeometry(w * (.30 - k * .06), w * (.38 - k * .06),
                top * .30, 8), k % 2 ? M.pale : M.concrete,
            x, top * (.15 + k * .28), z, 0, .2 * k, 0, false, false);
        glazingBands(g, x, z, w * .70, w * .70, top * .08, top * .84, 7, M, id);
        mesh(g, new THREE.TorusGeometry(w * .34, 2.6, 6, 14), M.steel,
            x, top * .86, z, Math.PI / 2, 0, 0, false, false);
        mesh(g, new THREE.CylinderGeometry(w * .05, w * .05, top * .22, 6), M.steel,
            x, top * .98, z, 0, 0, 0, false, false);
    }
    count(type);
    // Glazing is the shared skyline language, so it is MEASURED per cluster
    // rather than assumed: a future archetype that forgets it fails the suite.
    let glazed = 0, coneRoofs = 0;
    for (const c of g.children) {
        if (c.material === M.glass || c.material === M.litGlass) glazed++;
        if (c.geometry && c.geometry.type === 'cone') coneRoofs++;
    }
    clusters.push({ id, type, band, x, z, top,
        rawParts: g.children.length, glazed, coneRoofs });
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
            // Near band pushed out from 315 so the widened play area cannot
            // reach the (blocker-free, welded) city clusters.
            const baseZ = band === 0 ? 395 : band === 1 ? 545 : 730;
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

    // Elevated MAGLEV binds the districts into one city rather than isolated
    // decorative towers: a slim guideway on tapered Y-piers carrying a
    // streamlined set with a continuous window band. Static backdrop only.
    const g = new THREE.Group();
    const M = cityMats();
    for (const side of [-1, 1]) {
        const z = side * 430;
        mesh(g, new THREE.BoxGeometry(1780, 4, 26), material('guideway', PAL.panel),
            389990, 68, z, 0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(1780, 3, 6), material('guideRail', PAL.steel),
            389990, 71.5, z, 0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(1780, 1.2, 28), material('guideStrip', PAL.techDim,
            { emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * .3 }),
        389990, 65.6, z, 0, 0, 0, false, false);
        for (let i = 0; i < 15; i++) {
            const px = 390730 - i * 110;
            mesh(g, new THREE.CylinderGeometry(4.5, 8, 60, 7),
                material('guidePier', PAL.concrete), px, 33, z, 0, 0, 0, false, false);
            for (const s of [-1, 1])
                mesh(g, new THREE.BoxGeometry(4, 16, 5), material('guidePier', PAL.concrete),
                    px, 62, z + s * 7, 0, 0, s * .28, false, false);
        }
        // Nose, four body sections and tail: one continuous silhouette rather
        // than five detached boxes floating over a beam.
        const base = 390150;
        mesh(g, new THREE.CylinderGeometry(2.4, 7.4, 16, 7), M.pale,
            base - 30, 79, z, 0, 0, Math.PI / 2, false, false);
        for (let car = 0; car < 4; car++) {
            const cx = base + car * 52;
            mesh(g, new THREE.BoxGeometry(50, 13, 15), M.pale, cx, 79, z,
                0, 0, 0, false, false);
            mesh(g, new THREE.BoxGeometry(44, 5.2, 15.6), M.litGlass, cx, 81, z,
                0, 0, 0, false, false);
            mesh(g, new THREE.BoxGeometry(50, 2.4, 12), material('guideSkirt', PAL.gunmetal),
                cx, 72.6, z, 0, 0, 0, false, false);
        }
        mesh(g, new THREE.CylinderGeometry(2.4, 7.4, 16, 7), M.pale,
            base + 3 * 52 + 30, 79, z, 0, 0, -Math.PI / 2, false, false);
        count('transit-viaduct'); count('transit-car', 4);
    }
    // Air-taxi pads on the mid band: the clearest single read that this is 2045
    // and not a present-day capital. Backdrop only, well outside the play area.
    for (const [px, pz] of [[390420, 470], [389880, -470], [389380, 500]]) {
        mesh(g, new THREE.CylinderGeometry(30, 34, 5, 12), material('padDeck', PAL.concrete),
            px, 96, pz, 0, 0, 0, false, false);
        mesh(g, new THREE.CylinderGeometry(9, 13, 96, 8), material('padMast', PAL.panel),
            px, 48, pz, 0, 0, 0, false, false);
        mesh(g, new THREE.TorusGeometry(26, 1.6, 6, 18), material('padRing', PAL.techDim,
            { emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * .32 }),
        px, 99, pz, Math.PI / 2, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(22, 5, 9), M.pale, px, 102, pz, 0, .4, 0, false, false);
        mesh(g, new THREE.BoxGeometry(15, 3.4, 9.4), M.litGlass, px, 103.6, pz,
            0, .4, 0, false, false);
        for (const s of [-1, 1])
            mesh(g, new THREE.TorusGeometry(7, 1.2, 5, 12), material('padRotor', PAL.steel),
                px + s * 11, 105, pz + s * 5, Math.PI / 2, 0, .4, false, false);
        count('air-taxi-pad');
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

function buildAuthorityAndSuppression() {
    const api = {
        playX0: PLAY.x0, playX1: PLAY.x1,
        playHalfZ: (PLAY.z1 - PLAY.z0) * .5,
        playMidZ: (PLAY.z0 + PLAY.z1) * .5,
        descentX: S11_DESCENT.x,
        terrace: { ...STAGE11_TERRACE },
        blocker, count,
        segBlocked: stage11SurfaceSegBlocked,
    };
    ensureStage11SurfaceAuthority(root, api);
    ensureStage11SurfaceScan(root, api);
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
    // Built after the civic props so pylon placement can be checked against
    // every footprint that already stands on the axis.
    buildAuthorityAndSuppression();
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
    lockdownLimit,
    terrace: { ...STAGE11_TERRACE,
        drawnSteps: terraceSteps.map(s => ({ ...s })),
        nearCityMinZ: clusters.filter(c => c.band === 0)
            .reduce((n, c) => Math.min(n, Math.abs(c.z)), Infinity),
        atAxis: stage11SurfaceTerraceHeight(0),
        atPlayEdge: stage11SurfaceTerraceHeight(PLAY.z1),
        profile: [0, 120, 205, 215, 230, 250, 260, 300]
            .map(z => ({ z, h: stage11SurfaceTerraceHeight(z) })) },
    authority: { count: stage11SurfaceAuthorityDebug().count },
    suppression: { built: stage11SurfaceScanDebug().built },
    rawMeshes, weldedMeshes, blockerCount: blockers.length,
    clusters: clusters.map(c => ({ ...c })), clusterCount: clusters.length,
    plazaDressing: { promenadeMinAbsZ, inlayMaxY, promenadeZ: PROMENADE_Z },
    skyline: {
        glazedClusters: clusters.filter(c => c.glazed > 0).length,
        coneRoofs: clusters.reduce((n, c) => n + c.coneRoofs, 0),
        minGlazedTall: clusters.filter(c => c.band > 0)
            .reduce((n, c) => Math.min(n, c.glazed), Infinity),
        heritageRoofMaterial: !!mats.culturalRoof,
    },
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

