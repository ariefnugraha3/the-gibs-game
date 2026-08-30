// Stage 11 Chapters 2-3 share one southeast gameplay camera. The city axis
// and root threshold both progress predominantly toward world -X, so this
// azimuth projects the route toward the upper-left of the screen.

import { CAM_OFF_DEFAULT } from '../../../../core/renderer.js';

export const STAGE11_CHAPTER_CAMERA = Object.freeze({
    x: Math.abs(CAM_OFF_DEFAULT.x),
    y: CAM_OFF_DEFAULT.y,
    z: Math.abs(CAM_OFF_DEFAULT.z),
});

export function stage11ChapterScreenDirection(from, to) {
    const C = STAGE11_CHAPTER_CAMERA;
    const h = Math.hypot(C.x, C.z) || 1;
    const upX = -C.x / h, upZ = -C.z / h;
    const leftX = upZ, leftZ = -upX;
    const dx = to.x - from.x, dz = to.z - from.z;
    return {
        up: dx * upX + dz * upZ,
        left: dx * leftX + dz * leftZ,
    };
}
