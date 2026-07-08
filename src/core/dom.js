// Referensi elemen DOM overlay + helper UI kecil yang menulis DOM langsung.
// Module script dieksekusi setelah DOM siap (defer), jadi query aman di sini.

export const scoreText = document.getElementById('scoreText');
export const ammoText = document.getElementById('ammoText');
export const healthFill = document.getElementById('healthFill');
export const waveText = document.getElementById('waveText');
// Inventori (sisi kanan): 4 slot (1/2 senjata, 3 granat, 4 medkit). Tiap slot =
// { row, name }; hud.updateUI menulis nama + kelas 'active'/'dim'.
export const invSlots = [1, 2, 3, 4].map(i => ({
    row: document.getElementById('invSlot' + i),
    name: document.getElementById('invName' + i),
}));
export const blocker = document.getElementById('blocker');
export const gameOverScreen = document.getElementById('gameOver');
export const finalScoreEl = document.getElementById('finalScore');
export const bestScoreEl = document.getElementById('bestScore');
export const gameOverTitle = document.getElementById('gameOverTitle');
export const crosshair = document.getElementById('crosshair');
export const damageEl = document.getElementById('damage');
export const staminaFill = document.getElementById('staminaFill');
export const stageMsgEl = document.getElementById('stageMsg');
export const radar = document.getElementById('radar');
export const radarCtx = radar.getContext('2d');

// Radar tajam di layar HiDPI: backing store diskalakan devicePixelRatio (ukuran CSS tetap 150px)
const RADAR_DPR = Math.min(window.devicePixelRatio || 1, 2);
radar.width = 150 * RADAR_DPR;
radar.height = 150 * RADAR_DPR;
radarCtx.scale(RADAR_DPR, RADAR_DPR);

export function flashDamage() {
    damageEl.style.opacity = 0.85;
    setTimeout(() => damageEl.style.opacity = 0, 120);
}

// Indikator ARAH serangan (IMPROVEMENT-PLAN #8): baji merah di tepi layar,
// diputar ke sudut penyerang relatif hadap kamera (0 = depan, + = searah
// jarum jam; hitung dgn attackerAngle di entities/zombies.js). SATU elemen
// di-reuse — jangan membuat elemen per serangan.
let hitDirT = 0;
export function showHitDir(relAngle) {
    const el = document.getElementById('hitDir');
    el.style.transform = `rotate(${relAngle}rad)`;
    el.style.opacity = 0.9;
    clearTimeout(hitDirT);
    hitDirT = setTimeout(() => { el.style.opacity = 0; }, 500);
}

// Info item yang diambil — feed di kiri layar (muncul -> diam -> memudar).
// Maks 5 baris; baris tertua dibuang agar tidak menumpuk saat memborong drop.
export function showPickup(text, color) {
    const feed = document.getElementById('pickupFeed');
    const el = document.createElement('div');
    el.className = 'pickupMsg';
    el.style.color = color;
    el.innerText = text;
    feed.appendChild(el);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
    setTimeout(() => el.classList.add('fade'), 2000);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 2700);
}

// Pesan stage (campaign): tampil sebentar di sepertiga atas layar
let stageMsgTimer = 0;
export function showStageMsg(text, dur = 4200) {
    stageMsgEl.innerText = text;
    stageMsgEl.style.opacity = 1;
    clearTimeout(stageMsgTimer);
    stageMsgTimer = setTimeout(() => { stageMsgEl.style.opacity = 0; }, dur);
}

export function hideStageMsg() {
    stageMsgEl.style.opacity = 0;
}

// Film grain halus: tekstur noise dibuat sekali, digeser via CSS keyframes
export function initGrain() {
    const gcv = document.createElement('canvas');
    gcv.width = 128; gcv.height = 128;
    const gg = gcv.getContext('2d');
    const gid = gg.createImageData(128, 128);
    for (let i = 0; i < gid.data.length; i += 4) {
        const v = 110 + Math.random() * 90 | 0;
        gid.data[i] = gid.data[i + 1] = gid.data[i + 2] = v;
        gid.data[i + 3] = 255;
    }
    gg.putImageData(gid, 0, 0);
    document.getElementById('grain').style.backgroundImage = `url(${gcv.toDataURL()})`;
}

// Layar error fatal (config gagal / dibuka via file://) — teks UI English.
export function showFatal(msg) {
    const el = document.getElementById('fatalMsg');
    el.innerHTML = msg;
    el.style.display = 'flex';
}
