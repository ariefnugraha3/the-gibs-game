// The last signal: prebuilt archive terminal and a stage-owned ending director.
import { CFG } from '../../../../core/config.js';
import { camera, viewCam, scene, setCineFocus } from '../../../../core/renderer.js';
import { setCinematicActive, player, isPaused } from '../../../../core/state.js';
import { setCineBars, setCineFade, showCutsceneSkip, hideCutsceneSkip } from '../../../../core/dom.js';
import { releaseInputs } from '../../../../core/input.js';
import { clearMoveTarget } from '../../../../entities/player.js';
import { setAvatarRadioPose } from '../../../../entities/playerAvatar.js';
import { PAL } from '../../../../world/palette.js';
import { ambLight, hemiLight, dirLight, LIGHT_PRESETS } from '../../../../world/lighting.js';
import { MENU_CREDITS } from '../../../menu.js';
import { getSFXVolume, stopMusic } from '../../../../utils/sfx.js';
import { resolveBlockers } from '../../../../utils/collision.js';
import { S12_BOSS_CENTER, setStage12Sunrise } from './world.js';

export const S12_ARCHIVE = Object.freeze({ x: S12_BOSS_CENTER.x + 28, z: S12_BOSS_CENTER.z + 52 });
export const S12_ARCHIVE_STAND = Object.freeze({ x: S12_ARCHIVE.x + 13, z: S12_ARCHIVE.z });
const archiveBlockers = [{ x: S12_ARCHIVE.x, z: S12_ARCHIVE.z, hx: 6, hz: 11.5,
    axx: 1, axz: 0, azx: 0, azz: 1, rad: Math.hypot(6, 11.5), top: 27, standable: false }];
export const resolveStage12Archive = (pos, radius, feetY) => resolveBlockers(pos, radius, feetY, archiveBlockers);
const cam = { x: 0, y: 0, z: 0 };
const el = id => document.getElementById(id);
const cfg = () => CFG.campaign.stage12.ending;
const clamp = n => Math.max(0, Math.min(1, n));
const css = n => '#' + n.toString(16).padStart(6, '0');
let rig, marker, display, canvas, ctx, texture;
let state = 'idle', t = 0, progress = 0, sent = false, creditPage = -1;
let lookY = null, hooks = null, lastPaint = '', audio = null;
let completed = false, visited = [], bgStart = null, fogStart = null, lightStart = null;

export function ensureStage12Epilogue(parent) {
    if (rig) return;
    rig = new THREE.Group(); rig.name = 'Stage12-Archive';
    rig.position.set(S12_ARCHIVE.x, 0, S12_ARCHIVE.z); parent.add(rig);
    const metal = new THREE.MeshLambertMaterial({ color: PAL.gunmetal });
    const trim = new THREE.MeshLambertMaterial({ color: PAL.steel });
    const box = (w, h, d, x, y, z, material) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(x, y, z); rig.add(m); return m;
    };
    box(12, 2, 22, 0, 1, 0, trim);
    box(8, 12, 17, 0, 8, 0, metal);
    box(5, 13, 23, 0, 20, 0, trim);
    box(10, 1.5, 20, 5, 7.3, 0, metal);
    box(2, 37, 2, -4, 19, -9, trim);
    canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 448;
    ctx = canvas.getContext('2d'); texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    display = new THREE.Mesh(new THREE.PlaneGeometry(21, 12),
        new THREE.MeshBasicMaterial({ map: texture }));
    display.rotation.y = Math.PI / 2; display.position.set(2.6, 20, 0); rig.add(display);
    marker = new THREE.Mesh(new THREE.PlaneGeometry(12, 19),
        new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true, opacity: .55,
            side: THREE.DoubleSide, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(S12_ARCHIVE_STAND.x, .45, S12_ARCHIVE_STAND.z);
    marker.name = 'Stage12-Archive-Stand'; parent.add(marker); marker.visible = false;
    paint('STANDBY', 0);
}

function paint(label, fraction) {
    const pct = Math.floor(clamp(fraction) * 100), key = label + pct;
    if (!ctx || key === lastPaint) return;
    lastPaint = key;
    ctx.fillStyle = css(PAL.ink); ctx.fillRect(0, 0, 768, 448);
    ctx.fillStyle = css(PAL.amber); ctx.font = '28px Gasalt';
    ctx.fillText('CIVIL ARCHIVE / MONAS', 32, 52);
    ctx.fillStyle = css(PAL.white); ctx.font = '22px Gasalt';
    ['OPERATION ORDERS', 'MISSING PERSONS', 'MANDATE SIGNATORIES'].forEach((s, i) => ctx.fillText(s, 32, 108 + i * 38));
    ctx.fillStyle = css(PAL.tech); ctx.font = '38px Gasalt';
    ctx.fillText(label, 32, 282);
    ctx.fillStyle = css(PAL.steel); ctx.fillRect(32, 314, 704, 12);
    ctx.fillStyle = css(PAL.amber); ctx.fillRect(32, 314, 704 * clamp(fraction), 12);
    ctx.font = '24px Gasalt';
    ctx.fillText(label === 'TRANSMITTING' ? `${pct}% / ALL CIVILIAN CHANNELS`
        : sent ? 'PUBLIC COPIES VERIFIED / POWERING DOWN' : 'READ ONLY / LOCAL RECORD', 32, 390);
    texture.needsUpdate = true;
}

// Quiet wind and one short radio carrier; no new music track or asset dependency.
function startAmbience() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
        const ac = new AudioCtx(), gain = ac.createGain(), filter = ac.createBiquadFilter();
        const buffer = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const wind = ac.createBufferSource(); wind.buffer = buffer; wind.loop = true;
        filter.type = 'lowpass'; filter.frequency.value = 360;
        gain.gain.value = getSFXVolume() * .045;
        wind.connect(filter); filter.connect(gain); gain.connect(ac.destination); wind.start();
        audio = { ac, gain, wind };
        ac.resume().catch(() => {});
    } catch { stopAmbience(); }
}
function stopAmbience() {
    if (!audio) return;
    audio.wind.stop(); audio.ac.close().catch(() => {}); audio = null;
}
function carrier() {
    if (!audio) return;
    const { ac } = audio, tone = ac.createOscillator(), gain = ac.createGain();
    tone.frequency.value = 740; gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(getSFXVolume() * .06, ac.currentTime + .04);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + .32);
    tone.connect(gain); gain.connect(ac.destination); tone.start(); tone.stop(ac.currentTime + .35);
}

function card(kicker = '', title = '', copy = '') {
    el('endingCard').style.display = title ? 'block' : 'none';
    el('endingCard').style.opacity = '1';
    el('endingCard').setAttribute('aria-hidden', title ? 'false' : 'true');
    el('endingKicker').textContent = kicker; el('endingTitle').textContent = title;
    el('endingCopy').textContent = copy;
}
function objective(text = '') {
    el('endingObjective').textContent = text;
    el('endingObjective').style.display = text ? 'block' : 'none';
}
function lock(on) {
    releaseInputs(); clearMoveTarget(); setCinematicActive(on); setCineBars(on);
    if (!on) { lookY = null; setCineFocus(null); setAvatarRadioPose(false); }
}
function walkSkip(event) {
    if (state !== 'walk' || isPaused || event.repeat || ![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault(); finishStage12Epilogue();
}
function shot(x, z, height, dx, dy, dz, snap = false) {
    lookY = height; cam.x = dx; cam.y = height + dy - camera.position.y; cam.z = dz;
    setCineFocus(x, z, snap);
}
function terminalShot(snap = false) {
    const halfFov = (viewCam?.fov || 50) * Math.PI / 360;
    const d = Math.max(10 / Math.tan(halfFov), 16 / (Math.tan(halfFov) * (viewCam?.aspect || 16 / 9)));
    shot(S12_ARCHIVE.x + 2.6, S12_ARCHIVE.z, 20, d, 0, 0, snap);
}
function sunrise(k) {
    k = clamp(k); setStage12Sunrise(k);
    for (const [light, key] of [[ambLight, 'amb'], [hemiLight, 'hemi'], [dirLight, 'dir']])
        if (light) light.intensity = LIGHT_PRESETS.night[key]
            + (LIGHT_PRESETS.outdoor[key] - LIGHT_PRESETS.night[key]) * k;
    if (bgStart && scene.background?.copy) scene.background.copy(bgStart).lerp(newDawnColor, k);
    if (fogStart && scene.fog?.color?.copy) scene.fog.color.copy(fogStart).lerp(newDawnColor, k * .65);
}
// Assigned at build/start time, never construct THREE values at module evaluation.
let newDawnColor;
function enter(next) {
    state = next; t = 0; visited.push(next);
    if (next === 'walk') {
        lock(false); marker.visible = true; paint('ARCHIVE AVAILABLE', 0);
        objective('THE LAST SIGNAL / Reach the amber marker at the vault terminal');
        for (const key of ['networkSafe', 'civilianNorth', 'civilianShelter', 'archiveBeacon']) hooks.say(key);
    } else if (next === 'archive') {
        lock(true); marker.visible = false; objective();
        camera.position.set(S12_ARCHIVE_STAND.x, CFG.player.eyeHeight, S12_ARCHIVE_STAND.z);
        player.vy = 0; player.onGround = true;
        hooks.say('archiveFound'); hooks.say('archiveChoice');
        shot(S12_ARCHIVE.x + 9, S12_ARCHIVE.z, 15, 52, 18, 58, true);
    } else if (next === 'transmit') {
        // Face the actual screen; fit both axes, including portrait windows.
        terminalShot(true);
        paint('TRANSMITTING', 0);
    } else if (next === 'dawn') {
        sent = true; progress = 1; paint('ARCHIVE RELEASED', 1);
        hooks.say('archiveSent'); hooks.say('finalGibran');
        shot(S12_ARCHIVE_STAND.x, S12_ARCHIVE_STAND.z, 14, 120, 75, 150, true);
    } else if (next === 'title') {
        setAvatarRadioPose(false); paint('TRANSMITTER OFFLINE', 1);
        card('JAKARTA / FIRST LIGHT', 'THE SIGNAL IS OURS.',
            'The signal has returned.\nNow the city must learn to listen to itself.');
    } else if (next === 'credits') {
        creditPage = -1; showCredits(0);
    } else if (next === 'relay') {
        card('CIVILIAN RECEIVER / ARCHIVE COPY CONFIRMED', 'UNKNOWN RELAY',
            'SIGNAL ORIGIN: OUTSIDE JAVA\n\nThank you for playing.\nFor carrying the signal all the way home.'); carrier();
    } else if (next === 'fade') {
        // Fade the receiver over black, never reveal the daylight scene beneath it.
        setCineFade(1, 0);
    }
}
function showCredits(page) {
    if (page === creditPage) return;
    creditPage = page;
    const groups = MENU_CREDITS.groups.slice(page * 2, page * 2 + 2);
    card('DECOMMISSION DAY', page === 0 ? 'Sunday Afternoon Games' : 'CREDITS',
        groups.map(g => `${g.role}\n${g.name}`).join('\n\n') + '\n\n' + MENU_CREDITS.footer);
}

export function beginStage12Epilogue(callbacks, wreck) {
    resetStage12Epilogue(); hooks = callbacks; stopMusic();
    completed = false; visited = []; bgStart = scene.background?.clone?.(); fogStart = scene.fog?.color?.clone?.();
    lightStart = [ambLight, hemiLight, dirLight].map(light => light?.intensity);
    newDawnColor = new THREE.Color(PAL.amberDim);
    document.body.classList.add('epilogue'); lock(true); setCineFade(0, 0);
    enter('settle');
    const angle = Math.atan2(wreck.x, wreck.z);
    shot(wreck.x, wreck.z, 24, Math.sin(angle) * 260, 125, Math.cos(angle) * 260, true);
    showCutsceneSkip(finishStage12Epilogue); startAmbience();
    window.addEventListener('keydown', walkSkip);
}

export function updateStage12Epilogue(dt) {
    if (!hooks || completed) return;
    t += Math.max(0, dt);
    if (audio) audio.gain.gain.value = getSFXVolume() * .045 * (state === 'relay' ? .25 : 1);
    if (state === 'settle' && t >= cfg().settleSec + cfg().dialogueDelaySec) enter('walk');
    else if (state === 'walk') {
        setAvatarRadioPose(false); // Radio is heard while the player can walk normally.
        if (hooks.idle() && Math.hypot(camera.position.x - S12_ARCHIVE_STAND.x,
            camera.position.z - S12_ARCHIVE_STAND.z) <= cfg().interactionRange) enter('archive');
    } else if (state === 'archive') {
        setAvatarRadioPose(true, -Math.PI / 2, 'consoleWork', clamp(t / cfg().transmitSec));
        if (hooks.idle()) enter('transmit');
    } else if (state === 'transmit') {
        terminalShot();
        progress = clamp(t / cfg().transmitSec); paint('TRANSMITTING', progress);
        setAvatarRadioPose(true, -Math.PI / 2, 'consoleWork', progress);
        if (progress >= 1) enter('dawn');
    } else if (state === 'dawn') {
        const k = clamp(t / cfg().sunriseSec); sunrise(k);
        const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : k;
        shot(S12_ARCHIVE_STAND.x * (1 - motion * .7), S12_ARCHIVE_STAND.z,
            14 + 100 * motion, 120 + 170 * motion, 75 + 70 * motion, 150 + 210 * motion);
        if (k >= 1 && hooks.idle()) enter('title');
    } else if (state === 'title' && t >= cfg().titleSec) enter('credits');
    else if (state === 'credits') {
        const page = Math.floor(t / cfg().creditPageSec);
        if (page >= Math.ceil(MENU_CREDITS.groups.length / 2)) enter('relay');
        else showCredits(page);
    } else if (state === 'relay' && t >= cfg().relaySec) enter('fade');
    else if (state === 'fade') {
        el('endingCard').style.opacity = String(1 - clamp(t / cfg().fadeSec));
        if (t >= cfg().fadeSec) finishStage12Epilogue();
    }
}

export function finishStage12Epilogue() {
    if (!hooks || completed) return;
    completed = true; sent = true; progress = 1; sunrise(1); paint('TRANSMITTER OFFLINE', 1);
    marker.visible = false; state = 'done';
    const done = hooks.done; hooks = null;
    cleanup(); done();
}
function cleanup() {
    window.removeEventListener('keydown', walkSkip);
    stopAmbience(); hideCutsceneSkip(); card(); objective();
    document.body.classList.remove('epilogue'); setAvatarRadioPose(false);
    lookY = null; setCineFocus(null); setCineBars(false); setCinematicActive(false); setCineFade(0, 0);
}
export function resetStage12Epilogue() {
    cleanup(); hooks = null; state = 'idle'; t = 0; progress = 0; sent = false;
    if (bgStart && scene.background?.copy) scene.background.copy(bgStart);
    if (fogStart && scene.fog?.color?.copy) scene.fog.color.copy(fogStart);
    if (lightStart) [ambLight, hemiLight, dirLight].forEach((light, i) => {
        if (light && lightStart[i] != null) light.intensity = lightStart[i];
    });
    bgStart = fogStart = lightStart = null; setStage12Sunrise(0);
    completed = false; creditPage = -1; visited = []; lastPaint = '';
    if (marker) marker.visible = false;
    paint('STANDBY', 0);
}
export const stage12EpilogueCamera = () => state !== 'idle' && state !== 'walk' && state !== 'done' ? cam : null;
export const stage12EpilogueLookY = () => lookY;
export const stage12EpilogueDebug = () => ({ state, time: t, progress, sent, completed,
    markerVisible: !!marker?.visible, creditPage, visited: [...visited], terminal: S12_ARCHIVE, stand: S12_ARCHIVE_STAND });
