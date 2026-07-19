// Resep gedung bersama: tekstur fasad (jendela gelap/menyala/hancur), material,
// pengisi InstancedMesh, dan sprite api gedung terbakar. Dipakai kota latar
// survival (createCity) DAN deret gedung campaign stage 2 — resepnya identik.

import { makeTexture } from '../utils/textures.js';
import { fireSprites, setBurningMat } from './decor.js';

export const CITY_PALETTE = [0x26262b, 0x2e2a26, 0x202428, 0x35302a, 0x1c1d22];

// Fasad: grid jendela gelap (map, di-tint warna instance) + sebagian menyala
// (emissiveMap). Beberapa "lantai hancur" digelapkan total — kesan rusak perang.
// `scale` (2026-07-19, permintaan user "jendela lebih besar"): pengali ukuran
// grid jendela — 1 = grid lama (kota latar), ~2 = jendela besar proporsional
// utk gedung dekat kamera (roadside stage 4). Grid makeLitTex HARUS memakai
// scale yang sama supaya jendela menyala sejajar dgn jendela gelapnya.
export function makeFacadeTex(scale = 1) {
    const sy = 16 * scale, sx = 13 * scale, ww = 9 * scale, wh = 10 * scale;
    return makeTexture(256, 512, (g, w, h) => {
        g.fillStyle = '#c9ccd4'; g.fillRect(0, 0, w, h);   // terang: dikalikan warna gelap instance
        for (let y = 8; y < h - 8; y += sy) {
            const destroyed = Math.random() < 0.08;
            if (destroyed) { g.fillStyle = 'rgba(10,10,12,0.55)'; g.fillRect(0, y - 3, w, sy); }
            for (let x = 6; x < w - 6; x += sx) {
                g.fillStyle = destroyed ? '#0e0e12' : (Math.random() < 0.12 ? '#1a1a20' : '#3c3c46');
                g.fillRect(x, y, ww, wh);
            }
        }
    });
}

export function makeLitTex(scale = 1) {
    const sy = 16 * scale, sx = 13 * scale, ww = 9 * scale, wh = 10 * scale;
    return makeTexture(256, 512, (g, w, h) => {
        g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
        for (let y = 8; y < h - 8; y += sy) {
            for (let x = 6; x < w - 6; x += sx) {
                if (Math.random() < 0.07) {
                    g.fillStyle = Math.random() < 0.5 ? '#ffb45e' : '#ff7b30';
                    g.fillRect(x, y, ww, wh);
                }
            }
        }
    });
}

// Material gedung normal: jendela gelap + sebagian menyala oranye
export function makeCityMat(facadeTex, litTex) {
    return new THREE.MeshLambertMaterial({
        color: 0xffffff, map: facadeTex,
        emissive: 0xff9a4a, emissiveMap: litTex, emissiveIntensity: 0.55
    });
}

// Material gedung TERBAKAR: seluruh fasad memijar (berkedip di decor.js).
// Referensinya didaftarkan ke decor agar emissiveIntensity dianimasikan.
export function makeBurningCityMat(facadeTex) {
    const m = new THREE.MeshLambertMaterial({
        color: 0xffffff, map: facadeTex,
        emissive: 0xff5a14, emissiveMap: facadeTex, emissiveIntensity: 1.1
    });
    setBurningMat(m);
    return m;
}

// Isi satu InstancedMesh box unit dari daftar {x,z,w,d,h,ry,rz,color}
export function fillBuildingInstances(scene, list, mat) {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
        _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
    const mesh = new THREE.InstancedMesh(unit, mat, list.length);
    list.forEach((b, i) => {
        _e.set(0, b.ry, b.rz);
        _m.compose(_p.set(b.x, b.h / 2, b.z), _q.setFromEuler(_e), _s.set(b.w, b.h, b.d));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.setHex(b.color));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;   // bounds gabungan instance tak dihitung r128
    scene.add(mesh);
    return mesh;
}

// Pijar api billboard di tiap gedung terbakar (berkedip di decor.js).
// fog:false agar nyala menembus kabut — sumber cahaya dramatis di skyline.
export function addFireSprites(scene, burnList) {
    const fireTex = makeTexture(64, 64, (g) => {
        const rg = g.createRadialGradient(32, 40, 2, 32, 36, 30);
        rg.addColorStop(0, 'rgba(255,200,90,0.95)');
        rg.addColorStop(0.45, 'rgba(255,110,30,0.5)');
        rg.addColorStop(1, 'rgba(255,80,20,0)');
        g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    });
    for (const b of burnList) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: fireTex, transparent: true, opacity: 0.6, fog: false,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        }));
        sp.position.set(b.x, b.h * 0.6, b.z);
        sp.scale.set(b.w * 2.4, b.h * 0.9, 1);
        scene.add(sp);
        fireSprites.push({ sprite: sp, phase: Math.random() * 6.28 });
    }
}
