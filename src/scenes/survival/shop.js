// Shop antar-gelombang Survival (overhaul MENU KLIK 2026-07-08): overlay modal
// berbasis mouse (game DI-PAUSE + pointer dilepas oleh input.js selama
// shopActive()). Terbuka OTOMATIS saat sebuah wave selesai (scene memanggil
// openShop() setelah hitung mundur). Tata letak: kiri = daftar item (hover ->
// detail), kanan = deskripsi + harga + tombol Buy, bawah-kiri = skor, bawah-
// kanan = tombol Start Next Wave. Item: isi ulang Ammo/Grenade/Health, Heal &
// Strengthen Monas, dan BELI Shotgun / Assault Rifle. Mata uang = skor.
// Semua teks UI English (aturan permanen). Impor Monas/Next-Wave dari scene
// (index.js) — circular, hanya dipakai DI DALAM fungsi (pola arsitektur).

import { CFG } from '../../core/config.js';
import { player, score, addScore } from '../../core/state.js';
import { updateUI } from '../../core/hud.js';
import { playSFX, sfxPickup } from '../../utils/sfx.js';
import { healMonas, strengthenMonas, startNextWave, isMonasFullyStrengthened } from './index.js';

let open = false;
let selectedId = null;
let notice = '', noticeErr = false, noticeT = 0;
const overlay = () => document.getElementById('shopOverlay');

export function isShopOpen() { return open; }

export function closeShop() {
    if (!open) return;
    open = false;
    notice = '';
    const o = overlay();
    o.style.display = 'none';
    o.innerHTML = '';
}

export function openShop() {
    open = true;
    notice = '';
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
            id: 'ammo', name: 'Replenish All Ammo', cost: S.ammoCost,
            desc: 'Refill magazines and reserve ammo to full for every weapon you own.',
            apply() {
                const W = ['rifle', 'pistol', 'shotgun'].filter(w => o[w]);
                if (W.every(w => player[w].mags >= CFG.weapons.maxMags && player[w].ammo >= player[w].magSize))
                    return 'Ammo already full';
                for (const w of W) { player[w].mags = CFG.weapons.maxMags; player[w].ammo = player[w].magSize; }
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
            id: 'health', name: 'Replenish Health', cost: S.healthCost,
            desc: 'Patch yourself up and restore your health to full.',
            apply() {
                if (player.hp >= CFG.player.maxHp) return 'Health already full';
                player.hp = CFG.player.maxHp;
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

// Beli senjata: tandai dimiliki + loadout penuh (mag awal terisi).
function buyWeapon(w, label) {
    if (player.owned[w]) return `${label} already owned`;
    player.owned[w] = true;
    player[w].mags = CFG.weapons[w].startMags;
    player[w].ammo = player[w].magSize;
}

// Status tampilan non-harga: senjata dimiliki -> 'Owned'; Strengthen Monas di
// tingkat tertinggi -> 'Maxed' (tak bisa dibeli lagi, tombol Buy dimatikan).
function ownedNote(it) {
    if (it.weapon && player.owned[it.weapon]) return 'Owned';
    if (it.id === 'radar' && player.hasRadar) return 'Owned';
    if (it.id === 'strengthenMonas' && isMonasFullyStrengthened()) return 'Maxed';
    return null;
}

// Beli by id — dipakai handler klik DOM DAN test headless. Return null = sukses,
// string = alasan gagal (skor kurang / penuh / dimiliki). Menyegarkan HUD.
export function shopPurchase(id) {
    if (!open) return 'Shop closed';
    const it = catalog().find(x => x.id === id);
    if (!it) return 'Unknown item';
    const note = ownedNote(it);
    if (note === 'Owned') return `${it.name} already owned`;
    if (note === 'Maxed') return 'The Monument is already fully reinforced';
    if (score < it.cost) return 'Not enough score';
    const rejected = it.apply();
    if (rejected) return rejected;
    addScore(-it.cost);
    playSFX(sfxPickup);
    updateUI();
    return null;
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

// Klik item / tombol Buy: beli lalu segarkan menu (skor + status + detail).
function doPurchase(id) {
    selectedId = id;
    const msg = shopPurchase(id);
    setNotice(msg == null ? 'Purchased!' : msg, msg != null);
    render();
}

function showDetail(detail, it) {
    detail.innerHTML = '';
    detail.appendChild(el('div', 'shopDetailName', it.name));
    detail.appendChild(el('div', 'shopDetailDesc', it.desc));
    const note = ownedNote(it);
    const price = el('div', 'shopDetailPrice', note ? note : `Price: ${it.cost}`);
    if (note) price.classList.add('owned');
    else if (score < it.cost) price.classList.add('poor');
    detail.appendChild(price);
    const buy = el('button', 'shopBuy', note ? 'Owned' : 'Buy');
    if (note || score < it.cost) buy.classList.add('disabled');
    else buy.addEventListener('click', () => doPurchase(it.id));
    detail.appendChild(buy);
}

function render() {
    const root = overlay();
    root.innerHTML = '';
    const panel = el('div', 'shopPanel');
    panel.appendChild(el('div', 'shopHead', 'FIELD SHOP'));
    panel.appendChild(el('div', 'shopMsg' + (noticeErr ? ' err' : ''), notice || ' '));

    const body = el('div', 'shopBody');
    const list = el('div', 'shopList');
    const detail = el('div', 'shopDetail');
    const items = catalog();
    for (const it of items) {
        const row = el('div', 'shopItem');
        row.appendChild(el('span', 'shopItemName', it.name));
        const note = ownedNote(it);
        row.appendChild(el('span', 'shopItemCost', note || String(it.cost)));
        if (note) row.classList.add('owned');
        row.addEventListener('mouseenter', () => { selectedId = it.id; showDetail(detail, it); });
        row.addEventListener('click', () => doPurchase(it.id));
        list.appendChild(row);
    }
    body.appendChild(list);
    body.appendChild(detail);
    panel.appendChild(body);

    const foot = el('div', 'shopFoot');
    foot.appendChild(el('div', 'shopScore', `Score: ${score}`));
    const next = el('button', 'shopNext', 'Start Next Wave ▶');
    next.addEventListener('click', () => startNextWave());
    foot.appendChild(next);
    panel.appendChild(foot);

    root.appendChild(panel);
    // Detail awal = item terpilih (terakhir di-hover / pertama saat buka)
    showDetail(detail, items.find(x => x.id === selectedId) || items[0]);
}
