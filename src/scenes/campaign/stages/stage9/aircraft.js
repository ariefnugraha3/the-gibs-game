import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { mergeObjectInPlace } from '../../../../utils/meshBatch.js';

function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
}

function box(parent, material, sx, sy, sz, x, y, z) {
    return mesh(new THREE.BoxGeometry(sx, sy, sz), material, parent, x, y, z);
}

function cylinder(parent, material, radius, length, x, y, z, axis = 'x', radial = 14) {
    const part = mesh(new THREE.CylinderGeometry(radius, radius, length, radial), material, parent, x, y, z);
    if (axis === 'x') part.rotation.z = Math.PI * 0.5;
    if (axis === 'z') part.rotation.x = Math.PI * 0.5;
    return part;
}

function buildFan(materials, x, y, z) {
    const fan = new THREE.Group();
    fan.position.set(x, y, z);
    cylinder(fan, materials.dark, 1.05, 0.5, 0, 0, 0, 'x', 16);
    cylinder(fan, materials.metal, 0.25, 0.74, 0, 0, 0, 'x', 12);
    for (let i = 0; i < 10; i++) {
        const blade = box(fan, materials.metal, 0.18, 1.46, 0.15, -0.4, 0, 0);
        blade.rotation.x = i * Math.PI / 5;
    }
    return fan;
}

function buildEngine(materials, z) {
    const engine = new THREE.Group();
    engine.position.set(3.5, 9.5, z);
    cylinder(engine, materials.engine, 2.15, 6.2, 0, 0, 0, 'x', 18);
    cylinder(engine, materials.dark, 1.68, 0.75, 3.05, 0, 0, 'x', 18);
    cylinder(engine, materials.dark, 1.58, 0.7, -3.08, 0, 0, 'x', 18);
    const stripe = cylinder(engine, materials.warning, 2.18, 0.24, 0.65, 0, 0, 'x', 18);
    const fan = buildFan(materials, 2.9, 0, 0);
    engine.add(fan);
    const exhaust = cylinder(engine, materials.exhaust, 1.18, 1.15, -3.55, 0, 0, 'x', 16);
    exhaust.material = materials.exhaust;
    return { group: engine, fan, exhaust, stripe, lateral: z };
}

function buildLandingGear(parent, materials, x, z, paired = true) {
    const strut = cylinder(parent, materials.metal, 0.22, 3.2, x, 3.3, z, 'y', 10);
    strut.rotation.z = 0.08;
    const wheels = [];
    const offsets = paired ? [-0.62, 0.62] : [0];
    for (const dz of offsets) {
        const wheel = cylinder(parent, materials.tire, 0.76, 0.48, x, 1.85, z + dz, 'z', 12);
        wheels.push(wheel);
    }
    return { strut, wheels };
}

/**
 * Builds the Stage 9 hero aircraft. The model deliberately stays mesh-based so
 * its fans, ramp, landing gear and control surfaces can animate independently.
 */
export function buildFourEngineTransport() {
    const materials = {
        body: new THREE.MeshStandardMaterial({ color: PAL.concrete, roughness: 0.72, metalness: 0.2 }),
        lower: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.78, metalness: 0.25 }),
        dark: new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.55, metalness: 0.55 }),
        metal: new THREE.MeshStandardMaterial({ color: PAL.steel, roughness: 0.38, metalness: 0.7 }),
        engine: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.52, metalness: 0.52 }),
        glass: new THREE.MeshStandardMaterial({ color: PAL.screenBg, roughness: 0.2, metalness: 0.25, emissive: PAL.techDim, emissiveIntensity: 0.45 }),
        warning: new THREE.MeshStandardMaterial({ color: PAL.amber, roughness: 0.5, metalness: 0.2 }),
        red: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.58, metalness: 0.15 }),
        tire: new THREE.MeshStandardMaterial({ color: PAL.rubber, roughness: 0.94 }),
        exhaust: new THREE.MeshStandardMaterial({ color: PAL.amber, roughness: 0.2, transparent: true, opacity: 0.05, emissive: PAL.amberDim, emissiveIntensity: 0.1 }),
    };

    const group = new THREE.Group();
    group.name = 'stage9-four-engine-heavy-transport';

    let fuselage = new THREE.Group();
    cylinder(fuselage, materials.body, 4.8, 35, 0, 9, 0, 'x', 20);
    cylinder(fuselage, materials.lower, 4.25, 24, -4.8, 7.7, 0, 'x', 18);
    const nose = mesh(new THREE.SphereGeometry(4.76, 18, 12), materials.body, fuselage, 17.35, 9, 0);
    nose.scale.set(1.35, 0.98, 0.98);
    const tailCone = mesh(new THREE.ConeGeometry(4.62, 12, 18), materials.body, fuselage, -23, 9, 0);
    tailCone.rotation.z = -Math.PI * 0.5;

    // Cockpit glazing and sensor/radar details.
    for (const z of [-2.15, -0.75, 0.75, 2.15]) {
        const pane = box(fuselage, materials.glass, 0.28, 1.15, 1.02, 20.95, 10.65, z);
        pane.rotation.z = -0.22;
    }
    cylinder(fuselage, materials.dark, 0.38, 1.3, 21.4, 7.7, 0, 'x', 10);
    box(fuselage, materials.red, 13, 0.28, 0.18, 5.5, 8.3, -4.73);
    box(fuselage, materials.red, 13, 0.28, 0.18, 5.5, 8.3, 4.73);
    for (const z of [-4.74, 4.74]) {
        for (let x = -10; x <= 12; x += 3.2) {
            box(fuselage, materials.dark, 0.7, 0.7, 0.16, x, 10.6, z);
        }
    }
    // Cargo-door ribs make the rear silhouette readable at gameplay distance.
    for (let x = -16; x <= -9; x += 1.75) {
        box(fuselage, materials.metal, 0.16, 6.1, 0.18, x, 8.7, -4.73);
        box(fuselage, materials.metal, 0.16, 6.1, 0.18, x, 8.7, 4.73);
    }
    // The authored shell is welded separately from fans/ramp/gear/control
    // surfaces, so the hero silhouette stays detailed without per-part draws.
    fuselage = mergeObjectInPlace(fuselage);
    fuselage.name = 'welded-static-fuselage-shell';
    group.add(fuselage);

    // High wing with layered spars, flaps and a central carry-through box.
    box(group, materials.body, 18, 1.3, 45, 1.5, 12.5, 0);
    box(group, materials.lower, 12, 0.42, 52, 0, 11.75, 0);
    box(group, materials.metal, 4, 0.38, 51, -2.4, 12.15, 0);
    const leftFlap = box(group, materials.dark, 6.5, 0.34, 11, -3, 11.8, -18.5);
    const rightFlap = box(group, materials.dark, 6.5, 0.34, 11, -3, 11.8, 18.5);
    const leftAileron = box(group, materials.warning, 5, 0.28, 4.5, -4.7, 11.7, -25.2);
    const rightAileron = box(group, materials.warning, 5, 0.28, 4.5, -4.7, 11.7, 25.2);

    // Tail plane and vertical stabilizer.
    box(group, materials.body, 7.8, 0.72, 20, -17.6, 14.2, 0);
    box(group, materials.dark, 2.8, 0.3, 19.5, -21.5, 14, 0);
    const fin = box(group, materials.body, 9.6, 10.5, 1.05, -17.8, 18, 0);
    fin.rotation.z = -0.26;
    const rudder = box(group, materials.red, 3.8, 8, 0.32, -22.2, 19.1, 0);
    rudder.rotation.z = -0.26;

    const engines = [-17.2, -8.8, 8.8, 17.2].map((z) => {
        const engine = buildEngine(materials, z);
        group.add(engine.group);
        box(group, materials.body, 3.8, 1.1, 1.25, 3.3, 12, z);
        return engine;
    });

    const gear = [
        buildLandingGear(group, materials, 13.3, 0, false),
        buildLandingGear(group, materials, -7.5, -3.2, true),
        buildLandingGear(group, materials, -7.5, 3.2, true),
    ];

    const rampPivot = new THREE.Group();
    rampPivot.position.set(-17.2, 6.5, 0);
    group.add(rampPivot);
    const ramp = box(rampPivot, materials.lower, 8.7, 0.75, 8.4, -3.6, -2.2, 0);
    ramp.rotation.z = -0.54;
    for (const z of [-3.1, -1.05, 1.05, 3.1]) {
        const rail = box(rampPivot, materials.warning, 7.6, 0.16, 0.16, -3.7, -1.72, z);
        rail.rotation.z = -0.54;
    }
    const cargoBay = box(group, materials.dark, 3.2, 3.2, 2.8, -12.5, 7.5, -4.76);

    group.userData.transport = {
        engines,
        gear,
        rampPivot,
        ramp,
        cargoBay,
        controlSurfaces: [leftFlap, rightFlap, leftAileron, rightAileron, rudder],
        staticHullWelded: true,
        partCensus: {
            fuselage: 1, nose: 1, tailCone: 1, cockpitPanes: 4,
            highWing: 1, engineNacelles: 4, engineFans: 4,
            landingGearAssemblies: 3, cargoRamp: 1, cargoInterior: 1,
            controlSurfaces: 5,
        },
        basePosition: new THREE.Vector3(),
        fanAngle: 0,
        fuel: 0,
        takeoff: 0,
    };
    return group;
}

export function resetTransport(transport, x, z, yaw = 0) {
    const data = transport.userData.transport;
    transport.visible = true;
    transport.position.set(x, 0, z);
    transport.rotation.set(0, yaw, 0);
    data.basePosition.set(x, 0, z);
    data.fanAngle = 0;
    data.fuel = 0;
    data.takeoff = 0;
    data.rampPivot.rotation.z = 0;
    for (const engine of data.engines) {
        engine.fan.rotation.x = 0;
        engine.exhaust.material.opacity = 0.05;
        engine.exhaust.material.emissiveIntensity = 0.1;
    }
}

export function updateTransport(transport, dt, fuelProgress, takeoffProgress = 0) {
    const data = transport.userData.transport;
    const fuel = Math.max(0, Math.min(1, fuelProgress));
    const takeoff = Math.max(0, Math.min(1, takeoffProgress));
    data.fuel = fuel;
    data.takeoff = takeoff;
    data.fanAngle += dt * (2 + fuel * 36);
    for (const engine of data.engines) {
        engine.fan.rotation.x = data.fanAngle;
        engine.exhaust.material.opacity = 0.05 + fuel * 0.5;
        engine.exhaust.material.emissiveIntensity = 0.1 + fuel * (EMISSIVE_MAX - 0.1);
    }
    data.rampPivot.rotation.z = -fuel * 0.52;
    const flapAngle = takeoff * 0.22;
    data.controlSurfaces[0].rotation.z = flapAngle;
    data.controlSurfaces[1].rotation.z = flapAngle;
    data.controlSurfaces[2].rotation.z = -flapAngle * 0.65;
    data.controlSurfaces[3].rotation.z = -flapAngle * 0.65;
    data.controlSurfaces[4].rotation.y = Math.sin(takeoff * Math.PI) * 0.05;

    const eased = takeoff * takeoff * (3 - 2 * takeoff);
    transport.position.x = data.basePosition.x + eased * 185;
    transport.position.y = Math.max(0, (takeoff - 0.28) * 78);
    transport.rotation.z = -Math.max(0, takeoff - 0.24) * 0.15;
    for (const item of data.gear) {
        item.strut.visible = takeoff < 0.7;
        for (const wheel of item.wheels) wheel.visible = takeoff < 0.7;
    }
}

export function transportDebug(transport) {
    const data = transport.userData.transport;
    return {
        semantic: 'four-engine-heavy-transport',
        engineCount: data.engines.length,
        hasCargoRamp: !!data.ramp,
        hasCargoBay: !!data.cargoBay,
        landingGearAssemblies: data.gear.length,
        independentControlSurfaces: data.controlSurfaces.length,
        staticHullWelded: data.staticHullWelded,
        parts: { ...data.partCensus },
        fuel: data.fuel,
        takeoff: data.takeoff,
    };
}
