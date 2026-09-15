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
import { stage1Scene } from '../stages/stage1/index.js';

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
let rowEls = [], timerFillEl = null, timerStateEl = null, bannerEl = null;
let lockEl = null, abortEl = null;

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

// Jendela yang melintasi ujung track tetap tergambar sesuai jarak sirkular model.
export function signalCaptureWindows(target, tolerance) {
    if (tolerance >= 0.5) return [{ left: 0, width: 1 }];
    const left = wrap01(target) - tolerance, right = wrap01(target) + tolerance;
    if (left < 0) return [{ left: 0, width: right }, { left: 1 + left, width: -left }];
    if (right > 1) return [{ left, width: 1 - left }, { left: 0, width: right - 1 }];
    return [{ left, width: right - left }];
}

function render() {
    const root = overlayEl();
    if (!root || !game) return;
    root.classList.add('signalTrace');
    root.innerHTML =
        '<section class="sigPanel" role="dialog" aria-modal="true" aria-labelledby="sigHeading" aria-describedby="sigBanner">'
        + '<header class="sigHead"><h1 id="sigHeading">SIGNAL TRACE</h1>'
        + '<span class="sigTitle" id="sigTitle"></span></header>'
        + '<div class="sigBanner" id="sigBanner" role="status" aria-live="polite"></div>'
        + '<div class="sigBoard" id="sigBoard" role="group" aria-label="Signal carriers">'
        + '<div class="sigColumns" aria-hidden="true"><span>CARRIER</span><span>CAPTURE WINDOW</span><span>STATE</span></div></div>'
        + '<footer class="sigFoot">'
        + '<div class="sigTimer"><span class="sigTimerLabel">TRACE INTEGRITY</span>'
        + '<span class="sigTimerState" id="sigTimerState"></span>'
        + '<span class="sigTimerShell" aria-hidden="true"><span class="sigTimerFill" id="sigTimerFill"></span></span></div>'
        + '<button type="button" class="sigLock" id="sigLock" title="Lock active carrier (Space or Enter)">LOCK SIGNAL</button>'
        + '<button type="button" class="sigAbort" id="sigAbort" title="Abort trace (Escape)">ABORT</button>'
        + '</footer></section>';
    document.getElementById('sigTitle').textContent = headText;
    const board = document.getElementById('sigBoard');
    timerFillEl = document.getElementById('sigTimerFill');
    timerStateEl = document.getElementById('sigTimerState');
    bannerEl = document.getElementById('sigBanner');
    bannerEl.textContent = subText;
    rowEls = [];
    for (let i = 0; i < game.channels.length; i++) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'sigRow';
        row.dataset.channel = i;
        row.title = 'Lock carrier ' + (i + 1);
        const windows = signalCaptureWindows(game.channels[i].target, game.tolerance);
        row.innerHTML = `<span class="sigLabel">CH ${String(i + 1).padStart(2, '0')}</span>`
            + '<span class="sigTrack" aria-hidden="true">'
            + windows.map(w => `<span class="sigTarget" style="left:${w.left * 100}%;width:${w.width * 100}%"></span>`).join('')
            + '<span class="sigCursorRail"><span class="sigCursor"></span></span></span>'
            + '<span class="sigState"></span>';
        if (board) board.appendChild(row);
        row.addEventListener('click', () => { if (game?.active === i) signalLock(); });
        rowEls.push({
            row, cursor: row.querySelector('.sigCursorRail'), state: row.querySelector('.sigState'), mode: '',
        });
    }
    lockEl = document.getElementById('sigLock');
    abortEl = document.getElementById('sigAbort');
    lockEl.addEventListener('click', signalLock);
    abortEl.addEventListener('click', () => finish('abort'));
    const panel = root.querySelector('.sigPanel');
    panel.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.stopPropagation();
            const controls = [...panel.querySelectorAll('button:not(:disabled)')];
            const next = controls.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1);
            if (next < 0 || next >= controls.length) {
                e.preventDefault(); controls[e.shiftKey ? controls.length - 1 : 0]?.focus();
            }
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); e.stopPropagation();
            if (!e.repeat) e.target.closest('button')?.click();
        }
    });
    root.style.display = 'flex';
    paint();
    lockEl.focus({ preventScroll: true });
}

function paint() {
    if (!game) return;
    const playable = phase === 'play' && !game.solved && !game.failed;
    for (let i = 0; i < rowEls.length; i++) {
        const e = rowEls[i], c = game.channels[i];
        if (!e || !c) continue;
        const active = playable && i === game.active;
        const mode = c.locked ? 'locked' : !playable ? 'offline' : active ? 'active' : 'queued';
        // Tick hanya memindahkan rail; label, kelas, dan target tidak ditulis 20x/detik.
        if (e.cursor && (!c.locked || e.mode !== mode)) {
            e.cursor.style.transform = `translateX(${c.phase * 100}%)`;
        }
        if (e.mode !== mode) {
            e.mode = mode;
            e.row.className = 'sigRow ' + mode;
            e.row.disabled = !active;
            e.row.setAttribute('aria-label', `Carrier ${i + 1}, ${mode}`);
            if (active) e.row.setAttribute('aria-current', 'step');
            else e.row.removeAttribute('aria-current');
            if (e.state) e.state.textContent = c.locked ? 'LOCKED' : active ? 'ACTIVE' : playable ? 'QUEUED' : 'OFFLINE';
        }
    }
    const k = game.max > 0 ? game.left / game.max : 0;
    if (timerFillEl) {
        timerFillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
        if (timerFillEl.classList) timerFillEl.classList.toggle('warn', k < 0.25);
    }
    const traceState = game.solved ? 'SECURED' : game.failed ? 'DETECTED' : k < 0.25 ? 'CRITICAL' : 'TRACING';
    if (timerStateEl && timerStateEl.textContent !== traceState) timerStateEl.textContent = traceState;
    if (lockEl) lockEl.disabled = !playable;
    if (abortEl) abortEl.disabled = !playable;
}

function showBanner(text, cls) {
    if (!bannerEl) return;
    bannerEl.textContent = text;
    bannerEl.className = 'sigBanner' + (cls ? ' ' + cls : '');
}

function win() {
    if (phase !== 'play') return;
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
    if (result === 'miss') {
        playSFX(sfxEmpty, 0.65);
        showBanner('CAPTURE MISSED - CARRIER REVERSED', 'bad');
    } else {
        playSFX(sfxSwitch, 0.7);
        showBanner(subText, '');
    }
    const focused = document.activeElement;
    paint();
    if (focused?.classList.contains('sigRow') && focused.disabled) {
        rowEls[game.active]?.row.focus({ preventScroll: true });
    }
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
    if (!open || (result === 'abort' && phase !== 'play')) return;
    open = false;
    phase = 'idle';
    stopTick();
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = 0; }
    const root = overlayEl();
    if (root) { root.style.display = 'none'; root.innerHTML = ''; root.classList.remove('signalTrace'); }
    rowEls = []; timerFillEl = timerStateEl = bannerEl = lockEl = abortEl = null;
    game = null;
    const c = cb; cb = null;
    if (prevScene) resumeScene(prevScene);
    prevScene = null;
    if (result === 'ok') { if (c?.onSuccess) c.onSuccess(); }
    else if (c?.onFail) c.onFail(result);
    if (!open) resumePlay();
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
        subText = o.sub || 'Capture the encrypted carriers to override security.';
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
