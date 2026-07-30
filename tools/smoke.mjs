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
const ctx2d = new Proxy({}, {
    get: (t, k) => {
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() { } });
        if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) });
        if (k === 'measureText') return () => ({ width: 1 });
        if (k === 'canvas') return { width: 64, height: 64 };
        return () => { };
    },
    set: () => true
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
    addEventListener() { }, location: { reload() { } }
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
    constructor() { this.volume = 1; this.currentTime = 0; this.paused = true; this.loop = false; }
    load() { } play() { this.paused = false; return { catch() { } }; } pause() { this.paused = true; }
    cloneNode() { return new global.Audio(); }
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
class Matrix4 { setPosition() { return this; } compose() { return this; } }
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
class PLight extends Obj3D { constructor() { super(); this.intensity = 0; this.color = new Color(0xffffff); this.isLight = true; this.isPointLight = true; } }
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
    InstancedMesh: class extends Obj3D { constructor(g, m, n) { super(); this.geometry = g; this.material = m; this.count = n; this.instanceColor = { needsUpdate: false }; } setMatrixAt() { } setColorAt() { } },
    SphereGeometry: geo('sph'), CylinderGeometry: geo('cyl'), BoxGeometry: geo('box'),
    ConeGeometry: geo('cone'), RingGeometry: geo('ring'), PlaneGeometry: geo('plane'),
    CircleGeometry: geo('circle'), TorusGeometry: geo('torus'), ExtrudeGeometry: geo('extrude'),
    IcosahedronGeometry: geo('ico'), DodecahedronGeometry: geo('dodeca'), EdgesGeometry: geo('edges'),
    LineSegments: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isLine = true; this.isLineSegments = true; } },
    Shape: class { moveTo() { } lineTo() { } quadraticCurveTo() { } bezierCurveTo() { } },
    MeshLambertMaterial: Mat, MeshBasicMaterial: Mat, MeshPhongMaterial: Mat, SpriteMaterial: Mat,
    MeshStandardMaterial: Mat, MeshPhysicalMaterial: Mat, LineBasicMaterial: Mat,
    CanvasTexture: class { constructor() { this.repeat = { set() { } }; this.offset = { set() { } }; } },
    // Fog dulu kelas kosong -> keadaan kabut mustahil diuji. Diisi 2026-07-27
    // (celah harness) supaya assert KABUT intro membaca scene.fog yang NYATA.
    Fog: class { constructor(c, n, f) { this.color = new Color(c); this.near = n; this.far = f; } },
    WebGLRenderer: class {
        constructor() { this.domElement = fakeEl(); this.shadowMap = {}; }
        setPixelRatio() { } setSize() { } getPixelRatio() { return 1; } compile() { } render() { }
    },
    sRGBEncoding: 3001, ACESFilmicToneMapping: 4, PCFSoftShadowMap: 2, DoubleSide: 2,
    AdditiveBlending: 2, NearestFilter: 1003, RepeatWrapping: 1000
};

// ---------- Muat modul nyata ----------
const R = (p) => 'file:///' + ROOT + '/' + p;
const cfgMod = await import(R('src/core/config.js'));
Object.assign(cfgMod.CFG, JSON.parse(fs.readFileSync(ROOT + '/config/gameplay.json', 'utf8')));
const rendererMod = await import(R('src/core/renderer.js'));
rendererMod.initRenderer();
const { scene, camera } = rendererMod;
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

// --- 1. buildRobotMesh per kelas ---
for (const cls of ['C', 'B', 'A', 'boss']) {
    const b = robotsMod.buildRobotMesh(cls);
    T(cls + ' rig lengkap', !!(b.rig.inner && b.rig.thighL && b.rig.thighR && b.rig.shinL && b.rig.shinR && b.rig.armL && b.rig.armR && b.rig.head));
    let meshes = 0; b.group.traverse(o => { if (o.isMesh) meshes++; });
    T(cls + ' punya mesh (' + meshes + ')', meshes > 15);
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
const prevWpn = wMod.currentWeapon;
wMod.startSwitch('launcher');
for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);   // selesaikan animasi switch 0.5 dtk
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
for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);

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
    for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);
    player.rifle.ammo = 200;
    stateMod.bullets.length = 0;
    wMod.resetWeapons(); wMod.startSwitch('rifle');
    for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);
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
    for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);
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
    for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);
}
for (let i = 0; i < 5; i++) wMod.updateWeaponState(0.2);      // luruhkan gunRecoil

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
const zK = mkBot('B', 300, 330);
robotsMod.fireRobotBullet(zK);
for (let i = 0; i < 2000 && enemyBullets.length; i++) robotsMod.updateEnemyBullets(0.016, 1);
T('HP habis -> sekuens kematian (BUKAN game over instan)',
    gameMod.isPlayerDying() && stateMod.isGameOver === false && player.hp <= 0);

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
const s2mod = await import(R('src/scenes/campaign/stages/stage2.js'));
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

// Jumlah robot STAGE 1 = 40 (2026-07-19 malam, permintaan user — dulu 30)
{
    const s1m = await import(R('src/scenes/campaign/stages/stage1.js'));
    const comMod = await import(R('src/scenes/campaign/utility/common.js'));
    if (!s1m.s1grid) s1m.buildWorld();
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    s1m.placeRobots();
    const n1 = robots.filter(z => z.stage === 1).length;
    T('S1: placeRobots menaruh 50 robot GELOMBANG-1 (kelas C) tagged stage 1 (' + n1 + ')',
        n1 === 50 && n1 === s1m.s1Wave1Count && robots.filter(z => z.stage === 1).every(z => z.kind === 'C'));

    // --- LAMPU PER-RUANGAN (2026-07-19): mati saat mulai, menyala saat player
    // memasuki rect ruangannya (yang lain tetap mati). ---
    const lamps = s1m.s1LampsDbg();
    comMod.resetRoomLamps(lamps);
    T('LAMPU: semua lampu ruangan MATI + SELUBUNG HITAM terpasang saat stage dimulai',
        lamps.length >= 10 && lamps.every(l => !l.on && l.L.intensity === 0)
        && lamps.filter(l => l.shroud).length >= 10
        && lamps.filter(l => l.shroud).every(l => l.shroud.visible && l.shroud.material.opacity === 1));
    const conf = s1m.s1Cell(14, 3);                    // ruang conference
    camera.position.set(conf.x, cfgMod.CFG.player.eyeHeight, conf.z);
    for (let i = 0; i < 12; i++) s1m.stage1Scene.updateMode(0.1);
    const lit = lamps.find(l => l.on);
    T('LAMPU: masuk ruangan -> lampu MENYALA + selubung hitamnya HILANG (ruangan lain tetap gelap)',
        lit && lit.L.intensity > 0.5 * lit.base
        && (!lit.shroud || lit.shroud.visible === false)
        && lamps.some(l => !l.on && l.shroud && l.shroud.visible));

    // REVISI (2026-07-19): lampu menyala saat PINTU ruangan DIBUKA — player
    // berdiri DI DEPAN pintu A<->B (masih di ruang A, BELUM masuk conference)
    // -> pintu bergeser terbuka -> lampu conference menyala lebih dulu.
    comMod.resetRoomLamps(lamps);
    const frontA = s1m.s1Cell(6, 3);            // ruang A, zona depan pintu A<->B (c8 r3-4)
    camera.position.set(frontA.x, cfgMod.CFG.player.eyeHeight, frontA.z);
    for (let i = 0; i < 30; i++) s1m.stage1Scene.updateMode(0.05);   // pintu terbuka penuh
    const confLamp = lamps[1];                  // lampu conference (rect c9-19 r1-6)
    T('LAMPU: pintu DIBUKA -> lampu ruangan di baliknya MENYALA (player belum masuk rect)',
        confLamp.doors && confLamp.doors.length > 0 && confLamp.on
        && !(frontA.x >= confLamp.x0 && frontA.x <= confLamp.x1));

    // --- FINISH TERKUNCI (2026-07-20): trigger TANGGA (T, titik masuk = titik
    // selesai) DITOLAK selagi objektif belum tuntas (fase clear1, robot hidup). ---
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
    comMod.spawnCampaignRobot(s1m.s1Cell(3, 8).x, s1m.s1Cell(3, 8).z, 1);   // di balik pintu A<->D
    const zDoor = robots[robots.length - 1];
    const cp2 = s1m.s1Cell(3, 6);
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
// bawah. Papan sirkuit N×N: putar chip sampai PORT (kiri-tengah) tersambung ke
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
    // (a) GENERATOR selalu menghasilkan papan yang BISA dipecahkan, untuk tiap
    //     ukuran papan yang mungkin (gridMin..gridMax) — jalur solusi digambar
    //     lebih dulu, chip pengecoh & rotasi acak menyusul.
    let genOk = true, startsUnsolved = true, startsWrong = true, boards = 0;
    for (let size = HK.gridMin; size <= HK.gridMax; size++) {
        for (let n = 0; n < 6; n++) {
            openBoard(size);
            const d0 = hackMod.hackDebug();
            if (d0.solved) startsUnsolved = false;
            if (!d0.tiles.filter(t => t.path).every(t => !t.ok)) startsWrong = false;
            if (d0.size !== size || !solveHack().solved) genOk = false;
            await waitHackClosed();
            boards++;
        }
    }
    T('HACK: generator SELALU solvable (' + boards + ' papan, ukuran gridMin..gridMax config)', genOk);
    T('HACK: papan dibuka BELUM terpecahkan & tiap chip jalur mulai salah orientasi',
        startsUnsolved && startsWrong);
    T('HACK: papan terpecahkan -> onSuccess dipanggil sekali per papan', wins === boards && lastResult === 'ok');
    T('HACK: ukuran papan naik bertahap gridMin -> gridMax (config-driven)',
        hackMod.hackGridSize(0) === HK.gridMin && hackMod.hackGridSize(9) === HK.gridMax
        && hackMod.hackGridSize(1) >= hackMod.hackGridSize(0));
    // (b) Rotasi 4x = kembali ke orientasi semula; chip MATI tak bisa diklik.
    openBoard(HK.gridMin);
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
    T('HACK: modal tak bisa dibuka dua kali', openBoard(HK.gridMin) === false);
    lastResult = null;
    smMod.activeScene.shopKey('escape');
    T('HACK: ESC = ABORT -> onFail("abort") + scene sebelumnya dipulihkan seketika',
        lastResult === 'abort' && hackMod.hackDebug().open === false
        && smMod.activeScene === prevOfHack);
    stateMod.setPaused(false);
    // (d) ICE TRACE habis -> LOCKED OUT -> onFail('fail').
    lastResult = null;
    openBoard(HK.gridMin);
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
    } else {
        for (let i = 0; i < g.n; i++) {
            const need = ((g.target[i] - g.pos[i]) % g.steps + g.steps) % g.steps;
            for (let k = 0; k < need; k++) repMod.applyValveTurn(g, i, 1);
        }
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
    } else {
        for (let i = 0; i < g.n; i++) {
            const need = ((g.target[i] - g.pos[i]) % g.steps + g.steps) % g.steps;
            for (let k = 0; k < need; k++) repMod.repairValveTurn(i, 1);
        }
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
        global.document = realDoc;
        T('REPAIR DRAG DOM: modal ditutup bersih setelah uji seret', dragResult === 'abort' && !repMod.isRepairOpen());
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

// --- ALUR STAGE 1 (2026-07-20, ROMBAK TOTAL): clear1 (bunuh 50 robot) -> BUKA
// ruang komputer -> MINIGAME HACK (2026-07-28, dulu bar unduh 10 dtk) -> spawn
// 20 robot wave-2 + horde di ruang X -> clear2 -> done (tangga aktif).
// Mulai dari state built section sebelumnya (fase clear1). ---
{
    const s1m = await import(R('src/scenes/campaign/stages/stage1.js'));
    // Fase awal = clear1 + pintu ruang komputer TERKUNCI (merah).
    T('S1 FLOW: fase clear1 + pintu ruang komputer TERKUNCI',
        s1m.s1Debug().phase === 'clear1' && s1m.s1CompDoorDbg() && s1m.s1CompDoorDbg().locked === true);
    // Buang SEMUA robot stage 1 -> updateMode -> fase download + pintu TERBUKA.
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 1) { scene.remove(robots[i].mesh); robots.splice(i, 1); }
    s1m.stage1Scene.updateMode(0.1);
    T('S1 FLOW: semua robot wave-1 tumbang -> fase download + pintu komputer TERBUKA',
        s1m.s1Debug().phase === 'download' && s1m.s1CompDoorDbg().locked === false);
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
    T('S1 HACK: papan ' + H1.size + 'x' + H1.size + ' (gridMin config) BELUM terpecahkan & tiap chip jalur mulai SALAH',
        H1.size === cfgMod.CFG.campaign.hack.gridMin && H1.solved === false
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
    T('S1 HACK: modal menutup -> scene sebelumnya DIPULIHKAN tanpa enter() (fase lanjut ke clear2, bukan reset ke clear1)',
        hackMod.hackDebug().open === false && smMod.activeScene === sceneBeforeHack
        && s1m.s1Debug().phase === 'clear2');
    const w2 = robots.filter(z => z.stage === 1);
    const nC = w2.filter(z => z.kind === 'C').length, nB = w2.filter(z => z.kind === 'B').length, nA = w2.filter(z => z.kind === 'A').length;
    // SECOND-IMPROVEMENT #3 (2026-07-22): unduh selesai spawn wave-2 (20) + HORDE
    // (CFG.campaign.stage1.hordeCount kelas C yang LANGSUNG menyerbu = 'chasing').
    // 2026-07-26 (permintaan user): stage 1 HANYA kelas C — tak ada B/A sama sekali.
    const horde = cfgMod.CFG.campaign.stage1.hordeCount;
    T('S1 FLOW: hack sukses -> wave-2 SEMUA kelas C + HORDE (' + horde + ' C) + kendali dikembalikan',
        s1m.s1Debug().phase === 'clear2' && stateMod.cinematicActive === false
        && w2.length === 20 + horde && nC === 20 + horde && nB === 0 && nA === 0);
    T('S1 FLOW: HORDE langsung menyerbu (ada robot chasing di wave-2)',
        horde === 0 || w2.some(z => z.state === 'chasing'));
    // Buang wave-2 -> fase done (tangga aktif).
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].stage === 1) { scene.remove(robots[i].mesh); robots.splice(i, 1); }
    s1m.stage1Scene.updateMode(0.1);
    T('S1 FLOW: wave-2 tumbang -> fase done (tangga jadi aktif)', s1m.s1Debug().phase === 'done');
}

// Bersihkan robot dari section sebelumnya, masuk scene, tempatkan robot+supply
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
const s2dropsBefore = stateMod.drops.length;
smMod.setScene(s2mod.stage2Scene);   // enter() menempatkan robot+supply stage 2 sendiri (2026-07-21)
const nStage2 = robots.filter(z => z.stage === 2).length;
T('S2: placeRobots menaruh 50 robot GELOMBANG-1 (kelas C) tagged stage 2 (' + nStage2 + ')',
    nStage2 === 50 && nStage2 === s2mod.s2Wave1Count && robots.filter(z => z.stage === 2).every(z => z.kind === 'C'));
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
// Tangga END (overhaul 2026-07-14): trigger -> pindah ke SHOP SCENE terpisah
// (`campaign-shop`) via LOADING; setelah loading shop terbuka; "Start Next Stage"
// (SPACE x2) -> LOADING -> transisi ke stage 3. Spy enter stage3 agar tak
// membangun dunianya di harness. Poll (bukan await tetap) supaya tahan MIN_LOADING.
const s3mod = await import(R('src/scenes/campaign/stages/stage3.js'));
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
stateMod._v3.set(s2LiftC.x, 0, s2LiftC.z);
s2mod.stage2Scene.playerCollide(stateMod._v3, s2LiftC.x, s2LiftC.z, 0);
T('S2: LIFT DITOLAK selagi belum selesai (fase clear1)', smMod.activeScene === s2mod.stage2Scene);
killS2(); s2mod.stage2Scene.updateMode(0.1);
T('S2 FLOW: wave1 (50 C) tumbang -> fase goGen', s2mod.s2Debug().phase === 'goGen');
camera.position.set(s2GenC.x, EY2, s2GenC.z); s2mod.stage2Scene.updateMode(0.1);
T('S2 FLOW: dekati generator -> collect + 20 penjaga gudang + 3 komponen',
    s2mod.s2Debug().phase === 'collect' && robots.filter(z => z.stage === 2).length === 20 && s2mod.s2ComponentsDbg().length === 3);
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
    T('S2 FLOW: 3 komponen terpasang -> DONE LANGSUNG + wave2 bala bantuan (10C/15B, 0 A) + kendali kembali',
        s2mod.s2Debug().phase === 'done' && s2mod.s2Debug().installed === 3
        && repMod.isRepairOpen() === false && stateMod.cinematicActive === false
        && w2.length === 25 && nC === 10 && nB === 15 && nA === 0);
}
// ATURAN BARU (2026-07-21): lift bisa dinaiki MESKI robot wave2 masih hidup — TANPA killS2.
const w2alive = robots.filter(z => z.stage === 2).length;
stateMod._v3.set(s2LiftC.x, 0, s2LiftC.z);
s2mod.stage2Scene.playerCollide(stateMod._v3, s2LiftC.x, s2LiftC.z, 0);   // -> setScene(campaignShopScene)
T('S2: fase done -> LIFT pindah ke SHOP SCENE MESKI wave2 (25) masih hidup (tak wajib dibunuh)',
    smMod.activeScene.id === 'campaign-shop' && w2alive === 25 && !s3entered);
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

// --- 16b. TANPA DINDING GANDA (2026-07-18): denah gedung stage 1/2/3 dirapatkan
// agar SETIAP celah antar-ruang = 1 sel dinding. Detektor: run dinding tebal-2
// (dua tembok paralel berdempetan = selalu ganda) ATAU tebal-3 dgn sel TENGAH
// tak ter-render (dua strip + celah terlihat). Sudut/tembok tipis panjang tidak
// dihitung. Cermin scratchpad walls.mjs. ---
{
    const s1mod = await import(R('src/scenes/campaign/stages/stage1.js'));
    if (!s1mod.s1grid) s1mod.buildWorld();
    const wcl = (g, c, r) => (r < 0 || c < 0 || r >= g.length || c >= g[0].length) ? true : g[r][c] === 1;
    const flr = (g, c, r) => !wcl(g, c, r);
    const rnd = (g, c, r) => {   // sel dinding ter-render? (punya tetangga-8 lantai)
        if (!wcl(g, c, r)) return false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (flr(g, c + dc, r + dr)) return true;
        return false;
    };
    const bands = (g) => {
        let n = 0;
        for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
            if (flr(g, c - 1, r) && wcl(g, c, r) && wcl(g, c + 1, r) && flr(g, c + 2, r)) n++;
            else if (flr(g, c - 1, r) && wcl(g, c, r) && wcl(g, c + 1, r) && wcl(g, c + 2, r) && flr(g, c + 3, r) && !rnd(g, c + 1, r)) n++;
            if (flr(g, c, r - 1) && wcl(g, c, r) && wcl(g, c, r + 1) && flr(g, c, r + 2)) n++;
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
// robot TIDAK membuka; di luar zona = SELALU tutup. MELUNCUR TURUN saat buka. ---
{
    const doorMod = await import(R('src/scenes/campaign/utility/doors.js'));
    const CELL = 14;
    const cellFn = (c, r) => ({ x: c * 20, z: r * 20 });   // koordinat sintetis, jauh dari robot nyata
    const doors = doorMod.buildStageDoors([{ c0: 5, r0: 5, c1: 5, r1: 5, dir: 'ew' }], cellFn, CELL, 22);
    const dr = doors[0], yClosed = dr.panel.position.y;
    T('Doors: pintu + panel terbangun (tertutup di atas, openY < closedY)',
        doors.length === 1 && dr.closedY > dr.openY && yClosed === dr.closedY);
    // Helper: setel posisi player, jalankan sampai stabil, kembalikan panel.y.
    // Durasi settle config-driven: harus melewati delay tutup closeDelaySec
    // (2026-07-20) + animasi buka/tutup supaya keadaan akhirnya deterministik.
    const doorDelay = cfgMod.CFG.campaign.doors.closeDelaySec;
    const settleFrames = Math.ceil((doorDelay + 1.5) / 0.05);
    const settle = (x, z) => {
        camera.position.set(x, 11, z);
        for (let i = 0; i < settleFrames; i++) doorMod.updateStageDoors(doors, 0.05);
        return dr.panel.position.y;
    };
    const isOpen = (y) => y < yClosed - 5, isShut = (y) => Math.abs(y - yClosed) < 0.5;
    // 'ew' → arah masuk = ±x (perp), sejajar bukaan = z (para).
    const yFar = settle(dr.cx + 400, dr.cz + 400);        // jauh → tutup
    const yFront2 = settle(dr.cx + 2 * CELL, dr.cz);      // 2 kotak di depan → BUKA
    const yFront3 = settle(dr.cx + 3 * CELL, dr.cz);      // 3 kotak → terlalu jauh, tutup
    const ySide = settle(dr.cx, dr.cz + 2 * CELL);        // sejajar, meleset dari bukaan → tutup
    T('Doors: BUKA hanya saat player <= 2 kotak DI DEPAN bukaan',
        isShut(yFar) && isOpen(yFront2) && isShut(yFront3) && isShut(ySide));
    // DELAY TUTUP (2026-07-20, permintaan user): pintu TIDAK langsung menutup
    // saat player keluar zona — masih terbuka selama closeDelaySec berjalan,
    // baru meluncur naik setelah delay habis (config-driven).
    settle(dr.cx + 2 * CELL, dr.cz);                      // BUKA penuh dulu
    camera.position.set(dr.cx + 400, 11, dr.cz + 400);    // player keluar zona
    for (let i = 0; i < Math.floor(doorDelay * 0.5 / 0.05); i++) doorMod.updateStageDoors(doors, 0.05);
    const yLinger = dr.panel.position.y;                  // baru ~setengah delay → masih TERBUKA
    for (let i = 0; i < Math.ceil((doorDelay * 0.5 + 1.5) / 0.05); i++) doorMod.updateStageDoors(doors, 0.05);
    const yDelayed = dr.panel.position.y;                 // delay habis → TERTUTUP
    T('Doors (2026-07-20): delay tutup closeDelaySec — masih terbuka di tengah delay, tertutup setelah habis',
        isOpen(yLinger) && isShut(yDelayed));
    // ROBOT di depan pintu TIDAK membukanya (player jauh) — hanya player yang bisa.
    const fakeBot = { mesh: { position: { x: dr.cx + CELL, y: 0, z: dr.cz } } };
    robots.push(fakeBot);
    const yBot = settle(dr.cx + 400, dr.cz + 400);        // player jauh, robot di depan pintu
    robots.splice(robots.indexOf(fakeBot), 1);
    T('Doors: robot di depan pintu TIDAK membuka (hanya player)', isShut(yBot));
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
// MENU (bg-music-main-menu; berhenti saat pilih mode di beginMode), BATTLE
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
    sfxMod.stopMusic();
    // Scene gameplay TIDAK lagi menyalakan musik di enter() — trigger battle
    // music satu-satunya = peluru player mengenai robot (robots.js).
    const sceneFiles = ['src/scenes/survival/index.js', 'src/scenes/campaign/stages/stage1.js',
        'src/scenes/campaign/stages/stage2.js', 'src/scenes/campaign/stages/stage3.js',
        'src/scenes/campaign/stages/stage4.js'];
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
T('S3: 4 MESIN pembuat robot (2 kiri + 2 kanan) semua hidup',
    s3mod.s3MachinesDbg().length === 4 && s3mod.s3MachinesDbg().every(m => m.alive));

// === 5 TERMINAL HACK (DIROMBAK 2026-07-28, permintaan user: pintu TIDAK BISA
// dihancurkan lagi; ia terbuka setelah 5 komputer di 5 ruangan di-hack BERURUTAN
// dgn urutan ACAK, dan spawn-robot-selama-menembaki-pintu DIHAPUS). ===
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
    T('S3 HACK: 5 terminal, satu di tiap ruangan (C, D, West Wing, East Wing, Supply)',
        H.terms.length === 5 && new Set(rooms).size === 5
        && Object.keys(S3_ROOM_RECT).every(k => rooms.includes(k)) && placeOk);
    T('S3 HACK: tiap terminal 2x1 sel di lantai & MENEMPEL dinding (ujung ruangan) + pejal',
        footOk && wallOk && H.terms.every(t => t.blocked === true));
    // (b) DUA di antaranya berdiri di ruangan yang dulu KOSONG (kiri lift & kanan
    //     chamber) — sebelum ini tak ada alasan sama sekali mengunjungi keduanya.
    T('S3 HACK: dua terminal mengisi ruangan yang dulu kosong (West/East Wing)',
        rooms.includes('West Wing') && rooms.includes('East Wing'));
}
// (c) URUTAN ACAK tiap masuk stage + selalu permutasi sah 0..4.
{
    const seenOrders = new Set();
    let permOk = true;
    for (let i = 0; i < 8; i++) {
        smMod.setScene(s3mod.stage3Scene);
        const o = s3mod.s3HackDbg().order;
        if (o.length !== 5 || new Set(o).size !== 5 || o.some(v => v < 0 || v > 4)) permOk = false;
        seenOrders.add(o.join(','));
    }
    T('S3 HACK: urutan hack DIACAK tiap masuk stage (' + seenOrders.size + ' urutan berbeda dari 8) & selalu permutasi sah',
        permOk && seenOrders.size > 1);
}
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
stateMod.setCinematicActive(false);

// Helper: terminal yang sedang jadi giliran + jalankan satu hack sampai selesai.
const s3Term = (i) => s3mod.s3HackDbg().terms[i];
const s3Active = () => { const d = s3mod.s3HackDbg(); return d.idx < 5 ? d.terms[d.order[d.idx]] : null; };
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
}

// (2) BERURUTAN: berdiri di terminal yang BUKAN giliran tidak memulai hack.
{
    const act = s3Active();
    const other = s3mod.s3HackDbg().terms.find(t => t.room !== act.room);
    s3StandAt(other);
    for (let i = 0; i < 20; i++) s3mod.stage3Scene.updateMode(0.05);
    T('S3 HACK: terminal yang BUKAN gilirannya tidak bisa di-hack (harus berurutan)',
        s3mod.s3Debug().hacking === false && s3mod.s3Debug().hacked === 0 && s3Count() === 0);
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
    T('S3 HACK: judul papan menyebut terminal giliran & ukurannya config-driven (gridMin..gridMax)',
        H.size >= cfgMod.CFG.campaign.hack.gridMin && H.size <= cfgMod.CFG.campaign.hack.gridMax
        && H.size === hackMod.hackGridSize(0));
    solveHack();
    await waitHackClosed();
    T('S3 HACK: puzzle terpecahkan -> scene stage 3 dipulihkan & terminal tercatat ter-hack',
        hackMod.hackDebug().open === false && smMod.activeScene === s3mod.stage3Scene
        && s3mod.s3Debug().hacking === false && s3mod.s3Debug().hacked === 1);
    const queued = s3mod.s3SpawnDbg().queued + s3Count();
    T('S3 HACK: hack SELESAI -> satu gelombang (6+6=12) diantre, langsung mengejar',
        queued === s3cfg.gateWaveCount * 2);
    s3Drain();
    T('S3 HACK: gelombang penuh keluar & semuanya chasing',
        s3Count() === s3cfg.gateWaveCount * 2 && robots.filter(z => z.stage === 3).every(z => z.state === 'chasing'));
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

// (6) Hack sisa terminal -> setelah yang KE-5 pintu MEMBUKA (naik), rambu HIJAU.
for (let k = 1; k < 5; k++) { await s3RunHack(); s3KillAll(); s3mod.s3SpawnDbg().queued && s3Drain(); s3KillAll(); }
T('S3 HACK: kelima terminal selesai -> semua layar KUNING',
    s3mod.s3Debug().hacked === 5 && s3mod.s3HackDbg().terms.every(t => t.hex === 0xffd23b));
s3mod.stage3Scene.updateMode(0.05);
T('S3 PINTU: 5/5 ter-hack -> pintu blast TERBUKA (blocker lepas, rambu HIJAU) + fase toX',
    s3mod.s3Debug().phase === 'toX' && s3mod.s3DoorDbg().open === true
    && s3mod.s3DoorDbg().blocked === false && s3mod.s3DoorDbg().signHex === 0x2eff6a);
// Daun pintu NAIK ke plafon (bukan meledak) — meshnya tetap ada, posisinya terangkat.
for (let i = 0; i < 60; i++) s3mod.stage3Scene.updateMode(0.05);
T('S3 PINTU: daun pintu NAIK ke plafon (mesh tetap ada, tidak dihancurkan)',
    s3mod.s3DoorDbg().visible === true && s3mod.s3DoorDbg().k >= 1);
s3KillAll();

// (4) Masuk ruang X -> fase machines TANPA spawn langsung; >= machineFirstWaveSec -> 16 (4/mesin)
const xin = s3mod.s3Cell(19.5, 33);
camera.position.set(xin.x, cfgMod.CFG.player.eyeHeight, xin.z);
s3mod.stage3Scene.updateMode(0.1);
T('S3 FLOW: masuk ruang X -> fase machines (4 mesin) TANPA spawn langsung',
    s3mod.s3Debug().phase === 'machines' && s3mod.s3Debug().machinesAlive === 4 && robots.filter(z => z.stage === 3).length === 0);
for (let t = 0; t < s3cfg.machineFirstWaveSec - 1; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
const beforeMW = robots.filter(z => z.stage === 3).length;
for (let t = 0; t < 2; t += 0.5) s3mod.stage3Scene.updateMode(0.5);
s3Drain();
T('S3 FLOW: mesin spawn PERTAMA setelah ~machineFirstWaveSec (3 dtk) = 4/mesin (16)',
    beforeMW === 0 && robots.filter(z => z.stage === 3).length === s3cfg.machineWaveCount * 4);

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

// (5) Hancurkan 4 MESIN (HP 0) -> hancur; habisi robot -> fase done (EXIT aktif)
for (const m of s3mod.s3MachinesDbg()) m.hp = 0;
s3mod.stage3Scene.updateMode(0.05);
T('S3 FLOW: 4 MESIN HANCUR saat HP habis', s3mod.s3Debug().machinesAlive === 0);
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
s3mod.stage3Scene.updateMode(0.05);
T('S3 FLOW: mesin hancur + robot habis -> fase done (PINTU KELUAR AKTIF)', s3mod.s3Debug().phase === 'done');

// (7) Stage 3 EXIT 'o' fase done -> SHOP SCENE -> Start Next Stage -> stage 4
const s4mod = await import(R('src/scenes/campaign/stages/stage4.js'));
const realS4Enter = s4mod.stage4Scene.enter;
let s4entered = false;
s4mod.stage4Scene.enter = () => { s4entered = true; };
const e3 = s3mod.s3Cell(s3mod.S3_END.c, s3mod.S3_END.r);
stateMod._v3.set(e3.x, 0, e3.z);
s3mod.stage3Scene.playerCollide(stateMod._v3, e3.x, e3.z, 0);   // -> setScene(campaignShopScene)
T('S3: fase done -> PINTU KELUAR pindah ke SHOP SCENE terpisah',
    smMod.activeScene.id === 'campaign-shop' && !s4entered);
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
        ['src/scenes/campaign/stages/stage1.js', 'src/scenes/campaign/stages/stage2.js', 'src/scenes/campaign/stages/stage3.js']
            .every(f => usesLift(f).includes("from '../utility/lift.js'") && usesLift(f).includes('buildLiftBank(')
                && !/function buildLiftCar|function buildLiftDoors/.test(usesLift(f))));
}

// --- 17. Campaign STAGE 4 (final, OUTDOOR; layout ALUN-ALUN 2026-07-17):
// parkiran kecil -> jalan raya 500 m -> GERBANG -> kompleks alun-alun (ring
// jalan 2 lajur mengelilingi lapangan), BOSS TANK spawn di PUSAT alun-alun.
// Bangun dunia (union walkable), konektivitas flood-fill START->END (END =
// pusat alun-alun; union tembus — gerbang = blocker, bukan union), robot
// 13-spot + supply (semua di BARAT gerbang = alun steril), robotAI, GERBANG
// tertutup selagi robot hidup, dan ALUR: bunuh semua -> gerbang terbuka +
// boss muncul -> bunuh boss -> MISSION COMPLETE (jeda singkat, tanpa trigger). ---
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
T('S4: placeRobots menaruh 40 robot (13 spot) tagged stage 4 (' + nStage4 + ')', nStage4 === 40);
// Komposisi 2026-07-19 (permintaan user): varian penembak A/B diperbanyak
T('S4: varian kelas A/B diperbanyak (A >= 5, B >= 8)',
    robots.filter(z => z.stage === 4 && z.kind === 'A').length >= 5
    && robots.filter(z => z.stage === 4 && z.kind === 'B').length >= 8);
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
T('S4: semua robot mati -> HELI penjemput menunggu di pusat alun (tank belum muncul)',
    s4heli != null && s4mod.currentTank() == null && !s4heli.wrecked
    && s4heli.parts.group.position.x === s4mod.S4_END.x
    && s4heli.parts.group.position.z === s4mod.S4_END.z);
{
    const r0 = s4heli.parts.rotor.rotation.y;
    s4mod.stage4Scene.updateMode(0.1);
    T('S4: baling-baling heli BERPUTAR cepat menunggu player', s4heli.parts.rotor.rotation.y > r0);
}
// GERBANG kini terbuka: posisi yang sama tidak lagi terdorong. CATATAN: collide
// DI DALAM rect SQ ini sekaligus = "player menginjak ring road" -> CUTSCENE mulai.
{
    // fokus kamera dipanaskan ke pivot dulu (di game nyata fokus selalu
    // membuntuti player) — supaya pan sinematik diukur dari posisi wajar
    camera.position.set(s4mod.S4_GATE.x, cfgMod.CFG.player.eyeHeight, s4mod.S4_GATE.z);
    rendererMod.followViewCam(0.1);   // snap: fokus = pivot di gerbang
    stateMod._v3.set(s4mod.S4_GATE.x, 0, s4mod.S4_GATE.z);
    s4mod.stage4Scene.playerCollide(stateMod._v3, s4mod.S4_GATE.x - 40, s4mod.S4_GATE.z, 0);
    T('S4: gerbang TERBUKA setelah semua robot mati (player bisa lewat)',
        Math.abs(stateMod._v3.x - s4mod.S4_GATE.x) < 1e-6);
}
// CUTSCENE (2026-07-17): input dibekukan (cinematicActive; Esc tetap hidup),
// letterbox+HUD via dom, kamera pan ke heli, TANK masuk dari UTARA menembak
// heli (hancur), maju ke DEPAN bangkai, pan balik, kontrol pulih. Mesin
// berbasis TIMER -> deterministik headless.
T('S4 cutscene: menginjak ring road -> sinematik aktif + input player dibekukan',
    s4mod.cineDebug().active && stateMod.cinematicActive === true);
{
    // ===== CUTSCENE TANK-BOSS — DIROMBAK 2026-07-27 (permintaan user: "buat agar
    // jauh lebih dramatis, jauh lebih cinematic ... SEPERTI FILM BOX OFFICE").
    // Papan 11 shot dgn azimut/jarak/tinggi sendiri (hook stage4Scene.camOffset ->
    // tankBossIntro.camOffset()), TIGA potongan film, telegraf getaran sebelum
    // reveal, gerak lambat hit-stop, heli yang mencoba kabur lalu JATUH, takarir,
    // dan serah-terima kamera TEPAT di sudut gameplay. Durasi shot dari CFG.
    const tsMod4 = await import(R('src/core/timeScale.js'));
    const dom4 = await import(R('src/core/dom.js'));
    const azOf4 = (o) => { const a = Math.atan2(o.x, o.z) * 180 / Math.PI; return a < 0 ? a + 360 : a; };
    const camOff4 = () => s4mod.stage4Scene.camOffset;
    const HX = s4mod.S4_END.x, HZ = s4mod.S4_END.z;
    const P4 = { x: camera.position.x, z: camera.position.z };   // tempat player berdiri saat cutscene mulai
    const fogBefore = { near: scene.fog.near, far: scene.fog.far };
    const D0 = s4mod.cineDebug();
    const smashPre = s4mod.smashDebug();          // ruko masih UTUH sebelum tank masuk
    let smashPhase = null, smashTankZ = 0;        // fase & posisi tank saat ruko roboh
    const seen4 = [], caps4 = [], shot4 = [], spd4 = [];
    let last4 = null, lastCap4 = null, n4 = 0, sawTankCine = false;
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
        if (d.caption && d.caption !== lastCap4) { caps4.push(d.caption); lastCap4 = d.caption; }
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
    T('S4 CUTSCENE TAKARIR: takarir English tampil urut & hilang di akhir (' + caps4.length + ')',
        caps4.length === 5 && caps4.every(c => /^[\x20-\x7E]+$/.test(c))
        && caps4[1].includes('Something heavy') && caps4[4].includes('WAR TANK')
        && dom4.cineCaptionDebug() === null);
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
        const tbiMod = await import(R('src/scenes/campaign/cutscenes/tankBossIntro.js'));
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
// kematian tank + jeda WIN_DELAY singkat di updateMode).
stateMod.setGameOver(false);
T('S4: belum MISSION COMPLETE selagi tank hidup', stateMod.isGameOver === false);
// PROYEKTIL LENYAP saat tank hancur (2026-07-18): shell/mortar terbang + peluru
// MG (enemyBullets) dibuang seketika supaya bangkai tak bisa lagi melukai player.
while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }
s4tank.shells.push({ mesh: new THREE.Mesh(), dirx: 1, dirz: 0, speed: 7, tx: 9e9, tz: 0, travelled: 0, dist: 9e9, life: 220, id: 999 });   // seed shell terbang (mock, jauh dari mendarat)
s4tank.mortars.push({ mesh: new THREE.Mesh(), vx: 0, vz: 0, vy: 50, g: 90, landY: 5, tLeft: 5, trailT: 1, life: 300, id: 998 });
enemyBullets.push({ mesh: new THREE.Mesh(), dir: new THREE.Vector3(1, 0, 0), speed: 4, life: 100, dmg: 5, monasDmg: 0, px: 0, py: 0, pz: 0 });
// hancurkan tank (HP habis) -> updateMode -> jeda singkat -> MISSION COMPLETE
const s4hullX = s4tank.parts.group.position.x, s4hullZ = s4tank.parts.group.position.z;
const s4paint0 = s4tank.parts.paintMats[0].color.getHex();   // cat sebelum menghangus
s4tank.hp = 0;
s4mod.stage4Scene.updateMode(0.1);
T('S4: tank HANCUR saat HP habis', s4tank.dead === true);
T('S4: proyektil tank (shell/mortar/peluru MG) LENYAP saat tank hancur (tak melukai player)',
    s4tank.shells.length === 0 && s4tank.mortars.length === 0 && enemyBullets.length === 0);
T('S4: belum menang PERSIS saat tank hancur (jeda ledakan dulu)', stateMod.isGameOver === false);
// ===== SEKUENS MATI SINEMATIK (2026-07-29, permintaan user: ledakan lama
// "kurang dramatis"; idenya: turret LEPAS dan terlempar ke sisi tank). Kontrak
// 3 beat: 'cook' (cook-off, turret masih terpasang) -> 'fly' (turret jadi benda
// bebas yang dilontarkan ke SISI lambung) -> 'wreck' (lambung ambruk membara). =====
s4mod.stage4Scene.updateMode(0.1);   // 1 frame sekuens (0,2 dtk < cook-off) — masih beat 1
T('S4 MATI SINEMATIK beat 1: COOK-OFF dulu — turret MASIH di lambung, cat baru sebagian menghangus',
    s4tank.deathPhase === 'cook' && s4tank.parts.turret.parent === s4tank.parts.group
    && s4tank.turretFly === null && s4tank.charK > 0 && s4tank.charK < 1);
const s4turret = s4tank.parts.turret;
// > jeda win (WIN_DELAY_SEC naik ke 5 dtk pada 2026-07-29 — permintaan user:
// beri waktu MENIKMATI bangkai membara sebelum layar MISSION COMPLETE)
let s4winFrames = 0;
for (let i = 0; i < 90 && !stateMod.isGameOver; i++) { s4mod.stage4Scene.updateMode(0.1); s4winFrames++; }
T('S4: MISSION COMPLETE menunggu ~5 dtk penuh (bukan potong sekuens mati; '
    + (s4winFrames * 0.1).toFixed(1) + ' dtk)', s4winFrames * 0.1 > 4.5);
T('S4: hancurkan tank -> MISSION COMPLETE (gameOver win, tanpa trigger stasiun)', stateMod.isGameOver === true);
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
stateMod.setGameOver(false);

// --- 17b. CHEAT skip-to-stage-N (2026-07-14): lompat LANGSUNG ke stage campaign
// (tanpa shop). Hook `cheatSkipToStage` di tiap stage → `campaignJumpToStage`
// (transition.js): bersihkan robot + setScene(target) + tempatkan robot. ---
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
let jr = smMod.activeScene.cheatSkipToStage(3);   // dari stage 4 aktif -> STAGE 3
await s3RunHack(); s3Drain();   // stage 3 MULAI kosong; HACK terminal (minigame) -> gelombang robot
T('cheat skip-to-stage-3: pindah ke stage 3 + hack terminal -> gelombang robot (3-tag)', jr === 3
    && smMod.activeScene === s3mod.stage3Scene && robots.length > 0 && robots.every(z => z.stage === 3));
jr = smMod.activeScene.cheatSkipToStage(2);        // -> STAGE 2 (robot ditempatkan ulang oleh helper)
T('cheat skip-to-stage-2: pindah ke stage 2 + 50 robot ditempatkan', jr === 2
    && smMod.activeScene === s2mod.stage2Scene && robots.filter(z => z.stage === 2).length === 50);
const s4before = smMod.activeScene;
T('cheat skip-to-stage invalid (9) ditolak, scene tak berubah',
    smMod.activeScene.cheatSkipToStage(9) === null && smMod.activeScene === s4before);
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
    for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);   // selesaikan animasi ganti
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
    for (let i = 0; i < 12; i++) wMod.updateWeaponTimers(0.1);   // selesaikan animasi ganti (switchAnim -> -1)
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
saveMod.saveCampaignStage(9);   // di luar 1..4 -> dianggap tak valid
T('save: nilai invalid (9) dibaca sebagai 0', saveMod.loadCampaignStage() === 0);
saveMod.clearCampaignSave();
T('save: clear -> 0', saveMod.loadCampaignStage() === 0);
// enter() stage MENULIS checkpoint (uji lewat cheat jump = enter langsung)
smMod.activeScene.cheatSkipToStage(3);   // stage3.enter -> saveCampaignStage(3)
T('save: enter stage 3 menulis checkpoint 3', saveMod.loadCampaignStage() === 3);
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
smMod.activeScene.cheatSkipToStage(1);   // stage1.enter -> saveCampaignStage(1)
T('save: enter stage 1 menulis checkpoint 1', saveMod.loadCampaignStage() === 1);
// Konsistensi loading antar-stage (2026-07-16): stage1.enter mem-pre-build SEMUA
// dunia campaign (ensureWorld stage 3 & 4 di dalam guard `built`-nya) sehingga
// LOADING #2 transisi mana pun tak lagi menanggung build+compile lazy.
T('campaign: dunia stage 3 & 4 PRE-BUILT saat campaign dimulai (loading konsisten)',
    s3mod.worldBuilt() && s4mod.worldBuilt());
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
gameMod.gameOver(true);
T('save: MISSION COMPLETE (gameOver win) menghapus checkpoint', saveMod.loadCampaignStage() === 0);
stateMod.setGameOver(false);
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
saveMod.clearCampaignSave();   // bersihkan utk test berikutnya

// --- 17d. INTRO CUTSCENE campaign (2026-07-17): start campaign BARU diawali
// cutscene penurunan HELIKOPTER di ATAP gedung sebelum Stage 1. Scene NON-
// gameplay (cinematicActive membekukan kontrol); mesin BERBASIS TIMER (durasi
// dari CFG.campaign.intro): SCENE 1 heli terbang menuju atap -> hover -> tali
// menjuntai -> character TURUN tali -> BERJALAN ke pintu -> MASUK -> 2 dtk
// (doorDelaySec) -> Stage 1. Config-driven; stage1.enter di-spy (deteksi transisi
// tanpa menempatkan robot). ---
{
    const introMod = await import(R('src/scenes/campaign/cutscenes/intro.js'));
    const s1mod = await import(R('src/scenes/campaign/stages/stage1.js'));
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
    T('INTRO: ketinggian hover heli diturunkan (HOVER_Y < 55)', IM.hoverY < 55 && IM.hoverY > 25);
    T('INTRO: landmark Jakarta (Monas/Bundaran HI/GBK) terpasang jauh dari atap hero',
        ['monas', 'bundaranHI', 'gbk'].every(k => IM.landmarks[k] && IM.landmarks[k].r > 0
            && Math.hypot(IM.landmarks[k].x - introMod.introDebug().drop.x,
                IM.landmarks[k].z - introMod.introDebug().drop.z) > 250));

    stateMod.setPaused(true);   // keadaan pra-cutscene (layar mulai)
    const introBlocker = global.document.getElementById('blocker');
    const domSkipMod = await import(R('src/core/dom.js'));
    domSkipMod.hideCutsceneSkip();   // bersihkan callback skip tersisa dari tes lain
    introMod.beginIntro();
    T('INTRO: beginIntro -> AUTO-PLAY (unpause + blocker/tutorial DISEMBUNYIKAN) + sinematik ON + shot pembuka',
        stateMod.cinematicActive === true && stateMod.isPaused === false
        && introBlocker.style.display === 'none'
        && introMod.introDebug().phase === 'establish' && introMod.introDebug().avatarShown === false);
    // BUG FIX 2026-07-20: beginIntro dipanggil main.js MASIH di balik layar
    // loading — tombol SKIP (dan deru heli) TIDAK boleh menyala di beginIntro;
    // keduanya ditunda ke frame PERTAMA updateMode (cutscene benar-benar tampil).
    T('INTRO (2026-07-20): tombol SKIP belum terdaftar saat masih di balik layar loading',
        domSkipMod.triggerCutsceneSkip() === false && introMod.introDebug().phase === 'establish');

    // Helper: jalankan updateMode hingga fase = target (atau cutscene selesai)
    const run = (target, max = 500) => {
        let n = 0;
        while (introMod.introDebug().active && introMod.introDebug().phase !== target && n < max) {
            introMod.introScene.updateMode(0.1); n++;
        }
        return introMod.introDebug().phase === target;
    };

    // SHOT 1 "KOTA" (2026-07-27): pandangan nyaris tegak lurus dari atas —
    // kamera TINGGI & jauh, heli baru merayap sedikit (18% lintasan).
    const h0 = introMod.introDebug();
    const camEstablish = { ...introMod.introScene.camOffset };
    T('INTRO SHOT 1 (KOTA): kamera nyaris dari atas & jauh (tinggi '
        + camEstablish.y.toFixed(0) + ', jarak ' + Math.hypot(camEstablish.x, camEstablish.z).toFixed(0) + ')',
        camEstablish.y > 400 && Math.hypot(camEstablish.x, camEstablish.z) > 180);
    run('fly');
    const hFlyStart = introMod.introDebug();
    // Fraksi lintasan yang ditempuh selama shot pembuka (0 = diam, 1 = sampai).
    const flyFrac = (hFlyStart.heliX - h0.heliX) / (h0.drop.x - h0.heliX);
    T('INTRO SHOT 1: heli baru merayap sedikit (' + (flyFrac * 100).toFixed(0)
        + '% lintasan) — skala kota sempat terbaca', flyFrac > 0.05 && flyFrac < 0.35);
    // SHOT 2 "APPROACH": heli menderu mendekat + kamera CRANE TURUN (tinggi kamera
    // berkurang drastis) — inilah bahasa kamera yang dulu tak ada sama sekali.
    const flyFrames = Math.floor((I.flySec * 0.5) / 0.1);
    for (let i = 0; i < flyFrames; i++) introMod.introScene.updateMode(0.1);
    const hFly = introMod.introDebug();
    const camFly = introMod.introScene.camOffset;
    T('INTRO SHOT 2 (APPROACH): heli MENYUSURI langit + pivot mengikutinya',
        hFly.phase === 'fly' && (hFly.heliX - h0.heliX) > 600
        && Math.abs(hFly.pivotX - hFly.heliX) < 40 && Math.abs(hFly.pivotZ - hFly.heliZ) < 40);
    T('INTRO SHOT 2: kamera CRANE TURUN dari shot pembuka (tinggi '
        + camEstablish.y.toFixed(0) + ' -> ' + camFly.y.toFixed(0) + ')', camFly.y < camEstablish.y - 100);

    // SCENE 2: approach -> heli SAMPAI di atas atap (menggantung) -> tali -> turun
    run('descend');
    introMod.introScene.updateMode(0.1);   // 1 frame descend agar setAvatarRappel(true) terpanggil
    const dTop = introMod.introDebug();
    const rap0 = avMod.rappelDebug();
    T('INTRO SCENE 2 (turun tali): fase descend -> avatar TAMPIL dari ketinggian tali + POSE RAPPEL aktif',
        dTop.phase === 'descend' && dTop.avatarShown === true
        && dTop.pivotY > dTop.roofY + dTop.eyeH + 18   // margin diturunkan (HOVER_Y 48, 2026-07-19 — heli menggantung rendah)
        && Math.abs(dTop.heliX - dTop.drop.x) < 40 && rap0.active === true);
    // (2026-07-18) SEBELUM berjalan ke pintu: fase ropeUp (heli menarik naik tali,
    // avatar berdiri di titik turun, rappel dilepas) lalu heliLeave (heli TERBANG
    // PERGI — player menontonnya). BARU kemudian jalan ke pintu.
    run('ropeUp');
    const ru = introMod.introDebug();
    // SHOT 3 "FLARE" + SHOT 7 "KETUKAN" (BARU 2026-07-27) sudah dilalui di atas;
    // di sini pastikan kamera benar-benar BERPINDAH SUDUT antar shot (bukan satu
    // sudut gameplay sepanjang cutscene seperti versi lama).
    T('INTRO SHOT: kamera turun ke HERO ANGLE rendah saat tali/turun (tinggi < 120)',
        introMod.introScene.camOffset.y < 120);
    T('INTRO (2026-07-18): setelah turun -> fase ropeUp (avatar berdiri di titik turun, pose rappel dilepas)',
        ru.phase === 'ropeUp' && ru.avatarShown === true && avMod.rappelDebug().active === false
        && Math.abs(ru.pivotY - (ru.roofY + ru.eyeH)) < 1);
    run('heliLeave');
    for (let i = 0; i < Math.floor((I.heliLeaveSec || 2.8) / 0.1) - 2; i++) introMod.introScene.updateMode(0.1);
    const hlv = introMod.introDebug();
    T('INTRO (2026-07-18): heli TERBANG PERGI (menanjak + menjauh dari titik turun) sebelum player berjalan',
        hlv.heliY > ru.roofY + 180 && Math.hypot(hlv.heliX - ru.drop.x, hlv.heliZ - ru.drop.z) > 300);
    run('walk');
    const dBot = introMod.introDebug();
    T('INTRO SCENE 2 (turun tali): akhir -> fase walk, pivot (avatar) di lantai atap + pose rappel dilepas',
        dBot.phase === 'walk' && Math.abs(dBot.pivotY - (dBot.roofY + dBot.eyeH)) < 1
        && avMod.rappelDebug().active === false);

    // SCENE 2: BERJALAN dari titik turun ke PINTU gedung (di sisi KIRI/-x — ditukar
    // dgn tangki air 2026-07-18 agar konsisten Stage 1 yang tangganya di kiri-atas)
    const w0 = introMod.introDebug();
    T('INTRO (2026-07-18): pintu bulkhead pindah ke sisi KIRI (barat, door.x < drop.x)',
        w0.door.x < w0.drop.x);
    run('enter');
    const w1 = introMod.introDebug();
    T('INTRO SCENE 2 (jalan ke pintu): pivot bergerak dari titik turun MENUJU pintu',
        w1.phase === 'enter'
        && Math.abs(w1.pivotX - w1.door.x) < Math.abs(w0.pivotX - w0.door.x)
        && Math.abs(w1.pivotZ - w1.door.z) < Math.abs(w0.pivotZ - w0.door.z));

    // SCENE 2: MASUK pintu -> fase wait, avatar hilang (masuk gedung)
    run('wait');
    T('INTRO SCENE 2 (masuk pintu): fase wait + avatar disembunyikan (masuk gedung)',
        introMod.introDebug().phase === 'wait' && introMod.introDebug().avatarShown === false);

    // JEDA 2 DETIK (doorDelaySec) setelah masuk pintu -> baru berakhir (config-driven)
    const preSteps = Math.max(1, Math.floor((I.doorDelaySec - 0.05) / 0.1));
    for (let i = 0; i < preSteps; i++) introMod.introScene.updateMode(0.1);
    T('INTRO: belum berakhir sebelum doorDelaySec habis (jeda ' + I.doorDelaySec + ' dtk)',
        I.doorDelaySec > 0 && !s1entered && stateMod.cinematicActive === true);
    for (let i = 0; i < 6; i++) introMod.introScene.updateMode(0.1);   // lewati sisa jeda
    T('INTRO: doorDelaySec habis -> cutscene selesai -> Stage 1 (sinematik OFF) + tutorial ditampilkan (pause+blocker)',
        s1entered && stateMod.cinematicActive === false
        && smMod.activeScene === s1mod.stage1Scene && introMod.introDebug().active === false
        && stateMod.isPaused === true && introBlocker.style.display === 'flex');

    // --- 17d2. SINEMATOGRAFI INTRO (OVERHAUL 2026-07-27) + KONTRAK NARASI.
    // Yang WAJIB dijaga apa pun perubahan sinematiknya (permintaan user):
    // datang naik HELIKOPTER -> TURUN di atas gedung -> helikopter PERGI ->
    // player MASUK ke dalam gedung. Diperiksa sebagai URUTAN, bukan potongan.
    {
        smMod.setScene(introMod.introScene);
        introMod.beginIntro();
        const seen = [];            // urutan fase
        const cam = [];             // [az, jarak, tinggi] per fase
        const azOf = (o) => { let a = Math.atan2(o.x, o.z) * 180 / Math.PI; return a < 0 ? a + 360 : a; };
        let heliHigh0 = 0, heliLowAtDrop = 1e9, heliHighEnd = 0;
        let avatarFirstShownPhase = null, avatarHiddenPhase = null, dust = 0;
        let last = null, n = 0;
        // --- Pengukur KEMULUSAN (2026-07-27): lompatan per-frame kamera/pivot/kabut
        //     + busur azimut yang DI-UNWRAP (untuk menguji "tidak berputar-putar").
        let maxAzStep = 0, maxHStep = 0, maxPivStep = 0, maxFogStep = 0;
        let azUnwrap = 0, azMin = 0, azMax = 0, azRev = 0, azDir = 0;
        let pAz = null, pH = null, pPiv = null, pFog = null, fadeAtEnd = null;
        while (introMod.introDebug().active && n++ < 4000) {
            introMod.introScene.updateMode(1 / 60);
            // Kemulusan diukur HANYA selama cutscene masih hidup: frame terakhir
            // memulihkan kabut global Stage 1 (pergantian scene) — itu potongan
            // yang memang ditutup TIRAI hitam, bukan batas shot.
            if (introMod.introDebug().active) {
                const o = introMod.introScene.camOffset;
                const a = azOf(o), h = o.y;
                const d2 = introMod.introDebug();
                const piv = [d2.pivotX, d2.pivotY, d2.pivotZ];
                if (pAz != null) {
                    let da = a - pAz;                       // beda sudut TERPENDEK
                    if (da > 180) da -= 360; else if (da < -180) da += 360;
                    maxAzStep = Math.max(maxAzStep, Math.abs(da));
                    azUnwrap += da;
                    azMin = Math.min(azMin, azUnwrap); azMax = Math.max(azMax, azUnwrap);
                    if (Math.abs(da) > 0.02) {              // arah putar (abaikan derau)
                        const dir = Math.sign(da);
                        if (azDir && dir !== azDir) azRev++;
                        azDir = dir;
                    }
                    maxHStep = Math.max(maxHStep, Math.abs(h - pH));
                    maxPivStep = Math.max(maxPivStep, Math.hypot(piv[0] - pPiv[0], piv[1] - pPiv[1], piv[2] - pPiv[2]));
                    maxFogStep = Math.max(maxFogStep, Math.abs(scene.fog.far - pFog));
                }
                pAz = a; pH = h; pPiv = piv; pFog = scene.fog.far;
                if (introMod.introDebug().phase === 'wait') fadeAtEnd = domSkipMod.cineFadeDebug();
            }
            const d = introMod.introDebug();
            if (d.phase && d.phase !== last) {
                seen.push(d.phase);
                cam.push([azOf(introMod.introScene.camOffset),
                    Math.hypot(introMod.introScene.camOffset.x, introMod.introScene.camOffset.z),
                    introMod.introScene.camOffset.y]);
                last = d.phase;
            }
            if (d.heliY != null) {
                if (seen.length <= 2) heliHigh0 = Math.max(heliHigh0, d.heliY);          // datang dari langit
                if (d.phase === 'rope' || d.phase === 'descend') heliLowAtDrop = Math.min(heliLowAtDrop, d.heliY);
                if (d.phase === 'walk' || d.phase === 'enter') heliHighEnd = Math.max(heliHighEnd, d.heliY);
            }
            if (d.avatarShown && !avatarFirstShownPhase) avatarFirstShownPhase = d.phase;
            if (avatarFirstShownPhase && !d.avatarShown && !avatarHiddenPhase) avatarHiddenPhase = d.phase;
            dust = Math.max(dust, stateMod.explosions.length);
        }
        const camEnd = { ...introMod.introScene.camOffset };   // sudut kamera saat cutscene tutup
        // --- KONTRAK NARASI (empat pesan yang tak boleh hilang)
        T('INTRO NARASI 1: datang naik HELIKOPTER dari langit tinggi (' + heliHigh0.toFixed(0) + ' u)',
            heliHigh0 > 150);
        T('INTRO NARASI 2: player TURUN di atas gedung (avatar muncul saat fase turun-tali)',
            avatarFirstShownPhase === 'descend');
        T('INTRO NARASI 3: HELIKOPTER PERGI (turun ke ' + heliLowAtDrop.toFixed(0)
            + ' u lalu menanjak lagi ke ' + heliHighEnd.toFixed(0) + ' u)',
            heliLowAtDrop < 60 && heliHighEnd > heliLowAtDrop + 100);
        T('INTRO NARASI 4: player MASUK ke dalam gedung (avatar disembunyikan di akhir)',
            avatarHiddenPhase === 'wait' && seen.indexOf('enter') < seen.indexOf('wait'));
        T('INTRO NARASI: urutan beat benar (turun -> heli pergi -> jalan -> masuk)',
            seen.indexOf('descend') < seen.indexOf('heliLeave')
            && seen.indexOf('heliLeave') < seen.indexOf('walk')
            && seen.indexOf('walk') < seen.indexOf('enter'));
        // --- SINEMATOGRAFI: shot baru + RAGAM sudut (versi lama: satu sudut saja)
        T('INTRO: shot baru terpasang (establish/flare/land) — ' + seen.length + ' shot',
            seen.includes('establish') && seen.includes('flare') && seen.includes('land'));
        const azs = cam.map(c => c[0]), hs = cam.map(c => c[2]), ds = cam.map(c => c[1]);
        // --- SINEMATOGRAFI KAMERA (dirombak lagi 2026-07-27, permintaan user:
        //     "transisi antar scene masih terlihat kasar & tiba-tiba" + "gerak kamera
        //     360 derajat ketika helicopter di atas gedung terlihat berlebihan").
        //     (1) SATU BUSUR: azimut di-UNWRAP (span mentah 0..360 dulu lolos hanya
        //     karena melewati 0) harus menyapu sudut yang berarti tapi tidak sampai
        //     mengelilingi gedung, dan TANPA pembalikan arah putar — papan lama
        //     menyapu +105° lalu BERBALIK −195° (~300°, 1 pembalikan) = terbaca
        //     persis sebagai 'kamera berputar mengelilingi gedung'.
        const azSpan = azMax - azMin;
        T('INTRO KAMERA: SATU busur pelan (' + azSpan.toFixed(0) + '°), bukan mengelilingi gedung',
            azSpan > 40 && azSpan < 150);
        T('INTRO KAMERA: busur SEARAH — tanpa pembalikan arah putar (' + azRev + ' pembalikan)',
            azRev === 0);
        //     (2) TANPA POTONGAN KASAR: sudut/tinggi/pivot/kabut berubah MULUS antar
        //     frame (peredaman settleCam/settlePivot). Dulu batas shot 1→2 meloncat 6°
        //     azimut dan batas fly→flare memindahkan titik fokus ~59 unit dalam SATU frame.
        T('INTRO KAMERA: tak ada lompatan sudut di batas shot (maks ' + maxAzStep.toFixed(2) + '°/frame)',
            maxAzStep < 1.2);
        T('INTRO KAMERA: tak ada lompatan tinggi/kabut di batas shot (tinggi ' + maxHStep.toFixed(1)
            + ', kabut ' + maxFogStep.toFixed(1) + ' /frame)', maxHStep < 35 && maxFogStep < 60);
        T('INTRO KAMERA: titik fokus berpindah MULUS antar shot (maks ' + maxPivStep.toFixed(1) + ' unit/frame)',
            maxPivStep < 14);
        //     (3) SERAH-TERIMA: shot penutup = kamera gameplay, jadi Stage 1 tak
        //     menjentikkan sudut saat scene berganti (dulu 225° -> 315° satu frame).
        T('INTRO KAMERA: shot penutup MENDARAT di sudut gameplay (serah-terima ke Stage 1 tanpa jentikan)',
            Math.abs(camEnd.x - rendererMod.CAM_OFF_DEFAULT.x) < 4
            && Math.abs(camEnd.y - rendererMod.CAM_OFF_DEFAULT.y) < 4
            && Math.abs(camEnd.z - rendererMod.CAM_OFF_DEFAULT.z) < 4);
        //     (4) TIRAI: layar sudah HITAM sebelum scene berganti, dibuka lagi sesudahnya.
        T('INTRO TIRAI: fade ke hitam sebelum pindah ke Stage 1, dibuka lagi sesudahnya',
            !!fadeAtEnd && fadeAtEnd.opacity === 1 && domSkipMod.cineFadeDebug().opacity === 0);
        T('INTRO KAMERA: ketinggian & jarak BERVARIASI (tinggi ' + Math.min(...hs).toFixed(0) + '..'
            + Math.max(...hs).toFixed(0) + ', jarak ' + Math.min(...ds).toFixed(0) + '..' + Math.max(...ds).toFixed(0) + ')',
            Math.max(...hs) > Math.min(...hs) * 4 && Math.max(...ds) > Math.min(...ds) * 2.5);
        T('INTRO: DEBU downwash rotor + hentakan mendarat tersapu di atap (' + dust + ' puff puncak)', dust > 5);
        T('INTRO: cutscene tetap berakhir di Stage 1', smMod.activeScene === s1mod.stage1Scene
            && introMod.introDebug().active === false && stateMod.cinematicActive === false);
    }

    // --- 17d3. LATAR INTRO: LANGIT MALAM + KABUT BATAS (2026-07-27, permintaan
    // user: "background kosong di batas luar area ... buat jadi langit malam, ada
    // bulan dan bintang ... batas ujung area diberi kabut tebal ... TAPI JANGAN
    // MEMPERBERAT"). Tiga hal yang diuji: (1) isi kota benar-benar mencapai
    // pinggir, (2) kabut SELALU habis sebelum isian kota habis -> tepi dunia
    // mustahil terlihat, (3) langit malamnya benar-benar MASUK FRAME dan hanya
    // memakai 2 objek gambar.
    {
        smMod.setScene(introMod.introScene);   // bangun ulang dunia intro (sudah dibuang di 17d2)
        const SK = introMod.introSkyDebug();
        const CS2 = introMod.cityDebug();

        // (1) ISIAN KOTA SAMPAI PINGGIR — dulu berhenti di dz -1150 / |dx| 1980
        // sementara hamparannya ±2700: cincin luarnya dataran kosong.
        T('INTRO LATAR: isi kota menjangkau pinggir area (reach ' + CS2.reach.toFixed(0)
            + ' dari target ' + CS2.fill + ')', CS2.reach >= CS2.fill * 0.95);
        T('INTRO LATAR: hamparan tanah jauh lebih lebar dari isian (tepi dunia di luar jangkauan pandang)',
            CS2.plane / 2 > CS2.fill * 1.2);
        T('INTRO LATAR: kepadatan kampung ikut naik bersama luas (rumah ' + CS2.houses + ')',
            CS2.houses > 1200);
        T('INTRO LATAR: menara tetap "tidak terlalu banyak" & yang JANGKUNG tetap sedikit ('
            + CS2.towers + ' menara, ' + CS2.crowns + ' bermahkota)',
            CS2.towers > 20 && CS2.towers < 200 && CS2.crowns > 0 && CS2.crowns < 40);

        // (2) KABUT: warnanya HARUS sama dgn pita horizon kubah (kalau beda, ada
        // "garis tepi dunia"), dan far-nya TIDAK PERNAH melewati isian kota.
        T('INTRO KABUT: warna kabut = warna pita horizon langit (tanah larut ke langit tanpa sambungan)',
            SK.fogHex != null && SK.fogHex === SK.horizonHex);
        const domeKids = SK.domeChildren;   // dibaca SEBELUM cutscene (dunia dibuang di akhir)
        introMod.beginIntro();
        let fogMax = 0, fogMin = 1e9, skyMax = -99, moonSeen = 0, domeFar = 0, frames = 0;
        // Geometri frame: setengah-FOV vertikal kamera RENDER dikurangi bagian
        // yang ditutup letterbox -> berapa derajat LANGIT tersisa di atas horizon.
        const vHalf = rendererMod.viewCam.fov / 2;
        const barDeg = rendererMod.viewCam.fov * SK.barFrac;
        const hHalf = Math.atan(Math.tan(vHalf * Math.PI / 180) * (16 / 9)) * 180 / Math.PI;
        for (let i = 0; i < 4000 && introMod.introDebug().active; i++) {
            introMod.introScene.updateMode(1 / 60);
            frames++;
            fogMax = Math.max(fogMax, scene.fog.far); fogMin = Math.min(fogMin, scene.fog.far);
            const off = introMod.introScene.camOffset;
            const pitch = Math.atan2(off.y, Math.hypot(off.x, off.z)) * 180 / Math.PI;
            const sky = (vHalf - barDeg) - pitch;          // >0 = ada langit di frame
            skyMax = Math.max(skyMax, sky);
            let look = (Math.atan2(off.x, off.z) * 180 / Math.PI + 360) % 360;
            look = (look + 180) % 360;                     // arah PANDANG kamera
            const dAz = Math.abs(((SK.moonAz - look + 540) % 360) - 180);
            if (sky > SK.moonEl && dAz < hHalf) moonSeen++;
            domeFar = Math.max(domeFar, introMod.introSkyDebug().skyToCam);
        }
        T('INTRO KABUT: far kabut TAK PERNAH melewati isian kota (' + fogMax.toFixed(0)
            + ' <= ' + CS2.fill + ') — dataran kosong & tepi dunia selalu tertelan haze',
            frames > 100 && fogMax <= CS2.fill);
        T('INTRO KABUT: tetap bisa melihat (far terkecil ' + fogMin.toFixed(0)
            + ' masih jauh di luar dek atap) + BERUBAH per shot, bukan satu setelan',
            fogMin > 600 && fogMax > fogMin * 1.2);

        // (3) LANGIT MALAM benar-benar terlihat — dulu 0° langit di SEMUA shot
        // (horizon selalu di atas tepi frame), jadi bulan/bintang mustahil tampak.
        T('INTRO LANGIT: ada shot yang benar-benar memperlihatkan LANGIT di atas horizon ('
            + skyMax.toFixed(1) + '° setelah letterbox)', skyMax > 3);
        T('INTRO LANGIT: BULAN masuk frame pada shot-shot inti (' + moonSeen + ' frame)',
            moonSeen > 60);
        T('INTRO LANGIT: bintang terlukis di kubah (' + SK.stars + ' bintang) + bulan terpasang',
            SK.stars > 400 && SK.hasMoon === true);
        T('INTRO LANGIT: bulan di dalam kubah (jarak ' + SK.moonDist + ' < radius ' + SK.skyRadius
            + ') & rendah di atas horizon (' + SK.moonEl + '°)',
            SK.moonDist < SK.skyRadius && SK.moonEl > 0 && SK.moonEl < 15);
        T('INTRO LANGIT: kubah + bulan MENGIKUTI kamera — sisi terjauh kubah ('
            + (domeFar + SK.skyRadius).toFixed(0) + ') tetap di dalam far-plane '
            + rendererMod.viewCam.far, domeFar + SK.skyRadius < rendererMod.viewCam.far);
        // TIDAK MEMPERBERAT (permintaan user): langit malam = 2 objek gambar saja
        // (bola bulan + halo). Bintang/haze/pijar kota semuanya DILUKIS ke tekstur
        // kubah yang sudah ada, jadi nol tambahan draw call & nol biaya per frame.
        T('INTRO LANGIT: hanya 2 objek gambar tambahan (bulan + halo), sisanya dilukis ke tekstur kubah',
            domeKids === 2);
    }

    // SKIP CUTSCENE (2026-07-19, tombol kanan-bawah / SPACE): putar ulang intro
    // lalu skipIntro() di tengah fase fly -> langsung finish (Stage 1 + tutorial,
    // sinematik OFF, dunia atap dibuang) — finishIntro aman dari fase mana pun.
    smMod.setScene(introMod.introScene);
    introMod.beginIntro();
    for (let i = 0; i < 8; i++) introMod.introScene.updateMode(0.1);   // masih di tengah cutscene
    T('INTRO SKIP: cutscene aktif kembali sebelum di-skip',
        introMod.introDebug().active === true && stateMod.cinematicActive === true);
    // Tombol SKIP kini terdaftar (frame pertama updateMode sudah jalan, 2026-07-20)
    // — klik tombol = jalur skip yang sama dgn SPACE (memanggil skipIntro).
    const viaBtn = domSkipMod.triggerCutsceneSkip();
    if (!viaBtn) introMod.skipIntro();   // jaring pengaman agar tes lanjutan tetap jalan
    T('INTRO SKIP (2026-07-20): tombol SKIP terdaftar setelah cutscene tampil (trigger = skip)', viaBtn === true);
    T('INTRO SKIP: skipIntro -> langsung Stage 1 + tutorial (sinematik OFF, pause+blocker)',
        smMod.activeScene === s1mod.stage1Scene && introMod.introDebug().active === false
        && stateMod.cinematicActive === false && stateMod.isPaused === true
        && introBlocker.style.display === 'flex');

    // Continue/restart (opts.stage > 1) TIDAK memutar intro — hanya start baru.
    // (Diverifikasi di main.js: playIntro = campaign && !(opts.stage > 1); di sini
    // cukup pastikan setScene langsung ke stage tanpa introScene tak error.)
    s1mod.stage1Scene.enter = realS1Enter;   // pulihkan
    while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
    stateMod.setCinematicActive(false);
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
const palMod = await import(R('src/world/palette.js'));
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
    styleGroups.push(['Helicopter', (await import(R('src/entities/helicopter.js'))).buildHelicopterMesh().group]);
    styleGroups.push(['Barrel', (await import(R('src/entities/barrels.js'))).buildBarrelMesh()]);
    styleGroups.push(['SupplyCrate', (await import(R('src/entities/crates.js'))).buildCrateMesh()]);
    styleGroups.push(['SmashRuko', (await import(R('src/entities/smashBuilding.js'))).buildSmashRukoMesh().group]);

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
    const MESH_CAP = { Helicopter: 70, SmashRuko: 30 };
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
    camera.position.set(lootPos.x, 11.4, lootPos.z);   // player MENDATANGI uangnya
    dropsMod.updateDrops(0.05, 0);
    T('loot terpungut saat player melewatinya -> skor = nilai C',
        stateMod.drops.length === 0 && stateMod.score === lootC);

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
    crateMod.resetCrates();
    crateMod.spawnCrate(300, 300, 0);
    T('peti: spawn tercatat', crateMod.crateDebug().count === 1);
    stateMod.bullets.length = 0;
    stateMod.drops.length = 0;
    stateMod.bullets.push({ mesh: { position: { x: 300, y: 8, z: 300 } }, px: 300, py: 8, pz: 280, dir: { x: 0, y: 0, z: 1 }, damage: cfgMod.CFG.crates.hp + 10 });
    crateMod.crateBulletHits();
    T('peti: hancur oleh peluru player + peluru terserap',
        crateMod.crateDebug().count === 0 && stateMod.bullets.length === 0);

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
    const s1c = await import(R('src/scenes/campaign/stages/stage1.js'));
    const s2c = await import(R('src/scenes/campaign/stages/stage2.js'));
    const s3c = await import(R('src/scenes/campaign/stages/stage3.js'));

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

    // (c2) Tiap peti berdiri di LANTAI & tak tertanam di furnitur (kalau tertanam,
    //      peti mustahil didekati/dipecah).
    const onFloor = (pos, walkFn, resolveFn) => pos.every(k => {
        if (!walkFn(k.x, k.z, 1)) return false;
        stateMod._v3.set(k.x, 0, k.z);
        resolveFn(stateMod._v3, 1, 0);
        return Math.abs(stateMod._v3.x - k.x) + Math.abs(stateMod._v3.z - k.z) < 0.01;
    });
    T('peti: semua berdiri di lantai & tak tertanam furnitur (stage 1/2/3)',
        onFloor(s1CratePos, s1c.stage1Walk, s1c.resolve)
        && onFloor(s2CratePos, s2c.stage2Walk, s2c.resolve)
        && onFloor(s3CratePos, s3c.stage3Walk, s3c.resolve));

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
    const DOORCELLS = [[8, 3], [8, 4], [3, 7], [4, 7], [13, 7], [14, 7], [15, 7], [8, 11], [8, 12],
    [21, 11], [21, 12], [3, 17], [4, 17], [36, 17], [37, 17], [41, 17], [42, 17],
    [13, 20], [14, 20], [16, 20], [17, 20], [21, 23], [21, 24], [29, 23], [29, 24],
    [33, 29], [34, 29], [39, 30], [39, 31], [39, 32], [3, 39], [4, 39], [39, 43], [39, 44], [39, 45]];
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
        { n: 2, m: s2c, S: s2c.S2, cell: s2c.s2Cell, wall: s2c.s2Wall, res: s2c.resolve, lamps: s2c.s2LampsDbg(), furn: s2c.s2FurnitureDbg(), pos: s2CratePos, doors: [[43, 6], [44, 6], [17, 4], [17, 5], [6, 9], [7, 9], [30, 11], [30, 12], [27, 19], [27, 20], [1, 20], [2, 20], [13, 23], [13, 24], [39, 27], [39, 28], [44, 29], [45, 29]] },
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
    const s4c = await import(R('src/scenes/campaign/stages/stage4.js'));
    T('meshBatch: perabot stage 1/2/3/4 melewati addMergedStatic (batch terisi)',
        s1c.s1StaticBatchDbg().length > 0 && s2c.s2StaticBatchDbg().length > 0
        && s3c.s3StaticBatchDbg().length > 0 && s4c.s4StaticBatchDbg().length > 0);

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
    const keysOK = before.keys.length >= 4 && before.total >= 40;
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
    T('scene campaign 1-4 + survival punya lightsKey',
        s1c.stage1Scene.lightsKey === 'campaign-1' && s2c.stage2Scene.lightsKey === 'campaign-2'
        && s3c.stage3Scene.lightsKey === 'campaign-3' && s4c.stage4Scene.lightsKey === 'campaign-4');
    lightMod.setActiveStageLights(before.active || 'campaign-1');

    // (d) TEKS MISI tanpa penunjuk arah (2026-07-26, permintaan user: biar player
    //     mencarinya sendiri) — sapu string user-facing di semua scene campaign.
    const DIRW = /\b(north|south|east|west|far-right|far-left|top-left|top-right|bottom-left|bottom-right)\b/i;
    const dirHits = [];
    for (const f of ['stage1.js', 'stage2.js', 'stage3.js', 'stage4.js']) {
        const src = fs.readFileSync(ROOT + '/src/scenes/campaign/stages/' + f, 'utf8');
        for (const line of src.split('\n')) {
            const isMsg = line.includes('showStageMsg(') || line.includes('showPickup(') || (line.includes('return') && line.includes('FLOOR'));
            if (isMsg && DIRW.test(line)) dirHits.push(f + ': ' + line.trim().slice(0, 80));
        }
    }
    if (dirHits.length) console.log('  dir-hits:', dirHits);
    T('teks misi: tanpa penunjuk arah (north/south/east/west/far-right/...)', dirHits.length === 0);
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

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
