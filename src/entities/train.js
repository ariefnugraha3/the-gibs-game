// Kereta militer otonom Campaign Stage 5 + ilusi perjalanan Jakarta -> Bandung.
// Arena/player/robot TETAP di koordinat dunia; rel dan lanskap dari pool tetap
// bergerak ke belakang. Dengan begitu peluru, loot, nav, dan collision bersama
// tidak perlu mengenal platform bergerak. Seluruh visual procedural, PAL-only.

import { PAL, EMISSIVE_MAX } from '../world/palette.js';

export const TRAIN_CAR_LENGTH = 92;
export const TRAIN_CAR_GAP = 8;
export const TRAIN_CAR_STEP = TRAIN_CAR_LENGTH + TRAIN_CAR_GAP;
export const TRAIN_HALF_WIDTH = 27;
export const TRAIN_CAR_COUNT = 5;

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

function stripe(parent, M, x, z, side) {
    mesh(parent, new THREE.BoxGeometry(54, 1.1, 0.7), M.hazard, x, 7.7, z + side * 0.1);
    mesh(parent, new THREE.BoxGeometry(54, 0.8, 0.78), M.white, x, 9.2, z + side * 0.1);
}

function buildCar(M, i, cx, cz, wheels) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const openDeck = i === 3;
    const loco = i === 4;

    // Deck sengaja y=0: seluruh gameplay tetap pada ground plane standar.
    mesh(g, new THREE.BoxGeometry(TRAIN_CAR_LENGTH, 2.4, TRAIN_HALF_WIDTH * 2), M.body, 0, -1.2, 0);
    mesh(g, new THREE.BoxGeometry(TRAIN_CAR_LENGTH - 5, 0.65, TRAIN_HALF_WIDTH * 2 - 5), M.panel, 0, 0.34, 0);
    mesh(g, new THREE.BoxGeometry(TRAIN_CAR_LENGTH - 8, 2.2, 2.0), M.hazard, 0, 1.2, -TRAIN_HALF_WIDTH + 1.3);
    mesh(g, new THREE.BoxGeometry(TRAIN_CAR_LENGTH - 8, 2.2, 2.0), M.hazard, 0, 1.2, TRAIN_HALF_WIDTH - 1.3);

    // Cutaway: dinding jauh tetap tinggi, sisi dekat kamera rendah agar interior terbaca.
    if (!openDeck) {
        mesh(g, new THREE.BoxGeometry(TRAIN_CAR_LENGTH - 8, 13, 2.2), M.body, 0, 7.1, -TRAIN_HALF_WIDTH + 1.4);
        mesh(g, new THREE.BoxGeometry(TRAIN_CAR_LENGTH - 8, 4.2, 2.2), M.body, 0, 2.5, TRAIN_HALF_WIDTH - 1.4);
        stripe(g, M, 0, -TRAIN_HALF_WIDTH + 2.6, 1);
        // Rusuk atap terbuka menggambar siluet tanpa menutup avatar.
        for (const x of [-34, -12, 12, 34]) {
            mesh(g, new THREE.BoxGeometry(1.5, 13, 1.5), M.steel, x, 7, -TRAIN_HALF_WIDTH + 3.0);
            mesh(g, new THREE.BoxGeometry(1.5, 4, 1.5), M.steel, x, 2.3, TRAIN_HALF_WIDTH - 3.0);
            mesh(g, new THREE.BoxGeometry(1.2, 1.2, TRAIN_HALF_WIDTH * 2 - 6), M.steel, x, 13.1, 0);
        }
    } else {
        for (const z of [-TRAIN_HALF_WIDTH + 2, TRAIN_HALF_WIDTH - 2]) {
            mesh(g, new THREE.BoxGeometry(TRAIN_CAR_LENGTH - 7, 1.0, 1.0), M.steel, 0, 5.4, z);
            for (const x of [-40, -20, 0, 20, 40]) mesh(g, new THREE.BoxGeometry(0.8, 5, 0.8), M.steel, x, 2.8, z);
        }
    }

    // Detail interior berbeda per gerbong, tetap memberi jalur tengah yang luas.
    if (i === 0) {
        for (const x of [-26, 0, 26]) mesh(g, new THREE.BoxGeometry(14, 4, 7), M.ink, x, 2.3, -14);
    } else if (i === 1) {
        for (const x of [-28, 0, 28]) {
            mesh(g, new THREE.BoxGeometry(16, 6, 10), M.earth, x, 3.2, -13);
            mesh(g, new THREE.BoxGeometry(17, 0.8, 11), M.hazard, x, 6.5, -13);
        }
    } else if (i === 2) {
        for (const x of [-27, -9, 9, 27]) {
            mesh(g, new THREE.BoxGeometry(11, 2.2, 6), M.panel, x, 1.5, -15);
            mesh(g, new THREE.BoxGeometry(2, 5, 6), M.steel, x - 4.5, 4, -15);
        }
    } else if (i === 3) {
        for (const x of [-28, 28]) mesh(g, new THREE.BoxGeometry(18, 5, 12), M.ink, x, 2.7, -10);
    } else if (loco) {
        mesh(g, new THREE.BoxGeometry(35, 10, 42), M.body, 18, 5.2, 0);
        mesh(g, new THREE.BoxGeometry(1.0, 7, 27), M.glass, 0, 8.2, 0, 0, 0.22);
        mesh(g, new THREE.BoxGeometry(12, 5, 30), M.panel, -22, 2.8, 0);
        const console = mesh(g, new THREE.BoxGeometry(10, 4, 22), M.ink, 8, 2.3, 0);
        mesh(console, new THREE.BoxGeometry(4, 0.5, 14), M.tech, -5.1, 2.1, 0, 0, 0, 0.15, false);
        // Hidung bertingkat memberi bentuk lokomotif tanpa geometry khusus.
        mesh(g, new THREE.BoxGeometry(16, 7, 44), M.body, 38, 3.8, 0);
        mesh(g, new THREE.BoxGeometry(8, 3, 38), M.hazard, 48, 1.8, 0);
    }

    // Dua bogie/gerbong, empat roda terlihat dari tiap sisi.
    for (const wx of [-29, 29]) for (const wz of [-23, 23]) {
        const w = mesh(g, new THREE.CylinderGeometry(5.5, 5.5, 2.4, 12), M.rubber,
            wx, -4.2, wz, Math.PI / 2, 0, 0);
        wheels.push(w);
        mesh(g, new THREE.CylinderGeometry(2.7, 2.7, 2.6, 10), M.steel,
            wx, -4.2, wz, Math.PI / 2, 0, 0);
    }
    return g;
}

export function buildMilitaryTrainMesh(baseX, baseZ = 0) {
    const M = mats();
    const group = new THREE.Group();
    const cars = [], wheels = [], doors = [];
    for (let i = 0; i < TRAIN_CAR_COUNT; i++) {
        const cx = baseX + i * TRAIN_CAR_STEP;
        const car = buildCar(M, i, cx, baseZ, wheels);
        group.add(car); cars.push(car);
        if (i < TRAIN_CAR_COUNT - 1) {
            // Bulkhead bergerak ke atas saat terbuka; collider dimiliki stage.
            const door = mesh(group, new THREE.BoxGeometry(3, 12, TRAIN_HALF_WIDTH * 2 - 8),
                M.body, cx + TRAIN_CAR_LENGTH / 2 + TRAIN_CAR_GAP / 2, 6, baseZ);
            mesh(door, new THREE.BoxGeometry(3.2, 1.1, 30), M.amber, 0, 1.5, 0, 0, 0, 0, false);
            doors.push({ mesh: door, open: 0, target: 0, closedY: 6 });
        }
    }
    // Coupler antar gerbong.
    for (let i = 0; i < TRAIN_CAR_COUNT - 1; i++) {
        const x = baseX + i * TRAIN_CAR_STEP + TRAIN_CAR_LENGTH / 2 + TRAIN_CAR_GAP / 2;
        mesh(group, new THREE.BoxGeometry(TRAIN_CAR_GAP + 3, 1.2, 7), M.steel, x, -0.2, baseZ);
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
    for (const w of train.wheels) w.rotation.z = 0;
    for (const d of train.doors) {
        d.open = d.target = 0;
        d.mesh.position.y = d.closedY;
    }
}

export function updateTrainVisual(train, dt, speed) {
    if (!train) return;
    train.wheelPhase += dt * Math.max(0, speed) * 0.11;
    for (const w of train.wheels) w.rotation.z = train.wheelPhase;
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
const B_CELL = 16.5, B_WALL_H = 25, B_TRACK_ROW = 17.5, B_COL0 = 12.88;
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
export function buildTrainJourneyScenery(baseX, baseZ = 0) {
    const M = mats();
    const group = new THREE.Group();
    const near = [], mid = [], far = [], tunnel = [], sparks = [];
    const span = 1500;

    for (let i = 0; i < 30; i++) {
        const g = new THREE.Group();
        mesh(g, new THREE.BoxGeometry(14, 0.7, 92), M.earth, 0, -5.5, 0);
        mesh(g, new THREE.BoxGeometry(60, 0.7, 2), M.steel, 0, -4.9, -20);
        mesh(g, new THREE.BoxGeometry(60, 0.7, 2), M.steel, 0, -4.9, 20);
        g.position.set(baseX - 520 + i * 50, 0, baseZ); group.add(g); near.push(g);
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
        mesh(g, new THREE.BoxGeometry(3, 34, 4), M.ink, 0, 12, -39);
        mesh(g, new THREE.BoxGeometry(3, 34, 4), M.ink, 0, 12, 39);
        mesh(g, new THREE.BoxGeometry(3, 4, 82), M.ink, 0, 29, 0);
        mesh(g, new THREE.BoxGeometry(1, 1, 22), M.amber, 0, 22, -25, 0, 0, 0, false);
        g.position.set(baseX - 450 + i * 92, 0, baseZ); group.add(g); tunnel.push(g);
    }

    // Fixed brake-spark pool. Stage 5 only toggles/transforms these meshes;
    // no particles or materials are allocated during arrival.
    for (let i = 0; i < 12; i++) {
        const s = mesh(group, new THREE.BoxGeometry(0.45, 0.45, 4 + (i % 3)), M.amber,
            baseX - 150 + i * 29, -3.8, baseZ + (i % 2 ? 23 : -23), 0, 0, (i % 2 ? 1 : -1) * 0.35, false);
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
