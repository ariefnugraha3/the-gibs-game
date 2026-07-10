// Transport WebSocket ke relay server.py. URL diturunkan OTOMATIS dari host
// halaman: semua pemain memuat game dari server statis di mesin host, jadi
// location.hostname = IP host — tanpa form "masukkan IP" (rencana MP Fase 1).
//
// Dua mode konsumsi pesan:
//   - handler langsung (LOBBY, sebelum game mulai): setMsgHandler(fn)
//   - antrean per-frame (IN-GAME): setMsgHandler(null) -> pesan menumpuk dan
//     dikonsumsi scene lewat drainMessages() di updateMode — urutan pesan
//     relatif frame deterministik (pitfall #3 rencana MP).

import { CFG } from '../core/config.js';

let ws = null;
let handler = null;        // di-set = dispatch langsung (lobby)
let closeHandler = null;
const queue = [];          // handler null = antre (gameplay)

export function isConnected() { return !!ws && ws.readyState === 1; }

// urlOverride (opsional): alamat relay eksplisit dari kolom "Server Address"
// lobby (mis. "ws://192.168.1.3:8001") — dipakai bila halaman TIDAK dimuat dari
// server host (location.hostname = localhost/GitHub Pages). Kosong = perilaku
// default: turunkan dari host halaman.
export function connectWS(onOpen, onError, urlOverride) {
    const port = (CFG.net && CFG.net.port) || 8001;
    const url = urlOverride || ('ws://' + location.hostname + ':' + port);
    try {
        ws = new WebSocket(url);
    } catch (e) {
        if (onError) onError(e);
        return;
    }
    ws.onopen = () => { if (onOpen) onOpen(); };
    ws.onerror = () => { if (onError) onError(new Error('connect failed')); };
    ws.onclose = () => { if (closeHandler) closeHandler(); };
    ws.onmessage = (ev) => {
        let obj = null;
        try { obj = JSON.parse(ev.data); } catch (e) { return; }
        if (!obj || typeof obj !== 'object') return;
        if (handler) handler(obj);
        else {
            queue.push(obj);
            // Cap memori: host bisa lama diam di blocker/layar game-over tanpa
            // men-drain (pesan `p` 20 Hz/pemain terus mengalir). Pesan tertua
            // dibuang — state menyusul dari pesan yang lebih baru.
            if (queue.length > 1200) queue.splice(0, queue.length - 1200);
        }
    };
}

export function sendMsg(obj) {
    if (isConnected()) ws.send(JSON.stringify(obj));
}

export function setMsgHandler(fn) {
    handler = fn;
    // Pesan yang tiba SEBELUM handler terpasang (mis. wavestart pertama host
    // mendahului enter() scene client) di-flush ke handler baru — jangan
    // mengendap di antrean selamanya.
    if (fn && queue.length) {
        const pending = queue.splice(0, queue.length);
        for (let i = 0; i < pending.length; i++) fn(pending[i]);
    }
}
export function setCloseHandler(fn) { closeHandler = fn; }

// Pindahkan seluruh antrean ke array pemanggil (dipakai ulang tiap frame —
// tanpa alokasi array baru di loop).
export function drainMessages(out) {
    if (queue.length) {
        for (let i = 0; i < queue.length; i++) out.push(queue[i]);
        queue.length = 0;
    }
    return out;
}

export function closeWS() {
    closeHandler = null;
    handler = null;
    queue.length = 0;
    if (ws) {
        try { ws.close(); } catch (e) { /* sudah tertutup */ }
        ws = null;
    }
}
