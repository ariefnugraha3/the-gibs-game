// SCENE: Survival Mode — pertahankan Monas dari gelombang robot tanpa akhir.
// Memiliki: dunia taman (world.js), difficulty scaling per wave, spawner
// (robot melompati pagar), AI kejar + vault bak air mancur, dan seluruh hook
// antarmuka scene (lihat MODULES.md).

import { CFG, CAMP_M } from '../../core/config.js';
import { player, robots, _v3, godMode } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { rand, clamp } from '../../utils/math.js';
import { updateUI } from '../../core/hud.js';
import { buildRobotMesh, reachForScale, disposeRobot, fireRobotBullet } from '../../entities/robots.js';
import { spawnGroundPuff } from '../../entities/effects.js';
import { NADE_R } from '../../entities/grenades.js';
import { gameOver } from '../../core/game.js';
import { showPickup, showStageMsg } from '../../core/dom.js';
import { applyLightPreset } from '../../world/lighting.js';
import {
    PARK, FENCE_H, FOUNTAIN, ensureParkWorld, getSurvivalNav,
    resolveObstacles, resolveMonas, segmentHitsFountain, groundHeightAt,
    setFogCanopy, driftFogCanopy,
    startMonasCollapse, updateMonasCollapse, resetMonasCollapse, isMonasCollapsing
} from './world.js';
import { navAim, turnToward } from '../../utils/pathfind.js';
import { openShop, closeShop, isShopOpen, requestNextWave } from './shop.js';
import { requestLock } from '../../core/input.js';

// Wave berbasis "clear" (overhaul 2026-07-07): tiap wave punya jatah robot
// TETAP (toSpawn) yang harus dihabisi. Wave bersih saat semua sudah di-spawn
// DAN lapangan kosong -> fase 'cleared' (hitung mundur 3 dtk) -> 'shopping'
// (shop antar-gelombang) -> tekan Next Wave -> 'fighting' wave berikutnya.
const wave = {
    num: 1, phase: 'fighting',   // 'fighting' | 'cleared' | 'shopping'
    toSpawn: 0,                  // sisa robot yang belum di-spawn wave ini
    spawnTimer: 0, spawnInterval: 2.5, maxConcurrent: 10,
    clearTimer: 0                // hitung mundur sebelum shop terbuka
};
let navGrid = null;   // nav-grid pathfinder (Monas & pohon = penghalang; bak walkable = vault)

// Objektif Monas (IMPROVEMENT-PLAN #6): sebagian robot menggerogoti Monas;
// monasHp 0 = kalah ("THE MONUMENT HAS FALLEN"). monasMaxHp scene-local (bukan
// CFG langsung) supaya item shop 'Strengthen Monas' bisa menaikkannya per-run
// tanpa memutasi CFG (dipulihkan dari CFG saat enter()).
let monasHp = 50;
let monasMaxHp = 50;
let monasStage = 0;    // tingkat "Strengthen Monas" (0 = base; naik per pembelian, plafon = jml tier)
let monasWarnCd = 0;   // jeda peringatan feed agar tidak spam tiap gigitan
let monasFalling = false;   // true = animasi runtuh Monas sedang berjalan (tunda game over)

function damageMonas(n) {
    if (godMode) return;   // cheat: Monas kebal (HP tak berkurang, tak ada peringatan/kalah)
    if (monasFalling) return;   // sudah runtuh: abaikan damage lanjutan selama animasi
    monasHp -= n;
    updateUI();
    if (monasHp <= 0) {
        // HP habis: JANGAN langsung game over — mainkan animasi Monas TUMBANG
        // (world.js), lalu updateMode memanggil gameOver saat animasi selesai.
        monasHp = 0;
        monasFalling = true;
        startMonasCollapse();
        showStageMsg('THE MONUMENT IS FALLING!', 3200);
        showPickup('THE MONUMENT HAS FALLEN', '#ff4757');
        return;
    }
    if (monasWarnCd <= 0) {
        monasWarnCd = 6;
        const crit = monasHp <= monasMaxHp * 0.3;
        showPickup(crit ? 'THE MONUMENT IS CRITICAL!' : 'The Monument is under attack!',
            crit ? '#ff4757' : '#ffb84d');
    }
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

// Event wave = KABUT MONAS (satu-satunya event; fog jarak & blackout lama dibuang
// 2026-07-11). Kabut abu-abu TEBAL berbasis-posisi: kanopi overhead (world.js)
// menutupi hampir seluruh arena kecuali lubang bersih `monasFogClearMeters` di
// sekitar Monas — sesuatu yang scene.fog (berbasis jarak-ke-kamera) tak bisa.
// Peluang muncul: mulai eligible di `monasFogFromWave`, `monasFogChanceBase` +
// `monasFogChancePerWave` per wave berikutnya (di-roll di startWave).
const EVT = { type: null, left: 0, dur: 1 };

function startMonasFog() {
    EVT.type = 'monasfog';
    EVT.dur = CFG.survival.monasFogDurationSec;
    EVT.left = EVT.dur;
    showPickup('A thick grey fog rolls in — stay near the Monument!', '#c2c8ce');
}

function endEvent() {
    EVT.type = null;
    setFogCanopy(0);                      // matikan kanopi kabut
    applyLightPreset(scene, 'outdoor');   // pulihkan fog jarak + cahaya persis preset (juga dipakai enter)
}

function spawnRobot() {
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

    // --- KELAS robot (C/B/A, 2026-07-12): distribusi berevolusi per wave.
    // C = melee dasar (default); B = penembak, muncul sejak classBFromWave; A =
    // penembak berat, sejak classAFromWave. Peluang naik per wave (base + perWave,
    // dijepit Max). HP/speed/attack per kelas TETAP (dari CFG.robot.classes);
    // kecepatan dikali waveMul agar wave awal tetap lebih lambat. ---
    const waveMul = Math.min(SV.robotSpeedWaveMax,
        SV.robotSpeedWaveMin + (wave.num - 1) * SV.robotSpeedWaveStep);
    const aC = wave.num >= SV.classAFromWave ? Math.min(SV.classAChanceMax,
        SV.classAChance + (wave.num - SV.classAFromWave) * SV.classAChancePerWave) : 0;
    const bC = wave.num >= SV.classBFromWave ? Math.min(SV.classBChanceMax,
        SV.classBChance + (wave.num - SV.classBFromWave) * SV.classBChancePerWave) : 0;
    const roll = Math.random();
    const cls = roll < aC ? 'A' : roll < aC + bC ? 'B' : 'C';
    const C = CFG.robot.classes[cls];
    const hp = C.hp;
    const speed = C.speed * waveMul;
    const scl = C.scale;

    // Rangka robot prosedural per kelas (pelat armor & visor berwarna kelas).
    const built2 = buildRobotMesh(cls);
    const zMesh = built2.group;
    const baseY = 0;                           // origin grup di kaki (y saat menapak tanah)
    zMesh.position.set(startX, baseY, startZ);
    if (scl !== 1) zMesh.scale.setScalar(scl);
    scene.add(zMesh);

    // state 'jumping' -> melompati pagar; lalu 'chasing' -> kejar target.
    // Busur lompat digeneralisasi (jumpY0->jumpY1 + arcH) agar bisa dipakai ulang
    // untuk vault dinding bak air mancur; groundY = lantai pijakan saat ini.
    // target 'monas' (peluang CFG) = menggerogoti Monas kecuali player mendekat.
    robots.push({
        mesh: zMesh, hp, maxHp: hp, speed, rig: built2.rig, isModel: true,
        baseY, phase: Math.random() * 6.28,
        state: 'jumping', jumpT: 0, jumpDur: 1.1,
        sx: startX, sz: startZ, lx: landX, lz: landZ,
        jumpY0: 0, jumpY1: 0, arcH: FENCE_H + 14, groundY: 0, vaultCd: 0,
        attackCd: 0, clawT: 0, windT: 0, clawSide: 1, moving: true,   // sistem serangan cakar (windT = ancang-ancang)
        kind: cls, scl, reachMul: reachForScale(scl),   // badan besar = reach ikut membesar
        armor: C.armor, attack: C.attack, clawDmg: C.attack,
        ranged: C.ranged, fireDelaySec: C.fireDelaySec || 0, bulletSpeed: C.bulletSpeed || 0,
        range: (C.rangeMeters || 0) * CAMP_M,   // radius tembak (m -> unit; 0 = melee)
        fireCd: rand(0, C.fireDelaySec || 0),   // stagger tembakan awal antar robot
        monasCommitted: false, monasLocked: false   // komit Monas: aggro 5 m / terkunci setelah gigitan pertama
        // Target ditentukan per-frame di robotAI (Monas default / kejar player
        // bila dalam radius aggro) — tidak lagi diundi saat spawn.
    });
}

// Mulai wave ke-n: set jatah robot (naik per wave) + cadence spawn + cap
// lapangan, roll peluang event kabut Monas (sejak monasFogFromWave), umumkan wave.
function startWave(n) {
    const SV = CFG.survival;
    wave.num = n;
    wave.phase = 'fighting';
    wave.toSpawn = SV.robotsPerWaveBase + (n - 1) * SV.robotsPerWaveStep;
    wave.spawnTimer = 0;
    wave.spawnInterval = Math.max(SV.spawnIntervalMin,
        SV.spawnIntervalBase - (n - 1) * SV.spawnIntervalStep);
    wave.maxConcurrent = Math.min(SV.maxRobotsCap,
        SV.maxRobotsBase + (n - 1) * SV.maxRobotsStep);
    // Kabut Monas: eligible mulai wave `monasFogFromWave` (setelah wave 3);
    // peluang = base + perWave·(n − fromWave), naik tiap wave, dijepit di ChanceMax.
    if (n >= SV.monasFogFromWave && !EVT.type) {
        const chance = Math.min(SV.monasFogChanceMax,
            SV.monasFogChanceBase + (n - SV.monasFogFromWave) * SV.monasFogChancePerWave);
        if (Math.random() < chance) startMonasFog();
    }
    showStageMsg(`WAVE ${n}`, 1800);
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
        monasFalling = false;
        resetMonasCollapse();   // tegakkan kembali Monas (world persist antar-run)
        endEvent();          // pulihkan fog/cahaya bila mati di tengah event
        closeShop();
        camera.position.set(0, CFG.player.eyeHeight, 120);
        camera.quaternion.set(0, 0, 0, 1);
        startWave(1);
    },

    // Hook shop modal: SPACE/Enter = Next Wave (input.js men-delegasi keydown ke
    // shopKey); shopActive = predikat "shop terbuka" yang dipakai input.js untuk
    // unlock->pause-tanpa-blocker & menelan tombol gameplay. Pembelian item lewat
    // KLIK di shop.js.
    shopKey,
    shopActive: isShopOpen,

    // Selebrasi robot (2026-07-13): saat Monas runtuh (monasHp 0), robots.js
    // menghentikan serangan & membuat SEMUA robot bersorak — sama seperti saat
    // player mati (celebrateRobot). True selama animasi runtuhnya Monas.
    robotsCelebrate: () => monasFalling,

    // Cheat (cheatConsole "skip-to-wave-N"): LOMPAT LANGSUNG ke wave n. Buang
    // semua robot di lapangan tanpa skor/gore (dispose senyap seperti resetGame),
    // akhiri event yang sedang jalan + tutup shop bila terbuka, lalu startWave(n)
    // — seluruh formula naik-wave (jumlah, cap, interval, peluang kabut) memakai
    // n, jadi kesulitan sesuai wave itu. Balikan angka wave (untuk feedback konsol).
    cheatSkipToWave(n) {
        n = Math.max(1, Math.floor(n));
        robots.forEach(z => { disposeRobot(z); scene.remove(z.mesh); });
        robots.length = 0;
        endEvent();      // pulihkan kabut/cahaya bila event sedang berjalan
        closeShop();     // jaga-jaga bila entah bagaimana terpanggil saat shop
        startWave(n);    // formula naik-wave sepenuhnya dari n
        return n;
    },

    // --- Mesin fase wave (fighting -> cleared -> shopping) + spawner + event ---
    updateMode(dt) {
        if (monasWarnCd > 0) monasWarnCd -= dt;

        // Monas runtuh: mainkan animasi tumbang (world tetap hidup di belakang);
        // saat animasi selesai -> GAME OVER. Lewati mesin wave selama runtuh.
        if (monasFalling) {
            if (updateMonasCollapse(dt)) gameOver(false, 'THE MONUMENT HAS FALLEN');
            return;
        }

        if (wave.phase === 'fighting') {
            // Spawn sampai jatah wave habis, dibatasi cap robot di lapangan
            wave.spawnTimer += dt;
            if (wave.toSpawn > 0 && wave.spawnTimer >= wave.spawnInterval
                && robots.length < wave.maxConcurrent) {
                wave.spawnTimer = 0;
                spawnRobot();
                wave.toSpawn--;
                updateUI();   // penghitung "N left" ikut segar
            }
            // Wave bersih: semua sudah di-spawn DAN tak ada robot tersisa
            if (wave.toSpawn === 0 && robots.length === 0) {
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
            }
        } else {
            // 'shopping': shop = MODAL & game DI-PAUSE, jadi updateMode normalnya
            // tak berjalan lagi sampai Start Next Wave (klik/SPACE ->
            // startNextWave -> requestLock -> resume). Guard defensif: bila entah
            // bagaimana kita di fase ini tanpa shop terbuka, buka lagi.
            if (!isShopOpen()) openShop();
        }

        // Animasi kabut Monas aktif: envelope naik-turun 2 dtk di kedua ujung
        // (fade-in cepat, tahan, fade-out) — tanpa akumulasi/drift.
        if (EVT.type === 'monasfog') {
            EVT.left -= dt;
            const k = Math.max(0, Math.min(1, Math.min(EVT.dur - EVT.left, EVT.left) / 2));
            setFogCanopy(k);        // kepekatan kabut mengikuti envelope
            driftFogCanopy(dt);     // gumpalan kabut bergerak; lubang tetap di Monas
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
    // mata. Jadi peluru LEWAT di ruang kosong samping obelisk & mengenai robot
    // di baliknya (dulu terhalang tembok tak terlihat selebar dasar).
    bulletBlocked(b) {
        const y = b.mesh.position.y;
        if (y < 0 || y > 64) return false;                   // di atas obelisk -> lewat
        const h = y < 2 ? 22 : y < 5 ? 20 : y < 8 ? 15 : 8;  // undakan/teras/pelataran/obelisk
        return Math.abs(b.mesh.position.x) < h && Math.abs(b.mesh.position.z) < h;
    },

    // Peluru robot penembak yang DITUJUKAN ke Monas menabrak siluetnya
    // (updateEnemyBullets): potong monasHp + percikan kecil di titik tumbuk.
    enemyBulletHitMonas(dmg, pos) {
        spawnGroundPuff(pos.x, pos.z, 0xd8e2ea, 5, pos.y);
        damageMonas(dmg);
    },

    // Sabetan cakar yang DITUJUKAN ke Monas mendarat (dipanggil ticker windup
    // robots.js setelah clawWindupSec — 2026-07-13): potong monasHp. Komit/roll
    // terkunci sudah dilakukan saat inisiasi ancang-ancang di robotAI.
    monasGnawHit() { damageMonas(CFG.survival.monasClawDamage); },

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

    // --- AI robot survival: lompat pagar -> kejar; vault bak air mancur ---
    // Return { chaseDist } HANYA bila cabang kejar berjalan frame ini (kontrak
    // cakar di robots.js): robot yang baru mendarat tidak mencakar di frame
    // pendaratannya (sama seperti perilaku lama).
    robotAI(z, dt, step) {
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

        // Kejar TARGET (grounded): player, atau Monas. PRIORITAS MONAS — SEMUA
        // robot menyerang Monas secara default; hanya beralih mengejar player
        // bila player berada dalam radius aggro (playerAggroMeters × 7 unit) dari
        // robot; begitu player > radius, robot kembali menyerang Monas.
        // Pathfinder: direct = garis lurus bebas (kejar langsung — termasuk
        // melintasi bak air mancur, yang memicu vault); waypoint = memutari
        // Monas/pohon. Gerak memakai heading berlaju-putar-terbatas
        // (turnToward) -> belokan melengkung alami, tidak patah-patah.
        const dx = camera.position.x - z.mesh.position.x;
        const dz = camera.position.z - z.mesh.position.z;
        const distToEye = Math.hypot(dx, dz);
        // Radius aggro efektif (meter -> unit). Robot yang sudah BERKOMITMEN ke
        // Monas (pernah memukulnya) lebih sulit dialihkan: radiusnya menyusut ke
        // monasLockAggroMeters (5 m). Sebagian (monasLockChance) malah TERKUNCI
        // penuh (radius 0) -> tak pernah mengejar player. Robot biasa memakai
        // playerAggroMeters (15 m).
        const aggroM = z.monasLocked ? 0
            : z.monasCommitted ? CFG.survival.monasLockAggroMeters
                : CFG.survival.playerAggroMeters;
        const atkMonas = monasHp > 0 && distToEye > aggroM * CAMP_M;
        // Titik tuju: player, atau titik terdekat di tepi AABB Monas (24)
        const tx = atkMonas ? clamp(z.mesh.position.x, -24, 24) : camera.position.x;
        const tz = atkMonas ? clamp(z.mesh.position.z, -24, 24) : camera.position.z;
        const distT = atkMonas
            ? Math.hypot(tx - z.mesh.position.x, tz - z.mesh.position.z) : distToEye;
        const aim = navAim(z, navGrid, tx, tz, dt, step);
        // Jarak berhenti: PENEMBAK (B/A) BERHENTI DI RADIUS TEMBAKNYA (0.95×range,
        // hanya bila garis pandang bebas — kalau terhalang tetap merapat lewat
        // waypoint) untuk KEDUA target (player MAUPUN Monas — 2026-07-12: tak lagi
        // menempel ke Monas); melee: nempel Monas (6) / jangkauan cakar (player).
        const stopD = z.ranged && aim.direct ? (z.range || 70) * 0.95
            : atkMonas ? 6
                : player.radius + CFG.robot.stopRange * (z.reachMul || 1);
        z.moving = !aim.direct || distT > stopD;
        z.losOK = aim.direct;   // gerbang tembak robots.js (jangan menembak tembus penghalang)
        // Stance MEMBIDIK (animasi lengan senapan terangkat, animateRobotRig):
        // berdiri di radius tembak dgn garis pandang bebas = mengacungkan senjata.
        if (z.ranged) z.aiming = !z.moving && aim.direct;
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

        // Menyerang Monas. MELEE (C): menggerogoti — cooldown & animasi cakar,
        // damage masuk ke monasHp. PENEMBAK (B/A, 2026-07-12): MENEMBAK Monas
        // dari radius tembaknya — peluru diarahkan ke PUSAT Monas (lintasan pasti
        // masuk siluet bulletBlocked) membawa `monasDmg`; saat terblokir, hook
        // `enemyBulletHitMonas` di bawah yang memotong monasHp. return {} di
        // bawah menjaga robots.js tidak ikut menyerang player.
        if (atkMonas && !z.moving) {
            if (z.ranged) {
                if (z.fireCd > 0) z.fireCd -= dt;
                if (z.fireCd <= 0 && distT < (z.range || 70)) {
                    z.fireCd = z.fireDelaySec;
                    fireRobotBullet(z, 0, 0, 0, CFG.survival.monasClawDamage);
                    // Tembakan PERTAMA ke Monas -> komitmen (aggro menyusut) +
                    // roll terkunci, sama seperti gigitan pertama melee.
                    if (!z.monasCommitted) {
                        z.monasCommitted = true;
                        z.monasLocked = Math.random() < CFG.survival.monasLockChance;
                    }
                }
            } else {
                if (z.attackCd > 0) z.attackCd -= dt;
                if (!(z.windT > 0) && z.attackCd <= 0) {
                    // ANCANG-ANCANG dulu (2026-07-13): damage Monas jatuh saat
                    // sabetan MENDARAT — ticker windup robots.js memanggil hook
                    // monasGnawHit di bawah setelah clawWindupSec. Cooldown
                    // dihitung dari sini (irama gigitan per detik tak berubah).
                    z.attackCd = CFG.robot.clawCooldownSec;
                    z.windT = z.windDur = CFG.robot.clawWindupSec || 0.5;
                    z.windTarget = 'monas';
                    z.clawSide = -z.clawSide;
                    // Gigitan PERTAMA ke Monas -> robot "berkomitmen": radius aggro
                    // menyusut (5 m) dan sekali roll monasLockChance ia TERKUNCI penuh
                    // (tak akan mengejar player lagi). Diundi sekali, saat INISIASI.
                    if (!z.monasCommitted) {
                        z.monasCommitted = true;
                        z.monasLocked = Math.random() < CFG.survival.monasLockChance;
                    }
                }
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

        // Penggerogot Monas TIDAK mencakar player frame ini (kontrak robots.js)
        return atkMonas ? {} : { chaseDist: distToEye };
    },

    // Drop dijepit ke dalam pagar (robot yang mati saat melompat ada di luar)
    clampDropPos(x, z) {
        return [clamp(x, -PARK.hx + 10, PARK.hx - 10), clamp(z, -PARK.hz + 10, PARK.hz - 10)];
    },

    hudStatus() {
        const pct = Math.max(0, Math.ceil(monasHp / monasMaxHp * 100));
        if (wave.phase === 'cleared')
            return `WAVE ${wave.num} CLEARED — Next wave in ${Math.max(1, Math.ceil(wave.clearTimer))}...`;
        if (wave.phase === 'shopping')
            return `WAVE ${wave.num} CLEARED — Field Shop open`;
        const left = wave.toSpawn + robots.length;   // sisa robot wave ini
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
