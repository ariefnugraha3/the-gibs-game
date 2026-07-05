// WebGL: scene THREE tunggal, kamera (= badan player), renderer, rantai
// post-processing, dan tier kualitas grafis pilihan player.

// Ekspor live-binding: modul lain mengimpor { scene, camera, renderer } dan
// selalu melihat instance terkini (dibuat sekali di initRenderer).
export let scene = null;
export let camera = null;
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

export function initRenderer() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x3a241a, 220, 1700);   // Kabut asap apokaliptik (warna = horizon)

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 4000);

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
        composer.addPass(new THREE.RenderPass(scene, camera));
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
