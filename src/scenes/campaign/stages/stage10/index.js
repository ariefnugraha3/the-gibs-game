// Campaign Stage 10 facade — one eight-minute top-down aircraft battle in the
// shape of the user's Air Strike 1944 reference. The facade id stays
// `campaign-10` so Stage 9, checkpoint saves, the campaign shop gateway and
// Stage 11 remain unchanged while the old port/forest chapters are no longer
// imported or entered.

import { scene } from '../../../../core/renderer.js';
import {
    ensureStage10FlightWorld, stage10FlightWorldDebug,
    STAGE10_FLIGHT_KEY,
} from './flightWorld.js';

export {
    stage10Scene, stage10Debug,
    stage10FlightSpawnEnemy, stage10FlightSpawnWave, stage10FlightSpawnGround,
    stage10FlightClearEnemies, stage10FlightSetElapsed,
    stage10FlightDamageEnemy, stage10FlightDamageGround, stage10FlightDamageBoss,
    stage10FlightDamagePlayer, stage10FlightSetPlayerHp,
    stage10FlightGrantDrop, stage10FlightUseBomb,
} from './flight.js';
export { stage10FlightWorldDebug, STAGE10_FLIGHT_KEY };

export function ensureStage10World(parent = scene) {
    return ensureStage10FlightWorld(parent);
}
