// SCENE: Campaign STAGE 1 — "Gedung Terbengkalai (Lantai 3)", indoor 60x60 m.
// Denah: tangga masuk (kiri-atas) -> lobby -> Kantor 1/2 -> Ruang Persediaan
// (kanan-atas: ammo/granat/medkit) -> koridor tengah -> toilet/utilitas ->
// area pemuatan -> ruang pendingin -> tangga keluar (kanan-bawah, trigger
// pindah ke stage 2 jalan raya). Grid sel 2 m: 1=dinding, 0=lantai — dinding
// visual, collision, line-of-sight, dan hit peluru semua dari grid yang SAMA.

import { CFG, CAMP_M } from '../../core/config.js';
import { player, drops, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { setS1FlickerLight } from '../../world/decor.js';
import { applyLightPreset } from '../../world/lighting.js';
import { setScene } from '../../core/sceneManager.js';
import { hideStageMsg } from '../../core/dom.js';
import { buildGrenadeMesh, NADE_R } from '../../entities/grenades.js';
import { buildMedkitMesh, buildMagMesh } from '../../entities/drops.js';
import { spawnCampaignZombie, campaignZombieAI, countStageZombies } from './common.js';
import { stage2Scene, buildWorld as buildStage2World, placeZombies as placeStage2Zombies } from './stage2.js';

// Grid 30 sel x 2 m; gedung ditaruh ~26 km dari jalan raya (stage 2) —
// kedua dunia hidup berdampingan di satu scene, dipisah jarak.
export const S1 = {
    G: 30, CELL: 2 * CAMP_M, H: 22,       // tinggi plafon ~3.1 m
    x0: 30000 - 15 * 2 * CAMP_M,          // pojok barat-laut grid (kiri-atas denah)
    z0: -15 * 2 * CAMP_M
};
export let s1grid = null;                 // [row][col] 1=dinding, 0=lantai
export const s1Cell = (c, r) => ({ x: S1.x0 + (c + 0.5) * S1.CELL, z: S1.z0 + (r + 0.5) * S1.CELL });
export const S1_START = { c: 3, r: 4 };   // di ruang tangga masuk (kiri-atas)
// Trigger tangga keluar (kanan-bawah) -> pindah ke stage 2 (jalan raya)
export const S1_EXIT = { c0: 24, r0: 25, c1: 28, r1: 27 };

const blockers = [];   // furnitur/undakan pejal stage 1 {x,z,hx,hz,ax*,az*,top,standable}
let built = false;

function buildS1Grid() {
    const g = Array.from({ length: S1.G }, () => Array(S1.G).fill(1));
    const carve = (c0, r0, c1, r1) => {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = 0;
    };
    // --- Ruangan ---
    carve(1, 1, 5, 6);      // tangga masuk (start)
    carve(1, 8, 5, 16);     // lobby awal + lounge
    carve(7, 1, 13, 6);     // kantor 1
    carve(15, 1, 20, 6);    // kantor 2
    carve(22, 1, 28, 6);    // ruang persediaan (supplies)
    carve(6, 8, 27, 9);     // koridor tengah (menyatu dgn lobby di barat)
    carve(7, 11, 10, 16);   // toilet
    carve(12, 11, 15, 16);  // ruang utilitas
    carve(17, 11, 21, 21);  // area pemuatan (memanjang ke selatan)
    carve(23, 11, 28, 16);  // ruang pendingin
    carve(23, 18, 28, 27);  // vestibula + ruang tangga keluar
    // --- Pintu (bukaan 2 sel = 4 m; beberapa 1 sel utk kesan sempit) ---
    carve(2, 7, 3, 7);      // start -> lobby
    carve(6, 2, 6, 3);      // start -> kantor 1 ("cek pintu samping")
    carve(9, 7, 10, 7);     // kantor 1 -> koridor
    carve(16, 7, 17, 7);    // kantor 2 -> koridor
    carve(21, 2, 21, 3);    // kantor 2 -> persediaan
    carve(24, 7, 25, 7);    // persediaan -> koridor
    carve(8, 10, 9, 10);    // koridor -> toilet
    carve(13, 10, 14, 10);  // koridor -> utilitas
    carve(18, 10, 19, 10);  // koridor -> pemuatan
    carve(25, 10, 26, 10);  // koridor -> pendingin
    carve(22, 13, 22, 14);  // pemuatan -> pendingin
    carve(22, 19, 22, 20);  // pemuatan -> vestibula (rute bawah)
    carve(25, 17, 26, 17);  // pendingin -> vestibula/tangga keluar
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
// Dipakai aktivasi zombie stage 1: bangun hanya bila MELIHAT player
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
// penghalang) -> zombie MEMUTARI meja/krat, bukan menabrak/mendorongnya.
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
    const WOOD = 0x6b4a2f, SHELF = 0x55606a, CRATE = 0x7a5c33, FRZ = 0xbfc9cc,
        MACH = 0x3d5040, SOFA = 0x5a3f3f, STALL = 0x88817a, DARK = 0x23211d;
    // Kantor 1: dua gugus meja + monitor
    furBlock(9, 3, 26, 7, 14, WOOD);
    furBlock(11, 5, 26, 7, 14, WOOD, 7, 0);
    furBox(9, 3, 6, 4.5, 1.5, DARK, 0.3, -4, -3, 0); fur[fur.length - 1].y = 7 + 2.2;
    furBox(11, 5, 6, 4.5, 1.5, DARK, -0.2, 5, 3, 0); fur[fur.length - 1].y = 7 + 2.2;
    // Kantor 2: meja + kabinet arsip
    furBlock(17, 3, 24, 7, 13, WOOD);
    furBlock(19, 5, 8, 16, 6, SHELF, 10, 8);
    // Ruang persediaan: rak logam di dinding utara & selatan
    furBlock(25, 1, 70, 15, 8, SHELF, 0, 2);
    furBlock(23, 6, 28, 15, 8, SHELF, -2, -2);   // menjauhi pintu selatan (sel 24-25)
    // Toilet: bilik & wastafel
    furBlock(8, 12, 2, 15, 26, STALL, 6, 6);
    furBlock(8, 16, 18, 8, 4, 0xd8d4c8, 0, -2);
    // Utilitas: mesin/panel
    furBlock(13, 12, 16, 17, 10, MACH);
    furBlock(14, 15, 10, 12, 8, DARK, 4, 4);
    // Area pemuatan: palet & krat (sebagian bisa dipanjat)
    furBlock(18, 13, 16, 8, 16, CRATE);
    furBlock(20, 16, 14, 16, 14, CRATE, 2, 0);
    furBlock(18, 19, 16, 8, 16, CRATE, -4, 4);
    // Ruang pendingin: unit pembeku dua baris
    furBlock(24, 12, 10, 18, 8, FRZ, 0, 2);
    furBlock(26, 12, 10, 18, 8, FRZ, 4, 2);
    furBlock(24, 15, 10, 18, 8, FRZ, 0, 4);
    // Lobby: sofa + meja
    furBlock(3, 13, 26, 6, 10, SOFA);
    furBlock(3, 11, 10, 5, 10, WOOD);
    // Vestibula: krat kecil
    furBlock(24, 20, 12, 9, 12, CRATE);
    {   // render semua furnitur sebagai satu instanced mesh
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
    mkStairs(3, 2, -1);    // tangga masuk (utara ruang start)
    mkStairs(26, 26, 1);   // tangga keluar (selatan ruang exit)

    // Papan EXIT hijau menyala di atas tangga keluar
    const exitP = s1Cell(26, 25);
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x2eff6a, toneMapped: false }));
    exitSign.position.set(exitP.x, S1.H - 4, exitP.z + 6);
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
    addLamp(3, 10, 0xffd9a0, 0.9, 240);                          // lobby
    setS1FlickerLight(addLamp(14, 8, 0xffe2b8, 0.85, 260));      // koridor tengah (berkedip)
    addLamp(25, 3, 0xffd9a0, 0.9, 240);                          // ruang persediaan
    addLamp(19, 15, 0xffc890, 0.8, 260);                         // area pemuatan
    addLamp(25, 13, 0xbfe4ff, 0.7, 220);                         // pendingin (dingin kebiruan)
    const exitLight = new THREE.PointLight(0x39ff7a, 0.8, 200, 2);
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

// Zombie stage 1: titik tengkorak pada denah (sel grid) + jitter kecil.
const S1_ZOMBIES = [
    [10, 3],    // kantor 1
    [17, 4],    // kantor 2
    [12, 8],    // koridor tengah (barat)
    [21, 9],    // koridor tengah (timur)
    [9, 14],    // toilet
    [13, 14],   // ruang utilitas
    [19, 13],   // area pemuatan utara
    [19, 20],   // area pemuatan selatan
    [26, 2],    // ruang persediaan ("awas langit-langit")
    [25, 14],   // ruang pendingin
    [26, 21],   // vestibula menuju exit ("cek pintu langit-langit")
];
export function placeZombies() {
    for (const [c, r] of S1_ZOMBIES) {
        const p = s1Cell(c, r);
        _v3.set(p.x + rand(-4, 4), 0, p.z + rand(-4, 4));
        resolve(_v3, 4, 0);                             // geser keluar furnitur
        if (!stage1Walk(_v3.x, _v3.z, 4)) _v3.set(p.x, 0, p.z);
        spawnCampaignZombie(_v3.x, _v3.z, 1);
    }
}

// Persediaan stage 1 (tak kedaluwarsa): Ruang Persediaan berisi ammo + granat
// + medkit sesuai denah; bonus kecil di toilet & area pemuatan.
export function placeSupplies() {
    const put = (type, c, r, dx = 0, dz = 0) => {
        const p = s1Cell(c, r);
        let mesh;
        if (type === 'mag') mesh = buildMagMesh();
        else if (type === 'grenade') mesh = buildGrenadeMesh(0.8);
        else mesh = buildMedkitMesh();
        mesh.position.set(p.x + dx, 1, p.z + dz);
        scene.add(mesh);
        drops.push({ mesh, type, timer: 1e9 });
    };
    put('mag', 23, 3); put('mag', 24, 3, 8); put('mag', 26, 4, 0, 6);
    put('grenade', 27, 3); put('grenade', 27, 4, 0, 8);
    put('medkit', 23, 5); put('medkit', 25, 5, 6, 0);
    put('medkit', 9, 15, 0, 6);    // toilet
    put('mag', 20, 18);            // area pemuatan
}

export const stage1Scene = {
    id: 'campaign-1',

    // Masuk stage 1 = mulai campaign (start pertama ATAU restart setelah mati).
    // Array zombies/drops selalu sudah bersih di titik ini, jadi penempatan
    // ulang aman. Kedua dunia dibangun sekali (guard `built`).
    enter() {
        if (!built) {
            built = true;
            buildStage2World();   // STAGE 2: jalan raya + air mancur + median + mobil
            buildWorld();         // STAGE 1: gedung terbengkalai (jauh dari jalan raya)
        }
        placeStage2Zombies();     // zombie statis jalan raya (stage 2)
        placeZombies();           // zombie gedung sesuai denah (stage 1)
        placeSupplies();          // ruang persediaan: ammo/granat/medkit
        applyLightPreset(scene, 'indoor');   // interior gelap + kabut rapat
        const sp = s1Cell(S1_START.c, S1_START.r);
        camera.position.set(sp.x, CFG.player.eyeHeight, sp.z);
        camera.quaternion.set(0, 1, 0, 0);   // yaw 180° — hadap selatan (pintu lobby)
        hideStageMsg();
    },

    // Mati -> ulang dari stage 1 juga (dirinya sendiri)
    restartScene: () => stage1Scene,

    // Dinding grid: geser per-sumbu (menyusur tembok), penghalang furnitur,
    // slide lagi, lalu cek trigger tangga keluar -> transisi ke stage 2.
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(stage1Walk, pos, oldX, oldZ, player.radius);
        // Trigger tangga keluar -> turun ke jalan raya (stage 2)
        if (pos.x >= S1.x0 + S1_EXIT.c0 * S1.CELL
            && pos.x <= S1.x0 + (S1_EXIT.c1 + 1) * S1.CELL
            && pos.z >= S1.z0 + S1_EXIT.r0 * S1.CELL
            && pos.z <= S1.z0 + (S1_EXIT.r1 + 1) * S1.CELL) {
            setScene(stage2Scene, { transition: true });
        }
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Peluru MATI di dinding — mencegah membunuh zombie diam di ruangan lain
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

    zombieAI(z, dt, step) {
        // Indoor: aktivasi butuh LOS grid (atau sangat dekat / tertembak)
        return campaignZombieAI(z, dt, step, { walkable: stage1Walk, resolve, los: s1LOS, nav: s1Nav });
    },

    clampDropPos(x, z) { return [x, z]; },

    hudStatus() { return `FLOOR 3 — Zombies: ${countStageZombies(1)} | Find the exit stairs`; },

    // Landmark gedung: tangga keluar (hijau menyala; dijepit ke tepi saat jauh)
    radarLandmarks(plot) {
        const ex = S1.x0 + (S1_EXIT.c0 + S1_EXIT.c1 + 1) / 2 * S1.CELL;
        const ez = S1.z0 + (S1_EXIT.r0 + S1_EXIT.r1 + 1) / 2 * S1.CELL;
        plot(ex - camera.position.x, ez - camera.position.z, "#2eff6a", 5, true);
    },
};
