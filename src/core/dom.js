// Referensi elemen DOM overlay + helper UI kecil yang menulis DOM langsung.
// Module script dieksekusi setelah DOM siap (defer), jadi query aman di sini.

export const scoreText = document.getElementById('scoreText');   // ANGKA uang saja (label "MONEY" statis di HTML — 2026-07-22 dulu "SCORE")
// Modul amunisi kanan-bawah (redesign HUD 2026-07-10): nama senjata/item,
// hitungan peluru besar, "/ maxAmmo" (tanpa magazen sejak 2026-07-11),
// baris petunjuk (lempar/medkit), dan kontainernya.
export const ammoWeapon = document.getElementById('ammoWeapon');
export const ammoCount = document.getElementById('ammoCount');
export const ammoMags = document.getElementById('ammoMags');
export const ammoHint = document.getElementById('ammoHint');
export const ammoBox = document.getElementById('ammoBox');
export const healthFill = document.getElementById('healthFill');
export const healthNum = document.getElementById('healthNum');   // angka HP di atas bar
// Bar ARMOR (2026-07-13): tampil hanya saat player memakai armor (shop Survival)
export const armorRow = document.getElementById('armorRow');
export const armorFill = document.getElementById('armorFill');
export const armorNum = document.getElementById('armorNum');
export const waveText = document.getElementById('waveText');
// Inventori (pojok kanan-bawah, baris IKON): 4 slot (1/2 senjata, 3 granat,
// 4 medkit). Tiap slot = { row, icon, count }; hud.updateInventory mengisi SVG
// ikon (icon.innerHTML) + hitungan (count) + kelas 'active'/'dim'.
export const invSlots = [1, 2, 3, 4].map(i => ({
    row: document.getElementById('invSlot' + i),
    icon: document.getElementById('invIcon' + i),
    count: document.getElementById('invCount' + i),
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
// Bar channel Medkit (tombol 4): tampil saat memegang medkit; fill = progress tahan klik.
export const medkitBar = document.getElementById('medkitBar');
export const medkitBarFill = document.getElementById('medkitBarFill');
// Bar progress DOWNLOAD (stage 1): unduh data 10 dtk (gerak dibekukan). Dipakai
// ulang stage 2 utk "RESTORING GENERATOR" (label bisa di-set).
const downloadBar = document.getElementById('downloadBar');
const downloadBarFill = document.getElementById('downloadBarFill');
const downloadBarPct = document.getElementById('downloadBarPct');
const downloadBarLabel = document.getElementById('downloadBarLabel');

// Tampilkan / perbarui (k = 0..1) / sembunyikan bar progress (label opsional).
export function showDownloadBar(label) {
    if (downloadBarLabel && label) downloadBarLabel.innerText = label;
    if (downloadBar) downloadBar.style.display = 'flex';
    setDownloadProgress(0);
}
export function setDownloadProgress(k) {
    const pct = Math.max(0, Math.min(100, Math.round(k * 100)));
    if (downloadBarFill) downloadBarFill.style.width = pct + '%';
    if (downloadBarPct) downloadBarPct.innerText = pct + '%';
}
export function hideDownloadBar() {
    if (downloadBar) downloadBar.style.display = 'none';
}

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
// jarum jam; hitung dgn attackerAngle di entities/robots.js). SATU elemen
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
// MODE SINEMATIK (2026-07-17, cutscene heli stage 4): letterbox hitam meluncur
// masuk perlahan dari atas & bawah (transisi CSS #cineTop/#cineBot) dan seluruh
// HUD memudar (body.cine — daftar elemen di style.css). Murni presentasi;
// pembekuan input/kontrol ditangani state.cinematicActive.
export function setCineBars(on) {
    const top = document.getElementById('cineTop');
    const bot = document.getElementById('cineBot');
    if (top) top.classList.toggle('on', !!on);
    if (bot) bot.classList.toggle('on', !!on);
    if (document.body && document.body.classList) document.body.classList.toggle('cine', !!on);
}

// ===== Tombol SKIP CUTSCENE (2026-07-19, permintaan user): tombol kanan-bawah
// yang tampil selama cutscene (intro campaign & tank-boss stage 4). Dibuat
// LAZY (sekali) via JS supaya index.html tak perlu berubah; style inline.
// KLIK tombol dan tombol SPACE/Enter (input.js, saat pointer terkunci kursor
// tak terlihat — cutscene tank) sama-sama lewat triggerCutsceneSkip().
// Callback SEKALI-JALAN: sekali terpicu langsung dilepas (anti double-skip). =====
let skipBtn = null, skipCb = null;
export function showCutsceneSkip(onSkip) {
    skipCb = onSkip;
    if (!skipBtn) {
        skipBtn = document.createElement('button');
        skipBtn.id = 'cutsceneSkip';
        skipBtn.textContent = 'SKIP ▸ [SPACE]';
        skipBtn.style.cssText =
            'position:fixed;right:26px;bottom:64px;z-index:60;display:none;'
            + 'padding:10px 18px;background:rgba(20,18,14,0.82);color:#ffb03b;'
            + 'border:1px solid rgba(255,176,59,0.55);border-radius:4px;'
            + 'font-family:inherit;font-size:13px;font-weight:700;letter-spacing:0.14em;'
            + 'cursor:pointer;pointer-events:auto;';
        skipBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerCutsceneSkip(); });
        if (document.body) document.body.appendChild(skipBtn);
    }
    skipBtn.style.display = 'block';
}
export function hideCutsceneSkip() {
    skipCb = null;
    if (skipBtn) skipBtn.style.display = 'none';
}
export function triggerCutsceneSkip() {
    if (!skipCb) return false;
    const cb = skipCb;
    skipCb = null;   // sekali-jalan (path skip memanggil hideCutsceneSkip juga)
    cb();
    return true;
}

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
