// Dunia Survival: Taman Monas — tanah/rumput, Jalan Medan Merdeka, pelataran +
// Jalan Silang, pagar beton keliling (batas keras player), properti taman
// (air mancur pejal + kolam + pohon pejal), Monas, dan kota latar (instanced).

import { scene } from '../../core/renderer.js';
import { makeTexture, speckle, makeNormalMap, noiseHeight } from '../../utils/textures.js';
import { rand, clamp } from '../../utils/math.js';
import { resolveCylinders } from '../../utils/collision.js';
import { makeNavGrid } from '../../utils/pathfind.js';
import { waterJets, setWaterTex, setFlameLight, setFlameGlow } from '../../world/decor.js';
import {
    CITY_PALETTE, makeFacadeTex, makeLitTex, makeCityMat, makeBurningCityMat,
    fillBuildingInstances, addFireSprites
} from '../../world/facades.js';

// ----------- Tata letak arena (mengikuti Taman Monas) ----------- //
// Area dalam (rumput) = [-PARK.hx..PARK.hx] x [-PARK.hz..PARK.hz].
// Pagar tepat di tepi area; di luarnya Jalan Medan Merdeka, lalu kota.
export const PARK = { hx: 620, hz: 340 };   // setengah ukuran taman (di dalam pagar)
export const FENCE_H = 16;                  // tinggi pagar keliling
export const ROAD_W = 90;                   // lebar Jalan Medan Merdeka (di luar pagar)
// Penghalang pejal di taman: bak air mancur (bisa dinaiki dari atas) & pohon
export const FOUNTAIN = { x: -620 * 0.55, z: 0, r: 47, topY: 3.2 };   // x = -PARK.hx*0.55
export const treeColliders = [];            // silinder tabrakan batang pohon {x,z,r}

export function buildSurvivalWorld() {
    createGround();      // tanah, rumput taman, Jalan Medan Merdeka
    createParkRoads();   // pelataran tengah + Jalan Silang Monas (diagonal)
    createFence();       // pagar keliling (tembok batas player)
    createParkProps();   // air mancur, kolam, pohon
    createMonas();
    createCity();
}

function createMonas() {
    const monas = new THREE.Group();
    // Marmer bergaris halus untuk obelisk & pelataran
    const marbleTex = makeTexture(128, 256, (g, w, h) => {
        g.fillStyle = '#cfc9bd'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) {
            g.strokeStyle = `rgba(${150 + Math.random() * 60 | 0},${145 + Math.random() * 55 | 0},${135 + Math.random() * 50 | 0},${0.25 + Math.random() * 0.3})`;
            g.lineWidth = 1 + Math.random() * 2;
            const x = Math.random() * w;
            g.beginPath(); g.moveTo(x, 0);
            g.bezierCurveTo(x + rand(-8, 8), h * 0.33, x + rand(-8, 8), h * 0.66, x + rand(-10, 10), h);
            g.stroke();
        }
    }, 2, 2);
    // Relief halus marmer via normal map (heightmap garis vertikal + noise)
    const marbleNrm = makeNormalMap(128, 256, (g, w, h) => {
        g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
            const v = 110 + Math.random() * 40 | 0;
            g.strokeStyle = `rgb(${v},${v},${v})`;
            g.lineWidth = 1 + Math.random() * 2.5;
            const x = Math.random() * w;
            g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rand(-10, 10), h); g.stroke();
        }
        noiseHeight(128, 26, 160, 1, 4)(g, w, h);
    }, 1.1);
    const marble = new THREE.MeshPhongMaterial({ map: marbleTex, normalMap: marbleNrm, shininess: 18, specular: 0x2f2b26 });
    const stone = new THREE.MeshPhongMaterial({ color: 0x8f8a80, shininess: 8, specular: 0x1c1a17 });

    const add = (geo, mat, y, extra) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y;
        m.castShadow = true; m.receiveShadow = true;
        if (extra) extra(m);
        monas.add(m);
    };
    add(new THREE.BoxGeometry(44, 2, 44), stone, 1);                                                      // undakan bawah
    add(new THREE.BoxGeometry(40, 3, 40), stone, 3.5);                                                    // teras
    add(new THREE.BoxGeometry(30, 3, 30), marble, 6.5);                                                   // pelataran atas
    add(new THREE.CylinderGeometry(5.6, 7.4, 6, 4, 1), marble, 11, m => m.rotation.y = Math.PI / 4);      // kaki obelisk
    add(new THREE.CylinderGeometry(3.4, 5.6, 50, 4, 1), marble, 39, m => m.rotation.y = Math.PI / 4);     // obelisk meruncing
    add(new THREE.CylinderGeometry(10, 4, 6, 8, 1, false), marble, 66, m => m.rotation.y = Math.PI / 8);  // cawan
    // Lidah api emas: emissive kuat (ditangkap bloom) + cahaya hangat yang menerangi
    // pelataran + sprite glow yang berdenyut (decor.js)
    const flame = new THREE.Mesh(
        new THREE.ConeGeometry(4, 15, 8),
        new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0xffa028, emissiveIntensity: 1.35, shininess: 90, specular: 0xfff2c0 })
    );
    flame.position.y = 76.5;
    monas.add(flame);
    const flameLight = new THREE.PointLight(0xffc36b, 1.1, 420, 2);
    flameLight.position.set(0, 80, 0);
    monas.add(flameLight);
    setFlameLight(flameLight);
    const glowTex = makeTexture(64, 64, (g) => {
        const rg = g.createRadialGradient(32, 32, 2, 32, 32, 31);
        rg.addColorStop(0, 'rgba(255,190,90,0.9)');
        rg.addColorStop(0.4, 'rgba(255,140,40,0.35)');
        rg.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    });
    const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false
    }));
    flameGlow.position.set(0, 78, 0);
    flameGlow.scale.set(30, 30, 1);
    monas.add(flameGlow);
    setFlameGlow(flameGlow);
    scene.add(monas);
}

function createGround() {
    // Tanah dasar luas: aspal/abu kota yang kusam, bertekstur noise
    const baseTex = makeTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#17150f'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#0e0d0a', '#211d14', '#2a241a', '#0a0908'], 260, 2, 9);
    }, 26, 26);
    const base = new THREE.Mesh(
        new THREE.PlaneGeometry(5000, 5000),
        new THREE.MeshPhongMaterial({ map: baseTex, shininess: 4, specular: 0x0c0b09 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.5;
    base.receiveShadow = true;
    scene.add(base);

    // Rumput taman: gumpalan besar lembut (anti-tiling) + goresan helai rumput
    const grassTex = makeTexture(256, 256, (g, w, h) => {
        g.fillStyle = '#2c5f22'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
            const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 60;
            const rg = g.createRadialGradient(x, y, 2, x, y, r);
            const col = Math.random() < 0.5 ? '43,77,27' : '58,110,40';
            rg.addColorStop(0, `rgba(${col},0.35)`);
            rg.addColorStop(1, `rgba(${col},0)`);
            g.fillStyle = rg;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
        const blades = ['#234d1b', '#357029', '#1d3f16', '#3f7a2e', '#2a5a20', '#4a8a36'];
        for (let i = 0; i < 900; i++) {
            g.strokeStyle = blades[(Math.random() * blades.length) | 0];
            g.globalAlpha = 0.3 + Math.random() * 0.45;
            g.lineWidth = 1;
            const x = Math.random() * w, y = Math.random() * h, a = (Math.random() - 0.5) * 0.9;
            g.beginPath(); g.moveTo(x, y);
            g.lineTo(x + Math.sin(a) * 4, y - 3 - Math.random() * 3);
            g.stroke();
        }
        g.globalAlpha = 1;
    }, PARK.hx / 32, PARK.hz / 32);
    const grassNrm = makeNormalMap(128, 128, noiseHeight(128, 46, 700, 1, 4), 1.3);
    const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(PARK.hx * 2, PARK.hz * 2),
        new THREE.MeshPhongMaterial({ map: grassTex, normalMap: grassNrm, shininess: 2, specular: 0x0a0f08 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);

    // Jalan Medan Merdeka: aspal retak + noda oli + marka putus-putus + relief normal map
    const asphaltNrm = makeNormalMap(128, 128, (g, w, h) => {
        noiseHeight(128, 34, 420, 1, 4)(g, w, h);
        g.strokeStyle = 'rgb(70,70,70)';   // retakan = alur dalam
        for (let i = 0; i < 5; i++) {
            g.lineWidth = 1 + Math.random();
            let x = Math.random() * w, y = Math.random() * h;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += rand(-16, 16); y += rand(-16, 16); g.lineTo(x, y); }
            g.stroke();
        }
    }, 1.6);
    const asphaltDraw = (vertical) => (g, w, h) => {
        g.fillStyle = '#26262a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#1e1e22', '#2e2e33', '#232327', '#333338'], 300, 1, 5);
        for (let i = 0; i < 6; i++) {                                // noda oli
            g.globalAlpha = 0.12 + Math.random() * 0.12;
            g.fillStyle = '#0c0c0e';
            g.beginPath();
            g.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 22, 5 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(10,10,12,0.65)';                       // retakan
        for (let i = 0; i < 5; i++) {
            g.lineWidth = 0.8 + Math.random();
            let x = Math.random() * w, y = Math.random() * h;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += rand(-18, 18); y += rand(-18, 18); g.lineTo(x, y); }
            g.stroke();
        }
        g.fillStyle = 'rgba(206,200,180,0.55)';                      // marka jalan
        if (vertical) { for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 2, y, 4, 34); }
        else { for (let x = 0; x < w; x += 64) g.fillRect(x, h / 2 - 2, 34, 4); }
    };
    const ox = PARK.hx + ROAD_W / 2, oz = PARK.hz + ROAD_W / 2;
    const lenX = PARK.hx * 2 + ROAD_W * 2, lenZ = PARK.hz * 2 + ROAD_W * 2;
    const mkRoad = (w, d, x, z) => {
        const along = w > d;   // marka mengikuti sisi panjang
        const tex = makeTexture(256, 256, asphaltDraw(!along), along ? w / 128 : 1, along ? 1 : d / 128);
        const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
            new THREE.MeshPhongMaterial({ map: tex, normalMap: asphaltNrm, shininess: 6, specular: 0x101014 }));
        r.rotation.x = -Math.PI / 2;
        r.position.set(x, 0.02, z);
        r.receiveShadow = true;
        scene.add(r);
    };
    mkRoad(lenX, ROAD_W, 0, -oz);   // utara
    mkRoad(lenX, ROAD_W, 0, oz);    // selatan
    mkRoad(ROAD_W, lenZ, -ox, 0);   // barat
    mkRoad(ROAD_W, lenZ, ox, 0);    // timur

    // Trotoar/curb batu di tepi luar ring road (kosmetik, di luar pagar)
    const curbMat = new THREE.MeshPhongMaterial({ color: 0x55534e, shininess: 6 });
    const mkCurb = (w, d, x, z) => {
        const cB = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), curbMat);
        cB.position.set(x, 0.7, z);
        cB.receiveShadow = true;
        scene.add(cB);
    };
    const co = ROAD_W + 1.5;
    mkCurb(lenX + 6, 3, 0, -(PARK.hz + co)); mkCurb(lenX + 6, 3, 0, PARK.hz + co);
    mkCurb(3, lenZ + 6, -(PARK.hx + co), 0); mkCurb(3, lenZ + 6, PARK.hx + co, 0);
}

function createParkRoads() {
    // Pelataran tengah: pola radial (cincin konsentris + jari-jari) khas pelataran Monas
    const pavingTex = makeTexture(512, 512, (g, w, h) => {
        g.fillStyle = '#8a7a4a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#7d6f43', '#968551', '#6f6340', '#a08e57'], 500, 2, 6);
        const cx = w / 2, cy = h / 2;
        g.strokeStyle = 'rgba(52,45,26,0.6)';
        for (let r = 28; r < w / 2; r += 28) {                      // cincin konsentris
            g.lineWidth = r % 84 < 28 ? 3 : 1.6;
            g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        }
        g.lineWidth = 1.6;
        for (let i = 0; i < 36; i++) {                              // jari-jari radial
            const a = i / 36 * Math.PI * 2;
            g.beginPath(); g.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
            g.lineTo(cx + Math.cos(a) * w / 2, cy + Math.sin(a) * w / 2); g.stroke();
        }
        g.strokeStyle = 'rgba(160,130,60,0.8)'; g.lineWidth = 5;    // aksen emas pusat
        g.beginPath(); g.arc(cx, cy, 56, 0, Math.PI * 2); g.stroke();
    }, 1, 1);   // repeat 1: pola sejajar pusat lingkaran
    const plaza = new THREE.Mesh(
        new THREE.CircleGeometry(95, 48),
        new THREE.MeshPhongMaterial({ map: pavingTex, shininess: 10, specular: 0x14120c })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.05;
    plaza.receiveShadow = true;
    scene.add(plaza);

    // Jalan Silang Monas: dua pita diagonal menyilang membentuk X + marka tengah
    const diagLen = 2 * Math.hypot(PARK.hx, PARK.hz);
    const ang = Math.atan2(PARK.hz, PARK.hx);
    for (const a of [ang, -ang]) {
        const tex = makeTexture(256, 256, (g, w, h) => {
            g.fillStyle = '#35353a'; g.fillRect(0, 0, w, h);
            speckle(g, w, h, ['#2c2c31', '#3e3e44', '#303036'], 260, 1, 5);
            g.strokeStyle = 'rgba(12,12,14,0.6)';                   // retakan
            for (let i = 0; i < 4; i++) {
                g.lineWidth = 0.8 + Math.random();
                let x = Math.random() * w, y = Math.random() * h;
                g.beginPath(); g.moveTo(x, y);
                for (let s = 0; s < 4; s++) { x += rand(-16, 16); y += rand(-16, 16); g.lineTo(x, y); }
                g.stroke();
            }
            g.fillStyle = 'rgba(206,200,180,0.5)';
            for (let x = 0; x < w; x += 64) g.fillRect(x, h / 2 - 2, 34, 4);
        }, diagLen / 128, 1);
        const grp = new THREE.Group();
        grp.rotation.y = a;                 // putar di sumbu tegak -> diagonal di tanah
        const road = new THREE.Mesh(new THREE.PlaneGeometry(diagLen, 40),
            new THREE.MeshPhongMaterial({ map: tex, shininess: 6, specular: 0x101014 }));
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0.03;
        road.receiveShadow = true;
        grp.add(road);
        scene.add(grp);
    }
}

function createFence() {
    // Pagar BETON keliling: dinding panel + pilar + coping. Tetap batas keras
    // player (clamp di playerCollide) & tetap dilompati zombie saat masuk.
    const grp = new THREE.Group();
    const hx = PARK.hx, hz = PARK.hz, H = FENCE_H;
    const WH = H * 0.78;   // tinggi dinding panel (pilar sedikit lebih tinggi)

    // Tekstur beton kusam: noise + rembesan air dari atas + garis sambungan panel
    const concreteDraw = (g, w, h) => {
        g.fillStyle = '#8d8a83'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, ['#7e7b74', '#98958d', '#6f6c66', '#a3a098'], 380, 1, 5);
        for (let i = 0; i < 12; i++) {
            const x = Math.random() * w, len = 30 + Math.random() * 70, sw = 2 + Math.random() * 5;
            const grd = g.createLinearGradient(0, 0, 0, len);
            grd.addColorStop(0, 'rgba(45,42,38,0.35)');
            grd.addColorStop(1, 'rgba(45,42,38,0)');
            g.fillStyle = grd;
            g.fillRect(x - sw / 2, 0, sw, len);
        }
        g.strokeStyle = 'rgba(50,48,44,0.55)'; g.lineWidth = 2;
        for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    };
    const concreteNrm = makeNormalMap(128, 128, noiseHeight(128, 22, 300, 1, 4), 1.2);
    const mkConcrete = (repX) => new THREE.MeshPhongMaterial({
        map: makeTexture(256, 128, concreteDraw, repX, 1),
        normalMap: concreteNrm, shininess: 6, specular: 0x151412
    });
    const wallMatX = mkConcrete(hx * 2 / 38);   // sambungan panel segaris dgn pilar (~38 unit)
    const wallMatZ = mkConcrete(hz * 2 / 38);
    const capMat = new THREE.MeshPhongMaterial({ color: 0x96938b, shininess: 8, specular: 0x161513 });

    // Dinding panel per sisi + coping (ambang atas)
    const mkWall = (w, d, x, z, mat) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, WH, d), mat);
        m.position.set(x, WH / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
        const cop = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.9, d + 1.2), capMat);
        cop.position.set(x, WH + 0.45, z);
        cop.castShadow = true;
        grp.add(cop);
    };
    mkWall(hx * 2, 2.4, 0, -hz, wallMatX);
    mkWall(hx * 2, 2.4, 0, hz, wallMatX);
    mkWall(2.4, hz * 2, -hx, 0, wallMatZ);
    mkWall(2.4, hz * 2, hx, 0, wallMatZ);

    // Pilar beton tiap ~38 unit + topi pilar — dua InstancedMesh (2 draw call)
    const step = 38;
    const posts = [];
    for (let x = -hx; x <= hx; x += step) { posts.push([x, -hz]); posts.push([x, hz]); }
    for (let z = -hz; z <= hz; z += step) { posts.push([-hx, z]); posts.push([hx, z]); }
    const pillarMat = new THREE.MeshPhongMaterial({
        map: makeTexture(64, 128, concreteDraw),
        normalMap: concreteNrm, shininess: 6, specular: 0x151412
    });
    const pillarMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(4, H, 4), pillarMat, posts.length);
    const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(5.2, 1.1, 5.2), capMat, posts.length);
    const _m = new THREE.Matrix4();
    posts.forEach(([x, z], i) => {
        _m.setPosition(x, H / 2, z);
        pillarMesh.setMatrixAt(i, _m);
        _m.setPosition(x, H + 0.55, z);
        capMesh.setMatrixAt(i, _m);
    });
    pillarMesh.castShadow = capMesh.castShadow = true;
    pillarMesh.frustumCulled = capMesh.frustumCulled = false;   // bounds instance tak dihitung r128
    grp.add(pillarMesh); grp.add(capMesh);
    scene.add(grp);
}

function createParkProps() {
    // Air mancur & kolam kosmetik; bak air mancur + pohon PEJAL (lihat kolisi scene).
    const stoneRim = new THREE.MeshPhongMaterial({ color: 0x6f6a5e, shininess: 10, specular: 0x1a1815 });
    // Air dengan riak bergaris yang mengalir (offset tekstur dianimasikan di decor.js)
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
    }, 3, 3);
    setWaterTex(waterTex);
    const water = new THREE.MeshPhongMaterial({
        map: waterTex, shininess: 150, specular: 0xbfe2f5,
        transparent: true, opacity: 0.9
    });
    // Air Mancur Menari (barat): bak batu + air + semburan berdenyut (decor.js).
    // Bak = penghalang pejal (resolveObstacles) dan puncaknya bisa dinaiki (groundHeightAt).
    const fountainX = FOUNTAIN.x;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(46, 48, 3, 28), stoneRim);
    basin.position.set(fountainX, 1.5, 0);
    basin.castShadow = true; basin.receiveShadow = true;
    scene.add(basin);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(42, 44, 2.6, 28), water);
    fountain.position.set(fountainX, 1.9, 0);
    scene.add(fountain);
    for (let i = 0; i < 3; i++) {
        const jet = new THREE.Mesh(
            new THREE.ConeGeometry(3 - i * 0.7, 20 - i * 4, 10),
            new THREE.MeshPhongMaterial({
                color: 0x9fd2ee, transparent: true, opacity: 0.5 - i * 0.1,
                shininess: 120, specular: 0xffffff, depthWrite: false
            })
        );
        jet.position.set(fountainX + (i - 1) * 14, 11 - i * 2, (i - 1) * 8);
        scene.add(jet);
        waterJets.push(jet);
    }

    // Kolam Pantul (utara) + bibir kolam
    const rim = new THREE.Mesh(new THREE.BoxGeometry(156, 2.4, 66), stoneRim);
    rim.position.set(0, 1.0, -PARK.hz * 0.55);
    rim.receiveShadow = true;
    scene.add(rim);
    const pool = new THREE.Mesh(new THREE.BoxGeometry(150, 1.5, 60), water);
    pool.position.set(0, 1.4, -PARK.hz * 0.55);
    scene.add(pool);

    // Pohon-pohon: InstancedMesh batang lancip + 3 gerombol tajuk icosahedron faceted
    // (organik-stilistik) dgn variasi warna, ukuran, dan kemiringan -> tetap 2 draw call.
    const N_TREE = 40;
    const leafGeo = new THREE.IcosahedronGeometry(11, 1);
    leafGeo.computeVertexNormals();   // normal per-muka -> tampilan faceted
    const trunkMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1.6, 2.6, 16, 7),
        new THREE.MeshLambertMaterial({ color: 0xffffff }), N_TREE);
    const leafMesh = new THREE.InstancedMesh(
        leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N_TREE * 3);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qt = new THREE.Quaternion(),
        _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const tiltAxis = new THREE.Vector3(1, 0, 0);
    // Titik valid = RUMPUT saja: tolak pelataran tengah, Jalan Silang (diagonal),
    // bak air mancur, dan kolam pantul.
    const diagA = Math.atan2(PARK.hz, PARK.hx);
    const isOnGrass = (x, z) => {
        if (Math.abs(x) < 120 && Math.abs(z) < 120) return false;                       // pelataran + Monas
        if (Math.abs(x * Math.sin(diagA) - z * Math.cos(diagA)) < 30) return false;     // diagonal 1 (lebar 40/2 + margin)
        if (Math.abs(x * Math.sin(diagA) + z * Math.cos(diagA)) < 30) return false;     // diagonal 2
        if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 12) return false; // air mancur
        if (Math.abs(x) < 88 && Math.abs(z + PARK.hz * 0.55) < 43) return false;        // kolam pantul
        return true;
    };
    let ti = 0, li = 0;
    for (let i = 0; i < N_TREE; i++) {
        // rejection sampling: coba beberapa kali sampai dapat titik rumput
        let x = 0, z = 0, ok = false;
        for (let attempt = 0; attempt < 24 && !ok; attempt++) {
            x = rand(-PARK.hx + 30, PARK.hx - 30);
            z = rand(-PARK.hz + 30, PARK.hz - 30);
            ok = isOnGrass(x, z);
        }
        if (!ok) continue;
        const sc = rand(0.8, 1.3);
        treeColliders.push({ x, z, r: 3.4 * sc });   // batang pejal (player & zombie)
        _q.setFromAxisAngle(up, Math.random() * Math.PI);
        _qt.setFromAxisAngle(tiltAxis, rand(-0.07, 0.07));      // sedikit doyong
        _q.multiply(_qt);

        _m.compose(_p.set(x, 8 * sc, z), _q, _s.set(sc, sc, sc));
        trunkMesh.setMatrixAt(ti, _m);
        trunkMesh.setColorAt(ti, _c.setHex(0x4a3322).offsetHSL(0, 0, rand(-0.03, 0.03)));
        ti++;

        // 3 gerombol tajuk: besar bawah, samping, kecil atas
        const blobs = [
            [x, 22 * sc, z, sc],
            [x + rand(-7, 7), 20 * sc, z + rand(-7, 7), sc * 0.66],
            [x + rand(-4, 4), 30 * sc, z + rand(-4, 4), sc * 0.52],
        ];
        for (const [bx, by, bz, bs] of blobs) {
            _m.compose(_p.set(bx, by, bz), _q, _s.set(bs, bs * rand(0.85, 1.1), bs));
            leafMesh.setMatrixAt(li, _m);
            leafMesh.setColorAt(li, _c.setHex(0x2a5c20).offsetHSL(rand(-0.02, 0.02), rand(-0.06, 0.06), rand(-0.05, 0.03)));
            li++;
        }
    }
    trunkMesh.count = ti; leafMesh.count = li;   // sebagian slot batal (area tengah)
    if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    trunkMesh.castShadow = leafMesh.castShadow = true;
    trunkMesh.frustumCulled = leafMesh.frustumCulled = false;   // bounds instance tak dihitung r128
    scene.add(trunkMesh); scene.add(leafMesh);
}

function createCity() {
    // Siluet kota Jakarta yang runtuh: cincin gedung jauh di luar taman & jalan
    // (backdrop). InstancedMesh: ~280 gedung + puing = 3 draw call. Resep fasad
    // bersama ada di world/facades.js (dipakai juga campaign stage 2).
    const facadeTex = makeFacadeTex();
    const litTex = makeLitTex();

    const RINGS = [
        { r0: 820, r1: 1050, hMin: 40, hMax: 160, count: 90 },
        { r0: 1050, r1: 1380, hMin: 80, hMax: 320, count: 110 }, // skyline menara tinggi
        { r0: 1380, r1: 1750, hMin: 60, hMax: 380, count: 70 },  // siluet terjauh dalam kabut
    ];

    // Kumpulkan data dulu supaya jumlah tiap instance pasti
    const normal = [], burn = [], rubble = [];
    for (const ring of RINGS) {
        for (let i = 0; i < ring.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const rad = ring.r0 + Math.random() * (ring.r1 - ring.r0);
            const x = Math.cos(angle) * rad;
            const z = Math.sin(angle) * rad;
            const w = 18 + Math.random() * 36;
            const d = 18 + Math.random() * 36;
            const h = ring.hMin + Math.random() * (ring.hMax - ring.hMin);
            const b = {
                x, z, w, d, h,
                ry: Math.random() * 0.4,
                rz: Math.random() < 0.25 ? (Math.random() - 0.5) * 0.18 : 0,   // sebagian miring/runtuh
                color: CITY_PALETTE[(Math.random() * CITY_PALETTE.length) | 0]
            };
            (Math.random() < 0.06 ? burn : normal).push(b);
            // Puing tumpukan di kaki gedung
            if (Math.random() < 0.4) {
                const rw = w * (0.5 + Math.random() * 0.6);
                rubble.push({
                    x: x + (Math.random() - 0.5) * w, z: z + (Math.random() - 0.5) * d,
                    w: rw, d: rw, h: 4 + Math.random() * 8,
                    ry: Math.random(), rz: 0,
                    color: CITY_PALETTE[(Math.random() * CITY_PALETTE.length) | 0]
                });
            }
        }
    }

    fillBuildingInstances(scene, normal, makeCityMat(facadeTex, litTex));
    fillBuildingInstances(scene, burn, makeBurningCityMat(facadeTex));   // berkedip via decor.js
    fillBuildingInstances(scene, rubble, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    addFireSprites(scene, burn);
}

// ----- Kolisi & lantai khas taman ----- //

// Dorong keluar dari penghalang silinder pejal: pohon selalu; bak air mancur
// hanya bila kaki masih di bawah bibirnya (di atas -> bebas berjalan/mendarat).
// Murni horizontal; dipakai player (radius 5) dan zombie (radius 3.5).
// Return true bila DINDING BAK yang menghalangi (pemicu vault zombie).
export function resolveObstacles(pos, radius, feetY) {
    resolveCylinders(pos, radius, treeColliders);
    let fountainBlocked = false;
    if (feetY < FOUNTAIN.topY - 0.4) {
        const dx = pos.x - FOUNTAIN.x, dz = pos.z - FOUNTAIN.z;
        const minD = FOUNTAIN.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = FOUNTAIN.x + dx / d * minD;
            pos.z = FOUNTAIN.z + dz / d * minD;
            fountainBlocked = true;
        }
    }
    return fountainBlocked;
}

// Nav-grid pathfinder zombie: taman di dalam pagar; Monas & pohon = penghalang.
// fountainWalkable=true (survival): bak air mancur SENGAJA walkable — jalur
// lurus yang melintasinya membentur dinding bak lalu memicu perilaku vault.
// fountainWalkable=false (campaign stage 3): campaignZombieAI TIDAK punya
// vault, jadi bak harus jadi penghalang agar zombie memutarinya (bukan macet).
// Panggil SETELAH buildSurvivalWorld (treeColliders sudah terisi).
export function buildSurvivalNav(fountainWalkable = true) {
    const cell = 14, m = 6;   // margin tepi pagar
    return makeNavGrid(-PARK.hx, -PARK.hz, cell,
        Math.ceil(PARK.hx * 2 / cell), Math.ceil(PARK.hz * 2 / cell),
        (x, z) => {
            if (Math.abs(x) > PARK.hx - m || Math.abs(z) > PARK.hz - m) return false;
            if (Math.abs(x) < 28 && Math.abs(z) < 28) return false;   // Monas (AABB 24 + badan zombie)
            if (!fountainWalkable
                && Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 4) return false;
            for (const t of treeColliders)
                if (Math.hypot(x - t.x, z - t.z) < t.r + 4) return false;
            return true;
        });
}

// --- Dunia taman DIBAGI dua scene: survivalScene & campaign stage3Scene ---
// (satu kali bangun; tiap scene mengambil nav-grid versinya sendiri).
let parkBuilt = false;
let navVault = null;    // bak walkable (survival — vault hidup)
let navSolid = null;    // bak pejal (stage 3 — tanpa vault)
export function ensureParkWorld() {
    if (!parkBuilt) { buildSurvivalWorld(); parkBuilt = true; }
}
export function getSurvivalNav() {
    if (!navVault) navVault = buildSurvivalNav(true);
    return navVault;
}
export function getParkNavSolidFountain() {
    if (!navSolid) navSolid = buildSurvivalNav(false);
    return navSolid;
}

// Apakah ruas garis (x1,z1)->(x2,z2) melintasi lingkaran bak air mancur?
// Dipakai zombie: vault hanya bila jalur ke player memang lewat bak.
export function segmentHitsFountain(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz || 1;
    const t = clamp(((FOUNTAIN.x - x1) * dx + (FOUNTAIN.z - z1) * dz) / len2, 0, 1);
    const px = x1 + dx * t - FOUNTAIN.x, pz = z1 + dz * t - FOUNTAIN.z;
    return px * px + pz * pz < FOUNTAIN.r * FOUNTAIN.r;
}

// Ketinggian "lantai" di (x,z): puncak bak air mancur bisa dipijak bila
// player datang dari atas; selain itu tanah datar y=0.
export function groundHeightAt(x, z, feetY) {
    if (feetY >= FOUNTAIN.topY - 0.6 &&
        Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 2) return FOUNTAIN.topY;
    return 0;
}
