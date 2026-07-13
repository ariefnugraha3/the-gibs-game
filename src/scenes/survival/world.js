// Dunia Survival: Taman Monas — tanah/rumput, Jalan Medan Merdeka, pelataran +
// Jalan Silang, pagar beton keliling (batas keras player), properti taman
// (air mancur pejal + kolam + pohon pejal), Monas, dan kota latar (instanced).

import { scene, addCamShake } from '../../core/renderer.js';
import { CFG, CAMP_M } from '../../core/config.js';
import { spawnGroundPuff } from '../../entities/effects.js';
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
    createFogCanopy();   // kanopi kabut event (tersembunyi sampai dipicu wave 3)
}

// --- Kabut event (survival, dipicu wave 3): kanopi abu-abu tebal MELAYANG di
// atas arena dengan LUBANG bersih di sekitar Monas (radius CFG.monasFogClearMeters).
// scene.fog biasa berbasis jarak-ke-kamera, jadi TIDAK bisa membuat zona bersih
// berbasis-posisi — maka dipakai piringan tembus-pandang overhead: tekstur radial
// meng-alpha-kan pusat (Monas) menjadi bening, sisanya abu pekat. Dibangun SEKALI
// (ikut warm-up preload = tanpa hitch), lalu di-fade oleh index.js saat event.
let fogCanopy = null, fogCanopyMat = null;

// --- Runtuhnya Monas (2026-07-13): saat monasHp habis, Monas TIDAK langsung
// game over — bagian atas obelisk TUMBANG di sebuah engsel di dasarnya, dengan
// tremor, debu, puing berhamburan, dan guncangan kamera, lalu game over setelah
// animasi. Bagian atas (kaki+obelisk+cawan+api) dikumpulkan di `monasTop` (grup
// engsel di titik MONAS_HINGE); undakan dasar tetap. Refs api dipromosikan ke
// modul supaya bisa dipadamkan (decor.js dinolkan sementara agar tak menimpa). ---
let monasTop = null;                                   // grup bagian atas (engsel)
let monasFlame = null, monasFlameLight = null, monasFlameGlow = null;
let monasStoneMat = null, monasMarbleMat = null;       // material dipakai ulang utk puing
let collapse = null;                                   // state animasi (null = tegak)
const MONAS_HINGE = { x: 6.5, y: 8 };                  // engsel tumbang (tepi dasar obelisk)
let debrisGeo = null;                                  // geometri puing (dibuat saat runtuh)
const FOG_H = 26;              // tinggi kanopi (di atas kepala robot, jauh di bawah kamera)
const FOG_DISK_R = 1800;       // radius piringan (jauh melampaui pandangan kamera di sudut mana pun)
const FOG_MAX_OPACITY = 0.72;  // kepekatan puncak kabut (visual-only)

function createFogCanopy() {
    const clearR = (CFG.survival.monasFogClearMeters || 20) * CAMP_M;  // zona bersih di sekitar Monas (unit)
    const featherR = 10 * CAMP_M;                                      // pita transisi bening -> kabut penuh
    const SZ = 1024, half = SZ / 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = SZ;
    const g = cv.getContext('2d');
    g.fillStyle = '#a7abb0'; g.fillRect(0, 0, SZ, SZ);   // abu dasar
    for (let i = 0; i < 130; i++) {                       // gumpalan kabut lembut (billow)
        const x = Math.random() * SZ, y = Math.random() * SZ, r = 60 + Math.random() * 190;
        const c = Math.random() < 0.5 ? '212,216,220' : '134,139,146';
        const rg = g.createRadialGradient(x, y, 2, x, y, r);
        rg.addColorStop(0, `rgba(${c},0.5)`); rg.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Lubang bening di pusat (Monas): destination-out mengikis alpha secara radial
    // -> bening penuh sampai clearR, memudar ke kabut penuh sepanjang featherR.
    const holePx = clearR / FOG_DISK_R * half;
    const outPx = (clearR + featherR) / FOG_DISK_R * half;
    g.globalCompositeOperation = 'destination-out';
    const hg = g.createRadialGradient(half, half, 0, half, half, outPx);
    hg.addColorStop(0, 'rgba(0,0,0,1)');
    hg.addColorStop(holePx / outPx, 'rgba(0,0,0,1)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.beginPath(); g.arc(half, half, outPx, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    // MeshBasic (unlit) + fog:false = kabut sendiri tak ikut ter-fog jarak; opacity
    // 0 = tersembunyi sampai event. depthWrite:false agar tak mengganggu transparan lain.
    fogCanopyMat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, fog: false
    });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(FOG_DISK_R, 72), fogCanopyMat);
    disk.rotation.x = -Math.PI / 2;        // rebahkan horizontal
    disk.frustumCulled = false;            // piringan raksasa: jangan di-cull salah
    fogCanopy = new THREE.Group();
    fogCanopy.position.set(0, FOG_H, 0);   // pusat kanopi = Monas (origin) -> lubang tepat di Monas
    fogCanopy.add(disk);
    fogCanopy.visible = false;
    fogCanopy.renderOrder = 3;             // gambar setelah geometri dunia (objek transparan)
    scene.add(fogCanopy);
}

// Kendali kabut event (dipanggil survival/index.js). k = 0..1 kepekatan (envelope
// fade-in/out). Piringan disembunyikan penuh saat k~0.
export function setFogCanopy(k) {
    if (!fogCanopyMat) return;
    fogCanopyMat.opacity = k * FOG_MAX_OPACITY;
    fogCanopy.visible = k > 0.002;
}
// Putar pelan agar gumpalan kabut tampak bergerak; sumbu putar = Monas, jadi
// LUBANG bersih tetap terkunci di Monas (tidak ikut bergeser).
export function driftFogCanopy(dt) {
    if (fogCanopy && fogCanopy.visible) fogCanopy.rotation.y += dt * 0.06;
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
    monasMarbleMat = marble; monasStoneMat = stone;

    // Bagian atas yang bisa tumbang hidup di grup engsel `top` (origin =
    // MONAS_HINGE di tepi dasar obelisk). Posisi anak = dunia - engsel, sehingga
    // memutar top.rotation.z menjungkalkan seluruh menara di engsel itu.
    const top = new THREE.Group();
    top.position.set(MONAS_HINGE.x, MONAS_HINGE.y, 0);
    monas.add(top);
    monasTop = top;

    // add() -> undakan dasar (tetap); addTop() -> menara (ikut engsel, y relatif engsel)
    const add = (geo, mat, y, extra) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y;
        m.castShadow = true; m.receiveShadow = true;
        if (extra) extra(m);
        monas.add(m);
    };
    const addTop = (geo, mat, y, extra) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(-MONAS_HINGE.x, y - MONAS_HINGE.y, 0);
        m.castShadow = true; m.receiveShadow = true;
        if (extra) extra(m);
        top.add(m);
        return m;
    };
    add(new THREE.BoxGeometry(44, 2, 44), stone, 1);                                                      // undakan bawah
    add(new THREE.BoxGeometry(40, 3, 40), stone, 3.5);                                                    // teras
    add(new THREE.BoxGeometry(30, 3, 30), marble, 6.5);                                                   // pelataran atas (dasar, tetap)
    addTop(new THREE.CylinderGeometry(5.6, 7.4, 6, 4, 1), marble, 11, m => m.rotation.y = Math.PI / 4);   // kaki obelisk (menara mulai di sini, patah di engsel)
    addTop(new THREE.CylinderGeometry(3.4, 5.6, 50, 4, 1), marble, 39, m => m.rotation.y = Math.PI / 4);  // obelisk meruncing
    addTop(new THREE.CylinderGeometry(10, 4, 6, 8, 1, false), marble, 66, m => m.rotation.y = Math.PI / 8); // cawan
    // Lidah api emas: emissive kuat (ditangkap bloom) + cahaya hangat yang menerangi
    // pelataran + sprite glow yang berdenyut (decor.js). Ikut menara saat tumbang.
    const flame = new THREE.Mesh(
        new THREE.ConeGeometry(4, 15, 8),
        new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0xffa028, emissiveIntensity: 1.35, shininess: 90, specular: 0xfff2c0 })
    );
    flame.position.set(-MONAS_HINGE.x, 76.5 - MONAS_HINGE.y, 0);
    top.add(flame);
    monasFlame = flame;
    const flameLight = new THREE.PointLight(0xffc36b, 1.1, 420, 2);
    flameLight.position.set(-MONAS_HINGE.x, 80 - MONAS_HINGE.y, 0);
    top.add(flameLight);
    monasFlameLight = flameLight;
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
    flameGlow.position.set(-MONAS_HINGE.x, 78 - MONAS_HINGE.y, 0);
    flameGlow.scale.set(30, 30, 1);
    top.add(flameGlow);
    monasFlameGlow = flameGlow;
    setFlameGlow(flameGlow);
    scene.add(monas);
}

// ===== Runtuhnya Monas — animasi sinematik (dipanggil survival/index.js) =====
// Tiga fase: TREMBLE (menara bergetar makin keras, debu naik dari dasar, api
// meredup), TOPPLE (menara terjungkal di engsel dengan percepatan gravitasi +
// benturan besar: debu, puing, guncangan kamera, api padam), SETTLE (memantul
// kecil lalu diam, debu mengendap). updateMonasCollapse mengembalikan true saat
// SELURUH urutan selesai -> index.js memicu gameOver.
export function isMonasCollapsing() { return !!collapse; }

export function startMonasCollapse() {
    if (!monasTop || collapse) return;
    collapse = {
        t: 0, phase: 'tremble', impacted: false, dustCd: 0, debris: [],
        tremble: CFG.survival.monasCollapseTrembleSec || 1.4,
        topple: CFG.survival.monasCollapseToppleSec || 2.2,
        settle: CFG.survival.monasCollapseSettleSec || 1.6
    };
    // Ambil alih api dari decor.js supaya bisa dipadamkan tanpa ditimpa denyut.
    setFlameLight(null); setFlameGlow(null);
    debrisGeo = new THREE.BoxGeometry(3.4, 3.4, 3.4);
}

// Hamburkan puing marmer di sekitar (x,z): pecahan yang terlempar + gravitasi + spin.
function spawnDebris(x, z, n, power) {
    if (!debrisGeo) return;
    for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(debrisGeo, i % 3 === 0 ? monasStoneMat : monasMarbleMat);
        const s = 0.5 + Math.random() * 1.4;
        m.scale.setScalar(s);
        m.position.set(x + rand(-8, 8), 6 + Math.random() * 20, z + rand(-8, 8));
        m.castShadow = true;
        const ang = Math.random() * Math.PI * 2, sp = (10 + Math.random() * 26) * power;
        collapse.debris.push({
            mesh: m,
            vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, vy: 10 + Math.random() * 26 * power,
            rx: rand(-6, 6), ry: rand(-6, 6), rz: rand(-6, 6), rest: 0.7 + Math.random() * s * 0.7
        });
        scene.add(m);
    }
}

function updateDebris(dt) {
    for (const d of collapse.debris) {
        if (d.done) continue;
        d.vy -= 62 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.rx * dt;
        d.mesh.rotation.y += d.ry * dt;
        d.mesh.rotation.z += d.rz * dt;
        if (d.mesh.position.y <= d.rest) {   // mendarat: mantul kecil lalu diam
            d.mesh.position.y = d.rest;
            if (d.vy < -6) { d.vy *= -0.32; d.vx *= 0.5; d.vz *= 0.5; d.rx *= 0.4; d.ry *= 0.4; d.rz *= 0.4; }
            else { d.vy = 0; d.vx *= 0.7; d.vz *= 0.7; d.done = true; }
        }
    }
}

export function updateMonasCollapse(dt) {
    if (!collapse) return false;
    const c = collapse;
    c.t += dt;
    updateDebris(dt);

    if (c.phase === 'tremble') {
        // Getaran makin keras (0->1); menara bergetar di engsel, debu naik, api meredup.
        const k = Math.min(1, c.t / c.tremble);
        const amp = 0.006 + k * k * 0.05;
        monasTop.rotation.z = (Math.random() - 0.5) * amp + Math.sin(c.t * 47) * amp * 0.5;
        monasTop.rotation.x = (Math.random() - 0.5) * amp * 0.6;
        monasTop.position.y = MONAS_HINGE.y + Math.sin(c.t * 60) * k * 0.4;
        addCamShake(0.5 + k * 3.5);
        if (monasFlameLight) monasFlameLight.intensity = 1.1 * (1 - k * 0.6) * (0.6 + Math.random() * 0.4);
        c.dustCd -= dt;
        if (c.dustCd <= 0) {
            c.dustCd = 0.12;
            const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 10;
            spawnGroundPuff(Math.cos(a) * r, Math.sin(a) * r, 0x6b6155, 14 + Math.random() * 10, 3 + Math.random() * 8);
        }
        if (c.t >= c.tremble) { c.phase = 'topple'; c.t = 0; monasTop.position.y = MONAS_HINGE.y; }

    } else if (c.phase === 'topple') {
        // Percepatan gravitasi: sudut ~ u^2 sampai ~PI/2 (rebah), sedikit lewat.
        const u = Math.min(1, c.t / c.topple);
        const target = Math.PI / 2 + 0.14;               // sedikit menancap ke tanah
        monasTop.rotation.z = -target * (u * u);
        monasTop.rotation.x = Math.sin(u * Math.PI) * 0.05;   // sedikit oleng saat jatuh
        addCamShake(1.2 + u * 1.5);
        // Debu terseret di sepanjang badan menara yang menyapu turun
        c.dustCd -= dt;
        if (c.dustCd <= 0 && u < 0.95) {
            c.dustCd = 0.05;
            const reach = MONAS_HINGE.x + 20 + u * 55;     // ujung menara menyapu keluar
            spawnGroundPuff(reach + rand(-10, 10), rand(-12, 12), 0x6b6155, 16 + Math.random() * 12, 2 + Math.random() * 6);
        }
        // BENTURAN (dekat rebah): ledakan debu + puing + guncangan besar, api padam
        if (!c.impacted && u >= 0.9) {
            c.impacted = true;
            const tipX = MONAS_HINGE.x + 46;               // kira-kira posisi ujung obelisk saat mendarat
            addCamShake(11);
            for (let i = 0; i < 7; i++) {
                const fx = MONAS_HINGE.x + 8 + i * 8;
                spawnGroundPuff(fx + rand(-6, 6), rand(-16, 16), 0x7a7064, 34 + Math.random() * 22, 3 + Math.random() * 8);
            }
            spawnGroundPuff(tipX, 0, 0x8a8175, 90, 4);      // gumpalan debu besar di ujung
            spawnDebris(tipX - 6, 0, 16, 1.3);
            spawnDebris(MONAS_HINGE.x + 20, 0, 10, 0.9);
            if (monasFlame) monasFlame.visible = false;
            if (monasFlameGlow) monasFlameGlow.visible = false;
            if (monasFlameLight) monasFlameLight.intensity = 0;
        }
        if (c.t >= c.topple) {
            monasTop.rotation.z = -target;
            c.phase = 'settle'; c.t = 0;
        }

    } else {   // settle: pantulan kecil menara yang rebah + debu mengendap
        const u = Math.min(1, c.t / c.settle);
        const target = Math.PI / 2 + 0.14;
        monasTop.rotation.z = -target + Math.sin(u * Math.PI * 3) * (1 - u) * 0.05;
        if (u < 0.4) addCamShake(2.2 * (1 - u / 0.4));
        c.dustCd -= dt;
        if (c.dustCd <= 0 && u < 0.6) {
            c.dustCd = 0.14;
            spawnGroundPuff(MONAS_HINGE.x + 10 + Math.random() * 50, rand(-14, 14), 0x6b6155, 20 + Math.random() * 14, 2 + Math.random() * 10);
        }
        if (c.t >= c.settle) return true;   // seluruh urutan selesai
    }
    return false;
}

// Kembalikan Monas ke posisi tegak (world persist antar-run; dipanggil di enter()).
export function resetMonasCollapse() {
    if (collapse) {
        collapse.debris.forEach(d => scene.remove(d.mesh));
        collapse = null;
    }
    if (debrisGeo) { debrisGeo.dispose(); debrisGeo = null; }
    if (monasTop) { monasTop.rotation.set(0, 0, 0); monasTop.position.set(MONAS_HINGE.x, MONAS_HINGE.y, 0); }
    if (monasFlame) monasFlame.visible = true;
    if (monasFlameGlow) { monasFlameGlow.visible = true; setFlameGlow(monasFlameGlow); }
    if (monasFlameLight) { monasFlameLight.intensity = 1.1; setFlameLight(monasFlameLight); }
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
    // player (clamp di playerCollide) & tetap dilompati robot saat masuk.
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
        treeColliders.push({ x, z, r: 3.4 * sc });   // batang pejal (player & robot)
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
// Murni horizontal; dipakai player (radius 5) dan robot (radius 3.5).
// Return true bila DINDING BAK yang menghalangi (pemicu vault robot).
// Setengah lebar dasar Monas (undakan bawah 44×44 -> half 22) = kolisi pejal.
export const MONAS_HALF = 22;

// Monas = AABB pejal. Dorong entitas keluar PER-SUMBU (bukan revert total)
// supaya player MENYUSUR sisi Monas, tidak menempel/macet — sama seperti
// perbaikan dinding campaign (slideWalk). oldX/oldZ = posisi awal frame:
// sumbu yang tadinya di luar box dibiarkan bergerak (menyusur), sumbu penembus
// dikembalikan. Sudut / sudah-di-dalam = berhenti penuh (jaring pengaman).
export function resolveMonas(pos, oldX, oldZ, radius) {
    const h = MONAS_HALF + radius;
    if (Math.abs(pos.x) >= h || Math.abs(pos.z) >= h) return;   // di luar box
    if (Math.abs(oldZ) >= h) pos.z = oldZ;        // sebelumnya di luar via Z -> susur X, blok Z
    else if (Math.abs(oldX) >= h) pos.x = oldX;   // sebelumnya di luar via X -> susur Z, blok X
    else { pos.x = oldX; pos.z = oldZ; }          // sudut / sudah di dalam -> berhenti
}

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

// Nav-grid pathfinder robot: taman di dalam pagar; Monas & pohon = penghalang.
// fountainWalkable=true (survival): bak air mancur SENGAJA walkable — jalur
// lurus yang melintasinya membentur dinding bak lalu memicu perilaku vault.
// fountainWalkable=false (campaign stage 3): campaignRobotAI TIDAK punya
// vault, jadi bak harus jadi penghalang agar robot memutarinya (bukan macet).
// Panggil SETELAH buildSurvivalWorld (treeColliders sudah terisi).
export function buildSurvivalNav(fountainWalkable = true) {
    const cell = 14, m = 6;   // margin tepi pagar
    return makeNavGrid(-PARK.hx, -PARK.hz, cell,
        Math.ceil(PARK.hx * 2 / cell), Math.ceil(PARK.hz * 2 / cell),
        (x, z) => {
            if (Math.abs(x) > PARK.hx - m || Math.abs(z) > PARK.hz - m) return false;
            if (Math.abs(x) < 28 && Math.abs(z) < 28) return false;   // Monas (AABB 24 + badan robot)
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
// Dipakai robot: vault hanya bila jalur ke player memang lewat bak.
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
