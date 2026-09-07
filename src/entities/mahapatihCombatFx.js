// Prebuilt electrical strands and full-body blade choreography. No gameplay
// damage lives here; animation progress comes from the entity attack clock.
import { camera } from '../core/renderer.js';
import { CFG } from '../core/config.js';

const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * ease(t);

export function buildMahapatihCombatFx(parent) {
    const root = new THREE.Group(); root.name = 'Mahapatih-Electric-FX'; parent.add(root);
    const sweep = new THREE.Group(), hit = new THREE.Group(); root.add(sweep); root.add(hit);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const strands = [], sparks = [];
    for (const [group, list, count] of [[sweep, strands, 48], [hit, sparks, 24]]) {
        const material = new THREE.MeshBasicMaterial({ color: 0x91dcff,
            transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
        for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(geometry, material); group.add(m); list.push(m);
        }
    }
    sweep.visible = hit.visible = false;
    return { root, sweep, hit, strands, sparks, hitT: 0, hits: 0 };
}

function segment(m, ax, ay, az, bx, by, bz, width) {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length();
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.scale.set(width, length, width);
    if (length > 0.001) m.quaternion.setFromUnitVectors(up, direction.normalize());
}

export function updateMahapatihElectric(b, dt) {
    const fx = b.combatFx, H = CFG.campaign.bosses.mahapatih.hardline;
    const active = b.phase === 'hardline' && b.transitionT <= 0 && b.sweepState === 'active';
    fx.sweep.visible = active;
    if (active) {
        fx.sweep.position.copy(b.parts.group.position);
        fx.sweep.rotation.y = -b.sweepAngle;
        // Three jagged filaments run along the damage strip, with a white/blue
        // flicker above the floor; no orange blast or projectile is involved.
        for (let i = 0; i < fx.strands.length; i++) {
            const row = Math.floor(i / 16), j = i % 16;
            const x0 = -150 + j * 18.75, x1 = x0 + 18.75;
            const angle = b.sweepAngle + (x0 < 0 ? Math.PI : 0) + b.parts.group.rotation.y;
            const count = b.hardlines.length;
            const sector = ((Math.round((angle - Math.PI / 4) / (Math.PI * 2) * count) % count) + count) % count;
            fx.strands[i].visible = !!b.hardlines[sector]?.alive;
            const wave = n => Math.sin(n * 2.7 + b.hoverT * 36 + row) * (row + 1);
            segment(fx.strands[i], x0, 3 + row * 4 + wave(j), wave(j) * 0.8,
                x1, 3 + row * 4 + wave(j + 1), wave(j + 1) * 0.8, row === 1 ? 0.8 : 0.4);
        }
        fx.strands[0].material.opacity = 0.6 + Math.abs(Math.sin(b.hoverT * 41)) * 0.4;
    }
    fx.hitT = Math.max(0, fx.hitT - dt); fx.hit.visible = fx.hitT > 0;
    if (fx.hit.visible) {
        fx.hit.position.set(camera.position.x, camera.position.y - CFG.player.eyeHeight, camera.position.z);
        for (let i = 0; i < fx.sparks.length; i++) {
            const a = i * Math.PI * 2 / 8 + b.hoverT * 9, row = Math.floor(i / 8);
            const r = 5 + Math.sin(i * 7 + b.hoverT * 55) * 2;
            segment(fx.sparks[i], Math.cos(a) * r, 3 + row * 5, Math.sin(a) * r,
                Math.cos(a + 0.5) * (r + 1), 8 + row * 5, Math.sin(a + 0.5) * (r + 1), 0.65);
        }
        fx.sparks[0].material.opacity = Math.min(1, fx.hitT / H.electricHitSec * 2);
    }
}

export function poseMahapatihBlade(p, state, k, radius) {
    const wind = state === 'bladeTelegraph', first = state === 'bladeFirst';
    const second = state === 'bladeSecond', recover = state === 'bladeRecover';
    const cut = first || second;
    // Coil into a diagonal draw, snap across the body, reverse into a rising
    // cross-cut, then catch the weight. Carrier yaw/collision never rotate.
    const turn = wind ? mix(0, -0.85, k) : first ? mix(-0.85, 1.15, k)
        : second ? mix(1.15, -1.3, k) : mix(-1.3, 0, k);
    p.torso.rotation.y = turn; p.pelvis.rotation.y = turn * 0.23;
    p.torso.rotation.x = wind ? mix(0, -0.22, k) : cut ? Math.sin(k * Math.PI) * 0.3
        : mix(0.08, 0, k);
    p.torso.rotation.z = cut ? Math.sin(k * Math.PI) * (first ? -0.18 : 0.18) : 0;
    p.head.rotation.y = -turn * 0.65;
    p.combat.position.y = 9 + (cut ? Math.sin(k * Math.PI) * (first ? 1.8 : 3.2) : 0);
    for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const t = Math.max(0, Math.min(1, (k - (i ? 0.08 : 0)) / (i ? 0.92 : 1)));
        const shoulder = p.arms[i].shoulder;
        shoulder.rotation.x = wind ? mix(0, -1.8, t) : first ? mix(-1.8, 0.15, t)
            : second ? mix(0.15, -1.45, t) : mix(-1.45, 0, t);
        shoulder.rotation.z = side * (wind ? mix(0, 0.9, t) : first ? mix(0.9, -0.55, t)
            : second ? mix(-0.55, 0.7, t) : mix(0.7, 0, t));
        p.arms[i].arm.rotation.x = cut ? -Math.sin(t * Math.PI) * 0.5 : 0;
        p.blades[i].rotation.set(cut ? -0.9 : wind ? -k * 0.4 : mix(-0.9, 0, k),
            side * turn * 0.3, cut ? side * Math.sin(t * Math.PI) * 0.65 : 0);
        p.legsCombat[i].rotation.x = cut ? side * Math.sin(k * Math.PI) * 0.14 : 0;
        const trail = p.slashTrails[i];
        trail.visible = cut; trail.material.opacity = cut ? Math.sin(t * Math.PI) * 0.95 : 0;
        trail.rotation.set(-Math.PI / 2 + side * 0.45, 0, turn + side * t * Math.PI * 1.5);
        trail.position.y = 12 + i * 5 + (second ? Math.sin(t * Math.PI) * 10 : 0);
        trail.scale.setScalar(radius / 35);
    }
    if (recover && k >= 1) {
        p.pelvis.rotation.y = 0; p.combat.position.y = 9;
        for (const arm of p.arms) arm.arm.rotation.x = 0;
    }
}
