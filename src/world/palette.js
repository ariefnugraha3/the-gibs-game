// ============================================================
// palette.js — PANDUAN GAYA VISUAL "GIBS 2045" (patokan tunggal)
// ============================================================
// Tema: Jakarta tahun 2045, "agak futuristis tapi tidak terlalu" —
// kota nyata yang sedang diinvasi, BUKAN arcade cyberpunk.
//
// ATURAN (berlaku untuk semua aset visual baru/lama):
// 1. DUNIA HANGAT & BERDEBU — dasar material memakai abu-abu hangat
//    (beton/gunmetal keluarga ini), TANPA hitam murni (< 0x141414)
//    dan TANPA biru-hitam dingin (0x0a0e1a dkk).
// 2. SATU aksen teknologi sipil: TEAL pudar (PAL.tech) — semua layar,
//    strip lampu, touchpad, holo. DILARANG cyan murni 0x00ffff,
//    magenta 0xff00ff, dan neon underglow.
// 3. Aksen manusia/pemain: AMBER (PAL.amber) — senada HUD, syal
//    avatar, marka bahaya, lampu kota. Merah-putih (PAL.hazard +
//    PAL.white) untuk sentuhan nasional (livery/marka), hemat.
// 4. Emissive LINGKUNGAN maksimum EMISSIVE_MAX (0.9) — hanya efek
//    tempur (ledakan/muzzle/telegraph boss) yang boleh lebih terang.
// 5. WARNA SINYAL GAMEPLAY itu SAKRAL, jangan dipakai untuk dekorasi:
//    mata robot merah 0xff2020, armor kelas C hijau / B kuning /
//    A merah, coolant hijau, darah player merah, plasma musuh biru,
//    tanda EXIT terbuka hijau 0x2eff6a.
// ============================================================

export const PAL = {
    // --- dasar / struktur ---
    ink: 0x23262b,       // trim & bagian tergelap (pengganti hitam murni)
    gunmetal: 0x3a4046,  // logam utama prop/mesin (senada serpihan robot 0x3d444c)
    steel: 0x7c848c,     // logam terang (senada rangka robot)
    panel: 0xb8b2a6,     // panel/beton pucat hangat
    concrete: 0x8a8378,  // beton berdebu
    rubber: 0x161618,    // karet ban/segel (batas gelap yang diizinkan)
    wood: 0x6b4a29,      // kayu jati hangat
    leaf: 0x3e6b2a,      // daun tropis (senada pohon taman 0x2a5c20)

    // --- aksen teknologi sipil (SATU-SATUNYA emissive lingkungan) ---
    tech: 0x2fb8a6,      // teal pudar — layar aktif/strip/touchpad
    techDim: 0x0f3b36,   // teal gelap — perangkat standby
    screenBg: 0x0d2320,  // latar kaca layar mati

    // --- aksen manusia/pemain ---
    amber: 0xffb03b,     // amber — senada HUD & syal avatar
    amberDim: 0x8a5a14,  // amber redup (emissive lemah/bara)
    hazard: 0xb3402e,    // merah-bata — marka bahaya / merah(-putih)
    white: 0xd8d2c4,     // putih hangat — panel terang / merah-putih
};

// Emissive lingkungan tidak boleh melebihi ini (aturan #4).
export const EMISSIVE_MAX = 0.9;

// Warna sinyal gameplay (reserved — deteksi pelanggaran di smoke test).
export const RESERVED_HEX = [0xff2020, 0x2eff6a];

// Neon terlarang (aturan #2) — smoke test menegakkan ini.
export const FORBIDDEN_HEX = [0x00ffff, 0xff00ff];
