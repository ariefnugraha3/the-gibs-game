// WebGL: scene THREE tunggal, kamera (= badan player), renderer, rantai
// post-processing, dan tier kualitas grafis pilihan player.

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
// AZIMUTH diputar ke BARAT DAYA (2026-07-16, permintaan user): dulu ofset
// horizontal murni +z (kamera tepat di SELATAN, memandang lurus ke utara);
// kini dibagi rata x=-z (barat + selatan) sehingga kamera memandang dari POJOK
// BARAT DAYA secara diagonal. Jarak horizontal (~100) & tinggi (116) DIJAGA
// supaya pitch/zoom tak berubah — hanya arah pandangnya yang berputar 45°. -----
const CAM_OFF = { x: -70.7, y: 116, z: 70.7 };

// Basis LAYAR di bidang tanah (dunia), diturunkan dari azimuth CAM_OFF: arah
// "atas layar" (SCREEN_UP = arah pandang horizontal kamera) & "kiri layar"
// (SCREEN_LEFT). Dipakai gerak WASD & dodge (player.js) agar tetap RELATIF LAYAR
// walau kamera dimiringkan ke barat daya (W tetap = naik di layar). Dengan
// kamera barat daya, SCREEN_UP menunjuk ke timur laut dunia.
const _camH = Math.hypot(CAM_OFF.x, CAM_OFF.z) || 1;
export const SCREEN_UP = { x: -CAM_OFF.x / _camH, z: -CAM_OFF.z / _camH };
export const SCREEN_LEFT = { x: SCREEN_UP.z, z: -SCREEN_UP.x };

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

export function followViewCam(dt = 0) {
    if (!viewCam || !camera) return;
    const p = camera.position;
    // Inisialisasi / snap saat lompat besar (spawn, ganti scene, restart):
    // pusatkan langsung supaya tidak ada pan panjang dari posisi lama.
    if (!camFocusReady || Math.abs(p.x - camFocus.x) > 400 || Math.abs(p.z - camFocus.z) > 400) {
        camFocus.set(p.x, p.y, p.z);
        camFocusReady = true;
        _prevPX = p.x; _prevPZ = p.z;
    }
    // Deteksi gerak dari perpindahan pivot sejak frame lalu.
    const movedSq = (p.x - _prevPX) * (p.x - _prevPX) + (p.z - _prevPZ) * (p.z - _prevPZ);
    _prevPX = p.x; _prevPZ = p.z;
    if (movedSq > MOVE_EPS2) {
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
