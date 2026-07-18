// Langit kubah + bulan + halo (ikut player) dan partikel bara/abu ambien.
// Dipakai kedua mode; murni dekoratif (tanpa collision).

import { makeTexture } from '../utils/textures.js';
import { setSkyDome } from './decor.js';

const emberLayers = [];   // lapisan partikel bara & abu

export function createSky(scene) {
    // Langit kubah: gradien apokaliptik + bintang + asap berlapis + pijar kebakaran kota
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#05060f'); // puncak: gelap pekat
    grad.addColorStop(0.45, '#1a1320');
    grad.addColorStop(0.68, '#5a2a16'); // smog merah-coklat
    grad.addColorStop(0.82, '#a8431a'); // pijar horizon oranye
    grad.addColorStop(0.92, '#3a241a'); // menyatu dgn warna fog
    grad.addColorStop(1.00, '#1a1108');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    // bintang redup, memudar mendekati horizon
    g.fillStyle = '#cfd6ff';
    for (let i = 0; i < 260; i++) {
        const y = Math.random() * 200;
        g.globalAlpha = Math.max(0, 0.7 - y / 200) * (0.3 + Math.random() * 0.7);
        g.fillRect(Math.random() * 1024, y, 1.5, 1.5);
    }
    // pijar kebakaran kota: kubah cahaya hangat di garis horizon
    for (let i = 0; i < 7; i++) {
        const x = Math.random() * 1024, y = 400 + Math.random() * 40;
        const r = 70 + Math.random() * 150;
        const rg = g.createRadialGradient(x, y, 4, x, y, r);
        rg.addColorStop(0, 'rgba(255,120,30,0.4)');
        rg.addColorStop(0.5, 'rgba(220,80,20,0.16)');
        rg.addColorStop(1, 'rgba(220,80,20,0)');
        g.globalAlpha = 1;
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // gumpalan asap melintang berlapis
    for (let i = 0; i < 90; i++) {
        const y = 220 + Math.random() * 230;
        g.globalAlpha = 0.05 + Math.random() * 0.08;
        g.fillStyle = Math.random() < 0.5 ? '#000000' : '#7a3a1a';
        g.beginPath();
        g.ellipse(Math.random() * 1024, y, 60 + Math.random() * 260, 6 + Math.random() * 16, 0, 0, Math.PI * 2);
        g.fill();
    }
    g.globalAlpha = 1;

    // Kubah + bulan + halo dikumpulkan dalam satu Group yang MENGIKUTI player
    // (decor.js): di peta campaign yang membentang ~7000 unit, kubah beradius
    // 3000 berpusat di origin akan ditinggalkan player — grup ini mencegahnya.
    const skyDome = new THREE.Group();
    scene.add(skyDome);
    setSkyDome(skyDome);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(3000, 32, 20),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })
    );
    skyDome.add(sky);

    // Bulan berkawah yang terselubung asap + halo gradien radial aditif
    const moonTex = makeTexture(128, 128, (g2, w, h) => {
        g2.fillStyle = '#ffb066'; g2.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
            const r = 3 + Math.random() * 10, x = Math.random() * w, y = Math.random() * h;
            const rg = g2.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
            rg.addColorStop(0, 'rgba(150,80,40,0.35)');
            rg.addColorStop(0.8, 'rgba(120,60,30,0.25)');
            rg.addColorStop(1, 'rgba(120,60,30,0)');
            g2.fillStyle = rg;
            g2.beginPath(); g2.arc(x, y, r, 0, Math.PI * 2); g2.fill();
        }
    });
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(60, 24, 24),
        new THREE.MeshBasicMaterial({ map: moonTex, fog: false, toneMapped: false })
    );
    moon.position.set(-700, 320, -1100);
    skyDome.add(moon);
    const haloTex = makeTexture(128, 128, (gg) => {
        const rg = gg.createRadialGradient(64, 64, 8, 64, 64, 62);
        rg.addColorStop(0, 'rgba(255,120,40,0.5)');
        rg.addColorStop(0.5, 'rgba(255,90,30,0.18)');
        rg.addColorStop(1, 'rgba(255,90,30,0)');
        gg.fillStyle = rg; gg.fillRect(0, 0, 128, 128);
    });
    const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(560, 560),
        new THREE.MeshBasicMaterial({
            map: haloTex, transparent: true, fog: false, depthWrite: false,
            blending: THREE.AdditiveBlending, toneMapped: false
        })
    );
    halo.position.copy(moon.position);
    halo.lookAt(0, 100, 0);   // menghadap arena
    skyDome.add(halo);
}

export function createEmbers(scene) {
    // Dua lapis partikel: bara terang (aditif) + abu redup — titik bundar bertekstur radial
    const dotTex = makeTexture(32, 32, (g) => {
        const rg = g.createRadialGradient(16, 16, 1, 16, 16, 15);
        rg.addColorStop(0, 'rgba(255,255,255,1)');
        rg.addColorStop(0.5, 'rgba(255,255,255,0.4)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    });
    const mkLayer = (N, size, color, opacity, blending, rise, sway) => {
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 700;
            pos[i * 3 + 1] = Math.random() * 220;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 700;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({
            color, size, map: dotTex, transparent: true, opacity,
            fog: true, depthWrite: false, blending
        }));
        pts.frustumCulled = false;
        scene.add(pts);
        emberLayers.push({ pts, rise, sway });
    };
    mkLayer(240, 2.4, 0xff7b2e, 0.8, THREE.AdditiveBlending, 9, 3);   // bara menyala
    mkLayer(200, 1.6, 0x8a7566, 0.32, THREE.NormalBlending, 5, 5);    // abu melayang
}

// Sembunyikan/tampilkan bara & abu (dipakai intro cutscene 2026-07-18: latar
// KOTA yang tenang, TANPA percikan api). Aman dipanggil sebelum layer dibuat.
export function setEmbersVisible(v) {
    for (const L of emberLayers) L.pts.visible = !!v;
}

export function updateEmbers(dt, T, camera) {
    // Partikel hidup di KOORDINAT DUNIA ABSOLUT (top-down 2026-07-11: dulu
    // seluruh gugus di-set ke camera.position tiap frame -> ikut bergeser kaku
    // seperti "salju" menempel pada player; di top-down ini terlihat salah).
    // Kini `pts.position` tetap (0,0,0) dan tiap partikel dibungkus TOROIDAL di
    // jendela ±350 sekitar player: hanya yang keluar jendela yang dilompatkan
    // satu periode (700) — sisanya DIAM di dunia (drift naik + goyang angin),
    // jadi bara/abu terasa bagian dari dunia, bukan mengikuti player.
    const cx = camera.position.x, cz = camera.position.z;
    for (const L of emberLayers) {
        const p = L.pts.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) {
            p[i] += Math.sin(T * 0.6 + i * 0.35) * dt * L.sway;   // goyangan angin
            p[i + 1] += dt * L.rise;                              // melayang naik
            if (p[i + 1] > 220) p[i + 1] = 0;                     // wrap vertikal
            // Bungkus x/z ke [c-350, c+350) dalam satu langkah (aman utk lompat
            // besar seperti transisi stage ~26 km): identitas utk partikel yang
            // sudah di dalam jendela (tanpa drift semu saat kamera diam).
            p[i] = cx + (((p[i] - cx + 350) % 700 + 700) % 700) - 350;
            p[i + 2] = cz + (((p[i + 2] - cz + 350) % 700 + 700) % 700) - 350;
        }
        L.pts.geometry.attributes.position.needsUpdate = true;
    }
}
