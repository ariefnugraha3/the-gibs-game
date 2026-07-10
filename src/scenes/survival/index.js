// SCENE: Survival Mode — pertahankan Monas dari gelombang zombie tanpa akhir.
// Memiliki: dunia taman (world.js), difficulty scaling per wave, spawner
// (zombie melompati pagar), AI kejar + vault bak air mancur, dan seluruh hook
// antarmuka scene (lihat MODULES.md).

import { CFG, CAMP_M } from '../../core/config.js';
import { player, zombies, isGameOver, _v3, godMode } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { rand, clamp } from '../../utils/math.js';
import { updateUI } from '../../core/hud.js';
import { buildHumanZombie, applyVariantTint, CLAW_TIME, reachForScale } from '../../entities/zombies.js';
import { spawnGroundPuff } from '../../entities/effects.js';
import { NADE_R } from '../../entities/grenades.js';
import { gameOver } from '../../core/game.js';
import { showPickup, showStageMsg } from '../../core/dom.js';
import { applyLightPreset, LIGHT_PRESETS, ambLight, hemiLight, dirLight } from '../../world/lighting.js';
import {
    PARK, FENCE_H, FOUNTAIN, ensureParkWorld, getSurvivalNav,
    resolveObstacles, resolveMonas, segmentHitsFountain, groundHeightAt
} from './world.js';
import { navAim, turnToward } from '../../utils/pathfind.js';
import { openShop, closeShop, isShopOpen, requestNextWave } from './shop.js';
import { requestLock, showBlockerIfUnlocked } from '../../core/input.js';
// Co-op LAN (IMPROVEMENT-MULTIPLAYER-PLAN.md): scene ini juga menjadi sisi
// HOST — semua tambahan MP di bawah dijaga `netRole !== 'off'` sehingga jalur
// SP tetap byte-identik. Client memakai scene terpisah (coopClient.js).
import { netRole } from '../../net/index.js';
import { getTargets, damageRemotePlayer, updateDownCam, resetDown } from '../../net/players.js';
import {
    hostInitRound, hostUpdate, hostOnZombieSpawn, hostOnWaveStart,
    hostEnterShopping, hostShoppingUpdate, getReadyInfo, hostOnEvent
} from '../../net/host.js';
import { initRemoteAvatars, updateRemotePlayers } from '../../entities/remotePlayers.js';

// Wave berbasis "clear" (overhaul 2026-07-07): tiap wave punya jatah zombie
// TETAP (toSpawn) yang harus dihabisi. Wave bersih saat semua sudah di-spawn
// DAN lapangan kosong -> fase 'cleared' (hitung mundur 3 dtk) -> 'shopping'
// (shop antar-gelombang) -> tekan Next Wave -> 'fighting' wave berikutnya.
const wave = {
    num: 1, phase: 'fighting',   // 'fighting' | 'cleared' | 'shopping'
    toSpawn: 0,                  // sisa zombie yang belum di-spawn wave ini
    spawnTimer: 0, spawnInterval: 2.5, maxConcurrent: 10,
    clearTimer: 0                // hitung mundur sebelum shop terbuka
};
let navGrid = null;   // nav-grid pathfinder (Monas & pohon = penghalang; bak walkable = vault)
let nextZid = 1;      // id zombie berurutan (identitas jaringan co-op; SP: stempel tak terpakai)

// Objektif Monas (IMPROVEMENT-PLAN #6): sebagian zombie menggerogoti Monas;
// monasHp 0 = kalah ("THE MONUMENT HAS FALLEN"). monasMaxHp scene-local (bukan
// CFG langsung) supaya item shop 'Strengthen Monas' bisa menaikkannya per-run
// tanpa memutasi CFG (dipulihkan dari CFG saat enter()).
let monasHp = 50;
let monasMaxHp = 50;
let monasStage = 0;    // tingkat "Strengthen Monas" (0 = base; naik per pembelian, plafon = jml tier)
let monasWarnCd = 0;   // jeda peringatan feed agar tidak spam tiap gigitan

function damageMonas(n) {
    if (godMode) return;   // cheat: Monas kebal (HP tak berkurang, tak ada peringatan/kalah)
    monasHp -= n;
    updateUI();
    if (monasWarnCd <= 0) {
        monasWarnCd = 6;
        const crit = monasHp <= monasMaxHp * 0.3;
        showPickup(crit ? 'THE MONUMENT IS CRITICAL!' : 'The Monument is under attack!',
            crit ? '#ff4757' : '#ffb84d');
    }
    if (monasHp <= 0) gameOver(false, 'THE MONUMENT HAS FALLEN');
}

// --- Item shop Monas (dipanggil shop.js.shopPurchase) ---
// Heal Monas: pulihkan 25% dari MAX HP (dijepit ke max). Return alasan bila
// sudah penuh (skor tak dipotong), null bila berhasil.
export function healMonas() {
    if (monasHp >= monasMaxHp) return 'The Monument is already at full HP';
    monasHp = Math.min(monasMaxHp, monasHp + Math.round(monasMaxHp * 0.25));
    updateUI();
    return null;
}
// Strengthen Monas: naikkan MAX HP ke TINGKAT berikutnya (tangga tetap
// CFG.survival.strengthenMonasStages, mis. 3000 -> 4500 -> 6000 = plafon).
// Menaikkan HP sekarang sebesar kenaikan max (memperkuat = menambah HP juga).
// Ditolak (skor tak dipotong) bila sudah di tingkat tertinggi.
export function strengthenMonas() {
    const tiers = CFG.survival.strengthenMonasStages;
    if (monasStage >= tiers.length) return 'The Monument is already fully reinforced';
    const newMax = tiers[monasStage];
    monasHp += newMax - monasMaxHp;
    monasMaxHp = newMax;
    monasStage++;
    updateUI();
    return null;
}
export const getMonasHp = () => monasHp;
export const getMonasMaxHp = () => monasMaxHp;
export const isMonasFullyStrengthened = () => monasStage >= CFG.survival.strengthenMonasStages.length;

// Info wave utk snapshot host co-op (net/host.js). left = sisa zombie wave ini.
export function getWaveInfo() {
    return {
        num: wave.num, phase: wave.phase,
        left: wave.toSpawn + zombies.length, timer: wave.clearTimer
    };
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
    hostOnEvent(EVT.type, EVT.dur);   // co-op host: client memutar efek yang sama (no-op SP)
}

function endEvent() {
    EVT.type = null;
    applyLightPreset(scene, 'outdoor');   // pulihkan fog + cahaya persis preset
    hostOnEvent(null, 0);                 // co-op host: hentikan efek di client (no-op SP/selain host)
}

function spawnZombie() {
    // Dipanggil hanya oleh updateMode saat fase 'fighting' (jatah & cap sudah
    // dicek di sana) — tak perlu guard pause/gameover/cap di sini.
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

    // HP naik pelan per wave TAPI dijepit maksimal zombieHpMaxMul × base (+50%).
    const hp = Math.min(SV.zombieHpBase * SV.zombieHpMaxMul,
        SV.zombieHpBase + Math.floor((wave.num - 1) / 2) * SV.zombieHpPerTwoWaves);
    // Speed penuh = base × scale (scale 1 = kecepatan penuh, seperti campaign),
    // DIKALI faktor wave: mulai zombieSpeedWaveMin (60%) di wave 1, +Step (2%)
    // tiap wave, dijepit zombieSpeedWaveMax (100%). Wave awal lebih lambat, mentok
    // di kecepatan penuh (~wave 21). Variasi acak & speedMul varian tetap dikali.
    const waveMul = Math.min(SV.zombieSpeedWaveMax,
        SV.zombieSpeedWaveMin + (wave.num - 1) * SV.zombieSpeedWaveStep);
    const speed = (SV.zombieSpeedBase + Math.random() * SV.zombieSpeedRand) * SV.zombieSpeedScale * waveMul;

    // --- Varian perilaku (IMPROVEMENT-PLAN #1): peluang naik seiring wave ---
    let kind = 'walker';
    const roll = Math.random();
    // Peluang varian NAIK per wave (dulu brute/exploder DATAR) supaya komposisi
    // musuh berevolusi: walker awal -> runner-heavy tengah -> brute/exploder akhir.
    // Sama pola dgn runner (base + perWave, dijepit Max), dihitung dari FromWave.
    const eC = wave.num >= SV.exploderFromWave ? Math.min(SV.exploderChanceMax,
        SV.exploderChance + (wave.num - SV.exploderFromWave) * SV.exploderChancePerWave) : 0;
    const bC = wave.num >= SV.bruteFromWave ? Math.min(SV.bruteChanceMax,
        SV.bruteChance + (wave.num - SV.bruteFromWave) * SV.bruteChancePerWave) : 0;
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
    applyVariantTint(zMesh, kind);   // pembeda skin varian (helper bersama survival+campaign)
    scene.add(zMesh);

    // state 'jumping' -> melompati pagar; lalu 'chasing' -> kejar target.
    // Busur lompat digeneralisasi (jumpY0->jumpY1 + arcH) agar bisa dipakai ulang
    // untuk vault dinding bak air mancur; groundY = lantai pijakan saat ini.
    // target 'monas' (peluang CFG) = menggerogoti Monas kecuali player mendekat.
    zombies.push({
        id: nextZid++,   // identitas jaringan co-op (indeks array tidak stabil)
        mesh: zMesh, hp: vHp, maxHp: vHp, speed: vSpeed, rig: built2.rig, isModel: true,
        baseY, phase: Math.random() * 6.28,
        state: 'jumping', jumpT: 0, jumpDur: 1.1,
        sx: startX, sz: startZ, lx: landX, lz: landZ,
        jumpY0: 0, jumpY1: 0, arcH: FENCE_H + 14, groundY: 0, vaultCd: 0,
        attackCd: 0, clawT: 0, clawSide: 1, moving: true,   // sistem serangan cakar
        kind, scl, reachMul: reachForScale(scl),   // badan besar = reach ikut membesar
        clawDmg: V ? V.clawDamage : CFG.zombie.clawDamage,
        monasCommitted: false, monasLocked: false   // komit Monas: aggro 5 m / terkunci setelah gigitan pertama
        // Target ditentukan per-frame di zombieAI (Monas default / kejar player
        // bila dalam radius aggro) — tidak lagi diundi saat spawn.
    });
    hostOnZombieSpawn(zombies[zombies.length - 1]);   // co-op host: siarkan zspawn (no-op SP)
}

// Mulai wave ke-n: set jatah zombie (naik per wave) + cadence spawn + cap
// lapangan, picu event lingkungan bila kelipatan eventEveryWaves, umumkan wave.
function startWave(n) {
    const SV = CFG.survival;
    wave.num = n;
    wave.phase = 'fighting';
    wave.toSpawn = SV.zombiesPerWaveBase + (n - 1) * SV.zombiesPerWaveStep;
    wave.spawnTimer = 0;
    wave.spawnInterval = Math.max(SV.spawnIntervalMin,
        SV.spawnIntervalBase - (n - 1) * SV.spawnIntervalStep);
    wave.maxConcurrent = Math.min(SV.maxZombiesCap,
        SV.maxZombiesBase + (n - 1) * SV.maxZombiesStep);
    if (SV.eventEveryWaves > 0 && n % SV.eventEveryWaves === 0 && !EVT.type) startEvent();
    showStageMsg(`WAVE ${n}`, 1800);
    hostOnWaveStart(n);   // co-op host: hidupkan kembali semua pemain + siarkan wavestart (no-op SP)
    updateUI();
}

// Tombol "Start Next Wave" (klik DOM di shop.js atau SPACE): tutup shop, mulai
// gelombang berikutnya, lalu KUNCI ULANG pointer -> resume gameplay
// (setPaused(false) lewat pointerlockchange di input.js). Dipanggil dari gesture
// pengguna (klik / keydown) sehingga requestPointerLock valid.
export function startNextWave() {
    closeShop();
    startWave(wave.num + 1);
    requestLock();
    // Co-op: lock yang dipicu remote (ready pemain lain / timer) bisa ditolak
    // browser -> beri blocker klik-untuk-lanjut (no-op bila lock berhasil).
    if (netRole !== 'off') showBlockerIfUnlocked();
}

// Hook tombol shop (core/input.js men-delegasi keydown ke sini saat shop modal
// terbuka). Hanya SPACE/Enter yang bertindak (Start Next Wave); PEMBELIAN item
// kini lewat KLIK (shop.js). Return true = dikonsumsi.
function shopKey(key) {
    if (!isShopOpen()) return false;
    // SPACE/Enter = Start Next Wave -> tampilkan prompt "Are you ready?"; tekan
    // lagi = konfirmasi Yes (requestNextWave menangani dua-langkah itu).
    if (key === ' ' || key === 'enter') { requestNextWave(); return true; }
    return false;
}

export const survivalScene = {
    id: 'survival',

    enter() {
        ensureParkWorld();
        navGrid = getSurvivalNav();
        // Reset objektif Monas (max & hp dari CFG — batalkan Strengthen run lalu)
        // + event + shop + posisi awal, lalu mulai wave 1
        monasMaxHp = CFG.survival.monasMaxHp;
        monasHp = monasMaxHp;
        monasStage = 0;      // batalkan tingkat Strengthen run sebelumnya
        monasWarnCd = 0;
        nextZid = 1;
        endEvent();          // pulihkan fog/cahaya bila mati di tengah event
        closeShop();
        // Co-op host: avatar rekan + reset ready/cadence/status tumbang
        if (netRole !== 'off') {
            initRemoteAvatars();
            resetDown();
            hostInitRound();
        }
        camera.position.set(0, CFG.player.eyeHeight, 120);
        camera.quaternion.set(0, 0, 0, 1);
        startWave(1);
    },

    // Co-op: dunia bersama TIDAK bisa di-pause (ESC = menu lokal di atas dunia
    // berjalan; shop = intermission ready-check). SP (netRole 'off') -> true =
    // perilaku pause lama persis. (input.js membaca hook ini.)
    pausable: () => netRole === 'off',

    // Hook shop modal: SPACE/Enter = Next Wave (input.js men-delegasi keydown ke
    // shopKey); shopActive = predikat "shop terbuka" yang dipakai input.js untuk
    // unlock->pause-tanpa-blocker & menelan tombol gameplay. Pembelian item lewat
    // KLIK di shop.js.
    shopKey,
    shopActive: isShopOpen,

    // --- Mesin fase wave (fighting -> cleared -> shopping) + spawner + event ---
    updateMode(dt) {
        if (monasWarnCd > 0) monasWarnCd -= dt;

        // Co-op host: konsumsi pesan client + snapshot 15 Hz + avatar rekan +
        // kamera spectator saat tumbang. Diletakkan di updateMode (bukan
        // updateGame) supaya kontrak urutan blok bersama tidak berubah.
        if (netRole !== 'off') {
            hostUpdate(dt);
            updateRemotePlayers(dt);
            updateDownCam(dt);
        }

        if (wave.phase === 'fighting') {
            // Spawn sampai jatah wave habis, dibatasi cap zombie di lapangan
            wave.spawnTimer += dt;
            if (wave.toSpawn > 0 && wave.spawnTimer >= wave.spawnInterval
                && zombies.length < wave.maxConcurrent) {
                wave.spawnTimer = 0;
                spawnZombie();
                wave.toSpawn--;
                updateUI();   // penghitung "N left" ikut segar
            }
            // Wave bersih: semua sudah di-spawn DAN tak ada zombie tersisa
            if (wave.toSpawn === 0 && zombies.length === 0) {
                wave.phase = 'cleared';
                wave.clearTimer = CFG.survival.shopCountdownSec;
                showStageMsg('WAVE CLEARED!', 3200);
                updateUI();
            }
        } else if (wave.phase === 'cleared') {
            // Jeda "Wave Cleared" -> buka shop setelah hitung mundur habis
            wave.clearTimer -= dt;
            updateUI();   // hudStatus menampilkan hitung mundur
            if (wave.clearTimer <= 0) {
                wave.phase = 'shopping';
                openShop();
                hostEnterShopping();   // co-op host: mulai timer batas + reset ready (no-op SP)
            }
        } else if (netRole === 'host') {
            // 'shopping' co-op: dunia TIDAK di-pause — hitung mundur batas
            // shop + ready-check berjalan live (host.js); habis/semua ready ->
            // startNextWave.
            hostShoppingUpdate(dt);
        } else {
            // 'shopping' SP: shop = MODAL & game DI-PAUSE, jadi updateMode normalnya
            // tak berjalan lagi sampai Start Next Wave (klik/SPACE ->
            // startNextWave -> requestLock -> resume). Guard defensif: bila entah
            // bagaimana kita di fase ini tanpa shop terbuka, buka lagi.
            if (!isShopOpen()) openShop();
        }

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
        // Monas pejal: dorong keluar PER-SUMBU supaya player MENYUSUR sisinya
        // (tidak menempel/macet — sama seperti perbaikan dinding campaign).
        resolveMonas(pos, oldX, oldZ, player.radius);
        // Penghalang pejal: pohon & dinding bak air mancur (dorong keluar horizontal)
        resolveObstacles(pos, player.radius, feetY);
    },

    groundHeight: groundHeightAt,

    // Peluru mati HANYA di badan Monas yang sebenarnya — silhouette bertingkat:
    // dasar lebar (44) di bawah, menyempit ke obelisk tipis (~15) di ketinggian
    // mata. Jadi peluru LEWAT di ruang kosong samping obelisk & mengenai zombie
    // di baliknya (dulu terhalang tembok tak terlihat selebar dasar).
    bulletBlocked(b) {
        const y = b.mesh.position.y;
        if (y < 0 || y > 64) return false;                   // di atas obelisk -> lewat
        const h = y < 2 ? 22 : y < 5 ? 20 : y < 8 ? 15 : 8;  // undakan/teras/pelataran/obelisk
        return Math.abs(b.mesh.position.x) < h && Math.abs(b.mesh.position.z) < h;
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

        // Target terdekat yang HIDUP: SP = kamera saja (getTargets satu elemen,
        // perilaku lama byte-identik); co-op host = kamera + pemain roster hidup.
        const targets = getTargets();
        let tgt = null, distToEye = Infinity;
        for (let ti = 0; ti < targets.length; ti++) {
            const t = targets[ti];
            if (!t.alive) continue;
            const d = Math.hypot(t.x - z.mesh.position.x, t.z - z.mesh.position.z);
            if (d < distToEye) { distToEye = d; tgt = t; }
        }

        if (z.state === 'jumping') {
            // Busur lompat (pagar / vault bak): lerp horizontal + lerp lantai + busur sinus.
            z.jumpT += dt / z.jumpDur;
            const t = Math.min(1, z.jumpT);
            z.mesh.position.x = z.sx + (z.lx - z.sx) * t;
            z.mesh.position.z = z.sz + (z.lz - z.sz) * t;
            z.mesh.position.y = z.baseY + z.jumpY0 + (z.jumpY1 - z.jumpY0) * t
                + Math.sin(Math.PI * t) * z.arcH;
            z.mesh.lookAt(tgt ? tgt.x : camera.position.x, z.mesh.position.y,
                tgt ? tgt.z : camera.position.z);
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

        // Kejar TARGET (grounded): pemain terdekat, atau Monas. PRIORITAS MONAS —
        // SEMUA zombie menyerang Monas secara default; hanya beralih mengejar
        // pemain bila pemain TERDEKAT berada dalam radius aggro (playerAggroMeters
        // × 7 unit) dari zombie; begitu pemain > radius, kembali menyerang Monas.
        // Pathfinder: direct = garis lurus bebas (kejar langsung — termasuk
        // melintasi bak air mancur, yang memicu vault); waypoint = memutari
        // Monas/pohon. Gerak memakai heading berlaju-putar-terbatas
        // (turnToward) -> belokan melengkung alami, tidak patah-patah.
        // Radius aggro efektif (meter -> unit). Zombie yang sudah BERKOMITMEN ke
        // Monas (pernah memukulnya) lebih sulit dialihkan: radiusnya menyusut ke
        // monasLockAggroMeters (5 m). Sebagian (monasLockChance) malah TERKUNCI
        // penuh (radius 0) -> tak pernah mengejar pemain. Zombie biasa memakai
        // playerAggroMeters (15 m).
        const aggroM = z.monasLocked ? 0
            : z.monasCommitted ? CFG.survival.monasLockAggroMeters
                : CFG.survival.playerAggroMeters;
        // Semua pemain tumbang (co-op) -> distToEye Infinity -> serang Monas.
        const atkMonas = monasHp > 0 && distToEye > aggroM * CAMP_M;
        // Titik tuju: pemain terdekat, atau titik terdekat di tepi AABB Monas (24)
        const tx = atkMonas ? clamp(z.mesh.position.x, -24, 24) : tgt.x;
        const tz = atkMonas ? clamp(z.mesh.position.z, -24, 24) : tgt.z;
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
                // Gigitan PERTAMA ke Monas -> zombie "berkomitmen": radius aggro
                // menyusut (5 m) dan sekali roll monasLockChance ia TERKUNCI penuh
                // (tak akan mengejar player lagi). Diundi hanya sekali.
                if (!z.monasCommitted) {
                    z.monasCommitted = true;
                    z.monasLocked = Math.random() < CFG.survival.monasLockChance;
                }
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
        if (atkMonas) return {};

        // Target = pemain REMOTE (co-op host): cakar ditangani DI SINI (pola
        // penggerogot Monas — return {} menjaga zombies.js tidak melukai pemain
        // lokal). Jangkauan & cooldown sama persis dgn blok cakar zombies.js;
        // damage dikirim sbg event `dmg` (hp pemain client-authoritative).
        if (tgt && !tgt.local) {
            if (z.attackCd > 0) z.attackCd -= dt;
            if (distToEye < player.radius + CFG.zombie.clawRange * (z.reachMul || 1)
                && z.attackCd <= 0) {
                z.attackCd = CFG.zombie.clawCooldownSec;
                z.clawT = CLAW_TIME;
                z.clawSide = -z.clawSide;
                damageRemotePlayer(tgt.id,
                    z.clawDmg != null ? z.clawDmg : CFG.zombie.clawDamage,
                    z.mesh.position.x, z.mesh.position.z);
            }
            return {};
        }
        return { chaseDist: distToEye };
    },

    // Drop dijepit ke dalam pagar (zombie yang mati saat melompat ada di luar)
    clampDropPos(x, z) {
        return [clamp(x, -PARK.hx + 10, PARK.hx - 10), clamp(z, -PARK.hz + 10, PARK.hz - 10)];
    },

    hudStatus() {
        const pct = Math.max(0, Math.ceil(monasHp / monasMaxHp * 100));
        if (wave.phase === 'cleared')
            return `WAVE ${wave.num} CLEARED — Next wave in ${Math.max(1, Math.ceil(wave.clearTimer))}...`;
        if (wave.phase === 'shopping') {
            if (netRole === 'host') {
                const ri = getReadyInfo();
                return `WAVE ${wave.num} CLEARED — Ready ${ri.ready}/${ri.total} · starts in ${ri.timeLeft}s`;
            }
            return `WAVE ${wave.num} CLEARED — Field Shop open`;
        }
        const left = wave.toSpawn + zombies.length;   // sisa zombie wave ini
        return `Wave ${wave.num} — ${left} left · Monas ${pct}%`;
    },

    // Monas = penanda pusat (dijepit ke tepi saat jauh — kompas); warnanya
    // mengikuti sisa HP Monas: putih -> kuning -> merah.
    radarLandmarks(plot) {
        const r = monasHp / monasMaxHp;
        plot(-camera.position.x, -camera.position.z,
            r > 0.6 ? "#bbbbbb" : r > 0.3 ? "#f1c40f" : "#ff4757", 4, true);
    },
};
