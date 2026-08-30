// Stage 11 Chapter 1 — parachute drop and rainforest approach outside IKN.
// Dense repetition is instanced; only route-side hero trees remain individual
// so the shared occlusion system can fade them without hiding a whole forest.

import { CFG, CAMP_M } from '../../../../core/config.js';
import { scene } from '../../../../core/renderer.js';
import { PAL } from '../../../../world/palette.js';
import { addMergedStaticShadowAware } from '../../../../utils/meshBatch.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';
import { buildStandMarker, pulseStandMarker } from '../../utility/common.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import {
    buildStage7RoadVehicle, STAGE7_ROAD_VEHICLE_SPECS,
} from '../stage7/roadVehicles.js';
import {
    STAGE11_DOUBLE_CABIN_METERS, STAGE11_FOREST_VEHICLE_GROUP,
    ensureStage11WeaponVehicles, stage11WeaponVehiclesDebug,
} from './weaponVehicles.js';
import {
    ensureStage11ForestCheckpoints, stage11ForestGateResolve,
    stage11ForestGateSegBlocked, stage11ForestCheckpointsDebug,
} from './forestCheckpoints.js';
import {
    ensureStage11ForestMortar, stage11ForestMortarDebug,
} from './forestMortar.js';

export const STAGE11_FOREST_LIGHTS_KEY = 'campaign-11-forest';
export const S11_FOREST_OCC = 'campaign-11-forest';

// Structural route geometry must be available while campaign modules are being
// imported. CFG is intentionally still empty at that point and is populated by
// await loadConfig() afterward, so never read CFG from this module scope.
export const S11_FOREST_ROUTE_METERS = 800;
const ROUTE_START = Object.freeze({ x: 384850, z: 0 });
const ROUTE_LEGS = Object.freeze([
    Object.freeze({ meters: 90, bend: 0.00, w: 88 }),
    Object.freeze({ meters: 110, bend: 0.28, w: 84 }),
    Object.freeze({ meters: 120, bend: -0.24, w: 80 }),
    Object.freeze({ meters: 115, bend: 0.34, w: 84 }),
    Object.freeze({ meters: 130, bend: -0.30, w: 82 }),
    Object.freeze({ meters: 115, bend: 0.22, w: 86 }),
    Object.freeze({ meters: 120, bend: -0.12, w: 92 }),
]);
function buildRoute() {
    const pts = [{ x: ROUTE_START.x, z: ROUTE_START.z, w: ROUTE_LEGS[0].w }];
    let x = ROUTE_START.x, z = ROUTE_START.z;
    for (const leg of ROUTE_LEGS) {
        const len = leg.meters * CAMP_M;
        x -= Math.cos(leg.bend) * len; z += Math.sin(leg.bend) * len;
        pts.push({ x, z, w: leg.w });
    }
    return Object.freeze(pts.map(Object.freeze));
}
export const S11_FOREST_ROUTE = buildRoute();
export const S11_FOREST_ORIGIN = Object.freeze({
    x: (S11_FOREST_ROUTE[0].x + S11_FOREST_ROUTE.at(-1).x) * .5, z: 0,
});
export const S11_FOREST_LANDING = Object.freeze({
    x: S11_FOREST_ROUTE[0].x, z: S11_FOREST_ROUTE[0].z,
});
export const S11_FOREST_GATE = Object.freeze({
    x: S11_FOREST_ROUTE.at(-1).x, z: S11_FOREST_ROUTE.at(-1).z,
});
const ROUTE_CUM_UNITS = [0];
for (let i = 0; i < S11_FOREST_ROUTE.length - 1; i++) {
    const a = S11_FOREST_ROUTE[i], b = S11_FOREST_ROUTE[i + 1];
    ROUTE_CUM_UNITS.push(ROUTE_CUM_UNITS.at(-1) + Math.hypot(b.x - a.x, b.z - a.z));
}
const ROUTE_BACK_UNITS = 150;
const START_BACK_WALK_UNITS = 20;
const firstDx = S11_FOREST_ROUTE[1].x - S11_FOREST_ROUTE[0].x;
const firstDz = S11_FOREST_ROUTE[1].z - S11_FOREST_ROUTE[0].z;
const firstLen = Math.hypot(firstDx, firstDz) || 1;
const FIRST_TX = firstDx / firstLen, FIRST_TZ = firstDz / firstLen;
const ROAD_RENDER_ROUTE = Object.freeze([
    Object.freeze({
        x: S11_FOREST_LANDING.x - FIRST_TX * ROUTE_BACK_UNITS,
        z: S11_FOREST_LANDING.z - FIRST_TZ * ROUTE_BACK_UNITS,
        w: S11_FOREST_ROUTE[0].w,
    }),
    ...S11_FOREST_ROUTE,
]);
const BOUNDS = Object.freeze({
    x0: S11_FOREST_GATE.x - 220, x1: ROAD_RENDER_ROUTE[0].x + 220,
    z0: -820, z1: 820,
});
const NAV_BOUNDS = Object.freeze({
    x0: S11_FOREST_GATE.x - 80, x1: S11_FOREST_LANDING.x + START_BACK_WALK_UNITS + 20,
    z0: -330, z1: 330,
});
const ROAD_ASPHALT_SCALE = 1.72;
const ROAD_SHOULDER_SCALE = 1.94;
const blockers = [];
const semantic = new Map();
const mats = {};
let built = false, root = null, nav = null;
let exitMarker = null, parachute = null, visualClock = 0;
let rawMeshes = 0, weldedMeshes = 0, treeCount = 0, instancedNodes = 0;
let hedgeCount = 0, hedgeNodes = 0, hedgeOutsideViolations = 0;
let hedgeSegmentSides = 0, roadProfile = null, bridgeProfile = null;
const forestSideCounts = { left: 0, right: 0 };
const vegetationBatches = [];

function count(kind, n = 1) { semantic.set(kind, (semantic.get(kind) || 0) + n); }
function mat(name, color, opts = {}) {
    if (!mats[name]) mats[name] = new THREE.MeshLambertMaterial({
        color, emissive: opts.emissive || 0,
        emissiveIntensity: opts.emissiveIntensity || 0,
        flatShading: opts.flatShading == null ? true : !!opts.flatShading,
        transparent: !!opts.transparent,
        opacity: opts.opacity == null ? 1 : opts.opacity,
        depthWrite: opts.depthWrite == null ? true : !!opts.depthWrite,
    });
    return mats[name];
}
function mesh(parent, geo, material, x, y, z, rx = 0, ry = 0, rz = 0,
    cast = false, receive = false) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m); rawMeshes++; return m;
}
function blocker(x, z, hx, hz, top, yaw = 0, kind = 'cover') {
    // `rotation.y = yaw` puts local +X at (cos yaw, -sin yaw) and local +Z at
    // (sin yaw, cos yaw). Writing +sin into `axz` mirrors the box about the x
    // axis, i.e. rotates the COLLIDER by -yaw while the mesh turns by +yaw --
    // harmless on this route's straight first leg (sin ~ 0) and up to 39
    // degrees out on its bends, which is what let a mitred barrier be walked
    // around. Keep the collider on the same axes as what is drawn.
    const c = Math.cos(yaw), s = Math.sin(yaw);
    blockers.push({ x, z, hx, hz, top, axx: c, axz: -s,
        azx: s, azz: c, rad: Math.hypot(hx, hz), standable: false,
        yaw, kind });
}
function hash(i, salt = 0) {
    let n = Math.imul((i + 17) ^ Math.imul(salt + 31, 0x9e3779b1), 0x85ebca6b);
    n ^= n >>> 16; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
}
function segmentInfo(x, z, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, den = dx * dx + dz * dz;
    const t = den > 1e-9 ? Math.max(0, Math.min(1,
        ((x - a.x) * dx + (z - a.z) * dz) / den)) : 0;
    const px = a.x + dx * t, pz = a.z + dz * t;
    return { d2: (x - px) ** 2 + (z - pz) ** 2,
        w: a.w + (b.w - a.w) * t, t, x: px, z: pz };
}
function nearestRoute(x, z) {
    let best = { d2: Infinity, w: 0, index: -1 };
    for (let i = 0; i < S11_FOREST_ROUTE.length - 1; i++) {
        const q = segmentInfo(x, z, S11_FOREST_ROUTE[i], S11_FOREST_ROUTE[i + 1]);
        if (q.d2 < best.d2) best = { ...q, index: i };
    }
    return best;
}

export function stage11ForestPointAtMeter(meter, lateral = 0) {
    const units = Math.max(0, Math.min(S11_FOREST_ROUTE_METERS, meter)) * CAMP_M;
    let index = S11_FOREST_ROUTE.length - 2;
    for (let i = 0; i < ROUTE_CUM_UNITS.length - 1; i++)
        if (units <= ROUTE_CUM_UNITS[i + 1] + 1e-6) { index = i; break; }
    const a = S11_FOREST_ROUTE[index], b = S11_FOREST_ROUTE[index + 1];
    const segLen = ROUTE_CUM_UNITS[index + 1] - ROUTE_CUM_UNITS[index] || 1;
    const t = Math.max(0, Math.min(1, (units - ROUTE_CUM_UNITS[index]) / segLen));
    const tx = (b.x - a.x) / segLen, tz = (b.z - a.z) / segLen;
    const nx = -tz, nz = tx;
    return {
        x: a.x + (b.x - a.x) * t + nx * lateral,
        z: a.z + (b.z - a.z) * t + nz * lateral,
        tx, tz, nx, nz, yaw: Math.atan2(-tz, tx),
        w: a.w + (b.w - a.w) * t, meter: units / CAMP_M, segment: index,
    };
}
export function stage11ForestMeterAt(x, z) {
    const q = nearestRoute(x, z);
    const a = S11_FOREST_ROUTE[q.index], b = S11_FOREST_ROUTE[q.index + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    return Math.max(0, Math.min(S11_FOREST_ROUTE_METERS,
        (ROUTE_CUM_UNITS[q.index] + len * q.t) / CAMP_M));
}

function routeHalfWidth(q, scale = 2) { return q.w * scale * .5; }
export function stage11ForestOnAsphalt(x, z, radius = 0) {
    if (x < NAV_BOUNDS.x0 + radius || x > NAV_BOUNDS.x1 - radius
        || z < NAV_BOUNDS.z0 + radius || z > NAV_BOUNDS.z1 - radius) return false;
    const startAlong = (x - S11_FOREST_LANDING.x) * FIRST_TX
        + (z - S11_FOREST_LANDING.z) * FIRST_TZ;
    if (startAlong < -START_BACK_WALK_UNITS + radius) return false;
    const q = nearestRoute(x, z);
    return q.d2 <= Math.max(6, routeHalfWidth(q, ROAD_ASPHALT_SCALE) - radius) ** 2;
}

function pointHitsBlocker(x, z, radius = 0) {
    for (const b of blockers) {
        const qx = x - b.x, qz = z - b.z;
        if (Math.abs(qx * b.axx + qz * b.axz) <= b.hx + radius
            && Math.abs(qx * b.azx + qz * b.azz) <= b.hz + radius) return true;
    }
    return false;
}
function projectToAsphalt(x, z, radius) {
    const q = nearestRoute(x, z);
    const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz);
    // Half-unit inset avoids a floating-point edge case where a point projected
    // exactly onto the asphalt boundary compares a few ulps outside on recheck.
    const reach = Math.max(6, routeHalfWidth(q, ROAD_ASPHALT_SCALE) - radius - .5);
    if (d <= reach || d < 1e-6) return { x, z };
    return { x: q.x + dx * reach / d, z: q.z + dz * reach / d };
}
// Forest patrols use this projector after their deterministic formation jitter.
// It keeps every spawn on the drawn asphalt and moves a point away from cover
// before the robot enters the shared AI/nav pipeline.
export function stage11ForestSpawnPoint(x, z, radius = 4) {
    let p = projectToAsphalt(x, z, radius);
    if (!pointHitsBlocker(p.x, p.z, radius)) return p;
    const q = nearestRoute(p.x, p.z);
    const a = S11_FOREST_ROUTE[q.index], b = S11_FOREST_ROUTE[q.index + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
    for (const shift of [14, -14, 28, -28, 42, -42, 56, -56]) {
        p = projectToAsphalt(q.x + tx * shift, q.z + tz * shift, radius);
        if (!pointHitsBlocker(p.x, p.z, radius)) return p;
    }
    return { x: q.x, z: q.z };
}

export function stage11ForestWalk(x, z, radius = 0) {
    if (x < NAV_BOUNDS.x0 + radius || x > NAV_BOUNDS.x1 - radius
        || z < NAV_BOUNDS.z0 + radius || z > NAV_BOUNDS.z1 - radius) return false;
    const startAlong = (x - S11_FOREST_LANDING.x) * FIRST_TX
        + (z - S11_FOREST_LANDING.z) * FIRST_TZ;
    if (startAlong < -START_BACK_WALK_UNITS + radius) return false;
    const q = nearestRoute(x, z);
    return q.d2 <= Math.max(8, q.w - radius) ** 2;
}
export function stage11ForestResolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY, blockers);
    // A checkpoint barrier is solid exactly while it is drawn across the road.
    stage11ForestGateResolve(pos, radius, feetY);
}
function segBox(x0, z0, x1, z1, b) {
    const dx = x1 - x0, dz = z1 - z0;
    const n = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 7));
    for (let i = 0; i <= n; i++) {
        const t = i / n, qx = x0 + dx * t - b.x, qz = z0 + dz * t - b.z;
        if (Math.abs(qx * b.axx + qz * b.axz) <= b.hx
            && Math.abs(qx * b.azx + qz * b.azz) <= b.hz) return true;
    }
    return false;
}
export function stage11ForestSegBlocked(x0, z0, x1, z1) {
    // Combat pickups are solid for movement but their mounted gunner must stay
    // shootable in the top-down hit model (which otherwise ignores height).
    return blockers.some(b => b.kind !== 'combat-vehicle'
        && segBox(x0, z0, x1, z1, b))
        || stage11ForestGateSegBlocked(x0, z0, x1, z1);
}
export function stage11ForestGroundHeight() { return 0; }
export function stage11ForestNav() { return nav; }

function ribbonEdges(points, widthScale) {
    const edges = [], joints = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const pa = points[Math.max(0, i - 1)], pb = points[Math.min(points.length - 1, i + 1)];
        let ptx = p.x - pa.x, ptz = p.z - pa.z;
        let ntx = pb.x - p.x, ntz = pb.z - p.z;
        let pl = Math.hypot(ptx, ptz), nl = Math.hypot(ntx, ntz);
        if (pl < 1e-6) { ptx = ntx; ptz = ntz; pl = nl || 1; }
        if (nl < 1e-6) { ntx = ptx; ntz = ptz; nl = pl || 1; }
        ptx /= pl; ptz /= pl; ntx /= nl; ntz /= nl;
        const pnx = -ptz, pnz = ptx, nnx = -ntz, nnz = ntx;
        let mx = pnx + nnx, mz = pnz + nnz, ml = Math.hypot(mx, mz);
        if (ml < 1e-6) { mx = nnx; mz = nnz; ml = 1; }
        mx /= ml; mz /= ml;
        const half = p.w * widthScale * .5;
        const denom = Math.max(.72, Math.abs(mx * nnx + mz * nnz));
        const miter = Math.min(half * 1.38, half / denom);
        edges.push({
            left: { x: p.x + mx * miter, z: p.z + mz * miter },
            right: { x: p.x - mx * miter, z: p.z - mz * miter },
        });
        if (i > 0 && i < points.length - 1)
            joints.push({ x: p.x, z: p.z, miterScale: miter / half });
    }
    return { edges, joints };
}
function addRibbon(parent, points, widthScale, material, y) {
    const data = ribbonEdges(points, widthScale);
    const e0 = data.edges[0], e1 = data.edges[1];
    const ax = e1.left.x - e0.left.x, az = e1.left.z - e0.left.z;
    const bx = e0.right.x - e0.left.x, bz = e0.right.z - e0.left.z;
    // Y component of cross(left1-left0, right0-left0), matching the first
    // emitted triangle below. Positive means its visible face points upward.
    data.normalY = az * bx - ax * bz;
    if (typeof THREE.BufferGeometry === 'function'
        && typeof THREE.BufferAttribute === 'function') {
        const pos = new Float32Array(points.length * 6);
        for (let i = 0; i < points.length; i++) {
            const e = data.edges[i], o = i * 6;
            pos[o] = e.left.x; pos[o + 1] = y; pos[o + 2] = e.left.z;
            pos[o + 3] = e.right.x; pos[o + 4] = y; pos[o + 5] = e.right.z;
        }
        const idx = [];
        for (let i = 0; i < points.length - 1; i++)
            // Counter-clockwise from above: normals face the camera. The old
            // winding faced downward, so FrontSide culled the whole road and
            // exposed the green forest plane beneath it.
            idx.push(i * 2, i * 2 + 2, i * 2 + 1,
                i * 2 + 1, i * 2 + 2, i * 2 + 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        mesh(parent, geo, material, 0, 0, 0, 0, 0, 0, false, true);
    } else {
        // Headless harness fallback: runtime Three.js always takes the ribbon
        // path above. No round caps are used in either branch.
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1];
            const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
            mesh(parent, new THREE.BoxGeometry(len + 4, .12,
                (a.w + b.w) * .5 * widthScale), material,
            (a.x + b.x) * .5, y, (a.z + b.z) * .5,
            0, Math.atan2(-dz, dx), 0, false, true);
        }
    }
    return data;
}

function buildGroundAndTrail() {
    mesh(root, new THREE.PlaneGeometry(BOUNDS.x1 - BOUNDS.x0,
        BOUNDS.z1 - BOUNDS.z0), mat('forestGround', 0x344b2d),
    (BOUNDS.x0 + BOUNDS.x1) * .5, -0.9, (BOUNDS.z0 + BOUNDS.z1) * .5,
    -Math.PI / 2, 0, 0, false, true);
    const trail = new THREE.Group();
    const asphaltMaterial = mat('roadAsphalt', 0x303638);
    const shoulderRibbon = addRibbon(trail, ROAD_RENDER_ROUTE,
        ROAD_SHOULDER_SCALE, mat('roadShoulder', 0x665d4d), -0.02);
    const asphaltRibbon = addRibbon(trail, ROAD_RENDER_ROUTE,
        ROAD_ASPHALT_SCALE, asphaltMaterial, 0.10);
    let markingCount = 0;
    for (let i = 0; i < ROAD_RENDER_ROUTE.length - 1; i++) {
        const a = ROAD_RENDER_ROUTE[i], b = ROAD_RENDER_ROUTE[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        const ux = dx / len, uz = dz / len, yaw = Math.atan2(-dz, dx);
        const dashes = Math.max(1, Math.floor((len - 20) / 40));
        for (let d = 0; d < dashes; d++) {
            const along = -len * .5 + 18 + d * (len - 36) / Math.max(1, dashes - 1);
            mesh(trail, new THREE.BoxGeometry(13, .07, 1.7),
                mat('roadMarking', 0xd7c993), (a.x + b.x) * .5 + ux * along,
                .17, (a.z + b.z) * .5 + uz * along, 0, yaw, 0, false, false);
            markingCount++;
        }
    }

    // The road continues straight behind the parachute landing, but a visible
    // full-width checkpoint rail matches the flat walk boundary.
    const start = stage11ForestPointAtMeter(0);
    const barrierAlong = -START_BACK_WALK_UNITS;
    const barrierX = start.x + start.tx * barrierAlong;
    const barrierZ = start.z + start.tz * barrierAlong;
    const barrier = new THREE.Group();
    barrier.position.set(barrierX, 0, barrierZ); barrier.rotation.y = start.yaw;
    const barrierW = start.w * ROAD_ASPHALT_SCALE;
    for (const z of [-barrierW * .29, barrierW * .29])
        mesh(barrier, new THREE.BoxGeometry(7, 5, 9),
            mat('startBarrierBase', PAL.concrete), 0, 2.5, z,
            0, 0, 0, false, true);
    mesh(barrier, new THREE.BoxGeometry(4, 3.2, barrierW - 12),
        mat('startBarrierRail', PAL.hazard), 0, 5.8, 0,
        0, 0, 0, false, false);
    trail.add(barrier);
    blocker(barrierX, barrierZ, 4, barrierW * .5, 9,
        start.yaw, 'start-barrier');

    // Stream and bridge live at route meter 400. Both rotate from the same
    // tangent, so the deck is exactly aligned with the mitered road.
    const bridgeAt = stage11ForestPointAtMeter(400);
    mesh(trail, new THREE.BoxGeometry(44, .3, 900),
        mat('forestWater', 0x315b5a), bridgeAt.x, -.25, bridgeAt.z,
        0, bridgeAt.yaw, 0, false, false);
    const asphaltW = bridgeAt.w * ROAD_ASPHALT_SCALE;
    const bridgeW = asphaltW + 18, bridgeLen = 88;
    const bridge = new THREE.Group();
    bridge.position.set(bridgeAt.x, 0, bridgeAt.z); bridge.rotation.y = bridgeAt.yaw;
    mesh(bridge, new THREE.BoxGeometry(bridgeLen, 1.05, bridgeW),
        mat('bridgeConcrete', PAL.concrete), 0, -.43, 0, 0, 0, 0, false, true);
    mesh(bridge, new THREE.BoxGeometry(bridgeLen - 2, .17, asphaltW),
        mat('roadAsphalt', 0x303638), 0, .12, 0, 0, 0, 0, false, true);
    for (const x of [-bridgeLen * .43, bridgeLen * .43])
        mesh(bridge, new THREE.BoxGeometry(8, 2.2, bridgeW + 8),
            mat('bridgeAbutment', PAL.concrete), x, -1.05, 0,
            0, 0, 0, false, true);
    for (const side of [-1, 1]) {
        const railZ = side * (asphaltW * .5 + 6);
        mesh(bridge, new THREE.BoxGeometry(bridgeLen, 1.4, 2.4),
            mat('bridgeGirder', PAL.gunmetal), 0, -.72, railZ,
            0, 0, 0, false, false);
        mesh(bridge, new THREE.BoxGeometry(bridgeLen, 1.15, 1.4),
            mat('bridgeRail', PAL.steel), 0, 3.45, railZ,
            0, 0, 0, false, false);
        for (let p = -3; p <= 3; p++)
            mesh(bridge, new THREE.BoxGeometry(1.15, 5.3, 1.4),
                mat('bridgeRail', PAL.steel), p * 12, 1.45, railZ,
                0, 0, 0, false, false);
        const bx = bridgeAt.x + Math.sin(bridgeAt.yaw) * railZ;
        const bz = bridgeAt.z + Math.cos(bridgeAt.yaw) * railZ;
        blocker(bx, bz, bridgeLen * .5, 2.2, 6,
            bridgeAt.yaw, 'bridge-rail');
    }
    for (const x of [-25, 0, 25])
        mesh(bridge, new THREE.CylinderGeometry(2.8, 3.4, 2.8, 8),
            mat('bridgePier', PAL.concrete), x, -1.65, 0,
            0, 0, 0, false, true);
    trail.add(bridge);

    const routeHeadings = [];
    for (let i = 0; i < S11_FOREST_ROUTE.length - 1; i++) {
        const a = S11_FOREST_ROUTE[i], b = S11_FOREST_ROUTE[i + 1];
        routeHeadings.push(Math.atan2(b.z - a.z, b.x - a.x));
    }
    const turnDeg = [];
    for (let i = 1; i < routeHeadings.length; i++) {
        let d = routeHeadings[i] - routeHeadings[i - 1];
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        turnDeg.push(d * 180 / Math.PI);
    }
    roadProfile = {
        surface: 'asphalt', join: 'miter', roundCaps: 0,
        asphaltHex: asphaltMaterial.color.getHex(),
        forestGroundHex: mats.forestGround.color.getHex(),
        upwardWinding: asphaltRibbon.normalY > 0,
        windingNormalY: asphaltRibbon.normalY,
        // Keep the authored metric contract exact in debug/UI; recomputing
        // distance after adding world coordinates near x=380k introduces a
        // harmless ~1e-11 floating-point subtraction error.
        routeMeters: S11_FOREST_ROUTE_METERS,
        routeUnits: S11_FOREST_ROUTE_METERS * CAMP_M,
        segmentCount: S11_FOREST_ROUTE.length - 1,
        renderSegmentCount: ROAD_RENDER_ROUTE.length - 1,
        asphaltScale: ROAD_ASPHALT_SCALE, shoulderScale: ROAD_SHOULDER_SCALE,
        minWidth: Math.min(...S11_FOREST_ROUTE.map(p => p.w)) * ROAD_ASPHALT_SCALE,
        maxWidth: Math.max(...S11_FOREST_ROUTE.map(p => p.w)) * ROAD_ASPHALT_SCALE,
        markingCount, connected: asphaltRibbon.joints.length
            === ROAD_RENDER_ROUTE.length - 2,
        joints: asphaltRibbon.joints,
        shoulderJoints: shoulderRibbon.joints.length,
        turnCount: turnDeg.filter(v => Math.abs(v) >= 10).length,
        turnDeg,
        start: {
            butt: true, rounded: false, backExtension: ROUTE_BACK_UNITS,
            walkLimit: START_BACK_WALK_UNITS, barrier: true,
        },
    };
    bridgeProfile = {
        meter: bridgeAt.meter, segment: bridgeAt.segment,
        x: bridgeAt.x, z: bridgeAt.z, yaw: bridgeAt.yaw,
        length: bridgeLen, width: bridgeW, asphaltWidth: asphaltW,
        deck: true, abutments: 2, rails: 2, railPosts: 14, piers: 3,
    };
    count('asphalt-road', S11_FOREST_ROUTE.length - 1);
    count('miter-joint', asphaltRibbon.joints.length);
    count('road-marking', markingCount);
    count('road-shoulder', S11_FOREST_ROUTE.length - 1);
    count('start-road-barrier'); count('forest-stream'); count('service-bridge');
    count('bridge-abutment', 2); count('bridge-rail', 2); count('bridge-pier', 3);
    weldedMeshes += addMergedStaticShadowAware(root, [trail]).length;
}

function buildInstancedForest() {
    // More than half of the candidates are deliberately placed in flank bands
    // beside the route. All 1,600 trees still cost the same four draw nodes and
    // cast no real-time shadows.
    const capacity = 1600;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.35, 1, 7),
        mat('trunk', PAL.wood), capacity);
    const lower = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
        mat('leafDark', 0x355636), capacity);
    const upper = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
        mat('leaf', 0x4d7042), capacity);
    const under = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
        mat('understory', 0x29452d), capacity);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < capacity * 4 && n < capacity; i++) {
        let x, z;
        if (i % 4 !== 0) {
            const seg = Math.min(S11_FOREST_ROUTE.length - 2,
                Math.floor(hash(i, 1) * (S11_FOREST_ROUTE.length - 1)));
            const a = S11_FOREST_ROUTE[seg], b = S11_FOREST_ROUTE[seg + 1];
            const t = hash(i, 2), side = hash(i, 3) < .5 ? -1 : 1;
            const dx = b.x - a.x, dz = b.z - a.z;
            const len = Math.hypot(dx, dz) || 1;
            const w = a.w + (b.w - a.w) * t;
            const off = w + 25 + hash(i, 4) * 185;
            x = a.x + dx * t + (-dz / len) * side * off;
            z = a.z + dz * t + (dx / len) * side * off;
        } else {
            x = BOUNDS.x0 + 26 + hash(i, 1) * (BOUNDS.x1 - BOUNDS.x0 - 52);
            z = BOUNDS.z0 + 26 + hash(i, 2) * (BOUNDS.z1 - BOUNDS.z0 - 52);
        }
        if (x < BOUNDS.x0 + 20 || x > BOUNDS.x1 - 20
            || z < BOUNDS.z0 + 20 || z > BOUNDS.z1 - 20) continue;
        const route = nearestRoute(x, z);
        if (route.d2 < (route.w + 22) ** 2) continue;
        const h = 19 + hash(i, 5) * 27, r = 10 + hash(i, 6) * 11;
        matrix.compose(pos.set(x, h / 2, z), q,
            scale.set(2.2 + hash(i, 7) * 2.2, h, 2.2 + hash(i, 8) * 2.2));
        trunk.setMatrixAt(n, matrix);
        matrix.compose(pos.set(x - r * .22, h * .76, z + r * .16), q,
            scale.set(r * 1.12, r * .58, r)); lower.setMatrixAt(n, matrix);
        matrix.compose(pos.set(x + r * .18, h + r * .12, z - r * .12), q,
            scale.set(r, r * .68, r * 1.08)); upper.setMatrixAt(n, matrix);
        matrix.compose(pos.set(x + (hash(i, 9) - .5) * 12, 2.3,
            z + (hash(i, 10) - .5) * 12), q,
        scale.set(4 + hash(i, 11) * 4, 5 + hash(i, 12) * 5, 4 + hash(i, 13) * 4));
        under.setMatrixAt(n, matrix); n++;
        const a = S11_FOREST_ROUTE[route.index], b = S11_FOREST_ROUTE[route.index + 1];
        const cross = (b.x - a.x) * (z - route.z) - (b.z - a.z) * (x - route.x);
        forestSideCounts[cross >= 0 ? 'left' : 'right']++;
    }
    for (const batch of [trunk, lower, upper, under]) {
        batch.count = n; batch.instanceMatrix.needsUpdate = true;
        batch.castShadow = false; batch.receiveShadow = false; root.add(batch);
        vegetationBatches.push(batch); instancedNodes++;
    }
    treeCount = n; rawMeshes += 4;
    count('rainforest-tree', n); count('canopy-layer', n * 2);
    count('understory', n);
}

function buildBoundaryHedges() {
    const placements = [], spacing = 17;
    const add = (x, z, seed, segment, side) => {
        if (stage11ForestWalk(x, z, .5)) return;
        placements.push({ x, z, seed, segment, side });
    };
    for (let i = 0; i < S11_FOREST_ROUTE.length - 1; i++) {
        const a = S11_FOREST_ROUTE[i], b = S11_FOREST_ROUTE[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len, steps = Math.ceil(len / spacing);
        for (const side of [-1, 1]) {
            let covered = false;
            for (let j = 0; j <= steps; j++) {
                const t = j / steps, w = a.w + (b.w - a.w) * t;
                const x = a.x + dx * t + nx * side * (w + 6.5);
                const z = a.z + dz * t + nz * side * (w + 6.5);
                const before = placements.length;
                add(x, z, i * 1000 + j * 2 + (side > 0 ? 1 : 0), i, side);
                if (placements.length > before) covered = true;
            }
            if (covered) hedgeSegmentSides++;
        }
    }
    // Rounded corner clusters join the offset hedge rows around every bend.
    for (let i = 1; i < S11_FOREST_ROUTE.length - 1; i++) {
        const p = S11_FOREST_ROUTE[i], radius = p.w + 6.5;
        for (let j = 0; j < 28; j++) {
            const a = j / 28 * Math.PI * 2;
            add(p.x + Math.cos(a) * radius, p.z + Math.sin(a) * radius,
                90000 + i * 100 + j, i, 0);
        }
    }
    const hedge = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
        mat('boundaryHedge', 0x294d2d), placements.length);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    for (let i = 0; i < placements.length; i++) {
        const p = placements[i], sx = 5.8 + hash(p.seed, 70) * 3.8;
        const sy = 4.2 + hash(p.seed, 71) * 3.4;
        const sz = 5.5 + hash(p.seed, 72) * 3.6;
        matrix.compose(pos.set(p.x, sy * .58, p.z), q, scale.set(sx, sy, sz));
        hedge.setMatrixAt(i, matrix);
        if (stage11ForestWalk(p.x, p.z, .5)) hedgeOutsideViolations++;
    }
    hedge.count = placements.length; hedge.instanceMatrix.needsUpdate = true;
    hedge.castShadow = false; hedge.receiveShadow = false; root.add(hedge);
    hedgeCount = placements.length; hedgeNodes = 1; rawMeshes++;
    count('boundary-hedge', hedgeCount);
    count('boundary-hedge-segment-side', hedgeSegmentSides);
}

function buildHeroTreesAndCover() {
    for (let i = 0; i < 14; i++) {
        const seg = i % (S11_FOREST_ROUTE.length - 1);
        const a = S11_FOREST_ROUTE[seg], b = S11_FOREST_ROUTE[seg + 1];
        const t = 0.2 + 0.6 * hash(i, 20), side = i % 2 ? 1 : -1;
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        const w = a.w + (b.w - a.w) * t;
        const x = a.x + dx * t + nx * side * (w + 18);
        const z = a.z + dz * t + nz * side * (w + 18);
        const h = 34 + hash(i, 21) * 16, r = 13 + hash(i, 22) * 5;
        const g = new THREE.Group();
        const tm = mat(`heroTrunk${i}`, PAL.wood, { transparent: true });
        const lm = mat(`heroLeaf${i}`, i % 3 ? 0x466a3e : 0x3d5e38,
            { transparent: true });
        mesh(g, new THREE.CylinderGeometry(3.2, 5.2, h, 7), tm,
            x, h / 2, z, 0, hash(i, 23) * Math.PI, 0, true, true);
        for (const [ox, oy, oz, s] of [[0, 1, 0, 1], [-.65, .82, .3, .72], [.62, .77, -.28, .76]])
            mesh(g, new THREE.DodecahedronGeometry(r * s, 0), lm,
                x + ox * r, h * oy, z + oz * r, 0, 0, 0, false, false)
                .scale.set(1, .62, 1);
        weldOccluder(S11_FOREST_OCC, root, g, { x, z, radius: r * 1.8, top: h + r });
        blocker(x, z, 5.5, 5.5, h, 0, 'hero-tree');
    }
    // Every former rock/fallen-log roadblock is now a disabled road vehicle.
    // They merge by material after construction, so sixteen detailed pickups
    // do not become sixteen independent draw-call trees.
    const cover = new THREE.Group();
    const meters = [60, 95, 130, 165, 200, 305, 340, 375,
        420, 455, 555, 590, 625, 660, 695, 790];
    const colors = [0x46545a, 0x5b5145, 0x414b3f, 0x60443d];
    const spec = STAGE7_ROAD_VEHICLE_SPECS.pickup;
    for (let i = 0; i < meters.length; i++) {
        const lateral = (i % 2 ? 1 : -1) * (30 + (i % 3) * 7);
        const p = stage11ForestPointAtMeter(meters[i], lateral);
        const car = buildStage7RoadVehicle('pickup', colors[i % colors.length], CAMP_M);
        car.position.set(p.x, 0, p.z);
        car.rotation.y = p.yaw + ((i % 3) - 1) * .22;
        cover.add(car);
        blocker(p.x, p.z, spec.length * CAMP_M * .5,
            spec.width * CAMP_M * .5, spec.height * CAMP_M,
            car.rotation.y, 'vehicle-roadblock');
    }
    weldedMeshes += addMergedStaticShadowAware(root, [cover]).length;
    count('vehicle-roadblock', meters.length);
    count('stage7-vehicle-roadblock', meters.length);
    count('occluder-tree', 14);
}

function buildIKNPerimeter() {
    const g = new THREE.Group(), x = S11_FOREST_GATE.x - 55;
    mesh(g, new THREE.BoxGeometry(28, 5, 340), mat('perimeterBase', PAL.concrete),
        x, 2.5, -210, 0, 0, 0, false, true);
    mesh(g, new THREE.BoxGeometry(28, 5, 340), mat('perimeterBase', PAL.concrete),
        x, 2.5, 226, 0, 0, 0, false, true);
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
        const z = side * (72 + i * 42);
        mesh(g, new THREE.BoxGeometry(10, 34, 10), mat('perimeterPost', PAL.gunmetal),
            x, 17, z, 0, 0, 0, true, true);
        mesh(g, new THREE.BoxGeometry(5, 3, 40), mat('perimeterRail', PAL.steel),
            x, 24, z + side * 20, 0, 0, 0, false, false);
    }
    for (const side of [-1, 1]) {
        mesh(g, new THREE.BoxGeometry(24, 44, 12), mat('gatePylon', PAL.panel),
            x, 22, side * 58, 0, 0, 0, true, true);
        mesh(g, new THREE.BoxGeometry(18, 16, 14), mat('gateScreen', PAL.techDim,
            { emissive: PAL.techDim, emissiveIntensity: .35 }), x + 5, 28,
        side * 58, 0, 0, 0, false, false);
    }
    blocker(x, -210, 14, 170, 35, 0, 'perimeter-fence');
    blocker(x, 226, 14, 170, 35, 0, 'perimeter-fence');
    exitMarker = buildStandMarker(root, S11_FOREST_GATE.x, S11_FOREST_GATE.z, PAL.amber);
    count('ikn-perimeter'); count('perimeter-gate');
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

function buildCombatVehicles() {
    const placements = [];
    for (const checkpoint of CFG.campaign.stage11.forestVehicles.checkpoints) {
        for (const vehicle of checkpoint.vehicles) {
            const p = stage11ForestPointAtMeter(checkpoint.meter, vehicle.lateral);
            placements.push({
                key: checkpoint.meter, meter: checkpoint.meter,
                type: vehicle.weapon,
                lateral: vehicle.lateral, x: p.x, z: p.z,
                // Hostile pickups face back toward the approaching player.
                yaw: p.yaw + Math.PI,
            });
        }
    }
    ensureStage11WeaponVehicles(STAGE11_FOREST_VEHICLE_GROUP, root, placements);
    const spec = STAGE11_DOUBLE_CABIN_METERS;
    for (const p of placements)
        blocker(p.x, p.z, spec.length * CAMP_M * .5,
            spec.width * CAMP_M * .5, spec.height * CAMP_M,
            p.yaw, 'combat-vehicle');
    count('double-cabin-combat', placements.length);
    count('vehicle-machine-gun', placements.filter(p => p.type === 'machineGun').length);
    count('vehicle-homing-missile',
        placements.filter(p => p.type === 'homingMissile').length);
}

function buildForestCheckpoints() {
    ensureStage11ForestCheckpoints(root, {
        routeMeters: S11_FOREST_ROUTE_METERS,
        pointAtMeter: stage11ForestPointAtMeter,
        meterAt: stage11ForestMeterAt,
        spawnPoint: stage11ForestSpawnPoint,
        onAsphalt: stage11ForestOnAsphalt,
        hitsBlocker: pointHitsBlocker,
        blocker, count, mesh,
        mats: {
            gatePylon: mat('checkpointPylon', PAL.concrete),
            gateFrame: mat('checkpointFrame', PAL.gunmetal),
            gateHazard: mat('checkpointHazard', PAL.hazard),
            gateWhite: mat('checkpointStripe', PAL.white),
            // Status lamp: own material instance, because it is recoloured
            // red -> green when the gate opens and every other checkpoint must
            // stay locked (the Stage 9 fuel-indicator lesson).
            gateLamp: new THREE.MeshBasicMaterial({ color: PAL.hazard,
                toneMapped: false }),
        },
    });
}

function buildForestMortar() {
    ensureStage11ForestMortar(root, {
        pointAtMeter: stage11ForestPointAtMeter,
        meterAt: stage11ForestMeterAt, count,
    });
}

function lineBetween(parent, a, b, material) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const line = mesh(parent, new THREE.CylinderGeometry(.11, .11, len, 5), material,
        (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    if (line.quaternion?.setFromUnitVectors) line.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    return line;
}

function buildParachute() {
    const g = new THREE.Group(); g.name = 'stage11-player-parachute'; g.visible = false;
    const canopy = mesh(g, new THREE.SphereGeometry(19, 14, 6, 0, Math.PI * 2,
        0, Math.PI / 2), mat('parachuteCanopy', 0xd8d2bd), 0, 0, 0, 0, 0, 0,
    false, false);
    canopy.scale.set(1.25, .42, 1);
    // National red-white cross bands keep the canopy readable from above.
    mesh(g, new THREE.BoxGeometry(5.5, .55, 37), mat('parachuteRed', PAL.hazard),
        0, -.1, 0, 0, 0, 0, false, false);
    mesh(g, new THREE.BoxGeometry(46, .5, 4.8), mat('parachuteWhite', PAL.white),
        0, -.12, 0, 0, 0, 0, false, false);
    const lines = new THREE.Group(); g.add(lines);
    const cord = mat('parachuteCord', PAL.steel);
    let lineCount = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        for (const wide of [.62, 1]) {
            lineBetween(lines, { x: sx * 18 * wide, y: -1.2, z: sz * 12 * wide },
                { x: sx * 1.15, y: -20, z: sz * .8 }, cord); lineCount++;
        }
    }
    const harness = mesh(g, new THREE.BoxGeometry(4.5, 2.2, 3),
        mat('parachuteHarness', PAL.gunmetal), 0, -20.5, 0);
    root.add(g); parachute = { group: g, canopy, lines, harness, lineCount };
    count('player-parachute'); count('suspension-line', lineCount);
}

export function setStage11ParachutePose(on, pose = {}) {
    if (!parachute) return;
    parachute.group.visible = !!on;
    if (!on) return;
    parachute.group.position.set(pose.x || 0, (pose.feetY || 0) + 32, pose.z || 0);
    parachute.group.rotation.set(pose.pitch || 0, pose.yaw || 0, pose.roll || 0);
    const flare = Math.max(0, Math.min(1, pose.flare || 0));
    parachute.canopy.scale.set(1.25 + flare * .06, .42 - flare * .04, 1 + flare * .04);
}
export function setStage11ForestExitMarker(on) {
    if (exitMarker) exitMarker.visible = !!on;
}
export function resetStage11ForestVisuals() {
    visualClock = 0; setStage11ParachutePose(false); setStage11ForestExitMarker(false);
    resetStageOccluders(S11_FOREST_OCC);
}
export function updateStage11ForestVisuals(dt) {
    visualClock += dt; pulseStandMarker(exitMarker, visualClock * 4);
    updateStageOccluders(S11_FOREST_OCC, dt);
}

export function ensureStage11ForestWorld(parent = scene) {
    if (built) return root;
    if (CFG.campaign.stage11.forestRouteMeters !== S11_FOREST_ROUTE_METERS)
        throw new Error(`Stage 11 forest route must remain ${S11_FOREST_ROUTE_METERS} metres`);
    built = true; root = new THREE.Group(); root.name = 'campaign-stage11-outer-forest';
    parent.add(root);
    buildGroundAndTrail(); buildInstancedForest(); buildBoundaryHedges();
    buildHeroTreesAndCover();
    buildCombatVehicles(); buildIKNPerimeter();
    // Built LAST on purpose: fabricator placement tests every footprint already
    // registered (roadblock cars, hero trees, weapon vehicles) before it lands.
    buildForestCheckpoints(); buildForestMortar();
    buildParachute();
    nav = makeNavGrid(NAV_BOUNDS.x0, NAV_BOUNDS.z0, 14,
        Math.ceil((NAV_BOUNDS.x1 - NAV_BOUNDS.x0) / 14),
        Math.ceil((NAV_BOUNDS.z1 - NAV_BOUNDS.z0) / 14),
        (x, z) => stage11ForestWalk(x, z, 3.5));
    registerCampaignWorldRoot({ key: STAGE11_FOREST_LIGHTS_KEY, root,
        bounds: { ...BOUNDS }, lightsKey: STAGE11_FOREST_LIGHTS_KEY,
        warmupViews: [S11_FOREST_LANDING, S11_FOREST_ROUTE[3], S11_FOREST_GATE],
    });
    return root;
}

export const stage11ForestWorldDebug = () => ({
    built, root: root?.name || null, origin: { ...S11_FOREST_ORIGIN },
    bounds: { ...BOUNDS }, landing: { ...S11_FOREST_LANDING }, gate: { ...S11_FOREST_GATE },
    route: S11_FOREST_ROUTE.map(p => ({ ...p })), routeSegments: S11_FOREST_ROUTE.length - 1,
    rawMeshes, weldedMeshes, blockers: blockers.length,
    treeCount, instancedNodes, vegetationBatches: vegetationBatches.length,
    forestSides: { ...forestSideCounts },
    repeatedVegetationDrawNodes: instancedNodes + hedgeNodes,
    road: roadProfile && { ...roadProfile,
        joints: roadProfile.joints.map(p => ({ ...p })) },
    bridge: bridgeProfile && { ...bridgeProfile },
    boundaryHedges: {
        instances: hedgeCount, nodes: hedgeNodes,
        segmentSides: hedgeSegmentSides,
        expectedSegmentSides: (S11_FOREST_ROUTE.length - 1) * 2,
        outsideWalkableViolations: hedgeOutsideViolations,
    },
    vehicles: stage11WeaponVehiclesDebug(STAGE11_FOREST_VEHICLE_GROUP),
    // Checkpoint detail belongs to forestDebug(); repeating the whole record
    // here would traverse all 27 fabricator rigs twice on every debug read.
    checkpoints: { count: stage11ForestCheckpointsDebug().count,
        machines: stage11ForestCheckpointsDebug().machineTotal },
    mortar: { poolSize: stage11ForestMortarDebug().poolSize },
    semantic: Object.fromEntries(semantic),
    exitMarker: !!exitMarker?.visible,
    parachute: parachute ? {
        prebuilt: true, visible: parachute.group.visible,
        canopy: !!parachute.canopy, lines: parachute.lineCount,
        position: { x: parachute.group.position.x, y: parachute.group.position.y,
            z: parachute.group.position.z },
    } : { prebuilt: false, visible: false, canopy: false, lines: 0 },
    occluders: occlusionDebug(S11_FOREST_OCC),
    nav: nav && { cols: nav.cols, rows: nav.rows,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});
