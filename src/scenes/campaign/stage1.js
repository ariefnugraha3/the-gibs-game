// SCENE: Campaign STAGE 1 — "Gedung Terbengkalai (Lantai 2)", indoor 60x60 m.
// Denah dirombak 2026-07-11 mengikuti floor-plan referensi user:
//   TANGGA TURUN (start, kiri-atas — player turun dari Lantai 3) -> koridor
//   sempit -> OFFICE (kiri) / CONFERENCE (tengah-atas) / SUPPLY ROOM (kanan-
//   atas: ammo/granat/medkit) -> MAIN HALL (pusat besar) -> SECURITY (kanan) /
//   BREAK ROOM & RESTROOM (kiri-bawah) / STORAGE (kanan-bawah) -> TANGGA TURUN
//   (end, kanan-bawah — turun ke lantai bawah = stage 2 jalan raya). Grid sel
//   2 m: 1=dinding, 0=lantai — dinding visual, collision, line-of-sight, dan
//   hit peluru semua dari grid yang SAMA. Konektivitas & bebas-pintu sudah
//   diverifikasi BFS (lihat rombak); jangan ubah pintu tanpa tes ulang.

import { CFG, CAMP_M } from '../../core/config.js';
import { player, drops, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { setS1FlickerLight } from '../../world/decor.js';
import { applyLightPreset } from '../../world/lighting.js';
import { hideStageMsg } from '../../core/dom.js';
import { saveCampaignStage } from '../../core/saveGame.js';
import { NADE_R } from '../../entities/grenades.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { buildFuturisticDeskMesh } from '../../entities/futuristicDesk.js';
import { buildFuturisticChairMesh } from '../../entities/futuristicChair.js';
import { buildFuturisticCupboardMesh } from '../../entities/futuristicCupboard.js';
import { buildFuturisticMeetingTableMesh } from '../../entities/futuristicMeetingTable.js';
import { buildFuturisticCrateMesh } from '../../entities/futuristicCrate.js';
import { buildFuturisticSofaMesh } from '../../entities/futuristicSofa.js';
import { buildFuturisticStallMesh } from '../../entities/futuristicStall.js';
import { buildFuturisticSinkMesh } from '../../entities/futuristicSink.js';
import { buildFuturisticConsoleMesh } from '../../entities/futuristicConsole.js';
import { spawnCampaignRobot, campaignRobotAI, countStageRobots } from './common.js';
import { beginStageTransition, campaignJumpToStage } from './transition.js';
import { stage2Scene, buildWorld as buildStage2World, placeRobots as placeStage2Robots } from './stage2.js';

// Grid 30 sel x 2 m; gedung ditaruh ~26 km dari jalan raya (stage 2) —
// kedua dunia hidup berdampingan di satu scene, dipisah jarak.
export const S1 = {
    G: 30, CELL: 2 * CAMP_M, H: 22,       // tinggi plafon ~3.1 m
    x0: 30000 - 15 * 2 * CAMP_M,          // pojok barat-laut grid (kiri-atas denah)
    z0: -15 * 2 * CAMP_M
};
export let s1grid = null;                 // [row][col] 1=dinding, 0=lantai
export const s1Cell = (c, r) => ({ x: S1.x0 + (c + 0.5) * S1.CELL, z: S1.z0 + (r + 0.5) * S1.CELL });
export const S1_START = { c: 3, r: 4 };   // ruang tangga TURUN dari Lantai 3 (kiri-atas)
// Trigger tangga TURUN (kanan-bawah) -> turun ke lantai bawah (stage 2 jalan raya)
export const S1_EXIT = { c0: 24, r0: 23, c1: 28, r1: 27 };

const blockers = [];   // furnitur/undakan pejal stage 1 {x,z,hx,hz,ax*,az*,top,standable}
let built = false;

function buildS1Grid() {
    const g = Array.from({ length: S1.G }, () => Array(S1.G).fill(1));
    const carve = (c0, r0, c1, r1) => {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = 0;
    };
    // --- Ruangan (kotak lantai; verifikasi BFS di scratchpad) ---
    carve(1, 1, 6, 6);      // A Stairwell / START (tangga turun dari Lt.3)
    carve(9, 1, 18, 7);     // B Conference Room (tengah-atas)
    carve(21, 1, 28, 6);    // C Supply Room (kanan-atas: ammo/granat/medkit)
    carve(1, 9, 6, 16);     // D Office Room (kiri-tengah)
    carve(8, 9, 20, 21);    // G Main Hall (pusat, area terbuka besar)
    carve(23, 9, 28, 16);   // H Security Room (kanan-tengah)
    carve(1, 19, 6, 26);    // E Break Room (kiri-bawah)
    carve(8, 23, 13, 28);   // F Restroom (bawah-tengah)
    carve(15, 23, 21, 28);  // I Storage Room (bawah-kanan)
    carve(23, 18, 28, 28);  // J End / tangga TURUN ke lantai bawah (kanan-bawah)
    // --- Koridor sempit (jadi robot-spot ambush) ---
    carve(3, 7, 4, 8);      // A -> D koridor awal sempit (spot 1)
    carve(24, 7, 25, 8);    // C -> H lorong kanan dekat supply (spot 6)
    // --- Pintu (bukaan; 1-2 sel) ---
    carve(7, 3, 8, 3);      // A -> B
    carve(19, 3, 20, 3);    // B -> C
    carve(13, 8, 14, 8);    // B -> G (pintu utara main hall)
    carve(7, 12, 7, 12);    // D -> G
    carve(21, 12, 22, 12);  // G -> H
    carve(3, 17, 4, 18);    // D -> E
    carve(10, 21, 11, 22);  // G -> F (restroom)
    carve(17, 21, 18, 22);  // G -> I (storage)
    carve(22, 25, 22, 26);  // I -> J
    carve(25, 17, 26, 17);  // H -> J
    s1grid = g;
}

// Sel dinding? (di luar grid = dinding)
export function s1Wall(c, r) {
    return c < 0 || r < 0 || c >= S1.G || r >= S1.G || s1grid[r][c] === 1;
}

// Lingkaran (x,z,r) sepenuhnya di lantai gedung? (walkable stage 1)
export function stage1Walk(x, z, r) {
    if (!s1grid) return false;
    const c0 = Math.floor((x - r - S1.x0) / S1.CELL), c1 = Math.floor((x + r - S1.x0) / S1.CELL);
    const r0 = Math.floor((z - r - S1.z0) / S1.CELL), r1 = Math.floor((z + r - S1.z0) / S1.CELL);
    for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++)
            if (s1Wall(cc, rr)) return false;
    return true;
}

// Garis pandang bebas dinding? (sampling grid tiap ~setengah sel).
// Dipakai aktivasi robot stage 1: bangun hanya bila MELIHAT player
// (atau sangat dekat menembus dinding tipis / tertembak).
export function s1LOS(x1, z1, x2, z2) {
    if (!s1grid) return true;
    const dx = x2 - x1, dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (S1.CELL * 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + dx * t - S1.x0) / S1.CELL);
        const r = Math.floor((z1 + dz * t - S1.z0) / S1.CELL);
        if (s1Wall(c, r)) return false;
    }
    return true;
}

// Ruas peluru menabrak dinding? (sampling tiap ~7 unit; peluru cepat = 2 sel/frame)
export function s1SegHitsWall(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 7));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const c = Math.floor((x1 + (x2 - x1) * t - S1.x0) / S1.CELL);
        const r = Math.floor((z1 + (z2 - z1) * t - S1.z0) / S1.CELL);
        if (s1Wall(c, r)) return true;
    }
    return false;
}

// Penghalang pejal stage 1 = furnitur + undakan tangga (balok axis-aligned)
export function resolve(pos, radius, feetY) {
    return resolveBlockers(pos, radius, feetY, blockers);
}

// Nav-grid pathfinder stage 1: resolusi SETENGAH sel denah (7 unit = 1 m)
// agar furnitur ikut ter-bake tanpa menutup jalur yang sebenarnya lebar.
// Dinding dari grid denah; furnitur/undakan via resolve (sel yang tergeser =
// penghalang) -> robot MEMUTARI meja/krat, bukan menabrak/mendorongnya.
// Di-bake di AKHIR buildWorld (butuh blockers sudah terisi semua).
export let s1Nav = null;

export function buildWorld() {
    buildS1Grid();
    const size = S1.G * S1.CELL;                      // 420 unit = 60 m
    const cx = S1.x0 + size / 2, cz = S1.z0 + size / 2;

    // --- Lantai: ubin kusam bernoda ---
    const floorTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#4a463e'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#403c35', '#524d44', '#37342e', '#5a554b'], 240, 1, 5);
        g.strokeStyle = 'rgba(24,22,19,0.6)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.moveTo(0, 0); g.lineTo(0, h); g.stroke();
        for (let i = 0; i < 3; i++) {                  // noda gelap
            g.globalAlpha = 0.10 + Math.random() * 0.12;
            g.fillStyle = '#14110d';
            g.beginPath();
            g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 24, 6 + Math.random() * 14, Math.random() * 3, 0, 6.283);
            g.fill();
        }
        g.globalAlpha = 1;
    }, S1.G, S1.G);   // 1 ubin per sel (2 m)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        new THREE.MeshPhongMaterial({ map: floorTex, shininess: 8, specular: 0x121110 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // --- Plafon: panel akustik gelap (menghadap ke bawah) ---
    const ceilTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#2a2723'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#24211c', '#312d27', '#1d1b17'], 120, 1, 4);
        g.strokeStyle = 'rgba(12,11,9,0.7)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.moveTo(0, 0); g.lineTo(0, h); g.stroke();
    }, S1.G, S1.G);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, S1.H, cz);
    // TOP-DOWN (pivot 2026-07-11): plafon DISEMBUNYIKAN — kamera berada jauh di
    // atasnya; dinding tetap berdiri jadi interior terlihat dari atas ala Alien
    // Shooter. Fisika "granat memantul di plafon" (grenadeCollide) tidak berubah.
    ceil.visible = false;
    scene.add(ceil);

    // --- Dinding: satu InstancedMesh (hanya sel dinding yang bertetangga lantai) ---
    const wallTex = makeTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#6b675f'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#605c54', '#767168', '#575349'], 140, 1, 4);
        for (let i = 0; i < 5; i++) {                  // rembesan/retak
            g.strokeStyle = 'rgba(40,37,32,0.5)';
            g.lineWidth = 1 + Math.random();
            let x = Math.random() * w, y = 0;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 3; s++) { x += rand(-6, 6); y += h / 3; g.lineTo(x, y); }
            g.stroke();
        }
    });
    const wallCells = [];
    for (let r = 0; r < S1.G; r++) {
        for (let c = 0; c < S1.G; c++) {
            if (s1grid[r][c] !== 1) continue;
            let nearFloor = false;                     // dinding terkubur di-skip (hemat)
            for (let dr = -1; dr <= 1 && !nearFloor; dr++)
                for (let dc = -1; dc <= 1 && !nearFloor; dc++)
                    if (!s1Wall(c + dc, r + dr)) nearFloor = true;
            if (nearFloor) wallCells.push([c, r]);
        }
    }
    const wallMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(S1.CELL, S1.H, S1.CELL),
        new THREE.MeshPhongMaterial({ map: wallTex, shininess: 5, specular: 0x14130f }),
        wallCells.length);
    {
        const _m = new THREE.Matrix4(), _c = new THREE.Color();
        wallCells.forEach(([c, r], i) => {
            const p = s1Cell(c, r);
            _m.setPosition(p.x, S1.H / 2, p.z);
            wallMesh.setMatrixAt(i, _m);
            _c.setHex(0xffffff).offsetHSL(0, 0, rand(-0.06, 0.04));   // jitter kusam per panel
            wallMesh.setColorAt(i, _c);
        });
        if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    }
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;   // bounds instance tak dihitung r128
    scene.add(wallMesh);

    // --- Furnitur: satu InstancedMesh box + blocker pejal ---
    const fur = [];   // {x,y,z,sx,sy,sz,ry,color}
    const furBox = (c, r, sx, sy, sz, color, ry = 0, dx = 0, dz = 0) => {
        const p = s1Cell(c, r);
        fur.push({ x: p.x + dx, y: sy / 2, z: p.z + dz, sx, sy, sz, ry, color });
        return { x: p.x + dx, z: p.z + dz };
    };
    // blocker pejal axis-aligned (standable -> bisa dipanjat/dipijak)
    const furBlock = (c, r, sx, sy, sz, color, dx = 0, dz = 0, standable = true) => {
        const p = furBox(c, r, sx, sy, sz, color, 0, dx, dz);
        blockers.push({
            x: p.x, z: p.z, hx: sx / 2, hz: sz / 2,
            axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
    };
    // MODEL FURNITUR (entities/futuristic*.js) — BUKAN balok instanced: daftarkan
    // blocker (footprint sama seperti furBlock) lalu render group model yg di-skala
    // mengisi footprint. update() (putar/pulsa/hover) TIDAK dipanggil (statis).
    const putModel = (mesh, x, z, sx, sy, sz, standable) => {
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        mesh.position.set(x, 0, z);
        scene.add(mesh);
    };
    // MEJA kerja: model desk + satu KURSI (dekorasi, TANPA blocker) di sisi depan.
    const deskModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r), x = p.x + dx, z = p.z + dz;
        putModel(buildFuturisticDeskMesh(sx, sy, sz), x, z, sx, sy, sz, standable);
        const chair = buildFuturisticChairMesh(Math.min(5, sz * 0.35));
        chair.position.set(x, 0, z + sz * 0.28);
        scene.add(chair);
    };
    // MEJA RAPAT: model meeting table (ruang konferensi).
    const meetingModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r);
        putModel(buildFuturisticMeetingTableMesh(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };
    // RAK/LEMARI: deret lemari (cupboard) sepanjang sisi terpanjang (tiap unit ~kotak,
    // dibatasi 4) — 1 blocker footprint penuh (nav/collision sama seperti dulu).
    const cupboardModel = (c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r), x = p.x + dx, z = p.z + dz;
        blockers.push({
            x, z, hx: sx / 2, hz: sz / 2, axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(sx / 2, sz / 2), top: sy, standable
        });
        const along = sx >= sz, longLen = along ? sx : sz, shortLen = along ? sz : sx;
        const n = Math.max(1, Math.min(4, Math.round(longLen / shortLen)));
        const unit = longLen / n;
        for (let i = 0; i < n; i++) {
            const off = -longLen / 2 + unit * (i + 0.5);
            const cab = buildFuturisticCupboardMesh(along ? unit : shortLen, sy, along ? shortLen : unit);
            cab.position.set(along ? x + off : x, 0, along ? z : z + off);
            scene.add(cab);
        }
    };
    // PROP MODEL generik (entities/futuristic*.js): dari cell grid + blocker
    // footprint sama seperti furBlock -> nav/collision IDENTIK dgn versi balok.
    const propModel = (build, c, r, sx, sy, sz, dx = 0, dz = 0, standable = true) => {
        const p = s1Cell(c, r);
        putModel(build(sx, sy, sz), p.x + dx, p.z + dz, sx, sy, sz, standable);
    };
    // MONITOR: konsol kecil DI ATAS meja (dekorasi, TANPA blocker) di y=top.
    const monitorModel = (c, r, sx, sy, sz, dx, dz, top) => {
        const p = s1Cell(c, r);
        const m = buildFuturisticConsoleMesh(sx, sy, sz);
        m.position.set(p.x + dx, top, p.z + dz);
        scene.add(m);
    };
    // Conference (B): meja rapat panjang di tengah (model meja rapat)
    meetingModel(13, 4, 84, 7, 30);
    // Office (D): dua meja (model meja + kursi) + terminal (konsol di atas meja)
    deskModel(3, 11, 26, 7, 12);
    deskModel(4, 14, 22, 7, 12, 4, 2);
    monitorModel(3, 11, 6, 4, 1.5, 0, -3, 7);
    // Supply (C): rak logam (model lemari) di dinding utara & timur
    cupboardModel(24, 1, 90, 15, 8, 0, 2);
    cupboardModel(27, 4, 8, 15, 40);
    // Main Hall (G): krat (model) sebagai cover tersebar (jalur tengah terbuka)
    propModel(buildFuturisticCrateMesh, 11, 12, 16, 9, 16);
    propModel(buildFuturisticCrateMesh, 16, 17, 18, 9, 18);
    propModel(buildFuturisticCrateMesh, 12, 18, 14, 8, 14, 2, 0);
    // Security (H): meja monitor (model meja) + terminal + kabinet (model lemari)
    deskModel(25, 11, 24, 7, 12);
    cupboardModel(27, 14, 8, 16, 20, 4, 0);
    monitorModel(25, 11, 6, 4, 1.5, 0, -3, 7);
    // Break Room (E): sofa (model) + meja (model meja)
    propModel(buildFuturisticSofaMesh, 3, 21, 20, 6, 18);
    deskModel(4, 24, 16, 7, 12, 2, 2);
    // Restroom (F): bilik (model kios/sekat) + deret wastafel (model)
    propModel(buildFuturisticStallMesh, 9, 24, 2, 15, 24, 4, 4);
    propModel(buildFuturisticSinkMesh, 11, 27, 16, 8, 4, 0, -1);
    // Storage (I): dua baris rak (model lemari) + krat (celah c17-18 = pintu ke main hall)
    cupboardModel(16, 24, 8, 16, 30, 0, 2);
    cupboardModel(19, 24, 8, 16, 30, 0, 2);
    propModel(buildFuturisticCrateMesh, 18, 27, 16, 9, 10);
    if (fur.length) {   // render sisa furnitur balok sbg satu instanced mesh (kini kosong: semua prop -> model)
        const unit = new THREE.BoxGeometry(1, 1, 1);
        const fMesh = new THREE.InstancedMesh(unit,
            new THREE.MeshLambertMaterial({ color: 0xffffff }), fur.length);
        const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
            _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
        fur.forEach((f, i) => {
            _e.set(0, f.ry, 0);
            _m.compose(_p.set(f.x, f.y, f.z), _q.setFromEuler(_e), _s.set(f.sx, f.sy, f.sz));
            fMesh.setMatrixAt(i, _m);
            _c.setHex(f.color).offsetHSL(0, rand(-0.04, 0.02), rand(-0.05, 0.03));
            fMesh.setColorAt(i, _c);
        });
        if (fMesh.instanceColor) fMesh.instanceColor.needsUpdate = true;
        fMesh.castShadow = true;
        fMesh.frustumCulled = false;
        scene.add(fMesh);
    }

    // --- Tangga masuk & keluar: undakan + portal gelap (kesan lantai bawah) ---
    const stepMat = new THREE.MeshPhongMaterial({ color: 0x57534b, shininess: 6 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x020202 });
    const mkStairs = (c, r, dirZ) => {   // dirZ: -1 = naik ke utara, +1 = ke selatan
        const p = s1Cell(c, r);
        for (let i = 0; i < 5; i++) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(26, 2 + i * 2, 8), stepMat);
            st.position.set(p.x, (2 + i * 2) / 2, p.z + dirZ * (i * 8 - 14));
            st.castShadow = true; st.receiveShadow = true;
            scene.add(st);
        }
        const portal = new THREE.Mesh(new THREE.PlaneGeometry(26, S1.H - 10), holeMat);
        // tepat di DEPAN muka dinding (bukan terkubur di dalam sel dinding)
        portal.position.set(p.x, (S1.H - 10) / 2 + 9, p.z + dirZ * 20);
        portal.rotation.y = dirZ > 0 ? Math.PI : 0;
        scene.add(portal);
        blockers.push({   // undakan pejal (bisa dipijak)
            x: p.x, z: p.z + dirZ * 4, hx: 13, hz: 20,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(13, 20), top: 10, standable: true
        });
    };
    mkStairs(3, 2, -1);     // START: tangga naik ke utara = jalur turun dari Lantai 3
    mkStairs(26, 25, 1);    // END: tangga TURUN ke selatan = ke lantai bawah (stage 2)

    // Papan EXIT hijau menyala di atas tangga keluar (kanan-bawah)
    const exitP = s1Cell(26, 24);
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x2eff6a, toneMapped: false }));
    exitSign.position.set(exitP.x, S1.H - 4, exitP.z);
    scene.add(exitSign);

    // --- Pencahayaan interior: 6 titik lampu TETAP (dibuat saat build, sebelum
    // render pertama -> shader compile sekali; hanya intensity yang dianimasikan).
    const lampFix = new THREE.MeshBasicMaterial({ color: 0xfff2cc, toneMapped: false });
    const addLamp = (c, r, color, inten, dist) => {
        const p = s1Cell(c, r);
        const L = new THREE.PointLight(color, inten, dist, 2);
        L.position.set(p.x, S1.H - 3, p.z);
        scene.add(L);
        const fix = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 8), lampFix);
        fix.position.set(p.x, S1.H - 0.4, p.z);
        scene.add(fix);
        return L;
    };
    addLamp(3, 3, 0xffd9a0, 0.9, 220);                           // stairwell/start
    addLamp(13, 4, 0xffe2b8, 0.95, 320);                         // conference
    addLamp(24, 3, 0xffd9a0, 0.9, 240);                          // supply room
    addLamp(3, 12, 0xffd9a0, 0.85, 220);                         // office
    setS1FlickerLight(addLamp(14, 14, 0xffe2b8, 0.9, 340));      // main hall (berkedip)
    addLamp(25, 12, 0xbfe4ff, 0.8, 240);                         // security (dingin kebiruan)
    addLamp(3, 22, 0xffd9a0, 0.8, 220);                          // break room
    addLamp(10, 26, 0xbfe4ff, 0.7, 200);                         // restroom
    addLamp(18, 26, 0xffc890, 0.8, 240);                         // storage
    const exitLight = new THREE.PointLight(0x39ff7a, 0.85, 220, 2);
    exitLight.position.set(exitP.x, S1.H - 6, exitP.z);
    scene.add(exitLight);

    // Bake nav-grid TERAKHIR (semua blockers sudah terisi): dinding dari grid
    // denah, furnitur/undakan dari resolve. Radius sampel 3 (< badan 3.5)
    // agar celah sempit tapi lewat-able tidak tertutup di grid.
    const half = S1.CELL / 2;
    s1Nav = makeNavGrid(S1.x0, S1.z0, half, S1.G * 2, S1.G * 2, (x, z) => {
        if (!stage1Walk(x, z, 3)) return false;
        _v3.set(x, 0, z);
        resolve(_v3, 3, 0);
        return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
    });
}

// Robot stage 1: 9 spot pada denah referensi [col, row, jumlah]. Tiap spot
// men-spawn `n` robot di sekitar titiknya (jitter + resolve keluar furnitur).
const S1_ROBOTS = [
    [3, 8, 2],     // 1 koridor awal (sempit)
    [3, 12, 3],    // 2 office
    [3, 22, 4],    // 3 break room
    [10, 26, 3],   // 4 restroom
    [14, 15, 5],   // 5 main hall (area terbuka)
    [24, 8, 4],    // 6 lorong dekat supply
    [25, 12, 3],   // 7 security (ambush)
    [18, 26, 3],   // 8 storage
    [26, 24, 2],   // 9 dekat tangga keluar (serangan terakhir)
];
export function placeRobots() {
    for (const [c, r, n] of S1_ROBOTS) {
        const p = s1Cell(c, r);
        for (let k = 0; k < n; k++) {
            _v3.set(p.x + rand(-7, 7), 0, p.z + rand(-7, 7));
            resolve(_v3, 4, 0);                             // geser keluar furnitur
            if (!stage1Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
            spawnCampaignRobot(_v3.x, _v3.z, 1);
        }
    }
}

// Persediaan stage 1 (tak kedaluwarsa): SUPPLY ROOM (kanan-atas) berisi ammo +
// medkit; bonus kecil tersebar di break/restroom/storage. (Granat lempar dihapus
// 2026-07-11 — persediaan granat lama diganti paket peluru.)
export function placeSupplies() {
    const put = (type, c, r, dx = 0, dz = 0) => {
        const p = s1Cell(c, r);
        const mesh = type === 'mag' ? buildMagMesh() : buildMedkitMesh();
        mesh.position.set(p.x + dx, 1, p.z + dz);
        scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    // Supply Room (c21-28 r1-6; hindari rak dinding utara r1-2 & timur c27)
    put('mag', 22, 3); put('mag', 23, 4, 4, 0);
    put('mag', 24, 3); put('mag', 25, 4, 0, 4);
    put('medkit', 23, 5); put('medkit', 25, 3, 6, 0);
    // Bonus tersebar (sel lantai terbuka — sudah diverifikasi bebas furnitur)
    put('mag', 2, 23);       // break room
    put('medkit', 12, 25);   // restroom
    put('mag', 20, 27);      // storage
}

export const stage1Scene = {
    id: 'campaign-1',

    // Masuk stage 1 = mulai campaign (start pertama ATAU restart setelah mati).
    // Array robots/drops selalu sudah bersih di titik ini, jadi penempatan
    // ulang aman. Kedua dunia dibangun sekali (guard `built`).
    enter() {
        saveCampaignStage(1);     // checkpoint: campaign berada di stage 1
        if (!built) {
            built = true;
            buildStage2World();   // STAGE 2: gedung terbengkalai Lantai 2 (denah, jauh)
            buildWorld();         // STAGE 1: gedung terbengkalai (jauh dari stage 2)
        }
        placeStage2Robots();     // robot gedung stage 2 (9 spot denah) + supply
        placeRobots();           // robot gedung sesuai denah (stage 1)
        placeSupplies();          // ruang persediaan: ammo/granat/medkit
        applyLightPreset(scene, 'indoor');   // interior gelap + kabut rapat
        const sp = s1Cell(S1_START.c, S1_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // yaw 180° — hadap selatan (pintu lobby)
        hideStageMsg();
    },

    // Mati -> ulang dari stage 1 juga (dirinya sendiri)
    restartScene: () => stage1Scene,

    // CHEAT: konsol `skip-to-stage-N` -> lompat langsung ke stage n (tanpa shop)
    cheatSkipToStage: (n) => campaignJumpToStage(n),

    // Dinding grid: geser per-sumbu (menyusur tembok), penghalang furnitur,
    // slide lagi, lalu cek trigger tangga keluar -> transisi ke stage 2.
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        // Trigger tangga keluar -> FIELD SHOP dulu, lalu transisi ber-loading ke stage 2
        if (pos.x >= S1.x0 + S1_EXIT.c0 * S1.CELL
            && pos.x <= S1.x0 + (S1_EXIT.c1 + 1) * S1.CELL
            && pos.z >= S1.z0 + S1_EXIT.r0 * S1.CELL
            && pos.z <= S1.z0 + (S1_EXIT.r1 + 1) * S1.CELL) {
            beginStageTransition(stage2Scene);   // → SHOP SCENE (loading→shop→loading→stage 2)
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Peluru MATI di dinding — mencegah membunuh robot diam di ruangan lain
    // menembus tembok (sweep ruas posisi-lalu -> kini).
    bulletBlocked(b) {
        return b.mesh.position.y < S1.H
            && s1SegHitsWall(b.px, b.pz, b.mesh.position.x, b.mesh.position.z);
    },

    grenadeCollide(g, oldGX, oldGZ) {
        // Pantulan dinding grid + penghalang furnitur
        if (!stage1Walk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
        // Plafon gedung: granat memantul turun, tidak lolos ke atas
        if (g.mesh.position.y > S1.H - NADE_R) {
            g.mesh.position.y = S1.H - NADE_R;
            if (g.vy > 0) g.vy = -g.vy * 0.3;
        }
    },

    robotAI(z, dt, step) {
        // Indoor: aktivasi butuh LOS grid (atau sangat dekat / tertembak)
        return campaignRobotAI(z, dt, step, { walkable: stage1Walk, resolve, los: s1LOS, nav: s1Nav });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() { return `FLOOR 2 — Robots: ${countStageRobots(1)} | Find the stairs down`; },

    // Landmark gedung: tangga keluar (hijau menyala; dijepit ke tepi saat jauh)
    radarLandmarks(plot) {
        const ex = S1.x0 + (S1_EXIT.c0 + S1_EXIT.c1 + 1) / 2 * S1.CELL;
        const ez = S1.z0 + (S1_EXIT.r0 + S1_EXIT.r1 + 1) / 2 * S1.CELL;
        plot(ex - camera.position.x, ez - camera.position.z, "#2eff6a", 5, true);
    },
};
