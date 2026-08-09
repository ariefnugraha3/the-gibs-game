// MINIGAME HACK "SIGNAL TRACE" untuk Stage 5-6.
// Player mengunci kanal bergerak satu per satu ketika penanda berada di dalam
// jendela target. Salah kunci mengurangi waktu; timer habis memicu alarm.

import { CFG } from '../../../core/config.js';
import { setPaused, isPaused, isGameOver, keys } from '../../../core/state.js';
import { activeScene, setScene, resumeScene } from '../../../core/sceneManager.js';
import { requestLock } from '../../../core/input.js';
import { blocker } from '../../../core/dom.js';
import { clearMoveTarget } from '../../../entities/player.js';
import { playSFX, sfxSwitch, sfxPurchase, sfxEmpty, sfxRobotSpawn } from '../../../utils/sfx.js';
import { stage1Scene } from '../stages/stage1.js';

const FINISH_MS = 850;
const ALARM_MS = 1150;
const LOCK_FALLBACK_MS = 900;

let open = false;
let phase = 'idle';
let game = null;
let cb = null;
let prevScene = null;
let pendingOpts = null;
let tickTimer = 0, finishTimer = 0;
let headText = '', subText = '';
let rowEls = [], timerFillEl = null, timerTextEl = null, statusEl = null, bannerEl = null;

const overlayEl = () => document.getElementById('hackOverlay');
const wrap01 = v => ((v % 1) + 1) % 1;
const circularDistance = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Model murni. Kanal diberi kecepatan berbeda agar pola tidak terasa seperti
// satu bar progress yang dipecah menjadi beberapa bar.
export function buildSignalGame(count = CFG.campaign.signalTrace.channels) {
    const S = CFG.campaign.signalTrace;
    const n = Math.max(2, count | 0);
    const order = shuffle([...Array(n).keys()]);
    const channels = new Array(n).fill(null).map((_, i) => ({
        phase: Math.random(),
        target: wrap01(0.12 + order[i] / n * 0.76),
        speed: S.speedMin + (S.speedMax - S.speedMin) * (i / Math.max(1, n - 1)),
        dir: i & 1 ? -1 : 1,
        locked: false,
    }));
    return {
        channels, active: 0, strikes: 0, left: S.traceSec, max: S.traceSec,
        tolerance: S.lockTolerance, solved: false, failed: false,
    };
}

export function advanceSignalGame(g, dt) {
    if (!g || g.solved || g.failed || dt <= 0) return g;
    g.left = Math.max(0, g.left - dt);
    for (let i = g.active; i < g.channels.length; i++) {
        const c = g.channels[i];
        if (!c.locked) c.phase = wrap01(c.phase + c.speed * c.dir * dt);
    }
    if (g.left <= 0) g.failed = true;
    return g;
}

export function lockSignalGame(g) {
    if (!g || g.solved || g.failed) return 'none';
    const c = g.channels[g.active];
    if (!c) return 'none';
    if (circularDistance(c.phase, c.target) > g.tolerance) {
        g.strikes++;
        g.left = Math.max(0, g.left - CFG.campaign.signalTrace.missPenaltySec);
        c.dir *= -1;
        if (g.left <= 0) g.failed = true;
        return g.failed ? 'lost' : 'miss';
    }
    c.phase = c.target;
    c.locked = true;
    g.active++;
    if (g.active >= g.channels.length) {
        g.solved = true;
        return 'won';
    }
    return 'lock';
}

function render() {
    const root = overlayEl();
    if (!root || !game) return;
    root.innerHTML =
        '<div class="sigPanel">'
        + '<div class="sigHead"><span class="sigTag">SIGNAL TRACE</span>'
        + `<span class="sigTitle">${headText}</span></div>`
        + `<div class="sigSub">${subText}</div>`
        + '<div class="sigBoard" id="sigBoard"></div>'
        + '<div class="sigStatus" id="sigStatus"></div>'
        + '<div class="sigFoot">'
        + '<div class="sigTimer"><span>TRACE WINDOW</span><span class="sigTimerShell">'
        + '<span class="sigTimerFill" id="sigTimerFill"></span></span>'
        + '<span id="sigTimerText"></span></div>'
        + '<button class="sigLock" id="sigLock">LOCK SIGNAL</button>'
        + '<button class="sigAbort" id="sigAbort">ABORT / ESC</button>'
        + '</div><div class="sigBanner" id="sigBanner"></div></div>';
    const board = document.getElementById('sigBoard');
    timerFillEl = document.getElementById('sigTimerFill');
    timerTextEl = document.getElementById('sigTimerText');
    statusEl = document.getElementById('sigStatus');
    bannerEl = document.getElementById('sigBanner');
    rowEls = [];
    for (let i = 0; i < game.channels.length; i++) {
        const row = document.createElement('div');
        row.className = 'sigRow';
        row.innerHTML = `<span class="sigLabel">CH ${i + 1}</span>`
            + '<span class="sigTrack"><span class="sigTarget"></span><span class="sigCursor"></span></span>'
            + '<span class="sigState">WAIT</span>';
        if (board) board.appendChild(row);
        row.addEventListener('click', signalLock);
        rowEls.push({
            row,
            target: row.children[1]?.children[0],
            cursor: row.children[1]?.children[1],
            state: row.children[2],
        });
    }
    const lock = document.getElementById('sigLock');
    const abort = document.getElementById('sigAbort');
    if (lock) lock.addEventListener('click', signalLock);
    if (abort) abort.addEventListener('click', () => finish('abort'));
    root.style.display = 'flex';
    paint();
}

function paint() {
    if (!game) return;
    for (let i = 0; i < rowEls.length; i++) {
        const e = rowEls[i], c = game.channels[i];
        if (!e || !c) continue;
        if (e.target) {
            e.target.style.left = (c.target * 100).toFixed(2) + '%';
            e.target.style.width = (game.tolerance * 200).toFixed(2) + '%';
        }
        if (e.cursor) e.cursor.style.left = (c.phase * 100).toFixed(2) + '%';
        if (e.row.classList) {
            e.row.classList.toggle('active', i === game.active);
            e.row.classList.toggle('locked', c.locked);
        }
        if (e.state) e.state.innerText = c.locked ? 'LOCKED' : i === game.active ? 'ARMED' : 'WAIT';
    }
    const k = game.max > 0 ? game.left / game.max : 0;
    if (timerFillEl) {
        timerFillEl.style.width = (Math.max(0, k) * 100).toFixed(1) + '%';
        if (timerFillEl.classList) timerFillEl.classList.toggle('warn', k < 0.25);
    }
    if (timerTextEl) timerTextEl.innerText = Math.ceil(game.left) + 's';
    if (statusEl) statusEl.innerText = `CHANNEL ${Math.min(game.active + 1, game.channels.length)} / ${game.channels.length} | MISSED LOCKS ${game.strikes}`;
}

function showBanner(text, cls) {
    if (!bannerEl) return;
    bannerEl.innerText = text;
    if (bannerEl.classList) bannerEl.classList.add('on', cls);
}

function win() {
    phase = 'won';
    stopTick();
    playSFX(sfxPurchase);
    showBanner('SIGNAL CAPTURED', 'ok');
    finishTimer = setTimeout(() => finish('ok'), FINISH_MS);
}

function lose() {
    if (phase !== 'play') return;
    phase = 'lost';
    stopTick();
    playSFX(sfxEmpty);
    playSFX(sfxRobotSpawn, 0.9);
    showBanner('TRACE LOST - ALARM TRIGGERED', 'bad');
    finishTimer = setTimeout(() => finish('fail'), ALARM_MS);
}

export function signalLock() {
    if (!open || phase !== 'play' || !game) return false;
    const result = lockSignalGame(game);
    if (result === 'none') return false;
    if (result === 'miss') playSFX(sfxEmpty, 0.65);
    else playSFX(sfxSwitch, 0.7);
    paint();
    if (result === 'won') win();
    else if (result === 'lost') lose();
    return true;
}

export function signalTick(dt) {
    if (!open || phase !== 'play' || !game) return;
    advanceSignalGame(game, dt);
    paint();
    if (game.failed) lose();
}

function startTick() {
    stopTick();
    tickTimer = setInterval(() => signalTick(0.05), 50);
}

function stopTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = 0;
}

function finish(result) {
    if (!open) return;
    open = false;
    phase = 'idle';
    stopTick();
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = 0; }
    const root = overlayEl();
    if (root) { root.style.display = 'none'; root.innerHTML = ''; }
    rowEls = []; timerFillEl = timerTextEl = statusEl = bannerEl = null;
    game = null;
    const c = cb; cb = null;
    if (prevScene) resumeScene(prevScene);
    prevScene = null;
    if (result === 'ok') { if (c?.onSuccess) c.onSuccess(); }
    else if (c?.onFail) c.onFail(result);
    resumePlay();
}

function resumePlay() {
    requestLock();
    setTimeout(() => {
        if (open || isGameOver || !isPaused) return;
        if (typeof document.pointerLockElement !== 'undefined'
            && document.pointerLockElement === document.body) return;
        if (blocker) blocker.style.display = 'flex';
    }, LOCK_FALLBACK_MS);
}

export function beginSignalTraceMinigame(opts = {}) {
    if (open) return false;
    pendingOpts = opts;
    signalTraceScene.prev = activeScene;
    clearMoveTarget();
    keys.w = keys.a = keys.s = keys.d = false;
    setScene(signalTraceScene, {});
    return true;
}

export const isSignalTraceOpen = () => open;
export const signalTraceDebug = () => ({
    open, phase,
    active: game?.active ?? 0,
    total: game?.channels.length ?? 0,
    left: game?.left ?? 0,
    max: game?.max ?? 0,
    strikes: game?.strikes ?? 0,
    solved: !!game?.solved,
    failed: !!game?.failed,
    game,
});

export const signalTraceScene = {
    id: 'campaign-signal-trace',

    enter() {
        const o = pendingOpts || {};
        pendingOpts = null;
        prevScene = signalTraceScene.prev || null;
        cb = { onSuccess: o.onSuccess, onFail: o.onFail };
        headText = o.head || 'SECURE TERMINAL';
        subText = o.sub || 'Lock each carrier while its cursor crosses the capture window.';
        game = buildSignalGame();
        open = true;
        phase = 'play';
        setPaused(true);
        render();
        document.exitPointerLock();
        startTick();
    },

    restartScene: () => signalTraceScene.prev || stage1Scene,
    shopActive: () => true,
    shopKey(key) {
        if (key === 'escape' && phase === 'play') { finish('abort'); return true; }
        if ((key === ' ' || key === 'space' || key === 'enter') && phase === 'play') signalLock();
        return true;
    },
    playerCollide() { },
    groundHeight: (x, z, feetY) => feetY,
    bulletBlocked: () => false,
    blastBlocked: () => false,
    grenadeCollide() { },
    robotAI: () => ({ skip: true }),
    clampRobot() { },
    clampDropPos: (x, z) => [x, z],
    hudStatus: () => 'TRACING SECURE SIGNAL',
    radarLandmarks() { },
    prev: null,
};
