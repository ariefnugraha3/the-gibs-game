// SCENE: Campaign STAGE 3 (final) — "Taman Monas, Malam Hari". MEMAKAI ULANG
// dunia taman survival (survival/world.js — dibangun sekali, dibagi dua scene)
// dgn preset cahaya malam. Robot disebar saat enter() (bukan oleh orkestrator
// stage 1 — penempatan ulang restart tak perlu: restart campaign selalu ke
// stage 1, dan resetGame membuang semua robot lebih dulu). Menang = semua
// robot stage 3 mati -> MISSION COMPLETE.

import { CFG } from '../../core/config.js';
import { player, robots, _v3 } from '../../core/state.js';
import { scene, camera } from '../../core/renderer.js';
import { rand, clamp } from '../../utils/math.js';
import { applyLightPreset } from '../../world/lighting.js';
import { showStageMsg } from '../../core/dom.js';
import { updateUI } from '../../core/hud.js';
import { disposeRobot } from '../../entities/robots.js';
import { NADE_R } from '../../entities/grenades.js';
import { gameOver } from '../../core/game.js';
import {
    PARK, ensureParkWorld, getParkNavSolidFountain,
    resolveObstacles, groundHeightAt
} from '../survival/world.js';
import { spawnCampaignRobot, campaignRobotAI, countStageRobots } from './common.js';
import { stage1Scene } from './stage1.js';

// Titik masuk: gerbang selatan taman, menghadap Monas (-z dari z positif)
const S3_START = { x: 0, z: 300 };

// Area boleh-jalan robot: di dalam pagar, di luar AABB Monas. Bak air mancur
// TIDAK dicek di sini (pejal via resolveObstacles + nav-grid bak-pejal —
// campaignRobotAI tidak punya vault survival).
function parkWalk(x, z, r) {
    return Math.abs(x) < PARK.hx - r - 2 && Math.abs(z) < PARK.hz - r - 2
        && !(Math.abs(x) < 25 + r && Math.abs(z) < 25 + r);
}

// Sebar robot taman (rejection sampling ala stage 2): campuran varian, tidak
// ada yang lahir dekat titik masuk player.
function placeRobots() {
    const pts = [];
    const put = (x, z, kind) => {
        _v3.set(x, 0, z);
        resolveObstacles(_v3, 4, 0);            // geser keluar pohon/bak
        x = _v3.x; z = _v3.z;
        if (!parkWalk(x, z, 4)) return false;
        if (Math.hypot(x - S3_START.x, z - S3_START.z) < 180) return false;
        for (let i = 0; i < pts.length; i++)
            if (Math.hypot(x - pts[i].x, z - pts[i].z) < 42) return false;
        pts.push({ x, z });
        spawnCampaignRobot(x, z, 3, kind);
        return true;
    };
    const total = CFG.campaign.stage3Robots;
    let placed = 0, tries = 0;
    while (placed < total && tries++ < 900) {
        // Campuran varian: 60% walker, 25% runner, 10% brute, 5% exploder
        const r = Math.random();
        const kind = r < 0.05 ? 'exploder' : r < 0.15 ? 'brute' : r < 0.4 ? 'runner' : 'walker';
        if (put(rand(-PARK.hx + 40, PARK.hx - 40), rand(-PARK.hz + 40, PARK.hz - 40), kind)) placed++;
    }
}

export const stage3Scene = {
    id: 'campaign-3',

    // Transisi dari stage 2 (jalan raya bersih + boss tumbang)
    enter() {
        ensureParkWorld();
        // Bersihkan sisa robot stage 2 diam-diam (pola transisi stage 1 -> 2)
        for (let i = robots.length - 1; i >= 0; i--) {
            if (robots[i].stage === 2) {
                disposeRobot(robots[i]);
                scene.remove(robots[i].mesh);
                robots.splice(i, 1);
            }
        }
        placeRobots();
        applyLightPreset(scene, 'night');
        camera.position.set(S3_START.x, CFG.player.eyeHeight, S3_START.z);
        camera.quaternion.set(0, 0, 0, 1);   // hadap Monas (utara)
        player.vy = 0; player.onGround = true;
        showStageMsg('THE HIGHWAY LED YOU HOME — CLEAR MONAS PARK');
        updateUI();
    },

    // Mati di stage 3 -> campaign SELALU mengulang dari stage 1
    restartScene: () => stage1Scene,

    // Dinding player = pola survival: pagar (clamp), Monas (AABB revert),
    // pohon + dinding bak (pejal)
    playerCollide(pos, oldX, oldZ, feetY) {
        const bx = PARK.hx - player.radius - 2, bz = PARK.hz - player.radius - 2;
        pos.x = clamp(pos.x, -bx, bx);
        pos.z = clamp(pos.z, -bz, bz);
        if (Math.abs(pos.x) < 25 && Math.abs(pos.z) < 25) {
            pos.x = oldX; pos.z = oldZ;
        }
        resolveObstacles(pos, player.radius, feetY);
    },

    groundHeight: groundHeightAt,

    // Peluru mati di badan Monas (sama dgn survival)
    bulletBlocked(b) {
        return Math.abs(b.mesh.position.x) < 22 && Math.abs(b.mesh.position.z) < 22
            && b.mesh.position.y < 35;
    },

    grenadeCollide(g, oldGX, oldGZ) {
        const nbx = PARK.hx - 3, nbz = PARK.hz - 3;
        if (Math.abs(g.mesh.position.x) > nbx) {
            g.mesh.position.x = clamp(g.mesh.position.x, -nbx, nbx);
            g.vx = -g.vx * 0.45;
        }
        if (Math.abs(g.mesh.position.z) > nbz) {
            g.mesh.position.z = clamp(g.mesh.position.z, -nbz, nbz);
            g.vz = -g.vz * 0.45;
        }
        if (Math.abs(g.mesh.position.x) < 23 && Math.abs(g.mesh.position.z) < 23
            && g.mesh.position.y < 35) {
            g.mesh.position.x = oldGX; g.mesh.position.z = oldGZ;
            g.vx = -g.vx * 0.45; g.vz = -g.vz * 0.45;
        }
        resolveObstacles(g.mesh.position, NADE_R, g.mesh.position.y - NADE_R);
    },

    // AI campaign generik (idle -> aktif jarak -> kejar) di medan taman;
    // nav-grid versi bak-PEJAL (tanpa vault) — robot memutari air mancur.
    robotAI(z, dt, step) {
        return campaignRobotAI(z, dt, step, {
            walkable: parkWalk, resolve: resolveObstacles, nav: getParkNavSolidFountain()
        });
    },

    clampDropPos(x, z) {
        return [clamp(x, -PARK.hx + 10, PARK.hx - 10), clamp(z, -PARK.hz + 10, PARK.hz - 10)];
    },

    hudStatus() { return `Robots left: ${countStageRobots(3)}`; },

    // Monas = penanda pusat (dijepit ke tepi radar saat jauh)
    radarLandmarks(plot) {
        plot(-camera.position.x, -camera.position.z, "#bbbbbb", 4, true);
    },

    checkWin() {
        if (countStageRobots(3) === 0) gameOver(true);
    },
};
