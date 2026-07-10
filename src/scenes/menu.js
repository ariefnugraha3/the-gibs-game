// SCENE menu (DOM murni, sebelum dunia 3D dibangun): layar pilih mode
// (#modeSelect, z-index 30) + baris difficulty + cutscene pembuka (z-index 20,
// khusus Survival) + LOBBY co-op LAN (#coopLobby — buat/gabung room bernama
// via relay server.py; IMPROVEMENT-MULTIPLAYER-PLAN.md Fase 1). Dunia baru
// dibangun SETELAH mode dipilih — onPick(mode) memanggil startGame; difficulty
// diterapkan ke CFG TEPAT sebelum itu (di co-op: milik HOST, dikirim via cfg).

import { CFG, applyDifficulty } from '../core/config.js';
import { setDifficulty } from '../core/state.js';
import {
    localId, setNetRole, setLocalId, setRoomName, setLocalName, rosterAdd
} from '../net/index.js';
import {
    connectWS, sendMsg, setMsgHandler, setCloseHandler, closeWS
} from '../net/socket.js';
import { setWorldSeed } from './survival/world.js';

export function initMenu(onPick) {
    // --- Pilihan difficulty (localStorage; default normal). applyDifficulty
    // idempoten (selalu dihitung dari CFG_BASE) — aman diklik berkali-kali. ---
    let diff = localStorage.getItem('gibsDifficulty') || 'normal';
    const dbtns = document.querySelectorAll('#diffRow .dbtn');
    const paintDiff = () => dbtns.forEach(b => b.classList.toggle('selected', b.dataset.d === diff));
    dbtns.forEach(b => b.addEventListener('click', () => {
        diff = b.dataset.d;
        localStorage.setItem('gibsDifficulty', diff);
        paintDiff();
    }));
    paintDiff();

    let picked = false;
    document.querySelectorAll('#modeSelect .modeCard').forEach(card => {
        card.addEventListener('click', () => {
            if (picked) return;   // jaga-jaga klik ganda
            const mode = card.dataset.mode;
            // Kartu CO-OP membuka lobby (start-nya diurus alur lobby sendiri;
            // BACK mengembalikan ke pilihan mode tanpa mengunci `picked`).
            if (mode === 'coop') {
                document.getElementById('coopLobby').style.display = 'flex';
                return;
            }
            picked = true;
            // Terapkan difficulty SEBELUM dunia/entitas dibangun: CFG dimutasi
            // dari CFG_BASE + high score dimuat per-difficulty.
            applyDifficulty(diff);
            setDifficulty(diff);
            document.getElementById('modeSelect').style.display = 'none';
            // Cutscene pembuka bertema Monas -> hanya untuk Survival; Campaign
            // langsung ke layar mulai (blocker) di bawahnya.
            if (mode === 'campaign') document.getElementById('cutscene').style.display = 'none';
            onPick(mode);
        });
    });

    initCoopLobby(onPick, () => diff, () => { picked = true; });
    initCutscene();
}

// ----- Lobby co-op LAN: buat/gabung room bernama (relay server.py) -----
// Alur: form (nama + room) -> CREATE/JOIN -> ruang tunggu (roster live) ->
// START (host, min 2 pemain) -> `lock` + `start {cfg, seed, diff, roster}` ->
// kedua peran memanggil onPick('survival') dgn netRole masing-masing.
// Semua teks English (aturan permanen).
function initCoopLobby(onPick, getDiff, markPicked) {
    const $ = (id) => document.getElementById(id);
    const lobby = $('coopLobby'), form = $('lobbyForm'), roomView = $('lobbyRoomView');
    const nameIn = $('lobbyName'), roomIn = $('lobbyRoom'), status = $('lobbyStatus');
    const serverIn = $('lobbyServer');
    const playersEl = $('lobbyPlayers'), title = $('lobbyRoomTitle'), diffEl = $('lobbyDiff');
    const startBtn = $('lobbyStart'), hint = $('lobbyHint'), share = $('lobbyShare');
    nameIn.value = localStorage.getItem('gibsPlayerName') || '';
    roomIn.value = localStorage.getItem('gibsRoomName') || '';
    serverIn.value = localStorage.getItem('gibsServerAddr') || '';

    let role = null;        // 'host' | 'client' (setelah balasan `role` relay)
    let roomCur = '';
    let myName = 'Player';
    let players = [];       // [{id, name}] — host merawat & broadcast `lobby`; client menerima
    let started = false;

    const setStatus = (msg, err = true) => {
        status.textContent = msg || '';
        status.style.color = err ? '#ff8a7a' : '#9be8a8';
    };

    // Normalisasi isian "Server Address" jadi URL WS lengkap. Menerima bentuk
    // longgar: "192.168.1.3", "192.168.1.3:8001", "ws://192.168.1.3:8001",
    // bahkan salah ketik "http(s)://..." (dikonversi ke ws/wss). Kosong = null
    // -> socket.js memakai default (host halaman) — jalur lama tak berubah.
    function normalizeWsAddr(raw) {
        let s = (raw || '').trim();
        if (!s) return null;
        s = s.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
        if (!/^wss?:\/\//i.test(s)) s = 'ws://' + s;
        const m = /^(wss?:\/\/)(\[[^\]]+\]|[^\/:]+)(:\d+)?(\/.*)?$/i.exec(s);
        if (!m) return s;   // bentuk aneh: biarkan apa adanya (WebSocket yang menolak)
        const defPort = (CFG.net && CFG.net.port) || 8001;
        return m[1] + m[2] + (m[3] || ':' + defPort) + (m[4] || '');
    }
    const showForm = () => { form.style.display = ''; roomView.style.display = 'none'; };
    const renderPlayers = () => {
        playersEl.innerHTML = '';
        players.forEach((p, i) => {
            const row = document.createElement('div');
            row.className = 'lobbyPlayer';
            row.textContent = `${i + 1}. ${p.name}${p.id === 0 ? ' (host)' : ''}`;
            playersEl.appendChild(row);
        });
        startBtn.disabled = players.length < 2;
        hint.textContent = role === 'host'
            ? (players.length < 2 ? 'Need at least 2 players to start'
                : 'All set — press START!')
            : 'Waiting for the host to start...';
    };
    const showRoom = () => {
        form.style.display = 'none';
        roomView.style.display = '';
        title.textContent = 'ROOM: ' + roomCur.toUpperCase();
        diffEl.textContent = role === 'host'
            ? 'Difficulty: ' + getDiff().toUpperCase() + ' (from the mode screen)'
            : 'Difficulty is chosen by the host';
        startBtn.style.display = role === 'host' ? '' : 'none';
        // Host: tampilkan alamat yang harus DIBAGIKAN ke teman. IP LAN diambil
        // dari endpoint /lanip server.py (browser tak bisa tahu IP LAN sendiri);
        // gagal senyap bila halaman tidak disajikan server.py (mis. GitHub Pages).
        share.textContent = '';
        if (role === 'host') {
            const wsPort = (CFG.net && CFG.net.port) || 8001;
            fetch('/lanip').then(r => r.ok ? r.text() : null).then(ip => {
                if (!ip || role !== 'host') return;
                share.textContent = `Friends: open http://${ip.trim()}:${location.port || 8000}` +
                    ` — or Server Address ws://${ip.trim()}:${wsPort}`;
            }).catch(() => { });
        }
        renderPlayers();
    };
    const broadcastLobby = () => sendMsg({ t: 'lobby', players });

    function begin(asHost) {
        myName = (nameIn.value.trim() || 'Player').slice(0, 16);
        const rn = roomIn.value.trim();
        if (!rn) { setStatus('Enter a room name'); return; }
        localStorage.setItem('gibsPlayerName', myName);
        localStorage.setItem('gibsRoomName', rn);
        localStorage.setItem('gibsServerAddr', serverIn.value.trim());
        // Alamat relay: isian "Server Address" menang; kosong = auto (host
        // halaman) — WAJIB diisi client bila halaman dibuka bukan dari server
        // host (mis. localhost / GitHub Pages), karena auto akan salah sasaran.
        const wsUrl = normalizeWsAddr(serverIn.value);
        setStatus('Connecting...', false);
        setMsgHandler(onLobbyMsg);
        setCloseHandler(() => {
            if (!started) { setStatus('Connection lost'); showForm(); }
        });
        connectWS(
            () => sendMsg(asHost
                ? { t: 'create', room: rn, name: myName }
                : { t: 'join', room: rn, name: myName }),
            () => setStatus('Could not reach the co-op relay. Is `python server.py` running on the host? '
                + 'If you opened the game from another address, fill Server Address (e.g. ws://192.168.1.3:8001).'),
            wsUrl);
    }

    function onLobbyMsg(m) {
        switch (m.t) {
            case 'role':
                role = m.role;
                roomCur = m.room;
                setLocalId(m.id);
                setRoomName(m.room);
                setLocalName(myName);
                players = [{ id: m.id, name: myName }];
                setStatus('');
                showRoom();
                return;
            case 'taken': setStatus('Room name already taken'); closeWS(); return;
            case 'noroom': setStatus('Room not found — check the room name'); closeWS(); return;
            case 'full': setStatus('Room is full'); closeWS(); return;
            case 'locked': setStatus('Game already started in that room'); closeWS(); return;
            case 'joined':   // (host) client baru masuk
                players.push({ id: m.id, name: m.name || ('Player ' + m.id) });
                broadcastLobby();
                renderPlayers();
                return;
            case 'leave':    // (host) client keluar dari lobby
                players = players.filter(p => p.id !== m.id);
                broadcastLobby();
                renderPlayers();
                return;
            case 'lobby':    // (client) roster dari host
                players = m.players || [];
                renderPlayers();
                return;
            case 'start':    // (client) host menekan START
                launch('client', m);
                return;
            case 'hostleft':
                setStatus('The host left the room');
                showForm();
                return;
        }
    }

    // Mulai game co-op utk peran ini. m = {cfg?, seed, diff, roster}.
    function launch(asRole, m) {
        started = true;
        markPicked();
        setNetRole(asRole);
        if (asRole === 'client') {
            // CFG = kiriman host APA ADANYA (sudah melalui applyDifficulty host)
            // — JANGAN jalankan applyDifficulty lokal (pitfall #5 rencana MP).
            Object.assign(CFG, m.cfg);
            setDifficulty(m.diff || 'normal');   // hanya kunci high-score lokal
        }
        setWorldSeed(m.seed);   // dunia taman identik di semua pemain (Fase 2)
        for (const r of (m.roster || []))
            if (r.id !== localId) rosterAdd(r.id, r.name);
        // Host: pesan selanjutnya ANTRE (hostUpdate men-drain per frame).
        // Client: coopClient.enter() memasang handler langsungnya sendiri.
        setMsgHandler(null);
        setCloseHandler(null);
        lobby.style.display = 'none';
        document.getElementById('modeSelect').style.display = 'none';
        document.getElementById('cutscene').style.display = 'none';
        onPick('survival');
    }

    $('lobbyCreate').addEventListener('click', () => begin(true));
    $('lobbyJoin').addEventListener('click', () => begin(false));
    $('lobbyBack').addEventListener('click', () => {
        closeWS();
        lobby.style.display = 'none';
        setStatus('');
    });
    $('lobbyLeave').addEventListener('click', () => {
        closeWS();
        role = null;
        players = [];
        showForm();
        setStatus('');
    });
    startBtn.addEventListener('click', () => {
        if (role !== 'host' || players.length < 2) return;
        const d = getDiff();
        applyDifficulty(d);      // CFG final host SEBELUM dikirim ke client
        setDifficulty(d);
        const seed = (Math.random() * 0x7fffffff) | 0;
        sendMsg({ t: 'lock' });  // room menolak join baru sejak game dimulai
        const msg = { t: 'start', cfg: CFG, seed, diff: d, roster: players };
        sendMsg(msg);
        launch('host', msg);
    });
}

// Slideshow pembuka 4 slide (DOM/CSS murni — tak menyentuh state game;
// finish() hanya menyingkap blocker yang klik-nya meminta PointerLock).
function initCutscene() {
    const cutscene = document.getElementById('cutscene');
    const slides = cutscene.querySelectorAll('.slide');
    const caption = document.getElementById('cutsceneCaption');
    const nextBtn = document.getElementById('nextBtn');
    const skipBtn = document.getElementById('skipBtn');
    const dotsWrap = document.getElementById('cutsceneDots');

    const captions = [
        "Jakarta has fallen... a citizen flees from the zombies.",
        "But they are not alone — a whole horde has risen.",
        "He runs toward Monas, the last place of refuge.",
        "Facing the horde, he stops and turns around..."
    ];

    slides.forEach(() => {
        const d = document.createElement('div');
        d.className = 'dot';
        dotsWrap.appendChild(d);
    });
    const dots = dotsWrap.querySelectorAll('.dot');

    let idx = 0;
    function show(i) {
        slides.forEach((s, n) => s.classList.toggle('active', n === i));
        dots.forEach((d, n) => d.classList.toggle('on', n === i));
        caption.textContent = captions[i];
        nextBtn.textContent = (i === slides.length - 1) ? "START ⚔️" : "Next ▶";
    }

    function finish() {
        cutscene.style.display = 'none';  // blocker di bawahnya muncul -> klik untuk pointerlock
    }

    nextBtn.addEventListener('click', () => {
        if (idx < slides.length - 1) show(++idx);
        else finish();
    });
    skipBtn.addEventListener('click', finish);

    show(0);
}
