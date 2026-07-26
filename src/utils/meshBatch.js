// THREE global (CDN r128); modul TIDAK meng-import THREE (aturan proyek).
// PENGGABUNG MESH STATIS (2026-07-26, permintaan user: perabot padat tapi berat).
//
// Perabot kampanye TIDAK PERNAH bergerak, tapi tiap prop dibangun sebagai grup
// berisi 2-40 mesh kecil dengan geometry+material SENDIRI-SENDIRI. Sesudah
// pemadatan perabot (169/148/96 entri tabel) itu jadi 4.632 mesh — tiap mesh
// biaya: satu update matriks + satu uji frustum + satu draw call per frame.
//
// `addMergedStatic` mengubur biaya itu: semua mesh dikelompokkan menurut
// PENAMPILAN material (tipe+warna+emissive+opacity+map+blending — BUKAN uuid,
// karena tiap builder membuat material baru untuk warna yang sama), lalu
// geometry tiap kelompok DIPANGGANG ke koordinat dunia dan disambung jadi SATU
// BufferGeometry. Hasilnya satu mesh per warna per stage (belasan, bukan ribuan)
// dengan piksel yang PERSIS SAMA — posisi, ukuran, warna, bayangan tak berubah.
//
// Yang TIDAK boleh lewat sini: apa pun yang bergerak/berubah visibilitas sendiri
// (pintu geser, mesin pabrik yang bisa dihancurkan, marker berdenyut, papan EXIT
// yang berganti warna, peti & barel yang bisa pecah). Perabot saja.
//
// CATATAN HARNESS: stub THREE di tools/smoke.mjs tak punya BufferAttribute/atribut
// geometry, jadi `canMerge()` gagal dan fungsi ini JATUH KEMBALI ke `parent.add`
// biasa — perilaku headless identik dengan sebelum optimasi (tes layout tetap sah).

// Bisa menggabung? (butuh BufferGeometry + BufferAttribute betulan)
export function canMerge() {
    return typeof THREE !== 'undefined'
        && typeof THREE.BufferGeometry === 'function'
        && typeof THREE.BufferAttribute === 'function';
}

// Kunci kelompok = PENAMPILAN material (dua material identik dari builder berbeda
// harus jatuh ke kelompok yang sama supaya benar-benar tergabung; beda sedikit pun
// — peta normal, specular, sisi — harus terpisah supaya render tak berubah).
export function materialKey(m) {
    const hex = (c) => (c && typeof c.getHex === 'function') ? c.getHex() : 0;
    const tex = (t) => t ? (t.uuid || 'tex') : '-';
    return [
        m.type || 'mat', hex(m.color), hex(m.emissive),
        m.emissiveIntensity != null ? m.emissiveIntensity : 1,
        m.transparent ? 1 : 0, m.opacity != null ? m.opacity : 1,
        m.side || 0, tex(m.map), tex(m.normalMap), tex(m.emissiveMap), tex(m.alphaMap),
        m.toneMapped === false ? 0 : 1, m.depthWrite === false ? 0 : 1,
        m.blending != null ? m.blending : 1, m.shininess != null ? m.shininess : '-',
        hex(m.specular), m.flatShading ? 1 : 0, m.vertexColors ? 1 : 0, m.wireframe ? 1 : 0,
    ].join('|');
}

// Material boleh digabung? Material TEMBUS PANDANG TIDAK: three menyortir
// transparansi PER-OBJEK, jadi menyatukan banyak kaca jadi satu mesh bisa
// membuat urutan tumpang-tindihnya salah. Biarkan kaca berdiri sendiri.
export function isBatchableMaterial(m) {
    return !!m && !Array.isArray(m) && m.transparent !== true;
}

// Nasib satu objek dalam penggabungan:
//   'merge'     = geometry-nya dipanggang & disatukan jadi satu Mesh,
//   'mergeLine' = LineSegments (mis. garis tepi amber krat) disatukan jadi SATU
//                 LineSegments — hanya LineSegments (menggambar pasangan titik);
//                 Line/LineLoop biasa TIDAK boleh disambung (polyline-nya akan
//                 tersambung silang),
//   'keep'  = TIDAK digabung tapi WAJIB tetap dipasang di posisi dunianya —
//             LineSegments (garis tepi krat!), PointLight (lampu jalan; kalau
//             hilang jumlah light berubah -> shader rekompilasi), sprite,
//             InstancedMesh (satu geometry dipakai banyak instance), kaca
//             transparan, mesh ber-material array/tanpa normal,
//   'skip'  = Group/Object3D pembungkus: strukturnya tak perlu dipertahankan.
export function classifyForBatch(o) {
    if (!o) return 'skip';
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) {
        const a = o.geometry && o.geometry.attributes;
        const ok = !!(a && a.position && a.position.array && a.normal && a.normal.array)
            && isBatchableMaterial(o.material);
        return ok ? 'merge' : 'keep';
    }
    if (o.isLineSegments) {
        const a = o.geometry && o.geometry.attributes;
        const ok = !!(a && a.position && a.position.array) && isBatchableMaterial(o.material);
        return ok ? 'mergeLine' : 'keep';
    }
    if (o.isMesh || o.isInstancedMesh || o.isLight || o.isSprite || o.isPoints || o.isLine) return 'keep';
    return 'skip';
}

// Geometry dunia: salin, buang index (biar bisa disambung lurus), panggang matriks.
function bakeGeometry(mesh) {
    const src = mesh.geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(mesh.matrixWorld);
    return g;
}

// Sambung daftar geometry (semua sudah non-index & terpanggang) jadi satu.
function concatGeometries(geos) {
    let n = 0;
    for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const withUV = geos.every(g => g.attributes.uv && g.attributes.uv.array);
    const uv = withUV ? new Float32Array(n * 2) : null;
    let o3 = 0, o2 = 0;
    for (const g of geos) {
        const c = g.attributes.position.count;
        pos.set(g.attributes.position.array, o3);
        nor.set(g.attributes.normal.array, o3);
        if (uv) uv.set(g.attributes.uv.array, o2);
        o3 += c * 3; o2 += c * 2;
        g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
}

// Sambung geometry GARIS (hanya atribut position).
function concatLineGeometries(geos) {
    let n = 0;
    for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    let o3 = 0;
    for (const g of geos) {
        pos.set(g.attributes.position.array, o3);
        o3 += g.attributes.position.count * 3;
        g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.computeBoundingSphere();
    return out;
}

// Tambahkan `objects` (grup/mesh prop STATIS yang posisinya sudah final) ke
// `parent` dalam bentuk sesedikit mungkin mesh. Mengembalikan daftar mesh yang
// benar-benar masuk scene (untuk tes/statistik).
export function addMergedStatic(parent, objects) {
    if (!objects || !objects.length) return [];
    if (!canMerge()) {                       // harness headless: perilaku lama
        for (const o of objects) parent.add(o);
        return objects.slice();
    }
    const buckets = new Map();               // key -> {mat, geos, cast, receive}
    const lineBuckets = new Map();           // key -> {mat, geos}  (LineSegments)
    const loose = [];                        // yang tak digabung tapi tetap dipakai
    for (const root of objects) {
        root.updateMatrixWorld(true);
        root.traverse(o => {
            const how = classifyForBatch(o);
            if (how === 'merge') {
                const key = materialKey(o.material);
                let b = buckets.get(key);
                if (!b) { b = { mat: o.material, geos: [], cast: false, receive: false }; buckets.set(key, b); }
                b.geos.push(bakeGeometry(o));
                b.cast = b.cast || o.castShadow;
                b.receive = b.receive || o.receiveShadow;
            } else if (how === 'mergeLine') {
                const key = materialKey(o.material);
                let b = lineBuckets.get(key);
                if (!b) { b = { mat: o.material, geos: [] }; lineBuckets.set(key, b); }
                b.geos.push(bakeGeometry(o));
            } else if (how === 'keep') loose.push(o);
        });
    }
    const out = [];
    for (const b of buckets.values()) {
        const mesh = new THREE.Mesh(concatGeometries(b.geos), b.mat);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.matrixAutoUpdate = false;       // statis: jangan hitung ulang matriks tiap frame
        mesh.updateMatrix();
        parent.add(mesh);
        out.push(mesh);
    }
    for (const b of lineBuckets.values()) {
        const seg = new THREE.LineSegments(concatLineGeometries(b.geos), b.mat);
        seg.matrixAutoUpdate = false;
        seg.updateMatrix();
        parent.add(seg);
        out.push(seg);
    }
    // Sisa yang tak layak gabung tetap dipasang di posisi DUNIA-nya (attach
    // mempertahankan transform saat berpindah induk).
    for (const o of loose) {
        if (typeof parent.attach === 'function') parent.attach(o); else parent.add(o);
        o.matrixAutoUpdate = false;
        o.updateMatrix();
        out.push(o);
    }
    return out;
}

// ===== GABUNG DI DALAM SATU OBJEK (mempertahankan transform & material sendiri) =====
// Dipakai untuk prop yang TIDAK boleh melebur dengan prop lain karena masih
// dialamatkan saat main — mis. mobil stage 4 yang MEMUDAR saat menutup pandangan
// (`registerOccluder` membaca `obj.position` dan me-nyetel opacity material objek
// itu). Geometry dipanggang ke ruang LOKAL objek, jadi:
//   - `position`/`rotation`/`scale` tetap di grup hasil (occluder & blocker aman),
//   - material tetap INSTANS MILIK OBJEK ITU (fade tetap per-objek),
//   - kaca transparan & PointLight anak TIDAK digabung, hanya dipindahkan.
// Mengembalikan grup baru (pakai INI saat `scene.add`, bukan objek aslinya).
export function mergeObjectInPlace(obj) {
    if (!canMerge() || !obj) return obj;
    obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const buckets = new Map();
    const lineBuckets = new Map();
    const keep = [];
    obj.traverse(o => {
        if (o === obj) return;
        const how = classifyForBatch(o);
        if (how === 'mergeLine') {
            const key = materialKey(o.material);
            let b = lineBuckets.get(key);
            if (!b) { b = { mat: o.material, geos: [] }; lineBuckets.set(key, b); }
            const src = o.geometry;
            const g = src.index ? src.toNonIndexed() : src.clone();
            g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
            b.geos.push(g);
        } else if (how === 'merge') {
            const key = materialKey(o.material);
            let b = buckets.get(key);
            if (!b) { b = { mat: o.material, geos: [], cast: false, receive: false }; buckets.set(key, b); }
            const src = o.geometry;
            const g = src.index ? src.toNonIndexed() : src.clone();
            g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
            b.geos.push(g);
            b.cast = b.cast || o.castShadow;
            b.receive = b.receive || o.receiveShadow;
        } else if (how === 'keep') keep.push(o);
    });
    if (!buckets.size && !lineBuckets.size) return obj;
    const out = new THREE.Group();
    out.position.copy(obj.position);
    out.quaternion.copy(obj.quaternion);
    out.scale.copy(obj.scale);
    out.visible = obj.visible;
    out.name = obj.name;
    out.userData = obj.userData;
    for (const b of buckets.values()) {
        const mesh = new THREE.Mesh(concatGeometries(b.geos), b.mat);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        out.add(mesh);
    }
    for (const b of lineBuckets.values()) {
        const seg = new THREE.LineSegments(concatLineGeometries(b.geos), b.mat);
        seg.matrixAutoUpdate = false;
        seg.updateMatrix();
        out.add(seg);
    }
    for (const o of keep) {                  // kaca/lampu: pindah dgn transform relatif sama
        rel.multiplyMatrices(inv, o.matrixWorld).decompose(o.position, o.quaternion, o.scale);
        out.add(o);
    }
    return out;
}
