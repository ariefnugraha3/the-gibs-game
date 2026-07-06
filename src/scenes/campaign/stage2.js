// SCENE: Campaign STAGE 2 — jalan raya Jakarta yang hancur. Denah: air mancur
// bawah (start) --1 km--> air mancur atas (persimpangan; lengan barat/timur
// diblokir tumpukan mobil) --serong 500 m. Area boleh-jalan = UNION jalan +
// cincin air mancur (highwayWalk); gedung membentuk dinding koridor
// (dekoratif — dinding kerasnya union itu). Menang = semua zombie stage 2 mati.

import { CFG, CAMP_M } from '../../core/config.js';
import { player, zombies, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { makeTexture, speckle, makeNormalMap, noiseHeight } from '../../utils/textures.js';
import { rand } from '../../utils/math.js';
import { slideWalk, resolveBlockers, blockersGroundHeight } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { waterJets, setWaterTex } from '../../world/decor.js';
import { applyLightPreset } from '../../world/lighting.js';
import {
    CITY_PALETTE, makeFacadeTex, makeLitTex, makeCityMat, makeBurningCityMat,
    fillBuildingInstances, addFireSprites
} from '../../world/facades.js';
import { showStageMsg } from '../../core/dom.js';
import { updateUI } from '../../core/hud.js';
import { disposeZombie } from '../../entities/zombies.js';
import { NADE_R } from '../../entities/grenades.js';
import { setScene } from '../../core/sceneManager.js';
import { spawnCampaignZombie, campaignZombieAI, countStageZombies } from './common.js';
import { stage1Scene } from './stage1.js';
import { stage3Scene } from './stage3.js';

// Tata letak jalan raya. Skala 1 m ≈ 7 unit (CAMP_M).
export const CAMP = {
    halfRoad: 9 * CAMP_M,     // aspal lebar 18 m
    halfWalk: 11 * CAMP_M,    // + trotoar 2 m kiri & kanan (koridor total 22 m)
    medianHalf: 1.5 * CAMP_M, // pembatas tengah lebar 3 m (kuning di denah)
    medianH: 4.5,             // ~0.65 m — BISA dilompati (puncak lompat player 7.8)
    // Air mancur bawah d=100 m & atas d=50 m (cyan); ring = trotoar keliling.
    // Jarak jalan antar bak = 1 km -> pusat atas = -(1000 + 50 + 25) m.
    low: { x: 0, z: 0, r: 50 * CAMP_M, ring: 12 * CAMP_M, topY: 10 },
    up: { x: 0, z: -(1000 + 50 + 25) * CAMP_M, r: 25 * CAMP_M, ring: 10 * CAMP_M, topY: 10 },
    armLen: 500 * CAMP_M,     // lengan barat/timur (diblokir mobil rongsok — dekorasi)
    diagLen: 500 * CAMP_M,    // jalan serong kanan-atas 500 m
    diagAng: Math.PI * 40 / 180,
};
// Arah jalan serong (dari pusat air mancur atas, menyerong kanan-atas) + tegak lurusnya
export const CAMP_DIR = { x: Math.sin(CAMP.diagAng), z: -Math.cos(CAMP.diagAng) };
export const CAMP_PERP = { x: -CAMP_DIR.z, z: CAMP_DIR.x };
// Titik masuk STAGE 2 (dari tangga gedung): koridor tepat utara cincin air
// mancur bawah, menghadap -z (1 km jalan terbentang menuju air mancur atas).
export const CAMP_START = { x: 0, z: -(CAMP.low.r + CAMP.low.ring + 30) };

const blockers = [];      // balok pejal stage 2: median jalan + blokade mobil
const wreckPiles = [];    // titik blokade mobil (radar)
let navGrid = null;       // nav-grid pathfinder zombie (dibangun di buildWorld)

// Titik (x,z) dgn radius r masih di dalam area jalan/trotoar?
export function highwayWalk(x, z, r) {
    const w = CAMP.halfWalk - r;
    // jalan utara-selatan antar air mancur
    if (Math.abs(x) <= w && z >= CAMP.up.z && z <= CAMP.low.z) return true;
    // lengan barat/timur (di balik blokade mobil; tetap walkable utk fisika granat)
    if (Math.abs(z - CAMP.up.z) <= w && Math.abs(x) <= CAMP.up.r + CAMP.armLen) return true;
    // cincin trotoar keliling air mancur (bak pejalnya ditangani resolve)
    if (Math.hypot(x - CAMP.low.x, z - CAMP.low.z) <= CAMP.low.r + CAMP.low.ring - r) return true;
    if (Math.hypot(x - CAMP.up.x, z - CAMP.up.z) <= CAMP.up.r + CAMP.up.ring - r) return true;
    // jalan serong dari air mancur atas (bingkai lokal: u sepanjang, v melintang)
    const dx = x - CAMP.up.x, dz = z - CAMP.up.z;
    const u = dx * CAMP_DIR.x + dz * CAMP_DIR.z;
    const v = dx * CAMP_PERP.x + dz * CAMP_PERP.z;
    return u >= 0 && u <= CAMP.up.r + CAMP.diagLen && Math.abs(v) <= w;
}

// Penghalang pejal stage 2: dinding bak air mancur (silinder) + balok
// median/mobil. Murni horizontal; dilewati bila kaki di atas puncaknya.
export function resolve(pos, radius, feetY) {
    for (const f of [CAMP.low, CAMP.up]) {
        if (feetY >= f.topY - 0.4) continue;
        const dx = pos.x - f.x, dz = pos.z - f.z;
        const minD = f.r + radius, d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = f.x + dx / d * minD;
            pos.z = f.z + dz / d * minD;
        }
    }
    return resolveBlockers(pos, radius, feetY, blockers);
}

export function buildWorld() {
    // --- Tanah dasar kota (gelap, di bawah semua jalan) ---
    const baseTex = makeTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#17150f'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#0e0d0a', '#211d14', '#2a241a', '#0a0908'], 260, 2, 9);
    }, 90, 90);
    const base = new THREE.Mesh(
        new THREE.PlaneGeometry(22000, 22000),
        new THREE.MeshPhongMaterial({ map: baseTex, shininess: 4, specular: 0x0c0b09 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(800, -0.5, -3700);
    base.receiveShadow = true;
    scene.add(base);

    // --- Aspal + trotoar (tekstur dibagi semua ruas) ---
    const asphaltNrm = makeNormalMap(128, 128, (g, w, h) => {
        noiseHeight(128, 34, 420, 1, 4)(g, w, h);
        g.strokeStyle = 'rgb(70,70,70)';
        for (let i = 0; i < 5; i++) {
            g.lineWidth = 1 + Math.random();
            let x = Math.random() * w, y = Math.random() * h;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += rand(-16, 16); y += rand(-16, 16); g.lineTo(x, y); }
            g.stroke();
        }
    }, 1.6);
    // Marka lajur di kiri-kanan (tengah jalan ditempati median), memanjang sumbu v
    const mkAsphaltTex = (repY) => makeTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#26262a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#1e1e22', '#2e2e33', '#232327', '#333338'], 300, 1, 5);
        for (let i = 0; i < 6; i++) {
            g.globalAlpha = 0.12 + Math.random() * 0.12;
            g.fillStyle = '#0c0c0e';
            g.beginPath();
            g.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 22, 5 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(10,10,12,0.65)';
        for (let i = 0; i < 5; i++) {
            g.lineWidth = 0.8 + Math.random();
            let x = Math.random() * w, y = Math.random() * h;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += rand(-18, 18); y += rand(-18, 18); g.lineTo(x, y); }
            g.stroke();
        }
        g.fillStyle = 'rgba(206,200,180,0.55)';
        for (const lx of [0.27, 0.73]) {
            for (let y = 0; y < h; y += 64) g.fillRect(w * lx - 2, y, 4, 34);
        }
    }, 1, repY);
    const roadMat = (len) => new THREE.MeshPhongMaterial({
        map: mkAsphaltTex(len / 200), normalMap: asphaltNrm, shininess: 6, specular: 0x101014
    });
    const walkTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#4c4a44'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#44423c', '#55534c', '#3c3a35'], 200, 1, 4);
        g.strokeStyle = 'rgba(30,29,26,0.5)'; g.lineWidth = 2;
        for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }, 1, 40);
    const walkMat = new THREE.MeshPhongMaterial({ map: walkTex, shininess: 5, specular: 0x121110 });

    // Satu ruas jalan: aspal (plane) + trotoar kiri/kanan (box tipis), di dalam
    // Group yang diputar yaw — dipakai ruas vertikal, lengan, dan serong.
    const sideW = CAMP.halfWalk - CAMP.halfRoad;   // lebar trotoar (2 m)
    // roadY sedikit berbeda tiap ruas: ruas-ruas bertumpuk di bawah bak air
    // mancur (terlihat samar lewat air transparan) — hindari z-fighting.
    const mkRoad = (cx, cz, yaw, len, walkFrom, walkTo, roadY) => {
        const grp = new THREE.Group();
        grp.position.set(cx, 0, cz);
        grp.rotation.y = yaw;
        const road = new THREE.Mesh(new THREE.PlaneGeometry(CAMP.halfRoad * 2, len), roadMat(len));
        road.rotation.x = -Math.PI / 2;
        road.position.y = roadY;
        road.receiveShadow = true;
        grp.add(road);
        // trotoar: hanya pada rentang walkFrom..walkTo (lokal, agar tak menembus bak)
        const wLen = walkTo - walkFrom, wMid = (walkFrom + walkTo) / 2;
        for (const s of [-1, 1]) {
            const walk = new THREE.Mesh(new THREE.BoxGeometry(sideW, 1.0, wLen), walkMat);
            walk.position.set(s * (CAMP.halfRoad + sideW / 2), 0.5, wMid);
            walk.receiveShadow = true;
            grp.add(walk);
        }
        scene.add(grp);
    };
    const L = CAMP.low, U = CAMP.up;
    // Ruas utara-selatan: dari z = U.z - U.r (bawah bak atas) ke z = L.z + L.r
    const vLen = (L.z - U.z) + L.r + U.r;
    mkRoad(0, (L.z + L.r + U.z - U.r) / 2, 0, vLen,
        -vLen / 2 + (U.r * 2 + U.ring + 4),      // trotoar mulai setelah cincin bak atas
        vLen / 2 - (L.r * 2 + L.ring + 4), 0.02); // ...berakhir sebelum cincin bak bawah
    // Lengan barat/timur: dua strip dari tepi bak atas keluar (yaw dibalik agar
    // ujung dekat bak selalu di sisi -z lokal -> rentang trotoar simetris)
    const aLen = CAMP.armLen + 20;
    for (const s of [-1, 1]) {
        mkRoad(s * (U.r - 20 + aLen / 2), U.z, s * Math.PI / 2, aLen,
            -aLen / 2 + (U.ring + 24), aLen / 2 - 6, 0.013);
    }
    // Ruas serong kanan-atas dari bak atas (yaw: sumbu panjang lokal -> CAMP_DIR)
    const dLen = CAMP.diagLen + 20;
    const dMid = U.r - 20 + dLen / 2;
    mkRoad(U.x + CAMP_DIR.x * dMid, U.z + CAMP_DIR.z * dMid, Math.PI - CAMP.diagAng, dLen,
        -dLen / 2 + (U.ring + 24), dLen / 2 - 6, 0.028);

    // --- Median jalan (kuning di denah): balok putus-putus, bisa dilompati/dipijak ---
    const dashLen = 15 * CAMP_M, dashGap = 5 * CAMP_M, stepLen = dashLen + dashGap;
    const medianList = [];
    // run: dari titik (sx,sz) sepanjang arah (dx,dz) dari jarak a ke b
    const addMedianRun = (sx, sz, dx, dz, a, b, yaw) => {
        const axx = dz, axz = -dx;   // basis lokal: az = arah jalan, ax = melintang
        for (let t = a; t + dashLen <= b; t += stepLen) {
            const cx = sx + dx * (t + dashLen / 2), cz = sz + dz * (t + dashLen / 2);
            medianList.push({ x: cx, z: cz, yaw });
            blockers.push({
                x: cx, z: cz, hx: CAMP.medianHalf, hz: dashLen / 2,
                axx, axz, azx: dx, azz: dz,
                rad: Math.hypot(CAMP.medianHalf, dashLen / 2),
                top: CAMP.medianH, standable: true
            });
        }
    };
    addMedianRun(0, L.z - L.r - L.ring, 0, -1, 30, (L.z - L.r - L.ring) - (U.z + U.r + U.ring) - 30, 0);
    addMedianRun(U.r + U.ring, U.z, 1, 0, 30, CAMP.armLen - U.ring - 30, Math.PI / 2);
    addMedianRun(-(U.r + U.ring), U.z, -1, 0, 30, CAMP.armLen - U.ring - 30, Math.PI / 2);
    addMedianRun(U.x + CAMP_DIR.x * (U.r + U.ring), U.z + CAMP_DIR.z * (U.r + U.ring),
        CAMP_DIR.x, CAMP_DIR.z, 30, CAMP.diagLen - U.ring - 30, Math.PI - CAMP.diagAng);
    const medianMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(CAMP.medianHalf * 2, CAMP.medianH, dashLen),
        new THREE.MeshLambertMaterial({ color: 0xffffff }), medianList.length);
    {
        const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(),
            _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
        const upAxis = new THREE.Vector3(0, 1, 0);
        medianList.forEach((d, i) => {
            _q.setFromAxisAngle(upAxis, d.yaw);
            _m.compose(_p.set(d.x, CAMP.medianH / 2, d.z), _q, _s);
            medianMesh.setMatrixAt(i, _m);
            // beton dicat kuning kusam, tiap segmen sedikit beda
            medianMesh.setColorAt(i, _c.setHex(0xb99b32).offsetHSL(0, rand(-0.06, 0.04), rand(-0.06, 0.04)));
        });
        if (medianMesh.instanceColor) medianMesh.instanceColor.needsUpdate = true;
    }
    medianMesh.castShadow = true;
    medianMesh.receiveShadow = true;
    medianMesh.frustumCulled = false;   // bounds instance tak dihitung r128
    scene.add(medianMesh);

    // --- Air mancur (cyan di denah): cincin paving + dinding bak + air + semburan ---
    const stoneMat = new THREE.MeshPhongMaterial({ color: 0x6f6a5e, shininess: 10, specular: 0x1a1815 });
    const waterTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#27506b'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
            g.strokeStyle = `rgba(159,198,224,${0.08 + Math.random() * 0.14})`;
            g.lineWidth = 1 + Math.random() * 2;
            const y = Math.random() * h;
            g.beginPath(); g.moveTo(0, y);
            g.bezierCurveTo(w * 0.33, y + rand(-6, 6), w * 0.66, y + rand(-6, 6), w, y);
            g.stroke();
        }
    }, 8, 8);
    setWaterTex(waterTex);
    const waterMat = new THREE.MeshPhongMaterial({
        map: waterTex, shininess: 150, specular: 0xbfe2f5, transparent: true, opacity: 0.9
    });
    const pavTex = makeTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#8a7a4a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#7d6f43', '#968551', '#6f6340', '#a08e57'], 240, 2, 6);
        g.strokeStyle = 'rgba(52,45,26,0.55)'; g.lineWidth = 2;
        for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    }, 20, 20);
    const pavMat = new THREE.MeshPhongMaterial({ map: pavTex, shininess: 8, specular: 0x14120c });
    const mkFountain = (f, nJet) => {
        const ringPav = new THREE.Mesh(new THREE.RingGeometry(f.r - 8, f.r + f.ring, 72), pavMat);
        ringPav.rotation.x = -Math.PI / 2;
        ringPav.position.set(f.x, 0.04, f.z);
        ringPav.receiveShadow = true;
        scene.add(ringPav);
        const wall = new THREE.Mesh(
            new THREE.CylinderGeometry(f.r + 4, f.r + 6, f.topY, 72, 1, true),
            new THREE.MeshPhongMaterial({ color: 0x6f6a5e, shininess: 10, specular: 0x1a1815, side: THREE.DoubleSide }));
        wall.position.set(f.x, f.topY / 2, f.z);
        wall.castShadow = true; wall.receiveShadow = true;
        scene.add(wall);
        const lip = new THREE.Mesh(new THREE.RingGeometry(f.r - 2, f.r + 6, 72), stoneMat);
        lip.rotation.x = -Math.PI / 2;
        lip.position.set(f.x, f.topY + 0.02, f.z);
        scene.add(lip);
        const water = new THREE.Mesh(new THREE.CircleGeometry(f.r + 2, 72), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set(f.x, f.topY - 3, f.z);
        scene.add(water);
        // menara pusat bertingkat + semburan berdenyut (ikut pool waterJets)
        const tiers = [[f.r * 0.32, 4], [f.r * 0.2, 7], [f.r * 0.08, f.topY + 16]];
        let ty = f.topY - 3;
        for (const [tr, th] of tiers) {
            const t = new THREE.Mesh(new THREE.CylinderGeometry(tr * 0.85, tr, th, 24), stoneMat);
            t.position.set(f.x, ty + th / 2, f.z);
            t.castShadow = true;
            scene.add(t);
            ty += th;
        }
        for (let i = 0; i < nJet; i++) {
            const jet = new THREE.Mesh(
                new THREE.ConeGeometry(4 - i * 0.8, 26 - i * 5, 10),
                new THREE.MeshPhongMaterial({
                    color: 0x9fd2ee, transparent: true, opacity: 0.5 - i * 0.1,
                    shininess: 120, specular: 0xffffff, depthWrite: false
                }));
            jet.position.set(f.x + (i - (nJet - 1) / 2) * f.r * 0.3, ty + 6 - i * 2, f.z + (i - 1) * f.r * 0.12);
            scene.add(jet);
            waterJets.push(jet);
        }
    };
    mkFountain(L, 3);
    mkFountain(U, 2);

    // --- Blokade mobil rongsok (merah di denah): kiri & kanan bak atas ---
    const carGeo = new THREE.BoxGeometry(1, 1, 1);
    const carMats = [0x7a3226, 0x2e4a63, 0x5a5a5e, 0x8a7a2a, 0x4a3a30].map(c =>
        new THREE.MeshLambertMaterial({ color: new THREE.Color(c).offsetHSL(0, -0.1, -0.05) }));
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a222a });
    const mkCar = (x, y, z, yaw, tilt) => {
        const car = new THREE.Group();
        const bodyMat = carMats[(Math.random() * carMats.length) | 0];
        const body = new THREE.Mesh(carGeo, bodyMat);
        body.scale.set(13, 8, 30);   // mobil ~1.9 x 1.1 x 4.3 m
        body.position.y = 4;
        body.castShadow = true;
        car.add(body);
        const cabin = new THREE.Mesh(carGeo, Math.random() < 0.5 ? glassMat : bodyMat);
        cabin.scale.set(11, 6, 15);
        cabin.position.set(0, 9, rand(-3, 1));
        cabin.castShadow = true;
        car.add(cabin);
        car.position.set(x, y, z);
        car.rotation.set(rand(-0.06, 0.06) + tilt, yaw, rand(-0.08, 0.08));
        scene.add(car);
    };
    for (const side of [-1, 1]) {
        const px = side * (U.r + 58), pz = U.z;
        wreckPiles.push({ x: px, z: pz });
        // dua lapis mobil melintang menutup koridor
        for (let zi = -66; zi <= 66; zi += 33) {
            mkCar(px + rand(-16, 16), 0, pz + zi + rand(-5, 5), Math.PI / 2 + rand(-0.5, 0.5), 0);
        }
        for (let zi = -45; zi <= 45; zi += 45) {
            mkCar(px + rand(-10, 10), 8 + rand(0, 2), pz + zi + rand(-8, 8), rand(0, 6.28), rand(-0.2, 0.2));
        }
        blockers.push({
            x: px, z: pz, hx: 40, hz: CAMP.halfWalk,
            axx: 1, axz: 0, azx: 0, azz: 1,
            rad: Math.hypot(40, CAMP.halfWalk),
            top: 34, standable: false   // terlalu tinggi utk dilompati
        });
    }

    createCampaignBuildings();

    // Nav-grid pathfinder: koridor gameplay saja (jalan utama + kedua cincin
    // air mancur + serong). Lengan barat/timur di balik blokade TIDAK dipetakan
    // (di luar grid = fallback kejar lurus; tak ada zombie di sana). Median
    // putus-putus & mobil rongsok di-bake lewat resolve: sel yang tergeser =
    // penghalang, jadi path lewat CELAH antar median, bukan menabraknya.
    const nx0 = -(CAMP.low.r + CAMP.low.ring + 40);
    const nx1 = CAMP.up.x + CAMP_DIR.x * (CAMP.up.r + CAMP.diagLen) + CAMP.halfWalk + 40;
    const nz0 = CAMP.up.z + CAMP_DIR.z * (CAMP.up.r + CAMP.diagLen) - CAMP.halfWalk - 40;
    const nz1 = CAMP.low.z + CAMP.low.r + CAMP.low.ring + 40;
    const cell = 14;   // 2 m — cukup halus utk celah median 5 m
    navGrid = makeNavGrid(nx0, nz0, cell,
        Math.ceil((nx1 - nx0) / cell), Math.ceil((nz1 - nz0) / cell),
        (x, z) => {
            if (!highwayWalk(x, z, 3.5)) return false;
            _v3.set(x, 0, z);
            resolve(_v3, 3.5, 0);
            return Math.abs(_v3.x - x) + Math.abs(_v3.z - z) < 0.01;
        });
}

// Lingkaran (x,z,rad) bebas dari semua koridor jalan & cincin air mancur?
// Dipakai penempatan gedung agar tidak menutupi jalan lain di dekat simpang.
function campClearOfRoads(x, z, rad) {
    const m = CAMP.halfWalk + rad;
    if (Math.abs(x) < m && z < CAMP.low.z + rad && z > CAMP.up.z - rad) return false;
    if (Math.abs(z - CAMP.up.z) < m && Math.abs(x) < CAMP.up.r + CAMP.armLen + rad) return false;
    if (Math.hypot(x - CAMP.low.x, z - CAMP.low.z) < CAMP.low.r + CAMP.low.ring + rad) return false;
    if (Math.hypot(x - CAMP.up.x, z - CAMP.up.z) < CAMP.up.r + CAMP.up.ring + rad) return false;
    const dx = x - CAMP.up.x, dz = z - CAMP.up.z;
    const u = dx * CAMP_DIR.x + dz * CAMP_DIR.z;
    const v = dx * CAMP_PERP.x + dz * CAMP_PERP.z;
    return !(u > -rad && u < CAMP.up.r + CAMP.diagLen + rad && Math.abs(v) < m);
}

// Deret gedung menempel di tepi trotoar sepanjang tiap ruas (gaya Jakarta:
// campuran ruko rendah & menara tinggi). Dekoratif; dinding kerasnya adalah
// clamp highwayWalk, jadi gedung tak butuh collision sendiri. Resep fasad
// bersama dari world/facades.js (sama dgn kota survival).
function createCampaignBuildings() {
    const facadeTex = makeFacadeTex();
    const litTex = makeLitTex();

    // Ruas: titik awal + arah + panjang + yaw gedung (muka menghadap jalan)
    const L = CAMP.low, U = CAMP.up;
    const vStart = -(L.r + L.ring + 30);
    const SEGS = [
        { sx: 0, sz: vStart, dx: 0, dz: -1, len: -vStart - (-(U.z + U.r + U.ring + 30)), ry: Math.PI / 2 },
        { sx: U.r + U.ring + 30, sz: U.z, dx: 1, dz: 0, len: CAMP.armLen - U.ring - 60, ry: 0 },
        { sx: -(U.r + U.ring + 30), sz: U.z, dx: -1, dz: 0, len: CAMP.armLen - U.ring - 60, ry: 0 },
        {
            sx: U.x + CAMP_DIR.x * (U.r + U.ring + 30), sz: U.z + CAMP_DIR.z * (U.r + U.ring + 30),
            dx: CAMP_DIR.x, dz: CAMP_DIR.z, len: CAMP.diagLen - U.ring - 60, ry: Math.PI / 2 - CAMP.diagAng
        },
    ];
    const normal = [], burn = [];
    for (const seg of SEGS) {
        const px = -seg.dz, pz = seg.dx;   // tegak lurus ruas
        for (const side of [-1, 1]) {
            let t = 0;
            while (t < seg.len) {
                const w = rand(90, 200);            // muka gedung sepanjang jalan
                if (t + w > seg.len) break;
                const d = rand(90, 180);
                const off = CAMP.halfWalk + d / 2 + 2;
                const cx = seg.sx + seg.dx * (t + w / 2) + px * side * off;
                const cz = seg.sz + seg.dz * (t + w / 2) + pz * side * off;
                t += w + rand(8, 40);
                // dekat simpang: jangan menutupi koridor jalan lain
                if (!campClearOfRoads(cx, cz, Math.hypot(w, d) / 2)) continue;
                const h = Math.random() < 0.55 ? rand(50, 130) : rand(200, 650);   // ruko vs menara
                const b = {
                    x: cx, z: cz, w, d, h, ry: seg.ry,
                    rz: Math.random() < 0.12 ? (Math.random() - 0.5) * 0.1 : 0,   // sebagian doyong (rusak)
                    color: CITY_PALETTE[(Math.random() * CITY_PALETTE.length) | 0]
                };
                (Math.random() < 0.06 ? burn : normal).push(b);
            }
        }
    }

    fillBuildingInstances(scene, normal, makeCityMat(facadeTex, litTex));
    fillBuildingInstances(scene, burn, makeBurningCityMat(facadeTex));   // berkedip via decor.js
    addFireSprites(scene, burn);
}

// Sebar zombie di area yang bisa dilalui: mayoritas di jalan 1 km, sebagian
// di jalan serong & cincin air mancur. Kepadatan dijaga longgar (rata-rata
// ~1 per 25-35 m jalan, min. jarak antar zombie 42 unit ≈ 6 m, dan tidak
// ada yang lahir dekat titik spawn player).
export function placeZombies() {
    const L = CAMP.low, U = CAMP.up;
    // Zona bersih di sekitar AIR MANCUR START (bawah): tak ada zombie di dalam
    // radius ini dari pusat bak bawah — player baru bertemu zombie setelah
    // benar-benar melangkah ke jalan raya (bukan di area start / cincin bawah).
    const START_CLEAR = L.r + L.ring + 200;   // ~90 m dari pusat bak start
    const pts = [];
    const put = (x, z) => {
        _v3.set(x, 0, z);
        resolve(_v3, 4, 0);   // geser keluar bila kebetulan di median/mobil
        x = _v3.x; z = _v3.z;
        if (!highwayWalk(x, z, 4)) return false;
        if (Math.hypot(x - L.x, z - L.z) < START_CLEAR) return false;              // area titik-masuk stage 2
        if (Math.hypot(x - CAMP_START.x, z - CAMP_START.z) < 220) return false;    // dekat titik-masuk player
        for (let i = 0; i < pts.length; i++)
            if (Math.hypot(x - pts[i].x, z - pts[i].z) < 42) return false;
        pts.push({ x, z });
        spawnCampaignZombie(x, z, 2);
        return true;
    };
    let placed = 0, tries = 0;
    while (placed < 34 && tries++ < 600) {   // jalan utama antar air mancur (mulai setelah zona start)
        const side = Math.random() < 0.5 ? -1 : 1;
        if (put(side * rand(16, CAMP.halfWalk - 8), rand(U.z + 320, -START_CLEAR))) placed++;
    }
    placed = 0; tries = 0;
    while (placed < 12 && tries++ < 250) {   // jalan serong
        const u = rand(U.r + U.ring + 60, U.r + CAMP.diagLen - 60);
        const v = (Math.random() < 0.5 ? -1 : 1) * rand(16, CAMP.halfWalk - 8);
        if (put(U.x + CAMP_DIR.x * u + CAMP_PERP.x * v, U.z + CAMP_DIR.z * u + CAMP_PERP.z * v)) placed++;
    }
    // Cincin air mancur ATAS saja (bak bawah = area start, sengaja dikosongkan)
    placed = 0; tries = 0;
    while (placed < 6 && tries++ < 80) {
        const a = Math.random() * 6.283, d = U.r + rand(14, U.ring - 8);
        if (put(U.x + Math.cos(a) * d, U.z + Math.sin(a) * d)) placed++;
    }
}

// --- Boss stage 2: muncul saat sisa zombie <= CFG.campaign.boss.spawnWhenRemaining ---
let bossSpawned = false;
let bossRef = null;      // objek zombie boss (utk HP bar HUD); null setelah mati
let bossUiT = 0;         // throttle refresh HUD bar boss (updateUI event-driven)

function spawnBoss() {
    bossSpawned = true;
    // Lahir di jalan dekat air mancur atas (di luar bak — resolve aman)
    spawnCampaignZombie(0, CAMP.up.z + CAMP.up.r + CAMP.up.ring + 60, 2, 'boss');
    bossRef = zombies[zombies.length - 1];
    showStageMsg('SOMETHING BIG IS COMING...');
    updateUI();
}

export const stage2Scene = {
    id: 'campaign-2',

    // Masuk dari tangga keluar gedung (transisi stage 1 -> 2). Zombie gedung
    // yang tersisa dibersihkan diam-diam (tanpa skor/drop) supaya hitungan UI
    // & kondisi menang stage 2 tetap sederhana.
    enter() {
        for (let i = zombies.length - 1; i >= 0; i--) {
            if (zombies[i].stage === 1) {
                disposeZombie(zombies[i]);
                scene.remove(zombies[i].mesh);
                zombies.splice(i, 1);
            }
        }
        bossSpawned = false; bossRef = null; bossUiT = 0;
        applyLightPreset(scene, 'outdoor');
        camera.position.set(CAMP_START.x, CFG.player.eyeHeight, CAMP_START.z);
        camera.quaternion.set(0, 0, 0, 1);   // hadap utara (koridor 1 km)
        player.vy = 0; player.onGround = true;
        showStageMsg('FLOOR 3 CLEARED — FOLLOW THE HIGHWAY TO THE FOUNTAIN');
        updateUI();
    },

    // Mati di stage 2 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,

    // HP bar boss di HUD berubah tiap peluru — updateUI() event-driven tidak
    // menangkap hit yang tak membunuh, jadi di-refresh berkala selama boss hidup.
    updateMode(dt) {
        if (!bossRef) return;
        if (zombies.indexOf(bossRef) === -1) { bossRef = null; updateUI(); return; }
        bossUiT -= dt;
        if (bossUiT <= 0) { bossUiT = 0.2; updateUI(); }
    },

    // Dinding keras tepi jalan: geser per-sumbu agar player MELUNCUR menyusuri
    // tembok; lalu penghalang pejal (bak/median/mobil); lalu slide lagi
    // (jaring pengaman bila dorongan menaruh player ke dinding).
    playerCollide(pos, oldX, oldZ, feetY) {
        slideWalk(highwayWalk, pos, oldX, oldZ, player.radius);
        resolve(pos, player.radius, feetY);
        slideWalk(highwayWalk, pos, oldX, oldZ, player.radius);
    },

    groundHeight(x, z, feetY) { return blockersGroundHeight(x, z, feetY, blockers); },

    // Stage 2: peluru menembus gedung dekoratif (tak ada interior), habis oleh umur
    bulletBlocked() { return false; },

    grenadeCollide(g, oldGX, oldGZ) {
        // Pantulan tepi area jalan + penghalang pejal
        if (!highwayWalk(g.mesh.position.x, g.mesh.position.z, NADE_R)) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolve(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
    },

    zombieAI(z, dt, step) {
        // Aktivasi murni jarak (tanpa LOS — jalan terbuka)
        return campaignZombieAI(z, dt, step, { walkable: highwayWalk, resolve, nav: navGrid });
    },

    clampDropPos(x, z) { return [x, z]; },   // zombie mati di jalan — pakai apa adanya

    hudStatus() {
        let s = `Zombies left: ${countStageZombies(2)}`;
        if (bossRef && zombies.indexOf(bossRef) !== -1) {
            const frac = Math.max(0, bossRef.hp / bossRef.maxHp);
            const blocks = Math.ceil(frac * 10);
            s += ` — BOSS ${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)}`;
        }
        return s;
    },

    // Landmark jalan raya: air mancur (cyan, dijepit ke tepi saat jauh —
    // penunjuk arah tujuan) + blokade mobil (merah, hanya saat dekat)
    radarLandmarks(plot) {
        for (const f of [CAMP.low, CAMP.up])
            plot(f.x - camera.position.x, f.z - camera.position.z, "#00e5ff", 5, true);
        for (const wpile of wreckPiles)
            plot(wpile.x - camera.position.x, wpile.z - camera.position.z, "#ff2d2d", 4);
    },

    // Boss muncul saat sisa zombie menipis (JUGA saat lompat langsung ke 0,
    // mis. granat membunuh 5 terakhir sekaligus — menang tanpa boss dilarang).
    // Semua bersih SETELAH boss spawn -> lanjut ke stage 3 (Taman Monas malam).
    checkWin() {
        const n = countStageZombies(2);
        if (!bossSpawned && n <= CFG.campaign.boss.spawnWhenRemaining) { spawnBoss(); return; }
        if (bossSpawned && n === 0) setScene(stage3Scene, { transition: true });
    },
};
