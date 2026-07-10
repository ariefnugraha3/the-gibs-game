// State inti multiplayer co-op LAN (IMPROVEMENT-MULTIPLAYER-PLAN.md).
// Live binding ESM: modul lain MEMBACA netRole/localId/roster; reassign hanya
// lewat setter di sini. netRole 'off' = single-player — semua jalur MP no-op,
// perilaku SP wajib byte-identik. Modul ini SENGAJA tanpa impor modul game
// (bebas siklus; aman diimpor dari mana pun, termasuk input.js/main.js).

export let netRole = 'off';    // 'off' | 'host' | 'client'
export let localId = 0;        // id pemain lokal di room (host = 0)
export let roomName = '';
export let localName = 'Player';
export let selfReady = false;  // status READY pemain lokal di fase shop MP

export const setNetRole = (r) => { netRole = r; };
export const setLocalId = (id) => { localId = id; };
export const setRoomName = (n) => { roomName = n; };
export const setLocalName = (n) => { localName = n; };
export const setSelfReady = (v) => { selfReady = v; };

export const isNet = () => netRole !== 'off';

// Tabel index kompak utk pesan jaringan (hemat byte snapshot)
export const WPN_LIST = ['rifle', 'pistol', 'shotgun'];
export const WPN_IDX = { rifle: 0, pistol: 1, shotgun: 2 };
export const KIND_LIST = ['walker', 'runner', 'brute', 'exploder'];
export const KIND_IDX = { walker: 0, runner: 1, brute: 2, exploder: 3 };

// Pembulatan kompak utk payload posisi/sudut
export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;

// ----- Roster pemain REMOTE (TIDAK termasuk pemain lokal) -----
// {id, name, alive, ready, score, hp, wpn, anim, x, y, z, yaw, pitch, buf}
// posisi dari pesan `p` (di host) / snapshot (di client); buf = buffer sampel
// interpolasi milik entities/remotePlayers.js.
export const roster = [];

export function rosterGet(id) {
    for (const p of roster) if (p.id === id) return p;
    return null;
}

export function rosterAdd(id, name) {
    const ex = rosterGet(id);
    if (ex) return ex;
    const p = {
        id, name: name || ('Player ' + id), alive: true, ready: false,
        score: 0, hp: 100, wpn: 'pistol', anim: 0,
        x: 0, y: 11.4, z: 120, yaw: 0, pitch: 0, buf: null,
    };
    roster.push(p);
    return p;
}

export function rosterRemove(id) {
    for (let i = roster.length - 1; i >= 0; i--)
        if (roster[i].id === id) roster.splice(i, 1);
}

export function resetNet() {
    netRole = 'off';
    localId = 0;
    selfReady = false;
    roster.length = 0;
}
