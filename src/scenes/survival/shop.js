// Shop antar-gelombang Survival (overhaul rounds 2026-07-07): overlay
// KEYBOARD-ONLY — pointer TETAP terkunci. Terbuka OTOMATIS saat sebuah wave
// selesai (scene memanggil openShop() setelah hitung mundur 3 detik). Item:
// isi ulang Ammo/Grenade/Health + BELI senjata Shotgun / Assault Rifle
// (Survival mulai hanya berpistol). Tombol "Start Next Wave" (SPACE) dimiliki
// scene (survival/index.js) yang memanggil startNextWave. Mata uang = skor.
// Semua teks UI English (aturan permanen).

import { CFG } from '../../core/config.js';
import { player, score, addScore } from '../../core/state.js';
import { updateUI } from '../../core/hud.js';
import { playSFX, sfxPickup } from '../../utils/sfx.js';

let open = false;
let notice = '';       // pesan gagal/berhasil singkat di bawah daftar
let noticeT = 0;
const overlay = () => document.getElementById('shopOverlay');

export function isShopOpen() { return open; }

export function closeShop() {
    if (!open) return;
    open = false;
    overlay().style.display = 'none';
}

export function openShop() {
    open = true;
    notice = '';
    render();
    overlay().style.display = 'flex';
}

function line(key, label, cost, note) {
    return `<div class="shopLine"><span class="shopKey">[${key}]</span><span class="shopLabel">${label}</span>` +
        `<span class="shopCost">${cost}</span><span class="shopNote">${note || ''}</span></div>`;
}

// Baris beli senjata: tampilkan "Owned" (tanpa harga) bila sudah dimiliki.
function weaponLine(key, label, cost, owned) {
    return owned
        ? `<div class="shopLine"><span class="shopKey">[${key}]</span><span class="shopLabel">${label}</span>` +
        `<span class="shopCost">—</span><span class="shopNote">Owned</span></div>`
        : line(key, `Buy ${label}`, cost);
}

function render() {
    const S = CFG.shop, o = player.owned || {};
    overlay().innerHTML =
        `<div class="shopTitle">FIELD SHOP</div>` +
        `<div class="shopScore">Score: ${score}</div>` +
        line(1, 'Replenish All Ammo', S.ammoCost) +
        line(2, 'Replenish Grenades', S.grenadeCost) +
        line(3, 'Replenish Health', S.healthCost) +
        weaponLine(4, 'Shotgun', S.shotgunCost, o.shotgun) +
        weaponLine(5, 'Assault Rifle', S.rifleCost, o.rifle) +
        (notice ? `<div class="shopErr">${notice}</div>` : '') +
        `<div class="shopNext">[SPACE] START NEXT WAVE &#9654;</div>`;
}

function setNotice(text) {
    notice = text;
    clearTimeout(noticeT);
    noticeT = setTimeout(() => { notice = ''; if (open) render(); }, 1400);
    render();
}

// Beli: skor cukup + efek valid -> potong skor. apply() mengembalikan pesan
// penolakan (penuh/dimiliki) atau null bila berhasil — skor TIDAK dipotong saat ditolak.
function buy(cost, apply) {
    if (score < cost) { setNotice('Not enough score'); return; }
    const rejected = apply();
    if (rejected) { setNotice(rejected); return; }
    addScore(-cost);
    playSFX(sfxPickup);
    updateUI();
    setNotice('Purchased!');
}

// Beli senjata: tandai dimiliki + berikan loadout penuh (mag awal terisi).
function buyWeapon(w, label) {
    if (player.owned[w]) return `${label} already owned`;
    player.owned[w] = true;
    player[w].mags = CFG.weapons[w].startMags;
    player[w].ammo = player[w].magSize;
}

// Handler tombol beli dari scene (dipanggil oleh survival/index.js.shopKey saat
// overlay terbuka). Return true = tombol DIKONSUMSI (angka tak bocor jadi ganti
// senjata). Senjata yang dimiliki di-replenish lewat item [1] Ammo.
export function shopBuyKey(key) {
    if (!open) return false;
    const S = CFG.shop;
    if (key === '1') {
        buy(S.ammoCost, () => {
            // Hanya senjata yang DIMILIKI yang diisi ulang (penuh mag + peluru)
            const W = ['rifle', 'pistol', 'shotgun'].filter(w => player.owned[w]);
            if (W.every(w => player[w].mags >= CFG.weapons.maxMags && player[w].ammo >= player[w].magSize))
                return 'Ammo already full';
            for (const w of W) { player[w].mags = CFG.weapons.maxMags; player[w].ammo = player[w].magSize; }
        });
    } else if (key === '2') {
        buy(S.grenadeCost, () => {
            if (player.grenades >= CFG.grenade.max) return 'Grenades already full';
            player.grenades = CFG.grenade.max;   // isi penuh
        });
    } else if (key === '3') {
        buy(S.healthCost, () => {
            if (player.hp >= CFG.player.maxHp) return 'Health already full';
            player.hp = CFG.player.maxHp;         // isi penuh
        });
    } else if (key === '4') {
        buy(S.shotgunCost, () => buyWeapon('shotgun', 'Shotgun'));
    } else if (key === '5') {
        buy(S.rifleCost, () => buyWeapon('rifle', 'Assault Rifle'));
    } else {
        return false;   // tombol lain (mis. SPACE next-wave) ditangani scene
    }
    return true;
}
