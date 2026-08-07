// Kereta militer otonom Campaign Stage 5 + ilusi perjalanan Jakarta -> Bandung.
// Arena/player/robot TETAP di koordinat dunia; rel dan lanskap dari pool tetap
// bergerak ke belakang. Dengan begitu peluru, loot, nav, dan collision bersama
// tidak perlu mengenal platform bergerak. Seluruh visual procedural, PAL-only.

import { PAL, EMISSIVE_MAX } from '../world/palette.js';

// ROMBAK SKALA 2026-08-07 (permintaan user): LEBAR badan kereta = 4 METER
// tepat — dinaikkan dari 3 m karena lorongnya terasa terlalu sempit untuk
// bertempur. Panjang dan tinggi tetap diturunkan dengan proporsi rolling stock
// nyata (16.5 m panjang, 3.9 m tinggi). 16.5 m kebetulan = 7 sel CSV
// (7 x 16.5 unit), jadi gerbong + lokomotif jatuh PERSIS pada sel TC/TL denah
// stasiun user. Semua geometri di bawah diturunkan dari W/HW — jangan menulis
// ulang angka lebar sebagai literal.
const M_UNIT = 7;                                        // 1 m = 7 unit (CAMP_M)
export const TRAIN_CAR_WIDTH = 4 * M_UNIT;               // 28
export const TRAIN_HALF_WIDTH = TRAIN_CAR_WIDTH / 2;     // 14
export const TRAIN_CAR_LENGTH = 16.5 * M_UNIT;           // 115.5
export const TRAIN_CAR_HEIGHT = 3.9 * M_UNIT;            // 27.3
export const TRAIN_CAR_GAP = 0;                          // TC dan TL bersebelahan di CSV
export const TRAIN_CAR_STEP = TRAIN_CAR_LENGTH + TRAIN_CAR_GAP;
// Konsist player = SATU gerbong + SATU lokomotif (permintaan user 2026-08-07).
export const TRAIN_CAR_COUNT = 2;
export const TRAIN_PLAYER_CAR = 0;
export const TRAIN_LOCO_CAR = TRAIN_CAR_COUNT - 1;
// Kotak arena player: bagian DALAM gerbong 0 saja. Player tidak pernah boleh
// keluar dari gerbong maupun masuk ke lokomotif.
export const TRAIN_WALL_T = 0.9;
export const TRAIN_END_T = 2.4;
export const TRAIN_INNER_HALF = TRAIN_HALF_WIDTH - TRAIN_WALL_T;          // 13.1
export const TRAIN_INNER_HALF_LEN = TRAIN_CAR_LENGTH / 2 - TRAIN_END_T;   // 55.35
export const TRAIN_SIDE_WALL_H = 9;                      // dinding samping setinggi dada
export const TRAIN_GAUGE_HALF = 4.2;                     // rel 1067 mm (+ margin visual)
// Jarak antar-sumbu KEDUA jalur selama perjalanan (double track mainline).
// Jauh lebih rapat daripada dua jalur stasiun agar baku tembak lintas-rel
// benar-benar berada dalam jangkauan peluru robot kelas A/B.
export const JOURNEY_TRACK_DZ = -42;

const mats = () => ({
    body: new THREE.MeshLambertMaterial({ color: PAL.gunmetal }),
    panel: new THREE.MeshLambertMaterial({ color: PAL.panel }),
    steel: new THREE.MeshLambertMaterial({ color: PAL.steel }),
    ink: new THREE.MeshLambertMaterial({ color: PAL.ink }),
    rubber: new THREE.MeshLambertMaterial({ color: PAL.rubber }),
    hazard: new THREE.MeshLambertMaterial({ color: PAL.hazard }),
    white: new THREE.MeshLambertMaterial({ color: PAL.white }),
    tech: new THREE.MeshLambertMaterial({
        color: PAL.techDim, emissive: PAL.tech, emissiveIntensity: EMISSIVE_MAX * 0.72,
    }),
    amber: new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }),
    glass: new THREE.MeshLambertMaterial({
        color: PAL.screenBg, transparent: true, opacity: 0.72,
    }),
    ballast: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
    concrete: new THREE.MeshLambertMaterial({ color: PAL.concrete }),
    leaf: new THREE.MeshLambertMaterial({ color: PAL.leaf }),
    earth: new THREE.MeshLambertMaterial({ color: PAL.wood }),
});

function mesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m);
    return m;
}

// Bogie bergaya narrow-gauge: rangka + dua gandar, roda tepat di atas rel.
function bogie(g, M, bx, wheels) {
    mesh(g, new THREE.BoxGeometry(24, 4.4, TRAIN_GAUGE_HALF * 2 + 3), M.ink, bx, -3.6, 0);
    for (const ax of [-7, 7]) for (const wz of [-TRAIN_GAUGE_HALF, TRAIN_GAUGE_HALF]) {
        const w = mesh(g, new THREE.CylinderGeometry(3.6, 3.6, 1.6, 12), M.rubber,
            bx + ax, -3.4, wz, Math.PI / 2, 0, 0);
        wheels.push(w);
    }
}

function buildCar(M, i, cx, cz, wheels) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const loco = i === TRAIN_LOCO_CAR;
    const L = TRAIN_CAR_LENGTH, HW = TRAIN_HALF_WIDTH, W = TRAIN_CAR_WIDTH;
    const endX = L / 2 - TRAIN_END_T / 2;

    // Deck sengaja y=0: seluruh gameplay tetap pada ground plane standar.
    mesh(g, new THREE.BoxGeometry(L, 3.2, W), M.body, 0, -2.0, 0);
    mesh(g, new THREE.BoxGeometry(L - 5, 0.7, W - 2.6), M.panel, 0, 0.35, 0);
    for (const z of [-HW + 0.6, HW - 0.6])
        mesh(g, new THREE.BoxGeometry(L - 3, 1.5, 1.0), M.hazard, 0, 0.4, z, 0, 0, 0, false);

    if (!loco) {
        // GERBONG PLAYER. Badan cuma 4 m: dindingnya sengaja SETINGGI DADA agar
        // avatar dan penembak di track sebelah tetap terbaca dari kamera oblique;
        // siluet "beratap" datang dari rusuk terbuka, bukan dinding penuh.
        for (const z of [-HW + TRAIN_WALL_T / 2, HW - TRAIN_WALL_T / 2]) {
            mesh(g, new THREE.BoxGeometry(L - TRAIN_END_T * 2, TRAIN_SIDE_WALL_H, TRAIN_WALL_T),
                M.body, 0, TRAIN_SIDE_WALL_H / 2, z);
            mesh(g, new THREE.BoxGeometry(L - TRAIN_END_T * 2, 1.0, TRAIN_WALL_T + 0.6),
                M.steel, 0, TRAIN_SIDE_WALL_H, z, 0, 0, 0, false);
        }
        // Dua sekat ujung setinggi penuh: sisi timur = sekat kabin (player tidak
        // pernah bisa masuk lokomotif), sisi barat = dinding belakang gerbong.
        for (const s of [-1, 1]) {
            mesh(g, new THREE.BoxGeometry(TRAIN_END_T, TRAIN_CAR_HEIGHT - 7, W - 0.8),
                M.body, s * endX, (TRAIN_CAR_HEIGHT - 7) / 2, 0);
            mesh(g, new THREE.BoxGeometry(TRAIN_END_T + 0.5, 1.3, W - 2.4),
                M.hazard, s * endX, 9.4, 0, 0, 0, 0, false);
        }
        // Pintu sekat kabin — TERKUNCI, murni detail; tidak ada collider pintu.
        mesh(g, new THREE.BoxGeometry(0.8, 13, 8.4), M.panel, endX - TRAIN_END_T, 6.5, 0);
        mesh(g, new THREE.BoxGeometry(0.9, 0.9, 5.2), M.hazard, endX - TRAIN_END_T - 0.45, 12.4, 0, 0, 0, 0, false);
        // Pintu naik sisi peron (sel TCI denah): kusen + dua daun tergeser terbuka.
        for (const dx of [-38, -18]) mesh(g, new THREE.BoxGeometry(2.0, TRAIN_SIDE_WALL_H + 3, 1.6),
            M.steel, dx, (TRAIN_SIDE_WALL_H + 3) / 2, HW - 0.4);
        mesh(g, new THREE.BoxGeometry(20, 1.2, 1.6), M.steel, -28, TRAIN_SIDE_WALL_H + 3, HW - 0.4);
        mesh(g, new THREE.BoxGeometry(18, 0.5, 1.0), M.amber, -28, 0.9, HW - 1.6, 0, 0, 0, false);
        // Rusuk atap terbuka + lampu langit-langit: siluet gerbong tanpa menutup
        // avatar. Rusuk atap + detail dinding SELALU dipatok ke bidang dinding
        // (`TRAIN_WALL_T / 2` dari HW), bukan offset literal: lorong gerbong
        // harus tetap bebas hambatan berapa pun lebar badan di-retune.
        const wallZ = HW - TRAIN_WALL_T / 2;
        for (const x of [-44, -22, 0, 22, 44]) {
            for (const z of [-wallZ, wallZ])
                mesh(g, new THREE.BoxGeometry(1.1, TRAIN_CAR_HEIGHT - 11, 1.1), M.steel,
                    x, TRAIN_SIDE_WALL_H + (TRAIN_CAR_HEIGHT - 11) / 2, z);
            mesh(g, new THREE.BoxGeometry(1.0, 1.0, W - 1.6), M.steel, x, TRAIN_CAR_HEIGHT - 2, 0);
        }
        for (const x of [-33, 0, 33])
            mesh(g, new THREE.BoxGeometry(14, 0.6, 1.5), M.amber, x, TRAIN_CAR_HEIGHT - 3, 0, 0, 0, 0, false);
        for (const x of [-46, -25, 25, 46]) {
            mesh(g, new THREE.BoxGeometry(13, 4.6, 0.7), M.panel, x, 5.4, -wallZ + 0.1, 0, 0, 0, false);
            mesh(g, new THREE.BoxGeometry(9, 0.5, 0.4), M.tech, x, 7.4, -wallZ + 0.5, 0, 0, 0, false);
        }
    } else {
        // LOKOMOTIF: badan tertutup penuh, kabin di ujung timur, hidung bertingkat.
        mesh(g, new THREE.BoxGeometry(L - TRAIN_END_T, TRAIN_CAR_HEIGHT - 9, W - 0.6),
            M.body, -6, (TRAIN_CAR_HEIGHT - 9) / 2 + 1, 0);
        mesh(g, new THREE.BoxGeometry(L - 16, 1.6, W - 3.4), M.steel, -6, TRAIN_CAR_HEIGHT - 7.4, 0);
        for (const x of [-42, -20, 2])
            mesh(g, new THREE.BoxGeometry(1.6, TRAIN_CAR_HEIGHT - 12, W + 0.4), M.steel, x, 10.5, 0, 0, 0, 0, false);
        mesh(g, new THREE.BoxGeometry(28, 12, W - 0.4), M.panel, 26, 15.5, 0);
        mesh(g, new THREE.BoxGeometry(1.2, 6.4, W - 4.2), M.glass, 40.6, 17.5, 0, 0, 0, 0.16, false);
        mesh(g, new THREE.BoxGeometry(22, 8.5, W - 1.2), M.body, 34, 5.5, 0);
        mesh(g, new THREE.BoxGeometry(9, 3.2, W - 3), M.hazard, 48, 3.4, 0);
        for (const z of [-5.4, 5.4]) mesh(g, new THREE.BoxGeometry(2.2, 2.6, 3.2), M.amber, 46.8, 8.4, z, 0, 0, 0, false);
        for (const x of [-34, -12]) mesh(g, new THREE.CylinderGeometry(2.4, 3.0, 6.5, 10), M.ink, x, TRAIN_CAR_HEIGHT - 4, 0);
        for (const z of [-HW + 1.1, HW - 1.1])
            mesh(g, new THREE.BoxGeometry(20, 0.9, 0.6), M.tech, -22, 15, z, 0, 0, 0, false);
    }

    for (const bx of [-L * 0.29, L * 0.29]) bogie(g, M, bx, wheels);
    return g;
}

export function buildMilitaryTrainMesh(baseX, baseZ = 0) {
    const M = mats();
    const group = new THREE.Group();
    // `doors` sengaja KOSONG sejak 2026-08-07: konsist player hanya gerbong +
    // lokomotif, dan sekat kabin tidak pernah boleh terbuka.
    const cars = [], wheels = [], doors = [];
    for (let i = 0; i < TRAIN_CAR_COUNT; i++) {
        const car = buildCar(M, i, baseX + i * TRAIN_CAR_STEP, baseZ, wheels);
        group.add(car); cars.push(car);
    }
    // Coupler/gangway antar gerbong.
    for (let i = 0; i < TRAIN_CAR_COUNT - 1; i++) {
        const x = baseX + i * TRAIN_CAR_STEP + TRAIN_CAR_LENGTH / 2;
        mesh(group, new THREE.BoxGeometry(5, 1.4, 6), M.steel, x, -0.6, baseZ);
        mesh(group, new THREE.BoxGeometry(3.5, 9, 9.5), M.rubber, x, 6, baseZ);
    }
    group.userData.train = { group, baseX, baseZ, cars, wheels, doors, wheelPhase: 0, M };
    return group.userData.train;
}

export function setTrainDoor(train, index, open) {
    if (!train || !train.doors[index]) return;
    train.doors[index].target = open ? 1 : 0;
}

export function resetTrainVisual(train) {
    if (!train) return;
    train.wheelPhase = 0;
    // Roda berporos Z (rotation.x = PI/2 saat dibangun); putarannya ada di
    // rotation.y — memakai rotation.z hanya menjungkirkan silinder, bukan memutar.
    for (const w of train.wheels) w.rotation.y = 0;
    for (const d of train.doors) {
        d.open = d.target = 0;
        d.mesh.position.y = d.closedY;
    }
}

export function updateTrainVisual(train, dt, speed) {
    if (!train) return;
    train.wheelPhase += dt * Math.max(0, speed) * 0.11;
    for (const w of train.wheels) w.rotation.y = train.wheelPhase;
    for (const d of train.doors) {
        const k = Math.min(1, dt * 4.2);
        d.open += (d.target - d.open) * k;
        d.mesh.position.y = d.closedY + d.open * 15;
    }
}

function signTexture() {
    const c = document.createElement('canvas'); c.width = 768; c.height = 128;
    const g = c.getContext('2d');
    const css = h => '#' + h.toString(16).padStart(6, '0');
    g.fillStyle = css(PAL.ink); g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = css(PAL.amber); g.lineWidth = 8; g.strokeRect(7, 7, c.width - 14, c.height - 14);
    g.fillStyle = css(PAL.white); g.font = 'bold 42px "Courier Prime", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('BANDUNG LOGISTICS TERMINAL', c.width / 2, c.height / 2);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}

// Denah resmi user `stages(Stage5-Finish).csv`, 30 kolom × 19 baris: stasiun
// tujuan Bandung. Token sama dengan S5_MAP ('#' dinding, '.' lantai, '=' rel,
// 'T' gerbong, 'L' lokomotif). Bangunan ini STATIS — tidak pernah masuk pool
// scenery yang bergeser saat kereta berjalan.
export const BANDUNG_MAP = Object.freeze([
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '==============TTTTTTTLLLLLLL==',
    '==============TTTTTTTLLLLLLL==',
    '==============TTTTTTTLLLLLLL==',
    '==============TTTTTTTLLLLLLL==',
]);

// Sel CSV finish disejajarkan ke arena journey: baris track (16-19) berpusat
// pada sumbu rel, dan kolom lokomotif (TL) jatuh tepat di gerbong terakhir.
// B_COL0 = 18 = pusat kolom TC denah finish, sehingga bx(18) jatuh tepat di
// titik pusat gerbong player dan bx(25) tepat di lokomotif (selisih 7 sel =
// TRAIN_CAR_STEP). Terminal dibangun relatif terhadap `journey.baseX`.
const B_CELL = 16.5, B_WALL_H = 25, B_TRACK_ROW = 17.5, B_COL0 = 18;
const bx = c => (c - B_COL0) * B_CELL;
const bz = r => (r - B_TRACK_ROW) * B_CELL;

function buildBandungTerminal(M) {
    const g = new THREE.Group();
    const cols = BANDUNG_MAP[0].length;
    // Peron kedatangan (baris 10-15) dan aula dalam (baris 2-8).
    mesh(g, new THREE.BoxGeometry(cols * B_CELL, 2, 6 * B_CELL), M.panel,
        bx(15.5), -0.4, bz(12.5));
    mesh(g, new THREE.BoxGeometry(cols * B_CELL, 2, 7 * B_CELL), M.concrete,
        bx(15.5), -0.6, bz(5));
    // Garis aman di tepi peron menghadap rel.
    mesh(g, new THREE.BoxGeometry(cols * B_CELL, 1, 4), M.hazard, bx(15.5), 0.8, bz(15) + 4);
    // Dinding dibangun sebagai RUN horizontal, bukan per sel: bentuknya identik
    // tetapi jumlah mesh tetap jauh di bawah cap prop pool scenery.
    for (let r = 0; r < BANDUNG_MAP.length; r++) {
        let c = 0;
        while (c < cols) {
            if (BANDUNG_MAP[r][c] !== '#') { c++; continue; }
            let end = c;
            while (end + 1 < cols && BANDUNG_MAP[r][end + 1] === '#') end++;
            const span = end - c + 1;
            mesh(g, new THREE.BoxGeometry(span * B_CELL, B_WALL_H, B_CELL), M.body,
                bx(c + 1 + (span - 1) / 2), B_WALL_H / 2, bz(r + 1));
            c = end + 1;
        }
    }
    // Kanopi peron: tiang di batas aula, balok melintang ke tepi rel.
    for (let c = 3; c <= 28; c += 5) {
        mesh(g, new THREE.BoxGeometry(3, 38, 3), M.steel, bx(c), 19, bz(10.5));
        mesh(g, new THREE.BoxGeometry(58, 3, 5 * B_CELL), M.body, bx(c), 38, bz(12.8));
        mesh(g, new THREE.BoxGeometry(1.4, 1, 4 * B_CELL), M.amber, bx(c), 36, bz(12.8), 0, 0, 0, false);
    }
    // Papan informasi + strip status sipil pada dinding pemisah aula.
    for (const c of [8, 16, 24])
        mesh(g, new THREE.BoxGeometry(3 * B_CELL, 5, 1), M.tech, bx(c), 15, bz(9) + B_CELL / 2 + 0.8, 0, 0, 0, false);
    const sign = mesh(g, new THREE.PlaneGeometry(118, 20),
        new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }),
        bx(15.5), 25, bz(10.5) + 2, 0, 0, 0, false);
    sign.rotation.y = Math.PI;
    return g;
}

// Pool perjalanan: seluruh child dibuat SEKALI. `updateJourneyScenery` hanya
// menggeser transform dan wrap; tidak ada scene.add / alokasi geometry per frame.
export function buildTrainJourneyScenery(baseX, baseZ = 0, enemyDz = JOURNEY_TRACK_DZ) {
    const M = mats();
    const group = new THREE.Group();
    const near = [], mid = [], far = [], tunnel = [], sparks = [];
    // 18 modul x 84 = 1512; jumlah MESH pool near tetap 90 seperti sebelum
    // jalur kedua ditambahkan (modul lebih panjang, bukan lebih banyak).
    const NEAR_N = 18, NEAR_STEP = 84, span = NEAR_N * NEAR_STEP;

    // DUA JALUR sepanjang perjalanan (permintaan user 2026-08-07): jalur player
    // di baseZ dan jalur musuh di baseZ+enemyDz, berbagi satu bed ballast.
    const bedZ0 = Math.min(0, enemyDz), bedZ1 = Math.max(0, enemyDz);
    for (let i = 0; i < NEAR_N; i++) {
        const g = new THREE.Group();
        mesh(g, new THREE.BoxGeometry(NEAR_STEP, 0.8, bedZ1 - bedZ0 + 34), M.earth,
            0, -5.6, (bedZ0 + bedZ1) / 2);
        for (const tz of [0, enemyDz]) for (const rz of [-TRAIN_GAUGE_HALF, TRAIN_GAUGE_HALF])
            mesh(g, new THREE.BoxGeometry(NEAR_STEP + 2, 1.1, 1.8), M.steel, 0, -4.7, tz + rz);
        g.position.set(baseX - span * 0.55 + i * NEAR_STEP, 0, baseZ); group.add(g); near.push(g);
    }
    for (let i = 0; i < 18; i++) {
        const g = new THREE.Group();
        const side = i % 2 ? 1 : -1;
        if (i % 3 === 0) {
            mesh(g, new THREE.BoxGeometry(44, 22 + (i % 5) * 5, 38), M.concrete,
                0, 10 + (i % 5) * 2.5, 0);
            mesh(g, new THREE.BoxGeometry(28, 1, 2), M.amber, 0, 15, side * -20, 0, 0, 0, false);
            g.userData.sceneryKind = 'industrial';
        } else {
            mesh(g, new THREE.CylinderGeometry(2.6, 3.4, 18, 7), M.earth, 0, 9, 0);
            mesh(g, new THREE.ConeGeometry(14, 30, 8), M.leaf, 0, 30, 0);
            g.userData.sceneryKind = 'rural';
        }
        g.position.set(baseX - 600 + i * 84, 0, baseZ + side * (95 + (i % 4) * 34));
        group.add(g); mid.push(g);
    }
    for (let i = 0; i < 10; i++) {
        const g = new THREE.Group();
        const side = i % 2 ? 1 : -1;
        mesh(g, new THREE.ConeGeometry(115 + (i % 3) * 24, 155 + (i % 4) * 35, 7),
            M.concrete, 0, 55, 0);
        g.position.set(baseX - 700 + i * 165, -22, baseZ + side * 360);
        group.add(g); far.push(g);
    }
    for (let i = 0; i < 12; i++) {
        const g = new THREE.Group();
        // Terowongan harus melintasi KEDUA jalur, bukan hanya jalur player.
        const tz = (bedZ0 + bedZ1) / 2, thw = (bedZ1 - bedZ0) / 2 + 24;
        mesh(g, new THREE.BoxGeometry(3, 34, 4), M.ink, 0, 12, tz - thw);
        mesh(g, new THREE.BoxGeometry(3, 34, 4), M.ink, 0, 12, tz + thw);
        mesh(g, new THREE.BoxGeometry(3, 4, thw * 2 + 4), M.ink, 0, 29, tz);
        mesh(g, new THREE.BoxGeometry(1, 1, 22), M.amber, 0, 22, tz, 0, 0, 0, false);
        g.position.set(baseX - 450 + i * 92, 0, baseZ); group.add(g); tunnel.push(g);
    }

    // Fixed brake-spark pool. Stage 5 only toggles/transforms these meshes;
    // no particles or materials are allocated during arrival.
    for (let i = 0; i < 12; i++) {
        const s = mesh(group, new THREE.BoxGeometry(0.45, 0.45, 4 + (i % 3)), M.amber,
            baseX - 150 + i * 29, -3.4, baseZ + (i % 2 ? 1 : -1) * (TRAIN_GAUGE_HALF + 2),
            0, 0, (i % 2 ? 1 : -1) * 0.35, false);
        s.visible = false; sparks.push(s);
    }

    const arrival = buildBandungTerminal(M);
    // Terminal Bandung adalah bangunan dunia yang STATIS. Ilusi perjalanan
    // hanya menggeser pool near/mid/far/tunnel; terminal tidak pernah diubah
    // posisinya ketika kereta bergerak.
    arrival.position.set(baseX, 0, baseZ);
    group.add(arrival);

    return {
        group, baseX, baseZ, near, mid, far, tunnel, sparks, arrival, span,
        active: false, speed: 0, routeK: 0, wraps: 0, phase: 'depot',
    };
}

function wrap(items, baseX, span, dx, state, mul = 1) {
    const left = baseX - span * 0.55, right = baseX + span * 0.45;
    for (const g of items) {
        g.position.x -= dx * mul;
        while (g.position.x < left) { g.position.x += span; state.wraps++; }
        while (g.position.x > right) g.position.x -= span;
    }
}

export function resetJourneyScenery(journey) {
    if (!journey) return;
    journey.active = false; journey.speed = 0; journey.routeK = 0; journey.wraps = 0; journey.phase = 'depot';
    journey.group.visible = false;
    journey.tunnel.forEach(g => { g.visible = false; });
    journey.sparks.forEach(s => { s.visible = false; });
    journey.arrival.visible = false;
    journey.arrival.position.set(journey.baseX, 0, journey.baseZ);
}

export function updateJourneyScenery(journey, dt, speed, routeK) {
    if (!journey) return;
    journey.active = speed > 0.01;
    journey.speed = Math.max(0, speed);
    journey.routeK = Math.max(0, Math.min(1, routeK));
    journey.group.visible = journey.active || journey.routeK > 0;
    if (!journey.group.visible) return;
    const dx = journey.speed * dt;
    wrap(journey.near, journey.baseX, journey.span, dx, journey, 1);
    wrap(journey.mid, journey.baseX, journey.span, dx, journey, 0.62);
    wrap(journey.far, journey.baseX, journey.span * 1.15, dx, journey, 0.22);

    journey.phase = journey.routeK < 0.22 ? 'jakarta'
        : journey.routeK < 0.45 ? 'industrial'
            : journey.routeK < 0.62 ? 'countryside'
                : journey.routeK < 0.76 ? 'tunnel'
                    : journey.routeK < 0.9 ? 'mountains' : 'bandung';

    // Jakarta/industrial menonjolkan gudang terbakar; countryside/mountains
    // menggantinya dengan pohon. Semua objek tetap berasal dari pool yang sama.
    for (let i = 0; i < journey.mid.length; i++) {
        const g = journey.mid[i], kind = g.userData.sceneryKind;
        if (journey.phase === 'tunnel') g.visible = false;
        else if (journey.phase === 'jakarta' || journey.phase === 'industrial')
            g.visible = kind === 'industrial' || i % 4 === 1;
        else if (journey.phase === 'countryside' || journey.phase === 'mountains')
            g.visible = kind === 'rural' || i % 6 === 0;
        else g.visible = true;
    }

    const inTunnel = journey.phase === 'tunnel';
    for (const g of journey.tunnel) g.visible = inTunnel;
    if (inTunnel) wrap(journey.tunnel, journey.baseX, 1104, dx, journey, 1);

    // Stasiun tujuan muncul saat kereta benar-benar mengerem, tetapi posisinya
    // tetap. Jangan memasukkannya ke wrap/parallax atau menggesernya ke kereta.
    journey.arrival.visible = journey.routeK >= 0.995 && speed < 75;
    const braking = journey.routeK >= 0.9 && speed < 75;
    for (let i = 0; i < journey.sparks.length; i++) {
        const s = journey.sparks[i];
        s.visible = braking && ((Math.floor(journey.routeK * 1000) + i) % 3 !== 0);
        if (s.visible) {
            s.position.x = journey.baseX - 150 + i * 29 - ((journey.routeK * 1900 + i * 13) % 24);
            s.scale.x = 0.65 + ((i * 7) % 5) * 0.14;
        }
    }
}

export function trainJourneyDebug(train, journey) {
    return {
        active: !!journey?.active,
        visible: !!journey?.group?.visible,
        speed: journey?.speed || 0,
        routeK: journey?.routeK || 0,
        phase: journey?.phase || 'none',
        wraps: journey?.wraps || 0,
        pools: {
            near: journey?.near?.length || 0,
            mid: journey?.mid?.length || 0,
            far: journey?.far?.length || 0,
            tunnel: journey?.tunnel?.length || 0,
            sparks: journey?.sparks?.length || 0,
        },
        sparksVisible: journey?.sparks?.filter(s => s.visible).length || 0,
        terminal: {
            visible: !!journey?.arrival?.visible,
            x: journey?.arrival?.position?.x || 0,
            z: journey?.arrival?.position?.z || 0,
        },
        wheelPhase: train?.wheelPhase || 0,
        doors: train?.doors?.map(d => ({ open: d.open, target: d.target })) || [],
    };
}
