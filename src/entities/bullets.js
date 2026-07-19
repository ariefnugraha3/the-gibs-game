// Gerak & umur peluru. Peluru lahir di weapons.js (blok menembak); hit test
// vs robot di robots.js (sweep segmen). Di sini: maju, catat titik awal
// segmen sweep, dan mati oleh umur / dinding dunia milik scene aktif /
// BATAS KURSOR (2026-07-16: peluru berhenti tepat di titik kursor saat
// tembakan dilepas — lewat batas = lenyap + efek tembakan di lantai).

import { bullets } from '../core/state.js';
import { scene } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { queueBoom } from './robots.js';
import { spawnBulletFloorHit } from './effects.js';

export function updateBullets(step) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        // Peluru yang frame LALU berhenti di batas kursor (b.ended): segmen
        // terakhirnya sudah diberi giliran sweep robot (robots.js jalan setelah
        // updateBullets) — sekarang baru mati. Launcher MELEDAK di posisi akhir;
        // peluru biasa (pelet pertama, flag b.fx) memunculkan efek tembakan di
        // lantai DI POSISI AKHIR PELURU (2026-07-16: dulu di titik kursor beku
        // fxX/fxZ — sebar arah jadi tak terlihat, semua tembakan tampak mendarat
        // di satu titik yang sama).
        if (b.ended) {
            if (b.explosive) queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage, b.boomSfx);
            else if (b.fx) spawnBulletFloorHit(b.mesh.position.x, b.mesh.position.z, b.mesh.position.y);
            scene.remove(b.mesh); bullets.splice(i, 1);
            continue;
        }
        // Titik awal segmen sweep frame ini (frame pertama tetap di mata player —
        // bug fix point-blank: muzzle ~13 unit di depan mata)
        if (b.first) b.first = false;
        else { b.px = b.mesh.position.x; b.py = b.mesh.position.y; b.pz = b.mesh.position.z; }
        b.mesh.position.addScaledVector(b.dir, b.speed * step);
        b.life -= step;
        // Batas kursor: jarak horizontal dari titik tembak (sx/sz) >= maxDist ->
        // JEPIT posisi tepat di batas (mundurkan overshoot searah laju) lalu
        // tandai ended — mati frame BERIKUTNYA supaya robot persis di kursor
        // masih kena hit test segmen terakhir ini.
        if (b.maxDist !== undefined) {
            const dx = b.mesh.position.x - b.sx, dz = b.mesh.position.z - b.sz;
            const d = Math.hypot(dx, dz);
            if (d >= b.maxDist) {
                if (d > 1e-6) b.mesh.position.addScaledVector(b.dir, -(d - b.maxDist));
                b.ended = true;
                continue;
            }
        }
        // Dinding dunia per scene: survival = badan Monas; campaign stage 1 =
        // dinding grid gedung (mencegah membunuh robot diam menembus tembok);
        // stage 2 = tidak ada (gedung dekoratif, peluru habis oleh umur).
        const hitWall = activeScene.bulletBlocked(b);
        if (b.life <= 0 || hitWall) {
            // Peluru Grenade Launcher MELEDAK saat menghantam dinding/Monas (impact);
            // habis-umur di ruang kosong hanya lenyap (bukan impact). Antre boom
            // (diproses processPendingBooms setelah loop robot) — friendly.
            if (b.explosive && hitWall) queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false, 0, b.damage, b.boomSfx);
            scene.remove(b.mesh); bullets.splice(i, 1);
        }
    }
}
