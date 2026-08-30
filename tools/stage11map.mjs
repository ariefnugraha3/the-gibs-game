// Draws the Stage 11 Chapter 2 map as an SVG, straight from the built network.
//
// It imports `cityRoads.js` itself rather than re-typing the layout, so the
// picture cannot drift from the world the game builds: every road, roundabout,
// fence run and blockade below is the same geometry `stage11CityWalk` tests.
//
//   node tools/stage11map.mjs [out.svg]
//
// Zero dependencies, same as tools/smoke.mjs.

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname
    .replace(/^\/([A-Za-z]:)/, '$1')), '..');
const R = p => pathToFileURL(path.join(root, p)).href;

const roads = await import(R('src/scenes/campaign/stages/stage11/cityRoads.js'));
const cfg = await import(R('src/core/config.js'));
const CAMP_M = cfg.CAMP_M;

const D = roads.stage11CityRoadsDebug();
const SIDEWALK = roads.S11_CITY_SIDEWALK;
const SIDEWALK_M = roads.S11_CITY_SIDEWALK_METERS;
const B = D.bounds;
const fenceRuns = roads.stage11CityFenceRuns(10, 0.6);

// --- projection --------------------------------------------------------------
// World +X runs DOWN the original screenshot and world +Z runs right, so the
// drawing keeps the same orientation the layout was authored in.
const PAD = 34;
// The map fills its own column and the legend gets a gutter of its own: the road
// network reaches every corner of the frame, so a legend panel laid over it will
// always end up covering a junction or a dead end.
const MAP_W = 1040, GUTTER = 300;
const WIDTH = MAP_W + GUTTER;
const SCALE = (MAP_W - PAD * 2) / (B.z1 - B.z0);
const HEIGHT = Math.max((B.x1 - B.x0) * SCALE + PAD * 2, 420);
const sx = z => PAD + (z - B.z0) * SCALE;
const sy = x => PAD + (x - B.x0) * SCALE;
const n = v => Math.round(v * 100) / 100;

const out = [];
const push = (...l) => out.push(...l);

push(`<svg xmlns="http://www.w3.org/2000/svg" width="${n(WIDTH)}" height="${n(HEIGHT)}"`,
    ` viewBox="0 0 ${n(WIDTH)} ${n(HEIGHT)}" font-family="Inter, Segoe UI, sans-serif">`);
push(`<rect width="100%" height="100%" fill="#1d2a1c"/>`);

// --- ground texture: the forest the capital was cut into ----------------------
const hash = (i, s = 0) => {
    let v = Math.imul((i + 11) ^ Math.imul(s + 7, 0x9e3779b1), 0x85ebca6b);
    v ^= v >>> 16; v = Math.imul(v, 0xc2b2ae35); v ^= v >>> 13;
    return (v >>> 0) / 4294967296;
};
push('<g opacity="0.5">');
for (let i = 0; i < 1400; i++) {
    const x = B.x0 + hash(i, 1) * (B.x1 - B.x0);
    const z = B.z0 + hash(i, 2) * (B.z1 - B.z0);
    if (roads.stage11CityRoadClearance(x, z) < 60) continue;
    push(`<circle cx="${n(sx(z))}" cy="${n(sy(x))}" r="${n(2 + hash(i, 3) * 2.4)}"`,
        ` fill="${hash(i, 4) > .5 ? '#2f4a2b' : '#3a5733'}"/>`);
}
push('</g>');

// --- roads --------------------------------------------------------------------
// Stroke width is twice the corridor half-width and the caps are round, which is
// exactly the capsule union the walk predicate tests.
// An edge that meets a roundabout is trimmed to the ring's outer radius, so the
// DRAWN quad runs on to the island edge — the same overlap the world uses to
// stop a square road end leaving a crescent of bare ground beside a curve.
const round = id => D.roundabouts.find(r => r.id === id);
const span = (e) => {
    const rA = round(e.a), rB = round(e.b);
    const tx = (e.bx - e.ax) / e.len, tz = (e.bz - e.az) / e.len;
    return {
        ax: rA ? e.ax - tx * rA.ring : e.ax, az: rA ? e.az - tz * rA.ring : e.az,
        bx: rB ? e.bx + tx * rB.ring : e.bx, bz: rB ? e.bz + tz * rB.ring : e.bz,
    };
};
const roadPath = (e) => {
    const d = span(e);
    return `M ${n(sx(d.az))} ${n(sy(d.ax))} L ${n(sx(d.bz))} ${n(sy(d.bx))}`;
};
push('<g stroke-linecap="round">');
// The boulevard behind the start is DRAWN and simply closed off, so the city
// reads as somewhere the player came from rather than as the edge of the world.
const T0 = D.startTangent, E0 = D.edges[0];
const stubEnd = { x: D.start.x - T0.tx * D.startRenderUnits,
    z: D.start.z - T0.tz * D.startRenderUnits };
const stubPath = `M ${n(sx(D.start.z))} ${n(sy(D.start.x))}`
    + ` L ${n(sx(stubEnd.z))} ${n(sy(stubEnd.x))}`;
push(`<path d="${stubPath}" stroke="#8b8a80" fill="none"`,
    ` stroke-width="${n((E0.w + SIDEWALK) * 2 * SCALE)}" opacity="0.75"/>`);
push(`<path d="${stubPath}" stroke="#454c50" fill="none"`,
    ` stroke-width="${n(E0.w * 2 * SCALE)}" opacity="0.75"/>`);
// The pavement first, one step wider on every corridor, then the carriageway
// over it: the player walks on both, and the railing stands on the outer edge.
for (const e of D.edges)
    push(`<path d="${roadPath(e)}" stroke="#8b8a80" fill="none"`,
        ` stroke-width="${n((e.w + SIDEWALK) * 2 * SCALE)}"/>`);
for (const r of D.roundabouts)
    push(`<circle cx="${n(sx(r.z))}" cy="${n(sy(r.x))}"`,
        ` r="${n((r.inner + r.outer + SIDEWALK) * .5 * SCALE)}" fill="none"`,
        ` stroke="#8b8a80"`,
        ` stroke-width="${n((r.ring + SIDEWALK) * SCALE)}"/>`);
push(`<circle cx="${n(sx(D.hq.z))}" cy="${n(sy(D.hq.x))}"`,
    ` r="${n(D.apron * SCALE)}" fill="#8b8a80"/>`);
for (const e of D.edges)
    push(`<path d="${roadPath(e)}" stroke="#454c50" fill="none"`,
        ` stroke-width="${n(e.w * 2 * SCALE)}"/>`);
for (const r of D.roundabouts)
    push(`<circle cx="${n(sx(r.z))}" cy="${n(sy(r.x))}"`,
        ` r="${n((r.inner + r.outer) * .5 * SCALE)}" fill="none" stroke="#454c50"`,
        ` stroke-width="${n(r.ring * SCALE)}"/>`);
push(`<circle cx="${n(sx(D.hq.z))}" cy="${n(sy(D.hq.x))}"`,
    ` r="${n((D.apron - SIDEWALK) * SCALE)}" fill="#454c50"/>`);
// Lane markings.
for (const e of D.edges)
    push(`<path d="${roadPath(e)}" stroke="#7e8479" fill="none" stroke-width="1"`,
        ` stroke-dasharray="6 7" opacity="0.55"/>`);
push('</g>');

// --- roundabout islands: solid, and the wall is drawn on the excluded radius ---
for (const r of D.roundabouts) {
    push(`<circle cx="${n(sx(r.z))}" cy="${n(sy(r.x))}" r="${n(r.inner * SCALE)}"`,
        ` fill="#5d6f4b" stroke="#aab19b" stroke-width="1.6"/>`);
    push(`<circle cx="${n(sx(r.z))}" cy="${n(sy(r.x))}" r="${n(r.inner * .34 * SCALE)}"`,
        ` fill="#8d9382"/>`);
}

// --- the walk boundary, as actually drawn in game -----------------------------
push('<g stroke="#93a08c" stroke-width="1.1" fill="none"',
    ' stroke-linecap="round" stroke-linejoin="round" opacity="0.9">');
for (const r of fenceRuns)
    push(`<polyline points="${r.pts.map(q => `${n(sx(q.z))},${n(sy(q.x))}`).join(' ')}"/>`);
push('</g>');

// --- the cheapest route -------------------------------------------------------
// The map's point is that most barriers are optional, so it draws the route that
// actually costs the fewest of them. Cost is blockades first, metres second, so
// among equally-cheap routes the short one wins.
const blockadesOnEdge = new Map();
for (const b of D.blockades)
    blockadesOnEdge.set(b.edge, (blockadesOnEdge.get(b.edge) || 0) + 1);
const adj = {};
for (const e of D.edges) {
    (adj[e.a] ||= []).push([e.b, e]);
    (adj[e.b] ||= []).push([e.a, e]);
}
const cheapest = (() => {
    const cost = { S: 0 }, from = {}, queue = [['S', 0]];
    while (queue.length) {
        queue.sort((a, b) => a[1] - b[1]);
        const [at, c] = queue.shift();
        if (c > cost[at]) continue;
        for (const [to, e] of adj[at] || []) {
            const nc = c + (blockadesOnEdge.get(e.index) || 0) * 1e6 + e.len;
            if (cost[to] == null || nc < cost[to]) {
                cost[to] = nc; from[to] = [at, e]; queue.push([to, nc]);
            }
        }
    }
    const edges = new Set();
    let at = 'HQ';
    while (at !== 'S' && from[at]) { edges.add(from[at][1].index); at = from[at][0]; }
    return edges;
})();
push('<g stroke="#f2cf22" stroke-opacity="0.5" stroke-linecap="round" fill="none">');
for (const e of D.edges) {
    if (!cheapest.has(e.index)) continue;
    push(`<path d="${roadPath(e)}" stroke-width="${n(Math.max(4, e.w * 0.55 * SCALE))}"/>`);
}
push('</g>');

// --- blockades ----------------------------------------------------------------
const vehicleSet = new Set(JSON.parse(fs.readFileSync(
    path.join(root, 'config/gameplay.json'), 'utf8'))
    .campaign.stage11.cityAxis.blockade.vehicles.map(v => v.blockade));
for (const b of D.blockades) {
    const half = (b.w + SIDEWALK + 6) * SCALE;
    const ax = sx(b.z) + b.nz * half, ay = sy(b.x) + b.nx * half;
    const bx = sx(b.z) - b.nz * half, by = sy(b.x) - b.nx * half;
    const onRoute = cheapest.has(b.edge);
    push(`<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}"`,
        ` stroke="#e0392c" stroke-width="6" stroke-linecap="round"`,
        onRoute ? '/>' : ' stroke-opacity="0.45"/>');
    if (vehicleSet.has(b.index))
        push(`<circle cx="${n(sx(b.z))}" cy="${n(sy(b.x))}" r="4.6"`,
            ` fill="#1d2a1c" stroke="#e0392c" stroke-width="2"`,
            onRoute ? '/>' : ' stroke-opacity="0.45"/>');
}

// --- dead ends ----------------------------------------------------------------
for (const name of D.deadEnds) {
    if (name === 'S' || name === 'HQ') continue;
    const node = roads.S11_CITY_NODES[name];
    push(`<circle cx="${n(sx(node.z))}" cy="${n(sy(node.x))}" r="7" fill="none"`,
        ` stroke="#c9c3a6" stroke-width="1.6" stroke-dasharray="3 3"/>`);
}

// --- start and headquarters ---------------------------------------------------
push(`<ellipse cx="${n(sx(D.start.z))}" cy="${n(sy(D.start.x))}" rx="16" ry="11"`,
    ` fill="#f2cf22"/>`);
push(`<text x="${n(sx(D.start.z))}" y="${n(sy(D.start.x) + 30)}" fill="#f2cf22"`,
    ` font-size="14" font-weight="600" text-anchor="middle">START</text>`);
push(`<ellipse cx="${n(sx(D.hq.z))}" cy="${n(sy(D.hq.x) - 14)}" rx="34" ry="22"`,
    ` fill="#25c04a"/>`);
push(`<text x="${n(sx(D.hq.z))}" y="${n(sy(D.hq.x) - 48)}" fill="#25c04a"`,
    ` font-size="14" font-weight="600" text-anchor="middle">ENEMY HQ</text>`);
push(`<text x="${n(sx(D.hq.z))}" y="${n(sy(D.hq.x) - 33)}" fill="#7fd894"`,
    ` font-size="11.5" text-anchor="middle">reaching here ends the chapter</text>`);

// The one authored number, drawn as the line it actually measures.
push(`<line x1="${n(sx(D.start.z))}" y1="${n(sy(D.start.x))}"`,
    ` x2="${n(sx(D.hq.z))}" y2="${n(sy(D.hq.x))}" stroke="#f2cf22"`,
    ` stroke-width="1.4" stroke-dasharray="8 6" opacity="0.6"/>`);
const midZ = (D.start.z + D.hq.z) * .5, midX = (D.start.x + D.hq.x) * .5;
push(`<text x="${n(sx(midZ) + 12)}" y="${n(sy(midX))}" fill="#f2cf22" font-size="13"`,
    ` opacity="0.9">${D.startToHqMeters.toFixed(0)} m straight line</text>`);

// --- title, legend, scale bar --------------------------------------------------
push(`<text x="${PAD}" y="${PAD - 10}" fill="#e8e4d6" font-size="19"`,
    ` font-weight="700">STAGE 11 — CHAPTER 2 · IKN ROAD NETWORK</text>`);

const LX = MAP_W + 14, LY = PAD + 40;
push(`<line x1="${n(MAP_W)}" y1="0" x2="${n(MAP_W)}" y2="${n(HEIGHT)}"`,
    ` stroke="#3b4a37" stroke-width="1"/>`);
push(`<text x="${n(LX)}" y="${n(PAD - 10)}" fill="#e8e4d6" font-size="13"`,
    ` font-weight="700" letter-spacing="1">LEGEND</text>`);
const legend = [
    ['#454c50', 'Road — the only walkable surface'],
    ['#8b8a80', `${SIDEWALK_M} m pavement — walkable, both sides`],
    ['#93a08c', 'Railing on the pavement edge (the walk boundary)'],
    ['#5d6f4b', 'Roundabout island — walled, no entry'],
    ['#e0392c', 'Enemy blockade (ringed = weapon vehicles)'],
    ['#8f6a2a', 'Faded blockade — optional, on a branch or spur'],
    ['#f2cf22', 'Cheapest route to the HQ'],
    ['#c9c3a6', 'Dead end'],
    ['#6f7a6a', 'Closed boulevard behind the start'],
];
legend.forEach(([color, label], i) => {
    const y = LY + i * 22;
    push(`<rect x="${n(LX)}" y="${n(y - 8)}" width="16" height="10" rx="2" fill="${color}"/>`);
    push(`<text x="${n(LX + 24)}" y="${n(y)}" fill="#cfd5c6" font-size="12.5">${label}</text>`);
});
const barMeters = 200, barPx = barMeters * CAMP_M * SCALE;
const BY = LY + legend.length * 22 + 8;
push(`<line x1="${n(LX)}" y1="${n(BY)}" x2="${n(LX + barPx)}" y2="${n(BY)}"`,
    ` stroke="#cfd5c6" stroke-width="2"/>`);
for (const t of [0, 1]) push(`<line x1="${n(LX + barPx * t)}" y1="${n(BY - 4)}"`,
    ` x2="${n(LX + barPx * t)}" y2="${n(BY + 4)}" stroke="#cfd5c6" stroke-width="2"/>`);
push(`<text x="${n(LX + barPx + 8)}" y="${n(BY + 4)}" fill="#cfd5c6"`,
    ` font-size="12.5">${barMeters} m</text>`);
push(`<text x="${n(LX)}" y="${n(BY + 22)}" fill="#8d9382" font-size="11.5">`,
    `${D.edgeCount} road segments · ${D.roadMeters.toFixed(0)} m of carriageway`,
    ` · ${D.blockades.length} blockades</text>`);
push(`<text x="${n(LX)}" y="${n(BY + 38)}" fill="#f2cf22" font-size="11.5">`,
    `only ${D.minBlockadesToHq} of ${D.blockades.length} must be destroyed`,
    ` — the rest can be walked past</text>`);

push('</svg>');

const dest = process.argv[2] || 'docs/stage11-chapter2-map.svg';
fs.writeFileSync(path.join(root, dest), out.join('') + '\n');
console.log(`wrote ${dest} (${n(WIDTH)} x ${n(HEIGHT)}), `
    + `${D.edgeCount} edges, ${fenceRuns.length} fence runs, `
    + `${D.blockades.length} blockades (${D.minBlockadesToHq} forced), `
    + `${D.startToHqMeters.toFixed(2)} m start->HQ`);
