// Shop lapangan Survival (IMPROVEMENT-PLAN #3): overlay KEYBOARD-ONLY —
// pointer lock TETAP terkunci; B buka/tutup, angka 1-5 membeli. Game TIDAK
// di-pause selagi shop terbuka (trade-off desain ala horde-mode). Mata uang =
// skor. Terhubung ke game lewat hook opsional scene: shopKey(key) & shopClose.
// Upgrade bersifat PER-RUN (dmgMul/reloadMul di-reset configurePlayer).
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

function render() {
    const S = CFG.shop;
    overlay().innerHTML =
        `<div class="shopTitle">FIELD SHOP</div>` +
        `<div class="shopScore">Score: ${score}</div>` +
        line(1, 'Full Ammo Restock (all weapons)', S.ammoCost) +
        line(2, `Medkit +${S.medkitHeal} HP`, S.medkitCost) +
        line(3, '+1 Grenade', S.grenadeCost) +
        line(4, `+${Math.round(S.damagePerLevel * 100)}% Damage`, S.damageCost,
            player.upDmg >= S.damageMaxLevel ? 'MAXED' : `Lv ${player.upDmg}/${S.damageMaxLevel}`) +
        line(5, `Faster Reload −${Math.round(S.reloadPerLevel * 100)}%`, S.reloadCost,
            player.upReload >= S.reloadMaxLevel ? 'MAXED' : `Lv ${player.upReload}/${S.reloadMaxLevel}`) +
        (notice ? `<div class="shopErr">${notice}</div>` : '') +
        `<div class="shopHint">Press B to close</div>`;
}

function setNotice(text) {
    notice = text;
    clearTimeout(noticeT);
    noticeT = setTimeout(() => { notice = ''; if (open) render(); }, 1400);
    render();
}

// Beli: skor cukup + efek valid -> potong skor. apply() mengembalikan pesan
// penolakan (penuh/maxed) atau null bila berhasil — skor TIDAK dipotong saat ditolak.
function buy(cost, apply) {
    if (score < cost) { setNotice('Not enough score'); return; }
    const rejected = apply();
    if (rejected) { setNotice(rejected); return; }
    addScore(-cost);
    playSFX(sfxPickup);
    updateUI();
    setNotice('Purchased!');
}

// Handler tombol dari core/input.js (via activeScene.shopKey). Return true =
// tombol DIKONSUMSI shop (angka 1-3 tidak boleh bocor jadi ganti senjata).
export function shopKey(key) {
    if (key === 'b') { open ? closeShop() : openShop(); return true; }
    if (!open) return false;
    const S = CFG.shop, W = ['rifle', 'pistol', 'shotgun'];
    if (key === '1') {
        buy(S.ammoCost, () => {
            if (W.every(w => player[w].mags >= CFG.weapons.maxMags
                && player[w].ammo >= player[w].magSize)) return 'Ammo already full';
            for (const w of W) { player[w].mags = CFG.weapons.maxMags; player[w].ammo = player[w].magSize; }
        });
    } else if (key === '2') {
        buy(S.medkitCost, () => {
            if (player.hp >= CFG.player.maxHp) return 'Health already full';
            player.hp = Math.min(CFG.player.maxHp, player.hp + S.medkitHeal);
        });
    } else if (key === '3') {
        buy(S.grenadeCost, () => {
            if (player.grenades >= CFG.grenade.max) return 'Grenades already full';
            player.grenades++;
        });
    } else if (key === '4') {
        buy(S.damageCost, () => {
            if (player.upDmg >= S.damageMaxLevel) return 'Damage already maxed';
            player.upDmg++;
            player.dmgMul = 1 + player.upDmg * S.damagePerLevel;
        });
    } else if (key === '5') {
        buy(S.reloadCost, () => {
            if (player.upReload >= S.reloadMaxLevel) return 'Reload already maxed';
            player.upReload++;
            player.reloadMul = Math.max(0.4, 1 - player.upReload * S.reloadPerLevel);
        });
    } else {
        return false;   // tombol lain tak disentuh shop
    }
    return true;
}
