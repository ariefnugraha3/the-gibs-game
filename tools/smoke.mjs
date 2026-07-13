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
global.localStorage = { getItem: () => null, setItem() { } };
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
        this.matrixWorld = {}; this.isObject3D = true;
    }
    add(...os) { for (const o of os) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
    traverse(fn) { fn(this); this.children.forEach(c => c.traverse(fn)); }
    lookAt() { } updateMatrixWorld() { } rotateX(a) { this.rotation.x += a; }
    getWorldPosition(v) { let p = this, x = 0, y = 0, z = 0; while (p) { x += p.position.x; y += p.position.y; z += p.position.z; p = p.parent; } return v.set(x, y, z); }
    getWorldDirection(v) { return v.set(0, 0, -1); }
}
class Mesh extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
class Sprite extends Obj3D { constructor(m) { super(); this.material = m; this.isSprite = true; } }
class Group extends Obj3D { }
class Scene extends Obj3D { constructor() { super(); this.fog = null; } }
class PCam extends Obj3D { constructor() { super(); this.aspect = 1; } updateProjectionMatrix() { } }
class PLight extends Obj3D { constructor() { super(); this.intensity = 0; this.color = new Color(0xffffff); } }
const geo = (name) => class { constructor(...a) { this.args = a; this.type = name; } scale() { return this; } };
class Mat {
    constructor(o = {}) {
        this.color = o.color instanceof Color ? o.color : new Color(o.color || 0xffffff);
        this.emissive = o.emissive instanceof Color ? o.emissive : new Color(o.emissive || 0);
        this.opacity = o.opacity != null ? o.opacity : 1;
        this.transparent = !!o.transparent; this.map = o.map || null;
    }
    dispose() { }
}
global.THREE = {
    Vector2: class { constructor(x, y) { this.x = x; this.y = y; } set() { } },
    Vector3: V3, Quaternion: Quat, Euler, Color, Matrix4,
    Object3D: Obj3D, Group, Mesh, Sprite, Scene, PerspectiveCamera: PCam, PointLight: PLight,
    InstancedMesh: class extends Obj3D { constructor(g, m, n) { super(); this.geometry = g; this.material = m; this.count = n; this.instanceColor = { needsUpdate: false }; } setMatrixAt() { } setColorAt() { } },
    SphereGeometry: geo('sph'), CylinderGeometry: geo('cyl'), BoxGeometry: geo('box'),
    ConeGeometry: geo('cone'), RingGeometry: geo('ring'), PlaneGeometry: geo('plane'),
    CircleGeometry: geo('circle'), TorusGeometry: geo('torus'),
    MeshLambertMaterial: Mat, MeshBasicMaterial: Mat, MeshPhongMaterial: Mat, SpriteMaterial: Mat,
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

// --- 5d. Burst warna merah (darah player) tak melempar ---
effectsMod.spawnBloodBurst(0, 5, 0, 1, 0, 5, 1, 1.6, 0xb51a1a);
T('spawnBloodBurst param warna OK', true);

// --- 5e. MELEE_TIME diekspor (dipakai animasi pedang avatar) ---
const wMod = await import(R('src/entities/weapons.js'));
T('MELEE_TIME diekspor (0.45)', wMod.MELEE_TIME === 0.45);

// --- 5h. Sabetan pedang = SAPUAN BUSUR (2026-07-13): SEMUA robot di kerucut
//     depan kena damage CFG.melee.damage; di belakang/di luar jangkauan selamat;
//     HP raksasa (boss) hanya tergerus. (Kamera stub menghadap -z.) ---
const zM1 = mkBot('C', 0, -10); robots.push(zM1);
const zM2 = mkBot('B', 4, -11); robots.push(zM2);
const zM3 = mkBot('C', 0, 12); robots.push(zM3);              // di belakang punggung
const zTank = mkBot('A', -3, -12); zTank.hp = 99999; robots.push(zTank);
camera.position.set(0, 11.4, 0);
const nR0 = robots.length;
wMod.doMeleeHit();
T('sapuan membunuh SEMUA di kerucut depan', !robots.includes(zM1) && !robots.includes(zM2));
T('robot di belakang selamat dari sapuan', robots.includes(zM3));
T('HP raksasa selamat tergerus melee.damage',
    robots.includes(zTank) && zTank.hp === 99999 - Math.max(1, cfgMod.CFG.melee.damage - (zTank.armor || 0)));
T('jumlah splice sapuan benar (2 mati)', robots.length === nR0 - 2);
for (let i = 0; i < 40; i++) goreMod.updateGore(0.1);          // dua bangkai terbelah dituntaskan
robots.splice(robots.indexOf(zM3), 1); scene.remove(zM3.mesh); // bersih-bersih utk section berikut
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

// --- 7. Kecepatan direksional relatif kursor (stub aim selalu (0,0,-1) = "utara") ---
camera.position.set(800, 11.4, 800);   // jauh dari robot uji (hindari body-push)
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
T('beli Vitality II: maxHp naik + heal kenaikan', shopMod.shopPurchase('hpup') === null
    && player.maxHp === hpT[0] && player.hp === 40 + (hpT[0] - cfgMod.CFG.player.maxHp));
T('beli Ammo Capacity II: kap rifle ikut naik', shopMod.shopPurchase('ammoup') === null
    && stateMod.maxAmmoFor('rifle') === cfgMod.CFG.weapons.ammoUpgrades[0].rifle);
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
// Tangga END SELALU aktif: menginjak trigger -> transisi ke stage 3 (spy enter
// stage3 supaya tak membangun dunianya di harness pada langkah ini).
const s3mod = await import(R('src/scenes/campaign/stage3.js'));
const realS3Enter = s3mod.stage3Scene.enter;
let s3entered = false;
s3mod.stage3Scene.enter = () => { s3entered = true; };
const e2 = s2mod.s2Cell(s2mod.S2_END.c, s2mod.S2_END.r);
stateMod._v3.set(e2.x, 0, e2.z);
s2mod.stage2Scene.playerCollide(stateMod._v3, e2.x, e2.z, 0);
T('S2: mencapai tangga END -> transisi ke stage 3', s3entered && smMod.activeScene === s3mod.stage3Scene);
s3mod.stage3Scene.enter = realS3Enter;   // pulihkan enter asli

// --- 16. Campaign STAGE 3 overhaul (2026-07-13): gedung indoor final dgn
// ATRIUM/VOID pusat mengikuti denah. Bangun dunia + BFS konektivitas (VOID =
// dinding), penempatan robot 10-spot + supply, robotAI, dan MENANG via tangga. ---
s3mod.buildWorld();
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

// Menang: capai tangga END -> MISSION COMPLETE (gameOver(true))
stateMod.setGameOver(false);
const e3 = s3mod.s3Cell(s3mod.S3_END.c, s3mod.S3_END.r);
stateMod._v3.set(e3.x, 0, e3.z);
s3mod.stage3Scene.playerCollide(stateMod._v3, e3.x, e3.z, 0);
T('S3: capai tangga END -> MISSION COMPLETE (gameOver win)', stateMod.isGameOver === true);
stateMod.setGameOver(false);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
