import { PAL, EMISSIVE_MAX } from '../../../../world/palette.js';
import { mergeObjectInPlace } from '../../../../utils/meshBatch.js';
import { buildTurbofan } from '../../utility/turbofan.js';

// The hero aircraft is authored as a compact rig, then scaled once. Keeping the
// outer transform separate preserves Stage 9's boarding/takeoff animation while
// letting the inner rig become Stage 10's future flight craft.
const ORIGINAL_TRANSPORT_SCALE = 3.4;
const SCALE_REDUCTION = 0.25;
const TRANSPORT_SCALE = ORIGINAL_TRANSPORT_SCALE * (1 - SCALE_REDUCTION);
const TAKEOFF_RUN = 560;
const TAKEOFF_CLIMB = 145;
const AIRCRAFT_LENGTH = 56;
const AIRCRAFT_SPAN = 54;
const COWL_RADIUS = 2.15;
const ENGINE_LENGTH = 6.2;
const FAN_BLADES = 12;

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

function buildEngine(materials, z) {
    const engine = new THREE.Group();
    engine.position.set(1.8, 10.8, z);
    // The shared nacelle faces local +z. Rotate it onto the aircraft's +x axis.
    const axis = new THREE.Group();
    axis.rotation.y = Math.PI * 0.5;
    engine.add(axis);
    const nacelle = buildTurbofan(axis, {
        cowl: materials.engine, lip: materials.metal, duct: materials.dark,
        hub: materials.dark, fan: materials.metal, nozzle: materials.dark,
    }, { cowlRadius: COWL_RADIUS, length: ENGINE_LENGTH, blades: FAN_BLADES, radial: 18 });
    const stripe = cylinder(engine, materials.warning, COWL_RADIUS + 0.03, 0.24, 0.65, 0, 0, 'x', 18);
    const exhaust = cylinder(engine, materials.exhaust, 1.18, 1.15, -3.55, 0, 0, 'x', 16);
    return { group: engine, fan: nacelle.fan, exhaust, stripe, lateral: z, nacelle };
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

function buildSweptWing(parent, materials, side) {
    const wing = new THREE.Group();
    wing.position.set(0, 11.75, side * 4.2);
    parent.add(wing);

    // Two overlapping slabs form a cranked, swept planform. The old model used
    // one rectangular bar, so this changes the silhouette at gameplay distance.
    const inner = box(wing, materials.body, 14.5, 1.05, 17.5, -0.4, 0, side * 5.0);
    inner.rotation.y = side * 0.25;
    const outer = box(wing, materials.lower, 9.5, 0.68, 12.0, -3.8, -0.2, side * 14.2);
    outer.rotation.y = side * 0.46;
    const leading = box(wing, materials.metal, 10.8, 0.24, 1.05, 3.3, 0.4, side * 13.0);
    leading.rotation.y = side * 0.36;
    const tip = box(wing, materials.warning, 4.8, 0.34, 1.35, -5.7, -0.08, side * 21.0);
    tip.rotation.y = side * 0.52;
    return wing;
}

function buildWingMachineGun(parent, materials, side, station, x, z) {
    const gun = new THREE.Group();
    gun.name = `wing-machine-gun-${side < 0 ? 'left' : 'right'}-${station}`;
    gun.position.set(x, 9.95, z);
    parent.add(gun);

    const cradle = box(gun, materials.dark, 4.6, 1.15, 1.65, 0, 0, 0);
    cradle.rotation.z = -0.04;
    box(gun, materials.metal, 1.5, 0.32, 1.82, 0.9, 0.42, 0);
    cylinder(gun, materials.gun, 0.2, 5.4, 4.65, -0.03, 0, 'x', 10);
    const muzzle = new THREE.Group();
    muzzle.name = 'muzzle';
    muzzle.position.set(7.38, -0.03, 0);
    gun.add(muzzle);
    cylinder(muzzle, materials.metal, 0.3, 0.34, 0, 0, 0, 'x', 10);
    return { group: gun, muzzle, side, station, type: 'machine-gun' };
}

function buildNoseCannon(parent, materials, side) {
    const cannon = new THREE.Group();
    cannon.name = `nose-cannon-${side < 0 ? 'left' : 'right'}`;
    cannon.position.set(17.4, 7.25, side * 2.45);
    parent.add(cannon);

    box(cannon, materials.lower, 4.7, 1.45, 1.72, 0, 0, 0);
    box(cannon, materials.metal, 1.35, 1.68, 1.94, 1.05, 0, 0);
    cylinder(cannon, materials.gun, 0.34, 7.2, 5.55, 0, 0, 'x', 12);
    cylinder(cannon, materials.dark, 0.48, 1.45, 3.05, 0, 0, 'x', 12);
    const muzzle = new THREE.Group();
    muzzle.name = 'muzzle';
    muzzle.position.set(9.2, 0, 0);
    cannon.add(muzzle);
    cylinder(muzzle, materials.metal, 0.5, 0.48, 0, 0, 0, 'x', 12);
    return { group: cannon, muzzle, side, type: 'cannon' };
}

/**
 * Builds the armed Stage 9 hero aircraft. Weapons are visual hardpoints only;
 * stable muzzle anchors are retained for the planned Stage 10 sky combat.
 */
export function buildArmedHeavyAircraft() {
    const materials = {
        body: new THREE.MeshStandardMaterial({ color: PAL.concrete, roughness: 0.72, metalness: 0.2 }),
        lower: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.78, metalness: 0.25 }),
        dark: new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.55, metalness: 0.55 }),
        gun: new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.32, metalness: 0.78 }),
        metal: new THREE.MeshStandardMaterial({ color: PAL.steel, roughness: 0.38, metalness: 0.7 }),
        engine: new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.52, metalness: 0.52 }),
        glass: new THREE.MeshStandardMaterial({ color: PAL.screenBg, roughness: 0.2, metalness: 0.25, emissive: PAL.techDim, emissiveIntensity: 0.45 }),
        warning: new THREE.MeshStandardMaterial({ color: PAL.amber, roughness: 0.5, metalness: 0.2 }),
        red: new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.58, metalness: 0.15 }),
        tire: new THREE.MeshStandardMaterial({ color: PAL.rubber, roughness: 0.94 }),
        exhaust: new THREE.MeshStandardMaterial({ color: PAL.amber, roughness: 0.2, transparent: true, opacity: 0.05, emissive: PAL.amberDim, emissiveIntensity: 0.1 }),
    };

    const group = new THREE.Group();
    group.name = 'stage9-armed-heavy-aircraft';
    const rig = new THREE.Group();
    rig.scale.setScalar(TRANSPORT_SCALE);
    group.add(rig);

    // Faceted armored fuselage: low keel, broad shoulder, pointed nose and a
    // compact dorsal spine replace the former single cylindrical transport.
    let fuselage = new THREE.Group();
    cylinder(fuselage, materials.body, 4.35, 31, -1.2, 8.7, 0, 'x', 8);
    cylinder(fuselage, materials.lower, 3.85, 29, -2.8, 7.25, 0, 'x', 8);
    box(fuselage, materials.lower, 25, 2.2, 7.4, -1.5, 5.55, 0);
    const shoulder = box(fuselage, materials.body, 19, 2.6, 9.6, 5.7, 9.3, 0);
    shoulder.rotation.z = -0.05;
    const nose = mesh(new THREE.ConeGeometry(4.45, 10.5, 8), materials.body, fuselage, 20.2, 8.35, 0);
    nose.rotation.z = -Math.PI * 0.5;
    const chin = mesh(new THREE.ConeGeometry(3.2, 8.2, 6), materials.lower, fuselage, 18.25, 6.45, 0);
    chin.rotation.z = -Math.PI * 0.5;
    const tailCone = mesh(new THREE.ConeGeometry(4.1, 13.5, 8), materials.lower, fuselage, -21.7, 8.2, 0);
    tailCone.rotation.z = Math.PI * 0.5;
    box(fuselage, materials.dark, 18, 1.05, 2.8, -5.8, 12.1, 0);

    // Low panoramic canopy and separated frames keep the crew deck legible.
    const canopy = mesh(new THREE.SphereGeometry(3.2, 12, 8), materials.glass, fuselage, 13.4, 11.0, 0);
    canopy.scale.set(1.65, 0.56, 1.1);
    for (const z of [-2.5, -0.85, 0.85, 2.5]) {
        const frame = box(fuselage, materials.metal, 0.2, 1.25, 0.16, 14.25, 11.25, z);
        frame.rotation.z = -0.22;
    }
    box(fuselage, materials.red, 13.5, 0.3, 0.18, 1.8, 8.45, -4.38);
    box(fuselage, materials.red, 13.5, 0.3, 0.18, 1.8, 8.45, 4.38);
    for (const z of [-4.4, 4.4]) {
        for (let x = -10; x <= 8; x += 3) box(fuselage, materials.dark, 0.65, 0.55, 0.16, x, 10.1, z);
    }
    for (let x = -15; x <= -9; x += 1.5) {
        box(fuselage, materials.metal, 0.16, 5.3, 0.18, x, 8.0, -4.1);
        box(fuselage, materials.metal, 0.16, 5.3, 0.18, x, 8.0, 4.1);
    }
    fuselage = mergeObjectInPlace(fuselage);
    fuselage.name = 'welded-armored-fuselage-shell';
    rig.add(fuselage);

    // Cranked wings, layered carry-through armor and articulated trailing edge.
    buildSweptWing(rig, materials, -1);
    buildSweptWing(rig, materials, 1);
    box(rig, materials.body, 17, 1.4, 11.5, -0.2, 12.0, 0);
    box(rig, materials.dark, 9.5, 0.36, 43, -6.2, 11.25, 0);
    const leftFlap = box(rig, materials.dark, 6.2, 0.34, 8.5, -7.0, 11.1, -11.5);
    const rightFlap = box(rig, materials.dark, 6.2, 0.34, 8.5, -7.0, 11.1, 11.5);
    leftFlap.rotation.y = -0.24;
    rightFlap.rotation.y = 0.24;
    const leftAileron = box(rig, materials.warning, 4.8, 0.28, 4.2, -8.2, 10.95, -22.2);
    const rightAileron = box(rig, materials.warning, 4.8, 0.28, 4.2, -8.2, 10.95, 22.2);
    leftAileron.rotation.y = -0.46;
    rightAileron.rotation.y = 0.46;

    // Swept tailplane plus twin canted fins create the new gunship tail profile.
    const tailLeft = box(rig, materials.body, 8.5, 0.72, 10.5, -17.1, 13.0, -5.5);
    const tailRight = box(rig, materials.body, 8.5, 0.72, 10.5, -17.1, 13.0, 5.5);
    tailLeft.rotation.y = -0.38;
    tailRight.rotation.y = 0.38;
    const leftFin = box(rig, materials.body, 7.6, 8.8, 0.85, -17.2, 17.0, -3.35);
    const rightFin = box(rig, materials.body, 7.6, 8.8, 0.85, -17.2, 17.0, 3.35);
    leftFin.rotation.set(0.12, 0, -0.31);
    rightFin.rotation.set(-0.12, 0, -0.31);
    const leftRudder = box(rig, materials.red, 2.8, 6.4, 0.28, -20.65, 17.9, -3.8);
    const rightRudder = box(rig, materials.red, 2.8, 6.4, 0.28, -20.65, 17.9, 3.8);
    leftRudder.rotation.z = -0.31;
    rightRudder.rotation.z = -0.31;

    const engines = [-17.0, -9.0, 9.0, 17.0].map((z) => {
        const engine = buildEngine(materials, z);
        rig.add(engine.group);
        const pylon = box(rig, materials.body, 4.4, 1.25, 1.35, 0.2, 12.2, z);
        pylon.rotation.y = z < 0 ? -0.12 : 0.12;
        return engine;
    });

    // Four independent wing guns (two per side) and two heavy forward cannons.
    const wingMachineGuns = [
        buildWingMachineGun(rig, materials, -1, 1, 5.4, -13.1),
        buildWingMachineGun(rig, materials, -1, 2, 1.8, -21.2),
        buildWingMachineGun(rig, materials, 1, 1, 5.4, 13.1),
        buildWingMachineGun(rig, materials, 1, 2, 1.8, 21.2),
    ];
    const noseCannons = [
        buildNoseCannon(rig, materials, -1),
        buildNoseCannon(rig, materials, 1),
    ];

    const gear = [
        buildLandingGear(rig, materials, 13.0, 0, false),
        buildLandingGear(rig, materials, -7.5, -3.0, true),
        buildLandingGear(rig, materials, -7.5, 3.0, true),
    ];

    const rampPivot = new THREE.Group();
    rampPivot.position.set(-16.7, 6.15, 0);
    rig.add(rampPivot);
    const ramp = box(rampPivot, materials.lower, 8.7, 0.75, 7.6, -3.6, -2.2, 0);
    ramp.rotation.z = -0.54;
    for (const z of [-2.8, -0.95, 0.95, 2.8]) {
        const rail = box(rampPivot, materials.warning, 7.6, 0.16, 0.16, -3.7, -1.72, z);
        rail.rotation.z = -0.54;
    }
    const cargoBay = box(rig, materials.dark, 3.2, 3.2, 2.8, -12.2, 7.1, -4.2);

    group.userData.transport = {
        engines,
        gear,
        rampPivot,
        ramp,
        cargoBay,
        controlSurfaces: [leftFlap, rightFlap, leftAileron, rightAileron, leftRudder, rightRudder],
        weapons: { wingMachineGuns, noseCannons, firingEnabled: false },
        staticHullWelded: true,
        engine: {
            type: 'ducted-turbofan',
            cowlRadius: engines[0].nacelle.cowlRadius,
            fanRadius: engines[0].nacelle.fanRadius,
            ducted: engines[0].nacelle.fanRadius < engines[0].nacelle.cowlRadius,
            blades: engines[0].nacelle.blades,
        },
        partCensus: {
            armoredFuselage: 1, pointedNose: 1, panoramicCanopy: 1,
            crankedWingHalves: 2, twinTailFins: 2,
            engineNacelles: 4, engineFans: 4,
            wingMachineGuns: wingMachineGuns.length,
            noseCannons: noseCannons.length,
            weaponMuzzles: wingMachineGuns.length + noseCannons.length,
            landingGearAssemblies: 3, cargoRamp: 1, cargoInterior: 1,
            controlSurfaces: 6,
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
        engine.fan.rotation.z = 0;
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
        engine.fan.rotation.z = data.fanAngle;
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
    data.controlSurfaces[5].rotation.y = -Math.sin(takeoff * Math.PI) * 0.05;

    const eased = takeoff * takeoff * (3 - 2 * takeoff);
    transport.position.x = data.basePosition.x + eased * TAKEOFF_RUN;
    transport.position.y = Math.max(0, (takeoff - 0.28) * TAKEOFF_CLIMB);
    transport.rotation.z = -Math.max(0, takeoff - 0.24) * 0.15;
    for (const item of data.gear) {
        item.strut.visible = takeoff < 0.7;
        for (const wheel of item.wheels) wheel.visible = takeoff < 0.7;
    }
}

export function transportDebug(transport) {
    const data = transport.userData.transport;
    return {
        semantic: 'armed-heavy-aircraft',
        silhouette: 'faceted-gunship-cranked-wing-twin-tail',
        engineCount: data.engines.length,
        hasCargoRamp: !!data.ramp,
        hasCargoBay: !!data.cargoBay,
        landingGearAssemblies: data.gear.length,
        independentControlSurfaces: data.controlSurfaces.length,
        staticHullWelded: data.staticHullWelded,
        engine: { ...data.engine },
        weapons: {
            wingMachineGuns: data.weapons.wingMachineGuns.length,
            leftWingMachineGuns: data.weapons.wingMachineGuns.filter(w => w.side < 0).length,
            rightWingMachineGuns: data.weapons.wingMachineGuns.filter(w => w.side > 0).length,
            noseCannons: data.weapons.noseCannons.length,
            muzzleAnchors: data.weapons.wingMachineGuns.length + data.weapons.noseCannons.length,
            firingEnabled: data.weapons.firingEnabled,
        },
        fanAngle: data.fanAngle,
        fanSpin: data.engines[0].fan.rotation.z,
        scale: TRANSPORT_SCALE,
        scaleReduction: SCALE_REDUCTION,
        lengthUnits: AIRCRAFT_LENGTH * TRANSPORT_SCALE,
        spanUnits: AIRCRAFT_SPAN * TRANSPORT_SCALE,
        parts: { ...data.partCensus },
        fuel: data.fuel,
        takeoff: data.takeoff,
    };
}
