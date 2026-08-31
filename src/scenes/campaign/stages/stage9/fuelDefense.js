// Stage 9 Chapter 3 — SABOTASE SELAMA PENGISIAN BAHAN BAKAR.
//
// Permintaan user (2026-08-31): "ketika menunggu bensin pesawat penuh, spawn
// robot untuk mengganggunya. buat agar robot datang untuk menghancurkan pesawat
// dan pompanya sehingga player harus mencegah itu."
//
// Empat aturan memegang modul ini.
//
// (1) SASARANNYA STRUKTUR, BUKAN PLAYER. Penyabot berjalan ke kotak sasaran
//     (`stage9StructureAim`) dan menyerangnya di sana; ia hanya berpaling ke
//     player bila player masuk radius aggro-nya — persis aturan Monas di mode
//     Survival, dan tanpa itu penyabot akan mengabaikan orang yang berdiri
//     tepat di depannya.
// (2) TAK ADA JALAN BUNTU. Integritas pompa/pesawat TIDAK hilang permanen: bila
//     tak ada pukulan selama `repairDelaySec` ia pulih sendiri, dan struktur
//     yang jatuh ke nol kembali hidup setelah pulih melewati `restoreFraction`.
//     Yang benar-benar hilang adalah BAHAN BAKAR — tiap pukulan menumpahkan
//     `fuelLossPerHit` detik isian, dan struktur yang mati membuat isian
//     menyusut `drainPerSec`. Mengabaikan robot berarti meteran TURUN, bukan
//     misi gagal: stage tetap dapat diselesaikan tanpa jalur kalah baru, tetapi
//     mengabaikannya punya harga yang terbaca langsung di HUD.
// (3) TAK ADA YANG LAHIR DI LAYAR. Gelombang memakai `offscreenSpawnPoints`
//     bersama, aturan yang sama dengan seluruh horde campaign.
// (4) TAK ADA MESH/MATERIAL/LAMPU BARU. Umpan balik pukulan memakai kolam FX
//     bersama (puff + gib), sehingga sabotase tak pernah memicu kompilasi
//     shader di tengah pertempuran.

import { CAMP_M, CFG } from '../../../../core/config.js';
import { camera } from '../../../../core/renderer.js';
import { robots } from '../../../../core/state.js';
import { spawnGroundPuff } from '../../../../entities/effects.js';
import { spawnGibs } from '../../../../entities/gore.js';
import { fireRobotBullet } from '../../../../entities/robots.js';
import { navAim, turnToward } from '../../../../utils/pathfind.js';
import { PAL } from '../../../../world/palette.js';
import {
    campaignRobotAI, spawnCampaignRobot, offscreenSpawnPoints,
} from '../../utility/common.js';
import {
    stage9StructureAim, stage9StructureBox, stage9StructureSegHit,
    stage9RunwayWalkable, stage9Resolve,
} from './world.js';
import { fuelT, setStage9Fuel, queueStage9Dialogue } from './runtime.js';

export const S9_DEFENSE_ENCOUNTER = 'fuelDefense';
const KINDS = ['aircraft', 'pump'];
const _scratch = new THREE.Vector3();

// CFG dibaca DI DALAM fungsi saja: modul ini di-import saat boot, jauh sebelum
// `loadConfig()` mengisi CFG. Rantai opsional di sini bukan gaya defensif tanpa
// sebab — ia yang membuat sebuah pemanggilan dini mengembalikan default alih-alih
// melempar dan mematikan seluruh boot.
const cfg = () => (CFG?.campaign?.stage9?.fuel?.defense) || {};

const state = {
    armed: false, waveT: 0, waves: 0, spawned: 0,
    hits: 0, shots: 0, fuelLost: 0, downEvents: 0,
    aircraft: null, pump: null,
};

const makeStructure = (hp) => ({ hp, max: hp, hitT: 999, down: false });

export function resetStage9FuelDefense() {
    const D = cfg();
    state.armed = false;
    state.waveT = 0;
    state.waves = 0;
    state.spawned = 0;
    state.hits = 0;
    state.shots = 0;
    state.fuelLost = 0;
    state.downEvents = 0;
    state.aircraft = makeStructure(Math.max(1, D.aircraftHp || 300));
    state.pump = makeStructure(Math.max(1, D.pumpHp || 200));
}
// SENGAJA TIDAK dipanggil di sini. Sebuah pemanggilan tingkat-modul membaca CFG
// pada waktu IMPORT — sebelum config dimuat — dan itu melempar sebelum satu
// frame pun digambar. `stage9Scene.enter()` sudah memanggilnya lewat
// `resetStage()`, dan seluruh pembaca di bawah tahan terhadap state yang belum
// diisi, jadi tak ada yang perlu berjalan lebih awal.


export function beginStage9FuelDefense() {
    resetStage9FuelDefense();
    state.armed = true;
    state.waveT = Math.max(0, cfg().firstWaveDelaySec ?? 2.5);
}

export function endStage9FuelDefense() { state.armed = false; }

export const stage9FuelDefenseArmed = () => state.armed;

export function stage9SaboteurCount() {
    let n = 0;
    for (const z of robots) if (z.stage === 9 && z.saboteur) n++;
    return n;
}

// ----- Gelombang -----
function spawnWave() {
    const D = cfg();
    const mix = D.wave || { C: 3, B: 1, A: 1 };
    const want = ['C', 'B', 'A'].flatMap((cls) =>
        Array.from({ length: Math.max(0, mix[cls] | 0) }, () => cls));
    if (!want.length) return 0;
    const points = offscreenSpawnPoints(want.length, {
        walkable: stage9RunwayWalkable,
        resolve: stage9Resolve,
        scratch: _scratch,
        minUnits: 150,
        maxUnits: 46 * CAMP_M,
    });
    if (!points.length) return 0;
    let born = 0;
    for (let i = 0; i < want.length; i++) {
        const p = points[i % points.length];
        spawnCampaignRobot(p.x, p.z, 9, want[i], true);
        const z = robots[robots.length - 1];
        z.encounter = S9_DEFENSE_ENCOUNTER;
        // Dua dari tiga menuju pesawat: badannya jauh lebih besar dan itulah
        // benda yang benar-benar dipertaruhkan misi ini.
        z.saboteur = (state.spawned + i) % 3 === 2 ? 'pump' : 'aircraft';
        born++;
    }
    state.spawned += born;
    state.waves++;
    return born;
}

// ----- Kerusakan struktur -----
function damageStructure(kind, dmg, x, z) {
    const s = state[kind];
    if (!s || !state.armed) return;
    s.hp = Math.max(0, s.hp - Math.max(0, dmg));
    s.hitT = 0;
    state.hits++;
    const D = cfg();
    const loss = Math.max(0, D.fuelLossPerHit || 0);
    if (loss > 0) {
        const before = fuelT;
        setStage9Fuel(fuelT - loss);
        state.fuelLost += before - fuelT;
    }
    // Umpan balik pukulan: kolam FX bersama, tanpa mesh/material/lampu baru.
    const box = stage9StructureBox(kind);
    const hx = x != null ? x : box.x, hz = z != null ? z : box.z;
    const hy = Math.min(box.top, 12);
    spawnGroundPuff(hx, hz, PAL.amber, 2.4, hy);
    spawnGibs(hx, hy, hz, 3, hx - box.x, hz - box.z, 0.8, PAL.steel, 0, PAL.ink);
    if (s.hp <= 0 && !s.down) {
        s.down = true;
        state.downEvents++;
        queueStage9Dialogue('pumpCritical', true);
    }
}

// Hook `robotStructureClaw` scene: sabetan penyabot mendarat.
export function stage9StructureClaw(z) {
    const kind = z.structureTarget || z.saboteur;
    if (!kind) return;
    const aim = stage9StructureAim(kind, z.mesh.position.x, z.mesh.position.z);
    const D = cfg();
    const reach = Math.max(6, (D.attackRangeMeters || 4) * CAMP_M)
        + (CFG.robot.clawStrikeGrace || 0);
    if (aim.dist > reach) return;   // sasaran ditinggalkan selama ancang-ancang
    damageStructure(kind, D.clawDamage || 12, aim.x, aim.z);
}

function nearestStructure(x, z) {
    let best = null, bestD = Infinity;
    for (const kind of KINDS) {
        const d = stage9StructureAim(kind, x, z).dist;
        if (d < bestD) { bestD = d; best = kind; }
    }
    return bestD <= 80 ? best : null;
}

// Sasaran yang dicatat saat peluru DINYATAKAN terblokir. Ini bukan optimasi:
// hook damage hanya menerima posisi AKHIR FRAME peluru, yang untuk peluru cepat
// sudah berada di seberang badan yang baru saja ditembusnya — menebak sasaran
// dari titik itu akan meleset. Yang benar adalah RUAS-nya, dan ruas itu hanya
// dikenal di sini.
let lastBlocked = { pos: null, kind: null };

// Hook `enemyBulletHitStructure` scene: peluru penyabot yang terblokir badan
// sasaran. Ruas pelurunya sudah diuji `stage9FuelDefenseShotBlocked` di bawah.
export function stage9StructureShot(dmg, pos) {
    const kind = (lastBlocked.pos === pos && lastBlocked.kind)
        || stage9StructureSegHit(pos.x, pos.z, pos.x, pos.z, 0)
        || nearestStructure(pos.x, pos.z);
    lastBlocked = { pos: null, kind: null };
    if (!kind) return;
    state.shots++;
    // Percikan digambar pada permukaan yang kena, bukan pada titik akhir peluru.
    const aim = stage9StructureAim(kind, pos.x, pos.z);
    damageStructure(kind, dmg, aim.x, aim.z);
}

// Hanya peluru musuh yang MEMANG membawa damage struktur yang diuji terhadap
// kotak sasaran. Peluru player tak tersentuh: pesawat tetap dapat ditembus
// seperti sebelumnya, jadi rute menuju titik naik dan garis tembak player tidak
// berubah sama sekali.
export function stage9FuelDefenseShotBlocked(b) {
    if (!state.armed || !b || !b.monasDmg) return false;
    const kind = stage9StructureSegHit(b.px, b.pz,
        b.mesh.position.x, b.mesh.position.z, b.mesh.position.y);
    lastBlocked = kind ? { pos: b.mesh.position, kind } : { pos: null, kind: null };
    return !!kind;
}

// ----- AI penyabot -----
// Mengembalikan null bila robot ini bukan penyabot, sehingga pemanggil dapat
// meneruskannya ke AI campaign biasa.
export function stage9SaboteurAI(z, dt, step, ctx) {
    if (!z.saboteur) return null;
    // Pengisian selesai/dibatalkan: penyabot yang masih hidup kembali menjadi
    // robot campaign biasa dan memburu player. Membiarkannya tetap memukuli
    // struktur yang sudah tak menerima damage akan terbaca sebagai macet.
    if (!state.armed) { z.saboteur = null; z.structureTarget = null; return null; }
    const D = cfg();
    const px = camera.position.x, pz = camera.position.z;
    const toPlayer = Math.hypot(px - z.mesh.position.x, pz - z.mesh.position.z);
    // Culling jarak jauh yang sama dengan campaignRobotAI.
    z.mesh.visible = toPlayer < CFG.campaign.cullDistance;
    // Player yang berdiri di dekatnya selalu jadi sasaran (aturan Monas).
    if (toPlayer <= Math.max(0, D.playerAggroMeters || 8) * CAMP_M) {
        z.saboteurEngaged = true;
        return campaignRobotAI(z, dt, step, ctx);
    }
    z.saboteurEngaged = false;
    if (state[z.saboteur]?.down) {
        // Sasarannya sudah tumbang: pindah ke yang lain supaya tak ada penyabot
        // yang berdiri memukuli bangkai sementara satunya masih utuh.
        const other = z.saboteur === 'pump' ? 'aircraft' : 'pump';
        if (!state[other]?.down) z.saboteur = other;
    }
    const kind = z.saboteur;
    const oldX = z.mesh.position.x, oldZ = z.mesh.position.z;
    const aim = stage9StructureAim(kind, oldX, oldZ);
    const shotRange = Math.max(20, (D.shotRangeMeters || 22) * CAMP_M);
    const reach = Math.max(6, (D.attackRangeMeters || 4) * CAMP_M);
    const stopD = z.ranged ? shotRange * 0.9 : reach;
    const path = navAim(z, ctx.nav, aim.x, aim.z, dt, step, ctx.pathWalkable);
    z.state = 'chasing';
    z.navIdle = false;
    z.losOK = true;
    z.moving = aim.dist > stopD && path.reachable !== false;
    if (z.ranged) z.aiming = !z.moving;
    if (z.moving) {
        const ang = turnToward(z,
            Math.atan2(path.z - z.mesh.position.z, path.x - z.mesh.position.x), dt);
        z.mesh.position.x += Math.cos(ang) * z.speed * step;
        z.mesh.position.z += Math.sin(ang) * z.speed * step;
        z.mesh.lookAt(z.mesh.position.x + Math.cos(ang) * 10, z.mesh.position.y,
            z.mesh.position.z + Math.sin(ang) * 10);
    } else {
        z.mesh.lookAt(aim.x, z.mesh.position.y, aim.z);
    }
    ctx.resolve(z.mesh.position, 3.5, 0);
    if (!ctx.walkable(z.mesh.position.x, z.mesh.position.z, 3)) {
        if (ctx.walkable(z.mesh.position.x, oldZ, 3)) z.mesh.position.z = oldZ;
        else if (ctx.walkable(oldX, z.mesh.position.z, 3)) z.mesh.position.x = oldX;
        else { z.mesh.position.x = oldX; z.mesh.position.z = oldZ; }
    }
    z.mesh.position.y = z.baseY;

    // Serangan. Damage TIDAK dibayarkan di sini: melee lewat ancang-ancang
    // bersama (windTarget 'structure' -> hook scene), tembakan lewat peluru yang
    // benar-benar terbang dan terblokir badan sasaran.
    const now = stage9StructureAim(kind, z.mesh.position.x, z.mesh.position.z);
    if (z.ranged) {
        if (z.fireCd > 0) z.fireCd -= dt;
        if (!z.moving && now.dist <= shotRange && z.fireCd <= 0) {
            z.fireCd = z.fireDelaySec;
            fireRobotBullet(z, now.x, 0, now.z, Math.max(1, D.shotDamage || 8));
        }
    } else {
        if (z.attackCd > 0) z.attackCd -= dt;
        if (!(z.windT > 0) && now.dist <= reach && z.attackCd <= 0) {
            z.attackCd = CFG.robot.clawCooldownSec;
            z.windT = z.windDur = CFG.robot.clawWindupSec || 0.5;
            z.windTarget = 'structure';
            z.structureTarget = kind;
            z.clawSide = -z.clawSide;
        }
    }
    return {};   // BUKAN chaseDist: robots.js tak boleh menyerang player untuknya
}

// ----- Tick per frame. Mengembalikan LAJU bahan bakar (detik isian per detik):
// 1 = mengalir normal, negatif = menyusut karena satu struktur tumbang. -----
export function updateStage9FuelDefense(dt) {
    if (!state.armed) return 1;
    const D = cfg();
    state.waveT -= dt;
    if (state.waveT <= 0) {
        state.waveT = Math.max(1, D.waveIntervalSec || 8);
        if (stage9SaboteurCount() < Math.max(1, D.maxAlive || 12)) spawnWave();
    }
    const repairDelay = Math.max(0, D.repairDelaySec ?? 4);
    const repair = Math.max(0, D.repairPerSec || 0);
    const restore = Math.min(1, Math.max(0.05, D.restoreFraction ?? 0.3));
    let down = false;
    for (const kind of KINDS) {
        const s = state[kind];
        s.hitT += dt;
        if (s.hitT >= repairDelay && s.hp < s.max)
            s.hp = Math.min(s.max, s.hp + repair * dt);
        if (s.down && s.hp >= s.max * restore) s.down = false;
        if (s.down) down = true;
    }
    return down ? -Math.max(0, D.drainPerSec || 0) : 1;
}

export const stage9StructureFraction = (kind) =>
    (state[kind] ? state[kind].hp / state[kind].max : 1);
export const stage9StructureDown = (kind) => !!state[kind]?.down;

export function stage9FuelDefenseDebug() {
    return {
        armed: state.armed,
        waves: state.waves,
        spawned: state.spawned,
        alive: stage9SaboteurCount(),
        hits: state.hits,
        shots: state.shots,
        fuelLost: +state.fuelLost.toFixed(3),
        downEvents: state.downEvents,
        nextWaveIn: +Math.max(0, state.waveT).toFixed(3),
        aircraft: { ...state.aircraft },
        pump: { ...state.pump },
    };
}
