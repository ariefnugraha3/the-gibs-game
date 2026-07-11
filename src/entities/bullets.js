// Gerak & umur peluru. Peluru lahir di weapons.js (blok menembak); hit test
// vs zombie di zombies.js (sweep segmen). Di sini: maju, catat titik awal
// segmen sweep, dan mati oleh umur / dinding dunia milik scene aktif.

import { bullets } from '../core/state.js';
import { scene } from '../core/renderer.js';
import { activeScene } from '../core/sceneManager.js';
import { queueBoom } from './zombies.js';

export function updateBullets(step) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        // Titik awal segmen sweep frame ini (frame pertama tetap di mata player —
        // bug fix point-blank: muzzle ~13 unit di depan mata)
        if (b.first) b.first = false;
        else { b.px = b.mesh.position.x; b.py = b.mesh.position.y; b.pz = b.mesh.position.z; }
        b.mesh.position.addScaledVector(b.dir, b.speed * step);
        b.life -= step;
        // Dinding dunia per scene: survival = badan Monas; campaign stage 1 =
        // dinding grid gedung (mencegah membunuh zombie diam menembus tembok);
        // stage 2 = tidak ada (gedung dekoratif, peluru habis oleh umur).
        const hitWall = activeScene.bulletBlocked(b);
        if (b.life <= 0 || hitWall) {
            // Peluru Grenade Launcher MELEDAK saat menghantam dinding/Monas (impact);
            // habis-umur di ruang kosong hanya lenyap (bukan impact). Antre boom
            // (diproses processPendingBooms setelah loop zombie) — friendly.
            if (b.explosive && hitWall) queueBoom(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.explodeR, false);
            scene.remove(b.mesh); bullets.splice(i, 1);
        }
    }
}
