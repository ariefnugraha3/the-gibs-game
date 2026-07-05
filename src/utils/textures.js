// Tekstur prosedural (canvas, tanpa file eksternal) — dipakai semua world builder.

// Peta warna dari fungsi gambar canvas; di-flag sRGB (canvas = warna tampilan).
export function makeTexture(w, h, draw, repX = 1, repY = 1) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
}

// Bercak acak (noise murah) di atas warna dasar canvas
export function speckle(g, w, h, colors, n, sMin, sMax) {
    for (let i = 0; i < n; i++) {
        g.fillStyle = colors[(Math.random() * colors.length) | 0];
        const s = sMin + Math.random() * (sMax - sMin);
        g.globalAlpha = 0.2 + Math.random() * 0.5;
        g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    g.globalAlpha = 1;
}

// Normal map prosedural dari heightmap canvas (kanal merah = tinggi, dgn wrap).
// Catatan r128: transform UV (repeat/offset) diambil dari material.map, jadi
// normal map otomatis mengikuti repeat milik map diffuse — tekstur bisa dishare.
export function makeNormalMap(w, h, drawHeight, strength = 2) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    drawHeight(g, w, h);
    const src = g.getImageData(0, 0, w, h);
    const out = g.createImageData(w, h);
    const hgt = (x, y) => src.data[(((y + h) % h) * w + ((x + w) % w)) * 4];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = (hgt(x - 1, y) - hgt(x + 1, y)) / 255 * strength;
            const dy = (hgt(x, y - 1) - hgt(x, y + 1)) / 255 * strength;
            const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
            const i = (y * w + x) * 4;
            out.data[i] = (dx * inv * 0.5 + 0.5) * 255;
            out.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
            out.data[i + 2] = inv * 255;
            out.data[i + 3] = 255;
        }
    }
    g.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;   // TANPA sRGB — normal map wajib linear
}

// Heightmap noise abu-abu generik utk makeNormalMap
export function noiseHeight(base, jitter, n, sMin, sMax) {
    return (g, w, h) => {
        g.fillStyle = `rgb(${base},${base},${base})`;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < n; i++) {
            const v = base + (Math.random() - 0.5) * 2 * jitter | 0;
            g.fillStyle = `rgb(${v},${v},${v})`;
            const s = sMin + Math.random() * (sMax - sMin);
            g.fillRect(Math.random() * w, Math.random() * h, s, s);
        }
    };
}
