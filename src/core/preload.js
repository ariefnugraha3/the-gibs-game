// Layar loading pra-game + pemanasan renderer. Three.js baru mengompilasi
// program shader sebuah material saat objeknya PERTAMA KALI dirender (objek
// visible=false tidak pernah dikompilasi) dan baru mengunggah tekstur saat
// draw pertama — itulah sumber "jeda" saat equip granat/medkit pertama atau
// spawn entitas pertama di tengah permainan. Solusi: di balik overlay loading
// yang OPAK, tampilkan semua rig kamera + satu contoh tiap visual spawn-nanti,
// panggil renderer.compile(), lalu render beberapa frame nyata; setelah hangat,
// semuanya dikembalikan persis seperti semula. Teks UI English (aturan permanen).

import { GEO, MAT } from './state.js';
import { scene, viewCam, renderer, composer, postFxOn } from './renderer.js';
import { buildGrenadeMesh } from '../entities/grenades.js';
import { buildMagMesh, buildMedkitMesh } from '../entities/drops.js';
import { buildHumanZombie, disposeZombie } from '../entities/zombies.js';
import { borrowBloodSprite } from '../entities/effects.js';

let loadEl = null, barEl = null, textEl = null;

// Tunggu 1 frame + 1 paint: callback rAF berjalan SEBELUM browser melukis,
// jadi resolve lewat setTimeout(0) SETELAHNYA — menjamin overlay/bar benar-benar
// tergambar sebelum kerja sinkron berat berikutnya memblokir main thread.
function nextPaint() {
    return new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
}

export function showLoading() {
    loadEl = document.getElementById('loadingScreen');
    barEl = document.getElementById('loadingBarFill');
    textEl = document.getElementById('loadingText');
    if (loadEl) loadEl.style.display = 'flex';
}

// Perbarui bar (0..100) + label langkah BERIKUTNYA, lalu beri browser satu
// kesempatan melukis sebelum pemanggil lanjut ke kerja beratnya.
export async function loadingStep(pct, label) {
    if (barEl) barEl.style.width = pct + '%';
    if (textEl) textEl.textContent = label;
    await nextPaint();
}

export function hideLoading() {
    if (loadEl) loadEl.style.display = 'none';
}

// Pemanasan inti — dipanggil startGame setelah SELURUH init selesai (viewCam
// di scene, avatar terpasang, pool efek terisi, dunia terbangun):
// 1) grup warmup anak VIEWCAM berisi satu contoh tiap visual spawn-nanti
//    (tracer peluru, granat dunia, magazen, medkit, trio ledakan + cincin debu,
//    satu zombie, sprite darah pinjaman) — pasti masuk frustum;
// 2) renderer.compile() = jaring pengaman: menyusuri SELURUH scene (termasuk
//    objek tersembunyi) dan menginisialisasi program tiap material;
// 3) beberapa frame render NYATA (jalur sama dgn animate) — unggah tekstur,
//    link program di draw pertama, panaskan render target bloom/FXAA composer.
//    (Avatar player + dunia ikut hangat; rig FPS tersembunyi permanen dan tak
//    pernah dirender, jadi tak perlu dipanaskan.)
export async function warmupAll() {
    // Grup warmup jadi ANAK viewCam (kamera render top-down) di z -60 —
    // pasti masuk frustum apa pun posisi/sudut dunianya. Avatar player &
    // dunia ikut hangat karena frame render nyata di bawah.
    const warm = new THREE.Group();
    const put = (obj, x) => { obj.position.set(x, 0, -60); warm.add(obj); return obj; };

    put(new THREE.Mesh(GEO.bullet, MAT.bullet), -12).scale.set(1, 1, 8.5);   // tracer
    put(buildGrenadeMesh(0.7), -8);    // peluru Grenade Launcher (mesh Mk2 bersama — hangatkan agar tembakan pertama tak nge-hitch)
    put(buildMagMesh(), -4);           // drop magazen (geo/mat bersama)
    put(buildMedkitMesh(), 0);         // drop medkit (mat bersama)
    // Trio visual ledakan + cincin debu: material per-instance PERSIS seperti
    // explodeAt/spawnGroundPuff (toneMapped true & false = dua program berbeda).
    const boomMats = [
        new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.85 }),
        new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.95, toneMapped: false }),
        new THREE.MeshBasicMaterial({
            color: 0xffa040, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        }),
        new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    ];
    put(new THREE.Mesh(GEO.explosion, boomMats[0]), 4);
    put(new THREE.Mesh(GEO.explosion, boomMats[1]), 7);
    put(new THREE.Mesh(GEO.ring, boomMats[2]), 10);
    put(new THREE.Mesh(GEO.ring, boomMats[3]), 13);
    // Satu zombie: program Lambert badan + array material kepala + tekstur wajah.
    // Varian kulit/aksesori lain hanya beda warna (program GPU sama).
    const zw = buildHumanZombie();
    zw.group.position.set(16, -10, -60);
    warm.add(zw.group);

    // Sprite darah pinjaman dari pool efek (program sprite + unggah teksturnya).
    const bspr = borrowBloodSprite();
    let bsprState = null;
    if (bspr) {
        bsprState = { visible: bspr.visible, opacity: bspr.material.opacity };
        warm.add(bspr);                    // reparent otomatis melepasnya dari scene
        bspr.position.set(-16, 4, -60);
        bspr.material.opacity = 0.5;
        bspr.visible = true;
    }

    viewCam.add(warm);

    renderer.compile(scene, viewCam);
    await loadingStep(88, 'Warming up the renderer…');

    // Jalur render sama persis dgn animate() (RenderPass composer = viewCam).
    for (let i = 0; i < 3; i++) {
        if (composer && postFxOn) composer.render();
        else renderer.render(scene, viewCam);
        await loadingStep(90 + i * 3, 'Warming up the renderer…');
    }

    // ----- Bereskan: kembalikan semuanya persis seperti semula -----
    if (bspr) {
        bspr.visible = bsprState.visible;
        bspr.material.opacity = bsprState.opacity;
        scene.add(bspr);                   // kembali ke induk semula (scene root)
    }
    viewCam.remove(warm);
    disposeZombie({ mesh: zw.group });     // material zombie per-instance
    boomMats.forEach(m => m.dispose());    // hanya material buatan warmup —
    // GEO/MAT bersama + resource granat/magazen/medkit JANGAN di-dispose.
    await loadingStep(100, 'Ready!');
}
