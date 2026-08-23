// Detailed Stage 10 Chapter 1 port cranes and three-state container layout.
// Collision records are the same objects mutated alongside visible containers.

import { addMergedStatic } from '../../../../utils/meshBatch.js';
import { registerOccluder } from '../../utility/occlusion.js';

function box(parent, material, sx, sy, sz, x, y, z, shadow = true) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    part.position.set(x, y, z);
    part.castShadow = shadow;
    part.receiveShadow = true;
    parent.add(part);
    return part;
}

function cylinder(parent, material, radius, length, x, y, z, axis = 'y', radial = 10) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radial), material);
    part.position.set(x, y, z);
    if (axis === 'x') part.rotation.z = Math.PI * 0.5;
    if (axis === 'z') part.rotation.x = Math.PI * 0.5;
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
}

function diagonal(parent, material, x, y, z, height, direction) {
    const brace = box(parent, material, 1, height * 1.42, 1, x, y, z);
    brace.rotation.z = direction * Math.PI * 0.25;
    return brace;
}

function buildRTG(staticRoot, dynamicRoot, M, x, z, id) {
    const width = 52, length = 34, height = 55;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const lx = x + sx * width * 0.5, lz = z + sz * length * 0.5;
        box(staticRoot, M.crane, 4.5, height, 4.5, lx, height * 0.5, lz);
        box(staticRoot, M.frame, 8, 2, 8, lx, 2, lz);
        for (const wz of [-2.6, 2.6])
            cylinder(staticRoot, M.rubber, 2, 1.2, lx, 1.5, lz + wz, 'z', 12);
    }
    box(staticRoot, M.crane, width + 10, 5, 5, x, height, z - length * 0.5);
    box(staticRoot, M.crane, width + 10, 5, 5, x, height, z + length * 0.5);
    box(staticRoot, M.frame, width, 2, length + 4, x, height - 3, z);
    for (const sz of [-1, 1]) for (const sx of [-1, 1])
        diagonal(staticRoot, M.frame, x + sx * 14, 30, z + sz * length * 0.5, 31, sx);
    // Ladder, maintenance deck, handrail and operator cabin.
    box(staticRoot, M.deck, width + 3, 1.2, 7, x, height - 8, z - length * 0.5);
    for (let rx = -width * 0.5; rx <= width * 0.5; rx += 6)
        box(staticRoot, M.frame, 0.45, 4, 0.45, x + rx, height - 5.7, z - length * 0.5 - 3);
    box(staticRoot, M.frame, width + 2, 0.45, 0.45, x, height - 4, z - length * 0.5 - 3);
    for (let ry = 7; ry <= height - 12; ry += 5)
        box(staticRoot, M.frame, 4, 0.45, 0.45, x - width * 0.5 - 2, ry, z - length * 0.5);
    box(staticRoot, M.cabin, 10, 8, 8, x - 14, height - 13, z - length * 0.5 - 1);
    box(staticRoot, M.glass, 8, 4, 0.4, x - 14, height - 12, z - length * 0.5 - 5.1);
    box(staticRoot, M.hazard, 12, 1, 8.5, x - 14, height - 17, z - length * 0.5 - 1);

    const trolley = new THREE.Group();
    trolley.name = `rtg-${id}-trolley`;
    trolley.position.set(x, height - 7, z);
    dynamicRoot.add(trolley);
    box(trolley, M.frame, 13, 4, 10, 0, 0, 0);
    for (const px of [-5, 5]) for (const pz of [-4, 4])
        cylinder(trolley, M.rubber, 1.25, 1.1, px, 2, pz, 'z', 10);
    const cableA = cylinder(trolley, M.cable, 0.22, 34, -4, -18, -3, 'y', 8);
    const cableB = cylinder(trolley, M.cable, 0.22, 34, 4, -18, 3, 'y', 8);
    const spreader = box(trolley, M.hazard, 24, 1.8, 8, 0, -35, 0);
    return { id, type: 'RTG', trolley, cables: [cableA, cableB], spreader, baseX: x, baseZ: z };
}

function buildQCC(staticRoot, dynamicRoot, M, x, z) {
    const rail = 62, height = 82;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const px = x + sx * rail * 0.5, pz = z + sz * 18;
        box(staticRoot, M.crane, 6, height, 6, px, height * 0.5, pz);
        box(staticRoot, M.frame, 12, 3, 10, px, 2, pz);
        for (const dz of [-3.5, 3.5])
            cylinder(staticRoot, M.rubber, 2.2, 1.5, px, 1.8, pz + dz, 'z', 12);
    }
    box(staticRoot, M.crane, rail + 12, 7, 7, x, height, z);
    box(staticRoot, M.deck, rail + 8, 1.2, 12, x, height - 7, z);
    for (const sx of [-1, 1]) {
        diagonal(staticRoot, M.frame, x + sx * 17, 47, z - 18, 51, sx);
        diagonal(staticRoot, M.frame, x + sx * 17, 47, z + 18, 51, sx);
    }
    // Lattice sea boom: twin chords plus repeated triangular webbing.
    const boomCenterX = x + 69;
    box(staticRoot, M.crane, 118, 4, 4, boomCenterX, height + 5, z - 6);
    box(staticRoot, M.crane, 118, 4, 4, boomCenterX, height + 5, z + 6);
    box(staticRoot, M.frame, 118, 2, 2, boomCenterX, height - 4, z - 6);
    box(staticRoot, M.frame, 118, 2, 2, boomCenterX, height - 4, z + 6);
    for (let px = x + 14; px <= x + 124; px += 11) {
        const braceA = box(staticRoot, M.frame, 1, 14, 1, px, height, z - 6);
        braceA.rotation.z = ((px / 11) | 0) % 2 ? 0.65 : -0.65;
        const braceB = box(staticRoot, M.frame, 1, 14, 1, px, height, z + 6);
        braceB.rotation.z = braceA.rotation.z;
    }
    // Backstay and machine house distinguish the QCC silhouette from RTGs.
    const backstayA = box(staticRoot, M.frame, 4, 104, 4, x - 24, 96, z - 8);
    backstayA.rotation.z = -0.42;
    const backstayB = box(staticRoot, M.frame, 4, 104, 4, x - 24, 96, z + 8);
    backstayB.rotation.z = -0.42;
    box(staticRoot, M.cabin, 28, 17, 25, x - 17, height + 11, z);
    box(staticRoot, M.glass, 16, 5, 0.5, x - 2.8, height + 12, z);
    box(staticRoot, M.hazard, 30, 1.3, 26, x - 17, height + 2, z);

    const trolley = new THREE.Group();
    trolley.name = 'qcc-sea-trolley';
    trolley.position.set(x + 76, height + 2, z);
    dynamicRoot.add(trolley);
    box(trolley, M.frame, 15, 5, 13, 0, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
        cylinder(trolley, M.rubber, 1.4, 1.1, sx * 5, 2.6, sz * 5, 'z', 10);
    cylinder(trolley, M.cable, 0.25, 62, -5, -32, -4, 'y', 8);
    cylinder(trolley, M.cable, 0.25, 62, 5, -32, 4, 'y', 8);
    box(trolley, M.hazard, 25, 2, 9, 0, -63, 0);
    return { id: 'qcc', type: 'QCC', trolley, baseX: x, baseZ: z };
}

function buildMovingContainer(parent, M, id) {
    const group = new THREE.Group();
    group.name = `crane-moving-container-${id}`;
    parent.add(group);
    box(group, M.container[id % M.container.length], 24, 10, 9, 0, 5, 0);
    for (let x = -10.5; x <= 10.5; x += 3)
        box(group, M.rib, 0.45, 8.5, 0.35, x, 5, -4.65, false);
    for (let x = -10.5; x <= 10.5; x += 3)
        box(group, M.rib, 0.45, 8.5, 0.35, x, 5, 4.65, false);
    for (const z of [-3.2, 0, 3.2]) box(group, M.rib, 0.45, 8.4, 0.45, 12.2, 5, z, false);
    box(group, M.rib, 0.55, 9, 9.5, -12.15, 5, 0, false);
    box(group, M.white, 3.2, 1.8, 0.2, 7.5, 3.2, -4.9, false);
    return group;
}

function syncBlocker(item) {
    const blocker = item.blocker;
    blocker.x = item.group.position.x;
    blocker.z = item.group.position.z;
    blocker.top = item.group.position.y + 10;
    const yaw = item.group.rotation.y;
    blocker.axx = Math.cos(yaw);
    blocker.axz = Math.sin(yaw);
    blocker.azx = -Math.sin(yaw);
    blocker.azz = Math.cos(yaw);
    blocker.active = item.group.position.y <= 8;
}

function setItemTransform(item, state) {
    const t = item[state];
    item.group.position.set(t.x, t.y, t.z);
    item.group.rotation.y = t.yaw;
    syncBlocker(item);
}

export function buildPortCranes(parent, M, origin, makeDynamicBlocker) {
    const staticRoot = new THREE.Group();
    const dynamicRoot = new THREE.Group();
    parent.add(dynamicRoot);

    const rtgs = [
        buildRTG(staticRoot, dynamicRoot, M, origin.x - 325, origin.z - 12, 'west'),
        buildRTG(staticRoot, dynamicRoot, M, origin.x - 120, origin.z + 18, 'east'),
    ];
    const qcc = buildQCC(staticRoot, dynamicRoot, M, origin.x + 535, origin.z - 218);

    const transforms = [
        {
            A: { x: origin.x - 410, y: 0, z: -72, yaw: 0 },
            B: { x: origin.x - 300, y: 0, z: 48, yaw: Math.PI * 0.5 },
        },
        {
            A: { x: origin.x - 285, y: 0, z: 26, yaw: Math.PI * 0.5 },
            B: { x: origin.x - 175, y: 0, z: -82, yaw: 0 },
        },
        {
            A: { x: origin.x - 165, y: 0, z: -68, yaw: 0 },
            B: { x: origin.x - 82, y: 0, z: 70, yaw: Math.PI * 0.5 },
        },
    ];
    const containers = transforms.map((layout, index) => {
        const group = buildMovingContainer(dynamicRoot, M, index);
        const blocker = makeDynamicBlocker(layout.A.x, layout.A.z, 12, 4.5, 10,
            layout.A.yaw, `moving-container-${index + 1}`);
        // Peti kemas yang DIPINDAH crane ikut memudar; ia bergerak, jadi
        // posisinya dibaca ulang tiap frame (`dynamic`).
        registerOccluder('campaign-10-port', group, { radius: 13, top: 10, dynamic: true });
        return { id: index + 1, group, blocker, ...layout };
    });

    const staticBatch = addMergedStatic(parent, [staticRoot]);
    const system = {
        root: dynamicRoot, rtgs, qcc, containers, staticBatch,
        state: 'A', progress: 0, settled: true,
    };
    setCraneLayout(system, 'A');
    return system;
}

export function setCraneLayout(system, state) {
    const target = state === 'B' ? 'B' : 'A';
    for (const item of system.containers) setItemTransform(item, target);
    system.state = target;
    system.progress = target === 'B' ? 1 : 0;
    system.settled = true;
    for (let i = 0; i < system.rtgs.length; i++) {
        const item = system.containers[Math.min(i, system.containers.length - 1)];
        system.rtgs[i].trolley.position.x = item.group.position.x;
    }
}

export function beginCraneShift(system) {
    setCraneLayout(system, 'A');
    system.state = 'transition';
    system.settled = false;
}

export function updateCraneShift(system, progress) {
    const p = Math.max(0, Math.min(1, progress));
    system.state = p >= 1 ? 'B' : 'transition';
    system.progress = p;
    for (let i = 0; i < system.containers.length; i++) {
        const item = system.containers[i];
        let travel;
        if (p < 0.25) {
            const k = p / 0.25;
            travel = 0;
            item.group.position.y = k * 40;
        } else if (p < 0.75) {
            travel = (p - 0.25) / 0.5;
            item.group.position.y = 40;
        } else {
            travel = 1;
            item.group.position.y = (1 - (p - 0.75) / 0.25) * 40;
        }
        item.group.position.x = item.A.x + (item.B.x - item.A.x) * travel;
        item.group.position.z = item.A.z + (item.B.z - item.A.z) * travel;
        item.group.rotation.y = item.A.yaw + (item.B.yaw - item.A.yaw) * travel;
        syncBlocker(item);

        const crane = system.rtgs[i % system.rtgs.length];
        crane.trolley.position.x = item.group.position.x;
        crane.trolley.position.z = crane.baseZ;
        crane.spreader.position.y = item.group.position.y - crane.trolley.position.y + 11;
        for (const cable of crane.cables) {
            const distance = Math.max(2, crane.trolley.position.y - item.group.position.y - 11);
            cable.scale.y = distance / 34;
            cable.position.y = -distance * 0.5;
        }
    }
    if (p >= 1) setCraneLayout(system, 'B');
}

export function cranePathWalkable(system, x, z, radius = 0) {
    return !system.containers.some((item) => {
        const b = item.blocker;
        if (!b.active) return false;
        const dx = x - b.x, dz = z - b.z;
        const lx = dx * b.axx + dz * b.axz;
        const lz = dx * b.azx + dz * b.azz;
        return Math.abs(lx) <= b.hx + radius && Math.abs(lz) <= b.hz + radius;
    });
}

export function craneDebug(system) {
    return {
        state: system.state,
        progress: system.progress,
        settled: system.settled,
        rtgCount: system.rtgs.length,
        qccCount: system.qcc ? 1 : 0,
        staticBatches: system.staticBatch.length,
        containers: system.containers.map((item) => ({
            id: item.id,
            position: { x: item.group.position.x, y: item.group.position.y, z: item.group.position.z },
            yaw: item.group.rotation.y,
            blocker: {
                x: item.blocker.x, z: item.blocker.z,
                // Yaw collider diturunkan dari sumbunya: uji asap membandingkan
                // footprint TERPUTAR dengan geometri yang terlihat.
                yaw: Math.atan2(item.blocker.axz, item.blocker.axx),
                active: item.blocker.active, hx: item.blocker.hx, hz: item.blocker.hz,
            },
            colliderSynced: Math.abs(item.blocker.x - item.group.position.x) < 1e-6
                && Math.abs(item.blocker.z - item.group.position.z) < 1e-6,
        })),
    };
}
