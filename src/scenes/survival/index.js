// SCENE: Survival Mode — pertahankan Monas dari gelombang zombie tanpa akhir.
// Memiliki: dunia taman (world.js), difficulty scaling per wave, spawner
// (zombie melompati pagar), AI kejar + vault bak air mancur, dan seluruh hook
// antarmuka scene (lihat MODULES.md).

import { CFG } from '../../core/config.js';
import { player, zombies, isPaused, isGameOver, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { rand, clamp } from '../../utils/math.js';
import { updateUI } from '../../core/hud.js';
import { buildHumanZombie } from '../../entities/zombies.js';
import { spawnGroundPuff } from '../../entities/effects.js';
import { NADE_R } from '../../entities/grenades.js';
import {
    PARK, FENCE_H, FOUNTAIN, buildSurvivalWorld, buildSurvivalNav,
    resolveObstacles, segmentHitsFountain, groundHeightAt
} from './world.js';
import { navAim, turnToward } from '../../utils/pathfind.js';

// Difficulty / wave
const wave = { num: 1, time: 0, spawnTimer: 0, spawnInterval: 4, maxZombies: 10 };
let built = false;
let navGrid = null;   // nav-grid pathfinder (Monas & pohon = penghalang)

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

    // Zombie manusia prosedural (warga korban alien) — varian skin acak per spawn.
    const built2 = buildHumanZombie();
    const zMesh = built2.group;
    const baseY = 0;                           // origin grup di kaki (y saat menapak tanah)
    zMesh.position.set(startX, baseY, startZ);
    scene.add(zMesh);

    // state 'jumping' -> melompati pagar; lalu 'chasing' -> kejar player seperti biasa.
    // Busur lompat digeneralisasi (jumpY0->jumpY1 + arcH) agar bisa dipakai ulang
    // untuk vault dinding bak air mancur; groundY = lantai pijakan saat ini.
    zombies.push({
        mesh: zMesh, hp, maxHp: hp, speed, rig: built2.rig, isModel: true, baseY, phase: Math.random() * 6.28,
        state: 'jumping', jumpT: 0, jumpDur: 1.1,
        sx: startX, sz: startZ, lx: landX, lz: landZ,
        jumpY0: 0, jumpY1: 0, arcH: FENCE_H + 14, groundY: 0, vaultCd: 0,
        attackCd: 0, clawT: 0, clawSide: 1, moving: true   // sistem serangan cakar
    });
}

export const survivalScene = {
    id: 'survival',

    enter() {
        if (!built) { buildSurvivalWorld(); navGrid = buildSurvivalNav(); built = true; }
        // Reset wave + posisi awal (dipakai start pertama & restart)
        wave.num = 1; wave.time = 0; wave.spawnTimer = 0;
        wave.spawnInterval = CFG.survival.spawnIntervalBase;
        wave.maxZombies = CFG.survival.maxZombiesBase;
        camera.position.set(0, CFG.player.eyeHeight, 120);
        camera.quaternion.set(0, 0, 0, 1);
    },

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
            updateUI();
        }
        wave.spawnTimer += dt;
        if (wave.spawnTimer >= wave.spawnInterval) {
            wave.spawnTimer = 0;
            spawnZombie();
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

        // Kejar player (grounded); berhenti tepat di jangkauan cakar.
        // Pathfinder: direct = garis lurus bebas (kejar langsung — termasuk
        // melintasi bak air mancur, yang memicu vault); waypoint = memutari
        // Monas/pohon. Gerak memakai heading berlaju-putar-terbatas
        // (turnToward) -> belokan melengkung alami, tidak patah-patah.
        const dx = camera.position.x - z.mesh.position.x;
        const dz = camera.position.z - z.mesh.position.z;
        const distToEye = Math.hypot(dx, dz);
        const aim = navAim(z, navGrid, camera.position.x, camera.position.z, dt, step);
        z.moving = !aim.direct || distToEye > player.radius + CFG.zombie.stopRange;
        if (z.moving) {
            const ang = turnToward(z,
                Math.atan2(aim.z - z.mesh.position.z, aim.x - z.mesh.position.x), dt);
            z.mesh.position.x += Math.cos(ang) * z.speed * step;
            z.mesh.position.z += Math.sin(ang) * z.speed * step;
            z.mesh.lookAt(z.mesh.position.x + Math.cos(ang) * 10, z.mesh.position.y,
                z.mesh.position.z + Math.sin(ang) * 10);
        } else {
            z.mesh.lookAt(camera.position.x, z.mesh.position.y, camera.position.z);
        }

        // Tabrakan dgn Monas -> mundur
        if (Math.abs(z.mesh.position.x) < 24 && Math.abs(z.mesh.position.z) < 24) {
            z.mesh.position.x = oldZX; z.mesh.position.z = oldZZ;
        }
        // Pohon selalu pejal; dinding bak hanya saat kaki di bawah bibirnya
        if (z.vaultCd > 0) z.vaultCd -= dt;
        const fBlocked = resolveObstacles(z.mesh.position, 3.5, z.groundY);
        if (fBlocked && z.vaultCd <= 0 &&
            segmentHitsFountain(z.mesh.position.x, z.mesh.position.z, camera.position.x, camera.position.z)) {
            // Terhalang dinding bak & jalur ke player memang melintasinya -> lompati
            // (vault). Mendarat di ATAS bak, maju ke arah player, dijepit ke dalam
            // lingkaran — kemping di atas bak TIDAK aman.
            const dp = Math.hypot(dx, dz) || 1;
            const fwd = Math.max(10, Math.min(dp - 4, 26));
            let lx = z.mesh.position.x + dx / dp * fwd;
            let lz = z.mesh.position.z + dz / dp * fwd;
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

        return { chaseDist: distToEye };
    },

    // Drop dijepit ke dalam pagar (zombie yang mati saat melompat ada di luar)
    clampDropPos(x, z) {
        return [clamp(x, -PARK.hx + 10, PARK.hx - 10), clamp(z, -PARK.hz + 10, PARK.hz - 10)];
    },

    hudStatus() { return `Wave ${wave.num}`; },

    // Monas = titik abu di pusat dunia (dijepit ke tepi saat jauh — kompas)
    radarLandmarks(plot) {
        plot(-camera.position.x, -camera.position.z, "#bbbbbb", 4, true);
    },
};
