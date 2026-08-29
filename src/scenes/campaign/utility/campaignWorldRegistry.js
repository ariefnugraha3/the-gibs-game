// Registry root dunia Campaign 9–13. Seluruh dunia tetap dibangun di muka,
// tetapi hanya root stage/chapter aktif yang terlihat dan di-update. Prewarm
// memindahkan kamera sementara ke tiap dunia karena renderer.compile melewati
// root tersembunyi atau objek di luar frustum.

import { scene, viewCam, renderer } from '../../../core/renderer.js';
import { setActiveStageLights, stageLightsDebug } from '../../../world/lighting.js';

const records = new Map();
let activeKeys = new Set();

// ROOT TIDAK AKTIF TIDAK BOLEH DITELUSURI TIAP FRAME (2026-08-29, laporan user
// "stage lain frameratenya turun sejak kita membuat stage 10"). `visible=false`
// hanya menghentikan `projectObject` (frustum culling & draw call). Sebelum itu,
// `WebGLRenderer.render()` memanggil `scene.updateMatrixWorld()`, dan
// `Object3D.updateMatrixWorld` di three.js r128 MENELUSURI SELURUH ANAK TANPA
// memeriksa `visible` — jadi setiap dunia stage yang tersembunyi tetap membayar
// satu penelusuran matriks penuh setiap frame, di stage mana pun kita bermain.
// Diukur: 117.050 objek di scene, 20.554 di antaranya milik root Stage 10 saja.
//
// Root yang tidak aktif karena itu diberi `updateMatrixWorld` KOSONG. Aman sebab
// (1) tidak ada yang dirender darinya, dan (2) `getWorldPosition`/
// `updateWorldMatrix` memanjat ke ATAS lewat parent, bukan lewat metode ini.
// Saat diaktifkan lagi, override dilepas dan matriksnya disegarkan sekali penuh
// supaya tidak ada transform basi yang terbawa.
function skipMatrixWalk() { }

function setRootActive(root, on) {
    root.visible = on;
    if (!on) {
        if (typeof root.updateMatrixWorld === 'function') root.updateMatrixWorld = skipMatrixWalk;
        return;
    }
    if (root.updateMatrixWorld === skipMatrixWalk) delete root.updateMatrixWorld;
    if (typeof root.updateMatrixWorld === 'function') root.updateMatrixWorld(true);
}

function rootsOf(record) {
    if (!record) return [];
    return Array.isArray(record.root) ? record.root.filter(Boolean) : [record.root].filter(Boolean);
}

export function registerCampaignWorldRoot({ key, root, bounds = null,
    lightsKey = key, warmupViews = [] } = {}) {
    if (!key || !root) throw new Error('campaign world root requires key and root');
    records.set(key, { key, root, bounds, lightsKey, warmupViews });
    for (const item of rootsOf(records.get(key))) setRootActive(item, activeKeys.has(key));
    return root;
}

export const activeCampaignWorldRoots = () => [...activeKeys];

export function setActiveCampaignWorldRoots(keys) {
    const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
    activeKeys = new Set(list);
    for (const [key, record] of records)
        for (const root of rootsOf(record)) setRootActive(root, activeKeys.has(key));
    return [...activeKeys];
}

function centerFor(record) {
    const b = record.bounds;
    if (b) return {
        x: Number.isFinite(b.x) ? b.x : ((b.x0 || 0) + (b.x1 || 0)) * 0.5,
        y: Number.isFinite(b.y) ? b.y : 0,
        z: Number.isFinite(b.z) ? b.z : ((b.z0 || 0) + (b.z1 || 0)) * 0.5,
    };
    const root = rootsOf(record)[0];
    return { x: root?.position?.x || 0, y: root?.position?.y || 0, z: root?.position?.z || 0 };
}

export function prewarmCampaignWorldRoots() {
    if (!renderer || !viewCam || !scene || !records.size) return 0;
    const restoreLights = stageLightsDebug().active;
    const restorePos = viewCam.position.clone();
    const restoreQuat = new THREE.Quaternion().copy(viewCam.quaternion);
    const restoreVisible = new Map();
    for (const record of records.values())
        for (const root of rootsOf(record)) restoreVisible.set(root, root.visible);

    let compiled = 0;
    for (const record of records.values()) {
        for (const other of records.values())
            for (const root of rootsOf(other)) setRootActive(root, other === record);
        // Pool hazard/boss phase lazimnya dibangun visible=false. Paksa semua
        // descendant root aktif terlihat selama warmup, lalu pulihkan persis.
        const childVisible = new Map();
        for (const root of rootsOf(record)) root.traverse(obj => {
            childVisible.set(obj, obj.visible); obj.visible = true;
        });
        if (record.lightsKey) setActiveStageLights(record.lightsKey);
        const fallback = centerFor(record);
        const views = record.warmupViews?.length ? record.warmupViews : [fallback];
        for (const view of views) {
            const x = Number.isFinite(view.x) ? view.x : fallback.x;
            const y = Number.isFinite(view.y) ? view.y : fallback.y;
            const z = Number.isFinite(view.z) ? view.z : fallback.z;
            const offset = view.offset || { x: -145, y: 165, z: 185 };
            viewCam.position.set(x + offset.x, y + offset.y, z + offset.z);
            viewCam.lookAt(x, y, z);
            viewCam.updateMatrixWorld(true);
            renderer.compile(scene, viewCam);
            renderer.render(scene, viewCam);
            compiled++;
        }
        for (const [obj, visible] of childVisible) obj.visible = visible;
    }

    // Pulihkan lewat jalur yang sama supaya root yang kembali tersembunyi juga
    // kembali memasang penghenti penelusuran matriksnya.
    for (const [root, visible] of restoreVisible) setRootActive(root, visible);
    viewCam.position.copy(restorePos); viewCam.quaternion.copy(restoreQuat);
    viewCam.updateMatrixWorld(true);
    if (restoreLights) setActiveStageLights(restoreLights);
    return compiled;
}

export function campaignWorldRegistryDebug() {
    return {
        active: [...activeKeys],
        worlds: [...records.values()].map(record => ({
            key: record.key, lightsKey: record.lightsKey,
            roots: rootsOf(record).length,
            visible: rootsOf(record).filter(root => root.visible).length,
            // Berapa root yang penelusuran matriks per-framenya dihentikan —
            // inilah yang membuat dunia stage lain tidak membebani stage aktif.
            matrixWalkSkipped: rootsOf(record)
                .filter(root => root.updateMatrixWorld === skipMatrixWalk).length,
            warmupViews: record.warmupViews?.length || 1,
            bounds: record.bounds,
        })),
    };
}
