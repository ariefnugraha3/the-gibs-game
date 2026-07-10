// Avatar pemain remote co-op LAN (maks CFG.net.maxPlayers-1 slot, dibuat SEKALI
// saat MP mulai lalu dipakai ulang — tanpa buat/hapus geometry saat gameplay).
// Manusia balok bergaya rig zombie TAPI relawan bersenjata: kulit normal, rompi
// tim, nametag sprite kanvas, senjata balok kecil per-jenis, dan muzzle flash
// SPRITE (TANPA PointLight — aturan pool lampu). Interpolasi posisi: buffer
// sampel per pemain, dirender pada (now - CFG.net.interpDelayMs) supaya mulus
// di snapshot 15 Hz / pesan p 20 Hz. Dipakai host (dari pesan p) DAN client
// (dari snapshot) lewat pushRemoteSample(roster entry).

import { CFG } from '../core/config.js';
import { scene, camera } from '../core/renderer.js';
import { roster } from '../net/index.js';
import { playSFX, sfxShoot, sfxPistol, sfxShotgun } from '../utils/sfx.js';

const avatars = [];
let built = false;

// Ukuran balok senjata per jenis (visual saja): [lebar, tinggi, panjang]
const GUN_DIMS = { rifle: [0.9, 1.1, 7.2], pistol: [0.6, 1.0, 2.8], shotgun: [0.8, 1.0, 6.4] };

function makeNametag() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false
    }));
    spr.scale.set(22, 5.5, 1);
    spr.position.y = 17.5;
    return { spr, cv, tex, last: '' };
}

function drawNametag(tag, name, hp) {
    const key = name + '|' + Math.round(hp / 10);
    if (tag.last === key) return;
    tag.last = key;
    const g = tag.cv.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 30px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.strokeText(name, 128, 24);
    g.fillStyle = hp > 60 ? '#9be8a8' : hp > 30 ? '#f1c40f' : '#ff6b5e';
    g.fillText(name, 128, 24);
    // bar HP tipis di bawah nama
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(58, 44, 140, 9);
    g.fillStyle = hp > 60 ? '#3ddc6a' : hp > 30 ? '#e0a53e' : '#e74c3c';
    g.fillRect(60, 46, 136 * Math.max(0, Math.min(1, hp / 100)), 5);
    tag.tex.needsUpdate = true;
}

// Satu avatar: pola rig buildHumanZombie (pivot pinggul/lutut/bahu) dgn
// material per-instance sendiri (persist seumur sesi — tidak pernah di-dispose).
function buildAvatar(idx) {
    const TEAM = [0x2f6fb8, 0x2fa06a, 0xb8802f];   // rompi biru/hijau/oranye per slot
    const skin = new THREE.MeshLambertMaterial({ color: 0xc9a284 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a4d3c });
    const vest = new THREE.MeshLambertMaterial({ color: TEAM[idx % TEAM.length] });
    const pants = new THREE.MeshLambertMaterial({ color: 0x33383f });
    const shoes = new THREE.MeshLambertMaterial({ color: 0x22201c });
    const gunM = new THREE.MeshLambertMaterial({ color: 0x1a1c20 });

    const group = new THREE.Group();   // yaw
    const inner = new THREE.Group();   // bob + turun saat jongkok
    group.add(inner);
    const mk = (w, h, d, m, x, y, z, parent, shadow = true) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x, y, z);
        b.castShadow = shadow;
        parent.add(b);
        return b;
    };

    mk(3.4, 4.6, 2.0, shirt, 0, 7.9, 0, inner);
    mk(3.9, 3.0, 2.3, vest, 0, 8.2, 0, inner, false);          // rompi tim
    const headG = new THREE.Group();
    headG.position.set(0, 10.3, 0);
    inner.add(headG);
    mk(1.8, 2.4, 1.8, skin, 0, 1.2, 0, headG);
    // Kaki: pivot pinggul -> paha; pivot lutut -> betis + sepatu
    const mkLeg = (sx) => {
        const hip = new THREE.Group(); hip.position.set(sx, 5.7, 0); inner.add(hip);
        mk(1.5, 3.0, 1.6, pants, 0, -1.5, 0, hip);
        const knee = new THREE.Group(); knee.position.set(0, -3.0, 0); hip.add(knee);
        mk(1.3, 2.6, 1.4, pants, 0, -1.3, 0, knee);
        mk(1.4, 0.7, 2.3, shoes, 0, -2.45, 0.45, knee, false);
        return { hip, knee };
    };
    const legL = mkLeg(-1.0), legR = mkLeg(1.0);
    // Lengan (pivot bahu) + PIVOT BIDIK: kedua lengan & senjata di bawah satu
    // grup yang di-pitch mengikuti arah pandang pemain remote.
    const aim = new THREE.Group();
    aim.position.set(0, 9.7, 0);
    inner.add(aim);
    const mkArm = (sx) => {
        const sh = new THREE.Group(); sh.position.set(sx, 0, 0); aim.add(sh);
        mk(1.1, 4.0, 1.2, shirt, 0, -1.9, 0, sh);
        mk(1.0, 1.0, 1.0, skin, 0, -4.2, 0, sh, false);
        return sh;
    };
    const armL = mkArm(-2.3), armR = mkArm(2.3);
    // Senjata balok di antara kedua tangan (diskala per jenis di update)
    const gun = mk(0.9, 1.1, 7.2, gunM, 0, -3.6, -2.6, aim, false);
    // Muzzle flash sprite kecil (TANPA lampu) di ujung senjata
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xffc266, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
    }));
    flash.scale.set(4, 4, 1);
    flash.position.set(0, -3.4, -6.6);
    aim.add(flash);

    const tag = makeNametag();
    group.add(tag.spr);
    group.visible = false;
    scene.add(group);
    return {
        group, inner, headG, legL, legR, armL, armR, aim, gun, flash, tag,
        phase: Math.random() * 6.28, fireCd: 0, lastX: 0, lastZ: 0, yaw: 0, wpn: '',
    };
}

export function initRemoteAvatars() {
    if (built) return;
    built = true;
    const n = Math.max(1, ((CFG.net && CFG.net.maxPlayers) || 4) - 1);
    for (let i = 0; i < n; i++) avatars.push(buildAvatar(i));
}

// Tambah sampel posisi utk interpolasi (dipanggil host saat pesan `p` masuk /
// client saat snapshot masuk). p = entry roster.
export function pushRemoteSample(p) {
    if (!p.buf) p.buf = [];
    p.buf.push({ t: performance.now(), x: p.x, y: p.y, z: p.z, yw: p.yaw || 0, pt: p.pitch || 0 });
    if (p.buf.length > 24) p.buf.splice(0, p.buf.length - 24);
}

// Interpolasi sudut terpendek (yaw bisa melompat -PI..PI)
function lerpAngle(a, b, u) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * u;
}

// --- Update per frame: interpolasi + pose + nametag + muzzle flash + SFX ---
export function updateRemotePlayers(dt) {
    if (!built) return;
    const delay = (CFG.net && CFG.net.interpDelayMs) || 120;
    const rt = performance.now() - delay;
    for (let i = 0; i < avatars.length; i++) {
        const av = avatars[i];
        const p = roster[i];
        if (!p || !p.buf || p.buf.length === 0 || p.alive === false) {
            av.group.visible = false;
            continue;
        }
        // Cari dua sampel yang mengapit waktu render rt
        const buf = p.buf;
        let a = buf[0], b = buf[buf.length - 1];
        for (let j = buf.length - 1; j >= 0; j--) {
            if (buf[j].t <= rt) { a = buf[j]; b = buf[j + 1] || buf[j]; break; }
        }
        const span = b.t - a.t;
        const u = span > 0 ? Math.max(0, Math.min(1, (rt - a.t) / span)) : 1;
        const ix = a.x + (b.x - a.x) * u;
        const iy = a.y + (b.y - a.y) * u;
        const iz = a.z + (b.z - a.z) * u;
        const iyaw = lerpAngle(a.yw, b.yw, u);
        const ipitch = a.pt + (b.pt - a.pt) * u;

        av.group.visible = true;
        const feetY = Math.max(0, iy - CFG.player.eyeHeight);
        av.group.position.set(ix, feetY, iz);
        av.group.rotation.y = iyaw;

        // Bitmask anim: 1 jongkok, 2 bidik, 4 tembak, 8 reload, 16 lari, 32 medkit
        const anim = p.anim | 0;
        const crouch = !!(anim & 1);
        const spd = Math.hypot(ix - av.lastX, iz - av.lastZ) / Math.max(dt, 1e-4);
        av.lastX = ix; av.lastZ = iz;

        // Kaki: siklus jalan dari laju hasil interpolasi (pola animateZombieRig)
        if (spd > 2) {
            av.phase += dt * (5 + Math.min(2.2, spd / 22) * 6);
            const s = Math.sin(av.phase);
            av.legL.hip.rotation.x = -s * 0.55;
            av.legR.hip.rotation.x = s * 0.55;
            av.legL.knee.rotation.x = Math.max(0, -s) * 0.7;
            av.legR.knee.rotation.x = Math.max(0, s) * 0.7;
            av.inner.position.y = Math.abs(s) * 1.0 - (crouch ? 2.6 : 0);
        } else {
            const damp = Math.min(1, dt * 8);
            av.legL.hip.rotation.x += (0 - av.legL.hip.rotation.x) * damp;
            av.legR.hip.rotation.x += (0 - av.legR.hip.rotation.x) * damp;
            av.legL.knee.rotation.x += (0 - av.legL.knee.rotation.x) * damp;
            av.legR.knee.rotation.x += (0 - av.legR.knee.rotation.x) * damp;
            av.inner.position.y += ((crouch ? -2.6 : 0) - av.inner.position.y) * damp;
        }

        // Lengan + senjata: pitch bidik mengikuti pandangan; reload = lengan
        // kiri turun; medkit (32) = senjata disembunyikan.
        av.aim.rotation.x = -ipitch - 1.35;             // -1.35 = pose dasar lengan ke depan
        av.armL.rotation.x = (anim & 8) ? 0.9 : 0;      // reload: tangan kiri ke bawah
        av.headG.rotation.x = -ipitch * 0.5;
        av.gun.visible = !(anim & 32);
        const wk = p.wpn || 'pistol';
        if (wk !== av.wpn) {
            av.wpn = wk;
            const d = GUN_DIMS[wk] || GUN_DIMS.pistol;
            av.gun.scale.set(d[0] / 0.9, d[1] / 1.1, d[2] / 7.2);
        }

        // Tembakan: bit fire + jeda per senjata -> flash + SFX berskala jarak
        av.fireCd -= dt;
        if ((anim & 4) && av.fireCd <= 0 && !(anim & 32)) {
            av.fireCd = ((CFG.weapons[wk] && CFG.weapons[wk].fireDelayMs) || 260) / 1000;
            av.flash.material.opacity = 1;
            const dist = Math.hypot(ix - camera.position.x, iz - camera.position.z);
            if (dist < 500) {
                const vol = Math.max(0.05, 0.5 * (1 - dist / 500));
                playSFX(wk === 'pistol' ? sfxPistol : wk === 'shotgun' ? sfxShotgun : sfxShoot, vol);
            }
        }
        if (av.flash.material.opacity > 0)
            av.flash.material.opacity = Math.max(0, av.flash.material.opacity - dt * 10);

        drawNametag(av.tag, p.name, p.hp != null ? p.hp : 100);
    }
    // Slot lebih dari jumlah roster -> sembunyikan
    for (let i = roster.length; i < avatars.length; i++) avatars[i].group.visible = false;
}
