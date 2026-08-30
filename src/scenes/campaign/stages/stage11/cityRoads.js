// Stage 11 Chapter 2 — the IKN ROAD NETWORK.
//
// The chapter is no longer one ceremonial rectangle: it is a city of roads laid
// out from the user's own map screenshot.  The player may only travel ON the
// asphalt, both roundabouts are solid in the middle, several branches are dead
// ends, and the enemy headquarters sits at the far end of the network.
//
// AUTHORING SPACE IS THE SCREENSHOT.  Every node is a pixel in that 671 x 860
// frame, and exactly TWO of those pixels are anchors: the yellow start blob and
// the green headquarters.  The one authored real-world number is the straight
// line between them (`S11_CITY_SPAN_METERS`, 1.5 km), so the pixel->world scale
// is DERIVED from it.  Road lengths, roundabout radii, plot sizes and building
// heights all read that one scale, which is what keeps "1.5 km start to HQ" a
// structural property of the map instead of a comment that can drift.
//
// Structural geometry must exist while campaign modules are being imported --
// CFG is still empty at that point -- so the network lives here as constants and
// never reads CFG at module scope (the Chapter 1 route rule).

import { CAMP_M } from '../../../../core/config.js';

const FRAME = Object.freeze({ w: 671, h: 860 });
const START_PX = Object.freeze({ x: 255, y: 826 });
const HQ_PX = Object.freeze({ x: 450, y: 163 });

export const S11_CITY_SPAN_METERS = 1000;
const ANCHOR_PX = Math.hypot(HQ_PX.x - START_PX.x, HQ_PX.y - START_PX.y);
// One scale for the whole city. Retuning the span rescales roads AND props.
export const S11_CITY_UNITS_PER_PX = (S11_CITY_SPAN_METERS * CAMP_M) / ANCHOR_PX;
export const S11_SURFACE_ORIGIN = Object.freeze({ x: 391900, z: 0 });

// Screen-down (+py) maps to world +X, so travelling up the screenshot toward the
// headquarters progresses toward -X: the same direction Chapters 1 and 3 use,
// which is what keeps `stage11ChapterScreenDirection` pointing up-left.
function P(px, py) {
    return {
        x: S11_SURFACE_ORIGIN.x + (py - FRAME.h * 0.5) * S11_CITY_UNITS_PER_PX,
        z: S11_SURFACE_ORIGIN.z + (px - FRAME.w * 0.5) * S11_CITY_UNITS_PER_PX,
    };
}

// Half-widths in UNITS, not pixels: how wide a boulevard is, is a real-world
// property of the road and must not change when the city is made longer or
// shorter. A "main" boulevard is 180 units across (~25.7 m).
const W = Object.freeze({ main: 90, sec: 66, cross: 50, spur: 44 });

// Roundabouts and the headquarters forecourt are the opposite case: they are
// FEATURES DRAWN ON THE MAP, so they are authored in pixels of that map and
// scale with it. Sizing them in units instead is what would let a shorter span
// swallow a whole approach road inside a roundabout that never shrank.
const ISLAND_PX = Object.freeze({ RB1: 20, RB2: 17 });
const RING_PX = 12;
const HQ_APRON_PX = 16.5;

// A 1.5 m pavement each side, and it is WALKABLE: the corridor the player moves
// in is the carriageway PLUS both pavements, the kerb is drawn on the line where
// the asphalt ends, and the railing stands on the outer edge of the pavement.
// Sized in metres, so it stays a pavement whatever span the map is scaled to.
export const S11_CITY_SIDEWALK_METERS = 1.5;
const SIDEWALK = S11_CITY_SIDEWALK_METERS * CAMP_M;
export const S11_CITY_SIDEWALK = SIDEWALK;

const NODE_PX = Object.freeze({
    S: [255, 826], A1: [258, 762], A2: [272, 700], RB1: [277, 648],
    A3: [283, 596], A4: [300, 540], A5: [322, 492], A6: [345, 448],
    A7: [372, 410], A8: [392, 372], A9: [386, 330], A10: [388, 272],
    A11: [392, 212], A12: [424, 182], HQ: [450, 163],
    W1: [215, 640], W2: [168, 596], W3: [127, 542], W4: [104, 470],
    W5: [98, 396], W6: [108, 318], W7: [140, 236], W8: [135, 190],
    T1: [200, 172], T2: [272, 181], T3: [330, 196], X1: [211, 492],
    E1: [340, 668], E2: [410, 663], E3: [472, 645], E4: [528, 612],
    E5: [560, 560], E6: [594, 478], E7: [600, 412], E8: [570, 350],
    RB2: [533, 291], N1: [516, 232], N2: [466, 212],
    V1: [490, 336], V2: [445, 368],
    D1: [645, 330], D2: [600, 300], D3: [556, 742], D4: [545, 680],
    D5: [243, 296], D6: [280, 308], D7: [327, 318], D8: [180, 745],
    D9: [215, 700],
});

const EDGE_SPEC = Object.freeze([
    // Main spine: start -> roundabout 1 -> headquarters approach.
    ['S', 'A1', 'main'], ['A1', 'A2', 'main'], ['A2', 'RB1', 'main'],
    ['RB1', 'A3', 'main'], ['A3', 'A4', 'main'], ['A4', 'A5', 'main'],
    ['A5', 'A6', 'main'], ['A6', 'A7', 'main'], ['A7', 'A8', 'main'],
    ['A8', 'A9', 'main'], ['A9', 'A10', 'main'], ['A10', 'A11', 'main'],
    ['A11', 'A12', 'main'], ['A12', 'HQ', 'main'],
    // West loop back to the headquarters approach.
    ['RB1', 'W1', 'sec'], ['W1', 'W2', 'sec'], ['W2', 'W3', 'sec'],
    ['W3', 'W4', 'sec'], ['W4', 'W5', 'sec'], ['W5', 'W6', 'sec'],
    ['W6', 'W7', 'sec'], ['W7', 'W8', 'sec'], ['W8', 'T1', 'sec'],
    ['T1', 'T2', 'sec'], ['T2', 'T3', 'sec'], ['T3', 'A11', 'sec'],
    // Mid cross-street: the shortcut that makes the west side a real loop.
    ['W4', 'X1', 'cross'], ['X1', 'A5', 'cross'],
    // East loop up to roundabout 2.
    ['RB1', 'E1', 'sec'], ['E1', 'E2', 'sec'], ['E2', 'E3', 'sec'],
    ['E3', 'E4', 'sec'], ['E4', 'E5', 'sec'], ['E5', 'E6', 'sec'],
    ['E6', 'E7', 'sec'], ['E7', 'E8', 'sec'], ['E8', 'RB2', 'sec'],
    // Roundabout 2: the second way into the headquarters, and back to the spine.
    ['RB2', 'N1', 'sec'], ['N1', 'N2', 'sec'], ['N2', 'A12', 'sec'],
    ['RB2', 'V1', 'cross'], ['V1', 'V2', 'cross'], ['V2', 'A8', 'cross'],
    // Dead ends. There is deliberately no marker of any kind saying so.
    ['RB2', 'D2', 'spur'], ['D2', 'D1', 'spur'],
    ['E4', 'D4', 'spur'], ['D4', 'D3', 'spur'],
    ['A9', 'D7', 'spur'], ['D7', 'D6', 'spur'], ['D6', 'D5', 'spur'],
    ['A2', 'D9', 'spur'], ['D9', 'D8', 'spur'],
]);

// Enemy blockades, in the order they are drawn on the map. Each is a PIXEL that
// is projected onto whichever road actually runs beneath it, so a hand-placed
// mark can never end up floating beside the asphalt it is meant to close.
const BLOCKADE_PX = Object.freeze([
    [138, 212], [250, 175], [408, 197], [445, 197], [352, 324],
    [387, 300], [509, 313], [383, 392], [334, 470], [598, 440],
    [260, 492], [146, 570], [440, 655],
]);

// The boulevard CONTINUES behind the start and is simply closed off: a road that
// ends in a round cul-de-sac reads as the edge of the world, while a carriageway
// running on past a barrier reads as a city the player came from. `BACK` is how
// far behind the start they may still stand, `RENDER` is how far the road is
// drawn — decor only, and deliberately inside the world bounds.
export const S11_CITY_START_BACK_UNITS = 40;
export const S11_CITY_START_RENDER_UNITS = 620;

// The headquarters forecourt: a walkable apron so the compound can be reached
// and fought in front of, rather than a road that stops at a wall.
const HQ_APRON_RADIUS = HQ_APRON_PX * S11_CITY_UNITS_PER_PX;

// --- built geometry ----------------------------------------------------------

const nodes = {};
for (const [name, coords] of Object.entries(NODE_PX)) {
    const p = P(coords[0], coords[1]);
    nodes[name] = { name, x: p.x, z: p.z, px: coords[0], py: coords[1],
        island: (ISLAND_PX[name] || 0) * S11_CITY_UNITS_PER_PX };
}

const RING_UNITS = RING_PX * S11_CITY_UNITS_PER_PX;
export const S11_CITY_ROUNDABOUTS = Object.freeze(
    Object.keys(ISLAND_PX).map(name => Object.freeze({
        id: name, x: nodes[name].x, z: nodes[name].z,
        inner: nodes[name].island, outer: nodes[name].island + RING_UNITS,
        ring: RING_UNITS,
    })));

function roundAt(name) {
    for (const r of S11_CITY_ROUNDABOUTS) if (r.id === name) return r;
    return null;
}

// An edge that meets a roundabout stops at the ring's OUTER radius, so the road
// corridor and the carriageway annulus overlap instead of the road running
// straight through the island the player is forbidden to enter.
function endpoint(name, otherName) {
    const n = nodes[name], o = nodes[otherName], r = roundAt(name);
    if (!r) return { x: n.x, z: n.z };
    const dx = o.x - n.x, dz = o.z - n.z, len = Math.hypot(dx, dz) || 1;
    return { x: n.x + dx / len * r.outer, z: n.z + dz / len * r.outer };
}

const EDGES = EDGE_SPEC.map((spec, i) => {
    const a = spec[0], b = spec[1], kind = spec[2];
    const pa = endpoint(a, b), pb = endpoint(b, a);
    const dx = pb.x - pa.x, dz = pb.z - pa.z, len = Math.hypot(dx, dz) || 1;
    return {
        index: i, a, b, kind, w: W[kind],
        ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z,
        tx: dx / len, tz: dz / len, len,
        yaw: Math.atan2(-dz / len, dx / len),
    };
});
export const S11_CITY_EDGES = Object.freeze(EDGES.map(Object.freeze));

export const S11_CITY_START = Object.freeze({ x: nodes.S.x, z: nodes.S.z });
// Unit tangent out of the start, toward the rest of the city.
export const S11_CITY_START_TANGENT = (() => {
    const dx = nodes.A1.x - nodes.S.x, dz = nodes.A1.z - nodes.S.z;
    const len = Math.hypot(dx, dz) || 1;
    return Object.freeze({ tx: dx / len, tz: dz / len });
})();
const startAlong = (x, z) =>
    (x - nodes.S.x) * S11_CITY_START_TANGENT.tx
    + (z - nodes.S.z) * S11_CITY_START_TANGENT.tz;
// Only near the start: the plane is perpendicular to the opening boulevard and
// the start is the southernmost node, but a bounded test can never clip a road
// on the far side of the map if the layout is ever re-anchored.
function pastStartCut(x, z, r = 0) {
    if ((x - nodes.S.x) ** 2 + (z - nodes.S.z) ** 2
        > (S11_CITY_START_RENDER_UNITS + 400) ** 2) return false;
    return startAlong(x, z) < -S11_CITY_START_BACK_UNITS + r;
}
export { pastStartCut as stage11CityPastStartCut };
export const S11_CITY_HQ = Object.freeze({ x: nodes.HQ.x, z: nodes.HQ.z });
export const S11_CITY_HQ_APRON = HQ_APRON_RADIUS;
export const S11_CITY_NODES = Object.freeze(
    Object.fromEntries(Object.entries(nodes)
        .map(entry => [entry[0], Object.freeze({ x: entry[1].x, z: entry[1].z,
            island: entry[1].island })])));

const nodeXs = Object.values(nodes).map(n => n.x);
const nodeZs = Object.values(nodes).map(n => n.z);
const MARGIN = 700;
export const S11_CITY_BOUNDS = Object.freeze({
    x0: Math.min.apply(null, nodeXs) - MARGIN,
    x1: Math.max.apply(null, nodeXs) + MARGIN,
    z0: Math.min.apply(null, nodeZs) - MARGIN,
    z1: Math.max.apply(null, nodeZs) + MARGIN,
});

// --- spatial index -----------------------------------------------------------
// `stage11CityWalk` runs for the player, every robot, the nav bake and every A*
// node, so a linear sweep over 50 edges is not acceptable. Edges are bucketed
// once into a uniform grid and only the candidates near a query are tested.

const CELL = 700;
const EMPTY = [];
const grid = new Map();
const cellKey = (c, r) => c * 8192 + r;
for (const e of EDGES) {
    const pad = e.w + 8;
    const c0 = Math.floor((Math.min(e.ax, e.bx) - pad - S11_CITY_BOUNDS.x0) / CELL);
    const c1 = Math.floor((Math.max(e.ax, e.bx) + pad - S11_CITY_BOUNDS.x0) / CELL);
    const r0 = Math.floor((Math.min(e.az, e.bz) - pad - S11_CITY_BOUNDS.z0) / CELL);
    const r1 = Math.floor((Math.max(e.az, e.bz) + pad - S11_CITY_BOUNDS.z0) / CELL);
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
        const k = cellKey(c, r);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(e);
    }
}
function candidates(x, z) {
    const c = Math.floor((x - S11_CITY_BOUNDS.x0) / CELL);
    const r = Math.floor((z - S11_CITY_BOUNDS.z0) / CELL);
    return grid.get(cellKey(c, r)) || EMPTY;
}

function segProject(x, z, e) {
    const dx = e.bx - e.ax, dz = e.bz - e.az, den = dx * dx + dz * dz;
    const t = den > 1e-9
        ? Math.max(0, Math.min(1, ((x - e.ax) * dx + (z - e.az) * dz) / den)) : 0;
    const px = e.ax + dx * t, pz = e.az + dz * t;
    return { d2: (x - px) ** 2 + (z - pz) ** 2, t, x: px, z: pz };
}

// --- predicates --------------------------------------------------------------

// The island is an ABSOLUTE exclusion, tested before anything else: a point may
// be inside a road corridor and still be inside the roundabout wall, and the
// wall always wins. That wall is drawn on exactly this radius.
export function stage11CityIslandHit(x, z, r = 0) {
    for (const R of S11_CITY_ROUNDABOUTS)
        if ((x - R.x) ** 2 + (z - R.z) ** 2 <= (R.inner + r) ** 2) return true;
    return false;
}
function inRing(x, z, r) {
    for (const R of S11_CITY_ROUNDABOUTS) {
        const d = Math.hypot(x - R.x, z - R.z);
        if (d >= R.inner + r && d <= R.outer + SIDEWALK - r) return true;
    }
    return false;
}
function inApron(x, z, r) {
    const reach = Math.max(1, HQ_APRON_RADIUS - r);
    return (x - S11_CITY_HQ.x) ** 2 + (z - S11_CITY_HQ.z) ** 2 <= reach * reach;
}
function inRoad(x, z, r, skip = null) {
    for (const e of candidates(x, z)) {
        if (e === skip) continue;
        const reach = Math.max(6, e.w + SIDEWALK - r);
        if (segProject(x, z, e).d2 <= reach * reach) return true;
    }
    return false;
}

export function stage11CityWalk(x, z, r = 0) {
    const B = S11_CITY_BOUNDS;
    if (x < B.x0 + r || x > B.x1 - r || z < B.z0 + r || z > B.z1 - r) return false;
    if (stage11CityIslandHit(x, z, r)) return false;
    if (pastStartCut(x, z, r)) return false;
    return inApron(x, z, r) || inRing(x, z, r) || inRoad(x, z, r);
}
// Everything the walk predicate allows EXCEPT one SHAPE's own contribution --
// an edge corridor, a roundabout carriageway or the headquarters apron. It is
// what lets a boundary sample ask "is this point already inside some OTHER part
// of the network?", which is how a junction mouth becomes a gap without a second
// table of hand-authored gaps.
export function stage11CityWalkExcept(skip, x, z, r = 0) {
    if (stage11CityIslandHit(x, z, r)) return false;
    const edge = skip && skip.tx != null ? skip : null;
    const ring = skip && typeof skip.ring === 'string' ? skip.ring : null;
    const apron = !!(skip && skip.apron);
    if (!apron && inApron(x, z, r)) return true;
    for (const R of S11_CITY_ROUNDABOUTS) {
        if (R.id === ring) continue;
        const d = Math.hypot(x - R.x, z - R.z);
        if (d >= R.inner + r && d <= R.outer + SIDEWALK - r) return true;
    }
    return inRoad(x, z, r, edge);
}

export function stage11CityNearestRoad(x, z) {
    let best = null;
    const list = candidates(x, z);
    const scan = list.length ? list : EDGES;
    for (const e of scan) {
        const q = segProject(x, z, e);
        if (!best || q.d2 < best.d2) best = { d2: q.d2, t: q.t, x: q.x, z: q.z,
            edge: e, w: e.w };
    }
    return best;
}
// Signed clearance to the drawn asphalt: negative inside a road, positive on the
// ground beside it. Prop placement reads this, so nothing is ever built on a road.
export function stage11CityRoadClearance(x, z) {
    let best = Infinity;
    for (const e of EDGES)
        best = Math.min(best, Math.sqrt(segProject(x, z, e).d2) - e.w - SIDEWALK);
    for (const R of S11_CITY_ROUNDABOUTS)
        best = Math.min(best,
            Math.hypot(x - R.x, z - R.z) - R.outer - SIDEWALK);
    best = Math.min(best, Math.hypot(x - S11_CITY_HQ.x, z - S11_CITY_HQ.z)
        - HQ_APRON_RADIUS);
    return best;
}

// Segment vs roundabout island: the wall stops bullets and line of sight, and it
// is the only analytic blocker in the network (everything else is an OBB).
export function stage11CityIslandSegBlocked(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, den = dx * dx + dz * dz;
    for (const R of S11_CITY_ROUNDABOUTS) {
        const t = den > 1e-9
            ? Math.max(0, Math.min(1, ((R.x - x0) * dx + (R.z - z0) * dz) / den)) : 0;
        const px = x0 + dx * t, pz = z0 + dz * t;
        if ((px - R.x) ** 2 + (pz - R.z) ** 2 <= R.inner * R.inner) return true;
    }
    return false;
}

// Push a raw point back onto the asphalt. Robot formations jitter first and are
// projected afterwards, so a spawn can never appear beyond the fence.
export function stage11CityProjectToRoad(x, z, radius = 4) {
    if (stage11CityWalk(x, z, radius)) return { x, z };
    const q = stage11CityNearestRoad(x, z);
    if (!q) return { x: S11_CITY_START.x, z: S11_CITY_START.z };
    const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz);
    if (d < 1e-6) return { x: q.x, z: q.z };
    const reach = Math.max(6, q.w + SIDEWALK - radius - 0.5);
    const p = { x: q.x + dx * reach / d, z: q.z + dz * reach / d };
    return stage11CityWalk(p.x, p.z, radius) ? p : { x: q.x, z: q.z };
}

// --- blockade anchors --------------------------------------------------------

// How many junctions each node is from the start, so a blockade can work out
// which of its two ends the player is expected to arrive from. That is what
// makes the fortified side of every barrier face the natural approach without a
// hand-authored orientation table.
const DEPTH = (() => {
    const d = { S: 0 }, queue = ['S'];
    while (queue.length) {
        const at = queue.shift();
        for (const spec of EDGE_SPEC) {
            const other = spec[0] === at ? spec[1] : spec[1] === at ? spec[0] : null;
            if (other == null || d[other] != null) continue;
            d[other] = d[at] + 1; queue.push(other);
        }
    }
    return d;
})();

// Each anchor is snapped onto its road, then held away from both junctions by
// more than a road half-width: a barrier standing IN a junction could simply be
// walked around through the branch that meets it there.
export const S11_CITY_BLOCKADES = Object.freeze(BLOCKADE_PX.map((anchor, index) => {
    const p = P(anchor[0], anchor[1]);
    const q = stage11CityNearestRoad(p.x, p.z);
    const e = q.edge;
    const keepOut = Math.min(0.45, (e.w + 60) / Math.max(1, e.len));
    const t = Math.max(keepOut, Math.min(1 - keepOut, q.t));
    // +1 means the approach side lies toward the edge's b node.
    const front = (DEPTH[e.a] ?? 99) <= (DEPTH[e.b] ?? 99) ? -1 : 1;
    return Object.freeze({
        index, edge: e.index, kind: e.kind, w: e.w, t, front,
        depth: Math.min(DEPTH[e.a] ?? 99, DEPTH[e.b] ?? 99),
        x: e.ax + (e.bx - e.ax) * t, z: e.az + (e.bz - e.az) * t,
        tx: e.tx, tz: e.tz, yaw: e.yaw, nx: -e.tz, nz: e.tx,
    });
}));

// --- kerb / pavement / fence contour ------------------------------------------
//
// ONE CONTOUR PER SHAPE, not one offset line per road. Offsetting each road
// independently is what left the outside of every bend open and every dead end
// bare: two offset lines at a bend diverge and never meet, and the arc that was
// bolted on afterwards was generated by a second, independent discretisation, so
// it overlapped the straight run at one junction and fell short at the next.
//
// A road corridor is a CAPSULE, so its boundary is its own offset line PLUS its
// own end caps AT ITS OWN RADIUS -- and those join tangentially by construction,
// because they are the same curve. Walking that one closed perimeter by arc
// length gives contiguous samples with no seam anywhere along a road, around a
// bend, or across a dead end. Only where two different capsules cross does a
// join remain, and there the run ends are extended past each other when they are
// drawn.
//
// Samples that fall inside ANOTHER shape are dropped (that is a junction mouth),
// and so are samples that are not walkable at all (that is the closed-off road
// behind the start). Both tests are the live predicate, never a table.

function capsulePerimeter(ax, az, bx, bz, off, sample) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const tx = dx / len, tz = dz / len, nx = -tz, nz = tx;
    const arc = Math.PI * off;
    const total = 2 * len + 2 * arc;
    const steps = Math.max(8, Math.round(total / sample));
    const pts = [];
    for (let i = 0; i < steps; i++) {
        let u = (i / steps) * total;
        if (u < len) {                                  // +n side, a -> b
            pts.push({ x: ax + tx * u + nx * off, z: az + tz * u + nz * off,
                nx: -nx, nz: -nz });
            continue;
        }
        u -= len;
        if (u < arc) {                                  // cap at b
            const a0 = Math.atan2(nz, nx) - u / off;
            pts.push({ x: bx + Math.cos(a0) * off, z: bz + Math.sin(a0) * off,
                nx: -Math.cos(a0), nz: -Math.sin(a0) });
            continue;
        }
        u -= arc;
        if (u < len) {                                  // -n side, b -> a
            pts.push({ x: bx - tx * u - nx * off, z: bz - tz * u - nz * off,
                nx, nz });
            continue;
        }
        u -= len;                                       // cap at a
        const a1 = Math.atan2(-nz, -nx) - u / off;
        pts.push({ x: ax + Math.cos(a1) * off, z: az + Math.sin(a1) * off,
            nx: -Math.cos(a1), nz: -Math.sin(a1) });
    }
    return pts;
}
function circlePerimeter(cx, cz, r, sample) {
    const steps = Math.max(24, Math.round(2 * Math.PI * r / sample));
    const pts = [];
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r,
            nx: -Math.cos(a), nz: -Math.sin(a) });
    }
    return pts;
}

// Drop points a straight line already describes. A long straight collapses to a
// single segment while a cap keeps the points that make it a curve, so the mesh
// count follows the SHAPE rather than the sampling rate.
function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
        const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
        const dev = len > 1e-6
            ? Math.abs((b.x - a.x) * dz - (b.z - a.z) * dx) / len : 0;
        if (dev > tol) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
}

// Is a point on the CARRIAGEWAY of some road other than `edgeIndex`? Road
// markings ask this: real streets are not painted through an intersection, and
// a centre dash laid straight across a junction mouth is exactly what reads as
// a bend that does not join up.
export function stage11CityCrossingAsphalt(edgeIndex, x, z, pad = 1) {
    for (const e of EDGES) {
        if (e.index === edgeIndex) continue;
        if (segProject(x, z, e).d2 <= (e.w - pad) ** 2) return true;
    }
    return false;
}

// Two contours that CROSS -- one road's cap against a neighbour's offset line --
// are each truncated at their own last accepted sample, so the two runs stop up
// to a sample short of the crossing and leave a gap of up to twice that. Pulling
// both ends to their shared midpoint closes it exactly, whatever the sampling.
//
// A junction MOUTH must stay open, and it is told apart by geometry rather than
// by a radius: the midpoint between two ends across a mouth lies in the middle of
// a road and is WALKABLE, while the midpoint across a crossing gap is not.
function stitchRuns(runs, radius) {
    const ends = [];
    // The barrier across the closed boulevard is included: its ends sit exactly
    // on that road's own boundary lines and must join the railings beside it.
    for (const r of runs) {
        if (r.closed) continue;
        ends.push({ r, head: true }, { r, head: false });
    }
    const used = new Set();
    let joined = 0;
    const at = e => (e.head ? e.r.pts[0] : e.r.pts[e.r.pts.length - 1]);
    for (let i = 0; i < ends.length; i++) {
        if (used.has(i)) continue;
        const pa = at(ends[i]);
        let best = -1, bd = radius * radius;
        for (let j = 0; j < ends.length; j++) {
            if (j === i || used.has(j) || ends[j].r === ends[i].r) continue;
            const pb = at(ends[j]);
            const d = (pa.x - pb.x) ** 2 + (pa.z - pb.z) ** 2;
            if (d < bd) { bd = d; best = j; }
        }
        if (best < 0) continue;
        const pb = at(ends[best]);
        const mx = (pa.x + pb.x) * 0.5, mz = (pa.z + pb.z) * 0.5;
        if (stage11CityWalk(mx, mz, 4)) continue;      // a real mouth: leave it
        const na = { x: mx, z: mz, nx: pa.nx, nz: pa.nz };
        const nb = { x: mx, z: mz, nx: pb.nx, nz: pb.nz };
        if (ends[i].head) ends[i].r.pts.unshift(na); else ends[i].r.pts.push(na);
        if (ends[best].head) ends[best].r.pts.unshift(nb);
        else ends[best].r.pts.push(nb);
        ends[i].r.panels++; ends[best].r.panels++;
        used.add(i); used.add(best); joined++;
    }
    // Three contours can converge on one crossing — a T where a branch meets a
    // through road — and a pairwise pass leaves the third end loose. A second
    // pass lets a leftover land ON its neighbour's endpoint rather than half way
    // to it, which is what actually closes the corner.
    for (let i = 0; i < ends.length; i++) {
        if (used.has(i)) continue;
        const pa = at(ends[i]);
        let best = -1, bd = radius * radius;
        for (let j = 0; j < ends.length; j++) {
            if (j === i || ends[j].r === ends[i].r) continue;
            const pb = at(ends[j]);
            const d = (pa.x - pb.x) ** 2 + (pa.z - pb.z) ** 2;
            if (d < bd) { bd = d; best = j; }
        }
        if (best < 0) continue;
        const pb = at(ends[best]);
        const mx = (pa.x + pb.x) * 0.5, mz = (pa.z + pb.z) * 0.5;
        if (stage11CityWalk(mx, mz, 4)) continue;
        const np = { x: pb.x, z: pb.z, nx: pa.nx, nz: pa.nz };
        if (ends[i].head) ends[i].r.pts.unshift(np); else ends[i].r.pts.push(np);
        ends[i].r.panels++;
        used.add(i); joined++;
    }
    return joined;
}

export function stage11CityFenceRuns(sample = 10, tol = 0.6) {
    const runs = [];
    const EPS = 0.75;
    // A perimeter sample sits EXACTLY on its own shape's boundary, so testing it
    // at radius 0 is a coin flip on the last bit of a hypot: half the samples of
    // every ring came back "not walkable" and the contour shattered into forty
    // one-segment runs. A hair of negative radius makes the test unambiguous.
    const ON = -0.05;
    const emit = (kind, meta, perimeter) => {
        const keep = perimeter.map(p =>
            stage11CityWalk(p.x, p.z, ON)
            && !stage11CityWalkExcept(meta.skip, p.x, p.z, EPS));
        if (!keep.some(Boolean)) return;
        const n = perimeter.length;
        if (keep.every(Boolean)) {
            const pts = simplify([...perimeter, perimeter[0]], tol);
            runs.push({ kind, ...meta, closed: true, pts, panels: pts.length - 1 });
            return;
        }
        // Start just after a dropped sample so a run is never split across the
        // seam of the sample array itself.
        let start = keep.indexOf(false);
        let i = 0;
        while (i < n) {
            const at = (start + 1 + i) % n;
            if (!keep[at]) { i++; continue; }
            const pts = [];
            while (i < n && keep[(start + 1 + i) % n]) {
                pts.push(perimeter[(start + 1 + i) % n]); i++;
            }
            if (pts.length < 2) continue;
            const simple = simplify(pts, tol);
            runs.push({ kind, ...meta, closed: false, pts: simple,
                panels: simple.length - 1 });
        }
    };

    for (const e of EDGES)
        emit('road', { edge: e.index, ring: null, skip: e },
            capsulePerimeter(e.ax, e.az, e.bx, e.bz, e.w + SIDEWALK, sample));
    for (const R of S11_CITY_ROUNDABOUTS)
        emit('ring', { edge: -1, ring: R.id, skip: { ring: R.id } },
            circlePerimeter(R.x, R.z, R.outer + SIDEWALK, sample));
    emit('apron', { edge: -1, ring: null, skip: { apron: true } },
        circlePerimeter(S11_CITY_HQ.x, S11_CITY_HQ.z, HQ_APRON_RADIUS, sample));

    // The closed-off boulevard behind the start: a straight barrier across the
    // carriageway, never a round cul-de-sac.
    const e0 = EDGES[0], off = e0.w + SIDEWALK;
    const T = S11_CITY_START_TANGENT;
    const cx = S11_CITY_START.x - T.tx * S11_CITY_START_BACK_UNITS;
    const cz = S11_CITY_START.z - T.tz * S11_CITY_START_BACK_UNITS;
    const bn = { x: -T.tz, z: T.tx };
    const cut = [];
    const cutSteps = Math.max(2, Math.round(2 * off / sample));
    for (let i = 0; i <= cutSteps; i++) {
        const u = -off + (2 * off) * (i / cutSteps);
        cut.push({ x: cx + bn.x * u, z: cz + bn.z * u, nx: T.tx, nz: T.tz });
    }
    runs.push({ kind: 'start-cut', edge: 0, ring: null, closed: false,
        pts: cut, panels: cut.length - 1 });
    // A mouth is at least one road corridor wide (the narrowest is 109 units),
    // so this radius cannot reach across one even before the walkable test.
    stitchRuns(runs, 90);
    return runs;
}

// How many blockades the player is actually FORCED through. Reaching the
// headquarters is the objective, not clearing the map, so this is published and
// smoke-pinned as a small fraction of the total: the layout must always leave
// most barriers optional on branches and dead ends.
function minBlockadesToHq() {
    const onEdge = new Map();
    for (const b of S11_CITY_BLOCKADES)
        onEdge.set(b.edge, (onEdge.get(b.edge) || 0) + 1);
    const dist = { S: 0 }, queue = [['S', 0]];
    while (queue.length) {
        queue.sort((a, b) => a[1] - b[1]);
        const [at, d] = queue.shift();
        if (d > dist[at]) continue;
        for (let i = 0; i < EDGE_SPEC.length; i++) {
            const spec = EDGE_SPEC[i];
            const to = spec[0] === at ? spec[1] : spec[1] === at ? spec[0] : null;
            if (to == null) continue;
            const nd = d + (onEdge.get(i) || 0);
            if (dist[to] == null || nd < dist[to]) { dist[to] = nd; queue.push([to, nd]); }
        }
    }
    return dist.HQ == null ? Infinity : dist.HQ;
}

function degree(name) {
    let n = 0;
    for (const spec of EDGE_SPEC) if (spec[0] === name || spec[1] === name) n++;
    return n;
}

export const stage11CityRoadsDebug = () => ({
    spanMeters: S11_CITY_SPAN_METERS,
    unitsPerPx: S11_CITY_UNITS_PER_PX,
    // Measured, not asserted: the two anchors really are 1.5 km apart.
    startToHqMeters: Math.hypot(S11_CITY_HQ.x - S11_CITY_START.x,
        S11_CITY_HQ.z - S11_CITY_START.z) / CAMP_M,
    start: { ...S11_CITY_START }, hq: { ...S11_CITY_HQ },
    apron: HQ_APRON_RADIUS,
    bounds: { ...S11_CITY_BOUNDS },
    nodeCount: Object.keys(nodes).length,
    edgeCount: EDGES.length,
    roadMeters: EDGES.reduce((n, e) => n + e.len, 0) / CAMP_M,
    widths: { ...W },
    edges: EDGES.map(e => ({ index: e.index, a: e.a, b: e.b, kind: e.kind,
        w: e.w, len: e.len, ax: e.ax, az: e.az, bx: e.bx, bz: e.bz })),
    roundabouts: S11_CITY_ROUNDABOUTS.map(r => ({ ...r })),
    blockades: S11_CITY_BLOCKADES.map(b => ({ ...b })),
    minBlockadesToHq: minBlockadesToHq(),
    startBackUnits: S11_CITY_START_BACK_UNITS,
    startRenderUnits: S11_CITY_START_RENDER_UNITS,
    startTangent: { ...S11_CITY_START_TANGENT },
    // A node with exactly one edge is a dead end; the map is meant to have them.
    deadEnds: Object.keys(nodes).filter(n => degree(n) === 1),
    junctions: Object.keys(nodes).filter(n => degree(n) >= 3),
});
