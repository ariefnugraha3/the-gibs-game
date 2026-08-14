// DINDING YANG BISA MEMUDAR — sel `#` campaign (2026-08-14, permintaan user
// "saya ingin tembok/dinding juga transparant jika menutupi character").
//
// MASALAHNYA: dinding adalah penghalang paling sering di stage indoor, tapi ia
// juga geometri yang paling TIDAK bisa dipudarkan satu-satu. Stage 1-3 menaruh
// seluruh selnya di SATU InstancedMesh (satu draw call, satu material — memudar-
// kannya memudarkan seluruh gedung), sementara Stage 5/6 melebur badan + kulit
// tiap sel ke batch statis bersama perabot (`addMergedStatic`), yang tak punya
// cara apa pun untuk mengeluarkan satu sel.
//
// CARANYA: satu sel dinding TIDAK PERNAH benar-benar dipudarkan. Ia DISEMBUNYIKAN
// dari instansnya (matriks di-skala nol) dan digantikan sebuah PROXY dari kolam
// kecil — mesh berdiri sendiri dengan KLON MATERIAL MILIKNYA SENDIRI, jadi tiap
// sel bisa meredup dengan easing-nya sendiri. Kolamnya `poolSize` slot (12), jauh
// lebih banyak daripada jumlah sel yang pernah menutupi player + robot sekaligus.
// Harga tetapnya: satu InstancedMesh badan + (paling banyak) 16 InstancedMesh
// kulit muka + 12 slot proxy yang MENGANGGUR TAK TERGAMBAR — bukan ratusan draw
// call per sel seperti kalau tiap sel dilas sendiri.
//
// KULIT MUKA (Stage 5/6): `buildDetailedWallCell` menghasilkan geometri yang SAMA
// PERSIS untuk tiap muka terbuka — hanya posisinya yang berbeda. Jadi ia direkam
// SEKALI per (arah muka × material) di sel kanonik lalu di-instance; itu juga
// membuat kulitnya ikut hilang saat selnya disembunyikan, tanpa itu proxy tembus
// pandang akan berdiri di belakang panel-panel yang masih pekat.
//
// ATURAN: material proxy dibuat SAAT DUNIA DIBANGUN (bukan saat memudar), jadi
// `renderer.compile` di layar loading sudah menyiapkan programnya — invarian
// "tanpa rekompilasi shader saat main" tetap utuh walau proxy-nya `visible=false`
// (compile menyusuri SELURUH scene, termasuk objek tersembunyi).

import { mergeObjectInPlace } from '../../../utils/meshBatch.js';
import { registerOccluder, occlusionOpacity } from './occlusion.js';
import { buildDetailedWallCell } from './wallDetail.js';

const FACES = [
    { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
    { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
];

// Gabungkan sekumpulan kotak jadi satu geometry per material. Di harness headless
// `mergeObjectInPlace` mengembalikan grup apa adanya, jadi jatuh kembali ke
// geometry kotak pertama — bentuknya tak diuji di sana, hanya strukturnya.
function bakeBuckets(boxes) {
    const byMat = new Map();
    for (const b of boxes) {
        let list = byMat.get(b.mat);
        if (!list) { list = []; byMat.set(b.mat, list); }
        list.push(b);
    }
    const out = [];
    for (const [mat, list] of byMat) {
        const g = new THREE.Group();
        for (const b of list) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(b.sx, b.sy, b.sz), mat);
            m.position.set(b.x, b.y, b.z);
            g.add(m);
        }
        const welded = mergeObjectInPlace(g);
        const mesh = welded.children.find(o => o.isMesh) || welded.children[0];
        out.push({ mat, geo: mesh ? mesh.geometry : new THREE.BoxGeometry(1, 1, 1) });
    }
    return out;
}

// Rekam kulit satu muka terbuka di sel kanonik (0,0) berpusat di origin.
function faceBuckets(face, opt) {
    const boxes = [];
    const record = (sx, sy, sz, x, y, z, mat) => { boxes.push({ sx, sy, sz, x, y, z, mat }); };
    buildDetailedWallCell(() => {}, {          // panggilan pertama = BADAN, diabaikan
        c: 0, r: 0, x: 0, z: 0, cell: opt.cell, wallH: opt.wallH,
        // Hanya `face` yang terbuka; tetangga lain dianggap dinding.
        isWall: (c, r) => !(c === face.dc && r === face.dr),
        body: opt.body, panel: opt.panel, steel: opt.steel, ink: opt.ink,
        accent: opt.accent, accentEvery: opt.accentEvery,
        detailAdd: record,
    });
    return bakeBuckets(boxes);
}

// Apakah sel (c,r) mendapat aksen? Rumus hash-nya milik buildDetailedWallCell.
const hasAccent = (c, r, accentEvery) => Math.abs(c * 37 + r * 61) % accentEvery === 0;

// Matriks "sembunyikan": skala NOL di posisi selnya (bukan visible=false —
// InstancedMesh tak punya visibilitas per instans).
function zeroMatrix(m4, x, y, z) {
    if (typeof m4.makeScale === 'function') m4.makeScale(0, 0, 0);
    m4.setPosition(x, y, z);
    return m4;
}
// Matriks "tampilkan": WAJIB di-identity dulu — matriks yang sama dipakai
// bergantian untuk menyembunyikan, dan `setPosition` hanya menyentuh kolom
// translasi. Tanpa ini skala nol-nya ikut terbawa dan selnya tak pernah kembali.
function placeMatrix(m4, x, y, z) {
    if (typeof m4.identity === 'function') m4.identity();
    m4.setPosition(x, y, z);
    return m4;
}

/**
 * Bangun dinding yang bisa memudar untuk satu stage.
 *   key       : kunci set occluder (utility/occlusion.js)
 *   parent    : root dunia stage
 *   cells     : [{ c, r, x, z }] — HANYA sel yang benar-benar dirender
 *   cell/wallH: ukuran sel & tinggi dinding
 *   bodyMat   : material badan dinding (dipakai InstancedMesh)
 *   colorAt   : opsional (i) => THREE.Color — jitter per instans (dipertahankan
 *               apa adanya supaya urutan RNG stage tidak bergeser)
 *   detail    : opsional { isWall, panel, steel, ink, accent, accentEvery } —
 *               kulit muka ala Stage 5/6; null = dinding kotak polos (Stage 1-3)
 * Mengembalikan { body, dressing[], proxies[], debug() }.
 */
export function buildFadeableWalls({
    key, parent, cells, cell, wallH, bodyMat, colorAt = null,
    detail = null, poolSize = 12,
}) {
    let details = 0;                     // jumlah panel kulit (statistik stage)
    const M4 = new THREE.Matrix4();
    const body = new THREE.InstancedMesh(
        new THREE.BoxGeometry(cell, wallH, cell), bodyMat, Math.max(1, cells.length));
    const colors = [];
    cells.forEach((p, i) => {
        body.setMatrixAt(i, placeMatrix(M4, p.x, wallH / 2, p.z));
        if (colorAt) {
            const col = colorAt(i, p);
            body.setColorAt(i, col);
            colors.push({ r: col.r, g: col.g, b: col.b });
        }
    });
    if (colorAt && body.instanceColor) body.instanceColor.needsUpdate = true;
    body.receiveShadow = true;
    body.frustumCulled = false;
    parent.add(body);

    // --- Kulit muka (opsional) di-instance per (muka x material) --------------
    const dressing = [];                 // { face, mat, geo, mesh, next }
    const cellFaces = cells.map(() => []);   // per sel: daftar { mesh, idx }
    if (detail) {
        const accentEvery = detail.accentEvery || 13;
        const perFace = FACES.map(f => faceBuckets(f, {
            cell, wallH, body: bodyMat, panel: detail.panel, steel: detail.steel,
            ink: detail.ink, accent: detail.accent, accentEvery,
        }));
        // Berapa instans yang dibutuhkan tiap (muka, material)?
        const exposure = cells.map(p => FACES.map(f => !detail.isWall(p.c + f.dc, p.r + f.dr)));
        cells.forEach((p, i) => {
            const acc = hasAccent(p.c, p.r, accentEvery) ? 1 : 0;
            for (let fi = 0; fi < FACES.length; fi++) if (exposure[i][fi]) details += 7 + acc;
        });
        for (let fi = 0; fi < FACES.length; fi++) {
            for (const bucket of perFace[fi]) {
                const isAccent = bucket.mat === detail.accent;
                let n = 0;
                cells.forEach((p, i) => {
                    if (!exposure[i][fi]) return;
                    if (isAccent && !hasAccent(p.c, p.r, accentEvery)) return;
                    n++;
                });
                if (!n) continue;
                const mesh = new THREE.InstancedMesh(bucket.geo, bucket.mat, n);
                mesh.receiveShadow = true; mesh.frustumCulled = false;
                parent.add(mesh);
                const entry = { face: fi, mat: bucket.mat, geo: bucket.geo, mesh, next: 0, accent: isAccent };
                dressing.push(entry);
                cells.forEach((p, i) => {
                    if (!exposure[i][fi]) return;
                    if (isAccent && !hasAccent(p.c, p.r, accentEvery)) return;
                    const idx = entry.next++;
                    mesh.setMatrixAt(idx, placeMatrix(M4, p.x, 0, p.z));
                    cellFaces[i].push({ mesh, idx, face: fi, geo: bucket.geo, mat: bucket.mat });
                });
                if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
            }
        }
        cells.forEach((p, i) => { p._faces = exposure[i]; });
    }

    // --- Kolam PROXY: satu slot = satu sel yang sedang memudar ----------------
    const proxies = [];
    for (let s = 0; s < poolSize; s++) {
        const g = new THREE.Group();
        g.visible = false;
        const mats = [];
        const bodyClone = bodyMat.clone();
        bodyClone.transparent = true;
        mats.push(bodyClone);
        const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(cell, wallH, cell), bodyClone);
        bodyMesh.position.y = wallH / 2;
        bodyMesh.receiveShadow = true;
        g.add(bodyMesh);
        const faceMeshes = [];
        for (const entry of dressing) {
            const clone = entry.mat.clone();
            clone.transparent = true;
            mats.push(clone);
            const m = new THREE.Mesh(entry.geo, clone);
            m.receiveShadow = true;
            g.add(m);
            faceMeshes.push({ face: entry.face, mesh: m, accent: entry.accent });
        }
        parent.add(g);
        proxies.push({ group: g, bodyMesh, bodyMat: bodyClone, mats, faceMeshes, cellIndex: -1 });
    }

    const takeSlot = () => proxies.find(p => p.cellIndex < 0) || null;

    const hideCell = (i) => {
        const p = cells[i];
        body.setMatrixAt(i, zeroMatrix(M4, p.x, wallH / 2, p.z));
        if (body.instanceMatrix) body.instanceMatrix.needsUpdate = true;
        for (const d of cellFaces[i]) {
            d.mesh.setMatrixAt(d.idx, zeroMatrix(M4, p.x, 0, p.z));
            if (d.mesh.instanceMatrix) d.mesh.instanceMatrix.needsUpdate = true;
        }
    };
    const showCell = (i) => {
        const p = cells[i];
        body.setMatrixAt(i, placeMatrix(M4, p.x, wallH / 2, p.z));
        if (body.instanceMatrix) body.instanceMatrix.needsUpdate = true;
        for (const d of cellFaces[i]) {
            d.mesh.setMatrixAt(d.idx, placeMatrix(M4, p.x, 0, p.z));
            if (d.mesh.instanceMatrix) d.mesh.instanceMatrix.needsUpdate = true;
        }
    };

    // Satu occluder per sel; `onFade` menukar instans <-> proxy.
    cells.forEach((p, i) => {
        const state = { slot: null };
        registerOccluder(key, null, {
            x: p.x, z: p.z, hx: cell / 2, hz: cell / 2, top: wallH,
            onFade: (f) => {
                if (f > 0.999) {
                    if (state.slot) {
                        state.slot.group.visible = false;
                        state.slot.cellIndex = -1;
                        state.slot = null;
                        showCell(i);
                    }
                    return;
                }
                if (!state.slot) {
                    const slot = takeSlot();
                    if (!slot) return;                 // kolam penuh: sel tetap pekat
                    state.slot = slot;
                    slot.cellIndex = i;
                    slot.group.position.set(p.x, 0, p.z);
                    if (colors[i]) slot.bodyMat.color.setRGB(colors[i].r, colors[i].g, colors[i].b);
                    for (const fm of slot.faceMeshes) {
                        const open = !p._faces || p._faces[fm.face];
                        fm.mesh.visible = !!open
                            && (!fm.accent || !detail
                                || hasAccent(p.c, p.r, detail.accentEvery || 13));
                    }
                    slot.group.visible = true;
                    hideCell(i);
                }
                for (const m of state.slot.mats) m.opacity = f;
            },
        });
    });

    return {
        body, dressing, proxies, cells,
        details,
        debug: () => ({
            cells: cells.length, details,
            dressingMeshes: dressing.length,
            pool: proxies.length,
            active: proxies.filter(p => p.cellIndex >= 0).length,
            opacity: occlusionOpacity(),
            drawGroups: 1 + dressing.length,
        }),
    };
}
