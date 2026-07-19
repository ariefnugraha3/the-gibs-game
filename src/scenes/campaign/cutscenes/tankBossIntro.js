// CUTSCENE: TANK-BOSS INTRO ("penjemputan gagal") — dipisah dari stage4.js pada
// 2026-07-19 (permintaan user: pisahkan cutscene dari stage & utility). Ini
// adegan scripted saat player BERTEMU BOSS TANK di alun-alun Stage 4:
//   1. Semua robot mati -> HELI PENJEMPUT mendarat menunggu di PUSAT alun-alun
//      (rotor berputar), gerbang ring terbuka.
//   2. Player MENGINJAK ring road -> cutscene: freeze input + letterbox -> pan
//      kamera ke heli -> TANK datang dari UTARA -> menembak heli (MELEDAK) ->
//      tank maju parkir di DEPAN bangkai (BOSS_POS) -> badan diluruskan -> pan
//      balik ke player -> kontrol pulih, DUEL dimulai (tank.phase='battle').
//
// Modul ini HANYA menangani cutscene + siklus hidup HELI. Tank yang di-spawn di
// tengah cutscene diserahkan ke stage4 lewat callback `setTank` (stage4 yang
// mengurus DUEL: updateTank, kunci arena, kondisi menang). Geometri
// (SQ/HELI_POS/BOSS_POS/WRECK_CLEAR/S4_START) + `blockers` + `openGate`
// di-inject stage4 lewat createTankBossIntro (modul ini buta geometri scene).
// Mesin BERBASIS TIMER (deterministik — headless-testable via stage4).

import { CFG } from '../../../core/config.js';
import { _v3, GEO, setCinematicActive } from '../../../core/state.js';
import { scene, camera, addCamShake, setCineFocus } from '../../../core/renderer.js';
import { setCineBars, showStageMsg } from '../../../core/dom.js';
import { releaseInputs } from '../../../core/input.js';
import { spawnGroundPuff } from '../../../entities/effects.js';
import { playSFX, sfxExplode, playLoopSFX, stopLoopSFX, sfxHeli, stopMusic, startBossMusic } from '../../../utils/sfx.js';
import { spawnHelicopter, updateHelicopter, blastHelicopter, disposeHelicopter } from '../../../entities/helicopter.js';
import { spawnTank, tankMovingTick } from '../../../entities/tank.js';
import { rand } from '../../../utils/math.js';
import { updateUI } from '../../../core/hud.js';
import { countStageRobots } from '../utility/common.js';

// Bikin satu pengontrol cutscene tank-boss. `deps`:
//   SQ, HELI_POS, BOSS_POS, WRECK_CLEAR, S4_START  = geometri stage 4
//   blockers   = array blocker stage 4 (heliBlocker di-push/-splice di sini)
//   openGate   = fn stage 4 (buka gerbang ring saat heli mendarat)
//   setTank(t) = callback: stage 4 menyimpan ref tank + set bossSpawned=true
export function createTankBossIntro(deps) {
    const { SQ, HELI_POS, BOSS_POS, WRECK_CLEAR, S4_START, blockers, openGate, setTank } = deps;

    let heli = null, heliSpawned = false, heliBlocker = null;
    let cine = null, cutsceneDone = false;
    let tank = null;   // dibuat cutscene; juga diteruskan ke stage4 lewat setTank
    let heliSnd = null;   // loop helicopter-flying selama heli diperlihatkan cutscene (2026-07-19)

    // Semua robot mati -> gerbang terbuka + HELI PENJEMPUT mendarat menunggu di
    // pusat alun-alun (hidung ke BARAT = arah kedatangan player). Bangkainya
    // kelak jadi obstacle -> blocker pejal ikut dipasang (dicabut di reset()).
    function heliArrives() {
        heliSpawned = true;
        openGate();
        heli = spawnHelicopter(HELI_POS.x, HELI_POS.z, -Math.PI / 2);
        heliBlocker = {
            x: HELI_POS.x, z: HELI_POS.z, hx: 26, hz: 26,
            axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(26, 26), top: 18, standable: false
        };
        blockers.push(heliBlocker);
        showStageMsg('THE HIGHWAY IS CLEAR — REACH THE EXTRACTION HELICOPTER!');
        updateUI();
    }

    // Mulai cutscene (dipicu stage4.playerCollide saat player menginjak ring):
    // freeze input (cinematicActive; Esc tetap = pause) + letterbox.
    function start() {
        cine = { phase: 'freeze', t: 0.9, dur: 0, from: null, to: null, shell: null, sFrom: null, track: 0 };
        releaseInputs();
        setCinematicActive(true);
        setCineBars(true);
        // AUDIO CUTSCENE (2026-07-19): musik battle berhenti (adegan sinematik),
        // suara HELI TERBANG menyala selama heli diperlihatkan — dihentikan
        // tepat saat heli hancur ditembak tank (fase 'shell').
        stopMusic();
        heliSnd = playLoopSFX(sfxHeli, 0.55);
    }

    // Belok sudut a -> b terbatas maxD rad (salinan lokal turnAngle tank.js)
    function approachAngle(a, b, maxD) {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d) <= maxD ? b : a + Math.sign(d) * maxD;
    }
    // Turret tank sinematik selalu membidik heli (fase 'cine': updateTank skip)
    function aimTurretAtHeli() {
        const g = tank.parts.group.position;
        tank.turretYaw = Math.atan2(HELI_POS.x - g.x, HELI_POS.z - g.z);
        tank.parts.turret.rotation.y = tank.turretYaw - tank.hullYaw;
    }
    // Roda berputar + debu + guncangan kecil selama tank bergerak dlm cutscene
    function cineTracksDust(dt) {
        cine.track += dt * 8;
        tankMovingTick(tank);   // suara tank-moving ikut menyala selama drive sinematik (2026-07-19)
        for (const w of tank.parts.wheels) w.rotation.x = cine.track;
        if (Math.random() < 0.5) spawnGroundPuff(
            tank.parts.group.position.x + rand(-14, 14),
            tank.parts.group.position.z + rand(-10, 10), 0x6b6252, 4, 3);
        addCamShake(0.5);
    }

    // Mesin fase cutscene (dipanggil update() selagi cine aktif).
    function runCutscene(dt) {
        cine.t -= dt;
        if (cine.phase === 'freeze' && cine.t <= 0) {
            cine.phase = 'panIn'; cine.t = 3.0;
            setCineFocus(HELI_POS.x, HELI_POS.z);            // (3) kamera bergeser ke pusat alun
        } else if (cine.phase === 'panIn' && cine.t <= 0) {
            cine.phase = 'hold'; cine.t = 1.0;               // (4) heli menunggu, rotor berputar
        } else if (cine.phase === 'hold' && cine.t <= 0) {
            // (5) TANK datang dari UTARA — spawn fase 'cine' (dikemudikan di sini)
            tank = spawnTank({
                homeX: BOSS_POS.x, homeZ: BOSS_POS.z, wallX: BOSS_POS.x - 9999, faceX: S4_START.x,
                arena: { x0: SQ.x0, x1: SQ.x1, z0: SQ.z0, z1: SQ.z1 },
                avoid: { x: HELI_POS.x, z: HELI_POS.z, r: WRECK_CLEAR }
            });
            tank.phase = 'cine';
            tank.parts.group.position.set(HELI_POS.x, 0, SQ.z0 - 70);
            tank.hullYaw = Math.PI / 2;                      // moncong (-X lokal) menghadap SELATAN
            tank.parts.group.rotation.y = tank.hullYaw;
            setTank(tank);                                   // serahkan ke stage4 (bossSpawned=true, ref utk duel)
            cine.from = { x: HELI_POS.x, z: SQ.z0 - 70 };
            cine.to = { x: HELI_POS.x, z: HELI_POS.z - 130 };   // titik tembak di utara heli
            cine.phase = 'tankIn'; cine.dur = 2.2; cine.t = 2.2;
        } else if (cine.phase === 'tankIn') {
            const k = 1 - Math.max(0, cine.t / cine.dur);
            const e = 1 - Math.pow(1 - k, 2);                // easeOut: melambat mendekat
            tank.parts.group.position.x = cine.from.x + (cine.to.x - cine.from.x) * e;
            tank.parts.group.position.z = cine.from.z + (cine.to.z - cine.from.z) * e;
            cineTracksDust(dt);
            aimTurretAtHeli();
            if (cine.t <= 0) {
                // TEMBAK: kilat moncong + peluru sinematik melesat ke heli
                tank.parts.cannonFlash.material.opacity = 1;
                playSFX(sfxExplode);
                addCamShake(2.4);
                cine.shell = new THREE.Mesh(GEO.grenade,
                    new THREE.MeshLambertMaterial({ color: 0x2b2b2b, emissive: 0x552200 }));
                cine.shell.scale.setScalar(1.6);
                tank.parts.cannonMuzzle.getWorldPosition(_v3);
                cine.shell.position.copy(_v3);
                cine.sFrom = { x: _v3.x, y: _v3.y, z: _v3.z };
                scene.add(cine.shell);
                cine.phase = 'shell'; cine.dur = 0.32; cine.t = 0.32;
            }
        } else if (cine.phase === 'shell') {
            const k = 1 - Math.max(0, cine.t / cine.dur);
            cine.shell.position.set(
                cine.sFrom.x + (HELI_POS.x - cine.sFrom.x) * k,
                cine.sFrom.y + (10 - cine.sFrom.y) * k,
                cine.sFrom.z + (HELI_POS.z - cine.sFrom.z) * k);
            if (cine.t <= 0) {
                scene.remove(cine.shell);
                if (cine.shell.material.dispose) cine.shell.material.dispose();
                cine.shell = null;
                blastHelicopter(heli);                       // heli MELEDAK HANCUR
                stopLoopSFX(heliSnd); heliSnd = null;        // rotor mati bersama helinya (2026-07-19)
                addCamShake(8);
                cine.phase = 'burn'; cine.t = 1.3;
            }
        } else if (cine.phase === 'burn') {
            aimTurretAtHeli();
            if (cine.t <= 0) {
                // (6) tank maju ke DEPAN bangkai heli (BOSS_POS, barat)
                cine.from = { x: tank.parts.group.position.x, z: tank.parts.group.position.z };
                cine.to = { x: BOSS_POS.x, z: BOSS_POS.z };
                cine.phase = 'advance'; cine.dur = 2.4; cine.t = 2.4;
            }
        } else if (cine.phase === 'advance') {
            const k = 1 - Math.max(0, cine.t / cine.dur);
            const e = k * k * (3 - 2 * k);                   // smoothstep
            tank.parts.group.position.x = cine.from.x + (cine.to.x - cine.from.x) * e;
            tank.parts.group.position.z = cine.from.z + (cine.to.z - cine.from.z) * e;
            const wantHull = Math.atan2(cine.to.z - cine.from.z, -(cine.to.x - cine.from.x));
            tank.hullYaw = approachAngle(tank.hullYaw, wantHull, 2.4 * dt);
            tank.parts.group.rotation.y = tank.hullYaw;
            cineTracksDust(dt);
            aimTurretAtHeli();
            if (cine.t <= 0) { cine.phase = 'settle'; cine.t = 1.0; }
        } else if (cine.phase === 'settle') {
            // badan berputar di poros meluruskan diri ke orientasi duel (moncong barat)
            tank.hullYaw = approachAngle(tank.hullYaw, 0, 2.2 * dt);
            tank.parts.group.rotation.y = tank.hullYaw;
            if (cine.t <= 0) {
                // (7) kamera kembali ke player di tepi alun-alun
                cine.phase = 'panBack'; cine.t = 2.6;
                setCineFocus(camera.position.x, camera.position.z);
            }
        } else if (cine.phase === 'panBack' && cine.t <= 0) {
            endCutscene();                                    // (8) permainan dimulai
            return;
        }
        // kilat moncong meluruh (updateTank fase 'cine' tak berjalan)
        if (tank) tank.parts.cannonFlash.material.opacity *= 0.86;
    }

    function endCutscene() {
        cine = null; cutsceneDone = true;
        setCineFocus(null);
        setCineBars(false);
        setCinematicActive(false);
        tank.hullYaw = 0;
        tank.parts.group.rotation.y = 0;
        tank.phase = 'battle';
        tank.cd = (CFG.campaign.bosses.tank.gapSec || 5) + 0.8;   // jeda napas sebelum serangan pertama
        startBossMusic();   // DUEL dimulai -> musik boss-fight (2026-07-19; berhenti di stage4.onBossDown)
        showStageMsg('A WAR TANK GUARDS THE TOWN SQUARE — DESTROY IT!');
        updateUI();
    }

    // Per-frame (dipanggil stage4.updateMode): update rotor/asap heli, picu
    // kedatangan heli saat semua robot mati, jalankan mesin cutscene.
    function update(dt) {
        if (heli) updateHelicopter(heli, dt);
        if (!heliSpawned) {
            if (countStageRobots(4) === 0) heliArrives();
        } else if (cine) {
            runCutscene(dt);
        }
    }

    // Reset (dipanggil stage4.enter): buang heli/bangkai + blocker-nya, batalkan
    // sinematik yang mungkin tengah berjalan (restart/cheat). Tank TIDAK dibuang
    // di sini — stage4 yang men-disposeTank sebelum memanggil reset().
    function reset() {
        if (heli) { disposeHelicopter(heli); heli = null; }
        if (heliBlocker) {
            const hb = blockers.indexOf(heliBlocker);
            if (hb >= 0) blockers.splice(hb, 1);
            heliBlocker = null;
        }
        heliSpawned = false; cutsceneDone = false;
        if (cine && cine.shell) { scene.remove(cine.shell); if (cine.shell.material.dispose) cine.shell.material.dispose(); }
        cine = null;
        stopLoopSFX(heliSnd); heliSnd = null;   // loop heli mati bila cutscene dibatalkan (restart/cheat)
        setCineFocus(null); setCineBars(false); setCinematicActive(false);
        tank = null;
    }

    return {
        update, start, reset,
        currentHeli: () => heli,
        cineDebug: () => ({
            active: !!cine, phase: cine ? cine.phase : null, done: cutsceneDone,
            wreckClear: WRECK_CLEAR, heliX: HELI_POS.x, heliZ: HELI_POS.z
        }),
        isHeliSpawned: () => heliSpawned,
        isActive: () => !!cine,
        isDone: () => cutsceneDone,
    };
}
