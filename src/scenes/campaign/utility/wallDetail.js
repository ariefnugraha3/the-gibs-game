// Detail arsitektur dinding campaign. Collider tetap dimiliki scene; helper ini
// hanya menambahkan kulit visual ke batch statis supaya sel `#` tidak terbaca
// sebagai kubus placeholder tanpa menambah draw call per panel.

const FACE_EPS = 0.18;

// `detailAdd` (opsional) memisahkan KULIT muka dinding dari BADAN dinding.
// Pemanggil yang peduli biaya shadow pass memberi versi tanpa `castShadow`:
// panel/seam/rib menempel rata di muka dinding, jadi bayangannya tertutup
// dinding itu sendiri — menggambarnya ke shadow map murni pemborosan. Tanpa
// argumen ini perilakunya identik dengan sebelumnya.
export function buildDetailedWallCell(add, {
    c, r, x, z, cell, wallH, isWall, body, panel, steel, ink, accent,
    accentEvery = 13, detailAdd,
}) {
    add(cell, wallH, cell, x, wallH / 2, z, body);
    const dAdd = detailAdd || add;
    let details = 0;
    const faces = [
        { dc: -1, dr: 0, axis: 'x', sign: -1 },
        { dc: 1, dr: 0, axis: 'x', sign: 1 },
        { dc: 0, dr: -1, axis: 'z', sign: -1 },
        { dc: 0, dr: 1, axis: 'z', sign: 1 },
    ];
    const hash = Math.abs(c * 37 + r * 61);

    for (const face of faces) {
        if (isWall(c + face.dc, r + face.dr)) continue;
        const along = cell - 2.2;
        const facePos = face.sign * (cell / 2 + FACE_EPS);
        if (face.axis === 'x') {
            dAdd(0.48, wallH - 5.4, along, x + facePos, wallH / 2 + 0.2, z, panel);
            dAdd(0.72, 2.8, cell - 0.7, x + facePos + face.sign * 0.08, 2.1, z, ink);
            dAdd(0.68, 1.2, cell - 1, x + facePos + face.sign * 0.1, wallH - 2.1, z, steel);
            for (const y of [7.1, 14.4])
                dAdd(0.72, 0.65, along - 0.5, x + facePos + face.sign * 0.11, y, z, steel);
            for (const dz of [-cell * 0.29, cell * 0.29])
                dAdd(0.72, wallH - 6.6, 0.72, x + facePos + face.sign * 0.12,
                    wallH / 2 + 0.3, z + dz, steel);
            if (accent && hash % accentEvery === 0)
                dAdd(0.76, 3.1, cell * 0.22, x + facePos + face.sign * 0.14,
                    5.3, z + cell * 0.17, accent);
        } else {
            dAdd(along, wallH - 5.4, 0.48, x, wallH / 2 + 0.2, z + facePos, panel);
            dAdd(cell - 0.7, 2.8, 0.72, x, 2.1, z + facePos + face.sign * 0.08, ink);
            dAdd(cell - 1, 1.2, 0.68, x, wallH - 2.1, z + facePos + face.sign * 0.1, steel);
            for (const y of [7.1, 14.4])
                dAdd(along - 0.5, 0.65, 0.72, x, y, z + facePos + face.sign * 0.11, steel);
            for (const dx of [-cell * 0.29, cell * 0.29])
                dAdd(0.72, wallH - 6.6, 0.72, x + dx, wallH / 2 + 0.3,
                    z + facePos + face.sign * 0.12, steel);
            if (accent && hash % accentEvery === 0)
                dAdd(cell * 0.22, 3.1, 0.76, x + cell * 0.17, 5.3,
                    z + facePos + face.sign * 0.14, accent);
        }
        details += 7 + (accent && hash % accentEvery === 0 ? 1 : 0);
    }
    return details;
}
