// Sisi HOST co-op LAN (listen server): konsumsi pesan client (posisi, klaim
// hit/melee, granat, ambil drop, beli item Monas, ready, tumbang), broadcast
// snapshot 15 Hz + event reliable (zspawn/zdie/boom/drop/...), dan orkestrasi
// ready-check antar wave. SEMUA fungsi export di sini adalah SEAM: no-op murni
// bila netRole !== 'host', jadi aman dipanggil dari sistem bersama & scene
// tanpa mengubah perilaku SP. Lihat IMPROVEMENT-MULTIPLAYER-PLAN.md Fase 3-6.

import { CFG } from '../core/config.js';
import { player, zombies, grenades, drops, score, isGameOver, _v3 } from '../core/state.js';
import { scene, camera } from '../core/renderer.js';
import {
    netRole, localId, roster, rosterGet, rosterRemove, selfReady, setSelfReady,
    WPN_LIST, WPN_IDX, KIND_IDX, r1, r2
} from './index.js';
import { sendMsg, drainMessages } from './socket.js';
import { localDown, reviveLocal, setOnLocalDown } from './players.js';
import { pushRemoteSample } from '../entities/remotePlayers.js';
import { killZombie } from '../entities/zombies.js';
import { spawnDrop } from '../entities/drops.js';
import { spawnRemoteGrenade } from '../entities/grenades.js';
import { gameOver } from '../core/game.js';
import { currentWeapon, isAiming, medkitMode } from '../entities/weapons.js';
import { crouchedNow, sprintingNow } from '../entities/player.js';
import {
    getWaveInfo, startNextWave, healMonas, strengthenMonas, getMonasHp, getMonasMaxHp
} from '../scenes/survival/index.js';
import { isShopOpen, openShop, shopMpTick } from '../scenes/survival/shop.js';

let snapT = 0;         // akumulator cadence snapshot (ikut irama frame, bukan setInterval)
let shopTimer = 0;     // batas fase shopping MP (CFG.net.shopMaxSec)
const msgs = [];       // array drain pesan (dipakai ulang tiap frame)

// Dipanggil survivalScene.enter() saat MP host: reset cadence + ready + daftar
// callback tumbang-lokal (players.js tidak boleh mengimpor host.js — siklus).
export function hostInitRound() {
    if (netRole !== 'host') return;
    snapT = 0;
    shopTimer = 0;
    setSelfReady(false);
    setOnLocalDown(() => {                 // host sendiri tumbang
        sendMsg({ t: 'pdown', id: localId });
        checkAllDown();
    });
}

// ================= Seam event (no-op selain host) =================
export function hostOnZombieSpawn(z) {
    if (netRole !== 'host') return;
    sendMsg({
        t: 'zspawn', id: z.id, k: KIND_IDX[z.kind] || 0, s: z.scl || 1,
        x: r1(z.mesh.position.x), y: r1(z.mesh.position.y), zz: r1(z.mesh.position.z)
    });
}

export function hostOnZombieDie(z, headshot, byId, pts) {
    if (netRole !== 'host') return;
    sendMsg({ t: 'zdie', id: z.id, h: headshot ? 1 : 0, by: byId == null ? localId : byId, pts });
}

export function hostOnExplode(pos) {
    if (netRole !== 'host') return;
    sendMsg({ t: 'boom', x: r1(pos.x), y: r1(pos.y), zz: r1(pos.z) });
}

export function hostOnDropSpawn(d) {
    if (netRole !== 'host') return;
    sendMsg({ t: 'drop', id: d.id, ty: d.type, x: r1(d.mesh.position.x), zz: r1(d.mesh.position.z) });
}

export function hostOnDropTaken(id, byId, type) {
    if (netRole !== 'host') return;
    sendMsg({ t: 'dropgone', id, by: byId, ty: type });
}

// Event lingkungan wave (fog/blackout) mulai/selesai — client menganimasikan
// efek yang sama secara lokal. k = 'fog' | 'blackout' | null (selesai).
export function hostOnEvent(kind, dur) {
    if (netRole !== 'host') return;
    sendMsg({ t: 'evt', k: kind, d: dur || 0 });
}

export function hostOnGameOver(won, title) {
    if (netRole !== 'host') return;
    sendMsg({ t: 'over', w: won ? 1 : 0, ti: title || '' });
}

// resetGame di host = run baru utk SEMUA: reset skor/ready/alive roster +
// broadcast restart (client menjalankan resetGame-nya sendiri saat menerimanya).
export function hostOnRestart() {
    if (netRole !== 'host') return;
    for (const p of roster) { p.score = 0; p.alive = true; p.ready = false; }
    setSelfReady(false);
    sendMsg({ t: 'restart' });
}

// startWave di host = hidupkan kembali SEMUA pemain + umumkan (dipanggil dari
// survivalScene.startWave lewat seam).
export function hostOnWaveStart(n) {
    if (netRole !== 'host') return;
    reviveLocal();
    for (const p of roster) { p.alive = true; p.ready = false; }
    setSelfReady(false);
    sendMsg({ t: 'wavestart', num: n });
}

// ================= Loop host per frame =================
export function hostUpdate(dt) {
    if (netRole !== 'host') return;
    drainMessages(msgs);
    for (let i = 0; i < msgs.length; i++) handleMsg(msgs[i]);
    msgs.length = 0;
    snapT -= dt;
    if (snapT <= 0) {
        snapT = 1 / ((CFG.net && CFG.net.snapshotHz) || 15);
        sendMsg(buildSnapshot());
    }
}

function handleMsg(m) {
    const from = m.from;
    switch (m.t) {
        case 'p': {   // posisi/pose/hp/skor pemain remote (20 Hz)
            const p = rosterGet(from);
            if (!p) return;
            p.x = +m.x; p.y = +m.y; p.z = +m.z;
            p.yaw = +m.yw; p.pitch = +m.pt;
            p.anim = m.a | 0;
            p.wpn = WPN_LIST[m.w] || 'pistol';
            p.hp = m.hp | 0;
            p.score = m.sc | 0;
            p.alive = !!m.al;
            pushRemoteSample(p);
            return;
        }
        case 'hit': {   // klaim peluru client: terapkan damage via jalur normal
            const i = zombies.findIndex(z => z.id === m.zid);
            if (i < 0) return;   // zombie sudah mati — klaim basi (race normal)
            const z = zombies[i];
            z.hp -= Math.max(0, Math.min(2000, +m.d || 0));   // jepit klaim ke rentang wajar
            if (z.hp <= 0) {
                spawnDrop(z.mesh.position);
                killZombie(i, !!m.h, from);
            }
            return;
        }
        case 'melee': {   // klaim melee client (SP melee = kill 1 pukulan)
            const i = zombies.findIndex(z => z.id === m.zid);
            if (i < 0) return;
            spawnDrop(zombies[i].mesh.position);
            killZombie(i, false, from);
            return;
        }
        case 'nade':      // lemparan granat client -> host mensimulasikannya
            spawnRemoteGrenade(m, from);
            return;
        case 'take': {    // klaim ambil drop: first-come (yang kalah tidak dapat apa-apa)
            const i = drops.findIndex(d => d.id === m.id);
            if (i < 0) return;
            const ty = drops[i].type;
            scene.remove(drops[i].mesh);
            drops.splice(i, 1);
            hostOnDropTaken(m.id, from, ty);
            return;
        }
        case 'buy': {     // item Monas (efek GLOBAL) — host validasi & eksekusi
            const cost = m.item === 'healMonas' ? CFG.shop.healMonasCost
                : CFG.shop.strengthenMonasCost;
            const rej = m.item === 'healMonas' ? healMonas()
                : m.item === 'strengthenMonas' ? strengthenMonas() : 'Unknown item';
            if (rej) sendMsg({ t: 'buyno', to: from, item: m.item, r: rej });
            else sendMsg({ t: 'buyok', to: from, item: m.item, c: cost });
            return;
        }
        case 'ready': {   // toggle READY fase shop
            const p = rosterGet(from);
            if (p) p.ready = !!m.v;
            hostRecheckReady();
            return;
        }
        case 'down': {    // pemain remote tumbang (hp-nya client-authoritative)
            const p = rosterGet(from);
            if (p) p.alive = false;
            sendMsg({ t: 'pdown', id: from });
            checkAllDown();
            return;
        }
        case 'leave': {   // dari relay: client putus
            rosterRemove(m.id);
            sendMsg({ t: 'pleave', id: m.id });
            hostRecheckReady();
            checkAllDown();
            return;
        }
    }
}

// Semua pemain tumbang dalam wave yang sama = kalah (host yang memutuskan;
// broadcast `over` lewat seam hostOnGameOver di gameOver()).
function checkAllDown() {
    if (isGameOver) return;
    if (localDown && roster.every(p => !p.alive)) gameOver(false);
}

// ================= Snapshot 15 Hz =================
// Format kompak (array posisi tetap — lihat coopClient.js utk parsernya):
//   p: [[id,x,y,z,yaw,pitch,anim,wpnIdx,hp,score,alive,ready], ...] (host duluan)
//   z: [[id,x,y,z,jump,mv,kindIdx,scl,claw], ...]   n: [[id,x,y,z], ...]
//   m: [monasHp,monasMax]   w: [num,phaseIdx,left,timer,ready,total]
function buildSnapshot() {
    const zs = [];
    for (const z of zombies) {
        zs.push([z.id | 0, r1(z.mesh.position.x), r1(z.mesh.position.y), r1(z.mesh.position.z),
        z.state === 'jumping' ? 1 : 0, z.moving === false ? 0 : 1,
        KIND_IDX[z.kind] || 0, z.scl || 1, z.clawT > 0 ? 1 : 0]);
    }
    const ns = [];
    for (const g of grenades)
        ns.push([g.id | 0, r1(g.mesh.position.x), r1(g.mesh.position.y), r1(g.mesh.position.z)]);
    const ps = [selfEntry()];
    for (const p of roster) {
        ps.push([p.id, r1(p.x), r1(p.y), r1(p.z), r2(p.yaw || 0), r2(p.pitch || 0),
        p.anim | 0, WPN_IDX[p.wpn] != null ? WPN_IDX[p.wpn] : 1, p.hp | 0, p.score | 0,
        p.alive ? 1 : 0, p.ready ? 1 : 0]);
    }
    const wi = getWaveInfo();
    const phaseIdx = wi.phase === 'fighting' ? 0 : wi.phase === 'cleared' ? 1 : 2;
    const ri = getReadyInfo();
    return {
        t: 's', p: ps, z: zs, n: ns,
        m: [Math.max(0, Math.round(getMonasHp())), Math.round(getMonasMaxHp())],
        w: [wi.num, phaseIdx, wi.left,
        Math.max(0, Math.ceil(phaseIdx === 2 ? shopTimer : wi.timer)),
        ri.ready, ri.total]
    };
}

// Entry snapshot pemain HOST sendiri (pose disusun dari state lokal — sama
// persis komposisi pesan `p` client di coopClient.js).
function selfEntry() {
    camera.getWorldDirection(_v3);
    const yaw = Math.atan2(_v3.x, _v3.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, _v3.y)));
    let a = 0;
    if (crouchedNow) a |= 1;
    if (isAiming) a |= 2;
    if (Date.now() - player.lastShot < 160) a |= 4;
    if (player.isReloading) a |= 8;
    if (sprintingNow) a |= 16;
    if (medkitMode) a |= 32;
    return [localId, r1(camera.position.x), r1(camera.position.y), r1(camera.position.z),
        r2(yaw), r2(pitch), a, WPN_IDX[currentWeapon] || 0, Math.round(player.hp),
        score | 0, localDown ? 0 : 1, selfReady ? 1 : 0];
}

// ================= Fase shop MP (tanpa pause) =================
// Dipanggil survivalScene saat masuk fase 'shopping' (MP host): mulai timer
// batas + reset ready semua pemain.
export function hostEnterShopping() {
    if (netRole !== 'host') return;
    shopTimer = (CFG.net && CFG.net.shopMaxSec) || 60;
    setSelfReady(false);
    for (const p of roster) p.ready = false;
}

// Per-frame selama fase 'shopping' MP (dunia TIDAK di-pause): jaga shop tetap
// terbuka + hitung mundur batas; habis -> paksa mulai wave berikutnya.
export function hostShoppingUpdate(dt) {
    if (netRole !== 'host') return;
    if (!isShopOpen()) openShop();
    shopMpTick();   // segarkan angka ready/timer di menu shop
    shopTimer -= dt;
    if (shopTimer <= 0) startNextWave();
}

// Semua pemain HIDUP sudah ready -> mulai wave berikutnya. Dipanggil saat
// pesan `ready` masuk & saat host sendiri menekan READY (shop.js).
export function hostRecheckReady() {
    if (netRole !== 'host' || getWaveInfo().phase !== 'shopping') return;
    if (selfReady && roster.every(p => !p.alive || p.ready)) startNextWave();
}

// Info ready utk HUD/shop (host). timeLeft = sisa detik batas fase shop.
export function getReadyInfo() {
    let ready = selfReady ? 1 : 0;
    for (const p of roster) if (p.alive && p.ready) ready++;
    return { ready, total: 1 + roster.length, timeLeft: Math.max(0, Math.ceil(shopTimer)) };
}
