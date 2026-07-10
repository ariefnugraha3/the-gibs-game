// SCENE: Survival CO-OP CLIENT (IMPROVEMENT-MULTIPLAYER-PLAN.md Fase 3-6).
// Dunia, tabrakan, radar, dan HUD memakai modul taman yang sama dgn
// survivalScene — tapi TANPA simulasi zombie/wave/Monas/granat: semuanya
// datang dari HOST lewat snapshot 15 Hz + event reliable. Hook zombieAI =
// INTERPOLASI posisi (bukan pathfinding); klaim tembak/melee/lempar/ambil-drop
// dikirim ke host lewat hook onBulletHit/onMeleeHit/onGrenadeThrow/onDropTake.
// Inilah cara MP masuk tanpa melanggar aturan "sistem bersama nol if-else
// mode" — semua perbedaan client hidup di scene ini.
//
// PENTING: client TIDAK memakai antrean pesan (setMsgHandler langsung) —
// pesan `restart`/`over`/`hostleft` harus tetap terproses saat updateGame
// berhenti (game over / pause awal). Aman: event WS browser berjalan
// ANTAR-frame (JS single thread), tak pernah menyela di tengah updateGame.

import { CFG } from '../../core/config.js';
import {
    player, zombies, drops, score, addScore, stats, isGameOver, _v3
} from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { clamp } from '../../utils/math.js';
import { updateUI } from '../../core/hud.js';
import { showStageMsg, showPickup, flashDamage, showHitDir, showFatal } from '../../core/dom.js';
import { playSFX, sfxZombieBite, sfxHit } from '../../utils/sfx.js';
import { gameOver, resetGame } from '../../core/game.js';
import { requestLock, showBlockerIfUnlocked } from '../../core/input.js';
import { applyLightPreset, LIGHT_PRESETS, ambLight, hemiLight, dirLight } from '../../world/lighting.js';
import {
    PARK, FOUNTAIN, ensureParkWorld, resolveMonas, resolveObstacles, groundHeightAt
} from './world.js';
import {
    buildHumanZombie, applyVariantTint, disposeZombie, CLAW_TIME, attackerAngle
} from '../../entities/zombies.js';
import { explodeVisualAt, spawnGroundPuff } from '../../entities/effects.js';
import { spawnNetDrop, applyDropPickup } from '../../entities/drops.js';
import { NADE_R, buildGrenadeMesh } from '../../entities/grenades.js';
import { initRemoteAvatars, updateRemotePlayers, pushRemoteSample } from '../../entities/remotePlayers.js';
import {
    localId, roster, rosterGet, rosterAdd, rosterRemove, setSelfReady,
    WPN_LIST, WPN_IDX, KIND_LIST, r1, r2
} from '../../net/index.js';
import { sendMsg, setMsgHandler, setCloseHandler } from '../../net/socket.js';
import {
    localDown, updateDownCam, reviveLocal, resetDown, onPlayerZeroHp
} from '../../net/players.js';
import {
    openShop, closeShop, isShopOpen, requestNextWave, shopNetResult, shopMpTick
} from './shop.js';
import { currentWeapon, isAiming, medkitMode } from '../../entities/weapons.js';
import { crouchedNow, sprintingNow } from '../../entities/player.js';

// ----- Cermin state host (tampilan HUD/radar/shop) -----
const wv = { num: 1, phase: 'fighting', left: 0, timer: 0, ready: 0, total: 1 };
const mn = { hp: 1, max: 1 };
// Info ready utk shop.js (fase shopping)
export function getClientReadyInfo() {
    return { ready: wv.ready, total: wv.total, timeLeft: wv.timer };
}

// ----- Registry ghost -----
const zById = new Map();     // id -> zombie ghost (juga hidup di array zombies global)
const nadeById = new Map();  // id -> {mesh, tx, ty, tz} granat ghost (render-only)
const snapSeen = new Set(), nadeSeen = new Set();
let sendT = 0;               // cadence kirim `p`
// Event lingkungan (fog/blackout) — replika animasi survivalScene dari event host
const EVT = { type: null, left: 0, dur: 1 };

// ================= Ghost zombie =================
function createGhost(id, kind, scl, x, y, zz) {
    const built = buildHumanZombie();
    const mesh = built.group;
    mesh.position.set(x, y || 0, zz);
    if (scl !== 1) mesh.scale.setScalar(scl);
    applyVariantTint(mesh, kind);
    scene.add(mesh);
    const z = {
        id, netGhost: true, mesh, rig: built.rig, isModel: true,
        hp: 1e9,   // tak pernah dikurangi lokal (onBulletHit mencegat) — host authoritative
        kind, scl, baseY: 0, groundY: 0,
        state: 'chasing', moving: true, phase: Math.random() * 6.28,
        clawT: 0, clawSide: 1, attackCd: 0,
        buf: [], missCount: 0, sJump: false, sMv: true, fx: 0, fz: 1,
    };
    zombies.push(z);   // ikut array global: radar, badan-pejal, & sweep peluru bekerja apa adanya
    zById.set(id, z);
    return z;
}

function removeGhost(id, puff) {
    const z = zById.get(id);
    if (!z) return;
    zById.delete(id);
    const i = zombies.indexOf(z);
    if (i >= 0) zombies.splice(i, 1);
    if (puff) spawnGroundPuff(z.mesh.position.x, z.mesh.position.z, 0x5a1616, 13, 0.6);
    disposeZombie(z);
    scene.remove(z.mesh);
}

// ================= Snapshot =================
function applySnapshot(s) {
    // Pemain (host duluan; entry milik sendiri diabaikan — posisi kita otoritatif)
    for (const e of s.p) {
        const id = e[0];
        if (id === localId) continue;
        const p = rosterGet(id) || rosterAdd(id);
        p.x = e[1]; p.y = e[2]; p.z = e[3];
        p.yaw = e[4]; p.pitch = e[5];
        p.anim = e[6]; p.wpn = WPN_LIST[e[7]] || 'pistol';
        p.hp = e[8]; p.score = e[9];
        p.alive = !!e[10]; p.ready = !!e[11];
        pushRemoteSample(p);
    }
    // Zombie: sampel interpolasi + self-healing (id tak dikenal -> buat ghost;
    // hilang 2 snapshot beruntun tanpa zdie -> buang senyap)
    snapSeen.clear();
    const now = performance.now();
    for (const e of s.z) {
        const id = e[0];
        snapSeen.add(id);
        let z = zById.get(id);
        if (!z) z = createGhost(id, KIND_LIST[e[6]] || 'walker', e[7] || 1, e[1], e[2], e[3]);
        z.buf.push({ t: now, x: e[1], y: e[2], z: e[3] });
        if (z.buf.length > 12) z.buf.splice(0, z.buf.length - 12);
        z.sJump = e[4] === 1;
        z.sMv = e[5] === 1;
        if (e[8] && z.clawT <= 0) { z.clawT = CLAW_TIME; z.clawSide = -z.clawSide; }
        z.missCount = 0;
    }
    for (const [id, z] of zById)
        if (!snapSeen.has(id) && ++z.missCount >= 2) removeGhost(id, false);
    // Granat ghost (render-only, lerp ke posisi snapshot)
    nadeSeen.clear();
    for (const e of s.n) {
        const id = e[0];
        nadeSeen.add(id);
        let g = nadeById.get(id);
        if (!g) {
            g = { mesh: buildGrenadeMesh(), tx: e[1], ty: e[2], tz: e[3] };
            g.mesh.position.set(e[1], e[2], e[3]);
            scene.add(g.mesh);
            nadeById.set(id, g);
        }
        g.tx = e[1]; g.ty = e[2]; g.tz = e[3];
    }
    for (const [id, g] of nadeById)
        if (!nadeSeen.has(id)) { scene.remove(g.mesh); nadeById.delete(id); }
    // Monas + wave
    mn.hp = s.m[0]; mn.max = s.m[1] || 1;
    wv.num = s.w[0];
    wv.phase = s.w[1] === 0 ? 'fighting' : s.w[1] === 1 ? 'cleared' : 'shopping';
    wv.left = s.w[2]; wv.timer = s.w[3];
    wv.ready = s.w[4]; wv.total = s.w[5];
}

// ================= Pesan dari host =================
function handleMsg(m) {
    switch (m.t) {
        case 's': applySnapshot(m); return;
        case 'zspawn':
            if (!zById.has(m.id))
                createGhost(m.id, KIND_LIST[m.k] || 'walker', m.s || 1, m.x, m.y, m.zz);
            return;
        case 'zdie':
            removeGhost(m.id, true);
            if (m.by === localId) {   // kill milik KITA: skor + statistik lokal
                stats.kills++;
                addScore(m.pts | 0);
                updateUI();
            }
            return;
        case 'boom':   // visual+SFX ledakan (damage pemain datang terpisah via `dmg`)
            explodeVisualAt(_v3.set(m.x, m.y, m.zz));
            return;
        case 'dmg': {  // cakar/ledakan dari host -> HP kita (client-authoritative)
            if (localDown || isGameOver) return;
            player.hp -= +m.a || 0;
            updateUI();
            flashDamage();
            showHitDir(attackerAngle(m.zx, m.zz));
            playSFX(sfxZombieBite);
            playSFX(sfxHit);
            if (player.hp <= 0) onPlayerZeroHp();
            return;
        }
        case 'drop': spawnNetDrop(m.id, m.ty, m.x, m.zz); return;
        case 'dropgone': {
            for (let i = drops.length - 1; i >= 0; i--) {
                if (drops[i].id === m.id) {
                    scene.remove(drops[i].mesh);
                    drops.splice(i, 1);
                    break;
                }
            }
            if (m.by === localId) applyDropPickup(m.ty);   // klaim kita dikabulkan host
            return;
        }
        case 'pdown': { const p = rosterGet(m.id); if (p) p.alive = false; return; }
        case 'pleave': rosterRemove(m.id); return;
        case 'wavestart': onWaveStart(m.num); return;
        case 'evt': onEvent(m.k, m.d); return;
        case 'buyok': shopNetResult(null, m.c); return;
        case 'buyno': shopNetResult(m.r || 'Rejected'); return;
        case 'over':
            if (isShopOpen()) closeShop();
            setSelfReady(false);
            gameOver(!!m.w, m.ti || undefined);
            setRestartHint('Waiting for the host to restart...');
            return;
        case 'restart':
            for (const p of roster) { p.score = 0; p.alive = true; p.ready = false; }
            setRestartHint(null);
            resetGame();               // restartScene -> enter() membersihkan mirror/ghost
            showBlockerIfUnlocked();   // requestLock resetGame dipicu remote -> bisa ditolak
            return;
        case 'hostleft': onHostLeft(); return;
    }
}

function onWaveStart(num) {
    wv.num = num;
    wv.phase = 'fighting';
    if (isShopOpen()) closeShop();
    setSelfReady(false);
    reviveLocal();
    showStageMsg(`WAVE ${num}`, 1800);
    updateUI();
    requestLock();             // tanpa gesture bisa ditolak browser...
    showBlockerIfUnlocked();   // ...maka pastikan ada blocker klik-untuk-lanjut
}

// Replika animasi event lingkungan survivalScene (fog/blackout) dari event host
function onEvent(kind, dur) {
    EVT.type = kind || null;
    EVT.dur = dur || 1;
    EVT.left = EVT.dur;
    if (!kind) { applyLightPreset(scene, 'outdoor'); return; }
    showPickup(kind === 'fog' ? 'The fog is rolling in...' : 'The city lights went out!',
        kind === 'fog' ? '#9fb6c9' : '#c9b89f');
}

function setRestartHint(text) {
    const hint = document.getElementById('goRestartHint');
    if (hint) hint.innerText = text || 'Press SPACE to restart';
}

function onHostLeft() {
    showFatal('<b>HOST LEFT THE GAME.</b><br>Returning to the main menu...');
    setTimeout(() => location.reload(), 2500);
}

// ================= Kirim pose sendiri (inputHz) =================
function sendP() {
    camera.getWorldDirection(_v3);
    const yaw = Math.atan2(_v3.x, _v3.z);
    const pitch = Math.asin(clamp(_v3.y, -1, 1));
    let a = 0;
    if (crouchedNow) a |= 1;
    if (isAiming) a |= 2;
    if (Date.now() - player.lastShot < 160) a |= 4;
    if (player.isReloading) a |= 8;
    if (sprintingNow) a |= 16;
    if (medkitMode) a |= 32;
    sendMsg({
        t: 'p',
        x: r1(camera.position.x), y: r1(camera.position.y), z: r1(camera.position.z),
        yw: r2(yaw), pt: r2(pitch), a,
        w: WPN_IDX[currentWeapon] != null ? WPN_IDX[currentWeapon] : 1,
        hp: Math.round(player.hp), sc: score | 0, al: localDown ? 0 : 1
    });
}

// ================= Scene (kontrak penuh — lihat MODULES.md) =================
export const survivalCoopClientScene = {
    id: 'survival-coop-client',

    enter() {
        ensureParkWorld();   // seed sudah di-set (setWorldSeed) di lobby SEBELUM startGame
        initRemoteAvatars();
        resetDown();
        setSelfReady(false);
        // Bersihkan ghost run sebelumnya (array zombies sudah dibuang resetGame)
        zById.clear();
        for (const [, g] of nadeById) scene.remove(g.mesh);
        nadeById.clear();
        wv.num = 1; wv.phase = 'fighting'; wv.left = 0; wv.timer = 0;
        wv.ready = 0; wv.total = 1;
        mn.hp = CFG.survival.monasMaxHp; mn.max = CFG.survival.monasMaxHp;
        EVT.type = null;
        applyLightPreset(scene, 'outdoor');
        closeShop();
        setMsgHandler(handleMsg);        // pesan host -> handler LANGSUNG (lihat header)
        setCloseHandler(onHostLeft);     // koneksi putus = host hilang
        // Titik start menyebar per pemain di gerbang selatan (tidak menumpuk)
        camera.position.set(-40 + localId * 28, CFG.player.eyeHeight, 130);
        camera.quaternion.set(0, 0, 0, 1);
        updateUI();
    },

    // Dunia MP tidak bisa di-pause (input.js membaca hook ini)
    pausable: () => false,

    shopKey(key) {
        if (!isShopOpen()) return false;
        if (key === ' ' || key === 'enter') { requestNextWave(); return true; }   // toggle READY
        return false;
    },
    shopActive: isShopOpen,

    updateMode(dt) {
        // Kirim pose sendiri (inputHz) — juga saat tumbang (al=0, posisi spectator)
        sendT -= dt;
        if (sendT <= 0) {
            sendT = 1 / ((CFG.net && CFG.net.inputHz) || 20);
            sendP();
        }
        updateRemotePlayers(dt);
        updateDownCam(dt);
        // Granat ghost menyusul posisi snapshot (lerp ringan)
        for (const [, g] of nadeById) {
            const k = Math.min(1, dt * 12);
            g.mesh.position.x += (g.tx - g.mesh.position.x) * k;
            g.mesh.position.y += (g.ty - g.mesh.position.y) * k;
            g.mesh.position.z += (g.tz - g.mesh.position.z) * k;
        }
        // Shop mengikuti fase host (dunia terus berjalan — tanpa pause)
        if (wv.phase === 'shopping') {
            if (!isShopOpen()) openShop();
            shopMpTick();
        } else if (isShopOpen()) {
            closeShop();
        }
        // Replika animasi event fog/blackout (rumus sama dgn survivalScene)
        if (EVT.type) {
            EVT.left -= dt;
            const k = Math.max(0, Math.min(1, Math.min(EVT.dur - EVT.left, EVT.left) / 2));
            const P = LIGHT_PRESETS.outdoor;
            if (EVT.type === 'fog') {
                scene.fog.near = P.fogNear + (70 - P.fogNear) * k;
                scene.fog.far = P.fogFar + (480 - P.fogFar) * k;
            } else {
                if (ambLight) ambLight.intensity = P.amb * (1 - 0.8 * k);
                if (hemiLight) hemiLight.intensity = P.hemi * (1 - 0.8 * k);
                if (dirLight) dirLight.intensity = P.dir * (1 - 0.85 * k);
            }
            if (EVT.left <= 0) { EVT.type = null; applyLightPreset(scene, 'outdoor'); }
        }
    },

    // --- Dinding & lantai: SAMA dgn survivalScene (dunia taman yang sama) ---
    playerCollide(pos, oldX, oldZ, feetY) {
        const bx = PARK.hx - player.radius - 2, bz = PARK.hz - player.radius - 2;
        pos.x = clamp(pos.x, -bx, bx);
        pos.z = clamp(pos.z, -bz, bz);
        resolveMonas(pos, oldX, oldZ, player.radius);
        resolveObstacles(pos, player.radius, feetY);
    },

    groundHeight: groundHeightAt,

    bulletBlocked(b) {
        const y = b.mesh.position.y;
        if (y < 0 || y > 64) return false;
        const h = y < 2 ? 22 : y < 5 ? 20 : y < 8 ? 15 : 8;
        return Math.abs(b.mesh.position.x) < h && Math.abs(b.mesh.position.z) < h;
    },

    grenadeCollide(g, oldGX, oldGZ) {
        // Granat lokal tidak pernah ada di client (onGrenadeThrow mem-bypass) —
        // implementasi tetap ada demi kontrak scene (dan aman bila terpanggil).
        const nbx = PARK.hx - 3, nbz = PARK.hz - 3;
        if (Math.abs(g.mesh.position.x) > nbx) {
            g.mesh.position.x = clamp(g.mesh.position.x, -nbx, nbx);
            g.vx = -g.vx * 0.45;
        }
        if (Math.abs(g.mesh.position.z) > nbz) {
            g.mesh.position.z = clamp(g.mesh.position.z, -nbz, nbz);
            g.vz = -g.vz * 0.45;
        }
        if (Math.abs(g.mesh.position.x) < 23 && Math.abs(g.mesh.position.z) < 23
            && g.mesh.position.y < 35) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolveObstacles(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
    },

    // --- Zombie ghost: interpolasi posisi host (BUKAN pathfinding) ---
    zombieAI(z) {
        const delay = (CFG.net && CFG.net.interpDelayMs) || 120;
        const rt = performance.now() - delay;
        const buf = z.buf;
        if (buf && buf.length) {
            let a = buf[0], b = buf[buf.length - 1];
            for (let j = buf.length - 1; j >= 0; j--)
                if (buf[j].t <= rt) { a = buf[j]; b = buf[j + 1] || buf[j]; break; }
            const span = b.t - a.t;
            const u = span > 0 ? clamp((rt - a.t) / span, 0, 1) : 1;
            const nx = a.x + (b.x - a.x) * u;
            const ny = a.y + (b.y - a.y) * u;
            const nz = a.z + (b.z - a.z) * u;
            const mdx = nx - z.mesh.position.x, mdz = nz - z.mesh.position.z;
            z.mesh.position.set(nx, ny, nz);
            // hadap arah gerak; saat hampir diam pertahankan hadap terakhir
            if (mdx * mdx + mdz * mdz > 0.0004) { z.fx = mdx; z.fz = mdz; }
            z.mesh.lookAt(nx + z.fx * 10, ny, nz + z.fz * 10);
        }
        z.state = z.sJump ? 'jumping' : 'chasing';
        z.moving = z.sMv;
        return {};   // tanpa chaseDist -> zombies.js tak pernah mencakar di client
    },

    // --- Klaim ke host (hook sistem bersama; lihat zombies/weapons/grenades/drops) ---
    onBulletHit(z, dmg, isHead) {
        sendMsg({ t: 'hit', zid: z.id, d: Math.round(dmg), h: isHead ? 1 : 0 });
    },
    onMeleeHit(z) {
        sendMsg({ t: 'melee', zid: z.id });
    },
    onGrenadeThrow(x, y, zz, vx, vy, vz) {
        sendMsg({
            t: 'nade', x: r1(x), y: r1(y), z: r1(zz),
            vx: r1(vx), vy: r1(vy), vz: r1(vz)
        });
    },
    onDropTake(d) {
        sendMsg({ t: 'take', id: d.id });
    },

    clampDropPos(x, z) {
        return [clamp(x, -PARK.hx + 10, PARK.hx - 10), clamp(z, -PARK.hz + 10, PARK.hz - 10)];
    },

    hudStatus() {
        const pct = Math.max(0, Math.ceil(mn.hp / mn.max * 100));
        if (wv.phase === 'cleared')
            return `WAVE ${wv.num} CLEARED — Next wave in ${Math.max(1, wv.timer)}...`;
        if (wv.phase === 'shopping')
            return `WAVE ${wv.num} CLEARED — Ready ${wv.ready}/${wv.total} · starts in ${wv.timer}s`;
        return `Wave ${wv.num} — ${wv.left} left · Monas ${pct}%`;
    },

    radarLandmarks(plot) {
        const r = mn.hp / mn.max;
        plot(-camera.position.x, -camera.position.z,
            r > 0.6 ? "#bbbbbb" : r > 0.3 ? "#f1c40f" : "#ff4757", 4, true);
    },

    // Restart hanya dari pesan `restart` host -> resetGame -> enter() ulang scene ini
    restartScene() { return survivalCoopClientScene; },
};
