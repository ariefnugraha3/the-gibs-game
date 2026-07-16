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
    constructor() { this.volume = 1; this.currentTime = 0; }
    load() { } play() { return { catch() { } }; } pause() { }
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
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    setFromMatrixColumn() { return this.set(1, 0, 0); }
    unproject() { return this; }
    applyQuaternion() { return this; }
    crossVectors() { return this; }
}
class Quat { set() { return this; } copy() { return this; } setFromAxisAngle() { return this; } setFromEuler() { return this; } premultiply() { return this; } setFromUnitVectors() { return this; } }
class Matrix4 { setPosition() { return this; } compose() { return this; } }
class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; } copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; } }
class Color {
    constructor(h = 0) { this._h = typeof h === 'object' ? h._h : h; }
    offsetHSL() { return this; } setHex(h) { this._h = h; return this; } getHex() { return this._h; } set() { return this; }
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
class PCam extends Obj3D { constructor() { super(); this.aspect = 1; } updateProjectionMatrix() { } }
class PLight extends Obj3D { constructor() { super(); this.intensity = 0; this.color = new Color(0xffffff); } }
const geo = (name) => class {
    constructor(...a) { this.args = a; this.type = name; }
    scale() { return this; }
    rotateX() { return this; } rotateY() { return this; } rotateZ() { return this; }
    translate() { return this; } center() { return this; } clone() { return this; }
};
class Mat {
    constructor(o = {}) {
        this.color = o.color instanceof Color ? o.color : new Color(o.color || 0xffffff);
        this.emissive = o.emissive instanceof Color ? o.emissive : new Color(o.emissive || 0);
        this.opacity = o.opacity != null ? o.opacity : 1;
        this.transparent = !!o.transparent; this.map = o.map || null;
    }
    clone() { return new Mat({ color: new Color(this.color), emissive: new Color(this.emissive), opacity: this.opacity, transparent: this.transparent, map: this.map }); }
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
    LineSegments: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
    Shape: class { moveTo() { } lineTo() { } quadraticCurveTo() { } bezierCurveTo() { } },
    MeshLambertMaterial: Mat, MeshBasicMaterial: Mat, MeshPhongMaterial: Mat, SpriteMaterial: Mat,
    MeshStandardMaterial: Mat, MeshPhysicalMaterial: Mat, LineBasicMaterial: Mat,
    CanvasTexture: class { constructor() { this.repeat = { set() { } }; } },
    Fog: class { }, WebGLRenderer: class {
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
T('fireCd terisi', zB.fireCd > 0.9);
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

// --- 6c. Batas jarak peluru = titik kursor (2026-07-16): peluru distempel
//     maxDist (jarak pivot->aimPoint saat menembak), mati TEPAT di batas
//     (frame TUNDA satu — segmen terakhir tetap dapat giliran sweep robot),
//     lalu efek tembakan di lantai (2 ground puff, menumpang pool explosions)
//     tepat di titik kursor. (Jarak kursor uji bebas — bukan angka tuning.) ---
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
T('pelet pertama membawa titik kursor (fxX/fxZ)', bCur && bCur.fxX === 0 && bCur.fxZ === -AIMD);
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
// --- Tab shop (2026-07-15): item terkelompok ke Weapons/Armor/Upgrades/General ---
const tabDbg = shopMod.shopTabDebug();
T('tab shop: 4 tab terlihat, default = weapon', tabDbg.active === 'weapon'
    && tabDbg.tabs.join(',') === 'weapon,armor,upgrade,general');
T('tab weapon berisi upgrade senjata (up_pistol)', tabDbg.items.weapon.includes('up_pistol'));
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
T('beli upgrade pistol (Lv1->2)', shopMod.shopPurchase('up_pistol') === null && player.weaponLvl.pistol === 2);
T('upgrade shotgun TERSEMBUNYI sebelum punya shotgun', shopMod.shopPurchase('up_shotgun') === 'Unknown item');
// (beli senjata via shopPurchase butuh initWeapons [mesh FPS] — di harness cukup
// grant kepemilikan langsung; yang diuji = GATING katalog dari player.owned)
player.weapons.push('shotgun'); stateMod.syncOwnedFromWeapons();
T('upgrade shotgun muncul & terbeli (Lv2)', shopMod.shopPurchase('up_shotgun') === null && player.weaponLvl.shotgun === 2);
T('beli upgrade pistol lagi (Lv2->3)', shopMod.shopPurchase('up_pistol') === null && player.weaponLvl.pistol === 3);
const rejMax = shopMod.shopPurchase('up_pistol');
T('Lv3 = maks, pembelian ditolak (' + rejMax + ')', typeof rejMax === 'string' && player.weaponLvl.pistol === 3);
const s0 = stateMod.score;
shopMod.shopPurchase('up_pistol');
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
drive(0, -3, 60);        // maju SEARAH bidikan
T('maju: kaki & torso lurus ke kursor',
    ad(avMod.avatarGroup.rotation.y, AIM_N) < 0.12 && Math.abs(avMod.avatarGroup.children[0].rotation.y) < 0.12);
drive(3, 0, 60);         // strafe kanan (90° dari bidikan)
const rootY = avMod.avatarGroup.rotation.y, twistY = avMod.avatarGroup.children[0].rotation.y;
T('strafe: kaki menghadap arah gerak (dijepit) + puntiran torso menutup sisanya (root '
    + rootY.toFixed(2) + ' twist ' + twistY.toFixed(2) + ')',
    ad(rootY, AIM_N) > 0.35 && Math.abs(twistY) > 0.35 && ad(rootY + twistY, AIM_N) < 0.2);
drive(0, 3, 60);         // mundur MEMBELAKANGI bidikan (backpedal)
T('backpedal: kaki TIDAK berbalik membelakangi kursor',
    ad(avMod.avatarGroup.rotation.y, AIM_N) < 0.3);

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
stateMod.setPaused(false);
player.hp = 1;   // satu peluru (attack B per config) pasti mematikan
camera.position.set(300, 11.4, 300);
const zK = mkBot('B', 300, 330);
robotsMod.fireRobotBullet(zK);
for (let i = 0; i < 2000 && enemyBullets.length; i++) robotsMod.updateEnemyBullets(0.016, 1);
T('HP habis -> sekuens kematian (BUKAN game over instan)',
    gameMod.isPlayerDying() && stateMod.isGameOver === false && player.hp <= 0);
for (let i = 0; i < 20; i++) avMod.updatePlayerAvatar(0.05);   // animasi roboh berjalan tanpa error
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
// overlay armor avatar: toggle visibilitas per level tanpa error
avMod.updatePlayerAvatar(0.05);
T('overlay armor avatar jalan (lvl ' + player.armorLvl + ')', true);

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
const s2mod = await import(R('src/scenes/campaign/stage2.js'));
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
    T('S2: SEMUA lantai gedung terhubung dari START (BFS, ' + floor + ' sel)', reach === floor && floor > 400);
}
T('S2: START & END berada di LANTAI (bukan dinding)',
    !s2mod.s2Wall(s2mod.S2_START.c, s2mod.S2_START.r) && !s2mod.s2Wall(s2mod.S2_END.c, s2mod.S2_END.r));
T('S2: nav-grid pathfinder terbangun', s2mod.s2Nav != null);

// Bersihkan robot dari section sebelumnya, masuk scene, tempatkan robot+supply
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
const s2dropsBefore = stateMod.drops.length;
smMod.setScene(s2mod.stage2Scene);   // enter() dipanggil di dalam setScene
s2mod.placeRobots();
const nStage2 = robots.filter(z => z.stage === 2).length;
T('S2: placeRobots menaruh 35 robot (9 spot) tagged stage 2 (' + nStage2 + ')', nStage2 === 35);
T('S2: placeSupplies menaruh drops (ammo/medkit)', stateMod.drops.length > s2dropsBefore);

// robotAI (idle->kejar via nav-grid) jalan tanpa error
const zS2 = robots.find(z => z.stage === 2);
camera.position.set(zS2.mesh.position.x + 30, cfgMod.CFG.player.eyeHeight, zS2.mesh.position.z);
let s2aiOk = true;
try { for (let i = 0; i < 5; i++) s2mod.stage2Scene.robotAI(zS2, 0.05, 3); } catch (e) { s2aiOk = false; }
T('S2: robotAI jalan tanpa error', s2aiOk);

// TANPA boss (dibuang atas permintaan user): tak ada boss/updateMode di scene
T('S2: tak ada boss & tak ada updateMode (boss dibuang)',
    !robots.some(z => z.kind === 'boss') && s2mod.stage2Scene.updateMode === undefined
    && !/BOSS/.test(s2mod.stage2Scene.hudStatus()));
// Tangga END (overhaul 2026-07-14): trigger -> pindah ke SHOP SCENE terpisah
// (`campaign-shop`) via LOADING; setelah loading shop terbuka; "Start Next Stage"
// (SPACE x2) -> LOADING -> transisi ke stage 3. Spy enter stage3 agar tak
// membangun dunianya di harness. Poll (bukan await tetap) supaya tahan MIN_LOADING.
const s3mod = await import(R('src/scenes/campaign/stage3.js'));
const realS3Enter = s3mod.stage3Scene.enter;
let s3entered = false;
s3mod.stage3Scene.enter = () => { s3entered = true; };
const e2 = s2mod.s2Cell(s2mod.S2_END.c, s2mod.S2_END.r);
stateMod._v3.set(e2.x, 0, e2.z);
s2mod.stage2Scene.playerCollide(stateMod._v3, e2.x, e2.z, 0);   // -> setScene(campaignShopScene)
T('S2: tangga END -> pindah ke SHOP SCENE terpisah (bukan transisi langsung)',
    smMod.activeScene.id === 'campaign-shop' && !s3entered);
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));   // LOADING #1
stateMod.setScore(0);   // cek KETERSEDIAAN item tanpa beli (skor 0 -> 'Not enough score' vs 'Unknown item')
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

// --- 16. Campaign STAGE 3 overhaul (2026-07-13): gedung indoor final dgn
// ATRIUM/VOID pusat mengikuti denah. Bangun dunia + BFS konektivitas (VOID =
// dinding), penempatan robot 10-spot + supply, robotAI, dan MENANG via tangga. ---
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
const VC = s3mod.S3.VOID;
T('S3: START & END di lantai; VOID pusat = dinding (tak dilalui)',
    !s3mod.s3Wall(s3mod.S3_START.c, s3mod.S3_START.r) && !s3mod.s3Wall(s3mod.S3_END.c, s3mod.S3_END.r)
    && s3mod.s3Wall((VC.c0 + VC.c1) >> 1, (VC.r0 + VC.r1) >> 1));
T('S3: nav-grid pathfinder terbangun', s3mod.s3Nav != null);

while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
const s3dropsBefore = stateMod.drops.length;
s3mod.placeRobots();
const nStage3 = robots.filter(z => z.stage === 3).length;
T('S3: placeRobots menaruh 39 robot (10 spot) tagged stage 3 (' + nStage3 + ')', nStage3 === 39);
T('S3: placeSupplies menaruh drops (ammo/medkit)', stateMod.drops.length > s3dropsBefore);

const zS3 = robots.find(z => z.stage === 3);
camera.position.set(zS3.mesh.position.x + 30, cfgMod.CFG.player.eyeHeight, zS3.mesh.position.z);
let s3aiOk = true;
try { for (let i = 0; i < 5; i++) s3mod.stage3Scene.robotAI(zS3, 0.05, 3); } catch (e) { s3aiOk = false; }
T('S3: robotAI jalan tanpa error', s3aiOk);

// Stage 3 tangga END -> SHOP SCENE (loading) -> Start Next Stage (loading) -> stage 4
const s4mod = await import(R('src/scenes/campaign/stage4.js'));
const realS4Enter = s4mod.stage4Scene.enter;
let s4entered = false;
s4mod.stage4Scene.enter = () => { s4entered = true; };
const e3 = s3mod.s3Cell(s3mod.S3_END.c, s3mod.S3_END.r);
stateMod._v3.set(e3.x, 0, e3.z);
s3mod.stage3Scene.playerCollide(stateMod._v3, e3.x, e3.z, 0);   // -> setScene(campaignShopScene)
T('S3: tangga END -> pindah ke SHOP SCENE terpisah', smMod.activeScene.id === 'campaign-shop' && !s4entered);
for (let i = 0; i < 400 && !shopMod.isShopOpen(); i++) await new Promise(r => setTimeout(r, 10));   // LOADING #1
T('S3 SHOP SCENE: shop terbuka', shopMod.isShopOpen());
smMod.activeScene.shopKey(' '); smMod.activeScene.shopKey(' ');   // Start Next Stage -> konfirmasi
for (let i = 0; i < 400 && !s4entered; i++) await new Promise(r => setTimeout(r, 10));   // LOADING #2 -> setScene
T('S3: Start Next Stage -> transisi ke stage 4', s4entered && smMod.activeScene === s4mod.stage4Scene);
s4mod.stage4Scene.enter = realS4Enter;
shopMod.closeShop();
stateMod.setPaused(false);   // pulihkan (runEnterShop mem-pause; harness tak ada klik resume)
shopMod.closeShop();

// --- 17. Campaign STAGE 4 (final, OUTDOOR, 2026-07-13): parkiran -> jalan raya
// 500 m -> stasiun kereta, dgn BOSS di ujung timur. Bangun dunia (union
// walkable), konektivitas flood-fill START->END, robot 13-spot + supply,
// robotAI, dan ALUR: bunuh semua -> boss muncul -> bunuh boss -> finish. ---
s4mod.ensureWorld();   // (2026-07-16: build lewat guard — enter berikutnya tak membangun ulang)
// PRE-BUILD konsistensi loading (2026-07-16): ensureWorld idempoten — panggilan
// kedua TIDAK membangun ulang dunia (jumlah anak scene tetap), guard `built` set.
{
    const nBefore = scene.children.length;
    s4mod.ensureWorld();
    T('S4: ensureWorld idempoten (panggilan ke-2 tak membangun ulang dunia)',
        scene.children.length === nBefore && s4mod.worldBuilt() && s3mod.worldBuilt());
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
    T('S4: START & END walkable + TERHUBUNG (union parkiran->jalan->stasiun)',
        s4mod.stage4Walk(S.x, S.z, 4) && s4mod.stage4Walk(E.x, E.z, 4) && seen[er][ec]);
}
T('S4: nav-grid pathfinder terbangun', s4mod.stage4Scene.robotAI != null);

while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
const s4dropsBefore = stateMod.drops.length;
s4mod.placeRobots();
const nStage4 = robots.filter(z => z.stage === 4).length;
T('S4: placeRobots menaruh 44 robot (13 spot) tagged stage 4 (' + nStage4 + ')', nStage4 === 44);
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

// ALUR MENANG: BOSS TANK (entities/tank.js, 2026-07-14) TIDAK muncul selagi
// masih ada robot. Tank = entitas MANDIRI (bukan anggota `robots`).
s4mod.stage4Scene.updateMode(0.1);
T('S4: tank boss BELUM muncul selagi masih ada robot', s4mod.currentTank() == null);
// bunuh SEMUA robot normal -> updateMode -> TANK muncul (menabrak dinding timur)
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
s4mod.stage4Scene.updateMode(0.1);
const s4tank = s4mod.currentTank();
T('S4: setelah semua robot mati -> TANK boss muncul (bukan anggota robots)',
    s4tank != null && !robots.includes(s4tank) && /TANK/.test(s4mod.stage4Scene.hudStatus()));
T('S4: HP tank = CFG.campaign.bosses.tank.hp',
    s4tank.hp === cfgMod.CFG.campaign.bosses.tank.hp && s4tank.maxHp === cfgMod.CFG.campaign.bosses.tank.hp);
// jalankan siklus tank (spawn menabrak dinding -> 3 serangan bergantian) ~12 dtk
camera.position.set(s4mod.S4_START.x, cfgMod.CFG.player.eyeHeight, s4mod.S4_START.z);
let s4tankOk = true;
try { for (let i = 0; i < 120; i++) s4mod.stage4Scene.updateMode(0.1); } catch (e) { s4tankOk = false; console.log(e); }
T('S4: siklus tank (spawn+3 serangan) jalan tanpa error', s4tankOk && !s4tank.dead);
// Netralkan state serangan (cd beku) supaya blok-blok uji berikut deterministik
const s4calm = () => {
    s4tank.mgLeft = 0; s4tank.mortarLeft = 0; s4tank.blastPending = false; s4tank.cd = 99;
    while (s4tank.mortars.length) { scene.remove(s4tank.mortars[0].mesh); s4tank.mortars.splice(0, 1); }
    while (s4tank.shells.length) { scene.remove(s4tank.shells[0].mesh); s4tank.shells.splice(0, 1); }
};
s4calm();
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
// jarak·apexRatio)), lalu MENDARAT di posisi player SAAT tembakan itu.
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
while (enemyBullets.length) { scene.remove(enemyBullets[0].mesh); enemyBullets.splice(0, 1); }   // bersihkan peluru MG
// finish TERKUNCI selagi tank hidup
stateMod.setGameOver(false);
stateMod._v3.set(s4mod.S4_END.x, 0, s4mod.S4_END.z);
s4mod.stage4Scene.playerCollide(stateMod._v3, s4mod.S4_END.x, s4mod.S4_END.z, 0);
T('S4: finish TERKUNCI selagi tank hidup (belum MISSION COMPLETE)', stateMod.isGameOver === false);
// hancurkan tank (HP habis) -> updateMode -> pintu stasiun aktif -> MISSION COMPLETE
s4tank.hp = 0;
s4mod.stage4Scene.updateMode(0.1);
T('S4: tank HANCUR saat HP habis', s4tank.dead === true);
stateMod._v3.set(s4mod.S4_END.x, 0, s4mod.S4_END.z);
s4mod.stage4Scene.playerCollide(stateMod._v3, s4mod.S4_END.x, s4mod.S4_END.z, 0);
T('S4: hancurkan tank -> masuk stasiun -> MISSION COMPLETE (gameOver win)', stateMod.isGameOver === true);
stateMod.setGameOver(false);

// --- 17b. CHEAT skip-to-stage-N (2026-07-14): lompat LANGSUNG ke stage campaign
// (tanpa shop). Hook `cheatSkipToStage` di tiap stage → `campaignJumpToStage`
// (transition.js): bersihkan robot + setScene(target) + tempatkan robot. ---
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
let jr = smMod.activeScene.cheatSkipToStage(3);   // dari stage 4 aktif -> STAGE 3
T('cheat skip-to-stage-3: pindah ke stage 3 + robot 3-tag', jr === 3
    && smMod.activeScene === s3mod.stage3Scene && robots.length > 0 && robots.every(z => z.stage === 3));
jr = smMod.activeScene.cheatSkipToStage(2);        // -> STAGE 2 (robot ditempatkan ulang oleh helper)
T('cheat skip-to-stage-2: pindah ke stage 2 + 35 robot ditempatkan', jr === 2
    && smMod.activeScene === s2mod.stage2Scene && robots.filter(z => z.stage === 2).length === 35);
const s4before = smMod.activeScene;
T('cheat skip-to-stage invalid (9) ditolak, scene tak berubah',
    smMod.activeScene.cheatSkipToStage(9) === null && smMod.activeScene === s4before);
T('survival TAK punya hook cheatSkipToStage (campaign-only)',
    survMod.survivalScene.cheatSkipToStage === undefined);
// Anti-stutter: lompat-langsung WAJIB mengompilasi shader dunia baru (mis. stage 4
// FuturisticSUV MeshStandard/Physical yg tak di-warm preload) via renderer.compile.
const _rc = rendererMod.renderer.compile;
let rcCount = 0;
rendererMod.renderer.compile = function () { rcCount++; return _rc.apply(this, arguments); };
smMod.activeScene.cheatSkipToStage(4);
T('cheat jump memanggil renderer.compile (warm shader stage baru)', rcCount > 0);
rendererMod.renderer.compile = _rc;
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }

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
T('restart-stage: mendarat di AWAL stage 3 + robot stage 3',
    smMod.activeScene === s3mod.stage3Scene && robots.length > 0 && robots.every(z => z.stage === 3));
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
// MISSION COMPLETE (gameOver win) menghapus checkpoint (campaign tamat = New Game)
saveMod.saveCampaignStage(4);
gameMod.gameOver(true);
T('save: MISSION COMPLETE (gameOver win) menghapus checkpoint', saveMod.loadCampaignStage() === 0);
stateMod.setGameOver(false);
while (robots.length) { scene.remove(robots[0].mesh); robots.splice(0, 1); }
saveMod.clearCampaignSave();   // bersihkan utk test berikutnya

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

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
