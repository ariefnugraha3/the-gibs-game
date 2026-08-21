// Campaign Stage 9 — KERTAJATI AIRPORT ESCAPE facade.
//
// `activeScene` remains this facade for the whole stage. Chapter 1 (front
// road), Chapter 2 (terminal interior), and Chapter 3 (runway) are internal
// sub-scenes with independent roots, collision/nav spaces and light sets.

import { CFG } from '../../../../core/config.js';
import { scene } from '../../../../core/renderer.js';
import { updateUI } from '../../../../core/hud.js';
import { saveCampaignStage } from '../../../../core/saveGame.js';
import { resetCrates, spawnCrate } from '../../../../entities/crates.js';
import { resetBarrels, spawnBarrel } from '../../../../entities/barrels.js';
import { spawnAmmoDrop, spawnMedkitDrop } from '../../../../entities/drops.js';
import { applyLightPreset } from '../../../../world/lighting.js';
import { stopMusic } from '../../../../utils/sfx.js';
import { enterCityEnv } from '../../utility/cityscape.js';
import { campaignAwardKill, countStageRobots } from '../../utility/common.js';
import { beginStageTransition, campaignJumpToStage } from '../../utility/transition.js';
import { stage1Scene } from '../stage1/index.js';
import { stage10Scene } from '../stage10/index.js';
import {
    ensureStage9World, stage9WorldDebug, stage9SupplyPlacements,
    stage9SetFuelPumpOn, stage9SetMarkers, stage9UpdateWorld,
    resetStage9Occluders,
} from './world.js';
import {
    STAGE9_DIALOGUE, sub, cine, enterStage9Sub, updateStage9SubFade,
    updateStage9Dialogue, resetStage9Dialogue, resetStage9Runtime,
    cleanupStage9Cine, clearStage9Robots, addStage9Time,
    setStage9CompletionHook, stage9RuntimeDebug,
} from './runtime.js';
import { frontScene } from './front.js';
import { interiorScene } from './interior.js';
import { runwayScene } from './runway.js';

export { ensureStage9World, stage9WorldDebug } from './world.js';
export { STAGE9_DIALOGUE, frontScene, interiorScene, runwayScene };

function activeSub() { return sub || frontScene; }

function placeSupplies() {
    const placements = stage9SupplyPlacements();
    const C = CFG.campaign.stage9;
    for (const p of placements.crates.slice(0, C.lootboxCount)) spawnCrate(p.x, p.z, 0);
    for (const p of placements.barrels.slice(0, C.barrelCount)) spawnBarrel(p.x, p.z, 0);
    for (const p of placements.drops) {
        if (p.type === 'ammo') spawnAmmoDrop(p.x, p.z, p.weapon, 1e9);
        else spawnMedkitDrop(p.x, p.z, 1e9);
    }
}

function resetStage() {
    resetStage9Runtime();
    stage9SetFuelPumpOn(false);
    stage9SetMarkers([]);
    resetStage9Occluders();
    stage9UpdateWorld(0, 0, 0, false, 0);
}

export function stage9Debug() {
    return { ...stage9RuntimeDebug(), world: stage9WorldDebug() };
}

export const stage9Scene = {
    id: 'campaign-9',
    lightsKey: 'campaign-9',

    enter() {
        saveCampaignStage(9);
        ensureStage9World(scene);
        setStage9CompletionHook(() => beginStageTransition(stage10Scene));
        clearStage9Robots();
        resetCrates();
        resetBarrels();
        resetStage();
        placeSupplies();
        applyLightPreset(scene, 'night');
        enterCityEnv({ background: 0x50606a, fogColor: 0x46555a,
            fogNear: 260, fogFar: 1800 });
        enterStage9Sub(frontScene, { fade: false });
        updateUI();
    },

    exit() {
        activeSub()?.exit?.();
        resetStage9Dialogue();
        if (cine) cleanupStage9Cine(0);
        stage9SetMarkers([]);
        stopMusic();
    },

    restartScene: () => stage1Scene,
    cheatSkipToStage: n => campaignJumpToStage(n),
    awardKill: campaignAwardKill,

    updateMode(dt) {
        addStage9Time(dt);
        updateStage9SubFade();
        updateStage9Dialogue(dt);
        activeSub().updateMode(dt);
        updateUI();
    },

    playerCollide(pos, oldX, oldZ, feetY) {
        activeSub().playerCollide(pos, oldX, oldZ, feetY);
    },
    groundHeight(x, z, feetY) { return activeSub().groundHeight(x, z, feetY); },
    get camOffset() { return activeSub().camOffset || null; },
    bulletBlocked(b) { return activeSub().bulletBlocked(b); },
    blastBlocked(x0, z0, x1, z1, y = 0) {
        return activeSub().blastBlocked(x0, z0, x1, z1, y);
    },
    grenadeCollide(g, oldX, oldZ) { activeSub().grenadeCollide(g, oldX, oldZ); },
    robotAI(robot, dt, step) { return activeSub().robotAI(robot, dt, step); },
    clampRobot(robot, oldX, oldZ) { activeSub().clampRobot(robot, oldX, oldZ); },
    clampDropPos(x, z) { return activeSub().clampDropPos(x, z); },
    hudStatus() { return activeSub().hudStatus(); },
    radarLandmarks(plot) { activeSub().radarLandmarks(plot); },
    countStageRobots: () => countStageRobots(9),
};
