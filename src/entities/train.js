// Kereta militer otonom Campaign Stage 5 + ilusi perjalanan Jakarta -> Bandung.
// Arena/player/robot TETAP di koordinat dunia; rel dan lanskap dari pool tetap
// bergerak ke belakang. Dengan begitu peluru, loot, nav, dan collision bersama
// tidak perlu mengenal platform bergerak. Seluruh visual procedural, PAL-only.

import { PAL, EMISSIVE_MAX } from '../world/palette.js';
import { mergeObjectInPlace, materialKey } from '../utils/meshBatch.js';

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
// BUKAAN NAIK sisi peron. Sejak 2026-08-08 (rombak cutscene keberangkatan) ini
// adalah LUBANG SUNGGUHAN di dinding samping, bukan pelat tempelan: daun
// pintunya dibangun stage 5 (`stage5/world.js`) sebagai rig dua daun bersama
// milik `campaign/utility/doors.js`, jadi membukanya benar-benar memperlihatkan
// dek. Koordinatnya diekspor supaya stage tidak menyalin angkanya lagi.
export const TRAIN_DOOR_X = -28;
export const TRAIN_DOOR_HALF = 10;
export const TRAIN_DOOR_Z = TRAIN_HALF_WIDTH + 0.55;     // bidang KUSEN (rel + tiang)
export const TRAIN_DOOR_LEAF_Z = TRAIN_HALF_WIDTH + 1.5;  // daun menggantung DI LUAR kusen
export const TRAIN_DOOR_T = 0.7;
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
    // TANAH PERJALANAN (2026-08-09, permintaan user: "warna tanahnya jangan biru
    // muda seperti itu. pakai kombinasi warna hijau rumput dan coklat tanah").
    // Yang dulu terlihat biru muda BUKAN material apa pun: sepanjang perjalanan
    // memang TIDAK ADA permukaan tanah sama sekali, jadi yang tampil di bawah
    // lanskap adalah `scene.background` haze kota (0x2b3742). Dua nada di bawah
    // ini yang menutupnya — rumput sengaja lebih tua daripada PAL.leaf supaya
    // kanopi pohon tidak melebur ke dalam tanah.
    grass: new THREE.MeshLambertMaterial({ color: shade(PAL.leaf, 0.72) }),
    // Nada dinding gedung latar (2026-08-09): tiga tone HANGAT turunan token PAL
    // supaya siluet kota tidak lagi hanya dua warna. Sengaja bukan nada dingin —
    // aturan gaya melarang biru-hitam.
    wallTan: new THREE.MeshLambertMaterial({ color: shade(PAL.wood, 1.24) }),
    wallBrick: new THREE.MeshLambertMaterial({ color: shade(PAL.hazard, 0.82) }),
    wallPale: new THREE.MeshLambertMaterial({ color: shade(PAL.concrete, 1.16) }),
});

// Nada turunan dari token PAL (bukan warna baru): jaga aturan palet.
function shade(hex, f) {
    const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
    const b = Math.min(255, Math.round((hex & 255) * f));
    return (r << 16) | (g << 8) | b;
}

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
        // GERBONG PLAYER = GONDOLA TERBUKA (dirombak 2026-08-08, permintaan user:
        // "perbaiki bentuk gerbong... hilangkan lampu di atasnya, terlihat aneh
        // seperti melayang di ruang kosong").
        //
        // Versi lama memakai sangkar rusuk atap TANPA atap, dengan tiga strip
        // lampu langit-langit yang menggantung di udara di atas lorong terbuka —
        // itulah yang melayang. Sekarang bentuknya jujur: BAK TERBUKA. Dinding
        // samping setinggi dada (wajib: kamera oblique harus tetap melihat avatar
        // di badan selebar 4 m), ditutup sill atas, ditopang tiang sudut, dan
        // dikeraskan rusuk press DI LUAR badan. Tidak ada satu pun bagian yang
        // menggantung di atas lorong — satu-satunya struktur tinggi adalah sekat
        // buta ke lokomotif di ujung timur, yang memang dinding belakang kabin
        // DAN berada di arah UP-SCREEN sehingga tak pernah menutupi avatar.
        //
        // Semua detail dalam WAJIB pipih menempel dinding: lorong gerbong harus
        // tetap bebas hambatan berapa pun lebar badan di-retune.
        const wallZ = HW - TRAIN_WALL_T / 2;      // bidang dinding samping
        const innerZ = HW - TRAIN_WALL_T;         // muka DALAM dinding = TRAIN_INNER_HALF
        const innerX = L / 2 - TRAIN_END_T;       // muka DALAM sekat = TRAIN_INNER_HALF_LEN
        const sillY = TRAIN_SIDE_WALL_H;          // puncak dinding samping
        const DOOR_X = TRAIN_DOOR_X, DOOR_HALF = TRAIN_DOOR_HALF;   // bukaan naik (sel TCI)
        const wallLen = L - TRAIN_END_T * 2;

        // Rangka bawah: solebar memanjang + headstock ujung, supaya badan duduk
        // di atas rangka dan bukan melayang di atas bogie.
        for (const z of [-HW + 1.1, HW - 1.1])
            mesh(g, new THREE.BoxGeometry(L - 2, 2.4, 1.5), M.ink, 0, -4.0, z, 0, 0, 0, false);
        for (const s of [-1, 1])
            mesh(g, new THREE.BoxGeometry(2.2, 2.8, W - 1.2), M.ink, s * (L / 2 - 1.1), -3.8, 0, 0, 0, 0, false);

        // Dinding samping + sill atas. Sill sengaja MENJOROK KE LUAR saja (muka
        // dalamnya rata dengan dinding) agar lorong tidak menyempit.
        for (const z of [-wallZ, wallZ]) {
            const s = Math.sign(z);
            // SISI PERON BENAR-BENAR BERLUBANG (2026-08-08, rombak cutscene
            // keberangkatan): dulu dinding ini utuh dan "pintu"-nya cuma pelat
            // tempelan di luar badan, jadi menggesernya hanya memperlihatkan
            // dinding pejal di baliknya — mustahil dipakai adegan pintu terbuka
            // lalu Gibran naik. Kedua penggal dihitung dari TEPI bukaan supaya
            // lebar bukaan tetap TRAIN_DOOR_HALF*2 berapa pun panjang gerbong.
            if (s > 0) {
                for (const [x0, x1] of [[-wallLen / 2, DOOR_X - DOOR_HALF],
                    [DOOR_X + DOOR_HALF, wallLen / 2]])
                    mesh(g, new THREE.BoxGeometry(x1 - x0, TRAIN_SIDE_WALL_H, TRAIN_WALL_T),
                        M.body, (x0 + x1) / 2, TRAIN_SIDE_WALL_H / 2, z);
            } else {
                mesh(g, new THREE.BoxGeometry(wallLen, TRAIN_SIDE_WALL_H, TRAIN_WALL_T),
                    M.body, 0, TRAIN_SIDE_WALL_H / 2, z);
            }
            // SILL SISI PERON IKUT BERLUBANG (2026-08-09, laporan user "masih ada
            // besi melintang yang tidak ikut terbuka"): sill ini dulu satu batang
            // sepanjang gerbong, jadi ia MENYEBERANGI bukaan pintu tepat di
            // ketinggian bahu/leher — persis masalah yang sama dengan palang
            // kusen yang sudah dipindah ke daun. Di sisi peron ia kini dipenggal
            // di tepi bukaan; yang menjembatani celah saat pintu tertutup adalah
            // palang kepala milik DAUN (opsi `headRail`, tingginya disamakan
            // dengan pita sill ini), sehingga terbuka = benar-benar lapang.
            const sillSpans = s > 0
                ? [[-wallLen / 2 - 0.6, DOOR_X - DOOR_HALF],
                    [DOOR_X + DOOR_HALF, wallLen / 2 + 0.6]]
                : [[-wallLen / 2 - 0.6, wallLen / 2 + 0.6]];
            for (const [x0, x1] of sillSpans)
                mesh(g, new THREE.BoxGeometry(x1 - x0, 1.2, TRAIN_WALL_T + 0.9),
                    M.steel, (x0 + x1) / 2, sillY + 0.6, z + s * 0.45, 0, 0, 0, false);
            for (let x = -48; x <= 48; x += 12) {
                if (s > 0 && x > DOOR_X - DOOR_HALF - 4 && x < DOOR_X + DOOR_HALF + 4) continue;
                mesh(g, new THREE.BoxGeometry(1.6, TRAIN_SIDE_WALL_H - 0.6, 0.8), M.steel,
                    x, (TRAIN_SIDE_WALL_H - 0.6) / 2, z + s * 0.85, 0, 0, 0, false);
            }
        }
        // Empat tiang sudut: penopang nyata untuk sill, sekaligus yang membuat
        // siluetnya terbaca sebagai bak, bukan lantai berpagar.
        for (const sx of [-1, 1]) for (const sz of [-1, 1])
            mesh(g, new THREE.BoxGeometry(TRAIN_END_T + 0.2, TRAIN_SIDE_WALL_H + 2.2, TRAIN_WALL_T + 1.6),
                M.steel, sx * endX, (TRAIN_SIDE_WALL_H + 2.2) / 2, sz * wallZ);

        // Ujung BELAKANG (barat): dinding bak setinggi dinding samping — ini yang
        // dulu berupa pelat tinggi menyendiri. Ia juga sisi DOWN-SCREEN, jadi
        // harus rendah supaya tak menutupi avatar.
        mesh(g, new THREE.BoxGeometry(TRAIN_END_T, TRAIN_SIDE_WALL_H, W - 0.8),
            M.body, -endX, TRAIN_SIDE_WALL_H / 2, 0);
        mesh(g, new THREE.BoxGeometry(TRAIN_END_T + 1.2, 1.2, W + 0.6),
            M.steel, -endX, sillY + 0.6, 0, 0, 0, 0, false);
        mesh(g, new THREE.BoxGeometry(TRAIN_END_T + 0.5, 1.3, W - 3.2),
            M.hazard, -endX, sillY - 2.2, 0, 0, 0, 0, false);

        // Ujung DEPAN (timur): sekat buta ke lokomotif, tetap setinggi badan.
        const bhH = TRAIN_CAR_HEIGHT - 7;
        mesh(g, new THREE.BoxGeometry(TRAIN_END_T, bhH, W - 0.8), M.body, endX, bhH / 2, 0);
        mesh(g, new THREE.BoxGeometry(TRAIN_END_T + 1.0, 1.4, W + 0.4), M.steel, endX, bhH, 0, 0, 0, 0, false);
        mesh(g, new THREE.BoxGeometry(TRAIN_END_T + 0.5, 1.3, W - 2.4), M.hazard, endX, 9.4, 0, 0, 0, 0, false);
        // Pintu sekat kabin — TERKUNCI, murni detail; tidak ada collider pintu.
        // Dipatok RATA ke muka dalam sekat (dulu menggantung 0.8 unit di depannya).
        mesh(g, new THREE.BoxGeometry(0.8, 13, 8.4), M.panel, innerX - 0.4, 6.5, 0);
        mesh(g, new THREE.BoxGeometry(0.9, 0.9, 5.2), M.hazard, innerX - 0.45, 12.4, 0, 0, 0, 0, false);

        // Kusen pintu geser sisi peron. DAUNNYA TIDAK DIBANGUN DI SINI: ia
        // memakai rig dua daun 50:50 bersama (`campaign/utility/doors.js`) yang
        // dipasang stage 5 pada grup gerbong ini, supaya satu-satunya sumber
        // gerak/SFX pintu di seluruh campaign tetap satu modul.
        const doorZ = TRAIN_DOOR_Z;
        for (const dx of [DOOR_X - DOOR_HALF, DOOR_X + DOOR_HALF])
            mesh(g, new THREE.BoxGeometry(1.4, TRAIN_SIDE_WALL_H - 0.4, 1.1), M.steel,
                dx, (TRAIN_SIDE_WALL_H - 0.4) / 2, doorZ, 0, 0, 0, false);
        // PALANG KEPALA TIDAK DIBANGUN DI SINI (2026-08-09, laporan user "kepala
        // major gibran menembus besi yang melintang di atas pintu"): dinding
        // gerbong hanya setinggi dada, jadi apa pun yang melintang di atas
        // bukaan pasti memotong kepala orang yang berdiri di situ. Palangnya
        // sekarang menempel pada DAUN pintu (opsi `headRail` rig bersama), jadi
        // ia ikut menyingkir begitu pintu terbuka.
        mesh(g, new THREE.BoxGeometry(18, 0.5, 1.0), M.amber, DOOR_X, 0.9, innerZ - 0.5, 0, 0, 0, false);

        // Detail dinding dalam: pipih, menempel, dan rendah.
        for (const x of [-46, -25, 25, 46]) {
            mesh(g, new THREE.BoxGeometry(13, 4.6, 0.6), M.panel, x, 5.0, -innerZ + 0.3, 0, 0, 0, false);
            mesh(g, new THREE.BoxGeometry(9, 0.5, 0.35), M.tech, x, 7.0, -innerZ + 0.65, 0, 0, 0, false);
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
// PERON KEDATANGAN SISI KAMERA (2026-08-09, cutscene finish). Peron denah finish
// (baris 10-15) berada di sisi -z — itu BACKDROP: dari kamera oblique ia berdiri
// DI BELAKANG kereta, sedangkan satu-satunya pintu gerbong menghadap +z. Supaya
// "Gibran turun dari gerbong" benar-benar terlihat, stasiun tujuan punya peron
// kedua di sisi +z sepanjang kereta (stasiun lintas berperon dua). Sengaja RATA
// tanpa kanopi: apa pun yang tinggi di sini berdiri persis di garis pandang shot
// yang memandang balik dari +z.
export const B_APRON_Z0 = 18, B_APRON_Z1 = 72;
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
    // Dinding pemisah aula sengaja bersih tanpa papan nama/penunjuk lokasi.
    // Peron kedatangan sisi kamera: pelat + garis aman menghadap rel, lalu
    // bangku rendah saja (lihat catatan di B_APRON_Z0).
    const aprD = B_APRON_Z1 - B_APRON_Z0, aprC = (B_APRON_Z0 + B_APRON_Z1) / 2;
    mesh(g, new THREE.BoxGeometry(cols * B_CELL, 2, aprD), M.panel, bx(15.5), -0.4, aprC);
    mesh(g, new THREE.BoxGeometry(cols * B_CELL, 1, 4), M.hazard, bx(15.5), 0.8, B_APRON_Z0 + 3);
    for (const c of [8, 16, 24]) {
        mesh(g, new THREE.BoxGeometry(26, 1.2, 5), M.panel, bx(c), 3.4, B_APRON_Z1 - 9);
        for (const dx of [-10, 10])
            mesh(g, new THREE.BoxGeometry(2, 3.4, 4), M.steel, bx(c) + dx, 1.7, B_APRON_Z1 - 9);
    }
    return g;
}

// Pool perjalanan: seluruh child dibuat SEKALI. `updateJourneyScenery` hanya
// menggeser transform dan wrap; tidak ada scene.add / alokasi geometry per frame.
export function buildTrainJourneyScenery(baseX, baseZ = 0, enemyDz = JOURNEY_TRACK_DZ) {
    const M = mats();
    const group = new THREE.Group();
    const near = [], mid = [], far = [], tunnel = [], sparks = [];
    // 18 modul x 84 = 1512 unit bentang bergulir.
    const NEAR_N = 18, NEAR_STEP = 84, span = NEAR_N * NEAR_STEP;
    const LEFT = baseX - span * 0.55;

    // ===== TATA LETAK PITA LANSKAP =========================================
    // Kamera oblique memandang dari +z, jadi kedua sisi rel TIDAK setara:
    //   * sisi -z (ATAS LAYAR) terbuka sangat jauh -> ini panggung utama;
    //   * sisi +z (BAWAH LAYAR) hanya terlihat sampai ~118 unit, dan apa pun
    //     di antara rel dan kamera (z < ~71) bisa MENUTUPI gerbong player.
    // Karena itu isian sisi +z dipakai sebagai PITA DEPAN di 88..118 (di luar
    // garis pandang ke kereta, tetap terbaca di tepi bawah layar) dan jalur
    // musuh + jalan raya mengisi sisanya. Semua angka di bawah turun dari sini.
    const bedZ0 = Math.min(0, enemyDz), bedZ1 = Math.max(0, enemyDz);
    const bedC = (bedZ0 + bedZ1) / 2, bedHalf = (bedZ1 - bedZ0) / 2 + 17;
    const ROW_FAR = bedC - bedHalf - 9;     // tepi daerah milik jalan, sisi backdrop
    const ROW_NEAR = bedC + bedHalf + 9;    // tepi daerah milik jalan, sisi kamera
    const FG0 = 84;                          // pita depan sisi kamera (di luar jalan raya)
    // PERMUKAAN TANAH (2026-08-09). Rel duduk di GALIAN DANGKAL: formasi balas
    // ada di sekitar y -5 sementara SELURUH prop lineside (pagar, tiang, pohon,
    // pita depan) sudah berdiri di y 0 sejak awal. Jadi permukaan tanah = y 0
    // dan koridor jalur dibiarkan TERBUKA di antara kedua pita tanah — kalau
    // pitanya diteruskan menyeberang, parit dan bahu balas akan terkubur.
    // Tepi galian sengaja tepat di luar parit drainase, dan seluruh perabot
    // lineside pindah ke luar tepi itu supaya tidak ada yang melayang.
    const CUT_FAR = ROW_FAR - 3, CUT_NEAR = ROW_NEAR + 3;
    // Baris perabot lineside. SISI KAMERA DIKOSONGKAN (2026-08-09, laporan user
    // "jauhkan pagar pembatas yang ada di kanan kereta karena Major Gibran
    // berjalan menembusnya"): pita sempit di sebelah kanan rel ternyata dipakai
    // tiga hal lain — peron kedatangan (z 18..72, tempat Gibran turun), jalan
    // raya yang menyatu (aspal 44..80, tiang lampu ~32), dan garis pandang
    // kamera ke gerbong player (apa pun di z < ~71 bisa menutupinya). Jadi
    // seluruh perabot REL pindah ke sisi backdrop, dan yang tersisa di sisi
    // kamera hanya pagar batas milik PITA DEPAN, jauh di luar ketiganya.
    const LS_FAR = CUT_FAR - 2, LS_NEAR = FG0 - 2;
    // Batas pita tanah = tapak pandang kamera oblique (lihat catatan di atas).
    const FIELD_FAR = -232, FIELD_NEAR = 118;

    // Acak DETERMINISTIK dari indeks modul. Sengaja BUKAN Math.random(): pool ini
    // dibangun saat loading bersama seluruh dunia campaign, dan menggeser urutan
    // RNG global ikut menggeser penempatan acak stage lain.
    const rnd = (i, n) => {
        const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
        return v - Math.floor(v);
    };

    // --- Kosakata prop bersama (semua PAL-only, semua statis) ---
    const treeAt = (p, x, z, h, r = h * 0.4) => {
        mesh(p, new THREE.CylinderGeometry(h * 0.05, h * 0.08, h * 0.44, 6), M.earth,
            x, h * 0.22, z, 0, 0, 0, false);
        mesh(p, new THREE.ConeGeometry(r, h * 0.8, 7), M.leaf, x, h * 0.62, z, 0, 0, 0, false);
    };
    const palmAt = (p, x, z, h) => {
        mesh(p, new THREE.CylinderGeometry(0.9, 1.6, h, 6), M.earth, x, h / 2, z, 0, 0, 0, false);
        mesh(p, new THREE.ConeGeometry(6.5, 8, 6), M.leaf, x, h + 2.6, z, Math.PI, 0, 0, false);
    };
    const bambooAt = (p, x, z, h) => {
        for (let k = 0; k < 3; k++)
            mesh(p, new THREE.ConeGeometry(2.2, h - k * 5, 5), M.leaf,
                x + (k - 1) * 3.4, (h - k * 5) / 2, z + (k % 2) * 3, 0, 0, (k - 1) * 0.07, false);
    };
    // GEDUNG KOTA BERVARIASI (2026-08-09, laporan user "gedung-gedung yang
    // menjadi background di sisi kiri kereta masih terlalu terlihat seperti
    // placeholder"). Dulu tiap lot hanya satu balok + strip jendela, semuanya
    // dua warna. Sekarang tiap lot memilih SATU dari lima tipe lewat hash indeks
    // dan satu warna dari palet dinding yang lebih luas, jadi tak ada dua modul
    // berturut yang terbaca sama. Semua tipe tetap PAL-only dan hemat mesh.
    const WALLS = [M.panel, M.concrete, M.wallTan, M.wallBrick, M.wallPale];
    const wallOf = (i, k) => WALLS[Math.min(WALLS.length - 1,
        Math.floor(rnd(i, k + 40) * WALLS.length))];
    // Strip jendela menyala menghadap kamera (+z) — dipakai semua tipe.
    const litRow = (p, x, y, z, w) =>
        mesh(p, new THREE.BoxGeometry(w, 1.1, 1.1), M.amber, x, y, z + 0.6, 0, 0, 0, false);
    const buildingAt = (p, x, z, w, d, h, i, k) => {
        const mat = wallOf(i, k), t = Math.floor(rnd(i, k + 60) * 5);
        if (t === 0) {
            // MENARA BERTINGKAT: badan + setback + kepala mesin + antena.
            mesh(p, new THREE.BoxGeometry(w, h, d), mat, x, h / 2, z, 0, 0, 0, false);
            mesh(p, new THREE.BoxGeometry(w * 0.66, h * 0.34, d * 0.66), mat,
                x, h + h * 0.17, z, 0, 0, 0, false);
            mesh(p, new THREE.BoxGeometry(w * 0.26, 5, d * 0.26), M.steel,
                x, h * 1.34 + 2.5, z, 0, 0, 0, false);
            mesh(p, new THREE.CylinderGeometry(0.5, 0.5, 16, 4), M.steel,
                x, h * 1.34 + 13, z, 0, 0, 0, false);
            litRow(p, x, h * 0.72, z + d / 2, w * 0.7);
        } else if (t === 1) {
            // PODIUM + SLAB: kaki lebar, badan pipih tinggi, mahkota menyala.
            mesh(p, new THREE.BoxGeometry(w * 1.3, h * 0.24, d * 1.2), M.concrete,
                x, h * 0.12, z, 0, 0, 0, false);
            mesh(p, new THREE.BoxGeometry(w * 0.8, h, d * 0.6), mat, x, h / 2 + h * 0.24, z, 0, 0, 0, false);
            litRow(p, x, h * 1.12, z + d * 0.3, w * 0.6);
            litRow(p, x, h * 0.62, z + d * 0.3, w * 0.6);
        } else if (t === 2) {
            // DERET RUKO: tiga unit sempit dan kanopi menerus, tanpa papan nama.
            const uw = w / 3;
            for (let u = 0; u < 3; u++)
                mesh(p, new THREE.BoxGeometry(uw - 1.2, h * (0.7 + 0.2 * ((u + k) % 2)), d),
                    u === 1 ? M.panel : mat, x - w / 2 + uw * (u + 0.5), h * (0.35 + 0.1 * ((u + k) % 2)), z, 0, 0, 0, false);
            litRow(p, x, h * 0.5, z + d / 2, w * 0.8);
        } else if (t === 3) {
            // GUDANG BERATAP PELANA + pintu rol.
            mesh(p, new THREE.BoxGeometry(w, h * 0.62, d), mat, x, h * 0.31, z, 0, 0, 0, false);
            mesh(p, new THREE.ConeGeometry(w * 0.62, h * 0.3, 4), M.body,
                x, h * 0.62 + h * 0.15, z, 0, Math.PI / 4, 0, false);
            mesh(p, new THREE.BoxGeometry(w * 0.4, h * 0.4, 0.8), M.ink,
                x, h * 0.2, z + d / 2 + 0.4, 0, 0, 0, false);
        } else {
            // BLOK BIASA + TANDON AIR di atapnya (siluet paling Jakarta).
            mesh(p, new THREE.BoxGeometry(w, h, d), mat, x, h / 2, z, 0, 0, 0, false);
            mesh(p, new THREE.BoxGeometry(w * 0.3, 3, d * 0.3), M.steel, x + w * 0.22, h + 1.5, z, 0, 0, 0, false);
            mesh(p, new THREE.CylinderGeometry(3.2, 3.2, 5, 8), M.panel, x + w * 0.22, h + 5.5, z, 0, 0, 0, false);
            litRow(p, x, h * 0.55, z + d / 2, w * 0.7);
        }
    };
    // Rumah beratap pelana (ruko/rumah kampung/saung — beda materialnya saja).
    const houseAt = (p, x, z, w, h, wall, roof) => {
        mesh(p, new THREE.BoxGeometry(w, h, w * 0.8), wall, x, h / 2, z, 0, 0, 0, false);
        mesh(p, new THREE.ConeGeometry(w * 0.78, h * 0.62, 4), roof,
            x, h + h * 0.31, z, 0, Math.PI / 4, 0, false);
    };
    // Tiang lineside: tiang + palang + kepala lampu kecil.
    const poleAt = (p, x, z, h, head) => {
        mesh(p, new THREE.CylinderGeometry(0.7, 0.9, h, 6), M.steel, x, h / 2, z, 0, 0, 0, false);
        mesh(p, new THREE.BoxGeometry(0.6, 0.6, 11), M.steel, x, h - 2.5, z, 0, 0, 0, false);
        if (head) mesh(p, new THREE.BoxGeometry(1.6, 1.6, 1.6), M.amber, x, h - 0.6, z, 0, 0, 0, false);
    };
    // Pagar batas: dua kawat memanjang + tiang.
    const fenceRun = (p, z, L, posts) => {
        for (const y of [3.4, 6.2])
            mesh(p, new THREE.BoxGeometry(L, 0.35, 0.35), M.steel, 0, y, z, 0, 0, 0, false);
        for (let k = 0; k < posts; k++)
            mesh(p, new THREE.BoxGeometry(0.7, 7, 0.7), M.steel,
                -L / 2 + (k + 0.5) * (L / posts), 3.5, z, 0, 0, 0, false);
    };

    // ===== POOL NEAR: JALUR + PERABOT LINESIDE + PITA DEPAN =================
    // Parallax 1.0 — semua yang secara fisik dekat rel HARUS di pool ini, kalau
    // tidak ia akan tampak menggeser lebih lambat daripada tanah di bawahnya.
    // Isinya sengaja NETRAL BABAK (bantalan, pagar, tiang, semak, palem, gubuk):
    // perabot tepi rel memang sama di pinggiran kota maupun di lembah pegunungan,
    // jadi hanya pita mid/far yang berganti saat masuk wilayah pegunungan.
    for (let i = 0; i < NEAR_N; i++) {
        const g = new THREE.Group();
        const L = NEAR_STEP;
        // ISI MODUL DIPECAH DUA (2026-08-09, laporan user "ketika transisi jalan
        // raya masuk, masih banyak rumah pohon dan objek lainnya yang ada di
        // tengah jalan"): jalan raya menyapu MASUK dari z 200 ke 62, jadi ia
        // melewati pita depan (84..96) di tengah perjalanan mendekat. Isi sisi
        // kamera karena itu dikumpulkan di `fgG` yang DILAS TERPISAH dan bisa
        // dipadamkan per modul begitu jalan raya diaktifkan — sama seperti dua
        // babak lanskap di pool `mid`. Sisanya (tanah, jalur, perabot rel sisi
        // backdrop) tinggal di `mainG` dan tak pernah ikut padam.
        const mainG = new THREE.Group(), fgG = new THREE.Group();
        // --- TANAH: badan galian COKLAT + lapisan RUMPUT tipis di atasnya, dua
        // pita mengapit koridor jalur. Muka galian yang menghadap rel karena itu
        // terbaca tanah coklat, bukan dinding rumput. Lebar tiap pita PERSIS L
        // supaya modul tetangga bersambung, bukan tumpang tindih.
        for (const [z0, z1] of [[FIELD_FAR, CUT_FAR], [CUT_NEAR, FIELD_NEAR]]) {
            const d = z1 - z0, zc = (z0 + z1) / 2;
            mesh(mainG, new THREE.BoxGeometry(L, 5.4, d), M.earth, 0, -3.9, zc, 0, 0, 0, false);
            mesh(mainG, new THREE.BoxGeometry(L, 1.2, d), M.grass, 0, -0.6, zc, 0, 0, 0, false);
        }
        // Petak tanah terbuka/ladang: kombinasi hijau-coklat yang diminta,
        // sekaligus memecah bidang rumput supaya tidak terbaca sebagai satu
        // pelat datar saat kereta melaju.
        const patchAt = (p, px, pz, w, d) =>
            mesh(p, new THREE.BoxGeometry(w, 1.4, d), M.earth, px, -0.4, pz, 0, 0, 0, false);
        const patch = (px, pz, w, d) => patchAt(mainG, px, pz, w, d);
        patch((rnd(i, 30) - 0.5) * L * 0.5, -96 - rnd(i, 31) * 54, 34 + rnd(i, 32) * 26, 30);
        if (i % 2) patch((rnd(i, 33) - 0.5) * L * 0.6, -156 - rnd(i, 34) * 46, 44, 34);
        if (i % 3 === 1) patchAt(fgG, L * 0.2, FG0 + 15, 30, 18);
        mesh(mainG, new THREE.BoxGeometry(L, 0.8, bedHalf * 2 + 6), M.earth, 0, -5.6, bedC);
        // Bahu ballast + parit drainase di kedua tepi.
        for (const s of [-1, 1]) {
            mesh(mainG, new THREE.BoxGeometry(L, 1.4, 12), M.ballast,
                0, -5.3, bedC + s * (bedHalf + 3), 0, 0, 0, false);
            mesh(mainG, new THREE.BoxGeometry(L, 0.8, 3.4), M.ink,
                0, -6.2, bedC + s * (bedHalf + 10), 0, 0, 0, false);
        }
        for (const tz of [0, enemyDz]) {
            for (const rz of [-TRAIN_GAUGE_HALF, TRAIN_GAUGE_HALF])
                mesh(mainG, new THREE.BoxGeometry(L + 2, 1.1, 1.8), M.steel, 0, -4.7, tz + rz);
            // BANTALAN: irama inilah yang menjual kecepatan kereta; tanpa ini
            // jalurnya cuma dua batang mulus yang tak terlihat bergerak.
            for (let k = 0; k < 9; k++)
                mesh(mainG, new THREE.BoxGeometry(4.6, 0.9, TRAIN_GAUGE_HALF * 2 + 7), M.ink,
                    -L / 2 + (k + 0.5) * (L / 9), -5.15, tz, 0, 0, 0, false);
        }
        // Talang kabel beton menyusuri sisi backdrop.
        mesh(mainG, new THREE.BoxGeometry(L, 2.2, 3.2), M.ballast, 0, -4.2, ROW_FAR + 4, 0, 0, 0, false);
        fenceRun(mainG, LS_FAR, L, 4);
        fenceRun(fgG, LS_NEAR, L, 4);
        // Tiang berdiri TEPAT di belakang pagar, di depan talud pita mid (-76):
        // lebih jauh sedikit lagi dan ia akan menembus tembok penahan itu.
        poleAt(mainG, -L * 0.28, LS_FAR - 1, 26 + (i % 3) * 4, i % 2 === 0);
        if (i % 2) poleAt(fgG, L * 0.3, LS_NEAR + 3, 20, false);
        // Patok kilometer + kotak relay + tumpukan balas: perabat kecil yang
        // membuat tepi rel terbaca terurus, bukan garis kosong. Semuanya di luar
        // tepi galian — di dalam koridor mereka akan melayang di atas balas.
        if (i % 3 === 0) {
            mesh(mainG, new THREE.BoxGeometry(1.2, 6, 1.2), M.white, L * 0.1, 3, LS_FAR + 1.5, 0, 0, 0, false);
            mesh(mainG, new THREE.BoxGeometry(0.6, 3, 5), M.white, L * 0.1, 6.5, LS_FAR + 1.5, 0, 0, 0, false);
        }
        if (i % 4 === 1) {
            mesh(mainG, new THREE.BoxGeometry(7, 8, 5), M.body, -L * 0.34, 4, LS_FAR - 3, 0, 0, 0, false);
            mesh(mainG, new THREE.BoxGeometry(8, 1, 6), M.ink, -L * 0.34, 8.4, LS_FAR - 3, 0, 0, 0, false);
        }
        if (i % 5 === 2) {
            // Sinyal blok: tiang tinggi + kepala tiga lampu menghadap kereta.
            mesh(mainG, new THREE.CylinderGeometry(0.8, 1.1, 30, 6), M.steel, L * 0.36, 15, LS_FAR, 0, 0, 0, false);
            mesh(mainG, new THREE.BoxGeometry(2.6, 9, 3), M.ink, L * 0.36, 27, LS_FAR + 1.4, 0, 0, 0, false);
            mesh(mainG, new THREE.BoxGeometry(1, 1.6, 1.6), M.amber, L * 0.36, 29.4, LS_FAR + 3, 0, 0, 0, false);
        }
        if (i % 6 === 4)
            mesh(mainG, new THREE.ConeGeometry(7, 6, 6), M.ballast, -L * 0.1, 3, LS_FAR + 1.5, 0, 0, 0, false);
        // PITA DEPAN sisi kamera: rendah-menengah, di luar garis pandang ke
        // gerbong player dan di luar badan jalan raya.
        // Paletnya sengaja DIPERSEMPIT (leaf/earth/panel/steel): tiap material
        // yang hanya dipakai di sini menambah satu draw call PER MODUL karena
        // pita ini dilas terpisah dari badan modulnya.
        const fz = FG0 + rnd(i, 1) * 10;
        switch (i % 4) {
            case 0: treeAt(fgG, -L * 0.2, fz + 2, 26 + rnd(i, 2) * 10); palmAt(fgG, L * 0.22, fz + 9, 22); break;
            case 1: {
                mesh(fgG, new THREE.BoxGeometry(30, 8, 12), M.panel, 0, 4, fz + 5, 0, 0, 0, false);
                treeAt(fgG, L * 0.3, fz + 11, 22);
                break;
            }
            case 2: houseAt(fgG, L * 0.05, fz + 7, 20, 13, M.panel, M.earth); break;
            default: {
                for (let k = 0; k < 3; k++)
                    mesh(fgG, new THREE.ConeGeometry(5.5, 7, 6), M.leaf,
                        -L * 0.3 + k * 24, 3.5, fz + 3 + (k % 2) * 5, 0, 0, 0, false);
                break;
            }
        }
        g.position.set(LEFT + i * NEAR_STEP, 0, baseZ);
        const mainW = mergeObjectInPlace(mainG), fgW = mergeObjectInPlace(fgG);
        g.add(mainW); g.add(fgW);
        g.userData.mainG = mainW; g.userData.fgG = fgW;
        group.add(g); near.push(g);
    }

    // ===== POOL MID: PANGGUNG UTAMA DI SISI BACKDROP ========================
    // DUA LANSKAP DALAM SATU POOL (2026-08-09, permintaan user: "di bagian awal
    // journey berada di kota juga. ketika gerbong ke-3 hancur, masuk ke wilayah
    // pegunungan khas Jawa Barat"). Karena pool WAJIB prealokasi (tanpa alokasi
    // di tengah permainan), tiap modul membawa KEDUA set — kota dan pegunungan —
    // sebagai anak grup yang tinggal di-toggle `visible`. Tidak ada material
    // atau geometri baru yang lahir saat lanskapnya berganti; tiap set DILAS
    // (`mergeObjectInPlace`) jadi segelintir mesh per material, sehingga isinya
    // jauh lebih padat TAPI draw call-nya justru turun.
    const MID_N = 18;
    for (let i = 0; i < MID_N; i++) {
        const g = new THREE.Group();
        // --- KOTA: deret ruko/gudang, blok kantor, satu menara; tanpa reklame.
        let cityG = new THREE.Group();
        for (let k = 0; k < 3; k++) {
            const h = 22 + rnd(i, k) * 20;
            buildingAt(cityG, -30 + k * 30, -90 - rnd(i, k + 3) * 10, 26, 22, h, i, k);
        }
        for (let k = 0; k < 2; k++) {
            const h = 54 + rnd(i, k + 6) * 46;
            buildingAt(cityG, -22 + k * 46, -124 - rnd(i, k + 8) * 16, 40, 34, h, i, k + 5);
        }
        buildingAt(cityG, (rnd(i, 10) - 0.5) * 50, -160 - rnd(i, 11) * 24, 44, 44,
            120 + rnd(i, 12) * 90, i, 9);
        mesh(cityG, new THREE.BoxGeometry(NEAR_STEP, 7, 1.6), M.ballast, 0, 3.5, -76, 0, 0, 0, false);
        if (i % 2) palmAt(cityG, -40, -84, 24);
        cityG = mergeObjectInPlace(cityG);
        g.add(cityG); g.userData.cityG = cityG;

        // --- PEGUNUNGAN JAWA BARAT: sawah terasering bertingkat, rumpun pohon,
        // bambu, saung beratap pelana, dan tebing batu — penanda paling khas
        // koridor Jakarta-Bandung.
        let hillG = new THREE.Group();
        for (let k = 0; k < 4; k++) {                      // terasering naik menjauh
            const w = 72 - k * 8, y = 1.5 + k * 5.5;
            mesh(hillG, new THREE.BoxGeometry(w, y + 3, 26), M.earth,
                (rnd(i, k + 14) - 0.5) * 8, (y + 3) / 2, -88 - k * 22, 0, 0, 0, false);
            mesh(hillG, new THREE.BoxGeometry(w - 8, 1.2, 20), M.leaf,
                (rnd(i, k + 14) - 0.5) * 8, y + 3, -88 - k * 22, 0, 0, 0, false);
        }
        for (let k = 0; k < 4; k++)
            treeAt(hillG, -44 + k * 30 + rnd(i, k + 18) * 12, -100 - rnd(i, k + 22) * 62,
                26 + rnd(i, k + 26) * 22);
        bambooAt(hillG, -52, -86, 24);
        if (i % 2) houseAt(hillG, 34, -118, 18, 11, M.panel, M.earth);
        if (i % 3 === 1) mesh(hillG, new THREE.ConeGeometry(26, 46, 6), M.earth, -18, 23, -176, 0, 0, 0, false);
        mesh(hillG, new THREE.BoxGeometry(NEAR_STEP, 5, 8), M.ballast, 0, 2.5, -78, 0, 0, 0, false);
        hillG = mergeObjectInPlace(hillG);
        g.add(hillG); g.userData.hillG = hillG;

        g.position.set(LEFT + (i + 0.5) * NEAR_STEP, 0, baseZ);
        group.add(g); mid.push(g);
    }

    // ===== POOL FAR: SILUET CAKRAWALA ======================================
    // Semua modul kini di sisi BACKDROP (-z). Versi lama menyelang-nyeling ke
    // +z, dan modul +z itu berada di belakang kamera — separuh pool tak pernah
    // terlihat sama sekali. Jarak antar-modul juga disamakan dengan bentang
    // wrap-nya supaya cakrawala tidak berlubang.
    const FAR_SPAN = span * 1.15, FAR_N = 12, FAR_STEP = FAR_SPAN / FAR_N;
    for (let i = 0; i < FAR_N; i++) {
        const g = new THREE.Group();
        let ridgeG = new THREE.Group();
        for (let k = 0; k < 3; k++)
            mesh(ridgeG, new THREE.ConeGeometry(105 + rnd(i, k) * 70, 130 + rnd(i, k + 3) * 120, 7),
                M.leaf, (k - 1) * (130 + rnd(i, k + 6) * 60), 40, -22 + k * 22, 0, 0, 0, false);
        ridgeG = mergeObjectInPlace(ridgeG);
        g.add(ridgeG); g.userData.ridgeG = ridgeG;
        let skyG = new THREE.Group();
        // Cakrawala pun tidak lagi satu warna satu bentuk: tiap menara memilih
        // nada dinding sendiri, sebagian bermahkota setback atau antena.
        const SKY_MATS = [M.concrete, M.panel, M.wallTan, M.wallPale];
        for (let k = 0; k < 5; k++) {
            const h = 130 + rnd(i, k + 9) * 240;
            const bx = (k - 2) * (62 + rnd(i, k + 17) * 20), bz = -16 + rnd(i, k + 21) * 34;
            const w = 40 + rnd(i, k + 13) * 34;
            mesh(skyG, new THREE.BoxGeometry(w, h, 44),
                SKY_MATS[Math.floor(rnd(i, k + 31) * SKY_MATS.length) % SKY_MATS.length],
                bx, h / 2, bz, 0, 0, 0, false);
            if (rnd(i, k + 35) > 0.45)
                mesh(skyG, new THREE.BoxGeometry(w * 0.5, 18 + rnd(i, k + 39) * 26, 26), M.body,
                    bx, h + 9 + rnd(i, k + 39) * 13, bz, 0, 0, 0, false);
            else
                mesh(skyG, new THREE.CylinderGeometry(0.9, 0.9, 26, 4), M.steel,
                    bx, h + 13, bz, 0, 0, 0, false);
            if (k % 2) mesh(skyG, new THREE.BoxGeometry(22, 1.4, 1.4), M.amber,
                bx, h * 0.8, bz + 23, 0, 0, 0, false);
        }
        skyG = mergeObjectInPlace(skyG);
        g.add(skyG); g.userData.skyG = skyG;
        g.position.set(baseX - FAR_SPAN * 0.55 + i * FAR_STEP, -22, baseZ - 196);
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

    const journey = {
        group, baseX, baseZ, near, mid, far, tunnel, sparks, arrival, span,
        active: false, speed: 0, routeK: 0, wraps: 0, phase: 'depot',
        // Babak lanskap yang sedang dituju + berapa modul depan yang sengaja
        // masih memakai babak lama (pita peralihan).
        act: 'city', blend: 0,
        // Sisa jarak yang masih harus ditempuh terminal tujuan sebelum mendarat
        // di rumahnya (lihat `dockArrivalTerminal`).
        arrivalDx: 0,
        // Jalan raya sedang aktif -> pita depan sisi kamera dipadamkan.
        roadOn: false,
    };
    setAllActs(journey, 'city');
    return journey;
}

function wrap(items, baseX, span, dx, state, mul = 1, onWrap = null) {
    const left = baseX - span * 0.55, right = baseX + span * 0.45;
    for (const g of items) {
        g.position.x -= dx * mul;
        let wrapped = false;
        while (g.position.x < left) { g.position.x += span; state.wraps++; wrapped = true; }
        while (g.position.x > right) g.position.x -= span;
        // Modul yang baru saja lahir kembali JAUH DI DEPAN player: satu-satunya
        // saat yang aman untuk mengganti babak lanskapnya (lihat `adoptAct`).
        if (wrapped && onWrap) onWrap(g);
    }
}

// --- PERGANTIAN BABAK BERTAHAP (2026-08-09, permintaan user: "bikin transisi
// yang mulus dari background perkotaan ke pegunungan ke perkotaan lagi") ------
// Versi lama men-toggle `visible` SEMUA modul mid/far dalam satu frame, jadi
// seluruh cakrawala berganti sekaligus tepat di depan mata. Sekarang babak
// hanya berpindah LEWAT WRAP: sebuah modul mengambil babak baru saat ia keluar
// di belakang dan lahir kembali jauh di depan, sehingga perbatasannya benar-
// benar DIDEKATI — kota menipis dulu, lalu perbukitan datang menghampiri.
// Selama pita peralihan babaknya DI-DITHER (pola di bawah) supaya tidak ada
// satu garis lurus tempat kota berhenti dan gunung mulai.
const BLEND_PATTERN = Object.freeze([0, 1, 0, 1, 1, 0, 1, 1]);
const otherAct = act => (act === 'city' ? 'hill' : 'city');
// Ambang "aman di luar layar" ke arah depan. Diturunkan dari tapak pandang
// kamera oblique (`groundViewExtents`: x kira-kira -118..+267 relatif player)
// ditambah setengah lebar modul; smoke menegakkan angka ini benar-benar di luar
// tapak itu, jadi ia tidak bisa diam-diam meleset kalau kamera diubah.
export const SCENERY_OFFSCREEN_AHEAD = 420;

// PITA DEPAN vs JALAN RAYA (2026-08-09). Sama seperti babak lanskap: sebuah
// modul hanya boleh memadamkan pita depannya SELAGI DI LUAR LAYAR, entah lewat
// wrap atau lewat tata-ulang sekali saat jalan raya diaktifkan. Kalau dipadamkan
// serentak, sederet rumah dan pohon lenyap di depan mata.
function applyFg(journey, g) {
    if (g.userData.fgG) g.userData.fgG.visible = !journey.roadOn;
}

function applyAct(g) {
    const city = g.userData.act === 'city';
    if (g.userData.cityG) g.userData.cityG.visible = city;
    if (g.userData.hillG) g.userData.hillG.visible = !city;
    if (g.userData.skyG) g.userData.skyG.visible = city;
    if (g.userData.ridgeG) g.userData.ridgeG.visible = !city;
}

// Dipanggil TEPAT saat modul wrap — ia lahir kembali di ujung depan pool, jauh
// di luar layar, jadi babak barunya tidak pernah terlihat berganti.
function adoptAct(journey, g) { g.userData.act = journey.act; applyAct(g); }

// Jalan raya menyatu dari z 200 ke 62, jadi ia MELEWATI pita depan (84..96) di
// tengah pendekatannya — pohon dan rumah akan berdiri di tengah aspal. Stage
// memanggil ini saat jalan diaktifkan/dimatikan; modul yang sudah menunggu di
// luar layar langsung ditata ulang, sisanya menyusul saat bergulir keluar.
export function setJourneyForeground(journey, on) {
    if (!journey) return;
    journey.roadOn = !on;
    for (const g of journey.near)
        if (g.position.x - journey.baseX > SCENERY_OFFSCREEN_AHEAD) applyFg(journey, g);
}

// SATU KALI saat babak berganti: seluruh modul yang sedang MENUNGGU DI LUAR
// LAYAR DI DEPAN player ditata ulang, karena mengubahnya di sana tak terlihat
// sama sekali. Tanpa ini babak baru hanya bisa masuk lewat wrap, dan satu
// putaran pool far makan ~47 detik — peralihannya jadi menggantung. Modul yang
// sedang DI LAYAR atau sudah lewat tidak disentuh: ia mengambil babak baru saat
// bergulir keluar, jadi tidak ada satu pun yang berganti di depan mata.
function relayoutAhead(journey) {
    const set = (g, act) => { g.userData.act = act; applyAct(g); };
    const old = otherAct(journey.act);
    const ahead = journey.mid
        .filter(g => g.position.x - journey.baseX > SCENERY_OFFSCREEN_AHEAD)
        .sort((a, b) => a.position.x - b.position.x);
    journey.blend = 0;
    for (let k = 0; k < ahead.length; k++) {
        // Modul terdekat memakai pola DITHER: babak lama masih menyelip di
        // antara yang baru, sehingga perbatasannya terbaca MENIPIS, bukan
        // sebagai satu garis lurus tempat kota berhenti dan gunung mulai.
        const keepOld = k < BLEND_PATTERN.length && !BLEND_PATTERN[k];
        if (keepOld) journey.blend++;
        set(ahead[k], keepOld ? old : journey.act);
    }
    // Cakrawala jauh TIDAK di-dither: siluetnya harus terbaca sebagai satu garis
    // horizon yang berpindah, bukan gigi gergaji.
    for (const g of journey.far)
        if (g.position.x - journey.baseX > SCENERY_OFFSCREEN_AHEAD) set(g, journey.act);
}

function setAllActs(journey, act) {
    journey.act = act; journey.blend = 0;
    for (const g of journey.mid) { g.userData.act = act; applyAct(g); }
    for (const g of journey.far) { g.userData.act = act; applyAct(g); }
}

export function resetJourneyScenery(journey) {
    if (!journey) return;
    journey.active = false; journey.speed = 0; journey.routeK = 0; journey.wraps = 0; journey.phase = 'depot';
    // Perjalanan SELALU dibuka di kota (depot berdiri di tengah kota); dither
    // babak dimulai dari nol lagi supaya restart stage tidak mewarisi pita
    // peralihan run sebelumnya.
    setAllActs(journey, 'city');
    journey.group.visible = false;
    journey.tunnel.forEach(g => { g.visible = false; });
    journey.sparks.forEach(s => { s.visible = false; });
    journey.arrival.visible = false;
    journey.arrivalDx = 0; journey.roadOn = false;
    for (const g of journey.near) applyFg(journey, g);
    journey.arrival.position.set(journey.baseX, 0, journey.baseZ);
}

// Dipanggil cutscene kedatangan pada shot pengereman: terminal ditaruh sejauh
// `dist` di DEPAN rumahnya lalu digulirkan masuk bersama tanah (lihat catatan di
// `updateJourneyScenery`). `dist` = jarak tempuh sisa kereta sampai berhenti.
export function dockArrivalTerminal(journey, dist) {
    if (journey) journey.arrivalDx = Math.max(0, dist || 0);
}

// `mountainK` = nilai routeK saat lanskap berganti dari KOTA ke PEGUNUNGAN.
// Angkanya milik gameplay (jumlah gerbong musuh yang harus hancur), jadi ia
// DIKIRIM stage dari config — bukan ditanam di sini bersama ambang visual.
export function updateJourneyScenery(journey, dt, speed, routeK, mountainK = 0.3) {
    if (!journey) return;
    journey.active = speed > 0.01;
    journey.speed = Math.max(0, speed);
    journey.routeK = Math.max(0, Math.min(1, routeK));
    journey.group.visible = journey.active || journey.routeK > 0;
    if (!journey.group.visible) return;
    const dx = journey.speed * dt;
    wrap(journey.near, journey.baseX, journey.span, dx, journey, 1, g => applyFg(journey, g));
    wrap(journey.mid, journey.baseX, journey.span, dx, journey, 0.62,
        g => adoptAct(journey, g));
    // Parallax far dinaikkan 0.22 -> 0.40 pada 2026-08-09: pool ini dulu berada
    // 370 unit di belakang rel — DI LUAR tapak pandang, jadi tak pernah terlihat
    // sama sekali. Sekarang ia duduk tepat di belakang pita mid, jadi lajunya
    // harus mendekati mid supaya tidak terbaca menggeser salah arah.
    wrap(journey.far, journey.baseX, journey.span * 1.15, dx, journey, 0.4,
        g => adoptAct(journey, g));

    // DUA BABAK (2026-08-09, permintaan user): KOTA dulu — perjalanan dimulai
    // dari depot yang memang berdiri di tengah kota — lalu PEGUNUNGAN JAWA
    // BARAT begitu `routeK` melewati `mountainK` (= gerbong musuh ke-N hancur).
    // Terowongan tetap ada tetapi kini menjadi bagian dari babak pegunungan
    // (itulah tembusan perbukitan jalur Jakarta-Bandung), dan babak penutup
    // kembali ke kota karena tujuannya adalah kota Bandung.
    const mk = Math.max(0, Math.min(1, mountainK));
    const tunnelK = mk + (1 - mk) * 0.55;
    journey.phase = journey.routeK < mk ? 'city'
        : journey.routeK < tunnelK ? 'mountains'
            : journey.routeK < tunnelK + 0.1 ? 'tunnel'
                : journey.routeK < 0.9 ? 'mountains' : 'bandung';

    // Tiap modul mid membawa KEDUA set; yang berganti hanya `visible` — dan
    // pergantiannya MENJALAR lewat wrap, bukan serentak (lihat `adoptAct`).
    // Fase hanya menetapkan BABAK TUJUAN; modul yang sudah terlanjur berdiri di
    // depan player tetap memakai babak lamanya sampai ia bergulir keluar.
    const target = journey.phase === 'city' || journey.phase === 'bandung' ? 'city' : 'hill';
    if (journey.act !== target) { journey.act = target; relayoutAhead(journey); }
    for (const g of journey.mid) g.visible = journey.phase !== 'tunnel';

    const inTunnel = journey.phase === 'tunnel';
    for (const g of journey.tunnel) g.visible = inTunnel;
    if (inTunnel) wrap(journey.tunnel, journey.baseX, 1104, dx, journey, 1);

    // Stasiun tujuan muncul saat kereta benar-benar mengerem, tetapi posisinya
    // tetap. Jangan memasukkannya ke wrap/parallax atau menggesernya ke kereta.
    // TERMINAL TUJUAN IKUT DUNIA, BUKAN KERETA (2026-08-09, laporan user
    // "pastikan stasiun tujuan tidak ikut bergeser mengikuti kereta"). Selama
    // ilusi perjalanan, KERETA-lah yang diam di koordinat dunia dan lanskap yang
    // bergulir. Terminal yang dipatok di `baseX` karena itu juga diam TERHADAP
    // KERETA — di layar ia terbaca menempel pada kereta sementara tanah menyapu
    // lewat. Jadi selama ia masih "mendekat" (`arrivalDx` > 0, diisi cutscene
    // kedatangan sebesar jarak pengereman) ia bergulir bersama pool `near` pada
    // parallax 1.0 dan berhenti PERSIS di rumahnya ketika kereta berhenti.
    // Ini BUKAN pembatalan aturan "terminal statis": ia tidak pernah ikut wrap
    // dan selalu mendarat kembali di `baseX`.
    if (journey.arrivalDx > 0) journey.arrivalDx = Math.max(0, journey.arrivalDx - dx);
    journey.arrival.position.x = journey.baseX + (journey.arrivalDx || 0);
    journey.arrival.visible = journey.routeK >= 0.995
        && (journey.arrivalDx > 0 || speed < 75);
    // Bunga api rem hanya selama kereta MASIH BERGULIR: cutscene kedatangan
    // menahan kereta pada kecepatan 0 selama tiga shot terakhir, dan percikan
    // di bawah kereta yang diam terbaca salah.
    const braking = journey.routeK >= 0.9 && speed < 75 && speed > 2;
    for (let i = 0; i < journey.sparks.length; i++) {
        const s = journey.sparks[i];
        s.visible = braking && ((Math.floor(journey.routeK * 1000) + i) % 3 !== 0);
        if (s.visible) {
            s.position.x = journey.baseX - 150 + i * 29 - ((journey.routeK * 1900 + i * 13) % 24);
            s.scale.x = 0.65 + ((i * 7) % 5) * 0.14;
        }
    }
}

// --- JALAN RAYA PENDAMPING (2026-08-08, permintaan user) -------------------
// Mulai gerbong ke-5 kereta musuh, sebuah jalan raya berjalan di sisi KANAN
// kereta player (+z; arah perjalanan +x, jadi kanan = +z, dan dari kamera
// oblique itu berada di bawah layar — sisi berlawanan dengan jalur musuh).
//
// ATURAN KERAS DARI USER: "JANGAN BUAT JALAN TIBA-TIBA MUNCUL — BUAT SEOLAH-
// OLAH JALAN REL KERETA MENDEKAT KE JALAN SECARA WAJAR." Karena itu pool ini
// TIDAK memakai satu offset lateral global yang dianimasikan (bidang jalan
// akan terlihat menggeser ke samping). Jarak lateral tiap modul dihitung dari
// KOORDINAT TEMPUH modul itu sendiri lewat callback `offsetForX` milik scene:
// modul yang berada DI DEPAN player sudah lebih dekat daripada yang di
// belakang, sehingga jalannya benar-benar terbaca MENIKUNG masuk menyatu
// dengan rel dari kejauhan. Seluruh peralihan itu selesai jauh di luar tapak
// pandang kamera (tepi +z yang terlihat hanya ~118 unit), jadi yang dilihat
// player adalah jalan yang merapat, bukan jalan yang lahir mendadak.
//
// Pool berdiri SENDIRI (bukan anak `buildTrainJourneyScenery`) supaya cap mesh
// TrainSceneryPool tetap mengukur lanskap perjalanan saja.
export const HIGHWAY_MODULES = 16;
export const HIGHWAY_MODULE_LEN = 84;
export const HIGHWAY_LANE_W = 17.5;
export const HIGHWAY_LANES = 2;
export const HIGHWAY_HALF_W = HIGHWAY_LANE_W * HIGHWAY_LANES / 2;
// Lajur ke-i relatif sumbu jalan. Dua lajur searah; keduanya menyusul kereta.
export const highwayLaneOffset = i =>
    ((Math.max(0, Math.min(HIGHWAY_LANES - 1, i | 0))) - (HIGHWAY_LANES - 1) / 2) * HIGHWAY_LANE_W;

export function buildJourneyHighway(baseX, baseZ = 0) {
    const M = mats();
    const group = new THREE.Group();
    const modules = [];
    const L = HIGHWAY_MODULE_LEN, HW = HIGHWAY_HALF_W;
    const span = HIGHWAY_MODULES * L;
    // Pagar + tiang lampu sengaja SELALU di sisi rel (-z jalan) = sisi JAUH dari
    // kamera, jadi tak satu pun dari keduanya dapat menutupi kendaraan di jalan.
    const railZ = -(HW + 6), lampZ = -(HW + 12);
    for (let i = 0; i < HIGHWAY_MODULES; i++) {
        const g = new THREE.Group();
        // PANJANG SAMBUNGAN: aspal TEPAT `L` supaya ujung modul jatuh persis di
        // ujung modul berikutnya setelah `scale.x` busur diterapkan — tumpang
        // tindih aspal akan membuat z-fighting pada bidang datar yang sebidang.
        // Bahu jalan sengaja LEBIH PANJANG dan lebih rendah: ia yang menutup
        // celah rambut di sambungan, bukan aspalnya.
        mesh(g, new THREE.BoxGeometry(L + 6, 0.5, HW * 2 + 22), M.earth, 0, -0.65, 0, 0, 0, 0, false);
        mesh(g, new THREE.BoxGeometry(L, 0.7, HW * 2), M.ink, 0, -0.25, 0, 0, 0, 0, false);
        mesh(g, new THREE.BoxGeometry(L * 0.42, 0.12, 0.75), M.white, 0, 0.2, 0, 0, 0, 0, false);
        mesh(g, new THREE.BoxGeometry(L + 1.2, 0.9, 0.6), M.steel, 0, 4.6, railZ, 0, 0, 0, false);
        for (const x of [-L / 4, L / 4])
            mesh(g, new THREE.BoxGeometry(0.7, 6.2, 0.7), M.steel, x, 2.4, railZ, 0, 0, 0, false);
        if (i % 4 === 0) {
            mesh(g, new THREE.BoxGeometry(1.5, 22, 1.5), M.steel, 0, 11, lampZ, 0, 0, 0, false);
            mesh(g, new THREE.BoxGeometry(3.4, 1.1, 3.4), M.amber, 0, 22, lampZ, 0, 0, 0, false);
        }
        g.position.set(baseX - span * 0.55 + i * L, 0, baseZ);
        g.visible = false; group.add(g); modules.push(g);
    }
    group.visible = false;
    return { group, baseX, baseZ, modules, span, active: false, travel: 0, offset: 0, slope: 0 };
}

export function resetJourneyHighway(highway) {
    if (!highway) return;
    highway.active = false; highway.travel = 0; highway.offset = 0; highway.slope = 0;
    highway.group.visible = false;
    for (let i = 0; i < highway.modules.length; i++) {
        const g = highway.modules[i];
        g.position.x = highway.baseX - highway.span * 0.55 + i * HIGHWAY_MODULE_LEN;
        g.position.z = highway.baseZ;
        g.rotation.y = 0; g.scale.x = 1;
        g.visible = false;
    }
}

// `offsetForX(worldX)` = jarak lateral jalan pada koordinat dunia itu, relatif
// `baseZ`. Scene yang memilikinya (stage 5) yang memegang kurva penyatuan.
//
// JALAN HARUS MENYAMBUNG MULUS (perbaikan 2026-08-08, laporan user "kenapa
// jalannya patah-patah?"). Versi pertama hanya menggeser `position.z` tiap
// modul: tiap batang aspal 84 unit tetap SEJAJAR sumbu x sementara sumbu
// jalannya menyimpang belasan unit antar-modul, jadi yang tergambar adalah
// tangga bergerigi, bukan tikungan. Sekarang tiap modul DIPUTAR mengikuti
// GARIS SINGGUNG kurva dan DIPANJANGKAN sepanjang busurnya:
//   m       = kemiringan lateral dz/dx pada titik pusat modul
//   yaw     = -atan(m)                 (rotasi Y: local +x -> world (cos, -sin))
//   scale.x = sqrt(1 + m*m)            (panjang BUSUR antar-pusat, bukan proyeksi x)
// Dengan begitu ujung modul ke-i jatuh PERSIS di ujung modul ke-i+1 (keduanya
// di (cx + L/2, cz + L*m/2) hingga orde pertama), sehingga sambungannya rapat
// tanpa celah dan tanpa tumpang-tindih yang membuat z-fighting.
const HW_SLOPE_H = 4;                                    // beda-tengah kemiringan
export function updateJourneyHighway(highway, dt, speed, active, offsetForX) {
    if (!highway) return;
    highway.active = !!active;
    highway.group.visible = highway.active;
    if (!highway.active) return;
    highway.travel += Math.max(0, speed) * dt;
    const left = highway.baseX - highway.span * 0.55, right = highway.baseX + highway.span * 0.45;
    const dx = Math.max(0, speed) * dt;
    for (const g of highway.modules) {
        g.position.x -= dx;
        while (g.position.x < left) g.position.x += highway.span;
        while (g.position.x > right) g.position.x -= highway.span;
        const x = g.position.x;
        const m = (offsetForX(x + HW_SLOPE_H) - offsetForX(x - HW_SLOPE_H)) / (2 * HW_SLOPE_H);
        g.position.z = highway.baseZ + offsetForX(x);
        g.rotation.y = -Math.atan(m);
        g.scale.x = Math.sqrt(1 + m * m);
        g.visible = true;
    }
    highway.offset = offsetForX(highway.baseX);
    highway.slope = (offsetForX(highway.baseX + HW_SLOPE_H)
        - offsetForX(highway.baseX - HW_SLOPE_H)) / (2 * HW_SLOPE_H);
}

export function journeyHighwayDebug(highway) {
    return {
        active: !!highway?.active, visible: !!highway?.group?.visible,
        modules: highway?.modules?.length || 0, moduleLen: HIGHWAY_MODULE_LEN,
        travel: highway?.travel || 0, offset: highway?.offset || 0,
        slope: highway?.slope || 0,
        laneW: HIGHWAY_LANE_W, lanes: HIGHWAY_LANES, halfWidth: HIGHWAY_HALF_W,
        // Sambungan modul diuji dari transform HIDUP: pusat, yaw, dan rentang
        // busur. Kalau salah satunya lepas, jalannya kembali patah-patah.
        segments: highway?.modules?.map(g => ({
            x: g.position.x, z: g.position.z, yaw: g.rotation.y, scaleX: g.scale.x,
        })) || [],
    };
}

// BIAYA NYATA POOL LANSKAP. `raw` = jumlah mesh mentah (itu yang dilihat harness
// headless, karena `canMerge()` false di sana sehingga pengelasan dilewati);
// `welded` = jumlah mesh yang benar-benar digambar di browser, yakni satu mesh
// per MATERIAL per grup yang dilas. Padatnya isi lanskap boleh naik berlipat
// selama `welded` tetap kecil — itu ukuran draw call yang sesungguhnya.
export function journeySceneryDebug(journey) {
    if (!journey) return null;
    const raw = g => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; };
    const keys = g => {
        const s = new Set();
        g.traverse(o => { if (o.isMesh && o.material) s.add(materialKey(o.material)); });
        return s.size;
    };
    // Modul mid/far mengelas TIAP VARIAN terpisah (kota vs pegunungan), jadi
    // biayanya = jumlah material berbeda pada masing-masing varian.
    const weld = g => {
        const v = [g.userData.mainG, g.userData.fgG,
            g.userData.cityG, g.userData.hillG, g.userData.ridgeG, g.userData.skyG]
            .filter(Boolean);
        return v.length ? v.reduce((n, x) => n + keys(x), 0) : keys(g);
    };
    const sum = (arr, f) => arr.reduce((n, g) => n + f(g), 0);
    return {
        raw: sum(journey.near, raw) + sum(journey.mid, raw) + sum(journey.far, raw),
        welded: sum(journey.near, weld) + sum(journey.mid, weld) + sum(journey.far, weld),
        near: journey.near.length, mid: journey.mid.length, far: journey.far.length,
        nearRaw: sum(journey.near, raw), midRaw: sum(journey.mid, raw), farRaw: sum(journey.far, raw),
    };
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
        // Babak lanskap yang DITUJU + berapa modul yang sudah mengambilnya.
        // Selama peralihan, midCity dan midHill sengaja sama-sama > 0.
        act: journey?.act || 'city',
        blend: journey?.blend ?? 0,
        // Pita depan sisi kamera yang masih menyala (dipadamkan saat jalan
        // raya menyatu — lihat `setJourneyForeground`).
        fgVisible: journey?.near?.filter(g => g.userData.fgG?.visible).length || 0,
        roadOn: !!journey?.roadOn,
        // Set lanskap yang sedang tampil: kota vs pegunungan Jawa Barat.
        midCity: journey?.mid?.filter(g => g.visible && g.userData.cityG?.visible).length || 0,
        midHill: journey?.mid?.filter(g => g.visible && g.userData.hillG?.visible).length || 0,
        farSky: journey?.far?.filter(g => g.userData.skyG?.visible).length || 0,
        farRidge: journey?.far?.filter(g => g.userData.ridgeG?.visible).length || 0,
        wheelPhase: train?.wheelPhase || 0,
        doors: train?.doors?.map(d => ({ open: d.open, target: d.target })) || [],
    };
}
