// PRESENTASI 2026-08-27 menggantikan deskripsi layout historis di bawah:
// header identitas+saldo, manifest kiri, rail detail kanan, satu aksi footer.
// Shop antar-gelombang Survival (overhaul MENU KLIK 2026-07-08): overlay modal
// berbasis mouse (game DI-PAUSE + pointer dilepas oleh input.js selama
// shopActive()). Terbuka OTOMATIS saat sebuah wave selesai (scene memanggil
// openShop() setelah hitung mundur). Tata letak (redesign 2026-07-09): GRID
// kartu item — tiap kartu punya nama + tombol Buy SENDIRI (kiri-bawah kartu);
// panel deskripsi + harga LEBAR PENUH di bawah grid (diperbarui saat hover/pilih
// kartu, TIDAK membeli); bawah-kiri = skor, bawah-kanan = Start Next Wave. Item:
// isi ulang Ammo/Grenade, Replenish Health, Medkit, Heal & Strengthen Monas,
// Radar, dan SATU kartu GABUNGAN per senjata (2026-07-17: beli + upgrade Lv2/Lv3
// dalam kartu yang sama, pola Vitality/Ammo Capacity — bukan lagi kartu beli &
// upgrade terpisah). Mata uang = skor. Membeli senjata ke-4
// (slot penuh) -> tampilkan pemilih GANTI senjata.
// Semua teks UI English (aturan permanen). Impor Monas/Next-Wave dari scene
// (index.js) — circular, hanya dipakai DI DALAM fungsi (pola arsitektur).

import { CFG } from '../../core/config.js';
import {
    player, score, addScore, setScore, syncOwnedFromWeapons, maxAmmoFor,
    hasUnlockedWeapon, unlockWeapon,
} from '../../core/state.js';
import { updateUI } from '../../core/hud.js';
import { playSFX, sfxPurchase } from '../../utils/sfx.js';
import { WEAPON_DEF, refreshOwnedWeapon, weaponFireDelay } from '../../entities/weapons.js';
import { healMonas, strengthenMonas, startNextWave, isMonasFullyStrengthened, getMonasState, setMonasState } from './index.js';

let open = false;
let selectedId = null;
let activeTab = 'general';   // tab aktif (2026-07-15; General pertama sejak 2026-07-17)
let notice = '', noticeErr = false, noticeT = 0;
let pendingWeapon = null;   // senjata yang menunggu konfirmasi GANTI (slot penuh)
let confirmNext = false;    // prompt "Are you ready?" sebelum mulai wave berikutnya
let lastPurchase = null;    // snapshot pembelian TERAKHIR (klik kanan = batal beli)
let revealNext = false;     // entrance sinematik hanya saat overlay pertama dibuka
const overlay = () => document.getElementById('shopOverlay');

// --- UNDO pembelian terakhir (2026-07-15) -----------------------------------
// Klik-kiri kartu = langsung beli; klik-KANAN = batalkan pembelian yang BARU
// SAJA dilakukan (satu langkah, bukan menjual barang lama). Caranya: snapshot
// seluruh state yang bisa diubah pembelian SEBELUM transaksi, lalu pulihkan +
// kembalikan skor saat undo. Tak perlu logika balik per-item.
function snapshotState() {
    return {
        score,
        hp: player.hp, maxHp: player.maxHp, hpLvl: player.hpLvl,
        medkits: player.medkits,
        armor: player.armor, armorMax: player.armorMax, armorLvl: player.armorLvl,
        ammoLvl: player.ammoLvl, hasRadar: player.hasRadar,
        weaponLvl: { ...player.weaponLvl },
        weapons: player.weapons.slice(),
        unlockedWeapons: { ...player.unlockedWeapons },
        ammo: { rifle: player.rifle.ammo, pistol: player.pistol.ammo, shotgun: player.shotgun.ammo, launcher: player.launcher.ammo },
        monas: (shopCtx && shopCtx.mode === 'campaign') ? null : getMonasState(),
    };
}
function restoreState(s) {
    // Hanya sinkron ulang senjata (mesh FPS) bila slot benar-benar berubah —
    // undo item non-senjata (medkit/health/dst) tak menyentuh rig senjata.
    const weaponsChanged = s.weapons.join(',') !== player.weapons.join(',');
    setScore(s.score);
    player.hp = s.hp; player.maxHp = s.maxHp; player.hpLvl = s.hpLvl;
    player.medkits = s.medkits;
    player.armor = s.armor; player.armorMax = s.armorMax; player.armorLvl = s.armorLvl;
    player.ammoLvl = s.ammoLvl; player.hasRadar = s.hasRadar;
    player.weaponLvl = { ...s.weaponLvl };
    player.weapons = s.weapons.slice();
    player.unlockedWeapons = { ...s.unlockedWeapons };
    player.rifle.ammo = s.ammo.rifle; player.pistol.ammo = s.ammo.pistol;
    player.shotgun.ammo = s.ammo.shotgun; player.launcher.ammo = s.ammo.launcher;
    syncOwnedFromWeapons();
    if (s.monas) setMonasState(s.monas);
    if (weaponsChanged) refreshOwnedWeapon();
    updateUI();
}
// Batalkan pembelian terakhir. null = sukses, string = alasan (tak ada / tutup).
export function shopUndoLast() {
    if (!open) return 'Shop closed';
    if (!lastPurchase) return 'Nothing to cancel';
    restoreState(lastPurchase.snapshot);
    lastPurchase = null;
    playSFX(sfxPurchase);
    return null;
}

// --- TAB shop (2026-07-15; urutan direvisi 2026-07-17: General PERTAMA) -----
// Katalog dikelompokkan ke 4 tab agar tidak berantakan (permintaan user):
//  - general: isi ulang ammo/health, medkit, Heal Monas, Radar (tab pembuka).
//  - weapon : SATU kartu GABUNGAN per senjata (beli + upgrade — lihat weaponItem).
//  - armor  : 3 kartu armor.
//  - upgrade: Ammo Capacity + Vitality (max HP) + Strengthen Monas.
// Tab murni urusan RENDER — catalog() tetap daftar rata (dipakai shopPurchase
// & filter campaign). itemTab() mengklasifikasi tiap item.
const TABS = [
    { id: 'general', label: 'General' },
    { id: 'weapon', label: 'Weapons' },
    { id: 'armor', label: 'Armor' },
    { id: 'upgrade', label: 'Upgrades' },
];
const WEAPON_ORDER = ['pistol', 'shotgun', 'rifle', 'launcher'];
function itemTab(it) {
    if (it.weapon || it.upgrade) return 'weapon';
    if (it.armorTier) return 'armor';
    if (it.id === 'ammoup' || it.id === 'hpup' || it.id === 'strengthenMonas') return 'upgrade';
    return 'general';
}
function tabItems(tab) { return catalog().filter(it => itemTab(it) === tab); }
// Tab yang punya minimal 1 item (campaign menyembunyikan sebagian item).
function visibleTabs() { return TABS.filter(t => tabItems(t.id).length > 0); }
function firstTabId() { const v = visibleTabs(); return v.length ? v[0].id : 'general'; }

// KONTEKS shop (2026-07-14): Survival (default) vs Campaign. Menentukan KATALOG
// (Campaign menyembunyikan item khusus Survival: Monas/Radar/beli-senjata), LABEL
// tombol, dan AKSI "lanjut" (Survival: mulai wave berikutnya; Campaign: transisi
// ke stage berikut lewat layar loading). Di-set openShop(ctx); default = Survival.
let shopCtx = null;
// Item KHUSUS Survival yang disembunyikan di Campaign: hanya Monas (tak ada
// Monas di campaign). Radar/Shotgun/Rifle/Launcher + upgrade-nya KINI DIJUAL di
// campaign juga (2026-07-14, permintaan user).
const SURVIVAL_ONLY = new Set(['healMonas', 'strengthenMonas']);
function defaultCtx() {
    return {
        mode: 'survival', head: 'FIELD SHOP',
        nextLabel: 'Start Next Wave ▶',
        confirmHead: 'START NEXT WAVE?',
        confirmMsg: 'Are you ready to start the next wave?',
        onNext: startNextWave,
    };
}

export function isShopOpen() { return open; }

// Debug/uji: klasifikasi item per tab yang saat ini TERLIHAT (mengikuti
// owned/campaign). { active, tabs:[id..], items:{tab:[itemId..]} }.
export function shopTabDebug() {
    return {
        active: activeTab,
        tabs: visibleTabs().map(t => t.id),
        items: Object.fromEntries(TABS.map(t => [t.id, tabItems(t.id).map(it => it.id)])),
        // Deskripsi kartu yang sedang tampil (uji teks user-facing).
        desc: Object.fromEntries(TABS.flatMap(t => tabItems(t.id).map(it => [it.id, it.desc]))),
    };
}

// Debug/uji PRESENTASI kartu: ikon yang dipakai tiap item katalog (kartu
// ringkas 2026-08-27 = art + nama + harga + BUY, jadi ikon wajib ada).
export function shopCardDebug() {
    return catalog().map(it => ({
        id: it.id,
        icon: it.icon && ICONS[it.icon] ? it.icon : null,
    }));
}

export function closeShop() {
    if (!open) return;
    open = false;
    notice = '';
    pendingWeapon = null;
    confirmNext = false;
    lastPurchase = null;
    revealNext = false;
    const o = overlay();
    o.style.display = 'none';
    o.classList.remove('campaignShop');
    o.innerHTML = '';
}

export function openShop(ctx) {
    shopCtx = ctx || defaultCtx();
    open = true;
    notice = '';
    pendingWeapon = null;
    confirmNext = false;
    lastPurchase = null;
    revealNext = true;
    activeTab = firstTabId();
    const first = tabItems(activeTab)[0];
    selectedId = first ? first.id : (catalog()[0] && catalog()[0].id);
    render();
    const o = overlay();
    // Campaign = SHOP SCENE terpisah (2026-07-14): latar OPAK (stage tak terlihat).
    o.classList.toggle('campaignShop', shopCtx.mode === 'campaign');
    o.style.display = 'flex';
    // Lepas pointer-lock agar kursor bisa memakai menu klik. input.js men-pause
    // & menyembunyikan blocker selama activeScene.shopActive() true.
    document.exitPointerLock();
}

// --- IKON KARTU (kartu RINGKAS 2026-08-27) ---------------------------------
// Kartu shop = ART (SVG line-art) + nama + harga + tombol BUY. Tidak ada
// sub-judul/bar statistik: detail lengkap muncul di strip kaki panel saat kartu
// di-hover, jadi grid tetap bersih. Semua SVG memakai `currentColor` sehingga
// kartu terpilih (latar oranye) otomatis membalik warna ikonnya. viewBox
// seragam 64x34 agar semua art punya kotak yang sama besar.
const ICONS = {
    rifle:
        '<svg viewBox="0 0 64 34"><g fill="currentColor">' +
        '<rect x="3" y="15" width="24" height="3" rx="1"/>' +
        '<rect x="11" y="11" width="2.4" height="4" rx="0.6"/>' +
        '<rect x="14" y="13.6" width="13" height="6" rx="1.4"/>' +
        '<rect x="26" y="12.4" width="19" height="8" rx="1.4"/>' +
        '<rect x="29" y="8.6" width="13" height="3" rx="1.2"/>' +
        '<path d="M30.5 20.4h6.4l-1.2 8.6h-6.4z"/>' +
        '<path d="M39.4 20.4h5.4l-2 7.4h-4.6z"/>' +
        '<rect x="44.4" y="13" width="14" height="6" rx="1.2"/>' +
        '<rect x="57.4" y="11.6" width="3.2" height="8.8" rx="1"/>' +
        '</g></svg>',
    pistol:
        '<svg viewBox="0 0 64 34"><g fill="currentColor">' +
        '<rect x="12" y="10" width="34" height="7" rx="1.4"/>' +
        '<rect x="12" y="17" width="26" height="3.4" rx="1"/>' +
        '<rect x="15" y="11.4" width="9" height="1.4" rx="0.7" opacity="0.45"/>' +
        '<path d="M33 20.4h9.6l-3.4 12.2h-9.4z"/>' +
        '<path d="M24 20.4h7v2.4h-7z"/>' +
        '<path d="M26.6 22.6h2.2c1.6 2.2 2.4 3.6 3 5.6h-2.4c-0.8-2-1.6-3.4-2.8-5.6z"/>' +
        '</g></svg>',
    shotgun:
        '<svg viewBox="0 0 64 34"><g fill="currentColor">' +
        '<rect x="3" y="12.6" width="34" height="3.4" rx="1"/>' +
        '<rect x="3" y="16.4" width="26" height="2.4" rx="0.9" opacity="0.6"/>' +
        '<rect x="13" y="17.6" width="12.4" height="4.4" rx="1.4"/>' +
        '<rect x="36" y="12.4" width="12" height="8" rx="1.4"/>' +
        '<path d="M38.6 20.4h5l-1.8 7.2h-4.4z"/>' +
        '<path d="M47.6 13.4l12.4-2.6v12.4l-12.4-2.6z"/>' +
        '</g></svg>',
    launcher:
        '<svg viewBox="0 0 64 34"><g fill="currentColor">' +
        '<path d="M4 17c0-3.6 2.6-6.6 6.4-7.4v14.8C6.6 23.6 4 20.6 4 17z"/>' +   // hulu ledak
        '<rect x="9.6" y="13.6" width="9" height="6.8" rx="1.2"/>' +             // bahu hulu ledak
        '<rect x="18" y="14.4" width="27" height="5.2" rx="1.8"/>' +             // tabung
        '<rect x="22.5" y="8.8" width="7" height="4.4" rx="1.2"/>' +             // pembidik
        '<path d="M27 19.8h5.6l-2 8.4h-5.4z"/>' +                                 // pegangan
        '<path d="M45 13.6l7.6 1.6v3.6L45 20.4z"/>' +                             // corong belakang
        '</g></svg>',
    ammo:
        '<svg viewBox="0 0 64 34"><g fill="currentColor">' +
        '<path d="M18 11.6l3.4-4.6 3.4 4.6v14.8h-6.8z"/>' +
        '<path d="M28.6 11.6l3.4-4.6 3.4 4.6v14.8h-6.8z"/>' +
        '<path d="M39.2 11.6l3.4-4.6 3.4 4.6v14.8h-6.8z"/>' +
        '<rect x="16" y="26.4" width="32" height="3" rx="1"/>' +
        '</g></svg>',
    health:
        '<svg viewBox="0 0 64 34"><g fill="none" stroke="currentColor" stroke-width="2.6">' +
        '<circle cx="32" cy="17" r="12.4"/></g>' +
        '<path fill="currentColor" d="M29.4 10.4h5.2v4.2h4.2v5.2h-4.2v4.2h-5.2v-4.2h-4.2v-5.2h4.2z"/></svg>',
    medkit:
        '<svg viewBox="0 0 64 34"><g fill="none" stroke="currentColor" stroke-width="2.4">' +
        '<rect x="17" y="9.6" width="30" height="19" rx="3"/>' +
        '<path d="M27 9.6V6.6h10v3"/></g>' +
        '<path fill="currentColor" d="M29.6 13.6h4.8v3.6h3.6v4.8h-3.6v3.6h-4.8v-3.6H26v-4.8h3.6z"/></svg>',
    armor:
        '<svg viewBox="0 0 64 34"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round">' +
        '<path d="M32 4l13 4.2v9.4c0 6.6-5.4 11.2-13 13.4-7.6-2.2-13-6.8-13-13.4V8.2z"/>' +
        '<path d="M25 15l7 5.4 7-5.4"/></g></svg>',
    vitality:
        '<svg viewBox="0 0 64 34"><path fill="currentColor" d="M32 30.4C22 24 16 19.4 16 13.6 16 9.4 19.2 6.2 23.4 6.2c2.6 0 5 1.3 6.6 3.4h4c1.6-2.1 4-3.4 6.6-3.4 4.2 0 7.4 3.2 7.4 7.4 0 5.8-6 10.4-16 16.8z"/>' +
        '<path fill="#000" opacity="0.32" d="M30 12.2h4v3.6h3.6v4h-3.6v3.6h-4v-3.6h-3.6v-4H30z"/></svg>',
    pouch:
        '<svg viewBox="0 0 64 34"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round">' +
        '<path d="M18 12h28v13.4a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3z"/>' +
        '<path d="M22.6 12V8.6a2.6 2.6 0 0 1 2.6-2.6h13.6a2.6 2.6 0 0 1 2.6 2.6V12"/></g>' +
        '<path fill="currentColor" d="M29.8 16.6h4.4v3.4h3.4v4.4h-3.4v0h-4.4v-4.4h-3.4v-3.4h3.4z" opacity="0.9"/></svg>',
    monas:
        '<svg viewBox="0 0 64 34"><g fill="currentColor">' +
        '<path d="M32 2l2.6 5.4-2.6 2-2.6-2z"/>' +
        '<path d="M29.6 10h4.8l1.6 15h-8z"/>' +
        '<path d="M24 25.4h16v3.2H24z"/>' +
        '<path d="M20 29h24v3H20z"/>' +
        '</g></svg>',
    monasPlus:
        '<svg viewBox="0 0 64 34"><g fill="currentColor">' +
        '<path d="M28 2l2.4 5-2.4 1.9-2.4-1.9z"/>' +
        '<path d="M25.8 10.4h4.4l1.5 14.6h-7.4z"/>' +
        '<path d="M20.4 25.4h15v3.1h-15z"/>' +
        '<path d="M16.8 29h22v3h-22z"/>' +
        '</g><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">' +
        '<path d="M46 8l8 2.6v5.8c0 4-3.3 6.8-8 8.2-4.7-1.4-8-4.2-8-8.2v-5.8z"/></g></svg>',
    radar:
        '<svg viewBox="0 0 64 34"><g fill="none" stroke="currentColor" stroke-width="2.2">' +
        '<circle cx="32" cy="17" r="12.6"/><circle cx="32" cy="17" r="6.6" opacity="0.6"/>' +
        '<path d="M32 17l9.4-6.4"/></g>' +
        '<circle cx="41.6" cy="10.6" r="2.4" fill="currentColor"/>' +
        '<circle cx="24.4" cy="22.6" r="1.8" fill="currentColor" opacity="0.7"/></svg>',
};
// --- Item senjata GABUNGAN: beli + upgrade dalam SATU kartu (2026-07-17) ----
// Mengikuti pola Vitality/Ammo Capacity (permintaan user — tidak lagi kartu
// beli & kartu upgrade terpisah): belum dimiliki -> kartu menjual SENJATANYA
// (harga beli, nama polos); sudah dimiliki -> kartu YANG SAMA (id tetap = kunci
// senjata) menjual upgrade Lv2 lalu Lv3 = maks (nama ber-angka romawi tingkat
// yang dijual, harga CFG.shop.upgradeCosts[w]); Lv3 -> note 'Maxed'. Tiap level
// menambah +upgradeDamagePct (30% sejak 2026-08-13) dari damage BASE — diterapkan weaponDamage()
// di weapons.js saat peluru lahir (peluru launcher meneruskannya ke boom AoE).
// Level tersimpan per-tipe (player.weaponLvl, per-run) sehingga bertahan bila
// senjatanya diganti. Semua tipe selalu muncul: senjata unlocked di luar slot
// berubah menjadi aksi EQUIP gratis; senjata di slot tetap menjual upgrade.
const ROMAN = ['I', 'II', 'III'];
// Kadens per level (CFG.weapons.<w>.fireDelayByLevel, 2026-08-09): sebuah level
// boleh mengubah — bahkan MEMPERLAMBAT — laju tembak senjata. Kartu WAJIB
// menyebutkannya; pemain tak boleh membayar upgrade lalu menemukan senjatanya
// menembak lebih jarang tanpa peringatan. Angkanya dikutip dari weaponFireDelay
// (satu-satunya pemilik aturan tabel), bukan dihitung ulang di sini. Senjata
// tanpa tabel -> string kosong, jadi kartu lain tidak berubah sama sekali.
const shotsPerSec = (w, lvl) => 1000 / weaponFireDelay(w, lvl);
function cadenceNote(w, lvl, next) {
    if (!Array.isArray((CFG.weapons[w] || {}).fireDelayByLevel)) return '';
    const r = shotsPerSec(w, lvl);
    if (next == null) return ` Rate of fire: ${r.toFixed(2)} shots per second.`;
    const rn = shotsPerSec(w, next);
    return Math.abs(rn - r) < 1e-9
        ? ` Rate of fire stays ${r.toFixed(2)} shots per second.`
        : ` Its rate of fire also changes from ${r.toFixed(2)} to ${rn.toFixed(2)} shots per second.`;
}
function weaponItem(w) {
    const S = CFG.shop;
    const label = WEAPON_DEF[w].name;
    const equipped = player.weapons.includes(w);
    const unlocked = hasUnlockedWeapon(w);
    if (unlocked && !equipped) {
        return {
            id: w, name: label, cost: 0, weapon: w, equip: true,
            icon: w,
            desc: 'Already owned. Equip it in a weapon slot at no cost.',
            apply() {
                player.weapons.push(w);
                syncOwnedFromWeapons();
                refreshOwnedWeapon();
            }
        };
    }
    if (!unlocked) {
        const BUY = {
            shotgun: {
                cost: S.shotgunCost,
                desc: 'Pump-action. A wide spread of pellets — devastating up close.'
            },
            rifle: {
                cost: S.rifleCost,
                desc: 'Full-auto. High rate of fire and solid damage at range.'
            },
            launcher: {
                cost: S.launcherCost,
                // Angka dibaca dari CFG — tidak basi bila gameplay.json di-retune.
                desc: `40mm rounds that explode on impact — ${CFG.weapons.launcher.damage} area damage, ${CFG.weapons.launcher.maxAmmo} rounds.`
            }
        }[w];
        // Pistol selalu dibuka saat run dimulai. Fallback ini menjaga katalog
        // tetap lengkap bila state lama/rusak tidak membawa flag arsenal.
        if (!BUY) return {
            id: w, name: label, cost: 0, weapon: w, equip: true,
            icon: w,
            desc: 'Standard sidearm. Equip it in a weapon slot at no cost.',
            apply() {
                unlockWeapon(w);
                player.weapons.push(w);
                syncOwnedFromWeapons();
                refreshOwnedWeapon();
            }
        };
        return {
            id: w, name: label, cost: BUY.cost, weapon: w,
            icon: w,
            desc: BUY.desc,
            apply() { return buyWeapon(w, label); }
        };
    }
    const maxL = CFG.weapons.maxWeaponLevel;
    const lvl = (player.weaponLvl && player.weaponLvl[w]) || 1;
    const pct = Math.round((CFG.weapons.upgradeDamagePct || 0.3) * 100);
    const costs = S.upgradeCosts[w] || [];
    const tier = Math.min(lvl, maxL - 1);          // tingkat yang DIJUAL kartu ini (lvl+1)
    return {
        id: w, weapon: w, upgrade: w,
        icon: w,
        name: `${label} ${ROMAN[Math.min(tier, ROMAN.length - 1)]}`,
        cost: costs[tier - 1] != null ? costs[tier - 1] : 0,
        desc: lvl >= maxL
            ? `Fully upgraded — Level ${maxL}, +${pct * (maxL - 1)}% damage.${cadenceNote(w, maxL)}`
            : `Level ${lvl} → ${lvl + 1}: +${pct}% of base damage.${cadenceNote(w, lvl, lvl + 1)}`,
        maxedMsg: `The ${label} is already fully upgraded`,
        apply() {
            const cur = (player.weaponLvl && player.weaponLvl[w]) || 1;
            if (cur >= maxL) return `The ${label} is already fully upgraded`;
            player.weaponLvl[w] = cur + 1;
        }
    };
}

// --- Item ARMOR & upgrade KARAKTER (2026-07-13) ------------------------------
// ARMOR: TIGA KARTU TERPISAH (revisi 2026-07-13, permintaan user) — tiap tier
// (CFG.armor.tiers) bisa dibeli LANGSUNG kapan pun (boleh lompat ke III).
// Membeli = mengenakan tier itu dgn durability penuh (mengganti yang lama).
// Tier yang SEDANG dipakai: utuh -> ditolak ('Worn'); rusak -> boleh dibeli
// lagi = REPAIR penuh. Tier LEBIH RENDAH dari yang dipakai -> ditolak.
// Armor memotong `reduce` dari damage masuk; durability menerima damage BASE
// penuh; durability 0 = HANCUR (armorLvl kembali 0, semua kartu terbuka lagi).
function armorTierItem(tier) {
    const T = (CFG.armor && CFG.armor.tiers) || [];
    const t = T[tier - 1] || {};
    const costs = CFG.shop.armorCosts || [];
    const wearingThis = (player.armorLvl || 0) === tier;
    return {
        id: 'armor' + tier, armorTier: tier, icon: 'armor',
        name: `Armor ${ROMAN[Math.min(tier - 1, ROMAN.length - 1)]}`,
        cost: costs[tier - 1] != null ? costs[tier - 1] : 0,
        desc: `Blocks ${Math.round((t.reduce || 0) * 100)}% of incoming damage. Durability ${t.durability}, shatters at 0.`
            + (wearingThis && player.armor < player.armorMax
                ? ` Damaged (${Math.max(0, Math.ceil(player.armor))}/${player.armorMax}) — buy to repair.`
                : ''),
        ownedMsg: 'You already wear stronger armor',
        apply() {
            const cur = player.armorLvl || 0;
            if (cur > tier) return 'You already wear stronger armor';
            if (cur === tier && player.armor >= player.armorMax)
                return 'This armor is already worn and intact';
            player.armorLvl = tier;
            player.armor = player.armorMax = t.durability;
        }
    };
}

// VITALITY: menaikkan MAX HP player ke tangga CFG.player.hpUpgrades (150 lalu
// 200) + menyembuhkan sebesar kenaikannya. player.maxHp = max efektif (semua
// pembaca max HP memakainya).
function vitalityItem() {
    const HP = CFG.player.hpUpgrades || [];
    const costs = CFG.shop.healthUpCosts || [];
    const lvl = player.hpLvl || 1;             // 1 = dasar; maks = HP.length + 1
    const idx = Math.min(lvl - 1, HP.length - 1);
    return {
        id: 'hpup', icon: 'vitality',
        name: `Vitality ${ROMAN[Math.min(idx, ROMAN.length - 1)]}`,
        cost: costs[idx] != null ? costs[idx] : 0,
        desc: lvl >= HP.length + 1
            ? `Maximum health is at its peak (${player.maxHp}).`
            : `Maximum health ${player.maxHp} → ${HP[idx]}, and heals the increase.`,
        maxedMsg: 'Vitality is already at its peak',
        apply() {
            const cur = player.hpLvl || 1;
            if (cur >= HP.length + 1) return 'Vitality is already at its peak';
            const target = HP[cur - 1];
            const gain = Math.max(0, target - player.maxHp);
            player.hpLvl = cur + 1;
            player.maxHp = target;
            player.hp = Math.min(player.maxHp, player.hp + gain);
        }
    };
}

// AMMO CAPACITY: menaikkan kap peluru SEMUA senjata ke tier
// CFG.weapons.ammoUpgrades (kap efektif dibaca via maxAmmoFor di state.js —
// drop/isi-ulang/HUD otomatis mengikuti). Menaikkan kap saja, tidak mengisi.
function ammoCapItem() {
    const T = CFG.weapons.ammoUpgrades || [];
    const costs = CFG.shop.ammoUpCosts || [];
    const lvl = player.ammoLvl || 1;
    const idx = Math.min(lvl - 1, T.length - 1);
    const t = T[idx] || {};
    return {
        id: 'ammoup', icon: 'pouch',
        name: `Ammo Capacity ${ROMAN[Math.min(idx, ROMAN.length - 1)]}`,
        cost: costs[idx] != null ? costs[idx] : 0,
        desc: lvl >= T.length + 1
            ? 'Ammo capacity is fully expanded.'
            : `New ammo caps: Pistol ${t.pistol}, Rifle ${t.rifle}, Shotgun ${t.shotgun}, Launcher ${t.launcher}.`,
        maxedMsg: 'Ammo capacity is already maxed',
        apply() {
            const cur = player.ammoLvl || 1;
            if (cur >= T.length + 1) return 'Ammo capacity is already maxed';
            player.ammoLvl = cur + 1;
        }
    };
}

// --- Katalog item (data-driven) --------------------------------------------
// { id, name, desc, cost, weapon?, upgrade?, maxedMsg?, apply() }. apply() ->
// null bila sukses atau string alasan penolakan (penuh/dimiliki); skor TIDAK
// dipotong saat ditolak. Kartu senjata gabungan (id = kunci senjata) di akhir
// daftar via weaponItem().
function catalog() {
    const S = CFG.shop, o = player.owned || {};
    const items = [
        {
            // Tanpa magazen (2026-07-11): isi ulang kolam peluru tiap senjata
            // yang dimiliki sampai kap maxAmmo-nya.
            id: 'ammo', name: 'Replenish All Ammo', cost: S.ammoCost,
            icon: 'ammo',
            desc: 'Refill every weapon you own to its maximum ammo.',
            apply() {
                const W = ['rifle', 'pistol', 'shotgun', 'launcher'].filter(w => o[w]);
                if (W.every(w => player[w].ammo >= maxAmmoFor(w)))
                    return 'Ammo already full';
                for (const w of W) player[w].ammo = maxAmmoFor(w);
            }
        },
        {
            // Sembuh instan (HP -> 100%). Beda dari Medkit (genggam, dipakai nanti).
            id: 'health', name: 'Replenish Health', cost: S.healthCost,
            icon: 'health',
            desc: 'Instantly restore your health to full.',
            apply() {
                if (player.hp >= player.maxHp) return 'Health already full';
                player.hp = player.maxHp;
            }
        },
        {
            // Medkit = item genggam (maks 1). Dibeli di sini; PAKAI dgn tombol 4
            // di lapangan untuk memulihkan 70% HP (bukan sembuh saat beli).
            id: 'medkit', name: 'Medkit', cost: S.medkitCost,
            icon: 'medkit',
            // Sejak 2026-07-18 medkit dipakai INSTAN dgn tombol 4 (bukan channel).
            desc: `Press 4 to heal ${Math.round(CFG.player.medkitHealPct * 100)}% of your health. Carry up to ${CFG.player.maxMedkits}.`,
            apply() {
                if (player.medkits >= CFG.player.maxMedkits) return 'Medkit stock is full';
                player.medkits = Math.min(CFG.player.maxMedkits, player.medkits + 1);
            }
        },
        // Perlengkapan KARAKTER (2026-07-13): 3 kartu armor terpisah + vitality + kap peluru
        ...(((CFG.armor && CFG.armor.tiers) || []).map((t, i) => armorTierItem(i + 1))),
        vitalityItem(),
        ammoCapItem(),
        {
            id: 'healMonas', name: 'Heal Monas', cost: S.healMonasCost,
            icon: 'monas',
            desc: 'Repair the Monument by 25% of its maximum HP.',
            apply() { return healMonas(); }
        },
        {
            // Deskripsi SENGAJA tanpa angka max HP (permintaan user) — cukup info
            // bahwa ini memperkuat Monas; besarannya bertingkat (lihat index.js).
            id: 'strengthenMonas', name: 'Strengthen Monas', cost: S.strengthenMonasCost,
            icon: 'monasPlus',
            desc: 'Reinforce the Monument: more maximum HP, and repairs it. Can be reinforced again, up to its structural limit.',
            apply() { return strengthenMonas(); }
        },
        {
            // Radar minimap: Survival mulai TANPA (player.hasRadar false); beli utk
            // mengaktifkannya. updateUI (dipanggil shopPurchase) menampilkan kanvasnya.
            id: 'radar', name: 'Radar', cost: S.radarCost,
            icon: 'radar',
            desc: 'Minimap (top-left) showing nearby robots, drops and the Monument.',
            apply() {
                if (player.hasRadar) return 'Radar already owned';
                player.hasRadar = true;
            }
        },
        // Senjata: SATU kartu gabungan beli/upgrade/equip per senjata. Keempat
        // tipe selalu ada; arsenal yang sedang di luar slot menawarkan EQUIP.
        ...WEAPON_ORDER.map(weaponItem).filter(Boolean),
    ];
    // Campaign: cuma sembunyikan item khusus Survival (Monas). HARGA SAMA dengan
    // Survival — pengali `CFG.shop.campaignPriceMul` DIHAPUS 2026-07-26 (permintaan
    // user: harga campaign = harga survival); satu daftar harga untuk kedua mode.
    if (shopCtx && shopCtx.mode === 'campaign') return items.filter(it => !SURVIVAL_ONLY.has(it.id));
    return items;
}

// Beli senjata ke SLOT kosong (dipanggil apply hanya saat slot < maxWeapons;
// kasus slot penuh ditangani shopPurchase -> pemilih ganti). Tandai dimiliki +
// kolam peluru penuh (tanpa magazen).
function buyWeapon(w, label) {
    if (hasUnlockedWeapon(w)) return `${label} already owned`;
    unlockWeapon(w);
    player.weapons.push(w);
    syncOwnedFromWeapons();
    player[w].ammo = maxAmmoFor(w);
    refreshOwnedWeapon();
}

// Status tampilan non-harga: senjata dimiliki -> 'Owned'; Medkit sudah dibawa ->
// 'Held'; Strengthen Monas di tingkat tertinggi -> 'Maxed' (Buy dimatikan).
function ownedNote(it) {
    // Kartu senjata gabungan (2026-07-17): varian dimiliki = penjual upgrade
    // (punya it.upgrade) — jangan dicap 'Owned' agar upgrade tetap terbeli.
    if (it.weapon && !it.upgrade && !it.equip && player.owned[it.weapon]) return 'Owned';
    if (it.id === 'radar' && player.hasRadar) return 'Owned';
    if (it.id === 'medkit' && player.medkits >= CFG.player.maxMedkits) return 'Full';
    if (it.id === 'strengthenMonas' && isMonasFullyStrengthened()) return 'Maxed';
    if (it.upgrade && (player.weaponLvl[it.upgrade] || 1) >= CFG.weapons.maxWeaponLevel) return 'Maxed';
    // Armor per-tier (2026-07-13): tier yang dipakai & masih UTUH -> 'Worn';
    // tier lebih rendah dari yang dipakai -> 'Owned' (pesan khusus ownedMsg).
    // Tier yang dipakai tapi RUSAK tetap bisa dibeli (repair) -> tanpa note.
    if (it.armorTier) {
        if ((player.armorLvl || 0) === it.armorTier && player.armor >= player.armorMax) return 'Worn';
        if ((player.armorLvl || 0) > it.armorTier) return 'Owned';
    }
    if (it.id === 'hpup' && (player.hpLvl || 1) >= (CFG.player.hpUpgrades || []).length + 1) return 'Maxed';
    if (it.id === 'ammoup' && (player.ammoLvl || 1) >= (CFG.weapons.ammoUpgrades || []).length + 1) return 'Maxed';
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
    if (note === 'Owned') return it.ownedMsg || `${it.name} already owned`;
    if (note === 'Worn') return 'This armor is already worn and intact';
    if (note === 'Full') return 'Medkit stock is full';
    if (note === 'Maxed') return it.maxedMsg || 'The Monument is already fully reinforced';
    if (score < it.cost) return 'Not enough money';
    // Beli senjata tipe baru sementara slot sudah penuh (maks) -> minta pilih
    // yang diganti; skor dipotong saat konfirmasi (shopReplaceWeapon).
    if (it.weapon && !player.weapons.includes(it.weapon)
        && player.weapons.length >= CFG.weapons.maxWeapons) {
        pendingWeapon = it;
        return 'choose-replace';
    }
    const snap = snapshotState();   // sebelum apply/potong skor (utk undo klik-kanan)
    const rejected = it.apply();
    if (rejected) return rejected;
    addScore(-it.cost);
    lastPurchase = { snapshot: snap, id };
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
    if (score < it.cost) { pendingWeapon = null; return 'Not enough money'; }
    const snap = snapshotState();        // utk undo klik-kanan
    const w = it.weapon;
    player.weapons[idx] = w;             // ganti di posisi slot yang sama
    const newlyUnlocked = !hasUnlockedWeapon(w);
    if (newlyUnlocked) unlockWeapon(w);
    syncOwnedFromWeapons();
    // Pembelian pertama memberi ammo penuh; memasang lagi senjata dari arsenal
    // mempertahankan ammo lamanya dan tidak memberikan refill gratis.
    if (newlyUnlocked) player[w].ammo = maxAmmoFor(w);
    addScore(-it.cost);
    lastPurchase = { snapshot: snap, id: it.id };
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
    if (confirmNext) { confirmNext = false; (shopCtx && shopCtx.onNext || startNextWave)(); return; }
    confirmNext = true;
    notice = '';
    render();
}

// --- Render DOM (createElement -> handler klik/hover nyata di browser) ------
// Format saldo/harga bergaya "credits" (pemisah ribuan) — teks UI English.
const fmtCredits = n => Number(n || 0).toLocaleString('en-US');

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
    const before = catalog().find(it => it.id === id);
    const msg = shopPurchase(id);
    if (msg === 'choose-replace') { notice = ''; render(); return; }
    setNotice(msg == null ? (before && before.equip ? 'Equipped!' : 'Purchased!') : msg, msg != null);
    render();
}

// Klik-kanan kartu: batalkan pembelian terakhir (undo satu langkah).
function doUndo() {
    const msg = shopUndoLast();
    setNotice(msg == null ? 'Purchase canceled' : msg, msg != null);
    render();
}

function doReplace(oldW) {
    const label = pendingWeaponName();
    const msg = shopReplaceWeapon(oldW);
    setNotice(msg == null ? `${label} equipped!` : msg, msg != null);
    render();
}

// Strip DETAIL di kaki panel: nama + harga/status + deskripsi LENGKAP item yang
// sedang di-hover/dipilih. Kartu hanya memuat sub-judul singkat, jadi teks
// panjang (mekanik armor, catatan kadens tembak, dst.) tetap terbaca di sini.
function showDesc(desc, it) {
    desc.innerHTML = '';
    if (!it) return;
    const head = el('div', 'shopDescHead');
    head.appendChild(el('span', 'shopDescName', it.name));
    const note = ownedNote(it);
    const priceText = it.equip ? 'OWNED — EQUIP FREE' : (note ? note : `${fmtCredits(it.cost)} CREDITS`);
    const price = el('span', 'shopDescPrice', priceText);
    if (note) price.classList.add('owned');
    else if (score < it.cost) price.classList.add('poor');
    head.appendChild(price);
    desc.appendChild(head);
    desc.appendChild(el('div', 'shopDescText', it.desc));
}

// Panel pemilih ganti senjata (menggantikan daftar saat pendingWeapon aktif).
function renderReplace(panel) {
    const body = el('div', 'shopPromptBody');
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
    const body = el('div', 'shopPromptBody');
    body.appendChild(el('div', 'shopReplaceMsg', (shopCtx && shopCtx.confirmMsg) || 'Are you ready to start the next wave?'));
    const btns = el('div', 'shopConfirmBtns');
    const yes = el('button', 'shopConfirmYes', 'Yes ▶');
    yes.addEventListener('click', () => { confirmNext = false; (shopCtx && shopCtx.onNext || startNextWave)(); });
    const no = el('button', 'shopConfirmNo', 'No');
    no.addEventListener('click', () => { confirmNext = false; render(); });
    btns.appendChild(yes);
    btns.appendChild(no);
    body.appendChild(btns);
    panel.appendChild(body);
}

// Satu kartu item — RINGKAS (2026-08-27): art SVG, nama, harga, tombol BUY.
// Tak ada sub-judul/statistik di kartu; detail lengkap muncul di strip kaki
// panel saat kartu di-hover. KLIK-KIRI kartu atau tombol BUY = beli;
// KLIK-KANAN = batalkan pembelian terakhir.
function makeCard(it, desc) {
    const card = el('div', 'shopCard');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const note = ownedNote(it);

    const art = el('div', 'shopCardArt');
    art.innerHTML = ICONS[it.icon] || '';
    card.appendChild(art);
    card.appendChild(el('div', 'shopCardName', it.name));

    const foot = el('div', 'shopCardFoot');
    const price = el('div', 'shopCardPrice', it.equip ? 'OWNED' : (note ? note.toUpperCase() : fmtCredits(it.cost)));
    foot.appendChild(price);
    const buy = el('button', 'shopBuy', it.equip ? 'EQUIP' : 'BUY');
    buy.addEventListener('click', e => { e.stopPropagation(); doPurchase(it.id); });
    foot.appendChild(buy);
    card.appendChild(foot);

    if (note) { price.classList.add('note'); card.classList.add('owned'); buy.classList.add('off'); }
    else if (score < it.cost) { price.classList.add('poor'); card.classList.add('poor'); buy.classList.add('off'); }
    if (it.id === selectedId) card.classList.add('sel');

    card.addEventListener('mouseenter', () => { selectedId = it.id; showDesc(desc, it); });
    card.addEventListener('click', () => doPurchase(it.id));          // klik-kiri = beli
    card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doPurchase(it.id); }
    });
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); doUndo(); }); // klik-kanan = batal
    return card;
}

// Header: judul TENGAH + slab saldo CREDITS di kanan (tanpa kicker/teks lain).
function renderShopHeader(panel, title) {
    const header = el('div', 'shopHeader');
    header.appendChild(el('div', 'shopIdentity'));   // penyeimbang grid kiri
    header.appendChild(el('div', 'shopHead', title));
    const balance = el('div', 'shopBalance');
    const inner = el('div', 'shopBalanceInner');
    inner.appendChild(el('span', 'shopBalanceLabel', 'CREDITS:'));
    inner.appendChild(el('span', 'shopScore', fmtCredits(score)));
    inner.appendChild(el('span', 'shopCoin', '◎'));
    balance.appendChild(inner);
    header.appendChild(balance);
    panel.appendChild(header);
}

// Baris tab di atas grid. Klik tab = ganti activeTab + pilih item pertamanya.
function renderTabs(panel) {
    const vis = visibleTabs();
    if (vis.length <= 1) return;                 // tak perlu tab bila cuma 1
    const row = el('div', 'shopTabs');
    for (const t of vis) {
        const b = el('button', 'shopTab' + (t.id === activeTab ? ' active' : ''), t.label);
        b.addEventListener('click', () => {
            activeTab = t.id;
            const first = tabItems(t.id)[0];
            if (first) selectedId = first.id;
            render();
        });
        row.appendChild(b);
    }
    panel.appendChild(row);
}

// Tombol CTA satu baris (label + panah).
function renderNext(foot) {
    const label = ((shopCtx && shopCtx.nextLabel) || 'Start Next Wave ▶').replace(/\s*▶\s*$/, '');
    const next = el('button', 'shopNext');
    next.appendChild(el('span', 'shopNextMain', label.toUpperCase()));
    next.appendChild(el('span', 'shopNextArrow', '»'));
    next.addEventListener('click', () => requestNextWave());   // -> prompt "Are you ready?"
    foot.appendChild(next);
}

function render() {
    const root = overlay();
    root.innerHTML = '';
    const panel = el('div', 'shopPanel'
        + (confirmNext || pendingWeapon ? ' shopPanelPrompt' : '')
        + (revealNext ? ' shopPanelEnter' : ''));
    revealNext = false;
    // Prompt konfirmasi mulai wave menutupi seluruh menu (Yes/No).
    if (confirmNext) {
        renderShopHeader(panel, (shopCtx && shopCtx.confirmHead) || 'START NEXT WAVE?');
        renderConfirm(panel);
        root.appendChild(panel);
        return;
    }
    renderShopHeader(panel,
        pendingWeapon ? 'REPLACE A WEAPON' : ((shopCtx && shopCtx.head) || 'FIELD SHOP'));
    panel.appendChild(el('div', 'shopMsg' + (noticeErr ? ' err' : ''), notice || ' '));

    let desc = null;
    if (pendingWeapon) {
        renderReplace(panel);
    } else {
        // Etalase: tab + GRID kartu besar (3 kolom). Tinggi grid tetap & isi
        // men-scroll di dalamnya, jadi pindah tab tidak mengubah ukuran panel.
        const workspace = el('div', 'shopWorkspace');
        const catalogPanel = el('div', 'shopCatalog');
        renderTabs(catalogPanel);
        // Pastikan tab aktif masih punya item (bisa kosong di campaign).
        if (!tabItems(activeTab).length) activeTab = firstTabId();
        desc = el('div', 'shopDesc');
        const items = tabItems(activeTab);
        const grid = el('div', 'shopGrid');
        for (let i = 0; i < items.length; i++)
            grid.appendChild(makeCard(items[i], desc));
        catalogPanel.appendChild(grid);
        workspace.appendChild(catalogPanel);
        panel.appendChild(workspace);
        // Detail awal = item terpilih dalam tab (fallback item pertama tab).
        showDesc(desc, items.find(x => x.id === selectedId) || items[0]);
    }

    const foot = el('div', 'shopFoot');
    const footMeta = el('div', 'shopFootMeta');
    if (desc) footMeta.appendChild(desc);
    footMeta.appendChild(el('div', 'shopHint', 'RIGHT CLICK  UNDO LAST PURCHASE'));
    foot.appendChild(footMeta);
    renderNext(foot);
    panel.appendChild(foot);

    root.appendChild(panel);
}
