// Shop antar-gelombang Survival (overhaul MENU KLIK 2026-07-08): overlay modal
// berbasis mouse (game DI-PAUSE + pointer dilepas oleh input.js selama
// shopActive()). Terbuka OTOMATIS saat sebuah wave selesai (scene memanggil
// openShop() setelah hitung mundur). Tata letak (redesign 2026-07-09): GRID
// kartu item — tiap kartu punya nama + tombol Buy SENDIRI (kiri-bawah kartu);
// panel deskripsi + harga LEBAR PENUH di bawah grid (diperbarui saat hover/pilih
// kartu, TIDAK membeli); bawah-kiri = skor, bawah-kanan = Start Next Wave. Item:
// isi ulang Ammo/Grenade, Replenish Health, Medkit, Heal & Strengthen Monas,
// Radar, dan BELI Shotgun / Assault Rifle. Mata uang = skor. Membeli senjata ke-3
// (sudah bawa 2 = maks) -> tampilkan pemilih GANTI senjata.
// Semua teks UI English (aturan permanen). Impor Monas/Next-Wave dari scene
// (index.js) — circular, hanya dipakai DI DALAM fungsi (pola arsitektur).

import { CFG } from '../../core/config.js';
import { player, score, addScore, syncOwnedFromWeapons } from '../../core/state.js';
import { updateUI } from '../../core/hud.js';
import { playSFX, sfxPurchase } from '../../utils/sfx.js';
import { WEAPON_DEF, refreshOwnedWeapon } from '../../entities/weapons.js';
import { healMonas, strengthenMonas, startNextWave, isMonasFullyStrengthened } from './index.js';

let open = false;
let selectedId = null;
let notice = '', noticeErr = false, noticeT = 0;
let pendingWeapon = null;   // senjata yang menunggu konfirmasi GANTI (slot penuh)
let confirmNext = false;    // prompt "Are you ready?" sebelum mulai wave berikutnya
const overlay = () => document.getElementById('shopOverlay');

export function isShopOpen() { return open; }

export function closeShop() {
    if (!open) return;
    open = false;
    notice = '';
    pendingWeapon = null;
    confirmNext = false;
    const o = overlay();
    o.style.display = 'none';
    o.innerHTML = '';
}

export function openShop() {
    open = true;
    notice = '';
    pendingWeapon = null;
    confirmNext = false;
    selectedId = catalog()[0].id;
    render();
    overlay().style.display = 'flex';
    // Lepas pointer-lock agar kursor bisa memakai menu klik. input.js men-pause
    // & menyembunyikan blocker selama activeScene.shopActive() true.
    document.exitPointerLock();
}

// --- Katalog item (data-driven) --------------------------------------------
// { id, name, desc, cost, weapon?, apply() }. apply() -> null bila sukses atau
// string alasan penolakan (penuh/dimiliki); skor TIDAK dipotong saat ditolak.
function catalog() {
    const S = CFG.shop, o = player.owned || {};
    return [
        {
            // Tanpa magazen (2026-07-11): isi ulang kolam peluru tiap senjata
            // yang dimiliki sampai kap maxAmmo-nya.
            id: 'ammo', name: 'Replenish All Ammo', cost: S.ammoCost,
            desc: 'Refill every weapon you own to its maximum ammo.',
            apply() {
                const W = ['rifle', 'pistol', 'shotgun'].filter(w => o[w]);
                if (W.every(w => player[w].ammo >= CFG.weapons[w].maxAmmo))
                    return 'Ammo already full';
                for (const w of W) player[w].ammo = CFG.weapons[w].maxAmmo;
            }
        },
        {
            id: 'grenade', name: 'Replenish Grenades', cost: S.grenadeCost,
            desc: 'Restock your grenades back to the maximum you can carry.',
            apply() {
                if (player.grenades >= CFG.grenade.max) return 'Grenades already full';
                player.grenades = CFG.grenade.max;
            }
        },
        {
            // Sembuh instan (HP -> 100%). Beda dari Medkit (genggam, dipakai nanti).
            id: 'health', name: 'Replenish Health', cost: S.healthCost,
            desc: 'Instantly restore your health to full (100%).',
            apply() {
                if (player.hp >= CFG.player.maxHp) return 'Health already full';
                player.hp = CFG.player.maxHp;
            }
        },
        {
            // Medkit = item genggam (maks 1). Dibeli di sini; PAKAI dgn tombol 4
            // di lapangan untuk memulihkan 70% HP (bukan sembuh saat beli).
            id: 'medkit', name: 'Medkit', cost: S.medkitCost,
            desc: 'A field medkit. Equip it with 4, then hold left-click for 2 seconds to restore 70% of your health. You can carry up to 2.',
            apply() {
                if (player.medkits >= CFG.player.maxMedkits) return 'Medkit stock is full';
                player.medkits = Math.min(CFG.player.maxMedkits, player.medkits + 1);
            }
        },
        {
            id: 'healMonas', name: 'Heal Monas', cost: S.healMonasCost,
            desc: 'Repair the Monument, restoring 25% of its maximum HP.',
            apply() { return healMonas(); }
        },
        {
            // Deskripsi SENGAJA tanpa angka max HP (permintaan user) — cukup info
            // bahwa ini memperkuat Monas; besarannya bertingkat (lihat index.js).
            id: 'strengthenMonas', name: 'Strengthen Monas', cost: S.strengthenMonasCost,
            desc: 'Reinforce the Monument, boosting its maximum HP and repairing it. Reinforce again to strengthen it further, up to its structural limit.',
            apply() { return strengthenMonas(); }
        },
        {
            // Radar minimap: Survival mulai TANPA (player.hasRadar false); beli utk
            // mengaktifkannya. updateUI (dipanggil shopPurchase) menampilkan kanvasnya.
            id: 'radar', name: 'Radar', cost: S.radarCost,
            desc: 'Deploy a tactical radar (top-left minimap) that reveals nearby zombies, supply drops, and the Monument.',
            apply() {
                if (player.hasRadar) return 'Radar already owned';
                player.hasRadar = true;
            }
        },
        {
            id: 'shotgun', name: 'Shotgun', cost: S.shotgunCost, weapon: 'shotgun',
            desc: 'Pump-action shotgun. Fires 7 pellets per shot — devastating up close, 4x damage per pellet on a headshot.',
            apply() { return buyWeapon('shotgun', 'Shotgun'); }
        },
        {
            id: 'rifle', name: 'Assault Rifle', cost: S.rifleCost, weapon: 'rifle',
            desc: 'Full-auto assault rifle. High rate of fire and solid damage at range.',
            apply() { return buyWeapon('rifle', 'Assault Rifle'); }
        },
    ];
}

// Beli senjata ke SLOT kosong (dipanggil apply hanya saat slot < maxWeapons;
// kasus slot penuh ditangani shopPurchase -> pemilih ganti). Tandai dimiliki +
// kolam peluru penuh (tanpa magazen).
function buyWeapon(w, label) {
    if (player.owned[w]) return `${label} already owned`;
    player.weapons.push(w);
    syncOwnedFromWeapons();
    player[w].ammo = CFG.weapons[w].maxAmmo;
    refreshOwnedWeapon();
}

// Status tampilan non-harga: senjata dimiliki -> 'Owned'; Medkit sudah dibawa ->
// 'Held'; Strengthen Monas di tingkat tertinggi -> 'Maxed' (Buy dimatikan).
function ownedNote(it) {
    if (it.weapon && player.owned[it.weapon]) return 'Owned';
    if (it.id === 'radar' && player.hasRadar) return 'Owned';
    if (it.id === 'medkit' && player.medkits >= CFG.player.maxMedkits) return 'Full';
    if (it.id === 'strengthenMonas' && isMonasFullyStrengthened()) return 'Maxed';
    return null;
}

// Beli by id — dipakai handler klik DOM DAN test headless. Return null = sukses,
// string = alasan gagal (skor kurang / penuh / dimiliki), atau 'choose-replace'
// bila senjata baru butuh mengganti salah satu (slot penuh). Menyegarkan HUD.
export function shopPurchase(id) {
    if (!open) return 'Shop closed';
    const it = catalog().find(x => x.id === id);
    if (!it) return 'Unknown item';
    const note = ownedNote(it);
    if (note === 'Owned') return `${it.name} already owned`;
    if (note === 'Full') return 'Medkit stock is full';
    if (note === 'Maxed') return 'The Monument is already fully reinforced';
    if (score < it.cost) return 'Not enough score';
    // Beli senjata tipe baru sementara slot sudah penuh (maks) -> minta pilih
    // yang diganti; skor dipotong saat konfirmasi (shopReplaceWeapon).
    if (it.weapon && !player.owned[it.weapon]
        && player.weapons.length >= CFG.weapons.maxWeapons) {
        pendingWeapon = it;
        return 'choose-replace';
    }
    const rejected = it.apply();
    if (rejected) return rejected;
    addScore(-it.cost);
    playSFX(sfxPurchase);
    updateUI();
    return null;
}

// --- Ganti senjata (slot penuh) --------------------------------------------
export function isReplacePending() { return pendingWeapon !== null; }
export function pendingWeaponName() { return pendingWeapon ? pendingWeapon.name : null; }
export function shopCancelReplace() { pendingWeapon = null; }

// Konfirmasi ganti: buang oldW dari slot, pasang senjata pending di slot yang
// sama, loadout penuh, potong skor, segarkan. Return null / string alasan.
export function shopReplaceWeapon(oldW) {
    if (!pendingWeapon) return 'No weapon to replace';
    const it = pendingWeapon;
    const idx = player.weapons.indexOf(oldW);
    if (idx < 0) return 'You do not carry that weapon';
    if (score < it.cost) { pendingWeapon = null; return 'Not enough score'; }
    const w = it.weapon;
    player.weapons[idx] = w;             // ganti di posisi slot yang sama
    syncOwnedFromWeapons();
    player[w].ammo = CFG.weapons[w].maxAmmo;   // kolam peluru penuh (tanpa magazen)
    addScore(-it.cost);
    playSFX(sfxPurchase);
    pendingWeapon = null;
    refreshOwnedWeapon();                // senjata aktif tetap valid bila yang aktif diganti
    updateUI();
    return null;
}

// --- Konfirmasi mulai wave -------------------------------------------------
export function isConfirmOpen() { return confirmNext; }
// Tombol/tekan "Start Next Wave": tampilkan prompt "Are you ready?" dulu.
// Panggil lagi (klik Yes atau SPACE lagi) = benar-benar mulai wave berikutnya.
export function requestNextWave() {
    if (!open) return;
    if (confirmNext) { confirmNext = false; startNextWave(); return; }
    confirmNext = true;
    notice = '';
    render();
}

// --- Render DOM (createElement -> handler klik/hover nyata di browser) ------
function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

function setNotice(text, isErr) {
    notice = text; noticeErr = isErr;
    clearTimeout(noticeT);
    noticeT = setTimeout(() => { notice = ''; if (open) render(); }, 1500);
}

// Klik item / tombol Buy: beli lalu segarkan menu. 'choose-replace' -> tampilkan
// pemilih ganti (tanpa notifikasi "Purchased!").
function doPurchase(id) {
    selectedId = id;
    const msg = shopPurchase(id);
    if (msg === 'choose-replace') { notice = ''; render(); return; }
    setNotice(msg == null ? 'Purchased!' : msg, msg != null);
    render();
}

function doReplace(oldW) {
    const label = pendingWeaponName();
    const msg = shopReplaceWeapon(oldW);
    setNotice(msg == null ? `${label} equipped!` : msg, msg != null);
    render();
}

// Panel deskripsi + harga LEBAR PENUH di bawah grid. Diperbarui saat hover/pilih
// kartu; TIDAK ada tombol Buy di sini (Buy ada di tiap kartu).
function showDesc(desc, it) {
    desc.innerHTML = '';
    desc.appendChild(el('div', 'shopDescName', it.name));
    desc.appendChild(el('div', 'shopDescText', it.desc));
    const note = ownedNote(it);
    const price = el('div', 'shopDescPrice', note ? note : `Price: ${it.cost}`);
    if (note) price.classList.add('owned');
    else if (score < it.cost) price.classList.add('poor');
    desc.appendChild(price);
}

// Panel pemilih ganti senjata (menggantikan daftar saat pendingWeapon aktif).
function renderReplace(panel) {
    const body = el('div');
    const msg = el('div', 'shopReplaceMsg');
    msg.innerHTML = `You can only carry ${CFG.weapons.maxWeapons} weapons. Choose one to replace with <b>${pendingWeapon.name}</b>:`;
    body.appendChild(msg);
    const btns = el('div', 'shopReplaceBtns');
    for (const w of player.weapons.slice()) {
        const name = WEAPON_DEF[w] ? WEAPON_DEF[w].name : w;
        const b = el('button', 'shopReplaceBtn', `Replace ${name}`);
        b.addEventListener('click', () => doReplace(w));
        btns.appendChild(b);
    }
    const cancel = el('button', 'shopReplaceCancel', 'Cancel');
    cancel.addEventListener('click', () => { shopCancelReplace(); notice = ''; render(); });
    btns.appendChild(cancel);
    body.appendChild(btns);
    panel.appendChild(body);
}

// Prompt konfirmasi "Are you ready?" sebelum mulai wave (Yes = mulai, No = batal).
function renderConfirm(panel) {
    const body = el('div');
    body.appendChild(el('div', 'shopReplaceMsg', 'Are you ready to start the next wave?'));
    const btns = el('div', 'shopConfirmBtns');
    const yes = el('button', 'shopConfirmYes', 'Yes ▶');
    yes.addEventListener('click', () => { confirmNext = false; startNextWave(); });
    const no = el('button', 'shopConfirmNo', 'No');
    no.addEventListener('click', () => { confirmNext = false; render(); });
    btns.appendChild(yes);
    btns.appendChild(no);
    body.appendChild(btns);
    panel.appendChild(body);
}

function render() {
    const root = overlay();
    root.innerHTML = '';
    const panel = el('div', 'shopPanel');
    // Prompt konfirmasi mulai wave menutupi seluruh menu (Yes/No).
    if (confirmNext) {
        panel.appendChild(el('div', 'shopHead', 'START NEXT WAVE?'));
        renderConfirm(panel);
        root.appendChild(panel);
        return;
    }
    panel.appendChild(el('div', 'shopHead', pendingWeapon ? 'REPLACE A WEAPON' : 'FIELD SHOP'));
    panel.appendChild(el('div', 'shopMsg' + (noticeErr ? ' err' : ''), notice || ' '));

    if (pendingWeapon) {
        renderReplace(panel);
    } else {
        // Grid kartu item + panel deskripsi lebar penuh di bawahnya.
        const grid = el('div', 'shopGrid');
        const desc = el('div', 'shopDesc');
        const items = catalog();
        for (const it of items) {
            const card = el('div', 'shopCard');
            card.appendChild(el('div', 'shopCardName', it.name));
            const note = ownedNote(it);
            // Tombol Buy per-kartu = SATU-SATUNYA jalur beli (klik kartu hanya
            // memilih/preview). stopPropagation supaya klik Buy tak ikut memicu
            // handler pilih kartu.
            const buy = el('button', 'shopCardBuy', note ? note : 'Buy');
            if (note || score < it.cost) buy.classList.add('disabled');
            else buy.addEventListener('click', (e) => { e.stopPropagation(); doPurchase(it.id); });
            card.appendChild(buy);
            if (note) card.classList.add('owned');
            card.addEventListener('mouseenter', () => { selectedId = it.id; showDesc(desc, it); });
            card.addEventListener('click', () => { selectedId = it.id; showDesc(desc, it); });
            grid.appendChild(card);
        }
        panel.appendChild(grid);
        panel.appendChild(desc);
        // Deskripsi awal = item terpilih (terakhir di-hover / pertama saat buka)
        showDesc(desc, items.find(x => x.id === selectedId) || items[0]);
    }

    const foot = el('div', 'shopFoot');
    foot.appendChild(el('div', 'shopScore', `Score: ${score}`));
    const next = el('button', 'shopNext', 'Start Next Wave ▶');
    next.addEventListener('click', () => requestNextWave());   // -> prompt "Are you ready?"
    foot.appendChild(next);
    panel.appendChild(foot);

    root.appendChild(panel);
}
