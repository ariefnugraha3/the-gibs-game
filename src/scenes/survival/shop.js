// Shop antar-gelombang Survival (overhaul MENU KLIK 2026-07-08): overlay modal
// berbasis mouse (game DI-PAUSE + pointer dilepas oleh input.js selama
// shopActive()). Terbuka OTOMATIS saat sebuah wave selesai (scene memanggil
// openShop() setelah hitung mundur). Tata letak (redesign 2026-07-09): GRID
// kartu item — tiap kartu punya nama + tombol Buy SENDIRI (kiri-bawah kartu);
// panel deskripsi + harga LEBAR PENUH di bawah grid (diperbarui saat hover/pilih
// kartu, TIDAK membeli); bawah-kiri = skor, bawah-kanan = Start Next Wave. Item:
// isi ulang Ammo/Grenade, Replenish Health, Medkit, Heal & Strengthen Monas,
// Radar, BELI Shotgun / Assault Rifle / Grenade Launcher, dan UPGRADE senjata
// (Lv2 lalu Lv3 = maks, +25% damage base per level — kartu hanya muncul utk
// senjata yang dimiliki). Mata uang = skor. Membeli senjata ke-4
// (slot penuh) -> tampilkan pemilih GANTI senjata.
// Semua teks UI English (aturan permanen). Impor Monas/Next-Wave dari scene
// (index.js) — circular, hanya dipakai DI DALAM fungsi (pola arsitektur).

import { CFG } from '../../core/config.js';
import { player, score, addScore, setScore, syncOwnedFromWeapons, maxAmmoFor } from '../../core/state.js';
import { updateUI } from '../../core/hud.js';
import { playSFX, sfxPurchase } from '../../utils/sfx.js';
import { WEAPON_DEF, refreshOwnedWeapon } from '../../entities/weapons.js';
import { healMonas, strengthenMonas, startNextWave, isMonasFullyStrengthened, getMonasState, setMonasState } from './index.js';

let open = false;
let selectedId = null;
let activeTab = 'weapon';   // tab aktif (2026-07-15): Weapons/Armor/Upgrades/General
let notice = '', noticeErr = false, noticeT = 0;
let pendingWeapon = null;   // senjata yang menunggu konfirmasi GANTI (slot penuh)
let confirmNext = false;    // prompt "Are you ready?" sebelum mulai wave berikutnya
let lastPurchase = null;    // snapshot pembelian TERAKHIR (klik kanan = batal beli)
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

// --- TAB shop (2026-07-15) --------------------------------------------------
// Katalog dikelompokkan ke 4 tab agar tidak berantakan (permintaan user):
//  - weapon : tiap senjata (pistol/shotgun/rifle/launcher) SATU BARIS = kartu
//             beli + kartu upgrade-nya.
//  - armor  : 3 kartu armor.
//  - upgrade: Ammo Capacity + Vitality (max HP) + Strengthen Monas.
//  - general: sisanya (isi ulang ammo/health, medkit, Heal Monas, Radar).
// Tab murni urusan RENDER — catalog() tetap daftar rata (dipakai shopPurchase
// & filter campaign). itemTab() mengklasifikasi tiap item.
const TABS = [
    { id: 'weapon', label: 'Weapons' },
    { id: 'armor', label: 'Armor' },
    { id: 'upgrade', label: 'Upgrades' },
    { id: 'general', label: 'General' },
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
    };
}

export function closeShop() {
    if (!open) return;
    open = false;
    notice = '';
    pendingWeapon = null;
    confirmNext = false;
    lastPurchase = null;
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

// --- Item upgrade senjata (level 2 lalu 3 = maks) ---------------------------
// Tiap level menambah +upgradeDamagePct (25%) dari damage BASE (Lv2 = 125%,
// Lv3 = 150%) — diterapkan weaponDamage() di weapons.js saat peluru lahir
// (peluru launcher meneruskannya ke boom AoE). Item hanya MUNCUL bila
// senjatanya sedang dimiliki (syarat user); level tersimpan per-tipe
// (player.weaponLvl, per-run) sehingga bertahan bila senjatanya diganti
// lalu dibeli lagi. Harga per tingkat dari CFG.shop.upgradeCosts[w].
const ROMAN = ['I', 'II', 'III'];
function upgradeItem(w) {
    const label = WEAPON_DEF[w].name;
    const maxL = CFG.weapons.maxWeaponLevel;
    const lvl = (player.weaponLvl && player.weaponLvl[w]) || 1;
    const pct = Math.round((CFG.weapons.upgradeDamagePct || 0.25) * 100);
    const costs = CFG.shop.upgradeCosts[w] || [];
    const tier = Math.min(lvl, maxL - 1);          // tingkat yang DIJUAL kartu ini (lvl+1)
    return {
        id: 'up_' + w, upgrade: w,
        name: `Upgrade ${label} ${ROMAN[Math.min(tier, ROMAN.length - 1)]}`,
        cost: costs[tier - 1] != null ? costs[tier - 1] : 0,
        desc: lvl >= maxL
            ? `The ${label} is fully upgraded (Level ${maxL}, +${pct * (maxL - 1)}% damage).`
            : `Upgrade the ${label} to Level ${lvl + 1}. Each level adds +${pct}% of its base damage. Current: Level ${lvl}.`,
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
        id: 'armor' + tier, armorTier: tier,
        name: `Armor ${ROMAN[Math.min(tier - 1, ROMAN.length - 1)]}`,
        cost: costs[tier - 1] != null ? costs[tier - 1] : 0,
        desc: `Equip Level ${tier} armor: blocks ${Math.round((t.reduce || 0) * 100)}% of incoming damage. Durability ${t.durability} — it absorbs the FULL base damage of every hit and shatters at 0.`
            + (wearingThis && player.armor < player.armorMax
                ? ` Worn and damaged (${Math.max(0, Math.ceil(player.armor))}/${player.armorMax}) — buy again to fully repair it.`
                : ' Buying replaces whatever armor you wear.'),
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
        id: 'hpup',
        name: `Vitality ${ROMAN[Math.min(idx, ROMAN.length - 1)]}`,
        cost: costs[idx] != null ? costs[idx] : 0,
        desc: lvl >= HP.length + 1
            ? `Your body is at peak condition (maximum health ${player.maxHp}).`
            : `Toughen up: raises your maximum health to ${HP[idx]} and heals the increase. Current maximum: ${player.maxHp}.`,
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
        id: 'ammoup',
        name: `Ammo Capacity ${ROMAN[Math.min(idx, ROMAN.length - 1)]}`,
        cost: costs[idx] != null ? costs[idx] : 0,
        desc: lvl >= T.length + 1
            ? 'Your ammo pouches are fully expanded.'
            : `Expand your ammo pouches — new capacity: Pistol ${t.pistol}, Assault Rifle ${t.rifle}, Shotgun ${t.shotgun}, Grenade Launcher ${t.launcher}.`,
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
// dipotong saat ditolak. Item upgrade (up_<w>) ikut di akhir daftar, hanya
// untuk senjata yang dimiliki.
function catalog() {
    const S = CFG.shop, o = player.owned || {};
    const items = [
        {
            // Tanpa magazen (2026-07-11): isi ulang kolam peluru tiap senjata
            // yang dimiliki sampai kap maxAmmo-nya.
            id: 'ammo', name: 'Replenish All Ammo', cost: S.ammoCost,
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
            desc: 'Instantly restore your health to full (100%).',
            apply() {
                if (player.hp >= player.maxHp) return 'Health already full';
                player.hp = player.maxHp;
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
        // Perlengkapan KARAKTER (2026-07-13): 3 kartu armor terpisah + vitality + kap peluru
        ...(((CFG.armor && CFG.armor.tiers) || []).map((t, i) => armorTierItem(i + 1))),
        vitalityItem(),
        ammoCapItem(),
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
            desc: 'Deploy a tactical radar (top-left minimap) that reveals nearby robots, supply drops, and the Monument.',
            apply() {
                if (player.hasRadar) return 'Radar already owned';
                player.hasRadar = true;
            }
        },
        {
            id: 'shotgun', name: 'Shotgun', cost: S.shotgunCost, weapon: 'shotgun',
            desc: 'Pump-action shotgun. Fires a wide spread of pellets per shot — devastating up close.',
            apply() { return buyWeapon('shotgun', 'Shotgun'); }
        },
        {
            id: 'rifle', name: 'Assault Rifle', cost: S.rifleCost, weapon: 'rifle',
            desc: 'Full-auto assault rifle. High rate of fire and solid damage at range.',
            apply() { return buyWeapon('rifle', 'Assault Rifle'); }
        },
        {
            id: 'launcher', name: 'Grenade Launcher', cost: S.launcherCost, weapon: 'launcher',
            // Angka damage/kapasitas dibaca dari CFG saat katalog dibangun —
            // tidak basi bila gameplay.json di-retune.
            desc: `Fires 40mm grenade rounds that EXPLODE on impact (including on a direct robot hit) — ${CFG.weapons.launcher.damage} area damage. Slow to fire; carries ${CFG.weapons.launcher.maxAmmo} rounds.`,
            apply() { return buyWeapon('launcher', 'Grenade Launcher'); }
        },
        // Upgrade senjata: hanya senjata yang sedang DIMILIKI yang kartunya muncul.
        ...['pistol', 'shotgun', 'rifle', 'launcher'].filter(w => o[w]).map(upgradeItem),
    ];
    // Campaign: sembunyikan item khusus Survival (Monas/Radar/beli-senjata).
    if (shopCtx && shopCtx.mode === 'campaign') return items.filter(it => !SURVIVAL_ONLY.has(it.id));
    return items;
}

// Beli senjata ke SLOT kosong (dipanggil apply hanya saat slot < maxWeapons;
// kasus slot penuh ditangani shopPurchase -> pemilih ganti). Tandai dimiliki +
// kolam peluru penuh (tanpa magazen).
function buyWeapon(w, label) {
    if (player.owned[w]) return `${label} already owned`;
    player.weapons.push(w);
    syncOwnedFromWeapons();
    player[w].ammo = maxAmmoFor(w);
    refreshOwnedWeapon();
}

// Status tampilan non-harga: senjata dimiliki -> 'Owned'; Medkit sudah dibawa ->
// 'Held'; Strengthen Monas di tingkat tertinggi -> 'Maxed' (Buy dimatikan).
function ownedNote(it) {
    if (it.weapon && player.owned[it.weapon]) return 'Owned';
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
    if (score < it.cost) return 'Not enough score';
    // Beli senjata tipe baru sementara slot sudah penuh (maks) -> minta pilih
    // yang diganti; skor dipotong saat konfirmasi (shopReplaceWeapon).
    if (it.weapon && !player.owned[it.weapon]
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
    if (score < it.cost) { pendingWeapon = null; return 'Not enough score'; }
    const snap = snapshotState();        // utk undo klik-kanan
    const w = it.weapon;
    player.weapons[idx] = w;             // ganti di posisi slot yang sama
    syncOwnedFromWeapons();
    player[w].ammo = maxAmmoFor(w);   // kolam peluru penuh (kap efektif, tanpa magazen)
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

// Bangun satu kartu item (nama + harga/status). Tanpa tombol Buy (2026-07-15):
// KLIK-KIRI kartu = langsung beli; KLIK-KANAN = batalkan pembelian terakhir;
// hover = preview di panel deskripsi. `desc` = panel deskripsi yang diperbarui.
function makeCard(it, desc) {
    const card = el('div', 'shopCard');
    card.appendChild(el('div', 'shopCardName', it.name));
    const note = ownedNote(it);
    const foot = el('div', 'shopCardPrice', note ? note : `${it.cost}`);
    if (note) { foot.classList.add('note'); card.classList.add('owned'); }
    else if (score < it.cost) { foot.classList.add('poor'); card.classList.add('poor'); }
    card.appendChild(foot);
    if (it.id === selectedId) card.classList.add('sel');
    card.addEventListener('mouseenter', () => { selectedId = it.id; showDesc(desc, it); });
    card.addEventListener('click', () => doPurchase(it.id));          // klik-kiri = beli
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); doUndo(); }); // klik-kanan = batal
    return card;
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

function render() {
    const root = overlay();
    root.innerHTML = '';
    const panel = el('div', 'shopPanel');
    // Prompt konfirmasi mulai wave menutupi seluruh menu (Yes/No).
    if (confirmNext) {
        panel.appendChild(el('div', 'shopHead', (shopCtx && shopCtx.confirmHead) || 'START NEXT WAVE?'));
        renderConfirm(panel);
        root.appendChild(panel);
        return;
    }
    panel.appendChild(el('div', 'shopHead', pendingWeapon ? 'REPLACE A WEAPON' : ((shopCtx && shopCtx.head) || 'FIELD SHOP')));
    panel.appendChild(el('div', 'shopMsg' + (noticeErr ? ' err' : ''), notice || ' '));

    if (pendingWeapon) {
        renderReplace(panel);
    } else {
        // Tab + isi tab aktif + panel deskripsi lebar penuh di bawahnya.
        renderTabs(panel);
        // Pastikan tab aktif masih punya item (bisa kosong di campaign).
        if (!tabItems(activeTab).length) activeTab = firstTabId();
        const desc = el('div', 'shopDesc');
        const items = tabItems(activeTab);
        // SATU grid seragam untuk SEMUA tab (kartu berukuran & bergaya sama).
        // Tab weapon: setiap senjata dimulai di kolom 1 (kelas `rowStart`) agar
        // pasangan [Beli]+[Upgrade]-nya duduk pada satu baris — tanpa mengubah
        // gaya/ukuran kartu. Tinggi grid TETAP (CSS) agar panel tak berubah
        // ukuran saat pindah tab.
        const grid = el('div', 'shopGrid');
        if (activeTab === 'weapon') {
            for (const w of WEAPON_ORDER) {
                const rowItems = items.filter(it => it.weapon === w || it.upgrade === w);
                rowItems.forEach((it, i) => {
                    const card = makeCard(it, desc);
                    if (i === 0) card.classList.add('rowStart');   // mulai baris baru per senjata
                    grid.appendChild(card);
                });
            }
        } else {
            for (const it of items) grid.appendChild(makeCard(it, desc));
        }
        panel.appendChild(grid);
        panel.appendChild(desc);
        // Deskripsi awal = item terpilih dalam tab (fallback item pertama tab).
        showDesc(desc, items.find(x => x.id === selectedId) || items[0]);
    }

    const foot = el('div', 'shopFoot');
    foot.appendChild(el('div', 'shopScore', `Score: ${score}`));
    foot.appendChild(el('div', 'shopHint', 'Left-click to buy · Right-click to cancel'));
    const next = el('button', 'shopNext', (shopCtx && shopCtx.nextLabel) || 'Start Next Wave ▶');
    next.addEventListener('click', () => requestNextWave());   // -> prompt "Are you ready?"
    foot.appendChild(next);
    panel.appendChild(foot);

    root.appendChild(panel);
}
