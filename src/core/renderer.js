// WebGL: scene THREE tunggal, kamera (= badan player), renderer, rantai
// post-processing, dan tier kualitas grafis pilihan player.

// activeScene dibaca DI DALAM followViewCam (hook opsional `camBounds` —
// batas arena kamera duel boss stage 4). sceneManager bebas-impor -> tanpa
// siklus; live binding dibaca dalam fungsi sesuai konvensi proyek.
import { activeScene } from './sceneManager.js';

// Ekspor live-binding: modul lain mengimpor { scene, camera, renderer } dan
// selalu melihat instance terkini (dibuat sekali di initRenderer).
//
// ===== PIVOT TOP-DOWN (pivot 2026-07-11: FPS -> top-down ala Alien Shooter) =====
// `camera` TIDAK lagi merender: ia jadi PIVOT LOGIKA PLAYER — posisinya = titik
// setinggi mata player (kaki + eyeHCur, semantik lama utuh) dan yaw-nya = arah
// BIDIK ke kursor (di-set input.updateTopdownAim tiap frame). Seluruh logika
// lama (robot menarget camera.position, peluru/granat/melee memakai
// camera.getWorldDirection, radar, jarak pickup, tabrakan scene) tetap benar
// TANPA disentuh. Yang merender ke layar adalah `viewCam` — kamera top-down
// yang membuntuti pivot dari ofset tinggi (followViewCam).
export let scene = null;
export let camera = null;      // pivot logika player (bukan kamera render!)
export let viewCam = null;     // kamera render top-down (mengikuti pivot)
export let renderer = null;
export let composer = null, fxaaPass = null, bloomPass = null;
export let postFxOn = true;   // false di tier kualitas terendah -> render langsung tanpa composer
export let qualityTier = 0;

// Tier kualitas 0..4: DIPILIH PLAYER di layar mulai (baris tombol #qualityRow,
// hanya sebelum game pertama dimulai), tersimpan di localStorage 'gibsQuality'.
// Hanya memakai knob yang AMAN diubah saat runtime tanpa recompile shader:
// pixel ratio, ukuran shadow map, pass bloom, dan on/off seluruh composer.
// (Pengecualian: shadow 0 = castShadow off — recompile SEKALI, aman karena
// tier terkunci di layar mulai.)
export const QUALITY = [
    { pr: Math.min(window.devicePixelRatio, 2), shadow: 2048, bloom: true, post: true },     // 0 Ultra
    { pr: Math.min(window.devicePixelRatio, 1.5), shadow: 1024, bloom: true, post: true },   // 1 High
    { pr: 1, shadow: 1024, bloom: false, post: true },                                       // 2 Medium
    { pr: 0.8, shadow: 512, bloom: false, post: false },                                     // 3 Low
    { pr: 0.6, shadow: 0, bloom: false, post: false }                                        // 4 Very Low (tanpa bayangan)
];

// dirLight milik world/lighting.js; applyQuality butuh menyentuh shadow-nya.
// Di-inject lewat setQualityLightRef agar tidak ada import silang world<->core.
let dirLightRef = null;
export function setQualityLightRef(l) { dirLightRef = l; }

// ----- Kamera top-down: ofset dari pivot player — tinggi + mundur ke selatan
// layar, pitch ~49° -> kesan "dari pojok atas ruangan" ala Alien Shooter.
// (Nilai visual murni -> konstanta kode, bukan CFG.) followViewCam dipanggil
// tiap frame SETELAH updateGame (posisi pivot terbaru), + sekali di startGame
// sebelum frame pertama supaya matrix viewCam valid utk raycast bidik.
// Didekatkan bertahap atas permintaan user (185/100 -> 161/87 -> 146/79 ->
// 130/82) 2026-07-11; sudut lalu diturunkan lagi ~15% ke 116/100: JARAK dijaga
// ~154 unit (y turun, z naik) sehingga hanya sudutnya melandai (bukan zoom) —
// pitch ~57,8° -> ~49,2°, pandangan lebih menyamping/rendah (permintaan user).
// AZIMUTH default BARAT DAYA (2026-07-16): ofset horizontal dibagi rata x=-z
// (barat + selatan) → kamera memandang dari POJOK BARAT DAYA (ke timur laut).
// CAM_OFF = ofset AKTIF (MUTABLE) — bisa DI-OVERRIDE PER-SCENE: sebuah scene boleh
// punya properti `camOffset {x,y,z}` (mis. STAGE 3 memandang dari BARAT LAUT / NW
// ke tenggara / SE, 2026-07-21). `applySceneCamOffset` (di followViewCam tiap
// frame) menerapkan override scene aktif atau memulihkan default utk scene lain,
// sekaligus memutakhirkan basis layar SCREEN_UP/LEFT. Jarak horizontal (~100) &
// tinggi (116) dijaga agar pitch/zoom tetap — hanya arah pandang yang berputar. --
const CAM_OFF_DEFAULT = { x: -70.7, y: 116, z: 70.7 };   // barat daya (memandang timur laut)
const CAM_OFF = { x: -70.7, y: 116, z: 70.7 };           // AKTIF (di-set dari scene)

// Basis LAYAR di bidang tanah (dunia), diturunkan dari azimuth CAM_OFF AKTIF: arah
// "atas layar" (SCREEN_UP = arah pandang horizontal kamera) & "kiri layar"
// (SCREEN_LEFT). Dipakai gerak WASD & dodge (player.js) + radar (hud.js) agar tetap
// RELATIF LAYAR walau kamera dimiringkan. OBJEK di-MUTASI in-place saat azimuth
// berganti (importir memegang referensi objek yang sama → ikut ter-update).
export const SCREEN_UP = { x: 0, z: 0 };
export const SCREEN_LEFT = { x: 0, z: 0 };
function recomputeScreenBasis() {
    const h = Math.hypot(CAM_OFF.x, CAM_OFF.z) || 1;
    SCREEN_UP.x = -CAM_OFF.x / h; SCREEN_UP.z = -CAM_OFF.z / h;
    SCREEN_LEFT.x = SCREEN_UP.z; SCREEN_LEFT.z = -SCREEN_UP.x;
}
recomputeScreenBasis();
// Terapkan azimuth kamera dari override scene aktif (`activeScene.camOffset`) atau
// default; hitung ulang HANYA saat berubah (dipanggil tiap frame di followViewCam).
function applySceneCamOffset() {
    const w = (activeScene && activeScene.camOffset) || CAM_OFF_DEFAULT;
    if (w.x === CAM_OFF.x && w.y === CAM_OFF.y && w.z === CAM_OFF.z) return;
    CAM_OFF.x = w.x; CAM_OFF.y = w.y; CAM_OFF.z = w.z;
    recomputeScreenBasis();
}

// ----- Dead-zone kamera (toleransi gerak 2026-07-11): kamera TIDAK center
// tepat di player. Ia mengejar sebuah titik fokus `camFocus` (di bidang tanah)
// yang hanya bergeser saat pivot player keluar dari kotak toleransi — setengah
// lebar `DEAD_X` (sumbu-x dunia = kiri/kanan layar) & `DEAD_Z` (sumbu-z dunia =
// atas/bawah layar). Gerak kecil di dalam kotak tidak menggerakkan kamera
// (menghilangkan efek pusing). Sumbu-y (vertikal) selalu diikuti tanpa
// toleransi karena player nyaris selalu menapak tanah. Nilai bisa di-tuning di
// sini. Sejak 2026-07-16 (permintaan user) DEAD_X DIKECILKAN agar SAMA dengan
// DEAD_Z — kotak toleransi kini persegi (gerak horizontal & vertikal punya
// toleransi setara), lebih cocok dengan kamera diagonal barat daya. -----
const DEAD_X = 16, DEAD_Z = 16;
const camFocus = new THREE.Vector3();
let camFocusReady = false;
// Re-center saat BERHENTI (2026-07-16, permintaan user): selagi bergerak dead-zone
// membiarkan player di TEPI kotak; begitu player berhenti, fokus di-EASE kembali
// ke player supaya ia kembali ke TENGAH layar. Halus (bukan snap) agar tak bikin
// pusing: smoothing eksponensial berbasis dt, laju RECENTER_RATE per detik.
// _prevPX/_prevPZ = posisi pivot frame lalu (deteksi gerak); MOVE_EPS2 = ambang
// jarak² per frame utk membedakan "diam" (≈0) dari "jalan" (≥~0.5 unit/frame).
let _prevPX = 0, _prevPZ = 0;
const RECENTER_RATE = 3, MOVE_EPS2 = 0.01;
// Debug/uji: posisi titik fokus kamera (dipakai tes recenter).
export const camFocusPos = () => ({ x: camFocus.x, y: camFocus.y, z: camFocus.z });

// ----- Guncangan kamera (screen shake, 2026-07-13): dipakai untuk momen
// sinematik seperti runtuhnya Monas. addCamShake(a) menaikkan amplitudo (unit
// dunia), diterapkan sebagai jitter posisi viewCam lalu meluruh tiap frame.
// resetCamShake() dipanggil saat reset run. -----
let camShake = 0;
export function addCamShake(a) { camShake = Math.max(camShake, a); }
export function resetCamShake() { camShake = 0; }

// ----- PAN SINEMATIK (2026-07-17, cutscene heli stage 4): scene men-set titik
// fokus override via setCineFocus(x, z) — followViewCam meng-EASE camFocus ke
// sana (menggantikan dead-zone/recenter; pan halus "perlahan"), tanpa snap
// >400. setCineFocus(null) mengembalikan kamera ke mode normal (fokus kembali
// mengejar pivot player). -----
const CINE_PAN_RATE = 1.5;   // laju ease eksponensial pan sinematik (per detik)
let cineFocus = null;
export function setCineFocus(x, z) { cineFocus = (x == null) ? null : { x, z }; }

// ----- BATAS ARENA KAMERA (2026-07-17): hook scene opsional `camBounds()`
// mengembalikan rect dunia {x0,x1,z0,z1,groundY} yang TIDAK BOLEH dilewati
// tepi tapak-pandang kamera, atau null = bebas (default). Dipakai duel boss
// alun-alun stage 4. `groundViewExtents(focusY, planeY)` memproyeksikan 4
// sudut layar viewCam ke bidang tanah y=planeY dan mengembalikan ofset
// min/maks (x,z) tapak-pandang RELATIF titik fokus — trigonometri murni dari
// CAM_OFF + target lookAt (fokus.y − 8) + fov/aspek viewCam (tanpa matriks,
// aman utk stub test; fallback fov 50 / aspek 1 bila belum ter-set). -----
export function groundViewExtents(focusY, planeY = 0) {
    // Basis kamera lookAt: E = fokus + CAM_OFF memandang T = fokus + (0,-8,0)
    const fx = -CAM_OFF.x, fy = -CAM_OFF.y - 8, fz = -CAM_OFF.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const f = { x: fx / fl, y: fy / fl, z: fz / fl };            // arah pandang
    const rh = Math.hypot(f.x, f.z) || 1;
    const r = { x: -f.z / rh, y: 0, z: f.x / rh };               // kanan layar (horizontal)
    const u = {                                                   // atas layar = cross(-f, r), disederhanakan (r.y=0)
        x: -f.y * r.z, y: f.x * r.z - f.z * r.x, z: f.y * r.x
    };
    const half = ((viewCam && viewCam.fov ? viewCam.fov : 50) * Math.PI / 180) / 2;
    const ty = Math.tan(half);
    const tx = ty * (viewCam && viewCam.aspect ? viewCam.aspect : 1);
    const eyeH = focusY + CAM_OFF.y - planeY;                     // tinggi mata di atas bidang
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0, got = false;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const dx = f.x + r.x * tx * sx + u.x * ty * sy;
        const dy = f.y + u.y * ty * sy;                           // r.y = 0
        const dz = f.z + r.z * tx * sx + u.z * ty * sy;
        if (dy >= -1e-4) continue;                                // sinar nyaris datar/naik: abaikan
        const t = -eyeH / dy;
        const ox = CAM_OFF.x + dx * t, oz = CAM_OFF.z + dz * t;
        if (!got) { minX = maxX = ox; minZ = maxZ = oz; got = true; }
        else {
            if (ox < minX) minX = ox; else if (ox > maxX) maxX = ox;
            if (oz < minZ) minZ = oz; else if (oz > maxZ) maxZ = oz;
        }
    }
    return { minX, maxX, minZ, maxZ };
}

// Jepit v ke [lo, hi]; bila rect lebih sempit dari tapak (lo > hi) ambil tengah.
function clampCentered(v, lo, hi) {
    if (lo > hi) return (lo + hi) / 2;
    return v < lo ? lo : v > hi ? hi : v;
}

export function followViewCam(dt = 0) {
    if (!viewCam || !camera) return;
    applySceneCamOffset();   // azimuth kamera per-scene (mis. stage 3 = barat laut) + basis layar
    const p = camera.position;
    // Inisialisasi / snap saat lompat besar (spawn, ganti scene, restart):
    // pusatkan langsung supaya tidak ada pan panjang dari posisi lama.
    if (!camFocusReady || (!cineFocus && (Math.abs(p.x - camFocus.x) > 400 || Math.abs(p.z - camFocus.z) > 400))) {
        camFocus.set(p.x, p.y, p.z);
        camFocusReady = true;
        _prevPX = p.x; _prevPZ = p.z;
    }
    // Deteksi gerak dari perpindahan pivot sejak frame lalu.
    const movedSq = (p.x - _prevPX) * (p.x - _prevPX) + (p.z - _prevPZ) * (p.z - _prevPZ);
    _prevPX = p.x; _prevPZ = p.z;
    if (cineFocus) {
        // PAN SINEMATIK: ease halus menuju titik override (abaikan dead-zone;
        // pan panjang tidak memicu snap karena guard di atas).
        const kc = 1 - Math.exp(-CINE_PAN_RATE * dt);
        camFocus.x += (cineFocus.x - camFocus.x) * kc;
        camFocus.z += (cineFocus.z - camFocus.z) * kc;
    } else if (movedSq > MOVE_EPS2) {
        // BERGERAK: dead-zone — geser fokus HANYA saat pivot melewati tepi kotak,
        // lalu dijepit tepat di tepi (player "mendorong" kamera dari batas kotak).
        const dx = p.x - camFocus.x;
        if (dx > DEAD_X) camFocus.x = p.x - DEAD_X;
        else if (dx < -DEAD_X) camFocus.x = p.x + DEAD_X;
        const dz = p.z - camFocus.z;
        if (dz > DEAD_Z) camFocus.z = p.z - DEAD_Z;
        else if (dz < -DEAD_Z) camFocus.z = p.z + DEAD_Z;
    } else {
        // BERHENTI: ease fokus kembali ke player (recenter) — halus, dt-based.
        const k = 1 - Math.exp(-RECENTER_RATE * dt);
        camFocus.x += (p.x - camFocus.x) * k;
        camFocus.z += (p.z - camFocus.z) * k;
    }
    camFocus.y = p.y;   // vertikal: ikut penuh (tanpa dead-zone)

    // BATAS ARENA (2026-07-17, hook scene opsional): jepit fokus supaya tapak-
    // pandang (proyeksi 4 sudut layar ke tanah) tak melewati rect `camBounds()`
    // — dipakai duel boss alun-alun stage 4; scene tanpa hook = bebas. Berlaku
    // juga setelah snap (blok ini di bawah kedua cabang dead-zone/recenter).
    const cb = activeScene && activeScene.camBounds ? activeScene.camBounds() : null;
    if (cb) {
        const e = groundViewExtents(camFocus.y, cb.groundY || 0);
        camFocus.x = clampCentered(camFocus.x, cb.x0 - e.minX, cb.x1 - e.maxX);
        camFocus.z = clampCentered(camFocus.z, cb.z0 - e.minZ, cb.z1 - e.maxZ);
    }

    viewCam.position.set(camFocus.x + CAM_OFF.x, camFocus.y + CAM_OFF.y, camFocus.z + CAM_OFF.z);
    // Target sedikit di bawah titik fokus -> lebih banyak dunia terlihat ke atas layar.
    viewCam.lookAt(camFocus.x, camFocus.y - 8, camFocus.z);
    // Guncangan sinematik: jitter posisi acak yang meluruh (Monas runtuh).
    if (camShake > 0.05) {
        viewCam.position.x += (Math.random() - 0.5) * camShake;
        viewCam.position.y += (Math.random() - 0.5) * camShake;
        viewCam.position.z += (Math.random() - 0.5) * camShake;
        camShake *= 0.86;
    } else camShake = 0;
    viewCam.updateMatrixWorld();
}

export function initRenderer() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x3a241a, 220, 1700);   // Kabut asap apokaliptik (warna = horizon)

    // Pivot logika player (FOV/aspek tak dipakai utk render — hanya transform)
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 4000);
    // Kamera render top-down: FOV lebih sempit = distorsi perspektif rendah.
    // Dimasukkan ke scene agar anak-anaknya (grup warmup preload) ikut dirender.
    viewCam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 4000);
    scene.add(viewCam);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // batasi beban GPU
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;             // warna akurat (gamma-correct)
    renderer.toneMapping = THREE.ACESFilmicToneMapping;       // rentang dinamis sinematik
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;                        // bayangan real-time
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // ----- Post-processing: RenderPass -> UnrealBloom -> GammaCorrection -> FXAA -----
    // Bila salah satu script CDN gagal dimuat, composer tetap null -> render langsung.
    if (THREE.EffectComposer && THREE.RenderPass && THREE.ShaderPass &&
        THREE.UnrealBloomPass && THREE.GammaCorrectionShader && THREE.FXAAShader) {
        composer = new THREE.EffectComposer(renderer);
        composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        composer.setSize(window.innerWidth, window.innerHeight);
        composer.addPass(new THREE.RenderPass(scene, viewCam));   // render dari kamera top-down
        bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 0.72);
        composer.addPass(bloomPass);
        composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader)); // RT linear -> sRGB
        fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
        composer.addPass(fxaaPass);
        setFxaaRes();
    } else {
        console.warn('[postfx] Script post-processing CDN tidak termuat — render tanpa bloom.');
    }

    window.addEventListener('resize', onResize, false);
}

export function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    viewCam.aspect = window.innerWidth / window.innerHeight;
    viewCam.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    setFxaaRes();
}

// Resolusi FXAA harus di-update tiap ganti ukuran (uniform 1/pixel)
export function setFxaaRes() {
    if (!fxaaPass) return;
    const pr = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.set(
        1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
}

// ----- Kualitas grafis (dipilih player di layar mulai) -----
export function applyQuality(t) {
    qualityTier = t;
    const q = QUALITY[t];
    renderer.setPixelRatio(q.pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    // shadow 0 = bayangan dimatikan total (tier terendah). Toggle castShadow
    // memicu recompile shader SEKALI — aman, karena tier hanya bisa diganti
    // di layar mulai (bukan di tengah permainan; r128 menangani pergantian
    // program otomatis lewat lights-state hash).
    if (dirLightRef) {
        dirLightRef.castShadow = q.shadow > 0;
        if (q.shadow > 0 && dirLightRef.shadow.mapSize.x !== q.shadow) {
            dirLightRef.shadow.mapSize.set(q.shadow, q.shadow);
            // buang RT lama; Three.js membuat ulang otomatis di render berikutnya
            if (dirLightRef.shadow.map) { dirLightRef.shadow.map.dispose(); dirLightRef.shadow.map = null; }
        }
    }
    if (bloomPass) bloomPass.enabled = q.bloom;
    postFxOn = q.post;
    if (composer) {
        composer.setPixelRatio(q.pr);
        composer.setSize(window.innerWidth, window.innerHeight);
    }
    setFxaaRes();
    console.info('[perf] kualitas grafis: tier ' + t);
}

// Baris tombol kualitas di layar mulai. Hanya bisa dipilih SEBELUM game
// pertama dimulai — disembunyikan permanen begitu pointer lock pertama
// didapat (pointerlockchange di input.js).
export function initQualityUI() {
    const row = document.getElementById('qualityRow');
    const btns = row.querySelectorAll('.qbtn');
    // Default: pilihan tersimpan; kalau belum ada, tebak dari perangkat
    // (RAM kecil / core sedikit -> mulai di High, selebihnya Ultra).
    const saved = parseInt(localStorage.getItem('gibsQuality'), 10);
    const weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const pick = (t) => {
        applyQuality(t);
        localStorage.setItem('gibsQuality', t);
        btns.forEach(b => b.classList.toggle('active', +b.dataset.q === t));
    };
    btns.forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();   // jangan ikut memicu klik blocker (mulai game)
        pick(+b.dataset.q);
    }));
    pick(saved >= 0 && saved < QUALITY.length ? saved : (weak ? 1 : 0));
}
