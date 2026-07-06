// SCENE: Survival Mode — pertahankan Monas dari gelombang zombie tanpa akhir.
// Memiliki: dunia taman (world.js), difficulty scaling per wave, spawner
// (zombie melompati pagar), AI kejar + vault bak air mancur, dan seluruh hook
// antarmuka scene (lihat MODULES.md).

import { CFG } from '../../core/config.js';
import { player, zombies, isPaused, isGameOver, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { rand, clamp } from '../../utils/math.js';
import { updateUI } from '../../core/hud.js';
import { buildHumanZombie, tintZombie, CLAW_TIME, reachForScale } from '../../entities/zombies.js';
import { spawnGroundPuff } from '../../entities/effects.js';
import { NADE_R } from '../../entities/grenades.js';
import { gameOver } from '../../core/game.js';
import { showPickup } from '../../core/dom.js';
import { applyLightPreset, LIGHT_PRESETS, ambLight, hemiLight, dirLight } from '../../world/lighting.js';
import {
    PARK, FENCE_H, FOUNTAIN, ensureParkWorld, getSurvivalNav,
    resolveObstacles, segmentHitsFountain, groundHeightAt
} from './world.js';
import { navAim, turnToward } from '../../utils/pathfind.js';
import { shopKey, closeShop } from './shop.js';

// Difficulty / wave
const wave = { num: 1, time: 0, spawnTimer: 0, spawnInterval: 4, maxZombies: 10 };
let navGrid = null;   // nav-grid pathfinder (Monas & pohon = penghalang; bak walkable = vault)

// Objektif Monas (IMPROVEMENT-PLAN #6): sebagian zombie menggerogoti Monas;
// monasHp 0 = kalah ("THE MONUMENT HAS FALLEN").
let monasHp = 50;
let monasWarnCd = 0;   // jeda peringatan feed agar tidak spam tiap gigitan

function damageMonas(n) {
    monasHp -= n;
    updateUI();
    if (monasWarnCd <= 0) {
        monasWarnCd = 6;
        const crit = monasHp <= CFG.survival.monasMaxHp * 0.3;
        showPickup(crit ? 'THE MONUMENT IS CRITICAL!' : 'The Monument is under attack!',
            crit ? '#ff4757' : '#ffb84d');
    }
    if (monasHp <= 0) gameOver(false, 'THE MONUMENT HAS FALLEN');
}

// Event wave (IMPROVEMENT-PLAN #9): kabut turun ATAU listrik kota padam —
// hanya menganimasikan fog.near/far & intensitas cahaya (uniform-only, tanpa
// recompile; scene.fog sudah dibuat sejak initRenderer).
const EVT = { type: null, left: 0, dur: 1 };

function startEvent() {
    EVT.type = Math.random() < 0.5 ? 'fog' : 'blackout';
    EVT.dur = CFG.survival.eventDurationSec;
    EVT.left = EVT.dur;
    showPickup(EVT.type === 'fog' ? 'The fog is rolling in...' : 'The city lights went out!',
        EVT.type === 'fog' ? '#9fb6c9' : '#c9b89f');
}

function endEvent() {
    EVT.type = null;
    applyLightPreset(scene, 'outdoor');   // pulihkan fog + cahaya persis preset
}

function spawnZombie() {
    if (isGameOver || isPaused || zombies.length >= wave.maxZombies) return;
    const SV = CFG.survival;

    // Titik di pagar, dekat posisi player. Sebagian besar dari sisi terdekat
    // (biar cepat masuk), sisanya acak agar serangan datang dari segala arah.
    const spread = 150;
    const cx = camera.position.x, cz = camera.position.z;
    let side;
    if (Math.random() < 0.7) {
        const dN = cz + PARK.hz, dS = PARK.hz - cz, dW = cx + PARK.hx, dE = PARK.hx - cx;
        const m = Math.min(dN, dS, dW, dE);
        side = m === dN ? 0 : m === dS ? 1 : m === dW ? 2 : 3;
    } else {
        side = Math.floor(Math.random() * 4);
    }
    let fx, fz, inX = 0, inZ = 0;            // (fx,fz)=titik pagar, (inX,inZ)=arah masuk
    if (side === 0) { fz = -PARK.hz; inZ = 1; fx = clamp(cx + rand(-spread, spread), -PARK.hx, PARK.hx); }
    else if (side === 1) { fz = PARK.hz; inZ = -1; fx = clamp(cx + rand(-spread, spread), -PARK.hx, PARK.hx); }
    else if (side === 2) { fx = -PARK.hx; inX = 1; fz = clamp(cz + rand(-spread, spread), -PARK.hz, PARK.hz); }
    else { fx = PARK.hx; inX = -1; fz = clamp(cz + rand(-spread, spread), -PARK.hz, PARK.hz); }

    const OUT = 45, IN = 55;                  // mulai di luar pagar, mendarat di dalam
    const startX = fx - inX * OUT, startZ = fz - inZ * OUT;
    const landX = fx + inX * IN, landZ = fz + inZ * IN;

    // Makin lama makin tebal & cepat (rumus difficulty dari CFG.survival)
    const hp = SV.zombieHpBase + Math.floor((wave.num - 1) / 2) * SV.zombieHpPerTwoWaves;
    const speed = (SV.zombieSpeedBase + Math.random() * SV.zombieSpeedRand
        + (wave.num - 1) * SV.zombieSpeedPerWave) * SV.zombieSpeedScale;

    // --- Varian perilaku (IMPROVEMENT-PLAN #1): peluang naik seiring wave ---
    let kind = 'walker';
    const roll = Math.random();
    const eC = wave.num >= SV.exploderFromWave ? SV.exploderChance : 0;
    const bC = wave.num >= SV.bruteFromWave ? SV.bruteChance : 0;
    const runnerC = Math.min(SV.runnerChanceMax,
        SV.runnerChanceBase + (wave.num - 1) * SV.runnerChancePerWave);
    if (roll < eC) kind = 'exploder';
    else if (roll < eC + bC) kind = 'brute';
    else if (Math.random() < runnerC) kind = 'runner';
    const V = kind !== 'walker' ? CFG.zombie.variants[kind] : null;
    const vHp = V ? Math.max(1, Math.round(hp * V.hpMul)) : hp;   // min 1 (runner mati 1 peluru)
    const vSpeed = V ? speed * V.speedMul : speed;
    const scl = V ? V.scale : 1;

    // Zombie manusia prosedural (warga korban alien) — varian skin acak per spawn.
    const built2 = buildHumanZombie();
    const zMesh = built2.group;
    const baseY = 0;                           // origin grup di kaki (y saat menapak tanah)
    zMesh.position.set(startX, baseY, startZ);
    if (scl !== 1) zMesh.scale.setScalar(scl);
    if (kind === 'exploder') tintZombie(zMesh, 0.06, 0.15, -0.02, 0x143206);
    else if (kind === 'brute') tintZombie(zMesh, 0, -0.05, -0.09);
    scene.add(zMesh);

    // state 'jumping' -> melompati pagar; lalu 'chasing' -> kejar target.
    // Busur lompat digeneralisasi (jumpY0->jumpY1 + arcH) agar bisa dipakai ulang
    // untuk vault dinding bak air mancur; groundY = lantai pijakan saat ini.
    // target 'monas' (peluang CFG) = menggerogoti Monas kecuali player mendekat.
    zombies.push({
        mesh: zMesh, hp: vHp, maxHp: vHp, speed: vSpeed, rig: built2.rig, isModel: true,
        baseY, phase: Math.random() * 6.28,
        state: 'jumping', jumpT: 0, jumpDur: 1.1,
        sx: startX, sz: startZ, lx: landX, lz: landZ,
        jumpY0: 0, jumpY1: 0, arcH: FENCE_H + 14, groundY: 0, vaultCd: 0,
        attackCd: 0, clawT: 0, clawSide: 1, moving: true,   // sistem serangan cakar
        kind, scl, reachMul: reachForScale(scl),   // badan besar = reach ikut membesar
        clawDmg: V ? V.clawDamage : CFG.zombie.clawDamage,
        target: Math.random() < SV.monasAttackerChance ? 'monas' : 'player'
    });
}

export const survivalScene = {
    id: 'survival',

    enter() {
        ensureParkWorld();
        navGrid = getSurvivalNav();
        // Reset wave + objektif Monas + event + shop + posisi awal
        wave.num = 1; wave.time = 0; wave.spawnTimer = 0;
        wave.spawnInterval = CFG.survival.spawnIntervalBase;
        wave.maxZombies = CFG.survival.maxZombiesBase;
        monasHp = CFG.survival.monasMaxHp;
        monasWarnCd = 0;
        endEvent();          // pulihkan fog/cahaya bila mati di tengah event
        closeShop();
        camera.position.set(0, CFG.player.eyeHeight, 120);
        camera.quaternion.set(0, 0, 0, 1);
    },

    // Hook shop (core/input.js men-delegasi tombol B & angka saat overlay terbuka)
    shopKey,
    shopClose: closeShop,

    // --- Wave / difficulty scaling + spawner (akumulator dt, hormat pause) ---
    updateMode(dt) {
        const SV = CFG.survival;
        wave.time += dt;
        const targetWave = 1 + Math.floor(wave.time / SV.waveSeconds);   // naik tiap waveSeconds
        if (targetWave !== wave.num) {
            wave.num = targetWave;
            wave.spawnInterval = Math.max(SV.spawnIntervalMin,
                SV.spawnIntervalBase - (wave.num - 1) * SV.spawnIntervalStep);
            wave.maxZombies = Math.min(SV.maxZombiesCap,
                SV.maxZombiesBase + (wave.num - 1) * SV.maxZombiesStep);
            // Event lingkungan tiap kelipatan eventEveryWaves (kabut/blackout)
            if (SV.eventEveryWaves > 0 && wave.num % SV.eventEveryWaves === 0
                && !EVT.type) startEvent();
            updateUI();
        }
        wave.spawnTimer += dt;
        if (wave.spawnTimer >= wave.spawnInterval) {
            wave.spawnTimer = 0;
            spawnZombie();
        }
        if (monasWarnCd > 0) monasWarnCd -= dt;

        // Animasi event aktif: envelope naik-turun 2 dtk di kedua ujung —
        // nilai dihitung dari preset outdoor (bukan akumulasi) = tanpa drift.
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
            if (EVT.left <= 0) endEvent();
        }
    },

    // --- Dinding & penghalang utk player: pagar (clamp), Monas (AABB), pohon+bak ---
    playerCollide(pos, oldX, oldZ, feetY) {
        // Pagar = batas keras: player tertahan di dalam taman.
        const bx = PARK.hx - player.radius - 2, bz = PARK.hz - player.radius - 2;
        pos.x = clamp(pos.x, -bx, bx);
        pos.z = clamp(pos.z, -bz, bz);
        if (Math.abs(pos.x) < 25 && Math.abs(pos.z) < 25) {
            pos.x = oldX; pos.z = oldZ;
        }
        // Penghalang pejal: pohon & dinding bak air mancur (dorong keluar horizontal)
        resolveObstacles(pos, player.radius, feetY);
    },

    groundHeight: groundHeightAt,

    // Peluru mati di badan Monas (AABB + batas tinggi)
    bulletBlocked(b) {
        return Math.abs(b.mesh.position.x) < 22 && Math.abs(b.mesh.position.z) < 22
            && b.mesh.position.y < 35;
    },

    // Pantulan granat: pagar & Monas (posisi dikembalikan, kecepatan dibalik +
    // diredam); pohon & bak pejal juga utk granat — supaya gelindingnya wajar
    // (tidak menembus batang/bak; peluru TETAP menembus pohon).
    grenadeCollide(g, oldGX, oldGZ) {
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

    // --- AI zombie survival: lompat pagar -> kejar; vault bak air mancur ---
    // Return { chaseDist } HANYA bila cabang kejar berjalan frame ini (kontrak
    // cakar di zombies.js): zombie yang baru mendarat tidak mencakar di frame
    // pendaratannya (sama seperti perilaku lama).
    zombieAI(z, dt, step) {
        const oldZX = z.mesh.position.x, oldZZ = z.mesh.position.z;

        if (z.state === 'jumping') {
            // Busur lompat (pagar / vault bak): lerp horizontal + lerp lantai + busur sinus.
            z.jumpT += dt / z.jumpDur;
            const t = Math.min(1, z.jumpT);
            z.mesh.position.x = z.sx + (z.lx - z.sx) * t;
            z.mesh.position.z = z.sz + (z.lz - z.sz) * t;
            z.mesh.position.y = z.baseY + z.jumpY0 + (z.jumpY1 - z.jumpY0) * t
                + Math.sin(Math.PI * t) * z.arcH;
            z.mesh.lookAt(camera.position.x, z.mesh.position.y, camera.position.z);
            if (t >= 1) {
                z.state = 'chasing';
                z.groundY = z.jumpY1;
                z.mesh.position.y = z.baseY + z.groundY;
                // debu di tanah / percikan air bila mendarat di atas bak
                spawnGroundPuff(z.mesh.position.x, z.mesh.position.z,
                    z.jumpY1 > 0 ? 0x7fb3d1 : 0x8a7a5e, z.jumpY1 > 0 ? 12 : 16, z.jumpY1 + 0.6);
            }
            return {};
        }

        // Kejar TARGET (grounded): player, atau Monas bagi zombie penggerogot
        // (z.target 'monas') selama player di luar radius bela monasDefendRadius.
        // Pathfinder: direct = garis lurus bebas (kejar langsung — termasuk
        // melintasi bak air mancur, yang memicu vault); waypoint = memutari
        // Monas/pohon. Gerak memakai heading berlaju-putar-terbatas
        // (turnToward) -> belokan melengkung alami, tidak patah-patah.
        const dx = camera.position.x - z.mesh.position.x;
        const dz = camera.position.z - z.mesh.position.z;
        const distToEye = Math.hypot(dx, dz);
        const atkMonas = z.target === 'monas' && monasHp > 0
            && distToEye > CFG.survival.monasDefendRadius;
        // Titik tuju: player, atau titik terdekat di tepi AABB Monas (24)
        const tx = atkMonas ? clamp(z.mesh.position.x, -24, 24) : camera.position.x;
        const tz = atkMonas ? clamp(z.mesh.position.z, -24, 24) : camera.position.z;
        const distT = atkMonas
            ? Math.hypot(tx - z.mesh.position.x, tz - z.mesh.position.z) : distToEye;
        const aim = navAim(z, navGrid, tx, tz, dt, step);
        z.moving = !aim.direct || distT >
            (atkMonas ? 6 : player.radius + CFG.zombie.stopRange * (z.reachMul || 1));
        if (z.moving) {
            const ang = turnToward(z,
                Math.atan2(aim.z - z.mesh.position.z, aim.x - z.mesh.position.x), dt);
            z.mesh.position.x += Math.cos(ang) * z.speed * step;
            z.mesh.position.z += Math.sin(ang) * z.speed * step;
            z.mesh.lookAt(z.mesh.position.x + Math.cos(ang) * 10, z.mesh.position.y,
                z.mesh.position.z + Math.sin(ang) * 10);
        } else {
            z.mesh.lookAt(tx, z.mesh.position.y, tz);
        }

        // Menggerogoti Monas: pakai cooldown & animasi cakar yang sama, tapi
        // damage masuk ke monasHp (BUKAN player) — return {} di bawah menjaga
        // zombies.js tidak ikut mencakar player.
        if (atkMonas && !z.moving) {
            if (z.attackCd > 0) z.attackCd -= dt;
            if (z.attackCd <= 0) {
                z.attackCd = CFG.zombie.clawCooldownSec;
                z.clawT = CLAW_TIME;
                z.clawSide = -z.clawSide;
                damageMonas(CFG.survival.monasClawDamage);
                if (isGameOver) return {};
            }
        }

        // Tabrakan dgn Monas -> mundur
        if (Math.abs(z.mesh.position.x) < 24 && Math.abs(z.mesh.position.z) < 24) {
            z.mesh.position.x = oldZX; z.mesh.position.z = oldZZ;
        }
        // Pohon selalu pejal; dinding bak hanya saat kaki di bawah bibirnya
        if (z.vaultCd > 0) z.vaultCd -= dt;
        const fBlocked = resolveObstacles(z.mesh.position, 3.5, z.groundY);
        // Arah vault mengikuti TARGET (player / Monas)
        const tdx = tx - z.mesh.position.x, tdz = tz - z.mesh.position.z;
        if (fBlocked && z.vaultCd <= 0 &&
            segmentHitsFountain(z.mesh.position.x, z.mesh.position.z, tx, tz)) {
            // Terhalang dinding bak & jalur ke target memang melintasinya -> lompati
            // (vault). Mendarat di ATAS bak, maju ke arah target, dijepit ke dalam
            // lingkaran — kemping di atas bak TIDAK aman.
            const dp = Math.hypot(tdx, tdz) || 1;
            const fwd = Math.max(10, Math.min(dp - 4, 26));
            let lx = z.mesh.position.x + tdx / dp * fwd;
            let lz = z.mesh.position.z + tdz / dp * fwd;
            const fdx = lx - FOUNTAIN.x, fdz = lz - FOUNTAIN.z;
            const fd = Math.hypot(fdx, fdz), rIn = FOUNTAIN.r - 6;
            if (fd > rIn) { lx = FOUNTAIN.x + fdx / fd * rIn; lz = FOUNTAIN.z + fdz / fd * rIn; }
            z.state = 'jumping';
            z.jumpT = 0; z.jumpDur = 0.7;                    // vault lebih gesit dari lompat pagar
            z.sx = z.mesh.position.x; z.sz = z.mesh.position.z;
            z.lx = lx; z.lz = lz;
            z.jumpY0 = z.groundY; z.jumpY1 = FOUNTAIN.topY;
            z.arcH = 12;
            z.vaultCd = 1.5;                                 // cegah loop vault bolak-balik
        } else {
            // Turun dari bak bila sudah keluar dari lingkarannya
            if (z.groundY > 0 &&
                Math.hypot(z.mesh.position.x - FOUNTAIN.x, z.mesh.position.z - FOUNTAIN.z) > FOUNTAIN.r + 2) {
                z.groundY = 0;
                spawnGroundPuff(z.mesh.position.x, z.mesh.position.z, 0x8a7a5e, 10);
            }
            if (z.isModel) z.mesh.position.y = z.baseY + z.groundY;
        }

        // Penggerogot Monas TIDAK mencakar player frame ini (kontrak zombies.js)
        return atkMonas ? {} : { chaseDist: distToEye };
    },

    // Drop dijepit ke dalam pagar (zombie yang mati saat melompat ada di luar)
    clampDropPos(x, z) {
        return [clamp(x, -PARK.hx + 10, PARK.hx - 10), clamp(z, -PARK.hz + 10, PARK.hz - 10)];
    },

    hudStatus() {
        const pct = Math.max(0, Math.ceil(monasHp / CFG.survival.monasMaxHp * 100));
        return `Wave ${wave.num} — Monas ${pct}%`;
    },

    // Monas = penanda pusat (dijepit ke tepi saat jauh — kompas); warnanya
    // mengikuti sisa HP Monas: putih -> kuning -> merah.
    radarLandmarks(plot) {
        const r = monasHp / CFG.survival.monasMaxHp;
        plot(-camera.position.x, -camera.position.z,
            r > 0.6 ? "#bbbbbb" : r > 0.3 ? "#f1c40f" : "#ff4757", 4, true);
    },
};
