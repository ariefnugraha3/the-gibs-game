// HUD: teks skor/amunisi/granat, health bar, status wave/stage, dan radar.
// Konten yang bergantung mode (teks status, landmark radar) disuplai scene
// aktif lewat hook hudStatus() dan radarLandmarks(plot).

import { CFG } from './config.js';
import { player, score, robots, drops, _dir, maxAmmoFor } from './state.js';
import { camera, SCREEN_UP } from './renderer.js';
import { activeScene } from './sceneManager.js';
import {
    scoreText, ammoWeapon, ammoCount, ammoMags, ammoHint, ammoBox,
    healthFill, healthNum, armorRow, armorFill, armorNum,
    waveText, radar, radarCtx, invSlots
} from './dom.js';
import { currentWeapon, WEAPON_DEF, medkitMode } from '../entities/weapons.js';

export function updateUI() {
    const w = player[currentWeapon];
    const wName = WEAPON_DEF[currentWeapon].name;
    scoreText.innerText = score;   // label "MONEY" statis di HTML (2026-07-22; `score` = uang/mata uang shop)
    // Modul amunisi (tanpa magazen 2026-07-11): nama senjata/item + hitungan
    // peluru besar + "/ maxAmmo" + baris petunjuk. Memegang granat/medkit ->
    // hitungan item itu. (Reload dihapus bersama sistem magazen.)
    let itemName, count, mags = '', hint = '';
    if (medkitMode) {
        itemName = 'Medkit'; count = player.medkits; hint = 'Hold LEFT CLICK to use';
    } else {
        // Nama senjata + LEVEL upgrade shop (2026-07-13): " II"/" III" hanya
        // saat sudah di-upgrade (Lv1 = nama polos). Kap peluru = kap efektif
        // (ikut tier Ammo Capacity via maxAmmoFor).
        const wl = (player.weaponLvl && player.weaponLvl[currentWeapon]) || 1;
        itemName = wName + (wl > 1 ? ' ' + ['I', 'II', 'III'][Math.min(wl, 3) - 1] : '');
        count = w.ammo; mags = `/ ${maxAmmoFor(currentWeapon)}`;
    }
    ammoWeapon.innerText = itemName;
    ammoCount.innerText = count;
    ammoMags.innerText = mags;
    ammoHint.innerText = hint;
    // Health bar (maks = player.maxHp EFEKTIF — bisa naik via item Vitality):
    // warna merah tetap (CSS) — JS menulis LEBAR + angka + kelas 'low' (<= 25%).
    const mhp = player.maxHp || CFG.player.maxHp;
    healthFill.style.width = Math.max(0, player.hp / mhp * 100) + '%';
    healthNum.innerText = Math.max(0, Math.ceil(player.hp));
    healthFill.classList.toggle('low', player.hp <= mhp * 0.25);
    // Bar ARMOR (2026-07-13): tampil hanya saat memakai armor; lebar =
    // durability sisa / durability penuh tier (baja kebiruan, CSS).
    const wearing = (player.armorLvl || 0) > 0 && player.armorMax > 0;
    armorRow.style.display = wearing ? '' : 'none';
    if (wearing) {
        armorFill.style.width = Math.max(0, player.armor / player.armorMax * 100) + '%';
        armorNum.innerText = Math.max(0, Math.ceil(player.armor));
    }
    // Radar minimap disembunyikan sampai dimiliki (Survival: dibeli di shop).
    radar.style.display = player.hasRadar ? '' : 'none';
    updateInventory();
    // Survival: nomor wave. Campaign: sisa robot di stage aktif.
    if (activeScene && activeScene.hudStatus) waveText.innerText = activeScene.hudStatus();
}

// ----- Ikon item inventori (SVG buatan sendiri, BUKAN emoji/teks) -----
// viewBox 24x24, fill/stroke = currentColor supaya ikut warna slot (emas saat
// aktif, redup saat kosong). Siluet dibuat berbeda-beda agar mudah dibedakan:
// pistol pendek (slide+grip), rifle panjang (laras+popor+magazen), shotgun
// (laras + tabung pump di bawah + popor tebal), granat (badan bulat+tuas+ring),
// medkit (kotak + palang).
const ITEM_ICONS = {
    pistol:
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="currentColor" d="M3 8h14v3h-4l-2 8H8l2-8H3z"/></svg>',
    rifle:
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="2" y="8.4" width="20" height="2.6" rx="0.6" fill="currentColor"/>' +
        '<rect x="2" y="8.4" width="3.2" height="4.4" rx="0.6" fill="currentColor"/>' +
        '<path fill="currentColor" d="M10 11h3l-.7 4h-2.4z"/>' +
        '<path fill="currentColor" d="M6.6 11h2l-.5 2.7H6.1z"/>' +
        '<rect x="17.4" y="6.7" width="1.3" height="1.9" fill="currentColor"/></svg>',
    shotgun:
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="2" y="8" width="20" height="2.4" rx="0.6" fill="currentColor"/>' +
        '<rect x="7" y="11" width="10" height="1.8" rx="0.6" fill="currentColor"/>' +
        '<path fill="currentColor" d="M2 8h4.2v5L2 14z"/>' +
        '<path fill="currentColor" d="M6.6 10.4h2l-.4 2.5H6.2z"/></svg>',
    launcher:
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="4.5" y="8.2" width="12" height="3.8" rx="1.4" fill="currentColor"/>' +   // laras gemuk 40mm
        '<circle cx="5" cy="10.1" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +   // bore muzzle
        '<path fill="currentColor" d="M13.4 11.6h3l-1 4.4h-2.3z"/>' +   // pistol grip
        '<rect x="15.8" y="9.1" width="4.6" height="2" rx="0.9" fill="currentColor"/></svg>',   // popor pendek
    medkit:
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="3" y="6.5" width="18" height="13" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
        '<path fill="currentColor" d="M10.4 9.2h3.2v2.6h2.6v3.2h-2.6v2.6h-3.2v-2.6H7.8v-3.2h2.6z"/></svg>',
};

// Panel inventori (pojok kanan-bawah, baris IKON): slot 1/2/3 = senjata
// (player.weapons, maks 3), 4 = medkit (jumlah). Slot aktif (senjata terpegang /
// mode medkit) disorot; slot kosong / hitungan 0 diredupkan. Ikon (SVG) ditulis
// ulang HANYA saat KEY berubah (cache `_iconKey`) — updateUI sering dipanggil
// (per tembakan), hindari re-parse.
function updateInventory() {
    const W = player.weapons || [];
    const setSlot = (i, iconKey, count, active, dim) => {
        const s = invSlots[i];
        if (!s || !s.row) return;
        if (s.icon && s._iconKey !== iconKey) {
            s.icon.innerHTML = iconKey ? ITEM_ICONS[iconKey] : '';
            s._iconKey = iconKey;
        }
        if (s.count) s.count.innerText = count == null ? '' : count;
        s.row.classList.toggle('active', !!active);
        s.row.classList.toggle('dim', !!dim);
    };
    for (let i = 0; i < 3; i++) {
        const wk = W[i];
        setSlot(i, wk || null, null, wk && !medkitMode && currentWeapon === wk, !wk);
    }
    setSlot(3, 'medkit', player.medkits, medkitMode, player.medkits <= 0);
}

// ----------- Radar / minimap ----------- //
// Proyeksi relatif-player ke frame (fx,fz) = arah "atas" radar di dunia. Sejak
// 2026-07-16 drawRadar memanggilnya dgn frame SEJAJAR LAYAR (fx,fz = SCREEN_UP)
// supaya radar sebidang dgn tampilan (dulu utara-tetap fx=0,fz=-1). Radar TETAP
// tak berputar mengikuti kursor (frame = orientasi kamera yang tetap).
// Diekspor agar bisa di-unit-test tanpa canvas.
export function radarProject(dx, dz, fx, fz, R, range) {
    return {
        px: (dx * -fz + dz * fx) / range * R,
        py: -(dx * fx + dz * fz) / range * R,
    };
}

export function drawRadar() {
    if (!player.hasRadar) return;   // radar belum dimiliki (Survival: belum dibeli) -> jangan gambar
    const W = 150, R = 70, range = 420;
    radarCtx.clearRect(0, 0, W, W);

    // Radar SEJAJAR LAYAR (2026-07-16): frame proyeksi = SCREEN_UP (arah "atas
    // layar" di dunia) — bukan lagi utara-tetap. Sejak kamera diputar ke barat
    // daya, utara dunia (-z) tampil serong di layar; menyamakan frame radar dgn
    // layar membuat blip di radar sejajar dengan yang terlihat (permintaan user).
    // Penanda N lalu bergeser ke arah utara SEBENARNYA (serong kiri-atas), cocok
    // dgn tampilan. Peta tetap TAK berputar mengikuti kursor (frame kamera tetap).
    const fx = SCREEN_UP.x, fz = SCREEN_UP.z;
    camera.getWorldDirection(_dir);
    // Sudut BIDIK relatif "atas radar" (= atas layar): 0 = atas, + searah jarum jam.
    // Rumus umum thd frame (fx,fz); utk fx=0,fz=-1 menyusut ke atan2(dir.x,-dir.z).
    const aimAngle = Math.atan2(_dir.x * -fz + _dir.z * fx, _dir.x * fx + _dir.z * fz);

    radarCtx.save();
    radarCtx.translate(W / 2, W / 2);
    radarCtx.beginPath();
    radarCtx.arc(0, 0, R, 0, Math.PI * 2);
    radarCtx.clip();

    // Latar: isian gelap polos (flat, tanpa gradien)
    radarCtx.fillStyle = 'rgba(8, 17, 25, 0.85)';
    radarCtx.fillRect(-R, -R, R * 2, R * 2);

    // Grid: dua cincin jarak + garis silang tipis
    radarCtx.strokeStyle = 'rgba(116, 185, 255, 0.15)';
    radarCtx.lineWidth = 1;
    for (const rr of [R * 0.38, R * 0.72]) {
        radarCtx.beginPath(); radarCtx.arc(0, 0, rr, 0, Math.PI * 2); radarCtx.stroke();
    }
    radarCtx.beginPath();
    radarCtx.moveTo(-R, 0); radarCtx.lineTo(R, 0);
    radarCtx.moveTo(0, -R); radarCtx.lineTo(0, R);
    radarCtx.stroke();

    // Kerucut BIDIK player (FOV ~70°), diputar ke arah bidik dlm frame utara-atas
    radarCtx.save();
    radarCtx.rotate(aimAngle);
    const cone = radarCtx.createRadialGradient(0, 0, 2, 0, 0, R * 0.62);
    cone.addColorStop(0, 'rgba(116, 185, 255, 0.28)');
    cone.addColorStop(1, 'rgba(116, 185, 255, 0)');
    radarCtx.fillStyle = cone;
    radarCtx.beginPath();
    radarCtx.moveTo(0, 0);
    radarCtx.arc(0, 0, R * 0.62, -Math.PI / 2 - 0.61, -Math.PI / 2 + 0.61);
    radarCtx.closePath();
    radarCtx.fill();
    radarCtx.restore();

    // Blip bercahaya. Landmark (clampEdge=true) di luar jangkauan DIJEPIT ke
    // tepi sebagai penunjuk arah (mis. tangga exit / air mancur / Monas).
    const plot = (dx, dz, color, size, clampEdge = false) => {
        let { px, py } = radarProject(dx, dz, fx, fz, R, range);
        const d = Math.hypot(px, py);
        if (d > R - 3) {
            if (!clampEdge) return;   // di luar jangkauan
            const s = (R - 6) / (d || 1);
            px *= s; py *= s;
            radarCtx.globalAlpha = 0.8;
        }
        radarCtx.shadowColor = color;
        radarCtx.shadowBlur = 6;
        radarCtx.fillStyle = color;
        radarCtx.beginPath();
        radarCtx.arc(px, py, size, 0, Math.PI * 2);
        radarCtx.fill();
        radarCtx.shadowBlur = 0;
        radarCtx.globalAlpha = 1;
    };

    // Landmark per scene: Monas (survival) / tangga exit / air mancur + blokade
    if (activeScene && activeScene.radarLandmarks) activeScene.radarLandmarks(plot);

    // Robot
    for (const z of robots)
        plot(z.mesh.position.x - camera.position.x, z.mesh.position.z - camera.position.z, "#ff4757", 3);
    // Drops (mag kuning, medkit merah muda, loot/uang amber, lainnya hijau)
    for (const d of drops)
        plot(d.mesh.position.x - camera.position.x, d.mesh.position.z - camera.position.z,
            d.type === 'mag' ? "#f1c40f" : d.type === 'medkit' ? "#ff6b81"
                : d.type === 'loot' ? "#ffb03b" : "#2ecc71", 2.5);

    // Penanda N — di titik tempat utara SEBENARNYA jatuh di radar. Dgn frame
    // sejajar-layar (SCREEN_UP unit), rumus (-fx, fz)·(R-9) = arah utara dunia
    // pada radar (serong kiri-atas saat kamera barat daya).
    radarCtx.fillStyle = 'rgba(180, 220, 255, 0.85)';
    radarCtx.font = 'bold 9px Arial';
    radarCtx.textAlign = 'center';
    radarCtx.textBaseline = 'middle';
    radarCtx.fillText('N', -fx * (R - 9), fz * (R - 9));

    // Panah player di pusat (dgn glow), diputar ke arah BIDIK (frame utara-atas)
    radarCtx.save();
    radarCtx.rotate(aimAngle);
    radarCtx.shadowColor = '#9ed2ff';
    radarCtx.shadowBlur = 5;
    radarCtx.fillStyle = '#cfe9ff';
    radarCtx.beginPath();
    radarCtx.moveTo(0, -7); radarCtx.lineTo(4.6, 5.4); radarCtx.lineTo(0, 2.6); radarCtx.lineTo(-4.6, 5.4);
    radarCtx.closePath(); radarCtx.fill();
    radarCtx.shadowBlur = 0;
    radarCtx.restore();   // tutup rotate panah
    radarCtx.restore();   // tutup translate+clip radar

    // Cincin bezel dalam (di luar clip agar tepinya tegas)
    radarCtx.save();
    radarCtx.translate(W / 2, W / 2);
    radarCtx.strokeStyle = 'rgba(116, 185, 255, 0.45)';
    radarCtx.lineWidth = 1.5;
    radarCtx.beginPath(); radarCtx.arc(0, 0, R - 1, 0, Math.PI * 2); radarCtx.stroke();
    radarCtx.restore();
}
