// Seam pemain multi-target utk SISTEM BERSAMA (zombies.js, effects.js, dst)
// saat co-op LAN. Semua fungsi di sini murni no-op / jalur-lama-persis saat
// netRole 'off' — satu-satunya cara sistem bersama menyentuh dunia MP tanpa
// if-else mode tersebar (IMPROVEMENT-MULTIPLAYER-PLAN.md Fase 3/6).

import { CFG } from '../core/config.js';
import { player, addScore, stats } from '../core/state.js';
import { camera } from '../core/renderer.js';
import { netRole, localId, roster, rosterGet } from './index.js';
import { sendMsg } from './socket.js';
import { gameOver } from '../core/game.js';
import { showStageMsg } from '../core/dom.js';
import { updateUI } from '../core/hud.js';

// ----- Pemain lokal tumbang (MP: spectate; SP: tidak pernah true) -----
export let localDown = false;

// --- Daftar target zombie. SP: HANYA kamera (satu elemen — survivalScene
// membaca posisi dari sini, perilaku lama identik). MP host: kamera + semua
// pemain roster yang hidup. Objek & array dipakai ulang (nol alokasi per frame).
const _local = { id: 0, x: 0, y: 0, z: 0, alive: true, local: true };
const _targets = [_local];

export function getTargets() {
    _local.id = localId;
    _local.x = camera.position.x;
    _local.y = camera.position.y;
    _local.z = camera.position.z;
    _local.alive = !localDown;
    _targets.length = 1;
    if (netRole === 'host') {
        for (const p of roster) if (p.alive) _targets.push(p);
    }
    return _targets;
}

// --- Kredit skor per kematian zombie (dipanggil killZombie). SP / kill milik
// pemain lokal -> jalur lama persis (stats.kills + addScore). MP host + kill
// milik client -> skor dicatat di roster; client menambah skornya sendiri dari
// event zdie (host.js yang menyiarkannya).
export function creditKill(pts, byId) {
    if (netRole !== 'host' || byId == null || byId === localId) {
        stats.kills++;
        addScore(pts);
        return;
    }
    const p = rosterGet(byId);
    if (p) p.score += pts;
}

// --- Cakar/ledakan host melukai pemain REMOTE: kirim event dmg ke client ybs.
// HP pemain client-authoritative — client sendiri yang menguranginya (dan
// melapor tumbang lewat pesan `down`). zx/zz = posisi penyerang (utk indikator
// arah di layar korban).
export function damageRemotePlayer(id, amount, zx, zz) {
    if (netRole !== 'host') return;
    sendMsg({ t: 'dmg', to: id, a: amount, zx: Math.round(zx), zz: Math.round(zz) });
}

// Ledakan exploder melukai SEMUA pemain remote dalam radius (host). Pemain
// lokal host tetap ditangani processPendingBooms (jalur lama).
export function damageNearbyRemotes(pos, radius, amount) {
    if (netRole !== 'host') return;
    for (const p of roster) {
        if (!p.alive) continue;
        if (Math.hypot(pos.x - p.x, pos.z - p.z) < radius)
            damageRemotePlayer(p.id, amount, pos.x, pos.z);
    }
}

// --- HP pemain lokal habis. SP -> game over (jalur lama). MP -> TUMBANG:
// spectate sampai wave berikutnya; client melapor ke host (host memutuskan
// game over bila semua pemain tumbang — dicek di host.js).
let onLocalDownCb = null;   // host.js mendaftar (broadcast pdown + cek all-down)
export function setOnLocalDown(fn) { onLocalDownCb = fn; }

export function onPlayerZeroHp() {
    if (netRole === 'off') { gameOver(false); return; }
    if (localDown) return;
    localDown = true;
    player.hp = 0;
    updateUI();
    showStageMsg('YOU ARE DOWN — respawning next wave', 3600);
    if (netRole === 'client') sendMsg({ t: 'down' });
    else if (onLocalDownCb) onLocalDownCb();
}

// Kamera spectator saat tumbang: naik perlahan (pandangan burung) + pengingat.
// Input gameplay sudah ditelan input.js selama localDown.
let downMsgT = 0;
export function updateDownCam(dt) {
    if (!localDown) return;
    if (camera.position.y < 90)
        camera.position.y = Math.min(90, camera.position.y + 45 * dt);
    downMsgT -= dt;
    if (downMsgT <= 0) {
        downMsgT = 4;
        showStageMsg('YOU ARE DOWN — respawning next wave', 3600);
    }
}

// Hidupkan kembali pemain lokal (awal wave berikutnya): HP penuh, kembali ke
// gerbang selatan, inventori TETAP (keputusan desain rencana MP).
export function reviveLocal() {
    if (!localDown) return;
    localDown = false;
    downMsgT = 0;
    player.hp = CFG.player.maxHp;
    camera.position.set(0, CFG.player.eyeHeight, 120);
    updateUI();
}

// Reset status tumbang tanpa efek samping (resetGame / enter scene).
export function resetDown() { localDown = false; downMsgT = 0; }
