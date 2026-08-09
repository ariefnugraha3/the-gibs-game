// LATAR KOTA JAKARTA di sekeliling gedung campaign stage 1-3 (2026-07-18,
// permintaan user: background gedung indoor jadi PEMANDANGAN KOTA JAKARTA seperti
// cutscene intro). Gedung stage 1-3 adalah LANTAI 2 sebuah gedung terbengkalai
// dilihat top-down; sebelum ini yang di luar temboknya = void gelap. Modul ini
// membangun cincin kota (podium gedung + jalan + gedung-gedung + pohon + taman)
// MENGELILINGI footprint gedung sehingga tampak berdiri di tengah kota Jakarta.
//
// Resep sama seperti intro (world/facades.js — SATU InstancedMesh gedung +
// InstancedMesh pohon = ringan, mudah dipanaskan warmupAll). MURNI DEKOR: TIDAK
// menambah blocker/grid/nav — jadi collision/robot/BFS stage tak berubah.
//
// LANGIT/ENV: kubah "kobaran api" global (world/sky.js/decor.js) DISEMBUNYIKAN
// selama stage 1-3 (enterCityEnv) + scene.background di-set haze malam DINGIN +
// fog dilebarkan agar kota terlihat; DIPULIHKAN saat stage 4 (exitCityEnv —
// stage 4 outdoor tetap pakai kubah apokaliptik global). Satu sesi = satu mode
// (startGame sekali), jadi survival tak terpengaruh.

import { scene } from '../../../core/renderer.js';
import { makeTexture, speckle } from '../../../utils/textures.js';
import { makeFacadeTex, makeLitTex, makeCityMat, fillBuildingInstances, CITY_PALETTE } from '../../../world/facades.js';
import { skyDome } from '../../../world/decor.js';

const GY_FLOOR2 = -70;   // ketinggian jalan kota di bawah slab Lantai 2 (deck y=0)
let _bg = null;          // warna background haze (lazy, di-share)

// Bangun cincin kota Jakarta di sekitar gedung berpusat (cx,cz) dgn setengah-
// footprint (hx,hz). Semua ditambah ke scene (dunia stage hidup di satu scene,
// dipisah jarak) — TANPA blocker (dekor). Ringan: 1 InstancedMesh gedung + 1
// InstancedMesh pohon + plane jalan + podium + beberapa taman.
//
// `opts` (2026-08-09, dipakai depot Stage 5 yang berdiri di TENGAH KOTA):
//   parent   — grup induk selain `scene`. Stage 5 memakai `stationRoot` supaya
//              kotanya ikut disembunyikan begitu kereta meninggalkan peron;
//              arena perjalanan menempati koordinat yang sama.
//   groundY  — ketinggian jalan kota. Default −70 (stage 1-3 = Lantai 2);
//              stage 5 berdiri di permukaan tanah, jadi nyaris rata.
//   corridor — pita {z0,z1} dunia yang WAJIB kosong pada SEMUA x. Stage 5
//              memakainya untuk jalur rel + apron run-out: cincin kota biasa
//              hanya mengosongkan kotak di sekitar gedung, sehingga tanpa ini
//              gedung akan berdiri persis di atas rel di sebelah timur/barat
//              peta tempat kereta berangkat.
export function buildCampaignCityscape(cx, cz, hx, hz, opts = {}) {
    const GY = opts.groundY != null ? opts.groundY : GY_FLOOR2;
    const root = opts.parent || scene;
    const corridor = opts.corridor || null;
    const clear = z => !corridor || z <= corridor.z0 || z >= corridor.z1;
    // Dihitung saat membangun dan dilaporkan balik: smoke memakai ini untuk
    // membuktikan koridor rel benar-benar kosong, tanpa perlu membongkar
    // InstancedMesh pohon.
    let corridorHits = 0;
    // --- PODIUM: lantai-lantai bawah gedung (Lt.1/ground) di bawah slab Lantai 2,
    //     supaya tepi lantai tak "melayang" di atas jalanan kota. ---
    const podium = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 24, -GY, hz * 2 + 24),
        new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
    podium.position.set(cx, GY / 2, cz);
    podium.castShadow = true; podium.receiveShadow = true;
    root.add(podium);

    // --- Jalanan aspal (Jakarta: jalan lebar) di ketinggian jalan GY ---
    const streetTex = makeTexture(256, 256, (c, w, h) => {
        c.fillStyle = '#1a1c22'; c.fillRect(0, 0, w, h);
        speckle(c, w, h, ['#141620', '#20232b', '#101218', '#242832'], 190, 1, 4);
        c.strokeStyle = 'rgba(170,174,186,0.13)'; c.lineWidth = 8;
        c.strokeRect(3, 3, w - 6, h - 6);
        c.strokeStyle = 'rgba(210,200,150,0.09)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    }, 26, 26);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200),
        new THREE.MeshLambertMaterial({ map: streetTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, GY, cz);
    ground.receiveShadow = true;
    root.add(ground);

    // --- Taman/ruang hijau (Jakarta hijau) ---
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x2c4a24 });
    const park = (px, pz, r) => {
        if (!clear(cz + pz)) return;
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), grassMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(cx + px, GY + 0.6, cz + pz);
        m.receiveShadow = true; root.add(m);
    };
    park(-720, -640, 140); park(760, 520, 150); park(-560, 720, 120); park(700, -720, 130);

    // --- Gedung-gedung sekeliling (TALL, mengisi horizon di atas tembok Lt.2;
    //     renggang ala Jakarta) — SATU InstancedMesh, TANPA footprint gedung. ---
    const facadeTex = makeFacadeTex();
    const litTex = makeLitTex();
    const list = [];
    const CELL = 132;
    const exX = hx + 140, exZ = hz + 140;   // jauhkan dari gedung (jalan mengelilingi)
    for (let gx = -1480; gx <= 1480; gx += CELL) {
        for (let gz = -1480; gz <= 1480; gz += CELL) {
            if (Math.abs(gx) < exX && Math.abs(gz) < exZ) continue;   // sisakan gedung + jalan keliling
            if (!clear(cz + gz)) continue;                            // koridor rel: kosong di semua x
            if (Math.random() < 0.4) continue;                        // ~60% lot = renggang
            const jx = (Math.random() - 0.5) * 42, jz = (Math.random() - 0.5) * 42;
            const wide = Math.random() < 0.34;
            const w = wide ? 74 + Math.random() * 36 : 34 + Math.random() * 26;
            const d = wide ? 74 + Math.random() * 36 : 34 + Math.random() * 26;
            // TINGGI mengisi horizon: mayoritas menjulang di atas tembok Lt.2 (top>22)
            const h = wide ? 150 + Math.random() * 180 : 210 + Math.random() * 300;
            if (!clear(cz + gz + jz)) corridorHits++;
            list.push({ x: cx + gx + jx, z: cz + gz + jz, w, d, h, ry: (Math.random() - 0.5) * 0.3, rz: 0, color: CITY_PALETTE[(Math.random() * CITY_PALETTE.length) | 0] });
        }
    }
    const cityG = new THREE.Group();
    cityG.position.y = GY;   // fillBuildingInstances menaruh box dari y=0 -> geser ke jalan
    root.add(cityG);
    fillBuildingInstances(cityG, list, makeCityMat(facadeTex, litTex));

    // --- Pepohonan latar (InstancedMesh kerucut hijau) di lot kosong ---
    const N = 160;
    const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
        new THREE.MeshLambertMaterial({ color: 0x27431f }), N);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
        let dx = 0, dz = 0;
        for (let t = 0; t < 6; t++) {
            dx = (Math.random() - 0.5) * 2900; dz = (Math.random() - 0.5) * 2900;
            if (Math.abs(dx) < exX && Math.abs(dz) < exZ) continue;   // bukan di atas gedung
            if (!clear(cz + dz)) continue;                            // bukan di atas rel
            break;
        }
        // InstancedMesh berjumlah TETAP, jadi pohon yang tetap jatuh di koridor
        // rel setelah enam undian TIDAK boleh dilewati — ia digeser ke tepi
        // koridor terdekat. Melewatinya akan meninggalkan matriks identitas
        // (sebuah kerucut di titik nol dunia).
        if (!clear(cz + dz)) {
            const mid = (corridor.z0 + corridor.z1) / 2;
            dz = (cz + dz < mid ? corridor.z0 - 30 : corridor.z1 + 30) - cz;
        }
        if (!clear(cz + dz)) corridorHits++;
        const sc = 8 + Math.random() * 10;
        _m.compose(_p.set(cx + dx, GY + sc / 2, cz + dz), _q, _s.set(sc * 0.7, sc, sc * 0.7));
        inst.setMatrixAt(i, _m);
    }
    if (inst.instanceMatrix) inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    root.add(inst);
    return { root, groundY: GY, buildings: list.length, trees: N, corridor, corridorHits };
}

// Nyalakan lingkungan "kota" (stage 1-3 enter, SETELAH applyLightPreset): kubah
// kobaran-api global disembunyikan, background = haze malam dingin, fog dilebarkan
// (kota jauh terlihat & memudar mulus ke warna background, bukan oranye api).
export function enterCityEnv() {
    if (skyDome) skyDome.visible = false;
    if (!_bg) _bg = new THREE.Color(0x2b3742);   // haze biru-abu (senada horizon langit intro)
    scene.background = _bg;
    if (scene.fog && scene.fog.color) {
        scene.fog.color.setHex(0x232d36);
        scene.fog.near = 240;
        scene.fog.far = 1650;   // cukup lebar agar cincin kota terlihat (kota jauh 30km tetap ter-cull)
    }
}

// Pulihkan lingkungan apokaliptik global (stage 4 enter — outdoor, kubah kobaran
// api tetap dipakai). Nilai default known (background null, fog oranye) — tanpa save.
export function exitCityEnv() {
    if (skyDome) skyDome.visible = true;
    scene.background = null;
    if (scene.fog && scene.fog.color) scene.fog.color.setHex(0x3a241a);   // near/far dari applyLightPreset('night')
}
