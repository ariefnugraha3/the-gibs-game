// Stage 11 Chapter 2 — the IKN city, built on the road network in cityRoads.js.
//
// The chapter's geometry follows one rule: THE PLAYER TRAVELS ON ROADS AND
// NOWHERE ELSE.  `stage11CityWalk` is the corridor union of every road, both
// roundabout carriageways and the headquarters apron, and every boundary it
// draws is a VISIBLE fence standing on exactly that line — never an invisible
// wall.  Both roundabout islands are solid: their kerb wall is drawn on the same
// radius the predicate excludes, and it is the one analytic blocker in the map.
//
// Everything else — kerbs, street furniture, the whole skyline, the forest the
// capital was cut into — stands OUTSIDE the corridor and carries no collider at
// all, so nothing drawn can ever be walked through and nothing invisible can
// ever stop the player.  The fight's colliders are exactly three things: the
// roundabout islands, the blockade barriers, and the fabricators and weapon
// vehicles standing on the asphalt.

import { scene } from '../../../../core/renderer.js';
import { CFG, CAMP_M } from '../../../../core/config.js';
import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { addMergedStaticShadowAware } from '../../../../utils/meshBatch.js';
import {
    weldOccluder, updateStageOccluders, resetStageOccluders, occlusionDebug,
} from '../../utility/occlusion.js';
import { resolveBlockers, makeBlockerIndex } from '../../../../utils/collision.js';
import { FuturisticSedan } from '../../../../entities/futuristicSedan.js';
import { FuturisticSUV } from '../../../../entities/futuristicSUV.js';
import {
    buildStage7RoadVehicle, STAGE7_ROAD_VEHICLE_SPECS,
} from '../stage7/roadVehicles.js';
import { makeNavGrid } from '../../../../utils/pathfind.js';
import { registerStageLight } from '../../../../world/lighting.js';
import { registerCampaignWorldRoot } from '../../utility/campaignWorldRegistry.js';
import {
    S11_SURFACE_ORIGIN, S11_CITY_START, S11_CITY_HQ, S11_CITY_HQ_APRON,
    S11_CITY_BOUNDS, S11_CITY_EDGES, S11_CITY_NODES, S11_CITY_ROUNDABOUTS,
    S11_CITY_SPAN_METERS, S11_CITY_UNITS_PER_PX, S11_CITY_SIDEWALK,
    S11_CITY_SIDEWALK_METERS, S11_CITY_START_BACK_UNITS,
    S11_CITY_START_RENDER_UNITS, S11_CITY_START_TANGENT, S11_CITY_BLOCKADES,
    stage11CityWalk, stage11CityIslandSegBlocked, stage11CityNearestRoad,
    stage11CityRoadClearance, stage11CityProjectToRoad,
    stage11CityFenceRuns, stage11CityCrossingAsphalt,
    stage11CityRoadsDebug,
} from './cityRoads.js';
import {
    STAGE11_CITY_VEHICLE_GROUP, STAGE11_DOUBLE_CABIN_METERS,
    ensureStage11WeaponVehicles, stage11WeaponVehiclesDebug,
} from './weaponVehicles.js';
import {
    ensureStage11CityBlockades, stage11CityGateResolve,
    stage11CityVehiclePlacements, stage11CityBlockadesDebug,
} from './cityBlockades.js';

export const STAGE11_SURFACE_LIGHTS_KEY = 'campaign-11-surface';
export const S11_SURFACE_OCC = 'campaign-11-surface';
export { S11_SURFACE_ORIGIN } from './cityRoads.js';

export const S11_SURFACE_START = Object.freeze({ ...S11_CITY_START });
export const S11_CITY_HEADQUARTERS = Object.freeze({ ...S11_CITY_HQ });

// The compound gate is derived from the road that reaches it, so the marker can
// never drift off the approach when the map moves.
const HQ_APPROACH = (() => {
    const a = S11_CITY_NODES.A12, b = S11_CITY_HQ;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    return { tx: dx / len, tz: dz / len, yaw: Math.atan2(-dz / len, dx / len) };
})();
// Derived from the forecourt, never typed: the gate marker must always stand
// INSIDE the apron the player is allowed to walk on, whatever span the map is
// scaled to, and the compound's front wall must stand just behind it.
const HQ_GATE_OFFSET = S11_CITY_HQ_APRON * 0.72;
export const S11_DESCENT = Object.freeze({
    x: S11_CITY_HQ.x + HQ_APPROACH.tx * HQ_GATE_OFFSET,
    z: S11_CITY_HQ.z + HQ_APPROACH.tz * HQ_GATE_OFFSET,
});

const BOUNDS = S11_CITY_BOUNDS;
// One asphalt plane. Every road surface shares this exact top height, so two
// overlapping carriageways are EXACTLY coplanar (a deterministic depth winner)
// rather than near-coplanar, which is what flickers.
const ROAD_TOP = 0, ROAD_THICK = 0.6;
const MARK_Y = 0.3;
// The pavement sits a KERB below the carriageway rather than exactly level with
// it. Two coplanar surfaces of DIFFERENT colour tessellated differently are only
// near-equal in depth, and that shimmers; a clear 0.3 (4 cm) separation makes
// the asphalt the deterministic winner wherever a road quad crosses a pavement,
// which happens at every roundabout and at the end of every boundary run.
const PAVE_TOP = -0.3;
// Vertex spacing on every road surface. `MeshLambertMaterial` is GOURAUD — three
// .js shades it per VERTEX — so a light with a 60-unit range over a quad whose
// only vertices are hundreds of units away lights almost nothing, while a
// 28-sided junction cap has a dense vertex ring right there and lights up as a
// bright disc. That mismatch is what made the muzzle flash paint circles on the
// asphalt at every bend. Keeping the spacing well under the flash range makes
// the pool land the same way on every part of the road.
const SURF_STEP = 26;
const seg = (span) => Math.max(1, Math.round(Math.abs(span) / SURF_STEP));
// A ground quad, pre-rotated in its GEOMETRY so the mesh only needs a yaw:
// `rotation.set(-PI/2, yaw, 0)` composes as Rx*Ry with Euler XYZ, which turns
// the plane edge-on instead of spinning it about the vertical.
function groundQuad(len, wide) {
    const g = new THREE.PlaneGeometry(len, wide, seg(len), seg(wide));
    g.rotateX(-Math.PI / 2);
    return g;
}
function groundDisc(inner, outer, theta = 32) {
    const g = new THREE.RingGeometry(inner, outer, theta, seg(outer - inner));
    g.rotateX(-Math.PI / 2);
    return g;
}
const GROUND_Y = -1.6;
// The contour is SAMPLED fine and then SIMPLIFIED, so accuracy at a bend and
// mesh count are set independently: a straight collapses to one long segment
// while a cap keeps the points that make it a curve.
const FENCE_SAMPLE = 10, FENCE_TOL = 0.6, POST_SPACING = 30, FENCE_H = 11;
const SIDEWALK = S11_CITY_SIDEWALK;
const CHUNK = 1400;
// Traffic welds into coarser cells than the rest of the city: a draw group per
// material per cell, so a bigger cell is fewer groups while still frustum-culled.
const TRAFFIC_CHUNK = 2800;

let built = false;
let root = null;
let nav = null;
let descentDoor = null;
let rawMeshes = 0, weldedMeshes = 0, occluderCount = 0;
let treeCount = 0, instancedNodes = 0;
let fenceRunCount = 0, fencePanelCount = 0, fenceInsideViolations = 0;
let fenceLooseEnds = 0;
const fenceRuns = [], fencePosts = [];
let buildingOnRoadViolations = 0;
let startStubMeters = 0, trafficRejected = 0;
let trafficPending = [], trafficChunks = null;
const trafficRecords = [];
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
        transparent: !!opts.transparent,
        opacity: opts.opacity == null ? 1 : opts.opacity,
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
// `rotation.y = yaw` puts local +X at (cos yaw, -sin yaw): writing +sin into
// `axz` would mirror the collider relative to the mesh, and sliding along a
// mis-rotated face carries the player forward past it.
function blocker(x, z, hx, hz, top, yaw = 0, kind = 'cover') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const box = { x, z, hx, hz, top, axx: c, axz: -s, azx: s, azz: c,
        rad: Math.hypot(hx, hz), standable: false, yaw, kind };
    blockers.push(box);
    return box;
}
// Parked traffic multiplies the collider count by four, and `segBlocked` runs
// for every bullet and every robot line-of-sight test — so the shared uniform
// index does the narrowing, exactly as Stages 1/2/6 do. It is exact, not
// approximate: results come back in original list order, which is what keeps
// sequential push-out identical to a full sweep.
let blockerIndex = null;
const nearBlockers = (x, z, r, moving) =>
    blockerIndex ? blockerIndex.gather(x, z, r, moving) : blockers;
function pointBlocked(x, z, r = 0) {
    for (const b of nearBlockers(x, z, r, false)) {
        const dx = x - b.x, dz = z - b.z;
        if (Math.abs(dx * b.axx + dz * b.axz) <= b.hx + r
            && Math.abs(dx * b.azx + dz * b.azz) <= b.hz + r) return true;
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

// --- scene predicates --------------------------------------------------------

export const stage11SurfaceWalk = stage11CityWalk;
export function stage11SurfaceResolve(pos, radius, feetY = 0) {
    resolveBlockers(pos, radius, feetY,
        nearBlockers(pos.x, pos.z, radius, true));
    // A blockade barrier is solid exactly while it is drawn across the road.
    stage11CityGateResolve(pos, radius, feetY);
}
export function stage11SurfaceSegBlocked(x0, z0, x1, z1) {
    // Weapon pickups are solid for movement but their mounted gunner must stay
    // shootable in the top-down hit model (which otherwise ignores height), and
    // a rail barricade is deliberately not here at all: see cityBlockades.js.
    if (stage11CityIslandSegBlocked(x0, z0, x1, z1)) return true;
    const half = Math.hypot(x1 - x0, z1 - z0) * 0.5;
    const list = nearBlockers((x0 + x1) * 0.5, (z0 + z1) * 0.5, half, false);
    for (const b of list)
        if (b.kind !== 'combat-vehicle' && segBox(x0, z0, x1, z1, b)) return true;
    return false;
}
// The city is flat: elevation would only read as shading from this camera and
// would cost every robot and every drop an extra height query per frame.
export function stage11SurfaceGroundHeight() { return 0; }
export function stage11SurfaceNav() { return nav; }
export const stage11SurfaceHitsBlocker = pointBlocked;

// --- ground and roads --------------------------------------------------------

function buildGround() {
    const g = new THREE.Group();
    mesh(g, new THREE.PlaneGeometry(BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0),
        material('cityGround', 0x40563a), (BOUNDS.x0 + BOUNDS.x1) * 0.5, GROUND_Y,
        (BOUNDS.z0 + BOUNDS.z1) * 0.5, -Math.PI / 2, 0, 0, false, true);
    // Cleared ground shading between the districts: the capital reads as cut out
    // of the forest rather than dropped onto a lawn. Flat, no collider.
    for (let i = 0; i < 46; i++) {
        const x = BOUNDS.x0 + 300 + hash(i, 3) * (BOUNDS.x1 - BOUNDS.x0 - 600);
        const z = BOUNDS.z0 + 300 + hash(i, 4) * (BOUNDS.z1 - BOUNDS.z0 - 600);
        if (stage11CityRoadClearance(x, z) < 120) continue;
        mesh(g, new THREE.PlaneGeometry(240 + hash(i, 5) * 360,
            200 + hash(i, 6) * 320), material(`cityGrade-${i % 3}`,
            i % 3 === 0 ? 0x4b5f3d : i % 3 === 1 ? 0x38502f : 0x55643f),
        x, GROUND_Y + 0.4, z, -Math.PI / 2, 0, hash(i, 7) * Math.PI, false, false);
        count('ground-grade');
    }
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

// An edge that meets a roundabout is TRIMMED to the ring's outer radius, so its
// square end sits tangent to a curve and leaves a crescent of bare ground on
// each side — which is exactly what read as "the road does not reach the
// roundabout". The DRAWN quad therefore runs on to the island edge and overlaps
// the carriageway; both surfaces sit at exactly the same height, so the overlap
// costs nothing and cannot z-fight.
function drawSpan(e) {
    const rA = S11_CITY_ROUNDABOUTS.find(r => r.id === e.a);
    const rB = S11_CITY_ROUNDABOUTS.find(r => r.id === e.b);
    const ax = rA ? e.ax - e.tx * rA.ring : e.ax;
    const az = rA ? e.az - e.tz * rA.ring : e.az;
    const bx = rB ? e.bx + e.tx * rB.ring : e.bx;
    const bz = rB ? e.bz + e.tz * rB.ring : e.bz;
    return { ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az) };
}

function buildRoads() {
    const g = new THREE.Group();
    const asphalt = material('cityAsphalt', 0x2f3538);
    const lane = material('cityLane', 0xb3ac97);
    const edgeLine = material('cityEdgeLine', 0x9aa093);
    const pave = material('citySidewalk', 0x8b8a80);
    for (const e of S11_CITY_EDGES) {
        // A road corridor is a CAPSULE (distance to segment), so the drawn
        // surface is a quad plus a disc at each node: the node caps are what
        // fill every junction instead of leaving a notch between two quads.
        const d = drawSpan(e);
        mesh(g, groundQuad(d.len, e.w * 2), asphalt,
            (d.ax + d.bx) * 0.5, ROAD_TOP, (d.az + d.bz) * 0.5,
            0, e.yaw, 0, false, true);
        for (const side of [-1, 1])
            mesh(g, groundQuad(d.len, SIDEWALK), pave,
                (d.ax + d.bx) * 0.5 + (-e.tz) * side * (e.w + SIDEWALK * 0.5),
                PAVE_TOP,
                (d.az + d.bz) * 0.5 + e.tx * side * (e.w + SIDEWALK * 0.5),
                0, e.yaw, 0, false, true);
        // Dashed centre line. No arrows, no destination boards, no wayfinding of
        // any kind anywhere in this chapter — and NOTHING painted through an
        // intersection, which is what a dash laid straight across a junction
        // mouth looks like: a bend that does not join up.
        const dashes = Math.max(1, Math.floor(d.len / 90));
        for (let i = 0; i < dashes; i++) {
            const t = (i + 0.5) / dashes;
            const px = d.ax + (d.bx - d.ax) * t, pz = d.az + (d.bz - d.az) * t;
            if (stage11CityCrossingAsphalt(e.index, px, pz)) continue;
            mesh(g, new THREE.BoxGeometry(38, 0.5, 2.4), lane,
                px, MARK_Y, pz, 0, e.yaw, 0, false, false);
        }
        // Edge lines are laid in pieces for the same reason: one long box would
        // run straight over every junction the road opens onto.
        const steps = Math.max(1, Math.round(d.len / 44));
        for (const side of [-1, 1]) for (let i = 0; i < steps; i++) {
            const t = (i + 0.5) / steps;
            const px = d.ax + (d.bx - d.ax) * t + (-e.tz) * side * (e.w - 7);
            const pz = d.az + (d.bz - d.az) * t + e.tx * side * (e.w - 7);
            if (stage11CityCrossingAsphalt(e.index, px, pz)) continue;
            mesh(g, new THREE.BoxGeometry(d.len / steps + 0.4, 0.5, 2.2),
                edgeLine, px, MARK_Y, pz, 0, e.yaw, 0, false, false);
        }
        count('road-segment');
    }
    // Junction and dead-end caps. 28 segments, not 14: at a 90-unit radius a
    // 14-sided disc is 2.3 units off the circle the predicate actually uses,
    // and that shows as a chipped corner on every bend.
    for (const [name, n] of Object.entries(S11_CITY_NODES)) {
        if (n.island) continue;
        let w = 0;
        for (const e of S11_CITY_EDGES)
            if (e.a === name || e.b === name) w = Math.max(w, e.w);
        if (!w) continue;
        mesh(g, groundDisc(0.01, w + SIDEWALK, 28), pave,
            n.x, PAVE_TOP, n.z, 0, 0, 0, false, true);
        mesh(g, groundDisc(0.01, w, 28), asphalt,
            n.x, ROAD_TOP, n.z, 0, 0, 0, false, true);
        count('junction-cap');
    }
    for (const R of S11_CITY_ROUNDABOUTS) {
        // The carriageway's own pavement, on its outer edge, laid first and a
        // kerb lower so an approach road crossing it always wins.
        mesh(g, groundDisc(R.outer, R.outer + SIDEWALK, 40), pave,
            R.x, PAVE_TOP, R.z, 0, 0, 0, false, true);
        mesh(g, groundDisc(R.inner, R.outer, 40), asphalt,
            R.x, ROAD_TOP, R.z, 0, 0, 0, false, true);
        mesh(g, groundDisc(R.inner + 26, R.inner + 28.4, 40), lane,
            R.x, MARK_Y, R.z, 0, 0, 0, false, false);
        count('roundabout-carriageway');
    }
    // Headquarters forecourt.
    mesh(g, groundDisc(0.01, S11_CITY_HQ_APRON, 28), material('cityApron', 0x3a4043),
        S11_CITY_HQ.x, ROAD_TOP, S11_CITY_HQ.z, 0, 0, 0, false, true);
    count('headquarters-apron');
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

// The boundary the player actually meets: kerb, 1.5 m pavement and railing, all
// laid on the walk contour itself, so what is drawn is exactly what stops them.
// Zero blockers, because the predicate already IS the wall.
//
// Runs are polylines, so a bend and a dead end get the same treatment as a
// straight: the corner arcs close the outer side of every turn, which is what
// used to be left open by offsetting each road independently.
function buildBoundary() {
    const runs = stage11CityFenceRuns(FENCE_SAMPLE, FENCE_TOL);
    const clear = CFG.player.radius;
    fenceRunCount = runs.length;
    fenceRuns.length = 0;
    const chunks = new Map();
    const rail = material('cityFenceRail', PAL.steel);
    const post = material('cityFencePost', PAL.gunmetal);
    const kerb = material('cityKerb', PAL.concrete);
    const pave = material('citySidewalk', 0x8b8a80);
    const chunkFor = (x, z) => {
        const k = `${Math.floor((x - BOUNDS.x0) / CHUNK)}|`
            + `${Math.floor((z - BOUNDS.z0) / CHUNK)}`;
        let c = chunks.get(k);
        if (!c) { c = new THREE.Group(); chunks.set(k, c); }
        return c;
    };
    for (const run of runs) {
        fencePanelCount += run.panels;
        fenceRuns.push({ kind: run.kind, panels: run.panels,
            pts: run.pts.map(p => ({ x: p.x, z: p.z, nx: p.nx, nz: p.nz })) });
        const barrier = run.kind === 'start-cut';
        for (let i = 0; i < run.pts.length - 1; i++) {
            const a = run.pts[i], b = run.pts[i + 1];
            const dx = b.x - a.x, dz = b.z - a.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.5) continue;
            const yaw = Math.atan2(-dz, dx);
            const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
            let ix = (a.nx + b.nx) * 0.5, iz = (a.nz + b.nz) * 0.5;
            const il = Math.hypot(ix, iz) || 1; ix /= il; iz /= il;
            const chunk = chunkFor(mx, mz);
            // A uniform hair of overlap. Runs that meet at a crossing are
            // already pulled to a shared point by `stitchRuns`, so no piece has
            // to be stretched over a gap it cannot measure.
            const head = 0.4, tail = 0.4;
            const span = len + head + tail;
            const cx = mx + (tail - head) * 0.5 * (dx / len);
            const cz = mz + (tail - head) * 0.5 * (dz / len);
            if (!barrier) {
                // Pavement, flush with the asphalt: the corridor is ONE walk
                // plane, so the player never meets a step the ground height
                // does not have.
                mesh(chunk, groundQuad(span, SIDEWALK), pave,
                    cx + ix * SIDEWALK * 0.5, PAVE_TOP,
                    cz + iz * SIDEWALK * 0.5, 0, yaw, 0, false, true);
                // Kerb: drawn on the line where the asphalt actually ends.
                // The kerb straddles the 4 cm step, so the drop is read as a
                // kerb rather than seen as a seam.
                mesh(chunk, new THREE.BoxGeometry(span, 1.0, 1.9), kerb,
                    cx + ix * SIDEWALK, ROAD_TOP + 0.2, cz + iz * SIDEWALK,
                    0, yaw, 0, false, false);
            }
            for (const y of [4.6, 8.6])
                mesh(chunk, new THREE.BoxGeometry(span, 1.5, 1.6), rail,
                    cx, y, cz, 0, yaw, 0, false, false);
        }
        // Posts follow ARC LENGTH, not the simplified vertex list: a long
        // straight is one segment and would otherwise carry two posts.
        let carry = 0;
        for (let i = 0; i < run.pts.length - 1; i++) {
            const a = run.pts[i], b = run.pts[i + 1];
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            for (let d = carry; d < len; d += POST_SPACING) {
                const t = d / len;
                const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
                // A run ends where a junction opens, so a post can still land
                // inside the road it opens onto — a drawn prop the player would
                // walk through. Dropped, and then measured, rather than assumed.
                if (stage11CityWalk(px, pz, clear)) continue;
                mesh(chunkFor(px, pz), new THREE.BoxGeometry(2.4, FENCE_H, 2.4),
                    post, px, FENCE_H * 0.5, pz, 0, 0, 0, false, false);
                fencePosts.push({ x: px, z: pz });
                if (stage11CityWalk(px, pz, clear)) fenceInsideViolations++;
            }
            carry = (carry - len) % POST_SPACING;
            if (carry < 0) carry += POST_SPACING;
        }
        count('boundary-fence-run');
    }
    for (const [id, chunk] of chunks) {
        const outNodes = addMergedStaticShadowAware(root, [chunk]);
        weldedMeshes += outNodes.length;
        chunkStats.push({ id: `boundary-${id}`, batches: outNodes.length });
    }
    fenceLooseEnds = countLooseEnds(runs);
}

// A run end that touches no other run AND is not standing at an open junction
// mouth is a break the player can see: the railing simply stops. The mouth test
// is geometric — step inward from the end and ask whether that is open road.
function countLooseEnds(runs) {
    const segDist = (x, z, a, b) => {
        const dx = b.x - a.x, dz = b.z - a.z, den = dx * dx + dz * dz;
        const t = den > 1e-9
            ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / den)) : 0;
        return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    };
    let loose = 0;
    for (const r of runs) {
        if (r.closed) continue;
        for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) {
            let best = Infinity;
            for (const o of runs) {
                if (o === r) continue;
                for (let i = 0; i < o.pts.length - 1; i++)
                    best = Math.min(best, segDist(end.x, end.z, o.pts[i], o.pts[i + 1]));
            }
            if (best <= 2) continue;
            if (stage11CityWalk(end.x + end.nx * 3, end.z + end.nz * 3,
                CFG.player.radius)) continue;              // an open mouth
            loose++;
        }
    }
    return loose;
}

// The boulevard the player arrived on CONTINUES behind them and is simply closed
// off. A road that ends in a round cul-de-sac reads as the edge of the world;
// a carriageway running on past a barrier reads as a city they came from. All of
// this is decor — the walk predicate stops `S11_CITY_START_BACK_UNITS` behind the
// start, and the barrier drawn on that exact line is the `start-cut` boundary
// run, so there is no invisible wall here either.
function buildStartStub() {
    const g = new THREE.Group();
    const e0 = S11_CITY_EDGES[0];
    const T = S11_CITY_START_TANGENT;
    const off = e0.w + SIDEWALK;
    const R = S11_CITY_START_RENDER_UNITS;
    const yaw = Math.atan2(-T.tz, T.tx);
    const nx = -T.tz, nz = T.tx;
    const back = (u, lat = 0) => ({
        x: S11_CITY_START.x - T.tx * u + nx * lat,
        z: S11_CITY_START.z - T.tz * u + nz * lat,
    });
    const mid = back(R * 0.5);
    mesh(g, groundQuad(R, e0.w * 2), material('cityAsphalt', 0x2f3538),
        mid.x, ROAD_TOP, mid.z, 0, yaw, 0, false, true);
    for (const side of [-1, 1]) {
        const q = back(R * 0.5, side * (e0.w + SIDEWALK * 0.5));
        mesh(g, groundQuad(R, SIDEWALK), material('citySidewalk', 0x8b8a80),
            q.x, PAVE_TOP, q.z, 0, yaw, 0, false, true);
        const k = back(R * 0.5, side * e0.w);
        mesh(g, new THREE.BoxGeometry(R, 1.0, 1.9), material('cityKerb', PAL.concrete),
            k.x, ROAD_TOP + 0.2, k.z, 0, yaw, 0, false, false);
        // The same railing carries on down both sides, so the closed street is
        // clearly a street and not a painted backdrop.
        const f = back(R * 0.5, side * off);
        for (const y of [4.6, 8.6])
            mesh(g, new THREE.BoxGeometry(R, 1.5, 1.6), material('cityFenceRail', PAL.steel),
                f.x, y, f.z, 0, yaw, 0, false, false);
        for (let u = S11_CITY_START_BACK_UNITS; u <= R; u += POST_SPACING) {
            const q2 = back(u, side * off);
            mesh(g, new THREE.BoxGeometry(2.4, FENCE_H, 2.4),
                material('cityFencePost', PAL.gunmetal), q2.x, FENCE_H * 0.5, q2.z,
                0, 0, 0, false, false);
        }
    }
    const dashes = Math.max(1, Math.floor(R / 90));
    for (let i = 0; i < dashes; i++) {
        const q = back(R * (i + 0.5) / dashes);
        mesh(g, new THREE.BoxGeometry(38, 0.5, 2.4), material('cityLane', 0xb3ac97),
            q.x, MARK_Y, q.z, 0, yaw, 0, false, false);
    }
    startStubMeters = R / CAMP_M;
    count('start-approach');
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

// Abandoned traffic, using Stage 7's own vehicle rigs so the campaign has ONE
// car. Parked at the kerb on alternating sides: the carriageway itself stays
// open, every vehicle is a real collider on the footprint it is drawn with, and
// they are welded per CHUNK rather than one node each — 130 individually welded
// occluders would cost more draw groups than the entire skyline.
const TRAFFIC_TYPES = Object.freeze([
    'sedan', 'sedan', 'suv', 'pickup', 'bus', 'suv', 'sedan',
    'container-truck', 'sedan', 'dump-truck', 'suv', 'tanker-truck',
]);
// Stage 7's rigs mint NINE fresh materials per vehicle, so 274 wrecks would be
// 2,466 distinct material instances and the batcher — which buckets by material
// INSTANCE — would hand back a draw group for nearly every one of them. Sharing
// them by VALUE collapses that to a dozen, which is what makes a city full of
// abandoned traffic cost about as much as one welded district.
const trafficMats = new Map();
function shareTrafficMaterials(rig) {
    rig.traverse(o => {
        if (!o.material) return;
        o.castShadow = false; o.receiveShadow = false;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const out = list.map(m => {
            if (!m || !m.color) return m;
            const key = `${m.type}|${m.color.getHex()}|`
                + `${m.emissive ? m.emissive.getHex() : 0}|`
                + `${m.emissiveIntensity || 0}|${!!m.transparent}|`
                + `${m.opacity == null ? 1 : m.opacity}|${!!m.flatShading}`;
            if (!trafficMats.has(key)) trafficMats.set(key, m);
            return trafficMats.get(key);
        });
        o.material = Array.isArray(o.material) ? out : out[0];
    });
    return rig;
}
function buildTrafficVehicle(type, color) {
    if (type === 'suv') return new FuturisticSUV({ bodyColor: color,
        scale: CAMP_M, enableLights: false }).group;
    if (type === 'sedan') {
        const g2 = new FuturisticSedan(color).group;
        g2.scale.setScalar(CAMP_M);
        return g2;
    }
    return buildStage7RoadVehicle(type, color, CAMP_M);
}
// Widest contiguous stretch of road still walkable across a point, swept
// perpendicular to whichever road is nearest. It is measured with every collider
// already in place — including the vehicle itself — so "does this wreck seal its
// own street" has exactly ONE definition, used by the build and by the tests.
export function stage11SurfaceFreeLane(x, z) {
    const q = stage11CityNearestRoad(x, z);
    if (!q) return 0;
    const e = q.edge, nx = -e.tz, nz = e.tx, lim = e.w + SIDEWALK;
    const clear = CFG.player.radius;
    let run = 0, best = 0;
    for (let o = -lim; o <= lim; o += 2) {
        const px = x + nx * o, pz = z + nz * o;
        const free = stage11CityWalk(px, pz, clear) && !pointBlocked(px, pz, clear);
        run = free ? run + 2 : 0;
        if (run > best) best = run;
    }
    return best;
}

function buildTraffic() {
    const T = CFG.campaign.stage11.cityAxis.traffic;
    const want = Math.max(0, T.count | 0);
    const colors = T.colors;
    const chunks = new Map();
    const placed = [];
    let id = 0;
    for (const e of S11_CITY_EDGES) {
        const steps = Math.max(1, Math.round(e.len / T.spacingUnits));
        for (let i = 0; i < steps && placed.length < want; i++) {
            const seed = e.index * 211 + i;
            if (hash(seed, 40) > T.density) continue;
            const type = TRAFFIC_TYPES[(seed * 7) % TRAFFIC_TYPES.length];
            const spec = STAGE7_ROAD_VEHICLE_SPECS[type];
            const halfLen = spec.length * CAMP_M * 0.5;
            const halfWide = spec.width * CAMP_M * 0.5;
            const side = ((e.index + i) % 2) ? 1 : -1;
            // Against the kerb. The free run on the other side of the centre
            // line is what keeps every road driveable past the wreck.
            const lat = side * Math.max(0, e.w - halfWide - 6);
            const t = (i + 0.5) / steps;
            const x = e.ax + (e.bx - e.ax) * t + (-e.tz) * lat;
            const z = e.az + (e.bz - e.az) * t + e.tx * lat;
            if (pointBlocked(x, z, Math.max(halfLen, halfWide) + 4)) continue;
            if (S11_CITY_BLOCKADES.some(b =>
                (b.x - x) ** 2 + (b.z - z) ** 2 < T.blockadeClearUnits ** 2)) continue;
            if ((x - S11_CITY_START.x) ** 2 + (z - S11_CITY_START.z) ** 2
                < T.startClearUnits ** 2) continue;
            if (placed.some(q => (q.x - x) ** 2 + (q.z - z) ** 2
                < T.minGapUnits ** 2)) continue;
            const yaw = e.yaw + (hash(seed, 41) < 0.5 ? 0 : Math.PI)
                + (hash(seed, 42) - 0.5) * 0.16;
            const rig = buildTrafficVehicle(type, colors[id % colors.length]);
            if (!rig) continue;
            shareTrafficMaterials(rig);
            rig.position.set(x, 0, z); rig.rotation.y = yaw;
            rig.name = `stage11-city-traffic-${id + 1}`;
            const box = blocker(x, z, halfLen, halfWide,
                spec.height * CAMP_M, yaw, 'traffic');
            placed.push({ x, z, type, yaw, id: id + 1, rig, box, freeLane: 0,
                lengthMeters: spec.length, widthMeters: spec.width,
                heightMeters: spec.height });
            id++;
        }
    }
    trafficPending = placed;
    trafficChunks = chunks;
}

// Verified and welded only once EVERY collider in the chapter is standing —
// fabricators and weapon vehicles are placed after the traffic, and a wreck plus
// a fabricator can seal a street that neither of them seals alone. A vehicle
// that fails is simply not built; removing one only ever frees space, so a
// single pass settles it.
function finishTraffic() {
    const T = CFG.campaign.stage11.cityAxis.traffic;
    const placed = trafficPending, chunks = trafficChunks;
    for (let i = placed.length - 1; i >= 0; i--) {
        const v = placed[i];
        v.freeLane = stage11SurfaceFreeLane(v.x, v.z);
        if (v.freeLane >= T.freeLaneUnits) continue;
        blockers.splice(blockers.indexOf(v.box), 1);
        placed.splice(i, 1);
        trafficRejected++;
    }
    for (const v of placed) {
        const k = `${Math.floor((v.x - BOUNDS.x0) / TRAFFIC_CHUNK)}|`
            + `${Math.floor((v.z - BOUNDS.z0) / TRAFFIC_CHUNK)}`;
        let chunk = chunks.get(k);
        if (!chunk) { chunk = new THREE.Group(); chunks.set(k, chunk); }
        chunk.add(v.rig);
        v.freeLane = stage11SurfaceFreeLane(v.x, v.z);
        trafficRecords.push({ x: v.x, z: v.z, type: v.type, yaw: v.yaw,
            id: v.id, freeLane: v.freeLane, lengthMeters: v.lengthMeters,
            widthMeters: v.widthMeters, heightMeters: v.heightMeters });
    }
    for (const [k, chunk] of chunks) {
        const outNodes = addMergedStaticShadowAware(root, [chunk]);
        weldedMeshes += outNodes.length;
        chunkStats.push({ id: `traffic-${k}`, batches: outNodes.length });
    }
    count('abandoned-vehicle', placed.length);
    for (const t of TRAFFIC_TYPES)
        if (!semantic.has(`traffic-${t}`))
            count(`traffic-${t}`, placed.filter(q => q.type === t).length);
    trafficPending = []; trafficChunks = null;
}

function buildRoundabouts() {
    const g = new THREE.Group();
    for (const [i, R] of S11_CITY_ROUNDABOUTS.entries()) {
        // The island WALL is drawn on exactly the radius the walk predicate
        // excludes, so being held out of the middle is something the player can
        // see rather than an invisible circle.
        mesh(g, new THREE.CylinderGeometry(R.inner, R.inner + 8, 13, 30),
            material('islandWall', PAL.concrete), R.x, 6.5, R.z, 0, 0, 0, true, true);
        mesh(g, new THREE.CylinderGeometry(R.inner - 6, R.inner - 6, 2.4, 30),
            material('islandLawn', 0x4e6b41), R.x, 13.6, R.z, 0, 0, 0, false, true);
        mesh(g, new THREE.TorusGeometry(R.inner + 2, 2.4, 6, 30),
            material('islandKerbLight', PAL.techDim,
                { emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * 0.32 }),
            R.x, 13.4, R.z, Math.PI / 2, 0, 0, false, false);
        // A civic monument on each island: the thing the roundabout exists for,
        // and unreachable by design.
        const h = 96 - i * 18;
        mesh(g, new THREE.CylinderGeometry(R.inner * 0.42, R.inner * 0.52, 12, 12),
            material('monumentBase', PAL.panel), R.x, 20.6, R.z, 0, 0, 0, true, true);
        for (let k = 0; k < 4; k++)
            mesh(g, new THREE.BoxGeometry(20 - k * 3, h * 0.26, 20 - k * 3),
                k % 2 ? material('monumentDark', PAL.gunmetal)
                    : material('monumentPale', 0xc2bcae),
                R.x, 27 + h * 0.26 * (k + 0.5), R.z, 0, k * 0.22, 0, true, true);
        mesh(g, new THREE.ConeGeometry(9, 26, 8), material('monumentCrown', PAL.steel),
            R.x, 27 + h * 1.04 + 13, R.z, 0, 0, 0, true, true);
        for (let t = 0; t < 10; t++) {
            const a = t / 10 * Math.PI * 2, r = R.inner * 0.74;
            mesh(g, new THREE.CylinderGeometry(1.6, 2.4, 22, 6),
                material('islandTrunk', PAL.wood),
                R.x + Math.cos(a) * r, 25, R.z + Math.sin(a) * r);
            mesh(g, new THREE.DodecahedronGeometry(1, 0),
                material('islandLeaf', PAL.leaf),
                R.x + Math.cos(a) * r, 42, R.z + Math.sin(a) * r,
                0, a, 0, false, false).scale.set(13, 9, 13);
        }
        count('roundabout-island');
    }
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

// --- 2045 civic language ------------------------------------------------------
//
// One vocabulary shared by every archetype, so the skyline reads as ONE city
// instead of ten unrelated props: a warm pale/concrete structural mass, a
// REPEATED horizontal glazing band in the single civic teal, planted setbacks,
// and dark solar louvres. Pitched tile roofs and cone caps stay deleted — they
// read as a heritage complex, not a capital built in 2045.
const ARCHETYPES = Object.freeze([
    'civic-palace', 'cultural-hall', 'garden-tower', 'ministry', 'transit-hub',
    'skybridge', 'water-garden', 'colonnade', 'forest-terrace', 'civic-spire',
]);

function cityMats() {
    return {
        pale: material('civicPale', 0xc2bcae),
        concrete: material('civicConcrete', PAL.concrete),
        dark: material('civicDark', PAL.gunmetal),
        steel: material('civicSteel', PAL.steel),
        glass: material('civicGlass', PAL.screenBg,
            { emissive: PAL.techDim, emissiveIntensity: .34 }),
        litGlass: material('civicGlassLit', PAL.screenBg,
            { emissive: PAL.tech, emissiveIntensity: .30 }),
        solar: material('civicSolar', PAL.ink),
        leaf: material('towerLeaf', PAL.leaf),
    };
}
function glazingBands(g, x, z, w, d, y0, y1, bands, M, id = 0) {
    const span = Math.max(1, y1 - y0), h = span / bands;
    for (let i = 0; i < bands; i++)
        mesh(g, new THREE.BoxGeometry(w * 1.02, h * .52, d * 1.02),
            hash(id, 60 + i) > .45 ? M.litGlass : M.glass,
            x, y0 + h * (i + .5), z, 0, 0, 0, false, false);
}
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
        mesh(g, new THREE.BoxGeometry(w * 1.5, top * .30, d * 1.25), M.glass,
            x, top * .15, z);
        for (let k = 0; k < 4; k++)
            mesh(g, new THREE.BoxGeometry(w * 1.7, top * .07, d * (1.4 - k * .22)),
                k % 2 ? M.pale : M.concrete, x + (k - 1.5) * w * .10,
                top * (.34 + k * .09), z, 0, 0, (k - 1.5) * .10, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.85, top * .05, d * 1.55), M.solar,
            x, top * .70, z, 0, 0, -.06, false, false);
    } else if (type === 'garden-tower') {
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
        mesh(g, new THREE.BoxGeometry(w, top, d), M.concrete, x, top / 2, z);
        glazingBands(g, x, z, w, d, top * .08, top * .92, 5 + band, M, id);
        for (let t = 0; t < 5; t++)
            mesh(g, new THREE.BoxGeometry(w * 1.06, 2.4, d * 1.06), M.pale,
                x, top * (.14 + t * .17), z, 0, 0, 0, false, false);
        briseSoleil(g, x, z, w, d, top * .55, top * .74, 8, M);
        plantedLip(g, x, z, w * .92, d * .92, top + 1, M);
    } else if (type === 'transit-hub') {
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
        mesh(g, new THREE.BoxGeometry(w * 1.8, 4, d * 1.15), M.concrete, x, 2, z);
        for (let k = -4; k <= 4; k++)
            mesh(g, new THREE.BoxGeometry(w * .05, top, d * .10), M.pale,
                x + k * w * .18, top / 2, z, 0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.7, 3, d), M.steel, x, top, z,
            0, 0, 0, false, false);
        mesh(g, new THREE.BoxGeometry(w * 1.62, 1.6, d * .86), M.solar,
            x, top + 2.6, z, 0, 0, .05, false, false);
    } else if (type === 'forest-terrace') {
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
    clusters.push({ id, type, band, x, z, top, radius: Math.max(w, d),
        rawParts: g.children.length, glazed, coneRoofs });
    return g;
}

// Buildings line the STREETS, because that is what makes a road network read as
// a city rather than a lane through a field. Every plot is measured against the
// asphalt it stands beside and rejected if it touches it.
function buildDistricts() {
    const chunks = new Map();
    let id = 0;
    const place = (x, z, band, scale) => {
        const plot = scale * 1.9;
        if (stage11CityRoadClearance(x, z) < plot * 0.55 + 22) return false;
        if (x < BOUNDS.x0 + 120 || x > BOUNDS.x1 - 120
            || z < BOUNDS.z0 + 120 || z > BOUNDS.z1 - 120) return false;
        if (stage11CityWalk(x, z, 0)) { buildingOnRoadViolations++; return false; }
        const type = ARCHETYPES[(id * 7 + band * 3) % ARCHETYPES.length];
        const g = clusterShell(type, x, z, scale, band, id);
        const c = clusters[clusters.length - 1];
        if (band === 0) {
            // The front row is what actually stands between the player and the
            // camera, so it fades; the rest is backdrop and batches by chunk.
            weldOccluder(S11_SURFACE_OCC, root, g,
                { x, z, radius: c.radius * 1.1, top: c.top });
            occluderCount++;
        } else {
            const k = `${band}-${Math.floor((x - BOUNDS.x0) / CHUNK)}`
                + `-${Math.floor((z - BOUNDS.z0) / CHUNK)}`;
            let chunk = chunks.get(k);
            if (!chunk) { chunk = { group: new THREE.Group(), n: 0 }; chunks.set(k, chunk); }
            chunk.group.add(g); chunk.n++;
        }
        id++;
        return true;
    };
    for (const e of S11_CITY_EDGES) {
        const steps = Math.max(1, Math.round(e.len / 300));
        for (let i = 0; i < steps; i++) {
            const t = (i + 0.5) / steps;
            const bx = e.ax + (e.bx - e.ax) * t, bz = e.az + (e.bz - e.az) * t;
            for (const side of [-1, 1]) {
                const seed = e.index * 97 + i * 7 + (side > 0 ? 3 : 0);
                const nx = -e.tz * side, nz = e.tx * side;
                const front = e.w + 52 + hash(seed, 10) * 34;
                place(bx + nx * front, bz + nz * front, 0, 26 + hash(seed, 11) * 16);
                if (hash(seed, 12) < 0.45) {
                    const mid = e.w + 250 + hash(seed, 13) * 120;
                    place(bx + nx * mid, bz + nz * mid, 1, 34 + hash(seed, 14) * 22);
                }
                if (hash(seed, 15) < 0.16) {
                    const far = e.w + 540 + hash(seed, 16) * 260;
                    place(bx + nx * far, bz + nz * far, 2, 46 + hash(seed, 17) * 26);
                }
            }
        }
    }
    for (const [k, chunk] of chunks) {
        const out = addMergedStaticShadowAware(root, [chunk.group]);
        weldedMeshes += out.length;
        chunkStats.push({ id: `district-${k}`, clusters: chunk.n, batches: out.length });
    }
}

// The forest the capital was cut into. Instanced, so every tree costs no draw
// call at all, and none of them carries a collider.
function buildForest() {
    const capacity = 2600;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.35, 1, 6),
        material('cityTrunk', PAL.wood), capacity);
    const lower = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
        material('cityLeafDark', 0x33532f), capacity);
    const upper = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
        material('cityLeaf', 0x4a6c3f), capacity);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scale = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < capacity * 4 && n < capacity; i++) {
        let x, z;
        if (i % 3 !== 0) {
            // Two thirds line the avenues: the tropical capital's street section.
            const e = S11_CITY_EDGES[Math.floor(hash(i, 1) * S11_CITY_EDGES.length)];
            const t = hash(i, 2), side = hash(i, 3) < 0.5 ? -1 : 1;
            const off = e.w + 16 + hash(i, 4) * 26;
            x = e.ax + (e.bx - e.ax) * t + (-e.tz) * side * off;
            z = e.az + (e.bz - e.az) * t + e.tx * side * off;
        } else {
            x = BOUNDS.x0 + 60 + hash(i, 1) * (BOUNDS.x1 - BOUNDS.x0 - 120);
            z = BOUNDS.z0 + 60 + hash(i, 2) * (BOUNDS.z1 - BOUNDS.z0 - 120);
        }
        if (stage11CityRoadClearance(x, z) < 14) continue;
        const h = 22 + hash(i, 5) * 26, r = 9 + hash(i, 6) * 10;
        matrix.compose(pos.set(x, h / 2, z), q,
            scale.set(2.2 + hash(i, 7) * 2, h, 2.2 + hash(i, 8) * 2));
        trunk.setMatrixAt(n, matrix);
        matrix.compose(pos.set(x - r * .22, h * .78, z + r * .16), q,
            scale.set(r * 1.12, r * .58, r)); lower.setMatrixAt(n, matrix);
        matrix.compose(pos.set(x + r * .18, h + r * .12, z - r * .12), q,
            scale.set(r, r * .68, r * 1.08)); upper.setMatrixAt(n, matrix);
        n++;
    }
    for (const batch of [trunk, lower, upper]) {
        batch.count = n; batch.instanceMatrix.needsUpdate = true;
        batch.castShadow = false; batch.receiveShadow = false;
        root.add(batch); instancedNodes++;
    }
    treeCount = n; rawMeshes += 3;
    count('city-tree', n);
}

// Street furniture: lighting masts and planted verges, all standing OUTSIDE the
// walk corridor beside the fence, so none of it needs — or has — a collider.
function buildStreetFurniture() {
    const g = new THREE.Group();
    const mast = material('cityMast', PAL.steel);
    const amber = material('cityLampHead', PAL.amberDim,
        { emissive: PAL.amber, emissiveIntensity: EMISSIVE_MAX * 0.34 });
    const strip = material('cityStrip', PAL.techDim,
        { emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * 0.3 });
    let masts = 0;
    for (const e of S11_CITY_EDGES) {
        const steps = Math.max(1, Math.round(e.len / 150));
        for (let i = 0; i < steps; i++) {
            const t = (i + 0.5) / steps, side = i % 2 ? 1 : -1;
            const off = e.w + 13;
            const x = e.ax + (e.bx - e.ax) * t + (-e.tz) * side * off;
            const z = e.az + (e.bz - e.az) * t + e.tx * side * off;
            if (stage11CityWalk(x, z, 2)) continue;
            mesh(g, new THREE.CylinderGeometry(1.1, 1.8, 34, 6), mast, x, 17, z);
            mesh(g, new THREE.BoxGeometry(3, 2.2, 14), mast, x, 34,
                z - e.tx * side * 5, 0, e.yaw, 0, false, false);
            mesh(g, new THREE.BoxGeometry(2.2, 0.8, 11), amber, x, 32.8,
                z - e.tx * side * 5, 0, e.yaw, 0, false, false);
            mesh(g, new THREE.BoxGeometry(0.9, 15, 0.9), strip, x + 1.3, 16, z,
                0, 0, 0, false, false);
            masts++;
        }
    }
    count('street-light-mast', masts);
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;
}

// --- headquarters ------------------------------------------------------------

function buildHeadquarters() {
    const g = new THREE.Group();
    const M = cityMats();
    const tx = HQ_APPROACH.tx, tz = HQ_APPROACH.tz;
    const nx = -tz, nz = tx;
    const at = (along, lateral) => ({
        x: S11_CITY_HQ.x + tx * along + nx * lateral,
        z: S11_CITY_HQ.z + tz * along + nz * lateral,
    });
    const wall = material('hqWall', PAL.gunmetal);
    const hazard = material('hqHazard', PAL.hazard,
        { emissive: PAL.hazard, emissiveIntensity: EMISSIVE_MAX * 0.4 });
    const NEAR = S11_CITY_HQ_APRON * 0.86;
    const DEPTH = 520, HALF = 300, GATE_HALF = 78;
    // Perimeter wall. It is drawn on its own line and blocks there, which is the
    // only reason the compound cannot be walked into around the side.
    for (const side of [-1, 1]) {
        const p = at(NEAR + DEPTH * 0.5, side * HALF);
        mesh(g, new THREE.BoxGeometry(DEPTH, 26, 12), wall, p.x, 13, p.z,
            0, HQ_APPROACH.yaw, 0, true, true);
        blocker(p.x, p.z, DEPTH * 0.5, 6, 26, HQ_APPROACH.yaw, 'hq-wall');
        // Front wall in two returns, leaving the gate mouth open.
        const q = at(NEAR, side * (GATE_HALF + (HALF - GATE_HALF) * 0.5));
        mesh(g, new THREE.BoxGeometry(12, 26, HALF - GATE_HALF), wall, q.x, 13, q.z,
            0, HQ_APPROACH.yaw, 0, true, true);
        blocker(q.x, q.z, 6, (HALF - GATE_HALF) * 0.5, 26, HQ_APPROACH.yaw, 'hq-wall');
        const t = at(NEAR, side * GATE_HALF);
        mesh(g, new THREE.BoxGeometry(18, 42, 18), wall, t.x, 21, t.z,
            0, HQ_APPROACH.yaw, 0, true, true);
        mesh(g, new THREE.BoxGeometry(20, 3, 20), hazard, t.x, 43.5, t.z,
            0, HQ_APPROACH.yaw, 0, false, false);
        blocker(t.x, t.z, 9, 9, 42, HQ_APPROACH.yaw, 'hq-gate-tower');
    }
    const back = at(NEAR + DEPTH, 0);
    mesh(g, new THREE.BoxGeometry(12, 26, HALF * 2), wall, back.x, 13, back.z,
        0, HQ_APPROACH.yaw, 0, true, true);
    blocker(back.x, back.z, 6, HALF, 26, HQ_APPROACH.yaw, 'hq-wall');

    // The command block itself, in the shared 2045 facade language.
    const core = at(NEAR + DEPTH * 0.58, 0);
    mesh(g, new THREE.BoxGeometry(250, 130, 300), M.concrete, core.x, 65, core.z,
        0, HQ_APPROACH.yaw, 0, true, true);
    glazingBands(g, core.x, core.z, 250, 300, 16, 118, 6, M, 991);
    briseSoleil(g, core.x, core.z, 250, 300, 60, 40, 10, M);
    plantedLip(g, core.x, core.z, 230, 280, 132, M);
    for (const side of [-1, 1]) {
        const p = at(NEAR + DEPTH * 0.28, side * 190);
        mesh(g, new THREE.BoxGeometry(120, 74, 150), M.pale, p.x, 37, p.z,
            0, HQ_APPROACH.yaw, 0, true, true);
        glazingBands(g, p.x, p.z, 120, 150, 10, 66, 4, M, 992 + side);
    }
    const mast = at(NEAR + DEPTH * 0.58, 0);
    mesh(g, new THREE.CylinderGeometry(6, 11, 190, 8), M.steel, mast.x, 190, mast.z);
    mesh(g, new THREE.TorusGeometry(24, 3, 6, 18), material('hqDish', PAL.panel),
        mast.x, 280, mast.z, Math.PI / 2, 0, 0, false, false);

    // Descent hatch: the way into Chapter 3. Sunk below the opaque apron when it
    // opens rather than hidden, so its material has been drawn from frame one.
    for (let i = 0; i < 7; i++) {
        const a = -1.1 + i * 0.36;
        mesh(g, new THREE.BoxGeometry(16, 54, 8), material('descentRib', PAL.gunmetal),
            S11_DESCENT.x, 27, S11_DESCENT.z, 0, HQ_APPROACH.yaw, a, true, true);
    }
    descentDoor = mesh(g, new THREE.CylinderGeometry(42, 42, 8, 16),
        material('descentDoor', PAL.gunmetal), S11_DESCENT.x, 4, S11_DESCENT.z,
        Math.PI / 2, 0, 0, true, true);
    count('enemy-headquarters'); count('descent-hatch');
    weldedMeshes += addMergedStaticShadowAware(root, [g]).length;

    for (const side of [-1, 1]) {
        const p = at(NEAR - 40, side * 90);
        const l = new THREE.PointLight(PAL.amber, .7, 120, 2);
        l.position.set(p.x, 30, p.z); root.add(l); lights.push(l);
        registerStageLight(STAGE11_SURFACE_LIGHTS_KEY, l);
    }
}

// --- blockades and their vehicles --------------------------------------------

function buildCityVehicles() {
    const placements = stage11CityVehiclePlacements();
    ensureStage11WeaponVehicles(STAGE11_CITY_VEHICLE_GROUP, root, placements);
    const spec = STAGE11_DOUBLE_CABIN_METERS;
    for (const p of placements)
        blocker(p.x, p.z, spec.length * CAMP_M * 0.5, spec.width * CAMP_M * 0.5,
            spec.height * CAMP_M, p.yaw, 'combat-vehicle');
    count('double-cabin-combat', placements.length);
    count('vehicle-machine-gun',
        placements.filter(p => p.type === 'machineGun').length);
    count('vehicle-homing-missile',
        placements.filter(p => p.type === 'homingMissile').length);
}

function buildBlockades() {
    // Barrier materials live with the world so the blockade module allocates no
    // material of its own; only the status lamp is cloned, per gate.
    mats.gatePylon = material('gatePylon', PAL.gunmetal);
    mats.gateHazard = material('gateHazard', PAL.hazard,
        { emissive: PAL.hazard, emissiveIntensity: EMISSIVE_MAX * 0.4 });
    mats.gateFrame = material('gateFrame', PAL.steel);
    mats.gateWhite = material('gateWhite', PAL.white);
    mats.gateBlock = material('gateBlock', PAL.concrete);
    mats.gateLamp = material('gateLamp', PAL.hazard,
        { emissive: PAL.hazard, emissiveIntensity: EMISSIVE_MAX * 0.5 });
    ensureStage11CityBlockades(root, {
        mesh, blocker, count, mats,
        walk: stage11CityWalk,
        hitsBlocker: pointBlocked,
        projectToRoad: stage11CityProjectToRoad,
    });
}

// --- lifecycle ---------------------------------------------------------------

export function setStage11DescentOpen(open) {
    if (descentDoor) descentDoor.position.y = open ? -12 : 4;
}
export function resetStage11SurfaceVisuals() {
    setStage11DescentOpen(false);
    resetStageOccluders(S11_SURFACE_OCC);
}
export function updateStage11SurfaceVisuals(dt) {
    updateStageOccluders(S11_SURFACE_OCC, dt);
}
export const stage11SurfaceOcclusionDebug = () => occlusionDebug(S11_SURFACE_OCC);

export function ensureStage11SurfaceWorld(parent = scene) {
    if (built) return root;
    built = true; root = new THREE.Group(); root.name = 'campaign-stage11-ikn-city';
    parent.add(root);
    buildGround(); buildRoads(); buildStartStub(); buildRoundabouts();
    buildBoundary(); buildStreetFurniture(); buildDistricts(); buildForest();
    buildHeadquarters();
    // Traffic before the blockades: a fabricator looks for a clear place to
    // stand and must see the parked cars that are already there.
    buildTraffic();
    // Vehicles first: the blockade fabricators check every footprint that
    // already stands on the asphalt before choosing their own place.
    buildCityVehicles(); buildBlockades();
    finishTraffic();
    // Every collider is in place: index them before the nav bake, which is the
    // heaviest consumer of `pointBlocked` in the whole build.
    blockerIndex = makeBlockerIndex(blockers,
        { cell: 200, x0: BOUNDS.x0, z0: BOUNDS.z0 });
    blockerIndex.rebuild();
    // 40-unit cells: the network spans 11.5 x 9.7 thousand units, so the
    // 14-unit cell the old ceremonial rectangle used would bake 680,000 nodes.
    // A road is at least four cells wide at every width in the map.
    const NAV_CELL = 40;
    nav = makeNavGrid(BOUNDS.x0, BOUNDS.z0, NAV_CELL,
        Math.ceil((BOUNDS.x1 - BOUNDS.x0) / NAV_CELL),
        Math.ceil((BOUNDS.z1 - BOUNDS.z0) / NAV_CELL),
        (x, z) => stage11CityWalk(x, z, 3.5) && !pointBlocked(x, z, 3.5));
    registerCampaignWorldRoot({ key: STAGE11_SURFACE_LIGHTS_KEY, root,
        bounds: { ...BOUNDS }, lightsKey: STAGE11_SURFACE_LIGHTS_KEY,
        warmupViews: [S11_SURFACE_START, S11_CITY_ROUNDABOUTS[0], S11_DESCENT],
    });
    return root;
}

export const stage11SurfaceWorldDebug = () => ({
    built, root: root?.name || null, origin: { ...S11_SURFACE_ORIGIN },
    bounds: { ...BOUNDS }, start: { ...S11_SURFACE_START },
    descent: { ...S11_DESCENT }, headquarters: { ...S11_CITY_HEADQUARTERS },
    hqApron: S11_CITY_HQ_APRON, hqGateOffset: HQ_GATE_OFFSET,
    spanMeters: S11_CITY_SPAN_METERS, unitsPerPx: S11_CITY_UNITS_PER_PX,
    roads: stage11CityRoadsDebug(),
    blockades: stage11CityBlockadesDebug(),
    vehicles: stage11WeaponVehiclesDebug(STAGE11_CITY_VEHICLE_GROUP),
    sidewalk: { meters: S11_CITY_SIDEWALK_METERS, units: SIDEWALK,
        walkable: true, kerbDropUnits: ROAD_TOP - PAVE_TOP,
        surfaceStepUnits: SURF_STEP },
    startStub: { backUnits: S11_CITY_START_BACK_UNITS,
        renderUnits: S11_CITY_START_RENDER_UNITS, meters: startStubMeters,
        blockers: 0, closedByRun: 'start-cut' },
    traffic: { count: trafficRecords.length, rejected: trafficRejected,
        materials: trafficMats.size, chunkUnits: TRAFFIC_CHUNK,
        chunks: chunkStats.filter(c => c.id.startsWith('traffic-')).length,
        freeLaneUnits: CFG.campaign.stage11.cityAxis.traffic.freeLaneUnits,
        minFreeLane: trafficRecords.reduce((n, t) =>
            Math.min(n, t.freeLane), Infinity),
        assetSource: 'stage7-roadVehicles+futuristicSedan/SUV',
        types: [...new Set(trafficRecords.map(t => t.type))].sort(),
        weldedInChunks: true,
        records: trafficRecords.map(t => ({ ...t })) },
    blockerIndex: blockerIndex ? blockerIndex.debug() : null,
    fence: { runs: fenceRunCount, panels: fencePanelCount,
        posts: fencePosts.length,
        kinds: fenceRuns.reduce((m, r) => {
            m[r.kind] = (m[r.kind] || 0) + 1; return m;
        }, {}),
        insideViolations: fenceInsideViolations, sampleUnits: FENCE_SAMPLE,
        simplifyTol: FENCE_TOL, postSpacing: POST_SPACING,
        height: FENCE_H, blockers: 0,
        // The run list is what proves there is no UNFENCED stretch of boundary:
        // every point just outside the corridor is either near a run or inside
        // another road, which is a junction mouth.
        runsList: fenceRuns.map(r => ({ kind: r.kind, panels: r.panels,
            pts: r.pts.map(p => ({ ...p })) })),
        // Loose ends: a run end that touches no other run AND does not sit at an
        // open junction mouth is a visible break in the railing. Measured here so
        // the suite can pin it at zero.
        looseEnds: fenceLooseEnds },
    districts: { clusters: clusters.length,
        onRoadViolations: buildingOnRoadViolations,
        bands: [...new Set(clusters.map(c => c.band))],
        occluders: occluderCount },
    skyline: {
        glazedClusters: clusters.filter(c => c.glazed > 0).length,
        coneRoofs: clusters.reduce((n, c) => n + c.coneRoofs, 0),
        minGlazedTall: clusters.filter(c => c.band > 0)
            .reduce((n, c) => Math.min(n, c.glazed), Infinity),
        cameraSideMaxTop: clusters.filter(c => c.band === 0)
            .reduce((n, c) => Math.max(n, c.top), 0),
        farMaxTop: clusters.filter(c => c.band === 2)
            .reduce((n, c) => Math.max(n, c.top), 0),
    },
    trees: { count: treeCount, instancedNodes, blockers: 0 },
    archetypes: [...ARCHETYPES],
    archetypeCounts: ARCHETYPES.map(type => ({ type, count: semantic.get(type) || 0 })),
    clusters: clusters.map(c => ({ ...c })),
    chunks: chunkStats.map(c => ({ ...c })),
    semantic: Object.fromEntries(semantic),
    occluders: occlusionDebug(S11_SURFACE_OCC),
    rawMeshes, weldedMeshes, blockerCount: blockers.length,
    blockerKinds: blockers.reduce((m, b) => {
        m[b.kind] = (m[b.kind] || 0) + 1; return m;
    }, {}),
    lights: { key: STAGE11_SURFACE_LIGHTS_KEY, count: lights.length },
    descentOpen: !!descentDoor && descentDoor.position.y < 0,
    nav: nav && { cols: nav.cols, rows: nav.rows, cell: nav.cell,
        walkable: nav.walk.reduce((n, v) => n + v, 0) },
});
