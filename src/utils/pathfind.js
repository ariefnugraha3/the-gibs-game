// Pathfinding zombie: nav-grid biner per scene + A* 8-arah + penghalusan
// string-pulling. Pemakaian: scene membangun grid dunianya SEKALI
// (makeNavGrid), lalu AI kejar memanggil navAim() tiap frame —
//   aim.direct=true  = garis lurus ke player bebas -> kejar lurus (murah);
//   aim.direct=false = terhalang (tembok/pohon/median) -> (x,z) waypoint A* —
// dan menggerakkan zombie sepanjang heading hasil turnToward() (laju putar
// terbatas -> menikung mulus).
// Semua status per-zombie hidup di objek zombie (z.nav*); scratch A* dipakai
// BERSAMA antar grid (pencarian selalu sinkron, tidak pernah paralel).
// Gagal mencari jalan (target terputus / budget habis) = fallback kejar lurus,
// yang berperilaku persis seperti sebelum sistem ini ada.

import { CFG } from '../core/config.js';

const ZR = 3.5;           // radius badan zombie (sama dgn resolve/walkable scene)
const POP_BUDGET = 2600;  // batas ekspansi A* per pencarian
const PATH_CAP = 80;      // waypoint maks disimpan (repath tiba jauh sebelum habis)

// ----------- Nav-grid ----------- //
// sample(x,z) -> boolean walkable, dipanggil di PUSAT tiap sel saat bake.
export function makeNavGrid(x0, z0, cell, cols, rows, sample) {
    const walk = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            walk[r * cols + c] = sample(x0 + (c + 0.5) * cell, z0 + (r + 0.5) * cell) ? 1 : 0;
    return { x0, z0, cell, cols, rows, walk };
}

// Di luar grid = tidak walkable (grid hanya memetakan koridor gameplay)
function cellWalk(g, c, r) {
    return c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.walk[r * g.cols + c] === 1;
}

// Lingkaran (x,z,rad) sepenuhnya menimpa sel walkable?
function circleFree(g, x, z, rad) {
    const c0 = Math.floor((x - rad - g.x0) / g.cell), c1 = Math.floor((x + rad - g.x0) / g.cell);
    const r0 = Math.floor((z - rad - g.z0) / g.cell), r1 = Math.floor((z + rad - g.z0) / g.cell);
    for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
            if (!cellWalk(g, c, r)) return false;
    return true;
}

// Garis-pandang grid setebal badan zombie (sampling ~setengah sel).
export function gridLOS(g, x1, z1, x2, z2, rad = ZR) {
    const dx = x2 - x1, dz = z2 - z1;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (g.cell * 0.45)));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (!circleFree(g, x1 + dx * t, z1 + dz * t, rad)) return false;
    }
    return true;
}

// Sel walkable terdekat dari titik dunia (spiral cincin; utk titik yang jatuh
// di sel penghalang, mis. player berdiri di atas furnitur/median).
function snapCell(g, x, z, maxRing = 6) {
    const c = Math.floor((x - g.x0) / g.cell), r = Math.floor((z - g.z0) / g.cell);
    if (cellWalk(g, c, r)) return { c, r };
    for (let ring = 1; ring <= maxRing; ring++)
        for (let dr = -ring; dr <= ring; dr++)
            for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
                if (cellWalk(g, c + dc, r + dr)) return { c: c + dc, r: r + dr };
            }
    return null;
}

// ----------- Scratch A* bersama (di-resize mengikuti grid terbesar) ----------- //
let SC = null;
function scratch(n) {
    if (!SC || SC.n < n) SC = {
        n, gen: SC ? SC.gen : 0,
        g: new Float32Array(n), f: new Float32Array(n),
        parent: new Int32Array(n), stamp: new Int32Array(n), closed: new Uint8Array(n),
        heap: [],
    };
    return SC;
}

// Heap biner min-f berisi indeks sel (duplikat dibiarkan; entri basi dilewati)
function hpush(S, i) {
    const h = S.heap, f = S.f;
    h.push(i);
    let k = h.length - 1;
    while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[h[p]] <= f[h[k]]) break;
        const t = h[p]; h[p] = h[k]; h[k] = t;
        k = p;
    }
}
function hpop(S) {
    const h = S.heap, f = S.f;
    const top = h[0], last = h.pop();
    if (h.length) {
        h[0] = last;
        let k = 0;
        for (; ;) {
            const a = k * 2 + 1, b = a + 1;
            let m = k;
            if (a < h.length && f[h[a]] < f[h[m]]) m = a;
            if (b < h.length && f[h[b]] < f[h[m]]) m = b;
            if (m === k) break;
            const t = h[m]; h[m] = h[k]; h[k] = t;
            k = m;
        }
    }
    return top;
}

// ----------- A* ----------- //
// 8-arah, diagonal dilarang memotong sudut dinding. Return array waypoint
// dunia yang SUDAH dihaluskan (string-pulling), atau null bila tak tercapai.
export function findPath(g, sx, sz, tx, tz) {
    const a = snapCell(g, sx, sz), b = snapCell(g, tx, tz);
    if (!a || !b) return null;
    const cols = g.cols;
    const start = a.r * cols + a.c, goal = b.r * cols + b.c;
    if (start === goal) return null;                 // sesel dgn target: lurus saja
    const S = scratch(cols * g.rows);
    const gen = ++S.gen;
    S.heap.length = 0;
    const D = g.cell, DIAG = g.cell * 1.41421;
    const hCost = (c, r) => {
        const dc = Math.abs(c - b.c), dr = Math.abs(r - b.r);
        return D * Math.max(dc, dr) + (DIAG - D) * Math.min(dc, dr);   // oktil
    };
    S.stamp[start] = gen; S.closed[start] = 0;
    S.g[start] = 0; S.f[start] = hCost(a.c, a.r); S.parent[start] = -1;
    hpush(S, start);
    let found = false, pops = 0;
    while (S.heap.length) {
        const cur = hpop(S);
        if (S.closed[cur] === 1) continue;           // entri heap basi
        S.closed[cur] = 1;
        if (cur === goal) { found = true; break; }
        if (++pops > POP_BUDGET) break;
        const cc = cur % cols, cr = (cur / cols) | 0;
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
                if (dc === 0 && dr === 0) continue;
                const nc = cc + dc, nr = cr + dr;
                if (!cellWalk(g, nc, nr)) continue;
                if (dc !== 0 && dr !== 0 &&
                    (!cellWalk(g, cc + dc, cr) || !cellWalk(g, cc, cr + dr))) continue;
                const ni = nr * cols + nc;
                if (S.stamp[ni] === gen && S.closed[ni] === 1) continue;
                const ng = S.g[cur] + (dc !== 0 && dr !== 0 ? DIAG : D);
                if (S.stamp[ni] !== gen || ng < S.g[ni]) {
                    S.stamp[ni] = gen; S.closed[ni] = 0;
                    S.g[ni] = ng; S.f[ni] = ng + hCost(nc, nr); S.parent[ni] = cur;
                    hpush(S, ni);
                }
            }
    }
    if (!found) return null;
    // Rekonstruksi goal -> start, balik jadi start -> goal, pangkas, haluskan
    const cells = [];
    for (let i = goal; i !== -1; i = S.parent[i]) cells.push(i);
    cells.reverse();
    cells.shift();                                   // sel tempat berdiri tak perlu
    if (cells.length > PATH_CAP) cells.length = PATH_CAP;
    const pts = [];
    for (const i of cells) pts.push({
        x: g.x0 + ((i % cols) + 0.5) * g.cell,
        z: g.z0 + (((i / cols) | 0) + 0.5) * g.cell,
    });
    return smooth(g, sx, sz, pts);
}

// String-pulling: ganti deretan pusat sel dgn titik belok seminimal mungkin
// (jendela maju dibatasi agar biaya tetap linear).
function smooth(g, sx, sz, pts) {
    const out = [];
    let cx = sx, cz = sz, i = 0;
    while (i < pts.length) {
        let best = i;
        for (let j = Math.min(pts.length - 1, i + 24); j > i; j--)
            if (gridLOS(g, cx, cz, pts[j].x, pts[j].z)) { best = j; break; }
        out.push(pts[best]);
        cx = pts[best].x; cz = pts[best].z;
        i = best + 1;
    }
    return out;
}

// ----------- Steering per-zombie ----------- //
const _aim = { x: 0, z: 0, direct: true };   // objek bersama — baca langsung, jangan disimpan

// Titik tuju frame ini utk zombie z yang mengejar (tx,tz). Return _aim:
//   direct=true  -> garis lurus ke target bebas (atau pathfinder nonaktif/gagal);
//   direct=false -> (x,z) = waypoint path.
// LOS grid dicek TIAP frame (murah): zombie langsung berbelok begitu jalurnya
// tertutup dan langsung lurus lagi begitu player terlihat — tanpa menunggu
// timer. Hanya findPath (mahal) yang di-rate-limit repathSec per zombie;
// macet (berniat jalan tapi perpindahan << kecepatan selama stuckSec) memaksa
// pencarian ulang walau target dekat/terlihat.
export function navAim(z, grid, tx, tz, dt, step) {
    _aim.x = tx; _aim.z = tz; _aim.direct = true;
    if (!grid) return _aim;
    const zx = z.mesh.position.x, zz = z.mesh.position.z;

    // Deteksi macet: bandingkan posisi dgn frame lalu (sudah kena collision)
    if (z.navHasP && z.moving) {
        const moved = Math.hypot(zx - z.navPX, zz - z.navPZ);
        z.navStuck = moved < z.speed * step * 0.25 ? (z.navStuck || 0) + dt : 0;
    }
    z.navHasP = true; z.navPX = zx; z.navPZ = zz;
    if (z.navT === undefined) z.navT = 0;
    z.navT -= dt;

    const stuck = (z.navStuck || 0) >= CFG.zombie.stuckSec;
    if (!stuck) {
        // Sangat dekat dgn target: selalu lurus (jangkauan berhenti/cakar)
        if (Math.hypot(tx - zx, tz - zz) < grid.cell * 1.6) { z.navPath = null; return _aim; }
        // Terlihat lurus: buang path, kejar langsung
        if (gridLOS(grid, zx, zz, tx, tz)) { z.navPath = null; return _aim; }
    }

    // Terhalang: pastikan punya path segar (findPath di-rate-limit navT)
    const needNew = !z.navPath || stuck ||
        Math.hypot(tx - z.navGX, tz - z.navGZ) > grid.cell * 2.5;   // target menjauhi ujung path
    if (needNew && z.navT <= 0) {
        z.navPath = findPath(grid, zx, zz, tx, tz);
        z.navI = 0;
        z.navGX = tx; z.navGZ = tz;
        z.navT = CFG.zombie.repathSec * (0.75 + Math.random() * 0.5);
        if (stuck) z.navStuck = 0;
    }
    const p = z.navPath;
    if (!p) return _aim;   // gagal / menunggu jatah repath: lurus (fallback lama)

    // Maju waypoint bila tercapai, ATAU bila waypoint BERIKUTNYA sudah
    // terlihat (string-pull runtime: belok dini hanya saat aman -> menikung
    // mulus, tidak mampir ke tiap pusat sel).
    while (z.navI < p.length &&
        Math.hypot(p[z.navI].x - zx, p[z.navI].z - zz) < grid.cell * 0.75) z.navI++;
    while (z.navI < p.length - 1 &&
        gridLOS(grid, zx, zz, p[z.navI + 1].x, p[z.navI + 1].z)) z.navI++;
    if (z.navI >= p.length) { z.navPath = null; return _aim; }
    _aim.x = p[z.navI].x; _aim.z = p[z.navI].z; _aim.direct = false;
    return _aim;
}

// Belokkan heading zombie ke sudut `desired` dgn laju putar terbatas
// (CFG.zombie.turnRadPerSec). Zombie BERGERAK sepanjang heading ini, jadi
// perpindahan antar waypoint jadi lengkungan alami, bukan patahan. Status
// tersimpan di z.navHead (radian, dinormalisasi [-PI..PI]).
export function turnToward(z, desired, dt) {
    if (z.navHead === undefined) { z.navHead = desired; return desired; }
    let d = desired - z.navHead;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const max = CFG.zombie.turnRadPerSec * dt;
    if (d > max) d = max; else if (d < -max) d = -max;
    z.navHead += d;
    if (z.navHead > Math.PI) z.navHead -= Math.PI * 2;
    else if (z.navHead < -Math.PI) z.navHead += Math.PI * 2;
    return z.navHead;
}
