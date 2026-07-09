// HUD: teks skor/amunisi/granat, health bar, status wave/stage, dan radar.
// Konten yang bergantung mode (teks status, landmark radar) disuplai scene
// aktif lewat hook hudStatus() dan radarLandmarks(plot).

import { CFG } from './config.js';
import { player, score, zombies, drops, _dir } from './state.js';
import { camera } from './renderer.js';
import { activeScene } from './sceneManager.js';
import { scoreText, ammoText, healthFill, waveText, radar, radarCtx, invSlots } from './dom.js';
import { currentWeapon, WEAPON_DEF, grenadeMode, medkitMode } from '../entities/weapons.js';

export function updateUI() {
    const w = player[currentWeapon];
    const wName = WEAPON_DEF[currentWeapon].name;
    scoreText.innerText = `Score: ${score}`;
    // Amunisi: senjata aktif; memegang granat -> petunjuk lempar; medkit -> petunjuk tahan.
    ammoText.innerText = medkitMode ? 'Medkit — Hold LEFT CLICK to use'
        : grenadeMode ? 'Grenade — LMB Far / RMB Near'
            : player.isReloading ? `${wName}: Reloading...` : `${wName}: ${w.ammo} / ${w.mags} Mags`;
    // Health bar (maks CFG.player.maxHp): warna merah tetap (CSS)
    healthFill.style.width = (player.hp / CFG.player.maxHp * 100) + '%';
    // Radar minimap disembunyikan sampai dimiliki (Survival: dibeli di shop).
    radar.style.display = player.hasRadar ? '' : 'none';
    updateInventory();
    // Survival: nomor wave. Campaign: sisa zombie di stage aktif.
    if (activeScene && activeScene.hudStatus) waveText.innerText = activeScene.hudStatus();
}

// Panel inventori sisi kanan: slot 1/2 = senjata (player.weapons, maks 2),
// 3 = granat (jumlah), 4 = medkit (jumlah). Slot aktif (senjata terpegang atau
// mode granat) disorot; slot kosong / hitungan 0 diredupkan.
function updateInventory() {
    const W = player.weapons || [];
    const setSlot = (i, name, active, dim) => {
        const s = invSlots[i];
        if (!s || !s.name) return;
        s.name.innerText = name;
        s.row.classList.toggle('active', !!active);
        s.row.classList.toggle('dim', !!dim);
    };
    for (let i = 0; i < 2; i++) {
        const wk = W[i];
        setSlot(i, wk ? WEAPON_DEF[wk].name : '—',
            wk && !grenadeMode && currentWeapon === wk, !wk);
    }
    setSlot(2, `Grenade ×${player.grenades}`, grenadeMode, player.grenades <= 0);
    setSlot(3, `Medkit ×${player.medkits}`, medkitMode, player.medkits <= 0);
}

// ----------- Radar / minimap ----------- //
// Proyeksi relatif-player, heading selalu ke ATAS kanvas:
//   px = komponen KANAN-dunia, py = -(komponen DEPAN-dunia)  (kanvas y ke bawah).
// (Perbaikan bug lama: rumus rotasi sebelumnya terbalik 180° — zombie di depan
// tergambar di belakang & kiri jadi kanan.)
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

    // arah hadap player, dinormalisasi di bidang xz (pitch diabaikan)
    camera.getWorldDirection(_dir);
    const fl = Math.hypot(_dir.x, _dir.z) || 1;
    const fx = _dir.x / fl, fz = _dir.z / fl;

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

    // Kerucut pandang player (FOV ~70°, selalu menghadap atas)
    const cone = radarCtx.createRadialGradient(0, 0, 2, 0, 0, R * 0.62);
    cone.addColorStop(0, 'rgba(116, 185, 255, 0.28)');
    cone.addColorStop(1, 'rgba(116, 185, 255, 0)');
    radarCtx.fillStyle = cone;
    radarCtx.beginPath();
    radarCtx.moveTo(0, 0);
    radarCtx.arc(0, 0, R * 0.62, -Math.PI / 2 - 0.61, -Math.PI / 2 + 0.61);
    radarCtx.closePath();
    radarCtx.fill();

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

    // Zombie
    for (const z of zombies)
        plot(z.mesh.position.x - camera.position.x, z.mesh.position.z - camera.position.z, "#ff4757", 3);
    // Drops (mag kuning, granat hijau, medkit merah muda)
    for (const d of drops)
        plot(d.mesh.position.x - camera.position.x, d.mesh.position.z - camera.position.z,
            d.type === 'mag' ? "#f1c40f" : d.type === 'medkit' ? "#ff6b81" : "#2ecc71", 2.5);

    // Penanda N (utara dunia = -z), ikut berputar dgn heading
    radarCtx.fillStyle = 'rgba(180, 220, 255, 0.85)';
    radarCtx.font = 'bold 9px Arial';
    radarCtx.textAlign = 'center';
    radarCtx.textBaseline = 'middle';
    radarCtx.fillText('N', -fx * (R - 9), fz * (R - 9));

    // Panah player di pusat (dgn glow)
    radarCtx.shadowColor = '#9ed2ff';
    radarCtx.shadowBlur = 5;
    radarCtx.fillStyle = '#cfe9ff';
    radarCtx.beginPath();
    radarCtx.moveTo(0, -7); radarCtx.lineTo(4.6, 5.4); radarCtx.lineTo(0, 2.6); radarCtx.lineTo(-4.6, 5.4);
    radarCtx.closePath(); radarCtx.fill();
    radarCtx.shadowBlur = 0;
    radarCtx.restore();

    // Cincin bezel dalam (di luar clip agar tepinya tegas)
    radarCtx.save();
    radarCtx.translate(W / 2, W / 2);
    radarCtx.strokeStyle = 'rgba(116, 185, 255, 0.45)';
    radarCtx.lineWidth = 1.5;
    radarCtx.beginPath(); radarCtx.arc(0, 0, R - 1, 0, Math.PI * 2); radarCtx.stroke();
    radarCtx.restore();
}
