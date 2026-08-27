// TURBOFAN BERCOWL — satu implementasi untuk SEMUA pesawat campaign.
//
// Permintaan user 2026-08-27: "ini kan di masa depan, mana ada pesawat pakai
// baling-baling. buat agar semua pesawat pakai mesin jet." Nusantara 2045 tak
// memarkir turboprop, jadi ketiga pesawat yang ada di game (lima airliner
// Stage 9, transport hero Stage 9, dan pesawat kargo Stage 10) memakai modul
// ini alih-alih masing-masing menggambar bilahnya sendiri.
//
// Bedanya jet dan baling-baling bisa dituliskan dalam satu kalimat: KIPASNYA
// TERKURUNG DI DALAM COWL. Karena itu `fanRadius` di sini DITURUNKAN dari
// `cowlRadius` (`FAN_DUCT_RATIO`) dan tidak bisa dioper dari luar — tak ada
// stage yang bisa diam-diam menumbuhkan bilahnya keluar dan kembali menjadi
// baling-baling tanpa mengubah modul ini.
//
// Nacelle menghadap +z LOKAL (arah terbang). Pesawat yang badannya membujur di
// sumbu x cukup membungkusnya dengan grup ber-`rotation.y = PI/2`.

export const FAN_DUCT_RATIO = 0.8;

export const turbofanFanRadius = (cowlRadius) => cowlRadius * FAN_DUCT_RATIO;

function tube(parent, mat, radius, height, dz, radial = 14) {
    const m = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, radial), mat);
    m.position.z = dz;
    m.rotation.x = Math.PI * 0.5;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function cone(parent, mat, radius, height, dz, dir = 1, radial = 10) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(radius, height, radial), mat);
    m.position.z = dz;
    m.rotation.x = dir * Math.PI * 0.5;
    m.castShadow = true;
    parent.add(m);
    return m;
}

/**
 * Membangun satu nacelle turbofan pada (x, y, z) lokal `parent`, menghadap +z.
 * `mats` memakai peran, bukan nama material stage: cowl / lip / duct / hub /
 * fan / nozzle (semua opsional kecuali cowl, hub dan fan).
 * Mengembalikan `fan` — grup yang boleh diputar pada `rotation.z` untuk
 * menganimasikan kipasnya — beserta ukuran yang benar-benar terbangun.
 */
export function buildTurbofan(parent, mats, opts = {}) {
    const cowlR = Math.max(0.05, opts.cowlRadius || 1);
    const len = Math.max(cowlR * 2.2, opts.length || cowlR * 3.4);
    const fanR = turbofanFanRadius(cowlR);
    const blades = Math.max(6, opts.blades | 0 || 12);
    const lip = mats.lip || mats.cowl;
    const duct = mats.duct || mats.hub;
    const nozzle = mats.nozzle || mats.cowl;

    const g = new THREE.Group();
    g.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
    parent.add(g);

    tube(g, mats.cowl, cowlR, len, 0, opts.radial || 14);
    tube(g, lip, cowlR * 1.08, len * 0.1, len * 0.5);          // bibir intake
    tube(g, lip, cowlR * 1.04, len * 0.08, -len * 0.16);       // pita thrust reverser
    tube(g, duct, cowlR * 0.93, len * 0.06, len * 0.4);        // latar gelap duct
    tube(g, nozzle, cowlR * 0.78, len * 0.16, -len * 0.52);    // nozzle
    cone(g, mats.hub, cowlR * 0.4, len * 0.3, -len * 0.74, -1); // plug ekor

    // Muka kipas: TERKURUNG di dalam cowl. Bilahnya berpusat di hub sehingga
    // satu lengan menghasilkan dua bilah — `blades` lengan = 2x bilah terlihat.
    const fan = new THREE.Group();
    fan.position.z = len * 0.42;
    g.add(fan);
    cone(fan, mats.hub, fanR * 0.22, fanR * 0.6, fanR * 0.32);
    for (let i = 0; i < blades; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = i * Math.PI / blades;
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(fanR * 0.2, fanR * 2, fanR * 0.08), mats.fan);
        arm.add(blade);
        fan.add(arm);
    }

    return { group: g, fan, cowlRadius: cowlR, fanRadius: fanR, length: len, blades };
}
