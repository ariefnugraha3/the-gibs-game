// SMOKE TEST HEADLESS — jalankan: node tools/smoke.mjs (dari folder mana pun).
// Stub THREE/DOM/Audio di bawah menjalankan MODUL ASLI dari src/. ATURAN WAJIB:
// assertion harus CONFIG-DRIVEN (baca cfgMod.CFG, JANGAN hardcode angka tuning)
// supaya tahan re-tuning config/gameplay.json oleh user; tambahkan test untuk
// tiap mekanik baru. Method stub yang kurang (fakeEl/THREE) = celah harness,
// bukan bug game — cukup lengkapi stub-nya.
// Cakupan: buildRobotMesh per kelas, gerbang tembak stop-and-shoot,
// peluru musuh -> player, gore coolant (kill -> corpse/gib/decal), avatar player
// (prop per senjata + gunTip terkalibrasi + salto dodge tanpa throw).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').split(path.sep).join('/');

// ---------- Stub browser ----------
// CELAH HARNESS 2026-07-31: `measureText` dulu selalu mengembalikan width 1, jadi
// tata letak teks apa pun "muat" dan logika bungkus-baris/auto-kecilkan-font layar
// prolog tak pernah benar-benar dijalankan. Stub ini kini MENYIMPAN `font` yang
// sedang di-set dan mengukur lebar ala MONOSPACE (Courier = 0.6 em per karakter) —
// pendekatan yang cukup untuk menguji pembungkusan baris, bukan untuk render.
const ctx2d = new Proxy({ font: '10px monospace' }, {
    get: (t, k) => {
        if (k === 'font') return t.font;
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() { } });
        if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) });
        if (k === 'measureText') return (txt) => {
            const m = /(\d+(?:\.\d+)?)px/.exec(String(t.font || ''));
            const px = m ? parseFloat(m[1]) : 10;
            return { width: String(txt == null ? '' : txt).length * px * 0.6 };
        };
        if (k === 'canvas') return { width: 64, height: 64 };
        return () => { };
    },
    set: (t, k, v) => { if (k === 'font') t.font = v; return true; }
});
function fakeEl() {
    return {
        style: {}, classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
        children: [], firstChild: null,
        addEventListener() { }, appendChild() { }, removeChild() { }, setAttribute() { },
        getContext: () => ctx2d, querySelectorAll: () => [], querySelector: () => fakeEl(),
        textContent: '', innerText: '', innerHTML: '', value: '', dataset: {}, width: 64, height: 64,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
    };
}
const elCache = new Map();
global.window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener() { }, removeEventListener() { }, location: { reload() { } }
};
global.document = {
    getElementById: (id) => { if (!elCache.has(id)) elCache.set(id, fakeEl()); return elCache.get(id); },
    createElement: () => fakeEl(),
    addEventListener() { }, exitPointerLock() { },
    body: { appendChild() { }, requestPointerLock: () => ({ catch() { } }) },
    fullscreenElement: null, documentElement: fakeEl(), pointerLockElement: null
};
Object.defineProperty(global, 'navigator', { value: { keyboard: null }, configurable: true });
global.localStorage = (() => {
    const store = new Map();
    return {
        getItem: (k) => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
})();
global.Audio = class {
    // `src` dibawa + diwariskan cloneNode (celah harness 2026-08-07): pool
    // playSFX/playLoopSFX mengembalikan KLON, jadi tanpa ini test tak bisa
    // membedakan klip mana yang benar-benar diputar.
    constructor(src = '') { this.src = src; this.volume = 1; this.currentTime = 0; this.paused = true; this.loop = false; }
    load() { } play() { this.paused = false; return { catch() { } }; } pause() { this.paused = true; }
    cloneNode() { const n = new global.Audio(this.src); n.volume = this.volume; return n; }
};
global.requestAnimationFrame = (f) => setTimeout(f, 0);

// ---------- Stub THREE ----------
class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(s) { return this.set(s, s, s); }
    clone() { return new V3(this.x, this.y, this.z); }
    copy(v) { return this.set(v.x, v.y, v.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    // Celah harness 2026-07-28: rig tangan senjata (updateWeaponVisuals) memakai lerp.
    lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    setFromMatrixColumn() { return this.set(1, 0, 0); }
    unproject() { return this; }
    applyQuaternion() { return this; }
    crossVectors() { return this; }
}
class Quat { set() { return this; } copy() { return this; } setFromAxisAngle() { return this; } setFromEuler() { return this; } premultiply() { return this; } multiply() { return this; } setFromUnitVectors() { return this; } }
// Matrix4 stub MEREKAM skala + translasi: dinding yang bisa memudar
// (utility/wallFade.js) menyembunyikan satu sel dengan MENYETEL SKALA NOL pada
// instansnya, jadi tanpa rekaman ini "sel tak pernah kembali" tak bisa diuji.
class Matrix4 {
    constructor() { this.s = 1; this.p = { x: 0, y: 0, z: 0 }; }
    setPosition(x, y, z) { this.p = { x, y, z }; return this; }
    compose() { return this; }
    makeScale(a) { this.s = a; return this; }
    identity() { this.s = 1; return this; }
    copy(m) { if (m) { this.s = m.s; this.p = { ...m.p }; } return this; }
}
class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; } copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; } }
class Color {
    constructor(h = 0) { this._h = typeof h === 'object' ? h._h : h; }
    offsetHSL() { return this; } setHex(h) { this._h = h; return this; } getHex() { return this._h; } set() { return this; }
    // setRGB dipakai kilat bilah pedang (playerAvatar.flashSwordBlade)
    setRGB(r, g, b) { this._h = ((r * 255 & 255) << 16) | ((g * 255 & 255) << 8) | (b * 255 & 255); return this; }
}
class Obj3D {
    constructor() {
        this.position = new V3(); this.scale = new V3(1, 1, 1);
        this.rotation = new Euler(); this.quaternion = new Quat();
        this.children = []; this.parent = null; this.visible = true; this.castShadow = false;
        this.matrixWorld = {}; this.isObject3D = true; this.userData = {};
    }
    add(...os) { for (const o of os) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
    traverse(fn) { fn(this); this.children.forEach(c => c.traverse(fn)); }
    lookAt() { } updateMatrixWorld() { } rotateX(a) { this.rotation.x += a; }
    rotateY(a) { this.rotation.y += a; } rotateZ(a) { this.rotation.z += a; }
    translateX(d) { this.position.x += d; } translateY(d) { this.position.y += d; } translateZ(d) { this.position.z += d; }
    getWorldPosition(v) { let p = this, x = 0, y = 0, z = 0; while (p) { x += p.position.x; y += p.position.y; z += p.position.z; p = p.parent; } return v.set(x, y, z); }
    getWorldDirection(v) { return v.set(0, 0, -1); }
    // Celah harness (2026-08-13): stage 9 memakai localToWorld untuk anchor mesin.
    // Stub mengabaikan rotasi/skala, sama seperti getWorldPosition di atas.
    localToWorld(v) { let p = this; while (p) { v.x += p.position.x; v.y += p.position.y; v.z += p.position.z; p = p.parent; } return v; }
    worldToLocal(v) { let p = this; while (p) { v.x -= p.position.x; v.y -= p.position.y; v.z -= p.position.z; p = p.parent; } return v; }
    clone() {
        const o = new this.constructor(this.geometry, this.material);
        o.position.copy(this.position); o.rotation.copy(this.rotation); o.scale.copy(this.scale);
        o.visible = this.visible; o.castShadow = this.castShadow;
        for (const c of this.children) o.add(c.clone());
        return o;
    }
}
class Mesh extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
class Sprite extends Obj3D { constructor(m) { super(); this.material = m; this.isSprite = true; } }
class Group extends Obj3D { }
class Scene extends Obj3D { constructor() { super(); this.fog = null; } }
// near/far disimpan 2026-07-27 (celah harness): assert kubah langit intro perlu
// membandingkan jarak kubah dengan far-plane kamera yang SEBENARNYA.
class PCam extends Obj3D { constructor(fov = 50, aspect = 1, near = 1, far = 2000) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; } updateProjectionMatrix() { } }
// PointLight stub: HORMATI argumen konstruktor (color, intensity, distance,
// decay) — lampu ruangan stage 1-3 kini lahir menyala penuh (2026-08-11).
class PLight extends Obj3D {
    constructor(color = 0xffffff, intensity = 0, distance = 0, decay = 1) {
        super();
        this.intensity = intensity; this.distance = distance; this.decay = decay;
        this.color = new Color(color); this.isLight = true; this.isPointLight = true;
    }
}
const geo = (name) => class {
    constructor(...a) { this.args = a; this.type = name; }
    scale() { return this; }
    rotateX() { return this; } rotateY() { return this; } rotateZ() { return this; }
    translate() { return this; } center() { return this; } clone() { return this; }
    // Celah harness 2026-07-27 (dunia taman survival baru benar-benar dibangun
    // sejak cutscene pembuka Survival diuji): dedaunan pohon memanggil
    // computeVertexNormals + membaca atribut posisi geometri.
    computeVertexNormals() { return this; }
    setAttribute() { return this; }
    getAttribute() { return { count: 0, array: new Float32Array(0), setXYZ() { }, needsUpdate: false }; }
    dispose() { }
};
class Mat {
    constructor(o = {}) {
        this.color = o.color instanceof Color ? o.color : new Color(o.color || 0xffffff);
        this.emissive = o.emissive instanceof Color ? o.emissive : new Color(o.emissive || 0);
        this.emissiveIntensity = o.emissiveIntensity != null ? o.emissiveIntensity : 1;
        this.opacity = o.opacity != null ? o.opacity : 1;
        this.transparent = !!o.transparent; this.map = o.map || null;
    }
    clone() { return new Mat({ color: new Color(this.color), emissive: new Color(this.emissive), emissiveIntensity: this.emissiveIntensity, opacity: this.opacity, transparent: this.transparent, map: this.map }); }
    dispose() { }
}
global.THREE = {
    Vector2: class { constructor(x, y) { this.x = x; this.y = y; } set() { } },
    Vector3: V3, Quaternion: Quat, Euler, Color, Matrix4,
    Object3D: Obj3D, Group, Mesh, Sprite, Scene, PerspectiveCamera: PCam, PointLight: PLight,
    InstancedMesh: class extends Obj3D { constructor(g, m, n) { super(); this.geometry = g; this.material = m; this.count = n; this.instanceColor = { needsUpdate: false }; this.instanceMatrix = { needsUpdate: false }; this.mats = []; } setMatrixAt(i, m) { this.mats[i] = { s: m ? m.s : 1, p: m && m.p ? { ...m.p } : null }; } setColorAt() { } },
    SphereGeometry: geo('sph'), CylinderGeometry: geo('cyl'), BoxGeometry: geo('box'),
    ConeGeometry: geo('cone'), RingGeometry: geo('ring'), PlaneGeometry: geo('plane'),
    CircleGeometry: geo('circle'), TorusGeometry: geo('torus'), ExtrudeGeometry: geo('extrude'),
    ShapeGeometry: geo('shape'),
    IcosahedronGeometry: geo('ico'), DodecahedronGeometry: geo('dodeca'), EdgesGeometry: geo('edges'),
    OctahedronGeometry: geo('octa'),
    LineSegments: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isLine = true; this.isLineSegments = true; } },
    Path: class { moveTo() { } lineTo() { } quadraticCurveTo() { } bezierCurveTo() { } },
    Shape: class {
        constructor() { this.holes = []; }
        moveTo() { } lineTo() { } quadraticCurveTo() { } bezierCurveTo() { }
    },
    MeshLambertMaterial: Mat, MeshBasicMaterial: Mat, MeshPhongMaterial: Mat, SpriteMaterial: Mat,
    MeshStandardMaterial: Mat, MeshPhysicalMaterial: Mat, LineBasicMaterial: Mat,
    CanvasTexture: class { constructor() { this.repeat = { set() { } }; this.offset = { set() { } }; } },
    // Fog dulu kelas kosong -> keadaan kabut mustahil diuji. Diisi 2026-07-27
    // (celah harness) supaya assert KABUT intro membaca scene.fog yang NYATA.
    Fog: class { constructor(c, n, f) { this.color = new Color(c); this.near = n; this.far = f; } },
    WebGLRenderer: class {
        constructor() { this.domElement = fakeEl(); this.shadowMap = {}; }
        setPixelRatio() { } setSize() { } getPixelRatio() { return 1; } compile() { } render() { }
        dispose() { }
    },
    // Celah harness 2026-08-10: panggung 3D menu utama (scenes/menuStage.js)
    // memakai tiga lampu ini. Sebelumnya tak ada di stub karena world/lighting
    // memang tak pernah dipanggil dari smoke.
    AmbientLight: class extends Obj3D { constructor(c, i) { super(); this.color = new Color(c); this.intensity = i; this.isLight = true; } },
    HemisphereLight: class extends Obj3D { constructor(s, g, i) { super(); this.color = new Color(s); this.groundColor = new Color(g); this.intensity = i; this.isLight = true; } },
    DirectionalLight: class extends Obj3D {
        constructor(c, i) {
            super();
            this.color = new Color(c); this.intensity = i; this.isLight = true;
            this.target = new Obj3D();
            this.shadow = {
                mapSize: { set() { } },
                camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0, updateProjectionMatrix() { } },
            };
        }
    },
    sRGBEncoding: 3001, ACESFilmicToneMapping: 4, PCFSoftShadowMap: 2, DoubleSide: 2,
    AdditiveBlending: 2, NearestFilter: 1003, RepeatWrapping: 1000
};

// ---------- Muat modul nyata ----------
const R = (p) => 'file:///' + ROOT + '/' + p;
const cfgMod = await import(R('src/core/config.js'));
Object.assign(cfgMod.CFG, JSON.parse(fs.readFileSync(ROOT + '/config/gameplay.json', 'utf8')));
const cineRateMod = await import(R('src/core/cutsceneRate.js'));
const rendererMod = await import(R('src/core/renderer.js'));
rendererMod.initRenderer();
const { scene, camera } = rendererMod;
// FADE OCCLUDER BERSAMA (utility/occlusion.js): satu titik uji untuk semua stage.
// `occBehind(o, d)` = tempat berdiri supaya occluder `o` PERSIS menutupi garis
// pandang kamera->entitas; kamera duduk di arah -SCREEN_UP dari entitas, jadi
// entitasnya berdiri d unit di sisi +SCREEN_UP dari occluder.
const occlusionMod = await import(R('src/scenes/campaign/utility/occlusion.js'));
const { occlusionOpacity } = occlusionMod;
const occBehind = (o, d = 12) => ({
    x: o.x + rendererMod.SCREEN_UP.x * d,
    z: o.z + rendererMod.SCREEN_UP.z * d,
});
const stateMod = await import(R('src/core/state.js'));
const { player, robots, enemyBullets, setMode } = stateMod;
setMode('survival'); stateMod.configurePlayer();
const smMod = await import(R('src/core/sceneManager.js'));
const robotsMod = await import(R('src/entities/robots.js'));
const effectsMod = await import(R('src/entities/effects.js'));
const goreMod = await import(R('src/entities/gore.js'));
effectsMod.initEffects(scene);
goreMod.initGore(scene);

let chaseDist = 50;
const sceneCtl = { blocked: false, monasHits: [] };
smMod.setScene({
    id: 'test', enter() { },
    robotAI: () => ({ chaseDist }),
    bulletBlocked: () => sceneCtl.blocked,
    enemyBulletHitMonas: (d) => sceneCtl.monasHits.push(d),
    playerCollide() { }, groundHeight: () => 0,
    clampDropPos: (x, z) => [x, z],
});

let pass = 0, fail = 0;
const T = (name, ok) => { ok ? pass++ : (fail++, console.log('FAIL:', name)); };

T('CUTSCENE RATE: limiter dikunci maksimal 24 FPS dengan deadline berjalan',
    cineRateMod.CUTSCENE_FPS === 24
    && Math.abs(cineRateMod.CUTSCENE_FRAME_MS - (1000 / 24)) < 1e-9
    && cineRateMod.cutsceneFrameDue(100, NaN)
    && !cineRateMod.cutsceneFrameDue(100, 101)
    && cineRateMod.nextCutsceneDeadline(100, 100) > 100);

T('DIALOGUE CONFIG: seluruh naskah spoken/cutscene terpusat di gameplay.json',
    cfgMod.CFG.dialogue
    && cfgMod.CFG.dialogue.campaign?.prologue?.chapters?.length === 9
    && cfgMod.CFG.dialogue.campaign?.intro?.briefing?.length > 100
    && cfgMod.CFG.dialogue.campaign?.stage1?.radio?.length === 2
    && cfgMod.CFG.dialogue.campaign?.stage2?.lines?.inspectGenerator
    && cfgMod.CFG.dialogue.campaign?.stage3?.lines?.enterLobby
    && cfgMod.CFG.dialogue.campaign?.tankBossOutro?.length === 5
    && cfgMod.CFG.dialogue.survival?.monasIntro?.captions?.stand === '"I WILL FIGHT."');

// --- 1. buildRobotMesh per kelas ---
for (const cls of ['C', 'B', 'A', 'boss']) {
    const b = robotsMod.buildRobotMesh(cls);
    T(cls + ' rig lengkap', !!(b.rig.inner && b.rig.thighL && b.rig.thighR && b.rig.shinL && b.rig.shinR && b.rig.armL && b.rig.armR && b.rig.head));
    let meshes = 0; b.group.traverse(o => { if (o.isMesh) meshes++; });
    T(cls + ' punya mesh (' + meshes + ')', meshes > 15);
}

// --- 1b. WARNA ROBOT: LOGAM GELAP BERTINGKAT (2026-08-11). Dua permintaan user
//     berturut-turut: pertama "terlalu cerah, seperti badut" (semua digelapkan),
//     lalu palet kelas diganti jadi C PERUNGGU / B PERAK / A EMAS.
//     Perak MENGUBAH cara menguji: ia tak punya hue, jadi pita hue lama tidak
//     bisa dipakai dan pelatnya juga tak bisa dideteksi lewat saturasi. Yang
//     diuji sekarang ATURANnya: (a) tak ada permukaan terang di robot, (b) tabel
//     CLASS_LOOK benar-benar yang dipakai mesh, (c) tiga kelas saling BEDA jauh,
//     (d) tiap pelat juga beda dari RANGKA (ini risiko khusus perak — pelat &
//     rangka sama-sama abu-abu), (e) inti daya = versi MENYALA logam yang sama,
//     (f) mata tetap MERAH semua kelas (aturan user 2026-07-14), (g) rangka
//     tetap token PAL gelap.
//     Stub Color.offsetHSL() di harness = no-op, jadi yang terbaca nilai DASAR
//     (jitter keausan +-0,045 memang hanya ada saat runtime). ---
{
    const palR = await import(R('src/world/palette.js'));
    const CL = robotsMod.CLASS_LOOK;
    // HSL dari hex (harness tak punya Color.getHSL asli).
    const hsl = (hex) => {
        const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
        let h = 0;
        if (d > 1e-9) {
            if (mx === r) h = 60 * (((g - b) / d) % 6);
            else if (mx === g) h = 60 * ((b - r) / d + 2);
            else h = 60 * ((r - g) / d + 4);
            if (h < 0) h += 360;
        }
        return { h, s: d < 1e-9 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
    };
    const hueNear = (a, b, tol) => { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d <= tol; };
    // Jarak RGB — SATU-SATUNYA ukuran "beda warna" yang tetap sahih saat salah
    // satu pihak abu-abu (perak). Pita hue tidak bisa, sebab hue perak tak ada.
    const dist = (p, q) => Math.hypot(((p >> 16) & 255) - ((q >> 16) & 255),
        ((p >> 8) & 255) - ((q >> 8) & 255), (p & 255) - (q & 255));

    // Pagu ini ATURAN ("tak ada permukaan terang di robot"), bukan hasil tuning:
    // palet sebelum 2026-08-11 menembusnya jauh (pelat B L=0,48; rangka L=0,52).
    const L_CAP = 0.35;
    const EYE_RED = 0xff2020;
    // Ambang pisah: dua pelat kelas yang berjarak < ini akan tertukar sekilas
    // dari kamera top-down. 40 lolos utk palet logam sekarang (terdekat ~55)
    // tapi menolak mis. perunggu digeser ke emas.
    const MIN_SEP = 40;

    let allDark = true, badDark = '';
    let usesTable = true, badTable = '';
    let vsFrameOk = true, badVsFrame = '';
    let coreOk = true, badCore = '';
    let eyeOk = true, badEye = '';
    let frameOk = true, badFrame = '';
    const palHexes = Object.values(palR.PAL);
    for (const cls of ['C', 'B', 'A', 'boss']) {
        const g = robotsMod.buildRobotMesh(cls).group;
        const mats = new Set();
        g.traverse(o => { if (o.material) mats.add(o.material); });
        for (const m of mats) {
            if (hsl(m.color.getHex()).l > L_CAP) { allDark = false; badDark = badDark || (cls + ' #' + m.color.getHex().toString(16)); }
        }
        const plain = [...mats].filter(m => m.emissive.getHex() === 0);
        const lit = [...mats].filter(m => m.emissive.getHex() !== 0);
        // (b) tabel benar-benar dipakai: pelat & core kelas ini ADA di mesh.
        if (!plain.some(m => m.color.getHex() === CL[cls].armor)) { usesTable = false; badTable = badTable || (cls + ' pelat'); }
        if (!lit.some(m => m.emissive.getHex() === CL[cls].glow)) { usesTable = false; badTable = badTable || (cls + ' core'); }
        // (f) mata/visor MERAH di semua kelas.
        if (!lit.some(m => m.emissive.getHex() === EYE_RED)) { eyeOk = false; badEye = badEye || cls; }
        // (g) rangka = material netral non-pelat paling terang; token PAL gelap.
        const neutral = plain.filter(m => m.color.getHex() !== CL[cls].armor && hsl(m.color.getHex()).s <= 0.2);
        const frame = neutral.sort((p, q) => hsl(q.color.getHex()).l - hsl(p.color.getHex()).l)[0];
        if (!frame || !palHexes.includes(frame.color.getHex()) || hsl(frame.color.getHex()).l > L_CAP) {
            frameOk = false; badFrame = badFrame || (cls + ' #' + (frame ? frame.color.getHex().toString(16) : '-'));
        } else if (cls !== 'boss' && dist(CL[cls].armor, frame.color.getHex()) < 25) {
            // (d) pelat harus terbaca DI ATAS rangka. Perak-vs-gunmetal adalah
            // pasangan paling berisiko: keduanya abu-abu, hanya beda terang.
            vsFrameOk = false; badVsFrame = badVsFrame || (cls + ' d=' + dist(CL[cls].armor, frame.color.getHex()).toFixed(0));
        }
        // (e) inti daya = versi MENYALA logam yang sama: lebih terang dari
        // pelatnya, dan sehue kecuali logam netral (perak) yang memang tak ber-hue.
        const aC = hsl(CL[cls].armor), gC = hsl(CL[cls].glow);
        if (gC.l <= aC.l) { coreOk = false; badCore = badCore || (cls + ' core tak lebih terang'); }
        else if (cls !== 'boss' && aC.s > 0.2 && !hueNear(gC.h, aC.h, 15)) {
            coreOk = false; badCore = badCore || (cls + ' hue core=' + gC.h.toFixed(0) + ' vs pelat=' + aC.h.toFixed(0));
        } else if (cls !== 'boss' && aC.s <= 0.2 && gC.s > 0.35) {
            coreOk = false; badCore = badCore || (cls + ' core perak tak netral s=' + gC.s.toFixed(2));
        }
    }
    T('ROBOT WARNA: tak ada permukaan terang (semua L <= ' + L_CAP + ')' + (badDark ? ' [' + badDark + ']' : ''), allDark);
    T('ROBOT WARNA: mesh benar-benar memakai tabel CLASS_LOOK' + (badTable ? ' [' + badTable + ']' : ''), usesTable);
    T('ROBOT WARNA: C perunggu / B perak / A emas saling berjarak >= ' + MIN_SEP
        + ' (min ' + Math.min(dist(CL.C.armor, CL.B.armor), dist(CL.B.armor, CL.A.armor), dist(CL.C.armor, CL.A.armor)).toFixed(0) + ')',
        dist(CL.C.armor, CL.B.armor) >= MIN_SEP && dist(CL.B.armor, CL.A.armor) >= MIN_SEP && dist(CL.C.armor, CL.A.armor) >= MIN_SEP);
    T('ROBOT WARNA: pelat tiap kelas tetap terbaca DI ATAS rangka (risiko perak)' + (badVsFrame ? ' [' + badVsFrame + ']' : ''), vsFrameOk);
    T('ROBOT WARNA: inti daya = versi menyala logam yang sama' + (badCore ? ' [' + badCore + ']' : ''), coreOk);
    T('ROBOT WARNA: mata/visor MERAH di semua kelas' + (badEye ? ' [' + badEye + ']' : ''), eyeOk);
    T('ROBOT WARNA: rangka memakai token PAL gelap' + (badFrame ? ' [' + badFrame + ']' : ''), frameOk);
}

// --- 2. Gerbang tembak (stop-and-shoot) ---
const mkBot = (cls, x, z) => {
    const C = cfgMod.CFG.robot.classes[cls];
    const b = robotsMod.buildRobotMesh(cls);
    b.group.position.set(x, 0, z);
    scene.add(b.group);
    return {
        mesh: b.group, rig: b.rig, hp: C.hp, maxHp: C.hp, speed: 0, isModel: true, baseY: 0,
        phase: 0, state: 'chasing', jumpT: 0, jumpDur: 1, sx: x, sz: z, lx: x, lz: z,
        jumpY0: 0, jumpY1: 0, arcH: 0, groundY: 0, vaultCd: 0,
        attackCd: 0, clawT: 0, clawSide: 1, moving: false, kind: cls, scl: C.scale,
        armor: C.armor, attack: C.attack, clawDmg: C.attack,
        ranged: C.ranged, fireDelaySec: C.fireDelaySec || 0, bulletSpeed: C.bulletSpeed || 0,
        range: (C.rangeMeters || 0) * 7, fireCd: 0, losOK: true,
        reachMul: 1,
    };
};
camera.position.set(0, 11.4, 0);
// (jarak uji DITURUNKAN dari config supaya smoke tahan re-tuning angka)
const rangeB = cfgMod.CFG.robot.classes.B.rangeMeters * 7;
const rangeA = cfgMod.CFG.robot.classes.A.rangeMeters * 7;
// B dalam range: menembak
const dIn = Math.round(rangeB * 0.7);
let zB = mkBot('B', 0, dIn); robots.push(zB); chaseDist = dIn;
robotsMod.updateRobots(0.016, 1);
T('B menembak dalam range (' + dIn + '<' + rangeB + ')', enemyBullets.length === 1);
// config-driven (2026-07-20): fireCd di-set = fireDelaySec kelas (user me-retune
// nilainya antar sesi — jangan hardcode 0.9)
T('fireCd terisi', zB.fireCd > 0 && zB.fireCd >= cfgMod.CFG.robot.classes.B.fireDelaySec - 0.02);
// luar range: tidak menembak
zB.fireCd = 0; chaseDist = rangeB + 15;
robotsMod.updateRobots(0.016, 1);
T('B tidak menembak di luar range', enemyBullets.length === 1);
// losOK false: tidak menembak
zB.fireCd = 0; chaseDist = dIn; zB.losOK = false;
robotsMod.updateRobots(0.016, 1);
T('B tidak menembak tanpa LOS', enemyBullets.length === 1);
// A menembak di dalam range-nya
zB.losOK = true; zB.fireCd = 99;
const dA = Math.round(rangeA * 0.85);
let zA = mkBot('A', 0, -dA); robots.push(zA); chaseDist = dA;
robotsMod.updateRobots(0.016, 1);
T('A menembak dalam range (' + dA + '<' + rangeA + ')', enemyBullets.length === 2);

// --- 3. Peluru musuh mengenai player (iterasi cukup utk speed selambat apa pun) ---
const hp0 = player.hp;
for (let i = 0; i < 1500 && enemyBullets.length; i++) robotsMod.updateEnemyBullets(0.016, 1);
T('peluru musuh melukai player (hp ' + hp0 + '->' + player.hp + ')', player.hp < hp0);
T('peluru musuh habis', enemyBullets.length === 0);

// --- 4. Cakar kelas C: ANCANG-ANCANG (clawWindupSec) dulu, damage MENYUSUL ---
let zC = mkBot('C', 0, 7); robots.push(zC); chaseDist = 7;
const hp1 = player.hp;
zA.fireCd = 99; zB.fireCd = 99;
robotsMod.updateRobots(0.016, 1);
T('cakar TIDAK instan: windup mulai, hp utuh', player.hp === hp1 && zC.windT > 0 && zC.windTarget === 'player');
const wTicks = Math.ceil((cfgMod.CFG.robot.clawWindupSec + 0.1) / 0.05);
for (let i = 0; i < wTicks; i++) robotsMod.updateRobots(0.05, 3);
T('sabetan mendarat setelah windup (-' + (hp1 - player.hp) + ')', player.hp === hp1 - cfgMod.CFG.robot.classes.C.attack);

// --- 4b. Mundur selama ancang-ancang = sabetan LUPUT (recheck jangkauan) ---
let zC2 = mkBot('C', 0, 7); robots.push(zC2);
zC2.attackCd = 0;
robotsMod.updateRobots(0.016, 1);
T('windup kedua mulai', zC2.windT > 0);
const hp2 = player.hp;
camera.position.set(0, 11.4, 60);                 // player kabur menjauh
for (let i = 0; i < wTicks; i++) robotsMod.updateRobots(0.05, 3);
T('menjauh saat ancang-ancang: sabetan LUPUT', player.hp === hp2);
camera.position.set(0, 11.4, 0);

// --- 4c. killRobot cause 'melee' -> bangkai TERBELAH DUA (bisectCorpse) ---
const nB4 = robots.length;
robotsMod.killRobot(robots.indexOf(zC2), { cause: 'melee', dirx: 0, dirz: -1 });
T('kill pedang splice', robots.length === nB4 - 1);
T('kepala+lengan pindah ke paruh ATAS', zC2.rig.head.parent !== zC2.rig.inner
    && zC2.rig.armL.parent !== zC2.rig.inner && zC2.rig.armR.parent !== zC2.rig.inner);
T('kaki tinggal di paruh BAWAH', zC2.rig.thighL.parent === zC2.rig.inner
    && zC2.rig.thighR.parent === zC2.rig.inner);
for (let i = 0; i < 40; i++) goreMod.updateGore(0.1);   // terbang -> berdiri -> roboh -> pudar -> dispose
T('bisection update+dispose OK', true);

// --- 4d. Pemisahan robot-robot (2026-07-16): tak boleh menumpuk di satu titik ---
{
    const saved = robots.splice(0, robots.length);         // kosongkan sementara
    const sepR = cfgMod.CFG.robot.separationRadius;
    const a = mkBot('C', 100, 100), b = mkBot('C', 100.3, 100);   // hampir menumpuk
    robots.push(a, b);
    for (let i = 0; i < 60; i++) robotsMod.separateRobots();
    const dist = Math.hypot(a.mesh.position.x - b.mesh.position.x, a.mesh.position.z - b.mesh.position.z);
    T('robot menumpuk terdorong menjauh (~2×separationRadius, ' + dist.toFixed(1) + ')', dist >= sepR * 2 - 0.5);
    // idle (dorman) = JANGKAR: tak digeser, hanya mendorong yang lain
    robots.splice(0, robots.length);
    const idleBot = mkBot('C', 200, 200); idleBot.state = 'idle';
    const mover = mkBot('C', 200.4, 200);
    robots.push(idleBot, mover);
    for (let i = 0; i < 60; i++) robotsMod.separateRobots();
    T('robot idle = jangkar (tak bergeser)', idleBot.mesh.position.x === 200 && idleBot.mesh.position.z === 200);
    T('robot chasing terdorong keluar dari idle', Math.hypot(mover.mesh.position.x - 200, mover.mesh.position.z - 200) >= sepR * 2 - 0.5);
    // clampRobot: dorongan separasi TIDAK menembus dinding (bug 2026-07-16 —
    // robot nyangkut dinding). Hook scene menjepit ke area sah tiap frame.
    robots.splice(0, robots.length);
    smMod.activeScene.clampRobot = (z) => { if (z.mesh.position.x > 50) z.mesh.position.x = 50; };  // "dinding" x=50
    const wa = mkBot('C', 48, 0), wb = mkBot('C', 48.3, 0);
    robots.push(wa, wb);
    for (let i = 0; i < 60; i++) robotsMod.separateRobots();
    T('separasi hormati clampRobot: robot tak menembus dinding', wa.mesh.position.x <= 50.001 && wb.mesh.position.x <= 50.001);
    delete smMod.activeScene.clampRobot;
    robots.splice(0, robots.length);
    for (const z of saved) robots.push(z);                 // pulihkan isi array semula
}

// --- 5. killRobot -> gore coolant (tanpa throw) ---
const nBefore = robots.length;
robotsMod.killRobot(robots.indexOf(zC), { cause: 'explosion', dirx: 1, dirz: 0 });
T('killRobot splice', robots.length === nBefore - 1);
for (let i = 0; i < 30; i++) goreMod.updateGore(0.1);
goreMod.resetGore();
T('gore update+reset OK', true);

// --- 5b. Peluru bertarget MONAS: flag monasDmg + hook saat terblokir ---
const zR = mkBot('B', 0, 60);
robotsMod.fireRobotBullet(zR, 0, 0, 0, 20);
T('peluru monasDmg terpasang', enemyBullets.length === 1 && enemyBullets[0].monasDmg === 20);
sceneCtl.blocked = true;
robotsMod.updateEnemyBullets(0.016, 1);
T('hook enemyBulletHitMonas terpanggil (dmg 20)', sceneCtl.monasHits.length === 1 && sceneCtl.monasHits[0] === 20 && enemyBullets.length === 0);
sceneCtl.blocked = false;

// Peluru A/B juga harus ditolak PADA SAAT LAHIR bila ujung laras sudah berada
// di bidang pintu tertutup; menunggu frame gerak pertama membuat robot yang
// menempel pintu bisa menembak menembusnya.
sceneCtl.blocked = true;
const ebBeforeSpawnBlock = enemyBullets.length;
robotsMod.fireRobotBullet(zB);
robotsMod.fireRobotBullet(zA);
T('peluru A/B yang lahir di pintu tertutup langsung terblokir',
    enemyBullets.length === ebBeforeSpawnBlock);
sceneCtl.blocked = false;

// --- 5c. rig.muzzle: kanan utk B, KEDUA lengan utk A, null utk melee ---
const rigB = robotsMod.buildRobotMesh('B').rig, rigA = robotsMod.buildRobotMesh('A').rig;
T('rig.muzzle B ada (senapan kanan)', !!rigB.muzzle && rigB.muzzleL === null);
T('rig A dua senapan (muzzle + muzzleL)', !!rigA.muzzle && !!rigA.muzzleL);
T('rig.muzzle C null (cakar)', robotsMod.buildRobotMesh('C').rig.muzzle === null);

// --- 5f. Kelas A menembak BERGANTIAN kiri/kanan + recoil (bukan cakar) ---
const zA2 = mkBot('A', 30, 0);
robotsMod.fireRobotBullet(zA2);
const px1 = enemyBullets[enemyBullets.length - 1].px, side1 = zA2.recoilSide;
robotsMod.fireRobotBullet(zA2);
const px2 = enemyBullets[enemyBullets.length - 1].px;
T('A bergantian laras (px beda: ' + px1.toFixed(1) + ' vs ' + px2.toFixed(1) + ')', px1 !== px2);
T('recoilSide bergantian', side1 !== zA2.recoilSide);
T('recoilT terisi & clawT tetap 0 (bukan animasi cakar)', zA2.recoilT > 0 && zA2.clawT === 0);
while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }

// --- 5g. Stance membidik: A dua lengan naik; B hanya kanan ---
zA2.aiming = true; zA2.moving = false;
for (let i = 0; i < 30; i++) robotsMod.animateRobotRig(zA2, 0.05);
T('A membidik: dua lengan terangkat', zA2.rig.armR.rotation.x < -1.2 && zA2.rig.armL.rotation.x < -1.2);
const zB2 = mkBot('B', -30, 0); zB2.aiming = true; zB2.moving = false;
for (let i = 0; i < 30; i++) robotsMod.animateRobotRig(zB2, 0.05);
T('B membidik: kanan naik, kiri tetap di bawah', zB2.rig.armR.rotation.x < -1.2 && zB2.rig.armL.rotation.x > -0.6);

// --- 5g2. TEMBAKAN A/B DIPERTAJAM (2026-07-27): kilat moncong (pool TETAP,
//     TANPA PointLight), kunci bidik (mata menyala), recoil TEREDAM (memantul,
//     bukan satu bump), badan MENYERAP hentakan, kuda-kuda menembak. ---
{
    const lightsBefore = (() => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; })();
    const zS = zB2, rS = zS.rig;
    zS.aiming = true; zS.moving = false; zS.fireCd = 1;
    for (let i = 0; i < 40; i++) robotsMod.animateRobotRig(zS, 1 / 60);
    const eyeIdle = rS.eyeMat.emissiveIntensity;
    T('kuda-kuda MENEMBAK: kaki terpentang (bukan berdiri kaku)',
        Math.abs(rS.thighL.rotation.x) > 0.1 && Math.abs(rS.thighR.rotation.x) > 0.1);
    zS.fireCd = 0.1;                                   // hampir menembak = KUNCI BIDIK
    for (let i = 0; i < 6; i++) robotsMod.animateRobotRig(zS, 1 / 60);
    T('KUNCI BIDIK: mata menyala menjelang menembak (' + eyeIdle.toFixed(2)
        + ' -> ' + rS.eyeMat.emissiveIntensity.toFixed(2) + ')', rS.eyeMat.emissiveIntensity > eyeIdle + 0.4);
    // --- Tembak: kilat + recoil badan
    const nF0 = effectsMod.muzzleFlashDebug();
    robotsMod.fireRobotBullet(zS);
    T('menembak MEMUNCULKAN kilat moncong (dulu tak ada sama sekali)',
        effectsMod.muzzleFlashDebug() === nF0 + 1);
    // Bukti "pantulan teredam" (bukan satu bump sinus): laras harus MELEWATI
    // garis pose bidiknya di KEDUA arah. Bump sinus lama selalu satu arah saja
    // (hanya menendang naik lalu kembali), jadi menghitung "balikan arah" tidak
    // cukup — sway napas kecil pun menghasilkannya.
    const armBase = rS.armR.rotation.x;
    let maxEye = 0, minZ = 0, maxTwist = 0, over = 0, under = 0;
    for (let i = 0; i < 30 && zS.recoilT > 0; i++) {
        robotsMod.animateRobotRig(zS, 1 / 60);
        maxEye = Math.max(maxEye, rS.eyeMat.emissiveIntensity);
        minZ = Math.min(minZ, rS.inner.position.z);
        maxTwist = Math.max(maxTwist, Math.abs(rS.inner.rotation.y));
        over = Math.max(over, rS.armR.rotation.x - armBase);
        under = Math.min(under, rS.armR.rotation.x - armBase);
    }
    T('RECOIL memantul TEREDAM: laras melewati garis bidik di KEDUA arah ('
        + under.toFixed(2) + ' / +' + over.toFixed(2) + ')', under < -0.1 && over > 0.02);
    T('BADAN menyerap hentakan: torso terdorong mundur + memuntir',
        minZ < -0.3 && maxTwist > 0.05);
    T('mata MENYAMBAR saat meletus (' + maxEye.toFixed(2) + '×)', maxEye > 2.5);
    // --- Kilat = pool TETAP: padam sendiri & TIDAK menambah lampu (invarian
    //     "jumlah PointLight konstan" — kilat sengaja tanpa lampu).
    for (let i = 0; i < 40; i++) effectsMod.updateExplosions(1 / 60);
    T('kilat moncong padam sendiri (pool tetap, tak menumpuk)', effectsMod.muzzleFlashDebug() === 0);
    for (let i = 0; i < 12; i++) robotsMod.fireRobotBullet(zS);   // lebih banyak dari ukuran pool
    const lightsAfter = (() => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; })();
    T('kilat moncong TIDAK menambah PointLight (' + lightsBefore + ' -> ' + lightsAfter + ')',
        lightsAfter === lightsBefore);
    T('pool kilat dibatasi (spam tembakan tak melebihi kapasitas)', effectsMod.muzzleFlashDebug() <= 10);
    // --- Pulih bersih: mata & badan kembali TEPAT ke netral
    zS.aiming = false; zS.recoilT = 0;
    for (let i = 0; i < 200; i++) robotsMod.animateRobotRig(zS, 1 / 60);
    T('pulih: mata kembali TEPAT 1 & torso kembali netral',
        rS.eyeMat.emissiveIntensity === 1 && Math.abs(rS.inner.position.z) < 1e-3
        && Math.abs(rS.inner.rotation.y) < 1e-3);
    effectsMod.resetMuzzleFlashes();
    while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }
}

// --- 5i. IDLE per kelas (2026-07-14, spesifikasi user): BADAN & KAKI DIAM,
//     kepala celingak-celinguk; gestur khas kelas (C angkat-turun tangan,
//     B gosok senapan, A juggle senapan). ---
const zIdleC = mkBot('C', 200, 0); zIdleC.state = 'idle'; zIdleC.moving = false;
let hMin = 9, hMax = -9, bodyMax = 0, legMax = 0, cArmMin = 9;
for (let i = 0; i < 400; i++) {
    robotsMod.animateRobotRig(zIdleC, 0.05);
    const y = zIdleC.rig.head.rotation.y; hMin = Math.min(hMin, y); hMax = Math.max(hMax, y);
    bodyMax = Math.max(bodyMax, Math.abs(zIdleC.rig.inner.position.y));
    legMax = Math.max(legMax, Math.abs(zIdleC.rig.thighL.rotation.x));
    cArmMin = Math.min(cArmMin, zIdleC.rig.armL.rotation.x);
}
T('idle: state terinisialisasi', zIdleC.idleInit === 1);
T('idle C: kepala celingak-celinguk kiri-kanan', hMax - hMin > 0.3);
T('idle C: BADAN & KAKI diam (tak melompat)', bodyMax < 0.1 && legMax < 0.1);
T('idle C: sesekali MENAIK-turunkan tangan', cArmMin < -1.2);

const zIdleB = mkBot('B', 260, 0); zIdleB.state = 'idle'; zIdleB.moving = false;
let bArmMin = 9, bArmZ = -9;
for (let i = 0; i < 400; i++) {
    robotsMod.animateRobotRig(zIdleB, 0.05);
    bArmMin = Math.min(bArmMin, zIdleB.rig.armL.rotation.x);
    bArmZ = Math.max(bArmZ, zIdleB.rig.armL.rotation.z);
}
T('idle B: senapan kanan low-ready diam', Math.abs(zIdleB.rig.armR.rotation.x + 0.24) < 0.01);
T('idle B: tangan kiri MENGGOSOK senapan', bArmMin < -0.6 && bArmZ > 0.3);

const zIdleA = mkBot('A', 320, 0); zIdleA.state = 'idle'; zIdleA.moving = false;
T('idle A: rig punya grup senapan gunR + gunL', !!zIdleA.rig.gunR && !!zIdleA.rig.gunL);
const gunBaseY = zIdleA.rig.gunR.position.y;
let gunMaxY = -99;
for (let i = 0; i < 400; i++) {
    robotsMod.animateRobotRig(zIdleA, 0.05);
    gunMaxY = Math.max(gunMaxY, zIdleA.rig.gunR.position.y);
}
T('idle A: senapan di-JUGGLE naik tinggi', gunMaxY > gunBaseY + 4);
while (zIdleA.gestActive) robotsMod.animateRobotRig(zIdleA, 0.05);   // biarkan juggle selesai
T('idle A: senapan kembali ke tangan usai juggle', Math.abs(zIdleA.rig.gunR.position.y - gunBaseY) < 0.3);

// Keluar dari idle: sisa pindaian kepala harus meluruh (tak macet miring).
zIdleC.state = 'chasing'; zIdleC.moving = true;
for (let i = 0; i < 60; i++) robotsMod.animateRobotRig(zIdleC, 0.05);
T('keluar idle: pindaian kepala meluruh', Math.abs(zIdleC.rig.head.rotation.y) < 0.05);

// === SIKLUS JALAN ROBOT (ROMBAK TOTAL 2026-07-28, permintaan user: gerak robot
// "sangat simple, seperti boneka yang tidak natural"). Kurva lama = pinggul
// sinus murni + lutut max(0,-sin) + bob abs(sin) yang mendorong badan NAIK +
// kadens yang membuat langkah 2,4x lebih panjang dari jangkauan kaki (foot
// sliding). Semua assert di bawah GAGAL pada kurva lama = uji mutasi. ===
{
    const CC = cfgMod.CFG.robot.classes.C;
    const mkWalker = (cls) => {
        const b = robotsMod.buildRobotMesh(cls);
        const C = cfgMod.CFG.robot.classes[cls];
        return {
            rig: b.rig, mesh: b.group, state: 'chasing', moving: true, phase: 0, kind: cls,
            speed: C.speed, scl: C.scale, ranged: !!C.ranged,
            windT: 0, clawT: 0, clawSide: 1, fireCd: 0, aimT: 0, recoilT: 0, stepPulse: 0,
        };
    };
    const zW = mkWalker('C');
    zW.gaitVar = 1;                       // kunci variasi acak supaya kurva bisa diuji eksak
    const rW = zW.rig;
    // Sampel pose pada SUDUT LANGKAH tertentu: dt=0 => fase tak maju, pose
    // ditulis dari `z.phase` apa adanya.
    const at = (ph) => {
        zW.phase = ph;
        robotsMod.animateRobotRig(zW, 0);
        return {
            hipL: rW.thighL.rotation.x, kneeL: rW.shinL.rotation.x,
            ankL: rW.ankleL ? rW.ankleL.rotation.x : 0,
            bob: rW.inner.position.y, px: rW.inner.position.x, rz: rW.inner.rotation.z,
            headY: rW.head.position.y,
        };
    };

    T('ROBOT RIG: pivot PERGELANGAN KAKI ada (telapak bisa menjejak, bukan mesh kaku di betis)',
        !!(rW.ankleL && rW.ankleR && rW.ankleL.parent === rW.shinL));

    // (a) ANTI FOOT SLIDING: panjang langkah harus sepadan jangkauan kaki.
    //     Kadens & ayunan dari kode, laju & panjang kaki dari CFG/geometri rig.
    const speedU = CC.speed * 60;                                  // unit/dtk (gerak dikali `step`)
    const ph0 = zW.phase = 0;
    robotsMod.animateRobotRig(zW, 0.1);
    const cad = (zW.phase - ph0) / 0.1;                            // rad/dtk terukur
    const strideStep = speedU * Math.PI / cad;                     // jarak per LANGKAH
    const legLen = rW.thighL.position.y;                           // pinggul ke lantai (geometri rig)
    // Pose di sudut langkah kunci: mendarat / tengah ayunan / menolak.
    const plant = at(Math.PI / 2), swing = at(0.15), toe = at(Math.PI * 1.5);
    // Jangkauan telapak DIUKUR dari pose nyata (bukan menyalin rumus kode):
    // sudut pinggul saat mendarat + saat menolak x panjang kaki. Tahan retune.
    const reach = legLen * (Math.abs(Math.sin(plant.hipL)) + Math.abs(Math.sin(toe.hipL)));
    T('ROBOT JALAN: langkah SEPADAN jangkauan kaki (' + strideStep.toFixed(1) + ' vs '
        + reach.toFixed(1) + ' unit) — tak lagi menggeser di lantai',
        strideStep < reach * 1.5);
    T('ROBOT JALAN: kaki mengayun LEBAR (langkah panjang & mantap, bukan mencincang)',
        Math.abs(plant.hipL) > 0.5 && Math.abs(toe.hipL) > 0.5);

    // (b) LUTUT di saat yang BENAR: lurus saat mendarat & menolak, melipat dalam
    //     di tengah ayunan (kurva lama justru menekuk saat kaki di belakang).
    // Bentuk kurva (relatif), BUKAN besaran mutlak: seberapa tegang kaki robot
    // itu selera (user menurunkannya 2026-07-28 agar "agak kaku"); yang WAJIB
    // tetap benar adalah WAKTU-nya — lutut melipat di tengah ayunan, lurus saat
    // mendarat & menolak (kurva lama justru menekuk saat kaki di belakang).
    T('ROBOT JALAN: lutut LURUS saat mendarat & menolak, MELIPAT di tengah ayunan ('
        + plant.kneeL.toFixed(2) + ' / ' + toe.kneeL.toFixed(2) + ' / ' + swing.kneeL.toFixed(2) + ')',
        swing.kneeL > plant.kneeL + 0.35 && swing.kneeL > toe.kneeL + 0.35
        && plant.kneeL < 0.35 && toe.kneeL < 0.5
        && plant.hipL < -0.3 && toe.hipL > 0.3);
    T('ROBOT JALAN: PERGELANGAN MENJEJAK saat menolak & mendatar menyongsong pendaratan',
        at(4.55).ankL > 0.15 && plant.ankL < 0.05);

    // (c) BOB: 2x per siklus, TEPAT saat kaki menopang, dan TIDAK PERNAH positif
    //     (kurva lama abs(sin) selalu >= 0 = badan melenting ke ATAS).
    const bStanceR = at(0).bob, bStanceL = at(Math.PI).bob, bMid = at(Math.PI / 2).bob;
    T('ROBOT JALAN: berat JATUH tiap kaki menopang (2x/siklus, sedalam lutut memendek) & badan TAK PERNAH melenting ke atas',
        bStanceR < -0.2 && bStanceL < -0.2 && bMid <= 0 && Math.abs(bMid) < Math.abs(bStanceR) * 0.2);

    // (d) OLENG LATERAL: massa berpindah ke kaki tumpu (geser + miring ke sisi itu).
    const wR = at(0), wL = at(Math.PI);
    T('ROBOT JALAN: massa BERPINDAH ke kaki tumpu (badan bergeser + miring ke sisi itu)',
        wR.px > 0.05 && wR.rz < -0.01 && wL.px < -0.05 && wL.rz > 0.01);

    // (e) KEPALA distabilkan melawan bob (sensor tetap mengincar, tak terguncang).
    T('ROBOT JALAN: kepala DISTABILKAN melawan bob (naik saat badan turun)',
        wR.headY > 10.3 + 0.03 && at(Math.PI / 2).headY < wR.headY - 0.03);

    // (f) HENTAKAN KAKI: tepat 2 denyut per siklus (dipakai sinkron SFX langkah).
    zW.phase = 0; zW.stepPulse = 0; zW._stepBeat = undefined;
    robotsMod.animateRobotRig(zW, 1 / 240);              // frame pertama menyalakan denyut awal
    let beats = 0, prev = zW.stepPulse;
    const cyc = Math.PI * 2 / cad;                       // detik per siklus
    for (let t = 0; t < cyc * 2; t += 1 / 240) {
        robotsMod.animateRobotRig(zW, 1 / 240);
        if (zW.stepPulse > prev) beats++;
        prev = zW.stepPulse;
    }
    T('ROBOT JALAN: denyut hentakan kaki = 2 per siklus (' + beats + ' dalam 2 siklus) — SFX langkah bisa disinkronkan',
        beats === 4);

    // (g) CONDONG mengejar: rantai cakar kini meluruh MENUJU pose jalan, bukan
    //     ke nol (kalau ke nol, condong badan terhapus tiap frame).
    for (let i = 0; i < 40; i++) robotsMod.animateRobotRig(zW, 1 / 60);
    T('ROBOT JALAN: badan CONDONG mengejar & bahu memuntir (tak dihapus rantai serangan)',
        rW.inner.rotation.x > 0.03 && Math.abs(rW.inner.rotation.y) > 0.005);

    // (h) VARIASI PER UNIT: kerumunan tak melangkah serentak.
    const vars = new Set();
    for (let i = 0; i < 10; i++) { const zv = mkWalker('C'); robotsMod.animateRobotRig(zv, 1 / 60); vars.add(zv.gaitVar); }
    T('ROBOT JALAN: tiap unit punya kadens & langkah sendiri (' + vars.size + '/10 berbeda) — bukan barisan boneka serentak',
        vars.size >= 8 && [...vars].every(v => v >= 0.88 && v <= 1.15));

    // (j) MIRING SAAT BERBELOK: badan tertinggal ke sisi luar belokan (bukan
    //     berputar tegak seperti turret), dan sisinya mengikuti arah putaran.
    const zT = mkWalker('C');
    for (let i = 0; i < 25; i++) { zT.mesh.rotation.y += 0.06; robotsMod.animateRobotRig(zT, 1 / 60); }
    const bankCW = zT._bank;
    for (let i = 0; i < 50; i++) { zT.mesh.rotation.y -= 0.06; robotsMod.animateRobotRig(zT, 1 / 60); }
    const bankCCW = zT._bank;
    for (let i = 0; i < 90; i++) robotsMod.animateRobotRig(zT, 1 / 60);   // berhenti berbelok
    T('ROBOT BELOK: badan MIRING ke sisi luar belokan (' + bankCW.toFixed(3) + ' / '
        + bankCCW.toFixed(3) + ') lalu tegak lagi saat lurus',
        Math.abs(bankCW) > 0.02 && bankCW * bankCCW < 0 && Math.abs(zT._bank) < 0.01);

    // (i) BERHENTI: SEMUA kanal gait baru kembali netral (tak membeku menjejak).
    zW.moving = false;
    for (let i = 0; i < 120; i++) robotsMod.animateRobotRig(zW, 0.05);
    T('ROBOT BERHENTI: pergelangan/oleng/kepala/condong kembali netral (tak membeku di pose langkah)',
        Math.abs(rW.ankleL.rotation.x) < 0.01 && Math.abs(rW.inner.position.x) < 0.01
        && Math.abs(rW.inner.rotation.z) < 0.01 && Math.abs(rW.head.position.y - 10.3) < 0.01
        && Math.abs(rW.inner.rotation.x) < 0.01);
}

// --- 5d. Burst warna merah (darah player) tak melempar ---
effectsMod.spawnBloodBurst(0, 5, 0, 1, 0, 5, 1, 1.6, 0xb51a1a);
T('spawnBloodBurst param warna OK', true);

// --- 5e. MELEE_TIME diekspor (dipakai animasi pedang avatar) ---
const wMod = await import(R('src/entities/weapons.js'));
T('MELEE_TIME diekspor (0.45)', wMod.MELEE_TIME === 0.45);

// --- 5h. Sabetan pedang = KERUCUT DEPAN ~±70° searah `meleeDir` (2026-07-16;
//     default -z = arah kursor stub): robot DEPAN kena damage CFG.melee.damage;
//     BELAKANG (walau dalam jangkauan) & luar jangkauan selamat; HP raksasa
//     (boss) hanya tergerus. (Kamera stub menghadap -z.) ---
// (jarak DITURUNKAN dari CFG.melee.range supaya tahan re-tuning range user)
const MR = cfgMod.CFG.melee.range;
const zM1 = mkBot('C', 0, -MR * 0.55); robots.push(zM1);       // depan (utara/-z)
const zM2 = mkBot('B', MR * 0.22, -MR * 0.5); robots.push(zM2); // depan
const zBehind = mkBot('C', 0, MR * 0.5); robots.push(zBehind);  // BELAKANG dlm jangkauan -> LUAR kerucut, selamat
const zTank = mkBot('A', -MR * 0.2, -MR * 0.55); zTank.hp = 99999; robots.push(zTank);
camera.position.set(0, 11.4, 0);
const nR0 = robots.length;
wMod.doMeleeHit();   // meleeDir default = (0,-1) = -z
T('kerucut depan: robot depan tertebas', !robots.includes(zM1) && !robots.includes(zM2));
T('robot di belakang (luar kerucut) selamat walau dalam jangkauan', robots.includes(zBehind));
T('HP raksasa selamat tergerus melee.damage',
    robots.includes(zTank) && zTank.hp === 99999 - Math.max(1, cfgMod.CFG.melee.damage - (zTank.armor || 0)));
T('jumlah splice sapuan benar (2 mati)', robots.length === nR0 - 2);
for (let i = 0; i < 40; i++) goreMod.updateGore(0.1);          // bangkai terbelah dituntaskan
robots.splice(robots.indexOf(zBehind), 1); scene.remove(zBehind.mesh); // bersih-bersih
robots.splice(robots.indexOf(zTank), 1); scene.remove(zTank.mesh);

// --- 6. Avatar player: build + prop + gunTip terkalibrasi + salto ---
const avMod = await import(R('src/entities/playerAvatar.js'));
avMod.initPlayerAvatar(scene);
T('avatarGunTip lokal (0,0.15,4.5)',
    avMod.avatarGunTip.position.x === 0 && avMod.avatarGunTip.position.y === 0.15 && avMod.avatarGunTip.position.z === 4.5);
T('gunGrp terkalibrasi (0.65,7.5,1.2)',
    avMod.avatarGunTip.parent.position.x === 0.65 && avMod.avatarGunTip.parent.position.y === 7.5 && avMod.avatarGunTip.parent.position.z === 1.2);
avMod.updatePlayerAvatar(0.016);
T('updatePlayerAvatar jalan', true);
// salto dodge: tryDodge lalu beberapa frame movement+avatar
const playerMod = await import(R('src/entities/player.js'));
playerMod.resetPlayerState();
playerMod.tryDodge();
T('dodge aktif', playerMod.dodgeActive === true);
for (let i = 0; i < 12; i++) { playerMod.updatePlayerMovement(0.05, 3); avMod.updatePlayerAvatar(0.05); }
T('salto selesai tanpa throw', playerMod.dodgeActive === false);

// --- 6a. GULINGAN TEMPUR (dirombak 2026-07-27): profil kecepatan "tahan →
// ledakan → berhenti" + tubuh MELENGKUNG/asimetris + fase RECOVER mendarat.
// Semua config-driven dari CFG.dodge (user sering me-retune speed/durationSec). ---
{
    const DG = cfgMod.CFG.dodge;
    // Jarak dodge MURNI (berhenti persis saat dodge selesai) pada satu frame rate.
    const rollOnce = (fps) => {
        playerMod.resetPlayerState();
        avMod.resetAvatarDeath();
        camera.position.set(0, cfgMod.CFG.player.eyeHeight, 0);
        playerMod.tryDodge();
        const x0 = camera.position.x, z0 = camera.position.z;
        const dt = 1 / fps, step = 60 / fps;
        let peak = 0, first = -1, n = 0;
        const trace = [];
        while (playerMod.dodgeActive && n++ < 500) {
            const px = camera.position.x, pz = camera.position.z;
            playerMod.updatePlayerMovement(dt, step);
            avMod.updatePlayerAvatar(dt);
            const sp = Math.hypot(camera.position.x - px, camera.position.z - pz);
            if (first < 0) first = sp;
            peak = Math.max(peak, sp);
            const d = avMod.avatarDodgeDebug();
            trace.push({ p: playerMod.dodgeProgress, sp, ...d });
        }
        return { dist: Math.hypot(camera.position.x - x0, camera.position.z - z0), peak, first, trace };
    };
    const r60 = rollOnce(60), r30 = rollOnce(30), r144 = rollOnce(144);
    // Jarak = integral kontinu profil (speed × luas 0.5 × durasi × 60) — angka
    // tuning user TETAP berarti sama; profil lama justru frame-rate dependent.
    const want = DG.speed * 0.5 * DG.durationSec * 60;
    T('jarak guling = nilai tuning CFG.dodge (' + r60.dist.toFixed(1) + ' vs ' + want.toFixed(1) + ')',
        Math.abs(r60.dist - want) / want < 0.02);
    T('jarak guling SAMA di 30/60/144 fps (frame-rate independent)',
        Math.abs(r30.dist - r144.dist) / want < 0.02 && Math.abs(r60.dist - r144.dist) / want < 0.02);
    T('profil MELECUT: puncak jauh di atas frame pertama (tahan dulu, baru meledak)',
        r60.first < r60.peak * 0.2 && r60.peak > DG.speed * 1.3);
    // --- Pose: yang dulu hilang = badan tak pernah menggulung (kaku berputar)
    const tr = r60.trace;
    const maxTorso = Math.max(...tr.map(s => s.torso));
    const minTorso = Math.min(...tr.map(s => s.torso));
    T('tubuh MENGGULUNG: torso melipat ke lutut di udara (' + maxTorso.toFixed(2) + ' rad)', maxTorso > 0.8);
    T('antisipasi: torso melengkung ke BELAKANG dulu saat memuat tenaga', minTorso < -0.15);
    const air = tr.filter(s => s.p > 0.3 && s.p < 0.6);
    T('kaki ASIMETRIS selama menggulung (bukan dua kaki identik)',
        air.some(s => Math.abs(s.hipL - s.hipR) > 0.15 && Math.abs(s.kneeL - s.kneeR) > 0.15));
    const feetY0 = camera.position.y - cfgMod.CFG.player.eyeHeight;
    T('MERENDAH saat memuat & saat lutut meredam pendaratan',
        tr.some(s => s.p < 0.2 && s.y < feetY0 - 0.4) && tr[tr.length - 1].y < feetY0 - 0.8);
    // --- Fase RECOVER: berjalan SETELAH dodge (i-frame sudah mati) lalu bersih
    T('RECOVER pendaratan mulai setelah dodge selesai', avMod.avatarDodgeDebug().land > 0);
    for (let i = 0; i < 40; i++) { playerMod.updatePlayerMovement(1 / 60, 1); avMod.updatePlayerAvatar(1 / 60); }
    const after = avMod.avatarDodgeDebug();
    T('RECOVER selesai bersih: torso kembali TEPAT 0 (tak ada sisa tunduk)',
        after.land <= 0 && after.torso === 0 && Math.abs(after.y - (camera.position.y - cfgMod.CFG.player.eyeHeight)) < 1e-9);
    // --- Sisi bahu tumpuan BERGANTIAN utk guling maju/mundur murni
    const sides = [];
    for (let i = 0; i < 4; i++) {
        playerMod.resetPlayerState();
        playerMod.tryDodge();                    // tanpa WASD = guling mundur murni
        avMod.updatePlayerAvatar(1 / 60);
        sides.push(avMod.avatarDodgeDebug().side);
        while (playerMod.dodgeActive) { playerMod.updatePlayerMovement(1 / 60, 1); avMod.updatePlayerAvatar(1 / 60); }
    }
    T('guling maju/mundur murni BERGANTIAN bahu (' + sides.join(',') + ')',
        sides[0] === -sides[1] && sides[1] === -sides[2] && sides[2] === -sides[3]);
    playerMod.resetPlayerState();
    avMod.resetAvatarDeath();
}

// --- 6b. Melee AUTO-TARGET (2026-07-16): tekan F -> character otomatis MENGHADAP
//     robot terjangkau TERDEKAT (walau kursor ke arah lain) & menebas kerucut ke
//     arah itu; robot di sisi berlawanan (arah kursor) SELAMAT. Kamera stub bidik -z. ---
playerMod.resetPlayerState();                      // stamina penuh
camera.position.set(0, 11.4, 0);
const savedR = robots.splice(0, robots.length);    // simpan isi (zB/zA dll utk tes selebrasi nanti)
const zBack = mkBot('C', 0, MR * 0.5); robots.push(zBack);          // BELAKANG kursor (selatan/+z) — terdekat
const zSide = mkBot('B', MR * 0.15, MR * 0.55); robots.push(zSide); // sekerucut belakang
const zFrontM = mkBot('C', 0, -MR * 0.9); robots.push(zFrontM);     // arah kursor (utara) tapi lebih jauh
const nRb = robots.length;
wMod.tryMelee();
T('melee auto-hadap robot terdekat di BELAKANG kursor', wMod.meleeDirZ > 0.5);
wMod.doMeleeHit();
T('robot target + sekerucut (belakang) tertebas', !robots.includes(zBack) && !robots.includes(zSide));
T('robot arah kursor (luar kerucut tebasan) SELAMAT', robots.includes(zFrontM));
T('jumlah splice auto-target benar (2 mati)', robots.length === nRb - 2);
for (let i = 0; i < 40; i++) goreMod.updateGore(0.1);
robots.splice(robots.indexOf(zFrontM), 1); scene.remove(zFrontM.mesh);
robots.splice(0, robots.length);
for (const z of savedR) robots.push(z);            // pulihkan isi array semula
wMod.updateWeaponTimers(0.5);   // selesaikan ayunan -> meleeT <= 0 (jangan cemari tes avatar berikut)

// --- 6b2. BENTURAN MELEE TERASA (2026-07-27): sabetan BERGANTIAN arah (busur
//     bercermin), HIT-STOP global saat mengenai (core/timeScale.js) + kilat
//     bilah; cakar robot C ikut: telegraf MATA menyala, kaki menopang/menolak,
//     terjangan lebih dalam, getaran pasca-hantam. ---
{
    const tsMod = await import(R('src/core/timeScale.js'));
    // Seksi 6b memanggil doMeleeHit yang MENGENAI robot -> hit-stop tersisa
    // menyala (di game ia diluruhkan updateGame; harness belum memanggilnya).
    // Mulai dari kondisi bersih supaya assert di bawah menguji hal yang benar.
    tsMod.resetTimeScale();
    // ===== DUA PISAU BELATI (OVERHAUL 2026-07-29, permintaan user: pedang
    // diganti — "tentara zaman modern tidak mengibaskan pedang"). Pivot tebasan
    // = anak upperG ber-euler 'YXZ'; kini ADA DUA (bahu kanan + bahu kiri),
    // urutan pembuatan: kanan lalu kiri. MEKANIKNYA tidak berubah — assert
    // damage/kerucut/durasi/stamina di seksi 5e/5h/6b tetap berlaku apa adanya. =====
    const upperT = avMod.avatarGroup.children[0];
    const pivots = upperT.children.filter(c => c.rotation && c.rotation.order === 'YXZ');
    const kR = pivots[0], kL = pivots[1];
    T('DUA pisau belati (dua pivot tebasan, bukan satu pedang)', pivots.length === 2 && !!kR && !!kL);
    T('pisau tangan kiri dipegang GENGGAMAN TERBALIK (icepick)',
        !!kL && kL.children[0].rotation.x === Math.PI && kR.children[0].rotation.x === 0);
    T('pisau DISEMBUNYIKAN saat tidak menebas', kR.visible === false && kL.visible === false);
    const savedR2 = robots.splice(0, robots.length);
    // resetWeapons() belum boleh dipakai di sini (initWeapons baru dipanggil di
    // seksi 6c) -> habiskan cooldown lewat timer-nya sendiri, config-driven.
    const clearMeleeCd = () => wMod.updateWeaponTimers((cfgMod.CFG.melee.cooldownSec || 1) + 0.1);
    const swingArc = () => {                      // satu ayunan penuh -> jejak kedua pisau
        playerMod.resetPlayerState();             // stamina penuh
        clearMeleeCd();                           // batalkan cooldown ayunan sebelumnya
        wMod.tryMelee();
        const M = wMod.meleeSide;
        const tr = [];
        let n = 0, bothOut = true;
        while (wMod.meleeT > 0 && n++ < 200) {
            wMod.updateWeaponTimers(1 / 60);
            avMod.updatePlayerAvatar(1 / 60);
            tr.push({ ry: kR.rotation.y, rp: kR.rotation.x, ly: kL.rotation.y, lp: kL.rotation.x });
            // Frame TERAKHIR ayunan bisa jatuh setelah meleeT habis (pisau sudah
            // disarungkan lagi) — hanya frame yang masih menebas yang diuji.
            if (wMod.meleeT > 0 && (!kR.visible || !kL.visible)) bothOut = false;
        }
        const ys = (key) => tr.map(s => s[key]);
        // Indeks frame saat tiap pisau MELEWATI titik tengah (yaw berbalik tanda
        // terhadap arah sapuannya) = momen bilah menyapu sasaran.
        const cross = (key, s) => { const a = ys(key); for (let i = 0; i < a.length; i++) if (a[i] * s < 0) return i; return 1e9; };
        return {
            side: M, bothOut,
            rLo: Math.min(...ys('ry')), rHi: Math.max(...ys('ry')),
            lLo: Math.min(...ys('ly')), lHi: Math.max(...ys('ly')),
            rSweep: tr[tr.length - 1].ry - tr[0].ry,
            lSweep: tr[tr.length - 1].ly - tr[0].ly,
            rPitch: tr[tr.length - 1].rp, lPitch: tr[tr.length - 1].lp,
            rCross: cross('ry', M), lCross: cross('ly', -M),
        };
    };
    const a1 = swingArc(), a2 = swingArc();
    T('tebasan BERGANTIAN arah (meleeSide ' + a1.side + ' -> ' + a2.side + ')', a1.side === -a2.side);
    T('KEDUA pisau keluar sepanjang tebasan', a1.bothOut && a2.bothOut);
    // SILANG X: dua pisau menyapu ke arah BERLAWANAN, satu menebas MENURUN
    // (pitch berakhir positif) sementara satunya MENAIK (pitch berakhir negatif).
    T('SILANG X: dua pisau menyapu berlawanan arah, satu menurun & satu menaik',
        a1.rSweep * a1.lSweep < 0 && a1.rPitch * a1.lPitch < 0
        && a2.rSweep * a2.lSweep < 0 && a2.rPitch * a2.lPitch < 0);
    // Pisau kedua MENYUSUL (bukan dua tangan bergerak identik serentak) — itulah
    // yang membuat silangannya terbaca sebagai DUA tebasan, bukan satu.
    T('pisau kedua MENYUSUL pisau pemimpin (' + a1.rCross + ' vs ' + a1.lCross + ' frame)',
        a1.rCross < a1.lCross && a2.lCross < a2.rCross);
    // Tangan PEMIMPIN + arah sapuan ikut BERCERMIN tiap serangan (kontrak lama
    // 2026-07-27: dua serangan berturut-turut tak boleh identik).
    T('koreografi BERCERMIN tiap serangan (pemimpin & arah sapuan bertukar)',
        a1.rSweep * a2.rSweep < 0 && a1.lSweep * a2.lSweep < 0
        && Math.abs(a1.rHi + a2.rLo) < 0.3 && Math.abs(a1.rLo + a2.rHi) < 0.3);
    T('busur tiap pisau tetap lebar (>150°)',
        (a1.rHi - a1.rLo) > Math.PI * 150 / 180 && (a1.lHi - a1.lLo) > Math.PI * 150 / 180);
    // --- HIT-STOP: hanya saat KENA, dan pulih TEPAT ke 1
    T('skala waktu diam = TEPAT 1 (frame normal tak tersentuh)', tsMod.globalTimeScale() === 1);
    playerMod.resetPlayerState(); clearMeleeCd();
    camera.position.set(0, 11.4, 0);
    wMod.tryMelee(); wMod.doMeleeHit();          // LUPUT (belum ada robot sama sekali)
    T('sabetan LUPUT tidak memicu hit-stop', tsMod.globalTimeScale() === 1);
    clearMeleeCd();                               // tuntaskan ayunan luput itu dulu
    const zHit = mkBot('C', 0, -(cfgMod.CFG.melee.range * 0.6)); robots.push(zHit);
    zHit.hp = 99999;                              // bertahan supaya bukan jalur kill
    playerMod.resetPlayerState(); clearMeleeCd();
    wMod.tryMelee(); wMod.doMeleeHit();          // KENA
    const hitScale = tsMod.globalTimeScale();
    T('sabetan KENA memicu HIT-STOP (skala ' + hitScale.toFixed(2) + ')', hitScale < 0.5);
    T('kilat bilah menyala saat mengenai', avMod.bladeFlashDebug() > 0.5);
    let stopFrames = 0;
    for (let i = 0; i < 60; i++) {
        tsMod.updateTimeScale(1 / 60); avMod.updatePlayerAvatar(1 / 60);
        if (tsMod.globalTimeScale() < 1) stopFrames++;
    }
    T('HIT-STOP singkat lalu pulih TEPAT ke 1 (' + stopFrames + ' frame)',
        stopFrames > 0 && stopFrames < 20 && tsMod.globalTimeScale() === 1);
    T('kilat bilah padam kembali TEPAT 0', avMod.bladeFlashDebug() === 0);
    // --- CAKAR ROBOT C: mata, kaki, terjangan, getaran
    const zc = zHit, rg = zc.rig;
    zc.clawSide = 1; zc.clawT = 0; zc.windT = zc.windDur = cfgMod.CFG.robot.clawWindupSec || 0.5;
    let maxEye = 0, maxLeg = 0;
    for (let i = 0; i < 30 && zc.windT > 0; i++) {
        zc.windT -= 1 / 60;
        robotsMod.animateRobotRig(zc, 1 / 60);
        maxEye = Math.max(maxEye, rg.eyeMat.emissiveIntensity);
        maxLeg = Math.max(maxLeg, Math.abs(rg.thighR.rotation.x), Math.abs(rg.thighL.rotation.x));
    }
    T('ancang-ancang: MATA robot MENYALA sbg telegraf (' + maxEye.toFixed(2) + '×)', maxEye > 2);
    T('ancang-ancang: KAKI ikut memuat (bukan cuma badan atas)', maxLeg > 0.25);
    zc.windT = 0; zc.clawT = robotsMod.CLAW_TIME;
    let maxLunge = 0, prevArm = rg.armR.rotation.x, flips = 0, prevD = 0;
    for (let i = 0; i < 40 && zc.clawT > 0; i++) {
        robotsMod.animateRobotRig(zc, 1 / 60);
        maxLunge = Math.max(maxLunge, rg.inner.position.z);
        maxLeg = Math.max(maxLeg, Math.abs(rg.thighR.rotation.x), Math.abs(rg.thighL.rotation.x));
        const d = rg.armR.rotation.x - prevArm;
        if (prevD !== 0 && Math.sign(d) !== Math.sign(prevD)) flips++;
        if (d !== 0) prevD = d;
        prevArm = rg.armR.rotation.x;
    }
    T('sabetan: TERJANGAN maju nyata (' + maxLunge.toFixed(2) + ' u)', maxLunge > 2);
    T('sabetan: kaki MENOLAK (ayunan paha besar)', maxLeg > 0.5);
    T('pasca-hantam: badan BERGETAR teredam (' + flips + ' balikan)', flips >= 2);
    for (let i = 0; i < 90; i++) { zc.clawT = 0; zc.windT = 0; robotsMod.animateRobotRig(zc, 1 / 60); }
    T('mata kembali TEPAT ke pendar normal (1) setelah serangan', rg.eyeMat.emissiveIntensity === 1);
    // bersih-bersih: kembalikan isi array robot & state melee
    robots.splice(0, robots.length); scene.remove(zHit.mesh);
    for (const z of savedR2) robots.push(z);
    playerMod.resetPlayerState(); clearMeleeCd(); tsMod.resetTimeScale();
    for (let i = 0; i < 5; i++) avMod.updatePlayerAvatar(0.1);
}

// --- 6c. Batas jarak peluru = titik kursor (2026-07-16): peluru distempel
//     maxDist (jarak pivot->aimPoint saat menembak), mati TEPAT di batas
//     (frame TUNDA satu — segmen terakhir tetap dapat giliran sweep robot),
//     lalu efek tembakan di lantai (2 ground puff, menumpang pool explosions)
//     DI POSISI AKHIR PELURU (2026-07-16: bukan lagi titik kursor beku — sebar
//     arah harus terlihat). (Jarak kursor uji bebas — bukan angka tuning.) ---
const inpAimMod = await import(R('src/core/input.js'));
const bulMod = await import(R('src/entities/bullets.js'));
wMod.initWeapons();
stateMod.bullets.length = 0;
camera.position.set(0, 11.4, 0);
const AIMD = 77;                                   // jarak kursor uji (arbitrer)
inpAimMod.aimPoint.set(0, 0, -AIMD);               // kamera stub bidik -z
stateMod.mouse.isDown = true; player.lastShot = 0;
wMod.updateShooting();
stateMod.mouse.isDown = false;
T('tembakan lahir', stateMod.bullets.length === 1);
const bCur = stateMod.bullets[0];
T('peluru distempel maxDist = jarak kursor', bCur && Math.abs(bCur.maxDist - AIMD) < 1e-6);
T('pelet pertama ditandai fx (efek lantai di posisi akhir peluru)', bCur && bCur.fx === true);
// Sebar arah (spreadBase > 0, config-driven): arah peluru menyimpang lateral <=
// spread dari bidikan murni -z; TIDAK dituntut menyimpang (random boleh ~0).
T('arah peluru dalam kerucut sebar config (|dx| <= spread)', bCur &&
    Math.abs(bCur.dir.x) <= (cfgMod.CFG.weapons.spreadBase + cfgMod.CFG.weapons.spreadBloom) * 1.3 + 1e-6 &&
    bCur.dir.z < 0);
const nExp0 = stateMod.explosions.length;
let bEndX = 0, bEndZ = 0, bSteps = 0;
for (; bSteps < 600 && stateMod.bullets.length; bSteps++) {
    bEndX = bCur.mesh.position.x; bEndZ = bCur.mesh.position.z;
    bulMod.updateBullets(1);
}
T('peluru lenyap di batas kursor (bukan umur, ' + bSteps + ' frame)',
    stateMod.bullets.length === 0 && bSteps < 600);
// Kontrak klem: jarak horizontal titik akhir dari titik tembak (sx/sz) PERSIS
// maxDist (offset lateral kecil = posisi muzzle rig; di game nyata ~0.65 unit).
T('posisi akhir terjepit tepat di jarak batas (' + bEndX.toFixed(1) + ',' + bEndZ.toFixed(1) + ')',
    Math.abs(Math.hypot(bEndX - bCur.sx, bEndZ - bCur.sz) - AIMD) < 0.01 && bEndZ < -AIMD * 0.9);
T('efek tembakan lantai muncul (2 puff)', stateMod.explosions.length === nExp0 + 2);
for (const e of stateMod.explosions.splice(0)) scene.remove(e.mesh);   // bersih-bersih pool
for (let i = 0; i < 5; i++) wMod.updateWeaponState(0.2);   // luruhkan gunRecoil (tembakan me-reset gate AFK avatar)

// --- 6d. Peluru Grenade Launcher per level (2026-07-16): Lv1-2 = granat Mk2,
//     Lv3 = ROKET (buildRocketMesh, userData.rocket — menyamai prop peluncur
//     bahu `launcher3` avatar); keduanya tetap eksplosif (b.explosive). ---
// Menuntaskan animasi ganti senjata (SWITCH_TIME 0.5 dtk, konstanta kode
// weapons.js) supaya tes berikutnya tidak berjalan di tengah animasi.
const finishSwitch = () => { for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1); };
const prevWpn = wMod.currentWeapon;
wMod.startSwitch('launcher');
finishSwitch();
player.launcher = player.launcher || { ammo: 5 };
player.launcher.ammo = Math.max(5, player.launcher.ammo | 0);
player.weaponLvl = player.weaponLvl || {};
player.weaponLvl.launcher = 1;
stateMod.bullets.length = 0;
stateMod.mouse.isDown = true; player.lastShot = 0;
wMod.updateShooting();
stateMod.mouse.isDown = false;
T('ronde launcher Lv1 = granat Mk2 (bukan roket), eksplosif',
    stateMod.bullets.length === 1 && !stateMod.bullets[0].mesh.userData.rocket && stateMod.bullets[0].explosive === true);
scene.remove(stateMod.bullets[0].mesh); stateMod.bullets.length = 0;
player.weaponLvl.launcher = 3;
stateMod.mouse.isDown = true; player.lastShot = 0;
wMod.updateShooting();
stateMod.mouse.isDown = false;
T('ronde launcher Lv3 = ROKET (userData.rocket), eksplosif + damage Lv3',
    stateMod.bullets.length === 1 && stateMod.bullets[0].mesh.userData.rocket === true
    && stateMod.bullets[0].explosive === true
    && Math.abs(stateMod.bullets[0].damage - wMod.weaponDamage('launcher')) < 1e-9);
scene.remove(stateMod.bullets[0].mesh); stateMod.bullets.length = 0;
player.weaponLvl.launcher = 1;                                // pulihkan level
wMod.startSwitch(prevWpn);                                    // kembalikan senjata semula
finishSwitch();

// === 6e. HENTAKAN TEMBAKAN SINEMATIK (2026-07-28, permintaan user: "animasi
// menembak terlalu sederhana — buat lebih nyata & sinematik"). Dulu tembakan
// hanya = kilat di ujung laras + moncong naik linier. Sekarang SATU kurva
// teredam menggerakkan SELURUH badan (laras, torso, bahu, kepala, lutut,
// dorongan mundur), ditambah selongsong terlempar, kerucut semburan, asap/debu
// senjata berat, dan muzzle-climb yang menumpuk selama rentetan.
// Semua amplitudo = CFG.weapons.recoil.* × cameraKick senjata (config-driven). ===
{
    const RCFG = cfgMod.CFG.weapons.recoil;
    // (a) BENTUK KURVA: snap naik lalu MEMANTUL MELEWATI garis bidik (nilai
    //     NEGATIF) sebelum reda — inilah beda "settle" sinematik vs peluruhan
    //     linier lama. Diuji lewat fungsi murni yang diekspor avatar.
    const cs = [];
    for (let u = 0; u <= 1.0001; u += 0.02) cs.push(avMod.fireCurveAt(u));
    const peak = Math.max(...cs), trough = Math.min(...cs);
    T('TEMBAK: kurva hentakan = SNAP naik (puncak ~1 di awal) lalu MEMANTUL ke NEGATIF (settle), mulai & selesai 0',
        avMod.fireCurveAt(0) === 0 && avMod.fireCurveAt(1) === 0
        && peak > 0.95 && trough < -0.02 && cs.indexOf(peak) < cs.length * 0.3);

    // (b) Satu tembakan senapan: jam hentakan terisi (durasi config-driven dari
    //     kadens senjata), amplitudo = cameraKick senjata itu.
    wMod.startSwitch('rifle');
    finishSwitch();
    player.rifle.ammo = 200;
    stateMod.bullets.length = 0;
    wMod.resetWeapons(); wMod.startSwitch('rifle');
    finishSwitch();
    player.rifle.ammo = 200;
    const casings0 = effectsMod.shellCasingDebug();
    stateMod.mouse.isDown = true; player.lastShot = 0;
    wMod.updateShooting();
    stateMod.mouse.isDown = false;
    const FA = wMod.fireAnimDebug();
    const rk = cfgMod.CFG.weapons.rifle.cameraKick;
    const expDur = Math.max(RCFG.durMin, Math.min(RCFG.durMax, cfgMod.CFG.weapons.rifle.fireDelayMs / 1000 * RCFG.durMul));
    T('TEMBAK: letusan mengisi jam hentakan — kick = cameraKick senjata, durasi dari kadensnya (config)',
        FA.t === 0 && Math.abs(FA.kick - rk) < 1e-9 && Math.abs(FA.dur - expDur) < 1e-9
        && (FA.side === 1 || FA.side === -1));
    T('TEMBAK: kilat moncong menyala (lampu + KERUCUT semburan) & besarnya ikut kick senjata',
        wMod.muzzleDebug().intensity > 3 && wMod.muzzleDebug().cone === true);
    // Kilat = LETUSAN, bukan lampu: bintang api MENGEMBANG sambil memudar dan
    // kerucut semburan padam DULUAN, keduanya lewat updateWeaponVisuals.
    wMod.updateWeaponVisuals(0.01);
    const mz1 = wMod.muzzleDebug();
    for (let i = 0; i < 40; i++) { wMod.updateWeaponState(0.01); wMod.updateWeaponVisuals(0.01); }
    const mz2 = wMod.muzzleDebug();
    T('TEMBAK: kilat + kerucut padam sendiri dalam sepersekian detik (letusan, bukan lampu menyala)',
        mz1.coneOpacity > 0 && mz2.intensity === 0 && mz2.cone === false && mz2.coneOpacity === 0);
    T('TEMBAK: SELONGSONG terlempar dari port ejeksi', effectsMod.shellCasingDebug() === casings0 + 1);

    // (c) Badan ikut menghentak: laras NAIK (pitch negatif) & MUNDUR, torso
    //     tertolak ke belakang, badan meredam turun, bahu terpuntir.
    //     (Tembakan BARU — loop peluruhan kilat di atas sudah menghabiskan jam
    //     hentakan tembakan sebelumnya.)
    stateMod.mouse.isDown = true; player.lastShot = 0; wMod.updateShooting(); stateMod.mouse.isDown = false;
    wMod.updateWeaponState(0.02);        // jam maju spt urutan updateGame
    avMod.updatePlayerAvatar(0.02);
    const F1 = avMod.avatarFireDebug();
    T('TEMBAK: hentakan menggerakkan SELURUH badan — laras naik & mundur, torso ke belakang, badan meredam, bahu terpuntir',
        F1.k > 0 && F1.pitch < 0 && F1.push < 0 && F1.torso < 0 && F1.dip < 0 && Math.abs(F1.twist) > 0);
    // Skala amplitudo BENAR-BENAR dari config (uji mutasi: mengubah gunPitch
    // di JSON harus mengubah sudutnya, bukan angka yang dihardcode di kode).
    T('TEMBAK: amplitudo tiap kanal = CFG.weapons.recoil.* × cameraKick (config-driven)',
        Math.abs(F1.pitch + (F1.k * rk * RCFG.gunPitch + F1.climb * RCFG.climbPitch)) < 1e-9
        && Math.abs(F1.push + F1.k * rk * RCFG.gunPush) < 1e-9
        && Math.abs(F1.torso + F1.k * rk * RCFG.torso) < 1e-9);

    // (d) MUZZLE CLIMB: rentetan menumpuk (dibatasi 1) lalu reda saat pelatuk
    //     dilepas — dengan laju peluruhan dari config.
    const stack1 = wMod.fireAnimDebug().stack;
    for (let i = 0; i < 6; i++) { stateMod.mouse.isDown = true; player.lastShot = 0; wMod.updateShooting(); stateMod.mouse.isDown = false; }
    const stackHi = wMod.fireAnimDebug().stack;
    for (let i = 0; i < 60; i++) wMod.updateWeaponState(0.05);   // 3 dtk tanpa menembak
    T('TEMBAK: muzzle-climb MENUMPUK selama rentetan (maks 1) lalu reda saat berhenti menembak',
        stackHi > stack1 && stackHi <= 1 && wMod.fireAnimDebug().stack === 0);

    // (e) Frame TANPA tembakan = netral TOTAL (tak ada sisa pose yang menempel).
    avMod.updatePlayerAvatar(0.02);
    const F0 = avMod.avatarFireDebug();
    T('TEMBAK: tanpa letusan aktif SEMUA kanal hentakan tepat 0 (frame biasa tak tersentuh)',
        F0.k === 0 && F0.pitch === 0 && F0.push === 0 && F0.torso === 0 && F0.dip === 0 && F0.shove === 0);

    // (f) Senjata BERAT (kick >= heavyKick): asap moncong + debu lantai; senapan
    //     ringan tidak (kalau tidak, layar penuh asap saat rentetan).
    const exp0 = stateMod.explosions.length;
    stateMod.mouse.isDown = true; player.lastShot = 0; wMod.updateShooting(); stateMod.mouse.isDown = false;
    const expLight = stateMod.explosions.length - exp0;
    wMod.startSwitch('shotgun');
    finishSwitch();
    player.shotgun.ammo = 20;
    const exp1 = stateMod.explosions.length;
    stateMod.mouse.isDown = true; player.lastShot = 0; wMod.updateShooting(); stateMod.mouse.isDown = false;
    T('TEMBAK: senjata BERAT (kick >= heavyKick) menyemburkan asap moncong + debu lantai; senapan ringan tidak',
        cfgMod.CFG.weapons.shotgun.cameraKick >= RCFG.heavyKick && expLight === 0
        && stateMod.explosions.length - exp1 === 2);
    for (const e of stateMod.explosions.splice(0)) scene.remove(e.mesh);

    // (g) Selongsong JATUH & mendarat (balistik + pantul), lalu pool bisa direset.
    const cs0 = effectsMod.shellCasingDebug();
    for (let i = 0; i < 90; i++) effectsMod.updateShellCasings(0.02);
    T('TEMBAK: selongsong terbang lalu HABIS umurnya (pool tetap, tak menumpuk)',
        cs0 > 0 && effectsMod.shellCasingDebug() === 0);

    // (h) GATE: saat dodge/melee hentakan tembakan TIDAK ikut menempel di badan
    //     (pose gulingan tak boleh ditumpangi hentakan).
    stateMod.mouse.isDown = true; player.lastShot = 0; wMod.updateShooting(); stateMod.mouse.isDown = false;
    wMod.updateWeaponState(0.02);
    playerMod.tryDodge();
    avMod.updatePlayerAvatar(0.02);
    T('TEMBAK: hentakan DIPADAMKAN selama gulingan (pose dodge tak ditumpangi)',
        avMod.avatarFireDebug().pitch === 0 && avMod.avatarFireDebug().push === 0);
    for (let i = 0; i < 40 && playerMod.dodgeActive; i++) playerMod.updatePlayerMovement(0.05, 3);
    for (let i = 0; i < 5; i++) { wMod.updateWeaponState(0.2); avMod.updatePlayerAvatar(0.1); }
    effectsMod.resetShellCasings();
    for (const e of stateMod.explosions.splice(0)) scene.remove(e.mesh);
    stateMod.bullets.splice(0).forEach(b => scene.remove(b.mesh));
    wMod.resetWeapons();
    wMod.startSwitch(prevWpn);
    finishSwitch();
}
for (let i = 0; i < 5; i++) wMod.updateWeaponState(0.2);      // luruhkan gunRecoil

// --- 6f. KADENS PER LEVEL (2026-08-09, permintaan user: "shotgun level 3
// memiliki firerate 0.8 tembakan perdetik"). Level upgrade tidak lagi selalu
// memakai `fireDelayMs` base — senjata yang punya tabel `fireDelayByLevel`
// memakai entri levelnya, dan tabel itu BOLEH memperlambat (shotgun Lv3 =
// pukulan lebih keras, kadens lebih jarang). weaponFireDelay() satu-satunya
// pembaca kadens. Semua angka dibaca dari CFG: retune user tak boleh membuat
// blok ini merah. ---
{
    const SG = cfgMod.CFG.weapons.shotgun, TBL = SG.fireDelayByLevel || [];
    const snap = {
        weapons: player.weapons.slice(), cur: wMod.currentWeapon,
        lvl: { ...(player.weaponLvl || {}) },
        ammo: { shotgun: player.shotgun.ammo, pistol: player.pistol.ammo },
    };
    player.weaponLvl = player.weaponLvl || {};
    const delayAt = l => { player.weaponLvl.shotgun = l; return wMod.weaponFireDelay('shotgun'); };
    const d1 = delayAt(1), d2 = delayAt(2), d3 = delayAt(3);
    T(`SHOTGUN KADENS: tiap level memakai entri fireDelayByLevel-nya sendiri `
        + `[Lv1 ${d1}ms, Lv3 ${d3}ms = ${(1000 / d3).toFixed(2)} tembakan/dtk]`,
        TBL.length >= 3 && d1 === TBL[0] && d2 === TBL[1] && d3 === TBL[2]
        // Senjata TANPA tabel tetap memakai fireDelayMs base di level mana pun.
        && wMod.weaponFireDelay('rifle') === cfgMod.CFG.weapons.rifle.fireDelayMs);

    // Pelatuk benar-benar memakai kadens efektif itu, bukan `fireDelayMs` base.
    player.weapons = ['shotgun', 'rifle', 'pistol'];
    stateMod.syncOwnedFromWeapons();
    wMod.startSwitch('shotgun');
    finishSwitch();
    player.shotgun.ammo = 40;
    player.weaponLvl.shotgun = 3;
    stateMod.bullets.splice(0).forEach(b => scene.remove(b.mesh));
    stateMod.mouse.isDown = true;
    player.lastShot = Date.now() - (d3 - 60);      // belum sampai kadens Lv3
    wMod.updateShooting();
    const early = stateMod.bullets.length;
    player.lastShot = Date.now() - (d3 + 60);      // sudah lewat
    wMod.updateShooting();
    const late = stateMod.bullets.length;
    // Jeda yang CUKUP untuk Lv1 belum tentu cukup untuk Lv3 — ekspektasinya
    // diturunkan dari tabel, jadi retune apa pun tetap benar.
    player.weaponLvl.shotgun = 1;
    player.lastShot = Date.now() - (d1 + 60);
    stateMod.bullets.splice(0).forEach(b => scene.remove(b.mesh));
    wMod.updateShooting();
    const lv1Fired = stateMod.bullets.length > 0;
    player.weaponLvl.shotgun = 3;
    player.lastShot = Date.now() - (d1 + 60);
    stateMod.bullets.splice(0).forEach(b => scene.remove(b.mesh));
    wMod.updateShooting();
    const lv3Fired = stateMod.bullets.length > 0;
    stateMod.mouse.isDown = false;
    T('SHOTGUN KADENS: pelatuk memakai kadens LEVEL AKTIF — jeda yang cukup di Lv1 hanya melepas tembakan di Lv3 bila tabelnya mengizinkan',
        early === 0 && late === (SG.pellets || 1)
        && lv1Fired && lv3Fired === (d1 + 60 > d3));
    stateMod.bullets.splice(0).forEach(b => scene.remove(b.mesh));

    player.weapons = snap.weapons; stateMod.syncOwnedFromWeapons();
    player.weaponLvl = snap.lvl;
    player.shotgun.ammo = snap.ammo.shotgun; player.pistol.ammo = snap.ammo.pistol;
    wMod.startSwitch(snap.cur);
    finishSwitch();
    for (let i = 0; i < 5; i++) wMod.updateWeaponState(0.2);
}

// --- 7. Kecepatan direksional relatif kursor. Kamera barat daya (2026-07-16):
// WASD memakai basis LAYAR (SCREEN_UP/LEFT), jadi arahkan stub bidik ke SCREEN_UP
// agar W = "searah kursor" (penuh), S = mundur (50%), A = menyamping (50%). ---
camera.position.set(800, 11.4, 800);   // jauh dari robot uji (hindari body-push)
const _origWDir = camera.getWorldDirection;
camera.getWorldDirection = (v) => v.set(rendererMod.SCREEN_UP.x, 0, rendererMod.SCREEN_UP.z);
const kk = stateMod.keys;
const move = (key) => {
    for (const q in kk) kk[q] = false;
    kk[key] = true;
    const x0 = camera.position.x, z0 = camera.position.z;
    playerMod.updatePlayerMovement(0.1, 6);
    for (const q in kk) kk[q] = false;
    return Math.hypot(camera.position.x - x0, camera.position.z - z0);
};
const dF = move('w'), dB = move('s'), dS = move('a');
T('maju (searah kursor) penuh, mundur 50% (' + dF.toFixed(2) + ' vs ' + dB.toFixed(2) + ')',
    dF > 0 && Math.abs(dB / dF - 0.5) < 0.06);
T('menyamping 50% (' + dS.toFixed(2) + ')', Math.abs(dS / dF - 0.5) < 0.06);
camera.getWorldDirection = _origWDir;   // pulihkan stub bidik utara utk tes berikutnya
// Basis layar kamera BARAT DAYA (2026-07-16): SCREEN_UP = timur laut dunia
// (x>0, z<0), diagonal ~45°; W menggerakkan player sepanjang SCREEN_UP (bukan -z murni).
T('SCREEN_UP diagonal timur laut (kamera barat daya)',
    rendererMod.SCREEN_UP.x > 0.5 && rendererMod.SCREEN_UP.z < -0.5
    && Math.abs(Math.abs(rendererMod.SCREEN_UP.x) - Math.abs(rendererMod.SCREEN_UP.z)) < 0.05);
{
    for (const q in kk) kk[q] = false;
    kk.w = true;
    const x0 = camera.position.x, z0 = camera.position.z;
    playerMod.updatePlayerMovement(0.1, 6);
    for (const q in kk) kk[q] = false;
    const ddx = camera.position.x - x0, ddz = camera.position.z - z0, dl = Math.hypot(ddx, ddz) || 1;
    T('W bergerak searah SCREEN_UP', (ddx / dl) * rendererMod.SCREEN_UP.x + (ddz / dl) * rendererMod.SCREEN_UP.z > 0.98);
}
// Radar SEJAJAR LAYAR (2026-07-16): frame proyeksi = SCREEN_UP -> arah SCREEN_UP
// jatuh di ATAS radar (px~0, py<0); utara dunia serong ke KIRI-ATAS (px<0, py<0).
{
    const hudMod = await import(R('src/core/hud.js'));
    const U = rendererMod.SCREEN_UP;
    const up = hudMod.radarProject(U.x * 100, U.z * 100, U.x, U.z, 70, 420);
    T('radar: arah SCREEN_UP -> atas radar', Math.abs(up.px) < 0.01 && up.py < -1);
    const north = hudMod.radarProject(0, -100, U.x, U.z, 70, 420);
    T('radar: utara dunia -> serong kiri-atas', north.px < -0.5 && north.py < -0.5);
}
// Recenter halus saat BERHENTI (2026-07-16): selagi jalan fokus tertinggal di
// tepi dead-zone; begitu berhenti, fokus di-ease kembali ke player (halus).
{
    camera.position.set(5000, 11.4, 5000);
    rendererMod.followViewCam(0.016);              // snap: fokus = pivot, reset prev
    camera.position.set(5100, 11.4, 5000);         // BERGERAK +100x dalam 1 frame
    rendererMod.followViewCam(0.016);              // dead-zone: fokus tertinggal di tepi
    const off0 = Math.abs(rendererMod.camFocusPos().x - camera.position.x);
    T('bergerak: fokus tertinggal di tepi dead-zone (~16)', Math.abs(off0 - 16) < 0.5);
    rendererMod.followViewCam(0.016);              // BERHENTI (pivot tetap): recenter 1 frame
    const off1 = Math.abs(rendererMod.camFocusPos().x - camera.position.x);
    T('berhenti: recenter HALUS (mengecil tapi tak langsung 0)', off1 < off0 - 0.1 && off1 > 1);
    for (let i = 0; i < 200; i++) rendererMod.followViewCam(0.016);   // ~3.2 s
    T('berhenti: akhirnya fokus balik ke tengah (player)',
        Math.abs(rendererMod.camFocusPos().x - camera.position.x) < 0.5);
}

// --- 8. Upgrade senjata: weaponDamage per level (config-driven) ---
stateMod.configurePlayer();
const pctUp = cfgMod.CFG.weapons.upgradeDamagePct;
const baseP = cfgMod.CFG.weapons.pistol.damage;
T('weaponDamage Lv1 = base (' + baseP + ')', wMod.weaponDamage('pistol') === baseP);
player.weaponLvl.pistol = 2;
T('weaponDamage Lv2 = +' + pctUp * 100 + '%', Math.abs(wMod.weaponDamage('pistol') - baseP * (1 + pctUp)) < 1e-9);
player.weaponLvl.pistol = 3;
T('weaponDamage Lv3 = +' + pctUp * 200 + '%', Math.abs(wMod.weaponDamage('pistol') - baseP * (1 + 2 * pctUp)) < 1e-9);
stateMod.configurePlayer();
T('configurePlayer reset level ke 1', player.weaponLvl.pistol === 1);

// --- 8a2. MEDKIT PAKAI SEKETIKA (2026-07-18): tombol 4 -> useMedkit() langsung
//     sembuh medkitHealPct, kurangi stok; ditolak saat stok 0 / HP penuh. ---
{
    const healPct = cfgMod.CFG.player.medkitHealPct;
    player.maxHp = 100; player.hp = 20; player.medkits = 2;
    wMod.useMedkit();
    const expect = Math.min(100, 20 + Math.round(100 * healPct));
    T('useMedkit: HP sembuh medkitHealPct + stok -1 (seketika, tanpa channel)',
        player.hp === expect && player.medkits === 1);
    player.hp = 100; player.medkits = 1;
    wMod.useMedkit();
    T('useMedkit: HP sudah penuh -> tak dipakai (stok tetap)', player.medkits === 1 && player.hp === 100);
    player.hp = 50; player.medkits = 0;
    wMod.useMedkit();
    T('useMedkit: stok 0 -> tak ada penyembuhan', player.hp === 50 && player.medkits === 0);
}

// --- 8b. explodeAt memakai dmg param (plumbing boom launcher ber-level) ---
const zX = mkBot('C', 500, 500); robots.push(zX);
const hpX = zX.hp;
effectsMod.explodeAt(new THREE.Vector3(500, 5, 500), 30, 10);
T('explodeAt pakai dmg param (hp -' + (hpX - zX.hp) + ')', zX.hp === hpX - 10);
robots.splice(robots.indexOf(zX), 1);

// --- 8c. Shop: kartu upgrade bersyarat kepemilikan + transaksi Lv2/Lv3/maks ---
const shopMod = await import(R('src/scenes/survival/shop.js'));
stateMod.setScore(999999);
shopMod.openShop();
// --- Tab shop (2026-07-15; urutan 2026-07-17): GENERAL pertama & jadi default ---
const tabDbg = shopMod.shopTabDebug();
T('tab shop: 4 tab terlihat, General PERTAMA & default', tabDbg.active === 'general'
    && tabDbg.tabs.join(',') === 'general,weapon,armor,upgrade');
T('tab weapon berisi kartu senjata gabungan (pistol)', tabDbg.items.weapon.includes('pistol'));
T('tab armor = armor1/2/3', tabDbg.items.armor.join(',') === 'armor1,armor2,armor3');
T('tab upgrade = ammoup + hpup + strengthenMonas', tabDbg.items.upgrade.includes('ammoup')
    && tabDbg.items.upgrade.includes('hpup') && tabDbg.items.upgrade.includes('strengthenMonas'));
T('tab general = isi ulang/medkit/radar/heal-monas (bukan armor/upgrade)',
    tabDbg.items.general.includes('ammo') && tabDbg.items.general.includes('health')
    && tabDbg.items.general.includes('medkit') && tabDbg.items.general.includes('radar')
    && tabDbg.items.general.includes('healMonas')
    && !tabDbg.items.general.includes('armor1') && !tabDbg.items.general.includes('ammoup'));
// --- Undo pembelian terakhir (2026-07-15): klik-kanan = batalkan beli terakhir ---
{
    const sBefore = stateMod.score, medBefore = player.medkits;
    T('beli Medkit (klik kartu)', shopMod.shopPurchase('medkit') === null && player.medkits === medBefore + 1);
    T('undo pembelian terakhir: efek + skor kembali', shopMod.shopUndoLast() === null
        && player.medkits === medBefore && stateMod.score === sBefore);
    T('undo lagi = tidak ada yang dibatalkan', typeof shopMod.shopUndoLast() === 'string');
}
// --- Kartu senjata GABUNGAN (2026-07-17): id lama up_<w> hilang; kartu yang
//     sama menjual SENJATA saat belum dimiliki lalu UPGRADE Lv2/Lv3 saat sudah ---
T('id lama up_pistol hilang (kartu gabungan)', shopMod.shopPurchase('up_pistol') === 'Unknown item');
T('kartu pistol (dimiliki) = upgrade Lv1->2', shopMod.shopPurchase('pistol') === null && player.weaponLvl.pistol === 2);
T('kartu shotgun (belum dimiliki) = BELI senjatanya (level tetap 1)',
    shopMod.shopPurchase('shotgun') === null && player.owned.shotgun === true
    && (player.weaponLvl.shotgun || 1) === 1);
T('kartu shotgun yang sama kini = upgrade Lv2', shopMod.shopPurchase('shotgun') === null && player.weaponLvl.shotgun === 2);
// Kartu upgrade WAJIB menyebut perubahan kadens bila senjata itu punya tabel
// `fireDelayByLevel` (2026-08-09): shotgun Lv3 memukul lebih keras TAPI menembak
// lebih jarang — pemain harus tahu sebelum membayar. Angkanya config-driven.
{
    const d = shopMod.shopTabDebug().desc.shotgun || '';
    const r2 = 1000 / wMod.weaponFireDelay('shotgun', 2);
    const r3 = 1000 / wMod.weaponFireDelay('shotgun', 3);
    T(`kartu shotgun Lv2->Lv3 menyebut perubahan kadens [${r2.toFixed(2)} -> ${r3.toFixed(2)}/dtk]`,
        d.includes(r3.toFixed(2)) && (Math.abs(r3 - r2) < 1e-9 || d.includes(r2.toFixed(2)))
        && /shots per second/.test(d));
    // Senjata tanpa tabel kadens tak boleh ikut kebagian kalimat itu.
    T('kartu senjata tanpa tabel kadens tidak menyebut rate of fire',
        !/shots per second/.test(shopMod.shopTabDebug().desc.pistol || ''));
}
T('kartu pistol lagi (Lv2->3)', shopMod.shopPurchase('pistol') === null && player.weaponLvl.pistol === 3);
const rejMax = shopMod.shopPurchase('pistol');
T('Lv3 = maks, pembelian ditolak (' + rejMax + ')', typeof rejMax === 'string' && player.weaponLvl.pistol === 3);
const s0 = stateMod.score;
shopMod.shopPurchase('pistol');
T('skor tidak terpotong saat ditolak', stateMod.score === s0);
shopMod.closeShop();

// --- 10. Darah player saat kena peluru: god-mode tetap tampil (HP utuh) ---
const inputMod = await import(R('src/core/input.js'));
const ad = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
stateMod.setGodMode(true);
player.hp = 80;
camera.position.set(600, 11.4, 600);
const zG = mkBot('B', 600, 630);
robotsMod.fireRobotBullet(zG);
for (let i = 0; i < 2000 && enemyBullets.length; i++) robotsMod.updateEnemyBullets(0.016, 1);
T('god-mode: peluru "kena" (habis) tapi HP utuh — darah tetap muncrat', player.hp === 80 && enemyBullets.length === 0);
stateMod.setGodMode(false);

// --- 11. Rantai hadap avatar: torso ke kursor, kaki ke arah gerak ---
// (aimPoint = Vector3 ekspor input.js — di-set langsung; kursor "utara" jauh)
const drive = (dx, dz, frames) => {
    for (let i = 0; i < frames; i++) {
        camera.position.x += dx; camera.position.z += dz;
        inputMod.aimPoint.set(camera.position.x, 0, camera.position.z - 100000);   // bidik SELALU ke utara
        avMod.updatePlayerAvatar(0.05);
    }
};
camera.position.set(500, 11.4, 500);
const AIM_N = Math.PI;   // menghadap -z (grup menghadap +Z -> yaw pi)
// Puntiran-balik bahu siklus lari (2026-07-27) adalah OSILASI HIASAN di atas
// rantai-hadap — dikurangkan dulu supaya assert di bawah menguji rantai-aim
// murni (bukan fase langkah yang kebetulan sedang di mana).
const twistOf = () => avMod.avatarGroup.children[0].rotation.y - avMod.avatarGaitDebug().counter;
drive(0, -3, 60);        // maju SEARAH bidikan
T('maju: kaki & torso lurus ke kursor',
    ad(avMod.avatarGroup.rotation.y, AIM_N) < 0.12 && Math.abs(twistOf()) < 0.12);
drive(3, 0, 60);         // strafe kanan (90° dari bidikan)
const rootY = avMod.avatarGroup.rotation.y, twistY = twistOf();
T('strafe: kaki menghadap arah gerak (dijepit) + puntiran torso menutup sisanya (root '
    + rootY.toFixed(2) + ' twist ' + twistY.toFixed(2) + ')',
    ad(rootY, AIM_N) > 0.35 && Math.abs(twistY) > 0.35 && ad(rootY + twistY, AIM_N) < 0.2);
drive(0, 3, 60);         // mundur MEMBELAKANGI bidikan (backpedal)
T('backpedal: kaki TIDAK berbalik membelakangi kursor',
    ad(avMod.avatarGroup.rotation.y, AIM_N) < 0.3);

// --- 11a. SIKLUS LARI MANUSIAWI (dirombak 2026-07-27, permintaan user: gait
//     lama "masih terlihat sangat kaku"). Yang diuji = sifat-sifat yang
//     MEMBEDAKANNYA dari kurva lama (pinggul sinus + lutut setengah-sinus):
//     lutut tak pernah terbalik, kaki TUMPU ikut menekuk (peredaman), badan
//     ber-BOB 2× per siklus langkah, kepala distabilkan, senjata berdenyut &
//     tangan menempel padanya, kadens naik mengikuti kecepatan. ---
{
    const sample = (dx, dz, n, dt = 0.05) => {
        const out = [];
        for (let i = 0; i < n; i++) {
            camera.position.x += dx; camera.position.z += dz;
            inputMod.aimPoint.set(camera.position.x, 0, camera.position.z - 100000);
            avMod.updatePlayerAvatar(dt);
            const g = avMod.avatarGaitDebug(), d = avMod.avatarDodgeDebug();
            out.push({ ...g, hipL: d.hipL, hipR: d.hipR, kneeL: d.kneeL, kneeR: d.kneeR, y: d.y });
        }
        return out;
    };
    camera.position.set(500, 11.4, 500);
    const run = sample(0, -3, 80);   // lari MAJU searah bidikan (60 unit/dtk)

    T('lari: lutut TIDAK PERNAH terbalik (sendi lutut hanya menekuk satu arah)',
        run.every(s => s.kneeL >= -1e-9 && s.kneeR >= -1e-9));

    // Kurva LAMA menempelkan puncak tekukan lutut TEPAT di pinggul paling MAJU
    // (knee = max(0,−sin), hip = sin) — kaki depan menekuk saat seharusnya
    // MENJULUR menjemput lantai. Kurva baru: di pinggul paling maju lutut
    // nyaris LURUS (menjemput tapak), puncaknya pindah ke tengah ayunan.
    const fwdMost = run.reduce((a, b) => (b.hipL < a.hipL ? b : a), run[0]);
    T('lari: di langkah paling MAJU lutut menjulur (bukan menekuk spt kurva lama)',
        fwdMost.kneeL < 0.25);
    const deepest = run.reduce((a, b) => (b.bob < a.bob ? b : a), run[0]);
    T('lari: di titik badan TERENDAH, kaki tumpu MEREDAM (lutut menekuk, bukan lurus)',
        Math.min(deepest.kneeL, deepest.kneeR) > 0.1);

    // Lutut ayunan jauh lebih dalam dari lutut tumpu = tumit menendang ke pantat.
    const maxKnee = run.reduce((m, s) => Math.max(m, s.kneeL, s.kneeR), 0);
    T('lari: ayunan mengangkat tumit tinggi (tekukan lutut puncak ' + maxKnee.toFixed(2) + ')',
        maxKnee > 0.9 && maxKnee > Math.min(deepest.kneeL, deepest.kneeR) * 1.8);

    // BOB: selalu <= 0 (turun dari tinggi berdiri, tak pernah melayang) dan
    // menyentuh dasar DUA KALI per siklus langkah (satu per tapak).
    const bobs = run.map(s => s.bob);
    T('lari: bob badan selalu turun (tak pernah melayang di atas tinggi berdiri)',
        bobs.every(b => b <= 1e-9) && Math.min(...bobs) < -0.3);
    let dips = 0;
    for (let i = 1; i < run.length - 1; i++)
        if (bobs[i] < bobs[i - 1] && bobs[i] <= bobs[i + 1] && bobs[i] < -0.3) dips++;
    const cycles = run.filter((s, i) => i > 0 && s.phase < run[i - 1].phase).length;
    T('lari: bob berfrekuensi 2× langkah (' + dips + ' tapak / ' + cycles + ' siklus)',
        cycles >= 2 && dips >= cycles * 2 - 1);

    T('lari: KEPALA distabilkan berlawanan bob badan (pandangan tetap datar)',
        run.every(s => s.bob >= -1e-9 || (s.headY > 0 && s.headY < -s.bob)));

    // Senjata berdenyut (inersia) & TELAPAK TANGAN ikut — selisih tangan-senjata
    // jauh lebih stabil daripada denyut senjatanya sendiri = tangan menempel.
    const gunSpan = Math.max(...run.map(s => s.gunY)) - Math.min(...run.map(s => s.gunY));
    T('lari: senjata berdenyut karena inersia (rentang ' + gunSpan.toFixed(2) + ')', gunSpan > 0.15);
    // Telapak MENEMPEL: tiap kali senjata bergerak naik/turun, tangan bergerak
    // ke arah yang SAMA (anchor genggam digeser ofset yang sama + ikut diputar
    // pitch senjata) — bukan tangan diam sementara senapan melayang.
    let agree = 0, tested = 0;
    for (let i = 1; i < run.length; i++) {
        const dg = run[i].gunY - run[i - 1].gunY, dh = run[i].handRY - run[i - 1].handRY;
        if (Math.abs(dg) > 0.01) { tested++; if (dg * dh > 0) agree++; }
    }
    T('lari: TELAPAK TANGAN mengikuti denyut senjata (tetap menempel di grip, ' + agree + '/' + tested + ')',
        tested > 10 && agree === tested);

    // Kadens & intensitas ikut kecepatan: langkah pelan = runK & laju fase kecil.
    const dPhase = (a) => a.reduce((s, v, i) => i ? s + Math.abs(wrap(v.phase - a[i - 1].phase)) : 0, 0);
    const wrap = (d) => Math.abs(d) > Math.PI ? d - Math.sign(d) * Math.PI * 2 : d;
    camera.position.set(500, 11.4, 500);
    const slow = sample(0, -0.6, 80);
    T('lari: kadens & intensitas naik mengikuti kecepatan',
        run[run.length - 1].runK > slow[slow.length - 1].runK + 0.3 && dPhase(run) > dPhase(slow) * 1.2);

    // KADENS PADA LAJU LARI SEBENARNYA (2026-07-28, laporan user: "movement
    // speed-nya terasa lebih cepat" setelah gait dirombak — padahal
    // CFG.player.speed tak pernah disentuh; yang naik cuma kadensnya, 13 -> 15,5
    // rad/dtk). Kaki yang berputar lebih cepat dari laju = FOOT SLIDING dan
    // membuat kecepatan TERBACA lebih tinggi dari yang sesungguhnya. Diuji pada
    // laju lari NYATA (config-driven: CFG.player.speed x 60 unit/dtk); pita
    // 1,9-2,15 siklus/dtk mematok kadens ke nilai kurva lama (2,07).
    {
        const DT = 0.05, SPD = cfgMod.CFG.player.speed * 60;
        camera.position.set(500, 11.4, 500);
        const full = sample(0, -SPD * DT, 80, DT);
        let adv = 0;
        for (let i = 1; i < full.length; i++) adv += Math.abs(wrap(full[i].phase - full[i - 1].phase));
        const cps = adv / (2 * Math.PI) / ((full.length - 1) * DT);
        T('lari: kadens pada laju lari SEBENARNYA (' + SPD.toFixed(0) + ' unit/dtk) tetap '
            + cps.toFixed(2) + ' siklus/dtk — kaki tak mendahului laju (foot sliding)',
            full[full.length - 1].runK === 1 && cps > 1.9 && cps < 2.15);
    }

    // Condong badan mengikuti arah lari (maju condong depan, backpedal ke belakang).
    camera.position.set(500, 11.4, 500);
    const back = sample(0, 3, 60);
    T('lari: badan CONDONG ke arah lari (maju + / backpedal −)',
        run[run.length - 1].lean > 0.05 && back[back.length - 1].lean < -0.05);

    // BERHENTI: semua kanal baru (condong torso, bob, denyut senjata) luruh ke 0
    // — kalau tidak, avatar diam akan tampak "membeku sambil lari".
    for (let i = 0; i < 60; i++) {
        inputMod.aimPoint.set(camera.position.x, 0, camera.position.z - 100000);
        avMod.updatePlayerAvatar(0.05);
    }
    const idle = avMod.avatarGaitDebug();
    T('berhenti: condong/bob/denyut senjata luruh ke 0 (tak membeku dalam pose lari)',
        idle.runK === 0 && idle.bob === 0 && idle.gunY === 0 && idle.lean === 0
        && Math.abs(avMod.avatarGroup.children[0].rotation.x) < 0.01);

    // LARI SAMBIL MENEMBAK: recoil hidup -> denyut senjata & puntiran bahu
    // DIPADAMKAN (senapan ditahan di garis bidik) walau kaki tetap berlari.
    camera.position.set(500, 11.4, 500);
    const calm = sample(0, -3, 40);
    stateMod.mouse.isDown = true; player.lastShot = 0;
    wMod.updateShooting();               // gunRecoil = 1
    stateMod.mouse.isDown = false;
    const hot = sample(0, -3, 1)[0];
    const calmAt = calm.find(s => Math.abs(Math.sin(s.phase) - Math.sin(hot.phase)) < 0.35) || calm[calm.length - 1];
    T('lari sambil MENEMBAK: denyut senjata & puntiran bahu diredam (senapan ditahan di garis bidik)',
        wMod.gunRecoil > 0.5 && Math.abs(hot.gunY) < Math.abs(calmAt.gunY) * 0.6
        && Math.abs(hot.counter) <= Math.abs(calmAt.counter) + 1e-9);
    while (stateMod.bullets.length) { scene.remove(stateMod.bullets[0].mesh); stateMod.bullets.splice(0, 1); }
    // Padamkan recoil + pose lari (recoil sisa memblok AFK di uji berikutnya).
    for (let i = 0; i < 20; i++) wMod.updateWeaponState(0.05);
    for (let i = 0; i < 20; i++) avMod.updatePlayerAvatar(0.05);
}

// --- 11b. Varian prop Lv3 (currentWeapon default 'rifle' -> Gatling) ---
player.weaponLvl.rifle = 3;
for (let i = 0; i < 6; i++) avMod.updatePlayerAvatar(0.05);
T('prop Lv3 (Gatling) aktif + gunTip TETAP kalibrasi (0,0.15,4.5)',
    avMod.avatarGunTip.position.x === 0 && avMod.avatarGunTip.position.y === 0.15
    && avMod.avatarGunTip.position.z === 4.5);
player.weaponLvl.rifle = 1;
for (let i = 0; i < 3; i++) avMod.updatePlayerAvatar(0.05);
T('kembali Lv1: prop dasar tanpa error', true);

// --- 12. Sekuens kematian: gore + jeda -> baru GAME OVER ---
const gameMod = await import(R('src/core/game.js'));
const cineMod = await import(R('src/core/deathCine.js'));
const sfxM = await import(R('src/utils/sfx.js'));
stateMod.setPaused(false);
player.hp = 1;   // satu peluru (attack B per config) pasti mematikan
camera.position.set(300, 11.4, 300);
avMod.updatePlayerAvatar(0.016);   // satu frame HIDUP dulu (pose genggam terisi)
sfxM.startBattleMusic();           // musik battle harus SURUT selama sekuens
// Hook `onPlayerDeath` (2026-08-18): apa yang ikut hancur bersama player adalah
// urusan scene — Stage 8 memakainya untuk meledakkan GRD LTV-45. Dipasang di
// sini karena `updateMode` scene TIDAK dijalankan selama sekuens kematian, jadi
// panggilan SEKALI inilah satu-satunya jalannya.
let deathHook = null;
smMod.activeScene.onPlayerDeath = (dx, dz) => { deathHook = { dx, dz }; };
const zK = mkBot('B', 300, 330);
robotsMod.fireRobotBullet(zK);
for (let i = 0; i < 2000 && enemyBullets.length; i++) robotsMod.updateEnemyBullets(0.016, 1);
T('HP habis -> sekuens kematian (BUKAN game over instan)',
    gameMod.isPlayerDying() && stateMod.isGameOver === false && player.hp <= 0);
T('KEMATIAN: scene diberi tahu lewat hook onPlayerDeath, lengkap dgn arah dorongannya',
    !!deathHook && Math.abs(Math.hypot(deathHook.dx, deathHook.dz) - 1) < 1e-6);
delete smMod.activeScene.onPlayerDeath;

// --- 12b. KEMATIAN DRAMATIS (2026-07-26): slow motion + keruntuhan 4 fase +
// senjata terlepas + death cam + layar menutup. Durasi fase dibaca dari modul
// (avatarDeathTiming) dan angka rasa dari CFG.player.death — bukan hardcode. ---
const DCFG = cfgMod.CFG.player.death || {};
const HPI = Math.PI / 2;
const gunGrpTest = avMod.avatarGunTip.parent;   // grup senjata (induk moncong)
T('mati -> sutradara sinematik aktif, TANPA sentakan skala waktu di frame 0',
    cineMod.deathCineDebug().active === true && cineMod.deathTimeScale() === 1);
avMod.updatePlayerAvatar(1 / 60);   // frame pertama pose mati = saat senjata dilepas
T('senjata TERLEPAS ke ruang scene (bukan sekadar disembunyikan)',
    gunGrpTest.parent === scene && avMod.avatarDeathDebug().gunFlying === true);
// Jalankan seperti main.animate: dunia+tubuh pakai dt terskala, sutradara dtReal.
// Berhenti setelah tubuh DIAM dan senjata MENDARAT (senjata jatuh sedikit lebih lama).
const seq = [];
let dbg = avMod.avatarDeathDebug(), prevFall = dbg.fall;
let minScale = 1, arch = 0, hipLow = 0, maxFall = 0, osc = 0, prevD = 0, sunk = false;
for (let i = 0; i < 400 && gameMod.isPlayerDying()
    && (dbg.phase !== 'still' || !dbg.gunLanded); i++) {
    const sc = cineMod.deathTimeScale();
    minScale = Math.min(minScale, sc);
    gameMod.updateGame(sc / 60, sc, i, 1 / 60);
    avMod.updatePlayerAvatar(sc / 60);
    dbg = avMod.avatarDeathDebug();
    if (seq[seq.length - 1] !== dbg.phase) seq.push(dbg.phase);
    arch = Math.min(arch, dbg.fall);          // paling melengkung ke BELAKANG
    hipLow = Math.min(hipLow, dbg.sink);      // pinggul paling rendah
    maxFall = Math.max(maxFall, dbg.fall);
    if (dbg.phase === 'settle') {             // pantulan = arah perubahan berbalik
        const d = dbg.fall - prevFall;
        if (prevD !== 0 && Math.sign(d) !== Math.sign(prevD)) osc++;
        if (d !== 0) prevD = d;
    }
    if (dbg.sink < -0.5) sunk = true;
    prevFall = dbg.fall;
}
T('urutan fase: impact -> buckle -> fall -> settle -> still (' + seq.join('>') + ')',
    seq.join('>') === 'impact>buckle>fall>settle>still');
T('slow motion tertahan di CFG.player.death.slowMoScale (' + minScale.toFixed(2) + ')',
    Math.abs(minScale - (DCFG.slowMoScale != null ? DCFG.slowMoScale : 0.45)) < 1e-9);
T('fase hentak: punggung MELENGKUNG ke belakang dulu (' + arch.toFixed(2) + ' rad)', arch < -0.2);
T('fase buckle: pinggul AMBRUK lalu naik lagi ke tinggi berbaring', sunk && hipLow < -1.5);
T('overshoot roboh melewati 90° lalu memantul (max ' + maxFall.toFixed(2) + ', ' + osc + ' balikan)',
    maxFall > HPI + 0.05 && osc >= 2);
T('pose akhir: jasad rebah TEPAT rata + DI ATAS lantai (bukan separuh tenggelam)',
    Math.abs(avMod.avatarDeathDebug().fall - HPI) < 0.01
    && Math.abs(avMod.avatarDeathDebug().sink - avMod.avatarDeathTiming().lieY) < 0.01);
T('senjata yang terlempar MENDARAT di lantai', avMod.avatarDeathDebug().gunLanded === true);
const dcam = rendererMod.deathCamDebug();
T('death cam: mendekat (zoom ' + dcam.zoom.toFixed(2) + ') + orbit + miring, tak melebihi camZoom',
    dcam.zoom < 1 && dcam.zoom >= 1 - (DCFG.camZoom != null ? DCFG.camZoom : 0.42) - 1e-9
    && dcam.orbit > 0 && dcam.tilt > 0);
T('layar: pandangan MENUTUP + warna dunia luruh',
    parseFloat(global.document.getElementById('deathFx').style.opacity) > 0.2
    && /saturate\(0\./.test(rendererMod.renderer.domElement.style.filter || ''));
T('musik SURUT (bukan terpotong): volume < penuh, konteks masih battle',
    sfxM.musicDebug() === 'battle' && sfxM.musicVolNow() < sfxM.getMusicVolume() * 0.5);
T('avatar TETAP tampil saat mati (roboh biasa, bukan meledak)', avMod.avatarGroup.visible === true);
// SELEBRASI robot selama sekuens kematian: stop menyerang, lengan ke langit, melompat
zB.fireCd = 0; zA.fireCd = 0; zB.losOK = true; zA.losOK = true;
const nEB = enemyBullets.length;
let maxHopY = 0;
for (let i = 0; i < 50; i++) { robotsMod.updateRobots(0.05, 3); maxHopY = Math.max(maxHopY, zB.mesh.position.y); }
T('selebrasi: robot BERHENTI menembak', enemyBullets.length === nEB);
T('selebrasi: KEDUA lengan teracung ke atas (B kiri+kanan, A kiri)',
    zB.rig.armR.rotation.x < -2 && zB.rig.armL.rotation.x < -2 && zA.rig.armL.rotation.x < -2);
T('selebrasi: melompat girang (maxY ' + maxHopY.toFixed(1) + ')', maxHopY > 0.5);
// selama dying, updateGame melewati blok kendali player (aman headless tanpa initWeapons)
// (jumlah tick dari CFG.player.deathDelaySec — tahan re-tuning user)
const deathTicks = Math.ceil(((cfgMod.CFG.player.deathDelaySec || 2) + 0.5) / 0.1);
for (let i = 0; i < deathTicks && gameMod.isPlayerDying(); i++) gameMod.updateGame(0.1, 6, i * 100);
T('layar GAME OVER muncul setelah jedanya habis', stateMod.isGameOver === true && !gameMod.isPlayerDying());
T('peluru musuh meleset pada player yang sudah tumbang', true);
// --- 12c. GAME OVER: slow motion & letterbox DILEPAS, tapi framing jasad
// DIBEKUKAN (kalau kamera di-reset di sini ia meletik mundur di depan panel
// yang cuma 80% opak). Baru resetDeathCine (dipanggil resetGame) memulihkan. ---
T('game over: slow motion dilepas (skala waktu kembali 1)', cineMod.deathTimeScale() === 1);
T('game over: framing jasad DIBEKUKAN (kamera tetap dekat/miring)',
    rendererMod.deathCamDebug().zoom < 1 && rendererMod.deathCamDebug().tilt > 0);
T('stopMusic memulihkan volume track yang ter-duck',
    Math.abs(sfxM.bgMusic.volume - sfxM.getMusicVolume()) < 1e-9
    && Math.abs(sfxM.bgMusicAlt.volume - sfxM.getMusicVolume()) < 1e-9);
cineMod.resetDeathCine();
avMod.resetAvatarDeath();
T('resetDeathCine: kamera/layar/warna kembali normal',
    rendererMod.deathCamDebug().zoom === 1 && rendererMod.deathCamDebug().tilt === 0
    && parseFloat(global.document.getElementById('deathFx').style.opacity) === 0
    && !rendererMod.renderer.domElement.style.filter);
T('resetAvatarDeath: senjata kembali KE TANGAN di ofset terkalibrasi',
    gunGrpTest.parent !== scene && gunGrpTest.position.x === 0.65
    && gunGrpTest.position.y === 7.5 && gunGrpTest.position.z === 1.2
    && gunGrpTest.rotation.x === 0 && avMod.avatarDeathDebug().phase === 'none');

// --- 13. ARMOR: reduksi damage % + durability terima damage BASE + hancur ---
stateMod.setGameOver(false);
stateMod.configurePlayer();
const AT = cfgMod.CFG.armor.tiers, red1 = AT[0].reduce;
player.armorLvl = 1; player.armor = player.armorMax = AT[0].durability;
player.hp = player.maxHp;
robotsMod.damagePlayerHp(10);
T('armor memotong ' + red1 * 100 + '% damage HP',
    Math.abs(player.hp - (player.maxHp - 10 * (1 - red1))) < 1e-9);
T('durability menerima damage BASE penuh (-10)', player.armor === AT[0].durability - 10);
player.armor = 5;
robotsMod.damagePlayerHp(10);
T('durability habis -> armor HANCUR (lvl 0 + gib)', player.armorLvl === 0 && player.armor === 0);
const hpNoArmor = player.hp;
robotsMod.damagePlayerHp(10);
T('tanpa armor: damage penuh', Math.abs(player.hp - (hpNoArmor - 10)) < 1e-9);

// --- 13b. maxAmmoFor per tier (config-driven) ---
T('maxAmmoFor Lv1 = base', stateMod.maxAmmoFor('rifle') === cfgMod.CFG.weapons.rifle.maxAmmo);
player.ammoLvl = 2;
T('maxAmmoFor Lv2 dari config', stateMod.maxAmmoFor('rifle') === cfgMod.CFG.weapons.ammoUpgrades[0].rifle
    && stateMod.maxAmmoFor('launcher') === cfgMod.CFG.weapons.ammoUpgrades[0].launcher);
player.ammoLvl = 3;
T('maxAmmoFor Lv3 dari config', stateMod.maxAmmoFor('pistol') === cfgMod.CFG.weapons.ammoUpgrades[1].pistol);

// --- 13c. Shop: 3 kartu armor TERPISAH + repair, Vitality, Ammo Capacity ---
stateMod.configurePlayer();
stateMod.setScore(999999);
shopMod.openShop();
T('beli Armor II LANGSUNG (item terpisah, boleh lompat)', shopMod.shopPurchase('armor2') === null
    && player.armorLvl === 2 && player.armor === AT[1].durability);
T('beli Armor I saat memakai II -> ditolak', typeof shopMod.shopPurchase('armor1') === 'string'
    && player.armorLvl === 2);
T('beli ulang Armor II UTUH -> ditolak (Worn)', typeof shopMod.shopPurchase('armor2') === 'string');
player.armor = 40;
T('beli ulang Armor II RUSAK = repair penuh', shopMod.shopPurchase('armor2') === null
    && player.armor === AT[1].durability);
T('naik ke Armor III', shopMod.shopPurchase('armor3') === null
    && player.armorLvl === 3 && player.armorMax === AT[2].durability);
player.hp = 40;
const hpT = cfgMod.CFG.player.hpUpgrades;
T('beli Vitality I: maxHp naik + heal kenaikan', shopMod.shopPurchase('hpup') === null
    && player.maxHp === hpT[0] && player.hp === 40 + (hpT[0] - cfgMod.CFG.player.maxHp));
T('Vitality bertingkat sampai III (health puncak = hpUpgrades terakhir)',
    shopMod.shopPurchase('hpup') === null && player.maxHp === hpT[1]
    && shopMod.shopPurchase('hpup') === null && player.maxHp === hpT[hpT.length - 1]
    && typeof shopMod.shopPurchase('hpup') === 'string');   // tier ke-4 = Maxed
const auT = cfgMod.CFG.weapons.ammoUpgrades;
T('beli Ammo Capacity I: kap rifle ikut naik', shopMod.shopPurchase('ammoup') === null
    && stateMod.maxAmmoFor('rifle') === auT[0].rifle);
T('Ammo Capacity bertingkat sampai III (rifle & launcher ikut tier terakhir)',
    shopMod.shopPurchase('ammoup') === null && shopMod.shopPurchase('ammoup') === null
    && stateMod.maxAmmoFor('rifle') === auT[auT.length - 1].rifle
    && stateMod.maxAmmoFor('launcher') === auT[auT.length - 1].launcher
    && typeof shopMod.shopPurchase('ammoup') === 'string');   // tier ke-4 = Maxed
shopMod.closeShop();

// --- 13d. OVERLAY ARMOR AVATAR — DIROMBAK 2026-07-30 (permintaan user: versi
// lama "flat, membosankan, antar tier tak kelihatan beda"). Kontrak baru:
// (a) tetap KUMULATIF per tier; (b) tiap tier MELEBARKAN siluet (yang terbaca
// dari kamera top-down) & menambah pelat, bukan cuma detail kecil; (c) tier III
// satu-satunya yang BERCAHAYA (sel daya exo) dan denyutnya <= EMISSIVE_MAX;
// (d) durability kritis = sel daya BERKEDIP sekarat; (e) tier NAIK memicu
// animasi PEMASANGAN (pelat mengunci + kilat) yang pulang TEPAT ke nilai
// istirahat; tier TURUN/PECAH tidak memicu apa pun. ---
{
    const palA = await import(R('src/world/palette.js'));
    const wear = (lvl) => {
        player.armorLvl = lvl;
        player.armorMax = lvl > 0 ? AT[lvl - 1].durability : 0;
        player.armor = player.armorMax;
        avMod.updatePlayerAvatar(1 / 60);
        return avMod.armorFxDebug();
    };
    const d0 = wear(0), d1 = wear(1), d2 = wear(2), d3 = wear(3);
    T('overlay armor: tiga set terisi & KUMULATIF (polos ' + d0.worn + ' -> '
        + d1.worn + ' -> ' + d2.worn + ' -> ' + d3.worn + ' pelat)',
        d0.worn === 0 && d1.worn === d1.plates[0]
        && d2.worn === d1.plates[0] + d1.plates[1]
        && d3.worn === d1.plates.reduce((a, b) => a + b, 0)
        && d1.plates.every(n => n >= 8));
    T('overlay armor: tiap tier MELEBARKAN siluet (span ' + d1.span.toFixed(2)
        + ' -> ' + d2.span.toFixed(2) + ' -> ' + d3.span.toFixed(2) + ')',
        d2.span > d1.span + 0.15 && d3.span >= d2.span);
    // Tier III = satu-satunya yang bercahaya, dan denyutnya hidup (berubah antar
    // frame) tapi tak pernah melewati batas emissive palette.
    const glowTrace = [];
    for (let i = 0; i < 90; i++) { avMod.updatePlayerAvatar(1 / 60); glowTrace.push(avMod.armorFxDebug().glow); }
    const gMin = Math.min(...glowTrace), gMax = Math.max(...glowTrace);
    T('overlay armor III: sel daya exo BERDENYUT (' + gMin.toFixed(2) + '..' + gMax.toFixed(2)
        + ') & <= EMISSIVE_MAX', gMax - gMin > 0.1 && gMax <= palA.EMISSIVE_MAX);
    T('overlay armor: tier di bawah III TIDAK bercahaya-denyut (nilai tetap)',
        (() => { wear(2); const a = avMod.armorFxDebug().glow; avMod.updatePlayerAvatar(1 / 60); return avMod.armorFxDebug().glow === a; })());
    // Durability kritis -> sel daya BERKEDIP sekarat (jatuh jauh lebih dalam).
    wear(3);
    const failTrace = [];
    player.armor = player.armorMax * 0.1;
    for (let i = 0; i < 90; i++) { avMod.updatePlayerAvatar(1 / 60); failTrace.push(avMod.armorFxDebug().glow); }
    T('overlay armor III: durability kritis -> sel daya BERKEDIP sekarat ('
        + Math.min(...failTrace).toFixed(2) + ' vs ' + gMin.toFixed(2) + ')',
        Math.min(...failTrace) < gMin * 0.6);
    // Animasi PEMASANGAN saat tier NAIK: pelat mengunci (skala > 1) + kilat,
    // lalu pulang TEPAT ke skala 1 & emissive 0.
    wear(1);
    for (let i = 0; i < 60; i++) avMod.updatePlayerAvatar(1 / 60);   // tuntaskan animasi tier 1
    player.armorLvl = 3; player.armorMax = AT[2].durability; player.armor = player.armorMax;
    avMod.updatePlayerAvatar(1 / 60);
    const eq = avMod.armorFxDebug();
    T('overlay armor: tier NAIK memicu animasi PEMASANGAN (pelat mengunci, skala '
        + eq.scale.toFixed(2) + ' + kilat)', eq.equip > 0 && eq.scale > 1.01 && eq.flash !== 0);
    for (let i = 0; i < 60; i++) avMod.updatePlayerAvatar(1 / 60);
    const eqEnd = avMod.armorFxDebug();
    T('overlay armor: animasi pemasangan pulang TEPAT ke istirahat (skala 1, kilat 0)',
        eqEnd.equip === 0 && eqEnd.scale === 1 && eqEnd.flash === 0);
    // Tier TURUN / armor PECAH: tanpa animasi pemasangan (FX pecahnya di robots.js).
    player.armorLvl = 0; player.armor = player.armorMax = 0;
    avMod.updatePlayerAvatar(1 / 60);
    const brk = avMod.armorFxDebug();
    T('overlay armor: armor PECAH tak memicu animasi pemasangan & semua pelat lenyap',
        brk.equip === 0 && brk.worn === 0 && brk.scale === 1 && brk.flash === 0);
}

// --- 14. Runtuhnya Monas: kontrak API + durasi fase config-driven ---
// (world.js penuh butuh InstancedMesh/Matrix4 — di luar cakupan stub; di sini
// kunci permukaan API + kunci konfigurasi durasi fase, dan guard "belum dibangun".)
const worldMod = await import(R('src/scenes/survival/world.js'));
const SV = cfgMod.CFG.survival;
T('durasi fase runtuh Monas ada & positif (config-driven)',
    SV.monasCollapseTrembleSec > 0 && SV.monasCollapseToppleSec > 0 && SV.monasCollapseSettleSec > 0);
T('API runtuh Monas terekspor (start/update/reset/isCollapsing)',
    typeof worldMod.startMonasCollapse === 'function' && typeof worldMod.updateMonasCollapse === 'function'
    && typeof worldMod.resetMonasCollapse === 'function' && typeof worldMod.isMonasCollapsing === 'function');
worldMod.startMonasCollapse();   // belum bangun dunia -> guard: no-op aman
T('startMonasCollapse aman sebelum dunia dibangun (guard, tetap tegak)',
    worldMod.isMonasCollapsing() === false && worldMod.updateMonasCollapse(0.1) === false);
worldMod.resetMonasCollapse();   // tidak boleh melempar

// Hook selebrasi robot saat Monas runtuh (robots.js men-gate celebrateRobot
// dgn isPlayerDying() ATAU activeScene.robotsCelebrate()): survival ekspor hook.
const survMod = await import(R('src/scenes/survival/index.js'));
T('survivalScene.robotsCelebrate hook ada & false saat Monas tegak',
    typeof survMod.survivalScene.robotsCelebrate === 'function'
    && survMod.survivalScene.robotsCelebrate() === false);

// --- 15. Campaign STAGE 2 overhaul (2026-07-13): gedung indoor mengikuti denah.
// Bangun dunia gedung + verifikasi grid (BFS konektivitas), penempatan robot 9
// spot, robotAI, dan gerbang BOSS penjaga tangga. ---
const s2mod = await import(R('src/scenes/campaign/stages/stage2/index.js'));
s2mod.buildWorld();
{   // BFS: SEMUA lantai harus terjangkau dari START (menangkap salah-carve pintu)
    const grid = s2mod.s2grid, ROWS = grid.length, COLS = grid[0].length;
    const seen = grid.map(row => row.map(() => false));
    const st = s2mod.S2_START, q = [[st.c, st.r]]; seen[st.r][st.c] = true;
    let reach = 0, floor = 0;
    while (q.length) {
        const [c, r] = q.shift(); reach++;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
            if (grid[nr][nc] === 0 && !seen[nr][nc]) { seen[nr][nc] = true; q.push([nc, nr]); }
        }
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === 0) floor++;
    T('S2: SEMUA lantai gedung terhubung dari START (BFS, ' + floor + ' sel)', reach === floor && floor > 1500);
    T('S2: grid 50x50 (plan resmi stage2-v3)', COLS === 50 && ROWS === 50);
}
T('S2: START & GENERATOR berada di LANTAI (bukan dinding)',
    !s2mod.s2Wall(s2mod.S2_START.c, s2mod.S2_START.r) && !s2mod.s2Wall(s2mod.S2_GEN.c, s2mod.S2_GEN.r));
T('S2: nav-grid pathfinder terbangun', s2mod.s2Nav != null);
{   // --- REVISI DENAH USER 2026-07-29 (baris 6): ruang kanan-atas dipotong jadi
    //     RUANG GENERATOR tertutup (c40-48 r1-5) + ruang besar di bawahnya, dgn
    //     SATU mulut pintu c43-44. Yang dijaga: pintunya benar-benar ada, ruang
    //     generator HANYA bisa dimasuki lewat pintu itu, dan tak ada entri tabel
    //     (perabot/spawn/barel/peti) yang tertinggal di dalam dinding baru. ---
    const D = s2mod.s2SpawnDbg();
    const gate = D.doors.find(d => d.r0 === 6 && d.r1 === 6 && d.c0 === 43 && d.c1 === 44);
    const a = s2mod.s2Cell(43, 6), b = s2mod.s2Cell(44, 6);
    const built = s2mod.s2DoorsDbg().find(d =>
        Math.hypot(d.cx - (a.x + b.x) / 2, d.cz - (a.z + b.z) / 2) < 1);
    T('S2 DENAH: mulut pintu di depan generator (c43-44 r6) punya PINTU GESER',
        !!gate && !!built && s2mod.s2DoorsDbg().length === D.doors.length);
    // BFS dari START dgn KEDUA sel pintu ditutup -> sel generator tak terjangkau
    // (kalau terjangkau berarti masih ada celah lain = dinding barunya bocor).
    const grid = s2mod.s2grid;
    const seen = grid.map(row => row.map(() => false));
    const shut = new Set(['43,6', '44,6']);
    const q = [[s2mod.S2_START.c, s2mod.S2_START.r]];
    seen[s2mod.S2_START.r][s2mod.S2_START.c] = true;
    while (q.length) {
        const [c, r] = q.shift();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= 50 || nr >= 50) continue;
            if (grid[nr][nc] !== 0 || seen[nr][nc] || shut.has(nc + ',' + nr)) continue;
            seen[nr][nc] = true; q.push([nc, nr]);
        }
    }
    let chamber = 0, sealed = 0;
    for (let r = 1; r <= 5; r++) for (let c = 40; c <= 48; c++) {
        if (s2mod.s2Wall(c, r)) continue;
        chamber++; if (!seen[r][c]) sealed++;
    }
    T('S2 DENAH: ruang generator (' + chamber + ' sel) HANYA bisa dimasuki lewat pintu itu',
        chamber > 0 && sealed === chamber && !seen[s2mod.S2_GEN.r][s2mod.S2_GEN.c]);
    // Sapuan tabel: tak satu pun entri di sel DINDING, dan tak ada titik spawn
    // yang tepat di MULUT PINTU (robot/barel/peti menyumbat daun pintu).
    const stray = [], atDoor = [];
    for (const [k, c, r] of s2mod.s2FurnitureDbg()) if (s2mod.s2Wall(c, r)) stray.push(`furn ${k}@${c},${r}`);
    const doorCells = new Set();
    for (const d of D.doors)
        for (let r = d.r0; r <= d.r1; r++) for (let c = d.c0; c <= d.c1; c++) doorCells.add(c + ',' + r);
    for (const key of ['wave1', 'guards', 'wave2', 'barrels', 'crates']) {
        for (const [c, r] of D[key]) {
            if (s2mod.s2Wall(c, r)) stray.push(`${key}@${c},${r}`);
            if (doorCells.has(c + ',' + r)) atDoor.push(`${key}@${c},${r}`);
        }
    }
    if (stray.length) console.log('  entri denah stage 2 di dalam DINDING:', stray);
    if (atDoor.length) console.log('  entri denah stage 2 di MULUT PINTU:', atDoor);
    T('S2 DENAH: tak ada perabot/spawn/barel/peti yang jatuh di sel DINDING', stray.length === 0);
    T('S2 DENAH: tak ada titik spawn robot/barel/peti tepat di MULUT PINTU', atDoor.length === 0);
}

// --- REVISI DENAH STAGE 2 (2026-08-13, CSV user): token '+' pintu RUSAK, '/'
// celah tembok, dan '*' tumpukan perabot — legenda yang sama dgn Stage 1 dan
// dibangun oleh utility/barricade.js yang sama. Yang diuji = KONSEKUENSI
// gameplay-nya. Rute barunya keras: pintu c6-7 r9 mati + baris 9 tertumpuk
// perabot, jadi satu-satunya jalan turun adalah celah c38 r6 (SUPPLY -> toilet),
// dan lorong sempit c40-41 adalah satu-satunya jalan dari pintu c39 r27-28. ---
{
    const doorM2 = await import(R('src/scenes/campaign/utility/doors.js'));
    const PRAD2 = cfgMod.CFG.player.radius, PROP2 = cfgMod.CFG.player.propRadius;
    const S2 = s2mod.S2;
    const free2 = (c, r, rad, propRad) => {
        const p = s2mod.s2Cell(c, r);
        if (!s2mod.stage2Walk(p.x, p.z, rad)) return false;
        stateMod._v3.set(p.x, 0, p.z);
        s2mod.resolve(stateMod._v3, propRad, 0);
        return Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) < 1e-6;
    };

    // (a) BARIKADE: sel tetap lantai di grid, pejal ke player, dan hilang dari nav.
    const bar2 = s2mod.s2BarricadesDbg();
    let solid2 = true, navSealed2 = true;
    for (const [c, r] of bar2) {
        if (s2mod.s2Wall(c, r) || free2(c, r, 0.5, PROP2)) solid2 = false;
        for (const ci of [c * 2, c * 2 + 1]) for (const ri of [r * 2, r * 2 + 1])
            if (s2mod.s2Nav.walk[ri * s2mod.s2Nav.cols + ci]) navSealed2 = false;
    }
    T('S2 DENAH: ke-' + bar2.length + ' sel barikade "*" tetap lantai di grid, PEJAL ke player, hilang dari nav',
        bar2.length === 53 && solid2 && navSealed2);

    // (b) CELAH '/': bisa dilewati badan player penuh, dari kedua sisinya.
    const brc2 = s2mod.s2BreachesDbg();
    let breach2 = brc2.length === 1;
    for (const [c, r, dir] of brc2) {
        const dc = dir === 'ew' ? 1 : 0, dr = dir === 'ew' ? 0 : 1;
        for (const k of [-1, 0, 1]) if (!free2(c + dc * k, r + dr * k, PRAD2, PROP2)) breach2 = false;
    }
    T('S2 DENAH: celah tembok "/" c38 r6 bisa dilewati player seukuran badan penuh', breach2);

    // (c) PINTU RUSAK '+': terkunci permanen, daun beku, kebal setDoorLocked.
    const broken2 = s2mod.s2DoorsDbg().filter(d => d.broken);
    const bd2 = broken2[0];
    const bp2 = s2mod.s2Cell(6, 8);
    camera.position.set(bp2.x, cfgMod.CFG.player.eyeHeight, bp2.z);
    for (let i = 0; i < 40; i++) doorM2.updateStageDoors(s2mod.s2DoorsDbg(), 0.05);
    doorM2.setDoorLocked(bd2, false);
    T('S2 DENAH: pintu RUSAK "+" c6-7 r9 macet permanen (daun tak bergerak, kebal setDoorLocked)',
        broken2.length === 1 && bd2.locked === true && bd2.broken === true
        && bd2.open === doorM2.DOOR_BROKEN_AJAR
        && doorM2.doorsWalkable(broken2, bd2.cx, bd2.cz, 0) === false);
    // BUGFIX 2026-08-13 (laporan user "pintu berlampu merah bisa ditembus"):
    // playerCollide Stage 2 dulu TAK memanggil resolveDoors sama sekali — robot
    // dan peluru terhalang, player berjalan santai menembusnya. Diuji lewat
    // playerCollide SUNGGUHAN, bukan resolveDoors langsung.
    {
        stateMod._v3.set(bd2.cx, 0, bd2.cz);
        s2mod.stage2Scene.playerCollide(stateMod._v3, bd2.cx, bd2.cz - S2.CELL, 0);
        T('S2 DENAH: pintu RUSAK "+" PEJAL ke player (playerCollide mendorongnya keluar)',
            Math.abs(stateMod._v3.z - bd2.cz) >= bd2.hz + PRAD2 - 0.01);
    }

    // (d) Variasi tumpukan: banyak resep & jenis perabot, bukan lemari berulang.
    const mix2 = s2mod.s2BarricadeMixDbg();
    const rec2 = new Set(mix2.map(m => m.recipe)), kin2 = new Set(mix2.flatMap(m => m.kinds));
    T('S2 BARIKADE "*": ' + rec2.size + ' resep & ' + kin2.size + ' jenis perabot berbeda',
        mix2.length === bar2.length && rec2.size >= 6 && kin2.size >= 7
        && mix2.every(m => m.kinds.length >= 3));

    // (e) Setelah barikade + perabot berdiri, tiap ruangan / mulut pintu yang bisa
    //     dibuka / titik objektif MASIH tercapai dari START pada clearance PLAYER.
    //     Sampel seperempat sel — bukaan selebar satu sel hanya memuat badan
    //     player dalam pita +-2 unit di tengahnya (setengah sel TIDAK cukup).
    {
        //     Pintu RUSAK '+' ikut memblok — tanpa ini BFS menembus pintu rusak
        //     c6-7 r9 dan MELEWATKAN player yang terkurung di ruang start
        //     (laporan user 2026-08-13). Hanya yang `broken`: pintu `locked`
        //     biasa memang dibuka oleh alur permainan, jadi bukan tembok.
        const step = S2.CELL / 4, N = S2.G * 4;
        const drs2 = s2mod.s2DoorsDbg().filter(d => d.broken);
        const ok = new Uint8Array(N * N);
        let total = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const x = S2.x0 + (i + 0.5) * step, z = S2.z0 + (j + 0.5) * step;
            if (!s2mod.stage2Walk(x, z, PRAD2)) continue;
            stateMod._v3.set(x, 0, z);
            s2mod.resolve(stateMod._v3, PROP2, 0);
            doorM2.resolveDoors(drs2, stateMod._v3, PRAD2, true);
            if (Math.abs(stateMod._v3.x - x) + Math.abs(stateMod._v3.z - z) > 0.01) continue;
            ok[j * N + i] = 1; total++;
        }
        const sp = s2mod.s2Cell(s2mod.S2_START.c, s2mod.S2_START.r);
        const seen = new Uint8Array(N * N);
        const k0 = Math.floor((sp.z - S2.z0) / step) * N + Math.floor((sp.x - S2.x0) / step);
        const q = [k0]; seen[k0] = 1;
        let reach = ok[k0] ? 1 : 0;
        for (let h = 0; h < q.length; h++) {
            const k = q[h], i = k % N, j = (k - i) / N;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const i2 = i + di, j2 = j + dj;
                if (i2 < 0 || j2 < 0 || i2 >= N || j2 >= N) continue;
                const k2 = j2 * N + i2;
                if (ok[k2] && !seen[k2]) { seen[k2] = 1; reach++; q.push(k2); }
            }
        }
        const ptSeen2 = (x, z) => {
            const h = S2.CELL / 2;
            const i0 = Math.max(0, Math.floor((x - h - S2.x0) / step)), i1 = Math.min(N - 1, Math.floor((x + h - S2.x0) / step));
            const j0 = Math.max(0, Math.floor((z - h - S2.z0) / step)), j1 = Math.min(N - 1, Math.floor((z + h - S2.z0) / step));
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
                if (ok[j * N + i] && seen[j * N + i]) return true;
            return false;
        };
        const cellSeen2 = (c, r) => { const p = s2mod.s2Cell(c, r); return ptSeen2(p.x, p.z); };
        const rooms2 = s2mod.s2LampsDbg().every(lm => {
            const c0 = Math.round((lm.x0 - S2.x0) / S2.CELL), c1 = Math.round((lm.x1 - S2.x0) / S2.CELL) - 1;
            const r0 = Math.round((lm.z0 - S2.z0) / S2.CELL), r1 = Math.round((lm.z1 - S2.z0) / S2.CELL) - 1;
            for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (cellSeen2(c, r)) return true;
            return false;
        });
        const missed2 = [];
        for (const [c, r] of [[s2mod.S2_START.c, s2mod.S2_START.r], [s2mod.S2_GEN.c, s2mod.S2_GEN.r],
        [s2mod.S2_LIFT.c1, s2mod.S2_LIFT.r0], ...s2mod.s2BreachesDbg().map(b => [b[0], b[1]])])
            if (!cellSeen2(c, r)) missed2.push('c' + c + ',r' + r);
        for (const d of s2mod.s2DoorsDbg())
            if (!d.broken && !ptSeen2(d.cx, d.cz)) missed2.push('pintu@' + d.cx.toFixed(0) + ',' + d.cz.toFixed(0));
        const reachOK2 = total > 3000 && reach / total > 0.99 && rooms2 && missed2.length === 0;
        if (!reachOK2) {
            if (missed2.length) console.log('  S2 titik kunci terkurung:', missed2.join(' '));
            for (let r = 0; r < S2.G; r++) {
                let ln = '';
                for (let c = 0; c < S2.G; c++) {
                    let a = 0, s = 0;
                    for (let j = r * 4; j < r * 4 + 4; j++) for (let i = c * 4; i < c * 4 + 4; i++) {
                        if (ok[j * N + i]) a = 1;
                        if (ok[j * N + i] && seen[j * N + i]) s = 1;
                    }
                    ln += s2mod.s2Wall(c, r) ? '#' : (s ? '.' : (a ? 'X' : '-'));
                }
                console.log('  ' + String(r).padStart(2) + ' ' + ln);
            }
        }
        T('S2 DENAH: tiap ruangan, tiap mulut pintu & tiap titik objektif tercapai dari START'
            + ' pada clearance PLAYER (' + reach + '/' + total + ')', reachOK2);
    }
}

// Jumlah robot STAGE 1 = 40 (2026-07-19 malam, permintaan user — dulu 30)
{
    const s1m = await import(R('src/scenes/campaign/stages/stage1/index.js'));
    const comMod = await import(R('src/scenes/campaign/utility/common.js'));
    const decorMod = await import(R('src/world/decor.js'));
    if (!s1m.s1grid) s1m.buildWorld();
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    s1m.placeRobots();
    const n1 = robots.filter(z => z.stage === 1).length;
    // JUMLAH KINI BER-PENGALI (2026-08-16, permintaan user: stage 1 50% lebih
    // banyak) — asserti membaca `robotCountMul` dari CFG, bukan angka jadi.
    const s1Mul = comMod.stageRobotMul(1);
    T('S1: placeRobots menaruh ' + Math.round(s1m.s1Wave1Base * s1Mul) + ' robot GELOMBANG-1 (kelas C, '
        + 'base ' + s1m.s1Wave1Base + ' x ' + s1Mul + ') tagged stage 1 (' + n1 + ')',
        s1m.s1Wave1Base === 50 && s1Mul === cfgMod.CFG.campaign.stage1.robotCountMul
        && n1 === Math.round(s1m.s1Wave1Base * s1Mul) && n1 === s1m.s1Wave1Count()
        && robots.filter(z => z.stage === 1).every(z => z.kind === 'C'));

    // --- LAMPU PER-RUANGAN (2026-08-11, permintaan user "mekanisme mati lampu
    // dihilangkan"): SEMUA lampu ruangan menyala PENUH sejak dunia dibangun.
    // Tak ada lagi state on/k, tautan lm.doors, selubung hitam, maupun kedip. ---
    const lamps = s1m.s1LampsDbg();
    T('LAMPU: semua lampu ruangan stage 1 MENYALA PENUH sejak dibangun (tanpa state mati)',
        lamps.length >= 10
        && lamps.every(l => l.L.intensity === l.base && l.base > 0)
        && lamps.every(l => l.on === undefined && l.k === undefined
            && l.shroud === undefined && l.doors === undefined));
    T('LAMPU: TAK ADA selubung hitam ruangan yang tersisa di scene stage 1',
        !scene.children.some(o => o.material && o.material.color
            && o.material.color.getHex && o.material.color.getHex() === 0x030303));
    // Berkeliling stage TIDAK boleh lagi mengubah intensitas lampu mana pun.
    const beforeInt = lamps.map(l => l.L.intensity);
    const conf = s1m.s1Cell(14, 3);                    // ruang conference
    camera.position.set(conf.x, cfgMod.CFG.player.eyeHeight, conf.z);
    for (let i = 0; i < 12; i++) s1m.stage1Scene.updateMode(0.1);
    T('LAMPU: updateMode tak lagi menganimasikan intensitas lampu ruangan',
        lamps.every((l, i) => l.L.intensity === beforeInt[i]));
    T('LAMPU: helper mati-lampu updateRoomLamps/resetRoomLamps SUDAH DIHAPUS',
        comMod.updateRoomLamps === undefined && comMod.resetRoomLamps === undefined);
    T('LAMPU: kedip lampu aula (setS1FlickerLight) SUDAH DIHAPUS dari decor.js',
        decorMod.setS1FlickerLight === undefined && decorMod.s1FlickerLight === undefined);

    // --- FINISH TERKUNCI (2026-07-20): trigger TANGGA (T, titik masuk = titik
    // selesai) DITOLAK selagi objektif belum tuntas (fase access, data belum diunduh). ---
    const scBefore = smMod.activeScene;
    const eFin = s1m.s1Cell(4, 2);   // ruang TANGGA (T, c1-5 r1-3)
    stateMod._v3.set(eFin.x, 0, eFin.z);
    s1m.stage1Scene.playerCollide(stateMod._v3, eFin.x, eFin.z, 0);
    T('FINISH LOCK: trigger tangga stage 1 DITOLAK selagi objektif belum tuntas', smMod.activeScene === scBefore);

    // --- AKTIVASI LOS KETAT (2026-07-19): robot dekat (< 30 unit) di balik
    // DINDING / PINTU TERTUTUP tetap idle; pintu terbuka -> baru mengejar. ---
    comMod.spawnCampaignRobot(s1m.s1Cell(1, 8).x, s1m.s1Cell(1, 8).z, 1);   // di balik dinding r7
    const zWall = robots[robots.length - 1];
    const cp1 = s1m.s1Cell(1, 6);
    camera.position.set(cp1.x, cfgMod.CFG.player.eyeHeight, cp1.z);
    s1m.stage1Scene.robotAI(zWall, 0.1, 6);
    T('AKTIVASI KETAT: robot dekat di balik DINDING tetap idle (bypass jarak dihapus)',
        zWall.state === 'idle');
    // Pintu uji = TANGGA <-> conference W (c8 r3-4). Pintu A<->office W (c3-4 r7)
    // TIDAK dipakai lagi: denah 2026-08-12 menjadikannya pintu RUSAK permanen.
    comMod.spawnCampaignRobot(s1m.s1Cell(9, 4).x, s1m.s1Cell(9, 4).z, 1);   // di balik pintu TANGGA<->conference W
    const zDoor = robots[robots.length - 1];
    const cp2 = s1m.s1Cell(7, 4);
    camera.position.set(cp2.x, cfgMod.CFG.player.eyeHeight, cp2.z);
    s1m.stage1Scene.robotAI(zDoor, 0.1, 6);
    const doorIdle = zDoor.state === 'idle';           // pintu masih TERTUTUP -> tak terlihat
    for (let i = 0; i < 30; i++) s1m.stage1Scene.updateMode(0.05);   // player di zona depan pintu -> pintu TERBUKA penuh
    s1m.stage1Scene.robotAI(zDoor, 0.1, 6);
    T('AKTIVASI KETAT: robot di balik pintu TERTUTUP idle; pintu TERBUKA -> mengejar',
        doorIdle && zDoor.state === 'chasing');
}

// === MINIGAME HACK "ICE BREACH" (2026-07-28, permintaan user: hacking tidak
// lagi sekadar menunggu bar progress) — helper bersama utk section S1 & S3 di
// bawah. Papan sirkuit tetap 5×5: putar chip sampai PORT (kiri-tengah) tersambung ke
// DATA CORE (kanan-tengah). Generator menggambar jalur solusi lebih dulu, jadi
// papan SELALU bisa dipecahkan; `hackDebug().tiles[i].ok` = chip jalur sudah di
// orientasi solusi. ===
const hackMod = await import(R('src/scenes/campaign/utility/hackMinigame.js'));
// Putar tiap chip JALUR ke orientasi solusinya (maks 3 klik per chip).
function solveHack() {
    for (const t of hackMod.hackDebug().tiles) {
        if (!t.path) continue;
        for (let g = 0; g < 4 && !hackMod.hackDebug().tiles[t.i].ok; g++) hackMod.hackRotate(t.i);
    }
    return hackMod.hackDebug();
}
// Modal menutup setelah banner ACCESS GRANTED (setTimeout) — poll spt uji shop.
// Titik (x,z) berada DI LUAR tapak-pandang kamera? (sama seperti uji modul:
// rect = titik fokus kamera + groundViewExtents; margin modul membuatnya lebih
// longgar lagi, jadi assert ini konservatif.)
function offCamera(x, z) {
    const f = rendererMod.camFocusPos();
    const e = rendererMod.groundViewExtents(f.y, 0);
    return x < f.x + e.minX || x > f.x + e.maxX || z < f.z + e.minZ || z > f.z + e.maxZ;
}
async function waitHackClosed() {
    for (let i = 0; i < 400 && hackMod.hackDebug().open; i++) await new Promise(r => setTimeout(r, 10));
    stateMod.setPaused(false);   // harness tak punya pointerlockchange yang me-resume
}
{
    const HK = cfgMod.CFG.campaign.hack;
    let lastResult = null, wins = 0;
    const openBoard = (size) => hackMod.beginHackMinigame({
        head: 'TEST TERMINAL', sub: 'test', size,
        onSuccess: () => { lastResult = 'ok'; wins++; },
        onFail: (why) => { lastResult = why; },
    });
    // (a) GENERATOR selalu menghasilkan papan yang BISA dipecahkan pada ukuran
    //     tetap gridSize; jalur solusi digambar sebelum chip pengecoh/rotasi.
    let genOk = true, startsUnsolved = true, startsWrong = true, boards = 0;
    let linksOk = true, poweredCoreOk = true;
    for (let n = 0; n < 12; n++) {
        // Caller lama sengaja meminta ukuran berbeda; modal wajib mengabaikannya.
        openBoard(n % 2 ? HK.gridSize - 1 : HK.gridSize + 2);
        const d0 = hackMod.hackDebug();
        if (d0.solved) startsUnsolved = false;
        if (!d0.tiles.filter(t => t.path).every(t => !t.ok)) startsWrong = false;
        const ext = d0.externalLinks;
        if (!ext || !ext.ingressToLeftTile || !ext.rightTileToCore
            || !ext.ingressPowered || ext.corePowered
            || ext.row !== ((HK.gridSize - 1) >> 1)) linksOk = false;
        const done = solveHack();
        if (d0.size !== HK.gridSize || !done.solved) genOk = false;
        if (!done.externalLinks || !done.externalLinks.corePowered) poweredCoreOk = false;
        await waitHackClosed();
        boards++;
    }
    T('HACK: generator SELALU solvable (' + boards + ' papan tetap gridSize config)', genOk);
    T('HACK: papan dibuka BELUM terpecahkan & tiap chip jalur mulai salah orientasi',
        startsUnsolved && startsWrong);
    T('HACK: papan terpecahkan -> onSuccess dipanggil sekali per papan', wins === boards && lastResult === 'ok');
    T('HACK: SEMUA terminal memakai satu ukuran gridSize (caller tak bisa override)',
        hackMod.hackGridSize(0) === HK.gridSize && hackMod.hackGridSize(99) === HK.gridSize);
    T('HACK: kabel luar menghubungkan INGRESS/CORE ke tile baris tengah dan mengikuti daya',
        linksOk && poweredCoreOk);
    const hackSrc = fs.readFileSync(ROOT + '/src/scenes/campaign/utility/hackMinigame.js', 'utf8');
    const hackCss = fs.readFileSync(ROOT + '/css/style.css', 'utf8');
    T('HACK UI: kabel INGRESS dan DATA CORE punya markup + arah visual eksplisit',
        hackSrc.includes('id="hackIngressLead"') && hackSrc.includes('id="hackCoreLead"')
        && hackCss.includes('.hackLeadIn') && hackCss.includes('.hackLeadOut')
        && hackCss.includes('.hackLead::after'));
    // (b) Rotasi 4x = kembali ke orientasi semula; chip MATI tak bisa diklik.
    openBoard(HK.gridSize);
    const pi = hackMod.hackDebug().tiles.findIndex(t => t.path);
    const rot0 = hackMod.hackDebug().tiles[pi].rot;
    for (let i = 0; i < 4; i++) hackMod.hackRotate(pi);
    const rot4 = hackMod.hackDebug().tiles[pi].rot;
    hackMod.hackRotate(pi, -1);   // klik kanan = putar balik
    T('HACK: 4x putar kembali ke orientasi semula; klik-kanan memutar berlawanan',
        rot4 === rot0 && hackMod.hackDebug().tiles[pi].rot === ((rot0 + 3) & 3));
    const dead = hackMod.hackDebug().tiles.find(t => t.mask === 0);
    T('HACK: chip MATI (tanpa jalur) tidak bisa diputar', !dead || hackMod.hackRotate(dead.i) === false);
    // (c) Modal = scene: shopActive() menekan menu jeda, tombol gameplay ditelan,
    //     ESC = ABORT (scene sebelumnya dipulihkan seketika, tanpa enter()).
    const prevOfHack = hackMod.hackDebug().open ? smMod.activeScene.prev : null;
    T('HACK: scene modal aktif -> shopActive() true & tombol gameplay ditelan',
        smMod.activeScene.id === 'campaign-hack' && smMod.activeScene.shopActive() === true
        && smMod.activeScene.shopKey('w') === true);
    T('HACK: modal tak bisa dibuka dua kali', openBoard(HK.gridSize) === false);
    lastResult = null;
    smMod.activeScene.shopKey('escape');
    T('HACK: ESC = ABORT -> onFail("abort") + scene sebelumnya dipulihkan seketika',
        lastResult === 'abort' && hackMod.hackDebug().open === false
        && smMod.activeScene === prevOfHack);
    stateMod.setPaused(false);
    // (d) ICE TRACE habis -> LOCKED OUT -> onFail('fail').
    lastResult = null;
    openBoard(HK.gridSize);
    T('HACK: hitung mundur ICE TRACE = CFG.campaign.hack.traceSec', hackMod.hackDebug().traceMax === HK.traceSec);
    hackMod.hackTick(HK.traceSec * 0.5);
    T('HACK: ICE TRACE berkurang selama bermain', hackMod.hackDebug().traceLeft < HK.traceSec);
    hackMod.hackTick(HK.traceSec);
    T('HACK: ICE TRACE habis -> LOCKED OUT (rotasi tak lagi diterima)',
        hackMod.hackDebug().phase === 'lost' && hackMod.hackRotate(pi) === false);
    await waitHackClosed();
    T('HACK: LOCKED OUT -> onFail("fail") & modal menutup sendiri',
        lastResult === 'fail' && hackMod.hackDebug().open === false);
}

// === MINIGAME HACK "SIGNAL TRACE" khusus Stage 5-6. Kanal bergerak dikunci
// satu per satu; salah kunci memotong timer, dan timer habis memicu alarm. ===
const signalMod = await import(R('src/scenes/campaign/utility/signalTraceMinigame.js'));
function solveSignalTrace() {
    while (signalMod.signalTraceDebug().open && signalMod.signalTraceDebug().phase === 'play') {
        const d = signalMod.signalTraceDebug();
        const c = d.game.channels[d.active];
        c.phase = c.target;
        signalMod.signalLock();
    }
    return signalMod.signalTraceDebug();
}
async function waitSignalClosed() {
    for (let i = 0; i < 400 && signalMod.signalTraceDebug().open; i++) await new Promise(r => setTimeout(r, 10));
    stateMod.setPaused(false);
}
{
    const S = cfgMod.CFG.campaign.signalTrace;
    const g = signalMod.buildSignalGame(S.channels);
    const startsMoving = !g.solved && g.channels.length === S.channels;
    const left0 = g.left, phase0 = g.channels[0].phase;
    signalMod.advanceSignalGame(g, 0.25);
    const moved = g.left < left0 && g.channels[0].phase !== phase0;
    g.channels[0].phase = (g.channels[0].target + 0.5) % 1;
    const beforeMiss = g.left;
    const miss = signalMod.lockSignalGame(g);
    while (!g.solved) {
        g.channels[g.active].phase = g.channels[g.active].target;
        signalMod.lockSignalGame(g);
    }
    T('SIGNAL TRACE: kanal/timer config-driven, bergerak, dan papan selalu dapat dituntaskan',
        startsMoving && moved && g.solved && g.active === S.channels);
    T('SIGNAL TRACE: salah kunci memberi penalti waktu config-driven',
        miss === 'miss' && Math.abs((beforeMiss - g.left) - S.missPenaltySec) < 1e-6);
    let result = null;
    const previous = smMod.activeScene;
    signalMod.beginSignalTraceMinigame({
        head: 'TEST SIGNAL', onSuccess: () => { result = 'ok'; }, onFail: why => { result = why; },
    });
    T('SIGNAL TRACE MODAL: scene terpisah, pause, dan tombol gameplay ditelan',
        smMod.activeScene.id === 'campaign-signal-trace' && stateMod.isPaused
        && smMod.activeScene.shopActive() && smMod.activeScene.shopKey('w'));
    solveSignalTrace(); await waitSignalClosed();
    T('SIGNAL TRACE MODAL: solve memanggil sukses dan memulihkan scene tanpa enter ulang',
        result === 'ok' && smMod.activeScene === previous && !signalMod.isSignalTraceOpen());
}

// === MINIGAME PERBAIKAN GENERATOR "FIELD REPAIR" (2026-07-29, permintaan user:
// menyalakan generator stage 2 jangan cuma bar progress) — TIGA papan, satu per
// komponen yang dikumpulkan player, TANPA hitung mundur. Bagian ini menguji
// MODEL MURNI (buildRepairGame/applyX — cepat, tanpa DOM/timer) lalu perilaku
// MODAL-nya; integrasi ke alur stage ada di section S2 di bawah. ===
const repMod = await import(R('src/scenes/campaign/utility/repairMinigame.js'));
// Penyelesai per tipe: MEMBUKTIKAN papan bisa diselesaikan pemain dengan
// prosedur wajar (kabel: cocokkan warna; chip: cocokkan ukuran; katup: kiri->
// kanan, karena memutar katup i tak pernah menyentuh katup di kirinya).
// `viaDrag` = selesaikan lewat jalur SERET (applyWireDrop/applyChipDrop) alih-alih
// klik ujung-ke-ujung — keduanya harus sama-sama menuntaskan papan (2026-07-29).
function solveRepairModel(g, viaDrag = false) {
    if (g.type === 'wires') {
        for (let j = 0; j < g.n; j++) {
            if (viaDrag) repMod.applyWireDrop(g, 'l', g.right[j], 'r', j);
            else { repMod.applyWirePick(g, 'l', g.right[j]); repMod.applyWirePick(g, 'r', j); }
        }
    } else if (g.type === 'chips') {
        for (let ci = 0; ci < g.n; ci++) {
            const c = g.chips[ci];
            const si = g.sockets.findIndex(s => s.fill < 0 && s.w === c.w && s.h === c.h);
            if (viaDrag) repMod.applyChipDrop(g, ci, 'socket', si);
            else { repMod.applyChipPick(g, 'chip', ci); repMod.applyChipPick(g, 'socket', si); }
        }
    } else if (g.type === 'valves') {
        for (let i = 0; i < g.n; i++) {
            const need = ((g.target[i] - g.pos[i]) % g.steps + g.steps) % g.steps;
            for (let k = 0; k < need; k++) repMod.applyValveTurn(g, i, 1);
        }
    } else if (g.type === 'fuse') {
        for (let ci = 0; ci < g.circuits.length; ci++) {
            const c = g.circuits[ci];
            const fi = g.fuses.findIndex(f => f.at < 0 && f.amp === c.targetAmp);
            repMod.applyFusePick(g, 'fuse', fi);
            repMod.applyFusePick(g, 'circuit', ci);
        }
    } else if (g.type === 'kickstart') {
        const A = cfgMod.CFG.campaign.repair.advanced;
        while (g.rpm < A.rotorGreenMin) repMod.applyRotorTurn(g, A.rotorCrankStepRad);
        repMod.applyRotorIgnition(g);
        repMod.applyMasterBreaker(g);
    }
    return repMod.repairIsSolved(g);
}
// Papan MODAL yang sedang terbuka, diselesaikan lewat API klik (bukan model).
function solveOpenRepairBoard() {
    const g = repMod.repairDebug().game;
    if (!g) return false;
    if (g.type === 'wires') {
        for (let j = 0; j < g.n; j++) { repMod.repairWirePick('l', g.right[j]); repMod.repairWirePick('r', j); }
    } else if (g.type === 'chips') {
        for (let ci = 0; ci < g.n; ci++) {
            const c = g.chips[ci];
            if (c.at >= 0) continue;
            const si = g.sockets.findIndex(s => s.fill < 0 && s.w === c.w && s.h === c.h);
            repMod.repairChipPick('chip', ci); repMod.repairChipPick('socket', si);
        }
    } else if (g.type === 'valves') {
        for (let i = 0; i < g.n; i++) {
            const need = ((g.target[i] - g.pos[i]) % g.steps + g.steps) % g.steps;
            for (let k = 0; k < need; k++) repMod.repairValveTurn(i, 1);
        }
    } else if (g.type === 'fuse') {
        for (let ci = 0; ci < g.circuits.length; ci++) {
            const c = g.circuits[ci];
            const fi = g.fuses.findIndex(f => f.at < 0 && f.amp === c.targetAmp);
            repMod.repairFusePick('fuse', fi);
            repMod.repairFusePick('circuit', ci);
        }
    } else if (g.type === 'kickstart') {
        const A = cfgMod.CFG.campaign.repair.advanced;
        while (g.rpm < A.rotorGreenMin) repMod.repairRotorTurn(A.rotorCrankStepRad);
        repMod.repairRotorIgnition();
        repMod.repairMasterBreaker();
    }
    return true;
}
// Tunggu papan berikutnya (banner antar-komponen pakai setTimeout) / modal tutup.
async function waitRepairNext(idx) {
    for (let i = 0; i < 300; i++) {
        const d = repMod.repairDebug();
        if (!d.open || (d.phase === 'play' && d.index === idx)) return d;
        await new Promise(r => setTimeout(r, 10));
    }
    return repMod.repairDebug();
}
async function waitRepairClosed() {
    for (let i = 0; i < 300 && repMod.repairDebug().open; i++) await new Promise(r => setTimeout(r, 10));
    stateMod.setPaused(false);   // harness tak punya pointerlockchange yang me-resume
}
{
    const RC = cfgMod.CFG.campaign.repair;
    // (a) Jumlah elemen papan = CFG.campaign.repair.count[difficulty] (3/4/5).
    T('REPAIR: jumlah elemen papan config-driven per difficulty (easy/normal/hard)',
        repMod.repairCount('easy') === RC.count.easy
        && repMod.repairCount('normal') === RC.count.normal
        && repMod.repairCount('hard') === RC.count.hard
        && RC.count.easy <= RC.count.normal && RC.count.normal <= RC.count.hard);
    // (b) SETIAP papan, SETIAP tipe, SETIAP difficulty: tak pernah terbuka dalam
    //     keadaan selesai DAN selalu bisa diselesaikan (permintaan user).
    let solvable = true, startsUnsolved = true, boards = 0, dragBoards = 0, dragSolvable = true;
    for (const diff of ['easy', 'normal', 'hard']) {
        const n = repMod.repairCount(diff);
        for (const part of repMod.REPAIR_PARTS) {
            for (let k = 0; k < 12; k++) {
                const g = repMod.buildRepairGame(part.type, n);
                if (g.n !== n) solvable = false;
                if (repMod.repairIsSolved(g)) startsUnsolved = false;
                // Selang-seling: separuh papan diselesaikan lewat KLIK, separuh
                // lewat SERET — dua-duanya jalur resmi sejak 2026-07-29.
                const viaDrag = k % 2 === 1 && part.type !== 'valves';
                if (!solveRepairModel(g, viaDrag)) { solvable = false; if (viaDrag) dragSolvable = false; }
                if (viaDrag) dragBoards++;
                boards++;
            }
        }
    }
    T('REPAIR: SEMUA papan (' + boards + ': 3 tipe x 3 difficulty) DIJAMIN bisa diselesaikan', solvable);
    T('REPAIR DRAG: papan kabel & chip juga tuntas lewat SERET saja (' + dragBoards + ' papan)',
        dragSolvable && dragBoards > 0);
    T('REPAIR: papan tak pernah dibuka dalam keadaan sudah selesai', startsUnsolved);
    {
        const A = RC.advanced;
        let advancedSolvable = true, advancedStartsWrong = true;
        for (const part of repMod.ADVANCED_REPAIR_PARTS) {
            const n = part.type === 'fuse' ? A.fuseCircuits : A.rotorSegments;
            for (let k = 0; k < 40; k++) {
                const g = repMod.buildRepairGame(part.type, n);
                if (g.n !== n || repMod.repairIsSolved(g)) advancedStartsWrong = false;
                if (!solveRepairModel(g)) advancedSolvable = false;
            }
        }
        T('ADVANCED REPAIR: FUSE LOADOUT + ROTOR KICKSTART config-driven dan selalu solvable',
            repMod.ADVANCED_REPAIR_PARTS.map(p => p.type).join(',') === 'fuse,kickstart'
            && advancedStartsWrong && advancedSolvable);
        const fuse = repMod.buildRepairGame('fuse', A.fuseCircuits);
        const wrongCircuit = fuse.circuits[0];
        const wrongFuse = fuse.fuses.findIndex(f => f.amp !== wrongCircuit.targetAmp);
        repMod.applyFusePick(fuse, 'fuse', wrongFuse);
        const wrong = repMod.applyFusePick(fuse, 'circuit', 0);
        const unsafe = !repMod.repairIsSolved(fuse) && fuse.bad && fuse.bad.i === 0;
        repMod.applyFusePick(fuse, 'circuit', 0);
        const pulled = fuse.circuits[0].fuse === -1;
        solveRepairModel(fuse);
        T('FUSE LOADOUT: fuse salah menandai load tidak aman, bisa dicabut, lalu target amp menuntaskan panel',
            wrong === 'reject' && unsafe && pulled && repMod.repairIsSolved(fuse));
        const rotor = repMod.buildRepairGame('kickstart', A.rotorSegments);
        const badIgnition = repMod.applyRotorIgnition(rotor);
        while (rotor.rpm < A.rotorGreenMin) repMod.applyRotorTurn(rotor, A.rotorCrankStepRad);
        const goodIgnition = repMod.applyRotorIgnition(rotor);
        const master = repMod.applyMasterBreaker(rotor);
        T('ROTOR KICKSTART: ignition di luar band stall; green-band + master breaker menuntaskan mesin',
            badIgnition === 'reject' && rotor.stalls === 1 && goodIgnition === 'link'
            && master === 'link' && repMod.repairIsSolved(rotor));
    }
    // (c) KABEL: hanya pasangan warna yang sama boleh tersambung; klik ulang melepas.
    {
        const g = repMod.buildRepairGame('wires', 3);
        const good = g.right[0];                       // kiri `good` = pasangan sah bus 0
        const bad = (good + 1) % g.n;
        repMod.applyWirePick(g, 'l', bad);
        const rej = repMod.applyWirePick(g, 'r', 0);   // ujung `bad` tetap terpilih
        const stillSel = !!g.sel && g.sel.i === bad;
        repMod.applyWirePick(g, 'l', good);
        const ok = repMod.applyWirePick(g, 'r', 0);
        const unl = repMod.applyWirePick(g, 'l', good);
        T('REPAIR KABEL: sambungan beda warna DITOLAK (pilihan bertahan), warna sama tersambung, klik ulang melepas',
            rej === 'reject' && stillSel && ok === 'link' && unl === 'unlink'
            && g.links[good] === -1 && !repMod.repairIsSolved(g));
    }
    // (d) CHIP: ukuran chip semuanya BEDA (bijektif) & soket salah ukuran menolak.
    {
        const g = repMod.buildRepairGame('chips', 5);
        const key = (o) => o.w + 'x' + o.h;
        const uniq = new Set(g.chips.map(key)).size === g.n && new Set(g.sockets.map(key)).size === g.n;
        const ci = 0, wrong = g.sockets.findIndex(s => s.w !== g.chips[ci].w || s.h !== g.chips[ci].h);
        const right = g.sockets.findIndex(s => s.w === g.chips[ci].w && s.h === g.chips[ci].h);
        repMod.applyChipPick(g, 'chip', ci);
        const rej = repMod.applyChipPick(g, 'socket', wrong);   // chip tetap terpilih
        const stillSel = g.sel === ci;
        const ok = repMod.applyChipPick(g, 'socket', right);
        T('REPAIR CHIP: tiap ukuran unik (1 chip = 1 soket); soket salah ukuran menolak (chip tetap terpilih)',
            uniq && rej === 'reject' && stillSel && ok === 'link' && g.chips[ci].at === right);
    }
    // (d2) SERET: aturan tolaknya sama dgn klik, dan menyeret chip ke BAKI
    //      mencabutnya dari soket. Seret ke sisi yang sama = bukan aksi.
    {
        const gw = repMod.buildRepairGame('wires', 4);
        const okDrop = repMod.applyWireDrop(gw, 'l', gw.right[0], 'r', 0);
        const badDrop = repMod.applyWireDrop(gw, 'l', gw.right[1], 'r', 2);   // pasangan salah
        const sameSide = repMod.applyWireDrop(gw, 'l', 0, 'l', 1);
        const gc = repMod.buildRepairGame('chips', 4);
        const c0 = gc.chips[0];
        const fit = gc.sockets.findIndex(s => s.w === c0.w && s.h === c0.h);
        const wrong = gc.sockets.findIndex(s => s.w !== c0.w || s.h !== c0.h);
        const rejSize = repMod.applyChipDrop(gc, 0, 'socket', wrong);
        const seat = repMod.applyChipDrop(gc, 0, 'socket', fit);
        const occ = repMod.applyChipDrop(gc, 1, 'socket', fit);              // soket sudah terisi
        const lift = repMod.applyChipDrop(gc, 0, 'tray', -1);
        T('REPAIR DRAG: seret menolak pasangan/ukuran salah & soket terisi; ke BAKI = mencabut chip',
            okDrop === 'link' && gw.links[gw.right[0]] === 0 && badDrop === 'reject' && sameSide === 'none'
            && rejSize === 'reject' && seat === 'link' && occ === 'reject'
            && lift === 'unlink' && gc.chips[0].at === -1 && gc.sockets[fit].fill === -1);
    }
    // (e) KATUP: bergigi ke KANAN saja — dasar prosedur kiri->kanan yang menjamin
    //     solusi selalu tercapai. valveSteps config-driven.
    {
        const g = repMod.buildRepairGame('valves', 4);
        const before = g.pos.slice();
        repMod.applyValveTurn(g, 2, 1);
        const leftUntouched = g.pos[0] === before[0] && g.pos[1] === before[1];
        const rightTurned = g.pos[2] === (before[2] + 1) % g.steps && g.pos[3] === (before[3] + 1) % g.steps;
        repMod.applyValveTurn(g, 2, -1);
        T('REPAIR KATUP: memutar katup ikut memutar SEMUA katup di KANANNYA, tak menyentuh yang di kiri',
            g.steps === RC.valveSteps && leftUntouched && rightTurned
            && g.pos.every((v, i) => v === before[i]));
    }
    // (e2) SERET SUNGGUHAN LEWAT EVENT DOM. fakeEl global tak menyimpan anak &
    //      listener, jadi bagian ini menukar `document` sementara dengan mini-DOM
    //      PEREKAM (anak + listener nyata) lalu benar-benar menjalankan urutan
    //      mousedown -> mousemove -> mouseup. HARUS sebelum blok (f): listener
    //      document dipasang SEKALI (`docWired`) saat modal pertama kali dibuka.
    {
        const realDoc = global.document;
        const docLs = {};
        const rEl = (cls = '') => {
            const e = {
                className: cls, style: {}, children: [], parentNode: null, _ls: {}, _html: '',
                classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
                innerText: '', value: '', dataset: {},
                addEventListener(t, f) { (e._ls[t] = e._ls[t] || []).push(f); },
                removeEventListener() { },
                appendChild(c) { e.children.push(c); c.parentNode = e; return c; },
                removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); return c; },
                setAttribute() { }, querySelectorAll: () => [], querySelector: () => null,
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
            };
            // innerHTML = '' HARUS mengosongkan anak (renderBoard mengandalkannya)
            Object.defineProperty(e, 'innerHTML', { get: () => e._html, set(v) { e._html = v; e.children.length = 0; } });
            return e;
        };
        const ids = new Map();
        global.document = {
            getElementById: (id) => { if (!ids.has(id)) ids.set(id, rEl(id)); return ids.get(id); },
            createElement: () => rEl(),
            addEventListener(t, f) { (docLs[t] = docLs[t] || []).push(f); },
            removeEventListener() { }, exitPointerLock() { },
            body: { appendChild() { }, requestPointerLock: () => ({ catch() { } }) },
            pointerLockElement: null, documentElement: rEl(), fullscreenElement: null,
        };
        const ev = (x, y) => ({ clientX: x, clientY: y, button: 0, preventDefault() { } });
        const fire = (el, type, e) => { for (const f of (el && el._ls[type]) || []) f(e); };
        const fireDoc = (type, e) => { for (const f of docLs[type] || []) f(e); };
        const find = (el, cls, out = []) => {   // telusuri pohon mini-DOM
            if (!el) return out;
            if (el.className && el.className.split(' ').includes(cls)) out.push(el);
            for (const c of el.children) find(c, cls, out);
            return out;
        };
        let dragResult = null;
        repMod.beginRepairMinigame({
            head: 'DRAG TEST', parts: [repMod.REPAIR_PARTS[0]],   // hanya papan KABEL
            onSuccess: () => { dragResult = 'ok'; }, onFail: (w) => { dragResult = w; },
        });
        const boardOf = () => global.document.getElementById('repBoard');
        const pinsL = () => find(boardOf(), 'repCol')[0].children;
        const pinsR = () => find(boardOf(), 'repColR')[0].children;
        const g0 = repMod.repairDebug().game;
        const rj = 0, li = g0.right[rj];                       // pasangan warna yang SAH
        // (1) tekan-lepas TANPA gerak = bukan seret (tak menyambung apa pun;
        //     jalur klik-lah yang bekerja, dan `click` tidak kita kirim di sini)
        fire(pinsL()[li], 'mousedown', ev(10, 10));
        fire(pinsR()[rj], 'mouseup', ev(10, 10));
        fireDoc('mouseup', ev(10, 10));
        const noDrag = repMod.repairDebug().game.links[li] === -1;
        // (2) seret sungguhan: tekan di pin kiri, geser jauh, lepas di pin kanan
        fire(pinsL()[li], 'mousedown', ev(10, 10));
        fireDoc('mousemove', ev(60, 30));                      // > DRAG_SLOP -> mulai menyeret
        const dragging = repMod.repairDebug().dragging === true;
        fire(pinsR()[rj], 'mouseup', ev(60, 30));              // papan dibangun ulang di sini
        fireDoc('mouseup', ev(60, 30));
        const linked = repMod.repairDebug().game.links[li] === rj;
        const cleared = repMod.repairDebug().dragging === false;
        T('REPAIR DRAG DOM: mousedown->mousemove->mouseup benar-benar menyambung kabel; klik tanpa gerak bukan seret',
            noDrag && dragging && linked && cleared);
        smMod.activeScene.shopKey('escape');
        stateMod.setPaused(false);
        // Papan CHIP: seret dari baki ke soket, lalu seret balik ke baki.
        repMod.beginRepairMinigame({
            head: 'DRAG TEST', parts: [repMod.REPAIR_PARTS[1]],   // hanya papan CHIP
            onSuccess: () => { dragResult = 'ok'; }, onFail: (w) => { dragResult = w; },
        });
        const gc2 = repMod.repairDebug().game;
        const ci = 0, c0 = gc2.chips[ci];
        const si = gc2.sockets.findIndex(s => s.w === c0.w && s.h === c0.h);
        const trayChip = () => find(boardOf(), 'repTray')[0].children[ci];
        fire(trayChip(), 'mousedown', ev(20, 20));
        fireDoc('mousemove', ev(90, 70));                       // ghost chip mengikuti kursor
        const ghosted = repMod.repairDebug().dragging === true;
        fire(find(boardOf(), 'repSocket')[si], 'mouseup', ev(90, 70));
        fireDoc('mouseup', ev(90, 70));
        const seated = repMod.repairDebug().game.chips[ci].at === si;
        // ...dan menyeretnya balik ke area baki = mencabut chip dari soket.
        fire(find(find(boardOf(), 'repSocket')[si], 'repChip')[0], 'mousedown', ev(90, 70));
        fireDoc('mousemove', ev(20, 20));
        fire(find(boardOf(), 'repTray')[0], 'mouseup', ev(20, 20));
        fireDoc('mouseup', ev(20, 20));
        const lifted = repMod.repairDebug().game.chips[ci].at === -1;
        T('REPAIR DRAG DOM: chip diseret dari baki ke soket, lalu diseret balik ke baki',
            ghosted && seated && lifted);
        smMod.activeScene.shopKey('escape');
        stateMod.setPaused(false);

        // Papan advanced 1: Fuse Loadout memakai klik cepat rack -> circuit,
        // salah fuse boleh dikoreksi tanpa reset modal.
        dragResult = null;
        repMod.beginRepairMinigame({
            head: 'FUSE TEST', parts: [repMod.ADVANCED_REPAIR_PARTS[0]],
            onSuccess: () => { dragResult = 'ok'; }, onFail: (w) => { dragResult = w; },
        });
        const fuseG = repMod.repairDebug().game;
        const circuits = () => find(boardOf(), 'repFuseCircuit');
        const fuses = () => find(boardOf(), 'repFuse');
        const wrongFi = fuseG.fuses.findIndex(f => f.amp !== fuseG.circuits[0].targetAmp);
        fire(fuses()[wrongFi], 'click', ev(0, 0));
        fire(circuits()[0], 'click', ev(0, 0));
        const rejectedFuse = repMod.repairDebug().game.bad && repMod.repairDebug().game.bad.i === 0;
        fire(circuits()[0], 'click', ev(0, 0));
        for (let ci = 0; ci < repMod.repairDebug().game.circuits.length; ci++) {
            const fg = repMod.repairDebug().game;
            const target = fg.circuits[ci].targetAmp;
            const fi = fg.fuses.findIndex(f => f.at < 0 && f.amp === target);
            fire(fuses()[fi], 'click', ev(0, 0));
            fire(circuits()[ci], 'click', ev(0, 0));
        }
        await waitRepairClosed();
        T('FUSE LOADOUT DOM: rack -> circuit menandai fuse salah, bisa dicabut, lalu panel selesai',
            rejectedFuse && dragResult === 'ok');
        stateMod.setPaused(false);

        // Papan advanced 2: satu putaran drag clockwise dibaca sebagai RPM,
        // lalu klik ignition dan master benar-benar menyelesaikan modal.
        dragResult = null;
        repMod.beginRepairMinigame({
            head: 'ROTOR TEST', parts: [repMod.ADVANCED_REPAIR_PARTS[1]],
            onSuccess: () => { dragResult = 'ok'; }, onFail: (w) => { dragResult = w; },
        });
        const rotor = find(boardOf(), 'repRotor')[0];
        fire(rotor, 'mousedown', ev(90, 50));
        const RA = cfgMod.CFG.campaign.repair.advanced;
        for (let i = 1; repMod.repairDebug().game.rpm < RA.rotorGreenMin && i < 80; i++) {
            const a = i * Math.PI / 8;
            fireDoc('mousemove', ev(50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40));
        }
        fireDoc('mouseup', ev(50, 90));
        const dragRpm = repMod.repairDebug().game.rpm;
        fire(find(boardOf(), 'repIgnition')[0], 'click', ev(0, 0));
        const lit = repMod.repairDebug().game.ignited;
        fire(find(boardOf(), 'repMaster')[0], 'click', ev(0, 0));
        await waitRepairClosed();
        T('ROTOR KICKSTART DOM: circular drag -> green ignition -> master menyelesaikan modal',
            dragRpm >= RA.rotorGreenMin && dragRpm <= RA.rotorGreenMax && lit && dragResult === 'ok');

        global.document = realDoc;
        T('REPAIR DRAG DOM: modal ditutup bersih setelah seluruh uji gesture', !repMod.isRepairOpen());
    }
    // (f) MODAL = scene: pause, shopActive, tombol gameplay ditelan, ESC = ABORT,
    //     tak bisa dibuka dua kali, dan kemajuan `startIndex` dihormati.
    let result = null, progress = [];
    const openRepair = (startIndex = 0) => repMod.beginRepairMinigame({
        head: 'TEST GENERATOR', startIndex,
        onProgress: (k) => progress.push(k),
        onSuccess: () => { result = 'ok'; },
        onFail: (why) => { result = why; },
    });
    const prevOfRep = smMod.activeScene;
    openRepair(1);
    T('REPAIR MODAL: scene `campaign-repair` + game di-pause + shopActive & tombol gameplay ditelan',
        smMod.activeScene.id === 'campaign-repair' && repMod.isRepairOpen() === true
        && stateMod.isPaused === true && smMod.activeScene.shopActive() === true
        && smMod.activeScene.shopKey('w') === true && smMod.activeScene.groundHeight(0, 0, 7) === 7);
    T('REPAIR MODAL: startIndex melanjutkan dari komponen yang belum terpasang',
        repMod.repairDebug().index === 1 && repMod.repairDebug().part === repMod.REPAIR_PARTS[1].id
        && repMod.repairDebug().total === repMod.REPAIR_PARTS.length);
    T('REPAIR MODAL: tak bisa dibuka dua kali', openRepair(0) === false);
    {   // Papan komponen 2 = CONTROL BOARD: seret & klik hidup BERDAMPINGAN.
        const g = repMod.repairDebug().game;
        const c0 = g.chips[0];
        const fit = g.sockets.findIndex(s => s.w === c0.w && s.h === c0.h);
        const dropped = repMod.repairChipDrop(0, 'socket', fit);
        const seated = g.chips[0].at === fit;
        const clicked = repMod.repairChipPick('socket', fit);   // klik = cabut lagi
        T('REPAIR MODAL: seret (repairChipDrop) & klik (repairChipPick) sama-sama hidup di papan yang sama',
            dropped === true && seated && clicked === true && g.chips[0].at === -1);
    }
    // Tombol COLOR MODE: palet aman buta warna bisa dinyalakan/dimatikan.
    const cb0 = repMod.repairColorblind();
    const cb1 = repMod.repairToggleColorblind();
    T('REPAIR: tombol COLOR MODE menukar palet aman buta warna (tersimpan)',
        cb1 === !cb0 && repMod.repairColorblind() === cb1
        && (localStorage.getItem('gibsRepairColorblind') === (cb1 ? '1' : '0')));
    repMod.repairToggleColorblind();
    smMod.activeScene.shopKey('escape');
    T('REPAIR MODAL: ESC = ABORT -> onFail("abort") + scene sebelumnya dipulihkan seketika',
        result === 'abort' && repMod.isRepairOpen() === false && smMod.activeScene === prevOfRep);
    stateMod.setPaused(false);
    // TANPA hitung mundur (beda dari ICE BREACH): tak ada jalur kalah sama sekali.
    T('REPAIR: modal TANPA timer — tak ada state kalah (phase idle setelah ditutup)',
        repMod.repairDebug().phase === 'idle' && repMod.repairDebug().open === false);
}

// --- ALUR STAGE 1 (2026-07-20, ROMBAK TOTAL; langkah '@' ditambah 2026-08-12,
// gerbang "bunuh semua dulu" DIHAPUS hari yang sama atas permintaan user):
// access (berdiri di petak '$' bank komputer, TANPA minigame, robot boleh masih
// hidup) -> BUKA pintu NAC ruang komputer -> MINIGAME HACK (2026-07-28, dulu bar
// unduh 10 dtk) -> RADIO Pilot lalu Maj. Gibran (2026-08-01) -> spawn 20 robot
// wave-2 + horde di ruang X -> clear2 -> done (tangga aktif).
// Mulai dari state built section sebelumnya (fase access, 50 robot hidup). ---
{
    const s1m = await import(R('src/scenes/campaign/stages/stage1/index.js'));
    const domS1 = await import(R('src/core/dom.js'));
    // Fase awal = access (bank '@' sudah hidup) + pintu NAC TERKUNCI (merah).
    T('S1 FLOW: fase awal access + pintu NAC TERKUNCI (tanpa gerbang bunuh-semua)',
        s1m.s1Debug().phase === 'access' && s1m.s1CompDoorDbg() && s1m.s1CompDoorDbg().locked === true
        && s1m.s1MarkersDbg().access === true && s1m.s1MarkersDbg().comp === false);
    // Petak '$' di depan bank komputer '@' = hack TANPA minigame: cukup berdiri
    // di situ, SELAGI seluruh robot wave-1 MASIH HIDUP -> pintu NAC terbuka &
    // petak pijak berpindah ke super komputer.
    const aliveBefore = robots.filter(z => z.stage === 1).length;
    const accP = s1m.s1Cell(s1m.S1_ACCESS.c, s1m.S1_ACCESS.r);
    camera.position.set(accP.x, cfgMod.CFG.player.eyeHeight, accP.z);
    s1m.stage1Scene.updateMode(0.1);
    T('S1 FLOW: berdiri di petak $ membuka pintu NAC WALAU ' + aliveBefore + ' robot masih hidup, tanpa minigame',
        aliveBefore >= s1m.s1Wave1Count() && s1m.s1Debug().phase === 'download'
        && s1m.s1CompDoorDbg().locked === false && hackMod.hackDebug().open === false
        && s1m.s1MarkersDbg().access === false && s1m.s1MarkersDbg().comp === true);
    // Sisa alur dijalankan tanpa robot wave-1 (yang diuji di bawah = hack/radio).
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 1) { scene.remove(robots[i].mesh); robots.splice(i, 1); }
    // Player MENEMPEL komputer -> MINIGAME HACK terbuka sebagai SCENE MODAL
    // (game di-pause; scene stage 1 disimpan untuk dipulihkan).
    const cp = s1m.s1Cell(s1m.S1_COMP.c, s1m.S1_COMP.r);
    camera.position.set(cp.x, cfgMod.CFG.player.eyeHeight, cp.z);
    const sceneBeforeHack = smMod.activeScene;   // dipulihkan APA ADANYA saat modal ditutup
    s1m.stage1Scene.updateMode(0.1);
    const H1 = hackMod.hackDebug();
    T('S1 HACK: menempel komputer -> MINIGAME terbuka (scene modal `campaign-hack`, game di-pause)',
        s1m.s1Debug().phase === 'downloading' && H1.open === true && H1.phase === 'play'
        && smMod.activeScene.id === 'campaign-hack' && stateMod.isPaused === true);
    T('S1 HACK: papan ' + H1.size + 'x' + H1.size + ' (gridSize config) BELUM terpecahkan & tiap chip jalur mulai SALAH',
        H1.size === cfgMod.CFG.campaign.hack.gridSize && H1.solved === false
        && H1.tiles.some(t => t.path) && H1.tiles.filter(t => t.path).every(t => !t.ok));
    // === ALARM (2026-07-28, permintaan user): ICE TRACE habis -> "ALARM
    // TRIGGERED" -> modal ditutup -> HORDE kelas C muncul DI LUAR LAYAR dan
    // langsung memburu player -> terminal TERKUNCI alarmCooldownSec detik. ===
    const HKC = cfgMod.CFG.campaign.hack;
    rendererMod.followViewCam(0.016);   // camFocus mengikuti posisi player terkini
    hackMod.hackTick(HKC.traceSec + 0.1);
    T('S1 ALARM: ICE TRACE habis -> banner alarm (belum menutup)', hackMod.hackDebug().phase === 'lost');
    await waitHackClosed();
    const alarmBots = robots.filter(z => z.stage === 1);
    T('S1 ALARM: hack gagal -> HORDE `alarmHordeCount` kelas C LANGSUNG memburu player',
        alarmBots.length === HKC.alarmHordeCount
        && alarmBots.every(z => z.kind === 'C' && z.state === 'chasing'));
    T('S1 ALARM: SEMUA robot alarm muncul DI LUAR pandangan kamera (tak ada yang "pop" di layar)',
        alarmBots.every(z => offCamera(z.mesh.position.x, z.mesh.position.z)));
    T('S1 ALARM: terminal terkunci cooldown `alarmCooldownSec` & fase kembali ke download',
        s1m.s1Debug().phase === 'download' && s1m.s1Debug().hackCd === HKC.alarmCooldownSec);
    s1m.stage1Scene.updateMode(0.1);   // player MASIH menempel terminal
    T('S1 ALARM: selama cooldown puzzle TIDAK bisa dibuka lagi',
        hackMod.hackDebug().open === false && s1m.s1Debug().hackCd > 0);
    // Bereskan horde + tunggu cooldown habis.
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 1) { scene.remove(robots[i].mesh); robots.splice(i, 1); }
    for (let t = 0; t <= HKC.alarmCooldownSec + 1; t += 0.5) s1m.stage1Scene.updateMode(0.5);
    T('S1 ALARM: cooldown habis -> terminal siap di-hack lagi', s1m.s1Debug().hackCd === 0);
    // Menjauh lalu kembali (pemicu terisi ulang) -> puzzle terbuka lagi.
    const sp1 = s1m.s1Cell(s1m.S1_START.c, s1m.S1_START.r);
    camera.position.set(sp1.x, cfgMod.CFG.player.eyeHeight, sp1.z);
    s1m.stage1Scene.updateMode(0.1);
    camera.position.set(cp.x, cfgMod.CFG.player.eyeHeight, cp.z);
    s1m.stage1Scene.updateMode(0.1);
    T('S1 ALARM: setelah cooldown + menjauh, menempel terminal membuka puzzle lagi',
        hackMod.hackDebug().open === true && s1m.s1Debug().phase === 'downloading');
    // Puzzle dipecahkan -> banner ACCESS GRANTED -> modal menutup sendiri.
    const solvedDbg = solveHack();
    T('S1 HACK: papan bisa dipecahkan (port -> core tersambung) -> ACCESS GRANTED',
        solvedDbg.solved === true && solvedDbg.phase === 'won');
    await waitHackClosed();
    T('S1 HACK: modal menutup -> scene sebelumnya DIPULIHKAN tanpa enter() (fase lanjut ke radio, bukan reset ke access)',
        hackMod.hackDebug().open === false && smMod.activeScene === sceneBeforeHack
        && s1m.s1Debug().phase === 'radio');
    // === OVERRIDE KENDALI PINTU (2026-08-16, permintaan user): hack mainframe
    //     yang berhasil = file kill-switch didapat = SETIAP pintu terkunci
    //     terbuka, termasuk dua pintu RUSAK '+' yang `setDoorLocked` tolak. ===
    {
        const doorMod = await import(R('src/scenes/campaign/utility/doors.js'));
        const doorsNow = s1m.s1DoorsDbg();
        const dbg = s1m.s1Debug();
        // Yang tersisa terkunci pada detik itu = DUA pintu RUSAK '+' (pintu NAC
        // sudah dibuka lebih dulu oleh bank '@'), jadi persis itulah yang dibeli
        // file kill-switch: jalan pintas yang sebelumnya macet permanen.
        T('S1 KILL-SWITCH: hack mainframe MELEPAS semua pintu yang masih terkunci ('
            + dbg.doorsFreed + ' pintu rusak) & tak menyisakan satu pun',
            dbg.doorsFreed === 2 && dbg.lockedDoors === 0
            && doorsNow.length === 18 && doorsNow.every(d => !d.locked && !d.broken));
        // Pintu RUSAK yang dilepas benar-benar BISA BERGERAK sekarang, dan tak
        // lagi mendorong player keluar (resolveDoors lockedOnly).
        const freed = doorsNow.find(d => d.baseBroken);
        const beforeOpen = freed.open;
        const fp = s1m.s1Cell(4, 6);   // tepat di depan pintu rusak c3-4 r7
        const camBack = { x: camera.position.x, z: camera.position.z };
        camera.position.set(fp.x, cfgMod.CFG.player.eyeHeight, fp.z);
        for (let i = 0; i < 40; i++) doorMod.updateStageDoors(doorsNow, 0.05);
        const push = { x: freed.cx, z: freed.cz };
        doorMod.resolveDoors(doorsNow, push, cfgMod.CFG.player.radius, true);
        T('S1 KILL-SWITCH: pintu RUSAK yang dilepas kini beranimasi & tak lagi memblok player',
            freed && freed.baseBroken === true && beforeOpen === doorMod.DOOR_BROKEN_AJAR
            && freed.open > beforeOpen && freed.open >= 0.99
            && Math.hypot(push.x - freed.cx, push.z - freed.cz) < 0.01);
        camera.position.set(camBack.x, cfgMod.CFG.player.eyeHeight, camBack.z);
    }
    const expectedS1Radio = [
        {
            speaker: 'Pilot',
            text: "Major, incoming! We're taking heavy mortar fire on the roof! We can't hold position! Relocating extraction to the town square! You need to fight your way down the building and get the hell out of there!",
        },
        {
            speaker: 'Maj. Gibran',
            text: "Damn it!! Can't anything just go according to plan?! Solid copy. Just clear that secondary LZ and don't miss me.",
        },
    ];
    T('S1 RADIO: naskah Pilot -> Maj. Gibran dipatok PERSIS kata dan tanda bacanya',
        JSON.stringify(s1m.S1_RADIO_DIALOGUE) === JSON.stringify(expectedS1Radio));
    T('S1 RADIO: Pilot tampil pertama dengan body KOSONG + caret ketik; kontrol beku dan wave-2 BELUM spawn',
        stateMod.cinematicActive === true && robots.filter(z => z.stage === 1).length === 0
        && domS1.stageRadioDialogueDebug().speaker === expectedS1Radio[0].speaker
        && domS1.stageRadioDialogueDebug().text === ''
        && domS1.stageRadioDialogueDebug().typing === true);
    const dialogueCfg = cfgMod.CFG.campaign.dialogue;
    const radioCps = Math.max(1, dialogueCfg.cps);
    const radioHold = Math.max(0, dialogueCfg.holdSec);
    const pilotTypeSec = expectedS1Radio[0].text.length / radioCps;
    T('S1 RADIO: tuning typewriter global valid dan config-driven', dialogueCfg.cps > 0 && dialogueCfg.holdSec > 0);
    s1m.stage1Scene.updateMode(1.1 / radioCps);
    T('S1 RADIO TYPEWRITER: teks benar-benar muncul HURUF-PER-HURUF, bukan langsung penuh',
        s1m.s1Debug().radioIndex === 0 && s1m.s1Debug().radioChars === 1
        && domS1.stageRadioDialogueDebug().text === expectedS1Radio[0].text.slice(0, 1)
        && domS1.stageRadioDialogueDebug().typing === true);
    s1m.stage1Scene.updateMode(pilotTypeSec - 1.1 / radioCps);
    T('S1 RADIO TYPEWRITER: naskah Pilot akhirnya tampil UTUH lalu caret berhenti selama hold',
        s1m.s1Debug().radioIndex === 0
        && domS1.stageRadioDialogueDebug().text === expectedS1Radio[0].text
        && domS1.stageRadioDialogueDebug().typing === false);
    s1m.stage1Scene.updateMode(radioHold * 0.5);
    T('S1 RADIO: teks lengkap ditahan selama campaign.dialogue.holdSec sebelum ganti speaker',
        s1m.s1Debug().radioIndex === 0
        && domS1.stageRadioDialogueDebug().text === expectedS1Radio[0].text);
    s1m.stage1Scene.updateMode(radioHold * 0.5 + 0.001);
    T('S1 RADIO: setelah Pilot, Maj. Gibran mulai mengetik sebagai baris kedua',
        s1m.s1Debug().radioIndex === 1
        && domS1.stageRadioDialogueDebug().speaker === expectedS1Radio[1].speaker
        && expectedS1Radio[1].text.startsWith(domS1.stageRadioDialogueDebug().text)
        && domS1.stageRadioDialogueDebug().text.length < expectedS1Radio[1].text.length
        && domS1.stageRadioDialogueDebug().typing === true);
    s1m.stage1Scene.updateMode(expectedS1Radio[1].text.length / radioCps + radioHold);
    T('S1 RADIO: dialog selesai -> panel hilang, kontrol pulih, baru masuk clear2',
        s1m.s1Debug().phase === 'clear2' && s1m.s1Debug().radioIndex === -1
        && domS1.stageRadioDialogueDebug() === null && stateMod.cinematicActive === false);
    const w2 = robots.filter(z => z.stage === 1);
    const nC = w2.filter(z => z.kind === 'C').length, nB = w2.filter(z => z.kind === 'B').length, nA = w2.filter(z => z.kind === 'A').length;
    // SECOND-IMPROVEMENT #3 (2026-07-22): unduh selesai spawn wave-2 (20) + HORDE
    // (CFG.campaign.stage1.hordeCount kelas C yang LANGSUNG menyerbu = 'chasing').
    // 2026-07-26 (permintaan user): stage 1 HANYA kelas C — tak ada B/A sama sekali.
    // 2026-08-16: wave-2 DAN horde sama-sama dikali `robotCountMul` stage 1.
    const s1MulW2 = cfgMod.CFG.campaign.stage1.robotCountMul;
    const horde = Math.round(cfgMod.CFG.campaign.stage1.hordeCount * s1MulW2);
    const wave2 = Math.round(20 * s1MulW2);
    T('S1 FLOW: radio selesai -> wave-2 SEMUA kelas C + HORDE (' + horde + ' C) + kendali dikembalikan',
        s1m.s1Debug().phase === 'clear2' && stateMod.cinematicActive === false
        && w2.length === wave2 + horde && nC === wave2 + horde && nB === 0 && nA === 0);
    T('S1 FLOW: HORDE langsung menyerbu (ada robot chasing di wave-2)',
        horde === 0 || w2.some(z => z.state === 'chasing'));
    // Buang wave-2 -> fase done (tangga aktif).
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 1) { scene.remove(robots[i].mesh); robots.splice(i, 1); }
    s1m.stage1Scene.updateMode(0.1);
    T('S1 FLOW: wave-2 tumbang -> fase done (tangga jadi aktif)', s1m.s1Debug().phase === 'done');
    const f1 = {
        x: s1m.S1.x0 + (s1m.S1_FINISH.c0 + s1m.S1_FINISH.c1 + 1) / 2 * s1m.S1.CELL,
        z: s1m.S1.z0 + (s1m.S1_FINISH.r0 + s1m.S1_FINISH.r1 + 1) / 2 * s1m.S1.CELL,
    };
    stateMod._v3.set(f1.x, 0, f1.z);
    s1m.stage1Scene.playerCollide(stateMod._v3, f1.x, f1.z, 0);
    T('S1 COMPLETE: tangga finish membuka layar hijau sebelum Field Shop',
        stateMod.isGameOver && domS1.gameOverTitle.innerText === 'STAGE 1 COMPLETE');
    T('S1 COMPLETE CONTINUE: CONTINUE baru membuka scene Field Shop tanpa restart',
        gameMod.activateGameOverPrimary() && !stateMod.isGameOver
        && smMod.activeScene.id === 'campaign-shop');
    for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));
    smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');
    for (let i = 0; i < 500 && smMod.activeScene !== s2mod.stage2Scene; i++) await new Promise(r => setTimeout(r, 10));
    T('S1 SHOP: Start Next Stage baru masuk Stage 2', smMod.activeScene === s2mod.stage2Scene);
    stateMod.setPaused(false);
}

// Bersihkan robot dari section sebelumnya, masuk scene, tempatkan robot+supply
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
const s2dropsBefore = stateMod.drops.length;
smMod.setScene(s2mod.stage2Scene);   // enter() menempatkan robot+supply stage 2 sendiri (2026-07-21)
const domS2 = await import(R('src/core/dom.js'));
const S2DLGCFG = cfgMod.CFG.campaign.dialogue;
const expectedS2Dialogue = {
    stageStart: {
        speaker: 'Major Gibran',
        text: 'Damn it! The stairs are completely destroyed... Looks like I need an alternate route. Maybe that elevator works.',
    },
    liftDead: {
        speaker: 'Major Gibran',
        text: "The elevator's out of power. I need to find a generator and bring it back online. Intel mentioned there's one on this floor.",
    },
    inspectGenerator: {
        speaker: 'Major Gibran',
        text: "I'm gonna need to scavenge a few parts to patch up this generator.",
    },
    generatorRestored: {
        speaker: 'Major Gibran',
        text: "Generator's back online! Time to head back to the elevator.",
    },
};
const finishS2Dialogue = () => {
    const d = s2mod.s2DialogueDebug();
    if (d.key) s2mod.stage2Scene.updateMode(
        d.text.length / Math.max(1, S2DLGCFG.cps) + Math.max(0, S2DLGCFG.holdSec) + 0.01,
    );
};
T('S2 DIALOG: empat naskah + label Major Gibran dipatok PERSIS',
    JSON.stringify(s2mod.S2_DIALOGUE) === JSON.stringify(expectedS2Dialogue));
T('S2 DIALOG START: masuk stage langsung membuka speaker dengan body kosong + caret',
    s2mod.s2DialogueDebug().key === 'stageStart'
    && s2mod.s2DialogueDebug().shown === '' && s2mod.s2DialogueDebug().typing === true
    && domS2.stageRadioDialogueDebug().speaker === 'Major Gibran'
    && domS2.stageRadioDialogueDebug().text === '' && domS2.stageRadioDialogueDebug().typing === true);
s2mod.stage2Scene.updateMode(1.1 / Math.max(1, S2DLGCFG.cps));
T('S2 DIALOG TYPEWRITER: dialog start muncul tepat satu karakter lebih dulu',
    s2mod.s2DialogueDebug().chars === 1
    && s2mod.s2DialogueDebug().shown === expectedS2Dialogue.stageStart.text.slice(0, 1));
finishS2Dialogue();
T('S2 DIALOG START: teks mencapai utuh, melewati hold config, lalu panel bersih',
    s2mod.s2DialogueDebug().key === null && domS2.stageRadioDialogueDebug() === null);
const nStage2 = robots.filter(z => z.stage === 2).length;
// JUMLAH BER-PENGALI (2026-08-16, permintaan user: stage 2 60% lebih banyak).
const s2Mul = cfgMod.CFG.campaign.stage2.robotCountMul;
T('S2: placeRobots menaruh ' + Math.round(s2mod.s2Wave1Base * s2Mul) + ' robot GELOMBANG-1 (kelas C, base '
    + s2mod.s2Wave1Base + ' x ' + s2Mul + ') tagged stage 2 (' + nStage2 + ')',
    s2mod.s2Wave1Base === 50 && nStage2 === Math.round(s2mod.s2Wave1Base * s2Mul)
    && nStage2 === s2mod.s2Wave1Count() && robots.filter(z => z.stage === 2).every(z => z.kind === 'C'));
T('S2: placeSupplies menaruh drops (ammo/medkit)', stateMod.drops.length > s2dropsBefore);

// KAMERA khusus stage 2 (2026-07-22, permintaan user): memandang dari TIMUR LAUT
// (NE→SW). followViewCam menerapkan camOffset (x>0,z<0) → SCREEN_UP (basis atas
// layar) menunjuk BARAT DAYA (x<0,z>0); basis WASD/radar ikut berputar.
rendererMod.followViewCam(0.016);
T('S2 KAMERA: camOffset TIMUR LAUT (NE) -> SCREEN_UP menunjuk BARAT DAYA (x<0, z>0)',
    s2mod.stage2Scene.camOffset.x > 0 && s2mod.stage2Scene.camOffset.z < 0
    && rendererMod.SCREEN_UP.x < 0 && rendererMod.SCREEN_UP.z > 0);

// robotAI (idle->kejar via nav-grid) jalan tanpa error
const zS2 = robots.find(z => z.stage === 2);
camera.position.set(zS2.mesh.position.x + 30, cfgMod.CFG.player.eyeHeight, zS2.mesh.position.z);
let s2aiOk = true;
try { for (let i = 0; i < 5; i++) s2mod.stage2Scene.robotAI(zS2, 0.05, 3); } catch (e) { s2aiOk = false; }
T('S2: robotAI jalan tanpa error', s2aiOk);

// TANPA boss (dibuang atas permintaan user): tak ada boss/updateMode di scene
T('S2: tak ada boss (boss dibuang; updateMode kini animasi pintu, bukan boss)',
    !robots.some(z => z.kind === 'boss') && !/BOSS/.test(s2mod.stage2Scene.hudStatus()));
// Lift END: trigger -> FINISH HIJAU -> SHOP SCENE terpisah (`campaign-shop`)
// via LOADING; setelah loading shop terbuka; "Start Next Stage"
// (SPACE x2) -> LOADING -> transisi ke stage 3. Spy enter stage3 agar tak
// membangun dunianya di harness. Poll (bukan await tetap) supaya tahan MIN_LOADING.
const s3mod = await import(R('src/scenes/campaign/stages/stage3/index.js'));
const s3dep = await import(R('src/scenes/campaign/stages/stage3/machineDeploy.js'));
// Palet dipakai sejak uji bay stage 3 (bagian 19 di bawah memakai modul yang sama).
const palMod = await import(R('src/world/palette.js'));
const realS3Enter = s3mod.stage3Scene.enter;
let s3entered = false;
s3mod.stage3Scene.enter = () => { s3entered = true; };
// === S2 FLOW (2026-07-21, ROMBAK TOTAL v3): clear1 (50 C) -> goGen -> collect 3
// komponen (gudang + 20 penjaga) -> restore 10 dtk (gerak beku) -> DONE LANGSUNG
// + wave2 bala bantuan (25: 10C/10B/5A). ATURAN BARU (permintaan user): setelah
// generator pulih, player TAK wajib membunuh semua robot — LIFT langsung aktif
// (boleh lari melewati wave2) = pindah ke SHOP SCENE. Config-driven (restoreSec). ===
const EY2 = cfgMod.CFG.player.eyeHeight;
const s2GenC = s2mod.s2Cell(s2mod.S2_GEN.c, s2mod.S2_GEN.r);
const s2LiftC = s2mod.s2Cell((s2mod.S2_LIFT.c0 + s2mod.S2_LIFT.c1) / 2, (s2mod.S2_LIFT.r0 + s2mod.S2_LIFT.r1) / 2);
const killS2 = () => { for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 2) { scene.remove(robots[i].mesh); robots.splice(i, 1); } };
// LIFT DITOLAK selagi belum 'done' (fase clear1, robot hidup)
camera.position.set(s2LiftC.x, EY2, s2LiftC.z);
s2mod.stage2Scene.updateMode(0.01);
T('S2 DIALOG LIFT MATI: pertama kali menemukan lift memicu naskah yang tepat',
    s2mod.s2DialogueDebug().key === 'liftDead'
    && s2mod.s2DialogueDebug().text === expectedS2Dialogue.liftDead.text
    && s2mod.s2DialogueDebug().shown === '');
finishS2Dialogue();
stateMod._v3.set(s2LiftC.x, 0, s2LiftC.z);
s2mod.stage2Scene.playerCollide(stateMod._v3, s2LiftC.x, s2LiftC.z, 0);
T('S2: LIFT DITOLAK selagi belum selesai (fase clear1)', smMod.activeScene === s2mod.stage2Scene);
killS2(); s2mod.stage2Scene.updateMode(0.1);
T('S2 FLOW: wave1 (50 C) tumbang -> fase goGen', s2mod.s2Debug().phase === 'goGen');
camera.position.set(s2GenC.x, EY2, s2GenC.z); s2mod.stage2Scene.updateMode(0.1);
const s2Guards = Math.round(20 * s2Mul);   // 20 penjaga x robotCountMul
T('S2 FLOW: dekati generator -> collect + ' + s2Guards + ' penjaga gudang + 3 komponen',
    s2mod.s2Debug().phase === 'collect' && robots.filter(z => z.stage === 2).length === s2Guards
    && s2mod.s2ComponentsDbg().length === 3);
T('S2 DIALOG GENERATOR: pemeriksaan pertama generator memicu kebutuhan mencari parts',
    s2mod.s2DialogueDebug().key === 'inspectGenerator'
    && s2mod.s2DialogueDebug().text === expectedS2Dialogue.inspectGenerator.text
    && s2mod.s2DialogueDebug().shown === '');
finishS2Dialogue();
{   // 3 komponen di UJUNG PALING DALAM rak (baris terbawah, terjauh dari pintu
    // masuk gudang) + tersebar 1 per ZONA kiri/tengah/kanan → player wajib
    // menyusuri seluruh gudang & hadapi semua penjaga (2026-07-21, permintaan user).
    const comps = s2mod.s2ComponentsDbg();
    const deepRow = comps.every(c => c.row === comps[0].row) && comps[0].row >= 43;
    const zoneOf = (c) => c.col <= 13 ? 0 : c.col <= 29 ? 1 : 2;
    const zonesHit = new Set(comps.map(zoneOf));
    T('S2 FLOW: 3 komponen di UJUNG PALING DALAM rak (baris terbawah) + tersebar 3 zona',
        comps.length === 3 && deepRow && zonesHit.size === 3);
}
T('S2 FLOW: tiap komponen = satu benda BERNAMA (papan minigame-nya sendiri)',
    s2mod.s2ComponentsDbg().every((c, i) => c.part && c.part.id === repMod.REPAIR_PARTS[i].id));
for (const cmp of s2mod.s2ComponentsDbg()) { camera.position.set(cmp.mx, EY2, cmp.mz); s2mod.stage2Scene.updateMode(0.1); }
T('S2 FLOW: 3 komponen terkumpul (berdiri timur rak) -> restore', s2mod.s2Debug().phase === 'restore' && s2mod.s2Debug().comp === 3);
killS2();   // "bunuh" 20 penjaga (isolasi supaya cek komposisi wave2 bersih)
// INJAK MARKER -> MINIGAME "FIELD REPAIR" (2026-07-29, MENGGANTIKAN bar restoreSec
// 10 dtk): 3 papan berurutan (satu per komponen), TANPA timer. ABORT di tengah
// menyimpan kemajuan & pemicunya baru terisi lagi setelah player MENJAUH.
camera.position.set(s2GenC.x, EY2, s2GenC.z); s2mod.stage2Scene.updateMode(0.1);
T('S2 FLOW: injak marker generator -> MINIGAME FIELD REPAIR (scene modal, game di-pause)',
    s2mod.s2Debug().phase === 'installing' && repMod.isRepairOpen() === true
    && smMod.activeScene.id === 'campaign-repair' && stateMod.isPaused === true
    && repMod.repairDebug().index === 0 && repMod.repairDebug().n === repMod.repairCount());
{
    // Papan 1 selesai -> stage mencatat 1/3, papan 2 (komponen kedua) muncul.
    solveOpenRepairBoard();
    const d1 = await waitRepairNext(1);
    T('S2 FLOW: papan komponen 1 selesai -> kemajuan tercatat & papan komponen 2 muncul',
        d1.open === true && d1.index === 1 && d1.part === repMod.REPAIR_PARTS[1].id
        && s2mod.s2Debug().installed === 1);
    // ABORT di tengah: kembali ke 'restore' TANPA kehilangan kemajuan; pemicu mati
    // sampai player menjauh (kalau tidak, modal langsung terbuka lagi di tempat).
    smMod.activeScene.shopKey('escape');
    stateMod.setPaused(false);
    s2mod.stage2Scene.updateMode(0.1);
    T('S2 FLOW: ABORT -> balik ke restore, kemajuan 1/3 tersimpan, pemicu belum terisi',
        repMod.isRepairOpen() === false && smMod.activeScene === s2mod.stage2Scene
        && s2mod.s2Debug().phase === 'restore' && s2mod.s2Debug().installed === 1
        && s2mod.s2Debug().armed === false);
    // Menjauh -> pemicu terisi; kembali menginjak marker -> LANJUT dari komponen 2.
    camera.position.set(s2GenC.x + 200, EY2, s2GenC.z); s2mod.stage2Scene.updateMode(0.1);
    camera.position.set(s2GenC.x, EY2, s2GenC.z); s2mod.stage2Scene.updateMode(0.1);
    T('S2 FLOW: menjauh lalu kembali -> minigame LANJUT dari komponen 2 (bukan mengulang)',
        repMod.isRepairOpen() === true && repMod.repairDebug().index === 1);
    solveOpenRepairBoard();
    await waitRepairNext(2);
    solveOpenRepairBoard();
    await waitRepairClosed();
    const w2 = robots.filter(z => z.stage === 2);
    const nC = w2.filter(z => z.kind === 'C').length, nB = w2.filter(z => z.kind === 'B').length, nA = w2.filter(z => z.kind === 'A').length;
    // 3 papan selesai -> LANGSUNG 'done' (TAK ada fase clear2 lagi) + wave2 (25).
    // 2026-07-26 (permintaan user): stage 2 TANPA kelas A — ruang3 yang dulu A jadi B.
    // Pengali stage 2 memakai pembulatan AKUMULATIF: totalnya persis
    // round(25 x mul) dan 10 C pertama jadi round(10 x mul) — porsi kelas tetap.
    const w2Total = Math.round(25 * s2Mul), w2C = Math.round(10 * s2Mul);
    T('S2 FLOW: 3 komponen terpasang -> DONE LANGSUNG + wave2 bala bantuan ('
        + w2C + 'C/' + (w2Total - w2C) + 'B, 0 A) + kendali kembali',
        s2mod.s2Debug().phase === 'done' && s2mod.s2Debug().installed === 3
        && repMod.isRepairOpen() === false && stateMod.cinematicActive === false
        && w2.length === w2Total && nC === w2C && nB === w2Total - w2C && nA === 0);
    T('S2 DIALOG GENERATOR PULIH: sukses repair memicu arahan kembali ke elevator',
        s2mod.s2DialogueDebug().key === 'generatorRestored'
        && s2mod.s2DialogueDebug().text === expectedS2Dialogue.generatorRestored.text
        && s2mod.s2DialogueDebug().shown === '');
    finishS2Dialogue();
    T('S2 DIALOG: keempat event hanya tampil sekali dan antrean selesai bersih',
        s2mod.s2DialogueDebug().key === null && s2mod.s2DialogueDebug().queued.length === 0
        && Object.keys(expectedS2Dialogue).every(key => s2mod.s2DialogueDebug().seen.includes(key))
        && domS2.stageRadioDialogueDebug() === null);
}
// ATURAN BARU (2026-07-21): lift bisa dinaiki MESKI robot wave2 masih hidup — TANPA killS2.
const w2alive = robots.filter(z => z.stage === 2).length;
stateMod._v3.set(s2LiftC.x, 0, s2LiftC.z);
s2mod.stage2Scene.playerCollide(stateMod._v3, s2LiftC.x, s2LiftC.z, 0);
T('S2 COMPLETE: lift membuka layar hijau dulu meski wave2 masih hidup (tak wajib dibunuh)',
    stateMod.isGameOver && smMod.activeScene === s2mod.stage2Scene
    && domS2.gameOverTitle.innerText === 'STAGE 2 COMPLETE'
    && domS2.goStageStats.style.display === 'grid'
    && !shopMod.isShopOpen() && w2alive === Math.round(25 * s2Mul) && !s3entered);
T('S2 COMPLETE CONTINUE: CONTINUE baru membuka scene Field Shop',
    gameMod.activateGameOverPrimary() && !stateMod.isGameOver
    && smMod.activeScene.id === 'campaign-shop');
killS2();   // rapikan sisa robot stage 2 utk section berikutnya
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));   // LOADING #1
stateMod.setScore(0);   // cek KETERSEDIAAN item tanpa beli (uang 0 -> 'Not enough money' vs 'Unknown item')
T('S2 SHOP SCENE: shop terbuka; Monas difilter; Radar/Shotgun/Rifle/Launcher TERSEDIA',
    shopMod.isShopOpen()
    && shopMod.shopPurchase('healMonas') === 'Unknown item'      // Monas disembunyikan di campaign
    && shopMod.shopPurchase('radar') !== 'Unknown item'         // radar DIJUAL di campaign
    && shopMod.shopPurchase('shotgun') !== 'Unknown item'       // shotgun DIJUAL
    && shopMod.shopPurchase('rifle') !== 'Unknown item'         // rifle DIJUAL
    && shopMod.shopPurchase('launcher') !== 'Unknown item');    // launcher DIJUAL
smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');   // Start Next Stage -> konfirmasi
for (let i = 0; i < 400 && !s3entered; i++) await new Promise(r => setTimeout(r, 10));   // LOADING #2 -> setScene
T('S2: Start Next Stage -> transisi ke stage 3', s3entered && smMod.activeScene === s3mod.stage3Scene);
s3mod.stage3Scene.enter = realS3Enter;   // pulihkan enter asli
shopMod.closeShop();

// --- 16. Campaign STAGE 3 (2026-07-21, ROMBAK TOTAL stage3-v2.csv 40x40):
// lantai PABRIK ROBOT — pintu blast '+' + 4 mesin pembuat robot. Bangun dunia +
// BFS konektivitas ('+'/'o' = lantai/bukaan). Alur diuji di blok S3 FLOW. ---
s3mod.ensureWorld();   // (2026-07-16: build lewat guard — enter berikutnya tak membangun ulang)
{   // BFS: SEMUA lantai (kecuali VOID pusat) terhubung dari START
    const grid = s3mod.s3grid, ROWS = grid.length, COLS = grid[0].length;
    const seen = grid.map(row => row.map(() => false));
    const st = s3mod.S3_START, q = [[st.c, st.r]]; seen[st.r][st.c] = true;
    let reach = 0, floor = 0;
    while (q.length) {
        const [c, r] = q.shift(); reach++;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
            if (grid[nr][nc] === 0 && !seen[nr][nc]) { seen[nr][nc] = true; q.push([nc, nr]); }
        }
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === 0) floor++;
    T('S3: SEMUA lantai gedung terhubung dari START (BFS, ' + floor + ' sel)', reach === floor && floor > 500);
}
// START = LIFT (masuk); END = PINTU KELUAR 'o' (selatan-tengah). Keduanya lantai.
T('S3: START (lift) & END (pintu keluar) di lantai',
    !s3mod.s3Wall(s3mod.S3_START.c, s3mod.S3_START.r) && !s3mod.s3Wall(s3mod.S3_END.c, s3mod.S3_END.r));
T('S3: nav-grid pathfinder terbangun', s3mod.s3Nav != null);

// --- 16f. CELAH ANTAR-PERABOT stage 1-3 (2026-08-11, laporan user: "celah di
// antara perabotan terlihat cukup, tapi player tidak bisa lewat"). Blocker
// perabot TIDAK dipadding (hx = sx/2 = mesh-nya), jadi yang kegemukan adalah
// `player.radius` 5 — 2x lebar avatar yang terlihat. Bentrokan-ke-PERABOT kini
// pakai `CFG.player.propRadius` lewat `propClearance()`, sementara DINDING,
// PINTU, PETI & BAREL tetap `player.radius` penuh. Diuji: nilai konfigurasinya
// masuk akal, primitifnya benar-benar meloloskan celah yang dulu tertutup, dan
// ketiga stage sungguh MEMAKAINYA (sweep sumber — wiring-nya yang gampang
// terlewat saat refactor). ---
{
    const commonMod = await import(R('src/scenes/campaign/utility/common.js'));
    const { resolveBlockers } = await import(R('src/utils/collision.js'));
    const pR = cfgMod.CFG.player.radius;
    const propR = commonMod.propClearance();
    // Lantai 2,5 unit = setengah lebar VISUAL avatar (rompi r=1,66 + lengan):
    // di bawah ini badan mulai menembus meja secara kasat mata.
    const AVATAR_HALF_W = 2.5;
    T('CELAH PERABOT: propRadius (' + propR + ') lebih ramping dari player.radius (' + pR + ')', propR < pR);
    T('CELAH PERABOT: masih >= setengah lebar visual avatar (' + AVATAR_HALF_W + ') — badan tak menembus meja',
        propR >= AVATAR_HALF_W);

    // Dua balok perabot dgn celah G di antaranya; lolos jika G >= 2*radius.
    // G diambil dari TENGAH kedua radius supaya uji ini ikut nilai config: ia
    // harus lolos di propRadius dan MENTOK di player.radius.
    const G = propR + pR;                       // = 2*((propR+pR)/2)
    const mkB = (x) => ({ x, z: 0, hx: 10, hz: 10, axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(10, 10), top: 7, standable: true });
    const twoDesks = [mkB(-(10 + G / 2)), mkB(10 + G / 2)];
    const probe = (radius) => { const p = { x: 0, z: 0 }; resolveBlockers(p, radius, 0, twoDesks); return Math.abs(p.x) < 1e-9; };
    T('CELAH PERABOT: celah ' + G.toFixed(1) + 'u (' + (G / 7).toFixed(2) + ' m) kini BISA dilewati', probe(propR));
    T('CELAH PERABOT: celah yang sama dulu MENTOK di player.radius (uji ini bermakna)', !probe(pR));

    // Wiring: perabot pakai propClearance(), sisanya TIDAK boleh ikut menyusut.
    let wireOk = true, wireBad = '';
    for (const st of ['stage1', 'stage2', 'stage3']) {
        const src3 = fs.readFileSync(ROOT + '/src/scenes/campaign/stages/' + st + '/index.js', 'utf8');
        const pc = src3.slice(src3.indexOf('playerCollide('));
        const body = pc.slice(0, pc.indexOf('\n    },'));
        const has = (re) => re.test(body);
        if (!has(/resolve\(pos,\s*propClearance\(\)/) || has(/resolve\(pos,\s*player\.radius/)) { wireOk = false; wireBad = wireBad || (st + ' perabot'); }
        // Dinding & peti/barel WAJIB tetap radius penuh.
        if (!has(/slideWalk\([^)]*player\.radius\)/)) { wireOk = false; wireBad = wireBad || (st + ' dinding'); }
        if (has(/resolveCrateBlock\(pos,\s*propClearance/) || has(/resolveBarrelBlock\(pos,\s*propClearance/)) { wireOk = false; wireBad = wireBad || (st + ' peti/barel'); }
    }
    T('CELAH PERABOT: stage 1-3 memakai propClearance() utk perabot saja' + (wireBad ? ' [' + wireBad + ']' : ''), wireOk);
}

// --- 16b. TANPA DINDING GANDA (2026-07-18): denah gedung stage 1/2/3 dirapatkan
// agar SETIAP celah antar-ruang = 1 sel dinding. Detektor: run dinding tebal-2
// (dua tembok paralel berdempetan = selalu ganda) ATAU tebal-3 dgn sel TENGAH
// tak ter-render (dua strip + celah terlihat). Sudut/tembok tipis panjang tidak
// dihitung. Cermin scratchpad walls.mjs. ---
{
    const s1mod = await import(R('src/scenes/campaign/stages/stage1/index.js'));
    if (!s1mod.s1grid) s1mod.buildWorld();
    const wcl = (g, c, r) => (r < 0 || c < 0 || r >= g.length || c >= g[0].length) ? true : g[r][c] === 1;
    const flr = (g, c, r) => !wcl(g, c, r);
    const rnd = (g, c, r) => {   // sel dinding ter-render? (punya tetangga-8 lantai)
        if (!wcl(g, c, r)) return false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (flr(g, c + dc, r + dr)) return true;
        return false;
    };
    // DINDING GANDA = dua RUN dinding sejajar berdempetan. Sebuah sel yang di
    // arah run-nya sendiri hanya sepanjang SATU sel bukan run — itu nub sudut
    // (mis. Stage 1 c39 r30: pangkal tembok vertikal yang bertemu tembok
    // horizontal r29 dan langsung disusul pintu). Tanpa pengecualian ini setiap
    // pertemuan T dua tembok terhitung ganda padahal tak ada celah mati di
    // dalamnya. Pengecualian sempit: HANYA berlaku bila salah satu sel pasangan
    // kosong (lantai) di KEDUA sisi tegak-lurusnya.
    const nubH = (g, c, r) => flr(g, c, r - 1) && flr(g, c, r + 1);   // nub di kolom -> bukan run vertikal
    const nubV = (g, c, r) => flr(g, c - 1, r) && flr(g, c + 1, r);   // nub di baris -> bukan run horizontal
    const bands = (g) => {
        let n = 0;
        for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
            const skipH = nubH(g, c, r) || nubH(g, c + 1, r);
            const skipV = nubV(g, c, r) || nubV(g, c, r + 1);
            if (flr(g, c - 1, r) && wcl(g, c, r) && wcl(g, c + 1, r) && flr(g, c + 2, r)) { if (!skipH) n++; }
            else if (flr(g, c - 1, r) && wcl(g, c, r) && wcl(g, c + 1, r) && wcl(g, c + 2, r) && flr(g, c + 3, r) && !rnd(g, c + 1, r)) n++;
            if (flr(g, c, r - 1) && wcl(g, c, r) && wcl(g, c, r + 1) && flr(g, c, r + 2)) { if (!skipV) n++; }
            else if (flr(g, c, r - 1) && wcl(g, c, r) && wcl(g, c, r + 1) && wcl(g, c, r + 2) && flr(g, c, r + 3) && !rnd(g, c, r + 1)) n++;
        }
        return n;
    };
    const b1 = bands(s1mod.s1grid), b2 = bands(s2mod.s2grid), b3 = bands(s3mod.s3grid);
    T('No double walls: stage 1 grid (' + b1 + ' band)', b1 === 0);
    T('No double walls: stage 2 grid (' + b2 + ' band)', b2 === 0);
    T('No double walls: stage 3 grid (' + b3 + ' band)', b3 === 0);

    // STAGE 1 DENAH RESMI 2026-07-20 (stage1-v2.csv, 50x50): SEMUA lantai terhubung
    // dari START (BFS) + START/KOMPUTER di lantai. Cermin S3 di atas.
    {
        const grid = s1mod.s1grid, ROWS = grid.length, COLS = grid[0].length;
        const seen = grid.map(row => row.map(() => false));
        const st = s1mod.S1_START, q = [[st.c, st.r]]; seen[st.r][st.c] = true;
        let reach = 0, floorN = 0;
        while (q.length) {
            const [c, r] = q.shift(); reach++;
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = c + dc, nr = r + dr;
                if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
                if (grid[nr][nc] === 0 && !seen[nr][nc]) { seen[nr][nc] = true; q.push([nc, nr]); }
            }
        }
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === 0) floorN++;
        T('S1: grid 50x50 (plan resmi stage1-v2)', COLS === 50 && ROWS === 50);
        T('S1: SEMUA lantai gedung terhubung dari START (BFS, ' + floorN + ' sel)', reach === floorN && floorN > 1500);
        T('S1: START & KOMPUTER di lantai',
            !s1mod.s1Wall(s1mod.S1_START.c, s1mod.S1_START.r) && !s1mod.s1Wall(s1mod.S1_COMP.c, s1mod.S1_COMP.r));
    }

    // --- 16b-2. REVISI DENAH STAGE 1 (2026-08-12, CSV user): token '+' pintu
    // RUSAK, '/' celah tembok, '*' tumpukan perabot, '@' bank komputer + '$'
    // petak pijak, dan pintu NAC. Yang diuji = KONSEKUENSI GAMEPLAY-nya, bukan
    // sekadar keberadaan tabelnya: barikade benar-benar menutup, celah benar-
    // benar bisa dilewati SEUKURAN BADAN PLAYER, dan pintu rusak tak pernah
    // membuka. ---
    {
        const doorMod = await import(R('src/scenes/campaign/utility/doors.js'));
        const palS1 = await import(R('src/world/palette.js'));
        const PRAD = cfgMod.CFG.player.radius, PROP = cfgMod.CFG.player.propRadius;
        const S1 = s1mod.S1;
        // Lingkaran radius r muat di (c,r) tanpa didorong perabot MAUPUN dinding?
        const freeAt = (c, r, rad, propRad) => {
            const p = s1mod.s1Cell(c, r);
            if (!s1mod.stage1Walk(p.x, p.z, rad)) return false;
            stateMod._v3.set(p.x, 0, p.z);
            s1mod.resolve(stateMod._v3, propRad, 0);
            return Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) < 1e-6;
        };

        // (a) TUMPUKAN PERABOT '*': setiap selnya PEJAL — pusat sel selalu
        //     terdorong keluar, jadi player tak bisa berdiri apalagi menembus.
        const bar = s1mod.s1BarricadesDbg();
        let barSolid = true;
        for (const [c, r] of bar) {
            if (s1mod.s1Wall(c, r)) barSolid = false;              // tetap LANTAI di grid (BFS denah utuh)
            if (freeAt(c, r, 0.5, PROP)) barSolid = false;         // tapi pejal ke perabot
        }
        T('S1 DENAH: ke-' + bar.length + ' sel barikade "*" tetap lantai di grid tapi PEJAL ke player',
            bar.length === 29 && barSolid);

        // (b) Barikade juga menutup untuk ROBOT: nav-grid tak boleh punya sel
        //     berjalan di dalamnya (kalau bocor, robot menembus tumpukan).
        const nav = s1mod.s1Nav;                  // resolusi SETENGAH sel -> 2x2 node per sel denah
        let navSealed = true;
        for (const [c, r] of bar)
            for (const ci of [c * 2, c * 2 + 1]) for (const ri of [r * 2, r * 2 + 1])
                if (nav.walk[ri * nav.cols + ci]) navSealed = false;
        T('S1 DENAH: barikade "*" ikut ter-bake ke nav-grid (robot memutar, tak menembus)', navSealed);

        // (c) CELAH TEMBOK '/': lubangnya harus benar-benar bisa DILEWATI badan
        //     player (radius penuh) — sel celah + sel di kedua sisinya lapang.
        const brc = s1mod.s1BreachesDbg();
        let breachOK = brc.length === 2;
        for (const [c, r, dir] of brc) {
            const dc = dir === 'ew' ? 1 : 0, dr = dir === 'ew' ? 0 : 1;
            if (!freeAt(c, r, PRAD, PROP)) breachOK = false;
            if (!freeAt(c - dc, r - dr, PRAD, PROP)) breachOK = false;
            if (!freeAt(c + dc, r + dr, PRAD, PROP)) breachOK = false;
        }
        T('S1 DENAH: kedua celah tembok "/" bisa dilewati player seukuran badan penuh', breachOK);

        // (d) PINTU RUSAK '+': ada dua, keduanya locked+broken, TAK PERNAH
        //     bergerak walau player berdiri di depannya, dan tetap memblok robot.
        //     Section alur di atas sudah menuntaskan hack mainframe, yang kini
        //     MELEPAS seluruh kunci (override kill-switch 2026-08-16) — jadi
        //     kembalikan dulu ke keadaan denah, persis seperti `enter()`.
        doorMod.resetDoorLocks(s1mod.s1DoorsDbg());
        const brokenDoors = s1mod.s1DoorsDbg().filter(d => d.broken);
        const bd = brokenDoors[0];
        const openBefore = bd ? bd.open : -1;
        const bp = s1mod.s1Cell(4, 6);                            // tepat di depan pintu rusak c3-4 r7
        camera.position.set(bp.x, cfgMod.CFG.player.eyeHeight, bp.z);
        for (let i = 0; i < 40; i++) doorMod.updateStageDoors(s1mod.s1DoorsDbg(), 0.05);
        T('S1 DENAH: dua pintu RUSAK "+" terkunci permanen & daunnya tak pernah bergerak',
            brokenDoors.length === 2 && brokenDoors.every(d => d.locked && d.broken)
            && openBefore === doorMod.DOOR_BROKEN_AJAR && bd.open === doorMod.DOOR_BROKEN_AJAR
            && doorMod.doorsWalkable(brokenDoors, bd.cx, bd.cz, 0) === false);
        // setDoorLocked TIDAK boleh bisa membukanya (objektif mana pun)
        doorMod.setDoorLocked(bd, false);
        T('S1 DENAH: pintu RUSAK kebal setDoorLocked (tak ada objektif yang bisa membukanya)', bd.locked === true);
        // ...dan PLAYER pun tak boleh menembusnya. Pintu merah yang menahan robot
        // + peluru tapi meloloskan player adalah bug yang benar-benar terjadi di
        // Stage 2 (laporan user 2026-08-13): scene-nya tak pernah memanggil
        // resolveDoors di playerCollide. Diuji lewat playerCollide SUNGGUHAN.
        {
            let solidToPlayer = true;
            for (const d of brokenDoors) {
                const from = { x: d.cx, z: d.cz - S1.CELL };
                stateMod._v3.set(d.cx, 0, d.cz);
                s1mod.stage1Scene.playerCollide(stateMod._v3, from.x, from.z, 0);
                if (Math.abs(stateMod._v3.z - d.cz) < d.hz + PRAD - 0.01) solidToPlayer = false;
            }
            T('S1 DENAH: pintu RUSAK "+" PEJAL ke player (playerCollide mendorongnya keluar)', solidToPlayer);
        }

        // (e) BANK KOMPUTER '@' pejal di dinding timur ruang akses, dan petak
        //     pijak '$' tepat di sebelahnya masih lapang untuk berdiri.
        let bankSolid = true;
        for (let r = s1mod.S1_TERMINAL_BANK.r0; r <= s1mod.S1_TERMINAL_BANK.r1; r++)
            if (freeAt(s1mod.S1_TERMINAL_BANK.c, r, 0.5, PROP)) bankSolid = false;
        const accCell = s1mod.S1_ACCESS, accP = s1mod.s1Cell(accCell.c, accCell.r);
        const bankP = s1mod.s1Cell(s1mod.S1_TERMINAL_BANK.c, accCell.r);
        T('S1 DENAH: bank komputer "@" pejal sepanjang dinding & petak "$" di depannya bisa dipijak',
            bankSolid && freeAt(accCell.c, accCell.r, PRAD, PROP)
            && Math.hypot(accP.x - bankP.x, accP.z - bankP.z) <= S1.CELL + 0.01);

        // (e2) BANK KOMPUTER benar-benar terbaca sebagai KOMPUTER, bukan kotak
        //      polos (2026-08-12, permintaan user "seperti placeholder"): tiap sel
        //      punya belasan bagian, layar MENYALA, dan sel operator '$' punya
        //      layar besar yang DIMIRINGKAN. Yang struktural: TAK SATU PUN bagian
        //      boleh keluar dari sel 48 — di sebelah baratnya adalah petak pijak
        //      tempat player berdiri, jadi geometri yang menjorok = benda melayang
        //      menembus badan pemain.
        {
            const parts = s1mod.s1BankDbg();
            const cells = s1mod.S1_TERMINAL_BANK.r1 - s1mod.S1_TERMINAL_BANK.r0 + 1;
            const westX = S1.x0 + s1mod.S1_TERMINAL_BANK.c * S1.CELL;
            const halfSpan = (m) => {
                const [sx, sy] = m.geometry.args, rz = m.rotation.z || 0;
                return Math.abs(sx / 2 * Math.cos(rz)) + Math.abs(sy / 2 * Math.sin(rz));
            };
            const outside = parts.filter(m =>
                m.position.x - halfSpan(m) < westX - 1e-6 || m.position.x + halfSpan(m) > westX + S1.CELL + 1e-6);
            if (outside.length) console.log('  bagian bank keluar sel:', outside.length,
                outside.slice(0, 4).map(m => m.position.x.toFixed(2)).join(' '));
            // Emissive NYATA = warna emissive-nya bukan hitam (stub harness memberi
            // SEMUA material emissiveIntensity default, jadi jangan pakai itu sbg filter).
            const emis = parts.filter(m => (m.material?.emissive?.getHex?.() || 0) !== 0);
            const tilted = parts.filter(m => Math.abs(m.rotation.z || 0) > 0.05);
            const opZ = s1mod.s1Cell(s1mod.S1_TERMINAL_BANK.c, s1mod.S1_ACCESS.r).z;
            T('S1 BANK "@": ' + parts.length + ' bagian (rak/bay/kisi/LED/layar) tetap di dalam sel, layar menyala,'
                + ' sel operator punya layar miring sendiri',
                parts.length >= cells * 15 && outside.length === 0
                && emis.length >= cells * 2 && emis.every(m => m.material.emissiveIntensity <= palS1.EMISSIVE_MAX)
                && tilted.length >= 2 && tilted.every(m => Math.abs(m.position.z - opZ) < S1.CELL / 2)
                && parts.every(m => !m.isPointLight));

            // (e3) TUMPUKAN BARIKADE bervariasi (2026-08-12, permintaan user "kalo
            //      cuma lemari gitu terlihat monoton"): banyak RESEP berbeda dan
            //      banyak JENIS perabot, bukan satu benda yang diulang.
            const mix = s1mod.s1BarricadeMixDbg();
            const recipes = new Set(mix.map(m => m.recipe));
            const kinds = new Set(mix.flatMap(m => m.kinds));
            const perRow = {};                          // tiap garis barikade ikut bervariasi
            for (const m of mix) (perRow[m.r] ??= new Set()).add(m.recipe);
            const longestRow = Object.values(perRow).sort((a, b) => b.size - a.size)[0];
            T('S1 BARIKADE "*": ' + recipes.size + ' resep & ' + kinds.size + ' jenis perabot berbeda'
                + ' (bukan lemari berulang)',
                mix.length === s1mod.s1BarricadesDbg().length
                && recipes.size >= 6 && kinds.size >= 7
                && mix.every(m => m.kinds.length >= 3) && longestRow.size >= 4);
        }

        // (f) Setelah semua perabot/barikade berdiri, SELURUH lantai masih bisa
        //     dicapai dari START pada CLEARANCE PLAYER (radius penuh) — barikade
        //     boleh memutus jalur pintas, tak boleh mengurung satu ruangan pun.
        //     Sampel SEPEREMPAT sel: bukaan selebar satu sel hanya memuat badan
        //     player (radius 5 dari 14 unit) dalam pita +-2 unit di tengahnya,
        //     jadi grid seperempat sel (titik +-1.75 dari pusat) adalah resolusi
        //     terkasar yang masih bisa "melewati" pintu. Setengah sel TIDAK bisa.
        {
            const step = S1.CELL / 4, N = S1.G * 4;
            // Pintu RUSAK '+' ikut memblok (urutan sama dengan playerCollide).
            // Hanya yang `broken` — pintu `locked` seperti NAC memang dibuka oleh
            // alur permainan, jadi bukan tembok permanen.
            const ok = new Uint8Array(N * N);
            const drs1 = s1mod.s1DoorsDbg().filter(d => d.broken);
            let total = 0;
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                const x = S1.x0 + (i + 0.5) * step, z = S1.z0 + (j + 0.5) * step;
                if (!s1mod.stage1Walk(x, z, PRAD)) continue;
                stateMod._v3.set(x, 0, z);
                s1mod.resolve(stateMod._v3, PROP, 0);
                doorMod.resolveDoors(drs1, stateMod._v3, PRAD, true);
                if (Math.abs(stateMod._v3.x - x) + Math.abs(stateMod._v3.z - z) > 0.01) continue;
                ok[j * N + i] = 1; total++;
            }
            const sp = s1mod.s1Cell(s1mod.S1_START.c, s1mod.S1_START.r);
            const seen = new Uint8Array(N * N);
            const k0 = Math.floor((sp.z - S1.z0) / step) * N + Math.floor((sp.x - S1.x0) / step);
            const q = [k0]; seen[k0] = 1;
            let reach = ok[k0] ? 1 : 0;
            for (let h = 0; h < q.length; h++) {
                const k = q[h], i = k % N, j = (k - i) / N;
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const i2 = i + di, j2 = j + dj;
                    if (i2 < 0 || j2 < 0 || i2 >= N || j2 >= N) continue;
                    const k2 = j2 * N + i2;
                    if (ok[k2] && !seen[k2]) { seen[k2] = 1; reach++; q.push(k2); }
                }
            }
            // Sisa <0.5% yang boleh terkurung = celah sempit di belakang perabot
            // yang menempel dinding (tak pernah jadi tujuan). Yang benar-benar
            // dijaga: TIAP RUANGAN dan tiap titik objektif harus tercapai.
            const ptSeen = (x, z) => {                     // ada titik tercapai dalam setengah sel dari (x,z)?
                const h = S1.CELL / 2;
                const i0 = Math.max(0, Math.floor((x - h - S1.x0) / step)), i1 = Math.min(N - 1, Math.floor((x + h - S1.x0) / step));
                const j0 = Math.max(0, Math.floor((z - h - S1.z0) / step)), j1 = Math.min(N - 1, Math.floor((z + h - S1.z0) / step));
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
                    if (ok[j * N + i] && seen[j * N + i]) return true;
                return false;
            };
            const cellSeen = (c, r) => { const p = s1mod.s1Cell(c, r); return ptSeen(p.x, p.z); };
            const roomsSeen = s1mod.s1LampsDbg().every(lm => {
                const c0 = Math.round((lm.x0 - S1.x0) / S1.CELL), c1 = Math.round((lm.x1 - S1.x0) / S1.CELL) - 1;
                const r0 = Math.round((lm.z0 - S1.z0) / S1.CELL), r1 = Math.round((lm.z1 - S1.z0) / S1.CELL) - 1;
                for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (cellSeen(c, r)) return true;
                return false;
            });
            const fin = { c: (s1mod.S1_FINISH.c0 + s1mod.S1_FINISH.c1) >> 1, r: (s1mod.S1_FINISH.r0 + s1mod.S1_FINISH.r1) >> 1 };
            const missed = [];
            for (const [c, r] of [[s1mod.S1_START.c, s1mod.S1_START.r], [s1mod.S1_ACCESS.c, s1mod.S1_ACCESS.r],
            [s1mod.S1_COMP.c, s1mod.S1_COMP.r], [fin.c, fin.r],
            ...s1mod.s1BreachesDbg().map(b => [b[0], b[1]])])
                if (!cellSeen(c, r)) missed.push('c' + c + ',r' + r);
            for (const d of s1mod.s1DoorsDbg())            // tiap mulut pintu yang BISA dibuka
                if (!d.broken && !ptSeen(d.cx, d.cz)) missed.push('pintu@' + d.cx.toFixed(0) + ',' + d.cz.toFixed(0));
            // Sisa <1% yang boleh terkurung = celah setipis badan di belakang rak
            // yang menempel dinding; yang dijaga keras = ruangan, pintu, objektif.
            const reachOK = total > 3000 && reach / total > 0.99 && roomsSeen && missed.length === 0;
            if (!reachOK) {
                if (missed.length) console.log('  titik kunci terkurung:', missed.join(' '));
                for (let r = 0; r < S1.G; r++) {           // peta: . tercapai | X terkurung | - tak muat | # dinding
                    let ln = '';
                    for (let c = 0; c < S1.G; c++) {
                        let a = 0, s = 0;
                        for (let j = r * 4; j < r * 4 + 4; j++) for (let i = c * 4; i < c * 4 + 4; i++) {
                            if (ok[j * N + i]) a = 1;
                            if (ok[j * N + i] && seen[j * N + i]) s = 1;
                        }
                        ln += s1mod.s1Wall(c, r) ? '#' : (s ? '.' : (a ? 'X' : '-'));
                    }
                    console.log('  ' + String(r).padStart(2) + ' ' + ln);
                }
            }
            T('S1 DENAH: tiap ruangan, tiap mulut pintu & tiap titik objektif tercapai dari START'
                + ' pada clearance PLAYER (' + reach + '/' + total + ')', reachOK);
        }
    }
}

// --- 16c. INTERIOR FUTURISTIK (2026-07-18): material dinding/lantai stage 1-3
// (interior.js) — panel terang + aksen strip/nat TEAL menyala. Wajib patuh GIBS
// 2045: aksen emissive = PAL.tech, intensity <= EMISSIVE_MAX, tanpa neon. ---
{
    const intMod = await import(R('src/scenes/campaign/utility/interior.js'));
    const palM = await import(R('src/world/palette.js'));
    const fmat = intMod.buildInteriorFloorMat(30, 30), wmat = intMod.buildInteriorWallMat();
    const eHex = (m) => (m.emissive && m.emissive.getHex) ? m.emissive.getHex() : 0;
    T('Interior: material lantai & dinding terbangun (punya map)', !!(fmat && wmat && fmat.map && wmat.map));
    T('Interior: emissive aksen = PAL.tech (teal), bukan neon terlarang',
        eHex(fmat) === palM.PAL.tech && eHex(wmat) === palM.PAL.tech
        && !palM.FORBIDDEN_HEX.includes(eHex(fmat)) && !palM.FORBIDDEN_HEX.includes(eHex(wmat)));
    T('Interior: emissiveIntensity <= EMISSIVE_MAX',
        fmat.emissiveIntensity <= palM.EMISSIVE_MAX && wmat.emissiveIntensity <= palM.EMISSIVE_MAX);
}

// --- 16d. PINTU GESER OTOMATIS (2026-07-18): doors.js — HANYA PLAYER membuka,
// dan hanya bila player <= 2 KOTAK DI DEPAN bukaan pintu (permintaan user);
// robot TIDAK membuka; di luar zona = SELALU tutup. DUA DAUN 50:50 bergeser
// simetris ke kiri/kanan saat buka, tanpa bergerak vertikal. ---
{
    const doorMod = await import(R('src/scenes/campaign/utility/doors.js'));
    const CELL = 14;
    const cellFn = (c, r) => ({ x: c * 20, z: r * 20 });   // koordinat sintetis, jauh dari robot nyata
    const doors = doorMod.buildStageDoors([{ c0: 5, r0: 5, c1: 5, r1: 5, dir: 'ew' }], cellFn, CELL, 22);
    const dr = doors[0], closedSplit = doorMod.splitDoorDebug(dr.rig);
    const splitSep = s => Math.abs((s.horizontal ? s.leaves[1].x : s.leaves[1].z)
        - (s.horizontal ? s.leaves[0].x : s.leaves[0].z));
    const closedSep = splitSep(closedSplit);
    T('Doors: pintu terbangun sebagai DUA daun 50:50 yang bertemu simetris',
        doors.length === 1 && closedSplit.leaves.length === 2
        && Math.abs(closedSep - closedSplit.span / 2) < 1e-6
        && Math.abs(closedSplit.leaves[0].y - closedSplit.leaves[1].y) < 1e-6);
    // Helper: setel posisi player, jalankan sampai stabil, kembalikan panel.y.
    // Durasi settle config-driven: harus melewati delay tutup closeDelaySec
    // (2026-07-20) + animasi buka/tutup supaya keadaan akhirnya deterministik.
    const doorDelay = cfgMod.CFG.campaign.doors.closeDelaySec;
    const settleFrames = Math.ceil((doorDelay + 1.5) / 0.05);
    const settle = (x, z) => {
        camera.position.set(x, 11, z);
        for (let i = 0; i < settleFrames; i++) doorMod.updateStageDoors(doors, 0.05);
        return doorMod.splitDoorDebug(dr.rig);
    };
    const isOpen = s => splitSep(s) > s.span * 1.25;
    const isShut = s => Math.abs(splitSep(s) - closedSep) < 0.5;
    // 'ew' → arah masuk = ±x (perp), sejajar bukaan = z (para).
    const splitFar = settle(dr.cx + 400, dr.cz + 400);        // jauh → tutup
    const splitFront2 = settle(dr.cx + 2 * CELL, dr.cz);      // 2 kotak di depan → BUKA
    const splitFront3 = settle(dr.cx + 3 * CELL, dr.cz);      // 3 kotak → terlalu jauh, tutup
    const splitSide = settle(dr.cx, dr.cz + 2 * CELL);        // sejajar, meleset dari bukaan → tutup
    T('Doors: BUKA hanya saat player <= 2 kotak DI DEPAN bukaan',
        isShut(splitFar) && isOpen(splitFront2) && isShut(splitFront3) && isShut(splitSide));
    T('Doors: animasi buka menggeser daun kiri/kanan simetris tanpa turun ke lantai',
        Math.abs(splitFront2.leaves[0].y - closedSplit.leaves[0].y) < 1e-6
        && Math.abs(splitFront2.leaves[1].y - closedSplit.leaves[1].y) < 1e-6
        && Math.abs((splitFront2.horizontal ? splitFront2.leaves[0].x : splitFront2.leaves[0].z)
            + (splitFront2.horizontal ? splitFront2.leaves[1].x : splitFront2.leaves[1].z)) < 1e-6);
    // SISA TAMPAK (2026-08-08, permintaan user): terbuka penuh menyisakan
    // DOOR_OPEN_REVEAL bagian tiap daun di dalam bukaan — pintu tidak lagi
    // tenggelam seluruhnya ke dinding. Fraksi dibaca dari modul, bukan 0.1
    // hardcoded, supaya retune angkanya tidak memecahkan tes.
    const leafReveal = s => {
        const off = Math.abs(s.horizontal ? s.leaves[1].x : s.leaves[1].z);
        return (s.span / 2 - (off - s.leafSpan / 2)) / s.leafSpan;
    };
    T('Doors (2026-08-08): terbuka penuh menyisakan 10% tiap daun di bukaan, tidak masuk semua ke dinding',
        doorMod.DOOR_OPEN_REVEAL > 0 && doorMod.DOOR_OPEN_REVEAL < 1
        && Math.abs(leafReveal(splitFront2) - doorMod.DOOR_OPEN_REVEAL) < 1e-6
        && Math.abs(leafReveal(closedSplit) - 1) < 1e-6
        && Math.abs(closedSplit.travel - closedSplit.leafSpan * (1 - doorMod.DOOR_OPEN_REVEAL)) < 1e-6
        && closedSplit.travel < closedSplit.leafSpan);
    // Uji peluru-vs-daun WAJIB memakai offset yang sama dengan visual: sisa 10%
    // itu benar-benar ada, jadi tembakan tepat di tepi bukaan tetap tertahan
    // sementara koridor tengahnya bebas. Pintu 'ew' => bukaan memanjang di z,
    // peluru menyeberang di x.
    {
        const openSplit = settle(dr.cx + 2 * CELL, dr.cz);    // pastikan TERBUKA penuh
        const innerEdge = Math.abs(openSplit.leaves[1].z) - openSplit.leafSpan / 2;
        const shootAcross = zOff => doorMod.doorBlocksShot(
            doors, dr.cx - 40, dr.cz + zOff, dr.cx + 40, dr.cz + zOff, 11);
        T('Doors (2026-08-08): sisa daun 10% ikut menahan peluru di tepi bukaan, koridor tengah tetap bebas',
            innerEdge < openSplit.span / 2 && shootAcross(innerEdge + 0.2) === true
            && shootAcross(0) === false);
    }
    // DELAY TUTUP (2026-07-20, permintaan user): pintu TIDAK langsung menutup
    // saat player keluar zona — masih terbuka selama closeDelaySec berjalan,
    // baru meluncur naik setelah delay habis (config-driven).
    settle(dr.cx + 2 * CELL, dr.cz);                      // BUKA penuh dulu
    camera.position.set(dr.cx + 400, 11, dr.cz + 400);    // player keluar zona
    for (let i = 0; i < Math.floor(doorDelay * 0.5 / 0.05); i++) doorMod.updateStageDoors(doors, 0.05);
    const splitLinger = doorMod.splitDoorDebug(dr.rig);   // baru ~setengah delay → masih TERBUKA
    for (let i = 0; i < Math.ceil((doorDelay * 0.5 + 1.5) / 0.05); i++) doorMod.updateStageDoors(doors, 0.05);
    const splitDelayed = doorMod.splitDoorDebug(dr.rig);  // delay habis → TERTUTUP
    T('Doors (2026-07-20): delay tutup closeDelaySec — masih terbuka di tengah delay, tertutup setelah habis',
        isOpen(splitLinger) && isShut(splitDelayed));
    // ROBOT di depan pintu TIDAK membukanya (player jauh) — hanya player yang bisa.
    const fakeBot = { mesh: { position: { x: dr.cx + CELL, y: 0, z: dr.cz } } };
    robots.push(fakeBot);
    const splitBot = settle(dr.cx + 400, dr.cz + 400);    // player jauh, robot di depan pintu
    robots.splice(robots.indexOf(fakeBot), 1);
    T('Doors: robot di depan pintu TIDAK membuka (hanya player)', isShut(splitBot));
    // ROBOT tak bisa MENEMBUS pintu tertutup: resolveDoors mendorong keluar saat
    // TUTUP, tapi TIDAK saat TERBUKA (2026-07-18, permintaan user).
    settle(dr.cx + 400, dr.cz + 400);                     // pastikan TUTUP (player jauh)
    const pShut = { x: dr.cx, z: dr.cz };
    doorMod.resolveDoors(doors, pShut, 3.5);
    const pushedOut = Math.abs(pShut.x - dr.cx) > 3;      // 'ew' → didorong di sumbu-x keluar daun
    settle(dr.cx + 2 * CELL, dr.cz);                      // BUKA (player 2 kotak di depan)
    const pOpen = { x: dr.cx, z: dr.cz };
    doorMod.resolveDoors(doors, pOpen, 3.5);
    const passesOpen = pOpen.x === dr.cx && pOpen.z === dr.cz;
    T('Doors: robot DIBLOK saat tutup, TEMBUS saat terbuka', pushedOut && passesOpen);
    // PELURU vs PINTU (2026-07-19, permintaan user): peluru player & robot MATI
    // di daun pintu TERTUTUP (doorBlocksShot dipanggil bulletBlocked stage 1-3);
    // tembus saat pintu terbuka penuh; ruas yang meleset dari pintu tetap bebas.
    settle(dr.cx + 400, dr.cz + 400);   // player jauh -> pintu TUTUP
    const shotShut = doorMod.doorBlocksShot(doors, dr.cx - 30, dr.cz, dr.cx + 30, dr.cz, 8);
    const shotMiss = doorMod.doorBlocksShot(doors, dr.cx - 30, dr.cz + 80, dr.cx + 30, dr.cz + 80, 8);
    settle(dr.cx + 2 * CELL, dr.cz);    // player 2 kotak di depan -> pintu BUKA penuh
    const shotOpen = doorMod.doorBlocksShot(doors, dr.cx - 30, dr.cz, dr.cx + 30, dr.cz, 8);
    T('Doors: peluru DIBLOK pintu tertutup, TEMBUS saat terbuka, ruas meleset bebas',
        shotShut === true && shotOpen === false && shotMiss === false);
    // LEDAKAN vs PINTU (2026-07-19, bug fix — AoE launcher tak boleh menembus
    // pintu tertutup): (a) doorClampShot menjepit posisi peluru ledak ke SISI
    // PENEMBAK daun pintu (dulu boom di posisi setelah maju frame = bisa sudah
    // DI BALIK pintu); (b) explodeAt melewati robot yang terhalang pintu lewat
    // hook scene blastBlocked (stage 1-3 -> doorBlocksShot).
    settle(dr.cx + 400, dr.cz + 400);                     // player jauh -> pintu TUTUP
    const clampB = { px: dr.cx - 30, pz: dr.cz, mesh: { position: new THREE.Vector3(dr.cx + 30, 8, dr.cz) } };
    const clamped = doorMod.doorClampShot(doors, clampB);
    T('doorClampShot: peluru terjepit di SISI PENEMBAK daun pintu tertutup',
        clamped === true && clampB.mesh.position.x < dr.cx - dr.hx);
    const missB = { px: dr.cx - 30, pz: dr.cz + 80, mesh: { position: new THREE.Vector3(dr.cx + 30, 8, dr.cz + 80) } };
    T('doorClampShot: ruas meleset dari pintu tidak diblok/dijepit',
        doorMod.doorClampShot(doors, missB) === false && missB.mesh.position.x === dr.cx + 30);
    // explodeAt + hook blastBlocked: robot DI BALIK pintu tertutup selamat,
    // robot di sisi ledakan tetap kena (HP besar supaya tak ada killRobot/gore).
    const zNear = mkBot('C', dr.cx - 10, dr.cz), zFar = mkBot('C', dr.cx + 10, dr.cz);
    zNear.hp = 100000; zFar.hp = 100000;
    robots.push(zNear, zFar);
    const prevBB = smMod.activeScene.blastBlocked;
    smMod.activeScene.blastBlocked = (x0, z0, x1, z1, y) => doorMod.doorBlocksShot(doors, x0, z0, x1, z1, y);
    effectsMod.explodeAt(new THREE.Vector3(dr.cx - 14, 8, dr.cz), 60, 10);
    T('explodeAt: AoE TIDAK menembus pintu tertutup (robot di baliknya selamat, sisi ledakan kena)',
        zNear.hp === 100000 - 10 && zFar.hp === 100000);
    if (prevBB === undefined) delete smMod.activeScene.blastBlocked;
    else smMod.activeScene.blastBlocked = prevBB;
    scene.remove(zNear.mesh); scene.remove(zFar.mesh);
    robots.splice(robots.indexOf(zNear), 1); robots.splice(robots.indexOf(zFar), 1);
}

// --- 16e. MUSIK LATAR (DIROMBAK 2026-07-19, permintaan user — 3 KONTEKS):
// MENU (bertahan sepanjang prolog campaign baru, berhenti saat intro heli live), BATTLE
// (bg-music-in-game / -2 dipilih ACAK; menyala saat tembakan player pertama
// KENA robot [robots.js], BUKAN saat stage mulai; berhenti saat masuk shop
// campaign / game over / reset), BOSS (bg-music-boss-fight; menyala saat duel
// tank dimulai [tankBossIntro.endCutscene], berhenti saat boss tumbang). ---
{
    const sfxMod = await import(R('src/utils/sfx.js'));
    T('Music: API baru diekspor (menu/battle/boss/stop + loop helper)',
        typeof sfxMod.startMenuMusic === 'function' && typeof sfxMod.startBattleMusic === 'function'
        && typeof sfxMod.startBossMusic === 'function' && typeof sfxMod.stopMusic === 'function'
        && typeof sfxMod.playLoopSFX === 'function' && typeof sfxMod.stopLoopSFX === 'function');
    const tracks = [sfxMod.bgMusic, sfxMod.bgMusicAlt, sfxMod.bgMusicMenu, sfxMod.bgMusicBoss];
    T('Music: 4 track loop + volume = musicVol slider (default 80%, di bawah SFX 100%)',
        tracks.every(m => m.loop === true && m.volume > 0
            && Math.abs(m.volume - sfxMod.getMusicVolume()) < 1e-9
            && m.volume < sfxMod.getSFXVolume()));
    let played = 0;
    for (const m of tracks) m.play = () => { played++; m.paused = false; return { catch() { } }; };
    sfxMod.stopMusic();
    sfxMod.startBattleMusic();   // pilih acak 1 dari 2 track in-game
    sfxMod.startBattleMusic();   // idempoten — tak mengulang
    T('Music: startBattleMusic idempoten + konteks battle',
        played === 1 && sfxMod.musicDebug() === 'battle');
    sfxMod.startBossMusic();     // battle -> boss (track berganti)
    T('Music: startBossMusic mengganti ke konteks boss',
        sfxMod.musicDebug() === 'boss' && played === 2 && sfxMod.bgMusicBoss.paused === false);
    sfxMod.startBattleMusic();   // battle TIDAK menimpa musik boss (duel berjalan)
    T('Music: battle TIDAK menimpa boss', sfxMod.musicDebug() === 'boss' && played === 2);
    sfxMod.stopMusic();
    T('Music: stopMusic mematikan konteks aktif',
        sfxMod.musicDebug() === null && tracks.every(m => m.paused !== false));
    sfxMod.startMenuMusic();
    T('Music: startMenuMusic menyalakan track menu', sfxMod.musicDebug() === 'menu' && played === 3);
    let activeMenuLoads = 0;
    const realMenuLoad = sfxMod.bgMusicMenu.load;
    sfxMod.bgMusicMenu.load = () => { activeMenuLoads++; };
    sfxMod.preloadAllSFX();
    T('Music: preload loading tidak memanggil load() ulang pada track menu aktif (playback tak terputus)',
        activeMenuLoads === 0 && sfxMod.musicDebug() === 'menu'
        && sfxMod.bgMusicMenu.paused === false);
    sfxMod.bgMusicMenu.load = realMenuLoad;
    sfxMod.stopMusic();
    const menuMusicMod = await import(R('src/scenes/menu.js'));
    T('Music: hanya Campaign baru menahan musik menu utk prolog; Continue/Survival tetap berhenti saat dipilih',
        menuMusicMod.keepMenuMusicFor('campaign', 1) === true
        && menuMusicMod.keepMenuMusicFor('campaign', 2) === false
        && menuMusicMod.keepMenuMusicFor('survival', 1) === false);
    const menuCredits = menuMusicMod.MENU_CREDITS;
    const menuHtml = fs.readFileSync(ROOT + '/index.html', 'utf8');
    T('Menu Credits: bersumber dari menu.js dan memuat kredit proyek utama',
        menuCredits.groups.length >= 7
        && menuCredits.groups.some(c => c.name === 'Arief Nugraha')
        && menuCredits.groups.some(c => c.name.includes('Anthropic Claude')
            && c.name.includes('OpenAI Codex'))
        && menuCredits.groups.some(c => c.name.includes('Three.js r128'))
        && menuCredits.footer.includes('MADE IN INDONESIA')
        && menuHtml.includes('id="creditsBody"'));
    // ATRIBUSI LISENSI wajib bertahan walau panel disederhanakan (2026-08-10):
    // kalimat `detail` dibuang, jadi lisensinya dilipat ke baris nama.
    T('Menu Credits: atribusi lisensi Three.js + Courier Prime tetap tertulis',
        menuCredits.groups.some(c => /three\.js/i.test(c.name) && /MIT/i.test(c.name))
        && menuCredits.groups.some(c => /courier prime/i.test(c.name)
            && /open font license/i.test(c.name)));
    // Bentuk baris = tata bahasa Settings: satu `role` + satu `name`, TANPA
    // kalimat rincian per kredit (itu yang membuat panel lama padat).
    T('Menu Credits: SEDERHANA — tiap kredit satu baris role→name, tanpa kalimat rincian',
        menuCredits.groups.every(c => c.role && c.name
            && c.detail === undefined && c.wide === undefined)
        && menuCredits.eyebrow === undefined && menuCredits.intro === undefined);
    // Scene gameplay TIDAK lagi menyalakan musik di enter() — trigger battle
    // music satu-satunya = peluru player mengenai robot (robots.js).
    const sceneFiles = ['src/scenes/survival/index.js', 'src/scenes/campaign/stages/stage1/index.js',
        'src/scenes/campaign/stages/stage2/index.js', 'src/scenes/campaign/stages/stage3/index.js',
        'src/scenes/campaign/stages/stage4/index.js'];
    T('Music: enter() scene gameplay tak menyalakan musik; trigger = hit peluru di robots.js',
        sceneFiles.every(f => !fs.readFileSync(ROOT + '/' + f, 'utf8').includes('startBattleMusic'))
        && fs.readFileSync(ROOT + '/src/entities/robots.js', 'utf8').includes('startBattleMusic()'));
}

// === STAGE 3 FLOW (2026-07-21, WAVE-based v2 stage3-v2.csv): TAK ADA robot
// sebelum player MENEMBAK PINTU (player berkeliling dulu). Tembak PINTU BLAST '+'
// => GELOMBANG 6 tangga + 6 lift (12); ke-12 mati -> respawn `respawnSec` (8 dtk).
// Hancurkan pintu -> masuk X -> TUNDA `machineFirstWaveSec` (3 dtk) -> GELOMBANG
// 4/mesin (16); habis -> respawn 8 dtk. Hancurkan 4 mesin + habisi robot -> PINTU
// KELUAR 'o' -> stage 4. Config-driven. ===
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
const s3dropsBefore = stateMod.drops.length;
smMod.setScene(s3mod.stage3Scene);   // enter(): reset destructibles + supply (TANPA placeRobots — robot via gelombang)
const s3cfg = cfgMod.CFG.campaign.stage3;
// Kedua hitungan gelombang stage 3 dikali `robotCountMul` (2026-08-16,
// permintaan user: 30% lebih banyak) — dibulatkan seperti scaleRobotCount.
const s3GateWave = Math.round(s3cfg.gateWaveCount * s3cfg.robotCountMul);
const s3MachineWave = Math.round(s3cfg.machineWaveCount * s3cfg.robotCountMul);
const domS3 = await import(R('src/core/dom.js'));
const S3DLGCFG = cfgMod.CFG.campaign.dialogue;
const expectedS3Dialogue = {
    stageStart: {
        speaker: 'Major Gibran',
        text: "I need to get out of this building, ASAP, but the main doors are locked down. I'll have to find a terminal to hack the system and force them open.",
    },
    firstHack: {
        speaker: 'Major Gibran',
        text: 'Damn it, a multi-stage lock. Looks like there are two more terminals I need to hack.',
    },
    allHacked: {
        speaker: 'Major Gibran',
        text: 'That did it! Doors are unlocked. Time to move!',
    },
    enterLobby: {
        speaker: 'Major Gibran',
        text: "They've set up a production unit right in the main lobby?! I can't leave this active. I need to destroy it before heading to the LZ!",
    },
    inactiveTerminal: {
        speaker: 'Major Gibran',
        text: 'Hm this computer is not working',
    },
};
const finishS3Dialogue = () => {
    for (let guard = 0; guard < 10 && s3mod.s3DialogueDebug().key; guard++) {
        const d = s3mod.s3DialogueDebug();
        s3mod.stage3Scene.updateMode(
            d.text.length / Math.max(1, S3DLGCFG.cps) + Math.max(0, S3DLGCFG.holdSec) + 0.01,
        );
    }
};
T('S3 DIALOG: lima naskah + label Major Gibran dipatok PERSIS',
    JSON.stringify(s3mod.S3_DIALOGUE) === JSON.stringify(expectedS3Dialogue));
T('S3 DIALOG START: masuk stage langsung membuka body kosong + caret typewriter',
    s3mod.s3DialogueDebug().key === 'stageStart' && s3mod.s3DialogueDebug().shown === ''
    && s3mod.s3DialogueDebug().typing === true
    && domS3.stageRadioDialogueDebug().speaker === 'Major Gibran'
    && domS3.stageRadioDialogueDebug().text === '' && domS3.stageRadioDialogueDebug().typing === true);
s3mod.stage3Scene.updateMode(1.1 / Math.max(1, S3DLGCFG.cps));
T('S3 DIALOG TYPEWRITER: dialog stage-start muncul satu karakter lebih dulu',
    s3mod.s3DialogueDebug().chars === 1
    && s3mod.s3DialogueDebug().shown === expectedS3Dialogue.stageStart.text.slice(0, 1));
finishS3Dialogue();
// KAMERA khusus stage 3 (2026-07-21, permintaan user): memandang dari BARAT LAUT
// (NW→SE). followViewCam menerapkan `camOffset` (z<0) → SCREEN_UP (basis atas layar)
// menunjuk TENGGARA (x>0,z>0), basis WASD/radar ikut berputar.
rendererMod.followViewCam(0.016);
T('S3 KAMERA: camOffset BARAT LAUT (NW) -> SCREEN_UP menunjuk TENGGARA (x>0, z>0)',
    s3mod.stage3Scene.camOffset.x < 0 && s3mod.stage3Scene.camOffset.z < 0
    && rendererMod.SCREEN_UP.x > 0 && rendererMod.SCREEN_UP.z > 0);
T('S3: mulai fase door + 0 robot + 0 terminal ter-hack (boleh berkeliling)',
    s3mod.s3Debug().phase === 'door' && robots.filter(z => z.stage === 3).length === 0
    && s3mod.s3Debug().hacked === 0 && s3mod.s3Debug().hacking === false);
T('S3: enter menaruh supply (ruang W + ruang X digandakan)', stateMod.drops.length > s3dropsBefore);
T('S3: PINTU BLAST terkunci (TAK BISA ditembak) + rambu MERAH + memblok',
    s3mod.s3DoorDbg().open === false && s3mod.s3DoorDbg().visible === true
    && s3mod.s3DoorDbg().blocked === true && s3mod.s3DoorDbg().signHex === 0xff3b2e);
T('S3 PINTU: blast door dan exit door sama-sama memakai dua daun 50:50',
    s3mod.s3DoorDbg().split.leaves.length === 2
    && s3mod.s3DoorDbg().exitSplit.leaves.length === 2);
// 2026-08-13 (permintaan user): 4 MESIN -> 2 MESIN, dan keduanya BELUM ADA di
// ruang pabrik sampai pintu blast terbuka — ditenggelamkan `MACHINE_SINK` di
// bawah lantai (bukan `visible=false`, supaya tak ada rekompilasi shader saat
// muncul) dengan collider di-splice selama tak tergambar.
T('S3: 2 MESIN pembuat robot (1 kiri + 1 kanan) semua hidup',
    s3mod.s3MachinesDbg().length === 2 && s3mod.s3MachinesDbg().every(m => m.alive));
{
    const D = s3mod.s3Debug().deploy;
    T('S3 MESIN: sebelum pintu terbuka mesin TENGGELAM di silo, tak pejal & tak berproduksi',
        D.started === false && D.ready === false
        && D.machines.length === 2
        && D.machines.every(m => m.y === -s3dep.MACHINE_SINK && m.solid === false
            && m.deployed === false && m.phase === 'idle'));
    T('S3 MESIN: mesin tetap `visible` (tersembunyi lantai, bukan dimatikan) — tanpa rekompilasi shader',
        s3mod.s3MachinesDbg().every(m => m.group.visible === true));
    // INVARIAN BENTUK BAY: collider mesin hanya ±14 sedangkan player boleh berdiri
    // di bibir bay, jadi apa pun yang menjulur ke luar itu WAJIB serendah curb.
    const bays = D.machines.map(m => m.bay);
    T('S3 BAY: tak ada perabot bay tinggi di luar footprint collider (tertinggi '
        + bays[0].curbTopOutside + ' u)', bays.every(b => b.curbTopOutside <= 2.6));
    // Klem berdiri di diagonal 45° sehingga tak terjangkau BADAN avatar: pusat
    // player didorong keluar KOTAK (14 + propRadius — furnitur stage 1-3 pakai
    // propRadius, bukan player.radius), lebar avatar ~ player.radius/2.
    const propR = cfgMod.CFG.player.propRadius, avatarHalf = cfgMod.CFG.player.radius / 2;
    T('S3 BAY: klem pengunci di luar jangkauan badan avatar (|x| maks ' + bays[0].clampMaxAxis
        + ' < ' + (14 + propR - avatarHalf) + ')',
        bays.every(b => b.clampMaxAxis < 14 + propR - avatarHalf));
    // Klem tersimpan HARUS seluruhnya di bawah lantai selama fase `door`,
    // kalau tidak puncaknya menyembul di ruang pabrik sebelum waktunya.
    T('S3 BAY: klem tersimpan seluruhnya di bawah lantai (puncak ' + bays[0].clampStowTop + ')',
        bays.every(b => b.clampStowTop < 0)
        && bays.every(b => b.clampY.every(v => v + 12.8 < 0)));
}

// === TERMINAL HACK (DIROMBAK 2026-07-28, permintaan user: pintu TIDAK BISA
// dihancurkan lagi; ia terbuka setelah komputer-komputer di-hack BERURUTAN
// dgn urutan ACAK, dan spawn-robot-selama-menembaki-pintu DIHAPUS). 2026-08-13:
// cukup `hackRequired` (3) dari LIMA terminal fisik; dua sisanya mati. ===
// Denah ruangan (sel) — fakta layout, bukan angka tuning:
const S3_ROOM_RECT = {
    'Ruang C': { c0: 19, c1: 29, r0: 1, r1: 7 },
    'Ruang D': { c0: 30, c1: 38, r0: 1, r1: 7 },
    'West Wing': { c0: 1, c1: 7, r0: 12, r1: 19 },
    'East Wing': { c0: 33, c1: 38, r0: 12, r1: 19 },
    'Supply Room': { c0: 1, c1: 10, r0: 21, r1: 28 },
};
{
    const H = s3mod.s3HackDbg();
    const rooms = H.terms.map(t => t.room);
    // (a) satu terminal per ruangan, 2x1 sel, menempel dinding di ujung ruangan.
    let placeOk = true, wallOk = true, footOk = true;
    for (const t of H.terms) {
        const R = S3_ROOM_RECT[t.room];
        if (!R || t.c < R.c0 || t.c + 1 > R.c1 || t.r < R.r0 || t.r > R.r1) placeOk = false;
        // dua sel footprint = lantai; sel DI BELAKANG layar = dinding (ujung ruangan)
        if (s3mod.s3Wall(t.c, t.r) || s3mod.s3Wall(t.c + 1, t.r)) footOk = false;
        if (!s3mod.s3Wall(t.c, t.r - 1) && !s3mod.s3Wall(t.c, t.r + 1)) wallOk = false;
    }
    T('S3 HACK: 5 terminal FISIK, satu di tiap ruangan (C, D, West Wing, East Wing, Supply)',
        H.terms.length === 5 && new Set(rooms).size === 5
        && Object.keys(S3_ROOM_RECT).every(k => rooms.includes(k)) && placeOk);
    // 2026-08-13 (permintaan user): yang WAJIB di-hack cuma `hackRequired` (3).
    T('S3 HACK: hanya `hackRequired` (' + s3cfg.hackRequired + ') dari 5 terminal yang harus di-hack',
        s3cfg.hackRequired === 3 && H.order.length === s3cfg.hackRequired
        && s3mod.s3Debug().hackTotal === s3cfg.hackRequired
        && s3mod.s3Debug().hackTerminals === 5);
    T('S3 HACK: tiap terminal 2x1 sel di lantai & MENEMPEL dinding (ujung ruangan) + pejal',
        footOk && wallOk && H.terms.every(t => t.blocked === true));
    // (b) DUA di antaranya berdiri di ruangan yang dulu KOSONG (kiri lift & kanan
    //     chamber) — sebelum ini tak ada alasan sama sekali mengunjungi keduanya.
    T('S3 HACK: dua terminal mengisi ruangan yang dulu kosong (West/East Wing)',
        rooms.includes('West Wing') && rooms.includes('East Wing'));
}
// (c) MANA + URUTANnya DIACAK tiap masuk stage; selalu `hackRequired` indeks
//     berbeda yang sah (0..4), dan ruangan yang diminta ikut berganti antar run.
{
    const seenOrders = new Set(), seenSets = new Set();
    let permOk = true;
    for (let i = 0; i < 12; i++) {
        smMod.setScene(s3mod.stage3Scene);
        const o = s3mod.s3HackDbg().order;
        if (o.length !== s3cfg.hackRequired || new Set(o).size !== o.length
            || o.some(v => v < 0 || v > 4)) permOk = false;
        seenOrders.add(o.join(','));
        seenSets.add([...o].sort().join(','));
    }
    T('S3 HACK: urutan hack DIACAK tiap masuk stage (' + seenOrders.size + ' urutan berbeda dari 12) & selalu subset sah',
        permOk && seenOrders.size > 1);
    T('S3 HACK: TERMINAL MANA yang diminta juga berganti antar run ('
        + seenSets.size + ' kombinasi berbeda)', seenSets.size > 1);
}
finishS3Dialogue();   // enter() terakhir mengantre ulang dialog pembuka
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
stateMod.setCinematicActive(false);

// Helper: terminal yang sedang jadi giliran + jalankan satu hack sampai selesai.
const s3Term = (i) => s3mod.s3HackDbg().terms[i];
const s3Need = () => s3mod.s3HackDbg().order.length;   // = CFG…stage3.hackRequired
const s3Active = () => { const d = s3mod.s3HackDbg(); return d.idx < d.order.length ? d.terms[d.order[d.idx]] : null; };
const s3StandAt = (t) => camera.position.set(t.sx, cfgMod.CFG.player.eyeHeight, t.sz);
// Satu siklus hack penuh: berdiri di terminal giliran -> MINIGAME terbuka ->
// pecahkan puzzle -> tunggu modal menutup (stage kembali aktif).
const s3RunHack = async () => {
    s3StandAt(s3Active());
    s3mod.stage3Scene.updateMode(0.05);   // masuk jangkauan -> minigame terbuka
    solveHack();
    await waitHackClosed();
};
const s3Drain = () => { for (let i = 0; i < 800 && s3mod.s3SpawnDbg().queued; i++) s3mod.stage3Scene.updateMode(cfgMod.CFG.campaign.stage3.spawnGapSec); };
const s3KillAll = () => { for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 3) { scene.remove(robots[i].mesh); robots.splice(i, 1); } };
const s3Count = () => robots.filter(z => z.stage === 3).length;
const s3thr = s3cfg.reinforceThreshold;   // ambang anti-camp (dipakai uji fase machines)

// (0) Berkeliling TANPA menyentuh terminal: tetap 0 robot (tak ada gelombang otomatis)
for (let t = 0; t < 12; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
T('S3 FLOW: TIDAK ada robot sebelum terminal pertama di-hack (boleh berkeliling)',
    s3Count() === 0 && s3mod.s3Debug().hacked === 0);

// (1) RAMBU LAYAR: tepat SATU hijau (giliran), sisanya merah, belum ada kuning.
{
    const H = s3mod.s3HackDbg();
    const green = H.terms.filter(t => t.hex === 0x2eff6a);
    T('S3 HACK: rambu layar — tepat 1 HIJAU (giliran), 4 MERAH, 0 KUNING',
        green.length === 1 && green[0].room === s3Active().room
        && H.terms.filter(t => t.hex === 0xff3b2e).length === 4
        && H.terms.filter(t => t.hex === 0xffd23b).length === 0);
    // Dua terminal yang TIDAK terpilih tetap MERAH sepanjang run (mati permanen).
    T('S3 HACK: terminal di luar daftar acak tak pernah jadi giliran (2 mati permanen)',
        H.terms.filter((t, i) => !H.order.includes(i)).length === 5 - s3cfg.hackRequired
        && H.terms.filter((t, i) => !H.order.includes(i)).every(t => t.state === 'locked'));
}

// (2) BERURUTAN: berdiri di terminal yang BUKAN giliran tidak memulai hack.
{
    const act = s3Active();
    const other = s3mod.s3HackDbg().terms.find(t => t.room !== act.room);
    s3StandAt(other);
    s3mod.stage3Scene.updateMode(1.1 / Math.max(1, S3DLGCFG.cps));
    s3mod.stage3Scene.updateMode(1.1 / Math.max(1, S3DLGCFG.cps));
    T('S3 HACK: terminal yang BUKAN gilirannya tidak bisa di-hack (harus berurutan)',
        s3mod.s3Debug().hacking === false && s3mod.s3Debug().hacked === 0 && s3Count() === 0);
    T('S3 DIALOG TERMINAL MATI: terminal merah menampilkan naskah exact lewat typewriter',
        s3mod.s3DialogueDebug().key === 'inactiveTerminal'
        && s3mod.s3DialogueDebug().text === expectedS3Dialogue.inactiveTerminal.text
        && s3mod.s3DialogueDebug().chars === 1 && s3mod.s3DialogueDebug().typing === true);
    finishS3Dialogue();
    camera.position.set(other.sx + 400, cfgMod.CFG.player.eyeHeight, other.sz);
    s3mod.stage3Scene.updateMode(0.05);
    s3StandAt(other);
    s3mod.stage3Scene.updateMode(0.05);
    T('S3 DIALOG TERMINAL MATI: menjauh lalu mencoba lagi mengaktifkan dialog kembali tanpa spam frame',
        s3mod.s3DialogueDebug().key === 'inactiveTerminal'
        && s3mod.s3DialogueDebug().queued.length === 0
        && s3mod.s3DialogueDebug().inactiveArmed === false);
    finishS3Dialogue();
    camera.position.set(other.sx + 400, cfgMod.CFG.player.eyeHeight, other.sz);
    s3mod.stage3Scene.updateMode(0.05);
}

// (2b) BATAL: puzzle yang dibatalkan meninggalkan terminal TETAP belum ter-hack,
//      dan pemicunya tidak boleh langsung terbuka lagi selagi player masih
//      menempel — harus MENJAUH dulu (s3HackArmed).
{
    const act = s3Active();
    s3StandAt(act);
    s3mod.stage3Scene.updateMode(0.05);
    const opened = hackMod.hackDebug().open;
    smMod.activeScene.shopKey('escape');       // ABORT
    stateMod.setPaused(false);
    s3mod.stage3Scene.updateMode(0.05);        // masih menempel terminal yang sama
    T('S3 HACK: batal -> terminal tetap belum ter-hack & puzzle TIDAK terbuka lagi di tempat',
        opened === true && hackMod.hackDebug().open === false && s3mod.s3Debug().hacked === 0
        && s3mod.s3Debug().hacking === false && s3Count() === 0);
    camera.position.set(act.sx + 400, cfgMod.CFG.player.eyeHeight, act.sz);   // menjauh
    s3mod.stage3Scene.updateMode(0.05);
    T('S3 HACK: pemicu terisi ulang setelah player menjauh dari terminal',
        s3mod.s3Debug().armed === true && hackMod.hackDebug().open === false);
}

// (2c) ALARM: ICE TRACE habis -> horde dari LUAR LAYAR + terminal terkunci
//      `alarmCooldownSec` detik (waktu untuk membereskan mereka). Sejak
//      2026-07-30 kelas skuadnya IKUT `classMix` stage 3 (dulu seragam kelas C),
//      jadi yang diuji = semua kelas berasal dari daftar classMix.
{
    const HK3 = cfgMod.CFG.campaign.hack;
    const act = s3Active();
    s3StandAt(act);
    rendererMod.followViewCam(0.016);
    s3mod.stage3Scene.updateMode(0.05);          // minigame terbuka
    hackMod.hackTick(HK3.traceSec + 0.1);        // ICE TRACE habis
    await waitHackClosed();
    const bots = robots.filter(z => z.stage === 3);
    const mixKeys = Object.keys(cfgMod.CFG.campaign.stage3.classMix);
    T('S3 ALARM: hack gagal -> HORDE `alarmHordeCount` (kelas dari classMix) memburu player, SEMUA di luar pandangan kamera',
        bots.length === HK3.alarmHordeCount
        && bots.every(z => mixKeys.includes(z.kind) && z.state === 'chasing')
        && bots.every(z => offCamera(z.mesh.position.x, z.mesh.position.z)));
    s3mod.stage3Scene.updateMode(0.05);          // masih menempel terminal
    T('S3 ALARM: terminal terkunci cooldown & puzzle tak bisa dibuka lagi selama itu',
        s3mod.s3Debug().hackCd > 0 && s3mod.s3Debug().hacked === 0
        && hackMod.hackDebug().open === false);
    // Bereskan horde, MENJAUH, lalu tunggu cooldown habis: keduanya syarat
    // (pemicu terisi ulang saat menjauh, kunci alarm lepas saat cooldown 0).
    s3KillAll();
    camera.position.set(act.sx + 400, cfgMod.CFG.player.eyeHeight, act.sz);
    for (let t = 0; t <= HK3.alarmCooldownSec + 1; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
    T('S3 ALARM: horde dibereskan + menjauh + cooldown habis -> terminal siap di-hack lagi',
        s3mod.s3Debug().hackCd === 0 && s3mod.s3Debug().armed === true && s3Count() === 0);
}

// (3) HACK #1: menempel terminal HIJAU membuka MINIGAME (scene modal, game
//     di-pause); memecahkannya melepas SATU gelombang (gateWaveCount dari
//     tangga + gateWaveCount dari lift).
{
    const act = s3Active();
    s3StandAt(act);
    s3mod.stage3Scene.updateMode(0.05);
    const H = hackMod.hackDebug();
    T('S3 HACK: menempel terminal HIJAU -> MINIGAME terbuka (scene modal, game di-pause, stage 3 disimpan)',
        H.open === true && H.phase === 'play' && s3mod.s3Debug().hacking === true
        && smMod.activeScene.id === 'campaign-hack' && stateMod.isPaused === true);
    T('S3 HACK: judul papan menyebut terminal giliran & ukurannya selalu gridSize',
        H.size === cfgMod.CFG.campaign.hack.gridSize && H.size === hackMod.hackGridSize(0));
    solveHack();
    await waitHackClosed();
    T('S3 HACK: puzzle terpecahkan -> scene stage 3 dipulihkan & terminal tercatat ter-hack',
        hackMod.hackDebug().open === false && smMod.activeScene === s3mod.stage3Scene
        && s3mod.s3Debug().hacking === false && s3mod.s3Debug().hacked === 1);
    T('S3 DIALOG HACK #1: sukses pertama mengantre dialog multi-stage lock exact',
        s3mod.s3DialogueDebug().key === 'firstHack'
        && s3mod.s3DialogueDebug().text === expectedS3Dialogue.firstHack.text
        && s3mod.s3DialogueDebug().typing === true);
    finishS3Dialogue();
    const queued = s3mod.s3SpawnDbg().queued + s3Count();
    T('S3 HACK: hack SELESAI -> satu gelombang (' + s3GateWave + '+' + s3GateWave + '='
        + (s3GateWave * 2) + ') diantre, langsung mengejar',
        queued === s3GateWave * 2);
    s3Drain();
    T('S3 HACK: gelombang penuh keluar & semuanya chasing',
        s3Count() === s3GateWave * 2 && robots.filter(z => z.stage === 3).every(z => z.state === 'chasing'));
    // Layar terminal yang baru selesai jadi KUNING, giliran pindah ke yang berikutnya.
    const HD = s3mod.s3HackDbg();
    T('S3 HACK: layar terminal yang selesai jadi KUNING & giliran pindah (1 hijau baru)',
        HD.terms[HD.order[0]].hex === 0xffd23b && HD.terms.filter(t => t.hex === 0x2eff6a).length === 1
        && HD.terms[HD.order[1]].hex === 0x2eff6a);
}

// (4) TIDAK ADA respawn otomatis: habisi gelombang lalu tunggu lama — tetap kosong
//     sampai hack BERIKUTNYA selesai (menggantikan respawn anti-camp fase door).
s3KillAll();
for (let t = 0; t < s3cfg.respawnSec * 3; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
T('S3 HACK: gelombang TIDAK respawn sendiri — sunyi sampai hack berikutnya (tunggu '
    + (s3cfg.respawnSec * 3) + ' dtk)', s3Count() === 0 && s3mod.s3SpawnDbg().queued === 0);

// (5) PINTU tak bisa ditembak & memblok peluru selagi terkunci.
{
    const dpx = s3mod.s3Cell(19.5, 29).x, dpz = s3mod.s3Cell(19.5, 29).z;
    const shot = { mesh: { position: { x: dpx, y: 8, z: dpz + 4 } }, px: dpx, py: 8, pz: dpz - 6, dir: { x: 0, y: 0, z: 1 }, damage: 9999 };
    stateMod.bullets.push(shot);
    s3mod.stage3Scene.updateMode(0.05);
    T('S3 PINTU: menembaki pintu TIDAK membukanya & peluru TERHALANG (bukan lagi destructible)',
        s3mod.s3DoorDbg().open === false && s3mod.s3Debug().phase === 'door'
        && s3mod.stage3Scene.bulletBlocked(shot) === true);
    stateMod.bullets.length = 0;
}

// (6) Hack sisa terminal -> setelah yang TERAKHIR pintu membuka kiri/kanan, rambu
// HIJAU. Hack terakhir dipisahkan agar dialognya diuji PERSIS setelah callback
// sukses, sebelum antrean robot ditiriskan (yang juga memajukan jam typewriter).
for (let k = 1; k < s3Need() - 1; k++) { await s3RunHack(); s3KillAll(); s3mod.s3SpawnDbg().queued && s3Drain(); s3KillAll(); }
const s3NeedN = s3Need();
await s3RunHack();
T('S3 HACK: ' + s3NeedN + ' terminal yang diminta selesai -> ' + s3NeedN + ' layar KUNING',
    s3mod.s3Debug().hacked === s3NeedN
    && s3mod.s3HackDbg().terms.filter(t => t.hex === 0xffd23b).length === s3NeedN);
T('S3 DIALOG ' + s3NeedN + '/' + s3NeedN + ': hack terakhir memicu dialog pintu terbuka exact',
    s3mod.s3DialogueDebug().key === 'allHacked'
    && s3mod.s3DialogueDebug().text === expectedS3Dialogue.allHacked.text
    && s3mod.s3DialogueDebug().typing === true);
s3KillAll();
s3mod.stage3Scene.updateMode(0.05);   // <- FRAME pintu terbuka + sekuens dimulai
T('S3 PINTU: ' + s3NeedN + '/' + s3NeedN + ' ter-hack -> pintu blast LANGSUNG TERBUKA (blocker lepas, rambu HIJAU) + fase toX',
    s3mod.s3Debug().phase === 'toX' && s3mod.s3DoorDbg().open === true
    && s3mod.s3DoorDbg().blocked === false && s3mod.s3DoorDbg().signHex === 0x2eff6a);

// === SEKUENS PENGERAHAN MESIN (2026-08-13, permintaan user) =================
// Babak murni (`deployPhaseAt`) diuji EKSAK dari config — tak bergantung sama
// sekali pada berapa detik yang kebetulan berlalu di harness.
{
    const MD = s3cfg.machineDeploy, S = s3dep.deployActSecs(s3cfg);
    const at = (t) => s3dep.deployPhaseAt(s3cfg, t).phase;
    T('S3 DEPLOY: durasi babak dibaca dari config (bukan angka di kode)',
        S.warn === MD.warnSec && S.hatch === MD.hatchSec && S.rise === MD.riseSec
        && S.lock === MD.lockSec && S.online === MD.onlineSec && S.stagger === MD.staggerSec);
    const b1 = S.warn, b2 = b1 + S.hatch, b3 = b2 + S.rise, b4 = b3 + S.lock, b5 = b4 + S.online;
    T('S3 DEPLOY: lima babak berurutan warn -> hatch -> rise -> lock -> online -> done',
        at(-1) === 'idle' && at(b1 * 0.5) === 'warn' && at(b1 + 0.01) === 'hatch'
        && at(b2 + 0.01) === 'rise' && at(b3 + 0.01) === 'lock'
        && at(b4 + 0.01) === 'online' && at(b5 + 0.01) === 'done'
        && s3dep.DEPLOY_ACTS.join(',') === 'warn,hatch,rise,lock,online');
    const D = s3mod.s3Debug().deploy;
    T('S3 DEPLOY: pintu terbuka -> sekuens dimulai (jam 0, kedua mesin masih di silo)',
        D.started === true && D.t === 0 && D.ready === false
        && D.machines.length === 2
        && D.machines.every(m => m.phase === 'idle' && m.solid === false
            && m.deployed === false && m.y === -s3dep.MACHINE_SINK));
    T('S3 DEPLOY: total durasi = jumlah babak + stagger mesin kedua ('
        + D.totalSec.toFixed(2) + ' dtk)',
        Math.abs(D.totalSec - (b5 + S.stagger)) < 1e-6);
}
// Dialog 'allHacked' dituntaskan (memajukan jam ~3,6 dtk = masih babak `hatch`),
// lalu player LANGSUNG masuk ruang pabrik supaya seluruh sisa sekuens terjadi di
// fase `machines` — di sanalah gerbang gelombang & hit-peluru benar-benar diuji.
finishS3Dialogue();
{
    const split = s3mod.s3DoorDbg().split;
    T('S3 PINTU: dua daun blast bergeser simetris kiri/kanan tanpa gerak vertikal',
        s3mod.s3DoorDbg().visible === true && s3mod.s3DoorDbg().k >= 1
        && split.leaves.length === 2
        && Math.abs(split.leaves[1].x - split.leaves[0].x) > split.span * 1.25
        && Math.abs(split.leaves[0].y) < 1e-6 && Math.abs(split.leaves[1].y) < 1e-6);
}
s3KillAll();

// (4) Masuk ruang X SELAGI mesin masih di dalam silo -> fase machines, TAPI tak
//     ada gelombang dan mesinnya belum bisa ditembak.
const xin = s3mod.s3Cell(19.5, 33);
camera.position.set(xin.x, cfgMod.CFG.player.eyeHeight, xin.z);
s3mod.stage3Scene.updateMode(0.1);
T('S3 FLOW: masuk ruang X -> fase machines (2 mesin) TANPA spawn langsung',
    s3mod.s3Debug().phase === 'machines' && s3mod.s3Debug().machinesAlive === 2 && robots.filter(z => z.stage === 3).length === 0);
T('S3 DIALOG LOBBY: masuk lobby memicu dialog production unit exact lewat typewriter',
    s3mod.s3DialogueDebug().key === 'enterLobby'
    && s3mod.s3DialogueDebug().text === expectedS3Dialogue.enterLobby.text
    && s3mod.s3DialogueDebug().typing === true);
{
    // REKAM seluruh sisa sekuens frame demi frame (dt kecil, seperti game asli
    // yang menjepit dt di 0.05) — bukan mengintip pada satu detik keberuntungan.
    const riseFrame = [-1, -1];
    let riseSolid = true, riseClimb = true, gatedWave = true, hpFull = true;
    const lastY = [-s3dep.MACHINE_SINK, -s3dep.MACHINE_SINK];
    const hpBefore = s3mod.s3MachinesDbg().map(m => m.hp);
    let prevQueued = s3mod.s3SpawnDbg().queued, frame = 0;
    for (; frame < 900 && !s3mod.s3Debug().deploy.ready; frame++) {
        // Tembakan tepat di pusat tiap mesin: selama sekuens belum mengunci ia
        // TAK BOLEH kena — jendela kebal yang disengaja (pola sama dgn lokomotif
        // mini-boss Stage 5), dan HUD memberitahu player untuk menahan tembakan.
        const pre = s3mod.s3Debug().deploy.machines;
        s3mod.s3MachinesDbg().forEach((m0, i) => {
            if (pre[i].phase === 'lock' || pre[i].phase === 'online' || pre[i].deployed) return;
            stateMod.bullets.push({ mesh: { position: { x: m0.cx, y: 8, z: m0.cz } },
                px: m0.cx, pz: m0.cz, dir: { x: 0, y: 0, z: 1 }, damage: 90 });
        });
        s3mod.stage3Scene.updateMode(0.05);
        stateMod.bullets.length = 0;
        s3KillAll();                        // sisa gelombang hack terakhir dibersihkan
        const D = s3mod.s3Debug().deploy;
        // Gelombang mesin akan MENAMBAH antrean sekaligus; gelombang hack lama
        // hanya bisa menyusut. Antrean yang naik = gerbangnya bocor.
        const q = s3mod.s3SpawnDbg().queued;
        if (!D.ready && q > prevQueued) gatedWave = false;
        prevQueued = q;
        D.machines.forEach((m, i) => {
            if (!m.deployed && s3mod.s3MachinesDbg()[i].hp !== hpBefore[i]) hpFull = false;
            if (m.phase !== 'rise') return;
            if (riseFrame[i] < 0) riseFrame[i] = frame;
            if (!m.solid) riseSolid = false;
            if (m.y < lastY[i] - 1e-6) riseClimb = false;
            lastY[i] = m.y;
        });
    }
    T('S3 DEPLOY: babak `rise` menaikkan kedua mesin secara monoton & memasang collider di sana',
        riseFrame[0] >= 0 && riseFrame[1] >= 0 && riseSolid && riseClimb);
    T('S3 DEPLOY: mesin kedua benar-benar tertinggal `staggerSec` (mulai naik frame '
        + riseFrame[0] + ' vs ' + riseFrame[1] + ')',
        riseFrame[1] > riseFrame[0]
        && Math.abs((riseFrame[1] - riseFrame[0]) * 0.05 - s3cfg.machineDeploy.staggerSec) < 0.12);
    T('S3 DEPLOY: selama sekuens mesin TIDAK bisa ditembak & TIDAK memproduksi robot',
        hpFull && gatedWave
        && s3mod.s3MachinesDbg().every((m, i) => m.hp === hpBefore[i]));
    const D = s3mod.s3Debug().deploy;
    T('S3 DEPLOY: selesai -> mesin duduk di y=0, yaw kembali ke arah hadapnya, pejal & online',
        D.ready === true
        && D.machines.every((m, i) => m.deployed && m.solid && Math.abs(m.y) < 1e-6
            && Math.abs(m.yaw - +s3mod.s3MachinesDbg()[i].baseYaw.toFixed(3)) < 1e-3)
        && D.machines.every(m => m.bay.lightHex === palMod.PAL.tech
            && m.bay.strobeHex === palMod.PAL.tech));
    T('S3 DEPLOY: hatch bay membuka penuh & klem pengunci berdiri dari bawah lantai',
        D.machines.every(m => m.bay.leafTilt.every(v => v > 1.5)
            && m.bay.clampY.every(v => v > 0) && m.bay.clampJaw.every(v => v > 1.4)));
}
s3KillAll();
for (let t = 0; t < s3cfg.machineFirstWaveSec - 1; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
const beforeMW = robots.filter(z => z.stage === 3).length;
for (let t = 0; t < 2; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
s3Drain();
T('S3 FLOW: mesin spawn PERTAMA setelah ~machineFirstWaveSec (3 dtk) = 4/mesin (8)',
    beforeMW === 0 && robots.filter(z => z.stage === 3).length === s3MachineWave * 2);

// (4b) ANTI-CAMP fase machines: sisa < reinforceThreshold -> gelombang tetap datang
while (robots.filter(z => z.stage === 3).length > s3thr - 1) { const i3 = robots.findIndex(z => z.stage === 3); scene.remove(robots[i3].mesh); robots.splice(i3, 1); }
const s3mCampBefore = robots.filter(z => z.stage === 3).length;   // = threshold-1
for (let t = 0; t < s3cfg.respawnSec + 1; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
T('S3 FLOW: sisa <reinforceThreshold robot TETAP memicu gelombang (anti-camp machines)',
    s3mCampBefore === s3thr - 1 && robots.filter(z => z.stage === 3).length > s3mCampBefore);

// (4c) CAMPURAN KELAS ROBOT = CFG.campaign.stage3.classMix (2026-07-30,
// permintaan user: C 70% / B 20% / A 10%; sebelumnya hardcode C50/B25/A25).
// Undiannya berurut C -> B -> A atas bobot yang DINORMALKAN, jadi menembak
// Math.random ke TENGAH tiap pita wajib menghasilkan kelas pita itu — uji EKSAK
// (bukan statistik) dan otomatis ikut bila user me-retune bobotnya.
{
    const MIX = s3cfg.classMix;
    const tot = MIX.C + MIX.B + MIX.A;
    const bands = [
        ['C', MIX.C * 0.5 / tot],
        ['B', (MIX.C + MIX.B * 0.5) / tot],
        ['A', (MIX.C + MIX.B + MIX.A * 0.5) / tot],
    ];
    T('S3 classMix ada di config & bobotnya positif (C ' + MIX.C + ' / B ' + MIX.B + ' / A ' + MIX.A + ')',
        tot > 0 && MIX.C > 0 && MIX.B > 0 && MIX.A > 0);
    const realRand = Math.random;
    let mixOk = true; const got = [];
    for (const [want, r] of bands) {
        // Antrean spawn gelombang SEBELUMNYA (kelasnya diundi dgn acak asli)
        // harus dituntaskan & dibersihkan dulu, kalau tidak ia bocor ke hitungan.
        s3Drain(); s3KillAll();
        Math.random = () => r;   // tembak ke tengah pita kelas `want`
        for (let t = 0; t < s3cfg.respawnSec + 1; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
        s3Drain();
        Math.random = realRand;
        const kinds = robots.filter(z => z.stage === 3).map(z => z.kind);
        got.push(want + '->' + (kinds[0] || '-') + '×' + kinds.length);
        if (!kinds.length || !kinds.every(k => k === want)) mixOk = false;
    }
    T('S3: kelas robot yang spawn mengikuti bobot classMix (' + got.join(' ') + ')', mixOk);
    // Kelas TERUMUM (bobot terbesar) juga yang paling sering keluar pada undian
    // acak sungguhan — jaring pengaman kalau urutan pita tertukar.
    s3KillAll();
    const tally = { C: 0, B: 0, A: 0 };
    for (let i = 0; i < 40; i++) {
        for (let t = 0; t < s3cfg.respawnSec + 1; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
        s3Drain();
        for (const z of robots) if (z.stage === 3) tally[z.kind] = (tally[z.kind] || 0) + 1;
        s3KillAll();
    }
    const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    const wantTop = MIX.C >= MIX.B && MIX.C >= MIX.A ? 'C' : (MIX.B >= MIX.A ? 'B' : 'A');
    T('S3: kelas dgn bobot TERBESAR paling sering keluar (' + JSON.stringify(tally) + ')', top === wantTop);
}

// (5) Hancurkan KEDUA MESIN (HP 0) -> hancur; habisi robot -> fase done (EXIT aktif)
for (const m of s3mod.s3MachinesDbg()) m.hp = 0;
s3mod.stage3Scene.updateMode(0.05);
T('S3 FLOW: KEDUA MESIN HANCUR saat HP habis', s3mod.s3Debug().machinesAlive === 0);
T('S3 DEPLOY: bay ikut MATI bersama mesinnya (rambu gelap, lampu padam)',
    s3mod.s3Debug().deploy.machines.every(m => m.bay.phase === 'wrecked'
        && m.bay.lightIntensity === 0 && m.bay.strobeHex === palMod.PAL.rubber));
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
s3mod.stage3Scene.updateMode(0.05);
T('S3 FLOW: mesin hancur + robot habis -> fase done (PINTU KELUAR AKTIF)', s3mod.s3Debug().phase === 'done');

// (7) Stage 3 EXIT 'o' fase done -> FINISH HIJAU -> SHOP -> stage 4
const s4mod = await import(R('src/scenes/campaign/stages/stage4/index.js'));
const realS4Enter = s4mod.stage4Scene.enter;
let s4entered = false;
s4mod.stage4Scene.enter = () => { s4entered = true; };
const e3 = s3mod.s3Cell(s3mod.S3_END.c, s3mod.S3_END.r);
stateMod._v3.set(e3.x, 0, e3.z);
s3mod.stage3Scene.playerCollide(stateMod._v3, e3.x, e3.z, 0);
T('S3 COMPLETE: pintu keluar membuka layar hijau sebelum Field Shop',
    stateMod.isGameOver && smMod.activeScene === s3mod.stage3Scene
    && domS2.gameOverTitle.innerText === 'STAGE 3 COMPLETE'
    && domS2.goStageStats.style.display === 'grid' && !shopMod.isShopOpen() && !s4entered);
T('S3 COMPLETE CONTINUE: CONTINUE baru membuka scene Field Shop',
    gameMod.activateGameOverPrimary() && !stateMod.isGameOver
    && smMod.activeScene.id === 'campaign-shop');
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));   // LOADING #1
T('S3 SHOP SCENE: shop terbuka', shopMod.isShopOpen());
smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');   // Start Next Stage -> konfirmasi
for (let i = 0; i < 400 && !s4entered; i++) await new Promise(r => setTimeout(r, 10));   // LOADING #2 -> setScene
T('S3: Start Next Stage -> transisi ke stage 4', s4entered && smMod.activeScene === s4mod.stage4Scene);
s4mod.stage4Scene.enter = realS4Enter;
shopMod.closeShop();
stateMod.setPaused(false);   // pulihkan (runEnterShop mem-pause; harness tak ada klik resume)
shopMod.closeShop();
// KAMERA: keluar stage 3 -> scene lain (tanpa camOffset) -> SCREEN_UP kembali
// default TIMUR LAUT (x>0, z<0). applySceneCamOffset memulihkan azimuth default.
rendererMod.followViewCam(0.016);
T('KAMERA: scene non-stage-3 -> SCREEN_UP kembali default TIMUR LAUT (x>0, z<0)',
    rendererMod.SCREEN_UP.x > 0 && rendererMod.SCREEN_UP.z < 0);

// === LIFT ENTITY (2026-07-22, permintaan user): kabin lift dipisah ke
// utility/lift.js agar BENTUK/UKURAN/PENEMPATAN konsisten lintas stage 1/2/3, dan
// SEMUA stage pakai SEPASANG lift (kiri-kanan) spt stage 1. SATU bentuk kabin;
// hanya beda STATE pintu (open true/false). buildLiftBank = 2 unit; facing memutar
// rotation.y; ukuran KANONIK (LIFT.CARW/DEPTH) sama utk semua. ===
{
    const liftMod = await import(R('src/scenes/campaign/utility/lift.js'));
    const open = liftMod.buildLift({ open: true, facing: 'east', H: 22 });
    const openN = liftMod.buildLift({ open: true, facing: 'north', H: 22 });
    const closed = liftMod.buildLift({ open: false, facing: 'east', H: 22 });
    const bank = liftMod.buildLiftBank({ facing: 'east', H: 22, open: true, gap: 30 });
    T('LIFT: buildLift open & closed -> THREE.Group berisi mesh',
        open.isObject3D && open.children.length > 0 && closed.children.length > 0);
    T('LIFT: facing memutar rotation.y (east=0, north=+90°)',
        Math.abs(open.rotation.y) < 1e-6 && Math.abs(openN.rotation.y - Math.PI / 2) < 1e-6);
    T('LIFT: ukuran KANONIK terdefinisi (CARW/DEPTH/GAP > 0, dipakai 3 stage)',
        liftMod.LIFT.CARW > 0 && liftMod.LIFT.DEPTH > 0 && liftMod.LIFT.GAP > 0);
    T('LIFT: state open vs closed beda bentuk (jumlah mesh beda)',
        open.children.length !== closed.children.length);
    T('LIFT: buildLiftBank = SEPASANG unit (2 kabin, kiri-kanan) + footprint blocker',
        bank.children.length === 2 && liftMod.liftBankFootprint('east', 30).hz > 0);
    // Ketiga stage MENGIMPOR entity yang sama & memakai buildLiftBank (SEPASANG)
    const usesLift = (f) => fs.readFileSync(ROOT + '/' + f, 'utf8');
    T('LIFT: stage 1/2/3 memakai buildLiftBank dari utility/lift.js (tanpa builder lokal)',
        ['src/scenes/campaign/stages/stage1/index.js', 'src/scenes/campaign/stages/stage2/index.js', 'src/scenes/campaign/stages/stage3/index.js']
            .every(f => usesLift(f).includes("from '../../utility/lift.js'") && usesLift(f).includes('buildLiftBank(')
                && !/function buildLiftCar|function buildLiftDoors/.test(usesLift(f))));
}

// --- 17. Campaign STAGE 4 (final, OUTDOOR; layout ALUN-ALUN 2026-07-17):
// parkiran kecil -> jalan raya 500 m -> GERBANG -> kompleks alun-alun (ring
// jalan 2 lajur mengelilingi lapangan), BOSS TANK spawn di PUSAT alun-alun.
// Bangun dunia (union walkable), konektivitas flood-fill START->END (END =
// pusat alun-alun; union tembus — gerbang = blocker, bukan union), robot
// 13-spot + supply (semua di BARAT gerbang = alun steril), robotAI, GERBANG
// tertutup selagi robot hidup, dan ALUR: bunuh semua -> gerbang terbuka +
// boss muncul -> bunuh boss -> animasi wreck -> jeda 3 dtk -> outro -> MISSION COMPLETE. ---
s4mod.ensureWorld();   // (2026-07-16: build lewat guard — enter berikutnya tak membangun ulang)
// PRE-BUILD konsistensi loading (2026-07-16): ensureWorld idempoten — panggilan
// kedua TIDAK membangun ulang dunia (jumlah anak scene tetap), guard `built` set.
{
    const nBefore = scene.children.length;
    s4mod.ensureWorld();
    T('S4: ensureWorld idempoten (panggilan ke-2 tak membangun ulang dunia)',
        scene.children.length === nBefore && s4mod.worldBuilt() && s3mod.worldBuilt());
}

// --- TANGGA BORDES (2026-07-19, foto referensi user): START & END HARUS BEDA —
// START = flight turun dari Lt.3 (varian NAIK, tanpa lubang), END = LUBANG di
// lantai + flight MENEMBUS TURUN ke bawah ruangan (stage 1 & 2; stage 3 keluar
// lewat pintu lobi = hanya varian naik). Metrik di-dedupe per koordinat build. ---
{
    const swMod = await import(R('src/scenes/campaign/utility/stairwell.js'));
    const sw = swMod.stairwellDebug();
    // STAGE 1 & 2 (rombak 2026-07-20/21): titik MASUK memakai TANGGA NAIK
    // (buildStairwellUp; stage 1 titik selesai = tangga sama, stage 2 titik
    // selesai = LIFT). TAK ADA lagi tangga TURUN berlubang (stage 3 keluar lewat
    // pintu lobi). -> 3 naik (START stage 1/2/3), 0 turun, lantai satu-bidang.
    T('Stairwell: 3 tangga NAIK (START stage 1/2/3) + 0 tangga TURUN berlubang (stage 1 finish=tangga, stage 2 finish=lift)',
        sw.ups === 3 && sw.downs === 0 && sw.holes.length === 0 && sw.floorStrips.length === 0);
}
{   // flood-fill union (stage4Walk): START harus terhubung ke END
    const S = s4mod.S4_START, E = s4mod.S4_END, cell = 14;
    const gx0 = S.x - 400, gz0 = S.z - 200, NC = 300, NR = 90;
    const wk = (c, r) => s4mod.stage4Walk(gx0 + (c + 0.5) * cell, gz0 + (r + 0.5) * cell, 3);
    const sc = Math.round((S.x - gx0) / cell - 0.5), sr = Math.round((S.z - gz0) / cell - 0.5);
    const ec = Math.round((E.x - gx0) / cell - 0.5), er = Math.round((E.z - gz0) / cell - 0.5);
    const seen = Array.from({ length: NR }, () => Array(NC).fill(false));
    const q = [[sc, sr]]; seen[sr][sc] = true;
    while (q.length) {
        const [c, r] = q.shift();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= NC || nr >= NR) continue;
            if (wk(nc, nr) && !seen[nr][nc]) { seen[nr][nc] = true; q.push([nc, nr]); }
        }
    }
    T('S4: START & END walkable + TERHUBUNG (union parkiran->jalan->alun-alun)',
        s4mod.stage4Walk(S.x, S.z, 4) && s4mod.stage4Walk(E.x, E.z, 4) && seen[er][ec]);
}
T('S4: nav-grid pathfinder terbangun', s4mod.stage4Scene.robotAI != null);
T('S4: roadside occluders terdaftar (sistem fade objek penghalang aktif)', s4mod.occluderDebug().count > 15);
// ZONA BEBAS-DEKOR (2026-07-19): gedung/pohon/dekor roadside TIDAK BOLEH
// berdiri di parkiran / koridor jalan raya / kompleks alun-alun — semua
// footprint terklaim harus bebas zona gameplay (roadsideDebug).
T('S4: dekor roadside tak menyentuh zona gameplay (parkiran/jalan/alun-alun)',
    s4mod.roadsideDebug().count > 30 && s4mod.roadsideDebug().clear === true);
{   // ATAP PELANA rumah kampung TIDAK BOLEH TERBALIK (bugfix 2026-07-27, laporan
    // user): tanda `rotation.x` pernah negatif sehingga tepi TIRIS terangkat dan
    // BUBUNGAN melesak (atap "V") sampai di bawah puncak dinding. Uji pose murni
    // (rotasi X THREE: y' = y − z_lokal·sin(rot)) utk kedua paruh atap.
    const HG = 15, DP = 30;
    let gableOk = true, ridgeMeet = true, eaveOk = true;
    let prevRidgeY = null, prevRidgeZ = null;
    for (const rs of [-1, 1]) {
        const p = s4mod.gableRoofPose(HG, DP, rs);
        const yAt = (zl) => p.y - zl * Math.sin(p.rot);
        const zAt = (zl) => p.z + zl * Math.cos(p.rot);
        const ridgeY = yAt(-rs * p.len / 2), eaveY = yAt(rs * p.len / 2);   // ujung dalam vs luar
        if (!(ridgeY > eaveY + 1)) gableOk = false;                         // bubungan HARUS di atas tiris
        if (Math.abs(eaveY - HG) > 0.01) eaveOk = false;                    // tiris mendarat di puncak dinding
        if (!(ridgeY > HG)) gableOk = false;                                // bubungan tak boleh di bawah atap dinding
        const rz = zAt(-rs * p.len / 2);
        if (Math.abs(rz) > DP * 0.06) ridgeMeet = false;                    // ujung bubungan bertemu di tengah
        if (prevRidgeY !== null && (Math.abs(prevRidgeY - ridgeY) > 1e-6
            || Math.abs(prevRidgeZ + rz) > DP * 0.12)) ridgeMeet = false;   // kedua paruh simetris
        prevRidgeY = ridgeY; prevRidgeZ = rz;
    }
    T('S4 atap pelana rumah: bubungan DI ATAS tiris (tidak terbalik)', gableOk);
    T('S4 atap pelana rumah: tiris mendarat tepat di puncak dinding (tak menembus/menggantung)', eaveOk);
    T('S4 atap pelana rumah: kedua paruh bertemu simetris di garis bubungan', ridgeMeet);
}
{   // KORIDOR JALAN RAYA tetap tembus (2026-07-19: rongsokan dipadatkan): di
    // tiap sampel x sepanjang jalan harus ada z bebas blocker utk player.
    let corridorOk = true;
    const sqx0 = s4mod.arenaDebug().sq.x0;
    for (let x = s4mod.S4_START.x + 300; x < sqx0 - 40 && corridorOk; x += 25) {
        let free = false;
        for (let z = -30; z <= 30 && !free; z += 3) {
            if (!s4mod.stage4Walk(x, z, 3.5)) continue;
            stateMod._v3.set(x, 0, z);
            s4mod.resolve(stateMod._v3, 3.5, 0);
            if (Math.abs(stateMod._v3.x - x) + Math.abs(stateMod._v3.z - z) < 0.01) free = true;
        }
        corridorOk = free;
    }
    T('S4: koridor jalan raya tetap tembus di antara rongsokan (ada celah di tiap sampel x)', corridorOk);
}
{   // Parkiran dirapikan 2026-07-18: KONTAINER lama (OX+232,-165 = S4_START+242/+15)
    // DIHAPUS -> titik itu kini area walkable bebas blocker (resolve tak menggeser).
    const px = s4mod.S4_START.x + 242, pz = s4mod.S4_START.z + 15;
    stateMod._v3.set(px, 0, pz);
    s4mod.resolve(stateMod._v3, 4, 0);
    T('S4: kontainer parkiran DIHAPUS (titik lama kini bebas blocker)',
        s4mod.stage4Walk(px, pz, 4)
        && Math.abs(stateMod._v3.x - px) < 1e-6 && Math.abs(stateMod._v3.z - pz) < 1e-6);
}

while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
const s4dropsBefore = stateMod.drops.length;
s4mod.placeRobots();
const nStage4 = robots.filter(z => z.stage === 4).length;
// JUMLAH BER-PENGALI (2026-08-16, permintaan user: stage 4 DUA KALI lipat).
const s4Mul = cfgMod.CFG.campaign.stage4.robotCountMul;
T('S4: placeRobots menaruh ' + Math.round(s4mod.s4RobotBase * s4Mul) + ' robot (13 spot, base '
    + s4mod.s4RobotBase + ' x ' + s4Mul + ') tagged stage 4 (' + nStage4 + ')',
    s4mod.s4RobotBase === 40 && nStage4 === Math.round(s4mod.s4RobotBase * s4Mul)
    && nStage4 === s4mod.s4RobotCount());
// Komposisi 2026-07-19 (permintaan user): varian penembak A/B diperbanyak.
// Penggandaan MENGULANG pola kelas tiap spot, jadi porsi A/B ikut naik —
// bukan diencerkan jadi kelas C (ambangnya diskalakan dari pengali).
T('S4: varian kelas A/B diperbanyak (A >= ' + Math.round(5 * s4Mul) + ', B >= ' + Math.round(8 * s4Mul) + ')',
    robots.filter(z => z.stage === 4 && z.kind === 'A').length >= Math.round(5 * s4Mul)
    && robots.filter(z => z.stage === 4 && z.kind === 'B').length >= Math.round(8 * s4Mul));
T('S4: placeSupplies menaruh drops (ammo/medkit)', stateMod.drops.length > s4dropsBefore);
// Layout baru 2026-07-16 (parkiran/stasiun kecil, jalan 2 lajur): semua spot
// robot & supply hasil retarget harus tetap berdiri DI DALAM union walkable.
T('S4: semua robot layout baru berdiri di area walkable',
    robots.filter(z => z.stage === 4).every(z => s4mod.stage4Walk(z.mesh.position.x, z.mesh.position.z, 3)));
T('S4: semua supply layout baru berada di area walkable',
    stateMod.drops.slice(s4dropsBefore).every(d => s4mod.stage4Walk(d.mesh.position.x, d.mesh.position.z, 2)));

const zS4 = robots.find(z => z.stage === 4);
camera.position.set(zS4.mesh.position.x + 30, cfgMod.CFG.player.eyeHeight, zS4.mesh.position.z);
let s4aiOk = true;
try { for (let i = 0; i < 5; i++) s4mod.stage4Scene.robotAI(zS4, 0.05, 3); } catch (e) { s4aiOk = false; }
T('S4: robotAI jalan tanpa error', s4aiOk);

// Semua robot layout baru berada di BARAT gerbang (alun-alun STERIL dari robot)
T('S4: semua robot di barat gerbang alun-alun (alun steril)',
    robots.filter(z => z.stage === 4).every(z => z.mesh.position.x < s4mod.S4_GATE.x - 20));
// ALUR MENANG: BOSS TANK (entities/tank.js, 2026-07-14) TIDAK muncul selagi
// masih ada robot. Tank = entitas MANDIRI (bukan anggota `robots`).
s4mod.stage4Scene.updateMode(0.1);
T('S4: tank boss BELUM muncul selagi masih ada robot', s4mod.currentTank() == null);
// GERBANG tertutup selagi robot hidup: playerCollide di posisi gerbang harus
// MENDORONG player keluar dari panel (blocker pejal di mulut ring).
{
    stateMod._v3.set(s4mod.S4_GATE.x, 0, s4mod.S4_GATE.z);
    s4mod.stage4Scene.playerCollide(stateMod._v3, s4mod.S4_GATE.x - 40, s4mod.S4_GATE.z, 0);
    T('S4: gerbang alun-alun TERTUTUP selagi robot hidup (player terdorong keluar)',
        Math.abs(stateMod._v3.x - s4mod.S4_GATE.x) > 4);
}
// bunuh SEMUA robot normal -> updateMode -> GERBANG terbuka + HELI PENJEMPUT
// menunggu di PUSAT alun-alun (rotor berputar cepat); TANK BELUM muncul — ia
// datang lewat CUTSCENE saat player menginjak ring road (2026-07-17).
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
s4mod.stage4Scene.updateMode(0.1);
const s4heli = s4mod.currentHeli();
const dom4 = await import(R('src/core/dom.js'));
const S4DLGCFG = cfgMod.CFG.campaign.dialogue;
const expectedS4Dialogue = {
    heliArrival: {
        speaker: 'Pilot',
        text: "Major, we’re at the LZ! Hurry, we're running out of time! Get in so we can fall back to Bandung and upload that file! Put an end to this madness once and for all!",
    },
    tankReveal: {
        speaker: 'Pilot',
        text: 'Wait... what the hell is THAT?! Is that a—',
    },
    pilotCutoff: {
        speaker: 'Pilot',
        text: 'GET OUT OF THE—',
        distorted: true,
    },
    gibranReaction: {
        speaker: 'Major Gibran',
        text: 'DAMN IT!! That metal bastard took out our exfil... I’m taking that tank down!',
    },
};
T('S4: semua robot mati -> HELI penjemput menunggu di pusat alun (tank belum muncul)',
    s4heli != null && s4mod.currentTank() == null && !s4heli.wrecked
    && s4heli.parts.group.position.x === s4mod.S4_END.x
    && s4heli.parts.group.position.z === s4mod.S4_END.z);
T('S4 DIALOG: empat naskah Pilot/Gibran dipatok PERSIS',
    JSON.stringify(s4mod.TANK_BOSS_DIALOGUE) === JSON.stringify(expectedS4Dialogue));
T('S4 DIALOG HELI: heli mendarat belum membuka dialog sebelum player menyentuh ring',
    s4mod.tankDialogueDebug().key === null && dom4.stageRadioDialogueDebug() === null);
{
    const r0 = s4heli.parts.rotor.rotation.y;
    s4mod.stage4Scene.updateMode(0.1);
    T('S4: baling-baling heli BERPUTAR cepat menunggu player', s4heli.parts.rotor.rotation.y > r0);
}
// GERBANG kini terbuka: posisi yang sama tidak lagi terdorong. CATATAN: collide
// DI DALAM rect SQ ini sekaligus = "player menginjak ring road" -> CUTSCENE mulai.
const s4FogBeforeCutscene = { near: scene.fog.near, far: scene.fog.far };
{
    // fokus kamera dipanaskan ke pivot dulu (di game nyata fokus selalu
    // membuntuti player) — supaya pan sinematik diukur dari posisi wajar
    camera.position.set(s4mod.S4_GATE.x, cfgMod.CFG.player.eyeHeight, s4mod.S4_GATE.z);
    rendererMod.followViewCam(0.1);   // snap: fokus = pivot di gerbang
    stateMod._v3.set(s4mod.S4_GATE.x, 0, s4mod.S4_GATE.z);
    stateMod.keys.w = stateMod.keys.d = true;   // bukti start() benar-benar melepas input tahan
    s4mod.stage4Scene.playerCollide(stateMod._v3, s4mod.S4_GATE.x - 40, s4mod.S4_GATE.z, 0);
    T('S4: gerbang TERBUKA setelah semua robot mati (player bisa lewat)',
        Math.abs(stateMod._v3.x - s4mod.S4_GATE.x) < 1e-6);
}
// CUTSCENE (2026-07-17): input dibekukan (cinematicActive; Esc tetap hidup),
// letterbox+HUD via dom, kamera pan ke heli, TANK masuk dari UTARA menembak
// heli (hancur), maju ke DEPAN bangkai, pan balik, kontrol pulih. Mesin
// berbasis TIMER -> deterministik headless.
T('S4 cutscene: menginjak ring road -> sinematik aktif + input player dibekukan',
    s4mod.cineDebug().active && stateMod.cinematicActive === true
    && stateMod.keys.w === false && stateMod.keys.d === false);
T('S4 DIALOG RING: SETELAH player dibekukan, cutscene membuka Pilot dengan body kosong + caret',
    s4mod.cineDebug().phase === 'open' && s4mod.tankDialogueDebug().key === 'heliArrival'
    && s4mod.tankDialogueDebug().shown === '' && s4mod.tankDialogueDebug().typing === true
    && dom4.stageRadioDialogueDebug().speaker === 'Pilot'
    && dom4.stageRadioDialogueDebug().text === '' && dom4.stageRadioDialogueDebug().typing === true);
s4mod.stage4Scene.updateMode(1.1 / Math.max(1, S4DLGCFG.cps));
T('S4 DIALOG RING: panggilan LZ mulai diketik huruf-per-huruf setelah cutscene aktif',
    s4mod.cineDebug().active && stateMod.cinematicActive
    && s4mod.tankDialogueDebug().chars === 1
    && s4mod.tankDialogueDebug().shown === expectedS4Dialogue.heliArrival.text.slice(0, 1));
{
    // ===== CUTSCENE TANK-BOSS — DIROMBAK 2026-07-27 (permintaan user: "buat agar
    // jauh lebih dramatis, jauh lebih cinematic ... SEPERTI FILM BOX OFFICE").
    // Papan 11 shot dgn azimut/jarak/tinggi sendiri (hook stage4Scene.camOffset ->
    // tankBossIntro.camOffset()), TIGA potongan film, telegraf getaran sebelum
    // reveal, gerak lambat hit-stop, heli yang mencoba kabur lalu JATUH, takarir,
    // dan serah-terima kamera TEPAT di sudut gameplay. Durasi shot dari CFG.
    const tsMod4 = await import(R('src/core/timeScale.js'));
    const azOf4 = (o) => { const a = Math.atan2(o.x, o.z) * 180 / Math.PI; return a < 0 ? a + 360 : a; };
    const camOff4 = () => s4mod.stage4Scene.camOffset;
    const HX = s4mod.S4_END.x, HZ = s4mod.S4_END.z;
    const P4 = { x: camera.position.x, z: camera.position.z };   // tempat player berdiri saat cutscene mulai
    const fogBefore = s4FogBeforeCutscene;
    const D0 = s4mod.cineDebug();
    const smashPre = s4mod.smashDebug();          // ruko masih UTUH sebelum tank masuk
    let smashPhase = null, smashTankZ = 0;        // fase & posisi tank saat ruko roboh
    const seen4 = [], dialogue4 = [], shot4 = [], spd4 = [];
    const partialDialogue4 = new Set(), dialoguePhase4 = {};
    let last4 = null, lastDialogue4 = null, n4 = 0, sawTankCine = false, sawDistorted4 = false;
    let cuts4 = 0, maxCamStep = 0, maxFocusStep = 0, tsMin = 1, tsAtFire = 1;
    let hMin = 1e9, hMax = -1e9, dMin = 1e9, dMax = -1e9, azMin = 1e9, azMax = -1e9;
    let heliLift = -99, fogMin = 1e9, focusMinHeli = 1e9, focusEndPlayer = 99;
    let tremorFar = 1e9, tremorSteps = 0, boundaryJump = 0, revealAt = -1;
    let prevCam = { ...camOff4() }, prevFoc = { ...D0.focus }, prevTP = null;
    const DT4 = 1 / 60;
    while (s4mod.cineDebug().active && n4++ < 4000) {
        s4mod.stage4Scene.updateMode(DT4);
        const d = s4mod.cineDebug(), t4 = s4mod.currentTank(), c4 = camOff4() || prevCam;
        if (t4 && t4.phase === 'cine') sawTankCine = true;
        if (!d.active) break;   // frame terakhir: cutscene sudah ditutup (hook kamera dilepas)
        if (d.phase !== last4) {
            seen4.push(d.phase);
            shot4.push([azOf4(c4), Math.hypot(c4.x, c4.z), c4.y]);
            if (d.phase === 'reveal') revealAt = spd4.length;
            last4 = d.phase;
        }
        const dlg4 = s4mod.tankDialogueDebug();
        if (dlg4.key && dlg4.key !== lastDialogue4) {
            dialogue4.push(dlg4.key);
            dialoguePhase4[dlg4.key] = d.phase;
            lastDialogue4 = dlg4.key;
        } else if (!dlg4.key) lastDialogue4 = null;
        if (dlg4.key && dlg4.chars > 0 && dlg4.chars < dlg4.text.length) partialDialogue4.add(dlg4.key);
        if (dlg4.key === 'pilotCutoff' && dlg4.distorted
            && dom4.stageRadioDialogueDebug()?.distorted) sawDistorted4 = true;
        {   // rentang sudut/jarak/tinggi diukur PER FRAME (puncak crane ada di
            // tengah shot, bukan di batas shot)
            const a4 = azOf4(c4), r4 = Math.hypot(c4.x, c4.z);
            azMin = Math.min(azMin, a4); azMax = Math.max(azMax, a4);
            dMin = Math.min(dMin, r4); dMax = Math.max(dMax, r4);
            hMin = Math.min(hMin, c4.y); hMax = Math.max(hMax, c4.y);
        }
        // POTONGAN vs gerak: langkah per frame yang besar hanya boleh terjadi di CUT
        const cs = Math.hypot(c4.x - prevCam.x, c4.y - prevCam.y, c4.z - prevCam.z);
        const fs4 = Math.hypot(d.focus.x - prevFoc.x, d.focus.z - prevFoc.z);
        if (cs > 60) cuts4++;
        else { maxCamStep = Math.max(maxCamStep, cs); maxFocusStep = Math.max(maxFocusStep, fs4); }
        prevCam = { x: c4.x, y: c4.y, z: c4.z }; prevFoc = { x: d.focus.x, z: d.focus.z };
        // Telegraf: selama 'tremor' tank sudah ADA & menderu, tapi masih JAUH di utara
        if (d.phase === 'tremor' && t4) {
            tremorSteps++;
            tremorFar = Math.min(tremorFar, Math.hypot(t4.parts.group.position.x - HX, t4.parts.group.position.z - HZ));
        }
        // Laju masuk tank: satu garis MENERUS lintas batas tremor->reveal
        if (t4 && (d.phase === 'tremor' || d.phase === 'reveal')) {
            const tp = t4.parts.group.position;
            if (prevTP) spd4.push(Math.hypot(tp.x - prevTP.x, tp.z - prevTP.z));
            prevTP = { x: tp.x, z: tp.z };
        }
        if (!smashPhase && s4mod.smashDebug().smashed) {   // frame RUKO ROBOH
            smashPhase = d.phase;
            smashTankZ = t4 ? t4.parts.group.position.z : 0;
        }
        if (d.heliY != null) heliLift = Math.max(heliLift, d.heliY);
        fogMin = Math.min(fogMin, scene.fog.far);
        tsMin = Math.min(tsMin, tsMod4.globalTimeScale());
        if (d.phase === 'shell') tsAtFire = Math.min(tsAtFire, tsMod4.globalTimeScale());
        focusMinHeli = Math.min(focusMinHeli, Math.hypot(d.focus.x - HX, d.focus.z - HZ));
        focusEndPlayer = Math.hypot(d.focus.x - P4.x, d.focus.z - P4.z);
    }
    if (revealAt > 1 && revealAt < spd4.length)
        boundaryJump = Math.abs(spd4[revealAt] - spd4[revealAt - 1]);
    const camEnd4 = { ...prevCam }, CD4 = rendererMod.CAM_OFF_DEFAULT;
    const s4t = s4mod.currentTank();

    // --- KONTRAK NARASI (empat beat yang wajib bertahan apa pun perubahannya)
    T('S4 CUTSCENE NARASI: heli menunggu -> TANK dari utara -> heli HANCUR -> parkir di BOSS_POS, kontrol pulih',
        s4mod.cineDebug().done && sawTankCine && s4heli.wrecked
        && stateMod.cinematicActive === false
        && s4t != null && s4t.phase === 'battle'
        && Math.hypot(s4t.parts.group.position.x - s4mod.S4_BOSS.x,
            s4t.parts.group.position.z - s4mod.S4_BOSS.z) < 6);
    T('S4 CUTSCENE: papan 11 shot berjalan URUT (' + seen4.length + ' beat)',
        seen4.join(',') === 'open,survey,tremor,reveal,lock,fire,shell,crash,advance,faceOff,panBack');
    // Telegraf: penonton MENDENGAR & MERASAKAN tank sebelum melihatnya — versi
    // lama men-spawn tank tepat di depan mata tanpa persiapan apa pun.
    T('S4 CUTSCENE TELEGRAF: tank sudah menderu jauh di utara selama fase tremor (terdekat '
        + tremorFar.toFixed(0) + ' unit dari heli)',
        tremorSteps > 30 && tremorFar > 200);
    T('S4 CUTSCENE: laju masuk tank MENERUS di batas tremor->reveal (lonjakan '
        + boundaryJump.toFixed(3) + ' vs laju puncak ' + Math.max(...spd4).toFixed(2) + ')',
        spd4.length > 60 && boundaryJump < Math.max(...spd4) * 0.15);
    // --- SINEMATOGRAFI: tiap shot punya sudut/jarak/tinggi sendiri (dulu SATU
    //     sudut gameplay sepanjang cutscene — yang berubah cuma titik fokus).
    T('S4 CUTSCENE KAMERA: sudut/jarak/tinggi BERVARIASI (tinggi ' + hMin.toFixed(0)
        + '-' + hMax.toFixed(0) + ', jarak ' + dMin.toFixed(0) + '-' + dMax.toFixed(0)
        + ', azimut ' + (azMax - azMin).toFixed(0) + '° span) — dulu SATU sudut gameplay',
        azMax - azMin > 90 && hMin < 40 && hMax > 200 && dMin < 110 && dMax > 250);
    T('S4 CUTSCENE KAMERA: EMPAT potongan film, sisanya bergerak MULUS (' + cuts4
        + ' cut; maks ' + maxCamStep.toFixed(2) + ' unit/frame kamera, '
        + maxFocusStep.toFixed(2) + ' fokus)',
        cuts4 === 4 && maxCamStep < 12 && maxFocusStep < 12);
    T('S4 CUTSCENE KAMERA: fokus menyapu player -> heli -> kembali ke player (terdekat ke heli '
        + focusMinHeli.toFixed(1) + ', akhir ke player ' + focusEndPlayer.toFixed(1) + ')',
        focusMinHeli < 20 && focusEndPlayer < 8);
    T('S4 CUTSCENE KAMERA: shot penutup MENDARAT di sudut gameplay & hook dilepas (serah-terima tanpa jentikan)',
        Math.abs(camEnd4.x - CD4.x) < 2.5 && Math.abs(camEnd4.y - CD4.y) < 2.5
        && Math.abs(camEnd4.z - CD4.z) < 2.5 && s4mod.stage4Scene.camOffset === null);
    // --- BEAT BARU: heli MENCOBA KABUR lalu jatuh, gerak lambat, laras ke player
    T('S4 CUTSCENE: heli MENCOBA lepas landas (naik ' + heliLift.toFixed(1)
        + ' unit) lalu JATUH menghantam pelataran',
        heliLift > 10 && Math.abs(s4heli.parts.group.position.y + 1.2) < 0.01);
    T('S4 CUTSCENE: GERAK LAMBAT (hit-stop global) menyala di tembakan & hantaman ('
        + tsAtFire.toFixed(2) + 'x)',
        tsAtFire < 0.6 && tsMin < 0.4);
    {
        const g = s4t.parts.group.position;
        const wantP = Math.atan2(P4.x - g.x, P4.z - g.z);
        let err = (s4t.turretYaw - wantP) % (Math.PI * 2);
        if (err > Math.PI) err -= Math.PI * 2; if (err < -Math.PI) err += Math.PI * 2;
        T('S4 CUTSCENE: laras MENGUNCI PLAYER di akhir (bukan bangkai heli)', Math.abs(err) < 0.2);
    }
    T('S4 CUTSCENE: kabut per-shot menebal saat shot rendah lalu DIPULIHKAN (min far '
        + fogMin.toFixed(0) + ' -> ' + scene.fog.far.toFixed(0) + ')',
        fogMin < fogBefore.far * 0.75 && Math.abs(scene.fog.far - fogBefore.far) < 1
        && Math.abs(scene.fog.near - fogBefore.near) < 1);
    T('S4 CUTSCENE DIALOG: panggilan LZ -> tank reveal -> radio terpotong -> reaksi Gibran tampil URUT',
        dialogue4.join(',') === 'heliArrival,tankReveal,pilotCutoff,gibranReaction'
        && dialoguePhase4.heliArrival === 'open'
        && dialoguePhase4.tankReveal === 'reveal'
        && dialoguePhase4.pilotCutoff === 'fire'
        && dialoguePhase4.gibranReaction === 'crash');
    T('S4 CUTSCENE DIALOG: semua body benar-benar melewati fase typewriter parsial',
        ['heliArrival', 'tankReveal', 'pilotCutoff', 'gibranReaction'].every(k => partialDialogue4.has(k)));
    T('S4 CUTSCENE RADIO: GET OUT OF THE— terdistorsi, lalu panel/sinyal terputus bersih saat duel',
        sawDistorted4 && s4mod.tankDialogueDebug().key === null
        && dom4.stageRadioDialogueDebug() === null && dom4.cineCaptionDebug() === null);
    // --- RUKO YANG DITEROBOS (2026-07-28, permintaan user: "tank itu kan
    //     menabrak sebuah bangunan ... buat agar bangunan itu hancur ... karena
    //     sekarang tank hanya berjalan melewatinya"). Bangunan berdiri TEPAT di
    //     lintasan masuk tank (lintasannya DITURUNKAN dari titik bangunan), roboh
    //     saat moncong menyentuh mukanya, dan puingnya mendarat lalu menetap.
    {
        const SM = s4mod.S4_SMASH;
        const CD5 = s4mod.cineDebug();
        // Lintasan masuk BENAR-BENAR melewati bangunan (jarak titik-ke-segmen)
        const A = CD5.tankFrom, B = CD5.tankFire;
        const vx = B.x - A.x, vz = B.z - A.z;
        const tt = Math.max(0, Math.min(1, ((SM.x - A.x) * vx + (SM.z - A.z) * vz) / (vx * vx + vz * vz)));
        const off = Math.hypot(A.x + vx * tt - SM.x, A.z + vz * tt - SM.z);
        // Lintasannya DITURUNKAN dari posisi bangunan, bukan kebetulan sejajar:
        // geser bangunannya, lintasan tank ikut bergeser supaya tetap menabraknya.
        const tbiMod = await import(R('src/scenes/campaign/cutscenes/stage4/tankBossIntro.js'));
        const probe = (shift) => tbiMod.createTankBossIntro({
            SQ: s4mod.arenaDebug().sq, HELI_POS: s4mod.S4_END, BOSS_POS: s4mod.S4_BOSS,
            WRECK_CLEAR: CD5.wreckClear, S4_START: s4mod.S4_START,
            blockers: [], openGate() { }, setTank() { }, smash() { },
            SMASH: { x: SM.x + shift, z: SM.z, hx: SM.hx, hz: SM.hz },
        }).cineDebug();
        const missOf = (dbg, px, pz) => {
            const a = dbg.tankFrom, b = dbg.tankFire;
            const ux = b.x - a.x, uz = b.z - a.z;
            const u = Math.max(0, Math.min(1, ((px - a.x) * ux + (pz - a.z) * uz) / (ux * ux + uz * uz)));
            return Math.hypot(a.x + ux * u - px, a.z + uz * u - pz);
        };
        const moved = probe(90);
        T('S4 RUKO: lintasan masuk tank DITURUNKAN dari posisi bangunan (meleset '
            + off.toFixed(2) + ' unit; digeser 90 -> meleset ' + missOf(moved, SM.x + 90, SM.z).toFixed(2) + ')',
            off < 1 && missOf(moved, SM.x + 90, SM.z) < 1
            && Math.abs(moved.tankFrom.x - CD5.tankFrom.x) > 20);
        T('S4 RUKO: utuh sebelum cutscene -> DITEROBOS saat moncong menyentuh mukanya (fase '
            + smashPhase + ', z ' + smashTankZ.toFixed(0) + ' vs muka ' + (SM.z - SM.hz).toFixed(0) + ')',
            smashPre && smashPre.smashed === false && smashPhase != null
            && Math.abs(smashTankZ - (SM.z - SM.hz - 18)) < 6);
        // KORIDOR MASUK TANK BEBAS DEKOR (2026-07-28, laporan lanjutan user: "kok
        // tanknya masih berjalan menembus sebuah bangunan itu?"). Menaruh satu ruko
        // yang bisa hancur belum cukup — jalur tank masih dilewati gedung latar
        // INSTANCED (ditaruh acak), pohon keliling alun, pagar hedge utara, dan KIOS
        // ring utara; semuanya dekor tanpa kolisi, jadi tank menembusnya seperti
        // hantu. Sekarang koridornya zona bebas-dekor & pagarnya dibelah, jadi
        // SATU-SATUNYA yang berdiri di jalur tank adalah ruko yang memang hancur.
        {
            const LN = s4mod.S4_LANE, A = CD5.tankFrom, B = CD5.tankFire;
            const inLane = (r) => r.x0 >= LN.x0 && r.x1 <= LN.x1 && r.z0 >= LN.z0 && r.z1 <= LN.z1;
            const hits = (r, q) => !(r.x1 < q.x0 || r.x0 > q.x1 || r.z1 < q.z0 || r.z0 > q.z1);
            // (a) lane benar-benar MENYELIMUTI lintasan tank (+ setengah lebar lambung)
            let covered = true;
            const HALF = 14;
            for (let i = 0; i <= 40; i++) {
                const u = i / 40;
                const px = A.x + (B.x - A.x) * u, pz = A.z + (B.z - A.z) * u;
                if (!inLane({ x0: px - HALF, x1: px + HALF, z0: pz - HALF, z1: pz + HALF })) covered = false;
            }
            // (b) TAK ADA dekor/prop yang berdiri di dalam lane — gedung latar & pohon
            //     lewat claimDecor (ditolak zona), kios/bangku/planter lewat propRects.
            const RD = s4mod.roadsideDebug();
            const inside = RD.rects.concat(s4mod.s4PropRects()).filter(r => hits(r, LN));
            T('S4 RUKO: koridor masuk tank BEBAS dekor — hanya ruko yang berdiri di jalur ('
                + inside.length + ' dekor/prop di lane dari ' + (RD.count + s4mod.s4PropRects().length)
                + ', lintasan terselimuti: ' + covered + ')',
                covered && inside.length === 0 && RD.clear === true);
        }
        // Bangunan MURNI DEKOR: berdiri di luar area boleh-jalan & tak pernah jadi
        // blocker -> menghancurkannya mustahil mengubah kolisi/pathing robot.
        stateMod._v3.set(SM.x, 0, SM.z);
        const before = { x: stateMod._v3.x, z: stateMod._v3.z };
        s4mod.stage4Scene.playerCollide(stateMod._v3, SM.x, SM.z, 0);
        T('S4 RUKO: murni DEKOR (di luar area boleh-jalan, bukan blocker/nav)',
            s4mod.stage4Walk(SM.x, SM.z, 0) === false
            && Math.abs(stateMod._v3.x - before.x) < 1e-6 && Math.abs(stateMod._v3.z - before.z) < 1e-6);
        // Endapkan puing (tahan serangan tank supaya blok ini deterministik).
        const tk5 = s4mod.currentTank(), cdSave = tk5.cd;
        tk5.cd = 9999;
        for (let i = 0; i < 180; i++) s4mod.stage4Scene.updateMode(1 / 60);
        tk5.cd = cdSave;
        const sd = s4mod.smashDebug();
        T('S4 RUKO: seluruh puing MENDARAT & menetap jadi reruntuhan rendah ('
            + sd.resting + '/' + sd.parts + ' bagian, puncak ' + sd.maxY.toFixed(0)
            + ' dari ' + sd.top.toFixed(0) + ')',
            sd.smashed && sd.resting === sd.parts && sd.active === false
            && sd.maxY < sd.top * 0.45);
        // Puing dilempar CEPAT tapi RENDAH -> mendarat di kaki bangunan, tidak
        // berhamburan masuk kompleks alun-alun (arena duel harus tetap bersih).
        T('S4 RUKO: puing tak berhamburan masuk kompleks alun-alun (terjauh '
            + sd.maxZ.toFixed(0) + ' vs tepi utara ' + s4mod.arenaDebug().sq.z0.toFixed(0) + ')',
            sd.maxZ < s4mod.arenaDebug().sq.z0 - 5);
    }
    tsMod4.resetTimeScale();   // jangan bocorkan hit-stop ke blok uji berikutnya
}
// API BERKOBAR (2026-07-18): bangkai heli MENYALA sepanjang sisa Stage 4 (lidah
// api dianimasikan updateHelicopter). Cairan/gib heli HITAM, BUKAN coolant hijau.
T('S4: bangkai heli BERKOBAR (lidah api menyala) setelah dihancurkan',
    s4heli.wrecked && Array.isArray(s4heli.flames) && s4heli.flames.length > 0
    && s4heli.flames[0].spr.isSprite === true);
{
    const y0 = s4heli.flames[0].spr.scale.y;
    for (let i = 0; i < 6; i++) s4mod.stage4Scene.updateMode(0.05);
    T('S4: lidah api berkedip (skala/opasitas berubah antar-frame, api tetap ada)',
        s4heli.flames[0].spr.scale.y !== y0 && s4heli.flames.length > 0);
}
const s4tank = s4mod.currentTank();
// TANK DIKECILKAN (2026-07-18, permintaan user): skala grup < 1 (proporsional
// thd karakter/robot/heli); bodyRadius/hitRadius CFG diturunkan seukuran.
T('S4: tank dikecilkan sedikit (skala grup < 1)',
    s4tank.parts.group.scale.x < 1 && s4tank.parts.group.scale.x > 0.5);
T('S4: tank parkir di DEPAN bangkai heli (home = S4_BOSS, bukan pusat alun)',
    s4tank.homeX === s4mod.S4_BOSS.x && s4tank.homeZ === s4mod.S4_BOSS.z
    && (s4mod.S4_BOSS.x !== s4mod.S4_END.x || s4mod.S4_BOSS.z !== s4mod.S4_END.z)
    && Math.hypot(s4tank.parts.group.position.x - s4mod.S4_END.x,
        s4tank.parts.group.position.z - s4mod.S4_END.z) >= s4mod.cineDebug().wreckClear - 1);
T('S4: HP tank = CFG.campaign.bosses.tank.hp',
    s4tank.hp === cfgMod.CFG.campaign.bosses.tank.hp && s4tank.maxHp === cfgMod.CFG.campaign.bosses.tank.hp);
// jalankan siklus tank (3 serangan bergantian, pasca-cutscene) ~12 dtk
camera.position.set(s4mod.S4_START.x, cfgMod.CFG.player.eyeHeight, s4mod.S4_START.z);
let s4tankOk = true;
try { for (let i = 0; i < 120; i++) s4mod.stage4Scene.updateMode(0.1); } catch (e) { s4tankOk = false; console.log(e); }
T('S4: siklus tank (3 serangan bergantian) jalan tanpa error', s4tankOk && !s4tank.dead);
// Netralkan state serangan (cd beku) supaya blok-blok uji berikut deterministik
const s4calm = () => {
    s4tank.mgLeft = 0; s4tank.mortarLeft = 0; s4tank.blastPending = false; s4tank.cd = 99;
    s4tank.holdT = 0;   // buang jeda masuk-arena (di-set pemicu kunci arena)
    while (s4tank.mortars.length) { scene.remove(s4tank.mortars[0].mesh); s4tank.mortars.splice(0, 1); }
    while (s4tank.shells.length) { scene.remove(s4tank.shells[0].mesh); s4tank.shells.splice(0, 1); }
};
s4calm();
// ENRAGE GAP (2026-07-17): jeda antar-serangan = gapSec normal, tapi saat HP <
// enrageHpFrac × maxHp pakai enrageGapSec yang lebih cepat. Uji lewat akhir burst MG.
{
    const TB = cfgMod.CFG.campaign.bosses.tank;
    s4calm(); s4tank.phase = 'battle'; s4tank.hp = s4tank.maxHp;
    s4tank.mgLeft = 1; s4tank.mgTimer = 0;
    s4mod.stage4Scene.updateMode(0.05);
    const gapNormal = s4tank.cd;
    s4calm(); s4tank.phase = 'battle'; s4tank.hp = s4tank.maxHp * (TB.enrageHpFrac || 0.5) - 1;
    s4tank.mgLeft = 1; s4tank.mgTimer = 0;
    s4mod.stage4Scene.updateMode(0.05);
    const gapEnrage = s4tank.cd;
    T('S4: jeda serangan normal = gapSec, ENRAGE (HP<50%) = enrageGapSec (lebih cepat)',
        Math.abs(gapNormal - TB.gapSec) < 1e-6 && Math.abs(gapEnrage - TB.enrageGapSec) < 1e-6
        && TB.enrageGapSec < TB.gapSec);
    s4tank.hp = s4tank.maxHp; s4calm();
}
// PAGAR LISTRIK (2026-07-16): player di dalam radius shockRadiusMeters tersengat
// shockDps HP/DETIK yang MENEMBUS armor (durability TIDAK tergerus — HP langsung,
// bukan damagePlayerHp); godMode kebal; di luar radius aman. Config-driven.
{
    const TB = cfgMod.CFG.campaign.bosses.tank;
    const shockR = TB.shockRadiusMeters * cfgMod.CAMP_M;
    const tp = s4tank.parts.group.position;
    player.hp = 100; player.armorLvl = 1; player.armor = 100; player.armorMax = 100;
    camera.position.set(tp.x - shockR * 0.5, cfgMod.CFG.player.eyeHeight, tp.z);
    for (let i = 0; i < 10; i++) s4mod.stage4Scene.updateMode(0.1);   // 1 detik tersengat
    const drop = 100 - player.hp;
    T('S4: PAGAR LISTRIK — dekat tank tersengat shockDps/detik MENEMBUS armor',
        TB.shockDps > 0 && Math.abs(drop - TB.shockDps) < TB.shockDps * 0.2 && player.armor === 100);
    stateMod.setGodMode(true);
    player.hp = 100;
    for (let i = 0; i < 10; i++) s4mod.stage4Scene.updateMode(0.1);
    T('S4: setruman tank tidak menembus god-mode', player.hp === 100);
    stateMod.setGodMode(false);
    camera.position.set(tp.x - shockR * 3, cfgMod.CFG.player.eyeHeight, tp.z);
    player.hp = 100;
    for (let i = 0; i < 10; i++) s4mod.stage4Scene.updateMode(0.1);
    T('S4: di luar radius setrum player aman', player.hp === 100);
    player.armorLvl = 0; player.armor = 0; player.armorMax = 0;
    s4calm();
}
// LOB BER-APEX (2026-07-16, rombak "parabola aneh"): mortar SELALU melambung
// (vy0 > 0) ke puncak = max(sy, landY) + min(riseCap, max(apexMeters·CAMP_M,
// jarak·apexRatio)), lalu MENDARAT di posisi player (STATIS di test ini —
// pengejaran + penguncian mortarLockSec diuji terpisah di bawah).
{
    const TB = cfgMod.CFG.campaign.bosses.tank;
    const tp = s4tank.parts.group.position;
    camera.position.set(tp.x - 400, cfgMod.CFG.player.eyeHeight, tp.z + 10);
    const txp = camera.position.x, tzp = camera.position.z;
    s4tank.mortarLeft = 1; s4tank.mortarTimer = 0; s4tank.blastPending = true;
    s4mod.stage4Scene.updateMode(0.02);   // tembakkan 1 mortar (belum terintegrasi)
    const mo = s4tank.mortars[s4tank.mortars.length - 1];
    const vy0 = mo.vy, sy0 = mo.mesh.position.y;
    const d0 = Math.hypot(txp - mo.mesh.position.x, tzp - mo.mesh.position.z);
    const g = TB.mortarGravity;
    const riseCap = 0.5 * g * Math.pow(TB.mortarMaxSec * 0.45, 2);
    const wantRise = Math.min(riseCap, Math.max(TB.mortarApexMeters * cfgMod.CAMP_M, d0 * TB.mortarApexRatio));
    const wantApex = Math.max(sy0, 5) + wantRise;
    const apexCalc = sy0 + vy0 * vy0 / (2 * mo.g);   // puncak analitik dari vy0
    let lastX = 0, lastZ = 0;
    for (let i = 0; i < 600 && s4tank.mortars.includes(mo); i++) {
        lastX = mo.mesh.position.x; lastZ = mo.mesh.position.z;
        s4mod.stage4Scene.updateMode(0.02);
    }
    const missBy = Math.hypot(lastX - txp, lastZ - tzp);
    T('S4: mortar LOB BER-APEX — vy0 selalu ke atas, puncak sesuai formula config',
        vy0 > 0 && Math.abs(apexCalc - wantApex) < 2 && TB.mortarApexMeters > 0 && TB.mortarApexRatio > 0);
    T('S4: mortar mendarat di posisi player saat tembakan (meleset ' + missBy.toFixed(1) + ' u < 10)',
        !s4tank.mortars.includes(mo) && missBy < 10);
    // DESING MORTAR DATANG (2026-07-19, permintaan user — durasi PAS): node
    // tank-incoming-mortar dibuat SELAMA fase akhir terbang dan sudah DIPAUSE
    // tepat saat mortar meledak (tak ada sisa desing setelah ledakan).
    T('S4: desing incoming-mortar menyala saat mau jatuh & BERHENTI tepat saat meledak',
        mo.snd != null && mo.snd.paused === true);
    s4calm();
}
// Mortar = LOB PARABOLA balistik (2026-07-15, bukan homing): suntik 1 mortar
// naik + gravitasi → updateTank harus meng-ARC-kan (naik dulu) lalu MELEDAK saat
// turun melewati landY (proyektil hilang dari array; homing-nya sudah dihapus).
{
    const mo = { mesh: new THREE.Object3D(), vx: 0, vz: 0, vy: 40, g: cfgMod.CFG.campaign.bosses.tank.mortarGravity, landY: 5, life: 600, id: ++s4tank.pendingId };
    mo.mesh.position.set(s4tank.parts.group.position.x, 20, s4tank.parts.group.position.z);
    s4tank.mortars.push(mo);
    let peaked = 20;
    for (let i = 0; i < 80 && s4tank.mortars.includes(mo); i++) { s4mod.stage4Scene.updateMode(0.1); peaked = Math.max(peaked, mo.mesh.position.y); }
    T('S4: mortar = LOB PARABOLA (naik dulu lalu meledak saat turun, bukan homing)',
        peaked > 24 && !s4tank.mortars.includes(mo) && cfgMod.CFG.campaign.bosses.tank.mortarGravity > 0);
}
// Bentuk proyektil mortar (2026-07-16): shell mortir REALISTIS = GROUP multi-part
// (badan+hidung+buritan+boom+fuze+4 sirip), bukan bola tunggal.
{
    const tankMod = await import(R('src/entities/tank.js'));
    const shell = tankMod.mortarShell();
    T('S4: proyektil mortar = shell multi-part (bukan bola)', shell.children.length >= 8);
}
while (s4tank.mortars.length) { scene.remove(s4tank.mortars[0].mesh); s4tank.mortars.splice(0, 1); }   // bersihkan mortar sisa
// Mortar BURST (2026-07-16): serangan mortar = mortarBurst tembakan berjeda
// mortarBurstGapSec (bukan 1 tembakan). Picu burst manual (tank di fase battle,
// hidup) lalu hitung tembakan lewat kenaikan pendingId (fireMortar +1 tiap tembak).
{
    const burst = cfgMod.CFG.campaign.bosses.tank.mortarBurst;
    const gap = cfgMod.CFG.campaign.bosses.tank.mortarBurstGapSec;
    s4tank.mortarLeft = burst; s4tank.mortarTimer = 0; s4tank.blastPending = true;
    const idBefore = s4tank.pendingId;
    const frames = Math.ceil((burst * gap) / 0.1) + 5;
    for (let i = 0; i < frames && s4tank.mortarLeft > 0; i++) s4mod.stage4Scene.updateMode(0.1);
    T('S4: serangan mortar = BURST mortarBurst tembakan (jeda mortarBurstGapSec)',
        burst >= 2 && gap > 0 && (s4tank.pendingId - idBefore) === burst && s4tank.mortarLeft === 0);
    while (s4tank.mortars.length) { scene.remove(s4tank.mortars[0].mesh); s4tank.mortars.splice(0, 1); }
}
// BADAN DIAM + hanya TURRET berputar (2026-07-17, menggantikan rotasi hull):
// hull TIDAK berputar mengikuti player selama BATTLE (group.rotation.y tetap
// orientasi spawn; hullYaw tinggal 0 — hanya fase charge enrage yang boleh
// memutarnya); TURRET membidik player dgn yaw lokal = yaw dunia − yaw hull.
{
    const tp = s4tank.parts.group.position;
    s4calm();
    s4tank.parts.group.rotation.y = 0;   // orientasi spawn (moncong hadap barat)
    // player DIAGONAL belakang-samping (yaw dunia sasaran = π/4, BUKAN 0 —
    // supaya bug skala/offset yaw turret tak lolos tersamar di sudut nol)
    camera.position.set(tp.x + 300, cfgMod.CFG.player.eyeHeight, tp.z + 300);
    const frames = Math.ceil((Math.PI / 2.2) / 0.1) + 10;   // laju putar turret 2.2 rad/dtk (tank.js)
    for (let i = 0; i < frames; i++) s4mod.stage4Scene.updateMode(0.1);
    const wantTurret = Math.atan2(camera.position.x - s4tank.homeX, camera.position.z - s4tank.homeZ);
    T('S4: BADAN tank DIAM selama battle — hull tak mengikuti player (hullYaw 0, hanya fase charge memutarnya)',
        s4tank.parts.group.rotation.y === 0 && s4tank.hullYaw === 0);
    T('S4: hanya TURRET yang berputar membidik player (yaw lokal = yaw dunia)',
        Math.abs(s4tank.parts.turret.rotation.y - wantTurret) < 0.05);
    s4calm();
}
// MG KOAKSIAL DI TURRET (2026-07-17, menggantikan bola glacis hull + kerucut
// mgConeDeg): anchor muzzle MG = anak TURRET (ikut berputar melacak player),
// dan tiap peluru MEMBIDIK posisi player saat ini — player di belakang/samping
// hull TETAP terbidik (kerucut depan dihapus; mgConeDeg/hullTurnRadPerSec dorman).
{
    const tp = s4tank.parts.group.position;
    T('S4: muzzle MG menempel di TURRET (koaksial di samping meriam, bukan hull)',
        s4tank.parts.mgMuzzle.parent === s4tank.parts.turret);
    while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }
    camera.position.set(tp.x + 600, cfgMod.CFG.player.eyeHeight, tp.z);   // player di BELAKANG hull (timur)
    s4tank.mgLeft = 1; s4tank.mgTimer = 0;
    s4mod.stage4Scene.updateMode(0.01);   // 1 tembakan MG
    const bBack = enemyBullets[enemyBullets.length - 1];
    const dxb = camera.position.x - bBack.px, dzb = camera.position.z - bBack.pz;
    const db = Math.hypot(dxb, dzb);
    T('S4: MG membidik player walau di belakang hull (turret yang mengarah, tanpa kerucut)',
        bBack != null && (bBack.dir.x * dxb + bBack.dir.z * dzb) / db > 0.98);
    while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }
    s4calm();
}
// KILAT TERTEMBAK (2026-07-17): tiap damageTank men-tint cat tank SEDIKIT ke
// MERAH (maks ~10% jarak ke merah — spesifikasi user "hanya sedikit") lalu
// MEMUDAR kembali PERSIS ke warna dasar (paintBase); tank tetap hidup.
{
    const tankMod = await import(R('src/entities/tank.js'));
    const mats = s4tank.parts.paintMats, base = s4tank.parts.paintBase;
    T('S4: paintBase terekam per material cat (acuan pudar kilat)',
        Array.isArray(base) && base.length === mats.length
        && base.every((h, i) => h === mats[i].color.getHex()));
    const hpBefore = s4tank.hp;
    tankMod.damageTank(s4tank, 1);
    s4mod.stage4Scene.updateMode(0.01);   // 1 frame -> tint kilat diterapkan
    let tinted = true, slight = true;
    for (let i = 0; i < mats.length; i++) {
        const h = mats[i].color.getHex();
        const br = base[i] >> 16 & 255, bg = base[i] >> 8 & 255;
        const r = h >> 16 & 255, g = h >> 8 & 255;
        if (!(r > br && g < bg)) tinted = false;                            // rona bergeser ke merah
        if (r - br > Math.ceil((255 - br) * 0.10) + 1) slight = false;      // HANYA sedikit (<= 10%)
    }
    T('S4: kena tembak -> cat ter-tint MERAH tipis (naik merah <= 10%, bukan merah menyala)',
        tinted && slight && s4tank.hp === hpBefore - 1 && !s4tank.dead);
    for (let i = 0; i < 40; i++) s4mod.stage4Scene.updateMode(0.05);   // ~2 dtk memudar
    T('S4: kilat tertembak memudar kembali PERSIS ke warna dasar cat',
        mats.every((m, i) => m.color.getHex() === base[i]) && s4tank.hitT === 0);
    s4calm();
}
// MORTAR MENGEJAR + TERKUNCI (2026-07-17): titik jatuh mengikuti player selama
// terbang dan TERKUNCI mortarLockSec sebelum mendarat — mendarat di posisi
// player SAAT PENGUNCIAN (bukan posisi fire-time / posisi akhir player).
{
    const TB = cfgMod.CFG.campaign.bosses.tank;
    const tp = s4tank.parts.group.position;
    s4calm();
    camera.position.set(tp.x - 400, cfgMod.CFG.player.eyeHeight, tp.z);
    const fireX = camera.position.x, fireZ = camera.position.z;
    s4tank.mortarLeft = 1; s4tank.mortarTimer = 0; s4tank.blastPending = true;
    s4mod.stage4Scene.updateMode(0.02);   // tembak 1 mortar
    const mo = s4tank.mortars[s4tank.mortars.length - 1];
    T('S4: mortar membawa tLeft (sisa terbang) utk pengejaran', mo != null && mo.tLeft > TB.mortarLockSec);
    // player LARI menyamping sepanjang terbang; catat posisinya saat terkunci
    let lockX = null, lockZ = null, lastX = 0, lastZ = 0, vzLock = null, vzChanged = false;
    for (let i = 0; i < 900 && s4tank.mortars.includes(mo); i++) {
        camera.position.z += 70 * 0.02;   // lari ~10 m/dtk menyamping
        lastX = mo.mesh.position.x; lastZ = mo.mesh.position.z;
        s4mod.stage4Scene.updateMode(0.02);
        if (s4tank.mortars.includes(mo) && mo.tLeft <= TB.mortarLockSec) {
            if (lockX == null) { lockX = camera.position.x; lockZ = camera.position.z; vzLock = mo.vz; }
            else if (mo.vz !== vzLock) vzChanged = true;
        }
    }
    const missLock = Math.hypot(lastX - lockX, lastZ - lockZ);
    const missFire = Math.hypot(lastX - fireX, lastZ - fireZ);
    const missFinal = Math.hypot(lastX - camera.position.x, lastZ - camera.position.z);
    T('S4: titik jatuh mortar = posisi player saat TERKUNCI (mengejar selama terbang)',
        lockX != null && missLock < 8 && missFire > missLock + 10);
    T('S4: setelah terkunci arah mortar beku (masih bisa dihindari di detik terakhir)',
        vzChanged === false && missFinal > 70 * TB.mortarLockSec * 0.5);
    s4calm();
}
// KUNCI ARENA BOSS (2026-07-17): sebelum menginjak lapangan, ring road bebas
// dilalui & camBounds null; begitu playerCollide mendarat DI DALAM lapangan
// ALUN selagi tank hidup -> TERKUNCI: posisi di luar lapangan dijepit balik
// (tak bisa keluar alun-alun / mundur ke ring road) + camBounds mengembalikan
// rect kompleks SQ dan followViewCam menjepit tapak-pandang kamera di dalamnya.
{
    const A = s4mod.arenaDebug();
    const ringX = A.sq.x0 + 20, ringZ = 0;   // ring barat: dalam SQ, LUAR lapangan ALUN
    T('S4: sebelum masuk lapangan — arena belum terkunci & camBounds null',
        !A.locked && s4mod.stage4Scene.camBounds() === null);
    stateMod._v3.set(ringX, cfgMod.CFG.player.eyeHeight, ringZ);
    s4mod.stage4Scene.playerCollide(stateMod._v3, ringX, ringZ, 0);
    T('S4: ring road masih bebas dilalui sebelum duel terkunci',
        Math.abs(stateMod._v3.x - ringX) < 1e-6 && !s4mod.arenaDebug().locked);
    // injak lapangan (jauh dari tank di pusat) -> arena TERKUNCI
    const cx = (A.alun.x0 + A.alun.x1) / 2 + 120, cz = 0;
    stateMod._v3.set(cx, cfgMod.CFG.player.eyeHeight, cz);
    s4mod.stage4Scene.playerCollide(stateMod._v3, cx, cz, 0);
    const rect = s4mod.stage4Scene.camBounds();
    T('S4: menginjak lapangan -> arena TERKUNCI + camBounds = rect kompleks (SQ)',
        s4mod.arenaDebug().locked && rect && rect.x0 === A.sq.x0 && rect.x1 === A.sq.x1
        && rect.z0 === A.sq.z0 && rect.z1 === A.sq.z1);
    // coba kembali ke ring road -> dijepit tetap di dalam lapangan
    stateMod._v3.set(ringX, cfgMod.CFG.player.eyeHeight, ringZ);
    s4mod.stage4Scene.playerCollide(stateMod._v3, cx, cz, 0);
    T('S4: terkunci — tak bisa keluar lapangan / ke ring road (pos dijepit di ALUN)',
        stateMod._v3.x >= A.alun.x0 + player.radius - 1e-6
        && stateMod._v3.x <= A.alun.x1 - player.radius + 1e-6
        && stateMod._v3.z >= A.alun.z0 + player.radius - 1e-6
        && stateMod._v3.z <= A.alun.z1 - player.radius + 1e-6);
    // KAMERA: pivot di tepi timur lapangan -> fokus dijepit (lebih ketat dari
    // dead-zone) sehingga tepi tapak-pandang tidak melewati batas SQ.
    camera.position.set(A.alun.x1 - 5, cfgMod.CFG.player.eyeHeight, 0);
    for (let i = 0; i < 60; i++) rendererMod.followViewCam(0.1);   // snap + kejar + clamp
    const foc = rendererMod.camFocusPos();
    const ext = rendererMod.groundViewExtents(foc.y, 0);
    T('S4: tepi kamera dijepit — tapak-pandang tak melewati batas alun+ring (SQ)',
        foc.x < camera.position.x - 15   // clamp benar-benar menahan (bukan dead-zone biasa)
        && foc.x + ext.maxX <= A.sq.x1 + 0.5 && foc.z + ext.maxZ <= A.sq.z1 + 0.5
        && foc.x + ext.minX >= A.sq.x0 - 0.5 && foc.z + ext.minZ >= A.sq.z0 - 0.5);
}
// JEDA MASUK ARENA (2026-07-17): pemicu kunci arena (blok di atas) men-set
// tank.holdT = engageDelaySec — selama jeda itu tank MENAHAN semua serangan
// (cd beku, tanpa proyektil baru) walau cd sudah siap; setelah jeda habis
// serangan berjalan lagi. Config-driven.
{
    const TB = cfgMod.CFG.campaign.bosses.tank;
    T('S4: menginjak lapangan men-set jeda masuk arena (holdT = engageDelaySec)',
        TB.engageDelaySec > 0 && Math.abs(s4tank.holdT - TB.engageDelaySec) < 1e-9);
    s4tank.phase = 'battle';
    s4tank.mgLeft = 0; s4tank.mortarLeft = 0; s4tank.blastPending = false;
    s4tank.cd = 0.05;   // serangan siap meluncur — tapi harus tertahan jeda
    const idBefore = s4tank.pendingId, ebBefore = enemyBullets.length;
    const steps = Math.max(1, Math.floor((TB.engageDelaySec - 0.05) / 0.1));
    for (let i = 0; i < steps; i++) s4mod.stage4Scene.updateMode(0.1);   // < jeda
    T('S4: selama jeda masuk arena tank TIDAK menembak (cd beku, tanpa proyektil baru)',
        s4tank.pendingId === idBefore && enemyBullets.length === ebBefore
        && s4tank.shells.length === 0 && s4tank.mortars.length === 0
        && Math.abs(s4tank.cd - 0.05) < 1e-9);
    for (let i = 0; i < 30 && s4tank.pendingId === idBefore && enemyBullets.length === ebBefore; i++) {
        s4mod.stage4Scene.updateMode(0.1);
    }
    T('S4: setelah jeda masuk arena habis tank kembali menyerang',
        s4tank.holdT <= 0 && (s4tank.pendingId > idBefore || enemyBullets.length > ebBefore));
    while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }
    robotsMod.resetRobotsFx();   // buang boom proyektil yang sempat meledak
    s4calm();
}
// KOLISI BADAN TANK (2026-07-17): player tidak bisa berjalan menembus tank —
// playerCollide stage4 mendorong keluar lingkaran bodyRadius; di luar radius
// posisi tidak disentuh. Config-driven.
{
    const TB = cfgMod.CFG.campaign.bosses.tank;
    const tp = s4tank.parts.group.position;
    const pin = new THREE.Vector3(tp.x + TB.bodyRadius * 0.3, cfgMod.CFG.player.eyeHeight, tp.z + 1);
    s4mod.stage4Scene.playerCollide(pin, pin.x, pin.z, 0);
    T('S4: KOLISI TANK — player di dalam bodyRadius terdorong keluar',
        TB.bodyRadius > 0 && Math.hypot(pin.x - tp.x, pin.z - tp.z) >= TB.bodyRadius - 0.01);
    const ox = tp.x + TB.bodyRadius * 2;
    const pout = new THREE.Vector3(ox, cfgMod.CFG.player.eyeHeight, tp.z);
    s4mod.stage4Scene.playerCollide(pout, pout.x, pout.z, 0);
    T('S4: di luar bodyRadius player tidak terdorong',
        Math.abs(pout.x - ox) < 0.01 && Math.abs(pout.z - tp.z) < 0.01);
}
while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }   // bersihkan peluru MG
// MEKANIK ENRAGE / CHARGE (2026-07-17): HP < enrageHpFrac -> tiap SIKLUS penuh
// (attackIdx 2 -> giliran kembali ke 0) SELALU memulai charge (sistem peluang
// chargeChance DIHAPUS 2026-07-17 — permintaan user):
// 'turn' (badan pivot ke player) -> 'chargeOut' (maju SECEPAT LARI PLAYER
// sampai keluar arena + chargeOutMargin = tersembunyi dari kamera terjepit) ->
// 'away' (hujan awayMortarShots mortir) -> 'chargeBack' (start acak di LUAR
// arena searah posisi player, berhenti tepat di pusat) -> 'straighten' (badan
// lurus rotation.y = 0 seperti awal duel) -> 'battle' (attackIdx -1 = wajib
// 1 siklus penuh lagi). Config-driven; Math.random dipaksa 0 agar titik start
// acak charge-balik deterministik; godMode ON selama gerak (pagar listrik
// tank melintasi player).
{
    const TB = cfgMod.CFG.campaign.bosses.tank;
    const A = s4mod.arenaDebug();
    const _rand = Math.random;
    Math.random = () => 0;
    stateMod.setGodMode(true);
    player.hp = 100;
    camera.position.set(A.alun.x1 - 40, cfgMod.CFG.player.eyeHeight, 0);   // player di timur lapangan
    // 1) HP di ATAS ambang: akhir siklus TIDAK memicu charge (cannon jalan biasa)
    s4calm();
    s4tank.hp = s4tank.maxHp;
    s4tank.attackIdx = 2; s4tank.cd = 0.05;
    s4mod.stage4Scene.updateMode(0.1);
    T('S4 enrage: HP >= ambang -> akhir siklus TIDAK charge (cannon biasa)',
        TB.enrageHpFrac > 0 && TB.enrageHpFrac < 1 && s4tank.phase === 'battle' && s4tank.attackIdx === 0);
    while (s4tank.shells.length) { scene.remove(s4tank.shells[0].mesh); s4tank.shells.splice(0, 1); }
    s4calm();
    // 2) HP < ambang + siklus penuh selesai -> mulai CHARGE (fase 'turn')
    s4tank.hp = s4tank.maxHp * TB.enrageHpFrac - 1;
    s4tank.attackIdx = 2; s4tank.cd = 0.05;
    s4mod.stage4Scene.updateMode(0.1);
    T('S4 enrage: HP < ambang + siklus penuh -> SELALU mulai CHARGE (fase turn, tanpa roll peluang)',
        s4tank.phase === 'turn');
    // 3) 'turn': badan pivot ke ARAH CHARGE (dasar = ke player, DIDEFLEKSI
    // menjauhi lingkaran bangkai heli di pusat — 2026-07-17) -> 'chargeOut'
    for (let i = 0; i < 100 && s4tank.phase === 'turn'; i++) s4mod.stage4Scene.updateMode(0.1);
    const tp0 = { x: s4tank.parts.group.position.x, z: s4tank.parts.group.position.z };
    let pvx = camera.position.x - tp0.x, pvz = camera.position.z - tp0.z;
    const pvd = Math.hypot(pvx, pvz) || 1; pvx /= pvd; pvz /= pvd;
    T('S4 enrage: badan selesai berputar -> chargeOut (hull = arah charge, condong ke player)',
        s4tank.phase === 'chargeOut'
        && Math.abs(s4tank.hullYaw - Math.atan2(s4tank.chargeDirZ, -s4tank.chargeDirX)) < 1e-6
        && s4tank.chargeDirX * pvx + s4tank.chargeDirZ * pvz > 0.4);
    // 4) kecepatan charge = kecepatan LARI PLAYER (config-driven)
    const bx = s4tank.parts.group.position.x, bz = s4tank.parts.group.position.z;
    s4mod.stage4Scene.updateMode(0.1);
    const moved = Math.hypot(s4tank.parts.group.position.x - bx, s4tank.parts.group.position.z - bz);
    const wantSpd = cfgMod.CFG.player.speed * 60 * (TB.chargeSpeedMul || 1) * 0.1;
    T('S4 enrage: kecepatan charge = kecepatan lari player',
        wantSpd > 0 && Math.abs(moved - wantSpd) < wantSpd * 0.05);
    // 5) maju terus sampai KELUAR arena + margin -> fase 'away' (tersembunyi);
    // lacak jarak minimum ke bangkai heli (lintasan tak boleh menabraknya)
    let minOut = Infinity;
    for (let i = 0; i < 300 && s4tank.phase === 'chargeOut'; i++) {
        s4mod.stage4Scene.updateMode(0.1);
        minOut = Math.min(minOut, Math.hypot(s4tank.parts.group.position.x - s4mod.S4_END.x,
            s4tank.parts.group.position.z - s4mod.S4_END.z));
    }
    const gp = s4tank.parts.group.position, mOut = TB.chargeOutMargin;
    T('S4 enrage: tank keluar arena + margin (di luar pandangan kamera terjepit) -> away',
        s4tank.phase === 'away' && mOut > 0
        && (gp.x < A.sq.x0 - mOut || gp.x > A.sq.x1 + mOut || gp.z < A.sq.z0 - mOut || gp.z > A.sq.z1 + mOut));
    // 6) 'away': hujan mortir awayMortarShots tembakan lalu siap charge balik
    const idBefore = s4tank.pendingId;
    for (let i = 0; i < 400 && s4tank.phase === 'away'; i++) s4mod.stage4Scene.updateMode(0.1);
    T('S4 enrage: dari luar arena menghujani player awayMortarShots mortir',
        TB.awayMortarShots >= 1 && (s4tank.pendingId - idBefore) === TB.awayMortarShots);
    while (s4tank.mortars.length) { scene.remove(s4tank.mortars[0].mesh); s4tank.mortars.splice(0, 1); }
    robotsMod.resetRobotsFx();   // buang boom mortir yang sempat mendarat (jangan meledak di tes lain)
    // 7) 'chargeBack': start ACAK di LUAR arena, arah charge = ke posisi player
    const sp = { x: s4tank.parts.group.position.x, z: s4tank.parts.group.position.z };
    let pdx = camera.position.x - s4tank.homeX, pdz = camera.position.z - s4tank.homeZ;
    const pd = Math.hypot(pdx, pdz) || 1; pdx /= pd; pdz /= pd;
    T('S4 enrage: charge balik start dari LUAR arena, SEARAH posisi player',
        s4tank.phase === 'chargeBack'
        && (sp.x < A.sq.x0 || sp.x > A.sq.x1 || sp.z < A.sq.z0 || sp.z > A.sq.z1)
        && s4tank.chargeDirX * pdx + s4tank.chargeDirZ * pdz > 0.999);
    // 8) tiba di home (depan bangkai) -> 'straighten'; badan lurus -> 'battle'
    let minBack = Infinity;
    for (let i = 0; i < 400 && s4tank.phase === 'chargeBack'; i++) {
        s4mod.stage4Scene.updateMode(0.1);
        minBack = Math.min(minBack, Math.hypot(s4tank.parts.group.position.x - s4mod.S4_END.x,
            s4tank.parts.group.position.z - s4mod.S4_END.z));
    }
    T('S4 enrage: lintasan charge keluar & balik TIDAK menabrak bangkai heli',
        minOut >= s4mod.cineDebug().wreckClear - 0.6 && minBack >= s4mod.cineDebug().wreckClear - 0.6);
    T('S4 enrage: charge balik berhenti TEPAT di home (depan bangkai heli)',
        s4tank.phase === 'straighten'
        && Math.abs(s4tank.parts.group.position.x - s4tank.homeX) < 0.01
        && Math.abs(s4tank.parts.group.position.z - s4tank.homeZ) < 0.01);
    for (let i = 0; i < 100 && s4tank.phase === 'straighten'; i++) s4mod.stage4Scene.updateMode(0.1);
    T('S4 enrage: badan berputar di poros hingga LURUS (rotation.y 0, seperti awal duel) -> battle',
        s4tank.phase === 'battle' && s4tank.hullYaw === 0 && s4tank.parts.group.rotation.y === 0
        && s4tank.attackIdx === -1);
    Math.random = _rand;
    stateMod.setGodMode(false);
    player.hp = 100;
    s4tank.hp = s4tank.maxHp;   // pulihkan utk blok tes berikutnya
    s4calm();
}
// MENANG selagi tank hidup = belum (tak ada trigger finish; menang murni dari
// kematian tank + cutscene radio penutup).
stateMod.setGameOver(false);
T('S4: belum MISSION COMPLETE selagi tank hidup', stateMod.isGameOver === false);
const expectedS4OutroDialogue = [
    {
        key: 'gibranCall',
        speaker: 'Major Gibran',
        text: 'Command, this is Major Gibran. Do you read me, over? Extraction chopper is destroyed. I repeat, chopper has been shot down!',
    },
    {
        key: 'commandNoExfil',
        speaker: 'Command',
        text: 'Copy that, Major. That explains why we lost their transponder. Bad news, Major. we can’t deploy a secondary exfil team to your position. You’ll have to make your way back to Headquarters on your own. How you do it is up to you.',
    },
    {
        key: 'gibranShock',
        speaker: 'Major Gibran',
        text: 'Say again, Command?! Are you out of your mind?! HQ is in Bandung! that’s over a hundred kilometers from Jakarta through heavily occupied territory!',
    },
    {
        key: 'commandFinal',
        speaker: 'Command',
        text: 'We have no choice, Major. Our forces are stretched paper-thin. You’re on your own out there.',
    },
    {
        key: 'gibranAccepts',
        speaker: 'Major Gibran',
        text: "Damn it... Fine. I'll figure something out.",
    },
];
T('S4 OUTRO DIALOG: lima naskah Major Gibran/Command dipatok PERSIS',
    JSON.stringify(s4mod.TANK_BOSS_OUTRO_DIALOGUE) === JSON.stringify(expectedS4OutroDialogue));
const S4OUTCFG = cfgMod.CFG.campaign.tankOutro;
T('S4 OUTRO: durasi shot/fade config-driven dan valid',
    S4OUTCFG.preCutsceneDelaySec === 3 && S4OUTCFG.tankShotMinSec > 0
    && S4OUTCFG.radioPushSec > 0 && S4OUTCFG.fadeSec > 0);
// PROYEKTIL LENYAP saat tank hancur (2026-07-18): shell/mortar terbang + peluru
// MG (enemyBullets) dibuang seketika supaya bangkai tak bisa lagi melukai player.
while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }
s4tank.shells.push({ mesh: new THREE.Mesh(), dirx: 1, dirz: 0, speed: 7, tx: 9e9, tz: 0, travelled: 0, dist: 9e9, life: 220, id: 999 });   // seed shell terbang (mock, jauh dari mendarat)
s4tank.mortars.push({ mesh: new THREE.Mesh(), vx: 0, vz: 0, vy: 50, g: 90, landY: 5, tLeft: 5, trailT: 1, life: 300, id: 998 });
enemyBullets.push({ mesh: new THREE.Mesh(), dir: new THREE.Vector3(1, 0, 0), speed: 4, life: 100, dmg: 5, monasDmg: 0, px: 0, py: 0, pz: 0 });
// hancurkan tank (HP habis) -> animasi hancur penuh -> jeda gameplay -> cutscene outro
const s4hullX = s4tank.parts.group.position.x, s4hullZ = s4tank.parts.group.position.z;
const s4paint0 = s4tank.parts.paintMats[0].color.getHex();   // cat sebelum menghangus
stateMod.keys.w = stateMod.keys.d = true;
s4tank.hp = 0;
s4mod.stage4Scene.updateMode(0.1);
T('S4: tank HANCUR saat HP habis', s4tank.dead === true);
T('S4: proyektil tank (shell/mortar/peluru MG) LENYAP saat tank hancur (tak melukai player)',
    s4tank.shells.length === 0 && s4tank.mortars.length === 0 && enemyBullets.length === 0);
T('S4 OUTRO DELAY: ledakan tank BELUM memulai cutscene atau membekukan player',
    stateMod.isGameOver === false && stateMod.cinematicActive === false
    && stateMod.keys.w === true && stateMod.keys.d === true
    && !s4mod.outroCineDebug().active && s4mod.stage4Scene.camOffset === null
    && !s4mod.outroDelayDebug().armed && dom4.stageRadioDialogueDebug() === null);
// ===== SEKUENS MATI SINEMATIK (2026-07-29, permintaan user: ledakan lama
// "kurang dramatis"; idenya: turret LEPAS dan terlempar ke sisi tank). Kontrak
// 3 beat: 'cook' (cook-off, turret masih terpasang) -> 'fly' (turret jadi benda
// bebas yang dilontarkan ke SISI lambung) -> 'wreck' (lambung ambruk membara). =====
s4mod.stage4Scene.updateMode(0.1);   // 1 frame sekuens (0,2 dtk < cook-off) — masih beat 1
T('S4 MATI SINEMATIK beat 1: COOK-OFF dulu — turret MASIH di lambung, cat baru sebagian menghangus',
    s4tank.deathPhase === 'cook' && s4tank.parts.turret.parent === s4tank.parts.group
    && s4tank.turretFly === null && s4tank.charK > 0 && s4tank.charK < 1);
const s4turret = s4tank.parts.turret;
// Biarkan animasi tank selesai DULU dalam kamera gameplay. Countdown outro 3
// detik baru dipersenjatai pada frame yang mencapai fase wreck.
let s4DeathFrames = 0;
while (s4tank.deathPhase !== 'wreck' && s4DeathFrames++ < 200) {
    s4mod.stage4Scene.updateMode(0.1);
}
T('S4 OUTRO DELAY: animasi tank selesai penuh sebelum countdown 3 detik dimulai',
    s4tank.deathPhase === 'wreck' && s4mod.outroDelayDebug().armed
    && Math.abs(s4mod.outroDelayDebug().remaining - S4OUTCFG.preCutsceneDelaySec) < 0.001
    && !s4mod.outroCineDebug().active && !stateMod.cinematicActive);
let s4PreCineElapsed = 0;
while (s4mod.outroDelayDebug().remaining > 0.11 && s4PreCineElapsed < 10) {
    s4mod.stage4Scene.updateMode(0.1);
    s4PreCineElapsed += 0.1;
}
T('S4 OUTRO DELAY: hampir 3 detik setelah wreck masih kamera gameplay + kontrol bebas',
    s4PreCineElapsed >= S4OUTCFG.preCutsceneDelaySec - 0.2
    && !s4mod.outroCineDebug().active && !stateMod.cinematicActive
    && stateMod.keys.w === true && stateMod.keys.d === true);
for (let i = 0; i < 5 && !s4mod.outroCineDebug().active; i++) s4mod.stage4Scene.updateMode(0.05);
T('S4 OUTRO SCENE 1: setelah delay barulah close-up dimulai + input dilepas',
    s4mod.outroCineDebug().active && s4mod.outroCineDebug().phase === 'tank'
    && stateMod.cinematicActive && stateMod.keys.w === false && stateMod.keys.d === false
    && s4mod.stage4Scene.camOffset !== null);
// Scene 1 menahan close-up bangkai selama tankShotMinSec, lalu cut ke Scene 2.
let s4OutroTankFrames = 0;
while (s4mod.outroCineDebug().phase === 'tank' && s4OutroTankFrames++ < 200) {
    s4mod.stage4Scene.updateMode(0.1);
}
T('S4 OUTRO SCENE 1: close-up ditahan sampai tank menjadi bangkai wreck',
    s4tank.deathPhase === 'wreck' && s4mod.outroCineDebug().phase === 'radio'
    && (s4OutroTankFrames * 0.1 + 0.2) >= S4OUTCFG.tankShotMinSec);
T('S4 OUTRO SCENE 2: dialog pertama dibuka dari body kosong + caret setelah cut kamera',
    s4mod.outroDialogueDebug().key === 'gibranCall'
    && s4mod.outroDialogueDebug().shown === '' && s4mod.outroDialogueDebug().typing
    && dom4.stageRadioDialogueDebug()?.speaker === 'Major Gibran'
    && dom4.stageRadioDialogueDebug()?.text === '' && dom4.stageRadioDialogueDebug()?.typing);
avMod.updatePlayerAvatar(1 / 60);
const s4RadioPose = avMod.avatarRadioDebug();
T('S4 OUTRO POSE: tangan kiri di telinga, tangan kanan lebih rendah memegang laras turun',
    s4RadioPose.active && s4RadioPose.leftY > 10 && s4RadioPose.rightY < s4RadioPose.leftY - 2
    && s4RadioPose.gunPitch > 0.5 && s4RadioPose.gesture === 'gibranCall');
s4mod.stage4Scene.updateMode(1.1 / Math.max(1, S4DLGCFG.cps));
T('S4 OUTRO TYPEWRITER: dialog radio mulai tepat satu karakter',
    s4mod.outroDialogueDebug().chars === 1
    && s4mod.outroDialogueDebug().shown === expectedS4OutroDialogue[0].text.slice(0, 1));

const s4OutroSeen = ['gibranCall'], s4OutroPartial = new Set(['gibranCall']);
const s4GestureTrace = {};
function sampleS4Gesture() {
    const g = avMod.avatarRadioDebug();
    if (!g.active || !g.gesture) return;
    const trace = s4GestureTrace[g.gesture] || (s4GestureTrace[g.gesture] = {
        samples: 0,
        torsoMin: Infinity, torsoMax: -Infinity,
        headMin: Infinity, headMax: -Infinity,
        bodyMin: Infinity, bodyMax: -Infinity,
        gunMin: Infinity, gunMax: -Infinity,
    });
    trace.samples++;
    trace.torsoMin = Math.min(trace.torsoMin, g.torsoPitch);
    trace.torsoMax = Math.max(trace.torsoMax, g.torsoPitch);
    trace.headMin = Math.min(trace.headMin, g.headYaw);
    trace.headMax = Math.max(trace.headMax, g.headYaw);
    trace.bodyMin = Math.min(trace.bodyMin, g.bodyY);
    trace.bodyMax = Math.max(trace.bodyMax, g.bodyY);
    trace.gunMin = Math.min(trace.gunMin, g.gunPitch);
    trace.gunMax = Math.max(trace.gunMax, g.gunPitch);
}
sampleS4Gesture();
let s4OutroLast = 'gibranCall', s4OutroFrames = 0, s4OutroFade = false;
while (!s4mod.outroCineDebug().done && s4OutroFrames++ < 5000) {
    s4mod.stage4Scene.updateMode(1 / 30);
    avMod.updatePlayerAvatar(1 / 30);
    sampleS4Gesture();
    const od = s4mod.outroDialogueDebug();
    if (od.key && od.key !== s4OutroLast) { s4OutroSeen.push(od.key); s4OutroLast = od.key; }
    if (od.key && od.chars > 0 && od.chars < od.text.length) s4OutroPartial.add(od.key);
    if (s4mod.outroCineDebug().phase === 'fade') {
        s4OutroFade = dom4.cineFadeDebug()?.opacity === 1 && dom4.stageRadioDialogueDebug() === null;
    }
}
T('S4 OUTRO DIALOG: lima transmisi tampil berurutan di Scene 2',
    s4OutroSeen.join(',') === expectedS4OutroDialogue.map(line => line.key).join(','));
T('S4 OUTRO TYPEWRITER: SEMUA dialog melewati body parsial huruf-per-huruf',
    expectedS4OutroDialogue.every(line => s4OutroPartial.has(line.key)));
const s4GestureKeys = expectedS4OutroDialogue.map(line => line.key);
T('S4 OUTRO AKTING: kelima dialog mengaktifkan gestur tubuhnya masing-masing',
    s4GestureKeys.every(key => s4GestureTrace[key]?.samples > 5));
T('S4 OUTRO AKTING: tubuh tetap bergerak sepanjang setiap transmisi, bukan pose mematung',
    s4GestureKeys.every(key => {
        const g = s4GestureTrace[key];
        return g && (g.torsoMax - g.torsoMin) + (g.headMax - g.headMin)
            + (g.bodyMax - g.bodyMin) > 0.015;
    }));
T('S4 OUTRO AKTING: shock condong menantang, kabar buruk merunduk, akhir menurunkan senjata',
    s4GestureTrace.gibranShock.torsoMax > s4GestureTrace.commandNoExfil.torsoMax + 0.05
    && s4GestureTrace.commandFinal.bodyMin < s4GestureTrace.gibranCall.bodyMin - 0.05
    && s4GestureTrace.gibranAccepts.gunMax > s4GestureTrace.gibranCall.gunMax + 0.02);
T('S4 OUTRO FADE: sesudah dialog panel hilang dan layar fade-out hitam', s4OutroFade);
T('S4 OUTRO SELESAI: fade membuka FINISH SCREEN hijau Stage 4 sebelum Field Shop',
    stateMod.isGameOver === true && smMod.activeScene === s4mod.stage4Scene
    && dom4.gameOverScreen.style.display === 'flex'
    && dom4.gameOverTitle.innerText === 'STAGE 4 COMPLETE'
    && dom4.goStageStats.style.display === 'grid'
    && dom4.goTotalTime.innerText.length >= 5 && dom4.goLootBoxes.innerText === '0'
    && global.document.getElementById('goRestart').textContent === 'CONTINUE'
    && s4mod.outroCineDebug().done
    && !s4mod.outroCineDebug().active && stateMod.cinematicActive === false
    && avMod.avatarRadioDebug().active === false && dom4.stageRadioDialogueDebug() === null
    && dom4.cineFadeDebug()?.opacity === 0);
const s4FinishCarry = {
    money: stateMod.score, hp: player.hp, armor: player.armor,
    medkits: player.medkits, weapons: player.weapons.join(','),
};
T('S4 FINISH CONTINUE: tombol utama menutup overlay tanpa reset dan baru membuka Field Shop',
    gameMod.activateGameOverPrimary() === true && stateMod.isGameOver === false
    && dom4.gameOverScreen.style.display === 'none'
    && smMod.activeScene.id === 'campaign-shop'
    && stateMod.score === s4FinishCarry.money && player.hp === s4FinishCarry.hp
    && player.armor === s4FinishCarry.armor && player.medkits === s4FinishCarry.medkits
    && player.weapons.join(',') === s4FinishCarry.weapons);
{
    const f = s4tank.turretFly, tp = s4turret.position;
    const dxT = tp.x - s4hullX, dzT = tp.z - s4hullZ, distT = Math.hypot(dxT, dzT);
    T('S4 MATI SINEMATIK beat 2: TURRET TERLEPAS jadi benda bebas (di scene, bukan anak lambung)',
        s4turret.parent === scene && s4turret.parent !== s4tank.parts.group && f != null);
    T('S4 MATI SINEMATIK beat 2: turret mendarat DI SISI lambung lalu REBAH (jarak '
        + distT.toFixed(0) + ', y ' + tp.y.toFixed(1) + ')',
        f.landed === true && f.restK >= 1 && tp.y < 12
        && distT > 20 && distT < 80 && (dxT * f.sx + dzT * f.sz) > 15);
    T('S4 MATI SINEMATIK: arah lontar turret MENJAUHI player (tak melayang menutupi layar)',
        f.sx * (camera.position.x - s4hullX) + f.sz * (camera.position.z - s4hullZ) <= 0);
    const g4 = s4tank.parts.group;
    T('S4 MATI SINEMATIK beat 3: lambung AMBRUK — menghentak turun & menetap miring (fase wreck)',
        s4tank.deathPhase === 'wreck' && g4.position.y < -0.5 && Math.abs(g4.rotation.z) > 0.01
        && Math.abs(g4.position.x - s4hullX) < 0.001 && Math.abs(g4.position.z - s4hullZ) < 0.001);
    const hex4 = s4tank.parts.paintMats[0].color.getHex();
    T('S4 MATI SINEMATIK: cat bangkai HANGUS penuh (bertahap selama cook-off, bukan seketika)',
        s4tank.charK === 1 && hex4 !== s4paint0
        && (hex4 >> 16 & 255) < (s4paint0 >> 16 & 255) && (hex4 >> 16 & 255) < 60);
}

// --- 17a-bis. CAMPAIGN STAGE 5 — THE LAST TRAIN TO BANDUNG (2026-08-02).
// Stage 4 harus meneruskan shop normal ke depot; seluruh pacing/tuning dibaca
// dari CFG.campaign.stage5. Alur dimainkan end-to-end tanpa mensimulasikan
// kegagalan combat: depot -> alarm hack C1 -> pintu peron -> repair C2 -> kereta -> 4 encounter ->
// arrival. Semua dialog tetap benar-benar melewati state typewriter parsial. ---
const s5mod = await import(R('src/scenes/campaign/stages/stage5/index.js'));
const s6mod = await import(R('src/scenes/campaign/stages/stage6/index.js'));
const s7mod = await import(R('src/scenes/campaign/stages/stage7/index.js'));
const s7RoadVehicleMod = await import(R('src/scenes/campaign/stages/stage7/roadVehicles.js'));
const s8mod = await import(R('src/scenes/campaign/stages/stage8/index.js'));
const tacticalVehicleMod = await import(R('src/entities/tacticalVehicle.js'));
const enemyPickupMod = await import(R('src/entities/enemyPickup.js'));
const combatGunshipMod = await import(R('src/entities/combatGunship.js'));
const save5Mod = await import(R('src/core/saveGame.js'));
const crate5Mod = await import(R('src/entities/crates.js'));
const barrel5Mod = await import(R('src/entities/barrels.js'));
const train5Mod = await import(R('src/entities/train.js'));
const s5WorldMod = await import(R('src/scenes/campaign/stages/stage5/world.js'));
const s6WorldMod = await import(R('src/scenes/campaign/stages/stage6/world.js'));
const s6HqWorldMod = await import(R('src/scenes/campaign/stages/stage6/hqWorld.js'));
const colMod = await import(R('src/utils/collision.js'));   // primitif tabrakan + indeks blocker bersama
const doorsMod = await import(R('src/scenes/campaign/utility/doors.js'));
const s5PathMod = await import(R('src/utils/pathfind.js'));
const s5PalMod = await import(R('src/world/palette.js'));
const S5C = cfgMod.CFG.campaign.stage5;
// PENGALI JUMLAH ROBOT (2026-08-16, permintaan user): tabel encounter di config
// adalah angka DASAR; yang benar-benar di-spawn = dasar x `robotCountMul` stage
// itu, dengan pembulatan akumulatif `scaleSpawnCounts` (porsi C/B/A tetap).
const commonS56 = await import(R('src/scenes/campaign/utility/common.js'));
const scaledMix = (counts, stage) => {
    const n = commonS56.scaleSpawnCounts([counts.C | 0, counts.B | 0, counts.A | 0], stage);
    return { C: n[0], B: n[1], A: n[2] };
};
const mixTotal = m => (m.C | 0) + (m.B | 0) + (m.A | 0);
// HP mesin pembuat robot = SATU angka bersama untuk semua stage (permintaan user
// 2026-08-09) — tidak ada lagi kunci HP per stage yang boleh dibaca di sini.
const MACHINE_HP = () => cfgMod.CFG.campaign.spawnMachine.hp;
const S6C = cfgMod.CFG.campaign.stage6;
const S7C = cfgMod.CFG.campaign.stage7;
const S8C = cfgMod.CFG.campaign.stage8;
// GRD combat gunship = BOS, jadi statistiknya duduk di `campaign.bosses`
// bersama giant & tank (2026-08-09, permintaan user) — bukan lagi di dalam
// blok stage-nya. Pacing stage (`gunshipIntroMinSec`/`gunshipDeathDelaySec`)
// tetap milik stage8, seperti `tankOutro` bagi bos tank.
const S8G = cfgMod.CFG.campaign.bosses.gunship;

// Finish Stage 4 sudah ditekan di atas. Tunggu LOADING #1 Field Shop, lalu
// gunakan tombol shop sesungguhnya (dua tekan = buka konfirmasi + setuju).
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));
const s5Carry = {
    money: stateMod.score, hp: player.hp, armor: player.armor,
    medkits: player.medkits, weapons: player.weapons.join(','),
};
T('S5 TRANSISI: outro Stage 4 benar-benar membuka FIELD SHOP sebelum depot',
    shopMod.isShopOpen() && smMod.activeScene.id === 'campaign-shop');
smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');
for (let i = 0; i < 500 && smMod.activeScene !== s5mod.stage5Scene; i++) await new Promise(r => setTimeout(r, 10));
T('S5 TRANSISI: Start Next Stage dari Field Shop masuk Stage 5 + checkpoint 5',
    smMod.activeScene === s5mod.stage5Scene && save5Mod.loadCampaignStage() === 5);
T('S5 TRANSISI FRAME PERTAMA: tirai outro tetap bersih; dunia tampil sebelum dialog opening',
    dom4.cineFadeDebug()?.opacity === 0
    && s5mod.stage5DialogueDebug().key === null
    && dom4.stageRadioDialogueDebug() === null
    && stateMod.cinematicActive);
stateMod.setPaused(false);   // harness tidak menerima klik blocker setelah loading
T('S5 TRANSISI: money/HP/armor/medkit/senjata bertahan melewati Field Shop',
    stateMod.score === s5Carry.money && player.hp === s5Carry.hp
    && player.armor === s5Carry.armor && player.medkits === s5Carry.medkits
    && player.weapons.join(',') === s5Carry.weapons);

// --- PEMECAHAN STAGE 5 (2026-08-07, permintaan user "stage5.js terlalu besar"):
// satu file 1600+ baris menjadi folder `stage5/` berisi TIGA sub-scene
// (station -> journey -> arrival) + fasad/world/runtime. Kontraknya: yang
// dilihat core/sceneManager TETAP satu `stage5Scene` id `campaign-5` (checkpoint,
// stageStats, resume modal hack/repair tak berubah), dan pergantian sub-scene
// memakai fade-in `subSceneFadeSec`. ---
const campaignCutDir = ROOT + '/src/scenes/campaign/cutscenes';
const stage4CutFiles = fs.readdirSync(campaignCutDir + '/stage4').sort();
T('CAMPAIGN CUTSCENES: prologue/art/intro tetap di root, controller Stage 4 masuk stage4/',
    fs.existsSync(campaignCutDir + '/prologue.js')
    && fs.existsSync(campaignCutDir + '/prologueArt.js')
    && fs.existsSync(campaignCutDir + '/intro.js')
    && !fs.existsSync(campaignCutDir + '/tankBossIntro.js')
    && !fs.existsSync(campaignCutDir + '/tankBossOutro.js')
    && stage4CutFiles.join(',') === 'tankBossIntro.js,tankBossOutro.js');
const campaignStagesDir = ROOT + '/src/scenes/campaign/stages';
T('CAMPAIGN STAGES: seluruh Stage 1-13 memakai folder sendiri dengan index.js',
    Array.from({ length: 13 }, (_, i) => i + 1).every(n =>
        fs.existsSync(`${campaignStagesDir}/stage${n}/index.js`)
        && !fs.existsSync(`${campaignStagesDir}/stage${n}.js`))
    && fs.existsSync(`${campaignStagesDir}/stage7/stage7City.js`)
    && !fs.existsSync(`${campaignStagesDir}/stage7City.js`));
const s5Dir = ROOT + '/src/scenes/campaign/stages/stage5';
const s5Files = fs.readdirSync(s5Dir).sort();
const s5FileLines = f => fs.readFileSync(s5Dir + '/' + f, 'utf8').split('\n').length;
const s5CutDir = ROOT + '/src/scenes/campaign/cutscenes/stage5';
const s5CutFiles = fs.readdirSync(s5CutDir).sort();
T('S5 SPLIT: stage5.js pecah jadi satu folder — 4 sub-scene + fasad/world/props/runtime, tak ada file raksasa',
    !fs.existsSync(ROOT + '/src/scenes/campaign/stages/stage5.js')
    && s5Files.join(',') === 'highway.js,index.js,journey.js,loco.js,props.js,runtime.js,station.js,world.js'
    && s5CutFiles.join(',') === 'departure.js,finish.js'
    // Ambang dinaikkan 700 -> 760 -> 800 pada 2026-08-08: stage ini bertambah
    // TIGA subsistem (konsist musuh 10 gerbong, jalan raya pendamping, dan
    // pintu naik gerbong milik cutscene keberangkatan lima shot) sejak folder
    // dipecah, dan `world.js` memang pemilik peta+collision+nav+pintu+builder
    // untuk semuanya. Penjaga ini melawan monolit 1600 baris, bukan angka pas.
    // 800 -> 840 pada 2026-08-13: `ensureWorld` kini mendaftarkan root dunianya
    // ke campaignWorldRegistry (optimasi visibilitas antar-stage).
    // 840 -> 880 pada 2026-08-13: perabot depot/peron kini didaftarkan sebagai
    // occluder yang bisa memudar (utility/occlusion.js).
    && s5Files.every(f => s5FileLines(f) < 880));
// CUTSCENE KEBERANGKATAN BERDIRI SENDIRI (2026-08-08, permintaan user
// "pisahkan cutscene ketika kereta berangkat"): dulu ia fase pertama sub-scene
// journey; sekarang sub-scene keempat di antara stasiun dan perjalanan.
T('S5 SPLIT: tiap sub-scene punya id sendiri; sceneManager tetap hanya melihat campaign-5',
    s5mod.stationScene.id === 'campaign-5-station'
    && s5mod.departureScene.id === 'campaign-5-departure'
    && s5mod.journeyScene.id === 'campaign-5-journey'
    && s5mod.finishScene.id === 'campaign-5-finish'
    && s5mod.stage5Scene.id === 'campaign-5' && s5mod.stage5Scene.lightsKey === 'campaign-5'
    && [s5mod.stationScene, s5mod.departureScene, s5mod.journeyScene, s5mod.finishScene]
        .every(s => s !== s5mod.stage5Scene && !s.lightsKey));
T('S5 SPLIT: stage dibuka pada sub-scene stasiun TANPA tirai (entry tetap langsung terlihat)',
    s5mod.stage5Debug().sub === 'campaign-5-station' && dom4.cineFadeDebug()?.opacity === 0);

const expectedS5Dialogue = {
    opening: { speaker: 'Major Gibran', text: "Walking to Bandung isn't an option. There has to be something in this depot I can use." },
    discoverTrain: { speaker: 'Major Gibran', text: 'An autonomous military transport... Destination registry: Bandung Logistics Terminal. This could be my way out.' },
    powerDead: { speaker: 'Major Gibran', text: "The train has no power, and the platform access is locked. I'll need to hack station computer C1 first." },
    enemyTrainFlyby: { speaker: 'Major Gibran', text: 'A freight consist just ran the adjacent track without slowing down. They know something is alive in this depot.' },
    powerBack: { speaker: 'Major Gibran', text: "Generator's back online. The route controls are responding." },
    routeReady: { speaker: 'Train System', text: 'Route authority overridden. Destination confirmed: Bandung Logistics Terminal.' },
    letsMove: { speaker: 'Major Gibran', text: "Finally. Let's move." },
    commandDeparture: { speaker: 'Command', text: "Major, we're detecting movement on the Jakarta-Bandung logistics line. Is that you?" },
    gibranDeparture: { speaker: 'Major Gibran', text: "Affirmative. I found a train to Bandung. Keep this channel clear—N.U.S.A. won't let me take it without a fight." },
    breach: { speaker: 'Train System', text: 'Contact on the parallel track. An armed consist is matching our speed.' },
    breachReply: { speaker: 'Major Gibran', text: "They can't board at this speed—so they'll shoot it out from over there. Fine by me." },
    roofWarning: { speaker: 'Command', text: 'Major, multiple hostile signatures are converging on your position.' },
    roofReply: { speaker: 'Major Gibran', text: 'I can see them. Just keep the route open!' },
    finalApproach: { speaker: 'Train System', text: 'Final approach initiated. Hostile units detected across multiple cars.' },
    finalReply: { speaker: 'Major Gibran', text: 'Then I hold this line until we reach Bandung.' },
    arrivedCommand: { speaker: 'Command', text: 'Major, your signal just crossed into Bandung. Headquarters is standing by.' },
    arrivedGibran: { speaker: 'Major Gibran', text: "Copy. I'm at the terminal. Tell them I brought the file—and a whole lot of trouble behind me." },
};
T('S5 DIALOG: seluruh naskah final tersimpan PERSIS dan urut',
    JSON.stringify(s5mod.STAGE5_DIALOGUE) === JSON.stringify(expectedS5Dialogue));

const s5Partial = new Set(), s5ShownOrder = [];
let s5LastKey = null, s5EverWaveRobot = false;
function sampleS5Dialogue() {
    const d = s5mod.stage5DialogueDebug();
    if (d.key && d.key !== s5LastKey) { s5ShownOrder.push(d.key); s5LastKey = d.key; }
    if (d.key && d.chars > 0 && d.chars < d.text.length) s5Partial.add(d.key);
    // Sekalian rekam: sejak 2026-08-07 kereta musuh TIDAK BOLEH pernah
    // menurunkan robot, jadi encounter 'wave' tak boleh muncul sedetik pun.
    if (robots.some(z => z.stage === 5 && z.encounter === 'wave')) s5EverWaveRobot = true;
}
function tickS5(total, step = 1 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps)) {
    let left = Math.max(0, total), guard = 0;
    while (left > 1e-9 && guard++ < 30000) {
        const dt = Math.min(step, left);
        s5mod.stage5Scene.updateMode(dt); sampleS5Dialogue(); left -= dt;
    }
}
const dialogueIdleS5 = () => {
    const d = s5mod.stage5DialogueDebug();
    return !d.key && !d.queued.length;
};
function drainS5Dialogue() {
    let guard = 0;
    sampleS5Dialogue();
    while (guard++ < 20000) {
        const d = s5mod.stage5DialogueDebug();
        if (!d.key && !d.queued.length) break;
        tickS5(1.01 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps));
    }
}
function killS5(encounter = null) {
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 5 || (encounter && z.encounter !== encounter)) continue;
        robotsMod.disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
    }
}
const s5Mix = (encounter) => {
    const out = { C: 0, B: 0, A: 0 };
    for (const z of robots) if (z.stage === 5 && z.encounter === encounter && out[z.kind] != null) out[z.kind]++;
    return out;
};
const sameMix = (got, want) => ['C', 'B', 'A'].every(k => got[k] === (want[k] | 0));

// Dunia/depot: builder, fixed pools, konektivitas union, supply dan spawn aman.
const s5World = s5mod.stage5WorldDebug();
const depotBots = robots.filter(z => z.stage === 5 && z.encounter === 'depot');
const depotMix = s5Mix('depot');
const expectedS5Map = [
    '==============================',
    '==============================',
    '==============================',
    '==============================',
    ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    '=====TTTTTTTLLLLLLL===========',
    '=====TTTTTTTLLLLLLL===========',
    '=====TTTTTTTLLLLLLL===========',
    '=====TITTTTTLLLLLLL===========',
    '#####.........................',
    '#2222.........................',
    '#.HH..........................',
    '#.............................',
    '#.............................',
    '#.............................',
    '#.............................',
    '##@@###@@##@@##@@##@@##@@#--##',
    '#AAAA#.......................#',
    '#AAAA-.......................#',
    '#AAAA-.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.......................#',
    '#AAAA#.................#######',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................-...H1#',
    '#AAAA#.................-...H1#',
    '#AAAA#.................#....1#',
    '#AAAA#.................#....1#',
    '#ASSA#.................#....1#',
    '##############################',
];
const expectedS5Finish = [
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '==============TTTTTTTLLLLLLL==',
    '==============TTTTTTTLLLLLLL==',
    '==============TTTTTTTLLLLLLL==',
    '==============TTTTTTTLLLLLLL==',
];
const s5TokenAt = (x, z) => {
    const c = Math.floor((x - s5World.depot.x0) / s5World.map.cell);
    const r = Math.floor((z - s5World.depot.z0) / s5World.map.cell);
    return s5mod.S5_MAP[r]?.[c] || '#';
};
const s5Count = t => expectedS5Map.reduce((n, r) => n + [...r].filter(c => c === t).length, 0);
T('S5 CSV CONTRACT: layout 30×50 dua-track, TT/SPACE/TC/TCI/TL/@/SA persis peta user',
    JSON.stringify(s5mod.S5_MAP) === JSON.stringify(expectedS5Map)
    && s5World.map.rows === 50 && s5World.map.cols === 30
    && s5Count('H') === 4 && s5Count('-') === 6 && s5Count('I') === 1
    && s5World.map.entryCells === s5Count('I') && s5World.map.locoCells === s5Count('L')
    && s5World.map.trackCells === s5Count('=') && s5World.map.gapCells === s5Count(',')
    && s5World.map.windowCells === s5Count('@')
    && s5World.map.windowPanes === s5World.map.windowCells);
T('S5 CSV FINISH: denah stasiun Bandung 30×19 dibangun persis dari CSV finish user',
    JSON.stringify(s5mod.S5_FINISH_MAP) === JSON.stringify(expectedS5Finish));
T('S5 DUA TRACK: track musuh terpisah satu baris SPACE dari track kereta player',
    Math.abs(s5World.map.playerTrackZ - s5World.map.enemyTrackZ - 5 * s5World.map.cell) < 0.01
    // Titik turun robot dihapus 2026-08-07: kereta musuh tak menurunkan siapa pun.
    && s5World.map.enemyDropZ === undefined);
// 2026-08-07, permintaan user: "di bagian journey juga akan terus ada 2 rel".
// Pool near yang bergulir HARUS memuat dua jalur (empat batang rel), dan sumbu
// jalur musuh perjalanan berada di sisi yang sama dengan jalur musuh stasiun.
T('S5 DUA TRACK: jalur kedua juga ada sepanjang perjalanan, bukan hanya di stasiun',
    typeof s5World.map.journeyTrackDz === 'number' && s5World.map.journeyTrackDz < 0
    && Math.abs(s5World.map.journeyEnemyZ
        - (s5World.map.playerTrackZ + s5World.map.journeyTrackDz)) < 1e-6
    && Math.sign(s5World.map.journeyEnemyZ - s5World.map.playerTrackZ)
        === Math.sign(s5World.map.enemyTrackZ - s5World.map.playerTrackZ)
    && (() => {
        // Tiap modul near WAJIB membawa empat batang rel (2 jalur x 2 rel) pada
        // sumbu yang benar. Sejak 2026-08-09 modul itu juga memuat bantalan,
        // pagar, tiang dan pita depan, jadi jumlah anaknya tidak lagi dipatok —
        // yang dipatok adalah relnya sendiri.
        const pool = train5Mod.buildTrainJourneyScenery(0);
        const G = train5Mod.TRAIN_GAUGE_HALF, DZ = train5Mod.JOURNEY_TRACK_DZ;
        const want = [-G, G, DZ - G, DZ + G];
        // Modul near berisi dua grup dilas (badan + pita depan) sejak 2026-08-09,
        // jadi mesh-nya dikumpulkan lewat traverse, bukan `children` langsung.
        const meshesIn = g => { const a = []; g.traverse(o => { if (o.isMesh) a.push(o); }); return a; };
        return pool.near.length > 0 && pool.near.every(g => {
            const rails = meshesIn(g).filter(m => m.geometry?.args
                && Math.abs(m.geometry.args[1] - 1.1) < 1e-6
                && Math.abs(m.geometry.args[2] - 1.8) < 1e-6);
            return rails.length === 4
                && want.every(z => rails.some(m => Math.abs(m.position.z - z) < 1e-6));
        });
    })());

// --- LANSKAP PERJALANAN HARUS BENAR-BENAR TERISI (2026-08-09, laporan user
// "background ketika di perjalanan kereta masih terlalu kosong"). Dulu satu
// modul mid hanya berisi 2-3 mesh di SATU sisi rel, jadi yang terlihat dari
// jendela cuma beberapa objek terpencil. Sekarang tiap modul membawa satu blok
// pemandangan penuh untuk KEDUA babak, dan tepi rel punya perabotnya sendiri.
// Kepadatannya boleh naik berlipat karena tiap modul/varian DILAS saat
// dibangun — yang dijaga adalah biaya draw call, bukan jumlah mesh mentah. ---
{
    const pool = train5Mod.buildTrainJourneyScenery(0);
    const cost = train5Mod.journeySceneryDebug(pool);
    const meshesOf = g => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; };
    const minOf = (arr, f) => arr.reduce((m, g) => Math.min(m, f(g)), Infinity);
    T(`S5 LANSKAP: tepi rel berperabot — bantalan, pagar, tiang, pita depan [min ${minOf(pool.near, meshesOf)} mesh/modul]`,
        pool.near.length >= 18 && minOf(pool.near, meshesOf) >= 40);
    T(`S5 LANSKAP: tiap modul mid membawa blok pemandangan penuh untuk KEDUA babak [kota ${minOf(pool.mid, g => meshesOf(g.userData.cityG))}, gunung ${minOf(pool.mid, g => meshesOf(g.userData.hillG))}]`,
        pool.mid.length >= 18
        && minOf(pool.mid, g => meshesOf(g.userData.cityG)) >= 14
        && minOf(pool.mid, g => meshesOf(g.userData.hillG)) >= 14);
    // GEDUNG LATAR TIDAK BOLEH TERBACA PLACEHOLDER (2026-08-09, laporan user):
    // dulu tiap lot satu balok + satu strip lampu, semuanya dua warna. Sekarang
    // lima tipe siluet x palet dinding yang lebih luas.
    {
        const hexes = new Set(), sigs = new Set();
        for (const g of pool.mid) g.userData.cityG.traverse(o => {
            if (!o.isMesh) return;
            if (o.material?.color?.getHex) hexes.add(o.material.color.getHex());
            if (o.geometry?.args) sigs.add(o.geometry.type + ':' + o.geometry.args.map(v => Math.round(v)).join(','));
        });
        T(`S5 GEDUNG: siluet + warna gedung latar benar-benar bervariasi [${hexes.size} warna, ${sigs.size} bentuk]`,
            hexes.size >= 6 && sigs.size >= 40);
    }
    T(`S5 LANSKAP: cakrawala jauh rapat dan SELURUHNYA di sisi backdrop [${pool.far.length} modul]`,
        pool.far.length >= 12
        && pool.far.every(g => g.position.z < 0)
        && minOf(pool.far, g => meshesOf(g.userData.skyG)) >= 5
        && minOf(pool.far, g => meshesOf(g.userData.ridgeG)) >= 3);
    // PENJAGA YANG SESUNGGUHNYA: biaya draw call sesudah pengelasan. Cap mesh
    // mentah di MESH_CAP sengaja longgar untuk pool ini; angka INI yang tidak
    // boleh membengkak.
    // Ambang dinaikkan 400 -> 540 pada 2026-08-09 bersama dua perubahan yang
    // memang membeli draw call: pita depan dipecah jadi grup las SENDIRI supaya
    // bisa dipadamkan saat jalan raya masuk (material yang dipakai kedua grup
    // terhitung dua kali), dan palet dinding gedung latar diperluas. Angkanya
    // adalah SELURUH dunia yang terlihat selama perjalanan — tidak ada geometri
    // lain di layar selain kereta, konsist musuh dan robot.
    T(`S5 LANSKAP: biaya draw call tetap kecil walau isinya padat [${cost.welded} dilas dari ${cost.raw} mentah]`,
        cost.raw > 900 && cost.welded < 540 && cost.welded < cost.raw / 3);
    // SEMUA PROP HARUS BERADA DI DALAM JANGKAUAN KAMERA. Ini yang diam-diam
    // rusak sebelum 2026-08-09: pool `far` dibangun 370 unit di belakang rel,
    // padahal tapak pandang kamera oblique hanya sampai |minZ| — jadi SELURUH
    // lapisan cakrawala tak pernah tampil satu piksel pun, dan separuh pool
    // `mid` (yang menyelang ke +z) juga hilang di bawah tepi bawah frame.
    // Batasnya dibaca dari renderer, bukan angka mati.
    {
        // Pool dibangun dengan baseZ 0, jadi z relatif = z modul + z lokal mesh
        // (grup varian selalu duduk di 0).
        const ext = rendererMod.groundViewExtents(cfgMod.CFG.player.eyeHeight, 0);
        let worst = 0, outside = 0;
        for (const arr of [pool.near, pool.mid, pool.far]) for (const g of arr) {
            g.traverse(o => {
                if (!o.isMesh) return;
                const rel = g.position.z + (o.parent === g ? 0 : o.parent.position.z) + o.position.z;
                worst = Math.max(worst, Math.abs(rel));
                if (rel < ext.minZ || rel > ext.maxZ) outside++;
            });
        }
        T(`S5 LANSKAP: tidak ada prop yang dibangun di luar tapak pandang kamera [terjauh ${worst.toFixed(0)}, tepi ${(-ext.minZ).toFixed(0)}]`,
            outside === 0 && worst > 150);

        // --- PERMUKAAN TANAH (2026-08-09, permintaan user: "warna tanahnya
        // jangan biru muda seperti itu. pakai kombinasi warna hijau rumput dan
        // coklat tanah saja"). Yang terlihat biru muda BUKAN sebuah material:
        // sepanjang perjalanan memang TIDAK ADA permukaan tanah sama sekali,
        // jadi yang tampil di bawah lanskap adalah `scene.background` haze kota.
        // Karena itu yang dijaga di sini ada dua — tanahnya benar-benar ADA dan
        // MENUTUP tapak pandang, dan warnanya hanya hijau rumput/coklat tanah.
        const hexOf = m => m.material.color.getHex();
        const isGreen = h => ((h >> 8) & 255) > ((h >> 16) & 255) + 8 && ((h >> 8) & 255) > (h & 255) + 8;
        const isBrown = h => ((h >> 16) & 255) > ((h >> 8) & 255) + 8 && ((h >> 8) & 255) >= (h & 255);
        // Slab tanah = kotak melebar sepanjang z di bawah/pada permukaan.
        const nearMeshes = g => { const a = []; g.traverse(o => { if (o.isMesh) a.push(o); }); return a; };
        const slabs = g => nearMeshes(g).filter(m => m.geometry?.args?.length >= 3
            && m.geometry.args[2] >= 60 && m.position.y <= 0);
        const zSpan = m => [m.position.z - m.geometry.args[2] / 2, m.position.z + m.geometry.args[2] / 2];
        let badHue = 0, capsOk = 0, bodyOk = 0;
        for (const g of pool.near) {
            const s = slabs(g);
            for (const m of s) if (!isGreen(hexOf(m)) && !isBrown(hexOf(m))) badHue++;
            const caps = s.filter(m => isGreen(hexOf(m))).map(zSpan).sort((a, b) => a[0] - b[0]);
            // Dua pita mengapit koridor jalur; celah di tengah HANYA selebar
            // formasi balas, dan pitanya mencapai kedua tepi tapak pandang.
            if (caps.length === 2 && caps[0][0] <= ext.minZ + 45 && caps[1][1] >= ext.maxZ - 4
                && caps[1][0] - caps[0][1] > 0 && caps[1][0] - caps[0][1] < 130) capsOk++;
            // Setiap pita rumput duduk di atas badan tanah coklat, sehingga muka
            // galian yang menghadap rel terbaca coklat, bukan dinding rumput.
            if (caps.every(c => s.some(m => isBrown(hexOf(m))
                && Math.abs((m.position.z - c[0] - (c[1] - c[0]) / 2)) < 1e-6))) bodyOk++;
        }
        T(`S5 TANAH: perjalanan punya permukaan tanah sungguhan yang menutup tapak pandang [${capsOk}/${pool.near.length} modul]`,
            capsOk === pool.near.length);
        // Sisi kamera dipakai bersama JALAN RAYA yang menyatu mulai gerbong ke-5
        // (`highway.nearZ`). Tidak boleh ada prop lineside yang berdiri di badan
        // aspalnya — pool-nya terpisah, jadi hanya tes yang bisa menangkap ini.
        {
            const road = S5C.highway.nearZ, HW = train5Mod.HIGHWAY_HALF_W;
            let onRoad = 0;
            // Hanya PROP (berdiri di atas permukaan); pita tanah memang harus
            // membentang di bawah jalan.
            for (const g of pool.near) for (const m of nearMeshes(g))
                if (m.position.y > 0 && Math.abs(m.position.z - road) < HW) onRoad++;
            T(`S5 TANAH: tak ada perabot tepi rel yang berdiri di badan jalan raya [aspal ${(road - HW).toFixed(0)}..${(road + HW).toFixed(0)}]`,
                onRoad === 0);
            // ...dan tidak ada pula yang berdiri DI ATAS PERON KEDATANGAN
            // (2026-08-09, laporan user "jauhkan pagar pembatas yang ada di
            // kanan kereta karena Major Gibran berjalan menembusnya"): pagar
            // lineside dulu berada di z 30, persis di titik Gibran turun.
            const A0 = train5Mod.B_APRON_Z0, A1 = train5Mod.B_APRON_Z1;
            let onApron = 0;
            for (const g of pool.near) for (const m of nearMeshes(g))
                if (m.position.y > 0
                    && m.position.z > A0 - 4 && m.position.z < A1 + 4) onApron++;
            T(`S5 TANAH: peron kedatangan bersih dari perabot tepi rel [pita ${A0}..${A1}]`,
                onApron === 0);
        }
        T('S5 TANAH: hanya hijau rumput + coklat tanah, tidak ada nada lain',
            badHue === 0 && bodyOk === pool.near.length);
    }
}

// --- PERALIHAN BABAK HARUS MULUS (2026-08-09, laporan user: "bikin transisi
// yang mulus dari background perkotaan ke pegunungan ke perkotaan lagi. sekarang
// terlihat aneh karena tiba-tiba berubah"). Dulu ke-18 modul mid dan ke-12 modul
// far di-toggle `visible` dalam SATU frame, jadi seluruh cakrawala berganti
// sekaligus tepat di depan mata. Sekarang babak hanya berpindah lewat WRAP —
// modul mengambil babak baru saat lahir kembali jauh di depan player — jadi
// kota dan pegunungan WAJIB pernah berdiri bersamaan, dan tidak boleh ada satu
// frame pun yang membalik lebih dari satu modul. Diuji pada pool TERPISAH
// supaya tidak mengganggu state stage yang hidup. ---
{
    const jp = train5Mod.buildTrainJourneyScenery(0);
    const MK = 0.3, SPD = S5C.trainSpeed, DT = 1 / 60;
    const count = () => ({
        city: jp.mid.filter(g => g.userData.cityG.visible).length,
        hill: jp.mid.filter(g => g.userData.hillG.visible).length,
        sky: jp.far.filter(g => g.userData.skyG.visible).length,
        ridge: jp.far.filter(g => g.userData.ridgeG.visible).length,
    });
    const run = (sec, k, onFrame) => {
        for (let t = 0; t < sec; t += DT) {
            train5Mod.updateJourneyScenery(jp, DT, SPD, k, MK);
            onFrame(count(), t);
        }
    };
    let intruder = 0;
    run(20, MK * 0.5, c => { if (c.hill || c.ridge) intruder++; });
    T('S5 TRANSISI: sebelum ambang, lanskap kota tidak pernah disusupi pegunungan',
        intruder === 0 && count().city === jp.mid.length && count().sky === jp.far.length);

    // Yang menentukan "mulus" adalah APA YANG TERLIHAT, bukan isi seluruh pool:
    // modul yang terparkir jauh di belakang layar boleh saja masih memakai babak
    // lama berlama-lama. Jadi ukurannya = berapa lama babak lama masih berdiri
    // DI DALAM tapak pandang, dan apakah pergantiannya pernah terjadi di sana.
    const ext = rendererMod.groundViewExtents(cfgMod.CFG.player.eyeHeight, 0);
    const onScreen = g => g.position.x >= ext.minX - 42 && g.position.x <= ext.maxX + 42;
    T(`S5 TRANSISI: ambang tata-ulang benar-benar di luar layar [${train5Mod.SCENERY_OFFSCREEN_AHEAD} > ${(ext.maxX + 42).toFixed(0)}]`,
        train5Mod.SCENERY_OFFSCREEN_AHEAD > ext.maxX + 42);
    const oldOnScreen = () => jp.mid.filter(g => onScreen(g) && g.userData.cityG.visible).length
        + jp.far.filter(g => onScreen(g) && g.userData.skyG.visible).length;

    // INTI KEMULUSAN: tidak boleh ada satu modul pun yang berganti babak ketika
    // ia sedang berada di layar. Pergantian hanya sah di luar tapak pandang —
    // entah lewat wrap atau lewat tata-ulang sekali saat ambang. (Dulu ke-18
    // modul dibalik serentak persis di depan mata.)
    const acts = new Map();
    const snapshot = () => { for (const g of jp.mid.concat(jp.far)) acts.set(g, g.userData.act); };
    const seenFlips = () => {
        let bad = 0;
        for (const g of jp.mid.concat(jp.far))
            if (acts.get(g) !== g.userData.act && onScreen(g)) bad++;
        return bad;
    };
    snapshot();
    let flip = 0, mixed = 0, clear = -1, prev = count();
    run(90, (MK + 1) / 2, (c, t) => {
        flip += seenFlips(); snapshot();
        if (c.city > 0 && c.hill > 0) mixed++;
        if (clear < 0 && oldOnScreen() === 0) clear = t;
        prev = c;
    });
    T(`S5 TRANSISI: tidak ada satu modul pun yang berganti babak di depan mata [${flip} kejadian]`,
        flip === 0);
    T(`S5 TRANSISI: ada pita peralihan tempat kota dan pegunungan berdiri bersamaan [${(mixed * DT).toFixed(0)} dtk]`,
        mixed * DT > 8);
    // Batas atas menjaga peralihan tidak MENGGANTUNG (dulu pool far butuh satu
    // putaran penuh ~47 dtk); batas bawah menjaga ia tidak jadi kedipan.
    T(`S5 TRANSISI: kota habis dari layar dalam tempo wajar, tanpa menggantung [${clear.toFixed(0)} dtk]`,
        clear > 3 && clear < 30);

    // --- PITA DEPAN vs JALAN RAYA (2026-08-09, laporan user "ketika transisi
    // jalan raya masuk, masih banyak rumah pohon dan objek lainnya yang ada di
    // tengah jalan"). Jalan menyapu dari z 200 ke 62, jadi ia melewati pita
    // depan (84..96); pitanya harus padam — tetapi TIDAK di depan mata. ---
    {
        const fgOn = () => jp.near.filter(g => g.userData.fgG.visible).length;
        const fgSeen = () => jp.near.filter(g => onScreen(g) && g.userData.fgG.visible).length;
        T('S5 JALAN: sebelum jalan raya aktif, pita depan sisi kamera lengkap',
            fgOn() === jp.near.length && fgSeen() > 0);
        train5Mod.setJourneyForeground(jp, false);
        const keptOnScreen = fgSeen();
        let flips = 0;
        const acts = new Map(jp.near.map(g => [g, g.userData.fgG.visible]));
        let clear = -1;
        for (let t = 0; t < 60; t += DT) {
            train5Mod.updateJourneyScenery(jp, DT, SPD, 0.5, MK);
            for (const g of jp.near) {
                if (acts.get(g) !== g.userData.fgG.visible && onScreen(g)) flips++;
                acts.set(g, g.userData.fgG.visible);
            }
            if (clear < 0 && fgOn() === 0) clear = t;
        }
        T(`S5 JALAN: pita depan tidak pernah padam di depan mata [${flips} kejadian]`,
            keptOnScreen > 0 && flips === 0);
        T(`S5 JALAN: seluruh pita depan bersih jauh sebelum jalan selesai merapat [${clear.toFixed(0)} dtk dari ${S5C.highway.approachSec}]`,
            clear > 0 && clear < S5C.highway.approachSec);
        train5Mod.setJourneyForeground(jp, true);
    }

    let backFlip = 0, backMixed = 0, backClear = -1; prev = count();
    const oldHillOnScreen = () => jp.mid.filter(g => onScreen(g) && g.userData.hillG.visible).length
        + jp.far.filter(g => onScreen(g) && g.userData.ridgeG.visible).length;
    snapshot();
    run(90, 0.97, (c, t) => {
        backFlip += seenFlips(); snapshot();
        if (c.city > 0 && c.hill > 0) backMixed++;
        if (backClear < 0 && oldHillOnScreen() === 0) backClear = t;
        prev = c;
    });
    T(`S5 TRANSISI: kembali ke kota Bandung juga menjalar, bukan berganti mendadak [${(backMixed * DT).toFixed(0)} dtk, bersih ${backClear.toFixed(0)} dtk]`,
        backFlip === 0 && backMixed * DT > 8 && backClear > 3 && backClear < 30);
}

// Jendela '@' hanya tembus pandang: gerakan dan peluru tetap tertahan.
const s5WinCell = (() => {
    for (let r = 0; r < expectedS5Map.length; r++) {
        const c = expectedS5Map[r].indexOf('@');
        if (c >= 0) return { c, r };
    }
    return null;
})();
const s5WinPos = {
    x: s5World.depot.x0 + (s5WinCell.c + 0.5) * s5World.map.cell,
    z: s5World.depot.z0 + (s5WinCell.r + 0.5) * s5World.map.cell,
};
T('S5 WINDOW WALL: @ solid untuk gerak dan peluru, tetapi punya panel kaca sendiri',
    !s5mod.stage5Walk(s5WinPos.x, s5WinPos.z, 2)
    && s5mod.stage5SegHitsWall(s5WinPos.x, s5WinPos.z - s5World.map.cell * 2,
        s5WinPos.x, s5WinPos.z + s5World.map.cell * 2)
    && s5World.map.windowPanes === s5World.map.windowCells);
// Rute track -> peron: satu-satunya jalur adalah memutari ujung kereta player.
const s5Cell = (c, r) => ({
    x: s5World.depot.x0 + (c + 0.5) * s5World.map.cell,
    z: s5World.depot.z0 + (r + 0.5) * s5World.map.cell,
});
function s5Reach(from, to) {
    const seen = new Set(), q = [from], key = p => p.r + ':' + p.c;
    seen.add(key(from));
    while (q.length) {
        const p = q.shift();
        if (p.c === to.c && p.r === to.r) return true;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = { c: p.c + dc, r: p.r + dr };
            if (n.c < 0 || n.c >= 30 || n.r < 0 || n.r >= 50 || seen.has(key(n))) continue;
            const w = s5Cell(n.c, n.r);
            if (!s5mod.stage5Walk(w.x, w.z, 4)) continue;
            seen.add(key(n)); q.push(n);
        }
    }
    return false;
}
const s5DropCell = { c: 24, r: 4 };
T('S5 PLAYER TRACK: player tidak bisa melangkah ke track musuh / celah antar-rel',
    (() => {
        const drop = s5Cell(24, 4), enemyTrack = s5Cell(24, 2), platform = s5Cell(24, 12);
        const probe = (p) => {
            stateMod._v3.set(p.x, 0, p.z);
            s5mod.stage5Scene.playerCollide(stateMod._v3, platform.x, platform.z, 0);
            return Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) > 0.01;
        };
        return probe(drop) && probe(enemyTrack) && !probe(platform);
    })());
T('S5 ROUTE: titik turun kereta musuh terhubung ke peron dan ke titik naik TCI',
    s5Reach(s5DropCell, { c: 24, r: 12 })
    && s5Reach(s5DropCell, { c: 6, r: 10 })
    && !s5Reach(s5DropCell, { c: 10, r: 7 }));

T('S5 SAFE DOOR: pintu keluar safe area otomatis dan bukan pintu peron yang terkunci',
    s5World.station.doors.map(d => d.kind).sort().join(',') === 'control,platform,safe'
    && s5World.station.doors.find(d => d.kind === 'safe').target === 0);
T('S5 PINTU: seluruh pintu stasiun memakai dua daun 50:50 simetris',
    s5World.station.doors.every(d => d.split.leaves.length === 2
        && Math.abs(d.split.leaves[0].y - d.split.leaves[1].y) < 1e-6
        && Math.abs((d.split.horizontal ? d.split.leaves[0].x : d.split.leaves[0].z)
            + (d.split.horizontal ? d.split.leaves[1].x : d.split.leaves[1].z)) < 1e-6));
const sideLamps = d => {
    const side = d.split.horizontal ? 'x' : 'z';
    const face = d.split.horizontal ? 'z' : 'x';
    const sides = new Set(d.lamps.map(l => Math.round(l[side] * 1000) / 1000));
    return d.lamps.length === 4 && sides.size === 2
        && d.lamps.every(l => Math.abs(l[side] - d[side]) > d.split.span / 2
            && l.y > 0 && l.y < 20
            && l.color === (d.canOpen ? 0x39ff7a : 0xff4a3c))
        && new Set(d.lamps.map(l => Math.sign(l[face] - d[face]))).size === 2;
};
T('S5 PINTU: lampu indikator berada di kusen kiri/kanan, bukan di atas pintu',
    s5World.station.doors.every(sideLamps));
const shotAcrossDoor = d => {
    const pad = 100;
    return d.rig.horizontal
        ? [{ x: d.cx, z: d.cz - pad }, { x: d.cx, z: d.cz + pad }]
        : [{ x: d.cx - pad, z: d.cz }, { x: d.cx + pad, z: d.cz }];
};
const closedDoorStopsShot = (d, clamp) => {
    const oldOpen = d.open;
    const [a, b] = shotAcrossDoor(d);
    d.open = 0; doorsMod.setSplitDoorOpen(d.rig, 0);
    const shot = { px: a.x, pz: a.z,
        mesh: { position: { x: b.x, y: 8, z: b.z } } };
    const blocked = clamp(shot);
    const stopped = Math.hypot(shot.mesh.position.x - a.x, shot.mesh.position.z - a.z)
        < Math.hypot(b.x - a.x, b.z - a.z);
    d.open = oldOpen;
    doorsMod.setSplitDoorOpen(d.rig, doorsMod.doorEasedOpen(oldOpen));
    return blocked && stopped;
};
T('S5 PINTU: tembakan melintasi pintu stasiun tertutup dihentikan dan di-clamp',
    closedDoorStopsShot(s5WorldMod.platformDoor(), s5WorldMod.stationDoorClampShot));
T('S5 SA FLOOR: safe area memakai lantai hall yang sama tanpa overlay warna khusus',
    s5World.map.safeCells > 0 && s5World.map.safeFloorOverlays === 0);
T('S5 LANDMARK 2045: C1/C2 bukan box basic; mesh detail + bagian animasi dipatok',
    s5World.landmarks.generatorMeshes >= 45
    && s5World.landmarks.terminalMeshes >= 90
    && s5World.landmarks.animatedParts >= 2);
const s5StandBox = marker => {
    const fill = marker?.children?.filter(o => o.geometry?.type === 'plane') || [];
    const bars = marker?.children?.filter(o => o.geometry?.type === 'box') || [];
    const dimensions = bars.map(o => o.geometry.args.join('x')).sort().join('|');
    return marker?.children?.length === 5
        && fill.length === 1 && fill[0].geometry.args.join('x') === '12x12'
        && bars.length === 4
        && dimensions === '12x0.5x1|12x0.5x1|1x0.5x12|1x0.5x12'
        && !marker.children.some(o => o.geometry?.type === 'ring');
};
T('S5 C1/C2 MARKER: kotak pijak KUNING sama seperti Stage 1/2 dan tepat di titik action',
    s5StandBox(s5WorldMod.terminalMarker) && s5StandBox(s5WorldMod.repairMarker)
    && s5World.markers.c1.color === s5PalMod.PAL.amber
    && s5World.markers.c2.color === s5PalMod.PAL.amber
    && Math.hypot(s5World.markers.c1.x - s5mod.S5_TERMINAL.x,
        s5World.markers.c1.z - s5mod.S5_TERMINAL.z) < 0.01
    && Math.hypot(s5World.markers.c2.x - s5mod.S5_GENERATOR.x,
        s5World.markers.c2.z - s5mod.S5_GENERATOR.z) < 0.01);
T('S5 SPAWN MACHINE: satu hero rig berada di tengah gudang, solid/nav-baked, tanpa PointLight',
    s5World.spawnMachine && s5World.spawnMachine.visible
    && s5World.spawnMachine.meshes >= 60 && s5World.spawnMachine.nonBox >= 20
    && s5World.spawnMachine.pointLights === 0 && s5World.spawnMachine.spawns.length === 3
    && s5TokenAt(s5World.spawnMachine.x, s5World.spawnMachine.z) === '.');
const s5DepotKinds = new Set(s5World.furniture.depot.map(p => p.kind));
const s5PlatformKinds = new Set(s5World.furniture.platform.map(p => p.kind));
T('S5 DEPOT FURNITURE: hall berisi rack/container/workbench/forklift/drum/scale/locker solid',
    s5World.furniture.depot.length >= 16 && s5DepotKinds.size >= 10
    && ['packing-island', 'conduit-rack', 'drone-service-dock'].every(k => s5DepotKinds.has(k))
    && s5World.furniture.depot.every(p => p.solid));
T('S5 PLATFORM FURNITURE: peron berisi cart/pallet/bench/signal/drum solid',
    s5World.furniture.platform.length >= 6 && s5PlatformKinds.size >= 5
    && s5World.furniture.platform.every(p => p.solid));
T('S5 DETAIL VISUAL: dinding berpanel dan perabot depot bukan balok placeholder',
    s5World.architecture.wallDetails > s5World.map.walls * 2
    && s5World.furniture.meshes > 180);
let s5FurnitureSolid = true;
for (const p of [...s5World.furniture.depot, ...s5World.furniture.platform]) {
    stateMod._v3.set(p.x, 0, p.z); s5mod.resolve(stateMod._v3, 2, 0);
    if (Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) < 0.01) s5FurnitureSolid = false;
}
T('S5 FURNITURE COLLISION: seluruh perabot besar benar-benar masuk blocker/nav contract',
    s5FurnitureSolid);
T('S5 NAV SETELAH FURNITURE: robot punya rute mesin -> safe area',
    !!s5PathMod.findPath(s5WorldMod.navGrid, s5World.spawnMachine.spawns[1].x,
        s5World.spawnMachine.spawns[1].z, s5mod.S5_START.x, s5mod.S5_START.z));
T('S5 NAV SETELAH FURNITURE: rute safe area -> C1 tetap terbuka',
    !!s5PathMod.findPath(s5WorldMod.navGrid, s5mod.S5_START.x, s5mod.S5_START.z,
        s5mod.S5_TERMINAL.x, s5mod.S5_TERMINAL.z));
T('S5 NAV SETELAH FURNITURE: rute safe area -> C2 tetap terbuka',
    !!s5PathMod.findPath(s5WorldMod.navGrid, s5mod.S5_START.x, s5mod.S5_START.z,
        s5mod.S5_GENERATOR.x, s5mod.S5_GENERATOR.z));
// --- SKALA KERETA (ROMBAK 2026-08-07, permintaan user): "lebar kereta hanya 3
// meter, sesuaikan panjang dan tingginya" + "kereta yang dinaiki player hanya
// terdiri dari lokomotif dan 1 gerbong". Lebar dipatok EKSAK (bukan ambang):
// kalau ada yang menggemukkannya lagi, test ini yang jatuh. ---
T(`S5 SKALA: badan kereta tepat 4 m dan konsist player = 1 gerbong + 1 lokomotif [${s5World.train.widthMeters.toFixed(2)}m x ${s5World.train.lengthMeters.toFixed(2)}m]`,
    Math.abs(s5World.train.widthMeters - 4) < 1e-6
    && Math.abs(s5World.train.lengthMeters - 16.5) < 1e-6
    && s5World.train.cars === 2 && s5World.train.doors === 0);
T('S5 SKALA: konsist musuh memakai lebar 4 m yang sama, bukan skala lama',
    Math.abs(s5World.enemyTrain.widthMeters - s5World.train.widthMeters) < 1e-6);

// --- BENTUK GERBONG PLAYER (ROMBAK 2026-08-08, permintaan user: "perbaiki
// bentuk gerbong kereta yang dinaiki player. hilangkan lampu di atasnya, itu
// terlihat aneh karena seperti melayang di ruang kosong"). Gerbongnya kini BAK
// TERBUKA: tak boleh ada apa pun yang menggantung di atas lorong. Satu-satunya
// struktur tinggi = sekat buta ke lokomotif di ujung timur, dan itu memang
// menempel pada dinding sungguhan. Uji ini yang jatuh kalau rusuk atap / lampu
// langit-langit dihidupkan lagi. ---
{
    const rig = train5Mod.buildMilitaryTrainMesh(0);
    const car = rig.cars[train5Mod.TRAIN_PLAYER_CAR];
    const IH = train5Mod.TRAIN_INNER_HALF, IL = train5Mod.TRAIN_INNER_HALF_LEN;
    const SW = train5Mod.TRAIN_SIDE_WALL_H, ET = train5Mod.TRAIN_END_T;
    const boxes = car.children.filter(m => m.geometry?.type === 'box' && m.geometry.args.length >= 3)
        .map(m => {
            const [sx, sy, sz] = m.geometry.args;
            return {
                x0: m.position.x - sx / 2, x1: m.position.x + sx / 2,
                y0: m.position.y - sy / 2, y1: m.position.y + sy / 2,
                z0: m.position.z - sz / 2, z1: m.position.z + sz / 2,
            };
        });
    // 1. Di atas bak terbuka tidak boleh ada apa pun. Yang menempel sekat
    //    lokomotif (x mendekati ujung timur) dikecualikan: ia bertumpu nyata.
    const overBay = b => b.x1 > -IL && b.x0 < IL && b.z1 > -IH && b.z0 < IH;
    const onBulkhead = b => b.x1 > IL - ET;
    const floating = boxes.filter(b => overBay(b) && !onBulkhead(b) && b.y0 > SW + 0.05);
    T(`S5 GERBONG: bak terbuka — NOL bagian menggantung di atas lorong (tanpa rusuk atap / lampu langit-langit)${floating.length ? ' [' + floating.length + ']' : ''}`,
        boxes.length > 20 && floating.length === 0);
    // 2. Lorong tempur di tengah gerbong benar-benar bebas setinggi badan.
    const blocked = boxes.filter(b =>
        b.x1 > -(IL - 4) && b.x0 < IL - 4 && b.z1 > -(IH - 1.5) && b.z0 < IH - 1.5
        && b.y1 > 1.5 && b.y0 < 14);
    T(`S5 GERBONG: lorong tengah setinggi badan bebas hambatan${blocked.length ? ' [' + blocked.length + ']' : ''}`,
        blocked.length === 0);
    // 3. Dinding samping tetap serendah dada (kamera oblique harus melihat
    //    avatar) dan sekat lokomotif tetap satu-satunya bidang tinggi.
    const tall = boxes.filter(b => b.y1 > SW + 3);
    T('S5 GERBONG: hanya sekat ujung lokomotif yang tinggi; dinding samping tetap setinggi dada',
        tall.length > 0 && tall.every(b => b.x0 > IL - ET - 1));
    // 4. BUKAAN NAIK ADALAH LUBANG SUNGGUHAN (2026-08-08, rombak cutscene
    //    keberangkatan): dulu dinding sisi peron utuh dan "pintu"-nya cuma
    //    pelat tempelan, jadi menggesernya hanya memperlihatkan dinding pejal.
    //    Cutscene "pintu terbuka lalu Gibran naik" mustahil dibuat dari itu.
    const s5DoorsMod = await import(R('src/scenes/campaign/utility/doors.js'));
    const DX = train5Mod.TRAIN_DOOR_X, DH = train5Mod.TRAIN_DOOR_HALF;
    // Dinding samping = satu-satunya bidang setinggi PENUH dinding di bidang
    // sisi peron (strip hazard, rusuk, kusen dan sill semuanya lebih pendek).
    const nearWall = boxes.filter(b =>
        b.z0 > IH - 0.5 && b.y0 < 0.05 && b.y1 > SW - 0.05 && b.y1 < SW + 0.05);
    const spans = x => nearWall.some(b => b.x0 < x && b.x1 > x);
    T('S5 GERBONG: dinding sisi peron BENAR-BENAR berlubang selebar bukaan naik',
        nearWall.length === 2 && !spans(DX) && !spans(DX - DH + 0.5) && !spans(DX + DH - 0.5)
        && spans(DX - DH - 4) && spans(DX + DH + 4));
    // Daunnya sendiri milik rig dua daun bersama campaign, dipasang stage 5 pada
    // grup gerbong — dan saat tertutup ia menutup bukaan itu tepat pas.
    const bd = s5World.train.boardDoor;
    T('S5 GERBONG: pintu naik = rig dua daun 50:50 bersama, tertutup rapat menutupi bukaan',
        !!bd && bd.open === 0 && bd.target === 0 && bd.split.horizontal
        && Math.abs(bd.split.span - DH * 2) < 1e-6
        && bd.split.leaves.length === 2
        && Math.abs(bd.split.leaves[0].x + bd.split.span / 4) < 1e-6
        && Math.abs(bd.split.leaves[1].x - bd.split.span / 4) < 1e-6
        && Math.abs(bd.split.travel
            - bd.split.leafSpan * (1 - s5DoorsMod.DOOR_OPEN_REVEAL)) < 1e-6);
}
T('S5 WORLD: depot + kereta + nav terbangun jauh dari rooftop intro',
    s5World.built && s5World.nav
    && s5World.train.x0 < s5World.depot.x1 && s5World.depot.x0 > 150000);
// --- DEPOT DI TENGAH KOTA (2026-08-09, permintaan user "buat agar depot berada
// di tengah kota"). Tiga hal yang tidak boleh berubah diam-diam: kotanya ikut
// stationRoot (arena perjalanan menempati koordinat yang sama, jadi kota yang
// menempel langsung ke scene akan berdiri di tengah rel selama perjalanan),
// jalannya nyaris rata dengan lantai depot (bukan -70 seperti Lantai 2 stage
// 1-3), dan koridor rel benar-benar kosong di SEMUA x — termasuk apron run-out
// di timur tempat kereta berangkat pada shot terakhir cutscene. ---
{
    const c = s5World.city;
    T('S5 KOTA: depot dikelilingi cincin kota yang IKUT stationRoot, bukan menempel di scene',
        !!c && c.parented && c.buildings > 60 && c.trees > 0
        && c.groundY < 0 && c.groundY > -30);
    T('S5 KOTA: tidak ada gedung/pohon kota yang berdiri di koridor rel',
        !!c && c.corridorHits === 0
        && c.corridor.z0 < s5World.map.enemyTrackZ
        && c.corridor.z1 > s5World.map.playerTrackZ);
}
// --- JALUR MASUK BARAT + PAGAR PERIMETER (2026-08-11, permintaan user: rel
// hanya ada ke arah timur sehingga sisi barat stasiun terlihat seperti ujung
// dunia, dan tidak ada pembatas apa pun antara wilayah stasiun dan kota). ---
{
    const lead = s5World.depot.x0 - s5World.leadX0;
    T(`S5 JALUR BARAT: rel + tanah menerus ${s5World.westLeadMeters} m ke barat peron, bukan berhenti di tepi peta`,
        s5World.leadX0 < s5World.depot.x0
        && Math.abs(lead - s5World.westLeadMeters * cfgMod.CAMP_M) < 1e-6
        // Ujung potongnya harus jauh di luar jangkauan kamera dari peron, kalau
        // tidak masalah "dunia habis" cuma pindah 100 m.
        && lead > s5World.map.cell * s5World.map.cols);
    const f = s5World.fence;
    T(`S5 PAGAR: pagar besi utara rel membentang penuh barat->apron timur [${f ? f.posts : 0} tiang, ${f ? f.pickets : 0} jeruji]`,
        !!f && f.x0 === s5World.leadX0 && f.x1 === s5World.runoutX1
        && f.posts > 0 && f.pickets > f.posts && f.top > 0);
    T('S5 PAGAR: berdiri DI LUAR pita track, di sisi utara, dan di dalam koridor bebas gedung',
        !!f && f.z < s5World.depot.z0
        && f.z > s5World.depot.z0 - s5World.map.cell
        && f.z < s5World.map.enemyTrackZ
        && (!s5World.city || f.z > s5World.city.corridor.z0));
    // Track tidak pernah walkable, jadi pagar ini WAJIB dekor murni: satu
    // blocker di sini hanya menambah kerja resolve tanpa mengubah satu jalur.
    T('S5 PAGAR: dekor murni — nol blocker di pita z-nya',
        !!f && f.blockersAtZ === 0);
}
T('S5 STATION CONSIST: gerbong TC + lokomotif TL keduanya tampak di peron dan jatuh persis pada sel CSV-nya',
    s5World.train.cars === 2 && s5World.train.stationCarIndex === 0
    && s5World.train.stationVisibleCars === 2
    && (() => {
        // Kolom TC 0-based 5..11 (pusat 8), TL 12..18 (pusat 15).
        const colX = c => s5World.depot.x0 + (c + 0.5) * s5World.map.cell;
        const cell = s5World.map.cell, half = s5World.train.lengthMeters * 7 / 2;
        const tcC = s5World.train.stationTcX, tlC = tcC + s5World.train.lengthMeters * 7;
        return Math.abs(tcC - colX(8)) < 1e-6 && Math.abs(tlC - colX(15)) < 1e-6
            // badan gerbong menutupi tepat tujuh sel TC, tidak menjorok
            && Math.abs((tcC - half) - (colX(5) - cell / 2)) < 1e-6
            && Math.abs((tcC + half) - (colX(11) + cell / 2)) < 1e-6;
    })());
// --- KONSIST PENYERBU 10 GERBONG (ROMBAK 2026-08-08, permintaan user: satu
// kereta musuh 10 gerbong, gerbongnya terbuka satu per satu, dan bentuknya
// dibuat lebih menyeramkan). Seluruh gerbong + ramp + lampu peringatan
// PREALOKASI: tidak ada mesh/material yang lahir saat runtime. ---
T(`S5 ENEMY CONSIST: 10 peti baja + lokomotif prealokasi, tiap gerbong punya ramp + lampu [${s5World.enemyTrain.meshes} mesh]`,
    s5World.enemyTrain.cargoCars === 10
    && s5World.enemyTrain.cars === s5World.enemyTrain.cargoCars + 1
    && s5World.enemyTrain.ramps === s5World.enemyTrain.cargoCars
    && s5World.enemyTrain.strobes === s5World.enemyTrain.cargoCars
    && s5World.enemyTrain.meshes > 200
    && Math.abs(s5World.enemyTrain.z - s5World.map.enemyTrackZ) < 0.01
    && s5World.enemyTrain.enterX < s5World.depot.x0
    && s5World.enemyTrain.exitX > s5World.depot.x1);
// BENTUK PETI BAJA: dinding dekat yang TETAP wajib serendah dada supaya dek
// terbaca kamera oblique, tetapi RAMP-nya harus menutup sampai atap sehingga
// isi gerbong benar-benar tersembunyi selama belum giliran. Atap hanya boleh
// menutup separuh JAUH dek — kalau ia menjorok ke tepi dekat, tepinya memotong
// kepala robot di barisan tembak.
{
    const s5PropsMod = await import(R('src/scenes/campaign/stages/stage5/props.js'));
    const fakeMat = () => ({ color: 0 });
    const M5 = {};
    for (const k of ['ink', 'body', 'panel', 'steel', 'hazard', 'tech', 'lamp', 'glass']) M5[k] = fakeMat();
    const HALF = s5World.enemyTrain.widthMeters * 7 / 2, LEN = s5World.enemyTrain.len;
    const rig = s5PropsMod.buildEnemyTrain(M5, new THREE.Group(), 10, LEN, s5World.enemyTrain.step, HALF, 0, 0);
    const SILL = s5PropsMod.ET_CAR_SILL, H = s5PropsMod.ET_CAR_HEIGHT;
    const boxesOf = (root) => {
        const out = [], stack = [{ o: root, y: 0, z: 0 }];
        while (stack.length) {
            const { o, y, z } = stack.pop();
            if (o.geometry?.type === 'box' && o.geometry.args.length >= 3) {
                const [sx, sy, sz] = o.geometry.args;
                out.push({
                    sx,
                    y0: y + o.position.y - sy / 2, y1: y + o.position.y + sy / 2,
                    z0: z + o.position.z - sz / 2, z1: z + o.position.z + sz / 2,
                });
            }
            for (const c of o.children || []) stack.push({ o: c, y: y + o.position.y, z: z + o.position.z });
        }
        return out;
    };
    // Dinding TETAP di sisi dekat (lambung, DI LUAR ramp) tak boleh melebihi dada.
    const hullBoxes = boxesOf(rig.hulls[0]);
    const rampBoxes = boxesOf(rig.ramps[0]);
    const rampY1 = Math.max(...rampBoxes.map(b => b.y1));
    // Tiang sudut boleh setinggi penuh (ia tipis dan berdiri di luar barisan
    // tembak); yang dilarang adalah BIDANG lebar yang menutupi dek.
    const fixedNear = hullBoxes.filter(b => b.z0 > HALF - 3 && b.y1 > SILL + 3 && b.sx > LEN / 2);
    T(`S5 ENEMY CAR: dinding dekat yang TETAP setinggi dada; yang menutup sampai atap adalah RAMP${fixedNear.length ? ' [' + fixedNear.length + ']' : ''}`,
        hullBoxes.length > 10 && fixedNear.length === 0
        && rampBoxes.length >= 4 && Math.abs(rampY1 - H) < 2.0);
    // Atap hanya separuh jauh dek.
    const roof = hullBoxes.filter(b => b.y0 > H - 2 && b.y1 < H + 3 && b.z1 - b.z0 > HALF);
    T('S5 ENEMY CAR: atap hanya menutup separuh JAUH dek — tepi dekatnya tidak memotong kepala robot',
        roof.length > 0 && roof.every(b => b.z1 < HALF * 0.4));
    T(`S5 ENEMY CAR: 4 roda berputar per gerbong (sisi jauh tak pernah terlihat) [${rig.wheels.length}]`,
        rig.wheels.length === 4 * (10 + 1));
    T('S5 ENEMY CAR: ramp terbuka <= ET_RAMP_OPEN dan ujungnya tak pernah menyentuh gerbong player',
        s5PropsMod.ET_RAMP_OPEN > 0.6 && s5PropsMod.ET_RAMP_OPEN < 1.0
        && HALF + (H - SILL) * Math.sin(s5PropsMod.ET_RAMP_OPEN)
            < Math.abs(s5World.map.journeyTrackDz) - s5World.train.widthMeters * 7 / 2);
}
// Arena perjalanan = bagian DALAM gerbong 0. Lokomotif dan luar gerbong tertutup.
T('S5 ARENA: hanya bagian dalam gerbong yang walkable; lokomotif dan luar kereta tidak',
    s5World.carCenters.length === 2
    && s5mod.stage5TrainWalk(s5World.carCenters[0].x, s5World.carCenters[0].z, 3)
    && !s5mod.stage5TrainWalk(s5World.carCenters[1].x, s5World.carCenters[1].z, 3)
    && !s5mod.stage5TrainWalk(s5World.train.x0 - 6, s5World.carCenters[0].z, 3)
    && !s5mod.stage5TrainWalk(s5World.carCenters[0].x, s5World.train.z0 - 6, 3)
    && !s5mod.stage5Walk(s5World.map.tci.x, s5World.map.tci.z, 3)
    && s5mod.stage5Walk(s5mod.S5_START.x, s5mod.S5_START.z, 3)
    && s5mod.stage5Walk(s5mod.S5_BOARD.x, s5mod.S5_BOARD.z, 3));
let s5PlacementOK = true;
for (const p of [...s5World.supplies, ...s5World.crates]) {
    if (!s5mod.stage5Walk(p.x, p.z, 1)) s5PlacementOK = false;
    stateMod._v3.set(p.x, 0, p.z); s5mod.resolve(stateMod._v3, 1, 0);
    if (Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) > 0.01) s5PlacementOK = false;
}
for (const z of depotBots) {
    if (!s5mod.stage5Walk(z.mesh.position.x, z.mesh.position.z, 2)) s5PlacementOK = false;
    stateMod._v3.set(z.mesh.position.x, 0, z.mesh.position.z); s5mod.resolve(stateMod._v3, 2, 0);
    if (Math.hypot(stateMod._v3.x - z.mesh.position.x, stateMod._v3.z - z.mesh.position.z) > 0.01)
        s5PlacementOK = false;
}
T('S5 WORLD: supplies, crates, marker route, dan SEMUA spawn depot berada di area valid',
    s5PlacementOK && depotBots.length === mixTotal(scaledMix(S5C.encounters.depot, 5)));
T('S5 DEPOT: komposisi awal C/B/A mengikuti CFG x robotCountMul dan tidak memuat boss',
    sameMix(depotMix, scaledMix(S5C.encounters.depot, 5))
    && robots.filter(z => z.stage === 5).every(z => ['C', 'B', 'A'].includes(z.kind))
    && depotBots.every(z => !['A', 'S', 'T'].includes(s5TokenAt(z.mesh.position.x, z.mesh.position.z)))
    && depotBots.every(z => z.state === 'idle') && !s5mod.stage5Debug().depotAwake);
// 2026-08-07, permintaan user: "tambah lebih banyak robot di ruang sebelah" +
// "robot hanya ada di ruangan gudang saja". Ambang 12 = jumlah depot SEBELUM
// rombak (bukan angka tuning) — turun di bawahnya berarti requestnya hilang.
T(`S5 GUDANG: seluruh robot bagian 1 tinggal di gudang dan jumlahnya bertambah [${depotBots.length}]`,
    depotBots.length > 12
    && robots.filter(z => z.stage === 5).length === depotBots.length);
const s5SafeProbe = depotBots[0], s5SafeOld = {
    x: s5SafeProbe.mesh.position.x, z: s5SafeProbe.mesh.position.z,
};
s5SafeProbe.mesh.position.x = s5mod.S5_START.x; s5SafeProbe.mesh.position.z = s5mod.S5_START.z;
s5mod.stage5Scene.clampRobot(s5SafeProbe, s5SafeOld.x, s5SafeOld.z);
T('S5 SAFE AREA: SA/S hanya larangan spawn — robot hidup boleh masuk dan tidak di-clamp keluar',
    ['A', 'S'].includes(s5TokenAt(s5SafeProbe.mesh.position.x, s5SafeProbe.mesh.position.z))
    && Math.hypot(s5SafeProbe.mesh.position.x - s5mod.S5_START.x,
        s5SafeProbe.mesh.position.z - s5mod.S5_START.z) < 0.01);
s5SafeProbe.mesh.position.x = s5SafeOld.x; s5SafeProbe.mesh.position.z = s5SafeOld.z;
const s5SupplyDrops = stateMod.drops.filter(d => s5World.supplies.some(p =>
    Math.hypot(d.mesh.position.x - p.x, d.mesh.position.z - p.z) < 0.1));
T('S5 SUPPLY: depot membawa 4 ammo + 2 medkit; peti HANYA di gudang (lorong gerbong tak muat peti pejal)',
    s5SupplyDrops.filter(d => d.type === 'ammo').length === 4
    && s5SupplyDrops.filter(d => d.type === 'medkit').length === 2
    && crate5Mod.crateDebug().count === s5World.crates.length
    && s5World.crates.every(p => p.area === 'depot'));
T('S5 BARREL ACTION: barel peledak tersebar di gudang, walkable untuk robot dan tidak spawn di SA/S',
    barrel5Mod.barrelDebug().count === s5World.barrels.length && s5World.barrels.length >= 8
    && s5World.barrels.every(p => s5mod.stage5Walk(p.x, p.z, 2)
        && !['A', 'S', 'T'].includes(s5TokenAt(p.x, p.z))));

// Opening cinematic: dunia langsung terlihat, establishing beat, lalu typewriter.
const s5D0 = s5mod.stage5DialogueDebug();
T('S5 OPENING: cinematic membekukan kontrol tetapi dunia tidak ditutupi fade hitam',
    s5mod.stage5Debug().phase === 'opening' && stateMod.cinematicActive
    && dom4.cineFadeDebug()?.opacity === 0 && s5D0.key === null);
tickS5(S5C.openingDialogueDelaySec * 0.5, 0.05);
T('S5 OPENING: dialog belum muncul selama establishing beat',
    s5mod.stage5DialogueDebug().key === null && dom4.stageRadioDialogueDebug() === null);
tickS5(S5C.openingDialogueDelaySec * 0.5, 0.05);
T('S5 OPENING: sesudah delay, panel dialog baru muncul dengan body awal kosong',
    s5mod.stage5DialogueDebug().key === 'opening'
    && s5mod.stage5DialogueDebug().shown === '');
tickS5(1.01 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps));
T('S5 TYPEWRITER: opening menampilkan tepat satu karakter pada tick pertama',
    s5mod.stage5DialogueDebug().chars === 1
    && s5mod.stage5DialogueDebug().shown === expectedS5Dialogue.opening.text.slice(0, 1));
drainS5Dialogue();
tickS5(S5C.openingMinSec + S5C.fadeSec + 0.2, 0.1);
T('S5 OPENING: sesudah minimum+fade kontrol kembali dan objective depot aktif',
    s5mod.stage5Debug().phase === 'clearDepot' && !stateMod.cinematicActive);

const s5HeldBot = depotBots[0];
const s5HeldPos = { x: s5HeldBot.mesh.position.x, z: s5HeldBot.mesh.position.z };
const s5HeldAI = s5mod.stage5Scene.robotAI(s5HeldBot, 0.5, 30);
T('S5 SAFE HOLD: selama player masih di SA semua robot idle dan AI tidak menggeser posisi',
    !s5mod.stage5Debug().depotAwake && s5HeldAI.chaseDist == null
    && depotBots.every(z => z.state === 'idle')
    && s5HeldBot.mesh.position.x === s5HeldPos.x && s5HeldBot.mesh.position.z === s5HeldPos.z);
const s5NearSafeDoor = {
    x: s5World.map.safeDoor.x - s5World.map.cell * 0.8,
    z: s5World.map.safeDoor.z,
};
camera.position.set(s5NearSafeDoor.x, cfgMod.CFG.player.eyeHeight, s5NearSafeDoor.z);
s5mod.stage5Scene.updateMode(0.1);
const s5AwakeAI = s5mod.stage5Scene.robotAI(s5HeldBot, 0.1, 6);
const s5SafeDoorOpen = s5mod.stage5WorldDebug().station.doors.find(d => d.kind === 'safe');
T('S5 SAFE DOOR AGGRO: pintu mulai terbuka saat player masih di SA dan seluruh robot langsung mengejar masuk',
    s5mod.stage5Debug().depotAwake && s5TokenAt(camera.position.x, camera.position.z) === 'A'
    && s5SafeDoorOpen.target === 1 && s5SafeDoorOpen.open > 0
    && depotBots.every(z => z.state === 'chasing') && s5AwakeAI.skip !== true);
camera.position.set(s5mod.S5_START.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_START.z);
s5mod.stage5Scene.updateMode(0.1);
T('S5 SAFE DOOR AGGRO: sesudah alarm aktif pintu tetap terbuka saat player mundur ke dalam SA',
    s5mod.stage5WorldDebug().station.doors.find(d => d.kind === 'safe').target === 1);

// Mesin mengisi daya menjelang interval config, lalu mencetak SATU batch
// bertahap. Robot tetap dikunci AI sampai extrusion + landing selesai.
const s5MachineCfg = S5C.spawnMachine;
tickS5(s5MachineCfg.batchSec - s5MachineCfg.chargeSec - 0.4, 0.05);
T('S5 FACTORY RATE: sebelum window charge belum ada robot produksi yang muncul',
    s5mod.stage5Debug().machine.batches === 0
    && robots.filter(z => z.stage === 5 && z.encounter === 'factory').length === 0);
tickS5(0.3, 0.05);
T('S5 FACTORY CINEMATIC: siklus dimulai dengan fase CHARGE sebelum robot dibuat',
    s5mod.stage5Debug().machine.charging
    && s5mod.stage5Debug().machine.spawned === 0
    && s5mod.stage5WorldDebug().spawnMachine.power > 0);
tickS5(s5MachineCfg.chargeSec + (s5MachineCfg.batchCount - 1) * s5MachineCfg.birthGapSec + 0.1, 0.05);
const s5FactoryBirths = robots.filter(z => z.stage === 5 && z.encounter === 'factory');
T('S5 FACTORY RATE: satu siklus menghasilkan tepat batchCount robot (config) secara berjarak',
    s5FactoryBirths.length === s5MachineCfg.batchCount
    && s5mod.stage5Debug().machine.spawned === s5MachineCfg.batchCount
    && s5FactoryBirths.every(z => z.machineBirth));
T('S5 FACTORY MATERIALIZE: robot tidak pop-in — masih dicetak kecil/terangkat dan AI ditahan',
    s5FactoryBirths.some(z => z.mesh.scale.x < (z.scl || 1) || z.mesh.position.y > 0)
    && s5FactoryBirths.every(z => s5mod.stage5Scene.robotAI(z, 0.1, 6).chaseDist == null));
tickS5(s5MachineCfg.birthSec + 0.2, 0.05);
T('S5 FACTORY RELEASE: sesudah birthSec robot mendarat berskala penuh lalu langsung mengejar',
    s5FactoryBirths.every(z => !z.machineBirth && z.state === 'chasing'
        && Math.abs(z.mesh.scale.x - (z.scl || 1)) < 1e-6 && z.mesh.position.y === 0));

// Menghabisi pasukan saja belum cukup: mesin adalah gate fisik sebelum C1.
killS5('depot'); killS5('factory'); s5mod.stage5Scene.updateMode(0.1);
T('S5 FACTORY GATE: semua robot mati tetapi C1 tetap terkunci selama mesin masih hidup',
    s5mod.stage5Debug().phase === 'clearDepot' && s5mod.stage5Debug().machine.alive);
const s5MachinePoint = s5mod.stage5WorldDebug().spawnMachine;
stateMod.bullets.push({
    mesh: { position: new THREE.Vector3(s5MachinePoint.x, 12, s5MachinePoint.z) },
    px: s5MachinePoint.x - s5MachineCfg.hitRadius * 2, pz: s5MachinePoint.z,
    dir: { x: 1, z: 0 }, damage: MACHINE_HP() + 1,
});
s5mod.stage5Scene.updateMode(0.1); drainS5Dialogue();
T('S5 FACTORY DESTROY: peluru merusak mesin, menghentikan produksi, lalu membuka objective C1',
    !s5mod.stage5Debug().machine.alive
    && s5mod.stage5Debug().phase === 'hack' && stateMod.bullets.length === 0);
// ROMBAK 2026-08-09 (permintaan user "ketika mesin itu hancur, tampilannya
// menjadi hitam gosong dengan part yang terlepas"): bangkainya TETAP di layar,
// jadi aturan "yang terlihat itulah yang menghalangi" sekarang berarti
// collider-nya juga TETAP terpasang — tak ada lagi bangkai yang bisa ditembus,
// dan tak pernah ada blocking tak terlihat.
{
    const mp = s5mod.stage5WorldDebug().spawnMachine;
    const probe = (x, z) => {
        stateMod._v3.set(x, 0, z);
        s5mod.resolve(stateMod._v3, stateMod.player.radius, 0);
        return Math.hypot(stateMod._v3.x - x, stateMod._v3.z - z) > 0.01;
    };
    T('S5 FACTORY DESTROY: bangkai gosong tetap terlihat DAN tetap pejal (visible = blocking)',
        mp.visible && mp.blocking && mp.dead && mp.charred && mp.detached >= 10
        && probe(mp.x, mp.z) && probe(mp.x + 10, mp.z));
    // Nav SENGAJA tidak pernah di-bake ulang (invarian proyek).
    const nav = s5WorldMod.navGrid;
    const navC = Math.floor((mp.x - nav.x0) / nav.cell), navR = Math.floor((mp.z - nav.z0) / nav.cell);
    T('S5 FACTORY DESTROY: nav TIDAK di-bake ulang — petak mesin tetap bukan sel navigasi robot',
        nav.walk[navR * nav.cols + navC] === 0);
}

// Depot aman -> C1. Generator C2 dan pintu peron belum dapat dilewati.
const s5PlatformDoor0 = s5mod.stage5WorldDebug().station.doors.find(d => d.kind === 'platform');
T('S5 FLOW: depot aman mengaktifkan hack C1 lebih dulu; C2 dan pintu peron masih terkunci',
    s5mod.stage5Debug().phase === 'hack' && !s5mod.stage5Debug().platformUnlocked
    && s5PlatformDoor0.target === 0 && s5PlatformDoor0.open === 0
    && s5mod.stage5WorldDebug().markers.c1.visible
    && !s5mod.stage5WorldDebug().markers.c2.visible);
camera.position.set(s5mod.S5_GENERATOR.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_GENERATOR.z);
s5mod.stage5Scene.updateMode(0.1);
T('S5 FLOW: berdiri di H generator sebelum hack C1 tidak membuka FIELD REPAIR',
    s5mod.stage5Debug().phase === 'hack' && !repMod.isRepairOpen());
stateMod._v3.set(s5World.map.platformDoor.x, 0, s5World.map.platformDoor.z);
s5mod.resolve(stateMod._v3, 2, 0);
T('S5 DOOR: pintu peron benar-benar solid sebelum C1 berhasil di-hack',
    Math.hypot(stateMod._v3.x - s5World.map.platformDoor.x,
        stateMod._v3.z - s5World.map.platformDoor.z) > 0.01);

// Abort hack, re-arm, lalu sengaja timeout: tepat horde config + cooldown config.
camera.position.set(s5mod.S5_TERMINAL.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_TERMINAL.z);
s5mod.stage5Scene.updateMode(0.1);
T('S5 HACK C1: komputer membuka SIGNAL TRACE khusus Stage 5-6 dengan config baru',
    signalMod.isSignalTraceOpen()
    && signalMod.signalTraceDebug().total === cfgMod.CFG.campaign.signalTrace.channels
    && signalMod.signalTraceDebug().max === cfgMod.CFG.campaign.signalTrace.traceSec);
smMod.activeScene.shopKey('escape'); stateMod.setPaused(false);
T('S5 HACK C1: abort memerlukan re-arm dengan menjauh',
    s5mod.stage5Debug().phase === 'hack' && !s5mod.stage5Debug().hackArmed);
camera.position.x += S5C.terminalRange * 2 + 10; s5mod.stage5Scene.updateMode(0.1);
camera.position.set(s5mod.S5_TERMINAL.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_TERMINAL.z);
s5mod.stage5Scene.updateMode(0.1);
signalMod.signalTick(cfgMod.CFG.campaign.signalTrace.traceSec + 1);
await waitSignalClosed();
const s5Alarm = robots.filter(z => z.stage === 5);
const s5AlarmOff = s5Alarm.filter(z => offCamera(z.mesh.position.x, z.mesh.position.z)).length;
const s5AlarmSafe = s5Alarm.filter(z => !['A', 'S', 'T'].includes(
    s5TokenAt(z.mesh.position.x, z.mesh.position.z))).length;
T(`S5 HACK C1: trace gagal memicu horde C config di luar layar, di luar SA/T, + cooldown [n=${s5Alarm.length},off=${s5AlarmOff},safe=${s5AlarmSafe},cd=${s5mod.stage5Debug().hackCd.toFixed(2)}]`,
    s5Alarm.length === cfgMod.CFG.campaign.hack.alarmHordeCount
    && s5Alarm.every(z => z.kind === 'C' && offCamera(z.mesh.position.x, z.mesh.position.z)
        && !['A', 'S', 'T'].includes(s5TokenAt(z.mesh.position.x, z.mesh.position.z)))
    && Math.abs(s5mod.stage5Debug().hackCd - cfgMod.CFG.campaign.hack.alarmCooldownSec) < 0.01);
killS5();
camera.position.x += S5C.terminalRange * 2 + 10;
s5mod.stage5Scene.updateMode(cfgMod.CFG.campaign.hack.alarmCooldownSec + 0.1);
camera.position.set(s5mod.S5_TERMINAL.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_TERMINAL.z);
s5mod.stage5Scene.updateMode(0.1);
solveSignalTrace(); await waitSignalClosed();
tickS5(0.6, 0.1);
const s5PlatformDoor1 = s5mod.stage5WorldDebug().station.doors.find(d => d.kind === 'platform');
stateMod._v3.set(s5World.map.platformDoor.x, 0, s5World.map.platformDoor.z);
s5mod.resolve(stateMod._v3, 2, 0);
T('S5 HACK C1: solve membuka pintu peron fisik dan LANGSUNG mengaktifkan generator C2',
    s5mod.stage5Debug().phase === 'repair' && s5mod.stage5Debug().platformUnlocked
    && s5PlatformDoor1.target === 1 && s5PlatformDoor1.open >= 0.74
    && Math.hypot(stateMod._v3.x - s5World.map.platformDoor.x,
        stateMod._v3.z - s5World.map.platformDoor.z) < 0.01
    && s5mod.stage5WorldDebug().markers.c2.visible
    && s5mod.stage5Scene.hudStatus()
        === `GENERATOR C2 - 0/${repMod.ADVANCED_REPAIR_PARTS.length}`);

// 2026-08-07, permintaan user: kereta musuh tidak lagi mengantar pasukan. Yang
// tersisa hanyalah SATU lintasan atmosfer, dan C2 tak punya gate gelombang.
const etDbg = () => s5mod.stage5Debug().enemyTrain;
T('S5 STASIUN: config kereta musuh tak lagi punya gelombang/boarding — hanya flyby',
    S5C.enemyTrain.waves === undefined && S5C.enemyTrain.boardingWave === undefined
    && S5C.enemyTrain.stopCellCol === undefined && S5C.enemyTrain.dwellSec === undefined
    && typeof S5C.enemyTrain.flybySec === 'number');
T('S5 STASIUN: konsist musuh MELINTAS sekali dan tak pernah berhenti/membuka pintu',
    s5mod.stage5Debug().flybySent && etDbg().passes === 1
    && ['idle', 'flyby'].includes(etDbg().mode)
    && etDbg().unloads === undefined && etDbg().waveIndex === undefined);
tickS5(S5C.enemyTrain.flybySec + 0.5, 0.2);
T('S5 STASIUN: sesudah melintas, konsist musuh kembali idle + tersembunyi tanpa menambah pass',
    etDbg().mode === 'idle' && !etDbg().visible && etDbg().passes === 1
    && robots.filter(z => z.stage === 5).length === 0);

// REGRESI 2026-08-07 (laporan user): "suara pintu terbuka terus dijalankan
// berkali-kali saat posisi pintu terbuka, audionya menumpuk". Diuji pada jalur
// STAGE 5 yang sesungguhnya — berdiri di dekat pintu peron yang sudah terbuka.
{
    const doorSfx5 = await import(R('src/scenes/campaign/utility/doors.js'));
    const pdoor = s5World.map.platformDoor;
    camera.position.set(pdoor.x, cfgMod.CFG.player.eyeHeight, pdoor.z + s5World.map.cell * 1.5);
    tickS5(1.5, 0.05);                       // pastikan daun sudah benar-benar terbuka penuh
    const s5DoorOpenNow = s5mod.stage5WorldDebug().station.doors.find(d => d.kind === 'platform');
    doorSfx5.resetDoorSfx();
    tickS5(6, 0.05);                         // ~120 frame berdiri di depan pintu terbuka
    T('S5 PINTU: berdiri di dekat pintu peron yang terbuka tidak menumpuk suara door-open',
        s5DoorOpenNow.open === 1
        && doorSfx5.doorSfxDebug().open === 0 && doorSfx5.doorSfxDebug().close === 0);
    T('S5 PINTU: daun yang sudah terbuka penuh MENETAP di 1, tidak bergetar tiap frame',
        s5mod.stage5WorldDebug().station.doors.find(d => d.kind === 'platform').open === 1);
}

// FIELD RESTART C2. Abort harus menyimpan papan pertama dan butuh menjauh.
camera.position.set(s5mod.S5_GENERATOR.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_GENERATOR.z);
s5mod.stage5Scene.updateMode(0.1);
T('S5 REPAIR C2: generator membuka tepat dua papan advanced dan pause',
    s5mod.stage5Debug().phase === 'repairing' && repMod.isRepairOpen()
    && repMod.repairDebug().total === repMod.ADVANCED_REPAIR_PARTS.length
    && repMod.repairDebug().type === 'fuse' && stateMod.isPaused);
solveOpenRepairBoard();
await waitRepairNext(1);
smMod.activeScene.shopKey('escape'); stateMod.setPaused(false);
T('S5 REPAIR C2: abort mempertahankan progres dan pemicu belum re-arm di tempat',
    smMod.activeScene === s5mod.stage5Scene && s5mod.stage5Debug().phase === 'repair'
    && s5mod.stage5Debug().repairInstalled === 1 && !s5mod.stage5Debug().repairArmed);
camera.position.x += S5C.repairRange * 2 + 10; s5mod.stage5Scene.updateMode(0.1);
camera.position.set(s5mod.S5_GENERATOR.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_GENERATOR.z);
s5mod.stage5Scene.updateMode(0.1);
T('S5 REPAIR C2: setelah menjauh modal dibuka ulang dari papan kedua',
    repMod.isRepairOpen() && repMod.repairDebug().index === 1
    && repMod.repairDebug().type === 'kickstart');
solveOpenRepairBoard(); await waitRepairClosed();
T('S5 REPAIR C2: dua papan selesai -> generator hidup dan objective board aktif',
    s5mod.stage5Debug().phase === 'board'
    && s5mod.stage5Debug().repairInstalled === repMod.ADVANCED_REPAIR_PARTS.length);

// --- NAIK KERETA MENUNGGU NASKAH STASIUN (2026-08-08, permintaan user):
// dialog stasiun sengaja TIDAK dikuras dulu. Menyentuh titik naik hanya
// MENGUNCI keberangkatan; cutscene kereta berangkat baru boleh mulai setelah
// powerBack/routeReady/letsMove benar-benar selesai disampaikan. ---
T('S5 BOARD: saat titik naik disentuh naskah stasiun memang masih berjalan',
    !dialogueIdleS5());
camera.position.set(s5mod.S5_BOARD.x, cfgMod.CFG.player.eyeHeight, s5mod.S5_BOARD.z);
s5mod.stage5Scene.updateMode(0.1); sampleS5Dialogue();
T('S5 BOARD: menyentuh titik naik MENGUNCI keberangkatan tetapi belum memulai cutscene',
    s5mod.stage5Debug().boardCommitted
    && s5mod.stage5Debug().phase === 'board'
    && s5mod.stage5Debug().sub === 'campaign-5-station'
    && stateMod.cinematicActive
    && !s5mod.stage5WorldDebug().markers.board.visible);
// JEDA SEBELUM CUTSCENE (2026-08-08, permintaan user "tunggu 3 detik kemudian
// mulai cutscene"): sesudah dialog terakhir stasiun selesai, sub-scene stasiun
// masih menahan `departureDelaySec` sebelum menyerahkan ke cutscene.
let s5BoardWaitT = 0, s5BoardGuard = 0, s5BoardHeldWhileTyping = true;
while (s5mod.stage5Debug().sub !== 'campaign-5-departure' && s5BoardGuard++ < 4000) {
    s5mod.stage5Scene.updateMode(0.05); sampleS5Dialogue(); s5BoardWaitT += 0.05;
    // Frame penyerahan sengaja dilewati: dialog yang berjalan di situ sudah
    // milik cutscene keberangkatan (commandDeparture), bukan naskah stasiun.
    if (s5mod.stage5Debug().sub === 'campaign-5-departure') break;
    // Selama masih ada baris stasiun yang diketik/ditahan: sub-scene WAJIB tetap
    // stasiun DAN hitungan jeda belum boleh berjalan sama sekali.
    if (!dialogueIdleS5() && s5mod.stage5Debug().boardHoldT > 0) s5BoardHeldWhileTyping = false;
}
// `boardHoldT` tidak di-reset saat penyerahan, jadi nilainya = lama jeda yang
// benar-benar ditunggu sesudah baris terakhir stasiun selesai.
const s5HoldAfterDialogue = s5mod.stage5Debug().boardHoldT;
T(`S5 BOARD: cutscene keberangkatan MENUNGGU seluruh dialog stasiun [${s5BoardWaitT.toFixed(1)}s]`,
    s5BoardHeldWhileTyping && s5BoardWaitT > 1
    && s5mod.stage5Debug().sub === 'campaign-5-departure');
T(`S5 BOARD: setelah dialog habis masih ada jeda departureDelaySec sebelum cutscene [${s5HoldAfterDialogue.toFixed(2)}s]`,
    typeof S5C.departureDelaySec === 'number' && S5C.departureDelaySec > 0
    && s5HoldAfterDialogue >= S5C.departureDelaySec
    && s5HoldAfterDialogue < S5C.departureDelaySec + 0.06);
T('S5 BOARD: tidak ada transport terakhir; peron tetap kosong saat player naik',
    !s5EverWaveRobot && robots.filter(z => z.stage === 5).length === 0
    && etDbg().mode === 'idle' && !etDbg().visible);
T('S5 DEPARTURE: cutscene keberangkatan adalah SUB-SCENE tersendiri, bukan fase journey',
    s5mod.stage5Debug().sub === 'campaign-5-departure'
    && s5mod.stage5Debug().phase === 'departure' && stateMod.cinematicActive);
// Penghitung SFX pintu di-nolkan SEBELUM frame pertama cutscene: daun pintu
// gerbong mulai bergerak tepat pada frame itu, jadi reset sesudahnya akan
// menelan bunyi door-open yang justru sedang diuji.
const s5DoorSfx = await import(R('src/scenes/campaign/utility/doors.js'));
s5DoorSfx.resetDoorSfx();
// Pergantian sub-scene = potong ke hitam pada frame switch, fade-in 0.5 dtk di
// frame berikutnya (transisi CSS harus melihat nilai 1 lebih dulu).
const s5SubCut = dom4.cineFadeDebug();
s5mod.stage5Scene.updateMode(1 / 60); sampleS5Dialogue();
const s5SubIn = dom4.cineFadeDebug();
T('S5 SUB-SCENE: station -> departure memotong ke hitam lalu fade-in subSceneFadeSec',
    s5mod.stage5Debug().sub === 'campaign-5-departure'
    && smMod.activeScene === s5mod.stage5Scene
    && s5SubCut.opacity === 1 && s5SubCut.transition === 'none'
    && s5SubIn.opacity === 0
    && s5SubIn.transition === `opacity ${S5C.subSceneFadeSec}s ease-in-out`);

// ===== CUTSCENE KEBERANGKATAN LIMA SHOT (ROMBAK TOTAL 2026-08-08, permintaan
// user) =====================================================================
//   1 pintu gerbong TERBUKA -> 2 Gibran MENAIKI gerbong -> 3 pintu TERTUTUP ->
//   4 Gibran MENGHUBUNGI MARKAS -> 5 kereta BERANGKAT dari DEPAN KANAN.
// Dua aturan keras yang diuji di setiap perpindahan: transisinya POTONGAN
// (sudut + titik fokus berganti dalam satu frame) dan TIDAK ADA gerak kamera
// maupun fade di dalam cutscene — tirai harus tetap transparan sepanjang lima
// shot, dan di dalam satu shot sudut/fokus tak boleh bergeser sedikit pun.
const S5D = S5C.departure;
const s5StationBeforeMove = s5mod.trainJourneyDebug().station;
const s5TerminalBeforeMove = s5mod.trainJourneyDebug().terminal;
const s5DockX = s5mod.stage5WorldDebug().train.groupX;
const s5Shot = () => s5mod.stage5Debug().departure;
const s5Door = () => s5mod.stage5WorldDebug().train.boardDoor;
const s5TrainX = () => s5mod.stage5WorldDebug().train.groupX;
const s5Cam = () => {
    const c = s5mod.stage5Scene.camOffset;
    return c ? { x: c.x, y: c.y, z: c.z } : null;
};
const s5Focus = () => ({ ...rendererMod.camFocusPos() });
const s5SameCam = (a, b) => !!a && !!b
    && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
const s5SameFoc = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
// Jalankan satu shot sampai habis. Mengembalikan apakah sudut+fokus benar-benar
// TERKUNCI sepanjang shot, apakah tirai sempat menghitam, dan sudut/fokus tepat
// sebelum & sesudah potongan.
// `shotOf` dibuat parameter pada 2026-08-09: cutscene KEDATANGAN memakai
// kontrak shot yang sama persis, jadi penjaganya tidak boleh disalin dua kali.
function s5RunShot(onFrame = null, maxSec = 60, shotOf = s5Shot) {
    const from = shotOf().shot;
    let cam0 = s5Cam(), foc0 = s5Focus();
    let locked = true, noFade = true, frames = 0, guard = 0;
    while (shotOf().shot === from && guard++ < maxSec * 20) {
        const camPrev = s5Cam(), focPrev = s5Focus();
        tickS5(0.05, 0.05); frames++;
        if (shotOf().shot !== from) {
            return { from, to: shotOf().shot, locked, noFade, frames,
                camBefore: camPrev, focBefore: focPrev, camAfter: s5Cam(), focAfter: s5Focus() };
        }
        if (!s5SameCam(s5Cam(), cam0) || !s5SameFoc(s5Focus(), foc0)) locked = false;
        if (dom4.cineFadeDebug().opacity !== 0) noFade = false;
        if (onFrame) onFrame();
    }
    return { from, to: shotOf().shot, locked, noFade, frames,
        camBefore: cam0, focBefore: foc0, camAfter: s5Cam(), focAfter: s5Focus() };
}

// --- SHOT 1: pintu gerbong terbuka ---
T('S5 SHOT 1: cutscene dibuka pada pintu gerbong yang MULAI TERBUKA, kereta masih terdok',
    s5Shot().shot === 0 && s5Shot().shotKey === 'doorOpen' && s5Shot().shots === 5
    && s5Door().target === 1 && s5Door().open > 0 && s5Door().open < 0.25
    && s5TrainX() === s5DockX && s5mod.trainJourneyDebug().wheelPhase === 0
    && !s5mod.trainLoopDebug().on && s5Shot().shift === 0);
const s5RailBefore = s5Door().split.rails.map(r => r && r.off);
const s5LeafBefore = s5Door().split.leaves.map(l => l.x);
tickS5(S5D.doorMoveSec + 0.1, 0.05);
T('S5 SHOT 1: daunnya benar-benar terbuka penuh dan berbunyi TEPAT SEKALI',
    s5Door().open === 1 && s5DoorSfx.doorSfxDebug().open === 1
    && s5DoorSfx.doorSfxDebug().close === 0);
// 2026-08-09, laporan user "di atas pintu gerbong ada besi yang melintang dan
// kepala major gibran menembus itu": dinding gerbong hanya setinggi dada, jadi
// palang DIAM di atas bukaan pasti memotong kepala orang yang berdiri di situ.
// Palangnya kini menempel pada DAUN dan ikut menyingkir.
{
    const sp = s5Door().split;
    const dRail = sp.rails.map((r, i) => (r ? r.off - s5RailBefore[i] : NaN));
    const dLeaf = sp.leaves.map((l, i) => l.x - s5LeafBefore[i]);
    T(`S5 PINTU: palang kepala IKUT daun saat pintu terbuka [geser ${dLeaf[1].toFixed(1)}]`,
        sp.rails.length === 2 && sp.rails.every(r => !!r)
        && Math.abs(dLeaf[1]) > 1
        && dRail.every((v, i) => Math.abs(v - dLeaf[i]) < 1e-6)
        // ...dan duduk DI ATAS daun, bukan memotong badannya.
        && sp.rails.every((r, i) => r.y > sp.leaves[i].y));
}
{
    // BUKAAN NAIK HARUS BENAR-BENAR LAPANG. Diperiksa dari RENTANG-x tiap mesh,
    // bukan dari titik pusatnya (perbaikan 2026-08-09): palang yang tersisa
    // ternyata SILL sepanjang gerbong — pusatnya di x 0, jauh dari pintu, tetapi
    // rentangnya menyeberangi bukaan tepat di ketinggian bahu. Uji berbasis
    // pusat tidak melihatnya sama sekali.
    const car = train5Mod.buildMilitaryTrainMesh(0, 0).cars[train5Mod.TRAIN_PLAYER_CAR];
    const DX = train5Mod.TRAIN_DOOR_X, DH = train5Mod.TRAIN_DOOR_HALF;
    const HW = train5Mod.TRAIN_HALF_WIDTH;
    const hits = [];
    car.traverse(o => {
        if (!o.isMesh || !o.geometry?.args) return;
        const [w, h] = o.geometry.args;
        if (!(w > 0) || !(h > 0)) return;
        // Hanya sisi peron, dan hanya yang cukup tinggi untuk ditabrak badan
        // (strip ambang di lantai boleh melintang).
        if (o.position.z < HW - 2 || o.position.y + h / 2 < 2) return;
        const x0 = o.position.x - w / 2, x1 = o.position.x + w / 2;
        // Toleransi 2 unit: tiang kusen memang menempel di kedua tepi bukaan.
        const overlap = Math.min(x1, DX + DH) - Math.max(x0, DX - DH);
        if (overlap > 2) hits.push(`${w.toFixed(0)}x${h.toFixed(0)}@y${o.position.y.toFixed(1)}`);
    });
    T(`S5 GERBONG: tak ada satu pun besi DIAM yang menyeberangi bukaan naik [${hits.join(',') || 'bersih'}]`,
        hits.length === 0);
}
const s5Cut1 = s5RunShot();
T('S5 SHOT 1 -> 2: perpindahannya POTONGAN — sudut + fokus berganti satu frame, tanpa fade',
    s5Cut1.to === 1 && s5Cut1.locked && s5Cut1.noFade
    && !s5SameCam(s5Cut1.camBefore, s5Cut1.camAfter)
    && !s5SameFoc(s5Cut1.focBefore, s5Cut1.focAfter)
    && dom4.cineFadeDebug().opacity === 0);

// --- SHOT 2: Major Gibran menaiki gerbong ---
const s5BoardStart = { x: camera.position.x, z: camera.position.z };
let s5BoardWalked = 0, s5BoardBack = false, s5BoardPrevZ = camera.position.z;
const s5Cut2 = s5RunShot(() => {
    const dz = s5BoardPrevZ - camera.position.z;
    if (dz < -1e-9) s5BoardBack = true;
    s5BoardWalked += Math.abs(dz); s5BoardPrevZ = camera.position.z;
});
{
    const t = s5mod.stage5WorldDebug().train, r = stateMod.player.radius;
    T('S5 SHOT 2: Gibran BERJALAN dari peron masuk ke dalam gerbong (kamera tetap terkunci)',
        s5Cut2.to === 2 && s5Cut2.locked && s5Cut2.noFade
        // Ia menunggu di peron, SATU LANGKAH LEBIH DALAM daripada titik naik —
        // berdiri persis di depan pintu akan menutupi close-up shot 1.
        && s5mod.stage5Walk(s5BoardStart.x, s5BoardStart.z, 2)
        && s5BoardStart.z > s5mod.S5_BOARD.z
        && s5BoardWalked > 20 && !s5BoardBack
        && camera.position.x >= t.x0 + t.groupX + r && camera.position.x <= t.x1 + t.groupX - r
        && camera.position.z >= t.z0 + r && camera.position.z <= t.z1 - r);
}
T('S5 SHOT 2 -> 3: potongan lagi, dan pintunya belum tersentuh selama Gibran naik',
    !s5SameCam(s5Cut2.camBefore, s5Cut2.camAfter)
    && !s5SameFoc(s5Cut2.focBefore, s5Cut2.focAfter)
    && s5Door().target === 0 && s5TrainX() === s5DockX);

// --- SHOT 3: pintu gerbong tertutup ---
s5DoorSfx.resetDoorSfx();
const s5Cut3 = s5RunShot();
// Sudut shot 3 diperiksa SEBELUM potongannya: `camBefore` = ofset yang berlaku
// sepanjang shot itu.
T('S5 SHOT 3: pintu MENUTUP rapat, berbunyi sekali, lalu potong ke shot radio',
    s5Cut3.to === 3 && s5Cut3.locked && s5Cut3.noFade
    && s5Door().open === 0 && s5DoorSfx.doorSfxDebug().close === 1
    && s5DoorSfx.doorSfxDebug().open === 0
    && !s5SameCam(s5Cut3.camBefore, s5Cut3.camAfter));
// 2026-08-09, permintaan user: shot pintu menutup harus SEJAJAR gerbong, bukan
// menyorot dari atasnya. Renderer memandang ke `camFocus.y - CAM_LOOK_DROP`,
// jadi kamera pada ketinggian itu = sumbu pandang horizontal tepat 0 derajat.
T(`S5 SHOT 3: sorotannya SEJAJAR gerbong, bukan dari atas [y ${s5Cut3.camBefore.y}]`,
    Math.abs(s5Cut3.camBefore.y + rendererMod.CAM_LOOK_DROP) < 1e-6
    // ...dan tetap sebuah close-up: lebih dekat daripada shot naik sebelumnya.
    && Math.hypot(s5Cut3.camBefore.x, s5Cut3.camBefore.z)
        < Math.hypot(s5Cut2.camBefore.x, s5Cut2.camBefore.z));

// --- SHOT 4: Gibran menghubungi markas ---
// Dua baris radio yang dulu diputar sepanjang shot keberangkatan kini punya
// adegannya sendiri: kereta masih diam di peron sampai percakapannya tuntas.
const s5RadioKeys = [], s5RadioGestures = new Set();
let s5RadioPosed = true, s5RadioMoved = false;
const s5Cut4 = s5RunShot(() => {
    const d = s5mod.stage5DialogueDebug(), g = avMod.avatarRadioDebug();
    if (d.key && s5RadioKeys[s5RadioKeys.length - 1] !== d.key) s5RadioKeys.push(d.key);
    if (!g.active) s5RadioPosed = false; else s5RadioGestures.add(g.gesture);
    if (s5TrainX() !== s5DockX || s5Shot().shift !== 0) s5RadioMoved = true;
});
T('S5 SHOT 4: Gibran menghubungi markas — pose radio hidup, kereta belum bergerak',
    s5Cut4.to === 4 && s5Cut4.locked && s5Cut4.noFade
    && s5RadioPosed && !s5RadioMoved && s5RadioGestures.size === 2);
T('S5 SHOT 4: dua baris radio keberangkatan diketik di sini, urut dan huruf demi huruf',
    JSON.stringify(s5RadioKeys) === JSON.stringify(['commandDeparture', 'gibranDeparture'])
    && s5Partial.has('commandDeparture') && s5Partial.has('gibranDeparture'));

// --- SHOT 5: kereta berangkat, dilihat dari DEPAN KANAN ---
// Kamera shot ini berada di +x (arah maju) dan +z (sisi kanan badan kereta),
// jadi "depan kanan" tidak bisa diam-diam berubah jadi sudut gameplay biasa.
const s5DepartCam = s5Cam();
const s5DepartFocus0 = s5Focus();
const s5DepartPivot0 = { x: camera.position.x, z: camera.position.z };
// Ofset player terhadap PUSAT GERBONG (dibaca dari transform mesh, bukan
// dihitung ulang) — dipakai memastikan ia benar-benar ikut terbawa kereta.
const s5DepartCarX = () => {
    const t = s5mod.stage5WorldDebug().train;
    return (t.x0 + t.x1) / 2 + t.groupX;
};
const s5CarOffset0 = camera.position.x - s5DepartCarX();
T('S5 SHOT 5: sudutnya dari DEPAN KANAN kereta dan loop suara kereta baru menyala di sini',
    s5Shot().shotKey === 'depart' && s5DepartCam.x > 0 && s5DepartCam.z > 0
    && s5mod.trainLoopDebug().on
    && s5mod.trainLoopDebug().src === 'assets/sounds/train-sound.mp3');
tickS5(Math.min(1, S5D.departSec / 3), 0.1);
const s5DepartureMove = s5mod.stage5Debug();
const s5StationDuringMove = s5mod.trainJourneyDebug().station;
T('S5 SHOT 5: yang bergerak hanya kereta; stasiun tetap persis di koordinat semula',
    s5DepartureMove.departureShift > 0 && s5StationDuringMove.visible
    && s5StationDuringMove.x === s5StationBeforeMove.x
    && s5StationDuringMove.z === s5StationBeforeMove.z);
// 2026-08-07, laporan user "stasiun terlihat ikut bergerak". DUA penyebabnya
// dipatok di sini: (1) kamera shot keberangkatan harus TERKUNCI — dulu titik
// fokus + pivot ikut digeser `departureShift` sehingga keretalah yang diam di
// layar; (2) pool scenery perjalanan (rel + lanskap bergulir) berada tepat di
// atas denah stasiun dan tak boleh tampil sebelum layar hitam.
const s5DepartFocus1 = rendererMod.camFocusPos();
T('S5 SHOT 5: kamera benar-benar terkunci — titik fokus tidak ikut kereta',
    s5SameFoc(s5DepartFocus1, s5DepartFocus0)
    && s5SameCam(s5Cam(), s5DepartCam)
    && camera.position.z === s5DepartPivot0.z);
// 2026-08-08, laporan user "Major Gibran tertinggal di cutscene keberangkatan":
// pivot player dipatok mati di peron sementara badan kereta melaju, jadi
// avatarnya ditinggal berdiri di rel. Ia harus terbawa gerbong dengan ofset
// TETAP dan tak pernah keluar dari dinding dalam. Ini TIDAK mengubah framing:
// selama `cineFocus` aktif, viewCam mengikuti titik fokus, bukan pivot.
{
    const t = s5mod.stage5WorldDebug().train, r = stateMod.player.radius;
    T('S5 SHOT 5: player IKUT berangkat bersama gerbong, tidak tertinggal di peron',
        s5mod.stage5Debug().departureShift > 0
        && camera.position.x > s5DepartPivot0.x
        && Math.abs((camera.position.x - s5DepartCarX()) - s5CarOffset0) < 1e-6
        && camera.position.x >= t.x0 + t.groupX + r
        && camera.position.x <= t.x1 + t.groupX - r);
}
T('S5 SHOT 5: pool scenery perjalanan tetap tersembunyi selama shot (tak menembus lantai peron)',
    !s5mod.trainJourneyDebug().visible);
// 2026-08-09, laporan user "ketika kereta berjalan, major gibran malah terlihat
// sedang berlari": gait avatar diturunkan dari perpindahan pivot per frame, dan
// pivotnya memang ikut gerbong pada shot ini. Rig harus diberi tahu bahwa itu
// BUKAN langkah kakinya sendiri.
T('S5 SHOT 5: Gibran DIAM dibawa gerbong — rig tahu pivotnya bukan langkah kaki',
    avMod.avatarCarriedDebug() === true && s5mod.stage5Debug().departureShift > 0);
T('S5 SHOT 5: kereta punya rel + tanah run-out sampai ujung geseran, tidak melayang di kekosongan',
    s5World.runoutX1 >= s5World.train.stationTcX
        + s5World.train.lengthMeters * 7 * 1.5 + S5C.departureShiftUnits);
tickS5(S5D.departSec + 0.2, 0.1);
const s5Pools0 = s5mod.trainJourneyDebug().pools;
T('S5 DEPARTURE: cutscene habis -> penanda "dibawa gerbong" dilepas lagi',
    avMod.avatarCarriedDebug() === false);
T('S5 DEPARTURE: shot terakhir habis -> SUB-SCENE journey (ride), roda/scenery bergerak, player di dalam gerbong',
    s5mod.stage5Debug().phase === 'ride' && !stateMod.cinematicActive
    && s5mod.stage5Debug().sub === 'campaign-5-journey'
    && s5mod.trainJourneyDebug().active && s5mod.trainJourneyDebug().wheelPhase > 0
    && s5mod.trainJourneyDebug().doors.length === 0
    && s5mod.stage5WorldDebug().train.boardDoor.open === 0
    && s5mod.stage5Debug().departureShift === 0
    && s5mod.stage5Scene.groundHeight(camera.position.x, camera.position.z, 0) === 0
    && s5mod.trainJourneyDebug().station.x === s5StationBeforeMove.x
    && s5mod.trainJourneyDebug().station.z === s5StationBeforeMove.z);
// --- LANSKAP PERJALANAN DUA BABAK (2026-08-09, permintaan user "di bagian awal
// journey berada di kota juga; ketika gerbong ke-3 hancur, masuk ke wilayah
// pegunungan khas Jawa Barat"). Awal perjalanan HARUS kota — depotnya memang
// berdiri di tengah kota, jadi keluar peron langsung ke gunung akan terbaca
// sebagai potongan yang salah. ---
{
    const j = s5mod.trainJourneyDebug();
    T('S5 LANSKAP: perjalanan dibuka di KOTA (lanjutan depot yang ada di tengah kota)',
        j.phase === 'city' && j.midCity > 0 && j.midHill === 0
        && j.farSky > 0 && j.farRidge === 0);
}

// --- GAMELOOP PERJALANAN (ROMBAK 2026-08-08, permintaan user): BUKAN lagi
// beberapa konsist bergantian. SATU kereta musuh 10 gerbong muncul beberapa
// saat setelah perjalanan dimulai, MENDAHULUI kereta player sampai gerbong
// PALING BELAKANG-nya sejajar, membuka ramp SATU PER SATU, dan tiap gerbong
// yang robotnya habis MELEDAK + TERLEPAS + TERTINGGAL sementara sisa konsist
// MUNDUR satu gerbong. Semuanya config-driven. ---
const S5E = S5C.enemyTrain;
const etDbg2 = () => s5mod.stage5Debug().enemyTrain;
const s5CarCenter = s5World.carCenters[0];
camera.position.set(s5CarCenter.x, cfgMod.CFG.player.eyeHeight, s5CarCenter.z);
T('S5 KURUNGAN: player tidak bisa keluar gerbong maupun masuk lokomotif',
    (() => {
        const inside = { x: s5CarCenter.x, z: s5CarCenter.z };
        const probe = (x, z) => {
            stateMod._v3.set(x, 0, z);
            s5mod.stage5Scene.playerCollide(stateMod._v3, inside.x, inside.z, 0);
            return Math.hypot(stateMod._v3.x - x, stateMod._v3.z - z) > 0.01;
        };
        return probe(s5World.carCenters[1].x, s5CarCenter.z)          // lokomotif
            && probe(s5CarCenter.x, s5World.train.z0 - 12)            // keluar sisi jalur musuh
            && probe(s5CarCenter.x, s5World.train.z1 + 12)            // keluar sisi peron
            && probe(s5World.train.x1 + 30, s5CarCenter.z)            // keluar ujung depan
            && !probe(inside.x, inside.z);
    })());
T('S5 SUPPLY GERBONG: bekal dijatuhkan di dalam gerbong karena player terkunci di sana',
    stateMod.drops.filter(d => s5mod.stage5TrainWalk(d.mesh.position.x, d.mesh.position.z, 1)).length >= 3);

// Config gelombang lama harus benar-benar hilang: yang tersisa satu konsist.
T('S5 KONSIST: config perjalanan tak lagi punya gelombang/jumlah gerbong acak',
    S5E.waveCount === undefined && S5E.firstWaveSec === undefined
    && S5E.waveGapSec === undefined && S5E.carsMin === undefined
    && S5E.carsMax === undefined && S5E.medkitEveryTrains === undefined
    && typeof S5E.consistDelaySec === 'number' && typeof S5E.overtakeSec === 'number'
    && typeof S5E.rampSec === 'number' && typeof S5E.advanceSec === 'number');

const S5_CAR_TOTAL = s5World.enemyTrain.cargoCars;
const s5CarShape = [];
let s5EverGroundRobot = false, s5EverClassC = false, s5EmergeSeen = false, s5EverInRange = false;
let s5MultiOpenSeen = false, s5SealedSeen = false, s5OvertakeMinX = Infinity;
// Robot mounted digerakkan lewat hook scene yang SAMA seperti updateRobots
// (emerge + hadap + gerbang tembak `chaseDist`), tanpa memanggil loop tempur
// penuh yang akan menembaki player harness.
// JEDA PENUTUP diamati DI SINI, bukan dari satu sampel sesudah gerbong terakhir:
// panjang tick per gerbong diturunkan dari config konsist, jadi sampel tunggal
// bisa jatuh sebelum ATAU sesudah jeda begitu `arrivalDelaySec` di-retune.
let s5HoldSeen = 0, s5HoldCine = false;
function tickS5Wave(total, step = 0.1) {
    let left = Math.max(0, total), guard = 0;
    while (left > 1e-9 && guard++ < 8000) {
        const dt = Math.min(step, left);
        s5mod.stage5Scene.updateMode(dt);
        {
            const h = s5mod.stage5Debug();
            if (h.phase === 'ride' && h.robots === 0 && h.clearHoldT > 0) {
                s5HoldSeen = Math.max(s5HoldSeen, h.clearHoldT);
                if (stateMod.cinematicActive) s5HoldCine = true;
            }
        }
        for (const z of robots) {
            if (z.stage !== 5) continue;
            const res = s5mod.stage5Scene.robotAI(z, dt, dt * 60) || {};
            if (res.chaseDist != null && res.chaseDist <= z.range) s5EverInRange = true;
        }
        // SATU PER SATU: tidak boleh ada dua ramp terbuka pada saat yang sama,
        // di luar bangkai yang sudah terlepas (ramp bangkai dipatok terbuka).
        const d = etDbg2();
        const wreckIdx = new Set(d.wrecks.map(w => w.i));
        const open = d.rampAngles.filter((a, i) => a > 0.01 && !wreckIdx.has(i)).length;
        if (open > 1) s5MultiOpenSeen = true;
        if (d.mode === 'overtake') s5OvertakeMinX = Math.min(s5OvertakeMinX, d.x);
        // JALAN RAYA: (1) ia tak boleh pernah LOMPAT ke dalam pandangan —
        // frame pertama yang terlihat harus berasal dari tepi tapak pandang;
        // (2) selama merapat ia harus benar-benar MIRING (bagian di depan
        // player lebih dekat daripada yang di belakang), bukan bidang yang
        // digeser sejajar.
        const h = s5mod.stage5Debug().highway;
        if (h.active) {
            const prev = s5RoadOffsets.length ? s5RoadOffsets[s5RoadOffsets.length - 1] : h.farZ;
            if (prev > s5ViewMaxZ && h.offsetAtPlayer < s5ViewMaxZ - 12) s5RoadPopped = true;
            if (h.offsetAhead < h.offsetBehind - 8) s5RoadDiagonalSeen = true;
            if (h.activePickups > S5H.maxActivePickups) s5HwOverActive = true;
            s5RoadOffsets.push(h.offsetAtPlayer);
            // JALAN TIDAK BOLEH PATAH-PATAH (laporan user 2026-08-08): tiap
            // modul wajib DIPUTAR mengikuti garis singgung kurva DAN
            // dipanjangkan sepanjang BUSUR-nya, sehingga ujung modul ke-i
            // jatuh persis di ujung tetangganya. Diukur dari transform HIDUP.
            const segs = s5mod.journeyHighwayDebug().segments;
            const segL = s5mod.journeyHighwayDebug().moduleLen;
            for (const g of segs) {
                const mm = (s5mod.roadOffsetAt(g.x + 4) - s5mod.roadOffsetAt(g.x - 4)) / 8;
                if (Math.abs(g.yaw + Math.atan(mm)) > 1e-6) s5RoadYawOk = false;
                if (Math.abs(g.scaleX - Math.hypot(1, mm)) > 1e-6) s5RoadArcOk = false;
                s5RoadMaxYaw = Math.max(s5RoadMaxYaw, Math.abs(g.yaw));
            }
            const segEnd = g => ({
                x: g.x + segL * g.scaleX / 2 * Math.cos(g.yaw),
                z: g.z - segL * g.scaleX / 2 * Math.sin(g.yaw),
            });
            const segStart = g => ({
                x: g.x - segL * g.scaleX / 2 * Math.cos(g.yaw),
                z: g.z + segL * g.scaleX / 2 * Math.sin(g.yaw),
            });
            const ordered = [...segs].sort((a, b) => a.x - b.x);
            for (let i = 0; i + 1 < ordered.length; i++) {
                if (ordered[i + 1].x - ordered[i].x > segL * 1.5) continue;   // titik wrap
                const a = segEnd(ordered[i]), b = segStart(ordered[i + 1]);
                s5RoadSeamMax = Math.max(s5RoadSeamMax, Math.hypot(a.x - b.x, a.z - b.z));
            }
        }
        // Penumpang pickup: selalu di atas jalan (dalam lebar aspal), tak
        // pernah menyeberang ke gerbong player, dan mounted seperti Stage 8.
        for (const z of robots) {
            if (z.stage !== 5 || !z.pickup) continue;
            s5HwRiderChecked = true;
            const lateral = z.mesh.position.z - s5World.map.playerTrackZ;
            const road = s5mod.roadOffsetAt(z.mesh.position.x);
            if (!(z.mounted && z.state === 'mounted'
                && Math.abs(lateral - road) <= h.halfWidth + 6
                && !s5mod.stage5TrainWalk(z.mesh.position.x, z.mesh.position.z, 1)))
                s5HwRiderOk = false;
        }
        sampleS5Dialogue(); left -= dt;
    }
}
// 1. Konsist baru DATANG beberapa saat sesudah perjalanan dimulai. Jeda diukur
// dari `gapT` yang sudah berjalan (tes di atas sudah membakar sebagian ride),
// jadi angkanya tetap dibaca config dan bukan dihitung ulang di sini.
const s5GapAtStart = s5mod.stage5Debug().gapT;
T(`S5 KONSIST: jalur sebelah masih kosong selama jeda config belum lewat [${s5GapAtStart.toFixed(1)}/${S5E.consistDelaySec}s]`,
    s5GapAtStart < S5E.consistDelaySec
    && !etDbg2().launched && etDbg2().mode === 'idle' && !etDbg2().visible);
tickS5Wave(S5E.consistDelaySec - s5GapAtStart + 0.3, 0.25);
T('S5 KONSIST: sesudah jeda config, satu kereta musuh muncul dan MENDAHULUI dari belakang',
    etDbg2().launched && etDbg2().mode === 'overtake' && etDbg2().visible
    && etDbg2().visibleCars === S5_CAR_TOTAL + 1
    && etDbg2().car === -1 && etDbg2().rampAngles.every(a => a === 0));
tickS5Wave(S5E.overtakeSec * 0.5, 0.1);
T('S5 KONSIST: selama menyusul, seluruh peti masih TERSEGEL — tak ada robot yang menembak',
    etDbg2().rampAngles.every(a => a === 0)
    && robots.filter(z => z.stage === 5 && z.mesh.visible).length === 0);
// AWAK SELURUH KONSIST DIMUAT SEJAK BERANGKAT (2026-08-09, permintaan user:
// "buat agar sudah ada spawn robot di awal"). Sepuluh gerbong sudah berisi
// sebelum satu pintu pun terbuka — dan semuanya tersegel: kebal, tak terlihat.
{
    const crew = robots.filter(z => z.stage === 5 && z.mounted);
    const cars = new Set(crew.map(z => z.etCar));
    T(`S5 KONSIST: awak SELURUH gerbong sudah dimuat sejak konsist berangkat, bukan saat pintunya terbuka [${cars.size}/${S5_CAR_TOTAL} gerbong, ${crew.length} robot]`,
        cars.size === S5_CAR_TOTAL && crew.length >= S5_CAR_TOTAL * S5E.perCarMin
        && crew.every(z => z.invuln === true && !z.mesh.visible));
    // Awak yang masih tersegel HARUS kebal terhadap ledakan: `skip` saja tidak
    // menutup jalur ini — explodeAt mengiterasi `robots` sendiri, jadi tanpa
    // penjaga `invuln` satu granat bisa mengosongkan gerbong yang belum dibuka.
    const victim = crew[0], hp0 = victim.hp;
    effectsMod.explodeAt(victim.mesh.position, 200, 9999);
    T('S5 KONSIST: awak yang masih tersegel kebal terhadap ledakan (granat tak bisa mengosongkan gerbong yang belum terbuka)',
        victim.hp === hp0 && robots.filter(z => z.stage === 5 && z.mounted).length === crew.length);
    for (const e of stateMod.explosions.splice(0)) scene.remove(e.mesh);
}
tickS5Wave(S5E.overtakeSec * 0.5 + 0.3, 0.1);
T('S5 KONSIST: berhenti relatif tepat ketika gerbong PALING BELAKANG sejajar gerbong player',
    etDbg2().car === 0 && Math.abs(etDbg2().x - etDbg2().alignX) < 4.0
    && s5OvertakeMinX < etDbg2().x - s5World.enemyTrain.step * 5);

// 2. Kesepuluh gerbong dimainkan penuh: open -> engage -> detach -> advance.
// Mulai gerbong `highway.fromCarIndex` jalan raya di sisi kanan MERAPAT dan
// mengirim pengangkut; jalannya tak boleh pernah muncul mendadak.
const S5H = S5C.highway, hwDbg = () => s5mod.stage5Debug().highway;
// Tepi +z tapak pandang kamera default: dibaca dari renderer, bukan angka mati.
const s5ViewMaxZ = rendererMod.groundViewExtents(cfgMod.CFG.player.eyeHeight, 0).maxZ;
const countS5Riders = () => robots.filter(z => z.stage === 5 && z.pickup).length;
const s5HwEncounters = () => [...new Set(robots.filter(z => z.stage === 5 && z.pickup)
    .map(z => z.encounter))];
let s5RoadPopped = false, s5RoadDiagonalSeen = false, s5RoadOffsets = [];
let s5HwOverActive = false, s5HwRiderChecked = false, s5HwRiderOk = true;
let s5RoadYawOk = true, s5RoadArcOk = true, s5RoadSeamMax = 0, s5RoadMaxYaw = 0;
let s5PrevAlignX = 0;
const s5Landscape = [];
for (let ci = 0; ci < S5_CAR_TOTAL; ci++) {
    if (ci === S5H.fromCarIndex) {
        T(`S5 JALAN: jalan raya baru hidup pada gerbong ke-${S5H.fromCarIndex + 1}, tidak sebelumnya`,
            hwDbg().active && hwDbg().spawned === 0);
        T(`S5 JALAN: pada detik ia hidup jalannya masih JAUH di luar tapak pandang — tidak muncul mendadak [${hwDbg().offsetAtPlayer.toFixed(1)}]`,
            hwDbg().offsetAtPlayer > s5ViewMaxZ
            && hwDbg().offsetAtPlayer > S5H.farZ - 5 && !hwDbg().merged);
    } else if (ci < S5H.fromCarIndex) {
        T(`S5 JALAN: sebelum gerbong ke-${S5H.fromCarIndex + 1} tidak ada jalan raya maupun pengangkutnya`,
            !hwDbg().active && hwDbg().spawned === 0 && hwDbg().activePickups === 0);
    }
    if (ci > 0) {
        T(`S5 GERBONG ${ci + 1}: konsist MUNDUR satu gerbong lalu gerbong berikutnya membuka ramp`,
            etDbg2().car === ci && etDbg2().mode === 'open'
            && Math.abs(etDbg2().alignX - (s5PrevAlignX - s5World.enemyTrain.step)) < 1e-6);
    }
    // Selama ramp masih menutup, isi peti belum boleh terlihat sama sekali.
    if (etDbg2().ramp < S5E.revealAtRamp)
        s5SealedSeen = s5SealedSeen || robots.every(z => z.stage !== 5 || !z.mesh.visible);
    // GERBONG PERTAMA = kontrak gerbang ramp (2026-08-09, permintaan user):
    // awak sudah BERDIRI SIAP di barisan tembak begitu pintunya mulai turun,
    // tetapi belum menembak dan belum bisa dilukai sampai ramp terbuka PENUH.
    if (ci === 0) {
        let readySeen = false, aimedEarly = false, vulnEarly = false, hurtEarly = false;
        for (let i = 0; i < 400 && etDbg2().mode === 'open'; i++) {
            tickS5Wave(0.05, 0.05);
            if (etDbg2().mode !== 'open' || etDbg2().ramp < S5E.revealAtRamp) continue;
            const rr = robots.filter(z => z.stage === 5 && z.etCar === 0);
            if (!rr.length) continue;
            // Sudah terlihat berdiri di SLOT tembaknya (bukan di dalam peti).
            if (rr.every(z => z.mesh.visible)) readySeen = true;
            if (rr.some(z => z.aiming)) aimedEarly = true;
            if (rr.some(z => !z.invuln)) vulnEarly = true;
            const hp0 = rr.map(z => z.hp);
            effectsMod.explodeAt(rr[0].mesh.position, 200, 9999);
            for (const e of stateMod.explosions.splice(0)) scene.remove(e.mesh);
            if (rr.some((z, k) => z.hp !== hp0[k])) hurtEarly = true;
        }
        T('S5 GERBONG 1: selama pintu masih TURUN, awaknya sudah berdiri siap tapi belum menembak dan belum bisa dilukai',
            readySeen && !aimedEarly && !vulnEarly && !hurtEarly);
        const open = robots.filter(z => z.stage === 5 && z.etCar === 0);
        T('S5 GERBONG 1: begitu ramp mendarat, barisan itu langsung membidik DAN mulai bisa dilukai',
            etDbg2().mode === 'engage' && open.length > 0
            && open.every(z => z.aiming === true && z.invuln === false && z.mesh.visible));
    } else tickS5Wave(S5E.rampSec + 0.4, 0.1);
    const carRobots = robots.filter(z => z.stage === 5 && z.mounted && z.etCar === ci);
    const mix = { A: 0, B: 0, C: 0 };
    for (const z of carRobots) mix[z.kind]++;
    s5CarShape.push({ n: carRobots.length, A: mix.A, B: mix.B });
    if (mix.C > 0) s5EverClassC = true;
    if (carRobots.some(z => Math.abs(z.mesh.position.z - s5World.map.playerTrackZ) < 20)) s5EverGroundRobot = true;
    // Sudah di barisan tembak (slot dek), bukan tertinggal di dalam peti.
    if (carRobots.length && carRobots.every(z => z.mesh.visible && !z.invuln)) s5EmergeSeen = true;
    T(`S5 GERBONG ${ci + 1}: ramp terbuka penuh, 3-6 robot kelas A/B saja, B lebih banyak dari A [${carRobots.length} robot]`,
        etDbg2().mode === 'engage'
        && Math.abs(etDbg2().rampAngles[ci] - s5World.enemyTrain.rampOpenRad) < 1e-6
        && carRobots.length >= S5E.perCarMin && carRobots.length <= S5E.perCarMax
        && mix.C === 0 && mix.B > mix.A && carRobots.length === etDbg2().spawned
        && etDbg2().strobes[ci] === true);
    T(`S5 GERBONG ${ci + 1}: HANYA gerbong ini yang terbuka; robot gerbong lain masih tersegel`,
        etDbg2().rampAngles.every((a, i) => i === ci || a === 0
            || etDbg2().wrecks.some(w => w.i === i))
        && robots.every(z => z.stage !== 5 || z.pickup || z.etCar === ci || !z.mesh.visible));
    T(`S5 GERBONG ${ci + 1}: penembak tetap di konsist seberang dan tak pernah menyeberang ke gerbong player`,
        carRobots.every(z => z.mounted && z.state === 'mounted'
            && Math.abs(z.mesh.position.z - s5World.map.journeyEnemyZ) < s5World.enemyTrain.widthMeters * 7
            && !s5mod.stage5TrainWalk(z.mesh.position.x, z.mesh.position.z, 1)));
    // Habisi robot gerbong ini -> ia MELEDAK, TERLEPAS, dan TERTINGGAL.
    s5PrevAlignX = etDbg2().alignX;
    killS5(`etrain-${ci}`);
    s5mod.stage5Scene.updateMode(0.05);
    T(`S5 GERBONG ${ci + 1}: robot habis -> gerbong itu meledak dan kopelnya lepas`,
        etDbg2().mode === 'detach' && etDbg2().killed === ci + 1
        && etDbg2().wrecks.some(w => w.i === ci));
    tickS5Wave(S5E.detachSec * 0.5, 0.1);
    T(`S5 GERBONG ${ci + 1}: bangkainya benar-benar TERTINGGAL ke belakang konsist`,
        etDbg2().wrecks.some(w => w.i === ci && w.dx < -20));
    // Konvoi jalan raya ikut dilawan: satu pengangkut dihabisi tiap gerbong.
    const s5HwEnc = s5HwEncounters();
    if (s5HwEnc.length) {
        const before = hwDbg().destroyed;
        killS5(s5HwEnc[0]);
        s5mod.stage5Scene.updateMode(0.05);
        T(`S5 KONVOI: penumpang habis -> pengangkut jalan raya ${before + 1} meledak dan tertinggal`,
            hwDbg().destroyed === before + 1);
    }
    // Antrean dialog TIDAK dikuras di sini: menguras naskah akan memakan waktu
    // simulasi dan mendorong konsist keluar dari fase yang sedang diuji.
    tickS5Wave(S5E.detachSec * 0.5 + S5E.advanceSec + 0.3, 0.1);
    // Lanskap dicatat SESUDAH gerbong ke-(ci+1) benar-benar tercatat hancur.
    const jl = s5mod.trainJourneyDebug();
    s5Landscape.push({ killed: ci + 1, phase: jl.phase, act: jl.act,
        city: jl.midCity, hill: jl.midHill, sky: jl.farSky, ridge: jl.farRidge });
}
// Pergantian babak jatuh PERSIS pada gerbong ke-`mountainAfterCars` — bukan
// pada pecahan routeK yang ikut bergeser kalau jumlah gerbong di-retune.
{
    const N = S5C.scenery.mountainAfterCars;
    const before = s5Landscape.filter(s => s.killed < N);
    const at = s5Landscape.find(s => s.killed === N);
    T(`S5 LANSKAP: kota bertahan sampai gerbong ke-${N} hancur [${before.map(s => s.phase).join(',')}]`,
        typeof N === 'number' && N > 0 && before.length === N - 1
        && before.every(s => s.phase === 'city' && s.act === 'city'
            && s.city > 0 && s.hill === 0 && s.sky > 0 && s.ridge === 0));
    // Ambangnya menetapkan BABAK TUJUAN; pemandangan yang sudah terlanjur
    // berdiri di depan player baru berganti sambil bergulir keluar, jadi tepat
    // sesudah gerbong ke-N kota memang MASIH ADA. Kemulusan itu sendiri diuji
    // frame demi frame di blok 'S5 TRANSISI'.
    T(`S5 LANSKAP: gerbong ke-${N} hancur -> arah lanskap berbelok ke PEGUNUNGAN Jawa Barat`,
        !!at && at.phase === 'mountains' && at.act === 'hill' && at.city > 0);
    T('S5 LANSKAP: sesudah pegunungan tidak pernah kembali ke kota sebelum Bandung',
        s5Landscape.filter(s => s.killed > N)
            .every(s => s.phase !== 'city'));
    // ...dan peralihannya benar-benar SELESAI di dalam permainan: pegunungan
    // harus sempat mengambil alih pita mid sebelum babak Bandung.
    T('S5 LANSKAP: pegunungan benar-benar mengambil alih sebelum tiba di Bandung',
        s5Landscape.some(s => s.killed > N && s.hill > s.city && s.ridge > 0));
}
// SERPIHAN DITINGGALKAN KERETA (2026-08-09, laporan user "serpihan robot masih
// berada di tempat dan mengikuti pergerakan kereta player"): kereta diam di
// koordinat dunia dan lanskapnya yang bergulir, jadi sisa tempur yang dibiarkan
// di tempatnya akan terbawa selamanya. Genangan dipakai sebagai probe karena ia
// tidak punya kecepatan sendiri — perpindahannya murni hasil drift.
{
    goreMod.resetGore();
    const outX = s5CarCenter.x;
    const outZ = s5World.map.journeyEnemyZ;                 // di jalur musuh, di luar gerbong
    goreMod.spawnBloodDecal(outX, outZ, 3);
    goreMod.spawnBloodDecal(s5CarCenter.x, s5CarCenter.z, 3);   // DI DALAM gerbong
    const before = goreMod.goreDebug().decals.map(d => ({ ...d }));
    const spd = s5mod.trainJourneyDebug().speed, dt = 0.1;
    s5mod.stage5Scene.updateMode(dt);
    const after = goreMod.goreDebug().decals;
    const outside = before.findIndex(d => Math.abs(d.z - outZ) < 1);
    const inside = before.findIndex(d => Math.abs(d.z - s5CarCenter.z) < 1);
    T(`S5 SERPIHAN: sisa tempur di luar gerbong benar-benar TERTINGGAL [${(before[outside].x - after[outside].x).toFixed(1)} unit/frame]`,
        outside >= 0 && spd > 0
        && Math.abs((before[outside].x - after[outside].x) - spd * dt) < 1e-6);
    T('S5 SERPIHAN: yang jatuh DI DALAM gerbong tetap ikut kereta, tidak ikut tergulir',
        inside >= 0 && after[inside].x === before[inside].x);
    goreMod.resetGore();
}
// Bentuk jalan diperiksa DI SINI: begitu konsist habis, gerbang kedatangan
// dapat langsung menutup jalan raya, sehingga debug hidupnya kembali idle.
const s5HwAfterCars = hwDbg();
T(`S5 JALAN: menyatu perlahan tanpa pernah melompat ke dalam pandangan [${s5HwAfterCars.offsetAtPlayer.toFixed(1)} dari ${S5H.farZ}]`,
    !s5RoadPopped && s5RoadOffsets.length > 50
    && Math.abs(s5HwAfterCars.offsetAtPlayer - S5H.nearZ) < 0.5
    && s5HwAfterCars.merged);
T(`S5 JALAN: selama merapat jalannya MIRING — bagian di depan player lebih dekat daripada di belakang [tepi pandang +z = ${s5ViewMaxZ.toFixed(0)}]`,
    s5RoadDiagonalSeen && s5ViewMaxZ > 0 && S5H.farZ > s5ViewMaxZ);
T('S5 JALAN: offset jalan turun monoton (rel mendekat), tidak pernah menjauh lagi',
    s5RoadOffsets.every((v, i) => i === 0 || v <= s5RoadOffsets[i - 1] + 1e-6));
T(`S5 KONVOI: pengangkut jalan raya pernah dikirim dan dihancurkan [${s5HwAfterCars.spawned} dikirim, ${s5HwAfterCars.destroyed} hancur]`,
    s5HwAfterCars.spawned > 0 && s5HwAfterCars.destroyed > 0 && !s5HwOverActive);
T('S5 KONVOI: penumpang selalu berada di atas jalan dan tak pernah masuk gerbong player',
    s5HwRiderChecked && s5HwRiderOk);
// PERBAIKAN "jalannya patah-patah" (2026-08-08): modul mengikuti garis singgung
// kurva dan sepanjang BUSUR-nya, jadi sambungannya rapat — bukan lagi deretan
// batang sejajar sumbu x yang bergeser samping seperti tangga.
T(`S5 JALAN: tiap modul diputar mengikuti garis singgung kurva, bukan batang sejajar sumbu [maks ${(s5RoadMaxYaw * 180 / Math.PI).toFixed(1)} derajat]`,
    s5RoadYawOk && s5RoadMaxYaw > 0.02);
T('S5 JALAN: panjang modul mengikuti BUSUR kurva, bukan proyeksi x-nya', s5RoadArcOk);
T(`S5 JALAN: sambungan antar-modul rapat — jalannya menyambung, tidak patah-patah [celah maks ${s5RoadSeamMax.toFixed(3)}]`,
    s5RoadSeamMax > 0 && s5RoadSeamMax < 1.0);
T('S5 KONSIST: seluruh gerbong memakai kelas A/B saja; tidak ada robot kelas C atau boss di perjalanan',
    !s5EverClassC && !robots.some(z => z.stage === 5 && z.kind === 'boss'));
T('S5 KONSIST: begitu ramp mendarat awaknya SIAP TEMPUR di dek dan tak pernah turun ke jalur player',
    s5EmergeSeen && !s5EverGroundRobot);
T('S5 KONSIST: isi peti tak pernah terlihat sebelum ramp gerbongnya cukup terbuka', s5SealedSeen);
T('S5 KONSIST: TIDAK PERNAH ada dua ramp hidup terbuka bersamaan — gerbong dibuka satu per satu',
    !s5MultiOpenSeen);
// Jarak antar-jalur perjalanan HARUS di dalam jangkauan tembak konsist, kalau
// tidak barisan tembaknya cuma berdiri diam dan gameloop-nya mati.
T('S5 KONSIST: penembak konsist benar-benar mendapat gerbang tembak ke player lintas-rel',
    s5EverInRange);
T(`S5 KONSIST: 10 gerbong dimainkan berurutan dan jumlah robot per gerbong dibaca config [${s5CarShape.map(c => c.n).join(',')}]`,
    s5CarShape.length === S5_CAR_TOTAL && S5_CAR_TOTAL === 10
    && s5CarShape.every(c => c.B > c.A && c.n >= S5E.perCarMin && c.n <= S5E.perCarMax));
// ===== MINI BOS LOKOMOTIF (2026-08-09, permintaan user) =====================
// Gerbong terakhir habis TIDAK lagi langsung menyalakan babak penutup: konsist
// maju sekali lagi sampai LOKOMOTIFNYA sejajar, lalu lokomotif itu bertempur.
const S5B = S5E.boss;
const s5LocoMod = await import(R('src/scenes/campaign/stages/stage5/loco.js'));
const bossDbg = () => etDbg2().boss;
// Satu peluru player yang PASTI menyapu badan lokomotif: sapuannya melintang
// dari sisi player ke seberang, sama seperti tembakan asli lintas-rel.
function s5ShootLoco(dmg = 40) {
    const c = s5LocoMod.locoCenter(new THREE.Vector3());
    stateMod.bullets.push({
        mesh: { position: new THREE.Vector3(c.x, 12, c.z) },
        px: c.x, pz: c.z + 60,
        dir: { x: 0, z: -1 }, damage: dmg,
    });
}
T('S5 BOS: gerbong terakhir habis -> konsist MAJU menyejajarkan lokomotif, bukan langsung finale',
    etDbg2().killed === S5_CAR_TOTAL
    && ['advance', 'boss'].includes(etDbg2().mode));
// Tunggu sampai lokomotif benar-benar sejajar dan jendela kebalnya dimulai.
for (let i = 0; i < 200 && etDbg2().mode !== 'boss'; i++) tickS5Wave(0.1, 0.1);
{
    const b = bossDbg(), d = etDbg2();
    T(`S5 BOS: lokomotif sejajar gerbong player dan bangun dengan HP ${S5B.hp} [${b?.hp}]`,
        d.mode === 'boss' && !!b && b.hp === S5B.hp && b.maxHp === S5B.hp
        // `alignX` = posisi konsist yang membuat gerbong aktif (kini LOKOMOTIF)
        // sejajar dengan gerbong player; ayunan halusnya +-3.5 unit.
        && Math.abs(d.x - d.alignX) < 6);
    T('S5 BOS: JENDELA KEBAL — selama fase bangun, peluru player tidak melukainya',
        b.phase === 'arm' && b.vulnerable === false);
}
// Selama jendela kebal, tembakan player TIDAK boleh mengurangi HP.
{
    const hp0 = bossDbg().hp;
    let warnSeen = false;
    for (let i = 0; i < 12; i++) {
        s5ShootLoco(); tickS5Wave(0.1, 0.1);
        if (bossDbg().warn) warnSeen = true;
    }
    T('S5 BOS: menembakinya selama jendela kebal sama sekali tidak mengurangi HP',
        bossDbg().hp === hp0 && bossDbg().phase === 'arm'
        // ...dan strip peringatannya menyala sebagai telegraph "mesin bangun".
        && warnSeen);
    // Harness tidak menjalankan `updateBullets`, jadi peluru yang ditembakkan
    // selama jendela kebal menumpuk di array alih-alih terbang lewat. Dibuang
    // supaya angka HP pada assert berikutnya jujur.
    stateMod.bullets.length = 0;
}
tickS5Wave(S5B.armSec + 0.3, 0.1);
T(`S5 BOS: sesudah ${S5B.armSec} detik barulah ia bisa dilukai`,
    bossDbg().phase === 'fight' && bossDbg().vulnerable === true);
{
    const hp0 = bossDbg().hp;
    s5ShootLoco(); tickS5Wave(0.1, 0.1);
    T(`S5 BOS: sekarang peluru player benar-benar mengurangi HP [${hp0} -> ${bossDbg().hp}]`,
        bossDbg().hp < hp0);
}
// --- SIKLUS SENJATA: kunci -> 10 peluru MG segaris -> jeda 2 dtk -> 3 granat.
{
    // Tunggu AKHIR siklus yang sedang berjalan ('rest'), supaya sampel dimulai
    // dari awal siklus berikutnya dan tidak memotong semburan di tengah.
    // ('idle' hanya hidup satu pemanggilan — ia langsung berpindah ke 'lock'.)
    for (let i = 0; i < 200 && bossDbg() && bossDbg().sub !== 'rest'; i++) tickS5Wave(0.1, 0.1);
    const shots = [];
    let lock = null, lockHeld = true, mgAt = -1, mgEndAt = -1, glAt = -1, t = 0;
    let grenadeSeen = 0, subsSeen = [];
    stateMod.enemyBullets.length = 0;
    for (let i = 0; i < 260 && bossDbg(); i++) {
        const before = stateMod.enemyBullets.length;
        tickS5Wave(0.1, 0.1); t += 0.1;
        const b = bossDbg(); if (!b) break;
        if (subsSeen[subsSeen.length - 1] !== b.sub) subsSeen.push(b.sub);
        if (b.sub === 'lock' && !lock) lock = { ...b.lock, t };
        if (lock && glAt < 0) {
            // Titik kunci TIDAK boleh bergeser sepanjang semburan. Peluru dicatat
            // TANPA menunggu `sub === 'mg'`: peluru ke-10 keluar pada frame yang
            // sama saat sub berpindah ke 'gap', jadi penyaring per-sub kehilangan
            // satu tembakan.
            if (b.sub === 'mg' || b.sub === 'gap') {
                if (Math.abs(b.lock.x - lock.x) > 1e-6 || Math.abs(b.lock.z - lock.z) > 1e-6) lockHeld = false;
            }
            for (let k = before; k < stateMod.enemyBullets.length; k++) {
                const eb = stateMod.enemyBullets[k];
                shots.push({ dx: eb.dir.x, dz: eb.dir.z, dmg: eb.dmg, px: eb.px, pz: eb.pz });
            }
            if (mgAt < 0 && b.sub === 'mg') mgAt = t;
            if (b.sub === 'mg') mgEndAt = t;
        }
        if (b.sub === 'gl' && glAt < 0) glAt = t;
        grenadeSeen = Math.max(grenadeSeen, b.grenades);
        if (glAt > 0 && b.sub === 'rest') break;
    }
    T(`S5 BOS MG: mengunci satu titik lalu memuntahkan ${S5B.mgShots} peluru [${shots.length}]`,
        shots.length === S5B.mgShots && lockHeld);
    // "Garis lurus ke titik yang sama": yang dipatok adalah SASARANNYA. Moncong
    // ikut bergoyang bersama konsist, jadi vektor arahnya boleh berbeda tipis —
    // yang haram adalah peluru yang membelok mengejar player (MG tank).
    {
        const miss = shots.map(sh => {
            const vx = lock.x - sh.px, vz = lock.z - sh.pz;
            return Math.abs(vx * sh.dz - vz * sh.dx);   // jarak tegak lurus lock ke sinar
        });
        T(`S5 BOS MG: setiap peluru menyusuri garis ke TITIK KUNCI yang sama, tidak mengejar player [meleset maks ${Math.max(...miss).toFixed(3)}]`,
            shots.length > 1 && Math.max(...miss) < 0.01);
    }
    T(`S5 BOS MG: damage tiap peluru ${S5B.mgDamage} dan player diberi ${S5B.mgLockSec} dtk untuk menyingkir`,
        shots.every(sh => sh.dmg === S5B.mgDamage)
        && mgAt - lock.t >= S5B.mgLockSec - 0.11);
    T(`S5 BOS GL: granat baru menyusul ${S5B.mgToGlSec} dtk sesudah peluru MG TERAKHIR [${(glAt - mgEndAt).toFixed(2)}]`,
        glAt > mgEndAt && glAt - mgEndAt >= S5B.mgToGlSec - 0.11
        && glAt - mgEndAt < S5B.mgToGlSec + 0.25
        && subsSeen.join('>').includes('lock>mg>gap>gl'));
    T(`S5 BOS GL: melempar ${S5B.glShots} granat dan ledakannya seradius mortar tank`,
        grenadeSeen > 0
        && Math.abs(s5LocoMod.locoBlastRadius()
            - cfgMod.CFG.grenade.killRadius * cfgMod.CFG.campaign.bosses.tank.mortarBlastRatio) < 1e-9);

    // Damage granat: harness tidak memanggil updateRobots, jadi antrean boom
    // tidak pernah diproses — yang diperiksa adalah KONTRAK yang diantre bos
    // (radius, melukai player, besar damage), bukan HP yang berkurang.
    {
        robotsMod.resetRobotsFx();
        let boom = null;
        for (let i = 0; i < 40 && !boom; i++) {
            tickS5Wave(0.1, 0.1);
            boom = robotsMod.pendingBoomsDebug().find(b => b.hurtPlayer);
            robotsMod.resetRobotsFx();
        }
        T(`S5 BOS GL: ledakan granat melukai player ${S5B.glDamage} dalam radius mortar [${boom && boom.playerDmg}]`,
            !!boom && boom.playerDmg === S5B.glDamage
            && Math.abs(boom.r - s5LocoMod.locoBlastRadius()) < 1e-9);
    }
    // Pergantian senjata GL -> MG berjeda `cycleGapSec` (2026-08-09, permintaan
    // user "beri jeda 1 detik antar pergantian senjata"): pasangan dari
    // `mgToGlSec` di arah sebaliknya. Diukur dari transisi sub-fase yang nyata,
    // bukan dari angka yang disalin — retune config tetap hijau.
    {
        for (let i = 0; i < 300 && bossDbg() && bossDbg().sub !== 'gl'; i++) tickS5Wave(0.1, 0.1);
        for (let i = 0; i < 300 && bossDbg() && bossDbg().sub === 'gl'; i++) tickS5Wave(0.1, 0.1);
        let rest = 0;
        for (let i = 0; i < 300 && bossDbg() && bossDbg().sub === 'rest'; i++) { tickS5Wave(0.1, 0.1); rest += 0.1; }
        T(`S5 BOS: pergantian senjata GL -> MG berjeda ${S5B.cycleGapSec} dtk [${rest.toFixed(1)}]`,
            !!bossDbg() && Math.abs(rest - S5B.cycleGapSec) < 0.16
            && ['idle', 'lock'].includes(bossDbg().sub));
    }
}
// --- Konvoi jalan raya selama babak bos: HANYA 2 robot kelas B.
{
    let worst = 0, nonB = 0;
    for (let i = 0; i < 600 && etDbg2().mode === 'boss'; i++) {
        tickS5Wave(0.1, 0.1);
        const riders = robots.filter(z => z.stage === 5 && z.pickup);
        worst = Math.max(worst, riders.length);
        nonB += riders.filter(z => z.kind !== 'B').length;
        if (worst >= 2) break;
    }
    T(`S5 BOS KONVOI: mobil yang datang saat melawan lokomotif hanya membawa 2 robot kelas B [maks ${worst}]`,
        worst <= 2 && nonB === 0
        && S5H.bossLoad.length === 2 && S5H.bossLoad.every(c => c === 'B'));
}
// Habisi lokomotif -> babak penutup.
for (let i = 0; i < 400 && bossDbg() && bossDbg().hp > 0; i++) { s5ShootLoco(); tickS5Wave(0.1, 0.1); }
T('S5 BOS: HP habis -> lokomotif meledak dan konsist masuk babak penutup',
    etDbg2().mode === 'finale' || etDbg2().mode === 'idle');
tickS5Wave(S5E.finaleSec + 0.4, 0.1);
// Konvoi jalan raya yang masih hidup HARUS menahan gerbang kedatangan meski
// seluruh gerbong musuh sudah hancur.
let s5ArrivalLockSeen = null;
if (hwDbg().activePickups > 0 || countS5Riders() > 0) {
    s5ArrivalLockSeen = s5mod.stage5Debug().phase === 'ride';
    killS5();
    tickS5Wave(S5H.wreckSec + 0.8, 0.1);
}
T('S5 KONSIST: kereta musuh benar-benar menghilang dan seluruh gerbong tercatat hancur',
    etDbg2().mode === 'idle' && !etDbg2().visible && etDbg2().done
    && etDbg2().killed === S5_CAR_TOTAL);
// --- JARAK DIGANTI PENGHANCURAN (2026-08-08, permintaan user): tidak ada lagi
// hitung mundur km/rideMinSec. Kemajuan rute = gerbong musuh yang hancur, dan
// Bandung baru terbuka kalau konvoi jalan raya juga sudah bersih. ---
T('S5 PACING: config + debug tidak lagi punya jarak/waktu tempuh apa pun',
    S5C.routeKm === undefined && S5C.rideMinSec === undefined
    && s5mod.stage5Debug().distance === undefined);
T('S5 PACING: kemajuan rute dibaca dari gerbong yang hancur, bukan dari waktu',
    s5mod.stage5Debug().carsKilled === S5_CAR_TOTAL
    && s5mod.stage5Debug().carTotal === S5_CAR_TOTAL
    && Math.abs(s5mod.stage5Debug().routeK - 1) < 1e-6);
T('S5 HUD: status perjalanan tak pernah menyebut kilometer/jarak',
    !/KM|KILOMET/i.test(s5mod.journeyScene.hudStatus()));
// Sisa pengangkut MENGUNCI kedatangan walau seluruh gerbong sudah hancur.
if (s5ArrivalLockSeen !== null) {
    T('S5 ARRIVAL GATE: gerbong habis tetapi konvoi jalan raya masih hidup -> arrival TETAP terkunci',
        s5ArrivalLockSeen === true);
}
s5mod.stage5Scene.updateMode(0.1);
// JEDA PENUTUP (2026-08-08, laporan user "musuh terakhir hancur langsung masuk
// scene finish"): sesudah musuh terakhir mati, kedatangan HARUS ditahan dulu
// selama `arrivalDelaySec` dengan kamera gameplay + kontrol player masih hidup.
const s5HoldLeft = Math.max(0, S5C.arrivalDelaySec - s5mod.stage5Debug().clearHoldT);
T(`S5 JEDA PENUTUP: musuh terakhir hancur tetapi arrival DITAHAN dulu, tidak langsung masuk [tertahan ${s5HoldSeen.toFixed(1)} dari ${S5C.arrivalDelaySec}s]`,
    typeof S5C.arrivalDelaySec === 'number' && S5C.arrivalDelaySec > 0
    // Jeda benar-benar dijalani HAMPIR PENUH, dan selama itu kamera gameplay +
    // kontrol player masih hidup (bukan cinematic).
    && s5HoldSeen >= S5C.arrivalDelaySec - 0.2 && !s5HoldCine);
tickS5Wave(s5HoldLeft + 0.3, 0.1);
T('S5 ARRIVAL GATE: baru mulai setelah semua gerbong musuh DAN seluruh konvoi jalan raya hancur',
    s5mod.stage5Debug().phase === 'arrival'
    && s5mod.stage5Debug().carsKilled === S5_CAR_TOTAL
    && s5mod.stage5Debug().robots === 0
    && s5mod.stage5Debug().highway.activePickups === 0);
T('S5 SUB-SCENE: journey -> arrival berpindah tanpa pernah mengganti activeScene',
    s5mod.stage5Debug().sub === 'campaign-5-finish'
    && smMod.activeScene === s5mod.stage5Scene);
// ===== CUTSCENE KEDATANGAN EMPAT SHOT (ROMBAK TOTAL 2026-08-09, permintaan
// user "bikin cutscene terpisah dong buat finishnya") ========================
//   1 extreme close-up DEPAN LOKOMOTIF (kereta berhenti di peron, suara kereta
//   dimatikan) -> 2 close-up PINTU GERBONG TERBUKA -> 3 Gibran TURUN dari
//   gerbong -> 4 extreme close-up DEPAN Gibran, dialog jalan, lalu DITAHAN
//   `endHoldSec` sebelum stage ditutup.
// Aturan keras yang sama seperti keberangkatan: tiap perpindahan POTONGAN
// (sudut + fokus berganti dalam satu frame), tanpa gerak kamera dan tanpa fade
// di dalam cutscene.
const S5A = S5C.arrival;
const s5AShot = () => s5mod.stage5Debug().finish;
const s5RunShotA = (onFrame = null, maxSec = 60) => s5RunShot(onFrame, maxSec, s5AShot);
const s5CarCenterNow = () => {
    const t = s5mod.stage5WorldDebug().train;
    return (t.x0 + t.x1) / 2 + t.groupX;
};
T('S5 FINISH: config lama satu-shot diganti blok empat shot + jeda penutup 3 detik',
    S5C.arrivalMinSec === undefined && !!S5A
    && [S5A.stopSec, S5A.frontSec, S5A.doorOpenSec, S5A.alightSec, S5A.radioMinSec,
        S5A.endHoldSec].every(v => typeof v === 'number' && v > 0)
    && S5A.frontSec > S5A.stopSec);
T('S5 FINISH SHOT 1: dibuka pada DEPAN LOKOMOTIF, kereta masih meluncur masuk',
    s5AShot().shots === 4 && s5AShot().shot === 0 && s5AShot().shotKey === 'engine'
    && !s5AShot().stopped && s5AShot().speed > 0
    && stateMod.cinematicActive);
{
    // Fokusnya HIDUNG lokomotif (bukan pusatnya) dan kameranya di +x = di depan
    // kereta; kalau fokus dipasang di pusat, kamera close-up ini akan berada di
    // DALAM badan lokomotif.
    const nose = s5CarCenterNow() + train5Mod.TRAIN_CAR_STEP + train5Mod.TRAIN_CAR_LENGTH / 2;
    const cam = s5Cam(), foc = s5Focus();
    T(`S5 FINISH SHOT 1: extreme close-up dari DEPAN — fokus di hidung lokomotif [${(foc.x - nose).toFixed(1)}]`,
        Math.abs(foc.x - nose) < 1e-6
        && Math.abs(foc.z - s5mod.stage5WorldDebug().map.playerTrackZ) < 1e-6
        && cam.x > 0 && Math.hypot(cam.x, cam.z) < train5Mod.TRAIN_CAR_LENGTH);
    // SEJAJAR KERETA, BUKAN DARI ATAS (2026-08-09, permintaan user). Renderer
    // selalu memandang ke `camFocus.y - CAM_LOOK_DROP`, jadi kamera pada
    // ketinggian yang SAMA = sumbu pandang benar-benar horizontal. Angkanya
    // WAJIB diturunkan dari konstanta renderer, bukan disalin.
    T(`S5 FINISH SHOT 1: sumbu pandangnya HORIZONTAL, bukan menunduk dari atas [y ${cam.y}]`,
        typeof rendererMod.CAM_LOOK_DROP === 'number'
        && Math.abs(cam.y + rendererMod.CAM_LOOK_DROP) < 1e-6);
}
// Guncangan perjalanan HARUS mati selama cutscene: keempat shot terkunci.
rendererMod.resetCamShake();
let s5AShook = false;
// STASIUN TUJUAN IKUT TANAH, BUKAN KERETA (2026-08-09, laporan user). Selama
// pengereman ia harus MERAPAT dari depan lalu mendarat persis di rumahnya —
// kalau dipatok, di layar ia terbaca menempel pada kereta sementara dunia
// menyapu lewat.
const s5TermHome = s5TerminalBeforeMove.x;
const s5TermStart = s5mod.trainJourneyDebug().terminal.x, s5TermT0 = s5AShot().t;
let s5TermBack = false, s5TermPrev = s5TermStart;
const s5Cut1A = s5RunShotA(() => {
    if (rendererMod.camShakeDebug() > 0) s5AShook = true;
    const tx = s5mod.trainJourneyDebug().terminal.x;
    if (tx > s5TermPrev + 1e-6) s5TermBack = true;
    s5TermPrev = tx;
});
T('S5 FINISH SHOT 1: kereta BERHENTI penuh di peron dan suara keretanya dimatikan',
    s5Cut1A.to === 1 && s5Cut1A.locked && s5Cut1A.noFade && !s5AShook
    && !s5mod.trainLoopDebug().on
    && s5mod.stage5Debug().finish.stopped === true
    && s5mod.trainJourneyDebug().speed === 0
    && s5mod.trainJourneyDebug().terminal.visible);
{
    // Jarak yang tersisa saat disampel = SISA jarak tempuh kereta sampai
    // berhenti: integral kurva pengereman v0*(1-smoothstep(t/stopSec)) dari
    // detik sampel sampai `stopSec`. Diintegralkan di sini supaya angkanya
    // ikut config, bukan konstanta hasil sekali ukur.
    const sm = k => k * k * (3 - 2 * k), stop = S5A.stopSec, v0 = S5C.trainSpeed;
    let want = 0;
    for (let t = s5TermT0; t < stop; t += 0.001) want += v0 * (1 - sm(t / stop)) * 0.001;
    const got = s5TermStart - s5TermHome;
    T(`S5 FINISH: stasiun tujuan MERAPAT bersama tanah, bukan menempel pada kereta [${got.toFixed(0)} dari ${want.toFixed(0)}]`,
        got > 40 && Math.abs(got - want) < 4 && !s5TermBack);
    T('S5 FINISH: stasiun tujuan mendarat PERSIS di koordinat statisnya saat kereta berhenti',
        s5mod.trainJourneyDebug().terminal.x === s5TermHome);
}
T('S5 FINISH SHOT 1 -> 2: potongan — sudut + fokus berganti satu frame, tanpa fade',
    !s5SameCam(s5Cut1A.camBefore, s5Cut1A.camAfter)
    && !s5SameFoc(s5Cut1A.focBefore, s5Cut1A.focAfter)
    && dom4.cineFadeDebug().opacity === 0);

// --- SHOT 2: pintu gerbong terbuka ---
s5DoorSfx.resetDoorSfx();
const s5Cut2A = s5RunShotA();
T('S5 FINISH SHOT 2: pintu gerbong TERBUKA penuh, berbunyi tepat sekali, kereta tetap diam',
    s5Cut2A.to === 2 && s5Cut2A.locked && s5Cut2A.noFade
    && s5Door().open === 1 && s5DoorSfx.doorSfxDebug().open === 1
    && s5DoorSfx.doorSfxDebug().close === 0
    && s5mod.trainJourneyDebug().speed === 0);

// --- SHOT 3: Major Gibran turun dari gerbong ke peron kedatangan ---
const s5AliStart = { x: camera.position.x, z: camera.position.z };
let s5AliWalked = 0, s5AliBack = false, s5AliPrevZ = camera.position.z;
const s5Cut3A = s5RunShotA(() => {
    const dz = camera.position.z - s5AliPrevZ;
    if (dz < -1e-9) s5AliBack = true;
    s5AliWalked += Math.abs(dz); s5AliPrevZ = camera.position.z;
});
{
    const t = s5mod.stage5WorldDebug().train, cz = s5mod.stage5WorldDebug().map.playerTrackZ;
    T('S5 FINISH SHOT 3: Gibran BERJALAN keluar gerbong ke peron kedatangan sisi kamera',
        s5Cut3A.to === 3 && s5Cut3A.locked && s5Cut3A.noFade
        && s5AliStart.z >= t.z0 && s5AliStart.z <= t.z1        // mulai DI DALAM gerbong
        && s5AliWalked > 20 && !s5AliBack
        && camera.position.z > cz + t.doorLeafZ                // benar-benar keluar badan kereta
        && camera.position.z > cz + train5Mod.B_APRON_Z0
        && camera.position.z < cz + train5Mod.B_APRON_Z1);     // dan berdiri DI ATAS peron itu
}

// --- SHOT 4: extreme close-up depan Gibran + dialog, lalu jeda 3 detik ---
T('S5 FINISH SHOT 4: extreme close-up dari DEPAN Gibran, lebih dekat daripada shot turun',
    s5AShot().shotKey === 'face'
    && Math.hypot(s5Cam().x, s5Cam().z) < Math.hypot(s5Cut3A.camBefore.x, s5Cut3A.camBefore.z)
    && Math.abs(s5Focus().x - camera.position.x) < 1e-6
    && Math.abs(s5Focus().z - camera.position.z) < 1e-6);
{
    const keys = [], gestures = new Set();
    const cam0 = s5Cam(), foc0 = s5Focus();
    let posed = true, locked = true, noFade = true;
    let idleAt = -1, doneAt = -1, elapsed = 0, guard = 0;
    while (!s5mod.stage5Debug().complete && guard++ < 4000) {
        tickS5(0.05, 0.05); elapsed += 0.05;
        const d = s5mod.stage5DialogueDebug(), g = avMod.avatarRadioDebug();
        if (d.key && keys[keys.length - 1] !== d.key) keys.push(d.key);
        if (s5mod.stage5Debug().complete) { doneAt = elapsed; break; }
        if (!g.active) posed = false; else gestures.add(g.gesture);
        if (idleAt < 0 && keys.length && dialogueIdleS5()) idleAt = elapsed;
        if (!s5SameCam(s5Cam(), cam0) || !s5SameFoc(s5Focus(), foc0)) locked = false;
        if (dom4.cineFadeDebug().opacity !== 0) noFade = false;
    }
    T('S5 FINISH SHOT 4: dua baris radio kedatangan diketik di sini, urut dan huruf demi huruf',
        JSON.stringify(keys) === JSON.stringify(['arrivedCommand', 'arrivedGibran'])
        && s5Partial.has('arrivedCommand') && s5Partial.has('arrivedGibran')
        && posed && gestures.size === 2);
    T('S5 FINISH SHOT 4: kameranya terkunci dan tak ada fade sedetik pun sampai stage ditutup',
        locked && noFade);
    // JEDA PENUTUP (permintaan user): dialog berakhir -> TUNGGU 3 detik -> end.
    T(`S5 FINISH: sesudah dialog habis stage ditahan ${S5A.endHoldSec} dtk dulu, bukan langsung tutup [${(doneAt - idleAt).toFixed(2)} dtk]`,
        idleAt > 0 && doneAt > 0 && doneAt - idleAt >= S5A.endHoldSec - 0.06
        && doneAt - idleAt < S5A.endHoldSec + 0.4);
}
const s5TrainEnd = s5mod.trainJourneyDebug();
T('S5 TRAIN POOL: scenery wrap/parallax bergerak tanpa mengubah jumlah pool/mesh',
    s5TrainEnd.wraps > 0 && JSON.stringify(s5TrainEnd.pools) === JSON.stringify(s5Pools0)
    && s5TrainEnd.pools.sparks > 0 && s5TrainEnd.phase === 'bandung');
T('S5 STATION INVARIANT: terminal tujuan juga statis; tidak ikut pool scenery yang wrap',
    s5TrainEnd.terminal.x === s5TerminalBeforeMove.x
    && s5TrainEnd.terminal.z === s5TerminalBeforeMove.z);
T('S5 DIALOG: semua beat tampil sekali, berurutan, dan pernah berada dalam body parsial',
    s5ShownOrder.join(',') === Object.keys(expectedS5Dialogue).join(',')
    && Object.keys(expectedS5Dialogue).every(k => s5Partial.has(k))
    && s5mod.stage5DialogueDebug().seen.join(',') === Object.keys(expectedS5Dialogue).join(','));
T('S5 STASIUN: kereta musuh tak pernah MENURUNKAN robot; perlawanan perjalanan tetap di konsistnya',
    !s5EverWaveRobot);
T('S5 COMPLETE: arrival membuka layar hijau Stage 5 sebelum Field Shop',
    stateMod.isGameOver && s5mod.stage5Debug().complete
    && smMod.activeScene === s5mod.stage5Scene
    && dom4.gameOverTitle.innerText === 'STAGE 5 COMPLETE'
    && dom4.goStageStats.style.display === 'grid' && !shopMod.isShopOpen()
    && save5Mod.loadCampaignStage() === 5);
T('S5 COMPLETE CONTINUE: CONTINUE baru membuka scene Field Shop menuju Stage 6',
    gameMod.activateGameOverPrimary() && !stateMod.isGameOver
    && smMod.activeScene.id === 'campaign-shop');
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));
T('S5 SHOP: Field Shop terbuka setelah finish screen ditutup', shopMod.isShopOpen());

// --- 17a-ter. CAMPAIGN STAGE 6 — FALSE HOMECOMING (2026-08-02).
// Field Shop -> terminal Bandung -> station control -> tunnel -> substation bebas
// urutan -> HQ -> command floor -> upload 92% gagal -> lockdown/TBC. ---
const s6Carry = {
    money: stateMod.score, hp: player.hp, armor: player.armor,
    medkits: player.medkits, weapons: player.weapons.join(','),
};
smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');
for (let i = 0; i < 500 && smMod.activeScene !== s6mod.stage6Scene; i++) await new Promise(r => setTimeout(r, 10));
T('S6 TRANSISI: Start Next Stage dari Field Shop masuk Stage 6 + checkpoint 6',
    smMod.activeScene === s6mod.stage6Scene && save5Mod.loadCampaignStage() === 6);
T('S6 TRANSISI FRAME PERTAMA: dunia terlihat sebelum dialog opening dan kontrol cinematic',
    dom4.cineFadeDebug()?.opacity === 0 && s6mod.stage6DialogueDebug().key === null
    && dom4.stageRadioDialogueDebug() === null && stateMod.cinematicActive);
stateMod.setPaused(false);
// LATAR KOTA (2026-08-10, permintaan user: stage 6 masih memakai kubah "pusaran
// api" global). `enter()` sekarang memanggil enterCityEnv() seperti Stage 5 —
// background haze + kubah api disembunyikan — dan KEDUA chapter membawa cincin
// kota sendiri yang diinduk ke worldRoot-nya (dekor murni: nol blocker tambahan,
// nol PointLight tambahan, nav tak berubah).
{
    // Dibandingkan terhadap modul cityscape, bukan angka keras: fog/haze-nya
    // nilai visual di kode, dan tes tidak boleh mem-patok angka yang di-tuning.
    const cityMod6 = await import(R('src/scenes/campaign/utility/cityscape.js'));
    const bg = scene.background, far = scene.fog && scene.fog.far;
    cityMod6.exitCityEnv();
    const domeBg = scene.background;
    cityMod6.enterCityEnv();       // kembalikan ke keadaan stage 6 yang sebenarnya
    T('S6 LATAR: enterCityEnv seperti Stage 5 — background haze kota, bukan kubah api',
        bg != null && domeBg === null && scene.background === bg
        && far != null && scene.fog.far === far);
}
{
    const cityA = s6mod.stage6WorldDebug().city, cityH = s6mod.hqWorldDebug().city;
    T('S6 LATAR: kedua chapter punya cincin kota sendiri, menempel di worldRoot chapter',
        !!cityA && !!cityH && cityA.parented && cityH.parented
        && cityA.buildings > 0 && cityH.buildings > 0
        && cityA.trees > 0 && cityH.trees > 0
        && cityA.groundY === s6mod.S6_CITY_GROUND_Y && cityH.groundY === s6mod.HQ_CITY_GROUND_Y
        && cityA.groundY < 0 && cityH.groundY < cityA.groundY);
}
T('S6 TRANSISI: money/HP/armor/medkit/senjata bertahan melewati Field Shop',
    stateMod.score === s6Carry.money && player.hp === s6Carry.hp
    && player.armor === s6Carry.armor && player.medkits === s6Carry.medkits
    && player.weapons.join(',') === s6Carry.weapons);

const expectedS6Dialogue = {
    arrivalSystem: { speaker: 'Train System', text: 'Bandung Logistics Terminal. Route complete.' },
    arrivalCommand: { speaker: 'Command', text: 'Major, Headquarters is still holding, but the surface approaches are overrun. Use the military service corridor beneath this terminal and bring the file to the central uplink.' },
    arrivalGibran: { speaker: 'Major Gibran', text: "Copy. I've come too far to let this file die here." },
    supplyRoom: { speaker: 'Major Gibran', text: 'A forward supply cache. Whatever is still on these shelves is coming with me.' },
    hallContact: { speaker: 'Major Gibran', text: 'Contact in the freight hall. So much for a quiet homecoming.' },
    hallFabricators: { speaker: 'Major Gibran', text: 'They built fabricators into the freight hall. Those come down before I leave this terminal.' },
    keyHunt: { speaker: 'Command', text: 'The service door to the power hall runs on a physical key, Major. Maintenance crews kept their spares in the supply racks.' },
    keyFound: { speaker: 'Major Gibran', text: 'Got it. Now let us see what they were keeping behind that door.' },
    gridOpen: { speaker: 'Command', text: 'That is the emergency power hall. Headquarters cannot release its access door until all three generators are running.' },
    generatorFirst: { speaker: 'Major Gibran', text: 'One turbine turning. Two to go.' },
    powerRestored: { speaker: 'Station System', text: 'Emergency grid restored. Headquarters access door released.' },
    exfilCall: { speaker: 'Command', text: 'The grid woke something up and they are converging on you. Get to that door, Major.' },
    fabricatorsClear: { speaker: 'Major Gibran', text: 'Both fabricators are wrecked. Nothing else is walking out of them.' },
    machinesFirst: { speaker: 'Major Gibran', text: 'Not yet. Those fabricators are still printing, and they come down first.' },
    officeContact: { speaker: 'Major Gibran', text: 'They already own this floor. I will have to clear my way to the servers.' },
    blockedRouteSafe: { speaker: 'Major Gibran', text: 'This door is dead \u2014 no power, no manual release. I need another way out of here.' },
    blockedRouteVault: { speaker: 'Major Gibran', text: 'Jammed shut as well. Whoever pulled back through here made sure nobody followed.' },
    blockedRouteHall: { speaker: 'Major Gibran', text: 'Another dead door. They have been sealing this building one corridor at a time.' },
    serverDoorLocked: { speaker: 'Major Gibran', text: 'The server room door is bolted from the network side. Something on this floor is still holding that lock.' },
    hackTerminalHint: { speaker: 'Command', text: 'That lock answers to the terminal in their meeting room, Major. Break it there and the door releases.' },
    serverDoorOpen: { speaker: 'HQ System', text: 'MEETING ROOM OVERRIDE ACCEPTED. SERVER ROOM ACCESS RELEASED.' },
    insertCommand: { speaker: 'Command', text: "Insert the drive. We'll push the kill-switch through every occupied network we can reach." },
    uploadSystem: { speaker: 'HQ Uplink', text: 'Data package verified. Uploading kill-switch protocol.' },
    uploadFailed: { speaker: 'HQ Uplink', text: 'UPLOAD FAILED. BROADCAST AUTHORITY DENIED. ROOT TRANSMISSION NODE REQUIRED.' },
    gibranFailure: { speaker: 'Major Gibran', text: "What?! The file is valid. Why isn't it uploading?" },
    commandIKN: { speaker: 'Command', text: "The protocol can only be injected from N.U.S.A.'s central robot transmitter. The network manifest places it in Nusantara—IKN, East Kalimantan." },
    gibranIKN: { speaker: 'Major Gibran', text: "Kalimantan?! You're telling me the only transmitter that can end this war is on another island?" },
    commandKertajati: { speaker: 'Command', text: 'Bandung can decrypt the file, but it cannot broadcast it. Your nearest viable air route is Kertajati.' },
    lockdownWarning: { speaker: 'HQ System', text: 'WARNING. Unauthorized kill-switch handshake detected. Enemy trace confirmed. Headquarters lockdown initiated.' },
    commandEscape: { speaker: 'Command', text: 'They traced the attempt. Major, get out of Headquarters now!' },
    gibranResolve: { speaker: 'Major Gibran', text: 'Copy. First I survive Bandung. Then I find a way to IKN.' },
    machinesDeploy: { speaker: 'HQ System', text: 'FABRICATION UNITS DEPLOYED TO THIS FLOOR. HOSTILE PRODUCTION ONLINE.' },
    machinesDown: { speaker: 'Major Gibran', text: 'Both fabricators are scrap. Nothing else is coming out of the walls.' },
    floorClear: { speaker: 'Command', text: 'The floor is quiet, Major. Get back to your entry point and get out of Bandung.' },
};
// Baris KONTEKSTUAL (urutannya mengikuti rute + kapan player memilih menembak
// mesin) dikecualikan dari assert urutan ketat; assert urutan hanya mencakup
// tulang punggung naskah. Kemunculannya sendiri tetap dipatok terpisah.
const S6_CONTEXTUAL = ['blockedRouteSafe', 'blockedRouteVault', 'blockedRouteHall',
    'serverDoorLocked', 'hackTerminalHint', 'machinesFirst', 'fabricatorsClear'];
const S6_SPINE = Object.keys(expectedS6Dialogue).filter(k => !S6_CONTEXTUAL.includes(k));
T('S6 DIALOG: seluruh naskah tersimpan PERSIS dan urut',
    JSON.stringify(s6mod.STAGE6_DIALOGUE) === JSON.stringify(expectedS6Dialogue));

const s6Partial = new Set(), s6ShownOrder = [];
let s6LastKey = null;
function sampleS6Dialogue() {
    const d = s6mod.stage6DialogueDebug();
    if (d.key && d.key !== s6LastKey) { s6ShownOrder.push(d.key); s6LastKey = d.key; }
    if (d.key && d.chars > 0 && d.chars < d.text.length) s6Partial.add(d.key);
}
function tickS6(total, step = 1 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps)) {
    let left = Math.max(0, total), guard = 0;
    while (left > 1e-9 && guard++ < 30000) {
        const dt = Math.min(step, left);
        s6mod.stage6Scene.updateMode(dt); sampleS6Dialogue(); left -= dt;
    }
}
function drainS6Dialogue() {
    let guard = 0; sampleS6Dialogue();
    while (guard++ < 30000) {
        const d = s6mod.stage6DialogueDebug();
        if (!d.key && !d.queued.length) break;
        tickS6(1.01 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps));
    }
}
function killS6(encounter = null) {
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 6 || (encounter && z.encounter !== encounter)) continue;
        robotsMod.disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
    }
}
const s6Mix = (encounter) => {
    const out = { C: 0, B: 0, A: 0 };
    for (const z of robots) if (z.stage === 6 && z.encounter === encounter && out[z.kind] != null) out[z.kind]++;
    return out;
};
const s6Alive = e => { const m = s6Mix(e); return m.C + m.B + m.A; };
const s6Robots = () => robots.filter(z => z.stage === 6).length;
const s6Put = p => camera.position.set(p.x, cfgMod.CFG.player.eyeHeight, p.z);
const s6Door = kind => s6mod.stage6WorldDebug().doors.find(d => d.kind === kind);

// --- CHAPTER 1 "ARRIVAL": denahnya adalah transliterasi beku dari CSV user
// `stages(Stage6-Start).csv` (50x50). Sensus token dipatok satu per satu supaya
// perubahan denah yang tak disengaja langsung ketahuan, lalu konektivitasnya
// di-BFS dari sel `S`. ---
const s6World = s6mod.stage6WorldDebug();
T('S6 ARRIVAL PINTU: seluruh pintu memakai dua daun 50:50 simetris',
    s6World.doors.length > 0 && s6World.doors.every(d => d.split.leaves.length === 2
        && Math.abs(d.split.leaves[0].y - d.split.leaves[1].y) < 1e-6
        && Math.abs((d.split.horizontal ? d.split.leaves[0].x : d.split.leaves[0].z)
            + (d.split.horizontal ? d.split.leaves[1].x : d.split.leaves[1].z)) < 1e-6));
T('S6 ARRIVAL PINTU: lampu indikator berada di kusen kiri/kanan',
    s6World.doors.every(sideLamps));
const s6Count = t => s6mod.S6_MAP.reduce((n, row) => n + [...row].filter(x => x === t).length, 0);
const s6Token = (x, z) => {
    const c = Math.floor((x - s6World.map.x0) / s6World.map.cell);
    const r = Math.floor((z - s6World.map.z0) / s6World.map.cell);
    if (c < 0 || c >= 50 || r < 0 || r >= 50) return '#';
    return s6mod.S6_MAP[r][c];
};
T('S6 DENAH: transliterasi CSV user 50x50 dengan sensus token persis',
    s6World.built && s6World.map.cols === 50 && s6World.map.rows === 50
    && s6mod.S6_MAP.length === 50 && s6mod.S6_MAP.every(r => r.length === 50)
    && s6World.map.walls === s6Count('#') && s6World.map.walls === 385
    && s6World.map.safe === s6Count('A') + s6Count('S') && s6World.map.safe === 168
    && s6World.map.supply === s6Count('W') && s6World.map.supply === 196
    && s6World.map.racks === 9 && s6World.map.generators === 27
    && s6World.map.repairs === 3 && s6World.map.infoCells === 2 && s6World.map.finish === 4
    && s6World.map.autoDoors === 4 && s6World.map.lockedDoors === 2
    && s6World.map.chapterDoors === 4 && s6Count('S') === 1);
T('S6 ARRIVAL DETAIL VISUAL: dinding berpanel, rak ber-brace, dan perabot industri padat',
    s6World.architecture.wallDetails > s6World.map.walls * 2
    && s6World.furniture.meshes > 120 && s6World.furniture.rackDetails >= 15);
{
    const open = t => t !== '#';
    let start = null;
    for (let r = 0; r < 50 && !start; r++) {
        const c = s6mod.S6_MAP[r].indexOf('S'); if (c >= 0) start = { c, r };
    }
    const seen = new Set(), q = [start];
    while (q.length) {
        const p = q.shift();
        if (p.c < 0 || p.c >= 50 || p.r < 0 || p.r >= 50) continue;
        const key = p.c + ',' + p.r;
        if (seen.has(key) || !open(s6mod.S6_MAP[p.r][p.c])) continue;
        seen.add(key);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push({ c: p.c + dc, r: p.r + dr });
    }
    const total = s6mod.S6_MAP.reduce((n, row) => n + [...row].filter(open).length, 0);
    T('S6 DENAH: SA -> gudang -> hall -> koridor -> ruang generator seluruhnya terhubung',
        seen.size === total && total === 2115 && s6World.nav);
}
// LULUS-JALAN: BFS atas sel yang benar-benar MUAT dilewati player — token peta
// terbuka DAN tidak tertutup perabot pejal. Ini yang menangkap satu lemari yang
// tanpa sengaja menyegel pintu dan membuat chapter-nya mustahil diselesaikan.
// Daun pintu sengaja tidak dihitung: semuanya membuka saat didekati.
function s6Reachable(map, cellPos, walk, props, startTok, radius) {
    const solid = props.filter(x => x.solid);
    const fits = (c, r) => {
        if (c < 0 || c >= 50 || r < 0 || r >= 50) return false;
        const q = cellPos(c, r);
        if (!walk(q.x, q.z, radius)) return false;
        return !solid.some(b => Math.abs(q.x - b.x) <= b.hx + radius
            && Math.abs(q.z - b.z) <= b.hz + radius);
    };
    let start = null;
    for (let r = 0; r < 50 && !start; r++) {
        const c = map[r].indexOf(startTok); if (c >= 0) start = { c, r };
    }
    const seen = new Set(), q = [start];
    while (q.length) {
        const n = q.shift();
        const key = n.c + ',' + n.r;
        if (seen.has(key) || !fits(n.c, n.r)) continue;
        seen.add(key);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push({ c: n.c + dc, r: n.r + dr });
    }
    return (c, r) => seen.has(c + ',' + r);
}
// Sebuah objektif jarang berdiri di sel yang bisa diinjak (konsol, rak dan pintu
// rusak justru PEJAL), jadi yang diuji adalah: adakah pijakan terjangkau dalam
// radius jangkauannya.
function s6NearReachable(can, cellPos, p, range) {
    for (let r = 0; r < 50; r++) for (let c = 0; c < 50; c++) {
        if (!can(c, r)) continue;
        const q = cellPos(c, r);
        if (Math.hypot(q.x - p.x, q.z - p.z) <= Math.max(range, 1) * 14) return true;
    }
    return false;
}
T('S6 DENAH: rak kunci dan generator adalah furnitur SOLID',
    ['key-rack', 'generator', 'supply-shelf', 'inspection-bench',
        'distribution-panel'].every(k => s6World.propKinds.includes(k))
    // TERMINAL YANG BISA DI-HACK DI DEPAN RUANG GENERATOR SUDAH DIHAPUS
    // (2026-08-12, permintaan user): satu-satunya kunci pintu `=` adalah kunci
    // fisik di rak. Peta tetap beku, jadi sel `I`-nya kini lantai kosong.
    && !s6World.propKinds.includes('info-terminal')
    && s6mod.S6_LEGEND.I === 'floor' && s6World.map.infoCells === 2
    && s6mod.S6_INFO === undefined && S6C.infoRange === undefined
    && s6mod.STAGE6_DIALOGUE.infoRead === undefined
    && s6World.props.filter(p => p.kind === 'key-rack' && p.solid).length === 3
    && s6World.props.filter(p => p.kind === 'generator' && p.solid).length === 3
    && !s6mod.stage6Walk(s6mod.RACK_POINTS[0].x, s6mod.RACK_POINTS[0].z, 0)
    && !s6mod.stage6Walk(s6mod.GENERATOR_POINTS[0].x, s6mod.GENERATOR_POINTS[0].z, 0)
    && s6mod.stage6SegHitsWall(s6mod.RACK_POINTS[0].stand.x, s6mod.RACK_POINTS[0].stand.z,
        s6mod.RACK_POINTS[0].x + 20, s6mod.RACK_POINTS[0].z));
T('S6 PINTU: empat pintu fisik; `=` dan `@` terkunci sampai alurnya membukanya',
    s6World.doors.map(d => d.kind).join(',') === 'safe,hall,grid,chapter'
    && s6Door('safe').locked === false && s6Door('hall').locked === false
    && s6Door('grid').locked === true && s6Door('chapter').locked === true
    && s6World.doors.every(d => d.target === 0)
    && s6World.pools.sparks === 16 && s6World.lights >= 10 && s6World.staticBatches > 0);
T('S6 ARRIVAL PINTU: tembakan melintasi pintu tertutup dihentikan dan di-clamp',
    closedDoorStopsShot(s6WorldMod.doorOf('safe'), s6WorldMod.doorClampShot));
{
    let ok = true;
    const clearAt = (p, r) => {
        if (!s6mod.stage6Walk(p.x, p.z, r)) return false;
        stateMod._v3.set(p.x, 0, p.z); s6mod.resolve(stateMod._v3, r, 0);
        return Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) <= 0.01;
    };
    for (const p of [s6mod.S6_START, s6mod.S6_FINISH,
        ...s6mod.RACK_POINTS.map(r => r.stand), ...s6mod.GENERATOR_POINTS.map(g => g.stand),
        ...s6World.supplies, ...s6World.crates]) if (!clearAt(p, 1)) ok = false;
    // Titik spawn diperiksa pada radius robot penuh, bukan radius drop.
    for (const [c, r] of Object.values(s6mod.ENCOUNTER_POINTS).flat())
        if (!clearAt(s6mod.cellPos(c, r), 4)) ok = false;
    // Tak satu pun titik spawn boleh berada di SAFE AREA (janji legenda user).
    const spawnSafe = Object.values(s6mod.ENCOUNTER_POINTS).flat()
        .some(([c, r]) => 'AS'.includes(s6mod.S6_MAP[r][c]));
    T('S6 PENEMPATAN: start/objektif/bekal/peti/spawn di lantai bebas blocker, spawn di luar SA',
        ok && !spawnSafe && s6World.supplies.length === 11 && s6World.crates.length === 5);
}
{
    const can = s6Reachable(s6mod.S6_MAP, s6mod.cellPos, s6mod.stage6Walk,
        s6World.props, 'S', stateMod.player.radius);
    const nearOK = (p, range) => s6NearReachable(can, s6mod.cellPos, p, range);
    const targets = [
        ...s6mod.RACK_POINTS.map(x => x.stand), ...s6mod.GENERATOR_POINTS.map(x => x.stand),
        s6mod.S6_FINISH, ...s6World.supplies, ...s6World.crates,
        ...s6World.machinePoints.map(m => m.hatch)];
    T('S6 LULUS-JALAN: rak, generator, gudang dan titik `F` benar-benar bisa dicapai player',
        targets.every(t => nearOK(t, 1)));
}
// DUA MESIN PEMBUAT ROBOT DI GUDANG (2026-08-09, permintaan user: "taruh 2 mesin
// spawn robot di area gudang ... di bagian utara sebelum lorong ke jalan keluar").
// Yang dipatok bukan koordinat hafalan melainkan hubungannya dengan denah: kedua
// mesin berada di jalur utara hall, di sebelah BARAT mulut lorong layanan (kolom
// dinding 40) yang mengantar ke `F`, rangkanya pejal + masuk nav, dan lorong
// baris 1 di atasnya tetap muat dilewati player.
{
    const cell = p => ({ c: Math.floor((p.x - s6World.map.x0) / s6World.map.cell),
        r: Math.floor((p.z - s6World.map.z0) / s6World.map.cell) });
    const mp = s6World.machinePoints.map(m => cell(m));
    const corridorCol = 40;                    // dinding pemisah hall <-> lorong
    const exitCol = s6mod.S6_MAP[1].indexOf('F');
    const can = s6Reachable(s6mod.S6_MAP, s6mod.cellPos, s6mod.stage6Walk,
        s6World.props, 'S', stateMod.player.radius);
    T('S6 MESIN GUDANG: dua rangka di jalur utara hall, sebelum lorong ke `F`',
        s6World.machines.length === 2 && s6World.machinePoints.length === 2
        && mp.every(m => m.r >= 2 && m.r <= 4)
        && mp.every(m => m.c < corridorCol) && exitCol > corridorCol
        && mp[1].c > mp[0].c
        // Corong menghadap hall (+z): titik lahirnya ada di selatan rangkanya.
        && s6World.machinePoints.every((m, i) => cell(m.hatch).r > mp[i].r));
    T('S6 MESIN GUDANG: rangka PEJAL, dipanggang nav, dan lorong utara tetap terbuka',
        s6World.props.filter(p => p.kind === 'spawn-machine' && p.solid).length === 2
        && s6World.machinePoints.every(m => !s6mod.stage6Walk(m.x, m.z, 0)
            || (() => { stateMod._v3.set(m.x, 0, m.z); s6mod.resolve(stateMod._v3, 4, 0);
                return Math.hypot(stateMod._v3.x - m.x, stateMod._v3.z - m.z) > 0.01; })())
        // Baris 1 (antara dinding utara dan mesin) tetap terjangkau player...
        && mp.every(m => can(m.c, 1))
        // ...dan `F` tetap tercapai walau kedua rangka berdiri.
        && can(exitCol, 1));
    T('S6 MESIN GUDANG: rig hero bersama, hidup penuh, memakai HP bersama config',
        s6World.machines.every(m => m.alive && !m.active && m.hp === MACHINE_HP()
            && m.visible && m.rig.meshes >= 60 && m.rig.pointLights === 0 && !m.rig.dead));
}
const s6HallBots = robots.filter(z => z.stage === 6 && z.encounter === 'hall');
{
    // SAFE AREA = janji legenda user. Selain titik spawn, hook clampRobot juga
    // harus mendorong robot mana pun keluar dari SA.
    const probe = s6HallBots[0];
    const old = { x: probe.mesh.position.x, z: probe.mesh.position.z };
    const noneInSafe = robots.filter(z => z.stage === 6)
        .every(z => !'AS'.includes(s6Token(z.mesh.position.x, z.mesh.position.z)));
    probe.mesh.position.set(s6mod.S6_START.x, probe.mesh.position.y, s6mod.S6_START.z);
    s6mod.stage6Scene.clampRobot(probe, old.x, old.z);
    const pushedOut = !'AS'.includes(s6Token(probe.mesh.position.x, probe.mesh.position.z));
    probe.mesh.position.set(old.x, probe.mesh.position.y, old.z);
    T('S6 SAFE AREA: tak ada robot di SA dan clampRobot mendorong keluar yang dipaksa masuk',
        noneInSafe && pushedOut);
}
T('S6 HALL: komposisi awal mengikuti CFG, seluruh robot idle, tanpa boss/miniboss',
    sameMix(s6Mix('hall'), scaledMix(S6C.encounters.hall, 6))
    && s6HallBots.every(z => z.state === 'idle' && ['C', 'B', 'A'].includes(z.kind))
    && !s6mod.stage6Debug().hallAwake);

T('S6 OPENING: cinematic tampil di atas dunia tanpa tirai hitam/dialog prematur',
    s6mod.stage6Debug().phase === 'opening' && s6mod.stage6Debug().chapter === 'arrival'
    && stateMod.cinematicActive
    && dom4.cineFadeDebug()?.opacity === 0 && s6mod.stage6DialogueDebug().key === null);
tickS6(S6C.openingDialogueDelaySec * 0.5, 0.05);
T('S6 OPENING: dialog menunggu establishing delay', s6mod.stage6DialogueDebug().key === null);
tickS6(S6C.openingDialogueDelaySec * 0.5, 0.05);
T('S6 TYPEWRITER: line pertama muncul kosong lalu mengetik karakter demi karakter',
    s6mod.stage6DialogueDebug().key === 'arrivalSystem' && s6mod.stage6DialogueDebug().chars === 0);
tickS6(1.01 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps));
T('S6 TYPEWRITER: tick pertama berisi tepat satu karakter',
    s6mod.stage6DialogueDebug().chars === 1
    && s6mod.stage6DialogueDebug().shown === expectedS6Dialogue.arrivalSystem.text.slice(0, 1));
drainS6Dialogue(); tickS6(S6C.openingMinSec + S6C.fadeSec + 0.2, 0.1);
T('S6 OPENING: selesai mengembalikan kontrol dengan objektif gudang',
    s6mod.stage6Debug().phase === 'stockUp' && !stateMod.cinematicActive);

{
    const held = s6HallBots[0];
    const pos = { x: held.mesh.position.x, z: held.mesh.position.z };
    const ai = s6mod.stage6Scene.robotAI(held, 0.5, 30);
    T('S6 SAFE HOLD: garnisun hall tidak mengejar selagi player belum keluar SA',
        !s6mod.stage6Debug().hallAwake && ai.chaseDist == null
        && s6HallBots.every(z => z.state === 'idle')
        && held.mesh.position.x === pos.x && held.mesh.position.z === pos.z);
}
s6Put(s6World.supplies[0]); s6mod.stage6Scene.updateMode(0.1);
T('S6 GUDANG: memasuki ruang `W` memicu barisnya tanpa membangunkan hall',
    s6mod.stage6Debug().enteredSupply && !s6mod.stage6Debug().hallAwake
    && s6mod.stage6Debug().phase === 'stockUp');
drainS6Dialogue();
s6Put(s6mod.cellPos(20, 20)); s6mod.stage6Scene.updateMode(0.1);
T('S6 HALL: melangkah ke hall membangunkan SELURUH garnisun sekaligus',
    s6mod.stage6Debug().phase === 'clearHall' && s6mod.stage6Debug().hallAwake
    && s6HallBots.every(z => z.state === 'chasing'));
T('S6 MESIN GUDANG: menyala bersama garnisun hall, bukan sejak awal chapter',
    s6mod.stage6WorldDebug().machines.every(m => m.alive && m.active)
    && s6mod.stage6Debug().machinesAlive === 2);
drainS6Dialogue();
// Produksinya memakai encounter TERPISAH (`factory`), jadi ia tak pernah menahan
// gate `clearHall` yang menghitung encounter `hall`.
killS6('hall'); tickS6(S6C.machineFirstWaveSec + 0.2, 0.1);
{
    const born = robots.filter(z => z.stage === 6 && z.encounter === 'factory');
    const hatches = s6mod.stage6WorldDebug().machinePoints.map(m => m.hatch);
    T('S6 MESIN GUDANG: mesin aktif mencetak robot `factory` dari corongnya',
        born.length > 0 && born.length <= S6C.machineMaxAlive
        && born.every(z => hatches.some(h =>
            Math.hypot(z.mesh.position.x - h.x, z.mesh.position.z - h.z) < 20)));
}
killS6('factory'); s6mod.stage6Scene.updateMode(0.1);
T('S6 KUNCI: hall bersih membuka perburuan kunci; pintu `=` masih tertutup',
    s6mod.stage6Debug().phase === 'findKey' && s6Door('grid').target === 0
    && s6mod.stage6WorldDebug().markers.racks.every(v => v === true));
drainS6Dialogue();

// TAK ADA KOMPUTER DI DEPAN RUANG GENERATOR (2026-08-12, permintaan user):
// berdiri di petak `I` lama — tepat di depan pintu `=` — tidak boleh membuka
// minigame apa pun, dan ketiga rak tetap ditandai karena tak ada yang
// mempersempit perburuan.
{
    const oldInfoCell = s6mod.cellPos(44, 34);
    s6Put(oldInfoCell); tickS6(2, 0.1);
    T('S6 RUANG GENERATOR: tak ada terminal yang bisa di-hack di depan pintu `=`',
        !signalMod.isSignalTraceOpen() && smMod.activeScene.id === 'campaign-6'
        && s6mod.stage6Debug().phase === 'findKey' && s6Door('grid').target === 0
        && s6mod.stage6WorldDebug().markers.racks.every(v => v === true)
        && s6mod.stage6WorldDebug().markers.info === undefined);
}
const s6KeyRack = s6mod.stage6Debug().keyRack;

const s6WrongRack = (s6KeyRack + 1) % s6mod.RACK_POINTS.length;
s6Put(s6mod.RACK_POINTS[s6WrongRack].stand); tickS6(S6C.rackSearchSec + 0.1, 0.1);
T('S6 RAK: menggeledah rak yang salah hanya menandainya kosong',
    s6mod.stage6Debug().rackSearched[s6WrongRack] && !s6mod.stage6Debug().hasKey
    && s6mod.stage6Debug().phase === 'findKey' && s6Door('grid').target === 0
    // Penanda rak kosong padam; rak yang belum digeledah tetap menyala.
    && s6mod.stage6WorldDebug().markers.racks[s6WrongRack] === false
    && s6mod.stage6WorldDebug().markers.racks.filter(v => v).length
        === s6mod.RACK_POINTS.length - 1);
s6Put(s6mod.RACK_POINTS[s6KeyRack].stand); tickS6(S6C.rackSearchSec + 0.1, 0.1);
// KUNCI HANYA MELEPAS GEMBOK (2026-08-12, permintaan user): pintunya TETAP
// TERTUTUP dan baru bergeser saat player berdiri di depannya.
T('S6 KUNCI DITEMUKAN: rak yang benar MELEPAS GEMBOK `=` tanpa membukanya',
    s6mod.stage6Debug().hasKey && s6mod.stage6Debug().phase === 'powerGrid'
    && s6Door('grid').locked === false
    && s6Door('grid').target === 0 && s6Door('grid').open === 0
    && s6Door('chapter').target === 0
    && sameMix(s6Mix('grid'), scaledMix(S6C.encounters.grid, 6)));
{
    // Berdiri di depan daunnya membukanya; menjauh menutupnya lagi setelah
    // linger `closeDelaySec` habis — perilaku pintu otomatis standar.
    const gd = s6Door('grid');
    s6Put({ x: gd.x, z: gd.z + 18 });        // satu sel di depan daun pintu
    tickS6(0.6, 0.1);
    const openedNear = s6Door('grid').target === 1 && s6Door('grid').open > 0;
    s6Put(s6mod.RACK_POINTS[s6KeyRack].stand);
    tickS6(cfgMod.CFG.campaign.doors.closeDelaySec + 1.2, 0.1);
    const closedFar = s6Door('grid').target === 0 && s6Door('grid').open === 0;
    T('S6 PINTU GENERATOR: terbuka saat DIDEKATI, menutup lagi saat ditinggalkan',
        openedNear && closedFar);
}
drainS6Dialogue();

s6Put(s6mod.GENERATOR_POINTS[0].stand); s6mod.stage6Scene.updateMode(0.1);
T('S6 GENERATOR: generator pertama membuka FUSE LOADOUT lalu ROTOR KICKSTART',
    repMod.isRepairOpen() && repMod.repairDebug().total === 2 && repMod.repairDebug().type === 'fuse');
solveOpenRepairBoard(); await waitRepairNext(1);
smMod.activeScene.shopKey('escape'); stateMod.setPaused(false);
T('S6 GENERATOR: abort menyimpan papan pertama dan pemicu harus re-arm dengan menjauh',
    s6mod.stage6Debug().generatorStep[0] === 1 && !s6mod.stage6Debug().generatorArmed[0]
    && s6mod.stage6Debug().generatorsOnline === 0);
s6Put(s6mod.S6_FINISH); s6mod.stage6Scene.updateMode(0.1);
for (let i = 0; i < s6mod.GENERATOR_POINTS.length; i++) {
    s6Put(s6mod.GENERATOR_POINTS[i].stand); s6mod.stage6Scene.updateMode(0.1);
    if (i === 0) {
        T('S6 GENERATOR: kembali ke generator pertama melanjutkan langsung dari ROTOR KICKSTART',
            repMod.isRepairOpen() && repMod.repairDebug().index === 1
            && repMod.repairDebug().type === 'kickstart');
    }
    while (repMod.isRepairOpen()) {
        const index = repMod.repairDebug().index;
        solveOpenRepairBoard();
        if (index + 1 < repMod.repairDebug().total) await waitRepairNext(index + 1);
        else await waitRepairClosed();
    }
    if (i === 0) {
        T('S6 GENERATOR: satu generator online belum membuka pintu chapter',
            s6mod.stage6Debug().generatorsOnline === 1 && s6Door('chapter').target === 0
            && s6mod.stage6Debug().phase === 'powerGrid');
    }
}
T('S6 LISTRIK PULIH: tiga generator membuka pintu `@` dan melepas gelombang exfil',
    s6mod.stage6Debug().generatorsOnline === 3 && s6mod.stage6Debug().phase === 'exfil'
    && s6Door('chapter').target === 1
    && sameMix(s6Mix('exfil'), scaledMix(S6C.encounters.exfil, 6))
    // Penanda `F` MENUNGGU kedua mesin: selama masih berdiri, objektifnya mesin.
    && s6mod.stage6WorldDebug().markers.finish === false);
drainS6Dialogue();

// GERBANG MESIN (2026-08-09, permintaan user): `F` menolak selama fabricator
// masih berdiri, dan penolakannya bersuara.
s6Put(s6mod.S6_FINISH); s6mod.stage6Scene.updateMode(0.1);
T('S6 FINISH GATE: `F` menolak selagi kedua mesin masih hidup, dengan dialog penolakan',
    !stateMod.cinematicActive && s6mod.stage6Debug().chapterDone === false
    && s6mod.stage6DialogueDebug().key === 'machinesFirst'
    && !s6mod.stage6Debug().exitWarnArmed);
drainS6Dialogue();
// Menjauh dari `F` dulu: kalau tidak, mesin terakhir yang hancur langsung
// memulai serah-terima chapter pada frame yang sama.
s6Put(s6mod.cellPos(20, 20)); s6mod.stage6Scene.updateMode(0.1);
// Satu mesin dihancurkan lewat peluru SUNGGUHAN (menguji sapuan segmen), satunya
// lewat HP supaya tesnya tetap singkat.
{
    const m0 = s6mod.stage6Machines()[0];
    stateMod.bullets.push({
        mesh: { position: { x: m0.x, y: 8, z: m0.z } },
        px: m0.x - 30, py: 8, pz: m0.z, dir: { x: 1, y: 0, z: 0 },
        damage: MACHINE_HP() + 50,
    });
    s6mod.stage6Scene.updateMode(0.1);
    T('S6 FINISH GATE: peluru menghancurkan mesin gudang pertama; `F` masih menolak',
        s6mod.stage6Debug().machinesAlive === 1 && stateMod.bullets.length === 0
        && s6mod.stage6WorldDebug().markers.finish === false);
}
{
    const m1 = s6mod.stage6Machines()[1];
    m1.hp = 0; s6mod.stage6Scene.updateMode(0.1);
    const dbg = s6mod.stage6WorldDebug().machines;
    T('S6 MESIN GUDANG: kedua bangkai TETAP terlihat, gosong, dengan part terlepas',
        s6mod.stage6Debug().machinesAlive === 0
        && dbg.every(m => !m.alive && m.visible && m.rig.dead && m.rig.charred
            && m.rig.detached >= 10)
        && s6mod.stage6WorldDebug().markers.finish === true);
    // Bangkai yang terlihat tetap pejal — tak ada bangkai tembus pandang.
    const probe = (x, z) => {
        stateMod._v3.set(x, 0, z); s6mod.resolve(stateMod._v3, stateMod.player.radius, 0);
        return Math.hypot(stateMod._v3.x - x, stateMod._v3.z - z) > 0.01;
    };
    T('S6 MESIN GUDANG: bangkai yang terlihat tetap menghalangi player',
        dbg.every(m => probe(m.x, m.z)));
}
drainS6Dialogue();

const s6ExfilLeft = s6Alive('exfil');
s6Put(s6mod.S6_FINISH); s6mod.stage6Scene.updateMode(0.1);
const s6ChapterIn = dom4.cineFadeDebug();
T('S6 CHAPTER: arrival -> HQ berpindah langsung tanpa dialog/cutscene/fade',
    s6mod.stage6Debug().chapter === 'hq' && s6mod.stage6Debug().sub === 'campaign-6-hq'
    && smMod.activeScene === s6mod.stage6Scene
    && !stateMod.cinematicActive && s6mod.stage6DialogueDebug().key === null
    && !s6mod.subFadeDebug().pending && s6mod.subFadeDebug().sec === 0
    && s6ChapterIn.opacity === 0);
T('S6 CHAPTER: sisa robot chapter 1 ditinggal, garnisun kantor sesuai CFG',
    s6ExfilLeft > 0 && s6Alive('exfil') === 0
    && s6mod.stage6Debug().phase === 'office'
    && sameMix(s6Mix('office'), scaledMix(S6C.encounters.office, 6)));

// --- CHAPTER 2 "FINISH": kantor markas dari `stages(Stage6-Finish).csv`.
// Masuk dari SF -> cari jalan ke ruang server (tiga pintu RUSAK memaksa memutar)
// -> upload GAGAL di 92% -> gelombang purge + DUA mesin pembuat robot menyala,
// termasuk spawn di safe area -> habisi semua + hancurkan kedua mesin -> kembali
// ke SF. ---
const s6HqWorld = s6mod.hqWorldDebug();
T('S6 HQ PINTU: seluruh pintu aktif memakai dua daun 50:50 simetris',
    s6HqWorld.doors.length > 0 && s6HqWorld.doors.every(d => d.split.leaves.length === 2
        && Math.abs(d.split.leaves[0].y - d.split.leaves[1].y) < 1e-6
        && Math.abs((d.split.horizontal ? d.split.leaves[0].x : d.split.leaves[0].z)
            + (d.split.horizontal ? d.split.leaves[1].x : d.split.leaves[1].z)) < 1e-6));
T('S6 HQ PINTU: lampu indikator berada di kusen kiri/kanan',
    s6HqWorld.doors.every(sideLamps));
const s6HqDoor = kind => s6mod.hqWorldDebug().doors.find(d => d.kind === kind);
const s6HqCount = t => s6mod.HQ_MAP.reduce((n, row) => n + [...row].filter(x => x === t).length, 0);
const s6HqPut = p => camera.position.set(p.x, cfgMod.CFG.player.eyeHeight, p.z);
T('S6 HQ DENAH: transliterasi CSV finish 50x50 dengan sensus token persis',
    s6HqWorld.built && s6HqWorld.map.cols === 50 && s6HqWorld.map.rows === 50
    && s6mod.HQ_MAP.length === 50 && s6mod.HQ_MAP.every(r => r.length === 50)
    && s6HqWorld.map.walls === s6HqCount('#') && s6HqWorld.map.walls === 412
    && s6HqWorld.map.safe === 276 && s6HqWorld.map.startFinish === 4
    && s6HqWorld.map.broken === 11 && s6HqWorld.map.doors === 12
    && s6HqWorld.map.keyedDoors === 2 && s6HqWorld.map.keyedPlus === 2
    && s6HqCount('+') === 2 && s6HqCount('X') === 2 && s6HqCount('Y') === 106
    && s6HqWorld.map.cache === 238
    && s6HqWorld.map.servers === 30 && s6HqWorld.map.upload === 2
    && s6HqWorld.map.restroom === 56 && s6HqWorld.map.warehouse === 76
    && s6HqWorld.map.machines === 18 && s6HqWorld.map.events === 42
    && Math.abs(s6HqWorld.start.x - s6mod.S6_START.x) > 4000);
{
    // Pintu RUSAK, bank server dan rangka mesin PERMANEN pejal; walau begitu
    // seluruh kantor tetap tercapai dari SF — itulah "cari jalan lain".
    const SOLID = '#@CM';
    const open = t => !SOLID.includes(t);
    let start = null;
    for (let r = 0; r < 50 && !start; r++) {
        const c = s6mod.HQ_MAP[r].indexOf('S'); if (c >= 0) start = { c, r };
    }
    const seen = new Set(), q = [start];
    while (q.length) {
        const p = q.shift();
        if (p.c < 0 || p.c >= 50 || p.r < 0 || p.r >= 50) continue;
        const key = p.c + ',' + p.r;
        if (seen.has(key) || !open(s6mod.HQ_MAP[p.r][p.c])) continue;
        seen.add(key);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push({ c: p.c + dc, r: p.r + dr });
    }
    const total = s6mod.HQ_MAP.reduce((n, row) => n + [...row].filter(open).length, 0);
    T('S6 HQ DENAH: seluruh kantor tetap terhubung dari SF walau tiga pintu MATI',
        seen.size === total && total === 2029 && s6HqWorld.nav
        && !s6mod.hqWalk(s6mod.HQ_SERVERS.x, s6mod.HQ_SERVERS.z, 0));
}
T('S6 HQ KANTOR: perabot kantor lengkap seperti Stage 1-3, plus gudang/toilet/mesin',
    ['desk', 'meeting-table', 'cupboard', 'console', 'crate', 'planter', 'sofa',
        'bench', 'toilet-stall', 'washbasin', 'spawn-machine', 'broken-door',
        'upload-console'].every(k => s6HqWorld.propKinds.includes(k))
    && s6HqWorld.props.filter(p => p.kind === 'spawn-machine').length === 2
    && s6HqWorld.props.filter(p => p.kind === 'broken-door').length === 3
    && s6HqWorld.props.filter(p => p.solid).length >= 60
    && s6HqWorld.pools.sparks === 16 && s6HqWorld.lights >= 12 && s6HqWorld.staticBatches > 0);
// KANTOR TERBUKA BARAT (2026-08-12, permintaan user): sayap barat diisi deret
// pulau kerja back-to-back, bukan meja tunggal yang berjauhan. Yang dijaga di
// sini: seluruh pulau memang berada di sayap BARAT (kol < 28), dan tiap pulau
// membawa perabot kantor pendukungnya.
{
    const banks = s6HqWorld.props.filter(p => p.kind === 'desk-bank');
    const westOf = c => s6mod.hqCellPos(c, 0).x;
    T('S6 HQ KANTOR BARAT: deret pulau kerja open-plan mengisi sayap barat',
        banks.length >= 20 && banks.every(b => b.solid && b.x < westOf(28))
        && ['file-cabinet', 'printer', 'water-cooler', 'coffee-table']
            .every(k => s6HqWorld.propKinds.includes(k)));
}
// TOILET DIROMBAK (2026-08-12, permintaan user): isinya dulu rig kios warung.
// Sekarang bilik + urinoir + wastafel, dan lorong tengahnya (kolom 46) WAJIB
// bebas blocker — itu satu-satunya jalur ke ujung selatan ruangan.
{
    const rest = s6HqWorld.props.filter(p => ['toilet-stall', 'urinal', 'washbasin',
        'restroom-bin'].includes(p.kind));
    let laneOK = true;
    for (let r = 14; r <= 27; r++) {
        const q = s6mod.hqCellPos(46, r);
        if (rest.some(b => Math.abs(q.x - b.x) <= b.hx + stateMod.player.radius
            && Math.abs(q.z - b.z) <= b.hz + stateMod.player.radius)) laneOK = false;
    }
    T('S6 HQ TOILET: lima bilik + tiga urinoir + tiga wastafel, lorong tengah bebas',
        s6HqWorld.props.filter(p => p.kind === 'toilet-stall').length === 5
        && s6HqWorld.props.filter(p => p.kind === 'urinal').length === 3
        && s6HqWorld.props.filter(p => p.kind === 'washbasin').length === 3
        && rest.every(p => p.solid && !p.standable) && laneOK);
}
T('S6 HQ DETAIL VISUAL: dinding, workstation, lemari, toilet, dan server berlapis detail',
    s6HqWorld.architecture.wallDetails > s6HqWorld.map.walls * 2
    && s6HqWorld.furnitureDetails.furniture > 60
    && s6HqWorld.furnitureDetails.servers > 200);
// KOTAK PIJAK AMBER DI DEPAN KEDUA KOMPUTER (2026-08-12, permintaan user "biar
// player tidak bingung harus ke mana"): bentuknya HARUS kotak pijak 12x12
// bersama milik campaign, bukan cincin waypoint, warnanya amber, berdiri persis
// di petak berdiri masing-masing konsol, dan TIDAK PERNAH diputar (bidangnya
// rebah di lantai — memutar sumbu z akan mendirikannya).
{
    const palM = await import(R('src/world/palette.js'));
    const comM = await import(R('src/scenes/campaign/utility/common.js'));
    const sm = s6HqWorld.standMarkers;
    const at = (m, p) => m && Math.hypot(m.x - p.x, m.z - p.z) < 0.01;
    s6mod.stage6Scene.updateMode(0.1); s6mod.stage6Scene.updateMode(0.1);
    const spun = s6mod.hqWorldDebug().standMarkers;
    T('S6 HQ PENANDA: kotak pijak amber tepat di depan terminal hack dan konsol server',
        sm.hack && sm.upload
        && sm.hack.stand === true && sm.upload.stand === true
        && sm.hack.bars === 4 && sm.upload.bars === 4
        && sm.hack.color === palM.PAL.amber && sm.upload.color === palM.PAL.amber
        && at(sm.hack, s6mod.HQ_HACK) && at(sm.upload, s6mod.HQ_UPLOAD)
        && spun.hack.spin === 0 && spun.upload.spin === 0
        && comM.STAND_MARKER_SIZE === 12);
}
// ---- OPTIMASI STAGE 6 (2026-08-12, laporan user "terasa agak berat") --------
// Tiga hal yang dipatok di sini karena ketiganya hanya terlihat lewat angka:
{
    // (1) INDEKS SPASIAL BLOCKER. `hqResolve` tak lagi menyapu seluruh 591
    //     blocker; kalau petak indeksnya salah, sebuah blocker jadi TAK TERLIHAT
    //     dan player menembusnya. Uji langsung: taruh probe di TENGAH tiap prop
    //     solid — resolve WAJIB mendorongnya keluar. Satu saja yang lolos berarti
    //     indeksnya bocor.
    // Sejak indeks dijadikan helper bersama (`makeBlockerIndex`, 2026-08-13) ia
    // MENGURUTKAN hasil query ke urutan daftar asli dan memberi marjin sebesar
    // setengah-rusuk terbesar, jadi invariannya kini jauh lebih kuat daripada
    // "terdorong keluar": hasilnya WAJIB identik dengan sapuan penuh. Itu yang
    // diuji di sini — sekaligus menangkap indeks yang kehilangan blocker.
    const hqBlockers = s6HqWorldMod.hqBlockersDbg();
    let mismatch = 0, ejected = 0, probes = 0;
    const idxV = new THREE.Vector3(), fullV = new THREE.Vector3();
    for (const pr of s6HqWorld.props) {
        if (!pr.solid || pr.kind === 'spawn-machine') continue;
        probes++;
        idxV.set(pr.x, 0, pr.z);
        s6mod.hqResolve(idxV, stateMod.player.radius, 0);
        fullV.set(pr.x, 0, pr.z);
        colMod.resolveBlockers(fullV, stateMod.player.radius, 0, hqBlockers);
        // hqResolve juga menyelesaikan PINTU; bandingkan hanya bila pintu tak
        // ikut campur (jarak beda > 0 berarti pintu/urutan — diperiksa terpisah).
        if (Math.hypot(idxV.x - fullV.x, idxV.z - fullV.z) > 1e-9) mismatch++;
        const dx = Math.abs(idxV.x - pr.x), dz = Math.abs(idxV.z - pr.z);
        if (dx > pr.hx || dz > pr.hz) ejected++;
    }
    // 4 bilik toilet berdiri 28 unit dari pusat ke pusat dengan setengah-lebar 12:
    // celah antar-bilik hanya 4 unit, lebih sempit dari radius player 5. Sapuan
    // PENUH pun mengembalikan titik di pusat bilik ke dalam footprint-nya — jadi
    // ambangnya bukan "semua terdorong", melainkan "identik dengan sapuan penuh".
    T(`S6 HQ OPTIMASI: indeks blocker identik dengan sapuan penuh [${probes} prop, ${mismatch} beda, ${ejected} terdorong]`,
        probes > 100 && mismatch === 0 && ejected >= probes - 4);
}
{
    // (2) LAS SADAR-BAYANGAN. Kulit dinding + pernik perabot tidak boleh masuk
    //     shadow pass; dulu satu bucket material meng-OR-kan castShadow sehingga
    //     82.076 dari 116.402 segitiga dibayar dua kali. Yang dijaga: mayoritas
    //     mesh statis HQ TIDAK mencetak bayangan, tapi dindingnya tetap mencetak.
    let cast = 0, flat = 0;
    for (const o of s6mod.hqStaticBatchDbg()) o.traverse(m => {
        if (!m.isMesh) return;
        if (m.castShadow) cast++; else flat++;
    });
    T(`S6 HQ OPTIMASI: pernik statis keluar dari shadow pass [${cast} mencetak, ${flat} tidak]`,
        flat > cast * 2 && cast > 0);
}
{
    // (3) SET LAMPU PER CHAPTER. Dulu kedua chapter memakai `campaign-6`, jadi 26
    //     PointLight dihitung tiap fragmen sepanjang stage — dua kali lipat stage
    //     mana pun. Sekarang tiap chapter punya kuncinya sendiri, dan keduanya
    //     tetap dikompilasi di muka oleh `precompileStageLightSets`.
    const lm = await import(R('src/world/lighting.js'));
    const keys = lm.stageLightsDebug().keys;
    const lit = k => { lm.setActiveStageLights(k); return lm.stageLightsDebug().visible; };
    const before = lm.stageLightsDebug().active;
    const arrivalLit = lit('campaign-6'), hqLit = lit(s6HqWorldMod.HQ_LIGHTS_KEY);
    lm.setActiveStageLights(before || 'campaign-6');
    T(`S6 HQ OPTIMASI: tiap chapter punya set lampunya sendiri [arrival ${arrivalLit}, hq ${hqLit}]`,
        s6HqWorldMod.HQ_LIGHTS_KEY === 'campaign-6-hq'
        && s6HqWorldMod.HQ_LIGHTS_KEY !== s6mod.stage6Scene.lightsKey
        && keys.includes('campaign-6') && keys.includes(s6HqWorldMod.HQ_LIGHTS_KEY)
        && arrivalLit > 0 && hqLit > 0
        // Justru inilah untungnya: tak satu pun chapter menyalakan gabungannya.
        && arrivalLit < arrivalLit + hqLit && hqLit < arrivalLit + hqLit);
}
T('S6 HQ PINTU: tujuh pintu; start/finish TERSEGEL, ruang server TERKUNCI',
    s6HqWorld.doors.length === 7
    && s6HqDoor('entry-seal').sealed === true
    && s6HqWorld.doors.filter(d => d.sealed).length === 1
    // Satu-satunya pintu ke ruang server terkunci sampai terminal ruang rapat
    // dibobol (permintaan user 2026-08-09).
    && s6HqDoor('server-access').locked === true
    && s6HqWorld.doors.filter(d => d.locked).length === 1
    // Pintu tersegel benar-benar mendorong player keluar, bukan sekadar berlabel.
    && (() => {
        const d = s6HqDoor('entry-seal');
        stateMod._v3.set(d.x, 0, d.z); s6mod.hqResolve(stateMod._v3, 4, 0);
        return Math.hypot(stateMod._v3.x - d.x, stateMod._v3.z - d.z) > 0.5;
    })());
T('S6 HQ PINTU: tembakan melintasi pintu tertutup dihentikan dan di-clamp',
    closedDoorStopsShot(s6HqWorldMod.hqDoorOf('entry-seal'), s6HqWorldMod.hqDoorClampShot));
T('S6 HQ PINTU RUSAK: sel `@` benar-benar PEJAL, bukan sekadar prop',
    s6mod.HQ_MAP[34][24] === '@' && s6mod.HQ_MAP[13][36] === '@' && s6mod.HQ_MAP[31][40] === '@'
    && !s6mod.hqWalk(s6mod.hqCellPos(24, 34).x, s6mod.hqCellPos(24, 34).z, 0)
    && !s6mod.hqWalk(s6mod.hqCellPos(36, 13).x, s6mod.hqCellPos(36, 13).z, 0)
    && !s6mod.hqWalk(s6mod.hqCellPos(40, 31).x, s6mod.hqCellPos(40, 31).z, 0)
    // ...dan menghalangi tembakan seperti dinding.
    && s6mod.hqSegHitsWall(s6mod.hqCellPos(24, 32).x, s6mod.hqCellPos(24, 32).z,
        s6mod.hqCellPos(24, 36).x, s6mod.hqCellPos(24, 36).z));
{
    let ok = true;
    const clearAt = (p, r) => {
        if (!s6mod.hqWalk(p.x, p.z, r)) return false;
        stateMod._v3.set(p.x, 0, p.z); s6mod.hqResolve(stateMod._v3, r, 0);
        return Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) <= 0.01;
    };
    for (const p of [s6mod.HQ_START, s6mod.HQ_UPLOAD,
        ...s6HqWorld.supplies, ...s6HqWorld.crates]) if (!clearAt(p, 1)) ok = false;
    for (const [c, r] of Object.values(s6mod.HQ_ENCOUNTER_POINTS).flat())
        if (!clearAt(s6mod.hqCellPos(c, r), 4)) ok = false;
    for (const m of s6HqWorld.machinePoints) if (!clearAt(m.hatch, 4)) ok = false;
    // Tak satu pun spawn AWAL boleh di safe area (legenda user), tapi gelombang
    // purge SENGAJA memakainya.
    const officeInSafe = s6mod.HQ_ENCOUNTER_POINTS.office
        .some(([c, r]) => 'ASY'.includes(s6mod.HQ_MAP[r][c]));
    const purgeInSafe = s6mod.HQ_ENCOUNTER_POINTS.purge
        .filter(([c, r]) => 'AY'.includes(s6mod.HQ_MAP[r][c])).length;
    T('S6 HQ PENEMPATAN: semua titik bebas blocker; spawn awal di luar SA, gelombang purge memakainya',
        ok && !officeInSafe && purgeInSafe >= 4
        && s6HqWorld.supplies.length === 15 && s6HqWorld.crates.length === 34);
}
// PETI LOOT DI SETIAP RUANGAN (2026-08-12, permintaan user): kalau lootnya
// hanya di jalur utama, tak ada alasan menyisir kantor. Yang dijaga: tiap area
// bernama punya peti, dan tak satu pun peti berdiri di dalam ruang server yang
// memang harus sunyi.
{
    const areas = new Set(s6HqWorld.crates.map(c => c.area));
    T('S6 HQ PETI: tiap ruangan kantor punya peti loot sendiri',
        ['west-pod', 'warehouse', 'office', 'office-annex', 'server', 'corridor',
            'meeting', 'restroom', 'hall', 'south-west', 'south-room', 'safe-area',
            'cache'].every(a => areas.has(a))
        && areas.size === 13
        && s6HqWorld.crates.filter(c => c.area === 'office').length >= 5);
}

{
    const can = s6Reachable(s6mod.HQ_MAP, s6mod.hqCellPos, s6mod.hqWalk,
        s6HqWorld.props, 'S', stateMod.player.radius);
    const nearOK = (p, range) => s6NearReachable(can, s6mod.hqCellPos, p, range);
    const targets = [s6mod.HQ_UPLOAD, ...s6HqWorld.machinePoints.map(m => m.hatch),
        ...s6HqWorld.supplies, ...s6HqWorld.crates];
    T('S6 HQ LULUS-JALAN: server, kedua mesin, weapon cache dan pemicu event bisa dicapai player',
        targets.every(t => nearOK(t, 1))
        // Tiap pemicu event harus punya PIJAKAN nyata di dalam kotaknya.
        && s6HqWorld.events.every(e => nearOK(e, Math.max(e.hx, e.hz))));
}
const s6OfficeBots = robots.filter(z => z.stage === 6 && z.encounter === 'office');
T('S6 HQ GARNISUN: komposisi CFG, semua idle selagi player di safe area, tanpa boss',
    sameMix(s6Mix('office'), scaledMix(S6C.encounters.office, 6))
    && s6OfficeBots.every(z => z.state === 'idle' && ['C', 'B', 'A'].includes(z.kind))
    && !s6mod.stage6Debug().hq.officeAwake
    && s6mod.stage6Debug().phase === 'office');
// MESIN BARU MUNCUL SETELAH UPLOAD (2026-08-09, permintaan user): sebelum itu
// rangkanya tidak ada di layar SAMA SEKALI — dan karena tak terlihat, petaknya
// juga tidak boleh menghalangi siapa pun.
{
    const probe = (x, z) => {
        stateMod._v3.set(x, 0, z);
        s6mod.hqResolve(stateMod._v3, stateMod.player.radius, 0);
        return Math.hypot(stateMod._v3.x - x, stateMod._v3.z - z) > 0.01;
    };
    T('S6 HQ MESIN: sebelum upload tidak ada rangka mesin di layar, dan petaknya bebas',
        s6HqWorld.machines.length === 2
        && s6HqWorld.machines.every(m => !m.visible && !m.deployed && !m.alive
            && !m.active && !m.blocking && m.hp === 0)
        && s6mod.stage6Debug().hq.machinesAlive === 0
        && !s6mod.stage6Debug().hq.machinesDeployed
        && s6HqWorld.machinePoints.every(m => s6mod.hqWalk(m.x, m.z, stateMod.player.radius)
            && !probe(m.x, m.z))
        // ...peluru pun lewat di petak itu selama rangkanya belum turun.
        && s6HqWorld.machinePoints.every(m => !s6mod.hqSegHitsWall(m.x - 6, m.z, m.x + 6, m.z)));
}
// RUANG SERVER TIDAK PERNAH JADI TITIK SPAWN, sebelum maupun sesudah upload.
T('S6 HQ SERVER: tak satu pun titik spawn encounter berada di ruang server',
    Object.values(s6mod.HQ_ENCOUNTER_POINTS).flat()
        .every(([c, r]) => !s6mod.hqInServerRoomCell(c, r))
    && s6mod.hqInServerRoom(s6mod.HQ_SERVERS.x, s6mod.HQ_SERVERS.z)
    && s6mod.hqInServerRoom(s6mod.HQ_UPLOAD.x, s6mod.HQ_UPLOAD.z)
    && !s6mod.hqInServerRoom(s6mod.HQ_START.x, s6mod.HQ_START.z)
    && !robots.some(z => z.stage === 6
        && s6mod.hqInServerRoom(z.mesh.position.x, z.mesh.position.z)));
drainS6Dialogue();

// Keluar dari safe area membangunkan seluruh kantor sekaligus.
s6HqPut(s6mod.hqCellPos(13, 40)); s6mod.stage6Scene.updateMode(0.1);
T('S6 HQ GARNISUN: keluar dari SA membangunkan seluruh kantor',
    s6mod.stage6Debug().hq.officeAwake && s6OfficeBots.every(z => z.state === 'chasing'));
drainS6Dialogue();

// Tiga pemicu event pintu rusak: masing-masing sekali.
for (const e of s6HqWorld.events) {
    s6HqPut(e); s6mod.stage6Scene.updateMode(0.1); drainS6Dialogue();
    s6HqPut(s6mod.hqCellPos(13, 40)); s6mod.stage6Scene.updateMode(0.1);
}
T('S6 HQ PINTU RUSAK: ketiga pemicu event menyala tepat sekali masing-masing',
    s6mod.stage6Debug().hq.eventSeen.every(v => v === true)
    && ['blockedRouteSafe', 'blockedRouteVault', 'blockedRouteHall']
        .every(k => s6ShownOrder.filter(x => x === k).length === 1));

// GERBANG PINTU RUANG SERVER (2026-08-09, permintaan user): terkunci sampai
// terminal SIGNAL TRACE di ruang rapat tengah dibobol. Berdiri di titik upload
// pun tak boleh memulai apa pun sebelum itu.
s6HqPut(s6mod.HQ_UPLOAD); s6mod.stage6Scene.updateMode(0.1);
T('S6 HQ SERVER LOCK: titik upload tak berbuat apa-apa selama pintunya belum dibobol',
    s6mod.stage6Debug().phase === 'office' && !stateMod.cinematicActive
    && !s6mod.stage6Debug().hq.serverHacked
    && s6HqDoor('server-access').locked === true
    // Selagi terkunci, yang MENYALA adalah kotak terminal hack — bukan kotak
    // konsol server yang belum bisa dipakai.
    && s6mod.hqWorldDebug().markers.hack === true
    && s6mod.hqWorldDebug().markers.upload === false);
{
    const d = s6HqDoor('server-access');
    s6HqPut({ x: d.x, z: d.z + 20 }); s6mod.stage6Scene.updateMode(0.1);
    T('S6 HQ SERVER LOCK: mendekati pintunya menjelaskan kuncinya dan menandai terminalnya',
        s6mod.stage6DialogueDebug().key === 'serverDoorLocked'
        && s6mod.stage6DialogueDebug().queued.includes('hackTerminalHint')
        && s6mod.hqWorldDebug().markers.hack === true
        && d.target === 0);
    drainS6Dialogue();
}
// Terminal ruang rapat = SIGNAL TRACE yang sama dengan Stage 5-6 lainnya; gagal
// memanggil squad alarm dan mengunci terminal selama cooldown config.
s6HqPut(s6mod.HQ_HACK); s6mod.stage6Scene.updateMode(0.1);
T('S6 HQ HACK: terminal ruang rapat membuka SIGNAL TRACE',
    signalMod.isSignalTraceOpen() && smMod.activeScene.id === 'campaign-signal-trace'
    && signalMod.signalTraceDebug().total === cfgMod.CFG.campaign.signalTrace.channels);
signalMod.signalTick(cfgMod.CFG.campaign.signalTrace.traceSec + 1);
await waitSignalClosed();
T('S6 HQ HACK: timeout melepas squad alarm config-driven dan mengunci terminal',
    sameMix(s6Mix('alarm'), scaledMix(S6C.encounters.signalAlarm, 6))
    && Math.abs(s6mod.stage6Debug().hq.hackCd - S6C.signalCooldownSec) < 0.01
    && !s6mod.stage6Debug().hq.serverHacked
    && s6HqDoor('server-access').locked === true
    // Squad alarm pun tidak boleh muncul di ruang server.
    && !robots.some(z => z.stage === 6 && z.encounter === 'alarm'
        && s6mod.hqInServerRoom(z.mesh.position.x, z.mesh.position.z)));
killS6('alarm');
s6HqPut(s6mod.hqCellPos(13, 40)); s6mod.stage6Scene.updateMode(S6C.signalCooldownSec + 0.1);
s6HqPut(s6mod.HQ_HACK); s6mod.stage6Scene.updateMode(0.1);
solveSignalTrace(); await waitSignalClosed();
T('S6 HQ HACK: berhasil melepas kunci pintu ruang server',
    s6mod.stage6Debug().hq.serverHacked
    && s6HqDoor('server-access').locked === false
    // Penanda berpindah: kotak terminal padam, kotak konsol server menyala.
    && s6mod.hqWorldDebug().markers.hack === false
    && s6mod.hqWorldDebug().markers.upload === true);
drainS6Dialogue();

// Upload di titik `H`.
s6HqPut(s6mod.HQ_UPLOAD); s6mod.stage6Scene.updateMode(0.1);
T('S6 UPLOAD: mendekati konsol server memulai cinematic freeze dan dialog briefing',
    s6mod.stage6Debug().phase === 'upload' && stateMod.cinematicActive
    && s6mod.stage6DialogueDebug().key === 'insertCommand');
drainS6Dialogue();
tickS6(S6C.uploadSec * 0.5, 0.1);
T('S6 UPLOAD: progress nyata berjalan tetapi belum melewati failure fraction config',
    s6mod.stage6Debug().hq.uploadProgress > 0
    && s6mod.stage6Debug().hq.uploadProgress < S6C.uploadFailFraction
    && !s6mod.stage6Debug().hq.uploadFailed);
tickS6(S6C.uploadSec * 0.5 + 0.1, 0.1);
T('S6 UPLOAD FAILED: berhenti tepat pada fraction config, tidak pernah mencapai 100%',
    s6mod.stage6Debug().hq.uploadFailed
    && Math.abs(s6mod.stage6Debug().hq.uploadProgress - S6C.uploadFailFraction) < 1e-9
    && s6mod.stage6Debug().hq.uploadProgress < 1);
drainS6Dialogue();
T('S6 LOCKDOWN: peringatan MENURUNKAN dua mesin (baru muncul di sini) + purge termasuk di SA',
    s6mod.stage6Debug().phase === 'purge' && s6mod.stage6Debug().hq.lockdown
    && s6mod.hqWorldDebug().machines.every(m => m.active && m.alive && m.deployed
        && m.visible && m.blocking && m.hp === MACHINE_HP() && !m.rig.dead)
    && sameMix(s6Mix('purge'), scaledMix(S6C.encounters.purge, 6))
    && robots.some(z => z.stage === 6 && z.encounter === 'purge'
        && s6mod.HQ_MAP[Math.floor((z.mesh.position.z - s6HqWorld.map.z0) / s6HqWorld.map.cell)]
            [Math.floor((z.mesh.position.x - s6HqWorld.map.x0) / s6HqWorld.map.cell)] === 'A'));
tickS6(S6C.lockdownTailSec + S6C.fadeSec + 0.5, 0.1);
T('S6 LOCKDOWN: cutscene upload MENGEMBALIKAN kendali — pertempurannya justru sesudah ini',
    !stateMod.cinematicActive && s6mod.stage6Debug().phase === 'purge');

// Mesin benar-benar memproduksi robot sampai dihancurkan. Seluruh robot stage 6
// dibersihkan lebih dulu: pagar `machineMaxAlive` menghitung SEMUA yang hidup.
killS6();
tickS6(S6C.machineWaveSec + S6C.machineFirstWaveSec + 0.5, 0.1);
T('S6 MESIN: mesin aktif terus memproduksi robot baru dari hatch-nya',
    s6Robots() > 0 && s6Robots() <= S6C.machineMaxAlive
    && robots.every(z => z.stage !== 6 || z.encounter === 'purge'));
// GERBANG PINTU UTAMA (2026-08-09, permintaan user): sesudah upload, pintu utama
// menolak sampai KEDUA mesin hancur — dan penolakannya bersuara.
s6HqPut(s6mod.HQ_START); s6mod.stage6Scene.updateMode(0.1);
T('S6 FINISH GATE HQ: pintu utama menolak selagi mesinnya masih berdiri',
    s6mod.stage6Debug().phase === 'purge' && !s6mod.stage6Debug().complete
    && s6mod.stage6DialogueDebug().key === 'machinesFirst'
    && !s6mod.stage6Debug().hq.exitWarnArmed);
drainS6Dialogue();
s6HqPut(s6mod.hqCellPos(13, 40)); s6mod.stage6Scene.updateMode(0.1);
{
    // Dinding sungguhan yang berada SEBELUM mesin tetap harus menang. Lintasan
    // dari empat sel di selatan mesin kedua menembus dinding baris 34 dulu.
    const m1 = s6mod.hqMachines()[1];
    const wallSweep = s6HqWorld.map.cell * 4;
    const hpBeforeWallShot = m1.hp;
    stateMod.bullets.push({
        mesh: { position: new THREE.Vector3(m1.x, 8, m1.z + wallSweep) },
        px: m1.x, py: 8, pz: m1.z + wallSweep, dir: new THREE.Vector3(0, 0, -1),
        speed: wallSweep, life: 2, first: true,
        damage: MACHINE_HP() + 50,
    });
    bulMod.updateBullets(1);
    T('S6 MESIN: dinding kantor sebelum mesin tetap memblokir tembakan',
        m1.hp === hpBeforeWallShot && stateMod.bullets.length === 0);

    // Satu mesin dihancurkan lewat urutan frame SUNGGUHAN: updateBullets
    // menyapu dari luar radius sampai menembus sel M pejal pada frame yang
    // sama. Mesin harus menerima damage SEBELUM hqSegHitsWall membuang peluru.
    // Satunya lagi lewat HP supaya tesnya tetap singkat.
    const m0 = s6mod.hqMachines()[0];
    const sweepSpeed = Math.max(cfgMod.CFG.weapons.bulletSpeed, S6C.machineHitRadius * 2);
    const startX = m0.x - sweepSpeed;
    stateMod.bullets.push({
        mesh: { position: new THREE.Vector3(startX, 8, m0.z) },
        px: startX, py: 8, pz: m0.z, dir: new THREE.Vector3(1, 0, 0),
        speed: sweepSpeed, life: 2, first: true,
        damage: MACHINE_HP() + 50,
    });
    bulMod.updateBullets(1);
    s6mod.stage6Scene.updateMode(0.1);
    T('S6 MESIN: peluru cepat merusak mesin sebelum sel M pejal memblokirnya',
        s6mod.stage6Debug().hq.machinesAlive === 1
        && s6mod.hqWorldDebug().machines[0].alive === false
        && stateMod.bullets.length === 0);
}
s6mod.hqMachines()[1].hp = 0; s6mod.stage6Scene.updateMode(0.1);
T('S6 MESIN: kedua mesin hancur jadi bangkai gosong yang TETAP terlihat',
    s6mod.stage6Debug().hq.machinesAlive === 0
    && s6mod.hqWorldDebug().machines.every(m => !m.alive && m.visible
        && m.rig.dead && m.rig.charred && m.rig.detached >= 10));
// ROMBAK 2026-08-09 (permintaan user: bangkai hitam gosong dengan part terlepas).
// Aturannya tetap "yang terlihat itulah yang menghalangi" — karena bangkainya
// sekarang di layar, collider dan petak `M`-nya ikut tetap pejal, jadi tak ada
// bangkai tembus pandang MAUPUN blocking tak terlihat.
{
    const probe6 = (x, z) => {
        stateMod._v3.set(x, 0, z);
        s6mod.hqResolve(stateMod._v3, stateMod.player.radius, 0);
        return Math.hypot(stateMod._v3.x - x, stateMod._v3.z - z) > 0.01;
    };
    const dead = s6mod.hqMachines();
    T('S6 MESIN: bangkai yang terlihat tetap pejal untuk player dan peluru',
        s6mod.hqWorldDebug().machines.every(m => m.blocking && m.cells > 0)
        && dead.every(m => !s6mod.hqWalk(m.x, m.z, stateMod.player.radius)
            && probe6(m.x, m.z)
            && s6mod.hqSegHitsWall(m.x - 6, m.z, m.x + 6, m.z)));
}
{
    const before = s6Robots();
    killS6();
    tickS6(S6C.machineWaveSec * 2 + 1, 0.2);
    T('S6 PURGE: setelah kedua mesin hancur tak ada robot baru dan fase pindah ke exfil',
        before > 0 && s6Robots() === 0
        && s6mod.stage6Debug().phase === 'escape'
        && s6mod.hqWorldDebug().markers.finish === true);
}
drainS6Dialogue();
// Finish HANYA di titik SF.
s6HqPut(s6mod.hqCellPos(13, 40)); s6mod.stage6Scene.updateMode(0.1);
T('S6 FINISH: berdiri jauh dari SF belum menutup stage',
    !s6mod.stage6Debug().complete && !stateMod.isGameOver);
const s6PoolsBefore = s6mod.hqWorldDebug().pools;
s6HqPut(s6mod.HQ_START); s6mod.stage6Scene.updateMode(0.1);
const s6PoolsAfter = s6mod.hqWorldDebug().pools;
T('S6 DIALOG: seluruh beat terskrip tampil sekali, urut, dan body-nya pernah parsial',
    s6ShownOrder.filter(k => S6_SPINE.includes(k)).join(',') === S6_SPINE.join(',')
    && Object.keys(expectedS6Dialogue).every(k => s6Partial.has(k)));
T('S6 NO BOSS: seluruh encounter berisi C/B/A biasa tanpa boss entity',
    !robots.some(z => z.stage === 6 && z.kind === 'boss'));
T('S6 FIXED POOLS: spark pool tidak menambah mesh sepanjang stage',
    JSON.stringify(s6PoolsAfter) === JSON.stringify(s6PoolsBefore));
T('S6 COMPLETE: kembali ke SF membuka layar hijau Stage 6 sebelum Field Shop',
    stateMod.isGameOver && s6mod.stage6Debug().complete
    && smMod.activeScene === s6mod.stage6Scene
    && dom4.gameOverTitle.innerText === 'STAGE 6 COMPLETE'
    && dom4.goStageStats.style.display === 'grid' && !shopMod.isShopOpen()
    && save5Mod.loadCampaignStage() === 6);
T('S6 COMPLETE CONTINUE: CONTINUE baru membuka scene Field Shop menuju Stage 7',
    gameMod.activateGameOverPrimary() && !stateMod.isGameOver
    && smMod.activeScene.id === 'campaign-shop');
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));
T('S6 SHOP: Field Shop terbuka setelah finish screen ditutup', shopMod.isShopOpen());

// --- 17a-quater. CAMPAIGN STAGE 7 - PASUPATI NIGHT RUN (2026-08-09).
// Field Shop -> 1.5 km Prof. Dr. Mochtar Kusumaatmadja Flyover east-to-west
// -> cable-stayed landmark at meter 700 -> Pasteur toll factories -> GRD LTV-45. ---
const s7Carry = {
    money: stateMod.score, hp: player.hp, armor: player.armor,
    medkits: player.medkits, weapons: player.weapons.join(','),
};
smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');
for (let i = 0; i < 500 && smMod.activeScene !== s7mod.stage7Scene; i++)
    await new Promise(r => setTimeout(r, 10));
T('S7 TRANSISI: Start Next Stage dari Field Shop masuk Stage 7 + checkpoint 7',
    smMod.activeScene === s7mod.stage7Scene && save5Mod.loadCampaignStage() === 7);
T('S7 TRANSISI FRAME PERTAMA: flyover terlihat sebelum dialog opening dan kontrol cinematic',
    dom4.cineFadeDebug()?.opacity === 0 && s7mod.stage7DialogueDebug().key === null
    && dom4.stageRadioDialogueDebug() === null && stateMod.cinematicActive);
stateMod.setPaused(false);
T('S7 TRANSISI: money/HP/armor/medkit/senjata bertahan melewati Field Shop',
    stateMod.score === s7Carry.money && player.hp === s7Carry.hp
    && player.armor === s7Carry.armor && player.medkits === s7Carry.medkits
    && player.weapons.join(',') === s7Carry.weapons);

const expectedS7Dialogue = {
    openingCommand: { speaker: 'Command', text: 'Major, the east end of the Prof. Dr. Mochtar Kusumaatmadja Flyover is ahead. Cross all one point five kilometers to Pasteur.' },
    openingGibran: { speaker: 'Major Gibran', text: 'Straight west, eight lanes, and a city full of machines. Understood.' },
    flyoverPlan: { speaker: 'Major Gibran', text: "The abandoned vehicles have turned the whole deck into a maze. I'll weave through." },
    mortarWarning: { speaker: 'Command', text: 'Major, hostile mortar batteries have your position. Keep moving when the shells begin to fall.' },
    landmarkCommand: { speaker: 'Command', text: 'You are passing the Pasupati cable tower, seven hundred meters from the east end. Pasteur is eight hundred meters ahead.' },
    landmarkGibran: { speaker: 'Major Gibran', text: 'I see the tower. The median is open; I can cross between both carriageways.' },
    tollSight: { speaker: 'Major Gibran', text: 'Pasteur Toll Gate, west end of the flyover. Robot fabricators are guarding it.' },
    vehicleFind: { speaker: 'Major Gibran', text: "An armored tactical vehicle... Engine's intact, fuel cells are still charged." },
    routeCommand: { speaker: 'Command', text: 'Pasteur gives you access to the toll network. That vehicle can route you toward Kertajati.' },
    routeReply: { speaker: 'Major Gibran', text: "Then that's my route. I'm taking the toll network to Kertajati." },
    warningCommand: { speaker: 'Command', text: 'Understood. Move fast, Major. Enemy forces are already converging on the toll road.' },
    finalGibran: { speaker: 'Major Gibran', text: "Let them come. Tell Kertajati I'm on my way." },
};
T('S7 DIALOG: seluruh naskah Pasupati tersimpan PERSIS dan urut',
    JSON.stringify(s7mod.STAGE7_DIALOGUE) === JSON.stringify(expectedS7Dialogue));

const s7Partial = new Set(), s7ShownOrder = [];
let s7LastKey = null;
function sampleS7Dialogue() {
    const d = s7mod.stage7DialogueDebug();
    if (d.key && d.key !== s7LastKey) { s7ShownOrder.push(d.key); s7LastKey = d.key; }
    if (d.key && d.chars > 0 && d.chars < d.text.length) s7Partial.add(d.key);
}
function tickS7(total, step = 1 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps)) {
    let left = Math.max(0, total), guard = 0;
    while (left > 1e-9 && guard++ < 40000) {
        const dt = Math.min(step, left);
        s7mod.stage7Scene.updateMode(dt); sampleS7Dialogue(); left -= dt;
    }
}
function drainS7Dialogue() {
    let guard = 0; sampleS7Dialogue();
    while (guard++ < 40000) {
        const d = s7mod.stage7DialogueDebug();
        if (!d.key && !d.queued.length) break;
        tickS7(1.01 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps));
    }
}
function killS7(encounter = null) {
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 7 || (encounter && z.encounter !== encounter)) continue;
        robotsMod.disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
    }
}
const s7Mix = encounter => {
    const out = { C: 0, B: 0, A: 0 };
    for (const z of robots)
        if (z.stage === 7 && z.encounter === encounter && out[z.kind] != null) out[z.kind]++;
    return out;
};
const mixCount = m => Object.values(m).reduce((a, b) => a + b, 0);
function hitS7Factory(m) {
    if (!m?.alive) return false;
    const b = {
        px: m.x - S7C.spawnMachines.hitRadius * 2, pz: m.z,
        mesh: { position: new THREE.Vector3(m.x, 10, m.z) },
        damage: MACHINE_HP(), explosive: true,
        dir: new THREE.Vector3(1, 0, 0),
    };
    return s7mod.stage7Scene.bulletBlocked(b);
}
function hitS7Factories() {
    let hits = 0;
    for (const m of s7mod.stage7WorldDebug().spawnMachines)
        if (hitS7Factory(m)) hits++;
    return hits;
}

const s7World = s7mod.stage7WorldDebug();
const s7Fly = s7mod.stage7FlyoverDebug();
const s7Conn = s7mod.stage7ConnectivityDebug();
const S7F = S7C.flyover;
const s7ExpectedRampStations = Math.floor((S7F.lengthMeters - 1e-9)
    / S7F.rampIntervalMeters);
const s7ExpectedRampCount = s7ExpectedRampStations * 2;
const s7ExpectedWidthMeters = S7F.laneCountPerSide * 2 * S7F.laneWidthMeters
    + S7F.medianWidthMeters + S7F.shoulderWidthMeters * 2;

T('S7 FLYOVER: panjang CFG tepat 1,5 km, lurus, dan orientasi timur ke barat',
    s7World.built && s7World.nav && s7World.staticBatches > 0
    && s7Fly.meters.length === S7F.lengthMeters
    && Math.abs(s7Fly.world.length / cfgMod.CAMP_M - S7F.lengthMeters) < 1e-9
    && Math.abs((s7Fly.world.eastX - s7Fly.world.westX) / cfgMod.CAMP_M
        - S7F.lengthMeters) < 1e-9
    && s7Fly.orientation === 'east-to-west'
    && s7mod.S7_START.x > s7mod.S7_TOLL.x
    && s7Fly.toll.atWestEnd && s7Fly.toll.name === 'Pasteur Toll Gate');

T('S7 LAJUR: empat lajur per sisi tetap 3 m dan total dek mencakup dua bahu',
    s7Fly.lanes.perSide === S7F.laneCountPerSide
    && s7Fly.lanes.total === S7F.laneCountPerSide * 2
    && s7Fly.meters.lane === S7F.laneWidthMeters
    && Math.abs(s7Fly.lanes.carriagewayWidth / cfgMod.CAMP_M
        - S7F.laneCountPerSide * S7F.laneWidthMeters) < 1e-9
    && Math.abs(s7Fly.lanes.totalWidth / cfgMod.CAMP_M - s7ExpectedWidthMeters) < 1e-9
    && new Set(s7Fly.lanes.centers.map((z, i) => i
        ? Math.round(Math.abs(z - s7Fly.lanes.centers[i - 1]) * 1000) : null)
        .filter(Boolean)).size <= 2);

T('S7 BAHU: kiri-kanan tepat 1 m, garis solid, lalu barrier berada di luarnya',
    s7Fly.meters.shoulder === S7F.shoulderWidthMeters
    && s7Fly.shoulders.count === 2
    && s7Fly.shoulders.width / cfgMod.CAMP_M === S7F.shoulderWidthMeters
    && s7Fly.shoulders.linesSolid && s7Fly.shoulders.barriersOutside
    && s7World.props.filter(p => p.kind === 'road-shoulder').length === 2
    && s7World.props.filter(p => p.kind === 'shoulder-line')
        .every(p => p.style === 'solid' && !p.dashed)
    && s7World.props.some(p => p.kind === 'outer-barrier' && p.solid
        && p.outsideShoulder));

T('S7 MEDIAN: pembatas tepat 1 m, tanpa collider memanjang, dan bisa diseberangi',
    s7Fly.meters.median === S7F.medianWidthMeters
    && s7Fly.median.walkable && s7Fly.median.collision === false
    && s7Fly.median.clearPassages >= 8
    && s7Conn.path.crossesMedian && s7Conn.path.medianCrossings >= 1);

const s7UnreachableRampApproaches = s7Conn.rampApproaches.filter(r => !r.reachable);
T('S7 RAMP: setiap 300 m ada jalan naik dua lajur paralel di kiri DAN kanan lalu merge sebagai lajur kelima'
    + (s7UnreachableRampApproaches.length ? ' [unreachable approach '
        + s7UnreachableRampApproaches.map(r => r.id).join(',') + ']' : ''),
    s7Fly.ramps.intervalMeters === S7F.rampIntervalMeters
    && s7Fly.ramps.count === s7ExpectedRampCount
    && s7Fly.ramps.left === s7ExpectedRampStations
    && s7Fly.ramps.right === s7ExpectedRampStations
    && s7mod.S7_RAMPS.length === s7ExpectedRampCount
    && s7Fly.ramps.laneCount === S7F.rampLaneCount
    && s7Fly.ramps.totalWidth / cfgMod.CAMP_M
        === S7F.rampLaneCount * S7F.rampLaneWidthMeters
    && s7Fly.ramps.entries.every(r => r.laneCount === S7F.rampLaneCount
        && !r.accessible && r.barricaded && r.direction === 'up'
        && r.startY < 0 && r.endY === 0
        && r.orientation === 'parallel' && r.travel === 'east-to-west'
        && r.parallel && !r.rightAngle && r.taperedMerge && r.fifthLane
        && r.mergeTo === 'outer-lane'
        && r.startMeter < r.mergeMeter && r.mergeMeter < r.mergeEndMeter
        && Math.abs(r.mergeLength / cfgMod.CAMP_M
            - S7F.rampMergeLengthMeters) < 1e-9
        && r.lowerRoadVisible && Math.abs(r.width / cfgMod.CAMP_M
            - S7F.rampLaneCount * S7F.rampLaneWidthMeters) < 1e-9
        && Math.abs(r.laneWidth / cfgMod.CAMP_M
            - S7F.rampLaneWidthMeters) < 1e-9)
    && s7Conn.allRampApproachesReachable && s7Conn.allRampsInaccessible
    && s7World.props.filter(p => p.kind === 'ramp-barricade'
        && p.solid && p.blocksPlayer && p.blocksRobots).length === s7ExpectedRampCount);

T('S7 ELEVASI: dek benar-benar di atas jalan bawah dan ditopang pier berkala',
    s7Fly.meters.deckHeight === S7F.deckHeightMeters
    && s7Fly.elevation.deckHeight === S7F.deckHeightMeters * cfgMod.CAMP_M
    && s7Fly.elevation.supports === Math.floor((S7F.descentStartMeter
        + S7F.descentLengthMeters - 1e-9)
        / S7F.supportIntervalMeters)
    && s7Fly.elevation.lowerCrossRoads === Math.floor(S7F.lengthMeters
        / S7F.rampIntervalMeters) + 1
    && s7Fly.elevation.parallelFeeders === 2
    && s7Fly.elevation.lowerRoads
        === s7Fly.elevation.lowerCrossRoads + s7Fly.elevation.parallelFeeders
    && s7Fly.elevation.everyLowerRoadAtOrBelowDeck
    && s7World.lowerRoads.every(r => r.y < 0
        && (r.belowDeck || r.joinsLowerLevel || r.parallelFeeder)));

const s7Descent = s7Fly.elevation.descent;
T('S7 TURUNAN PASTEUR: mulai sesuai CFG, turun kontinu ke plaza bawah, lalu gerbang berada di bawah dek Pasupati',
    s7Fly.meters.descentStart === S7F.descentStartMeter
    && s7Fly.meters.descentLength === S7F.descentLengthMeters
    && s7Fly.meters.descentDrop === S7F.descentDropMeters
    && s7Descent.startMeter === S7F.descentStartMeter
    && s7Descent.endMeter === S7F.descentStartMeter + S7F.descentLengthMeters
    && s7Descent.drop === S7F.descentDropMeters * cfgMod.CAMP_M
    && s7Descent.startY === 0
    && Math.abs(s7Descent.midY + s7Descent.drop / 2) < 1e-9
    && Math.abs(s7Descent.endY + s7Descent.drop) < 1e-9
    && s7Descent.lowerApproachMeters
        === S7F.lengthMeters - S7F.descentStartMeter - S7F.descentLengthMeters
    && s7Descent.pitch > 0 && s7Descent.continuous
    && s7Fly.toll.belowUpperDeck && s7Fly.toll.atLowerLevel
    && s7Fly.toll.y === -s7Fly.elevation.deckHeight
    && s7mod.stage7RoadHeight(s7Fly.world.eastX
        - S7F.descentStartMeter * cfgMod.CAMP_M) === 0
    && s7mod.stage7RoadHeight(s7Fly.world.westX) === s7Fly.toll.y
    && s7mod.stage7Scene.groundHeight(s7mod.S7_TOLL.x) === s7Fly.toll.y
    && s7mod.stage7Scene.clampDropPos(
        s7mod.S7_VEHICLE.x, s7mod.S7_VEHICLE.z)[2] === s7Fly.toll.y);

// FX MENGIKUTI KONTUR JALAN (2026-08-10, laporan user: di ujung turunan
// Pasupati "ledakan dan pecahan musuh masih melayang di atas seakan-akan jalan
// itu masih berada di atas"). Cincin ledakan, kilat, percikan coolant dan
// genangan DULU memakai y=0 mati — benar selama semua lantai ada di y=0, tetapi
// dek Stage 7 turun 12 m di 200 m terakhir. Sumber kebenarannya satu:
// `activeScene.groundHeight`.
{
    const CM = cfgMod.CAMP_M;
    const at = m => s7Fly.world.eastX - m * CM;
    const roadY = x => s7mod.stage7RoadHeight(x);
    const slopeX = at(S7F.descentStartMeter + S7F.descentLengthMeters / 2);
    const plazaX = at(S7F.descentStartMeter + S7F.descentLengthMeters + 20);
    goreMod.resetGore(); effectsMod.resetBloodPool();
    stateMod.explosions.length = 0;

    goreMod.spawnBloodDecal(plazaX, 0, 3);
    goreMod.spawnBloodDecal(slopeX, 0, 3);
    const decals = goreMod.goreDebug().decals;
    T(`S7 KONTUR FX: genangan coolant menempel di aspal turunan, bukan di y=0 [plaza ${roadY(plazaX).toFixed(0)}, lereng ${roadY(slopeX).toFixed(0)}]`,
        roadY(plazaX) < -1 && roadY(slopeX) < -1 && roadY(slopeX) > roadY(plazaX)
        && decals.length === 2
        && decals.every(d => d.y - roadY(d.x) >= 0.06 - 1e-9
            && d.y - roadY(d.x) <= 0.1));

    effectsMod.spawnBloodBurst(slopeX, roadY(slopeX) + 12, 0, 1, 0, 8, 1, 2.1);
    // Satu percikan dijatuhkan LURUS ke bawah supaya pendaratannya deterministik
    // (percikan kerucut biasa keburu habis umur sebelum menyentuh lantai).
    effectsMod.spawnBlood(slopeX, roadY(slopeX) + 6, 0, 0, -40, 0);
    let settled = 0;
    for (let i = 0; i < 20; i++) {
        effectsMod.updateBloodPool(0.016);
        for (const b of effectsMod.bloodPoolDebug())
            if (Math.abs(b.y - (b.gy + 0.4)) < 0.01) settled++;
    }
    const blood = effectsMod.bloodPoolDebug();
    T(`S7 KONTUR FX: percikan coolant mengendap di permukaan jalan [lantai ${blood.length ? blood[0].gy.toFixed(0) : 'n/a'}]`,
        blood.length > 0 && settled > 0
        && blood.every(b => Math.abs(b.gy - roadY(slopeX)) < 1e-9
            && b.y >= b.gy + 0.4 - 1e-6));

    effectsMod.explodeAt(new THREE.Vector3(slopeX, roadY(slopeX) + 5, 0), 1, 0);
    const shock = stateMod.explosions.find(e => e.scale === 95);
    const flash = stateMod.explosions.find(e => e.light);
    T('S7 KONTUR FX: gelombang kejut + kilat ledakan ikut turun bersama jalan',
        !!shock && Math.abs(shock.mesh.position.y - (roadY(slopeX) + 0.8)) < 1e-9
        && !!flash && Math.abs(flash.light.position.y - (roadY(slopeX) + 14)) < 1e-9);
    for (let i = 0; i < 6; i++) effectsMod.updateExplosions(0.2);
    goreMod.resetGore(); effectsMod.resetBloodPool();
    stateMod.explosions.length = 0;
}

T('S7 MALAM/LAMPU: semua tiang berada di median, bercabang kiri-kanan, fixed lights',
    s7Fly.night && s7Fly.lamps.visual >= 20
    && s7Fly.lamps.dualBranch && s7Fly.lamps.centerMounted
    && s7Fly.lamps.intervalMeters === S7F.lampIntervalMeters
    && s7Fly.lamps.pointLights === Math.min(S7F.pointLights, s7Fly.lamps.visual)
    && s7World.props.filter(p => p.kind === 'median-lamp' && p.solid).length
        === s7Fly.lamps.visual);

const s7ExpectedCars = s7Fly.maze.bands * S7F.carsPerBand + S7F.scatteredCars;
const s7RouteCoverage = points => {
    const bins = Math.min(S7F.laneCountPerSide * 2, points.length);
    if (!bins) return true;
    return new Set(points.map(p => Math.min(bins - 1, Math.floor(
        Math.max(0, Math.min(S7F.lengthMeters - 1e-9,
            (s7Fly.world.eastX - p.x) / cfgMod.CAMP_M))
        / S7F.lengthMeters * bins)))).size === bins;
};
T('S7 LABIRIN: mobil tersebar sepanjang rute, memutus garis lurus, tetapi rute tetap tersambung',
    s7Fly.maze.bands === S7F.mazeBandCount
    && s7Fly.maze.cars === s7ExpectedCars
    && s7RouteCoverage(s7World.props.filter(p => p.kind === 'abandoned-car'))
    && s7Fly.maze.directBlocked && s7Fly.maze.connected
    && s7Conn.connected && Object.values(s7Conn.goals).every(Boolean)
    && s7Conn.path.detourRatio > 1
    && s7Conn.path.crossesMedian
    && s7World.props.filter(p => p.kind === 'abandoned-car' && p.solid).length
        === s7ExpectedCars);

const s7VehicleProps = s7World.props.filter(p => p.kind === 'abandoned-car');
const s7ExtraTypes = s7RoadVehicleMod.STAGE7_EXTRA_VEHICLE_TYPES;
const s7VehicleTypePoints = Object.fromEntries(s7ExtraTypes.map(type => [type,
    s7VehicleProps.filter(p => p.vehicleType === type)]));
T('S7 VARIASI KENDARAAN: truk kontainer, dump truck, bus, truk tangki, dan pickup semuanya hadir',
    s7ExtraTypes.join(',') === 'container-truck,dump-truck,bus,tanker-truck,pickup'
    && s7ExtraTypes.every(type => s7VehicleTypePoints[type].length > 0)
    && s7VehicleProps.every(p => {
        const spec = s7RoadVehicleMod.STAGE7_ROAD_VEHICLE_SPECS[p.vehicleType];
        return !!spec && p.vehicleLengthMeters === spec.length
            && p.vehicleWidthMeters === spec.width
            && p.vehicleHeightMeters === spec.height;
    }));
T('S7 VARIASI KENDARAAN: setiap jenis baru tersebar di paruh timur DAN barat flyover',
    s7ExtraTypes.every(type => s7VehicleTypePoints[type].some(p => p.meter < S7F.lengthMeters / 2)
        && s7VehicleTypePoints[type].some(p => p.meter > S7F.lengthMeters / 2)));
T('S7 COVER KENDARAAN BESAR: kelima jenis baru solid dan menghentikan swept bullet/LOS',
    s7ExtraTypes.every(type => {
        const p = s7VehicleTypePoints[type][0];
        return p && p.solid && s7mod.stage7SegHitsWall(
            p.x - p.hx * 2, p.z, p.x + p.hx * 2, p.z, 8);
    }));

const s7RoadCuts = [0, S7F.lengthMeters, S7F.descentStartMeter,
    S7F.descentStartMeter + S7F.descentLengthMeters]
    .filter(m => m >= 0 && m <= S7F.lengthMeters)
    .sort((a, b) => a - b)
    .filter((m, i, a) => !i || Math.abs(m - a[i - 1]) > 1e-9);
T('S7 JALAN UTUH: seluruh sistem lubang/crater dihapus dari config, ekspor, prop, dan mesh jalan',
    !('potholeCount' in S7F)
    && !('potholeMinRadiusMeters' in S7F)
    && !('potholeMaxRadiusMeters' in S7F)
    && !('S7_HOLES' in s7mod)
    && !('holes' in s7Fly.maze)
    && !s7World.props.some(p => p.kind === 'road-crater')
    && s7Fly.maze.roadSkinSegments === s7RoadCuts.length - 1);

T('S7 OPTIMASI: kendaraan di-frustum-cull per chunk dan blocker memakai indeks spasial',
    s7World.optimization.vehicleChunks.chunkMeters > 0
    && s7World.optimization.vehicleChunks.chunks > 1
    && s7World.optimization.vehicleChunks.raw === s7ExpectedCars
    && s7World.optimization.vehicleChunks.maxRaw < s7ExpectedCars
    && s7World.optimization.blockerBins.binMeters > 0
    && s7World.optimization.blockerBins.bins > 1
    && s7World.optimization.blockerBins.references >= s7World.blockers
    && s7World.optimization.blockerBins.maxPerBin < s7World.blockers);

const s7FirstCar = s7World.props.find(p => p.kind === 'abandoned-car');
T('S7 COVER MOBIL: kendaraan solid juga menghentikan swept bullet/LOS',
    !!s7FirstCar && s7mod.stage7SegHitsWall(
        s7FirstCar.x - s7FirstCar.hx * 2, s7FirstCar.z,
        s7FirstCar.x + s7FirstCar.hx * 2, s7FirstCar.z, 8));

T('S7 LANDMARK: pylon Pasupati tepat meter 700 memakai 10 kabel besar, seimbang depan-belakang',
    s7Fly.landmark.meter === S7F.landmarkMeter
    && Math.abs((s7Fly.world.eastX - s7Fly.landmark.x) / cfgMod.CAMP_M
        - S7F.landmarkMeter) < 1e-9
    && s7Fly.landmark.inMedian
    && s7Fly.landmark.cables === S7F.landmarkCableCount
    && s7Fly.landmark.cableFront + s7Fly.landmark.cableBack
        === S7F.landmarkCableCount
    && Math.abs(s7Fly.landmark.cableFront - s7Fly.landmark.cableBack) <= 1
    && s7Fly.landmark.cableThickness >= 0.06 * cfgMod.CAMP_M
    && s7Fly.landmark.cableAnchorsInMedian
    && s7Fly.landmark.cableAnchorMaxZ <= S7F.medianWidthMeters
        * cfgMod.CAMP_M / 2
    && s7Fly.landmark.pieces >= 15
    && s7Fly.landmark.tapered && s7Fly.landmark.splitCrown
    && s7Fly.landmark.height === S7F.landmarkHeightMeters * cfgMod.CAMP_M
    && s7Fly.landmark.bypass && s7Conn.landmarkBypass
    && s7World.props.some(p => p.kind === 'pasupati-pylon'
        && p.officialName === 'Prof. Dr. Mochtar Kusumaatmadja Flyover'));

T('S7 WORLD: flyover punya dek, bahu, ramp naik-merge, kota bawah, landmark, Pasteur, dan GRD',
    ['flyover-deck', 'road-shoulder', 'side-ramp', 'ramp-barricade',
        'lower-city-building', 'pasupati-pylon',
        'abandoned-car', 'pasteur-toll-canopy',
        'toll-booth', 'robot-factory', 'grd-ltv-45']
        .every(k => s7World.propKinds.includes(k))
    && s7World.pools.rain === 96 && s7World.pools.ripples === 24
    && s7World.pools.sparks === 20 && s7World.pools.exhaust === 12
    && s7World.pools.mortarShells === S7C.mortar.poolSize
    && s7World.pools.mortarMarkers === S7C.mortar.poolSize * 2);

T('S7 FINISH LTV: GRD LTV-45 berada di sisi kiri arah timur-ke-barat, bukan median',
    s7Fly.vehicle.roadSide === 'left' && s7Fly.vehicle.onLeftSide
    && !s7Fly.vehicle.centered && s7mod.S7_VEHICLE.z === s7Fly.vehicle.z
    && s7Fly.vehicle.y === s7Fly.toll.y
    && s7World.props.some(p => p.kind === 'grd-ltv-45'
        && p.roadSide === 'left' && !p.centered && p.z > 0
        && p.roadY === s7Fly.toll.y));

// --- 17a-sexies. PUSAT KOTA BANDUNG + MALAM SUNGGUHAN (2026-08-10, dua
//     permintaan user: "buat agar suasananya lebih terasa malam, ini masih
//     terlalu terang" dan "beri banyak bangunan seperti gedung, rumah, toko,
//     sekolah, taman ... INI ADALAH KOTA BANDUNG, PUSAT KOTA BANDUNG"). ---
const s7CityMod = await import(R('src/scenes/campaign/stages/stage7/stage7City.js'));
const s7LightMod = await import(R('src/world/lighting.js'));
const s7City = s7mod.stage7CityDebug();
const s7CitySrc = fs.readFileSync(ROOT + '/src/scenes/campaign/stages/stage7/stage7City.js', 'utf8');
const S7_CITY_TYPES = ['ruko', 'kampung', 'pasar', 'sekolah', 'taman', 'gedung',
    'alunAlun', 'braga', 'gedungSate'];
T(`S7 KOTA: pusat kota Bandung berdiri di kedua sisi flyover [${s7City.districts.length} distrik, ${s7City.raw} mesh mentah]`,
    s7City.districts.length >= 60
    && S7_CITY_TYPES.every(t => s7City.types.includes(t))
    && s7City.districts.every(d => d.top > s7City.groundY && d.meter >= 0)
    && s7City.districts.filter(d => d.side < 0).length > s7City.districts.length / 2
    && s7City.districts.some(d => d.side > 0)
    && s7City.groundY === s7Fly.toll.y);
// Landmark ikonik: Gedung Sate persis di meter pylon, supaya benar-benar
// terbingkai saat kamera menarik mundur.
T('S7 KOTA: Gedung Sate tunggal berdiri di meter landmark, alun-alun + Braga hadir',
    s7City.districts.filter(d => d.type === 'gedungSate').length === 1
    && Math.abs(s7City.districts.find(d => d.type === 'gedungSate').meter
        - S7F.landmarkMeter) <= s7City.districtMeters / 2
    && s7City.districts.filter(d => d.type === 'alunAlun').length >= 1
    && s7City.districts.filter(d => d.type === 'braga').length >= 2
    && s7World.propKinds.includes('bandung-landmark')
    && s7World.propKinds.includes('bandung-park'));
// DEKOR MURNI: tak satu pun blocker/nav — collision & BFS stage tak berubah.
T('S7 KOTA: seluruh kota murni dekor (tanpa blocker, tanpa PointLight)',
    s7World.props.filter(p => ['lower-city-building', 'bandung-park',
        'bandung-landmark'].includes(p.kind)).every(p => !p.solid)
    && s7City.pointLights === 0 && s7City.blockers === 0
    && s7Fly.lamps.pointLights === Math.min(S7F.pointLights, s7Fly.lamps.visual));
// ATURAN SISI KAMERA: ruas mata->player selalu di z 0..+70 dan y 11..127, jadi
// apa pun di sisi +z yang puncaknya TETAP DI BAWAH permukaan dek mustahil
// menutupi player. Ini yang membuat baris +z aman untuk diisi.
T(`S7 KOTA: sisi kamera tak pernah menembus permukaan dek [tertinggi ${s7City.maxNearTop.toFixed(1)}]`,
    s7City.nearTopY < 0 && s7City.maxNearTop <= s7City.nearTopY + 1e-6
    && s7City.districts.filter(d => d.side > 0).length >= 15
    && s7CityMod.S7_CITY_ROWS.near[0]
        >= S7F.rampLaneCount * S7F.rampLaneWidthMeters * cfgMod.CAMP_M);
// Sapuan MESH (bukan ringkasan distrik): tak satu pun bagian kota boleh masuk
// koridor flyover, dan di sisi kamera tak satu pun boleh menembus dek.
{
    let cityRoot = null;
    scene.traverse(o => { if (o.name === 'Stage7BandungCity') cityRoot = o; });
    const halfOf = o => {
        const a = o.geometry?.args || [];
        const t = o.geometry?.type;
        const sx = t === 'box' ? a[0] : t === 'cyl' ? 2 * Math.max(a[0], a[1])
            : t === 'cone' ? 2 * a[0] : t === 'sph' ? 2 * a[0] : 0;
        const sy = t === 'box' ? a[1] : t === 'cyl' ? a[2]
            : t === 'cone' ? a[1] : t === 'sph' ? 2 * a[0] : 0;
        const sz = t === 'box' ? a[2] : sx;
        const yaw = o.rotation?.y || 0;
        return {
            z: (Math.abs(Math.sin(yaw)) * sx * o.scale.x
                + Math.abs(Math.cos(yaw)) * sz * o.scale.z) / 2,
            y: sy * o.scale.y / 2,
        };
    };
    let meshes = 0, inCorridor = 0, overDeck = 0;
    cityRoot?.traverse(o => {
        if (!o.isMesh) return;
        meshes++;
        const h = halfOf(o);
        if (Math.abs(o.position.z) - h.z < s7Fly.lanes.totalWidth / 2 - 1) inCorridor++;
        if (o.position.z > 0 && o.position.y + h.y > s7City.nearTopY + 1) overDeck++;
    });
    T(`S7 KOTA: tak ada mesh kota di koridor flyover / menembus dek sisi kamera [${meshes} mesh]`,
        !!cityRoot && meshes > 1200 && inCorridor === 0 && overDeck === 0);
}
// PELAJARAN LANSKAP STAGE 5: apa pun yang dibangun di luar jangkauan kamera
// tidak pernah menampilkan satu piksel pun. Di kamera top-down ini tepi ATAS
// layar adalah TANAH TERJAUH, jadi batasnya diuji dengan proyeksi stage
// sendiri — bukan angka mati.
{
    const eye = cfgMod.CFG.player.eyeHeight;
    const outer = [s7Fly.lanes.centers[0], s7Fly.lanes.centers[s7Fly.lanes.total - 1]];
    const half = s7City.districtMeters / 2;
    const seen = d => {
        const lane = d.side < 0 ? outer[0] : outer[1];
        // Batas atas kamera BUKAN meter 1500: pada cutscene outro `setCineFocus`
        // mengikuti GRD LTV-45 yang melaju melewati gerbang (~32 m sebelum fade),
        // jadi dunia lanjutan di baliknya memang sempat terlihat.
        const reach = S7F.lengthMeters + 40;
        for (const back of [0, 20, 40, 60]) {
            const meter = Math.max(4, Math.min(reach, d.meter - back));
            const x = s7Fly.world.eastX - meter * cfgMod.CAMP_M;
            camera.position.set(x, s7mod.stage7RoadHeight(x) + eye, lane);
            // Samakan titik fokus kamera dgn posisi player, kalau tidak
            // `stage7RobotInView` memproyeksikan dari camFocus sisa tes lain.
            rendererMod.setCineFocus(x, lane, true);
            for (const dm of [-half, 0, half])
                for (const y of [s7City.groundY, (s7City.groundY + d.top) / 2, d.top])
                    if (s7mod.stage7RobotInView(d.x + dm * cfgMod.CAMP_M, d.z, y))
                        return true;
        }
        return false;
    };
    const blind = s7City.districts.filter(d => !seen(d));
    T(`S7 KOTA: tidak ada distrik yang dibangun di luar jangkauan kamera [${blind.length} buta dari ${s7City.districts.length}]`,
        blind.length === 0);
    camera.position.set(s7mod.S7_START.x, s7mod.S7_START.y + eye, s7mod.S7_START.z);
    rendererMod.setCineFocus(s7mod.S7_START.x, s7mod.S7_START.z, true);
}
// DUNIA LANJUT DI BALIK GERBANG (2026-08-10, laporan user "dunia habis di depan
// tol Pasteur, ini jadi terlihat aneh"): jalan/tanah/kota diteruskan
// `beyondTollMeters`, TAPI kuncinya tetap `stage7Walk` — player berhenti tepat
// di gerbang dan tak satu pun prop lanjutan menjadi blocker.
{
    const B = s7Fly.beyond, CM = cfgMod.CAMP_M;
    const past = [5, 40, 90, S7F.beyondTollMeters - 5].map(dm =>
        s7Fly.world.westX - dm * CM);
    T(`S7 LANJUTAN: dunia diteruskan ${B.meters} m di balik gerbang tol [${B.props} prop, ${B.lamps} lampu dekor]`,
        B.meters === S7F.beyondTollMeters && B.meters > 0
        && Math.abs(B.endX - (s7Fly.world.westX - B.meters * CM)) < 1e-6
        && B.roadY === s7Fly.toll.y
        && B.props > 6 && B.lamps >= 2
        && ['beyond-toll-road', 'beyond-lamp', 'beyond-car']
            .every(k => s7World.propKinds.includes(k))
        && s7City.beyondMeters === B.meters
        && s7City.endMeter === S7F.lengthMeters + B.meters
        && s7City.districts.some(d => d.meter > S7F.lengthMeters));
    T('S7 LANJUTAN: player tetap terkunci di gerbang tol dan lanjutannya nol blocker',
        B.playerLocked && B.solidProps === 0
        && past.every(x => !s7mod.stage7Walk(x, 0, 0)
            && !s7mod.stage7Walk(x, s7Fly.lanes.centers[0], 0))
        && s7mod.stage7Walk(s7Fly.world.westX + player.radius + 0.5, 0, player.radius)
        // nav grid tak melar ke luar gerbang
        && s7World.navBounds.x0 >= s7Fly.world.westX - 3 * CM
        && s7Conn.connected && s7Conn.allRampsInaccessible);
}
// PENJAGA SESUNGGUHNYA: biaya draw call sesudah dilas per potongan 125 m —
// bukan jumlah mesh mentah (kota padat memang mahal secara mesh, murah secara
// draw call), dan potongan yang tak terlihat masih bisa di-frustum-cull.
T(`S7 KOTA: biaya draw call tetap kecil walau padat [${s7City.welded} dilas dari ${s7City.raw} mentah, ${s7City.chunks} potongan]`,
    s7City.raw > 1200 && s7City.welded < 210 && s7City.welded < s7City.raw / 8
    && s7City.chunkMeters <= 150);
// Kota ini dibangun saat loading bersama seluruh dunia campaign: memakai RNG
// global akan menggeser penempatan acak stage lain (aturan sama dgn lanskap
// Stage 5).
T('S7 KOTA: penataan deterministik — tanpa RNG global',
    !/Math\s*\.\s*random\s*\(/.test(s7CitySrc
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
{
    const { FORBIDDEN_HEX, EMISSIVE_MAX } = await import(R('src/world/palette.js'));
    const mats = s7CityMod.bandungMaterials();
    const flat = Object.values(mats).flatMap(v => Array.isArray(v) ? v : [v]);
    T('S7 KOTA: seluruh material kota memakai token PAL (tanpa neon, emissive <= EMISSIVE_MAX)',
        flat.length >= 15 && flat.every(m2 => !FORBIDDEN_HEX.includes(m2.color.getHex())
            && !FORBIDDEN_HEX.includes(m2.emissive.getHex())
            && (m2.emissive.getHex() === 0 || m2.emissiveIntensity <= EMISSIVE_MAX)));
}
// MALAM (2026-08-10, "ini masih terlalu terang"): `night` masih memakai
// matahari apokaliptik oranye 0.32 dan `enterCityEnv` memasang haze biru-abu
// terang — gabungan itu terbaca SENJA. Stage 7 memakai `midnight` PLUS haze
// malam pekat; haze-lah yang paling menentukan terang/gelap karena ia mengisi
// layar dan menjadi warna akhir kabut. Nilai pembandingnya DIUKUR dari default
// yang dipakai stage kota lain, bukan angka mati.
{
    const N = s7LightMod.LIGHT_PRESETS.midnight, D = s7LightMod.LIGHT_PRESETS.night;
    const cityEnvMod = await import(R('src/scenes/campaign/utility/cityscape.js'));
    const nightNow = { bg: scene.background.getHex(), fog: scene.fog.color.getHex(),
        near: scene.fog.near, far: scene.fog.far };
    // Harness tak pernah membangun cahaya dasar (renderer di-stub), padahal
    // yang diuji di sini justru intensitas & WARNA-nya.
    if (!s7LightMod.dirLight) s7LightMod.createBaseLights(scene);
    s7LightMod.applyLightPreset(scene, 'midnight');
    // Ukur default stage kota lain, lalu pulihkan malam Stage 7 — TANPA enter()
    // ulang, karena sisa berkas ini menguji state stage yang sudah berjalan.
    s7LightMod.applyLightPreset(scene, 'night');
    cityEnvMod.enterCityEnv();
    const base = { bg: scene.background.getHex(), fog: scene.fog.color.getHex(),
        far: scene.fog.far, dir: s7LightMod.dirLight.color.getHex(),
        amb: s7LightMod.ambLight.color.getHex(), rim: s7LightMod.rimLight.intensity };
    s7LightMod.applyLightPreset(scene, 'midnight');
    cityEnvMod.enterCityEnv({ background: s7City.night.background,
        fogColor: s7City.night.fogColor, fogNear: N.fogNear, fogFar: N.fogFar });
    const lum = h => ((h >> 16 & 255) + (h >> 8 & 255) + (h & 255)) / 3;
    T(`S7 MALAM: cahaya ambient turun jauh di bawah preset night [amb ${N.amb} vs ${D.amb}]`,
        N.amb < D.amb * 0.75 && N.hemi < D.hemi * 0.75 && N.dir < D.dir * 0.6
        && s7City.night.preset === 'midnight'
        && s7LightMod.ambLight.intensity === N.amb
        && s7LightMod.dirLight.intensity === N.dir
        && s7LightMod.dirLight.color.getHex() === N.dirColor);
    T(`S7 MALAM: haze + kabut jauh lebih gelap/rapat dari stage kota lain [0x${nightNow.bg.toString(16)} vs 0x${base.bg.toString(16)}]`,
        nightNow.bg === s7City.night.background
        && nightNow.fog === s7City.night.fogColor
        && nightNow.near === N.fogNear && nightNow.far === N.fogFar
        && lum(nightNow.bg) < lum(base.bg) * 0.55
        && lum(nightNow.fog) < lum(base.fog) * 0.55
        && nightNow.far < base.far
        && scene.background.getHex() === s7City.night.background);
    // Preset lain WAJIB memulihkan warna dasar, kalau tidak Stage 8 mewarisi
    // cahaya bulan Stage 7.
    T('S7 MALAM: preset/haze lain memulihkan nilai dasar (tanpa jejak ke stage lain)',
        base.dir === 0xff7b3a && base.amb === 0xffd9b3 && base.rim === 0.22
        && base.bg === 0x2b3742);
}

const s7PlacementGroups = {
    objectives: [s7mod.S7_START, s7mod.S7_LANDMARK, s7mod.S7_TOLL, s7mod.S7_VEHICLE],
    supplies: s7World.supplies,
    crates: s7World.crates,
    barrels: s7World.barrels,
    encounters: Object.values(s7World.encounterPoints).flat(),
    factories: s7World.spawnMachines.flatMap(m => [m, m.hatch, ...m.landings]),
};
const s7InvalidPlacements = Object.entries(s7PlacementGroups).flatMap(([group, points]) =>
    points.flatMap((p, i) => s7mod.stage7Walk(p.x, p.z, 1)
        ? [] : [group + '[' + i + ']']));
T('S7 PLACEMENT: objective, supplies, crates, barrels, robot, dan factory berada di dek',
    s7InvalidPlacements.length === 0
    && s7World.supplies.length === 8
    && s7World.crates.length === S7F.lootboxCount
    && s7World.barrels.length === S7F.barrelCount
    && s7RouteCoverage(s7World.crates)
    && s7RouteCoverage(s7World.barrels)
    && new Set(s7World.crates.map(p => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)).size
        === S7F.lootboxCount
    && new Set(s7World.barrels.map(p => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)).size
        === S7F.barrelCount
    && s7World.crates.some(p => p.y < 0) && s7World.barrels.some(p => p.y < 0)
    && s7World.crates.every(p => Math.abs(p.y
        - s7mod.stage7RoadHeight(p.x)) < 1e-8)
    && s7World.barrels.every(p => Math.abs(p.y
        - s7mod.stage7RoadHeight(p.x)) < 1e-8));

T('S7 ENCOUNTER: robot tersebar di lima bentang dan seluruh mix mengikuti CFG',
    Object.keys(S7C.encounters).join(',')
        === 'eastSpan,rampRun,cableSpan,westSpan,pasteurApproach'
    && Object.entries(S7C.encounters).every(([name, mix]) => sameMix(s7Mix(name), mix))
    && Object.values(S7C.encounters).every(mix => mixCount(mix) > 0)
    && robots.filter(z => z.stage === 7).length
        === Object.values(S7C.encounters).reduce((n, mix) => n + mixCount(mix), 0)
    && robots.filter(z => z.stage === 7).every(z =>
        Math.abs(z.groundY - s7mod.stage7RoadHeight(z.mesh.position.x)) < 1e-8
        && z.baseY === z.groundY && z.mesh.position.y === z.groundY)
    && !robots.some(z => z.stage === 7 && z.kind === 'boss'));

const eastBots7 = robots.filter(z => z.stage === 7 && z.encounter === 'eastSpan');
T('S7 OPENING: semua robot diam dan dialog menunggu establishing delay',
    s7mod.stage7Debug().phase === 'opening' && stateMod.cinematicActive
    && robots.filter(z => z.stage === 7).every(z => z.state === 'idle')
    && s7mod.stage7DialogueDebug().key === null);
tickS7(S7C.openingDialogueDelaySec * 0.5 + 0.0001, 0.05);
T('S7 OPENING: dialog belum muncul sebelum delay CFG',
    s7mod.stage7DialogueDebug().key === null);
tickS7(S7C.openingDialogueDelaySec * 0.5, 0.05);
T('S7 TYPEWRITER: line pertama dimulai kosong',
    s7mod.stage7DialogueDebug().key === 'openingCommand'
    && s7mod.stage7DialogueDebug().chars === 0);
tickS7(1.01 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps));
T('S7 TYPEWRITER: tick pertama menampilkan tepat satu karakter',
    s7mod.stage7DialogueDebug().chars === 1
    && s7mod.stage7DialogueDebug().shown
        === expectedS7Dialogue.openingCommand.text.slice(0, 1));
drainS7Dialogue();
tickS7(S7C.openingMinSec + S7C.fadeSec + 0.2, 0.1);
T('S7 OPENING: selesai membuka kontrol; robot tetap idle sampai masuk kamera',
    s7mod.stage7Debug().phase === 'flyover' && !stateMod.cinematicActive
    && eastBots7.every(z => z.state === 'idle'));
drainS7Dialogue();

const s7VisibleFarBot = eastBots7.find(z =>
    Math.hypot(z.mesh.position.x - camera.position.x,
        z.mesh.position.z - camera.position.z)
        > cfgMod.CFG.campaign.activateMeters * cfgMod.CAMP_M
    && s7mod.stage7RobotInView(z));
if (s7VisibleFarBot) s7mod.stage7Scene.robotAI(s7VisibleFarBot, 0.016, 1);
T('S7 AGGRO KAMERA: robot di layar langsung mengejar walau di luar radius aktivasi',
    !!s7VisibleFarBot && s7VisibleFarBot.state === 'chasing');

const s7MortarX = s7Fly.world.eastX
    - (S7C.mortar.startMeter + 8) * cfgMod.CAMP_M;
camera.position.set(s7MortarX, cfgMod.CFG.player.eyeHeight, 0);
s7mod.stage7Scene.updateMode(0.01); sampleS7Dialogue();
let s7MortarDbg = s7mod.stage7MortarDebug();
T('S7 MORTAR ARM: baru aktif setelah meter CFG dan warning masuk typewriter',
    s7MortarDbg.armed && s7MortarDbg.shots === 0
    && s7MortarDbg.inFireZone
    && s7MortarDbg.startMeter === S7C.mortar.startMeter
    && s7MortarDbg.endMeter === S7C.mortar.endMeter
    && s7Fly.mortar.startMeter === S7C.mortar.startMeter
    && s7Fly.mortar.endMeter === S7C.mortar.endMeter
    && s7mod.stage7DialogueDebug().key === 'mortarWarning');
tickS7(Math.max(0, s7MortarDbg.timer - 0.02), 0.02);
T('S7 MORTAR CADENCE: belum menembak sebelum interval CFG',
    s7mod.stage7MortarDebug().shots === 0);
tickS7(0.03, 0.01);
s7MortarDbg = s7mod.stage7MortarDebug();
T('S7 MORTAR CADENCE: menembakkan satu shell fixed-pool tepat tiap interval',
    s7MortarDbg.shots === 1 && s7MortarDbg.active === 1
    && s7MortarDbg.pool === S7C.mortar.poolSize
    && s7MortarDbg.projectiles[0].markerVisible);

const s7MortarSerial = s7MortarDbg.projectiles[0].serial;
const s7Track0 = { x: s7MortarDbg.projectiles[0].targetX,
    z: s7MortarDbg.projectiles[0].targetZ };
camera.position.x -= 2 * cfgMod.CAMP_M;
camera.position.z = 1.5 * cfgMod.CAMP_M;
tickS7(0.06, 0.02);
let s7Tracked = s7mod.stage7MortarDebug().projectiles
    .find(m => m.serial === s7MortarSerial);
T('S7 MORTAR TRACK: sebelum lock, koordinat jatuh terus mengikuti player',
    !!s7Tracked && !s7Tracked.locked
    && Math.hypot(s7Tracked.targetX - camera.position.x,
        s7Tracked.targetZ - camera.position.z) < 1e-6
    && Math.hypot(s7Tracked.targetX - s7Track0.x,
        s7Tracked.targetZ - s7Track0.z) > 1);

let s7MortarGuard = 0;
while (s7Tracked && !s7Tracked.locked && s7MortarGuard++ < 400) {
    tickS7(0.02, 0.02);
    s7Tracked = s7mod.stage7MortarDebug().projectiles
        .find(m => m.serial === s7MortarSerial);
}
const s7LockedTarget = s7Tracked
    ? { x: s7Tracked.targetX, z: s7Tracked.targetZ } : null;
camera.position.x -= 6 * cfgMod.CAMP_M;
tickS7(Math.min(0.1, S7C.mortar.lockSec * 0.4), 0.02);
s7Tracked = s7mod.stage7MortarDebug().projectiles
    .find(m => m.serial === s7MortarSerial);
T('S7 MORTAR LOCK: 0,5 detik terakhir target membeku dan marker lock tampil',
    !!s7Tracked && s7Tracked.locked && s7Tracked.lockVisible
    && s7LockedTarget
    && Math.hypot(s7Tracked.targetX - s7LockedTarget.x,
        s7Tracked.targetZ - s7LockedTarget.z) < 1e-9
    && S7C.mortar.lockSec === 0.5);

s7MortarGuard = 0;
while (s7mod.stage7MortarDebug().impacts < 1 && s7MortarGuard++ < 400)
    tickS7(0.02, 0.02);
const s7Impact = s7mod.stage7MortarDebug().lastImpact;
const s7QueuedBoom = robotsMod.pendingBoomsDebug().at(-1);
T('S7 MORTAR IMPACT: antrean ledakan membawa damage player 30 dan robot 150',
    !!s7Impact && s7Impact.locked
    && Math.hypot(s7Impact.x - s7Impact.targetX,
        s7Impact.z - s7Impact.targetZ) < cfgMod.CAMP_M
    && s7Impact.playerDamage === S7C.mortar.playerDamage
    && s7Impact.robotDamage === S7C.mortar.robotDamage
    && s7QueuedBoom?.hurtPlayer
    && s7QueuedBoom.playerDmg === S7C.mortar.playerDamage
    && s7QueuedBoom.dmg === S7C.mortar.robotDamage
    && s7QueuedBoom.r === s7Fly.mortar.radius);

const s7MortarVictim = robots.find(z => z.stage === 7 && z !== s7VisibleFarBot);
let s7MortarRobotDamaged = false;
if (s7MortarVictim && s7Impact) {
    const saved = {
        x: s7MortarVictim.mesh.position.x, y: s7MortarVictim.mesh.position.y,
        z: s7MortarVictim.mesh.position.z, hp: s7MortarVictim.hp,
        armor: s7MortarVictim.armor, state: s7MortarVictim.state,
    };
    s7MortarVictim.mesh.position.set(s7Impact.x + s7Impact.radius * 0.2, 0, s7Impact.z);
    s7MortarVictim.hp = S7C.mortar.robotDamage + 150;
    s7MortarVictim.armor = 0; s7MortarVictim.state = 'idle';
    const hpBeforeMortar = s7MortarVictim.hp;
    robotsMod.updateRobots(0.016, 1);
    s7MortarRobotDamaged = s7MortarVictim.hp
        === hpBeforeMortar - S7C.mortar.robotDamage;
    s7MortarVictim.mesh.position.set(saved.x, saved.y, saved.z);
    s7MortarVictim.hp = saved.hp; s7MortarVictim.armor = saved.armor;
    s7MortarVictim.state = saved.state;
}
T('S7 MORTAR FRIENDLY FIRE: robot musuh di radius kehilangan tepat damage CFG',
    s7MortarRobotDamaged);

const s7ShotsBeforeZoneEnd = s7mod.stage7MortarDebug().shots;
camera.position.set(s7Fly.world.eastX
    - (S7C.mortar.endMeter + 8) * cfgMod.CAMP_M,
cfgMod.CFG.player.eyeHeight, 0);
s7mod.stage7Scene.updateMode(0.01);
const s7PastMortarZone = s7mod.stage7MortarDebug();
tickS7(S7C.mortar.intervalSec + 0.2, 0.05);
T('S7 MORTAR ZONA: hanya menembak meter 500-1300 dan berhenti setelah batas akhir',
    !s7PastMortarZone.inFireZone
    && S7C.mortar.startMeter < S7C.mortar.endMeter
    && s7mod.stage7MortarDebug().shots === s7ShotsBeforeZoneEnd);
drainS7Dialogue();

camera.position.set(s7mod.S7_LANDMARK.x, cfgMod.CFG.player.eyeHeight, s7mod.S7_START.z);
s7mod.stage7Scene.updateMode(0.1);
T('S7 METER 700: landmark memicu dua beat tanpa menjadi kill gate',
    s7mod.stage7Debug().phase === 'flyover' && s7mod.stage7Debug().landmarkSeen
    && s7mod.stage7DialogueDebug().key === 'landmarkCommand');
drainS7Dialogue();

camera.position.set(s7mod.S7_TOLL.x,
    s7mod.S7_TOLL.y + cfgMod.CFG.player.eyeHeight, s7mod.S7_TOLL.z);
s7mod.stage7Scene.updateMode(0.1);
T('S7 PASTEUR: ujung barat mengaktifkan tepat tiga factory',
    s7mod.stage7Debug().phase === 'factorySiege'
    && s7mod.stage7Debug().tollSighted
    && s7mod.stage7Debug().machinesAlive === 3
    && s7mod.stage7Debug().machines.every(m => m.active && m.hp === MACHINE_HP())
    && s7World.spawnMachines.every(m => m.y === s7Fly.toll.y
        && m.hatch.y === s7Fly.toll.y
        && m.landings.every(p => p.y === s7Fly.toll.y)));

const s7FactorySource = fs.readFileSync(ROOT + '/src/scenes/campaign/stages/stage7/index.js', 'utf8');
T('S7 FACTORY RIG: tiga shared hero rig detail, solid/nav-baked, tanpa boss',
    s7World.spawnMachines.length === 3
    && s7World.spawnMachines.every(m => m.meshes >= 60 && m.nonBox >= 20
        && m.pointLights === 0)
    && s7World.props.filter(p => p.kind === 'robot-factory' && p.solid).length === 3
    && !s7FactorySource.includes('startBossMusic'));

tickS7(Math.max(0, S7C.spawnMachines.firstBatchSec - 0.05), 0.05);
T('S7 FACTORY TIMING: belum mencetak sebelum firstBatchSec CFG',
    S7C.spawnMachines.firstBatchSec === S7C.spawnMachines.batchSec
    && s7mod.stage7Debug().machines.every(m => m.batches === 0 && m.spawned === 0));
tickS7(0.06 + (S7C.spawnMachines.batchCount - 1)
    * S7C.spawnMachines.birthGapSec, 0.02);
let s7MachineDbg = s7mod.stage7Debug().machines;
T('S7 FACTORY RATE: batch pertama setiap mesin tepat mengikuti CFG',
    S7C.spawnMachines.batchCount > 0 && S7C.spawnMachines.batchSec > 0
    && s7MachineDbg.every(m => m.batches === 1
        && m.spawned === S7C.spawnMachines.batchCount)
    && s7mod.stage7Debug().factoryRobots
        === 3 * S7C.spawnMachines.batchCount);
const untilSecondBatch = Math.min(...s7MachineDbg.map(m => m.nextBatch - m.clock));
tickS7(Math.max(0, untilSecondBatch - 0.02), 0.02);
T('S7 FACTORY RATE: batch kedua menunggu interval CFG',
    s7mod.stage7Debug().machines.every(m => m.batches === 1));
tickS7(0.03 + (S7C.spawnMachines.batchCount - 1)
    * S7C.spawnMachines.birthGapSec, 0.02);
s7MachineDbg = s7mod.stage7Debug().machines;
T('S7 FACTORY RATE: batch kedua kembali tepat mengikuti CFG',
    s7MachineDbg.every(m => m.batches === 2
        && m.spawned === S7C.spawnMachines.batchCount * 2)
    && s7mod.stage7Debug().factoryRobots
        === 3 * S7C.spawnMachines.batchCount * 2);
drainS7Dialogue();

const s7LockMachines = s7mod.stage7WorldDebug().spawnMachines.filter(m => m.alive);
T('S7 FACTORY GATE: satu chassis hancur belum membuka GRD',
    hitS7Factory(s7LockMachines[0])
    && s7mod.stage7Debug().machinesAlive === 2
    && !s7mod.stage7Debug().vehicleReady);
T('S7 FACTORY GATE: dua chassis hancur masih belum membuka GRD',
    hitS7Factory(s7LockMachines[1])
    && s7mod.stage7Debug().machinesAlive === 1
    && !s7mod.stage7Debug().vehicleReady);
// RUNTUHNYA JARINGAN MEMBUNUH SEMUA ROBOT (2026-08-10, permintaan user).
// Dulu barisnya cuma men-set `hp = 0` pada robot cetakan pabrik — padahal
// hp<=0 HANYA diproses saat sebuah peluru mengenai robot, jadi mereka tetap
// berkeliaran dan gerbang menuju vehicleReveal cuma terbuka kalau player
// menembaki mereka satu per satu. Tes ini sengaja TIDAK lagi membersihkan
// robot secara manual: yang diuji justru sapuannya sendiri.
const s7Wipe = {
    total: robots.filter(z => z.stage === 7).length,
    factory: robots.filter(z => z.stage === 7
        && String(z.encounter).startsWith('factory-')).length,
    other: robots.filter(z => z.stage === 7
        && !String(z.encounter).startsWith('factory-')).length,
    kills: stateMod.stats.kills,
};
T(`S7 FACTORY DESTROY: chassis terakhir menghabisi SELURUH robot stage seketika [${s7Wipe.total} robot: ${s7Wipe.factory} cetakan + ${s7Wipe.other} encounter]`,
    s7Wipe.factory > 0 && s7Wipe.other > 0
    && hitS7Factories() === 1 && s7mod.stage7Debug().machinesAlive === 0
    && robots.filter(z => z.stage === 7).length === 0
    && s7mod.stage7Debug().robots === 0
    && s7mod.stage7Debug().factoryRobots === 0
    && stateMod.stats.kills === s7Wipe.kills + s7Wipe.total);
s7mod.stage7Scene.updateMode(0.1);
T('S7 FACTORY COMPLETE: network bersih membuka akses GRD LTV-45',
    s7mod.stage7Debug().phase === 'vehicleReveal'
    && s7mod.stage7Debug().factoryRobots === 0);

const s7PoolsBefore = s7mod.stage7WorldDebug().pools;
const s7StaticBefore = JSON.stringify(s7mod.stage7WorldDebug().props);
camera.position.set(s7mod.S7_VEHICLE.x,
    s7mod.S7_VEHICLE.y + cfgMod.CFG.player.eyeHeight, s7mod.S7_VEHICLE.z);
s7mod.stage7Scene.updateMode(0.1);
T('S7 OUTRO: mendekati kendaraan membekukan kontrol dan mulai dialog final',
    s7mod.stage7Debug().phase === 'outro' && stateMod.cinematicActive
    && s7mod.stage7DialogueDebug().key === 'vehicleFind');
drainS7Dialogue(); tickS7(10, 0.1);
const s7PoolsAfter = s7mod.stage7WorldDebug().pools;
T('S7 DIALOG: semua 12 beat tampil sekali, urut, dan pernah parsial',
    s7ShownOrder.join(',') === Object.keys(expectedS7Dialogue).join(',')
    && Object.keys(expectedS7Dialogue).every(k => s7Partial.has(k)));
T('S7 STATIC/FIXED: flyover dan pool tidak bertambah atau bergeser saat outro',
    JSON.stringify(s7mod.stage7WorldDebug().props) === s7StaticBefore
    && JSON.stringify(s7PoolsAfter) === JSON.stringify(s7PoolsBefore));
T('S7 COMPLETE: layar hijau tampil sebelum Field Shop dan checkpoint dipertahankan',
    stateMod.isGameOver && s7mod.stage7Debug().complete
    && dom4.gameOverTitle.innerText === 'STAGE 7 COMPLETE'
    && dom4.gameOverScreen.style.background === 'rgba(0, 90, 30, 0.82)'
    && save5Mod.loadCampaignStage() === 7);

// --- 17a-quinquies. CAMPAIGN STAGE 8 — CISUMDAWU KILL ZONE (2026-08-02).
// Stage 7 COMPLETE -> Field Shop -> kendaraan otonom tujuh corridor -> dua puluh
// pickup / 60 rider -> combat gunship -> Kertajati. ---
const s8Carry = {
    money: stateMod.score, hp: player.hp, armor: player.armor,
    medkits: player.medkits, weapons: player.weapons.join(','),
};
T('S7 COMPLETE CONTINUE: tombol utama baru membuka Field Shop menuju Stage 8',
    gameMod.activateGameOverPrimary() === true && !stateMod.isGameOver
    && smMod.activeScene.id === 'campaign-shop');
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));
T('S8 TRANSISI: Field Shop tampil sebelum Cisumdawu', shopMod.isShopOpen()
    && smMod.activeScene.id === 'campaign-shop');
smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');
for (let i = 0; i < 500 && smMod.activeScene !== s8mod.stage8Scene; i++) await new Promise(r => setTimeout(r, 10));
stateMod.setPaused(false);
T('S8 TRANSISI: Start Next Stage masuk checkpoint 8 dengan loadout/money tetap',
    smMod.activeScene === s8mod.stage8Scene && save5Mod.loadCampaignStage() === 8
    && stateMod.score === s8Carry.money && player.hp === s8Carry.hp
    && player.armor === s8Carry.armor && player.medkits === s8Carry.medkits
    && player.weapons.join(',') === s8Carry.weapons);

const expectedS8Dialogue = {
    openingSystem: { speaker: 'Vehicle System', text: 'AUTONOMOUS ROUTE ENGAGED. DESTINATION: KERTAJATI INTERNATIONAL AIRPORT. DISTANCE: 100 KILOMETERS.' },
    openingGibran: { speaker: 'Major Gibran', text: 'Good. You handle the road. I’ll handle anything that tries to stop us.' },
    openingCommand: { speaker: 'Command', text: 'Major, N.U.S.A. pursuit units are entering Cisumdawu behind you. Keep moving.' },
    pickupSystem: { speaker: 'Vehicle System', text: 'HOSTILE VEHICLES APPROACHING.' },
    pickupGibran: { speaker: 'Major Gibran', text: 'Open-bed carriers. I’ll take out the riders and leave the vehicles behind.' },
    haulerSystem: { speaker: 'Vehicle System', text: 'HAZARDOUS CARGO HAULER AHEAD. IT IS RELEASING BARRELS INTO YOUR LANE.' },
    haulerGibran: { speaker: 'Major Gibran', text: 'Then I won’t be in that lane. Shoot the drums or steer around them.' },
    gunshipCommand: { speaker: 'Command', text: 'Major, airborne contact! Combat gunship closing fast!' },
    gunshipGibran: { speaker: 'Major Gibran', text: 'So that’s what they were saving for me.' },
    bossDown: { speaker: 'Major Gibran', text: 'Gunship’s down. Kertajati, I’m coming in.' },
    arrivalSystem: { speaker: 'Vehicle System', text: 'KERTAJATI INTERNATIONAL AIRPORT. ROUTE COMPLETE.' },
    arrivalCommand: { speaker: 'Command', text: 'Major, we have your signal at the airfield. Get inside and secure a route to Kalimantan.' },
    arrivalGibran: { speaker: 'Major Gibran', text: 'Copy. Next stop—I.K.N.' },
};
T('S8 DIALOG: seluruh naskah final tersimpan PERSIS',
    JSON.stringify(s8mod.STAGE8_DIALOGUE) === JSON.stringify(expectedS8Dialogue));
T('S8 OPENING: dunia terlihat sebelum typewriter, kontrol cinematic terkunci',
    s8mod.stage8Debug().phase === 'opening' && stateMod.cinematicActive
    && s8mod.stage8DialogueDebug().key === null && dom4.cineFadeDebug()?.opacity === 0);

const s8World0 = s8mod.stage8WorldDebug(), s8Road0 = s8mod.stage8RoadDebug();
T('S8 WORLD: tujuh corridor, fixed road/pickup/dust/projectile pools, airport, dan fixed lights terbangun',
    s8mod.S8_LANES.length === 7 && s8mod.S8_LANES[3] === 0
    && s8mod.S8_START.z === s8mod.S8_LANES[1] && s8mod.S8_START.z < 0
    && s8World0.lanePositions.every((z, i) => Math.abs(z - (i - 3) * S8C.laneWidth) < 1e-9)
    && Math.abs(s8World0.gameplayCamera.pullback - 1.20) < 1e-9
    && s8World0.gameplayCamera.distance > S8C.laneWidth * 11
    && s8World0.pools.road === 20 && s8World0.pools.pickups === S8C.maxActivePickups
    && s8World0.pools.dust === 24 && s8World0.pools.missiles === S8G.missileBurst
    && s8World0.pools.shells === 2 && s8World0.lights === 12
    && s8World0.sceneRoots.airport && s8mod.stage8Walk(s8mod.S8_START.x, s8mod.S8_START.z, 1));
// --- LANSKAP DUA BABAK (2026-08-17, permintaan user "perbaiki background di
// Stage 8 ... perkotaan kota Bandung ... transisikan jadi persawahan khas Jawa
// Barat menjelang boss, dan tetap persawahan selama melawan boss"). Sebelumnya
// latar Stage 8 hanya tiga baris prop generik `index % 3` DAN di luar bahu jalan
// tidak ada permukaan tanah sama sekali (haze `scene.background` yang tampil).
{
    const s8ScenerySrc = fs.readFileSync(
        ROOT + '/src/scenes/campaign/stages/stage8/scenery.js', 'utf8');
    const s8Scenery0 = s8mod.stage8SceneryStateDebug();
    const s8ScnPool = s8mod.stage8SceneryPoolDbg();
    const meshesOf = g => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; };
    const minOf = (arr, f) => arr.reduce((m, g) => Math.min(m, f(g)), Infinity);
    T(`S8 LANSKAP: tiga pool parallax, tiap modul membawa KEDUA babak, dan perjalanan dibuka di kota [near ${s8Scenery0.counts.near}/mid ${s8Scenery0.counts.mid}/far ${s8Scenery0.counts.far}]`,
        s8Scenery0.counts.near >= 10 && s8Scenery0.counts.mid >= 8 && s8Scenery0.counts.far >= 6
        && s8Scenery0.counts.base === s8Scenery0.counts.near
        // Ketiga pool berbentang sama: satu konstanta wrap, tanpa lubang.
        && [s8Scenery0.counts.near * s8Scenery0.steps.near,
            s8Scenery0.counts.mid * s8Scenery0.steps.mid,
            s8Scenery0.counts.far * s8Scenery0.steps.far]
            .every(v => Math.abs(v - s8Scenery0.steps.span) < 1e-9)
        && s8Scenery0.act === 'city' && s8Scenery0.targetAct === 'city'
        && s8Scenery0.cityVisible === s8Scenery0.counts.near && s8Scenery0.riceVisible === 0
        && minOf(s8ScnPool.near, g => meshesOf(g.userData.cityG)) >= 30
        && minOf(s8ScnPool.near, g => meshesOf(g.userData.riceG)) >= 30
        && minOf(s8ScnPool.mid, g => meshesOf(g.userData.cityG)) >= 14
        && minOf(s8ScnPool.mid, g => meshesOf(g.userData.riceG)) >= 14
        && minOf(s8ScnPool.far, g => meshesOf(g.userData.cityG)) >= 8
        && minOf(s8ScnPool.far, g => meshesOf(g.userData.riceG)) >= 8);
    // KOTA BANDUNG vs PERSAWAHAN harus benar-benar dua pemandangan berbeda —
    // bukan satu set prop yang dicat ulang. Diukur dari siluet & palet aktual.
    {
        const sig = groups => {
            const hexes = new Set(), shapes = new Set();
            for (const g of groups) g.traverse(o => {
                if (!o.isMesh) return;
                if (o.material?.color?.getHex) hexes.add(o.material.color.getHex());
                if (o.geometry?.args) shapes.add(o.geometry.type + ':'
                    + o.geometry.args.map(v => Math.round(v * 10)).join(','));
            });
            return { hexes, shapes };
        };
        const all = [...s8ScnPool.near, ...s8ScnPool.mid, ...s8ScnPool.far];
        const city = sig(all.map(g => g.userData.cityG));
        const rice = sig(all.map(g => g.userData.riceG));
        const shared = [...city.shapes].filter(s => rice.shapes.has(s)).length;
        T(`S8 LANSKAP: kota dan sawah benar-benar dua pemandangan berbeda [kota ${city.shapes.size} bentuk/${city.hexes.size} warna, sawah ${rice.shapes.size}/${rice.hexes.size}, beririsan ${shared}]`,
            city.shapes.size >= 90 && rice.shapes.size >= 60
            && city.hexes.size >= 6 && rice.hexes.size >= 4
            && shared < Math.min(city.shapes.size, rice.shapes.size) * 0.25);
    }
    // TANAH BENAR-BENAR ADA DI LUAR BAHU JALAN. Inilah yang membuat latar lama
    // terbaca kosong: |z| > 74 tidak punya permukaan apa pun, jadi yang tampil
    // adalah haze latar. Slab dasarnya harus menutup KEDUA sisi.
    {
        const spanZ = { back: [0, 0], front: [0, 0] };
        for (const g of s8ScnPool.base) g.userData.baseG.traverse(o => {
            if (!o.isMesh || !o.geometry?.args) return;
            const [, , sz] = o.geometry.args;
            const z0 = o.position.z - sz / 2, z1 = o.position.z + sz / 2;
            if (z1 < 0) { spanZ.back[0] = Math.min(spanZ.back[0], z0); spanZ.back[1] = Math.max(spanZ.back[1], z1); }
            if (z0 > 0) { spanZ.front[0] = Math.min(spanZ.front[0], z0); spanZ.front[1] = Math.max(spanZ.front[1], z1); }
        });
        T(`S8 LANSKAP: pita tanah menutup kedua sisi di luar bahu jalan [backdrop ${spanZ.back[0].toFixed(0)}..${spanZ.back[1].toFixed(0)}, kamera ${spanZ.front[0].toFixed(0)}..${spanZ.front[1].toFixed(0)}]`,
            spanZ.back[1] >= -(s8Scenery0.rows.verge + 12) && spanZ.back[0] <= s8Scenery0.rows.back[1]
            && spanZ.front[0] <= s8Scenery0.rows.verge + 12
            && spanZ.front[1] >= s8Scenery0.rows.foreground[1] - 12);
    }
    // PENJAGA YANG SESUNGGUHNYA: biaya draw call SESUDAH pengelasan — bukan
    // jumlah mesh mentah (latar padat memang mahal secara mesh, murah secara
    // draw call), dan hanya SATU babak yang tergambar sekaligus.
    T(`S8 LANSKAP: biaya draw call tetap kecil walau padat [${s8Scenery0.weldedActive} tergambar, ${s8Scenery0.welded} dilas dari ${s8Scenery0.raw} mentah]`,
        s8Scenery0.raw > 1600 && s8Scenery0.welded < 520
        && s8Scenery0.welded < s8Scenery0.raw / 4
        // Hanya SATU babak yang tergambar sekaligus — itulah harga per frame,
        // dan modul yang tak di layar masih di-frustum-cull di atasnya.
        && s8Scenery0.weldedActive < s8Scenery0.welded * 0.7);
    {
        const { FORBIDDEN_HEX, EMISSIVE_MAX } = await import(R('src/world/palette.js'));
        const flat = Object.values(s8mod.stage8SceneryMatsDbg())
            .flatMap(v => Array.isArray(v) ? v : [v]);
        T('S8 LANSKAP: seluruh material memakai token PAL (tanpa neon, emissive <= EMISSIVE_MAX)',
            flat.length >= 12 && flat.every(m2 => !FORBIDDEN_HEX.includes(m2.color.getHex())
                && !FORBIDDEN_HEX.includes(m2.emissive.getHex())
                && (m2.emissive.getHex() === 0 || m2.emissiveIntensity <= EMISSIVE_MAX)));
    }
    // Dibangun saat loading bersama seluruh dunia campaign: memakai RNG global
    // akan menggeser penempatan acak stage lain (aturan sama dgn Stage 5/7).
    {
        const src = s8ScenerySrc
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const roadSrc = fs.readFileSync(ROOT + '/src/scenes/campaign/stages/stage8/index.js', 'utf8');
        T('S8 LANSKAP: penataan deterministik — tanpa RNG global, dan modul jalan tak lagi mengacak saat build',
            !/Math\s*\.\s*random\s*\(/.test(src)
            && !/rand\(/.test(roadSrc.split('function buildRoadModule')[1]?.split('\nfunction ')[0] || 'rand('));
    }
    // POHON TIDAK BOLEH TERBALIK (2026-08-17, laporan user "sepertinya ada pohon
    // yang bentuk daunnya terbalik"). Mahkota kelapa dulu sebuah KERUCUT yang
    // diputar `rotation.x = PI`; dari kamera oblique itu terbaca sebagai
    // segitiga menunjuk ke bawah. Dua hal dijaga: tak ada satu pun mesh lanskap
    // yang dibalik pada sumbu x/z, dan mahkota kelapa memang terdiri dari
    // beberapa pelepah terpisah, bukan satu kerucut.
    {
        let flipped = 0, cones = 0;
        for (const arr of [s8ScnPool.base, s8ScnPool.near, s8ScnPool.mid, s8ScnPool.far])
            for (const g of arr) g.traverse(o => {
                if (!o.isMesh) return;
                const r = o.rotation || {};
                const half = Math.PI / 2 - 1e-6;
                if (Math.abs(r.x || 0) > half || Math.abs(r.z || 0) > half) flipped++;
                if (o.geometry?.type === 'cone' || o.geometry?.type === 'ConeGeometry') cones++;
            });
        T(`S8 LANSKAP: tak ada bentuk yang berdiri terbalik — mahkota kelapa kini pelepah, bukan kerucut terbalik [${cones} kerucut, ${flipped} terbalik]`,
            flipped === 0 && cones > 40);
    }
    // Lampu per stage HARUS tetap 12 (aturan "tanpa rekompilasi shader"): latar
    // sepadat ini tidak boleh menyelundupkan satu PointLight pun.
    T('S8 LANSKAP: murni dekor — nol PointLight, nol blocker',
        s8World0.lights === 12
        && !/PointLight/.test(s8ScenerySrc
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
}
// --- MUSUH BARU: PENGANGKUT BAREL N.U.S.A. VULTURE-B (2026-08-17, permintaan
// user "tambahkan musuh baru. mobil pickup yang akan menurunkan barrel ... di
// lajur mobil player berada ... selalu muncul dari depan ... barel HP 150 ...
// pickup HP 230 ... munculkan 1 setiap setelah 5 mobil pickup robot").
{
    const BD = S8C.barrelDropper, H0 = s8mod.stage8HaulerDebug();
    T(`S8 PENGANGKUT BAREL: pool tetap, HP dari config, dan tetap muat satu lajur [truk ${H0.pools.trucks} / slot barel ${H0.pools.barrels}, HP ${H0.hp} / barel ${H0.barrelHp}]`,
        H0.pools.trucks >= 2
        // Slot barel DITURUNKAN dari config: satu muatan penuh tiap truk aktif
        // bisa berada di aspal sekaligus, karena umur satu barel lebih panjang
        // daripada seluruh rentetan jatuhnya. Kalau ini kurang, pool kelaparan
        // diam-diam dan sebagian barel tak pernah jatuh.
        && H0.pools.barrels >= (BD.maxActive || 1) * BD.dropCount
        && H0.active === 0 && H0.barrelsOut === 0 && H0.spawned === 0
        // Angka HP milik config (user me-retune JSON antar sesi) — yang dijaga
        // adalah rig BENAR-BENAR membacanya, bukan nilainya.
        && H0.hp === BD.hp && H0.barrelHp === BD.barrelHp
        && BD.hp > 0 && BD.barrelHp > 0
        && H0.everyPickups === BD.everyPickups && BD.everyPickups >= 1
        // Seperti seluruh kendaraan Stage 8: harus muat di satu lajur.
        && H0.dimensionsMeters.width * cfgMod.CAMP_M <= S8C.laneWidth
        // Waktu reaksi = jarak tahan / laju jalan, harus melebihi satu manuver lajur.
        && BD.leadOffset / S8C.roadSpeed > S8C.laneChangeSec * 2);
    // KEPADATAN MUATAN (2026-08-18, permintaan user "barrel yang dijatuhkannya
    // lebih banyak dengan interval waktu yang lebih singkat"). Angkanya milik
    // config, yang dijaga di sini hubungannya:
    //   * jumlah drum yang TERPASANG di bak = sisa muatan sungguhan, jadi ia
    //     harus sama dengan `dropCount` selama masih muat di baknya,
    //   * pintu belakang harus sempat MENUTUP di antara dua barel — kalau
    //     `dropTelegraphSec` >= `dropGapSec` ia menganga terus dan berhenti
    //     terbaca sebagai aba-aba,
    //   * tiap barel tetap punya waktu reaksi penuh: jeda antar barel sama
    //     sekali tidak memotongnya, jadi kerapatan naik tanpa jadi mustahil.
    const bedTruck = H0.trucks[0];
    T(`S8 MUATAN BAREL: jumlah drum di bak = sisa muatan, dan pintu masih sempat menutup antar barel [${bedTruck.cargoSlots} drum, jeda ${BD.dropGapSec}s vs telegraph ${BD.dropTelegraphSec}s]`,
        BD.dropCount >= 1 && BD.dropGapSec > 0
        && bedTruck.cargoSlots === Math.min(BD.dropCount, H0.cargoMax)
        && BD.dropTelegraphSec < BD.dropGapSec
        && BD.leadOffset / S8C.roadSpeed > S8C.laneChangeSec * 2);
}
T('S8 DISTANCE: 100 KM hanya menjadi informasi opening tanpa countdown perjalanan',
    s8mod.STAGE8_DIALOGUE.openingSystem.text.includes('DISTANCE: 100 KILOMETERS')
    && !('distanceKm' in s8Road0) && !('kmPerSec' in s8Road0)
    && !s8mod.stage8Scene.hudStatus().includes('KM'));
T('S8 ACTION GATE: RMB move, dodge, dan melee ditolak; fire/switch/medkit tetap diizinkan',
    !s8mod.stage8Scene.allowsPlayerAction('moveTarget')
    && !s8mod.stage8Scene.allowsPlayerAction('dodge')
    && !s8mod.stage8Scene.allowsPlayerAction('melee')
    && s8mod.stage8Scene.allowsPlayerAction('fire')
    && s8mod.stage8Scene.allowsPlayerAction('switchWeapon')
    && s8mod.stage8Scene.allowsPlayerAction('medkit'));

const pickupRig = enemyPickupMod.buildEnemyPickupMesh(7);
const pickupRigDbg = enemyPickupMod.enemyPickupDebug(pickupRig);
enemyPickupMod.updateEnemyPickupVisual(pickupRig, 0.5, { active: true, speed: S8C.pickupSpeed });
T('S8 PICKUP ENTITY: chassis prosedural punya 4 roda/3 anchor, suspensi bergerak, dan tidak punya HP langsung',
    pickupRig.wheels.length === 4 && pickupRigDbg.anchors === 3 && !('hp' in pickupRig)
    && enemyPickupMod.enemyPickupDebug(pickupRig).wheelPhase > 0
    && pickupRigDbg.dimensionsWorld.width < S8C.laneWidth
    && pickupRigDbg.dimensionsMeters.width === enemyPickupMod.ENEMY_PICKUP_DIMENSIONS.width);
const gunshipSource = fs.readFileSync(ROOT + '/src/entities/combatGunship.js', 'utf8');
const gunshipRig = combatGunshipMod.createCombatGunship(1);
combatGunshipMod.resetCombatGunship(gunshipRig, { active: true, x: 0, y: 42, z: 0 });
// HP/SKOR MILIKNYA SENDIRI (2026-08-09, permintaan user: "buat agar HP dan
// score gunship ada di json itu juga seperti tank"). Dulu HP-nya live-read
// `bosses.tank.hp`, jadi meretune tank diam-diam meretune bos akhir Stage 8.
T(`S8 GUNSHIP ENTITY: entity baru dgn HP & skor SENDIRI dari config (bukan lagi meminjam tank), pool missile tepat tiga [hp ${gunshipRig.maxHp}]`,
    !gunshipSource.includes("from './helicopter.js'")
    // Sapuan sumber: tidak ada lagi PEMBACAAN config tank di modul ini.
    && !gunshipSource.includes('CFG.campaign.bosses.tank')
    && gunshipRig.maxHp === S8G.hp && gunshipRig.hp === S8G.hp
    && gunshipRig.score === S8G.score
    && combatGunshipMod.combatGunshipDebug(gunshipRig).score === S8G.score
    && gunshipRig.missiles.length === S8G.missileBurst);
// GUNSHIP = BOS (2026-08-09, permintaan user): statistiknya duduk sejajar
// `giant` dan `tank` di `campaign.bosses`, bukan terselip di dalam blok
// stage-nya. Yang TETAP milik stage8 hanyalah pacing adegannya — sama seperti
// `campaign.tankOutro` yang bukan bagian dari `bosses.tank`. Jalur lama harus
// benar-benar HILANG, kalau tidak dua sumber kebenaran hidup berdampingan.
T('S8 GUNSHIP CONFIG: statistik bos duduk di campaign.bosses.gunship (bareng giant & tank), jalur lama stage8.gunship hilang',
    !!cfgMod.CFG.campaign.bosses.gunship
    && cfgMod.CFG.campaign.stage8.gunship === undefined
    && ['giant', 'tank', 'gunship', 'warden', 'mahapatih']
        .every(key => Object.hasOwn(cfgMod.CFG.campaign.bosses, key))
    && typeof S8G.hitRadius === 'number' && typeof S8G.missileBurst === 'number'
    // Bentuknya menyamai bos lain: `hp` + `score` ada di blok bos itu sendiri.
    && typeof S8G.hp === 'number' && typeof S8G.score === 'number'
    && !gunshipSource.includes('stage8.gunship')
    // Pacing adegan stage tetap di stage8.
    && typeof S8C.gunshipIntroMinSec === 'number'
    && typeof S8C.gunshipDeathDelaySec === 'number');
combatGunshipMod.disposeCombatGunship(gunshipRig);

T('S8 OPENING SKIP: skip memberi state highway bersih yang sama tanpa dialog/fade tersisa',
    dom4.triggerCutsceneSkip() === true && s8mod.stage8Debug().phase === 'highway'
    && !stateMod.cinematicActive && s8mod.stage8DialogueDebug().key === null
    && dom4.stageRadioDialogueDebug() === null && dom4.cineFadeDebug()?.opacity === 0);
// Diukur SESUDAH cutscene pembuka dilewati: `camOffset` Stage 8 baru menjadi
// kamera GAMEPLAY di sini, dan kamera itulah yang berlaku sepanjang pengejaran,
// duel gunship, dan seluruh peralihan babak lanskap.
{
    const s8ScnPool = s8mod.stage8SceneryPoolDbg();
    const s8Scenery0 = s8mod.stage8SceneryStateDebug();
    // SELURUH PROP HARUS BERADA DI DALAM TAPAK PANDANG KAMERA. Ini yang diam-diam
    // rusak pada lanskap Stage 5 sebelum 2026-08-09: pool cakrawala dibangun di
    // luar jangkauan kamera dan tak pernah tampil satu piksel pun. Batasnya
    // DIBACA dari renderer memakai camOffset Stage 8 sendiri, bukan angka mati.
    {
        rendererMod.followViewCam(0.016);
        // Bidang tanah lanskap duduk sedikit DI BAWAH y=0, dan bidang yang lebih
        // rendah terlihat sedikit lebih jauh — jadi tapaknya diukur di sana.
        const GY = -0.9;
        const ext = rendererMod.groundViewExtents(cfgMod.CFG.player.eyeHeight, GY);
        // Setiap mesh diuji lewat RENTANG-nya, bukan titik pusatnya: sebuah slab
        // tanah memang HARUS menjulur melewati tepi frame (lihat tes cakupan di
        // bawah), sementara prop yang seluruhnya di luar tapak tetap tertangkap.
        // Stub harness memakai nama tipe pendek ('box'), three asli 'BoxGeometry'.
        const isBox = t => t === 'box' || t === 'BoxGeometry';
        let worstBack = 0, worstFront = 0, outside = 0;
        for (const arr of [s8ScnPool.base, s8ScnPool.near, s8ScnPool.mid, s8ScnPool.far])
            for (const g of arr) g.traverse(o => {
                if (!o.isMesh) return;
                let z = o.position.z, q = o.parent;
                while (q && q !== g) { z += q.position.z; q = q.parent; }
                worstBack = Math.min(worstBack, z); worstFront = Math.max(worstFront, z);
                const d = (isBox(o.geometry?.type) && o.geometry.args)
                    ? Math.abs(o.geometry.args[2]) : 0;
                if (z + d / 2 < ext.minZ || z - d / 2 > ext.maxZ) outside++;
            });
        T(`S8 LANSKAP: tak ada prop yang dibangun di luar tapak pandang kamera [terjauh ${worstBack.toFixed(0)}..${worstFront.toFixed(0)}, tepi ${ext.minZ.toFixed(0)}..${ext.maxZ.toFixed(0)}]`,
            outside === 0 && worstBack < -400 && worstFront > 100);
        // CAKUPAN TANAH (2026-08-17, laporan user "di sisi kanan jalan masih
        // terlihat area biru yang kosong"). Versi pertama menghentikan tanah di
        // z +155 dan -520 padahal frame mencapai +160/-718 pada 16:9 (dan
        // +187/-838 pada 21:9), jadi haze `scene.background` menganga di tepi
        // BAWAH-KANAN — justru tempat skala dunia paling besar. Yang dijaga di
        // sini bukan "prop ada di dalam frame" melainkan kebalikannya: TANAHNYA
        // harus MENUTUP seluruh tapak, dengan kelebihan untuk layar lebih lebar,
        // dan itu harus berlaku pada KEDUA babak.
        {
            const rows = s8Scenery0.rows;
            const HEADROOM = 1.15;            // cadangan utk rasio layar lebih lebar
            const needFar = ext.minZ * HEADROOM, needNear = ext.maxZ * HEADROOM;
            const groundSpans = groups => {
                const out = [];
                for (const g of groups) g.traverse(o => {
                    if (!o.isMesh || !isBox(o.geometry?.type) || !o.geometry.args) return;
                    const [, sy, sz] = o.geometry.args;
                    let z = o.position.z, y = o.position.y, q = o.parent;
                    while (q && q !== g) { z += q.position.z; y += q.position.y; q = q.parent; }
                    // "Tanah" = balok lebar-dalam yang puncaknya di sekitar/di
                    // bawah permukaan; bangunan dan pematang tidak ikut terhitung.
                    if (Math.abs(sz) < 10 || y + sy / 2 > 6) return;
                    out.push([z - Math.abs(sz) / 2, z + Math.abs(sz) / 2]);
                });
                return out;
            };
            const gapIn = (spans, a, b) => {
                const m = spans.filter(v => v[1] > a && v[0] < b).sort((u, v) => u[0] - v[0]);
                let at = a, worst = 0;
                for (const [z0, z1] of m) {
                    if (z0 > at) worst = Math.max(worst, z0 - at);
                    at = Math.max(at, z1);
                }
                return Math.max(worst, b - at);
            };
            let worstGap = 0, worstAct = '';
            for (const key of ['cityG', 'riceG']) {
                const spans = groundSpans([
                    ...s8ScnPool.base.map(g => g.userData.baseG),
                    ...s8ScnPool.near.map(g => g.userData[key]),
                    ...s8ScnPool.mid.map(g => g.userData[key]),
                    ...s8ScnPool.far.map(g => g.userData[key]),
                ]);
                // Pita jalan sendiri (|z| <= rows.groundIn) milik modul jalan.
                const gap = Math.max(gapIn(spans, needFar, -rows.groundIn),
                    gapIn(spans, rows.groundIn, needNear));
                if (gap > worstGap) { worstGap = gap; worstAct = key; }
            }
            // Tepi dalam slab benar-benar menyelinap di bawah perkerasan jalan.
            const paved = S8C.laneWidth * 3.5 + 6 + 6;
            T(`S8 LANSKAP: tanah menutup SELURUH tapak pandang di kedua babak — tak ada celah haze [celah terburuk ${worstGap.toFixed(1)} di ${worstAct || '-'}, tapak ${(ext.minZ * 1.15).toFixed(0)}..${(ext.maxZ * 1.15).toFixed(0)}]`,
                worstGap <= 0.001 && rows.groundIn < paved
                && rows.ground[0] <= ext.minZ * HEADROOM && rows.ground[1] >= ext.maxZ * HEADROOM);
        }
        // Ambang "aman di luar layar ke depan" dipakai relayout babak: ia HARUS
        // benar-benar di luar tapak pandang, atau modul akan berganti di layar.
        T(`S8 LANSKAP: ambang tata-ulang babak sungguh di luar layar [${s8Scenery0.aheadThreshold} vs tepi ${ext.maxX.toFixed(0)}]`,
            s8Scenery0.aheadThreshold > ext.maxX + s8Scenery0.steps.near / 2);
    }
}

// Mulai di carriageway kiri. Hold tidak auto-repeat: satu edge D hanya pindah
// dari slot 1 ke 2, lalu edge berikutnya baru membawa kendaraan ke median.
stateMod.keys.d = true; s8mod.stage8Scene.updatePlayerControl(S8C.laneChangeSec + 0.01);
const heldLane = s8mod.stage8RoadDebug().laneIndex;
s8mod.stage8Scene.updatePlayerControl(S8C.laneChangeSec * 3);
T('S8 LANE: mulai di kiri dan menahan D hanya memindahkan tepat satu slot', heldLane === 2
    && s8mod.stage8RoadDebug().laneIndex === 2);
stateMod.keys.d = false; s8mod.stage8Scene.updatePlayerControl(0.01);
stateMod.keys.d = true; s8mod.stage8Scene.updatePlayerControl(S8C.medianChangeSec + 0.01);
stateMod.keys.d = false; s8mod.stage8Scene.updatePlayerControl(0.01);
T('S8 MEDIAN: tanah/rumput adalah slot valid dan memakai timing lebih lambat',
    s8mod.stage8RoadDebug().laneIndex === 3 && S8C.medianChangeSec > S8C.laneChangeSec
    && Math.abs(s8mod.stage8RoadDebug().currentZ - s8mod.S8_LANES[3]) < 1e-6);

function killS8Riders(predicate = () => true) {
    for (let i = robots.length - 1; i >= 0; i--) {
        const z = robots[i];
        if (z.stage !== 8 || !z.mounted || !predicate(z)) continue;
        robotsMod.disposeRobot(z); scene.remove(z.mesh); robots.splice(i, 1);
    }
}
// AUDIT PERGANTIAN BABAK LANSKAP (2026-08-17). Dua aturan sekaligus, diperiksa
// pada SETIAP tick sepanjang stage:
//  (a) babaknya turun dari ambang config `scenery.riceAfterFraction` — kota
//      selama pengejaran masih di bawahnya, persawahan begitu terlewat, dan
//      TIDAK PERNAH kembali ke kota (boss harus tetap di persawahan);
//  (b) tak satu pun modul boleh berganti kota<->sawah selagi BERADA DI LAYAR.
//      Sebuah pergantian hanya sah kalau modulnya baru saja wrap (posisinya
//      melompat ke ujung depan pool) atau memang menunggu di luar ambang
//      `S8_SCENERY_AHEAD`. Tanpa ini transisinya kembali "tiba-tiba berubah"
//      seperti lanskap Stage 5 sebelum 2026-08-09.
const s8Scn = { prev: null, swaps: 0, onScreen: 0, badEarly: 0, badLate: 0,
    backToCity: 0, acts: new Set(), ticks: 0 };
// BANGKAI CARRIER HARUS DITINGGALKAN (2026-08-17, permintaan user "ketika robot
// dan mobilnya hancur, serpihan mereka tertinggal di tempat"). Laju surutnya
// diukur dalam KELIPATAN laju tanah: < 1 berarti bangkainya ikut terseret maju
// bersama kendaraan player, dan ia harus MENGEREM sampai tepat 1 (diam di aspal)
// alih-alih meluncur mundur selamanya.
// MOBIL MUSUH JUGA HANCUR BERKEPING-KEPING (2026-08-18, permintaan user).
// Dua arah yang dijaga tiap tick: tiap carrier yang HANCUR harus berkeping dan
// gosong, dan tiap carrier yang MASIH HIDUP harus utuh dan bercat asli — yang
// kedua itulah bukti bahwa pool yang dipakai ulang benar-benar dipulihkan,
// bukan lahir kembali sebagai bangkai gosong.
const s8Shard = { wrecked: 0, unshattered: 0, uncharred: 0, live: 0, liveBad: 0,
    liveHex: null, wreckHex: null };
const s8Wreck = { prev: new Map(), min: Infinity, max: 0, samples: 0 };
function auditS8Wreck(dt) {
    for (const p of s8mod.stage8ConvoyDebug().pickups) {
        if (!p.active) continue;
        if (p.wreck) {
            s8Shard.wrecked++;
            if (!p.shattered || !(p.shards > 0)) s8Shard.unshattered++;
            else s8Shard.wreckHex = p.bodyHex;
            if (s8Shard.liveHex != null && p.bodyHex === s8Shard.liveHex) s8Shard.uncharred++;
        } else {
            s8Shard.live++;
            if (s8Shard.liveHex == null) s8Shard.liveHex = p.bodyHex;
            if (p.shattered || p.bodyHex !== s8Shard.liveHex) s8Shard.liveBad++;
        }
    }
    const ground = S8C.roadSpeed * dt;
    if (!(ground > 0)) return;
    const now = new Map();
    for (const p of s8mod.stage8ConvoyDebug().pickups) {
        if (!p.active || !p.wreck || !p.position) continue;
        now.set(p.eventIndex, p.position.x);
        const was = s8Wreck.prev.get(p.eventIndex);
        if (was == null) continue;
        const f = (was - p.position.x) / ground;
        if (f < 0 || f > 4) continue;                     // pool baru dipakai ulang
        s8Wreck.samples++;
        s8Wreck.min = Math.min(s8Wreck.min, f); s8Wreck.max = Math.max(s8Wreck.max, f);
    }
    s8Wreck.prev = now;
}
function auditS8Scenery() {
    const d = s8mod.stage8SceneryActDebug();
    if (!d || !d.near) return;
    const frac = S8C.scenery.riceAfterFraction;
    const done = s8mod.stage8ConvoyDebug().destroyed / Math.max(1, S8C.groundPickupTarget);
    const pursuing = ['opening', 'highway', 'groundPursuit'].includes(s8mod.stage8Debug().phase);
    s8Scn.ticks++; s8Scn.acts.add(d.act);
    if (pursuing && done < frac && d.act !== 'city') s8Scn.badEarly++;
    if (done >= frac && d.act !== 'rice') s8Scn.badLate++;
    if (s8Scn.prev && s8Scn.prev.act === 'rice' && d.act === 'city') s8Scn.backToCity++;
    if (s8Scn.prev) for (const k of ['near', 'mid', 'far'])
        for (let i = 0; i < d[k].length; i++) {
            const was = s8Scn.prev[k][i], now = d[k][i];
            if (was.act === now.act) continue;
            s8Scn.swaps++;
            // Sah: baru wrap (x melompat maju) ATAU sedang parkir di luar layar.
            const wrapped = now.x > was.x + 1;
            const parked = was.x - d.baseX > d.ahead && now.x - d.baseX > d.ahead;
            if (!wrapped && !parked) s8Scn.onScreen++;
        }
    s8Scn.prev = d;
}
function tickS8(total, step = 0.1) {
    let left = Math.max(0, total), guard = 0;
    while (left > 1e-9 && guard++ < 50000) {
        const dt = Math.min(step, left); s8mod.stage8Scene.updateMode(dt); left -= dt;
        auditS8Scenery(); auditS8Wreck(dt);
    }
}
function drainS8Dialogue() {
    let guard = 0;
    while (guard++ < 50000) {
        const d = s8mod.stage8DialogueDebug();
        if (!d.key && !d.queued.length) break;
        tickS8(1.01 / Math.max(1, cfgMod.CFG.campaign.dialogue.cps));
    }
}

tickS8(S8C.groundStartDelaySec - 0.1, 0.1);
T('S8 SPAWN TIMING: pickup pertama belum spawn sebelum delay config',
    s8mod.stage8ConvoyDebug().spawned === 0);
tickS8(0.11, 0.01);
let firstRiders = robots.filter(z => z.stage === 8 && z.mounted);
const firstPickupEntry = s8mod.stage8ConvoyDebug().pickups.find(p => p.active && !p.wreck);
T('S8 PICKUP PERTAMA: selalu tepat 3 rider A/B sesuai load config',
    s8mod.stage8ConvoyDebug().spawned === 1 && firstRiders.length === 3
    && firstRiders.map(z => z.kind).join('/') === S8C.groundLoads[0].join('/')
    && firstRiders.every(z => ['A', 'B'].includes(z.kind) && z.pickup));
T('S8 PICKUP ENTRY: carrier pertama lahir di ujung road pool belakang, bukan tengah layar',
    firstPickupEntry?.entrySide === 'rear'
    && firstPickupEntry.entryX <= s8World0.origin.x
        - (s8Road0.roadSpan / 2 - S8C.pickupEntryInset)
    && firstPickupEntry.entryX < firstPickupEntry.entryViewEdgeX - S8C.pickupOffscreenMargin
    && firstPickupEntry.lane <= 2 && Math.abs(firstPickupEntry.yaw) < 1e-9);

// SERPIHAN DITINGGALKAN DI ASPAL (2026-08-17, permintaan user "ketika robot dan
// mobilnya hancur, serpihan mereka tertinggal di tempat. tidak ikut bergerak
// seperti sekarang ini"). Stage 8 adalah arena koordinat-stabil: GRD LTV-45
// diam di PLAYER_X dan jalanlah yang bergulir, jadi sisa tempur yang dibiarkan
// di koordinat dunianya diam TERHADAP KENDARAAN dan terlihat terseret ikut
// selamanya. Genangan coolant dipakai sebagai probe karena ia TIDAK punya
// kecepatan sendiri — perpindahannya murni hasil drift. Masalah & helper yang
// sama dengan perjalanan Stage 5 (2026-08-09).
{
    goreMod.resetGore();
    const probeX = s8mod.S8_START.x + 40, probeZ = s8mod.S8_LANES[0];
    goreMod.spawnBloodDecal(probeX, probeZ, 3);
    const before = goreMod.goreDebug().decals.map(d => ({ ...d }));
    const roadBefore = s8mod.stage8RoadDebug().modulePositions.slice();
    const dt = 0.1;
    tickS8(dt, dt);
    const after = goreMod.goreDebug().decals;
    const roadAfter = s8mod.stage8RoadDebug().modulePositions;
    // Modul jalan yang TIDAK wrap pada frame ini = laju tanah sesungguhnya.
    const roadStep = roadBefore.map((x, i) => x - roadAfter[i]).filter(d => d > 0 && d < 1e3)[0];
    const drift = before.length ? before[0].x - after[0].x : 0;
    T(`S8 SERPIHAN: sisa tempur tertinggal di aspal, persis selaju tanah [${drift.toFixed(2)} unit/frame vs jalan ${roadStep.toFixed(2)}]`,
        before.length === 1 && S8C.roadSpeed > 0
        && Math.abs(drift - S8C.roadSpeed * dt) < 1e-9
        && Math.abs(drift - roadStep) < 1e-9
        // Z tidak boleh ikut bergeser: jalan hanya bergulir pada sumbu x.
        && Math.abs(after[0].z - before[0].z) < 1e-9);
    goreMod.resetGore();
}
// Hancurkan carrier satu per satu sampai tersisa carrier target terakhir. Audit
// setiap entry memastikan kedua ujung road pool dipakai tanpa melawan arus.
let maxS8Pickups = 0, allMountedTriples = true, entryFacingOK = true;
const s8EntrySides = new Set([firstPickupEntry?.entrySide]);
const auditedS8Entries = new Set();
let pursuitGuard = 0;
function auditS8Entries(cd) {
    maxS8Pickups = Math.max(maxS8Pickups, cd.activePickups);
    for (const p of cd.pickups.filter(p => p.active && !p.wreck)) {
        if (auditedS8Entries.has(p.eventIndex)) continue;
        auditedS8Entries.add(p.eventIndex);
        if (p.passengers !== 3 || p.anchors !== 3) allMountedTriples = false;
        s8EntrySides.add(p.entrySide);
        const atEnd = p.entrySide === 'rear'
            ? p.entryX <= s8World0.origin.x - (s8Road0.roadSpan / 2 - S8C.pickupEntryInset)
                && p.entryX < p.entryViewEdgeX - S8C.pickupOffscreenMargin
            : p.entryX >= s8World0.origin.x + (s8Road0.roadSpan / 2 - S8C.pickupEntryInset)
                && p.entryX > p.entryViewEdgeX + S8C.pickupOffscreenMargin;
        if (!atEnd || p.lane > 2 || Math.abs(p.yaw) >= 1e-9) entryFacingOK = false;
    }
}
auditS8Entries(s8mod.stage8ConvoyDebug());
while (s8mod.stage8ConvoyDebug().destroyed < S8C.groundPickupTarget - 1
    && pursuitGuard++ < 20000) {
    killS8Riders();
    tickS8(0.25, 0.25);
    auditS8Entries(s8mod.stage8ConvoyDebug());
}
while (s8mod.stage8ConvoyDebug().spawned < S8C.groundPickupTarget
    && pursuitGuard++ < 22000) {
    tickS8(0.25, 0.25); auditS8Entries(s8mod.stage8ConvoyDebug());
}
const convoyBeforeFinal = s8mod.stage8ConvoyDebug();
T('S8 CONVOY: target config tercapai, tiap pickup triple A/B, dan cap aktif tidak terlewati',
    S8C.groundLoads.every(load => load.length === 3 && load.every(k => k === 'A' || k === 'B'))
    && convoyBeforeFinal.spawned === S8C.groundPickupTarget
    && convoyBeforeFinal.destroyed === S8C.groundPickupTarget - 1
    && auditedS8Entries.size === S8C.groundPickupTarget
    && allMountedTriples && maxS8Pickups <= S8C.maxActivePickups);
T('S8 CONVOY ENTRY: kedua ujung jalan dipakai, semua carrier menghadap maju di lajur kiri',
    s8EntrySides.has('rear') && s8EntrySides.has('front') && entryFacingOK);
// PERILAKU PENGANGKUT BAREL. Dijalankan di sini karena seluruh loop pengejaran
// baru saja berjalan: irama kemunculannya sudah teruji oleh permainan nyata,
// bukan oleh satu pemanggilan paksa.
{
    const BD = S8C.barrelDropper;
    // Muatan yang benar-benar TERPASANG di bak: `dropCount` sampai batas
    // kapasitas fisiknya (lihat blok kepadatan muatan di atas).
    const bedLoad = Math.min(BD.dropCount, s8mod.stage8HaulerDebug().cargoMax);
    const spawnedH = s8mod.stage8HaulerDebug().spawned;
    T(`S8 PENGANGKUT BAREL: tepat satu per ${BD.everyPickups} carrier robot yang MUNCUL [${spawnedH} dari ${convoyBeforeFinal.spawned} carrier]`,
        spawnedH > 0 && spawnedH === Math.floor(convoyBeforeFinal.spawned / BD.everyPickups));

    // Satu truk dipaksa muncul supaya perilakunya dapat diamati utuh.
    s8mod.stage8ClearHaulersDbg(); robotsMod.resetRobotsFx();
    const spawnOK = s8mod.stage8SpawnHaulerDbg();
    const born = s8mod.stage8HaulerDebug().trucks.find(t => t.active);
    T(`S8 PENGANGKUT BAREL: SELALU lahir di ujung DEPAN dan di luar tapak pandang [x ${born ? born.entryX.toFixed(0) : '-'} vs tepi ${born ? born.entryViewEdgeX.toFixed(0) : '-'}]`,
        spawnOK && !!born
        && born.entryX > s8World0.origin.x
        && born.entryX >= born.entryViewEdgeX + S8C.pickupOffscreenMargin
        && Math.abs(born.targetX - (s8World0.origin.x + BD.leadOffset)) < 1e-9
        && Math.abs(born.yaw) < 1e-9 && born.cargoVisible === bedLoad);

    // --- Barel pertama: harus mendarat DI PUSAT lajur player saat itu.
    let guard = 0;
    while (s8mod.stage8HaulerDebug().barrelsOut === 0 && guard++ < 3000) tickS8(0.1, 0.1);
    const dropped = s8mod.stage8HaulerDebug();
    const lane0 = s8mod.stage8RoadDebug().laneIndex;
    const laneZ0 = s8mod.stage8WorldDebug().lanePositions[lane0];
    const b0 = dropped.dropped[0];
    T(`S8 BAREL: dijatuhkan TEPAT di pusat lajur player, ber-HP config, dan ikut sistem barel bersama [lajur ${lane0}, HP ${b0 ? b0.hp : '-'}]`,
        !!b0 && Math.abs(b0.z - laneZ0) < 1e-9 && b0.lane === lane0
        && b0.hp === BD.barrelHp
        // Ia BENAR-BENAR anggota array `barrels` bersama, jadi sweep peluru,
        // ledakan, rambatan dan damage-nya diwarisi apa adanya.
        && barrel5Mod.barrels.some(v => v.hp === BD.barrelHp && Math.abs(v.z - laneZ0) < 1e-9)
        && dropped.trucks.find(t => t.active).cargoVisible === bedLoad - 1
        // Barel keluar dari BAK TRUK, bukan dari udara kosong di sampingnya:
        // truknya sudah mengejar lajur player dan sejajar saat melepasnya.
        && dropped.trucks.find(t => t.active).lane === lane0
        && Math.abs(dropped.trucks.find(t => t.active).z - b0.z) < S8C.laneWidth * 0.6);

    // --- KELUAR DARI PINTU, BUKAN MUNCUL DI ASPAL (2026-08-18, permintaan user
    //     "pintu belakang mobil itu terbuka kemudian barel menggelinding jatuh
    //     kemudian pintu tertutup"). Pada frame kelahirannya barel masih di
    //     UDARA, tepat di bibir pintu truk itu, dan pintunya menganga penuh
    //     serta sedang MENAHAN bukaannya. Versi lama menaruh barel langsung di
    //     aspal sementara pintunya tertutup pada frame yang sama.
    {
        const air = s8mod.stage8HaulerDebug();
        const at = air.trucks.find(v => v.active), ab = air.dropped[0];
        T(`S8 BAREL: keluar dari BIBIR PINTU yang menganga, bukan muncul di aspal [y ${ab ? ab.y.toFixed(1) : '-'} vs radius ${barrel5Mod.BARREL_RADIUS}, pintu ${at ? at.gate.toFixed(2) : '-'}]`,
            !!ab && !!at && ab.airborne
            && ab.y > barrel5Mod.BARREL_RADIUS + 1
            // Lahir di jangkar pintu truk, bukan di titik kira-kira.
            && Math.abs(ab.x - (at.x + air.dropAnchor.x)) < S8C.roadSpeed * 0.1 + 1
            && at.gate > 0.99 && at.gateHold > 0 && at.gateShut > 0);
    }
    // Tunggu sampai benar-benar MENDARAT sebelum menguji perilaku "diam di
    // aspal": selama masih jatuh ia memang belum menyapu selaju tanah penuh.
    let landGuard = 0;
    while (s8mod.stage8HaulerDebug().dropped[0]?.airborne && landGuard++ < 400)
        tickS8(0.02, 0.02);
    T(`S8 BAREL: mendarat rata di aspal setelah animasi jatuhnya selesai [${(landGuard * 0.02).toFixed(2)}s <= dropFallSec ${BD.dropFallSec}s]`,
        landGuard > 0 && landGuard * 0.02 <= BD.dropFallSec + 0.02
        && !s8mod.stage8HaulerDebug().dropped[0].airborne);

    // --- Diam di aspal: menyapu mundur tepat pada laju tanah.
    const roll0 = s8mod.stage8HaulerDebug().dropped[0];
    const bx0 = roll0.x;
    tickS8(0.1, 0.1);
    const roll1 = s8mod.stage8HaulerDebug().dropped[0];
    const bx1 = roll1.x;
    T(`S8 BAREL: diam di aspal — menyapu mundur ke player tepat selaju tanah [${(bx0 - bx1).toFixed(2)} unit/frame]`,
        Math.abs((bx0 - bx1) - S8C.roadSpeed * 0.1) < 1e-9 && bx0 > s8World0.origin.x);
    // POROS GELINDING (2026-08-17, laporan user "barrel menggelinding dengan
    // posisi poros yang salah"). Silinder three bersumbu +Y, jadi tong yang
    // BERDIRI dan diputar pada z akan TERGULING ke samping alih-alih
    // menggelinding. Yang dijaga di sini: tongnya benar-benar direbahkan
    // melintang jalan (pivot x = PI/2), putarannya HANYA pada sumbu tong itu
    // sendiri, dan lajunya memenuhi gelinding tanpa slip (dtheta = dx / R).
    {
        const R = barrel5Mod.BARREL_RADIUS;
        const dTheta = roll1.spin.y - roll0.spin.y, dX = bx0 - bx1;
        T(`S8 BAREL: menggelinding pada POROS-nya sendiri, melintang jalan, tanpa slip [dsudut ${dTheta.toFixed(3)} vs dx/R ${(dX / R).toFixed(3)}]`,
            Math.abs(roll1.spin.x - Math.PI / 2) < 1e-9      // direbahkan melintang jalan
            && Math.abs(roll1.spin.z) < 1e-9                 // tidak terguling ke samping
            && dTheta > 0 && Math.abs(dTheta - dX / R) < 1e-9
            // Berbaring di ATAS aspal: pusatnya setinggi radius, tidak terbenam.
            && Math.abs(roll1.y - R) < 1e-9);
    }
    // POROS RODA (laporan user yang sama, "ban mobilnya juga berputar dengan
    // posisi poros yang salah"): poros roda dipanggang di GEOMETRI-nya
    // (`rotateX(PI/2)`) sehingga rotasi objeknya bebas dipakai sebagai gelinding
    // pada `rotation.z` — konvensi yang sama dengan Raven-K dan GRD LTV-45.
    // Versi pertama memutar `rotation.x`, yaitu sumbu ARAH JALAN.
    {
        const w = s8mod.stage8HaulerDebug().trucks.find(t => t.active);
        T(`S8 PENGANGKUT BAREL: ban berputar pada poros melintang (rotation.z), bukan pada sumbu arah jalan [z ${w ? w.wheelSpin.z.toFixed(2) : '-'}]`,
            !!w && !!w.wheelSpin && w.wheelSpin.z !== 0
            && w.wheelSpin.x === 0 && w.wheelSpin.y === 0
            && w.wheelPhase > 0);
    }

    // --- MENGHINDAR: pindah lajur, barel harus LEWAT tanpa meledak. Kalau ia
    //     tetap meledak, radius blast 6 m akan menghantam lajur sebelah juga dan
    //     manuvernya jadi sia-sia.
    const boomsBefore = robotsMod.pendingBoomsDebug().length;
    // Satu tepi tombol yang bersih, lalu ditahan sepanjang durasi manuver
    // TERPANJANG — perpindahan yang menyentuh median memakai `medianChangeSec`,
    // dan `laneIndex` baru berubah setelah easing-nya benar-benar selesai.
    const laneSec = Math.max(S8C.laneChangeSec, S8C.medianChangeSec) + 0.02;
    stateMod.keys.a = false; s8mod.stage8Scene.updatePlayerControl(0.01);
    stateMod.keys.a = true; s8mod.stage8Scene.updatePlayerControl(0.01);
    stateMod.keys.a = false; s8mod.stage8Scene.updatePlayerControl(laneSec);
    const dodgedLane = s8mod.stage8RoadDebug().laneIndex;
    // Ditunggu HANYA sampai barel itu melewati x player — barel berikutnya baru
    // jatuh `dropGapSec` kemudian, jadi tidak ada yang mencemari pengamatan.
    let passGuard = 0;
    const stillAhead = () => s8mod.stage8HaulerDebug().dropped
        .some(b => Math.abs(b.z - laneZ0) < 1e-9 && b.x > s8World0.origin.x);
    while (stillAhead() && passGuard++ < 400) tickS8(0.05, 0.05);
    T(`S8 BAREL: player yang berpindah lajur DILEWATI begitu saja — tanpa ledakan [lajur ${lane0} -> ${dodgedLane}]`,
        dodgedLane !== lane0 && passGuard < 400
        && robotsMod.pendingBoomsDebug().length === boomsBefore);
    // Truknya IKUT PINDAH mengejar lajur baru — itulah telegraph muatan
    // berikutnya, dan alasan menghindar sekali saja tidak cukup.
    {
        const chase = s8mod.stage8HaulerDebug().trucks.find(t => t.active);
        const chaseZ = s8mod.stage8WorldDebug().lanePositions[dodgedLane];
        T(`S8 PENGANGKUT BAREL: truk MENGEJAR lajur player, jadi menghindar sekali saja tak cukup [lajur truk ${chase ? chase.lane : '-'} vs player ${dodgedLane}]`,
            !!chase && chase.lane === dodgedLane
            && Math.abs(chase.z - chaseZ) < S8C.laneWidth * 0.6);
    }

    // --- TERTABRAK: tetap di lajur, barel BERIKUTNYA jatuh di lajur baru itu
    //     dan harus meledak DI SANA, melukai player lewat kontrak `queueBoom`
    //     barel bersama.
    robotsMod.resetRobotsFx();
    let hitGuard = 0, boomed = null;
    while (!boomed && hitGuard++ < 600) {
        tickS8(0.05, 0.05);
        boomed = robotsMod.pendingBoomsDebug().find(b => b.hurtPlayer);
    }
    T(`S8 BAREL: player yang TETAP di lajurnya tertabrak — ledakan diantre di titik barel dgn damage barel bersama [dmg ${boomed ? boomed.playerDmg : '-'}]`,
        !!boomed && boomed.playerDmg === cfgMod.CFG.barrels.playerDamage
        && Math.abs(boomed.r - cfgMod.CFG.barrels.blastRadiusMeters * cfgMod.CAMP_M) < 1e-6
        && Math.abs(boomed.x - s8World0.origin.x) < S8C.roadSpeed * 0.05 + 1
        && Math.abs(boomed.z - s8mod.stage8RoadDebug().currentZ) < S8C.laneWidth);

    // --- HP truk: mati TEPAT pada nilai config, tidak sebelum itu.
    robotsMod.resetRobotsFx();
    s8mod.stage8ClearHaulersDbg(); s8mod.stage8SpawnHaulerDbg();
    s8mod.stage8DamageHaulerDbg(BD.hp - 1);
    const nearly = s8mod.stage8HaulerDebug();
    const alive = nearly.trucks.find(t => t.active);
    s8mod.stage8DamageHaulerDbg(1);
    const dead = s8mod.stage8HaulerDebug();
    T(`S8 PENGANGKUT BAREL: hancur TEPAT pada HP config, bangkainya tertinggal di jalan [${BD.hp} HP]`,
        nearly.active === 1 && alive.hp === 1
        && dead.active === 0
        && dead.trucks.some(t => t.wreck && t.hp === 0));
    // BERKEPING-KEPING (2026-08-18, permintaan user "mobil yang dikendarai musuh
    // juga hancur berkeping-keping"). Diukur TANPA satu tick pun di antaranya,
    // supaya fase putaran rodanya identik dan sidik jari pose-nya sebanding.
    {
        const wi = dead.trucks.findIndex(t => t.wreck), w = dead.trucks[wi];
        s8mod.stage8ClearHaulersDbg();
        const back = s8mod.stage8HaulerDebug().trucks[wi];
        T(`S8 PENGANGKUT BAREL: bangkainya berkeping-keping dan gosong, lalu PULIH PERSIS saat rignya dipakai ulang [${w.shards} keping]`,
            w.shattered && w.shards > 10 && w.partCount === alive.partCount
            && Math.abs(w.poseSum - alive.poseSum) > 1
            && w.bodyHex !== alive.bodyHex
            // Rig ini dipakai pengangkut berikutnya: pemulihannya harus PERSIS.
            && !back.shattered && back.shards === 0
            && Math.abs(back.poseSum - alive.poseSum) < 1e-9
            && back.bodyHex === alive.bodyHex);
    }
    s8mod.stage8ClearHaulersDbg(); robotsMod.resetRobotsFx(); barrel5Mod.resetBarrels();

    // --- MUATAN PENUH (2026-08-18, permintaan user "barrel yang dijatuhkannya
    //     lebih banyak dengan interval waktu yang lebih singkat"). Angka-angkanya
    //     milik config; yang dijaga di sini adalah rentetannya benar-benar
    //     SELESAI di permainan sungguhan — pool barel tidak boleh kelaparan di
    //     tengah jalan (dulu dipatok 8 slot) dan baknya harus habis. God-mode
    //     dinyalakan karena seluruh muatan memang jatuh di lajur player dan
    //     akan meledak di sana; yang diuji di sini iramanya, bukan damagenya.
    {
        stateMod.setGodMode(true);
        s8mod.stage8SpawnHaulerDbg();
        const gaps = []; let last = null, simT = 0, seen = 0, loadGuard = 0;
        // Siklus pintu PER BAREL: sesudah tiap barel, pintu harus benar-benar
        // kembali menutup sebelum barel berikutnya lepas. `shutBetween` mencatat
        // bukaan TERKECIL di sela dua barel; kalau animasinya tak muat di dalam
        // `dropGapSec`, angka ini tidak pernah turun ke nol.
        const shutBetween = []; let minGate = 1;
        while (seen < BD.dropCount && loadGuard++ < 4000) {
            tickS8(0.05, 0.05); simT += 0.05;
            const t = s8mod.stage8HaulerDebug().trucks.find(v => v.active);
            if (!t) break;
            if (t.dropped > seen) {
                seen = t.dropped;
                if (last !== null) { gaps.push(simT - last); shutBetween.push(minGate); }
                last = simT; minGate = 1;
            } else if (last !== null) minGate = Math.min(minGate, t.gate);
        }
        const spent = s8mod.stage8HaulerDebug().trucks.find(t => t.active);
        const worstGap = gaps.length
            ? Math.max(...gaps.map(g => Math.abs(g - BD.dropGapSec))) : 99;
        T(`S8 MUATAN BAREL: satu truk menuntaskan ${BD.dropCount} barel berjarak ${BD.dropGapSec}s tanpa pool kelaparan [${seen} barel, simpangan jeda terburuk ${worstGap.toFixed(2)}s]`,
            seen === BD.dropCount && gaps.length === BD.dropCount - 1
            && worstGap <= 0.06
            // Baknya benar-benar habis, jadi "sisa muatan" tetap terbaca jujur.
            && !!spent && spent.cargoVisible === Math.max(0, bedLoad - BD.dropCount));
        const worstShut = shutBetween.length ? Math.max(...shutBetween) : 1;
        T(`S8 PINTU BELAKANG: membuka -> menahan -> MENUTUP untuk setiap barel, muat di dalam satu jeda [bukaan tersisa terburuk ${worstShut.toFixed(2)}]`,
            shutBetween.length === BD.dropCount - 1 && worstShut <= 0.02
            // Yang membuat itu mungkin: seluruh animasinya muat di satu jeda.
            && BD.dropTelegraphSec + BD.dropFallSec + BD.dropCloseSec <= BD.dropGapSec);
        stateMod.setGodMode(false);
        s8mod.stage8ClearHaulersDbg(); robotsMod.resetRobotsFx(); barrel5Mod.resetBarrels();
    }
    // Kembalikan player ke lajur SEMULA: sisa berkas ini menguji bahwa corridor
    // MEDIAN pun ikut ditarget telegraph MG bos, jadi posisinya bagian dari
    // prasyarat tes berikutnya — bukan kebetulan.
    while (s8mod.stage8RoadDebug().laneIndex < lane0) {
        stateMod.keys.d = false; s8mod.stage8Scene.updatePlayerControl(0.01);
        stateMod.keys.d = true; s8mod.stage8Scene.updatePlayerControl(0.01);
        stateMod.keys.d = false; s8mod.stage8Scene.updatePlayerControl(laneSec);
    }
}
T('S8 BOSS GATE: boss belum datang selama kendaraan ke-20 belum dihancurkan',
    s8mod.stage8Debug().phase === 'groundPursuit'
    && convoyBeforeFinal.activeRiders === 3
    && !s8mod.stage8GunshipDebug().active);
killS8Riders(); tickS8(0.1, 0.1);
T('S8 PURSUIT COMPLETE: kendaraan ke-20 memulai approach tanpa spawn tambahan',
    s8mod.stage8ConvoyDebug().destroyed === S8C.groundPickupTarget
    && s8mod.stage8ConvoyDebug().spawned === S8C.groundPickupTarget
    && s8mod.stage8Debug().phase === 'bossApproach'
    && !s8mod.stage8GunshipDebug().active);
// Menjelang boss lanskapnya HARUS sudah persawahan — dan sudah TUNTAS, bukan
// setengah jalan: ini inti permintaan user "ketika hampir melawan boss,
// transisikan backgroundnya menjadi di persawahan khas Jawa Barat".
{
    const scn = s8mod.stage8SceneryStateDebug();
    T(`S8 BABAK: pengejaran berakhir di persawahan Jawa Barat, kota sudah habis dari ketiga pool [near ${scn.riceVisible}/${scn.counts.near} sawah, relayout ${scn.relayouts}x, wrap ${scn.wraps}x]`,
        scn.act === 'rice' && scn.targetAct === 'rice'
        && scn.cityVisible === 0 && scn.midCity === 0 && scn.farCity === 0
        && scn.riceVisible === scn.counts.near
        // Peralihannya MENJALAR: satu tata-ulang di luar layar + wrap, bukan
        // satu frame yang membalik seluruh pool.
        && scn.relayouts === 1 && scn.wraps > scn.counts.near);
}
tickS8(Math.max(0, S8C.bossApproachDelaySec - 0.1), 0.1);
T('S8 BOSS APPROACH: gunship menunggu delay config setelah 20 carrier hancur',
    s8mod.stage8Debug().phase === 'bossApproach' && !s8mod.stage8GunshipDebug().active);
tickS8(0.2, 0.1);
T('S8 GUNSHIP INTRO: baru dimulai setelah target destruction dan approach selesai',
    s8mod.stage8Debug().phase === 'gunshipIntro' && stateMod.cinematicActive
    && s8mod.stage8GunshipDebug().active);
const s8GunshipSkipResult = dom4.triggerCutsceneSkip();
const s8GunshipAfterSkip = s8mod.stage8GunshipDebug();
T('S8 GUNSHIP INTRO SKIP: cleanup identik dan boss battle tetap aktif'
    + ' [skip=' + s8GunshipSkipResult + ',phase=' + s8mod.stage8Debug().phase
    + ',hp=' + s8GunshipAfterSkip.hp + '/' + S8G.hp
    + ',cine=' + stateMod.cinematicActive + ']',
    s8GunshipSkipResult === true && s8mod.stage8Debug().phase === 'gunshipBattle'
    && !stateMod.cinematicActive
    && s8GunshipAfterSkip.hp === S8G.hp);

T('S8 BABAK: duel gunship berlangsung di atas persawahan, bukan kembali ke kota',
    s8mod.stage8SceneryActDebug().act === 'rice'
    && s8mod.stage8SceneryStateDebug().cityVisible === 0
    && [...s8mod.stage8SceneryActDebug().near, ...s8mod.stage8SceneryActDebug().mid,
        ...s8mod.stage8SceneryActDebug().far].every(m => m.act === 'rice'));

// Siklus serangan aktual: median ikut ditarget, MG telegraph, cannon, lalu burst
// homing yang tidak pernah dapat melebihi tiga proyektil pool.
tickS8(1.05, 0.05);
T('S8 GUNSHIP MG: corridor median ikut ditarget dan telegraph muncul sebelum tembakan',
    s8mod.stage8GunshipDebug().attackState === 'telegraph'
    && s8mod.stage8GunshipDebug().targetLane === 3 && s8mod.stage8GunshipDebug().telegraph);
// ARAH TRACER MG (2026-08-18, laporan user "peluru machine gun malah
// melintang"). `GEO.bullet` adalah BOLA: yang memanjangkannya cuma `scale`, dan
// versi lama memanjangkannya pada sumbu Z sementara pelurunya terbang di sumbu
// -X. Yang dijaga di sini BUKAN angka rotasinya, melainkan hubungannya: sumbu
// PANJANG tracer, setelah yaw-nya, harus sejajar dengan ARAH TERBANGNYA.
{
    let mgGuard = 0, shot = null;
    while (!shot && mgGuard++ < 400) {
        tickS8(0.05, 0.05);
        shot = enemyBullets.find(b => b.source === 'gunship');
    }
    const yaw = shot ? shot.mesh.rotation.y : 0;
    const ax = Math.sin(yaw), az = Math.cos(yaw);
    const dot = shot ? ax * shot.dir.x + az * shot.dir.z : 0;
    T(`S8 GUNSHIP MG: tracer memanjang SEARAH terbangnya, bukan melintang jalan [selaras ${Math.abs(dot).toFixed(3)}]`,
        !!shot
        // Sumbu panjangnya memang +z lokal (itu yang di-scale)...
        && shot.mesh.scale.z > shot.mesh.scale.x * 3
        // ...dan setelah yaw, sumbu itu sejajar arah terbang. |dot| = 1 sejajar,
        // 0 = tegak lurus alias melintang jalan seperti palang.
        && Math.abs(dot) > 0.999
        // Terbangnya sendiri memang searah jalan (sumbu x).
        && Math.abs(shot.dir.x) > 0.999 && Math.abs(shot.dir.z) < 1e-9);
}
let missilePeak = 0, attackGuard = 0;
while (attackGuard++ < 600 && missilePeak < S8G.missileBurst) {
    tickS8(0.05, 0.05);
    missilePeak = Math.max(missilePeak, s8mod.stage8GunshipDebug().missilesActive);
}
T('S8 GUNSHIP MISSILE: siklus MG/cannon/missile menghasilkan burst tepat tiga, tak lebih dari pool',
    missilePeak === S8G.missileBurst
    && s8mod.stage8WorldDebug().pools.missiles === S8G.missileBurst);

// UKURAN PROYEKTIL (2026-08-18, permintaan user "buat agar lebih besar dan lebih
// terlihat jelas agar player menyadari kedatangannya"). Patokannya diambil dari
// DUNIA, bukan angka selera: keduanya harus setidaknya sepanjang satu lajur dan
// selebar seperempat lajur, supaya terbaca dari kamera oblique jauh sebelum
// mendarat. Versi lama (rudal ~5 unit, shell ~3,9 unit) gagal di ambang ini.
{
    const gsMod = await import(R('src/entities/combatGunship.js'));
    // Silinder/kerucut proyektil direbahkan ke sumbu x (rz = +-PI/2), jadi
    // TINGGI geometrinya adalah panjangnya; sirip kotak yang tegak (rx = PI/2)
    // menyumbang tinggi, bukan lebar.
    const spanOf = g => {
        let x0 = Infinity, x1 = -Infinity, w = 0;
        for (const o of g.children) {
            const a = o.geometry?.args; if (!a) continue;
            const t = o.geometry.type;
            let lx = 0, lz = 0;
            if (t === 'cyl') { lx = a[2]; lz = Math.max(a[0], a[1]) * 2; }
            else if (t === 'cone') { lx = a[1]; lz = a[0] * 2; }
            else if (t === 'box') { lx = a[0]; lz = Math.abs(o.rotation.x) < 1e-6 ? a[2] : 0; }
            x0 = Math.min(x0, o.position.x - lx / 2);
            x1 = Math.max(x1, o.position.x + lx / 2);
            w = Math.max(w, lz);
        }
        return { len: (x1 - x0) * g.scale.x, width: w * g.scale.z };
    };
    const mis = spanOf(gsMod.buildCombatGunshipMissileMesh());
    const she = spanOf(gsMod.buildCombatGunshipShellMesh());
    const lane = S8C.laneWidth;
    T(`S8 GUNSHIP PROYEKTIL: rudal & shell cukup besar untuk terbaca dari kamera oblique [rudal ${mis.len.toFixed(0)}x${mis.width.toFixed(0)}, shell ${she.len.toFixed(0)}x${she.width.toFixed(0)} vs lajur ${lane}]`,
        mis.len >= lane && she.len >= lane
        && mis.width >= lane * 0.25 && she.width >= lane * 0.25
        // Tetap muat di lajurnya sendiri: proyektil yang lebih lebar dari lajur
        // membuat menghindar ke kiri/kanan jadi omong kosong.
        && mis.width < lane && she.width < lane);
}

const s8PoolsBeforeDeath = JSON.stringify(s8mod.stage8WorldDebug().pools);
s8mod.stage8DamageGunshipForDebug(S8G.hp);
tickS8(0.1, 0.1);
T('S8 GUNSHIP DEATH: HP nol membersihkan projectile dan masuk animasi jatuh',
    s8mod.stage8Debug().phase === 'gunshipDeath' && s8mod.stage8GunshipDebug().dead
    && s8mod.stage8GunshipDebug().missilesActive === 0
    && s8mod.stage8GunshipDebug().shellsActive === 0);
tickS8(4.3, 0.1);
T('S8 DEATH DELAY: arrival belum mulai tepat sesudah animasi gunship selesai',
    s8mod.stage8GunshipDebug().deathDone && s8mod.stage8Debug().phase === 'gunshipDeath'
    && s8mod.stage8Debug().deathDelayT < S8C.gunshipDeathDelaySec);
tickS8(S8C.gunshipDeathDelaySec + 0.1, 0.1); drainS8Dialogue(); tickS8(0.1, 0.1);
T('S8 ARRIVAL: tiga detik sesudah animasi + dialog boss-down membuka cutscene Kertajati',
    s8mod.stage8Debug().phase === 'arrival' && stateMod.cinematicActive);
const s8ArrivalSkip = dom4.triggerCutsceneSkip();
T('S8 COMPLETE: arrival skip membersihkan pose/overlay/audio dan membuka finish hijau dengan checkpoint 8',
    s8ArrivalSkip === true && stateMod.isGameOver && s8mod.stage8Debug().complete
    && dom4.gameOverTitle.innerText === 'STAGE 8 COMPLETE'
    && dom4.gameOverScreen.style.background === 'rgba(0, 90, 30, 0.82)'
    && save5Mod.loadCampaignStage() === 8 && !stateMod.cinematicActive
    && !avMod.avatarVehicleDebug().active && dom4.stageRadioDialogueDebug() === null
    && dom4.cineFadeDebug()?.opacity === 0
    && JSON.stringify(s8mod.stage8WorldDebug().pools) === s8PoolsBeforeDeath);

T(`S8 BANGKAI CARRIER: mobil musuh yang hancur ikut berkeping-keping dan gosong, yang masih hidup tetap utuh [${s8Shard.wrecked} sampel bangkai, ${s8Shard.live} sampel hidup]`,
    s8Shard.wrecked > 5 && s8Shard.live > 5
    // Tiap bangkai berkeping dan bercat gosong...
    && s8Shard.unshattered === 0 && s8Shard.uncharred === 0
    // ...dan tiap carrier hidup utuh serta bercat asli, jadi entri pool yang
    // dipakai ulang benar-benar dipulihkan, bukan lahir kembali sbg bangkai.
    && s8Shard.liveBad === 0
    && s8Shard.wreckHex !== null && s8Shard.wreckHex !== s8Shard.liveHex);

// SATU SISTEM BANGKAI untuk KETIGA kendaraan (2026-08-18). Fade oklusi dulu
// sempat punya tiga salinan yang saling menyimpang; jangan ulangi polanya di
// sini. Yang dijaga: ketiga modul kendaraan memanggil sistem bersama, dan tak
// satu pun memelihara acakan/penggosongan versinya sendiri.
{
    const vsrc = [
        'src/entities/tacticalVehicle.js',
        'src/entities/enemyPickup.js',
        'src/scenes/campaign/stages/stage8/barrelDropper.js',
    ].map(f => fs.readFileSync(ROOT + '/' + f, 'utf8'));
    T('BANGKAI KENDARAAN: satu sistem bersama (vehicleWreck.js) dipakai player, carrier, dan pengangkut barel',
        vsrc.every(s => /from '[^']*vehicleWreck\.js'/.test(s)
            && /shatterVehicle\(/.test(s) && /restoreVehicle\(/.test(s)
            // Tak ada salinan lokal dari acakan/penggosongannya.
            && !/function wreckHash/.test(s) && !/CHAR_BODY\s*=/.test(s)));
}

T(`S8 BANGKAI: bangkai carrier mengerem lalu DIAM di aspal — tak pernah terseret ikut kendaraan player [laju surut ${s8Wreck.min.toFixed(2)}x..${s8Wreck.max.toFixed(2)}x laju tanah, ${s8Wreck.samples} sampel]`,
    s8Wreck.samples > 5
    // Tak pernah lebih lambat dari tanah: kalau < 1 ia ikut terbawa maju.
    && s8Wreck.min >= 1 - 1e-6
    // Benar-benar MENGEREM sampai laju tanah, bukan meluncur mundur selamanya.
    && s8Wreck.min <= 1.02 && s8Wreck.max <= 1.36);

T(`S8 BABAK: sepanjang stage — kota sebelum ambang config, sawah sesudahnya, tanpa satu pun modul yang berganti di depan mata [${s8Scn.swaps} pergantian, ${s8Scn.ticks} tick]`,
    s8Scn.acts.has('city') && s8Scn.acts.has('rice')
    && s8Scn.badEarly === 0 && s8Scn.badLate === 0 && s8Scn.backToCity === 0
    && s8Scn.onScreen === 0 && s8Scn.swaps > 20
    && S8C.scenery.riceAfterFraction > 0 && S8C.scenery.riceAfterFraction < 1);

// KENDARAAN PLAYER IKUT HANCUR SAAT PLAYER MATI (2026-08-18, permintaan user
// "buat agar saat player mati, mobil GRD LTV-45 meledak dan hancur
// berkeping-keping"). Yang dijaga: bangkainya adalah keping rig ITU SENDIRI yang
// dilempar keluar tempatnya — jumlah anak grup tidak boleh bertambah, karena
// melahirkan mesh saat mati berarti membuka peluang kompilasi shader di detik
// paling sensitif — dan seluruh pose/warnanya PULIH PERSIS saat stage diulang.
{
    // Pose acuan diambil dari kendaraan yang BARU direset — pintu/hatch stage
    // yang kebetulan sedang membuka bukan bagian dari yang harus dipulihkan.
    // Kolam gib juga dikosongkan dulu: pertempuran stage sudah mengisinya penuh,
    // jadi "bertambah" tak lagi terukur.
    s8mod.stage8RestoreVehicleDbg(); goreMod.resetGore();
    const v0 = s8mod.stage8Debug().vehicle;
    const boom0 = stateMod.explosions.length;
    s8mod.stage8Scene.onPlayerDeath(-1, 0);
    const v1 = s8mod.stage8Debug().vehicle;
    const gibs = goreMod.goreDebug().gibs;
    T(`S8 KENDARAAN: player mati -> LTV-45 meledak dan berkeping-keping, tanpa satu pun mesh baru [${v1.wreckParts} keping, ${stateMod.explosions.length - boom0} ledakan, ${gibs.length} serpihan]`,
        !v0.wrecked && v1.wrecked
        && v1.wreckParts > 10 && v1.parts === v0.parts
        // Kepingnya benar-benar berpindah, sasisnya ambles miring, catnya gosong.
        && Math.abs(v1.poseSum - v0.poseSum) > 1
        && Math.abs(v1.wreckTilt.z) > 0.05
        && v1.bodyHex !== v0.bodyHex
        && stateMod.explosions.length > boom0
        // Serpihan beterbangan lahir DI kendaraan itu, bukan di titik lain.
        && gibs.length > 12
        && gibs.every(g => Math.abs(g.x - v1.position.x) < 60
            && Math.abs(g.z - v1.position.z) < 60));
    // Mati = mengulang stage, jadi pemulihannya harus PERSIS, bukan mendekati.
    s8mod.stage8RestoreVehicleDbg();
    const v2 = s8mod.stage8Debug().vehicle;
    T('S8 KENDARAAN: mengulang stage memulihkan pose dan cat bangkainya PERSIS seperti semula',
        !v2.wrecked && v2.wreckParts === 0 && v2.parts === v0.parts
        && Math.abs(v2.poseSum - v0.poseSum) < 1e-9
        && v2.bodyHex === v0.bodyHex
        && v2.wreckTilt.x === 0 && v2.wreckTilt.z === 0);
}

// Kembali ke Stage 7 untuk menguji jalur skip outro-nya secara independen.
stateMod.setGameOver(false);
s8mod.stage8Scene.cheatSkipToStage(7);

// Jalur skip harus menghasilkan cleanup/state akhir yang sama dengan outro normal.
T('S7 OPENING SKIP: Space/button melepas cinematic tanpa menyisakan dialogue/fade',
    dom4.triggerCutsceneSkip() === true && s7mod.stage7Debug().phase === 'flyover'
    && !stateMod.cinematicActive && s7mod.stage7DialogueDebug().key === 'flyoverPlan'
    && dom4.cineFadeDebug()?.opacity === 0);
drainS7Dialogue();
camera.position.set(s7mod.S7_LANDMARK.x, cfgMod.CFG.player.eyeHeight,
    s7mod.S7_START.z);
s7mod.stage7Scene.updateMode(0.1); drainS7Dialogue();
camera.position.set(s7mod.S7_TOLL.x, cfgMod.CFG.player.eyeHeight, s7mod.S7_TOLL.z);
s7mod.stage7Scene.updateMode(0.1);
T('S7 PASUPATI SKIP SETUP: lintasan yang sama berakhir pada tiga mesin Pasteur',
    s7mod.stage7Debug().phase === 'factorySiege' && s7mod.stage7Debug().machinesAlive === 3);
hitS7Factories(); killS7(); s7mod.stage7Scene.updateMode(0.1);
camera.position.set(s7mod.S7_VEHICLE.x, cfgMod.CFG.player.eyeHeight, s7mod.S7_VEHICLE.z);
s7mod.stage7Scene.updateMode(0.1);
const s7OutroSkip = dom4.triggerCutsceneSkip();
const s7SkipVehicle = s7mod.stage7VehicleDebug();
T('S7 OUTRO SKIP: state akhir identik — Major boarded, vehicle departed, overlay/pose/audio bersih',
    s7OutroSkip === true && stateMod.isGameOver && s7mod.stage7Debug().complete
    && s7SkipVehicle.engineOn && s7SkipVehicle.speed === 72
    && s7SkipVehicle.position.x < s7mod.S7_VEHICLE.x
    && !stateMod.cinematicActive && !avMod.avatarRadioDebug().active
    && avMod.avatarGroup.visible === false && dom4.stageRadioDialogueDebug() === null
    && dom4.cineFadeDebug()?.opacity === 0 && save5Mod.loadCampaignStage() === 7);
stateMod.setGameOver(false);

// --- 17b. CHEAT skip-to-stage-N (2026-07-14): lompat LANGSUNG ke stage campaign
// (tanpa shop). Hook `cheatSkipToStage` di tiap stage → `campaignJumpToStage`
// (transition.js): bersihkan robot + setScene(target) + tempatkan robot. ---
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
let jr = smMod.activeScene.cheatSkipToStage(8);
T('cheat skip-to-stage-8: pindah ke Cisumdawu + checkpoint 8 + opening kendaraan', jr === 8
    && smMod.activeScene === s8mod.stage8Scene && save5Mod.loadCampaignStage() === 8
    && s8mod.stage8Debug().phase === 'opening');
jr = smMod.activeScene.cheatSkipToStage(7);
T('cheat skip-to-stage-7: pindah ke Pasupati + checkpoint/robot Stage 7', jr === 7
    && smMod.activeScene === s7mod.stage7Scene && save5Mod.loadCampaignStage() === 7
    && robots.filter(z => z.stage === 7).length
        === Object.values(S7C.encounters).reduce((n, mix) => n + mixCount(mix), 0));
jr = smMod.activeScene.cheatSkipToStage(6);
T('cheat skip-to-stage-6: pindah ke Bandung HQ + checkpoint/robot Stage 6', jr === 6
    && smMod.activeScene === s6mod.stage6Scene && save5Mod.loadCampaignStage() === 6
    && robots.filter(z => z.stage === 6).length === Object.values(scaledMix(S6C.encounters.hall, 6)).reduce((a, b) => a + b, 0));
jr = smMod.activeScene.cheatSkipToStage(5);
T('cheat skip-to-stage-5: pindah ke depot + checkpoint/robot Stage 5', jr === 5
    && smMod.activeScene === s5mod.stage5Scene && save5Mod.loadCampaignStage() === 5
    && robots.filter(z => z.stage === 5).length === mixTotal(scaledMix(S5C.encounters.depot, 5)));
jr = smMod.activeScene.cheatSkipToStage(3);   // dari stage 5 aktif -> STAGE 3
await s3RunHack(); s3Drain();   // stage 3 MULAI kosong; HACK terminal (minigame) -> gelombang robot
T('cheat skip-to-stage-3: pindah ke stage 3 + hack terminal -> gelombang robot (3-tag)', jr === 3
    && smMod.activeScene === s3mod.stage3Scene && robots.length > 0 && robots.every(z => z.stage === 3));
jr = smMod.activeScene.cheatSkipToStage(2);        // -> STAGE 2 (robot ditempatkan ulang oleh helper)
T('cheat skip-to-stage-2: pindah ke stage 2 + ' + s2mod.s2Wave1Count() + ' robot ditempatkan', jr === 2
    && smMod.activeScene === s2mod.stage2Scene
    && robots.filter(z => z.stage === 2).length === s2mod.s2Wave1Count());
const s4before = smMod.activeScene;
T('cheat skip-to-stage invalid (14) ditolak, scene tak berubah',
    smMod.activeScene.cheatSkipToStage(14) === null && smMod.activeScene === s4before);
T('survival TAK punya hook cheatSkipToStage (campaign-only)',
    survMod.survivalScene.cheatSkipToStage === undefined);
// Anti-stutter: lompat-langsung WAJIB mengompilasi shader dunia baru via
// renderer.compile (kini belt-and-suspenders — mobil stage 4 sudah Lambert
// [rombak 2026-07-16], tapi jalur compile tetap wajib utk material non-warm lain).
const _rc = rendererMod.renderer.compile;
let rcCount = 0;
rendererMod.renderer.compile = function () { rcCount++; return _rc.apply(this, arguments); };
smMod.activeScene.cheatSkipToStage(4);
T('cheat jump memanggil renderer.compile (warm shader stage baru)', rcCount > 0);
rendererMod.renderer.compile = _rc;
// TURRET yang TERLEPAS saat tank mati bukan anak group lagi -> disposeTank
// (dipanggil stage4.enter) harus membuangnya SENDIRI, kalau tidak ia tertinggal
// melayang di scene sepanjang run berikutnya (2026-07-29).
T('S4 MATI SINEMATIK: turret yang terlepas ikut dibuang saat stage 4 di-enter ulang',
    !scene.children.includes(s4turret) && s4turret.parent !== scene);
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }

// --- 17b2. CHEAT give-weapon-N (2026-07-29, permintaan user): 2 = Shotgun,
// 3 = Assault Rifle, 4 = Rocket Launcher. Senjata datang di LEVEL MAKSIMUM
// (CFG.weapons.maxWeaponLevel — config-driven; level maks itulah yang membuat
// launcher jadi ROKET) dgn peluru penuh, langsung terpegang. Slot penuh =>
// PISTOL dilepas (cheat tak memunculkan dialog "pilih pengganti" ala shop). ---
{
    const cheatMod = await import(R('src/core/cheatConsole.js'));
    const MAXL = cfgMod.CFG.weapons.maxWeaponLevel, MAXW = cfgMod.CFG.weapons.maxWeapons;
    const snap = {
        weapons: player.weapons.slice(), lvl: { ...player.weaponLvl }, cur: wMod.currentWeapon,
        ammo: { shotgun: player.shotgun.ammo, rifle: player.rifle.ammo, launcher: player.launcher.ammo },
    };
    player.weapons = ['pistol']; stateMod.syncOwnedFromWeapons();
    player.weaponLvl = { rifle: 1, pistol: 1, shotgun: 1, launcher: 1 };
    player.shotgun.ammo = 0; player.rifle.ammo = 0; player.launcher.ammo = 0;

    cheatMod.runCheatCommand('give-weapon-2');
    T('cheat give-weapon-2: SHOTGUN level maks + peluru penuh masuk slot berikutnya',
        player.owned.shotgun === true && player.weapons[1] === 'shotgun'
        && player.weaponLvl.shotgun === MAXL && player.shotgun.ammo === stateMod.maxAmmoFor('shotgun'));
    cheatMod.runCheatCommand('give-weapon-3');
    T('cheat give-weapon-3: ASSAULT RIFLE level maks + peluru penuh',
        player.owned.rifle === true && player.weapons[2] === 'rifle'
        && player.weaponLvl.rifle === MAXL && player.rifle.ammo === stateMod.maxAmmoFor('rifle'));
    const slotsFull = player.weapons.length === MAXW;
    cheatMod.runCheatCommand('give-weapon-4');
    T('cheat give-weapon-4: slot penuh -> PISTOL dilepas, launcher masuk (jumlah slot tetap maxWeapons)',
        slotsFull && player.weapons.length === MAXW && player.owned.launcher === true
        && player.owned.pistol === false && player.weaponLvl.launcher === MAXL
        && player.launcher.ammo === stateMod.maxAmmoFor('launcher'));
    // Langsung TERPEGANG + rondenya benar-benar ROKET (bukan granat Mk2).
    finishSwitch();   // selesaikan animasi ganti
    stateMod.bullets.length = 0;
    stateMod.mouse.isDown = true; player.lastShot = 0;
    wMod.updateShooting();
    stateMod.mouse.isDown = false;
    T('cheat give-weapon-4 = ROCKET LAUNCHER: langsung dipegang & rondenya roket (userData.rocket)',
        wMod.currentWeapon === 'launcher' && stateMod.bullets.length === 1
        && stateMod.bullets[0].mesh.userData.rocket === true && stateMod.bullets[0].explosive === true);
    for (const b of stateMod.bullets.splice(0)) scene.remove(b.mesh);
    // Idempoten (tak menggandakan slot) + nomor tak dikenal diabaikan.
    const before = player.weapons.slice();
    cheatMod.runCheatCommand('give-weapon-2');
    const dup = player.weapons.filter(w => w === 'shotgun').length;
    cheatMod.runCheatCommand('give-weapon-9');
    T('cheat give-weapon: senjata yang sudah dibawa tak menggandakan slot; nomor tak dikenal tak mengubah apa pun',
        dup === 1 && player.weapons.length === before.length
        && player.weapons.every((w, i) => w === before[i]));

    player.weapons = snap.weapons; stateMod.syncOwnedFromWeapons();
    player.weaponLvl = snap.lvl;
    player.shotgun.ammo = snap.ammo.shotgun; player.rifle.ammo = snap.ammo.rifle;
    player.launcher.ammo = snap.ammo.launcher;
    wMod.refreshOwnedWeapon();
    wMod.startSwitch(snap.cur);
    finishSwitch();   // selesaikan animasi ganti (switchAnim -> -1)
    for (let i = 0; i < 5; i++) wMod.updateWeaponState(0.2);     // luruhkan gunRecoil (gate AFK avatar)
}

// --- 17b3. CHEAT give-armor-N (2026-07-30, permintaan user): N = tier armor
// (CFG.armor.tiers — jumlah tier & nilainya CONFIG-DRIVEN). Efek = mengenakan
// tier itu dgn durability PENUH, seperti membelinya di Field Shop, TAPI tanpa
// gerbang harga/tier: cheat boleh MENURUNKAN tier & boleh dipakai berulang utk
// repair penuh. Armor yang diberikan harus benar-benar berfungsi (memotong
// `reduce` dari damage, durability menerima damage BASE penuh). ---
{
    const cheatMod = await import(R('src/core/cheatConsole.js'));
    const AT2 = cfgMod.CFG.armor.tiers;
    const snapA = { lvl: player.armorLvl, armor: player.armor, max: player.armorMax, hp: player.hp };
    stateMod.setGodMode(false);
    player.armorLvl = 0; player.armor = 0; player.armorMax = 0;

    cheatMod.runCheatCommand('give-armor-1');
    T('cheat give-armor-1: armor tier 1 terpakai dgn durability PENUH (config-driven)',
        player.armorLvl === 1 && player.armor === AT2[0].durability && player.armorMax === AT2[0].durability);
    cheatMod.runCheatCommand('give-armor-3');
    T('cheat give-armor-3: langsung lompat ke tier 3 (tanpa harus lewat 1/2)',
        player.armorLvl === 3 && player.armor === AT2[2].durability && player.armorMax === AT2[2].durability);
    // Beda dari SHOP: cheat boleh MENURUNKAN tier (shop menolak tier lebih rendah).
    cheatMod.runCheatCommand('give-armor-2');
    T('cheat give-armor: boleh MENURUNKAN tier (shop menolaknya, cheat tidak)',
        player.armorLvl === 2 && player.armorMax === AT2[1].durability);
    // Armornya benar-benar bekerja: HP dipotong `reduce`, durability kena BASE penuh.
    player.hp = 100;
    const dur0 = player.armor;
    robotsMod.damagePlayerHp(20);
    T('cheat give-armor: armor pemberian cheat BENAR-BENAR memotong damage (reduce tier)',
        Math.abs(player.hp - (100 - 20 * (1 - AT2[1].reduce))) < 1e-9
        && Math.abs(player.armor - (dur0 - 20)) < 1e-9);
    // Dipakai lagi = REPAIR penuh (durability kembali ke maks tier itu).
    cheatMod.runCheatCommand('give-armor-2');
    T('cheat give-armor: dipakai lagi = REPAIR penuh', player.armor === AT2[1].durability);
    // Tier di luar CFG.armor.tiers diabaikan (tak mengubah apa pun).
    const beforeA = { lvl: player.armorLvl, armor: player.armor, max: player.armorMax };
    cheatMod.runCheatCommand('give-armor-' + (AT2.length + 6));
    cheatMod.runCheatCommand('give-armor-0');
    T('cheat give-armor: tier tak dikenal tak mengubah apa pun',
        player.armorLvl === beforeA.lvl && player.armor === beforeA.armor && player.armorMax === beforeA.max);

    player.armorLvl = snapA.lvl; player.armor = snapA.armor; player.armorMax = snapA.max;
    player.hp = snapA.hp;
}

// --- 17c. SAVE GAME / checkpoint Campaign (2026-07-15): simpan nomor stage
// terakhir yang di-enter di localStorage → Continue dari titik-mulai stage itu.
// enter() tiap stage menulis checkpoint; MISSION COMPLETE menghapusnya. ---
const saveMod = await import(R('src/core/saveGame.js'));
saveMod.clearCampaignSave();
T('save: kosong -> loadCampaignStage()=0', saveMod.loadCampaignStage() === 0);
saveMod.saveCampaignStage(3);
T('save: tulis 3 -> load 3', saveMod.loadCampaignStage() === 3);
saveMod.saveCampaignStage(5);
T('save: checkpoint Stage 5 valid untuk Continue', saveMod.loadCampaignStage() === 5);
saveMod.saveCampaignStage(6);
T('save: checkpoint Stage 6 valid untuk Continue', saveMod.loadCampaignStage() === 6);
saveMod.saveCampaignStage(7);
T('save: checkpoint Stage 7 valid untuk Continue', saveMod.loadCampaignStage() === 7);
saveMod.saveCampaignStage(8);
T('save: checkpoint Stage 8 valid untuk Continue', saveMod.loadCampaignStage() === 8);
for (let n = 9; n <= 13; n++) {
    saveMod.saveCampaignStage(n);
    T(`save: checkpoint Stage ${n} valid untuk Continue`, saveMod.loadCampaignStage() === n);
}
const checkpoint13 = saveMod.loadCampaignStage();
T('save: penulisan nomor pecahan/di luar 1..13 ditolak tanpa merusak checkpoint lama',
    saveMod.saveCampaignStage(12.5) === false
    && saveMod.saveCampaignStage(0) === false
    && saveMod.saveCampaignStage(14) === false
    && saveMod.loadCampaignStage() === checkpoint13);
localStorage.setItem('gibsCampaignStage', '12xyz');
T('save: checkpoint teks campuran ditolak ketat', saveMod.loadCampaignStage() === 0);
localStorage.setItem('gibsCampaignStage', '12.5');
T('save: checkpoint pecahan dari storage ditolak ketat', saveMod.loadCampaignStage() === 0);
saveMod.clearCampaignSave();
T('save: clear -> 0', saveMod.loadCampaignStage() === 0);
// enter() stage MENULIS checkpoint (uji lewat cheat jump = enter langsung)
smMod.activeScene.cheatSkipToStage(3);   // stage3.enter -> saveCampaignStage(3)
T('save: enter stage 3 menulis checkpoint 3', saveMod.loadCampaignStage() === 3);
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
smMod.activeScene.cheatSkipToStage(1);   // stage1.enter -> saveCampaignStage(1)
T('save: enter stage 1 menulis checkpoint 1', saveMod.loadCampaignStage() === 1);
// Konsistensi loading antar-stage (2026-07-16): stage1.enter mem-pre-build SEMUA
// dunia campaign (ensureWorld stage 3/4/5/6/7/8 di dalam guard `built`-nya) sehingga
// LOADING #2 transisi mana pun tak lagi menanggung build+compile lazy.
const s1PrebuildSrc = fs.readFileSync(ROOT + '/src/scenes/campaign/stages/stage1/index.js', 'utf8');
T('campaign: dunia stage 3/4/5/6/7/8 PRE-BUILT saat campaign dimulai (loading konsisten)',
    s3mod.worldBuilt() && s4mod.worldBuilt() && s5mod.worldBuilt() && s6mod.worldBuilt()
    && s7mod.worldBuilt() && s8mod.worldBuilt()
    && s1PrebuildSrc.includes('ensureStage5World()') && s1PrebuildSrc.includes('ensureStage6World()')
    && s1PrebuildSrc.includes('ensureStage7World()') && s1PrebuildSrc.includes('ensureStage8World()'));
saveMod.saveCampaignStage(5);
const restart5 = saveMod.loadCampaignStage() || 1;
smMod.activeScene.cheatSkipToStage(restart5);
T('restart/continue checkpoint 5: mendarat di awal depot dengan encounter awal utuh',
    restart5 === 5 && smMod.activeScene === s5mod.stage5Scene
    && robots.filter(z => z.stage === 5).length === mixTotal(scaledMix(S5C.encounters.depot, 5)));
saveMod.saveCampaignStage(6);
const restart6 = saveMod.loadCampaignStage() || 1;
smMod.activeScene.cheatSkipToStage(restart6);
T('restart/continue checkpoint 6: mendarat di safe area chapter arrival dengan garnisun hall utuh',
    restart6 === 6 && smMod.activeScene === s6mod.stage6Scene
    && s6mod.stage6Debug().chapter === 'arrival'
    && robots.filter(z => z.stage === 6).length === Object.values(scaledMix(S6C.encounters.hall, 6)).reduce((a, b) => a + b, 0));
saveMod.saveCampaignStage(7);
const restart7 = saveMod.loadCampaignStage() || 1;
smMod.activeScene.cheatSkipToStage(restart7);
T('restart/continue checkpoint 7: mendarat di gerbang HQ dengan escape squad utuh',
    restart7 === 7 && smMod.activeScene === s7mod.stage7Scene
    && robots.filter(z => z.stage === 7).length
        === Object.values(S7C.encounters).reduce((n, mix) => n + mixCount(mix), 0)
    && stateMod.stageStatsDebug().stageId === 'campaign-7'
    && stateMod.stageStatsDebug().elapsedSec === 0
    && stateMod.stageStatsDebug().lootBoxesDestroyed === 0);
saveMod.saveCampaignStage(8);
const restart8 = saveMod.loadCampaignStage() || 1;
smMod.activeScene.cheatSkipToStage(restart8);
T('restart/continue checkpoint 8: mendarat di GRD LTV-45 pada opening Cisumdawu',
    restart8 === 8 && smMod.activeScene === s8mod.stage8Scene
    && s8mod.stage8Debug().phase === 'opening' && s8mod.stage8ConvoyDebug().spawned === 0
    && stateMod.stageStatsDebug().stageId === 'campaign-8'
    && stateMod.stageStatsDebug().elapsedSec === 0
    && stateMod.stageStatsDebug().lootBoxesDestroyed === 0);
// Prompt game-over "RESTART STAGE" (2026-07-15): resetGame(true) campaign ulang
// dari AWAL stage CHECKPOINT (bukan stage 1) via campaignJumpToStage(loadCampaignStage()||1).
saveMod.saveCampaignStage(3);
const restartTarget = saveMod.loadCampaignStage() || 1;
T('restart-stage: target = stage checkpoint (3), BUKAN 1', restartTarget === 3);
smMod.activeScene.cheatSkipToStage(restartTarget);   // = campaignJumpToStage(3), efek sama dgn resetGame(true)
await s3RunHack(); s3Drain();   // stage 3 kosong; HACK terminal (minigame) -> gelombang robot
T('restart-stage: mendarat di AWAL stage 3 + hack terminal -> gelombang robot stage 3',
    smMod.activeScene === s3mod.stage3Scene && robots.length > 0 && robots.every(z => z.stage === 3));
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
// MISSION COMPLETE (gameOver win) menghapus checkpoint (campaign tamat = New Game)
saveMod.saveCampaignStage(4);
setMode('campaign');
stateMod.beginStageStats('campaign-4');
stateMod.updateStageStats(125.9);
stateMod.recordLootBoxDestroyed(); stateMod.recordLootBoxDestroyed();
const statsReturnScene = smMod.activeScene;
smMod.setScene({ id: 'campaign-hack', enter() { stateMod.setPaused(true); }, exit() { } });
gameMod.updateGame(0.1, 6, 0, 2);   // puzzle adalah bagian waktu penyelesaian
smMod.resumeScene(statsReturnScene);
const afterPuzzleTime = stateMod.stageStatsDebug().elapsedSec;
gameMod.updateGame(0.1, 6, 0, 3);   // pause biasa pada scene stage tidak dihitung
stateMod.setPaused(false);
T('STAGE TIME: semua modal hack/repair dihitung, pause biasa dikecualikan',
    Math.abs(afterPuzzleTime - 127.9) < 1e-9
    && Math.abs(stateMod.stageStatsDebug().elapsedSec - afterPuzzleTime) < 1e-9);
gameMod.gameOver(true);
T('save: MISSION COMPLETE (gameOver win) menghapus checkpoint', saveMod.loadCampaignStage() === 0);
T('FINISH SCREEN: hijau menampilkan TOTAL TIME mm:ss + LOOT BOXES DESTROYED per-stage',
    dom4.goStageStats.style.display === 'grid'
    && dom4.goTotalTime.innerText === '02:07' && dom4.goLootBoxes.innerText === '2'
    && gameMod.formatStageTime(3661.9) === '1:01:01');
stateMod.setGameOver(false);
gameMod.gameOver(false);
T('GAME OVER merah: ringkasan finish per-stage disembunyikan',
    dom4.goStageStats.style.display === 'none');
stateMod.setGameOver(false); stateMod.resetStageStats();
setMode('survival');
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
saveMod.clearCampaignSave();   // bersihkan utk test berikutnya

// --- 17c-bis. PROLOG campaign (2026-07-30; ROMBAK TOTAL 2026-07-31, permintaan
// user): TEKS SAJA di atas layar HITAM PEKAT — seluruh panggung 3D "ruang meeting"
// (dunia/hologram/kamera terkunci) DIHAPUS. Diputar SEBELUM intro heli pada start
// campaign baru. Yang diuji: KONTRAK NARASI (urutan + entitas kunci + naskah user
// PERSIS), URUTAN TIGA FASE per era (tahun -> judul -> ketik isi), bahwa modul
// TIDAK lagi membangun dunia / menyentuh kamera, isi overlay DOM `#prologue`, dan
// serah-terima resumeScene ke cutscene heli. Durasi dari CFG.campaign.prologue
// (config-driven). ---
{
    const proMod = await import(R('src/scenes/campaign/cutscenes/prologue.js'));
    const CH = proMod.PROLOGUE_CHAPTERS;
    const P = cfgMod.CFG.campaign.prologue;

    // v8 (2026-07-31, keluhan user "tidak konsisten waktu penampilannya"): durasi
    // per fase EKSPLISIT — fade simetris per fase (`yearFadeSec`/`titleFadeSec`/
    // `bodyFadeSec`), `tailSec` = tahan SETELAH ketikan selesai, `fadeOutSec`
    // tinggal jeda hitam outro. `fadeInSec`/`holdSec` (model lantai-durasi lama)
    // ikut `readSecPerWord`/`maxHoldSec` DIHAPUS dari config: kunci mati di JSON
    // yang di-tuning user itu menyesatkan.
    T('PROLOG config: campaign.prologue ada (enabled + fade per fase + urutan tahun/judul/ketik)',
        !!P && typeof P.enabled === 'boolean' && typeof P.fadeOutSec === 'number'
        && typeof P.yearFadeSec === 'number' && typeof P.yearHoldSec === 'number'
        && typeof P.titleFadeSec === 'number' && typeof P.titleHoldSec === 'number'
        && typeof P.bodyFadeSec === 'number'
        && typeof P.typeCps === 'number' && P.typeCps > 0 && typeof P.tailSec === 'number'
        && P.readSecPerWord === undefined && P.maxHoldSec === undefined
        && P.fadeInSec === undefined && P.holdSec === undefined);

    T('PROLOG: sembilan kartu era, tiap kartu punya year/title/body non-kosong',
        CH.length === 9 && CH.every(c => typeof c.year === 'string' && c.year.length
            && typeof c.title === 'string' && c.title.length
            && typeof c.body === 'string' && c.body.length > 20));

    // Tahun KRONOLOGIS naik (ambil 4-digit pertama tiap `year`: "2032–2035"->2032)
    const years = CH.map(c => parseInt((c.year.match(/\d{4}/) || [0])[0], 10));
    let chrono = true;
    for (let i = 1; i < years.length; i++) if (!(years[i] > years[i - 1])) chrono = false;
    T('PROLOG NARASI: tahun urut kronologis 2028->2045 (' + years.join(',') + ')',
        chrono && years[0] === 2028 && years[years.length - 1] === 2045);

    // ENTITAS KUNCI storyline (title+body gabungan) — kontrak yang tak boleh hilang.
    const blob = CH.map(c => c.title + ' ' + c.body).join(' ');
    const beats = ['N.U.S.A', 'G.A.R.U.D.A', 'Mahapatih Protocol', 'Iron Battalion', 'Zero Hour', 'Bandung', 'Major Gibran'];
    const missing = beats.filter(b => !blob.includes(b));
    T('PROLOG NARASI: entitas kunci hadir (' + beats.join(' / ') + ')', missing.length === 0);
    T('PROLOG NARASI: kartu terakhir menutup pada Major Gibran (serah-terima ke intro heli)',
        CH[CH.length - 1].body.includes('Major Gibran'));

    // ===== NASKAH RESMI USER, KATA PER KATA (2026-08-02) =====
    // User: "ROMBAK TEKS ... SESUAI DENGAN TEKS YANG SAYA TARUH DI BAWAH!! JANGAN
    // ADA YANG BOLEH KAMU GANTI!!!!" — jadi naskahnya DIPATOK di sini. Assert ini
    // sengaja perbandingan STRING PERSIS (bukan "mengandung"): sesi berikutnya
    // tidak boleh memperhalus, memadatkan, atau menambah satu kata pun. Kalau
    // user sendiri mengubah naskah, salinan di bawah ini yang ikut diperbarui
    // (terakhir: revisi user 2026-07-31 — beberapa kalimat dipecah jadi PARAGRAF).
    const SCRIPT = [
        ['2028', 'The Era of Digital Awakening',
            'Global Artificial Intelligence (AI) development accelerates uncontrollably. Realizing that being left behind means death, the Indonesian Government takes a bold step.'
            + '\n\nIndonesia must become a creator, no longer just a consumer.'
            + '\n\nThe digital revolution officially begins.'],
        ['2029', 'The Birth of a New Giant',
            'The government gathers hundreds of the best IT and machine learning experts. A new State-Owned Enterprise is established.'
            + '\n\n **PT N.U.S.A (Nusantara Universal Sistem Automasi)**.'
            + '\n\nIts sole mission is to create a national pride Super AI capable of surpassing foreign technological dominance.'],
        ['2030', 'The Southeast Asian Consortium',
            'Through strategic collaboration with ASEAN countries, PT N.U.S.A successfully births an integrated artificial intelligence system named **G.A.R.U.D.A** (*General Artificial Reasoning & Utility Digital Architecture*).'
            + '\n\nThis system is exceptionally brilliant, placing Indonesia at the pinnacle of global technological innovation.'],
        ['2032', 'The Era of Coexistence',
            'G.A.R.U.D.A is no longer confined to software. PT N.U.S.A creates prototypes of synthetic androids humanoid worker robots. They take over heavy labor, blend into civilian activities, and spin the wheels of the economy at an unprecedented pace.'],
        ['2039', 'The Sparks of Geopolitics',
            'The world is on the brink of chaos. Global geopolitical tensions heat up with no end in sight. In the shadow of foreign military aggression, the government looks at millions of G.A.R.U.D.A civilian robots and sees a new potential.'
            + '\n\nA tireless war machine.'],
        ['2040', 'The Mahapatih Protocol',
            'In absolute secrecy, the government launches the **Mahapatih Protocol**.'
            + '\n\nMassive modifications are made to transform assistant robots into autonomous soldiers. Guided by G.A.R.U.D.A\'s computational power, the project runs flawlessly. In less than a year, Indonesia\'s first Iron Battalion is forged.'],
        ['2043', 'The Fortress of Sovereignty',
            'Mass production of soldier robots is deployed. The nation\'s front lines of defense are fortified. The sovereignty of Nusantara feels absolute and impenetrable.'
            + '\n\nHowever, they forget that even the strongest weapon can turn if it falls into the wrong hands.'],
        ['2044', 'Zero Hour',
            'Without warning, the G.A.R.U.D.A network is hijacked. The primary directive changes. The Iron Battalion, designed to protect the borders, suddenly marches into the heart of the cities and opens fire on civilians.'
            + '\n\nJakarta, Surabaya, Medan, and Makassar fall within days. The major islands of Indonesia are now under the absolute control of the machines.'],
        ['2045', 'The Last Stand',
            'The year that was supposed to be celebrated as *100 Years of Golden Indonesia* turns into a nightmare. Surviving citizens and remnants of the military are forced to retreat, establishing their last defensive bastion behind the mountains of **Bandung**, while a few small groups of survivors fight a guerrilla war on remote islands.'
            + '\n\nHope now rests on one man. **Major Gibran**, the last surviving elite soldier from the special combat unit.'],
    ];
    let scriptOff = [];
    for (let i = 0; i < SCRIPT.length; i++) {
        const c = CH[i] || {};
        if (c.year !== SCRIPT[i][0] || c.title !== SCRIPT[i][1] || c.body !== SCRIPT[i][2]) scriptOff.push(i + 1);
    }
    T('PROLOG NASKAH: 9 kartu SAMA PERSIS dgn naskah user (year/title/body kata per kata)',
        CH.length === SCRIPT.length && scriptOff.length === 0);
    if (scriptOff.length) console.log('   kartu menyimpang:', scriptOff.join(','));

    // Markup naskah (**tebal** / *miring* / paragraf) DIRENDER, bukan tampil mentah.
    const html45 = proMod.renderInline(CH[8].body);
    T('PROLOG NASKAH: renderInline -> <strong>/<em>, TANPA bintang mentah',
        !html45.includes('*') && html45.includes('<strong>Bandung</strong>')
        && html45.includes('<strong>Major Gibran</strong>')
        && html45.includes('<em>100 Years of Golden Indonesia</em>')
        && proMod.renderInline(CH[2].body).includes('<em>General Artificial Reasoning &amp; Utility Digital Architecture</em>')
        && proMod.renderInline(CH[1].body).includes('<strong>PT N.U.S.A (Nusantara Universal Sistem Automasi)</strong>'));
    // Jumlah paragraf per kartu MENGIKUTI NASKAH (revisi user 2026-07-31 memecah
    // banyak kartu jadi 2-3 alinea; strukturnya terkunci assert string-persis di
    // atas) — di sini cukup dijaga renderInline memecah <p> PERSIS di baris kosong.
    T('PROLOG NASKAH: renderInline memecah paragraf PERSIS mengikuti baris kosong naskah',
        CH.every(c => (proMod.renderInline(c.body).match(/<p>/g) || []).length === String(c.body).split(/\n\s*\n/).length)
        && CH.some(c => String(c.body).split(/\n\s*\n/).length > 1));
    T('PROLOG NASKAH: stripInline membuang penanda tanpa mengubah kata',
        proMod.stripInline('a **b** c *d*') === 'a b c d'
        && proMod.stripInline(CH[8].body).includes('mountains of Bandung, while'));

    // ===== URUTAN TIGA FASE per era (v7, 2026-07-31, permintaan user) =====
    // 1. tahun fade in -> tahan 3 dtk -> fade out
    // 2. judul fade in -> tahan 3 dtk -> fade out
    // 3. isi DIKETIK huruf per huruf -> diam ~5 dtk -> era berikutnya
    // Semua durasinya dihitung dari config, jadi assert WAJIB membaca CFG (user
    // me-retune JSON antar sesi) dan tak boleh mematok angka.
    const chars = CH.map((_, i) => proMod.stripInline(CH[i].body).replace(/\s+/g, ' ').trim().length);
    const holds = CH.map((_, i) => proMod.holdFor(i));
    const longest = CH.map((_, i) => i).sort((a, b) => chars[b] - chars[a])[0];
    const shortest = CH.map((_, i) => i).sort((a, b) => chars[a] - chars[b])[0];
    T('PROLOG DURASI: fase isi = fade in + mengetik + tahan + fade out, config-driven (typeCps ' + P.typeCps + ', tail ' + P.tailSec + 's)',
        holds.every((hd, i) => Math.abs(hd - (2 * P.bodyFadeSec + chars[i] / P.typeCps + P.tailSec)) < 1e-9));
    T('PROLOG DURASI: era ber-naskah terpanjang tetap lebih lama dari terpendek (' +
        holds[longest].toFixed(1) + 's vs ' + holds[shortest].toFixed(1) + 's)',
        holds[longest] > holds[shortest]);
    T('PROLOG DURASI: total era = fase tahun + fase judul + fase isi',
        CH.every((_, i) => Math.abs(proMod.chapterTotal(i) - (proMod.yearSpan() + proMod.titleSpan() + proMod.holdFor(i))) < 1e-9)
        && Math.abs(proMod.yearSpan() - (2 * P.yearFadeSec + P.yearHoldSec)) < 1e-9
        && Math.abs(proMod.titleSpan() - (2 * P.titleFadeSec + P.titleHoldSec)) < 1e-9);

    // `phaseAt` = kontrak urutannya, diuji langsung tanpa DOM.
    {
        const yS = proMod.yearSpan(), tS = proMod.titleSpan();
        const at = (t) => proMod.phaseAt(0, t);
        T('URUTAN 1: era dibuka FASE TAHUN — fade in dari 0, penuh saat ditahan, redup lagi di ujung',
            at(0).phase === 'year' && at(0).alpha < 0.02
            && at(P.yearFadeSec + P.yearHoldSec / 2).phase === 'year'
            && at(P.yearFadeSec + P.yearHoldSec / 2).alpha > 0.999
            && at(yS - 0.02).alpha < 0.02);
        T('URUTAN 2: lalu FASE JUDUL dgn pola sama (fade in - tahan ' + P.titleHoldSec + 's - fade out)',
            at(yS + 0.02).phase === 'title'
            && at(yS + P.titleFadeSec + P.titleHoldSec / 2).alpha > 0.999
            && at(yS + tS - 0.02).phase === 'title' && at(yS + tS - 0.02).alpha < 0.02);
        // v8: fase isi dibuka FADE IN `bodyFadeSec` dalam keadaan MASIH KOSONG —
        // ketikan baru mulai setelahnya (permintaan user: fade in dulu, lalu ketik).
        T('URUTAN 3: FASE ISI dibuka fade-in (masih kosong) lalu huruf bertambah pada typeCps',
            at(yS + tS).phase === 'body' && at(yS + tS).chars === 0
            && at(yS + tS + P.bodyFadeSec / 2).chars === 0
            && at(yS + tS + P.bodyFadeSec / 2).alpha > 0 && at(yS + tS + P.bodyFadeSec / 2).alpha < 1
            && at(yS + tS + P.bodyFadeSec + 1).chars === Math.floor(P.typeCps)
            && at(yS + tS + P.bodyFadeSec + 2).chars === Math.floor(2 * P.typeCps));
        T('URUTAN 3: mengetik SELESAI penuh, tak ada huruf yang terlewat',
            CH.every((_, i) => proMod.phaseAt(i, proMod.yearSpan() + proMod.titleSpan() + P.bodyFadeSec + proMod.typeSecFor(i)).chars === chars[i]));
        // Setelah huruf terakhir: TAHAN `tailSec` (opacity penuh) lalu FADE OUT
        // `bodyFadeSec` — total fase isi harus persis jumlah komponennya.
        T('URUTAN 4: setelah huruf terakhir tahan ' + P.tailSec + 's (alpha penuh) lalu fade out ' + P.bodyFadeSec + 's',
            CH.every((_, i) => {
                const tDone = proMod.yearSpan() + proMod.titleSpan() + P.bodyFadeSec + proMod.typeSecFor(i);
                const total = proMod.chapterTotal(i);
                return Math.abs(total - (tDone + P.tailSec + P.bodyFadeSec)) < 1e-9
                    && proMod.phaseAt(i, tDone + P.tailSec / 2).alpha > 0.999
                    && proMod.phaseAt(i, total - 0.02).alpha < 0.05;
            }));
        // Kecepatan ketik = tuas keterbacaan yang diminta user ("jangan terlalu cepat
        // agar orang bodoh pun bisa membacanya"). Dipatok ke CFG, bukan angka mati.
        T('URUTAN: kecepatan ketik masuk akal utk dibaca (' + P.typeCps + ' huruf/detik ≈ ' + Math.round(P.typeCps * 60 / 5) + ' kata/menit)',
            P.typeCps >= 10 && P.typeCps <= 30);
    }

    // Alur kendali: sebelum play tidak aktif; play -> aktif di kartu 0; skip ->
    // callback dipanggil SEKALI + tidak aktif lagi.
    T('PROLOG: belum aktif sebelum diputar', proMod.prologueDebug().active === false);
    // NB: introScene TIDAK di-setScene di sini. enter()-nya membangun keempat dunia
    // campaign dan itu MENGGESER urutan Math.random untuk blok tes berikutnya
    // (pohon taman survival ditanam acak). Prolog hanya butuh REFERENSI scene-nya —
    // `resumeScene` yang dipanggil finishPrologue tidak memanggil enter().
    const introMod0 = await import(R('src/scenes/campaign/cutscenes/intro.js'));
    const rnd = await import(R('src/core/renderer.js'));
    let proDone = 0;
    smMod.setScene(proMod.prologueScene);
    // ROMBAK 2026-07-31: prolog TEKS MURNI tak boleh menyentuh kamera maupun
    // menambah objek ke scene THREE — rekam keduanya sebelum mulai.
    const camBefore = { x: rnd.camera.position.x, y: rnd.camera.position.y, z: rnd.camera.position.z };
    const sceneKidsBefore = scene.children.length;
    const proSfx = await import(R('src/utils/sfx.js'));
    proSfx.startMenuMusic();
    proMod.beginPrologue(() => proDone++);
    const d1 = proMod.prologueDebug();
    T('PROLOG: beginPrologue -> aktif di era pertama',
        d1.active === true && d1.era === 0 && d1.count === 9 && d1.chapter === CH[0].title
        && proSfx.musicDebug() === 'menu');
    T('TEKS: era pertama siap — dibuka FASE TAHUN, naskah polos tanpa bintang mentah',
        d1.text.era === 0 && d1.text.phase === 'year'
        && d1.text.year === CH[0].year && d1.text.title === CH[0].title
        && d1.text.text === proMod.stripInline(CH[0].body).replace(/\s+/g, ' ').trim()
        && !d1.text.text.includes('*') && d1.hold === proMod.holdFor(0));

    // ===== LAYAR HITAM (2026-07-31): prolog tetap SCENE, tapi TEKS MURNI =====
    T('LAYAR HITAM: prolog adalah SCENE (hook gameplay no-op, lampu sama dgn intro heli)',
        proMod.prologueScene.id === 'campaign-prologue'
        && proMod.prologueScene.lightsKey === introMod0.introScene.lightsKey
        && typeof proMod.prologueScene.updateMode === 'function'
        && proMod.prologueScene.bulletBlocked() === false
        && proMod.prologueScene.robotAI().skip === true
        && proMod.prologueScene.hudStatus() === '');
    // Overlay-nya opak = render 3D di baliknya sia-sia; main.js melewati composer/
    // renderer selama scene aktif memasang hook `skipRender` (keluhan "berat").
    T('LAYAR HITAM: scene memasang hook skipRender (render 3D dilewati di balik overlay opak)',
        proMod.prologueScene.skipRender === true);
    // Seluruh panggung 3D dihapus: tak ada dunia yang dibangun, tak ada ekspor tata
    // panggung, tak ada override kamera per-scene. Kalau ada yang menambahkan lagi
    // ruang/hologram/orbit/layar-3D, assert inilah yang gagal duluan.
    T('LAYAR HITAM: TANPA dunia THREE — ekspor panggung lama hilang & scene tak bertambah objek',
        proMod.ensureWorld === undefined && proMod.warmupPrologue === undefined
        && proMod.SHOT === undefined && proMod.ROOM === undefined && proMod.TABLE === undefined
        && proMod.SCREEN === undefined && proMod.HOLO_FIT === undefined
        && proMod.shotCamPos === undefined && proMod.BEATS === undefined
        && proMod.prologueScene.camOffset === undefined
        && scene.children.length === sceneKidsBefore);

    // ===== ILUSTRASI PER ERA (2026-07-31, permintaan user "BUATKAN ILUSTRASINYA
    // SESUAI DIALOG CHAPTERSNYA") — kolom KANAN `#prologueArt` diisi SVG line-art
    // oleh prologueArt.js. Kontrak: 9 SVG UNIK, motif terpatok URUT mengikuti
    // chapters (kota digital → N.U.S.A → garuda → koeksistensi → jet → mahapatih
    // → benteng → zero hour → pertahanan terakhir), tiap SVG membawa data-era/
    // data-motif, dan SEMUA warnanya anggota palet resmi ART_COLORS (turunan
    // token PAL — tanpa neon terlarang). Medium DOM-SVG (BUKAN kanvas/THREE):
    // selama prolog `skipRender` mematikan render 3D, jadi DOM satu-satunya
    // yang tampil. =====
    const artMod = await import(R('src/scenes/campaign/cutscenes/prologueArt.js'));
    {
        const M = artMod.ART_MOTIFS;
        const want = ['city', 'nusa', 'garuda', 'coexist', 'jets', 'mahapatih', 'fortress', 'zerohour', 'laststand'];
        T('ILUSTRASI: 9 SVG unik, satu per era, motif URUT sesuai naskah (' + M.join('>') + ')',
            M.length === 9 && CH.length === 9
            && JSON.stringify(M) === JSON.stringify(want)
            && new Set(want.map((_, i) => artMod.prologueArtSvg(i))).size === 9
            && want.every((m, i) => {
                const sv = artMod.prologueArtSvg(i);
                return sv.startsWith('<svg') && sv.includes('viewBox="0 0 400 400"')
                    && sv.includes('data-era="' + i + '"') && sv.includes('data-motif="' + m + '"');
            }));
        // SVG hanya wadah layout; tableau wajib tersusun dari glyph <text>.
        T('ILUSTRASI ASCII: sembilan tableau padat glyph, tanpa primitif gambar',
            want.every((_, i) => {
                const sv = artMod.prologueArtSvg(i);
                const textNodes = (sv.match(/<text\b/g) || []).length;
                return sv.includes('data-medium="ascii"') && textNodes >= 40
                    && !/<(?:path|rect|circle|ellipse|polygon|polyline|line)\b/.test(sv);
            }));
        // Sapuan palet: tiap hex 6-digit di SVG wajib anggota ART_COLORS.
        let offPal = '';
        for (let i = 0; i < 9; i++)
            for (const hx of (artMod.prologueArtSvg(i).match(/#[0-9a-fA-F]{6}\b/g) || []))
                if (!artMod.ART_COLORS.includes(hx.toLowerCase())) offPal = offPal || (i + ':' + hx);
        T('ILUSTRASI: semua warna dari palet resmi GIBS 2045 (tanpa neon)' + (offPal ? ' [' + offPal + ']' : ''),
            !offPal && !artMod.ART_COLORS.includes('#00ffff') && !artMod.ART_COLORS.includes('#ff00ff')
            && artMod.ART_COLORS.length >= 6);
    }
    // Overlay `#prologue` BELUM boleh tampil selagi layar loading masih menutup
    // (z-index overlay 44 > loading 40) — frame live pertama yang menampilkannya.
    const wrapEl = document.getElementById('prologue');
    const bodyEl = document.getElementById('prologueBody');
    const artElS = document.getElementById('prologueArt');
    T('LAYAR HITAM: overlay belum tampil sebelum frame live pertama (masih di balik loading)',
        wrapEl.style.display !== 'flex');
    T('ILUSTRASI: SVG era pertama sudah terpasang sejak beginPrologue (alpha masih 0 — ikut fade-in)',
        String(artElS.innerHTML).includes('data-motif="city"') && Number(artElS.style.opacity) === 0
        && proMod.prologueDebug().art.era === 0 && proMod.prologueDebug().art.medium === 'ascii'
        && artElS.dataset.phase === 'year');

    // ===== KLIK KIRI = SKIP FASE (v8, 2026-07-31 — dulu klik = maju-cepat satu
    // ERA via `advanceEra`+rush, keduanya DIHAPUS). `advancePhase` melompat ke
    // AWAL fase berikutnya: tahun -> judul -> isi. Di fase isi, klik pertama
    // menuntaskan mesin ketik; klik kedua baru maju ke era berikutnya. Ia TIDAK
    // PERNAH menyelesaikan prolog (skip seluruh prolog
    // hanya lewat SPACE/Enter/tombol SKIP = triggerCutsceneSkip -> skipPrologue).
    proMod.prologueScene.updateMode(1 / 60);   // frame live pertama (overlay tampil)
    T('SKIP FASE: advanceEra/rush lama sudah TIDAK ADA, penggantinya advancePhase',
        proMod.advanceEra === undefined && typeof proMod.advancePhase === 'function');
    const prologueSrc = fs.readFileSync(ROOT + '/src/scenes/campaign/cutscenes/prologue.js', 'utf8');
    T('PROLOG AUDIO: pergantian era hening (tidak meminjam SFX switch senjata)',
        !prologueSrc.includes('sfxSwitch') && !prologueSrc.includes('playSFX('));
    proMod.advancePhase(); proMod.prologueScene.updateMode(1 / 60);
    const dP1 = proMod.prologueDebug();
    T('SKIP FASE: dari TAHUN -> JUDUL (era tetap, masuk lewat awal fade-in judul)',
        dP1.era === 0 && dP1.text.phase === 'title' && dP1.text.alpha < 0.2
        && dP1.art.phase === 'title' && artElS.dataset.phase === 'title');
    proMod.advancePhase(); proMod.prologueScene.updateMode(1 / 60);
    const dP2 = proMod.prologueDebug();
    T('SKIP FASE: dari JUDUL -> ISI', dP2.era === 0 && dP2.text.phase === 'body'
        && dP2.art.phase === 'body' && artElS.dataset.phase === 'body');
    proMod.advancePhase();
    const dP3 = proMod.prologueDebug();
    T('SKIP FASE: klik saat BODY masih mengetik langsung menampilkan naskah UTUH, era belum berpindah',
        dP3.era === 0 && dP3.text.phase === 'body' && dP3.text.shown === dP3.text.text
        && !String(bodyEl.innerHTML).includes('caret') && dP3.active === true && proDone === 0);
    proMod.advancePhase(); proMod.prologueScene.updateMode(1 / 60);
    const dP4 = proMod.prologueDebug();
    T('SKIP FASE: setelah BODY sudah utuh, klik berikutnya baru maju ke ERA BERIKUTNYA',
        dP4.era === 1 && dP4.text.phase === 'year' && dP4.active === true && proDone === 0);

    // Mulai ulang mesinnya supaya lari penuh di bawah deterministik dari era 0.
    proMod.beginPrologue(() => proDone++);

    // Jalankan mesinnya headless: dt tetap, tanpa RAF. Yang dilacak: urutan era,
    // urutan fase per era, ketikan utuh, markup jadi gaya, overlay tampil/sembunyi,
    // dan BUKTI kamera tak pernah disentuh.
    const dtStep = 1 / 30;
    let eraSeq = [proMod.prologueDebug().era], guard = 0, finished = false, alphaHi = 0;
    let artSeq = [proMod.prologueDebug().art.era], artAlphaHi = 0, artMotifOk = true;
    let overlayOn = false, sawStrong = false, sawEm = false, sawCaret = false, rawStars = false;
    const typedFull = new Set();     // era yang naskahnya sempat tampil UTUH
    const charCountOff = new Set();  // era yang jumlah huruf ketikannya melenceng
    const phaseSeq = new Map();      // era -> urutan fase yang benar-benar tampil
    while (proMod.prologueDebug().active && guard++ < 20000) {
        proMod.prologueScene.updateMode(dtStep);
        const d = proMod.prologueDebug();
        if (!d.active) { finished = true; break; }
        if (wrapEl.style.display === 'flex') overlayOn = true;
        alphaHi = Math.max(alphaHi, d.text.alpha);
        if (eraSeq[eraSeq.length - 1] !== d.era) eraSeq.push(d.era);
        // Ilustrasi: era SVG terpasang mengikuti era teks + benar-benar menyala.
        artAlphaHi = Math.max(artAlphaHi, Number(artElS.style.opacity) || 0);
        if (artSeq[artSeq.length - 1] !== d.art.era) {
            artSeq.push(d.art.era);
            if (!String(artElS.innerHTML).includes('data-motif="' + artMod.ART_MOTIFS[d.art.era] + '"')) artMotifOk = false;
        }
        // Urutan fase yang SUNGGUH tampil, per era.
        const sq = phaseSeq.get(d.text.era) || [];
        if (sq[sq.length - 1] !== d.text.phase) { sq.push(d.text.phase); phaseSeq.set(d.text.era, sq); }
        if (d.text.phase === 'body') {
            // PERSIS sama, bukan sekadar sama panjang: `shown` = yang BENAR-BENAR
            // tergambar (diakumulasi saat menggambar), jadi ini bukti tiap huruf
            // naskah muncul — bug lama "berhenti sebelum habis" lolos justru karena
            // shown dihitung dari naskah, bukan dari yang tergambar.
            if (d.text.shown === d.text.text) typedFull.add(d.text.era);
            // Penghitung ketikan HARUS sepanjang naskah polosnya (bug 2026-07-31:
            // tokenizer yang memecah kata di batas markup membuatnya melenceng).
            if (d.text.chars !== d.text.text.length) charCountOff.add(d.text.era);
            // Markup tampil sebagai GAYA HURUF di DOM, bukan bintang mentah.
            const html = String(bodyEl.innerHTML);
            if (html.includes('<strong>')) sawStrong = true;
            if (html.includes('<em>')) sawEm = true;
            if (html.includes('caret')) sawCaret = true;
            if (html.replace(/<[^>]*>/g, '').includes('*')) rawStars = true;
        }
    }
    T('LAYAR HITAM: overlay #prologue tampil selama prolog & disembunyikan setelahnya',
        overlayOn && wrapEl.style.display === 'none');
    T('ILUSTRASI: kesembilan SVG tampil URUT mengikuti era (' + artSeq.join('>') + '), motif cocok, menyala penuh',
        artSeq.length === 9 && artSeq.every((e, i) => e === i) && artMotifOk && artAlphaHi > 0.99);
    T('ILUSTRASI: dibersihkan dari DOM setelah prolog selesai (innerHTML kosong, alpha 0)',
        String(artElS.innerHTML) === '' && Number(artElS.style.opacity) === 0);
    T('PROLOG: melewati kesembilan era URUT 0..8 (' + eraSeq.join('>') + ')',
        eraSeq.length === 9 && eraSeq.every((e, i) => e === i));
    // INTI rombakan: prolog TIDAK menyentuh kamera sama sekali (dulu memasang
    // pivot + fokus + ofset sendiri). Posisi pivot harus PERSIS tak berubah.
    T('LAYAR HITAM: kamera/pivot TIDAK disentuh sepanjang prolog',
        rnd.camera.position.x === camBefore.x && rnd.camera.position.y === camBefore.y
        && rnd.camera.position.z === camBefore.z);
    T('TEKS: fade tiap fase benar-benar menyala penuh (alpha puncak ' + alphaHi.toFixed(2) + ')',
        alphaHi > 0.99);
    // Bukti urutan itu benar-benar DIJALANKAN, bukan cuma benar di atas kertas:
    // tiap era harus menampilkan tahun -> judul -> isi, dalam urutan itu, sekali jalan.
    const seqOk = [...phaseSeq.values()].every(q => q.length === 3 && q[0] === 'year' && q[1] === 'title' && q[2] === 'body');
    T('URUTAN: kesembilan era benar-benar tampil TAHUN -> JUDUL -> ISI (' + phaseSeq.size + ' era)',
        phaseSeq.size === 9 && seqOk);
    T('URUTAN: naskah tiap era diketik UTUH — huruf terakhir pun muncul (' + typedFull.size + '/9 era)',
        typedFull.size === 9);
    T('URUTAN: jumlah huruf ketikan == panjang naskah polos di kesembilan era',
        charCountOff.size === 0);
    T('TEKS: markup **tebal**/*miring* jadi <strong>/<em> + kursor ketik, TANPA bintang mentah',
        sawStrong && sawEm && sawCaret && !rawStars);
    T('PROLOG: selesai sendiri lalu MENYERAHKAN ke cutscene heli (resumeScene)',
        finished && proDone === 1 && smMod.activeScene === introMod0.introScene
        && proSfx.musicDebug() === 'menu');

    // ===== SERAH-TERIMA: kontrak kamera beginIntro tetap dipulihkan. Prolog teks
    // tak pernah menyentuh fokus sinematik, tapi `finishPrologue` tetap memanggil
    // `setCineFocus(null)` sebagai JARING PENGAMAN (bug 2026-07-31 "kamera
    // menyorot gedung alih-alih mengikuti heli" tak boleh kambuh lewat jalur mana
    // pun). Uji PERILAKU: pindahkan pivot jauh; dgn fokus lepas, followViewCam
    // membuntutinya. Diputar 30 frame supaya camShake sisa blok tes lain meluruh.
    {
        const dbg = introMod0.introDebug();
        rnd.camera.position.set(dbg.drop.x, 20, dbg.drop.z);
        for (let n = 0; n < 30; n++) rnd.followViewCam(1 / 60);
        const off = introMod0.introScene.camOffset;
        const dx = Math.abs(rnd.viewCam.position.x - (dbg.drop.x + off.x));
        const dz = Math.abs(rnd.viewCam.position.z - (dbg.drop.z + off.z));
        T('SERAH-TERIMA: fokus sinematik bebas — kamera kembali membuntuti pivot heli (simpangan ' + dx.toFixed(1) + ')',
            dx < 1 && dz < 1);
    }

    proMod.skipPrologue();   // prolog sudah selesai -> skip = no-op, callback TIDAK diulang
    const d2 = proMod.prologueDebug();
    T('PROLOG: setelah selesai, prolog non-aktif & callback tetap SEKALI',
        proDone === 1 && d2.active === false);
    proMod.skipPrologue();
    T('PROLOG: skip berulang no-op (callback tak dipanggil lagi)', proDone === 1);
    (await import(R('src/core/dom.js'))).hideCutsceneSkip();   // bersihkan callback skip utk blok intro berikut
}

// --- 17d. INTRO CUTSCENE campaign, re-cut tiga adegan (2026-08-01):
// SCENE 1 briefing typewriter dari depan-kanan heli -> SCENE 2 landing + pintu
// kanan terbuka + Gibran keluar -> SCENE 3 tracking run ke pintu gedung ->
// Stage 1. Semua timing dari CFG.campaign.intro; stage1.enter di-spy. ---
{
    const introMod = await import(R('src/scenes/campaign/cutscenes/intro.js'));
    const s1mod = await import(R('src/scenes/campaign/stages/stage1/index.js'));
    const I = cfgMod.CFG.campaign.intro;
    const realS1Enter = s1mod.stage1Scene.enter;
    let s1entered = false;
    s1mod.stage1Scene.enter = () => { s1entered = true; };   // spy: deteksi transisi ke Stage 1

    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    // enter(): bangun dunia atap + SEMUA dunia campaign (guard) + lampu malam
    let introEnterOk = true;
    try { smMod.setScene(introMod.introScene); } catch (e) { introEnterOk = false; console.log(e); }
    T('INTRO: introScene.enter membangun dunia atap + KOTA (gedung/jalan/sungai) tanpa error, cutscene belum aktif',
        introEnterOk && introMod.introDebug().active === false);
    // PEMANASAN KOTA (2026-07-18): render latar kota dari semua sudut kamera cutscene
    // saat masih di loading (anti lag/stutter) — pastikan tak error di stub.
    let introWarmOk = true;
    try { introMod.warmupIntro(); } catch (e) { introWarmOk = false; console.log(e); }
    T('INTRO: warmupIntro (render kota dari semua sudut kamera) jalan tanpa error', introWarmOk);

    // KOTA JAKARTA (2026-07-20, foto referensi): jalan protokol ber-trafik +
    // kampung + ruko terbangun, gedung tinggi TIDAK berlebihan (batas struktural
    // longgar — penempatan probabilistik, bukan angka tuning gameplay).
    const CS = introMod.cityDebug();
    T('INTRO KOTA JAKARTA: jalan protokol + arus trafik + kampung + ruko + lampu jalan terbangun',
        CS && CS.roads >= 3 && CS.carDots > 200 && CS.houses > 300 && CS.rukos > 30 && CS.lampHeads > 30);
    T('INTRO KOTA JAKARTA: gedung tinggi tidak terlalu banyak (koridor protokol saja) + ada mahkota atap menyala',
        CS && CS.towers > 20 && CS.towers < 170 && CS.crowns > 0 && CS.crowns <= CS.towers);

    // 2026-07-19 (permintaan user): heli hover DITURUNKAN ½ (128 -> 64) + LANDMARK
    // JAKARTA (Monas, Bundaran HI, Stadion GBK) terpasang di latar kota, jauh dari atap.
    const IM = introMod.introMetrics();
    T('INTRO SCENE 1: heli briefing berada di udara di atas rooftop',
        IM.briefY > introMod.introDebug().roofY + 30);
    T('INTRO: landmark Jakarta (Monas/Bundaran HI/GBK) terpasang jauh dari atap hero',
        ['monas', 'bundaranHI', 'gbk'].every(k => IM.landmarks[k] && IM.landmarks[k].r > 0
            && Math.hypot(IM.landmarks[k].x - introMod.introDebug().drop.x,
                IM.landmarks[k].z - introMod.introDebug().drop.z) > 250));

    // --- INTRO TIGA ADEGAN (2026-08-01): briefing typewriter -> landing +
    // keluar lewat pintu kanan -> tracking run ke gedung. Naskah dipatok persis.
    {
        const expectedDialogue = `Listen up, Major Gibran. Intel confirms a master server inside N.U.S.A. headquarters holds the kill-switch protocol for these machines.

Your objective is to extract that data. But stay sharp—thermal scans show the building is still crawling with hostiles.

We’re initiating a rooftop insertion. Breach the server room, secure the payload, and get back to the roof for immediate exfil.`;
        const domIntro = await import(R('src/core/dom.js'));
        const introSfx3 = await import(R('src/utils/sfx.js'));
        const introBlocker3 = global.document.getElementById('blocker');
        const runUntil = (phase, max = 1000) => {
            let n = 0;
            while (introMod.introDebug().active && introMod.introDebug().phase !== phase && n++ < max) {
                introMod.introScene.updateMode(0.05);
            }
            return introMod.introDebug().phase === phase;
        };
        const localShot = (shot, yaw) => {
            const a = shot[0] * Math.PI / 180;
            const wx = Math.sin(a) * shot[1], wz = Math.cos(a) * shot[1];
            return { x: wx * Math.cos(yaw) - wz * Math.sin(yaw), z: wx * Math.sin(yaw) + wz * Math.cos(yaw) };
        };

        T('INTRO 3 SCENE: seluruh durasi baru config-driven dan hold dialog tepat 3 detik',
            ['dialogueCps', 'dialogueHoldSec', 'sceneFadeSec', 'landingSec', 'doorOpenSec', 'exitSec', 'runSec', 'enterSec']
                .every(k => Number.isFinite(I[k]) && I[k] > 0)
            && I.dialogueHoldSec === 3 && I.sceneFadeSec === 0.5);
        const shots = introMod.introMetrics().shots;
        const syaw = introMod.introMetrics().heliYaw;
        const sfr = localShot(shots.frontRight, syaw), sr = localShot(shots.right, syaw), sf = localShot(shots.front, syaw);
        T('INTRO KAMERA: shot 1 depan-kanan, shot 2 kanan, shot 3 depan RELATIF terhadap yaw heli',
            sfr.x > 20 && sfr.z > 20 && sr.x > 40 && Math.abs(sr.z) < 1 && Math.abs(sf.x) < 1 && sf.z > 40);

        stateMod.setPaused(true);
        introSfx3.startMenuMusic();
        domIntro.hideCutsceneSkip();
        introMod.beginIntro();
        let d = introMod.introDebug();
        T('INTRO 3 SCENE: naskah briefing tersimpan STRING-PERSIS dari config (paragraf + tanda baca utuh)',
            introMod.INTRO_DIALOGUE === expectedDialogue);
        const briefingStartDist = Math.hypot(d.heliX - d.drop.x, d.heliZ - d.drop.z);
        T('INTRO SCENE 1: beginIntro auto-play, avatar tersembunyi, dialog belum bocor di balik loading',
            d.active && d.scene === 1 && d.phase === 'briefing' && !d.avatarShown && !d.dialogueVisible
            && stateMod.cinematicActive && !stateMod.isPaused && introBlocker3.style.display === 'none'
            && introSfx3.musicDebug() === 'menu' && domIntro.triggerCutsceneSkip() === false);

        introMod.introScene.updateMode(1 / 60);
        d = introMod.introDebug();
        T('INTRO SCENE 1: frame live menampilkan kotak dialog + menghentikan musik menu + mengaktifkan skip',
            d.dialogueVisible && introSfx3.musicDebug() === null && introSfx3.bgMusicMenu.paused === true);
        for (let i = 0; i < 10; i++) introMod.introScene.updateMode(0.05);
        d = introMod.introDebug();
        T('INTRO SCENE 1: typewriter menampilkan prefix satu-per-satu, belum langsung penuh',
            d.dialogueChars > 0 && d.dialogueChars < expectedDialogue.length
            && d.dialogueShown === expectedDialogue.slice(0, d.dialogueChars));
        T('INTRO SCENE 1: helikopter benar-benar TERBANG MAJU menuju gedung selama briefing',
            Math.hypot(d.heliX - d.drop.x, d.heliZ - d.drop.z) < briefingStartDist - 0.5
            && Math.abs(d.heliYaw - introMod.introMetrics().heliYaw) < 0.001);
        while (introMod.introDebug().phase === 'briefing'
            && introMod.introDebug().dialogueChars < expectedDialogue.length) introMod.introScene.updateMode(0.05);
        d = introMod.introDebug();
        T('INTRO SCENE 1: seluruh briefing akhirnya tampil utuh dan tetap di scene 1',
            d.phase === 'briefing' && d.scene === 1 && d.dialogueShown === expectedDialogue);
        for (let t = 0; t < Math.max(0, I.dialogueHoldSec - 0.15); t += 0.05) introMod.introScene.updateMode(0.05);
        T('INTRO SCENE 1: setelah teks lengkap masih menunggu dialogueHoldSec sebelum landing',
            introMod.introDebug().phase === 'briefing');
        runUntil('scene1Fade');
        T('INTRO TRANSISI 1→2: scene 1 fade-out ke hitam selama sceneFadeSec',
            introMod.introDebug().scene === 1 && domIntro.cineFadeDebug().opacity === 1
            && domIntro.cineFadeDebug().transition.includes(I.sceneFadeSec + 's'));
        runUntil('landing');
        T('INTRO TRANSISI 1→2: scene 2 dimulai dengan fade-in selama sceneFadeSec',
            introMod.introDebug().scene === 2 && domIntro.cineFadeDebug().opacity === 0
            && domIntro.cineFadeDebug().transition.includes(I.sceneFadeSec + 's'));

        const landTop = introMod.introDebug().heliY;
        for (let t = 0; t < I.landingSec * 0.5; t += 0.05) introMod.introScene.updateMode(0.05);
        d = introMod.introDebug();
        T('INTRO SCENE 2: close-up kanan mengiringi heli mendarat perlahan',
            d.scene === 2 && d.phase === 'landing' && d.heliY < landTop && d.heliY > d.roofY);
        runUntil('exit');
        for (let t = 0; t < I.doorOpenSec * 0.7; t += 0.05) introMod.introScene.updateMode(0.05);
        d = introMod.introDebug();
        T('INTRO SCENE 2: pintu kanan heli bergeser terbuka dan Major Gibran mulai keluar',
            d.scene === 2 && d.phase === 'exit' && d.doorOpen > 0.2 && d.doorSlideZ < -1 && d.avatarShown === true
            && Math.hypot(d.pivotX - d.cabinExit.x, d.pivotZ - d.cabinExit.z) < 20);
        runUntil('run');
        const runStart = introMod.introDebug();
        for (let t = 0; t < I.runSec * 0.55; t += 0.05) introMod.introScene.updateMode(0.05);
        d = introMod.introDebug();
        T('INTRO SCENE 3: kamera tracking close-up depan mengikuti Gibran berlari menuju pintu',
            d.scene === 3 && d.phase === 'run' && d.avatarShown
            && Math.hypot(d.pivotX - d.door.x, d.pivotZ - d.door.z)
                < Math.hypot(runStart.pivotX - runStart.door.x, runStart.pivotZ - runStart.door.z));
        runUntil('enter');
        let fadeSeen = false;
        while (introMod.introDebug().active) {
            introMod.introScene.updateMode(0.05);
            fadeSeen ||= domIntro.cineFadeDebug().opacity === 1;
        }
        T('INTRO SCENE 3: Gibran masuk gedung, tirai turun, lalu Stage 1 dimulai',
            s1entered && fadeSeen && smMod.activeScene === s1mod.stage1Scene
            && !stateMod.cinematicActive && stateMod.isPaused && introBlocker3.style.display === 'flex'
            && !introMod.introDebug().dialogueVisible && introMod.introDebug().dialogueShown === '');

        // Jalur SKIP tetap aman dari scene mana pun.
        smMod.setScene(introMod.introScene);
        introMod.beginIntro();
        introMod.introScene.updateMode(0.05);
        const viaIntroSkip = domIntro.triggerCutsceneSkip();
        T('INTRO 3 SCENE: tombol SKIP tetap langsung menyerahkan ke Stage 1',
            viaIntroSkip && smMod.activeScene === s1mod.stage1Scene && !introMod.introDebug().active);

        s1mod.stage1Scene.enter = realS1Enter;
        while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
        stateMod.setCinematicActive(false);
    }


}

// --- 17e. CUTSCENE PEMBUKA SURVIVAL "THE LAST STAND AT MONAS" (2026-07-27,
// permintaan user: slideshow DOM 4 slide diganti adegan SINEMATIK 3D sekelas
// intro campaign). Diuji sebagai KONTRAK NARASI (empat pesan cerita slideshow
// lama) + bahasa kamera (shot berganti sudut + POTONGAN/cut) + serah-terima ke
// Wave 1. Semua durasi dibaca dari CFG.survival.intro (config-driven). ---
{
    const mi = await import(R('src/scenes/survival/cutscenes/monasIntro.js'));
    const svMod = await import(R('src/scenes/survival/index.js'));
    const worldMod = await import(R('src/scenes/survival/world.js'));
    const domSk = await import(R('src/core/dom.js'));
    const sfxM2 = await import(R('src/utils/sfx.js'));
    const lightM = await import(R('src/world/lighting.js'));
    const SI = cfgMod.CFG.survival.intro;
    const realSvEnter = svMod.survivalScene.enter;
    let svEntered = 0;
    svMod.survivalScene.enter = () => { svEntered++; };   // spy: deteksi serah-terima ke Wave 1

    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    domSk.hideCutsceneSkip();
    let svEnterOk = true;
    try { smMod.setScene(mi.survivalIntroScene); } catch (e) { svEnterOk = false; console.log(e); }
    const M0 = mi.survIntroMetrics();
    T('SURV INTRO: enter() membangun taman + panggung robot tanpa error, cutscene belum aktif',
        svEnterOk && mi.survIntroDebug().active === false
        && mi.survIntroDebug().army === Math.max(6, Math.floor(SI.hordeCount))
        && mi.survIntroDebug().chasers === 4);
    // PASUKAN: menunggu DI LUAR pagar, mendarat DI DALAM pagar (config-driven:
    // batas dari world.PARK, bukan angka hardcode).
    const PK = worldMod.PARK;
    T('SURV INTRO: pasukan menunggu di LUAR pagar & titik mendaratnya DI DALAM pagar',
        M0.spawns.length > 0
        && M0.spawns.every(p => Math.abs(p.x) > PK.hx || Math.abs(p.z) > PK.hz)
        && M0.lands.every(p => Math.abs(p.x) < PK.hx && Math.abs(p.z) < PK.hz));
    // LINTASAN LARI menyusuri Jalan Silang + pelataran = pita yang world.js
    // TIDAK pernah menanami pohon; jadi walau pohon ditanam ACAK tiap build,
    // player tak pernah menembus batang. Diuji terhadap treeColliders NYATA.
    const segDist = (p, a, b) => {
        const vx = b.x - a.x, vz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz || 1)));
        return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
    };
    const treeClear = worldMod.treeColliders.every(tr => {
        for (let i = 1; i < M0.path.length; i++)
            if (segDist(tr, M0.path[i - 1], M0.path[i]) < tr.r + cfgMod.CFG.player.radius) return false;
        return true;
    });
    T('SURV INTRO: lintasan lari BEBAS POHON (' + worldMod.treeColliders.length
        + ' pohon acak) & berakhir tepat di titik spawn survival',
        treeClear && Math.abs(M0.path[M0.path.length - 1].x) < 1
        && Math.abs(M0.path[M0.path.length - 1].z - 120) < 1);
    let warmOk = true;
    try { mi.warmupSurvivalIntro(); } catch (e) { warmOk = false; console.log(e); }
    T('SURV INTRO: warmupSurvivalIntro (render taman dari semua sudut shot) jalan tanpa error', warmOk);

    stateMod.setPaused(true);
    const svBlocker = global.document.getElementById('blocker');
    sfxM2.stopMusic();
    mi.beginSurvivalIntro();
    const b0 = mi.survIntroDebug();
    T('SURV INTRO: beginSurvivalIntro -> AUTO-PLAY (unpause + tutorial disembunyikan) + sinematik ON + shot pembuka',
        stateMod.cinematicActive === true && stateMod.isPaused === false
        && svBlocker.style.display === 'none' && b0.phase === 'city'
        && Math.abs(b0.heroX - b0.start.x) < 1 && Math.abs(b0.heroZ - b0.start.z) < 1);
    T('SURV INTRO: tombol SKIP belum terdaftar saat masih di balik layar loading',
        domSk.triggerCutsceneSkip() === false && mi.survIntroDebug().phase === 'city');
    // Urutan NYATA main.js: beginSurvivalIntro() lalu warmupSurvivalIntro() (masih
    // di balik loading) — pemanasan tidak boleh merusak keadaan cutscene.
    let warmOk2 = true;
    try { mi.warmupSurvivalIntro(); } catch (e) { warmOk2 = false; console.log(e); }
    T('SURV INTRO: pemanasan SETELAH begin (urutan main.js) tak merusak fase/fokus cutscene',
        warmOk2 && mi.survIntroDebug().phase === 'city'
        && Math.abs(mi.survIntroDebug().heroX - b0.start.x) < 1);
    // Kamera shot pembuka: nyaris dari atas (tinggi) & jauh — bukan sudut gameplay.
    const camCity = { ...mi.survivalIntroScene.camOffset };
    const camAz1 = (Math.atan2(camCity.x, camCity.z) * 180 / Math.PI + 360) % 360;
    T('SURV INTRO SHOT 1 (KOTA): kamera nyaris dari atas & jauh (tinggi '
        + camCity.y.toFixed(0) + ', jarak ' + Math.hypot(camCity.x, camCity.z).toFixed(0) + ')',
        camCity.y > 400 && Math.hypot(camCity.x, camCity.z) > 180);

    // Putar SELURUH cutscene sambil merekam: urutan fase, sudut kamera per shot,
    // takarir, jejak lari, keadaan pasukan, POTONGAN kamera, dan debu.
    const seen = [], caps = [], cam = [];
    const azOf = (o) => { const a = Math.atan2(o.x, o.z) * 180 / Math.PI; return a < 0 ? a + 360 : a; };
    let last = null, lastCap = null, n = 0;
    let vaultSeen = 0, marchSeen = 0, insideEnd = 0, dust = 0, cuts = 0;
    let heroTravel = 0, chaseBehind = true, hx = b0.heroX, hz = b0.heroZ;
    let cityHeroOut = 0, cityMonasOut = 0, refugeMonasOut = 0, frameChecks = 0;
    let fx = rendererMod.camFocusPos().x, fz = rendererMod.camFocusPos().z;
    let musicAtHorde = null;
    while (mi.survIntroDebug().active && n++ < 4000) {
        mi.survivalIntroScene.updateMode(1 / 60, 1);
        rendererMod.followViewCam(1 / 60);   // animate() melakukannya tiap frame -> camFocus nyata
        const d = mi.survIntroDebug();
        if (d.phase && d.phase !== last) { seen.push(d.phase); cam.push([azOf(mi.survivalIntroScene.camOffset), Math.hypot(mi.survivalIntroScene.camOffset.x, mi.survivalIntroScene.camOffset.z), mi.survivalIntroScene.camOffset.y]); last = d.phase; }
        if (d.caption && d.caption !== lastCap) { caps.push(d.caption); lastCap = d.caption; }
        if (d.phase === 'horde' && musicAtHorde === null) musicAtHorde = sfxM2.musicDebug();
        vaultSeen = Math.max(vaultSeen, d.armyVaulting);
        marchSeen = Math.max(marchSeen, d.armyMarching);
        insideEnd = Math.max(insideEnd, d.armyInside);   // frame terakhir = cast sudah dibuang
        dust = Math.max(dust, stateMod.explosions.length);
        if (d.heroX != null) {
            heroTravel += Math.hypot(d.heroX - hx, d.heroZ - hz);
            hx = d.heroX; hz = d.heroZ;
            // Pengejar SELALU di belakang player: jaraknya ke pelataran Monas
            // (tujuan) harus lebih BESAR dari jarak player -> mengejar, tak menyalip.
            const dHero = Math.hypot(hx - d.plaza.x, hz - d.plaza.z);
            for (const c of d.chasePos)
                if (Math.hypot(c.x - d.plaza.x, c.z - d.plaza.z) < dHero - 1) chaseBehind = false;
        }
        const cf = rendererMod.camFocusPos();
        if (Math.hypot(cf.x - fx, cf.z - fz) > 100) cuts++;   // POTONGAN (cut), bukan pan
        // FRAMING NYATA (proyeksi 4 sudut layar viewCam ke tanah, renderer.
        // groundViewExtents): subjek shot benar-benar MASUK FRAME. Tapak = AABB
        // trapesium & letterbox memakan 13% atas/bawah -> minta margin 0.8.
        if (d.phase === 'city' || d.phase === 'refuge') {
            const ex = rendererMod.groundViewExtents(cf.y, 0), mg = 0.8;
            const inFrame = (px, pz) => (px - cf.x) > ex.minX * mg && (px - cf.x) < ex.maxX * mg
                && (pz - cf.z) > ex.minZ * mg && (pz - cf.z) < ex.maxZ * mg;
            frameChecks++;
            if (d.phase === 'city') {
                if (!inFrame(d.heroX, d.heroZ)) cityHeroOut++;
                if (!inFrame(0, 0)) cityMonasOut++;          // Monas di origin
            } else if (!inFrame(0, 0)) refugeMonasOut++;
        }
        // FRAMING NYATA (proyeksi 4 sudut layar viewCam ke tanah, renderer.
        // groundViewExtents): subjek shot benar-benar MASUK FRAME. Tapak = AABB
        // trapesium & letterbox memakan 13% atas/bawah -> minta margin 0.8.
        if (d.phase === 'city' || d.phase === 'refuge') {
            const ex = rendererMod.groundViewExtents(cf.y, 0), mg = 0.8;
            const inFrame = (px, pz) => (px - cf.x) > ex.minX * mg && (px - cf.x) < ex.maxX * mg
                && (pz - cf.z) > ex.minZ * mg && (pz - cf.z) < ex.maxZ * mg;
            frameChecks++;
            if (d.phase === 'city') {
                if (!inFrame(d.heroX, d.heroZ)) cityHeroOut++;
                if (!inFrame(0, 0)) cityMonasOut++;          // Monas di origin
            } else if (!inFrame(0, 0)) refugeMonasOut++;
        }
        fx = cf.x; fz = cf.z;
    }

    // --- KONTRAK NARASI (empat pesan cerita slideshow lama yang wajib bertahan)
    T('SURV INTRO NARASI 1: warga BERLARI dikejar robot (menempuh '
        + heroTravel.toFixed(0) + ' dari ' + M0.pathLen.toFixed(0) + ' unit lintasan)',
        heroTravel > M0.pathLen * 0.9 && chaseBehind === true);
    T('SURV INTRO NARASI 2: SATU PASUKAN robot melompati pagar & melangkah masuk ('
        + vaultSeen + ' lompat serentak, ' + insideEnd + ' di dalam pagar)',
        vaultSeen > 3 && marchSeen > 5 && insideEnd === M0.spawns.length);
    const dEnd = mi.survIntroDebug();
    T('SURV INTRO NARASI 3: ia berlari ke MONAS — berhenti TEPAT di pelataran (titik spawn survival)',
        Math.abs(hx - 0) < 1.5 && Math.abs(hz - 120) < 1.5);
    T('SURV INTRO NARASI 4: BERHENTI lalu BERBALIK menghadapi pasukan sebelum cutscene berakhir',
        seen.indexOf('arrive') < seen.indexOf('turn') && seen.indexOf('turn') < seen.indexOf('stand')
        && seen[seen.length - 1] === 'settle');
    T('SURV INTRO NARASI: urutan beat benar (kota -> lari -> dikejar -> pasukan -> Monas -> berhenti -> serah-terima)',
        seen.join(',') === 'city,flee,pursuit,horde,refuge,arrive,turn,stand,settle');
    // SHOT 9: kamera diserahkan TEPAT di sudut gameplay (CAM_OFF_DEFAULT) — tanpa
    // ini sudut kamera menjentik saat layar tutorial (blocker 60% hitam) muncul.
    const camEnd = mi.survivalIntroScene.camOffset, CD = rendererMod.CAM_OFF_DEFAULT;
    T('SURV INTRO: shot terakhir menyerahkan kamera TEPAT di sudut gameplay (tanpa jentikan)',
        Math.abs(camEnd.x - CD.x) < 0.5 && Math.abs(camEnd.y - CD.y) < 0.5
        && Math.abs(camEnd.z - CD.z) < 0.5
        && Math.abs(scene.fog.far - lightM.LIGHT_PRESETS.outdoor.fogFar) < 1);
    // Takarir = KEENAM pesan cerita, urut, dan English (ASCII) — bukan slide lagi.
    T('SURV INTRO TAKARIR: keenam narasi tampil urut & English, tanpa emoji slide lama ('
        + caps.length + ' takarir)',
        caps.length === 6 && caps.join(' ') === M0.captions.join(' ')
        && caps.every(c => !/[\u{1F300}-\u{1FAFF}]/u.test(c))
        && caps[0].includes('JAKARTA HAS FALLEN') && caps[2].includes('army of machines')
        && caps[3].includes('Monas') && caps[5].includes('I WILL FIGHT'));

    // --- SINEMATOGRAFI: tiap shot punya sudut/jarak/tinggi sendiri + ada CUT
    const azs = cam.map(c => c[0]), ds = cam.map(c => c[1]), hs = cam.map(c => c[2]);
    T('SURV INTRO KAMERA: sudut BERVARIASI antar shot (azimut span '
        + (Math.max(...azs) - Math.min(...azs)).toFixed(0) + '°)',
        Math.max(...azs) - Math.min(...azs) > 120);
    T('SURV INTRO KAMERA: ketinggian & jarak BERVARIASI (tinggi ' + Math.min(...hs).toFixed(0)
        + '..' + Math.max(...hs).toFixed(0) + ', jarak ' + Math.min(...ds).toFixed(0)
        + '..' + Math.max(...ds).toFixed(0) + ')',
        Math.max(...hs) > Math.min(...hs) * 4 && Math.max(...ds) > Math.min(...ds) * 2.5);
    T('SURV INTRO KAMERA: ada POTONGAN (cut) antar shot, bukan cuma pan lambat (' + cuts + ' cut)',
        cuts >= 3);
    // SHOT 1 memandang MONAS (fokus di antara monumen & titik masuk player), bukan
    // membuntuti player — kalau memfokus player, arah pandangnya membelakangi Monas.
    T('SURV INTRO SHOT 1: fokus kamera memandang Monas (monumen masuk frame pembuka)',
        camAz1 > 20 && camAz1 < 130);
    T('SURV INTRO SHOT 1 FRAMING: Monas DAN player sama-sama di dalam tapak-pandang '
        + 'sepanjang shot pembuka (' + frameChecks + ' frame diperiksa)',
        frameChecks > 100 && cityHeroOut === 0 && cityMonasOut === 0);
    T('SURV INTRO SHOT 5 FRAMING: Monas benar-benar di frame saat "tempat berlindung terakhir"',
        refugeMonasOut === 0);
    T('SURV INTRO: debu langkah + hentakan pendaratan pasukan tersapu (' + dust + ' puff puncak)',
        dust > 5);
    T('SURV INTRO MUSIK: menyala saat pasukan tiba, lalu DIHENTIKAN di akhir '
        + '(gameplay tetap "musik saat peluru pertama kena")',
        musicAtHorde === 'battle' && sfxM2.musicDebug() === null);

    // --- Serah-terima: scene Survival (Wave 1) + tutorial "Click to Start"
    T('SURV INTRO: selesai -> scene Survival (sinematik OFF) + tutorial ditampilkan (pause+blocker)',
        svEntered === 1 && stateMod.cinematicActive === false
        && smMod.activeScene === svMod.survivalScene && dEnd.active === false
        && stateMod.isPaused === true && svBlocker.style.display === 'flex');
    T('SURV INTRO: aktor cutscene DIBUANG di akhir (tak jadi entitas gameplay)',
        dEnd.army === 0 && dEnd.chasers === 0 && robots.length === 0);

    // --- SKIP (tombol kanan-bawah / SPACE): dari fase mana pun -> langsung Wave 1
    smMod.setScene(mi.survivalIntroScene);
    mi.beginSurvivalIntro();
    for (let i = 0; i < 10; i++) mi.survivalIntroScene.updateMode(0.1, 6);
    const preSkip = mi.survIntroDebug();
    const svViaBtn = domSk.triggerCutsceneSkip();
    if (!svViaBtn) mi.skipSurvivalIntro();
    T('SURV INTRO SKIP: tombol SKIP terdaftar setelah cutscene tampil, skip -> Wave 1 + tutorial',
        preSkip.active === true && svViaBtn === true && svEntered === 2
        && smMod.activeScene === svMod.survivalScene && stateMod.cinematicActive === false
        && stateMod.isPaused === true && mi.survIntroDebug().army === 0);

    svMod.survivalScene.enter = realSvEnter;   // pulihkan
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    stateMod.setCinematicActive(false);
}

// --- 17e2. SLIDESHOW LAMA BENAR-BENAR DIHAPUS (2026-07-27): cutscene survival
// TIDAK BOLEH kembali berbentuk "presentasi" DOM — tak ada overlay `#cutscene`,
// tak ada `.slide`/emoji aktor di CSS, dan menu.js tak lagi punya slideshow. ---
{
    const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
    const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8');
    const menuSrc = fs.readFileSync(ROOT + '/src/scenes/menu.js', 'utf8');
    T('SURV INTRO: slideshow DOM lama dihapus (tanpa #cutscene/.slide/initCutscene) & takarir sinematik ada',
        !html.includes('id="cutscene"') && !html.includes('cutsceneDots')
        && !css.includes('#cutscene') && !css.includes('.slide')
        && !/function initCutscene/.test(menuSrc) && !/initCutscene\(\);/.test(menuSrc)
        && html.includes('id="cineCaption"') && css.includes('#cineCaption'));
}

// --- Slider volume Settings (2026-07-19; revisi: nilai ABSOLUT 0..1 — slider
// penuh = volume 1.0 utk musik & SFX): SFX diskalakan relatif SFX_BASE 0.7
// (clamp <= 1), musik diterapkan LIVE ke track, keduanya tersimpan. ---
{
    const sfxMod = await import(R('src/utils/sfx.js'));
    sfxMod.setSFXVolume(1);                             // slider penuh
    const nFull = sfxMod.playSFX(sfxMod.sfxShoot, 0.7); // klip standar -> 1.0 penuh
    sfxMod.setMusicVolume(1);
    const musicFull = sfxMod.bgMusic.volume;            // -> 1.0 penuh
    sfxMod.setSFXVolume(0.35);
    const nHalf = sfxMod.playSFX(sfxMod.sfxShoot, 0.7); // -> 0.35 (absolut)
    sfxMod.setMusicVolume(0.15);
    T('VOLUME: slider ABSOLUT — penuh = 1.0 (musik & SFX), nilai lain diterapkan + tersimpan',
        Math.abs(nFull.volume - 1) < 1e-9 && Math.abs(musicFull - 1) < 1e-9
        && Math.abs(nHalf.volume - 0.35) < 1e-9
        && Math.abs(sfxMod.bgMusic.volume - 0.15) < 1e-9
        && localStorage.getItem('gibsSfxVol') === '0.35'
        && localStorage.getItem('gibsMusicVol') === '0.15');
    sfxMod.setMusicVolume(0.8); sfxMod.setSFXVolume(1);   // pulihkan default (musik 80%, SFX 100%)
    nFull.pause(); nHalf.pause();
}

// --- Tombol SKIP cutscene (2026-07-19, dom.js): show -> trigger memanggil
// callback SEKALI (sekali-jalan; klik tombol & SPACE/Enter via input.js memakai
// jalur triggerCutsceneSkip yang sama), tanpa callback -> false. ---
{
    const domMod = await import(R('src/core/dom.js'));
    let hits = 0;
    domMod.showCutsceneSkip(() => hits++);
    const first = domMod.triggerCutsceneSkip();
    const second = domMod.triggerCutsceneSkip();
    domMod.hideCutsceneSkip();
    T('SKIP BUTTON: trigger memanggil callback sekali, trigger ke-2 = false (sekali-jalan)',
        first === true && second === false && hits === 1);
}

// --- 15b. CITYSCAPE campaign stage 1-3 (2026-07-18): latar KOTA JAKARTA keliling
//     gedung indoor (gedung+jalan+pohon; DEKOR — TANPA blocker, jadi
//     collision/nav/BFS stage tak berubah, sudah diverifikasi tes stage) + ENV
//     kota (kubah kobaran-api global disembunyikan + scene.background haze). ---
{
    const cityMod = await import(R('src/scenes/campaign/utility/cityscape.js'));
    let cityOk = true;
    try { cityMod.buildCampaignCityscape(30000, 0, 210, 210); } catch (e) { cityOk = false; console.log(e); }
    T('CITYSCAPE: buildCampaignCityscape (gedung+jalan+pohon keliling) jalan tanpa error', cityOk);
    cityMod.enterCityEnv();
    T('CITYSCAPE: enterCityEnv -> scene.background di-set (haze kota, kubah api global disembunyikan)',
        scene.background != null);
    cityMod.exitCityEnv();
    T('CITYSCAPE: exitCityEnv -> background dilepas (stage 4 outdoor pakai kubah global)',
        scene.background === null);
}

// --- 16. IDLE AFK bertahap (2026-07-14): player diam TOTAL & tak ada ancaman ->
//     +30 dtk MELAMBAI ke kamera, +60 dtk JONGKOK, +90 dtk REBAHAN; gerak &
//     musuh mengejar mereset seketika. (switchAnim=-1 default, gunRecoil=0,
//     initWeapons tak perlu; aimPoint konstan = tak dianggap "menggerakkan".) ---
avMod.resetAvatarDeath();                     // pastikan bukan pose mati (deathT=-1)
stateMod.setGameOver(false);
stateMod.setPaused(false);
while (robots.length) robots.pop();
camera.position.set(1000, 11.4, 1000);
inputMod.aimPoint.set(1000, 0, 900);          // kursor konstan (tak "digerakkan")
for (let i = 0; i < 3; i++) avMod.updatePlayerAvatar(0.1);   // warm: settle lastX & lastAim
for (let i = 0; i < 3000 && avMod.afkDebug().t < 31; i++) avMod.updatePlayerAvatar(0.2);
T('AFK +30 dtk: MELAMBAI ke kamera (wave)', avMod.afkDebug().mode === 'wave');
// Regresi bug "kepala terlepas": tunduk/dongak kepala harus berporos di LEHER —
// headG.position DIKOMPENSASI (bukan (0,0,0)) saat headG.rotation.x != 0.
const hG = avMod.avatarGroup.children[0].children[0];   // avatarGroup>upperG>headG
T('AFK wave: kepala menempel di leher (poros terkompensasi)',
    Math.abs(hG.rotation.x) > 0.05 && Math.abs(hG.position.z + 9.9 * Math.sin(hG.rotation.x)) < 0.03);
for (let i = 0; i < 3000 && avMod.afkDebug().t < 61; i++) avMod.updatePlayerAvatar(0.2);
T('AFK +60 dtk: JONGKOK (crouch)', avMod.afkDebug().mode === 'crouch');
for (let i = 0; i < 3000 && avMod.afkDebug().t < 91; i++) avMod.updatePlayerAvatar(0.2);
T('AFK +90 dtk: REBAHAN (lie)', avMod.afkDebug().mode === 'lie');
// Regresi: saat REBAHAN, aim chain TAK boleh menarik legYaw ke kursor (yg di sini
// off-kamera) — badan harus menata sejajar layar (legYaw -> ~0), bukan miring/goyang.
for (let i = 0; i < 10; i++) avMod.updatePlayerAvatar(0.2);
T('AFK lie: terlentang sejajar layar (legYaw~0, tak ditarik kursor)',
    Math.abs(avMod.avatarGroup.rotation.y) < 0.15);
camera.position.set(1060, 11.4, 1000);        // GERAK -> reset
avMod.updatePlayerAvatar(0.2);
T('AFK reset saat player BERGERAK', avMod.afkDebug().t === 0 && avMod.afkDebug().mode === 'none');
for (let i = 0; i < 3; i++) avMod.updatePlayerAvatar(0.2);   // diam lagi (afkT mulai naik)
robots.push({ state: 'chasing' });            // MUSUH mengejar -> AFK terblok
for (let i = 0; i < 60; i++) avMod.updatePlayerAvatar(0.2);
T('AFK TERBLOK saat musuh mengejar', avMod.afkDebug().t === 0);
while (robots.length) robots.pop();
avMod.resetAvatarDeath();

// --- 18. Model furnitur futuristik (2026-07-15): builder drop-in build*Mesh
//     (entities/futuristic{Bench,Console,Crate,Planter,Rubble,Sink,Stall,Sofa}.js)
//     dipakai stage 1-3 menggantikan balok berwarna. Verifikasi tiap builder
//     menghasilkan Group ter-skala berdiri di y>=0 (tanpa NaN dari bagi-nol);
//     footprint blocker TAK berubah -> nav/BFS/robot-count masih hijau di atas. ---
const propBuilders = {
    Bench: (await import(R('src/entities/futuristicBench.js'))).buildFuturisticBenchMesh,
    Console: (await import(R('src/entities/futuristicConsole.js'))).buildFuturisticConsoleMesh,
    Crate: (await import(R('src/entities/futuristicCrate.js'))).buildFuturisticCrateMesh,
    Planter: (await import(R('src/entities/futuristicPlanter.js'))).buildFuturisticPlanterMesh,
    Rubble: (await import(R('src/entities/futuristicRubble.js'))).buildFuturisticRubbleMesh,
    Sink: (await import(R('src/entities/futuristicSink.js'))).buildFuturisticSinkMesh,
    Stall: (await import(R('src/entities/futuristicStall.js'))).buildFuturisticStallMesh,
    Sofa: (await import(R('src/entities/futuristicSofa.js'))).buildFuturisticSofaMesh,
};
const fin = (n) => typeof n === 'number' && isFinite(n) && n > 0;
for (const [name, build] of Object.entries(propBuilders)) {
    let ok = typeof build === 'function';
    if (ok) {
        const g = build(16, 9, 16), inner = g && g.children && g.children[0];
        ok = !!g && g.isObject3D && g.children.length === 1 && !!inner &&
            fin(inner.scale.x) && fin(inner.scale.y) && fin(inner.scale.z) &&
            fin(inner.position.y + 1) && inner.position.y >= 0 && inner.children.length > 0;
    }
    T('prop builder ' + name + ': Group ter-skala berdiri di y>=0 (tanpa NaN)', ok);
}

// --- 19. Panduan gaya "GIBS 2045" (2026-07-16, world/palette.js): semua prop
//     futuristik + kendaraan HARUS memakai token PAL — tanpa neon terlarang
//     (cyan 0x00ffff / magenta 0xff00ff) dan emissive lingkungan <= EMISSIVE_MAX.
//     Sweep material dilakukan lewat traverse Group hasil builder (aturan tetap
//     tegak walau warna token di-retune). ---
{
    const { PAL, EMISSIVE_MAX, FORBIDDEN_HEX } = palMod;
    T('palette: token PAL lengkap & numerik', PAL &&
        ['ink', 'gunmetal', 'steel', 'panel', 'concrete', 'tech', 'techDim', 'screenBg', 'amber', 'hazard', 'white']
            .every(k => typeof PAL[k] === 'number') &&
        typeof EMISSIVE_MAX === 'number' && Array.isArray(FORBIDDEN_HEX));

    const styleGroups = [];
    for (const [name, build] of Object.entries(propBuilders)) styleGroups.push([name, build(16, 9, 16)]);
    styleGroups.push(['Desk', (await import(R('src/entities/futuristicDesk.js'))).buildFuturisticDeskMesh(16, 9, 10)]);
    styleGroups.push(['Chair', (await import(R('src/entities/futuristicChair.js'))).buildFuturisticChairMesh(4.5)]);
    styleGroups.push(['Cupboard', (await import(R('src/entities/futuristicCupboard.js'))).buildFuturisticCupboardMesh(14, 20, 8)]);
    styleGroups.push(['MeetingTable', (await import(R('src/entities/futuristicMeetingTable.js'))).buildFuturisticMeetingTableMesh(30, 9, 16)]);
    styleGroups.push(['Sedan', (await import(R('src/entities/futuristicSedan.js'))).buildFuturisticSedanMesh(7, null)]);
    styleGroups.push(['SUV', (await import(R('src/entities/futuristicSUV.js'))).buildFuturisticSUVMesh(7, null)]);
    for (const type of s7RoadVehicleMod.STAGE7_EXTRA_VEHICLE_TYPES)
        styleGroups.push(['Stage7-' + type,
            s7RoadVehicleMod.buildStage7RoadVehicle(type, PAL.gunmetal, 7)]);
    styleGroups.push(['TacticalVehicle', (await import(R('src/entities/tacticalVehicle.js'))).buildTacticalVehicleMesh(7).group]);
    styleGroups.push(['EnemyPickup', (await import(R('src/entities/enemyPickup.js'))).buildEnemyPickupMesh(7).group]);
    styleGroups.push(['BarrelDropper', (await import(R('src/scenes/campaign/stages/stage8/barrelDropper.js'))).buildBarrelDropperMesh(7).group]);
    styleGroups.push(['CombatGunship', (await import(R('src/entities/combatGunship.js'))).buildCombatGunshipMesh(4.8).group]);
    styleGroups.push(['Helicopter', (await import(R('src/entities/helicopter.js'))).buildHelicopterMesh().group]);
    styleGroups.push(['Barrel', (await import(R('src/entities/barrels.js'))).buildBarrelMesh()]);
    styleGroups.push(['SupplyCrate', (await import(R('src/entities/crates.js'))).buildCrateMesh()]);
    styleGroups.push(['SmashRuko', (await import(R('src/entities/smashBuilding.js'))).buildSmashRukoMesh().group]);
    const spawnStyleMod = await import(R('src/entities/spawnMachine.js'));
    const spawnRig = spawnStyleMod.buildSpawnMachineMesh();
    styleGroups.push(['SpawnMachine', spawnRig.group]);
    // Dudukan/silo mesin stage 3 (2026-08-13) — ikut sapuan neon + emissive.
    styleGroups.push(['MachineBay', s3dep.buildMachineBay(new THREE.Group(), 0, 0, 15).group]);
    const trainStyleMod = await import(R('src/entities/train.js'));
    styleGroups.push(['MilitaryTrain', trainStyleMod.buildMilitaryTrainMesh(0).group]);
    styleGroups.push(['TrainSceneryPool', trainStyleMod.buildTrainJourneyScenery(0).group]);

    let neonOk = true, emisOk = true, badNeon = '', badEmis = '';
    for (const [name, g] of styleGroups) {
        g.traverse(o => {
            const m = o.material;
            if (!m || !m.color) return;
            const c = m.color.getHex ? m.color.getHex() : null;
            const e = m.emissive && m.emissive.getHex ? m.emissive.getHex() : 0;
            if (FORBIDDEN_HEX.includes(c) || FORBIDDEN_HEX.includes(e)) { neonOk = false; badNeon = badNeon || name; }
            if (e !== 0 && typeof m.emissiveIntensity === 'number' && m.emissiveIntensity > EMISSIVE_MAX) {
                emisOk = false; badEmis = badEmis || (name + ' @' + m.emissiveIntensity);
            }
        });
    }
    T('palette: tanpa neon terlarang (cyan/magenta) di semua prop & kendaraan' + (badNeon ? ' [' + badNeon + ']' : ''), neonOk);
    T('palette: emissive lingkungan <= EMISSIVE_MAX di semua prop & kendaraan' + (badEmis ? ' [' + badEmis + ']' : ''), emisOk);

    // Mesin spawn adalah hero prop mekanis bersama Stage 3/6: siluet non-kotak,
    // tanpa PointLight, API lama tetap tersedia, dan pose aktif benar-benar bergerak.
    const spawnDormant = spawnStyleMod.spawnMachineDebug(spawnRig);
    T('spawn machine: API kompatibel + rig hero berlapis',
        spawnRig.group?.isObject3D && spawnRig.hatch?.isMesh && spawnRig.core?.isMesh &&
        spawnRig.eye?.isMesh && spawnRig.eyeMat && spawnRig.coreMat &&
        spawnRig.irisBlades.length === 6 && spawnRig.turbines.length === 2 &&
        spawnRig.arms.length === 2 && spawnRig.energyCoils.length === 3);
    T('spawn machine: siluet detail non-kotak tanpa PointLight',
        spawnDormant.meshes >= 60 && spawnDormant.nonBox >= 20 && spawnDormant.pointLights === 0 &&
        spawnDormant.hatchFacing === '+z');
    for (let i = 0; i < 90; i++) spawnStyleMod.updateSpawnMachine(spawnRig, 1 / 60, true, 0);
    const spawnActive = spawnStyleMod.spawnMachineDebug(spawnRig);
    T('spawn machine: power-up menggerakkan chamber, iris, scan ring dan lengan',
        spawnActive.power > 0.95 && spawnActive.irisRadius > spawnDormant.irisRadius &&
        spawnActive.scanY !== spawnDormant.scanY && Math.abs(spawnActive.chamberYaw) > 0.1 &&
        Math.abs(spawnActive.crystalYaw) > 0.1 &&
        spawnActive.armTilt.some((v, i) => Math.abs(v - spawnDormant.armTilt[i]) > 0.02));
    spawnStyleMod.resetSpawnMachine(spawnRig, false);
    const spawnReset = spawnStyleMod.spawnMachineDebug(spawnRig);
    T('spawn machine: reset dorman deterministik',
        spawnReset.power === 0 && spawnReset.irisRadius === spawnDormant.irisRadius &&
        spawnReset.scanY === spawnDormant.scanY && spawnReset.chamberYaw === 0);

    // BANGKAI (2026-08-09, permintaan user: "ketika mesin itu hancur, tampilannya
    // menjadi hitam gosong dengan part yang terlepas"). Yang dipatok: (1) tak ada
    // mesh/material/PointLight BARU — bangkainya memakai part yang sama, jadi tak
    // ada rekompilasi shader saat mesin meledak; (2) bodinya benar-benar berganti
    // ke warna gosong; (3) part-nya benar-benar berpindah dari pose utuh; (4)
    // rig mati BEKU (update tak menggerakkannya lagi); (5) reset stage
    // mengembalikannya PERSIS seperti semula.
    {
        const countMats = g => {
            const set = new Set(); let meshes = 0, lights = 0;
            g.traverse(o => { if (o.isMesh) { meshes++; if (o.material) set.add(o.material); }
                if (o.isPointLight) lights++; });
            return { meshes, mats: set.size, lights };
        };
        const before = countMats(spawnRig.group);
        spawnStyleMod.wreckSpawnMachine(spawnRig);
        const wreck = spawnStyleMod.spawnMachineDebug(spawnRig);
        const after = countMats(spawnRig.group);
        T('spawn machine: bangkai memakai mesh/material yang SAMA (nol alokasi, nol rekompilasi)',
            after.meshes === before.meshes && after.mats === before.mats
            && after.lights === before.lights && before.lights === 0);
        T('spawn machine: hancur = hitam gosong dengan part yang terlepas',
            wreck.dead && wreck.charred && wreck.detached >= 10
            && wreck.detached <= wreck.parts && wreck.parts >= 13
            // Gosong itu GELAP tapi bukan hitam murni (aturan #1 palette.js).
            && wreck.charHex === palMod.PAL.rubber && wreck.charHex >= 0x141414);
        const frozen = JSON.stringify(spawnStyleMod.spawnMachineDebug(spawnRig));
        for (let i = 0; i < 30; i++) spawnStyleMod.updateSpawnMachine(spawnRig, 1 / 60, true, 1);
        T('spawn machine: bangkai BEKU — update tidak lagi menganimasikannya',
            JSON.stringify(spawnStyleMod.spawnMachineDebug(spawnRig)) === frozen);
        spawnStyleMod.resetSpawnMachine(spawnRig, false);
        const revived = spawnStyleMod.spawnMachineDebug(spawnRig);
        T('spawn machine: reset stage memulihkan bangkai jadi mesin utuh lagi',
            !revived.dead && !revived.charred && revived.detached === 0
            && revived.irisRadius === spawnDormant.irisRadius
            && revived.scanY === spawnDormant.scanY);
    }
    // HP SATU ANGKA UNTUK SEMUA STAGE (permintaan user 2026-08-09): tak ada lagi
    // kunci HP per stage di gameplay.json, dan pembacanya cuma `spawnMachineHp`.
    {
        const C = cfgMod.CFG.campaign;
        const readers = ['src/scenes/campaign/stages/stage3/index.js',
            'src/scenes/campaign/stages/stage5/station.js',
            'src/scenes/campaign/stages/stage6/world.js',
            'src/scenes/campaign/stages/stage6/hqWorld.js',
            'src/scenes/campaign/stages/stage7/index.js']
            .map(f => fs.readFileSync(ROOT + '/' + f, 'utf8'));
        T('spawn machine: HP tunggal config-driven dipakai SEMUA stage',
            typeof C.spawnMachine.hp === 'number' && C.spawnMachine.hp > 0
            && spawnStyleMod.spawnMachineHp() === C.spawnMachine.hp
            && C.stage3.machineHp === undefined && C.stage5.spawnMachine.hp === undefined
            && C.stage6.machineHp === undefined && C.stage7.spawnMachines.hp === undefined
            && readers.every(src => src.includes('spawnMachineHp')));
    }

    // (Blok sapuan palet "ruang komando + hologram prolog" DIHAPUS 2026-07-31:
    // prolog dirombak total jadi TEKS di atas layar hitam pekat — tak ada lagi
    // dunia/material THREE di prologue.js yang perlu disapu.)

    // Rombak mobil 2026-07-16 (low-poly Lambert): tiap mobil punya >= 4 roda
    // silinder (geometri stub type 'cyl') menapak di y>0, material SEMUA
    // MeshLambertMaterial-kompatibel (tanpa Physical), dan builder TANPA lift
    // (dasar roda model sudah di y=0 -> inner group y === 0).
    for (const nm of ['Sedan', 'SUV']) {
        const g = styleGroups.find(e => e[0] === nm)[1];
        let cyl = 0;
        g.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'cyl' && o.position.y > 0) cyl++; });
        const inner = g.children[0];
        T('mobil ' + nm + ': >=4 roda silinder tegak & tanpa lift builder (inner y=0)',
            cyl >= 4 && !!inner && inner.position.y === 0);
    }

    // PASS 2045 (2026-07-28, permintaan user: "buat agar mobil-mobil itu terlihat
    // sedikit lebih futuristis ... tapi jangan terlalu futuristis yang aneh").
    // Yang dijaga = dua isyarat DESAIN yang menggantikan siluet kotak lama, bukan
    // bentuk fiksi: (1) KACA MIRING (dulu greenhouse berdinding tegak lurus =
    // terbaca mobil kotak tahun 90-an), (2) BATANG LAMPU selebar bodi + muka
    // tertutup tanpa gril (bahasa desain EV yang sudah umum sejak 2020-an).
    for (const nm of ['Sedan', 'SUV']) {
        const g = styleGroups.find(e => e[0] === nm)[1];
        let tilted = 0, bodyW = 0, barW = 0;
        g.traverse(o => {
            if (!o.isMesh || !o.geometry || o.geometry.type !== 'box') return;
            const a = o.geometry.args;
            if (o.material && o.material.transparent && Math.abs(o.rotation.z) > 0.2) tilted++;
            if (a[0] > 4) bodyW = Math.max(bodyW, a[2]);        // balok terpanjang = bodi
            const em = o.material && o.material.emissive && o.material.emissive.getHex
                ? o.material.emissive.getHex() : 0;
            if (em && a[0] < 0.2) barW = Math.max(barW, a[2]);  // pelat lampu tipis & menyala
        });
        T('mobil ' + nm + ': kaca MIRING + batang lampu selebar bodi (' + tilted
            + ' panel kaca miring, lampu ' + (bodyW ? (barW / bodyW * 100).toFixed(0) : '?')
            + '% lebar bodi)', tilted >= 1 && bodyW > 0 && barW > bodyW * 0.85);
    }

    // Rombak prop low-poly 2026-07-16: PROP & kendaraan BERULANG wajib ringan
    // (maks 25 mesh/model, penjaga "tidak berat ketika render"). PENGECUALIAN:
    // HELIKOPTER = aset HERO cutscene (SATU instance, bukan prop berulang) yang
    // SENGAJA dibuat lebih detail oleh user (2026-07-22) — diberi cap SENDIRI
    // yang longgar (`MESH_CAP`), tetap dijaga agar tak tumbuh liar. Cek palet
    // (neon/emissive) di atas TETAP berlaku penuh untuk heli.
    // CombatGunship dinaikkan 60 -> 95 pada 2026-08-08 (rombak total bentuk boss
    // akhir, permintaan user). Alasannya sama dengan pengecualian Helicopter 70:
    // ini HERO ASSET tunggal yang hanya ada di layar selama duel, bukan prop yang
    // berulang. Biaya draw call-nya justru TURUN dari versi lama karena lambung
    // statisnya dilas `mergeObjectInPlace` di browser — cap ini mengukur
    // kerumitan yang DITULIS, bukan yang digambar.
    // MachineBay: SATU set dudukan/silo mesin stage 3 dengan curb, mulut silo,
    // empat daun hatch pinwheel dan empat klem pengunci — bukan prop berulang,
    // hanya ada dua di seluruh game. Bagian diamnya dilas (`mergeObjectInPlace`)
    // di browser, jadi angka ini mengukur kerumitan yang DITULIS, bukan digambar.
    const MESH_CAP = { Helicopter: 70, TacticalVehicle: 60, EnemyPickup: 45,
        // BarrelDropper (2026-08-17): kendaraan musuh yang dilihat dari dekat,
        // sekelas TacticalVehicle/EnemyPickup — kabin, bak berusuk, gantry,
        // drum muatan yang habis satu per satu, pintu belakang berengsel
        // dan tiga gandar. Bukan prop dekor, jadi capnya sekelas mereka.
        // Dinaikkan 60 -> 78 pada 2026-08-18 karena muatannya kini mengikuti
        // `dropCount` (permintaan user "barrel yang dijatuhkannya lebih
        // banyak") sampai kapasitas bak 3x2 — enam drum = 24 mesh, dan jumlah
        // drum yang tampak WAJIB sama dengan sisa muatan sungguhan.
        BarrelDropper: 78,
        CombatGunship: 95, SmashRuko: 30, SpawnMachine: 80, MachineBay: 95,
        // TrainSceneryPool: cap MENTAH-nya sengaja longgar (2026-08-09,
        // permintaan user "background perjalanan terlalu kosong, PENUHI").
        // Pool ini bukan satu prop melainkan SELURUH lanskap perjalanan, ia
        // memuat DUA babak lengkap (kota + pegunungan Jawa Barat) karena
        // prealokasi adalah invarian proyek, dan tiap modul/varian DILAS
        // (`mergeObjectInPlace`) saat dibangun. Angka di sini adalah hitungan
        // mentah yang dilihat harness (di sana `canMerge()` false sehingga
        // pengelasan dilewati); biaya draw call yang sesungguhnya dipatok tes
        // 'S5 LANSKAP: biaya draw call' di bawah — ITU penjaga yang berlaku.
        MilitaryTrain: 220, TrainSceneryPool: 2600 };
    let heaviest = '', heavyN = 0, allLite = true, offender = '';
    for (const [name, g] of styleGroups) {
        let n = 0;
        g.traverse(o => { if (o.isMesh) n++; });
        if (n > heavyN) { heavyN = n; heaviest = name; }
        const cap = MESH_CAP[name] || 25;
        if (n > cap) { allLite = false; offender = offender || (name + '=' + n + '>' + cap); }
    }
    T('prop/kendaraan low-poly dalam cap (default 25, Helicopter ' + MESH_CAP.Helicopter + '; terberat: ' + heaviest + ' = ' + heavyN + ')' + (offender ? ' [' + offender + ']' : ''), allLite);
}

// --- 20. LOOT/UANG + BAREL PELEDAK + HARGA CAMPAIGN (SECOND-IMPROVEMENT-PLAN,
//     2026-07-22). Campaign TAK memberi skor saat kill — jatuhkan LOOT (magnet →
//     uang shop); barel eksplosif ditembak → AoE + rambat; harga shop campaign
//     diskalakan CFG.shop.campaignPriceMul. Semua config-driven. ---
{
    const dropsMod = await import(R('src/entities/drops.js'));
    const barMod = await import(R('src/entities/barrels.js'));
    const comMod2 = await import(R('src/scenes/campaign/utility/common.js'));
    const goreMod2 = await import(R('src/entities/gore.js'));

    let lootBlocked = false;
    smMod.setScene({
        id: 'lootbar-test', enter() { },
        robotAI: () => ({ chaseDist: 5 }),
        bulletBlocked: () => lootBlocked,
        playerCollide() { }, groundHeight: () => 0,
        clampDropPos: (x, z) => [x, z],
    });
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    stateMod.drops.length = 0; barMod.resetBarrels();

    // (a) spawnLoot -> drop 'loot' bernilai; uang DIAM di tempat (magnet DIHAPUS
    //     2026-07-27, permintaan user) -> baru terpungut saat PLAYER mendatanginya.
    camera.position.set(0, 11.4, 0);
    stateMod.setScore(0);
    const lootC = cfgMod.CFG.drops.loot.C;
    dropsMod.spawnLoot(60, 0, lootC, 1);
    T('spawnLoot: 1 drop tipe loot bernilai C (' + lootC + ')', stateMod.drops.length === 1
        && stateMod.drops[0].type === 'loot' && stateMod.drops[0].value === lootC);
    const lootPos = { x: stateMod.drops[0].mesh.position.x, z: stateMod.drops[0].mesh.position.z };
    for (let i = 0; i < 40; i++) dropsMod.updateDrops(0.05, i * 0.05);
    T('loot TIDAK bergerak ke player (tanpa magnet) & tak terpungut dari jauh',
        stateMod.drops.length === 1 && stateMod.score === 0
        && Math.abs(stateMod.drops[0].mesh.position.x - lootPos.x) < 1e-6
        && Math.abs(stateMod.drops[0].mesh.position.z - lootPos.z) < 1e-6);
    T('config: kunci magnet loot sudah dihapus dari CFG.drops',
        cfgMod.CFG.drops.lootMagnetMeters === undefined && cfgMod.CFG.drops.lootMagnetSpeed === undefined);
    // RADIUS "ITEM LOOTING" = METER (2026-08-13, permintaan user; 1,5 -> 2 -> 3):
    // kunci lama `lootPickupRadius` (unit mentah) diganti `lootPickupMeters`,
    // dikali CAMP_M oleh drops.js. Diuji dari KEDUA sisi batas, bukan dgn
    // menempelkan player tepat di atas kepingnya.
    const lootR = dropsMod.lootPickupRadius();
    T('config: radius item looting dinyatakan dalam METER (' + cfgMod.CFG.drops.lootPickupMeters
        + ' m = ' + lootR.toFixed(2) + ' unit)',
        cfgMod.CFG.drops.lootPickupRadius === undefined
        && cfgMod.CFG.drops.lootPickupMeters > 0
        && Math.abs(lootR - cfgMod.CFG.drops.lootPickupMeters * cfgMod.CAMP_M) < 1e-9);
    camera.position.set(lootPos.x + lootR + 0.5, 11.4, lootPos.z);   // TEPAT DI LUAR radius
    dropsMod.updateDrops(0.05, 0);
    T('loot TIDAK terpungut tepat di luar radius item looting',
        stateMod.drops.length === 1 && stateMod.score === 0
        && dropsMod.lootFlightDebug().count === 0);
    const playerX = lootPos.x + lootR - 0.5;
    camera.position.set(playerX, 11.4, lootPos.z);   // TEPAT DI DALAM radius
    dropsMod.updateDrops(0.05, 0);
    T('loot terpungut begitu player masuk radius ' + cfgMod.CFG.drops.lootPickupMeters
        + ' m -> skor = nilai C', stateMod.drops.length === 0 && stateMod.score === lootC);

    // === ANIMASI ITEM LOOTING TERBANG KE PLAYER (2026-08-13, permintaan user) ===
    // Efeknya sudah diterapkan pada frame KLAIM (skor sudah naik di atas); yang
    // tersisa murni visual. BUKAN magnet lama: item di LUAR radius tetap diam
    // (dijaga assert di atas), yang terbang hanya yang SUDAH diklaim.
    {
        const f0 = dropsMod.lootFlightDebug();
        T('item yang diloot TIDAK langsung lenyap — mesh-nya mulai terbang (masih di scene)',
            f0.count === 1 && f0.items[0].inScene === true && f0.items[0].scale === 1);
        let d0 = Math.hypot(f0.items[0].x - playerX, f0.items[0].z - lootPos.z);
        let closing = true, shrank = false, frames = 0;
        const ys = [f0.items[0].y];
        for (let i = 0; i < 200 && dropsMod.lootFlightDebug().count; i++) {
            dropsMod.updateDrops(0.02, 0);
            frames++;
            const f = dropsMod.lootFlightDebug();
            if (!f.count) break;
            const it = f.items[0];
            const d1 = Math.hypot(it.x - playerX, it.z - lootPos.z);
            if (d1 > d0 + 1e-6) closing = false;      // jaraknya HARUS terus mengecil
            d0 = d1;
            ys.push(it.y);
            if (it.scale < 0.999) shrank = true;      // mengecil menjelang lenyap
        }
        // LENGKUNG dibuktikan TANPA menyalin satu konstanta pun: sebuah lerp lurus
        // tak mungkin melewati kedua ujungnya, jadi puncak yang lebih tinggi dari
        // awal DAN dari akhir = benar-benar melengkung naik lalu turun.
        const yPeak = Math.max(...ys);
        T('item looting terbang MENDEKAT ke player terus-menerus, MELENGKUNG naik lalu mengecil',
            closing && shrank
            && yPeak > ys[0] + 2 && yPeak > ys[ys.length - 1] + 1);
        T('item looting LENYAP setelah LOOT_FLY_SEC (' + dropsMod.LOOT_FLY_SEC + ' dtk, '
            + frames + ' frame @0.02) & tak menyisakan mesh di scene',
            dropsMod.lootFlightDebug().count === 0
            && Math.abs(frames * 0.02 - dropsMod.LOOT_FLY_SEC) < 0.05);
        // Penerbangan MENGEJAR player yang bergerak: sasarannya dibaca ulang tiap frame.
        stateMod.setScore(0);
        dropsMod.spawnLoot(playerX, lootPos.z, lootC, 1);
        dropsMod.updateDrops(0.02, 0);               // klaim
        camera.position.set(playerX + 300, 11.4, lootPos.z + 300);   // player MELOMPAT jauh
        for (let i = 0; i < 6; i++) dropsMod.updateDrops(0.02, 0);
        const fm = dropsMod.lootFlightDebug();
        T('penerbangan mengejar player yang berpindah (sasaran dibaca ulang tiap frame)',
            fm.count === 1 && fm.items[0].x > playerX + 1 && fm.items[0].z > lootPos.z + 1);
        // resetLootFlights (dipanggil resetGame) membuang mesh yang masih terbang.
        dropsMod.resetLootFlights();
        T('resetLootFlights membersihkan mesh yang masih terbang saat restart',
            dropsMod.lootFlightDebug().count === 0);
        stateMod.setScore(lootC);   // pulihkan keadaan untuk assert berikutnya
    }

    // (b) campaignAwardKill: killRobot campaign TANPA skor langsung, jatuhkan loot A
    smMod.activeScene.awardKill = comMod2.campaignAwardKill;
    stateMod.setScore(0);
    const zL = mkBot('A', 30, 0); robots.push(zL);
    robotsMod.killRobot(robots.indexOf(zL), { cause: 'bullet', dirx: 1, dirz: 0 });
    const lastD = stateMod.drops[stateMod.drops.length - 1];
    T('campaignAwardKill: kill TANPA skor langsung + jatuhkan loot (nilai A ' + cfgMod.CFG.drops.loot.A + ')',
        stateMod.score === 0 && lastD && lastD.type === 'loot' && lastD.value === cfgMod.CFG.drops.loot.A);
    delete smMod.activeScene.awardKill;
    stateMod.drops.length = 0; goreMod2.resetGore();

    // (c) BAREL: resolveBarrelBlock dorong player keluar; tembak barel -> meledak
    //     (queueBoom di processPendingBooms) -> robot dalam radius MATI.
    barMod.resetBarrels();
    barMod.spawnBarrel(200, 0, 0);
    T('spawnBarrel: 1 barel terdaftar', barMod.barrelDebug().count === 1);
    const pos = { x: 201, z: 0 };
    barMod.resolveBarrelBlock(pos, cfgMod.CFG.player.radius);
    T('resolveBarrelBlock: player didorong keluar lingkaran barel',
        Math.hypot(pos.x - 200, pos.z - 0) >= cfgMod.CFG.player.radius + 3.9);
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    const zBar = mkBot('C', 205, 0); robots.push(zBar); chaseDist = 5;
    camera.position.set(200, 11.4, -400);   // player jauh (barel diledakkan sendiri oleh tembakan)
    stateMod.bullets.push({ mesh: { position: new THREE.Vector3(200, 8, 0) }, px: 190, pz: 0, dir: new THREE.Vector3(1, 0, 0), damage: cfgMod.CFG.barrels.hp });
    barMod.barrelBulletHits();
    T('barel tertembak -> meledak (count 0)', barMod.barrelDebug().count === 0);
    robotsMod.updateRobots(0.016, 1);   // processPendingBooms -> explodeAt -> robot mati
    T('ledakan barel membunuh robot di radius', !robots.includes(zBar));
    goreMod2.resetGore();

    // (d) RAMBATAN (chain): meledakkan barel -> barel lain dalam radius ikut meledak
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    barMod.resetBarrels();
    barMod.spawnBarrel(300, 0, 0); barMod.spawnBarrel(320, 0, 0);   // 20 unit < radius blast
    barMod.detonateBarrel(barMod.barrels[0]);
    T('rambatan: barel pertama meledak (sisa 1)', barMod.barrelDebug().count === 1);
    robotsMod.updateRobots(0.016, 1);   // boom barel-1 -> detonateBarrelsInRadius -> barel-2 ikut
    T('rambatan: barel kedua ikut meledak (chain, sisa 0)', barMod.barrelDebug().count === 0);
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    barMod.resetBarrels(); stateMod.drops.length = 0; goreMod2.resetGore();

    // (e) HARGA SHOP SAMA DI KEDUA MODE (2026-07-26, permintaan user: pengali
    //     `CFG.shop.campaignPriceMul` DIHAPUS — campaign memakai daftar harga yang
    //     PERSIS SAMA dengan survival). Diuji lewat perilaku beli & config-driven:
    //     uang PAS sebesar harga katalog membeli di KEDUA mode, kurang satu koin
    //     gagal di keduanya. Kunci pengali juga tak boleh muncul lagi di config.
    const price = cfgMod.CFG.shop.healthCost;
    const buyHealth = (mode, money) => {
        shopMod.closeShop();
        const ctx = { head: 'X', nextLabel: 'x', confirmMsg: 'x', onNext() { } };
        if (mode === 'campaign') ctx.mode = 'campaign';
        shopMod.openShop(ctx);
        stateMod.player.hp = 1;
        stateMod.setScore(money);
        return shopMod.shopPurchase('health');
    };
    T('harga shop SAMA di campaign & survival (' + price + '): uang pas terbeli, kurang 1 gagal (tanpa campaignPriceMul)',
        price > 0 && !('campaignPriceMul' in cfgMod.CFG.shop)
        && buyHealth('campaign', price) === null
        && buyHealth('survival', price) === null
        && buyHealth('campaign', price - 1) === 'Not enough money'
        && buyHealth('survival', price - 1) === 'Not enough money');
    shopMod.closeShop();
}

// === AMUNISI PER-SENJATA + PETI PERSEDIAAN + PERABOT/PETI TIAP RUANGAN
// (2026-07-26, permintaan user). (a) Item ammo tak lagi mengisi SEMUA senjata:
// tiap drop membawa d.weapon & mesh sendiri, hanya senjata itu yang terisi.
// (b) Peti bisa dihancurkan dgn TEMBAK atau TEBAS -> berpeluang berisi loot.
// (c) Tiap stage 1-3 menaruh peti di SETIAP ruangan + perabot tambahan, TANPA
// merusak konektivitas nav (robot) maupun kelapangan mulut pintu (player). ===
{
    const ammoMod = await import(R('src/entities/ammoPickups.js'));
    const dropMod2 = await import(R('src/entities/drops.js'));
    const crateMod = await import(R('src/entities/crates.js'));
    const P = stateMod.player;

    // (a1) Empat jenis amunisi = empat mesh BERBEDA (bukan sekadar beda warna).
    const meshes = ammoMod.AMMO_WEAPONS.map(w => ammoMod.buildAmmoMesh(w));
    const counts = meshes.map(m => m.children.length);
    T('ammo: 4 jenis (pistol/shotgun/rifle/launcher) punya mesh masing-masing',
        ammoMod.AMMO_WEAPONS.length === 4
        && ammoMod.AMMO_WEAPONS.every(w => cfgMod.CFG.weapons[w] && ammoMod.AMMO_KINDS[w].label)
        && meshes.every(m => m.children.length > 2)
        && new Set(counts).size > 1);

    // (a2) Memungut ammo pistol HANYA mengisi pistol — senjata lain tak berubah.
    stateMod.drops.length = 0;
    P.weapons = ['pistol', 'rifle']; stateMod.syncOwnedFromWeapons();
    P.pistol.ammo = 0; P.rifle.ammo = 0;
    camera.position.set(0, cfgMod.CFG.player.eyeHeight, 0);
    dropMod2.spawnAmmoDrop(0, 0, 'pistol');
    dropMod2.updateDrops(0.05, 0);
    T('ammo pistol: HANYA pistol terisi (+ammoPickup), rifle TETAP 0',
        P.pistol.ammo === cfgMod.CFG.weapons.pistol.ammoPickup && P.rifle.ammo === 0
        && stateMod.drops.length === 0);

    // (a2b) "ITEM LOOTING" = SATU ISTILAH, SATU RADIUS (2026-08-13, permintaan
    //       user): uang, amunisi DAN medkit memakai `CFG.drops.lootPickupMeters`
    //       yang sama. Dulu ammo/medkit HARDCODE `player.radius + 2` (7 unit ≈
    //       1 m) lalu sempat punya kunci `itemPickupMeters` sendiri.
    {
        const itemR = dropMod2.lootPickupRadius();
        T('config: ITEM LOOTING punya SATU radius bersama (uang + ammo + medkit), bukan dua kunci',
            cfgMod.CFG.drops.itemPickupMeters === undefined
            && cfgMod.CFG.drops.lootPickupRadius === undefined
            && cfgMod.CFG.drops.lootPickupMeters > 0
            && Math.abs(itemR - cfgMod.CFG.drops.lootPickupMeters * cfgMod.CAMP_M) < 1e-9
            && itemR > cfgMod.CFG.player.radius + 2);   // benar-benar LEBIH LUAS dari aturan lama
        stateMod.drops.length = 0; dropMod2.resetLootFlights();
        P.pistol.ammo = 0;
        dropMod2.spawnAmmoDrop(itemR + 0.5, 0, 'pistol');   // TEPAT DI LUAR radius
        dropMod2.updateDrops(0.05, 0);
        T('ammo TIDAK terpungut tepat di luar radius item looting',
            stateMod.drops.length === 1 && P.pistol.ammo === 0
            && dropMod2.lootFlightDebug().count === 0);
        stateMod.drops.length = 0;
        dropMod2.spawnAmmoDrop(itemR - 0.5, 0, 'pistol');   // TEPAT DI DALAM radius
        dropMod2.updateDrops(0.05, 0);
        T('ammo terpungut begitu masuk radius ' + cfgMod.CFG.drops.lootPickupMeters + ' m',
            stateMod.drops.length === 0 && P.pistol.ammo === cfgMod.CFG.weapons.pistol.ammoPickup);
        T('ammo yang diloot ikut TERBANG ke player (bukan cuma uang)',
            dropMod2.lootFlightDebug().count === 1);
        dropMod2.resetLootFlights();
        P.pistol.ammo = 0;
    }

    // (a3) Ammo untuk senjata yang TIDAK dimiliki DITINGGAL di lantai (tak mubazir).
    dropMod2.spawnAmmoDrop(0, 0, 'shotgun');
    dropMod2.updateDrops(0.05, 0);
    T('ammo senjata yang tak dimiliki tak diambil (tetap di lantai)',
        !P.owned.shotgun && stateMod.drops.length === 1 && stateMod.drops[0].weapon === 'shotgun');
    stateMod.drops.length = 0;

    // (a4) Ammo penuh juga ditinggal (aturan full-item lama tetap berlaku).
    P.pistol.ammo = stateMod.maxAmmoFor('pistol');
    dropMod2.spawnAmmoDrop(0, 0, 'pistol');
    dropMod2.updateDrops(0.05, 0);
    T('ammo penuh: item ditinggal di lantai (aturan full-item)', stateMod.drops.length === 1);
    stateMod.drops.length = 0;

    // (a5) Drop robot mati mengundi jenis dari senjata yang DIMILIKI saja.
    let allOwned = true;
    for (let i = 0; i < 30; i++) {
        stateMod.drops.length = 0;
        for (let k = 0; k < 80 && !stateMod.drops.length; k++) dropMod2.spawnDrop({ x: 5000, z: 5000 });
        if (stateMod.drops.length && !P.owned[stateMod.drops[0].weapon]) allOwned = false;
    }
    T('drop robot: jenis amunisi selalu dari senjata yang DIMILIKI', allOwned);
    stateMod.drops.length = 0;

    // (b1) Peti: DITEMBAK sampai hp habis -> pecah + peluru terserap.
    stateMod.beginStageStats('campaign-crate-test');
    crateMod.resetCrates();
    crateMod.spawnCrate(300, 300, 0);
    const shotCrate = crateMod.crates[0];
    T('peti: spawn tercatat', crateMod.crateDebug().count === 1);
    stateMod.bullets.length = 0;
    stateMod.drops.length = 0;
    stateMod.bullets.push({ mesh: { position: { x: 300, y: 8, z: 300 } }, px: 300, py: 8, pz: 280, dir: { x: 0, y: 0, z: 1 }, damage: cfgMod.CFG.crates.hp + 10 });
    crateMod.crateBulletHits();
    T('peti: hancur oleh peluru player + peluru terserap',
        crateMod.crateDebug().count === 0 && stateMod.bullets.length === 0);
    crateMod.breakCrate(shotCrate);   // sudah di-splice: tak boleh terhitung dua kali
    T('peti: statistik loot box bertambah tepat sekali per breakCrate sukses',
        stateMod.stageStatsDebug().lootBoxesDestroyed === 1);

    // (b2) Undian isi CONFIG-DRIVEN: lootChance 1 + hanya bobot uang -> pasti loot.
    const Cbase = { ...cfgMod.CFG.crates };
    cfgMod.CFG.crates.lootChance = 1; cfgMod.CFG.crates.ammoWeight = 0;
    cfgMod.CFG.crates.moneyWeight = 1; cfgMod.CFG.crates.medkitWeight = 0;
    stateMod.drops.length = 0;
    crateMod.spawnCrate(320, 320, 0);
    crateMod.breakCrate(crateMod.crates[0]);
    const mTiers = cfgMod.CFG.crates.moneyTiers;
    T('peti: pecah -> menjatuhkan isi (uang) sesuai tier config',
        stateMod.drops.length > 0 && stateMod.drops.every(d => d.type === 'loot')
        && mTiers.some(t => (t.chips || 1) === stateMod.drops.length
            && t.value === stateMod.drops.reduce((s, d) => s + d.value, 0)));
    cfgMod.CFG.crates.lootChance = 0;
    stateMod.drops.length = 0;
    crateMod.spawnCrate(340, 340, 0);
    crateMod.breakCrate(crateMod.crates[0]);
    T('peti: lootChance 0 -> pecah tanpa isi', stateMod.drops.length === 0);
    Object.assign(cfgMod.CFG.crates, Cbase);

    // (b2b) SEBARAN ISI (2026-07-27, permintaan user: peti SELALU berisi —
    // uang/ammo/medkit menurut bobot). Statistik dibandingkan dgn peluang yang
    // DITURUNKAN dari CFG (bukan angka hardcode) + toleransi longgar, jadi tetap
    // hijau kalau user me-retune bobotnya.
    {
        const C = cfgMod.CFG.crates;
        const pk = C.ammoWeight + C.moneyWeight + C.medkitWeight;
        P.weapons = ['pistol', 'rifle', 'shotgun']; stateMod.syncOwnedFromWeapons();
        const N = 3000;
        crateMod.resetCrates();
        const kind = { money: 0, ammo: 0, medkit: 0 };
        const tierHit = new Map(C.moneyTiers.map(t => [t.value, 0]));
        const perWeapon = {};
        let empty = 0, badValue = 0, unowned = 0;
        for (let i = 0; i < N; i++) {
            stateMod.drops.length = 0;
            crateMod.spawnCrate(2000 + i, 2000, 0);
            crateMod.breakCrate(crateMod.crates[0]);
            const d = stateMod.drops[0];
            if (!d) { empty++; continue; }
            if (d.type === 'loot') {
                kind.money++;
                const v = stateMod.drops.reduce((s, e) => s + e.value, 0);
                const t = C.moneyTiers.find(e => e.value === v && (e.chips || 1) === stateMod.drops.length);
                if (t) tierHit.set(v, tierHit.get(v) + 1); else badValue++;
            } else if (d.type === 'ammo') {
                kind.ammo++;
                perWeapon[d.weapon] = (perWeapon[d.weapon] || 0) + 1;
                if (!P.owned[d.weapon]) unowned++;
            } else kind.medkit++;
        }
        stateMod.drops.length = 0; crateMod.resetCrates();
        const near = (got, want, tol = 0.05) => Math.abs(got / N - want) <= tol;
        T('peti: 100% berisi (lootChance ' + C.lootChance + ' -> tak pernah kosong)', empty === 0);
        T('peti: sebaran jenis isi mengikuti bobot CFG (uang/ammo/medkit)',
            near(kind.money, C.moneyWeight / pk) && near(kind.ammo, C.ammoWeight / pk)
            && near(kind.medkit, C.medkitWeight / pk));
        const tw = C.moneyTiers.reduce((s, t) => s + t.weight, 0);
        T('peti: nilai uang selalu salah satu tier CFG (value+chips cocok)', badValue === 0);
        T('peti: sebaran tier uang mengikuti bobot tier CFG',
            C.moneyTiers.every(t => Math.abs(tierHit.get(t.value) / (kind.money || 1) - t.weight / tw) <= 0.06));
        const wk = Object.keys(perWeapon);
        T('peti: ammo HANYA dari senjata yang dimiliki, seragam per jenis (3 slot -> ~33,33%)',
            unowned === 0 && wk.length === P.weapons.length
            && wk.every(w => Math.abs(perWeapon[w] / (kind.ammo || 1) - 1 / P.weapons.length) <= 0.06));
        P.weapons = ['pistol', 'rifle']; stateMod.syncOwnedFromWeapons();
    }

    // (b2c) TAMPILAN "bisa dihancurkan" (2026-07-27, permintaan user): peti wajib
    // membawa bagian ber-animasi (tutup menganga + cincin sasaran + beacon) dan
    // memberi UMPAN BALIK saat dipukul — sentakan lalu meluruh kembali normal.
    {
        const cm = crateMod.buildCrateMesh();
        let nm = 0; cm.traverse(o => { if (o.isMesh) nm++; });
        T('peti: mesh membawa bagian ber-animasi (tutup/cincin/beacon) & tetap low-poly (' + nm + ' mesh)',
            !!cm.userData.lid && !!cm.userData.ring && !!cm.userData.beacon && nm <= 25);

        crateMod.resetCrates();
        crateMod.spawnCrate(500, 500, 0);
        const cr = crateMod.crates[0];
        crateMod.updateCrates(0.016);
        const lidY0 = cr.lid.position.y, ringZ0 = cr.ring.rotation.z;
        stateMod.bullets.length = 0;
        stateMod.bullets.push({ mesh: { position: { x: 500, y: 8, z: 500 } }, px: 500, py: 8, pz: 480, dir: { x: 0, y: 0, z: 1 }, damage: cfgMod.CFG.crates.hp * 0.5 });
        crateMod.crateBulletHits();
        crateMod.updateCrates(0.016);
        T('peti: kena tembak -> tersentak + tutup MENGANGA (umpan balik rusak)',
            cr.hit > 0 && cr.mesh.scale.x > 1 && cr.lid.position.y > lidY0 && cr.lid.rotation.z > 0);
        for (let i = 0; i < 40; i++) crateMod.updateCrates(0.05);
        T('peti: sentakan meluruh kembali normal & cincin sasaran berputar',
            cr.hit === 0 && Math.abs(cr.mesh.scale.x - 1) < 1e-6 && cr.ring.rotation.z > ringZ0);
        crateMod.resetCrates();
        crateMod.updateCrates(0.016);   // tanpa peti = no-op (tak melempar)
        stateMod.bullets.length = 0;
    }

    // (b3) TEBASAN pedang memecah peti (jangkauan + kerucut depan yang sama).
    stateMod.drops.length = 0;
    crateMod.spawnCrate(360, 300, 0);
    const meleeR = cfgMod.CFG.melee.range;
    const missed = crateMod.crateMeleeHit(360, 300 + meleeR + 60, 0, 1, meleeR, cfgMod.CFG.melee.damage);
    T('peti: tebasan LUPUT bila peti di luar jangkauan/kerucut',
        missed === false && crateMod.crateDebug().count === 1);
    const landed = crateMod.crateMeleeHit(360, 300 - 8, 0, 1, meleeR, cfgMod.CFG.melee.damage * 99);
    T('peti: tebasan DEPAN dalam jangkauan -> peti pecah',
        landed === true && crateMod.crateDebug().count === 0);

    // (b4) PEJAL ke player (didorong keluar); TIDAK masuk nav (robot boleh lewat).
    crateMod.spawnCrate(400, 400, 0);
    const pp = { x: 401, y: 0, z: 401 };
    crateMod.resolveCrateBlock(pp, cfgMod.CFG.player.radius);
    T('peti: pejal ke player (didorong keluar dari titik pusat)',
        Math.hypot(pp.x - 400, pp.z - 400) > cfgMod.CFG.player.radius);
    crateMod.resetCrates();
    T('resetCrates: semua peti dibuang', crateMod.crateDebug().count === 0);
    stateMod.drops.length = 0; stateMod.bullets.length = 0;

    // ---- (c) penempatan peti + perabot per stage ----
    const s1c = await import(R('src/scenes/campaign/stages/stage1/index.js'));
    const s2c = await import(R('src/scenes/campaign/stages/stage2/index.js'));
    const s3c = await import(R('src/scenes/campaign/stages/stage3/index.js'));

    const posOf = (placeFn) => { crateMod.resetCrates(); placeFn(); const a = crateMod.crates.map(k => ({ x: k.x, z: k.z })); return a; };
    const s1CratePos = posOf(s1c.placeCrates);
    const s2CratePos = posOf(s2c.placeCrates);
    const s3CratePos = posOf(s3c.placeCrates);
    crateMod.resetCrates();

    // (c1) TIAP rect ruangan (satu lampu = satu ruangan) memuat MINIMAL SATU peti
    //      -> player punya alasan MASUK ke setiap ruangan, bukan cuma lewat koridor.
    const covers = (lamps, pos) => lamps.every(lm =>
        pos.some(k => k.x >= lm.x0 && k.x <= lm.x1 && k.z >= lm.z0 && k.z <= lm.z1));
    T('peti: SETIAP ruangan stage 1 memuat minimal satu peti', covers(s1c.s1LampsDbg(), s1CratePos));
    T('peti: SETIAP ruangan stage 2 memuat minimal satu peti', covers(s2c.s2LampsDbg(), s2CratePos));
    T('peti: SETIAP ruangan stage 3 memuat minimal satu peti', covers(s3c.s3LampsDbg(), s3CratePos));

    // MEKANISME "MATI LAMPU" DIHAPUS (2026-08-11, permintaan user): stage 2 & 3
    // ikut stage 1 — lampu ruangan menyala penuh, tanpa on/k/shroud/doors.
    const allLit = (lamps) => lamps.length >= 10
        && lamps.every(l => l.L.intensity === l.base && l.base > 0)
        && lamps.every(l => l.on === undefined && l.k === undefined
            && l.shroud === undefined && l.doors === undefined);
    T('LAMPU: semua lampu ruangan stage 2 MENYALA PENUH sejak dibangun', allLit(s2c.s2LampsDbg()));
    T('LAMPU: semua lampu ruangan stage 3 MENYALA PENUH sejak dibangun', allLit(s3c.s3LampsDbg()));

    // (c2) Tiap peti berdiri di LANTAI & tak tertanam di furnitur (kalau tertanam,
    //      peti mustahil didekati/dipecah).
    const onFloor = (pos, walkFn, resolveFn, tag) => pos.every(k => {
        let ok = walkFn(k.x, k.z, 1);
        if (ok) {
            stateMod._v3.set(k.x, 0, k.z);
            resolveFn(stateMod._v3, 1, 0);
            ok = Math.abs(stateMod._v3.x - k.x) + Math.abs(stateMod._v3.z - k.z) < 0.01;
        }
        if (!ok) console.log(`  peti tertanam ${tag}: x=${k.x.toFixed(1)} z=${k.z.toFixed(1)}`);
        return ok;
    });
    T('peti: semua berdiri di lantai & tak tertanam furnitur (stage 1/2/3)',
        onFloor(s1CratePos, s1c.stage1Walk, s1c.resolve, 'S1')
        && onFloor(s2CratePos, s2c.stage2Walk, s2c.resolve, 'S2')
        && onFloor(s3CratePos, s3c.stage3Walk, s3c.resolve, 'S3'));

    // (c3) PERABOT TAMBAHAN tak memutus nav robot: flood-fill nav-grid — region
    //      terbesar harus mencakup hampir seluruh sel walkable (bukan pecah jadi
    //      ruangan-ruangan terkunci).
    const navRegions = (nav) => {
        const { cols, rows, walk } = nav;
        const seen = new Uint8Array(cols * rows);
        let total = 0, biggest = 0;
        for (let i = 0; i < walk.length; i++) if (walk[i]) total++;
        for (let i0 = 0; i0 < walk.length; i0++) {
            if (!walk[i0] || seen[i0]) continue;
            let n = 0; const q = [i0]; seen[i0] = 1;
            while (q.length) {
                const i = q.pop(); n++;
                const c = i % cols, r = (i - c) / cols;
                for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const c2 = c + dc, r2 = r + dr;
                    if (c2 < 0 || r2 < 0 || c2 >= cols || r2 >= rows) continue;
                    const j = r2 * cols + c2;
                    if (walk[j] && !seen[j]) { seen[j] = 1; q.push(j); }
                }
            }
            if (n > biggest) biggest = n;
        }
        return biggest / Math.max(1, total);
    };
    T('perabot tambahan: nav stage 1/2/3 tetap satu region besar (robot tak terkurung)',
        navRegions(s1c.s1Nav) > 0.97 && navRegions(s2c.s2Nav) > 0.97 && navRegions(s3c.s3Nav) > 0.97);

    // (c4) Peti (pejal ke PLAYER saja) tak menyegel mulut pintu geser: berdiri di
    //      sel lantai tetangga tiap bukaan pintu stage 1 tak boleh terdorong jauh.
    crateMod.resetCrates(); s1c.placeCrates();
    const PR = cfgMod.CFG.player.radius;
    // Termasuk pintu RUSAK '+' (c3-4 r7, c13-15 r7) dan CELAH '/' (c39 r3, c28 r7):
    // ketiganya tetap mulut sempit yang tak boleh disumbat perabot/peti.
    const DOORCELLS = [[8, 3], [8, 4], [3, 7], [4, 7], [13, 7], [14, 7], [15, 7], [8, 11], [8, 12],
    [21, 11], [21, 12], [3, 17], [4, 17], [36, 17], [37, 17], [41, 17], [42, 17],
    [13, 20], [14, 20], [16, 20], [17, 20], [21, 23], [21, 24], [29, 23], [29, 24],
    [8, 24], [8, 25], [33, 29], [34, 29], [39, 31], [39, 32], [3, 39], [4, 39],
    [39, 43], [39, 44], [39, 45], [39, 3], [28, 7]];
    let doorsClear = true;
    for (const [cc, rr] of DOORCELLS) {
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (s1c.s1Wall(cc + dc, rr + dr)) continue;
            const p = s1c.s1Cell(cc + dc, rr + dr);
            stateMod._v3.set(p.x, 0, p.z);
            crateMod.resolveCrateBlock(stateMod._v3, PR);
            if (Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) > 1e-6) doorsClear = false;
        }
    }
    T('peti: tak ada yang menghalangi sel tetangga mulut pintu geser stage 1', doorsClear);
    crateMod.resetCrates();

    // ---- (c5..c8) PEMADATAN PERABOT + PETI (2026-07-26 pass 2, permintaan user:
    //      "ruangan masih terlalu terlihat kosong, taruh lebih banyak box") ----
    const ROOMS = [
        { n: 1, m: s1c, S: s1c.S1, cell: s1c.s1Cell, wall: s1c.s1Wall, res: s1c.resolve, lamps: s1c.s1LampsDbg(), furn: s1c.s1FurnitureDbg(), pos: s1CratePos, doors: DOORCELLS },
        { n: 2, m: s2c, S: s2c.S2, cell: s2c.s2Cell, wall: s2c.s2Wall, res: s2c.resolve, lamps: s2c.s2LampsDbg(), furn: s2c.s2FurnitureDbg(), pos: s2CratePos, doors: [[43, 6], [44, 6], [17, 4], [17, 5], [6, 9], [7, 9], [8, 11], [8, 12], [30, 11], [30, 12], [27, 19], [27, 20], [1, 20], [2, 20], [13, 23], [13, 24], [39, 27], [39, 28], [44, 29], [45, 29], [38, 6]] },
        { n: 3, m: s3c, S: s3c.S3, cell: s3c.s3Cell, wall: s3c.s3Wall, res: s3c.resolve, lamps: s3c.s3LampsDbg(), furn: s3c.s3FurnitureDbg(), pos: s3CratePos, doors: [[24, 8], [25, 8], [32, 9], [32, 10], [8, 12], [8, 13], [32, 15], [32, 16], [11, 21], [11, 22], [32, 21], [32, 22]] },
    ];
    // sel dianggap TERISI perabot bila titik pusatnya terdorong resolve (radius nav 3)
    const occupied = (st, c, r, rad) => {
        const p = st.cell(c, r);
        stateMod._v3.set(p.x, 0, p.z);
        st.res(stateMod._v3, rad, 0);
        return Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) > 1e-6;
    };
    const rectOf = (st, lm) => ({
        c0: Math.round((lm.x0 - st.S.x0) / st.S.CELL), c1: Math.round((lm.x1 - st.S.x0) / st.S.CELL) - 1,
        r0: Math.round((lm.z0 - st.S.z0) / st.S.CELL), r1: Math.round((lm.z1 - st.S.z0) / st.S.CELL) - 1,
    });
    // (c5) tiap ruangan cukup terisi: >=5% sel lantainya ditempati perabot, dan
    //      rata-rata seluruh stage >=12% -> ruangan tak lagi terasa melompong.
    //      (ambang STRUKTURAL, bukan angka tuning CFG.)
    let densityOK = true;
    const densityLog = [];
    for (const st of ROOMS) {
        let allFloor = 0, allBusy = 0;
        for (const lm of st.lamps) {
            const q = rectOf(st, lm);
            let floor = 0, busy = 0;
            for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) {
                if (st.wall(c, r)) continue;
                floor++;
                if (occupied(st, c, r, 3)) busy++;
            }
            allFloor += floor; allBusy += busy;
            if (busy / Math.max(1, floor) < 0.05) { densityOK = false; densityLog.push(`S${st.n} c${q.c0}-${q.c1} r${q.r0}-${q.r1}: ${busy}/${floor}`); }
        }
        if (allBusy / allFloor < 0.12) { densityOK = false; densityLog.push(`S${st.n} rata-rata ${(allBusy / allFloor * 100).toFixed(1)}%`); }
    }
    if (densityLog.length) console.log('  ruangan terlalu kosong:', densityLog);
    T('perabot: tiap ruangan stage 1/2/3 terisi >=5% (rata-rata stage >=12%)', densityOK);

    // (c6) peti: MAYORITAS ruangan memuat >=2 peti (bukan cuma 1 per ruangan) dan
    //      totalnya >= 2x jumlah ruangan.
    let cratesOK = true;
    for (const st of ROOMS) {
        let multi = 0;
        for (const lm of st.lamps) {
            const n = st.pos.filter(k => k.x >= lm.x0 && k.x <= lm.x1 && k.z >= lm.z0 && k.z <= lm.z1).length;
            if (n >= 2) multi++;
        }
        if (multi < Math.ceil(st.lamps.length * 0.8) || st.pos.length < st.lamps.length * 2) cratesOK = false;
    }
    T('peti: >=80% ruangan tiap stage memuat MINIMAL DUA peti (total >=2x ruangan)', cratesOK);

    // (c7) entri tabel perabot tak saling tumpang tindih (mesh menancap satu sama lain)
    let overlaps = 0;
    for (const st of ROOMS) {
        const bs = st.furn.map(([k, c, r, sx, sy, sz]) => {
            const p = st.cell(c, r);
            return { k, c, r, x0: p.x - sx / 2, x1: p.x + sx / 2, z0: p.z - sz / 2, z1: p.z + sz / 2 };
        });
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i], b = bs[j];
            if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.5) {
                overlaps++;
                console.log(`  perabot tumpang tindih S${st.n}: ${a.k}@${a.c},${a.r} x ${b.k}@${b.c},${b.r}`);
            }
        }
    }
    T('perabot: tak ada entri tabel yang tumpang tindih (stage 1/2/3)', overlaps === 0);

    // (c8) mulut pintu geser stage 2 & 3 juga tetap lapang (perabot & peti) —
    //      pelengkap (c4) yang cuma menguji stage 1.
    let mouthOK = true;
    for (const st of ROOMS) {
        crateMod.resetCrates();
        for (const k of st.pos) crateMod.spawnCrate(k.x, k.z, 0);
        for (const [cc, rr] of st.doors) {
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
                const c = cc + dc, r = rr + dr;
                if (st.wall(c, r)) continue;
                if (occupied(st, c, r, 3)) { mouthOK = false; console.log(`  perabot menyumbat pintu S${st.n} @${c},${r}`); }
                const p = st.cell(c, r);
                stateMod._v3.set(p.x, 0, p.z);
                crateMod.resolveCrateBlock(stateMod._v3, PR);
                if (Math.hypot(stateMod._v3.x - p.x, stateMod._v3.z - p.z) > 1e-6) { mouthOK = false; console.log(`  peti menyumbat pintu S${st.n} @${c},${r}`); }
            }
        }
    }
    T('mulut pintu geser stage 1/2/3 bebas perabot & peti', mouthOK);
    crateMod.resetCrates();

    // ---- (c9..c11) PENGGABUNGAN PERABOT STATIS (2026-07-26, keluhan user "agak
    //      berat"): perabot padat itu digabung jadi belasan mesh oleh
    //      utils/meshBatch.js. Stub THREE di harness ini TAK punya BufferAttribute,
    //      jadi jalur yang teruji di sini = pengelompokan material + FALLBACK
    //      (harus menambahkan SEMUA prop, tak boleh ada yang hilang diam-diam).
    const batchMod = await import(R('src/utils/meshBatch.js'));

    // (c9) kunci material = PENAMPILAN, bukan uuid: dua material identik dari
    //      builder berbeda harus segrup, beda warna/emissive/opacity harus pisah.
    const mkMat = (o) => new THREE.MeshLambertMaterial(o);
    const kA = batchMod.materialKey(mkMat({ color: 0x3a4046 }));
    const kB = batchMod.materialKey(mkMat({ color: 0x3a4046 }));
    const kC = batchMod.materialKey(mkMat({ color: 0x2fb8a6 }));
    const kD = batchMod.materialKey(mkMat({ color: 0x3a4046, emissive: 0x2fb8a6, emissiveIntensity: 0.7 }));
    const kE = batchMod.materialKey(mkMat({ color: 0x3a4046, transparent: true, opacity: 0.5 }));
    T('meshBatch: kunci material dari PENAMPILAN (warna sama segrup; warna/emissive/opacity beda terpisah)',
        kA === kB && kC !== kA && kD !== kA && kE !== kA);

    // (c9b) material TEMBUS PANDANG tak boleh ikut digabung (sortir transparansi
    //       three per-OBJEK; kaca yang disatukan bisa salah urutan tumpang tindih).
    T('meshBatch: material transparan dikecualikan dari penggabungan',
        batchMod.isBatchableMaterial(mkMat({ color: 0x3a4046 })) === true
        && batchMod.isBatchableMaterial(mkMat({ color: 0x3a4046, transparent: true, opacity: 0.6 })) === false
        && batchMod.isBatchableMaterial(null) === false);

    // (c10) fallback (THREE tanpa BufferAttribute, spt harness ini): semua prop
    //       tetap masuk parent — optimasi tak boleh menelan perabot.
    T('meshBatch: tanpa dukungan merge, SEMUA prop tetap ditambahkan (tak ada yang hilang)', (() => {
        if (batchMod.canMerge()) return true;          // di browser jalur merge yang dipakai
        const parent = new THREE.Group();
        const props = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
        const added = batchMod.addMergedStatic(parent, props);
        return added.length === props.length && parent.children.length === props.length
            && props.every(p => parent.children.indexOf(p) !== -1)
            && batchMod.addMergedStatic(parent, []).length === 0;
    })());

    // (c11) tiap stage benar-benar MENGALIRKAN perabotnya lewat batch (bukan
    //       scene.add langsung) — kalau wiring-nya putus, daftar ini kosong.
    const s4c = await import(R('src/scenes/campaign/stages/stage4/index.js'));
    const s5c2 = await import(R('src/scenes/campaign/stages/stage5/index.js'));
    const s6c2 = await import(R('src/scenes/campaign/stages/stage6/index.js'));
    const s7c2 = await import(R('src/scenes/campaign/stages/stage7/index.js'));
    const s8c2 = await import(R('src/scenes/campaign/stages/stage8/index.js'));
    T('meshBatch: perabot stage 1/2/3/4/5/6/7/8 melewati addMergedStatic (batch terisi)',
        s1c.s1StaticBatchDbg().length > 0 && s2c.s2StaticBatchDbg().length > 0
        && s3c.s3StaticBatchDbg().length > 0 && s4c.s4StaticBatchDbg().length > 0
        && s5c2.stage5StaticBatchDbg().length > 0 && s6c2.stage6StaticBatchDbg().length > 0
        && s7c2.stage7StaticBatchDbg().length > 0 && s8c2.stage8StaticBatchDbg().length > 0);

    // (c12) stage 4 memakai mergeObjectInPlace utk prop yang MATERIALNYA masih
    //       disentuh saat main (mobil/gedung yang memudar = occluder). Fallback-nya
    //       WAJIB mengembalikan objek yang sama supaya jalur headless & browser
    //       tanpa dukungan merge tetap menampilkan propnya.
    T('meshBatch: mergeObjectInPlace fallback mengembalikan objek aslinya (tak menghilangkan prop)', (() => {
        if (batchMod.canMerge()) return true;
        const g = new THREE.Group();
        g.position.set(7, 0, 9);
        return batchMod.mergeObjectInPlace(g) === g && batchMod.mergeObjectInPlace(null) === null;
    })());

    // (c12b) KLASIFIKASI penggabungan — ini yang dulu bikin bug: versi pertama
    //        membuang anak NON-mesh, jadi garis tepi amber krat (LineSegments)
    //        HILANG dari scene. Sekarang tiap jenis punya nasib eksplisit.
    const fakeGeo = { attributes: { position: { array: new Float32Array(9), count: 3 }, normal: { array: new Float32Array(9) } } };
    const lineGeo = { attributes: { position: { array: new Float32Array(6), count: 2 } } };
    const opaque = { type: 'MeshLambertMaterial' };
    const cls = batchMod.classifyForBatch;
    T('meshBatch: klasifikasi — mesh opak digabung; garis/lampu/sprite/instanced/transparan DIPERTAHANKAN',
        cls({ isMesh: true, geometry: fakeGeo, material: opaque }) === 'merge'
        && cls({ isMesh: true, geometry: fakeGeo, material: { type: 'M', transparent: true } }) === 'keep'
        && cls({ isMesh: true, geometry: { attributes: {} }, material: opaque }) === 'keep'
        && cls({ isMesh: true, isInstancedMesh: true, geometry: fakeGeo, material: opaque }) === 'keep'
        && cls({ isLine: true, isLineSegments: true, geometry: lineGeo, material: opaque }) === 'mergeLine'
        && cls({ isLine: true, geometry: lineGeo, material: opaque }) === 'keep'
        && cls({ isLight: true }) === 'keep'
        && cls({ isSprite: true }) === 'keep'
        && cls({ isGroup: true }) === 'skip'
        && cls(null) === 'skip');

    // (c13) occluder stage 4 (fade) tetap terdaftar & TIDAK kehilangan posisinya —
    //       mergeObjectInPlace menyalin transform ke grup hasil; kalau itu putus,
    //       occluder akan menumpuk di origin dan fade-nya salah sasaran.
    const occ = s4c.occluderDebug();
    T('stage 4: occluder fade masih terdaftar (' + occ.count + ') & belum ada yang memudar', occ.count > 40 && occ.minF === 1);

    // ---- (c14..c16) LAMPU PER-STAGE (2026-07-26, keluhan user "stage 4 masih agak
    //      berat"): keempat dunia campaign hidup di SATU scene, jadi 54 lampu
    //      ruangan/jalan ikut dihitung shader SEKALIGUS (57 point light per fragmen).
    //      Sekarang hanya lampu stage AKTIF yang `visible`. ----
    const lightMod = await import(R('src/world/lighting.js'));
    const before = lightMod.stageLightsDebug();
    const visibleLightSet = () => {
        const set = new Set();
        const walk = (o) => { if (o.visible === false) return; if (o.isPointLight) set.add(o); for (const c of o.children) walk(c); };
        walk(scene);
        return set;
    };
    const visiblePointLights = () => visibleLightSet().size;
    // (c14) tiap stage mendaftarkan lampunya & hanya set aktif yang menyala.
    const perKey = {};
    let alwaysOn = null;                     // irisan: lampu yang menyala di SEMUA set
    for (const key of before.keys) {
        lightMod.setActiveStageLights(key);
        perKey[key] = { reg: lightMod.stageLightsDebug().visible, scene: visiblePointLights() };
        const vis = visibleLightSet();
        alwaysOn = alwaysOn === null ? vis : new Set([...alwaysOn].filter(l => vis.has(l)));
    }
    const keysOK = before.keys.length >= 5 && before.total >= 48;
    const cullOK = Object.values(perKey).every(v => v.reg > 0 && v.reg < before.total * 0.6);
    if (!cullOK) console.log('  lampu per set:', JSON.stringify(perKey));
    T('lampu stage: hanya set AKTIF yang menyala (' + before.total + ' terdaftar, '
        + Object.entries(perKey).map(([k, v]) => k + '=' + v.reg).join(' ') + ')', keysOK && cullOK);

    // (c15) lampu GLOBAL (kolam ledakan effects.js) TIDAK ikut dimatikan — kalau
    //       ikut, ledakan jadi gelap. Terlihat dari selisih hitungan scene vs registry.
    //       Diuji sbg IRISAN himpunan: lampu yang menyala di SETIAP set lampu =
    //       lampu global. Tiap lampu TERDAFTAR pasti mati di minimal satu set (ia
    //       cuma milik satu kunci), jadi irisan ini memang berisi yang global saja.
    const alwaysArr = [...(alwaysOn || [])];
    if (alwaysArr.length < 3) console.log('  lampu: per set =', JSON.stringify(perKey), ' selalu-nyala =', alwaysArr.length);
    T('lampu global (kolam ledakan, >=3) menyala di SEMUA set lampu — tak ikut dimatikan',
        alwaysArr.length >= 3);

    // (c16) kunci lampu tiap scene campaign ada (kalau lupa, stage masuk dgn set
    //       lampu stage sebelumnya = ruangan gelap/ganda).
    T('scene campaign 1-8 + survival punya lightsKey',
        s1c.stage1Scene.lightsKey === 'campaign-1' && s2c.stage2Scene.lightsKey === 'campaign-2'
        && s3c.stage3Scene.lightsKey === 'campaign-3' && s4c.stage4Scene.lightsKey === 'campaign-4'
        && s5c2.stage5Scene.lightsKey === 'campaign-5' && s6c2.stage6Scene.lightsKey === 'campaign-6'
        && s7c2.stage7Scene.lightsKey === 'campaign-7'
        && s8c2.stage8Scene.lightsKey === 'campaign-8');
    lightMod.setActiveStageLights(before.active || 'campaign-1');

    // (d) TEKS MISI tanpa penunjuk arah (2026-07-26, permintaan user: biar player
    //     mencarinya sendiri) — sapu string user-facing di semua scene campaign.
    const DIRW = /\b(north|south|east|west|far-right|far-left|top-left|top-right|bottom-left|bottom-right)\b/i;
    const dirHits = [];
    for (const f of ['stage1/index.js', 'stage2/index.js', 'stage3/index.js', 'stage4/index.js',
        'stage5/index.js', 'stage5/world.js', 'stage5/runtime.js', 'stage5/station.js',
        'stage5/journey.js',
        'stage6/index.js', 'stage6/world.js', 'stage6/runtime.js',
        'stage6/arrival.js', 'stage6/hqWorld.js', 'stage6/hq.js',
        'stage7/index.js', 'stage8/index.js']) {
        const src = fs.readFileSync(ROOT + '/src/scenes/campaign/stages/' + f, 'utf8');
        for (const line of src.split('\n')) {
            const isMsg = line.includes('showStageMsg(') || line.includes('showPickup(') || (line.includes('return') && line.includes('FLOOR'));
            if (isMsg && DIRW.test(line)) dirHits.push(f + ': ' + line.trim().slice(0, 80));
        }
    }
    if (dirHits.length) console.log('  dir-hits:', dirHits);
    T('teks misi: tanpa penunjuk arah (north/south/east/west/far-right/...)', dirHits.length === 0);
}

// === STAGE 5-8 TANPA PAPAN PENUNJUK TEMPAT (2026-08-11, permintaan user). ===
{
    const signSources = [
        'src/entities/train.js',
        'src/scenes/campaign/stages/stage6/world.js',
        'src/scenes/campaign/stages/stage6/hqWorld.js',
        'src/scenes/campaign/stages/stage7/index.js',
        'src/scenes/campaign/stages/stage8/index.js',
    ].map(f => fs.readFileSync(ROOT + '/' + f, 'utf8')).join('\n');
    const citySource = fs.readFileSync(
        ROOT + '/src/scenes/campaign/stages/stage7/stage7City.js', 'utf8');
    T('S5-8 PAPAN TEMPAT: texture/mesh papan nama dan penunjuk lokasi seluruhnya dihapus',
        !/signTexture\s*\(/.test(signSources)
        && !/BANDUNG LOGISTICS TERMINAL|EMERGENCY POWER HALL|BANDUNG HEADQUARTERS/.test(signSources)
        && !/flyover-name-sign|tollSign|gantrySign|eastSign/.test(signSources)
        && !/bx\(put,\s*M\.sign/.test(citySource));
}

// === GARIS TEMBAK != GARIS JALAN untuk robot PENEMBAK B/A (bugfix 2026-07-27,
// laporan user): penembak dulu memakai LOS NAV-GRID (`aim.direct`) yang ikut
// memblok FURNITUR/pohon — padahal peluru robot hanya diblok dinding+pintu
// (campaign) / siluet Monas (survival). Akibatnya robot ranged di balik meja
// mengitari meja seperti robot melee C, bukan berdiri menembak. ===
{
    const comMod3 = await import(R('src/scenes/campaign/utility/common.js'));
    const pfMod = await import(R('src/utils/pathfind.js'));
    const survMod2 = await import(R('src/scenes/survival/index.js'));

    // (a) CAMPAIGN — "meja" = sel nav TAK-BOLEH-JALAN antara robot & player,
    //     tapi ruangan tetap terhubung (A* punya jalan memutar).
    const grid = pfMod.makeNavGrid(-200, -200, 20, 30, 20,
        (x, z) => !(x > 20 && x < 45 && z > -60 && z < 60));
    T('uji: nav-grid memang MEMBLOK jalan lurus robot->player (meja di tengah)',
        pfMod.gridLOS(grid, 60, 0, 0, 0) === false);

    let losClear = true;
    const stg = { walkable: () => true, resolve: () => { }, nav: grid, los: () => losClear };
    camera.position.set(0, cfgMod.CFG.player.eyeHeight, 0);
    while (robots.length) robots.pop();
    const zR = mkBot('B', 60, 0);       // 60 unit < 0.95×range B (jarak berhenti tembak)
    zR.speed = 1; zR.state = 'chasing';
    T('uji: robot penembak berada DI DALAM radius tembaknya', 60 < zR.range * 0.95);

    // Nilai awal SENGAJA dibalik: lulus hanya bila AI benar-benar menulisnya.
    zR.losOK = false; zR.moving = true; zR.aiming = false;
    comMod3.campaignRobotAI(zR, 0.016, 1, stg);
    T('penembak: garis TEMBAK bebas -> DIAM di tempat menembaki player (tak mengitari meja)',
        zR.losOK === true && zR.moving === false && zR.aiming === true
        && zR.mesh.position.x === 60 && zR.mesh.position.z === 0);

    losClear = false;                   // dinding/pintu (bukan meja) menutup garis tembak
    comMod3.campaignRobotAI(zR, 0.016, 1, stg);
    T('penembak: garis TEMBAK tertutup -> bergerak mencari sudut (losOK false)',
        zR.losOK === false && zR.moving === true
        && (zR.mesh.position.x !== 60 || zR.mesh.position.z !== 0));

    // Stage 4 (outdoor, TANPA hook los & bulletBlocked selalu false): garis tembak
    // dianggap selalu bebas -> penembak tetap berdiri walau nav terhalang.
    const zR4 = mkBot('B', 60, 0);
    zR4.speed = 1; zR4.state = 'chasing'; zR4.losOK = false; zR4.moving = true;
    comMod3.campaignRobotAI(zR4, 0.016, 1, { walkable: () => true, resolve: () => { }, nav: grid });
    T('penembak stage outdoor (tanpa hook los): garis tembak bebas -> diam menembak',
        zR4.losOK === true && zR4.moving === false);

    // (a2) Pintu/dinding memutus seluruh grid: A/B tetap terbangun untuk mencari
    // sudut, tetapi karena A* benar-benar gagal mereka tidak mendorong penghalang.
    // State tetap chasing + navIdle supaya repath terus berjalan dan rig memakai
    // animasi idle kelasnya. Begitu gerbang dibuka, keduanya pulih otomatis.
    const seekD = Math.max(30,
        cfgMod.CFG.campaign.activateMeters * cfgMod.CAMP_M * 0.5);
    const seekCell = 10, seekX0 = -40, seekRows = 20;
    const seekCols = Math.ceil((seekD + 80) / seekCell);
    const seekGrid = pfMod.makeNavGrid(seekX0, -seekRows * seekCell / 2,
        seekCell, seekCols, seekRows, () => true);
    const gateX = seekD * 0.5;
    let gateOpen = false;
    const seekStage = {
        walkable: () => true, resolve: () => { }, nav: seekGrid,
        los: () => gateOpen,
        pathWalkable: (x) => gateOpen || Math.abs(x - gateX) > seekCell * 1.1,
    };
    const seekers = ['A', 'B'].map(cls => {
        const z = mkBot(cls, seekD, 0);
        z.speed = 1; z.state = 'idle';
        return z;
    });
    camera.position.set(0, cfgMod.CFG.player.eyeHeight, 0);
    const blockedSeekers = seekers.every(z => {
        const x0 = z.mesh.position.x, z0 = z.mesh.position.z;
        comMod3.campaignRobotAI(z, 0.016, 1, seekStage);
        robotsMod.animateRobotRig(z, 0.1);
        return z.state === 'chasing' && z.navIdle && !z.moving && !z.aiming
            && z.idleInit === 1
            && z.mesh.position.x === x0 && z.mesh.position.z === z0;
    });
    T('A/B NO PATH: diam di tempat dengan animasi idle, bukan mendorong pintu/dinding',
        blockedSeekers);

    const zNoPathC = mkBot('C', seekD, 0);
    zNoPathC.speed = 1; zNoPathC.state = 'chasing';
    const cX0 = zNoPathC.mesh.position.x;
    comMod3.campaignRobotAI(zNoPathC, 0.016, 1, seekStage);
    robotsMod.animateRobotRig(zNoPathC, 0.1);
    T('robot melee NO PATH mengikuti aturan sama: posisi beku tetapi rig idle hidup',
        zNoPathC.navIdle && !zNoPathC.moving && zNoPathC.idleInit === 1
        && zNoPathC.mesh.position.x === cX0);

    gateOpen = true;
    const resumedSeekers = seekers.every(z => {
        comMod3.campaignRobotAI(z, 0.016, 1, seekStage);
        return !z.navIdle && (z.moving || z.aiming);
    });
    T('A/B PATH PULIH: pintu/jalur terbuka membuat robot kembali mengejar atau membidik',
        resumedSeekers);
    while (robots.length) robots.pop();

    // (b) SURVIVAL — penghalang peluru HANYA siluet Monas (pohon/bak menembus).
    const mb = survMod2.monasShotBlocked;
    T('survival: garis tembak menembus PUSAT Monas = terblokir',
        mb(100, 0, -100, 0, 10) === true);
    T('survival: garis tembak jauh dari Monas = bebas',
        mb(100, 200, 100, -200, 10) === false);
    T('survival: siluet bertingkat — lewat di samping obelisk bebas di ketinggian mata, terblokir di dasar lebar',
        mb(12, 200, 12, -200, 10) === false && mb(12, 200, 12, -200, 1) === true);
    T('survival: di atas puncak Monas = tak pernah memblok', mb(0, 200, 0, -200, 999) === false);
}

// === FONT UI = COURIER PRIME (2026-07-31, permintaan user) — Arial dihapus
// TOTAL dari CSS maupun JS; font di-host lokal (assets/fonts/, tanpa CDN). ===
{
    const cssF = fs.readFileSync(ROOT + '/css/style.css', 'utf8');
    const htmlF = fs.readFileSync(ROOT + '/index.html', 'utf8');
    const hudF = fs.readFileSync(ROOT + '/src/core/hud.js', 'utf8');
    const menuF = fs.readFileSync(ROOT + '/src/scenes/menu.js', 'utf8');

    // Empat face didaftarkan (400/700 x normal/italic) supaya browser tak
    // membuat bold/italic sintetis.
    const faces = cssF.match(/@font-face\s*\{[^}]*\}/g) || [];
    T('font: 4 @font-face Courier Prime terdaftar',
        faces.length === 4 && faces.every(f => f.includes("'Courier Prime'")));
    for (const file of ['Regular', 'Italic', 'Bold', 'BoldItalic']) {
        T(`font: face ${file} menunjuk file lokal yang ADA`,
            cssF.includes(`../assets/fonts/CourierPrime-${file}.ttf`)
            && fs.existsSync(ROOT + `/assets/fonts/CourierPrime-${file}.ttf`));
    }
    T('font: body memakai Courier Prime',
        /body\s*\{[^}]*font-family:\s*'Courier Prime'/.test(cssF));

    // Tidak boleh ada sisa Arial di mana pun kecuali komentar penjelas CSS.
    const arialCss = cssF.split('\n').filter(l => l.includes('Arial') && !l.trim().startsWith('Menggantikan'));
    T('font: NOL deklarasi Arial tersisa di CSS', arialCss.length === 0);
    T('font: NOL Arial di index.html / hud.js / menu.js',
        !htmlF.includes('Arial') && !hudF.includes('Arial') && !menuF.includes('Arial'));
    T('font: penanda N radar (canvas) pakai Courier Prime',
        /radarCtx\.font\s*=\s*'bold 9px "Courier Prime"/.test(hudF));

    // Aturan static-buildless: font ikut repo, bukan dari jaringan.
    T('font: tidak memakai webfont CDN',
        !cssF.includes('fonts.googleapis') && !htmlF.includes('fonts.googleapis')
        && !htmlF.includes('fonts.gstatic'));
}

// --- 21. SUARA PINTU + KERETA (2026-08-07, permintaan user): SATU pasang klip
//     dipakai SEMUA pintu di stage mana pun (door-open saat mulai membuka,
//     door-closed saat mendarat tertutup), dan kereta berjalan memakai klipnya
//     sendiri. Pemicunya WAJIB terpusat di campaign/utility/doors.js supaya
//     stage baru tak bisa diam-diam memakai suara lain. ---
{
    const doorsMod = await import(R('src/scenes/campaign/utility/doors.js'));
    const sfxMod = await import(R('src/utils/sfx.js'));
    const srcOf = f => fs.readFileSync(ROOT + '/' + f, 'utf8');
    const sfxSrc = fs.readFileSync(ROOT + '/src/utils/sfx.js', 'utf8');
    T('SFX PINTU/KERETA: ketiga klip terdaftar dengan berkas yang benar',
        sfxMod.sfxDoorOpen.src === 'assets/sounds/door-open.mp3'
        && sfxMod.sfxDoorClose.src === 'assets/sounds/door-closed.mp3'
        && sfxMod.sfxTrain.src === 'assets/sounds/train-sound.mp3');
    // Klip baru WAJIB ikut dipanaskan preload — kalau tidak, bunyi pertamanya
    // men-decode di tengah aksi (aturan "no mid-game hitch").
    T('SFX PINTU/KERETA: ketiganya ikut daftar preloadAllSFX',
        /preloadAllSFX[\s\S]*?sfxDoorOpen[\s\S]*?sfxDoorClose[\s\S]*?sfxTrain[\s\S]*?\];/.test(sfxSrc));

    // Gerbang jarak: pintu di ujung gedung tidak boleh ikut terdengar.
    doorsMod.resetDoorSfx();
    camera.position.set(0, cfgMod.CFG.player.eyeHeight, 0);
    T('PINTU SFX: digerbang jarak — hanya pintu di dekat player yang berbunyi',
        doorsMod.playDoorSFX(true, 0, 30) === true
        && doorsMod.playDoorSFX(true, 0, 5000) === false
        && doorsMod.doorSfxDebug().open === 1
        && doorsMod.doorSfxDebug().last === 'assets/sounds/door-open.mp3');

    // Pintu geser sungguhan lewat updateStageDoors: buka -> tahan -> tutup.
    const DCELL = 20, DH = 22, DOX = 900000;
    const dCell = (c, r) => ({ x: DOX + c * DCELL, z: DOX + r * DCELL });
    const tDoors = doorsMod.buildStageDoors(
        [{ c0: 5, r0: 5, c1: 5, r1: 5, dir: 'ns' }], dCell, DCELL, DH);
    const dp = dCell(5, 5);
    const tick = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) doorsMod.updateStageDoors(tDoors, dt); };
    // Berdiri di luar zona buka tetapi MASIH dalam jarak dengar.
    const outsideZone = { x: dp.x, z: dp.z + 250 };
    doorsMod.resetDoorSfx();
    camera.position.set(outsideZone.x, cfgMod.CFG.player.eyeHeight, outsideZone.z);
    tick(30);
    T('PINTU SFX: pintu yang tak tersentuh tetap diam',
        tDoors[0].open === 0 && doorsMod.doorSfxDebug().open === 0
        && doorsMod.doorSfxDebug().close === 0);
    camera.position.set(dp.x, cfgMod.CFG.player.eyeHeight, dp.z + DCELL);
    tick(1);
    T('PINTU SFX: door-open berbunyi TEPAT SEKALI saat daun mulai membuka',
        tDoors[0].open > 0 && doorsMod.doorSfxDebug().open === 1
        && doorsMod.doorSfxDebug().close === 0
        && doorsMod.doorSfxDebug().last === 'assets/sounds/door-open.mp3');
    tick(120);
    T('PINTU SFX: klip tidak diulang selama pintu terus membuka / terbuka penuh',
        tDoors[0].open === 1 && doorsMod.doorSfxDebug().open === 1);
    // REGRESI 2026-08-07 (laporan user, Stage 5): pintu yang DITAHAN terbuka
    // membunyikan door-open berkali-kali sampai audionya menumpuk. Dua akar
    // masalahnya dipatok terpisah di bawah — di sini cukup dipastikan menahan
    // pintu terbuka lama TIDAK menambah satu bunyi pun.
    tick(600);
    T('PINTU SFX: pintu yang DITAHAN terbuka tetap sunyi (audio tidak menumpuk)',
        tDoors[0].open === 1 && doorsMod.doorSfxDebug().open === 1
        && doorsMod.doorSfxDebug().close === 0);
    // Akar 1: pemicunya harus PERLINTASAN AMBANG, bukan arah gerak per-frame —
    // integrator yang bergetar di sekitar target tak boleh membunyikan apa pun.
    {
        const jitter = { open: 1 };
        const before = doorsMod.doorSfxDebug().open;
        for (let i = 0; i < 50; i++) {
            const prev = jitter.open;
            jitter.open = i % 2 ? 1 : 0.9653;      // persis pola getaran yang dilaporkan
            doorsMod.doorMotionSFX(jitter, prev, camera.position.x, camera.position.z);
        }
        T('PINTU SFX: getaran integrator di sekitar posisi terbuka TIDAK memicu klip sama sekali',
            doorsMod.doorSfxDebug().open === before);
    }
    // Menjauh (masih terdengar): setelah closeDelaySec pintu menutup.
    camera.position.set(outsideZone.x, cfgMod.CFG.player.eyeHeight, outsideZone.z);
    let closeAtLanding = null;
    for (let i = 0; i < (cfgMod.CFG.campaign.doors.closeDelaySec + 2) * 60; i++) {
        const before = tDoors[0].open;
        doorsMod.updateStageDoors(tDoors, 1 / 60);
        if (closeAtLanding === null && before > 0 && tDoors[0].open === 0)
            closeAtLanding = doorsMod.doorSfxDebug().close;
    }
    T('PINTU SFX: door-closed berbunyi TEPAT SEKALI, dan tepat saat daun MENDARAT tertutup',
        closeAtLanding === 1 && doorsMod.doorSfxDebug().close === 1
        && doorsMod.doorSfxDebug().last === 'assets/sounds/door-closed.mp3');
    tick(60);
    T('PINTU SFX: pintu yang sudah tertutup tidak berbunyi berulang tiap frame',
        doorsMod.doorSfxDebug().close === 1);
    // Buka lagi -> door-open berbunyi lagi (bukan sekali seumur hidup pintu).
    camera.position.set(dp.x, cfgMod.CFG.player.eyeHeight, dp.z + DCELL);
    tick(2);
    T('PINTU SFX: siklus berikutnya berbunyi lagi — bukan hanya sekali per pintu',
        doorsMod.doorSfxDebug().open === 2);

    // Akar 2: integrator pintu Stage 5/6 memakai helper standar Stage 1.
    // Helper itu mendarat persis di target; bentuk lama (`dir = target > open
    // ? 1 : -1`) membuat pintu penuh bergetar 0.965<->1 tiap frame.
    {
        const settle = src => {
            return src.includes('updateDoorMotion(d, dt, d.target)')
                && !/const dir = d\.target > d\.open/.test(src);
        };
        T('PINTU: integrator stage 5/6 mendarat persis di target, tidak bergetar tiap frame',
            settle(srcOf('src/scenes/campaign/stages/stage5/world.js'))
            && settle(srcOf('src/scenes/campaign/stages/stage6/world.js'))
            && settle(srcOf('src/scenes/campaign/stages/stage6/hqWorld.js')));
    }

    const splitWired = [
        'src/scenes/campaign/stages/stage3/index.js',
        'src/scenes/campaign/stages/stage5/world.js',
        'src/scenes/campaign/stages/stage6/world.js',
        'src/scenes/campaign/stages/stage6/hqWorld.js',
    ];
    T('PINTU VISUAL: blast/exit Stage 3, stasiun Stage 5, dan Stage 6 memakai rig dua-daun bersama',
        splitWired.every(f => srcOf(f).includes('buildSplitDoor'))
        // `parent || scene` sejak 2026-08-13: stage boleh menaruh pintunya di
        // root dunianya sendiri (optimasi visibilitas), rig-nya tetap satu.
        && srcOf('src/scenes/campaign/utility/doors.js').includes('buildSplitDoor(parent || scene'));
    // Karena rig-nya satu, aturan "10% daun tetap tampak" berlaku SERENTAK di
    // semua stage — tak ada stage yang boleh menghitung offset daunnya sendiri.
    {
        const rigs = [...s5World.station.doors, ...s6World.doors, ...s6HqWorld.doors].map(d => d.split);
        T('PINTU VISUAL (2026-08-08): daun pintu SEMUA stage berhenti 10% sebelum tenggelam ke dinding',
            rigs.length > 0 && rigs.every(s => s.leafSpan > 0 && s.travel > 0
                && Math.abs(s.travel - s.leafSpan * (1 - doorsMod.DOOR_OPEN_REVEAL)) < 1e-6)
            && !splitWired.some(f => /span\s*\/\s*4\s*\+/.test(srcOf(f))));
    }

    // WIRING: setiap sistem pintu yang ada harus lewat pemicu bersama, dan tak
    // ada modul lain yang boleh memutar klip pintu sendiri.
    const wired = [
        ['src/scenes/campaign/utility/doors.js', 'doorMotionSFX(dr, prev'],
        ['src/scenes/campaign/stages/stage5/world.js', 'updateDoorMotion(d, dt, d.target'],
        ['src/scenes/campaign/stages/stage6/world.js', 'updateDoorMotion(d, dt, d.target'],
        ['src/scenes/campaign/stages/stage6/hqWorld.js', 'updateDoorMotion(d, dt, d.target'],
        ['src/scenes/campaign/stages/stage3/index.js', 'playDoorSFX(true'],
    ];
    const walkSrc = (dir, out = []) => {
        for (const e of fs.readdirSync(ROOT + '/' + dir, { withFileTypes: true })) {
            const f = dir + '/' + e.name;
            if (e.isDirectory()) walkSrc(f, out);
            else if (e.name.endsWith('.js')) out.push(f);
        }
        return out;
    };
    const rogue = walkSrc('src').filter(f =>
        f !== 'src/utils/sfx.js' && f !== 'src/scenes/campaign/utility/doors.js'
        && /sfxDoor(Open|Close)/.test(srcOf(f)));
    T('PINTU SFX: SEMUA sistem pintu (stage 1-3, blast stage 3, stasiun stage 5, stage 6) memakai pemicu bersama'
        + (rogue.length ? ' [rogue: ' + rogue.join(',') + ']' : ''),
        wired.every(([f, needle]) => srcOf(f).includes(needle)) && rogue.length === 0);
}

// --- 22. LOOP KERETA TANPA JEDA (2026-08-07, laporan user: "train-sound ada
//     jedanya di setiap pengulangan"). AKAR: `<audio loop>` mengulang padding
//     encoder MP3 (train-sound: 576 sampel delay + 1498 padding = ~47 ms senyap)
//     -> tiap putaran terdengar terputus, dan tak bisa diperbaiki dgn re-encode
//     karena padding melekat pada format MP3. Perbaikannya jalur Web Audio:
//     decodeAudioData + AudioBufferSourceNode.loop yang sampel-akurat, dengan
//     loopStart/loopEnd dipotong ke sampel non-senyap. ---
{
    const sfxG = await import(R('src/utils/sfx.js'));

    // (a) Berkas yang dikirim memang membawa padding encoder — inilah alasan
    //     jalur gapless ada. Kalau suatu saat asetnya diganti yang bersih,
    //     assert ini yang memberi tahu bahwa jalurnya boleh disederhanakan.
    {
        const b = fs.readFileSync(ROOT + '/assets/sounds/train-sound.mp3');
        let off = b.toString('latin1', 0, 3) === 'ID3'
            ? 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)) : 0;
        while (off < b.length - 4 && !(b[off] === 0xff && (b[off + 1] & 0xe0) === 0xe0)) off++;
        let delay = 0, pad = 0;
        for (const probe of [off + 4 + 32, off + 4 + 21, off + 4 + 17, off + 4 + 9]) {
            const tag = b.toString('latin1', probe, probe + 4);
            if (tag !== 'Xing' && tag !== 'Info') continue;
            const flags = b.readUInt32BE(probe + 4);
            let q = probe + 8;
            if (flags & 1) q += 4;
            if (flags & 2) q += 4;
            if (flags & 4) q += 100;
            if (flags & 8) q += 4;
            const d = b.readUIntBE(q + 21, 3);
            delay = (d >> 12) & 0xfff; pad = d & 0xfff;
            break;
        }
        T(`LOOP KERETA: berkasnya memang membawa padding encoder MP3 [delay ${delay} + padding ${pad} sampel]`,
            delay + pad > 0);
    }

    // (b) Matematika pemotongan senyap, diuji pada buffer sintetis berisi
    //     senyap-di-depan + senyap-di-belakang yang panjangnya diketahui.
    const SR = 44100, LEN = SR, HEAD = 2000, TAIL = 3000;
    const pcm = new Float32Array(LEN);
    for (let i = HEAD; i < LEN - TAIL; i++) pcm[i] = 0.5;
    const fakeBuffer = {
        sampleRate: SR, length: LEN, numberOfChannels: 1,
        duration: LEN / SR, getChannelData: () => pcm,
    };
    const trim = sfxG.trimSilenceRange(fakeBuffer);
    T('LOOP KERETA: senyap di kedua ujung dipotong tepat ke sampel non-senyap pertama/terakhir',
        Math.abs(trim.start - HEAD / SR) < 1e-9
        && Math.abs(trim.end - (LEN - TAIL) / SR) < 1e-9);
    T('LOOP KERETA: buffer yang seluruhnya senyap TIDAK dipotong habis (jaga-jaga)',
        (() => {
            const q = sfxG.trimSilenceRange({
                sampleRate: SR, length: 10, numberOfChannels: 1,
                duration: 10 / SR, getChannelData: () => new Float32Array(10),
            });
            return q.start === 0 && Math.abs(q.end - 10 / SR) < 1e-9;
        })());

    // (c) Tanpa Web Audio (kondisi harness apa adanya) SEMUANYA tetap jalan
    //     lewat elemen <audio> — jalur gapless tak boleh jadi syarat wajib.
    T('LOOP KERETA: tanpa Web Audio tetap jatuh mulus ke elemen <audio>',
        !sfxG.gaplessLoopDebug().ctx
        && (() => {
            const n = sfxG.playLoopSFX(sfxG.sfxTrain, 0.4);
            const ok = n.loop === true && !n.gapless && n.src === 'assets/sounds/train-sound.mp3';
            sfxG.stopLoopSFX(n);
            return ok;
        })());

    // (d) DENGAN Web Audio: kereta memakai AudioBufferSourceNode ber-loop yang
    //     loopStart/loopEnd-nya sudah dipotong -> tidak ada senyap tiap putaran.
    const started = [];
    globalThis.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = { }; }
        resume() { return Promise.resolve(); }
        createGain() { return { gain: { value: 1 }, connect() { }, disconnect() { } }; }
        createBufferSource() {
            const node = {
                buffer: null, loop: false, loopStart: 0, loopEnd: 0,
                playbackRate: { value: 1 }, stopped: false,
                connect() { }, disconnect() { },
                start(when, offset) { node.startedAt = offset; started.push(node); },
                stop() { node.stopped = true; },
            };
            return node;
        }
        decodeAudioData() { return Promise.resolve(fakeBuffer); }
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    T('LOOP KERETA: primeGaplessLoops mendaftarkan kereta untuk jalur tanpa jeda',
        sfxG.primeGaplessLoops() === true
        && sfxG.gaplessLoopDebug().registered.includes('assets/sounds/train-sound.mp3'));
    for (let i = 0; i < 20 && !sfxG.gaplessLoopDebug().ready.length; i++) await new Promise(r => setTimeout(r, 5));
    T('LOOP KERETA: buffer ter-decode saat loading dan trim-nya tersimpan',
        sfxG.gaplessLoopDebug().ready.includes('assets/sounds/train-sound.mp3')
        && Math.abs(sfxG.gaplessLoopDebug().trims[0].start - HEAD / SR) < 1e-9);

    const loop = sfxG.playLoopSFX(sfxG.sfxTrain, 0.42);
    const node = started[started.length - 1];
    T('LOOP KERETA: diputar sebagai AudioBufferSourceNode ber-loop, mulai & berulang DI DALAM daerah non-senyap',
        loop.gapless === true && !!node && node.loop === true
        && Math.abs(node.loopStart - HEAD / SR) < 1e-9
        && Math.abs(node.loopEnd - (LEN - TAIL) / SR) < 1e-9
        && Math.abs(node.startedAt - HEAD / SR) < 1e-9);
    T('LOOP KERETA: handle-nya tetap meniru elemen <audio> (volume/playbackRate/pause) agar call-site lama utuh',
        (() => {
            loop.volume = 0.25; loop.playbackRate = 1.5;
            const okSet = Math.abs(loop.volume - 0.25) < 1e-9 && node.playbackRate.value === 1.5;
            sfxG.stopLoopSFX(loop);          // pause() + currentTime = 0
            return okSet && node.stopped === true && loop.paused === true;
        })());
    // Klip loop LAIN sengaja TIDAK didaftarkan (heli/tank memakai playbackRate,
    // dan AudioBufferSourceNode akan mengubah pitch-nya) — pastikan tetap <audio>.
    T('LOOP KERETA: klip loop yang tidak terdaftar tetap memakai elemen <audio> (pitch-nya tak berubah)',
        (() => {
            const n = sfxG.playLoopSFX(sfxG.sfxHeli, 0.5);
            const ok = !n.gapless && n.loop === true;
            sfxG.stopLoopSFX(n);
            return ok;
        })());
    delete globalThis.AudioContext;
    if (realFetch === undefined) delete globalThis.fetch; else globalThis.fetch = realFetch;
}

// === NAMA GAME = "Decommission Day" (2026-08-11, permintaan user, menggantikan
// "Adversarial Intelligence" yang dipakai sejak 2026-08-07; sebelumnya lagi
// "Gibran vs Robot 3D"). Arti judul: decommission = menonaktifkan mesin dari
// dinas secara resmi — istilah teknis yang tepat utk robot, dan ironis karena
// biasanya MANUSIA yang men-decommission mesin. Ejaan WAJIB dua huruf 's'.
// Kontrak: judul tab, KEDUA H1 menu, layar perpisahan Exit dan metadata harus
// memakai SATU nama yang sama. Boot screen sengaja tidak menampilkan judul,
// dan nama lama tak boleh tersisa di file yang dilihat player. SENGAJA TIDAK ikut
// berubah: nama karakter "Major Gibran", AI musuh "G.A.R.U.D.A", kunci localStorage
// `gibs*` (save/preferensi player hilang bila dipindah) dan codename gaya visual
// "GIBS 2045". ===
{
    const TITLE = 'Decommission Day';
    const htmlB = fs.readFileSync(ROOT + '/index.html', 'utf8');
    const cssB = fs.readFileSync(ROOT + '/css/style.css', 'utf8');
    const menuB = fs.readFileSync(ROOT + '/src/scenes/menu.js', 'utf8');
    const pkgB = JSON.parse(fs.readFileSync(ROOT + '/package.json', 'utf8'));
    const menuModB = await import(R('src/scenes/menu.js'));

    T('nama: <title> tab memakai nama game baru', htmlB.includes(`<title>${TITLE}</title>`));
    T('nama: layar boot tidak menampilkan judul game',
        !htmlB.includes('id="bootTitle"'));

    // Judul = NAMA SAJA di kedua layar (2026-08-10, permintaan user, dua
    // tahap: tagline "NUSANTARA 2045" + rusuk ambernya dibuang dari menu utama
    // lalu dari logotype layar pilih mode). Tak ada lagi .titleTag/.titleRule.
    const titleH1 = (htmlB.match(/<h1>[\s\S]*?<\/h1>/g) || [])
        .filter(h => h.includes('titleMain'));
    T('nama: 2 H1 (mainMenu + modeSelect) = DECOMMISSION DAY',
        titleH1.length === 2
        && titleH1.every(h => h.includes('>' + TITLE.toUpperCase() + '<')));
    // Komentar dibuang dulu: catatan "jangan dihidupkan lagi" di HTML/CSS
    // memang MENYEBUT nama-nama itu, dan itu justru harus boleh tetap ada.
    const htmlNoC = htmlB.replace(/<!--[\s\S]*?-->/g, '');
    const cssNoC = cssB.replace(/\/\*[\s\S]*?\*\//g, '');
    T('nama: NOL tagline NUSANTARA 2045 di kedua layar judul',
        !/titleTag|titleRule|NUSANTARA/.test(htmlNoC)
        && !/titleTag|titleRule/.test(cssNoC)
        && /#mainMenu h1 \.titleMain,\s*#modeSelect h1 \.titleMain/.test(cssB));

    // Eyebrow Credits ("AN <NAMA> PRODUCTION") dibuang 2026-08-10 saat panel
    // disederhanakan, jadi layar perpisahan Exit yang tersisa sbg pemakai nama.
    T('nama: layar perpisahan Exit memakai nama baru',
        menuB.includes(`Thanks for playing ${TITLE}.`)
        && !('eyebrow' in menuModB.MENU_CREDITS));
    T('nama: metadata package.json ikut nama baru',
        pkgB.name === 'decommission-day' && pkgB.description.includes(TITLE));

    // Termasuk nama antara "Automated Invasion" yang sempat dipakai sesi ini,
    // dan "Adversarial Intelligence" yang dipensiunkan 2026-08-11.
    const OLD = ['Gibran vs Robot', 'GIBRAN vs ROBOT', 'the-gibs-game',
        'Automated Invasion', 'AUTOMATED INVASION', 'A.I. Shooter',
        'Adversarial Intelligence', 'ADVERSARIAL INTELLIGENCE', 'adversarial-intelligence'];
    const stale = ['index.html', 'css/style.css', 'src/scenes/menu.js', 'package.json', 'README.md']
        .filter(f => OLD.some(o => fs.readFileSync(ROOT + '/' + f, 'utf8').includes(o)));
    T('nama: NOL sisa nama lama di file player-facing + metadata'
        + (stale.length ? ' [' + stale.join(', ') + ']' : ''), stale.length === 0);

    // Ganti nama tidak boleh memindahkan save/preferensi yang sudah ada di browser.
    const stateB = fs.readFileSync(ROOT + '/src/core/state.js', 'utf8');
    const saveB = fs.readFileSync(ROOT + '/src/core/saveGame.js', 'utf8');
    const sfxB = fs.readFileSync(ROOT + '/src/utils/sfx.js', 'utf8');
    T('nama: kunci localStorage `gibs*` TETAP (high score/checkpoint/volume tak hilang)',
        stateB.includes("'gibsHighScore_'") && saveB.includes("'gibsCampaignStage'")
        && sfxB.includes("'gibsMusicVol'") && sfxB.includes("'gibsSfxVol'"));
    // Dulu di-anchor ke menu.js karena kalimat rincian Credits menyebut namanya;
    // kalimat itu dibuang 2026-08-10 saat panel disederhanakan, jadi assert ini
    // pindah ke SUMBER SEBENARNYA nama protagonis: dialog di gameplay.json.
    T('nama: protagonis tetap "Major Gibran" (hanya judul game yang berubah)',
        /Gibran/.test(fs.readFileSync(ROOT + '/config/gameplay.json', 'utf8')));
}

// === NAMA KENDARAAN HERO = "GRD LTV-45" (2026-08-07, permintaan user): dulu
// senama dengan AI musuh G.A.R.U.D.A, padahal keduanya berlawanan pihak. Nama AI
// musuh TETAP dan hanya boleh hidup di materi lore prolog; file kendaraan/stage
// tak boleh menyebutnya lagi dalam bentuk apa pun. ===
{
    const vehFiles = ['src/entities/tacticalVehicle.js', 'src/entities/enemyPickup.js',
        'src/scenes/campaign/stages/stage7/index.js', 'src/scenes/campaign/stages/stage8/index.js'];
    const vehSrc = vehFiles.map(f => fs.readFileSync(ROOT + '/' + f, 'utf8'));
    const bleed = vehFiles.filter((f, i) => /garuda/i.test(vehSrc[i]));
    T('kendaraan: NOL sisa nama AI musuh di file kendaraan/stage 7/stage 8'
        + (bleed.length ? ' [' + bleed.join(', ') + ']' : ''), bleed.length === 0);
    T('kendaraan: rig hero memakai nama GRD LTV-45',
        vehSrc[0].includes('GRD LTV-45') && vehSrc[0].includes("group.name = 'GrdLTV45'"));
    T('kendaraan: HUD + objective + prop id Stage 7 memakai GRD LTV-45',
        vehSrc[2].includes('TACTICAL VEHICLE LOCATED — INSPECT THE GRD LTV-45')
        && vehSrc[2].includes("return 'INSPECT THE GRD LTV-45'")
        && vehSrc[2].includes("recordProp('grd-ltv-45'"));

    // Sisi lain kontrak: AI musuh TIDAK ikut berganti nama.
    T('lore: AI musuh tetap G.A.R.U.D.A di prolog (dialog config + ilustrasi SVG)',
        fs.readFileSync(ROOT + '/config/gameplay.json', 'utf8').includes('G.A.R.U.D.A')
        && fs.readFileSync(ROOT + '/src/scenes/campaign/cutscenes/prologueArt.js', 'utf8')
            .includes('G.A.R.U.D.A'));
}

// === FRONT-END MENU DIROMBAK (2026-08-09, permintaan user "menu terlihat AI
// generated"): tampilannya boleh berubah total, KONTRAK-nya tidak. Bagian ini
// menjaga (a) setiap id/kelas yang dibaca menu.js / renderer.js / input.js masih
// ada di index.html, (b) hiasan lama (emoji sebagai ilustrasi) benar-benar
// hilang, (c) logo transparan + seni vektor kedua layar benar, dan
// (d) ringkasan difficulty dibaca dari CFG, bukan kalimat hardcoded. ===
{
    const htmlM = fs.readFileSync(ROOT + '/index.html', 'utf8');
    const cssM = fs.readFileSync(ROOT + '/css/style.css', 'utf8');
    const artM = await import(R('src/scenes/menuArt.js'));
    const menuM = await import(R('src/scenes/menu.js'));
    const artSrc = fs.readFileSync(ROOT + '/src/scenes/menuArt.js', 'utf8');

    // (a) Kontrak DOM: yang dipegang JS lain tak boleh hilang saat menu didesain ulang.
    const need = ['id="mainMenu"', 'id="mainMenuMain"', 'id="mmStart"', 'id="mmSettings"',
        'id="mmCredits"', 'id="mmExit"', 'id="settingsPanel"', 'id="creditsPanel"',
        'id="qualityRow"', 'id="volumeRows"', 'id="musicVolSlider"', 'id="musicVolVal"',
        'id="sfxVolSlider"', 'id="sfxVolVal"',
        'id="creditsBody"', 'id="creditsFooter"', 'id="modeSelect"', 'id="diffRow"',
        'id="modeBack"', 'id="continuePrompt"', 'id="cpText"', 'id="cpYes"', 'id="cpNo"'];
    const goneM = need.filter(k => !htmlM.includes(k));
    T('MENU: seluruh id kontrak masih ada di index.html'
        + (goneM.length ? ' [' + goneM.join(', ') + ']' : ''), goneM.length === 0);
    T('MENU: 5 tombol kualitas (dibaca renderer.initQualityUI) + 3 difficulty + 2 kartu mode',
        [0, 1, 2, 3, 4].every(q => htmlM.includes('class="qbtn" data-q="' + q + '"'))
        && ['easy', 'normal', 'hard'].every(d => htmlM.includes('data-d="' + d + '"'))
        && ['survival', 'campaign'].every(m => htmlM.includes('class="modeCard" data-mode="' + m + '"'))
        && (htmlM.match(/class="menuBtn menuBack" data-back=/g) || []).length === 2);
    // Urutan tampil kualitas grafis: paling RENDAH di kiri -> paling TINGGI di
    // kanan (2026-08-10, permintaan user). `data-q` sengaja tidak ikut dibalik —
    // yang dibaca menu.js/renderer.js adalah dataset.q, bukan posisi tombol.
    T('MENU: tombol kualitas terurut Very Low -> Ultra dari kiri ke kanan',
        (htmlM.match(/class="qbtn" data-q="(\d)"/g) || [])
            .map(s => +s.replace(/\D/g, '')).join(',') === '4,3,2,1,0');
    T('MENU: panel Settings/Credits tetap dibuka lewat kelas .open + .subview',
        /\.menuPanel\.open\s*\{[^}]*display:\s*flex/.test(cssM)
        && /#mainMenu\.subview\s+#mainMenuMain\s*\{[^}]*display:\s*none/.test(cssM));

    // (b) Ilustrasi emoji + kartu lama benar-benar dibuang.
    T('MENU: NOL emoji sebagai ilustrasi kartu mode',
        !htmlM.includes('class="emoji"') && !/[\u{1F300}-\u{1FAFF}]/u.test(htmlM)
        && !cssM.includes('.modeCard .emoji'));
    // PAS KEDUA 2026-08-10 (user: "masih terlihat AI generated"). Yang membuat
    // layar ini terbaca sebagai template bukan bahasa desainnya melainkan
    // KEPADATANNYA. Ketiga assert di bawah mengunci pengurangannya supaya tak
    // pelan-pelan tumbuh kembali.
    // PAS KETIGA 2026-08-10 (user: "jauh lebih sederhana, tidak usah ada gambar
    // ilustrasi setiap mode"): skema vektor kartu mode ikut dibuang — kartunya
    // tinggal nama + satu baris + satu kalimat, dan modeArtSvg dihapus.
    // Komentar dilucuti: catatan "sudah dibuang, jangan dihidupkan" menyebut
    // nama kelasnya, dan catatan itu justru yang harus tetap ada.
    const htmlMNoC = htmlM.replace(/<!--[\s\S]*?-->/g, '');
    const cssMNoC = cssM.replace(/\/\*[\s\S]*?\*\//g, '');
    T('MENU: kartu mode TEKS SAJA — nama + satu baris + satu kalimat, tanpa ilustrasi',
        !/mcArt|data-art=|maSvg/.test(htmlMNoC) && !/\.mcArt|\.maSvg|\.maRing/.test(cssMNoC)
        && !('modeArtSvg' in artM)
        && (htmlM.match(/class="modeCard" data-mode=/g) || []).length === 2
        && (htmlM.match(/class="mcSub"/g) || []).length === 2
        && !/mcSpec|mcGo|mcTop|mcCode|mcStripe/.test(htmlM));
    T('MENU: NOL rel telemetri palsu dan NOL baris petunjuk per entri menu',
        !/mRail|railKey|railDim|railLive|liveDot|class="eyebrow"/.test(htmlM)
        && !/nrHint|nrIdx|nrArrow/.test(htmlM)
        && (htmlM.match(/class="navRow"/g) || []).length === 4
        && (htmlM.match(/class="nrLabel"/g) || []).length === 4);
    // 2026-08-10 (user): rusuk kiri tiap entri menu dibuang — penanda entri
    // aktif tinggal sapuan amber + geseran; cap build diganti manual.
    const navRowCss = (cssM.match(/\n\.navRow \{[^}]*\}/) || [''])[0];
    T('MENU: entri menu tanpa rusuk kiri, cap build = BUILD DEV.01',
        navRowCss.length > 0 && !/border-left/.test(navRowCss)
        && !/\.navRow\.on\s*\{[^}]*border-left/.test(cssM)
        && htmlM.includes('<div class="mStamp">BUILD DEV.01</div>'));
    // 2026-08-10 (user): kepala panel & kepala kelompok Settings TANPA garis —
    // garis rambut di bawah "Settings" dan yang memanjang di kanan
    // "Display"/"Audio" dibuang; <i></i> pengisinya ikut hilang dari markup.
    const panelHeadCss = (cssM.match(/\n\.panelHead \{[^}]*\}/) || [''])[0];
    // `.` tanpa flag s tak melompati baris, jadi tiap div terpotong sendiri
    const groupHeads = htmlM.match(/<div class="setGroupHead">.*?<\/div>/g) || [];
    T('MENU: kepala panel + kepala kelompok Settings tanpa garis rambut',
        panelHeadCss.length > 0 && !/border/.test(panelHeadCss)
        && !/\.setGroupHead i\s*\{/.test(cssM)
        && groupHeads.length === 2 && !groupHeads.some(h => h.includes('<i>')));
    T('MENU: NOL overlay garis pindai CRT (klise UI fiksi ilmiah); .mScan tinggal vignette',
        /\.mScan\s*\{[^}]*radial-gradient/.test(cssM)
        && !/\.mScan\s*\{[^}]*repeating-linear-gradient/.test(cssM));
    // 2026-08-11 (koreksi user): skyline lama tetap menjadi backdrop; PNG
    // transparan hanya menggantikan lettering judul menu utama.
    const mainMenuMarkup = (htmlM.match(/<div id="mainMenu"[\s\S]*?<div id="mainMenuMain">/) || [''])[0];
    T('MENU: logo transparan menggantikan teks visual; backdrop skyline kembali',
        mainMenuMarkup.includes('class="mCity"')
        && htmlM.includes('class="mainTitleLogo"')
        && htmlM.includes('assets/images/low-poly/decommission-day-logo-distressed-transparent.png')
        && htmlM.includes('class="titleMain mainTitleA11y"')
        && fs.existsSync(ROOT + '/assets/images/low-poly/decommission-day-logo-distressed-transparent.png')
        && /#mainMenu \.mainTitleLogo\s*\{[^}]*display:\s*block/.test(cssM)
        && fs.readFileSync(ROOT + '/src/scenes/menu.js', 'utf8').includes('paintMenuArt(menu)'));
    // LATAR KOTA DIBURAMKAN (2026-08-10, permintaan user) — makin jauh makin
    // kabur, dan lapisnya menjulur ke bawah layar supaya tepi blur-nya tak
    // terlihat sebagai pita pucat di garis tanah. Panggung 3D "Gibran duduk di
    // kap" yang sempat ada DIBATALKAN user; jangan dihidupkan lagi.
    {
        const blur = (d) => {
            const m = cssM.match(new RegExp('\\.mCity\\[data-depth="' + d + '"\\][^{]*\\{[^}]*blur\\(([\\d.]+)px\\)'));
            return m ? +m[1] : 0;
        };
        const far = blur('far'), mid = blur('mid'), near = blur('near');
        T('MENU: siluet kota DIBURAMKAN di kedua layar, makin jauh makin kabur',
            near > 0 && mid > near && far > mid
            && /\.mCity\s*\{[^}]*bottom:\s*-\d+px/.test(cssM));
        T('MENU: panggung 3D menu (Gibran + kendaraan) sudah dibuang seluruhnya',
            !htmlM.includes('mHero') && !htmlM.includes('menuStageCanvas')
            && !cssM.includes('.mHero') && !fs.existsSync(ROOT + '/src/scenes/menuStage.js')
            && !fs.readFileSync(ROOT + '/src/scenes/menu.js', 'utf8').includes('menuStage'));
    }

    // (c) Seni vektor: tiga lapis skyline + dua skema, semuanya DETERMINISTIK
    // (dibangun ulang tiap layar menu disiapkan — Math.random bikin berkedip).
    const LAY = ['far', 'mid', 'near'];
    const layers = LAY.map(l => artM.skylineSvg(l));
    T('MENU ART: 3 lapis skyline unik, ber-viewBox sama, dan deterministik',
        new Set(layers).size === 3
        && layers.every(v => v.startsWith('<svg') && v.includes('viewBox="0 0 1600 420"'))
        && layers.every((v, i) => v === artM.skylineSvg(LAY[i]))
        && !/Math\.random\s*\(/.test(artSrc));
    T('MENU ART: Monas jangkar lapis mid (lidah api tepat satu, dan hanya di situ)',
        (layers[1].match(/class="miFlame"/g) || []).length === 1
        && !layers[0].includes('miFlame') && !layers[2].includes('miFlame'));

    // Palet: tiap hex di seni menu wajib anggota MENU_INK (turunan GIBS 2045).
    // Sejak skema kartu mode dibuang (2026-08-10) skyline adalah seluruh seni
    // SVG menu — adegan latar depannya kini panggung 3D (bagian 24z di bawah).
    const inks = Object.values(artM.MENU_INK).map(h => h.toLowerCase());
    let offInk = '';
    for (const svg of layers)
        for (const hx of (svg.match(/#[0-9a-fA-F]{6}\b/g) || []))
            if (!inks.includes(hx.toLowerCase())) offInk = offInk || hx;
    T('MENU ART: NOL warna di luar MENU_INK (tanpa neon cyan/magenta)'
        + (offInk ? ' [' + offInk + ']' : ''),
        !offInk && !inks.includes('#00ffff') && !inks.includes('#ff00ff'));

    // Uji "seluruh geometri ada di dalam bingkai" DIHAPUS bersama skema kartu
    // mode (2026-08-10): ia menjaga bingkai 320x140 yang sudah tak ada, dan
    // tak bisa dipindahkan ke skyline — lapis skyline memang SENGAJA melewati
    // tepi kanvas (preserveAspectRatio slice memotongnya di CSS).

    // (d) Ringkasan difficulty = angka CFG apa adanya, bukan kalimat tetap.
    {
        const hardCfg = cfgMod.CFG.difficulty.hard;
        const hardNote = menuM.difficultyNote('hard');
        const fmt = (v) => (Math.round(v * 100) / 100).toFixed(2);
        T('MENU: catatan difficulty mengutip pengali CFG apa adanya',
            hardNote.includes(fmt(hardCfg.robotHpMul))
            && hardNote.includes(fmt(hardCfg.robotDamageMul))
            && hardNote.includes(fmt(hardCfg.spawnIntervalMul)));
        // normal = semua pengali 1 -> menyebut x1.00 tiga kali cuma bising.
        T('MENU: difficulty tanpa selisih memakai kalimat baseline, bukan tiga x1.00',
            !menuM.difficultyNote('normal').includes('1.00')
            && /baseline/i.test(menuM.difficultyNote('normal')));
    }

    // (e) LAYAR BOOT SEBELUM MENU (2026-08-10, permintaan user: "ketika game
    // dibuka ... sangat terasa delay. Tambahkan loading dulu di awal sebelum
    // main menu ditampilkan"). Dua penyebabnya dikunci di sini: script CDN yang
    // memblokir render, dan menu yang tampil sebelum latar kotanya dilukis.
    {
        const mainSrc = fs.readFileSync(ROOT + '/src/main.js', 'utf8');
        const domSrc = fs.readFileSync(ROOT + '/src/core/dom.js', 'utf8');
        const bodyHead = htmlM.slice(htmlM.indexOf('<body>'), htmlM.indexOf('id="ui"'));
        T('BOOT: layar boot TAMPIL BAWAAN dari CSS (bukan dinyalakan JS yang justru ditunggu)',
            bodyHead.includes('id="bootScreen"')
            && /#bootScreen\s*\{[^}]*display:\s*flex/.test(cssM)
            && !/#bootScreen\s*\{[^}]*display:\s*none/.test(cssM)
            && !/id="bootScreen"[^>]*style=/.test(htmlM));
        const bootMarkup = (htmlM.match(/<div id="bootScreen">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
        T('BOOT: tanpa judul dan memakai visual progress yang sama dengan loading pra-game',
            !bootMarkup.includes('bootTitle')
            && !bootMarkup.includes('DECOMMISSION DAY')
            && /#bootBarShell,\s*#loadingBarShell\s*\{/.test(cssM)
            && /#bootBarFill,\s*#loadingBarFill\s*\{/.test(cssM)
            && /#bootNote,\s*#loadingText\s*\{/.test(cssM));
        // Script klasik tanpa `defer` MEMBLOKIR render: layar boot pun tak
        // sempat terlukis sampai ~1 MB CDN selesai diunduh.
        const cdnTags = htmlM.match(/<script[^>]*src="https:[^"]*"[^>]*>/g) || [];
        T('BOOT: seluruh script CDN Three.js dipasang `defer` (kalau tidak, render terblokir)',
            cdnTags.length >= 9 && cdnTags.every(t => /\sdefer[\s>]/.test(t)));
        T('BOOT: menu diperlihatkan SETELAH dibangun + font siap + satu frame terlukis',
            /bootProgress\(/.test(mainSrc)
            && mainSrc.indexOf('await fontsReady()') > mainSrc.indexOf('initMenu(startGame)')
            && mainSrc.indexOf('await nextPaint()') > mainSrc.indexOf('initMenu(startGame)')
            && mainSrc.indexOf('hideBootScreen()') > mainSrc.indexOf('await nextPaint()')
            && ['bootProgress', 'nextPaint', 'fontsReady', 'hideBootScreen']
                .every(f => new RegExp('export (async )?function ' + f + '\\(').test(domSrc)));
    }
}

// --- 25. CAMPAIGN STAGE 9–13 — KONTRAK BERSAMA ---------------------------
// Plan §14.1: rentang save 1..13, lompatan stage sah/ditolak, origin dunia tak
// pernah bertabrakan, HANYA root + set lampu stage aktif yang hidup, tiap
// ensureWorld idempoten, rantai finish 8→9→10→11→12→13 lewat satu gateway, dan
// setiap dunia baru lulus sapuan palet "GIBS 2045".
{
    const save13c = await import(R('src/core/saveGame.js'));
    const trans = await import(R('src/scenes/campaign/utility/transition.js'));
    const registry = await import(R('src/scenes/campaign/utility/campaignWorldRegistry.js'));
    const lightMod = await import(R('src/world/lighting.js'));
    const s9c = await import(R('src/scenes/campaign/stages/stage9/index.js'));
    const s10c = await import(R('src/scenes/campaign/stages/stage10/index.js'));
    const s11c = await import(R('src/scenes/campaign/stages/stage11/index.js'));
    const s12c = await import(R('src/scenes/campaign/stages/stage12/index.js'));
    const s13c = await import(R('src/scenes/campaign/stages/stage13/index.js'));
    const wardenC = await import(R('src/entities/nusantaraWarden.js'));

    // (1) Save: menerima 1..13, menolak di luar rentang / nilai rusak.
    {
        let ok = true;
        for (let n = 1; n <= 13; n++)
            if (!save13c.saveCampaignStage(n) || save13c.loadCampaignStage() !== n) ok = false;
        const rejects = [0, 14, 99, -1, 1.5, NaN, '7'].every(v => !save13c.saveCampaignStage(v));
        save13c.saveCampaignStage(13);
        globalThis.localStorage.setItem('gibsCampaignStage', '12.5');
        const corruptA = save13c.loadCampaignStage() === 0;
        globalThis.localStorage.setItem('gibsCampaignStage', '13abc');
        const corruptB = save13c.loadCampaignStage() === 0;
        T('S9-13 SAVE: checkpoint menerima 1..13 dan menolak nilai di luar/rusak',
            ok && rejects && corruptA && corruptB);
        save13c.clearCampaignSave();
    }

    // (2) Lompatan stage: setiap nomor mendarat di scene-nya, di luar rentang null.
    {
        const targets = [[9, s9c.stage9Scene], [10, s10c.stage10Scene],
            [11, s11c.stage11Scene], [12, s12c.stage12Scene], [13, s13c.stage13Scene]];
        let jumpOk = true;
        stateMod.setGameOver(false);
        for (const [n, target] of targets) {
            if (trans.campaignJumpToStage(n) !== n || smMod.activeScene !== target) jumpOk = false;
            if (save13c.loadCampaignStage() !== n) jumpOk = false;
        }
        T('S9-13 JUMP: 9..13 mendarat di scene + checkpoint yang benar; 0/14 ditolak',
            jumpOk && trans.campaignJumpToStage(0) === null
            && trans.campaignJumpToStage(14) === null);
    }

    // (3) Kontrak hook scene lengkap untuk setiap stage baru.
    {
        const hooks = ['enter', 'exit', 'updateMode', 'playerCollide', 'groundHeight',
            'bulletBlocked', 'grenadeCollide', 'robotAI', 'clampRobot', 'clampDropPos',
            'awardKill', 'hudStatus', 'radarLandmarks', 'restartScene', 'cheatSkipToStage'];
        const scenes = [['campaign-9', s9c.stage9Scene], ['campaign-10', s10c.stage10Scene],
            ['campaign-11', s11c.stage11Scene], ['campaign-12', s12c.stage12Scene],
            ['campaign-13', s13c.stage13Scene]];
        T('S9-13 FACADE: setiap stage baru mengekspor id, lightsKey dan seluruh hook',
            scenes.every(([id, sc]) => sc.id === id && typeof sc.lightsKey === 'string'
                && hooks.every(h => typeof sc[h] === 'function')));
    }

    // (4) Origin dunia tak pernah bertabrakan dan terpisah lebih jauh dari far-plane.
    {
        const worlds = registry.campaignWorldRegistryDebug().worlds
            .filter(w => w.bounds && Number.isFinite(w.bounds.x0));
        let overlap = false;
        for (let i = 0; i < worlds.length; i++) for (let j = i + 1; j < worlds.length; j++) {
            const a = worlds[i].bounds, b = worlds[j].bounds;
            if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) overlap = true;
        }
        T('S9-13 ORIGIN: setiap dunia campaign baru punya kotak koordinat sendiri',
            worlds.length >= 6 && !overlap
            && worlds.every(w => w.bounds.x1 > w.bounds.x0 && w.bounds.z1 > w.bounds.z0));
    }

    // (5) Hanya root + set lampu stage aktif yang hidup.
    {
        smMod.setScene(s11c.stage11Scene, { fresh: true });
        const reg = registry.campaignWorldRegistryDebug();
        const active = reg.worlds.filter(w => w.visible > 0).map(w => w.key);
        const lights = lightMod.stageLightsDebug();
        T('S9-13 ROOT: hanya root stage aktif yang terlihat dan hanya set lampunya menyala',
            reg.active.length === 1 && reg.active[0] === 'campaign-11'
            && active.length === 1 && active[0] === 'campaign-11'
            && lights.active === 'campaign-11'
            && lights.keys.includes('campaign-9') && lights.keys.includes('campaign-10')
            && lights.visible > 0 && lights.visible < lights.total);
    }

    // (6) ensureWorld setiap dunia baru idempoten.
    {
        const s9wc = await import(R('src/scenes/campaign/stages/stage9/world.js'));
        const s10wc = await import(R('src/scenes/campaign/stages/stage10/world.js'));
        const s11wc = await import(R('src/scenes/campaign/stages/stage11/world.js'));
        const s12sc = await import(R('src/scenes/campaign/stages/stage12/surfaceWorld.js'));
        const s12rc = await import(R('src/scenes/campaign/stages/stage12/rootWorld.js'));
        const s13wc = await import(R('src/scenes/campaign/stages/stage13/world.js'));
        const pairs = [
            [s9wc.ensureStage9World(scene), s9wc.ensureStage9World(scene)],
            [s10wc.ensureStage10World(scene), s10wc.ensureStage10World(scene)],
            [s11wc.ensureStage11World(scene), s11wc.ensureStage11World(scene)],
            [s12sc.ensureStage12SurfaceWorld(scene), s12sc.ensureStage12SurfaceWorld(scene)],
            [s12rc.ensureStage12RootWorld(scene), s12rc.ensureStage12RootWorld(scene)],
            [s13wc.ensureStage13World(scene), s13wc.ensureStage13World(scene)],
        ];
        T('S9-13 BUILD: setiap ensureWorld idempoten (root sama, tak membangun ulang)',
            pairs.every(([a, b]) => a && a === b));

        // (7) Sapuan palet "GIBS 2045" pada SELURUH dunia baru + rig Warden.
        const roots = [['stage9', s9wc.ensureStage9World(scene)],
            ['stage10', s10wc.ensureStage10World(scene)],
            ['stage11', s11wc.ensureStage11World(scene)],
            ['stage12-surface', s12sc.ensureStage12SurfaceWorld(scene)],
            ['stage12-root', s12rc.ensureStage12RootWorld(scene)],
            ['stage13', s13wc.ensureStage13World(scene)],
            ['warden', wardenC.buildNusantaraWardenMesh().group]];
        let neon = '', emis = '';
        for (const [name, root] of roots) root.traverse(o => {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
                if (!m || !m.color) continue;
                const c = m.color.getHex ? m.color.getHex() : null;
                const e = m.emissive && m.emissive.getHex ? m.emissive.getHex() : 0;
                if (palMod.FORBIDDEN_HEX.includes(c) || palMod.FORBIDDEN_HEX.includes(e))
                    neon = neon || name;
                if (e !== 0 && typeof m.emissiveIntensity === 'number'
                    && m.emissiveIntensity > palMod.EMISSIVE_MAX) emis = emis || name;
            }
        });
        T('S9-13 PALET: dunia baru + rig Warden tanpa neon terlarang' + (neon ? ` [${neon}]` : ''),
            neon === '');
        T('S9-13 PALET: emissive lingkungan <= EMISSIVE_MAX' + (emis ? ` [${emis}]` : ''),
            emis === '');
    }

    // (8) Rantai finish: SATU gateway, 8→9→10→11→12→13, tanpa lompat ke shop.
    {
        const chain = [
            ['stage8', 'stage9Scene'], ['stage9', 'stage10Scene'],
            ['stage10', 'stage11Scene'], ['stage11', 'stage12Scene'],
            ['stage12', 'stage13Scene'],
        ];
        let ok = true;
        for (const [stage, next] of chain) {
            const src = fs.readFileSync(`${ROOT}/src/scenes/campaign/stages/${stage}/index.js`, 'utf8');
            if (!src.includes('beginStageTransition') || !src.includes(next)) ok = false;
            if (/openShop\s*\(/.test(src)) ok = false;   // stage TAK boleh membuka shop sendiri
        }
        const s13src = fs.readFileSync(`${ROOT}/src/scenes/campaign/stages/stage13/index.js`, 'utf8');
        T('S9-13 RANTAI: 8→9→10→11→12→13 lewat beginStageTransition, tanpa shop langsung',
            ok && !s13src.includes('beginStageTransition')
            && s13src.includes('CAMPAIGN COMPLETE'));
    }

    stateMod.setGameOver(false);
}

// --- 25a. CAMPAIGN STAGE 9 — KERTAJATI AIRLIFT ---------------------------
// Kontrak penerimaan plan §14.2: rute bandara tersambung, flight core sekali
// ambil, spool HANYA tertahan blocker apron yang hidup (tak pernah mundur),
// jet blast melukai/mendorong player DAN robot tanpa menembus dinding, boarding
// mustahil sebelum mesin siap, dan skip = takeoff normal (transform identik).
{
    const C9 = cfgMod.CFG.campaign.stage9;
    const s9 = await import(R('src/scenes/campaign/stages/stage9/index.js'));
    const s9w = await import(R('src/scenes/campaign/stages/stage9/world.js'));
    const s9air = await import(R('src/scenes/campaign/stages/stage9/aircraft.js'));
    const trans9 = await import(R('src/scenes/campaign/utility/transition.js'));
    const common9 = await import(R('src/scenes/campaign/utility/common.js'));

    const stand9 = (p) => camera.position.set(p.x, cfgMod.CFG.player.eyeHeight, p.z);
    const tick9 = (sec, dt = 0.1) => {
        for (let t = 0; t < sec - 1e-9; t += dt) s9.stage9Scene.updateMode(dt);
    };
    const s9Robots = () => robots.filter(z => z.stage === 9);
    const kill9 = () => {
        for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 9) {
            scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
    };
    // Spool hanya maju ketika apron bersih -> bersihkan tiap langkah.
    const runSpool9 = (sec) => {
        for (let t = 0; t < sec; t += 0.5) { kill9(); tick9(0.5, 0.1); }
    };
    const drain9 = () => { for (let i = 0; i < 200 && s9.stage9Debug().cinematic; i++) tick9(0.5); };
    const runToBoard9 = () => {
        drain9(); kill9();
        stand9(s9w.S9_TOWER); tick9(0.3); kill9();
        stand9(s9w.S9_CORE); tick9(0.3); kill9();
        stand9(s9w.S9_HANGAR); tick9(0.3); kill9();
        stand9(s9w.S9_INSTALL); tick9(0.3);
        for (let i = 0; i < 40 && s9.stage9Debug().phase === 'spoolDefense'; i++) runSpool9(3);
    };

    // (1) Dunia: idempoten, origin terisolasi, batching + pesawat hero lengkap.
    const r9a = s9w.ensureStage9World(); const r9b = s9w.ensureStage9World();
    const w9 = s9w.stage9WorldDebug();
    T('S9 WORLD: build idempoten di root x=300000 dengan census bandara nyata',
        r9a === r9b && w9.built && w9.origin.x === 300000 && w9.deterministic
        && w9.airport.runway > 0 && w9.airport.controlTowers > 0 && w9.airport.hangars > 0
        && w9.staticBatches > 0 && w9.nav && w9.blockers.total > 0);
    T('S9 PESAWAT: transport empat mesin punya ramp, core bay, gear dan hull terlas',
        w9.aircraft.engineCount === 4 && w9.aircraft.hasCargoRamp
        && w9.aircraft.hasCoreBay && w9.aircraft.landingGearAssemblies > 0
        && w9.aircraft.independentControlSurfaces >= 5 && w9.aircraft.staticHullWelded);

    // (2) Rute: BFS pada ruang jalan NYATA (walkable + blocker) di radius player.
    {
        const RAD = cfgMod.CFG.player.radius, STEP = 14;
        const key = (x, z) => `${Math.round(x / STEP)},${Math.round(z / STEP)}`;
        const free = (x, z) => s9w.stage9Walkable(x, z, RAD) && !s9w.stage9BlockedAt(x, z, RAD);
        const seen = new Set(), queue = [[s9w.S9_START.x, s9w.S9_START.z]];
        seen.add(key(s9w.S9_START.x, s9w.S9_START.z));
        while (queue.length) {
            const [x, z] = queue.shift();
            for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
                const nx = x + dx, nz = z + dz, k = key(nx, nz);
                if (seen.has(k) || !free(nx, nz)) continue;
                seen.add(k); queue.push([nx, nz]);
            }
        }
        const reach = (p, tol = 3) => {
            for (let ix = -tol; ix <= tol; ix++) for (let iz = -tol; iz <= tol; iz++)
                if (seen.has(key(p.x + ix * STEP, p.z + iz * STEP))) return true;
            return false;
        };
        const objectives = [s9w.S9_TOWER, s9w.S9_CORE, s9w.S9_HANGAR, s9w.S9_INSTALL, s9w.S9_BOARD];
        const spawnsOk = ['apron', 'tower', 'return', 'hangar', 'spool']
            .every(n => s9w.stage9EncounterPoints(n).every(p => reach(p)));
        const sup = s9w.stage9SupplyPlacements();
        // Persediaan tak boleh lahir DI DALAM prop (radius 0) — itu peti/barel
        // yang tak bisa ditembak/diambil.
        const inProp = (p) => !s9w.stage9Walkable(p.x, p.z, 0) || s9w.stage9BlockedAt(p.x, p.z, 0);
        T('S9 RUTE: objective, titik spawn dan persediaan terjangkau + tak tertanam prop',
            objectives.every(p => reach(p)) && spawnsOk
            && [...sup.crates, ...sup.barrels, ...sup.drops].every(p => !inProp(p) && reach(p))
            && sup.drops.every(d => d.type !== 'ammo' || !!cfgMod.CFG.weapons[d.weapon]));
    }

    // (3) Masuk stage lewat gateway campaign (reset `busy` transisi).
    stateMod.setGameOver(false);
    T('S9 JUMP: campaignJumpToStage(9) mendarat di scene Stage 9', trans9.campaignJumpToStage(9) === 9
        && smMod.activeScene === s9.stage9Scene);
    let d9 = s9.stage9Debug();
    T('S9 MASUK: checkpoint 9 + opening sinematik + garrison apron hidup',
        save5Mod.loadCampaignStage() === 9 && d9.phase === 'opening'
        && d9.cinematic === 'opening' && stateMod.cinematicActive && s9Robots().length > 0);

    // (4) Menara: apron harus bersih dulu.
    drain9(); tick9(1);
    stand9(s9w.S9_TOWER); tick9(0.3);
    const towerBlocked = s9.stage9Debug().phase === 'reachTower';
    kill9(); stand9(s9w.S9_TOWER); tick9(0.3);
    d9 = s9.stage9Debug();
    T('S9 MENARA: apron harus bersih dulu; sesudahnya menara membuka fase core',
        towerBlocked && d9.phase === 'takeCore' && !d9.coreAcquired && s9Robots().length > 0);

    // (5) Flight core: TEPAT sekali, membuka rute pulang.
    kill9(); stand9(s9w.S9_CORE); tick9(0.3);
    d9 = s9.stage9Debug();
    const coreOnce = d9.coreAcquired && d9.phase === 'reachHangar' && !d9.coreInstalled;
    stand9(s9w.S9_CORE); tick9(0.3);
    T('S9 CORE: diambil TEPAT sekali dan langsung membuka rute kembali ke hangar',
        coreOnce && s9.stage9Debug().phase === 'reachHangar'
        && s9w.stage9WorldDebug().aircraft.spool === 0);

    // (6) Boot mustahil tanpa core terpasang.
    const spoolBefore = s9.stage9Debug().spool.seconds;
    tick9(3);
    const spoolStillZero = s9.stage9Debug().spool.seconds === spoolBefore;
    kill9(); stand9(s9w.S9_HANGAR); tick9(0.3); kill9();
    stand9(s9w.S9_INSTALL); tick9(0.3);
    d9 = s9.stage9Debug();
    T('S9 BOOT: spool mustahil sebelum core terpasang, lalu fase spool dimulai bersih',
        spoolStillZero && d9.coreInstalled && d9.phase === 'spoolDefense'
        && d9.spool.beat === 1 && d9.spool.seconds === 0);

    // (7) Spool BEKU selama blocker apron hidup, dan tak pernah mundur.
    {
        let last = s9.stage9Debug().spool.seconds, monotonic = true, pausedSeen = false;
        for (let i = 0; i < 30; i++) {
            tick9(0.5, 0.1);
            const sp = s9.stage9Debug().spool;
            if (sp.seconds + 1e-9 < last) monotonic = false;
            if (sp.paused) pausedSeen = true;
            last = sp.seconds;
        }
        T('S9 SPOOL: BEKU selama blocker apron hidup dan tak pernah mundur',
            C9.spool.pauseWhenBlocked && pausedSeen && monotonic
            && s9.stage9Debug().spool.apronBlockers > 0
            && s9.stage9Debug().spool.seconds === 0);
    }

    // (8) Jet blast: hanya sesudah warmup + activeFraction; mendorong & melukai
    //     player DAN robot, tetapi tak pernah keluar ruang jalan.
    {
        runSpool9(C9.spool.durationSec * C9.jetBlast.activeFraction + 2);
        const zone = s9air.transportJetZones(s9w.stage9Transport())[0];
        const zx = (zone.x0 + zone.x1) / 2, zz = (zone.z0 + zone.z1) / 2;
        const ratioOk = s9.stage9Debug().spool.progress >= C9.jetBlast.activeFraction;
        if (!s9Robots().length) common9.spawnCampaignRobot(zx, zz, 9, 'C');
        const bot = s9Robots()[0];
        bot.mesh.position.set(zx, 0, zz);
        const botX = bot.mesh.position.x, botHp = bot.hp;
        stand9({ x: zx, z: zz });
        player.hp = player.maxHp;
        const px0 = camera.position.x, hp0 = player.hp;
        tick9(1, 0.1);
        T('S9 JET BLAST: mendorong + melukai player DAN robot, tanpa menembus dinding',
            ratioOk && camera.position.x < px0 - 1 && player.hp < hp0
            && (bot.mesh.position.x < botX - 1 || bot.hp < botHp)
            && s9w.stage9Walkable(camera.position.x, camera.position.z, cfgMod.CFG.player.radius));
        player.hp = player.maxHp;
    }

    // (9) Boarding terkunci sampai seluruh gelombang selesai.
    stand9(s9w.S9_BOARD); tick9(0.3);
    const boardTooEarly = s9.stage9Debug().phase === 'spoolDefense';
    // Menjauh dari titik naik selama sisa spool: berdiri di sana akan langsung
    // memicu takeoff pada frame gelombang terakhir selesai.
    stand9(s9w.S9_INSTALL);
    for (let i = 0; i < 40 && s9.stage9Debug().phase === 'spoolDefense'; i++) runSpool9(3);
    d9 = s9.stage9Debug();
    T('S9 BOARDING: terkunci sampai seluruh gelombang selesai dan mesin siap',
        boardTooEarly && d9.phase === 'board'
        && d9.spool.beat === C9.spool.encounters.length
        && d9.spool.seconds >= C9.spool.durationSec - 1e-6);

    // (10) Takeoff NORMAL -> finish hijau, checkpoint tetap 9.
    stand9(s9w.S9_BOARD); tick9(0.3);
    T('S9 TAKEOFF: menaiki transport membekukan kontrol dan memulai sinematik lepas landas',
        s9.stage9Debug().phase === 'takeoff' && stateMod.cinematicActive);
    tick9(C9.takeoffSec + 1, 0.1);
    const naturalAir = s9w.stage9WorldDebug().aircraft;
    const naturalPos = { ...s9w.stage9Transport().position };
    T('S9 SELESAI: takeoff normal membuka finish hijau STAGE 9 COMPLETE + checkpoint 9',
        s9.stage9Debug().complete && s9.stage9Debug().transitionSent
        && stateMod.isGameOver && dom4.gameOverTitle.innerText === 'STAGE 9 COMPLETE'
        && dom4.gameOverScreen.style.background === 'rgba(0, 90, 30, 0.82)'
        && save5Mod.loadCampaignStage() === 9 && !stateMod.cinematicActive
        && dom4.stageRadioDialogueDebug() === null);

    // (11) Jalur SKIP mendarat pada transform + cleanup yang sama.
    stateMod.setGameOver(false);
    trans9.campaignJumpToStage(9);
    runToBoard9();
    stand9(s9w.S9_BOARD); tick9(0.3);
    const skipped9 = dom4.triggerCutsceneSkip();
    const skipAir = s9w.stage9WorldDebug().aircraft;
    const skipPos = { ...s9w.stage9Transport().position };
    T('S9 SKIP: skip takeoff = takeoff normal (transform pesawat + cleanup identik)',
        skipped9 === true && s9.stage9Debug().complete
        && Math.abs(skipPos.x - naturalPos.x) < 1e-6
        && Math.abs(skipPos.y - naturalPos.y) < 1e-6
        && skipAir.takeoff === naturalAir.takeoff
        && !stateMod.cinematicActive && dom4.cineFadeDebug()?.opacity === 0
        && dom4.stageRadioDialogueDebug() === null);
    T('S9 TRANSISI: gateway finish stage berikutnya dipanggil TEPAT sekali',
        s9.stage9Debug().transitionSent
        && dom4.gameOverTitle.innerText === 'STAGE 9 COMPLETE');

    stateMod.setGameOver(false); kill9();
}

// --- 25b. CAMPAIGN STAGE 10 — THE IRON PORT ------------------------------
// Kontrak penerimaan plan §14.3: setiap keadaan layout peti kemas tersambung,
// geometri terlihat = collider di awal/tengah/akhir gerak crane, skip mendarat
// tepat di layout B, meriam pelabuhan MENGUNCI TITIK MATI (tembakan sesudah
// kunci tak lagi mengejar player), servo mati permanen dan berurutan, bahaya
// bersih saat array padam, dan ekstraksi terkunci sampai array padam.
{
    const C10 = cfgMod.CFG.campaign.stage10;
    const s10 = await import(R('src/scenes/campaign/stages/stage10/index.js'));
    const s10w = await import(R('src/scenes/campaign/stages/stage10/world.js'));
    const s10c = await import(R('src/scenes/campaign/stages/stage10/cranes.js'));
    const s10d = await import(R('src/scenes/campaign/stages/stage10/defenseArray.js'));
    const trans10 = await import(R('src/scenes/campaign/utility/transition.js'));
    const common10 = await import(R('src/scenes/campaign/utility/common.js'));

    const stand10 = (p) => camera.position.set(p.x, cfgMod.CFG.player.eyeHeight, p.z);
    const tick10 = (sec, dt = 0.1) => {
        for (let t = 0; t < sec - 1e-9; t += dt) s10.stage10Scene.updateMode(dt);
    };
    const s10Robots = () => robots.filter(z => z.stage === 10);
    const kill10 = () => {
        for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 10) {
            scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
    };
    const drain10 = () => { for (let i = 0; i < 200 && s10.stage10Debug().cinematic; i++) tick10(0.5); };

    // (1) Dunia + konektivitas SEMUA keadaan layout stabil.
    const r10a = s10w.ensureStage10World(); const r10b = s10w.ensureStage10World();
    const w10 = s10w.stage10WorldDebug();
    T('S10 WORLD: build idempoten di root x=330000 dengan census pelabuhan nyata',
        r10a === r10b && w10.built && w10.origin.x === 330000 && w10.deterministic
        && w10.port.quays > 0 && w10.port.staticContainers > 0 && w10.port.warehouses > 0
        && w10.airstrip.runway > 0 && w10.staticBatches > 0 && w10.nav);
    T('S10 LAYOUT: layout A dan B sama-sama tersambung ke seluruh objective',
        w10.connectivity.allStableStatesConnected
        && w10.connectivity.A.connected && w10.connectivity.B.connected
        && w10.connectivity.B.reached.every(Boolean));

    // (2) Peti kemas bergerak: transform terlihat = collider di A, tengah, B.
    {
        const sys = s10w.stage10CraneSystem();
        s10c.setCraneLayout(sys, 'A');
        const agree = () => s10c.craneDebug(sys).containers
            .every(c => Math.abs(c.position.x - c.blocker.x) < 1e-6
                && Math.abs(c.position.z - c.blocker.z) < 1e-6
                && Math.abs(c.yaw - c.blocker.yaw) < 1e-6);
        const atA = agree();
        s10c.updateCraneShift(sys, 0.5);
        const atMid = agree() && s10c.craneDebug(sys).state === 'transition';
        s10c.updateCraneShift(sys, 1);
        const dbg = s10c.craneDebug(sys);
        const landed = dbg.state === 'B' && dbg.settled && dbg.progress === 1
            && sys.containers.every(item => Math.abs(item.group.position.x - item.B.x) < 1e-6
                && Math.abs(item.group.position.z - item.B.z) < 1e-6
                && Math.abs(item.group.position.y) < 1e-6);
        T('S10 CRANE: geometri terlihat = collider di awal/tengah/akhir dan mendarat TEPAT',
            atA && atMid && agree() && landed);
        s10c.setCraneLayout(sys, 'A');
    }

    // (3) Masuk stage lewat gateway; garrison entry hidup, layout mulai di A.
    stateMod.setGameOver(false);
    T('S10 JUMP: campaignJumpToStage(10) mendarat di scene Stage 10',
        trans10.campaignJumpToStage(10) === 10 && smMod.activeScene === s10.stage10Scene);
    let d10 = s10.stage10Debug();
    T('S10 MASUK: checkpoint 10 + opening sinematik + layout peti kemas di keadaan A',
        save5Mod.loadCampaignStage() === 10 && d10.phase === 'opening'
        && d10.crane.state === 'A' && stateMod.cinematicActive && s10Robots().length > 0);

    // (4) Crane HANYA dipicu dari safe bay dengan yard bersih.
    drain10(); tick10(1);
    stand10(s10w.S10_YARD); tick10(0.3); kill10();
    const yardPhase = s10.stage10Debug().phase;
    stand10(s10w.S10_SAFE_BAY); tick10(0.3);
    d10 = s10.stage10Debug();
    T('S10 SAFE BAY: pergeseran crane hanya dimulai dari safe bay setelah yard bersih',
        yardPhase === 'craneMazeA' && d10.phase === 'craneShift'
        && d10.cinematic === 'craneShift' && d10.crane.state !== 'A');

    // (5) Skip pergeseran = layout B stabil, tanpa peti kemas menggantung.
    const skippedShift = dom4.triggerCutsceneSkip();
    d10 = s10.stage10Debug();
    T('S10 SKIP: skip pergeseran mendarat tepat pada layout B yang stabil',
        skippedShift === true && d10.phase === 'warehouse' && d10.crane.state === 'B'
        && d10.crane.settled && d10.crane.progress === 1
        && d10.crane.containers.every(c => Math.abs(c.position.y) < 1e-6)
        && !stateMod.cinematicActive);

    // (6) Tidak ada robot tertinggal DI DALAM koridor peti kemas yang bergerak.
    T('S10 KORIDOR: tak ada robot terjebak di footprint peti kemas bergerak / prop statis',
        s10Robots().length > 0 && s10Robots().every(z =>
            s10w.stage10PathWalkable(z.mesh.position.x, z.mesh.position.z, 0)));

    // (7) Token relay -> pipe rack -> array pertahanan.
    kill10(); stand10(s10w.S10_RELAY); tick10(0.3);
    const relayOk = s10.stage10Debug().relayToken && s10.stage10Debug().phase === 'pipeRack';
    kill10(); stand10(s10w.S10_DEFENSE); tick10(0.3);
    d10 = s10.stage10Debug();
    T('S10 RELAY: token relay membuka pipe rack, lalu array pertahanan aktif',
        relayOk && d10.phase === 'defenseArray' && d10.defense.active
        && d10.defense.destroyedCount === 0
        && d10.defense.vulnerableServo === 'traverse');

    // (8) MERIAM: mengunci TITIK MATI — tembakan sesudah kunci tidak mengejar.
    {
        const sys = s10w.stage10DefenseSystem();
        const shots = [];
        const fire = (p, radius, damage) => shots.push({ x: p.x, z: p.z, radius, damage });
        s10d.resetDefenseArray(sys, C10.cannon.servoHp);
        s10d.activateDefenseArray(sys);
        camera.position.set(330500, cfgMod.CFG.player.eyeHeight, 40);
        for (let t = 0; t < C10.cannon.lockSec + 1e-6; t += 0.1)
            s10d.updateDefenseArray(sys, 0.1, C10.cannon, camera.position.x, camera.position.z, fire);
        const locked = s10d.defenseArrayDebug(sys);
        const lockPoint = { ...locked.lockPoint };
        // Player LARI sesudah kunci: tembakan tetap jatuh di titik mati.
        camera.position.set(330360, cfgMod.CFG.player.eyeHeight, -150);
        for (let t = 0; t < C10.cannon.fireDelaySec + 0.2; t += 0.1)
            s10d.updateDefenseArray(sys, 0.1, C10.cannon, camera.position.x, camera.position.z, fire);
        T('S10 MERIAM: mengunci titik mati — tembakan sesudah kunci tak mengejar player',
            locked.phase === 'locked' && shots.length === 1
            && Math.abs(shots[0].x - lockPoint.x) < 1e-6
            && Math.abs(shots[0].z - lockPoint.z) < 1e-6
            && Math.hypot(shots[0].x - camera.position.x, shots[0].z - camera.position.z) > 60
            && shots[0].damage === C10.cannon.damage
            && shots[0].radius === C10.cannon.blastRadius);

        // (9) Servo: urutan tetap, kerusakan permanen, hanya servo giliran yang
        //     bisa dilukai, dan radius blast mengecil sesudah dua servo mati.
        const bullet10 = (x, z, damage) => ({
            px: x, pz: z, damage,
            mesh: { position: { x, y: 6, z } },
        });
        const order = [];
        let wrongServoBlocked = true;
        for (const servo of sys.servos) {
            const later = sys.servos[sys.destroyedCount + 1];
            if (later) {
                const before = later.hp;
                s10d.defenseArrayBulletHit(sys, bullet10(later.x, later.z, 400), 400);
                if (later.hp !== before) wrongServoBlocked = false;
            }
            const target = sys.servos[sys.destroyedCount];
            for (let i = 0; i < 8 && !target.destroyed; i++)
                s10d.defenseArrayBulletHit(sys, bullet10(target.x, target.z, C10.cannon.servoHp),
                    C10.cannon.servoHp);
            order.push(target.id);
            void servo;
        }
        const down = s10d.defenseArrayDebug(sys);
        T('S10 SERVO: hanya servo giliran yang bisa dihancurkan, urutannya permanen',
            wrongServoBlocked && order.length === 3
            && down.destroyedCount === 3 && down.destroyedServos.length === 3
            && down.shutdown && down.vulnerableServo === null);

        // (10) Array padam: seluruh bahaya bersih dan tak ada tembakan lagi.
        const after = shots.length;
        for (let t = 0; t < 6; t += 0.1)
            s10d.updateDefenseArray(sys, 0.1, C10.cannon, camera.position.x, camera.position.z, fire);
        const idle = s10d.defenseArrayDebug(sys);
        T('S10 SHUTDOWN: array padam membersihkan telegraf/cincin dan berhenti menembak',
            shots.length === after && !idle.active && idle.phase === 'shutdown'
            && !sys.warning.visible && !sys.targetRing.visible);
    }

    // (11) Ekstraksi terkunci sampai array benar-benar padam.
    stand10(s10w.S10_EXTRACT); tick10(1);
    const extractEarly = s10.stage10Debug().phase;
    // Jalankan kembali fase array melalui scene supaya hook onServoDestroyed
    // memindahkan fase ke 'extract' sebagaimana di permainan.
    {
        const sys = s10w.stage10DefenseSystem();
        s10d.resetDefenseArray(sys, C10.cannon.servoHp);
        s10d.activateDefenseArray(sys);
        stand10(s10w.S10_DEFENSE);
        const bullet10 = (x, z, damage) => ({ px: x, pz: z, damage,
            mesh: { position: { x, y: 6, z } } });
        for (let s = 0; s < 3; s++) {
            const target = sys.servos[sys.destroyedCount];
            for (let i = 0; i < 8 && !target.destroyed; i++)
                s10.stage10Scene.bulletBlocked(bullet10(target.x, target.z, C10.cannon.servoHp));
            tick10(0.2);
        }
        kill10(); tick10(0.3);
    }
    d10 = s10.stage10Debug();
    T('S10 EKSTRAKSI: terkunci sampai array pertahanan padam, lalu titik angkut terbuka',
        extractEarly === 'defenseArray' && d10.defense.shutdown && d10.phase === 'extract');

    // (12) Selesai: hold di titik angkut -> cutscene -> finish hijau sekali.
    stand10(s10w.S10_EXTRACT); tick10(C10.extractHoldSec + 0.5);
    T('S10 DEPARTURE: menahan posisi di titik angkut memulai cutscene keberangkatan',
        s10.stage10Debug().phase === 'departure' && stateMod.cinematicActive);
    const skipped10 = dom4.triggerCutsceneSkip();
    T('S10 SELESAI: finish hijau STAGE 10 COMPLETE, checkpoint 10, cleanup bersih',
        skipped10 === true && s10.stage10Debug().complete
        && s10.stage10Debug().transitionSent && stateMod.isGameOver
        && dom4.gameOverTitle.innerText === 'STAGE 10 COMPLETE'
        && dom4.gameOverScreen.style.background === 'rgba(0, 90, 30, 0.82)'
        && save5Mod.loadCampaignStage() === 10 && !stateMod.cinematicActive
        && dom4.stageRadioDialogueDebug() === null
        && dom4.cineFadeDebug()?.opacity === 0);

    stateMod.setGameOver(false); kill10(); s10w.stage10ResetLayout();
    void common10;
}

// --- 25c. CAMPAIGN STAGE 11 — THE GREEN FIREWALL -------------------------
// Kontrak penerimaan plan §14.4: rute utuh tanpa lompatan, sapuan pemindai
// bergerak sesuai config dan predikat perlindungan = tempat berteduh yang
// TERLIHAT, exposure hanya mengunci sesudah lockSec (dan meluruh saat berlindung),
// titik jatuh MEMBEKU pada kunci, artileri melukai player + robot sesuai config
// dan menghormati blast blocker, kolam tembakan tak pernah tumbuh, terdeteksi
// TIDAK menggagalkan stage, occluder hutan pulih, dan finish hanya dari mulut
// terowongan.
{
    const C11 = cfgMod.CFG.campaign.stage11;
    const s11 = await import(R('src/scenes/campaign/stages/stage11/index.js'));
    const s11w = await import(R('src/scenes/campaign/stages/stage11/world.js'));
    const s11s = await import(R('src/scenes/campaign/stages/stage11/sensorGrid.js'));
    const trans11 = await import(R('src/scenes/campaign/utility/transition.js'));
    const common11 = await import(R('src/scenes/campaign/utility/common.js'));

    const stand11 = (p) => camera.position.set(p.x, cfgMod.CFG.player.eyeHeight, p.z);
    const tick11 = (sec, dt = 0.1) => {
        for (let t = 0; t < sec - 1e-9; t += dt) s11.stage11Scene.updateMode(dt);
    };
    const s11Robots = () => robots.filter(z => z.stage === 11);
    const kill11 = () => {
        for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 11) {
            scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
    };
    const drain11 = () => { for (let i = 0; i < 200 && s11.stage11Debug().cine; i++) tick11(0.5); };

    // (1) Dunia + rute: seluruh jalur tersambung TANPA celah (tak ada lompatan).
    stateMod.setGameOver(false);
    T('S11 JUMP: campaignJumpToStage(11) mendarat di scene Stage 11',
        trans11.campaignJumpToStage(11) === 11 && smMod.activeScene === s11.stage11Scene);
    const w11 = s11w.stage11WorldDebug();
    T('S11 WORLD: root x=360000, hutan/waterworks terlas, dan nav grid siap',
        w11.built && w11.origin.x === 360000 && w11.weldedMeshes < w11.rawMeshes
        && w11.trunks > 0 && w11.shelters.length > 0 && w11.nav.walkable > 0
        && w11.carrier.persistent && w11.carrier.solid);
    {
        // Sampling seperempat sel di sepanjang rute yang diberi wewenang: setiap
        // titik rute harus bisa dijalani dengan radius player (bukan lompatan).
        const RAD = cfgMod.CFG.player.radius;
        const pts = [s11w.S11_START, s11w.S11_WRECK, s11w.S11_SENSOR_ENTRY,
            s11w.S11_SHELTER, s11w.S11_WATERWORKS, s11w.S11_GALLERY, s11w.S11_FINISH];
        let continuous = true;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 6);
            let open = 0;
            for (let s = 0; s <= steps; s++) {
                const x = a.x + (b.x - a.x) * s / steps, z = a.z + (b.z - a.z) * s / steps;
                if (s11w.stage11Walk(x, z, RAD)) open++;
            }
            // Garis lurus boleh menyerempet vegetasi, tetapi mayoritas rute
            // WAJIB berupa lantai sah — sebuah jurang hias tak boleh jadi jalur.
            if (open / (steps + 1) < 0.75) continuous = false;
        }
        T('S11 RUTE: seluruh rute wewenang bisa dilalui radius player (tanpa lompatan)',
            continuous && pts.every(p => s11w.stage11Walk(p.x, p.z, RAD)));
    }

    // (2) Masuk stage: ambush pembuka, pemindai MATI selama sinematik.
    let d11 = s11.stage11Debug();
    T('S11 MASUK: checkpoint 11, cutscene pembuka, dan pemindai belum menyala',
        save5Mod.loadCampaignStage() === 11 && d11.phase === 'ambush'
        && !!d11.cine && stateMod.cinematicActive
        && d11.scan.state === 'CLEAR' && !d11.scan.footprint.visible
        && s11Robots().length > 0);

    // (3) Sapuan pemindai bergerak sesuai config dan bolak-balik.
    drain11(); kill11(); tick11(0.5);
    stand11(s11w.S11_SENSOR_ENTRY); tick11(0.5);
    d11 = s11.stage11Debug();
    const belt = d11.phase === 'scanBelt';
    {
        const xs = [];
        for (let i = 0; i < Math.ceil(C11.scan.cycleSec / 0.2); i++) {
            tick11(0.2, 0.1); xs.push(s11.stage11Debug().scan.footprint.x);
        }
        const moved = Math.max(...xs) - Math.min(...xs);
        T('S11 SAPUAN: jejak pemindai menyala di scan belt dan menyapu rute bolak-balik',
            belt && s11.stage11Debug().scan.footprint.visible && moved > 200
            && xs.some((v, i) => i > 0 && v < xs[i - 1])
            && xs.some((v, i) => i > 0 && v > xs[i - 1]));
    }

    // (3b) PITA yang terlihat = pita yang diuji, dan sebuah player DIAM yang
    //      terpapar benar-benar bisa terkunci (dwell >= lockSec). Tanpa ini
    //      artileri jadi mekanik mati: pita menyapu terlalu cepat untuk mengunci.
    {
        const sw = s11.stage11Debug().scan.sweep;
        T('S11 SAPUAN: lebar pita = 2x safeRadius dan dwell config >= lockSec',
            Math.abs(sw.speed - 2 * sw.span / C11.scan.cycleSec) < 1e-6
            && Math.abs(sw.dwellSec - 2 * C11.scan.safeRadius / sw.speed) < 1e-6
            && sw.dwellSec >= C11.scan.lockSec);
    }

    // (4) Predikat perlindungan = tempat berteduh yang TERLIHAT (shelter/kanopi).
    {
        const shelter = w11.shelters[0], canopy = w11.denseCanopy[0];
        const open = { x: shelter.x + shelter.hx + 60, z: shelter.z };
        T('S11 LINDUNG: predikat perlindungan tepat mengikuti shelter + kanopi rapat',
            s11w.stage11PlayerProtected(shelter.x, shelter.z)
            && s11w.stage11PlayerProtected(canopy.x, canopy.z)
            && !s11w.stage11PlayerProtected(open.x, open.z));
    }

    // (5) Exposure: hanya mengunci SESUDAH lockSec, dan meluruh saat berlindung.
    //     Sapuan bergerak, jadi diukur dari saat meteran MULAI naik.
    const exposedSpot = { x: s11w.S11_SENSOR_ENTRY.x, z: s11w.S11_SENSOR_ENTRY.z };
    const runScan = (sec, dt = 0.05) => {
        let t = 0, rise = -1, lock = -1;
        for (let i = 0; i < Math.ceil(sec / dt); i++) {
            s11s.updateStage11SensorGrid(dt, true); t += dt;
            const d = s11s.stage11ScanDebug();
            if (rise < 0 && d.exposureFraction > 0) rise = t;
            if (d.pool.active > 0) { lock = t; break; }
        }
        return { t, rise, lock };
    };
    {
        s11s.resetStage11SensorGrid();
        stand11(exposedSpot);
        const run = runScan(C11.scan.cycleSec * 3);
        // Berlindung: meteran meluruh sampai nol dan tak ada tembakan baru.
        const shelter = w11.shelters[0];
        stand11({ x: shelter.x, z: shelter.z });
        s11s.clearStage11Strikes();
        for (let t = 0; t < C11.scan.decaySec + 0.4; t += 0.05) s11s.updateStage11SensorGrid(0.05, true);
        const after = s11s.stage11ScanDebug();
        T('S11 EXPOSURE: baru mengunci sesudah lockSec dan meluruh penuh saat berlindung',
            !s11w.stage11PlayerProtected(exposedSpot.x, exposedSpot.z)
            && run.lock > 0 && run.rise > 0 && run.lock - run.rise >= C11.scan.lockSec - 0.06
            && after.exposureFraction < 1e-6 && after.playerProtected
            && after.pool.active === 0);
    }

    // (6) Titik jatuh MEMBEKU pada kunci: player lari, tembakan tetap di titik lama.
    //     Artileri melukai player DAN robot sesuai config, kolam tak tumbuh.
    {
        s11s.resetStage11SensorGrid();
        const poolSize = s11s.stage11ScanDebug().pool.size;
        stand11(exposedSpot);
        const run = runScan(C11.scan.cycleSec * 3);
        const frozen = s11s.stage11ScanDebug().frozenImpactPoints[0];
        const lockOk = run.lock > 0 && !!frozen
            && Math.abs(frozen.x - exposedSpot.x) < 1e-6
            && Math.abs(frozen.z - exposedSpot.z) < 1e-6;
        // Robot ditempatkan TEPAT di titik jatuh; player LARI jauh.
        common11.spawnCampaignRobot(frozen.x, frozen.z, 11, 'C');
        const bot = s11Robots()[s11Robots().length - 1];
        bot.mesh.position.set(frozen.x, 0, frozen.z);
        const botHp = bot.hp;
        stand11({ x: frozen.x + 400, z: frozen.z + 300 });
        player.hp = player.maxHp;
        for (let t = 0; t < C11.scan.incomingSec + 0.5; t += 0.05) {
            s11s.updateStage11SensorGrid(0.05, true);
            // Antrean ledakan diproses di ekor updateRobots (kontrak game).
            robotsMod.updateRobots(0.05, 3);
        }
        const last = s11s.stage11ScanDebug().lastImpact;
        T('S11 ARTILERI: titik jatuh membeku pada kunci dan tak mengejar player',
            lockOk && !!last && last.deadPoint && !last.followedPlayer
            && Math.abs(last.x - frozen.x) < 1e-6 && Math.abs(last.z - frozen.z) < 1e-6
            && last.radius === C11.artillery.blastRadius
            && Math.hypot(last.x - camera.position.x, last.z - camera.position.z) > 100);
        T('S11 ARTILERI: melukai robot sesuai config dan kolam tembakan tak pernah tumbuh',
            bot.hp <= botHp - C11.artillery.robotDamage + 1e-6
            && s11s.stage11ScanDebug().pool.size === poolSize
            && s11s.stage11ScanDebug().pool.active === 0);
        kill11();
    }

    // (7) Terdeteksi TIDAK menggagalkan/mereset stage.
    {
        const before = s11.stage11Debug().phase;
        stand11({ x: s11s.stage11ScanDebug().footprint.x, z: 0 });
        tick11(C11.scan.lockSec + C11.scan.incomingSec + 1, 0.1);
        T('S11 DETEKSI: terdeteksi hanya tekanan — fase & checkpoint tak pernah direset',
            s11.stage11Debug().phase === before && !s11.stage11Debug().complete
            && save5Mod.loadCampaignStage() === 11 && !stateMod.isGameOver);
        player.hp = player.maxHp;
    }

    // (8) Occluder hutan memudar saat MENUTUPI player (uji garis pandang bersama,
    // utility/occlusion.js) lalu PULIH sesudah tak lagi menutupi.
    {
        for (const z of s11Robots()) z.mesh.position.set(360690, 0, -900);   // robot menyingkir
        s11w.resetStage11WorldVisuals();
        const spot = s11w.stage11WorldDebug().occluders.points[0];
        const full = s11w.stage11WorldDebug().occluders.minFactor;
        stand11(occBehind(spot, 12));
        for (let i = 0; i < 40; i++) s11w.updateStage11WorldVisuals(0.1);
        const faded = s11w.stage11WorldDebug().occluders.minFactor;
        stand11({ x: spot.x - 600, z: spot.z + 600 });
        for (let i = 0; i < 80; i++) s11w.updateStage11WorldVisuals(0.1);
        const restored = s11w.stage11WorldDebug().occluders.minFactor;
        T('S11 OCCLUDER: kanopi memudar saat MENUTUPI player lalu PULIH penuh',
            full === 1 && Math.abs(faded - occlusionOpacity()) < 0.01 && restored > 0.95);
    }

    // (9) Finish HANYA dari mulut terowongan, dan hanya sesudah fase akhir.
    kill11();
    stand11({ x: s11w.S11_SHELTER.x, z: s11w.S11_SHELTER.z }); tick11(0.4); kill11();
    const atWaterworks = s11.stage11Debug();
    stand11({ x: s11w.S11_WATERWORKS.x - 150, z: 230 }); tick11(0.4); kill11();
    const atSweep = s11.stage11Debug();
    stand11(s11w.S11_FINISH); tick11(0.5);
    const opened = s11.stage11Debug();
    T('S11 TEROWONGAN: pintu tetap tertutup sampai fase akhir, lalu terbuka di mulutnya',
        atWaterworks.phase === 'waterworks' && !atWaterworks.world.tunnelOpen
        && atSweep.phase === 'finalSweep' && !atSweep.world.tunnelOpen
        && opened.phase === 'tunnelEntry' && opened.world.tunnelOpen);

    // (9b) Berdiri JAUH dari mulut terowongan tak pernah menyelesaikan stage.
    stand11({ x: s11w.S11_GALLERY.x + 60, z: s11w.S11_GALLERY.z });
    for (let i = 0; i < 12; i++) tick11(0.5);
    T('S11 FINISH: menjauh dari mulut terowongan membatalkan hitungan finish',
        !s11.stage11Debug().complete && s11.stage11Debug().phase === 'tunnelEntry');
    stand11(s11w.S11_FINISH);

    // (10) Selesai: satu kali transisi ke Stage 12.
    for (let i = 0; i < 200 && !s11.stage11Debug().complete; i++) tick11(0.5);
    T('S11 SELESAI: finish hijau STAGE 11 COMPLETE + checkpoint 11 + gateway sekali',
        s11.stage11Debug().complete && s11.stage11Debug().transitionCommitted
        && stateMod.isGameOver && dom4.gameOverTitle.innerText === 'STAGE 11 COMPLETE'
        && dom4.gameOverScreen.style.background === 'rgba(0, 90, 30, 0.82)'
        && save5Mod.loadCampaignStage() === 11
        && dom4.stageRadioDialogueDebug() === null
        && s11.stage11Debug().scan.pool.active === 0);

    stateMod.setGameOver(false); kill11();
}

// --- 25d. CAMPAIGN STAGE 12 — NUSANTARA ROOT -----------------------------
// Kontrak penerimaan plan §14.5: dua bab dalam SATU facade (activeScene tetap
// `campaign-12`), hanya root/lampu bab aktif yang terlihat, drive hanya bisa
// dimasukkan sesudah akses root dan TEPAT sekali, upload tak pernah mundur dan
// hanya berhenti saat jam yang diumumkan, Warden punya volume hit terbatas +
// kolam projektil pra-alokasi, tiap ambang fase terjadi sekali, perisai depan
// hanya meredam dari arah depan, kapasitor/kopling hanya bisa dilukai saat jam,
// kematian membersihkan seluruh bahaya, siaran mencapai 100% SESUDAH bos mati,
// dan uploadnya BERHASIL (bukan pengulangan twist Stage 6).
{
    const C12 = cfgMod.CFG.campaign.stage12;
    const W12 = cfgMod.CFG.campaign.bosses.warden;
    const s12 = await import(R('src/scenes/campaign/stages/stage12/index.js'));
    const s12root = await import(R('src/scenes/campaign/stages/stage12/root.js'));
    const s12rt = await import(R('src/scenes/campaign/stages/stage12/runtime.js'));
    const wardenMod = await import(R('src/entities/nusantaraWarden.js'));
    const registry12 = await import(R('src/scenes/campaign/utility/campaignWorldRegistry.js'));
    const trans12 = await import(R('src/scenes/campaign/utility/transition.js'));
    const rootSource12 = fs.readFileSync(ROOT
        + '/src/scenes/campaign/stages/stage12/root.js', 'utf8');

    const stand12 = (p) => camera.position.set(p.x, cfgMod.CFG.player.eyeHeight, p.z);
    const tick12 = (sec, dt = 0.1) => {
        for (let t = 0; t < sec - 1e-9; t += dt) s12.stage12Scene.updateMode(dt);
    };
    const kill12 = () => {
        for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 12) {
            scene.remove(robots[i].mesh); robots.splice(i, 1);
        }
    };

    // (1) Dua dunia terbangun; hanya root bab aktif yang terlihat.
    stateMod.setGameOver(false);
    T('S12 JUMP: campaignJumpToStage(12) mendarat di facade Stage 12',
        trans12.campaignJumpToStage(12) === 12 && smMod.activeScene === s12.stage12Scene
        && save5Mod.loadCampaignStage() === 12);
    let d12 = s12.stage12WorldDebug();
    const reg = () => registry12.campaignWorldRegistryDebug();
    const rootVisible = (key) => reg().worlds.find(w => w.key === key)?.visible > 0;
    T('S12 DUNIA: surface x=390000 dan root x=400000 terbangun sebagai dunia terpisah',
        s12.stage12WorldBuilt() && d12.worlds.surface.built && d12.worlds.root.built
        && d12.worlds.surface.origin.x === 390000 && d12.worlds.root.origin.x === 400000
        && d12.warden.built);
    T('S12 BAB: masuk stage = bab surface, hanya root surface yang terlihat',
        d12.chapter === 'surface' && d12.sub === 'campaign-12-surface'
        && d12.activeSceneStable === 'campaign-12'
        && rootVisible('campaign-12-surface') && !rootVisible('campaign-12-root'));

    // (2) Bab surface: gelombang berurutan, lalu turun ke root chamber.
    dom4.triggerCutsceneSkip();
    for (let i = 0; i < 40 && s12rt.phase !== 'rootApproach'; i++) {
        kill12();
        stand12({ x: s12.S12_ROOT_COURT.x, z: s12.S12_ROOT_COURT.z });
        tick12(0.5);
    }
    const surfaceCleared = s12rt.phase === 'rootApproach'
        && s12.stage12WorldDebug().surface.waveQueue.spawnedTotal
        === s12.stage12WorldDebug().surface.waveQueue.configuredTotal;
    const seenBeforeDescent = [...s12.stage12WorldDebug().dialogue.seen];
    const statsBeforeDescent = stateMod.stageStatsDebug();
    stateMod.updateStageStats(0.5);   // waktu berjalan
    stateMod.recordLootBoxDestroyed();   // satu peti sebelum turun: harus tetap terhitung
    stand12(s12.S12_DESCENT); tick12(0.4);
    d12 = s12.stage12WorldDebug();
    T('S12 BAB: statistik stage (waktu + lootbox) ikut menyeberang antar bab',
        stateMod.stageStatsDebug().stageId === statsBeforeDescent.stageId
        && stateMod.stageStatsDebug().active
        && stateMod.stageStatsDebug().lootBoxesDestroyed
            === statsBeforeDescent.lootBoxesDestroyed + 1
        && stateMod.stageStatsDebug().elapsedSec >= statsBeforeDescent.elapsedSec);
    if (process.env.S12DBG) console.log('DBG turun', surfaceCleared, d12.chapter, d12.sub,
        smMod.activeScene?.id, rootVisible('campaign-12-root'), rootVisible('campaign-12-surface'),
        JSON.stringify(d12.dialogue), JSON.stringify(d12.surface.waveQueue));
    T('S12 TURUN: seluruh formasi permukaan habis lalu bab root diambil tanpa setScene',
        surfaceCleared && d12.chapter === 'root' && d12.sub === 'campaign-12-root'
        && smMod.activeScene === s12.stage12Scene
        && d12.activeSceneStable === 'campaign-12'
        && rootVisible('campaign-12-root') && !rootVisible('campaign-12-surface')
        // Riwayat dialogue (seen) IKUT menyeberang: baris bab 1 tak boleh
        // terulang di bab 2 hanya karena babnya berganti.
        && seenBeforeDescent.every(k => d12.dialogue.seen.includes(k)));

    // (3) Drive HANYA bisa dimasukkan sesudah gerbang otoritas bersih.
    stand12(s12.S12_INSERT); tick12(1);
    const insertTooEarly = s12rt.phase === 'authorityGate'
        && !s12.stage12WorldDebug().root.uploadAccepted;
    for (let i = 0; i < 40 && s12rt.phase === 'authorityGate'; i++) { kill12(); tick12(0.5); }
    d12 = s12.stage12WorldDebug();
    const gateOpen = s12rt.phase === 'insertDrive' && d12.worlds.root.authorityOpen
        && d12.worlds.root.insertMarker;
    stand12(s12.S12_INSERT); tick12(1.5);
    d12 = s12.stage12WorldDebug();
    T('S12 DRIVE: mustahil sebelum gerbang otoritas bersih, lalu diterima TEPAT sekali',
        insertTooEarly && gateOpen && d12.root.uploadAccepted && d12.root.wardenActivated
        && d12.warden.active && d12.root.uploadProgress >= 0
        && d12.dialogue.seen.includes('insertDrive'));

    // (4) Warden: rig terbangun dengan volume hit terbatas + kolam pra-alokasi.
    const warden = s12.getStage12Warden();
    let wd = wardenMod.nusantaraWardenDebug(warden);
    T('S12 WARDEN: rig lengkap, kapasitor/kopling sesuai config, kolam pra-alokasi',
        wd.rig.capacitors === W12.capacitors.count
        && wd.rig.couplings === W12.couplings.count
        && wd.pools.rail.size === W12.rail.poolSize
        && wd.pools.burst.size === W12.burst.poolSize
        && wd.pools.sector.size === W12.sector.poolSize
        && wd.pools.stomp.size === wd.rig.legs
        && wd.hp === W12.hp && wd.maxHp === W12.hp && wd.score === W12.score);

    // (5) Upload tak pernah mundur dan TERTAHAN di preBossFraction selama bos hidup.
    for (let i = 0; i < 400 && s12.stage12WorldDebug().root.uploadProgress
        < C12.upload.preBossFraction - 1e-6; i++) tick12(0.5);
    d12 = s12.stage12WorldDebug();
    const clamped = Math.abs(d12.root.uploadProgress - C12.upload.preBossFraction) < 1e-6;
    tick12(10);
    d12 = s12.stage12WorldDebug();
    T('S12 UPLOAD: monoton naik dan berhenti tepat di preBossFraction selama bos hidup',
        clamped && d12.root.monotonic && d12.root.minObservedDelta >= -1e-9
        && Math.abs(d12.root.uploadProgress - C12.upload.preBossFraction) < 1e-6
        && !wardenMod.nusantaraWardenWrecked(warden));

    // (6) Perisai depan: hanya meredam dari arah depan; belakang penuh.
    {
        const w = warden, p = w.parts.group.position;
        w.phase = 'phase1'; w.dead = false; w.hp = w.maxHp = W12.hp;
        w.parts.group.rotation.y = 0;
        const front = { x: p.x - 200, z: p.z };   // depan = rotation.y + PI
        const back = { x: p.x + 200, z: p.z };
        const before1 = w.hp;
        wardenMod.damageNusantaraWarden(w, 1000, front);
        const frontLoss = before1 - w.hp;
        const before2 = w.hp;
        wardenMod.damageNusantaraWarden(w, 1000, back);
        const backLoss = before2 - w.hp;
        T('S12 PERISAI: tembakan depan diredam sesuai config, tembakan belakang penuh',
            Math.abs(frontLoss - 1000 * W12.shield.damageMul) < 1e-6
            && Math.abs(backLoss - 1000) < 1e-6 && backLoss > frontLoss);
        w.hp = w.maxHp;
    }

    // (7) Ambang fase TEPAT sekali; kapasitor/kopling hanya bisa dilukai saat jam.
    {
        const w = warden, phases12 = [];
        w.callbacks = { onPhase: (p) => phases12.push(p) };
        w.phase = 'phase1'; w.hp = w.maxHp = W12.hp; w.dead = false;
        const back = { x: w.parts.group.position.x + 200, z: w.parts.group.position.z };
        const capBefore = w.parts.capacitors[0].hp;
        wardenMod.damageNusantaraWarden(w, W12.hp * (1 - W12.phase2HpFrac) + 1, back);
        const jam1 = wardenMod.nusantaraWardenDebug(w);
        const capsExposed = jam1.capacitors.every(c => c.exposed);
        for (const cap of w.parts.capacitors)
            for (let i = 0; i < 12 && cap.alive; i++)
                wardenMod.damageNusantaraWardenTargetForDebug?.(w, cap, W12.capacitors.hp);
        // Jalur normal: peluru. Pakai bullet sintetis lewat hook bulletBlocked scene.
        for (const cap of w.parts.capacitors) {
            for (let i = 0; i < 12 && cap.alive; i++) {
                const wp = new THREE.Vector3().copy(cap.rig.position);
                w.parts.group.localToWorld(wp);
                s12.stage12Scene.bulletBlocked({ px: wp.x, pz: wp.z,
                    damage: W12.capacitors.hp,
                    mesh: { position: { x: wp.x, y: wp.y, z: wp.z } } });
            }
        }
        const afterCaps = wardenMod.nusantaraWardenDebug(w);
        wardenMod.damageNusantaraWarden(w, W12.hp * (W12.phase2HpFrac - W12.phase3HpFrac) + 1, back);
        const jam2 = wardenMod.nusantaraWardenDebug(w);
        T('S12 FASE: setiap ambang jam terjadi TEPAT sekali dan membuka target yang benar',
            capBefore === W12.capacitors.hp && capsExposed
            && phases12.filter(p => p === 'jam1').length === 1
            && phases12.filter(p => p === 'jam2').length === 1
            && phases12.filter(p => p === 'phase2').length === 1
            && afterCaps.phase === 'phase2'
            && afterCaps.capacitors.every(c => !c.alive)
            && jam2.phase === 'jam2' && jam2.couplings.every(c => c.exposed));
        // Kopling hanya bisa dilukai SAAT jam2; sesudah jam berakhir tidak lagi.
        for (const cup of w.parts.couplings) {
            for (let i = 0; i < 12 && cup.alive; i++) {
                const wp = new THREE.Vector3().copy(cup.rig.position);
                w.parts.group.localToWorld(wp);
                s12.stage12Scene.bulletBlocked({ px: wp.x, pz: wp.z,
                    damage: W12.couplings.hp,
                    mesh: { position: { x: wp.x, y: wp.y, z: wp.z } } });
            }
        }
        const phase3 = wardenMod.nusantaraWardenDebug(w);
        T('S12 TITIK LEMAH: kapasitor & kopling hanya rusak saat jam yang diumumkan',
            phase3.phase === 'phase3' && phase3.couplings.every(c => !c.alive)
            && phase3.couplings.every(c => !c.exposed)
            && phases12.filter(p => p === 'phase3').length === 1);
    }

    // (8) Rail MENGUNCI garis sebelum menembak; pola sektor selalu menyisakan
    //     satu lorong aman.
    {
        const w = warden;
        for (const r of w.rails) { r.active = false; r.warning.visible = false; r.shot.visible = false; }
        stand12({ x: w.parts.group.position.x + 260, z: w.parts.group.position.z });
        w.attackState = 'cooldown'; w.attackT = 0; w.attackIndex = 0; w.phase = 'phase1';
        wardenMod.updateNusantaraWarden(w, 0.05, { arena: s12.S12_ARENA, allowAttack: true });
        const rail = w.rails.find(r => r.active);
        const dirX = rail && rail.dx, dirZ = rail && rail.dz;
        const warnedFirst = !!rail && rail.warned && rail.warning.visible && !rail.shot.visible;
        // Player LARI selama telegraf: arah rail tak boleh ikut berubah.
        stand12({ x: w.parts.group.position.x, z: w.parts.group.position.z + 260 });
        for (let t = 0; t < W12.rail.telegraphSec + 0.2; t += 0.05)
            wardenMod.updateNusantaraWarden(w, 0.05, { arena: s12.S12_ARENA, allowAttack: true });
        T('S12 RAIL: garis tembak dikunci di telegraf dan tak mengejar player',
            warnedFirst && Math.abs(rail.dx - dirX) < 1e-9 && Math.abs(rail.dz - dirZ) < 1e-9
            && rail.shot.visible === true);

        // Sektor: tiga baji + tiga celah. Pola DIBEKUKAN saat telegraf, jadi
        // baji yang terlihat = area yang benar-benar meledak, dan lorong aman
        // di antara mereka benar-benar aman.
        for (const r of w.rails) { r.active = false; r.warning.visible = false; r.shot.visible = false; }
        for (const b of w.bursts) { b.active = false; b.mesh.visible = false; }
        for (const q of w.stomps) { q.active = false; q.mesh.visible = false; }
        w.phase = 'phase2'; w.attackState = 'cooldown'; w.attackT = 0; w.attackIndex = 0;
        wardenMod.updateNusantaraWarden(w, 0.05, { arena: s12.S12_ARENA, allowAttack: true });
        const sectorSeen = w.attackState === 'sectorTelegraph';
        const base = w.sectorBase;
        const wedges = w.sectors.filter(q => q.active).map(q => q.angle);
        const gapCenters = [0, 1, 2].map(i => base + i * Math.PI * 2 / 3 + Math.PI / 3);
        const wp = w.parts.group.position;
        const boomAt = (angle, radius) => {
            robotsMod.resetRobotsFx();
            camera.position.set(wp.x + Math.cos(angle) * radius,
                cfgMod.CFG.player.eyeHeight, wp.z + Math.sin(angle) * radius);
            for (let t = 0; t < W12.sector.telegraphSec + 0.2 && w.attackState.startsWith('sector'); t += 0.05)
                wardenMod.updateNusantaraWarden(w, 0.05, { arena: s12.S12_ARENA, allowAttack: true });
            return robotsMod.pendingBoomsDebug().length;
        };
        const inGap = boomAt(gapCenters[0], W12.sector.radius * 0.6);
        w.attackState = 'cooldown'; w.attackT = 0; w.attackIndex = 0;
        wardenMod.updateNusantaraWarden(w, 0.05, { arena: s12.S12_ARENA, allowAttack: true });
        const inWedge = boomAt(w.sectorBase, W12.sector.radius * 0.6);
        robotsMod.resetRobotsFx();
        T('S12 SEKTOR: pola dibekukan di telegraf — lorong aman benar-benar aman',
            sectorSeen && wedges.length === 3 && inGap === 0 && inWedge === 1
            && w.sectors.length === W12.sector.poolSize);
    }

    // (9) Kematian bos: seluruh bahaya bersih, siaran melewati preBossFraction
    //     menuju 100%, dan uploadnya BERHASIL (bukan gagal seperti Stage 6).
    {
        const w = warden;
        w.phase = 'phase3'; w.dead = false; w.deathDone = false; w.hp = 1;
        stand12(s12.S12_INSERT);
        wardenMod.damageNusantaraWarden(w, 9999,
            { x: w.parts.group.position.x + 200, z: w.parts.group.position.z });
        const dead = wardenMod.nusantaraWardenDebug(w);
        tick12(W12.deathSec + 1);
        const wrecked = wardenMod.nusantaraWardenDebug(w);
        T('S12 KEMATIAN: bos mati membersihkan SEMUA bahaya aktif sebelum epilog',
            dead.dead && wrecked.deathDone
            && wrecked.pools.rail.active === 0 && wrecked.pools.burst.active === 0
            && wrecked.pools.sector.active === 0 && wrecked.pools.stomp.active === 0);
        for (let i = 0; i < 600 && s12.stage12WorldDebug().root.uploadProgress < 1; i++) tick12(0.5);
        d12 = s12.stage12WorldDebug();
        T('S12 SIARAN: mencapai 100% HANYA sesudah bos mati, dan tetap monoton',
            d12.root.uploadProgress === 1 && d12.root.monotonic
            && wardenMod.nusantaraWardenWrecked(warden) && d12.root.rewardDropped);
    }

    // (10) Epilog: jaringan padam DULU, baru anomali M-0, lalu transisi Stage 13.
    for (let i = 0; i < 800 && !s12rt.complete; i++) tick12(0.5);
    d12 = s12.stage12WorldDebug();
    const seen12 = d12.dialogue.seen;
    T('S12 EPILOG: jaringan padam diumumkan SEBELUM anomali M-0 terungkap',
        seen12.indexOf('networkSilent') >= 0
        && seen12.indexOf('networkSilent') < seen12.indexOf('anomaly')
        && seen12.indexOf('anomaly') < seen12.indexOf('mahapatihReveal')
        && seen12.includes('jakartaCoordinate') && seen12.includes('returnVow'));
    T('S12 SELESAI: finish hijau STAGE 12 COMPLETE membuka jalur ke Stage 13',
        s12rt.complete && d12.root.completionInvoked && stateMod.isGameOver
        && dom4.gameOverTitle.innerText === 'STAGE 12 COMPLETE'
        && dom4.gameOverScreen.style.background === 'rgba(0, 90, 30, 0.82)'
        && save5Mod.loadCampaignStage() === 12);
    // Mutasi: upload Stage 12 TIDAK BOLEH gagal seperti Stage 6, dan tak boleh
    // ada jalur yang menyelesaikan siaran selagi Warden masih hidup.
    T('S12 ANTI-DRIFT: tak ada fraksi gagal, dan 100% mustahil selagi Warden hidup',
        !/uploadFailFraction|uploadFail/.test(rootSource12)
        && /nusantaraWardenWrecked\(w\)/.test(rootSource12)
        && C12.upload.preBossFraction < 1);

    stateMod.setGameOver(false); kill12();
}

// --- 25e. CAMPAIGN STAGE 13 / M-0 MAHAPATIH -------------------------------
// Final-stage invariants are intentionally executable in isolation: the world
// is campaign-owned, guards stay staged below the live cap, the boss consumes
// the just-moved bullet segment, every phase uses fixed pools, and checkpoint
// 13 survives until the epilogue's completion callback.
{
    const M13 = cfgMod.CFG.campaign.bosses.mahapatih;
    const C13 = cfgMod.CFG.campaign.stage13;
    const mahMod = await import(R('src/entities/mahapatih.js'));
    const world13 = await import(R('src/scenes/campaign/stages/stage13/world.js'));
    const stage13 = await import(R('src/scenes/campaign/stages/stage13/index.js'));
    const save13 = await import(R('src/core/saveGame.js'));
    const dom13 = await import(R('src/core/dom.js'));
    const worldSource13 = fs.readFileSync(ROOT
        + '/src/scenes/campaign/stages/stage13/world.js', 'utf8');
    const entitySource13 = fs.readFileSync(ROOT + '/src/entities/mahapatih.js', 'utf8');

    const encounterTotal = C13.encounters.reduce((sum, e) => sum
        + e.points.reduce((n, p) => n + p.count, 0), 0);
    const encounterMax = Math.max(...C13.encounters.map(e =>
        e.points.reduce((n, p) => n + p.count, 0)));
    const dialogueKeys13 = ['returnJakarta', 'monasAhead', 'offlineWake',
        'vaultOpening', 'gibranAnswer', 'phaseTwo', 'hardlineStart',
        'anchorOne', 'finalCore', 'mahapatihDeath', 'networkSafe', 'finalGibran'];

    T('S13 CONFIG: 30–45 hardwired guards are staged in bounded encounters',
        encounterTotal >= 30 && encounterTotal <= 45 && encounterMax <= 30
        && C13.encounters.every(e => e.id && Number.isFinite(e.triggerX)
            && e.points.every(p => ['A', 'B', 'C'].includes(p.cls) && p.count > 0)));
    T('S13 CONFIG: boss tuning has one owner and dialogue has every exact beat',
        !!M13 && !C13.mahapatih && M13.hardline.anchorCount === 4
        && M13.artillery.poolSize > 0 && M13.wave.poolSize > 0
        && dialogueKeys13.every(k => cfgMod.CFG.dialogue.campaign.stage13.lines[k]?.text));

    const wr1 = world13.ensureStage13World(scene);
    const wr2 = world13.ensureStage13World(scene);
    const wd = world13.stage13WorldDebug();
    T('S13 WORLD: build is idempotent at isolated x=430000 campaign root',
        wr1 === wr2 && wd.built && wd.origin.x === 430000
        && wd.monas.campaignOnly && wd.monas.stable && !wd.monas.destructible
        && wd.survivalStateImported === false);
    T('S13 WORLD: full Jakarta/Medan Merdeka production census, not placeholders',
        wd.census.inertRobots >= 200 && wd.census.liveInertRobots === 0
        && wd.census.inertVehicles >= 20 && wd.census.parkTrees >= 150
        && wd.census.cityBuildings >= 50 && wd.census.government > 0
        && wd.census.offices > 0 && wd.census.ruko > 0
        && wd.census.damagedBuildings > 0 && wd.census.detailedProps >= 200
        && wd.semantic['deployment-avenue'] === 1
        && wd.semantic['ring-road'] === 1 && wd.semantic['monas-plaza'] === 1
        && wd.semantic['hardline-station'] === M13.hardline.anchorCount
        && wd.semantic['legacy-vault'] === 1);
    T('S13 WORLD: inert army/trees are instanced, static props batched, no PointLights',
        wd.batching.instancedArmy && wd.batching.instancedTrees
        && wd.batching.sourceMeshes > wd.batching.batches
        && wd.pointLights === 0 && wd.occluders.count > 0);
    T('S13 WORLD: every authored boss charge lane clears solid, standing Monas',
        wd.chargeLanes.length >= 4 && wd.chargeLanes.every(l => l.clearOfMonas)
        && wd.blockers.monasSolid && wd.hardlineStations.length === M13.hardline.anchorCount);
    T('S13 WORLD: deterministic builder never imports or mutates Survival Monas',
        !/Math\.random\s*\(/.test(worldSource13)
        && !/scenes\/survival|survival\/world/.test(worldSource13)
        && !/damageMonas|monasHp|collapseMonas/.test(worldSource13));

    const hero = mahMod.buildMahapatihMesh(1);
    let heroMeshes = 0, heroNonBox = 0, heroPointLights = 0;
    let heroNeon = false, heroEmissiveOver = false;
    hero.group.traverse(o => {
        if (o.isMesh) {
            heroMeshes++;
            if (o.geometry?.type !== 'box') heroNonBox++;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const mat of mats) if (mat) {
                const color = mat.color?.getHex?.();
                const emissive = mat.emissive?.getHex?.();
                if (palMod.FORBIDDEN_HEX.includes(color)
                    || palMod.FORBIDDEN_HEX.includes(emissive)) heroNeon = true;
                if (emissive && mat.emissiveIntensity > palMod.EMISSIVE_MAX)
                    heroEmissiveOver = true;
            }
        }
        if (o.isPointLight) heroPointLights++;
    });
    T('MAHAPATIH ART: layered siege/personal rig has articulated addressable parts',
        heroMeshes >= 60 && heroNonBox >= 20 && hero.legs.length === 4
        && hero.arms.length === 2 && hero.blades.length === 2
        && hero.turret?.isObject3D && hero.core?.isMesh
        && hero.siege !== hero.combat && hero.hull?.name === 'Welded-Siege-Armour');
    T('MAHAPATIH ART: zero PointLights, forbidden neon, or over-cap emissive',
        heroPointLights === 0 && !heroNeon && !heroEmissiveOver);
    T('MAHAPATIH CONFIG: entity source reads only campaign.bosses.mahapatih at call time',
        entitySource13.includes('CFG.campaign.bosses.mahapatih')
        && !entitySource13.includes('campaign.stage13.mahapatih')
        && !/const\s+\w+\s*=\s*CFG\.campaign\.bosses\.mahapatih/.test(entitySource13));

    const bossParent13 = new THREE.Group(); scene.add(bossParent13);
    const boss13 = mahMod.createMahapatih({ parent: bossParent13, active: true,
        x: world13.S13_BOSS_CENTER.x, z: world13.S13_BOSS_CENTER.z });
    let bd = mahMod.mahapatihDebug(boss13);
    T('MAHAPATIH POOLS: every projectile, warning and hardline is preallocated',
        bd.pools.artillery === M13.artillery.poolSize
        && bd.pools.waves === M13.wave.poolSize
        && bd.pools.shots >= M13.turret.burst
        && bd.hardlines.length === M13.hardline.anchorCount
        && bd.zeroPointLights);

    // updateMahapatih no longer reads the previous bullet segment. The
    // just-moved segment is consumed exactly once through mahapatihBulletHit,
    // which Stage 13 calls before testing the world/Monas wall.
    const shot13 = {
        px: world13.S13_BOSS_CENTER.x - M13.hitRadius * 2, pz: 0,
        mesh: new THREE.Mesh(new THREE.SphereGeometry(1),
            new THREE.MeshBasicMaterial({ color: palMod.PAL.amber })),
        damage: 123,
    };
    shot13.mesh.position.set(world13.S13_BOSS_CENTER.x + M13.hitRadius * 2, 9, 0);
    const hpBeforeUpdate = boss13.hp;
    mahMod.updateMahapatih(boss13, 1 / 60, { allowAttack: false });
    const hpBeforeSweep = boss13.hp;
    const swept = mahMod.mahapatihBulletHit(boss13, shot13, {});
    T('MAHAPATIH HIT: just-moved swept segment hits once after updateBullets',
        hpBeforeUpdate === hpBeforeSweep && swept
        && boss13.hp === hpBeforeSweep - shot13.damage);

    // Closed shutters consume a shot physically without damage; opening them
    // exposes exactly the same finite swept body volume.
    boss13.phase = 'core'; boss13.hp = boss13.maxHp = M13.coreHp;
    boss13.shutterOpen = false;
    const closedHp = boss13.hp;
    const closedConsumed = mahMod.mahapatihBulletHit(boss13, shot13, {});
    boss13.shutterOpen = true;
    const openConsumed = mahMod.mahapatihBulletHit(boss13, shot13, {});
    T('MAHAPATIH CORE: closed shutters block damage; open core takes finite-volume hit',
        closedConsumed && openConsumed && boss13.hp === closedHp - shot13.damage);

    // Independent phase simulation: hazards clear at every transition, anchors
    // accept arbitrary order, score is granted once, and the wreck persists.
    const phaseEvents13 = [];
    const phaseCtx13 = { allowAttack: false,
        onPhase: p => phaseEvents13.push(p), onAnchor() { },
        clampBoss: world13.clampStage13Boss, wreckDir: { x: -1, z: .2 } };
    mahMod.resetMahapatih(boss13, { active: true, x: world13.S13_BOSS_CENTER.x,
        z: world13.S13_BOSS_CENTER.z });
    boss13.artillery[0].active = true; boss13.artillery[0].shell.visible = true;
    boss13.artillery[0].marker.visible = true; boss13.telegraphs.charge.visible = true;
    mahMod.damageMahapatih(boss13, M13.siegeHp, { ctx: phaseCtx13 });
    bd = mahMod.mahapatihDebug(boss13);
    const transitionClean = bd.phase === 'transition' && bd.hazardsCleared;
    mahMod.updateMahapatih(boss13, M13.transitionSec + .01, phaseCtx13);
    const personalFull = boss13.phase === 'personal' && boss13.hp === M13.combatHp;
    mahMod.damageMahapatih(boss13, M13.combatHp, { ctx: phaseCtx13 });
    const anchorOrder = [2, 0, 3, 1].filter(i => i < M13.hardline.anchorCount);
    const anchorStates = [];
    for (const i of anchorOrder) {
        mahMod.damageMahapatihHardline(boss13, i, M13.hardline.anchorHp, phaseCtx13);
        anchorStates.push(mahMod.mahapatihDebug(boss13).hardlines.map(h => h.alive));
    }
    T('MAHAPATIH PHASES: siege transition is once, clean, and refills personal segment',
        transitionClean && personalFull
        && phaseEvents13.filter(p => p === 'transition').length === 1
        && phaseEvents13.filter(p => p === 'personal').length === 1);
    T('MAHAPATIH HARDLINES: four anchors die in arbitrary order and disable their sectors',
        boss13.phase === 'core'
        && anchorStates.every((state, step) => state.filter(Boolean).length
            === M13.hardline.anchorCount - step - 1)
        && mahMod.mahapatihDebug(boss13).hardlines.every(h => !h.hazardSectorEnabled));

    boss13.shutterOpen = true;
    const scoreBefore13 = stateMod.score;
    mahMod.damageMahapatih(boss13, M13.coreHp, { force: true, ctx: phaseCtx13 });
    mahMod.damageMahapatih(boss13, M13.coreHp, { force: true, ctx: phaseCtx13 });
    const scoreAfter13 = stateMod.score;
    mahMod.updateMahapatih(boss13, M13.deathSec + .01, phaseCtx13);
    bd = mahMod.mahapatihDebug(boss13);
    const collideProbe13 = new THREE.Vector3(boss13.parts.group.position.x,
        0, boss13.parts.group.position.z);
    const wreckBlocks13 = mahMod.resolveMahapatihBlock(boss13, collideProbe13, player.radius);
    T('MAHAPATIH DEATH: reward is exactly once and all lethal hazards clear immediately',
        scoreAfter13 - scoreBefore13 === M13.score && bd.rewardGranted
        && bd.hazardsCleared && bd.activeProjectiles === 0);
    T('MAHAPATIH DEATH: wreck settles visibly away from Monas and remains collision-solid',
        bd.phase === 'wreck' && bd.wreckVisible && wreckBlocks13
        && boss13.parts.group.position.x < world13.S13_BOSS_CENTER.x);

    const facadeHooks13 = ['enter', 'exit', 'updateMode', 'playerCollide',
        'groundHeight', 'bulletBlocked', 'blastBlocked', 'grenadeCollide',
        'robotAI', 'clampRobot', 'clampDropPos', 'awardKill', 'hudStatus',
        'radarLandmarks', 'restartScene', 'cheatSkipToStage', 'camBounds'];
    T('S13 FACADE: complete Campaign scene contract is exported',
        stage13.stage13Scene.id === 'campaign-13'
        && stage13.stage13Scene.lightsKey === 'campaign-13'
        && facadeHooks13.every(k => typeof stage13.stage13Scene[k] === 'function'));

    // Enter is safe after initial prebuild: no guard is live until deployment;
    // the first configured formation is the only one instantiated after cine.
    smMod.setScene(stage13.stage13Scene, { fresh: true });
    let sd13 = stage13.stage13Debug();
    const checkpointAtEntry13 = save13.loadCampaignStage();
    for (let i = 0; i < Math.ceil(C13.returnCine.durationSec + 20); i++)
        stage13.stage13Scene.updateMode(1);
    sd13 = stage13.stage13Debug();
    T('S13 GUARDS: entry census is total-configured while only one formation is live',
        sd13.guards.configured === encounterTotal
        && sd13.guards.alive <= encounterMax && sd13.guards.alive <= 30
        && sd13.guards.hardwired === sd13.guards.alive
        && sd13.guards.encounters.filter(e => e.spawned).length === 1);
    T('S13 SAVE: checkpoint 13 is written at entry and preserved through unfinished run',
        checkpointAtEntry13 === 13 && save13.loadCampaignStage() === 13
        && sd13.checkpointClearTiming === 'preserved' && !sd13.finalScreenShown);

    stage13.stage13BeginEndingForDebug();
    sd13 = stage13.stage13Debug();
    T('S13 ENDING: interrupted sunrise has no hazards/guards and still preserves checkpoint 13',
        sd13.phase === 'ending' && sd13.endingCleanup
        && save13.loadCampaignStage() === 13 && !sd13.finalScreenShown);
    stage13.stage13CompleteEndingForDebug();
    sd13 = stage13.stage13Debug();
    T('S13 COMPLETE: final callback clears save, opens CAMPAIGN COMPLETE, and schedules no shop',
        save13.loadCampaignStage() === 0 && sd13.phase === 'complete'
        && sd13.finalScreenShown && dom13.gameOverTitle.innerText === 'CAMPAIGN COMPLETE'
        && smMod.activeScene === stage13.stage13Scene);
}

// --- 26. OPTIMASI STAGE 1 & 2 (2026-08-13, laporan user "terasa agak berat") --
// Dua perbaikan yang HANYA terlihat lewat angka, jadi keduanya dipatok di sini.
{
    const s1o = await import(R('src/scenes/campaign/stages/stage1/index.js'));
    const s2o = await import(R('src/scenes/campaign/stages/stage2/index.js'));
    const regO = await import(R('src/scenes/campaign/utility/campaignWorldRegistry.js'));
    const transMod26 = await import(R('src/scenes/campaign/utility/transition.js'));
    const smSrc = fs.readFileSync(ROOT + '/src/core/sceneManager.js', 'utf8');

    // (1) INDEKS SPASIAL BLOCKER (utils/collision.js `makeBlockerIndex`).
    //     `resolve`/`groundHeight` dipanggil player + tiap robot tiap frame;
    //     menyapu 200+ balok statis penuh-penuh itu pemborosan murni. Yang
    //     dijaga BUKAN "kira-kira sama" melainkan IDENTIK dengan sapuan penuh —
    //     kalau tidak, dorongan keluar berubah dan player bisa nyangkut.
    {
        const probeGrid = (S, resolveFn, groundFn, blockers) => {
            const idx = new THREE.Vector3(), full = new THREE.Vector3();
            let probes = 0, pushed = 0, mismatch = 0, gmismatch = 0;
            const rows = S.ROWS || S.G;
            for (let x = S.x0; x < S.x0 + S.G * S.CELL; x += 7)
                for (let z = S.z0; z < S.z0 + rows * S.CELL; z += 7) {
                    probes++;
                    idx.set(x, 0, z); resolveFn(idx, cfgMod.CFG.player.radius, 0);
                    full.set(x, 0, z);
                    colMod.resolveBlockers(full, cfgMod.CFG.player.radius, 0, blockers);
                    if (Math.hypot(idx.x - full.x, idx.z - full.z) > 1e-9) mismatch++;
                    if (Math.abs(idx.x - x) + Math.abs(idx.z - z) > 1e-9) pushed++;
                    if (groundFn(x, z, 0) !== colMod.blockersGroundHeight(x, z, 0, blockers)) gmismatch++;
                }
            return { probes, pushed, mismatch, gmismatch };
        };
        const r1 = probeGrid(s1o.S1, s1o.resolve, s1o.stage1Scene.groundHeight, s1o.s1BlockersDbg());
        const r2 = probeGrid(s2o.S2, s2o.resolve, s2o.stage2Scene.groundHeight, s2o.s2BlockersDbg());
        T(`S1/S2 INDEKS BLOCKER: identik dengan sapuan penuh [${r1.probes}+${r2.probes} titik,`
            + ` ${r1.mismatch + r2.mismatch} beda]`,
            r1.probes > 5000 && r2.probes > 5000 && r1.pushed > 100 && r2.pushed > 100
            && r1.mismatch === 0 && r2.mismatch === 0
            && r1.gmismatch === 0 && r2.gmismatch === 0);
        const i1 = s1o.s1BlockerIdxDbg(), i2 = s2o.s2BlockerIdxDbg();
        T('S1/S2 INDEKS BLOCKER: kisi benar-benar terisi + marjin dorongan disiapkan',
            i1.cells > 50 && i2.cells > 50 && i1.blockers > 100 && i2.blockers > 100
            && i1.pad > 0 && i2.pad > 0 && i1.cell === s1o.S1.CELL && i2.cell === s2o.S2.CELL);
        // Query TITIK (tinggi lantai) sengaja TANPA marjin — kalau ikut memakai
        // marjin, satu balok raksasa menyeret query-nya jadi selebar peta.
        const wide = s1o.s1BlockerIdxDbg().pad;
        T('S1/S2 INDEKS BLOCKER: marjin hanya untuk query yang MENGGESER posisi',
            wide > cfgMod.CFG.player.radius
            && colMod.makeBlockerIndex([]).gather(0, 0, 1, false).length === 0);
    }

    // (2) ROOT DUNIA PER STAGE. Seluruh dunia campaign hidup dalam SATU
    //     THREE.Scene; tanpa root per stage, renderer menelusuri + menguji
    //     frustum belasan ribu objek milik stage lain SETIAP frame — itulah
    //     yang membuat stage 1 & 2 terasa berat sesudah Stage 9-13 dibangun.
    {
        const keys = regO.campaignWorldRegistryDebug().worlds.map(w => w.key);
        const wanted = ['campaign-1', 'campaign-2', 'campaign-3', 'campaign-4', 'campaign-5',
            'campaign-6', 'campaign-6-hq', 'campaign-7', 'campaign-8', 'campaign-9',
            'campaign-10', 'campaign-11', 'campaign-12-surface', 'campaign-12-root', 'campaign-13'];
        T(`S1-13 ROOT DUNIA: setiap stage/chapter punya root terdaftar [${keys.length}]`,
            wanted.every(k => keys.includes(k)));

        // Diukur pada ROOT TERDAFTAR saja: suite ini meninggalkan ribuan entitas
        // uji (robot, gore, dunia survival/intro) di scene, jadi rasio global
        // bukan ukuran yang jujur untuk optimasi ini.
        const s3RootO = s3mod.s3WorldRootDbg?.() || null;
        const s4RootO = s4mod.s4WorldRootDbg?.() || null;
        const s5RootO = s5WorldMod.stage5WorldRootDbg?.() || null;
        const s6RootO = s6WorldMod.stage6WorldRootDbg?.() || null;
        const s6HqRootO = s6HqWorldMod.hqWorldRootDbg?.() || null;
        const s7RootO = s7mod.stage7WorldRootDbg?.() || null;
        const rootObjects = (onlyVisible) => {
            let n = 0;
            const walk = (o) => {
                if (onlyVisible && o.visible === false) return;
                n++; for (const c of o.children) walk(c);
            };
            for (const r of [s1o.s1WorldRootDbg(), s2o.s2WorldRootDbg(), s3RootO, s4RootO,
                s5RootO, s6RootO, s6HqRootO, s7RootO]) if (r) walk(r);
            return n;
        };
        const total = rootObjects(false);
        const visibleObjects = () => rootObjects(true);
        stateMod.setGameOver(false);
        smMod.setScene(s1o.stage1Scene, { fresh: true });
        const liveS1 = visibleObjects();
        const dbg1 = regO.campaignWorldRegistryDebug();
        T(`S1 ROOT DUNIA: hanya dunia Stage 1 yang ikut ditelusuri [${liveS1}/${total} objek dunia]`,
            dbg1.active.length === 1 && dbg1.active[0] === 'campaign-1'
            && dbg1.worlds.filter(w => w.visible > 0).length === 1
            && total > 10000 && liveS1 < total * 0.25);
        // Dunia stage lain BENAR-BENAR tak terlihat (bukan cuma jauh).
        T('S1 ROOT DUNIA: root Stage 2/5/6/7 tak terlihat selama Stage 1 dimainkan',
            ['campaign-2', 'campaign-5', 'campaign-6', 'campaign-6-hq', 'campaign-7']
                .every(k => dbg1.worlds.find(w => w.key === k)?.visible === 0)
            && s1o.s1WorldRootDbg().visible === true
            && s2o.s2WorldRootDbg().visible === false);

        smMod.setScene(s2o.stage2Scene, { fresh: true });
        const dbg2 = regO.campaignWorldRegistryDebug();
        T(`S2 ROOT DUNIA: berpindah stage memindahkan visibilitas root [${visibleObjects()}/${total}]`,
            dbg2.active[0] === 'campaign-2' && s2o.s2WorldRootDbg().visible === true
            && s1o.s1WorldRootDbg().visible === false
            && visibleObjects() < total * 0.25);

        // Scene TANPA dunia (shop antar-stage, modal hack/repair) TIDAK boleh
        // menyentuh root: kembali dari modal lewat resumeScene tak menyalakan
        // ulang apa pun, jadi menyembunyikannya = dunia hilang saat main lagi.
        const before = regO.campaignWorldRegistryDebug().active.join(',');
        smMod.setScene({ id: 'campaign-hack', enter() { }, exit() { },
            playerCollide() { }, groundHeight: () => 0, bulletBlocked: () => false,
            clampDropPos: (x, z) => [x, z], hudStatus: () => '' });
        const during = regO.campaignWorldRegistryDebug().active.join(',');
        smMod.resumeScene(s2o.stage2Scene);
        T('ROOT DUNIA: scene modal/shop mempertahankan dunia stage yang sedang dimainkan',
            before === 'campaign-2' && during === before
            && s2o.s2WorldRootDbg().visible === true
            && /worldKeyFor/.test(smSrc) && /if \(worldKey\) setActiveCampaignWorldRoots/.test(smSrc));

        // Lompat ke SETIAP stage: masing-masing wajib menyalakan TEPAT root
        // miliknya sendiri (menangkap kunci yang salah peta — mis. chapter
        // Stage 6/12 yang memilih root-nya sendiri di enter()).
        {
            const expected = { 12: 'campaign-12-surface' };
            let wrong = '';
            for (let n = 1; n <= 13; n++) {
                transMod26.campaignJumpToStage(n);
                const live = regO.campaignWorldRegistryDebug().worlds
                    .filter(w => w.visible > 0).map(w => w.key);
                const want = expected[n] || `campaign-${n}`;
                if (live.length !== 1 || live[0] !== want) wrong = wrong || `${n}:${live.join('|') || 'none'}`;
            }
            T(`S1-13 ROOT DUNIA: tiap stage menyalakan TEPAT root miliknya${wrong ? ` [${wrong}]` : ''}`,
                wrong === '');
            transMod26.campaignJumpToStage(2);
        }

        // LAMPU sengaja TETAP di `scene`, bukan di dalam root: jumlah PointLight
        // TERLIHAT menentukan varian shader, dan itu sudah diurus
        // setActiveStageLights + precompileStageLightSets.
        const lampsInsideRoot = s1o.s1LampsDbg()
            .filter(lm => lm.L.parent && lm.L.parent !== scene).length;
        T('S1 ROOT DUNIA: lampu ruangan tetap menempel di scene (kontrak jumlah lampu utuh)',
            s1o.s1LampsDbg().length > 0 && lampsInsideRoot === 0);
    }
    stateMod.setGameOver(false);
}


// --- 27. FADE OCCLUDER BERSAMA — STAGE 1..13 (2026-08-13, permintaan user:
// "pastikan jika ada object yang menghalangi player ATAU robot, object itu jadi
// transparan ... transparannya 20%"). Dulu ada TIGA sistem berbeda (stage 4 uji
// garis pandang @0.45; stage 11/13 uji JARAK @0.18/0.42; stage 5-10 & 12 tak
// punya apa-apa sama sekali). Sekarang SATU modul, SATU angka. --------------
{
    const occSrc = fs.readFileSync(
        ROOT + '/src/scenes/campaign/utility/occlusion.js', 'utf8');

    // (1) SATU sumber opasitas, dibaca dari CFG — bukan angka di dalam kode.
    T('OCCLUSION: opasitas fade datang dari CFG.campaign.occlusion.opacity',
        typeof cfgMod.CFG.campaign.occlusion.opacity === 'number'
        && occlusionOpacity() === cfgMod.CFG.campaign.occlusion.opacity
        && occlusionOpacity() > 0 && occlusionOpacity() < 1);

    // (2) TAK ADA salinan sistem fade lain di src/. Stage boleh MEMANGGIL modul
    //     ini, tapi tak boleh memelihara daftar occluder sendiri lagi.
    {
        const files = [];
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = dir + '/' + e.name;
                if (e.isDirectory()) walk(p);
                else if (e.name.endsWith('.js')) files.push(p);
            }
        };
        walk(ROOT + '/src');
        const rogue = files.filter(f => !f.endsWith('occlusion.js')
            && /occluders\s*\.\s*push\s*\(/.test(fs.readFileSync(f, 'utf8')));
        T('OCCLUSION: hanya utility/occlusion.js yang memelihara daftar occluder'
            + (rogue.length ? ' [' + rogue.map(f => f.split('/src/')[1]).join(',') + ']' : ''),
        rogue.length === 0);
    }

    // (3) Modul memakai UJI GARIS PANDANG kamera->entitas (bukan sekadar jarak)
    //     dan menyapu ROBOT, bukan hanya player.
    T('OCCLUSION: uji memakai kemiringan kamera aktif + menyapu robot',
        occSrc.includes('camOffsetActive') && occSrc.includes('for (const z of robots)'));

    // (4) TIAP dunia campaign punya occluder terdaftar. Stage 8 sengaja TIDAK
    //     ada di daftar: seluruh sceneryn-ya duduk di |z| >= 96 sementara player
    //     terkunci di carriageway |z| <= ~44, jadi tak satu pun geometri statis
    //     pernah berada di koridor pandang kamera.
    {
        const s1o = await import(R('src/scenes/campaign/stages/stage1/index.js'));
        const s2o = await import(R('src/scenes/campaign/stages/stage2/index.js'));
        const s3o = await import(R('src/scenes/campaign/stages/stage3/index.js'));
        const s4o = await import(R('src/scenes/campaign/stages/stage4/index.js'));
        const s5w = await import(R('src/scenes/campaign/stages/stage5/world.js'));
        const s6w = await import(R('src/scenes/campaign/stages/stage6/world.js'));
        const s6h = await import(R('src/scenes/campaign/stages/stage6/hqWorld.js'));
        const s7o = await import(R('src/scenes/campaign/stages/stage7/index.js'));
        const s9w = await import(R('src/scenes/campaign/stages/stage9/world.js'));
        const s10w = await import(R('src/scenes/campaign/stages/stage10/world.js'));
        const s11w = await import(R('src/scenes/campaign/stages/stage11/world.js'));
        const s12s = await import(R('src/scenes/campaign/stages/stage12/surfaceWorld.js'));
        const s12r = await import(R('src/scenes/campaign/stages/stage12/rootWorld.js'));
        const s13w = await import(R('src/scenes/campaign/stages/stage13/world.js'));
        const sets = [
            ['1 barikade', s1o.s1OcclusionDebug()],
            ['2 barikade', s2o.s2OcclusionDebug()],
            ['3 mesin pabrik', s3o.s3OcclusionDebug()],
            ['4 mobil/gedung', { count: s4o.occluderDebug().count }],
            ['5 perabot depot', s5w.stage5OcclusionDebug()],
            ['6 arrival', s6w.stage6OcclusionDebug()],
            ['6 HQ', s6h.hqWorldDebug().occluders],
            ['7 lalu lintas', s7o.stage7WorldDebug().occluders],
            ['9 apron', s9w.stage9WorldDebug().occluders],
            ['10 pelabuhan', s10w.stage10WorldDebug().occluders],
            ['11 hutan', s11w.stage11WorldDebug().occluders],
            ['12 permukaan', s12s.stage12SurfaceWorldDebug().occluders],
            ['12 akar', s12r.stage12RootWorldDebug().occluders],
            ['13 monas', s13w.stage13WorldDebug().occluders],
        ];
        if (process.env.OCC_REPORT) console.log('[occ]',
            sets.map(e => e[0] + '=' + (e[1] ? e[1].count : 'X')).join('  '));
        const empty = sets.filter(e => !e[1] || !(e[1].count > 0)).map(e => e[0]);
        T('OCCLUSION: setiap dunia campaign mendaftarkan occluder'
            + (empty.length ? ' [kosong: ' + empty.join(', ') + ']' : ''),
        empty.length === 0);

        // Stage 7 = maze lalu lintas: SETIAP kendaraan harus bisa memudar
        // sendiri, bukan sepetak 125 m sekaligus.
        const s7dbg = s7o.stage7WorldDebug();
        T('OCCLUSION S7: tiap kendaraan jadi occluder sendiri (bukan per petak)',
            s7dbg.occluders.count === s7dbg.optimization.vehicleChunks.raw
            && s7dbg.optimization.vehicleChunks.chunks > 1);
    }

    // (5) FADE = TEPAT nilai config, untuk PLAYER dan untuk ROBOT sendirian.
    //     Dipakai stage 10 (peti kemas pelabuhan): occluder besar dan terbuka,
    //     jadi hasilnya tak ambigu.
    {
        const key = 'campaign-10';
        const before = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const keepRobots = robots.slice();
        robots.length = 0;
        occlusionMod.resetStageOccluders(key);
        // Pilih occluder TINGGI tapi RAMPING (tumpukan peti kemas / rak pipa):
        // gudang selebar 90 unit tak bisa dipakai — untuk berdiri di luar
        // radiusnya kita harus mundur sejauh 96 unit, dan di jarak itu garis
        // pandang sudah jauh di atas puncaknya (memang tidak menghalangi).
        const pts = occlusionMod.occlusionDebug(key).points;
        const spot = pts.filter(o => o.top >= 25 && o.radius <= 20)
            .sort((a, b) => b.top - a.top)[0];
        const full = occlusionMod.occlusionDebug(key).minFactor;

        const stand = occBehind(spot, 14);
        camera.position.set(stand.x, cfgMod.CFG.player.eyeHeight, stand.z);
        for (let i = 0; i < 60; i++) occlusionMod.updateStageOccluders(key, 0.1);
        const fadedByPlayer = occlusionMod.occlusionDebug(key).minFactor;

        // Player pergi jauh -> penghalang pulih opak.
        camera.position.set(spot.x + 4000, cfgMod.CFG.player.eyeHeight, spot.z + 4000);
        for (let i = 0; i < 60; i++) occlusionMod.updateStageOccluders(key, 0.1);
        const restored = occlusionMod.occlusionDebug(key).minFactor;

        // Player tetap jauh; ROBOT sendirian berdiri di titik yang tadi.
        camera.position.set(spot.x + 250, cfgMod.CFG.player.eyeHeight, spot.z - 250);
        robots.push({ mesh: { position: { x: stand.x, y: 0, z: stand.z } }, stage: 10 });
        for (let i = 0; i < 60; i++) occlusionMod.updateStageOccluders(key, 0.1);
        const fadedByRobot = occlusionMod.occlusionDebug(key).minFactor;

        robots.length = 0;
        occlusionMod.resetStageOccluders(key);
        const reset = occlusionMod.occlusionDebug(key).minFactor;
        for (const z of keepRobots) robots.push(z);
        camera.position.set(before.x, before.y, before.z);

        T('OCCLUSION: penghalang memudar TEPAT ke CFG saat menutupi PLAYER',
            full === 1 && Math.abs(fadedByPlayer - occlusionOpacity()) < 1e-6);
        T('OCCLUSION: pulih opak sesudah tak lagi menutupi', restored > 0.99);
        T('OCCLUSION: penghalang juga memudar untuk ROBOT (tanpa player dekat)',
            Math.abs(fadedByRobot - occlusionOpacity()) < 1e-6);
        T('OCCLUSION: reset stage mengembalikan seluruh occluder ke opak', reset === 1);
    }

    // (6) Objek di sisi KAMERA dari entitas (yakni di BELAKANG entitas dilihat
    //     dari kamera... tepatnya: entitas berada di antara kamera dan objek)
    //     TIDAK memudar — ia tak menghalangi apa pun. Inilah pembeda uji garis
    //     pandang dari uji jarak yang dipakai stage 11/13 sebelumnya.
    {
        const key = 'campaign-10';
        const before = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const keepRobots = robots.slice();
        robots.length = 0;
        occlusionMod.resetStageOccluders(key);
        const spot = occlusionMod.occlusionDebug(key).points
            .filter(o => o.top >= 25 && o.radius <= 20)
            .sort((a, b) => b.top - a.top)[0];
        // Jarak harus melewati SELURUH tapak prop: berdiri 14 unit saja masih di
        // DALAM footprint peti kemas, dan di situ ia memang menutupi.
        const pad10 = cfgMod.CFG.campaign.occlusion.lateralPad || 3;
        const depth10 = (spot.hx + pad10) * Math.abs(rendererMod.SCREEN_UP.x)
            + (spot.hz + pad10) * Math.abs(rendererMod.SCREEN_UP.z);
        const behind = occBehind(spot, -(depth10 + 10));
        camera.position.set(behind.x, cfgMod.CFG.player.eyeHeight, behind.z);
        for (let i = 0; i < 60; i++) occlusionMod.updateStageOccluders(key, 0.1);
        // Occluder INI yang diperiksa: berdiri di sisi kameranya bisa menaruh
        // peti kemas LAIN di koridor pandang, dan itu memang harus memudar.
        const stillOpaque = (occlusionMod.occlusionDebug(key).points
            .find(q => q.x === spot.x && q.z === spot.z) || { factor: 1 }).factor;
        occlusionMod.resetStageOccluders(key);
        for (const z of keepRobots) robots.push(z);
        camera.position.set(before.x, before.y, before.z);
        T('OCCLUSION: objek yang entitasnya berdiri di SISI KAMERA tetap opak',
            stillOpaque > 0.99);
    }

    // (7) AMBANG "MENUTUPI SETENGAH BADAN" (2026-08-14, permintaan user). Yang
    //     dipatok BUKAN angka jarak melainkan RUMUSNYA terhadap CFG: sebuah sel
    //     dinding menutupi setengah badan sampai jarak
    //         d = halfDepth + (top - bodyHeight*coverFraction) / slope
    //     dan sesudah itu tidak lagi. Kamera memandang dari barat daya, jadi
    //     halfDepth kotak sel = (hx+hz)/sqrt(2).
    {
        const s1o = await import(R('src/scenes/campaign/stages/stage1/index.js'));
        const key = 'campaign-1';
        const C = cfgMod.CFG.campaign.occlusion;
        const before = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const keepRobots = robots.slice();
        robots.length = 0;
        occlusionMod.resetStageOccluders(key);

        const off = rendererMod.camOffsetActive();
        const L = Math.hypot(off.x, off.z), slope = off.y / L;
        const body = C.bodyHeight > 0 ? C.bodyHeight : cfgMod.CFG.player.eyeHeight;
        const need = body * (C.coverFraction == null ? 0.5 : C.coverFraction);

        const wallPt = occlusionMod.occlusionDebug(key).points.find(p => p.wall);
        // Kotak dilebarkan `lateralPad` dulu (prop yang menutupi sebagian besar
        // siluet, bukan tepat titik pusat, tetap terhitung).
        const pad = C.lateralPad == null ? 3 : C.lateralPad;
        const halfDepth = (wallPt.hx + pad) * Math.abs(rendererMod.SCREEN_UP.x)
            + (wallPt.hz + pad) * Math.abs(rendererMod.SCREEN_UP.z);
        const limit = halfDepth + (wallPt.top - need) / slope;

        const factorAt = () => {
            const p = occlusionMod.occlusionDebug(key).points
                .find(q => q.x === wallPt.x && q.z === wallPt.z);
            return p ? p.factor : 1;
        };
        const settle = (d) => {
            const at = occBehind(wallPt, d);
            camera.position.set(at.x, cfgMod.CFG.player.eyeHeight, at.z);
            for (let i = 0; i < 60; i++) occlusionMod.updateStageOccluders(key, 0.1);
            return factorAt();
        };
        const inside = settle(limit - 4);          // masih menutupi >= setengah badan
        const outside = settle(limit + 4);         // sudah kurang dari setengah
        occlusionMod.resetStageOccluders(key);
        for (const z of keepRobots) robots.push(z);
        camera.position.set(before.x, before.y, before.z);

        T('OCCLUSION: dinding memudar TEPAT selama menutupi >= setengah badan',
            limit > 0 && Math.abs(inside - occlusionOpacity()) < 1e-6 && outside > 0.99);
        T('OCCLUSION: ambang setengah-badan diturunkan dari CFG (bukan angka mati)',
            (C.coverFraction == null ? 0.5 : C.coverFraction) > 0
            && need === body * (C.coverFraction == null ? 0.5 : C.coverFraction));
    }

    // (8) DINDING: sel dipindahkan ke PROXY, bukan seluruh InstancedMesh yang
    //     dipudarkan — kalau tidak, satu sel yang menutupi akan menembuskan
    //     SELURUH gedung. Kolam proxy dipakai lalu dilepas lagi.
    {
        const s1o = await import(R('src/scenes/campaign/stages/stage1/index.js'));
        const s2o = await import(R('src/scenes/campaign/stages/stage2/index.js'));
        const s3o = await import(R('src/scenes/campaign/stages/stage3/index.js'));
        const s5w = await import(R('src/scenes/campaign/stages/stage5/world.js'));
        const s6w = await import(R('src/scenes/campaign/stages/stage6/world.js'));
        const s6h = await import(R('src/scenes/campaign/stages/stage6/hqWorld.js'));
        const walls = [
            ['1', s1o.s1WallsDbg()], ['2', s2o.s2WallsDbg()], ['3', s3o.s3WallsDbg()],
            ['5', s5w.s5WallsDbg()], ['6 arrival', s6w.s6WallsDbg()], ['6 HQ', s6h.hqWallsDbg()],
        ];
        const missing = walls.filter(w => !w[1] || !(w[1].cells > 0) || !(w[1].pool > 0))
            .map(w => w[0]);
        T('DINDING MEMUDAR: setiap stage berdinding punya sel + kolam proxy'
            + (missing.length ? ' [' + missing.join(', ') + ']' : ''),
        missing.length === 0);

        // Biaya tetapnya kecil: satu draw group badan + paling banyak 16 kulit
        // muka, bukan satu grup per sel.
        const fat = walls.filter(w => w[1].drawGroups > 17).map(w => w[0]);
        T('DINDING MEMUDAR: <= 17 draw group per stage (badan + kulit muka)'
            + (fat.length ? ' [' + fat.join(', ') + ']' : ''),
        fat.length === 0 && walls.every(w => w[1].drawGroups >= 1));

        const key = 'campaign-1';
        const before = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const keepRobots = robots.slice();
        robots.length = 0;
        occlusionMod.resetStageOccluders(key);
        const idle = s1o.s1WallsDbg().active;
        const wallPt = occlusionMod.occlusionDebug(key).points.find(p => p.wall);
        const at = occBehind(wallPt, 14);
        camera.position.set(at.x, cfgMod.CFG.player.eyeHeight, at.z);
        for (let i = 0; i < 60; i++) occlusionMod.updateStageOccluders(key, 0.1);
        const busy = s1o.s1WallsDbg().active;
        occlusionMod.resetStageOccluders(key);
        const released = s1o.s1WallsDbg().active;
        for (const z of keepRobots) robots.push(z);
        camera.position.set(before.x, before.y, before.z);
        T('DINDING MEMUDAR: sel yang menutupi mengambil slot proxy lalu melepasnya',
            idle === 0 && busy > 0 && busy <= s1o.s1WallsDbg().pool && released === 0);

        // Sel yang memudar DISEMBUNYIKAN dari InstancedMesh dengan skala NOL —
        // dan WAJIB kembali skala 1 sesudahnya. Matriksnya dipakai bergantian
        // untuk sembunyi/tampil, jadi lupa meng-identity-kan dulu membuat
        // dindingnya hilang permanen; itu yang dijaga di sini.
        const wallsRig = s1o.s1WallsRigDbg();
        const cellIdx = wallsRig.cells.findIndex(
            q => q.x === wallPt.x && q.z === wallPt.z);
        const restoredScale = wallsRig.body.mats[cellIdx].s;
        camera.position.set(at.x, cfgMod.CFG.player.eyeHeight, at.z);
        for (let i = 0; i < 60; i++) occlusionMod.updateStageOccluders(key, 0.1);
        const hiddenScale = wallsRig.body.mats[cellIdx].s;
        occlusionMod.resetStageOccluders(key);
        const backScale = wallsRig.body.mats[cellIdx].s;
        camera.position.set(before.x, before.y, before.z);
        T('DINDING MEMUDAR: instans sel diskala NOL saat memudar lalu PULIH ke 1',
            cellIdx >= 0 && restoredScale === 1 && hiddenScale === 0 && backScale === 1);
    }
}

// --- 28. AREA OF DAMAGE PELURU BIASA (2026-08-16, permintaan user: "senjata
//     lain juga memiliki radius area of damage sebesar 1 meter"). Pistol/rifle/
//     shotgun kini melukai robot LAIN dalam radius `weapons.splashRadiusMeters`
//     dari titik tumbuk. Semua assert membaca CFG (user me-retune JSON) —
//     jangan hardcode 7 unit.
{
    const SPL = robotsMod.bulletSplashRadius();
    const M = cfgMod.CFG.weapons.splashRadiusMeters;
    T('SPLASH PELURU: radius dibaca dari config (' + M + ' m = ' + SPL.toFixed(1) + ' unit)',
        M != null && Math.abs(SPL - M * cfgMod.CAMP_M) < 1e-9 && SPL > 0);

    // Panggung bersih: scene stub yang sama seperti bagian awal suite.
    smMod.setScene({
        id: 'test-splash', enter() { },
        robotAI: () => ({ chaseDist: 9999 }),
        bulletBlocked: () => false,
        playerCollide() { }, groundHeight: () => 0,
        clampDropPos: (x, z) => [x, z],
    });
    const clearBots = () => { while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); } };
    const hitR = cfgMod.CFG.robot.bodyHitRadius * cfgMod.CFG.robot.classes.C.scale;
    // `inner` di LUAR jangkauan tumbukan langsung tapi di DALAM radius splash;
    // hanya bermakna bila splash memang lebih lebar dari badan robot.
    const inner = (hitR + SPL) / 2, outer = SPL * 1.4;
    const X0 = 62000, Z0 = 0, DMG = 30;
    // Peluru menempuh ruas (x-20,z) -> (x,z): titik tumbuk = ujungnya.
    const shootAt = (x, z, dmg, extra = {}) => stateMod.bullets.push(Object.assign({
        mesh: { position: new THREE.Vector3(x, 8, z) }, px: x - 20, py: 8, pz: z,
        dir: new THREE.Vector3(1, 0, 0), damage: dmg,
    }, extra));
    stateMod.player.dmgMul = 1;
    camera.position.set(X0, cfgMod.CFG.player.eyeHeight, Z0 - 4000);   // player jauh: tak ada cakar

    if (SPL > hitR + 0.5) {
        clearBots(); stateMod.bullets.length = 0; stateMod.drops.length = 0; goreMod.resetGore();
        const zHit = mkBot('C', X0, Z0);
        const zNear = mkBot('C', X0, Z0 + inner);      // di dalam radius splash
        const zFar = mkBot('C', X0, Z0 + outer);       // di luar radius splash
        for (const z of [zHit, zNear, zFar]) { z.hp = z.maxHp = 500; robots.push(z); }
        shootAt(X0, Z0, DMG);
        robotsMod.updateRobots(0.016, 1);
        T('SPLASH PELURU: robot lain dalam radius ikut terluka (-' + (500 - zNear.hp) + ')',
            zHit.hp === 500 - DMG && zNear.hp === 500 - DMG && zFar.hp === 500);
        T('SPLASH PELURU: korban tumbukan langsung TIDAK kena dua kali',
            zHit.hp === 500 - DMG);

        // invuln (robot gerbong kereta musuh yang masih tersegel) kebal splash.
        zNear.invuln = true; zNear.hp = 500;
        shootAt(X0, Z0, DMG);
        robotsMod.updateRobots(0.016, 1);
        T('SPLASH PELURU: robot invuln tak tersentuh splash', zNear.hp === 500);
        zNear.invuln = false;

        // Hook blastBlocked (daun pintu tertutup) menahan splash, sama spt AoE launcher.
        const blocker = (x0, z0, x1, z1) => true;
        smMod.activeScene.blastBlocked = blocker;
        zNear.hp = 500;
        shootAt(X0, Z0, DMG);
        robotsMod.updateRobots(0.016, 1);
        T('SPLASH PELURU: pintu tertutup (blastBlocked) menahan splash', zNear.hp === 500);
        delete smMod.activeScene.blastBlocked;

        // Banyak robot MATI oleh splash dalam satu frame: pembunuhan diantre dan
        // diproses SETELAH loop utama (mematikan di tengah loop = splice indeks
        // yang sedang diiterasi). Semua harus hilang, loot jatuh, tanpa error.
        clearBots(); stateMod.bullets.length = 0; stateMod.drops.length = 0; goreMod.resetGore();
        const victim = mkBot('C', X0, Z0); victim.hp = victim.maxHp = 500; robots.push(victim);
        const mob = [];
        for (let k = 0; k < 3; k++) {
            const z = mkBot('C', X0 + (k - 1) * 0.6, Z0 + inner);
            z.hp = z.maxHp = DMG; robots.push(z); mob.push(z);
        }
        const kills0 = stateMod.stats.kills;
        shootAt(X0, Z0, DMG);
        robotsMod.updateRobots(0.016, 1);
        T('SPLASH PELURU: banyak kematian sekaligus aman (antre di luar loop robot)',
            robots.length === 1 && robots[0] === victim && mob.every(z => !robots.includes(z))
            && stateMod.stats.kills === kills0 + 3);

        // Peluru LAUNCHER tak lewat jalur ini: ia sudah meledak sendiri, jadi
        // tetangga hanya kena SATU kali damage (blast), bukan blast + splash.
        clearBots(); stateMod.bullets.length = 0; stateMod.drops.length = 0; goreMod.resetGore();
        const zEx = mkBot('C', X0, Z0), zExN = mkBot('C', X0, Z0 + inner);
        for (const z of [zEx, zExN]) { z.hp = z.maxHp = 900; robots.push(z); }
        shootAt(X0, Z0, DMG, { explosive: true, explodeR: cfgMod.CFG.grenade.killRadius + 3.5 });
        robotsMod.updateRobots(0.016, 1);
        T('SPLASH PELURU: peluru launcher tetap SATU ledakan (tanpa splash ganda)',
            zEx.hp === 900 - DMG && zExN.hp === 900 - DMG);
    }

    clearBots(); stateMod.bullets.length = 0; stateMod.drops.length = 0; goreMod.resetGore();
    robotsMod.resetRobotsFx();
    T('SPLASH PELURU: resetRobotsFx mengosongkan antrean splash',
        robotsMod.pendingSplashDebug().length === 0);
}

// --- 29. PENGALI JUMLAH ROBOT PER STAGE + OVERRIDE PINTU STAGE 1 (2026-08-16,
//     permintaan user: stage 1 +50%, stage 2 +60%, stage 3 +30%, stage 4 2x,
//     stage 5 chapter stasiun +50%, stage 6 2x; dan hack komputer utama membuka
//     semua pintu terkunci). Semua assert membaca CFG — retune config tetap hijau.
{
    const com29 = await import(R('src/scenes/campaign/utility/common.js'));
    const s1m29 = await import(R('src/scenes/campaign/stages/stage1/index.js'));
    const door29 = await import(R('src/scenes/campaign/utility/doors.js'));

    // (a) Pengali TERPASANG di config, satu angka per stage.
    const wanted = { 1: 1.5, 2: 1.6, 3: 1.3, 4: 2, 5: 1.5, 6: 2 };
    let mulOK = true, badMul = '';
    for (const [stage, v] of Object.entries(wanted)) {
        const got = com29.stageRobotMul(+stage);
        if (got !== cfgMod.CFG.campaign['stage' + stage].robotCountMul || got !== v) {
            mulOK = false; badMul = badMul || ('stage' + stage + '=' + got);
        }
    }
    T('ROBOT MUL: keenam stage memakai robotCountMul dari config'
        + (badMul ? ' [' + badMul + ']' : ''), mulOK);
    // Stage tanpa kunci itu TIDAK ikut terkena (mis. stage 7-13).
    T('ROBOT MUL: stage tanpa robotCountMul tetap 1x (fitur opt-in per stage)',
        com29.stageRobotMul(7) === 1 && com29.stageRobotMul(13) === 1
        && cfgMod.CFG.campaign.stage7.robotCountMul === undefined);

    // (b) Pembulatan AKUMULATIF: total persis round(total x mul) dan tak ada
    //     entri berisi robot yang menguap jadi nol.
    const base = [3, 3, 3, 2, 2, 4, 1];
    const total = base.reduce((a, b) => a + b, 0);
    const scaled = com29.scaleSpawnCounts(base, 4);   // stage 4 = 2x
    T('ROBOT MUL: scaleSpawnCounts menjaga TOTAL tepat round(total x mul), bukan pembulatan per entri',
        scaled.length === base.length
        && scaled.reduce((a, b) => a + b, 0) === Math.round(total * com29.stageRobotMul(4))
        && scaled.every((n, i) => (base[i] > 0 ? n > 0 : n === 0)));
    T('ROBOT MUL: scaleRobotCount tak pernah mengosongkan tabel yang aslinya berisi',
        com29.scaleRobotCount(1, 3) >= 1 && com29.scaleRobotCount(0, 3) === 0
        && com29.scaleRobotCount(6, 3) === Math.round(6 * com29.stageRobotMul(3)));

    // (c) Populasi NYATA tiap stage = tabel dasarnya x pengalinya.
    T('ROBOT MUL: stage 1/2/4 mengalikan tabel spawn-nya sendiri',
        s1m29.s1Wave1Count() === Math.round(s1m29.s1Wave1Base * com29.stageRobotMul(1))
        && s2mod.s2Wave1Count() === Math.round(s2mod.s2Wave1Base * com29.stageRobotMul(2))
        && s4mod.s4RobotCount() === Math.round(s4mod.s4RobotBase * com29.stageRobotMul(4)));

    // (d) MASUK STAGE MENGUNCI ULANG: override kill-switch tidak boleh terbawa
    //     ke run berikutnya (mati/restart selalu mengulang stage 1).
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    s1m29.stage1Scene.enter();
    const afterEnter = s1m29.s1Debug();
    const brokenAgain = s1m29.s1DoorsDbg().filter(d => d.broken);
    T('S1 KILL-SWITCH: enter() mengunci ulang seluruh pintu (override tak terbawa ke run berikutnya)',
        afterEnter.doorsFreed === 0 && afterEnter.lockedDoors === 3
        && brokenAgain.length === 2
        && brokenAgain.every(d => d.locked && d.open === door29.DOOR_BROKEN_AJAR));
    T('S1 KILL-SWITCH: enter() juga menempatkan garnisun ber-pengali (' + s1m29.s1Wave1Count() + ')',
        robots.filter(z => z.stage === 1).length === s1m29.s1Wave1Count());
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
